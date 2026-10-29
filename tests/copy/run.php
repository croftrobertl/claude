<?php
/**
 * Copy pins for DCC Custom Checkout.
 *
 *   php tests/copy/run.php
 *
 * The pull-out-couch sentence ships in TWO plugins — this one and the Cottage
 * Selector — and the owner requires them to match character for character.
 * Config::couch_note_text() is the single copy here; this pins its sha256 so
 * a drift in either plugin fails a test rather than being noticed by a guest.
 * The Cottage Selector pins the same hash. Change one, change both, change
 * both pins.
 */
define('ABSPATH', __DIR__);
if (!function_exists('__'))            { function __($t, $d = null) { return $t; } }
if (!function_exists('_n'))            { function _n($s, $p, $n, $d = null) { return $n == 1 ? $s : $p; } }
if (!function_exists('esc_html__'))    { function esc_html__($t, $d = null) { return $t; } }
if (!function_exists('apply_filters')) { function apply_filters($h, $v) { return $v; } }
if (!function_exists('get_option'))    { function get_option($k, $d = false) { return $d; } }
if (!function_exists('get_post'))      { function get_post($id) { return null; } }
if (!function_exists('get_post_meta')) { function get_post_meta($id, $k, $s = false) { return ''; } }
if (!function_exists('wp_parse_args')) { function wp_parse_args($a, $d = []) { return array_merge($d, (array) $a); } }

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';

use DCC_Checkout\Config;

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS' : 'FAIL') . "  $name\n";
    if (!$ok) { echo "      expected: " . var_export($expected, true) . "\n      actual:   " . var_export($actual, true) . "\n"; }
}

$text = Config::couch_note_text();
check('couch note: 138 bytes', strlen($text), 138);
check('couch note: 138 characters', mb_strlen($text, 'UTF-8'), 138);
check('couch note: hyphens are U+002D only', preg_match('/[\x{2010}-\x{2015}]/u', $text), 0);
check('couch note: no double spaces', strpos($text, '  '), false);
check('couch note: sha256 matches the Cottage Selector pin',
    hash('sha256', $text),
    '8a638fb2e266a645cbf93b300dec44113c0989a9531dbb5abb00bb55a420783f');

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
