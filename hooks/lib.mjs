// Shared helpers for the adlc-3d hooks.
//
// Safety rules for every hook in this folder:
// - Act only on files inside an ADLC project: a folder with docs/project-status.md
// - Never answer "allow"; that would skip the user's permission prompts. Deny or say nothing
// - Fail open: any error, missing input or unexpected shape means exit 0 with no output

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const PLUGIN = "adlc-3d";
export const STATUS_FILE = join("docs", "project-status.md");

export const AGENTS = [
  "architect",
  "backend-developer",
  "code-reviewer",
  "devops-engineer",
  "frontend-developer",
  "performance-optimiser",
  "product-manager",
  "qa-engineer",
  "scene-developer",
  "security-engineer",
  "technical-artist",
  "ux-ui-designer",
];

const CODE_AUTHORS = ["scene-developer", "technical-artist", "frontend-developer", "backend-developer", "performance-optimiser"];

// Folder ownership, kept in sync with the table in skills/team-conventions/SKILL.md.
// The longest matching prefix wins. Entries ending in "/" match a folder; others match one file.
export const OWNERSHIP = [
  ["docs/requirements/", ["product-manager"]],
  ["docs/architecture.md", ["architect"]],
  ["docs/decisions/", ["architect"]],
  ["docs/review.md", ["architect"]],
  ["package.json", ["architect"]],
  ["index.html", ["architect"]],
  [".gitignore", ["architect"]],
  [".env.example", ["architect"]],
  [".nvmrc", ["architect"]],
  ["docs/design-spec.md", ["ux-ui-designer"]],
  ["src/styles/", ["ux-ui-designer"]],
  ["src/scene/", ["scene-developer"]],
  ["src/scene/shaders/", ["technical-artist"]],
  ["src/scene/materials/", ["technical-artist"]],
  ["public/models/", ["technical-artist"]],
  ["public/textures/", ["technical-artist"]],
  ["public/env/", ["technical-artist"]],
  ["public/draco/", ["technical-artist"]],
  ["public/basis/", ["technical-artist"]],
  ["src/ui/", ["frontend-developer"]],
  ["src/state/", ["frontend-developer"]],
  ["src/hooks/", ["frontend-developer"]],
  ["src/data/", ["frontend-developer"]],
  ["src/App.tsx", ["frontend-developer"]],
  ["src/main.tsx", ["frontend-developer"]],
  ["server/", ["backend-developer"]],
  ["docs/api.md", ["backend-developer"]],
  ["docs/performance.md", ["performance-optimiser"]],
  ["tests/e2e/", ["qa-engineer"]],
  ["playwright.config.ts", ["qa-engineer"]],
  ["docs/qa-report.md", ["qa-engineer"]],
  ["docs/code-review.md", ["code-reviewer"]],
  ["docs/security/", ["security-engineer"]],
  ["tests/unit/", CODE_AUTHORS],
  [".github/", ["devops-engineer"]],
  ["infra/", ["devops-engineer"]],
  ["netlify.toml", ["devops-engineer"]],
  ["vercel.json", ["devops-engineer"]],
  ["public/_headers", ["devops-engineer"]],
  ["public/_redirects", ["devops-engineer"]],
  ["docs/deployment.md", ["devops-engineer"]],
  ["CHANGELOG.md", ["devops-engineer"]],
];

// .env files that hold real values. .env.example, .env.development and .env.test stay editable,
// because Vite uses them for non-secret build settings.
export const SECRET_ENV = /(^|\/)\.env(\.local|\.production|\.[\w-]+\.local)?$/;

