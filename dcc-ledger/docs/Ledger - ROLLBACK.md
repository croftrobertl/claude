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

## What a rollback cannot undo

Nothing done by this plugin reaches outside its own tables, so there is nothing
else to undo. Assumed payments are ledger adjustments, not MotoPress payments:
undoing their batch removes them from the ledger and changes nothing in
MotoPress, because nothing was ever put there.
