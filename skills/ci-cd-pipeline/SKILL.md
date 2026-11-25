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
| Security | `npm audit`, SBOM, licence check | Every pull request and `main` |
| Code scanning | CodeQL | Pull requests, `main` and weekly |
| Preview deploy | Host-specific | Pull requests |
| Staging deploy | Host-specific | A manual run with the commit SHA as input, for a commit on `main` or a `fix/INC-*` hotfix branch whose checks passed, through the `staging` environment |
| Production deploy | Host-specific | A manual run on a commit already on staging, through the `production` environment with required reviewers |

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

## Security and supply chain

Add a `security` job to `ci.yml`, alongside `checks`:

```yaml
  security:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: node .github/scripts/check-audit.mjs
      - run: npm sbom --sbom-format cyclonedx --omit dev > sbom.cdx.json
      - run: node .github/scripts/check-licences.mjs sbom.cdx.json
      - run: docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:vX.Y.Z detect --source /repo --redact
      - uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: sbom.cdx.json
```

Run the same job on a weekly `schedule` as well, so a new advisory in an unchanged project is still found.

- `.github/scripts/check-audit.mjs` runs `npm audit --omit=dev --json` and fails on any high or critical advisory that is not in `.github/audit-exceptions.json`. Each exception names the advisory, the reason it does not affect the app, who accepted it and an expiry date no more than 90 days away; an expired exception fails the job. Do not run `npm audit fix`; report advisories to the architect, who owns dependencies
- `npm sbom` needs npm 9.5 or later; check with `npm -v`. The SBOM is a release artefact the user can hand to a client or auditor
- gitleaks scans the whole history for committed secrets. Use its Docker image rather than its GitHub Action, which needs a licence key (free, but registered) for organisation accounts. Look up the current image version and replace `vX.Y.Z` with it
- Write both scripts with Node built-ins only, so they add no dependency
- `.github/scripts/check-licences.mjs` reads the SBOM and fails on any runtime dependency whose licence is not in `.github/licence-allowlist.json`. Start the list with `MIT`, `ISC`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0`, `0BSD` and `CC0-1.0`. A dependency with no licence, or a copyleft licence such as GPL or AGPL, needs the user's decision recorded in `docs/project-status.md` before it is allowed

Add `.github/dependabot.yml` with weekly updates for `npm` and `github-actions`, grouping minor and patch updates into one pull request per ecosystem. Dependabot pull requests go through the same checks as any other change; the architect decides on major upgrades.

Add `.github/workflows/codeql.yml` from GitHub's CodeQL template with `languages: javascript-typescript`, triggered on pull requests, `main` and a weekly schedule, with `security-events: write` on that job only. Code scanning is free on public repositories; a private repository needs GitHub Advanced Security. If the repository is private, record CodeQL as a manual decision for the user, and refer any pricing question to GitHub's sales team.

Secret scanning and push protection are repository settings, not files, and on private repositories they also need GitHub Advanced Security. Branch protection on a private repository needs a paid GitHub plan. List these in `docs/deployment.md` as manual steps for the user: branch protection on `main` that requires the CI checks, plus one approving review when more than one person maintains the project.

## Before handoff

You usually cannot run the workflow, so check what you can:

- [ ] The YAML parses, and every `run` command works locally
- [ ] Action versions and the Playwright image tag were looked up, and the tag matches `@playwright/test` in `package-lock.json`
- [ ] Screenshot baselines exist for the pipeline image, or `docs/deployment.md` tells the user how to generate them on the first run
- [ ] No secret value is in any file
- [ ] The audit check, `npm sbom` and the licence check run locally, and their results are in the handoff note
- [ ] `dependabot.yml` and `codeql.yml` parse, and the manual repository settings are listed in `docs/deployment.md`
- [ ] The handoff note labels the pipeline Not verified until it has run, and says what to look at on the first run

## Deployment

- Preview deployments on pull requests, so reviewers can try the 3D scene on their own devices
- Three environments, written up in `docs/deployment.md` with their addresses: preview, staging (for user acceptance) and production
- Staging deploys only from a manual run (`workflow_dispatch` with the full commit SHA as input) through a GitHub environment named `staging`, for a commit on `main` or on a `fix/INC-*` hotfix branch whose checks have passed. Merging never deploys by itself. Production deploys only a commit that is already on staging, from a manual run (`workflow_dispatch` with the commit SHA as input) through an environment named `production` with required reviewers, so UAT always signs off the exact build that goes live
- Each deploy job prints the full commit SHA it deployed, so the staging check and UAT can name the build
- A hotfix is deployed from its own branch by SHA, so unreleased work on `main` does not ship with it. Once it is in production, it is merged back into `main`
- `docs/deployment.md` has a **Rollback** section: how to put the last good release back on each environment (the host's rollback, or a manual run of the production job with the previous tag's SHA, the one exception to "already on staging", because that build was accepted when it shipped), who can do it, and how to check it worked
- Environments and their reviewers are repository settings, not files; list them as manual steps for the user
- Never deploy to production, push to a remote or create cloud resources unless the task prompt says the user approved it

## Secrets

- Store tokens in GitHub Actions secrets or environment secrets, never in the workflow file
- List every secret the pipeline needs in `docs/deployment.md`, with where to get it and no value
- Give deploy tokens the narrowest scope the host allows

## Keep it fast

- Cache npm through `setup-node`
- Cancel superseded runs with `concurrency`
- Run end-to-end projects in parallel with shards if the suite takes more than about 10 minutes