// Credentials that must never be written into a project or sent to the tracker.
// Each entry: label, pattern (global), optional filter for known example values.
export const SECRET_PATTERNS = [
  ["an AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, (m) => m !== "AKIAIOSFODNN7EXAMPLE"],
  // The header alone is allowed, so documentation can name the format; key data after it is not.
  ["a private key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----\s*(?:[\w-]+:[^\n]*\s*)*[A-Za-z0-9+/=]{40,}/g],
  ["a GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,})\b/g],
  ["a Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ["a Stripe secret key", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/g],
  ["an Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/g],
  ["an OpenAI API key", /\bsk-proj-[A-Za-z0-9_-]{20,}/g],
  ["a ClickUp API token", /\bpk_\d{3,}_[A-Z0-9]{32}\b/g],
  ["a Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["an npm token", /\bnpm_[A-Za-z0-9]{36}\b/g],
  ["a JSON Web Token", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  // A literal password in code or config, including DB_PASSWORD= and "password": forms.
  // Placeholders such as "<password>" or "${PASSWORD}" are allowed, and so are seeded test logins under tests/.
  ["a hard-coded password", /(?<![A-Za-z0-9])["']?[A-Za-z_]*(?:password|passwd)["']?\s*[:=]\s*["'](?![<$%{*]|changeme|example|password)[^"'\s]{8,}["']/gi, undefined, /^tests\//],
];

// Returns the label of the first credential found in text, or null. rel is the file's path from
// the project root, when there is one, so a pattern can exempt paths such as tests/.
export function findSecret(text, rel = "") {
  for (const [label, pattern, keep = () => true, exempt = null] of SECRET_PATTERNS) {
    if (exempt && rel && exempt.test(rel)) continue;
    if ((String(text).match(pattern) || []).filter(keep).length) return label;
  }
  return null;
}

// Root config files whose names vary by tool.
const ARCHITECT_CONFIG = /^(vite\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s|tsconfig(\.[\w-]+)?\.json|eslint\.config\.[cm]?[jt]s|\.eslintrc(\.[\w]+)?|\.prettierrc(\.[\w]+)?|prettier\.config\.[cm]?[jt]s|\.prettierignore)$/;

export async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : null;
}

export function hooksDisabled(root) {
  if (String(process.env.ADLC3D_HOOKS || "").toLowerCase() === "off") return true;
  try {
    return /^\s*Hooks:\s*off\b/im.test(readFileSync(join(root, STATUS_FILE), "utf8"));
  } catch {
    return false;
  }
}

// Walk up from the edited file to the folder that holds docs/project-status.md.
export function findProjectRoot(filePath, cwd) {
  if (!filePath) return null;
  const absolute = isAbsolute(filePath) ? filePath : resolve(cwd || process.cwd(), filePath);
  let dir = dirname(absolute);
  for (;;) {
    if (existsSync(join(dir, STATUS_FILE))) return { root: dir, rel: toPosix(relative(dir, absolute)) };
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function toPosix(path) {
  return path.split(sep).join("/");
}

// Returns the agent's short name ("architect") for this plugin's agents, "" for the main thread,
// and null for an agent from another plugin, which these hooks leave alone.
export function agentName(input) {
  const type = input && typeof input.agent_type === "string" ? input.agent_type : "";
  if (!type) return "";
  const short = type.startsWith(`${PLUGIN}:`) ? type.slice(PLUGIN.length + 1) : type;
  return AGENTS.includes(short) ? short : null;
}

export function ownersOf(rel) {
  let best = null;
  for (const [prefix, owners] of OWNERSHIP) {
    const matches = prefix.endsWith("/") ? rel.startsWith(prefix) : rel === prefix;
    if (matches && (!best || prefix.length > best[0].length)) best = [prefix, owners];
  }
  if (best) return best[1];
  if (ARCHITECT_CONFIG.test(rel)) return ["architect"];
  const handoff = /^docs\/handoffs\/([\w-]+)\.md$/.exec(rel);
  if (handoff && AGENTS.includes(handoff[1])) return [handoff[1]];
  return null;
}

// The text a tool call adds to the file, so only new content is scanned.
export function newText(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return "";
  if (typeof toolInput.content === "string") return toolInput.content;
  if (typeof toolInput.new_string === "string") return toolInput.new_string;
  if (Array.isArray(toolInput.edits))
    return toolInput.edits.map((e) => (e && typeof e.new_string === "string" ? e.new_string : "")).join("\n");
  return "";
}

export function emit(eventName, fields) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, ...fields } }));
}

// Runs a hook body and turns every failure into a silent exit 0.
export async function failOpen(body) {
  try {
    await body();
  } catch {
    // Fail open: a broken guard must never stop the user's work.
  }
  process.exit(0);
}
