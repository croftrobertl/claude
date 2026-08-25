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
        add_action('wp_head', [$this, 'print_layering_css']);
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
        // Resolve against the registered menu so the link follows the page
        // wherever it is parented; fall back if admin_menu hasn't run.
        $url = function_exists('menu_page_url') ? menu_page_url(Settings::SLUG, false) : '';
        if (!$url) {
            $url = admin_url('admin.php?page=' . Settings::SLUG);
        }
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
        if (!$this->should_load()) {
            return;
        }
        $opt = Settings::options();

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
     * "Behind interactive widgets" layering (the default): the ambient
     * canvas sits at z-index 5 (picked engine-side from the config's
     * `layer` key) and the DCC cottage-selector / availability-calendar
     * Elementor wrappers are raised above it on a white backing. This
     * replaces the site-side mu-plugin rule (dcc-ui-tweaks item 3),
     * byte-for-byte for the widget-raising block. Front-end only; not
     * output at all in "In front of everything" mode. The Matrix egg
     * overlay is never routed through this setting.
     */
    public function print_layering_css(): void {
        if (!$this->should_load()) {
            return;
        }
        $opt = Settings::options();
        if ($opt['layering'] !== 'behind') {
            return;
        }
        echo "<style id=\"dcc-seasons-layering\">\n"
            . ".elementor-widget-dccs_selector,\n"
            . ".elementor-widget-dccac_single,\n"
            . ".elementor-widget-mphbac_calendar {\n"
            . "\tposition: relative;\n"
            . "\tz-index: 10;\n"
            . "\tbackground: #fff;\n"
            . "}\n"
            . "</style>\n";
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
     * The single load gate, shared by the script enqueue and the layering
     * CSS so an out-of-scope page carries ZERO Seasons bytes — no loader,
     * no inline config, no inline style. Order matters:
     *
     * 1. master switches   — nothing to load at all
     * 2. hard exclusions   — checkout / Elementor, and they beat everything,
     *                        including an admin preview and a scope of "all"
     * 3. admin preview     — ?dcc_season= bypasses the SCOPE gate, never the
     *                        exclusions
     * 4. scope             — the owner's "Where effects appear" choice
     */
    private function should_load(): bool {
        $opt = Settings::options();

        if (empty($opt['enabled']) || (empty($opt['ambient']) && empty($opt['egg']))) {
            return false;
        }
        if ($this->is_excluded()) {
            return false;
        }
        if ($this->preview_theme() !== null) {
            return true;
        }
        return $this->in_scope();
    }

    /**
     * Is the current request inside the owner's chosen scope?
     *
     * This check is deliberately SERVER-side, unlike the theme schedule.
     * The doctrine that PHP must not bake decisions into cached HTML exists
     * for DATE-dependent logic — which season is active today — and that
     * still ships to the client untouched. Scope depends only on which URL
     * is being rendered, which is exactly what a full-page cache keys on: a
     * cached homepage is only ever served as the homepage. So deciding it
     * here is cache-safe, and it's the only way to spend zero bytes on an
     * out-of-scope page.
     *
     * Changing the setting does invalidate already-cached pages, which is
     * why saving the options purges the page cache (see Cache_Purge).
     */
    private function in_scope(): bool {
        $scope = (string) Settings::options()['scope'];

        /**
         * Filter whether the current request is inside the effects scope.
         *
         * Runs alongside — never instead of — dcc_seasons_is_excluded: the
         * hard exclusions are applied first and this filter cannot re-enable
         * effects on the checkout or in the Elementor editor.
         *
         * @param bool   $in_scope
         * @param string $scope Stored setting: home|no_cottages|pages|all.
         */
        return (bool) apply_filters('dcc_seasons_in_scope', $this->scope_allows($scope), $scope);
    }

    /**
     * The scope matrix. Tiers are strictly nested
     * (home < no_cottages < pages < all), so a wider tier never loses a
     * context a narrower one had.
     *
     *                              home  no_cottages  pages  all
     *   front page / homepage       Y         Y         Y     Y
     *   `page` post type            -         Y         Y     Y
     *   cottage (mphb_room_type)    -         -         Y     Y
     *   blog post / other CPT       -         -         -     Y
     *   archives, search, 404,
     *   blog index                  -         -         -     Y
     */
    private function scope_allows(string $scope): bool {
        if (is_front_page()) {
            return true;
        }
        if ($scope === 'home') {
            return false;
        }
        if ($this->is_cottage()) {
            return $scope === 'pages' || $scope === 'all';
        }
        if (is_page()) {
            return true; // no_cottages, pages, all
        }
        return $scope === 'all';
    }

    /**
     * Is this a single cottage (MotoPress accommodation) page?
     *
     * Matched by POST TYPE, never by slug or URL: the live slugs don't line
     * up with cottage numbers (/accommodation/cottage-34/ serves room type
     * 1607), so slug logic looks right in testing and is wrong in
     * production. MotoPress's own API is asked first in case it ever renames
     * the type; the literal is the documented fallback.
     */
    private function is_cottage(): bool {
        return is_singular(self::cottage_post_types());
    }

    /**
     * @return string[] Post types treated as cottage pages.
     */
    private static function cottage_post_types(): array {
        $type = '';

        if (function_exists('MPHB')) {
            try {
                $mphb = MPHB();
                if (is_object($mphb) && method_exists($mphb, 'postTypes')) {
                    $types = $mphb->postTypes();
                    if (is_object($types) && method_exists($types, 'roomType')) {
                        $cpt = $types->roomType();
                        if (is_object($cpt) && method_exists($cpt, 'getPostType')) {
                            $type = (string) $cpt->getPostType();
                        }
                    }
                }
            } catch (\Throwable $e) {
                $type = ''; // MotoPress internals changed - fall through.
            }
        }
        if ($type === '' && defined('\MPHB\PostTypes\RoomTypeCPT::POST_TYPE')) {
            $type = (string) constant('\MPHB\PostTypes\RoomTypeCPT::POST_TYPE');
        }
        if ($type === '') {
            $type = 'mphb_room_type';
        }

        /**
         * Filter the post types treated as cottage pages by the scope gate.
         *
         * @param string[] $types
         */
        $types = apply_filters('dcc_seasons_cottage_post_types', [$type]);

        return array_values(array_filter(array_map('strval', (array) $types)));
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
            'layer'       => $opt['layering'] === 'behind' ? 1 : 0,
            'visual'      => [
                'richness'    => (string) $opt['richness'],
                'reflections' => !empty($opt['fx_reflections']),
                'vignettes'   => !empty($opt['fx_vignettes']),
                'pointer'     => !empty($opt['fx_pointer']),
                'evening'     => !empty($opt['fx_evening']),
                'snow'        => !empty($opt['fx_snow']),
            ],
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
