<?php
/**
 * DCC Seasons — which pages get decorated, and which never do.
 *
 * The scope matrix decides which KINDS of page may be decorated. The
 * exclusions decide which pages are never decorated whatever the scope
 * says. Before 4.1.0 only the checkout page itself was excluded, so the
 * 'no_cottages' tier — "front page plus every `page` post type" — silently
 * covered the whole booking and payment flow, plus the internal staff
 * board.
 *
 * This drives Plugin::should_load() with a fake WordPress underneath it, so
 * the real branching runs. It is not a substitute for checking the served
 * HTML of a cached anonymous page, which is the only thing that proves what
 * a visitor gets; it is the fast check that catches a regression before it
 * reaches the site.
 *
 * Usage: php tools/test-scope.php
 *
 * @package DCC_Seasons
 */

require_once __DIR__ . '/scope-stubs.php';

use DCC_Seasons\Plugin;
use DCC_Seasons\Settings;

$pass = 0;
$fail = 0;
$problems = [];

function ok(bool $cond, string $label, string $detail = ''): void {
    global $pass, $fail, $problems;
    if ($cond) { $pass++; echo "  PASS  $label\n"; }
    else { $fail++; $problems[] = $label . ($detail ? " — $detail" : ''); echo "  FAIL  $label" . ($detail ? " — $detail" : '') . "\n"; }
}

/** Ask the real should_load() for one request shape. */
function loads(array $req, array $opt = []): bool {
    $GLOBALS['REQ'] = array_merge(
        ['front' => false, 'page' => false, 'cottage' => false, 'id' => 0, 'slug' => '', 'path' => '/'],
        $req
    );
    $GLOBALS['OPTIONS'][Settings::OPTION] = array_merge(Settings::defaults(), $opt);
    $_SERVER['REQUEST_URI'] = $GLOBALS['REQ']['path'];
    $ref = new \ReflectionClass(Plugin::class);
    $m = $ref->getMethod('should_load');
    $m->setAccessible(true);
    $inst = $ref->newInstanceWithoutConstructor();
    return (bool) $m->invoke($inst);
}

/* The live configuration, which is what this must be judged against. */
$LIVE = ['scope' => 'no_cottages', 'placement' => 'content', 'layering' => 'front'];

echo "=== LIVE CONFIG: scope=no_cottages — pages that MUST be decorated ===\n";
ok(loads(['front' => true, 'path' => '/'], $LIVE), 'home');
ok(loads(['page' => true, 'id' => 12, 'slug' => 'contact', 'path' => '/contact/'], $LIVE), '/contact/');
ok(loads(['page' => true, 'id' => 13, 'slug' => 'cottages', 'path' => '/cottages/'], $LIVE), '/cottages/ (the listing page)');

echo "\n=== the booking flow — MUST NOT be decorated, in EVERY scope ===\n";
$flow = [
    [2393, 'checkout', '/checkout/', 'Checkout'],
    [2442, 'payment-request', '/payment-request/', 'Payment Request'],
    [1399, 'submit-booking', '/submit-booking/', 'Submit Booking'],
    [2580, 'cottage-cart', '/cottage-cart/', 'Cottage Cart'],
    [624, 'confirm-your-booking', '/confirm-your-booking/', 'Confirm Your Booking'],
    [625, 'booking-confirmed', '/booking-confirmed/', 'Booking Confirmed'],
    [626, 'booking-cancelled', '/booking-cancelled/', 'Booking Cancelled'],
    [627, 'booking-submitted', '/booking-submitted/', 'Booking Submitted'],
    [623, 'cancel-booking', '/cancel-booking/', 'Cancel Booking'],
];
foreach (['home', 'no_cottages', 'pages', 'not_home', 'all'] as $scope) {
    $bad = [];
    foreach ($flow as [$id, $slug, $path, $name]) {
        if (loads(['page' => true, 'id' => $id, 'slug' => $slug, 'path' => $path], ['scope' => $scope])) {
            $bad[] = $name;
        }
    }
    ok($bad === [], "scope=$scope leaves the whole booking flow alone", implode(', ', $bad));
}

echo "\n=== matched by ID alone, when the slug has been renamed ===\n";
ok(!loads(['page' => true, 'id' => 2393, 'slug' => 'totally-renamed', 'path' => '/totally-renamed/'], $LIVE),
    'checkout stays excluded after a slug rename (ID fallback)');
