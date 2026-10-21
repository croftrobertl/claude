# DCC Ledger — notes for future sessions

Scoped to `dcc-ledger/`. The repo root's `CLAUDE.md` belongs to the Availability
Calendar; this file governs this folder.

## Live since 2026-10-21

Installed on doracanalcourt.com from 0.1.6: batches 1–7 are the platform
exports, batch 8 the MotoPress snapshot. 38 bookings assumed paid,
$60,348.22. Any release from here is an upgrade over live data.

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
  shows a banner instead of figures. It checks the ledger's own columns too,
  because an upgrade that half-finished is the same kind of silent wrongness.
- **No SQL comment ever goes inside a CREATE TABLE.** dbDelta reads one line
  by line and takes a `--` line for a column, which breaks the diff: the
  upgrade then fails to add a column while a fresh install works perfectly.
  `Schema::definitions()` keeps the tables as data so a comment cannot get
  in, and `Schema::expected_columns()` is read from the same source.
- **Only a confirmed booking can be a copy, a move or a question.** A
  cancelled booking is a dock block or a scrapped reservation, never a stay.
- **A confirmed move is seeded by channel and cottage, never by dates alone.**
  `Copies::CONFIRMED_MOVES` names the platform and cottage each of Rob's four
  was moved from, because a cottage can hold two platform stays on the same
  nights — 7278's did, which is what caused the move — and a dates-only lookup
  finds two candidates and links nothing.
- **A link never points at a stay that does not exist.** `Repo::link()`
  refuses a non-positive stay or booking id, and anything older that got
  through is removed on upgrade as a recorded, undoable batch.
- **Nothing is deleted silently**, including the ledger's own past mistakes.
- **A hand-typed copy counts once**, on the platform stay. All four signals
  live in `Copies::detect()` — the only place the question is answered. It was
  answered in three places once, and they drifted.
- **A cancelled or expired platform stay is never the original of a copy**
  (`Copies::can_originate_copy()`). The money did not come through that
  channel, so a direct booking on those nights is a real, separate stay —
  Rob's 5584, and 8415 and 9136 on live. 0.1.6 let a paid-out cancelled stay
  originate one; 0.1.7 took that back. On its own merits it is the wrong
  default: calling a real stay a copy drops its money silently, while
  counting one twice shows on the cleanup list, and only the first is
  invisible. A cancelled stay that DOES carry money and has a booking on its
  nights is raised as a question instead, and nothing is decided for it.
- **The cleanup list uses the same rule the matcher does.** It offered
  "A Platform Stay Also Typed Into MotoPress By Hand" for stays the matcher
  would never link, which is how two copies sat unlinked while being flagged.
- **A booking is a real stay until a person says it is a copy.** Rob's rule is
  that every confirmed booking happened, except dock blocks and moves. So a
  probable move is a QUESTION, never a finding: it counts as a real stay and is
  assumed paid like any other, and only confirming it makes it a copy. Calling
  one a copy on a guess silently drops a real stay's money, which is the worse
  mistake of the two — it is how 6273 went missing in 0.1.2.
- **A move needs the same guest, not just the same dates.** Two parties booking
  the same Friday to Sunday in different cottages is an ordinary busy weekend.
  The surname must match too.
- **A surname is never stored, logged or shown.** It is turned into salted
  hashes inside the row loop and dropped. The salt is per-site, made once, and
  never remade — remaking it would void every stored key.
- **Assumed payments are never written before the platform exports are in.**
  Without the stays, nothing can recognise a copy, and every copy would be
  assumed paid — which is never removed quietly afterwards.
- **Rob's rulings live in `Rulings`, as lists of booking ids.** The fifteen
  pre-export assumptions and the three unrecorded refunds are his decisions of
  2026-10-21, not rules the plugin works out. A refund's AMOUNT is not stored:
  it is the overpayment as it stands when the ruling runs, so the booking
  always lands on exactly its total rather than on a figure typed once and
  left behind.
- **The two assumptions are never added together.** "Assumed Paid In Full"
  comes from the window rule; "Assumed Paid (Before The Exports)" comes from
  Rob's list. They are separate types, separate counts and separate tiles,
  because no platform export covers the earlier period and nothing there
  could be checked against a platform stay. Saying so is the point.
- **A stay's money has one definition**, `Copies::stay_money()`. Summing every
  money type double-counts, because for Booking.com the payout and the guest
  total are the same money seen twice; and ignoring refunds raises a question
  about a stay that nets to nothing, as 6486225525 did. Where a payout row
  exists it is the measure, with refunds, adjustments and resolutions netted
  off; where none exists, what the guest was billed stands in. Two copies of
  this rule drifted once already.
