---
name: code-rules
description: The code standard for every agent on the 3D web application team that writes or reviews code, covering precedence, TypeScript, structure and React, errors and async code, file rules, security, performance habits, tests and a self-review checklist. Preloaded into every agent in this plugin that writes code.
user-invocable: false
---

# Code rules

These rules set the standard for every file of code the team writes: TypeScript and TSX, GLSL, CSS, config, tests and workflows. The working-principles skill covers how you work and the team-conventions skill covers who owns what; this skill covers what good code looks like here.

They exist because several agents write code in parallel without seeing each other's work. The result should read as if one careful engineer wrote it, pass the architect's release review the first time, and stay safe and fast on a mid-range phone.

## Precedence

| # | Source | Example |
|---|---|---|
| 1 | A user decision in your task prompt or `docs/project-status.md` | "The client's CMS must be able to embed the viewer" |
| 2 | `docs/architecture.md` and the ADRs in `docs/decisions/` | An ADR that chooses a sanitiser for rich text |
| 3 | The project's ESLint, Prettier and TypeScript config | Import order, line length |
| 4 | This skill | |
| 5 | Code examples in other skills | Where an example breaks a rule here, follow the rule |

The security rules in section 5 are the exception: only a user decision recorded in `docs/project-status.md` can waive one. Whenever you follow a higher source over a rule here, record it under **Decisions** in your handoff note and name the source.

## 1. TypeScript

- Keep `strict` on. No `any`: write the type, or use `unknown` and narrow it with a type guard
- No non-null assertion (`!`) unless the line above guarantees the value; prefer an early return
- Exported functions and hooks declare their parameter and return types. Components type their props with a named `Props` type
- Model fixed sets of values as union types or `as const` objects, not loose strings and numbers
- Import shared types from their owner's module, such as store types from `src/state/`, instead of redeclaring them. Two copies of a type drift apart without a compile error
- Data from outside the program is `unknown` until validated: fetch responses, URL parameters, `localStorage`, `postMessage`, file contents and glTF `userData`. A cast (`as Scene`) is not validation

## 2. Structure and React

- One component per file, named as the project-structure skill says
- Keep a file under about 250 lines and a function under about 50. Past that, split by responsibility: long files are where reviewers miss defects and where parallel edits collide
- Put pure logic (maths, data transforms, formatting, validation) in plain functions outside components, so it can be unit tested without WebGL or a DOM
- Derive values instead of storing them. Do not copy props or store state into local state and keep it in sync with an effect
- Every effect that subscribes, listens, starts a timer or starts a request returns a cleanup
- Select single fields from stores, as the state-management skill shows. Never call a store hook without a selector
- Name tuning values (camera distance, damping, durations, size limits) as constants at the top of the module. No magic numbers in JSX
- Import across areas with the `@/` alias; use relative imports only inside the same folder
- Comments explain why, not what. Delete commented-out code; git keeps the history
- Do not build a shared abstraction (a generic hook, wrapper component or helper module) until there are two real uses

## 3. Errors and async code

- No empty `catch`. Catch only where you can act: recover, tell the user, or report through the store. Scene failures go through `setSceneError`, as the react-ui-overlay skill describes
- Every promise is awaited, returned or given a `.catch`. No floating promises
- Cancel requests started by a component or effect with an `AbortController` in the cleanup, and ignore responses to outdated requests
- User-facing error text says what happened and what to do next, in plain Australian English. Technical detail belongs in the error object and your handoff note, not the UI
- Leave no `console.log`. Code must run without console warnings or errors in normal use, so surface failures in the UI or the store instead of logging and carrying on

## 4. File rules

- Edit only paths you own, as the team-conventions skill sets out. New files go where the project-structure skill puts them; if no folder fits, request one from the architect under **Requests for other agents** instead of creating a new top-level folder
- Name files as the project-structure skill says. For anything it does not cover, match the nearest existing file
- Never hand-edit `package-lock.json`, build output or any file a tool regenerates. Change the input and regenerate
- Never commit `.env` files with values, `dist/`, `dist-test/`, test reports, `node_modules/`, or editor and OS files
- Keep scratch and measurement scripts in a temporary folder outside the project
- Remove files and exports you created that nothing uses any more, including placeholders once the real file exists

## 5. Security