echo "=== matched by SLUG alone, when the page has been rebuilt with a new ID ===\n";
ok(!loads(['page' => true, 'id' => 99999, 'slug' => 'checkout', 'path' => '/checkout/'], $LIVE),
    'checkout stays excluded after an ID change (slug fallback)');

echo "\n=== the Guest Guide and the staff board ===\n";
ok(!loads(['page' => true, 'id' => 4645, 'slug' => 'guest', 'path' => '/guest/'], $LIVE), '/guest/ is not decorated');
ok(loads(['page' => true, 'id' => 4645, 'slug' => 'guest', 'path' => '/guest/'], $LIVE + ['guide_effects' => 1]),
    '/guest/ CAN be re-enabled from settings, without code');
ok(!loads(['page' => true, 'id' => 18102, 'slug' => 'staff', 'path' => '/staff/'], $LIVE), '/staff/ is not decorated');
ok(!loads(['page' => true, 'id' => 18103, 'slug' => 'rota', 'path' => '/staff/rota/'], $LIVE),
    'anything BENEATH /staff/ is not decorated either');

echo "\n=== excluded page IDs (the Wildlife hub, and the field itself) ===\n";
ok(!loads(['page' => true, 'id' => 18119, 'slug' => 'explore', 'path' => '/explore/'], $LIVE),
    '/explore/ (page 18119) is not decorated');
ok(!loads(['page' => true, 'id' => 18119, 'slug' => 'renamed-hub', 'path' => '/renamed-hub/'], $LIVE),
    'it stays excluded after a slug rename — an ID does not move');
ok(loads(['page' => true, 'id' => 18120, 'slug' => 'explorer', 'path' => '/explorer/'], $LIVE),
    'a DIFFERENT page with a similar slug is still decorated');
ok(!loads(['page' => true, 'id' => 4242, 'slug' => 'anything', 'path' => '/anything/'],
        $LIVE + ['exclude_ids' => '4242, 9999']),
    'the field takes more IDs without a release');
ok(loads(['page' => true, 'id' => 18119, 'slug' => 'explore', 'path' => '/explore/'],
        $LIVE + ['exclude_ids' => '']),
    'clearing the field re-enables the page');

/* ---- The whole matrix, every tier x every kind of request (4.11.0,
 * when 'not_home' made the tiers no longer nested: a column, not an
 * order). 'post' here stands for a blog post or any other post type:
 * not the front page, not a `page`, not a cottage. ---- */
echo "\n=== the scope matrix: every tier x every kind of page ===\n";
$kinds = [
    'front page'        => ['front' => true, 'path' => '/'],
    '`page` post type'  => ['page' => true, 'id' => 12, 'slug' => 'contact', 'path' => '/contact/'],
    'cottage page'      => ['cottage' => true, 'path' => '/accommodation/cottage-34/'],
    'post / other CPT'  => ['path' => '/2026/10/a-post/'],
    'archive or search' => ['path' => '/?s=canal'],
];
$MATRIX = [
    'home'        => ['front page' => true,  '`page` post type' => false, 'cottage page' => false, 'post / other CPT' => false, 'archive or search' => false],
    'no_cottages' => ['front page' => true,  '`page` post type' => true,  'cottage page' => false, 'post / other CPT' => false, 'archive or search' => false],
    'pages'       => ['front page' => true,  '`page` post type' => true,  'cottage page' => true,  'post / other CPT' => false, 'archive or search' => false],
    'not_home'    => ['front page' => false, '`page` post type' => true,  'cottage page' => true,  'post / other CPT' => false, 'archive or search' => false],
    'all'         => ['front page' => true,  '`page` post type' => true,  'cottage page' => true,  'post / other CPT' => true,  'archive or search' => true],
];
foreach ($MATRIX as $scope => $row) {
    foreach ($row as $kind => $want) {
        $got = loads($kinds[$kind], ['scope' => $scope]);
        ok($got === $want, sprintf('scope=%-11s %-17s %s', $scope, $kind, $want ? 'decorated' : 'left alone'),
            $got ? 'loaded' : 'did not load');
    }
    /* every tier leaves the booking flow alone: checked above for all of
     * them; here the one page Rob names most often, for the row's sake */
    ok(!loads(['page' => true, 'id' => 2393, 'slug' => 'checkout', 'path' => '/checkout/'], ['scope' => $scope]),
        sprintf('scope=%-11s %-17s left alone', $scope, 'checkout'));
}

/* Rob's reason for not_home (4.11.0): Seasons on the homepage, the Hero
 * Effects everywhere else, never both on one page. */
