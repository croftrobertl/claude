<?php
/**
 * By Cottage.
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
$days    = $summary['days'];
?>
<h2 class="dccl-h2"><?php esc_html_e('By Cottage', 'dcc-ledger'); ?></h2>

<div class="dccl-table-wrap">
    <table class="dccl-table">
        <caption><?php esc_html_e('Nights, occupancy and money for each of the eight cottages. Crofty Bear is not a cottage and never appears here.', 'dcc-ledger'); ?></caption>
        <thead>
            <tr>
                <th scope="col"><?php esc_html_e('Cottage', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Nights', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Occupancy', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Guest Total', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Room Revenue', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Platform Fees', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Tax In Payout', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Net Payout', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Nightly Rate', 'dcc-ledger'); ?></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach (Cottages::COTTAGES as $cottage) : ?>
                <?php
                $row = $summary['by_cottage'][$cottage] ?? [];
                $occ = $days > 0 ? round(((int) ($row['nights'] ?? 0)) / $days * 100, 1) : 0.0;
                ?>
                <tr>
                    <th scope="row"><?php echo esc_html(Cottages::label($cottage)); ?></th>
                    <td><?php echo Ui::number($row['nights'] ?? 0); ?></td>
                    <td><?php echo Ui::number($occ, 1); ?>%</td>
                    <td><?php echo Ui::money($row['guest_total'] ?? 0); ?></td>
                    <td><?php echo Ui::money($row['room_revenue'] ?? 0); ?></td>
                    <td><?php echo Ui::money($row['platform_fees'] ?? 0); ?></td>
                    <td><?php echo Ui::money($row['tax_in_payout'] ?? 0); ?></td>
                    <td><?php echo Ui::money($row['net_payout'] ?? 0); ?></td>
                    <td><?php echo Ui::money($row['adr'] ?? 0); ?></td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

<?php include __DIR__ . '/partial-footnotes.php'; ?>

<p class="dccl-actions">
    <a class="button" href="<?php echo esc_url(Ui::export_url('cottage', $period)); ?>">
        <?php esc_html_e('Export This Table To CSV', 'dcc-ledger'); ?>
    </a>
</p>
