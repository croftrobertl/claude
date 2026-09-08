<?php
namespace MPHBAC;

use DateTimeImmutable;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Staff calendar data layer.
 *
 * Two jobs:
 *   1. month_view()      — ONE query for every booking overlapping a month,
 *                          then a single cache prime, so the calendar never
 *                          N+1s per day or per booking.
 *   2. booking_detail()  — the four MotoPress detail sections for one booking,
 *                          read through MPHB's OWN entity getters wherever
 *                          they exist so this tracks MPHB across versions.
 *
 * READING MPHB
 * ------------
 * MPHB's source is not vendored here and its exact getter names vary across
 * 6.x, so every entity read goes through first_of()/scalar(), which try a
 * list of candidate getters and fall back to post meta only as a last resort.
 * That is the same defensive shape Data_Provider::query_room_types() already
 * uses for getRoomTypeRepository(). Consequence to be aware of: a field whose
 * getter is named something not in the candidate list degrades to "—" rather
 * than fatalling — it fails visibly-empty, never fatally, and never silently
 * shows the WRONG value.
 *
 * OTA HONESTY
 * -----------
 * iCal-imported bookings carry no real occupancy: MPHB defaults adults to the
 * cottage's maximum capacity. Presenting that as fact would have staff greet
 * a couple as a party of six. Any booking with an iCal source is therefore
 * marked imported, and its adults/children are returned as `null` plus a
 * `provided: false` flag — the UI renders "not provided by Airbnb", never a
 * number. Direct bookings return real counts with `provided: true`.
 */
final class Staff_Data
{
    /** Meta keys used only as a fallback when no entity getter answers. */
    private const META_CHECKIN   = 'mphb_check_in_date';
    private const META_CHECKOUT  = 'mphb_check_out_date';
    private const META_ROOM_ID   = '_mphb_room_id';
    private const META_ICAL_PROD = 'mphb_ical_prodid';
    private const META_ICAL_UID  = 'mphb_ical_uid';
    private const META_ICAL_SUMM = 'mphb_ical_summary';

    /**
     * MPHB records payments as their own post type, linked to the booking by
     * meta. Both the underscore-prefixed and bare key spellings are accepted
     * because the exact spelling differs between MPHB releases and the source
     * is not vendored here; matching either costs nothing.
     */
    private const PAYMENT_POST_TYPE = 'mphb_payment';
    private const PAYMENT_BOOKING_KEYS = ['_mphb_booking_id', 'mphb_booking_id'];
    private const PAYMENT_AMOUNT_KEYS  = ['_mphb_amount', 'mphb_amount'];
    private const PAYMENT_GATEWAY_KEYS = ['_mphb_gateway', 'mphb_gateway'];
    /** Payment post statuses that count as money received. Filterable. */
    private const PAYMENT_PAID_STATUSES = ['mphb-p-completed'];

    /**
     * Every booking overlapping [$from, $to], with the cottages it occupies.
     * Guest name is included because the calendar shows it — which is exactly
     * why the whole payload is gated (see Staff::require_authorization()).
     *
     * @return array<string,mixed>
     */
    public static function month_view(DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        $rows = self::query_range($from, $to);

        // ONE prime for every booking + reserved room touched, so the entity
        // getters below read from cache instead of issuing a query each.
        $booking_ids  = array_values(array_unique(array_map(static fn($r) => (int) $r->booking_id, $rows)));
        $reserved_ids = array_values(array_unique(array_map(static fn($r) => (int) $r->reserved_id, $rows)));
        if ($booking_ids) {
            // The third arg already primes meta — no separate call needed.
            _prime_post_caches($booking_ids, false, true);
        }
        if ($reserved_ids) {
            update_meta_cache('post', $reserved_ids);
        }

        $types = [];
        foreach (Data_Provider::list_room_types() as $t) {
            $types[(int) $t['id']] = $t;
        }

        // Group reserved rooms under their booking — a multi-cottage booking
        // is ONE entry listing several cottages, not several bookings.
        // booking_id => reserved-room ids, straight from the rows we already
        // have. Feeding this to source_for() is what keeps the OTA check from
        // becoming a get_posts() per booking.
        $reserved_by_booking = [];
        foreach ($rows as $r) {
            $reserved_by_booking[(int) $r->booking_id][] = (int) $r->reserved_id;
        }

        $bookings = [];
        foreach ($rows as $r) {
            $bid = (int) $r->booking_id;
            if (!isset($bookings[$bid])) {
                $source = self::source_for($bid, $reserved_by_booking[$bid] ?? []);
                $bookings[$bid] = [
                    'id'         => $bid,
                    'status'     => (string) $r->status,
                    'statusLabel'=> self::status_label((string) $r->status),
                    'checkin'    => (string) $r->checkin,
                    'checkout'   => (string) $r->checkout,
                    'guestName'  => self::guest_name($bid),
                    'imported'   => $source['imported'],
                    'source'     => $source,
                    'cottages'   => [],
                ];
            }
            $type_id = (int) $r->room_type_id;
            $bookings[$bid]['cottages'][] = [
                'roomTypeId' => $type_id,
                'roomId'     => (int) $r->room_id,
                // A room type deleted after booking still has to render.
                'title'      => $types[$type_id]['title'] ?? __('(removed accommodation)', 'mphb-availability-calendar'),
                'abbrev'     => $types[$type_id]['abbrev'] ?? '',
                'number'     => $types[$type_id]['number'] ?? '',
            ];
        }

        return [
            'from'     => $from->format('Y-m-d'),
            'to'       => $to->format('Y-m-d'),
            'today'    => Data_Provider::today()->format('Y-m-d'),
            'cottages' => array_values($types),
            'bookings' => array_values($bookings),
        ];
    }

