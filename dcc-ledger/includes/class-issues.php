<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The cleanup list. Nothing here is stored — every item is computed from the
 * ledger and from MotoPress each time the tab loads, so an item disappears the
 * moment the underlying fact changes. Only the admin's "Reviewed" marks are
 * stored, keyed by the item's stable key.
 *
 * Each item is a plain-English title, the facts behind it, and one suggested
 * action. None of them changes anything on its own.
 */
final class Issues
{
    /**
     * @return array<int,array<string,mixed>>
     */
    public static function all(): array
    {
        $items    = [];
        $stays    = self::stays_with_money();
        // Structure (which bookings exist, and on what dates) is read live, so
        // it is never stale. Money is read from the ledger's own frozen copy,
        // so a figure never changes under Rob's feet.
        $bookings = Mphb_Reader::bookings();
        $copied   = Originals::bookings_with_payments();
        $links    = self::links_by_stay();
        $by_book  = self::links_by_booking();

        self::unlinked_stays($items, $stays, $links, $bookings);
        self::handtyped_matches($items, $stays, $links, $bookings);
        self::imported_without_stay($items, $bookings, $by_book);
        self::payouts_without_reservation($items, $stays);
        self::cancelled_with_money($items, $stays);
        self::moved_cottage($items, $stays, $links, $bookings);
        self::copies_with_payments($items, $links, $copied);
        self::clawed_back($items, $stays, $links, $copied);
        self::overpaid_bookings($items, $copied);
        self::unpaid_past_bookings($items, $copied);
        self::changed_since_copied($items);
        self::not_yet_copied($items, $bookings, $copied);
        self::probable_move_copies($items, $stays);
        self::assumed_on_a_copy($items);
        self::confirmed_moves_without_a_stay($items, $bookings);
        self::links_to_nowhere($items);
        self::invoice_reconciliation($items);

        $reviews = Repo::reviews();
        foreach ($items as &$item) {
            $review = $reviews[$item['key']] ?? null;
            $item['reviewed']      = $review !== null;
            $item['review_note']   = $review['note'] ?? '';
            $item['reviewed_at']   = $review['reviewed_at'] ?? '';
        }
        unset($item);

        return $items;
    }

    /** @return array<int,array<string,mixed>> */
    public static function open(): array
    {
        return array_values(array_filter(self::all(), static fn ($i) => !$i['reviewed']));
    }

    // ------------------------------------------------------------- items

    /**
     * @param array<int,array<string,mixed>> $items
     * @param array<int,array<string,mixed>> $stays
     * @param array<int,array<int,array>>    $links
     * @param array<int,array<string,mixed>> $bookings
     */
    private static function unlinked_stays(array &$items, array $stays, array $links, array $bookings): void
    {
        foreach ($stays as $stay) {
            if ((string) $stay['status'] !== 'ok') {
                continue;
            }
            // Any link counts here, a copy included: once a hand-typed copy
            // is attached, the stay is accounted for in MotoPress even though
            // the iCal import never produced a booking of its own.
            if (($links[(int) $stay['id']] ?? []) !== []) {
                continue;
            }

            $candidates = Linker::candidates($stay, $bookings);
            $facts      = [self::stay_fact($stay)];
            foreach ($candidates as $candidate) {
                $facts[] = sprintf(
                    /* translators: 1: MotoPress booking id, 2: the reason it was not linked automatically */
                    __('Possible match: MotoPress booking #%1$d — %2$s', 'dcc-ledger'),
                    (int) $candidate['booking']['id'],
                    $candidate['reason']
                );
            }

            $items[] = [
                'key'      => 'ota_unlinked:' . $stay['channel'] . ':' . $stay['code'],
                'title'    => __('A Platform Stay With No MotoPress Booking', 'dcc-ledger'),
                'facts'    => $facts,
                'action'   => $candidates === []
                    ? __('Check whether the iCal import missed this stay. Link it by hand if MotoPress has it under other dates.', 'dcc-ledger')
                    : __('Review the possible matches and link the right one by hand.', 'dcc-ledger'),
                'severity' => 'warn',
                'stay_id'  => (int) $stay['id'],
                'candidates' => array_map(
                    static fn ($c) => ['id' => (int) $c['booking']['id'], 'method' => $c['method']],
                    $candidates
                ),
            ];
        }
    }

