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
     * Add today's sunrise and sunset to a weather payload, as `sunToday`.
     *
     * It lives on Property rather than on Plugin because it is a fact about
     * the property's DAY, and because it is a pure function worth testing by
     * running it: on Plugin the render harness's own stub of that class made
     * the test skip itself silently, which is how the timezone rule survived
     * a mutation run.
     *
     * v0.26.2. Two things on a guide used to work out the sun's times
     * independently — the app shell's "Tavares Now" strip read Open-Meteo's
     * daily array, and the Conditions card computed them astronomically in
     * PHP — and the two disagreed by a minute or two on the same page. They
     * now read ONE value, resolved here, from the source that is right for
     * this lat/lng.
     *
     * Resolved at SEND time rather than before the cache is written: the
     * payload lives for thirty minutes and a window that straddles midnight
     * would otherwise serve yesterday's row until it expired.
     *
     * Picked by DATE, never by position. `past_days=1` is in the request, so
     * index 0 is yesterday — and Open-Meteo returns `daily.time`, which is
     * already in the cottage's own timezone because the request says
     * `timezone=auto`. That is also the timezone "today" has to be read in:
     * the server's clock is not the property's.
     */
    public static function sun_today(array $data): array
    {
        $daily = isset($data['daily']) && is_array($data['daily']) ? $data['daily'] : [];
        $times = isset($daily['time']) && is_array($daily['time']) ? $daily['time'] : [];
        if (!$times) {
            return $data;
        }
        $tz_name = isset($data['timezone']) && is_string($data['timezone']) ? $data['timezone'] : '';
        try {
            $tz = new \DateTimeZone($tz_name !== '' ? $tz_name : 'UTC');
        } catch (\Throwable $e) {
            $tz = new \DateTimeZone('UTC');
        }
        $today = (new \DateTimeImmutable('now', $tz))->format('Y-m-d');
        $idx = array_search($today, $times, true);
        if ($idx === false) {
            return $data;
        }
        $clock = static function ($v) {
            // Open-Meteo gives "2026-11-01T18:41"; the clock is the last five.
            return (is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/', $v, $m)) ? $m[1] : '';
        };
        $sun = [
            'sunrise' => $clock($daily['sunrise'][$idx] ?? null),
            'sunset'  => $clock($daily['sunset'][$idx] ?? null),
        ];
        if ($sun['sunrise'] === '' && $sun['sunset'] === '') {
            return $data;
        }
        $data['sunToday'] = $sun;
        return $data;
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
