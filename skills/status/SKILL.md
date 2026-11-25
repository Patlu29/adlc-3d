---
name: status
description: Reports where a project built with this plugin stands in the Agentic Development Life Cycle, covering the current iteration and phase, the approvals given and pending, open questions and requests, bugs, what is not verified and the next step. Read-only. Use when the user asks for the status, progress or next step of the project.
disable-model-invocation: true
---

# Lifecycle status

Report where this project stands. This command is read-only: do not edit any file, delegate to any agent or run anything that changes the project.

## Gather

Read whichever of these exist:

1. `docs/project-status.md`: iteration, phase log, approvals, open questions and requests
2. `docs/handoffs/`: the **Not done** and **Open questions** sections of each note
3. `docs/qa-report.md`: results summary and open bugs by severity
4. `docs/review.md`: open findings by severity
5. `docs/lifecycle/release-readiness.md` and `docs/lifecycle/traceability.md`
6. `docs/requirements/backlog.md`: open items by priority
7. `docs/tracker/board.md`: cards by state, if the state file has a `Tracker:` line other than none
8. `docs/code-review.md`: open code-review findings by severity
9. `docs/security/review.md`: open security findings by severity
10. `docs/incidents/`: each incident's severity and status

If `docs/project-status.md` does not exist, say that no lifecycle has been started in this folder and that `/adlc-3d:build` starts one. Then stop.

These read-only commands are allowed, because they change nothing:

- With ClickUp as the tracker: `node "${CLAUDE_PLUGIN_ROOT}/tracker/cli.mjs" board --remote`, to report cards that people moved, deleted or created in ClickUp. If it exits with 2, 3 or 4, report that the tracker could not be read (the output says why) and carry on
- With a `Sprint:` line: `node "${CLAUDE_PLUGIN_ROOT}/tracker/cli.mjs" sprint report --print`, for points completed against committed and the burndown
- With ClickUp approvals on and a gate waiting: `node "${CLAUDE_PLUGIN_ROOT}/tracker/cli.mjs" gate status --gate <A1, A2 or A3>`. Exit 5 means pending
- With a branch in the state file: `git status --short`, and `gh pr view <branch> --json state,mergedAt` if `gh` is installed, to report whether the pull request is open or merged. Never push, fetch into the working tree or change branches

The card-tracking and git-flow skills (`adlc-3d:card-tracking`, `adlc-3d:git-flow`) explain what you find; load them if you need to.

Check the record against the project instead of trusting it. If the state file says a phase is Done but its artefacts are missing or empty, report the mismatch. The phases, their artefacts and exit criteria are defined in the `adlc-3d:lifecycle` skill; load it if you need them.

## Report

Keep it short enough to read in a minute:

```markdown
**Iteration <n>** (<type>: <scope>), started <date>
**Phase:** <number and name>, <status>

| Phase | Status | Evidence |
|---|---|---|
| 1 Plan | Done | ... |

**Approvals:** A1 <decision and date>, A2 <...>, A3 <pending>
**Waiting on you:** <open questions and approvals, or "nothing">
**Open requests between agents:** <count, with owners>
**Bugs open:** <count by severity>
**Code review:** <open findings by severity, or "not run this iteration">
**Cards:** <count by state, drift from the tracker, or "no tracker">
**Sprint:** <number, goal, points completed of committed, days left, or "no sprint">
**Gate waiting:** <gate, and whether an approver has answered in ClickUp, or "none">
**Branch:** <name, uncommitted changes, pull request open or merged, or "no git">
**Release:** <version, and prepared, awaiting merge, awaiting deploy, on staging, UAT signed off or shipped, or "not versioned">
**Security:** <open SEC findings by severity, or "not reviewed this iteration">
**Incidents:** <open INC files with severity and status, or "none">
**Paused:** <the iteration in the `Paused for INC-<n>` section, and its phase, or "none">
**Not verified:** <items>
**Backlog:** <count of open items, and the top three>
**Next step:** <what happens next, and the command that does it>
```

State only what the documents and files show. If something is unknown, say it is unknown.

For the next step, name the command: `/adlc-3d:build` to continue an open iteration, `/adlc-3d:change` to start a new one or deploy a merged release, or `/adlc-3d:incident` for a production fault.