    /**
     * The double-count trap: an OTA stay that Rob also typed into MotoPress by
     * hand. Until the hand-typed booking is linked as a copy, its nights and
     * money would be counted a second time.
     */
    private static function handtyped_matches(array &$items, array $stays, array $links, array $bookings): void
    {
        $direct = [];
        foreach ($bookings as $booking) {
            if ($booking['is_imported'] || !Linker::is_live($booking)) {
                continue;
            }
            $direct[Linker::key((string) $booking['cottage'], $booking['check_in'], $booking['check_out'])][] = $booking;
        }

        foreach ($stays as $stay) {
            $key  = Linker::key((string) $stay['cottage'], $stay['check_in'], $stay['check_out']);
            $hits = $direct[$key] ?? [];
            foreach ($hits as $booking) {
                if (self::linked($links, (int) $stay['id'], (int) $booking['id'])) {
                    continue;
                }
                $items[] = [
                    'key'      => 'handtyped:' . $stay['channel'] . ':' . $stay['code'] . ':' . $booking['id'],
                    'title'    => __('A Platform Stay Also Typed Into MotoPress By Hand', 'dcc-ledger'),
                    'facts'    => [
                        self::stay_fact($stay),
                        sprintf(
                            /* translators: 1: booking id, 2: cottage, 3: check-in, 4: check-out */
                            __('MotoPress booking #%1$d is a direct booking for the same cottage (%2$s) and the same dates (%3$s to %4$s).', 'dcc-ledger'),
                            (int) $booking['id'],
                            (string) $booking['cottage'],
                            (string) $booking['check_in'],
                            (string) $booking['check_out']
                        ),
                    ],
                    'action'   => __('Link the hand-typed booking to this stay as a copy, so its nights and money are counted once.', 'dcc-ledger'),
                    'severity' => 'bad',
                    'stay_id'  => (int) $stay['id'],
                    'suggest_copy' => (int) $booking['id'],
                ];
            }
        }
    }

    private static function imported_without_stay(array &$items, array $bookings, array $by_booking): void
    {
        foreach ($bookings as $booking) {
            if (!$booking['is_imported'] || !Linker::is_live($booking)) {
                continue;
            }
            if (isset($by_booking[(int) $booking['id']])) {
                continue;
            }
            $items[] = [
                'key'      => 'imported_no_stay:' . $booking['id'],
                'title'    => __('An Imported Booking With No Ledger Stay', 'dcc-ledger'),
                'facts'    => [
                    sprintf(
                        /* translators: 1: booking id, 2: channel, 3: cottage, 4: check-in, 5: check-out */
                        __('MotoPress booking #%1$d came in from %2$s for cottage %3$s, %4$s to %5$s, but no imported stay matches it.', 'dcc-ledger'),
                        (int) $booking['id'],
                        Cottages::channel_label((string) $booking['channel']),
                        (string) $booking['cottage'],
                        (string) $booking['check_in'],
                        (string) $booking['check_out']
                    ),
                    __('Its money is therefore missing from every figure.', 'dcc-ledger'),
                ],
                'action'   => __('Import that platform\'s reservations and payouts for this period, then link by hand if it still has no stay.', 'dcc-ledger'),
                'severity' => 'warn',
                'booking_id' => (int) $booking['id'],
            ];
        }
    }

    private static function payouts_without_reservation(array &$items, array $stays): void
    {
        foreach ($stays as $stay) {
            $meta = Repo::decode_meta($stay['meta'] ?? null);
            if (empty($meta['from_payout']) || $stay['check_out'] !== null) {
                continue;
            }
            $items[] = [
                'key'      => 'payout_no_reservation:' . $stay['channel'] . ':' . $stay['code'],
                'title'    => __('A Payout With No Reservation Row', 'dcc-ledger'),
                'facts'    => [
                    sprintf(
                        /* translators: 1: channel, 2: reservation code, 3: cottage, 4: check-in date */
                        __('%1$s paid out for reservation %2$s (cottage %3$s, check-in %4$s), but that reservation is not in any reservations file yet, so its nights and commission are unknown.', 'dcc-ledger'),
                        Cottages::channel_label((string) $stay['channel']),
                        (string) $stay['code'],
                        (string) $stay['cottage'],
                        (string) $stay['check_in']
                    ),
                    sprintf(
                        /* translators: %s: payout amount */
                        __('Payout recorded: %s.', 'dcc-ledger'),
                        self::money((float) $stay['payout'])
                    ),
                ],
                'action'   => __('Import the next reservations export for that channel; the stay will fill itself in.', 'dcc-ledger'),
                'severity' => 'warn',
                'stay_id'  => (int) $stay['id'],
            ];
        }
    }

