<?php
/**
 * Booking pace, recorded rather than reconstructed.
 *
 * A curve drawn today from booking dates shows what survived to today, not
 * what stood on the day: a reservation made in March and cancelled in April
 * is in neither record. So the ledger writes down its position once a night
 * and never recomputes it, a missed night is reported as missed, and a month
 * is only charted once every mark on its curve was actually recorded.
 */

declare(strict_types=1);

use DCCL\Linker;
use DCCL\Pace;
use DCCL\Schema;
use DCCL\Snapshot;

global $wpdb;

dccl_seed_mphb();
dccl_import_all();
Linker::run(1);
Snapshot::run(false, 1);

T::group('What is on the books, as at a date');

$books = Pace::on_the_books('2025-06-01');

T::same(Pace::HORIZON_MONTHS, count($books), 'Every month in the horizon is measured');
T::ok(isset($books['2025-06']), 'Starting with the month the reading is taken in');
T::ok(array_sum(array_column($books, 'room_nights')) > 0, 'And there are room nights on the books to find');

// A month with nothing in it is recorded at zero, because "nothing on the
// books yet" is a measurement, not a blank.
$empty = array_filter($books, static fn (array $m): bool => $m['room_nights'] === 0);
T::ok($empty !== [], 'A month with nothing yet is measured at zero, not skipped');

T::group('A night is recorded once, and never rewritten');

$first = Pace::record('2025-06-01');

T::same('2025-06-01', $first['recorded_on'], 'The run is dated on the property clock');
T::same(Pace::HORIZON_MONTHS, $first['months'], 'It writes a row per month in the horizon');
T::ok(!$first['already'], 'And reports that it did the work');

$rows = (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . Schema::pace());
T::same(Pace::HORIZON_MONTHS, $rows, 'Which is what is in the table');

$again = Pace::record('2025-06-01');
T::ok($again['already'], 'Running again the same day changes nothing');
T::same(
    $rows,
    (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . Schema::pace()),
    'The morning\'s position is not replaced by the evening\'s'
);

T::group('A night that was missed is reported as missed');

Pace::record('2025-06-02');
// 3 June is skipped on purpose — a cron that did not fire.
Pace::record('2025-06-04');

T::same(
    ['2025-06-01', '2025-06-02', '2025-06-04'],
    Pace::recorded_dates(),
    'Three nights were recorded'
);
T::same(
    ['2025-06-03'],
    Pace::missing_dates('2025-06-05'),
    'And the one that was missed is named, not filled in'
);

T::group('A curve says where it has no reading');

// Nothing was recorded at any of the marks this month needs, so every one
// of them is unknown — and says so rather than reading zero.
$curve = Pace::curve('2026-06');

T::same(count(Pace::DAYS_OUT), count($curve), 'A curve has a mark for each days-out');
foreach ($curve as $point) {
    T::same(null, $point['room_nights'], $point['days_out'] . ' days out is unknown, not zero');
}

T::group('A month is charted only once its whole curve was recorded');

T::same([], Pace::months_covered(), 'With three nights recorded, no month is complete');
T::ok(Pace::first_complete_month() !== null, 'And the screen can say when the first one will be');
T::same(
    '2025-12',
    Pace::first_complete_month(),
    'Which is the month beginning after the first 180 days of recording'
);

// Record every mark one month needs, and it becomes chartable.
$target = '2026-03';
foreach (Pace::DAYS_OUT as $days) {
    $as_at = (new DateTimeImmutable($target . '-01'))->modify('-' . $days . ' days')->format('Y-m-d');
    Pace::record($as_at);
}

T::ok(in_array($target, Pace::months_covered(), true), 'The month with a complete curve is charted');
T::same(null, Pace::first_complete_month(), 'And the "not yet" note goes away');

$covered = Pace::curve($target);
foreach ($covered as $point) {
    T::ok($point['room_nights'] !== null, $point['days_out'] . ' days out has a real reading');
}

T::group('Nothing about pace touches MotoPress');

$wpdb->writes = [];
Pace::record('2026-01-15');
T::same([], $wpdb->mphb_writes(), 'Recording a night writes nothing to posts or postmeta');
