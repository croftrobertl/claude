<?php
/**
 * DCC Guest Guide — the guest's own stay (v0.26.0).
 *
 * The app shell's Postcard Hero shows "Welcome to Cottage 34", the check-in
 * and check-out day and time, and a progress bar. Those are facts about ONE
 * booking, so they are shown only when the link the guest followed proves
 * which booking it is, and never otherwise. There is no guessing step and no
 * partial state: either a signed token resolves to a confirmed booking, or
 * the hero shows the plain welcome with no stay details at all.
 *
 * WHY A TOKEN, and why `?stay=` is NOT one. `?stay=` is free text a guest can
 * type (CLAUDE.md: its only documented shape is `jane-2026-06`, a month with
 * no day). Anyone could put `?stay=anybody` in the bar and the guide would
 * cheerfully address them as that person. It stays exactly what it has always
 * been — the localStorage key for the checklist — and it feeds nothing here.
 *
 * WHAT A TOKEN CANNOT DO. It carries a booking id and an HMAC of that id, so
 * it cannot be enumerated without the site secret, and it is compared with
 * hash_equals(). What comes back is the cottage label and the two dates, and
 * nothing else: not the guest's name, not their email, not the price, not the
 * other guests. Even with a valid token, a booking that is not `confirmed`
 * resolves to nothing — a cancelled stay must not greet anyone.
 *
 * GET-only, as the standard requires: this reads and never writes.
 */

namespace DCCGG;

if (!defined('ABSPATH')) {
    exit;
}

final class Stay
{
    /** Option holding the per-site HMAC secret. Created on first mint, never on activation. */
    public const SECRET_OPTION = 'dccgg_stay_secret';

    /** Domain separator, so this HMAC can never be replayed as another one. */
    private const HMAC_CONTEXT = 'dccgg-stay-v1|';

    /** Truncated HMAC length in hex characters. 20 hex = 80 bits. */
    private const SIG_LEN = 20;

    /** Only a confirmed booking greets a guest. */
    private const GREETING_STATUS = 'confirmed';

    /** Resolved stays are cached briefly; a booking rarely changes mid-stay. */
    private const CACHE_TTL = 900;

    /**
     * The site secret, created on first use.
     *
     * Deliberately lazy. Nothing is written on install, activation or upgrade
     * (a standing rule on this plugin), and nothing needs to be: the secret is
     * only required the first time someone mints a link.
     */
    public static function secret(): string
    {
        $secret = (string) get_option(self::SECRET_OPTION, '');
        if ($secret !== '') {
            return $secret;
        }
        $secret = bin2hex(random_bytes(32));
        add_option(self::SECRET_OPTION, $secret, '', false);
        // add_option() loses a race to whoever got there first; re-read so
        // both requests end up signing with the same value.
        return (string) get_option(self::SECRET_OPTION, $secret);
    }

    /** The signature for a booking id. */
    public static function sign(int $booking_id): string
    {
        return substr(
            hash_hmac('sha256', self::HMAC_CONTEXT . $booking_id, self::secret()),
            0,
            self::SIG_LEN
        );
    }

    /** The token that goes in a guest link: `<id>.<sig>`. */
    public static function token(int $booking_id): string
    {
        return $booking_id . '.' . self::sign($booking_id);
    }

    /**
     * The booking id a token proves, or 0.
     *
     * Returns 0 for every failure — malformed, unknown, wrong signature — so
     * a caller cannot tell the three apart and neither can a prober.
     */
    public static function verify(string $token): int
    {
        $token = trim($token);
        if ($token === '' || strlen($token) > 64 || substr_count($token, '.') !== 1) {
            return 0;
        }
        [$raw_id, $sig] = explode('.', $token, 2);
        if (!preg_match('/^[1-9][0-9]{0,11}$/', $raw_id) || !preg_match('/^[0-9a-f]{' . self::SIG_LEN . '}$/', $sig)) {
            return 0;
        }
        $id = (int) $raw_id;
        return hash_equals(self::sign($id), $sig) ? $id : 0;
    }

