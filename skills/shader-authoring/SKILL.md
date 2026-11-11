---
name: shader-authoring
description: How to write custom GLSL shaders and post-processing effects for React Three Fiber in this project, covering choosing an approach, drei shaderMaterial, uniforms, file layout, mobile precision and performance. Use when building custom materials, visual effects or post-processing.
user-invocable: false
---

# Shader authoring

## Choose the lightest approach

| Need | Approach |
|---|---|
| Standard look with a small tweak, such as vertex wobble | Extend a built-in material with `onBeforeCompile`, or a library such as `three-custom-shader-material` |
| Fully custom look, such as stylised or procedural | drei `shaderMaterial` |
| Full-screen effects such as bloom, depth of field or vignette | `@react-three/postprocessing` |
| A built-in material already does it | Use the built-in material; do not write a shader |

Custom shaders do not get scene lighting automatically. Prefer extending a standard material when the object must react to lights.

## File layout

```text
src/scene/shaders/
├── wave/
│   ├── wave.vert.glsl
│   ├── wave.frag.glsl
│   └── WaveMaterial.ts
```

Import GLSL as text with Vite's `?raw` suffix, so no extra plugin is needed:

```ts
import { shaderMaterial } from "@react-three/drei";
import { extend } from "@react-three/fiber";
import { Color } from "three";
import vertexShader from "./wave.vert.glsl?raw";
import fragmentShader from "./wave.frag.glsl?raw";

export const WaveMaterial = shaderMaterial(
  { uTime: 0, uColor: new Color("#4f8cff") },
  vertexShader,
  fragmentShader
);

extend({ WaveMaterial });
```

Add a TypeScript declaration so `<waveMaterial />` type checks, and document the material's uniforms in your handoff note. Declare it by extending the `ThreeElements` interface of `@react-three/fiber`; check the installed version's documentation for the exact form, because it changed between major versions.

## Colour output

A custom fragment shader bypasses the renderer's output handling unless you include it. Without these two lines at the end of `main()`, the object ignores tone mapping and looks too bright or the wrong colour next to standard materials:

```glsl
gl_FragColor = vec4(color, alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
```

- Colours passed as uniforms through `new Color("#4f8cff")` are converted to linear for you; do the lighting maths in linear space
- Confirm the include names against the installed three.js version; they have been renamed before

## When a shader fails

- Read the full compile log in the browser console; it gives the line number in the expanded source
- A uniform that has no effect usually has a name mismatch between the shader and the material definition
- Shaders written for older WebGL (`texture2D`, `varying` in unusual places) may need updating for the installed three.js version
- Test with a fixed `uTime` so an animated effect can be compared and screenshotted

## Uniforms

- Prefix uniforms with `u` (`uTime`, `uColor`), attributes with `a` and varyings with `v`
- Update time-based uniforms in `useFrame` through a ref, never through React state
- Expose artist-tweakable uniforms through `leva` in development builds only

## Performance

- Do as much work as possible in the vertex shader rather than the fragment shader
- Avoid dynamic loops and heavy branching in fragment shaders
- Use `mediump` precision in fragment shaders where the result looks the same; many mobile GPUs are much faster with it
- Use texture lookups instead of expensive maths, such as noise textures instead of procedural noise
- Each post-processing pass costs a full-screen draw; keep the effect stack short and merge effects where the library allows

## Checklist before handoff

- [ ] Compiles without warnings in Chrome, Safari and Firefox
- [ ] Looks correct on a mobile GPU, or the mobile result is documented
- [ ] Uniforms and their ranges are documented
- [ ] Reduced-motion users get a static or slower version of animated effects
- [ ] The shader's colours match neighbouring standard materials under the app's tone mapping
- [ ] Animated uniforms stop in test mode so screenshots are repeatable
