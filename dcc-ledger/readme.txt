=== DCC Ledger ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.3.5
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

= 0.3.5 =
* **`wp dcc-ledger direct-tax` is split by booking status, confirmed first.** Only a confirmed booking reaches a figure; a cancelled one is a dock block or a scrapped reservation and its tax is in nothing. Counting every status together answered 156 bookings listing a room tax against a hand count of 76 over confirmed bookings — the two agreed, and the report made that impossible to see. The confirmed line is now marked as the one to compare a hand count against, with every status added up at the end.
* The status comes from the frozen Original, so it is the status the figures were computed against rather than whatever MotoPress holds at the moment the command runs.

= 0.3.4 =
* **The price breakdown is a JSON string on this site, and 0.3.3 read it as a serialized PHP array.** It found nothing in any of them, so all 267 direct bookings were reported as having an unknown tax and every one of them was out of every rate. The reader now decodes JSON — `rooms[].taxes.room.total`, plus the service and fee tax where either is non-zero — and still reads a serialized array for a site that stores one, with every class forbidden so stored data can never become an object.
* **A tax bucket this reader does not know now refuses the whole reading.** Reading an unfamiliar bucket as nothing would overstate room revenue by its value, which is a wrong figure rather than a missing one. The three buckets live has are the room, its services and its fees.
* A tax bucket that lists its parts instead of stating a total is read by adding the parts, and every room on a multi-room booking is counted.
* The fixtures now carry the breakdown in the exact JSON shape counted on live, and a mutation feeds the reader a JSON string — the case that slipped through 0.3.3.

= 0.3.3 =
* **The months came to a cent or three more than the year.** Each period rounded its own share of a stay's money. Two nights of an odd number of cents are x.5 each, and rounding both halves away from zero rounds both up. Every period now reads the same running total — the money earned by the end of its last night, less the money earned by the end of the night before its first — so consecutive periods cancel each other's rounding and any set of periods covering a stay sums to it exactly, whatever the periods are.
* **A direct booking's total includes room tax on this site, and room revenue excludes tax.** Established by reading live on 2026-10-30: the price breakdown is on 281 booking rows, 76 of 117 confirmed bookings sampled list room taxes, and the breakdown's total agrees with the booking total on 116 of the 117. Direct room revenue is now the breakdown's total less its taxes, frozen at snapshot time beside the Original.
* **A booking with no readable breakdown has an UNKNOWN tax, never a tax of zero.** Its money stays in the money figures, it is named on screen with its count, nights and dollars, and it is out of room revenue and out of every rate. A total that may hold tax is a wrong room-revenue figure rather than a missing one.
* **Booking.com's gross room revenue was reading $0 wherever its payout had not arrived.** A Booking.com reservation row states its Final amount as room sales and its payout file states the same money again as a guest total; gross read only the guest total, so an unpaid Booking.com stay contributed nothing to gross while its nights went on dividing the rate. Gross now takes whichever of the two each stay actually has, counted once — the choice the copy detector has made since 0.1.0, for the same reason. Found by the audit, not by a person.
* `wp dcc-ledger money-check` gained a fifth rule: **tax comes out of a total, never into it** — direct room revenue is never above what the guests were billed.
* New: `wp dcc-ledger direct-tax` reports how many direct bookings the ledger could read a tax for, how many it could not and why, and how much tax was taken out. Counts and money only.

= 0.3.2 =
* **The months stopped adding up to the year.** A payout-only stay linked to a booking that crosses a month end was selected for the first month and not the second: the query coalesced its missing check-out to its check-in, so October lost three nights and $494.62 that the year still held. Stays are now selected on the dates they will actually use, including dates from a linked booking.
* **October's rates divided receipts by every night.** 43 nights that had earned $6,027.30 were divided into the $549.17 that had come in, giving an ADR of $12.77. On the stay basis a direct booking's room revenue is now its booking total, paid or not — the accrual standard. What has been paid is shown beside it. The cash basis still counts only money received.
* A direct night only divides a rate when its booking has a total, the mirror of the rule platform nights already followed.
* `wp dcc-ledger money-check` gained two more rules over the real data: **no nights in a rate without money**, and **the months add up to the range** — eleven figures across every month, to the cent.
* New: `wp dcc-ledger direct-total` prints every meta key a MotoPress booking carries, with how many bookings carry it and whether its values are plain numbers. Key names and counts only, never a value. It is there to settle whether this site's booking total includes tax or fees, which decides whether the total is room revenue — a question the code cannot answer about itself.

= 0.3.1 =
* **Net revenue was wrong for Booking.com, and showed as a net ADR above the gross one.** Net was taken as the payout — but a Booking.com payout carries the tax Rob has to remit, and its commission is invoiced separately rather than deducted, so net was overstated by both. Net is now one definition on every channel: gross room revenue, less commission and fees, with tax inside neither figure. For Airbnb and Vrbo that lands on the payout, because those platforms deduct their fee before paying.
* A refund now reduces gross room revenue as well as net, the way it would in any set of books. A resolution or an adjustment is not room revenue and is in neither; both stay visible in net payout, which is the cash that moved.
* **Money with no nights under it is out of every rate.** A payout whose reservation row has not arrived was putting its whole amount into ADR and RevPAR with nothing underneath. Where such a stay is linked to a MotoPress booking it now takes that booking's dates — read from MotoPress, never written to — and its money splits across the month end by those nights. Unlinked, its nights are unknown: it stays out of both sides of every rate, and the screen names it and says its tax and commission are unknown too, not zero.
* `wp dcc-ledger money-check` now also runs those two rules over the stored data, month by month, and names anything that fails: net is never above gross for any month, channel or cottage, and no money is counted into a rate without nights.
* The Channel tab shows net revenue beside net payout, and says why they are not the same figure.

= 0.3.0 =
* `wp dcc-ledger money-check` and `money-rollback` answer to the names every document gives them. Until now only the underscored spellings were registered, so the line a person would copy at the worst possible moment — the rollback — errored out. Both spellings work, and both are tested by the name a person types.
* Occupancy, ADR and RevPAR — each shown gross and net, never one alone — plus length of stay, lead time and channel mix. Every figure carries its definition and its date range, and the nights it divides by.
* A night whose money has not arrived is counted in occupancy but left out of both sides of the rate. In the denominator alone it would read as a discount nobody gave.
* Lead time is reported separately for platform and direct bookings. The direct figure is measured from the date the booking was entered in MotoPress, which for one typed in later is not the day the guest booked, and it says so.
* Booking pace is recorded once a night from now on, never reconstructed: a curve drawn from today's bookings shows what survived to today, not what stood. A missed night is left as a gap, a month is charted only once every reading on its curve exists, and until then the screen says when the first complete month will be.
* A cancelled platform stay with a hand-typed copy attached can be ruled as really stayed, on the evidence of money received or Rob's own word, with the reason recorded. Its nights and money then count once. The ruling is revoked, never deleted.
* Every headline figure on the Overview, and every channel on the Channel tab, opens to the rows it was added up from.
* A figure with nothing behind it reads "Unknown", never zero.
* The upgrade from 0.1.9 straight to 0.3.0 is proven: the move to cents, its proof and its rollback all work from the 0.1.9 shape, in one activation.

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