    private static function cancelled_with_money(array &$items, array $stays): void
    {
        foreach ($stays as $stay) {
            if ((string) $stay['status'] === 'ok') {
                continue;
            }
            $fees  = round((float) $stay['cancellation_fee'] + (float) $stay['cancellation_fee_refund'], 2);
            $other = round(
                (float) $stay['payout'] + (float) $stay['guest_total'] + (float) $stay['room_sales'] + (float) $stay['refund'],
                2
            );
            if (abs($other) < 0.01) {
                continue;
            }
            $items[] = [
                'key'      => 'cancelled_money:' . $stay['channel'] . ':' . $stay['code'],
                'title'    => __('A Cancelled Stay That Still Has Money', 'dcc-ledger'),
                'facts'    => [
                    self::stay_fact($stay),
                    sprintf(
                        /* translators: 1: money other than cancellation fees, 2: cancellation fees */
                        __('Money on the stay apart from cancellation fees: %1$s. Cancellation fees: %2$s.', 'dcc-ledger'),
                        self::money($other),
                        self::money($fees)
                    ),
                ],
                'action'   => __('Check whether the platform refunded this. Cancellation fees are expected here; a full payout is not.', 'dcc-ledger'),
                'severity' => 'warn',
                'stay_id'  => (int) $stay['id'],
            ];
        }
    }

    private static function moved_cottage(array &$items, array $stays, array $links, array $bookings): void
    {
        $by_id = [];
        foreach ($bookings as $booking) {
            $by_id[(int) $booking['id']] = $booking;
        }

        foreach ($stays as $stay) {
            foreach ($links[(int) $stay['id']] ?? [] as $link) {
                $booking = $by_id[(int) $link['mphb_booking_id']] ?? null;
                if ($booking === null || (string) $booking['cottage'] === (string) $stay['cottage']) {
                    continue;
                }
                $items[] = [
                    'key'      => 'moved:' . $stay['channel'] . ':' . $stay['code'] . ':' . $booking['id'],
                    'title'    => __('A Stay Whose Cottage Differs From Its Booking', 'dcc-ledger'),
                    'facts'    => [
                        self::stay_fact($stay),
                        sprintf(
                            /* translators: 1: booking id, 2: cottage on the booking */
                            __('MotoPress booking #%1$d has it in cottage %2$s — the guest was most likely moved.', 'dcc-ledger'),
                            (int) $booking['id'],
                            (string) $booking['cottage']
                        ),
                    ],
                    'action'   => __('Confirm the move. Nights count once, on the platform stay\'s cottage.', 'dcc-ledger'),
                    'severity' => 'info',
                    'stay_id'  => (int) $stay['id'],
                ];
            }
        }
    }

    private static function copies_with_payments(array &$items, array $links, array $copied): void
    {
        foreach ($links as $stay_id => $stay_links) {
            foreach ($stay_links as $link) {
                if ((string) $link['method'] !== 'copy') {
                    continue;
                }
                $booking = $copied[(int) $link['mphb_booking_id']] ?? null;
                if ($booking === null || (float) $booking['paid'] <= 0) {
                    continue;
                }
                $items[] = [
                    'key'      => 'copy_payment:' . (int) $link['mphb_booking_id'],
                    'title'    => __('A Hand-Typed Copy That Carries A Payment', 'dcc-ledger'),
                    'facts'    => [
                        sprintf(
                            /* translators: 1: booking id, 2: payment amount */
                            __('MotoPress booking #%1$d is a copy of a platform stay and has %2$s in recorded payments.', 'dcc-ledger'),
                            (int) $booking['mphb_id'],
                            self::money((float) $booking['paid'])
                        ),
                        __('That money is shown on a copy, not counted, so it is in no report figure.', 'dcc-ledger'),
                    ],
                    'action'   => __('Decide whether this payment is real money Rob received on top of the platform payout, or a duplicate of it.', 'dcc-ledger'),
                    'severity' => 'bad',
                    'booking_id' => (int) $booking['mphb_id'],
                ];
            }
        }
    }

