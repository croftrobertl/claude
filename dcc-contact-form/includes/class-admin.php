<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Admin UI: a top-level "DCC Contact Form" menu with a Submissions list
 * (view + single/bulk delete) and a site-wide Settings page (reCAPTCHA keys,
 * threshold, min submit time, prohibited-words list).
 */
final class Admin
{
    private const CAP        = 'manage_options';
    private const MENU_SLUG  = 'dcc-contact-form';
    private const SET_SLUG   = 'dcc-contact-settings';
    private const PER_PAGE   = 30;

    public static function init(): void
    {
        add_action('admin_menu', [self::class, 'register_menus']);
        add_action('admin_init', [self::class, 'register_settings']);
        add_action('admin_init', [self::class, 'maybe_handle_actions']);
    }

    public static function register_menus(): void
    {
        add_menu_page(
            __('DCC Contact Form', 'dcc-contact-form'),
            __('DCC Contact Form', 'dcc-contact-form'),
            self::CAP,
            self::MENU_SLUG,
            [self::class, 'render_submissions'],
            'dashicons-email-alt',
            26
        );

        add_submenu_page(
            self::MENU_SLUG,
            __('Submissions', 'dcc-contact-form'),
            __('Submissions', 'dcc-contact-form'),
            self::CAP,
            self::MENU_SLUG,
            [self::class, 'render_submissions']
        );

        add_submenu_page(
            self::MENU_SLUG,
            __('Settings', 'dcc-contact-form'),
            __('Settings', 'dcc-contact-form'),
            self::CAP,
            self::SET_SLUG,
            [self::class, 'render_settings']
        );
    }

    /* ------------------------------------------------------------------ */
    /* Settings                                                            */
    /* ------------------------------------------------------------------ */

    public static function register_settings(): void
    {
        register_setting('dcc_contact_settings_group', Settings::OPTION, [
            'type'              => 'array',
            'sanitize_callback' => ['\\DCC_Contact\\Settings', 'sanitize'],
            'default'           => Settings::defaults(),
        ]);
    }

