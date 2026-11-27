# ADLC 3D

A Claude Code plugin that builds 3D web applications with a team of specialist agents, run as an Agentic Development Life Cycle (ADLC). A Tech Lead takes an idea through seven phases, with your approval of the scope, the design and the release, an evidence check on every phase, and a feedback loop that turns what was learned into the next iteration. Every story, backlog item, bug and agent task can be tracked as a card in ClickUp or on a local board, and each iteration lives on its own branch with one pull request.

The default stack is Vite, React, TypeScript, React Three Fiber, drei and zustand, tested with Vitest and Playwright.

## Install

```bash
claude plugin marketplace add <path-or-repository-of-this-plugin>
```

```bash
claude plugin install adlc-3d@prakash-plugins
```

Upgrading from `application-builder` 2.x: the plugin was renamed in 3.0.0, so remove the old one and install the new name.

```bash
claude plugin marketplace update prakash-plugins
```

```bash
claude plugin uninstall application-builder@prakash-plugins
```

```bash
claude plugin install adlc-3d@prakash-plugins
```

The old command `/application-builder:build-3d-app` is now `/adlc-3d:build`. Projects already built with the old name continue to work; their `docs/` files are unchanged.

## Use

Start a build from an idea:

```text
/adlc-3d:build A product viewer for a desk lamp where shoppers can rotate it and change the shade colour
```

The Tech Lead checks your environment, agrees the project folder, then runs the lifecycle:

| # | Phase | What happens | Gate |
|---|---|---|---|
| 1 | Plan | Requirements, user stories and the backlog | **You approve the scope** |
| 2 | Design | Architecture, contracts between agents, scaffold, then the interface and 3D interaction design | **You approve the design** |
| 3 | Build | Scene, assets, interface and any backend built in parallel, integrated, code reviewed and smoke tested | Automatic, on passing checks and no open critical or major review finding |
| 4 | Verify | Performance measured and improved; every acceptance criterion tested; bugs fixed and re-tested | Automatic, on test evidence |
| 5 | Review | Architect's release review, a code review of late changes, traceability matrix and a one-page release readiness report | **You approve the release** |
| 6 | Release | 6a: pipeline, hosting config, environments, rollback and changelog for the release version. 6b, after you merge and only if you want it deployed: staging, the staging check, your UAT sign-off, production, then the version tag. Every deploy and push needs your separate approval | 6a automatic. 6b: **you sign off UAT** |
| 7 | Operate and learn | Retrospective, and every known gap recorded in the backlog | Automatic |

If you want to approve every phase, or none, say so when you start; the default is the three key gates. Whatever you choose, you always sign off UAT before a production deploy, and approve every deploy and push yourself.

