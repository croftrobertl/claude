<?php
/**
 * v0.34.1 — WHERE assets/guest-count.js is loaded, from the shipped PHP.
 *
 *     php tests/recalc/enqueue.php
 *
 * The browser suite (run.js) puts the script on its pages itself, so it
 * cannot see whether the plugin does. This drives the shipped enqueue code —
 * Admin_Fields (admin_enqueue_scripts and MotoPress's mphb_cb_checkout_form)
 * and Assets — with WordPress's script functions recorded, and asserts:
 *  - Add New Booking gets it, in the HEAD, with its config;
 *  - the guest checkout gets it in the footer, as checkout.js's dependency, so
 *    it runs first (as the same code did inside checkout.js in 0.34.0);
 *  - Edit Accommodations and the booking edit screen do NOT (0.32.1: that
 *    flow is left as MotoPress draws it).
 * The admin stand-ins come from tests/admin-layout/config.php (its JSON
 * output is discarded); only WordPress's script API is added here.
 */
$argv = [__FILE__];
ob_start();
require __DIR__ . '/../admin-layout/config.php';
ob_end_clean();

$GLOBALS['scripts'] = [];
$GLOBALS['styles'] = [];
$GLOBALS['localized'] = [];
$GLOBALS['is_admin'] = true;
$GLOBALS['screen'] = null;
function wp_enqueue_script($h, $src = '', $deps = [], $ver = false, $footer = false) {
    $GLOBALS['scripts'][$h] = ['src' => $src, 'deps' => $deps, 'footer' => $footer];
}
function wp_enqueue_style($h = '', $src = '', $deps = [], $ver = false, $media = 'all') {
    $GLOBALS['styles'][$h] = ['src' => $src, 'deps' => $deps];
}
function wp_localize_script($h, $name, $data) { $GLOBALS['localized'][$h] = [$name, $data]; return true; }
function wp_script_is($h, $list = 'enqueued') { return isset($GLOBALS['scripts'][$h]); }
function current_user_can($c) { return $GLOBALS['can'] ?? true; }
function is_admin() { return $GLOBALS['is_admin']; }
function wp_doing_ajax() { return false; }
class WP_Screen { public $id = ''; public $base = ''; public $post_type = ''; }
function get_current_screen() { return $GLOBALS['screen']; }
if (!defined('DCC_CHECKOUT_URL')) { define('DCC_CHECKOUT_URL', 'https://example.test/wp-content/plugins/dcc-custom-checkout/'); }
// v0.34.2: the real plugin directory, so Assets::asset_url() can see whether
// the built files are there — this suite checks WHICH file is served.
if (!defined('DCC_CHECKOUT_DIR')) { define('DCC_CHECKOUT_DIR', __DIR__ . '/../../dcc-custom-checkout/'); }
if (!defined('DCC_CHECKOUT_VERSION')) { define('DCC_CHECKOUT_VERSION', 'test'); }

// Assets carries asset_url(), which Guest_Count_Script calls (v0.34.2). In
// WordPress the autoloader resolves that; here the order is explicit.
// v0.35.0 — Assets::enqueue() asks Layout whether this request gets the new
// layout's stylesheet, so the gate has to be loadable here too.
require_once __DIR__ . '/../../dcc-custom-checkout/includes/class-layout.php';
// v0.35.0 — Assets names the layout script as the dropdown list's
// dependency when the layout is on, so that class is loadable here too.
require_once __DIR__ . '/../../dcc-custom-checkout/includes/class-layout-script.php';
require_once __DIR__ . '/../../dcc-custom-checkout/includes/class-assets.php';
require_once __DIR__ . '/../../dcc-custom-checkout/includes/class-guest-count-script.php';

$fail = 0; $pass = 0;
function check($name, $actual, $expected) {
    global $fail, $pass;
    $ok = $actual === $expected;
    $ok ? $pass++ : $fail++;
    echo ($ok ? 'PASS' : 'FAIL') . "  $name\n";
    if (!$ok) { echo '      expected: ' . json_encode($expected) . "\n      actual:   " . json_encode($actual) . "\n"; }
}

const H = 'dcc-checkout-guest-count';

