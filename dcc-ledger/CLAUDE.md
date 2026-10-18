# DCC Ledger — notes for future sessions

Scoped to `dcc-ledger/`. The repo root's `CLAUDE.md` belongs to the Availability
Calendar; this file governs this folder.

## Branch rule

Work on a `claude/…` branch created from `origin/main`. Never commit to `main`
(it holds the shared site context) and never to another plugin's branch. Note
that the repo's default branch is **not** main — it is the Availability
Calendar's working branch, so always name the base explicitly.

## What this plugin is

A separate money ledger for the 8 cottages, built from the Airbnb, Booking.com
and Vrbo exports. MotoPress supplies direct-booking money and the bookings the
iCal feeds imported.

## Invariants — do not "fix" these without asking Rob

- **MotoPress is read-only.** No `wp_insert_post`, `wp_update_post`,
  `update_post_meta` or any write to `posts`/`postmeta`. An iCal sync can
  delete and recreate an imported booking, which would erase anything written
  onto it. `tests/test-privacy.php` asserts this at runtime and by scanning the
  source.
- **No guest names, emails, phones or addresses are stored or displayed.** A row
  is channel + code + cottage + dates. Guest columns are read and dropped inside
  the row loop, or not read at all.
- **Crofty Bear and Hipcamp are excluded everywhere**, on every channel, in every
  figure.
- **Recorded and assumed payments are never blended without a label.** The 38
  assumed payments added on 2026-10-18 carry meta `_dcc_assumed_paid`.
- **A hand-typed copy counts once**, on the platform stay. Copies are linked
  `method=copy` and excluded from the direct figures.
- **Three separate tax buckets**, never summed: remitted by the platform,
  collected inside a payout, and not reported at all. Vrbo reports no tax —
  that is "not reported", never "$0".
- **An overlap, a cross-channel match or a moved cottage is never auto-linked.**
  They go on the cleanup list with candidates.
- **Uploaded files are parsed from a private temp file and deleted before the
  request ends**, success or failure. Never written to uploads/.
- **Nothing runs on plugin load.** Tables are created on activation and on a DB
  version bump only. No option autoloads.

## Judgement calls I made that are not in the spec

- An Airbnb `Payout` row is used for its reference and date only; it is not
  stored as a money line, because its total is the sum of the reservation rows'
  Amount shares and storing both would double every payout. The parser checks
  the two agree and raises a note when they do not (skipping groups that lost
  rows to the Crofty exclusion, which cannot be checked).
- An Airbnb `Cancellation Fee` row creates the cancelled stay its money belongs
  to, since a cancelled reservation gets no Reservation row of its own.
- `tax_in_payout` for Booking.com is derived after import (payout − Final
  amount) and stored with `meta.source = derived`. If the inputs later
  disagree with a stored figure, the import raises a note rather than
  rewriting it.
- A stay with any link, copies included, is not reported as "no MotoPress
  booking".

## Unverified against live

These MotoPress keys are MotoPress defaults that could not be checked from the
build environment. They are constants at the top of `includes/class-mphb-reader.php`:
`mphb_total_price`, `mphb_amount`, `mphb_note`, post type `mphb_payment`,
payment status `completed`. Step 2 of `docs/STAGING-CHECKLIST.md` verifies them.
A wrong key reports $0 silently rather than failing.

## Running the tests

    php dcc-ledger/tests/run-tests.php            # 387 assertions
    php dcc-ledger/tests/mutations.php            # 16 deliberate breakages
    php dcc-ledger/tests/render-screens.php       # renders each tab to HTML
    node dcc-ledger/tests/layout-check.js         # 390px check + screenshots

The suite runs without WordPress: `tests/bootstrap.php` stubs the core functions
and `tests/lib/wpdb.php` is a SQLite-backed `$wpdb` that runs the plugin's real
SQL. Keep the SQL portable (no `ON DUPLICATE KEY`, `DATE_FORMAT` or `YEAR()`) so
it keeps doing so.

## Building the zip

    cd $(git rev-parse --show-toplevel)
    zip -rq dcc-ledger.zip dcc-ledger -x 'dcc-ledger/tests/*'
