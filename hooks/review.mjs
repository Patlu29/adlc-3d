// PostToolUse review for Write, Edit and MultiEdit in an ADLC project.
// Never blocks. It tells the agent when it edited a path another agent owns, and lists
// hits from the code-rules self-review search in the file it just changed.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agentName, emit, failOpen, findProjectRoot, hooksDisabled, ownersOf, readInput } from "./lib.mjs";

const CODE_FILE = /^(src|server|tests)\/.+\.(ts|tsx|js|jsx|mjs|cjs)$/;
const MAX_HITS = 10;

// The self-review search from the code-rules skill. A suppression with a reason after "--"
// (eslint-disable-next-line rule -- reason) is allowed, as is a skip with a comment on the line.
// Rules marked "code" run on the line with string contents removed, so prose inside a string
// ("Note: any value") is not flagged.
const RULES = [
  ["console.log", /console\.log\(/, "code"],
  ["any type", /:\s*any\b|\bas any\b|<any>/, "code"],
  ["@ts-ignore", /@ts-ignore/],
  ["eslint-disable without a reason", /eslint-disable(?!.*\s--\s)/],
  ["HTML from data", /dangerouslySetInnerHTML|\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\(|document\.write\(/, "code"],
  ["code from data", /\beval\(|new Function\(/, "code"],
  [".only in a test", /\.only\(/, "code"],
  // A conditional skip with a reason, test.skip(condition, "reason"), is allowed.
  [".skip without a reason", /\.skip\((?![^)]*,\s*["'`])(?!.*\/\/)/],
];

const STRING = /(["'`])(?:\\.|(?!\1)[^\\])*\1/g;

function ownershipWarning(rel, agent) {
  if (!agent || agent === "performance-optimiser") return "";
  const owners = ownersOf(rel);
  if (!owners || owners.includes(agent)) return "";
  return `${rel} is owned by ${owners.join(" or ")} (team-conventions skill), not ${agent}. Undo this edit unless your task prompt or your agent instructions allow it, and describe the change under Requests for other agents instead.`;
}

function ruleHits(root, rel) {
  if (!CODE_FILE.test(rel)) return [];
  const lines = readFileSync(join(root, rel), "utf8").split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => {
    const code = line.replace(STRING, '""');
    for (const [label, pattern, scope] of RULES)
      if (pattern.test(scope === "code" ? code : line)) hits.push(`line ${i + 1}: ${label}`);
  });
  return hits;
}

export function review(input) {
  const toolInput = input && input.tool_input;
  const located = findProjectRoot(toolInput && toolInput.file_path, input && input.cwd);
  if (!located || hooksDisabled(located.root)) return "";
  const agent = agentName(input);
  if (agent === null) return "";

  const notes = [];
  const warning = ownershipWarning(located.rel, agent);
  if (warning) notes.push(warning);

  const hits = ruleHits(located.root, located.rel);
  if (hits.length) {
    const shown = hits.slice(0, MAX_HITS).join("; ");
    const more = hits.length > MAX_HITS ? `; and ${hits.length - MAX_HITS} more` : "";
    notes.push(`code-rules self-review hits in ${located.rel}: ${shown}${more}. Fix each one, or record why it is justified under Decisions in your handoff note.`);
  }
  return notes.length ? `adlc-3d review: ${notes.join(" ")}` : "";
}

if (process.argv[1]?.endsWith("review.mjs")) {
  await failOpen(async () => {
    const context = review(await readInput());
    if (context) emit("PostToolUse", { additionalContext: context });
  });
}
