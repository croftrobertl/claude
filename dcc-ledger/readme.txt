=== DCC Ledger ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.2.0
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

= What happens if the ledger guesses wrong about a moved guest? =

It shows you the guess rather than burying it. A probable move is counted once, listed on the Cleanup tab, and settled with one click either way. Rejecting it is remembered, so you are not asked again.

= Does the ledger ever change my bookings? =

No. MotoPress is only ever read. The ledger duplicates what it needs into its own tables and makes every change there, so the bookings Rob curated stay exactly as he left them.

= Does deactivating lose the data? =

No. Deactivating removes nothing. Deleting the plugin also removes nothing unless "Delete all ledger data" was ticked on the settings page first.

= Why is Booking.com's payout not treated as revenue? =

Because it is the guest's gross including the taxes Rob remits, and the commission is invoiced and debited separately. The reports show the payout, the commission and the tax inside the payout as three separate figures.

= Why does Vrbo show no tax rather than $0? =

Both of Vrbo's tax columns are 0 in every row in the exports. Whether Vrbo collects tax at all is unverified, so the reports say "not reported by Vrbo" rather than claiming the tax was zero.

== Changelog ==

= 0.2.0 =
* Every amount is now stored and added as a whole number of cents. A float cannot hold 0.1, so a column of them does not add up to what a person adding the same column by hand would get; the months of a year now tie to the year exactly, and so do the channels and the cottages.
* The upgrade converts the stored decimals in place, after copying every one of them into a backup table and only if every total agrees to the cent before and after. If one does not, it puts them back and says so.
* `wp dcc-ledger money-rollback` undoes the conversion in one line, restoring every decimal exactly as it was. The ledger then withholds figures, with a banner, rather than reporting the missing cents as zeroes.
* A stay's money split across a month end is split on whole cents, with the leftover going to the period holding the last night, so the parts always sum to the whole.
* Every date and timestamp the ledger writes is America/New_York, whatever the server or the site is set to. A correction at 00:10 on the first of a month belongs to the new month; a payout at 23:40 on the last day belongs to the old one. Both clock changes and New Year's Eve are tested.
* The layout is checked at 768 and 1440 pixels as well as 390.

= 0.1.9 =
* The fifteen bookings assumed paid before the exports were still being chased as unpaid. The cleanup item counted only the window rule's adjustment; it now counts whatever assumption stands against the booking, and puts the item back if that assumption is reversed.
* `wp dcc-ledger snapshot` prints the two rulings it applied — the pre-export assumptions and the refunds — instead of working them out silently.
* `wp dcc-ledger cleanup` counts only what needs a person. Information items are listed under their own heading with their own count.
* The Cleanup tab had the same fault: its "Needs A Person" tile counted the information items too. They now have a tile and a heading of their own.
* A MotoPress booking can carry one link, not two. Linking a booking that already answers for another stay is refused by name, and the link itself refuses it as well as the check in front of it.

= 0.1.8 =
* Rob's rulings of 2026-10-21, each written as a recorded, undoable batch and none of them touching MotoPress.
* Fifteen bookings that checked in before the platform exports begin are assumed paid, dated at check-in and labelled "Assumed Paid (Before The Exports)". They are counted and reported apart from the window rule, because no export covers that period and nothing there can be checked against a platform stay.
* Three bookings recorded as paid for more than their total are given a refund correction, dated at check-out, bringing each to exactly its total. The overpaid item then resolves.
* Every assumed payment standing against a booking is listed on the Imports tab with a Reverse This Assumption button. Reversing adds a second labelled correction; nothing is ever deleted.
* A Record A Refund button on an overpaid booking, with the overpayment filled in.
* A Link A Booking By Number field where a platform stay has no MotoPress booking, or a payout has no reservation row. The number is checked before anything is written: the booking must exist, be confirmed, and be in the same cottage.
* A hand-typed booking starting the same day in the same cottage as a payout whose reservation row has not arrived is offered as a probable copy. It is never linked on its own.
* A cancelled stay whose payout was refunded in full is no longer raised as still holding money. Refunds are netted first, and the one definition of a stay's money now lives in one place.
* An imported iCal block — the feed's own "not available", with no money on it — is reported as information rather than as a booking whose money is missing.
* An imported booking that starts after the latest export is reported as information too. It will match itself on the next import.

