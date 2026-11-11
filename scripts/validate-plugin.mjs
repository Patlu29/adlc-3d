#!/usr/bin/env node
// Checks the plugin for the mistakes that break it silently: bad frontmatter,
// agents that preload a skill that does not exist, references to missing
// agents or skills, and version numbers that have drifted apart.
// Run from the repository root: node scripts/validate-plugin.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);

const REQUIRED_AGENT_SKILLS = ["working-principles", "team-conventions"];
const MAX_DESCRIPTION = 1024;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"));
  } catch (error) {
    fail(path, `cannot be parsed as JSON (${error.message})`);
    return null;
  }
}

// Minimal frontmatter reader: "key: value" pairs and "  - item" lists.
function readFrontmatter(path) {
  const text = readFileSync(join(root, path), "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    fail(path, "missing frontmatter block");
    return null;
  }
  const data = {};
  let listKey = null;
  for (const line of match[1].split("\n")) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(item[1].trim());
      continue;
    }
    const pair = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (!pair) {
      if (line.trim()) fail(path, `frontmatter line not understood: "${line}"`);
      continue;
    }
    const [, key, value] = pair;
    if (value === "") {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = value.replace(/^"(.*)"$/, "$1");
      listKey = null;
    }
  }
  return { data, body: match[2] };
}

// Manifests
const plugin = readJson(".claude-plugin/plugin.json");
const marketplace = readJson(".claude-plugin/marketplace.json");
if (plugin && marketplace) {
  const entry = (marketplace.plugins ?? []).find((p) => p.name === plugin.name);
  if (!entry) {
    fail(".claude-plugin/marketplace.json", `no entry named "${plugin.name}"`);
  } else if (entry.version !== plugin.version) {
    fail(
      ".claude-plugin/marketplace.json",
      `version ${entry.version} does not match plugin.json ${plugin.version}`
    );
  }
  if (!/^\d+\.\d+\.\d+$/.test(plugin.version ?? "")) {
    fail(".claude-plugin/plugin.json", "version is not in the form 1.2.3");
  }
}
readJson(".mcp.json");

// Skills
const skillNames = readdirSync(join(root, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const skills = new Map();
for (const name of skillNames) {
  const path = `skills/${name}/SKILL.md`;
  if (!existsSync(join(root, path))) {
    fail(path, "missing");
    continue;
  }
  const parsed = readFrontmatter(path);
  if (!parsed) continue;
  skills.set(name, { path, ...parsed });
  const { data } = parsed;
  if (data.name !== name) fail(path, `name "${data.name}" does not match folder "${name}"`);
  if (!data.description) fail(path, "missing description");
  else if (data.description.length > MAX_DESCRIPTION)
    fail(path, `description is ${data.description.length} characters (limit ${MAX_DESCRIPTION})`);
  else if (!/\b(Use|Preloaded)\b/.test(data.description))
    fail(path, 'description should say when to use the skill ("Use when ...")');
}

// Agents
const agentFiles = readdirSync(join(root, "agents")).filter((file) => file.endsWith(".md"));
const agentNames = new Set();
const agents = [];
for (const file of agentFiles) {
  const path = `agents/${file}`;
  const parsed = readFrontmatter(path);
  if (!parsed) continue;
  agents.push({ path, ...parsed });
  const { data, body } = parsed;
  const expected = file.replace(/\.md$/, "");
  agentNames.add(expected);
  if (data.name !== expected) fail(path, `name "${data.name}" does not match file name`);
  for (const key of ["description", "tools", "model"]) {
    if (!data[key]) fail(path, `missing ${key}`);
  }
  const preloaded = Array.isArray(data.skills) ? data.skills : [];
  for (const skill of preloaded) {
    if (!skills.has(skill)) fail(path, `preloads skill "${skill}", which does not exist`);
  }
  for (const skill of REQUIRED_AGENT_SKILLS) {
    if (!preloaded.includes(skill)) fail(path, `must preload "${skill}"`);
  }
  for (const heading of ["## How you think", "## Before you start", "## Boundaries", "## Before you report"]) {
    if (!body.includes(heading)) fail(path, `missing section "${heading}"`);
  }
}

// Cross-references in every skill and agent body
const documents = [...skills.values(), ...agents];
for (const { path, body } of documents) {
  for (const [, name] of body.matchAll(/\bthe ([a-z0-9]+(?:-[a-z0-9]+)+) skill\b/g)) {
    if (!skills.has(name)) fail(path, `refers to the "${name}" skill, which does not exist`);
  }
  if (plugin) {
    for (const [, name] of body.matchAll(new RegExp(`${plugin.name}:([a-z0-9-]+)`, "g"))) {
      if (!agentNames.has(name) && !skills.has(name))
        fail(path, `refers to "${plugin.name}:${name}", which is not an agent or skill`);
    }
  }
}

// Every skill should be reachable: preloaded by an agent or invocable by the user
const preloadedAnywhere = new Set(agents.flatMap(({ data }) => data.skills ?? []));
for (const [name, { path, data }] of skills) {
  if (!preloadedAnywhere.has(name) && data["user-invocable"] === "false")
    fail(path, "is not preloaded by any agent and is not user-invocable, so nothing can reach it");
}

if (errors.length > 0) {
  console.error(`Plugin validation failed with ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(
  `Plugin is valid: ${agents.length} agents, ${skills.size} skills, version ${plugin?.version}.`
);
