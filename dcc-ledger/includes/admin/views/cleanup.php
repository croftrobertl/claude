<?php
/**
 * Cleanup: everything that needs a person, computed fresh each load.
 *
 * @var array $period
 */

use DCCL\Admin;
use DCCL\Issues;
use DCCL\Ui;

if (!defined('ABSPATH')) {
    exit;
}

$items     = Issues::all();
$open      = array_values(array_filter($items, static fn ($i) => !$i['reviewed']));
$reviewed  = array_values(array_filter($items, static fn ($i) => $i['reviewed']));
$invoices  = Issues::invoices();
$reconcile = array_filter($invoices, static fn ($i) => !$i['reconciles']);
?>
<h2 class="dccl-h2"><?php esc_html_e('Cleanup', 'dcc-ledger'); ?></h2>
<p class="dccl-note">
    <?php esc_html_e('Each item is worked out from the ledger and MotoPress every time this page loads. Nothing here changes anything on its own, and nothing is ever written back to MotoPress.', 'dcc-ledger'); ?>
</p>

<div class="dccl-tiles">
    <?php
    echo Ui::tile(__('Needs A Person', 'dcc-ledger'), Ui::number(count($open)), __('Open cleanup items', 'dcc-ledger'), count($open) > 0 ? 'warn' : 'good');
    echo Ui::tile(__('Reviewed', 'dcc-ledger'), Ui::number(count($reviewed)), __('Marked done, with a note', 'dcc-ledger'));
    echo Ui::tile(
        __('Invoices', 'dcc-ledger'),
        Ui::number(count($invoices)),
        sprintf(
            /* translators: %d: number of invoices that do not reconcile */
            __('%d do not reconcile', 'dcc-ledger'),
            count($reconcile)
        ),
        count($reconcile) > 0 ? 'bad' : 'good'
    );
    ?>
</div>

<form class="dccl-actions" method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
    <?php wp_nonce_field(Admin::NONCE); ?>
    <input type="hidden" name="action" value="dccl_link">
    <button type="submit" class="button button-primary"><?php esc_html_e('Match Stays To MotoPress', 'dcc-ledger'); ?></button>
    <span class="dccl-muted"><?php esc_html_e('Links by confirmation code and by exact cottage and dates only. An overlap or a moved cottage is never linked for you.', 'dcc-ledger'); ?></span>
</form>

<?php if ($open === []) : ?>
    <p class="dccl-empty"><?php esc_html_e('Nothing needs a person right now.', 'dcc-ledger'); ?></p>
<?php endif; ?>

