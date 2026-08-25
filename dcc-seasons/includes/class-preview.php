<?php
/**
 * Admin preview tooling, baked in from the retired companion mu-plugin
 * ("DCC Seasons Preview Links"): one-click theme-preview buttons on the
 * settings page, plus an on-page chip (with a theme dropdown) whenever an
 * administrator loads a front-end page with ?dcc_season= present.
 *
 * UI sugar only — the real ?dcc_season= permission gate stays in
 * Plugin::preview_theme() (manage_options, verified server-side). Nothing
 * here runs or renders for non-admins, and no assets are enqueued: both
 * pieces are admin-gated inline output, exactly like the mu-plugin. If the
 * mu-plugin briefly runs alongside this class, the settings panel doubles;
 * nothing conflicts.
 *
 * @package DCC_Seasons
 */

namespace DCC_Seasons;

if (!defined('ABSPATH')) {
    exit;
}

class Preview {

    public static function init(): void {
        // wp_footer only fires on the front end; the chip gates itself.
        add_action('wp_footer', [self::class, 'render_chip']);
        if (is_admin()) {
            add_action('admin_notices', [self::class, 'render_settings_panel']);
        }
    }

    /**
     * Theme labels for the preview UI. Themes::labels() plus a prettified
     * entry for any theme added at runtime via the 'dcc_seasons_themes'
     * filter, so filter-added themes are previewable without code changes.
     *
     * @return array<string, string>
     */
    private static function labels(): array {
        $labels = Themes::labels();
        foreach (array_keys(Themes::themes()) as $key) {
            if (!isset($labels[$key])) {
                $labels[$key] = ucwords(str_replace('_', ' ', $key));
            }
        }
        return $labels;
    }

    /**
     * Front-end chip: shows which theme is being previewed and lets the
     * admin switch in place or exit. Absent (not hidden) for non-admins
     * and whenever ?dcc_season= is missing.
     */
    public static function render_chip(): void {
        if (!current_user_can('manage_options') || !isset($_GET['dcc_season'])) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
            return;
        }
        $labels  = self::labels();
        $current = sanitize_key(wp_unslash($_GET['dcc_season'])); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        ?>
        <div id="dcc-preview-chip" style="position:fixed;bottom:14px;right:14px;z-index:100001;background:#0a3d62;border:2px solid #f4da62;border-radius:22px;padding:6px 12px;display:flex;align-items:center;gap:8px;font:13px/1 sans-serif;color:#f4da62;box-shadow:0 4px 14px rgba(0,0,0,.4);">
            <span><?php esc_html_e('Previewing:', 'dcc-seasons'); ?></span>
            <select id="dcc-preview-select" style="background:#0a3d62;color:#fff;border:1px solid #f4da62;border-radius:6px;padding:3px 4px;font-size:13px;max-width:180px;">
                <?php foreach ($labels as $key => $label) : ?>
                    <option value="<?php echo esc_attr($key); ?>" <?php selected($key, $current); ?>><?php echo esc_html($label); ?></option>
                <?php endforeach; ?>
                <option value="off" <?php selected('off', $current); ?>><?php esc_html_e('Off (forced none)', 'dcc-seasons'); ?></option>
            </select>
            <button id="dcc-preview-close" aria-label="<?php esc_attr_e('Exit preview', 'dcc-seasons'); ?>" style="background:none;border:none;color:#f4da62;cursor:pointer;font-size:15px;padding:0 2px;">&#10005;</button>
        </div>
        <script>
        (function () {
            function go(param) {
                var u = new URL(window.location.href);
                if (param === null) { u.searchParams.delete('dcc_season'); } else { u.searchParams.set('dcc_season', param); }
                window.location.href = u.toString();
            }
            document.getElementById('dcc-preview-select').addEventListener('change', function () { go(this.value); });
            document.getElementById('dcc-preview-close').addEventListener('click', function () { go(null); });
        })();
        </script>
        <?php
    }

    /**
     * Settings-page panel: one preview button per theme (opening the
     * homepage in a new tab) plus a red-outlined "Off", and a note whose
     * tap count reads the LIVE saved option.
     */
    public static function render_settings_panel(): void {
        // Compare against the hook suffix add_submenu_page() handed back —
        // the screen ID is derived from the parent menu, so a hard-coded
        // string would silently stop matching if the page is re-parented.
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if (!$screen || Settings::hook() === '' || Settings::hook() !== $screen->id) {
            return;
        }
        $labels = self::labels();

        echo '<div class="notice" style="padding:14px 16px;border-left-color:#0a3d62;">';
        echo '<p style="margin:0 0 8px;font-weight:600;">' . esc_html__('Preview a theme (opens the homepage in a new tab):', 'dcc-seasons') . '</p>';
        echo '<p style="margin:0;display:flex;flex-wrap:wrap;gap:6px;">';
        foreach ($labels as $key => $label) {
            $url = home_url('/?dcc_season=' . rawurlencode($key));
            echo '<a class="button button-secondary" target="_blank" rel="noopener" href="' . esc_url($url) . '">' . esc_html($label) . '</a>';
        }
        $off = home_url('/?dcc_season=off');
        echo '<a class="button" target="_blank" rel="noopener" href="' . esc_url($off) . '" style="border-color:#b32d2e;color:#b32d2e;">' . esc_html__('Off (force none)', 'dcc-seasons') . '</a>';
        echo '</p>';

        $taps = (int) Settings::options()['tap_count'];
        /* translators: %d: number of taps configured for the easter egg */
        echo '<p style="margin:8px 0 0;color:#646970;">' . esc_html(sprintf(__('Previews are admin-only; visitors always get the date-driven schedule. Tap the header %d times on a preview page to see that theme\'s Matrix egg.', 'dcc-seasons'), $taps)) . '</p>';
        echo '</div>';
    }
}
