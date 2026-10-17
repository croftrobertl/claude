<?php
/**
 * Prints the URL the shipped Assets::asset_url() chooses, as JSON.
 *
 *     php tests/minify/url.php <debug 0|1> [missing-min 0|1] [force-source 0|1]
 *
 * SCRIPT_DEBUG is a constant, so each state needs its own process — which is
 * also how WordPress meets it. Run by tests/minify/run.php.
 */
define('ABSPATH', __DIR__);
$debug   = (bool) ($argv[1] ?? 0);
$missing = (bool) ($argv[2] ?? 0);
$force   = (bool) ($argv[3] ?? 0);
if ($debug) {
    define('SCRIPT_DEBUG', true);
}

define('DCC_CHECKOUT_VERSION', 'test');
define('DCC_CHECKOUT_FILE', __FILE__);
// `missing` points the plugin at a directory with no built files in it, which
// is a plugin folder copied without the build output.
define('DCC_CHECKOUT_DIR', $missing ? sys_get_temp_dir() . '/dcc-no-build/' : dirname(__DIR__, 2) . '/dcc-custom-checkout/');
define('DCC_CHECKOUT_URL', 'https://example.test/wp-content/plugins/dcc-custom-checkout/');

$GLOBALS['force'] = $force;
function add_filter() {}
function add_action() {}
function __($t, $d = null) { return $t; }
function get_option($k, $d = false) { return $d; }
function apply_filters($hook, $value, ...$rest) {
    if ($hook === 'dcc_checkout_use_minified_assets' && $GLOBALS['force']) {
        return false;   // a site that insists on the sources
    }
    return $value;
}

require dirname(__DIR__, 2) . '/dcc-custom-checkout/includes/class-config.php';
require dirname(__DIR__, 2) . '/dcc-custom-checkout/includes/class-assets.php';

$out = [];
foreach (['assets/checkout.js', 'assets/checkout.css', 'assets/guest-count.js', 'assets/select-list.js'] as $rel) {
    $out[$rel] = basename(\DCC_Checkout\Assets::asset_url($rel));
}
echo json_encode($out);
