# Application Builder

A Claude Code plugin that builds 3D web applications with a team of specialist agents. A Tech Lead workflow takes an idea through requirements, architecture, design, build, performance, QA and delivery, with your approval at each major decision and a verification gate after every phase.

The default stack is Vite, React, TypeScript, React Three Fiber, drei and zustand, tested with Vitest and Playwright.

## Install

```bash
claude plugin marketplace add <path-or-repository-of-this-plugin>
```

```bash
claude plugin install application-builder@prakash-plugins
```

## Use

Start a build from an idea:

```text
/application-builder:build-3d-app A product viewer for a desk lamp where shoppers can rotate it and change the shade colour
```

The Tech Lead will:

1. Check your environment and agree the project folder.
2. Write requirements and user stories, then ask you to approve the scope.
3. Choose the architecture and scaffold the project, then ask you to approve it.
4. Design the interface and 3D interactions, then ask you to approve the direction.
5. Build the scene, assets, interface and any backend in parallel, then integrate and smoke test.
6. Measure and improve performance.
7. Test against every acceptance criterion and fix what fails.
8. Set up the pipeline and hosting config. Nothing is deployed or pushed without your approval.

You can also run it on an existing project built with this plugin. It reads `docs/project-status.md` and continues from there, and for a small change it runs only the phases that change needs.

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
- **Gates.** The Tech Lead re-runs lint, type check, tests and build after every delegation, and does not start QA on an app that does not load.
- **One owner per path.** Agents edit only their own folders and route everything else through handoff requests.
- **Honest limits.** Frame rates from headless browsers, browsers that could not be launched and devices that were not tested are reported as unverified, not as passes.

## What the build produces

Alongside the application code, each project gets:

| Path | Contents |
|---|---|
| `docs/project-status.md` | Phase, approvals, decisions, open questions |
| `docs/requirements/` | Requirements and user stories |
| `docs/architecture.md`, `docs/decisions/` | Architecture, contracts and decision records |
| `docs/design-spec.md` | Design specification |
| `docs/performance.md`, `docs/qa-report.md` | Measurements and test results |
| `docs/deployment.md` | Hosting, pipeline and manual steps |
| `docs/handoffs/` | Each agent's latest handoff note |

## Developing this plugin

```text
.claude-plugin/   plugin and marketplace manifests
agents/           one file per agent
skills/           one folder per skill; build-3d-app is the entry point
scripts/          validate-plugin.mjs
```

After any change, run the validator. It checks frontmatter, that every skill an agent preloads exists, that references to agents and skills resolve, and that the two manifest versions match:

```bash
node scripts/validate-plugin.mjs
```

Guidelines:

- Keep `working-principles` and `team-conventions` preloaded in every agent
- Put knowledge in skills and role and judgement in agents, so two agents can share one skill
- When a build goes wrong, add the lesson to the skill that should have prevented it, as a row in its common mistakes table or a line in its checklist
- Bump the version in both `plugin.json` and `marketplace.json`
