<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Site-wide plugin settings: the DEFAULTS every widget inherits from.
 *
 * Standing rule on this project: a site-wide choice belongs in plugin defaults,
 * not in a per-widget override. A stored per-widget value MASKS the default, and
 * once three widgets each carry their own copy nobody can tell which one the site
 * is actually using. So everything here is a default; a widget overrides it only
 * when someone deliberately sets that control (see Selector_Widget's inherit
 * sentinel), and clearing the control hands the decision back to this page.
 *
 * THE OPTION IS A FLAT MAP, deliberately. A nested array cannot be merged with
 * array_merge() without losing new sub-keys, which is exactly how a new version's
 * defaults fail to reach an already-stored row (DCC Seasons 4.0.0 shipped that
 * bug). Flat + array_merge() means a key added in a later release appears
 * automatically on the next read, with no migration step to forget.
 */
final class Settings
{
    /** Stored option name. Changing this strands the owner's saved values. */
    public const OPTION = 'dccs_settings';

    /** Bumped when a release adds keys; recorded so the admin page can show it. */
    public const SCHEMA = 1;

    /**
     * Canonical defaults. EVERY VALUE HERE REPRODUCES 0.43.0 BEHAVIOUR EXACTLY —
     * a fresh install with no stored option must render byte-identically to the
     * release before this page existed. A PHP test asserts that against the
     * literals that used to be hard-coded.
     *
     * @return array<string,mixed>
     */
    public static function defaults(): array
    {
        return [
            // --- Results ---
            'results_count'     => 3,      // selector.js ranked.slice(0, 3)
            'badges_max'        => 3,      // badges.slice(0, 3)
            'reasons_max'       => 3,      // labels.js whyFits(...).slice(0, 3)

            // --- Modes ---
            'start_mode'        => 'quick',
            'enabled_modes'     => ['quick', 'weights', 'compare'],
            'show_heading'      => true,
            'show_review'       => false,
            'show_compare_tip'  => false,

            // --- Links under the question notes (empty = no link rendered) ---
            'capacity_fee_url'  => '',
            'pet_fee_url'       => '',

            // --- Availability: the plugin's ONLY runtime request, off by default ---
            'avail_enable'       => false,
            'avail_max_nights'   => 95,
            'avail_action'       => 'mphbac_query',
            'avail_calendar_url' => '',
        ];
    }

    /** Keys shown in the collapsed "Advanced" block; everything else is common. */
    public const ADVANCED = [
        'badges_max', 'reasons_max', 'avail_action', 'avail_max_nights', 'avail_calendar_url',
    ];

    /**
     * Stored values merged OVER the defaults. This merge IS the upgrade path:
     * a key introduced by a later release is absent from the stored row and picks
     * up its default here, on the very next read, without a migration hook that
     * somebody has to remember to run.
     *
     * @return array<string,mixed>
     */
    public static function get(): array
    {
        $stored = function_exists('get_option') ? get_option(self::OPTION, []) : [];
        if (!is_array($stored)) {
            $stored = [];
        }
        // Drop keys the plugin no longer knows about rather than letting them ride
        // along: a stale key read by nothing is a trap for the next person reading
        // the option in the database.
        $stored = array_intersect_key($stored, self::defaults());

        return array_merge(self::defaults(), $stored);
    }

    /** One setting, defaulted. */
    public static function value(string $key)
    {
        $all = self::get();
        return $all[$key] ?? null;
    }

    /**
     * Sanitise a submitted form. Never trusts shape OR range: an out-of-range or
     * unrecognised value falls back to the DEFAULT rather than being clamped
     * silently to an edge, so a broken POST cannot quietly reconfigure the site.
     *
     * @param mixed $input
     * @return array<string,mixed>
     */
    public static function sanitize($input): array
    {
        $d = self::defaults();
        $in = is_array($input) ? $input : [];
        $out = [];

        $int = static function ($v, int $min, int $max, int $fallback): int {
            if (!is_scalar($v) || $v === '' || !preg_match('/^-?\d+$/', (string) $v)) {
                return $fallback;
            }
            $n = (int) $v;
            return ($n >= $min && $n <= $max) ? $n : $fallback;
        };
        $bool = static fn($v): bool => !empty($v) && $v !== '0';
        $url  = static function ($v): string {
            if (!is_string($v) || trim($v) === '') {
                return '';
            }
            $u = function_exists('esc_url_raw') ? esc_url_raw(trim($v)) : trim($v);
            // Only http(s) and site-relative targets; a javascript: or data: URL in
            // an option that gets printed into an href is an XSS waiting to happen.
            return preg_match('#^(https?://|/)#i', $u) ? $u : '';
        };

        $cottages = 8;
        $out['results_count'] = $int($in['results_count'] ?? null, 1, $cottages, $d['results_count']);
        $out['badges_max']    = $int($in['badges_max'] ?? null, 1, 6, $d['badges_max']);
        $out['reasons_max']   = $int($in['reasons_max'] ?? null, 1, 6, $d['reasons_max']);

        $modes = ['quick', 'weights', 'compare'];
        $picked = is_array($in['enabled_modes'] ?? null)
            ? array_values(array_intersect($modes, array_map('strval', $in['enabled_modes'])))
            : [];
        // Never let the owner save a widget with no modes at all — that renders a
        // landing screen with nothing to click.
        $out['enabled_modes'] = $picked !== [] ? $picked : $d['enabled_modes'];

        $start = is_string($in['start_mode'] ?? null) ? $in['start_mode'] : '';
        $out['start_mode'] = in_array($start, $out['enabled_modes'], true)
            ? $start
            : $out['enabled_modes'][0];

        $out['show_heading']     = $bool($in['show_heading'] ?? null);
        $out['show_review']      = $bool($in['show_review'] ?? null);
        $out['show_compare_tip'] = $bool($in['show_compare_tip'] ?? null);

        $out['capacity_fee_url'] = $url($in['capacity_fee_url'] ?? null);
        $out['pet_fee_url']      = $url($in['pet_fee_url'] ?? null);

        $out['avail_enable']       = $bool($in['avail_enable'] ?? null);
        $out['avail_max_nights']   = $int($in['avail_max_nights'] ?? null, 1, 365, $d['avail_max_nights']);
        $out['avail_calendar_url'] = $url($in['avail_calendar_url'] ?? null);

        // The AJAX action is a WordPress action slug, not free text.
        $act = is_string($in['avail_action'] ?? null) ? trim($in['avail_action']) : '';
        $out['avail_action'] = preg_match('/^[A-Za-z0-9_\-]{1,64}$/', $act) ? $act : $d['avail_action'];

        return $out;
    }
}
