---
name: 3d-interaction-patterns
description: Proven interaction patterns for 3D web applications, covering camera controls, selection and hover, annotations, camera transitions, scroll-driven scenes, touch gestures, loading states and accessible alternatives, plus how to specify them. Use when designing or implementing how users interact with a 3D scene.
user-invocable: false
---

# 3D interaction patterns

## Specify every interaction like this

```markdown
### Interaction: Select a part
- Trigger: click or tap on a part; Enter on the focused part in keyboard mode
- Feedback: outline highlight within 100 ms; details panel opens
- Camera: eases to frame the part over 600 ms (instant with reduced motion)
- Exit: click empty space, press Escape, or close the panel
- Touch: same as click; no hover state
- Keyboard: Tab cycles through parts; Enter selects; Escape clears
- Interrupted: a drag during the camera move cancels the move and gives control to the user
- Repeated: selecting the selected part again does nothing
- State: sets `selectedPartId` in the scene store
```

Cover the edges for every interaction: what happens if it is interrupted, repeated, triggered while loading, or triggered while another transition is running. Unspecified edges are where developers guess and QA finds bugs.

## Camera controls

| Pattern | Use when | drei helper |
|---|---|---|
| Orbit around a target | Viewing a single object or product | `OrbitControls` |
| Constrained orbit | Product viewer; stop users getting lost | `OrbitControls` with min/max polar angle and distance |
| Smooth damped camera | Polished feel; preset views | `CameraControls` |
| Presentation (drag rotates object, camera fixed) | Simple product spin | `PresentationControls` |
| Scroll-driven camera | Storytelling and landing pages | `ScrollControls` with `useScroll` |
| First-person | Walkthroughs and spaces | `PointerLockControls` or `KeyboardControls` |

Defaults:
- Always limit zoom distance so the object cannot be lost or clipped
- Disable panning unless users need it
- Provide a **Reset view** button, and define the reset view precisely (camera position, target and framing) so "returns to the first view" can be tested
- Frame the subject within the visible canvas area, not the whole window, when panels cover part of the canvas
- A drag is not a click: releasing after a drag must not select what is under the pointer

## Selection and hover

- Hover: change the cursor to a pointer and add a subtle highlight (outline or emissive tint)
- Select: a stronger highlight plus a details panel in the UI overlay
- Touch devices have no hover, so never hide essential information behind hover
- Stop event propagation so clicks select only the nearest object

## Annotations and labels

- Use drei `Html` for a small number of labels anchored to 3D points
- Hide labels that are behind the model with the `occlude` option
- For more than about 20 labels, render them as sprites or text in the scene instead of DOM elements
- Labels collide when objects are close together on screen. Specify the rule: which label wins, and whether the other hides or moves. Check it in the first view at the smallest viewport
- Make small objects easy to hit: specify a minimum target of 44 by 44 px on screen, whatever the object's rendered size

## Transitions

- Animate the camera with easing between 400 and 900 ms
- Never move the camera without the user causing it, apart from an intro that can be skipped
- With `prefers-reduced-motion`, jump straight to the end state

## Loading states

- Show a loading screen with real progress (drei `useProgress`)
- Show the UI shell immediately; load heavy models after the first view where possible
- If WebGL is unavailable, show a clear message and a static image fallback

## Accessible alternatives

- Keyboard: arrow keys rotate, plus and minus zoom, Tab cycles interactive objects, Escape clears selection
- Screen readers: describe the scene and the selected object in a visually hidden live region
- Every action available in 3D should also be available from the UI overlay, for example a parts list next to clickable parts
