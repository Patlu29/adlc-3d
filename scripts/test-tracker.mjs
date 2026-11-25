#!/usr/bin/env node
// Tests the tracker CLI end to end against an in-process mock of the ClickUp API v2,
// and against the local provider. Run from the repository root: node scripts/test-tracker.mjs

import { execFile, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../tracker/cli.mjs", import.meta.url));
const TOKEN = ["pk", "1234567", "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"].join("_");
const LIST = "900";
const OWNER = { id: 1, username: "token-owner", email: "owner@example.invalid" };
const ALEX = { id: 2, username: "alex", email: "alex@example.invalid" };
const SAM = { id: 3, username: "sam", email: "sam@example.invalid" };
let failures = 0;
let passes = 0;

function ok(condition, name, detail = "") {
  if (condition) passes += 1;
  else {
    failures += 1;
    console.error(`FAIL: ${name}${detail ? `\n  ${String(detail).split("\n").join("\n  ")}` : ""}`);
  }
}

// ---------- mock ClickUp ----------

const mock = {
  tasks: new Map(),
  requests: [],
  fail: [], // { method, pattern, status, times }
  statuses: [
    { status: "to do", type: "open" },
    { status: "in progress", type: "custom" },
    { status: "in review", type: "custom" },
    { status: "complete", type: "closed" },
  ],
  seq: 0,
  pageSize: 2,
  clock: Date.now(),
  replies: new Map(), // comment id -> [comments]
  webhooks: [], // { path, body }
  customItems: [{ id: 1, name: "milestone" }, { id: 4, name: "meeting_note" }],
  refuseCustomItem: false,
};

// Adds a comment as someone other than the token owner, as a person in ClickUp would.
function addComment(taskId, user, text, { replyTo } = {}) {
  mock.clock += 1000;
  const comment = { id: `c${++mock.seq}`, date: String(mock.clock), user, comment_text: text };
  if (replyTo) {
    if (!mock.replies.has(replyTo)) mock.replies.set(replyTo, []);
    mock.replies.get(replyTo).push(comment);
  } else mock.tasks.get(taskId).thread.push(comment);
  return comment;
}

function countOf(method, pattern) {
  return mock.requests.filter((r) => r.method === method && pattern.test(r.path)).length;
}

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    mock.requests.push({ method: req.method, path, body: raw });
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(data));
    };
    if (path.startsWith("/hook/")) {
      mock.webhooks.push({ path, body: raw ? JSON.parse(raw) : null });
      return send(path === "/hook/teams" ? 202 : 200, {});
    }
    if (req.headers.authorization !== TOKEN) return send(401, { err: "Token invalid", ECODE: "OAUTH_025" });
    const rule = mock.fail.find((f) => f.method === req.method && f.pattern.test(path) && f.times > 0);
    if (rule && !rule.apply) {
      rule.times -= 1;
      const headers = rule.status === 429 ? { "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000)) } : {};
      return send(rule.status, { err: "injected" }, headers);
    }
    const body = raw ? JSON.parse(raw) : {};
    // A request ClickUp applies but whose response is lost, as after a timeout or a 502.
    const applyThenFail = rule && rule.apply ? rule : null;
    if (applyThenFail) applyThenFail.times -= 1;
    const reply = send;
    const sendOrFail = (status, data) => (applyThenFail ? reply(applyThenFail.status, { err: "injected after apply" }) : reply(status, data));
    let m;
    if (req.method === "GET" && path === `/list/${LIST}`) return send(200, { id: LIST, name: "ADLC test", statuses: mock.statuses });
    if (req.method === "GET" && path === `/list/${LIST}/task`) {
      const page = Number(url.searchParams.get("page") || 0);
      const all = [...mock.tasks.values()];
      const slice = all.slice(page * mock.pageSize, (page + 1) * mock.pageSize);
      return send(200, { tasks: slice, last_page: (page + 1) * mock.pageSize >= all.length });
    }
    if (req.method === "POST" && path === `/list/${LIST}/task`) {
      if (body.custom_item_id != null && mock.refuseCustomItem) return send(400, { err: "Custom task type not available", ECODE: "ITEM_225" });
      mock.seq += 1;
      const id = `t${mock.seq}`;
      const task = {
        id,
        custom_id: null,
        name: body.name,
        description: body.description,
        status: { status: body.status || "to do" },
        tags: body.tags,
        priority: body.priority,
        parent: body.parent || null,
        url: `https://app.clickup.test/t/${id}`,
        points: body.points ?? null,
        custom_item_id: body.custom_item_id ?? 0,
        due_date: null,
        comments: [],
        thread: [],
      };
      mock.tasks.set(id, task);
      return sendOrFail(200, task);
    }
    if ((m = /^\/task\/([^/]+)$/.exec(path))) {
      const task = mock.tasks.get(m[1]);
      if (!task) return send(401, { err: "Team not authorized", ECODE: "ITEM_013" });
      if (req.method === "GET") return send(200, task);
      if (req.method === "PUT") {
        if (body.name !== undefined) task.name = body.name;
        if (body.description !== undefined) task.description = body.description;
        if (body.status !== undefined) task.status = { status: body.status };
        if (body.priority !== undefined) task.priority = body.priority;
        if (body.points !== undefined) task.points = body.points;
        if (body.due_date !== undefined) task.due_date = body.due_date;
        return send(200, task);
      }
    }
    if ((m = /^\/task\/([^/]+)\/comment$/.exec(path)) && req.method === "POST") {
      const task = mock.tasks.get(m[1]);
      if (!task) return send(404, { err: "Task not found" });
      task.comments.push(body.comment_text);
      mock.clock += 1000;
      const comment = { id: `c${++mock.seq}`, date: String(mock.clock), user: OWNER, comment_text: body.comment_text, notify_all: body.notify_all };
      task.thread.push(comment);
      return send(200, { id: comment.id, date: comment.date });
    }
    if ((m = /^\/task\/([^/]+)\/comment$/.exec(path)) && req.method === "GET") {
      const task = mock.tasks.get(m[1]);
      if (!task) return send(404, { err: "Task not found" });
      const start = url.searchParams.get("start");
      const newestFirst = [...task.thread].sort((a, b) => Number(b.date) - Number(a.date));
      const older = start ? newestFirst.filter((c) => Number(c.date) < Number(start)) : newestFirst;
      return send(200, { comments: older.slice(0, 25) });
    }
    if ((m = /^\/comment\/([^/]+)\/reply$/.exec(path)) && req.method === "GET") return send(200, { comments: mock.replies.get(m[1]) || [] });
    if ((m = /^\/task\/([^/]+)\/tag\/([^/]+)$/.exec(path))) {
      const task = mock.tasks.get(m[1]);
      if (!task) return send(404, { err: "Task not found" });
      const tag = decodeURIComponent(m[2]);
      if (req.method === "POST" && !task.tags.includes(tag)) task.tags.push(tag);
      if (req.method === "DELETE") task.tags = task.tags.filter((t) => t !== tag);
      return send(200, {});
    }
    if (req.method === "GET" && path === "/user") return send(200, { user: OWNER });
    if (req.method === "GET" && /^\/team\/[^/]+\/custom_item$/.test(path)) return send(200, { custom_items: mock.customItems });
    if (req.method === "GET" && path === "/team")
      return send(200, { teams: [{ id: "77", name: "Test", members: [OWNER, ALEX, SAM].map((user) => ({ user })) }] });
    return send(404, { err: `no mock for ${req.method} ${path}` });
  });
});

