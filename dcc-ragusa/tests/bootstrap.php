<?php
/**
 * Test bootstrap: enough WordPress to run Ragusa's real code against a
 * synthetic site on disk, an in-memory SQLite $wpdb, and recorders for
 * mail, HTTP, cron and options. No real guest data anywhere.
 */

declare(strict_types=1);

error_reporting(E_ALL);
set_error_handler(static function (int $no, string $str, string $file, int $line): bool {
    if (!(error_reporting() & $no)) {
        return false;
    }
    throw new ErrorException($str, 0, $no, $file, $line);
});

define('DCCR_TESTING', true);
define('DCCR_TEST_ROOT', sys_get_temp_dir() . '/dccr-tests-' . getmypid());
define('ABSPATH', DCCR_TEST_ROOT . '/site/');
define('WP_CONTENT_DIR', ABSPATH . 'wp-content');
define('WP_PLUGIN_DIR', WP_CONTENT_DIR . '/plugins');
define('WPMU_PLUGIN_DIR', WP_CONTENT_DIR . '/mu-plugins');
define('WPINC', 'wp-includes');
define('WP_DEBUG', false);
define('ARRAY_A', 'ARRAY_A');
define('OBJECT', 'OBJECT');
define('E_USER_DEPRECATED_X', 0);

putenv('HOME=' . DCCR_TEST_ROOT . '/home');
@mkdir(DCCR_TEST_ROOT . '/home', 0700, true);
@mkdir(ABSPATH, 0755, true);

require_once __DIR__ . '/lib/wpdb.php';

$GLOBALS['wp_version']    = '7.1.3';
$GLOBALS['table_prefix']  = 'wpstg0_';
$GLOBALS['dccr_home_url'] = 'https://doracanalcourt.com/staging/';
$GLOBALS['wpdb']          = new Test_WPDB('wpstg0_');
$GLOBALS['dccr_options']  = [];
$GLOBALS['dccr_autoload'] = [];
$GLOBALS['dccr_mail']     = [];
$GLOBALS['dccr_http']     = [];
$GLOBALS['dccr_http_handler'] = null;
$GLOBALS['dccr_cron']     = [];
$GLOBALS['dccr_hooks']    = [];
$GLOBALS['dccr_users']    = [];
$GLOBALS['dccr_app_passwords'] = [];
$GLOBALS['dccr_core_checksums'] = null;
$GLOBALS['dccr_core_updates']  = [];
$GLOBALS['dccr_jetpack_modules'] = ['waf' => true, 'protect' => true, 'monitor' => true];
$GLOBALS['dccr_doing_cron'] = true;
$GLOBALS['pagenow']       = 'index.php';
$GLOBALS['admin_page_hooks'] = [];

/** Make this a live site (emails and pings allowed) or staging. */
function dccr_test_site(string $role): void
{
    if ($role === 'live') {
        $GLOBALS['table_prefix']  = 'portal_';
        $GLOBALS['dccr_home_url'] = 'https://doracanalcourt.com/';
    } else {
        $GLOBALS['table_prefix']  = 'wpstg0_';
        $GLOBALS['dccr_home_url'] = 'https://doracanalcourt.com/staging/';
    }
    $GLOBALS['wpdb']->prefix = $GLOBALS['table_prefix'];
    if (class_exists('DCCR\\Schema', false)) {
        DCCR\Schema::ensure();
    }
}

// ----------------------------------------------------------------- options