    /**
     * The stay happened, the platform took its money back, and nothing was
     * collected directly — Rob's case 17462.
     */
    private static function clawed_back(array &$items, array $stays, array $links, array $copied): void
    {

        foreach ($stays as $stay) {
            if ((string) $stay['status'] !== 'ok') {
                continue;
            }
            $net = round(
                (float) $stay['payout'] + (float) $stay['refund'] + (float) $stay['adjustment']
                + (float) $stay['resolution'],
                2
            );
            $clawback = round((float) $stay['resolution'] + (float) $stay['refund'], 2);
            if ($clawback >= -0.01 || $net > 0.01) {
                continue;
            }

            $collected = 0.0;
            foreach ($links[(int) $stay['id']] ?? [] as $link) {
                $booking = $copied[(int) $link['mphb_booking_id']] ?? null;
                if ($booking !== null) {
                    $collected += (float) $booking['paid'];
                }
            }
            if ($collected > 0.01) {
                continue;
            }

            $items[] = [
                'key'      => 'clawback:' . $stay['channel'] . ':' . $stay['code'],
                'title'    => __('Stayed, Platform Refunded, Nothing Collected', 'dcc-ledger'),
                'facts'    => [
                    self::stay_fact($stay),
                    sprintf(
                        /* translators: 1: clawed-back amount, 2: net amount for the stay */
                        __('The platform took back %1$s, leaving a net of %2$s, and no payment is recorded against any linked MotoPress booking.', 'dcc-ledger'),
                        self::money($clawback),
                        self::money($net)
                    ),
                ],
                'action'   => __('If Rob was paid another way, record that payment in MotoPress. Otherwise this stay earned nothing, and the figures are right as they stand.', 'dcc-ledger'),
                'severity' => 'bad',
                'stay_id'  => (int) $stay['id'],
            ];
        }
    }

    private static function overpaid_bookings(array &$items, array $copied): void
    {
        foreach ($copied as $booking_id => $booking) {
            if ((string) $booking['booking_status'] !== Snapshot::CONFIRMED || (float) $booking['total'] <= 0) {
                continue;
            }
            $paid = round((float) $booking['paid'], 2);
            $over = round($paid - (float) $booking['total'], 2);
            if ($over < 0.01) {
                continue;
            }
            $items[] = [
                'key'      => 'overpaid:' . $booking_id,
                'title'    => __('A Booking Paid For More Than Its Total', 'dcc-ledger'),
                'facts'    => [
                    sprintf(
                        /* translators: 1: booking id, 2: amount over the total, 3: total, 4: amount paid */
                        __('MotoPress booking #%1$d is overpaid by %2$s: the total is %3$s and completed payments come to %4$s.', 'dcc-ledger'),
                        (int) $booking_id,
                        self::money($over),
                        self::money((float) $booking['total']),
                        self::money($paid)
                    ),
                    __('The figures show it exactly as recorded. Nothing was capped or altered, and no assumed payment was added to it.', 'dcc-ledger'),
                ],
                'action'   => __('Check the card processor for a refund that MotoPress does not know about.', 'dcc-ledger'),
                'severity' => 'warn',
                'booking_id' => (int) $booking_id,
            ];
        }
    }

    /** Going forward: a past stay that is not fully paid. */
    private static function unpaid_past_bookings(array &$items, array $copied): void
    {
        $today  = Dates::today();
        $copies = Reports::direct_copy_ids();

        foreach ($copied as $booking_id => $booking) {
            if ((string) $booking['booking_status'] !== Snapshot::CONFIRMED) {
                continue;
            }
            if (isset($copies[$booking_id])) {
                continue;
            }
            if ($booking['check_out'] === null || $booking['check_out'] >= $today) {
                continue;
            }
            $paid = round((float) $booking['paid'], 2);
            foreach (Adjustments::for_booking($booking_id) as $adjustment) {
                if ((string) $adjustment['type'] === Adjustments::ASSUMED_PAID) {
                    $paid = round($paid + (float) $adjustment['amount'], 2);
                }
            }
            $short = round((float) $booking['total'] - $paid, 2);
            if ($short < 0.01) {
                continue;
            }
            $items[] = [
                'key'      => 'unpaid_past:' . $booking_id,
                'title'    => __('A Past Direct Booking That Is Not Fully Paid', 'dcc-ledger'),
                'facts'    => [
                    sprintf(
                        /* translators: 1: booking id, 2: check-out date, 3: shortfall, 4: total, 5: amount paid */
                        __('MotoPress booking #%1$d checked out on %2$s and is %3$s short: the total is %4$s, and completed payments plus any assumed adjustment come to %5$s.', 'dcc-ledger'),
                        (int) $booking_id,
                        (string) $booking['check_out'],
                        self::money($short),
                        self::money((float) $booking['total']),
                        self::money($paid)
                    ),
                ],
                'action'   => __('Record the payment in MotoPress and take a fresh snapshot, or add an assumed adjustment in the ledger if the real figure is not known.', 'dcc-ledger'),
                'severity' => 'warn',
                'booking_id' => (int) $booking_id,
            ];
        }
    }

