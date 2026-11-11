---
name: playwright-testing
description: How to write Playwright end-to-end tests for a WebGL / React Three Fiber application, covering setup, mapping acceptance criteria to tests, testing canvas state through test hooks, console error checks, WebGL in headless browsers, mobile viewports and the QA report format. Use when writing or running end-to-end tests or reporting bugs.
user-invocable: false
---

# Playwright testing for 3D apps

## Setup

```bash
npm ls @playwright/test
npx playwright install chromium firefox webkit
```

The architect installs `@playwright/test` at scaffold time. If `npm ls` shows it is missing, request it from the architect; do not add dependencies yourself.

`playwright.config.ts` essentials:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:4173", trace: "on-first-retry" },
  webServer: {
    command: "npm run build:test && npm run preview:test",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
});
```

- Test the test-mode production build (`build:test`), not the dev server and not the real production build. The real production build has no test hook, so tests against it cannot see scene state
- Check the device names against the installed Playwright version; the list changes between releases
- If a browser was already installed, do not download it again. If a download is blocked, report it as an environment problem
- Write and run one spec first. Once it passes, add the rest; a broken setup is cheaper to find with one test than with a hundred

## One test per acceptance criterion

Name each test after its story and criterion, so the QA report can map results back:

```ts
test("US-1 AC-2: dragging rotates the model", async ({ page }) => {
  // ...
});
```

## Testing what is inside the canvas

The DOM cannot see 3D objects, so do not try to find them with selectors. Use these instead:

1. **Test hook state.** The app exposes `window.__APP_TEST__` in development and test builds, with the shape `{ ready, stores, scene }` defined in the state-management skill and the project's contracts:

```ts
await page.waitForFunction(() => (window as any).__APP_TEST__?.ready === true);
const selected = await page.evaluate(() =>
  (window as any).__APP_TEST__.stores.useSceneStore.getState().selectedPartId
);
expect(selected).toBe("seat");
```

Read the exact store and query names from the **Contracts** section of `docs/architecture.md` and the developers' handoff notes; do not guess them.

2. **Pointer actions on the canvas** using coordinates relative to the canvas box:

```ts
const canvas = page.locator("canvas");
const box = await canvas.boundingBox();
await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
await page.mouse.down();
await page.mouse.move(box!.x + box!.width / 2 + 200, box!.y + box!.height / 2, { steps: 10 });
await page.mouse.up();
```

3. **UI side effects**, such as the details panel opening after a selection
4. **Screenshots** for appearance (see the visual-regression skill)

If a test needs a hook that does not exist, request it in your handoff note (stores from the frontend developer, scene queries from the scene developer) and mark the criterion **Partly verified** or **Not verified** until it exists. Do not replace it with a weaker assertion and call the criterion passed.

## Writing tests that can be trusted

- Wait for a condition, never for a fixed time. Use the `ready` flag, `expect(...).toBeVisible()` or `expect.poll`; `waitForTimeout` makes tests slow and flaky
- Assert the outcome the criterion describes, with its numbers. "Eases to a stop within one second" needs a timing check, not just "the model moved"
- A test must be able to fail. After writing one, break the behaviour or the expected value once and confirm the test goes red
- Use role and label selectors for the UI (`getByRole`, `getByLabel`); they also check the accessible name
- Timing checks on software-rendered WebGL are slow and noisy. Allow for it in the assertion and say so in the report, or mark the criterion Partly verified

## Always check

- Wait for loading to finish before interacting (the `ready` flag in the test hook)
- No console errors, page errors or WebGL warnings, in a shared fixture so every test checks it:

```ts
const problems: string[] = [];
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") problems.push(msg.text());
});
page.on("pageerror", (err) => problems.push(String(err)));
page.on("requestfailed", (req) => problems.push(`request failed: ${req.url()}`));
// ... at the end of the test
expect(problems.filter((p) => !KNOWN_NOISE.some((re) => re.test(p)))).toEqual([]);
```

- `KNOWN_NOISE` is a short allow-list of patterns you have traced to a library or the test machine's graphics driver, not to app code. List each entry and its reason in the QA report. Never add an app error to it
- No failed network requests, and no requests to third-party domains unless the architecture allows them
- The WebGL-unavailable fallback appears when WebGL is disabled
- The production build (`dist/`) does not contain `__APP_TEST__`

## WebGL in headless browsers

Headless browsers usually render WebGL in software, which is slow but works. If the WebGL context fails to start in headless Chromium, add software rendering flags to the project's `launchOptions.args`; `--use-angle=swiftshader` is the usual one, and newer Chromium versions may also need `--enable-unsafe-swiftshader`. Check which the installed version accepts. Never use frame rate results from headless runs as performance measurements.

## When a test fails

Decide which of these it is before writing anything in the report:

| Cause | Signs | Action |
|---|---|---|
| App defect | Fails the same way on every run; the behaviour contradicts a criterion or the design spec | Report a bug with the owner named |
| Test defect | The app behaves correctly when you follow the steps by hand or inspect the trace | Fix the test |
| Flaky test | Passes on some runs | Find the race, usually a missing wait. Do not add retries to hide it |
| Environment problem | A browser will not launch, a download is blocked, the machine has no GPU | Report as untested coverage, separately from bugs. Do not count it as an app failure, and do not bypass system restrictions |
| Unclear specification | Two documents disagree about the expected result | Record it as an open question for the document's owner; do not pick one and report the other as a bug |

Run a failing test at least twice before reporting it, and say whether the failure is deterministic.

## QA report

Write `docs/qa-report.md`:

```markdown
# QA report

## Summary
Passed X of Y tests. Failed: A app failures (B bugs), C environment failures. Skipped: D.
Build tested: <commit or date>, test-mode production build.

## Coverage and limits
| Project | Engine and version | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|

Not covered: <browsers, real devices, assistive technology and anything else not run, with the reason>

## Results by story
| Story | Criterion | chromium | firefox | webkit | mobile-chrome | mobile-safari | Notes |
|---|---|---|---|---|---|---|---|

Use pass, FAIL (with the bug ID), partly verified (say what is unchecked) or not tested (say why).

## Bugs
### BUG-1: <title>
- Severity: critical / major / minor
- Breaks: <story and criterion, or design spec section>
- Owner: <agent name, with the likely file>
- Steps to reproduce: ...
- Expected: ...
- Actual: ...
- Deterministic: yes / no (n of m runs)
- Evidence: <trace or screenshot path>

## Open specification conflicts
- <documents and sections that disagree> (owner)

## Allow-listed console noise
- <pattern>: <source and reason>
```

Severity: **critical** blocks a Must story; **major** fails a Must criterion for many users; **minor** is a small deviation or edge case. Keep bug IDs stable across re-tests and mark each as open, fixed (re-tested) or reopened.
