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
 * Only native form controls are used: every field is keyboard reachable and
 * carries a real <label for>, the mode checkboxes sit in a fieldset with a
 * legend, and nothing overrides the browser's focus ring.
 */
final class Settings_Page
{
    public const ACTION = 'dccs_save_settings';
    public const NONCE  = 'dccs_settings_nonce';

    /** Hook suffix from add_submenu_page(); set by Menu::register_page(). */
    public static string $hook = '';

    public static function init(): void
    {
        add_action('admin_post_' . self::ACTION, [self::class, 'handle_save']);
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

        wp_safe_redirect(add_query_arg(
            ['page' => Menu::SLUG, 'dccs-saved' => '1'],
            admin_url(self::parent_file())
        ));
        exit;
    }

    /** Where the page lives, so the redirect lands back on it either way. */
    private static function parent_file(): string
    {
        return isset($GLOBALS['admin_page_hooks'][Menu::PARENT]) ? 'admin.php' : 'options-general.php';
    }

    public static function render(): void
    {
        if (!current_user_can(Menu::CAP)) {
            wp_die(esc_html__('You do not have permission to view these settings.', 'dcc-cottage-selector'), '', ['response' => 403]);
        }

        $s = Settings::get();
        $saved = isset($_GET['dccs-saved']) && $_GET['dccs-saved'] === '1';

        echo '<div class="wrap">';
        echo '<h1>' . esc_html__('DCC Cottage Selector', 'dcc-cottage-selector') . '</h1>';

        if ($saved) {
            echo '<div class="notice notice-success is-dismissible"><p>'
                . esc_html__('Settings saved.', 'dcc-cottage-selector') . '</p></div>';
        }

        echo '<p class="description">'
            . esc_html__('Site-wide defaults for every Cottage Selector and Mini Entry on the site. An individual widget overrides a default only where its own Elementor control has been deliberately set; clearing that control hands the decision back to this page.', 'dcc-cottage-selector')
            . '</p>';

        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        echo '<input type="hidden" name="action" value="' . esc_attr(self::ACTION) . '">';
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
        echo '<details style="margin-top:1.5em">';
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
