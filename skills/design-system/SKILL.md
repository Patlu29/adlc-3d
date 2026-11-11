---
name: design-system
description: How to define the design system for a 3D web application, covering design tokens in tokens.css, layering the UI over the canvas, layout, responsive breakpoints, accessibility and the structure of docs/design-spec.md. Use when designing or styling the 2D interface.
user-invocable: false
---

# Design system

## Design spec structure

Write `docs/design-spec.md` with these sections:

1. **Visual direction**: mood, references and how the 3D scene and UI should feel together
2. **User flows**: one short flow per epic
3. **Layout**: desktop and mobile layouts showing the canvas, HUD and panels
4. **Design tokens**: a summary table pointing to `src/styles/tokens.css`
5. **Components**: each UI component with its states (default, hover, focus, active, disabled, loading)
6. **3D interactions**: see the 3d-interaction-patterns skill
7. **Loading and error states**
8. **Accessibility**
9. **Contract needs**: the store fields, test-hook queries and URL parameters the design depends on, for the architect
10. **Decisions**: a dated list of design decisions

### One statement per behaviour

The spec is read literally by developers and by QA. If two sections disagree, one agent builds one and QA tests the other.

- State each behaviour in one place and refer to it from elsewhere by section number
- When a decision changes an earlier section, edit that section in the same change. The Decisions list records why; it never overrides the body of the spec
- Before handoff, search the spec for every value and behaviour you changed and confirm nothing still states the old one

### Specify with values

| Vague | Specific |
|---|---|
| The panel slides in smoothly | The panel translates 16 px and fades in over `--duration-normal` with `--ease-standard`; instant with reduced motion |
| Leave room for the scene on mobile | The expanded sheet is at most 55dvh and always leaves at least 168 px of canvas visible |
| Labels should not clash | When two labels overlap, hide the one for the smaller object; the selected object's label always shows |

## Tokens

Define every token as a CSS custom property in `src/styles/tokens.css`:

```css
:root {
  /* Colour */
  --color-bg: #0e1116;
  --color-surface: rgba(20, 24, 31, 0.72);
  --color-text: #f2f4f8;
  --color-text-muted: #a3acb9;
  --color-accent: #4f8cff;
  --color-danger: #ff5c5c;
  --color-focus: #ffd166;

  /* Typography */
  --font-sans: "Inter", system-ui, sans-serif;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.75rem;

  /* Spacing (4 px scale) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* Shape and depth */
  --radius-sm: 6px;
  --radius-md: 12px;
  --shadow-panel: 0 8px 24px rgba(0, 0, 0, 0.35);
  --blur-panel: 12px;

  /* Layers */
  --z-canvas: 0;
  --z-hud: 10;
  --z-panel: 20;
  --z-modal: 30;
  --z-toast: 40;

  /* Motion */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-normal: 0ms;
  }
}
```

Developers must use tokens, never raw values. When you add a token, add it to the summary table in the design spec too.

## UI over a 3D canvas

- The canvas fills the viewport at `--z-canvas`; the UI sits above it
- The UI layer uses `pointer-events: none`, and each interactive element sets `pointer-events: auto`, so empty space still reaches the canvas
- Keep the centre of the screen clear; place HUD elements at the edges
- Use translucent panels with a backdrop blur so the scene stays visible
- Check text contrast against the busiest part of the scene, not a flat background

## Responsive layout

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | under 640 px | Full-screen canvas; panels become bottom sheets |
| Tablet | 640 to 1024 px | Side panel collapses to an icon rail |
| Desktop | over 1024 px | Side panel open beside the canvas |

Touch targets must be at least 44 by 44 px.

### Check the arithmetic

For the smallest supported viewport (usually 360 by 640, and the same in landscape), add up every fixed height and width in each layout: title, controls, sheet, gaps and safe-area insets. Write the sum in the spec and confirm the canvas area that remains is the size you promised. A layout that only fits on your imagined screen is the most common design defect found in QA.

- Say what happens when content does not fit: wrap, scroll, truncate or collapse
- Elements that appear and disappear must not resize the canvas area or shift the scene, unless the spec says so
- Use `dvh` units for full-height mobile layouts and allow for safe-area insets

## Accessibility

- Text contrast of at least 4.5:1, and 3:1 for large text and UI controls
- Calculate the ratio for every text and surface pair and record it in the spec. For translucent surfaces, calculate it twice: over the darkest and over the brightest colour the scene can show behind the panel. If the brightest case fails, make the surface more opaque
- Give every control an accessible name that matches its visible label; put hints in a separate description
- A visible focus outline on every interactive element, using `--color-focus`
- All UI reachable and usable with the keyboard, in a logical tab order
- Respect `prefers-reduced-motion` for UI and camera animation
- Provide a text description of the scene's content for screen readers