// ---------- helpers ----------

const STORIES = `# User stories

## Epic E1: Explore the product in 3D

### US-1: Rotate the model (FR-5, Must)
As a shopper, I want to rotate the product by dragging, so that I can see it from every side.

**Acceptance criteria**
- Given the scene has loaded, when I drag horizontally, then the model rotates
- Given I use only the keyboard, when I press the arrow keys, then the model rotates

### US-2: Change the colour (FR-6, Should)
As a shopper, I want to change the shade colour, so that I can preview options.

**Acceptance criteria**
- AC-1: Given the panel is open, when I pick a colour, then the shade changes within 200 ms
`;

const BACKLOG = `# Backlog

| ID | Type | Summary | Source | Priority | Status | Links |
|---|---|---|---|---|---|---|
| CR-1 | Feature | Share the current view as a link | User, 2026-11-11 | Should | Open | FR-12 |
| CR-2 | Bug | Label overlaps the panel below 360 px | BUG-4, iteration 1 | Could | Done (iteration 1) | US-1 AC-2 |
`;

const QA = `# QA report

## Bugs
### BUG-1: Drag stops after one second
- Severity: major
- Breaks: US-1 AC-1
- Owner: scene-developer
- Steps to reproduce:
  1. Load the page
  2. Drag for two seconds
`;

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "adlc-tracker-"));
  mkdirSync(join(dir, "docs", "requirements"), { recursive: true });
  writeFileSync(join(dir, "docs", "project-status.md"), "# Project status\n");
  writeFileSync(join(dir, "docs", "requirements", "user-stories.md"), STORIES);
  writeFileSync(join(dir, "docs", "requirements", "backlog.md"), BACKLOG);
  writeFileSync(join(dir, "docs", "qa-report.md"), QA);
  return dir;
}

function run(dir, args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { cwd: dir, env: { PATH: process.env.PATH, CLICKUP_API_URL: baseUrl, CLICKUP_API_TOKEN: TOKEN, ...env } },
      (error, stdout, stderr) => resolve({ code: error ? error.code : 0, out: stdout + stderr })
    );
  });
}

const state = (dir) => JSON.parse(readFileSync(join(dir, "docs", "tracker", "remote.json"), "utf8"));
const tasksNamed = (id) => [...mock.tasks.values()].filter((t) => t.name.startsWith(`[${id}]`));