- **A booking number typed by hand is checked before it is written.**
  `Linker::why_not_linkable()` requires the booking to exist, be confirmed and
  be in the same cottage. A link to the wrong cottage moves a stay's money
  onto somebody else's nights and nothing downstream notices.
- **An iCal block is information, never a gap.** A block is recognised only
  when the feed's wording says unavailable AND the booking carries no money,
  so a real reservation is never quietly demoted. Airbnb's "Airbnb (Not
  available)" is the one spelling counted on live (booking 6313); the other
  words in `Mphb_Reader::BLOCK_WORDS` are patterns accepted if they appear —
  nobody has shown me a real Vrbo or Booking.com block. Getting one wrong
  costs nothing: an unrecognised block is raised as a question, as before.
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
- Copy signals are tried in a fixed order — existing link, note code, cottage
  and dates — and the first one wins. The breakdown counts the SAME bookings as
  the copy total, each once, so the parts add up. (In 0.1.2 they counted every
  copy detected while the total counted only those reaching the assumed-paid
  rule, and the two never matched.)
- `copies_detected` is reported beside the skipped total, because they are
  different populations and hiding that was the bug.
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
| `META_LAST_NAME` | `mphb_last_name` — **unconfirmed on live** |
| `META_FIRST_NAME` | `mphb_first_name` — **unconfirmed on live** |
| `META_GUEST_NAME` | `mphb_guest_name` — **unconfirmed on live** |

The three name fields are the only keys still unconfirmed. They are used for
nothing but surname matching, and `Health::name_source_present()` reports when
none of them exists. Without them the figures stay right; every probable move
is simply reported as "no name to compare".

`tests/fixtures/mphb-dataset.php` writes these as **literals**, never as the
plugin's constants. A fixture built from the constants follows the plugin into
its own mistakes and proves nothing; three mutations exist to keep that honest.

## Known gap, not yet decided

If somebody links a hand-typed booking to a cancelled stay as a copy, that
stay's money is counted once, on the stay — but its NIGHTS are counted
nowhere: a cancelled stay contributes none, and the copy is excluded. The
cleanup list raises it rather than absorbing it quietly. If Rob confirms such
a stay happened, the fix is a way to record that a cancelled stay was really
stayed. Nothing on live reaches this today.

## Nights

Nights are always check-out minus check-in (`Dates::nights()`), which holds
across month ends, leap days and both clock changes. The parsers take the
count the export states, which has always agreed with the dates; the importer
raises a note if one ever does not, because the split of a stay's money across
a period boundary uses the stated nights as its denominator and the dates as
its numerator.

## Decisions a person made

`Decisions` stores the one answer the ledger must not forget: "that is not a
move". It lives in the reviews table under a `decision:` key, so a rejected
guess stays rejected instead of being re-offered on every page load. It caches
the table for the length of a request; anything that writes a decision flushes
it, and so does the test harness between suites.

## Running the tests

    php dcc-ledger/tests/run-tests.php            # 867 assertions
    php dcc-ledger/tests/mutations.php            # 55 deliberate breakages
    php dcc-ledger/tests/render-screens.php       # renders each tab to HTML
    node dcc-ledger/tests/layout-check.js         # 390px check + screenshots

The suite runs without WordPress: `tests/bootstrap.php` stubs the core functions
and `tests/lib/wpdb.php` is a SQLite-backed `$wpdb` that runs the plugin's real
SQL. Keep the SQL portable (no `ON DUPLICATE KEY`, `DATE_FORMAT` or `YEAR()`) so
it keeps doing so.

The harness's `dbDelta` upgrades as well as creates: given an existing table
it diffs the columns and ALTERs in what is missing, and it gives up on a
statement it cannot read line by line, the way the real one does. Without that
no test could tell a fresh install from an upgrade, and 0.1.3's blocker went
out undetected.

A PHP warning fails the suite. An undefined index quietly becomes an empty
figure, which is the exact kind of silent wrongness this plugin exists to
prevent — so warnings are defects, not noise.

## Deliverable file names

Rob reads these on his phone, where the plugin folder's name is not visible.
So every file handed to him is named for the plugin:

- the zip is `Ledger <version>.zip`, e.g. `Ledger 0.1.2.zip`
- every other file carries a `Ledger - ` prefix, e.g.
  `Ledger - STAGING-CHECKLIST.md`

The docs in `docs/` already carry that name, so the file in the repo and the
file Rob receives are the same file.

## Building the zip

    cd $(git rev-parse --show-toplevel)
    rm -f "Ledger "*.zip
    zip -rq "Ledger 0.1.8.zip" dcc-ledger -x 'dcc-ledger/tests/*'

The version in the file name must match `DCCL_VERSION` in `dcc-ledger.php`.
