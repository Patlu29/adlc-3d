---
name: lifecycle
description: The Agentic Development Life Cycle (ADLC) this plugin follows, covering the seven phases, their entry and exit criteria and artefacts, the approval gates, iteration types and routes, the lifecycle state file, traceability, the delegation prompt and the verification gate. Use when running, resuming, changing or reporting on a project built with this plugin's team of agents.
user-invocable: false
---

# Agentic Development Life Cycle

The ADLC is a software development life cycle run by a team of agents and steered by a person. The agents do the work and prove it; the person decides scope, design and release. Work moves through seven phases in order, and every pass through them is one **iteration**. What is learned in the last phase feeds the next iteration.

```text
1 Plan -> 2 Design -> 3 Build -> 4 Verify -> 5 Review -> 6 Release -> 7 Operate and learn
   ^                                                                          |
   +------------------------- next iteration ---------------------------------+
```

## Principles

- **Evidence moves work forward, not confidence.** A phase exits when its exit criteria are Verified, using the labels in the working-principles skill
- **People decide, agents deliver.** Scope, design and release belong to the user. Everything else passes on evidence
- **Every phase leaves an artefact.** The next phase, and the next session, start from documents, never from memory of a conversation
- **Everything traces.** Each requirement links to a story, a design reference, a test and a result
- **Defects flow backwards to their source.** A fault found late is fixed in the phase that caused it, then every later phase re-runs for what changed
- **The cycle closes.** No iteration ends without a retrospective and an updated backlog

## Phases

| # | Phase | Agents | Enter when | Artefacts | Exit when | Gate |
|---|---|---|---|---|---|---|
| 1 | Plan | product-manager | An idea or a backlog item is chosen | `docs/requirements/requirements.md`, `user-stories.md`, `backlog.md` | Every Must requirement has a story; every criterion is testable and numbered; non-functional targets are set; every story in the sprint meets the Definition of Ready and the sprint fits its capacity, or the user accepted it over capacity | **Approval A1: scope** |
| 2 | Design | architect, then security-engineer when security is affected, then ux-ui-designer | A1 approved | `docs/architecture.md` with Contracts, `docs/decisions/`, the scaffold, `docs/security/threat-model.md`, `docs/design-spec.md` | The scaffold installs and builds; contracts cover the store, test hook and assets; every data flow in scope is in the threat model, or the security review is skipped with the reason; every story in scope has its interactions and states; no document contradicts another | **Approval A2: design** |
| 3 | Build | technical-artist, scene-developer, frontend-developer, backend-developer if needed, code-reviewer, qa-engineer for the smoke test | A2 approved | Application code, unit tests, handoff notes, `docs/code-review.md` | Lint, format check, type check, unit tests and build pass; no request between agents is open; no critical or major code-review finding is open; the smoke test passes | Automatic |
| 4 | Verify | performance-optimiser, qa-engineer | The smoke test passes | `docs/performance.md`, `tests/e2e/`, `docs/qa-report.md` | Every criterion in scope has a result; no critical or major bug is open, unless the user accepted it as a known issue; every figure says how it was measured | Automatic |
| 5 | Review | architect, security-engineer when security is affected, code-reviewer for code changed since its last review, the Tech Lead | Verify has exited | `docs/review.md`, `docs/security/review.md`, `docs/code-review.md`, `docs/lifecycle/traceability.md`, `docs/lifecycle/release-readiness.md` | No critical review or security finding is open, and every major security finding is fixed or accepted by the user; the code review covers the last code change; the test results are from after the last code change; the traceability matrix has no unexplained gap | **Approval A3: release** |
| 6 | Release | devops-engineer, qa-engineer for the staging check | 6a Prepare: A3 approved (on the Operations route, the change is prepared first and A3 approves it). 6b Deploy: the change is merged and the user wants it deployed | 6a: `.github/` workflows, hosting config, `docs/deployment.md` with environments and rollback, `CHANGELOG.md`. 6b: the staging check in `docs/qa-report.md`, the release record | 6a: the pipeline runs the scripts that pass locally; no secret is in any file; manual steps and rollback are listed. 6b: staging passes the deployed check, UAT is signed off, production is deployed and checked | 6a automatic. 6b: **Approval UAT**, and every deploy needs its own explicit approval |
| 7 | Operate and learn | the Tech Lead, product-manager, qa-engineer if deployed | Release has exited | `docs/lifecycle/retrospective.md`, updated `backlog.md` | The retrospective is written; every known gap is a backlog item; the iteration is closed in the state file | Automatic |

