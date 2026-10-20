# DCC Ledger 0.1.2 — Staging Checklist

> **Order matters, and it changed in 0.1.2.** Import the platform exports
> BEFORE taking the snapshot. Until the platform stays exist, nothing can tell
> a hand-typed copy from a real direct booking, and an assumed payment is never
> removed quietly once written. The plugin now refuses to write assumed
> payments until at least one reservations export is in, so the old order fails
> safe rather than silently wrong — but the right order is still the right
> order.
>
> **Upgrading the existing staging install (7 import batches, no snapshot):**
> deactivate, upload 0.1.2, activate. The tables are unchanged. Go straight to
> step 4, since the exports are already imported.

Run every step on staging. Nothing goes to live until Rob has read the reports
on staging and said yes.

## Before you start

- [ ] Take a database backup of staging (UpdraftPlus, or a cPanel SQL dump).
- [ ] Confirm staging's MotoPress data is a recent copy of live. The ledger
      reads MotoPress for direct-booking money, so stale data gives stale
      figures.
- [ ] Have the seven exports ready as `.csv`, unedited. The format is detected
      from the header row; a file whose columns were touched is refused.

## 1. Install

- [ ] Plugins → Add New → Upload Plugin → `dcc-ledger.zip` → Activate.
- [ ] Check that five tables now exist:

      wp db query "SHOW TABLES LIKE '%dcc_ledger%'"

      Expect: `portal_dcc_ledger_stays`, `_lines`, `_links`, `_batches`,
      `_reviews`.
- [ ] DCC → Ledger loads, and every tab opens.

## 2. Confirm MotoPress still looks as expected

The plugin now checks this itself, on activation and on every report load: if a
key or status is missing it shows a banner naming it **instead of figures**, so
a wrong spelling can no longer read as $0. Confirm the banner is absent, and
sanity-check the counts:

      wp db query "SELECT meta_key, COUNT(*) FROM portal_postmeta
                   WHERE meta_key IN ('mphb_total_price','_mphb_amount','_mphb_booking_id','mphb_note','_mphb_booking_internal_notes')
                   GROUP BY meta_key"

      wp db query "SELECT post_status, COUNT(*) FROM portal_posts
                   WHERE post_type = 'mphb_payment' GROUP BY post_status"

- [ ] No red banner at the top of DCC → Ledger.
- [ ] `mphb_total_price` ≈ 428 rows.
- [ ] `_mphb_amount` and `_mphb_booking_id` ≈ 95 rows each.
- [ ] Payment statuses come back prefixed (`mphb-p-completed`, `mphb-p-refunded`,
      and so on), totalling 95.
- [ ] `_dcc_assumed_paid` returns **nothing** — those 38 payments were removed
      from live on 2026-10-19, and the ledger records assumed payments as its
      own adjustments instead.

## 3. Dry run every export, in this order

Order matters only in that reservations files fill in what payout files leave
blank. Either order works; this one produces the fewest cleanup items.

      wp dcc-ledger import airbnb-reservations.csv --dry-run
      wp dcc-ledger import airbnb-payout.csv       --dry-run
      wp dcc-ledger import bookingcom-reservations.csv --dry-run
      wp dcc-ledger import bookingcom-payout.csv       --dry-run
      wp dcc-ledger import bookingcom-invoices.csv     --dry-run
      wp dcc-ledger import vrbo-reservations.csv   --dry-run
      wp dcc-ledger import vrbo-payout.csv         --dry-run

For each one, check:

- [ ] The format line names the file you meant to import.
- [ ] `Crofty excluded` is non-zero on every file that contains Crofty Bear
      rows, and zero on the ones that do not.
- [ ] `Unknown cottage` is **0**. Anything above zero means a listing title or
      an id the map does not know — send me the count and the file, do not
      proceed.
- [ ] `Malformed` is **0**.
- [ ] Any warnings printed are expected (a payout total that disagrees with its
      rows is worth reading out loud).
- [ ] `Skipped` now says what it skipped. On the Airbnb reservations export,
      expect the bulk of it to be `payout separator rows` — the
      "Payout,,,,,,," lines Airbnb interleaves between payout groups, which are
      not reservations. Any `rows with no confirmation code` are enquiries or
      requests that were never accepted, and never became a stay.

A dry run writes nothing at all — no stays, no lines, not even a batch row.

## 4. Import the exports for real

      wp dcc-ledger import airbnb-reservations.csv
      …and so on, same order

- [ ] Each import ends with `Imported as batch N`. Note the batch numbers.
- [ ] Run each file a second time and confirm it reports `New stays: 0` and
      `New money lines: 0`. A re-import must change nothing.

## 5. Match to MotoPress

      wp dcc-ledger link

Rob measured these shapes on live, so expect roughly:

