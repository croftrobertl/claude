<?php
/**
 * v0.34.2 — two of the Director's audit findings on live 0.34.1 that have no
 * other home: the gettext map rebuilt on every call, and the store self-test
 * accepting an unverified certificate.
 *
 *     php tests/audit/run.php
 *
 * WHAT IS REAL: the shipped Assets::string_overrides() and
 * Id_Files::probe_public_access().
 *
 * WHAT IS A STAND-IN: WordPress's translation, locale and HTTP functions, and
 * a real temporary directory for the probe file (so the write, the read-back
 * and the unlink are the real ones).
 */
define('ABSPATH', __DIR__);
define('HOUR_IN_SECONDS', 3600);

$GLOBALS['opt'] = [];
$GLOBALS['locale'] = 'en_US';
$GLOBALS['filter_calls'] = 0;
$GLOBALS['translate_calls'] = 0;
$GLOBALS['http'] = [];          // every wp_remote_get argument list
$GLOBALS['http_queue'] = [];    // the replies, in order

function get_option($k, $d = false) { return $GLOBALS['opt'][$k] ?? $d; }
function add_filter() {}
function add_action() {}
function determine_locale() { return $GLOBALS['locale']; }
function get_locale() { return $GLOBALS['locale']; }
function __($t, $d = null) {
    $GLOBALS['translate_calls']++;
    // A stand-in translation, so a cache keyed wrongly is visible in the words.
    return $GLOBALS['locale'] === 'fr_FR' ? 'FR:' . $t : $t;
}
function esc_html__($t, $d = null) { return __($t, $d); }
function esc_attr__($t, $d = null) { return __($t, $d); }
function apply_filters($hook, $value, ...$rest) {
    if ($hook === 'dcc_checkout_string_overrides') {
        $GLOBALS['filter_calls']++;
    }
    if (isset($GLOBALS['filters'][$hook])) {
        return $GLOBALS['filters'][$hook];
    }
    return $value;
}
function wp_generate_password($len = 12, $special = true) { return 'probe' . $len; }
function wp_get_upload_dir() {
    return ['basedir' => $GLOBALS['uploads'], 'baseurl' => 'https://example.test/wp-content/uploads'];
}
function is_wp_error($t) { return $t instanceof WP_Error; }
function wp_remote_get($url, $args = []) {
    $GLOBALS['http'][] = ['url' => $url, 'args' => $args];
    $next = array_shift($GLOBALS['http_queue']);
    return $next ?? ['response' => ['code' => 403], 'body' => 'Forbidden'];
}
function wp_remote_retrieve_response_code($r) { return $r['response']['code'] ?? 0; }
function wp_remote_retrieve_body($r) { return $r['body'] ?? ''; }
function get_transient($k) { return false; }
function set_transient($k, $v, $t = 0) { return true; }
function current_user_can($c) { return true; }
function wp_doing_ajax() { return false; }
function is_admin() { return false; }
function did_action($h) { return 0; }
function trailingslashit($s) { return rtrim((string) $s, '/\\') . '/'; }

class WP_Error {
    private $msg;
    public function __construct($c = '', $m = '') { $this->msg = $m; }
    public function get_error_message() { return $this->msg; }
}

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-id-files.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-assets.php';

use DCC_Checkout\Assets;
use DCC_Checkout\Id_Files;

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) {
        echo '      expected: ' . var_export($expected, true) . "\n";
        echo '      actual:   ' . var_export($actual, true) . "\n";
    }
}

/* =====================================================================
 * FINDING 4 — the gettext map was rebuilt on every gettext call.
 *
 * apply_override() reads string_overrides(), and it runs on EVERY call of
 * MotoPress's text domain on every page. The map, its eight __() lookups and
 * the filter were therefore rebuilt thousands of times for an answer that
 * cannot change within one request.
 * ===================================================================== */
Assets::flush_string_overrides();
$GLOBALS['filter_calls'] = 0;
$GLOBALS['translate_calls'] = 0;

$first = Assets::string_overrides();
$after_one = [$GLOBALS['filter_calls'], $GLOBALS['translate_calls']];
check('the first call builds the map', $after_one[0], 1);
check('... with one __() per entry', $after_one[1] > 1, true);

