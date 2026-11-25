#!/usr/bin/env node
// adlc-3d tracker: keeps cards in ClickUp (or a local board) in step with the ADLC documents.
// Run from the project root, or pass --project <dir>. See skills/card-tracking/SKILL.md.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SECRET_ENV, findSecret } from "../hooks/lib.mjs";
import { STATES, hashRendered, idFromName, initialState, parseBacklog, parseBugs, parseStories, renderCard } from "./cards.mjs";
import { TrackerError, createClient } from "./clickup.mjs";
import { acquireLock, loadState, readJson, releaseLock, renderBoard, trackerPaths, writeJsonAtomic } from "./store.mjs";

const EXIT = { ok: 0, usage: 1, user: 2, queued: 3, locked: 4 };
const BOOLEAN_FLAGS = new Set(["dry-run", "force", "write", "remote", "staged", "help"]);
const MINIMAL_NOTE_LIMIT = 280;

const USAGE = `adlc-3d tracker

  init --provider clickup --list <list id> [--content full|minimal] [--force]
  init --provider local
  check [--write]                     ClickUp: token, List access, status mapping
  push [--dry-run] [--force]          Create or update cards from the documents (never changes status)
  move <ID...> --state <state> [--note <text>]
  task --stories <US-1,US-2> --agent <agent> [--state <state>]
  comment <ID> (--text <text> | --file <path>)
  criteria <ID> [--pass AC-1,AC-2] [--fail AC-3] [--untested AC-4]
  board [--remote]                    Print the board; --remote compares with ClickUp, read only
  secrets --staged                    Scan staged git changes for credentials

States: ${STATES.join(", ")}
Exit codes: 0 done, 1 usage or input error, 2 needs the user (token, List, statuses),
3 tracker unavailable and the operation is queued, 4 another tracker command is running.`;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.has(name)) flags[name] = true;
    else {
      if (i + 1 >= argv.length) throw new UsageError(`--${name} needs a value`);
      flags[name] = argv[(i += 1)];
    }
  }
  return { command: positional.shift(), positional, flags };
}

class UsageError extends Error {}
class UserError extends Error {}

const list = (value) => String(value || "").split(",").map((v) => v.trim()).filter(Boolean);

function say(line = "") {
  process.stdout.write(`${line}\n`);
}

// ---------- context ----------

function openProject(flags) {
  const root = resolve(flags.project || process.cwd());
  if (!existsSync(join(root, "docs", "project-status.md")))
    throw new UserError(`${root} has no docs/project-status.md, so it is not an ADLC project`);
  const paths = trackerPaths(root);
  return { root, paths, config: readJson(paths.config, null) };
}

function requireConfig(ctx) {
  if (!ctx.config) throw new UserError("no tracker is set up here. Run `init` first");
  return ctx.config;
}

function clientFor(ctx) {
  if (!ctx.client)
    ctx.client = createClient({ token: process.env.CLICKUP_API_TOKEN, baseUrl: process.env.CLICKUP_API_URL });
  return ctx.client;
}

function readCards(root) {
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : "");
  const cards = [
    ...parseStories(read("docs/requirements/user-stories.md")),
    // QA bugs come before backlog rows, so a bug listed in both keeps its QA details.
    ...parseBugs(read("docs/qa-report.md")),
    ...parseBacklog(read("docs/requirements/backlog.md")),
  ];
  // A bug in both the QA report and the backlog keeps its QA details and the backlog row's status.
  const byId = new Map();
  for (const card of cards) {
    const first = byId.get(card.id);
    if (!first) byId.set(card.id, card);
    else if (!first.status && card.status) first.status = card.status;
  }
  return [...byId.values()];
}

function save(ctx) {
  writeJsonAtomic(ctx.paths.remote, ctx.state);
}

function writeBoard(ctx) {
  writeFileSync(ctx.paths.board, renderBoard(ctx.state, ctx.config));
}

// Always computed from a GET of the task, so the write and the later check compare the same rendering.
function remoteHash(task) {
  const description = task.markdown_description ?? task.description ?? task.text_content ?? "";
  return hashRendered({ name: task.name, description, priority: null });
}

function keyOf(task) {
  return task.custom_id || `CU-${task.id}`;
}

// ---------- card sync ----------

