<?php
/**
 * The footnotes that must travel with every figure.
 *
 * @var array $period
 * @var array $summary
 */

use DCCL\Cottages;

if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="dccl-footnotes">
    <h3 class="dccl-h3"><?php esc_html_e('What These Figures Rest On', 'dcc-ledger'); ?></h3>
    <ul>
        <li>
            <?php
            printf(
                /* translators: 1: window start, 2: window end */
                esc_html__('Rob reconciled the platform exports for %1$s to %2$s. Anything outside that window is shown as recorded, not as reconciled.', 'dcc-ledger'),
                esc_html(Cottages::WINDOW_START),
                esc_html(Cottages::RECONCILED_THROUGH)
            );
            ?>
        </li>
        <?php if (!empty($summary['beyond_window'])) : ?>
            <li class="dccl-warn">
                <?php esc_html_e('This period runs past the reconciled window. Later data is as recorded and may be incomplete.', 'dcc-ledger'); ?>
            </li>
        <?php endif; ?>
        <li>
            <?php esc_html_e('Direct-booking money comes from MotoPress: the booking total is what was due, and completed payments are what was paid. Payments added on 2026-10-18 as assumed are shown apart from recorded ones.', 'dcc-ledger'); ?>
        </li>
        <li>
            <?php esc_html_e('Assumed payments are dated at the booking\'s check-in, because the real payment date is not known. By payout date, a stay that began in 2024 therefore places its money in 2024.', 'dcc-ledger'); ?>
        </li>
        <li>
            <?php esc_html_e('Booking.com pays out the guest\'s gross including the taxes Rob remits, and invoices commission separately. The payout is never presented as revenue.', 'dcc-ledger'); ?>
        </li>
        <li>
            <?php esc_html_e('Tax Airbnb remitted itself is shown on its own and is never added to revenue.', 'dcc-ledger'); ?>
        </li>
        <li>
            <?php esc_html_e('A platform stay that was also typed into MotoPress by hand counts once, on the platform stay.', 'dcc-ledger'); ?>
        </li>
    </ul>
</div>
