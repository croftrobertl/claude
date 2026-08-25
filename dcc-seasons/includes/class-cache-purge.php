<?php
/**
 * Page-cache purge on settings save.
 *
 * The whole client config — density, opacity, tap settings, the schedule —
 * is inlined into the page, and since 3.5.0 the "Where effects appear" scope
 * decides server-side whether that markup is emitted at all. Both are baked
 * into cached HTML, so ANY options save can leave stale pages behind.
 * SpeedyCache Pro fronts this site, so saving purges the page cache.
 *
 * Nothing here assumes a particular cache plugin is installed: every entry
 * point is guarded, and the outcome is reported back to the settings page so
 * the owner is told to purge by hand if nothing could be called
 * automatically. No cache directory is ever deleted directly — guessing at
 * another plugin's storage layout is how you break a site.
 *
 * @package DCC_Seasons
 */

namespace DCC_Seasons;

if (!defined('ABSPATH')) {
    exit;
}

class Cache_Purge {

    /** Transient carrying the last purge outcome to the settings notice. */
    public const NOTICE = 'dcc_seasons_purge_notice';

    /**
     * Purge every page cache we can reach.
     *
     * @return string[] Human-readable names of what actually ran (empty if nothing did).
     */
    public static function purge(): array {
        $ran = [];

        // SpeedyCache / SpeedyCache Pro — the cache actually running here.
        foreach (['speedycache_clear_cache', 'speedycache_clear_all_cache', 'speedycache_purge_all'] as $fn) {
            if (function_exists($fn)) {
                try {
                    $fn();
                    $ran[] = 'SpeedyCache (' . $fn . '())';
                    break;
                } catch (\Throwable $e) {
                    self::log($fn, $e);
                }
            }
        }
        if (!$ran) {
            foreach ([['\SpeedyCache\Cache', 'clear_all'], ['\SpeedyCache\Cache', 'clear'], ['SpeedyCache', 'clear_cache']] as [$class, $method]) {
                if (class_exists($class) && method_exists($class, $method) && is_callable([$class, $method])) {
                    try {
                        call_user_func([$class, $method]);
                        $ran[] = 'SpeedyCache (' . ltrim($class, '\\') . '::' . $method . '())';
                        break;
                    } catch (\Throwable $e) {
                        self::log($class . '::' . $method, $e);
                    }
                }
            }
        }

        // Other common full-page caches, so the plugin stays portable.
        $others = [
            'wp_cache_clear_cache'       => 'WP Super Cache',
            'rocket_clean_domain'        => 'WP Rocket',
            'w3tc_flush_posts'           => 'W3 Total Cache',
            'wpfc_clear_all_cache'       => 'WP Fastest Cache',
        ];
        foreach ($others as $fn => $label) {
            if (function_exists($fn)) {
                try {
                    $fn();
                    $ran[] = $label;
                } catch (\Throwable $e) {
                    self::log($fn, $e);
                }
            }
        }
        if (class_exists('\LiteSpeed\Purge') && method_exists('\LiteSpeed\Purge', 'purge_all')) {
            try {
                \LiteSpeed\Purge::purge_all('DCC Seasons settings saved');
                $ran[] = 'LiteSpeed Cache';
            } catch (\Throwable $e) {
                self::log('LiteSpeed\Purge::purge_all', $e);
            }
        }

        // WP's own object cache — cheap and always present.
        if (function_exists('wp_cache_flush_runtime')) {
            wp_cache_flush_runtime();
        }

        /**
         * Fires after DCC Seasons has purged what it can. Hook this to reach
         * a cache this class doesn't know about.
         *
         * @param string[] $ran Names of the purges that ran.
         */
        do_action('dcc_seasons_purged_cache', $ran);

        return $ran;
    }

    /**
     * Purge and stash the outcome for the settings-page notice.
     */
    public static function purge_and_report(): void {
        $ran = self::purge();
        set_transient(self::NOTICE, $ran ? $ran : ['none'], 60);
    }

    private static function log(string $what, \Throwable $e): void {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('DCC Seasons: cache purge via ' . $what . ' failed: ' . $e->getMessage()); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
        }
    }
}
