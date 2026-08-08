<?php
namespace MPHBAC;

use DateTimeImmutable;

if (!defined('ABSPATH')) {
    exit;
}

final class Ajax
{
    public const MAX_RANGE_DAYS = 95;

    /** Accepted request window around today (see the clamp in handle()). */
    public const CLAMP_PAST_DAYS   = 400;
    public const CLAMP_FUTURE_DAYS = 730;

    public static function handle(): void
    {
        // Wall-clock at the moment OUR code first runs. Compared against
        // WordPress's own request-start constant, this separates "WordPress +
        // every active plugin booting" from "this plugin doing work" — the
        // distinction that decides whether a slow endpoint is fixable here at
        // all. Returned in the payload only when the caller asks for it.
        $t_enter = microtime(true);
        $boot_ms = defined('WP_START_TIMESTAMP')
            ? max(0.0, ($t_enter - WP_START_TIMESTAMP) * 1000)
            : -1.0;
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

        // Clamp the range to a sane window around today. Every unique
        // (ids, from, to) triple writes a transient row to the options table,
        // so without a clamp an unauthenticated client scripting arbitrary
        // dates (years 0001–9999) could flood portal_options — a real cost on
        // shared hosting. One year back / two years forward comfortably covers
        // every legitimate use (past-day display and long-lead bookings).
        $today    = Data_Provider::today();
        $min_from = $today->modify('-' . self::CLAMP_PAST_DAYS . ' days');
        $max_to   = $today->modify('+' . self::CLAMP_FUTURE_DAYS . ' days');
        if ($to < $min_from || $from > $max_to) {
            wp_send_json_error(['message' => __('Invalid date range.', 'mphb-availability-calendar')], 400);
        }
        if ($from < $min_from) {
            $from = $min_from;
        }
        if ($to > $max_to) {
            $to = $max_to;
        }

        $diff_days = (int) $from->diff($to)->format('%a');
        if ($diff_days > self::MAX_RANGE_DAYS) {
            $to = $from->modify('+' . self::MAX_RANGE_DAYS . ' days');
        }

        // Resolve the room list once and reuse — the response payload needs
        // it for titles/abbrev/number, and an empty room_type_ids request
        // also needs it to know which IDs to query availability for.
        $rooms     = Data_Provider::list_room_types();
        $valid_ids = array_map(static fn($t) => (int) $t['id'], $rooms);
        if (empty($room_type_ids)) {
            $room_type_ids = $valid_ids;
        } else {
            // Drop IDs that aren't real accommodation types — same
            // options-table-flood concern as the date clamp (every bogus ID
            // combination would otherwise mint its own transient), plus it
            // saves the per-ID room lookup queries for garbage input.
            $room_type_ids = array_values(array_intersect($room_type_ids, $valid_ids));
            if (empty($room_type_ids)) {
                wp_send_json_error(['message' => __('Unknown accommodation type.', 'mphb-availability-calendar')], 400);
            }
        }

        // Only echo back the cottages that were actually requested. Previously
        // this returned every accommodation type, so a widget configured to
        // show a subset would have rendered rows (as fully booked, no less)
        // for cottages it was told to hide.
        $rooms = array_values(array_filter(
            $rooms,
            static fn($t) => in_array((int) $t['id'], $room_type_ids, true)
        ));

        $t_query = microtime(true);
        $availability = Data_Provider::get_availability($room_type_ids, $from, $to, $data_age);
        $query_ms = (microtime(true) - $t_query) * 1000;

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

        $payload = [
            'rooms'         => array_values($rooms),
            'availability'  => $availability,
            'from'          => $from->format('Y-m-d'),
            'to'            => $to->format('Y-m-d'),
            'bookedThrough' => $booked_through,
        ];

        // Opt-in profiling (POST debug=1, or WP_DEBUG). Kept out of normal
        // responses so the payload stays small and no internals leak.
        //   bootMs   - WordPress + all active plugins loading, BEFORE our code.
        //   queryMs  - this plugin's availability lookup.
        //   handleMs - everything this plugin did in the request.
        //   cacheHit - true when availability came from the transient.
        // If bootMs dwarfs queryMs, the latency is the WordPress bootstrap on
        // admin-ajax.php, which no amount of query tuning here can fix — the
        // remedy is making fewer requests, which the client now does.
        if (!empty($_POST['debug']) || (defined('WP_DEBUG') && WP_DEBUG)) {
            $payload['timing'] = [
                'bootMs'   => round($boot_ms, 1),
                'queryMs'  => round($query_ms, 1),
                'handleMs' => round((microtime(true) - $t_enter) * 1000, 1),
                'cacheHit' => ($data_age ?? 0) > 0,
                'dataAgeS' => (int) ($data_age ?? 0),
            ];
        }

        wp_send_json_success($payload);
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
