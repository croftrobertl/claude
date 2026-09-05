<?php
/**
 * Options storage + the WP-Admin → Settings → DCC Seasons page.
 *
 * @package DCC_Seasons
 */

namespace DCC_Seasons;

if (!defined('ABSPATH')) {
    exit;
}

class Settings {

    public const OPTION = 'dcc_seasons_options';

    /** Page slug — unchanged by the move to the DCC parent menu. */
    public const SLUG = 'dcc-seasons';

    /**
     * Hook suffix returned by add_submenu_page(). The screen ID is derived
     * from the PARENT, so it changed from settings_page_dcc-seasons to
     * dcc_page_dcc-seasons when the page moved. Anything that needs to know
     * "am I on the settings page?" compares against this instead of a
     * hard-coded string, so a future re-parent can't silently break it.
     */
    private static string $hook = '';

    public static function init(): void {
        Menu::init();
        add_action('admin_menu', [self::class, 'add_page'], Menu::PRIORITY);
        add_action('admin_init', [self::class, 'register']);
        add_action('admin_init', [self::class, 'redirect_legacy_url']);
        add_action('admin_enqueue_scripts', [self::class, 'assets']);
        // The client config is inlined into cached HTML and the scope gate
        // decides server-side whether it is emitted at all, so any save can
        // leave stale pages behind.
        add_action('update_option_' . self::OPTION, [Cache_Purge::class, 'purge_and_report']);
        add_action('add_option_' . self::OPTION, [Cache_Purge::class, 'purge_and_report']);
        add_action('admin_notices', [self::class, 'purge_notice']);
    }

    /**
     * The settings page's hook suffix / screen ID, once admin_menu has run.
     */
    public static function hook(): string {
        return self::$hook;
    }

    /**
     * "Where effects appear" choices, narrowest first. The tiers are
     * strictly nested (home < no_cottages < pages < all); the matrix each
     * one covers lives on Plugin::scope_allows().
     *
     * @return array<string, string>
     */
    public static function scopes(): array {
        return [
            'home'         => __('Homepage only', 'dcc-seasons'),
            'no_cottages'  => __('All pages except cottage pages', 'dcc-seasons'),
            'pages'        => __('All pages', 'dcc-seasons'),
            'all'          => __('All pages and posts', 'dcc-seasons'),
        ];
    }

    /**
     * Tell the owner what happened to the page cache when they saved —
     * including, honestly, when nothing could be purged automatically.
     */
    public static function purge_notice(): void {
        if (self::$hook === '' || !function_exists('get_current_screen')) {
            return;
        }
        $screen = get_current_screen();
        if (!$screen || $screen->id !== self::$hook) {
            return;
        }
        $ran = get_transient(Cache_Purge::NOTICE);
        if (!$ran) {
            return;
        }
        delete_transient(Cache_Purge::NOTICE);

        if ($ran === ['none']) {
            echo '<div class="notice notice-warning"><p>'
                . esc_html__('Settings saved, but no page cache could be purged automatically. The scope and the other settings are baked into cached pages, so purge your cache manually (SpeedyCache → Purge Cache) for the change to show on already-cached URLs.', 'dcc-seasons')
                . '</p></div>';
            return;
        }
        echo '<div class="notice notice-success"><p>'
            /* translators: %s: comma-separated list of caches that were purged. */
            . esc_html(sprintf(__('Settings saved and page cache purged: %s.', 'dcc-seasons'), implode(', ', array_map('strval', (array) $ran))))
            . '</p></div>';
    }

    /**
     * Old bookmarks: Settings → DCC Seasons lived at
     * options-general.php?page=dcc-seasons. Send those to the new parent.
     */
    public static function redirect_legacy_url(): void {
        global $pagenow;
        if ($pagenow !== 'options-general.php') {
            return;
        }
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only redirect of a bookmarked URL.
        if ((isset($_GET['page']) ? $_GET['page'] : '') !== self::SLUG) {
            return;
        }
        if (!current_user_can('manage_options')) {
            return;
        }
        wp_safe_redirect(admin_url('admin.php?page=' . self::SLUG));
        exit;
    }

