<?php
/**
 * DCC Seasons — render the REAL Seasons settings page outside WordPress.
 *
 * Runs Settings::render_page() (and the Theme guide tab) against minimal
 * WordPress stubs and prints a standalone HTML document that links the
 * plugin's own CSS/JS by file path, so a headless browser can screenshot
 * the actual markup. It is not WP-admin: there is no admin chrome or
 * common.css, only the plugin's own styles on a WP-like base.
 *
 * Usage: php tools/render-settings.php [--tab=settings|guide] [--opt=json-file]
 *        [--assets-url=file:///…/dcc-seasons/]
 */
define('ABSPATH', 1);
$ROOT = realpath(getenv('DCC_ROOT') ?: (__DIR__ . '/../dcc-seasons'));   /* DCC_ROOT: render another build (before/after diffs) */
$args = [];
foreach (array_slice($argv, 1) as $a) { if (preg_match('/^--([a-z-]+)=(.*)$/', $a, $m)) { $args[$m[1]] = $m[2]; } }
define('DCC_SEASONS_VERSION', 'test');
define('DCC_SEASONS_URL', $args['assets-url'] ?? ('file://' . $ROOT . '/'));
define('DCC_SEASONS_FILE', $ROOT . '/dcc-seasons.php');
$_GET['page'] = 'dcc-seasons';
if (($args['tab'] ?? '') !== '') { $_GET['tab'] = $args['tab']; }
$GLOBALS['OPTIONS'] = [];
if (!empty($args['opt'])) { $GLOBALS['OPTIONS']['dcc_seasons_options'] = json_decode(file_get_contents($args['opt']), true); }
$GLOBALS['ENQ'] = ['style' => [], 'script' => [], 'inline' => []];

