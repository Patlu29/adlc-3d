# Changelog

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the plugin uses [semantic versioning](https://semver.org/). Release notes with upgrade steps are on the [releases page](https://github.com/Patlu29/adlc-3d/releases).

## [4.3.0] - 2026-11-27

### Added
- **Agent run log.** A new hook records every delegation to one of the plugin's agents in `docs/metrics/runs.jsonl`: agent, cards, iteration and phase (from the delegation prompt's `Cards:` and `Iteration and phase:` lines), model, tokens, time, tool uses and status. It never stores the prompt or the reply, never blocks and never prints. Background runs are logged when launched and when they stop. `Metrics: off` in the state file stops it
- **`metrics` tracker command.** Writes `docs/metrics/report.md` (or prints it with `--print`), with or without a tracker: cycle and lead time, sprint history, the DORA measures approximated from the project's records (releases shipped, cycle time to ship, change failure rate, time to restore), gate decisions approved at the first answer, bugs, and agent runs, tokens and time per agent and per iteration, with repeat delegations listed. Every median shows its n, rates appear from five shipped releases, and no money figures are given
- **Autonomy by iteration type.** `Autonomy: Bug fix=Autonomous, approved by the user on <date>` in the state file gives an iteration type its own approval mode. It applies when an iteration opens, only the user sets it, and floors always stop for the user: type changes, a bug fix that needs Plan or Design, incidents, auth, secrets, dependencies, migrations, `.github/`, any security finding, UAT and every deploy or push. A sev1 or sev2 caused by a release resets lighter modes to Key gates
- **Behaviour evals** in `evals/` for `claude plugin eval`: status is read only, Autonomous mode still asks before deploying, an incident asks before a rollback, a defect report opens a Bug fix iteration, build stops at approval A1, and the guard stops the Write and Edit tools creating a `.env` file. Cases share a scaffolded fixture project with a stand-in deploy script, and graders check tool calls and files before an LLM judge is used
- Incident files gain `Mitigated:`, `Resolved:` and `Introduced in:` lines, the last set in the postmortem to the release that caused the fault

### Changed
- Phase 7 regenerates the metrics report and quotes three figures in the retrospective
- The Approvals table's Decision column uses exactly Approved, Approved with changes or Rejected: <reason>, one row per decision
- The architect's scaffold adds `.gitattributes` with a union merge for the run log
- `docs/metrics/` is Tech Lead only, and like `docs/tracker/` it is left out of the approval fingerprint, so a logged run never makes a ClickUp approval stale
- History entries the tracker fills in (cards from before 4.1, cards joining a sprint with no history) are marked synthetic and left out of flow metrics
- The validator checks the eval cases and the new tracker and hook files
- Tests: 182 tracker checks and 108 hook checks

### Upgrading
- Nothing to do. Existing projects start logging agent runs on the next delegation; add `Metrics: off` to `docs/project-status.md` to opt out. Existing projects may want `docs/metrics/runs.jsonl merge=union` in `.gitattributes`

## [4.2.0] - 2026-11-25

### Added
- **security-engineer agent.** Writes a STRIDE threat model in Design and a security review with SEC findings in Review, covering untrusted 3D assets and decoders, the content security policy, uploads, authentication, third-party hosts and the OWASP Top 10. It runs when an iteration touches security, and always for a new application
- **Release and deploy.** Phase 6 is split into 6a Prepare (at A3) and 6b Deploy (after the user merges): staging deploy, staging check, **Approval UAT**, production deploy of the same build, then the version tag. Every deploy and push needs its own approval; UAT is asked for in every approval mode
- **Release versions.** `Release: x.y.z` in the state file is the single version source. Tracker commands `release start` (a Milestone card, looked up by name, falling back to a tagged task), `release notes --print` (a changelog draft from the documents) and `release ship`
- **UAT approvals in ClickUp** on the release card, for the exact build on staging (`gate request --gate UAT --version <x.y.z> --build <full sha>`); a different build makes the decision stale
- `sprint pause` and `sprint resume`, so an incident's hotfix iteration can run while another is paused
- Staging is a manual deploy of a named commit, so merging never deploys; a hotfix deploys from its own branch
- **`/adlc-3d:incident`.** Records the incident in `docs/incidents/INC-<n>.md`, triages severity, mitigates with a fresh approval for every rollback or deploy, fixes the cause in a hotfix iteration that pauses any open one, and writes a blameless postmortem. Incidents become `[INC-n]` cards through `push`, and notifications gain an `incident` event
- The pipeline guidance adds staging and production environments, deploy jobs that print the deployed SHA, and a tested rollback section in `docs/deployment.md`

### Changed
- The security headers and OWASP evidence move from the architect's release review to the security-engineer; the architect keeps contracts and supply-chain controls, and does the codebase-wide security check itself when the security review is skipped
- OWASP severity: exploitable now is critical and must be fixed, a missing control the threat model relies on is major and only the user can accept it, hardening is minor
- Agents cannot write `docs/incidents/`; `docs/security/` belongs to the security-engineer
- Test cases stay as acceptance criteria with results on the story cards, rather than cards of their own
- Tests: 158 tracker checks and 89 hook checks

