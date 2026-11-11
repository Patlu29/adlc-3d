---
name: state-management
description: How shared state is managed between the React UI and the React Three Fiber scene in this project with zustand, covering store layout, selectors, reading state in the render loop, URL state and server data. Use when creating or changing stores, or connecting UI actions to the 3D scene.
user-invocable: false
---

# State management

## Where state lives

| Kind of state | Where | Example |
|---|---|---|
| Shared between UI and scene | zustand store in `src/state/` | Selected part, chosen colour, camera preset |
| Local to one component | `useState` / `useRef` | Whether a dropdown is open |
| Per-frame values | Refs, never React state | Current rotation, animation time |
| Shareable in a link | URL search params, synced to the store | Chosen configuration |
| From the backend | A data-fetching library, or a store slice with loading and error fields | Saved scenes |

## Store layout

One store per domain, such as `sceneStore.ts` and `uiStore.ts`:

```ts
import { create } from "zustand";

type CameraPreset = "front" | "side" | "top";

interface SceneState {
  selectedPartId: string | null;
  colour: string;
  cameraPreset: CameraPreset;
  selectPart: (id: string | null) => void;
  setColour: (colour: string) => void;
  setCameraPreset: (preset: CameraPreset) => void;
}

export const useSceneStore = create<SceneState>()((set) => ({
  selectedPartId: null,
  colour: "#4f8cff",
  cameraPreset: "front",
  selectPart: (id) => set({ selectedPartId: id }),
  setColour: (colour) => set({ colour }),
  setCameraPreset: (preset) => set({ cameraPreset: preset }),
}));
```

- Keep actions inside the store; components call actions instead of calling `set` directly
- Store plain data only (strings, numbers, IDs); never store three.js objects

## Reading state

- In components, select only what you need so unrelated changes do not re-render:

```ts
const colour = useSceneStore((s) => s.colour);
```

- In `useFrame`, read without subscribing, so the scene does not re-render every change:

```ts
useFrame(() => {
  const { selectedPartId } = useSceneStore.getState();
});
```

- When a selector returns a new object or array, wrap it in `useShallow` from `zustand/react/shallow`. Without it the component re-renders on every store change, and in current zustand versions it can loop forever:

```ts
import { useShallow } from "zustand/react/shallow";

const { colour, cameraPreset } = useSceneStore(
  useShallow((s) => ({ colour: s.colour, cameraPreset: s.cameraPreset }))
);
```

- To react to a change outside React, use `useSceneStore.subscribe`

## The store contract

The architect defines the shared fields in the **Contracts** section of `docs/architecture.md` before the build, because the scene developer codes against them in parallel. Implement the contract exactly. Every app needs at least these fields:

| Field | Type | Action | Written by | Read by |
|---|---|---|---|---|
| `loadProgress` | `number` (0 to 100) | `setLoadProgress(value: number)` | scene | UI loading screen |
| `sceneReady` | `boolean` | `setSceneReady(ready: boolean)` | scene, after assets load and the first frame renders | UI, test hook |
| `sceneError` | `string \| null` | `setSceneError(message: string \| null)` | scene, the WebGL check or the error boundary | UI fallback |

These names are fixed, and they live in `sceneStore.ts`. The architect scaffolds them as a typed placeholder so both developers compile against the same store from the start.

Whenever you add or change a store field, list it in your handoff note with its type, its meaning, which agent writes it and which reads it, and ask the architect to update the contract.

## Test hook

End-to-end tests cannot see inside the canvas, so the app exposes `window.__APP_TEST__` in development and test builds only. Its shape is part of the contract:

```ts
// src/state/testHook.ts
export interface AppTestHook {
  ready: boolean;                               // true once the scene is loaded and idle
  stores: Record<string, unknown>;              // the zustand hooks, by name
  scene: Record<string, (...args: never[]) => unknown>; // queries registered by the scene
}

export const testHookEnabled =
  import.meta.env.DEV || import.meta.env.MODE === "test";

export function updateTestHook(patch: Partial<AppTestHook>): void {
  if (!testHookEnabled) return;
  const w = window as unknown as { __APP_TEST__?: AppTestHook };
  const prev = w.__APP_TEST__ ?? { ready: false, stores: {}, scene: {} };
  w.__APP_TEST__ = {
    ready: patch.ready ?? prev.ready,
    stores: { ...prev.stores, ...patch.stores },   // merge, so several callers can register
    scene: { ...prev.scene, ...patch.scene },
  };
}
```

- The frontend developer owns this file and registers the stores: `updateTestHook({ stores: { useSceneStore } })`
- The scene developer imports `updateTestHook` to set `ready` and to register scene queries such as the screen position of an object or the camera distance. Set `ready` to false as soon as a transition starts, and back to true when it settles
- Tests run against a test-mode production build (`npm run build:test`), so the hook exists there but never in the real production build. Check with a search of `dist/` for `__APP_TEST__`; it must find nothing
- Keep the condition exactly as written so the bundler can remove the hook from production builds

## Common mistakes

| Mistake | Result | Do this instead |
|---|---|---|
| Subscribing to the whole store, `useSceneStore()` | Every component re-renders on every change | Select single fields |
| Selector returning a new object without `useShallow` | Extra renders or an infinite loop | Use `useShallow` |
| Storing a three.js object, DOM node or function result in the store | Stale references, broken tests | Store IDs and plain data |
| Writing to the store every frame | React re-renders 60 times a second | Keep per-frame values in refs; write only when a meaningful value changes |
| Two fields that must always agree | They drift apart | Store one and derive the other in a selector |
| UI and scene each keeping their own copy of a value | The copies disagree | One store field, one writer |
