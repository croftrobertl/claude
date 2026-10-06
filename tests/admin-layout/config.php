<?php
/**
 * Prints the admin script's config exactly as Admin_Fields builds it, as JSON.
 *
 *     php tests/admin-layout/config.php [included_guests]
 *
 * The layout suite reads this instead of keeping its own copy of the group
 * list, so the test exercises the SHIPPED PHP: a renamed field, a reordered
 * group or a wrong `governed` flag in Admin_Fields::customer_layout() changes
 * what the browser sees, and the mutation runner can prove it.
 */
define('ABSPATH', __DIR__);

$GLOBALS['opt']     = [];
$GLOBALS['filters'] = [];
if (isset($argv[1]) && $argv[1] !== '') {
    $GLOBALS['opt']['dcc_checkout_settings'] = ['included_guests' => (int) $argv[1]];
}

function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
function apply_filters($hook, $value) {
    return array_key_exists($hook, $GLOBALS['filters']) ? $GLOBALS['filters'][$hook] : $value;
}
function add_action() {} function add_filter() {}
function __($t, $d = null) { return $t; }
function esc_html__($t, $d = null) { return $t; }
function sanitize_text_field($v) { return is_string($v) ? trim($v) : ''; }
function sanitize_key($v) { return is_string($v) ? strtolower(preg_replace('/[^a-z0-9_\-]/i', '', $v)) : ''; }
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function number_format_i18n($n, $d = 0) { return number_format((float) $n, (int) $d); }
function get_post_meta($id, $k, $s = false) { return ''; }
function get_posts($a = []) { return []; }
function get_post($id = null) { return null; }
function did_action($h) { return 0; }

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-admin-fields.php';

$m = new ReflectionMethod(\DCC_Checkout\Admin_Fields::class, 'script_config');
$m->setAccessible(true);
echo json_encode($m->invoke(new \DCC_Checkout\Admin_Fields()), JSON_UNESCAPED_UNICODE);
