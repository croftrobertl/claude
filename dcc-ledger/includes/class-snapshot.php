<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Copies MotoPress into the ledger, then lays the ledger's own corrections on
 * top of the copy.
 *
 * Rob hand-curated the website and its bookings over two years. The ledger
 * works on a duplicate of that, so if anything here is wrong his original is
 * still intact — in MotoPress, untouched, and in the Originals table, frozen.
 *
 * A snapshot is an ordinary batch: dry run first, idempotent, undoable.
 */
final class Snapshot
{
    public const KIND = 'mphb_snapshot';

    /** Rob's rule: the window the back-payments cover. */
    public const ASSUMED_FROM = Cottages::WINDOW_START;
    public const ASSUMED_TO   = Cottages::RECONCILED_THROUGH;

    /** Only a confirmed booking is a stay that really happened. */
    public const CONFIRMED = 'confirmed';

    /**
     * @return array{
     *   ok:bool, message:string, dry_run:bool, batch_id:int|null,
     *   counts:array<string,int|float>, notes:array<int,string>
     * }
     */
    public static function run(bool $dry_run = false, ?int $user_id = null): array
    {
        $health = Health::check();
        if (!$health['ok']) {
            $names = [];
            foreach ($health['missing'] as $item) {
                $names[] = $item['what'];
            }
            return [
                'ok'       => false,
                'message'  => sprintf(
                    /* translators: %s: comma-separated list of missing MotoPress keys */
                    __('MotoPress is missing %s, so a snapshot would copy nothing and report zero. Nothing was written.', 'dcc-ledger'),
                    implode(', ', $names)
                ),
                'dry_run'  => true,
                'batch_id' => null,
                'counts'   => [],
                'notes'    => [],
            ];
        }

        $counts = [
            'bookings_read'      => 0,
            'bookings_new'       => 0,
            'bookings_changed'   => 0,
            'bookings_unchanged' => 0,
            'payments_new'       => 0,
            'payments_changed'   => 0,
            'payments_unchanged' => 0,
            'assumed_bookings'   => 0,
            'assumed_total'      => 0.0,
            'assumed_existing'   => 0,
            'copies_skipped'     => 0,
            'overpaid_skipped'   => 0,
            'outside_window'     => 0,
            'assumed_withheld'   => 0,
            'assumed_pre_exports'       => 0,
            'assumed_pre_exports_total' => 0.0,
            'refunds_recorded'          => 0,
            'refunds_total'             => 0.0,
            // Counted over the SAME bookings as copies_skipped, each one once,
            // by the first signal that caught it — so the parts add up to the
            // total. They used to be counted over every copy detected, while
            // the total counted only the ones that got as far as the
            // assumed-paid rule, and the two never matched.
            'copies_by_link'     => 0,
            'copies_by_code'     => 0,
            'copies_by_dates'    => 0,
            'copies_detected'    => 0,
            'probable_moves'     => 0,
            'moves_unnamed'      => 0,
            // Booking ids only, for --verbose. Never a name, never a note.
            'copy_ids'           => [],
            'move_ids'           => [],
        ];
        $notes = [];

        $bookings = self::direct_bookings();

        $live     = Copies::from_live();
        $detected = Copies::detect($live);
        $copies   = Copies::ids($detected);

        $counts['copies_detected'] = count($detected);

        // A probable move is a question, not a finding: the booking counts as
        // the real stay Rob's rule says it is until he confirms otherwise.
        $moves = Copies::probable_moves($live);
        foreach ($moves as $booking_id => $move) {
            $counts['probable_moves']++;
            if (!$move['named']) {
                $counts['moves_unnamed']++;
            }
            $counts['move_ids'][] = (int) $booking_id;
        }

        $batch_id   = $dry_run ? 0 : Batches::create(self::KIND, __('MotoPress snapshot', 'dcc-ledger'), $user_id);
        $superseded = [];

        foreach ($bookings as $booking) {
            $counts['bookings_read']++;

            $row = [
                'kind'           => Originals::KIND_BOOKING,
                'mphb_id'        => (int) $booking['id'],
                'cottage'        => (string) $booking['cottage'],
                'check_in'       => $booking['check_in'],
                'check_out'      => $booking['check_out'],
                'booking_status' => (string) $booking['status'],
                'total'          => (float) $booking['total'],
                'event_date'     => $booking['check_in'],
                // Only the extracted codes travel into the ledger; the notes
                // they came from are not stored anywhere.
                'codes'          => array_merge($booking['codes'], $booking['note_codes']),
                // Salted hashes of the surname, never the surname.
                'guest_keys'     => $booking['guest_keys'] ?? [],
            ];

            if ($dry_run) {
                $current = Originals::current(Originals::KIND_BOOKING, (int) $booking['id']);
                $hash    = Originals::content_hash($row);
                if ($current === null) {
                    $counts['bookings_new']++;
                } elseif ((string) $current['content_hash'] === $hash) {
                    $counts['bookings_unchanged']++;
                } else {
                    $counts['bookings_changed']++;
                }
            } else {
                $out = Originals::capture($row, $batch_id);
                $counts['bookings_' . ($out['action'] === 'changed' ? 'changed' : ($out['action'] === 'new' ? 'new' : 'unchanged'))]++;
                if ($out['superseded'] !== null) {
                    $superseded[] = $out['superseded'];
                }
            }

            foreach ($booking['payments'] as $payment) {
                $payment_row = [
                    'kind'            => Originals::KIND_PAYMENT,
                    'mphb_id'         => (int) $payment['payment_id'],
                    'mphb_booking_id' => (int) $booking['id'],
                    'cottage'         => (string) $booking['cottage'],
                    'payment_status'  => (string) $payment['status'],
                    'amount'          => (float) $payment['amount'],
                    'event_date'      => $payment['date'],
                ];

                if ($dry_run) {
                    $current = Originals::current(Originals::KIND_PAYMENT, (int) $payment['payment_id']);
                    $hash    = Originals::content_hash($payment_row);
                    if ($current === null) {
                        $counts['payments_new']++;
                    } elseif ((string) $current['content_hash'] === $hash) {
                        $counts['payments_unchanged']++;
                    } else {
                        $counts['payments_changed']++;
                    }
                    continue;
                }

                $out = Originals::capture($payment_row, $batch_id);
                $counts['payments_' . ($out['action'] === 'changed' ? 'changed' : ($out['action'] === 'new' ? 'new' : 'unchanged'))]++;
                if ($out['superseded'] !== null) {
                    $superseded[] = $out['superseded'];
                }
            }
        }

        // The order trap. A snapshot taken before the platform exports are in
        // cannot tell a hand-typed copy from a real direct booking, because
        // there are no stays to compare against — and an assumed payment, once
        // written, is never silently removed. So the copy is made either way,
        // and the assumed payments wait.
        if (self::reservations_imported()) {
            self::assume_paid($bookings, $detected, $counts, $notes, $dry_run, $batch_id, $user_id);
            self::apply_pre_export_ruling($bookings, $detected, $counts, $dry_run, $batch_id, $user_id);
        } else {
            $counts['assumed_withheld'] = 1;
            $notes[] = __('No platform reservations have been imported yet, so no assumed payments were written. Without the platform stays there is nothing to recognise a hand-typed copy by, and every copy would be assumed paid — which cannot be undone quietly afterwards. Import the reservations exports first, then run this again.', 'dcc-ledger');
        }

        // Refunds Rob knows about that never reached MotoPress. Not gated on
        // the exports: they are a ruling about three named bookings, and the
        // amount is worked out from the booking itself.
        self::apply_refund_ruling($bookings, $counts, $dry_run, $batch_id, $user_id);

        if ($dry_run) {
            return [
                'ok'       => true,
                'message'  => __('Dry run complete. Nothing was written.', 'dcc-ledger'),
                'dry_run'  => true,
                'batch_id' => null,
                'counts'   => $counts,
                'notes'    => $notes,
            ];
        }

        Batches::finish($batch_id, [
            'read'      => $counts['bookings_read'],
            'inserted'  => $counts['bookings_new'] + $counts['bookings_changed']
                           + $counts['payments_new'] + $counts['payments_changed']
                           + $counts['assumed_bookings'],
            'unchanged' => $counts['bookings_unchanged'] + $counts['payments_unchanged'],
            'skipped'   => $counts['copies_skipped'] + $counts['overpaid_skipped'] + $counts['outside_window'],
            'excluded'  => 0,
        ], [], $superseded);

        Reports::flush_cache();

        // Counts only — never a booking's contents.
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log(sprintf(
                'DCCL: snapshot batch %d bookings_new=%d bookings_changed=%d payments_new=%d assumed=%d',
                $batch_id,
                $counts['bookings_new'],
                $counts['bookings_changed'],
                $counts['payments_new'],
                $counts['assumed_bookings']
            ));
        }