    /**
     * Check-in / check-out clock times, from MotoPress.
     *
     * Three sources in order: the documented accessor, the option it writes,
     * and nothing. Nothing is a real answer — a hero that cannot read the
     * property's times shows the dates without them rather than printing a
     * time this site might not keep.
     *
     * @return array{in: string, out: string} 24-hour "H:i", or '' when unknown.
     */
    public static function property_times(): array
    {
        $read = static function (string $getter, string $option): string {
            if (function_exists('MPHB')) {
                try {
                    $settings = \MPHB()->settings();
                    $dt = (is_object($settings) && method_exists($settings, 'dateTime')) ? $settings->dateTime() : null;
                    if (is_object($dt) && method_exists($dt, $getter)) {
                        $v = (string) $dt->{$getter}();
                        if (preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $v)) {
                            return $v;
                        }
                    }
                } catch (\Throwable $e) {
                    // Fall through to the option. MPHB's own accessors have
                    // changed shape across 6.x; a guide must not fatal over it.
                }
            }
            $v = (string) get_option($option, '');
            return preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $v) ? $v : '';
        };

        return [
            'in'  => $read('getCheckInTime',  'mphb_check_in_time'),
            'out' => $read('getCheckOutTime', 'mphb_check_out_time'),
        ];
    }

    /**
     * Resolve a verified booking id to the three facts the hero may show.
     *
     * @return array{cottage: string, checkIn: string, checkOut: string, timeIn: string, timeOut: string}|null
     */
    public static function resolve(int $booking_id)
    {
        if ($booking_id <= 0) {
            return null;
        }
        $cache_key = 'dccgg_stay_' . $booking_id;
        $cached = get_transient($cache_key);
        if (is_array($cached)) {
            return $cached;
        }

        $booking = get_post($booking_id);
        if (!$booking || $booking->post_type !== 'mphb_booking' || $booking->post_status !== self::GREETING_STATUS) {
            return null;
        }

        $in  = (string) get_post_meta($booking_id, 'mphb_check_in_date', true);
        $out = (string) get_post_meta($booking_id, 'mphb_check_out_date', true);
        if (!self::is_iso_date($in) || !self::is_iso_date($out) || $out <= $in) {
            return null;
        }

        $times = self::property_times();
        $stay = [
            'cottage' => self::cottage_label($booking_id),
            'checkIn' => $in,
            'checkOut' => $out,
            'timeIn'  => $times['in'],
            'timeOut' => $times['out'],
        ];
        set_transient($cache_key, $stay, self::CACHE_TTL);
        return $stay;
    }

    /** `2026-06-18` and nothing else. */
    public static function is_iso_date(string $v): bool
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m)) {
            return false;
        }
        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    /**
     * The cottage this booking is for, as the guest would say it.
     *
     * MotoPress models each cottage as one room type with one physical room,
     * and the reserved-room post is the join. The room type's own title is the
     * label ("Cottage 34: Coconut Cottage"); the hero shortens it to its first
     * clause, because "Welcome to Cottage 34: Coconut Cottage" does not read
     * like a person talking. An unreadable chain returns '' and the hero drops
     * the cottage line rather than inventing one.
     */
    public static function cottage_label(int $booking_id): string
    {
        $reserved = get_posts([
            'post_type'        => 'mphb_reserved_room',
            'post_parent'      => $booking_id,
            'posts_per_page'   => 1,
            'post_status'      => 'any',
            'fields'           => 'ids',
            'suppress_filters' => true,
        ]);
        if (!$reserved) {
            return '';
        }
        $rid = (int) $reserved[0];

        $type_id = (int) get_post_meta($rid, '_mphb_room_type_id', true);
        if ($type_id <= 0) {
            $room_id = (int) get_post_meta($rid, '_mphb_room_id', true);
            if ($room_id > 0) {
                $type_id = (int) get_post_meta($room_id, 'mphb_room_type_id', true);
            }
        }
        if ($type_id <= 0) {
            return '';
        }
        $type = get_post($type_id);
        if (!$type || $type->post_type !== 'mphb_room_type') {
            return '';
        }
        return self::short_cottage_name((string) $type->post_title);
    }

    /**
     * "Cottage 34: Coconut Cottage" -> "Cottage 34".
     *
     * Only a colon splits it. A title with no colon is used whole, so a
     * property that names its units differently is not truncated to nothing.
     */
    public static function short_cottage_name(string $title): string
    {
        $title = trim(wp_strip_all_tags($title));
        $pos = strpos($title, ':');
        if ($pos !== false && $pos > 0) {
            $title = trim(substr($title, 0, $pos));
        }
        return $title;
    }
}