    /**
     * One query for the whole month. Overlap is inclusive of the checkout day
     * because staff need to SEE check-outs (unlike the availability grid,
     * where the checkout day is a free night).
     *
     * @return object[]
     */
    private static function query_range(DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        global $wpdb;

        $statuses = (array) apply_filters('mphbac_staff_statuses', Staff::VISIBLE_STATUSES);
        $statuses = array_values(array_filter(array_map('strval', $statuses)));
        if (!$statuses) {
            return [];
        }
        $status_ph = implode(',', array_fill(0, count($statuses), '%s'));

        $sql = "SELECT rr.ID AS reserved_id,
                       bk.ID AS booking_id,
                       bk.post_status AS status,
                       rid.meta_value AS room_id,
                       rtid.meta_value AS room_type_id,
                       ci.meta_value AS checkin,
                       co.meta_value AS checkout
                FROM {$wpdb->posts} rr
                INNER JOIN {$wpdb->postmeta} rid
                        ON rid.post_id = rr.ID AND rid.meta_key = '" . self::META_ROOM_ID . "'
                INNER JOIN {$wpdb->posts} bk
                        ON bk.ID = rr.post_parent AND bk.post_type = 'mphb_booking'
                INNER JOIN {$wpdb->postmeta} ci
                        ON ci.post_id = bk.ID AND ci.meta_key = '" . self::META_CHECKIN . "'
                INNER JOIN {$wpdb->postmeta} co
                        ON co.post_id = bk.ID AND co.meta_key = '" . self::META_CHECKOUT . "'
                LEFT JOIN {$wpdb->postmeta} rtid
                        ON rtid.post_id = CAST(rid.meta_value AS UNSIGNED)
                       AND rtid.meta_key = 'mphb_room_type_id'
                WHERE rr.post_type = 'mphb_reserved_room'
                  AND bk.post_status IN ($status_ph)
                  AND ci.meta_value <= %s
                  AND co.meta_value >= %s
                ORDER BY ci.meta_value ASC, bk.ID ASC";

        $params = array_merge($statuses, [$to->format('Y-m-d'), $from->format('Y-m-d')]);
        $rows   = $wpdb->get_results($wpdb->prepare($sql, $params));

        if ($wpdb->last_error !== '') {
            // Same discipline as Data_Provider: wpdb never throws, so a failed
            // read looks like "no bookings". Log it and return empty rather
            // than showing staff a confidently blank calendar.
            error_log('MPHBAC staff: month query failed: ' . $wpdb->last_error);
            return [];
        }
        return is_array($rows) ? $rows : [];
    }

    // ---------------------------------------------------------------- detail

    /**
     * The four MotoPress detail sections for one booking, or null if the
     * booking does not exist or is not a status staff may see.
     *
     * @return array<string,mixed>|null
     */
    public static function booking_detail(int $booking_id): ?array
    {
        $post = get_post($booking_id);
        if (!$post || $post->post_type !== 'mphb_booking') {
            return null;
        }
        $statuses = (array) apply_filters('mphbac_staff_statuses', Staff::VISIBLE_STATUSES);
        if (!in_array($post->post_status, $statuses, true)) {
            return null; // cancelled/abandoned are not reachable through here
        }

        $booking = self::booking_entity($booking_id);
        $source  = self::source_for($booking_id);

        return [
            'id'       => $booking_id,
            'imported' => $source['imported'],
            'source'   => $source,
            'sections' => [
                'booking'  => self::section_booking($booking_id, $booking, $source),
                'customer' => self::section_customer($booking_id, $booking),
                'notes'    => self::section_notes($booking_id, $booking),
            ],
        ];
    }

    /**
     * A) Booking Information — Accommodation Type, Check-in, Check-out,
     * Number of Guests, Total, Paid, Balance Due. In that order, nothing else.
     *
     * @return array<int,array<string,mixed>>
     */
    private static function section_booking(int $id, $b, array $source): array
    {
        $total = self::scalar($b, ['getTotalPrice', 'getTotal'], null);
        $pay   = self::payment_info($id, $b);
        $paid  = $pay['paid'];
        $due   = ($total !== null && is_numeric($total) && $paid !== null) ? (float) $total - $paid : null;

        $rooms = self::reserved_entities($id, $b);
        $types = [];
        foreach (Data_Provider::list_room_types() as $t) {
            $types[(int) $t['id']] = $t['title'];
        }
        $names = [];
        $adults = 0;
        $children = 0;
        $counted = false;
        foreach ($rooms as $r) {
            $type_id = (int) self::scalar($r['entity'], ['getRoomTypeId'], $r['room_type_id'] ?: 0);
            $title = $types[$type_id] ?? '';
            if ($title !== '' && !in_array($title, $names, true)) {
                $names[] = $title;
            }
            $a = self::int_or_null(self::scalar($r['entity'], ['getAdults'], null));
            $c = self::int_or_null(self::scalar($r['entity'], ['getChildren'], null));
            if ($a !== null) { $adults += $a; $counted = true; }
            if ($c !== null) { $children += $c; $counted = true; }
        }

        $out = [];
        self::push($out, __('Accommodation Type', 'mphb-availability-calendar'), implode(', ', $names));
        self::push($out, __('Check-in', 'mphb-availability-calendar'), self::date_of($b, ['getCheckInDate'], $id, self::META_CHECKIN));
        self::push($out, __('Check-out', 'mphb-availability-calendar'), self::date_of($b, ['getCheckOutDate'], $id, self::META_CHECKOUT));

        // OTA HONESTY. An imported booking's occupancy is MPHB's max-capacity
        // default, not the guest's actual party — say so in words rather than
        // print a number staff would greet the door with.
        if ($source['imported']) {
            self::push(
                $out,
                __('Number of Guests', 'mphb-availability-calendar'),
                sprintf(__('count not provided by %s', 'mphb-availability-calendar'), $source['ota']),
                ['muted' => true]
            );
        } elseif ($counted) {
            $guests = $adults + $children;
            $label  = (string) $guests;
            if ($children > 0) {
                $label .= ' (' . sprintf(
                    /* translators: 1: adult count, 2: child count, already pluralized */
                    __('%1$s, %2$s', 'mphb-availability-calendar'),
                    sprintf(self::plural($adults, 'adult', 'adults'), $adults),
                    sprintf(self::plural($children, 'child', 'children'), $children)
                ) . ')';
            }
            // A zero count is "empty" per the display rule, so push() drops it.
            self::push($out, __('Number of Guests', 'mphb-availability-calendar'), $guests > 0 ? $label : '0');
        }

        self::push($out, __('Total', 'mphb-availability-calendar'), self::money($total), ['money' => true]);
        // "No payment recorded" is meaningful (pay on arrival / an OTA), so it
        // is a value, not a blank — see payment_info().
        self::push(
            $out,
            __('Paid', 'mphb-availability-calendar'),
            $paid === null ? __('No payment recorded', 'mphb-availability-calendar') : self::money($paid),
            ['money' => $paid !== null]
        );
        self::push($out, __('Balance Due', 'mphb-availability-calendar'), self::money($due), ['money' => true]);
        return $out;
    }

