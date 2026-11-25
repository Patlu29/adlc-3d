// PreToolUse guard for Bash in an ADLC project. Stops the shell commands that would let Claude or an
// agent act as the user in ClickUp or in a chat channel. It is a speed bump, not a wall: a determined
// command can be disguised. The real control for approvals is that the token owner's ClickUp comments
// never count as approvals (see tracker/cli.mjs, gate status).

import { join } from "node:path";
import { emit, failOpen, findProjectRoot, hooksDisabled, readInput } from "./lib.mjs";

const RULES = [
  [/\bapprovers\s+(?:add|remove)\b/, "approvers are added and removed only by the user, in their own terminal. Ask the user to run it"],
  [/\bCLICKUP_API_URL\s*=/, "CLICKUP_API_URL is only for the plugin's own tests; a fake server could fake an approval"],
  [/api\.clickup\.com/i, "ClickUp is reached only through the tracker command, which checks content and keeps the record. Use node \"${CLAUDE_PLUGIN_ROOT}/tracker/cli.mjs\""],
  [/\bapprovers\s+\$/, "approvers are added and removed only by the user, in their own terminal. Ask the user to run it"],
  [/\b(?:CLICKUP_API_TOKEN|SLACK_WEBHOOK_URL|TEAMS_WEBHOOK_URL)\b/, "commands must not touch the ClickUp token or a webhook URL; the tracker reads them itself, and the user sets them in their own shell profile"],
  [/(?:^|[;&|(]\s*)(?:printenv|env)\s*(?:$|[;&|)])/, "commands must not print the whole environment, which holds the ClickUp token and webhook URLs"],
];

export function checkBash(input) {
  const command = input?.tool_input?.command;
  const cwd = input?.cwd;
  if (typeof command !== "string" || !cwd) return null;
  const located = findProjectRoot(join(cwd, ".adlc-probe"), cwd);
  if (!located || hooksDisabled(located.root)) return null;
  // Quotes and backslashes are dropped first, so approvers "add" is caught like approvers add.
  const plain = command.replace(/["'\\`]/g, "");
  for (const [pattern, why] of RULES) if (pattern.test(plain)) return why;
  return null;
}

if (process.argv[1]?.endsWith("guard-bash.mjs")) {
  await failOpen(async () => {
    const reason = checkBash(await readInput());
    if (reason) emit("PreToolUse", { permissionDecision: "deny", permissionDecisionReason: `adlc-3d guard: ${reason}.` });
  });
}