    /**
     * Option defaults, including the pre-seeded 2026–27 schedule.
     */
    public static function defaults(): array {
        return [
            'enabled'         => 1,
            'ambient'         => 1,
            'egg'             => 1,
            'layering'        => 'behind',
            'scope'           => 'all',
            'tap_selector'    => '#branding, .header-image .entry-title, .entry-title, #site-title',
            'tap_count'       => 5,
            'density'         => 10,
            'opacity'         => 0.35,
            'richness'        => 'full',
            'fx_reflections'  => 1,
            'fx_vignettes'    => 1,
            'fx_pointer'      => 1,
            'fx_evening'      => 1,
            'fx_snow'         => 1,
            'schedule'        => Themes::default_schedule(),
        ];
    }

    /**
     * Saved options merged over defaults, filterable.
     */
    public static function options(): array {
        $opt = get_option(self::OPTION, []);
        if (!is_array($opt)) {
            $opt = [];
        }
        $opt = wp_parse_args($opt, self::defaults());

        // Pre-3.7.0 rows were dated (Y-m-d). Bring them forward every read —
        // cheap and idempotent — and persist once on upgrade (see
        // Plugin::maybe_purge_after_upgrade).
        if (is_array($opt['schedule'])) {
            $opt['schedule'] = Schedule::migrate($opt['schedule'], Themes::legacy_default_schedule());
        } else {
            $opt['schedule'] = Themes::default_schedule();
        }

        /**
         * Filter the effective plugin options.
         *
         * @param array $opt
         */
        return apply_filters('dcc_seasons_options', $opt);
    }

    public static function add_page(): void {
        // Inside a menu already called DCC, "DCC → DCC Seasons" stutters:
        // the menu label is the bare product name, the page title stays
        // fully qualified.
        self::$hook = (string) add_submenu_page(
            Menu::PARENT,
            __('DCC Seasons', 'dcc-seasons'),
            __('Seasons', 'dcc-seasons'),
            'manage_options',
            self::SLUG,
            [self::class, 'render_page']
        );
    }

    public static function register(): void {
        register_setting('dcc_seasons', self::OPTION, [
            'type'              => 'array',
            'sanitize_callback' => [self::class, 'sanitize'],
        ]);
    }

    public static function assets(string $hook): void {
        if (self::$hook === '' || $hook !== self::$hook) {
            return;
        }
        wp_enqueue_style(
            'dcc-seasons-admin',
            DCC_SEASONS_URL . 'assets/css/admin.css',
            [],
            DCC_SEASONS_VERSION
        );
        wp_enqueue_script(
            'dcc-seasons-admin',
            DCC_SEASONS_URL . 'assets/js/admin.js',
            [],
            DCC_SEASONS_VERSION,
            true
        );
    }

    /**
     * Sanitize everything the form posts.
     *
     * @param mixed $in Raw POSTed option array.
     */
    public static function sanitize($in): array {
        $d = self::defaults();
        if (!is_array($in)) {
            return $d;
        }

        $out            = [];
        $out['enabled'] = empty($in['enabled']) ? 0 : 1;
        $out['ambient'] = empty($in['ambient']) ? 0 : 1;
        $out['egg']     = empty($in['egg']) ? 0 : 1;

        $selector            = isset($in['tap_selector']) ? sanitize_text_field((string) $in['tap_selector']) : '';
        $out['tap_selector'] = $selector !== '' ? $selector : $d['tap_selector'];

        $out['tap_count'] = min(10, max(2, (int) ($in['tap_count'] ?? $d['tap_count'])));
        $out['density']   = min(16, max(1, (int) ($in['density'] ?? $d['density'])));

        $opacity        = (float) ($in['opacity'] ?? $d['opacity']);
        $out['opacity'] = min(1.0, max(0.05, round($opacity, 2)));

        $layering        = sanitize_key((string) ($in['layering'] ?? $d['layering']));
        $out['layering'] = in_array($layering, ['behind', 'front'], true) ? $layering : 'behind';

        // Unknown/absent value falls back to 'all' — today's behavior, so an
        // upgrade from an options array with no `scope` key changes nothing.
        $scope        = sanitize_key((string) ($in['scope'] ?? $d['scope']));
        $out['scope'] = array_key_exists($scope, self::scopes()) ? $scope : 'all';

        $richness        = sanitize_key((string) ($in['richness'] ?? $d['richness']));
        $out['richness'] = in_array($richness, ['full', 'classic', 'minimal'], true) ? $richness : 'full';
        foreach (['fx_reflections', 'fx_vignettes', 'fx_pointer', 'fx_evening', 'fx_snow'] as $fx) {
            $out[$fx] = empty($in[$fx]) ? 0 : 1;
        }

        $rows       = [];
        $theme_keys = array_keys(Themes::themes());
        if (!empty($in['schedule']) && is_array($in['schedule'])) {
            foreach ($in['schedule'] as $row) {
                $clean = Schedule::sanitize_row($row, $theme_keys);
                if ($clean) {
                    $rows[] = $clean;
                }
            }
        }
        $out['schedule'] = $rows;

        return $out;
    }