    /**
     * B) Customer Information, in the order the operator specified. Every row
     * is dropped when empty, so a booking without a dog or a second guest
     * simply has no dog or guest-2 rows.
     *
     * @return array<int,array<string,mixed>>
     */
    private static function section_customer(int $id, $b): array
    {
        $c = self::first_of($b, ['getCustomer']);
        $custom = self::custom_fields($id, is_object($c) ? $c : null);

        // The photo ID is found by SHAPE, not by name, and never emitted as a
        // URL — the client gets an opaque booking-scoped reference it can only
        // redeem through the gated proxy.
        $photo = null;
        foreach ($custom as $key => $val) {
            if (self::looks_like_attachment((string) $key, $val)) {
                $photo = ['field' => (string) $key];
                break;
            }
        }

        $out = [];
        $pick = static function (array $getters, array $keys) use ($c, $custom) {
            $v = self::scalar(is_object($c) ? $c : null, $getters, null);
            if (self::is_blank(self::str_or_dash($v))) {
                $v = self::custom_get($custom, $keys);
            }
            return $v;
        };

        self::push($out, __('First Name', 'mphb-availability-calendar'), $pick(['getFirstName'], ['firstname', 'fname']));
        self::push($out, __('Last Name', 'mphb-availability-calendar'), $pick(['getLastName'], ['lastname', 'lname']));
        self::push($out, __('Email', 'mphb-availability-calendar'), $pick(['getEmail'], ['email']));
        self::push($out, __('Phone', 'mphb-availability-calendar'), $pick(['getPhone'], ['phone']));
        self::push($out, __('Address', 'mphb-availability-calendar'), $pick(['getAddress1', 'getAddress'], ['address1', 'address']));
        self::push($out, __('City', 'mphb-availability-calendar'), $pick(['getCity'], ['city']));
        self::push($out, __('State', 'mphb-availability-calendar'), $pick(['getState'], ['state']));
        self::push($out, __('Zip', 'mphb-availability-calendar'), $pick(['getZip'], ['zip', 'postcode', 'postalcode']));
        self::push($out, __('Country', 'mphb-availability-calendar'), $pick(['getCountry'], ['country']));

        if ($photo !== null) {
            $out[] = [
                'label' => __('Photo ID', 'mphb-availability-calendar'),
                'value' => '',
                'photo' => $photo,
            ];
        }

        // Guest 2-4 and the dog fields are MPHB checkout custom fields, so
        // they are matched on a NORMALIZED key (see custom_get) rather than an
        // exact one — installs spell them guest2_first_name, guest_2_fname, …
        self::push($out, __('Guest2 First Name', 'mphb-availability-calendar'), self::custom_get($custom, ['guest2firstname', 'guest2fname', 'guest2first']));
        self::push($out, __('Guest2 Last Name', 'mphb-availability-calendar'), self::custom_get($custom, ['guest2lastname', 'guest2lname', 'guest2last']));
        self::push($out, __('Guest 2 Phone', 'mphb-availability-calendar'), self::custom_get($custom, ['guest2phone', 'guest2telephone', 'guest2tel']));
        self::push($out, __('Guest3 First Name', 'mphb-availability-calendar'), self::custom_get($custom, ['guest3firstname', 'guest3fname', 'guest3first']));
        self::push($out, __('Guest3 Last Name', 'mphb-availability-calendar'), self::custom_get($custom, ['guest3lastname', 'guest3lname', 'guest3last']));
        self::push($out, __('Guest4 First Name', 'mphb-availability-calendar'), self::custom_get($custom, ['guest4firstname', 'guest4fname', 'guest4first']));
        self::push($out, __('Guest4 Last Name', 'mphb-availability-calendar'), self::custom_get($custom, ['guest4lastname', 'guest4lname', 'guest4last']));
        self::push($out, __('Dog Type', 'mphb-availability-calendar'), self::custom_get($custom, ['dogtype', 'typeofdog', 'dogbreed']));
        self::push($out, __('Dog Size', 'mphb-availability-calendar'), self::custom_get($custom, ['dogsize', 'sizeofdog']));
        self::push($out, __('Dog Hair', 'mphb-availability-calendar'), self::custom_get($custom, ['doghair', 'hairtype', 'doghairtype']));

        return $out;
    }

    /**
     * "%d adult" / "%d adults" — via _n() when WordPress is loaded so a
     * translation can supply its own plural rules, else the English pair.
     */
    private static function plural(int $n, string $one, string $many): string
    {
        if (function_exists('_n')) {
            return _n('%d ' . $one, '%d ' . $many, $n, 'mphb-availability-calendar');
        }
        return '%d ' . ($n === 1 ? $one : $many);
    }

    /**
     * Append a row unless the value is empty AFTER formatting.
     *
     * @param array<int,array<string,mixed>> $out
     * @param mixed                          $value
     * @param array<string,bool>             $flags
     */
    private static function push(array &$out, string $label, $value, array $flags = []): void
    {
        $text = self::str_or_dash($value);
        if (self::is_blank($text)) {
            return;
        }
        $out[] = ['label' => $label, 'value' => $text] + array_filter($flags);
    }

