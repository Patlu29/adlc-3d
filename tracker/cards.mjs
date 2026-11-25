// Reads the project documents into cards, and renders a card for the tracker.
// The documents are the source of truth for card content; the tracker is the source of truth for status.

import { createHash } from "node:crypto";

export const STATES = ["backlog", "ready", "in_progress", "in_review", "in_test", "ready_for_release", "done", "blocked"];

const PRIORITY = { must: 2, should: 3, could: 4 };
const SEVERITY = { critical: 1, major: 2, minor: 3 };
const ID = /^[A-Z]+-\d+$/;

export function parseStories(text) {
  const stories = [];
  let epic = null;
  let story = null;
  let inCriteria = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    const epicMatch = /^##\s+Epic\s+(E\d+)\s*:\s*(.+)$/i.exec(line);
    if (epicMatch) {
      epic = { id: epicMatch[1].toUpperCase(), title: epicMatch[2].trim() };
      story = null;
      continue;
    }
    const storyMatch = /^###\s+(US-\d+)\s*:\s*(.+?)\s*(?:\(([^)]*)\))?\s*$/.exec(line);
    if (storyMatch) {
      const tokens = (storyMatch[3] || "").split(",").map((t) => t.trim());
      const pointsToken = tokens.map((t) => /^(\d+(?:\.5)?)\s*(?:pts?|points?)$/i.exec(t)).find(Boolean);
      story = {
        id: storyMatch[1],
        kind: "story",
        title: storyMatch[2].trim(),
        epic,
        requirements: tokens.filter((t) => ID.test(t)),
        priority: tokens.find((t) => /^(must|should|could|won't|wont)$/i.test(t)) || "",
        points: pointsToken ? Number(pointsToken[1]) : null,
        dependsOn: [],
        narrative: [],
        criteria: [],
      };
      stories.push(story);
      inCriteria = false;
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      story = null;
      continue;
    }
    if (!story) continue;
    const depends = /^(?:\*\*)?Depends on(?::\*\*|\*\*:|:)\s*(.+)$/i.exec(line.trim());
    if (depends && !inCriteria) {
      story.dependsOn = depends[1].split(/[,\s]+/).filter((t) => ID.test(t));
      continue;
    }
    if (/^\*\*Acceptance criteria\*\*/i.test(line.trim())) {
      inCriteria = true;
      continue;
    }
    const bullet = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/.exec(line);
    if (inCriteria && bullet) {
      const labelled = /^(AC-\d+)\s*[:.-]\s*(.+)$/.exec(bullet[1]);
      const id = labelled ? labelled[1] : `AC-${story.criteria.length + 1}`;
      story.criteria.push({ id, text: (labelled ? labelled[2] : bullet[1]).trim() });
    } else if (!inCriteria && line.trim()) {
      story.narrative.push(line.trim());
    }
  }
  return stories;
}

export function parseBacklog(text) {
  const items = [];
  let columns = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("|")) {
      columns = null;
      continue;
    }
    const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (!columns) {
      columns = cells.map((c) => c.toLowerCase());
      continue;
    }
    const get = (name) => cells[columns.indexOf(name)] ?? "";
    const id = get("id");
    if (!ID.test(id) || /^US-/.test(id)) continue;
    const type = get("type");
    items.push({
      id,
      kind: /^bug$/i.test(type) ? "bug" : "change",
      title: get("summary") || id,
      type,
      priority: get("priority"),
      status: get("status"),
      links: get("links"),
      source: get("source"),
    });
  }
  return items;
}

export function parseBugs(text) {
  const bugs = [];
  let bug = null;
  let field = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^###\s+(BUG-\d+)\s*:\s*(.+)$/.exec(line);
    if (heading) {
      bug = { id: heading[1], kind: "bug", title: heading[2].trim(), fields: {} };
      bugs.push(bug);
      field = null;
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      bug = null;
      continue;
    }
    if (!bug) continue;
    const top = /^[-*]\s+([A-Za-z ]+):\s*(.*)$/.exec(raw);
    if (top) {
      field = top[1].trim().toLowerCase();
      bug.fields[field] = top[2].trim();
      continue;
    }
    // An indented list under a field, such as numbered steps to reproduce, belongs to that field.
    const nested = /^\s+(?:[-*]|\d+[.)])\s+(.+)$/.exec(raw);
    if (nested && field) bug.fields[field] = [bug.fields[field], nested[1].trim()].filter(Boolean).join("; ");
  }
  return bugs;
}

// The state a card starts in when it is first created. After that only `move` changes it.
export function initialState(card) {
  const status = String(card.status || card.fields?.status || "").toLowerCase();
  if (/^(done|declined|fixed|closed)/.test(status)) return "done";
  if (/^in progress/.test(status) || /^reopened/.test(status)) return "in_progress";
  if (card.kind === "bug" && !status) return "ready";
  return "backlog";
}

const RESULT_TEXT = { pass: "passed", fail: "FAILED", untested: "not tested" };

function criteriaLines(card, results, minimal) {
  return (card.criteria || []).map((c) => {
    const result = results?.[c.id];
    const box = result === "pass" ? "[x]" : "[ ]";
    const suffix = result ? ` (${RESULT_TEXT[result]})` : "";
    return minimal ? `- ${box} ${c.id}${suffix}` : `- ${box} ${c.id}: ${c.text}${suffix}`;
  });
}