    /**
     * Validate a Y-m-d date string; returns '' when invalid.
     */

    public static function render_page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }
        $opt    = self::options();
        $labels = Themes::labels();
        ?>
        <div class="wrap dcc-seasons-wrap">
            <h1><?php esc_html_e('DCC Seasons', 'dcc-seasons'); ?></h1>
            <p class="description">
                <?php esc_html_e('Seasonal ambient particles + a tap-the-logo Matrix easter egg. The active theme is picked in the visitor\'s browser from their local date, so page caching never serves a stale season.', 'dcc-seasons'); ?>
            </p>

            <form method="post" action="options.php">
                <?php settings_fields('dcc_seasons'); ?>

                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><?php esc_html_e('Master enable', 'dcc-seasons'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="<?php echo esc_attr(self::OPTION); ?>[enabled]" value="1" <?php checked(!empty($opt['enabled'])); ?> />
                                <?php esc_html_e('Enable DCC Seasons', 'dcc-seasons'); ?>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('Layers', 'dcc-seasons'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="<?php echo esc_attr(self::OPTION); ?>[ambient]" value="1" <?php checked(!empty($opt['ambient'])); ?> />
                                <?php esc_html_e('Ambient particles (site-wide, subtle)', 'dcc-seasons'); ?>
                            </label><br />
                            <label>
                                <input type="checkbox" name="<?php echo esc_attr(self::OPTION); ?>[egg]" value="1" <?php checked(!empty($opt['egg'])); ?> />
                                <?php esc_html_e('Matrix easter egg (tap the logo)', 'dcc-seasons'); ?>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="dcc-seasons-scope"><?php esc_html_e('Where effects appear', 'dcc-seasons'); ?></label>
                        </th>
                        <td>
                            <select id="dcc-seasons-scope" name="<?php echo esc_attr(self::OPTION); ?>[scope]">
                                <?php foreach (self::scopes() as $key => $label) : ?>
                                    <option value="<?php echo esc_attr($key); ?>" <?php selected($opt['scope'], $key); ?>><?php echo esc_html($label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <p class="description"><?php esc_html_e('Pages outside this scope load none of the plugin at all — no script, no config, no styles — so they cost nothing. "All pages except cottage pages" keeps the booking screens calm while the rest of the site stays festive; cottage pages are matched by MotoPress post type, not by URL. This covers the ambient particles AND the tap easter egg together, so the egg only fires where effects appear.', 'dcc-seasons'); ?></p>
                            <p class="description"><?php esc_html_e('Saving purges the page cache automatically — already-cached pages would otherwise keep the old scope. Admin theme previews (?dcc_season=) ignore this setting, so you can always preview anywhere.', 'dcc-seasons'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="dcc-seasons-layering"><?php esc_html_e('Layering', 'dcc-seasons'); ?></label>
                        </th>
                        <td>
                            <select id="dcc-seasons-layering" name="<?php echo esc_attr(self::OPTION); ?>[layering]">
                                <option value="behind" <?php selected($opt['layering'], 'behind'); ?>><?php esc_html_e('Behind interactive widgets (recommended)', 'dcc-seasons'); ?></option>
                                <option value="front" <?php selected($opt['layering'], 'front'); ?>><?php esc_html_e('In front of everything', 'dcc-seasons'); ?></option>
                            </select>
                            <p class="description"><?php esc_html_e('"Behind" keeps the ambient particles under the cottage selector and availability calendars (the widgets are raised above the canvas). The Matrix easter egg always covers everything regardless.', 'dcc-seasons'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="dcc-seasons-tap-selector"><?php esc_html_e('Tap target selector', 'dcc-seasons'); ?></label>
                        </th>
                        <td>
                            <input type="text" class="regular-text code" id="dcc-seasons-tap-selector"
                                   name="<?php echo esc_attr(self::OPTION); ?>[tap_selector]"
                                   value="<?php echo esc_attr($opt['tap_selector']); ?>" />
                            <p class="description"><?php esc_html_e('Comma-separated CSS selectors. Every VISIBLE match is bound (zero-size elements are skipped — Bravada renders #branding at 0px on this site); all matches share one tap counter. If nothing visible matches, #masthead is used.', 'dcc-seasons'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="dcc-seasons-tap-count"><?php esc_html_e('Tap count', 'dcc-seasons'); ?></label>
                        </th>
                        <td>
                            <input type="number" min="2" max="10" step="1" id="dcc-seasons-tap-count"
                                   name="<?php echo esc_attr(self::OPTION); ?>[tap_count]"
                                   value="<?php echo esc_attr((string) $opt['tap_count']); ?>" />
                            <p class="description"><?php esc_html_e('Taps within a rolling 3-second window needed to launch the egg (default 5).', 'dcc-seasons'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="dcc-seasons-density"><?php esc_html_e('Ambient density', 'dcc-seasons'); ?></label>
                        </th>
                        <td>
                            <input type="range" min="1" max="16" step="1" id="dcc-seasons-density"
                                   name="<?php echo esc_attr(self::OPTION); ?>[density]"
                                   value="<?php echo esc_attr((string) $opt['density']); ?>"
                                   data-dcc-output="dcc-seasons-density-out" />
                            <output id="dcc-seasons-density-out"><?php echo esc_html((string) $opt['density']); ?></output>
                            <p class="description"><?php esc_html_e('Maximum simultaneous ambient particles (hard cap 16).', 'dcc-seasons'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="dcc-seasons-opacity"><?php esc_html_e('Ambient opacity', 'dcc-seasons'); ?></label>
                        </th>
                        <td>
                            <input type="range" min="0.05" max="1" step="0.05" id="dcc-seasons-opacity"
                                   name="<?php echo esc_attr(self::OPTION); ?>[opacity]"
                                   value="<?php echo esc_attr((string) $opt['opacity']); ?>"
                                   data-dcc-output="dcc-seasons-opacity-out" />
                            <output id="dcc-seasons-opacity-out"><?php echo esc_html((string) $opt['opacity']); ?></output>
                            <p class="description"><?php esc_html_e('How visible the ambient particles are (default 0.35 — deliberately faint).', 'dcc-seasons'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="dcc-seasons-richness"><?php esc_html_e('Visual richness', 'dcc-seasons'); ?></label>
                        </th>
                        <td>
                            <select id="dcc-seasons-richness" name="<?php echo esc_attr(self::OPTION); ?>[richness]">
                                <option value="full" <?php selected($opt['richness'], 'full'); ?>><?php esc_html_e('Full — parallax depth, reflections, scene moments, pointer awareness', 'dcc-seasons'); ?></option>
                                <option value="classic" <?php selected($opt['richness'], 'classic'); ?>><?php esc_html_e('Classic — v2 behavior (sprites + heroes, no extras)', 'dcc-seasons'); ?></option>
                                <option value="minimal" <?php selected($opt['richness'], 'minimal'); ?>><?php esc_html_e('Minimal — sprites only, no motion extras', 'dcc-seasons'); ?></option>
                            </select>
                            <details style="margin-top:8px;">
                                <summary><?php esc_html_e('Advanced visuals (apply within Full)', 'dcc-seasons'); ?></summary>
                                <p style="margin:8px 0 0;">
                                    <?php
                                    $fx_labels = [
                                        'fx_reflections' => __('Waterline reflections (off on mobile automatically)', 'dcc-seasons'),
                                        'fx_vignettes'   => __('Scene moments (rare choreographed vignettes)', 'dcc-seasons'),
                                        'fx_pointer'     => __('Pointer awareness (particles ease away from the cursor)', 'dcc-seasons'),
                                        'fx_evening'     => __('Evening tint (dusk grade + night variants, 7pm–6am local)', 'dcc-seasons'),
                                        'fx_snow'        => __('Snow accumulation (Christmas only)', 'dcc-seasons'),
                                    ];
                                    foreach ($fx_labels as $fx => $label) :
                                        ?>
                                        <label style="display:block;margin:2px 0;">
                                            <input type="checkbox" name="<?php echo esc_attr(self::OPTION); ?>[<?php echo esc_attr($fx); ?>]" value="1" <?php checked(!empty($opt[$fx])); ?> />
                                            <?php echo esc_html($label); ?>
                                        </label>
                                    <?php endforeach; ?>
                                </p>
                            </details>
                        </td>
                    </tr>
                </table>

                <h2><?php esc_html_e('Schedule', 'dcc-seasons'); ?></h2>
                <p class="description">
                    <?php esc_html_e('Rows repeat every year. Each end of a range is either a fixed month/day or a named holiday — Easter, Thanksgiving, Memorial Day and the rest move with the calendar automatically — plus an optional ± days offset. Ranges may overlap: the narrowest one wins that day, so a one-day holiday can sit inside a season. A range that ends before it starts runs into the next year (New Year\'s). Put a year in the last column to make a row a one-off. Dates are matched in the VISITOR\'S local time.', 'dcc-seasons'); ?>
                </p>

                <div class="dcc-seasons-scroll">
                <table class="widefat striped dcc-seasons-schedule" id="dcc-seasons-schedule">
                    <thead>
                        <tr>
                            <th><?php esc_html_e('Starts', 'dcc-seasons'); ?></th>
                            <th><?php esc_html_e('Ends', 'dcc-seasons'); ?></th>
                            <th><?php esc_html_e('Theme', 'dcc-seasons'); ?></th>
                            <th><?php esc_html_e('Label', 'dcc-seasons'); ?></th>
                            <th><?php esc_html_e('Year', 'dcc-seasons'); ?></th>
                            <th><span class="screen-reader-text"><?php esc_html_e('Remove', 'dcc-seasons'); ?></span></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($opt['schedule'] as $i => $row) : ?>
                            <?php self::render_row((string) $i, $row, $labels); ?>
                        <?php endforeach; ?>
                    </tbody>
                </table>
                </div>
                <p>
                    <button type="button" class="button" id="dcc-seasons-add-row">
                        <?php esc_html_e('Add row', 'dcc-seasons'); ?>
                    </button>
                </p>

                <?php self::render_resolved($opt['schedule'], $labels); ?>

                <script type="text/html" id="dcc-seasons-row-template">
                    <?php self::render_row('__i__', ['start' => ['on' => 'fixed', 'm' => 1, 'd' => 1, 'off' => 0], 'end' => ['on' => 'fixed', 'm' => 1, 'd' => 1, 'off' => 0], 'theme' => 'classic', 'label' => '', 'year' => 0], $labels); ?>
                </script>

                <h2><?php esc_html_e('Theme preview', 'dcc-seasons'); ?></h2>
                <p class="description">
                    <?php
                    printf(
                        /* translators: 1: example URL parameter, 2: "off" parameter */
                        esc_html__('Append %1$s to any front-end URL to force that theme for the page view — ambient runs in that theme and the tap-the-logo egg uses its Matrix palette. %2$s forces no theme. Works only for logged-in administrators (manage_options, verified server-side); visitors always get the date-driven schedule.', 'dcc-seasons'),
                        '<code>?dcc_season=halloween</code>',
                        '<code>?dcc_season=off</code>'
                    );
                    ?>
                </p>
                <div class="dcc-seasons-scroll">
                <table class="widefat striped dcc-seasons-preview-keys">
                    <thead>
                        <tr>
                            <th><?php esc_html_e('Theme key', 'dcc-seasons'); ?></th>
                            <th><?php esc_html_e('Theme', 'dcc-seasons'); ?></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($labels as $key => $label) : ?>
                            <tr>
                                <td><code>?dcc_season=<?php echo esc_html($key); ?></code></td>
                                <td><?php echo esc_html($label); ?></td>
                            </tr>
                        <?php endforeach; ?>
                        <tr>
                            <td><code>?dcc_season=off</code></td>
                            <td><?php esc_html_e('No theme (no ambient; egg falls back to classic green)', 'dcc-seasons'); ?></td>
                        </tr>
                    </tbody>
                </table>
                </div>

                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    /**
     * One schedule table row.
     *
     * @param string                $index  Array index placeholder.
     * @param array                 $row    start/end/theme/label.
     * @param array<string, string> $labels Theme key => label.
     */
    private static function render_row(string $index, array $row, array $labels): void {
        $name = self::OPTION . '[schedule][' . $index . ']';
        $none = ['on' => 'fixed', 'm' => 1, 'd' => 1, 'off' => 0];
        ?>
        <tr>
            <td><?php self::render_rule($name . '[start]', is_array($row['start'] ?? null) ? $row['start'] : $none); ?></td>
            <td><?php self::render_rule($name . '[end]', is_array($row['end'] ?? null) ? $row['end'] : $none); ?></td>
            <td>
                <select name="<?php echo esc_attr($name); ?>[theme]">
                    <?php foreach ($labels as $key => $label) : ?>
                        <option value="<?php echo esc_attr($key); ?>" <?php selected($row['theme'] ?? '', $key); ?>>
                            <?php echo esc_html($label); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </td>
            <td>
                <input type="text" name="<?php echo esc_attr($name); ?>[label]"
                       value="<?php echo esc_attr($row['label'] ?? ''); ?>" />
            </td>
            <td>
                <input type="number" class="dcc-seasons-year" name="<?php echo esc_attr($name); ?>[year]" min="2000" max="2100" step="1"
                       value="<?php echo esc_attr(!empty($row['year']) ? (string) (int) $row['year'] : ''); ?>"
                       placeholder="<?php esc_attr_e('every', 'dcc-seasons'); ?>"
                       aria-label="<?php esc_attr_e('Year (blank = every year)', 'dcc-seasons'); ?>" />
            </td>
            <td>
                <button type="button" class="button-link-delete dcc-seasons-remove-row"
                        aria-label="<?php esc_attr_e('Remove row', 'dcc-seasons'); ?>">&#10005;</button>
            </td>
        </tr>
        <?php
    }

    /**
     * One rule editor: [Fixed date | named holiday] [month] [day] [± days].
     */
    private static function render_rule(string $name, array $rule): void {
        $on  = (string) ($rule['on'] ?? 'fixed');
        $off = (int) ($rule['off'] ?? 0);
        $m   = (int) ($rule['m'] ?? 1);
        $d   = (int) ($rule['d'] ?? 1);
        ?>
        <span class="dcc-seasons-rule">
            <select class="dcc-seasons-on" name="<?php echo esc_attr($name); ?>[on]" aria-label="<?php esc_attr_e('Date or holiday', 'dcc-seasons'); ?>">
                <option value="fixed" <?php selected($on, 'fixed'); ?>><?php esc_html_e('Fixed date', 'dcc-seasons'); ?></option>
                <?php foreach (Schedule::anchors() as $key => $a) : ?>
                    <option value="<?php echo esc_attr($key); ?>" <?php selected($on, $key); ?>><?php echo esc_html($a['label']); ?></option>
                <?php endforeach; ?>
            </select>
            <select class="dcc-seasons-md" name="<?php echo esc_attr($name); ?>[m]" aria-label="<?php esc_attr_e('Month', 'dcc-seasons'); ?>" <?php echo $on === 'fixed' ? '' : 'hidden'; ?>>
                <?php for ($i = 1; $i <= 12; $i++) : ?>
                    <option value="<?php echo (int) $i; ?>" <?php selected($m, $i); ?>><?php echo esc_html(date_i18n('M', mktime(12, 0, 0, $i, 1, 2001))); ?></option>
                <?php endfor; ?>
            </select>
            <select class="dcc-seasons-md" name="<?php echo esc_attr($name); ?>[d]" aria-label="<?php esc_attr_e('Day', 'dcc-seasons'); ?>" <?php echo $on === 'fixed' ? '' : 'hidden'; ?>>
                <?php for ($i = 1; $i <= 31; $i++) : ?>
                    <option value="<?php echo (int) $i; ?>" <?php selected($d, $i); ?>><?php echo (int) $i; ?></option>
                <?php endfor; ?>
            </select>
            <input type="number" class="dcc-seasons-off" name="<?php echo esc_attr($name); ?>[off]" value="<?php echo (int) $off; ?>" min="-60" max="60" step="1"
                   aria-label="<?php esc_attr_e('Offset in days', 'dcc-seasons'); ?>" />
            <span class="dcc-seasons-off-label"><?php esc_html_e('days', 'dcc-seasons'); ?></span>
        </span>
        <?php
    }

    /**
     * The schedule resolved to real dates for this year and next, plus any
     * days nothing covers. This is how the owner confirms a moveable
     * holiday landed where it should.
     */
    private static function render_resolved(array $rows, array $labels): void {
        $year  = (int) current_time('Y');
        $years = [$year, $year + 1];
        ?>
        <h3><?php echo esc_html(sprintf(/* translators: 1: this year, 2: next year */ __('Resolved dates for %1$d and %2$d', 'dcc-seasons'), $year, $year + 1)); ?></h3>
        <p class="description"><?php esc_html_e('What the rules above come out to. When ranges overlap, the narrowest one wins that day — so a one-day holiday inside a season shows correctly here.', 'dcc-seasons'); ?></p>
        <div class="dcc-seasons-scroll">
        <table class="widefat striped dcc-seasons-resolved">
            <thead><tr>
                <th><?php esc_html_e('Theme', 'dcc-seasons'); ?></th>
                <th><?php esc_html_e('Rule', 'dcc-seasons'); ?></th>
                <?php foreach ($years as $y) : ?><th><?php echo (int) $y; ?></th><?php endforeach; ?>
            </tr></thead>
            <tbody>
            <?php foreach ($rows as $row) : ?>
                <?php if (!is_array($row['start'] ?? null)) { continue; } ?>
                <tr>
                    <td><?php echo esc_html($labels[$row['theme']] ?? $row['theme']); ?><?php if (!empty($row['year'])) : ?> <em><?php echo esc_html(sprintf(/* translators: %d: year */ __('(%d only)', 'dcc-seasons'), (int) $row['year'])); ?></em><?php endif; ?></td>
                    <td><?php echo esc_html(Schedule::describe($row['start']) . ' → ' . Schedule::describe($row['end'])); ?></td>
                    <?php foreach ($years as $y) : ?>
                        <?php $r = Schedule::resolve_row($row, $y); ?>
                        <td><?php echo $r ? esc_html(date_i18n('M j', strtotime($r[0])) . ' – ' . date_i18n('M j, Y', strtotime($r[1]))) : '—'; ?></td>
                    <?php endforeach; ?>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        </div>
        <?php
        foreach ($years as $y) {
            $gaps = self::gaps($rows, $y);
            if ($gaps) {
                echo '<p class="dcc-seasons-gaps">' . esc_html(sprintf(
                    /* translators: 1: year, 2: number of days, 3: first few dates */
                    __('%1$d: %2$d day(s) have no theme (the heron-only default runs): %3$s', 'dcc-seasons'),
                    $y,
                    count($gaps),
                    implode(', ', array_slice($gaps, 0, 6)) . (count($gaps) > 6 ? '…' : '')
                )) . '</p>';
            }
        }
    }

    /** Days of $year no row covers, as 'M j' strings. */
    private static function gaps(array $rows, int $year): array {
        $out = [];
        $d   = new \DateTimeImmutable(sprintf('%04d-01-01', $year));
        $end = new \DateTimeImmutable(sprintf('%04d-12-31', $year));
        while ($d <= $end) {
            if (!Schedule::active($rows, $d->format('Y-m-d'))) {
                $out[] = $d->format('M j');
            }
            $d = $d->modify('+1 day');
        }
        return $out;
    }
}