async function listIndex(ctx) {
  if (!ctx.index) {
    const tasks = await clientFor(ctx).listTasks(ctx.config.listId);
    ctx.index = new Map();
    for (const task of tasks) {
      const id = idFromName(task.name);
      if (id && !ctx.index.has(id)) ctx.index.set(id, task);
    }
  }
  return ctx.index;
}

function adopt(entry, task) {
  Object.assign(entry, { remoteId: task.id, key: keyOf(task), url: task.url || "" });
}

async function recordBaseline(ctx, entry) {
  entry.remoteHash = remoteHash(await clientFor(ctx).getTask(entry.remoteId));
}

// Creates or updates one card. Returns "created", "updated", "adopted", "unchanged", "conflict" or "refused".
async function syncCard(ctx, card, { force = false, parentEntry = null, parentTitle = "" } = {}) {
  const { config, state } = ctx;
  const rendered = renderCard(card, { content: config.content, results: state.cards[card.id]?.results, parentTitle });
  const secret = findSecret(`${rendered.name}\n${rendered.description}`);
  if (secret) {
    say(`  ${card.id}: not sent, the content contains what looks like ${secret}. Remove it from the document.`);
    return "refused";
  }
  const entry = (state.cards[card.id] ||= { kind: card.kind, state: card.initial || initialState(card) });
  entry.kind = card.kind;
  entry.title = card.kind === "task" ? `${card.agent} on ${card.parentId}` : card.title;
  const hash = hashRendered(rendered);

  if (config.provider === "local") {
    const outcome = !entry.hash ? "created" : entry.hash !== hash ? "updated" : "unchanged";
    Object.assign(entry, { key: card.id, hash });
    return outcome;
  }

  const client = clientFor(ctx);
  // A baseline lost to a failed read after our last write is taken now, before any overwrite.
  if (entry.remoteId && entry.hash && !entry.remoteHash) await recordBaseline(ctx, entry);
  const body = { name: rendered.name, description: rendered.description, markdown_content: rendered.description };
  if (rendered.priority) body.priority = rendered.priority;
  let outcome;
  if (!entry.remoteId) {
    const found = (await listIndex(ctx)).get(card.id);
    if (found) {
      adopt(entry, found);
      await client.updateTask(found.id, body);
      outcome = "adopted";
    } else {
      const status = config.statusMap?.[entry.state];
      const createBody = { ...body, tags: rendered.tags, ...(status ? { status } : {}) };
      if (card.kind === "task") createBody.parent = parentEntry.remoteId;
      const task = await client.createTask(config.listId, createBody);
      adopt(entry, task);
      save(ctx);
      outcome = "created";
    }
  } else if (entry.hash !== hash) {
    const current = await client.getTask(entry.remoteId);
    if (!force && entry.remoteHash && remoteHash(current) !== entry.remoteHash) {
      say(`  ${card.id}: someone edited the card in ClickUp since the last push, so it was left as is. Check it, then push with --force to overwrite.`);
      return "conflict";
    }
    await client.updateTask(entry.remoteId, body);
    outcome = "updated";
  } else {
    return "unchanged";
  }
  entry.hash = hash;
  await recordBaseline(ctx, entry);
  save(ctx);
  return outcome;
}

// ---------- commands ----------

async function cmdPush(ctx, { flags }) {
  const cards = readCards(ctx.root);
  if (flags["dry-run"]) {
    say(`Dry run: nothing is sent. Content mode: ${ctx.config.content || "full"}. Provider: ${ctx.config.provider}.`);
    for (const card of cards) {
      const entry = ctx.state.cards[card.id];
      const rendered = renderCard(card, { content: ctx.config.content, results: entry?.results });
      const action = !entry?.hash ? "create" : entry.hash === hashRendered(rendered) ? "unchanged" : "update";
      say(`\n--- ${card.id} (${action}) ---\nName: ${rendered.name}\nTags: ${rendered.tags.join(", ")}\n${rendered.description}`);
    }
    return EXIT.ok;
  }
  const counts = {};
  for (const card of cards) {
    let outcome;
    try {
      outcome = await syncCard(ctx, card, { force: flags.force });
    } catch (error) {
      if (!(error instanceof TrackerError) || error.kind !== "request") throw error;
      // One card ClickUp rejects must not stop the rest. A deleted card is forgotten, so the next
      // push creates it again or finds it by name.
      const entry = ctx.state.cards[card.id];
      if (error.status === 404 && entry) {
        delete entry.remoteId;
        delete entry.hash;
        delete entry.remoteHash;
        save(ctx);
      }
      say(`  ${card.id}: ${error.message}`);
      outcome = "failed";
    }
    counts[outcome] = (counts[outcome] || 0) + 1;
  }
  say(`Pushed ${cards.length} card(s): ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}.`);
  return counts.refused || counts.conflict || counts.failed ? EXIT.user : EXIT.ok;
}

