# DCC Ledger 0.1.0 — Staging Checklist

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

## 2. Confirm the MotoPress meta keys (do this before trusting any money figure)

Four meta keys could not be verified from here and are the ones the direct-booking
figures rest on. Check each against staging's real data:

      wp db query "SELECT meta_key, COUNT(*) FROM portal_postmeta
                   WHERE meta_key IN ('mphb_total_price','mphb_amount','mphb_note','_dcc_assumed_paid')
                   GROUP BY meta_key"

      wp db query "SELECT post_type, post_status, COUNT(*) FROM portal_posts
                   WHERE post_type = 'mphb_payment' GROUP BY post_type, post_status"

- [ ] `mphb_total_price` returns a count close to the number of bookings.
- [ ] `mphb_amount` returns a count close to the number of payments.
- [ ] `mphb_payment` posts exist with status `completed`.
- [ ] `_dcc_assumed_paid` returns 38 — the assumed payments added on 2026-10-18.

If any of those is empty or named differently, STOP and tell me the real key.
They are all constants at the top of `includes/class-mphb-reader.php`; the fix
is one line each, but a wrong key silently reports $0 rather than failing.

## 3. Dry run every file, in this order

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

A dry run writes nothing at all — no stays, no lines, not even a batch row.

## 4. Import for real

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
- [ ] Hand-typed copies found: up to 14, of which the moved-cottage ones
      (7278, 12443, 12447, 17462) will NOT be linked automatically — they are
      offered on the Cleanup tab for a one-click confirm.

Matching writes only to the ledger's links table. It never writes to MotoPress.

## 6. Work the cleanup list

      wp dcc-ledger cleanup

Expect to see, among others:

- [ ] `A Payout With No Reservation Row` for Booking.com 5722711078.
- [ ] `A Hand-Typed Copy That Carries A Payment` for 8104 ($333.00) and
      7278 ($388.50).
- [ ] `A Booking Paid For More Than Its Total` for 7983, 7989 and 10465.
- [ ] `Stayed, Platform Refunded, Nothing Collected` for the Airbnb stay behind
      17462.
- [ ] Every Booking.com invoice reconciles. Rob's figures say all 40 do, at
      $4,071.55 commission, of which $37.50 is Crofty Bear and excluded — so
      the ledger should show **$4,034.05** across 39 invoices. If any invoice
      is red, send me its number.

Confirm the moved-cottage copies with the "Link As A Copy" button, then
re-check the figures: each confirmation should reduce the night count, because
it stops the stay being counted twice.

## 7. Check the figures against something Rob already knows

- [ ] Pick one month and read the Overview with **By Stay Dates**, then with
      **By Payout Date**. The two should differ, and the difference should be
      explainable by when the money moved.
- [ ] Compare one month's Booking.com commission against that month's invoice.
- [ ] Compare one Airbnb payout in the ledger against the bank statement line.
- [ ] Check that the direct-booking totals split into Recorded and Assumed, and
      that the assumed figure for the window is in the region of $60,348.22.

## 8. Only then, live

- [ ] Back up live.
- [ ] Install and activate the same zip.
- [ ] Repeat steps 3 to 6 on live, dry run first.
- [ ] Settings tab: leave "Delete all ledger data when the plugin is deleted"
      **off**.
