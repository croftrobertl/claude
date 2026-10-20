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