function admin_screen(string $page, string $id, string $base = '', string $type = ''): void {
    $GLOBALS['scripts'] = []; $GLOBALS['localized'] = [];
    $_GET = $page === '' ? [] : ['page' => $page];
    $s = new WP_Screen(); $s->id = $id; $s->base = $base; $s->post_type = $type;
    $GLOBALS['screen'] = $s;
}

// Add New Booking, through admin_enqueue_scripts.
admin_screen('mphb_add_new_booking', 'admin_page_mphb_add_new_booking');
(new \DCC_Checkout\Admin_Fields())->enqueue('admin_page_mphb_add_new_booking');
check('Add New (admin_enqueue_scripts): the admin script loads — the guard on this test',
    isset($GLOBALS['scripts']['dcc-checkout-admin']), true);
check('Add New: guest-count.js is enqueued, in the HEAD, as the BUILT file (v0.34.2)',
    [isset($GLOBALS['scripts'][H]), $GLOBALS['scripts'][H]['footer'] ?? null,
     basename($GLOBALS['scripts'][H]['src'] ?? '')], [true, false, 'guest-count.min.js']);
check('Add New: with its config — the included guests and the site\'s words',
    [$GLOBALS['localized'][H][0] ?? null, $GLOBALS['localized'][H][1]['includedGuests'] ?? null,
     $GLOBALS['localized'][H][1]['i18n']['guestsRequired'] ?? null],
    ['DCC_GUEST_COUNT', 2, 'Please select the number of guests.']);
check('Add New: the guest checkout\'s dropdown list is NOT loaded there (guest checkout only)',
    isset($GLOBALS['scripts']['dcc-checkout-select-list']), false);
check('Add New: the admin script is told it is Add New',
    $GLOBALS['localized']['dcc-checkout-admin'][1]['flow'] ?? null, 'add-new');

// Add New, through MotoPress's checkout-step hook (the comment in
// Admin_Fields::register() says this is the path that loads on the wizard).
admin_screen('mphb_add_new_booking', 'admin_page_mphb_add_new_booking');
$m = new ReflectionMethod(\DCC_Checkout\Admin_Fields::class, 'enqueue_assets');
$m->setAccessible(true);
$m->invoke(new \DCC_Checkout\Admin_Fields());
check('Add New (mphb_cb_checkout_form path, enqueue_assets): guest-count.js is enqueued too',
    isset($GLOBALS['scripts'][H]), true);

// Edit Accommodations: left as MotoPress draws it.
admin_screen('mphb_edit_booking', 'admin_page_mphb_edit_booking');
(new \DCC_Checkout\Admin_Fields())->enqueue('admin_page_mphb_edit_booking');
check('Edit Accommodations: the admin script loads (guard) but guest-count.js does NOT',
    [isset($GLOBALS['scripts']['dcc-checkout-admin']), isset($GLOBALS['scripts'][H]),
     $GLOBALS['localized']['dcc-checkout-admin'][1]['flow'] ?? null], [true, false, 'edit-accommodations']);

// The booking edit screen (post.php).
admin_screen('', 'mphb_booking', 'post', 'mphb_booking');
(new \DCC_Checkout\Admin_Fields())->enqueue('post.php');
check('The booking edit screen: the admin script loads (guard) but guest-count.js does NOT',
    [isset($GLOBALS['scripts']['dcc-checkout-admin']), isset($GLOBALS['scripts'][H]),
     $GLOBALS['localized']['dcc-checkout-admin'][1]['flow'] ?? null], [true, false, '']);

