---
name: git-flow
description: How the Tech Lead manages source control for an ADLC iteration, covering the user's consent to commit, one branch per iteration named after its main card, staging only named paths, the secret scan before each commit, commit messages that reference card keys, and the push, pull request and merge steps that need the user. Use when opening an iteration, closing a phase, or preparing a pull request.
user-invocable: false
---

# Git flow

Each iteration lives on its own branch and becomes one pull request, so a reviewer sees one change with its cards, and the tracker links the commits to the cards. Agents never run git commands that change the repository; the Tech Lead does, under the rules here.

## Consent

Committing changes the user's repository, so ask once, at preflight, and record the answer in the state file:

```text
Git: commit at phase exits on the iteration branch, approved by the user on 2026-11-25
```

| Answer | What happens |
|---|---|
| Commit at phase exits | The rules below apply |
| No commits | Leave every change uncommitted and tell the user at the end which files changed. Skip the rest of this skill |
| Not a git repository | Ask whether to run `git init`. If not, record `Git: none` and skip this skill |

Pushing, opening a pull request and merging are never covered by this consent. Each needs its own approval, as below.

## Opening the iteration

1. Run `git status --porcelain`. If the tree has changes that are not this project's work, stop and ask the user to commit or stash them; never commit someone else's work into an iteration. Files the Tech Lead has just written to open the iteration, such as `docs/project-status.md`, are this project's work.
2. Note the base: `git rev-parse --abbrev-ref HEAD` and `git rev-parse HEAD`. Record both in the state file as `Base: <branch> at <short sha>`.
3. Create the branch from the base, named after the iteration's main card:

| Iteration type | Branch |
|---|---|
| New application, Feature | `feat/<KEY>-<slug>` |
| Bug fix | `fix/<KEY>-<slug>` |
| Performance | `perf/<KEY>-<slug>` |
| Operations | `ops/<KEY>-<slug>` |

`<KEY>` is the card key from the board (`CU-86abc12`, or the custom ID); with a local board or no tracker, use the story or backlog ID (`US-3`, `CR-4`). A new application has no cards when its branch is created, so use `iteration-<n>` (`feat/iteration-1-desk-lamp-viewer`); the branch keeps that name, and the commits carry the card keys once they exist. The slug is three to five lowercase words joined by hyphens. Example: `feat/CU-86abc12-share-view-link`. The ClickUp GitHub integration links a branch, commit or pull request to a card when its key appears in the name or message.

4. Record `Branch: <name>` in the state file.

## Committing at a phase exit

After the exit check of each phase passes:

1. List what changed: `git status --porcelain`.
2. Stage only the paths this phase produced, by name: the documents, the source folders of the agents who ran, the handoff notes, and `docs/tracker/` except `docs/tracker/.lock`. Never use `git add -A` or `git add .`.
3. Scan what is staged:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tracker/cli.mjs" secrets --staged
```

If it reports anything, unstage that file (`git restore --staged <file>`), tell the user, and do not commit it. The scan catches common credential formats only; it does not make a file safe to publish.

4. Commit with a Conventional Commit message that names the phase and lists every card key in scope:

```text
feat(US-3): phase 3 Build, scene and panel for the share link

Iteration 2 (Feature: CR-4). Checks: lint, typecheck, test, build pass.
Refs: CU-86abc12, CU-86abc13
```

The type matches the branch prefix; use `docs` for a phase that changed only documents. Never amend or rewrite a commit that is already on the branch, and never use `--no-verify`.

## Pull request

At approval A3, ask the user two separate questions: whether to release, and whether to push the branch and open a pull request. Only on an explicit yes to the second:

```bash
git push -u origin <branch>
```

```bash
gh pr create --base <base branch> --head <branch> --title "<type>(<KEY>): <iteration scope>" --body-file <file>
```

Write the body to a temporary file first, from the release readiness report: the scope, the cards with their keys, what was verified and what was not, open known issues, and the code review summary. If the repository has `.github/pull_request_template.md`, follow its headings. If `gh` is not installed or not signed in, give the user the two commands and the body instead of working around it.

## Merging and closing cards

Agents never merge, and the Tech Lead never merges on its own. The user, or the team's review process, merges the pull request.

Check whether it was merged, read only, in `/adlc-3d:status`, at the start of `/adlc-3d:change`, and when closing the iteration:

```bash
gh pr view <branch> --json state,mergedAt
```

Without `gh`, use `git fetch` and then `git branch -r --merged origin/<base branch>`. Once the change is merged, move the iteration's cards to done with the tracker, and record the merge in the state file. If the iteration closes without a merge, say so in the retrospective and leave the cards in ready_for_release.

## Rules

- Never push, force-push, delete a remote branch, change git configuration or rewrite history without the user's explicit approval for that action
- Never commit `.env` files with values, build output, test reports or `node_modules/`
- One iteration, one branch. If an iteration must be abandoned, leave the branch and ask the user what to do with it
