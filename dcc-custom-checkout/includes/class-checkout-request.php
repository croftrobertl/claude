<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Read-only helpers over the checkout form submission ($_POST).
 *
 * These are deliberately shape-tolerant: MotoPress's exact `mphb_room_details`
 * array layout varies by version, so instead of assuming a fixed depth we scan
 * recursively for values we care about. This keeps the server-side backstops
 * working even if MotoPress reorganizes its POST structure.
 *
 * NOTE: The hook used to run the guards (`wp_loaded`, priority 1) and the exact
 * POST signature are expected to be confirmed on staging against the installed
 * MotoPress version. See Guest_Fields::register() / Pet_Service::register().
 */
final class Checkout_Request
{
    /**
     * Is the current request the final "Submit Booking" POST?
     *
     * Signature: a POST that carries the reserved-room details array. We keep
     * this loose (any request with `mphb_room_details`) and rely on the callers
     * to do the specific work; a false positive simply means we validate an
     * array that already passes.
     */
    public static function is_checkout_submission(): bool
    {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
            return false;
        }
        // Unslashed copy is used only for existence/shape checks below; each
        // value that is actually consumed is sanitized at the point of use.
        return isset($_POST['mphb_room_details']) && is_array($_POST['mphb_room_details']);
    }

    /**
     * Raw, unslashed room-details array from the POST (or empty array).
     *
     * @return array<int|string,mixed>
     */
    public static function room_details(): array
    {
        if (!isset($_POST['mphb_room_details']) || !is_array($_POST['mphb_room_details'])) {
            return [];
        }
        return wp_unslash($_POST['mphb_room_details']); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
    }

    /**
     * The submitted accommodation (room type) IDs, scanned from the room
     * details. MotoPress commonly submits `room_type_id` per reserved room.
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
     * Does the submitted room-details array reference this pet Service ID?
     * (Scans recursively, comparing scalar leaf values.)
     */
    public static function contains_service_id(int $service_id): bool
    {
        $found = false;
        self::walk(self::room_details(), static function ($key, $value) use (&$found, $service_id): void {
            if ($found) {
                return;
            }
            if (is_scalar($value) && (int) $value === $service_id) {
                $found = true;
            }
        });
        return $found;
    }

    /**
     * Compute the number of nights from the submitted check-in / check-out.
     * Returns 0 when the dates are missing or unparseable.
     */
    public static function nights(): int
    {
        $in  = self::posted_date('mphb_check_in_date');
        $out = self::posted_date('mphb_check_out_date');
        if ($in === null || $out === null) {
            return 0;
        }
        $diff = (int) round(($out - $in) / DAY_IN_SECONDS);
        return max(0, $diff);
    }

    /**
     * Parse a Y-m-d date field from the POST into a UTC timestamp.
     */
    private static function posted_date(string $key): ?int
    {
        if (empty($_POST[$key])) {
            return null;
        }
        $raw = sanitize_text_field(wp_unslash($_POST[$key]));
        $dt  = \DateTimeImmutable::createFromFormat('!Y-m-d', $raw, new \DateTimeZone('UTC'));
        if ($dt === false) {
            return null;
        }
        return $dt->getTimestamp();
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
