<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Read-only helpers over the checkout submission ($_POST).
 *
 * IMPORTANT: MotoPress submits a NORMALIZED payload, not the raw form. At
 * booking creation the relevant top-level keys are:
 *   check_in_date, check_out_date, checkout_id, coupon_code,
 *   customer_fields, lang, room_details
 * (verified on staging with a hook trace). Earlier code read `mphb_room_details`
 * / `mphb_check_in_date`, which never existed in the payload, so every
 * server-side check was silently inert. We now read the real keys and keep the
 * old `mphb_*` names as fallbacks for resilience across versions.
 *
 * Custom top-level fields (e.g. our old `dcc_checkout_dog*`) are dropped by
 * MotoPress entirely — only its own recognized fields survive. That is why the
 * dog info is captured through NATIVE Checkout Fields (submitted inside
 * `customer_fields`) rather than bespoke inputs.
 */
final class Checkout_Request
{
    /**
     * Raw, unslashed room-details array from the POST (or empty array).
     * Prefers the real `room_details` key; falls back to `mphb_room_details`.
     *
     * @return array<int|string,mixed>
     */
    public static function room_details(): array
    {
        foreach (['room_details', 'mphb_room_details'] as $key) {
            if (isset($_POST[$key]) && is_array($_POST[$key])) {
                return wp_unslash($_POST[$key]); // phpcs:ignore WordPress.Security
            }
        }
        return [];
    }

    /**
     * Normalized customer fields array (native Checkout Fields live here).
     *
     * @return array<int|string,mixed>
     */
    public static function customer_fields(): array
    {
        if (isset($_POST['customer_fields']) && is_array($_POST['customer_fields'])) {
            return wp_unslash($_POST['customer_fields']); // phpcs:ignore WordPress.Security
        }
        return [];
    }

    /**
     * Is the current request a checkout submission carrying room details?
     * (Callers that redirect must additionally skip AJAX — see Pet_Service /
     * Guest_Fields — because a redirect would break an AJAX checkout response.)
     */
    public static function is_checkout_submission(): bool
    {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
            return false;
        }
        return self::room_details() !== [];
    }

    /**
     * The submitted accommodation (room type) IDs, scanned from the room details.
     *
     * @return int[]
     */
    public static function room_type_ids(): array
    {
        $ids = [];
        self::walk(self::room_details(), static function ($key, $value) use (&$ids): void {
            if (is_scalar($value) && (string) $key === 'room_type_id') {
                $ids[] = (int) $value;
            }
        });
        return array_values(array_unique(array_filter($ids)));
    }

    /**
     * Does the submitted room-details array attach this Service ID?
     *
     * Only values inside a `services` branch count — scanning the whole
     * room_details payload would also match rate IDs, room IDs, etc., and a
     * future post whose ID collides with a pet Service ID would false-positive.
     * Within the services branch, `quantity` values are excluded; both shapes
     * (list of ['id' => …, 'quantity' => …] arrays and plain ID lists) match.
     */
    public static function contains_service_id(int $service_id): bool
    {
        return in_array($service_id, self::attached_service_ids(), true);
    }

    /**
     * All Service IDs attached in room_details (see contains_service_id()).
     *
     * @return int[]
     */
    public static function attached_service_ids(): array
    {
        $found = [];

        $walk = static function ($data, bool $in_services) use (&$walk, &$found): void {
            if (!is_array($data)) {
                return;
            }
            foreach ($data as $key => $value) {
                $key_str = (string) $key;
                if ($in_services && is_scalar($value) && $key_str !== 'quantity') {
                    $found[] = (int) $value;
                }
                if (is_array($value)) {
                    $walk($value, $in_services || $key_str === 'services');
                }
            }
        };
        $walk(self::room_details(), false);

        return array_values(array_unique(array_filter($found)));
    }

    /**
     * Look up a customer field value by its field name (scans `customer_fields`
     * recursively for a matching key). Returns null when absent.
     */
    public static function customer_field_value(string $name): ?string
    {
        $result = null;
        self::walk(self::customer_fields(), static function ($key, $value) use (&$result, $name): void {
            if ($result !== null) {
                return;
            }
            if (is_scalar($value) && (string) $key === $name) {
                $result = (string) $value;
            }
        });
        return $result === null ? null : sanitize_text_field($result);
    }

    /**
     * Compute the number of nights from the submitted check-in / check-out.
     * Returns 0 when the dates are missing or unparseable.
     */
    public static function nights(): int
    {
        $in  = self::posted_date(['check_in_date', 'mphb_check_in_date']);
        $out = self::posted_date(['check_out_date', 'mphb_check_out_date']);
        if ($in === null || $out === null) {
            return 0;
        }
        $diff = (int) round(($out - $in) / DAY_IN_SECONDS);
        return max(0, $diff);
    }

    /**
     * Parse a Y-m-d date field (first matching key) into a UTC timestamp.
     *
     * @param string[] $keys
     */
    private static function posted_date(array $keys): ?int
    {
        foreach ($keys as $key) {
            if (empty($_POST[$key])) {
                continue;
            }
            $raw = sanitize_text_field(wp_unslash($_POST[$key]));
            $dt  = \DateTimeImmutable::createFromFormat('!Y-m-d', $raw, new \DateTimeZone('UTC'));
            if ($dt !== false) {
                return $dt->getTimestamp();
            }
        }
        return null;
    }

    /**
     * Recursively visit every leaf/branch of an array, invoking
     * $cb($key, $value) for each element.
     *
     * @param mixed    $data
     * @param callable $cb
     */
    private static function walk($data, callable $cb): void
    {
        if (!is_array($data)) {
            return;
        }
        foreach ($data as $key => $value) {
            $cb($key, $value);
            if (is_array($value)) {
                self::walk($value, $cb);
            }
        }
    }

    /**
     * Redirect back to the referring checkout page with an error code the
     * front-end script turns into a friendly banner. Always exits.
     *
     * Callers MUST NOT invoke this during an AJAX request (it would clobber the
     * JSON response MotoPress expects) — guard with wp_doing_ajax() first.
     */
    public static function redirect_back_with_error(string $code): void
    {
        $referer = wp_get_referer();
        if (!$referer) {
            $referer = home_url('/');
        }
        $url = add_query_arg('dcc_checkout_error', rawurlencode($code), $referer);
        wp_safe_redirect($url);
        exit;
    }
}
