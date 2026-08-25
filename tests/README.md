# DCC Guest Guide — popup regression tests

Run **before building any release zip**:

```bash
npm install --no-save playwright-core   # once per environment
node tests/popup.test.js
```

Uses the container's preinstalled Chromium (`/opt/pw-browsers/chromium`)
via `playwright-core` — no browser download.

## What it covers

Every scenario is a failure mode that actually shipped between
v0.9.7.17 and v0.9.7.26:

| Scenario | Regression it guards against |
|---|---|
| A. Phone / inline embed | Popup overflowing viewport top, jumping on first scroll, gap/see-through header, missing scrollrail |
| B. Phone / transformed ancestor | Elementor motion-effect ancestor hijacking `position: fixed` (containing block) |
| C. Phone / FAB hub `<dialog>` | Hub overflow; detail opened from hub clipped/painted behind the top-layer dialog |
| D. Desktop / centered card | Card off-center or overflowing |

Plus, in every scenario: zero page/console errors during init + open.

## Maintenance

Fixtures are generated from the **real** `assets/js/widget.js` +
`assets/css/widget.css`, with markup mirroring `Widget::render()`. If
`render()`'s class names or nesting change, update `buildFixture()` in
`tests/popup.test.js` to match — a fixture drifting from render() shows
up as sudden unexplained failures (or worse, silent passes), so keep
them in lockstep.
