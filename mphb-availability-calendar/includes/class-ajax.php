<?php
namespace MPHBAC;

use DateTimeImmutable;

if (!defined('ABSPATH')) {
    exit;
}

final class Ajax
{
    public const MAX_RANGE_DAYS = 95;

    public static function handle(): void
    {
        // No nonce check: this endpoint returns public, read-only availability
        // data and performs no state-changing actions, so there is no CSRF
        // surface to protect. Requiring a nonce here breaks page caching —
        // SpeedyCache (and any other full-page cache) stores the embedded
        // nonce in the cached HTML, and the nonce expires after ~24h, after
        // which every cached pageload returns 403/-1 and the calendar sits
        // on "Loading availability…" until the cache is purged.

        // Never let this response be cached. The payload is live availability
        // and must always be fetched fresh. Cache_Integration already excludes
        // this endpoint from SpeedyCache, but the deployment site also runs
        // HostGator's Endurance Page Cache and an advanced-cache.php drop-in,
        // and a CDN or browser back-button cache could store the reply too.
        // nocache_headers() sets WP's canonical Cache-Control/Expires/Pragma;
        // the explicit no-store line is the one directive guaranteed to defeat
        // shared caches. Sent at the top of handle() so the error responses
        // below (which exit early) are covered as well. Guard on headers_sent()
        // so a misconfigured cache layer that already flushed output can't turn
        // this into a PHP warning that corrupts the JSON body.
        if (!headers_sent()) {
            nocache_headers();
            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0', true);
            header('Pragma: no-cache', true);
        }

        $raw_ids = isset($_POST['room_type_ids']) ? (array) wp_unslash($_POST['room_type_ids']) : [];
        $room_type_ids = array_values(array_filter(array_map('absint', $raw_ids)));

        $from_str = isset($_POST['from']) ? sanitize_text_field((string) wp_unslash($_POST['from'])) : '';
        $to_str   = isset($_POST['to'])   ? sanitize_text_field((string) wp_unslash($_POST['to']))   : '';

        $from = self::parse_date($from_str);
        $to   = self::parse_date($to_str);
        if (!$from || !$to) {
            wp_send_json_error(['message' => __('Invalid date range.', 'mphb-availability-calendar')], 400);
        }

        if ($to < $from) {
            wp_send_json_error(['message' => __('Check-out must be on or after check-in.', 'mphb-availability-calendar')], 400);
        }

        $diff_days = (int) $from->diff($to)->format('%a');
        if ($diff_days > self::MAX_RANGE_DAYS) {
            $to = $from->modify('+' . self::MAX_RANGE_DAYS . ' days');
        }

        // Resolve the room list once and reuse — the response payload needs
        // it for titles/abbrev/number, and an empty room_type_ids request
        // also needs it to know which IDs to query availability for.
        $rooms = Data_Provider::list_room_types();
        if (empty($room_type_ids)) {
            $room_type_ids = array_map(static fn($t) => (int) $t['id'], $rooms);
        }

        $availability = Data_Provider::get_availability($room_type_ids, $from, $to);

        // When every visible day is booked across every requested cottage,
        // scan forward to find the real through-date so the "all cottages
        // booked through X" hint can show the true cutoff instead of the
        // last visible day. Skipped on the common case where the window has
        // any availability at all — costs one extra cached query only when
        // the user is actually staring at an all-booked stretch.
        $booked_through = null;
        if (!empty($room_type_ids)) {
            $any_avail = false;
            foreach ($availability as $type_avail) {
                foreach ($type_avail as $status) {
                    if ($status === Data_Provider::ST_AVAIL) {
                        $any_avail = true;
                        break 2;
                    }
                }
            }
            if (!$any_avail) {
                $next = Data_Provider::find_first_availability(
                    $room_type_ids,
                    $to->modify('+1 day')
                );
                if ($next instanceof DateTimeImmutable) {
                    $booked_through = $next->modify('-1 day')->format('Y-m-d');
                }
            }
        }

        wp_send_json_success([
            'rooms'         => array_values($rooms),
            'availability'  => $availability,
            'from'          => $from->format('Y-m-d'),
            'to'            => $to->format('Y-m-d'),
            'bookedThrough' => $booked_through,
        ]);
    }

    private static function parse_date(string $value): ?DateTimeImmutable
    {
        if ($value === '') {
            return null;
        }
        $d = DateTimeImmutable::createFromFormat('Y-m-d', $value, Data_Provider::timezone());
        if (!$d) {
            return null;
        }
        $errors = DateTimeImmutable::getLastErrors();
        if (is_array($errors) && (!empty($errors['warning_count']) || !empty($errors['error_count']))) {
            return null;
        }
        return $d->setTime(0, 0, 0);
    }
}
