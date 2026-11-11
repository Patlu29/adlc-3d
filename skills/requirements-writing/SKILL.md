---
name: requirements-writing
description: How to write the requirements document for a 3D web application, covering structure, numbered testable requirements, MoSCoW priorities and 3D-specific non-functional targets such as frame rate, load time and device support. Use when creating or updating docs/requirements/requirements.md.
user-invocable: false
---

# Writing requirements

## Document structure

Write `docs/requirements/requirements.md` with these sections, in this order:

1. **Overview**: one paragraph on what the app is and who it is for
2. **Goals**: three to five measurable outcomes
3. **Target users**: who they are, their devices and their context of use
4. **Core 3D experience**: what the user sees and does in the scene, in plain language
5. **Functional requirements**: numbered `FR-1`, `FR-2` and so on
6. **Non-functional requirements**: numbered `NFR-1`, `NFR-2` and so on
7. **Out of scope**: what this release will not do
8. **Assumptions**
9. **Open questions**

## Rules for each requirement

- One behaviour per requirement
- Testable: a tester can tell whether it passes
- Priority using MoSCoW: **Must**, **Should**, **Could**, **Won't (this release)**
- Describe the behaviour, not the implementation
- Give numbers with units wherever behaviour can be measured: durations, sizes, counts, limits
- Avoid words a tester cannot check: fast, smooth, intuitive, nice, responsive, modern, easy. Replace each with the observable behaviour
- IDs are permanent. When a requirement changes, edit it and note the change; when it is removed, mark it removed. Never renumber, because stories, tests and bug reports refer to the IDs
- Mark where each requirement came from: the user's words, or your assumption

| Weak | Strong |
|---|---|
| The model should look good | FR-4 (Must): The product model renders with PBR materials and soft shadows under studio lighting |
| The app should be fast | NFR-1 (Must): The scene holds 60 FPS on a 2022 mid-range laptop and 30 FPS on a 2022 mid-range phone |
| Users can interact with the model | FR-5 (Must): Users can rotate the model by dragging and zoom with the scroll wheel or a pinch |

## Non-functional requirements every 3D app needs

Always include a target for each of these, even if it is an assumption:

| Area | Default target if the user gives none |
|---|---|
| Frame rate | 60 FPS desktop, 30 FPS mobile |
| Initial load | Interactive within 5 seconds on a 4G connection |
| Total download | Under 10 MB for the first view |
| Browsers | Latest two versions of Chrome, Edge, Safari and Firefox |
| Devices | Desktop and mobile, portrait and landscape |
| WebGL fallback | A clear message, or a static image, when WebGL is unavailable |
| Accessibility | WCAG 2.2 AA for the 2D UI; keyboard alternatives for core 3D actions; respects reduced motion |
| Privacy and security | No personal data collected unless a requirement needs it; no requests to third-party domains at runtime unless a requirement needs them |
| Content accuracy | Every fact the app shows comes from a named source, recorded with the date it was checked |

For each non-functional requirement, state how it will be verified: an automated test, a measurement on a named class of device, or a manual check. A target nobody can verify in this project's environment, such as frame rate on a real phone, must say who verifies it and when.

## Factual content

If the app shows facts (figures, names, dates, descriptions), add a requirement naming the source of truth, and list the content or where it will come from. Do not write the facts from memory, and do not leave developers to supply them.

## MVP scoping

- Every **Must** requirement together forms the MVP
- If there are more than about 10 Must requirements, challenge each one and move some to Should
- Put anything needing a backend (accounts, saving, uploads) in its own epic so the architect can decide whether a backend is needed

## Open questions

Write each open question so the user can answer in one line:

```markdown
- Q3: Should the time controls include reverse? Options: (a) forward only, (b) forward and reverse. Recommendation: (a), because it halves the control bar on phones. Default if unanswered: (a).
```

## Check before handoff

- [ ] Every requirement has an ID, a priority and a way to test it
- [ ] No two requirements contradict each other; read the Must list top to bottom as one description of the app
- [ ] Every non-functional area in the table above has a target and a verification method
- [ ] Assumptions are listed separately and none is presented as the user's decision
- [ ] Out of scope names the things a reader might otherwise expect
