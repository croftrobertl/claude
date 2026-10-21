<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The figures.
 *
 * Two bases, chosen by the admin:
 *   'stay'   — money and nights belong to the dates of the stay, and a stay
 *              that straddles the period boundary is split by its nights.
 *   'payout' — money belongs to the date it moved (the payout, refund or
 *              payment date). This is cash, not earnings.
 *
 * Nothing here is advice. Taxes are reported in three separate buckets and
 * never summed into one "tax" figure, because they are three different facts:
 * what the platform collected and remitted itself, what it handed to Rob
 * inside a payout for him to remit, and what a platform does not report at all.
 */
final class Reports
{
    public const MONEY_TYPES = [
        'guest_total', 'room_sales', 'commission', 'service_fee',
        'tax_platform_remitted', 'tax_in_payout', 'payout', 'refund',
        'adjustment', 'resolution', 'cancellation_fee', 'cancellation_fee_refund',
    ];

    /** Lines whose money moved, for the 'payout' (cash) basis. */
    public const CASH_TYPES = [
        'payout', 'refund', 'adjustment', 'resolution',
        'cancellation_fee', 'cancellation_fee_refund',
    ];

    // ------------------------------------------------------------ periods

    /**
     * @return array{from:string,to:string,label:string,kind:string}
     */
    public static function period(string $kind, string $value = '', string $from = '', string $to = ''): array
    {
        $today = Dates::today();

        switch ($kind) {
            case 'year':
                $year = preg_match('/^\d{4}$/', $value) === 1 ? $value : substr($today, 0, 4);
                return [
                    'from'  => $year . '-01-01',
                    'to'    => $year . '-12-31',
                    'label' => $year,
                    'kind'  => 'year',
                ];

            case 'season':
                $range = Mphb_Reader::season_range((int) $value);
                $name  = '';
                foreach (Mphb_Reader::seasons() as $season) {
                    if ($season['id'] === (int) $value) {
                        $name = $season['name'];
                    }
                }
                if ($range === null) {
                    return self::period('month', substr($today, 0, 7));
                }
                return [
                    'from'  => $range['start'],
                    'to'    => $range['end'],
                    'label' => $name !== '' ? $name : __('Season', 'dcc-ledger'),
                    'kind'  => 'season',
                ];

            case 'custom':
                $start = Dates::is_valid($from) ? $from : substr($today, 0, 8) . '01';
                $end   = Dates::is_valid($to) ? $to : $today;
                if ($end < $start) {
                    [$start, $end] = [$end, $start];
                }
                return [
                    'from'  => $start,
                    'to'    => $end,
                    /* translators: 1: start date, 2: end date */
                    'label' => sprintf(__('%1$s to %2$s', 'dcc-ledger'), $start, $end),
                    'kind'  => 'custom',
                ];

            case 'month':
            default:
                $month = preg_match('/^\d{4}-\d{2}$/', $value) === 1 ? $value : substr($today, 0, 7);
                $start = $month . '-01';
                $end   = date('Y-m-t', strtotime($start));
                return [
                    'from'  => $start,
                    'to'    => $end,
                    'label' => date_i18n('F Y', strtotime($start)),
                    'kind'  => 'month',
                ];
        }
    }

    // ------------------------------------------------------------ summary

    /**
     * @return array<string,mixed>
     */
    public const VIEWS = ['original', 'ledger', 'difference'];

