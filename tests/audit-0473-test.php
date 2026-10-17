<?php
/**
 * 0.47.3 — THE WD'S AUDIT, FIXES 3, 4, 5, 7 AND 9 (fixes 1, 2 and 8 are in
 * availability-rules-test.php; 6 and 10 are browser tests).
 *
 *   3  A failed staff month query is an ERROR answer, never "no bookings":
 *      the real Staff::handle_month() over the real Staff_Data, on a real
 *      SQL database (tests/sqlite-wpdb.php) made to fail.
 *   4  The page-embedded availability carries the "Remember availability
 *      for" setting as its ttl, not the shipped 900 — rendered through the
 *      real widget (tests/render) at 0 and at 600.
 *   5  debug=1 on the public endpoint answers timings only to an
 *      administrator (manage_options).
 *   7  staff.min.js / staff.css: on the staff page, registered only for a
 *      visitor the gate lets in; the Elementor widget declares them only then.
 *   9  The staff search action is in the page-cache exclusions.
 */
namespace {
    require __DIR__ . '/bootstrap.php';
    require __DIR__ . '/sqlite-wpdb.php';
    $ROOT = dirname(__DIR__) . '/mphb-availability-calendar';

    $GLOBALS['t_admin'] = false;      // current_user_can('manage_options')
    $GLOBALS['t_auth']  = false;      // the staff gate's answer, via its real inputs
    $GLOBALS['t_page']  = 0;          // is_page() — the page being viewed
    $GLOBALS['t_tr'] = [];
    function get_transient($k) { $v = $GLOBALS['t_tr'][$k] ?? null; return $v === null ? false : $v[0]; }
    function set_transient($k, $v, $t) { $GLOBALS['t_tr'][$k] = [$v, $t]; return true; }
    function delete_transient($k) { unset($GLOBALS['t_tr'][$k]); return true; }
    final class T_Json extends \Exception { public $payload; public $ok; public $code; }
    function wp_send_json_success($d = null, $code = null) { $e = new T_Json('ok'); $e->ok = true; $e->payload = $d; $e->code = $code; throw $e; }
    function wp_send_json_error($d = null, $code = null) { $e = new T_Json('err'); $e->ok = false; $e->payload = $d; $e->code = $code; throw $e; }
    function nocache_headers() {}
    function status_header($c) { $GLOBALS['t_status'] = $c; }
    function wp_unslash($v) { return $v; }
    function is_user_logged_in() { return $GLOBALS['t_auth']; }
    function current_user_can($c) { return $c === 'manage_options' ? $GLOBALS['t_admin'] : $GLOBALS['t_auth']; }
    function post_password_required($p = null) { return !$GLOBALS['t_auth']; }
    function wp_verify_nonce($n, $a) { return $n === 'good' ? 1 : false; }
    function is_page($id = null) { return $GLOBALS['t_page'] && (int) $id === (int) $GLOBALS['t_page']; }
    $GLOBALS['t_registered'] = [];
    function wp_register_style($h, ...$a) { $GLOBALS['t_registered'][] = 'style:' . $h; return true; }
    function wp_register_script($h, ...$a) { $GLOBALS['t_registered'][] = 'script:' . $h; return true; }
    function wp_add_inline_style($h, $c) { return true; }
    function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
    if (!defined('MPHBAC_URL')) { define('MPHBAC_URL', 'https://example.test/p/'); }
    if (!defined('MPHBAC_VERSION')) { define('MPHBAC_VERSION', 'test'); }
    if (!defined('MPHBAC_AJAX_ACTION')) { define('MPHBAC_AJAX_ACTION', 'mphbac_query'); }
    if (!defined('MPHBAC_PRICE_ACTION')) { define('MPHBAC_PRICE_ACTION', 'mphbac_price'); }
    if (!defined('MPHBAC_INFO_ACTION')) { define('MPHBAC_INFO_ACTION', 'mphbac_info'); }

    require $ROOT . '/includes/class-settings.php';
    require $ROOT . '/includes/class-cache.php';
    require $ROOT . '/includes/class-booking-rules.php';
    require $ROOT . '/includes/class-data-provider.php';
    require $ROOT . '/includes/class-ajax.php';
    require $ROOT . '/includes/class-staff.php';
    require $ROOT . '/includes/class-staff-data.php';
    require $ROOT . '/includes/class-staff-widget.php';
    require $ROOT . '/includes/class-cache-integration.php';