A phase that an iteration does not need is recorded as **Skipped** with the reason. It is never left blank.

The security-engineer runs when the iteration touches authentication, uploads or other user data, the content security policy or headers, a new dependency, a new third-party host or a new data flow, and always on a new application. Otherwise record it as Skipped with the reason.

## Release and deploy

Phase 6 has two parts, because a release is approved before the user merges it and deployed after:

1. **6a Prepare**, straight after A3: the devops-engineer prepares the pipeline, hosting, `docs/deployment.md` and the `CHANGELOG.md` entry for the release version. Phase 7 then runs, and the iteration closes with the release recorded as awaiting merge and deploy if it is not deployed yet.
2. **6b Deploy**, once the user has merged the change and asks for it to be deployed (a hotfix for an incident deploys from its own branch before it is merged, as the incident command describes), in this session or a later one (`/adlc-3d:change` and `/adlc-3d:status` pick it up):
   1. Deploy the merged build to staging, on the user's explicit approval. The staging deploy is a manual run that takes the commit SHA, so nothing reaches staging by merging alone.
   2. The qa-engineer runs the deployed spec against the staging address; the result goes in `docs/qa-report.md`.
   3. **Approval UAT**: the user, or a named UAT approver in ClickUp, signs off the build on staging. UAT is asked for in every approval mode, Autonomous included, because it is a person accepting the product.
   4. Deploy to production, on a separate explicit approval, then run the deployed spec against production.
   5. Tag the release (`v<version>`) and push the tag, on one more explicit approval, as the git-flow skill describes. Record the release as shipped.

If the project has no staging environment, UAT is recorded as Not verified and the user decides under the exception rule whether to deploy to production without it. Iterations that are never deployed skip 6b with the reason.

**Versions.** Each release has a semantic version, recorded in the state file as `Release: 1.3.0`: a patch for a bug fix, a minor version for a feature, a major version for a change that breaks existing users. Propose it at A3; the user's decision stands. This line is the only version source; `package.json` is not used for releases. A state file without the line means the project does not version its releases.

The code review is skipped only when an iteration changes no code, such as a documents-only or pipeline-only change; record the reason in the phase log.

## Cards and source control

Work is also tracked outside the repository, so the people around the project can follow it without reading `docs/`:

- **Cards.** Each story, backlog item, bug and agent task is a card in ClickUp or on a local board, moved through card states as the phases run. The card-tracking skill has the setup, the user's consent, the states for each phase and the tracker command
- **Branches.** Each iteration is one branch named after its main card, committed at each phase exit and offered to the user as one pull request at approval A3. The git-flow skill has the rules
- **Sprints.** Each iteration is one sprint, planned in phase 1 from sized stories that meet the Definition of Ready, up to the team's capacity. The card-tracking skill has sprint planning, the burndown and velocity
- **The repository decides.** A gate passes or fails on the evidence in the repository. A tracker that is down, a missing token or a card moved by hand never blocks a gate and never counts as evidence; record it and carry on. The one thing taken from the tracker is a gate decision by a named approver, when the user has switched ClickUp approvals on, under the rules in the card-tracking skill
- **The user owns the outward steps.** Sending content to a tracker, committing, pushing, opening a pull request and merging each need the user's consent as those skills describe. Approval to release is not approval to push