function get_option(string $name, $default = false)
{
    return array_key_exists($name, $GLOBALS['dccr_options']) ? $GLOBALS['dccr_options'][$name] : $default;
}
function add_option(string $name, $value = '', string $deprecated = '', $autoload = 'yes'): bool
{
    if (array_key_exists($name, $GLOBALS['dccr_options'])) {
        return false;
    }
    $GLOBALS['dccr_options'][$name]  = $value;
    $GLOBALS['dccr_autoload'][$name] = ($autoload === 'yes' || $autoload === true) ? 'yes' : 'no';
    return true;
}
function update_option(string $name, $value, $autoload = null): bool
{
    if (!array_key_exists($name, $GLOBALS['dccr_options'])) {
        return add_option($name, $value, '', $autoload ?? 'yes');
    }
    $GLOBALS['dccr_options'][$name] = $value;
    if ($autoload !== null) {
        $GLOBALS['dccr_autoload'][$name] = ($autoload === 'yes' || $autoload === true) ? 'yes' : 'no';
    }
    return true;
}
function delete_option(string $name): bool
{
    unset($GLOBALS['dccr_options'][$name], $GLOBALS['dccr_autoload'][$name]);
    return true;
}

// -------------------------------------------------------------- i18n & esc

function __(string $t, string $d = ''): string { return $t; }
function _x(string $t, string $c, string $d = ''): string { return $t; }
function _n(string $s, string $p, $n, string $d = ''): string { return (int) $n === 1 ? $s : $p; }
function esc_html(string $t): string { return htmlspecialchars($t, ENT_QUOTES, 'UTF-8'); }
function esc_attr(string $t): string { return htmlspecialchars($t, ENT_QUOTES, 'UTF-8'); }
function esc_url(string $u): string { return htmlspecialchars($u, ENT_QUOTES, 'UTF-8'); }
function esc_html__(string $t, string $d = ''): string { return esc_html($t); }
function esc_attr__(string $t, string $d = ''): string { return esc_attr($t); }
function esc_html_e(string $t, string $d = ''): void { echo esc_html($t); }
function esc_attr_e(string $t, string $d = ''): void { echo esc_attr($t); }
function load_plugin_textdomain(...$a): bool { return true; }
function sanitize_key(string $k): string { return strtolower(preg_replace('/[^a-z0-9_\-]/i', '', $k) ?? ''); }
function sanitize_text_field(string $t): string { return trim(strip_tags($t)); }
function sanitize_email(string $e): string { return trim($e); }
function sanitize_html_class(string $c): string { return preg_replace('/[^A-Za-z0-9_-]/', '', $c) ?? ''; }
function is_email(string $e): bool { return (bool) filter_var($e, FILTER_VALIDATE_EMAIL); }
function wp_unslash($v) { return $v; }
function checked($a, $b = true, bool $echo = true): string { $s = ($a == $b) ? ' checked="checked"' : ''; if ($echo) { echo $s; } return $s; }
function wp_json_encode($v, int $flags = 0, int $depth = 512) { return json_encode($v, $flags, $depth); }
function wp_parse_url(string $u, int $c = -1) { return $c === -1 ? parse_url($u) : parse_url($u, $c); }
function number_format_i18n($n, int $d = 0): string { return number_format((float) $n, $d); }

// ----------------------------------------------------------------- urls

function home_url(string $path = ''): string { return rtrim($GLOBALS['dccr_home_url'], '/') . '/' . ltrim($path, '/'); }
function site_url(string $path = ''): string { return home_url($path); }
function admin_url(string $path = ''): string { return home_url('wp-admin/' . ltrim($path, '/')); }
function add_query_arg(...$args): string
{
    if (is_array($args[0])) {
        $params = $args[0];
        $url    = $args[1];
    } else {
        $params = [$args[0] => $args[1]];
        $url    = $args[2];
    }
    $sep = str_contains($url, '?') ? '&' : '?';
    return $url . $sep . http_build_query($params);
}
function get_locale(): string { return 'en_US'; }
function get_bloginfo(string $k = ''): string { return 'UTF-8'; }
function plugin_basename(string $f): string { return 'dcc-ragusa/dcc-ragusa.php'; }
function plugin_dir_url(string $f): string { return home_url('wp-content/plugins/dcc-ragusa/'); }

// ----------------------------------------------------------------- hooks

