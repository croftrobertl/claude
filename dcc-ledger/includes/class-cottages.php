<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * The 8 cottages, the packaged channel maps, and the reconciliation window.
 *
 * Crofty Bear (the Gatlinburg RV lot) is excluded everywhere: its ids are listed
 * so an importer can report "excluded" rather than "unknown cottage".
 */
final class Cottages
{
    public const COTTAGES = ['22', '23', '31', '32', '33', '34', '35', '36'];

    public const CHANNELS = ['airbnb', 'bookingcom', 'vrbo'];

    /** The period Rob reconciled against the platform exports. */
    public const WINDOW_START       = '2025-01-01';
    public const RECONCILED_THROUGH = '2026-09-30';

    public const EXCLUDED = 'crofty-bear';

    /** Booking.com hotel id => cottage. */
    public const BOOKINGCOM_MAP = [
        '14033916' => '22',
        '14516923' => '23',
        '14517709' => '31',
        '14571017' => '32',
        '14571101' => '33',
        '14571231' => '34',
        '14571448' => '35',
        '14571586' => '36',
        '14946642' => self::EXCLUDED,
    ];

    /** Vrbo listing / property id => cottage. There is no Vrbo listing for 33. */
    public const VRBO_MAP = [
        '4047892' => '22',
        '4395980' => '23',
        '4400665' => '31',
        '4398179' => '32',
        '4365326' => '34',
        '4396252' => '35',
        '4355951' => '36',
        '4356282' => self::EXCLUDED,
    ];

    /** MotoPress physical room id => cottage. */
    public const MPHB_ROOM_MAP = [
        1072 => '22',
        1070 => '23',
        1068 => '31',
        1066 => '32',
        1613 => '33',
        1614 => '34',
        1806 => '35',
        1807 => '36',
    ];

    /** MotoPress room type id => cottage (same order as the rooms above). */
    public const MPHB_ROOM_TYPE_MAP = [
        1071 => '22',
        1069 => '23',
        1067 => '31',
        1065 => '32',
        1604 => '33',
        1607 => '34',
        1740 => '35',
        1742 => '36',
    ];

    public static function is_cottage(string $cottage): bool
    {
        return in_array($cottage, self::COTTAGES, true);
    }

    /**
     * @return array<string,string> hotel id => cottage ('crofty-bear' for the excluded lot)
     */
    public static function bookingcom_map(): array
    {
        return Settings::map('bookingcom', self::BOOKINGCOM_MAP);
    }

    /**
     * @return array<string,string> listing id => cottage
     */
    public static function vrbo_map(): array
    {
        return Settings::map('vrbo', self::VRBO_MAP);
    }

    /**
     * Airbnb has no numeric listing id in the exports — the cottage is read from
     * the listing title, "Cottage NN: … | Dora Canal Court" or the older
     * "Dora Canal Court Cottage NN".
     *
     * @return string A cottage number, self::EXCLUDED, or '' when unknown.
     */
    public static function from_airbnb_listing(string $listing): string
    {
        if ($listing === '') {
            return '';
        }
        if (self::is_excluded_text($listing)) {
            return self::EXCLUDED;
        }
        if (preg_match('/cottage\s*#?\s*(\d{2})\b/i', $listing, $m) === 1 && self::is_cottage($m[1])) {
            return $m[1];
        }
        return '';
    }

    /**
     * Crofty Bear (the Gatlinburg RV lot) and Hipcamp are out of scope
     * everywhere, on every channel and in every report.
     */
    public static function is_excluded_text(string $text): bool
    {
        return stripos($text, 'crofty bear') !== false
            || stripos($text, 'croftybear') !== false
            || stripos($text, 'hipcamp') !== false;
    }

    public static function from_bookingcom_hotel_id(string $hotel_id): string
    {
        $map = self::bookingcom_map();
        return $map[trim($hotel_id)] ?? '';
    }

    public static function from_vrbo_listing_id(string $listing_id): string
    {
        $map = self::vrbo_map();
        return $map[trim($listing_id)] ?? '';
    }

    public static function from_mphb_room_id(int $room_id): string
    {
        return self::MPHB_ROOM_MAP[$room_id] ?? '';
    }

    /** Human label for a cottage number, e.g. "Cottage 22". */
    public static function label(string $cottage): string
    {
        /* translators: %s: cottage number, e.g. 22 */
        return sprintf(__('Cottage %s', 'dcc-ledger'), $cottage);
    }

    public static function channel_label(string $channel): string
    {
        $labels = [
            'airbnb'     => __('Airbnb', 'dcc-ledger'),
            'bookingcom' => __('Booking.com', 'dcc-ledger'),
            'vrbo'       => __('Vrbo', 'dcc-ledger'),
            'direct'     => __('Direct', 'dcc-ledger'),
        ];
        return $labels[$channel] ?? $channel;
    }
}