    /**
     * A direct booking that looks like the same guest moved to another
     * cottage: the same dates, a different cottage, nothing standing in the
     * platform stay's own cottage, and the same surname.
     *
     * It is a question, not a finding. Rob's rule is that every confirmed
     * booking really happened, so until he says otherwise the booking counts
     * as the real stay it probably is — and is assumed paid if it qualifies.
     * Calling it a copy on a guess would silently drop a real stay's money.
     *
     * @param array<int,array<string,mixed>> $stays
     */
    private static function probable_move_copies(array &$items, array $stays): void
    {
        $by_stay = [];
        foreach ($stays as $stay) {
            $by_stay[(int) $stay['id']] = $stay;
        }

        $live   = Copies::from_live();
        $direct = [];
        foreach ($live as $booking) {
            $direct[(int) $booking['id']] = $booking;
        }

        foreach (Copies::probable_moves($live) as $booking_id => $match) {
            $stay    = $by_stay[(int) $match['stay_id']] ?? null;
            $booking = $direct[(int) $booking_id] ?? null;
            if ($stay === null || $booking === null) {
                continue;
            }

            $named = (bool) $match['named'];

            $facts = [
                sprintf(
                    /* translators: 1: booking id, 2: cottage, 3: check-in, 4: check-out */
                    __('MotoPress booking #%1$d is a direct booking in cottage %2$s for %3$s to %4$s.', 'dcc-ledger'),
                    (int) $booking_id,
                    (string) $booking['cottage'],
                    (string) $booking['check_in'],
                    (string) $booking['check_out']
                ),
                self::stay_fact($stay),
                $named
                    ? __('Same dates, a different cottage, nothing booked in the platform stay\'s own cottage, and the same surname — so this looks like the same guest, moved.', 'dcc-ledger')
                    : __('Same dates, a different cottage, and nothing booked in the platform stay\'s own cottage. MotoPress holds no name for this booking, so there is nothing to tell a moved guest from a different party on the same weekend.', 'dcc-ledger'),
                __('It is being counted as a real stay, and assumed paid if it qualifies. Confirming the move links it to the platform stay and reverses any assumed payment.', 'dcc-ledger'),
            ];

            $items[] = [
                'key'      => 'move_copy:' . $booking_id . ':' . (int) $match['stay_id'],
                'title'    => $named
                    ? __('Probable Move Copy', 'dcc-ledger')
                    : __('Possible Move, No Name To Compare', 'dcc-ledger'),
                'facts'    => $facts,
                'action'   => $named
                    ? __('Confirm the move, or reject it if these really are two different stays.', 'dcc-ledger')
                    : __('Check who stayed. Confirm the move only if it was the same guest; otherwise reject it and it will not be raised again.', 'dcc-ledger'),
                'severity' => $named ? 'info' : 'warn',
                'booking_id'   => (int) $booking_id,
                'stay_id'      => (int) $match['stay_id'],
                'confirm_move' => (int) $booking_id,
            ];
        }
    }

    /**
     * An assumed payment that now sits on a booking the ledger has since come
     * to see as a copy.
     *
     * It is never deleted quietly. A reversal is a second, labelled adjustment
     * that cancels it, so the record shows both what was assumed and that it
     * was taken back.
     */
    private static function assumed_on_a_copy(array &$items): void
    {
        $copies = Reports::direct_copy_ids();

        foreach (Adjustments::all() as $adjustment) {
            if ((string) $adjustment['type'] !== Adjustments::ASSUMED_PAID) {
                continue;
            }
            $booking_id = (int) $adjustment['mphb_booking_id'];
            if (!isset($copies[$booking_id])) {
                continue;
            }
            if (Adjustments::assumed_for($booking_id) === null) {
                continue; // already reversed
            }

            $items[] = [
                'key'      => 'assumed_on_copy:' . $booking_id,
                'title'    => __('Assumed Payment On A Copy', 'dcc-ledger'),
                'facts'    => [
                    sprintf(
                        /* translators: 1: booking id, 2: the assumed amount */
                        __('Booking #%1$d carries an assumed payment of %2$s, but it is now recognised as a hand-typed copy of a platform stay.', 'dcc-ledger'),
                        $booking_id,
                        self::money((float) $adjustment['amount'])
                    ),
                    __('Its money came through the platform, so the assumption should not stand. Nothing has been deleted: the figures already count this stay once, on the platform stay.', 'dcc-ledger'),
                ],
                'action'   => __('Reverse the assumed payment. That records a second, labelled adjustment cancelling it, leaving both halves on the record.', 'dcc-ledger'),
                'severity' => 'bad',
                'booking_id'     => $booking_id,
                'reverse_assumed' => $booking_id,
            ];
        }
    }

