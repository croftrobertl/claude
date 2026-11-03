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

/* The live configuration (2026-11-03). Since 4.15.0 the gate is the
 * "Show On" checklist (Rob's pick A); the stored scope value is kept but no
 * longer read, so it is set here to prove that. exclude_paths carries the
 * Director's stopgap until he clears it after this release. */
$STOPGAP = "staff\ntest\nguest\nexplore\nwildlife-guide\npay\nshop\naccount\ndelete\nprivacy\nterms-conditions\ncancellation-refund-policy\naccessibility\nsearch-results\ntransaction-failed";
$LIVE = ['scope' => 'no_cottages', 'placement' => 'content', 'layering' => 'front'];
$LIVE_SG = $LIVE + ['exclude_paths' => $STOPGAP];

/* every kind of page the live site has, by ID and slug */
$SITE = [
    'home'                 => ['front' => true, 'path' => '/'],
    '/contact/ (22)'       => ['page' => true, 'id' => 22, 'slug' => 'contact', 'path' => '/contact/'],
    '/cottages/ (1005)'    => ['page' => true, 'id' => 1005, 'slug' => 'cottages', 'path' => '/cottages/'],
    '/staff/'              => ['page' => true, 'id' => 18102, 'slug' => 'staff', 'path' => '/staff/'],
    '/test/'               => ['page' => true, 'id' => 3001, 'slug' => 'test', 'path' => '/test/'],
    '/guest/'              => ['page' => true, 'id' => 4645, 'slug' => 'guest', 'path' => '/guest/'],
    '/explore/'            => ['page' => true, 'id' => 18119, 'slug' => 'explore', 'path' => '/explore/'],
    '/wildlife-guide/'     => ['page' => true, 'id' => 3002, 'slug' => 'wildlife-guide', 'path' => '/wildlife-guide/'],
    '/pay/'                => ['page' => true, 'id' => 3003, 'slug' => 'pay', 'path' => '/pay/'],
    '/shop/'               => ['page' => true, 'id' => 3004, 'slug' => 'shop', 'path' => '/shop/'],
    '/account/'            => ['page' => true, 'id' => 3005, 'slug' => 'account', 'path' => '/account/'],
    '/delete/'             => ['page' => true, 'id' => 3006, 'slug' => 'delete', 'path' => '/delete/'],
    '/privacy/'            => ['page' => true, 'id' => 3007, 'slug' => 'privacy', 'path' => '/privacy/'],
    '/terms-conditions/'   => ['page' => true, 'id' => 3008, 'slug' => 'terms-conditions', 'path' => '/terms-conditions/'],
    '/cancellation-refund-policy/' => ['page' => true, 'id' => 3009, 'slug' => 'cancellation-refund-policy', 'path' => '/cancellation-refund-policy/'],
    '/accessibility/'      => ['page' => true, 'id' => 3010, 'slug' => 'accessibility', 'path' => '/accessibility/'],
    '/search-results/'     => ['page' => true, 'id' => 3011, 'slug' => 'search-results', 'path' => '/search-results/'],
    '/transaction-failed/' => ['page' => true, 'id' => 3012, 'slug' => 'transaction-failed', 'path' => '/transaction-failed/'],
    'a page made tomorrow' => ['page' => true, 'id' => 9999, 'slug' => 'new-page', 'path' => '/new-page/'],
    'a cottage page'       => ['cottage' => true, 'id' => 1607, 'slug' => 'cottage-34', 'path' => '/accommodation/cottage-34/'],
    'a blog post'          => ['path' => '/2026/10/a-post/'],
    'a search'             => ['path' => '/?s=canal'],
    '/checkout/'           => ['page' => true, 'id' => 2393, 'slug' => 'checkout', 'path' => '/checkout/'],
    '/submit-booking/'     => ['page' => true, 'id' => 1399, 'slug' => 'submit-booking', 'path' => '/submit-booking/'],
];
$ON = ['home', '/contact/ (22)', '/cottages/ (1005)'];

echo "=== SHOW ON: the checklist ALONE (stopgap cleared) gives exactly home + contact + cottages ===\n";
foreach ($SITE as $name => $req) {
    $want = in_array($name, $ON, true);
    $got = loads($req, $LIVE + ['exclude_paths' => '', 'exclude_ids' => '']);
    ok($got === $want, sprintf('%-30s %s', $name, $want ? 'decorated' : 'left alone'), $got ? 'loaded' : 'did not load');
}
echo "\n=== and the same with the Director's stopgap still set (nothing changes) ===\n";
$diff = [];
foreach ($SITE as $name => $req) { if (loads($req, $LIVE_SG) !== in_array($name, $ON, true)) { $diff[] = $name; } }
ok($diff === [], 'exactly home + contact + cottages, stopgap or not', implode(', ', $diff));

