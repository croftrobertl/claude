=== DCC Ledger ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.1.1
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

One permanent money history for the eight Dora Canal Court cottages, built from the platform exports and read alongside MotoPress.

== Description ==

Every OTA booking reaches the site as an iCal import with a $0 price and no payments, so MotoPress alone cannot say what a guest paid, what the platform took, what the taxes were, or what reached the bank. DCC Ledger keeps that money in its own tables, imported from the Airbnb, Booking.com and Vrbo exports, and links each reservation to its MotoPress booking so nothing is counted twice.

**MotoPress is read-only to this plugin.** It never writes to a booking, a reserved room, a payment, a customer or their meta. An iCal sync can delete and recreate an imported booking at any time, which would erase anything written onto it.

**The ledger works on a copy.** Direct bookings and their payments are copied into the ledger's own tables and frozen there. Every correction — an assumed payment, a hand-typed copy, a manual fix — is a separate labelled row sitting on top of that copy, never an edit to it. Reports show the Original, the Ledger (Original plus corrections), or the Difference between them, so a correction is always visible as a correction. If MotoPress changes, the change is recorded as a new version beside the old one and raised on the cleanup list.

**No guest details are stored.** A ledger row is a channel, a confirmation code, a cottage and its dates. Names, emails, phones and addresses in the exports are never written anywhere — open the linked MotoPress booking when you need to know who it was.

= What it reports =

* Guest total, platform fees and commission, net payout
* Taxes in three separate buckets: remitted by the platform, collected inside a payout for Rob to remit, and not reported at all
* Nights, average nightly rate, occupancy across the eight cottages
* Median lead time, cancellations and cancellation fees, channel mix
* By month, season (read from MotoPress's own season posts), year or a custom range
* Counted either by stay dates, splitting a stay across a period boundary, or by payout date

= What it imports =

Seven formats, each recognised by its exact header row and refused if the columns have been edited:

1. Airbnb payouts
2. Airbnb reservations
3. Booking.com reservations
4. Booking.com payouts
5. Vrbo reservations
6. Vrbo payouts
7. Booking.com invoices (converted to CSV)

Every import has a dry run that reports the counts and writes nothing. Every import is a batch that can be undone, and undo removes exactly the rows that batch added.

== Installation ==

1. Upload the zip at Plugins → Add New → Upload Plugin.
2. Activate. The tables are created on activation; nothing is written on a normal page load.
3. Go to DCC → Ledger → Imports and run each export as a dry run first.

Over SSH:

    wp dcc-ledger snapshot --dry-run
    wp dcc-ledger snapshot
    wp dcc-ledger import /path/to/export.csv --dry-run
    wp dcc-ledger import /path/to/export.csv
    wp dcc-ledger link
    wp dcc-ledger batches
    wp dcc-ledger undo 7
    wp dcc-ledger cleanup

== Frequently Asked Questions ==

= Does the ledger ever change my bookings? =

No. MotoPress is only ever read. The ledger duplicates what it needs into its own tables and makes every change there, so the bookings Rob curated stay exactly as he left them.

= Does deactivating lose the data? =

No. Deactivating removes nothing. Deleting the plugin also removes nothing unless "Delete all ledger data" was ticked on the settings page first.

= Why is Booking.com's payout not treated as revenue? =

Because it is the guest's gross including the taxes Rob remits, and the commission is invoiced and debited separately. The reports show the payout, the commission and the tax inside the payout as three separate figures.

= Why does Vrbo show no tax rather than $0? =

Both of Vrbo's tax columns are 0 in every row in the exports. Whether Vrbo collects tax at all is unverified, so the reports say "not reported by Vrbo" rather than claiming the tax was zero.

== Changelog ==

= 0.1.1 =
* The ledger now works on a copy: direct bookings and their payments are snapshotted into frozen Original rows, and every correction is a separate labelled adjustment on top.
* Reports gain Original, Ledger and Difference views of the direct-booking figures.
* A refresh records a changed MotoPress row as a new version beside the old one, raises it on the cleanup list, and never touches a correction.
* Assumed payments are ledger adjustments rather than MotoPress payments. They skip hand-typed copies, overpaid bookings, cancelled bookings and anything outside the reconciled window.
* Paid now means a completed payment only. A refunded payment keeps its amount in MotoPress, so it is reported on its own line and never counted as paid.
* Corrected MotoPress keys against live: `_mphb_amount`, `_mphb_booking_id`, the `mphb-p-` status prefix, and the staff-only internal note.
* A missing MotoPress key now shows a banner naming it instead of a figure of zero.

= 0.1.0 =
* First release: the seven importers, MotoPress linking, the cleanup list, and the Overview, By Cottage, By Channel, Stays, Cleanup, Imports and Settings tabs.
