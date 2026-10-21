<?php
/**
 * A fresh install, start to finish, from empty tables.
 *
 * This is what live will do, and it is the path 0.1.3 got wrong: the seeding
 * of Rob's four confirmed moves read the wrong key, so on a site where they
 * were not already linked it would have linked nothing and then assumed
 * payment on all four — $1,503.00 of money that came through the platforms.
 * Staging never showed it, because staging had the links already.
 */

declare(strict_types=1);

use DCCL\Adjustments;
use DCCL\Copies;
use DCCL\Linker;
use DCCL\Repo;
use DCCL\Snapshot;

global $wpdb;

T::group('Import, link, snapshot — from nothing');

dccl_seed_mphb();

T::same([], Repo::all_links(), 'Nothing is linked to begin with');

T::group('Linking before any import links nothing at all');

// Somebody runs the matcher first, out of order. There are no stays yet, so
// Rob's confirmed moves have nothing to be linked to — and a link that points
// at no stay is worse than no link.
$early = Linker::run(1);
T::same(0, $early['copy'], 'No copies are linked');
T::same([], Repo::all_links(), 'And no link is created pointing at nothing');

dccl_import_all();
$counts = Linker::run(1);

T::group("Rob's confirmed moves are linked on a fresh install");

foreach (array_keys(Copies::CONFIRMED_MOVES) as $booking_id) {
    $linked = null;
    foreach (Repo::all_links() as $link) {
        if ((int) $link['mphb_booking_id'] === $booking_id) {
            $linked = $link;
        }
    }

    T::ok($linked !== null, 'Booking #' . $booking_id . ' is linked');
    T::same('copy', $linked === null ? '' : (string) $linked['method'], 'As a copy');
    T::ok($linked !== null && (int) $linked['stay_id'] > 0, 'To a real stay, not to nothing');

    $reviews = Repo::reviews();
    $key     = 'move_copy:' . $booking_id . ':' . ($linked === null ? 0 : (int) $linked['stay_id']);
    T::ok(isset($reviews[$key]), 'And recorded as already reviewed, because Rob decided it');
}

T::group('No link ever points at nothing');

foreach (Repo::all_links() as $link) {
    T::ok((int) $link['stay_id'] > 0, 'Link #' . $link['id'] . ' points at a real stay');
}

T::group('A confirmed move is a copy, so it is never assumed paid');

Snapshot::run(false, 1);

$assumed = [];
foreach (Adjustments::all() as $adjustment) {
    if ((string) $adjustment['type'] === Adjustments::ASSUMED_PAID) {
        $assumed[] = (int) $adjustment['mphb_booking_id'];
    }
}

foreach (array_keys(Copies::CONFIRMED_MOVES) as $booking_id) {
    T::ok(!in_array($booking_id, $assumed, true), 'Booking #' . $booking_id . ' is not assumed paid');
}

T::group('Linking twice changes nothing and warns about nothing');

// The upgrade path: the links already exist, and the seeding runs again.
$again = Linker::run(1);
T::same(0, $again['code'], 'No new links by code');
T::same(0, $again['exact'], 'No new links by exact dates');
T::same(0, $again['copy'], 'No new copies, and no second attempt at the confirmed moves');

$third = Linker::run(1);
T::same(0, $third['copy'], 'And again');

// A PHP warning anywhere in the run fails the whole suite — that is what the
// bootstrap's error handler is for. Running the linker three times is what
// this group exists to cover.
T::same([], T::$warnings, 'No PHP warning was raised by any of the three runs');