## Gates

There are two kinds of gate.

**Automatic gate.** The Tech Lead checks the exit criteria itself, records the evidence in the state file and moves on. If a criterion cannot be verified in this environment, it is recorded as Not verified with the reason and carried into the release readiness report.

**Exceptions need the user.** Two things stop an automatic gate in every approval mode, including Autonomous: a Must requirement that cannot be verified, and a critical or major bug that has survived two fix rounds. Show the user the evidence and the options (accept and carry it to approval A3 as a known issue, change the requirement, or keep working with a different approach). Record the decision under Approvals in the state file. The phase exits only on that decision, never by default.

**Approval gate.** The Tech Lead stops, shows the user a short summary and waits for one of three decisions:

| Decision | Effect |
|---|---|
| Approve | The phase exits and the next begins |
| Approve with changes | The owning agent makes the changes, the gate checks re-run, and work continues without asking again unless the changes alter scope |
| Reject | The phase re-runs with the user's reasons quoted to the owning agent |

The user gives the decision in chat. If the user has switched ClickUp approvals on, a named approver may also give Approve or Reject on the iteration card (UAT on the release card), as the card-tracking skill describes; approval with changes, a stale or conflicting decision, and anything outside A1, A2, A3 and UAT always come back to the user in chat.

Each approval summary contains: what was produced, what was verified and how, what is not verified, the open questions with a recommendation for each, and the decision being asked for.

### Approval modes

| Mode | The user approves |
|---|---|
| Key gates (default) | A1 scope, A2 design, A3 release, and UAT before a production deploy |
| Every phase | The exit of all seven phases, and UAT before a production deploy |
| Autonomous | Only UAT before a production deploy. Otherwise the team stops only when blocked, and reports at the end |

Use key gates unless the user asks for another mode, and record the mode in the state file. In every mode, deploying, pushing, creating cloud resources or spending money needs the user's explicit approval for that action. An approval recorded in the state file covers only the artefacts it names; if those change materially afterwards, ask again.

## Iterations

Each iteration has a number, a type and a route. The Tech Lead chooses the type from the request and confirms it with the user when it is not obvious.

