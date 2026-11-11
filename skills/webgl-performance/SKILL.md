---
name: webgl-performance
description: How to measure and improve the performance of a React Three Fiber / WebGL application, covering performance budgets, measurement tools, fixes ordered by impact (draw calls, instancing, LOD, on-demand rendering, adaptive resolution, shadows) and the performance report format. Use when auditing or optimising frame rate, memory or load time.
user-invocable: false
---

# WebGL performance

## Budgets

| Metric | Desktop target | Mobile target |
|---|---|---|
| Frame rate | 60 FPS steady | 30 FPS or more steady |
| Draw calls per frame | Under 100 | Under 50 |
| Triangles on screen | Under 500,000 | Under 150,000 |
| Texture memory | Under 256 MB | Under 128 MB |
| JavaScript bundle (gzip) | Under 500 KB for the first view | Same |
| Time to interactive | Under 3 seconds on broadband | Under 5 seconds on 4G |

Use the targets in the requirements document if they differ.

## Measure first

| Tool | Shows |
|---|---|
| `r3f-perf` (`<Perf />` inside the canvas, development only), if the architect has installed it | FPS, draw calls, triangles, GPU time, memory |
| `gl.info` from `useThree` | Draw calls, triangles, geometries and textures in memory |
| Chrome DevTools Performance panel, with CPU throttling | Long frames, JavaScript cost, garbage collection |
| Chrome DevTools Network panel, with network throttling | Download size and load order |
| Lighthouse | Load performance and bundle issues |
| `npx vite-bundle-visualizer` | What is inside the JavaScript bundle |

To read figures from a running build, use the Playwright setup the qa-engineer created for the smoke test: run a short throwaway script from a temporary folder outside the project against the test build, and read `gl.info` through a scene query in the test hook. If the query you need is missing, request it from the scene developer. Do not commit measurement scripts or add packages.

Record every measurement with the device, browser, build, viewport and throttling used. Measure the production build, not the dev server; development builds are much slower.

### What you can and cannot measure here

| Metric | In an automated or headless environment | Label |
|---|---|---|
| Bundle size, chunk sizes, asset sizes, first-view download | Reliable: read them from the build output and the network log | Verified |
| Draw calls, triangles, geometries, textures | Reliable: read `gl.info` through the test hook or `r3f-perf` | Verified |
| Memory growth over repeated actions | Reliable as a trend from `gl.info.memory` | Verified |
| Frame rate, frame time, time to interactive | Not reliable: headless browsers render in software and run on a different CPU | Not verified, unless measured on a real GPU |

For every target you cannot measure, write the exact steps for a person to measure it on a real mid-range laptop and phone, and list it under remaining issues. Do not turn draw calls and triangle counts into an estimated frame rate and report it as a result.

### Find the bottleneck before choosing a fix

| Test | If the frame rate improves | The limit is |
|---|---|---|
| Halve the canvas resolution (`dpr`) | Yes | GPU fill rate: fragment shaders, post-processing, overdraw, resolution |
| Hide half the objects | Yes | Draw calls or vertex count |
| Neither helps, and the Performance panel shows long scripting | | CPU: JavaScript in `useFrame`, React re-renders, raycasting |
| Slow only at start | | Loading: download size, decoding, shader compilation |

## Fixes, in order of typical impact

1. **Reduce draw calls**
   - Use instancing for repeated objects (drei `Instances` / `Merged`, or `InstancedMesh`)
   - Merge static meshes that share a material
   - Reduce the number of materials; share materials between meshes
2. **Render only when needed**
   - Use `frameloop="demand"` for scenes that are idle between interactions, and call `invalidate()` on change
3. **Adapt to the device**
   - Clamp `dpr` to `[1, 2]`, and lower it on weak devices with drei `PerformanceMonitor`
   - Use level of detail with drei `Detailed` for large or distant models
4. **Cheaper lighting and shadows**
   - Bake lighting and shadows into textures where the scene is static
   - Use `ContactShadows` or `BakeShadows` instead of real-time shadow maps
   - Limit real-time lights; prefer an environment map
5. **Lighter assets**
   - Compress meshes and textures (see the asset-compression skill)
   - Resize textures to what is actually visible on screen
6. **Faster JavaScript**
   - No allocations or `setState` in `useFrame`
   - Use drei `Bvh` to speed up raycasting on complex meshes
   - Lazy-load heavy parts of the scene and UI with `React.lazy` and dynamic imports
7. **Free memory**
   - Dispose of manually created geometries, materials, textures and render targets
   - Check that `gl.info.memory` stays flat when navigating back and forth

## Report

Write `docs/performance.md`:

```markdown
# Performance report

## Test setup
Device, browser, build, viewport, throttling

## Results
| Metric | Target | Before | After | How measured | Label |
|---|---|---|---|---|---|

## Changes made
- <change>: <file>, <effect measured>, <owner informed>

## Not measured here
- <target>: <why>, <steps to measure it on a real device>

## Remaining issues
- <issue>, <suggested fix>, <owner>
```

## Common mistakes

| Mistake | Do this instead |
|---|---|
| Optimising before measuring | Measure, find the bottleneck, then pick the fix |
| Reporting headless frame rates | Label frame rate Not verified without a real GPU |
| Several changes at once | One change, one measurement, so you know what helped and what broke |
| Compressing assets without looking at them | Compare before and after under the final lighting |
| Lowering `dpr` below 1 or removing antialiasing silently | Record any visible quality trade-off as an open question |
| Leaving `r3f-perf` or `leva` in the production bundle | Load them only in development, and check the bundle |
| Optimising past the budget | Stop when the targets are met |