    $fail = 0;
    function check(string $l, bool $c, $x = null): void {
        global $fail;
        echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null && !$c ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
        if (!$c) { $fail++; }
    }
    function answer(callable $fn): T_Json { try { $fn(); } catch (T_Json $j) { return $j; } throw new \RuntimeException('no JSON answer'); }

    $db = new T_SQLite_WPDB();
    $GLOBALS['wpdb'] = $db;
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22: Test');
    $db->post(2201, 'mphb_room', 'publish', 0, ['mphb_room_type_id' => 22]);
    // The staff page, password-protected, as on live.
    t_post(18102, 'page', 'publish', 'Staff');
    $GLOBALS['t_posts'][18102]->post_password = 'secret';

    if (getenv('T_0473_CHILD') === '1') {
        $GLOBALS['t_status'] = null;
        $db->fail_on = '/mphb_reserved_room/';
        $_POST = $_REQUEST = ['from' => '2026-10-01', 'to' => '2026-10-31', 'nonce' => 'good'];
        ob_start(static fn($b) => '');
        register_shutdown_function(static function () use ($db) { ob_end_clean(); echo $GLOBALS['t_status'] . '|' . count(preg_grep('/reserved_room/', $db->log)); });
        \MPHBAC\Staff::handle_month();
        exit;
    }

    echo "-- 3. a failed staff month query is an error, never an empty board --\n";
    $GLOBALS['t_auth'] = true;
    $_POST = $_REQUEST = ['from' => '2026-10-01', 'to' => '2026-10-31', 'nonce' => 'good'];
    $j = answer(['MPHBAC\\Staff', 'handle_month']);
    check('a working query and no bookings: a SUCCESS with an empty month (what "No bookings in this period" is for)', $j->ok && ($j->payload['bookings'] ?? null) === [], $j->payload);
    $db->fail_on = '/mphb_reserved_room/';
    $j = answer(['MPHBAC\\Staff', 'handle_month']);
    check('the same request with the query failing: an ERROR (500), not a success with no bookings — until 0.47.2 it was the latter',
        !$j->ok && $j->code === 500 && !isset($j->payload['bookings']), [$j->ok, $j->code, $j->payload]);
    check('...whose message is the board\'s own, naming nothing of the cause', ($j->payload['message'] ?? '') === 'Could not load bookings. Please try again.', $j->payload);
    $_POST = $_REQUEST = ['month' => '2026-10', 'nonce' => 'good'];
    $j = answer(['MPHBAC\\Staff', 'handle_month']);
    check('...the month form of the request too', !$j->ok && $j->code === 500, [$j->ok, $j->code]);
    $db->fail_on = null;
    $GLOBALS['t_auth'] = false;
    // The gate still comes FIRST: unauthorized, the request ends at the empty
    // 403 before any query (in a child process — require_authorization exits).
    $out = shell_exec('T_0473_CHILD=1 php ' . escapeshellarg(__FILE__) . ' 2>/dev/null');
    check('...and the gate still comes first: unauthorized, an empty 403 before any query runs', trim((string) $out) === '403|0', $out);
    $db->fail_on = null;

    echo "\n-- 4. the embedded availability's ttl is the setting --\n";
    $live = json_decode((string) file_get_contents(__DIR__ . '/render/live-state-0.46.6.json'), true);
    foreach ([0, 600] as $ttl) {
        $exp = $live;
        $exp['options']['mphbac_settings']['cache_ttl'] = $ttl;
        $tmp = tempnam(sys_get_temp_dir(), 'mphbac-ttl');
        file_put_contents($tmp, json_encode($exp));
        $r = json_decode((string) shell_exec('php ' . escapeshellarg(__DIR__ . '/render/render.php') . ' ' . escapeshellarg($ROOT) . ' ' . escapeshellarg($tmp) . ' 1005:5f8802c live 2>/dev/null'), true);
        unlink($tmp);
        preg_match('/data-config="([^"]*)"/', (string) ($r['html'] ?? ''), $m);
        $cfg = json_decode(html_entity_decode($m[1] ?? '{}', ENT_QUOTES), true) ?: [];
        check("\"Remember availability for\" at $ttl: the page's embedded availability carries ttl $ttl (not the shipped 900)",
            isset($cfg['initial']['ttl']) && $cfg['initial']['ttl'] === $ttl, $cfg['initial']['ttl'] ?? 'no initial');
    }
    $js = file_get_contents($ROOT . '/assets/js/widget.js');
    check('...and the client treats a ttl of 0 as never fresh (it revalidates at once)', (bool) preg_match('/if \(ttl <= 0\) return false;/', $js));

