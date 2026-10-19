<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * CSV exports of whatever a tab is showing. There are no guest names in any of
 * them, because there are none in the ledger.
 */
final class Export
{
    /**
     * @param array{from:string,to:string,basis:string,label:string,view:string} $period
     * @return array<int,array<int,string|float|int>>
     */
    public static function rows(string $what, array $period): array
    {
        switch ($what) {
            case 'cottage':
                return self::breakdown(Reports::summary($period['from'], $period['to'], $period['basis'], $period['view'] ?? 'ledger')['by_cottage'], __('Cottage', 'dcc-ledger'));
            case 'channel':
                return self::breakdown(Reports::summary($period['from'], $period['to'], $period['basis'], $period['view'] ?? 'ledger')['by_channel'], __('Channel', 'dcc-ledger'));
            case 'cleanup':
                return self::cleanup();
            case 'invoices':
                return self::invoices();
            case 'overview':
                return self::overview($period);
            case 'stays':
            default:
                return self::stays($period);
        }
    }

    /**
     * @param array<string,array<string,float|int>> $breakdown
     * @return array<int,array<int,string|float|int>>
     */
    private static function breakdown(array $breakdown, string $first_column): array
    {
        $out = [[
            $first_column,
            __('Nights', 'dcc-ledger'),
            __('Guest Total', 'dcc-ledger'),
            __('Room Revenue', 'dcc-ledger'),
            __('Platform Fees', 'dcc-ledger'),
            __('Tax Remitted By Platform', 'dcc-ledger'),
            __('Tax Collected In Payout', 'dcc-ledger'),
            __('Net Payout', 'dcc-ledger'),
            __('Average Nightly Rate', 'dcc-ledger'),
        ]];
        foreach ($breakdown as $key => $row) {
            $out[] = [
                $key,
                (int) ($row['nights'] ?? 0),
                self::num($row['guest_total'] ?? 0),
                self::num($row['room_revenue'] ?? 0),
                self::num($row['platform_fees'] ?? 0),
                self::num($row['tax_platform_remitted'] ?? 0),
                self::num($row['tax_in_payout'] ?? 0),
                self::num($row['net_payout'] ?? 0),
                self::num($row['adr'] ?? 0),
            ];
        }
        return $out;
    }

    /** @return array<int,array<int,string|float|int>> */
    private static function stays(array $period): array
    {
        $out = [[
            __('Channel', 'dcc-ledger'),
            __('Code', 'dcc-ledger'),
            __('Cottage', 'dcc-ledger'),
            __('Check In', 'dcc-ledger'),
            __('Check Out', 'dcc-ledger'),
            __('Nights', 'dcc-ledger'),
            __('Nights In Period', 'dcc-ledger'),
            __('Status', 'dcc-ledger'),
            __('Booked On', 'dcc-ledger'),
            __('Guest Total', 'dcc-ledger'),
            __('Platform Fees', 'dcc-ledger'),
            __('Tax Remitted By Platform', 'dcc-ledger'),
            __('Tax Collected In Payout', 'dcc-ledger'),
            __('Net Payout', 'dcc-ledger'),
            __('MotoPress Bookings', 'dcc-ledger'),
        ]];

        foreach (Reports::stay_rows($period['from'], $period['to']) as $row) {
            $bookings = [];
            foreach ($row['links'] as $link) {
                $bookings[] = $link['mphb_booking_id'] . ' (' . $link['method'] . ')';
            }
            $out[] = [
                (string) $row['channel'],
                (string) $row['code'],
                (string) $row['cottage'],
                (string) $row['check_in'],
                (string) ($row['check_out'] ?? ''),
                (int) ($row['nights'] ?? 0),
                (int) $row['nights_in'],
                (string) $row['status'],
                (string) ($row['booked_on'] ?? ''),
                self::num($row['guest_total']),
                self::num($row['platform_fees']),
                self::num($row['tax_platform_remitted']),
                self::num($row['tax_in_payout']),
                self::num($row['net_payout']),
                implode(' ', $bookings),
            ];
        }

        return $out;
    }

    /** @return array<int,array<int,string|float|int>> */
    private static function cleanup(): array
    {
        $out = [[
            __('Item', 'dcc-ledger'),
            __('Title', 'dcc-ledger'),
            __('Facts', 'dcc-ledger'),
            __('Suggested Action', 'dcc-ledger'),
            __('Reviewed', 'dcc-ledger'),
            __('Note', 'dcc-ledger'),
        ]];
        foreach (Issues::all() as $item) {
            $out[] = [
                (string) $item['key'],
                (string) $item['title'],
                implode(' ', $item['facts']),
                (string) $item['action'],
                $item['reviewed'] ? __('Yes', 'dcc-ledger') : __('No', 'dcc-ledger'),
                (string) $item['review_note'],
            ];
        }
        return $out;
    }

