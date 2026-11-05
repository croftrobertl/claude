<?php
/**
 * DCC Guest Guide — the cottage coordinates (v0.27.8).
 *
 * The packaged default was 28.8028 / -81.6448, which is near MOUNT DORA,
 * 5.61 miles east of the property (computed below, and it agrees with the
 * Website Director's "~5.5 mi"). The real point is 224 S Lake Ave, Tavares:
 * 28.8005 / -81.7374, corroborated against OpenStreetMap — the marked point
 * sits just west of South Lake Avenue by the Dora Canal.
 *
 * It is not cosmetic. The pair feeds the Conditions card's sunrise and
 * sunset (date_sun_info, server-side) and the Open-Meteo lookup the browser
 * makes for "Tavares Now", so the old value asked for the wrong town's
 * weather.
 *
 * THE SECOND HALF OF THIS SUITE IS THE POINT. Changing a packaged default
 * does NOT change a page that already stores its own value — the same trap
 * as reveal_memory_hours. Scenario B proves a stored value still wins, so
 * the Director knows that shipping this alone may fix nothing on 4645 or
 * 17685 and what to check.
 *
 *   php tests/coordinates.test.php
 *   DCCGG_PLUGIN_DIR=… php tests/coordinates.test.php   (mutation runs)
 */
define('ABSPATH', '/tmp/');
define('DCCGG_VERSION', 'test');
$GLOBALS['PLUGIN'] = $PLUGIN = rtrim(getenv('DCCGG_PLUGIN_DIR') ?: __DIR__ . '/../dcc-guest-guide', '/') . '/';

$pass = 0; $fail = 0; $failures = [];
function check($name, $cond, $detail = '') {
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $fail++; $failures[] = $name . ($detail ? " — $detail" : ''); echo "  ✗ $name" . ($detail ? " — $detail" : '') . "\n"; }
}

const TAVARES_LAT = 28.8005;
const TAVARES_LNG = -81.7374;
const MT_DORA_LAT = 28.8028;
const MT_DORA_LNG = -81.6448;

$src = file_get_contents($PLUGIN . 'includes/class-widget.php');

echo "\nA. Every packaged default is the Tavares point\n";
// Read the SOURCE rather than instantiating the widget: the control
// defaults and the two `??` fallbacks are three separate places, and a fix
// applied to one of them is the failure this guards against.
preg_match_all('/\?\?\s*(-?\d+\.\d+)\s*\)/', $src, $fallbacks);
$nums = array_map('floatval', $fallbacks[1]);
check('both control defaults are present',
    strpos($src, "'default'     => " . TAVARES_LAT) !== false
    && strpos($src, "'default' => " . TAVARES_LNG) !== false);
check('the latitude fallback appears twice (data-config and render)',
    count(array_keys($nums, TAVARES_LAT)) === 2, json_encode($nums));
check('the longitude fallback appears twice',
    count(array_keys($nums, TAVARES_LNG)) === 2, json_encode($nums));
check('no Mount Dora latitude survives as a default or fallback',
    !preg_match('/(?:default\'\s*=>|\?\?)\s*' . preg_quote((string) MT_DORA_LAT, '/') . '/', $src));
check('no Mount Dora longitude survives as a default or fallback',
    !preg_match('/(?:default\'\s*=>|\?\?)\s*' . preg_quote((string) MT_DORA_LNG, '/') . '/', $src));
check('the control no longer tells the host the default is Mt Dora',
    strpos($src, 'Default is Mt Dora') === false);

echo "\nB. A STORED value still wins — which is why shipping this may fix nothing\n";
// This is the behaviour, not a wish: every consumer reads $s['cottage_*']
// first and only falls back to the packaged number when the key is absent.
$stored  = ['cottage_latitude' => MT_DORA_LAT, 'cottage_longitude' => MT_DORA_LNG];
$empty   = [];
$resolve = static fn(array $s, string $k, float $d) => (float) ($s[$k] ?? $d);
check('with nothing stored, the new default is used',
    $resolve($empty, 'cottage_latitude', TAVARES_LAT) === TAVARES_LAT);
check('with the OLD value stored, the old value is still used',
    $resolve($stored, 'cottage_latitude', TAVARES_LAT) === MT_DORA_LAT,
    'pages 4645 / 17685 must be checked in the editor');
check('the same holds for longitude',
    $resolve($stored, 'cottage_longitude', TAVARES_LNG) === MT_DORA_LNG);

echo "\nC. The two points really are ~5.5 miles apart\n";
$hav = static function (float $la1, float $lo1, float $la2, float $lo2): float {
    $R = 3958.8;
    $p1 = deg2rad($la1); $p2 = deg2rad($la2);
    $dp = $p2 - $p1; $dl = deg2rad($lo2 - $lo1);
    $a = sin($dp / 2) ** 2 + cos($p1) * cos($p2) * sin($dl / 2) ** 2;
    return 2 * $R * asin(sqrt($a));
};
$miles = $hav(MT_DORA_LAT, MT_DORA_LNG, TAVARES_LAT, TAVARES_LNG);
check('the correction moves the point 5.5-5.7 miles',
    $miles > 5.4 && $miles < 5.8, sprintf('%.2f miles', $miles));
check('and it moves WEST', TAVARES_LNG < MT_DORA_LNG);

echo "\nD. The new point is inside Tavares, not a transposition or a typo\n";
// Cheap sanity bounds rather than a geocoder: a digit slip in either value
// lands far outside these, and this suite must not need the network.
check('latitude is within Lake County\'s band', TAVARES_LAT > 28.7 && TAVARES_LAT < 28.9,
    (string) TAVARES_LAT);
check('longitude is within Lake County\'s band', TAVARES_LNG < -81.6 && TAVARES_LNG > -81.9,
    (string) TAVARES_LNG);
check('latitude and longitude have not been swapped',
    abs(TAVARES_LAT) < abs(TAVARES_LNG));

echo "\n";
if ($fail) {
    echo "FAILED ($fail):\n";
    foreach ($failures as $f) { echo "  - $f\n"; }
}
echo ($fail ? "✗" : "✓") . " coordinates: $pass passed, $fail failed\n";
exit($fail ? 1 : 0);