- [ ] Airbnb: about 30 of 35 stays link by code.
- [ ] Booking.com: about 61 of 69 OK stays link on exact dates.
- [ ] Vrbo: about 30 of 33 Booked stays link on exact dates.
- [ ] Hand-typed copies linked: the certain ones (a code in a note, or the same
      cottage and dates). The four moves Rob already confirmed — 7278, 12443,
      12447 and 17462 — are linked automatically and marked reviewed, because
      he decided them on 2026-10-18.
- [ ] Any other probable move is NOT linked. It is counted as a copy in the
      figures and offered on the Cleanup tab with both answers: confirm it, or
      say the two really are separate stays.

Matching writes only to the ledger's links table. It never writes to MotoPress.

## 6. Snapshot MotoPress — dry run first

This is the copy. MotoPress is only read; the ledger writes to its own tables.
It runs after the imports and after the matcher, so copy detection has
everything it needs.

      wp dcc-ledger snapshot --dry-run

- [ ] **Assumed payments: 38 bookings, $60,348.22.** These are the two numbers
      to check. If either differs, STOP and send me the output.
- [ ] `Skipped, a copy` is **15**, broken down on the next line by how each was
      found. Expect roughly 10 by cottage and dates, 2 by a code in a note, and
      3 as probable moves. (15 rather than 14 because 19667, the second
      Boathouse week, is a copy whose stay checks out in October — outside the
      window, so it has no assumed payment either way and cannot move the
      total.)
- [ ] `Skipped, overpaid` is 3 — bookings 7983, 7989 and 10465, which are
      recorded as paid more than their total and are never topped up.
- [ ] 5584 is NOT among the copies. It carries the code of a cancelled Vrbo
      stay, and a cancelled stay never produced money through that channel, so
      5584 is a real stay and IS assumed paid.
- [ ] Nothing is reported as changed, because nothing has been copied yet.

Then take it for real:

      wp dcc-ledger snapshot

- [ ] The same figures come back, and it ends with `Snapshot taken as batch N`.
- [ ] Run it a second time: every count must be 0. A repeat snapshot copies
      nothing and adds no second assumed payment.

## 7. Work the cleanup list

      wp dcc-ledger cleanup

Expect to see, among others:

- [ ] `A Payout With No Reservation Row` for Booking.com 5722711078.
- [ ] `A Hand-Typed Copy That Carries A Payment` for 8104 ($333.00) and
      7278 ($388.50).
- [ ] `A Booking Paid For More Than Its Total` for 7983, 7989 and 10465.
- [ ] `Stayed, Platform Refunded, Nothing Collected` for the Airbnb stay behind
      17462.
- [ ] Any `Probable Move Copy` items are worked through with Rob. Confirming
      one links it; rejecting one records the decision, so it is never asked
      about again and the booking counts on its own from then on.
- [ ] No `Assumed Payment On A Copy` items remain. If one appears, reverse it
      with the button: that records a second, labelled adjustment cancelling
      the first. Nothing is ever deleted.
- [ ] Every Booking.com invoice reconciles. Rob's figures say all 40 do, at
      $4,071.55 commission, of which $37.50 is Crofty Bear and excluded — so
      the ledger should show **$4,034.05** across 39 invoices. If any invoice
      is red, send me its number.

Confirm the moved-cottage copies with the "Link As A Copy" button, then
re-check the figures: each confirmation should reduce the night count, because
it stops the stay being counted twice.

## 8. Check the figures against something Rob already knows

- [ ] Pick one month and read the Overview with **By Stay Dates**, then with
      **By Payout Date**. The two should differ, and the difference should be
      explainable by when the money moved.
- [ ] Compare one month's Booking.com commission against that month's invoice.
- [ ] Compare one Airbnb payout in the ledger against the bank statement line.
- [ ] Check that the direct-booking figures split into Due, Recorded, Assumed
      and Refunded, and that the assumed figure for the window comes to
      $60,348.22.
- [ ] Switch the Direct Bookings control through **Original**, **Ledger** and
      **Difference**. Original must show only what MotoPress recorded; Ledger
      must be Original plus the corrections; Difference must be the corrections
      alone, and Original + Difference must equal Ledger.

## 9. Prove the original is safe

The whole point of the copy is that Rob's data survives a mistake in the ledger.

- [ ] Note a batch number from step 3 or 5, then `wp dcc-ledger undo N`, check
      the figures move, and re-run the import or snapshot. Nothing in MotoPress
      changes at any point.
- [ ] Change a booking's total in MotoPress on staging, run
      `wp dcc-ledger snapshot` again, and confirm it reports **1 changed**, the
      cleanup list raises "MotoPress Changed After The Ledger Copied It", the
      old version is still there under the Original view, and no correction was
      touched.

## 10. Only then, live

- [ ] Back up live.
- [ ] Install and activate the same zip.
- [ ] Repeat steps 2 to 8 on live, in that order, dry run first.
- [ ] Settings tab: leave "Delete all ledger data when the plugin is deleted"
      **off**.
