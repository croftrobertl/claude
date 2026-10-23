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

    /** @var array<int,array<string,mixed>>|null */
    private static ?array $with_photos = null;

    /**
     * The dataset plus each cottage's PHOTO (0.54.0, Rob): the featured image of its
     * MotoPress room type (`roomTypeId`), the photo the site already shows for it.
     * Read-only, server-side, once per request. A cottage whose room type has no
     * featured image simply carries no `photo`, and the card draws its number
     * instead — nothing here may fail a render.
     *
     * Shape: photo = { src, w, h, srcset } — `medium_large` (768px wide), with the
     * attachment's own srcset so a phone at 2x and a 4-across desktop row each pick
     * a sensible size. No alt text: the card's visible name sits right under it.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function all_with_photos(): array
    {
        if (self::$with_photos !== null) {
            return self::$with_photos;
        }
        $all = self::all();
        if (!function_exists('get_post_thumbnail_id') || !function_exists('wp_get_attachment_image_src')) {
            return self::$with_photos = $all;
        }
        $ids = array_values(array_filter(array_map(static fn($c) => (int) ($c['roomTypeId'] ?? 0), $all)));
        // One query for the eight room types' meta instead of one each.
        if ($ids && function_exists('update_meta_cache')) {
            update_meta_cache('post', $ids);
        }
        foreach ($all as $i => $c) {
            $rt = (int) ($c['roomTypeId'] ?? 0);
            $aid = $rt > 0 ? (int) get_post_thumbnail_id($rt) : 0;
            if ($aid <= 0) {
                continue;
            }
            $img = wp_get_attachment_image_src($aid, 'medium_large');
            if (!is_array($img) || empty($img[0])) {
                continue;
            }
            $srcset = function_exists('wp_get_attachment_image_srcset') ? wp_get_attachment_image_srcset($aid, 'medium_large') : '';
            $all[$i]['photo'] = [
                'src'    => (string) $img[0],
                'w'      => (int) ($img[1] ?? 0),
                'h'      => (int) ($img[2] ?? 0),
                'srcset' => is_string($srcset) ? $srcset : '',
            ];
        }
        return self::$with_photos = $all;
    }
}
