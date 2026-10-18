<?php
/** The cleanup list, and invoice reconciliation. */

declare(strict_types=1);

use DCCL\Importer;
use DCCL\Issues;
use DCCL\Linker;
use DCCL\Repo;

T::group('Cleanup list');

dccl_seed_mphb();
foreach ([
    'airbnb-payout.csv', 'airbnb-reservations.csv',
    'bookingcom-reservations.csv', 'bookingcom-payout.csv',
    'vrbo-reservations.csv', 'vrbo-payout.csv', 'bookingcom-invoices.csv',
] as $file) {
    Importer::run(dccl_fixture($file), $file, false, 1);
}
T::group('Before matching has been run');

$unmatched = array_column(Issues::all(), 'key');
T::ok(in_array('handtyped:bookingcom:5555555555:9006', $unmatched, true), 'A platform stay also typed in by hand is raised before matching is run');
T::ok(in_array('ota_unlinked:bookingcom:5111111111', $unmatched, true), 'And every stay is unlinked at this point');

T::group('Cleanup list after matching');

Linker::run(1);

$items = Issues::all();
$keys  = array_column($items, 'key');

$has = static fn (string $key): bool => in_array($key, $keys, true);

T::ok($has('payout_no_reservation:bookingcom:5722711078'), 'A payout with no reservation row is raised');
T::ok($has('imported_no_stay:9005'), 'An imported booking with no ledger stay is raised');
T::ok($has('copy_payment:9006'), 'A hand-typed copy carrying a payment is raised');
T::ok($has('overpaid:9009'), 'A booking paid for more than its total is raised');
T::ok($has('unpaid_past:9012'), 'A past direct booking that is not fully paid is raised');
T::ok($has('clawback:airbnb:HMMOVED001'), 'The stayed-but-clawed-back case is raised');
T::ok($has('cancelled_money:bookingcom:5333333333'), 'A cancelled stay that still has money is raised');
T::ok($has('invoice:7003'), 'The invoice that does not reconcile is raised');
T::ok(!$has('invoice:7001'), 'An invoice that reconciles is not raised');
T::ok(!$has('invoice:7004'), 'The Crofty Bear invoice was never imported, so it cannot be raised');

T::group('Facts carry no guest details');

$json = (string) json_encode($items);
foreach (dccl_fixture_pii() as $needle) {
    T::ok(!dccl_has_pii($json, $needle), 'No "' . $needle . '" in the cleanup list');
}

T::group('The overpaid item states the facts and alters nothing');

$overpaid = null;
foreach ($items as $item) {
    if ($item['key'] === 'overpaid:9009') {
        $overpaid = $item;
    }
}
$overpaid_facts = $overpaid === null ? '' : implode(' ', $overpaid['facts']);
T::ok($overpaid !== null, 'The overpaid item exists');
T::ok(str_contains($overpaid_facts, '$100.00'), 'It names the amount over the total');
T::ok(str_contains($overpaid_facts, 'Nothing was capped or altered'), 'It says nothing was capped');

T::group('Unlinked platform stays');

T::ok($has('ota_unlinked:airbnb:HMMOVED001'), 'The moved stay is listed as unlinked');

$moved = null;
foreach ($items as $item) {
    if ($item['key'] === 'ota_unlinked:airbnb:HMMOVED001') {
        $moved = $item;
    }
}
$candidate_ids = $moved === null ? [] : array_column($moved['candidates'], 'id');
$position      = array_search(9011, $candidate_ids, true);
T::ok($position !== false, 'Its moved-cottage candidate is offered');
T::same('copy', $position === false ? '' : $moved['candidates'][$position]['method'], 'A move is offered as a copy, not a plain link');

T::group('Invoice reconciliation');

$invoices = Issues::invoices();
$by_number = [];
foreach ($invoices as $invoice) {
    $by_number[$invoice['number']] = $invoice;
}

T::same(3, count($invoices), 'Three invoices imported, Crofty excluded');
T::ok($by_number['7001']['reconciles'], 'Invoice 7001 reconciles');
T::same(90.00, $by_number['7001']['matched_commission'], 'Its matched commission equals the invoice');
T::ok($by_number['7002']['reconciles'], 'Invoice 7002 reconciles');
T::ok(!$by_number['7003']['reconciles'], 'Invoice 7003 does not');
T::same(110.00, $by_number['7003']['commission'], 'It charges 110.00');
T::same(120.00, $by_number['7003']['matched_commission'], 'The reservations matched to it come to 120.00');

T::group('Reviewing an item');

$open_before = count(Issues::open());
Repo::mark_reviewed('overpaid:9009', 'Checked Clover — a refund was issued.', 1);
T::same($open_before - 1, count(Issues::open()), 'A reviewed item leaves the open list');

$all = Issues::all();
$found = null;
foreach ($all as $item) {
    if ($item['key'] === 'overpaid:9009') {
        $found = $item;
    }
}
T::ok($found['reviewed'], 'It is still listed, marked reviewed');
T::same('Checked Clover — a refund was issued.', $found['review_note'], 'With its note');

Repo::unmark_reviewed('overpaid:9009');
T::same($open_before, count(Issues::open()), 'And it can be put back on the list');

T::group('Confirming a move clears its item');

Repo::link(Repo::stay_id('airbnb', 'HMMOVED001'), 9011, 'copy', 1);
$keys_after = array_column(Issues::all(), 'key');

T::ok(!in_array('ota_unlinked:airbnb:HMMOVED001', $keys_after, true), 'The unlinked item goes once the copy is confirmed');
T::ok(in_array('moved:airbnb:HMMOVED001:9011', $keys_after, true), 'And is replaced by the record of the move');
T::ok(!in_array('unpaid_past:9011', $keys_after, true), 'The copy stops being chased for payment');
