// Delivery metrics from the project's own records: card state history, sprints, releases,
// incidents, the state file's Approvals and Iterations tables, the QA bugs and the agent run log.
// Pure functions; tracker/cli.mjs reads the files and writes docs/metrics/report.md.
// Every figure says where it comes from and how many items it rests on, because a median of two
// cards is not a trend.

import { COMPLETED, localDate } from "./sprints.mjs";

const FLOW_KINDS = new Set(["story", "bug", "change"]);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Below this many shipped releases, rates are noise: show counts instead.
export const MIN_RELEASES_FOR_RATES = 5;

export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const days = (ms) => round1(ms / DAY_MS);

function summary(values) {
  const n = values.filter(Number.isFinite).length;
  return { n, median: round1(percentile(values, 50)), p85: round1(percentile(values, 85)) };
}

// History entries made up by the tracker to fill a gap (cards from before 4.1, cards joining a
// sprint with no history) carry no real time and are left out.
function realHistory(entry) {
  return (entry?.history || []).filter((step) => !step.synthetic && Date.parse(step.at) > 0);
}

function firstAt(history, test) {
  const step = history.find((s) => test(s.state));
  return step ? Date.parse(step.at) : null;
}

// Cycle time: first move to in_progress until first ready_for_release or done.
// Lead time: first real record of the card until first ready_for_release or done.
export function flow(cards) {
  const rows = [];
  for (const [id, entry] of Object.entries(cards || {})) {
    if (!FLOW_KINDS.has(entry.kind)) continue;
    const history = realHistory(entry);
    const finished = firstAt(history, (s) => COMPLETED.has(s));
    if (finished == null) continue;
    const started = firstAt(history, (s) => s === "in_progress");
    const recorded = history.length ? Date.parse(history[0].at) : null;
    rows.push({
      id,
      kind: entry.kind,
      cycleDays: started != null && finished >= started ? (finished - started) / DAY_MS : null,
      leadDays: recorded != null && finished >= recorded ? (finished - recorded) / DAY_MS : null,
    });
  }
  const byKind = {};
  for (const kind of FLOW_KINDS) {
    const of = rows.filter((r) => r.kind === kind);
    if (of.length) byKind[kind] = { cycle: summary(of.map((r) => r.cycleDays)), lead: summary(of.map((r) => r.leadDays)) };
  }
  return { finished: rows.length, cycle: summary(rows.map((r) => r.cycleDays)), lead: summary(rows.map((r) => r.leadDays)), byKind };
}

// "2026-11-25 14:05 AEDT" -> minutes on a common clock. Both times in an incident file are written
// in the same zone, so the zone label is ignored.
// 12-hour times ("2:30 pm") are converted.
function stamp(text) {
  const m = /(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?)?/i.exec(String(text || ""));
  if (!m) return null;
  let hour = Number(m[2] || 0);
  if (m[4]) hour = (hour % 12) + (m[4].toLowerCase() === "p" ? 12 : 0);
  const t = Date.parse(`${m[1]}T${String(hour).padStart(2, "0")}:${m[3] || "00"}:00Z`);
  return Number.isNaN(t) ? null : t;
}

export function dora({ releases, cards, incidents }) {
  const shipped = Object.values(releases || {})
    .filter((r) => r.shipped)
    .sort((a, b) => a.shipped.localeCompare(b.shipped));
  const result = { shipped: shipped.map((r) => ({ version: r.version, date: r.shipped })), ratesShown: shipped.length >= MIN_RELEASES_FOR_RATES };

  // Deployment frequency: shipped releases per 30 days, over the span from the first to the last.
  if (result.ratesShown) {
    const span = (Date.parse(shipped.at(-1).shipped) - Date.parse(shipped[0].shipped)) / DAY_MS;
    result.perThirtyDays = round1(span > 0 ? ((shipped.length - 1) / span) * 30 : null);
  }

  // Cycle time to ship: for each shipped release, its cards' first in_progress to the ship date.
  result.toShip = shipped.map((r) => {
    const shipAt = Date.parse(`${r.shipped}T12:00:00`);
    const spans = (r.cards || [])
      .map((id) => firstAt(realHistory(cards?.[id]), (s) => s === "in_progress"))
      .filter((t) => t != null && t <= shipAt)
      .map((t) => (shipAt - t) / DAY_MS);
    return { version: r.version, ...summary(spans) };
  });

  // Change failure rate: shipped releases that an incident names under "Introduced in". The first
  // version number in the line counts, so "v1.1.0 (CR-1)" is 1.1.0.
  const versions = new Set(shipped.map((r) => r.version));
  const named = (i) => /\d+\.\d+\.\d+/.exec(String(i.introducedIn || ""))?.[0] || "";
  const failed = new Set((incidents || []).map(named).filter((v) => versions.has(v)));
  result.failedReleases = [...failed].sort();
  result.unattributed = (incidents || []).filter((i) => !String(i.introducedIn || "").trim()).map((i) => i.id);
  // Named a release the records do not show as shipped, or something that is not a version.
  result.unmatched = (incidents || []).filter((i) => String(i.introducedIn || "").trim() && !versions.has(named(i))).map((i) => `${i.id} (${i.introducedIn})`);
  if (result.ratesShown) result.changeFailureRate = Math.round((failed.size / shipped.length) * 100);

  // Time to restore: Detected to Mitigated, in hours.
  const restore = (incidents || [])
    .map((i) => ({ id: i.id, detected: stamp(i.detected), mitigated: stamp(i.mitigated) }))
    .filter((i) => i.detected != null && i.mitigated != null && i.mitigated >= i.detected)
    .map((i) => ({ id: i.id, hours: round1((i.mitigated - i.detected) / HOUR_MS) }));
  result.restore = { incidents: restore, ...summary(restore.map((r) => r.hours)) };
  result.openIncidents = (incidents || []).filter((i) => !/^resolved/i.test(i.status || "")).map((i) => `${i.id} ${i.severity || ""}`.trim());
  return result;
}

