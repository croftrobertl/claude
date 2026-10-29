# DCC Ledger 0.3.0 — Staging Checklist

> **Order matters, and it changed in 0.1.2.** Import the platform exports
> BEFORE taking the snapshot. Until the platform stays exist, nothing can tell
> a hand-typed copy from a real direct booking, and an assumed payment is never
> removed quietly once written. The plugin now refuses to write assumed
> payments until at least one reservations export is in, so the old order fails
> safe rather than silently wrong — but the right order is still the right
> order.
>
> **Upgrading the existing staging install (14 import batches, links in
> place, no snapshot):** deactivate, upload the latest Ledger zip, activate.
> Then, before
> anything else, confirm the upgrade finished:
>
>     P=$(wp db prefix)
>     wp db query "SHOW COLUMNS FROM ${P}dcc_ledger_stays LIKE 'guest_keys'"
>     wp db query "SHOW COLUMNS FROM ${P}dcc_ledger_originals LIKE 'guest_keys'"
>
> Both must return a row. 0.1.3's upgrade failed to add `guest_keys` to
> `stays` — an SQL comment inside the CREATE TABLE broke dbDelta's column
> diff — and that is the blocker 0.1.4 fixes. If either comes back empty the
> plugin now says so itself, with a red banner naming `stays.guest_keys` in
> place of figures; deactivating and reactivating runs the upgrade again.
>
> The exports are already imported on staging and the keys already filled in,
> so there is no need to re-import. Re-run step 5 (the matcher), then step 6.
> The column added by hand during the 0.1.3 testing is exactly what the
> upgrade now adds, so leave it as it is.
>
> **0.1.5 also tidies up after 0.1.3.** Activating removes any link row
> pointing at a stay that does not exist — staging has three, ids 138, 139 and
> 140 — as a recorded batch on the Imports tab, which can be undone there like
> any import. Nothing is deleted silently. Check it happened:
>
>     wp dcc-ledger batches
>
> - [ ] A batch of kind `repair_bad_links` is listed, having read 3 rows.
> - [ ] The links table now holds the 4 correct move links and no bad ones:
>
>           P=$(wp db prefix)
>           wp db query "SELECT l.id, l.stay_id, l.mphb_booking_id, l.method
>                          FROM ${P}dcc_ledger_links l
>                          LEFT JOIN ${P}dcc_ledger_stays s ON s.id = l.stay_id
>                         WHERE s.id IS NULL"
>
>       This must return nothing. If it returns rows, the Cleanup tab has a
>       button for them.

Run every step on staging. Nothing goes to live until Rob has read the reports
on staging and said yes.

> **Upgrading live from 0.1.8 to 0.1.9.** This one fixes four things and
> writes nothing of its own. Deactivate, upload `Ledger 0.1.9.zip`, activate,
> and check nothing moved:
>
>     P=$(wp db prefix)
>     wp db query "SELECT COUNT(*) FROM ${P}dcc_ledger_links"      # 136
>     wp db query "SELECT COUNT(*) FROM ${P}dcc_ledger_reviews"    # 15
>     wp db query "SELECT type, COUNT(*), SUM(amount) FROM ${P}dcc_ledger_adjustments GROUP BY type"
>
> The three adjustment types should read 38 / $60,348.22, 15 / $35,333.00 and
> 3 / −$860.25, exactly as 0.1.8 left them. Then:
>
> - [ ] `wp dcc-ledger cleanup` ends with **0 items need a person**, and
>       prints "For information only (13)" with the blocks and
>       After The Latest Export grouped under it.
> - [ ] The Cleanup tab agrees: Needs A Person 0, For Information 13.
> - [ ] None of the fifteen pre-export bookings is listed as unpaid any more.
> - [ ] `wp dcc-ledger snapshot --dry-run` now prints **Assumed
>       pre-exports** and **Refunds recorded** among its figures, and
>       reports 0 new and 0 changed bookings.
> - [ ] On any by-number field, type a booking that is already linked — say
>       19664. It is refused by name: "already linked to Booking.com
>       6254502394". Nothing is written.

