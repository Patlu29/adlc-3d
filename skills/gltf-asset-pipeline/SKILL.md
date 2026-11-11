---
name: gltf-asset-pipeline
description: How 3D assets flow from source files to optimised GLB files in this project, covering folders, the glTF Transform CLI, gltfjsx typed components, Draco/Meshopt and KTX2 loading, asset budgets and naming. Use when importing, converting, optimising or loading 3D models.
user-invocable: false
---

# glTF asset pipeline

## Flow

```text
assets/source/      (originals: .blend, .fbx, .obj, .glb, large textures)
      |  export / convert to glTF 2.0 binary (.glb)
      v
optimise with glTF Transform
      |
      v
public/models/      (optimised .glb served to the browser)
      |
      v
src/scene/objects/  (typed component, optional, via gltfjsx)
```

- Never edit or delete files in `assets/source/`
- Always ship `.glb` (binary glTF), not `.gltf` with separate files
- Export from Blender with Y-up, metres as units and the origin at the object's base

## Optimising with glTF Transform

Inspect a model first:

```bash
npx @gltf-transform/cli inspect assets/source/chair.glb
```

Optimise it with mesh compression and resized, compressed textures:

```bash
npx @gltf-transform/cli optimize assets/source/chair.glb public/models/chair.glb --compress draco --texture-compress webp --texture-size 2048
```

- `--compress meshopt` is an alternative to Draco; it decodes faster and also compresses animation
- For KTX2 textures, use the `etc1s` (colour maps) and `uastc` (normal maps) commands, which need KTX-Software installed
- CLI options change between versions, so check `npx @gltf-transform/cli optimize --help` before relying on a flag
- `npx` downloads the tool from the npm registry. If the download is blocked, report it; do not change npm configuration. If the architect has installed the CLI as a dev dependency, use that
- Always write to a new file in `public/models/`; never give the source path as the output

### Verify every output

Optimisation can silently drop animations, merge nodes the scene needs or blur textures.

1. Run `inspect` on the output and compare with the source: triangle count, materials, textures, animations and node names.
2. Confirm the node and material names in the asset manifest still exist. `optimize` may join or rename nodes; turn off the relevant step if the scene relies on them.
3. Check the file against the budgets below.
4. Load it in the app, or ask the scene developer to, and compare it with the original under the final lighting.

## Typed components with gltfjsx

```bash
npx gltfjsx public/models/chair.glb --types --root public --output src/scene/objects/Chair.tsx
```

- The scene developer runs this, because `src/scene/objects/` is theirs. The technical artist's part is to name nodes and materials clearly and list them in the asset manifest
- `--root public` makes the generated code load `/models/chair.glb`. Without it the URL is wrong and the model returns 404; open the generated file and check the path

The generated component exposes each node and material, so the scene developer can swap materials or hide parts. Re-run it whenever the model changes.

## Loading compressed models

- drei `useGLTF` decodes Draco and Meshopt by default
- The default Draco decoder loads from a third-party CDN. Self-host it by default: copy the decoder files from the installed `three` package (under `examples/jsm/libs/draco/`) into `public/draco/` and pass `"/draco/"` as the second argument to `useGLTF`. Meshopt needs no separate decoder download, which is one reason to prefer it
- KTX2 textures need a `KTX2Loader` with a transcoder path; pass it through `useGLTF`'s loader extension callback and call `detectSupport(gl)`

## Budgets per model

| Item | Desktop | Mobile |
|---|---|---|
| Triangles, hero model | 150,000 | 50,000 |
| Triangles, whole scene | 500,000 | 150,000 |
| Texture size | 2048 px | 1024 px |
| Materials per model | 5 or fewer | 3 or fewer |
| GLB file size, hero model | 5 MB | 2 MB |
| First-view download, all assets | 10 MB | 5 MB |

If a model is over budget, decimate it in Blender or with `npx @gltf-transform/cli simplify`, and check that it still looks right.

## Naming

- Files: kebab-case, such as `office-chair.glb`
- Nodes and materials inside the model: clear names such as `Seat`, `Legs`, `Fabric`, never `Cube.001`
- Textures: `<model>-<part>-<map>.<ext>`, such as `chair-fabric-normal.ktx2`

## Record every asset

In your handoff note, list each optimised asset with its source file, where the source came from and its licence, output file, file size, triangle count and texture sizes.

## When there is no source asset

Do not download models or textures from the internet on your own initiative; licences and quality are the user's decision. Either build the object from three.js geometry and procedural materials, when that suits the design, or record the missing asset as an open question with the specification the user should supply (format, scale, triangle budget, texture sizes).