// The guest checkout.
$GLOBALS['scripts'] = []; $GLOBALS['localized'] = []; $_GET = [];
$GLOBALS['is_admin'] = false;
$GLOBALS['can'] = false;   // a guest
$GLOBALS['filters']['dcc_checkout_is_checkout_page'] = true;
// v0.35.0 — Assets::enqueue() asks Layout whether this request gets the new
// layout's stylesheet, so the gate has to be loadable here too.
require_once __DIR__ . '/../../dcc-custom-checkout/includes/class-layout.php';
// v0.35.0 — Assets names the layout script as the dropdown list's
// dependency when the layout is on, so that class is loadable here too.
require_once __DIR__ . '/../../dcc-custom-checkout/includes/class-layout-script.php';
require_once __DIR__ . '/../../dcc-custom-checkout/includes/class-assets.php';
(new \DCC_Checkout\Assets())->enqueue();
check('The checkout: checkout.js loads (guard)', isset($GLOBALS['scripts']['dcc-checkout']), true);
check('The checkout: every asset a guest downloads is the BUILT one (v0.34.2)',
    [basename($GLOBALS['scripts']['dcc-checkout']['src'] ?? ''),
     basename($GLOBALS['scripts']['dcc-checkout-select-list']['src'] ?? ''),
     basename($GLOBALS['scripts'][H]['src'] ?? ''),
     basename($GLOBALS['styles']['dcc-checkout']['src'] ?? '')],
    ['checkout.min.js', 'select-list.min.js', 'guest-count.min.js', 'checkout.min.css']);
check('The checkout: guest-count.js in the footer, and checkout.js depends on it (so it runs first)',
    [isset($GLOBALS['scripts'][H]), $GLOBALS['scripts'][H]['footer'] ?? null,
     in_array(H, $GLOBALS['scripts']['dcc-checkout']['deps'] ?? [], true)], [true, true, true]);
check('The checkout: select-list.js (0.34.1, the site\'s own dropdown list) in the footer, after checkout.js',
    [isset($GLOBALS['scripts']['dcc-checkout-select-list']), $GLOBALS['scripts']['dcc-checkout-select-list']['footer'] ?? null,
     $GLOBALS['scripts']['dcc-checkout-select-list']['deps'] ?? null], [true, true, ['dcc-checkout']]);
check('The checkout: a guest is not told it is an administrator',
    $GLOBALS['localized'][H][1]['isAdmin'] ?? null, '');

// v0.35.0 — THE NEW LAYOUT'S STYLESHEET FOLLOWS THE GATE. With the switch off
// and no preview cookie, a guest downloads exactly what 0.34.2 served.
check('The checkout: the new layout\'s stylesheet is NOT served while the layout is off',
    isset($GLOBALS['styles']['dcc-checkout-layout']), false);

// And with the switch on, it is — after checkout.css, built like the rest.
$GLOBALS['styles'] = [];
$GLOBALS['opt']['dcc_checkout_settings']['layout_enabled'] = 1;
\DCC_Checkout\Config::flush_cache();
\DCC_Checkout\Layout::flush();
(new \DCC_Checkout\Assets())->enqueue();
check('The checkout: with the layout on, its stylesheet loads after checkout.css, built',
    [basename($GLOBALS['styles']['dcc-checkout-layout']['src'] ?? ''),
     $GLOBALS['styles']['dcc-checkout-layout']['deps'] ?? null],
    ['checkout-layout.min.css', ['dcc-checkout']]);

// v0.35.0 item 3 — THE SCRIPT ORDER IS A DEPENDENCY, NOT A COINCIDENCE.
// layout.js marks the short dropdowns `data-dcc-segmented` and select-list.js
// skips a marked select; if the list ran first there would be two controls on
// one field. With the layout ON the dependency is declared, and with it OFF it
// is not — nothing of today's checkout changes.
check('with the layout on, the dropdown list depends on the layout script (so it runs after)',
    $GLOBALS['scripts']['dcc-checkout-select-list']['deps'] ?? null,
    ['dcc-checkout', \DCC_Checkout\Layout_Script::HANDLE]);

$GLOBALS['scripts'] = [];
$GLOBALS['opt']['dcc_checkout_settings']['layout_enabled'] = 0;
\DCC_Checkout\Config::flush_cache();
\DCC_Checkout\Layout::flush();
(new \DCC_Checkout\Assets())->enqueue();
check('with the layout off, the dropdown list depends only on checkout.js, as in 0.34.2',
    $GLOBALS['scripts']['dcc-checkout-select-list']['deps'] ?? null, ['dcc-checkout']);

echo $fail ? "\n$fail failing\n" : "\nall passing ($pass)\n";
exit($fail ? 1 : 0);
