<?php
namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * READY OR NOT: THE CLEANING SIGN (0.48.0; any cottage, any time since 0.50.0, Rob).
 *
 * Each cottage's state is decided by the NEWER of two events:
 *   (a) AUTOMATIC: its latest checkout on or before today (Eastern,
 *       Data_Provider::today()) of a CONFIRMED stay — direct or imported —
 *       that is not one of Rob's dock blocks. Its time is the start of the
 *       checkout day. It means Not Ready, and clears after RED_DAYS.
 *   (b) MANUAL: a staff mark, Ready or Not Ready, stored with its time. It
 *       never expires; only a newer checkout (or a newer mark) replaces it.
 * Never marked and no checkout within RED_DAYS → no sign (Rob's pick).
 * Any cottage can be marked at any time, a guest in it or not.
 *
 * OCCUPIED (0.51.0, Rob): while a guest is in — a stay the staff calendar
 * draws, check-in ≤ today < check-out (site time), not a dock block or a
 * cancelled booking — the cottage shows Occupied (a gray sign). It sits on
 * top of the automatic state and of any mark made before the stay began: only
 * a mark made AFTER the guest's check-in time on the arrival day (MotoPress's
 * own setting) replaces it, until that guest's checkout. On a TURNOVER day
 * (a checkout on the new guest's arrival day) the checkout governs: Not Ready
 * until marked Ready; the new stay shows Occupied from the next morning.
 *
 * STORAGE IS THE PLUGIN'S OWN, NEVER MOTOPRESS'S: one non-autoloaded option
 * per cottage, mphbac_ready_<type id> = ['v' => 2, 'manual' => ['ready' =>
 * bool, 'at' => unix time] | null, 'log' => [[unix time, 0|1], ...]]. The log
 * is the quiet record of every mark. No guest data: a cottage, a flag, times.
 * 0.48/0.49 kept [checkout date => ['ready', 'log']]: read as it is (its last
 * Ready, if its last change was one, is the manual mark), rewritten in the new
 * shape only by the next mark — never on install or upgrade.
 *
 * THE STALE PAGE: every state carries `at`, the time of the newest event
 * behind it (mark or checkout). A save sends the `at` its page showed; if the
 * cottage's own is newer, the save changes nothing and answers "changed".
 */
final class Staff_Ready
{
    /** How long an automatic Not Ready (a checkout nobody marked) is shown. */
    public const RED_DAYS = 14;
    /** How far back a checkout is looked for. */
    private const LOOKBACK_DAYS = 400;
    /** Marks kept in the quiet record per cottage. */
    private const LOG_MAX = 50;
    private const OPTION_PREFIX = 'mphbac_ready_';

    public const READY = 'ready';
    public const NOT_READY = 'notready';
    public const NONE = 'none';
    public const OCCUPIED = 'occupied';

    public static function option_name(int $type_id): string
    {
        return self::OPTION_PREFIX . $type_id;
    }

    /**
     * Every listed cottage: type id => ['state' => ready|notready|occupied|
     * none, 'source' => auto|manual|occupied|'', 'at' => unix time of the
     * newest event, 'stay' => true while the Occupied rule governs it (a
     * guest in, not a turnover day) — the popup then also offers Occupied].
     *
     * @return array<string, array{state:string, source:string, at:int, stay:bool}>
     * @throws Staff_Read_Failed
     */
    public static function state(): array
    {
        $checkouts = self::latest_checkouts();
        $stays = self::current_stays();
        $checkin = self::checkin_seconds();
        $out = [];
        foreach (Data_Provider::list_room_types() as $t) {
            $id = (int) $t['id'];
            $rec = self::record($id);
            $out[(string) $id] = self::decide($checkouts[$id] ?? null, $rec['manual'], $stays[$id] ?? null, $checkin, $rec['cleared']);
        }
        return $out;
    }

    /**
     * THE RULE. $checkout: the latest checkout (Y-m-d) or null; $manual:
     * ['ready', 'at'] or null; $stay_in: the arrival day (Y-m-d) of the stay
     * the cottage is in today, or null; $checkin_secs: MotoPress's check-in
     * time, in seconds after midnight; $cleared_at: when a mark was last
     * cleared back to Occupied (0.52.0), 0 if never — its time counts, so a
     * page that saw the mark before it is stale.
     *
     * @return array{state:string, source:string, at:int, stay:bool}
     */
    public static function decide(?string $checkout, ?array $manual, ?string $stay_in = null, int $checkin_secs = 0, int $cleared_at = 0): array
    {
        $tz = Data_Provider::timezone();
        $auto_at = $checkout !== null ? (new \DateTimeImmutable($checkout, $tz))->getTimestamp() : null;
        $man_at = $manual !== null ? (int) $manual['at'] : null;
        $at = max((int) $auto_at, (int) $man_at, $cleared_at);

        // OCCUPIED (0.51.0). A turnover — a checkout on the stay's arrival
        // day — leaves that day to the checkout; Occupied starts next morning.
        if ($stay_in !== null) {
            $arrival = new \DateTimeImmutable($stay_in, $tz);
            $occ_from = ($checkout === $stay_in) ? $arrival->modify('+1 day') : $arrival;
            if (Data_Provider::today() >= $occ_from) {
                $at = max($at, $occ_from->getTimestamp());
                $stay_start = $arrival->getTimestamp() + $checkin_secs;
                if ($man_at !== null && $man_at > $stay_start) {
                    // A mark made during this stay replaces Occupied.
                    $during = !empty($manual['ready']) ? self::READY : self::NOT_READY;
                    return ['state' => $during, 'source' => 'manual', 'at' => $at, 'stay' => true];
                }
                return ['state' => self::OCCUPIED, 'source' => 'occupied', 'at' => $at, 'stay' => true];
            }
        }
        if ($man_at !== null && ($auto_at === null || $man_at >= $auto_at)) {
            return ['state' => !empty($manual['ready']) ? self::READY : self::NOT_READY, 'source' => 'manual', 'at' => $at, 'stay' => false];
        }
        if ($checkout !== null) {
            $red_from = Data_Provider::today()->modify('-' . (self::RED_DAYS - 1) . ' days')->format('Y-m-d');
            if ($checkout >= $red_from) {
                return ['state' => self::NOT_READY, 'source' => 'auto', 'at' => $at, 'stay' => false];
            }
        }
        return ['state' => self::NONE, 'source' => '', 'at' => $at, 'stay' => false];
    }

    /**
     * Each cottage's latest checkout on or before today: type id => Y-m-d.
     * Confirmed bookings only (pending and cancelled ones are not stays);
     * dock blocks skipped, so a dock block never turns a cottage Not Ready —
     * the cottage's last real stay before it does.
     *
     * @return array<int, string>
     * @throws Staff_Read_Failed
     */
    public static function latest_checkouts(): array
    {
        global $wpdb;
        $today = Data_Provider::today();
        $sql = "SELECT bk.ID AS booking_id,
                       rtid.meta_value AS room_type_id,
                       co.meta_value AS checkout
                FROM {$wpdb->posts} rr
                INNER JOIN {$wpdb->postmeta} rid
                        ON rid.post_id = rr.ID AND rid.meta_key = '_mphb_room_id'
                INNER JOIN {$wpdb->posts} bk
                        ON bk.ID = rr.post_parent AND bk.post_type = 'mphb_booking'
                INNER JOIN {$wpdb->postmeta} co
                        ON co.post_id = bk.ID AND co.meta_key = 'mphb_check_out_date'
                INNER JOIN {$wpdb->postmeta} rtid
                        ON rtid.post_id = CAST(rid.meta_value AS UNSIGNED)
                       AND rtid.meta_key = 'mphb_room_type_id'
                WHERE rr.post_type = 'mphb_reserved_room'
                  AND bk.post_status = 'confirmed'
                  AND co.meta_value <= %s
                  AND co.meta_value >= %s
                ORDER BY co.meta_value DESC, bk.ID DESC";
        $rows = $wpdb->get_results($wpdb->prepare($sql, $today->format('Y-m-d'),
            $today->modify('-' . self::LOOKBACK_DAYS . ' days')->format('Y-m-d')));
        if ($wpdb->last_error !== '') {
            // A failed read is not "nobody checked out": the board keeps the
            // signs it has rather than wiping them (Staff::view_or_fail).
            error_log('MPHBAC staff: checkout query failed: ' . $wpdb->last_error);
            throw new Staff_Read_Failed('staff checkout query failed');
        }
        $rows = is_array($rows) ? $rows : [];
        $ids = array_values(array_unique(array_map(static fn($r) => (int) $r->booking_id, $rows)));
        if ($ids) {
            // The dock-block test reads the guest name from meta: one query
            // for all of them, never one per booking.
            update_meta_cache('post', $ids);
        }
        $out = [];
        foreach ($rows as $r) {
            $type_id = (int) $r->room_type_id;
            if ($type_id <= 0 || isset($out[$type_id])) {
                continue;
            }
            if (Staff_Data::is_dock_block((int) $r->booking_id)) {
                continue;
            }
            $checkout = substr((string) $r->checkout, 0, 10);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $checkout)) {
                $out[$type_id] = $checkout;
            }
        }
        return $out;
    }

    /**
     * The arrival day of the stay each cottage is in today: type id => Y-m-d.
     * "In": check-in ≤ today < check-out, site time. Every status the staff
     * calendar draws (Staff::VISIBLE_STATUSES, as filtered) — never a
     * cancelled booking — and never a dock block. A cottage with two such
     * stays (a data error) takes the later arrival.
     *
     * @return array<int, string>
     * @throws Staff_Read_Failed
     */
    public static function current_stays(): array
    {
        global $wpdb;
        $statuses = (array) apply_filters('mphbac_staff_statuses', Staff::VISIBLE_STATUSES);
        $statuses = array_values(array_filter(array_map('strval', $statuses), static fn($s) => $s !== '' && $s !== 'cancelled'));
        if (!$statuses) {
            return [];
        }
        $today = Data_Provider::today()->format('Y-m-d');
        $ph = implode(',', array_fill(0, count($statuses), '%s'));
        $sql = "SELECT bk.ID AS booking_id,
                       rtid.meta_value AS room_type_id,
                       ci.meta_value AS checkin
                FROM {$wpdb->posts} rr
                INNER JOIN {$wpdb->postmeta} rid
                        ON rid.post_id = rr.ID AND rid.meta_key = '_mphb_room_id'
                INNER JOIN {$wpdb->posts} bk
                        ON bk.ID = rr.post_parent AND bk.post_type = 'mphb_booking'
                INNER JOIN {$wpdb->postmeta} ci
                        ON ci.post_id = bk.ID AND ci.meta_key = 'mphb_check_in_date'
                INNER JOIN {$wpdb->postmeta} co
                        ON co.post_id = bk.ID AND co.meta_key = 'mphb_check_out_date'
                INNER JOIN {$wpdb->postmeta} rtid
                        ON rtid.post_id = CAST(rid.meta_value AS UNSIGNED)
                       AND rtid.meta_key = 'mphb_room_type_id'
                WHERE rr.post_type = 'mphb_reserved_room'
                  AND bk.post_status IN ($ph)
                  AND ci.meta_value <= %s
                  AND co.meta_value > %s
                ORDER BY ci.meta_value DESC, bk.ID DESC";
        $rows = $wpdb->get_results($wpdb->prepare($sql, array_merge($statuses, [$today, $today])));
        if ($wpdb->last_error !== '') {
            error_log('MPHBAC staff: stay query failed: ' . $wpdb->last_error);
            throw new Staff_Read_Failed('staff stay query failed');
        }
        $rows = is_array($rows) ? $rows : [];
        $ids = array_values(array_unique(array_map(static fn($r) => (int) $r->booking_id, $rows)));
        if ($ids) {
            update_meta_cache('post', $ids);
        }
        $out = [];
        foreach ($rows as $r) {
            $type_id = (int) $r->room_type_id;
            if ($type_id <= 0 || isset($out[$type_id]) || Staff_Data::is_dock_block((int) $r->booking_id)) {
                continue;
            }
            $ci = substr((string) $r->checkin, 0, 10);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $ci)) {
                $out[$type_id] = $ci;
            }
        }
        return $out;
    }

    /**
     * MotoPress's check-in time (Accommodation → Settings), in seconds after
     * midnight: its own getter where it answers, else the option it reads
     * (mphb_check_in_time, "11:00" by MotoPress's own default).
     */
    public static function checkin_seconds(): int
    {
        $parts = null;
        try {
            if (function_exists('MPHB')) {
                $parts = \MPHB()->settings()->dateTime()->getCheckInTime(true);
            }
        } catch (\Throwable $e) {
            $parts = null;
        }
        if (!is_array($parts)) {
            $parts = explode(':', (string) get_option('mphb_check_in_time', '11:00'));
        }
        $h = max(0, min(23, (int) ($parts[0] ?? 11)));
        $m = max(0, min(59, (int) ($parts[1] ?? 0)));
        return $h * 3600 + $m * 60;
    }

    /**
     * The stored record in its 0.50.0 shape, whatever shape it was saved in.
     * 0.52.0 adds one key: 'cleared', when a mark was last cleared back to
     * Occupied (absent = 0). Log entries: [t, 1] Ready, [t, 0] Not Ready,
     * [t, 2] cleared to Occupied.
     *
     * @return array{v:int, manual:?array, log:array, cleared:int}
     */
    private static function record(int $type_id): array
    {
        $v = get_option(self::option_name($type_id), []);
        $v = is_array($v) ? $v : [];
        if (($v['v'] ?? 0) === 2) {
            $m = $v['manual'] ?? null;
            return ['v' => 2, 'manual' => is_array($m) && isset($m['at']) ? ['ready' => !empty($m['ready']), 'at' => (int) $m['at']] : null,
                'log' => is_array($v['log'] ?? null) ? $v['log'] : [], 'cleared' => (int) ($v['cleared'] ?? 0)];
        }
        // 0.48/0.49: [checkout => ['ready', 'log' => [[t, 0|1]]]]. Its marks,
        // in time order; Not Ready there only ever undid a Ready (back to the
        // automatic state), so only a LAST change to Ready is a manual mark.
        $log = [];
        foreach ($v as $rec) {
            foreach ((array) ($rec['log'] ?? []) as $e) {
                if (is_array($e) && isset($e[0], $e[1])) {
                    $log[] = [(int) $e[0], (int) $e[1] ? 1 : 0];
                }
            }
        }
        usort($log, static fn($a, $b) => $a[0] <=> $b[0]);
        $last = $log ? $log[count($log) - 1] : null;
        return ['v' => 2, 'manual' => $last && $last[1] === 1 ? ['ready' => true, 'at' => $last[0]] : null, 'log' => $log, 'cleared' => 0];
    }

    /**
     * Mark one cottage Ready (or Not Ready), now. $seen is the `at` the page
     * showed: if the cottage's state has a newer event, nothing is written
     * and null is returned ("changed, reload"). Only listed cottages.
     *
     * @throws \RuntimeException when the write did not stick
     */
    public static function save(int $type_id, bool $ready, int $seen): ?bool
    {
        $current = self::state()[(string) $type_id] ?? null;
        if ($current === null || $current['at'] > $seen) {
            return null;
        }
        $rec = self::record($type_id);
        $now = max(time(), $current['at'] + 1);   // strictly newer than what it replaces
        $rec['manual'] = ['ready' => $ready, 'at' => $now];
        $rec['log'] = array_slice(array_merge($rec['log'], [[$now, $ready ? 1 : 0]]), -self::LOG_MAX);
        update_option(self::option_name($type_id), $rec, false);
        $back = self::record($type_id)['manual'];
        if (!$back || $back['ready'] !== $ready || $back['at'] !== $now) {
            throw new \RuntimeException('ready state did not save');
        }
        return $ready;
    }

    /**
     * OCCUPIED, tapped (0.52.0, Rob): clear the manual mark so the gray sign
     * shows again until the guest's checkout. Only while the Occupied rule
     * governs the cottage (a guest in, not a turnover day); the same stale
     * refusal as save(). Records when, and logs it ([t, 2]). Returns true, or
     * null when refused (stale, or no guest in).
     *
     * @throws \RuntimeException when the write did not stick
     */
    public static function clear(int $type_id, int $seen): ?bool
    {
        $current = self::state()[(string) $type_id] ?? null;
        if ($current === null || empty($current['stay']) || $current['at'] > $seen) {
            return null;
        }
        $rec = self::record($type_id);
        $now = max(time(), $current['at'] + 1);
        $rec['manual'] = null;
        $rec['cleared'] = $now;
        $rec['log'] = array_slice(array_merge($rec['log'], [[$now, 2]]), -self::LOG_MAX);
        update_option(self::option_name($type_id), $rec, false);
        $back = self::record($type_id);
        if ($back['manual'] !== null || $back['cleared'] !== $now) {
            throw new \RuntimeException('occupied state did not save');
        }
        return true;
    }
}
