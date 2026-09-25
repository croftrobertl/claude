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

class WP_Post { public $ID = 0; public $post_name = ''; }

define('ABSPATH', 1);
define('DCC_SEASONS_VERSION', 'test');
define('DCC_SEASONS_URL', './');
define('DCC_SEASONS_FILE', __DIR__ . '/../dcc-seasons/dcc-seasons.php');

/** The request under test. Every stub below reads this. */
$GLOBALS['REQ'] = [
    'front' => false, 'page' => false, 'cottage' => false,
    'id' => 0, 'slug' => '', 'path' => '/',
];

function __($s, $d = null) { return $s; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_html($s) { return $s; }
function esc_attr($s) { return $s; }
function esc_textarea($s) { return $s; }
function apply_filters($tag, $value) { return $value; }
function do_action() {}
function add_action() {}
function add_filter() {}
function did_action() { return false; }
function sanitize_key($k) { return strtolower(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $k)); }
function sanitize_text_field($v) { return trim(strip_tags((string) $v)); }
function wp_unslash($v) { return $v; }
function absint($v) { return abs((int) $v); }
function wp_parse_args($a, $d) { return array_merge($d, is_array($a) ? $a : []); }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function plugin_basename($f) { return basename($f); }
function plugin_dir_url($f) { return './'; }
function get_option($k, $d = false) { return $GLOBALS['OPTIONS'][$k] ?? $d; }
function update_option($k, $v, $a = null) { $GLOBALS['OPTIONS'][$k] = $v; return true; }
function is_front_page() { return (bool) $GLOBALS['REQ']['front']; }
function is_singular($types = '') {
    if (!$GLOBALS['REQ']['cottage']) { return false; }
    $types = (array) $types;
    return in_array('mphb_room_type', $types, true) || $types === [];
}
function is_page($x = '') {
    if (!$GLOBALS['REQ']['page']) { return false; }
    if ($x === '' || $x === []) { return true; }
    foreach ((array) $x as $v) {
        if (is_int($v) || ctype_digit((string) $v)) {
            if ((int) $v === (int) $GLOBALS['REQ']['id']) { return true; }
        } elseif ((string) $v === (string) $GLOBALS['REQ']['slug']) {
            return true;
        }
    }
    return false;
}
function get_queried_object() {
    if (!$GLOBALS['REQ']['page']) { return null; }
    $p = new \WP_Post();
    $p->ID = (int) $GLOBALS['REQ']['id'];
    $p->post_name = (string) $GLOBALS['REQ']['slug'];
    return $p;
}

require __DIR__ . '/../dcc-seasons/includes/class-schedule.php';
require __DIR__ . '/../dcc-seasons/includes/class-themes.php';
require __DIR__ . '/../dcc-seasons/includes/class-settings.php';
require __DIR__ . '/../dcc-seasons/includes/class-menu.php';
require __DIR__ . '/../dcc-seasons/includes/class-cache-purge.php';
require __DIR__ . '/../dcc-seasons/includes/class-plugin.php';

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
foreach (['home', 'no_cottages', 'pages', 'all'] as $scope) {
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

echo "\n$pass passed · $fail failed\n";
if ($fail) {
    foreach ($problems as $p) { echo "  - $p\n"; }
    exit(1);
}
