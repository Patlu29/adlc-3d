---
name: 3d-tech-stack
description: The default technology stack for 3D web applications built with this plugin (Vite, React, TypeScript, React Three Fiber, drei, Zustand), when to deviate from it, and how to record decisions as ADRs. Use when choosing or changing the stack or adding a dependency.
user-invocable: false
---

# 3D web application tech stack

## Default stack

Start from this stack unless a requirement gives a clear reason to deviate.

| Concern | Default | Notes |
|---|---|---|
| Build tool | Vite | Fast dev server; native ES modules |
| Language | TypeScript, `strict: true` | |
| UI framework | React | |
| 3D renderer | three.js through `@react-three/fiber` | Declarative scene graph in React |
| 3D helpers | `@react-three/drei` | Controls, loaders, `Environment`, `Html`, `useGLTF` |
| Post-processing | `@react-three/postprocessing` | Only if the design needs effects |
| Physics | `@react-three/rapier` | Only if the requirements need physics |
| State | `zustand` | Shared between UI and scene |
| Debug panel | `leva` | Development builds only |
| Performance overlay | `r3f-perf` | Development builds only |
| Unit tests | Vitest | |
| End-to-end tests | Playwright | |
| Lint and format | ESLint and Prettier | |
| Backend (if needed) | Node.js with Fastify, or a managed backend | Decide from the requirements |

## Versions

Do not pin versions from memory. Install the current releases when scaffolding:

```bash
npm create vite@latest . -- --template react-ts
npm install three @react-three/fiber @react-three/drei zustand
npm install -D @types/three vitest @playwright/test
```

### Before installing

- Confirm the registry is reachable with `npm ping`. If it fails or asks for credentials, stop and report it. Never edit the user's `.npmrc` or run `npm config set`
- Scaffolding commands ask questions when the folder is not empty or a flag is missing, and an agent cannot answer them. Scaffold into a new empty subfolder and move the files, or write the config files by hand. Never leave a command waiting for input
- Use Node's current LTS release and record it in `.nvmrc`

### After installing

React Three Fiber, drei and React must be compatible major versions; a mismatch produces peer dependency warnings at install and obscure runtime errors later.

```bash
npm ls react three @react-three/fiber @react-three/drei
npm view @react-three/fiber peerDependencies
```

- Fix every peer dependency warning before going further; do not use `--force` or `--legacy-peer-deps` to hide one
- Record the installed version of each runtime dependency in `docs/architecture.md`. Other agents read that table instead of guessing which API they have
- Commit `package-lock.json` so every agent and the pipeline install the same versions

## When to deviate

| Situation | Consider |
|---|---|
| Game-like app with heavy physics, GUI and asset tooling | Babylon.js |
| A single small effect on an otherwise static site | Plain three.js without React |
| Mostly static 3D with little interaction, built by designers | A no-code tool export, embedded |
| Need for compute shaders or very large scenes, with modern browser support only | three.js WebGPU renderer |
| Content-heavy site with SEO needs | A framework with server rendering, with the canvas loaded on the client only |

Any deviation needs an ADR.

## Architecture decision records

Write each significant decision as `docs/decisions/NNNN-short-title.md`:

```markdown
# 0001: Use React Three Fiber for the 3D scene

## Status
Accepted

## Context
<what forces the decision>

## Decision
<what we chose>

## Consequences
<what gets easier, what gets harder>
```

## Adding a dependency

Before adding any package, check:
- Is it actively maintained, with a release in the last year?
- What does it add to the production bundle?
- Is there already a drei helper that does the same thing?
- Does it load anything from a third-party domain at runtime? Fonts, decoders and environment presets fetched from a CDN break offline use, strict content security policies and privacy requirements

Only the architect adds dependencies. Other agents request them in their handoff note.

## Architecture document

`docs/architecture.md` must contain:

1. **Overview**: one paragraph and a simple diagram of scene, UI, store and any backend
2. **Stack**: each choice with the requirement it serves
3. **Installed versions**: a table of runtime dependencies
4. **Structure**: the folder layout and module boundaries
5. **Data flow**: how a user action travels from the UI or canvas through the store to the scene and back
6. **Contracts**: the store contract, the test hook and test-mode URL parameters, and the asset manifest (see the team-conventions and state-management skills)
7. **Loading strategy**: what loads in the entry bundle, what is lazy, and how the WebGL-unavailable fallback is reached
8. **Requirement coverage**: a table mapping each Must requirement to the part of the architecture that delivers it
9. **Risks**: what is most likely to go wrong and how the team will notice