    /** @return array<int,array<int,string|float|int>> */
    private static function invoices(): array
    {
        $out = [[
            __('Invoice Number', 'dcc-ledger'),
            __('Invoice Date', 'dcc-ledger'),
            __('Cottage', 'dcc-ledger'),
            __('Period Start', 'dcc-ledger'),
            __('Period End', 'dcc-ledger'),
            __('Invoiced Room Sales', 'dcc-ledger'),
            __('Matched Room Sales', 'dcc-ledger'),
            __('Invoiced Commission', 'dcc-ledger'),
            __('Matched Commission', 'dcc-ledger'),
            __('Reconciles', 'dcc-ledger'),
        ]];
        foreach (Issues::invoices() as $invoice) {
            $out[] = [
                (string) $invoice['number'],
                (string) $invoice['date'],
                (string) $invoice['cottage'],
                (string) $invoice['period_start'],
                (string) $invoice['period_end'],
                self::num($invoice['room_sales']),
                self::num($invoice['matched_room_sales']),
                self::num($invoice['commission']),
                self::num($invoice['matched_commission']),
                $invoice['reconciles'] ? __('Yes', 'dcc-ledger') : __('No', 'dcc-ledger'),
            ];
        }
        return $out;
    }

    /** @return array<int,array<int,string|float|int>> */
    private static function overview(array $period): array
    {
        $summary = Reports::summary($period['from'], $period['to'], $period['basis'], $period['view'] ?? 'ledger');
        $t       = $summary['totals'];

        $rows = [
            [__('Figure', 'dcc-ledger'), __('Value', 'dcc-ledger'), __('Source', 'dcc-ledger')],
            [__('Period', 'dcc-ledger'), $period['from'] . ' to ' . $period['to'], $period['basis'] === 'payout' ? __('By payout date', 'dcc-ledger') : __('By stay dates', 'dcc-ledger')],
            [__('Direct Bookings View', 'dcc-ledger'), (string) ($period['view'] ?? 'ledger'), __('Original is what MotoPress held; Ledger adds the corrections; Difference is the corrections alone', 'dcc-ledger')],
            [__('Nights', 'dcc-ledger'), (int) $t['nights'], __('Platform stays plus direct bookings, each copy once', 'dcc-ledger')],
            [__('Occupancy %', 'dcc-ledger'), (float) $t['occupancy_pct'], __('Nights divided by 8 cottages times days in period', 'dcc-ledger')],
            [__('Guest Total', 'dcc-ledger'), self::num($t['guest_total']), __('Platform exports', 'dcc-ledger')],
            [__('Room Revenue', 'dcc-ledger'), self::num($t['room_revenue']), __('Guest total less taxes', 'dcc-ledger')],
            [__('Platform Fees', 'dcc-ledger'), self::num($t['platform_fees']), __('Commission and service fees', 'dcc-ledger')],
            [__('Tax Remitted By Platform', 'dcc-ledger'), self::num($t['tax_platform_remitted']), __('Collected and paid by the platform; not Rob\'s money', 'dcc-ledger')],
            [__('Tax Collected In Payout', 'dcc-ledger'), self::num($t['tax_in_payout']), __('Paid to Rob inside the payout, for him to remit', 'dcc-ledger')],
            [__('Net Payout', 'dcc-ledger'), self::num($t['net_payout']), __('Payouts, refunds and adjustments', 'dcc-ledger')],
            [__('Average Nightly Rate', 'dcc-ledger'), self::num($t['adr']), __('Room revenue divided by platform nights', 'dcc-ledger')],
            [__('Direct Bookings Due', 'dcc-ledger'), self::num($t['direct_due']), __('MotoPress booking totals', 'dcc-ledger')],
            [__('Direct Payments Recorded', 'dcc-ledger'), self::num($t['direct_recorded']), __('Completed MotoPress payments, as copied into the ledger', 'dcc-ledger')],
            [__('Direct Payments Refunded', 'dcc-ledger'), self::num($t['direct_refunded']), __('Refunded payments, shown apart and never counted as paid', 'dcc-ledger')],
            [__('Direct Payments Assumed', 'dcc-ledger'), self::num($t['direct_assumed']), __('Ledger adjustment: assumed paid in full, dated at check-in', 'dcc-ledger')],
            [__('Direct Paid In This View', 'dcc-ledger'), self::num($t['direct_paid']), __('What the chosen view counts as received', 'dcc-ledger')],
            [__('Cancellations', 'dcc-ledger'), (int) $t['cancellations'], __('Platform stays cancelled', 'dcc-ledger')],
            [__('Cancellation Fees', 'dcc-ledger'), self::num($t['cancellation_fees']), __('Fees and fee refunds', 'dcc-ledger')],
            [__('Median Lead Time (Days)', 'dcc-ledger'), $t['lead_time_median'] ?? '', __('Booked on to check-in, platform stays only', 'dcc-ledger')],
        ];

        if ($summary['ota']['tax_not_reported'] !== []) {
            $rows[] = [
                __('Tax Not Reported', 'dcc-ledger'),
                implode(', ', array_map([Cottages::class, 'channel_label'], $summary['ota']['tax_not_reported'])),
                __('These channels report no tax figure at all; it is unknown, not zero', 'dcc-ledger'),
            ];
        }

        return $rows;
    }

    private static function num(float|int|string $value): string
    {
        return number_format((float) $value, 2, '.', '');
    }
}
