<?php
/**
 * v0.35.3 — THE CHECKOUT PAGE IS NEVER PAGE-CACHED.
 *
 *     php tests/pagecache/run.php
 *
 * WHAT THIS PROVES
 *   - `DONOTCACHEPAGE` is defined, true, on a front-end render of the checkout
 *     page, and on nothing else: not another page, not wp-admin, not AJAX.
 *   - It is hooked EARLY ENOUGH and on a hook that exists: `template_redirect`,
 *     which is after the main query (the gate calls `is_page()`) and long
 *     before output ends, which is all SpeedyCache's output-buffer callback
 *     requires.
 *   - **No PHP warning, ever.** `define()` cannot redefine a constant: without
 *     the `defined()` guard, a request where something else had already
 *     defined it would raise a warning ON A GUEST'S CHECKOUT. Every case here
 *     runs with notices turned into failures.
 *
 * WHAT IT CANNOT PROVE, and the Director verified instead on live:
 *   - that SpeedyCache reads the constant (`speedycache/main/cache.php:190`),
 *   - that the host's nginx proxy caches no cookie-setting response,
 *   - that a cache file already on disk is purged — this stops one being
 *     WRITTEN, it does not delete one, and `advanced-cache.php` can serve such
 *     a file before WordPress loads.
 *
 * THE CONSTANT IS GLOBAL AND CANNOT BE UNDEFINED, which shapes this file: the
 * "defined by us" case must run LAST, because after it every later case would
 * see it already defined. The ordering is deliberate, and a guard asserts the
 * constant really is absent when the early cases run — otherwise they would
 * pass by having nothing to say.
 */
define('ABSPATH', __DIR__);
define('DCC_CHECKOUT_VERSION', 'test');
define('DCC_CHECKOUT_FILE', __FILE__);
define('DCC_CHECKOUT_DIR', dirname(__DIR__, 2) . '/dcc-custom-checkout/');
define('DCC_CHECKOUT_URL', 'https://example.test/wp-content/plugins/dcc-custom-checkout/');
define('YEAR_IN_SECONDS', 31536000);
define('MINUTE_IN_SECONDS', 60);
define('DAY_IN_SECONDS', 86400);

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) {
        echo '      expected: ' . var_export($expected, true) . "\n";
        echo '      actual:   ' . var_export($actual, true) . "\n";
    }
}

/** Run something with every PHP notice turned into a failure. */
function without_warnings(string $name, callable $fn) {
    $seen = [];
    set_error_handler(static function ($no, $str) use (&$seen) {
        $seen[] = $str;
        return true;
    });
    try {
        $value = $fn();
    } finally {
        restore_error_handler();
    }
    check($name, $seen, []);
    return $value;
}

/* ========================================================================== *
 * WordPress / MotoPress stand-ins
 * ========================================================================== */

$GLOBALS['state'] = [
    'hooks'    => [],   // hook => [[cb, priority], …]
    'is_page'  => true,
    'is_admin' => false,
    'ajax'     => false,
    'option'   => [],
];

function add_action($hook, $cb, $priority = 10, $args = 1) {
    $GLOBALS['state']['hooks'][$hook][] = [$cb, $priority];
    return true;
}
function add_filter($hook, $cb, $priority = 10, $args = 1) {
    return add_action($hook, $cb, $priority, $args);
}
function do_action($hook, ...$args) {
    foreach ($GLOBALS['state']['hooks'][$hook] ?? [] as [$cb, $priority]) {
        $cb(...$args);
    }
}
function apply_filters($hook, $value, ...$rest) {
    foreach ($GLOBALS['state']['hooks'][$hook] ?? [] as [$cb, $priority]) {
        $value = $cb($value, ...$rest);
    }
    return $value;
}
function is_admin() { return (bool) $GLOBALS['state']['is_admin']; }
function wp_doing_ajax() { return (bool) $GLOBALS['state']['ajax']; }
function is_page($id = null) { return (bool) $GLOBALS['state']['is_page']; }
function get_option($k, $d = false) { return $GLOBALS['state']['option'][$k] ?? $d; }
function update_option($k, $v) { $GLOBALS['state']['option'][$k] = $v; return true; }
function __($t, $d = null) { return $t; }
function _x($t, $c = '', $d = null) { return $t; }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function sanitize_key($k) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $k)); }
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function wp_unslash($v) { return $v; }
function home_url($p = '') { return 'https://example.test' . $p; }
function is_ssl() { return true; }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }

class MPHB_Pages_Stub {
    public function getCheckoutPageId() { return 1399; }
    public function getCheckoutPageUrl() { return 'https://example.test/submit-booking/'; }
}
class MPHB_Settings_Stub { public function pages() { return new MPHB_Pages_Stub(); } }
class MPHB_Stub { public function settings() { return new MPHB_Settings_Stub(); } }
function MPHB() { return new MPHB_Stub(); }

$plugin = dirname(__DIR__, 2) . '/dcc-custom-checkout';
foreach (['config', 'layout', 'assets', 'page-cache'] as $f) {
    require $plugin . '/includes/class-' . $f . '.php';
}