    /**
     * One of Rob's confirmed moves whose platform stay cannot be found.
     *
     * The seeding links these on Rob's say-so, by the channel and cottage his
     * ruling names. If the stay is not there — not imported yet, or imported
     * under other dates — the booking is left counting on its own, and its
     * money counts on top of the platform payout for the same stay. That is
     * never passed over quietly.
     *
     * @param array<int,array<string,mixed>> $bookings
     */
    private static function confirmed_moves_without_a_stay(array &$items, array $bookings): void
    {
        $by_id = [];
        foreach ($bookings as $booking) {
            $by_id[(int) $booking['id']] = $booking;
        }

        foreach (Copies::CONFIRMED_MOVES as $booking_id => $spec) {
            $booking = $by_id[(int) $booking_id] ?? null;
            if ($booking === null || $booking['is_imported'] || !Linker::is_live($booking)) {
                continue;
            }
            $linked = false;
            foreach (Repo::all_links() as $link) {
                if ((int) $link['mphb_booking_id'] === (int) $booking_id) {
                    $linked = true;
                    break;
                }
            }
            if ($linked) {
                continue;
            }

            if (Copies::confirmed_move_stay($spec, $booking['check_in'], $booking['check_out']) !== null) {
                continue; // It can be found; the matcher will link it.
            }

            $items[] = [
                'key'      => 'confirmed_move_no_stay:' . $booking_id,
                'title'    => __('Confirmed Move With No Platform Stay', 'dcc-ledger'),
                'facts'    => [
                    sprintf(
                        /* translators: 1: booking id, 2: channel, 3: cottage, 4: check-in, 5: check-out */
                        __('MotoPress booking #%1$d is one of the moves Rob confirmed on 2026-10-18, but no %2$s stay can be found in cottage %3$s for %4$s to %5$s to link it to.', 'dcc-ledger'),
                        (int) $booking_id,
                        Cottages::channel_label($spec['channel']),
                        $spec['cottage'],
                        (string) $booking['check_in'],
                        (string) $booking['check_out']
                    ),
                    __('Until it is linked, this booking counts as a stay of its own, and any money on it counts on top of the platform payout for the same nights.', 'dcc-ledger'),
                ],
                'action'   => __('Import that channel\'s reservations for these dates, then run Match Stays To MotoPress again. If the platform stay really is under other dates, link it by hand.', 'dcc-ledger'),
                'severity' => 'bad',
                'booking_id' => (int) $booking_id,
            ];
        }
    }

    /**
     * Links pointing at a stay that does not exist, left behind by 0.1.3.
     */
    private static function links_to_nowhere(array &$items): void
    {
        $bad = Repair::bad_links();
        if ($bad === []) {
            return;
        }

        $ids = [];
        foreach ($bad as $link) {
            $ids[] = (int) $link['id'];
        }

        $items[] = [
            'key'      => 'bad_links:' . implode('-', $ids),
            'title'    => __('Links Pointing At A Stay That Does Not Exist', 'dcc-ledger'),
            'facts'    => [
                sprintf(
                    /* translators: 1: number of links, 2: comma-separated link ids */
                    __('%1$d link rows point at a stay that is not there. Link ids: %2$s.', 'dcc-ledger'),
                    count($bad),
                    implode(', ', $ids)
                ),
                __('Version 0.1.3 could write these when it failed to find the stay for one of Rob\'s confirmed moves. They change no figure, because nothing joins to a stay that is not there.', 'dcc-ledger'),
            ],
            'action'   => __('Remove them. It is recorded as a batch on the Imports tab and can be undone there.', 'dcc-ledger'),
            'severity' => 'warn',
            'remove_bad_links' => count($bad),
        ];
    }

    /**
     * MotoPress changed after the ledger copied it. The old copy is kept as it
     * was, the new one sits beside it, and the difference is for Rob to see.
     */
    private static function changed_since_copied(array &$items): void
    {
        foreach (Originals::superseded() as $old) {
            $current = Originals::current((string) $old['kind'], (int) $old['mphb_id']);
            if ($current === null) {
                continue;
            }
            $what = (string) $old['kind'] === Originals::KIND_PAYMENT
                ? __('payment', 'dcc-ledger')
                : __('booking', 'dcc-ledger');

            $items[] = [
                'key'      => 'mphb_changed:' . $old['kind'] . ':' . $old['mphb_id'] . ':' . $old['id'],
                'title'    => __('MotoPress Changed After The Ledger Copied It', 'dcc-ledger'),
                'facts'    => [
                    sprintf(
                        /* translators: 1: booking or payment, 2: MotoPress id, 3: date it was copied, 4: date it was superseded */
                        __('The %1$s #%2$d in MotoPress is no longer what the ledger copied on %3$s. A new version was recorded on %4$s and the old one was kept exactly as it was.', 'dcc-ledger'),
                        $what,
                        (int) $old['mphb_id'],
                        (string) $old['captured_at'],
                        (string) $old['superseded_at']
                    ),
                    self::describe_change($old, $current),
                ],
                'action'   => __('Check the change was meant. The ledger\'s corrections were not touched by it, and the Original view still shows what was there before.', 'dcc-ledger'),
                'severity' => 'info',
                'booking_id' => (int) ($old['mphb_booking_id'] ?: $old['mphb_id']),
            ];
        }
    }

