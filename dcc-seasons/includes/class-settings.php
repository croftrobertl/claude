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

    public static function init(): void {
        add_action('admin_menu', [self::class, 'add_page']);
        add_action('admin_init', [self::class, 'register']);
        add_action('admin_enqueue_scripts', [self::class, 'assets']);
    }

    /**
     * Option defaults, including the pre-seeded 2026–27 schedule.
     */
    public static function defaults(): array {
        return [
            'enabled'      => 1,
            'ambient'      => 1,
            'egg'          => 1,
            'tap_selector' => '#branding',
            'tap_count'    => 5,
            'density'      => 10,
            'opacity'      => 0.35,
            'schedule'     => Themes::default_schedule(),
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

        /**
         * Filter the effective plugin options.
         *
         * @param array $opt
         */
        return apply_filters('dcc_seasons_options', $opt);
    }

    public static function add_page(): void {
        add_options_page(
            __('DCC Seasons', 'dcc-seasons'),
            __('DCC Seasons', 'dcc-seasons'),
            'manage_options',
            'dcc-seasons',
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
        if ($hook !== 'settings_page_dcc-seasons') {
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

        $rows       = [];
        $theme_keys = array_keys(Themes::themes());
        if (!empty($in['schedule']) && is_array($in['schedule'])) {
            foreach ($in['schedule'] as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $start = self::valid_date((string) ($row['start'] ?? ''));
                $end   = self::valid_date((string) ($row['end'] ?? ''));
                $theme = sanitize_key((string) ($row['theme'] ?? ''));
                if ($start === '' || $end === '' || !in_array($theme, $theme_keys, true)) {
                    continue;
                }
                if ($end < $start) {
                    [$start, $end] = [$end, $start];
                }
                $rows[] = [
                    'start' => $start,
                    'end'   => $end,
                    'theme' => $theme,
                    'label' => sanitize_text_field((string) ($row['label'] ?? '')),
                ];
            }
        }
        usort($rows, static fn(array $a, array $b): int => strcmp($a['start'], $b['start']));
        $out['schedule'] = $rows;

        return $out;
    }

    /**
     * Validate a Y-m-d date string; returns '' when invalid.
     */
    private static function valid_date(string $date): string {
        $date = trim($date);
        $dt   = \DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        return ($dt && $dt->format('Y-m-d') === $date) ? $date : '';
    }

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
                            <label for="dcc-seasons-tap-selector"><?php esc_html_e('Tap target selector', 'dcc-seasons'); ?></label>
                        </th>
                        <td>
                            <input type="text" class="regular-text code" id="dcc-seasons-tap-selector"
                                   name="<?php echo esc_attr(self::OPTION); ?>[tap_selector]"
                                   value="<?php echo esc_attr($opt['tap_selector']); ?>" />
                            <p class="description"><?php esc_html_e('CSS selector for the element that counts taps. Default #branding (Bravada header logo); #site-title is tried as a fallback.', 'dcc-seasons'); ?></p>
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
                </table>

                <h2><?php esc_html_e('Schedule', 'dcc-seasons'); ?></h2>
                <p class="description">
                    <?php esc_html_e('Date ranges use the VISITOR\'S local date. Rows can be edited freely — future years never need a plugin rebuild. Ranges may span New Year\'s (use full dates).', 'dcc-seasons'); ?>
                </p>

                <table class="widefat striped dcc-seasons-schedule" id="dcc-seasons-schedule">
                    <thead>
                        <tr>
                            <th><?php esc_html_e('Start date', 'dcc-seasons'); ?></th>
                            <th><?php esc_html_e('End date', 'dcc-seasons'); ?></th>
                            <th><?php esc_html_e('Theme', 'dcc-seasons'); ?></th>
                            <th><?php esc_html_e('Label', 'dcc-seasons'); ?></th>
                            <th><span class="screen-reader-text"><?php esc_html_e('Remove', 'dcc-seasons'); ?></span></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($opt['schedule'] as $i => $row) : ?>
                            <?php self::render_row((string) $i, $row, $labels); ?>
                        <?php endforeach; ?>
                    </tbody>
                </table>
                <p>
                    <button type="button" class="button" id="dcc-seasons-add-row">
                        <?php esc_html_e('Add row', 'dcc-seasons'); ?>
                    </button>
                </p>

                <script type="text/html" id="dcc-seasons-row-template">
                    <?php self::render_row('__i__', ['start' => '', 'end' => '', 'theme' => 'classic', 'label' => ''], $labels); ?>
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
        ?>
        <tr>
            <td>
                <input type="date" name="<?php echo esc_attr($name); ?>[start]"
                       value="<?php echo esc_attr($row['start']); ?>" required />
            </td>
            <td>
                <input type="date" name="<?php echo esc_attr($name); ?>[end]"
                       value="<?php echo esc_attr($row['end']); ?>" required />
            </td>
            <td>
                <select name="<?php echo esc_attr($name); ?>[theme]">
                    <?php foreach ($labels as $key => $label) : ?>
                        <option value="<?php echo esc_attr($key); ?>" <?php selected($row['theme'], $key); ?>>
                            <?php echo esc_html($label); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </td>
            <td>
                <input type="text" name="<?php echo esc_attr($name); ?>[label]"
                       value="<?php echo esc_attr($row['label']); ?>" />
            </td>
            <td>
                <button type="button" class="button-link-delete dcc-seasons-remove-row"
                        aria-label="<?php esc_attr_e('Remove row', 'dcc-seasons'); ?>">&#10005;</button>
            </td>
        </tr>
        <?php
    }
}