function checkNote(ctx, id, text) {
  if (ctx.config.content === "minimal" && text.length > MINIMAL_NOTE_LIMIT)
    throw new UsageError(`content mode is minimal, so a note may be at most ${MINIMAL_NOTE_LIMIT} characters`);
  const secret = findSecret(text);
  if (secret) throw new UsageError(`the note for ${id} contains what looks like ${secret}; it was not sent`);
}

async function postNote(ctx, entry, id, text) {
  checkNote(ctx, id, text);
  if (ctx.config.provider === "local") {
    entry.lastNote = text.slice(0, 500);
    return;
  }
  await clientFor(ctx).addComment(entry.remoteId, text);
}

function entryFor(ctx, id) {
  const entry = ctx.state.cards[id];
  if (!entry || (ctx.config.provider === "clickup" && !entry.remoteId))
    throw new UsageError(`${id} has no card yet. Run push (or task) first`);
  return entry;
}

async function cmdMove(ctx, { positional, flags }) {
  const target = flags.state;
  if (!STATES.includes(target)) throw new UsageError(`--state must be one of ${STATES.join(", ")}`);
  if (!positional.length) throw new UsageError("name at least one card ID");
  for (const id of positional) entryFor(ctx, id);
  if (flags.note) checkNote(ctx, positional[0], flags.note);
  for (const [index, id] of positional.entries()) {
    const entry = ctx.state.cards[id];
    try {
      if (ctx.config.provider === "clickup") {
        const status = ctx.config.statusMap?.[target];
        if (status) await clientFor(ctx).updateTask(entry.remoteId, { status });
        else say(`  ${id}: no ClickUp status is mapped to ${target}, so only the local record changed`);
      }
      entry.state = target;
      if (flags.note) await postNote(ctx, entry, id, flags.note);
    } catch (error) {
      // Queue only the cards not done yet, so a replay never posts a note twice.
      const rest = positional.slice(index);
      error.retryArgv = ["move", ...rest, "--state", target, ...(flags.note ? ["--note", flags.note] : [])];
      throw error;
    }
    save(ctx);
  }
  say(`Moved ${positional.join(", ")} to ${target}.`);
  return EXIT.ok;
}

async function cmdTask(ctx, { flags }) {
  const stories = list(flags.stories);
  const agent = flags.agent;
  if (!stories.length || !/^[a-z][a-z-]*$/.test(agent || "")) throw new UsageError("task needs --stories and --agent");
  const start = flags.state || "in_progress";
  if (!STATES.includes(start)) throw new UsageError(`--state must be one of ${STATES.join(", ")}`);
  const titles = new Map(readCards(ctx.root).map((c) => [c.id, c.title]));
  for (const storyId of stories) {
    const parentEntry = entryFor(ctx, storyId);
    const card = { id: `${storyId}/${agent}`, kind: "task", agent, parentId: storyId, initial: start };
    const outcome = await syncCard(ctx, card, { parentEntry, parentTitle: titles.get(storyId) || "" });
    say(`  ${card.id}: ${outcome}`);
  }
  return EXIT.ok;
}

async function cmdComment(ctx, { positional, flags }) {
  const [id] = positional;
  if (!id || (!flags.text && !flags.file)) throw new UsageError("comment needs a card ID and --text or --file");
  if (flags.file && ctx.config.content === "minimal")
    throw new UsageError("content mode is minimal, so files are not sent; use a short --text instead");
  const entry = entryFor(ctx, id);
  const text = flags.file ? readFileSync(resolve(ctx.root, flags.file), "utf8") : flags.text;
  await postNote(ctx, entry, id, text);
  save(ctx);
  say(`Comment added to ${id}.`);
  return EXIT.ok;
}

