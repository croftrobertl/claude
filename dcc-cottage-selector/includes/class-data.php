<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Read layer over data/cottages.json — the single source of truth for cottage
 * attributes. The JSON is the canonical, human-editable dataset; PHP loads it
 * once and inlines it into the widget's data-config so the browser never has to
 * fetch the file (no extra request, no CORS, no full-page-cache staleness).
 */
final class Data
{
    /** The comparison-table fields. Order drives the Compare matrix. 'guests' is
     *  the sleeps-max capacity and VARIES: 4 where a pull-out couch adds two
     *  (22/23/31/32/35/36), 2 for the studios (33/34). Only 'bed' (queen) is the
     *  same everywhere. */
    public const DIFF_FIELDS = [
        'guests',
        'bed',
        'squareFeet',
        'layoutType',
        'floorLevel',
        'diningSeats',
        'desk',
        'pulloutCouch',
        'screenedPorch',
        'petAllowed',
    ];

    /** @var array<int,array<string,mixed>>|null */
    private static ?array $cache = null;

    /**
     * @return array<int,array<string,mixed>> The 8-cottage dataset, or [] on error.
     */
    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $path = DCCS_DIR . 'data/cottages.json';
        if (!is_readable($path)) {
            error_log('DCCS: cottages.json not readable at ' . $path);
            return self::$cache = [];
        }

        $raw = file_get_contents($path);
        if ($raw === false) {
            error_log('DCCS: failed to read cottages.json');
            return self::$cache = [];
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            error_log('DCCS: cottages.json did not decode to an array');
            return self::$cache = [];
        }

        return self::$cache = $decoded;
    }

    /**
     * Look up a single cottage by its string id (e.g. "22").
     *
     * @return array<string,mixed>|null
     */
    public static function find(string $id): ?array
    {
        foreach (self::all() as $cottage) {
            if ((string) ($cottage['id'] ?? '') === $id) {
                return $cottage;
            }
        }
        return null;
    }
}
