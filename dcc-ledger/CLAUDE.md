# DCC Ledger — notes for future sessions

Scoped to `dcc-ledger/`. The repo root's `CLAUDE.md` belongs to the Availability
Calendar; this file governs this folder.

## Live since 2026-10-21

Installed on doracanalcourt.com from 0.1.6 and upgraded to 0.1.8 the same
day: batches 1–7 are the platform exports, batch 8 the MotoPress snapshot,
batch 9 Rob's rulings. The adjustments table reads assumed_paid 38 /
$60,348.22, assumed_paid_pre_exports 15 / $35,333.00, refund_not_recorded
3 / −$860.25. 136 links, 15 reviews, and MotoPress still at 428 bookings and
95 payments. Any release from here is an upgrade over live data.

## Standards

Set by the Website Director on 2026-10-29. This is the bar for every task in
this folder from here on, not a one-off brief.

**Who I am on this plugin.** A hospitality finance chief: CFO and controller
for a hotel group, revenue manager, reservations director, and a forensic
accountant who can trace any dollar from the guest's card to the bank. USALI,
accrual accounting, and how Airbnb, Booking.com and Vrbo actually pay, charge
commission and handle tax. Books an auditor finishes early.

**The bar.** Every number on a Ledger screen would survive an outside audit
with no adjusting entries, and Rob could hand it to his accountant or his bank
without a footnote. **A missing figure is acceptable. A wrong figure is not.**

**The order of work:**

1. **Source.** Every figure traces to a source document — an MPHB booking, an
   OTA export or invoice, or a payout. No source, no number. An unknown is
   shown as unknown, never estimated silently.
2. **Reconcile before reporting.** Site against OTA against payout. Unmatched
   items are listed and explained, never plugged.
3. **Separate the parts:** gross, commission and fees, taxes (and who remits
   them), refunds and clawbacks, then net. Label cash or accrual on every
   figure. Keep stay date, booking date and payout date distinct.
4. **Corrections live in the ledger, never in MotoPress.** Each records what,
   why, when and on what evidence, and can be reversed.
5. **Report like a CFO:** occupancy, ADR, RevPAR, net revenue per channel
   after commission, channel mix, booking pace, lead time and length of stay.
   Each figure shows its definition and date range.

**Rules that never bend:**

- Never write to MotoPress bookings or payments. GET-only on live.
- Cottages only. Admins only, never /staff/.
- No guest names in the ledger or any report — link the MPHB booking id
  instead. Never copy export files with guest data into prompts or the repo.
- Every confirmed booking really happened, except dock blocks and copies made
  when a guest moved cottages.
- **Money in integer cents, never floating point.** Times in
  America/New_York. State every rounding rule.
- Data-heavy screens follow Rob's Croatia-site UI reference: stat tiles,
  segmented controls, chips.

**Definition of done** — report one line per check before Rob sees anything:

- The parts add up: totals tie to the cent, every month and every channel.
- Spot check: one month reconciled by hand against its source files.
- The trail: every number on screen opens to its source.
- Privacy: a non-admin sees nothing; no guest names anywhere.
- Untouched: zero writes to MPHB, proven.
- Readable at 390, 768 and 1440.

Titles centered, Title Case, American spelling.

**Where this plugin does not meet the standard yet** (not a licence to leave
it; named so no future session mistakes the gap for a decision):

- The Croatia-site UI reference has not been applied. The screens use stat
  tiles and chips; the segmented controls and the layout itself are still
  the plugin's own.
- The hand reconciliation of a real month against Rob's own export files has
  never been run here and cannot be: the exports carry guest PII and never
  reach this session. The Director does it on Rob's Mac and reports
  aggregates. Report it as "not run", never as passed.
- Booking pace has no history yet. Recording began with 0.3.0; the first
  month with a complete curve is about six months after that.