= 0.1.7 =
* Took back 0.1.6's rule that a cancelled platform stay the channel paid out for can be the original of a hand-typed copy. It was built on a premise that proved wrong, and it is the wrong default: calling a real stay a copy drops its money silently, while counting one twice shows up on the cleanup list.
* A cancelled stay that does carry money and has a booking on the same nights is raised as a question instead. Nothing is linked or reclassified for it, and the booking goes on counting as a real stay.
* The importer says so if an export ever states a nights count its own dates do not give.

= 0.1.6 =
* A platform stay the channel paid out for can be the original of a hand-typed copy even when the channel marks it cancelled. Two hand-typed copies were being flagged on the cleanup list but never linked, so their money counted as direct revenue on top of the platform payout for the same nights.
* A cancellation fee alone is still not money for a stay, so a cancelled reservation that was never paid out still cannot be the original of a copy.
* The cleanup list now uses the same rule the matcher does, so it never offers a link that will not be made.
* A cancelled stay that was paid out and typed in by hand is raised on the cleanup list, because its nights end up counted nowhere.

= 0.1.5 =
* A confirmed move is now found by the channel and cottage it was moved from, not by its dates alone. One of the four sat on nights its original cottage held two platform stays on — a double booking, which is what caused the move — so the old seed found two candidates and silently linked nothing, leaving that stay's money counted twice.
* A confirmed move whose platform stay cannot be found is raised on the cleanup list instead of being passed over.
* Link rows pointing at a stay that does not exist, which version 0.1.3 could write, are listed by the health check and removed on upgrade as a recorded, undoable batch. There is also a button for them on the Cleanup tab. Nothing is deleted silently.
* A link to a stay that does not exist is now refused outright.

= 0.1.4 =
* Fixed an upgrade that silently failed: an SQL comment inside a CREATE TABLE broke dbDelta's column diff, so an existing stays table never gained the guest_keys column while a fresh install was perfect. The table definitions are data now, so a comment cannot get into the SQL at all.
* A missing column in the ledger's own tables is reported with a banner naming it, instead of reading as an empty figure.
* A cancelled booking is never offered as a probable move. A dock block is not a stay.
* Fixed the seeding of the four confirmed moves, which read the wrong key. On a fresh install it would have linked none of them and assumed payment on all four.

= 0.1.3 =
* A moved guest now has to be the same guest: a move match needs the surname as well as the dates. Two parties booking the same weekend in different cottages is no longer read as a move.
* A probable move is a question, not a finding. It counts as a real stay, and is assumed paid like any other, until it is confirmed on the Cleanup tab. Rob's rule is that every confirmed booking really happened.
* Where MotoPress holds no name to compare, the booking is reported as "Possible Move, No Name To Compare" and is never guessed at.
* Surnames are matched as salted hashes computed inside the row loop. No name is stored, logged or displayed anywhere.
* The copy breakdown counts the same bookings as the copy total, each once, by the first signal that caught it, so the parts add up.
* `wp dcc-ledger snapshot --verbose` lists the booking ids skipped as copies and offered as moves. Ids only.

= 0.1.2 =
* A cancelled or expired platform stay is no longer treated as the original of a hand-typed copy. The money never came through that channel, so a direct booking on those dates is a real, separate stay.
* Moved-cottage copies are recognised: the same dates in a different cottage, where nothing is booked in the platform stay's own cottage. They are counted once, raised as "Probable Move Copy", and confirmed or rejected with one click.
* The snapshot refuses to write assumed payments until at least one platform reservations export has been imported, because until then nothing can tell a copy from a real booking.
* An assumed payment that turns out to sit on a copy is raised on the cleanup list and reversed with a second, labelled adjustment. It is never deleted.
* Copy detection lives in one place now, instead of three that had drifted apart.
* Import reports say what was skipped: payout separator rows, or rows with no confirmation code.

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
