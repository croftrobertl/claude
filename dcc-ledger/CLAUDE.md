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
and Vrbo exports.

**The ledger works on a copy.** Rob hand-curated the website and its bookings
over two years, and that is the untouched original. The snapshot duplicates his
direct bookings and their payments into the ledger's own `originals` table and
freezes them; every correction lives in `adjustments` as a separate labelled row
on top. If a correction is wrong, the Original is still exactly what MotoPress
held. Reports show Original, Ledger (Original + adjustments), or the Difference.

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
- **An Original is never edited.** `Originals::update()` refuses every field
  but `is_current` and `superseded_at`. A change in MotoPress becomes a new
  version beside the old one, and the cleanup list says so.
- **A refresh never touches an adjustment.** It adds and versions Originals,
  nothing else.
- **Recorded and assumed money are never blended without a label.** Assumed
  payments are ledger adjustments, dated at check-in, labelled "assumed, actual
  date unknown". There is nothing in MotoPress marking them — the 38
  `_dcc_assumed_paid` payments were removed from live on 2026-10-19.
- **Paid means `mphb-p-completed` only.** MotoPress keeps the amount on a
  refunded payment, so counting one would overstate the money. Refunded
  payments are reported on their own line.
- **A missing MotoPress key is never a figure of zero.** `Health::check()` runs
  on activation, before every snapshot and on every report load; a mismatch
  shows a banner instead of figures.
- **A hand-typed copy counts once**, on the platform stay. All four signals
  live in `Copies::detect()` — the only place the question is answered. It was
  answered in three places once, and they drifted.
- **A cancelled or expired platform stay is never the original of a copy.** The
  money never came through that channel, so a direct booking on those dates is
  a real, separate stay. This is Rob's 5584.
- **Assumed payments are never written before the platform exports are in.**
  Without the stays, nothing can recognise a copy, and every copy would be
  assumed paid — which is never removed quietly afterwards.
- **An assumed payment is reversed, never deleted.** A reversal is a second,
  labelled adjustment that cancels the first, so both halves stay on the
  record and the pair nets to zero if the booking ever stops looking like a
  copy.
- **Three separate tax buckets**, never summed: remitted by the platform,
  collected inside a payout, and not reported at all. Vrbo reports no tax —
  that is "not reported", never "$0".
- **An overlap or a cross-channel match is never auto-linked.** Nor is a
  probable move: it is treated as a copy in the figures, but linking it would
  make rejecting it harder than confirming it, so it waits for a person. The
  four moves Rob confirmed on 2026-10-18 (`Copies::CONFIRMED_MOVES`) are
  seeded as links and marked reviewed.
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
- Copy detection reports the signal that FOUND a copy, not the link it has
  since been given, so a copy count can be reconciled against how each one was
  recognised. A link only shows as the reason when no signal explains it any
  more.
- A confirmed link outranks an earlier rejection: somebody said yes after
  somebody said no.
- A probable move needs the platform stay's own cottage to be empty on those
  dates. If something is already standing there, this booking is not where that
  guest went.
- Two platform stays on the same dates in different cottages are not guessed
  between; neither becomes a move.
- Structural questions on the cleanup list (which bookings exist, on what
  dates) are read live from MotoPress so they are never stale; money questions
  are read from the frozen copy so a figure never moves under Rob's feet.
- A second assumed adjustment is never added to a booking that already has one.
  If the gap has since changed, the snapshot raises a note instead of
  rewriting it.

## MotoPress keys, counted on live 2026-10-19

Constants at the top of `includes/class-mphb-reader.php`. The underscores and
the status prefix are not cosmetic — the other spellings return nothing at all.

| Constant | Live value |
| --- | --- |
| `META_TOTAL` | `mphb_total_price` |
| `META_PAYMENT_AMOUNT` | `_mphb_amount` (underscore) |
| `META_PAYMENT_BOOKING` | `_mphb_booking_id` (underscore; NOT post_parent) |
| `META_NOTE` | `mphb_note` |
| `META_INTERNAL_NOTE` | `_mphb_booking_internal_notes` |
| `PAYMENT_COMPLETED` | `mphb-p-completed` (prefixed) |
| `PAYMENT_REFUNDED` | `mphb-p-refunded` |

`tests/fixtures/mphb-dataset.php` writes these as **literals**, never as the
plugin's constants. A fixture built from the constants follows the plugin into
its own mistakes and proves nothing; three mutations exist to keep that honest.

## Decisions a person made

`Decisions` stores the one answer the ledger must not forget: "that is not a
move". It lives in the reviews table under a `decision:` key, so a rejected
guess stays rejected instead of being re-offered on every page load. It caches
the table for the length of a request; anything that writes a decision flushes
it, and so does the test harness between suites.

## Running the tests

    php dcc-ledger/tests/run-tests.php            # 518 assertions
    php dcc-ledger/tests/mutations.php            # 29 deliberate breakages
    php dcc-ledger/tests/render-screens.php       # renders each tab to HTML
    node dcc-ledger/tests/layout-check.js         # 390px check + screenshots

The suite runs without WordPress: `tests/bootstrap.php` stubs the core functions
and `tests/lib/wpdb.php` is a SQLite-backed `$wpdb` that runs the plugin's real
SQL. Keep the SQL portable (no `ON DUPLICATE KEY`, `DATE_FORMAT` or `YEAR()`) so
it keeps doing so.

A PHP warning fails the suite. An undefined index quietly becomes an empty
figure, which is the exact kind of silent wrongness this plugin exists to
prevent — so warnings are defects, not noise.

## Building the zip

    cd $(git rev-parse --show-toplevel)
    zip -rq dcc-ledger.zip dcc-ledger -x 'dcc-ledger/tests/*'
