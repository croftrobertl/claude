<?php
/**
 * Settings: the channel maps and the uninstall switch.
 *
 * @var array $period
 */

use DCCL\Admin;
use DCCL\Cottages;
use DCCL\Settings;

if (!defined('ABSPATH')) {
    exit;
}

$bookingcom = Cottages::bookingcom_map();
$vrbo       = Cottages::vrbo_map();
?>
<h2 class="dccl-h2"><?php esc_html_e('Settings', 'dcc-ledger'); ?></h2>

<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
    <?php wp_nonce_field(Admin::NONCE); ?>
    <input type="hidden" name="action" value="dccl_settings">

    <h3 class="dccl-h3"><?php esc_html_e('Booking.com Hotel Ids', 'dcc-ledger'); ?></h3>
    <div class="dccl-table-wrap">
        <table class="dccl-table">
            <caption><?php esc_html_e('Which cottage each Booking.com hotel id belongs to. Crofty Bear is excluded from every figure.', 'dcc-ledger'); ?></caption>
            <thead>
                <tr>
                    <th scope="col"><?php esc_html_e('Hotel Id', 'dcc-ledger'); ?></th>
                    <th scope="col"><?php esc_html_e('Cottage', 'dcc-ledger'); ?></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($bookingcom as $id => $cottage) : ?>
                    <tr>
                        <th scope="row" class="dccl-code"><?php echo esc_html((string) $id); ?></th>
                        <td>
                            <label class="screen-reader-text" for="bc-<?php echo esc_attr((string) $id); ?>">
                                <?php esc_html_e('Cottage', 'dcc-ledger'); ?>
                            </label>
                            <select id="bc-<?php echo esc_attr((string) $id); ?>" name="map[bookingcom][<?php echo esc_attr((string) $id); ?>]">
                                <?php foreach (Cottages::COTTAGES as $option) : ?>
                                    <option value="<?php echo esc_attr($option); ?>" <?php selected($cottage, $option); ?>>
                                        <?php echo esc_html(Cottages::label($option)); ?>
                                    </option>
                                <?php endforeach; ?>
                                <option value="<?php echo esc_attr(Cottages::EXCLUDED); ?>" <?php selected($cottage, Cottages::EXCLUDED); ?>>
                                    <?php esc_html_e('Crofty Bear — Excluded', 'dcc-ledger'); ?>
                                </option>
                            </select>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <h3 class="dccl-h3"><?php esc_html_e('Vrbo Listing Numbers', 'dcc-ledger'); ?></h3>
    <p class="dccl-note">
        <?php esc_html_e('The payout file\'s "Property ID" is the same number as the reservations file\'s "Listing Number". There is no Vrbo listing for Cottage 33.', 'dcc-ledger'); ?>
    </p>
    <div class="dccl-table-wrap">
        <table class="dccl-table">
            <caption><?php esc_html_e('Which cottage each Vrbo listing belongs to.', 'dcc-ledger'); ?></caption>
            <thead>
                <tr>
                    <th scope="col"><?php esc_html_e('Listing Number', 'dcc-ledger'); ?></th>
                    <th scope="col"><?php esc_html_e('Cottage', 'dcc-ledger'); ?></th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($vrbo as $id => $cottage) : ?>
                    <tr>
                        <th scope="row" class="dccl-code"><?php echo esc_html((string) $id); ?></th>
                        <td>
                            <label class="screen-reader-text" for="vr-<?php echo esc_attr((string) $id); ?>">
                                <?php esc_html_e('Cottage', 'dcc-ledger'); ?>
                            </label>
                            <select id="vr-<?php echo esc_attr((string) $id); ?>" name="map[vrbo][<?php echo esc_attr((string) $id); ?>]">
                                <?php foreach (Cottages::COTTAGES as $option) : ?>
                                    <option value="<?php echo esc_attr($option); ?>" <?php selected($cottage, $option); ?>>
                                        <?php echo esc_html(Cottages::label($option)); ?>
                                    </option>
                                <?php endforeach; ?>
                                <option value="<?php echo esc_attr(Cottages::EXCLUDED); ?>" <?php selected($cottage, Cottages::EXCLUDED); ?>>
                                    <?php esc_html_e('Crofty Bear — Excluded', 'dcc-ledger'); ?>
                                </option>
                            </select>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <h3 class="dccl-h3"><?php esc_html_e('Airbnb', 'dcc-ledger'); ?></h3>
    <p class="dccl-note">
        <?php esc_html_e('Airbnb\'s exports carry no listing id, so the cottage is read from the listing title — "Cottage 31: …" or the older "Dora Canal Court Cottage 31". Any listing naming Crofty Bear is excluded.', 'dcc-ledger'); ?>
    </p>

    <h3 class="dccl-h3"><?php esc_html_e('Uninstalling', 'dcc-ledger'); ?></h3>
    <label class="dccl-inline dccl-danger-zone">
        <input type="checkbox" name="delete_on_uninstall" value="1" <?php checked(Settings::delete_data_on_uninstall()); ?>>
        <span><?php esc_html_e('Delete All Ledger Data When The Plugin Is Deleted', 'dcc-ledger'); ?></span>
    </label>
    <p class="dccl-note">
        <?php esc_html_e('Off by default. Deactivating the plugin never removes anything. This is years of money history — once deleted it can only come back from a backup or a fresh import of every export.', 'dcc-ledger'); ?>
    </p>

    <p class="dccl-actions">
        <button type="submit" class="button button-primary"><?php esc_html_e('Save Settings', 'dcc-ledger'); ?></button>
    </p>
</form>
