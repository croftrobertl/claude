<?php
namespace MPHBAC;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * READY OR NOT: THE COTTAGE STATUS (0.48.0; only staff change it since 0.58.0).
 *
 * ONLY A TAP CHANGES A STATUS (0.58.0, Rob, FINAL). "Ready", "Not Ready" and
 * "Occupied" are exactly what staff last tapped for the cottage. Nothing is
 * worked out from bookings or dates: not at midnight, not at check-in time,
 * not at checkout. Staff marking a cottage Occupied IS the check-in record.
 * Never tapped → no sign. Any cottage can be tapped to any status at any time.
 * (0.48.0–0.57.1 also showed an automatic Not Ready after a checkout and an
 * automatic Occupied while a guest was in; both are gone.)
 *
 * STORAGE IS THE PLUGIN'S OWN, NEVER MOTOPRESS'S: one non-autoloaded option
 * per cottage, mphbac_ready_<type id> = ['v' => 2, 'manual' => ['ready' =>
 * bool, 'at' => unix time] | null, 'cleared' => unix time, 'log' => [[unix
 * time, 0|1|2], ...]]. Ready / Not Ready is 'manual'; Occupied is 'manual'
 * null with 'cleared' the time of the tap — the shape 0.52.0 already stored,
 * so a stored status reads the same before and after the upgrade and after a
 * rollback. The log is the quiet record of every tap. No guest data: a
 * cottage, a flag, times. 0.48/0.49 kept [checkout date => ['ready', 'log']]:
 * read as it is, rewritten in the new shape only by the next tap — never on
 * install or upgrade.
 *
 * THE STALE PAGE: every status carries `at`, the time of the tap behind it. A
 * save sends the `at` its page showed; if the cottage's own is newer (another
 * phone tapped first), the save changes nothing and answers "changed".
 */
final class Staff_Ready
{
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
     * none, 'source' => manual|'', 'at' => unix time of the last tap]. Read
     * from the stored taps alone: no booking, no date, no clock.
     *
     * @return array<string, array{state:string, source:string, at:int}>
     */
    public static function state(): array
    {
        $out = [];
        foreach (Data_Provider::list_room_types() as $t) {
            $id = (int) $t['id'];
            $rec = self::record($id);
            $out[(string) $id] = self::decide($rec['manual'], $rec['cleared']);
        }
        return $out;
    }

    /**
     * THE RULE: the newest tap. $manual: ['ready', 'at'] (a Ready or Not
     * Ready tap) or null; $cleared_at: the time of the last Occupied tap, 0
     * if never. Whichever is newer is the status; neither → none.
     *
     * @return array{state:string, source:string, at:int}
     */
    public static function decide(?array $manual, int $cleared_at = 0): array
    {
        $man_at = $manual !== null ? (int) $manual['at'] : 0;
        $at = max($man_at, $cleared_at);
        if ($manual !== null && $man_at >= $cleared_at) {
            return ['state' => !empty($manual['ready']) ? self::READY : self::NOT_READY, 'source' => 'manual', 'at' => $at];
        }
        if ($cleared_at > 0) {
            return ['state' => self::OCCUPIED, 'source' => 'manual', 'at' => $at];
        }
        return ['state' => self::NONE, 'source' => '', 'at' => $at];
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
     * showed: if the cottage's status has a newer tap, nothing is written
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
     * OCCUPIED, tapped (0.52.0; any cottage, any time since 0.58.0, Rob): the
     * check-in record. Stored as 0.52.0 stored it — the mark cleared, its
     * time in 'cleared' — and logged ([t, 2]). It stays until staff tap
     * another status. The same stale refusal as save(). Returns true, or null
     * when refused (stale).
     *
     * @throws \RuntimeException when the write did not stick
     */
    public static function clear(int $type_id, int $seen): ?bool
    {
        $current = self::state()[(string) $type_id] ?? null;
        if ($current === null || $current['at'] > $seen) {
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
