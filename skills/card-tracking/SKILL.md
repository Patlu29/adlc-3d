---
name: card-tracking
description: How the Tech Lead keeps every story, backlog item, bug and agent task as a card in ClickUp or a local board, covering setup and the user's consent, the card model, card states for each lifecycle phase, the tracker command, content modes, failures and drift. Use when setting up a tracker, moving cards at a phase change, or reporting the board.
user-invocable: false
---

# Card tracking

Every piece of work in the lifecycle is a card, so the people around the project can see it in the tool they already use. The documents in `docs/` stay the source of truth for what a card says; the tracker is where people see where it stands.

The tracker command does all the work with the tracker. Run it from the project root:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tracker/cli.mjs" <command> [options]
```

Only the Tech Lead runs it, and only the command writes `docs/tracker/`. Never edit those files by hand, and never ask an agent to.

## Providers

| Provider | Cards live in | Needs |
|---|---|---|
| `clickup` | A ClickUp List chosen by the user | The List ID, and `CLICKUP_API_TOKEN` set in the user's own shell |
| `local` | `docs/tracker/board.md` in the repository | Nothing |
| none | Not tracked; the lifecycle works as before | Nothing |

A state file with no `Tracker:` line means none. Projects started before cards existed keep working unchanged.

## Setup and consent

Sending project content to ClickUp publishes it to everyone who can see that List, so the user decides it, once, at preflight:

1. Ask which tracker to use: ClickUp, a local board in the repository, or none.
2. For ClickUp, ask for the List ID (the number in the List's URL) and which content mode to use:
   - `full`: titles, story text, acceptance criteria, bug details and evidence notes
   - `minimal`: titles and IDs, the stories a bug breaks, and short notes. Story text, criteria wording and files stay in the repository
3. Ask the user to set the token in their own shell: `export CLICKUP_API_TOKEN=...`, created under ClickUp **Settings > Apps**. Never ask for the token in chat, never write it to a file, and never pass it as a command argument. Recommend a dedicated ClickUp user with access to this one List, because a personal token acts with all of that person's rights. For licence or plan questions about ClickUp, refer the user to the Sales team.
4. Run `init --provider clickup --list <id> --content <mode>`. It saves `docs/tracker/config.json` and checks the List.
5. Read the status mapping that `check` prints. Several card states may share one ClickUp status. Backlog and done must map to a status on the List; if either does not, ask the user to add a status in ClickUp, then run `check --write`.
6. Once stories exist, run `push --dry-run` and show the user a short sample of what will be sent. Only after they agree, run the first `push`.
7. Record the choice in the state file: `Tracker: clickup (List <id>, content <mode>), approved by the user on <date>`.

The user can change the mode or stop tracking at any time; record it under **Decisions**.

## Card model

| Card | ID | Made from | Notes |
|---|---|---|---|
| Story | `US-3` | `docs/requirements/user-stories.md` | Tagged `adlc-story` and `epic-e1`; acceptance criteria are a checklist in the description |
| Backlog item | `CR-4` | `docs/requirements/backlog.md` | Tagged `adlc-change`, or `adlc-bug` for bug rows |
| Bug | `BUG-2` | `docs/qa-report.md` | Priority from severity: critical urgent, major high, minor normal |
| Agent task | `US-3/scene-developer` | Created by `task` | A sub-task of its story, one per agent working on it |

Card names start with the ID in brackets, `[US-3] Rotate the model`. That is how the command finds a card it created, so never rename a card without its ID. The card key (`CU-86abc12`, or the workspace's custom ID) is what goes into branch names and commits; it is in `docs/tracker/remote.json` and on the board.

## States and phases

| State | When | Command |
|---|---|---|
| backlog | A card is first created | `push` |
| ready | Approval A1 gives the iteration's scope | `move <stories and items> --state ready` |
| in_progress | Design starts, or Build starts when Design is skipped | `move ... --state in_progress` |
| in_review | Code review starts | `move ... --state in_review` |
| in_test | Verify starts | `move ... --state in_test` |
| ready_for_release | Approval A3 | `move ... --state ready_for_release` |
| done | The user has merged the change. If the iteration closes without a merge, the cards stay in ready_for_release | `move ... --state done` |
| blocked | A card waits on the user or an outside dependency | `move ... --state blocked --note "<why>"` |

`push` never changes the status of an existing card; only `move` does.

## Commands at each point in the lifecycle

| Point | Commands |
|---|---|
| After A1 | `push`, then `move <in-scope IDs> --state ready --note "Iteration <n>: scope approved by the user on <date>"` |
| After A3 | `move <in-scope IDs> --state ready_for_release --note "Iteration <n>: release approved by the user on <date>"` |
| Phase entry | `move <in-scope IDs> --state <state> --note "Iteration <n>, phase <name>"` |
| Delegating build work | `task --stories <IDs the agent works on> --agent <agent>` |
| Agent's work accepted | `move <story>/<agent> --state done` |
| QA report written | `push` (creates bug cards), then `criteria <story> --pass ... --fail ... --untested ...` for each story in scope |
| Bug fixed and re-tested | `move BUG-<n> --state in_test --note "Fixed and re-tested: <result>"`; it moves on with the iteration's cards and reaches done when the change is merged |
| Iteration closed | `push`, then `board` |

Use the IDs from the iteration's scope in the state file, plus the bug cards fixed during the iteration. The board in `docs/tracker/board.md` is regenerated by every command.

## Evidence on cards

- A note says what happened and where the evidence is: "Phase 4 Verify: 18 of 19 criteria pass, BUG-2 open (major), see docs/qa-report.md"
- In `minimal` mode keep notes to 280 characters with no story text, and do not use `comment --file`
- Never put credentials, personal data, private URLs or log output in a note. The command refuses text that looks like a credential, but it cannot judge the rest

## When the tracker fails

The tracker never blocks a gate. A gate passes or fails on the evidence in the repository.

| Exit code | Meaning | What to do |
|---|---|---|
| 0 | Done | Continue |
| 1 | Wrong usage or input | Fix the command |
| 2 | Needs the user: token missing or refused, List not found, a required status missing, a card edited in ClickUp, or content refused | Tell the user what the output says; continue the lifecycle meanwhile |
| 3 | ClickUp unavailable; the operation is queued | Note it under **Environment notes**; the next command retries it |
| 4 | Another tracker command is running | Wait for it, then run again |

`push` reports a card ClickUp rejects, or one deleted there, and carries on with the rest; a deleted card is created again on the next push. A comment whose response was lost on the network may, rarely, appear twice.

When `push` reports that someone edited a card in ClickUp, show the user the card and the document side by side. The document wins, but only the user decides to overwrite with `push --force`; if the person's change was right, the owner of the document updates it instead.

## Drift

`board --remote` compares ClickUp with the lifecycle record, read only. Run it in `/adlc-3d:status` and in the Review phase before approval A3. A card a person moved, deleted or created by hand is a question for the user, not something to undo silently.