    /**
     * Is this value "empty" for display purposes? Blank, an em/en dash, a
     * hyphen, "N/A" or a bare "0" — the placeholder values MPHB checkout
     * fields collect when a guest skips them.
     *
     * Note "$0.00" is NOT blank: a Balance Due of zero means "nothing owed",
     * which staff need to see. Only a bare zero is treated as unset.
     */
    private static function is_blank(string $v): bool
    {
        $t = strtolower(trim($v));
        return in_array($t, ['', '—', '–', '-', 'n/a', 'na', 'none', 'null', '0'], true);
    }

    /**
     * Look a checkout custom field up by NORMALIZED key: MPHB prefixes vary
     * and installs punctuate differently, so "mphb_guest_2_first_name",
     * "guest2FirstName" and "Guest 2 First Name" all reduce to the same thing.
     *
     * @param array<string,mixed> $custom
     * @param string[]            $candidates already normalized
     */
    private static function custom_get(array $custom, array $candidates): string
    {
        static $norm = [];
        $sig = array_keys($custom);
        $key = md5(implode('|', $sig));
        if (!isset($norm[$key])) {
            $map = [];
            foreach ($custom as $k => $v) {
                $n = preg_replace('/[^a-z0-9]/', '', strtolower(preg_replace('/^mphb_?/i', '', (string) $k)));
                if ($n !== '' && !isset($map[$n])) {
                    $map[$n] = $v;
                }
            }
            $norm[$key] = $map;
        }
        foreach ($candidates as $c) {
            if (isset($norm[$key][$c])) {
                $v = $norm[$key][$c];
                if (is_array($v)) {
                    $v = reset($v);
                }
                if (is_scalar($v) && (string) $v !== '') {
                    return self::plain((string) $v);
                }
            }
        }
        return '';
    }

    /**
     * C) Notes — Internal Notes only.
     *
     * MPHB's getInternalNotes() returns an ARRAY of {note, date, user}; it is
     * rendered as one row per entry and never squeezed through scalar(), which
     * is what caused the 0.23.0 TypeError. See entry_rows().
     *
     * @return array<int,array<string,mixed>>
     */
    private static function section_notes(int $id, $b): array
    {
        $internal = self::first_of($b, ['getInternalNotes', 'getInternalNote']);
        return self::entry_rows($internal, __('Internal Notes', 'mphb-availability-calendar'), ['note', 'text', 'message', 'content']);
    }

    /**
     * Turn a notes/log value of ANY shape into label/value rows, newest first.
     * Accepts a string, an object, or a list whose entries are strings,
     * arrays ({note,date,user}) or objects (getMessage()/getDate()/getUser()).
     * Label is the entry's date (date_i18n) and author when known, else
     * $fallback_label. At most 50 rows.
     *
     * @param mixed    $value
     * @param string[] $text_keys  array keys / getter stems to try for the text
     * @return array<int,array{label:string,value:string}>
     */
    private static function entry_rows($value, string $fallback_label, array $text_keys): array
    {
        if ($value === null || $value === '' || $value === []) {
            return [];
        }
        $entries = is_array($value) && !self::is_assoc($value) ? $value : [$value];

        $parsed = [];
        $i = 0;
        foreach (array_slice($entries, 0, 50) as $e) {
            $n = self::note_entry($e, $text_keys);
            if ($n['text'] === '') {
                continue;
            }
            $n['i'] = $i++;
            $parsed[] = $n;
        }
        // Newest first: by timestamp when every entry has one, else reverse
        // the source order (MPHB appends).
        $all_dated = $parsed && !in_array(null, array_column($parsed, 'ts'), true);
        if ($all_dated) {
            usort($parsed, static fn($a, $b) => ($b['ts'] <=> $a['ts']) ?: ($b['i'] <=> $a['i']));
        } else {
            $parsed = array_reverse($parsed);
        }

        $out = [];
        foreach ($parsed as $n) {
            if (self::is_blank($n['text'])) {
                continue;
            }
            $bits = [];
            if ($n['ts'] !== null) {
                $bits[] = self::format_datetime($n['ts']);
            }
            if ($n['author'] !== '') {
                $bits[] = $n['author'];
            }
            $out[] = self::row($bits ? implode(' · ', $bits) : $fallback_label, $n['text']);
        }
        return $out;
    }

    /**
     * One note/log entry of any shape -> ['text','ts','author'].
     *
     * @param mixed $e
     * @return array{text:string,ts:?int,author:string}
     */
    private static function note_entry($e, array $text_keys): array
    {
        $text = ''; $date = null; $user = null;
        if (is_scalar($e)) {
            $text = (string) $e;
        } elseif (is_array($e)) {
            foreach ($text_keys as $k) {
                if (isset($e[$k]) && is_scalar($e[$k]) && (string) $e[$k] !== '') { $text = (string) $e[$k]; break; }
            }
            foreach (['date', 'time', 'created', 'datetime', 'timestamp'] as $k) {
                if (isset($e[$k]) && $e[$k] !== '') { $date = $e[$k]; break; }
            }
            foreach (['user', 'user_id', 'author', 'author_id'] as $k) {
                if (isset($e[$k]) && $e[$k] !== '') { $user = $e[$k]; break; }
            }
        } elseif (is_object($e)) {
            $getters = array_map(static fn($k) => 'get' . str_replace(' ', '', ucwords(str_replace('_', ' ', $k))), $text_keys);
            $text = (string) self::scalar($e, $getters, '');
            $date = self::first_of($e, ['getDate', 'getTime', 'getCreated', 'getDateTime']);
            $user = self::first_of($e, ['getUser', 'getUserId', 'getAuthor', 'getAuthorId']);
            if ($text === '' && method_exists($e, '__toString')) {
                $text = (string) $e;
            }
        }
        return ['text' => self::plain($text), 'ts' => self::to_timestamp($date), 'author' => self::author_name($user)];
    }