- How much of the tax inside the direct booking totals the ledger can read
  has not been checked against the live count since the reader was
  rewritten for JSON in 0.3.4. The Director counted 76 of 117 sampled
  bookings listing room taxes; `wp dcc-ledger direct-tax` prints what the
  reader found. On 0.3.3 it read 0 of 267 and nobody would have known from
  a figure — only from that command.

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
- **One booking carries one link.** A MotoPress booking is one stay: it can
  be a platform stay's imported booking, or a hand-typed copy of one, never
  both and never two of either. `Repo::link()` refuses a booking that already
  has a link anywhere, and `Linker::why_not_linkable()` names the stay it is
  already linked to. Before 0.1.9 only the same pair was refused, so a
  by-number link could count one booking's nights against two reservations.
- **An information item is not work.** A block, or a stay the exports have
  not reached yet, needs nobody. Both the Cleanup tab and
  `wp dcc-ledger cleanup` count them apart and list them under their own
  heading; live read "28 items need a person" when 13 of them needed none.
- **Whatever assumption stands counts as paid.** `unpaid_past` reads
  `Adjustments::assumed_for()`, which covers both positive assumption types
  and returns nothing once one has been reversed. Reading a single type left
  all fifteen pre-export bookings on the list as unpaid while the ledger was
  already treating them as settled.
- **What the CLI prints is a deliverable.** The checklist is worked from
  these commands, so a figure the snapshot computes and does not print is a
  defect; `tests/test-cli.php` runs the commands against a stubbed `WP_CLI`
  and reads the output.
- **Money is whole cents, everywhere but the screen.** `Money::to_cents()`
  parses the digits of a source cell rather than multiplying a float, because
  (int) (19.99 * 100) is 1998. The `*_cents` columns are the figures; the
  `decimal(12,2)` columns beside them are a mirror, written from the cents
  and read by nothing, kept so the conversion can be rolled back. `Ui::money()`
  is the only place cents become a decimal for a person.
- **A split always sums to the whole, and no share is rounded on its own.**
  `Money::slice($cents, $before, $within, $total)` is the only splitter.
  Every period reads the same running total — the money earned by the end
  of its last night, less the money earned by the end of the night before
  its first — so consecutive periods cancel each other's rounding and any
  set of periods covering a stay's nights sums to the stay exactly. Rounding
  each period's share on its own does NOT add up: two nights of an odd
  number of cents are x.5 each and both round away from zero, which is how
  2026's months came to three cents more than the year. `allocate()` and
  `share()` were removed rather than left lying about; the caller has to
  know where in the stay its period starts (`Dates::nights_before()`).
- **What the guest was billed is counted once per stay.** A Booking.com
  reservation row states its Final amount as `room_sales`; its payout file
  states the same money again as `guest_total`. `Reports::billed_cents()`
  takes the stay's own `guest_total` where it has one and its `room_sales`
  where it does not — never the sum. Reading `guest_total` alone reported
  $0 of gross room revenue for every Booking.com stay whose payout had not
  arrived, while its nights went on dividing the rate. `Copies::stay_money()`
  has made the same choice since 0.1.0; gross room revenue did not, and the
  audit found it once the direct side stopped masking it.
- **A direct booking's total INCLUDES room tax on this site, and room
  revenue excludes tax.** Established by reading live on 2026-10-30, in
  aggregate: `_mphb_booking_price_breakdown` is present on 281 booking
  rows; of 117 confirmed bookings sampled with one, 76 list room taxes;
  the breakdown's total equals `mphb_total_price` on 116 of the 117; and
  no services appear in any breakdown. Direct room revenue is the
  breakdown's total less its taxes — never `mphb_total_price` as it stands.
