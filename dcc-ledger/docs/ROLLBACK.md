# DCC Ledger — Rollback

## If a report looks wrong

Nothing is lost. Undo the import that caused it:

    wp dcc-ledger batches          # find the batch number
    wp dcc-ledger undo 7

Undo removes exactly the rows that batch inserted and puts back exactly the
fields it filled in on rows that already existed. A row that was there before
the batch ran is never touched. It is tested both ways: the stays and lines
tables come back byte for byte.

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

## What a rollback cannot undo

Nothing done by this plugin is outside those tables, so there is nothing else to
undo. The 38 assumed payments added to MotoPress on 2026-10-18 were added by the
Website Director before this plugin existed; deactivating or deleting DCC Ledger
does not touch them. They are identifiable by meta `_dcc_assumed_paid` and
`_mphb_transaction_id` = `ASSUMED-PAID-20261018`.
