<?php
/** Each parser, plus header detection and refusal. */

declare(strict_types=1);

use DCCL\Importer;
use DCCL\Csv;
use DCCL\Parsers\Airbnb_Payout;
use DCCL\Parsers\Airbnb_Reservations;
use DCCL\Parsers\Bookingcom_Invoices;
use DCCL\Parsers\Bookingcom_Payout;
use DCCL\Parsers\Bookingcom_Reservations;
use DCCL\Parsers\Vrbo_Payout;
use DCCL\Parsers\Vrbo_Reservations;

T::group('Header detection');

$expected = [
    'airbnb-payout.csv'            => Airbnb_Payout::class,
    'airbnb-reservations.csv'      => Airbnb_Reservations::class,
    'bookingcom-reservations.csv'  => Bookingcom_Reservations::class,
    'bookingcom-payout.csv'        => Bookingcom_Payout::class,
    'vrbo-reservations.csv'        => Vrbo_Reservations::class,
    'vrbo-payout.csv'              => Vrbo_Payout::class,
    'bookingcom-invoices.csv'      => Bookingcom_Invoices::class,
];

foreach ($expected as $file => $class) {
    T::same($class, Importer::detect(Csv::header(dccl_fixture($file))), $file . ' is recognised');
}

T::same(null, Importer::detect(Csv::header(dccl_fixture('not-a-ledger-file.csv'))), 'An unknown header is refused');
T::same(null, Importer::detect(['Date', 'Type']), 'A truncated Airbnb header is refused, not guessed at');

// A header with an extra column is a different format and must be refused.
$tampered = Airbnb_Payout::HEADER;
$tampered[] = 'Extra column';
T::same(null, Importer::detect($tampered), 'A header with an added column is refused');

// Case and surrounding whitespace are forgiven; order is not.
$shuffled = Airbnb_Reservations::HEADER;
[$shuffled[0], $shuffled[1]] = [$shuffled[1], $shuffled[0]];
T::same(null, Importer::detect($shuffled), 'Reordered columns are refused');
T::ok(Airbnb_Reservations::matches(array_map('strtoupper', Airbnb_Reservations::HEADER)), 'Case is forgiven');

T::group('Airbnb payout parser');

$parsed = (new Airbnb_Payout())->parse(dccl_fixture('airbnb-payout.csv'));

T::same(7, count($parsed['stays']), 'Five reservations plus two cancelled stays become stays, Crofty excluded');
T::same('cancelled', $parsed['stays']['airbnb:HMCANCEL01']['status'], 'A cancellation fee creates the cancelled stay its money belongs to');
T::ok(!isset($parsed['stays']['airbnb:HMCROFTY01']), 'The Crofty Bear reservation is not a stay');
T::same(1, $parsed['counts']['excluded'], 'One Crofty row counted as excluded');
T::same([], $parsed['notes'], 'The payout totals agree with their rows, so there are no notes');

$by_type = [];
foreach ($parsed['lines'] as $line) {
    $by_type[$line['type']][] = $line;
}

T::same(5, count($by_type['guest_total'] ?? []), 'Five reservations carry a gross');
T::same(46500, $by_type['guest_total'][0]['amount_cents'], 'Gross earnings become the guest total');
T::same(4000, $by_type['tax_platform_remitted'][0]['amount_cents'], 'Airbnb remitted tax is its own line');
T::same(1500, $by_type['service_fee'][0]['amount_cents'], 'The service fee is stored as a positive cost');
T::same(45000, $by_type['payout'][0]['amount_cents'], 'The Amount column is the payout share');
T::same(1, count($by_type['resolution'] ?? []), 'The resolution adjustment is kept');
T::same(-33969, $by_type['resolution'][0]['amount_cents'], 'The resolution adjustment keeps its sign');
T::same(7500, $by_type['cancellation_fee'][0]['amount_cents'], 'The cancellation fee is kept');
T::same(-7500, $by_type['cancellation_fee_refund'][0]['amount_cents'], 'The cancellation fee refund is kept');
T::same(2500, $by_type['adjustment'][0]['amount_cents'], 'The adjustment is kept');

$old = $parsed['stays']['airbnb:HM2022OLD1'];
T::same('2022-06-01', $old['check_in'], 'A 2022 reservation in a 2025 payout keeps its own dates');
T::same('2025-04-02', $by_type['payout'][3]['event_date'], 'Its money keeps the payout date');

T::ok(!str_contains((string) json_encode($parsed), 'Whitfield'), 'No guest name survives parsing');

T::group('Airbnb reservations parser');

$parsed = (new Airbnb_Reservations())->parse(dccl_fixture('airbnb-reservations.csv'));
T::same(8, count($parsed['stays']), 'Eight stays, Crofty excluded, payout rows skipped');
T::same(2, $parsed['counts']['skipped'], 'Both interleaved payout rows are skipped');
T::same(1, $parsed['counts']['excluded'], 'The Crofty listing is excluded');
T::same([], $parsed['lines'], 'The reservations file carries no money');
T::same('2025-04-01 00:00:00', $parsed['stays']['airbnb:HMNOPAY0001']['booked_on'], 'It supplies the booking date');

