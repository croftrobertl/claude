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

    /** Stores the version last seen running, to detect an install/upgrade. */
    public const VERSION_OPTION = 'dcc_seasons_version';

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
            add_action('admin_init', [$this, 'maybe_purge_after_upgrade'], 1);
            Settings::init();
            add_filter(
                'plugin_action_links_' . plugin_basename(DCC_SEASONS_FILE),
                [$this, 'action_links']
            );
        }
    }

    /**
     * Purge the page cache when the installed version changes.
     *
     * Uploading a new zip does not invalidate anything by itself: cached
     * HTML keeps the OLD inline config and the OLD asset URL (the ?ver=
     * query is the plugin version), so the site can go on serving
     * engine.min.js?ver=<previous> until something purges. Purge-on-save
     * only fires when the SETTINGS are saved, which an upgrade doesn't do.
     *
     * Comparing a stored version against the constant catches every route
     * in — Plugins → Upload, an auto-update, or files dropped over FTP —
     * where hooking the upgrader alone would miss the last of those.
     */
    public function maybe_purge_after_upgrade(): void {
        $seen = get_option(self::VERSION_OPTION);
        if ($seen === DCC_SEASONS_VERSION) {
            return;
        }
        update_option(self::VERSION_OPTION, DCC_SEASONS_VERSION, false);
        if ($seen === false) {
            return; // First ever run: nothing cached under a previous version.
        }
        Cache_Purge::purge_and_report();
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
     * `layer` key) and the DCC interactive widgets are raised above it so
     * nothing is ever drawn on top of a control a guest is reading.
     *
     * WHAT ACTUALLY OCCLUDES THE CANVAS — measured, not assumed. The canvas
     * is position:fixed with z-index 5, so it paints above every ordinary
     * page background: sections, containers and the theme's own chrome are
     * not positioned and cannot cover it. The ONLY things that occlude it
     * are elements raised into their own stacking context above 5 — which
     * means these widgets, and only what those widgets actually paint.
     *
     * Through 3.5.0 this block also set `background: #fff` on the widget
     * WRAPPER — the full bounding rectangle, not the controls. A hit-test
     * (canvas filled solid, screenshot, count reachable pixels inside each
     * wrapper) measured the result at 0.0% of the wrapper reachable on both
     * desktop and 375px: the widgets were not "in front of" the particles,
     * they were a pair of large opaque rectangles hiding them. Dropping that
     * one declaration takes the same measurement to 22.0% desktop / 24.8%
     * mobile on a widget whose own root is transparent — the padding, the
     * grid gaps and the rounded-corner margins — while painted cards, cells
     * and text still measure 0.0%. Widgets that paint their own background
     * keep it, so nothing looks different.
     *
     * No `background` is declared here on purpose: an explicit
     * `background: transparent` would silently wipe any wrapper background
     * the owner set in Elementor.
     *
     * Since 3.6.1 the canvas is normally mounted inside the theme's content
     * column at z-index -1, where every in-flow element already paints above
     * it and this rule is inert. It is kept because it is exactly what
     * protects the widgets on the fallback path, when no backdrop host is
     * found and the canvas goes back on the body at z-index 5.
     *
     * Front-end only; not output at all in "In front of everything" mode,
     * which is what makes a stale cached page detectable — if the style tag
     * is present in `front` mode, you are looking at cached HTML.
     */
    public function print_layering_css(): void {
        if (!$this->should_load()) {
            return;
        }
        $opt = Settings::options();
        if ($opt['layering'] !== 'behind') {
            return;
        }

        /*
         * ---- The one block that knows about other plugins' markup ----
         * Attribute-prefix matching rather than exact class names, so the
         * DCC family can add or rename widgets without a release here:
         * `elementor-widget-dcc*` covers the cottage selector, the single
         * availability widget and the guest guide; `elementor-widget-mphbac*`
         * covers the availability calendar. Filterable for anything else.
         */
        $selectors = apply_filters('dcc_seasons_layering_selectors', [
            '[class*="elementor-widget-dcc"]',
            '[class*="elementor-widget-mphbac"]',
        ]);
        // NOT esc_html'd: entities are not decoded inside <style>, so escaping
        // the quotes in [class*="…"] would break the rule outright. A CSS
        // selector cannot legally contain "<", so dropping any that does is
        // both sufficient to keep the block unclosable and harmless.
        $selectors = array_filter(
            array_map(static fn($sel) => trim(preg_replace('/[\x00-\x1F\x7F]/', '', (string) $sel)), (array) $selectors),
            static fn($sel) => $sel !== '' && strpos($sel, '<') === false
        );
        $selectors = array_values($selectors);
        if (!$selectors) {
            return;
        }

        echo "<style id=\"dcc-seasons-layering\">\n"
            . implode(",\n", $selectors) . " {\n"
            . "\tposition: relative;\n"
            . "\tz-index: 10;\n"
            . "}\n"
            . "</style>\n";
    }

    /**
     * '.min' in production, '' under SCRIPT_DEBUG. Regenerate the minified
     * files after editing the sources with EXACTLY this command per file, so
     * size comparisons between releases are like-for-like (engine.min.js's
     * build flags were not recorded before 3.6.0, which made the 3.5.0 file
     * unreproducible and its size incomparable):
     *
     * npx terser assets/js/<name>.js -c passes=3 -m --safari10 \
     *     -d __DCC_DEBUG__=false -o assets/js/<name>.min.js
     *
     * for <name> in ambient, engine, matrix.
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
            /**
             * CSS selector for the element the ambient canvas is mounted
             * inside in "behind" mode — the one that paints the opaque
             * content column. Empty (the default) means the engine finds it
             * by walking up from the page's content anchor, so a theme
             * change usually needs nothing here; set it if a theme's markup
             * defeats the walk.
             *
             * @param string $selector
             */
            'backdropHost' => (string) apply_filters('dcc_seasons_backdrop_host', ''),
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
