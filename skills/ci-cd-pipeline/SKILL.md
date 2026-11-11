---
name: ci-cd-pipeline
description: How to set up the GitHub Actions CI/CD pipeline for a 3D web application built with this plugin, covering job stages, caching, Playwright in CI, artefacts, preview deployments and safe production deployment. Use when creating or fixing the build, test and deploy pipeline.
user-invocable: false
---

# CI/CD pipeline

## Stages

| Stage | Command | Runs on |
|---|---|---|
| Install | `npm ci` | Every push and pull request |
| Lint | `npm run lint` | Every push and pull request |
| Format check | `npm run format:check` | Every push and pull request |
| Type check | `npm run typecheck` | Every push and pull request |
| Unit tests | `npm run test` | Every push and pull request |
| Build | `npm run build` | Every push and pull request |
| End-to-end tests | `npm run test:e2e` | Every pull request and `main` |
| Preview deploy | Host-specific | Pull requests |
| Production deploy | Host-specific | `main`, after every check passes, with approval |

## Workflow

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist

  e2e:
    needs: checks
    runs-on: ubuntu-latest
    timeout-minutes: 30
    container:
      image: mcr.microsoft.com/playwright:<version matching @playwright/test>
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run test:e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report
```

- Check the current major versions of each action before using them, and pin them
- Pin the Playwright Docker image to the same version as `@playwright/test` in `package.json`; visual baselines depend on it
- Keep the Node version in `.nvmrc` so local and CI builds match
- Use only scripts that exist in `package.json`, and run each one locally before putting it in the workflow. `test:e2e` builds and serves the test-mode build itself through the Playwright config
- Give the workflow the least permissions it needs; add write permissions only to the job that deploys
- If the project installs from a private registry, the pipeline needs the same registry and a token from secrets. Record that as a manual step; do not copy credentials from the user's machine

## Before handoff

You usually cannot run the workflow, so check what you can:

- [ ] The YAML parses, and every `run` command works locally
- [ ] Action versions and the Playwright image tag were looked up, and the tag matches `@playwright/test` in `package-lock.json`
- [ ] Screenshot baselines exist for the pipeline image, or `docs/deployment.md` tells the user how to generate them on the first run
- [ ] No secret value is in any file
- [ ] The handoff note labels the pipeline Not verified until it has run, and says what to look at on the first run

## Deployment

- Preview deployments on pull requests, so reviewers can try the 3D scene on their own devices
- Production deployment only from `main`, only after every check passes, and behind a GitHub environment with required reviewers
- Never deploy to production, push to a remote or create cloud resources unless the task prompt says the user approved it

## Secrets

- Store tokens in GitHub Actions secrets or environment secrets, never in the workflow file
- List every secret the pipeline needs in `docs/deployment.md`, with where to get it and no value
- Give deploy tokens the narrowest scope the host allows

## Keep it fast

- Cache npm through `setup-node`
- Cancel superseded runs with `concurrency`
- Run end-to-end projects in parallel with shards if the suite takes more than about 10 minutes
