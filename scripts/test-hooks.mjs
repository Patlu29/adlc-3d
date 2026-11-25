#!/usr/bin/env node
// Runs the adlc-3d hooks as Claude Code would, with fixture input, and checks what they return.
// Usage: node scripts/test-hooks.mjs

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks");
const work = mkdtempSync(join(tmpdir(), "adlc-3d-hooks-"));
const project = join(work, "app");
const plain = join(work, "not-adlc");
const offProject = join(work, "off");

function file(path, content = "") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

file(join(project, "docs", "project-status.md"), "# Project status\n");
file(join(offProject, "docs", "project-status.md"), "# Project status\n\nHooks: off\n");
file(join(plain, "README.md"), "");

// Fake credentials are assembled at run time so this file never contains a real-looking secret.
const FAKE = {
  aws: "AKIA" + "Q".repeat(16),
  awsExample: "AKIA" + "IOSFODNN7EXAMPLE",
  github: "gh" + "p_" + "a".repeat(36),
  stripeSecret: "sk_" + "live_" + "b".repeat(24),
  stripePublic: "pk_" + "live_" + "b".repeat(24),
  pem: "-----BEGIN " + "RSA PRIVATE KEY-----\n" + "MIIE".padEnd(64, "A") + "\n",
  pemHeader: "-----BEGIN " + "PRIVATE KEY-----",
};
const caseless = process.platform === "darwin" || process.platform === "win32";

function run(hook, input, env = {}) {
  const result = spawnSync(process.execPath, [join(HOOKS, hook)], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ADLC3D_HOOKS: "", ...env },
  });
  return { code: result.status, out: result.stdout.trim(), err: result.stderr.trim() };
}

function write(root, rel, content = "x", extra = {}) {
  return { tool_name: "Write", cwd: root, tool_input: { file_path: join(root, rel), content }, ...extra };
}

let failures = 0;
let count = 0;

function expectGuard(name, input, shouldDeny, env) {
  count += 1;
  const { code, out } = run("guard.mjs", input, env);
  let denied = false;
  let problem = "";
  if (code !== 0) problem = `exit code ${code}`;
  else if (out) {
    try {
      const decision = JSON.parse(out).hookSpecificOutput.permissionDecision;
      if (decision === "deny") denied = true;
      else problem = `returned "${decision}"; the guard may only deny`;
    } catch {
      problem = `unparseable output: ${out}`;
    }
  }
  if (!problem && denied !== shouldDeny) problem = shouldDeny ? "was allowed" : `was denied: ${out}`;
  if (problem) {
    failures += 1;
    console.error(`FAIL guard: ${name}: ${problem}`);
  }
}

function expectReview(name, input, expected) {
  count += 1;
  const { code, out } = run("review.mjs", input);
  const context = out ? JSON.parse(out).hookSpecificOutput.additionalContext : "";
  let problem = code !== 0 ? `exit code ${code}` : "";
  for (const [text, present] of expected) {
    if (context.includes(text) !== present)
      problem ||= `${present ? "missing" : "unexpected"} "${text}" in: ${context || "(no output)"}`;
  }
  if (problem) {
    failures += 1;
    console.error(`FAIL review: ${name}: ${problem}`);
  }
}

const architect = { agent_type: "adlc-3d:architect" };

// Scope and failure handling
expectGuard("non-ADLC folder is ignored", write(plain, ".env", "A=1"), false);
expectGuard("malformed input fails open", "{not json", false);
expectGuard("empty input fails open", "", false);
expectGuard("missing file_path fails open", { tool_name: "Write", tool_input: {} }, false);
expectGuard("ADLC3D_HOOKS=off disables the guard", write(project, ".env", "A=1"), false, { ADLC3D_HOOKS: "off" });
expectGuard("Hooks: off in project-status disables the guard", write(offProject, ".env", "A=1"), false);
expectGuard("relative path resolves against cwd", { tool_name: "Write", cwd: project, tool_input: { file_path: "dist/a.js", content: "" } }, true);
expectGuard("subfolder cwd still finds the project", { tool_name: "Write", cwd: join(project, "src"), tool_input: { file_path: join(project, "dist", "a.js"), content: "" } }, true);

