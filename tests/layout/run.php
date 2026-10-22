<?php
/**
 * v0.35.0 — WHO SEES THE NEW CHECKOUT LAYOUT (item 9, Rob's pick C).
 *
 *     php tests/layout/run.php
 *
 * The new layout ships off. This suite is the thing standing between a guest
 * mid-booking and an unreviewed checkout, so every way in is constructed —
 * and so is every way it must NOT open: no key, a wrong key, a near-miss key,
 * an empty one, a cookie from a rotated key, a key in the wrong parameter.
 *
 * WHAT IS REAL: the shipped Layout, Config and Settings::sanitize().
 * WHAT IS A STAND-IN: WordPress's option store, $_GET/$_COOKIE and setcookie
 * (recorded rather than sent, so the cookie's own flags can be asserted).
 */
namespace {
define('ABSPATH', __DIR__);
define('YEAR_IN_SECONDS', 31536000);

$GLOBALS['opt'] = [];
$GLOBALS['cookies_set'] = [];
$GLOBALS['ssl'] = true;
$GLOBALS['errors'] = [];

function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
function update_option($k, $v) { $GLOBALS['opt'][$k] = $v; return true; }
function apply_filters($hook, $value, ...$rest) { return $value; }
function add_action() {} function add_filter() {}
function __($t, $d = null) { return $t; }
function esc_html__($t, $d = null) { return $t; }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_url($u) { return $u; }
function wp_unslash($v) { return $v; }
function sanitize_text_field($v) { return is_string($v) ? trim($v) : ''; }
function is_ssl() { return $GLOBALS['ssl']; }
function home_url($p = '/') { return 'https://example.test' . $p; }
function add_query_arg($k, $v, $url) { return $url . (strpos($url, '?') === false ? '?' : '&') . $k . '=' . $v; }
function wp_generate_password($len = 12, $special = true, $extra = true) { return str_repeat('x', $len); }
function add_settings_error($slug, $code, $msg, $type = 'error') { $GLOBALS['errors'][] = $msg; }
function register_setting() {} function add_settings_section() {} function add_settings_field() {}
} // namespace

// setcookie() and headers_sent() are real PHP functions and cannot be
// redeclared globally. Layout is namespaced, so an unqualified call inside it
// resolves to DCC_Checkout\setcookie first — which is what the real code path
// does in production too, falling through to PHP's own when none is defined.
namespace DCC_Checkout {
    function headers_sent() { return false; }
    function setcookie($name, $value = '', $options = []) {
        $GLOBALS['cookies_set'][] = ['name' => $name, 'value' => $value, 'options' => $options];
        return true;
    }
}

