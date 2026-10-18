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

$summary = Reports::summary($period['from'], $period['to'], $period['basis']);
$t       = $summary['totals'];
$direct  = $summary['direct'];
?>
<h2 class="dccl-h2"><?php esc_html_e('Overview', 'dcc-ledger'); ?></h2>

<div class="dccl-tiles">
    <?php
    echo Ui::tile(
        __('Guest Total', 'dcc-ledger'),
        Ui::money($t['guest_total']),
        __('What guests paid the platforms', 'dcc-ledger')
    );
    echo Ui::tile(
        __('Platform Fees', 'dcc-ledger'),
        Ui::money($t['platform_fees']),
        __('Commission and service fees', 'dcc-ledger')
    );
    echo Ui::tile(
        __('Net Payout', 'dcc-ledger'),
        Ui::money($t['net_payout']),
        __('Payouts, refunds and adjustments', 'dcc-ledger')
    );
    echo Ui::tile(
        __('Nights', 'dcc-ledger'),
        Ui::number($t['nights']),
        __('Platform stays plus direct bookings, each copy once', 'dcc-ledger')
    );
    echo Ui::tile(
        __('Occupancy', 'dcc-ledger'),
        Ui::number($t['occupancy_pct'], 1) . '%',
        sprintf(
            /* translators: 1: nights booked, 2: nights available */
            __('%1$s of %2$s cottage-nights', 'dcc-ledger'),
            number_format((float) $t['nights']),
            number_format((float) $t['capacity_nights'])
        )
    );
    echo Ui::tile(
        __('Average Nightly Rate', 'dcc-ledger'),
        Ui::money($t['adr']),
        __('Room revenue divided by platform nights', 'dcc-ledger')
    );
    ?>
</div>

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
<p class="dccl-note">
    <?php esc_html_e('Read live from MotoPress. Recorded payments and assumed payments are shown apart and never blended.', 'dcc-ledger'); ?>
</p>
<div class="dccl-tiles">
    <?php
    echo Ui::tile(__('Due', 'dcc-ledger'), Ui::money($t['direct_due']), __('MotoPress booking totals', 'dcc-ledger'));
    echo Ui::tile(__('Recorded', 'dcc-ledger'), Ui::money($t['direct_recorded']), __('Payments Rob entered himself', 'dcc-ledger'));
    echo Ui::tile(
        __('Assumed', 'dcc-ledger'),
        Ui::money($t['direct_assumed']),
        __('Added 2026-10-18 as paid in full, dated at check-in', 'dcc-ledger'),
        'warn'
    );
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
