<?php
/**
 * Render the server-side landing (DCCS\Landing::html) for a data-config JSON read
 * from stdin. Used by dom-smoke 109 (server markup == the script's first render)
 * and by the live-page harness, which feeds it the config live's own PHP built.
 * Run: php tests/dump-config.php | php tests/render-landing.php
 */
define('ABSPATH', sys_get_temp_dir() . '/');
define('DCCS_DIR', __DIR__ . '/../dcc-cottage-selector/');
// WordPress's escapers, as core defines them for this purpose (quotes included).
if (!function_exists('esc_html')) {
    function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
}
if (!function_exists('esc_attr')) {
    function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
}
require DCCS_DIR . 'includes/class-landing.php';
$config = json_decode((string) stream_get_contents(STDIN), true);
echo \DCCS\Landing::html(is_array($config) ? $config : []);
