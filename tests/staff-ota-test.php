<?php
/**
 * OTA detection — source_for() and the PRODID mapping.
 *
 * This decides whether the panel says "count not provided by Booking.com" or
 * prints a number, so a wrong answer here is a wrong fact at the door.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
// Settings is required by the classes below since 0.40.0 (Cache::ttl(),
// Staff::page_id(), the Ajax clamps, the widgets' control defaults). In
// production the plugin's autoloader supplies it on demand; these harnesses
// require their classes explicitly, so it has to be named here. Left out, the
// suite FATALS rather than failing — which mutate.php reports as NO RUN, and
// which is how this was caught before it shipped.
require $ROOT . '/includes/class-settings.php';
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-staff-data.php';

use MPHBAC\Staff_Data;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

function booking_with(array $meta, array $rrMeta = null): array {
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = [];
    t_post(500, 'mphb_booking', 'confirmed', 'B', $meta);
    if ($rrMeta !== null) {
        t_post(501, 'mphb_reserved_room', 'publish', 'RR', $rrMeta);
        $GLOBALS['t_posts'][501]->post_parent = 500;
    }
    return Staff_Data::source_for(500);
}

echo "-- the three channels this property actually uses --\n";
foreach ([
    ['-//Airbnb Inc//Hosting Calendar 1.0.0//EN', 'Airbnb'],
    ['-//Booking.com//Bookings Calendar//EN',     'Booking.com'],
    ['-//Vrbo//Calendar//EN',                     'Vrbo'],
    ['-//HomeAway//Calendar//EN',                 'Vrbo'],
    ['-//Expedia//Calendar//EN',                  'Vrbo'],
] as [$prodid, $name]) {
    $s = booking_with(['mphb_ical_prodid' => $prodid]);
    check("\"$prodid\" -> $name", $s['imported'] === true && $s['ota'] === $name, $s['ota']);
}
check('an unrecognised PRODID is still IMPORTED, with an honest generic name',
    (function () { $s = booking_with(['mphb_ical_prodid' => '-//Someone Else//EN']);
        return $s['imported'] === true && $s['ota'] !== '' && !in_array($s['ota'], ['Airbnb', 'Booking.com', 'Vrbo'], true); })(),
    booking_with(['mphb_ical_prodid' => '-//Someone Else//EN'])['ota']);

echo "\n-- a direct booking is NOT imported --\n";
{
    $s = booking_with([]);
    check('no PRODID anywhere means imported=false and an empty OTA name',
        $s['imported'] === false && $s['ota'] === '' && $s['prodid'] === '', $s);
}

echo "\n-- the marker is sometimes on the RESERVED ROOM, not the booking --\n";
{
    $s = booking_with([], ['mphb_ical_prodid' => '-//Airbnb Inc//EN']);
    check('a PRODID on the reserved room is found',
        $s['imported'] === true && $s['ota'] === 'Airbnb', $s);
}
{
    // month_view() passes ids it already has; the detail path looks them up.
    // Passing an explicit list must skip the lookup entirely.
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = [];
    t_post(600, 'mphb_booking', 'confirmed', 'B', []);
    t_post(601, 'mphb_reserved_room', 'publish', 'RR', ['mphb_ical_prodid' => '-//Booking.com//EN']);
    $GLOBALS['t_posts'][601]->post_parent = 600;
    t_reset();
    $s = Staff_Data::source_for(600, [601]);
    $lookups = count(array_filter($GLOBALS['t_queries'], static fn($t) => $t === 'mphb_reserved_room'));
    check('given the ids, it issues NO reserved-room query of its own',
        $s['ota'] === 'Booking.com' && $lookups === 0, ['ota' => $s['ota'], 'queries' => $GLOBALS['t_queries']]);
    t_reset();
    Staff_Data::source_for(600);
    $lookups2 = count(array_filter($GLOBALS['t_queries'], static fn($t) => $t === 'mphb_reserved_room'));
    check('...and WITHOUT them it does exactly one, so the parameter is load-bearing',
        $lookups2 === 1, $GLOBALS['t_queries']);
}

echo "\n-- uid and summary ride along, but only when imported --\n";
{
    $s = booking_with(['mphb_ical_prodid' => '-//Airbnb Inc//EN',
                       'mphb_ical_uid' => 'abc-123', 'mphb_ical_summary' => 'Reserved']);
    check('uid and summary are carried through', $s['uid'] === 'abc-123' && $s['summary'] === 'Reserved', $s);
    $d = booking_with(['mphb_ical_uid' => 'abc-123']);
    check('a uid with no PRODID does not make a booking imported',
        $d['imported'] === false && $d['uid'] === '', $d);
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