echo "\n=== the stored scope is no longer read ===\n";
foreach (['home', 'no_cottages', 'pages', 'not_home', 'all'] as $scope) {
    $diff = [];
    foreach ($SITE as $name => $req) { if (loads($req, ['scope' => $scope, 'exclude_paths' => '', 'exclude_ids' => '']) !== in_array($name, $ON, true)) { $diff[] = $name; } }
    ok($diff === [], "scope=$scope changes nothing", implode(', ', $diff));
}

echo "\n=== the default follows its pages by SLUG if their IDs change ===\n";
$keep = $GLOBALS['PAGES'];
$GLOBALS['PAGES'] = [7022 => 'contact', 7005 => 'cottages'] + array_diff_key($keep, [22 => 1, 1005 => 1]);
ok(loads(['page' => true, 'id' => 7022, 'slug' => 'contact', 'path' => '/contact/'], $LIVE), '/contact/ rebuilt as page 7022 is still decorated');
ok(loads(['page' => true, 'id' => 7005, 'slug' => 'cottages', 'path' => '/cottages/'], $LIVE), '/cottages/ rebuilt as page 7005 is still decorated');
ok(!loads(['page' => true, 'id' => 22, 'slug' => 'old-thing', 'path' => '/old-thing/'], $LIVE), 'and whatever now holds ID 22 is not');
$GLOBALS['PAGES'] = $keep;

echo "\n=== ticking and unticking ===\n";
ok(loads($SITE['a cottage page'], $LIVE + ['show_on' => ['home', 22, 1005, 1607]]), 'a cottage page is decorated once ticked');
ok(loads($SITE['a page made tomorrow'], $LIVE + ['show_on' => ['home', 9999]]), 'a new page is decorated once ticked');
ok(!loads($SITE['home'], $LIVE + ['show_on' => [22, 1005]]), 'the homepage is left alone once unticked');
ok(!loads($SITE['/contact/ (22)'], $LIVE + ['show_on' => []]), 'nothing ticked: nothing decorated');
ok(!loads($SITE['a blog post'], $LIVE + ['show_on' => ['home', 22, 1005]]), 'a post is never decorated (it is not on the list)');
$sv = Settings::sanitize(['show_on_sent' => 1, 'show_on' => ['home', '22', '1005']]);
ok(!array_key_exists('show_on', $sv), "ticks equal to Rob's default are not stored (a tracked default)", json_encode($sv['show_on'] ?? null));
$sv = Settings::sanitize(['show_on_sent' => 1, 'show_on' => ['1005', 'home', '1607', 'x', '-3']]);
ok(($sv['show_on'] ?? null) === ['home', 1005, 1607], 'other ticks are stored, cleaned and in order', json_encode($sv['show_on'] ?? null));
$sv = Settings::sanitize(['show_on_sent' => 1]);
ok(($sv['show_on'] ?? null) === [], 'unticking everything is stored as an empty list', json_encode($sv['show_on'] ?? null));
ok(Settings::is_default_value('show_on', [1005, 'home', 22]), 'the default in any order is the default');

echo "\n=== the hard exclusions win over the checklist ===\n";
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
$ALL = array_merge(['home'], array_column($flow, 0), [4645, 18102, 18103, 18119]);
$bad = [];
foreach ($flow as [$id, $slug, $path, $name]) {
    if (loads(['page' => true, 'id' => $id, 'slug' => $slug, 'path' => $path], $LIVE + ['show_on' => $ALL])) { $bad[] = $name; }
}
ok($bad === [], 'the whole booking flow stays alone even when ticked', implode(', ', $bad));
ok(!loads(['page' => true, 'id' => 2393, 'slug' => 'totally-renamed', 'path' => '/totally-renamed/'], $LIVE + ['show_on' => $ALL]),
    'checkout stays excluded after a slug rename (ID fallback)');
ok(!loads(['page' => true, 'id' => 99999, 'slug' => 'checkout', 'path' => '/checkout/'], $LIVE + ['show_on' => array_merge($ALL, [99999])]),
    'checkout stays excluded after an ID change (slug fallback)');
