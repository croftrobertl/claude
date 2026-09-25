<?php
namespace DCC_Contact;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Admin UI. Both screens live under the shared top-level "DCC" menu that every
 * DCC plugin registers into: a Settings page (reCAPTCHA keys, threshold, min
 * submit time, prohibited-words list) and a Submissions list (view + single/bulk
 * delete).
 */
final class Admin
{
    private const CAP = 'manage_options';

    /**
     * Shared top-level "DCC" menu, created by the dcc-menu.php mu-plugin. This
     * plugin only ATTACHES to it; a divergent slug here would silently create a
     * second "DCC" menu, so do not change it in isolation.
     */
    private const PARENT_SLUG = 'dcc';

    /**
     * Submissions page slug. Unchanged from when this was the plugin's own
     * top-level menu: only the parent moved, so `admin.php?page=dcc-contact-form`
     * still resolves and every saved bookmark keeps working.
     */
    private const SUB_SLUG = 'dcc-contact-form';

    /** Settings page slug — likewise unchanged. */
    private const SET_SLUG = 'dcc-contact-settings';

    private const PER_PAGE = 30;

    /**
     * Hook suffixes returned by add_submenu_page(). A submenu's screen ID is
     * derived from its parent, so it changes whenever the parent does; anything
     * needing to match this screen must compare against these values rather
     * than a hard-coded "toplevel_page_…" / "settings_page_…" string.
     */
    private static string $settings_hook = '';
    private static string $submissions_hook = '';

    public static function init(): void
    {
        // 20: this plugin's assigned slot in the DCC menu order.
        //
        // The shared `dcc` parent is NOT registered here. The site-side
        // dcc-menu.php mu-plugin owns it — it creates the parent at priority 5
        // and removes WordPress's mirrored duplicate at 999. Registering it
        // here as well is what produced competing parent registrations across
        // plugins; this plugin now only attaches to it.
        add_action('admin_menu', [self::class, 'register_menus'], 20);

        add_action('admin_init', [self::class, 'register_settings']);
        add_action('admin_init', [self::class, 'maybe_handle_actions']);
    }

    /**
     * Both real pages attach directly to the shared parent — WordPress supports
     * only two menu levels, so the plugin's former top-level menu cannot survive
     * as an intermediate group and is gone entirely.
     *
     * Menu labels drop the "DCC" prefix: inside a menu already called DCC,
     * "DCC → DCC Contact Form" stutters. Page titles stay fully qualified.
     */
    public static function register_menus(): void
    {
        self::$settings_hook = (string) add_submenu_page(
            self::PARENT_SLUG,
            __('DCC Contact Form — Settings', 'dcc-contact-form'),
            __('Contact Form', 'dcc-contact-form'),
            self::CAP,
            self::SET_SLUG,
            [self::class, 'render_settings']
        );

        self::$submissions_hook = (string) add_submenu_page(
            self::PARENT_SLUG,
            __('DCC Contact Form — Submissions', 'dcc-contact-form'),
            __('Form Submissions', 'dcc-contact-form'),
            self::CAP,
            self::SUB_SLUG,
            [self::class, 'render_submissions']
        );
    }

