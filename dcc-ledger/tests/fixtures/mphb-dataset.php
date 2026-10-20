<?php

declare(strict_types=1);

/**
 * A fake MotoPress data set, built with the key names counted on live on
 * 2026-10-19: `_mphb_amount`, `_mphb_booking_id`, the `mphb-p-` status prefix,
 * and both note fields.
 *
 * It holds imported bookings, direct bookings with full, partial, zero, over
 * and refunded payments, hand-typed copies (same cottage, moved cottage, and
 * one identified only by a code in a note), and a cancelled dock block.
 *
 * Nothing carries `_dcc_assumed_paid`: those 38 payments were removed from live
 * on 2026-10-19, and the ledger records assumed payments as its own adjustments
 * instead.
 *
 * Guest names are deliberately present in the notes so the "no names persisted"
 * test has something to catch.
 *
 * Every key and status below is written as a LITERAL, never as one of the
 * plugin's own constants. A fixture built from the constants would follow the
 * plugin into any mistake it made — `mphb_amount` would be written and then
 * read back happily — and prove nothing. These are the spellings live uses.
 */

/** The live spellings, counted in portal_postmeta / portal_posts on 2026-10-19. */
const LIVE_BOOKING_TYPE       = 'mphb_booking';
const LIVE_RESERVED_ROOM_TYPE = 'mphb_reserved_room';
const LIVE_PAYMENT_TYPE       = 'mphb_payment';
const LIVE_CHECK_IN           = 'mphb_check_in_date';
const LIVE_CHECK_OUT          = 'mphb_check_out_date';
const LIVE_ROOM_ID            = '_mphb_room_id';
const LIVE_TOTAL              = 'mphb_total_price';
const LIVE_PAYMENT_AMOUNT     = '_mphb_amount';
const LIVE_PAYMENT_BOOKING    = '_mphb_booking_id';
const LIVE_NOTE               = 'mphb_note';
const LIVE_FIRST_NAME         = 'mphb_first_name';
const LIVE_LAST_NAME          = 'mphb_last_name';
const LIVE_GUEST_NAME         = 'mphb_guest_name';
const LIVE_INTERNAL_NOTE      = '_mphb_booking_internal_notes';
const LIVE_SYNC_ID            = '_mphb_sync_id';
const LIVE_ICAL_PRODID        = 'mphb_ical_prodid';
const LIVE_ICAL_SUMMARY       = 'mphb_ical_summary';
const LIVE_ICAL_DESC          = 'mphb_ical_description';
const LIVE_PAYMENT_COMPLETED  = 'mphb-p-completed';
const LIVE_PAYMENT_REFUNDED   = 'mphb-p-refunded';
const LIVE_PAYMENT_FAILED     = 'mphb-p-failed';

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
            'post_type'   => LIVE_BOOKING_TYPE,
            'post_status' => $status,
            'post_title'  => 'Booking #' . $id,
            'post_date'   => $check_in . ' 10:00:00',
        ]);
        $wpdb->insert($wpdb->posts, [
            'ID'          => $id * 10,
            'post_parent' => $id,
            'post_type'   => LIVE_RESERVED_ROOM_TYPE,
            'post_status' => 'publish',
            'post_title'  => 'Reserved room',
            'post_date'   => $check_in . ' 10:00:00',
        ]);
        $wpdb->insert($wpdb->postmeta, ['post_id' => $id * 10, 'meta_key' => LIVE_ROOM_ID, 'meta_value' => (string) $room_id]);
        $wpdb->insert($wpdb->postmeta, ['post_id' => $id, 'meta_key' => LIVE_CHECK_IN, 'meta_value' => $check_in]);
        $wpdb->insert($wpdb->postmeta, ['post_id' => $id, 'meta_key' => LIVE_CHECK_OUT, 'meta_value' => $check_out]);
        foreach ($meta as $key => $value) {
            $wpdb->insert($wpdb->postmeta, ['post_id' => $id, 'meta_key' => $key, 'meta_value' => (string) $value]);
        }
    };

    // A payment is tied to its booking by _mphb_booking_id meta, not by
    // post_parent, and its status carries the mphb-p- prefix.
    $payment = static function (
        int $payment_id,
        int $booking_id,
        float $amount,
        string $date,
        string $status = LIVE_PAYMENT_COMPLETED
    ) use ($wpdb): void {
        $wpdb->insert($wpdb->posts, [
            'ID'          => $payment_id,
            'post_parent' => 0,
            'post_type'   => LIVE_PAYMENT_TYPE,
            'post_status' => $status,
            'post_title'  => 'Payment',
            'post_date'   => $date . ' 12:00:00',
        ]);
        $wpdb->insert($wpdb->postmeta, [
            'post_id'    => $payment_id,
            'meta_key'   => LIVE_PAYMENT_AMOUNT,
            'meta_value' => number_format($amount, 2, '.', ''),
        ]);
        $wpdb->insert($wpdb->postmeta, [
            'post_id'    => $payment_id,
            'meta_key'   => LIVE_PAYMENT_BOOKING,
            'meta_value' => (string) $booking_id,
        ]);
    };

    // Imported: Airbnb with the confirmation code in the iCal summary.
    $booking(9001, 'confirmed', 1072, '2025-03-07', '2025-03-10', [
        LIVE_SYNC_ID      => 'sync-9001',
        LIVE_ICAL_PRODID  => '-//Airbnb Inc//Hosting Calendar 1.0//EN',
        LIVE_ICAL_SUMMARY => 'Reserved - HMAAAA0001 (Dana Whitfield)',
        LIVE_TOTAL        => '0.00',
    ]);

    // Imported: Airbnb with no code anywhere — links on exact dates instead.
    $booking(9002, 'confirmed', 1068, '2025-03-12', '2025-03-15', [
        LIVE_SYNC_ID     => 'sync-9002',
        LIVE_ICAL_PRODID => '-//Airbnb Inc//Hosting Calendar 1.0//EN',
        LIVE_ICAL_SUMMARY => 'Reserved',
        LIVE_TOTAL       => '0.00',
    ]);

    // Imported: Booking.com.
    $booking(9003, 'confirmed', 1072, '2025-03-01', '2025-03-05', [
        LIVE_SYNC_ID     => 'sync-9003',
        LIVE_ICAL_PRODID => '-//Booking.com//Calendar//EN',
        LIVE_TOTAL       => '0.00',
    ]);

    // Imported: Vrbo.
    $booking(9004, 'confirmed', 1072, '2025-07-01', '2025-07-05', [
        LIVE_SYNC_ID     => 'sync-9004',
        LIVE_ICAL_PRODID => '-//HomeAway.com, Inc.//EN',
        LIVE_TOTAL       => '0.00',
    ]);

    // Imported through "ddaysoftware": channel unknown, and no ledger stay.
    $booking(9005, 'confirmed', 1807, '2025-12-01', '2025-12-03', [
        LIVE_SYNC_ID     => 'sync-9005',
        LIVE_ICAL_PRODID => '-//ddaysoftware.com//NONSGML v1.0//EN',
        LIVE_TOTAL       => '0.00',
    ]);

    // Hand-typed copy of Booking.com 5555555555: same cottage, same dates,
    // and it carries a recorded payment that must never be counted.
    $booking(9006, 'confirmed', 1806, '2025-06-10', '2025-06-14', [
        LIVE_TOTAL => '796.00',
        LIVE_NOTE  => 'Walk-in, Tom Iwasaki, paid deposit by card',
        LIVE_FIRST_NAME => 'Tom',
        LIVE_LAST_NAME  => 'Iwasaki',
    ]);
    $payment(90061, 9006, 333.00, '2025-06-10');

    // A clean direct booking, fully paid with a real payment.
    $booking(9007, 'confirmed', 1070, '2025-04-01', '2025-04-05', [
        LIVE_TOTAL => '500.00',
        LIVE_FIRST_NAME => 'Brian',
        LIVE_LAST_NAME  => 'Halloran',
    ]);
    $payment(90071, 9007, 500.00, '2025-04-01');

    // Partly paid: the ledger will add an assumed adjustment for the $350 gap.
    $booking(9008, 'confirmed', 1066, '2025-05-01', '2025-05-05', [
        LIVE_TOTAL => '600.00',
        LIVE_FIRST_NAME => 'Maria',
        LIVE_LAST_NAME  => 'Castellanos',
    ]);
    $payment(90081, 9008, 250.00, '2025-05-01');

    // Overpaid: recorded payments exceed the total.
    $booking(9009, 'confirmed', 1613, '2025-02-01', '2025-02-03', [
        LIVE_TOTAL => '300.00',
        LIVE_FIRST_NAME => 'Dev',
        LIVE_LAST_NAME  => 'Anand',
    ]);
    $payment(90091, 9009, 400.00, '2025-02-01');

    // A dock block: cancelled, never a stay, never auto-links.
    $booking(9010, 'cancelled', 1614, '2025-07-20', '2025-07-25', [
        LIVE_TOTAL => '0.00',
    ]);

    // A moved-cottage copy of Airbnb HMMOVED001 (cottage 32 → 23): same dates,
    // different cottage, no code. Suggested only, never auto-linked.
    $booking(9011, 'confirmed', 1070, '2025-03-20', '2025-03-23', [
        LIVE_TOTAL      => '388.50',
        LIVE_FIRST_NAME => 'Renee',
        LIVE_LAST_NAME  => "O'Neal",
    ]);

    // Past direct booking with nothing paid at all.
    $booking(9012, 'confirmed', 1807, '2025-01-05', '2025-01-08', [
        LIVE_TOTAL => '400.00',
        LIVE_FIRST_NAME => 'Nora',
        LIVE_LAST_NAME  => 'Pettigrew',
    ]);

    // Refunded: MotoPress keeps the amount on the payment, so counting it
    // would say this booking was paid when the money went back.
    $booking(9017, 'confirmed', 1070, '2025-09-01', '2025-09-04', [
        LIVE_TOTAL => '450.00',
        LIVE_FIRST_NAME => 'Owen',
        LIVE_LAST_NAME  => 'Fairbanks',
    ]);
    $payment(90171, 9017, 450.00, '2025-09-01', LIVE_PAYMENT_REFUNDED);

    // Part completed, part refunded, inside the window.
    $booking(9018, 'confirmed', 1066, '2025-10-01', '2025-10-04', [
        LIVE_TOTAL => '500.00',
        LIVE_FIRST_NAME => 'Celia',
        LIVE_LAST_NAME  => 'Mortimer',
    ]);
    $payment(90181, 9018, 300.00, '2025-10-01');
    $payment(90182, 9018, 200.00, '2025-10-05', LIVE_PAYMENT_REFUNDED);

    // A failed payment is not money either.
    $booking(9019, 'confirmed', 1613, '2025-11-01', '2025-11-03', [
        LIVE_TOTAL => '300.00',
        LIVE_FIRST_NAME => 'Hugh',
        LIVE_LAST_NAME  => 'Danforth',
    ]);
    $payment(90191, 9019, 300.00, '2025-11-01', LIVE_PAYMENT_FAILED);

    // Checks out after the reconciled window: no assumed adjustment.
    $booking(9020, 'confirmed', 1614, '2026-11-01', '2026-11-04', [
        LIVE_TOTAL => '700.00',
    ]);

    // Rob's 5584: a direct booking carrying the code of a CANCELLED platform
    // stay. The money never came through that channel, so this is a real,
    // separate stay and must never be treated as a copy.
    $booking(9022, 'confirmed', 1614, '2025-08-01', '2025-08-03', [
        LIVE_TOTAL         => '416.25',
        LIVE_INTERNAL_NOTE => 'Guest rebooked direct after cancelling VRBO ID: HA-BBB222',
        LIVE_FIRST_NAME => 'Jo',
        LIVE_LAST_NAME  => 'Tran',
    ]);

    // A move the ledger should spot on its own: same dates as the Airbnb stay
    // HMBBBB0003 (cottage 35, 1-4 May), in a different cottage, with nothing
    // booked in cottage 35 on those dates.
    $booking(9023, 'confirmed', 1613, '2025-05-01', '2025-05-04', [
        LIVE_TOTAL      => '525.00',
        LIVE_FIRST_NAME => 'Keith',
        LIVE_LAST_NAME  => 'Brannigan',
    ]);

    // Sits where a moved guest would sit (same dates as the Airbnb stay in
    // cottage 36, nothing booked there), but MotoPress holds no name for the
    // customer at all. Nothing to compare, so it is never called a move.
    $booking(9024, 'confirmed', 1068, '2025-08-15', '2025-08-18', [
        LIVE_TOTAL => '275.00',
    ]);

    // The empty-last-name case: the whole name sits in the first-name field.
    // It still has to match the Vrbo stay in cottage 31 on the same dates.
    $booking(9025, 'confirmed', 1613, '2025-10-01', '2025-10-06', [
        LIVE_TOTAL      => '640.00',
        LIVE_FIRST_NAME => 'Lena Ortiz',
        LIVE_LAST_NAME  => '',
    ]);

    // Going forward: checked out after the window closed and still unpaid.
    // Rob's assumed-paid rule does not reach it, so the cleanup list must.
    $booking(9021, 'confirmed', 1806, '2026-10-01', '2026-10-05', [
        LIVE_TOTAL => '500.00',
        LIVE_FIRST_NAME => 'Ivy',
        LIVE_LAST_NAME  => 'Sandoval',
    ]);

    // A copy identified only by the code in its customer note.
    $booking(9013, 'confirmed', 1613, '2026-01-11', '2026-01-14', [
        LIVE_TOTAL         => '450.00',
        LIVE_INTERNAL_NOTE => 'Moved from Booking.com ID: 5222222222 for Ann Beaulieu, phone 352-555-0199',
        LIVE_FIRST_NAME => 'Ann',
        LIVE_LAST_NAME  => 'Beaulieu',
    ]);

    // Rob's mislabelled note: a Vrbo code written as "Airbnb ID: HA-…".
    $booking(9014, 'confirmed', 1072, '2025-07-02', '2025-07-06', [
        LIVE_TOTAL => '855.00',
        LIVE_NOTE  => 'Airbnb ID: HA-AAA111 — Dana Whitfield, dana.whitfield@example.com',
        LIVE_FIRST_NAME => 'Dana',
        LIVE_LAST_NAME  => 'Whitfield',
    ]);

    // Imported Vrbo booking sharing cottage 31 and 12–15 March with the
    // Airbnb stay HMAAAA0002. Only the channel tells them apart.
    $booking(9015, 'confirmed', 1068, '2025-03-12', '2025-03-15', [
        LIVE_SYNC_ID     => 'sync-9015',
        LIVE_ICAL_PRODID => '-//HomeAway.com, Inc.//EN',
        LIVE_TOTAL       => '0.00',
    ]);

    // Imported Airbnb booking that OVERLAPS stay HMNOPAY0001 (cottage 36,
    // 15–18 Aug) without matching it. An overlap must never link.
    $booking(9016, 'confirmed', 1807, '2025-08-16', '2025-08-19', [
        LIVE_SYNC_ID     => 'sync-9016',
        LIVE_ICAL_PRODID => '-//Airbnb Inc//Hosting Calendar 1.0//EN',
        LIVE_TOTAL       => '0.00',
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
