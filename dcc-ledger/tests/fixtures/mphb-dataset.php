<?php
/**
 * A fake MotoPress data set: imported bookings, direct bookings, payments
 * (recorded and assumed), hand-typed copies and cancelled dock blocks.
 *
 * Guest names are deliberately present in the notes and titles so the
 * "no names persisted" test has something to catch.
 */

declare(strict_types=1);

use DCCL\Mphb_Reader;

function dccl_seed_mphb(): void
{
    global $wpdb;

    $booking = static function (
        int $id,
        string $status,
        int $room_id,
        string $check_in,
        string $check_out,
        array $meta = []
    ) use ($wpdb): void {
        $wpdb->insert($wpdb->posts, [
            'ID'          => $id,
            'post_parent' => 0,
            'post_type'   => Mphb_Reader::POST_TYPE_BOOKING,
            'post_status' => $status,
            'post_title'  => 'Booking #' . $id,
            'post_date'   => $check_in . ' 10:00:00',
        ]);
        $wpdb->insert($wpdb->posts, [
            'ID'          => $id * 10,
            'post_parent' => $id,
            'post_type'   => Mphb_Reader::POST_TYPE_RESERVED_ROOM,
            'post_status' => 'publish',
            'post_title'  => 'Reserved room',
            'post_date'   => $check_in . ' 10:00:00',
        ]);
        $wpdb->insert($wpdb->postmeta, ['post_id' => $id * 10, 'meta_key' => Mphb_Reader::META_ROOM_ID, 'meta_value' => (string) $room_id]);
        $wpdb->insert($wpdb->postmeta, ['post_id' => $id, 'meta_key' => Mphb_Reader::META_CHECK_IN, 'meta_value' => $check_in]);
        $wpdb->insert($wpdb->postmeta, ['post_id' => $id, 'meta_key' => Mphb_Reader::META_CHECK_OUT, 'meta_value' => $check_out]);
        foreach ($meta as $key => $value) {
            $wpdb->insert($wpdb->postmeta, ['post_id' => $id, 'meta_key' => $key, 'meta_value' => (string) $value]);
        }
    };

    $payment = static function (int $payment_id, int $booking_id, float $amount, string $date, bool $assumed = false) use ($wpdb): void {
        $wpdb->insert($wpdb->posts, [
            'ID'          => $payment_id,
            'post_parent' => $booking_id,
            'post_type'   => Mphb_Reader::POST_TYPE_PAYMENT,
            'post_status' => Mphb_Reader::PAYMENT_COMPLETED,
            'post_title'  => 'Payment',
            'post_date'   => $date . ' 12:00:00',
        ]);
        $wpdb->insert($wpdb->postmeta, ['post_id' => $payment_id, 'meta_key' => Mphb_Reader::META_PAYMENT_AMOUNT, 'meta_value' => number_format($amount, 2, '.', '')]);
        if ($assumed) {
            $wpdb->insert($wpdb->postmeta, [
                'post_id'    => $payment_id,
                'meta_key'   => Mphb_Reader::META_ASSUMED_PAID,
                'meta_value' => 'Assumed paid in full on 2026-10-18.',
            ]);
            $wpdb->insert($wpdb->postmeta, [
                'post_id'    => $payment_id,
                'meta_key'   => '_mphb_transaction_id',
                'meta_value' => 'ASSUMED-PAID-20261018',
            ]);
        }
    };

    // Imported: Airbnb with the confirmation code in the iCal summary.
    $booking(9001, 'confirmed', 1072, '2025-03-07', '2025-03-10', [
        Mphb_Reader::META_SYNC_ID      => 'sync-9001',
        Mphb_Reader::META_ICAL_PRODID  => '-//Airbnb Inc//Hosting Calendar 1.0//EN',
        Mphb_Reader::META_ICAL_SUMMARY => 'Reserved - HMAAAA0001 (Dana Whitfield)',
        Mphb_Reader::META_TOTAL        => '0.00',
    ]);

    // Imported: Airbnb with no code anywhere — links on exact dates instead.
    $booking(9002, 'confirmed', 1068, '2025-03-12', '2025-03-15', [
        Mphb_Reader::META_SYNC_ID     => 'sync-9002',
        Mphb_Reader::META_ICAL_PRODID => '-//Airbnb Inc//Hosting Calendar 1.0//EN',
        Mphb_Reader::META_ICAL_SUMMARY => 'Reserved',
        Mphb_Reader::META_TOTAL       => '0.00',
    ]);

    // Imported: Booking.com.
    $booking(9003, 'confirmed', 1072, '2025-03-01', '2025-03-05', [
        Mphb_Reader::META_SYNC_ID     => 'sync-9003',
        Mphb_Reader::META_ICAL_PRODID => '-//Booking.com//Calendar//EN',
        Mphb_Reader::META_TOTAL       => '0.00',
    ]);

    // Imported: Vrbo.
    $booking(9004, 'confirmed', 1072, '2025-07-01', '2025-07-05', [
        Mphb_Reader::META_SYNC_ID     => 'sync-9004',
        Mphb_Reader::META_ICAL_PRODID => '-//HomeAway.com, Inc.//EN',
        Mphb_Reader::META_TOTAL       => '0.00',
    ]);

    // Imported through "ddaysoftware": channel unknown, and no ledger stay.
    $booking(9005, 'confirmed', 1807, '2025-12-01', '2025-12-03', [
        Mphb_Reader::META_SYNC_ID     => 'sync-9005',
        Mphb_Reader::META_ICAL_PRODID => '-//ddaysoftware.com//NONSGML v1.0//EN',
        Mphb_Reader::META_TOTAL       => '0.00',
    ]);

    // Hand-typed copy of Booking.com 5555555555: same cottage, same dates,
    // and it carries a recorded payment that must never be counted.
    $booking(9006, 'confirmed', 1806, '2025-06-10', '2025-06-14', [
        Mphb_Reader::META_TOTAL => '796.00',
        Mphb_Reader::META_NOTE  => 'Walk-in, Tom Iwasaki, paid deposit by card',
    ]);
    $payment(90061, 9006, 333.00, '2025-06-10');

    // A clean direct booking, fully paid with a real payment.
    $booking(9007, 'confirmed', 1070, '2025-04-01', '2025-04-05', [
        Mphb_Reader::META_TOTAL => '500.00',
    ]);
    $payment(90071, 9007, 500.00, '2025-04-01');

    // A direct booking topped up as assumed paid on 2026-10-18.
    $booking(9008, 'confirmed', 1066, '2025-05-01', '2025-05-05', [
        Mphb_Reader::META_TOTAL => '600.00',
    ]);
    $payment(90081, 9008, 600.00, '2025-05-01', true);

    // Overpaid: recorded payments exceed the total.
    $booking(9009, 'confirmed', 1613, '2025-02-01', '2025-02-03', [
        Mphb_Reader::META_TOTAL => '300.00',
    ]);
    $payment(90091, 9009, 400.00, '2025-02-01');

    // A dock block: cancelled, never a stay, never auto-links.
    $booking(9010, 'cancelled', 1614, '2025-07-20', '2025-07-25', [
        Mphb_Reader::META_TOTAL => '0.00',
    ]);

    // A moved-cottage copy of Airbnb HMMOVED001 (cottage 32 → 23): same dates,
    // different cottage, no code. Suggested only, never auto-linked.
    $booking(9011, 'confirmed', 1070, '2025-03-20', '2025-03-23', [
        Mphb_Reader::META_TOTAL => '388.50',
    ]);

    // Past direct booking with nothing paid.
    $booking(9012, 'confirmed', 1807, '2025-01-05', '2025-01-08', [
        Mphb_Reader::META_TOTAL => '400.00',
    ]);

    // A copy identified only by the code in its customer note.
    $booking(9013, 'confirmed', 1613, '2026-01-11', '2026-01-14', [
        Mphb_Reader::META_TOTAL => '450.00',
        Mphb_Reader::META_NOTE  => 'Moved from Booking.com ID: 5222222222 for Ann Beaulieu, phone 352-555-0199',
    ]);

    // Rob's mislabelled note: a Vrbo code written as "Airbnb ID: HA-…".
    $booking(9014, 'confirmed', 1072, '2025-07-02', '2025-07-06', [
        Mphb_Reader::META_TOTAL => '855.00',
        Mphb_Reader::META_NOTE  => 'Airbnb ID: HA-AAA111 — Dana Whitfield, dana.whitfield@example.com',
    ]);

    // Imported Vrbo booking sharing cottage 31 and 12–15 March with the
    // Airbnb stay HMAAAA0002. Only the channel tells them apart.
    $booking(9015, 'confirmed', 1068, '2025-03-12', '2025-03-15', [
        Mphb_Reader::META_SYNC_ID     => 'sync-9015',
        Mphb_Reader::META_ICAL_PRODID => '-//HomeAway.com, Inc.//EN',
        Mphb_Reader::META_TOTAL       => '0.00',
    ]);

    // Imported Airbnb booking that OVERLAPS stay HMNOPAY0001 (cottage 36,
    // 15–18 Aug) without matching it. An overlap must never link.
    $booking(9016, 'confirmed', 1807, '2025-08-16', '2025-08-19', [
        Mphb_Reader::META_SYNC_ID     => 'sync-9016',
        Mphb_Reader::META_ICAL_PRODID => '-//Airbnb Inc//Hosting Calendar 1.0//EN',
        Mphb_Reader::META_TOTAL       => '0.00',
    ]);
}

/** Every guest name, email and phone that appears in the fixtures. */
function dccl_fixture_pii(): array
{
    return [
        'Dana', 'Whitfield', 'Marco', 'Pires', 'Renee', 'Hal', 'Brenner',
        'Jo Tran', 'Priya', 'Raman', 'Lena', 'Ortiz', 'Sam', 'Delgado',
        'Beaulieu', 'Iwasaki', 'Mellor', 'Vance', 'O&#39;neal', "O'Neal",
        '@example.com', '352-555-', '865-555-', 'Canal Rd', 'Smoky Ridge',
    ];
}
