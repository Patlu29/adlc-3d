---
name: debugging-3d
description: How to diagnose common faults in a React Three Fiber / WebGL application, covering a step-by-step method and a symptom-to-cause table for blank canvases, invisible or black models, wrong colours, dead clicks, scenes that do not update, console errors, production-only failures and memory growth. Use when the 3D scene looks wrong, does not respond, throws errors or behaves differently in production.
user-invocable: false
---

# Debugging a 3D web application

## Method

1. **Reproduce.** Find the exact steps, viewport and build (dev, test or production) that show the fault.
2. **Read the console and the network tab first.** Most 3D faults announce themselves: a failed request, a shader compile error or a three.js warning.
3. **Isolate.** Replace the suspect with the simplest thing that can work: a box with `MeshBasicMaterial`, a fixed camera, no post-processing. Add parts back one at a time until the fault returns.
4. **Prove the cause** with a measurement or a log before changing code: the model's bounding box, the camera position, `gl.info`, the computed style of the overlay.
5. **Fix the cause, then re-run the original steps** and the checks that cover the area.

## Symptoms and likely causes

Check the causes in the order listed; the first is the most common.

| Symptom | Likely causes | How to confirm |
|---|---|---|
| Blank or black canvas | The canvas parent has no height; an error was thrown inside `<Suspense>`; the camera is inside or facing away from the object; `near` and `far` exclude the object; no lights with a lit material | Inspect the canvas element size; read the console; swap in a box with `MeshBasicMaterial` at the origin |
| Model loads but is not visible | Wrong scale (centimetres exported as metres, or the reverse); origin far from the geometry; the model is behind the camera | Log `new Box3().setFromObject(model)` and compare its size and centre with the camera position; wrap the model in drei `Bounds` or `Center` to test |
| Model is black or very dark | No environment map or lights; `metalness` of 1 with nothing to reflect; normals missing or flipped | Add `<Environment>` temporarily; set `metalness` to 0; view with `MeshNormalMaterial` |
| Colours washed out, too dark or too saturated | A colour texture loaded by hand without `SRGBColorSpace`; a data texture marked as sRGB; tone mapping applied twice; a custom shader without the tone mapping and colour space includes | Check `texture.colorSpace`; compare with the same texture inside a glTF; see the shader-authoring skill |
| Texture upside down or mapped wrongly | `flipY` differs between glTF textures (false) and hand-loaded textures (true) | Set `texture.flipY = false` on textures applied to glTF meshes |
| Flickering surfaces (z-fighting) | `near` far too small or `far` far too large; two surfaces in the same plane | Raise `near`, lower `far`; offset one surface or use `polygonOffset` |
| Transparent objects draw in the wrong order | Transparency sorting; depth written by a transparent surface | Use `alphaTest` for cut-outs; set `depthWrite={false}` on true transparency; set `renderOrder` |
| Clicks or hover on objects do nothing | A DOM element covers the canvas; the wrong element has `pointer-events: auto`; the handler is on a group with no meshes; another object in front stops propagation | Use the browser inspector to see which element receives the click; log inside the handler |
| Clicks select several objects | Missing `event.stopPropagation()` | Log `event.intersections` |
| Scene does not update after a change | `frameloop="demand"` without `invalidate()`; a value mutated on a store object instead of set | Switch to `frameloop="always"` temporarily |
| Animation speed differs between devices | Motion not multiplied by `delta` | Throttle the CPU in DevTools and compare |
| Stutter or dropping frame rate | Allocation or `setState` in `useFrame`; too many draw calls; uncapped `dpr`; large shadow maps | See the webgl-performance skill; read `gl.info.render` |
| "Attempted to synchronously unmount a root while React was already rendering" | drei `Html` elements mounted or unmounted during a render, often on first selection | Keep `Html` labels mounted and toggle their visibility instead of mounting them conditionally |
| Effects run twice, or duplicate objects in development only | React StrictMode mounts twice in development | Add a cleanup function to the effect; never rely on an effect running once |
| Works in development, fails in production | Asset path is wrong for the deployed base path; file name case differs; wrong MIME type; the host rewrites a missing asset to `index.html` | Check the network tab for 404s or an HTML response; "Unexpected token <" from a loader means HTML was returned |
| Decoder or transcoder fails to load | Draco or Basis files fetched from a CDN blocked by the network or the content security policy | Check the request URL; self-host the decoder as described in the gltf-asset-pipeline skill |
| "WebGL context lost" or the canvas goes blank after a while | Too much GPU memory; too many contexts; the tab was in the background on a phone | Listen for `webglcontextlost`; check `gl.info.memory` |
| Memory grows as the user navigates | Geometries, materials, textures or render targets created by hand and never disposed | Watch `gl.info.memory` while repeating the action |
| Shader fails to compile | GLSL error; a uniform name mismatch; WebGL 1 syntax in a WebGL 2 shader | Read the full compile log in the console; it gives the line number |

## Warnings that are not your bug

Some warnings come from the library versions in use, not from application code, for example a deprecation notice logged by React Three Fiber itself. Confirm the source with the stack trace. If it is a library warning, record it once in your handoff note with the package and version so QA can allow-list it, and do not patch `node_modules`.

## Report

When you report a fault you diagnosed, give: the reproduction steps, the cause with the evidence that proves it, the fix, and the check you ran afterwards.
