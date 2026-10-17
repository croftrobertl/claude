<?php
/**
 * MOTOPRESS'S OWN RULE ENGINE BEHIND mphb_availability_facade() (0.47.4).
 *
 * Require AFTER bootstrap.php and sqlite-wpdb.php, with $GLOBALS['wpdb'] an
 * T_SQLite_WPDB. Loads MotoPress 6.4.0's facade, BookingRulesData, DateUtils,
 * Season and the blocks / per-date rules repositories, unchanged, from
 * tests/vendor/motopress-6.4.0/ (see its README). What sits under them:
 *
 *   - rule OPTIONS (mphb_check_in_days, mphb_min_stay_length, …, as
 *     MotoPress stores them) in $GLOBALS['t_options'] via bootstrap's
 *     get_option();
 *   - SEASONS: t_mphb_season(id, from, to, weekdays);
 *   - rooms: read from the SQLite posts, as the plugin's own SQL reads them;
 *   - check-in / check-out times: 11:00 / 10:00 (MotoPress's defaults);
 *   - the iCal "sync with buffers" and "no rules for admins" switches.
 *
 * MotoPress builds its rules once per request (the facade keeps one
 * BookingRulesData); t_mphb_new_request() is the next request.
 */

if (!defined('ARRAY_A')) { define('ARRAY_A', 'ARRAY_A'); }
$GLOBALS['wp_version'] = '6.6';

if (!function_exists('add_action')) { function add_action($h, $cb, $p = 10, $a = 1) { $GLOBALS['t_hooks']['action'][$h][] = $cb; } }
if (!function_exists('wp_timezone')) { function wp_timezone() { return new \DateTimeZone('America/New_York'); } }
if (!function_exists('wp_timezone_string')) { function wp_timezone_string() { return 'America/New_York'; } }
if (!function_exists('mphb_array_add')) {
    function mphb_array_add(array &$array, $value): void { if (!in_array($value, $array)) { $array[] = $value; } }
    function mphb_array_remove(array &$array, $value): void { $i = array_search($value, $array); if ($i !== false) { unset($array[$i]); } }
}

$V = __DIR__ . '/vendor/motopress-6.4.0';
require_once __DIR__ . '/mphb-rules-harness-ns.php';
require_once $V . '/date-utils.php';
require_once $V . '/season.php';
require_once $V . '/abstract-core-api-facade.php';
require_once $V . '/booking-rules-data.php';
require_once $V . '/rooms-availability-core-api-facade.php';
require_once $V . '/blocks-repository.php';
require_once $V . '/custom-booking-rules-repository.php';

$GLOBALS['t_mphb'] = [
    'seasons'   => [],
    'sync_buf'  => false,
    'admin_off' => false,
    'facade'    => null,
    'calls'     => 0,       // facade method calls, for the performance budget
    'throw'     => null,    // a Throwable the facade throws on any call
];

function t_mphb_season(int $id, string $from, string $to, array $days = [0, 1, 2, 3, 4, 5, 6]): void
{
    $tz = wp_timezone();
    $GLOBALS['t_mphb']['seasons'][$id] = new \MPHB\Entities\Season([
        'id' => $id, 'title' => 'Season ' . $id, 'description' => '',
        'start_date' => new \DateTime($from, $tz), 'end_date' => new \DateTime($to, $tz),
        'days' => $days, 'repeat_period' => 'none',
    ]);
}
function t_mphb_new_request(): void { $GLOBALS['t_mphb']['facade'] = null; }

/** Counts every call, and can be made to fail, without touching MotoPress's code. */
final class T_Facade_Spy
{
    private $inner;
    public function __construct($inner) { $this->inner = $inner; }
    public function __call($m, $a)
    {
        $GLOBALS['t_mphb']['calls']++;
        if ($GLOBALS['t_mphb']['throw'] instanceof \Throwable) { throw $GLOBALS['t_mphb']['throw']; }
        return $this->inner->$m(...$a);
    }
}

function mphb_availability_facade()
{
    return $GLOBALS['t_mphb']['facade'] ??= new T_Facade_Spy(new \MPHB\Core\RoomsAvailabilityCoreAPIFacade());
}

final class T_MPHB_Rooms
{
    private function ids(int $type): array
    {
        global $wpdb;
        $sql = "SELECT p.ID FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = 'mphb_room_type_id'
                WHERE p.post_type = 'mphb_room' AND p.post_status = 'publish'" . ($type ? ' AND CAST(m.meta_value AS UNSIGNED) = ' . (int) $type : '');
        return array_map('intval', $wpdb->get_col($sql));
    }
    public function getAllRoomTypeOriginalIds(): array
    {
        return array_values(array_map('intval', array_keys(array_filter($GLOBALS['t_posts'], static fn($p) => $p->post_type === 'mphb_room_type' && $p->post_status === 'publish'))));
    }
    public function getTrashedRoomIds($t = 0): array { return []; }
    public function getTrashedRoomTypeIds(): array { return []; }
    public function getActiveRoomsCountForRoomType(int $t): int { return count($this->ids($t)); }
    public function findAllIdsByType($t): array { return $this->ids((int) $t); }
    public function getCount(): int { return count($this->ids(0)); }
}
function mphb_rooms_facade() { return new T_MPHB_Rooms(); }

final class T_MPHB
{
    public function settings() { return $this; }
    public function bookingRules() { return $this; }
    public function dateTime() { return $this; }
    public function main() { return $this; }
    public function getReservationRules()
    {
        return [
            'check_in_days'           => get_option('mphb_check_in_days', []),
            'check_out_days'          => get_option('mphb_check_out_days', []),
            'min_stay_length'         => get_option('mphb_min_stay_length', []),
            'max_stay_length'         => get_option('mphb_max_stay_length', []),
            'min_advance_reservation' => get_option('mphb_min_advance_reservation', []),
            'max_advance_reservation' => get_option('mphb_max_advance_reservation', []),
        ];
    }
    public function getBufferRules() { return get_option('mphb_buffer_days', []); }
    public function getCheckInTime($asArray = false) { return [11, 0, 0]; }
    public function getCheckOutTime($asArray = false) { return [10, 0, 0]; }
    public function getDateTransferFormat() { return 'Y-m-d'; }
    public function getDateFormat() { return 'm/d/Y'; }
    public function isSyncWithBuffers() { return (bool) $GLOBALS['t_mphb']['sync_buf']; }
    public function isBookingRulesForAdminDisabled() { return (bool) $GLOBALS['t_mphb']['admin_off']; }
    public function getSeasonRepository() { return new class { public function findAll() { return array_values($GLOBALS['t_mphb']['seasons']); } }; }
    public function getBlocksRepository() { return new \MPHB\Repositories\BlocksRepository(); }
    public function getCustomBookingRulesRepository() { return new \MPHB\Repositories\CustomBookingRulesRepository(); }
    public function getRoomPersistence() { return new T_MPHB_Rooms(); }
}
if (!function_exists('MPHB')) { function MPHB() { return new T_MPHB(); } }
