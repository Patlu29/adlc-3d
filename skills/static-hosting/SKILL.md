---
name: static-hosting
description: How to host the built 3D web application as static files, covering choosing a host, MIME types for 3D assets, caching and compression headers, single-page app fallback, CORS for asset CDNs, build-time environment variables and the deployment document. Use when configuring hosting or fixing assets that fail to load in production.
user-invocable: false
---

# Static hosting for 3D apps

A Vite build produces static files in `dist/`. Any static host works, as long as it serves 3D assets with the right headers.

## Choosing a host

Common options are Netlify, Vercel, Cloudflare Pages, GitHub Pages, and object storage behind a CDN (such as Amazon S3 with CloudFront). Choose based on:

- Whether the app has a backend, and where that runs
- Preview deployments for pull requests
- Control over response headers
- Where the organisation already hosts its services

Record the choice in an ADR. For pricing or contract questions about a hosting provider, refer the user to their sales team or the provider's sales team rather than quoting figures.

## MIME types

| Extension | Content-Type |
|---|---|
| `.glb` | `model/gltf-binary` |
| `.gltf` | `model/gltf+json` |
| `.bin` | `application/octet-stream` |
| `.ktx2` | `image/ktx2` |
| `.hdr` | `image/vnd.radiance` |
| `.wasm` | `application/wasm` |
| `.webp` | `image/webp` |

A wrong MIME type on `.wasm` breaks Draco and KTX2 decoders on some browsers.

## Caching

| Files | Cache-Control |
|---|---|
| Hashed build output in `dist/assets/` | `public, max-age=31536000, immutable` |
| Models and textures in `public/` (not hashed) | `public, max-age=86400`, or version the file names and make them immutable |
| `index.html` | `no-cache` |

## Compression

- Brotli or gzip for `.js`, `.css`, `.html`, `.json`, `.gltf`, `.glb` and `.bin`
- No extra compression for `.ktx2`, `.webp`, `.avif`, `.png` or `.jpg`

## Single-page app fallback

If the app uses client-side routing, rewrite unknown paths to `index.html`, but never rewrite missing asset paths, or a missing model returns HTML and fails with a confusing parse error.

## Example: Netlify `public/_headers`

```text
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/models/*.glb
  Content-Type: model/gltf-binary
  Cache-Control: public, max-age=86400

/textures/*.ktx2
  Content-Type: image/ktx2
  Cache-Control: public, max-age=86400
```

Other hosts have an equivalent, such as `headers` in `vercel.json` or response headers policies on a CDN.

## Assets on a separate CDN

If models load from another domain, that domain must send `Access-Control-Allow-Origin` for the app's origin, or the browser will block them.

## Content security policy

If the host sets a content security policy, 3D loaders need a few allowances or they fail without an obvious error:

- Draco and KTX2 decoders run WebAssembly in workers created from blob URLs, so the policy needs `worker-src 'self' blob:` and `script-src 'self' 'wasm-unsafe-eval'`
- Textures and models loaded through blob or data URLs need `img-src 'self' blob: data:` and `connect-src 'self'` plus any asset domain
- Test the deployed preview with the policy on, and look for policy violations in the console

## Sub-path deployments

If the app is served from a sub-path, such as GitHub Pages project sites, set Vite's `base` option and make sure asset URLs in code are built from `import.meta.env.BASE_URL`. Absolute paths such as `/models/chair.glb` return 404 under a sub-path.

## Check before handoff

- [ ] Every file type in `dist/` and `public/` has a correct MIME type and cache rule in the hosting config
- [ ] A request for a missing model returns 404, not `index.html`
- [ ] `npm run preview` serves the build with no failed requests
- [ ] The search `grep -r "__APP_TEST__" dist` finds nothing, so the test hook is not deployed

## Environment variables

- Vite inlines `VITE_` variables at build time, so they are public; never put secrets in them
- Set them in the host's build settings and list them in `docs/deployment.md`

## Deployment document

Write `docs/deployment.md` with: the host, how deployments are triggered, environment variables and secrets (names only), manual setup steps for the user, and how to roll back.
