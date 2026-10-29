# DCC Ledger — Rollback

## First, the thing that cannot go wrong

MotoPress is never written to. Bookings, reserved rooms, payments, customers
and their meta are exactly as Rob left them, and no code path in this plugin
can change that — the test suite asserts it on every import, snapshot, link,
report and undo, and a mutation exists purely to prove the assertion bites.

The ledger works on a copy. Its Originals table holds what MotoPress contained
when it was copied, frozen; corrections are separate labelled rows on top. So
there are two intact originals behind any mistake: MotoPress itself, and the
ledger's copy of it.

## If a report looks wrong

Nothing is lost. Undo the batch that caused it:

    wp dcc-ledger batches          # find the batch number
    wp dcc-ledger undo 7

Undo removes exactly the rows that batch inserted — stays, money lines, copied
rows and corrections alike — and puts back exactly what it changed: a field it
filled in on an existing stay, and a copied row it superseded becomes current
again. A row that was there before the batch ran is never touched. It is tested
both ways: the tables come back byte for byte.

A snapshot is an ordinary batch, so undoing one removes its copies and the
assumed payments it generated, and leaves every earlier correction alone.

The same button is on the Imports tab.

## If the plugin misbehaves

Deactivate it. Plugins → DCC Ledger → Deactivate.

- Deactivating removes nothing. Every table and every row stays exactly as it is.
- Nothing about MotoPress changes, because nothing about MotoPress was ever
  written. Bookings, reserved rooms, payments and customers are untouched by
  design — the plugin has no code path that writes to them, and the test suite
  asserts that on every import, link, report and undo.
- The front end is unaffected: the plugin renders nothing outside wp-admin.

## If you want it gone entirely

Deleting the plugin still keeps the data, unless "Delete all ledger data when
the plugin is deleted" was ticked on the Settings tab first. That switch is off
by default and should stay off: this is years of money history, and once the
tables are dropped only a database backup or a fresh import of every export
brings it back.

To remove the data deliberately:

1. Settings tab → tick "Delete All Ledger Data When The Plugin Is Deleted" → Save.
2. Plugins → Delete.

## If an upgrade did not finish

The plugin checks its own tables against the definitions they were built from,
on activation and on every report load. If a column is missing it shows a red
banner naming it — `stays.guest_keys`, say — instead of figures, so a
half-finished upgrade can never read as an empty number.

Deactivating and reactivating runs the upgrade again. Nothing stored is
touched by it: an upgrade only ever adds columns.

## If the upgrade removed a link you wanted

Activating 0.1.5 removes link rows that point at a stay which does not exist —
rows version 0.1.3 could write when it failed to find the stay for one of
Rob's confirmed moves. That removal is a recorded batch like any other:

    wp dcc-ledger batches          # look for repair_bad_links
    wp dcc-ledger undo <id>

Undoing it puts every removed row back exactly as it was, bad stay id and all.
Undo restores the prior state; it does not improve on it.

## If a hand-typed copy was linked wrongly

A copy link can be removed on the Stays tab. The booking counts on its own
again straight away, and nothing was deleted — the platform stay and the
booking were only ever linked.

A booking whose platform stay is cancelled is never linked automatically,
whatever money that stay carries. If the guest cancelled on the platform and
booked direct, the booking is a real stay and its money is real direct
revenue — that is Rob's 5584 rule, and 8415 and 9136 on live.

## If the ledger calls a real stay a copy

It should not, by design: a booking counts as a real stay until a person says
otherwise, and only a confirmation code, the same cottage on the same dates, or
somebody's own confirmation makes it a copy. A probable move is only ever a
question.

If one is wrong anyway, reject it on the Cleanup tab, or remove its copy link
on the Stays tab. The booking counts on its own again at once. Nothing was
deleted at any point; the platform stay and the booking were only ever linked.

## If a copy was judged wrongly

Nothing needs rolling back. A probable move is a guess the ledger shows you:
confirm it, and it is linked; reject it, and the decision is recorded and the
booking counts on its own again. Either answer can be changed later — a
confirmed link outranks an earlier rejection, and removing the link brings the
guess back.

If an assumed payment turns out to sit on a copy, the Cleanup tab reverses it:
that writes a second, labelled adjustment cancelling the first. The assumption
is never deleted, so the record always shows both what was assumed and that it
was taken back.

## If one of Rob's rulings was wrong

The fifteen pre-export assumptions and the three refunds of 2026-10-21 are
written by the snapshot as one recorded batch, so there are two ways back and
neither deletes anything.

