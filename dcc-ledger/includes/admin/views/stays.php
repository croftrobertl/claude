<?php
/**
 * Stays: one row per platform reservation overlapping the period.
 *
 * @var array $period
 */

use DCCL\Cottages;
use DCCL\Reports;
use DCCL\Ui;

if (!defined('ABSPATH')) {
    exit;
}

$rows = Reports::stay_rows($period['from'], $period['to']);
?>
<h2 class="dccl-h2"><?php esc_html_e('Stays', 'dcc-ledger'); ?></h2>
<p class="dccl-note">
    <?php esc_html_e('A stay is identified by its channel, confirmation code, cottage and dates. No guest names are held anywhere in the ledger — open the MotoPress booking when you need to know who it was.', 'dcc-ledger'); ?>
</p>

<div class="dccl-table-wrap">
    <table class="dccl-table dccl-table--wide">
        <caption>
            <?php
            printf(
                /* translators: %d: number of stays */
                esc_html(_n('%d stay overlapping this period.', '%d stays overlapping this period.', count($rows), 'dcc-ledger')),
                count($rows)
            );
            ?>
        </caption>
        <thead>
            <tr>
                <th scope="col"><?php esc_html_e('Channel', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Code', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Cottage', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Dates', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Nights', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Status', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Guest Total', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Fees', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Net Payout', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('MotoPress', 'dcc-ledger'); ?></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($rows as $row) : ?>
                <tr>
                    <td><?php echo esc_html(Cottages::channel_label((string) $row['channel'])); ?></td>
                    <td class="dccl-code"><?php echo esc_html((string) $row['code']); ?></td>
                    <td><?php echo esc_html((string) $row['cottage']); ?></td>
                    <td>
                        <?php echo esc_html((string) $row['check_in']); ?>
                        <?php echo $row['check_out'] !== null ? esc_html(' → ' . $row['check_out']) : ' → ' . esc_html__('unknown', 'dcc-ledger'); ?>
                    </td>
                    <td>
                        <?php echo Ui::number($row['nights_in']); ?>
                        <?php if ((int) $row['nights_in'] !== (int) ($row['nights'] ?? 0)) : ?>
                            <span class="dccl-muted">
                                <?php
                                printf(
                                    /* translators: %d: the stay's total nights */
                                    esc_html__('of %d', 'dcc-ledger'),
                                    (int) ($row['nights'] ?? 0)
                                );
                                ?>
                            </span>
                        <?php endif; ?>
                    </td>
                    <td><?php echo Ui::status_chip((string) $row['status']); ?></td>
                    <td><?php echo Ui::money($row['guest_total']); ?></td>
                    <td><?php echo Ui::money($row['platform_fees']); ?></td>
                    <td><?php echo Ui::money($row['net_payout']); ?></td>
                    <td>
                        <?php if ($row['links'] === []) : ?>
                            <?php echo Ui::chip(__('Not Linked', 'dcc-ledger'), 'warn'); ?>
                        <?php else : ?>
                            <?php foreach ($row['links'] as $link) : ?>
                                <?php echo Ui::booking_link((int) $link['mphb_booking_id']); ?>
                                <?php echo Ui::chip((string) $link['method'], $link['method'] === 'copy' ? 'muted' : ''); ?>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

<p class="dccl-actions">
    <a class="button" href="<?php echo esc_url(Ui::export_url('stays', $period)); ?>">
        <?php esc_html_e('Export This Table To CSV', 'dcc-ledger'); ?>
    </a>
</p>
