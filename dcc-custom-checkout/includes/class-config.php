<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Central configuration.
 *
 * Values are read from the admin settings option (see Settings) merged over
 * sensible defaults, and each is still exposed through a `dcc_checkout_*` filter
 * so the owner can override from a snippet. Business logic never hard-codes a
 * magic number — it calls a method here.
 */
final class Config
{
    /** Option key the Settings page writes to. */
    public const OPTION = 'dcc_checkout_settings';

    /** In-request cache of the merged settings array. */
    private static ?array $cache = null;

    /**
     * Default settings. These match the live doracanalcourt.com configuration
     * and are what a fresh install runs with before anything is saved.
     */
    public static function defaults(): array
    {
        return [
            'pet_fee_enabled'   => 1,
            'pet_accommodations' => [1607],           // Cottage 34 — Coconut Cottage
            'service_daily'     => 17712,             // 2–6 nights   · $25/night
            'service_weekly'    => 17711,             // 7–29 nights  · $20/night
            'service_monthly'   => 14926,             // 30+ nights   · $10/night
            'min_daily'         => 2,
            'min_weekly'        => 7,
            'min_monthly'       => 30,
            // Native MotoPress Checkout Field NAMES for the dog info. The owner
            // creates these fields (Bookings → Settings → Checkout Fields); the
            // plugin shows/hides + requires them by the dog toggle. MotoPress
            // submits them inside customer_fields and saves them to booking meta
            // under the same names — that is where the email tag reads from.
            'dog_field_type'    => 'mphb_dog_type',
            'dog_field_size'    => 'mphb_dog_size',
            'dog_field_hair'    => 'mphb_dog_hair',
            // Titles for the two conditional sections inserted after "Your
            // Information" (Guest #2 Information / Pet Information).
            'guest2_section_title' => 'Guest #2 Information',
            'pet_section_title'    => 'Pet Information',
            // Extra-guest fee (guests beyond the second, $50/night each on the
            // six 4-sleeper cottages). Uses ONE per_night+per_adult MotoPress
            // Service; its ID goes into all three bucket fields (flat pricing —
            // tiering later is a config change). Service IDs default to 0 and
            // the whole feature is DORMANT until all three are non-zero.
            'guest_fee_enabled'     => 1,
            'guest_accommodations'  => [1071, 1069, 1067, 1065, 1740, 1742],
            'guest_service_daily'   => 0,
            'guest_service_weekly'  => 0,
            'guest_service_monthly' => 0,
            'included_guests'       => 2,
        ];
    }

    /**
     * Merged settings (saved option over defaults), cached per request.
     */
    public static function settings(): array
    {
        if (self::$cache === null) {
            $saved = get_option(self::OPTION, []);
            if (!is_array($saved)) {
                $saved = [];
            }
            self::$cache = array_merge(self::defaults(), $saved);
        }
        return self::$cache;
    }

    /** Clear the per-request cache (used after a settings save). */
    public static function flush_cache(): void
    {
        self::$cache = null;
    }

    /* --------------------------------------------------------------------- *
     * Pet fee — feature flag + which accommodations it applies to
     * --------------------------------------------------------------------- */

    /**
     * Master on/off for the pet flow. When off, the toggle/fields never render
     * and no pet service is applied anywhere.
     */
    public static function pet_fee_enabled(): bool
    {
        $enabled = !empty(self::settings()['pet_fee_enabled']);
        return (bool) apply_filters('dcc_checkout_pet_fee_enabled', $enabled);
    }

