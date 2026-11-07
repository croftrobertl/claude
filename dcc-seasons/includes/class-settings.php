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
        add_action('admin_init', [self::class, 'maybe_add_theme_row']);
        add_action('admin_enqueue_scripts', [self::class, 'assets']);
        // The client config is inlined into cached HTML and the scope gate
        // decides server-side whether it is emitted at all, so any save can
        // leave stale pages behind.
        add_action('update_option_' . self::OPTION, [Cache_Purge::class, 'purge_and_report']);
        add_action('add_option_' . self::OPTION, [Cache_Purge::class, 'purge_and_report']);
        add_action('admin_notices', [self::class, 'purge_notice']);
        add_action('admin_notices', [self::class, 'status_notice']);
    }

    /**
     * "Where effects appear" choices, narrowest first — except
     * 'not_home' (4.11.0), which is "All pages" minus the homepage and so
     * is not part of the nesting; it sits after 'pages' because that is
     * where Rob asked for it, and because the Hero Effects mu-plugin
     * (3.14.0) lists the identical option in the same place. The matrix
     * each one covered lived on Plugin::scope_allows(); since 4.15.0 the
     * "Show On" checklist (show_on) is the gate and these are not read.
     *
     * @return array<string, string>
     */
    /**
     * WHERE on a page the ambient decorations are allowed to be. This is a
     * different question from scope(), which decides WHICH PAGES load the
     * plugin at all, and the two are deliberately separate: "homepage only,
     * footer only" is a sentence with two independent halves.
     *
     * @return array<string, string> key => label.
     */
    /**
     * Placement options.
     *
     * NEITHER carries "(recommended)" any more. 'footer' held it until
     * 4.1.0, and that recommendation is what produced the bug the owner
     * reported: footer placement confines the effects to a small box, and
     * with 'behind' layering an opaque section covers what is left. The
     * honest description of the trade is in the help text, not in a label.
     */
    /**
     * Does the effects engine have anything to draw? Since 4.5.0 each layer
     * has its own switch and the engine loads when ANY is on (Rob,
     * 2026-10-06): falling/drifting sprites → 'ambient'; background layer →
     * 'subtle' (at an intensity above 0); corner accents and scenes →
     * Visual richness 'full' (scenes also 'fx_vignettes'); heroes → any
     * richness but 'minimal'. Plugin::config() ships this as CFG.engine and
     * ambient.js fetches the engine on it; should_load() uses it too, so the
     * two cannot disagree.
     */
    public static function engine_needed(array $opt): bool {
        return !empty($opt['ambient'])
            || (!empty($opt['subtle']) && (float) ($opt['subtle_intensity'] ?? 0.6) > 0)
            || (string) ($opt['richness'] ?? 'full') !== 'minimal';
    }

    public static function placements(): array {
        return [
            'content' => __('Across the page content', 'dcc-seasons'),
            'footer'  => __('Site footer only', 'dcc-seasons'),
        ];
    }

    /**
     * The subtle-layer effects the engine implements, for the settings
     * dropdowns and for validating a saved map. Keys must match the SUBTLE
     * registry in assets/js/engine.js.
     */
    public static function subtle_effects(): array {
        return [
            'leaves'     => __('Leaves drifting down (fall)', 'dcc-seasons'),
            'leafbg'     => __('Drawn autumn leaves, small and far (Thanksgiving)', 'dcc-seasons'),
            'blossom'    => __('Blossom petals (spring)', 'dcc-seasons'),
            'dragonheat' => __('Dragonflies over a heat shimmer (summer)', 'dcc-seasons'),
            'hearts'     => __('Hearts', 'dcc-seasons'),
            'confetti'   => __('Confetti', 'dcc-seasons'),
            'embers'     => __('Embers', 'dcc-seasons'),
            'sparks'     => __('Sparks', 'dcc-seasons'),
            'bokeh'      => __('Warm bokeh lights', 'dcc-seasons'),
            // 4.2.0 — no snow anywhere. Rob's four winter picks, each its own
            // named choice rather than a hidden per-theme colour.
            'sunglow'       => __('Winter sun glow', 'dcc-seasons'),
            'goldlight'     => __('Gold & white light', 'dcc-seasons'),
            'mardiconfetti' => __('Mardi Gras confetti', 'dcc-seasons'),
            'orangeblossom' => __('Orange blossom', 'dcc-seasons'),
        ];
    }

    /**
     * The effective theme => effect map: the plugin's own choices, with the
     * owner's overrides on top. A theme the owner has never touched keeps
     * tracking the plugin, so a theme added in a later release arrives with
     * a sensible effect instead of none.
     */
    public static function subtle_map(array $opt): array {
        $map = Themes::subtle_defaults();
        $over = isset($opt['subtle_map']) && is_array($opt['subtle_map']) ? $opt['subtle_map'] : [];
        $known = self::subtle_effects();
        foreach ($over as $theme => $eff) {
            /* An override naming an effect the plugin no longer has — 'snow',
             * retired in 4.2.0 — is ignored on read, so that theme gets its
             * current default. The stored option is never rewritten. */
            $eff = (string) $eff;
            if ($eff !== '' && !isset($known[$eff])) {
                continue;
            }
            $map[(string) $theme] = $eff;
        }
        return $map;
    }

    public static function scopes(): array {
        return [
            'home'         => __('Homepage only', 'dcc-seasons'),
            'no_cottages'  => __('All pages except cottage pages', 'dcc-seasons'),
            'pages'        => __('All pages', 'dcc-seasons'),
            'not_home'     => __('All pages except for homepage', 'dcc-seasons'),
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
            echo '<div class="notice notice-warning dcc-toast-src" data-sticky="1"><p>'
                . esc_html__('Settings saved, but no page cache could be purged automatically. The scope and the other settings are baked into cached pages, so purge your cache manually (SpeedyCache → Purge Cache) for the change to show on already-cached URLs.', 'dcc-seasons')
                . '</p></div>';
            return;
        }
        echo '<div class="notice notice-success dcc-toast-src"><p>'
            /* translators: %s: comma-separated list of caches that were purged. */
            . esc_html(sprintf(__('Settings saved and page cache purged: %s.', 'dcc-seasons'), implode(', ', array_map('strval', (array) $ran))))
            . '</p></div>';
    }

    /**
     * Themes that are BUILT but have no schedule row, so they can never
     * display. Six of these existed on the live install for a full release
     * cycle without a single thing in the admin saying so.
     *
     * Passive on purpose: a missing row can be a deliberate choice (Summer
     * on the Canal is absent here because Florida Keys was preferred as the
     * summer backdrop), so this reports and offers, it never auto-adds.
     * 'classic' is excluded — it is the intentional "None" option.
     *
     * @param array $rows Current schedule.
     * @return array<string, string> theme key => label.
     */
    public static function unscheduled_themes(array $rows): array {
        $have = [];
        foreach ($rows as $row) {
            if (is_array($row) && isset($row['theme'])) {
                $have[(string) $row['theme']] = true;
            }
        }
        $out = [];
        foreach (Themes::labels() as $key => $label) {
            if ($key !== 'classic' && !isset($have[$key])) {
                $out[$key] = $label;
            }
        }
        // A theme added by a filter has a label but no default row; still
        // worth naming, just without a one-click add.
        foreach (array_keys(Themes::themes()) as $key) {
            if ($key !== 'classic' && !isset($have[$key]) && !isset($out[$key])) {
                $out[$key] = $key;
            }
        }
        return $out;
    }

    /**
     * "Add a row for this theme" — an explicit, nonce-checked click, never
     * automatic. Appends the theme's canonical default row (so a moveable
     * holiday gets its real rule, not a guessed date) and saves.
     */
    public static function maybe_add_theme_row(): void {
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- verified immediately below.
        if (!isset($_GET['dcc_add_row'])) {
            return;
        }
        if (!current_user_can('manage_options')) {
            return;
        }
        $theme = sanitize_key(wp_unslash($_GET['dcc_add_row'])); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        check_admin_referer('dcc_add_row_' . $theme);

        $row = Schedule::default_row_for($theme);
        $opt = get_option(self::OPTION);
        if ($row && is_array($opt)) {
            $rows = isset($opt['schedule']) && is_array($opt['schedule']) ? $opt['schedule'] : [];
            $seen = false;
            foreach ($rows as $r) {
                if (is_array($r) && ($r['theme'] ?? '') === $theme) {
                    $seen = true;
                }
            }
            if (!$seen) {
                $rows[]           = $row;
                $opt['schedule']  = $rows;
                update_option(self::OPTION, $opt);
            }
        }
        wp_safe_redirect(add_query_arg(
            ['page' => self::SLUG, 'dcc_added' => $theme],
            admin_url('admin.php')
        ));
        exit;
    }

    /**
     * Two things the owner must not be able to miss, both learned the hard
     * way on the live site:
     *
     * 1. The plugin switched OFF. enabled = 0 means Plugin::enqueue()
     *    returns before anything is printed: no config, no scripts, no
     *    canvas, no egg. That state spent months looking exactly like "the
     *    layering setting doesn't work", and an unticked checkbox halfway
     *    down a settings page said nothing about it.
     * 2. A row was just added from the unscheduled-themes list.
     */
    public static function status_notice(): void {
        if (self::$hook === '' || !function_exists('get_current_screen')) {
            return;
        }
        $screen = get_current_screen();
        if (!$screen || $screen->id !== self::$hook) {
            return;
        }
        $opt = self::options();
        if (empty($opt['enabled'])) {
            echo '<div class="notice notice-error"><p><strong>'
                . esc_html__('DCC Seasons is switched OFF.', 'dcc-seasons') . '</strong> '
                . esc_html__('Nothing renders on the site at all — no ambient canvas, no easter egg, and no scripts on the page. Every other setting below is inert until Master enable is ticked and saved.', 'dcc-seasons')
                . '</p></div>';
        } elseif (!self::engine_needed($opt) && empty($opt['egg'])) {
            echo '<div class="notice notice-error"><p><strong>'
                . esc_html__('Everything is switched off.', 'dcc-seasons') . '</strong> '
                . esc_html__('Seasons is enabled, but the falling sprites, the background layer, the easter egg and (at Minimal richness) the heroes are all off, so there is nothing to render and no scripts are printed.', 'dcc-seasons')
                . '</p></div>';
        }
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display-only.
        $added = isset($_GET['dcc_added']) ? sanitize_key(wp_unslash($_GET['dcc_added'])) : '';
        if ($added !== '') {
            $labels = Themes::labels();
            echo '<div class="notice notice-success is-dismissible"><p>'
                . esc_html(sprintf(
                    /* translators: %s: theme name */
                    __('Added a schedule row for %s, using its default dates. It is on the ribbon below — adjust it if you want, no further save needed.', 'dcc-seasons'),
                    $labels[$added] ?? $added
                ))
                . '</p></div>';
        }
    }

    /**
     * The "built, but never shown" list. See unscheduled_themes().
     *
     * @param array                 $rows   Current schedule.
     * @param array<string, string> $labels Theme key => label.
     */
    private static function render_unscheduled(array $rows, array $labels): void {
        $missing = self::unscheduled_themes($rows);
        if (!$missing) {
            return;
        }
        ?>
        <div class="notice notice-warning inline dcc-seasons-unscheduled">
            <p><strong><?php esc_html_e('Built, but never shown', 'dcc-seasons'); ?></strong></p>
            <p class="description">
                <?php esc_html_e('These themes exist in the plugin but have no row in the schedule above, so they can never display. That may be exactly what you want — a theme with no row is simply switched off. Adding a row uses that theme\'s default dates and saves immediately.', 'dcc-seasons'); ?>
            </p>
            <ul>
                <?php foreach ($missing as $key => $label) : ?>
                    <?php $row = Schedule::default_row_for($key); ?>
                    <li>
                        <strong><?php echo esc_html($label); ?></strong>
                        <?php if ($row) : ?>
                            <?php echo esc_html(' — ' . Schedule::describe($row['start']) . ' → ' . Schedule::describe($row['end'])); ?>
                            <a class="button button-small" href="<?php echo esc_url(wp_nonce_url(
                                add_query_arg(['page' => self::SLUG, 'dcc_add_row' => $key], admin_url('admin.php')),
                                'dcc_add_row_' . $key
                            )); ?>"><?php esc_html_e('Add row', 'dcc-seasons'); ?></a>
                        <?php else : ?>
                            <?php esc_html_e('— no default dates for this theme; add a row by hand above.', 'dcc-seasons'); ?>
                        <?php endif; ?>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>
        <?php
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
     * Keys stored ONLY when they differ from the default, so a site choice
     * Rob makes lives in the plugin's defaults and a later default change
     * reaches the site (his standing rule). sanitize() leaves a value equal
     * to its default out of the saved row, the upgrade routine clears a
     * stored value equal to it (Plugin::maybe_purge_after_upgrade) and never
     * writes it back as a "missing key", and options() merges it in.
     */
    public const TRACKED_DEFAULTS = ['tap_selector', 'tap_count', 'show_on'];

    /**
     * "Show On" (4.15.0, Rob's pick A, 2026-11-03): Seasons runs ONLY on the
     * pages ticked here. Every other page is off until ticked — pages made
     * later and cottage pages included. Tokens: 'home' (the front page,
     * whatever it is) and post IDs (pages and cottage pages).
     *
     * The DEFAULT is Rob's pick: Home, Contact (page 22) and Cottages (page
     * 1005). An ID changes when a page is rebuilt or restored and a stale
     * ID fails silently, so each default ID carries its slug: if the ID is
     * not that published page any more, the page at that slug is used
     * instead (show_on_list()). A list the owner saves is taken as saved.
     */
    public const SHOW_ON_SLUGS = [22 => 'contact', 1005 => 'cottages'];

    /** 'home' first, then unique positive IDs in ascending order. */
    public static function show_on_norm($v): array {
        $home = false;
        $ids  = [];
        foreach ((array) $v as $t) {
            if ($t === 'home') { $home = true; continue; }
            if (is_int($t) || (is_string($t) && ctype_digit($t))) {
                $n = (int) $t;
                if ($n > 0) { $ids[$n] = $n; }
            }
        }
        sort($ids);
        return $home ? array_merge(['home'], array_values($ids)) : array_values($ids);
    }

    /** The default list with each ID checked against its slug. */
    public static function show_on_default(): array {
        $out = [];
        foreach (self::show_on_norm(self::defaults()['show_on']) as $t) {
            if ($t === 'home' || !isset(self::SHOW_ON_SLUGS[$t])) { $out[] = $t; continue; }
            $slug = self::SHOW_ON_SLUGS[$t];
            $p = function_exists('get_post') ? get_post($t) : null;
            if ($p && ($p->post_status ?? 'publish') === 'publish' && (string) ($p->post_name ?? '') === $slug) { $out[] = $t; continue; }
            $q = function_exists('get_page_by_path') ? get_page_by_path($slug) : null;
            $out[] = ($q && !empty($q->ID)) ? (int) $q->ID : $t;
        }
        return self::show_on_norm($out);
    }

    /** The pages Seasons may run on: the saved list, else the default. */
    public static function show_on_list(array $opt): array {
        if (!array_key_exists('show_on', $opt) || $opt['show_on'] === self::defaults()['show_on']) {
            return self::show_on_default();
        }
        return self::show_on_norm($opt['show_on']);
    }

    /** True when a stored value of a tracked key is just its default. */
    public static function is_default_value(string $key, $value): bool {
        if ($key === 'show_on') {
            return is_array($value) && self::show_on_norm($value) === self::show_on_default();
        }
        $d = self::defaults()[$key] ?? null;
        if (is_int($d)) {
            return is_numeric($value) && (int) $value === $d;
        }
        return is_string($value) && trim($value) === $d;
    }

    /**
     * How a guest opens the egg, in words, built from the SETTINGS — every
     * place that tells people how to open it uses this, never a hard-coded
     * "tap the logo five times" (wrong on this site from 4.7.0).
     */
    public static function egg_howto(array $opt): string {
        $n   = max(2, (int) ($opt['tap_count'] ?? 4));
        $sel = trim((string) ($opt['tap_selector'] ?? ''));
        if ($sel === self::defaults()['tap_selector']) {
            /* translators: %d: number of taps */
            return sprintf(_n('Tap the title in the homepage banner %d time', 'Tap the title in the homepage banner %d times', $n, 'dcc-seasons'), $n);
        }
        /* translators: 1: CSS selector, 2: number of taps */
        return sprintf(_n('Tap the element matching %1$s %2$d time', 'Tap the element matching %1$s %2$d times', $n, 'dcc-seasons'), $sel, $n);
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
            'scope'           => 'all',   /* kept, no longer read: "Show On" below is the gate (4.15.0) */
            /* Rob's pick (4.15.0): Home, Contact, Cottages. A TRACKED_DEFAULT:
             * stored only when the owner's ticks differ. See SHOW_ON_SLUGS. */
            'show_on'         => ['home', 22, 1005],
            'placement'       => 'footer',
            /* Rob, 2026-10-10: the title in the homepage banner, tapped 4
             * times. The old default could not work on this site: Bravada
             * hides #site-text (so #site-title is 0x0), #branding is 0 wide,
             * .header-image does not exist, and a bare .entry-title also
             * matched every cottage card title on the homepage. These two
             * are TRACKED_DEFAULTS: stored only when they differ. */
            'tap_selector'    => '.home #header-page-title .entry-title',
            'tap_count'       => 4,
            'density'         => 10,
            'opacity'         => 0.35,
            'richness'        => 'full',
            /* Layer 1, the calm baseline. On by default: it IS the new
             * default face of the site, and an install that upgrades
             * without touching settings should see it. */
            'subtle'          => 1,
            'subtle_intensity' => 0.6,
            /* theme key => effect key. Empty means "use the built-in
             * mapping", so an owner who never opens this setting tracks the
             * plugin's own choices as themes are added. */
            'subtle_map'      => [],
            /* --- Places decoration must not go. ---------------------------
             * These are not a scope TIER. Scope answers "which kinds of page
             * may be decorated"; these answer "which pages are never
             * decorated whatever the scope says", including scope 'all'.
             *
             * The booking flow is the highest-stakes moment in the funnel
             * and animated sprites over a payment form cost trust. Before
             * 4.1.0 only the checkout page itself was excluded, so
             * no_cottages silently decorated Payment Request, Cottage Cart
             * and all six booking confirmation pages. */
            'exclude_booking' => 1,
            /* The Guest Guide is a utility guests consult mid-stay for wifi
             * codes and checkout times, not a showcase. Off by default, but
             * its own toggle so it can be turned back on without code. */
            'guide_effects'   => 0,
            /* Extra paths never decorated, one per line, matched against the
             * request path and the page slug. /staff/ is internal. */
            'exclude_paths'   => "staff",
            /* Extra page IDs never decorated. Separate from exclude_paths
             * because an ID survives a slug rename and a path survives an ID
             * change, and the two failure modes are different — see
             * is_booking_flow(), which uses both for the same reason.
             *
             * 18119 is /explore/, the Wildlife hub. It went live in the site
             * navigation on 2026-09-25 and a mobile audit found the fishing
             * line drawn through the species deck with bobbers parked on
             * tile names. Taps pass through, but it reads as a glitch on a
             * field guide, so the owner excluded it.
             *
             * This is a PAGE ID, deliberately not a dependency on the
             * Wildlife plugin: this plugin should not know that plugin
             * exists, and the page would still want excluding if the hub
             * were rebuilt by hand. */
            'exclude_ids'     => '18119',
            /* The z-index 'front' placement mounts at. The default sits
             * above ordinary content and Elementor sections but below
             * lightboxes (9999), the severe-weather banner (10000) and any
             * consent UI. See the band documented in engine.js. */
            'front_z'         => 9000,
            'fx_reflections'  => 1,
            'fx_vignettes'    => 1,
            'fx_pointer'      => 1,
            'fx_evening'      => 1,
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

    /**
     * The Show On chips (4.18.0, Rob's pick 4; the checklist of 4.15.0):
     * Home, then every published page, then every published cottage page.
     * Each chip IS the old checkbox (same name and value), so the stored
     * list round-trips unchanged. A page that is never decorated shows
     * greyed with a lock and why. The old scope value rides along hidden
     * so it is kept for a rollback (it is no longer read).
     */
    private static function render_show_on(array $opt): void {
        $name  = self::OPTION;
        $list  = self::show_on_list($opt);
        $front = (int) get_option('page_on_front', 0);
        $pages = [];
        foreach (function_exists('get_pages') ? (array) get_pages(['post_status' => 'publish', 'sort_column' => 'post_title']) : [] as $pg) {
            if ((int) $pg->ID === $front) { continue; }
            $pages[] = [(int) $pg->ID, $pg->post_title !== '' ? (string) $pg->post_title : '#' . $pg->ID, (string) $pg->post_name];
        }
        $cottages = [];
        foreach (function_exists('get_posts') ? (array) get_posts(['post_type' => 'mphb_room_type', 'post_status' => 'publish', 'numberposts' => -1, 'orderby' => 'title', 'order' => 'ASC']) : [] as $c) {
            $cottages[] = [(int) $c->ID, $c->post_title !== '' ? (string) $c->post_title : '#' . $c->ID, (string) $c->post_name];
        }
        $reasons = self::lock_reasons();
        $chip = function ($val, string $label, string $slug, string $group, int $pid) use ($name, $list, $opt, $reasons) {
            $lock   = $pid > 0 ? self::page_lock($pid, $slug, $opt) : '';
            $policy = $group === 'page' && self::is_policy_page($pid, $label, $slug);
            $cid    = 'dcc-chip-' . sanitize_key((string) $val);
            echo '<span class="dcc-chip-w' . ($lock !== '' ? ' is-locked' : '') . '" data-group="' . esc_attr($group) . '"' . ($policy ? ' data-policy="1"' : '')
                . ' data-id="' . (int) $pid . '" data-slug="' . esc_attr($slug) . '" data-search="' . esc_attr(strtolower($label . ' ' . $slug)) . '">';
            echo '<label class="dcc-chip" for="' . esc_attr($cid) . '"><input type="checkbox" class="dcc-chip-in" id="' . esc_attr($cid) . '" name="' . esc_attr($name) . '[show_on][]" value="' . esc_attr((string) $val) . '"'
                . (in_array($val, $list, true) ? ' checked' : '') . ($lock !== '' ? ' aria-disabled="true" aria-describedby="dcc-pop-lock-' . esc_attr(sanitize_key((string) $val)) . '"' : '') . '>'
                . '<span class="dcc-chip-lock" aria-hidden="true"></span><span class="dcc-chip-t">' . esc_html($label) . '</span>'
                . ($slug !== '' ? ' <span class="dcc-chip-slug">/' . esc_html($slug) . '/</span>' : '') . '</label>';
            /* The ⓘ for a lock: always present so a lock can come and go
             * as the never-decorate fields change, hidden when unlocked. */
            echo '<button type="button" class="dcc-i dcc-i-lock" aria-expanded="false" aria-controls="dcc-pop-lock-' . esc_attr(sanitize_key((string) $val)) . '"' . ($lock === '' ? ' hidden' : '') . '>'
                . '<span aria-hidden="true">i</span><span class="screen-reader-text">' . esc_html(sprintf(/* translators: %s: page title */ __('Why %s is never decorated', 'dcc-seasons'), $label)) . '</span></button>';
            echo '<span class="dcc-pop dcc-pop-lock" id="dcc-pop-lock-' . esc_attr(sanitize_key((string) $val)) . '" role="note" hidden>' . esc_html($lock !== '' ? $reasons[$lock] : '') . '</span>';
            echo '</span>';
        };
        echo '<input type="hidden" name="' . esc_attr($name) . '[show_on_sent]" value="1">';
        echo '<input type="hidden" name="' . esc_attr($name) . '[scope]" value="' . esc_attr((string) ($opt['scope'] ?? 'all')) . '">';
        echo '<div class="dcc-chip-tools">';
        echo '<label class="screen-reader-text" for="dcc-chip-search">' . esc_html__('Search pages', 'dcc-seasons') . '</label>';
        echo '<input type="search" id="dcc-chip-search" class="dcc-chip-search" placeholder="' . esc_attr__('Search pages', 'dcc-seasons') . '">';
        echo '<button type="button" class="dcc-group-t" data-group="cottage" aria-pressed="false">' . esc_html__('All Cottage Pages', 'dcc-seasons') . '</button>';
        echo '<button type="button" class="dcc-group-t" data-group="policy" aria-pressed="false">' . esc_html__('Policy Pages', 'dcc-seasons') . '</button>';
        self::info('showon', __('Show On', 'dcc-seasons'), [
            esc_html__('Seasons runs only on the pages ticked here. Every other page, including pages added later and cottage pages, stays plain until you tick it. Pages that are never decorated (the booking flow, the Elementor editor, the Guest Guide and the never-decorate lists below) stay off even when ticked. This replaces the old "Where effects appear" choice.', 'dcc-seasons'),
            esc_html__('Saving purges the page cache automatically. Admin theme previews (?dcc_season=) ignore this list, so you can always preview anywhere.', 'dcc-seasons'),
        ]);
        echo '</div>';
        echo '<fieldset class="dcc-seasons-showon dcc-chips" id="dcc-seasons-showon">';
        echo '<legend class="screen-reader-text">' . esc_html__('Show On', 'dcc-seasons') . '</legend>';
        echo '<div class="dcc-chip-set">';
        $chip('home', __('Home (front page)', 'dcc-seasons'), '', 'home', $front);
        foreach ($pages as $p) { $chip($p[0], $p[1], $p[2], 'page', $p[0]); }
        echo '</div>';
        if ($cottages) {
            echo '<h3 class="dcc-chip-h">' . esc_html__('Cottage pages', 'dcc-seasons') . '</h3><div class="dcc-chip-set">';
            foreach ($cottages as $c) { $chip($c[0], $c[1], $c[2], 'cottage', $c[0]); }
            echo '</div>';
        }
        echo '<p class="dcc-chip-none" hidden>' . esc_html__('No page matches.', 'dcc-seasons') . '</p>';
        echo '</fieldset>';
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
        if (Theme_Guide::is_tab()) {
            Theme_Guide::enqueue();
        }
    }

    /** A theme preview as a full, new-tab link (admins only, like the page). */
    private static function preview_link(string $key): string {
        $url = Theme_Guide::preview_url($key);
        return '<a href="' . esc_url($url) . '" target="_blank" rel="noopener">' . esc_html($url) .
            '<span class="screen-reader-text"> ' . esc_html__('(opens in a new tab)', 'dcc-seasons') . '</span></a>';
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
        // TRACKED_DEFAULTS: a value equal to its default is not stored, so
        // options() supplies it and a later default change reaches the site.
        foreach (self::TRACKED_DEFAULTS as $key) {
            if (array_key_exists($key, $out) && self::is_default_value($key, $out[$key])) {
                unset($out[$key]);
            }
        }
        $out['density']   = min(16, max(1, (int) ($in['density'] ?? $d['density'])));

        $opacity        = (float) ($in['opacity'] ?? $d['opacity']);
        $out['opacity'] = min(1.0, max(0.05, round($opacity, 2)));

        $layering        = sanitize_key((string) ($in['layering'] ?? $d['layering']));
        $out['layering'] = in_array($layering, ['behind', 'front'], true) ? $layering : 'behind';

        /* Show On: the ticked pages (4.15.0). The form always sends
         * show_on_sent, so an empty list (nothing ticked) is a real answer;
         * a caller that sends neither keeps the default. Equal to the
         * default is not stored (TRACKED_DEFAULTS). */
        if (isset($in['show_on_sent']) || isset($in['show_on'])) {
            $out['show_on'] = self::show_on_norm(isset($in['show_on']) ? (array) $in['show_on'] : []);
            if (self::is_default_value('show_on', $out['show_on'])) {
                unset($out['show_on']);
            }
        }

        // Unknown/absent value falls back to 'all' — today's behavior, so an
        // upgrade from an options array with no `scope` key changes nothing.
        $scope        = sanitize_key((string) ($in['scope'] ?? $d['scope']));
        $out['scope'] = array_key_exists($scope, self::scopes()) ? $scope : 'all';

        $placement        = sanitize_key((string) ($in['placement'] ?? $d['placement']));
        $out['placement'] = array_key_exists($placement, self::placements()) ? $placement : 'footer';

        $richness        = sanitize_key((string) ($in['richness'] ?? $d['richness']));
        $out['richness'] = in_array($richness, ['full', 'classic', 'minimal'], true) ? $richness : 'full';

        $out['exclude_booking'] = empty($in['exclude_booking']) ? 0 : 1;
        $out['guide_effects']   = empty($in['guide_effects']) ? 0 : 1;

        /* One path per line. Kept as a newline string rather than an array
         * because that is what the textarea round-trips; normalised here so
         * the matcher never has to think about slashes or case. */
        $paths = (string) ($in['exclude_paths'] ?? $d['exclude_paths']);
        $clean = [];
        foreach (preg_split('/[\r\n,]+/', $paths) as $line) {
            $line = strtolower(trim((string) $line));
            $line = trim($line, "/ \t");
            $line = preg_replace('~[^a-z0-9/_-]~', '', $line);
            if ($line !== '' && !in_array($line, $clean, true)) {
                $clean[] = $line;
            }
        }
        $out['exclude_paths'] = implode("\n", $clean);

        /* Page IDs, comma or newline separated. Stored normalised so the
         * matcher never has to parse anything at request time. */
        $ids = (string) ($in['exclude_ids'] ?? $d['exclude_ids']);
        $keep = [];
        foreach (preg_split('/[^0-9]+/', $ids) as $n) {
            $n = (int) $n;
            if ($n > 0 && !in_array($n, $keep, true)) {
                $keep[] = $n;
            }
        }
        $out['exclude_ids'] = implode(', ', $keep);

        /* Clamped well below the alert band. A value that outranks a severe
         * weather warning is not a preference this plugin will honour. */
        $fz = (int) ($in['front_z'] ?? $d['front_z']);
        $out['front_z'] = max(1, min(9998, $fz));

        $out['subtle'] = empty($in['subtle']) ? 0 : 1;
        $si = (float) ($in['subtle_intensity'] ?? $d['subtle_intensity']);
        $out['subtle_intensity'] = min(1.0, max(0.0, round($si, 2)));
        /* Only keys we know, on both sides: a stale theme key or a retired
         * effect name would otherwise sit in the option for ever and be
         * shipped to every visitor. '' is kept — it means "no subtle layer
         * on this theme", which is a real choice. */
        $out['subtle_map'] = [];
        $effects  = self::subtle_effects();
        $themes   = Themes::labels();
        $plugin   = Themes::subtle_defaults();
        if (!empty($in['subtle_map']) && is_array($in['subtle_map'])) {
            foreach ($in['subtle_map'] as $theme => $eff) {
                $theme = sanitize_key((string) $theme);
                $eff   = sanitize_key((string) $eff);
                if (!isset($themes[$theme])) {
                    continue;
                }
                if ($eff !== '' && !isset($effects[$eff])) {
                    continue;
                }
                /* OVERRIDES ONLY — and this line is what makes that true.
                 * The form posts a value for all 27 themes on every save,
                 * so without this the stored map became a full copy after
                 * the first save and silently pinned every theme to
                 * whatever the plugin's default was THAT day. An untouched
                 * theme is supposed to keep tracking the plugin; a value
                 * equal to the plugin's own is therefore not stored. */
                if (array_key_exists($theme, $plugin) && $plugin[$theme] === $eff) {
                    continue;
                }
                $out['subtle_map'][$theme] = $eff;
            }
        }
        // 'fx_snow' left with the snow in 4.2.0; a stored value is ignored.
        foreach (['fx_reflections', 'fx_vignettes', 'fx_pointer', 'fx_evening'] as $fx) {
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

    /** The four settings panels (4.18.0), in tab order. */
    public const PANELS = ['schedule', 'where', 'look', 'egg'];

    /** The settings panel this request opens on: ?tab=, else Schedule. */
    public static function panel(): string {
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        $t = isset($_GET['tab']) ? sanitize_key(wp_unslash($_GET['tab'])) : '';
        return in_array($t, self::PANELS, true) ? $t : 'schedule';
    }

    /** The tab names, in order: the four panels, then the Theme guide and the Preview. */
    public static function tab_labels(): array {
        return [
            'schedule'               => __('Schedule', 'dcc-seasons'),
            'where'                  => __('Where', 'dcc-seasons'),
            'look'                   => __('Look', 'dcc-seasons'),
            'egg'                    => __('Easter Egg', 'dcc-seasons'),
            Theme_Guide::TAB         => __('Theme Guide', 'dcc-seasons'),
            Theme_Guide::TAB_PREVIEW => __('Preview', 'dcc-seasons'),
        ];
    }

    /**
     * An ⓘ button and the popover it opens (4.18.0, Rob's pick 5). Every
     * explanation that used to sit under its control lives here, word for
     * word. $paras are already-escaped HTML.
     */
    private static function info(string $id, string $about, array $paras): void {
        $pid = 'dcc-pop-' . $id;
        echo '<button type="button" class="dcc-i" aria-expanded="false" aria-controls="' . esc_attr($pid) . '">'
            . '<span aria-hidden="true">i</span><span class="screen-reader-text">'
            . esc_html(sprintf(/* translators: %s: setting name */ __('About %s', 'dcc-seasons'), $about)) . '</span></button>';
        echo '<div class="dcc-pop" id="' . esc_attr($pid) . '" role="note" hidden>';
        foreach ($paras as $p) {
            echo '<p class="description">' . $p . '</p>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped by the caller
        }
        echo '</div>';
    }

    /** A card's opening tag and its centered, title-case heading. */
    private static function card(string $title, string $id = '', string $class = ''): void {
        echo '<section class="dcc-card ' . esc_attr($class) . '"' . ($id !== '' ? ' id="' . esc_attr($id) . '"' : '') . '>';
        echo '<h2 class="dcc-card-h">' . esc_html($title) . '</h2>';
    }

    /** A checkbox drawn as a switch. The input and its name are unchanged. */
    private static function toggle(string $key, string $label, array $opt, string $id = ''): void {
        echo '<label class="dcc-switch"><input type="checkbox" role="switch" value="1" name="' . esc_attr(self::OPTION) . '[' . esc_attr($key) . ']"'
            . ($id !== '' ? ' id="' . esc_attr($id) . '"' : '') . checked(!empty($opt[$key]), true, false) . '>'
            . '<span class="dcc-switch-ui" aria-hidden="true"></span><span class="dcc-switch-t">' . esc_html($label) . '</span></label>';
    }

    /**
     * A slider with its live value and its default marked on the track.
     * The input keeps its old id and name.
     */
    private static function slider(string $key, string $id, string $label, float $min, float $max, float $step, $value, $default, array $info = []): void {
        $pct = $max > $min ? (($default - $min) / ($max - $min)) * 100 : 0;
        echo '<div class="dcc-field dcc-slider" style="--dcc-def:' . esc_attr(round($pct, 3) . '%') . '">';
        echo '<div class="dcc-label-row"><label for="' . esc_attr($id) . '" class="dcc-label">' . esc_html($label) . '</label>';
        if ($info) {
            self::info($info[0], $info[1], $info[2]);
        }
        echo '</div>';
        echo '<div class="dcc-slider-row"><span class="dcc-track"><input type="range" min="' . esc_attr((string) $min) . '" max="' . esc_attr((string) $max) . '" step="' . esc_attr((string) $step) . '" id="' . esc_attr($id) . '"'
            . ' name="' . esc_attr(self::OPTION) . '[' . esc_attr($key) . ']" value="' . esc_attr((string) $value) . '" data-dcc-output="' . esc_attr($id) . '-out" data-dcc-default="' . esc_attr((string) $default) . '">'
            . '<span class="dcc-def-mark" aria-hidden="true"></span></span>';
        echo '<output id="' . esc_attr($id) . '-out" for="' . esc_attr($id) . '">' . esc_html((string) $value) . '</output></div>';
        echo '<p class="dcc-def">' . esc_html(sprintf(/* translators: %s: default value */ __('Default %s', 'dcc-seasons'), (string) $default)) . '</p>';
        echo '</div>';
    }

    /** A number field with − and + buttons and its default named. */
    private static function stepper(string $key, string $id, string $label, int $min, int $max, $value, $default, array $info = []): void {
        echo '<div class="dcc-field dcc-stepper">';
        echo '<div class="dcc-label-row"><label for="' . esc_attr($id) . '" class="dcc-label">' . esc_html($label) . '</label>';
        if ($info) {
            self::info($info[0], $info[1], $info[2]);
        }
        echo '</div>';
        echo '<div class="dcc-step-row"><button type="button" class="dcc-step" data-step="-1" aria-controls="' . esc_attr($id) . '"><span aria-hidden="true">−</span><span class="screen-reader-text">' . esc_html__('Less', 'dcc-seasons') . '</span></button>';
        echo '<input type="number" min="' . (int) $min . '" max="' . (int) $max . '" step="1" id="' . esc_attr($id) . '" name="' . esc_attr(self::OPTION) . '[' . esc_attr($key) . ']" value="' . esc_attr((string) $value) . '" data-dcc-default="' . esc_attr((string) $default) . '">';
        echo '<button type="button" class="dcc-step" data-step="1" aria-controls="' . esc_attr($id) . '"><span aria-hidden="true">+</span><span class="screen-reader-text">' . esc_html__('More', 'dcc-seasons') . '</span></button></div>';
        echo '<p class="dcc-def">' . esc_html(sprintf(/* translators: %s: default value */ __('Default %s', 'dcc-seasons'), (string) $default)) . '</p>';
        echo '</div>';
    }

    /** The colour of each theme's band on the year ribbon (white text passes AA on every one). */
    public static function theme_colors(): array {
        return [
            'new_years' => '#4B2E83', 'snowbird' => '#2C6382', 'mlk' => '#7A5B00', 'mardi_gras' => '#6A2C8C',
            'valentines' => '#B0204A', 'presidents' => '#34497A', 'strawberry' => '#A8243A', 'st_patricks' => '#1E6E3A',
            'easter' => '#7D4592', 'april_fools' => '#94337F', 'spring_canal' => '#36703F', 'four_twenty' => '#4A6E1C',
            'earth_day' => '#28634F', 'mothers_day' => '#983171', 'memorial_day' => '#283F70', 'summer_canal' => '#0F6DBF',
            'fathers_day' => '#2F5677', 'july4' => '#BC003E', 'labor_day' => '#2F5A85', 'patriot_day' => '#3A4A6B',
            'fall_fishing' => '#55672A', 'halloween' => '#A8430E', 'thanksgiving' => '#86481A', 'veterans_day' => '#4A4E2A',
            'anniversary' => '#7E5F10', 'christmas' => '#1F6338', 'florida_keys' => '#0A6F7A', 'classic' => '#565E6B',
        ];
    }

    /**
     * Why a page can never be decorated, or '' (4.18.0, the Show On
     * chips). The same lists the front end reads: Plugin::booking_pages()
     * and Plugin::guide_pages(), then the two never-decorate fields.
     * admin.js repeats this as the fields change.
     */
    public static function page_lock(int $id, string $slug, array $opt): string {
        [$bids, $bslugs] = Plugin::booking_pages();
        [$gids, $gslugs] = Plugin::guide_pages();
        if (!empty($opt['exclude_booking']) && (in_array($id, $bids, true) || ($slug !== '' && in_array($slug, $bslugs, true)))) {
            return 'booking';
        }
        if (empty($opt['guide_effects']) && (in_array($id, $gids, true) || ($slug !== '' && in_array($slug, $gslugs, true)))) {
            return 'guide';
        }
        $ids = array_map('intval', preg_split('/[^0-9]+/', (string) ($opt['exclude_ids'] ?? '')));
        if ($id > 0 && in_array($id, $ids, true)) {
            return 'ids';
        }
        foreach (preg_split('/[\r\n]+/', (string) ($opt['exclude_paths'] ?? '')) as $line) {
            $line = strtolower(trim((string) $line, "/ \t"));
            if ($line !== '' && $slug !== '' && $line === strtolower($slug)) {
                return 'paths';
            }
        }
        return '';
    }

    /** The reason a lock gives, by kind. */
    public static function lock_reasons(): array {
        return [
            'booking' => __('Never decorated: this page is part of the booking flow, and "Booking, payment and confirmation pages" is ticked under Never Decorate.', 'dcc-seasons'),
            'guide'   => __('Never decorated: this is the Guest Guide, and "Allow effects on the Guest Guide" is off under Never Decorate.', 'dcc-seasons'),
            'ids'     => __('Never decorated: its page ID is in "Excluded page IDs" under Never Decorate.', 'dcc-seasons'),
            'paths'   => __('Never decorated: its slug is in "Other excluded pages" under Never Decorate.', 'dcc-seasons'),
        ];
    }

    /** A policy page, for the "Policy Pages" group toggle. */
    public static function is_policy_page(int $id, string $title, string $slug): bool {
        $ids = (array) apply_filters('dcc_seasons_policy_page_ids', array_filter([(int) get_option('wp_page_for_privacy_policy', 0)]));
        if (in_array($id, array_map('intval', $ids), true)) {
            return true;
        }
        return (bool) preg_match('/privacy|polic|terms|conditions|accessib|cookie|refund|cancellation|disclaimer|house-rules/i', $slug . ' ' . $title);
    }

    /** What admin.js reads: the resolver's tables, the theme colours, the lock lists and the strings. */
    private static function admin_data(array $opt): array {
        $anchors = [];
        foreach (Schedule::anchors() as $k => $a) {
            $a['short'] = preg_replace('/\s*\(.*\)$/', '', (string) $a['label']);
            $anchors[$k] = $a;
        }
        $themes = [];
        $colors = self::theme_colors();
        foreach (Themes::labels() as $k => $l) {
            $themes[$k] = ['label' => $l, 'color' => $colors[$k] ?? '#565E6B'];
        }
        $months = [];
        for ($i = 1; $i <= 12; $i++) {
            $months[] = date_i18n('M', mktime(12, 0, 0, $i, 1, 2001));
        }
        $year = (int) current_time('Y');
        [$bids, $bslugs] = Plugin::booking_pages();
        [$gids, $gslugs] = Plugin::guide_pages();
        return [
            'anchors'  => $anchors,
            'themes'   => $themes,
            'months'   => $months,
            'years'    => [$year, $year + 1],
            'today'    => (string) current_time('Y-m-d'),
            'booking'  => ['ids' => $bids, 'slugs' => $bslugs],
            'guide'    => ['ids' => $gids, 'slugs' => $gslugs],
            'locks'    => self::lock_reasons(),
            'strings'  => [
                'one'      => __('1 Unsaved Change', 'dcc-seasons'),
                /* translators: %d: number of unsaved changes (2 or more) */
                'many'     => __('%d Unsaved Changes', 'dcc-seasons'),
                'leave'    => __('You have unsaved changes to the Seasons settings.', 'dcc-seasons'),
                'edit'     => __('Edit Row', 'dcc-seasons'),
                'add'      => __('New Row', 'dcc-seasons'),
                'starts'   => __('starts', 'dcc-seasons'),
                'ends'     => __('ends', 'dcc-seasons'),
                /* translators: 1: holiday name, 2: signed number of days */
                'offset'   => __('%1$s %2$s d', 'dcc-seasons'),
                'deleted'  => __('Row deleted. Discard brings it back.', 'dcc-seasons'),
                'none'     => '—',
                /* translators: %d: year */
                'only'     => __('(%d only)', 'dcc-seasons'),
                'today'    => __('Today', 'dcc-seasons'),
                'ribbon'   => __('Schedule for %d', 'dcc-seasons'),
                'drag'     => __('Drag to move this date. Arrow keys move it a day, Shift+arrow a week.', 'dcc-seasons'),
                'nolabel'  => __('(no label)', 'dcc-seasons'),
            ],
        ];
    }

    public static function render_page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }
        $opt    = self::options();
        $labels = Themes::labels();
        /* The check key is made by the settings page whatever tab is open
         * (4.13.2's rule; the key is shown on the Preview tab since 4.18.0). */
        $dcc_ck = Plugin::check_key(true);
        $panel  = self::panel();
        ?>
        <div class="wrap dcc-seasons-wrap dcc-ui">
            <h1 class="dcc-title"><?php esc_html_e('DCC Seasons', 'dcc-seasons'); ?></h1>
            <p class="dcc-sub">
                <?php esc_html_e('Seasonal ambient particles + a hidden tap-to-open Matrix easter egg. The active theme is picked in the visitor\'s browser from their local date, so page caching never serves a stale season.', 'dcc-seasons'); ?>
            </p>
            <?php Theme_Guide::tabs(); ?>
            <?php if (Theme_Guide::is_tab()) : ?>
                <?php Theme_Guide::render(); ?>
                <?php if (Theme_Guide::is_preview()) { self::render_preview_links($labels, $dcc_ck); } ?>
        </div>
                <?php return; ?>
            <?php endif; ?>

            <form method="post" action="options.php" id="dcc-seasons-form" class="dcc-form" autocomplete="off">
                <?php settings_fields('dcc_seasons'); ?>

                <div class="dcc-panel" id="dcc-panel-schedule" data-panel="schedule" role="region" aria-labelledby="dcc-tab-schedule"<?php echo $panel === 'schedule' ? '' : ' hidden'; ?>>
                    <?php self::render_schedule($opt, $labels); ?>
                </div>

                <div class="dcc-panel" id="dcc-panel-where" data-panel="where" role="region" aria-labelledby="dcc-tab-where"<?php echo $panel === 'where' ? '' : ' hidden'; ?>>
                    <?php self::card(__('Show On', 'dcc-seasons'), 'dcc-card-showon'); ?>
                        <?php self::render_show_on($opt); ?>
                    </section>

                    <?php self::card(__('Placement And Layering', 'dcc-seasons')); ?>
                        <div class="dcc-field">
                            <div class="dcc-label-row"><label for="dcc-seasons-placement" class="dcc-label"><?php esc_html_e('Placement', 'dcc-seasons'); ?></label>
                            <?php self::info('placement', __('Placement', 'dcc-seasons'), [
                                esc_html__('WHERE on a page the decorations may appear — a different question from "Show On" above, which decides which PAGES load the plugin at all. "Site footer only" keeps them off the body copy entirely: the canvas is mounted inside the footer, sized to it, and nothing is drawn over footer text either. "Across the page content" is the older behaviour, where the canvas spans the content column.', 'dcc-seasons'),
                                esc_html__('If the theme has no footer element the decorations render nowhere rather than falling back into the content; the footer element can be named with the dcc_seasons_footer_host filter.', 'dcc-seasons'),
                                '<strong>' . esc_html__('Choosing between them:', 'dcc-seasons') . '</strong> ' . esc_html__('"Site footer only" confines everything to one small box at the bottom of the page, which is quiet but easy to miss entirely. "Across the page content" spans the whole column — and note it interacts with Layering below: with "Behind interactive widgets", an opaque section can cover the effects, which is the usual cause of "I set it up and I cannot see anything". "In front of everything" avoids that.', 'dcc-seasons'),
                            ]); ?></div>
                            <select id="dcc-seasons-placement" name="<?php echo esc_attr(self::OPTION); ?>[placement]">
                                <?php foreach (self::placements() as $key => $label) : ?>
                                    <option value="<?php echo esc_attr($key); ?>" <?php selected($opt['placement'], $key); ?>><?php echo esc_html($label); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="dcc-field">
                            <div class="dcc-label-row"><label for="dcc-seasons-layering" class="dcc-label"><?php esc_html_e('Layering', 'dcc-seasons'); ?></label>
                            <?php self::info('layering', __('Layering', 'dcc-seasons'), [
                                esc_html__('Applies to "Across the page content" placement. "Behind" keeps the ambient particles under the cottage selector and availability calendars (the widgets are raised above the canvas). The Matrix easter egg always covers everything regardless.', 'dcc-seasons'),
                            ]); ?></div>
                            <select id="dcc-seasons-layering" name="<?php echo esc_attr(self::OPTION); ?>[layering]">
                                <option value="behind" <?php selected($opt['layering'], 'behind'); ?>><?php esc_html_e('Behind interactive widgets (recommended)', 'dcc-seasons'); ?></option>
                                <option value="front" <?php selected($opt['layering'], 'front'); ?>><?php esc_html_e('In front of everything', 'dcc-seasons'); ?></option>
                            </select>
                        </div>
                    </section>

                    <?php self::card(__('Never Decorate', 'dcc-seasons'), 'dcc-card-never'); ?>
                        <div class="dcc-field dcc-label-row">
                            <?php self::toggle('exclude_booking', __('Booking, payment and confirmation pages', 'dcc-seasons'), $opt, 'dcc-seasons-exclude-booking'); ?>
                            <?php self::info('booking', __('Booking, payment and confirmation pages', 'dcc-seasons'), [
                                esc_html__('Applies whatever the scope is set to, including "All pages and posts". Covers the cart, checkout, payment request and every booking confirmation page — MotoPress is asked which pages these are, so they stay excluded if their IDs change. Animated decoration over a payment form costs trust at the highest-stakes moment in the booking funnel.', 'dcc-seasons'),
                            ]); ?>
                        </div>
                        <div class="dcc-field dcc-label-row">
                            <?php self::toggle('guide_effects', __('Allow effects on the Guest Guide', 'dcc-seasons'), $opt, 'dcc-seasons-guide-effects'); ?>
                            <?php self::info('guide', __('Allow effects on the Guest Guide', 'dcc-seasons'), [
                                esc_html__('Off by default. The Guest Guide is a reference guests consult during a stay — wifi codes, checkout times — so drifting sprites over it are friction rather than atmosphere. Tick this to decorate it anyway.', 'dcc-seasons'),
                            ]); ?>
                        </div>
                        <div class="dcc-field">
                            <div class="dcc-label-row"><label for="dcc-seasons-exclude-ids" class="dcc-label"><?php esc_html_e('Excluded page IDs', 'dcc-seasons'); ?></label>
                            <?php self::info('ids', __('Excluded page IDs', 'dcc-seasons'), [
                                esc_html__('Page IDs never decorated, comma separated. An ID survives a page being renamed, which a slug does not — use this for pages that must stay clean whatever they are called. Ships with 18119 (the Wildlife hub at /explore/), where drifting sprites read as a glitch over a field guide.', 'dcc-seasons'),
                            ]); ?></div>
                            <input type="text" class="regular-text" id="dcc-seasons-exclude-ids"
                                   name="<?php echo esc_attr(self::OPTION); ?>[exclude_ids]"
                                   value="<?php echo esc_attr((string) $opt['exclude_ids']); ?>" />
                        </div>
                        <div class="dcc-field">
                            <div class="dcc-label-row"><label for="dcc-seasons-exclude-paths" class="dcc-label"><?php esc_html_e('Other excluded pages', 'dcc-seasons'); ?></label>
                            <?php self::info('paths', __('Other excluded pages', 'dcc-seasons'), [
                                esc_html__('One page slug or path per line, never decorated. Matched against both the URL and the page slug, and anything beneath a path is covered too. Defaults to "staff" — an internal board is not a surface to decorate.', 'dcc-seasons'),
                            ]); ?></div>
                            <textarea id="dcc-seasons-exclude-paths" rows="3" cols="30"
                                      name="<?php echo esc_attr(self::OPTION); ?>[exclude_paths]"><?php echo esc_textarea((string) $opt['exclude_paths']); ?></textarea>
                        </div>
                    </section>
                </div>

                <div class="dcc-panel" id="dcc-panel-look" data-panel="look" role="region" aria-labelledby="dcc-tab-look"<?php echo $panel === 'look' ? '' : ' hidden'; ?>>
                    <?php self::card(__('Master Switch', 'dcc-seasons')); ?>
                        <div class="dcc-field"><?php self::toggle('enabled', __('Enable DCC Seasons', 'dcc-seasons'), $opt, 'dcc-seasons-enabled'); ?></div>
                    </section>

                    <?php self::card(__('Layers', 'dcc-seasons')); ?>
                        <div class="dcc-field dcc-label-row">
                            <?php self::toggle('ambient', __('Falling and drifting sprites', 'dcc-seasons'), $opt, 'dcc-seasons-ambient'); ?>
                            <?php self::info('ambient', __('Falling and drifting sprites', 'dcc-seasons'), [
                                esc_html__('Switches the falling and drifting sprites only, including the boats and birds. The background layer, corner accents, scenes and heroes keep playing; they have their own settings below.', 'dcc-seasons'),
                            ]); ?>
                        </div>
                        <div class="dcc-field">
                            <?php self::toggle('egg', __('Matrix easter egg', 'dcc-seasons'), $opt, 'dcc-seasons-egg'); ?>
                            <p class="dcc-hint">(<?php echo esc_html(self::egg_howto($opt)); ?>)</p>
                        </div>
                    </section>

                    <?php self::card(__('Background Layer', 'dcc-seasons')); ?>
                        <div class="dcc-field dcc-label-row">
                            <?php self::toggle('subtle', __('Run the quiet seasonal layer underneath the sprites', 'dcc-seasons'), $opt, 'dcc-seasons-subtle'); ?>
                            <?php self::info('subtle', __('Subtle layer', 'dcc-seasons'), [
                                esc_html__('The calm baseline: leaves, snow, blossom or dragonflies by season, with a few bespoke days. It sits below the sprites and never over text.', 'dcc-seasons'),
                            ]); ?>
                        </div>
                        <?php self::slider('subtle_intensity', 'dcc-seasons-subtle-intensity', __('Subtle intensity', 'dcc-seasons'), 0, 1, 0.05, $opt['subtle_intensity'], self::defaults()['subtle_intensity'], ['intensity', __('Subtle intensity', 'dcc-seasons'), [
                            esc_html__('How many particles and how visible (default 0.6). This layer is meant to be noticed only once you look for it.', 'dcc-seasons'),
                        ]]); ?>
                        <div class="dcc-field">
                            <details class="dcc-details">
                                <summary><?php esc_html_e('Subtle effect per theme', 'dcc-seasons'); ?> · <?php esc_html_e('Show the theme mapping', 'dcc-seasons'); ?></summary>
                                <div class="dcc-label-row"><?php self::info('submap', __('Subtle effect per theme', 'dcc-seasons'), [
                                    esc_html__('Four seasonal effects carry the year; Valentine\'s, New Year\'s, Halloween, Independence Day and Christmas have their own. Change any of them here.', 'dcc-seasons'),
                                ]); ?></div>
                                <div class="dcc-submap">
                                <?php
                                $sub_map = self::subtle_map($opt);
                                $sub_fx  = self::subtle_effects();
                                foreach (Themes::labels() as $tkey => $tlabel) :
                                    $cur = $sub_map[$tkey] ?? '';
                                    ?>
                                    <div class="dcc-submap-row">
                                        <label for="dcc-seasons-subtle-<?php echo esc_attr($tkey); ?>"><?php echo esc_html($tlabel); ?></label>
                                        <select id="dcc-seasons-subtle-<?php echo esc_attr($tkey); ?>"
                                                name="<?php echo esc_attr(self::OPTION); ?>[subtle_map][<?php echo esc_attr($tkey); ?>]">
                                            <option value=""<?php selected($cur, ''); ?>><?php esc_html_e('None', 'dcc-seasons'); ?></option>
                                            <?php foreach ($sub_fx as $fkey => $flabel) : ?>
                                                <option value="<?php echo esc_attr($fkey); ?>"<?php selected($cur, $fkey); ?>><?php echo esc_html($flabel); ?></option>
                                            <?php endforeach; ?>
                                        </select>
                                    </div>
                                <?php endforeach; ?>
                                </div>
                            </details>
                        </div>
                    </section>

                    <?php self::card(__('Falling Sprites', 'dcc-seasons')); ?>
                        <?php self::slider('density', 'dcc-seasons-density', __('Ambient density', 'dcc-seasons'), 1, 16, 1, $opt['density'], self::defaults()['density'], ['density', __('Ambient density', 'dcc-seasons'), [
                            esc_html__('Maximum simultaneous ambient particles (hard cap 16).', 'dcc-seasons'),
                        ]]); ?>
                        <?php self::slider('opacity', 'dcc-seasons-opacity', __('Ambient opacity', 'dcc-seasons'), 0.05, 1, 0.05, $opt['opacity'], self::defaults()['opacity'], ['opacity', __('Ambient opacity', 'dcc-seasons'), [
                            esc_html__('How visible the ambient particles are (default 0.35 — deliberately faint).', 'dcc-seasons'),
                        ]]); ?>
                    </section>

                    <?php self::card(__('Visual Richness', 'dcc-seasons')); ?>
                        <div class="dcc-field">
                            <div class="dcc-label-row"><label for="dcc-seasons-richness" class="dcc-label"><?php esc_html_e('Visual richness', 'dcc-seasons'); ?></label>
                            <?php self::info('richness', __('Visual richness', 'dcc-seasons'), [
                                esc_html__('On a page where the Hero Effects heron is switched on, the Seasons heron stands down and leaves that flight to it — on days with no other bird, that day simply has no flyer.', 'dcc-seasons'),
                            ]); ?></div>
                            <select id="dcc-seasons-richness" name="<?php echo esc_attr(self::OPTION); ?>[richness]">
                                <option value="full" <?php selected($opt['richness'], 'full'); ?>><?php esc_html_e('Full — parallax depth, reflections, scene moments, pointer awareness', 'dcc-seasons'); ?></option>
                                <option value="classic" <?php selected($opt['richness'], 'classic'); ?>><?php esc_html_e('Classic — v2 behavior (sprites + heroes, no extras)', 'dcc-seasons'); ?></option>
                                <option value="minimal" <?php selected($opt['richness'], 'minimal'); ?>><?php esc_html_e('Minimal — sprites only, no motion extras', 'dcc-seasons'); ?></option>
                            </select>
                        </div>
                        <div class="dcc-field">
                            <details class="dcc-details">
                                <summary><?php esc_html_e('Advanced visuals (apply within Full)', 'dcc-seasons'); ?></summary>
                                <div class="dcc-fx">
                                    <?php
                                    $fx_labels = [
                                        'fx_reflections' => __('Waterline reflections (off on mobile automatically)', 'dcc-seasons'),
                                        'fx_vignettes'   => __('Scene moments (rare choreographed vignettes)', 'dcc-seasons'),
                                        'fx_pointer'     => __('Pointer awareness (particles ease away from the cursor)', 'dcc-seasons'),
                                        'fx_evening'     => __('Evening tint (dusk grade + night variants, 7pm–6am local)', 'dcc-seasons'),
                                    ];
                                    foreach ($fx_labels as $fx => $label) {
                                        self::toggle($fx, $label, $opt);
                                    }
                                    ?>
                                </div>
                            </details>
                        </div>
                    </section>

                    <?php self::card(__('Front Layering Depth', 'dcc-seasons')); ?>
                        <?php self::stepper('front_z', 'dcc-seasons-front-z', __('Front layering depth', 'dcc-seasons'), 1, 9998, $opt['front_z'], self::defaults()['front_z'], ['frontz', __('Front layering depth', 'dcc-seasons'), [
                            esc_html__('The z-index used by "In front of everything" (default 9000). It sits above page content and Elementor sections, and deliberately BELOW lightboxes (9999), the severe weather banner (10000) and any consent popup. Raise it only if something ordinary is covering the effects; anything that must stay on top only has to clear this number.', 'dcc-seasons'),
                        ]]); ?>
                    </section>
                </div>

                <div class="dcc-panel" id="dcc-panel-egg" data-panel="egg" role="region" aria-labelledby="dcc-tab-egg"<?php echo $panel === 'egg' ? '' : ' hidden'; ?>>
                    <?php self::card(__('Easter Egg', 'dcc-seasons')); ?>
                        <p class="dcc-hint dcc-center"><?php echo esc_html(self::egg_howto($opt)); ?></p>
                        <div class="dcc-field">
                            <div class="dcc-label-row"><label for="dcc-seasons-tap-selector" class="dcc-label"><?php esc_html_e('Tap target selector', 'dcc-seasons'); ?></label>
                            <?php self::info('tapsel', __('Tap target selector', 'dcc-seasons'), [
                                esc_html__('Comma-separated CSS selectors. Every VISIBLE match is bound (zero-size elements are skipped — Bravada renders #branding and #site-title at 0px on this site); all matches share one tap counter. A page where nothing visible matches has no egg.', 'dcc-seasons'),
                                /* translators: %s: the default CSS selector */
                                esc_html(sprintf(__('Default: %s — the title in the homepage banner. Left at the default, it follows the plugin if the default changes.', 'dcc-seasons'), self::defaults()['tap_selector'])),
                            ]); ?></div>
                            <input type="text" class="regular-text code" id="dcc-seasons-tap-selector"
                                   name="<?php echo esc_attr(self::OPTION); ?>[tap_selector]"
                                   value="<?php echo esc_attr($opt['tap_selector']); ?>" />
                        </div>
                        <?php self::stepper('tap_count', 'dcc-seasons-tap-count', __('Tap count', 'dcc-seasons'), 2, 10, $opt['tap_count'], self::defaults()['tap_count'], ['tapcount', __('Tap count', 'dcc-seasons'), [
                            /* translators: %d: the default tap count */
                            esc_html(sprintf(__('Taps within a rolling 3-second window needed to launch the egg (default %d).', 'dcc-seasons'), self::defaults()['tap_count'])),
                        ]]); ?>
                    </section>
                </div>

                <div class="dcc-savebar" id="dcc-savebar" role="region" aria-label="<?php esc_attr_e('Unsaved changes', 'dcc-seasons'); ?>" hidden>
                    <span class="dcc-sb-count" aria-live="polite"></span>
                    <button type="button" class="dcc-btn dcc-btn-ghost" id="dcc-discard"><?php esc_html_e('Discard', 'dcc-seasons'); ?></button>
                    <button type="submit" class="dcc-btn dcc-btn-primary" id="dcc-save"><?php esc_html_e('Save', 'dcc-seasons'); ?></button>
                </div>
                <noscript><?php submit_button(); ?></noscript>
            </form>
            <div class="dcc-toasts" id="dcc-toasts" role="status" aria-live="polite"></div>
            <script>window.DCCSeasonsAdmin = <?php echo wp_json_encode(self::admin_data($opt)); ?>;</script>
        </div>
        <?php
    }

    /** The Schedule tab: the year ribbon, the side sheet and the rows behind them. */
    private static function render_schedule(array $opt, array $labels): void {
        $rows  = $opt['schedule'];
        $year  = (int) current_time('Y');
        $today = (string) current_time('Y-m-d');
        $live  = Schedule::active(Themes::schedule((array) $rows), $today);
        self::card(__('Schedule', 'dcc-seasons'), 'dcc-card-schedule', 'dcc-card-wide');
        ?>
            <div class="dcc-sched-tools">
                <div class="dcc-years" role="group" aria-label="<?php esc_attr_e('Year', 'dcc-seasons'); ?>">
                    <?php foreach ([$year, $year + 1] as $i => $y) : ?>
                        <button type="button" class="dcc-year" data-year="<?php echo (int) $y; ?>" aria-pressed="<?php echo $i === 0 ? 'true' : 'false'; ?>"><?php echo (int) $y; ?></button>
                    <?php endforeach; ?>
                </div>
                <p class="dcc-live"><?php
                    echo esc_html__('Live today:', 'dcc-seasons') . ' <strong>' . esc_html($live ? ($labels[$live['theme']] ?? $live['theme']) : __('Florida Keys (year-round base)', 'dcc-seasons')) . '</strong>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
                ?></p>
                <?php self::info('schedule', __('Schedule', 'dcc-seasons'), [
                    esc_html__('Rows repeat every year. Each end of a range is either a fixed month/day or a named holiday — Easter, Thanksgiving, Memorial Day and the rest move with the calendar automatically — plus an optional ± days offset. Ranges may overlap: the narrowest one wins that day, so a one-day holiday can sit inside a season. A range that ends before it starts runs into the next year (New Year\'s). Put a year in the last column to make a row a one-off. Dates are matched in the VISITOR\'S local time.', 'dcc-seasons'),
                    esc_html__('What the rules above come out to. When ranges overlap, the narrowest one wins that day — so a one-day holiday inside a season shows correctly here.', 'dcc-seasons'),
                    esc_html__('Tap a band to edit its row. Drag a band\'s end to move a fixed date; an end set to a holiday moves its ± days instead. Arrow keys move between bands and Enter opens one.', 'dcc-seasons'),
                ]); ?>
                <button type="button" class="dcc-btn dcc-btn-primary dcc-add" id="dcc-seasons-add-row">+ <?php esc_html_e('Add', 'dcc-seasons'); ?></button>
            </div>
            <div class="dcc-ribbon" id="dcc-seasons-schedule" data-year="<?php echo (int) $year; ?>">
                <noscript><p><?php esc_html_e('The year ribbon needs JavaScript. The rows are below.', 'dcc-seasons'); ?></p></noscript>
            </div>
            <?php
            foreach ([$year, $year + 1] as $y) {
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
            self::render_unscheduled($rows, $labels);
            ?>
            <div class="dcc-rows" id="dcc-rows">
                <?php foreach ($rows as $i => $row) : ?>
                    <?php self::render_row((string) $i, $row, $labels); ?>
                <?php endforeach; ?>
            </div>
            <template id="dcc-seasons-row-template">
                <?php self::render_row('__i__', ['start' => ['on' => 'fixed', 'm' => 1, 'd' => 1, 'off' => 0], 'end' => ['on' => 'fixed', 'm' => 1, 'd' => 1, 'off' => 0], 'theme' => 'classic', 'label' => '', 'year' => 0], $labels); ?>
            </template>
        </section>
        <div class="dcc-scrim" id="dcc-scrim" hidden></div>
        <aside class="dcc-sheet" id="dcc-sheet" role="dialog" aria-modal="true" aria-labelledby="dcc-sheet-h" hidden>
            <div class="dcc-sheet-head">
                <h2 class="dcc-sheet-h" id="dcc-sheet-h"><?php esc_html_e('Edit Row', 'dcc-seasons'); ?></h2>
                <button type="button" class="dcc-x" id="dcc-sheet-close"><span aria-hidden="true">×</span><span class="screen-reader-text"><?php esc_html_e('Close', 'dcc-seasons'); ?></span></button>
            </div>
            <p class="dcc-sheet-dates" id="dcc-sheet-dates"></p>
            <div class="dcc-sheet-body" id="dcc-sheet-body"></div>
            <div class="dcc-sheet-foot">
                <button type="button" class="dcc-btn dcc-btn-danger" id="dcc-sheet-delete"><?php esc_html_e('Delete', 'dcc-seasons'); ?></button>
                <button type="button" class="dcc-btn dcc-btn-primary" id="dcc-sheet-done"><?php esc_html_e('Done', 'dcc-seasons'); ?></button>
            </div>
        </aside>
        <?php
    }

    /**
     * One schedule row's controls, as the side sheet shows them. The
     * name= attributes are the ones the table used, so a saved schedule
     * round-trips unchanged.
     *
     * @param string                $index  Array index placeholder.
     * @param array                 $row    start/end/theme/label.
     * @param array<string, string> $labels Theme key => label.
     */
    private static function render_row(string $index, array $row, array $labels): void {
        $name = self::OPTION . '[schedule][' . $index . ']';
        $id   = 'dcc-r-' . $index;
        $none = ['on' => 'fixed', 'm' => 1, 'd' => 1, 'off' => 0];
        ?>
        <div class="dcc-row" data-row="<?php echo esc_attr($index); ?>">
            <div class="dcc-field">
                <label class="dcc-label" for="<?php echo esc_attr($id); ?>-theme"><?php esc_html_e('Theme', 'dcc-seasons'); ?></label>
                <select id="<?php echo esc_attr($id); ?>-theme" class="dcc-r-theme" name="<?php echo esc_attr($name); ?>[theme]">
                    <?php foreach ($labels as $key => $label) : ?>
                        <option value="<?php echo esc_attr($key); ?>" <?php selected($row['theme'] ?? '', $key); ?>><?php echo esc_html($label); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <fieldset class="dcc-field dcc-rule-fs" data-end="start">
                <legend class="dcc-label"><?php esc_html_e('Starts', 'dcc-seasons'); ?></legend>
                <?php self::render_rule($name . '[start]', is_array($row['start'] ?? null) ? $row['start'] : $none); ?>
            </fieldset>
            <fieldset class="dcc-field dcc-rule-fs" data-end="end">
                <legend class="dcc-label"><?php esc_html_e('Ends', 'dcc-seasons'); ?></legend>
                <?php self::render_rule($name . '[end]', is_array($row['end'] ?? null) ? $row['end'] : $none); ?>
            </fieldset>
            <div class="dcc-field">
                <label class="dcc-label" for="<?php echo esc_attr($id); ?>-label"><?php esc_html_e('Label', 'dcc-seasons'); ?></label>
                <input type="text" id="<?php echo esc_attr($id); ?>-label" class="dcc-r-label" name="<?php echo esc_attr($name); ?>[label]"
                       value="<?php echo esc_attr($row['label'] ?? ''); ?>" />
            </div>
            <div class="dcc-field">
                <label class="dcc-label" for="<?php echo esc_attr($id); ?>-year"><?php esc_html_e('One-off year', 'dcc-seasons'); ?></label>
                <input type="number" id="<?php echo esc_attr($id); ?>-year" class="dcc-seasons-year dcc-r-year" name="<?php echo esc_attr($name); ?>[year]" min="2000" max="2100" step="1"
                       value="<?php echo esc_attr(!empty($row['year']) ? (string) (int) $row['year'] : ''); ?>"
                       placeholder="<?php esc_attr_e('every', 'dcc-seasons'); ?>"
                       aria-describedby="<?php echo esc_attr($id); ?>-year-h" />
                <p class="dcc-hint" id="<?php echo esc_attr($id); ?>-year-h"><?php esc_html_e('Year (blank = every year)', 'dcc-seasons'); ?></p>
            </div>
        </div>
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
            <span class="dcc-seasons-md-pair" <?php echo $on === 'fixed' ? '' : 'hidden'; ?>>
            <select class="dcc-seasons-md dcc-m" name="<?php echo esc_attr($name); ?>[m]" aria-label="<?php esc_attr_e('Month', 'dcc-seasons'); ?>" <?php echo $on === 'fixed' ? '' : 'hidden'; ?>>
                <?php for ($i = 1; $i <= 12; $i++) : ?>
                    <option value="<?php echo (int) $i; ?>" <?php selected($m, $i); ?>><?php echo esc_html(date_i18n('M', mktime(12, 0, 0, $i, 1, 2001))); ?></option>
                <?php endfor; ?>
            </select>
            <select class="dcc-seasons-md dcc-d" name="<?php echo esc_attr($name); ?>[d]" aria-label="<?php esc_attr_e('Day', 'dcc-seasons'); ?>" <?php echo $on === 'fixed' ? '' : 'hidden'; ?>>
                <?php for ($i = 1; $i <= 31; $i++) : ?>
                    <option value="<?php echo (int) $i; ?>" <?php selected($d, $i); ?>><?php echo (int) $i; ?></option>
                <?php endfor; ?>
            </select>
            </span>
            <span class="dcc-seasons-offset">
                <input type="number" class="dcc-seasons-off" name="<?php echo esc_attr($name); ?>[off]" value="<?php echo (int) $off; ?>" min="-60" max="60" step="1"
                       aria-label="<?php esc_attr_e('Offset in days', 'dcc-seasons'); ?>" />
                <span class="dcc-seasons-off-label"><?php esc_html_e('days', 'dcc-seasons'); ?></span>
            </span>
        </span>
        <?php
    }

    /** The Preview tab's links (moved from the settings form in 4.18.0, every word kept). */
    private static function render_preview_links(array $labels, string $dcc_ck): void {
        echo '<div class="dcc-ui-cards">';
        self::card(__('Theme preview', 'dcc-seasons'), 'dcc-card-preview-links');
        ?>
            <p class="description">
                <?php
                printf( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the links are escaped in preview_link()
                    /* translators: 1: example preview link, 2: "off" preview link */
                    esc_html__('Open a link such as %1$s (or add ?dcc_season= and a theme key to any front-end URL) to force that theme for the page view — ambient runs in that theme and the tap egg uses its Matrix palette. %2$s forces no theme. Links open in a new tab and work only for logged-in administrators (manage_options, verified server-side); visitors always get the date-driven schedule.', 'dcc-seasons'),
                    self::preview_link('halloween'), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built escaped
                    self::preview_link('off')
                );
                ?>
            </p>
            <details class="dcc-details">
                <summary><?php esc_html_e('Theme key', 'dcc-seasons'); ?> · <?php esc_html_e('Theme', 'dcc-seasons'); ?></summary>
                <div class="dcc-seasons-scroll">
                <table class="widefat striped dcc-seasons-preview-keys">
                    <thead><tr><th><?php esc_html_e('Theme key', 'dcc-seasons'); ?></th><th><?php esc_html_e('Theme', 'dcc-seasons'); ?></th></tr></thead>
                    <tbody>
                        <?php foreach ($labels as $key => $label) : ?>
                            <tr>
                                <td><?php echo self::preview_link((string) $key); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in preview_link() ?></td>
                                <td><?php echo esc_html($label); ?></td>
                            </tr>
                        <?php endforeach; ?>
                        <tr>
                            <td><?php echo self::preview_link('off'); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in preview_link() ?></td>
                            <td><?php esc_html_e('No theme (no ambient; egg falls back to classic green)', 'dcc-seasons'); ?></td>
                        </tr>
                    </tbody>
                </table>
                </div>
            </details>
        </section>
        <?php self::card(__('Check link', 'dcc-seasons'), 'dcc-card-check'); ?>
            <p class="description">
                <?php esc_html_e('For checking on staging in a browser that is not logged in: add dcc_key and this key to a front-end URL to preview a theme with dcc_season, and add dcc_scene=now to play the season\'s scene about a second after the effects start, and again shortly after each one ends. Without the key both are ignored. A page opened with the key is never cached.', 'dcc-seasons'); ?>
            </p>
            <p><code class="dcc-code"><?php echo esc_html(add_query_arg(['dcc_season' => 'thanksgiving', 'dcc_scene' => 'now', 'dcc_key' => $dcc_ck], home_url('/'))); ?></code></p>
        </section>
        </div>
        <?php
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