echo "\n=== not_home is 'All pages' minus the homepage ===\n";
ok(!loads(['front' => true, 'path' => '/'], ['scope' => 'not_home']), 'the homepage is left alone');
ok(loads(['page' => true, 'id' => 13, 'slug' => 'cottages', 'path' => '/cottages/'], ['scope' => 'not_home']), 'an ordinary page is decorated');
ok(loads(['cottage' => true, 'path' => '/accommodation/cottage-34/'], ['scope' => 'not_home']), 'a cottage page is decorated');
ok(!loads(['path' => '/2026/10/a-post/'], ['scope' => 'not_home']), 'a post is not');
ok(!loads(['path' => '/?s=canal'], ['scope' => 'not_home']), 'a search page is not');
ok(!loads(['page' => true, 'id' => 2393, 'slug' => 'checkout', 'path' => '/checkout/'], ['scope' => 'not_home']), 'the checkout is not');
ok(!loads(['page' => true, 'id' => 18102, 'slug' => 'staff', 'path' => '/staff/'], ['scope' => 'not_home']), 'the staff board is not');
/* the same contract as every other tier: the filter can still speak */
$GLOBALS['FILTERS']['dcc_seasons_in_scope'] = function ($in, $scope) { return $scope === 'not_home' ? true : $in; };
ok(loads(['front' => true, 'path' => '/'], ['scope' => 'not_home']), 'the dcc_seasons_in_scope filter can still re-enable the homepage');
unset($GLOBALS['FILTERS']['dcc_seasons_in_scope']);
ok(!loads(['front' => true, 'path' => '/'], ['scope' => 'not_home']), 'and removing it puts it back');

/* The option is a CHOICE, never written for the owner: Rob's rule that his
 * site settings live in plugin defaults, so a default change reaches the
 * site. The packaged default stays 'all'. */
echo "\n=== not_home is never written by the plugin ===\n";
ok(Settings::defaults()['scope'] === 'all', "the packaged default is still 'all'", (string) Settings::defaults()['scope']);
/* Scanned as CODE, comments stripped, as the parent-menu check below is:
 * exactly ONE place may write the scope key — sanitize(), which stores
 * what the owner picked in the form. An activation or upgrade hook that
 * wrote 'not_home' for them would freeze it on the site. */
$writes = [];
foreach (glob(__DIR__ . '/../dcc-seasons/**/*.php') + glob(__DIR__ . '/../dcc-seasons/*.php') as $f) {
    $code = '';
    foreach (token_get_all(file_get_contents($f)) as $tok) {
        $code .= is_array($tok) ? (in_array($tok[0], [T_COMMENT, T_DOC_COMMENT], true) ? ' ' : $tok[1]) : $tok;
    }
    if (preg_match_all("/\\[\s*'scope'\s*\]\s*=(?!=)/", $code, $m)) {
        foreach ($m[0] as $hit) { $writes[] = basename($f); }
    }
}
ok(count($writes) === 1 && $writes[0] === 'class-settings.php',
    'exactly one place writes the scope option (sanitize), and no hook does',
    implode(', ', $writes) ?: 'none');

echo "\n=== cottage pages still follow the scope tier ===\n";
ok(!loads(['cottage' => true, 'path' => '/accommodation/cottage-34/'], $LIVE), 'cottage page absent under no_cottages');
ok(loads(['cottage' => true, 'path' => '/accommodation/cottage-34/'], ['scope' => 'all']), 'cottage page present under all');

echo "\n=== the booking exclusion is a SETTING, not a hardcode ===\n";
ok(loads(['page' => true, 'id' => 2393, 'slug' => 'checkout', 'path' => '/checkout/'],
        $LIVE + ['exclude_booking' => 0]),
    'unticking "Never decorate booking pages" really does re-enable them');

/* ---- The admin parent menu is owned by dcc-menu.php, not by us. ----
 * Scanned as CODE, with comments and docblocks stripped first: a grep that
 * counts a mention inside a comment would pass on a file that still calls
 * the function, and fail on a file that only explains why it does not. */
