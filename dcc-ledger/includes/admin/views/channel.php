<?php
/**
 * By Channel.
 *
 * @var array $period
 */

use DCCL\Cottages;
use DCCL\Reports;
use DCCL\Ui;

if (!defined('ABSPATH')) {
    exit;
}

$summary  = Reports::summary($period['from'], $period['to'], $period['basis'], $period['view']);
$direct   = $summary['direct'];
$untaxed  = $summary['ota']['tax_not_reported'];

/** A channel that reports no tax at all has unknown tax, not zero tax. */
$tax_cell = static function (string $channel, int $cents) use ($untaxed): string {
    if (in_array($channel, $untaxed, true)) {
        return '<span class="dccl-muted">' . esc_html__('Not Reported', 'dcc-ledger') . '</span>';
    }
    return Ui::money($cents);
};
?>
<h2 class="dccl-h2"><?php esc_html_e('By Channel', 'dcc-ledger'); ?></h2>

<div class="dccl-table-wrap">
    <table class="dccl-table">
        <caption><?php esc_html_e('What each channel brought in, and what it kept. Direct bookings have no platform figures at all — theirs are below, read live from MotoPress.', 'dcc-ledger'); ?></caption>
        <thead>
            <tr>
                <th scope="col"><?php esc_html_e('Channel', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Nights', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Guest Total', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Platform Fees', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Tax Remitted By Platform', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Tax In Payout', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Net Payout', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Nightly Rate', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Source', 'dcc-ledger'); ?></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($summary['by_channel'] as $channel => $row) : ?>
                <tr>
                    <th scope="row">
                        <?php echo esc_html(Cottages::channel_label((string) $channel)); ?>
                        <?php
                        if (in_array((string) $channel, $summary['ota']['tax_not_reported'], true)) {
                            echo ' ' . Ui::chip(__('Tax Not Reported', 'dcc-ledger'), 'warn');
                        }
                        ?>
                    </th>
                    <?php $is_direct = (string) $channel === 'direct'; ?>
                    <td><?php echo Ui::number($row['nights'] ?? 0); ?></td>
                    <td><?php echo $is_direct ? Ui::not_applicable() : Ui::money((int) ($row['guest_total'] ?? 0)); ?></td>
                    <td><?php echo $is_direct ? Ui::not_applicable() : Ui::money((int) ($row['platform_fees'] ?? 0)); ?></td>
                    <td><?php echo $is_direct ? Ui::not_applicable() : $tax_cell((string) $channel, (int) ($row['tax_platform_remitted'] ?? 0)); ?></td>
                    <td><?php echo $is_direct ? Ui::not_applicable() : $tax_cell((string) $channel, (int) ($row['tax_in_payout'] ?? 0)); ?></td>
                    <td><?php echo $is_direct ? Ui::not_applicable() : Ui::money((int) ($row['net_payout'] ?? 0)); ?></td>
                    <td><?php echo $is_direct ? Ui::not_applicable() : Ui::money((int) ($row['adr'] ?? 0)); ?></td>
                    <td>
                        <a href="<?php echo esc_url(Ui::trail_url($period, 'net_payout')); ?>">
                            <?php esc_html_e('Rows', 'dcc-ledger'); ?>
                        </a>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

<h3 class="dccl-h3"><?php esc_html_e('Channel Mix', 'dcc-ledger'); ?></h3>
<p class="dccl-note">
    <?php esc_html_e('Two different pictures, so both are shown. A channel can be a third of the nights and a quarter of the money.', 'dcc-ledger'); ?>
</p>

<?php
$mix_nights = 0;
$mix_money  = 0;
foreach ($summary['by_channel'] as $row) {
    $mix_nights += (int) ($row['nights'] ?? 0);
    $mix_money  += (int) ($row['net_payout'] ?? 0);
}
// Direct bookings have no payout line; what reached Rob for them is what
// the ledger counts as paid.
$mix_money += (int) $direct['paid'];
?>

<div class="dccl-table-wrap">
    <table class="dccl-table">
        <caption><?php esc_html_e('Share of nights, and share of the money that reached the bank after commission.', 'dcc-ledger'); ?></caption>
        <thead>
            <tr>
                <th scope="col"><?php esc_html_e('Channel', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Nights', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Share Of Nights', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Net Revenue', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Share Of Net Revenue', 'dcc-ledger'); ?></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($summary['by_channel'] as $channel => $row) : ?>
                <?php
                $is_direct = (string) $channel === 'direct';
                $nights    = (int) ($row['nights'] ?? 0);
                $money     = $is_direct ? (int) $direct['paid'] : (int) ($row['net_payout'] ?? 0);
                ?>
                <tr>
                    <th scope="row"><?php echo esc_html(Cottages::channel_label((string) $channel)); ?></th>
                    <td><?php echo Ui::number($nights); ?></td>
                    <td>
                        <?php echo $mix_nights > 0
                            ? esc_html(number_format($nights / $mix_nights * 100, 1) . '%')
                            : Ui::unknown(); ?>
                    </td>
                    <td><?php echo Ui::money($money); ?></td>
                    <td>
                        <?php echo $mix_money !== 0
                            ? esc_html(number_format($money / $mix_money * 100, 1) . '%')
                            : Ui::unknown(); ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

<h3 class="dccl-h3"><?php esc_html_e('Direct Bookings', 'dcc-ledger'); ?></h3>
<div class="dccl-tiles">
    <?php
    echo Ui::tile(__('Nights', 'dcc-ledger'), Ui::number($direct['nights']), __('Excluding hand-typed copies', 'dcc-ledger'));
    echo Ui::tile(__('Due', 'dcc-ledger'), Ui::money($direct['due']), __('MotoPress booking totals', 'dcc-ledger'));
    echo Ui::tile(__('Recorded', 'dcc-ledger'), Ui::money($direct['recorded']), __('Payments Rob entered himself', 'dcc-ledger'));
    echo Ui::tile(__('Assumed', 'dcc-ledger'), Ui::money($direct['assumed']), __('Assumed paid in full on 2026-10-18', 'dcc-ledger'), 'warn');
    ?>
</div>

<?php include __DIR__ . '/partial-footnotes.php'; ?>

<p class="dccl-actions">
    <a class="button" href="<?php echo esc_url(Ui::export_url('channel', $period)); ?>">
        <?php esc_html_e('Export This Table To CSV', 'dcc-ledger'); ?>
    </a>
</p>
