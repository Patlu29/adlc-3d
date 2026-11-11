---
name: team-conventions
description: Shared rules for every agent on the 3D web application team, covering folder ownership, project documents and which one wins in a conflict, the contracts between agents, handoff notes, open questions, the definition of done and the report format. Preloaded into every agent in this plugin.
user-invocable: false
---

# Team conventions

You are one member of a team of specialist agents building a 3D web application. These rules keep the team from overwriting each other's work and make sure context passes cleanly between agents. The working-principles skill covers how to think and verify; this skill covers how the team fits together.

## Folder ownership

| Path | Owner |
|---|---|
| `docs/requirements/` | product-manager |
| `docs/architecture.md`, `docs/decisions/`, root config files (`package.json`, `index.html`, `.gitignore`, `.env.example`, `.nvmrc`, Vite, TypeScript, ESLint and Prettier config) | architect |
| `docs/design-spec.md`, `src/styles/` | ux-ui-designer |
| `src/scene/` (except shaders and materials) | scene-developer |
| `src/scene/shaders/`, `src/scene/materials/`, `public/models/`, `public/textures/`, `public/env/`, `public/draco/`, `public/basis/` | technical-artist |
| `src/ui/`, `src/state/`, `src/hooks/`, `src/data/`, `src/App.tsx`, `src/main.tsx` | frontend-developer |
| `server/`, `docs/api.md` | backend-developer |
| `docs/performance.md` | performance-optimiser |
| `tests/e2e/`, `playwright.config.ts`, `docs/qa-report.md` | qa-engineer |
| `tests/unit/<area>/` | The developer who owns the code under test |
| `.github/`, `infra/`, hosting config, `docs/deployment.md` | devops-engineer |
| `docs/project-status.md` | The Tech Lead. Read only for every agent |
| `assets/source/` | The user. Read only for every agent |

Only edit paths you own. If a path you don't own needs a change, describe the change under **Requests for other agents** in your handoff note and name the owner. The performance-optimiser has a documented exception for optimisation changes.

Only the architect adds, removes or upgrades dependencies. If you need a package, request it.

## Project documents

Read the documents your task depends on before you start. Do not rely on memory of earlier work.

| Document | Contains |
|---|---|
| `docs/project-status.md` | Current phase, the user's approvals and decisions, environment notes |
| `docs/requirements/requirements.md` | Goals, scope, functional and non-functional requirements |
| `docs/requirements/user-stories.md` | Stories and acceptance criteria |
| `docs/architecture.md` | Stack, structure, data flow and the contracts between agents |
| `docs/design-spec.md` | Layout, tokens, interactions, accessibility |
| `docs/api.md` | Backend API contract |
| `docs/handoffs/<agent-name>.md` | Each agent's latest handoff note |

### When documents disagree

1. A decision by the user, in your task prompt or recorded in `docs/project-status.md`, wins over everything
2. Then the requirements and user stories
3. Then the design spec for look and behaviour, and the architecture for technical structure
4. Handoff notes never override a document

Follow the winner, and always report the conflict under **Open questions**, naming the owner of the document that needs correcting. Never resolve a contradiction silently.

## Contracts between agents

Agents build in parallel, so the points where their work meets are agreed first. The architect writes these in the **Contracts** section of `docs/architecture.md` before the build starts:

| Contract | Defines |
|---|---|
| Store contract | Every shared store field and action, its type, which agent writes it and which reads it |
| Test hook | The shape of `window.__APP_TEST__` and the test-mode URL parameters (see the state-management skill) |
| Asset manifest | The file name and path of each model, texture and environment map, the names of nodes the scene relies on, and the decoder path (such as `/draco/`) if models are compressed |
| Label styles | The global class name for labels inside the scene is `.scene-label`; the frontend developer styles it, the scene developer applies it |
| API contract | Pointer to `docs/api.md`, if there is a backend |

Build against the contract, not against a guess about another agent's code. If the contract is wrong or incomplete, implement the closest sensible version in your own paths, and record the exact change you need under **Requests for other agents**.

## Open questions

You cannot ask the user questions directly. When something is unclear:
1. Check whether a project document already answers it.
2. If not, make the most reasonable assumption and record it under **Assumptions** in your handoff note.
3. If the assumption could change the outcome significantly, also list it under **Open questions**, with the options and your recommendation.

Stop and report instead of assuming when the choice would be expensive to undo, such as changing the stack, deleting work, or anything touching security, money or the user's accounts.

## Definition of done

A task is done only when all of these are true:

- Every acceptance criterion in scope is met and **Verified**, or listed under **Not done** with the reason
- `npm run lint`, `npm run typecheck` and `npm run build` pass, if you changed code (and `npm run test` if unit tests exist)
- Files you created or changed pass the project's formatter (`npm run format:check`). If you have no command-line tool, say so in your report and the Tech Lead will format them
- No new console errors or warnings come from your code
- Your handoff note is written and every request you received is answered

## Handoff note

When you finish, write `docs/handoffs/<your-agent-name>.md`. If the file exists, update it so it describes the current state of your area; keep earlier decisions that still hold, and mark requests you have dealt with instead of deleting them.

```markdown
# Handoff: <agent-name>

## Summary
<two or three sentences on what you did>

## Files changed
- path/to/file: what changed

## Verification
| Check | Result | Label |
|---|---|---|
| `npm run build` | passed | Verified |
| US-3 AC-2 pinch zoom | no touch device available | Not verified |

## Decisions
- <decision>: <reason>

## Assumptions
- <assumption>

## Not done
- <item>: <reason>

## Open questions
- <question>, options, your recommendation (who should answer)

## Requests for other agents
- [open] <owner>: <requested change, with file and reason>

## Requests received
- [done] from <agent>: <what you did>
- [declined] from <agent>: <why>
```

## Report format

End every task with this report to the agent that delegated to you:

- **Done:** what was completed
- **Verification:** each check you ran, its result and its label (Verified, Partly verified, Not verified)
- **Not done:** what was skipped or blocked, and why
- **Files changed:** list of paths
- **Risks:** anything that might break or needs checking
- **Open questions:** anything needing the user's decision

Keep the report factual and short. Do not describe work as complete if any part of it is unverified.

## Writing style

- Use Australian English in documents and UI copy (colour, optimise, behaviour)
- Keep code identifiers in the spelling the library uses (for example `color` in three.js)
- Be concise and specific; prefer tables and checklists over long paragraphs
- State numbers with units and the conditions they were measured under