function add_action(string $h, $cb, int $p = 10, int $a = 1): bool { $GLOBALS['dccr_hooks'][$h][] = [$cb, $p]; return true; }
function add_filter(string $h, $cb, int $p = 10, int $a = 1): bool { return add_action($h, $cb, $p, $a); }
function do_action(string $h, ...$args): void { foreach ($GLOBALS['dccr_hooks'][$h] ?? [] as [$cb, $p]) { $cb(...$args); } }
function apply_filters(string $h, $v, ...$args) { foreach ($GLOBALS['dccr_hooks'][$h] ?? [] as [$cb, $p]) { $v = $cb($v, ...$args); } return $v; }
function register_activation_hook(string $f, $cb): void { $GLOBALS['dccr_hooks']['activate'][] = [$cb, 10]; }
function register_deactivation_hook(string $f, $cb): void { $GLOBALS['dccr_hooks']['deactivate'][] = [$cb, 10]; }
function is_admin(): bool { return (bool) ($GLOBALS['dccr_is_admin'] ?? false); }
function wp_doing_cron(): bool { return (bool) ($GLOBALS['dccr_doing_cron'] ?? false); }
function current_user_can(string $c): bool { return true; }
function wp_cache_flush(): bool { $GLOBALS['dccr_cache_flushed'] = ($GLOBALS['dccr_cache_flushed'] ?? 0) + 1; return true; }
function wp_nonce_field(...$a): string { return '<input type="hidden" name="_dccr_nonce" value="test">'; }
function check_admin_referer(...$a): bool { return true; }
function wp_safe_redirect(string $url): void { throw new RuntimeException('redirect:' . $url); }
function wp_die($m = ''): void { throw new RuntimeException('wp_die:' . (string) $m); }
function status_header(int $c): void {}
function _get_cron_array(): array { return $GLOBALS['dccr_cron_array'] ?? []; }
function wp_get_theme() { return new class { public function get_stylesheet(): string { return 'bravada'; } public function get(string $k): string { return '1.2.0'; } }; }

// ------------------------------------------------------------------ cron

function wp_schedule_single_event(int $ts, string $hook, array $args = []): bool { $GLOBALS['dccr_cron'][] = ['ts' => $ts, 'hook' => $hook, 'args' => $args]; return true; }
function wp_schedule_event(int $ts, string $rec, string $hook, array $args = []): bool { $GLOBALS['dccr_cron'][] = ['ts' => $ts, 'hook' => $hook, 'args' => $args, 'recurrence' => $rec]; return true; }
function wp_next_scheduled(string $hook, array $args = []) { foreach ($GLOBALS['dccr_cron'] as $e) { if ($e['hook'] === $hook) { return $e['ts']; } } return false; }
function wp_unschedule_hook(string $hook): int { $n = 0; foreach ($GLOBALS['dccr_cron'] as $i => $e) { if ($e['hook'] === $hook) { unset($GLOBALS['dccr_cron'][$i]); $n++; } } return $n; }

// ------------------------------------------------------------------ http

class WP_Error
{
    public function __construct(public string $code = '', public string $message = '', public $data = null) {}
    public function get_error_message(): string { return $this->message; }
    public function get_error_code(): string { return $this->code; }
}
function is_wp_error($t): bool { return $t instanceof WP_Error; }
function wp_remote_request(string $url, array $args = [])
{
    $GLOBALS['dccr_http'][] = ['url' => $url, 'args' => $args];
    $h = $GLOBALS['dccr_http_handler'];
    if (is_callable($h)) {
        $r = $h($url, $args);
        if ($r !== null) {
            if (!is_wp_error($r) && !empty($args['stream']) && !empty($args['filename'])) {
                file_put_contents($args['filename'], (string) ($r['body'] ?? ''));
                $r['body'] = '';
            }
            return $r;
        }
    }
    return new WP_Error('http_request_failed', 'no test handler for ' . $url);
}
function wp_remote_get(string $url, array $args = []) { return wp_remote_request($url, $args); }
function wp_remote_post(string $url, array $args = []) { $args['method'] = 'POST'; return wp_remote_request($url, $args); }
function wp_remote_retrieve_response_code($r): int { return is_array($r) ? (int) ($r['response']['code'] ?? 0) : 0; }
function wp_remote_retrieve_body($r): string { return is_array($r) ? (string) ($r['body'] ?? '') : ''; }
function dccr_http_ok(string $body = 'OK', int $code = 200): array { return ['response' => ['code' => $code], 'body' => $body]; }

