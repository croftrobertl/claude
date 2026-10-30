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
const LIVE_BREAKDOWN          = '_mphb_booking_price_breakdown';
const LIVE_SYNC_ID            = '_mphb_sync_id';
const LIVE_ICAL_PRODID        = 'mphb_ical_prodid';
const LIVE_ICAL_SUMMARY       = 'mphb_ical_summary';
const LIVE_ICAL_DESC          = 'mphb_ical_description';
const LIVE_PAYMENT_COMPLETED  = 'mphb-p-completed';
const LIVE_PAYMENT_REFUNDED   = 'mphb-p-refunded';
const LIVE_PAYMENT_FAILED     = 'mphb-p-failed';

/**
 * A MotoPress price breakdown in the shape live actually stores it: a JSON
 * string, with the key paths counted on live on 2026-10-30 —
 *
 *     total
 *     rooms[n].room.total / .discount / .discount_total / .list
 *     rooms[n].services.total / .fees.total
 *     rooms[n].taxes.room.total and .taxes.room.list[m].label / .price
 *     rooms[n].taxes.services.total / .taxes.fees.total
 *     rooms[n].total / .discount / .discount_total
 *
 * 0.3.3 read this as a serialized PHP array, found nothing in it, and put
 * every direct booking into "tax unknown". Written here with LITERAL key
 * names, never built from the plugin's own constants, for the same reason
 * the rest of this file is not: a fixture built from the code follows the
 * code into its mistakes.
 *
 * Lake County's tourist and sales tax comes to 11%%, which is the shape
 * Rob's bookings carry.
 */