    /**
     * @param array<string,mixed> $old
     * @param array<string,mixed> $new
     */
    private static function describe_change(array $old, array $new): string
    {
        $changes = [];
        foreach (['cottage', 'check_in', 'check_out', 'booking_status', 'payment_status', 'total', 'amount'] as $field) {
            $before = (string) ($old[$field] ?? '');
            $after  = (string) ($new[$field] ?? '');
            if ($before === $after) {
                continue;
            }
            $changes[] = sprintf(
                /* translators: 1: field name, 2: old value, 3: new value */
                __('%1$s was %2$s, now %3$s', 'dcc-ledger'),
                $field,
                $before === '' ? __('empty', 'dcc-ledger') : $before,
                $after === '' ? __('empty', 'dcc-ledger') : $after
            );
        }
        return $changes === []
            ? __('Nothing the ledger copies looks different; the change was elsewhere.', 'dcc-ledger')
            : implode('; ', $changes) . '.';
    }

    /**
     * A direct booking MotoPress has that the ledger has not copied yet, so
     * none of its money is in any figure.
     *
     * @param array<int,array<string,mixed>> $bookings
     * @param array<int,array<string,mixed>> $copied
     */
    private static function not_yet_copied(array &$items, array $bookings, array $copied): void
    {
        foreach ($bookings as $booking) {
            if ($booking['is_imported'] || !Linker::is_live($booking)) {
                continue;
            }
            if (!Cottages::is_cottage((string) $booking['cottage'])) {
                continue;
            }
            if (isset($copied[(int) $booking['id']])) {
                continue;
            }
            $items[] = [
                'key'      => 'not_copied:' . $booking['id'],
                'title'    => __('A Direct Booking The Ledger Has Not Copied Yet', 'dcc-ledger'),
                'facts'    => [
                    sprintf(
                        /* translators: 1: booking id, 2: cottage, 3: check-in, 4: check-out */
                        __('MotoPress booking #%1$d (cottage %2$s, %3$s to %4$s) has not been copied into the ledger, so none of its money is in any figure.', 'dcc-ledger'),
                        (int) $booking['id'],
                        (string) $booking['cottage'],
                        (string) $booking['check_in'],
                        (string) $booking['check_out']
                    ),
                ],
                'action'   => __('Run Refresh From MotoPress on the Imports tab, or wp dcc-ledger snapshot.', 'dcc-ledger'),
                'severity' => 'warn',
                'booking_id' => (int) $booking['id'],
            ];
        }
    }

    /**
     * Per invoice number, the matched reservations' Final amount and Commission
     * must equal the invoice.
     *
     * @return void
     */
    private static function invoice_reconciliation(array &$items): void
    {
        foreach (self::invoices() as $invoice) {
            if ($invoice['reconciles']) {
                continue;
            }
            $items[] = [
                'key'      => 'invoice:' . $invoice['number'],
                'title'    => __('A Booking.com Invoice That Does Not Reconcile', 'dcc-ledger'),
                'facts'    => [
                    sprintf(
                        /* translators: 1: invoice number, 2: invoiced commission, 3: commission on the matched reservations */
                        __('Invoice %1$s charges %2$s commission; the reservations matched to it come to %3$s.', 'dcc-ledger'),
                        (string) $invoice['number'],
                        self::money((float) $invoice['commission']),
                        self::money((float) $invoice['matched_commission'])
                    ),
                    sprintf(
                        /* translators: 1: invoiced room sales, 2: room sales on the matched reservations, 3: number of reservations */
                        __('Room sales: %1$s invoiced against %2$s across %3$d matched reservations.', 'dcc-ledger'),
                        self::money((float) $invoice['room_sales']),
                        self::money((float) $invoice['matched_room_sales']),
                        (int) $invoice['matched_rows']
                    ),
                ],
                'action'   => __('Import the reservations export covering this invoice\'s period, then check for a reservation Booking.com invoiced under another property.', 'dcc-ledger'),
                'severity' => 'bad',
            ];
        }
    }