// Generated, user-owned and secret files
expectGuard(".env is blocked", write(project, ".env", "A=1"), true);
expectGuard(".env.local is blocked", write(project, ".env.local"), true);
expectGuard(".env.production is blocked", write(project, ".env.production"), true);
expectGuard(".env.staging.local is blocked", write(project, ".env.staging.local"), true);
expectGuard(".env.example is allowed", write(project, ".env.example", "VITE_API_URL="), false);
expectGuard(".env.development is allowed", write(project, ".env.development", "VITE_DEBUG=true"), false);
expectGuard(".env.test is allowed", write(project, ".env.test"), false);
expectGuard("dist/ is blocked", write(project, "dist/index.js"), true);
expectGuard("dist-test/ is blocked", write(project, "dist-test/index.js"), true);
expectGuard("node_modules/ is blocked", write(project, "node_modules/x/index.js"), true);
expectGuard("test-results/ is blocked", write(project, "test-results/a.txt"), true);
expectGuard("a nested dist folder is allowed", write(project, "docs/dist/notes.md"), false);
expectGuard("docs/qa-report.md is allowed", write(project, "docs/qa-report.md"), false);
expectGuard("package-lock.json is blocked", write(project, "package-lock.json"), true);
expectGuard("assets/source/ is blocked", write(project, "assets/source/model.blend"), true);

// Tech Lead files
expectGuard("project-status by a plugin agent is blocked", write(project, "docs/project-status.md", "x", architect), true);
expectGuard("project-status by a short agent name is blocked", write(project, "docs/project-status.md", "x", { agent_type: "qa-engineer" }), true);
expectGuard("lifecycle docs by an agent are blocked", write(project, "docs/lifecycle/traceability.md", "x", architect), true);
expectGuard("project-status by the Tech Lead is allowed", write(project, "docs/project-status.md"), false);
expectGuard("lifecycle docs by the Tech Lead are allowed", write(project, "docs/lifecycle/retrospective.md"), false);
expectGuard("tracker files by an agent are blocked", write(project, "docs/tracker/board.md", "x", { agent_type: "adlc-3d:code-reviewer" }), true);

// Secrets in new content
expectGuard("AWS key is blocked", write(project, "src/config.ts", `const k = "${FAKE.aws}";`), true);
expectGuard("AWS documentation example is allowed", write(project, "docs/deployment.md", FAKE.awsExample), false);
expectGuard("GitHub token is blocked", write(project, "docs/deployment.md", FAKE.github), true);
expectGuard("ClickUp token is blocked", write(project, "docs/deployment.md", `CLICKUP_API_TOKEN=${["pk", "8812345", "Q".repeat(32)].join("_")}`), true);
expectGuard("Google API key is blocked", write(project, "src/maps.ts", `const k = "${"AIza" + "S".repeat(35)}";`), true);
expectGuard("npm token is blocked", write(project, ".npmrc", `//registry.npmjs.org/:_authToken=${"npm_" + "x".repeat(36)}`), true);
expectGuard("JSON Web Token is blocked", write(project, "tests/e2e/auth.spec.ts", `const t = "${["eyJ" + "a".repeat(20), "eyJ" + "b".repeat(20), "c".repeat(30)].join(".")}";`), true);
expectGuard("hard-coded password is blocked", write(project, "server/db.ts", `const config = { password: "${"Tr0ub4dor" + "&3x"}" };`), true);
expectGuard("DB_PASSWORD assignment is blocked", write(project, "docker-compose.yml", `DB_PASSWORD="${"Tr0ub4dor" + "&3x"}"`), true);
expectGuard("JSON password key is blocked", write(project, "server/seed.json", `{ "password": "${"Tr0ub4dor" + "&3x"}" }`), true);
expectGuard("seeded test login under tests/ is allowed", write(project, "tests/e2e/login.spec.ts", 'await page.fill("#pw", "x"); const user = { password: "TestPass123!" };'), false);
expectGuard("a working-directory path is allowed", write(project, "scripts/run.ts", 'const opts = { pwd: "/workspace/app" };'), false);
expectGuard("password placeholder is allowed", write(project, "docs/deployment.md", 'Set `password: "<from the secret store>"` in the host settings.'), false);
expectGuard("password read from the environment is allowed", write(project, "server/db.ts", "const password = process.env.DB_PASSWORD;"), false);
expectGuard("ClickUp token variable name alone is allowed", write(project, "docs/deployment.md", "Set CLICKUP_API_TOKEN in your shell."), false);
expectGuard("Stripe secret key is blocked", write(project, "server/pay.ts", FAKE.stripeSecret), true);
expectGuard("Stripe publishable key is allowed", write(project, "src/pay.ts", FAKE.stripePublic), false);
expectGuard("private key in src is blocked", write(project, "src/key.ts", FAKE.pem), true);
expectGuard("a private key header named in docs is allowed", write(project, "docs/deployment.md", `Paste the key, which starts with ${FAKE.pemHeader}, into the secret store.`), false);
if (caseless) {
  expectGuard(".ENV in upper case is blocked", write(project, ".ENV", "A=1"), true);
  expectGuard("Docs/project-status.md in mixed case is blocked for agents", write(project, "Docs/Project-Status.md", "x", architect), true);
}
expectGuard("private key in a test fixture is allowed", write(project, "tests/unit/server/fixtures/key.pem", FAKE.pem), false);
expectGuard("secret in Edit new_string is blocked", { tool_name: "Edit", cwd: project, tool_input: { file_path: join(project, "src/a.ts"), old_string: "a", new_string: FAKE.aws } }, true);
expectGuard("secret only in Edit old_string is allowed", { tool_name: "Edit", cwd: project, tool_input: { file_path: join(project, "src/a.ts"), old_string: FAKE.aws, new_string: "process.env.KEY" } }, false);
expectGuard("secret in MultiEdit edits is blocked", { tool_name: "MultiEdit", cwd: project, tool_input: { file_path: join(project, "src/a.ts"), edits: [{ old_string: "a", new_string: "b" }, { old_string: "c", new_string: FAKE.github }] } }, true);
expectGuard("ordinary source is allowed", write(project, "src/scene/Scene.tsx", "export function Scene() { return null; }", { agent_type: "adlc-3d:scene-developer" }), false);