| Type | Trigger | Route |
|---|---|---|
| New application | A new idea | All seven phases |
| Feature | A backlog item or change request that adds or changes behaviour | 1 for the affected stories, 2 only if contracts, look or interaction change, then 3, 4, 5, 6, 7 |
| Bug fix | A defect report | 1 only if the criterion itself was wrong, 3 for the owning agent, 4 for the fix plus the full regression suite, 5 as a short review, 6, 7 |
| Performance | A missed budget or a slow app | 4, where the performance-optimiser measures and optimises and the qa-engineer runs the regression suite; 3 only for fixes outside the optimiser's own paths, followed by 4 again; then 5, 6, 7 |
| Operations | Pipeline or hosting only | 6a to prepare the change, 5 as a short review of the workflow and hosting files, A3, then 7, and 6b if the user wants it deployed. Nothing is merged or deployed before A3 |
| Incident | A production fault, through `/adlc-3d:incident` | Mitigate first (rollback or a fix forward, each deploy on the user's approval), then a Bug fix iteration for the cause, then the postmortem |

Rules for every route:

- Approval gates apply only to phases the route runs, and every route includes approval A3. A bug fix that changes no requirement and no design needs only A3
- When the pipeline and hosting are unchanged, phase 6a is reduced to the `CHANGELOG.md` entry, so every released iteration is recorded
- When a phase runs more than once in an iteration, add a new row to the phase log for each pass
- Phase 4 always re-runs the full regression suite, not just the changed area
- Phase 7 always runs
- If work in a later phase shows an earlier artefact is wrong, go back: have the owner correct the document first, re-run the gates from that phase for what changed, and record the loop in the state file

## State file

`docs/project-status.md` is the single record of where the lifecycle stands. The Tech Lead owns it and updates it at every phase entry, phase exit and decision. Every agent reads it; no agent edits it.

```markdown
# Project status

Application: <one or two sentences>
Approval mode: Key gates
Current iteration: 2 (Feature: CR-3 share link)
Current phase: 3 Build
Tracker: clickup (List 901234567, content full), approved by the user on 2026-11-02
Git: commit at phase exits on the iteration branch, approved by the user on 2026-11-02
Branch: feat/CU-86abc12-share-view-link
Base: main at 4f2c9a1
Sprint: 2, "Share the current view", 2026-11-11 to 2026-11-22, capacity 13 pts
Notify: slack, approved by the user on 2026-11-02
ClickUp approvals: on (approvers alex, sam), approved by the user on 2026-11-02
Release: 1.3.0 (awaiting merge and deploy)

## Iterations
| # | Type | Scope | Started | Closed | Outcome |
|---|---|---|---|---|---|
| 1 | New application | MVP: US-1 to US-6 | 2026-11-02 | 2026-11-05 | Released, 2 minor bugs carried to backlog |
| 2 | Feature | CR-3 | 2026-11-11 | | |

## Phase log (current iteration)
| Phase | Status | Evidence | Date |
|---|---|---|---|
| 1 Plan | Done | 1 story added, criteria numbered | 2026-11-11 |
| 2 Design | Skipped | No contract, look or interaction change | 2026-11-11 |
| 3 Build | In progress | | |

## Approvals
| Gate | Iteration | Decision | Given by | Date | Covers |
|---|---|---|---|---|---|
| A1 scope | 2 | Approved | User, in chat | 2026-11-11 | US-7 |
| A2 design | 2 | Approved | alex via ClickUp | 2026-11-12 | docs/design-spec.md 4.3 |

## Decisions and answers
## Open questions (owner)
## Open requests (owner)
## Environment notes
## Not verified
```

**A paused iteration.** When an incident pauses the open iteration, move its header lines (`Current iteration`, `Current phase`, `Branch`, `Base`, `Sprint`, `Release`) and its phase log, unchanged, into a section `## Paused for INC-<n>` at the end of the file, then open the hotfix iteration in their place. On resume, after the hotfix iteration has closed, move them back and delete the section. Only one iteration is ever paused.

`Tracker:` is `clickup (...)`, `local` or `none`; a state file without the line means none. `Git:` is the commit consent or `none`. `Branch:` and `Base:` are set when the iteration opens.

Status values are Not started, In progress, Done, Skipped and Blocked. Use absolute dates. When an iteration closes, move its phase log into `docs/lifecycle/retrospective.md` and start a fresh log.

## Traceability

`docs/lifecycle/traceability.md` is built by the Tech Lead in the Review phase from the requirements, the design spec and the QA report. It is a compiled view; if it is wrong, the source document is corrected, not the matrix.

```markdown
| Requirement | Priority | Story and criterion | Design ref | Test | Result | Label |
|---|---|---|---|---|---|---|
| FR-5 | Must | US-1 AC-1 | 4.2 Orbit | tests/e2e/rotate.spec.ts | Pass | Verified |
| NFR-2 | Must | US-4 AC-3 | 6.1 Loading | docs/performance.md | 58 fps, desktop only | Partly verified |
| FR-9 | Should | US-6 AC-2 | 5.3 Share | none | Not tested | Not verified |
```

A row with no test, or a result that is not Verified, is a gap. Every gap on a Must requirement is listed in the release readiness report.

## Release readiness

`docs/lifecycle/release-readiness.md` is what the user reads at approval A3. Keep it to one page:

- Scope of this iteration, and what changed since the last release
- Results: criteria passed, failed, partly verified and not tested; bugs open by severity
- Performance against each budget, with how it was measured
- Accessibility against WCAG 2.2 AA (or the level in the requirements): automated violations by impact, and the manual checks done and not done
- Security: the audit, licence and secret scan results, open OWASP findings, and whether the content security policy is report-only or enforced
- Review findings and code-review findings still open, by severity
- Cards in scope and their states, from `docs/tracker/board.md`, if a tracker is set up
- Traceability gaps on Must requirements
- What is not verified, and what the user would need to do to verify it
- The proposed release version, and whether a staging environment exists for UAT
- Recommendation: release, release with known issues, or do not release, with the reason

Never recommend release with a failing check, an open critical review or security finding, an open major security finding the user has not accepted, or an open critical or major bug the user has not accepted as a known issue. Name every accepted known issue in the report.

A recommendation of do not release always stops for the user, in every approval mode. The Release phase never starts on it without the user's explicit decision.

## Retrospective

`docs/lifecycle/retrospective.md` gets one section per iteration, written from the handoff notes, the QA report and the phase log:

- What was delivered against what was planned
- What went wrong, the cause and the phase that caused it
- Which gates caught problems, and which problems escaped a gate
- Changes for the next iteration
- Items moved to the backlog, by ID

Report facts from the artefacts. Do not invent lessons to fill the section.

## Delegation

Agents do not see the conversation and cannot ask the user anything. Every delegation prompt stands on its own:

```text
Project: <the application in one or two sentences>
Project folder: <absolute path>
Iteration and phase: <for example, Iteration 2 (Feature: CR-3), phase 3 Build>
Cards: <the IDs and card keys this task serves, for example US-7 (CU-86abc12)>
Your task: <exactly what to produce, and for which stories or requirements>
Read first: <documents and handoff notes>
User decisions: <approvals and answers that affect this task>
Requests for you: <open requests from other agents' handoff notes, quoted>
Constraints: <environment notes, what not to touch>
Done means: <the exit criteria this task serves, the checks that must pass and the evidence to report>
```

- Give each agent only its own work; do not ask an agent to edit paths it does not own
- Quote requests, review findings and bug reports in full instead of summarising them
- For a fix, include the reproduction steps and the failing check

## The check after every delegation

An agent's report is a claim. Before accepting it:

1. Read the agent's handoff note in `docs/handoffs/`, including **Verification**, **Not done** and **Open questions**.
2. Confirm the outputs exist and are not empty or placeholder text.
3. Where code changed, run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test` and `npm run build` yourself. The product-manager and ux-ui-designer cannot run commands, so if a file of theirs fails the format check, run `npm run format` on that file; formatting is the one edit the Tech Lead makes directly.
4. Copy every open request and open question into the state file, and route each one to its owner or to the user.
5. If the output misses the task, send the agent back with the specific gap. Do not patch it yourself.

## When things go wrong

| Situation | What to do |
|---|---|
| An agent reports success but a check fails | Send it back with the exact command and output |
| The same failure appears twice | Stop re-delegating. Read the code and the error yourself, or ask the architect to diagnose, then delegate a fix aimed at the cause |
| Two agents each say the other must change | Decide using the contracts and the document precedence in the team-conventions skill; if a document is wrong, have its owner correct it first |
| An agent needs to edit a path it does not own | Route the change to the owner |
| A dependency, tool or network resource is unavailable | Record it in the state file and ask the user; do not work around it by changing their machine |
| The requirements turn out to be wrong or incomplete | Return to phase 1 with the product-manager and the user; do not let developers guess |
| A bug survives two fix rounds | Stop. Report it to the user with what was tried. If it is critical or major, the Verify gate needs the user's decision before it can exit; either way it goes into the release readiness report |
| The tracker fails, the token is missing, or a card was changed by hand | Follow the card-tracking skill. Record it under Environment notes and carry on; it never blocks a gate |
| An exit criterion cannot be verified in this environment | Record it as Not verified with the reason. It is untested coverage, not a pass and not a bug. If it is a Must requirement, the gate needs the user's decision |
