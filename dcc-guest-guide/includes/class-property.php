<?php
/**
 * DCC Guest Guide — facts about the property itself (v0.26.1).
 *
 * All that is left of what v0.26.0 called Stay. The stay resolver — the signed
 * `?t=` token, the Guest Links admin page, the `dccgg_stay` endpoint and the
 * `dccgg_stay_secret` option — was removed on Rob's instruction: he will not
 * paste a per-guest link, and an idle public endpoint backed by a secret is
 * something we would have to defend for nothing. The hero shows the plain
 * welcome, which is what every guest now sees.
 *
 * What survives is the one thing that is true of the property rather than of
 * a guest: the hours MotoPress keeps. The Checkout tile and the checkout
 * sheet both say "by 11:00 AM", and that is a property fact, not a booking.
 */

namespace DCCGG;

if (!defined('ABSPATH')) {
    exit;
}

final class Property
{
    /** Removed in v0.26.1; named here only so the cleanup can find it. */
    public const DEAD_SECRET_OPTION = 'dccgg_stay_secret';

    /**
     * Check-in / check-out clock times, from MotoPress.
     *
     * Three sources in order: the documented accessor, the option it writes,
     * and nothing. Nothing is a real answer — a guide that cannot read the
     * property's times shows none rather than printing a time this site
     * might not keep.
     *
     * @return array{in: string, out: string} 24-hour "H:i", or '' when unknown.
     */
    public static function times(): array
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
     * Drop the secret v0.26.0 created, once, in wp-admin.
     *
     * This plugin writes nothing on install, activation or upgrade, and that
     * standing rule is being set aside here on the Director's explicit
     * instruction — "delete it on upgrade", so the key does not sit in the
     * options table outliving the feature. It is idempotent and cheap: the
     * read comes out of the autoloaded options cache, so after the single
     * delete this costs nothing at all.
     */
    public static function forget_dead_secret(): void
    {
        if (get_option(self::DEAD_SECRET_OPTION, null) !== null) {
            delete_option(self::DEAD_SECRET_OPTION);
        }
    }
}