async function cmdCriteria(ctx, { positional, flags }) {
  const [id] = positional;
  if (!id) throw new UsageError("criteria needs a story ID");
  const card = readCards(ctx.root).find((c) => c.id === id && c.kind === "story");
  if (!card) throw new UsageError(`${id} is not a story in docs/requirements/user-stories.md`);
  const entry = entryFor(ctx, id);
  const known = new Set(card.criteria.map((c) => c.id));
  entry.results ||= {};
  for (const [flag, result] of [["pass", "pass"], ["fail", "fail"], ["untested", "untested"]]) {
    for (const ac of list(flags[flag])) {
      if (!known.has(ac)) throw new UsageError(`${id} has no criterion ${ac}`);
      entry.results[ac] = result;
    }
  }
  save(ctx);
  const outcome = await syncCard(ctx, card, { force: flags.force });
  say(`Criteria results for ${id} recorded (${outcome}).`);
  return outcome === "conflict" ? EXIT.user : EXIT.ok;
}

// States whose own name is a status on the List. These always win over a saved fallback, so a
// status added in ClickUp after setup is picked up.
function exactStatusMatches(statuses) {
  const names = { in_progress: ["in progress"], in_review: ["in review", "review"], in_test: ["in test", "testing", "qa"], ready_for_release: ["ready for release"], blocked: ["blocked"], backlog: ["backlog"], ready: ["ready"], done: ["done"] };
  const exact = {};
  for (const [key, wanted] of Object.entries(names)) {
    const hit = statuses.find((s) => wanted.includes(String(s.status).toLowerCase()));
    if (hit) exact[key] = hit.status;
  }
  return exact;
}

function proposeStatusMap(statuses) {
  const names = statuses.map((s) => ({ name: s.status, lower: String(s.status).toLowerCase(), type: s.type }));
  const find = (exact, partial = []) =>
    names.find((n) => exact.includes(n.lower))?.name ?? names.find((n) => partial.some((p) => n.lower.includes(p)))?.name ?? null;
  const open = names.find((n) => n.type === "open")?.name ?? null;
  const closed = (names.find((n) => n.type === "done") ?? names.find((n) => n.type === "closed"))?.name ?? null;
  const firstCustom = names.find((n) => n.type === "custom")?.name ?? null;
  const map = {};
  map.backlog = find(["backlog"]) ?? open;
  map.ready = find(["ready", "to do", "todo", "selected for development"]) ?? map.backlog;
  map.in_progress = find(["in progress", "doing", "in development"], ["progress"]) ?? firstCustom ?? map.ready;
  map.in_review = find(["in review", "review", "code review"], ["review"]) ?? map.in_progress;
  map.in_test = find(["in test", "testing", "qa", "in qa"], ["test", "qa"]) ?? map.in_review;
  map.ready_for_release = find(["ready for release", "ready to release", "releasing"], ["release"]) ?? map.in_test;
  map.done = find(["done", "complete", "completed", "closed"]) ?? closed;
  map.blocked = find(["blocked", "on hold"], ["block"]);
  return map;
}

async function cmdCheck(ctx, { flags }) {
  const config = requireConfig(ctx);
  if (config.provider === "local") {
    say("Local board: nothing to check. Cards live in docs/tracker/.");
    return EXIT.ok;
  }
  const listData = await clientFor(ctx).getList(config.listId);
  const statuses = Array.isArray(listData.statuses) ? listData.statuses : [];
  say(`ClickUp List "${listData.name}" (${config.listId}) is reachable with this token.`);
  say(`Statuses on the List: ${statuses.map((s) => s.status).join(", ") || "none"}`);
  const available = new Set(statuses.map((s) => String(s.status).toLowerCase()));
  // Keep the user's mapping where it still names a status on the List; propose the rest, so a
  // status added in ClickUp after setup is picked up by check --write.
  const kept = Object.fromEntries(Object.entries(config.statusMap || {}).filter(([, v]) => v && available.has(String(v).toLowerCase())));
  const current = { ...proposeStatusMap(statuses), ...kept, ...exactStatusMatches(statuses) };
  let missing = 0;
  say("\nCard state -> ClickUp status");
  for (const key of STATES) {
    const value = current[key];
    const ok = value && available.has(String(value).toLowerCase());
    if (!ok) missing += key === "backlog" || key === "done" ? 1 : 0;
    say(`  ${key.padEnd(18)} ${value ? `${value}${ok ? "" : " (NOT on the List)"}` : "(none: moves update only the local record)"}`);
  }
  if (flags.write) {
    config.statusMap = Object.fromEntries(Object.entries(current).filter(([, v]) => v && available.has(String(v).toLowerCase())));
    writeJsonAtomic(ctx.paths.config, config);
    say("\nStatus mapping saved to docs/tracker/config.json.");
  }
  if (missing) {
    say("\nThe backlog and done states must map to statuses on the List. Add them in ClickUp, or edit statusMap in docs/tracker/config.json.");
    return EXIT.user;
  }
  return EXIT.ok;
}