<?php foreach (array_merge($open, $reviewed) as $item) : ?>
    <article class="dccl-issue dccl-issue--<?php echo esc_attr($item['severity']); ?><?php echo $item['reviewed'] ? ' is-reviewed' : ''; ?>">
        <h3 class="dccl-issue__title">
            <?php echo esc_html($item['title']); ?>
            <?php if ($item['reviewed']) : ?>
                <?php echo Ui::chip(__('Reviewed', 'dcc-ledger'), 'good'); ?>
            <?php endif; ?>
        </h3>

        <ul class="dccl-issue__facts">
            <?php foreach ($item['facts'] as $fact) : ?>
                <li><?php echo esc_html($fact); ?></li>
            <?php endforeach; ?>
        </ul>

        <p class="dccl-issue__action"><strong><?php esc_html_e('Suggested:', 'dcc-ledger'); ?></strong> <?php echo esc_html($item['action']); ?></p>

        <?php if (!empty($item['booking_id'])) : ?>
            <p><?php esc_html_e('MotoPress booking:', 'dcc-ledger'); ?> <?php echo Ui::booking_link((int) $item['booking_id']); ?></p>
        <?php endif; ?>

        <div class="dccl-issue__controls">
            <?php if (!empty($item['suggest_copy']) && !empty($item['stay_id'])) : ?>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                    <?php wp_nonce_field(Admin::NONCE); ?>
                    <input type="hidden" name="action" value="dccl_manual_link">
                    <input type="hidden" name="stay_id" value="<?php echo (int) $item['stay_id']; ?>">
                    <input type="hidden" name="booking_id" value="<?php echo (int) $item['suggest_copy']; ?>">
                    <input type="hidden" name="method" value="copy">
                    <button type="submit" class="button">
                        <?php
                        printf(
                            /* translators: %d: MotoPress booking id */
                            esc_html__('Link #%d As A Copy', 'dcc-ledger'),
                            (int) $item['suggest_copy']
                        );
                        ?>
                    </button>
                </form>
            <?php endif; ?>

            <?php foreach ($item['candidates'] ?? [] as $candidate) : ?>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                    <?php wp_nonce_field(Admin::NONCE); ?>
                    <input type="hidden" name="action" value="dccl_manual_link">
                    <input type="hidden" name="stay_id" value="<?php echo (int) $item['stay_id']; ?>">
                    <input type="hidden" name="booking_id" value="<?php echo (int) $candidate['id']; ?>">
                    <input type="hidden" name="method" value="<?php echo esc_attr($candidate['method']); ?>">
                    <button type="submit" class="button">
                        <?php
                        printf(
                            $candidate['method'] === 'copy'
                                /* translators: %d: MotoPress booking id */
                                ? esc_html__('Link #%d As A Copy', 'dcc-ledger')
                                /* translators: %d: MotoPress booking id */
                                : esc_html__('Link To #%d', 'dcc-ledger'),
                            (int) $candidate['id']
                        );
                        ?>
                    </button>
                </form>
            <?php endforeach; ?>

            <form class="dccl-review" method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <?php wp_nonce_field(Admin::NONCE); ?>
                <input type="hidden" name="action" value="dccl_review">
                <input type="hidden" name="issue_key" value="<?php echo esc_attr($item['key']); ?>">
                <?php if ($item['reviewed']) : ?>
                    <input type="hidden" name="undo_review" value="1">
                    <span class="dccl-muted"><?php echo esc_html($item['review_note']); ?></span>
                    <button type="submit" class="button-link"><?php esc_html_e('Put Back On The List', 'dcc-ledger'); ?></button>
                <?php else : ?>
                    <label class="screen-reader-text" for="note-<?php echo esc_attr(md5($item['key'])); ?>">
                        <?php esc_html_e('Note', 'dcc-ledger'); ?>
                    </label>
                    <input type="text" id="note-<?php echo esc_attr(md5($item['key'])); ?>" name="note"
                           maxlength="200" placeholder="<?php esc_attr_e('What did you decide?', 'dcc-ledger'); ?>">
                    <button type="submit" class="button"><?php esc_html_e('Mark Reviewed', 'dcc-ledger'); ?></button>
                <?php endif; ?>
            </form>
        </div>
    </article>
<?php endforeach; ?>

<h3 class="dccl-h3"><?php esc_html_e('Booking.com Invoices', 'dcc-ledger'); ?></h3>
<div class="dccl-table-wrap">
    <table class="dccl-table">
        <caption><?php esc_html_e('Each invoice against the reservations matched to it. Both the room sales and the commission must agree.', 'dcc-ledger'); ?></caption>
        <thead>
            <tr>
                <th scope="col"><?php esc_html_e('Invoice', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Date', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Cottage', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Room Sales', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Commission', 'dcc-ledger'); ?></th>
                <th scope="col"><?php esc_html_e('Reconciles', 'dcc-ledger'); ?></th>
            </tr>
        </thead>
        <tbody>
            <?php if ($invoices === []) : ?>
                <tr><td colspan="6"><?php esc_html_e('No invoices imported yet.', 'dcc-ledger'); ?></td></tr>
            <?php endif; ?>
            <?php foreach ($invoices as $invoice) : ?>
                <tr>
                    <th scope="row" class="dccl-code"><?php echo esc_html($invoice['number']); ?></th>
                    <td><?php echo esc_html($invoice['date']); ?></td>
                    <td><?php echo esc_html($invoice['cottage']); ?></td>
                    <td>
                        <?php echo Ui::money($invoice['room_sales']); ?>
                        <span class="dccl-muted"><?php echo Ui::money($invoice['matched_room_sales']); ?></span>
                    </td>
                    <td>
                        <?php echo Ui::money($invoice['commission']); ?>
                        <span class="dccl-muted"><?php echo Ui::money($invoice['matched_commission']); ?></span>
                    </td>
                    <td>
                        <?php echo $invoice['reconciles']
                            ? Ui::chip(__('Yes', 'dcc-ledger'), 'good')
                            : Ui::chip(__('No', 'dcc-ledger'), 'bad'); ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

<p class="dccl-actions">
    <a class="button" href="<?php echo esc_url(Ui::export_url('cleanup', $period)); ?>">
        <?php esc_html_e('Export Cleanup List To CSV', 'dcc-ledger'); ?>
    </a>
    <a class="button" href="<?php echo esc_url(Ui::export_url('invoices', $period)); ?>">
        <?php esc_html_e('Export Invoices To CSV', 'dcc-ledger'); ?>
    </a>
</p>