    public static function render_settings(): void
    {
        if (!current_user_can(self::CAP)) {
            return;
        }
        $s = Settings::all();
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('DCC Contact Form — Settings', 'dcc-contact-form'); ?></h1>
            <p><?php esc_html_e('These settings apply site-wide to every DCC Contact Form. The reCAPTCHA secret key is stored here (not in the Elementor panel) because it is sensitive.', 'dcc-contact-form'); ?></p>
            <form method="post" action="options.php">
                <?php settings_fields('dcc_contact_settings_group'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="dcc-site-key"><?php esc_html_e('reCAPTCHA v3 Site Key', 'dcc-contact-form'); ?></label></th>
                        <td><input name="<?php echo esc_attr(Settings::OPTION); ?>[recaptcha_site_key]" id="dcc-site-key" type="text" class="regular-text" value="<?php echo esc_attr($s['recaptcha_site_key']); ?>" autocomplete="off"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="dcc-secret-key"><?php esc_html_e('reCAPTCHA v3 Secret Key', 'dcc-contact-form'); ?></label></th>
                        <td>
                            <input name="<?php echo esc_attr(Settings::OPTION); ?>[recaptcha_secret_key]" id="dcc-secret-key" type="text" class="regular-text" value="<?php echo esc_attr($s['recaptcha_secret_key']); ?>" autocomplete="off">
                            <p class="description"><?php esc_html_e('Leave both keys blank to disable reCAPTCHA. The form still works — honeypot, time-trap and keyword filtering stay active.', 'dcc-contact-form'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="dcc-threshold"><?php esc_html_e('reCAPTCHA Score Threshold', 'dcc-contact-form'); ?></label></th>
                        <td>
                            <input name="<?php echo esc_attr(Settings::OPTION); ?>[recaptcha_threshold]" id="dcc-threshold" type="number" step="0.1" min="0" max="1" value="<?php echo esc_attr((string) $s['recaptcha_threshold']); ?>" class="small-text">
                            <p class="description"><?php esc_html_e('0.0 – 1.0. Submissions scoring below this are rejected. Default 0.4.', 'dcc-contact-form'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="dcc-min-time"><?php esc_html_e('Minimum Submit Time (seconds)', 'dcc-contact-form'); ?></label></th>
                        <td>
                            <input name="<?php echo esc_attr(Settings::OPTION); ?>[min_submit_time]" id="dcc-min-time" type="number" step="1" min="0" value="<?php echo esc_attr((string) $s['min_submit_time']); ?>" class="small-text">
                            <p class="description"><?php esc_html_e('Reject submissions completed faster than this. Default 2.', 'dcc-contact-form'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="dcc-keywords"><?php esc_html_e('Prohibited Words', 'dcc-contact-form'); ?></label></th>
                        <td>
                            <textarea name="<?php echo esc_attr(Settings::OPTION); ?>[keyword_filter]" id="dcc-keywords" rows="6" class="large-text" placeholder="<?php esc_attr_e('One word or phrase per line', 'dcc-contact-form'); ?>"><?php echo esc_textarea($s['keyword_filter']); ?></textarea>
                            <p class="description"><?php esc_html_e('One prohibited word or phrase per line (or comma-separated). Matching is case-insensitive. Empty by default.', 'dcc-contact-form'); ?></p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    /* ------------------------------------------------------------------ */
    /* Submissions — action handling                                       */
    /* ------------------------------------------------------------------ */

    public static function maybe_handle_actions(): void
    {
        if (!isset($_REQUEST['page']) || $_REQUEST['page'] !== self::MENU_SLUG) {
            return;
        }
        if (!current_user_can(self::CAP)) {
            return;
        }

        // Single delete (GET link).
        if (isset($_GET['action'], $_GET['id']) && $_GET['action'] === 'delete') {
            $id = (int) $_GET['id'];
            check_admin_referer('dcc_delete_' . $id);
            Entries::delete($id);
            self::redirect_with_notice('deleted');
        }

        // Bulk delete (POST).
        if (isset($_POST['dcc_bulk_action']) && $_POST['dcc_bulk_action'] === 'delete') {
            check_admin_referer('dcc_bulk');
            $ids = isset($_POST['entry']) && is_array($_POST['entry'])
                ? array_map('intval', (array) wp_unslash($_POST['entry']))
                : [];
            $n = Entries::delete_many($ids);
            self::redirect_with_notice('deleted', $n);
        }
    }

    private static function redirect_with_notice(string $notice, int $count = 1): void
    {
        $url = add_query_arg(
            ['page' => self::MENU_SLUG, 'dcc_notice' => $notice, 'dcc_count' => $count],
            admin_url('admin.php')
        );
        wp_safe_redirect($url);
        exit;
    }

    /* ------------------------------------------------------------------ */
    /* Submissions — rendering                                             */
    /* ------------------------------------------------------------------ */

    public static function render_submissions(): void
    {
        if (!current_user_can(self::CAP)) {
            return;
        }

        // Single-entry view.
        if (isset($_GET['action'], $_GET['id']) && $_GET['action'] === 'view') {
            self::render_single((int) $_GET['id']);
            return;
        }

        Entries::maybe_install();

        if (isset($_GET['dcc_notice']) && $_GET['dcc_notice'] === 'deleted') {
            $count = isset($_GET['dcc_count']) ? (int) $_GET['dcc_count'] : 1;
            printf(
                '<div class="notice notice-success is-dismissible"><p>%s</p></div>',
                esc_html(sprintf(
                    /* translators: %d: number of deleted submissions */
                    _n('%d submission deleted.', '%d submissions deleted.', $count, 'dcc-contact-form'),
                    $count
                ))
            );
        }

        $paged   = isset($_GET['paged']) ? max(1, (int) $_GET['paged']) : 1;
        $total   = Entries::count();
        $offset  = ($paged - 1) * self::PER_PAGE;
        $rows    = Entries::get_page(self::PER_PAGE, $offset);
        $pages   = (int) ceil($total / self::PER_PAGE);
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('DCC Contact Form — Submissions', 'dcc-contact-form'); ?></h1>
            <?php if ($total === 0) : ?>
                <p><?php esc_html_e('No submissions yet.', 'dcc-contact-form'); ?></p>
            <?php else : ?>
                <form method="post">
                    <?php wp_nonce_field('dcc_bulk'); ?>
                    <div class="tablenav top">
                        <div class="alignleft actions bulkactions">
                            <select name="dcc_bulk_action">
                                <option value=""><?php esc_html_e('Bulk actions', 'dcc-contact-form'); ?></option>
                                <option value="delete"><?php esc_html_e('Delete', 'dcc-contact-form'); ?></option>
                            </select>
                            <?php submit_button(__('Apply', 'dcc-contact-form'), 'action', '', false); ?>
                        </div>
                        <span class="displaying-num"><?php echo esc_html(sprintf(_n('%d item', '%d items', $total, 'dcc-contact-form'), $total)); ?></span>
                    </div>
                    <table class="wp-list-table widefat fixed striped">
                        <thead>
                            <tr>
                                <td class="manage-column column-cb check-column"><input type="checkbox" onclick="var c=this.checked,b=this.closest('table').querySelectorAll('input[name=\'entry[]\']');for(var i=0;i<b.length;i++)b[i].checked=c;"></td>
                                <th scope="col"><?php esc_html_e('ID', 'dcc-contact-form'); ?></th>
                                <th scope="col"><?php esc_html_e('Date', 'dcc-contact-form'); ?></th>
                                <th scope="col"><?php esc_html_e('Summary', 'dcc-contact-form'); ?></th>
                                <th scope="col"><?php esc_html_e('Status', 'dcc-contact-form'); ?></th>
                                <th scope="col"><?php esc_html_e('Actions', 'dcc-contact-form'); ?></th>
                            </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($rows as $row) :
                            $view_url   = add_query_arg(['page' => self::MENU_SLUG, 'action' => 'view', 'id' => (int) $row->id], admin_url('admin.php'));
                            $delete_url = wp_nonce_url(
                                add_query_arg(['page' => self::MENU_SLUG, 'action' => 'delete', 'id' => (int) $row->id], admin_url('admin.php')),
                                'dcc_delete_' . (int) $row->id
                            );
                            ?>
                            <tr>
                                <th scope="row" class="check-column"><input type="checkbox" name="entry[]" value="<?php echo esc_attr((string) $row->id); ?>"></th>
                                <td><?php echo esc_html((string) $row->id); ?></td>
                                <td><?php echo esc_html(self::format_date($row->created_at)); ?></td>
                                <td>
                                    <a href="<?php echo esc_url($view_url); ?>"><strong><?php echo esc_html(self::summary($row)); ?></strong></a>
                                </td>
                                <td><?php echo wp_kses_post(self::status_badge((string) $row->spam_result)); ?></td>
                                <td>
                                    <a href="<?php echo esc_url($view_url); ?>"><?php esc_html_e('View', 'dcc-contact-form'); ?></a>
                                    &nbsp;|&nbsp;
                                    <a href="<?php echo esc_url($delete_url); ?>" class="submitdelete" onclick="return confirm('<?php echo esc_js(__('Delete this submission?', 'dcc-contact-form')); ?>');"><?php esc_html_e('Delete', 'dcc-contact-form'); ?></a>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </form>
                <?php if ($pages > 1) :
                    $base = add_query_arg(['page' => self::MENU_SLUG, 'paged' => '%#%'], admin_url('admin.php'));
                    echo '<div class="tablenav bottom"><div class="tablenav-pages">';
                    echo wp_kses_post(paginate_links([
                        'base'    => $base,
                        'format'  => '',
                        'current' => $paged,
                        'total'   => $pages,
                    ]));
                    echo '</div></div>';
                endif; ?>
            <?php endif; ?>
        </div>
        <?php
    }

    private static function render_single(int $id): void
    {
        $row = Entries::get($id);
        $back = add_query_arg(['page' => self::MENU_SLUG], admin_url('admin.php'));
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('Submission', 'dcc-contact-form'); ?> #<?php echo esc_html((string) $id); ?></h1>
            <p><a href="<?php echo esc_url($back); ?>">&larr; <?php esc_html_e('Back to submissions', 'dcc-contact-form'); ?></a></p>
            <?php if (!$row) : ?>
                <p><?php esc_html_e('Submission not found.', 'dcc-contact-form'); ?></p>
            <?php else :
                $fields = Entries::decode_fields($row->fields); ?>
                <table class="widefat striped" style="max-width:720px;">
                    <tbody>
                        <tr><th style="width:180px;"><?php esc_html_e('Date', 'dcc-contact-form'); ?></th><td><?php echo esc_html(self::format_date($row->created_at)); ?></td></tr>
                        <tr><th><?php esc_html_e('Status', 'dcc-contact-form'); ?></th><td><?php echo wp_kses_post(self::status_badge((string) $row->spam_result)); ?></td></tr>
                        <tr><th><?php esc_html_e('Subject', 'dcc-contact-form'); ?></th><td><?php echo esc_html((string) $row->subject); ?></td></tr>
                        <?php foreach ($fields as $f) : ?>
                            <tr>
                                <th><?php echo esc_html($f['label']); ?></th>
                                <td><?php echo nl2br(esc_html($f['value'])); ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
                <p style="margin-top:16px;">
                    <?php $delete_url = wp_nonce_url(
                        add_query_arg(['page' => self::MENU_SLUG, 'action' => 'delete', 'id' => $id], admin_url('admin.php')),
                        'dcc_delete_' . $id
                    ); ?>
                    <a href="<?php echo esc_url($delete_url); ?>" class="button button-secondary" onclick="return confirm('<?php echo esc_js(__('Delete this submission?', 'dcc-contact-form')); ?>');"><?php esc_html_e('Delete', 'dcc-contact-form'); ?></a>
                </p>
            <?php endif; ?>
        </div>
        <?php
    }

    private static function format_date($mysql): string
    {
        $ts = strtotime((string) $mysql);
        if (!$ts) {
            return (string) $mysql;
        }
        return wp_date(get_option('date_format') . ' ' . get_option('time_format'), $ts);
    }

    private static function summary(object $row): string
    {
        $fields = Entries::decode_fields($row->fields);
        $bits = [];
        foreach ($fields as $f) {
            $val = trim($f['value']);
            if ($val !== '') {
                $bits[] = $val;
            }
            if (count($bits) >= 2) {
                break;
            }
        }
        $text = implode(' — ', $bits);
        if ($text === '') {
            $text = __('(no content)', 'dcc-contact-form');
        }
        return mb_strimwidth($text, 0, 70, '…');
    }

    private static function status_badge(string $result): string
    {
        if ($result === 'ham' || $result === '') {
            return '<span style="color:#1a7f37;font-weight:600;">' . esc_html__('Received', 'dcc-contact-form') . '</span>';
        }
        $type = str_replace('spam:', '', $result);
        return '<span style="color:#b32d2e;font-weight:600;">' . esc_html(sprintf(
            /* translators: %s: spam layer that flagged the submission */
            __('Spam (%s)', 'dcc-contact-form'),
            $type
        )) . '</span>';
    }
}
