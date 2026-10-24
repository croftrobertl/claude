<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The SpeedyCache trap of 2026-10-23: its "contain" page exclusions are
 * compared against trim(REQUEST_URI, '/'), so a rule written
 * "/submit-booking/" never matches, the checkout gets cached, and a guest
 * carrying their dates is served a stale "Pick Your Dates Again". Read-only:
 * Ragusa never rewrites the option or touches the cache.
 */
final class Speedycache
{
    public const OPTION = 'speedycache_exclude';

    /** The pages that must never be cached. /guest/ is cached on purpose and is not here. */
    public const BOOKING_PAGES = ['submit-booking', 'account', 'checkout', 'booking-confirmation', 'search-results'];

    /**
     * The exclusion rules, whatever shape the option takes (a list of arrays,
     * or the same as a JSON string, each rule carrying type, prefix, content).
     *
     * @return array<int,array{type:string,prefix:string,content:string}>
     */
    public static function rules(mixed $option): array
    {
        if (is_string($option)) {
            $decoded = json_decode($option, true);
            $option  = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($option)) {
            return [];
        }
        $out = [];
        foreach ($option as $rule) {
            if (is_object($rule)) {
                $rule = (array) $rule;
            }
            if (!is_array($rule)) {
                continue;
            }
            $out[] = [
                'type'    => strtolower(trim((string) ($rule['type'] ?? ''))),
                'prefix'  => strtolower(trim((string) ($rule['prefix'] ?? ''))),
                'content' => trim((string) ($rule['content'] ?? $rule['value'] ?? '')),
            ];
        }
        return $out;
    }

    /**
     * Page rules for a booking page whose text carries a slash: dead rules.
     * JS and CSS rules carry slashes legitimately and are never looked at.
     *
     * @return string[] the rule texts
     */
    public static function dead_booking_rules(mixed $option): array
    {
        $dead = [];
        foreach (self::rules($option) as $rule) {
            if ($rule['type'] !== 'page') {
                continue;
            }
            if (!self::names_booking_page($rule['content'])) {
                continue;
            }
            if (str_contains($rule['content'], '/')) {
                $dead[] = $rule['content'];
            }
        }
        return array_values(array_unique($dead));
    }

    public static function names_booking_page(string $text): bool
    {
        $text = strtolower($text);
        foreach (self::BOOKING_PAGES as $slug) {
            if (str_contains($text, $slug)) {
                return true;
            }
        }
        return false;
    }

    /**
     * A booking page already in the cache: wp-content/cache/speedycache/<host>/all/<slug>/.
     *
     * @return string[] folders, relative to the WordPress root
     */
    public static function cached_booking_folders(): array
    {
        $out  = [];
        $base = Site::content_dir() . '/cache/speedycache';
        if (!is_dir($base)) {
            return [];
        }
        foreach (self::BOOKING_PAGES as $slug) {
            foreach ((array) glob($base . '/*/all/' . $slug, GLOB_ONLYDIR) as $dir) {
                $out[] = Site::rel((string) $dir) . '/';
            }
        }
        sort($out);
        return $out;
    }
}
