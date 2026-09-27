<?php
/**
 * Print the REAL markup render_item() emits for the credential-row cases, so
 * the browser suite measures what ships instead of a hand-built copy of it.
 * (v0.23.1: a hand-built Network row with a Copy button in it — a structure
 * the plugin has not emitted since v0.16.0 — was mistaken for a live defect.)
 *
 *   php tests/_emit-wifi-item.php <case>   case: wifi | masked | plain
 */
define('ABSPATH', '/tmp/');
define('DCCGG_VERSION', 'test');

// Minimal WP surface used by the code under test.
function __($s, $d = null) { return $s; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_html($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_attr($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function wp_strip_all_tags($s) { return strip_tags((string) $s); }
function wp_kses_post($s) { return $s; }
function do_shortcode($s) { return $s; }
function apply_filters($t, $v) { return $v; }
function mb_substr_compat($s, $a, $b) { return mb_substr($s, $a, $b); }
// v0.13.0: scenario N renders real item markup, which reaches a little more of
// the WP surface. Each stub is the identity/plain-text behaviour of the real
// function, so none of them can manufacture a pass.
function wpautop($s) { return (string) $s; }
function esc_url($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_url_raw($s) { return (string) $s; }
function sanitize_html_class($s) { return preg_replace('/[^A-Za-z0-9_-]/', '', (string) $s); }
function wp_unique_id($p = '') { static $i = 0; return $p . (++$i); }
function absint($n) { return abs((int) $n); }

require __DIR__ . '/_elementor-stub.php';
// v0.23.0: the renderer and the handlers read plugin settings.
if (!function_exists('get_option'))    { function get_option($k, $d = false) { return $GLOBALS['options'][$k] ?? $d; } }
if (!function_exists('update_option')) { function update_option($k, $v, $a = null) { $GLOBALS['options'][$k] = $v; return true; } }
if (!function_exists('did_action'))    { function did_action($h) { return 0; } }
require __DIR__ . '/../dcc-guest-guide/includes/class-settings.php';

require __DIR__ . '/../dcc-guest-guide/includes/class-widget.php';

$items = [
    // Wi-Fi mode + mask: the Network / Password pair the live Internet section uses.
    'wifi'   => ['_id' => 'a1b2c3', 'item_section' => 'wifi', 'item_title' => 'Wifi',
                 'item_content' => '<p>Join the cottage network.</p>',
                 'item_copy' => 'yes', 'item_copy_value' => 'DCC32586', 'item_mask_value' => 'yes',
                 'item_wifi_mode' => 'yes', 'wifi_ssid' => 'topoftheworld'],
    // Mask without Wi-Fi mode: "Password: •••• [Show] [Copy]" in the utils row.
    'masked' => ['_id' => 'd4e5f6', 'item_section' => 'wifi', 'item_title' => 'Lockbox',
                 'item_content' => '<p>The key is in the lockbox.</p>',
                 'item_copy' => 'yes', 'item_copy_value' => '4821', 'item_mask_value' => 'yes'],
    // Unmasked Copy: an ordinary action button, full reference size by design.
    'plain'  => ['_id' => 'g7h8i9', 'item_section' => 'wifi', 'item_title' => 'Address',
                 'item_content' => '<p>Our address.</p>',
                 'item_copy' => 'yes', 'item_copy_value' => '1 Canal Ct'],
];
$case = $argv[1] ?? 'wifi';
$w = (new ReflectionClass('\DCCGG\Widget'))->newInstanceWithoutConstructor();
$m = new ReflectionMethod('\DCCGG\Widget', 'render_item');
$m->setAccessible(true);
$m->invoke($w, $items[$case], ['str_copy' => 'Copy Password', 'str_directions' => 'Directions'], false, false, 0, 'wifi');
