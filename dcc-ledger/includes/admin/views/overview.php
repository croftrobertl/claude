<?php
/**
 * Overview: the figures for the period, each with its source.
 *
 * @var array $period
 */

use DCCL\Cottages;
use DCCL\Reports;
use DCCL\Ui;

if (!defined('ABSPATH')) {
    exit;
}

$summary = Reports::summary($period['from'], $period['to'], $period['basis'], $period['view']);
$t       = $summary['totals'];
$direct  = $summary['direct'];

$view_sources = [
    'original'   => __('Completed payments only, exactly as MotoPress held them', 'dcc-ledger'),
    'ledger'     => __('Completed payments plus the ledger\'s corrections', 'dcc-ledger'),
    'difference' => __('The ledger\'s corrections alone', 'dcc-ledger'),
];
?>
<h2 class="dccl-h2"><?php esc_html_e('Overview', 'dcc-ledger'); ?></h2>

<div class="dccl-tiles">
    <?php
    echo Ui::tile(
        __('Guest Total', 'dcc-ledger'),
        Ui::money($t['guest_total']),
        __('What guests paid the platforms', 'dcc-ledger'),
        '',
        Ui::trail_url($period, 'guest_total')
    );
    echo Ui::tile(
        __('Platform Fees', 'dcc-ledger'),
        Ui::money($t['platform_fees']),
        __('Commission and service fees', 'dcc-ledger'),
        '',
        Ui::trail_url($period, 'platform_fees')
    );
    echo Ui::tile(
        __('Net Payout', 'dcc-ledger'),
        Ui::money($t['net_payout']),
        __('Payouts, refunds and adjustments', 'dcc-ledger'),
        '',
        Ui::trail_url($period, 'net_payout')
    );
    echo Ui::tile(
        __('Nights', 'dcc-ledger'),
        Ui::number($t['nights']),
        __('Platform stays plus direct bookings, each copy once', 'dcc-ledger'),
        '',
        Ui::trail_url($period, 'nights')
    );
    ?>
</div>

<h3 class="dccl-h3"><?php esc_html_e('How The Cottages Performed', 'dcc-ledger'); ?></h3>
<p class="dccl-note">
    <?php
    printf(
        /* translators: 1: start date, 2: end date */
        esc_html__('Every figure below is over %1$s to %2$s, on the stay basis: revenue belongs to the nights it was earned on. Gross is before the platform\'s cut; net is after it. Direct bookings pay no commission, so their gross and net are the same, and MotoPress reports no tax split for them.', 'dcc-ledger'),
        esc_html((string) $period['from']),
        esc_html((string) $period['to'])
    );
    ?>
</p>

<div class="dccl-tiles">
    <?php
    echo Ui::tile(
        __('Occupancy', 'dcc-ledger'),
        Ui::number($t['occupancy_pct'], 1) . '%',
        sprintf(
            /* translators: 1: nights booked, 2: nights available */
            __('%1$s of %2$s cottage-nights — 8 cottages, every night in the range', 'dcc-ledger'),
            number_format((float) $t['nights']),
            number_format((float) $t['capacity_nights'])
        ),
        '',
        Ui::trail_url($period, 'nights')
    );
    echo Ui::tile(
        __('ADR, Gross', 'dcc-ledger'),
        $t['adr_gross'] === null ? Ui::unknown() : Ui::money((int) $t['adr_gross']),
        sprintf(
            /* translators: %s: the number of nights the rate divides by */
            __('Room revenue before commission, over the %s nights that carry money', 'dcc-ledger'),
            number_format((float) $t['rate_nights'])
        ),
        '',
        Ui::trail_url($period, 'rate_nights')
    );
    echo Ui::tile(
        __('ADR, Net', 'dcc-ledger'),
        $t['adr_net'] === null ? Ui::unknown() : Ui::money((int) $t['adr_net']),
        __('The same nights, after the platform\'s cut', 'dcc-ledger'),
        '',
        Ui::trail_url($period, 'rate_nights')
    );
    echo Ui::tile(
        __('RevPAR, Gross', 'dcc-ledger'),
        $t['revpar_gross'] === null ? Ui::unknown() : Ui::money((int) $t['revpar_gross']),
        __('Room revenue over every available cottage-night', 'dcc-ledger')
    );
    echo Ui::tile(
        __('RevPAR, Net', 'dcc-ledger'),
        $t['revpar_net'] === null ? Ui::unknown() : Ui::money((int) $t['revpar_net']),
        __('The same, after the platform\'s cut', 'dcc-ledger')
    );
    echo Ui::tile(
        __('Length Of Stay', 'dcc-ledger'),
        $t['length_of_stay_median'] === null
            ? Ui::unknown()
            : esc_html(sprintf(
                /* translators: %d: nights */
                _n('%d night', '%d nights', (int) $t['length_of_stay_median'], 'dcc-ledger'),
                (int) $t['length_of_stay_median']
            )),
        sprintf(
            /* translators: 1: mean nights, 2: number of stays counted */
            __('Median; the mean is %1$s over %2$s stays beginning in the range, each counted whole', 'dcc-ledger'),
            $t['length_of_stay_mean'] === null ? __('unknown', 'dcc-ledger') : number_format((float) $t['length_of_stay_mean'], 1),
            number_format((float) $t['stays_counted'])
        )
    );
    ?>