- **The price breakdown is a JSON string on this site**, not a serialized
  PHP array. `Breakdown::decode()` reads JSON first and a serialized array
  second (with `allowed_classes => false`, so stored data never becomes an
  object). 0.3.3 read it as serialized only, found nothing in any of the
  267 direct bookings, and reported every one of them as an unknown tax —
  which took every direct night out of every rate. The key paths, counted
  on live on 2026-10-30: `total`; `rooms[n].room.total`;
  `rooms[n].services.total`; `rooms[n].fees.total`;
  `rooms[n].taxes.room.total` and `.taxes.room.list[m].price`;
  `rooms[n].taxes.services.total`; `rooms[n].taxes.fees.total`;
  `rooms[n].total`. Room revenue takes out all three tax buckets.
  `tests/fixtures/mphb-dataset.php` writes that exact JSON, and a mutation
  feeds the reader a JSON string — the case that slipped through.
- **A tax bucket this reader does not know refuses the whole reading.**
  `Breakdown::TAX_BUCKETS` is the allow-list. A bucket read as nothing
  would overstate room revenue by its value, which is a wrong figure
  rather than a missing one — so an unfamiliar bucket makes the booking's
  tax unknown instead.
- **A breakdown that does not prove itself is an unknown tax, never a tax
  of zero.** `Breakdown::read()` reports a tax as known only when the
  breakdown's own total equals the booking's total and every tax bucket in
  it is one the reader knows. Anything else — no breakdown, no JSON, no
  total, no rooms, a bucket nobody has seen — is unknown. A booking whose
  tax is unknown keeps its money in the money figures and is out of room
  revenue and out of every rate, named on screen with its count, its
  nights and its dollars. A total that may hold tax is a WRONG
  room-revenue figure, not a missing one.
- **The tax reading is frozen, in its own table.** `booking_taxes` versions
  a reading the way `originals` versions a booking, and for the same
  reason. It is a separate table rather than two more columns on
  `originals` because adding them to the content hash would re-version all
  428 live bookings on the next snapshot — the cleanup list would report
  that MotoPress had changed when only the ledger had.
- **The conversion to cents is reversible and proves itself.**
  `Money_Migration` backs every decimal cell up before touching it, converts,
  and compares every table's total and every month and channel within it. A
  mismatch rolls the whole thing back in the same request.
- **Cents that are not there are never reported as zero.**
  `Health::money_not_in_cents()` counts rows holding a decimal with no cents
  beside them and shows a banner instead of figures. That is the state a
  rollback leaves, and it must be loud.
- **Every timestamp is America/New_York.** `Dates::now()`, never WordPress's
  own current-time helper, which answers in the site's timezone. A correction
  at 00:10 on the first of a month belongs to the new month. `DCCL_TEST_NOW`
  pins the clock so both clock changes and New Year's Eve can be stood on
  deliberately.
- **A metric shows the nights it divides by.** Occupancy counts every
  occupied night; ADR divides by the nights that carry money, because a
  night with nothing above it in the denominator alone reads as a discount
  nobody gave. Both figures are on the screen so the division can be
  checked rather than trusted. `Reports::per_night()` rounds half up once,
  at the end, and returns null — shown as "Unknown" — rather than zero.
- **Gross and net are never shown one without the other.** The gap between
  them is the commission story, and a single ADR hides fifteen to eighteen
  per cent of it.
- **Lead time is split.** The platform figure is the guest's own booking
  date from the export. The direct figure is the date the booking was
  ENTERED in MotoPress, which for one Rob typed in later is not when the
  guest booked — a floor, not a fact, labelled as such wherever it appears.
  There is deliberately no blended figure to read by mistake.
- **Booking pace is recorded, never reconstructed.** A curve drawn today
  from booking dates shows what survived to today, not what stood: a
  reservation made in March and cancelled in April is in neither record.
  `Pace::record()` writes the position once a night and never rewrites it,
  a missed night is reported as a gap rather than filled, and a month is
  charted only when every reading on its curve exists.
- **A cancelled stay counts only when a person rules that it happened.**
  `Stay_Rulings` records the evidence — money received, named in the note,
  or Rob's own word with his reason — and refuses a ruling with no note. A
  ruling is revoked, never deleted, and the cleanup list carries it either
  way.