async function cmdInit(ctx, { flags }) {
  const provider = flags.provider;
  if (!["clickup", "local"].includes(provider)) throw new UsageError("--provider must be clickup or local");
  if (ctx.config && !flags.force) throw new UsageError("a tracker is already set up here; pass --force to replace the config");
  if (provider === "clickup" && !/^\d+$/.test(flags.list || "")) throw new UsageError("ClickUp needs --list <numeric List ID>");
  const content = flags.content || "full";
  if (!["full", "minimal"].includes(content)) throw new UsageError("--content must be full or minimal");
  ctx.config = { version: 1, provider, content, ...(provider === "clickup" ? { listId: flags.list, statusMap: {} } : {}) };
  writeJsonAtomic(ctx.paths.config, ctx.config);
  say(`Tracker set up: ${provider}${provider === "clickup" ? ` (List ${flags.list})` : ""}, content ${content}.`);
  if (provider === "local") return EXIT.ok;
  return cmdCheck(ctx, { flags: { write: true } });
}

async function cmdBoard(ctx, { flags }) {
  const config = requireConfig(ctx);
  const state = loadState(ctx.paths);
  say(renderBoard(state, config));
  if (!flags.remote || config.provider !== "clickup") return EXIT.ok;
  const tasks = await clientFor(ctx).listTasks(config.listId);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const drift = [];
  for (const [id, entry] of Object.entries(state.cards)) {
    if (!entry.remoteId) continue;
    const task = byId.get(entry.remoteId);
    const expected = config.statusMap?.[entry.state];
    if (!task) drift.push(`${id}: not found in the List (deleted or moved)`);
    else if (expected && String(task.status?.status).toLowerCase() !== String(expected).toLowerCase())
      drift.push(`${id}: ClickUp shows "${task.status?.status}", the lifecycle expects "${expected}" (${entry.state})`);
  }
  for (const task of tasks) {
    const id = idFromName(task.name);
    if (id && !state.cards[id]) drift.push(`${id}: in ClickUp but not in docs/tracker/remote.json`);
  }
  say(drift.length ? `Differences with ClickUp:\n${drift.map((d) => `- ${d}`).join("\n")}` : "ClickUp matches the lifecycle record.");
  return EXIT.ok;
}

