<?php
/**
 * Print exactly what render_source_guide() puts in front of the widget, for a
 * given source CSS file, post id and element id. Used by the browser suite so
 * the page under test consumes the plugin's REAL emitted markup instead of a
 * hand-written approximation of it — the gap that let a version ship where the
 * CSS was generated correctly and then silently thrown away.
 *
 *   php tests/_emit-source-css.php <css-file> <post-id> <element-id> [--twice]
 */
define('ABSPATH', '/tmp/');
define('DCCGG_VERSION', 'test');
define('MINUTE_IN_SECONDS', 60);
function __($s, $d = null) { return $s; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_html($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_attr($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_url($s) { return (string) $s; }
function esc_url_raw($s) { return (string) $s; }
function add_action(...$a) {}
function add_filter(...$a) {}
function add_shortcode(...$a) {}
function register_activation_hook(...$a) {}
function register_deactivation_hook(...$a) {}
function plugin_dir_path($f) { return __DIR__ . '/../dcc-guest-guide/'; }
function plugin_dir_url($f) { return 'https://doracanalcourt.com/wp-content/plugins/dcc-guest-guide/'; }
function plugin_basename($f) { return 'dcc-guest-guide/dcc-guest-guide.php'; }
require __DIR__ . '/_elementor-stub.php';
require __DIR__ . '/../dcc-guest-guide/includes/class-plugin.php';

$css     = (string) file_get_contents($argv[1]);
$postId  = (int) $argv[2];
$element = (string) $argv[3];
$scoped  = \DCCGG\Plugin::rescope_element_css($css, $postId, $element);
echo \DCCGG\Plugin::source_css_style_tag($postId, $scoped);
if (in_array('--twice', $argv, true)) {
    // Second call for the same source: a page with two public guides must not
    // print the block (or its id) twice.
    echo \DCCGG\Plugin::source_css_style_tag($postId, $scoped);
}