    /**
     * @param string $view 'original'   — what MotoPress held, copied and frozen
     *                     'ledger'     — the Original plus the ledger's corrections
     *                     'difference' — the corrections alone
     */
    public static function summary(string $from, string $to, string $basis = 'stay', string $view = 'ledger'): array
    {
        $basis = $basis === 'payout' ? 'payout' : 'stay';
        $view  = in_array($view, self::VIEWS, true) ? $view : 'ledger';
        $key   = self::cache_key(['summary', $from, $to, $basis, $view]);
        $hit   = self::cache_get($key);
        if ($hit !== null) {
            return $hit;
        }

        $ota    = self::ota_figures($from, $to, $basis);
        $direct = self::direct_figures($from, $to, $basis, $view);

        $days      = Dates::days_inclusive($from, $to);
        $capacity  = $days * count(Cottages::COTTAGES);
        $nights    = $ota['nights'] + $direct['nights'];
        $occupancy = $capacity > 0 ? round($nights / $capacity * 100, 1) : 0.0;

        // Room revenue: what the guest paid the platform for the room, before
        // the platform's cut and before any tax that sits inside a payout.
        $room_revenue = round($ota['guest_total'] - $ota['tax_in_payout'] - $ota['tax_platform_remitted'], 2);
        $adr_base     = $ota['nights'] > 0 ? round($room_revenue / $ota['nights'], 2) : 0.0;

        $summary = [
            'from'   => $from,
            'to'     => $to,
            'basis'  => $basis,
            'view'   => $view,
            'days'   => $days,
            'ota'    => $ota,
            'direct' => $direct,
            'totals' => [
                'nights'            => $nights,
                'occupancy_pct'     => $occupancy,
                'capacity_nights'   => $capacity,
                'guest_total'       => $ota['guest_total'],
                'platform_fees'     => $ota['platform_fees'],
                'net_payout'        => $ota['net_payout'],
                'room_revenue'      => $room_revenue,
                'adr'               => $adr_base,
                'tax_platform_remitted' => $ota['tax_platform_remitted'],
                'tax_in_payout'         => $ota['tax_in_payout'],
                'tax_not_reported'      => $ota['tax_not_reported'],
                'direct_due'        => $direct['due'],
                'direct_recorded'   => $direct['recorded'],
                'direct_assumed'    => $direct['assumed'],
                'direct_refunded'   => $direct['refunded'],
                'direct_assumed_pre_exports' => $direct['assumed_pre_exports'],
                'direct_refunds'    => $direct['refunds'],
                // What this view counts as paid on direct bookings.
                'direct_paid'       => $direct['paid'],
                'cancellations'     => $ota['cancellations'],
                'cancellation_fees' => $ota['cancellation_fees'],
                'lead_time_median'  => $ota['lead_time_median'],
            ],
            'by_cottage'  => self::merge_breakdowns($ota['by_cottage'], $direct['by_cottage']),
            'by_channel'  => self::merge_breakdowns($ota['by_channel'], $direct['by_channel']),
            'snapshot_taken'     => $direct['snapshot_taken'],
            'snapshot_at'        => $direct['snapshot_at'],
            'reconciled_through' => Cottages::RECONCILED_THROUGH,
            'beyond_window'      => $to > Cottages::RECONCILED_THROUGH,
            'before_window'      => $from < Cottages::WINDOW_START,
        ];

        self::cache_set($key, $summary);

        return $summary;
    }

