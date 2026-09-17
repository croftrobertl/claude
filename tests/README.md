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

| suite | covers |
|---|---|
| `staff-panel-test.php` | 0.32.0/0.33.0 — photo ID, money rows, the guest-count contract, the pet gate |
| `staff-gate-test.php` | the standing security constraint — `is_authorized()`, the fail-closed password-removed path, the status whitelist, no PII in page HTML |

## Still to rebuild

Lost with the container and not yet replaced. Listed so the gap is visible
rather than assumed covered:

- **Browser (needs `playwright-core`; Chromium is at `/opt/pw-browsers`)** —
  `hover-hint`, `field-standard`, `mobile`, `typography`, `nav`, `polish`,
  `cells`, `public-ui`, `estimate-ui`, `sheet-validate`, `staff-ui`
- **Pure JS** — `estimate`, `fresh`, `hint`, `month-grid`, `parity`
- **PHP** — `abbrev`, `cache`, `device-number`, `price`, `single-widget`,
  `staff-detail`, `staff-elementor`, `staff-honesty`, `staff-monthview`,
  `staff-notes`, `staff-nplus1`, `staff-ota`, `staff-payment`,
  `staff-sections`