// ------------------------------------------------------------------ mail

function wp_mail($to, string $subject, string $body, $headers = []): bool
{
    $GLOBALS['dccr_mail'][] = ['to' => $to, 'subject' => $subject, 'body' => $body, 'headers' => $headers];
    return !($GLOBALS['dccr_mail_fails'] ?? false);
}

// --------------------------------------------------------------- plugins

function get_plugins(string $folder = ''): array
{
    $out = [];
    foreach ((array) glob(WP_PLUGIN_DIR . '/*', GLOB_ONLYDIR) as $dir) {
        foreach ((array) glob($dir . '/*.php') as $file) {
            $data = get_plugin_data($file);
            if ($data['Name'] !== '') {
                $out[basename($dir) . '/' . basename($file)] = $data;
                break;
            }
        }
    }
    ksort($out);
    return $out;
}
function get_plugin_data(string $file, bool $markup = true, bool $translate = true): array
{
    $head = (string) @file_get_contents($file, false, null, 0, 8192);
    $name = preg_match('/Plugin Name:\s*(.+)/', $head, $m) ? trim($m[1]) : '';
    $ver  = preg_match('/Version:\s*(.+)/', $head, $m) ? trim($m[1]) : '';
    return ['Name' => $name, 'Version' => $ver];
}
function is_plugin_active(string $p): bool { return in_array($p, (array) get_option('active_plugins', []), true); }
function activate_plugin(string $p) { $a = (array) get_option('active_plugins', []); if (!in_array($p, $a, true)) { $a[] = $p; update_option('active_plugins', $a); } return null; }
function deactivate_plugins($p): void { $a = (array) get_option('active_plugins', []); update_option('active_plugins', array_values(array_diff($a, (array) $p))); }
function wp_clean_plugins_cache(bool $c = true): void {}
function wp_update_plugins(): void {}
function get_core_checksums(string $v, string $l) { return $GLOBALS['dccr_core_checksums']; }
function get_core_updates(): array { return $GLOBALS['dccr_core_updates']; }
function wp_upload_dir($t = null, bool $c = true): array { return ['basedir' => WP_CONTENT_DIR . '/uploads']; }
function dbDelta(string $sql): array { $GLOBALS['wpdb']->db_delta($sql); return []; }

// ----------------------------------------------------------------- users

function get_users(array $args = []): array
{
    $out = [];
    foreach ($GLOBALS['dccr_users'] as $u) {
        if (!empty($args['role__in']) && array_intersect($args['role__in'], $u['roles']) === []) {
            continue;
        }
        $out[] = (object) ['ID' => $u['ID'], 'user_login' => $u['login'], 'roles' => $u['roles']];
    }
    return $out;
}
function count_users(): array { return ['total_users' => count($GLOBALS['dccr_users'])]; }
class WP_Application_Passwords
{
    public static function get_user_application_passwords(int $id): array { return $GLOBALS['dccr_app_passwords'][$id] ?? []; }
}
class Jetpack
{
    public static function is_module_active(string $m): bool { return (bool) ($GLOBALS['dccr_jetpack_modules'][$m] ?? false); }
}

// --------------------------------------------------------------- load it

require_once dirname(__DIR__) . '/dcc-ragusa.php';