    /**
     * Platform money and nights.
     *
     * @return array<string,mixed>
     */
    private static function ota_figures(string $from, string $to, string $basis): array
    {
        global $wpdb;

        $stays_t = Schema::stays();
        $lines_t = Schema::lines();

        $sums = [];
        foreach (self::MONEY_TYPES as $type) {
            $sums[] = sprintf(
                "SUM(CASE WHEN l.type = '%s' THEN l.amount ELSE 0 END) AS t_%s",
                $type,
                $type
            );
        }
        $sum_sql = implode(",\n                       ", $sums);

        // One grouped query per period; the PHP below walks the stays that
        // overlap the period only, never the whole history.
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.id, s.channel, s.cottage, s.check_in, s.check_out, s.nights,
                        s.status, s.booked_on,
                        {$sum_sql}
                   FROM {$stays_t} s
                   LEFT JOIN {$lines_t} l ON l.stay_id = s.id
                  WHERE s.check_in IS NOT NULL
                    AND s.check_in <= %s
                    AND COALESCE(s.check_out, s.check_in) >= %s
                  GROUP BY s.id, s.channel, s.cottage, s.check_in, s.check_out, s.nights, s.status, s.booked_on",
                $to,
                $from
            ),
            ARRAY_A
        ) ?: [];

        $figures = self::blank_figures();
        $lead    = [];

        foreach ($rows as $row) {
            $status    = (string) $row['status'];
            $check_in  = (string) $row['check_in'];
            $check_out = $row['check_out'] !== null ? (string) $row['check_out'] : null;

            $total_nights = (int) ($row['nights'] ?? 0);
            if ($total_nights <= 0) {
                $total_nights = Dates::nights($check_in, $check_out) ?? 0;
            }

            $in_period = $status === 'ok'
                ? Dates::nights_in_period($check_in, $check_out, $from, $to)
                : 0;

            // A stay with unknown dates still belongs to the period its
            // check-in falls in; it just contributes no nights.
            $share = 1.0;
            if ($basis === 'stay' && $total_nights > 0) {
                $share = $in_period / $total_nights;
            } elseif ($basis === 'stay' && ($check_in < $from || $check_in > $to)) {
                $share = 0.0;
            }

            if ($basis === 'payout') {
                // Cash basis: the stay's own dates are irrelevant, so this
                // branch is handled by a separate query below.
                $share = 0.0;
            }

            if ($status === 'ok') {
                $figures['nights'] += $in_period;
                $figures['by_cottage'][(string) $row['cottage']]['nights'] += $in_period;
                $figures['by_channel'][(string) $row['channel']]['nights'] += $in_period;
            }

            if ($status === 'cancelled' && $check_in >= $from && $check_in <= $to) {
                $figures['cancellations']++;
            }

            if ($status === 'ok' && $row['booked_on'] !== null && $check_in >= $from && $check_in <= $to) {
                $days = Dates::nights(substr((string) $row['booked_on'], 0, 10), $check_in);
                if ($days !== null) {
                    $lead[] = $days;
                }
            }

            if ($share > 0.0) {
                self::add_money($figures, $row, $share, (string) $row['cottage'], (string) $row['channel']);
            }

            // Cancellation fees are money even on a cancelled stay, and they
            // are always reported on the date of the stay's check-in.
            if ($basis === 'stay' && $status !== 'ok' && $check_in >= $from && $check_in <= $to) {
                self::add_money($figures, $row, 1.0, (string) $row['cottage'], (string) $row['channel'], true);
            }
        }

        if ($basis === 'payout') {
            self::add_cash_basis($figures, $from, $to);
        }

        sort($lead);
        $count = count($lead);
        $figures['lead_time_median'] = $count === 0
            ? null
            : ($count % 2 === 1
                ? $lead[intdiv($count, 2)]
                : (int) round(($lead[$count / 2 - 1] + $lead[$count / 2]) / 2));

        $figures['platform_fees'] = round($figures['commission'] + $figures['service_fee'], 2);
        $figures['net_payout']    = round(
            $figures['payout'] + $figures['refund'] + $figures['adjustment']
            + $figures['resolution'] + $figures['cancellation_fee'] + $figures['cancellation_fee_refund'],
            2
        );
        $figures['cancellation_fees'] = round($figures['cancellation_fee'] + $figures['cancellation_fee_refund'], 2);

        // Vrbo reports no tax at all — both of its tax columns are 0 in every
        // row Rob has. That is reported as "not reported", never as $0.
        $figures['tax_not_reported'] = self::channels_without_tax($from, $to);

        foreach (array_keys($figures['by_cottage']) as $cottage) {
            $figures['by_cottage'][$cottage] = self::finish_breakdown($figures['by_cottage'][$cottage]);
        }
        foreach (array_keys($figures['by_channel']) as $channel) {
            $figures['by_channel'][$channel] = self::finish_breakdown($figures['by_channel'][$channel]);
        }

        return $figures;
    }

    /**
     * Cash basis: money sits on the date it moved, with no reference to the
     * stay's dates at all.
     *
     * @param array<string,mixed> $figures
     */
    private static function add_cash_basis(array &$figures, string $from, string $to): void
    {
        global $wpdb;

        $stays_t = Schema::stays();
        $lines_t = Schema::lines();

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT l.type, l.channel, COALESCE(s.cottage, '') AS cottage, SUM(l.amount) AS total
                   FROM {$lines_t} l
                   LEFT JOIN {$stays_t} s ON s.id = l.stay_id
                  WHERE l.event_date BETWEEN %s AND %s
                    AND l.type <> 'invoice'
                  GROUP BY l.type, l.channel, cottage",
                $from,
                $to
            ),
            ARRAY_A
        ) ?: [];

        foreach ($rows as $row) {
            $type    = (string) $row['type'];
            $amount  = round((float) $row['total'], 2);
            $cottage = (string) $row['cottage'];
            $channel = (string) $row['channel'];

            if (!isset($figures[$type])) {
                continue;
            }
            $figures[$type] = round($figures[$type] + $amount, 2);

            if ($cottage !== '') {
                $figures['by_cottage'][$cottage] ??= self::blank_breakdown();
                $figures['by_cottage'][$cottage][$type] = round(($figures['by_cottage'][$cottage][$type] ?? 0) + $amount, 2);
            }
            $figures['by_channel'][$channel] ??= self::blank_breakdown();
            $figures['by_channel'][$channel][$type] = round(($figures['by_channel'][$channel][$type] ?? 0) + $amount, 2);
        }
    }

    /**
     * @param array<string,mixed> $figures
     * @param array<string,mixed> $row
     */
    private static function add_money(
        array &$figures,
        array $row,
        float $share,
        string $cottage,
        string $channel,
        bool $fees_only = false
    ): void {
        $types = $fees_only
            ? ['cancellation_fee', 'cancellation_fee_refund', 'refund', 'adjustment', 'resolution']
            : self::MONEY_TYPES;

        foreach ($types as $type) {
            $amount = round(((float) ($row['t_' . $type] ?? 0)) * $share, 2);
            if ($amount == 0.0) {
                continue;
            }
            $figures[$type] = round($figures[$type] + $amount, 2);

            $figures['by_cottage'][$cottage] ??= self::blank_breakdown();
            $figures['by_cottage'][$cottage][$type] = round($figures['by_cottage'][$cottage][$type] + $amount, 2);

            $figures['by_channel'][$channel] ??= self::blank_breakdown();
            $figures['by_channel'][$channel][$type] = round($figures['by_channel'][$channel][$type] + $amount, 2);
        }
    }

    /**
     * Channels that reported no tax of either kind in this period. Their tax
     * is unknown, not zero.
     *
     * @return string[]
     */
    private static function channels_without_tax(string $from, string $to): array
    {
        global $wpdb;
        $stays_t = Schema::stays();
        $lines_t = Schema::lines();

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.channel,
                        SUM(CASE WHEN l.type IN ('tax_in_payout','tax_platform_remitted') THEN ABS(l.amount) ELSE 0 END) AS tax,
                        COUNT(DISTINCT s.id) AS stays
                   FROM {$stays_t} s
                   LEFT JOIN {$lines_t} l ON l.stay_id = s.id
                  WHERE s.check_in <= %s AND COALESCE(s.check_out, s.check_in) >= %s
                  GROUP BY s.channel",
                $to,
                $from
            ),
            ARRAY_A
        ) ?: [];

        $out = [];
        foreach ($rows as $row) {
            if ((int) $row['stays'] > 0 && round((float) $row['tax'], 2) == 0.0) {
                $out[] = (string) $row['channel'];
            }
        }
        return $out;
    }

    /**
     * Direct bookings, read from the ledger's own copy of MotoPress.
     *
     * Nothing here reads MotoPress live. The figures come from the Originals
     * the snapshot froze, plus the adjustments the ledger laid on top — which
     * is the whole point: Rob's data is duplicated, and the ledger is modified
     * from the duplicate.
     *
     * A hand-typed copy of an OTA stay is excluded, so its nights and money
     * count once, on the OTA stay.
     *
     * @return array<string,mixed>
     */
    public static function direct_figures(string $from, string $to, string $basis, string $view = 'ledger'): array
    {
        $copies = self::direct_copy_ids();

        $out = [
            'nights'     => 0,
            'due'        => 0.0,
            'recorded'   => 0.0,
            'refunded'   => 0.0,
            'assumed'    => 0.0,
            // Rob's ruling on the stays that predate the exports, kept apart
            // from the window rule so the two are never read as one figure.
            'assumed_pre_exports' => 0.0,
            // Refunds he knows about that never reached MotoPress.
            'refunds'    => 0.0,
            'paid'       => 0.0,
            'bookings'   => 0,
            'by_cottage' => [],
            'by_channel' => [],
            'copies_excluded' => 0,
            'copy_payments'   => 0.0,
            'snapshot_taken'  => Snapshot::taken(),
            'snapshot_at'     => Originals::last_snapshot_at(),
        ];

        $adjustments = self::adjustments_by_booking();

        foreach (Originals::bookings_with_payments() as $booking_id => $booking) {
            // A cancelled booking is copied, because the copy is of what is
            // there — but it is never a stay and never carries money here.
            if ((string) $booking['booking_status'] !== Snapshot::CONFIRMED) {
                continue;
            }

            $cottage = (string) $booking['cottage'];
            if (!Cottages::is_cottage($cottage)) {
                continue;
            }

            if (isset($copies[$booking_id])) {
                if (Dates::nights_in_period($booking['check_in'], $booking['check_out'], $from, $to) > 0) {
                    $out['copies_excluded']++;
                    $out['copy_payments'] = round($out['copy_payments'] + (float) $booking['paid'], 2);
                }
                continue;
            }

            $nights = Dates::nights_in_period($booking['check_in'], $booking['check_out'], $from, $to);
            $total  = Dates::nights($booking['check_in'], $booking['check_out']) ?? 0;

            if ($nights > 0) {
                $out['nights'] += $nights;
                $out['by_cottage'][$cottage] ??= self::blank_breakdown();
                $out['by_cottage'][$cottage]['nights'] += $nights;
                $out['by_channel']['direct'] ??= self::blank_breakdown();
                $out['by_channel']['direct']['nights'] += $nights;
            }

            // A booking carries at most one kind of assumption, so its net
            // belongs wholly to that bucket.
            $assumed     = 0.0;
            $refunds     = 0.0;
            $pre_exports = false;
            foreach ($adjustments[$booking_id] ?? [] as $adjustment) {
                $type = (string) $adjustment['type'];
                if (in_array($type, Adjustments::ASSUMED_TYPES, true)) {
                    $assumed = round($assumed + (float) $adjustment['amount'], 2);
                    $pre_exports = $pre_exports || $type === Adjustments::ASSUMED_PRE_EXPORTS;
                }
                if ($type === Adjustments::REFUND_UNRECORDED) {
                    $refunds = round($refunds + (float) $adjustment['amount'], 2);
                }
            }

            if ($basis === 'stay') {
                $share = $total > 0
                    ? $nights / $total
                    : (($booking['check_in'] >= $from && $booking['check_in'] <= $to) ? 1.0 : 0.0);
                if ($share > 0) {
                    $out['bookings'] += $nights > 0 ? 1 : 0;
                    $out['due']      = round($out['due'] + (float) $booking['total'] * $share, 2);
                    $out['recorded'] = round($out['recorded'] + (float) $booking['paid'] * $share, 2);
                    $out['refunded'] = round($out['refunded'] + (float) $booking['refunded'] * $share, 2);
                    $out['refunds']  = round($out['refunds'] + $refunds * $share, 2);
                    if ($pre_exports) {
                        $out['assumed_pre_exports'] = round($out['assumed_pre_exports'] + $assumed * $share, 2);
                    } else {
                        $out['assumed'] = round($out['assumed'] + $assumed * $share, 2);
                    }
                }
                continue;
            }

            // Cash basis: each payment on its own date, each adjustment on its
            // own. An assumed adjustment is dated at check-in, which is why a
            // stay that began in 2024 places its money in 2024 — the report
            // footnotes say so.
            foreach ($booking['payments'] as $payment) {
                $date = (string) $payment['event_date'];
                if ($date < $from || $date > $to) {
                    continue;
                }
                $amount = round((float) $payment['amount'], 2);
                if ((string) $payment['payment_status'] === Mphb_Reader::PAYMENT_COMPLETED) {
                    $out['recorded'] = round($out['recorded'] + $amount, 2);
                } elseif ((string) $payment['payment_status'] === Mphb_Reader::PAYMENT_REFUNDED) {
                    $out['refunded'] = round($out['refunded'] + $amount, 2);
                }
            }
            foreach ($adjustments[$booking_id] ?? [] as $adjustment) {
                $date = (string) $adjustment['event_date'];
                if ($date < $from || $date > $to) {
                    continue;
                }
                $type = (string) $adjustment['type'];
                if ($type === Adjustments::ASSUMED_PRE_EXPORTS) {
                    $out['assumed_pre_exports'] = round($out['assumed_pre_exports'] + (float) $adjustment['amount'], 2);
                } elseif (in_array($type, Adjustments::ASSUMED_TYPES, true)) {
                    $out['assumed'] = round($out['assumed'] + (float) $adjustment['amount'], 2);
                } elseif ($type === Adjustments::REFUND_UNRECORDED) {
                    $out['refunds'] = round($out['refunds'] + (float) $adjustment['amount'], 2);
                }
            }
        }

        // What this view counts as money received on direct bookings.
        $corrections = round($out['assumed'] + $out['assumed_pre_exports'] + $out['refunds'], 2);

        if ($view === 'original') {
            $out['paid']                = $out['recorded'];
            $out['assumed']             = 0.0;
            $out['assumed_pre_exports'] = 0.0;
            $out['refunds']             = 0.0;
        } elseif ($view === 'difference') {
            $out['paid'] = $corrections;
        } else {
            $out['paid'] = round($out['recorded'] + $corrections, 2);
        }

        foreach (array_keys($out['by_cottage']) as $cottage) {
            $out['by_cottage'][$cottage] = self::finish_breakdown($out['by_cottage'][$cottage]);
        }
        foreach (array_keys($out['by_channel']) as $channel) {
            $out['by_channel'][$channel] = self::finish_breakdown($out['by_channel'][$channel]);
        }

        return $out;
    }

    /**
     * Adjustments grouped by the booking they sit on.
     *
     * @return array<int,array<int,array<string,mixed>>>
     */
    private static function adjustments_by_booking(): array
    {
        $out = [];
        foreach (Adjustments::all() as $adjustment) {
            $booking_id = (int) $adjustment['mphb_booking_id'];
            if ($booking_id > 0) {
                $out[$booking_id][] = $adjustment;
            }
        }
        return $out;
    }

    /**
     * Which copied bookings are copies of an OTA stay, worked out entirely
     * from the ledger's own tables — the Originals the snapshot froze, the
     * stays the imports created, and the links a person confirmed.
     *
     * @return array<int,bool>
     */
    public static function direct_copy_ids(): array
    {
        return Copies::ids(Copies::detect(Copies::from_originals()));
    }

    /** @return array<int,bool> MPHB booking ids linked to an OTA stay as a copy */
    public static function copy_booking_ids(): array
    {
        global $wpdb;
        $table = Schema::links();
        $ids   = $wpdb->get_col("SELECT mphb_booking_id FROM {$table} WHERE method = 'copy'") ?: [];
        $out   = [];
        foreach ($ids as $id) {
            $out[(int) $id] = true;
        }
        return $out;
    }

    // --------------------------------------------------------- scaffolding

    /** @return array<string,mixed> */
    private static function blank_figures(): array
    {
        $figures = [
            'nights'            => 0,
            'cancellations'     => 0,
            'lead_time_median'  => null,
            'by_cottage'        => [],
            'by_channel'        => [],
        ];
        foreach (self::MONEY_TYPES as $type) {
            $figures[$type] = 0.0;
        }
        foreach (Cottages::COTTAGES as $cottage) {
            $figures['by_cottage'][$cottage] = self::blank_breakdown();
        }
        foreach (Cottages::CHANNELS as $channel) {
            $figures['by_channel'][$channel] = self::blank_breakdown();
        }
        return $figures;
    }

    /** @return array<string,float|int> */
    private static function blank_breakdown(): array
    {
        $row = ['nights' => 0];
        foreach (self::MONEY_TYPES as $type) {
            $row[$type] = 0.0;
        }
        return $row;
    }

    /**
     * @param array<string,float|int> $row
     * @return array<string,float|int>
     */
    private static function finish_breakdown(array $row): array
    {
        $row['platform_fees'] = round(($row['commission'] ?? 0) + ($row['service_fee'] ?? 0), 2);
        $row['net_payout']    = round(
            ($row['payout'] ?? 0) + ($row['refund'] ?? 0) + ($row['adjustment'] ?? 0)
            + ($row['resolution'] ?? 0) + ($row['cancellation_fee'] ?? 0) + ($row['cancellation_fee_refund'] ?? 0),
            2
        );
        $row['room_revenue'] = round(
            ($row['guest_total'] ?? 0) - ($row['tax_in_payout'] ?? 0) - ($row['tax_platform_remitted'] ?? 0),
            2
        );
        $row['adr'] = ($row['nights'] ?? 0) > 0 ? round($row['room_revenue'] / $row['nights'], 2) : 0.0;
        return $row;
    }

    /**
     * @param array<string,array<string,float|int>> $a
     * @param array<string,array<string,float|int>> $b
     * @return array<string,array<string,float|int>>
     */
    private static function merge_breakdowns(array $a, array $b): array
    {
        foreach ($b as $key => $row) {
            if (!isset($a[$key])) {
                $a[$key] = $row;
                continue;
            }
            foreach ($row as $field => $value) {
                if (is_numeric($value) && isset($a[$key][$field]) && is_numeric($a[$key][$field])) {
                    $a[$key][$field] = is_int($value) && is_int($a[$key][$field])
                        ? $a[$key][$field] + $value
                        : round($a[$key][$field] + $value, 2);
                }
            }
            $a[$key] = self::finish_breakdown($a[$key]);
        }
        return $a;
    }

    /**
     * The Stays tab: every stay overlapping the period, with its money, its
     * MotoPress links and whether a hand-typed copy is attached.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function stay_rows(string $from, string $to): array
    {
        global $wpdb;

        $stays_t = Schema::stays();
        $lines_t = Schema::lines();

        $sums = [];
        foreach (self::MONEY_TYPES as $type) {
            $sums[] = sprintf("SUM(CASE WHEN l.type = '%s' THEN l.amount ELSE 0 END) AS %s", $type, $type);
        }
        $sum_sql = implode(",\n                    ", $sums);

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.*, {$sum_sql}
                   FROM {$stays_t} s
                   LEFT JOIN {$lines_t} l ON l.stay_id = s.id
                  WHERE s.check_in <= %s AND COALESCE(s.check_out, s.check_in) >= %s
                  GROUP BY s.id
                  ORDER BY s.check_in, s.cottage",
                $to,
                $from
            ),
            ARRAY_A
        ) ?: [];

        $links = [];
        foreach (Repo::all_links() as $link) {
            $links[(int) $link['stay_id']][] = $link;
        }

        foreach ($rows as &$row) {
            $row['links']        = $links[(int) $row['id']] ?? [];
            $row['nights_in']    = Dates::nights_in_period($row['check_in'], $row['check_out'], $from, $to);
            $row['net_payout']   = round(
                (float) $row['payout'] + (float) $row['refund'] + (float) $row['adjustment']
                + (float) $row['resolution'] + (float) $row['cancellation_fee'] + (float) $row['cancellation_fee_refund'],
                2
            );
            $row['platform_fees'] = round((float) $row['commission'] + (float) $row['service_fee'], 2);
        }
        unset($row);

        return $rows;
    }

    // --------------------------------------------------------------- cache

    /** @param array<int,mixed> $parts */
    public static function cache_key(array $parts): string
    {
        return sha1((string) wp_json_encode($parts));
    }

    /** @return array<string,mixed>|null */
    public static function cache_get(string $key): ?array
    {
        $cache = get_option(Settings::OPTION_CACHE, []);
        if (!is_array($cache) || !isset($cache[$key]) || !is_array($cache[$key])) {
            return null;
        }
        return $cache[$key];
    }

    /** @param array<string,mixed> $value */
    public static function cache_set(string $key, array $value): void
    {
        $cache = get_option(Settings::OPTION_CACHE, []);
        if (!is_array($cache)) {
            $cache = [];
        }
        if (count($cache) > 40) {
            $cache = [];
        }
        $cache[$key] = $value;
        // Never autoloaded: this can hold a year of figures.
        update_option(Settings::OPTION_CACHE, $cache, false);
    }

    /** Called by every import, undo, link change and settings change. */
    public static function flush_cache(): void
    {
        update_option(Settings::OPTION_CACHE, [], false);
    }
}