> **Upgrading live from 0.1.7 to 0.1.8.** Live holds batches 1–8 plus the
> links and reviews from 2026-10-21. An upgrade adds columns and never
> rewrites a row: every link you made and every item you marked reviewed is
> left exactly as it is, and the test suite asserts that. Deactivate, upload
> `Ledger 0.1.8.zip`, activate, then check the count has not moved:
>
>     P=$(wp db prefix)
>     wp db query "SELECT COUNT(*) FROM ${P}dcc_ledger_links"
>     wp db query "SELECT COUNT(*) FROM ${P}dcc_ledger_reviews"
>
> Nothing in 0.1.8 writes by itself. Rob's two rulings are applied by the next
> snapshot, as one recorded batch that can be undone from the Imports tab:
>
>     wp dcc-ledger snapshot --dry-run
>
> - [ ] It reports **15 assumed before the exports, $35,333.00**, and
>       **3 refunds, −$860.25**.
> - [ ] Then run it for real and confirm the same figures, as a new batch.
>
> **There are no platform exports before 2025.** Airbnb, Booking.com and Vrbo
> all start on 01/01/2025, so for anything earlier there is no platform stay
> to check a booking against — nothing there can be recognised as a
> hand-typed copy, and nothing can be reconciled to a payout. That is why the
> fifteen pre-2025 bookings are a list Rob named, not a rule the plugin works
> out, and why their money is counted and reported apart from the window
> rule's "Assumed Paid In Full" under its own label, "Assumed Paid (Before
> The Exports)". Treat the two figures as two figures.

## Before you start

- [ ] Take a database backup of staging (UpdraftPlus, or a cPanel SQL dump).
- [ ] Confirm staging's MotoPress data is a recent copy of live. The ledger
      reads MotoPress for direct-booking money, so stale data gives stale
      figures.
- [ ] Have the seven exports ready as `.csv`, unedited. The format is detected
      from the header row; a file whose columns were touched is refused.

## 1. Install

- [ ] Plugins → Add New → Upload Plugin → the latest `Ledger <version>.zip` → Activate.
- [ ] Check that all seven tables now exist:

      wp db query "SHOW TABLES LIKE '%dcc_ledger%'"

      Expect seven, with the site's own prefix: `dcc_ledger_stays`, `_lines`,
      `_links`, `_batches`, `_reviews`, `_originals` and `_adjustments`.
      (`_originals` and `_adjustments` arrived in 0.1.1.)
- [ ] DCC → Ledger loads, and every tab opens.

## 2. Confirm MotoPress still looks as expected

The plugin now checks this itself, on activation and on every report load: if a
key or status is missing it shows a banner naming it **instead of figures**, so
a wrong spelling can no longer read as $0. Confirm the banner is absent, and
sanity-check the counts:

Use the site's own table prefix, not `portal_` — staging's is `wpstg0_`. Get it
with `wp db prefix`, or let the shell fill it in:

      P=$(wp db prefix)

      wp db query "SELECT meta_key, COUNT(*) FROM ${P}postmeta
                   WHERE meta_key IN ('mphb_total_price','_mphb_amount','_mphb_booking_id','mphb_note','_mphb_booking_internal_notes')
                   GROUP BY meta_key"

      wp db query "SELECT post_status, COUNT(*) FROM ${P}posts
                   WHERE post_type = 'mphb_payment' GROUP BY post_status"

And the guest-name fields a move match needs:

      wp db query "SELECT meta_key, COUNT(*) FROM ${P}postmeta
                   WHERE meta_key IN ('mphb_first_name','mphb_last_name','mphb_guest_name')
                   GROUP BY meta_key"

- [ ] No red banner at the top of DCC → Ledger.
- [ ] `mphb_total_price` ≈ 428 rows.
- [ ] `_mphb_amount` and `_mphb_booking_id` ≈ 95 rows each.
- [ ] Payment statuses come back prefixed (`mphb-p-completed`, `mphb-p-refunded`,
      and so on), totalling 95.
- [ ] `_dcc_assumed_paid` returns **nothing** — those 38 payments were removed
      from live on 2026-10-19, and the ledger records assumed payments as its
      own adjustments instead.
- [ ] At least one of `mphb_first_name` / `mphb_last_name` / `mphb_guest_name`
      comes back with a healthy count. These are what a moved-guest match is
      made on. **If all three are empty, send me the real field names**: the
      figures will still be right, but every probable move will be reported as
      "no name to compare" instead of being matched.

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
- [ ] Any other probable move is NOT linked, and is NOT counted as a copy. It
      counts as a real stay — Rob's rule is that every confirmed booking
      really happened — and is offered on the Cleanup tab with both answers.
      Confirming the move links it as a copy and raises its assumed payment
      for reversal; rejecting it leaves the booking counting on its own.

Matching writes only to the ledger's links table. It never writes to MotoPress.

## 6. Snapshot MotoPress — dry run first

This is the copy. MotoPress is only read; the ledger writes to its own tables.
It runs after the imports and after the matcher, so copy detection has
everything it needs.

      wp dcc-ledger snapshot --dry-run

- [ ] **Assumed payments: 38 bookings, $60,348.22.** These are the two numbers
      to check. If either differs, STOP and send me the output.
