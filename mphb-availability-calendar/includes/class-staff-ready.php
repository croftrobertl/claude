<?php
namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * READY OR NOT: THE CLEANING DOT (0.48.0, Rob).
 *
 * "Just a red dot next to the cottage name automatically appearing the day a
 * guest checks out, then we hold the cottage name and a popup appears where
 * we select 'Ready'. Simple: red = not ready; green = ready."
 *
 * A cottage's dot follows its LATEST CHECKOUT ON OR BEFORE TODAY (Eastern,
 * Data_Provider::today()) of a CONFIRMED stay — direct or imported from any
 * channel — that is not one of Rob's dock blocks (Staff_Data::is_dock_block):
 *   - marked Ready for that checkout  → green, until the next checkout;
 *   - not marked, checkout within the last RED_DAYS days → red;
 *   - otherwise (nobody checked out lately, nothing pending) → no dot.
 * A new checkout is a new key, so it is unmarked — red — by construction.
 *
 * STORAGE IS THE PLUGIN'S OWN, NEVER MOTOPRESS'S: one non-autoloaded option
 * per cottage, mphbac_ready_<type id>, holding the cottage's last few
 * checkouts: [checkout => ['ready' => bool, 'log' => [[unix time, 0|1], ...]]].
 * The log is the quiet record of every change Rob asked for; nothing shows
 * it. One option per cottage, so two staff marking two cottages at once
 * cannot overwrite each other. Written only by save(), which only the gated
 * endpoint calls (Staff::handle_ready); never on a read, never on install.
 *
 * No guest data: a cottage id, a date and a flag.
 */
final class Staff_Ready
{
    /** How long an unmarked checkout stays red before it is let go. */
    public const RED_DAYS = 14;
    /** How far back a checkout can still carry a green dot. */
    private const LOOKBACK_DAYS = 400;
    /** Checkouts kept per cottage (the log of older ones is dropped). */
    private const KEEP = 12;
    /** Changes kept per checkout. */
    private const LOG_MAX = 20;
    private const OPTION_PREFIX = 'mphbac_ready_';

    public static function option_name(int $type_id): string
    {
        return self::OPTION_PREFIX . $type_id;
    }

    /**
     * The dot of every cottage that has one: type id => ['checkout' => Y-m-d,
     * 'ready' => bool]. Cottages without a dot are absent.
     *
     * @return array<string, array{checkout:string, ready:bool}>
     * @throws Staff_Read_Failed
     */
    public static function state(): array
    {
        $today = Data_Provider::today();
        $red_from = $today->modify('-' . (self::RED_DAYS - 1) . ' days')->format('Y-m-d');
        $out = [];
        foreach (self::latest_checkouts() as $type_id => $checkout) {
            $rec = self::stored($type_id)[$checkout] ?? null;
            $ready = is_array($rec) && !empty($rec['ready']);
            if ($ready || $checkout >= $red_from) {
                $out[(string) $type_id] = ['checkout' => $checkout, 'ready' => $ready];
            }
        }
        return $out;
    }

    /**
     * Each cottage's latest checkout on or before today: type id => Y-m-d.
     * Confirmed bookings only (pending and cancelled ones are not stays);
     * dock blocks skipped, so a dock block never lights a dot — the cottage's
     * last real stay before it does.
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
            // dots it has rather than wiping them (Staff::view_or_fail).
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

    /** @return array<string, array{ready:bool, log:array}> */
    private static function stored(int $type_id): array
    {
        $v = get_option(self::option_name($type_id), []);
        return is_array($v) ? $v : [];
    }

    /**
     * Mark one cottage's checkout Ready (or Not Ready). Only the checkout the
     * cottage's dot stands for can be marked: anything else (a stale page
     * after a new checkout, a made-up date) changes nothing and answers null.
     *
     * @throws \RuntimeException when the write did not stick
     */
    public static function save(int $type_id, string $checkout, bool $ready): ?bool
    {
        $current = self::state()[(string) $type_id] ?? null;
        if ($current === null || $current['checkout'] !== $checkout) {
            return null;
        }
        $data = self::stored($type_id);
        $rec = is_array($data[$checkout] ?? null) ? $data[$checkout] : ['ready' => false, 'log' => []];
        $rec['ready'] = $ready;
        $rec['log'] = array_slice(array_merge((array) ($rec['log'] ?? []), [[time(), $ready ? 1 : 0]]), -self::LOG_MAX);
        $data[$checkout] = $rec;
        krsort($data);
        $data = array_slice($data, 0, self::KEEP, true);
        update_option(self::option_name($type_id), $data, false);
        $back = self::stored($type_id)[$checkout]['ready'] ?? null;
        if ($back !== $ready) {
            throw new \RuntimeException('ready state did not save');
        }
        return $ready;
    }
}