    /** @param mixed $v */
    private static function to_timestamp($v): ?int
    {
        if ($v instanceof \DateTimeInterface) {
            return $v->getTimestamp();
        }
        if (is_int($v) || (is_string($v) && ctype_digit($v))) {
            $n = (int) $v;
            return $n > 0 ? $n : null;
        }
        if (is_string($v) && $v !== '') {
            $t = strtotime($v);
            return $t === false ? null : $t;
        }
        return null;
    }

    private static function format_datetime(int $ts): string
    {
        $fmt = (string) get_option('date_format', 'F j, Y') . ' ' . (string) get_option('time_format', 'g:i a');
        $fmt = trim($fmt) !== '' ? trim($fmt) : 'F j, Y g:i a';
        // date_i18n renders in the site timezone; the raw stamp is UTC.
        return function_exists('date_i18n') ? (string) date_i18n($fmt, $ts) : date($fmt, $ts);
    }

    /** @param mixed $user  user id, login/display string, WP_User or object */
    private static function author_name($user): string
    {
        if ($user === null || $user === '' || $user === 0 || $user === '0') {
            return '';
        }
        if (is_object($user)) {
            $n = $user->display_name ?? null;
            if (!is_string($n) || $n === '') {
                $n = self::scalar($user, ['getDisplayName', 'getName', 'getLogin'], '');
            }
            return self::plain((string) $n);
        }
        if (is_numeric($user)) {
            $u = function_exists('get_userdata') ? get_userdata((int) $user) : false;
            if (is_object($u) && isset($u->display_name) && is_string($u->display_name) && $u->display_name !== '') {
                return self::plain($u->display_name);
            }
            return '#' . (int) $user;
        }
        return self::plain((string) $user);
    }

    private static function is_assoc(array $a): bool
    {
        return $a !== [] && array_keys($a) !== range(0, count($a) - 1);
    }

    /**
     * Display name for the calendar chip. PII — which is exactly why the whole
     * month payload is gated. Falls back through customer entity → reserved
     * room guest name → booking meta → the booking number, so a chip always
     * has something to show rather than rendering blank.
     */
    private static function guest_name(int $booking_id): string
    {
        // META FIRST, and for the month view meta ONLY.
        //
        // month_view() has already meta-primed every booking in the range, so
        // this resolves from memory at zero query cost. Constructing an MPHB
        // booking entity here instead would be a repository call PER BOOKING
        // (each of which may load its customer and reserved rooms) — the exact
        // N+1 the single-query design exists to avoid. The entity path is
        // therefore opt-in and used only by the lazy single-booking detail.
        $name = self::plain(self::name_from_meta($booking_id));
        if ($name !== '') {
            return $name;
        }
        // Deliberately NO entity fallback here: it would be a repository call
        // per booking. The detail sheet reads the customer entity directly
        // (section_customer), which is one booking and lazily loaded.
        // If chips show "#id" on a real install, extend name_from_meta()'s key
        // list rather than reaching for the entity here.
        //
        // Imports frequently carry no customer at all — the booking number is
        // still a usable handle for staff, and never a blank chip.
        return '#' . $booking_id;
    }

    /**
     * Guest name from primed booking meta, no queries. Tries the usual MPHB
     * keys, then falls back to scanning the (already loaded) meta for any
     * first/last/full-name key, so an install storing them under a different
     * name still shows something.
     */
    private static function name_from_meta(int $booking_id): string
    {
        $first = (string) get_post_meta($booking_id, 'mphb_first_name', true);
        $last  = (string) get_post_meta($booking_id, 'mphb_last_name', true);
        $name  = trim($first . ' ' . $last);
        if ($name !== '') {
            return $name;
        }
        foreach (['mphb_customer_name', 'mphb_name', 'mphb_full_name'] as $k) {
            $v = (string) get_post_meta($booking_id, $k, true);
            if (trim($v) !== '') {
                return trim($v);
            }
        }
        // Last resort: scan what is already in memory. No extra query.
        $f = ''; $l = '';
        foreach ((array) get_post_meta($booking_id) as $key => $vals) {
            $v = is_array($vals) ? (string) reset($vals) : (string) $vals;
            if ($v === '') {
                continue;
            }
            if ($f === '' && preg_match('/first[_-]?name$/i', (string) $key)) { $f = $v; }
            if ($l === '' && preg_match('/last[_-]?name$/i', (string) $key))  { $l = $v; }
        }
        return trim($f . ' ' . $l);
    }

    // ------------------------------------------------------------ OTA source

    /**
     * Is this booking an OTA import, and from where?
     *
     * @return array{imported:bool,ota:string,prodid:string,uid:string,summary:string}
     */
    public static function source_for(int $booking_id, ?array $reserved_ids = null): array
    {
        $prodid = (string) get_post_meta($booking_id, self::META_ICAL_PROD, true);
        if ($prodid === '') {
            // Reserved rooms sometimes carry the marker instead of the parent.
            // month_view() passes the ids it ALREADY has from its single query
            // (and has already meta-primed), so this costs no extra queries.
            // Only the lazy single-booking detail path falls back to a lookup.
            if ($reserved_ids === null) {
                $reserved_ids = get_posts([
                    'post_type'      => 'mphb_reserved_room',
                    'post_parent'    => $booking_id,
                    'posts_per_page' => 5,
                    'fields'         => 'ids',
                    'no_found_rows'  => true,
                    'post_status'    => 'any',
                ]);
            }
            foreach ((array) $reserved_ids as $rid) {
                $prodid = (string) get_post_meta((int) $rid, self::META_ICAL_PROD, true);
                if ($prodid !== '') {
                    break;
                }
            }
        }
        if ($prodid === '') {
            return ['imported' => false, 'ota' => '', 'prodid' => '', 'uid' => '', 'summary' => ''];
        }
        return [
            'imported' => true,
            'ota'      => self::ota_name($prodid),
            'prodid'   => $prodid,
            'uid'      => (string) get_post_meta($booking_id, self::META_ICAL_UID, true),
            'summary'  => (string) get_post_meta($booking_id, self::META_ICAL_SUMM, true),
        ];
    }