T::group('Booking.com reservations parser');

$parsed = (new Bookingcom_Reservations())->parse(dccl_fixture('bookingcom-reservations.csv'));
T::same(10, count($parsed['stays']), 'Ten stays, the Crofty hotel id excluded');
T::same('2025-02-10 09:15:30', $parsed['stays']['bookingcom:5111111111']['booked_on'], 'A full ISO timestamp is read');
T::same('2025-11-28 19:01:00', $parsed['stays']['bookingcom:5222222222']['booked_on'], 'An ISO timestamp with no seconds is read');
T::same('cancelled', $parsed['stays']['bookingcom:5333333333']['status'], 'CANCELLED becomes cancelled');
T::same('22', $parsed['stays']['bookingcom:5111111111']['cottage'], 'Hotel id 14033916 is Cottage 22');

$commission = array_values(array_filter($parsed['lines'], static fn ($l) => $l['type'] === 'commission'));
T::same('2025-03-05', $commission[0]['event_date'], 'Commission is dated by departure');
T::same(9000, $commission[0]['amount_cents'], 'Commission amount is stored as a positive cost');
T::ok(!str_contains((string) json_encode($parsed), 'O&#39;neal'), 'An HTML-entity name does not survive parsing');

T::group('Booking.com payout parser');

$parsed = (new Bookingcom_Payout())->parse(dccl_fixture('bookingcom-payout.csv'));
T::same(7, count($parsed['stays']), 'Seven payout reservations, Crofty excluded');
T::ok(isset($parsed['stays']['bookingcom:5722711078']), 'A payout with no reservation row still creates a stay');
T::same(null, $parsed['stays']['bookingcom:5722711078']['check_out'], 'That stay has no check-out, so nights stay unknown');

$refunds = array_values(array_filter($parsed['lines'], static fn ($l) => $l['type'] === 'refund'));
T::same(-10000, $refunds[0]['amount_cents'], 'A REFUND row is negative');

$payouts = array_values(array_filter($parsed['lines'], static fn ($l) => $l['type'] === 'payout'));
T::same(67200, $payouts[0]['amount_cents'], 'The payout is the gross including tax');

T::group('Vrbo reservations parser');

$parsed = (new Vrbo_Reservations())->parse(dccl_fixture('vrbo-reservations.csv'));
T::same(5, count($parsed['stays']), 'Five stays, the Crofty listing excluded');
T::same('ok', $parsed['stays']['vrbo:HA-AAA111']['status'], 'Booked becomes ok');
T::same('cancelled', $parsed['stays']['vrbo:HA-BBB222']['status'], 'Cancelled becomes cancelled');
T::same('expired', $parsed['stays']['vrbo:HA-CCC333']['status'], 'A request that expired is stored as expired');
T::same(3, $parsed['stays']['vrbo:HA-AAA111']['persons'], 'Adults and children add up to persons');
T::ok(!str_contains((string) json_encode($parsed), '@example.com'), 'No email survives parsing');
T::ok(!str_contains((string) json_encode($parsed), '352-555-'), 'No phone number survives parsing');

T::group('Vrbo payout parser');

$parsed = (new Vrbo_Payout())->parse(dccl_fixture('vrbo-payout.csv'));
T::same(2, count($parsed['stays']), 'Two reservations, the Crofty row excluded');

$payouts = array_values(array_filter($parsed['lines'], static fn ($l) => $l['type'] === 'payout'));
T::same(3, count($payouts), 'Three payout rows, including the later negative one');
T::same(85500, $payouts[0]['amount_cents'], '"Month D, YYYY" dates and amounts are read');
T::same('2025-07-10', $payouts[0]['event_date'], 'Jul 10, 2025 parses to an ISO date');
T::same(-9500, $payouts[1]['amount_cents'], 'A split negative payout row is kept');

$taxes = array_values(array_filter($parsed['lines'], static fn ($l) => $l['type'] === 'tax_in_payout'));
T::same(3, count($taxes), 'Vrbo tax lines are stored even at zero');
T::same(0, $taxes[0]['amount_cents'], 'They are zero, as the file states');

T::group('Booking.com invoices parser');

$parsed = (new Bookingcom_Invoices())->parse(dccl_fixture('bookingcom-invoices.csv'));
T::same(3, count($parsed['lines']), 'Three invoices, the Crofty invoice excluded');
T::same(1, $parsed['counts']['excluded'], 'The Crofty invoice is counted as excluded');
T::same('invoice', $parsed['lines'][0]['type'], 'Each is stored as an invoice line');
T::same(9000, $parsed['lines'][0]['amount_cents'], 'The invoice line carries the commission');
T::same(60000, $parsed['lines'][0]['meta']['room_sales'], 'Room sales ride along in the line meta');
