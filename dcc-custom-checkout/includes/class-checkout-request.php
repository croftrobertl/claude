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
     * When set, every reader pulls from this parsed payload instead of $_POST.
     * The REST guard sets it to WP_REST_Request::get_params() — the parsed body
     * regardless of content type (JSON or multipart) and already unslashed by
     * core — so the same validators enforce identically on both transports.
     * A JSON checkout leaves $_POST empty, which is exactly the bypass this
     * closes (2026-08-30 audit).
     *
     * @var array<int|string,mixed>|null
     */
    private static ?array $payload = null;

    /**
     * @param array<int|string,mixed> $data Parsed request params (unslashed).
     */
    public static function set_payload(array $data): void
    {
        self::$payload = $data;
    }

    public static function clear_payload(): void
    {
        self::$payload = null;
    }

    /**
     * Should the wp_loaded backstops stand down on this request? True when the
     * request targets the MotoPress checkout REST route AND the REST guard is
     * registered to enforce there (with a proper JSON error instead of a 302
     * that fetch() follows opaquely). If the guard ever failed to register,
     * this returns false and the legacy $_POST path keeps enforcing.
     */
    public static function defer_to_rest(): bool
    {
        if (!Rest_Guard::is_registered()) {
            return false;
        }
        $uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
        // Covers /wp-json/mphb/v1/checkout and the plain-permalink
        // ?rest_route=/mphb/v1/checkout form (also URL-encoded).
        return strpos($uri, '/mphb/v1/checkout') !== false
            || strpos(rawurldecode($uri), '/mphb/v1/checkout') !== false;
    }

    /**
     * Raw, unslashed room-details array from the submission (or empty array).
     * Prefers the real `room_details` key; falls back to `mphb_room_details`.
     *
     * @return array<int|string,mixed>
     */
    public static function room_details(): array
    {
        foreach (['room_details', 'mphb_room_details'] as $key) {
            if (self::$payload !== null) {
                if (isset(self::$payload[$key]) && is_array(self::$payload[$key])) {
                    return self::$payload[$key]; // REST params: already unslashed
                }
            } elseif (isset($_POST[$key]) && is_array($_POST[$key])) {
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
        if (self::$payload !== null) {
            $cf = self::$payload['customer_fields'] ?? null;
            return is_array($cf) ? $cf : [];
        }
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
        if (self::$payload === null && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
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
     * Within the services branch, `quantity` AND `adults` values are excluded
     * (a per-adult service submits a small services[j][adults] count that must
     * never be mistaken for a service ID); both shapes (list of
     * ['id' => …, 'quantity' => …] arrays and plain ID lists) match.
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
                if ($in_services && is_scalar($value) && $key_str !== 'quantity' && $key_str !== 'adults') {
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
     * Structured per-room view of the submitted room_details, for rules that
     * must bind a service to ITS room (attached_service_ids()/room_type_ids()
     * flatten across rooms and are too coarse for that). Shape-tolerant: each
     * room contributes room_type_id, adults, and its services as
     * {id, adults, quantity} triples (plain scalar service entries become
     * {id, 0, 0}).
     *
     * @return array<int, array{room_type_id:int, adults:int, services: array<int, array{id:int, adults:int, quantity:int}>}>
     */
    public static function rooms(): array
    {
        $out = [];
        foreach (self::room_details() as $room) {
            if (!is_array($room)) {
                continue;
            }
            $services = [];
            if (isset($room['services']) && is_array($room['services'])) {
                foreach ($room['services'] as $svc) {
                    if (is_array($svc)) {
                        $services[] = [
                            'id'       => isset($svc['id']) && is_scalar($svc['id']) ? (int) $svc['id'] : 0,
                            'adults'   => isset($svc['adults']) && is_scalar($svc['adults']) ? (int) $svc['adults'] : 0,
                            'quantity' => isset($svc['quantity']) && is_scalar($svc['quantity']) ? (int) $svc['quantity'] : 0,
                        ];
                    } elseif (is_scalar($svc)) {
                        $services[] = ['id' => (int) $svc, 'adults' => 0, 'quantity' => 0];
                    }
                }
            }
            $out[] = [
                'room_type_id' => isset($room['room_type_id']) && is_scalar($room['room_type_id']) ? (int) $room['room_type_id'] : 0,
                'adults'       => isset($room['adults']) && is_scalar($room['adults']) ? (int) $room['adults'] : 0,
                'services'     => $services,
            ];
        }
        return $out;
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
            if (self::$payload !== null) {
                $value = self::$payload[$key] ?? '';
            } else {
                $value = isset($_POST[$key]) ? wp_unslash($_POST[$key]) : ''; // phpcs:ignore WordPress.Security
            }
            if (!is_scalar($value) || $value === '') {
                continue;
            }
            $raw = sanitize_text_field((string) $value);
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
