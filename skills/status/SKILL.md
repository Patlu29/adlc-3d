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

If `docs/project-status.md` does not exist, say that no lifecycle has been started in this folder and that `/adlc-3d:build` starts one. Then stop.

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
**Not verified:** <items>
**Backlog:** <count of open items, and the top three>
**Next step:** <what happens next, and the command that does it>
```

State only what the documents and files show. If something is unknown, say it is unknown.

For the next step, name the command: `/adlc-3d:build` to continue an open iteration, or `/adlc-3d:change` to start a new one.
