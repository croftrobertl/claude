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
    public const CHECK_KEY_OPTION = 'dcc_seasons_check_key';
    /**
     * Seconds between appearances after the first hero and first scene:
     * one every 60-90 s, hero and scene taking turns (Rob, 4.8.0). A code
     * default, not a setting; the engine and the Theme guide both read it.
     * Was HERO_EVERY = [120, 180], heroes only, until 4.7.1.
     */
    public const EVERY = [60, 90];

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
        add_action('template_redirect', [$this, 'no_cache_for_checks'], 0);
        add_action('wp_head', [$this, 'print_layering_css']);
        // Runs even when nothing else does — see print_diag_stub().
        add_action('wp_footer', [$this, 'print_diag_stub'], 99);
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

        /*
         * No stored version means one of two very different things, and
         * telling them apart matters: this option only exists from 3.6.1, so
         * EVERY upgrade from an earlier release arrives here with $seen ===
         * false — including the one this feature was written for. Treating
         * that as "first install" would skip the purge exactly when it is
         * needed. A saved options row is the tell: it means the plugin has
         * run here before, so there is cached HTML carrying the old inline
         * config and the old ?ver= asset URL.
         */
        if ($seen === false && get_option(Settings::OPTION) === false) {
            return; // Genuinely first install: nothing cached under a previous version.
        }
        // Bring the stored schedule forward, once per upgrade: the 3.7.0
        // row-shape migration (options() also migrates on read), then rows
        // for the themes each release being upgraded THROUGH introduced.
        //
        // That second step is why six themes shipped in 3.7.0 and never
        // displayed on the live install: migrate() only replaces a schedule
        // it recognises as the unmodified old default, and the owner's was
        // edited, so it was converted row for row and the new themes were
        // never given rows. Nothing reported it. See
        // Schedule::apply_new_themes() — and note that it is scoped BY
        // VERSION on purpose, so a row the owner deleted is never re-added.
        $stored = get_option(Settings::OPTION);
        if (is_array($stored) && !empty($stored['schedule']) && is_array($stored['schedule'])) {
            $rows = $stored['schedule'];
            if (Schedule::is_legacy_row($rows[0] ?? null)) {
                $rows = Schedule::migrate($rows, Themes::legacy_default_schedule());
            }
            $rows = Schedule::apply_new_themes($rows, $seen, DCC_SEASONS_VERSION);
            /* 4.13.0: Rob re-cut the calendar, so a stored schedule comes
             * with it — but ONLY where the row still carries the old
             * default's rules. A row he edited is left alone and reported,
             * because a calendar that quietly disagrees with the person who
             * set it is worse than one that is out of date. */
            $kept = [];
            $rows = Schedule::apply_calendar($rows, $seen, DCC_SEASONS_VERSION, $kept);
            foreach ($kept as $k) {
                error_log(sprintf(
                    'DCC Seasons: the calendar changed in this release, but your "%s" row is not the one it replaced, so it was left exactly as you set it.',
                    (string) ($k['theme'] ?? '?')
                ));
            }
            if ($rows !== $stored['schedule']) {
                $stored['schedule'] = $rows;
                update_option(Settings::OPTION, $stored);
            }
        }

        /*
         * Persist any DEFAULT KEYS the stored row is missing.
         *
         * options() merges defaults on every read, so a missing key has
         * never broken anything — but the row only gained the keys a
         * release added once someone opened the settings page and saved. On
         * the live site the 4.0.0 row was still missing placement, subtle,
         * subtle_intensity and subtle_map days after the upgrade.
         *
         * That gap is a trap rather than a bug: it means the DB does not
         * describe the site's actual behaviour, so anything reading the
         * option directly — a migration, an export, a future getter that
         * forgets to merge — sees a feature as absent when it is running.
         * Writing the keys once per upgrade makes the row tell the truth.
         *
         * Only ADDS. An existing value is never touched, so this can never
         * overwrite a choice the owner made, and a key they deliberately
         * set to a falsy value stays falsy.
         */
        /*
         * Settings::TRACKED_DEFAULTS are the exception to the paragraph
         * above: they are stored only when they DIFFER from the default, so
         * a stored copy that merely equals the default is cleared here (it
         * would freeze today's default into the row and stop a later one
         * from reaching the site), and the fill below never writes them.
         * A value the owner chose that differs is never touched.
         *
         * 4.7.0: on the live site this clears tap_selector and tap_count,
         * which the Director had set to exactly the new defaults.
         */
        if (is_array($stored)) {
            $cleared = [];
            foreach (Settings::TRACKED_DEFAULTS as $key) {
                if (array_key_exists($key, $stored) && Settings::is_default_value($key, $stored[$key])) {
                    unset($stored[$key]);
                    $cleared[] = $key;
                }
            }
            if ($cleared) {
                update_option(Settings::OPTION, $stored);
                if (function_exists('error_log')) {
                    error_log('DCC Seasons: cleared stored option keys equal to their defaults on upgrade to '
                        . DCC_SEASONS_VERSION . ': ' . implode(', ', $cleared));
                }
            }
        }

        if (is_array($stored)) {
            $added = [];
            foreach (Settings::defaults() as $key => $value) {
                if (in_array($key, Settings::TRACKED_DEFAULTS, true)) {
                    continue;
                }
                if (!array_key_exists($key, $stored)) {
                    $stored[$key] = $value;
                    $added[] = $key;
                }
            }
            if ($added) {
                update_option(Settings::OPTION, $stored);
                if (function_exists('error_log')) {
                    error_log('DCC Seasons: added missing default option keys on upgrade to '
                        . DCC_SEASONS_VERSION . ': ' . implode(', ', $added));
                }
            }
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
        // "Active" in the plugins list means loaded, not working: a switched
        // off Seasons looks identical there. Say so where someone goes when
        // a plugin appears to do nothing.
        $opt = Settings::options();
        if (empty($opt['enabled'])) {
            array_unshift(
                $links,
                '<span style="color:#b32d2e;font-weight:600">' . esc_html__('Switched OFF', 'dcc-seasons') . '</span>'
            );
        }
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
    public static function suffix(): string {
        return (defined('SCRIPT_DEBUG') && SCRIPT_DEBUG) ? '' : '.min';
    }

    /**
     * ?dcc_debug=1 when the plugin is NOT rendering: a server-side panel
     * saying exactly why, printed by PHP because the engine that normally
     * draws the diagnostics is precisely what did not load.
     *
     * This is the fix for the worst failure in the plugin's history. The
     * live install had enabled = 0, so enqueue() returned before printing
     * anything: no window.DCC_SEASONS, no scripts, no canvas — and, because
     * the panel was drawn client-side by the engine, no diagnostics either.
     * ?dcc_debug=1 rendered nothing at all. Three rounds of work went into
     * "why doesn't behind layering work on the live site" while the real
     * answer was that the plugin was switched off. A diagnostic that goes
     * silent in exactly the state you need it for is worse than none.
     */
    public function print_diag_stub(): void {
        if (!$this->diag_requested() || $this->should_load()) {
            return;
        }
        $opt   = Settings::options();
        $scope = (string) ($opt['scope'] ?? 'all');
        $why   = '';
        if (empty($opt['enabled'])) {
            $why = __('DCC Seasons is SWITCHED OFF (Master enable). Nothing renders on this site: no config, no scripts, no canvas, no easter egg.', 'dcc-seasons');
        } elseif (!Settings::engine_needed($opt) && empty($opt['egg'])) {
            $why = __('Everything is switched off (falling sprites, background layer, easter egg, and heroes at Minimal richness), so there is nothing to render.', 'dcc-seasons');
        } elseif ($this->is_excluded()) {
            $why = __('This page is hard-excluded (checkout, or the Elementor editor). Exclusions beat every other setting, including a preview.', 'dcc-seasons');
        } else {
            $why = __('This page is outside "Where effects appear".', 'dcc-seasons');
        }
        $yes  = __('yes', 'dcc-seasons');
        $no   = __('no', 'dcc-seasons');
        $rows = [
            __('Master enable', 'dcc-seasons')      => empty($opt['enabled']) ? __('OFF', 'dcc-seasons') : __('on', 'dcc-seasons'),
            __('Falling sprites', 'dcc-seasons')    => empty($opt['ambient']) ? __('off', 'dcc-seasons') : __('on', 'dcc-seasons'),
            __('Background layer', 'dcc-seasons')   => empty($opt['subtle']) ? __('off', 'dcc-seasons') : __('on', 'dcc-seasons'),
            __('Easter egg', 'dcc-seasons')         => empty($opt['egg']) ? __('off', 'dcc-seasons') : __('on', 'dcc-seasons'),
            __('Hard-excluded page', 'dcc-seasons') => $this->is_excluded() ? $yes : $no,
            __('Where effects appear', 'dcc-seasons') => $scope,
            __('This URL in scope', 'dcc-seasons')  => $this->in_scope() ? $yes : $no,
            __('Layering', 'dcc-seasons')           => (string) ($opt['layering'] ?? ''),
            __('Schedule rows', 'dcc-seasons')      => (string) count((array) ($opt['schedule'] ?? [])),
            __('Version', 'dcc-seasons')            => DCC_SEASONS_VERSION,
        ];
        echo '<div style="position:fixed;left:12px;bottom:12px;z-index:2147483647;max-width:460px;'
            . 'font:13px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#1d2327;color:#f0f0f1;'
            . 'border:2px solid #d63638;border-radius:6px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.4)">';
        echo '<div style="font-weight:700;margin-bottom:6px">DCC Seasons — ' . esc_html__('nothing is rendering on this page', 'dcc-seasons') . '</div>';
        echo '<div style="margin-bottom:8px">' . esc_html($why) . '</div>';
        echo '<table style="border-collapse:collapse;width:100%">';
        foreach ($rows as $k => $v) {
            echo '<tr><td style="padding:1px 10px 1px 0;opacity:.75">' . esc_html($k) . '</td>'
                . '<td style="padding:1px 0"><code style="background:none;color:#8ed1a0">' . esc_html($v) . '</code></td></tr>';
        }
        echo '</table>';
        echo '<div style="margin-top:8px;opacity:.8">'
            . sprintf(
                /* translators: %s: settings page URL */
                esc_html__('Fix it at %s', 'dcc-seasons'),
                '<a style="color:#72aee6" href="' . esc_url(admin_url('admin.php?page=' . Settings::SLUG)) . '">DCC → Seasons</a>'
            )
            . '</div>';
        echo '</div>';
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

        if (empty($opt['enabled']) || (!Settings::engine_needed($opt) && empty($opt['egg']))) {
            return false;
        }
        if ($this->is_excluded()) {
            return false;
        }
        if ($this->preview_theme() !== null || $this->diag_requested() || $this->scene_now()) {
            return true;
        }
        return $this->in_scope();
    }

    /**
     * ?dcc_debug=1 for a logged-in administrator. Never true for visitors,
     * so the panel's markup and the flag never reach cached HTML for them.
     */
    /**
     * The staging check key (4.13.2, the Director's ask). A page opened with
     * ?dcc_key=<key> is treated like an administrator's for the PREVIEW only
     * (?dcc_season=, and ?dcc_scene=now below), so a check can run in a
     * fresh browser that is not logged in. Without the key, or with a wrong
     * one, both are ignored and the visitor gets the normal page. The key
     * is DCC_SEASONS_CHECK_KEY from wp-config.php when defined, else a
     * random one the settings page creates and shows; it is never made on
     * the front end, so a site whose settings page was never opened has no
     * key and nothing opens.
     */
    public static function check_key(bool $create = false): string {
        if (defined('DCC_SEASONS_CHECK_KEY')) {
            return (string) DCC_SEASONS_CHECK_KEY;
        }
        $key = (string) get_option(self::CHECK_KEY_OPTION, '');
        if ($key === '' && $create) {
            $key = wp_generate_password(20, false, false);
            update_option(self::CHECK_KEY_OPTION, $key, false);
        }
        return $key;
    }

    private function key_ok(): bool {
        if (!isset($_GET['dcc_key'])) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
            return false;
        }
        $key = self::check_key();
        $given = sanitize_text_field(wp_unslash((string) $_GET['dcc_key'])); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        return strlen($key) >= 12 && hash_equals($key, $given);
    }

    /** A preview may be asked by an administrator or by the check key. */
    private function may_preview(): bool {
        return current_user_can('manage_options') || $this->key_ok();
    }

    /**
     * ?dcc_scene=now (with the key, or as an administrator): play the
     * season's scene about a second after the engine starts, then again
     * shortly after each one ends, instead of waiting its turn.
     */
    private function scene_now(): bool {
        return isset($_GET['dcc_scene']) && $_GET['dcc_scene'] === 'now' && $this->may_preview(); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
    }

    /**
     * ?dcc_date=Y-m-d (4.13.5, with the key, or as an administrator): the
     * page resolves its season as if the visitor's day were that date, so
     * the Anniversary can be checked on staging before 11 Nov. The figures
     * it computes (the year count and the percentages) use the same date.
     * Anything that is not a real calendar date is ignored.
     */
    private function forced_date(): ?string {
        if (!isset($_GET['dcc_date']) || !$this->may_preview()) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
            return null;
        }
        $d = sanitize_text_field(wp_unslash((string) $_GET['dcc_date'])); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            return null;
        }
        return $d;
    }

    /**
     * A page opened with a valid check key is never cached: its config
     * carries the forced theme and scene, which must never reach a guest.
     * (A wrong key gets the normal page, which is safe to cache.)
     */
    public function no_cache_for_checks(): void {
        if (!$this->key_ok()) {
            return;
        }
        if (!defined('DONOTCACHEPAGE')) {
            define('DONOTCACHEPAGE', true);
        }
        nocache_headers();
    }

    private function diag_requested(): bool {
        return isset($_GET['dcc_debug']) && current_user_can('manage_options'); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
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
         * @param string $scope Stored setting:
         *                      home|no_cottages|pages|not_home|all.
         */
        return (bool) apply_filters('dcc_seasons_in_scope', $this->scope_allows($scope), $scope);
    }

    /**
     * The scope matrix. The first four tiers are nested
     * (home < no_cottages < pages < all), but `not_home` is NOT (4.11.0,
     * Rob): it is "All pages" with the homepage taken away, so that Seasons
     * can run on the homepage while the Hero Effects run everywhere else and
     * the two never stack on one page. Read the column, not the order.
     *
     *                              home  no_cottages  pages  not_home  all
     *   front page / homepage       Y         Y         Y        -      Y
     *   `page` post type            -         Y         Y        Y      Y
     *   cottage (mphb_room_type)    -         -         Y        Y      Y
     *   blog post / other CPT       -         -         -        -      Y
     *   archives, search, 404,
     *   blog index                  -         -         -        -      Y
     *
     * The hard exclusions (checkout, booking, payment, the Elementor
     * editor) are applied before this and are unaffected by any tier.
     */
    private function scope_allows(string $scope): bool {
        if (is_front_page()) {
            return $scope !== 'not_home';
        }
        if ($scope === 'home') {
            return false;
        }
        if ($this->is_cottage()) {
            return $scope === 'pages' || $scope === 'not_home' || $scope === 'all';
        }
        if (is_page()) {
            return true; // no_cottages, pages, not_home, all
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
    /**
     * MotoPress's own context predicates, asked before any ID or slug.
     *
     * IDs change — a page gets rebuilt, duplicated, or restored from a
     * backup with a new ID — and a stale ID fails SILENTLY in the worst
     * possible direction: effects come back on the payment form and nothing
     * reports it. A context predicate stays true whatever the ID is.
     *
     * @return bool True if MotoPress says this IS a booking-flow page.
     */
    private function mphb_says_booking_flow(): bool {
        $predicates = [
            'mphb_is_checkout_page',
            'mphb_is_booking_confirmation_page',
            'mphb_is_payment_page',
            'mphb_is_booking_cancellation_page',
            'mphb_is_booking_received_page',
        ];
        foreach ($predicates as $fn) {
            if (!function_exists($fn)) {
                continue;
            }
            try {
                if ($fn()) {
                    return true;
                }
            } catch (\Throwable $e) {
                // A predicate that throws tells us nothing; keep asking.
            }
        }
        return false;
    }

    /**
     * Is this any page in the booking, payment or confirmation flow?
     *
     * Four layers, widest-surviving first: MotoPress's own predicates, the
     * page IDs MotoPress itself reports, the documented slugs, and finally
     * the live page IDs as a last resort. Any one of them is enough.
     */
    private function is_booking_flow(): bool {
        if ($this->mphb_says_booking_flow()) {
            return true;
        }

        // IDs MotoPress reports for itself.
        $page_ids = [];
        if (function_exists('MPHB')) {
            try {
                $pages = MPHB()->settings()->pages();
                foreach (['getCheckoutPageId', 'getPaymentPageId', 'getBookingConfirmationPageId',
                          'getReservationReceivedPageId', 'getBookingCancellationPageId'] as $getter) {
                    if (method_exists($pages, $getter)) {
                        $page_ids[] = (int) $pages->$getter();
                    }
                }
            } catch (\Throwable $e) {
                // MotoPress internals changed — the slugs and IDs below stand.
            }
        }

        /**
         * Filter the page IDs treated as the booking flow.
         *
         * The literals are THIS SITE's pages, verified 2026-09-24. They are
         * a fallback for when MotoPress reports nothing, not the primary
         * mechanism — see mphb_says_booking_flow().
         *
         * @param int[] $page_ids
         */
        $page_ids = apply_filters('dcc_seasons_booking_page_ids', array_filter(array_merge($page_ids, [
            2393, // Checkout
            2442, // Payment Request
            1399, // Submit Booking
            2580, // Cottage Cart
            624,  // Confirm Your Booking
            625,  // Booking Confirmed
            626,  // Booking Cancelled
            627,  // Booking Submitted
            623,  // Cancel Booking
        ])));

        if ($page_ids && is_page($page_ids)) {
            return true;
        }

        /**
         * Filter the page slugs treated as the booking flow. Slugs survive
         * an ID change; IDs survive a slug change. Both are cheap.
         *
         * @param string[] $slugs
         */
        $slugs = apply_filters('dcc_seasons_booking_page_slugs', [
            'checkout', 'submit-booking', 'payment-request', 'cottage-cart',
            'confirm-your-booking', 'booking-confirmed', 'booking-cancelled',
            'booking-submitted', 'cancel-booking',
        ]);

        return $slugs && is_page($slugs);
    }

    /** The Guest Guide: a utility guests read, not a surface to decorate. */
    private function is_guest_guide(): bool {
        /** @param int[] $ids */
        $ids = apply_filters('dcc_seasons_guide_page_ids', [4645]);
        if ($ids && is_page($ids)) {
            return true;
        }
        /** @param string[] $slugs */
        $slugs = apply_filters('dcc_seasons_guide_page_slugs', ['guest', 'guest-guide']);
        return $slugs && is_page($slugs);
    }

    /**
     * Does the request match one of the owner's extra excluded paths?
     *
     * Matched against BOTH the request path and the queried page slug: a
     * page can be reached at a path that is not its slug, and a slug can be
     * reached at a path that is not the page.
     */
    private function matches_excluded_path(string $stored): bool {
        $lines = array_filter(array_map('trim', preg_split('/[\r\n]+/', $stored)));
        if (!$lines) {
            return false;
        }
        $req = strtolower((string) wp_parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH)); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
        $req = trim($req, '/');
        $slug = '';
        $qo = get_queried_object();
        if ($qo instanceof \WP_Post) {
            $slug = strtolower((string) $qo->post_name);
        }
        foreach ($lines as $line) {
            $line = strtolower(trim((string) $line, '/'));
            if ($line === '') {
                continue;
            }
            if ($slug !== '' && $slug === $line) {
                return true;
            }
            // Path match: the segment itself, or anything beneath it.
            if ($req === $line || strpos($req . '/', $line . '/') === 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Does the request match one of the owner's excluded page IDs?
     *
     * Asked of the QUERIED OBJECT rather than through is_page(), so it also
     * covers a page reached by something other than the usual page query —
     * and so an ID for a post type this plugin does not otherwise know about
     * still excludes.
     */
    private function matches_excluded_id(string $stored): bool {
        if ($stored === '') {
            return false;
        }
        $ids = array_filter(array_map('intval', preg_split('/[^0-9]+/', $stored)));
        if (!$ids) {
            return false;
        }
        $qo = get_queried_object();
        $current = ($qo instanceof \WP_Post) ? (int) $qo->ID : 0;
        if ($current && in_array($current, $ids, true)) {
            return true;
        }
        /* is_page() as a second opinion: on some query shapes the queried
         * object is not the page even though WordPress considers it one. */
        return is_page($ids);
    }

    private function is_excluded(): bool {
        $excluded = false;
        $opt = Settings::options();

        /* The booking flow is excluded in EVERY scope tier, 'all' included.
         * This is deliberately not a scope tier: scope says which KINDS of
         * page may be decorated, this says which pages never are. */
        if (!empty($opt['exclude_booking']) && $this->is_booking_flow()) {
            $excluded = true;
        }

        if (empty($opt['guide_effects']) && $this->is_guest_guide()) {
            $excluded = true;
        }

        if ($this->matches_excluded_path((string) ($opt['exclude_paths'] ?? ''))) {
            $excluded = true;
        }

        if ($this->matches_excluded_id((string) ($opt['exclude_ids'] ?? ''))) {
            $excluded = true;
        }

        /**
         * Back-compat: the pre-4.1.0 filter name. Anything hooked to it
         * still works, and it still means "never decorate these pages".
         *
         * @param int[] $page_ids
         */
        $legacy = apply_filters('dcc_seasons_excluded_page_ids', []);
        if ($legacy && is_page($legacy)) {
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
    /** Art that lives in its own file (assets/js/art-<pack>.js), fetched by
     * the loader only on the days of a theme that uses it (4.13.4, the
     * split). theme => its packs, in the order they run. 4.13.5: the crane
     * is ONE pack shared by the Anniversary's pair and the Florida Keys
     * `cranes` scene, so the plugin carries one bird. */
    const ART_PACKS = [
        'thanksgiving' => ['thanksgiving'],
        'anniversary'  => ['crane', 'anniversary'],
        'florida_keys' => ['crane'],
    ];

    /** every pack file, once each, in a stable order (the Theme guide) */
    public static function art_files(): array {
        $out = [];
        foreach (self::ART_PACKS as $packs) {
            foreach ($packs as $p) { $out[$p] = $p; }
        }
        return array_values($out);
    }

    /** one pack's URL */
    public static function art_src(string $pack): string {
        return add_query_arg('ver', DCC_SEASONS_VERSION, DCC_SEASONS_URL . 'assets/js/art-' . $pack . self::suffix() . '.js');
    }

    /** theme => URLs of its art files, for the config */
    public static function art_srcs(): array {
        $out = [];
        foreach (self::ART_PACKS as $t => $packs) {
            $out[$t] = array_map([self::class, 'art_src'], $packs);
        }
        return $out;
    }

    private function config(array $opt): array {
        $schedule = Themes::schedule($opt['schedule']);
        $config = [
            'enabled'     => (bool) $opt['enabled'],
            'ambient'     => (bool) $opt['ambient'],   /* falling/drifting sprites only, since 4.5.0 */
            'engine'      => Settings::engine_needed($opt),
            'egg'         => (bool) $opt['egg'],
            'tapSelector' => (string) $opt['tap_selector'],
            'tapCount'    => (int) $opt['tap_count'],
            'tapWindow'   => 3000,
            'density'     => (int) $opt['density'],
            'opacity'     => (float) $opt['opacity'],
            'layer'       => $opt['layering'] === 'behind' ? 1 : 0,
            /**
             * z-index for 'front' placement. Decoration must never outrank
             * anything the visitor needs: at 99990 this canvas drew over the
             * site's severe-weather banner. See the band documented in
             * engine.js.
             *
             * @param int $z
             */
            'frontZ'      => (int) apply_filters('dcc_seasons_front_z', (int) $opt['front_z']),
            /* WHERE on the page the decorations may be. 'footer' mounts the
             * canvas inside the site footer and draws nothing anywhere else;
             * 'content' is the older whole-column backdrop. */
            'placement'   => (string) $opt['placement'],
            /**
             * CSS selector for the footer element the ambient canvas mounts
             * inside under 'footer' placement. ONE copy, here: both the
             * loader (which skips fetching the 182KB engine when nothing
             * matches) and the engine (which mounts into the first match)
             * read this same string, so they cannot disagree about what a
             * footer is.
             *
             * @param string $selector Comma-separated, most specific first.
             */
            'footerSel'   => (string) apply_filters(
                'dcc_seasons_footer_host',
                'footer#colophon, #colophon, footer.site-footer, .site-footer, footer[role="contentinfo"], #footer, footer'
            ),
            /**
             * CSS selector for the site header whose TEXT the Halloween moon
             * and witch pass behind (4.10.1). In front layering the engine
             * cuts the visible letters inside these elements (and their
             * text-shadow) out of the scene, so the page's own title shows
             * through; the header picture stays covered.
             *
             * @param string $selector Comma-separated.
             */
            'headerSel'   => (string) apply_filters(
                'dcc_seasons_header_text',
                '#masthead, header.site-header, header[role="banner"], .elementor-location-header'
            ),
            /**
             * CSS selector for the header picture's FOREGROUND (4.10.4): the
             * things in it that are nearer than the sky, so every scene goes
             * behind them — the seaplane and the fishing catch
             * (dcc-hero-life), the golden-hour reeds, gator and heron
             * (dcc-sun-canal), and anything marked data-dcc-fore. In front
             * layering the engine takes the scene back out wherever these
             * paint, in their exact shape (SVG shapes, img, canvas, video).
             * CSS-painted parts are cut only when they carry
             * data-dcc-fore-box (4.10.5): by their transformed border box,
             * border-radius and box-shadow spread (the plane's banner rope
             * and cloth, the taxi wake). The sky flyers go behind it too.
             *
             * @param string $selector Comma-separated; empty turns it off.
             */
            'foreSel'     => (string) apply_filters(
                'dcc_seasons_foreground',
                '.dcc-hl-wrap, .dcc-gh-fore, [data-dcc-fore], [data-dcc-fore-box]'
            ),
            /**
             * CSS selector for the page's HEADER PICTURE (4.10.7, Rob: the
             * moon and witch belong to the hero banner, not the whole page).
             * The sky scenes (moon and witch, sleigh and moon, doves, flag,
             * cork pop) and the sky flyers (heron, eagle, witch, osprey,
             * sleigh) are drawn on a canvas inside the FIRST match, clipped
             * to its box and scrolling with it; they wait until it is in
             * view, and a page without one has none of them. Falling sprites
             * and the water-line scenes stay full-page.
             *
             * @param string $selector Empty turns the sky off on every page.
             */
            'skySel'      => (string) apply_filters('dcc_seasons_sky', '#header-image-main-inside'),
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
            /* Layer 1 — the subtle layer. The map is sent COMPLETE (the
             * plugin's own choices with the owner's overrides applied), so
             * the engine's mirrored fallback is only ever reached by a
             * cached page whose config predates this key. */
            'subtle'      => [
                'on'        => !empty($opt['subtle']),
                'intensity' => (float) $opt['subtle_intensity'],
                'map'       => Settings::subtle_map($opt),
            ],
            'visual'      => [
                'richness'    => (string) $opt['richness'],
                'reflections' => !empty($opt['fx_reflections']),
                'vignettes'   => !empty($opt['fx_vignettes']),
                'pointer'     => !empty($opt['fx_pointer']),
                'evening'     => !empty($opt['fx_evening']),
            ],
            'schedule'    => $schedule,
            'anchors'     => self::client_anchors(),
            /* The calendar rules' two tables, shipped rather than copied, so
             * ambient.js resolves with exactly what Schedule::active() uses. */
            'holidays'    => Schedule::HOLIDAY_ANCHOR,
            'clashWins'   => Schedule::CLASH_WINS,
            /* Only the themes a page served today could need — the window
             * from yesterday to today + Themes::WINDOW_DAYS, plus the base
             * theme and 'classic' (the egg's fallback). 4.12.1: the full
             * table was 10.0KB of a 16.5KB config on EVERY page, for one
             * theme's worth of use. A preview asks for its own key below. */
            'themes'      => Themes::reachable($schedule),
            'matrixSrc'   => add_query_arg('ver', DCC_SEASONS_VERSION, DCC_SEASONS_URL . 'assets/js/matrix' . self::suffix() . '.js'),
            'engineSrc'   => add_query_arg('ver', DCC_SEASONS_VERSION, DCC_SEASONS_URL . 'assets/js/engine' . self::suffix() . '.js'),
            /* 4.13.4: the seasons whose art is its own file; the loader
             * fetches one only on that season's days (and for a preview) */
            'art'         => self::art_srcs(),
            'every'       => self::EVERY,
            'preview'      => null,
            'previewLabel' => '',
            'version'      => DCC_SEASONS_VERSION,
            /* Admin-only on-page diagnostics (?dcc_debug=1): what the engine
             * found when it looked for a backdrop host, and what it did.
             * Gated server-side exactly like the preview flag. */
            'diag'         => $this->diag_requested(),
            'sceneNow'     => $this->scene_now(),
            'date'         => null,
            'i18n'        => [
                'close'         => __('Close', 'dcc-seasons'),
                'eggLabel'      => __('Seasonal Matrix easter egg', 'dcc-seasons'),
                'banner'        => __('Seasonal mode', 'dcc-seasons'),
                'bannerReduced' => __('Animation is off because your device prefers reduced motion.', 'dcc-seasons'),
            ],
        ];

        /* the check link's forced date: its themes ride along with today's */
        $forced = $this->forced_date();
        if ($forced !== null) {
            $config['date']   = $forced;
            $config['themes'] = Themes::reachable($schedule, $forced) + $config['themes'];
        }

        $preview = $this->preview_theme();
        if ($preview !== null) {
            $config['preview']      = $preview['key'];
            $config['previewLabel'] = $preview['label'];
            /* A preview (or a Theme guide ?dcc_season= link) may name any
             * theme, including one outside the shipped window — so carry its
             * definition too. Admin-only, and the key is validated against
             * the full table in preview_theme(). */
            $all = Themes::themes();
            if (isset($all[$preview['key']]) && !isset($config['themes'][$preview['key']])) {
                $config['themes'][$preview['key']] = $all[$preview['key']];
            }
        }

        /**
         * Filter the full client config (schedule, themes, tap settings…).
         *
         * @param array $config
         */
        return apply_filters('dcc_seasons_config', $config);
    }

    /**
     * Anchor definitions the client resolver needs — type and parameters
     * only, no labels. Cache-safe: nothing here depends on today.
     *
     * @return array<string, array>
     */
    private static function client_anchors(): array {
        $out = [];
        foreach (Schedule::anchors() as $key => $a) {
            unset($a['label']);
            $out[$key] = $a;
        }
        return $out;
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
        if (!isset($_GET['dcc_season']) || !$this->may_preview()) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
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