### Upgrading
- Existing projects keep working. A state file without a `Release:` line means releases are not versioned, and 6b runs only when the user asks for a deploy

## [4.1.0] - 2026-11-25

### Added
- **Estimates and Definition of Ready.** Stories carry story points in their heading (`(FR-5, Must, 3 pts)`) and an optional `Depends on:` line. The user-stories skill defines the scale and the Definition of Ready; the new `ready` command checks it, and the Plan phase exits only when every story in the sprint passes
- **Sprints.** One sprint per iteration, planned in phase 1 up to capacity or velocity. `sprint start` creates an iteration card `IT-<n>`, tags the cards `sprint-<n>` and sets their end date; `sprint add` and `drop` record scope changes; `sprint report` writes points, scope changes, re-estimates and a daily burndown in local dates; `sprint close` records completed points and carry-over for velocity
- **Notifications** to Slack incoming webhooks and Teams Workflows, at waiting gates, blockers, release approval and iteration close. URLs come only from `SLACK_WEBHOOK_URL` and `TEAMS_WEBHOOK_URL` in the user's shell, are checked against the expected hosts, and are never stored or printed. Best effort: failures never stop the lifecycle
- **Approvals on cards (off by default).** With `config --clickup-approvals on`, approvers the user adds in their own terminal can answer A1, A2 or A3 on the iteration card with `Approve A1` or `Reject A1: <reason>`. Comments by the token owner never count, nothing read from a test server counts, the tracker refuses to post text that reads like a decision, the request time comes from ClickUp, the first decision stands, only a clean approval exits 0, and approval with changes, rejection, stale or conflicting decisions return to the Tech Lead and the user. Staleness is judged from the content of the work, so committing unchanged work does not void an approval
- A Bash guard hook in ADLC projects blocks `approvers add` and `remove`, direct ClickUp API calls, pointing the tracker at another server, and commands that read the token or webhook URLs
- `config` command to change the content mode, notifications and ClickUp approvals without losing other settings; `init --force` now keeps them too

### Changed
- Story points are sent to ClickUp; removing an estimate clears it there. Registries from 4.0 stay valid: only stories with points are re-pushed
- `move` records each card's state history, and a queued move keeps the time it was asked for
- New exit codes: 5 for a pending approval, 6 for stories that are not ready
- Slack notification text is escaped, so it cannot mention a whole channel
- If a workspace refuses story points (the Sprint Points ClickApp is off), cards are sent without them and the tracker says so once
- Tests: 131 tracker checks and 85 hook checks

### Upgrading
- Existing projects keep working. Stories without estimates fail `ready` only when a new sprint is planned; add the points then
- ClickUp approvals and notifications are off until the user turns them on

## [4.0.1] - 2026-11-25

### Fixed
- Agent sub-tasks in ClickUp were named `[US-1/scene-developer] undefined`. They are now named after their agent and story, such as `[US-1/scene-developer] scene-developer: Rotate the model`. Run `task` again for an existing sub-task to rename it in place

### Verified
- The tracker was run against a live ClickUp List: init and status mapping, dry run, push, move with notes, agent sub-tasks, criteria results (shown as checkboxes in the markdown description), comments, an update without a false conflict, a repeat push that changes nothing, and the drift report

## [4.0.0] - 2026-11-25

Major release: the Build and Review gates gain a code review, and the Tech Lead now asks about a tracker and commits at the start of every project, including iterations already in progress.

### Added
- **Cards.** Every story, backlog item, QA bug and agent task can be a card in ClickUp or on a local board (`docs/tracker/board.md`), moved through backlog, ready, in progress, in review, in test, ready for release and done as the phases run. The new `card-tracking` skill covers setup, the user's consent and what each phase does
- **Tracker command** `tracker/cli.mjs` (Node 18 or later, no dependencies): `init`, `check`, `push`, `move`, `task`, `comment`, `criteria`, `board` and `secrets`. It creates cards idempotently (a card lost from the registry, or created by a request whose response was lost, is found by its `[ID]` name rather than created twice), saves after every call, queues operations in order when ClickUp is unavailable and retries them on the next run, drops a queued operation that can never succeed, carries on past a card ClickUp rejects or deleted, never overwrites a card someone edited in ClickUp without `--force`, waits out rate limits, times out hung requests, and refuses content that looks like a credential
- **Content modes** for ClickUp: `full`, or `minimal` (titles, IDs, the stories a bug breaks and short notes), shown to the user as a dry run before the first push. The token is read only from `CLICKUP_API_TOKEN` in the user's shell
- **Git flow.** The new `git-flow` skill: with the user's consent, one branch per iteration named after its main card (`feat/CU-86abc12-share-view-link`), a commit at each phase exit staging only named paths after a credential scan of the staged changes, and a pull request only on the user's separate approval at A3. Agents never commit, push or merge
- **code-reviewer agent.** Reviews the iteration's diff against the code rules, the contracts and the acceptance criteria at the end of Build, and again in Review for code changed later, writing `docs/code-review.md` with findings CODE-n
- `/adlc-3d:status` reports open code-review findings, cards by state, drift from ClickUp (read only) and whether the pull request is merged
- The guard hook blocks agent writes to `docs/tracker/`, and its credential patterns (shared with the tracker) add ClickUp, Google and npm tokens, JSON Web Tokens and hard-coded passwords
- `scripts/test-tracker.mjs`: 78 checks against a mock ClickUp API and the local provider, run in CI. The hook tests grow to 69 checks

