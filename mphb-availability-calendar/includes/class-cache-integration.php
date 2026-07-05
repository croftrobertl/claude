<?php
namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

final class Cache_Integration
{
    private const NOTICE_TRANSIENT = 'mphbac_notice_speedycache';
    private const SPEEDYCACHE_OPTION_KEYS = [
        'speedycache_settings',
        'speedycache_options',
        'speedycache_pro_settings',
    ];

    public static function ajax_exclusion_pattern(): string
    {
        return '/wp-admin/admin-ajax.php?action=' . MPHBAC_AJAX_ACTION;
    }

    public static function on_activate(): void
    {
        $result = self::add_speedycache_exclusion();
        set_transient(self::NOTICE_TRANSIENT, $result, 5 * MINUTE_IN_SECONDS);
    }

    public static function on_deactivate(): void
    {
        Cache::flush_all();
        delete_transient(self::NOTICE_TRANSIENT);
    }

    /**
     * Register the request-time exclusion filter. Called from Plugin::boot()
     * on every request (so SpeedyCache versions that consult the filter at
     * serve time always see our URL, and the exclusion self-heals if
     * SpeedyCache's settings are reset without a plugin reactivation) and
     * from add_speedycache_exclusion() during activation.
     */
    public static function register_runtime_filter(): void
    {
        add_filter('speedycache_exclude_urls', static function ($urls) {
            $urls = is_array($urls) ? $urls : [];
            $pattern = self::ajax_exclusion_pattern();
            if (!in_array($pattern, $urls, true)) {
                $urls[] = $pattern;
            }
            return $urls;
        });
    }

    /**
     * @return string One of: 'success', 'not_installed', 'failed'.
     */
    public static function add_speedycache_exclusion(): string
    {
        $pattern = self::ajax_exclusion_pattern();

        self::register_runtime_filter();

        $any_found = false;
        $any_updated = false;

        foreach (self::SPEEDYCACHE_OPTION_KEYS as $option_key) {
            $settings = get_option($option_key);
            if ($settings === false) {
                continue;
            }
            $any_found = true;

            $updated = self::merge_exclusion_into_settings($settings, $pattern);
            if ($updated !== null) {
                update_option($option_key, $updated);
                $any_updated = true;
            }
        }

        if (!$any_found) {
            return 'not_installed';
        }
        return $any_updated ? 'success' : 'failed';
    }

    /**
     * Walk SpeedyCache's settings structure looking for any array keyed like an
     * exclusion list (exclude_urls / excluded_urls / exclusions) and append our
     * pattern if absent. Returns the modified settings, or null if nothing changed.
     *
     * Depth-limited: a guard at 8 levels prevents stack overflow on
     * pathological (cyclic or adversarial) option arrays. SpeedyCache's own
     * shape is shallow (2-3 levels), so 8 is well above the legitimate ceiling.
     *
     * @param mixed $settings
     * @return mixed|null
     */
    private static function merge_exclusion_into_settings($settings, string $pattern, int $depth = 0)
    {
        if ($depth > 8 || !is_array($settings)) {
            return null;
        }
        $exclusion_keys = ['exclude_urls', 'excluded_urls', 'exclusions', 'cache_exclude_urls', 'exclude_url'];
        $changed = false;

        foreach ($settings as $key => $value) {
            if (in_array($key, $exclusion_keys, true)) {
                if (is_string($value)) {
                    if (!str_contains($value, $pattern)) {
                        $settings[$key] = rtrim($value, "\n") . "\n" . $pattern;
                        $changed = true;
                    }
                } elseif (is_array($value)) {
                    if (!in_array($pattern, $value, true)) {
                        $value[] = $pattern;
                        $settings[$key] = $value;
                        $changed = true;
                    }
                }
            } elseif (is_array($value)) {
                $nested = self::merge_exclusion_into_settings($value, $pattern, $depth + 1);
                if ($nested !== null) {
                    $settings[$key] = $nested;
                    $changed = true;
                }
            }
        }

        return $changed ? $settings : null;
    }

    public static function admin_notice(): void
    {
        if (!current_user_can('activate_plugins')) {
            return;
        }
        $state = get_transient(self::NOTICE_TRANSIENT);
        if (!$state) {
            return;
        }
        delete_transient(self::NOTICE_TRANSIENT);

        [$class, $message] = match ($state) {
            'success' => [
                'notice-success',
                __('MPHB Availability Calendar: SpeedyCache exclusion added for the calendar AJAX endpoint.', 'mphb-availability-calendar'),
            ],
            'not_installed' => [
                'notice-info',
                __('MPHB Availability Calendar: SpeedyCache was not detected, so no exclusion was added. If you install it later, deactivate and reactivate this plugin to register the exclusion.', 'mphb-availability-calendar'),
            ],
            default => [
                'notice-warning',
                __('MPHB Availability Calendar: Could not automatically add a SpeedyCache exclusion. Please add /wp-admin/admin-ajax.php?action=mphbac_query to your SpeedyCache URL exclusions manually.', 'mphb-availability-calendar'),
            ],
        };

        printf(
            '<div class="notice %1$s is-dismissible"><p>%2$s</p></div>',
            esc_attr($class),
            esc_html($message)
        );
    }
}
