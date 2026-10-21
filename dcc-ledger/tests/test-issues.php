<?php
/** The cleanup list, and invoice reconciliation. */

declare(strict_types=1);

use DCCL\Importer;
use DCCL\Issues;
use DCCL\Linker;
use DCCL\Repo;

T::group('Cleanup list');

dccl_seed_mphb();
dccl_import_all();
T::group('Before matching has been run');

$unmatched = array_column(Issues::all(), 'key');
T::ok(in_array('handtyped:bookingcom:5555555555:9006', $unmatched, true), 'A platform stay also typed in by hand is raised before matching is run');
T::ok(in_array('ota_unlinked:bookingcom:5111111111', $unmatched, true), 'And every stay is unlinked at this point');

T::group('Cleanup list after matching');

Linker::run(1);
DCCL\Snapshot::run(false, 1);

$items = Issues::all();
$keys  = array_column($items, 'key');

$has = static fn (string $key): bool => in_array($key, $keys, true);

/** One field of one item, or null if the item is not on the list. */
function dccl_issue_field(array $items, string $key, string $field)
{
    foreach ($items as $item) {
        if ($item['key'] === $key) {
            return $item[$field] ?? null;
        }
    }

    return null;
}

/** The severity of one item, or '' if it is not on the list at all. */
function dccl_issue_severity(array $items, string $key): string
{
    foreach ($items as $item) {
        if ($item['key'] === $key) {
            return (string) $item['severity'];
        }
    }

    return '';
}

T::ok($has('payout_no_reservation:bookingcom:5722711078'), 'A payout with no reservation row is raised');
// 9052 starts the same day in the same cottage. It is offered, not taken.
T::same(
    [['id' => 9052, 'method' => 'copy']],
    dccl_issue_field($items, 'payout_no_reservation:bookingcom:5722711078', 'candidates'),
    'The hand-typed booking starting the same day is offered as a probable copy'
);
T::same(
    [],
    DCCL\Repo::links_for_stay((int) dccl_issue_field($items, 'payout_no_reservation:bookingcom:5722711078', 'stay_id')),
    'But nothing is linked until somebody presses the button'
);
T::ok(
    (bool) dccl_issue_field($items, 'payout_no_reservation:bookingcom:5722711078', 'link_by_number'),
    'And a booking number can be typed in instead'
);
$unlinked_item = null;
foreach ($items as $candidate_item) {
    if (strpos((string) $candidate_item['key'], 'ota_unlinked:') === 0) {
        $unlinked_item = $candidate_item;
        break;
    }
}
T::ok($unlinked_item !== null && !empty($unlinked_item['link_by_number']), 'An unlinked platform stay takes a booking number too');
T::ok($has('imported_no_stay:9005'), 'An imported booking with no ledger stay is raised');
// A block is the host closing dates. There is no money to find, so it is
// reported as information and never as a gap.
T::ok($has('imported_block:9050'), 'An imported calendar block is reported as information');
T::ok(!$has('imported_no_stay:9050'), 'And never as a booking whose money is missing');
T::same('info', dccl_issue_severity($items, 'imported_block:9050'), 'The block carries no warning');
// 9051 checks in after the last export, so the platform simply has not
// reported it yet.
T::ok($has('after_exports:9051'), 'A stay starting after the latest export is reported as information');
T::ok(!$has('imported_no_stay:9051'), 'And not chased as missing money');
T::same('info', dccl_issue_severity($items, 'after_exports:9051'), 'It carries no warning either');
T::ok($has('copy_payment:9006'), 'A hand-typed copy carrying a payment is raised');
T::ok($has('overpaid:9009'), 'A booking paid for more than its total is raised');
// #9021 checked out after the reconciled window, so Rob's assumed-paid rule
// does not reach it and the gap is still a gap.
T::ok($has('unpaid_past:9021'), 'A past direct booking outside the window that is not fully paid is raised');
// #9012 is inside the window, so the ledger's assumed adjustment covers it and
// there is nothing left to chase.
T::ok(!$has('unpaid_past:9012'), 'A past booking the assumed adjustment covers is not chased');
T::ok($has('clawback:airbnb:HMMOVED001'), 'The stayed-but-clawed-back case is raised');
T::ok($has('cancelled_money:bookingcom:5333333333'), 'A cancelled stay that still has money is raised');
// HMCANCEL02 holds nothing but a cancellation fee, which is what a
// cancellation is supposed to leave behind. Nobody stayed, so it is not money
// for a stay and there is nothing to chase.
T::ok(!$has('cancelled_money:airbnb:HMCANCEL02'), 'A cancelled stay holding only its cancellation fee is not raised');
// 5344444444 is the shape of live's 6486225525: paid out, then refunded in
// full. Netted it is nothing, and raising it sends somebody chasing $0.
T::ok(!$has('cancelled_money:bookingcom:5344444444'), 'A cancelled stay whose payout was refunded in full is not raised');
T::ok(!$has('cancelled_money_twin:bookingcom:5344444444:9006'), 'Nor is it offered as a twin of a direct booking');
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
T::ok($found !== null && $found['reviewed'], 'It is still listed, marked reviewed');
T::same('Checked Clover — a refund was issued.', $found === null ? '' : $found['review_note'], 'With its note');

Repo::unmark_reviewed('overpaid:9009');
T::same($open_before, count(Issues::open()), 'And it can be put back on the list');

T::group('Confirming a move clears its item');

Repo::link(Repo::stay_id('airbnb', 'HMMOVED001'), 9011, 'copy', 1);
$keys_after = array_column(Issues::all(), 'key');

T::ok(!in_array('ota_unlinked:airbnb:HMMOVED001', $keys_after, true), 'The unlinked item goes once the copy is confirmed');
T::ok(in_array('moved:airbnb:HMMOVED001:9011', $keys_after, true), 'And is replaced by the record of the move');
T::ok(!in_array('unpaid_past:9011', $keys_after, true), 'The copy stops being chased for payment');