// Review: ownership warnings and code-rules hits
file(join(project, "src/scene/Camera.ts"), "export const DISTANCE = 5;\n");
file(join(project, "src/ui/Panel.tsx"), "export function Panel() {\n  console.log('x');\n  const a: any = 1;\n  // eslint-disable-next-line no-console -- needed for the demo\n  return a;\n}\n");
file(join(project, "docs/handoffs/qa-engineer.md"), "# Handoff\n");
file(join(project, "tests/e2e/deployed.spec.ts"), 'test.skip(!process.env.PLAYWRIGHT_BASE_URL, "needs a deployed address");\ntest.skip();\nconst note = "Note: any value";\n');
file(join(plain, "src/ui/Panel.tsx"), "console.log('x');\n");

const edit = (root, rel, agent) => ({ tool_name: "Edit", cwd: root, tool_input: { file_path: join(root, rel), old_string: "a", new_string: "b" }, ...(agent ? { agent_type: agent } : {}) });

expectReview("owner editing own path gets no warning", edit(project, "src/scene/Camera.ts", "adlc-3d:scene-developer"), [["owned by", false]]);
expectReview("another agent's path gets a warning", edit(project, "src/scene/Camera.ts", "adlc-3d:frontend-developer"), [["owned by scene-developer", true]]);
expectReview("short agent name is recognised", edit(project, "src/scene/Camera.ts", "frontend-developer"), [["owned by scene-developer", true]]);
expectReview("the Tech Lead gets no ownership warning", edit(project, "src/scene/Camera.ts"), [["owned by", false]]);
expectReview("performance-optimiser exception", edit(project, "src/scene/Camera.ts", "adlc-3d:performance-optimiser"), [["owned by", false]]);
expectReview("code-reviewer writing its review gets no warning", edit(project, "docs/code-review.md", "adlc-3d:code-reviewer"), [["owned by", false]]);
expectReview("code-reviewer editing source gets a warning", edit(project, "src/scene/Camera.ts", "adlc-3d:code-reviewer"), [["owned by scene-developer", true]]);
expectReview("own handoff note gets no warning", edit(project, "docs/handoffs/qa-engineer.md", "adlc-3d:qa-engineer"), [["owned by", false]]);
expectReview("another agent's handoff note gets a warning", edit(project, "docs/handoffs/qa-engineer.md", "adlc-3d:architect"), [["owned by qa-engineer", true]]);
expectReview("an agent from another plugin is ignored", edit(project, "src/ui/Panel.tsx", "other-plugin:helper"), [["adlc-3d review", false]]);
expectReview("code-rules hits are listed", edit(project, "src/ui/Panel.tsx", "adlc-3d:frontend-developer"), [["line 2: console.log", true], ["line 3: any type", true], ["eslint-disable without a reason", false]]);
expectReview("conditional skip with a reason is allowed, bare skip is not, prose in strings is ignored", edit(project, "tests/e2e/deployed.spec.ts", "adlc-3d:qa-engineer"), [["line 1:", false], ["line 2: .skip without a reason", true], ["line 3:", false]]);
expectReview("non-ADLC folder is ignored", edit(plain, "src/ui/Panel.tsx", "adlc-3d:frontend-developer"), [["adlc-3d review", false]]);
expectReview("malformed input fails open", "{oops", [["adlc-3d review", false]]);

rmSync(work, { recursive: true, force: true });

if (failures) {
  console.error(`\n${failures} of ${count} hook checks failed.`);
  process.exit(1);
}
console.log(`All ${count} hook checks passed.`);