for ($i = 0; $i < 500; $i++) {
    Assets::string_overrides();
}
check('500 more calls build it no further', $GLOBALS['filter_calls'], 1);
check('... and translate nothing further', $GLOBALS['translate_calls'], $after_one[1]);
check('the map is the same map', Assets::string_overrides(), $first);
check('and it is the real one', $first['Services'], 'Extras');

/* The cache is per LOCALE, not a bare flag: a request that renders something
   in another locale must not be served the first locale's words. */
$GLOBALS['locale'] = 'fr_FR';
$fr = Assets::string_overrides();
check('another locale rebuilds the map', $GLOBALS['filter_calls'], 2);
check('... in that locale\'s words', $fr['Services'], 'FR:Extras');
$GLOBALS['locale'] = 'en_US';
check('and the first locale is still its own', Assets::string_overrides()['Services'], 'Extras');
check('... from the cache, with no rebuild', $GLOBALS['filter_calls'], 2);

/* The rename still happens — a cache that returned the wrong thing, or an
   empty array, would be invisible in the counts above. */
$GLOBALS['filters']['dcc_checkout_is_checkout_page'] = true;
check('the aliases still carry both spellings',
    in_array('extras', Assets::label_aliases()['services'] ?? [], true), true);

/* =====================================================================
 * FINDING 5 — the store self-test accepted an unverified certificate.
 *
 * probe_public_access() asks the web server whether the guest-ID store is
 * reachable, and that answer is what /privacy/'s promise rests on. It used to
 * pass sslverify => false, so it would accept the answer from whatever
 * responded. Now it verifies, and only a TLS failure is retried unverified.
 * ===================================================================== */
$GLOBALS['uploads'] = sys_get_temp_dir() . '/dcc-audit-' . getmypid();
@mkdir($GLOBALS['uploads'] . '/mphb_protected_uploads', 0777, true);

function probe_reset(array $replies): void {
    $GLOBALS['http'] = [];
    $GLOBALS['http_queue'] = $replies;
}
$denied = ['response' => ['code' => 403], 'body' => 'Forbidden'];
$served = ['response' => ['code' => 200], 'body' => 'dcc-probe'];

probe_reset([$denied]);
$res = Id_Files::probe_public_access();
check('the probe verifies the certificate', $GLOBALS['http'][0]['args']['sslverify'], true);
check('... and only asks once when that works', count($GLOBALS['http']), 1);
check('a 403 is still read as protected', $res['ok'], true);
check('... with no caveat in the note', strpos($res['note'], 'could not verify'), false);

probe_reset([$served]);
$res = Id_Files::probe_public_access();
check('a 200 serving the probe is still read as PUBLIC', $res['ok'], false);

/* A host whose own loopback cannot verify its certificate still gets an
   answer — with the caveat said out loud. */
probe_reset([new WP_Error('http_request_failed', 'cURL error 60: SSL certificate problem'), $denied]);
$res = Id_Files::probe_public_access();
check('a certificate failure is retried without verification', count($GLOBALS['http']), 2);
check('... the retry is the unverified one', $GLOBALS['http'][1]['args']['sslverify'], false);
check('... the answer is still given', $res['ok'], true);
check('... and the note says verification could not be made',
    strpos($res['note'], 'could not verify its own certificate') !== false, true);

/* Anything that is NOT about the certificate is reported as it is. A refused
   connection is not a reason to lower the bar and try again. */
probe_reset([new WP_Error('http_request_failed', 'Connection refused'), $denied]);
$res = Id_Files::probe_public_access();
check('a connection failure is NOT retried unverified', count($GLOBALS['http']), 1);
check('... and is reported as the error it was', $res['ok'], false);
check('... in the transport\'s own words', $res['note'], 'Connection refused');

/* The probe file is always cleaned up, whichever way the request went. */
$left = glob($GLOBALS['uploads'] . '/mphb_protected_uploads/dcc-access-probe-*');
check('no probe file is left behind', $left, []);
@rmdir($GLOBALS['uploads'] . '/mphb_protected_uploads');
@rmdir($GLOBALS['uploads']);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