    /** Human OTA name from an iCal PRODID string. */
    private static function ota_name(string $prodid): string
    {
        $p = strtolower($prodid);
        if (strpos($p, 'airbnb') !== false)     return 'Airbnb';
        if (strpos($p, 'booking.com') !== false || strpos($p, 'booking') !== false) return 'Booking.com';
        if (strpos($p, 'vrbo') !== false || strpos($p, 'homeaway') !== false || strpos($p, 'expedia') !== false) return 'Vrbo';
        return __('an external channel', 'mphb-availability-calendar');
    }

    // ------------------------------------------------------------ photo proxy

    /**
     * Absolute path of the attachment a booking's custom field points at, or
     * null. Derived from the booking — never from client input — so the proxy
     * can only ever reach files this booking actually references.
     */
    public static function attachment_path_for(int $booking_id, string $field): ?string
    {
        $post = get_post($booking_id);
        if (!$post || $post->post_type !== 'mphb_booking') {
            return null;
        }
        $custom = self::custom_fields($booking_id, self::first_of(self::booking_entity($booking_id), ['getCustomer']));
        if (!array_key_exists($field, $custom)) {
            return null;
        }
        $val = $custom[$field];
        if (is_array($val)) {
            $val = reset($val);
        }
        if (is_numeric($val)) {
            $path = get_attached_file((int) $val);
            return is_string($path) && $path !== '' ? $path : null;
        }
        if (is_string($val) && $val !== '') {
            $id = attachment_url_to_postid($val);
            if ($id) {
                $path = get_attached_file($id);
                return is_string($path) && $path !== '' ? $path : null;
            }
            // Bare path inside uploads (older MPHB field storage).
            $uploads = wp_get_upload_dir();
            $base    = trailingslashit((string) ($uploads['basedir'] ?? ''));
            $rel     = ltrim(str_replace(trailingslashit((string) ($uploads['baseurl'] ?? '')), '', $val), '/');
            if ($rel !== '' && $rel !== $val) {
                return $base . $rel;
            }
        }
        return null;
    }

    private static function looks_like_attachment(string $key, $val): bool
    {
        if (preg_match('/(photo|id_?card|identification|licen[cs]e|passport|upload|attachment|file)/i', $key)) {
            return true;
        }
        return is_string($val) && preg_match('#/wp-content/uploads/.+\.(jpe?g|png|gif|webp|pdf)$#i', $val) === 1;
    }

    // --------------------------------------------------------------- helpers

