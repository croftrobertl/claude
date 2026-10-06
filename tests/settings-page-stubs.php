<?php
/**
 * Minimal WordPress for the settings page, shared by test-settings-page.php and
 * dump-settings-page.php. Where a stub stands in for a core function whose OUTPUT
 * a test reads (settings_errors, add_query_arg, wp_parse_url) it reproduces
 * core's behaviour, not just its signature.
 *
 * Plugin root: $GLOBALS['__dccs_dir'] or ../dcc-cottage-selector/.
 */
namespace {
    define('ABSPATH', sys_get_temp_dir() . '/');
    $dir = $GLOBALS['__dccs_dir'] ?? (dirname(__DIR__) . '/dcc-cottage-selector/');
    define('DCCS_DIR', $dir);
    define('DCCS_URL', 'https://example.test/wp-content/plugins/dcc-cottage-selector/');
    define('DCCS_VERSION', 'test');

    final class WPRedirect extends \Exception { public string $to; public function __construct(string $to) { parent::__construct($to); $this->to = $to; } }
    final class WPDie extends \Exception {}

    $GLOBALS['__opts'] = []; $GLOBALS['__hooks'] = []; $GLOBALS['__calls'] = [];
    $GLOBALS['__cap'] = true; $GLOBALS['__ref'] = false; $GLOBALS['__site'] = 'https://example.test';
    $GLOBALS['__admin_path'] = '/wp-admin/'; $GLOBALS['wp_settings_errors'] = []; $GLOBALS['__scripts'] = [];

    function __($t, $d = null) { return $t; }
    function esc_html__($t, $d = null) { return htmlspecialchars($t, ENT_QUOTES); }
    function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
    function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
    function esc_url($u) { return htmlspecialchars((string) $u, ENT_QUOTES); }
    function esc_url_raw($u) { return (string) $u; }
    function wp_unslash($v) { return $v; }
    function selected($a, $b, $echo = true) { return (string) $a === (string) $b ? ' selected="selected"' : ''; }
    function submit_button() { echo '<p class="submit"><input type="submit" name="submit" id="submit" class="button button-primary" value="Save Changes"></p>'; }
    function wp_nonce_field($a, $n) { echo '<input type="hidden" id="' . $n . '" name="' . $n . '" value="nonce"><input type="hidden" name="_wp_http_referer" value="/wp-admin/admin.php?page=dcc-cottage-selector">'; }
    function current_user_can($c) { $GLOBALS['__calls'][] = 'cap'; return $GLOBALS['__cap']; }
    function check_admin_referer($a, $n) { $GLOBALS['__calls'][] = 'nonce'; return 1; }
    function wp_die($m = '', $t = '', $a = []) { throw new WPDie((string) $m); }
    function get_option($k, $d = false) { return $GLOBALS['__opts'][$k] ?? $d; }
    function update_option($k, $v, $a = null) { $GLOBALS['__calls'][] = 'update'; $GLOBALS['__opts'][$k] = $v; return true; }
    function admin_url($p = '') { return $GLOBALS['__site'] . $GLOBALS['__admin_path'] . ltrim($p, '/'); }
    function wp_get_referer() { return $GLOBALS['__ref']; }
    function wp_safe_redirect($to, $status = 302) { throw new WPRedirect($to); }
    function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
    function add_action($h, $cb, $p = 10, $n = 1) { $GLOBALS['__hooks'][$h][] = $cb; }
    function add_filter($h, $cb, $p = 10, $n = 1) { $GLOBALS['__hooks'][$h][] = $cb; }
    function apply_filters($h, $v) { foreach ($GLOBALS['__hooks'][$h] ?? [] as $cb) { $v = $cb($v); } return $v; }
    function wp_enqueue_script($h, $src = '', $deps = [], $ver = false, $footer = false) { $GLOBALS['__scripts'][$h] = compact('src', 'footer'); }
    function add_submenu_page(...$a) { return 'dcc_page_dcc-cottage-selector'; }
    function add_options_page(...$a) { return 'settings_page_dcc-cottage-selector'; }

    // core add_query_arg(array $args, string $url): existing args kept, new ones merged over them.
    function add_query_arg(array $args, string $url) {
        $p = parse_url($url); $q = [];
        if (isset($p['query'])) { parse_str($p['query'], $q); }
        $q = array_merge($q, $args);
        $base = strtok($url, '?');
        return $base . ($q ? '?' . http_build_query($q) : '');
    }
    // core add_settings_error / settings_errors markup (wp-admin/includes/template.php, 6.x).
    function add_settings_error($setting, $code, $message, $type = 'error') {
        $GLOBALS['wp_settings_errors'][] = compact('setting', 'code', 'message', 'type');
    }
    function settings_errors($setting = '', $sanitize = false, $hide_on_update = false) {
        $out = '';
        foreach ($GLOBALS['wp_settings_errors'] as $d) {
            if ($setting !== '' && $d['setting'] !== $setting) { continue; }
            $type = $d['type'] === 'updated' ? 'success' : $d['type'];
            $id = 'setting-error-' . $d['code'];
            $cls = 'notice notice-' . $type . ' settings-error is-dismissible';
            $out .= "<div id='$id' class='$cls'> \n<p><strong>{$d['message']}</strong></p></div> \n";
        }
        echo $out;
    }

    foreach (['settings', 'menu', 'settings-page'] as $f) { require DCCS_DIR . "includes/class-$f.php"; }
}