// Rows of the first markdown table under a "## <heading>" in the state file.
export function tableUnder(text, heading) {
  const lines = String(text || "").split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${heading}\\b`, "i").test(l.trim()));
  if (start < 0) return [];
  const rows = [];
  let header = null;
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (/^#{1,2}\s/.test(line)) break;
    if (!line.startsWith("|")) {
      if (header && rows.length) break;
      continue;
    }
    const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (!header) header = cells.map((c) => c.toLowerCase());
    else rows.push(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));
  }
  return rows;
}

// The Decision column uses the lifecycle skill's words: Approved, Approved with changes, Rejected.
export function decisionKind(text) {
  const t = String(text || "").toLowerCase();
  if (/^reject/.test(t)) return "rejected";
  if (/^approved?\s+with\s+changes/.test(t)) return "changes";
  if (/^approved?\b/.test(t)) return "approved";
  return "other";
}

// For each gate, how many gate decisions were approved at the first answer.
export function approvals(statusText) {
  const rows = tableUnder(statusText, "Approvals");
  const firsts = new Map();
  const gates = {};
  for (const row of rows) {
    const gate = (/^(A[123]|UAT)\b/i.exec(row.gate || "")?.[1] || "").toUpperCase();
    if (!gate) continue;
    const kind = decisionKind(row.decision);
    const g = (gates[gate] ||= { decided: 0, firstTime: 0, withChanges: 0, rejected: 0 });
    if (kind === "rejected") g.rejected += 1;
    if (kind === "changes") g.withChanges += 1;
    const key = `${gate}|${row.iteration}`;
    if (!firsts.has(key) && kind !== "other") {
      firsts.set(key, kind);
      g.decided += 1;
      if (kind === "approved") g.firstTime += 1;
    }
  }
  return gates;
}

export function iterations(statusText) {
  return tableUnder(statusText, "Iterations").map((r) => ({ number: r["#"], type: r.type, closed: r.closed, outcome: r.outcome }));
}

export function bugs(list) {
  const out = { open: {}, closed: {} };
  for (const bug of list || []) {
    const severity = String(bug.fields?.severity || "unknown").toLowerCase().split(/[\s,(]/)[0] || "unknown";
    const closed = /^(fixed|closed|done|verified)/i.test(bug.fields?.status || "");
    const bucket = closed ? out.closed : out.open;
    bucket[severity] = (bucket[severity] || 0) + 1;
  }
  return out;
}

// Parse the run log; malformed lines are counted, not fatal.
export function parseRuns(text) {
  const events = [];
  let bad = 0;
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e && typeof e === "object" && typeof e.agent === "string") events.push(e);
      else bad += 1;
    } catch {
      bad += 1;
    }
  }
  return { events, bad };
}

// One run per agentId: a foreground run logs a "run" event and a "stop" event; a background run's
// "run" event has no totals. Events without an agentId stay separate.
export function mergeRuns(events) {
  const byId = new Map();
  const loose = [];
  for (const e of events) {
    if (!e.agentId) {
      if (e.event === "run") loose.push({ ...e });
      continue;
    }
    const run = byId.get(e.agentId);
    if (!run) byId.set(e.agentId, { ...e, stopped: e.event === "stop" });
    else if (e.event === "run") byId.set(e.agentId, { ...run, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v != null)), stopped: run.stopped });
    else run.stopped = true;
  }
  return [...byId.values(), ...loose].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export function agentTelemetry(runs) {
  const agents = {};
  const byIteration = {};
  for (const r of runs) {
    const a = (agents[r.agent] ||= { runs: 0, tokens: 0, tokensUnknown: 0, durationMs: 0, toolUses: 0, failed: 0 });
    a.runs += 1;
    if (Number.isFinite(r.tokens)) a.tokens += r.tokens;
    else a.tokensUnknown += 1;
    if (Number.isFinite(r.durationMs)) a.durationMs += r.durationMs;
    if (Number.isFinite(r.toolUses)) a.toolUses += r.toolUses;
    if (r.status && !["completed", "async_launched", "unknown"].includes(r.status)) a.failed += 1;
    const it = r.iteration ?? "unknown";
    const i = (byIteration[it] ||= { runs: 0, tokens: 0, durationMs: 0 });
    i.runs += 1;
    if (Number.isFinite(r.tokens)) i.tokens += r.tokens;
    if (Number.isFinite(r.durationMs)) i.durationMs += r.durationMs;
  }
  // Repeat delegations: the same agent sent again for the same cards in the same iteration and phase.
  // Phase 4 is left out, because the regression suite runs again by design.
  const groups = new Map();
  for (const r of runs) {
    if (!r.cards?.length || r.iteration == null || !r.phase || String(r.phase) === "4") continue;
    const key = `${r.iteration}|${r.phase}|${r.agent}|${[...r.cards].sort().join(",")}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  const repeats = [...groups.entries()]
    .filter(([, n]) => n > 1)
    .map(([key, n]) => {
      const [iteration, phase, agent, cards] = key.split("|");
      return { iteration, phase, agent, cards, runs: n };
    });
  return { agents, byIteration, repeats };
}