    /**
     * Every Booking.com invoice with its reconciliation result.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function invoices(): array
    {
        global $wpdb;
        $lines_t = Schema::lines();

        $rows = $wpdb->get_results(
            "SELECT ref_code, amount, event_date, meta
               FROM {$lines_t}
              WHERE type = 'invoice'
              ORDER BY event_date, ref_code",
            ARRAY_A
        ) ?: [];

        if ($rows === []) {
            return [];
        }

        $matched = $wpdb->get_results(
            "SELECT ref_code,
                    SUM(CASE WHEN type = 'room_sales' THEN amount ELSE 0 END) AS room_sales,
                    SUM(CASE WHEN type = 'commission' THEN amount ELSE 0 END) AS commission,
                    COUNT(DISTINCT stay_id) AS rows_matched
               FROM {$lines_t}
              WHERE type IN ('room_sales','commission') AND ref_code IS NOT NULL AND ref_code <> ''
              GROUP BY ref_code",
            ARRAY_A
        ) ?: [];

        $by_ref = [];
        foreach ($matched as $row) {
            $by_ref[(string) $row['ref_code']] = $row;
        }

        $out = [];
        foreach ($rows as $row) {
            $number = (string) $row['ref_code'];
            $meta   = Repo::decode_meta($row['meta'] ?? null);
            $m      = $by_ref[$number] ?? ['room_sales' => 0, 'commission' => 0, 'rows_matched' => 0];

            $commission = round((float) $row['amount'], 2);
            $room_sales = round((float) ($meta['room_sales'] ?? 0), 2);

            $out[] = [
                'number'             => $number,
                'date'               => (string) $row['event_date'],
                'cottage'            => (string) ($meta['cottage'] ?? ''),
                'period_start'       => (string) ($meta['period_start'] ?? ''),
                'period_end'         => (string) ($meta['period_end'] ?? ''),
                'commission'         => $commission,
                'room_sales'         => $room_sales,
                'matched_commission' => round((float) $m['commission'], 2),
                'matched_room_sales' => round((float) $m['room_sales'], 2),
                'matched_rows'       => (int) $m['rows_matched'],
                'reconciles'         => abs(round((float) $m['commission'] - $commission, 2)) < 0.01
                                        && abs(round((float) $m['room_sales'] - $room_sales, 2)) < 0.01,
            ];
        }

        return $out;
    }

    // ------------------------------------------------------------ helpers

    /**
     * Stays with their money rolled up, in one query.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function stays_with_money(): array
    {
        global $wpdb;
        $stays_t = Schema::stays();
        $lines_t = Schema::lines();

        $sums = [];
        foreach (Reports::MONEY_TYPES as $type) {
            $sums[] = sprintf("SUM(CASE WHEN l.type = '%s' THEN l.amount ELSE 0 END) AS %s", $type, $type);
        }
        $sum_sql = implode(",\n                    ", $sums);

        return $wpdb->get_results(
            "SELECT s.*, {$sum_sql}
               FROM {$stays_t} s
               LEFT JOIN {$lines_t} l ON l.stay_id = s.id
              GROUP BY s.id
              ORDER BY s.check_in, s.id",
            ARRAY_A
        ) ?: [];
    }

    /** @return array<int,array<int,array<string,mixed>>> */
    private static function links_by_stay(): array
    {
        $out = [];
        foreach (Repo::all_links() as $link) {
            $out[(int) $link['stay_id']][] = $link;
        }
        return $out;
    }

    /** @return array<int,bool> */
    private static function links_by_booking(): array
    {
        $out = [];
        foreach (Repo::all_links() as $link) {
            $out[(int) $link['mphb_booking_id']] = true;
        }
        return $out;
    }

    private static function linked(array $links, int $stay_id, int $booking_id): bool
    {
        foreach ($links[$stay_id] ?? [] as $link) {
            if ((int) $link['mphb_booking_id'] === $booking_id) {
                return true;
            }
        }
        return false;
    }

    private static function stay_fact(array $stay): string
    {
        return sprintf(
            /* translators: 1: channel, 2: reservation code, 3: cottage, 4: check-in, 5: check-out */
            __('%1$s reservation %2$s, cottage %3$s, %4$s to %5$s.', 'dcc-ledger'),
            Cottages::channel_label((string) $stay['channel']),
            (string) $stay['code'],
            (string) $stay['cottage'],
            (string) $stay['check_in'],
            $stay['check_out'] !== null ? (string) $stay['check_out'] : __('an unknown date', 'dcc-ledger')
        );
    }

    private static function money(float $amount): string
    {
        return ($amount < 0 ? '-$' : '$') . number_format(abs($amount), 2);
    }
}
