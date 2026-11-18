# Contributing

This plugin is proprietary (see `LICENSE`). Contributions are accepted only from people the owner has authorised.

## Making a change

1. Branch from `main`. Use `release/x.y.z` for a release and `fix/<topic>` or `feat/<topic>` otherwise.
2. Make the change. Keep agents and skills consistent with each other: if you rename a skill, folder or document, search the whole repository for the old name.
3. Run the checks:

   ```bash
   node scripts/validate-plugin.mjs
   node scripts/test-hooks.mjs
   ```

4. Try the change in a real session before opening a pull request. Load the plugin from your working copy with `claude --plugin-dir .` and run `/adlc-3d:status` or a small `/adlc-3d:build` brief.
5. Open a pull request using the template. `main` is protected: the Validate check must pass and the code owner must approve.

## Versioning

The plugin follows semantic versioning:

| Change | Version |
|---|---|
| A fix or wording correction | Patch (3.2.1) |
| A new agent, skill, hook, check or behaviour | Minor (3.3.0) |
| A renamed or removed agent, skill or command, or a change that breaks existing projects | Major (4.0.0) |

Bump the version in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, and add an entry to `CHANGELOG.md`. The validator fails if the two versions differ.

## Releasing

1. Squash merge the release pull request.
2. Publish a GitHub release tagged `vX.Y.Z` with **What's changed**, **Upgrading** and **Full Changelog** sections, matching the `CHANGELOG.md` entry.
3. Update your install:

   ```bash
   claude plugin marketplace update prakash-plugins
   claude plugin update adlc-3d@prakash-plugins
   ```

## Writing style

- Australian English (colour, behaviour, optimise), except for code identifiers
- No em dashes
- Specific values over adjectives; tables and checklists over long paragraphs
- Every rule says what to do, not only what to avoid, and gives the reason when it is not obvious
- No personal data, client names or credentials anywhere in the repository

## Security

Report vulnerabilities as described in `SECURITY.md`, never in a public issue. The **Report a vulnerability** button appears only while private vulnerability reporting is switched on in the repository's security settings; keep it on.
