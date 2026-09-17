# tests

Run everything: `tests/run.sh`
Check the tests can actually fail: `php tests/mutate.php`

## Why these are in the repository

Every harness this project had — 31 of them, 16 PHP and 15 browser — lived in
the session scratchpad, which is ephemeral. On 2026-09-17 a container recycle
deleted all of them at once, after they had been used to verify fourteen
releases. Nothing was in version control.

They sit **outside** `mphb-availability-calendar/` so the release zip, which is
built from that directory, stays clean.

## Rules these harnesses are held to

1. **A stub must not be more forgiving than production.** `bootstrap.php`
   returns post meta the way WordPress does — every value wrapped in an array,
   even a single one — and `T_WPDB::prepare()` throws on a placeholder/argument
   mismatch. This project has twice had a bug hidden by a kind stub.
2. **Do not count an assertion as coverage until you have seen it fail.**
   `mutate.php` breaks each guarded behaviour and requires the suite to go red.
3. **Where a suite asserts on markup a third party renders, carry BOTH shapes
   in the fixture.** Fixtures drift from live silently.
4. **Reproduce the real cascade.** The plugin stylesheet loads AFTER
   Elementor's inline CSS, Bravada's kit resets inputs at (0,3,1), and the site
   sets `html { font-weight: 700 }`. A fixture missing any of those is a
   different site in the one respect that matters.
5. **Assert computed style, never the attribute.** Reading `hidden`/`disabled`
   hid a live bug here for several releases.

## Rebuilt so far

| suite | covers | mutations |
|---|---|---|
| `staff-panel-test.php` | 0.32.0/0.33.0 — photo ID, money rows, the guest-count contract, the pet gate | 9 |
| `staff-gate-test.php` | the standing security constraint — `is_authorized()`, the fail-closed password-removed path, the status whitelist, no PII in page HTML | 3 |
| `browser/hover-hint-test.js` | 0.31.0/0.31.1 — hover tokens, the (0,6,0) cascade trap, the theme's 0.75s fade, the mm/dd/yyyy hint | 6 |
| `browser/field-standard-test.js` | 0.28.0–0.30.0 — the DCC pill, the native-control reset, the iOS 16px floor, the focus ring, the empty-state mapping | 5 |
| `browser/mobile-test.js` | 0.27.0–0.31.0 at 320/360/393 — the popup row, the filter row, the 2×2 month grid, the item-14 guards | 4 |
| `browser/typography-test.js` | 0.25.0/0.26.0 — all ten typography controls own what they emit; no `font:` shorthand at a control's own tier | 2 |

**29 mutations, 0 survivors.** `php mutate.php` after any change.

### A known gap this rebuild surfaced

`field_typography` is a GROUP control, so Elementor emits it prefixed with
`{{WRAPPER}}`. The booking popup is portaled to `<body>`, outside that
element, so **the Filter Fields typography control cannot reach the popup's
two date fields** — measured: panel 300, portaled field 400. `BSEL`/`VSEL` are
global for exactly this reason, but a group control's selector always carries
the wrapper prefix. Closing it means emitting a second ancestor-free rule or
accepting page-wide field typography. Recorded and pinned on its cause in
`typography-test.js`, awaiting an owner decision — not changed silently.

## Still to rebuild

Lost with the container and not yet replaced. Listed so the gap is visible
rather than assumed covered. **This list shrinks only when a suite is rebuilt
AND has a mutation that goes red.**

- **Browser** — `nav`, `polish`, `cells`, `public-ui`, `estimate-ui`,
  `sheet-validate`, `staff-ui`
- **Pure JS** — `estimate`, `fresh`, `hint`, `month-grid`, `parity`
- **PHP** — `abbrev`, `cache`, `device-number`, `price`, `single-widget`,
  `staff-detail`, `staff-elementor`, `staff-honesty`, `staff-monthview`,
  `staff-notes`, `staff-nplus1`, `staff-ota`, `staff-payment`,
  `staff-sections`
