---
name: user-stories
description: How to write user stories and Given/When/Then acceptance criteria for a 3D web application, grouped into epics and linked to requirement IDs. Use when creating or updating docs/requirements/user-stories.md.
user-invocable: false
---

# Writing user stories

## Format

```markdown
## Epic E1: Explore the product in 3D

### US-1: Rotate the model (FR-5, Must, 3 pts)
As a shopper, I want to rotate the product by dragging, so that I can see it from every side.

**Acceptance criteria**
- Given the scene has loaded, when I drag horizontally on the canvas, then the model rotates around its vertical axis
- Given I am on a touch device, when I drag with one finger, then the model rotates the same way
- Given I release the drag, when the model is still moving, then it eases to a stop within one second
- Given I use only the keyboard, when the canvas has focus and I press the arrow keys, then the model rotates
```

A story that needs another one first names it on its own line under the narrative: `Depends on: US-2`. The tracker reads the heading and this line, so keep both in this form.

## Rules

- Every story links to at least one requirement ID and carries its MoSCoW priority
- Every story has two to six acceptance criteria
- Each criterion is a single Given/When/Then statement a tester can check
- Include at least one criterion for touch, keyboard or reduced motion when the story involves interaction
- Include the loading and error states: what the user sees while assets load, and when they fail
- Follow INVEST: independent, negotiable, valuable, estimable, small and testable
- Number the criteria in order (AC-1, AC-2) so tests and bug reports can refer to `US-1 AC-2`. Keep story and criterion IDs stable; never renumber
- Put a number in any criterion about time, size, distance or count, with a tolerance a test can use: "within 1 to 2 seconds", "at least 44 px"
- Words such as "exactly", "always" and "never" become literal test assertions. Use them only when you mean them, and give a tolerance otherwise
- Each criterion describes one observable outcome. If it needs "and", split it
- Criteria must not contradict each other or another story. Check stories that touch the same control or the same camera behaviour together

| Weak criterion | Strong criterion |
|---|---|
| Then the camera moves smoothly to the planet | Then the camera reaches the planet in 1 to 2 seconds, and with reduced motion it arrives within 200 ms without animating |
| Then the model is easy to tap | Then the tap target is at least 44 by 44 px at every zoom level |
| Then the view resets | Then the camera returns to the first view, within 2 px of the original framing |

## Estimates

Size every story in story points, relative to the others: 1, 2, 3, 5 or 8. A point is not a time unit; it compares effort, complexity and uncertainty across the team's stories.

| Points | Typical 3D story |
|---|---|
| 1 | A copy or token change, a new keyboard shortcut for an existing action |
| 2 | A new panel field bound to an existing store value |
| 3 | A new camera preset with its transition and reduced-motion variant |
| 5 | Selecting a part with hover, highlight, details panel and keyboard alternative |
| 8 | A new loaded model with materials, compression and a loading state |

- More than 8 means the story is too big: split it by user outcome, not by layer
- Write the estimate in the heading, as above. The architect reviews the estimates in the Design phase and asks for changes through its handoff note; you own the file and make them
- Record a re-estimate by changing the heading. The tracker reports re-estimates made during a sprint

## Definition of Ready

A story can go into a sprint only when all of these are true. `node "${CLAUDE_PLUGIN_ROOT}/tracker/cli.mjs" ready --stories <IDs>` checks the first four, and the fifth as far as it can: it fails a dependency that does not exist and warns about one outside the sprint, which you confirm is already done:

- It links to at least one requirement ID
- It has a MoSCoW priority of Must, Should or Could
- It has at least two numbered, testable acceptance criteria (more than six is a warning to split it)
- It has an estimate of 1, 2, 3, 5 or 8 points
- Every story it depends on exists, and is in the same sprint or already done
- No open question would change what is built

## Epics for a typical 3D web app

Use these as a starting checklist and drop the ones that do not apply:

| Epic | Typical stories |
|---|---|
| Loading and first view | Loading screen with progress, first camera position, WebGL fallback |
| Navigating the scene | Orbit, zoom, pan, reset view, preset camera views |
| Interacting with objects | Hover highlight, select, show details, annotations |
| Configuring | Change colour, material or variant; toggle parts |
| UI overlay | Menus, panels, help, settings |
| Accessibility | Keyboard controls, reduced motion, screen reader text |
| Persistence | Save, share link, load a saved state (needs backend or URL state) |
| Accounts | Sign up, sign in, profile (needs backend) |

## Story map

End the document with a table that orders the stories into releases:

| Release | Stories |
|---|---|
| MVP | US-1, US-2, US-4 |
| Release 2 | US-3, US-6 |