ok(!loads(['page' => true, 'id' => 4645, 'slug' => 'guest', 'path' => '/guest/'], $LIVE + ['show_on' => $ALL]), '/guest/ stays alone when ticked');
ok(loads(['page' => true, 'id' => 4645, 'slug' => 'guest', 'path' => '/guest/'], $LIVE + ['show_on' => $ALL, 'guide_effects' => 1]),
    '/guest/ CAN be re-enabled from settings, without code');
ok(!loads(['page' => true, 'id' => 18102, 'slug' => 'staff', 'path' => '/staff/'], $LIVE + ['show_on' => $ALL]), '/staff/ stays alone when ticked');
ok(!loads(['page' => true, 'id' => 18103, 'slug' => 'rota', 'path' => '/staff/rota/'], $LIVE + ['show_on' => $ALL]), 'anything beneath /staff/ too');
ok(!loads(['page' => true, 'id' => 18119, 'slug' => 'explore', 'path' => '/explore/'], $LIVE + ['show_on' => $ALL]), '/explore/ (excluded ID 18119) stays alone when ticked');
ok(loads(['page' => true, 'id' => 18119, 'slug' => 'explore', 'path' => '/explore/'], $LIVE + ['show_on' => $ALL, 'exclude_ids' => '']), 'clearing the ID field re-enables it');
ok(!loads(['page' => true, 'id' => 4242, 'slug' => 'anything', 'path' => '/anything/'], $LIVE + ['show_on' => [4242], 'exclude_ids' => '4242, 9999']),
    'the ID field takes more IDs without a release');

echo "\n=== the dcc_seasons_in_scope filter still speaks ===\n";
$GLOBALS['FILTERS']['dcc_seasons_in_scope'] = function ($in, $scope, $list = null) { return $scope === 'show_on' && is_array($list) ? true : $in; };
ok(loads($SITE['a blog post'], $LIVE), 'the filter can re-enable a page off the list (it is passed "show_on" and the list)');
ok(!loads($SITE['/checkout/'], $LIVE), 'but never a hard-excluded page');
$GLOBALS['FILTERS']['dcc_seasons_in_scope'] = function ($in) { return false; };
ok(!loads($SITE['home'], $LIVE), 'and it can switch a ticked page off');
unset($GLOBALS['FILTERS']['dcc_seasons_in_scope']);
ok(loads($SITE['home'], $LIVE), 'removing it puts it back');

/* The scope option is no longer read, and still never written by a hook. */
echo "\n=== the old scope option is kept, never written by the plugin ===\n";
ok(Settings::defaults()['scope'] === 'all', "the packaged default is still 'all'", (string) Settings::defaults()['scope']);
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
$sv = Settings::sanitize(['scope' => 'no_cottages']);
ok(($sv['scope'] ?? '') === 'no_cottages', 'a stored scope survives a save (kept for a rollback)');

echo "\n=== the booking exclusion is a SETTING, not a hardcode ===\n";
ok(loads(['page' => true, 'id' => 2393, 'slug' => 'checkout', 'path' => '/checkout/'],
        $LIVE + ['exclude_booking' => 0, 'show_on' => ['home', 2393]]),
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
echo "\n=== 4.5.0 rollout (now as Show On: Home only), ambient=0, subtle=1 ===\n";
$ROLL = ['show_on' => ['home'], 'ambient' => 0, 'subtle' => 1, 'egg' => 1, 'placement' => 'content', 'layering' => 'front', 'density' => 16];
ok(loads(['front' => true, 'path' => '/'], $ROLL), 'the homepage is decorated');
ok(!loads(['page' => true, 'id' => 22, 'slug' => 'contact', 'path' => '/contact/'], $ROLL), '/contact/ is not');
ok(!loads(['page' => true, 'id' => 1005, 'slug' => 'cottages', 'path' => '/cottages/'], $ROLL), '/cottages/ is not');
ok(!loads(['cottage' => true, 'id' => 1065, 'slug' => 'cottage-1', 'path' => '/accommodation/cottage-1/'], $ROLL), 'a cottage page is not');
ok(!loads(['page' => true, 'id' => 1399, 'slug' => 'submit-booking', 'path' => '/submit-booking/'], $ROLL), 'Submit Booking is not');
ok(loads(['front' => true, 'path' => '/'], ['ambient' => 0, 'egg' => 0, 'subtle' => 1, 'show_on' => ['home']]), 'egg off too: the homepage still loads (the engine has layers to draw)');
ok(!loads(['front' => true, 'path' => '/'], ['ambient' => 0, 'egg' => 0, 'subtle' => 0, 'richness' => 'minimal', 'show_on' => ['home']]), 'everything off: nothing loads, even on the homepage');
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
