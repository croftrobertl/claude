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
            'guest3_section_title' => 'Guest #3 Information',
            'guest4_section_title' => 'Guest #4 Information',
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
            // Per-night, per-extra-guest amount, used ONLY to label the guest
            // dropdown and write the note. 0 = read it off the configured
            // Service so the label can never disagree with what is charged.
            // The charge itself is always MotoPress's, computed from the
            // Service — this plugin still does no pricing math.
            'guest_fee_amount'      => 0,
            // Sleeping arrangement named in the guest-facing note. One string
            // for the six couch cottages, which share the same layout.
            'couch_beds_text'       => '1 queen-sized bed and a pull-out couch',
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
     *
     * Since 0.3.5 the daily bucket has no lower bound — the fee applies from
     * the first night (owner decision, 2026-08-31), matching the extra-guest
     * fee. `min_daily` is therefore no longer consulted (the option key is kept
     * so saved settings stay valid). Returns 0 only when nights is unknown.
     */
    public static function service_id_for_nights(int $nights): int
    {
        if ($nights <= 0) {
            return 0;
        }
        $t   = self::bucket_thresholds();
        $ids = self::pet_service_ids();

        if ($nights >= $t['min_monthly']) {
            return $ids['monthly'];
        }
        if ($nights >= $t['min_weekly']) {
            return $ids['weekly'];
        }
        return $ids['daily'];
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
     * The per-night, per-extra-guest amount, as a number.
     *
     * Used ONLY to label the guest dropdown and write the guest-facing note.
     * The money itself is still computed by MotoPress from the Service — this
     * is a read of the same source so the label cannot disagree with the
     * charge. Settings value 0 means "read it off the Service", which is the
     * default precisely so the two can't drift.
     */
    public static function guest_fee_amount(): float
    {
        $amount = (float) (self::settings()['guest_fee_amount'] ?? 0);
        if ($amount <= 0) {
            $amount = self::service_price(self::guest_service_ids()['daily'] ?? 0);
        }
        return (float) apply_filters('dcc_checkout_guest_fee_amount', $amount);
    }

    /**
     * A MotoPress Service's own price.
     *
     * DCC-VERIFY: provisional — confirm against live MotoPress.
     * Reads the public API first and falls back to the mphb_price post meta
     * (confirmed on live: service 18063 has mphb_price = 50). Returns 0.0 when
     * it cannot be determined, and every caller treats 0 as "say nothing"
     * rather than printing a wrong number.
     */
    public static function service_price(int $service_id): float
    {
        if ($service_id <= 0) {
            return 0.0;
        }
        if (function_exists('MPHB')) {
            try {
                $repo = MPHB()->getServiceRepository();
                if ($repo && method_exists($repo, 'findById')) {
                    $service = $repo->findById($service_id);
                    if ($service && method_exists($service, 'getPrice')) {
                        $price = (float) $service->getPrice();
                        if ($price > 0) {
                            return $price;
                        }
                    }
                }
            } catch (\Throwable $e) {
                // Fall through to the meta read.
            }
        }
        $post = get_post($service_id);
        if (!$post instanceof \WP_Post || $post->post_type !== 'mphb_room_service') {
            return 0.0;
        }
        return (float) get_post_meta($service_id, 'mphb_price', true);
    }

    /**
     * Format an amount the way the rest of the site shows money.
     *
     * Prefers MotoPress's own formatter so currency/locale stay consistent,
     * then trims a trailing ".00" — the owner-approved copy reads "$50/night",
     * not "$50.00/night".
     */
    public static function format_price(float $amount): string
    {
        $text = '';
        if (function_exists('mphb_format_price')) {
            try {
                $text = (string) mphb_format_price($amount, ['period' => false]);
            } catch (\Throwable $e) {
                $text = '';
            }
        }
        if ($text === '') {
            $text = '$' . number_format($amount, 2);
        }
        $text = wp_strip_all_tags($text);
        // "$50.00" -> "$50"; leaves "$49.50" alone.
        $text = (string) preg_replace('/([.,])00\b/', '', $text);
        return (string) apply_filters('dcc_checkout_format_price', trim($text), $amount);
    }

    /**
     * Formatted cumulative extra-guest fee for each possible extra-guest count,
     * indexed by that count: [1 => "$50", 2 => "$100", ...].
     *
     * Cumulative, not per head — the whole point of the owner's request is that
     * "4 (+$100/night)" states the total the guest will actually pay, instead
     * of leaving them to multiply $50 by a headcount they have to infer.
     *
     * Empty when the fee amount is unknown, so callers print no suffix at all
     * rather than a wrong one.
     *
     * @return array<int,string>
     */
    public static function guest_fee_steps(int $max_extra = 8): array
    {
        $amount = self::guest_fee_amount();
        if ($amount <= 0 || $max_extra < 1) {
            return [];
        }
        $steps = [];
        for ($i = 1; $i <= $max_extra; $i++) {
            $steps[$i] = self::format_price($amount * $i);
        }
        return $steps;
    }

    /** Sleeping arrangement named in the guest-facing extra-guest note. */
    public static function couch_beds_text(): string
    {
        return (string) apply_filters(
            'dcc_checkout_couch_beds_text',
            (string) (self::settings()['couch_beds_text'] ?? '')
        );
    }

    /**
     * The Service IDs actually attached to an accommodation type, or null when
     * that cannot be determined.
     *
     * DCC-VERIFY: provisional — confirm against live MotoPress.
     * MotoPress stores per-accommodation service assignment differently across
     * versions, so this reads the public API and returns null (never an empty
     * array) when it cannot read it. Callers MUST treat null as "unknown" and
     * fail open — never hide something on the strength of a failed read.
     *
     * @return int[]|null
     */
    public static function room_type_service_ids(int $room_type_id): ?array
    {
        if ($room_type_id <= 0 || !function_exists('MPHB')) {
            return null;
        }
        try {
            $repo = MPHB()->getRoomTypeRepository();
            if (!$repo || !method_exists($repo, 'findById')) {
                return null;
            }
            $room_type = $repo->findById($room_type_id);
            if (!$room_type || !method_exists($room_type, 'getServices')) {
                return null;
            }
            $ids = [];
            foreach ((array) $room_type->getServices() as $service) {
                if (is_object($service) && method_exists($service, 'getId')) {
                    $ids[] = (int) $service->getId();
                } elseif (is_numeric($service)) {
                    $ids[] = (int) $service;
                }
            }
            // Empty is ambiguous (genuinely no services vs. an unreadable
            // shape), so it stays "unknown" rather than "definitely none".
            return empty($ids) ? null : array_values(array_unique($ids));
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Does this accommodation actually carry the pet Services?
     * true / false / null = couldn't tell (callers fail open).
     */
    public static function room_type_has_pet_services(int $room_type_id): ?bool
    {
        $attached = self::room_type_service_ids($room_type_id);
        if ($attached === null) {
            return null;
        }
        foreach (array_filter(self::pet_service_id_list()) as $pet_id) {
            if (in_array((int) $pet_id, $attached, true)) {
                return true;
            }
        }
        return false;
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
     * These are RENDERED INPUT NAMES, not MotoPress field slugs. MotoPress
     * builds the input as 'mphb_' . $field->name (mphb-checkout-fields
     * CheckoutView), so the field created in MotoPress is named
     * guest2_first_name and renders here as mphb_guest2_first_name. Creating
     * the field as "mphb_guest2_first_name" renders mphb_mphb_guest2_first_name
     * and nothing matches — the section then silently never appears.
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
     * Rendered input NAMES for guests 3 and 4 — names only, no phone (owner
     * decision, 2026-08-31). Same convention as guest 2: the MotoPress field
     * slugs are guest3_first_name / guest3_last_name / guest4_first_name /
     * guest4_last_name, and MotoPress prefixes each with 'mphb_' when it
     * renders the input.
     *
     * @return array{first_name:string,last_name:string}
     */
    public static function guest3_field_names(): array
    {
        $names = apply_filters('dcc_checkout_guest3_field_names', [
            'first_name' => 'mphb_guest3_first_name',
            'last_name'  => 'mphb_guest3_last_name',
        ]);
        return [
            'first_name' => (string) ($names['first_name'] ?? 'mphb_guest3_first_name'),
            'last_name'  => (string) ($names['last_name'] ?? 'mphb_guest3_last_name'),
        ];
    }

    /** @return array{first_name:string,last_name:string} */
    public static function guest4_field_names(): array
    {
        $names = apply_filters('dcc_checkout_guest4_field_names', [
            'first_name' => 'mphb_guest4_first_name',
            'last_name'  => 'mphb_guest4_last_name',
        ]);
        return [
            'first_name' => (string) ($names['first_name'] ?? 'mphb_guest4_first_name'),
            'last_name'  => (string) ($names['last_name'] ?? 'mphb_guest4_last_name'),
        ];
    }

    /**
     * Every conditional per-guest detail group, keyed by the guest count that
     * reveals it. Drives the JS sections, the server backstop, and the settings
     * page from ONE definition so the three can't drift.
     *
     * @return array<int, array{min:int, names:string[], prefix:string, title:string, section_class:string}>
     */
    public static function guest_field_groups(): array
    {
        $s = self::settings();
        return [
            2 => [
                'min'           => 2,
                'names'         => array_values(self::guest2_field_names()),
                'prefix'        => 'mphb_guest2_',
                'title'         => self::guest2_section_title(),
                'section_class' => 'dcc_checkout-guest2-section',
            ],
            3 => [
                'min'           => 3,
                'names'         => array_values(self::guest3_field_names()),
                'prefix'        => 'mphb_guest3_',
                'title'         => (string) apply_filters('dcc_checkout_guest3_section_title', (string) $s['guest3_section_title']),
                'section_class' => 'dcc_checkout-guest3-section',
            ],
            4 => [
                'min'           => 4,
                'names'         => array_values(self::guest4_field_names()),
                'prefix'        => 'mphb_guest4_',
                'title'         => (string) apply_filters('dcc_checkout_guest4_section_title', (string) $s['guest4_section_title']),
                'section_class' => 'dcc_checkout-guest4-section',
            ],
        ];
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
     * The RENDERED INPUT NAMES for the three dog info Checkout Fields.
     *
     * The MotoPress field slugs are dog_type / dog_size / dog_hair; MotoPress
     * prefixes each with 'mphb_' when it renders the input, which is what we
     * match on. See guest2_field_names() for the double-prefix failure mode.
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