</div>

<?php if ((int) $t['nights_without_revenue'] > 0) : ?>
    <p class="dccl-note">
        <?php
        printf(
            /* translators: %s: number of nights */
            esc_html__('%s nights are in occupancy but not in the rate: their stay is in an export, but the money has not come through yet. Counting them in the denominator alone would read as a discount nobody gave.', 'dcc-ledger'),
            esc_html(number_format((float) $t['nights_without_revenue']))
        );
        ?>
    </p>
<?php endif; ?>

<h3 class="dccl-h3"><?php esc_html_e('Lead Time', 'dcc-ledger'); ?></h3>
<p class="dccl-note">
    <?php esc_html_e('How far ahead guests booked, over stays checking in inside the range. Platform and direct are kept apart because they are not the same measurement.', 'dcc-ledger'); ?>
</p>

<div class="dccl-tiles">
    <?php
    echo Ui::tile(
        __('Platform Lead Time', 'dcc-ledger'),
        $t['lead_time_median'] === null
            ? Ui::unknown()
            : esc_html(sprintf(
                /* translators: %d: days */
                _n('%d day', '%d days', (int) $t['lead_time_median'], 'dcc-ledger'),
                (int) $t['lead_time_median']
            )),
        sprintf(
            /* translators: 1: mean days, 2: number of stays */
            __('Median; mean %1$s, over %2$s stays. From the guest\'s own booking date, as the export states it.', 'dcc-ledger'),
            $t['lead_time_mean'] === null ? __('unknown', 'dcc-ledger') : number_format((float) $t['lead_time_mean'], 1),
            number_format((float) $t['lead_time_count'])
        )
    );
    echo Ui::tile(
        __('Direct Lead Time', 'dcc-ledger'),
        $t['direct_lead_time_median'] === null
            ? Ui::unknown()
            : esc_html(sprintf(
                /* translators: %d: days */
                _n('%d day', '%d days', (int) $t['direct_lead_time_median'], 'dcc-ledger'),
                (int) $t['direct_lead_time_median']
            )),
        sprintf(
            /* translators: 1: mean days, 2: number of bookings */
            __('Median; mean %1$s, over %2$s bookings. From the date the booking was entered, which for one typed in later is not the day the guest booked — a floor, not a fact.', 'dcc-ledger'),
            $t['direct_lead_time_mean'] === null ? __('unknown', 'dcc-ledger') : number_format((float) $t['direct_lead_time_mean'], 1),
            number_format((float) $t['direct_lead_time_count'])
        ),
        'warn'
    );
    ?>
</div>

<h3 class="dccl-h3"><?php esc_html_e('Booking Pace', 'dcc-ledger'); ?></h3>

<?php
$pace_dates   = DCCL\Pace::recorded_dates();
$pace_missing = DCCL\Pace::missing_dates();
$pace_months  = DCCL\Pace::months_covered();
$pace_first   = DCCL\Pace::first_complete_month();
?>

<p class="dccl-note">
    <?php esc_html_e('Room nights on the books, as at a date. This is recorded once a night and never worked out afterwards: a curve drawn from today\'s bookings would show what survived to today, not what stood on the day, and would understate every month that saw cancellations.', 'dcc-ledger'); ?>
</p>

<?php if ($pace_dates === []) : ?>
    <p class="dccl-empty">
        <?php esc_html_e('Nothing recorded yet. Recording begins the night after this plugin is activated.', 'dcc-ledger'); ?>
    </p>