- **Every figure opens to its rows.** `Reports::trail()` is the one place a
  figure's name, its definition and the rows behind it are written down, so
  the sentence a reader is shown is the sentence the figure was computed by.
- **A subcommand is registered by the name a person types.** WP-CLI names a
  subcommand after its method, so `money_check` answered to the underscore
  while every document said `money-check`. Both spellings are registered in
  `Cli::HYPHENATED` and tested by the name, not the method.
- **Net revenue is gross less commission and fees, never the payout.**
  `Reports::net_room_revenue()`, one definition for every channel. A
  Booking.com payout carries the tax Rob remits AND has no commission taken
  out — that is invoiced separately — so taking the payout as net
  overstated Booking.com twice and produced a net ADR ABOVE the gross one
  on live. Gross is `guest_total` less both tax buckets, plus refunds,
  which reduce room revenue the way they would in any set of books; a
  resolution or an adjustment is not room revenue and is in neither figure,
  staying visible in net payout, which is the cash that moved.
- **A dollar with no night under it is out of every rate.** The mirror of
  the night-with-no-money rule. A payout whose reservation row has not
  arrived has no nights; linked to a MotoPress booking it takes that
  booking's dates (read, never written), and unlinked its nights are
  unknown — its money is reported, kept out of both sides of every rate,
  and named on screen along with the fact that its tax and commission are
  unknown too, not zero.
- **`Audit` runs the rules over the real data.** Both of 0.3.1's errors were
  true of live and visible on no screen, and a test suite cannot see live.
  `wp dcc-ledger money-check` walks every month and names any month,
  channel or cottage where net exceeds gross, or where money reached a rate
  with no nights under it.
- **A stay is selected on the dates it will actually use.** A payout-only
  stay takes its dates from the booking it is linked to, so the selection
  has to know them BEFORE the query runs. Coalescing a missing check-out to
  the check-in meant October never selected stay 134 at all, and three
  nights and $494.62 were in the year but in no month.
- **On the stay basis a direct booking's room revenue is its total, paid or
  not.** The accrual standard, and Rob's decision of 2026-10-29: a night
  stayed is revenue whether or not the money has arrived. Taking receipts
  instead divided October's $549.17 across 43 nights that had earned
  $6,027.30, for an ADR of $12.77. What has been paid is shown beside it.
  On the cash basis only money received counts, and the two bases must
  disagree — if they ever match, something is wrong.
- **A night divides a rate only with money under it, on both sides of the
  house.** Platform nights already followed this; direct nights now do too,
  counting only bookings that have a total.
- **Whether `mphb_total_price` includes tax or fees is unanswered.** It
  depends on how MotoPress is configured on this site and nothing in the
  code can tell. Room revenue excludes tax, so if a tax or fee sits inside
  that total the direct figures are overstated by it.
  `wp dcc-ledger direct-total` prints the shape of the booking meta — key
  names and counts only, never a value — so a person can settle it. Until
  someone does, treat the direct room revenue figure as resting on an
  unverified assumption and say so.
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

## The gap that was, and how it closed

A hand-typed booking linked to a cancelled stay as a copy had its money
counted once, on the stay — but its NIGHTS counted nowhere: a cancelled
stay contributes none, and the copy is excluded. Harmless while the screens
showed only money, wrong the moment they show occupancy. 0.3.0 closed it the
way Rob asked: `Stay_Rulings` records that such a stay really happened, on
stated evidence, and its nights and money then count once. Nothing on live
reaches this today.

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

    php dcc-ledger/tests/run-tests.php            # 1751 assertions
    php dcc-ledger/tests/mutations.php            # 105 deliberate breakages
    php dcc-ledger/tests/render-screens.php       # renders each tab to HTML
    node dcc-ledger/tests/layout-check.js         # 390/768/1440 + screenshots

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
    zip -rq "Ledger 0.3.4.zip" dcc-ledger -x 'dcc-ledger/tests/*'

The version in the file name must match `DCCL_VERSION` in `dcc-ledger.php`.
