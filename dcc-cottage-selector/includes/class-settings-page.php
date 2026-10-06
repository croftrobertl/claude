<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The DCC > Cottage Selector settings screen.
 *
 * Security shape, all four non-negotiable:
 *   - capability checked on RENDER and again on SAVE (the menu cap is not a save
 *     guard: admin-post.php is reachable directly);
 *   - nonce on the form, verified before anything is written;
 *   - sanitise on the way in (Settings::sanitize), escape on the way out — a
 *     stored option is never printed raw, however it got there;
 *   - POST goes to admin-post.php and redirects back (PRG), so a refresh cannot
 *     resubmit.
 *
 * WHERE THE REDIRECT GOES (0.52.0). admin-post.php never fires admin_menu, so
 * nothing about the menu is known there: $GLOBALS['admin_page_hooks'] is empty
 * whether or not the shared `dcc` parent exists. Until 0.51.0 the redirect asked
 * that global which parent the page lives under, always got "none", and sent
 * every save to options-general.php?page=… — which WordPress refuses with "Sorry,
 * you are not allowed to access this page." while the page is registered under
 * `dcc`. The settings saved; the landing page did not load. The redirect now goes
 * back to the page the form was submitted from (the referer, accepted only when it
 * is this site's admin.php or options-general.php with page=dcc-cottage-selector),
 * else to admin.php?page=dcc-cottage-selector, which WordPress resolves under
 * whichever parent the page was registered with. Nothing here may read menu
 * globals again: on this request they are always empty.
 *
 * Only native form controls are used: every field is keyboard reachable and
 * carries a real <label for>, the mode checkboxes sit in a fieldset with a
 * legend, and nothing overrides the browser's focus ring.
 */
final class Settings_Page
{
    public const ACTION = 'dccs_save_settings';
    public const NONCE  = 'dccs_settings_nonce';

    /** Query args the post-save redirect carries back to the page. */
    public const ARG_SAVED  = 'dccs-saved';
    public const ARG_SCROLL = 'dccs-scroll';
    public const ARG_ADV    = 'dccs-adv';

    /** The only admin files the page can be reached at: under `dcc`, or under Settings. */
    private const RETURN_FILES = ['admin.php', 'options-general.php'];

    /** Hook suffix from add_submenu_page(); set by Menu::register_page(). */
    public static string $hook = '';

    public static function init(): void
    {
        add_action('admin_post_' . self::ACTION, [self::class, 'handle_save']);
        add_action('admin_enqueue_scripts', [self::class, 'enqueue']);
        // WordPress strips these from the address bar once the page has loaded
        // (as it does its own settings-updated), so a refresh does not repeat the
        // notice or the scroll jump.
        add_filter('removable_query_args', [self::class, 'removable_query_args']);
    }

    /**
     * @param string[] $args
     * @return string[]
     */
    public static function removable_query_args($args): array
    {
        $args = is_array($args) ? $args : [];
        return array_merge($args, [self::ARG_SAVED, self::ARG_SCROLL, self::ARG_ADV]);
    }

    /** The page's own script: scroll/Advanced restore after a save, and the unsaved-changes prompt. */
    public static function enqueue($hook_suffix): void
    {
        if (self::$hook === '' || $hook_suffix !== self::$hook) {
            return;
        }
        wp_enqueue_script('dccs-settings-page', DCCS_URL . 'assets/js/settings-page.js', [], DCCS_VERSION, true);
    }

    /** Save handler. Re-checks capability: this endpoint is directly reachable. */
    public static function handle_save(): void
    {
        if (!current_user_can(Menu::CAP)) {
            wp_die(esc_html__('You do not have permission to change these settings.', 'dcc-cottage-selector'), '', ['response' => 403]);
        }
        check_admin_referer(self::ACTION, self::NONCE);

        $clean = Settings::sanitize(wp_unslash($_POST));
        update_option(Settings::OPTION, $clean, false);

        $state = self::view_state(wp_unslash($_POST), 'dccs_scroll', 'dccs_adv');
        wp_safe_redirect(self::return_url(wp_get_referer(), [self::ARG_SAVED => '1'] + $state));
        exit;
    }

    /**
     * Where a save lands: the page it was submitted from, rebuilt from scratch.
     * Only the FILE is taken from the referer, and only when it is one of this
     * site's two admin files AND the referer names this page; every query arg is
     * built here, so nothing from the referer (an old dccs-saved, anything else)
     * is carried over. Any other referer, or none, falls back to admin.php, which
     * reaches the page under either parent.
     *
     * @param mixed $referer What wp_get_referer() returned (string or false).
     * @param array<string,string> $args
     */
    public static function return_url($referer, array $args): string
    {
        $file = self::referer_file($referer) ?? 'admin.php';
        return add_query_arg(['page' => Menu::SLUG] + $args, admin_url($file));
    }

    /** @param mixed $referer */
    private static function referer_file($referer): ?string
    {
        if (!is_string($referer) || $referer === '') {
            return null;
        }
        $ref   = wp_parse_url($referer);
        $admin = wp_parse_url(admin_url());
        if (!is_array($ref) || !is_array($admin) || !isset($ref['path'])) {
            return null;
        }
        // wp_get_referer() already rejects foreign hosts; checked again so this
        // method is safe whatever it is handed.
        if (isset($ref['host']) && strtolower((string) $ref['host']) !== strtolower((string) ($admin['host'] ?? ''))) {
            return null;
        }
        $admin_path = (string) ($admin['path'] ?? '/wp-admin/');
        $file = null;
        foreach (self::RETURN_FILES as $candidate) {
            if ($ref['path'] === $admin_path . $candidate) {
                $file = $candidate;
                break;
            }
        }
        if ($file === null) {
            return null;
        }
        parse_str((string) ($ref['query'] ?? ''), $query);
        return (isset($query['page']) && $query['page'] === Menu::SLUG) ? $file : null;
    }

    /**
     * Where the user was on the page when they saved, so the reload can put them
     * back. The scroll value is his offset from the top of the
     * FORM, not of the document, so the "Settings saved." notice that appears above
     * the form after the save does not shift what he sees. Integers only, bounded;
     * anything else is dropped rather than coerced.
     *
     * @param mixed $src
     * @return array<string,string>
     */
    private static function view_state($src, string $scroll_key, string $adv_key): array
    {
        $src = is_array($src) ? $src : [];
        $out = [];
        $scroll = $src[$scroll_key] ?? null;
        if (is_scalar($scroll) && preg_match('/^-?\d{1,6}$/', (string) $scroll)) {
            $out[self::ARG_SCROLL] = (string) (int) $scroll;
        }
        if (($src[$adv_key] ?? null) === '1') {
            $out[self::ARG_ADV] = '1';
        }
        return $out;
    }

    public static function render(): void
    {
        if (!current_user_can(Menu::CAP)) {
            wp_die(esc_html__('You do not have permission to view these settings.', 'dcc-cottage-selector'), '', ['response' => 403]);
        }

        $s = Settings::get();
        $saved = isset($_GET[self::ARG_SAVED]) && $_GET[self::ARG_SAVED] === '1';

        echo '<div class="wrap">';
        echo '<h1>' . esc_html__('DCC Cottage Selector', 'dcc-cottage-selector') . '</h1>';

        if ($saved) {
            // WordPress's own notice, rendered by core's settings_errors() so it is
            // the exact markup of every other Settings screen. Our own setting slug
            // keeps it from duplicating core's settings-updated notice on the
            // standalone (under Settings) fallback.
            add_settings_error('dccs_settings', 'settings_updated', __('Settings saved.', 'dcc-cottage-selector'), 'success');
            settings_errors('dccs_settings');
        }

        echo '<p class="description">'
            . esc_html__('Site-wide defaults for every Cottage Selector and Mini Entry on the site. An individual widget overrides a default only where its own Elementor control has been deliberately set; clearing that control hands the decision back to this page.', 'dcc-cottage-selector')
            . '</p>';

        // After a save, where to put Rob back (read by assets/js/settings-page.js).
        $restore = '';
        if ($saved) {
            foreach (self::view_state(wp_unslash($_GET), self::ARG_SCROLL, self::ARG_ADV) as $k => $v) {
                $restore .= ' data-' . esc_attr($k) . '="' . esc_attr($v) . '"';
            }
        }
        echo '<form id="dccs-settings-form" method="post" action="' . esc_url(admin_url('admin-post.php')) . '"' . $restore . '>';
        echo '<input type="hidden" name="action" value="' . esc_attr(self::ACTION) . '">';
        // Filled by the page script on submit; empty (and ignored) without it.
        echo '<input type="hidden" name="dccs_scroll" value="">';
        echo '<input type="hidden" name="dccs_adv" value="">';
        wp_nonce_field(self::ACTION, self::NONCE);

        // ---------------- Common ----------------
        echo '<h2>' . esc_html__('Results', 'dcc-cottage-selector') . '</h2>';
        echo '<table class="form-table" role="presentation"><tbody>';
        self::number_row('results_count', __('Cottages to show', 'dcc-cottage-selector'), $s, 1, 8,
            __('How many matches the results screen lists. The highlighted cottage from a deep link is shown in addition to these.', 'dcc-cottage-selector'));
        echo '</tbody></table>';

        echo '<h2>' . esc_html__('Modes', 'dcc-cottage-selector') . '</h2>';
        echo '<table class="form-table" role="presentation"><tbody>';

        echo '<tr><th scope="row">' . esc_html__('Available modes', 'dcc-cottage-selector') . '</th><td>';
        echo '<fieldset><legend class="screen-reader-text">' . esc_html__('Available modes', 'dcc-cottage-selector') . '</legend>';
        foreach (self::mode_labels() as $key => $label) {
            $id = 'dccs-mode-' . $key;
            printf(
                '<label for="%1$s"><input type="checkbox" id="%1$s" name="enabled_modes[]" value="%2$s"%3$s> %4$s</label><br>',
                esc_attr($id),
                esc_attr($key),
                in_array($key, (array) $s['enabled_modes'], true) ? ' checked' : '',
                esc_html($label)
            );
        }
        echo '<p class="description">' . esc_html__('Unticking every mode is not saved — the landing screen would have nothing to offer.', 'dcc-cottage-selector') . '</p>';
        echo '</fieldset></td></tr>';

        echo '<tr><th scope="row"><label for="dccs-start-mode">' . esc_html__('Opening mode', 'dcc-cottage-selector') . '</label></th><td>';
        echo '<select id="dccs-start-mode" name="start_mode">';
        foreach (self::mode_labels() as $key => $label) {
            printf('<option value="%s"%s>%s</option>', esc_attr($key), selected($s['start_mode'], $key, false), esc_html($label));
        }
        echo '</select></td></tr>';

        self::checkbox_row('show_heading', __('Show the heading', 'dcc-cottage-selector'), $s, '');
        self::checkbox_row('show_review', __('Show the review step', 'dcc-cottage-selector'), $s,
            __('An extra screen listing the answers before the matches.', 'dcc-cottage-selector'));
        self::checkbox_row('show_compare_tip', __('Show the “pick 2” tip', 'dcc-cottage-selector'), $s,
            __('Off by default: the Compare subheader already says to pick two or more.', 'dcc-cottage-selector'));
        echo '</tbody></table>';

        echo '<h2>' . esc_html__('Fee links', 'dcc-cottage-selector') . '</h2>';
        echo '<table class="form-table" role="presentation"><tbody>';
        self::url_row('capacity_fee_url', __('Capacity note link', 'dcc-cottage-selector'), $s,
            __('Optional. Leave empty and the note renders as plain text with no link. Fee AMOUNTS never appear in this plugin.', 'dcc-cottage-selector'));
        self::url_row('pet_fee_url', __('Pet note link', 'dcc-cottage-selector'), $s, '');
        echo '</tbody></table>';

        echo '<h2>' . esc_html__('Availability', 'dcc-cottage-selector') . '</h2>';
        echo '<table class="form-table" role="presentation"><tbody>';
        self::checkbox_row('avail_enable', __('Ask for dates and check availability', 'dcc-cottage-selector'), $s,
            __('OFF by default. This is the only runtime request this plugin makes, and it needs the MPHB Availability Calendar plugin active to answer it. A failed lookup never blanks the results.', 'dcc-cottage-selector'));
        echo '</tbody></table>';

        // ---------------- Advanced ----------------
        echo '<details class="dccs-advanced" style="margin-top:1.5em">';
        echo '<summary style="cursor:pointer;font-size:1.3em;font-weight:600;padding:.4em 0">'
            . esc_html__('Advanced', 'dcc-cottage-selector') . '</summary>';
        echo '<p class="description">' . esc_html__('Defaults here reproduce the behaviour shipped before this page existed. Change them only with a reason.', 'dcc-cottage-selector') . '</p>';
        echo '<table class="form-table" role="presentation"><tbody>';
        self::number_row('badges_max', __('Badges per cottage', 'dcc-cottage-selector'), $s, 1, 6, '');
        self::number_row('reasons_max', __('Match reasons per cottage', 'dcc-cottage-selector'), $s, 1, 6, '');
        self::number_row('avail_max_nights', __('Longest stay to look up (nights)', 'dcc-cottage-selector'), $s, 1, 365, '');
        self::text_row('avail_action', __('Availability AJAX action', 'dcc-cottage-selector'), $s,
            __('The action name the MPHB Availability Calendar answers on. Do not change unless that plugin changes it.', 'dcc-cottage-selector'));
        self::url_row('avail_calendar_url', __('Calendar page URL', 'dcc-cottage-selector'), $s,
            __('Where a guest is sent to pick other dates when their choice is booked.', 'dcc-cottage-selector'));
        echo '</tbody></table></details>';

        submit_button();
        echo '</form>';

        echo '<p class="description">' . sprintf(
            /* translators: %s: plugin version */
            esc_html__('DCC Cottage Selector %s. Defaults reproduce the behaviour of the release before this page existed.', 'dcc-cottage-selector'),
            esc_html(defined('DCCS_VERSION') ? DCCS_VERSION : '')
        ) . '</p>';

        echo '</div>';
    }

    /** @return array<string,string> */
    private static function mode_labels(): array
    {
        return [
            'quick'   => __('Quick finder', 'dcc-cottage-selector'),
            'weights' => __('Weigh priorities', 'dcc-cottage-selector'),
            'compare' => __('Compare', 'dcc-cottage-selector'),
        ];
    }

    /** @param array<string,mixed> $s */
    private static function number_row(string $key, string $label, array $s, int $min, int $max, string $help): void
    {
        $id = 'dccs-' . str_replace('_', '-', $key);
        echo '<tr><th scope="row"><label for="' . esc_attr($id) . '">' . esc_html($label) . '</label></th><td>';
        printf(
            '<input type="number" id="%s" name="%s" value="%s" min="%d" max="%d" step="1" class="small-text">',
            esc_attr($id), esc_attr($key), esc_attr((string) $s[$key]), $min, $max
        );
        self::help($help);
        echo '</td></tr>';
    }

    /** @param array<string,mixed> $s */
    private static function checkbox_row(string $key, string $label, array $s, string $help): void
    {
        $id = 'dccs-' . str_replace('_', '-', $key);
        echo '<tr><th scope="row">' . esc_html($label) . '</th><td>';
        printf(
            '<label for="%1$s"><input type="checkbox" id="%1$s" name="%2$s" value="1"%3$s> %4$s</label>',
            esc_attr($id), esc_attr($key),
            !empty($s[$key]) ? ' checked' : '',
            esc_html__('Enabled', 'dcc-cottage-selector')
        );
        self::help($help);
        echo '</td></tr>';
    }

    /** @param array<string,mixed> $s */
    private static function url_row(string $key, string $label, array $s, string $help): void
    {
        $id = 'dccs-' . str_replace('_', '-', $key);
        echo '<tr><th scope="row"><label for="' . esc_attr($id) . '">' . esc_html($label) . '</label></th><td>';
        printf(
            '<input type="url" id="%s" name="%s" value="%s" class="regular-text" inputmode="url">',
            esc_attr($id), esc_attr($key), esc_attr((string) $s[$key])
        );
        self::help($help);
        echo '</td></tr>';
    }

    /** @param array<string,mixed> $s */
    private static function text_row(string $key, string $label, array $s, string $help): void
    {
        $id = 'dccs-' . str_replace('_', '-', $key);
        echo '<tr><th scope="row"><label for="' . esc_attr($id) . '">' . esc_html($label) . '</label></th><td>';
        printf(
            '<input type="text" id="%s" name="%s" value="%s" class="regular-text" spellcheck="false">',
            esc_attr($id), esc_attr($key), esc_attr((string) $s[$key])
        );
        self::help($help);
        echo '</td></tr>';
    }

    private static function help(string $help): void
    {
        if ($help !== '') {
            echo '<p class="description">' . esc_html($help) . '</p>';
        }
    }
}