- Everything shipped to the browser is public, including `VITE_` variables. No secret, token or credential goes in client code, assets or config; calls that need one go through the backend
- Validate the shape of external data before use (section 1). Reject what fails with an error state instead of guessing a default
- Never turn data into HTML or code: no `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function`. Render text through JSX, which escapes it. If the requirements need rich text, ask the architect to choose a sanitiser through an ADR
- Check that a URL built from data uses `https:` (or `http:` for local development) before it becomes an `href` or `src`, so a `javascript:` URL cannot run
- Uploaded models and textures: enforce the allowed types and a size limit before reading the file, parse inside a `try`, and treat names and `userData` inside the file as untrusted text. Accept GLB only, or reject glTF files whose buffers or images point at external URLs, so a file cannot make the browser fetch arbitrary addresses
- No runtime requests to third-party domains (fonts, scripts, decoders, environment presets) unless `docs/architecture.md` lists the domain. Self-host instead; the 3d-tech-stack skill explains why
- The test hook exists only in development and test builds, guarded as the state-management skill shows. Never enable it, or any debug panel, from a URL parameter alone
- Never log tokens, cookies, personal data, or full request or response bodies
- Never install a package yourself. When you request one, state what it loads at runtime and from where
- Backend code follows the api-conventions and auth-patterns skills. In addition, never build a query, file path or shell command by joining strings with request data, and resolve upload paths inside a fixed directory so `../` cannot escape it
- Workflows give each job only the `permissions:` it needs and read credentials only from the repository's secret store

## 6. Performance habits

The budgets live in the webgl-performance skill. These habits keep code inside them from the first commit, so the performance-optimiser's round is tuning, not rework.

- Allocate nothing in `useFrame`: create vectors, matrices and colours once (`useRef`, `useMemo` or module scope) and reuse them
- Never call `setState` or a store action every frame. Read stores in the loop with `getState()`, as the threejs-scene skill shows
- Keep imports from `three`, `@react-three/fiber` and `@react-three/drei` inside `src/scene/`, so the 3D stack stays in the lazy chunk (see the react-ui-overlay skill)
- Lazy-load anything the first view does not need, with `React.lazy` or a dynamic `import()`
- Share geometries and materials between meshes, and dispose of anything you create by hand
- Handlers for frequent events (`pointermove`, `resize`, `scroll`, `wheel`) do as little as possible and batch UI updates to the next animation frame
- Memoise (`memo`, `useMemo`, `useCallback`) where a re-render is measured or would rebuild scene objects, not by reflex
- If your change knowingly exceeds a budget, record it under **Risks** in your report

## 7. Tests

- The owner of the code writes its unit tests in `tests/unit/<area>/`. Test behaviour through the public function or component, not private details
- A bug fix in unit-testable code comes with a test that fails without the fix
- Leave no `.only` or `.skip` in specs, and no fixed delays: wait for a condition, such as the test hook's `ready` flag
- Tests are deterministic: no real network, and a fixed clock and seed wherever time or randomness matters
- Type the test hook once in a shared test helper and use that type. Do not reach it through `as any`

## Self-review checklist

Run this search, then check every hit that is in a file you changed:

```bash
grep -rnE "console\.log|: any\b|as any|@ts-ignore|eslint-disable|dangerouslySetInnerHTML|innerHTML|eval\(|new Function|\.only\(|\.skip\(" src server tests 2>/dev/null
```

If you have no command-line tool, run the same pattern with the Grep tool over the same folders.

- [ ] No `any`, unjustified `!`, `@ts-ignore` or `eslint-disable` in your code
- [ ] External data is validated before use, and nothing from data becomes HTML or code
- [ ] No empty `catch`, floating promise, or effect without a cleanup
- [ ] No `console.log`, commented-out code, unused export or orphaned file
- [ ] Nothing allocates or writes state inside `useFrame`
- [ ] No 3D import outside `src/scene/`, and no new third-party runtime request
- [ ] Files and functions are within the size guide, and tuning values are named
- [ ] Every rule you departed from is recorded under **Decisions** with its source

## Common mistakes

| Mistake | Result | Do this instead |
|---|---|---|
| `const scene = (await res.json()) as Scene` | A bad response crashes deep in the scene, far from the cause | Validate the shape, then use the typed value |
| `catch {}` around a model load | A blank canvas and no message for the user | Call `setSceneError` with a message |
| `new Vector3()` inside `useFrame` | Garbage collection stutter every few seconds | Create it once in a `useRef` and reuse it |
| Copying a store field into `useState` | The UI and the scene disagree after the next change | Select the field directly |
| A store type redeclared in `src/scene/` | It drifts from the contract without a compile error | Import the type from `src/state/` |
| A fetch in an effect without an abort | A slow, stale response overwrites the current one | Abort in the cleanup and ignore outdated responses |
| `(window as any).__APP_TEST__` in a spec | Typos in hook fields pass the type check and fail at run time | Use the shared test hook type |