To take back the whole set, undo that batch on the Imports tab, or:

    wp dcc-ledger batches
    wp dcc-ledger undo N

To take back one assumption, use **Reverse This Assumption** beside it in
"Assumed Payments Standing" on the Imports tab. That writes a second, labelled
adjustment cancelling the first; the pair nets to zero and both halves stay on
the record. There is no way to delete an assumption, by design.

A refund recorded by hand is an adjustment like any other: remove it from the
Stays tab if it was wrong, and the booking goes back to reading as overpaid,
which puts its cleanup item back on the list.

## If a booking was linked to the wrong one by number

Remove the link on the Stays tab. The platform stay and the booking count on
their own again at once; nothing was copied or deleted, only linked. The
cleanup item the link cleared comes back, because it is worked out fresh each
time the list is drawn.

## If a booking should be linked somewhere else

A booking carries one link, so the ledger refuses a second one rather than
choosing between them. To move a link, remove the existing one on the Stays
tab first, then make the new one. Nothing is lost in between: both the
platform stay and the booking simply count on their own until the new link is
made, and any cleanup item that the old link cleared comes back while they do.

## If the move to whole cents needs undoing

0.2.0 stores every amount as an integer number of cents. Before it converted
anything it copied each decimal cell into a backup table, and that copy is
never overwritten — not even by running the conversion again.

One line puts it all back:

    wp dcc-ledger money-rollback

Every decimal column returns to exactly the value it held, down to a cell
that was empty staying empty. The ledger then refuses to show figures, with
a banner saying the money is not in cents, until either

    wp dcc-ledger money-check

converts it again, or 0.1.9 is reinstalled. The refusal is on purpose: with
the cents gone, a ledger still reading them would report every figure as
zero, and a zero that means "missing" is worse than no figure at all.

Nothing in MotoPress is touched by any of this, in either direction.

## If a figure looks a cent out

It should not be, and that is testable rather than arguable: the months of a
year now add up to the year exactly, and so do the channels and the
cottages. `wp dcc-ledger money-check` re-runs that proof over the live data
and names any group that does not tie.

If one does not tie, do not adjust anything to make it. Send the output,
and the month it names, and leave the data as it stands.

## If a stay was ruled as stayed and should not have been

The ruling sits beside the platform's cancelled status, never instead of it,
and nothing about the stay itself was changed. Take it back with
**Take That Ruling Back** on the Cleanup tab. The nights and money leave the
figures again at once, the question returns to the list, and the record
keeps both the ruling and its withdrawal — including the reason that was
given for it.

## If the booking pace history has a gap

Leave it. A night the recorder missed is reported as missing on purpose: the
position on that date is not knowable afterwards, and filling it in from
today's bookings would show what survived rather than what stood. A month is
charted only when every reading on its curve exists, so a gap costs that
month's chart and nothing else.

Recording is a daily WP-Cron event. If gaps are frequent, cron is not firing
reliably on the host — that is worth fixing, but nothing in the ledger is
wrong meanwhile.

## If the money commands cannot be found

Both spellings work from 0.3.0:

    wp dcc-ledger money-check
    wp dcc-ledger money_check

Before 0.3.0 only the underscored form was registered, while every document
said the hyphen. If a hyphenated command errors, the plugin on that site is
older than 0.3.0 — use the underscore, and upgrade.

## If a rate looks wrong

Two rules hold over every figure, and they are checked over the real data
rather than only in the tests:

    wp dcc-ledger money-check

It names any month, channel or cottage where net revenue exceeds gross, and
any month where money with no nights under it reached a rate. Both were real
errors on live before 0.3.1, and neither was visible on a screen.

If a line comes back with `!!`, send the output and change nothing. A rate
that is wrong is a definition that is wrong, and the fix belongs in the
definition, not in the data.

## If a payout-only stay has the wrong nights

A payout that arrives before its reservation row has no nights of its own.
Linked to a MotoPress booking, it takes that booking's dates; the link is
what carries them, so removing the link on the Stays tab puts its nights
back to unknown and takes its money out of every rate again. Nothing in
MotoPress changes either way — those dates are read, never written.

## What a rollback cannot undo

Nothing done by this plugin reaches outside its own tables, so there is nothing
else to undo. Assumed payments are ledger adjustments, not MotoPress payments:
undoing their batch removes them from the ledger and changes nothing in
MotoPress, because nothing was ever put there.