namespace {

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-layout.php';

use DCC_Checkout\Config;
use DCC_Checkout\Layout;

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

/** A fresh request: no cookie, no parameter, the given stored settings. */
function request(array $settings = []): void {
    $GLOBALS['opt'] = $settings === [] ? [] : ['dcc_checkout_settings' => $settings];
    $GLOBALS['cookies_set'] = [];
    $_GET = [];
    $_COOKIE = [];
    Config::flush_cache();
    Layout::flush();
}

const KEY   = 'abcdef0123456789abcdef0123456789';
const OTHER = '0123456789abcdef0123456789abcdef';

/* =====================================================================
 * OFF BY DEFAULT. A site that has never touched the setting shows every
 * guest today's checkout.
 * ===================================================================== */
request();
check('a site with no settings at all: the new layout is OFF', Layout::active(), false);
check('... and the switch reads off', Layout::enabled_for_everyone(), false);
check('... and nothing is previewing', Layout::previewing(), false);
check('the shipped default is off', Config::defaults()['layout_enabled'], 0);

request(['layout_enabled' => 0, Layout::KEY_SETTING => KEY]);
check('switch off, no key given: OFF', Layout::active(), false);

/* =====================================================================
 * THE SWITCH.
 * ===================================================================== */
request(['layout_enabled' => 1]);
check('the owner\'s switch on: every guest gets it', Layout::active(), true);
request(['layout_enabled' => '1']);
check('... stored as a string too', Layout::active(), true);
request(['layout_enabled' => 0]);
check('and off again', Layout::active(), false);

/* =====================================================================
 * THE PREVIEW KEY. Every way in, and every way it must not open.
 * ===================================================================== */
$svc = new Layout();

/** Drive one request carrying ?dcc_layout=$given, with $cookie already set. */
function visit(string $given = '', ?string $cookie = null, array $settings = ['layout_enabled' => 0, Layout::KEY_SETTING => KEY]): bool {
    global $svc;
    request($settings);
    if ($given !== '') { $_GET[Layout::PARAM] = $given; }
    if ($cookie !== null) { $_COOKIE[Layout::COOKIE] = $cookie; }
    $svc->handle_preview_request();
    return Layout::active();
}

check('the right key in the URL: this browser sees the new layout', visit(KEY), true);
check('... and a session cookie was set to it',
    [count($GLOBALS['cookies_set']), $GLOBALS['cookies_set'][0]['value'] ?? null,
     $GLOBALS['cookies_set'][0]['options']['expires'] ?? null], [1, KEY, 0]);
check('... httponly, SameSite=Lax, and secure on an https site',
    [$GLOBALS['cookies_set'][0]['options']['httponly'] ?? null,
     $GLOBALS['cookies_set'][0]['options']['samesite'] ?? null,
     $GLOBALS['cookies_set'][0]['options']['secure'] ?? null], [true, 'Lax', true]);

check('the cookie alone, on a later page: still the new layout', visit('', KEY), true);

/* The ways in that must not work. */
check('a WRONG key: today\'s checkout', visit(OTHER), false);
check('... and no cookie is set for it', $GLOBALS['cookies_set'], []);
check('a key one character short', visit(substr(KEY, 0, 31)), false);
check('a key with one character changed', visit(substr(KEY, 0, 31) . 'f' === KEY ? OTHER : substr(KEY, 0, 31) . '0'), false);
check('upper case of the right key', visit(strtoupper(KEY)), false);
check('an empty parameter', visit(''), false);
check('the key as a cookie but WRONG', visit('', OTHER), false);
check('a cookie that is not a key at all', visit('', 'yes'), false);
check('"1" as the key', visit('1'), false);
check('"true" as the key', visit('true'), false);

/* A key stored in the WRONG SHAPE can never match — including the empty
   string, which is what an un-generated key looks like. */
check('no key stored, and an empty key given: no match',
    visit('', '', ['layout_enabled' => 0, Layout::KEY_SETTING => '']), false);
check('no key stored, and a key given', visit(KEY, null, ['layout_enabled' => 0]), false);
check('a short stored key cannot be guessed by sending it',
    visit('abc', null, ['layout_enabled' => 0, Layout::KEY_SETTING => 'abc']), false);

/* Rotating the key ends every preview at once. */
check('a cookie from the OLD key, after the key was rotated',
    visit('', KEY, ['layout_enabled' => 0, Layout::KEY_SETTING => OTHER]), false);

/* Ending a preview. */
$svc2 = new Layout();
request(['layout_enabled' => 0, Layout::KEY_SETTING => KEY]);
$_COOKIE[Layout::COOKIE] = KEY;
$_GET[Layout::PARAM] = Layout::OFF;
$svc2->handle_preview_request();
check('?dcc_layout=off ends the preview', Layout::active(), false);
check('... by expiring the cookie',
    [$GLOBALS['cookies_set'][0]['value'] ?? null,
     ($GLOBALS['cookies_set'][0]['options']['expires'] ?? 0) < time()], ['', true]);

/* ...but a URL can never overrule the owner's switch. */
request(['layout_enabled' => 1, Layout::KEY_SETTING => KEY]);
$_GET[Layout::PARAM] = Layout::OFF;
(new Layout())->handle_preview_request();
check('?dcc_layout=off does NOT turn the layout off for a site that has it on',
    Layout::active(), true);

/* An http site gets a cookie without the secure flag, or it would never
   be sent back and the preview would silently never work. */
$GLOBALS['ssl'] = false;
visit(KEY);
check('on a plain http site the cookie is not marked secure',
    $GLOBALS['cookies_set'][0]['options']['secure'] ?? null, false);
$GLOBALS['ssl'] = true;

/* =====================================================================
 * THE KEY ITSELF.
 * ===================================================================== */
request();
$generated = Layout::preview_key();
check('a key is generated on first read: 32 hex characters',
    (bool) preg_match('/\A[0-9a-f]{32}\z/', $generated), true);
check('... and stored', $GLOBALS['opt']['dcc_checkout_settings'][Layout::KEY_SETTING] ?? null, $generated);
Layout::flush();
check('... and the same key is returned next time', Layout::preview_key(), $generated);

request();
$a = Layout::preview_key();
request();
$b = Layout::preview_key();
check('two sites do not get the same key', $a === $b, false);

request(['layout_enabled' => 0, Layout::KEY_SETTING => 'not-a-key']);
$fixed = Layout::preview_key();
check('a malformed stored key is replaced, not used',
    [(bool) preg_match('/\A[0-9a-f]{32}\z/', $fixed), $fixed === 'not-a-key'], [true, false]);

request(['layout_enabled' => 0, Layout::KEY_SETTING => KEY]);
check('the preview URL carries the key', Layout::preview_url(),
    'https://example.test/submit-booking/?dcc_layout=' . KEY);

/* =====================================================================
 * SAVING THE SETTINGS MUST NOT WIPE THE KEY.
 *
 * sanitize() builds its output from scratch, so a key it does not carry
 * through is destroyed on every Save Changes — and the Director's preview
 * link dies mid-test with nothing to explain it.
 * ===================================================================== */
require __DIR__ . '/../../dcc-custom-checkout/includes/class-id-files.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-dog-sizes.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-settings.php';
function get_post_meta($id, $k, $s = false) { return ''; }
function get_posts($a = []) { return []; }
function get_post($id = null) { return null; }
function wp_doing_ajax() { return false; }
function is_admin() { return true; }
function did_action($h) { return 0; }
function current_user_can($c) { return true; }

request(['layout_enabled' => 0, Layout::KEY_SETTING => KEY, 'pet_fee_enabled' => 1]);
$settings = new \DCC_Checkout\Settings();
$out = $settings->sanitize(['pet_fee_enabled' => 1, 'layout_enabled' => 1]);
check('saving the settings keeps the preview key', $out[Layout::KEY_SETTING] ?? null, KEY);
check('... and records the switch', $out['layout_enabled'], 1);

$out = $settings->sanitize(['pet_fee_enabled' => 1]);
check('an unticked switch saves as off', $out['layout_enabled'], 0);
check('... and still keeps the key', $out[Layout::KEY_SETTING] ?? null, KEY);

/* The key is never taken from the form: someone who can reach the settings
   page must not be able to SET a key they already know (or a short one). */
$out = $settings->sanitize(['pet_fee_enabled' => 1, Layout::KEY_SETTING => OTHER]);
check('a key posted in the form is ignored; the stored one stands',
    $out[Layout::KEY_SETTING] ?? null, KEY);

request(['layout_enabled' => 0, 'pet_fee_enabled' => 1]);
$out = $settings->sanitize(['pet_fee_enabled' => 1]);
check('with no key stored yet, saving stores none (it is generated on read)',
    array_key_exists(Layout::KEY_SETTING, $out), false);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);

} // namespace