- [ ] `Skipped, a copy` and its breakdown — by an existing link, by a code in
      a note, by cottage and dates — now **add up to the total**, because they
      count the same bookings. A second line gives the number of copies
      detected in all, which is larger: it includes copies outside the window
      and copies on bookings that are not confirmed.
- [ ] `Probable moves` is reported separately and is **not** part of the copy
      count. These are questions, not findings: each one counts as a real stay
      until you confirm it. **Expect 0 on staging.** 0.1.3 offered three —
      7078, 7155 and 11528 — but all three are cancelled in MotoPress, and a
      cancelled booking is a dock block, not a stay. If any other number comes
      back, send me the ids.
- [ ] **`Skipped, a copy` is 14, with 7278 among them** — run with
      `--verbose` and check. 7278 is among them because the seed looks for its
      platform stay by the channel and cottage Rob's ruling names, not by its
      dates alone: its original cottage held two stays on those nights — an
      Airbnb one and a Vrbo one, the double booking that caused the move — so
      a dates-only lookup found two candidates and linked nothing.
- [ ] **8415 and 9136 are NOT among the copies, and should not be.** Both are
      real direct stays. Their Booking.com reservations (5430432780 and
      5965741003) are CANCELLED with a Final amount of $0 and no commission,
      and neither appears in the payout export — so no money came through
      Booking.com. Those guests cancelled on the platform and booked and paid
      Rob directly, which is Rob's 5584 rule. Their $893.55 and $277.50 are
      direct revenue, and the ledger counts them as such.
- [ ] `A Cancelled Stay That Was Paid Out And Typed In By Hand` does **not**
      appear on the real data, and neither does `A Cancelled Stay With Money,
      And A Booking On The Same Nights`. Both need a cancelled reservation
      that the channel paid out for anyway, which Rob's exports do not
      contain. If one ever does appear, it is a genuine oddity worth reading:
      nothing is linked or reclassified by it, and the booking goes on
      counting as a real stay until somebody decides.
- [ ] 7278 is linked to the **Airbnb** stay in Cottage 32, never to the Vrbo
      one. The Vrbo stay keeps its own link to its own imported booking:

          P=$(wp db prefix)
          wp db query "SELECT stay_id, method FROM ${P}dcc_ledger_links WHERE mphb_booking_id = 7278"

- [ ] The 4 moves Rob confirmed (7278, 12443, 12447, 17462) appear under
      `by an existing link`, not as probable moves. They are linked in step 5
      whether or not their names match, because Rob decided them himself.
- [ ] No `Confirmed Move With No Platform Stay` items on the Cleanup tab. One
      of those means a confirmed move could not be linked, and its money is
      counting on top of the platform payout for the same nights.
      **This matters more on live than on staging**, where they were already
      linked: if the seeding fails on a fresh install, all four are assumed
      paid and the total comes out at 41 bookings and $61,851.22 instead of
      38 and $60,348.22. If you see that, stop and tell me.
- [ ] 6273 is **assumed paid**, not called a copy. It shares its dates with a
      stay in another cottage, but it is a different party.
- [ ] `Skipped, overpaid` is 3 — bookings 7983, 7989 and 10465, which are
      recorded as paid more than their total and are never topped up.
- [ ] 5584 is NOT among the copies. It carries the code of a cancelled Vrbo
      stay, and a cancelled stay never produced money through that channel, so
      5584 is a real stay and IS assumed paid.
- [ ] Nothing is reported as changed, because nothing has been copied yet.

Run it again with `--verbose` to see exactly which bookings were skipped as
copies and which are offered as moves, as booking ids only:

      wp dcc-ledger snapshot --dry-run --verbose

- [ ] Check the copy ids against your own list. No guest data is printed.

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
      one links it as a copy and raises its assumed payment for reversal;
      rejecting one records the decision, so it is never asked about again and
      the booking goes on counting as a real stay.
- [ ] Any `Possible Move, No Name To Compare` items are checked by hand. These
      are bookings that sit where a moved guest would sit, but MotoPress holds
      no name to compare. They count as real stays until you say otherwise.
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

## 10. Only then, live — done on 2026-10-21

Done on 2026-10-21, from 0.1.6, after it passed on staging. For the record:

- [x] Live backed up first: `live-db-pre-ledger-20261021-1427.sql.gz`.
- [x] Seven tables created. MotoPress unchanged before and after: 428
      bookings, 95 payments, no `_dcc_assumed_paid`.
- [x] All seven exports imported as batches 1–7, with Unknown cottage 0 and
      Malformed 0. A repeat dry run showed 0 new stays and 0 new lines.