        return [
            'ok'       => true,
            'message'  => __('Snapshot complete.', 'dcc-ledger'),
            'dry_run'  => false,
            'batch_id' => $batch_id,
            'counts'   => $counts,
            'notes'    => $notes,
        ];
    }

    /**
     * Rob's rule: every direct booking that checked out inside the window, is
     * confirmed, and is not a copy of an OTA stay is treated as paid in full.
     * The gap between its total and its completed payments becomes one
     * labelled adjustment, dated at check-in because the real date is unknown.
     *
     * Never applied to a copy, to a booking already paid more than its total,
     * or to a cancelled booking.
     *
     * @param array<int,array<string,mixed>>           $bookings
     * @param array<int,array<string,mixed>>           $copies  detected copies, keyed by booking id
     * @param array<string,int|float|array<int,int>>   $counts
     * @param array<int,string>                        $notes
     */
    private static function assume_paid(
        array $bookings,
        array $copies,
        array &$counts,
        array &$notes,
        bool $dry_run,
        int $batch_id,
        ?int $user_id
    ): void {
        foreach ($bookings as $booking) {
            if ((string) $booking['status'] !== self::CONFIRMED) {
                continue; // A dock block is not a stay.
            }
            if ($booking['check_out'] === null
                || $booking['check_out'] < self::ASSUMED_FROM
                || $booking['check_out'] > self::ASSUMED_TO) {
                $counts['outside_window']++;
                continue;
            }
            if (isset($copies[(int) $booking['id']])) {
                // Its money belongs to the OTA stay, once.
                $counts['copies_skipped']++;
                $counts['copy_ids'][] = (int) $booking['id'];
                $reason = (string) $copies[(int) $booking['id']]['reason'];
                if (in_array($reason, Copies::REASON_ORDER, true)) {
                    $counts['copies_by_' . $reason]++;
                }
                continue;
            }

            $gap = round((float) $booking['total'] - (float) $booking['paid_recorded'], 2);
            if ($gap <= 0.0) {
                if ($gap < 0.0) {
                    // Recorded as paid more than the total. Shown as it is,
                    // never capped, and never topped up.
                    $counts['overpaid_skipped']++;
                }
                continue;
            }

            $existing = self::existing_assumed((int) $booking['id']);
            if ($existing !== null) {
                $counts['assumed_existing']++;
                if (abs(round((float) $existing['amount'] - $gap, 2)) >= 0.01) {
                    $notes[] = sprintf(
                        /* translators: 1: booking id, 2: the stored adjustment, 3: the gap now */
                        __('Booking #%1$d already has an assumed payment of %2$s, but the gap is now %3$s. The stored adjustment was left as it is.', 'dcc-ledger'),
                        (int) $booking['id'],
                        number_format((float) $existing['amount'], 2),
                        number_format($gap, 2)
                    );
                }
                continue;
            }

            $counts['assumed_bookings']++;
            $counts['assumed_total'] = round(((float) $counts['assumed_total']) + $gap, 2);

            if ($dry_run) {
                continue;
            }

            Adjustments::add([
                'type'            => Adjustments::ASSUMED_PAID,
                'channel'         => 'direct',
                'mphb_booking_id' => (int) $booking['id'],
                'cottage'         => (string) $booking['cottage'],
                'amount'          => $gap,
                'event_date'      => $booking['check_in'],
                'label'           => Adjustments::label_for(Adjustments::ASSUMED_PAID),
                'note'            => __('Assumed, actual date unknown. Dated at check-in.', 'dcc-ledger'),
            ], $batch_id, $user_id);
        }
    }

    /**
     * Rob's ruling of 2026-10-21 on the fifteen stays that predate the
     * exports. They are named one by one, not swept in by a widened window:
     * there are no platform exports before 2025, so nothing there can be
     * checked against a platform stay, and copy detection cannot run at all.
     *
     * @param array<int,array<string,mixed>> $bookings
     * @param array<int,array<string,mixed>> $copies
     * @param array<string,int|float|array> $counts
     */
    private static function apply_pre_export_ruling(
        array $bookings,
        array $copies,
        array &$counts,
        bool $dry_run,
        int $batch_id,
        ?int $user_id
    ): void {
        $by_id = [];
        foreach ($bookings as $booking) {
            $by_id[(int) $booking['id']] = $booking;
        }

        foreach (Rulings::ASSUMED_BEFORE_EXPORTS as $booking_id) {
            $booking = $by_id[$booking_id] ?? null;
            if ($booking === null || (string) $booking['status'] !== self::CONFIRMED) {
                continue;
            }
            // Cannot happen before 2025 — there are no platform stays to be a
            // copy of — but the check costs nothing and keeps the rule honest.
            if (isset($copies[$booking_id])) {
                continue;
            }
            if (Adjustments::assumed_for($booking_id) !== null) {
                $counts['assumed_existing']++;
                continue;
            }

            $gap = round((float) $booking['total'] - (float) $booking['paid_recorded'], 2);
            if ($gap <= 0.0) {
                continue;
            }

            $counts['assumed_pre_exports']++;
            $counts['assumed_pre_exports_total'] = round(
                ((float) $counts['assumed_pre_exports_total']) + $gap,
                2
            );

            if ($dry_run) {
                continue;
            }

            Adjustments::add([
                'type'            => Adjustments::ASSUMED_PRE_EXPORTS,
                'channel'         => 'direct',
                'mphb_booking_id' => $booking_id,
                'cottage'         => (string) $booking['cottage'],
                'amount'          => $gap,
                'event_date'      => $booking['check_in'],
                'label'           => Adjustments::label_for(Adjustments::ASSUMED_PRE_EXPORTS),
                'note'            => __('Rob\'s ruling of 2026-10-21. Assumed, actual date unknown; dated at check-in. No platform exports cover this period, so nothing here could be checked against a platform stay.', 'dcc-ledger'),
            ], $batch_id, $user_id);
        }
    }

    /**
     * Rob's ruling of 2026-10-21 on the three bookings recorded as paid for
     * more than their total: each was refunded, and the refund never reached
     * MotoPress.
     *
     * The amount is the overpayment as it stands when the ruling is applied,
     * so the booking lands on exactly its total rather than on a figure typed
     * in once and left behind.
     *
     * @param array<int,array<string,mixed>> $bookings
     * @param array<string,int|float|array> $counts
     */
    private static function apply_refund_ruling(
        array $bookings,
        array &$counts,
        bool $dry_run,
        int $batch_id,
        ?int $user_id
    ): void {
        $by_id = [];
        foreach ($bookings as $booking) {
            $by_id[(int) $booking['id']] = $booking;
        }

        foreach (Rulings::UNRECORDED_REFUNDS as $booking_id) {
            $booking = $by_id[$booking_id] ?? null;
            if ($booking === null || (string) $booking['status'] !== self::CONFIRMED) {
                continue;
            }
            if (Adjustments::refund_for($booking_id) !== null) {
                continue;
            }

            $over = round((float) $booking['paid_recorded'] - (float) $booking['total'], 2);
            if ($over <= 0.0) {
                continue;
            }

            $counts['refunds_recorded']++;
            $counts['refunds_total'] = round(((float) $counts['refunds_total']) - $over, 2);

            if ($dry_run) {
                continue;
            }

            Adjustments::add([
                'type'            => Adjustments::REFUND_UNRECORDED,
                'channel'         => 'direct',
                'mphb_booking_id' => $booking_id,
                'cottage'         => (string) $booking['cottage'],
                'amount'          => -1 * $over,
                'event_date'      => $booking['check_out'] ?? $booking['check_in'],
                'label'           => Adjustments::label_for(Adjustments::REFUND_UNRECORDED),
                'note'            => __('Rob\'s ruling of 2026-10-21: refunded, and the refund never reached MotoPress. Dated at check-out.', 'dcc-ledger'),
            ], $batch_id, $user_id);
        }
    }

    /** @return array<string,mixed>|null */
    private static function existing_assumed(int $booking_id): ?array
    {
        foreach (Adjustments::for_booking($booking_id) as $adjustment) {
            if ((string) $adjustment['type'] === Adjustments::ASSUMED_PAID) {
                return $adjustment;
            }
        }
        return null;
    }

    /**
     * Direct bookings: everything MotoPress holds that did not arrive through
     * an iCal feed. Cancelled ones are copied too — the Original is a copy of
     * what is there, not a judgement about it — but they never earn an
     * adjustment.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function direct_bookings(): array
    {
        $out = [];
        foreach (Mphb_Reader::bookings() as $booking) {
            if ($booking['is_imported']) {
                continue;
            }
            if (!Cottages::is_cottage((string) $booking['cottage'])) {
                continue;
            }
            $out[] = $booking;
        }
        return $out;
    }

    /**
     * Which direct bookings are copies of an OTA stay, read from MotoPress as
     * it stands now — the snapshot has to know before it copies anything.
     *
     * @return array<int,bool>
     */
    public static function copy_booking_ids(array $bookings = []): array
    {
        return Copies::ids(Copies::detect(Copies::from_live()));
    }

    /**
     * Has at least one platform reservations export been imported and kept?
     *
     * Payout files alone are not enough: they carry money, but the stays they
     * create are thin, and copy detection leans on the reservations.
     */
    public static function reservations_imported(): bool
    {
        foreach (Batches::all(500) as $batch) {
            if (!str_ends_with((string) $batch['kind'], '_reservations')) {
                continue;
            }
            if (Batches::is_undone($batch)) {
                continue;
            }
            if ((int) $batch['rows_inserted'] > 0 || (int) $batch['rows_unchanged'] > 0) {
                return true;
            }
        }
        return false;
    }

    public static function taken(): bool
    {
        return Originals::count(Originals::KIND_BOOKING) > 0;
    }
}