echo "\n=== the plugin does not register the shared parent menu ===\n";
$offenders = [];
foreach (glob(__DIR__ . '/../dcc-seasons/**/*.php') + glob(__DIR__ . '/../dcc-seasons/*.php') as $file) {
    $src = file_get_contents($file);
    $code = '';
    foreach (token_get_all($src) as $tok) {
        if (is_array($tok)) {
            if (in_array($tok[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }
            $code .= $tok[1];
        } else {
            $code .= $tok;
        }
    }
    foreach (['add_menu_page', 'remove_submenu_page'] as $fn) {
        if (preg_match('/\b' . $fn . '\s*\(/', $code)) {
            $offenders[] = basename($file) . ':' . $fn;
        }
    }
}
ok($offenders === [], 'no add_menu_page() or remove_submenu_page() call remains in code',
    implode(', ', $offenders));

/* And the submenu registration that MUST remain. */
$settings = file_get_contents(__DIR__ . '/../dcc-seasons/includes/class-settings.php');
ok(strpos($settings, 'add_submenu_page(') !== false, 'the submenu is still registered');
ok(\DCC_Seasons\Menu::PRIORITY === 40, 'Menu::PRIORITY is still 40',
    (string) \DCC_Seasons\Menu::PRIORITY);
ok(\DCC_Seasons\Menu::PARENT === 'dcc', "Menu::PARENT is still 'dcc'");

/* 4.5.0 rollout (Rob, 2026-10-06): the Director narrows Scope to the
 * homepage on install, with the live layer settings — falling sprites off,
 * background layer on. The page must still load (the engine now has the
 * background, accent, scenes and heroes to draw), on the homepage only. */
echo "\n=== 4.5.0 rollout: scope=home, ambient=0, subtle=1 ===\n";
$ROLL = ['scope' => 'home', 'ambient' => 0, 'subtle' => 1, 'egg' => 1, 'placement' => 'content', 'layering' => 'front', 'density' => 16];
ok(loads(['front' => true, 'path' => '/'], $ROLL), 'the homepage is decorated');
ok(!loads(['page' => true, 'id' => 12, 'slug' => 'contact', 'path' => '/contact/'], $ROLL), '/contact/ is not');
ok(!loads(['page' => true, 'id' => 13, 'slug' => 'cottages', 'path' => '/cottages/'], $ROLL), '/cottages/ is not');
ok(!loads(['cottage' => true, 'id' => 1065, 'slug' => 'cottage-1', 'path' => '/accommodation/cottage-1/'], $ROLL), 'a cottage page is not');
ok(!loads(['page' => true, 'id' => 1399, 'slug' => 'submit-booking', 'path' => '/submit-booking/'], $ROLL), 'Submit Booking is not');
ok(loads(['front' => true, 'path' => '/'], ['ambient' => 0, 'egg' => 0, 'subtle' => 1, 'scope' => 'home']), 'egg off too: the homepage still loads (the engine has layers to draw)');
ok(!loads(['front' => true, 'path' => '/'], ['ambient' => 0, 'egg' => 0, 'subtle' => 0, 'richness' => 'minimal', 'scope' => 'home']), 'everything off: nothing loads, even on the homepage');
/* config() needs a few more WordPress functions than should_load() does. */
foreach (['add_query_arg' => 'function add_query_arg($k, $v = null, $u = null) { return (string) $u; }',
          'home_url' => 'function home_url($p = "") { return "https://doracanalcourt.com" . $p; }',
          'current_user_can' => 'function current_user_can($c) { return false; }',
          'admin_url' => 'function admin_url($p = "") { return "https://doracanalcourt.com/wp-admin/" . $p; }',
          'wp_create_nonce' => 'function wp_create_nonce($a = -1) { return "n"; }',
          'is_user_logged_in' => 'function is_user_logged_in() { return false; }',
          'current_time' => 'function current_time($f) { return date($f); }',
          'get_locale' => 'function get_locale() { return "en_US"; }'] as $fn => $def) {
    if (!function_exists($fn)) { eval($def); }
}
if (!defined('DCC_SEASONS_URL')) { define('DCC_SEASONS_URL', 'https://doracanalcourt.com/wp-content/plugins/dcc-seasons/'); }
if (!defined('DCC_SEASONS_VERSION')) { define('DCC_SEASONS_VERSION', 'test'); }
$ref = new \ReflectionClass(Plugin::class);
$cfgm = $ref->getMethod('config');
$cfgm->setAccessible(true);
$cfg = $cfgm->invoke($ref->newInstanceWithoutConstructor(), array_merge(Settings::defaults(), $ROLL));
ok($cfg['ambient'] === false && $cfg['engine'] === true, "the page's config says: sprites off, engine on", json_encode(['ambient' => $cfg['ambient'], 'engine' => $cfg['engine']]));

echo "\n$pass passed · $fail failed\n";
if ($fail) {
    foreach ($problems as $p) { echo "  - $p\n"; }
    exit(1);
}