- [x] Matcher: 29 by code, 91 by exact dates, 14 hand-typed copies. On a fresh
      install the four confirmed moves linked correctly — 7278→31, 12443→129,
      12447→130, 17462→1.
- [x] Snapshot taken as batch 8: **38 bookings, $60,348.22**, 14 copies,
      0 probable moves, 3 overpaid. A repeat assumed 0, reporting
      "Already adjusted: 38".
- [x] 39 Booking.com invoices reconciling to $4,034.05. 0 bad links.
- [x] 48 cleanup items for Rob. Uploaded exports deleted from the server.
- [x] Settings tab: "Delete all ledger data when the plugin is deleted" left
      **off**.

Upgrading live from here is deactivate, upload the latest zip, activate. The
ledger holds live data from batch 1 onwards, and an upgrade only ever adds
columns — see the note at the top of this file for what to check afterwards.

## 11. The 0.1.8 upgrade on live — Rob's rulings of 2026-10-21

Done on 2026-10-21, after staging. Links 136 and reviews 15 before and after,
unchanged. The rulings went in as **batch 9**: 15 bookings assumed before the
exports totalling $35,333.00, and 3 refunds totalling −$860.25, with 0 new and
0 changed bookings. MotoPress still 428 bookings and 95 payments, no
`_dcc_assumed_paid`. 19667 was linked to Booking.com 5722711078 as a copy and
all three of its items cleared. Validation refused 7983 (wrong cottage) and
999999 (no such booking). For the record, what was checked:

- [x] Back up live first, as always.
- [x] `wp dcc-ledger snapshot --dry-run` reports 15 assumed before the
      exports totalling $35,333.00, and 3 refunds totalling −$860.25. It
      should report 0 new bookings and 0 new payments — nothing in MotoPress
      has changed. **In 0.1.8 the command worked these out and did not print
      them**, so on the day they were read from `Snapshot::run(true)`
      directly; 0.1.9 prints both lines.
- [ ] Run it for real. The Imports tab shows a new batch; undoing it removes
      exactly those 18 corrections and nothing else.
- [ ] The Imports tab now shows four figures side by side: Assumed Payments
      ($60,348.22), Assumed Before The Exports ($35,333.00), Refunds Not In
      MotoPress (−$860.25), and Corrections In All. The first two are never
      added together on screen, and should not be in a report either.
- [ ] Each of the three refunded bookings — 7983, 7989, 10465 — now nets to
      exactly its total, and its "A Booking Paid For More Than Its Total"
      item has gone from the cleanup list.
- [ ] "Assumed Payments Standing" on the Imports tab lists every assumption
      with a **Reverse This Assumption** button. Reverse one, check the pair
      nets to zero and both halves are still listed, then press the button
      again on the reversal's booking — it refuses, because nothing is
      standing against it any more.
- [ ] On "A Payout With No Reservation Row" for 5722711078, type **19667**
      into **Link A Booking By Number**, choose *as a copy*, and press Link
      It. Three items should clear at once: the payout item, the unlinked
      platform stay, and "unpaid_past:19667".
- [ ] Try the same field with a booking number in another cottage. It is
      refused, by name, and nothing is written.
- [ ] The cleanup list is down to roughly nothing needing a person, plus two
      quiet information groups: the imported iCal blocks, and
      **After The Latest Export** — 12 bookings that check in from
      2026-10-22 onwards and will match themselves on the next import.
- [ ] MotoPress is still **428 bookings and 95 payments**, with no
      `_dcc_assumed_paid` anywhere.

## 12. The 0.1.9 upgrade on live — four fixes, nothing written

0.1.9 adds no rows of its own. Everything to check is at the top of this file,
under "Upgrading live from 0.1.8 to 0.1.9". For the record, what changed:

- The fifteen pre-export bookings are no longer chased as unpaid. If you ever
  reverse one of those assumptions, its item comes back — that is deliberate.
- `wp dcc-ledger snapshot` prints the two rulings it applied. Step 11's
  figures can now be read straight off the command, as that step always said.
- `wp dcc-ledger cleanup` and the Cleanup tab both count only what needs a
  person. Information items are grouped under their own heading.
- A booking already linked to a stay cannot be linked to a second one, by
  number or by any other path.

## 13. The 0.2.0 upgrade on live — money in cents, and the property clock

0.2.0 changes how money is stored. Back up first, as always, and read this
section before activating.

**What the upgrade does by itself.** Activating adds a cents column beside
each money column, copies every decimal cell into a backup table, converts
it, and then proves the conversion: every table's total, and every month and
channel within it, must agree to the cent before and after. If one does not,
the conversion undoes itself in the same request and the ledger goes on
reading decimals. Nothing is written to MotoPress at any point.