function __($s, $d = null) { return $s; }
function _x($s, $c, $d = null) { return $s; }
function _n($a, $b, $n, $d = null) { return $n == 1 ? $a : $b; }
function esc_html__($s, $d = null) { return htmlspecialchars($s, ENT_QUOTES); }
function esc_attr__($s, $d = null) { return htmlspecialchars($s, ENT_QUOTES); }
function esc_html_e($s, $d = null) { echo htmlspecialchars($s, ENT_QUOTES); }
function esc_attr_e($s, $d = null) { echo htmlspecialchars($s, ENT_QUOTES); }
function esc_html($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_attr($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_url($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_textarea($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function apply_filters($tag, $value) { return $value; }
/* Hooks are RECORDED, so the page's admin_notices (the plugin's own, e.g.
 * the old preview panel) print the way WordPress prints them. */
$GLOBALS['HOOKS'] = [];
function add_action($tag, $cb = null, $prio = 10) { $GLOBALS['HOOKS'][$tag][] = $cb; return true; }
function add_filter($tag, $cb = null, $prio = 10) { return true; }
function do_action($tag) { foreach ($GLOBALS['HOOKS'][$tag] ?? [] as $cb) { if (is_callable($cb)) { call_user_func($cb); } } }
function is_admin() { return true; }
function register_activation_hook() {} function register_deactivation_hook() {}
function sanitize_key($k) { return strtolower(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $k)); }
function sanitize_text_field($v) { return trim(strip_tags((string) $v)); }
function wp_unslash($v) { return $v; }
function absint($v) { return abs((int) $v); }
function wp_parse_args($a, $d) { return array_merge($d, is_array($a) ? $a : []); }
function get_option($k, $d = false) { return $GLOBALS['OPTIONS'][$k] ?? $d; }
function update_option($k, $v, $a = null) { $GLOBALS['OPTIONS'][$k] = $v; return true; }
function get_transient($k) { return false; } function delete_transient($k) { return true; }
function current_user_can($c) { return true; }
function current_time($f) { return $f === 'Y' ? (getenv('DCC_YEAR') ?: date('Y')) : date($f); }
function date_i18n($f, $ts = null) { return date($f, $ts ?? time()); }
function home_url($p = '') { return 'https://doracanalcourt.com' . $p; }
function admin_url($p = '') { return 'https://doracanalcourt.com/wp-admin/' . $p; }
function add_query_arg($k, $v = null, $u = null) {
    if (is_array($k)) { $u = $v; $q = $k; } else { $q = [$k => $v]; }
    return $u . (strpos((string) $u, '?') === false ? '?' : '&') . http_build_query($q);
}
function wp_nonce_url($u) { return $u; }
function checked($a, $b = true, $e = true) { $r = ((string) $a === (string) $b) ? ' checked="checked"' : ''; if ($e) { echo $r; } return $r; }
function selected($a, $b = true, $e = true) { $r = ((string) $a === (string) $b) ? ' selected="selected"' : ''; if ($e) { echo $r; } return $r; }
function settings_fields($g) { echo '<input type="hidden" name="option_page" value="' . esc_attr($g) . '">'; }
function submit_button() { echo '<p class="submit"><input type="submit" class="button button-primary" value="Save Changes"></p>'; }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f | JSON_UNESCAPED_SLASHES); }
function wp_enqueue_style($h, $src = '') { $GLOBALS['ENQ']['style'][$h] = $src; }
function wp_enqueue_script($h, $src = '') { $GLOBALS['ENQ']['script'][$h] = $src; }
function wp_add_inline_script($h, $js, $pos = 'after') { $GLOBALS['ENQ']['inline'][] = [$h, $js, $pos]; return true; }
function get_current_screen() { return (object) ['id' => 'dcc_page_dcc-seasons', 'base' => 'dcc_page_dcc-seasons']; }
function number_format_i18n($n) { return number_format($n); }

foreach (['class-menu', 'class-plugin', 'class-schedule', 'class-themes', 'class-settings', 'class-theme-guide', 'class-preview'] as $f) {
    if (is_file("$ROOT/includes/$f.php")) { require "$ROOT/includes/$f.php"; }
}
use DCC_Seasons\Settings;

/* the page hook, as add_submenu_page would set it */
$rp = new ReflectionProperty(Settings::class, 'hook');
$rp->setAccessible(true);
$rp->setValue(null, 'dcc_page_dcc-seasons');
Settings::assets('dcc_page_dcc-seasons');
if (class_exists('DCC_Seasons\\Preview')) { \DCC_Seasons\Preview::init(); }
ob_start();
/* WordPress prints admin_notices above the page content. */
echo '<div class="dcc-admin-notices">';
do_action('admin_notices');
echo '</div>';
Settings::render_page();
$body = ob_get_clean();

$head = '';
foreach ($GLOBALS['ENQ']['style'] as $h => $src) { $head .= '<link rel="stylesheet" id="' . $h . '-css" href="' . $src . '">' . "\n"; }
$foot = '';
foreach ($GLOBALS['ENQ']['inline'] as [$h, $js, $pos]) { if ($pos === 'before') { $foot .= "<script>$js</script>\n"; } }
foreach ($GLOBALS['ENQ']['script'] as $h => $src) {
    $foot .= '<script id="' . $h . '-js" src="' . $src . '"></script>' . "\n";
    foreach ($GLOBALS['ENQ']['inline'] as [$h2, $js, $pos]) { if ($h2 === $h && $pos === 'after') { $foot .= "<script>$js</script>\n"; } }
}
echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' .
    '<style>body{margin:0;background:#f0f0f1;color:#3c434a;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' .
    '.wrap{margin:10px 20px 0 2px;padding:0 10px}h1{font-size:23px;font-weight:400}h2{font-size:1.3em}code{background:rgba(0,0,0,.07);padding:3px 5px}' .
    '.widefat{border:1px solid #c3c4c7;background:#fff;border-spacing:0;width:100%}.widefat td,.widefat th{padding:8px 10px;text-align:left}' .
    '.striped>tbody>:nth-child(odd){background:#f6f7f7}.description{color:#646970}.form-table th{width:200px;text-align:left;vertical-align:top;padding:15px 10px 15px 0}' .
    '.nav-tab-wrapper{border-bottom:1px solid #c3c4c7;margin:0 0 12px}.nav-tab{display:inline-block;border:1px solid #c3c4c7;border-bottom:none;margin-left:.5em;padding:5px 10px;font-size:14px;line-height:1.71;font-weight:600;background:#dcdcde;color:#50575e;text-decoration:none}.nav-tab-active{background:#f0f0f1;color:#000;border-bottom:1px solid #f0f0f1;margin-bottom:-1px}' .
    'a{color:#2271b1}@media (max-width:782px){.wrap{margin-right:10px}}</style>' . "\n" . $head . '</head><body class="wp-admin">' . $body . $foot . '</body></html>';
