<?php
namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The plugin's settings registry — ONE source for the defaults, the admin
 * form, the sanitiser, the front-end reads and the tests.
 *
 * WHY A REGISTRY RATHER THAN SCATTERED get_option() CALLS. Before 0.40.0 the
 * plugin had no stored settings at all: every tunable value lived as an
 * Elementor control default, a PHP `?? fallback`, or a `var(--token, literal)`
 * in the stylesheet — in several cases all three at once for the same value.
 * PROJECT-NOTES records the rule that made that survivable ("three places have
 * to agree and nothing warns when they drift") and 0.29.0 records the release
 * that had to move all three together. A registry is the warning: the schema
 * below is the only place a default is written, and defaults-test.php fails if
 * a control default or a stylesheet fallback disagrees with it.
 *
 * THE UPGRADE TRAP, GUARDED TWICE. A new version's defaults do NOT merge into
 * an already-stored option row, so a new key reads as empty and its feature
 * silently looks switched off. (The Seasons plugin shipped exactly this.)
 *   - READ SIDE: all() merges the stored row OVER the defaults on every read,
 *     so a key that has never been stored always reads its default. This is
 *     the one that actually protects behaviour.
 *   - WRITE SIDE: maybe_upgrade() persists the merge when the stored schema
 *     version is behind, so the form shows new keys and anything reading the
 *     raw option sees them too.
 * The read side alone would be enough for correctness; both are here because
 * the failure is silent and cheap to prevent twice.
 *
 * THIS CLASS IS A LEAF. It names no other class in the plugin, and the
 * defaults below are literals rather than references to Cache::DEFAULT_TTL
 * and friends. Two reasons:
 *   - Cache, Ajax and Staff all READ settings, so referencing them back from
 *     here is a cycle: a harness that loaded Settings first fatalled on a
 *     class that was not loaded yet, and three suites — including the staff
 *     security gate — went from green to NO RUN before this was noticed.
 *   - The duplication is not unguarded. defaults-test.php asserts every one
 *     of these literals against the constant it mirrors AND against what the
 *     stylesheet resolves to, so a drift fails a test rather than a page.
 *
 * NOTHING HERE IS GUEST DATA. Every value is a colour, a count, a toggle or a
 * label. No booking, guest or PII value is stored, read or printed.
 */
final class Settings
{
    public const OPTION      = 'mphbac_settings';
    public const VERSION_OPT = 'mphbac_settings_version';

    /** Bump when a key is ADDED or its default CHANGES, never for a re-label. */
    public const SCHEMA_VERSION = 1;

    /** Runtime memo. Not a cache — the option is already object-cached by WP. */
    private static ?array $resolved = null;

    /**
     * Groups, in the order the admin page renders them. `advanced => true`
     * puts the group inside the collapsed section.
     *
     * @return array<string, array{label:string, blurb:string, advanced:bool}>
     */
    public static function groups(): array
    {
        return [
            'palette' => [
                'label'    => __('Calendar colours', 'mphb-availability-calendar'),
                'blurb'    => __('The colours every calendar on the site starts from. An individual calendar can still override any of these in Elementor.', 'mphb-availability-calendar'),
                'advanced' => false,
            ],
            'buttons' => [
                'label'    => __('Buttons and links', 'mphb-availability-calendar'),
                'blurb'    => __('Navigation arrows, the Show/Reset/Book buttons, and the “View Cottage Page” link.', 'mphb-availability-calendar'),
                'advanced' => false,
            ],
            'display' => [
                'label'    => __('What the calendar shows', 'mphb-availability-calendar'),
                'blurb'    => __('How many days and months are visible, and which parts of the calendar are drawn.', 'mphb-availability-calendar'),
                'advanced' => false,
            ],
            'booking' => [
                'label'    => __('Booking popup', 'mphb-availability-calendar'),
                'blurb'    => __('The popup a guest gets when they pick dates.', 'mphb-availability-calendar'),
                'advanced' => false,
            ],
            'staff' => [
                'label'    => __('Staff board', 'mphb-availability-calendar'),
                'blurb'    => __('The password-protected /staff/ board. These settings do not appear on any guest-facing page.', 'mphb-availability-calendar'),
                'advanced' => false,
            ],
            'layout' => [
                'label'    => __('Sizing and spacing', 'mphb-availability-calendar'),
                'blurb'    => __('Cell sizes, the cottage column and the info popup. Change these only if the calendar does not fit its space.', 'mphb-availability-calendar'),
                'advanced' => true,
            ],
            'engine' => [
                'label'    => __('Data and caching', 'mphb-availability-calendar'),
                'blurb'    => __('How far the calendar will look, and how long it remembers what it found. Wrong values here cost speed, not correctness.', 'mphb-availability-calendar'),
                'advanced' => true,
            ],
        ];
    }

    /**
     * THE SCHEMA. Every default here is the value the plugin already behaves
     * as today — that is the contract, and defaults-test.php proves it against
     * the Elementor control defaults and the stylesheet's var() fallbacks
     * rather than taking this file's word for it.
     *
     * `token` names the CSS custom property a colour feeds. Only fields with a
     * token are ever emitted to the front end, and only when they differ from
     * the default — see tokens_css(). A site that changes nothing adds zero
     * bytes to every page.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function schema(): array
    {
        static $schema = null;
        if ($schema !== null) {
            return $schema;
        }
        $color = static fn(string $group, string $label, string $default, string $token = '', string $help = ''): array => [
            'group' => $group, 'type' => 'color', 'label' => $label,
            'default' => $default, 'token' => $token, 'help' => $help,
        ];
        $int = static fn(string $group, string $label, int $default, int $min, int $max, string $help = ''): array => [
            'group' => $group, 'type' => 'int', 'label' => $label,
            'default' => $default, 'min' => $min, 'max' => $max, 'help' => $help,
        ];
        $bool = static fn(string $group, string $label, bool $default, string $help = ''): array => [
            'group' => $group, 'type' => 'bool', 'label' => $label,
            'default' => $default, 'help' => $help,
        ];
        $choice = static fn(string $group, string $label, string $default, array $choices, string $help = ''): array => [
            'group' => $group, 'type' => 'choice', 'label' => $label,
            'default' => $default, 'choices' => $choices, 'help' => $help,
        ];

        $schema = [
            // ---- palette -------------------------------------------------
            'color_available'    => $color('palette', __('Available day', 'mphb-availability-calendar'), '#7BDCB5', 'mphbac-color-available'),
            'color_booked'       => $color('palette', __('Booked day', 'mphb-availability-calendar'), '#FB6962', 'mphbac-color-booked'),
            'color_past'         => $color('palette', __('Past day', 'mphb-availability-calendar'), '#bdc3c7', 'mphbac-color-past'),
            'calheader_bg'       => $color('palette', __('Date header background', 'mphb-availability-calendar'), '#0A50B2', 'mphbac-color-header'),
            'calheader_text'     => $color('palette', __('Date header text', 'mphb-availability-calendar'), '#FFFFFF'),
            'namecol_bg'         => $color('palette', __('Cottage column background', 'mphb-availability-calendar'), '#F8F9FA', 'mphbac-color-namecol'),
            'namecol_alt_bg'     => $color('palette', __('Cottage column, alternate row', 'mphb-availability-calendar'), '#F1F3F5', 'mphbac-color-namecol-alt'),
            'namecol_text'       => $color('palette', __('Cottage column text', 'mphb-availability-calendar'), '#111111'),
            'legend_text_color'  => $color('palette', __('Legend text', 'mphb-availability-calendar'), '#111111'),

            // ---- buttons -------------------------------------------------
            'nav_btn_bg'              => $color('buttons', __('Arrow background', 'mphb-availability-calendar'), '#0A50B2', 'mphbac-color-nav-bg'),
            'nav_btn_text'            => $color('buttons', __('Arrow colour', 'mphb-availability-calendar'), '#FFFFFF', 'mphbac-color-nav-text'),
            'nav_btn_hover_bg'        => $color('buttons', __('Arrow hover background', 'mphb-availability-calendar'), '#f08080', 'mphbac-color-nav-hover'),
            'button_bg_color'         => $color('buttons', __('Button background', 'mphb-availability-calendar'), '#0A50B2', 'mphbac-color-btn-bg'),
            'button_text_color'       => $color('buttons', __('Button text', 'mphb-availability-calendar'), '#ffffff', 'mphbac-color-btn-text'),
            'button_bg_color_hover'   => $color('buttons', __('Button hover background', 'mphb-availability-calendar'), '#f08080', 'mphbac-color-btn-hover'),
            'button_text_color_hover' => $color('buttons', __('Button hover text', 'mphb-availability-calendar'), '#ffffff', 'mphbac-color-btn-hover-text'),
            'view_bg_color'           => $color('buttons', __('“View Cottage Page” background', 'mphb-availability-calendar'), '#0A50B2', 'mphbac-color-view-bg'),
            'view_text_color'         => $color('buttons', __('“View Cottage Page” text', 'mphb-availability-calendar'), '#FFFFFF', 'mphbac-color-view-text'),
            'view_bg_color_hover'     => $color('buttons', __('“View Cottage Page” hover background', 'mphb-availability-calendar'), '#f08080', 'mphbac-color-view-hover'),
            'view_text_color_hover'   => $color('buttons', __('“View Cottage Page” hover text', 'mphb-availability-calendar'), '#FFFFFF', 'mphbac-color-view-hover-text'),

            // ---- display -------------------------------------------------
            'visible_days'        => $int('display', __('Days across — desktop', 'mphb-availability-calendar'), 31, 1, 95),
            'months_shown'        => $int('display', __('Months across — desktop', 'mphb-availability-calendar'), 4, 1, 4),
            'months_shown_tablet' => $int('display', __('Months across — tablet', 'mphb-availability-calendar'), 2, 1, 4),
            'months_shown_mobile' => $int('display', __('Months across — phone', 'mphb-availability-calendar'), 2, 1, 4),
            'font_size'           => $int('display', __('Calendar font size (px)', 'mphb-availability-calendar'), 18, 10, 32),
            'dow_format'          => $choice('display', __('Weekday names', 'mphb-availability-calendar'), 'long', [
                'long'    => __('Full (Monday)', 'mphb-availability-calendar'),
                'short'   => __('Short (Mon)', 'mphb-availability-calendar'),
                'initial' => __('Initial (M)', 'mphb-availability-calendar'),
            ]),
            'label_style'   => $choice('display', __('Cottage labels', 'mphb-availability-calendar'), 'abbrev_number', [
                'abbrev_number' => __('Abbreviation and number', 'mphb-availability-calendar'),
                'abbrev'        => __('Abbreviation only', 'mphb-availability-calendar'),
                'full'          => __('Full name', 'mphb-availability-calendar'),
            ]),
            'namecol_style' => $choice('display', __('Cottage column style', 'mphb-availability-calendar'), 'scales', [
                'scales'   => __('Fish scales', 'mphb-availability-calendar'),
                'dividers' => __('Plain dividers', 'mphb-availability-calendar'),
            ]),
            'show_legend'  => $bool('display', __('Show the legend', 'mphb-availability-calendar'), true),
            'show_nav'     => $bool('display', __('Show the month arrows', 'mphb-availability-calendar'), true),
            'show_past'    => $bool('display', __('Show days already past', 'mphb-availability-calendar'), true),
            'heading_show' => $bool('display', __('Show the heading above the calendar', 'mphb-availability-calendar'), true),

            // ---- booking -------------------------------------------------
            'enable_popup' => $bool('booking', __('Open the booking popup when dates are picked', 'mphb-availability-calendar'), true),
            'min_nights'   => $int('booking', __('Minimum nights', 'mphb-availability-calendar'), 2, 1, 30,
                __('A guest choosing fewer nights than this is told so before they reach checkout.', 'mphb-availability-calendar')),

            // ---- staff ---------------------------------------------------
            'staff_nav_bg'     => $color('staff', __('Board button background', 'mphb-availability-calendar'), '#0A50B2', 'staff-nav-bg'),
            'staff_nav_text'   => $color('staff', __('Board button text', 'mphb-availability-calendar'), '#FFFFFF', 'staff-nav-text'),
            'staff_nav_hover'  => $color('staff', __('Board arrow hover', 'mphb-availability-calendar'), '#f08080', 'staff-nav-hover',
                __('The month arrows only. The board’s other buttons take the shared hover colour from the DCC layer, not from here.', 'mphb-availability-calendar')),
            'staff_page_id'    => $int('staff', __('Staff page ID', 'mphb-availability-calendar'), 18102, 0, PHP_INT_MAX,
                __('The password-protected page the board lives on. The board refuses to serve anything if this page loses its password.', 'mphb-availability-calendar')),
            'staff_capability' => $choice('staff', __('Who may see the board while logged in', 'mphb-availability-calendar'), 'edit_mphb_bookings', [
                'edit_mphb_bookings' => __('Anyone who can edit bookings', 'mphb-availability-calendar'),
                'edit_posts'         => __('Anyone who can edit posts', 'mphb-availability-calendar'),
                'manage_options'     => __('Administrators only', 'mphb-availability-calendar'),
            ], __('This is in addition to the page password, never instead of it.', 'mphb-availability-calendar')),

            // ---- layout (advanced) ---------------------------------------
            'namecol_width'          => $int('layout', __('Cottage column width (px)', 'mphb-availability-calendar'), 96, 40, 300),
            'cell_min_height'        => $int('layout', __('Day cell height (px)', 'mphb-availability-calendar'), 44, 24, 120,
                __('Tapping a day opens the booking popup, so this is a touch target. 44 is the floor to stay on or above.', 'mphb-availability-calendar')),
            'header_min_height'      => $int('layout', __('Date header height (px)', 'mphb-availability-calendar'), 38, 24, 120),
            'cell_radius'            => $int('layout', __('Day cell corner radius (px)', 'mphb-availability-calendar'), 4, 0, 24),
            'cell_gap'               => $int('layout', __('Gap between cells (px)', 'mphb-availability-calendar'), 2, 0, 12),
            'info_popup_full_width'  => $bool('layout', __('Cottage info popup fills the screen', 'mphb-availability-calendar'), true),
            'info_popup_max_width'   => $int('layout', __('Cottage info popup maximum width (px)', 'mphb-availability-calendar'), 1200, 320, 2400),
            'info_popup_side_margin' => $int('layout', __('Cottage info popup side margin (px)', 'mphb-availability-calendar'), 32, 0, 200),

            // ---- engine (advanced) ---------------------------------------
            'cache_ttl' => $int('engine', __('Remember availability for (seconds)', 'mphb-availability-calendar'), 900, 0, 86400,
                __('The default matches how often MotoPress syncs its iCal feeds. Lower means fresher and slower; 0 disables caching.', 'mphb-availability-calendar')),
            'forward_scan_days' => $int('engine', __('Look ahead for the next free date (days)', 'mphb-availability-calendar'), 365, 30, 1095,
                __('Only used when every visible day is booked, to say how long the property is full for.', 'mphb-availability-calendar')),
            'max_range_days'    => $int('engine', __('Largest range one request may ask for (days)', 'mphb-availability-calendar'), 95, 31, 400),
            'clamp_past_days'   => $int('engine', __('How far back a request may ask (days)', 'mphb-availability-calendar'), 400, 0, 3650),
            'clamp_future_days' => $int('engine', __('How far ahead a request may ask (days)', 'mphb-availability-calendar'), 730, 31, 3650),
            'keep_assets_unoptimized' => $bool('engine', __('Keep the calendar’s script and stylesheet out of combine/defer optimisers', 'mphb-availability-calendar'), true,
                __('The calendar draws itself in the browser. Folded into a combined bundle it can fail to run at all, leaving a grey skeleton. Turn this off only if you have removed the optimiser.', 'mphb-availability-calendar')),
        ];
        return $schema;
    }

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        $out = [];
        foreach (self::schema() as $key => $field) {
            $out[$key] = $field['default'];
        }
        return $out;
    }

    /**
     * Stored values merged OVER the defaults, with every value coerced to its
     * schema type. A key that has never been stored reads its default here —
     * which is what makes a new release's new keys work without any migration
     * having run yet.
     *
     * @return array<string, mixed>
     */
    public static function all(): array
    {
        if (self::$resolved !== null) {
            return self::$resolved;
        }
        $stored = get_option(self::OPTION, []);
        if (!is_array($stored)) {
            $stored = [];
        }
        $out = [];
        foreach (self::schema() as $key => $field) {
            $out[$key] = array_key_exists($key, $stored)
                ? self::coerce($field, $stored[$key])
                : $field['default'];
        }
        return self::$resolved = $out;
    }

    /** @return mixed */
    public static function get(string $key)
    {
        $all = self::all();
        if (!array_key_exists($key, $all)) {
            // A typo'd key must be loud in development and harmless in
            // production — returning null silently is how a colour becomes
            // "transparent" on a live page with nothing reporting it.
            if (defined('WP_DEBUG') && WP_DEBUG) {
                trigger_error('MPHBAC\\Settings::get(): unknown key ' . $key, E_USER_WARNING);
            }
            return null;
        }
        return $all[$key];
    }

    /** Forget the memo. Called after a save, and by the tests. */
    public static function flush(): void
    {
        self::$resolved = null;
    }

    /**
     * Coerce ONE value to its schema type. Used on read as well as on save:
     * a row written by an older version, by WP-CLI, or by hand is not
     * trustworthy just because it is already in the database.
     *
     * @param  array<string,mixed> $field
     * @param  mixed               $value
     * @return mixed
     */
    private static function coerce(array $field, $value)
    {
        switch ($field['type']) {
            case 'color':
                $v = is_string($value) ? trim($value) : '';
                // #rgb, #rrggbb or #rrggbbaa only. Anything else falls back to
                // the default rather than being printed into a stylesheet.
                return preg_match('/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $v)
                    ? $v : $field['default'];
            case 'int':
                if (!is_scalar($value) || !preg_match('/^-?\d+$/', trim((string) $value))) {
                    return $field['default'];
                }
                $n = (int) $value;
                return max((int) $field['min'], min((int) $field['max'], $n));
            case 'bool':
                return in_array($value, [true, 1, '1', 'yes', 'on', 'true'], true);
            case 'choice':
                return is_string($value) && array_key_exists($value, $field['choices'])
                    ? $value : $field['default'];
        }
        return $field['default'];
    }

    /**
     * Sanitise a whole submitted form. Keys not in the schema are DROPPED —
     * the stored row can only ever contain keys this file declares, so a
     * crafted POST cannot smuggle a value into the option for something else
     * to read back.
     *
     * @param  array<string,mixed> $raw
     * @return array<string,mixed>
     */
    public static function sanitize(array $raw): array
    {
        $out = [];
        foreach (self::schema() as $key => $field) {
            if ($field['type'] === 'bool') {
                // An unchecked box posts NOTHING, so absence must mean false —
                // not "keep the default", or a box could never be turned off.
                $out[$key] = self::coerce($field, $raw[$key] ?? false);
                continue;
            }
            $out[$key] = array_key_exists($key, $raw)
                ? self::coerce($field, $raw[$key])
                : $field['default'];
        }
        return $out;
    }

    /**
     * Persist the merge when the stored schema version is behind. See the
     * class docblock: all() already protects behaviour, this protects the
     * form and anything reading the raw option.
     */
    public static function maybe_upgrade(): void
    {
        $stored_version = (int) get_option(self::VERSION_OPT, 0);
        if ($stored_version === self::SCHEMA_VERSION) {
            return;
        }
        $stored = get_option(self::OPTION, []);
        if (!is_array($stored)) {
            $stored = [];
        }
        $merged = [];
        foreach (self::schema() as $key => $field) {
            $merged[$key] = array_key_exists($key, $stored)
                ? self::coerce($field, $stored[$key])
                : $field['default'];
        }
        // Only write when something actually changed — an update_option that
        // stores an identical array still bumps the row and busts caches.
        if ($merged !== $stored) {
            update_option(self::OPTION, $merged, false);
        }
        update_option(self::VERSION_OPT, self::SCHEMA_VERSION, true);
        self::flush();
    }

    /**
     * The custom-property block for the front end — EMPTY unless a colour has
     * actually been changed.
     *
     * PAGE WEIGHT IS A BUDGET on this site, and Elementor's CSS print method
     * is "External File" precisely to keep blobs out of the HTML. So this is
     * not "emit the palette"; it is "emit the differences". A site that has
     * never opened the settings page pays zero bytes, and a site that has
     * changed two colours pays about ninety.
     *
     * The selector list is the portal-safe one: .mphbac-sheet and
     * .mphbac-info-sheet are moved to <body> when they open, and the staff
     * dialog and overlay likewise, so a property declared only on the widget
     * root stops resolving at exactly the moment those elements become
     * visible (0.37.0, 0.38.0).
     */
    public static function tokens_css(): string
    {
        $decls = [];
        foreach (self::schema() as $key => $field) {
            if (($field['token'] ?? '') === '' || $field['type'] !== 'color') {
                continue;
            }
            $value = self::get($key);
            if ($value === $field['default']) {
                continue;
            }
            $decls[$field['token']] = $value;
        }
        if (!$decls) {
            return '';
        }
        $public = $staff = [];
        foreach ($decls as $token => $value) {
            // Staff tokens are named --staff-* / --dcc-*; public ones
            // --mphbac-*. They land on different roots.
            $line = '--' . $token . ':' . $value . ';';
            if (strncmp($token, 'mphbac-', 7) === 0) {
                $public[] = $line;
            } else {
                $staff[] = $line;
            }
        }
        $css = '';
        if ($public) {
            $css .= '.mphbac-root,.mphbac-sheet,.mphbac-info-sheet{' . implode('', $public) . '}';
        }
        if ($staff) {
            $css .= '.mphbac-staff,.mphbac-staff-sheet,.mphbac-staff-overlay{' . implode('', $staff) . '}';
        }
        return $css;
    }
}