- [ ] Back up live, including the ledger's own tables.
- [ ] Deactivate, upload `Ledger 0.2.0.zip`, activate.
- [ ] `wp dcc-ledger money-check` ends with **Success** and reports
      **Rows still holding a decimal and no cents: 0**.
- [ ] The four figures are unchanged: assumed_paid 38 / $60,348.22,
      assumed_paid_pre_exports 15 / $35,333.00, refund_not_recorded
      3 / −$860.25, and the same grand total as before the upgrade.
- [ ] Links 136 and reviews 15, unchanged.
- [ ] MotoPress still 428 bookings and 95 payments.

**Checking it by hand, which is the point of the exercise.** Pick one month
— September 2026 is a good one, it has all three channels — and compare the
Ledger's figures for it with the export files themselves:

- [ ] Open the month on the Overview tab and note guest total, platform
      fees, net payout and room revenue.
- [ ] Add the same month up in the export spreadsheets.
- [ ] They agree to the cent. Not to the dollar — to the cent.
- [ ] Add the twelve months of 2025 and compare with the year. They tie.

**The way back out, if anything looks wrong:**

    wp dcc-ledger money-rollback

That puts every decimal back exactly as it was and stops the ledger reading
cents. It then refuses to show figures, with a banner saying why, until
either the conversion is run again (`wp dcc-ledger money-check`) or 0.1.9 is
reinstalled. That refusal is deliberate: a ledger reading cents that are no
longer there would report every figure as zero, and a zero that means
"missing" is the one thing this plugin exists to prevent.

**The clock.** Every date and timestamp the ledger writes is now
America/New_York, whatever the server or the WordPress site is set to. A
correction entered at 00:10 on the first of a month lands in the new month;
a payout at 23:40 on the last day lands in the old one.

- [ ] Enter a manual correction and check its date is today in Tavares.

## 14. The 0.3.0 upgrade — live goes from 0.1.9 straight to here

Live never ran 0.2.0, so this activation does everything 0.2.0 did and
everything 0.3.0 adds, in one go. That path is tested against a database
built in the 0.1.9 shape, not only against a 0.2.0 one.

**Back up live first, including the ledger's own tables.**

- [ ] Deactivate, upload `Ledger 0.3.0.zip`, activate.
- [ ] `wp dcc-ledger money-check` ends with **Success**, all four groups
      tie, and **0 rows hold a decimal and no cents**. The hyphen works now;
      `money_check` still does too.
- [ ] The figures are unchanged from before the upgrade: assumed_paid
      38 / $60,348.22, assumed_paid_pre_exports 15 / $35,333.00,
      refund_not_recorded 3 / −$860.25.
- [ ] Links 136 and reviews 15, unchanged.
- [ ] MotoPress still 428 bookings and 95 payments.
- [ ] `wp dcc-ledger money-rollback` restores every decimal and warns that
      figures are withheld; `wp dcc-ledger money-check` converts again and
      every figure is identical. **Do this on staging, not on live.**

**The metrics.** On the Overview, for a month you know well:

- [ ] Occupancy, ADR gross and net, RevPAR gross and net, length of stay,
      and both lead times are shown, each with its definition and the range
      beside it.
- [ ] ADR net is below ADR gross, and RevPAR below ADR. If either is the
      other way round, stop and tell me.
- [ ] Any figure with nothing behind it reads **Unknown**, never $0.00.
- [ ] Every headline figure opens to the rows behind it, over the same
      range, with a way back to the whole list.
- [ ] The Channel tab shows the mix by nights and by money, and each
      channel's row opens to its stays.

**Booking pace.** Nothing is drawn yet, and that is correct.

- [ ] The Overview says recording has begun, and names the first month that
      will have a complete curve — about six months out, because a curve
      starts 180 days before the month it describes.
- [ ] After a few days, it reports how many nights it has recorded.
- [ ] If a night is missed, it is named as a gap. It is never filled in.

**"This Really Stayed".** Nothing on live reaches this today, so test it on
staging by attaching a hand-typed booking to a cancelled platform stay that
carries money.

- [ ] The item appears, and offers the ruling with a note field.
- [ ] A ruling with no note is refused.
- [ ] Once ruled, the stay's nights and money appear in the figures, the
      item turns to information, and the ruling and its reason are shown.
- [ ] Taking it back returns the figures exactly to where they were.

**The hand reconciliation is yours.** Pick September 2026, add it up from
Rob's own export files on his Mac, and compare with the Overview for the
same month. Aggregates only; no guest data needs to leave that machine.
