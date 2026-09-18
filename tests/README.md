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

1. **A test must read the code, not the documentation about the code.** Both
   of the worst failures here reduce to that one sentence, and the next
   instance will look like neither of them:
   - A source-text assertion ran against the raw stylesheet, whose comments
     *quote the declarations they describe* ("the global `min-width: 8.5em`
     guard") — so it matched prose and reported a deleted rule as present.
     `harness.cssCode()` strips comments for exactly this.
   - A fixture emitted Elementor's CSS the way the code *appeared* to ask for
     it rather than the way Elementor actually does, and the mismatch was
     reported as a plugin bug ("field typography cannot reach the portaled
     popup"). It could not — in the fixture. Derive the emission from the
     source and check the derivation against something measured live.
2. **A stub must not be more forgiving than production.** `bootstrap.php`
   returns post meta the way WordPress does — every value wrapped in an array,
   even a single one — and `T_WPDB::prepare()` throws on a placeholder/argument
   mismatch. This project has twice had a bug hidden by a kind stub.
3. **Do not count an assertion as coverage until you have seen it fail** —
   and make the mutation PRECISE. `mutate.php` replaces the first occurrence
   only, and says so when a target appears more than once. Replacing every
   match made three mutations go red for the wrong reason: they were breaking
   more than the behaviour under test, so the red proved nothing about the
   assertion they were paired with.
   `mutate.php` breaks each guarded behaviour and requires the suite to go red.
4. **Where a suite asserts on markup a third party renders, carry BOTH shapes
   in the fixture.** Fixtures drift from live silently.
5. **Reproduce the real cascade.** The plugin stylesheet loads AFTER
   Elementor's inline CSS, Bravada's kit resets inputs at (0,3,1), and the site
   sets `html { font-weight: 700 }`. A fixture missing any of those is a
   different site in the one respect that matters.
6. **Use the right instrument for the question.** Contrast ratio measures
   LUMINANCE, so it is right for text on a fill and wrong for "are these two
   fills distinguishable" — available `#7BDCB5` against past `#bdc3c7` scores
   1.08 while differing obviously in hue. Separation between fills needs a
   distance that includes hue.
7. **A guard must sit AT the value it enforces, not below it.** The tap-target
   assertion floored at 40 while the standard was 44 — which is exactly why
   shipping the fix would not have broken it. A guard set below its own
   standard stays green through the next regression too.
8. **Assert computed style, never the attribute.** Reading `hidden`/`disabled`
   hid a live bug here for several releases.

## Rebuilt so far

| suite | covers | mutations |
|---|---|---|
| `staff-panel-test.php` | 0.32.0/0.33.0 — photo ID, money rows, the guest-count contract, the pet gate | 9 |
| `staff-gate-test.php` | the standing security constraint — `is_authorized()`, the fail-closed password-removed path, the status whitelist, no PII in page HTML | 3 |
| `browser/hover-hint-test.js` | 0.31.0/0.31.1 — hover tokens, the (0,6,0) cascade trap, the theme's 0.75s fade, the mm/dd/yyyy hint | 6 |
| `browser/field-standard-test.js` | 0.28.0–0.30.0 — the DCC pill, the native-control reset, the iOS 16px floor, the focus ring, the empty-state mapping | 5 |
| `browser/mobile-test.js` | 0.27.0–0.31.0 at 320/360/393 — the popup row, the filter row, the 2×2 month grid, the item-14 guards | 4 |
| `browser/typography-test.js` | 0.25.0/0.26.0 — all ten typography controls own what they emit; no `font:` shorthand at a control's own tier; the control selectors stay ancestor-free | 3 |
| `browser/cells-test.js` | the grid — day-number contrast on every state, the three fills staying distinct, the cottage column's scale stacking and its dividers variant, the cell tooltip | 6 |
| `browser/nav-test.js` | the nav row — SVG chevrons on the colour control, the centred cluster, 44px hit areas, the Today button by COMPUTED STYLE | 5 |
| `browser/polish-test.js` | stylesheet-wide — the pointer guard, bare `:focus`, `!important` never overriding a control, touch states, 44px tap targets, row baselines, reduced motion, print | 7 |

**49 mutations, 0 survivors.** `php mutate.php` after any change.

### A finding this rebuild retracted

The 0.33.1 notes recorded a "known gap": that `field_typography`, being a
group control, was emitted `{{WRAPPER}}`-prefixed and so could not reach the
booking popup's portaled date fields. **That was wrong, and it was the
fixture's fault.** Elementor substitutes `{{WRAPPER}}` where a selector
contains it and does not prefix one on; `FSEL` is a bare doubled class
declared beside `BSEL`, which was measured global on the live page. Emitted
the way Elementor really emits it, the panel reaches every field — measured
300/300 bare against 300/400 wrapper-prefixed.

The invariant is now guarded rather than documented: all three control
selectors must stay ancestor-free, and a mutation that gives `FSEL` an
ancestor goes red.

## Still to rebuild

Lost with the container and not yet replaced. Listed so the gap is visible
rather than assumed covered. **This list shrinks only when a suite is rebuilt
AND has a mutation that goes red.**

- **Browser** — `public-ui`, `estimate-ui`, `sheet-validate`, `staff-ui`
- **Pure JS** — `estimate`, `fresh`, `hint`, `month-grid`, `parity`
- **PHP** — `abbrev`, `cache`, `device-number`, `price`, `single-widget`,
  `staff-detail`, `staff-elementor`, `staff-honesty`, `staff-monthview`,
  `staff-notes`, `staff-nplus1`, `staff-ota`, `staff-payment`,
  `staff-sections`
