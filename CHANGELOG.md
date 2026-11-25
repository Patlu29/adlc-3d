# Changelog

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the plugin uses [semantic versioning](https://semver.org/). Release notes with upgrade steps are on the [releases page](https://github.com/Patlu29/adlc-3d/releases).

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
