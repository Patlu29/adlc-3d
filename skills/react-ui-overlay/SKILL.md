---
name: react-ui-overlay
description: How to build the React DOM interface that sits over a React Three Fiber canvas in this project, covering layering and pointer events, the loading screen, in-scene labels, component conventions, styling with tokens and accessibility. Use when building HUDs, panels, menus or other UI around the 3D scene.
user-invocable: false
---

# React UI overlay

## Layering

```tsx
import { lazy, Suspense } from "react";

// The scene, three.js and drei load as a separate chunk, so the UI shell appears first
const Experience = lazy(() =>
  import("@/scene/Experience").then((m) => ({ default: m.Experience }))
);

export function App() {
  return (
    <div className="app">
      <SceneBoundary>         {/* error boundary: shows the fallback if the scene fails */}
        <Suspense fallback={null}>
          <Experience />      {/* canvas, fills the viewport */}
        </Suspense>
      </SceneBoundary>
      <div className="ui-layer">
        <Hud />
        <SidePanel />
      </div>
      <LoadingScreen />
    </div>
  );
}
```

- Never import from `three`, `@react-three/fiber` or `@react-three/drei` in `src/ui/`, `src/state/`, `src/App.tsx` or `src/main.tsx`. One such import pulls the whole 3D stack into the entry bundle. Check the build output: the entry chunk should stay small and three.js should sit in a lazy chunk

```css
.app { position: fixed; inset: 0; }
.app canvas { position: absolute; inset: 0; z-index: var(--z-canvas); }
.ui-layer { position: absolute; inset: 0; z-index: var(--z-hud); pointer-events: none; }
.ui-layer > * { pointer-events: auto; }
```

- The UI layer passes clicks through to the canvas except where there is a control
- Only the direct children of `.ui-layer` take pointer events. A full-size layout wrapper as a direct child blocks the whole canvas, so give wrappers `pointer-events: none` and re-enable it on the controls inside
- Keep UI components outside `<Canvas>`; components inside it render to WebGL, not the DOM

## Loading screen

The loading screen reads progress from the store, not from drei, so it can render before the 3D chunk has downloaded. The scene writes `loadProgress` and `sceneReady` (see the state-management skill).

```tsx
import { useSceneStore } from "@/state/sceneStore";

export function LoadingScreen() {
  const ready = useSceneStore((s) => s.sceneReady);
  const error = useSceneStore((s) => s.sceneError);
  const progress = useSceneStore((s) => s.loadProgress);
  if (ready || error) return null;   // the fallback takes over when there is an error
  return (
    <div className="loading" role="status" aria-live="polite">
      Loading {Math.round(progress)}%
    </div>
  );
}
```

- Show a determinate percentage only when real progress is reported; otherwise show an indeterminate indicator
- Fade the loading screen out rather than removing it abruptly, unless the user prefers reduced motion

## When the scene cannot run

- The fallback renders whenever `sceneError` in the store is set. Everything that can fail reports through that one field
- Test for WebGL before loading the scene chunk, by trying to create a context on a throwaway canvas. If it fails, call `setSceneError` and do not load the scene
- Wrap the scene in an error boundary that calls `setSceneError` when a chunk or a model fails to load. A lost WebGL context throws nothing; the scene reports it through `setSceneError` itself
- The fallback gives the user the app's essential content in plain HTML where the requirements ask for it, and is announced to screen readers

## Labels inside the scene

Labels anchored to 3D points use drei `Html` inside the canvas. Those belong to the scene developer, who must not import from `src/ui/`. Your job is to style the global class `.scene-label` (the name is fixed by the team contracts) in a stylesheet loaded from `src/main.tsx`, built from the design tokens. The scene developer applies that class without importing anything. List any modifier classes you add, such as `.scene-label--selected`, in your handoff note.

## Talking to the scene

- UI actions write to the zustand stores in `src/state/`; the scene reads from them
- Never reach into three.js objects from the UI
- See the state-management skill for store conventions

## Components

- One component per file in `src/ui/components/`, full screens in `src/ui/screens/`
- Style with CSS modules or plain CSS using the tokens in `src/styles/tokens.css`; never hard-code colours, spacing or fonts
- Build every state from the design spec: default, hover, focus, active, disabled and loading

## Accessibility

- Use real elements: `<button>` for actions, `<a>` for navigation, `<dialog>` for modals
- Every icon-only button has an `aria-label`
- Manage focus when panels and dialogs open and close
- Announce scene changes, such as the selected object, in a visually hidden `aria-live` region
- Keep a control's accessible name equal to its visible label. Attach hints with `aria-describedby`, not inside the button, or screen readers read the hint as part of the name
- Test the whole UI with the keyboard only

## Common mistakes

| Mistake | Result | Do this instead |
|---|---|---|
| Importing drei or three.js in UI code | The entry bundle grows by hundreds of kilobytes | Keep 3D imports inside the lazy scene chunk; share data through the store |
| Measuring layout once on mount | Insets go stale when content appears, disappears or the window resizes | Measure with `ResizeObserver` and update on every change |
| An element that changes height above the canvas | The scene jumps when it appears or disappears | Reserve the space, or keep it out of the measured insets |
| `100vh` on mobile | Content hidden behind browser chrome | Use `100dvh` with a fallback |
| Removing a panel from the DOM while it animates out | Focus is lost | Keep it mounted with `inert` until the animation ends, then return focus to the trigger |
| Hover-only affordances | Unusable on touch | Give every hover action a tap or focus equivalent |
| Facts typed in from memory | Wrong content shipped | Take content from `src/data/` with its source recorded |