    /**
     * Accommodation (room type) IDs the pet fee applies to.
     *
     * @return int[]
     */
    public static function pet_accommodations(): array
    {
        $ids = self::settings()['pet_accommodations'] ?? [1607];
        if (!is_array($ids)) {
            $ids = [];
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        /** @var int[] $ids */
        $ids = apply_filters('dcc_checkout_pet_accommodations', $ids);
        return is_array($ids) ? array_values(array_map('intval', $ids)) : [];
    }

    /**
     * Back-compat: the first pet accommodation (was "Cottage 34" only).
     */
    public static function cottage_type_id(): int
    {
        $ids = self::pet_accommodations();
        return $ids[0] ?? 1607;
    }

    /* --------------------------------------------------------------------- *
     * Pet services + night buckets
     * --------------------------------------------------------------------- */

    /**
     * Native MotoPress Service IDs for the per-night pet fee, keyed by
     * length-of-stay bucket. Global across all pet accommodations. Only ever ONE
     * is applied at a time; all three are untaxed.
     *
     * @return array{daily:int,weekly:int,monthly:int}
     */
    public static function pet_service_ids(): array
    {
        $s   = self::settings();
        $ids = apply_filters('dcc_checkout_pet_service_ids', [
            'daily'   => (int) $s['service_daily'],
            'weekly'  => (int) $s['service_weekly'],
            'monthly' => (int) $s['service_monthly'],
        ]);
        return [
            'daily'   => (int) ($ids['daily'] ?? 17712),
            'weekly'  => (int) ($ids['weekly'] ?? 17711),
            'monthly' => (int) ($ids['monthly'] ?? 14926),
        ];
    }

    /**
     * Flat list of the three pet service IDs (for "is this a pet service?" tests).
     *
     * @return int[]
     */
    public static function pet_service_id_list(): array
    {
        return array_values(self::pet_service_ids());
    }

    /**
     * Length-of-stay bucket thresholds (in nights).
     *
     * @return array{min_daily:int,min_weekly:int,min_monthly:int}
     */
    public static function bucket_thresholds(): array
    {
        $s = self::settings();
        $t = apply_filters('dcc_checkout_bucket_thresholds', [
            'min_daily'   => (int) $s['min_daily'],
            'min_weekly'  => (int) $s['min_weekly'],
            'min_monthly' => (int) $s['min_monthly'],
        ]);
        return [
            'min_daily'   => (int) ($t['min_daily'] ?? 2),
            'min_weekly'  => (int) ($t['min_weekly'] ?? 7),
            'min_monthly' => (int) ($t['min_monthly'] ?? 30),
        ];
    }

    /**
     * Resolve the correct pet Service ID for a given night count.
     * Returns 0 when the stay is shorter than the minimum billable bucket.
     */
    public static function service_id_for_nights(int $nights): int
    {
        $t   = self::bucket_thresholds();
        $ids = self::pet_service_ids();

        if ($nights >= $t['min_monthly']) {
            return $ids['monthly'];
        }
        if ($nights >= $t['min_weekly']) {
            return $ids['weekly'];
        }
        if ($nights >= $t['min_daily']) {
            return $ids['daily'];
        }
        return 0;
    }

    /* --------------------------------------------------------------------- *
     * Extra-guest fee (guests beyond the second)
     * --------------------------------------------------------------------- */

    /**
     * Master on/off for the "Pull-out Couch Guests" offering (admin setting).
     * When off, the offering stands down entirely and bookings are capped at
     * included_guests() on the guest accommodations.
     */
    public static function guest_fee_enabled(): bool
    {
        $enabled = !empty(self::settings()['guest_fee_enabled']);
        return (bool) apply_filters('dcc_checkout_guest_fee_enabled', $enabled);
    }

    /**
     * Is the feature actually live? Enabled AND all three bucket service IDs
     * configured. Defaults are 0, so a fresh install is dormant until the real
     * "Extra Guest Fee" service post exists and its ID is entered.
     */
    public static function guest_fee_active(): bool
    {
        if (!self::guest_fee_enabled()) {
            return false;
        }
        foreach (self::guest_service_ids() as $id) {
            if ($id <= 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Accommodation (room type) IDs the extra-guest fee applies to.
     * Default: the six 4-sleeper cottages (22/23/31/32/35/36).
     * Cottages 33 (1604) and 34 (1607) stay capped at 2 and are never listed.
     *
     * @return int[]
     */
    public static function guest_accommodations(): array
    {
        $ids = self::settings()['guest_accommodations'] ?? [];
        if (!is_array($ids)) {
            $ids = [];
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        $ids = apply_filters('dcc_checkout_guest_accommodations', $ids);
        return is_array($ids) ? array_values(array_map('intval', $ids)) : [];
    }

    /**
     * Extra-guest Service IDs by length-of-stay bucket. Flat pricing enters the
     * SAME service ID in all three fields; the bucket machinery mirrors the pet
     * flow so tiering later is a config change, not code.
     *
     * @return array{daily:int,weekly:int,monthly:int}
     */
    public static function guest_service_ids(): array
    {
        $s   = self::settings();
        $ids = apply_filters('dcc_checkout_guest_service_ids', [
            'daily'   => (int) $s['guest_service_daily'],
            'weekly'  => (int) $s['guest_service_weekly'],
            'monthly' => (int) $s['guest_service_monthly'],
        ]);
        return [
            'daily'   => (int) ($ids['daily'] ?? 0),
            'weekly'  => (int) ($ids['weekly'] ?? 0),
            'monthly' => (int) ($ids['monthly'] ?? 0),
        ];
    }

    /**
     * Flat list of the extra-guest service IDs (may contain duplicates when the
     * flat config points all three buckets at one service; deduped).
     *
     * @return int[]
     */
    public static function guest_service_id_list(): array
    {
        return array_values(array_unique(self::guest_service_ids()));
    }

    /**
     * Guests included in the nightly rate; each guest beyond this count incurs
     * the fee. Default 2.
     */
    public static function included_guests(): int
    {
        $n = (int) apply_filters('dcc_checkout_included_guests', (int) self::settings()['included_guests']);
        return max(0, $n);
    }

    /**
     * Resolve the extra-guest Service ID for a night count. Shares the weekly /
     * monthly thresholds with the pet fee (deliberately NOT duplicated).
     *
     * The daily bucket has NO lower bound here: the decided rule is a flat
     * per-night fee "identical for every stay length", so it applies from the
     * first night. (bucket_thresholds()['min_daily'] governs the PET fee only —
     * that fee has its own policy and is live-verified; it is untouched.)
     * Without this floor a 1-night 3–4 guest booking resolved to 0, the JS
     * attached nothing, and the backstop then rejected the booking outright.
     *
     * Returns 0 only when the stay length is unknown (nights <= 0).
     */
    public static function guest_service_id_for_nights(int $nights): int
    {
        if ($nights <= 0) {
            return 0;
        }
        $t   = self::bucket_thresholds();
        $ids = self::guest_service_ids();

        if ($nights >= $t['min_monthly']) {
            return $ids['monthly'];
        }
        if ($nights >= $t['min_weekly']) {
            return $ids['weekly'];
        }
        return $ids['daily'];
    }

    /* --------------------------------------------------------------------- *
     * Second guest
     * --------------------------------------------------------------------- */

    /**
     * The second-guest field input NAMES (verified live). The Checkout Fields
     * post IDs are NOT in the markup, so we target by name.
     *
     * @return array{first_name:string,last_name:string,phone:string}
     */
    public static function guest2_field_names(): array
    {
        $names = apply_filters('dcc_checkout_guest2_field_names', [
            'first_name' => 'mphb_guest2_first_name',
            'last_name'  => 'mphb_guest2_last_name',
            'phone'      => 'mphb_guest2_phone',
        ]);
        return [
            'first_name' => (string) ($names['first_name'] ?? 'mphb_guest2_first_name'),
            'last_name'  => (string) ($names['last_name'] ?? 'mphb_guest2_last_name'),
            'phone'      => (string) ($names['phone'] ?? 'mphb_guest2_phone'),
        ];
    }

    /**
     * Flat list of the three second-guest field names.
     *
     * @return string[]
     */
    public static function guest2_field_name_list(): array
    {
        return array_values(self::guest2_field_names());
    }

    /**
     * Title of the conditional "Guest #2 Information" section.
     */
    public static function guest2_section_title(): string
    {
        return (string) apply_filters(
            'dcc_checkout_guest2_section_title',
            (string) self::settings()['guest2_section_title']
        );
    }

    /**
     * Title of the conditional "Pet Information" section.
     */
    public static function pet_section_title(): string
    {
        return (string) apply_filters(
            'dcc_checkout_pet_section_title',
            (string) self::settings()['pet_section_title']
        );
    }

    /**
     * CSS selector for the "Number of Guests" (adults) driver select.
     */
    public static function guests_selector(): string
    {
        return (string) apply_filters(
            'dcc_checkout_guests_selector',
            'select[name^="mphb_room_details"][name*="[adults]"]'
        );
    }

    /* --------------------------------------------------------------------- *
     * Dog info — native Checkout Field names + booking meta keys
     * --------------------------------------------------------------------- */

    /**
     * The native Checkout Field NAMES for the three dog info fields.
     *
     * @return array{type:string,size:string,hair:string}
     */
    public static function dog_field_names(): array
    {
        $s     = self::settings();
        $names = apply_filters('dcc_checkout_dog_field_names', [
            'type' => (string) $s['dog_field_type'],
            'size' => (string) $s['dog_field_size'],
            'hair' => (string) $s['dog_field_hair'],
        ]);
        return [
            'type' => (string) ($names['type'] ?? 'mphb_dog_type'),
            'size' => (string) ($names['size'] ?? 'mphb_dog_size'),
            'hair' => (string) ($names['hair'] ?? 'mphb_dog_hair'),
        ];
    }

    /**
     * Flat list of the three dog field names.
     *
     * @return string[]
     */
    public static function dog_field_name_list(): array
    {
        return array_values(self::dog_field_names());
    }

    /**
     * Booking meta keys the dog info is stored under. MotoPress saves a checkout
     * field to meta under its field name, so by default the meta keys equal the
     * field names; filterable in case a version prefixes them.
     *
     * @return array{type:string,size:string,hair:string}
     */
    public static function dog_meta_keys(): array
    {
        $keys = apply_filters('dcc_checkout_dog_meta_keys', self::dog_field_names());
        return [
            'type' => (string) ($keys['type'] ?? 'mphb_dog_type'),
            'size' => (string) ($keys['size'] ?? 'mphb_dog_size'),
            'hair' => (string) ($keys['hair'] ?? 'mphb_dog_hair'),
        ];
    }
}