function dccl_price_breakdown(string $total, int $room_id, bool $with_tax = true): string
{
    $total_cents = (int) round(((float) $total) * 100);
    $tax_cents   = $with_tax ? $total_cents - intdiv($total_cents * 100, 111) : 0;
    $base_cents  = $total_cents - $tax_cents;
    $money       = static fn (int $cents): string => number_format($cents / 100, 2, '.', '');

    return (string) json_encode([
        'total' => $money($total_cents),
        'rooms' => [
            [
                'room' => [
                    'total'          => $money($base_cents),
                    'discount'       => '0.00',
                    'discount_total' => $money($base_cents),
                    'list'           => ['2026-01-01' => $money($base_cents)],
                ],
                'services' => ['total' => '0.00', 'discount' => '0.00', 'discount_total' => '0.00'],
                'fees'     => ['total' => '0.00', 'discount' => '0.00', 'discount_total' => '0.00'],
                'taxes'    => [
                    'room' => [
                        'total' => $money($tax_cents),
                        'list'  => $with_tax
                            ? [['label' => 'Accommodation tax', 'price' => $money($tax_cents)]]
                            : [],
                    ],
                    'services' => ['total' => '0.00'],
                    'fees'     => ['total' => '0.00'],
                ],
                'total'          => $money($total_cents),
                'discount'       => '0.00',
                'discount_total' => $money($total_cents),
            ],
        ],
    ]);
}

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

        // The price breakdown MotoPress stores beside the total. On this
        // site the total INCLUDES room tax, so the ledger reads the tax out
        // of here — see Breakdown. Every priced direct booking gets one
        // unless the case under test deliberately withholds it.
        $priced   = isset($meta[LIVE_TOTAL]) && (float) $meta[LIVE_TOTAL] !== 0.0;
        $imported = isset($meta[LIVE_SYNC_ID]);
        if ($priced && !$imported && !array_key_exists(LIVE_BREAKDOWN, $meta)) {
            $wpdb->insert($wpdb->postmeta, [
                'post_id'    => $id,
                'meta_key'   => LIVE_BREAKDOWN,
                'meta_value' => dccl_price_breakdown((string) $meta[LIVE_TOTAL], $room_id),
            ]);
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

    // Hand-typed, in the same cottage and starting the same day as the
    // Booking.com payout whose reservation row has not arrived. Probably the
    // same stay; nothing links it, because the check-out is unknown.
    $booking(9052, 'confirmed', 1072, '2026-09-28', '2026-10-04', [
        LIVE_TOTAL      => '1120.00',
        LIVE_FIRST_NAME => 'Nadia',
        LIVE_LAST_NAME  => 'Oyelaran',
    ]);

    // Booking 1152 is on Rob's pre-2025 list AND is a hand-typed copy of
    // Booking.com 5666666666. The ruling must pass it over: assuming it paid
    // would count that stay's money twice.
    $booking(1152, 'confirmed', 1614, '2025-11-10', '2025-11-13', [
        LIVE_TOTAL      => '540.00',
        LIVE_NOTE       => 'Walk-in, booking.com 5666666666',
        LIVE_FIRST_NAME => 'Ines',
        LIVE_LAST_NAME  => 'Olofsdottir',
    ]);

    // Booking 1599 is on the same list and is nothing of the kind: a plain
    // direct stay before the exports begin, with no payment recorded.
    $booking(1599, 'confirmed', 1066, '2024-11-04', '2024-11-08', [
        LIVE_TOTAL      => '640.00',
        LIVE_FIRST_NAME => 'Leonie',
        LIVE_LAST_NAME  => 'Brightwater',
    ]);

    // Booking 7983 is on Rob's refund list: MotoPress records more paid than
    // the booking is worth, because the refund never reached it.
    $booking(7983, 'confirmed', 1807, '2025-01-20', '2025-01-24', [
        LIVE_TOTAL      => '500.00',
        LIVE_FIRST_NAME => 'Olu',
        LIVE_LAST_NAME  => 'Adeyemi',
    ]);
    $payment(79831, 7983, 716.45, '2025-01-20');

    // A confirmed direct booking with no total at all — a comp, or one Rob
    // has not priced yet. It occupies the cottage, so it counts in
    // occupancy, but it must not divide a rate: a night with nothing above
    // it reads as a discount nobody gave.
    $booking(9053, 'confirmed', 1613, '2026-07-06', '2026-07-10', [
        LIVE_TOTAL      => '0.00',
        LIVE_FIRST_NAME => 'Margit',
        LIVE_LAST_NAME  => 'Sandoval',
    ]);

    // A calendar block, not a booking: Airbnb's own wording for dates the
    // host closed. Live booking 6313 is this shape exactly.
    $booking(9050, 'confirmed', 1068, '2025-02-14', '2025-02-17', [
        LIVE_SYNC_ID      => 'sync-9050',
        LIVE_ICAL_PRODID  => '-//Airbnb Inc//Hosting Calendar 1.0//EN',
        LIVE_ICAL_SUMMARY => 'Airbnb (Not available)',
        LIVE_TOTAL        => '0.00',
    ]);

    // An imported booking that starts after the exports end. The platform
    // has not reported its money yet; nothing is missing.
    $booking(9051, 'confirmed', 1070, '2026-11-10', '2026-11-14', [
        LIVE_SYNC_ID      => 'sync-9051',
        LIVE_ICAL_PRODID  => '-//Airbnb Inc//Hosting Calendar 1.0//EN',
        LIVE_ICAL_SUMMARY => 'Reserved - HMFUTURE01',
        LIVE_TOTAL        => '0.00',
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

    // Rob's four confirmed moves, by the booking ids and the channel and
    // cottage the plugin carries in Copies::CONFIRMED_MOVES. Each sits on its
    // platform stay's nights in a DIFFERENT cottage, and each is given a
    // surname that does NOT match — the seeding must link them on Rob's
    // say-so alone.
    //
    // 7278 is shaped like the real one: the Airbnb stay it was moved from
    // (cottage 32, 24-26 Oct) shares those nights with a Vrbo stay in the
    // same cottage — the double booking that caused the move. It also carries
    // a recorded payment equal to its total, so its gap is 0 and no assumed
    // payment hides a missing link. Unlinked, its $388.50 would count as
    // direct revenue on top of the Airbnb payout for the same stay.
    $booking(7278, 'confirmed', 1070, '2025-10-24', '2025-10-26', [
        LIVE_TOTAL      => '388.50',
        LIVE_FIRST_NAME => 'Gregor',
        LIVE_LAST_NAME  => 'Lindqvist',
    ]);
    $payment(72781, 7278, 388.50, '2025-10-24');

    // The Vrbo half of that double booking, imported as it would really be.
    // Its own stay links to it on exact dates, as normal; 7278 must never be
    // linked to it.
    $booking(9040, 'confirmed', 1066, '2025-10-24', '2025-10-26', [
        LIVE_SYNC_ID     => 'sync-9040',
        LIVE_ICAL_PRODID => '-//HomeAway.com, Inc.//EN',
        LIVE_TOTAL       => '0.00',
    ]);

    // 12443: the Booking.com stay 5666666666 is in cottage 34, 10-13 Nov 2025.
    $booking(12443, 'confirmed', 1806, '2025-11-10', '2025-11-13', [
        LIVE_TOTAL      => '529.50',
        LIVE_FIRST_NAME => 'Marta',
        LIVE_LAST_NAME  => 'Quintero',
    ]);
    // 12447: the Booking.com stay 5777777777 is in cottage 34, 20-23 Nov 2025.
    $booking(12447, 'confirmed', 1807, '2025-11-20', '2025-11-23', [
        LIVE_TOTAL      => '529.50',
        LIVE_FIRST_NAME => 'Ola',
        LIVE_LAST_NAME  => 'Fjeldstad',
    ]);
    // 17462: the Airbnb stay HM17462AA1 is in cottage 32, 1-4 Feb 2026.
    $booking(17462, 'confirmed', 1072, '2026-02-01', '2026-02-04', [
        LIVE_TOTAL      => '444.00',
        LIVE_FIRST_NAME => 'Yusuf',
        LIVE_LAST_NAME  => 'Demirci',
    ]);

    // Rob's 5584 shape, as it really appears on live: the guest cancelled on
    // Booking.com and booked and paid Rob directly. The platform stay exists
    // but is CANCELLED with nothing on it, so no money came through that
    // channel. These are real stays and real direct revenue, and must never
    // be linked as copies or flagged as hand-typed ones.
    $booking(8415, 'confirmed', 1613, '2026-01-31', '2026-02-07', [
        LIVE_TOTAL      => '893.55',
        LIVE_FIRST_NAME => 'Esme',
        LIVE_LAST_NAME  => 'Thorsby',
    ]);
    $payment(84151, 8415, 893.55, '2026-01-31');

    $booking(9136, 'confirmed', 1613, '2026-02-27', '2026-03-01', [
        LIVE_TOTAL      => '277.50',
        LIVE_FIRST_NAME => 'Lars',
        LIVE_LAST_NAME  => 'Ottoway',
    ]);
    $payment(91361, 9136, 277.50, '2026-02-27');

    // The genuine oddity: a Booking.com reservation marked cancelled that the
    // channel paid out for anyway, with a hand-typed booking on its nights.
    // Nobody can tell from here which of the two the money belongs to, so it
    // is a question for Rob, not something to decide automatically.
    $booking(8899, 'confirmed', 1807, '2025-09-10', '2025-09-13', [
        LIVE_TOTAL      => '420.00',
        LIVE_FIRST_NAME => 'Bryn',
        LIVE_LAST_NAME  => 'Castellow',
    ]);
    $payment(88991, 8899, 420.00, '2025-09-10');

    // A CANCELLED booking sitting exactly where a moved guest would sit, with
    // a matching surname. A dock block is not a stay, so it is not a move, a
    // copy, or a question for Rob.
    $booking(7078, 'cancelled', 1613, '2025-07-01', '2025-07-05', [
        LIVE_TOTAL      => '0.00',
        LIVE_FIRST_NAME => 'Dana',
        LIVE_LAST_NAME  => 'Whitfield',
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