let baseUrl = "";
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  // ---------- usage and setup ----------
  {
    const dir = makeProject();
    let r = await run(dir, []);
    ok(r.code === 1, "no command prints usage and exits 1", r.out);
    r = await run(mkdtempSync(join(tmpdir(), "adlc-none-")), ["board"]);
    ok(r.code === 2 && /not an ADLC project/.test(r.out), "a folder without project-status.md is refused", r.out);
    r = await run(dir, ["push"]);
    ok(r.code === 2 && /Run `init` first/.test(r.out), "push before init asks for init", r.out);
    r = await run(dir, ["init", "--provider", "clickup", "--list", "abc"]);
    ok(r.code === 1, "a non-numeric List ID is rejected", r.out);
    r = await run(dir, ["init", "--provider", "clickup", "--list", LIST], { CLICKUP_API_TOKEN: "" });
    ok(r.code === 2 && /CLICKUP_API_TOKEN is not set/.test(r.out), "init without a token says the token is missing", r.out);
    ok(existsSync(join(dir, "docs", "tracker", "config.json")), "init saves the config even when the check cannot run");
    r = await run(dir, ["init", "--provider", "clickup", "--list", LIST]);
    ok(r.code === 1 && /already set up/.test(r.out), "init refuses to replace a config without --force", r.out);
    r = await run(dir, ["check", "--write"], { CLICKUP_API_URL: "https://example.com" });
    ok(r.code === 2 && /only point at localhost/.test(r.out), "the API URL override is limited to localhost", r.out);
    r = await run(dir, ["check", "--write"], { CLICKUP_API_TOKEN: ["pk", "1", "WRONG"].join("_") });
    ok(r.code === 2 && !r.out.includes("WRONG"), "a refused token exits 2 and is never printed", r.out);
  }

  // ---------- ClickUp provider ----------
  const dir = makeProject();
  {
    let r = await run(dir, ["init", "--provider", "clickup", "--list", LIST]);
    ok(r.code === 0, "init with a token checks the List", r.out);
    const config = JSON.parse(readFileSync(join(dir, "docs", "tracker", "config.json"), "utf8"));
    ok(config.statusMap.backlog === "to do" && config.statusMap.done === "complete", "status map proposes backlog and done", JSON.stringify(config.statusMap));
    ok(config.statusMap.in_review === "in review" && config.statusMap.in_test === "in review", "missing states fall back to the nearest earlier status", JSON.stringify(config.statusMap));
    ok(!("blocked" in config.statusMap), "an unmappable state is left out");

    const before = mock.requests.length;
    r = await run(dir, ["push", "--dry-run"]);
    ok(r.code === 0 && /--- US-1 \(create\) ---/.test(r.out) && /Name: \[US-1\] Rotate the model/.test(r.out), "dry run shows exactly what would be sent", r.out);
    ok(mock.requests.length === before, "dry run makes no requests");

    mock.pageSize = 2;
    r = await run(dir, ["push"]);
    ok(r.code === 0 && /5 created/.test(r.out), "push creates stories, backlog items and bugs", r.out);
    const us1 = tasksNamed("US-1")[0];
    ok(us1 && us1.tags.includes("adlc-story") && us1.tags.includes("epic-e1"), "story cards carry type and epic tags", JSON.stringify(us1?.tags));
    ok(us1 && us1.status.status === "to do" && us1.priority === 2, "a Must story starts in backlog with high priority");
    ok(/AC-2: Given I use only the keyboard/.test(us1?.description || ""), "criteria are numbered in the description");
    ok(tasksNamed("CR-2")[0]?.status.status === "complete", "a backlog item marked Done starts as done");
    ok(tasksNamed("BUG-1")[0]?.priority === 2, "a major bug gets high priority");
    ok(/Steps to reproduce: Load the page; Drag for two seconds/.test(tasksNamed("BUG-1")[0]?.description || ""), "numbered steps under a bug field are kept");
    const s = state(dir);
    ok(s.cards["US-1"].key === `CU-${us1.id}` && s.cards["US-1"].url, "remote.json records the key and URL");
    ok(readFileSync(join(dir, "docs", "tracker", "board.md"), "utf8").includes("## Backlog"), "board.md is generated");

    const posts = countOf("POST", /\/task$/);
    const puts = countOf("PUT", /^\/task\//);
    r = await run(dir, ["push"]);
    ok(r.code === 0 && countOf("POST", /\/task$/) === posts && countOf("PUT", /^\/task\//) === puts, "a second push with no changes sends nothing", r.out);

    // A push that stopped after creating a card but before recording it must not duplicate the card.
    const lost = state(dir);
    delete lost.cards["US-2"];
    writeFileSync(join(dir, "docs", "tracker", "remote.json"), JSON.stringify(lost));
    r = await run(dir, ["push"]);
    ok(r.code === 0 && tasksNamed("US-2").length === 1 && /1 adopted/.test(r.out), "a card missing from remote.json is found by name, not created again", r.out);

    // Documents changed: update. Card edited in ClickUp: conflict unless --force.
    writeFileSync(join(dir, "docs", "requirements", "user-stories.md"), STORIES.replace("Rotate the model", "Rotate the lamp"));
    r = await run(dir, ["push"]);
    ok(r.code === 0 && tasksNamed("US-1")[0].name === "[US-1] Rotate the lamp", "a changed title updates the card", r.out);
    tasksNamed("US-1")[0].description = "Edited by a person in ClickUp";
    writeFileSync(join(dir, "docs", "requirements", "user-stories.md"), STORIES.replace("Rotate the model", "Rotate the desk lamp"));
    r = await run(dir, ["push"]);
    ok(r.code === 2 && /someone edited the card/.test(r.out) && tasksNamed("US-1")[0].description === "Edited by a person in ClickUp", "a card edited in ClickUp is not overwritten", r.out);
    r = await run(dir, ["push", "--force"]);
    ok(r.code === 0 && tasksNamed("US-1")[0].name === "[US-1] Rotate the desk lamp", "--force overwrites after the user checks", r.out);

    // Status moves
    r = await run(dir, ["move", "US-1", "US-2", "--state", "in_progress", "--note", "Iteration 1, phase 3 Build"]);
    ok(r.code === 0 && tasksNamed("US-1")[0].status.status === "in progress", "move sets the mapped status", r.out);
    ok(tasksNamed("US-2")[0].comments.includes("Iteration 1, phase 3 Build"), "move --note adds a comment");
    r = await run(dir, ["move", "US-1", "--state", "blocked"]);
    ok(r.code === 0 && /no ClickUp status is mapped/.test(r.out) && state(dir).cards["US-1"].state === "blocked", "an unmapped state changes only the local record", r.out);
    r = await run(dir, ["move", "US-1", "--state", "finished"]);
    ok(r.code === 1, "an unknown state is rejected", r.out);
    r = await run(dir, ["move", "US-9", "--state", "done"]);
    ok(r.code === 1 && /no card yet/.test(r.out), "moving an unknown card is rejected", r.out);

    // Sub-tasks per agent
    r = await run(dir, ["task", "--stories", "US-1,US-2", "--agent", "scene-developer"]);
    const sub = tasksNamed("US-1/scene-developer")[0];
    ok(r.code === 0 && sub && sub.parent === tasksNamed("US-1")[0].id && sub.status.status === "in progress", "task creates an agent sub-task under the story", r.out);
    ok(sub && sub.name === "[US-1/scene-developer] scene-developer: Rotate the desk lamp", "an agent sub-task is named after its agent and story", sub?.name);
    r = await run(dir, ["task", "--stories", "US-1", "--agent", "scene-developer"]);
    ok(/unchanged/.test(r.out) && tasksNamed("US-1/scene-developer").length === 1, "task is idempotent", r.out);

    // Criteria results
    r = await run(dir, ["criteria", "US-1", "--pass", "AC-1", "--fail", "AC-2"]);
    const desc = tasksNamed("US-1")[0].description;
    ok(r.code === 0 && /\[x\] AC-1: .*\(passed\)/.test(desc) && /\[ \] AC-2: .*\(FAILED\)/.test(desc), "criteria results show in the story description", desc);
    r = await run(dir, ["criteria", "US-1", "--pass", "AC-9"]);
    ok(r.code === 1, "an unknown criterion is rejected", r.out);

    // Comments and secrets
    const awsKey = ["AKIA", "Q3EGRZ7PL2XN5VHM"].join("");
    r = await run(dir, ["comment", "BUG-1", "--text", `key ${awsKey}`]);
    ok(r.code === 1 && !tasksNamed("BUG-1")[0].comments.length, "a comment containing a credential is not sent", r.out);
    r = await run(dir, ["comment", "BUG-1", "--text", "Fixed in iteration 1, re-tested on chromium"]);
    ok(r.code === 0 && tasksNamed("BUG-1")[0].comments.length === 1, "a comment is posted", r.out);

    // Tracker unavailable: queue and retry, never lose the operation
    writeFileSync(join(dir, "docs", "requirements", "user-stories.md"), STORIES.replace("Change the colour", "Change the shade colour"));
    mock.fail.push({ method: "PUT", pattern: /^\/task\//, status: 503, times: 20 });
    r = await run(dir, ["push"]);
    ok(r.code === 3 && /queued/.test(r.out) && state(dir).pending.length === 1, "an unavailable tracker queues the operation and exits 3", r.out);
    ok(readFileSync(join(dir, "docs", "tracker", "board.md"), "utf8").includes("queued"), "the board shows queued operations");
    mock.fail = [];
    r = await run(dir, ["move", "US-2", "--state", "in_review"]);
    ok(r.code === 0 && /Retrying queued operation/.test(r.out) && state(dir).pending.length === 0, "the next command retries the queue first", r.out);
    ok(tasksNamed("US-2")[0].name === "[US-2] Change the shade colour" && tasksNamed("US-2")[0].status.status === "in review", "the queued push and the new move both landed");

    mock.fail.push({ method: "PUT", pattern: /^\/task\//, status: 429, times: 1 });
    r = await run(dir, ["move", "US-2", "--state", "in_test"]);
    ok(r.code === 0, "a rate limit response is waited out and retried", r.out);

    // Read-only drift report
    tasksNamed("US-2")[0].status = { status: "complete" };
    const snapshot = readFileSync(join(dir, "docs", "tracker", "remote.json"), "utf8");
    r = await run(dir, ["board", "--remote"]);
    ok(r.code === 0 && /US-2: ClickUp shows "complete"/.test(r.out), "board --remote reports a card moved by a person", r.out);
    ok(readFileSync(join(dir, "docs", "tracker", "remote.json"), "utf8") === snapshot, "board --remote writes nothing");

    // Lock
    writeFileSync(join(dir, "docs", "tracker", ".lock"), String(process.pid));
    r = await run(dir, ["push"]);
    ok(r.code === 4, "a running command holds the lock", r.out);
    ok(readFileSync(join(dir, "docs", "tracker", ".lock"), "utf8") === String(process.pid), "a command never removes a lock it does not hold");
    writeFileSync(join(dir, "docs", "tracker", ".lock"), "2147480000");
    r = await run(dir, ["push"]);
    ok(r.code === 0 && !existsSync(join(dir, "docs", "tracker", ".lock")), "a lock left by a process that has gone is taken over", r.out);

    // Review fixes: queue handling
    const withPending = (pending) => {
      const st = state(dir);
      st.pending = pending;
      writeFileSync(join(dir, "docs", "tracker", "remote.json"), JSON.stringify(st));
    };
    withPending([{ argv: ["comment", "US-1", "--file", "docs/missing.md"], reason: "test", at: "" }]);
    r = await run(dir, ["move", "US-1", "--state", "in_progress"]);
    ok(r.code === 0 && /Dropped it/.test(r.out) && state(dir).pending.length === 0, "a queued operation that can never succeed is dropped, not retried for ever", r.out);

    mock.fail.push({ method: "PUT", pattern: /^\/task\//, status: 503, times: 100 });
    await run(dir, ["move", "US-1", "--state", "in_review"]);
    await run(dir, ["move", "US-1", "--state", "in_progress"]);
    await run(dir, ["move", "US-1", "--state", "in_review"]);
    const order = state(dir).pending.map((p) => p.argv.join(" "));
    ok(order.length === 3 && order[2].endsWith("in_review"), "queued moves keep their order, including a repeat", order.join(" | "));
    mock.fail = [];
    r = await run(dir, ["board"]);
    r = await run(dir, ["move", "US-2", "--state", "in_test"]);
    ok(r.code === 0 && tasksNamed("US-1")[0].status.status === "in review" && state(dir).pending.length === 0, "replay ends in the last state given", r.out);

    // A move partly done when the tracker fails queues only the cards left, so no note is posted twice.
    const notesBefore = tasksNamed("US-1")[0].comments.length;
    mock.fail.push({ method: "POST", pattern: /^\/task\/t\d+\/comment$/, status: 503, times: 1 });
    mock.requests.length = 0;
    r = await run(dir, ["move", "US-1", "US-2", "--state", "in_test", "--note", "verify"]);
    const queued = state(dir).pending.map((p) => p.argv.join(" "));
    ok(r.code === 3 && queued.length === 1 && queued[0].startsWith("move US-1 US-2"), "the failed card and the ones after it are queued", queued.join(" | "));
    mock.fail = [];
    await run(dir, ["board"]);
    r = await run(dir, ["move", "CR-1", "--state", "ready"]);
    ok(tasksNamed("US-1")[0].comments.filter((c) => c === "verify").length === 1 && tasksNamed("US-2")[0].comments.includes("verify"), "after replay each card has the note once", JSON.stringify(tasksNamed("US-1")[0].comments.slice(notesBefore)));

    // A create that ClickUp applied but whose response was lost is not created twice.
    writeFileSync(join(dir, "docs", "requirements", "user-stories.md"), STORIES + "\n### US-3: Zoom (FR-7, Could)\nAs a shopper I zoom.\n\n**Acceptance criteria**\n- Given load, when I pinch, then it zooms\n");
    mock.fail.push({ method: "POST", pattern: /\/list\/900\/task$/, status: 502, times: 1, apply: true });
    r = await run(dir, ["push"]);
    ok(r.code === 3 && tasksNamed("US-3").length === 1, "a create whose response was lost is queued, not retried", r.out);
    mock.fail = [];
    r = await run(dir, ["push"]);
    ok(r.code === 0 && tasksNamed("US-3").length === 1 && state(dir).cards["US-3"]?.remoteId, "the replay adopts the card ClickUp already created", r.out);

    // A card deleted in ClickUp does not stop the push, and is created again next time.
    mock.tasks.delete(state(dir).cards["CR-1"].remoteId);
    writeFileSync(join(dir, "docs", "requirements", "backlog.md"), BACKLOG.replace("Share the current view", "Share this view"));
    r = await run(dir, ["push"]);
    ok(r.code === 2 && /CR-1: ClickUp has no/.test(r.out) && !state(dir).cards["CR-1"].remoteId, "a deleted card is reported and forgotten, and the push carries on", r.out);
    r = await run(dir, ["push"]);
    ok(r.code === 0 && tasksNamed("CR-1").length === 1, "the next push creates the deleted card again", r.out);

    // A note that would be refused leaves the card where it was.
    const stateBefore = state(dir).cards["US-2"].state;
    r = await run(dir, ["move", "US-2", "--state", "done", "--note", `token ${["ghp", "b".repeat(36)].join("_")}`]);
    ok(r.code === 1 && state(dir).cards["US-2"].state === stateBefore, "a refused note does not move the card", r.out);

    // check --write maps a status added after setup.
    const cfgPath = join(dir, "docs", "tracker", "config.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    cfg.statusMap.done = "shipped";
    writeFileSync(cfgPath, JSON.stringify(cfg));
    r = await run(dir, ["check", "--write"]);
    ok(r.code === 0 && JSON.parse(readFileSync(cfgPath, "utf8")).statusMap.done === "complete", "check --write remaps a state whose status is no longer on the List", r.out);
    mock.statuses.splice(3, 0, { status: "in test", type: "custom" });
    r = await run(dir, ["check", "--write"]);
    ok(r.code === 0 && JSON.parse(readFileSync(cfgPath, "utf8")).statusMap.in_test === "in test", "check --write maps a status added in ClickUp after setup", r.out);
    mock.statuses.splice(3, 1);
  }

  // ---------- content modes and refusals ----------
  {
    // Each project has its own List in practice, so start from an empty one.
    mock.tasks.clear();
    const dir2 = makeProject();
    const leaky = STORIES.replace("so that I can see it from every side", `token ${["ghp", "a".repeat(36)].join("_")}`);
    writeFileSync(join(dir2, "docs", "requirements", "user-stories.md"), leaky);
    let r = await run(dir2, ["init", "--provider", "clickup", "--list", LIST, "--content", "minimal"]);
    ok(r.code === 0, "init in minimal mode", r.out);
    const count = mock.tasks.size;
    r = await run(dir2, ["push"]);
    ok(r.code === 0, "minimal mode does not send the narrative, so the leaked token never leaves", r.out);
    const created = [...mock.tasks.values()].slice(count);
    ok(created.length > 0 && created.every((t) => !/shopper/.test(t.description)), "minimal mode sends titles and IDs only");
    ok(/- \[ \] AC-1$/m.test(created.find((t) => t.name.startsWith("[US-1]"))?.description || ""), "minimal mode keeps criterion IDs");
    r = await run(dir2, ["comment", "US-1", "--file", "docs/qa-report.md"]);
    ok(r.code === 1 && /minimal/.test(r.out), "minimal mode refuses to send files as comments", r.out);

    mock.tasks.clear();
    const dir3 = makeProject();
    writeFileSync(join(dir3, "docs", "requirements", "user-stories.md"), leaky);
    await run(dir3, ["init", "--provider", "clickup", "--list", LIST]);
    const before = mock.tasks.size;
    r = await run(dir3, ["push"]);
    ok(r.code === 2 && /US-1: not sent/.test(r.out) && mock.tasks.size === before + 4, "full mode refuses a card whose content holds a credential", r.out);
    ok(!state(dir3).cards["US-1"], "a refused card is not recorded");
  }

  // ---------- local provider ----------
  {
    const dir4 = makeProject();
    const requestsBefore = mock.requests.length;
    let r = await run(dir4, ["init", "--provider", "local"]);
    ok(r.code === 0, "init local", r.out);
    r = await run(dir4, ["push"]);
    ok(r.code === 0 && /5 created/.test(r.out), "local push registers every card", r.out);
    r = await run(dir4, ["push"]);
    ok(r.code === 0 && /5 unchanged/.test(r.out), "a second local push changes nothing", r.out);
    r = await run(dir4, ["move", "US-1", "--state", "in_progress", "--note", "started"]);
    r = await run(dir4, ["task", "--stories", "US-1", "--agent", "frontend-developer"]);
    r = await run(dir4, ["criteria", "US-1", "--pass", "AC-1"]);
    const board = readFileSync(join(dir4, "docs", "tracker", "board.md"), "utf8");
    ok(/## In progress \(2\)/.test(board) && /US-1\/frontend-developer/.test(board), "the local board shows states and sub-tasks", board);
    ok(mock.requests.length === requestsBefore, "the local provider makes no network requests");
    writeFileSync(join(dir4, "docs", "requirements", "backlog.md"), BACKLOG + "| BUG-1 | Bug | Drag stops | QA | Must | Done (iteration 1) | US-1 |\n");
    const fresh = makeProject();
    writeFileSync(join(fresh, "docs", "requirements", "backlog.md"), readFileSync(join(dir4, "docs", "requirements", "backlog.md"), "utf8"));
    await run(fresh, ["init", "--provider", "local"]);
    await run(fresh, ["push"]);
    const bug = state(fresh).cards["BUG-1"];
    ok(bug && bug.state === "done", "a bug in both the QA report and the backlog takes the backlog status", JSON.stringify(bug));
  }

  // ---------- staged secret scan ----------
  {
    const repo = mkdtempSync(join(tmpdir(), "adlc-git-"));
    const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], { cwd: repo });
    git("init", "-q");
    writeFileSync(join(repo, "a.ts"), "export const x = 1;\n");
    git("add", "a.ts");
    let r = await run(repo, ["secrets", "--staged"]);
    ok(r.code === 0, "clean staged changes pass", r.out);
    writeFileSync(join(repo, "b.ts"), `const t = "${TOKEN}";\n`);
    writeFileSync(join(repo, ".env"), "A=1\n");
    git("add", "b.ts", ".env");
    r = await run(repo, ["secrets", "--staged"]);
    ok(r.code === 1 && /b\.ts: an added line looks like a ClickUp API token/.test(r.out) && /\.env: a \.env file/.test(r.out), "staged credentials and .env files are caught", r.out);
    ok(!r.out.includes(TOKEN), "the scan never prints the credential");
  }
  // ---------- 4.1: readiness, points, sprints, notifications, approvals ----------
  {
    mock.tasks.clear();
    mock.fail = [];
    const sp = makeProject();
    const sized = STORIES.replace("(FR-5, Must)", "(FR-5, Must, 3 pts)")
      .replace("(FR-6, Should)", "(FR-6, Should, 5 pts)\nDepends on: US-1")
      .replace("then the shade changes within 200 ms", "then the shade changes within 200 ms\n- AC-2: Given reduced motion is on, when I pick a colour, then the shade changes without a transition");
    // Sprint dates around today, so the burndown test holds whenever it runs.
    const dayOffset = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA");
    const [d0, dToday, dEnd, d2s, d2e] = [dayOffset(-1), dayOffset(0), dayOffset(10), dayOffset(14), dayOffset(24)];
    let r = await run(sp, ["ready", "--stories", "US-1,US-2"]);
    ok(r.code === 6 && /US-1 \| \? \| no \| no estimate/.test(r.out), "ready fails a story with no estimate", r.out);
    r = await run(sp, ["ready"]);
    ok(r.code === 0, "ready without a sprint scope is information only", r.out);
    writeFileSync(join(sp, "docs", "requirements", "user-stories.md"), sized.replace("5 pts", "13 pts"));
    r = await run(sp, ["ready", "--stories", "US-2"]);
    ok(r.code === 6 && /13 pts is too large/.test(r.out) && /\(warning\) depends on US-1, which is not in this sprint/.test(r.out), "ready flags oversized stories and dependencies outside the sprint", r.out);
    writeFileSync(join(sp, "docs", "requirements", "user-stories.md"), sized);
    r = await run(sp, ["ready", "--stories", "US-1,US-2"]);
    ok(r.code === 0 && /2 of 2 stories ready, 8 pts/.test(r.out), "sized stories are ready", r.out);

    await run(sp, ["init", "--provider", "clickup", "--list", LIST]);
    r = await run(sp, ["push"]);
    ok(r.code === 0 && tasksNamed("US-1")[0].points === 3 && /Depends on: US-1/.test(tasksNamed("US-2")[0].description), "points and dependencies reach ClickUp", r.out);

    // Sprint start
    r = await run(sp, ["sprint", "start", "--number", "1", "--goal", "Rotate and recolour", "--start", d0, "--end", dEnd, "--capacity", "6", "--cards", "US-1,US-2,BUG-1"]);
    const it = tasksNamed("IT-1")[0];
    ok(r.code === 0 && it && it.tags.includes("adlc-iteration") && /8 pts committed/.test(r.out) && /over capacity by 2 pts/.test(r.out), "sprint start creates the iteration card and warns when over capacity", r.out);
    ok(tasksNamed("US-1")[0].tags.includes("sprint-1") && tasksNamed("US-1")[0].due_date, "sprint cards are tagged and get the end date");
    const putsBefore = countOf("POST", /\/tag\//);
    r = await run(sp, ["sprint", "start", "--number", "1", "--goal", "Rotate and recolour", "--start", d0, "--end", dEnd, "--capacity", "6", "--cards", "US-1,US-2,BUG-1"]);
    ok(r.code === 0 && tasksNamed("IT-1").length === 1 && countOf("POST", /\/tag\//) === putsBefore, "sprint start can be run again without duplicates", r.out);
    r = await run(sp, ["sprint", "start", "--number", "2", "--goal", "Next", "--start", d2s, "--end", d2e, "--capacity", "6", "--cards", "CR-1"]);
    ok(r.code === 1 && /sprint 1 is still open/.test(r.out), "a second sprint cannot start while one is open", r.out);

    // Scope change, history, report
    r = await run(sp, ["sprint", "add", "--cards", "CR-1"]);
    ok(r.code === 0 && tasksNamed("CR-1")[0].tags.includes("sprint-1"), "sprint add tags the card", r.out);
    r = await run(sp, ["sprint", "drop", "--cards", "CR-1"]);
    ok(r.code === 0 && !tasksNamed("CR-1")[0].tags.includes("sprint-1") && tasksNamed("CR-1")[0].due_date === null, "sprint drop removes the tag and the due date", r.out);
    await run(sp, ["move", "US-1", "--state", "ready_for_release", "--at", new Date(`${dToday}T09:00:00`).toISOString()]);
    const snapshot = readFileSync(join(sp, "docs", "tracker", "remote.json"), "utf8");
    r = await run(sp, ["sprint", "report", "--print"]);
    ok(r.code === 0 && /Committed at start: 8 pts/.test(r.out) && /Completed: 3 pts/.test(r.out) && new RegExp(`\\| ${d0} \\| 8 \\| 8 \\|`).test(r.out), "sprint report shows points and the burndown", r.out);
    ok(/\| CR-1 \| add \|/.test(r.out) && /\| CR-1 \| drop \|/.test(r.out), "sprint report lists scope changes", r.out);
    ok(readFileSync(join(sp, "docs", "tracker", "remote.json"), "utf8") === snapshot && !existsSync(join(sp, "docs", "tracker", "sprint-1.md")), "sprint report --print writes nothing");
    ok(new RegExp(`\\| ${dToday} \\| 5 \\|`).test(r.out), "a move is filed under the local day it happened", r.out);
    writeFileSync(join(sp, "docs", "requirements", "user-stories.md"), sized.replace("5 pts", "3 pts"));
    r = await run(sp, ["sprint", "report", "--print"]);
    ok(/\| US-2 \| 5 \| 3 \|/.test(r.out), "re-estimates during the sprint are reported", r.out);

    // A queued move keeps its time
    mock.fail.push({ method: "PUT", pattern: /^\/task\//, status: 503, times: 20 });
    r = await run(sp, ["move", "US-2", "--state", "in_progress"]);
    const queued = state(sp).pending[0]?.argv || [];
    ok(r.code === 3 && queued.includes("--at"), "a queued move records when it was asked for", queued.join(" "));
    mock.fail = [];
    r = await run(sp, ["sprint", "close"]);
    ok(r.code === 2 && /still queued/.test(r.out), "a sprint cannot close while moves are queued", r.out);
    await run(sp, ["board"]);
    await run(sp, ["move", "BUG-1", "--state", "done"]);

    // Close and velocity
    r = await run(sp, ["sprint", "close"]);
    ok(r.code === 0 && /3 pts completed/.test(r.out) && /carried over: US-2/.test(r.out) && existsSync(join(sp, "docs", "tracker", "sprint-1.md")), "sprint close records completed points and carry-over", r.out);
    r = await run(sp, ["sprint", "report", "--print"]);
    ok(r.code === 0 && /Closed on/.test(r.out) && /\| ready_for_release \| US-1 \|/.test(r.out), "a closed sprint is reported as it stood when it closed, without naming it", r.out);
    r = await run(sp, ["sprint", "start", "--number", "1", "--goal", "Rotate and recolour", "--start", d0, "--end", dEnd, "--capacity", "6", "--cards", "US-1,US-2,BUG-1"]);
    ok(r.code === 1 && /sprint 1 is closed/.test(r.out), "a closed sprint cannot be started again", r.out);
    r = await run(sp, ["sprint", "start", "--number", "2", "--goal", "Finish recolour", "--start", d2s, "--end", d2e, "--capacity", "6", "--cards", "US-2"]);
    r = await run(sp, ["sprint", "start", "--number", "2", "--goal", "Something else", "--start", d2s, "--end", d2e, "--capacity", "9", "--cards", "US-2"]);
    ok(r.code === 1 && /different goal/.test(r.out), "restarting a sprint with different settings is refused", r.out);
    r = await run(sp, ["sprint", "report", "--print"]);
    ok(/Velocity \(last three sprints\): 3 pts/.test(r.out), "velocity comes from closed sprints", r.out);

    // Notifications
    const hook = (name) => `${baseUrl}/hook/${name}`;
    r = await run(sp, ["config", "--notify", "slack,teams"]);
    ok(r.code === 0 && /Notifications: slack, teams/.test(r.out), "config sets notification channels", r.out);
    r = await run(sp, ["notify", "--event", "approval", "--text", "Scope for sprint 2 is ready", "--link", "https://app.clickup.test/t/1"], { ADLC3D_NOTIFY_TEST: "1", SLACK_WEBHOOK_URL: hook("slack"), TEAMS_WEBHOOK_URL: hook("teams") });
    const slack = mock.webhooks.find((w) => w.path === "/hook/slack")?.body;
    const teams = mock.webhooks.find((w) => w.path === "/hook/teams")?.body;
    ok(r.code === 0 && /slack: sent/.test(r.out) && /teams: sent/.test(r.out), "notify sends to Slack and Teams (Teams answers 202)", r.out);
    ok(/\[adlc-3d\] Approval needed: Scope for sprint 2/.test(slack?.text || "") && teams?.attachments?.[0]?.content?.type === "AdaptiveCard", "payloads match Slack and Teams Workflows formats", JSON.stringify({ slack, teams }));
    mock.webhooks.length = 0;
    await run(sp, ["notify", "--event", "blocked", "--text", "<!channel> see <https://evil.test|here>"], { ADLC3D_NOTIFY_TEST: "1", SLACK_WEBHOOK_URL: hook("slack") });
    ok(/&lt;!channel&gt;/.test(mock.webhooks[0]?.body?.text || ""), "Slack text is escaped, so it cannot mention the channel", JSON.stringify(mock.webhooks[0]?.body));
    r = await run(sp, ["notify", "--event", "approval", "--text", "x"], { SLACK_WEBHOOK_URL: hook("slack"), TEAMS_WEBHOOK_URL: "https://evil.example.com/webhook" });
    ok(r.code === 0 && /slack: SLACK_WEBHOOK_URL does not point at the expected Slack/.test(r.out) && /teams: TEAMS_WEBHOOK_URL does not point/.test(r.out) && !r.out.includes("evil.example.com"), "webhooks on other hosts are refused without printing the URL", r.out);
    r = await run(sp, ["notify", "--event", "closed", "--text", "done"]);
    ok(r.code === 0 && /SLACK_WEBHOOK_URL is not set/.test(r.out), "a missing webhook is reported, not fatal", r.out);
    r = await run(sp, ["notify", "--event", "approval", "--text", `key ${["AKIA", "Q3EGRZ7PL2XN5VHM"].join("")}`], { ADLC3D_NOTIFY_TEST: "1", SLACK_WEBHOOK_URL: hook("slack") });
    ok(r.code === 1, "a notification containing a credential is refused", r.out);

    // Approvals on cards
    r = await run(sp, ["gate", "status", "--gate", "A1"]);
    ok(r.code === 5 && /approvals are off/.test(r.out), "with ClickUp approvals off, gate status gives no decision (exit 5)", r.out);
    await run(sp, ["config", "--clickup-approvals", "on"]);
    r = await run(sp, ["gate", "request", "--gate", "A1", "--text", "Sprint 2 scope: US-2"]);
    ok(r.code === 2 && /no approvers are set/.test(r.out), "a gate request needs approvers", r.out);
    r = await run(sp, ["approvers", "add", "token-owner"]);
    ok(r.code === 1 && /cannot count as approvals/.test(r.out), "the token owner cannot be an approver", r.out);
    r = await run(sp, ["approvers", "add", "alex"]);
    r = await run(sp, ["approvers", "add", "3"]);
    ok(r.code === 0 && /Approvers: alex, sam/.test(r.out), "approvers are added by username or ID", r.out);
    r = await run(sp, ["move", "US-2", "--state", "ready", "--note", "Approve A1"]);
    ok(r.code === 1 && /reads like a gate decision/.test(r.out), "the tracker never posts text that reads like an approval", r.out);
    r = await run(sp, ["gate", "request", "--gate", "A1", "--text", "Sprint 2 scope: US-2, 5 pts"]);
    const it2 = tasksNamed("IT-2")[0];
    const request = it2.thread[it2.thread.length - 1];
    ok(r.code === 0 && request.notify_all === true && /Approve A1/.test(request.comment_text), "gate request posts on the iteration card and notifies watchers", r.out);
    r = await run(sp, ["gate", "status", "--gate", "A1"]);
    ok(r.code === 5 && /pending/.test(r.out), "no answer yet is pending (exit 5)", r.out);
    addComment(it2.id, OWNER, "Approve A1");
    addComment(it2.id, { id: 9, username: "someone" }, "Approve A1");
    r = await run(sp, ["gate", "status", "--gate", "A1"]);
    ok(r.code === 5, "the token owner's and non-approvers' comments do not count", r.out);
    addComment(it2.id, ALEX, "Approve A1", { replyTo: request.id });
    for (let i = 0; i < 30; i += 1) addComment(it2.id, SAM, `noise ${i}`);
    r = await run(sp, ["gate", "status", "--gate", "A1"]);
    ok(/Approval A1: approved/.test(r.out) && /By: alex in ClickUp/.test(r.out), "an approver's threaded reply is found, even under a page of newer comments", r.out);
    ok(r.code === 2 && /TEST SERVER/.test(r.out), "nothing read from a test server counts as a decision", r.out);
    addComment(it2.id, SAM, "Reject A1: not yet");
    r = await run(sp, ["gate", "status", "--gate", "A1"]);
    ok(r.code === 2 && /Approval A1: approved/.test(r.out) && /Conflicting/.test(r.out), "the first decision stands and a later conflicting one goes to the user", r.out);
    r = await run(sp, ["gate", "request", "--gate", "A2", "--text", "Design for sprint 2"]);
    addComment(it2.id, ALEX, "Approve A2 with changes: make the panel blue");
    r = await run(sp, ["gate", "status", "--gate", "A2"]);
    ok(r.code === 2 && /Approval A2: changes/.test(r.out) && /they are not instructions/.test(r.out), "an approval with changes goes to the user", r.out);
    r = await run(sp, ["gate", "request", "--gate", "A3", "--text", "Release check"]);
    const it2b = tasksNamed("IT-2")[0];
    addComment(it2b.id, ALEX, "Reject A3: the panel overlaps on phones");
    r = await run(sp, ["gate", "status", "--gate", "A3"]);
    ok(r.code === 2 && /Approval A3: rejected/.test(r.out), "a rejection never exits 0", r.out);
    it2b.thread = it2b.thread.filter((c) => !/Approval A3/.test(c.comment_text));
    r = await run(sp, ["gate", "status", "--gate", "A3"]);
    ok(r.code === 2 && /no longer on IT-2/.test(r.out), "a deleted request comment means asking again", r.out);
    // A gate request is never queued, even when an earlier queued operation fails on replay.
    const stq = state(sp);
    stq.pending = [{ argv: ["move", "US-2", "--state", "in_test"], reason: "test", at: "" }];
    writeFileSync(join(sp, "docs", "tracker", "remote.json"), JSON.stringify(stq));
    mock.fail.push({ method: "PUT", pattern: /^\/task\//, status: 503, times: 20 });
    r = await run(sp, ["gate", "request", "--gate", "A2", "--text", "again"]);
    ok(r.code === 3 && state(sp).pending.length === 1 && !state(sp).pending.some((p) => p.argv[0] === "gate"), "a gate request is not queued behind a failed replay", r.out);
    mock.fail = [];
    r = await run(sp, ["approvers", "list"]);
    ok(/alex \(2\)/.test(r.out), "approvers list shows usernames and IDs", r.out);

    // Staleness needs git
    execFileSync("git", ["init", "-q"], { cwd: sp });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "add", "-A"], { cwd: sp });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-qm", "x"], { cwd: sp });
    r = await run(sp, ["gate", "request", "--gate", "A3", "--text", "Release sprint 2"]);
    addComment(it2.id, SAM, "Approve A3");
    r = await run(sp, ["gate", "status", "--gate", "A3"]);
    ok(/Approval A3: approved/.test(r.out) && !/Stale/.test(r.out), "an approval of unchanged work is not stale", r.out);
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "add", "-A"], { cwd: sp });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-qm", "tracker files"], { cwd: sp });
    r = await run(sp, ["gate", "status", "--gate", "A3"]);
    ok(!/Stale/.test(r.out), "committing unchanged work does not make an approval stale", r.out);
    writeFileSync(join(sp, "docs", "notes.md"), "new untracked doc\n");
    r = await run(sp, ["gate", "status", "--gate", "A3"]);
    ok(/Stale/.test(r.out), "a new untracked file makes an approval stale", r.out);
    rmSync(join(sp, "docs", "notes.md"));
    writeFileSync(join(sp, "docs", "requirements", "user-stories.md"), sized + "\n<!-- edited -->\n");
    r = await run(sp, ["gate", "status", "--gate", "A3"]);
    ok(r.code === 2 && /Stale/.test(r.out), "an approval goes stale when the work changes after the request", r.out);

    // init --force keeps later choices
    r = await run(sp, ["init", "--provider", "clickup", "--list", LIST, "--force"]);
    const cfg = JSON.parse(readFileSync(join(sp, "docs", "tracker", "config.json"), "utf8"));
    ok(cfg.approvers?.length === 2 && cfg.notify?.length === 2 && cfg.clickupApprovals === true, "init --force keeps approvers, notifications and the approvals switch", JSON.stringify(cfg));

    // Removing an estimate clears it in ClickUp
    writeFileSync(join(sp, "docs", "requirements", "user-stories.md"), STORIES);
    r = await run(sp, ["push"]);
    ok(tasksNamed("US-1")[0].points === null, "removing an estimate clears the points in ClickUp", r.out);
  }

  // ---------- 4.2: incidents, releases, UAT ----------
  {
    mock.tasks.clear();
    mock.fail = [];
    const rp = makeProject();
    mkdirSync(join(rp, "docs", "incidents"), { recursive: true });
    writeFileSync(join(rp, "docs", "incidents", "INC-1.md"), "# INC-1: Model fails to load on Safari\n\nSeverity: sev2\nStatus: open\nRelease: 1.0.0\n");
    writeFileSync(join(rp, "docs", "incidents", "notes.md"), "# not an incident\n");
    await run(rp, ["init", "--provider", "clickup", "--list", LIST]);
    let r = await run(rp, ["push"]);
    const inc = tasksNamed("INC-1")[0];
    ok(r.code === 0 && inc && inc.priority === 2 && inc.tags.includes("adlc-incident") && inc.status.status === "in progress", "an incident file becomes a card with priority from its severity", r.out);
    ok(tasksNamed("notes").length === 0, "only INC-n files are incidents");

    // Release with a Milestone card
    r = await run(rp, ["release", "start", "--version", "1.1.0", "--cards", "US-1,BUG-1,INC-1"]);
    const rel = tasksNamed("REL-1.1.0")[0];
    ok(r.code === 0 && rel && rel.custom_item_id === 1 && rel.tags.includes("adlc-release"), "release start creates a Milestone card using the workspace's type", r.out);
    ok(tasksNamed("US-1")[0].tags.includes("release-1.1.0") && tasksNamed("INC-1")[0].tags.includes("release-1.1.0"), "cards in the release are tagged");
    r = await run(rp, ["release", "start", "--version", "1.1.0", "--cards", "US-1"]);
    ok(r.code === 0 && tasksNamed("REL-1.1.0").length === 1, "release start can be run again without a duplicate card", r.out);
    r = await run(rp, ["release", "start", "--version", "1.1", "--cards", "US-1"]);
    ok(r.code === 1, "a version must be x.y.z", r.out);
    r = await run(rp, ["release", "notes", "--version", "1.1.0", "--print"]);
    ok(r.code === 0 && /### Added\n- Rotate the model \(US-1\)/.test(r.out) && /### Fixed[\s\S]*Drag stops after one second \(BUG-1\)/.test(r.out) && /Model fails to load on Safari \(INC-1\)/.test(r.out), "release notes group stories and fixes from the documents", r.out);
    mock.fail.push({ method: "PUT", pattern: /^\/task\//, status: 503, times: 20 });
    r = await run(rp, ["release", "ship", "--version", "1.1.0"]);
    const shipArgv = state(rp).pending[0]?.argv || [];
    ok(r.code === 3 && shipArgv.includes("--date"), "a queued ship keeps its date", shipArgv.join(" "));
    mock.fail = [];
    r = await run(rp, ["board"]);
    r = await run(rp, ["move", "US-1", "--state", "done"]);
    ok(tasksNamed("REL-1.1.0")[0].status.status === "complete" && state(rp).releases["1.1.0"].shipped, "the replayed ship closes the release card", r.out);
    r = await run(rp, ["release", "start", "--version", "1.1.0", "--cards", "US-2"]);
    ok(r.code === 1 && /already shipped/.test(r.out), "a shipped release cannot be reopened", r.out);

    // Milestone type refused: fall back to a tagged task
    mock.refuseCustomItem = true;
    r = await run(rp, ["release", "start", "--version", "1.2.0", "--cards", "US-2"]);
    const rel2 = tasksNamed("REL-1.2.0")[0];
    ok(r.code === 0 && rel2 && rel2.custom_item_id === 0 && rel2.tags.includes("adlc-release") && /refused the Milestone/.test(r.out), "a refused Milestone type falls back to a tagged task", r.out);
    mock.refuseCustomItem = false;

    // UAT gate is tied to a build
    await run(rp, ["sprint", "start", "--number", "1", "--goal", "Fix Safari", "--start", "2026-01-01", "--end", "2026-01-10", "--capacity", "5", "--cards", "BUG-1"]);
    await run(rp, ["sprint", "close"]);
    await run(rp, ["config", "--clickup-approvals", "on"]);
    await run(rp, ["approvers", "add", "alex"]);
    const shaA = "a".repeat(40);
    const shaB = "b".repeat(40);
    r = await run(rp, ["gate", "request", "--gate", "UAT", "--version", "1.2.0", "--build", "abc1234", "--text", "Staging check passed"]);
    ok(r.code === 1 && /full 40-character/.test(r.out), "a UAT request needs the full staging SHA", r.out);
    r = await run(rp, ["gate", "request", "--gate", "UAT", "--build", shaA, "--text", "Staging check passed"]);
    ok(r.code === 1 && /--version/.test(r.out), "a UAT request names the release", r.out);
    r = await run(rp, ["gate", "request", "--gate", "UAT", "--version", "1.2.0", "--build", shaA, "--text", "Staging check passed, see docs/deployment.md"]);
    const relCard = tasksNamed("REL-1.2.0")[0];
    ok(r.code === 0 && relCard.thread.some((c) => /Approval UAT/.test(c.comment_text)), "UAT is requested on the release card", r.out);
    r = await run(rp, ["move", "US-2", "--state", "ready", "--note", "approve UAT"]);
    ok(r.code === 1 && /reads like a gate decision/.test(r.out), "the tracker never posts a UAT decision", r.out);
    addComment(relCard.id, ALEX, "Approve UAT");
    r = await run(rp, ["gate", "status", "--gate", "UAT", "--version", "1.2.0", "--build", shaA.toUpperCase()]);
    ok(/Approval UAT: approved/.test(r.out) && !/Stale/.test(r.out), "a UAT approval of the same build is found", r.out);
    r = await run(rp, ["gate", "status", "--gate", "UAT", "--version", "1.2.0", "--build", shaB]);
    ok(r.code === 2 && /Stale/.test(r.out), "a UAT approval goes stale when staging runs another build", r.out);

    // Sprint pause and resume for a hotfix
    await run(rp, ["sprint", "start", "--number", "2", "--goal", "Feature work", "--start", "2026-01-12", "--end", "2026-01-20", "--capacity", "5", "--cards", "US-2"]);
    r = await run(rp, ["sprint", "pause", "--reason", "INC-1"]);
    ok(r.code === 0 && state(rp).activeSprint === null, "sprint pause frees the way for a hotfix sprint", r.out);
    r = await run(rp, ["sprint", "start", "--number", "3", "--goal", "Hotfix INC-1", "--start", "2026-01-13", "--end", "2026-01-14", "--capacity", "2", "--cards", "INC-1"]);
    ok(r.code === 0, "the hotfix sprint starts while the other is paused", r.out);
    r = await run(rp, ["sprint", "start", "--number", "2", "--goal", "Feature work", "--start", "2026-01-12", "--end", "2026-01-20", "--capacity", "5", "--cards", "US-2"]);
    ok(r.code === 1, "a paused sprint cannot be restarted with sprint start", r.out);
    r = await run(rp, ["sprint", "resume", "--number", "2"]);
    ok(r.code === 1 && /sprint 3 is open/.test(r.out), "a paused sprint resumes only after the hotfix sprint closes", r.out);
    await run(rp, ["sprint", "close"]);
    r = await run(rp, ["sprint", "resume", "--number", "2"]);
    ok(r.code === 0 && state(rp).activeSprint === 2, "the paused sprint resumes", r.out);

    // Ship shows its date; notes need a version
    r = await run(rp, ["release", "ship", "--version", "1.2.0", "--date", "2026-01-15"]);
    ok(r.code === 0 && /shipped 2026-01-15/.test(tasksNamed("REL-1.2.0")[0].description), "the release card shows the ship date", tasksNamed("REL-1.2.0")[0].description);
    r = await run(rp, ["release", "notes"]);
    ok(r.code === 1 && /needs --version/.test(r.out), "release notes asks for the version", r.out);

    // Severity spellings, and a workspace whose plan has no custom task types
    writeFileSync(join(rp, "docs", "incidents", "INC-2.md"), "# INC-2: Slow first load\n\nSeverity: SEV-1\nStatus: open\n");
    await run(rp, ["push"]);
    ok(tasksNamed("INC-2")[0]?.priority === 1, "SEV-1 is read as sev1", JSON.stringify(tasksNamed("INC-2")[0]?.priority));
    const cfgPath2 = join(rp, "docs", "tracker", "config.json");
    const cfg2 = JSON.parse(readFileSync(cfgPath2, "utf8"));
    delete cfg2.milestoneType;
    writeFileSync(cfgPath2, JSON.stringify(cfg2));
    const savedItems = mock.customItems;
    mock.fail.push({ method: "GET", pattern: /custom_item$/, status: 400, times: 1 });
    r = await run(rp, ["release", "start", "--version", "1.3.0", "--cards", "US-2"]);
    ok(r.code === 0 && tasksNamed("REL-1.3.0")[0]?.custom_item_id === 0, "a failed task-type lookup falls back to a tagged task", r.out);
    mock.fail = [];
    mock.customItems = savedItems;

    // Incident notification
    r = await run(rp, ["notify", "--event", "incident", "--text", "INC-1 sev2: Safari cannot load the model"]);
    ok(r.code === 0 && /No notification channel/.test(r.out), "the incident event is accepted", r.out);
  }

} finally {
  server.close();
}

if (failures) {
  console.error(`\n${failures} tracker check(s) failed, ${passes} passed.`);
  process.exit(1);
}
console.log(`All ${passes} tracker checks passed.`);