    private static function booking_entity(int $id): ?object
    {
        try {
            if (!function_exists('MPHB')) {
                return null;
            }
            $mphb = \MPHB();
            if (!is_object($mphb) || !method_exists($mphb, 'getBookingRepository')) {
                return null;
            }
            $repo = $mphb->getBookingRepository();
            foreach (['findById', 'findByIds', 'find'] as $m) {
                if (is_object($repo) && method_exists($repo, $m)) {
                    $b = $repo->$m($id);
                    if (is_object($b)) {
                        return $b;
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('MPHBAC staff: booking entity load failed for ' . $id . ': ' . $e->getMessage());
        }
        return null;
    }

    /**
     * Reserved rooms as entities when MPHB offers them, else as raw ids so the
     * section still renders.
     *
     * @return array<int,array{entity:?object,room_id:int,room_type_id:int}>
     */
    private static function reserved_entities(int $booking_id, $b): array
    {
        $out = [];
        $ents = self::first_of($b, ['getReservedRooms', 'getRooms']);
        if (is_array($ents) && $ents) {
            foreach ($ents as $e) {
                $room_id = (int) self::scalar($e, ['getRoomId'], 0);
                $out[] = [
                    'entity'       => is_object($e) ? $e : null,
                    'room_id'      => $room_id,
                    'room_type_id' => (int) self::scalar($e, ['getRoomTypeId'], 0),
                ];
            }
            return $out;
        }
        // Fallback: the reserved-room posts themselves.
        foreach (get_posts([
            'post_type'      => 'mphb_reserved_room',
            'post_parent'    => $booking_id,
            'posts_per_page' => 20,
            'fields'         => 'ids',
            'no_found_rows'  => true,
            'post_status'    => 'any',
        ]) as $rid) {
            $room_id = (int) get_post_meta((int) $rid, self::META_ROOM_ID, true);
            $out[] = [
                'entity'       => null,
                'room_id'      => $room_id,
                'room_type_id' => $room_id ? (int) get_post_meta($room_id, 'mphb_room_type_id', true) : 0,
            ];
        }
        return $out;
    }

    /** @return array<string,mixed> */
    private static function custom_fields(int $booking_id, $customer): array
    {
        $fields = self::first_of($customer, ['getCustomFields', 'getFields', 'getCustomerFields']);
        if (is_array($fields) && $fields) {
            return $fields;
        }
        // Fallback: MPHB checkout fields stored as booking meta.
        $out = [];
        foreach ((array) get_post_meta($booking_id) as $key => $vals) {
            if (strpos((string) $key, 'mphb_') !== 0 || in_array($key, [self::META_CHECKIN, self::META_CHECKOUT], true)) {
                continue;
            }
            $v = is_array($vals) ? reset($vals) : $vals;
            $un = maybe_unserialize($v);
            if ($un !== '' && $un !== null) {
                $out[(string) $key] = $un;
            }
        }
        return $out;
    }

    private static function unit_title(int $room_id): string
    {
        if ($room_id <= 0) {
            return '—';
        }
        $p = get_post($room_id);
        return $p && $p->post_title !== '' ? self::plain((string) $p->post_title) : '#' . $room_id;
    }

    /**
     * First candidate method that returns something non-empty.
     *
     * $obj is deliberately UNTYPED. MPHB getters return arrays as well as
     * objects (getInternalNotes(), getLogs(), sometimes getCustomer()), and
     * scalar() re-feeds whatever it got back through here. A `?object` hint
     * made PHP 8 throw a TypeError before the is_object() guard below could
     * run — that fatal broke the details popup for two-thirds of live
     * bookings in 0.23.0. The guard IS the type check; do not re-add a hint
     * to this or any helper that can be handed a getter's return value.
     *
     * @param mixed $obj
     */
    private static function first_of($obj, array $methods)
    {
        if (!is_object($obj)) {
            return null;
        }
        foreach ($methods as $m) {
            if (!method_exists($obj, $m)) {
                continue;
            }
            try {
                $v = $obj->$m();
                if ($v !== null && $v !== '' && $v !== []) {
                    return $v;
                }
            } catch (\Throwable $e) {
                // Try the next candidate; a getter that throws is not fatal.
            }
        }
        return null;
    }

    /** @param mixed $obj  see first_of() */
    private static function scalar($obj, array $methods, $default)
    {
        $v = self::first_of($obj, $methods);
        if ($v === null) {
            return $default;
        }
        if (is_scalar($v)) {
            return $v;
        }
        if ($v instanceof \DateTimeInterface) {
            return $v->format('Y-m-d');
        }
        // Objects with a title/name are common for rates and coupons.
        $t = self::first_of($v, ['getTitle', 'getName', 'getCode', '__toString']);
        return is_scalar($t) ? $t : $default;
    }

    private static function date_of($b, array $methods, int $id, string $meta_key): string
    {
        $v = self::scalar($b, $methods, null);
        if ($v === null || $v === '') {
            $v = get_post_meta($id, $meta_key, true);
        }
        return is_string($v) && $v !== '' ? $v : '—';
    }

    private static function list_of($obj, array $methods): array
    {
        $v = self::first_of($obj, $methods);
        if (!is_array($v)) {
            return [];
        }
        $out = [];
        foreach ($v as $item) {
            $label = self::plain(is_scalar($item) ? (string) $item : (string) self::scalar($item, ['getTitle', 'getName'], ''));
            $price = is_object($item) ? self::money(self::scalar($item, ['getTotalPrice', 'getPrice'], null)) : '';
            if ($label !== '') {
                $out[] = ['label' => $label, 'price' => $price];
            }
        }
        return $out;
    }

    /**
     * PLAIN TEXT, always. mphb_format_price() returns markup
     * (<span class="mphb-price"><span class="mphb-currency">&#036;</span>…),
     * and the client deliberately renders every value with textContent — the
     * one XSS defence that cannot be bypassed by a crafted guest name. The
     * contract is therefore "the payload is text"; the server keeps it, the
     * client never relaxes it. Strip the tags and decode the entity here.
     */
    private static function money($v): string
    {
        if ($v === null || $v === '' || !is_numeric($v)) {
            return '—';
        }
        if (function_exists('mphb_format_price')) {
            $s = self::plain((string) mphb_format_price((float) $v));
            if ($s !== '') {
                return $s;
            }
        }
        return '$' . number_format((float) $v, 2);
    }

    /**
     * How much has actually been received for a booking, and through what.
     *
     * Three tiers, because the MPHB Booking entity does not reliably expose a
     * paid amount (the live site returned nothing for getPaidAmount/getPaid
     * while getTotalPrice worked):
     *   1. a paid-amount getter on the booking entity, if this MPHB has one;
     *   2. the payment repository — every payment linked to the booking,
     *      summing those whose status counts as received;
     *   3. the payment posts themselves, by SQL.
     * `paid` is null ONLY when no payment record exists at all (or the read
     * failed); it is never null merely because a getter is missing.
     *
     * @return array{paid:?float,method:string,status:string}
     */
    private static function payment_info(int $booking_id, $b): array
    {
        $out = ['paid' => null, 'method' => '', 'status' => ''];

        $v = self::scalar($b, ['getPaidAmount', 'getPaid', 'getPaidPrice', 'getTotalPaid'], null);
        if (is_numeric($v)) {
            $out['paid'] = (float) $v;
        }

        $counts = self::paid_statuses();
        $payments = self::payment_entities($booking_id);
        if ($payments) {
            $sum = 0.0;
            $latest = null;
            foreach ($payments as $p) {
                $status = (string) self::scalar($p, ['getStatus'], '');
                $amount = self::scalar($p, ['getAmount', 'getTotal', 'getTotalPrice'], null);
                if (in_array($status, $counts, true) && is_numeric($amount)) {
                    $sum += (float) $amount;
                }
                $latest = $p;
            }
            if ($out['paid'] === null) {
                $out['paid'] = $sum;
            }
            $out['method'] = self::gateway_label((string) self::scalar($latest, ['getGatewayId', 'getGateway', 'getPaymentMethod'], ''));
            $out['status'] = self::payment_status_label((string) self::scalar($latest, ['getStatus'], ''));
            return $out;
        }

        $sql = self::payment_rows($booking_id);
        if ($sql !== null && $sql) {
            $sum = 0.0;
            foreach ($sql as $r) {
                if (in_array((string) $r->post_status, $counts, true) && is_numeric($r->amount)) {
                    $sum += (float) $r->amount;
                }
            }
            $last = end($sql);
            if ($out['paid'] === null) {
                $out['paid'] = $sum;
            }
            $out['method'] = self::gateway_label((string) ($last->gateway ?? ''));
            $out['status'] = self::payment_status_label((string) $last->post_status);
        }
        return $out;
    }

    /** @return string[] */
    private static function paid_statuses(): array
    {
        $s = (array) apply_filters('mphbac_staff_paid_statuses', self::PAYMENT_PAID_STATUSES);
        return array_values(array_filter(array_map('strval', $s)));
    }

    /** Payment entities for a booking via MPHB's repository, or [] . */
    private static function payment_entities(int $booking_id): array
    {
        try {
            if (!function_exists('MPHB')) {
                return [];
            }
            $mphb = \MPHB();
            if (!is_object($mphb) || !method_exists($mphb, 'getPaymentRepository')) {
                return [];
            }
            $repo = $mphb->getPaymentRepository();
            if (!is_object($repo) || !method_exists($repo, 'findAll')) {
                return [];
            }
            $list = $repo->findAll(['booking_id' => $booking_id]);
            return is_array($list) ? array_values(array_filter($list, 'is_object')) : [];
        } catch (\Throwable $e) {
            error_log('MPHBAC staff: payment repository read failed for ' . $booking_id . ': ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Payment posts linked to a booking, oldest first. Null on a DB error so
     * the caller can tell "no payments" from "could not read".
     *
     * @return object[]|null
     */
    private static function payment_rows(int $booking_id): ?array
    {
        global $wpdb;
        if (!is_object($wpdb)) {
            return null;
        }
        $bk_ph = implode(',', array_fill(0, count(self::PAYMENT_BOOKING_KEYS), '%s'));
        $am_ph = implode(',', array_fill(0, count(self::PAYMENT_AMOUNT_KEYS), '%s'));
        $gw_ph = implode(',', array_fill(0, count(self::PAYMENT_GATEWAY_KEYS), '%s'));
        // MAX() rather than bare columns so the GROUP BY is valid under
        // ONLY_FULL_GROUP_BY when a payment carries both key spellings.
        $sql = "SELECT p.ID, p.post_status, MAX(am.meta_value) AS amount, MAX(gw.meta_value) AS gateway
                FROM {$wpdb->posts} p
                INNER JOIN {$wpdb->postmeta} bk
                        ON bk.post_id = p.ID AND bk.meta_key IN ($bk_ph) AND bk.meta_value = %s
                LEFT JOIN {$wpdb->postmeta} am
                        ON am.post_id = p.ID AND am.meta_key IN ($am_ph)
                LEFT JOIN {$wpdb->postmeta} gw
                        ON gw.post_id = p.ID AND gw.meta_key IN ($gw_ph)
                WHERE p.post_type = %s
                GROUP BY p.ID, p.post_status, p.post_date
                ORDER BY p.post_date ASC, p.ID ASC
                LIMIT 50";
        $params = array_merge(
            self::PAYMENT_BOOKING_KEYS, [(string) $booking_id],
            self::PAYMENT_AMOUNT_KEYS, self::PAYMENT_GATEWAY_KEYS,
            [self::PAYMENT_POST_TYPE]
        );
        $rows = $wpdb->get_results($wpdb->prepare($sql, $params));
        if (isset($wpdb->last_error) && $wpdb->last_error !== '') {
            error_log('MPHBAC staff: payment query failed: ' . $wpdb->last_error);
            return null;
        }
        return is_array($rows) ? $rows : [];
    }

    private static function gateway_label(string $id): string
    {
        $id = trim($id);
        if ($id === '') {
            return '';
        }
        $map = [
            'manual' => __('Manual', 'mphb-availability-calendar'),
            'cash'   => __('Cash', 'mphb-availability-calendar'),
            'bank'   => __('Bank transfer', 'mphb-availability-calendar'),
            'paypal' => 'PayPal',
            'stripe' => 'Stripe',
            'braintree' => 'Braintree',
            'beanstream' => 'Bambora',
            '2checkout' => '2Checkout',
        ];
        return $map[strtolower($id)] ?? self::humanize($id);
    }

    private static function payment_status_label(string $status): string
    {
        $status = trim($status);
        if ($status === '') {
            return '';
        }
        $map = [
            'mphb-p-completed' => __('Completed', 'mphb-availability-calendar'),
            'mphb-p-pending'   => __('Pending', 'mphb-availability-calendar'),
            'mphb-p-on-hold'   => __('On hold', 'mphb-availability-calendar'),
            'mphb-p-failed'    => __('Failed', 'mphb-availability-calendar'),
            'mphb-p-refunded'  => __('Refunded', 'mphb-availability-calendar'),
            'mphb-p-abandoned' => __('Abandoned', 'mphb-availability-calendar'),
            'mphb-p-cancelled' => __('Cancelled', 'mphb-availability-calendar'),
        ];
        return $map[$status] ?? ucfirst(str_replace(['mphb-p-', '-'], ['', ' '], $status));
    }

    private static function row(string $label, $value): array
    {
        return ['label' => $label, 'value' => self::str_or_dash($value)];
    }

    /**
     * Imported bookings routinely lack email/phone — an em dash, not a blank.
     * Every value that reaches the client passes through here (or money()),
     * and comes out as PLAIN TEXT — see plain().
     */
    private static function str_or_dash($v): string
    {
        if ($v === null || $v === '' || $v === false) {
            return '—';
        }
        if (is_array($v)) {
            $v = implode(', ', array_filter(array_map(static fn($x) => is_scalar($x) ? (string) $x : '', $v)));
        }
        $s = self::plain((string) $v);
        return $s === '' ? '—' : $s;
    }

    /**
     * Text for a textContent slot: tags stripped, entities decoded, runs of
     * spaces collapsed, newlines kept (notes are multi-line). MPHB's booking
     * log entries and formatted prices both carry markup; the client must
     * never have to choose between showing "&#036;" literally and innerHTML.
     */
    private static function plain(string $s): string
    {
        if ($s === '') {
            return '';
        }
        if (strpos($s, '<') !== false) {
            $s = function_exists('wp_strip_all_tags') ? wp_strip_all_tags($s) : strip_tags($s);
        }
        if (strpos($s, '&') !== false) {
            $s = html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
        $s = preg_replace('/[ \t]+/', ' ', $s) ?? $s;
        return trim($s);
    }

    private static function int_or_null($v): ?int
    {
        return is_numeric($v) ? (int) $v : null;
    }

    private static function humanize(string $key): string
    {
        $k = preg_replace('/^mphb_/', '', $key);
        return ucwords(trim(str_replace(['_', '-'], ' ', (string) $k)));
    }

    public static function status_label(string $status): string
    {
        $map = [
            'confirmed'       => __('Confirmed', 'mphb-availability-calendar'),
            'pending'         => __('Pending approval', 'mphb-availability-calendar'),
            'pending-payment' => __('Pending payment', 'mphb-availability-calendar'),
            'pending-user'    => __('Awaiting confirmation', 'mphb-availability-calendar'),
        ];
        return $map[$status] ?? ucfirst(str_replace('-', ' ', $status));
    }
}
