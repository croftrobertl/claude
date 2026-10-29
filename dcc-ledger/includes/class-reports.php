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
        // Capacity is what Rob owns, not what he chose to sell. A night he
        // closed is occupancy lost, never capacity lost — USALI, and the
        // Director's ruling of 2026-10-29.
        $capacity  = $days * count(Cottages::COTTAGES);
        $nights    = $ota['nights'] + $direct['nights'];
        $occupancy = $capacity > 0 ? round($nights / $capacity * 100, 1) : 0.0;

        // Room revenue, gross and net. Gross is the price the cottage
        // commands; net is what reaches the bank. One without the other
        // hides a commission difference of fifteen to eighteen per cent
        // between channels, so neither is ever shown alone.
        $room_revenue     = self::gross_room_revenue($ota);
        $room_revenue_net = self::net_room_revenue($ota);

        // Direct bookings pay no commission, so their gross and their net
        // are the same figure. MotoPress reports no tax split for them, so
        // nothing is deducted and the screen says so.
        $direct_room_revenue = $direct['paid'];

        $gross_revenue = $room_revenue + $direct_room_revenue;
        $net_revenue   = $room_revenue_net + $direct_room_revenue;

        // A night with no money behind it is left out of BOTH sides of the
        // rate, not just the top: in the denominator alone it would look
        // like a discount nobody gave. The same cut the other way: money
        // whose nights are unknown comes out of the top, because a dollar
        // with no night under it lifts an average exactly as wrongly.
        $rate_nights = $ota['nights_with_revenue'] + $direct['nights'];

        $no_nights_gross = self::gross_room_revenue($ota['no_nights']);
        $no_nights_net   = self::net_room_revenue($ota['no_nights']);

        $rate_gross = $gross_revenue - $no_nights_gross;
        $rate_net   = $net_revenue - $no_nights_net;

        $adr_base     = self::per_night((int) $room_revenue, (int) $ota['nights_with_revenue']);
        $adr_gross    = self::per_night((int) $rate_gross, (int) $rate_nights);
        $adr_net      = self::per_night((int) $rate_net, (int) $rate_nights);
        $revpar_gross = self::per_night((int) $rate_gross, (int) $capacity);
        $revpar_net   = self::per_night((int) $rate_net, (int) $capacity);

        $lengths = array_merge($ota['stay_lengths'], $direct['stay_lengths']);

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
                // The metrics, each reported with the nights it divides by
                // so a reader can check the division rather than trust it.
                'room_revenue_gross' => $gross_revenue,
                'room_revenue_net'   => $net_revenue,
                // What the rates actually divide, once money with no nights
                // under it is taken out.
                'rate_gross'         => $rate_gross,
                'rate_net'           => $rate_net,
                'rate_nights'        => $rate_nights,
                'nights_without_revenue' => $ota['nights_without_revenue'],
                'money_without_nights'   => $no_nights_gross,
                'stays_without_nights'   => $ota['stays_without_nights'],
                'nights_from_link'       => $ota['nights_from_link'],
                'adr_gross'          => $adr_gross,
                'adr_net'            => $adr_net,
                'revpar_gross'       => $revpar_gross,
                'revpar_net'         => $revpar_net,
                'length_of_stay_mean'   => self::mean($lengths),
                'length_of_stay_median' => self::median($lengths),
                'stays_counted'         => count($lengths),
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
                // Platform and direct are never blended: the platform date
                // is the guest's, the direct one is the day Rob typed the
                // booking in. One number would be wrong for both.
                'lead_time_median'  => $ota['lead_time_median'],
                'lead_time_mean'    => $ota['lead_time_mean'],
                'lead_time_count'   => count($ota['lead_times']),
                'direct_lead_time_median' => $direct['lead_time_median'],
                'direct_lead_time_mean'   => $direct['lead_time_mean'],
                'direct_lead_time_count'  => count($direct['lead_times']),
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
                "SUM(CASE WHEN l.type = '%s' THEN l.amount_cents ELSE 0 END) AS t_%s",
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

        // A cancelled reservation Rob has ruled as really stayed counts as a
        // stay: its nights and its money both. Nothing else about it changes
        // — the platform still says cancelled, and the ruling is beside it,
        // not instead of it.
        $ruled = Stay_Rulings::all_current();

        // A payout that arrived before its reservation row has no check-out
        // of its own. Where somebody has linked it to a MotoPress booking,
        // that booking's dates are the stay's dates — read from MotoPress,
        // never written to it.
        $linked_dates = self::dates_from_linked_bookings();

        foreach ($rows as $row) {
            $status    = (string) $row['status'];
            if ($status !== 'ok' && isset($ruled[(int) $row['id']])) {
                $status = 'ok';
            }
            $check_in  = (string) $row['check_in'];
            $check_out = $row['check_out'] !== null ? (string) $row['check_out'] : null;

            if ($check_out === null && isset($linked_dates[(int) $row['id']])) {
                $check_in  = $linked_dates[(int) $row['id']]['check_in'] ?: $check_in;
                $check_out = $linked_dates[(int) $row['id']]['check_out'];
                $figures['nights_from_link']++;
            }

            $total_nights = (int) ($row['nights'] ?? 0);
            if ($total_nights <= 0) {
                $total_nights = Dates::nights($check_in, $check_out) ?? 0;
            }

            // Nights unknown: the reservation row has not arrived and nothing
            // is linked. Its money is real and is reported, but it is kept
            // out of every rate — on BOTH sides. A dollar with no night under
            // it would lift the average exactly as a night with no dollar
            // above it would lower it.
            $nights_known = $check_out !== null && $total_nights > 0;
            if (!$nights_known && $status === 'ok') {
                $figures['stays_without_nights']++;
            }

            $in_period = $status === 'ok'
                ? Dates::nights_in_period($check_in, $check_out, $from, $to)
                : 0;

            // How much of this stay belongs to the period, as a fraction
            // expressed in nights so the split can be done on whole cents.
            // A stay with unknown dates still belongs to the period its
            // check-in falls in; it just contributes no nights.
            $part  = 1;
            $whole = 1;
            if ($basis === 'stay' && $total_nights > 0) {
                $part  = $in_period;
                $whole = $total_nights;
            } elseif ($basis === 'stay' && ($check_in < $from || $check_in > $to)) {
                $part = 0;
            }

            if ($basis === 'payout') {
                // Cash basis: the stay's own dates are irrelevant, so this
                // branch is handled by a separate query below.
                $part = 0;
            }

            if ($status === 'ok') {
                $figures['nights'] += $in_period;
                $figures['by_cottage'][(string) $row['cottage']]['nights'] += $in_period;
                $figures['by_channel'][(string) $row['channel']]['nights'] += $in_period;

                // A night with nothing above it would drag the average rate
                // down and look like a discount. A stay whose money has not
                // arrived yet is left out of BOTH sides of that division.
                $stay_money = (int) ($row['t_guest_total'] ?? 0)
                    + (int) ($row['t_room_sales'] ?? 0)
                    + (int) ($row['t_payout'] ?? 0);
                if ($stay_money !== 0) {
                    $figures['nights_with_revenue'] += $in_period;
                } elseif ($in_period > 0) {
                    $figures['nights_without_revenue'] += $in_period;
                }
            }

            // Length of stay counts a stay whole, in the period it begins:
            // half a stay has no length.
            if ($status === 'ok' && $check_in >= $from && $check_in <= $to && $total_nights > 0) {
                $figures['stay_lengths'][] = $total_nights;
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

            if ($part > 0) {
                self::add_money($figures, $row, $part, $whole, (string) $row['cottage'], (string) $row['channel']);
                if (!$nights_known) {
                    // Counted in the money, kept out of the rates.
                    self::add_no_nights($figures, $row, $part, $whole);
                }
            }

            // Cancellation fees are money even on a cancelled stay, and they
            // are always reported on the date of the stay's check-in.
            if ($basis === 'stay' && $status !== 'ok' && $check_in >= $from && $check_in <= $to) {
                self::add_money($figures, $row, 1, 1, (string) $row['cottage'], (string) $row['channel'], true);
            }
        }

        if ($basis === 'payout') {
            self::add_cash_basis($figures, $from, $to);
        }

        $figures['lead_times']       = $lead;
        $figures['lead_time_median'] = self::median($lead);
        $figures['lead_time_mean']   = self::mean($lead);

        $figures['platform_fees'] = $figures['commission'] + $figures['service_fee'];
        $figures['net_payout']    =
            $figures['payout'] + $figures['refund'] + $figures['adjustment']
            + $figures['resolution'] + $figures['cancellation_fee'] + $figures['cancellation_fee_refund'];
        $figures['cancellation_fees'] = $figures['cancellation_fee'] + $figures['cancellation_fee_refund'];

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
                "SELECT l.type, l.channel, COALESCE(s.cottage, '') AS cottage, SUM(l.amount_cents) AS total
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
            $amount  = (int) $row['total'];
            $cottage = (string) $row['cottage'];
            $channel = (string) $row['channel'];

            if (!isset($figures[$type])) {
                continue;
            }
            $figures[$type] = $figures[$type] + $amount;

            if ($cottage !== '') {
                $figures['by_cottage'][$cottage] ??= self::blank_breakdown();
                $figures['by_cottage'][$cottage][$type] = ($figures['by_cottage'][$cottage][$type] ?? 0) + $amount;
            }
            $figures['by_channel'][$channel] ??= self::blank_breakdown();
            $figures['by_channel'][$channel][$type] = ($figures['by_channel'][$channel][$type] ?? 0) + $amount;
        }
    }

    /**
     * The money of a stay whose nights are unknown, kept to one side.
     *
     * Reported in the money figures, which are about dollars, and subtracted
     * from the figures the rates divide — which are about dollars per night,
     * and have no night here to divide by.
     *
     * @param array<string,mixed> $figures
     * @param array<string,mixed> $row
     */
    private static function add_no_nights(
        array &$figures,
        array $row,
        int $nights_in_period,
        int $total_nights
    ): void {
        foreach (self::MONEY_TYPES as $type) {
            $figures['no_nights'][$type] += Money::share(
                (int) ($row['t_' . $type] ?? 0),
                $nights_in_period,
                $total_nights
            );
        }
    }

    /**
     * Dates for payout-only stays, taken from the booking they are linked to.
     *
     * A payout can arrive before the reservations export that explains it, so
     * the stay has a check-in and no check-out. Where a person has linked it
     * to a MotoPress booking, that booking knows the nights — and MotoPress
     * is read for them, never written to.
     *
     * @return array<int,array{check_in:string,check_out:string}>
     */
    private static function dates_from_linked_bookings(): array
    {
        $links = [];
        foreach (Repo::all_links() as $link) {
            $links[(int) $link['mphb_booking_id']] = (int) $link['stay_id'];
        }
        if ($links === []) {
            return [];
        }

        $out = [];
        foreach (Mphb_Reader::bookings() as $booking) {
            $stay_id = $links[(int) $booking['id']] ?? 0;
            if ($stay_id <= 0 || $booking['check_in'] === null || $booking['check_out'] === null) {
                continue;
            }
            $out[$stay_id] = [
                'check_in'  => (string) $booking['check_in'],
                'check_out' => (string) $booking['check_out'],
            ];
        }

        return $out;
    }

    /**
     * @param array<string,mixed> $figures
     * @param array<string,mixed> $row
     */
    private static function add_money(
        array &$figures,
        array $row,
        int $nights_in_period,
        int $total_nights,
        string $cottage,
        string $channel,
        bool $fees_only = false
    ): void {
        $types = $fees_only
            ? ['cancellation_fee', 'cancellation_fee_refund', 'refund', 'adjustment', 'resolution']
            : self::MONEY_TYPES;

        foreach ($types as $type) {
            // A stay crossing the edge of the period gives up the nights
            // outside it. The split is on whole cents, rounded half away
            // from zero — see Money::share().
            $amount = Money::share((int) ($row['t_' . $type] ?? 0), $nights_in_period, $total_nights);
            if ($amount === 0) {
                continue;
            }
            $figures[$type] = $figures[$type] + $amount;

            $figures['by_cottage'][$cottage] ??= self::blank_breakdown();
            $figures['by_cottage'][$cottage][$type] = $figures['by_cottage'][$cottage][$type] + $amount;

            $figures['by_channel'][$channel] ??= self::blank_breakdown();
            $figures['by_channel'][$channel][$type] = $figures['by_channel'][$channel][$type] + $amount;
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
                        SUM(CASE WHEN l.type IN ('tax_in_payout','tax_platform_remitted') THEN ABS(l.amount_cents) ELSE 0 END) AS tax,
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
            if ((int) $row['stays'] > 0 && (int) $row['tax'] === 0) {
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
            'due'        => 0,
            'recorded'   => 0,
            'refunded'   => 0,
            'assumed'    => 0,
            // Rob's ruling on the stays that predate the exports, kept apart
            // from the window rule so the two are never read as one figure.
            'assumed_pre_exports' => 0,
            // Refunds he knows about that never reached MotoPress.
            'refunds'    => 0,
            'paid'       => 0,
            'bookings'   => 0,
            'by_cottage' => [],
            'by_channel' => [],
            'copies_excluded' => 0,
            'copy_payments'   => 0,
            // Measured from the date the booking was ENTERED in MotoPress,
            // which for a booking Rob typed in later is not the date the
            // guest booked. Reported separately from the platform figure
            // and labelled, never blended into one number.
            'lead_times'      => [],
            'lead_time_median' => null,
            'lead_time_mean'  => null,
            'stay_lengths'    => [],
            'snapshot_taken'  => Snapshot::taken(),
            'snapshot_at'     => Originals::last_snapshot_at(),
        ];

        $adjustments = self::adjustments_by_booking();

        // Read live, because the booking date is structure rather than
        // money: it is not copied into the Originals and cannot move a
        // figure under Rob's feet.
        $entered_on = [];
        foreach (Mphb_Reader::bookings() as $live) {
            $entered_on[(int) $live['id']] = (string) ($live['entered_on'] ?? '');
        }

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
                    $out['copy_payments'] = $out['copy_payments'] + (int) $booking['paid'];
                }
                continue;
            }

            $nights = Dates::nights_in_period($booking['check_in'], $booking['check_out'], $from, $to);
            $total  = Dates::nights($booking['check_in'], $booking['check_out']) ?? 0;

            if ((string) $booking['check_in'] >= $from && (string) $booking['check_in'] <= $to) {
                if ($total > 0) {
                    $out['stay_lengths'][] = $total;
                }
                $entered = (string) ($entered_on[$booking_id] ?? '');
                if ($entered !== '') {
                    $days = Dates::nights($entered, (string) $booking['check_in']);
                    if ($days !== null) {
                        $out['lead_times'][] = $days;
                    }
                }
            }

            if ($nights > 0) {
                $out['nights'] += $nights;
                $out['by_cottage'][$cottage] ??= self::blank_breakdown();
                $out['by_cottage'][$cottage]['nights'] += $nights;
                $out['by_channel']['direct'] ??= self::blank_breakdown();
                $out['by_channel']['direct']['nights'] += $nights;
            }

            // A booking carries at most one kind of assumption, so its net
            // belongs wholly to that bucket.
            $assumed     = 0;
            $refunds     = 0;
            $pre_exports = false;
            foreach ($adjustments[$booking_id] ?? [] as $adjustment) {
                $type = (string) $adjustment['type'];
                if (in_array($type, Adjustments::ASSUMED_TYPES, true)) {
                    $assumed = $assumed + (int) $adjustment['amount_cents'];
                    $pre_exports = $pre_exports || $type === Adjustments::ASSUMED_PRE_EXPORTS;
                }
                if ($type === Adjustments::REFUND_UNRECORDED) {
                    $refunds = $refunds + (int) $adjustment['amount_cents'];
                }
            }

            if ($basis === 'stay') {
                // The same nights-based split the platform stays use, on
                // whole cents. A booking with no nights in the period still
                // belongs here whole if it begins inside it.
                if ($total > 0) {
                    $part  = $nights;
                    $whole = $total;
                } else {
                    $part  = ($booking['check_in'] >= $from && $booking['check_in'] <= $to) ? 1 : 0;
                    $whole = 1;
                }
                if ($part > 0) {
                    $out['bookings'] += $nights > 0 ? 1 : 0;
                    $out['due']      += Money::share((int) $booking['total_cents'], $part, $whole);
                    $out['recorded'] += Money::share((int) $booking['paid'], $part, $whole);
                    $out['refunded'] += Money::share((int) $booking['refunded'], $part, $whole);
                    $out['refunds']  += Money::share($refunds, $part, $whole);
                    if ($pre_exports) {
                        $out['assumed_pre_exports'] += Money::share($assumed, $part, $whole);
                    } else {
                        $out['assumed'] += Money::share($assumed, $part, $whole);
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
                $amount = (int) $payment['amount_cents'];
                if ((string) $payment['payment_status'] === Mphb_Reader::PAYMENT_COMPLETED) {
                    $out['recorded'] = $out['recorded'] + $amount;
                } elseif ((string) $payment['payment_status'] === Mphb_Reader::PAYMENT_REFUNDED) {
                    $out['refunded'] = $out['refunded'] + $amount;
                }
            }
            foreach ($adjustments[$booking_id] ?? [] as $adjustment) {
                $date = (string) $adjustment['event_date'];
                if ($date < $from || $date > $to) {
                    continue;
                }
                $type = (string) $adjustment['type'];
                if ($type === Adjustments::ASSUMED_PRE_EXPORTS) {
                    $out['assumed_pre_exports'] += (int) $adjustment['amount_cents'];
                } elseif (in_array($type, Adjustments::ASSUMED_TYPES, true)) {
                    $out['assumed'] += (int) $adjustment['amount_cents'];
                } elseif ($type === Adjustments::REFUND_UNRECORDED) {
                    $out['refunds'] += (int) $adjustment['amount_cents'];
                }
            }
        }

        // What this view counts as money received on direct bookings.
        $corrections = $out['assumed'] + $out['assumed_pre_exports'] + $out['refunds'];

        if ($view === 'original') {
            $out['paid']                = $out['recorded'];
            $out['assumed']             = 0;
            $out['assumed_pre_exports'] = 0;
            $out['refunds']             = 0;
        } elseif ($view === 'difference') {
            $out['paid'] = $corrections;
        } else {
            $out['paid'] = $out['recorded'] + $corrections;
        }

        $out['lead_time_median'] = self::median($out['lead_times']);
        $out['lead_time_mean']   = self::mean($out['lead_times']);

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
            'nights'                => 0,
            // Nights with money behind them, and nights without. ADR divides
            // by the first; occupancy counts both.
            'nights_with_revenue'    => 0,
            'nights_without_revenue' => 0,
            // Stays whose nights are not known at all — a payout whose
            // reservation row has not arrived and which nobody has linked.
            // Their money is reported and kept out of every rate.
            'stays_without_nights'   => 0,
            'nights_from_link'       => 0,
            'no_nights'              => [],
            'cancellations'         => 0,
            'lead_times'            => [],
            'lead_time_median'      => null,
            'lead_time_mean'        => null,
            'stay_lengths'          => [],
            'by_cottage'            => [],
            'by_channel'            => [],
        ];
        foreach (self::MONEY_TYPES as $type) {
            $figures[$type] = 0;
            $figures['no_nights'][$type] = 0;
        }
        foreach (Cottages::COTTAGES as $cottage) {
            $figures['by_cottage'][$cottage] = self::blank_breakdown();
        }
        foreach (Cottages::CHANNELS as $channel) {
            $figures['by_channel'][$channel] = self::blank_breakdown();
        }
        return $figures;
    }

    /**
     * Gross room revenue: what the guest paid for the room, tax out.
     *
     * The tax a platform reports sits INSIDE the figure it calls the guest
     * total — for Booking.com the guest total is the payout, which carries
     * the tax Rob has to remit — so both tax buckets come out.
     *
     * A refund is money the guest got back, so it reduces room revenue, as
     * it would in any set of books. A resolution or an adjustment is not
     * room revenue at all — a damage payment or a platform correction — so
     * neither is in here; both stay visible in net payout, which is the
     * cash that moved. A cancellation fee is not room revenue either,
     * because nobody stayed.
     *
     * @param array<string,int|float> $figures a money bucket keyed by type
     */
    public static function gross_room_revenue(array $figures): int
    {
        return (int) ($figures['guest_total'] ?? 0)
            - (int) ($figures['tax_in_payout'] ?? 0)
            - (int) ($figures['tax_platform_remitted'] ?? 0)
            + (int) ($figures['refund'] ?? 0);
    }

    /**
     * Net room revenue: gross, less what the platform took.
     *
     * One definition for every channel — gross less commission and fees,
     * with tax inside neither figure. Taking the payout as net instead was
     * wrong for Booking.com twice over: its payout carries the tax Rob
     * remits, and its commission is invoiced separately rather than deducted
     * from the payout at all, so net came out ABOVE gross. For Airbnb and
     * Vrbo the same definition lands on the payout, because those platforms
     * do deduct their fee before paying.
     *
     * Commission and fees are stored as positive costs, so net can never
     * exceed gross. `Money_Migration` checks that over the real data.
     *
     * @param array<string,int|float> $figures a money bucket keyed by type
     */
    public static function net_room_revenue(array $figures): int
    {
        return self::gross_room_revenue($figures)
            - (int) ($figures['commission'] ?? 0)
            - (int) ($figures['service_fee'] ?? 0);
    }

    /**
     * What one figure on a screen was added up from.
     *
     * The standard says every number opens to its source. This is the map
     * from a figure's name to the rows behind it and the sentence that says
     * what it counts — one place, so the definition a reader is shown is
     * the same definition the figure was computed by.
     *
     * @return array{label:string,definition:string,matches:callable}|null
     */
    public static function trail(string $figure): ?array
    {
        $has_money = static fn (array $row): bool =>
            (int) $row['guest_total'] !== 0
            || (int) $row['room_sales'] !== 0
            || (int) $row['payout'] !== 0;

        $trails = [
            'guest_total' => [
                'label'      => __('Guest Total', 'dcc-ledger'),
                'definition' => __('Every platform stay carrying money: what guests paid the platforms, before the platform\'s cut and before tax.', 'dcc-ledger'),
                'matches'    => $has_money,
            ],
            'platform_fees' => [
                'label'      => __('Platform Fees', 'dcc-ledger'),
                'definition' => __('Every stay charged commission or a service fee.', 'dcc-ledger'),
                'matches'    => static fn (array $row): bool =>
                    (int) $row['commission'] !== 0 || (int) $row['service_fee'] !== 0,
            ],
            'net_payout' => [
                'label'      => __('Net Payout', 'dcc-ledger'),
                'definition' => __('Every stay whose money moved: payouts, with refunds, adjustments and resolutions netted off.', 'dcc-ledger'),
                'matches'    => static fn (array $row): bool => (int) $row['net_payout'] !== 0,
            ],
            'nights' => [
                'label'      => __('Nights', 'dcc-ledger'),
                'definition' => __('Every platform stay with a night inside the range. A cancelled reservation contributes none, and a hand-typed copy is counted on the stay it duplicates.', 'dcc-ledger'),
                'matches'    => static fn (array $row): bool => (int) $row['nights_in'] > 0,
            ],
            'rate_nights' => [
                'label'      => __('Nights Behind The Rate', 'dcc-ledger'),
                'definition' => __('The stays the average rate divides by: those with a night inside the range AND money attached. A night with nothing above it is left out of both sides of that division.', 'dcc-ledger'),
                'matches'    => static fn (array $row): bool => (int) $row['nights_in'] > 0 && $has_money($row),
            ],
            'tax_platform_remitted' => [
                'label'      => __('Tax The Platform Remitted', 'dcc-ledger'),
                'definition' => __('Every stay where the platform collected and paid the tax itself. Never revenue.', 'dcc-ledger'),
                'matches'    => static fn (array $row): bool => (int) $row['tax_platform_remitted'] !== 0,
            ],
            'tax_in_payout' => [
                'label'      => __('Tax Inside The Payout', 'dcc-ledger'),
                'definition' => __('Every stay whose payout carried tax for Rob to remit.', 'dcc-ledger'),
                'matches'    => static fn (array $row): bool => (int) $row['tax_in_payout'] !== 0,
            ],
            'cancellations' => [
                'label'      => __('Cancellations', 'dcc-ledger'),
                'definition' => __('Every platform reservation the channel marks cancelled, counted in the month it would have checked in.', 'dcc-ledger'),
                'matches'    => static fn (array $row): bool => (string) $row['status'] !== 'ok',
            ],
        ];

        return $trails[$figure] ?? null;
    }

    /**
     * The middle value, or null for nothing at all.
     *
     * An even count takes the mean of the two middles, rounded half up —
     * stated because a median of 51.5 days has to land somewhere.
     *
     * @param array<int,int> $values
     */
    public static function median(array $values): ?int
    {
        sort($values);
        $count = count($values);
        if ($count === 0) {
            return null;
        }

        return $count % 2 === 1
            ? (int) $values[intdiv($count, 2)]
            : (int) floor((($values[$count / 2 - 1] + $values[$count / 2]) / 2) + 0.5);
    }

    /**
     * The mean, rounded half up, or null for nothing at all.
     *
     * @param array<int,int> $values
     */
    public static function mean(array $values): ?int
    {
        $count = count($values);
        if ($count === 0) {
            return null;
        }

        return (int) floor((array_sum($values) / $count) + 0.5);
    }

    /**
     * Cents per night, rounded half up once and only at the end.
     *
     * Zero nights give null, not zero: no stays is not a rate of nothing.
     */
    public static function per_night(int $cents, int $nights): ?int
    {
        if ($nights <= 0) {
            return null;
        }

        $sign = $cents < 0 ? -1 : 1;

        return $sign * intdiv(abs($cents) * 2 + $nights, $nights * 2);
    }

    /** @return array<string,float|int> */
    private static function blank_breakdown(): array
    {
        $row = ['nights' => 0];
        foreach (self::MONEY_TYPES as $type) {
            $row[$type] = 0;
        }
        return $row;
    }

    /**
     * @param array<string,float|int> $row
     * @return array<string,float|int>
     */
    private static function finish_breakdown(array $row): array
    {
        $row['platform_fees'] = (int) ($row['commission'] ?? 0) + (int) ($row['service_fee'] ?? 0);
        $row['net_payout']    =
            ($row['payout'] ?? 0) + ($row['refund'] ?? 0) + ($row['adjustment'] ?? 0)
            + ($row['resolution'] ?? 0) + ($row['cancellation_fee'] ?? 0) + ($row['cancellation_fee_refund'] ?? 0);
        // The one definition, the same on every row as in the totals.
        $row['room_revenue']     = self::gross_room_revenue($row);
        $row['room_revenue_net'] = self::net_room_revenue($row);
        // Cents per night, rounded half up at the last step only.
        $row['adr'] = ($row['nights'] ?? 0) > 0
            ? intdiv((int) $row['room_revenue'] * 2 + (int) $row['nights'], (int) $row['nights'] * 2)
            : 0;
        $row['adr_net'] = ($row['nights'] ?? 0) > 0
            ? intdiv((int) $row['room_revenue_net'] * 2 + (int) $row['nights'], (int) $row['nights'] * 2)
            : 0;
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
                // Every numeric field here is either a count or whole
                // cents, so they add exactly.
                if (is_numeric($value) && isset($a[$key][$field]) && is_numeric($a[$key][$field])) {
                    $a[$key][$field] = (int) $a[$key][$field] + (int) $value;
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
            $sums[] = sprintf("SUM(CASE WHEN l.type = '%s' THEN l.amount_cents ELSE 0 END) AS %s", $type, $type);
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
            $row['net_payout']   =
                (int) $row['payout'] + (int) $row['refund'] + (int) $row['adjustment']
                + (int) $row['resolution'] + (int) $row['cancellation_fee'] + (int) $row['cancellation_fee_refund'];
            $row['platform_fees'] = (int) $row['commission'] + (int) $row['service_fee'];
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
