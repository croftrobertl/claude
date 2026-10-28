<?php
/**
 * DCC Seasons — 4.13.2, the staging check link (the Director's ask):
 * ?dcc_key=<key> opens the PREVIEW (?dcc_season=) and ?dcc_scene=now to a
 * browser that is not logged in, and nothing else; without the key, or with
 * a wrong one, a visitor gets the normal page; a page opened with the key
 * is never cached; the booking exclusions still win.
 *
 * Drives the REAL Plugin methods on the shared fake WordPress.
 *
 *   php tools/test-check-key.php
 *
 * @package DCC_Seasons
 */

require_once __DIR__ . '/scope-stubs.php';

use DCC_Seasons\Plugin;
use DCC_Seasons\Settings;

$GLOBALS['ADMIN'] = false;
$GLOBALS['NOCACHE'] = 0;
function current_user_can($c) { return (bool) $GLOBALS['ADMIN']; }
function nocache_headers() { $GLOBALS['NOCACHE']++; }
function wp_generate_password($n = 12, $s = true, $x = false) { return substr(str_repeat(bin2hex(random_bytes(16)), 2), 0, $n); }
function add_query_arg($k, $v = null, $u = null) { return (string) $u; }
function home_url($p = '') { return 'https://doracanalcourt.com' . $p; }
function admin_url($p = '') { return 'https://doracanalcourt.com/wp-admin/' . $p; }
function wp_create_nonce($a = -1) { return 'n'; }
function is_user_logged_in() { return (bool) $GLOBALS['ADMIN']; }
function current_time($f) { return date($f); }
function get_locale() { return 'en_US'; }
if (!defined('DCC_SEASONS_URL')) { define('DCC_SEASONS_URL', 'https://doracanalcourt.com/wp-content/plugins/dcc-seasons/'); }
if (!defined('DCC_SEASONS_VERSION')) { define('DCC_SEASONS_VERSION', 'test'); }

$pass = 0; $fail = 0; $problems = [];
function ok(bool $c, string $label, string $detail = ''): void {
    global $pass, $fail, $problems;
    if ($c) { $pass++; echo "  PASS  $label\n"; }
    else { $fail++; $problems[] = $label . ($detail ? " — $detail" : ''); echo "  FAIL  $label" . ($detail ? " — $detail" : '') . "\n"; }
}
/** One request: the page kind, the query, admin or not. */
function req(array $page, array $get, bool $admin = false): array {
    $GLOBALS['REQ'] = array_merge(['front' => false, 'page' => false, 'cottage' => false, 'id' => 0, 'slug' => '', 'path' => '/'], $page);
    $_GET = $get; $GLOBALS['ADMIN'] = $admin; $GLOBALS['NOCACHE'] = 0;
    $_SERVER['REQUEST_URI'] = $GLOBALS['REQ']['path'];
    $GLOBALS['OPTIONS'][Settings::OPTION] = array_merge(Settings::defaults(), ['scope' => 'home', 'placement' => 'content', 'layering' => 'front']);
    $ref = new \ReflectionClass(Plugin::class);
    $inst = $ref->newInstanceWithoutConstructor();
    $call = function (string $name, ...$a) use ($ref, $inst) { $m = $ref->getMethod($name); $m->setAccessible(true); return $m->invoke($inst, ...$a); };
    $load = (bool) $call('should_load');
    $cfg = $call('config', array_merge(Settings::defaults(), ['scope' => 'home']));
    $inst->no_cache_for_checks();
    return ['load' => $load, 'now' => !empty($cfg['sceneNow']), 'preview' => $cfg['preview'], 'nocache' => $GLOBALS['NOCACHE'] > 0];
}
$HOME = ['front' => true, 'path' => '/'];
$CONTACT = ['page' => true, 'id' => 12, 'slug' => 'contact', 'path' => '/contact/'];
$SUBMIT = ['page' => true, 'id' => 1399, 'slug' => 'submit-booking', 'path' => '/submit-booking/'];