use DCC_Checkout\Assets;
use DCC_Checkout\Page_Cache;

function reset_state(array $over = []): void {
    $GLOBALS['state']['hooks']    = [];
    $GLOBALS['state']['is_page']  = $over['is_page']  ?? true;
    $GLOBALS['state']['is_admin'] = $over['is_admin'] ?? false;
    $GLOBALS['state']['ajax']     = $over['ajax']     ?? false;
    $_GET = [];
    $_POST = [];
    $_COOKIE = [];
    \DCC_Checkout\Config::flush_cache();
    \DCC_Checkout\Layout::flush();
}

/* ========================================================================== *
 * 1. The hook
 * ========================================================================== */

echo "--- the hook ---\n";

reset_state();
(new Page_Cache())->register();

$hooked = $GLOBALS['state']['hooks'];
check('it hooks template_redirect and nothing else',
    array_keys($hooked), ['template_redirect']);
/* THE HOOK HAS TO BE ONE THAT EXISTS AND THAT RUNS IN TIME. `template_redirect`
   is after the main query — the gate calls `is_page()`, which would be wrong
   or empty earlier — and long before output ends, which is all SpeedyCache's
   output-buffer callback needs. A typo here is silent: the action would simply
   never fire. */
check('… at an early priority on that hook',
    $hooked['template_redirect'][0][1], 1);

/* ========================================================================== *
 * 2. The gate — which requests get it
 *
 * THE CONSTANT IS GLOBAL AND CANNOT BE UNDEFINED, so every case that must NOT
 * define it runs FIRST, and this guard is what stops them passing vacuously.
 * ========================================================================== */

echo "\n--- who gets it ---\n";

check('the constant is absent to begin with (the guard on everything below)',
    defined(Page_Cache::CONSTANT), false);

reset_state(['is_page' => false]);
without_warnings('another page: no warning', static function () {
    (new Page_Cache())->register();
    do_action('template_redirect');
    return null;
});
check('… and no constant',
    defined(Page_Cache::CONSTANT), false);

reset_state(['is_admin' => true]);
without_warnings('wp-admin: no warning', static function () {
    (new Page_Cache())->register();
    do_action('template_redirect');
    return null;
});
check('… and no constant', defined(Page_Cache::CONSTANT), false);

reset_state(['ajax' => true]);
without_warnings('AJAX: no warning', static function () {
    (new Page_Cache())->register();
    do_action('template_redirect');
    return null;
});
check('… and no constant', defined(Page_Cache::CONSTANT), false);

/* A filter can still say "this is not the checkout", which is the same gate
   every other part of this plugin reads. */
reset_state();
$GLOBALS['state']['hooks']['dcc_checkout_is_checkout_page'][] =
    [static function () { return false; }, 10];
without_warnings('a filter saying "not the checkout": no warning',
    static function () {
        (new Page_Cache())->register();
        do_action('template_redirect');
        return null;
    });
check('… and no constant', defined(Page_Cache::CONSTANT), false);

/* ========================================================================== *
 * 3. THE GATE IS NOT THE LAYOUT SWITCH, and that is deliberate
 *
 * `restore.js` is NOT behind the preview gate (0.35.0, Rob's instruction), and
 * its `stay` / `offer` are per-request — so a cached checkout is wrong for
 * every guest whether the layout is on or off. A belt gated on the layout
 * would have left live-today exactly as exposed as it was.
 * ========================================================================== */

echo "\n--- the layout switch does not decide this ---\n";

reset_state(['settings' => []]);
$GLOBALS['state']['option'] = [
    \DCC_Checkout\Config::OPTION => ['layout_enabled' => 0],
];
\DCC_Checkout\Config::flush_cache();
\DCC_Checkout\Layout::flush();
check('the layout really is off for this case (the guard)',
    \DCC_Checkout\Layout::active(), false);
check('… and the checkout page is still the checkout page',
    Assets::is_checkout_page(), true);

/* ========================================================================== *
 * 4. The checkout page itself — LAST, because the constant cannot be undone
 * ========================================================================== */

echo "\n--- the checkout page ---\n";

reset_state();
without_warnings('the checkout page: no warning', static function () {
    (new Page_Cache())->register();
    do_action('template_redirect');
    return null;
});
check('DONOTCACHEPAGE is defined on the checkout',
    defined(Page_Cache::CONSTANT), true);
check('… and it is TRUE, which is what SpeedyCache tests',
    constant(Page_Cache::CONSTANT), true);

/* ALREADY DEFINED: the second request in one process, and the real case of
   another plugin having defined it. `define()` on an existing constant raises
   a warning and returns false, so the `defined()` guard is not tidiness — it
   is what keeps a PHP warning off a guest's checkout. */
without_warnings('a second render in the same process: still no warning',
    static function () {
        reset_state();
        (new Page_Cache())->register();
        do_action('template_redirect');
        return null;
    });
check('… and the constant is unchanged', constant(Page_Cache::CONSTANT), true);

without_warnings('calling block() directly when already defined: no warning',
    static function () { Page_Cache::block(); return null; });
check('… still true', constant(Page_Cache::CONSTANT), true);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
