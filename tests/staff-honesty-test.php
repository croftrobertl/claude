<?php
/**
 * OTA HONESTY — the panel must never present an imported booking's defaults
 * as facts.
 *
 * MPHB defaults an imported booking's occupancy to the cottage's MAXIMUM
 * capacity. Printing that would have staff greet a couple as a party of six.
 * So an imported booking with the default says so in words, and is marked
 * imported and muted so the UI can show it differently. A CONFIRMED count —
 * one a human set — overrides all of that, because then the number is real.
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

function scene(array $opts): array {
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = []; $GLOBALS['wpdb']->payment_rows = [];
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => $opts['capacity'] ?? 4]);
    t_post(220, 'mphb_room', 'publish', 'R', ['mphb_room_type_id' => 22]);
    t_post(300, 'mphb_booking', 'confirmed', 'B',
        ['mphb_total_price' => 0] + (isset($opts['prodid']) ? ['mphb_ical_prodid' => $opts['prodid']] : []) + ($opts['meta'] ?? []));
    t_post(301, 'mphb_reserved_room', 'publish', 'RR',
        ['_mphb_room_id' => 220, '_mphb_adults' => $opts['adults'] ?? 4]
        + (!empty($opts['confirmed']) ? ['_mphb_adults_confirmed' => 1] : []));
    $GLOBALS['t_posts'][301]->post_parent = 300;
    return Staff_Data::booking_detail(300);
}
function guests(array $d): ?array {
    foreach ($d['sections']['booking'] as $r) { if ($r['label'] === 'Number of Guests') { return $r; } }
    return null;
}

echo "-- an imported booking at capacity says so in words --\n";
{
    $d = scene(['prodid' => '-//Airbnb Inc//EN', 'adults' => 4, 'capacity' => 4]);
    $g = guests($d);
    check('the value names the channel rather than printing a number',
        str_contains($g['value'], 'not provided') && str_contains($g['value'], 'Airbnb'), $g['value'] ?? null);
    check('NO DIGIT appears in it — a number is exactly what must not be shown',
        !preg_match('/\d/', $g['value']), $g['value']);
    check('it is flagged muted, so the UI can render it as an absence',
        !empty($g['muted']), $g);
    check('and the booking itself is marked imported, with the source attached',
        $d['imported'] === true && ($d['source']['ota'] ?? '') === 'Airbnb', $d['source'] ?? null);
}

echo "\n-- a DIRECT booking is not muted and gets its real number --\n";
{
    $d = scene(['adults' => 2, 'capacity' => 4]);
    $g = guests($d);
    check('the count is printed', $g['value'] === '2', $g['value'] ?? null);
    check('DIRECT: not muted', empty($g['muted']), $g);
    check('imported is false', $d['imported'] === false);
}

echo "\n-- the default is identified by BOTH halves, not one --\n";
{
    $a = guests(scene(['prodid' => '-//Airbnb Inc//EN', 'adults' => 2, 'capacity' => 4]));
    check('imported and NOT at capacity is STILL not a count unless confirmed (0.45.2): not provided',
        str_contains($a['value'] ?? '', 'not provided') && !empty($a['muted']), $a);
    $b = guests(scene(['adults' => 4, 'capacity' => 4]));
    check('at capacity but NOT imported is also shown — either half alone proves nothing',
        $b['value'] === '4', $b['value'] ?? null);
}

echo "\n-- a human-confirmed count beats all of it --\n";
{
    $g = guests(scene(['prodid' => '-//Booking.com//EN', 'adults' => 4, 'capacity' => 4, 'confirmed' => true]));
    check('imported, at capacity, but CONFIRMED: the number is shown',
        $g['value'] === '4', $g['value'] ?? null);
    check('...and it is not muted, because it is no longer an absence', empty($g['muted']), $g);
}

echo "\n-- 0.45.2: an UNCONFIRMED imported count is never a real count, whatever the number --\n";
{
    // The Website Director's matrix: imports at 2 and at 4 in a 4-sleeper,
    // at 2 in a 2-sleeper, each without and with the staff marker.
    foreach ([[2, 4], [4, 4], [2, 2]] as [$n, $cap]) {
        $g = guests(scene(['prodid' => '-//Airbnb Inc//EN', 'adults' => $n, 'capacity' => $cap]));
        check("import, $n in a $cap-sleeper, unconfirmed: \"count not provided by Airbnb\", muted",
            ($g['value'] ?? '') === 'count not provided by Airbnb' && !empty($g['muted']), $g);
        $g = guests(scene(['prodid' => '-//Airbnb Inc//EN', 'adults' => $n, 'capacity' => $cap, 'confirmed' => true]));
        check("import, $n in a $cap-sleeper, CONFIRMED: $n", ($g['value'] ?? '') === (string) $n && empty($g['muted']), $g);
    }
    foreach ([[2, 4], [4, 4], [2, 2]] as [$n, $cap]) {
        $g = guests(scene(['adults' => $n, 'capacity' => $cap]));
        check("a DIRECT booking, $n in a $cap-sleeper: unchanged, $n", ($g['value'] ?? '') === (string) $n && empty($g['muted']), $g);
    }
}

echo "\n-- 0.45.3: a dog recorded by staff, and nothing else said: a \"Dog: Yes\" row --\n";
{
    $row = static function (array $d, string $label) {
        foreach ($d['sections'] as $rows) { foreach ((array) $rows as $r) { if (($r['label'] ?? '') === $label) { return $r['value']; } } }
        return null;
    };
    $d = scene(['prodid' => '-//Airbnb Inc//EN', 'adults' => 2, 'meta' => ['_dcc_dog' => 'yes']]);
    check("an import with _dcc_dog 'yes', no dog details: the sheet says Dog: Yes (why the paw is there)", $row($d, 'Dog') === 'Yes', $row($d, 'Dog'));
    $d = scene(['prodid' => '-//Airbnb Inc//EN', 'adults' => 2, 'meta' => ['_dcc_dog' => 'no']]);
    check("'no': no Dog row", $row($d, 'Dog') === null, $row($d, 'Dog'));
    $d = scene(['prodid' => '-//Airbnb Inc//EN', 'adults' => 2]);
    check("absent: no Dog row", $row($d, 'Dog') === null, $row($d, 'Dog'));
    $d = scene(['adults' => 2, 'meta' => ['_dcc_dog' => 'yes', 'mphb_dog_type' => 'Beagle']]);
    check("a dog type filled in as well: the dog details show instead, no extra Dog row", $row($d, 'Dog Type') === 'Beagle' && $row($d, 'Dog') === null, [$row($d, 'Dog Type'), $row($d, 'Dog')]);
}

echo "\n-- with no capacity configured, nothing is claimed --\n";
{
    $g = guests(scene(['prodid' => '-//Airbnb Inc//EN', 'adults' => 4, 'capacity' => 0]));
    check('an unconfigured capacity falls back to NOT trusting an imported count',
        str_contains($g['value'], 'not provided'), $g['value'] ?? null);
}

echo "\n-- the client is told, so it can render the banner --\n";
{
    $js = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/assets/js/staff.js');
    // 0.44.1: the letter badge is gone (Rob — the bar's colour is the
    // source); the sheet's banner and the source BY NAME remain.
    check('the imported flag drives a visible banner, and the source is named, not just coloured',
        str_contains($js, 'mphbac-staff-imported') && str_contains($js, 'function sourceName'));
    $w = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-staff-widget.php');
    check('the explanation is a translatable string, not baked into the script',
        str_contains($w, 'importedTip'));
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