// Builds the name, description, tags and priority sent to the tracker.
// content "minimal" sends titles and IDs only; the details stay in the repository.
export function renderCard(card, { content = "full", results = {}, parentTitle = "" } = {}) {
  const minimal = content === "minimal";
  const lines = [];
  const tags = ["adlc", `adlc-${card.kind}`];
  let priority = null;
  if (card.kind === "story") {
    priority = PRIORITY[String(card.priority).toLowerCase()] ?? null;
    if (card.epic) tags.push(`epic-${card.epic.id.toLowerCase()}`);
    const meta = [
      `Story ${card.id}`,
      card.priority,
      card.points != null ? `${card.points} pts` : "",
      card.requirements.length ? `Requirements: ${card.requirements.join(", ")}` : "",
      card.dependsOn?.length ? `Depends on: ${card.dependsOn.join(", ")}` : "",
    ];
    lines.push(meta.filter(Boolean).join(" | "));
    if (card.epic) lines.push(`Epic ${card.epic.id}${minimal ? "" : `: ${card.epic.title}`}`);
    if (!minimal && card.narrative.length) lines.push("", card.narrative.join(" "));
    lines.push("", "Acceptance criteria", ...criteriaLines(card, results, minimal));
    lines.push("", "Source: docs/requirements/user-stories.md");
  } else if (card.kind === "bug") {
    const severity = String(card.fields?.severity || card.priority || "").toLowerCase().split(/\W/)[0];
    priority = SEVERITY[severity] ?? PRIORITY[severity] ?? null;
    lines.push(`Bug ${card.id}${severity ? ` | ${severity}` : ""}`);
    const breaks = card.fields?.breaks || card.links;
    if (breaks) lines.push(`Breaks: ${breaks}`);
    if (!minimal) {
      for (const key of ["owner", "steps to reproduce", "expected", "actual", "deterministic", "evidence"])
        if (card.fields?.[key]) lines.push(`${key[0].toUpperCase()}${key.slice(1)}: ${card.fields[key]}`);
    }
    lines.push("", `Source: ${card.fields ? "docs/qa-report.md" : "docs/requirements/backlog.md"}`);
  } else if (card.kind === "change") {
    priority = PRIORITY[String(card.priority).toLowerCase()] ?? null;
    lines.push(`Backlog item ${card.id} | ${card.type || "Change"}${card.priority ? ` | ${card.priority}` : ""}`);
    if (card.links) lines.push(`Links: ${card.links}`);
    if (!minimal && card.source) lines.push(`Source: ${card.source}`);
    lines.push("", "Recorded in docs/requirements/backlog.md");
  } else if (card.kind === "iteration") {
    lines.push(`Sprint ${card.number} | ${card.start} to ${card.end} | capacity ${card.capacity} pts | committed ${card.committedPoints} pts`);
    lines.push("", `Cards: ${card.cards.join(", ")}`);
    lines.push("", "Approval requests and decisions for this iteration are comments on this card.");
  } else if (card.kind === "task") {
    lines.push(`Work by the ${card.agent} agent on ${card.parentId}${minimal || !parentTitle ? "" : `: ${parentTitle}`}`);
    lines.push("", `Handoff note: docs/handoffs/${card.agent}.md`);
  }
  // An agent task has no title of its own: it is named after its agent and, in full mode, its story.
  const title = card.kind === "task" ? (minimal || !parentTitle ? card.agent : `${card.agent}: ${parentTitle}`) : card.title;
  const name = `[${card.id}] ${title}`.slice(0, 250);
  const description = lines.join("\n");
  return { name, description, tags, priority, points: card.kind === "story" ? card.points ?? null : null };
}

// Points join the hash only when a story has them, so registries written by 4.0 stay valid.
export function hashRendered(rendered) {
  const parts = [rendered.name, rendered.description, rendered.priority];
  if (rendered.points != null) parts.push(rendered.points);
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

const FIBONACCI = new Set([1, 2, 3, 5, 8]);

// The machine-checkable part of the Definition of Ready in the user-stories skill.
export function readiness(story, allIds) {
  const problems = [];
  const warnings = [];
  if (!story.requirements.length) problems.push("no requirement ID");
  if (/^won'?t$/i.test(story.priority)) problems.push("priority Won't cannot enter a sprint");
  else if (!/^(must|should|could)$/i.test(story.priority)) problems.push("no MoSCoW priority");
  const n = story.criteria.length;
  if (n < 2) problems.push(`${n} acceptance criteria (needs at least 2)`);
  else if (n > 6) warnings.push(`${n} acceptance criteria; consider splitting the story`);
  if (story.points == null) problems.push("no estimate");
  else if (story.points > 8) problems.push(`${story.points} pts is too large; split the story`);
  else if (!FIBONACCI.has(story.points)) problems.push(`${story.points} pts is not 1, 2, 3, 5 or 8`);
  for (const dep of story.dependsOn || []) if (!allIds.has(dep)) problems.push(`depends on ${dep}, which does not exist`);
  return { problems, warnings };
}

// "[US-3] Rotate the model" -> "US-3"; "[US-3/scene-developer] ..." -> "US-3/scene-developer"
export function idFromName(name) {
  const match = /^\[([A-Z]+-\d+(?:\/[a-z][a-z-]*)?)\]/.exec(String(name || ""));
  return match ? match[1] : null;
}
