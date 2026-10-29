<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The two things that must be true of every figure, checked over the real
 * data rather than over the fixtures.
 *
 * Both of these were wrong on live and neither was visible on a screen:
 * net came out ABOVE gross for Booking.com, and a payout whose reservation
 * row had not arrived put its money into the average rate with no nights
 * under it. A test suite cannot see live's data, so the checks travel with
 * the plugin and run from `wp dcc-ledger money-check`.
 */
final class Audit
{
    /**
     * Run both invariants over every month in the reconciled window.
     *
     * @return array<int,array{what:string,ok:bool,detail:string}>
     */
    public static function run(?string $from = null, ?string $to = null): array
    {
        $from = $from ?? Cottages::WINDOW_START;
        $to   = $to ?? Cottages::RECONCILED_THROUGH;

        $net_failures    = [];
        $rate_failures   = [];
        $months_checked  = 0;

        $cursor = (new \DateTimeImmutable($from . ' 00:00:00', Dates::timezone()))
            ->modify('first day of this month');
        $end    = new \DateTimeImmutable($to . ' 00:00:00', Dates::timezone());

        while ($cursor <= $end) {
            $start = $cursor->format('Y-m-01');
            $stop  = $cursor->modify('last day of this month')->format('Y-m-d');
            $month = Reports::summary($start, $stop, 'stay');
            $months_checked++;

            self::check_net($net_failures, $start, __('the month', 'dcc-ledger'), $month['totals']['room_revenue_gross'], $month['totals']['room_revenue_net']);

            foreach ($month['by_channel'] as $channel => $row) {
                self::check_net($net_failures, $start, (string) $channel, $row['room_revenue'] ?? 0, $row['room_revenue_net'] ?? 0);
            }
            foreach ($month['by_cottage'] as $cottage => $row) {
                self::check_net($net_failures, $start, 'cottage ' . $cottage, $row['room_revenue'] ?? 0, $row['room_revenue_net'] ?? 0);
            }

            // Money in the rate with no nights under it. The rate figures
            // have it removed; this says so when there was any to remove,
            // and fails only if it got through.
            $without = (int) $month['totals']['money_without_nights'];
            if ($without !== 0) {
                $expected = (int) $month['totals']['room_revenue_gross'] - $without;
                if ((int) $month['totals']['rate_gross'] !== $expected) {
                    $rate_failures[] = sprintf(
                        /* translators: 1: month, 2: the money with no nights under it */
                        __('%1$s: %2$s of money has no nights under it and is still in the rate', 'dcc-ledger'),
                        $start,
                        Money::format($without)
                    );
                }
            }

            $cursor = $cursor->modify('+1 month');
        }

        return [
            [
                'what'   => __('net is never above gross', 'dcc-ledger'),
                'ok'     => $net_failures === [],
                'detail' => $net_failures === []
                    ? sprintf(
                        /* translators: %d: number of months checked */
                        __('%d months, every channel and every cottage', 'dcc-ledger'),
                        $months_checked
                    )
                    : implode('; ', array_slice($net_failures, 0, 5)),
            ],
            [
                'what'   => __('no money in a rate without nights', 'dcc-ledger'),
                'ok'     => $rate_failures === [],
                'detail' => $rate_failures === []
                    ? sprintf(
                        /* translators: %d: number of months checked */
                        __('%d months', 'dcc-ledger'),
                        $months_checked
                    )
                    : implode('; ', array_slice($rate_failures, 0, 5)),
            ],
        ];
    }

    /**
     * @param array<int,string> $failures
     * @param int|float         $gross
     * @param int|float         $net
     */
    private static function check_net(array &$failures, string $month, string $where, $gross, $net): void
    {
        if ((int) $net <= (int) $gross) {
            return;
        }

        $failures[] = sprintf(
            /* translators: 1: month, 2: what is being measured, 3: net, 4: gross */
            __('%1$s %2$s: net %3$s is above gross %4$s', 'dcc-ledger'),
            $month,
            $where,
            Money::format((int) $net),
            Money::format((int) $gross)
        );
    }
}
