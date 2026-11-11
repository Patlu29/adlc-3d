# ADLC 3D

A Claude Code plugin that builds 3D web applications with a team of specialist agents, run as an Agentic Development Life Cycle (ADLC). A Tech Lead takes an idea through seven phases, with your approval of the scope, the design and the release, an evidence check on every phase, and a feedback loop that turns what was learned into the next iteration.

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
| 3 | Build | Scene, assets, interface and any backend built in parallel, integrated and smoke tested | Automatic, on passing checks |
| 4 | Verify | Performance measured and improved; every acceptance criterion tested; bugs fixed and re-tested | Automatic, on test evidence |
| 5 | Review | Architect's release review, traceability matrix and a one-page release readiness report | **You approve the release** |
| 6 | Release | Pipeline, hosting config, deployment notes and changelog. Nothing is deployed or pushed without your separate approval | Automatic |
| 7 | Operate and learn | Retrospective, and every known gap recorded in the backlog | Automatic |

If you want to approve every phase, or none, say so when you start; the default is the three key gates.

### Commands

| Command | Use it to |
|---|---|
| `/adlc-3d:build <idea>` | Start a new application, or resume an iteration that is in progress |
| `/adlc-3d:change <request>` | Start a new iteration on an existing app from a change request, bug, performance problem or backlog item. It analyses the impact and runs only the phases the change needs |
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

Each agent can also be used on its own for work in its area.

## How the team avoids mistakes

- **Working principles.** Every agent preloads the same rules: understand the task first, check installed versions instead of relying on memory, make the smallest change, and find the root cause of a failure instead of hiding it.
- **Evidence labels.** Every claim in a handoff note is marked Verified, Partly verified or Not verified. Nothing is reported as done without a check behind it.
- **Contracts first.** The store shape, the test hook and the asset names are agreed in `docs/architecture.md` before agents build in parallel.
- **Gates.** Every phase has exit criteria. The Tech Lead re-runs lint, type check, tests and build after every delegation, and does not start Verify on an app that does not load.
- **Traceability.** Before release, each requirement is traced to its story, design reference, test and result, and every gap on a Must requirement is put in front of you.
- **Independent review.** The architect reviews the finished code against the contracts before you are asked to approve a release.
- **A closed loop.** Open bugs, unverified items and lessons from each iteration go into the backlog instead of being forgotten.
- **One owner per path.** Agents edit only their own folders and route everything else through handoff requests.
- **Honest limits.** Frame rates from headless browsers, browsers that could not be launched and devices that were not tested are reported as unverified, not as passes.

## What the build produces

Alongside the application code, each project gets:

| Path | Contents |
|---|---|
| `docs/project-status.md` | Lifecycle state: iteration, phase log, approvals, decisions, open questions |
| `docs/requirements/` | Requirements, user stories and the backlog |
| `docs/architecture.md`, `docs/decisions/` | Architecture, contracts and decision records |
| `docs/design-spec.md` | Design specification |
| `docs/performance.md`, `docs/qa-report.md` | Measurements and test results |
| `docs/review.md` | The architect's release review |
| `docs/lifecycle/` | Traceability matrix, release readiness report, retrospective |
| `docs/deployment.md`, `CHANGELOG.md` | Hosting, pipeline, manual steps and release history |
| `docs/handoffs/` | Each agent's latest handoff note |

## Developing this plugin

```text
.claude-plugin/   plugin and marketplace manifests
agents/           one file per agent
skills/           one folder per skill; build, change and status are the commands,
                  and lifecycle is the rulebook they load
scripts/          validate-plugin.mjs
```

After any change, run the validator. It checks frontmatter, that every skill an agent preloads exists, that references to agents and skills resolve, that the lifecycle names every phase and agent, and that the two manifest versions match:

```bash
node scripts/validate-plugin.mjs
```

Guidelines:

- Keep `working-principles` and `team-conventions` preloaded in every agent
- Put knowledge in skills and role and judgement in agents, so two agents can share one skill
- When a build goes wrong, add the lesson to the skill that should have prevented it, as a row in its common mistakes table or a line in its checklist
- Bump the version in both `plugin.json` and `marketplace.json`