echo "=== no key on the site yet: nothing opens ===\n";
unset($GLOBALS['OPTIONS'][Plugin::CHECK_KEY_OPTION]);
$r = req($HOME, ['dcc_key' => '', 'dcc_scene' => 'now', 'dcc_season' => 'thanksgiving']);
ok(!$r['now'] && $r['preview'] === null && !$r['nocache'], 'an empty key matches no key: normal page', json_encode($r));
ok(Plugin::check_key() === '' && !isset($GLOBALS['OPTIONS'][Plugin::CHECK_KEY_OPTION]), 'and the front end never creates one');

echo "\n=== the settings page creates one key, once ===\n";
$k = Plugin::check_key(true);
ok(strlen($k) === 20 && Plugin::check_key(true) === $k && Plugin::check_key() === $k, 'a 20-character key, stable once made', $k);

echo "\n=== with the key ===\n";
$r = req($HOME, ['dcc_key' => $k, 'dcc_scene' => 'now', 'dcc_season' => 'thanksgiving']);
ok($r['load'] && $r['now'] && $r['preview'] === 'thanksgiving', 'the scene plays now, in the previewed theme, not logged in', json_encode($r));
ok($r['nocache'], 'and the page is sent no-cache (nocache_headers)', json_encode($r));
$r = req($CONTACT, ['dcc_key' => $k, 'dcc_scene' => 'now', 'dcc_season' => 'thanksgiving']);
ok($r['load'] && $r['now'], 'it opens a page outside the scope too, as the admin preview does', json_encode($r));
$r = req($HOME, ['dcc_key' => $k]);
ok(!$r['now'] && $r['preview'] === null && $r['nocache'], 'the key alone forces nothing (but is still never cached)', json_encode($r));
$r = req($SUBMIT, ['dcc_key' => $k, 'dcc_scene' => 'now', 'dcc_season' => 'thanksgiving']);
ok(!$r['load'], '/submit-booking/ stays silent even with the key: the exclusions still win', json_encode($r));

echo "\n=== without it, or with a wrong one: the normal page ===\n";
foreach ([['no key', []], ['wrong key', ['dcc_key' => strrev($k)]], ['key one character short', ['dcc_key' => substr($k, 0, -1)]], ['key with a character added', ['dcc_key' => $k . 'x']]] as [$what, $extra]) {
    $r = req($HOME, $extra + ['dcc_scene' => 'now', 'dcc_season' => 'thanksgiving']);
    ok(!$r['now'] && $r['preview'] === null && !$r['nocache'], "$what: no scene, no preview, cacheable as usual", json_encode($r));
}
$r = req($CONTACT, ['dcc_key' => 'nope', 'dcc_scene' => 'now']);
ok(!$r['load'], 'a wrong key does not open a page outside the scope', json_encode($r));
$r = req($HOME, ['dcc_scene' => 'later', 'dcc_key' => $k]);
ok(!$r['now'], 'only dcc_scene=now means now', json_encode($r));

echo "\n=== an administrator needs no key ===\n";
$r = req($HOME, ['dcc_scene' => 'now'], true);
ok($r['now'] && !$r['nocache'], 'an admin gets the scene now (logged-in pages are not cached anyway)', json_encode($r));

echo "\n=== a key too short to trust is refused ===\n";
$GLOBALS['OPTIONS'][Plugin::CHECK_KEY_OPTION] = 'short';
$r = req($HOME, ['dcc_key' => 'short', 'dcc_scene' => 'now']);
ok(!$r['now'] && !$r['nocache'], 'a stored key under 12 characters opens nothing', json_encode($r));
$GLOBALS['OPTIONS'][Plugin::CHECK_KEY_OPTION] = $k;

echo "\n=== a DCC_SEASONS_CHECK_KEY constant overrides the stored key ===\n";
define('DCC_SEASONS_CHECK_KEY', 'constant-key-0123456789');
$r = req($HOME, ['dcc_key' => 'constant-key-0123456789', 'dcc_scene' => 'now']);
$r2 = req($HOME, ['dcc_key' => $k, 'dcc_scene' => 'now']);
ok($r['now'] && !$r2['now'], 'the constant opens it and the stored key no longer does', json_encode([$r, $r2]));
ok(defined('DONOTCACHEPAGE'), 'DONOTCACHEPAGE was set for the page caches (SpeedyCache, Endurance)');

echo "\n$pass passed · $fail failed\n";
if ($fail) { foreach ($problems as $p) { echo "  - $p\n"; } exit(1); }
