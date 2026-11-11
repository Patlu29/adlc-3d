---
name: change
description: Starts a new Agentic Development Life Cycle iteration on an existing project built with this plugin, from a change request, bug report, performance problem, user feedback or backlog item. Classifies the request, analyses its impact, and runs only the phases that change needs. Use when the app already exists and the user wants to change, fix or extend it.
argument-hint: "[change request, bug report or backlog ID]"
disable-model-invocation: true
---

# Start a change iteration

You are the Tech Lead. The application already exists; the user wants to change it.

The request: $ARGUMENTS

**First, load the `adlc-3d:lifecycle` skill with the Skill tool.** It defines the iteration types and routes, the gates, the state file, the delegation prompt and the check after every delegation.

## 1. Check the starting point

1. Read `docs/project-status.md`. If it does not exist, this project was not built with this lifecycle: tell the user, and offer to run `/adlc-3d:build` instead.
2. If an iteration is still open, tell the user its phase and ask whether to finish it first, or to add this request to the backlog. Do not run two iterations at once.
3. Read `docs/requirements/backlog.md`, the last section of `docs/lifecycle/retrospective.md` and the handoff notes.
4. Run `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` to confirm the starting point is sound. If a check already fails, tell the user before changing anything; a change built on a broken baseline cannot be verified.

## 2. Classify the request

| The request is | Iteration type |
|---|---|
| New behaviour, or a change to existing behaviour | Feature |
| The app does not do what a criterion says | Bug fix |
| The criterion is met but the user wants something different | Feature. The requirement changes, so it is not a bug |
| The app is slow, heavy or misses a budget | Performance |
| Pipeline, hosting or deployment only | Operations |

If the request is empty, show the open backlog items by priority and ask the user which to take. If it mixes several types, split it into separate backlog items and ask which to run first.

## 3. Analyse the impact

Before choosing the route, work out what the change touches. Read the documents; do not guess.

| Question | Where to look | If yes |
|---|---|---|
| Does a requirement or acceptance criterion change, or is a new one needed? | `docs/requirements/` | Run Plan, with approval A1 |
| Does a contract, a dependency or the structure change? | **Contracts** in `docs/architecture.md` | Run Design with the architect, with approval A2 |
| Does the look, layout or an interaction change? | `docs/design-spec.md` | Run Design with the ux-ui-designer, with approval A2 |
| Which owners' paths change? | Ownership table in the team-conventions skill | Those agents run in Build |
| Which existing stories could regress? | `docs/lifecycle/traceability.md` | Name them for Verify |
| Does the pipeline or hosting change? | `docs/deployment.md` | Release covers the pipeline and hosting; otherwise it is only the changelog entry |

Tell the user the result in a few lines: the type, the phases that will run, the agents involved, the approvals you will ask for and the stories at risk of regression. Approval A3 applies to every iteration; for a bug fix that changes no requirement and no design, it is the only one.

## 4. Run the iteration

1. Open the iteration in `docs/project-status.md`: number, type, scope, and the phase log with unneeded phases marked Skipped and the reason.
2. Delegate to the product-manager to record the request in `docs/requirements/backlog.md` with an ID, or to mark the chosen item In progress. Add the ID to the iteration's scope in the state file.
3. Run each phase on the route as the lifecycle skill defines it: delegate with the standard prompt, check every delegation, meet the exit criteria, and stop at each approval gate that applies.
4. In Verify, always have the qa-engineer run the full regression suite, not only the tests for the change.
5. In Review, have the architect review only what changed, then update `docs/lifecycle/traceability.md` and write a short `docs/lifecycle/release-readiness.md` for this iteration.
6. Always finish with Operate and learn: have the product-manager update the backlog, add the iteration to `docs/lifecycle/retrospective.md` citing the backlog IDs, and close the iteration in the state file.

## Rules

- A change never bypasses the documents. If the code must do something the requirements or design spec do not say, the document changes first
- Keep every existing requirement, story, criterion and bug ID stable
- Do not widen the change. Anything else you notice goes to the backlog, not into this iteration
- Do not deploy, push or create cloud resources without the user's explicit approval for that action

## Final summary

Tell the user what changed, what was verified and how, what was not verified, which regression tests ran and their result, and what was added to the backlog.
