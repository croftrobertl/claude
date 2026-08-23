<?php
/**
 * Singleton orchestrator: frontend enqueue, exclusions, JS config.
 *
 * @package DCC_Seasons
 */

namespace DCC_Seasons;

if (!defined('ABSPATH')) {
    exit;
}

final class Plugin {

    private static ?Plugin $instance = null;

    public static function instance(): Plugin {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
    }

    public function boot(): void {
        add_action('init', [$this, 'load_textdomain']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue']);
        Preview::init();

        if (is_admin()) {
            Settings::init();
            add_filter(
                'plugin_action_links_' . plugin_basename(DCC_SEASONS_FILE),
                [$this, 'action_links']
            );
        }
    }

    public function load_textdomain(): void {
        load_plugin_textdomain(
            'dcc-seasons',
            false,
            dirname(plugin_basename(DCC_SEASONS_FILE)) . '/languages'
        );
    }

    /**
     * Add a "Settings" link on the Plugins screen row.
     *
     * @param string[] $links
     * @return string[]
     */
    public function action_links(array $links): array {
        $url = admin_url('options-general.php?page=dcc-seasons');
        array_unshift(
            $links,
            '<a href="' . esc_url($url) . '">' . esc_html__('Settings', 'dcc-seasons') . '</a>'
        );
        return $links;
    }

    /**
     * Enqueue the small deferred ambient loader with its inline JSON config.
     * The Matrix engine is NOT enqueued — the loader lazy-loads it on the
     * 5th tap only.
     */
    public function enqueue(): void {
        $opt = Settings::options();

        if (empty($opt['enabled']) || (empty($opt['ambient']) && empty($opt['egg']))) {
            return;
        }
        if ($this->is_excluded()) {
            return;
        }

        wp_enqueue_script(
            'dcc-seasons',
            DCC_SEASONS_URL . 'assets/js/ambient' . self::suffix() . '.js',
            [],
            DCC_SEASONS_VERSION,
            ['in_footer' => true, 'strategy' => 'defer']
        );

        wp_add_inline_script(
            'dcc-seasons',
            'window.DCC_SEASONS = ' . wp_json_encode($this->config($opt)) . ';',
            'before'
        );
    }

    /**
     * '.min' in production, '' under SCRIPT_DEBUG. Regenerate the minified
     * files after editing the sources:
     * npx terser assets/js/ambient.js -c -m --safari10 -o assets/js/ambient.min.js
     * npx terser assets/js/matrix.js  -c -m --safari10 -o assets/js/matrix.min.js
     */
    private static function suffix(): string {
        return (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? '' : '.min';
    }

    /**
     * Pages that must never get effects: the MotoPress checkout and the
     * Elementor editor/preview. Both filterable.
     */
    private function is_excluded(): bool {
        $excluded = false;

        // MotoPress checkout page (never distract the booking flow).
        $page_ids = [];
        if (function_exists('MPHB')) {
            try {
                $page_ids[] = (int) MPHB()->settings()->pages()->getCheckoutPageId();
            } catch (\Throwable $e) {
                // MotoPress internals changed — fall through to the filter.
            }
        }

        /**
         * Filter the page IDs excluded from all DCC Seasons effects.
         *
         * @param int[] $page_ids Defaults to the MotoPress checkout page.
         */
        $page_ids = apply_filters('dcc_seasons_excluded_page_ids', $page_ids);

        if (($page_ids && is_page($page_ids)) || is_page('submit-booking')) {
            $excluded = true;
        }

        // Elementor editor and preview frames.
        if (did_action('elementor/loaded') && class_exists('\Elementor\Plugin')) {
            $elementor = \Elementor\Plugin::$instance;
            if (
                (isset($elementor->editor) && $elementor->editor->is_edit_mode())
                || (isset($elementor->preview) && $elementor->preview->is_preview_mode())
            ) {
                $excluded = true;
            }
        }
        if (isset($_GET['elementor-preview'])) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
            $excluded = true;
        }

        /**
         * Final say on whether the current request gets effects.
         *
         * @param bool $excluded
         */
        return (bool) apply_filters('dcc_seasons_is_excluded', $excluded);
    }

    /**
     * Build the JSON config the ambient loader reads. Cache-safe: identical
     * markup on every request regardless of date — the browser picks the
     * active schedule row from its own local clock.
     *
     * @param array $opt Sanitized options.
     * @return array
     */
    private function config(array $opt): array {
        $config = [
            'enabled'     => (bool) $opt['enabled'],
            'ambient'     => (bool) $opt['ambient'],
            'egg'         => (bool) $opt['egg'],
            'tapSelector' => (string) $opt['tap_selector'],
            'tapFallback' => '#masthead',
            'tapCount'    => (int) $opt['tap_count'],
            'tapWindow'   => 3000,
            'density'     => (int) $opt['density'],
            'opacity'     => (float) $opt['opacity'],
            'schedule'    => Themes::schedule($opt['schedule']),
            'themes'      => Themes::themes(),
            'matrixSrc'   => add_query_arg('ver', DCC_SEASONS_VERSION, DCC_SEASONS_URL . 'assets/js/matrix' . self::suffix() . '.js'),
            'engineSrc'   => add_query_arg('ver', DCC_SEASONS_VERSION, DCC_SEASONS_URL . 'assets/js/engine' . self::suffix() . '.js'),
            'heroEvery'   => [120, 180],
            'preview'      => null,
            'previewLabel' => '',
            'i18n'        => [
                'close'         => __('Close', 'dcc-seasons'),
                'eggLabel'      => __('Seasonal Matrix easter egg', 'dcc-seasons'),
                'banner'        => __('Seasonal mode', 'dcc-seasons'),
                'bannerReduced' => __('Animation is off because your device prefers reduced motion.', 'dcc-seasons'),
            ],
        ];

        $preview = $this->preview_theme();
        if ($preview !== null) {
            $config['preview']      = $preview['key'];
            $config['previewLabel'] = $preview['label'];
        }

        /**
         * Filter the full client config (schedule, themes, tap settings…).
         *
         * @param array $config
         */
        return apply_filters('dcc_seasons_config', $config);
    }

    /**
     * ?dcc_season=<theme_key> forces that theme for this page view (ambient
     * AND egg palette); ?dcc_season=off forces "no theme". Checked
     * SERVER-side: only logged-in users with manage_options ever get the
     * preview flag in their config — visitors can put anything in the URL
     * and receive the normal date-driven config.
     *
     * @return array{key:string,label:string}|null
     */
    private function preview_theme(): ?array {
        if (!isset($_GET['dcc_season']) || !current_user_can('manage_options')) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
            return null;
        }
        $key = sanitize_key(wp_unslash($_GET['dcc_season'])); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        if ($key === 'off') {
            return ['key' => 'off', 'label' => ''];
        }
        if (!array_key_exists($key, Themes::themes())) {
            return null; // unknown key — behave as if no preview was asked
        }
        $labels = Themes::labels();
        return ['key' => $key, 'label' => $labels[$key] ?? $key];
    }
}