    echo "\n-- 5. debug=1 answers timings to an administrator only --\n";
    $D = static fn(int $n): string => \MPHBAC\Data_Provider::today()->modify("+$n days")->format('Y-m-d');
    $ask = static fn() => answer(static function () use ($D) { $_POST = ['room_type_ids' => ['22'], 'from' => $D(1), 'to' => $D(20), 'debug' => '1']; \MPHBAC\Ajax::handle(); });
    $GLOBALS['t_admin'] = false;
    $j = $ask();
    check('anonymous, debug=1: an ordinary answer — no timings', $j->ok && !array_key_exists('timing', $j->payload), array_keys($j->payload));
    $GLOBALS['t_admin'] = true;
    $j = $ask();
    check('an administrator, debug=1: the timings (bootMs, queryMs, handleMs, cacheHit, dataAgeS)', $j->ok && isset($j->payload['timing']['queryMs'], $j->payload['timing']['cacheHit']), $j->payload['timing'] ?? null);
    $GLOBALS['t_admin'] = false;
    check('...WP_DEBUG still turns them on for everyone (the rule names it; source)', (bool) preg_match("/\\|\\| \\(defined\\('WP_DEBUG'\\) && WP_DEBUG\\)\\) \\{/", file_get_contents($ROOT . '/includes/class-ajax.php')));

    echo "\n-- 7. the staff assets only for a visitor the gate lets in --\n";
    $reg = static function (int $page, bool $auth) {
        $GLOBALS['t_registered'] = [];
        $GLOBALS['t_page'] = $page;
        $GLOBALS['t_auth'] = $auth;
        \MPHBAC\Staff_Widget::register_assets();
        return $GLOBALS['t_registered'];
    };
    $r = $reg(18102, false);
    check('the staff page, password not entered: staff.min.js and staff.css are NOT registered — Elementor\'s enqueue of them prints nothing', $r === [], $r);
    $r = $reg(18102, true);
    check('the staff page, password entered (the cookie the redirect back sets): both registered on that very load', in_array('script:mphbac-staff', $r, true) && in_array('style:mphbac-staff', $r, true), $r);
    $r = $reg(5, false);
    check('any other page: registered as before (nothing there enqueues them) — and the gate is not asked', in_array('script:mphbac-staff', $r, true));
    // The Elementor widget's own declaration.
    require __DIR__ . '/elementor-stub.php';
    require $ROOT . '/includes/class-staff-elementor.php';
    $w = new \MPHBAC\Staff_Elementor();
    $GLOBALS['t_auth'] = false;
    $d0 = [$w->get_script_depends(), $w->get_style_depends()];
    $GLOBALS['t_auth'] = true;
    $d1 = [$w->get_script_depends(), $w->get_style_depends()];
    check('the staff widget declares mphbac-staff (script and style) only for an authorized visitor', $d0 === [[], []] && $d1 === [['mphbac-staff'], ['mphbac-staff']], [$d0, $d1]);
    $GLOBALS['t_auth'] = false;

    echo "\n-- 9. the staff search action is kept out of page caches --\n";
    $pats = \MPHBAC\Cache_Integration::ajax_exclusion_patterns();
    check('mphbac_staff_search is excluded, beside month, booking and photo', count(array_intersect([
        '/wp-admin/admin-ajax.php?action=mphbac_staff_search', '/wp-admin/admin-ajax.php?action=mphbac_staff_month',
        '/wp-admin/admin-ajax.php?action=mphbac_staff_booking', '/wp-admin/admin-ajax.php?action=mphbac_staff_photo'], $pats)) === 4, $pats);
    check('...and it is the action the search endpoint really answers', (bool) preg_match("/'mphbac_staff_' \\. \\\$ep/", file_get_contents($ROOT . '/includes/class-staff.php'))
        && (bool) preg_match("/\\['month', 'booking', 'photo', 'search'\\]/", file_get_contents($ROOT . '/includes/class-staff.php')));

    echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
    exit($fail ? 1 : 0);
}
