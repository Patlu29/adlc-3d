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
      story = {
        id: storyMatch[1],
        kind: "story",
        title: storyMatch[2].trim(),
        epic,
        requirements: tokens.filter((t) => ID.test(t)),
        priority: tokens.find((t) => /^(must|should|could|won't|wont)$/i.test(t)) || "",
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
    const meta = [`Story ${card.id}`, card.priority, card.requirements.length ? `Requirements: ${card.requirements.join(", ")}` : ""];
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
  } else if (card.kind === "task") {
    lines.push(`Work by the ${card.agent} agent on ${card.parentId}${minimal || !parentTitle ? "" : `: ${parentTitle}`}`);
    lines.push("", `Handoff note: docs/handoffs/${card.agent}.md`);
  }
  // An agent task has no title of its own: it is named after its agent and, in full mode, its story.
  const title = card.kind === "task" ? (minimal || !parentTitle ? card.agent : `${card.agent}: ${parentTitle}`) : card.title;
  const name = `[${card.id}] ${title}`.slice(0, 250);
  const description = lines.join("\n");
  return { name, description, tags, priority };
}

export function hashRendered(rendered) {
  return createHash("sha256").update(JSON.stringify([rendered.name, rendered.description, rendered.priority])).digest("hex").slice(0, 16);
}

// "[US-3] Rotate the model" -> "US-3"; "[US-3/scene-developer] ..." -> "US-3/scene-developer"
export function idFromName(name) {
  const match = /^\[([A-Z]+-\d+(?:\/[a-z][a-z-]*)?)\]/.exec(String(name || ""));
  return match ? match[1] : null;
}