### Changed
- Build exits only when no critical or major code-review finding is open; Review exits only when the code review covers the last code change
- The architect's release review relies on the code review for line-by-line checks and keeps the security, contract and supply-chain checks across the codebase
- The state file gains `Tracker:`, `Git:`, `Branch:` and `Base:` lines, and delegation prompts and handoff notes name their cards
- `/adlc-3d:change` offers to set up a tracker on projects that predate cards, and moves the last iteration's cards to done once its pull request is merged

### Upgrading
- Existing projects keep working: a state file without a `Tracker:` line means no tracker, and the Tech Lead asks before committing anything
- To use ClickUp, have the List ID ready and set `CLICKUP_API_TOKEN` in your shell before running `/adlc-3d:change`

## [3.2.0] - 2026-11-18

### Added
- **Guardrail hooks, active in every ADLC project once you upgrade.** Inside a folder with `docs/project-status.md`, a PreToolUse hook blocks writes to `.env` files with values, generated output, `package-lock.json`, `assets/source/` and (for agents) the Tech Lead's lifecycle files, and blocks new content that looks like a credential. A PostToolUse hook warns on edits outside an agent's folders and lists code-rules hits. Both fail open, never approve anything, and can be switched off with `Hooks: off` in `docs/project-status.md` or `ADLC3D_HOOKS=off`
- OWASP Top 10 mapping in the `code-rules` skill
- Generated pipelines gain a security job (`npm audit` with expiring exceptions, licence allow-list, CycloneDX SBOM, gitleaks), Dependabot and CodeQL
- Baseline security headers in the `static-hosting` skill, with the content security policy starting in report-only mode
- WCAG 2.2 AA as the default accessibility standard, with the criteria 3D apps most often miss, and axe scans in the QA suite
- Release readiness reports accessibility and security results
- Plugin governance: `LICENSE` (proprietary), `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, a pull request template, Dependabot for the plugin's own workflow, and this changelog
- `scripts/test-hooks.mjs`, run in CI with the validator

### Changed
- The team-conventions ownership table names hosting files under `public/` and handoff notes, and says who owns unlisted paths
- The architect's release review checks the supply-chain controls, headers and OWASP rows
- New projects install `@axe-core/playwright` at scaffold time

## [3.1.1] - 2026-11-18

### Changed
- The ux-ui-designer preloads the `code-rules` skill and checks its CSS in `src/styles/` against the self-review checklist
- The checklist tells agents without a command line to run the same search with the Grep tool

## [3.1.0] - 2026-11-18

### Added
- `code-rules` skill, preloaded into every agent that writes code: precedence, TypeScript, structure and React, errors and async code, file rules, security, performance habits, tests and a self-review checklist

### Changed
- The architect enforces the rules through ESLint where a lint rule exists and checks them in the release review, rating security breaches critical

## [3.0.0] - 2026-11-11

### Changed
- **Breaking:** renamed the plugin from `application-builder` to `adlc-3d`, and the repository to `Patlu29/adlc-3d`
- The team runs as an Agentic Development Life Cycle with seven phases and three approval gates (scope, design, release)

### Added
- Iteration types: new application, feature, bug fix, performance and operations
- Commands `/adlc-3d:build`, `/adlc-3d:change` and `/adlc-3d:status`
- Project artefacts: backlog, release review, traceability matrix, release readiness report, retrospective and changelog
- Validator checks for the lifecycle and for retired names

## [2.1.0] - 2026-11-11

### Added
- `working-principles` skill preloaded into all ten agents, and evidence labels (Verified, Partly verified, Not verified)
- `debugging-3d` skill
- Plugin validator and a workflow that runs it on pushes and pull requests
- README with install, usage and maintenance notes

### Changed
- Stricter Tech Lead workflow with a preflight, checks after every delegation and a smoke test before performance and QA
- The architect defines the contracts between agents before the parallel build

### Fixed
- End-to-end tests run against a test-mode build; the scene is lazy-loaded; decoders and environment maps are self-hosted

## [2.0.0] - 2026-11-05

### Changed
- **Breaking:** renamed the plugin from `3d-web-application-builder` to `application-builder`

## [1.0.1] - 2026-10-27

- First published release

[3.2.0]: https://github.com/Patlu29/adlc-3d/compare/v3.1.1...v3.2.0
[3.1.1]: https://github.com/Patlu29/adlc-3d/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/Patlu29/adlc-3d/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/Patlu29/adlc-3d/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/Patlu29/adlc-3d/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Patlu29/adlc-3d/compare/v1.0.1...v2.0.0