At the start, the Tech Lead also asks which tracker to use and whether it may commit at phase exits. See [Cards and ClickUp](#cards-and-clickup) and [Branches and pull requests](#branches-and-pull-requests).

### Commands

| Command | Use it to |
|---|---|
| `/adlc-3d:build <idea>` | Start a new application, or resume an iteration that is in progress |
| `/adlc-3d:change <request>` | Start a new iteration on an existing app from a change request, bug, performance problem or backlog item. It analyses the impact and runs only the phases the change needs |
| `/adlc-3d:incident <what is happening>` | Handle a production fault: record and triage it, mitigate with your approval for every rollback or deploy, fix it in a hotfix iteration, and write the postmortem |
| `/adlc-3d:status` | See the current iteration and phase, approvals, open questions, bugs, what is not verified and the next step. Read-only |

The lifecycle state is kept in `docs/project-status.md`, so a new session picks up where the last one stopped.

## The team

| Agent | Does |
|---|---|
| product-manager | Requirements, user stories, MVP scope |
| architect | Stack, architecture, contracts between agents, scaffold |
| ux-ui-designer | Layout, design tokens, 3D interactions, accessibility |
| technical-artist | Materials, shaders, model and texture pipeline |
| scene-developer | The 3D scene: cameras, controls, lighting, animation |
| frontend-developer | The interface over the canvas, shared state, test hook |
| backend-developer | API, storage and sign-in, only when needed |
| performance-optimiser | Measurement and optimisation |
| qa-engineer | End-to-end, visual regression and cross-browser tests |
| devops-engineer | Pipeline and hosting configuration |
| code-reviewer | Reviews every change line by line before it is tested; never edits code |
| security-engineer | Threat model at design, security review before release, when security is affected; never edits code |

Each agent can also be used on its own for work in its area.

## How the team avoids mistakes

- **Working principles.** Every agent preloads the same rules: understand the task first, check installed versions instead of relying on memory, make the smallest change, and find the root cause of a failure instead of hiding it.
- **Code rules.** Every agent that writes code, including the designer for its CSS, preloads one code standard: TypeScript and React rules, error handling, file rules, client-side security and performance habits, with a self-review checklist the architect checks again in the release review.
- **Evidence labels.** Every claim in a handoff note is marked Verified, Partly verified or Not verified. Nothing is reported as done without a check behind it.
- **Contracts first.** The store shape, the test hook and the asset names are agreed in `docs/architecture.md` before agents build in parallel.
- **Gates.** Every phase has exit criteria. The Tech Lead re-runs lint, type check, tests and build after every delegation, and does not start Verify on an app that does not load.
- **Traceability.** Before release, each requirement is traced to its story, design reference, test and result, and every gap on a Must requirement is put in front of you.
- **Code review on every change.** The code-reviewer reads the iteration's diff against the code rules, the contracts and the acceptance criteria before QA tests it, and again for anything changed later. Critical and major findings must be fixed before the build moves on.
- **Independent review.** The architect reviews the finished code against the contracts before you are asked to approve a release.
- **A closed loop.** Open bugs, unverified items and lessons from each iteration go into the backlog instead of being forgotten.
- **One owner per path.** Agents edit only their own folders and route everything else through handoff requests.
- **Guardrail hooks.** Inside a project with `docs/project-status.md`, a hook stops shell commands that add ClickUp approvers, call the ClickUp API directly or read the token or a webhook URL. Another hook blocks writes to `.env` files with values, generated output, `package-lock.json`, your `assets/source/` folder and the Tech Lead's lifecycle files, and blocks new content that looks like a credential. A second hook warns an agent that edits another agent's folder and lists code-rules hits in the file it changed. See [Guardrail hooks](#guardrail-hooks).
- **Security baseline.** The code rules map to the OWASP Top 10. The generated pipeline adds `npm audit` with expiring exceptions, a licence allow-list, a CycloneDX SBOM, a gitleaks secret scan, Dependabot and CodeQL, and hosting ships security headers with a content security policy that starts in report-only mode.
- **Accessibility.** The default standard is WCAG 2.2 AA. The design spec covers the criteria 3D apps most often miss, such as alternatives to dragging, and QA scans each UI state with axe, listing the checks axe cannot do inside the canvas.
- **Honest limits.** Frame rates from headless browsers, browsers that could not be launched and devices that were not tested are reported as unverified, not as passes.

## Guardrail hooks

From 3.2.0 the plugin ships two hooks that run on every Write and Edit while the plugin is enabled.

- **They act only inside an ADLC project:** a folder whose root has `docs/project-status.md`. Your other projects are untouched. Before the Plan phase creates that file, nothing is guarded
- **They never approve anything.** They can only block a write (before it) or add a warning (after it), so your own permission prompts still apply
- **They fail open.** If Node is missing, the input is unexpected or a hook errors or takes more than 5 seconds, the write goes ahead
- **They cover shell commands only for ClickUp.** A Bash hook blocks adding approvers, calling the ClickUp API directly and reading the token or webhook URLs. An agent could still write a file through Bash; the agents are told not to, and the pipeline's secret scan is the backstop

To switch them off for one project, add a line `Hooks: off` to `docs/project-status.md`. To switch them off for a session, start Claude Code with `ADLC3D_HOOKS=off`.

## Cards and ClickUp

From 4.0.0 the Tech Lead can keep the work as cards, so people around the project can follow it without reading `docs/`:

| Card | From | In ClickUp |
|---|---|---|
| Story `US-3` | `docs/requirements/user-stories.md` | A task tagged `adlc-story` and `epic-e1`, with the acceptance criteria listed in the description and ticked off as QA results come in |
| Backlog item `CR-4` | `docs/requirements/backlog.md` | A task tagged `adlc-change` or `adlc-bug` |
| Bug `BUG-2` | `docs/qa-report.md` | A task tagged `adlc-bug`, with priority from its severity |
| Agent task `US-3/scene-developer` | Each build delegation | A sub-task of its story |

Cards move through backlog, ready, in progress, in review, in test, ready for release and done as the phases run, with a note at each step. Several of these can map to one ClickUp status, so a List with the default three statuses works.

**Setting it up.** Choose ClickUp when the Tech Lead asks, and give it the List ID (the number in the List's URL). Then set a token in your own shell, never in chat or a file:

```bash
export CLICKUP_API_TOKEN=<token from ClickUp Settings > Apps>
```

A personal token acts with all of your rights in ClickUp, so consider a dedicated ClickUp user with access to that one List. For plan or licence questions, contact the Sales team.

**What leaves your machine.** In `full` mode, card titles, story text, acceptance criteria, bug details and short evidence notes are sent to ClickUp. In `minimal` mode only titles, IDs, the stories a bug breaks and short status notes (280 characters at most) are sent; story text, criteria wording and files stay in the repository. You see a dry run before the first push. Content that looks like a credential is never sent.

**If ClickUp is unavailable**, the operation is queued in `docs/tracker/remote.json` and retried by the next tracker command. The tracker never holds up a phase. If someone edits a card in ClickUp, the next push leaves it alone and asks you.

Prefer to keep everything in the repository? Choose the local board: the same cards and states, in `docs/tracker/board.md`.

## Sprints, notifications and approvals

From 4.1.0 each iteration is a sprint:

- **Estimates.** The product-manager sizes every story in points (1, 2, 3, 5 or 8) in its heading, `### US-1: Rotate the model (FR-5, Must, 3 pts)`, and the architect reviews the estimates against the design
- **Definition of Ready.** A story enters a sprint only with a requirement, a priority, at least two testable criteria, an estimate and its dependencies in place. `ready` checks it before approval A1
- **Sprint planning.** The Tech Lead fills the sprint in priority order up to the capacity you give, or your velocity from earlier sprints, and shows the plan at approval A1. An iteration card `IT-<n>` in ClickUp holds the goal, dates and cards; each card is tagged `sprint-<n>` with the end date
- **Sprint report.** `docs/tracker/sprint-<n>.md` shows points committed and completed, scope changes, re-estimates and a daily burndown. `sprint close` records velocity for the next plan

**Notifications.** If you choose them, the Tech Lead posts to Slack, Teams or both when a gate is waiting for you, when something is blocked, when a release is approved and when an iteration closes. Set the webhook URLs in your own shell profile:

```bash
export SLACK_WEBHOOK_URL=<Slack incoming webhook URL>
export TEAMS_WEBHOOK_URL=<Teams Workflows webhook URL>
```

Only Slack incoming webhooks (`hooks.slack.com`) and Teams Workflows hosts are accepted, and a failed notification never stops the work.

**Approvals in ClickUp.** You approve in chat by default. If you switch ClickUp approvals on, named approvers can also answer a gate on the iteration card with a comment that starts `Approve A1` or `Reject A1: <reason>`:

- You add approvers yourself, in your own terminal: `node <plugin folder>/tracker/cli.mjs approvers add <username>`. A hook stops Claude and the agents running it
- The person whose token the tracker uses cannot be an approver, because the tracker posts as them. Use a dedicated ClickUp user for the token if you want to approve in ClickUp yourself
- Approval with changes, a decision on work that changed after the request, and disagreeing approvers all come back to you in chat. Exceptions, pushes, merges and deploys are always chat only

## Releases, environments and incidents

From 4.2.0:

- **Release versions.** Each release gets a semantic version (patch for a fix, minor for a feature, major for a breaking change), agreed at the release approval and kept in `docs/project-status.md`. In ClickUp it is a Milestone card `REL-<version>` with its cards tagged `release-<version>`; the changelog entry is drafted from the documents
- **Environments and UAT.** The pipeline has preview, staging and production. After you merge, the Tech Lead deploys to staging with your approval, QA checks the staging build, and you sign off UAT (or a named UAT approver does in ClickUp, for that exact build). Production gets the build UAT approved, on a separate approval, then the release is tagged. A rollback section in `docs/deployment.md` says how to put the last good release back
- **Security engineer.** Threat models the design and reviews security before release whenever auth, uploads, data, headers, dependencies or third-party hosts change, and always for a new app
- **Incidents.** `/adlc-3d:incident` records the fault in `docs/incidents/INC-<n>.md`, triages severity (sev1 and sev2 always stop for you), mitigates with your approval for each rollback or deploy, fixes the cause in a hotfix iteration that pauses any open one, and ends with a blameless postmortem whose actions go to the backlog

## Branches and pull requests

If you agree to commits at the start, the Tech Lead:

1. Creates one branch per iteration, named after its main card, such as `feat/CU-86abc12-share-view-link`. The ClickUp GitHub integration links branches, commits and pull requests that carry a card key.
2. Commits at each phase exit, staging only the files that phase produced, after a scan of the staged changes for credentials.
3. At the release approval, asks separately whether to push the branch and open a pull request.

Agents never commit, push or merge. You, or your team's review process, merge the pull request; the cards move to done once it is merged.

## What the build produces

Alongside the application code, each project gets:

| Path | Contents |
|---|---|
| `docs/project-status.md` | Lifecycle state: iteration, phase log, approvals, decisions, open questions |
| `docs/requirements/` | Requirements, user stories and the backlog |
| `docs/architecture.md`, `docs/decisions/` | Architecture, contracts and decision records |
| `docs/design-spec.md` | Design specification |
| `docs/performance.md`, `docs/qa-report.md` | Measurements and test results |
| `docs/review.md`, `docs/code-review.md` | The architect's release review and the code review of each iteration |
| `docs/security/` | Threat model and security review |
| `docs/incidents/` | Production incidents and their postmortems |
| `docs/tracker/` | Tracker settings, the card registry and `board.md`, if you chose a tracker |
| `docs/lifecycle/` | Traceability matrix, release readiness report, retrospective |
| `docs/deployment.md`, `CHANGELOG.md` | Hosting, pipeline, manual steps and release history |
| `docs/handoffs/` | Each agent's latest handoff note |

## Developing this plugin

```text
.claude-plugin/   plugin and marketplace manifests
agents/           one file per agent
skills/           one folder per skill; build, change and status are the commands,
                  and lifecycle is the rulebook they load
hooks/            hooks.json, the guard and review hooks, and their shared ownership map and secret patterns
tracker/          the tracker command: ClickUp client, document parser, card registry and board
scripts/          validate-plugin.mjs, test-hooks.mjs and test-tracker.mjs
```

After any change, run the validator and the hook tests. The validator checks frontmatter, that every skill an agent preloads exists, that references to agents and skills resolve, that the lifecycle names every phase and agent, that the hooks point at real scripts and agents, that the governance files exist, and that the manifest versions and changelog match:

```bash
node scripts/validate-plugin.mjs
```

```bash
node scripts/test-hooks.mjs
```

```bash
node scripts/test-tracker.mjs
```

The tracker tests run the command against a mock of the ClickUp API, so they need no ClickUp account.

See `CONTRIBUTING.md` for the branch, versioning and release process, and `SECURITY.md` to report a vulnerability. The plugin is proprietary; see `LICENSE`.

Guidelines:

- Keep `working-principles` and `team-conventions` preloaded in every agent
- Put knowledge in skills and role and judgement in agents, so two agents can share one skill
- When a build goes wrong, add the lesson to the skill that should have prevented it, as a row in its common mistakes table or a line in its checklist
- Bump the version in both `plugin.json` and `marketplace.json`
