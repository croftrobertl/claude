<?php
/**
 * THE PLUGIN'S admin-ajax ENDPOINTS, OFFLINE (0.47.4; staff since 0.48.0).
 *
 *   MPHBAC_FIXTURE_0474=<mode> php tests/render/ajax.php <plugin_dir> <post body>
 *
 * Boots the site as render.php does (boot.php, with fixture-0474.php's
 * database and rules), puts the urlencoded POST body in $_POST and runs the
 * plugin's real handler for its action: mphbac_query → Ajax::handle(),
 * mphbac_staff_<ep> → Staff::handle_<ep>(). Prints the JSON body WordPress
 * would send; the HTTP status goes to stderr as "STATUS <code>[ nonce]"
 * (the nonce header the board reads on a stale token). The browser tests
 * route the page's admin-ajax.php requests here, end to end.
 *
 * Environment, for the staff endpoints (0.48.0):
 *   MPHBAC_GATE=closed      the staff password cookie is not held
 *   MPHBAC_LOGGED_IN=1      a logged-in manager instead of the cookie
 *   MPHBAC_METHOD=GET       the request's method (POST by default)
 *   MPHBAC_STATE=<file>     the plugin's mphbac_ready_* options, kept
 *                           between requests (each request is a process)
 *   MPHBAC_SQL_LOG=<file>   every SQL statement run is appended here
 * The nonce is "nonce" (boot.php's wp_create_nonce); anything else fails.
 */
[$self, $dir, $body] = $argv + [null, null, ''];
if (getenv('MPHBAC_GATE') === 'closed') {
    function post_password_required($p = null) { return true; }
}
if (getenv('MPHBAC_LOGGED_IN') === '1') {
    $GLOBALS['r_staff_user'] = true;
}
require __DIR__ . '/boot.php';

$GLOBALS['__status'] = 200;
function wp_send_json_success($d = null, $code = null) { echo json_encode(['success' => true, 'data' => $d]); exit(0); }
function wp_send_json_error($d = null, $code = null) { $GLOBALS['__status'] = $code ?: 200; echo json_encode(['success' => false, 'data' => $d]); exit(0); }
function status_header($code) { $GLOBALS['__status'] = (int) $code; }
if (!function_exists('wp_verify_nonce')) { function wp_verify_nonce($n, $a = -1) { return $n === 'nonce' ? 1 : false; } }
if (!function_exists('nocache_headers')) { function nocache_headers() {} }
if (!function_exists('wp_unslash')) { function wp_unslash($v) { return $v; } }
if (!function_exists('update_meta_cache')) { function update_meta_cache($t, $ids) { return true; } }
if (!function_exists('_prime_post_caches')) { function _prime_post_caches($ids, $a = true, $b = true) {} }
if (!function_exists('get_userdata')) { function get_userdata($id) { return false; } }
if (!function_exists('get_edit_post_link')) { function get_edit_post_link($id, $c = '') { return ''; } }

$state = (string) getenv('MPHBAC_STATE');
if ($state !== '' && is_file($state)) {
    foreach ((array) json_decode((string) file_get_contents($state), true) as $k => $v) {
        $GLOBALS['t_options'][$k] = $v;
    }
}
register_shutdown_function(static function () use ($state): void {
    if ($state !== '') {
        $keep = array_filter($GLOBALS['t_options'], static fn($k) => strncmp((string) $k, 'mphbac_ready_', 13) === 0, ARRAY_FILTER_USE_KEY);
        file_put_contents($state, json_encode($keep));
    }
    if (($log = (string) getenv('MPHBAC_SQL_LOG')) !== '' && isset($GLOBALS['wpdb']->log)) {
        file_put_contents($log, implode("\n;;\n", $GLOBALS['wpdb']->log) . "\n;;\n", FILE_APPEND);
    }
    $nonce = $GLOBALS['__status'] === 403 && \MPHBAC\Staff::is_authorized() ? ' nonce' : '';
    fwrite(STDERR, 'STATUS ' . $GLOBALS['__status'] . $nonce . "\n");
});

parse_str((string) $body, $post);
$_POST = $post;
$_REQUEST = $post;
$_SERVER['REQUEST_METHOD'] = getenv('MPHBAC_METHOD') ?: 'POST';
$action = (string) ($post['action'] ?? '');
if (preg_match('/^mphbac_staff_(month|booking|search|ready)$/', $action, $m)) {
    \MPHBAC\Staff::{'handle_' . $m[1]}();
} else {
    \MPHBAC\Ajax::handle();
}
