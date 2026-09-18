# tests

Run everything: `tests/run.sh`
Check the tests can actually fail: `php tests/mutate.php`
(that is ~2-3 minutes — each browser mutation launches Chromium. While
iterating, `php tests/mutate.php staff` filters by name. A filtered run's
"0 survived" is not the same claim as a full run's, and the output says which
it was.)

**Do not commit while a mutation run is in flight.** It rewrites the plugin's
own files and restores each one immediately, so a `git status` taken mid-run
shows a mutated file that is about to be put back — and a commit at that
moment captures it as a real edit. The runner verifies every file it touched
is byte-identical at the end and says so; wait for that line.

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
5. **Reproduce Elementor's per-post cascade, not just the stylesheet.** Both
   widgets have had a fault that lives ONLY there: a control emitting a paint
   property at (0,6,0)/(0,7,0) out-specifies the stylesheet's hover rule, and
   a control emitting `:hover` is somewhere the `(hover: hover)` guard cannot
   reach. `harness.js` and `staff-harness.js` build that CSS from the control
   source, with the real post and element ids.
6. **Reproduce the real cascade.** The plugin stylesheet loads AFTER
   Elementor's inline CSS, Bravada's kit resets inputs at (0,3,1), and the site
   sets `html { font-weight: 700 }`. A fixture missing any of those is a
   different site in the one respect that matters.
7. **Use the right instrument for the question.** Contrast ratio measures
   LUMINANCE, so it is right for text on a fill and wrong for "are these two
   fills distinguishable" — available `#7BDCB5` against past `#bdc3c7` scores
   1.08 while differing obviously in hue. Separation between fills needs a
   distance that includes hue.
8. **A guard must sit AT the value it enforces, not below it.** The tap-target
   assertion floored at 40 while the standard was 44 — which is exactly why
   shipping the fix would not have broken it. A guard set below its own
   standard stays green through the next regression too.
9. **Assert computed style, never the attribute.** Reading `hidden`/`disabled`
   hid a live bug here for several releases.

## Rebuilt so far

All 22 suites are back, each with at least one mutation that goes red.

| suite | covers |
|---|---|
| `abbrev-test.php` | the cottage short name, incl. the 0.23.5 "Blue Heron" regression |
| `cache-test.php` | key/get_or_set/flush_all, the age-0 hit, the legacy payload, a cached `false` |
| `device-number-test.php` | the responsive clamp, and every call site's bounds |
| `price-test.php` | the estimate endpoint's validator, and the one place HTML is injected |
| `single-widget-test.php` | Widget_Single inherits rather than forks; months 4/2/2 |
| `staff-detail-test.php` | the photo proxy's only door, and where containment actually lives |
| `staff-elementor-test.php` | staff controls write tokens, never `:hover` or a paint property |
| `staff-gate-test.php` | `is_authorized()`, the fail-closed path, the status whitelist, no PII in HTML |
| `staff-honesty-test.php` | an imported default is never presented as a fact |
| `staff-monthview-test.php` | one query, one prime, whatever the month holds |
| `staff-notes-test.php` | the 0.23.1 fatal, every note shape, placeholder notes |
| `staff-nplus1-test.php` | the query budget for both staff paths |
| `staff-ota-test.php` | PRODID mapping, the reserved-room marker, the ids parameter |
| `staff-panel-test.php` | photo ID, money rows, the guest-count contract, the pet gate |
| `staff-payment-test.php` | what counts as paid, and money as plain text |
| `staff-sections-test.php` | the textContent contract, against hostile input |
| `js/month-grid-test.js` | month arithmetic, in four timezones |
| `js/fresh-test.js` | the two ages compounding, and failing closed |
| `js/parity-test.js` | `rangeState`/`blockedNight`, incl. checkout-is-not-a-night |
| `js/estimate-test.js` | the template composer: text stays text, only `{html:…}` is injected |
| `js/hint-test.js` | the availability hint, incl. the 0.20.1 past-window bug |
| `browser/cells-test.js` | day-number contrast, the three fills, the cottage column |
| `browser/estimate-ui-test.js` | the estimate block through the portal |
| `browser/field-standard-test.js` | the DCC pill, the native-control reset, the iOS floor |
| `browser/hover-hint-test.js` | hover tokens, the (0,6,0) trap, the mm/dd/yyyy hint |
| `browser/mobile-test.js` | 320/360/393, the 2x2 month grid, the item-14 guards |
| `browser/nav-test.js` | SVG chevrons, the centred cluster, the Today button |
| `browser/polish-test.js` | the pointer guard, bare `:focus`, `!important`, tap targets |
| `browser/public-ui-test.js` | the cottage column, and the PORTAL TOKEN SWEEP |
| `browser/sheet-validate-test.js` | the error row, Book Now actually disabled |
| `browser/staff-test.js` | /staff/ buttons, the per-post cascade, the `:hover`/`:focus` split |
| `browser/typography-test.js` | all ten typography controls own what they emit |

## Still to rebuild

Nothing. The list is empty because every suite above has a mutation that goes
red — a suite that passes but cannot fail does not count as rebuilt.

If a suite is ever removed or cannot be written honestly, put it back on this
list with the reason. A visible gap is worth more than a suite reporting
coverage it does not have.
