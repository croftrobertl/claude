<?php
namespace DCCR;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The page markers Sveti Ivan looks for after an update, verified in live
 * HTML on 2026-10-21. Three belong to DCC plugins the Director updates, so
 * `wp ragusa markers set` changes one when a rename is intentional.
 */
final class Markers
{
    public const OPTION = 'dcc_ragusa_markers';

    public static function defaults(): array
    {
        return [
            '/'                           => ['<title>Dora Canal Court'],
            '/accommodation/cottage-34/'  => ['name="mphbac_sheet_checkin"', 'id="mphb-js"'],
            '/contact/'                   => ['dcc-contact-form'],
            '/submit-booking/'            => ['mphb_sc_checkout-wrapper'],
            '/explore/'                   => ['data-dccwl-viewtrigger'],
        ];
    }

    /** @return array<string,string[]> path => markers */
    public static function all(): array
    {
        $stored = get_option(self::OPTION, null);
        if (!is_array($stored) || $stored === []) {
            return self::defaults();
        }
        $out = [];
        foreach ($stored as $path => $markers) {
            if (is_string($path) && is_array($markers)) {
                $out[$path] = array_values(array_filter(array_map('strval', $markers), static fn($m) => $m !== ''));
            }
        }
        return $out === [] ? self::defaults() : $out;
    }

    public static function set(string $path, array $markers): bool
    {
        $path = '/' . trim($path, '/') . (trim($path, '/') === '' ? '' : '/');
        $markers = array_values(array_filter(array_map(static fn($m) => trim((string) $m), $markers), static fn($m) => $m !== ''));
        if ($markers === [] || count(self::all()) > 20) {
            return false;
        }
        $all        = self::all();
        $all[$path] = $markers;
        if (get_option(self::OPTION, null) === null) {
            return (bool) add_option(self::OPTION, $all, '', 'no');
        }
        update_option(self::OPTION, $all, 'no');
        return true;
    }

    public static function remove(string $path): bool
    {
        $path = '/' . trim($path, '/') . (trim($path, '/') === '' ? '' : '/');
        $all  = self::all();
        if (!isset($all[$path])) {
            return false;
        }
        unset($all[$path]);
        update_option(self::OPTION, $all, 'no');
        return true;
    }

    public static function reset(): void
    {
        delete_option(self::OPTION);
    }
}