function cmdSecrets({ flags, root }) {
  if (!flags.staged) throw new UsageError("secrets needs --staged");
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const problems = [];
  for (const file of git("diff", "--cached", "--name-only", "--diff-filter=AM").split("\n").filter(Boolean))
    if (SECRET_ENV.test(file)) problems.push(`${file}: a .env file with values must not be committed`);
  const warnings = [];
  let file = "";
  for (const line of git("diff", "--cached", "--unified=0", "--no-color", "--no-ext-diff").split("\n")) {
    if (line.startsWith("+++ ")) file = line.replace(/^\+\+\+ (b\/)?/, "");
    else if (line.startsWith("+")) {
      const label = findSecret(line.slice(1), file);
      if (!label) continue;
      // Test fixtures may hold throwaway keys on purpose; report them so a person can confirm.
      if (/^tests\/(?:.+\/)?fixtures\//.test(file)) warnings.push(`${file}: an added line looks like ${label}; confirm it is a throwaway test value`);
      else problems.push(`${file}: an added line looks like ${label}`);
    }
  }
  if (warnings.length) say(`Check before committing:\n${[...new Set(warnings)].map((w) => `- ${w}`).join("\n")}`);
  if (!problems.length) {
    say("No credentials found in the staged changes.");
    return EXIT.ok;
  }
  say(`Do not commit. Staged changes contain:\n${[...new Set(problems)].map((p) => `- ${p}`).join("\n")}`);
  return EXIT.usage;
}

// ---------- runner ----------

const MUTATING = { push: cmdPush, move: cmdMove, task: cmdTask, comment: cmdComment, criteria: cmdCriteria };

async function replayPending(ctx) {
  while (ctx.state.pending.length) {
    const [next] = ctx.state.pending;
    const parsed = parseArgs(next.argv);
    say(`Retrying queued operation: ${next.argv.join(" ")}`);
    try {
      await MUTATING[parsed.command](ctx, parsed);
    } catch (error) {
      // Only an unreachable tracker or a refused token keeps the operation queued. Anything else
      // cannot succeed by retrying, and would block every later command.
      if (error instanceof TrackerError && (error.kind === "unavailable" || error.kind === "auth")) {
        if (error.retryArgv) next.argv = error.retryArgv;
        save(ctx);
        error.fromReplay = true;
        throw error;
      }
      say(`  Dropped it: ${error.message}`);
    }
    ctx.state.pending.shift();
    save(ctx);
  }
}

function queue(ctx, argv, error) {
  // Skip only a repeat of the last queued operation; an earlier copy keeps its place, so replay
  // happens in the order the commands were given.
  const last = ctx.state.pending[ctx.state.pending.length - 1];
  if (!last || JSON.stringify(last.argv) !== JSON.stringify(argv))
    ctx.state.pending.push({ argv, reason: error.message, at: new Date().toISOString() });
  save(ctx);
}

function withoutProject(argv) {
  const index = argv.indexOf("--project");
  return index === -1 ? argv : [...argv.slice(0, index), ...argv.slice(index + 2)];
}

async function runMutating(ctx, parsed, argv) {
  requireConfig(ctx);
  if (!acquireLock(ctx.paths)) {
    say("Another tracker command is running in this project. Try again when it finishes.");
    return EXIT.locked;
  }
  try {
    ctx.state = loadState(ctx.paths);
    const dryRun = parsed.flags["dry-run"];
    try {
      if (ctx.config.provider === "clickup" && !dryRun) await replayPending(ctx);
      return await MUTATING[parsed.command](ctx, parsed);
    } catch (error) {
      if (!(error instanceof TrackerError) || error.kind === "request" || dryRun) throw error;
      queue(ctx, (!error.fromReplay && error.retryArgv) || withoutProject(argv), error);
      say(
        error.kind === "auth"
          ? `ClickUp: ${error.message}. The operation is queued. Ask the user to set CLICKUP_API_TOKEN in their own shell (never in chat or a file), then run any tracker command to retry.`
          : `ClickUp: ${error.message}. The operation is queued and will be retried by the next tracker command. Do not block the lifecycle on it.`
      );
      return error.kind === "auth" ? EXIT.user : EXIT.queued;
    } finally {
      if (!dryRun) {
        save(ctx);
        writeBoard(ctx);
      }
    }
  } finally {
    releaseLock(ctx.paths);
  }
}

export async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
    if (!parsed.command || parsed.flags.help) {
      say(USAGE);
      return parsed.command ? EXIT.ok : EXIT.usage;
    }
    if (parsed.command === "secrets") return cmdSecrets({ flags: parsed.flags, root: resolve(parsed.flags.project || process.cwd()) });
    const ctx = openProject(parsed.flags);
    if (MUTATING[parsed.command]) return await runMutating(ctx, parsed, argv);
    if (parsed.command === "init") return await cmdInit(ctx, parsed);
    if (parsed.command === "check") return await cmdCheck(ctx, parsed);
    if (parsed.command === "board") return await cmdBoard(ctx, parsed);
    throw new UsageError(`unknown command "${parsed.command}"`);
  } catch (error) {
    if (error instanceof UsageError) {
      say(`Error: ${error.message}\n\n${USAGE}`);
      return EXIT.usage;
    }
    if (error instanceof UserError) {
      say(`Error: ${error.message}`);
      return EXIT.user;
    }
    if (error instanceof TrackerError) {
      say(`ClickUp: ${error.message}`);
      return error.kind === "unavailable" ? EXIT.queued : EXIT.user;
    }
    say(`Error: ${error.message}`);
    return EXIT.usage;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
