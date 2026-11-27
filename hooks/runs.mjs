// Agent run log. PostToolUse on the Agent tool, and SubagentStop for agents run in the background.
// Appends one raw event per line to docs/metrics/runs.jsonl in an ADLC project. Never blocks, never
// prints, and never reads the file back: duplicates (a foreground run fires both events) are removed
// when the metrics report reads the log.
// Records numbers and IDs only, never the delegation prompt or the agent's reply.

import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENTS, PLUGIN, STATUS_FILE, failOpen, hooksDisabled, readInput } from "./lib.mjs";

export const SCHEMA_VERSION = 1;
// Past this size the log is moved aside to runs-<date>.jsonl and a new one starts.
const ROTATE_BYTES = 5 * 1024 * 1024;
// Story, bug, change and incident IDs; not ClickUp keys (CU-) or release versions (REL-1.2.0).
const CARD_ID = /\b(?!CU-|REL-)[A-Z]{2,4}-\d+\b(?!\.\d)/g;

let pluginVersion = null;
function version() {
  if (pluginVersion === null) {
    try {
      const manifest = join(dirname(fileURLToPath(import.meta.url)), "..", ".claude-plugin", "plugin.json");
      pluginVersion = JSON.parse(readFileSync(manifest, "utf8")).version || "";
    } catch {
      pluginVersion = "";
    }
  }
  return pluginVersion;
}

// The project is the folder at or above the session's working directory that holds the state file.
export function projectFromCwd(cwd) {
  if (!cwd) return null;
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, STATUS_FILE))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function metricsOff(root) {
  try {
    return /^\s*Metrics:\s*off\b/im.test(readFileSync(join(root, STATUS_FILE), "utf8"));
  } catch {
    return false;
  }
}

// "adlc-3d:architect" -> "architect"; anything else is not this plugin's and is not logged.
function shortAgent(type) {
  if (typeof type !== "string" || !type.startsWith(`${PLUGIN}:`)) return null;
  const name = type.slice(PLUGIN.length + 1);
  return AGENTS.includes(name) ? name : null;
}

// The delegation prompt format from the lifecycle skill: "Cards:" and "Iteration and phase:" lines.
export function fromPrompt(prompt) {
  const text = typeof prompt === "string" ? prompt : "";
  const line = (name) => new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, "im").exec(text)?.[1] || "";
  const cards = [...new Set(line("Cards").match(CARD_ID) || [])];
  const where = line("Iteration and phase");
  const iteration = /iteration\s+(\d+)/i.exec(where)?.[1];
  const phase = /phase\s+(\d[ab]?)\b/i.exec(where)?.[1];
  return { cards, iteration: iteration ? Number(iteration) : null, phase: phase || null };
}

const num = (v) => (Number.isFinite(v) ? v : null);

export function eventFrom(input) {
  if (!input || typeof input !== "object") return null;
  const base = { schemaVersion: SCHEMA_VERSION, plugin: version(), at: new Date().toISOString() };
  if (input.hook_event_name === "SubagentStop") {
    const agent = shortAgent(input.agent_type);
    if (!agent) return null;
    return { ...base, event: "stop", agentId: String(input.agent_id || ""), agent };
  }
  if (input.hook_event_name !== "PostToolUse" || !["Agent", "Task"].includes(input.tool_name)) return null;
  const toolInput = input.tool_input || {};
  const response = input.tool_response && typeof input.tool_response === "object" ? input.tool_response : {};
  const agent = shortAgent(toolInput.subagent_type || response.agentType);
  if (!agent) return null;
  const usage = response.usage || {};
  return {
    ...base,
    event: "run",
    agentId: String(response.agentId || ""),
    agent,
    ...fromPrompt(toolInput.prompt),
    status: String(response.status || "unknown"),
    background: Boolean(toolInput.run_in_background) || response.status === "async_launched",
    model: typeof response.resolvedModel === "string" ? response.resolvedModel : null,
    durationMs: num(response.totalDurationMs),
    tokens: num(response.totalTokens),
    inputTokens: num(usage.input_tokens),
    outputTokens: num(usage.output_tokens),
    cacheReadTokens: num(usage.cache_read_input_tokens),
    cacheWriteTokens: num(usage.cache_creation_input_tokens),
    toolUses: num(response.totalToolUseCount),
  };
}

export function record(input) {
  const event = eventFrom(input);
  if (!event) return false;
  const root = projectFromCwd(input.cwd);
  if (!root || hooksDisabled(root) || metricsOff(root)) return false;
  const docs = join(root, "docs");
  const dir = join(docs, "metrics");
  const file = join(dir, "runs.jsonl");
  // A cloned project could ship docs/metrics or the log as a link to a file elsewhere: never
  // follow one. Only a real folder and a real file (or none yet) are written.
  if (lstatSync(docs).isSymbolicLink()) return false;
  if (existsSync(dir) || isLink(dir)) {
    if (!lstatSync(dir).isDirectory()) return false;
  } else mkdirSync(dir, { recursive: true }); // recursive: no error if a parallel run made it first
  let size = 0;
  try {
    const stat = lstatSync(file);
    if (!stat.isFile()) return false;
    size = stat.size;
  } catch {
    // No log yet.
  }
  if (size > ROTATE_BYTES) renameSync(file, join(dir, `runs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.jsonl`));
  // One short write per event, opened for append, so parallel agents do not interleave lines.
  // O_NOFOLLOW closes the gap between the check above and the open.
  const fd = openSync(file, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW || 0), 0o644);
  try {
    writeSync(fd, `${JSON.stringify(event)}\n`);
  } finally {
    closeSync(fd);
  }
  return true;
}

if (process.argv[1]?.endsWith("runs.mjs")) {
  await failOpen(async () => {
    record(await readInput());
  });
}
