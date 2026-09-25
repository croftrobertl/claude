<?php
namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * DCC → Availability Calendar. The plugin's only admin screen.
 *
 * THIS PLUGIN DOES NOT OWN THE `dcc` PARENT AND NO LONGER REGISTERS IT.
 * A site-side mu-plugin, dcc-menu.php, owns it: it adds the parent at
 * admin_menu priority 5 and calls remove_submenu_page() on the mirrored
 * duplicate at 999. That is
 * the clean fix to the duplicate-parent CAUSE — add_menu_page() always
 * creates a submenu item duplicating its own parent, so every plugin that
 * registered the parent also had to carry a removal, and four of them did.
 * With one owner there is nothing to deduplicate and nothing to negotiate.
 *
 * So this file adds a SUBMENU and nothing else. It does not check whether the
 * parent exists, does not create it, and does not remove anything. If the
 * mu-plugin is ever absent the submenu simply does not appear — WordPress
 * drops a submenu whose parent is missing — which is a visible, harmless
 * failure rather than a menu that fights its siblings.
 *
 * SUBMENU PRIORITY 55. The live register, verified by the intermediary:
 *      5  dcc-menu (parent)     20 contact-form      30 guest-guide
 *     35  features-amenities    40 seasons           45 cottage-selector
 *     50  custom-checkout       63 wildlife
 *     10 and 60 reserved for site-side mu-plugins.
 * 0.40.0 took 40 and COLLIDED with dcc-seasons, which was already there;
 * neither session could see the other's source, which is why every session
 * states its number. 55 is free. Submenu order follows priority, so this
 * screen sits between custom-checkout and wildlife.
 *
 * SECURITY. Rendering and saving both check the capability; the form carries a
 * nonce that is verified before anything is written; everything submitted goes
 * through Settings::sanitize(), which drops keys the schema does not declare;
 * and every value printed back is escaped at the point of output. No booking
 * or guest data is read, stored or displayed on this screen.
 */
final class Admin
{
    public const PARENT_SLUG = 'dcc';
    public const PAGE_SLUG   = 'mphbac-settings';
    public const SAVE_ACTION = 'mphbac_save_settings';

    /** Everything on this screen is a site-wide display setting. */
    public static function capability(): string
    {
        return (string) apply_filters('mphbac_settings_capability', 'manage_options');
    }

    public static function register(): void
    {
        add_action('admin_menu', [self::class, 'register_page'], 55);
        // THE SAVE IS ITS OWN ENTRY POINT, not a branch inside render().
        // Two reasons, and the second is the one that matters:
        //   a. post-redirect-get, so refreshing the page after a save does not
        //      re-submit the form;
        //   b. handling the POST inside render() put it BEHIND render()'s own
        //      capability check, which made the save path's check redundant —
        //      and a redundant check is an UNTESTABLE one. A mutation that
        //      deleted it changed nothing observable and SURVIVED. Now this is
        //      the only guard on the only path that writes, so removing it
        //      goes red.
        add_action('admin_post_' . self::SAVE_ACTION, [self::class, 'handle_save']);
        // The persisted half of the upgrade merge. admin_init, not
        // plugins_loaded: it writes an option, and the front end must never
        // pay for a write on a cached page view.
        add_action('admin_init', ['\\MPHBAC\\Settings', 'maybe_upgrade']);
    }

    public static function register_page(): void
    {
        add_submenu_page(
            self::PARENT_SLUG,
            __('Availability Calendar', 'mphb-availability-calendar'),
            __('Availability Calendar', 'mphb-availability-calendar'),
            self::capability(),
            self::PAGE_SLUG,
            [self::class, 'render']
        );
    }

    /**
     * THE ONLY PATH THAT WRITES. Capability first, then the nonce, then the
     * sanitiser, then a redirect so a refresh cannot re-submit.
     *
     * The capability check here is not a second opinion — it is the check.
     * Nothing else guards admin-post.php, which is reachable by any logged-in
     * user with a session.
     */
    public static function handle_save(): void
    {
        if (!current_user_can(self::capability())) {
            wp_die(esc_html__('You are not allowed to change these settings.', 'mphb-availability-calendar'), '', ['response' => 403]);
        }
        check_admin_referer(self::SAVE_ACTION, 'mphbac_nonce');

        if (isset($_POST['mphbac_reset'])) {
            update_option(Settings::OPTION, Settings::defaults(), false);
            $notice = 'reset';
        } else {
            $raw = isset($_POST['mphbac']) && is_array($_POST['mphbac'])
                ? wp_unslash($_POST['mphbac'])
                : [];
            update_option(Settings::OPTION, Settings::sanitize((array) $raw), false);
            $notice = 'saved';
        }
        Settings::flush();

        wp_safe_redirect(add_query_arg(
            ['page' => self::PAGE_SLUG, 'mphbac-notice' => $notice],
            admin_url('admin.php')
        ));
        exit;
    }