const fmt = (v, unit = "") => (v == null ? "n/a" : `${v}${unit}`);
const stat = (s, unit) => (s.n ? `median ${fmt(s.median, unit)}, 85th percentile ${fmt(s.p85, unit)} (n=${s.n})` : "no data");
const thousands = (n) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : String(n));
const minutes = (ms) => `${Math.round(ms / 60_000)} min`;

export function renderMetrics({ today, cards, sprints, releases, incidents, statusText, bugList, runs, badRunLines = 0, tracker }) {
  const f = flow(cards);
  const d = dora({ releases, cards, incidents });
  const gates = approvals(statusText);
  const its = iterations(statusText);
  const b = bugs(bugList);
  const t = agentTelemetry(runs);
  const lines = [
    "# Delivery metrics",
    "",
    `Generated by the adlc-3d tracker on ${today}. Do not edit; run \`metrics\` again.`,
    "",
    "## Flow",
    "",
  ];
  if (!tracker) lines.push("No tracker is set up, so there is no card history. Flow and lead times need `Tracker: local` or ClickUp.", "");
  else {
    lines.push(
      `Source: card state history in docs/tracker/remote.json. ${f.finished} stories, bugs and changes have reached ready for release or done. Moves made directly in ClickUp are not counted.`,
      "",
      "| | Cycle time (in progress to done), days | Lead time (recorded to done), days |",
      "|---|---|---|",
      `| All | ${stat(f.cycle)} | ${stat(f.lead)} |`,
      ...Object.entries(f.byKind).map(([kind, s]) => `| ${kind} | ${stat(s.cycle)} | ${stat(s.lead)} |`),
      ""
    );
  }
  const closedSprints = Object.values(sprints || {}).filter((s) => s.closed).sort((a, b) => a.number - b.number);
  if (closedSprints.length) {
    lines.push("| Sprint | Committed pts | Completed pts | Carried over |", "|---|---|---|---|");
    for (const s of closedSprints) lines.push(`| ${s.number} | ${Object.values(s.committed).reduce((a, c) => a + c, 0)} | ${s.closed.completed} | ${s.closed.carryOver.length} |`);
    lines.push("");
  }

  lines.push("## Delivery (DORA, approximated)", "", "Sources: `release ship` dates, card history and docs/incidents/. These are the four DORA measures as far as this project's records allow, not a measured pipeline.", "");
  if (!d.shipped.length) {
    lines.push(tracker ? "No release has shipped to production yet." : "No releases are recorded: `release ship` records them, and it needs a tracker (`local` is enough). Shipped releases, cycle time to ship and the change failure rate stay empty until then.", "");
    if (d.unmatched.length) lines.push(`- **Incidents naming a release not recorded as shipped:** ${d.unmatched.join(", ")}`, "");
  }
  else {
    lines.push(
      `- **Releases shipped:** ${d.shipped.length}${d.ratesShown ? `, ${fmt(d.perThirtyDays)} per 30 days` : ` (rates are shown from ${MIN_RELEASES_FOR_RATES})`}. Last: ${d.shipped.slice(-5).map((r) => `${r.version} on ${r.date}`).join(", ")}`,
      `- **Cycle time to ship** (a card's first in progress to the release's production date, days): ${d.toShip.map((r) => `${r.version} ${r.n ? `median ${r.median} (n=${r.n})` : "no card history"}`).join("; ")}`,
      `- **Change failure rate:** ${d.ratesShown ? `${d.changeFailureRate}% ` : ""}${d.failedReleases.length} of ${d.shipped.length} shipped releases caused an incident${d.failedReleases.length ? ` (${d.failedReleases.join(", ")})` : ""}, from each incident's \`Introduced in:\` line${d.unattributed.length ? `. Not yet attributed: ${d.unattributed.join(", ")}` : ""}${d.unmatched.length ? `. Naming no shipped release: ${d.unmatched.join(", ")}` : ""}`,
      ""
    );
  }
  lines.push(`- **Time to restore** (Detected to Mitigated, hours): ${d.restore.n ? `${stat(d.restore, " h")}` : "no incident with both times recorded"}`);
  lines.push(`- **Incidents not resolved:** ${d.openIncidents.join(", ") || "none"}`, "");

  lines.push("## Quality", "", "Source: the Approvals table in docs/project-status.md and docs/qa-report.md.", "");
  if (Object.keys(gates).length) {
    lines.push("| Gate | Decisions | Approved at the first answer | Approved with changes | Rejections |", "|---|---|---|---|---|");
    for (const [gate, g] of Object.entries(gates)) lines.push(`| ${gate} | ${g.decided} | ${g.firstTime} | ${g.withChanges} | ${g.rejected} |`);
    lines.push("");
  } else lines.push("No gate decisions recorded yet.", "");
  const sev = (o) => Object.entries(o).map(([k, v]) => `${v} ${k}`).join(", ") || "none";
  lines.push(`- **Bugs open:** ${sev(b.open)}`, `- **Bugs closed:** ${sev(b.closed)}`, `- **Escaped to production (incidents):** ${(incidents || []).length}`, "");
  if (its.length) {
    const byType = {};
    for (const i of its) {
      const k = i.type || "unknown";
      byType[k] = (byType[k] || 0) + 1;
    }
    lines.push(`- **Iterations by type:** ${Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(", ")}`, "");
  }

  lines.push("## Agent runs", "");
  if (!runs.length) lines.push("No agent runs logged yet. The run log hook records each delegation in docs/metrics/runs.jsonl.", "");
  else {
    lines.push(
      "Source: docs/metrics/runs.jsonl, written by the plugin's run log hook. Tokens are as reported by Claude Code for each delegated agent; the Tech Lead's own conversation is not included. No money figures are given, because prices depend on the plan and change over time.",
      "",
      "| Agent | Runs | Tokens | Time | Tool uses | Not completed |",
      "|---|---|---|---|---|---|"
    );
    for (const [agent, a] of Object.entries(t.agents).sort()) lines.push(`| ${agent} | ${a.runs} | ${thousands(a.tokens)}${a.tokensUnknown ? ` (+${a.tokensUnknown} unknown)` : ""} | ${minutes(a.durationMs)} | ${a.toolUses} | ${a.failed} |`);
    lines.push("", "| Iteration | Runs | Tokens | Time |", "|---|---|---|---|");
    for (const [it, i] of Object.entries(t.byIteration)) lines.push(`| ${it} | ${i.runs} | ${thousands(i.tokens)} | ${minutes(i.durationMs)} |`);
    lines.push("");
    if (t.repeats.length) {
      lines.push("Repeat delegations (the same agent sent again for the same cards in one phase; phase 4 left out). A repeat is not always rework: check the handoff notes.", "", "| Iteration | Phase | Agent | Cards | Runs |", "|---|---|---|---|---|");
      for (const r of t.repeats) lines.push(`| ${r.iteration} | ${r.phase} | ${r.agent} | ${r.cards} | ${r.runs} |`);
      lines.push("");
    }
    if (badRunLines) lines.push(`${badRunLines} line(s) of the run log could not be read and were skipped.`, "");
  }
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export { localDate };