<?php else : ?>
    <p class="dccl-note">
        <?php
        printf(
            /* translators: 1: first date recorded, 2: number of nights recorded */
            esc_html__('Recording since %1$s, %2$s nights so far.', 'dcc-ledger'),
            esc_html($pace_dates[0]),
            esc_html(number_format((float) count($pace_dates)))
        );
        ?>
        <?php if ($pace_missing !== []) : ?>
            <?php
            printf(
                /* translators: 1: number of missed nights, 2: the dates, comma separated */
                esc_html__('%1$s nights were missed and are left as gaps rather than filled in: %2$s.', 'dcc-ledger'),
                esc_html(number_format((float) count($pace_missing))),
                esc_html(implode(', ', array_slice($pace_missing, 0, 10)))
            );
            ?>
        <?php endif; ?>
    </p>

    <?php if ($pace_months === []) : ?>
        <p class="dccl-empty">
            <?php
            if ($pace_first !== null) {
                printf(
                    /* translators: %s: a month, as YYYY-MM */
                    esc_html__('No month has a complete curve yet. The first one will be %s — a curve starts 180 days before the month begins, so the history has to be that long before a month can be charted.', 'dcc-ledger'),
                    esc_html($pace_first)
                );
            } else {
                esc_html_e('No month has a complete curve yet.', 'dcc-ledger');
            }
            ?>
        </p>
    <?php else : ?>
        <div class="dccl-table-wrap">
            <table class="dccl-table">
                <caption><?php esc_html_e('Room nights on the books at each point before the month began. Only months whose every reading was recorded are shown.', 'dcc-ledger'); ?></caption>
                <thead>
                    <tr>
                        <th scope="col"><?php esc_html_e('Stay Month', 'dcc-ledger'); ?></th>
                        <?php foreach (DCCL\Pace::DAYS_OUT as $days) : ?>
                            <th scope="col">
                                <?php
                                echo esc_html($days === 0
                                    ? __('At The Month', 'dcc-ledger')
                                    : sprintf(
                                        /* translators: %d: days before the month begins */
                                        __('%d Days Out', 'dcc-ledger'),
                                        $days
                                    ));
                                ?>
                            </th>
                        <?php endforeach; ?>
                    </tr>
                </thead>
                <tbody>
                <?php foreach ($pace_months as $pace_month) : ?>
                    <tr>
                        <th scope="row"><?php echo esc_html($pace_month); ?></th>
                        <?php foreach (DCCL\Pace::curve($pace_month) as $point) : ?>
                            <td>
                                <?php echo $point['room_nights'] === null
                                    ? Ui::unknown()
                                    : Ui::number($point['room_nights']); ?>
                            </td>
                        <?php endforeach; ?>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    <?php endif; ?>
<?php endif; ?>

<h3 class="dccl-h3"><?php esc_html_e('Taxes', 'dcc-ledger'); ?></h3>
<p class="dccl-note">
    <?php esc_html_e('Three separate facts, never added together. This is a record of what the exports say, not tax advice.', 'dcc-ledger'); ?>
</p>
<div class="dccl-tiles">
    <?php
    echo Ui::tile(
        __('Remitted By The Platform', 'dcc-ledger'),
        Ui::money($t['tax_platform_remitted']),
        __('Collected and paid by the platform. Not Rob\'s money, and not revenue.', 'dcc-ledger')
    );
    echo Ui::tile(
        __('Collected In Payout', 'dcc-ledger'),
        Ui::money($t['tax_in_payout']),
        __('Paid to Rob inside the payout, for Rob to remit.', 'dcc-ledger')
    );
    $not_reported = $summary['ota']['tax_not_reported'];
    echo Ui::tile(
        __('Not Reported', 'dcc-ledger'),
        $not_reported === []
            ? esc_html__('None', 'dcc-ledger')
            : esc_html(implode(', ', array_map([Cottages::class, 'channel_label'], $not_reported))),
        __('These channels report no tax figure at all. Unknown, not zero.', 'dcc-ledger'),
        $not_reported === [] ? '' : 'warn'
    );
    ?>
</div>

<h3 class="dccl-h3"><?php esc_html_e('Direct Bookings', 'dcc-ledger'); ?></h3>
<?php if (!$summary['snapshot_taken']) : ?>
    <div class="dccl-notice dccl-notice--error">
        <p>
            <strong><?php esc_html_e('No snapshot of MotoPress has been taken yet, so there are no direct-booking figures.', 'dcc-ledger'); ?></strong>
            <?php esc_html_e('Run Refresh From MotoPress on the Imports tab.', 'dcc-ledger'); ?>
        </p>
    </div>
<?php else : ?>
    <p class="dccl-note">
        <?php
        printf(
            /* translators: %s: when the ledger last copied MotoPress */
            esc_html__('From the ledger\'s own copy of MotoPress, taken %s. MotoPress itself is never written to, and these Original figures are never edited — the ledger\'s corrections sit on top of them.', 'dcc-ledger'),
            esc_html((string) $summary['snapshot_at'])
        );
        ?>
    </p>