    /**
     * Which confirmation to show after a redirect. Read from the query string
     * and matched against a fixed list — never printed back, so nothing a
     * visitor can put in the URL reaches the page.
     */
    private static function notice_from_query(): string
    {
        $n = isset($_GET['mphbac-notice']) ? sanitize_key((string) wp_unslash($_GET['mphbac-notice'])) : '';
        return in_array($n, ['saved', 'reset'], true) ? $n : '';
    }

    public static function render(): void
    {
        if (!current_user_can(self::capability())) {
            wp_die(esc_html__('You are not allowed to view these settings.', 'mphb-availability-calendar'), '', ['response' => 403]);
        }
        $notice = self::notice_from_query();
        $values = Settings::all();
        $schema = Settings::schema();
        $groups = Settings::groups();

        echo '<div class="wrap mphbac-settings">';
        echo '<h1>' . esc_html__('Availability Calendar', 'mphb-availability-calendar') . '</h1>';

        if ($notice !== '') {
            // role=status, not an alert: this is a confirmation, and an alert
            // would interrupt a screen reader mid-sentence.
            printf(
                '<div class="notice notice-success is-dismissible" role="status"><p>%s</p></div>',
                esc_html($notice === 'reset'
                    ? __('Every setting is back to the value the plugin ships with.', 'mphb-availability-calendar')
                    : __('Settings saved.', 'mphb-availability-calendar'))
            );
        }

        echo '<p class="mphbac-lede">' . esc_html__(
            'These are the values every calendar on the site starts from. An individual calendar can still override any of them in Elementor; a calendar that has never been touched follows what is set here.',
            'mphb-availability-calendar'
        ) . '</p>';

        self::print_styles();

        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        echo '<input type="hidden" name="action" value="' . esc_attr(self::SAVE_ACTION) . '">';
        wp_nonce_field(self::SAVE_ACTION, 'mphbac_nonce');

        foreach ([false, true] as $advanced) {
            $in_section = array_filter($groups, static fn(array $g): bool => $g['advanced'] === $advanced);
            if (!$in_section) {
                continue;
            }
            if ($advanced) {
                // <details> is the whole disclosure mechanism: keyboard
                // operable, announced as expanded/collapsed, and it animates
                // nothing — so there is no motion for prefers-reduced-motion
                // to honour and no JavaScript on this screen at all.
                echo '<details class="mphbac-advanced"><summary>'
                   . esc_html__('Advanced settings', 'mphb-availability-calendar')
                   . '</summary>'
                   . '<p class="mphbac-lede">' . esc_html__('Defaults here are already correct for this site. Change them only for a reason.', 'mphb-availability-calendar') . '</p>';
            }
            foreach ($in_section as $group_key => $group) {
                $fields = array_filter($schema, static fn(array $f): bool => $f['group'] === $group_key);
                if (!$fields) {
                    continue;
                }
                echo '<section class="mphbac-group" aria-labelledby="mphbac-h-' . esc_attr($group_key) . '">';
                echo '<h2 id="mphbac-h-' . esc_attr($group_key) . '">' . esc_html($group['label']) . '</h2>';
                echo '<p class="mphbac-lede">' . esc_html($group['blurb']) . '</p>';
                echo '<table class="form-table" role="presentation"><tbody>';
                foreach ($fields as $key => $field) {
                    self::print_field($key, $field, $values[$key] ?? $field['default']);
                }
                echo '</tbody></table></section>';
            }
            if ($advanced) {
                echo '</details>';
            }
        }

        echo '<p class="submit">';
        submit_button(__('Save settings', 'mphb-availability-calendar'), 'primary', 'mphbac_save', false);
        echo ' ';
        submit_button(
            __('Reset everything to the shipped defaults', 'mphb-availability-calendar'),
            'secondary',
            'mphbac_reset',
            false,
            // No JS confirm: a confirm() dialog is not reliably reachable by
            // keyboard in every assistive setup, and the action is reversible
            // by simply saving again.
            // formnovalidate so a half-typed colour elsewhere on the form
            // cannot block a reset — the reset discards the form anyway.
            ['formnovalidate' => 'formnovalidate']
        );
        echo '</p>';
        echo '</form></div>';
    }

