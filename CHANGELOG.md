# Changelog

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the plugin uses [semantic versioning](https://semver.org/). Release notes with upgrade steps are on the [releases page](https://github.com/Patlu29/adlc-3d/releases).

## [3.2.0] - 2026-11-18

### Added
- **Guardrail hooks, active in every ADLC project once you upgrade.** Inside a folder with `docs/project-status.md`, a PreToolUse hook blocks writes to `.env` files with values, generated output, `package-lock.json`, `assets/source/` and (for agents) the Tech Lead's lifecycle files, and blocks new content that looks like a credential. A PostToolUse hook warns on edits outside an agent's folders and lists code-rules hits. Both fail open, never approve anything, and can be switched off with `Hooks: off` in `docs/project-status.md` or `ADLC3D_HOOKS=off`
- OWASP Top 10 mapping in the `code-rules` skill
- Generated pipelines gain a security job (`npm audit` with expiring exceptions, licence allow-list, CycloneDX SBOM, gitleaks), Dependabot and CodeQL
- Baseline security headers in the `static-hosting` skill, with the content security policy starting in report-only mode
- WCAG 2.2 AA as the default accessibility standard, with the criteria 3D apps most often miss, and axe scans in the QA suite
- Release readiness reports accessibility and security results
- Plugin governance: `LICENSE` (proprietary), `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, a pull request template, Dependabot for the plugin's own workflow, and this changelog
- `scripts/test-hooks.mjs`, run in CI with the validator

### Changed
- The team-conventions ownership table names hosting files under `public/` and handoff notes, and says who owns unlisted paths
- The architect's release review checks the supply-chain controls, headers and OWASP rows
- New projects install `@axe-core/playwright` at scaffold time

## [3.1.1] - 2026-11-18

### Changed
- The ux-ui-designer preloads the `code-rules` skill and checks its CSS in `src/styles/` against the self-review checklist
- The checklist tells agents without a command line to run the same search with the Grep tool

## [3.1.0] - 2026-11-18

### Added
- `code-rules` skill, preloaded into every agent that writes code: precedence, TypeScript, structure and React, errors and async code, file rules, security, performance habits, tests and a self-review checklist

### Changed
- The architect enforces the rules through ESLint where a lint rule exists and checks them in the release review, rating security breaches critical

## [3.0.0] - 2026-11-11

### Changed
- **Breaking:** renamed the plugin from `application-builder` to `adlc-3d`, and the repository to `Patlu29/adlc-3d`
- The team runs as an Agentic Development Life Cycle with seven phases and three approval gates (scope, design, release)

### Added
- Iteration types: new application, feature, bug fix, performance and operations
- Commands `/adlc-3d:build`, `/adlc-3d:change` and `/adlc-3d:status`
- Project artefacts: backlog, release review, traceability matrix, release readiness report, retrospective and changelog
- Validator checks for the lifecycle and for retired names

## [2.1.0] - 2026-11-11

### Added
- `working-principles` skill preloaded into all ten agents, and evidence labels (Verified, Partly verified, Not verified)
- `debugging-3d` skill
- Plugin validator and a workflow that runs it on pushes and pull requests
- README with install, usage and maintenance notes

### Changed
- Stricter Tech Lead workflow with a preflight, checks after every delegation and a smoke test before performance and QA
- The architect defines the contracts between agents before the parallel build

### Fixed
- End-to-end tests run against a test-mode build; the scene is lazy-loaded; decoders and environment maps are self-hosted

## [2.0.0] - 2026-11-05

### Changed
- **Breaking:** renamed the plugin from `3d-web-application-builder` to `application-builder`

## [1.0.1] - 2026-10-27

- First published release

[3.2.0]: https://github.com/Patlu29/adlc-3d/compare/v3.1.1...v3.2.0
[3.1.1]: https://github.com/Patlu29/adlc-3d/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/Patlu29/adlc-3d/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/Patlu29/adlc-3d/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/Patlu29/adlc-3d/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Patlu29/adlc-3d/compare/v1.0.1...v2.0.0