    /**
     * The screen IDs of this plugin's two admin pages, as WordPress actually
     * assigned them. Use this for `get_current_screen()->id` comparisons and
     * conditional asset enqueues — never a hard-coded screen string, which
     * silently stops matching the moment the parent menu changes.
     *
     * @return array{settings:string,submissions:string}
     */
    public static function screen_ids(): array
    {
        return [
            'settings'    => self::$settings_hook,
            'submissions' => self::$submissions_hook,
        ];
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

    /** Text/email/number input bound to one schema key. */
    private static function field_text(string $key, array $s, string $type = 'text', string $desc = ''): void
    {
        $id = 'dcc-' . str_replace('_', '-', $key);
        printf(
            '<input type="%s" id="%s" name="%s[%s]" value="%s" class="regular-text" autocomplete="off">',
            esc_attr($type),
            esc_attr($id),
            esc_attr(Settings::OPTION),
            esc_attr($key),
            esc_attr((string) ($s[$key] ?? ''))
        );
        if ($desc !== '') {
            echo '<p class="description">' . esc_html($desc) . '</p>';
        }
    }

    /**
     * Checkbox bound to one schema key. The paired hidden field is deliberate:
     * it makes "unchecked" arrive as an explicit 0 rather than as nothing at
     * all, which is belt-and-braces alongside Settings::sanitize() treating an
     * absent boolean as false.
     */
    private static function field_bool(string $key, array $s, string $label, string $desc = ''): void
    {
        $id = 'dcc-' . str_replace('_', '-', $key);
        printf('<input type="hidden" name="%s[%s]" value="0">', esc_attr(Settings::OPTION), esc_attr($key));
        printf(
            '<label for="%s"><input type="checkbox" id="%s" name="%s[%s]" value="1"%s> %s</label>',
            esc_attr($id),
            esc_attr($id),
            esc_attr(Settings::OPTION),
            esc_attr($key),
            checked(!empty($s[$key]), true, false),
            esc_html($label)
        );
        if ($desc !== '') {
            echo '<p class="description">' . esc_html($desc) . '</p>';
        }
    }

    private static function field_textarea(string $key, array $s, int $rows = 4, string $desc = ''): void
    {
        $id = 'dcc-' . str_replace('_', '-', $key);
        printf(
            '<textarea id="%s" name="%s[%s]" rows="%d" class="large-text">%s</textarea>',
            esc_attr($id),
            esc_attr(Settings::OPTION),
            esc_attr($key),
            (int) $rows,
            esc_textarea((string) ($s[$key] ?? ''))
        );
        if ($desc !== '') {
            echo '<p class="description">' . esc_html($desc) . '</p>';
        }
    }

    private static function row(string $label, string $for, callable $field): void
    {
        echo '<tr><th scope="row"><label for="' . esc_attr($for) . '">' . esc_html($label) . '</label></th><td>';
        $field();
        echo '</td></tr>';
    }

    public static function render_settings(): void
    {
        if (!current_user_can(self::CAP)) {
            wp_die(esc_html__('You do not have permission to access this page.', 'dcc-contact-form'));
        }

        $s = Settings::all();
        $o = Settings::OPTION;
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('DCC Contact Form — Settings', 'dcc-contact-form'); ?></h1>
            <?php
            // WordPress only auto-prints "Settings saved." on options-*.php
            // screens; this page lives under admin.php, so without this call
            // saving gives no confirmation at all.
            settings_errors();
            ?>
            <p><?php esc_html_e('These are the defaults every contact form inherits. An Elementor widget can override any of them for one placement; a control left alone here is what that widget falls back to.', 'dcc-contact-form'); ?></p>

            <form method="post" action="options.php">
                <?php settings_fields('dcc_contact_settings_group'); ?>

                <h2><?php esc_html_e('Messages and replies', 'dcc-contact-form'); ?></h2>
                <table class="form-table" role="presentation">
                    <?php
                    self::row(__('Send enquiries to', 'dcc-contact-form'), 'dcc-notify-to', function () use ($s) {
                        self::field_text('notify_to', $s, 'email', __('Where submitted forms are emailed.', 'dcc-contact-form'));
                    });
                    self::row(__('Email subject', 'dcc-contact-form'), 'dcc-notify-subject', function () use ($s) {
                        self::field_text('notify_subject', $s, 'text', __('Use {Field Label} to insert a value, e.g. {Name}.', 'dcc-contact-form'));
                    });
                    self::row(__('Confirmation message', 'dcc-contact-form'), 'dcc-confirmation-message', function () use ($s) {
                        self::field_textarea('confirmation_message', $s, 3, __('Shown in place of the form after a successful submission.', 'dcc-contact-form'));
                    });
                    self::row(__('Button text', 'dcc-contact-form'), 'dcc-submit-text', function () use ($s) {
                        self::field_text('submit_text', $s);
                    });
                    self::row(__('Button text while sending', 'dcc-contact-form'), 'dcc-submit-processing', function () use ($s) {
                        self::field_text('submit_processing', $s);
                    });
                    self::row(__('Copy to sender', 'dcc-contact-form'), 'dcc-copy-to-sender', function () use ($s) {
                        self::field_bool('copy_to_sender', $s, __('Offer visitors a "send me a copy" checkbox', 'dcc-contact-form'), __('Off by default. The copy goes only to the address typed into the form, and only after every spam layer passes.', 'dcc-contact-form'));
                        echo '<p style="margin-top:8px;">';
                        self::field_text('copy_label', $s, 'text', __('The checkbox label visitors see.', 'dcc-contact-form'));
                        echo '</p>';
                    });
                    ?>
                </table>

                <details style="margin:24px 0 8px;">
                    <summary style="cursor:pointer;font-size:1.1em;font-weight:600;padding:6px 0;">
                        <?php esc_html_e('Advanced — deliverability and spam', 'dcc-contact-form'); ?>
                    </summary>

                    <h2><?php esc_html_e('Deliverability', 'dcc-contact-form'); ?></h2>
                    <p class="description" style="max-width:46em;">
                        <?php esc_html_e('The site publishes a strict DMARC policy, so only a sender on the site\'s own domain is delivered. An off-domain From address is forced back to the site domain. The visitor\'s address always goes in Reply-To, never in From.', 'dcc-contact-form'); ?>
                    </p>
                    <table class="form-table" role="presentation">
                        <?php
                        self::row(__('From address', 'dcc-contact-form'), 'dcc-from-email', function () use ($s) {
                            self::field_text('from_email', $s, 'email', __('Must be on the site domain.', 'dcc-contact-form'));
                        });
                        self::row(__('From name', 'dcc-contact-form'), 'dcc-from-name', function () use ($s) {
                            self::field_text('from_name', $s, 'text', __('Leave blank to use the site title.', 'dcc-contact-form'));
                        });
                        self::row(__('Reply-To', 'dcc-contact-form'), 'dcc-reply-to', function () use ($s) {
                            self::field_text('reply_to', $s, 'text', __('{email} inserts the address the visitor entered.', 'dcc-contact-form'));
                        });
                        ?>
                    </table>

                    <h2><?php esc_html_e('Spam protection', 'dcc-contact-form'); ?></h2>
                    <table class="form-table" role="presentation">
                        <?php
                        self::row(__('Layers', 'dcc-contact-form'), 'dcc-spam-honeypot', function () use ($s) {
                            self::field_bool('spam_honeypot', $s, __('Honeypot (hidden decoy field)', 'dcc-contact-form'));
                            echo '<br>';
                            self::field_bool('spam_time_trap', $s, __('Time trap (reject very fast submissions)', 'dcc-contact-form'));
                            echo '<br>';
                            self::field_bool('spam_keyword_filter', $s, __('Prohibited-words filter', 'dcc-contact-form'));
                            echo '<br>';
                            self::field_bool('spam_recaptcha', $s, __('Google reCAPTCHA v3', 'dcc-contact-form'));
                        });
                        self::row(__('reCAPTCHA site key', 'dcc-contact-form'), 'dcc-recaptcha-site-key', function () use ($s) {
                            self::field_text('recaptcha_site_key', $s);
                        });
                        self::row(__('reCAPTCHA secret key', 'dcc-contact-form'), 'dcc-recaptcha-secret-key', function () use ($s) {
                            self::field_text('recaptcha_secret_key', $s, 'text', __('Leave both keys blank to disable reCAPTCHA; the other three layers stay active.', 'dcc-contact-form'));
                        });
                        self::row(__('Score threshold', 'dcc-contact-form'), 'dcc-recaptcha-threshold', function () use ($s, $o) {
                            printf(
                                '<input type="number" step="0.1" min="0" max="1" id="dcc-recaptcha-threshold" name="%s[recaptcha_threshold]" value="%s" class="small-text">',
                                esc_attr($o),
                                esc_attr((string) $s['recaptcha_threshold'])
                            );
                            echo '<p class="description">' . esc_html__('0.0 – 1.0. Submissions scoring below this are rejected. Default 0.4.', 'dcc-contact-form') . '</p>';
                        });
                        self::row(__('Minimum submit time', 'dcc-contact-form'), 'dcc-min-submit-time', function () use ($s, $o) {
                            printf(
                                '<input type="number" step="1" min="0" id="dcc-min-submit-time" name="%s[min_submit_time]" value="%s" class="small-text"> %s',
                                esc_attr($o),
                                esc_attr((string) $s['min_submit_time']),
                                esc_html__('seconds', 'dcc-contact-form')
                            );
                        });
                        self::row(__('Prohibited words', 'dcc-contact-form'), 'dcc-keyword-filter', function () use ($s) {
                            self::field_textarea('keyword_filter', $s, 6);
                            echo '<p class="description">'
                                . esc_html__('One word or phrase per line. A single word matches only as a whole word, so "ass" will not block "class" — add plurals and variants as separate entries. A multi-word phrase matches anywhere.', 'dcc-contact-form')
                                . '</p>';
                        });
                        ?>
                    </table>
                </details>

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
        if (!isset($_REQUEST['page']) || $_REQUEST['page'] !== self::SUB_SLUG) {
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
        $args = ['page' => self::SUB_SLUG, 'dcc_notice' => $notice, 'dcc_count' => $count];

        // Stay on the page of the list the action was fired from, rather than
        // bouncing back to page 1 after every delete.
        $paged = isset($_REQUEST['paged']) ? max(1, (int) $_REQUEST['paged']) : 1;
        if ($paged > 1) {
            $args['paged'] = $paged;
        }

        wp_safe_redirect(add_query_arg($args, admin_url('admin.php')));
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
                            $view_url   = add_query_arg(['page' => self::SUB_SLUG, 'action' => 'view', 'id' => (int) $row->id], admin_url('admin.php'));
                            $delete_url = wp_nonce_url(
                                add_query_arg(['page' => self::SUB_SLUG, 'action' => 'delete', 'id' => (int) $row->id], admin_url('admin.php')),
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
                    $base = add_query_arg(['page' => self::SUB_SLUG, 'paged' => '%#%'], admin_url('admin.php'));
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
        $back = add_query_arg(['page' => self::SUB_SLUG], admin_url('admin.php'));
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
                        add_query_arg(['page' => self::SUB_SLUG, 'action' => 'delete', 'id' => $id], admin_url('admin.php')),
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
        if ($result === Entries::STATUS_OK || $result === '') {
            return '<span style="color:#1a7f37;font-weight:600;">' . esc_html__('Received', 'dcc-contact-form') . '</span>';
        }
        if ($result === Entries::STATUS_MAIL_FAILED) {
            return '<span style="color:#b26200;font-weight:600;" title="'
                . esc_attr__('The submission was stored, but the notification email could not be sent. Check the site\'s mail configuration.', 'dcc-contact-form')
                . '">' . esc_html__('Received — email failed', 'dcc-contact-form') . '</span>';
        }
        $type = str_replace('spam:', '', $result);
        return '<span style="color:#b32d2e;font-weight:600;">' . esc_html(sprintf(
            /* translators: %s: spam layer that flagged the submission */
            __('Spam (%s)', 'dcc-contact-form'),
            $type
        )) . '</span>';
    }
}