    /**
     * One row. The LABEL is always a real <label for>, and help text is tied
     * to the control with aria-describedby rather than left floating next to
     * it, so it is announced with the field instead of skipped.
     *
     * @param array<string,mixed> $field
     * @param mixed               $value
     */
    private static function print_field(string $key, array $field, $value): void
    {
        $id   = 'mphbac-' . $key;
        $name = 'mphbac[' . $key . ']';
        $help = (string) ($field['help'] ?? '');
        $desc = $help !== '' ? $id . '-help' : '';

        echo '<tr><th scope="row"><label for="' . esc_attr($id) . '">' . esc_html($field['label']) . '</label></th><td>';

        switch ($field['type']) {
            case 'color':
                // The TEXT field is the control: labelled, typable, and
                // readable by a screen reader as its actual value. The swatch
                // beside it is a pointer convenience only — hidden from the
                // accessibility tree and out of the tab order, so there is one
                // control here, not two that disagree.
                printf(
                    '<input type="text" id="%1$s" name="%2$s" value="%3$s" class="regular-text code mphbac-hex" '
                    . 'pattern="#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})" '
                    . 'inputmode="text" spellcheck="false" autocomplete="off"%4$s>',
                    esc_attr($id),
                    esc_attr($name),
                    esc_attr((string) $value),
                    $desc !== '' ? ' aria-describedby="' . esc_attr($desc) . '"' : ''
                );
                printf(
                    '<span class="mphbac-swatch" aria-hidden="true" style="background:%s"></span>',
                    esc_attr((string) $value)
                );
                printf(
                    '<span class="mphbac-shipped">%s</span>',
                    esc_html(sprintf(
                        /* translators: %s: the colour the plugin ships with, e.g. #0A50B2 */
                        __('ships as %s', 'mphb-availability-calendar'),
                        (string) $field['default']
                    ))
                );
                break;

            case 'int':
                printf(
                    '<input type="number" id="%1$s" name="%2$s" value="%3$s" min="%4$s" max="%5$s" step="1" class="small-text"%6$s>',
                    esc_attr($id),
                    esc_attr($name),
                    esc_attr((string) $value),
                    esc_attr((string) $field['min']),
                    esc_attr((string) $field['max']),
                    $desc !== '' ? ' aria-describedby="' . esc_attr($desc) . '"' : ''
                );
                printf(
                    '<span class="mphbac-shipped">%s</span>',
                    esc_html(sprintf(
                        /* translators: %s: the value the plugin ships with */
                        __('ships as %s', 'mphb-availability-calendar'),
                        (string) $field['default']
                    ))
                );
                break;

            case 'bool':
                printf(
                    '<input type="checkbox" id="%1$s" name="%2$s" value="1"%3$s%4$s>',
                    esc_attr($id),
                    esc_attr($name),
                    $value ? ' checked' : '',
                    $desc !== '' ? ' aria-describedby="' . esc_attr($desc) . '"' : ''
                );
                printf(
                    '<span class="mphbac-shipped">%s</span>',
                    esc_html($field['default']
                        ? __('ships switched on', 'mphb-availability-calendar')
                        : __('ships switched off', 'mphb-availability-calendar'))
                );
                break;

            case 'choice':
                printf(
                    '<select id="%1$s" name="%2$s"%3$s>',
                    esc_attr($id),
                    esc_attr($name),
                    $desc !== '' ? ' aria-describedby="' . esc_attr($desc) . '"' : ''
                );
                foreach ((array) $field['choices'] as $ck => $label) {
                    printf(
                        '<option value="%s"%s>%s</option>',
                        esc_attr((string) $ck),
                        selected($value, $ck, false),
                        esc_html((string) $label)
                    );
                }
                echo '</select>';
                break;
        }

        if ($help !== '') {
            echo '<p class="description" id="' . esc_attr($desc) . '">' . esc_html($help) . '</p>';
        }
        echo '</td></tr>';
    }

    /**
     * A few rules, admin-only. This is not the guest page-weight budget — no
     * visitor ever loads this — but it is still kept to what the screen needs.
     * Colours are checked against the ground they actually sit on: WordPress
     * admin content is #1d2327 on #fff (15.8:1) and .description is #646970 on
     * #fff (5.7:1), both clear of AA; the swatch carries a border so a pale
     * colour is still visible as a shape against white.
     */
    private static function print_styles(): void
    {
        echo '<style>'
           . '.mphbac-settings .mphbac-lede{max-width:46em;color:#50575e}'
           . '.mphbac-settings .mphbac-group{margin:0 0 1.5em}'
           . '.mphbac-settings .mphbac-group h2{margin-bottom:.25em}'
           . '.mphbac-settings .mphbac-swatch{display:inline-block;width:1.6em;height:1.6em;'
           . 'vertical-align:middle;margin-left:.5em;border:1px solid #8c8f94;border-radius:3px}'
           . '.mphbac-settings .mphbac-shipped{margin-left:.75em;color:#646970;font-size:12px}'
           . '.mphbac-settings .mphbac-advanced{margin:2em 0;border:1px solid #c3c4c7;'
           . 'border-radius:4px;background:#fff;padding:0 1em 1em}'
           . '.mphbac-settings .mphbac-advanced>summary{cursor:pointer;padding:1em 0;'
           . 'font-weight:600;font-size:1.1em}'
           // A visible focus ring on the disclosure itself — the default
           // <summary> outline is removed by some admin themes.
           . '.mphbac-settings .mphbac-advanced>summary:focus-visible{outline:2px solid #2271b1;outline-offset:2px}'
           . '</style>';
    }
}
