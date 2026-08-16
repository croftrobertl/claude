<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Central, filterable configuration.
 *
 * Every site-specific ID or threshold lives here so the plugin never hard-codes
 * a magic number in business logic. Each value is exposed through a
 * `dcc_checkout_*` filter, so the owner can retune from a snippet without
 * editing the plugin.
 */
final class Config
{
    /**
     * Accommodation (room type) ID for Cottage 34 — Coconut Cottage.
     * The pet flow (Part D) applies to this cottage only.
     */
    public static function cottage_type_id(): int
    {
        return (int) apply_filters('dcc_checkout_cottage_type_id', 1607);
    }

    /**
     * Native MotoPress Service IDs for the per-night pet fee, keyed by
     * length-of-stay bucket. All three are "Per Day · Per Accommodation" and
     * intentionally untaxed (see readme). Only ever ONE is applied at a time.
     *
     * @return array{daily:int,weekly:int,monthly:int}
     */
    public static function pet_service_ids(): array
    {
        $ids = apply_filters('dcc_checkout_pet_service_ids', [
            'daily'   => 17712, // 2–6 nights   · $25/night
            'weekly'  => 17711, // 7–29 nights  · $20/night
            'monthly' => 14926, // 30+ nights   · $10/night
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
     * daily:   min_daily   .. (min_weekly - 1)
     * weekly:  min_weekly  .. (min_monthly - 1)
     * monthly: min_monthly .. ∞
     *
     * @return array{min_daily:int,min_weekly:int,min_monthly:int}
     */
    public static function bucket_thresholds(): array
    {
        $t = apply_filters('dcc_checkout_bucket_thresholds', [
            'min_daily'   => 2,
            'min_weekly'  => 7,
            'min_monthly' => 30,
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

    /**
     * Checkout Fields addon field IDs for the second guest.
     *
     * @return array{first_name:int,last_name:int,phone:int}
     */
    public static function guest2_field_ids(): array
    {
        $ids = apply_filters('dcc_checkout_guest2_field_ids', [
            'first_name' => 8312,
            'last_name'  => 8313,
            'phone'      => 8314,
        ]);
        return [
            'first_name' => (int) ($ids['first_name'] ?? 8312),
            'last_name'  => (int) ($ids['last_name'] ?? 8313),
            'phone'      => (int) ($ids['phone'] ?? 8314),
        ];
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

    /**
     * Booking meta keys used to persist the captured dog info.
     *
     * @return array{type:string,size:string,hair:string,applied:string}
     */
    public static function pet_meta_keys(): array
    {
        return [
            'type'    => '_dcc_checkout_dog_type',
            'size'    => '_dcc_checkout_dog_size',
            'hair'    => '_dcc_checkout_dog_hair',
            'applied' => '_dcc_checkout_pet_service_id',
        ];
    }
}
