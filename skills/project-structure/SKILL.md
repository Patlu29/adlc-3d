---
name: project-structure
description: The standard folder layout, naming conventions, path aliases and npm scripts for 3D web applications built with this plugin. Use when scaffolding a project, adding new folders, or deciding where a file belongs.
user-invocable: false
---

# Project structure

## Folder layout

```text
my-3d-app/
├── assets/
│   └── source/            # original models and textures from the user (read only)
├── docs/
│   ├── requirements/
│   ├── decisions/
│   ├── handoffs/
│   ├── project-status.md  # Tech Lead: phase, approvals, decisions
│   ├── architecture.md
│   ├── design-spec.md
│   ├── performance.md
│   ├── qa-report.md
│   ├── deployment.md
│   └── api.md             # only if there is a backend
├── public/
│   ├── models/            # optimised .glb files
│   ├── textures/          # compressed .ktx2 / .webp textures
│   └── env/               # environment maps
├── server/                # only if there is a backend
├── src/
│   ├── scene/
│   │   ├── Experience.tsx # the single <Canvas> and top-level scene
│   │   ├── objects/       # one component per scene object
│   │   ├── lights/
│   │   ├── cameras/
│   │   ├── materials/     # technical artist
│   │   └── shaders/       # technical artist
│   ├── ui/
│   │   ├── components/
│   │   └── screens/
│   ├── state/             # zustand stores and testHook.ts
│   ├── data/              # static content shown in the UI, with its source noted
│   ├── hooks/
│   ├── styles/
│   │   └── tokens.css
│   ├── App.tsx
│   └── main.tsx
├── tests/
│   ├── e2e/               # qa-engineer
│   └── unit/              # one folder per area, owned by that area's developer
├── .env.example
├── .gitignore
├── .nvmrc
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Naming

| Item | Convention | Example |
|---|---|---|
| React components | PascalCase file and export | `ProductModel.tsx` |
| Hooks | camelCase starting with `use` | `useCameraRig.ts` |
| Stores | camelCase ending in `Store` | `sceneStore.ts` |
| Models | kebab-case | `office-chair.glb` |
| Textures | kebab-case with map type | `chair-fabric-basecolor.ktx2` |
| Shaders | kebab-case with stage | `water.vert.glsl`, `water.frag.glsl` |

## Path alias

Configure `@/` to point at `src/` in both `tsconfig.json` and `vite.config.ts`, and import with `@/state/sceneStore` rather than long relative paths.

## npm scripts

Every project must provide these scripts so the pipeline and other agents can rely on them:

| Script | Purpose |
|---|---|
| `dev` | Start the dev server |
| `build` | Type check and build for production into `dist/` |
| `preview` | Serve the production build locally |
| `build:test` | Build in test mode into `dist-test/`, for example `vite build --mode test --outDir dist-test`. This build includes the test hook |
| `preview:test` | Serve `dist-test/` on a fixed port, for example `vite preview --outDir dist-test --port 4173 --strictPort` |
| `lint` | Run ESLint |
| `format` | Format every file with Prettier |
| `format:check` | Check formatting without changing files |
| `typecheck` | Type check without emitting, using the command that suits the generated TypeScript config (`tsc --noEmit`, or `tsc -b` for project references) |
| `test` | Run unit tests once and exit, never in watch mode. It must pass when there are no tests yet (Vitest: `vitest run --passWithNoTests`) |
| `test:e2e` | Run Playwright tests against the test build |

Run each script once after creating it. A script that exists but fails or waits for input blocks every other agent. The exception is `test:e2e`: define it at scaffold time, but its first run happens when the qa-engineer has written `playwright.config.ts` and the first spec.

## .gitignore

At minimum: `node_modules/`, `dist/`, `dist-test/`, `.env`, `.env.local`, `test-results/`, `playwright-report/` and `blob-report/`. Screenshot baselines in `tests/e2e/**/*-snapshots/` are committed, not ignored.

## Environment variables

- Client-side variables must start with `VITE_` and must never contain secrets
- List every variable in `.env.example` with a comment and no real value
- Add `.env` and `.env.local` to `.gitignore`