<?php endif; ?>
<div class="dccl-tiles">
    <?php
    echo Ui::tile(__('Due', 'dcc-ledger'), Ui::money($t['direct_due']), __('Booking totals, as copied', 'dcc-ledger'));
    echo Ui::tile(__('Recorded', 'dcc-ledger'), Ui::money($t['direct_recorded']), __('Completed payments, as copied', 'dcc-ledger'));
    echo Ui::tile(
        __('Assumed', 'dcc-ledger'),
        Ui::money($t['direct_assumed']),
        $period['view'] === 'original'
            ? __('Not counted in the Original view', 'dcc-ledger')
            : __('Ledger adjustment, dated at check-in, actual date unknown', 'dcc-ledger'),
        'warn'
    );
    echo Ui::tile(
        __('Counted As Paid', 'dcc-ledger'),
        Ui::money($t['direct_paid']),
        $view_sources[$period['view']],
        'good'
    );
    if ((float) $t['direct_refunded'] != 0.0) {
        echo Ui::tile(
            __('Refunded', 'dcc-ledger'),
            Ui::money($t['direct_refunded']),
            __('Refunded payments keep their amount in MotoPress; they are shown here and never counted as paid', 'dcc-ledger'),
            'warn'
        );
    }
    ?>
</div>

<h3 class="dccl-h3"><?php esc_html_e('Other Figures', 'dcc-ledger'); ?></h3>
<div class="dccl-table-wrap">
    <table class="dccl-table">
        <caption><?php esc_html_e('Cancellations, lead time and channel mix for the period.', 'dcc-ledger'); ?></caption>
        <tbody>
            <tr>
                <th scope="row"><?php esc_html_e('Cancellations', 'dcc-ledger'); ?></th>
                <td><?php echo Ui::number($t['cancellations']); ?></td>
                <td><?php esc_html_e('Platform stays cancelled, by check-in date', 'dcc-ledger'); ?></td>
            </tr>
            <tr>
                <th scope="row"><?php esc_html_e('Cancellation Fees', 'dcc-ledger'); ?></th>
                <td><?php echo Ui::money($t['cancellation_fees']); ?></td>
                <td><?php esc_html_e('Fees charged, less any fee refunds', 'dcc-ledger'); ?></td>
            </tr>
            <tr>
                <th scope="row"><?php esc_html_e('Median Lead Time', 'dcc-ledger'); ?></th>
                <td>
                    <?php
                    echo $t['lead_time_median'] === null
                        ? esc_html__('Not known', 'dcc-ledger')
                        : esc_html(sprintf(
                            /* translators: %d: number of days */
                            _n('%d day', '%d days', (int) $t['lead_time_median'], 'dcc-ledger'),
                            (int) $t['lead_time_median']
                        ));
                    ?>
                </td>
                <td><?php esc_html_e('Booked on to check-in, platform stays only', 'dcc-ledger'); ?></td>
            </tr>
            <?php if ($direct['copies_excluded'] > 0) : ?>
                <tr>
                    <th scope="row"><?php esc_html_e('Hand-Typed Copies Excluded', 'dcc-ledger'); ?></th>
                    <td><?php echo Ui::number($direct['copies_excluded']); ?></td>
                    <td>
                        <?php
                        printf(
                            /* translators: %s: payments recorded on copies */
                            esc_html__('Counted once on the platform stay. %s in payments sits on those copies and is not counted.', 'dcc-ledger'),
                            Ui::money($direct['copy_payments'])
                        );
                        ?>
                    </td>
                </tr>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<h3 class="dccl-h3"><?php esc_html_e('Channel Mix', 'dcc-ledger'); ?></h3>
<div class="dccl-table-wrap">
    <table class="dccl-table">
        <caption><?php esc_html_e('Nights and net payout by channel for the period. Direct bookings have no platform payout — their money is in the Direct Bookings figures above.', 'dcc-ledger'); ?></caption>
        <thead>
            <tr>
                <th scope="col"><?php esc_html_e('Channel', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Nights', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Share Of Nights', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Net Payout', 'dcc-ledger'); ?></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($summary['by_channel'] as $channel => $row) : ?>
                <?php $share = $t['nights'] > 0 ? round($row['nights'] / $t['nights'] * 100, 1) : 0.0; ?>
                <tr>
                    <th scope="row"><?php echo esc_html(Cottages::channel_label((string) $channel)); ?></th>
                    <td><?php echo Ui::number($row['nights']); ?></td>
                    <td><?php echo Ui::number($share, 1); ?>%</td>
                    <td>
                        <?php echo $channel === 'direct' ? Ui::not_applicable() : Ui::money($row['net_payout'] ?? 0); ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

<?php include __DIR__ . '/partial-footnotes.php'; ?>

<p class="dccl-actions">
    <a class="button" href="<?php echo esc_url(Ui::export_url('overview', $period)); ?>">
        <?php esc_html_e('Export This Table To CSV', 'dcc-ledger'); ?>
    </a>
</p>
