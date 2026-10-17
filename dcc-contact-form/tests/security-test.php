<?php
/**
 * Security coverage for the 2026-10-13 audit fixes.
 *
 *   php dcc-contact-form/tests/security-test.php
 *
 * Covers: the acknowledgement carries no submitted content, the per-IP limit,
 * and the now-required timing field. Not shipped in the plugin zip.
 */

namespace {
    define('ABSPATH', __DIR__ . '/');
    $GLOBALS['OPT'] = ['dcc_contact_db_version' => '1'];
    $GLOBALS['TRANSIENTS'] = [];
    $GLOBALS['MAILS'] = [];
    $GLOBALS['ENTRIES'] = [];
    $_SERVER['REMOTE_ADDR'] = '203.0.113.7';
    $_SERVER['HTTP_REFERER'] = 'https://doracanalcourt.com/contact/';

    function __($t, $d = null) { return $t; }
    function esc_html__($t, $d = null) { return htmlspecialchars($t, ENT_QUOTES); }
    function esc_attr__($t, $d = null) { return htmlspecialchars($t, ENT_QUOTES); }
    function esc_html_e($t, $d = null) { echo htmlspecialchars($t, ENT_QUOTES); }
    function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
    function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
    function esc_url($u) { return $u; }
    function esc_textarea($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
    function sanitize_text_field($s) { return trim(preg_replace('/[\r\n\t]+/', ' ', strip_tags((string) $s))); }
    function sanitize_textarea_field($s) { return trim(strip_tags((string) $s)); }
    function sanitize_email($s) { $s = trim((string) $s); return filter_var($s, FILTER_VALIDATE_EMAIL) ? $s : ''; }
    function is_email($s) { return (bool) filter_var((string) $s, FILTER_VALIDATE_EMAIL); }
    function sanitize_html_class($c) { return preg_replace('/[^A-Za-z0-9_-]/', '', (string) $c); }
    function wp_unslash($v) { return is_array($v) ? array_map('wp_unslash', $v) : stripslashes((string) $v); }
    function wp_kses_post($s) { return $s; }
    function wpautop($s) { return '<p>' . $s . '</p>'; }
    function wp_strip_all_tags($s) { return strip_tags((string) $s); }
    function wp_json_encode($v) { return json_encode($v); }
    function wp_create_nonce($a) { return 'N_' . substr(md5($a), 0, 8); }
    function is_user_logged_in() { return false; }
    /**
     * Faithful to real WordPress, and that fidelity is load-bearing.
     *
     * Core's wp_get_referer() passes the header through wp_validate_redirect(),
     * which returns FALSE for any host that is not this site. That is the whole
     * mechanism of the bug fix 6 repairs: `if (wp_get_referer())` was falsy
     * EXACTLY when the referer was hostile, so the check could never reject.
     *
     * A stub that returned the raw header would make the old, broken code look
     * correct here — the mutation run caught precisely that and reported the
     * referer mutation as escaping.
     */
    function wp_get_referer() {
        $ref = $_SERVER['HTTP_REFERER'] ?? '';
        if ($ref === '') { return false; }
        $host = parse_url($ref, PHP_URL_HOST);
        $home = parse_url(home_url(), PHP_URL_HOST);
        return ($host && $host === $home) ? $ref : false;
    }
    function home_url($p = '') { return 'https://doracanalcourt.com' . $p; }
    function admin_url($p = '') { return 'https://doracanalcourt.com/wp-admin/' . $p; }
    function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
    function get_bloginfo($k) { return 'Dora Canal Court'; }
    function current_time($t) { return date('Y-m-d H:i:s'); }
    function get_option($k, $d = false) { return $GLOBALS['OPT'][$k] ?? $d; }
    function update_option($k, $v, $a = null) { $GLOBALS['OPT'][$k] = $v; return true; }
    function get_transient($k) { return $GLOBALS['TRANSIENTS'][$k] ?? false; }
    function set_transient($k, $v, $t = 0) { $GLOBALS['TRANSIENTS'][$k] = $v; return true; }
    function delete_transient($k) { unset($GLOBALS['TRANSIENTS'][$k]); return true; }
    function wp_salt($s = '') { return 'test-salt-' . $s; }
    function nocache_headers() {}
    function apply_filters($t, $v) { return $v; }
    function wp_mail($to, $s, $b, $h = []) {
        $GLOBALS['MAILS'][] = ['to' => $to, 'subject' => $s, 'body' => $b, 'headers' => $h];
        return true;
    }
    function wp_remote_post($u, $a = []) {
        return ['body' => json_encode($GLOBALS['RC'] ?? ['success' => true, 'score' => 0.9, 'action' => 'dcc_contact', 'hostname' => 'doracanalcourt.com'])];
    }
    function is_wp_error($t) { return false; }
    function wp_remote_retrieve_body($r) { return $r['body']; }

    class FakeWpdb {
        public $prefix = 'wp_'; public $insert_id = 0;
        public function get_charset_collate() { return ''; }
        public function insert($t, $d, $f = null) { $GLOBALS['ENTRIES'][] = $d; $this->insert_id = count($GLOBALS['ENTRIES']); return 1; }
        public function update($t, $d, $w, $a = null, $b = null) { return 1; }
        public function prepare($q, ...$a) { return $q; }
        public function get_var($q) { return 0; }
        public function get_results($q) { return []; }
        public function get_row($q) { return null; }
        public function delete($t, $w, $f = null) { return 1; }
        public function query($q) { return 1; }
    }
    $GLOBALS['wpdb'] = new FakeWpdb();

    define('DCC_CONTACT_VERSION', 'test');
    define('DCC_CONTACT_URL', '/u/');
    define('DCC_CONTACT_DIR', dirname(__DIR__) . '/');
    define('DCC_CONTACT_AJAX_ACTION', 'dcc_contact_submit');
    spl_autoload_register(static function (string $c): void {
        if (strncmp($c, 'DCC_Contact\\', 12) !== 0) { return; }
        $f = DCC_CONTACT_DIR . 'includes/class-' . strtolower(str_replace('_', '-', substr($c, 12))) . '.php';
        if (is_readable($f)) { require_once $f; }
    });
}

namespace {

use DCC_Contact\Email;
use DCC_Contact\Form_Config;
use DCC_Contact\Form_Handler;
use DCC_Contact\Rate_Limit;
use DCC_Contact\Settings;

$pass = 0; $fail = 0;
function check(string $label, $got, $want): void {
    global $pass, $fail;
    if ($got === $want) { $pass++; printf("  ok   %s\n", $label); return; }
    $fail++;
    printf("  FAIL %s\n         got=%s want=%s\n", $label, var_export($got, true), var_export($want, true));
}
function section(string $t): void { echo "\n=== $t ===\n"; }

$GLOBALS['OPT']['dcc_contact_settings'] = array_merge(Settings::defaults(), [
    'recaptcha_site_key'   => 'S',
    'recaptcha_secret_key' => 'K',
    'copy_to_sender'       => true,
]);

/* The trusted server-side config for a form with copy-to-sender ON, as the
   live form 9709061 is configured. */
$FIELDS = [
    ['id' => 'f1', 'type' => 'name',     'label' => 'Name',     'required' => true, 'options' => []],
    ['id' => 'f2', 'type' => 'email',    'label' => 'Email Address', 'required' => true, 'options' => []],
    ['id' => 'f4', 'type' => 'textarea', 'label' => 'Message',  'required' => true, 'options' => []],
];
Form_Config::save('sec1', [
    'fields' => $FIELDS,
    'recipient' => 'contact@doracanalcourt.com',
    'subject' => 'Contact Request: {Name}',
    'from_email' => 'contact@doracanalcourt.com',
    'from_name' => '',
    'reply_to' => '{email}',
    'confirmation' => 'Thanks.',
    'copy_enabled' => true,
    'spam' => ['honeypot' => true, 'time_trap' => true, 'keyword_filter' => true, 'recaptcha' => true],
]);

/* The attacker's payload: every one of these strings is attacker-controlled
   and must not reach the third-party address. */
const PAYLOAD_NAME = 'Zbuyc';
const PAYLOAD_SURNAME = 'Heapcx';
const PAYLOAD_TEXT = 'BUY CHEAP WATCHES AT http://evil.example/offer CALL 555-0100';
const VICTIM = 'victim@thirdparty.example';

function attack(array $over = []): array {
    return array_merge([
        'action' => 'dcc_contact_submit', 'form_id' => 'sec1',
        'dcc_nonce' => wp_create_nonce(Form_Handler::NONCE_ACTION),
        'dcc_ts' => '9000', 'dcc_recaptcha' => 'T', 'dcc_contact_code' => '',
        'dcc_copy' => '1',
        'dcc_field' => [
            'f1' => ['first' => PAYLOAD_NAME, 'last' => PAYLOAD_SURNAME],
            'f2' => VICTIM,
            'f4' => PAYLOAD_TEXT,
        ],
    ], $over);
}
function reset_state(): void {
    $GLOBALS['MAILS'] = []; $GLOBALS['ENTRIES'] = []; $GLOBALS['TRANSIENTS'] = [];
}

/* ------------------------------------------------------------------ */
section('1. THE RELAY IS CLOSED: acknowledgement carries no submitted content');
reset_state();
$res = Form_Handler::process(attack());
check('submission accepted', $res['ok'], true);
check('two mails sent (owner + acknowledgement)', count($GLOBALS['MAILS']), 2);

$ack = null;
foreach ($GLOBALS['MAILS'] as $m) { if ($m['to'] === VICTIM) { $ack = $m; } }
check('acknowledgement addressed to the typed address', $ack !== null, true);

$hay = $ack['body'] . ' ' . $ack['subject'];
check('payload TEXT absent from acknowledgement',    strpos($hay, PAYLOAD_TEXT) === false, true);
check('payload URL absent from acknowledgement',     strpos($hay, 'evil.example') === false, true);
check('payload PHONE absent from acknowledgement',   strpos($hay, '555-0100') === false, true);
check('payload NAME absent from acknowledgement',    strpos($hay, PAYLOAD_NAME) === false, true);
check('payload SURNAME absent from acknowledgement', strpos($hay, PAYLOAD_SURNAME) === false, true);
check('subject carries no submitted text',           strpos($ack['subject'], PAYLOAD_NAME) === false, true);
check('acknowledgement still branded (logo present)', strpos($ack['body'], 'DCC-Photos-Logo') !== false, true);

/* The owner's own notification MUST still contain the submission. */
$owner = null;
foreach ($GLOBALS['MAILS'] as $m) { if ($m['to'] === 'contact@doracanalcourt.com') { $owner = $m; } }
check('owner notification still has the message', strpos($owner['body'], PAYLOAD_TEXT) !== false, true);
check('owner notification still has the name',    strpos($owner['body'], PAYLOAD_NAME) !== false, true);

/* ------------------------------------------------------------------ */
section('2. PER-IP LIMIT: 3 accepted per 15 minutes');
reset_state();
for ($i = 1; $i <= 3; $i++) {
    $r = Form_Handler::process(attack());
    check("submission $i accepted", $r['ok'], true);
}
check('3 accepted => 6 mails', count($GLOBALS['MAILS']), 6);

$r4 = Form_Handler::process(attack());
check('4th REJECTED',              $r4['ok'], false);
check('4th sent no mail',          count($GLOBALS['MAILS']), 6);
$last = end($GLOBALS['ENTRIES']);
check('4th recorded as spam:rate', $last['spam_result'], 'spam:rate');
check('4th message mentions waiting', strpos($r4['message'], 'wait a few minutes') !== false, true);

section('2b. the window expires, and a different address has its own bucket');
/* Age the window past its end by rewriting the stored start. */
foreach ($GLOBALS['TRANSIENTS'] as $k => $v) {
    if (is_array($v) && isset($v['start'])) {
        $GLOBALS['TRANSIENTS'][$k]['start'] = time() - (Rate_Limit::WINDOW_SECONDS + 1);
    }
}
check('allowed again once the window passes', Form_Handler::process(attack())['ok'], true);

$_SERVER['REMOTE_ADDR'] = '198.51.100.22';
reset_state();
check('a different address starts fresh', Form_Handler::process(attack())['ok'], true);
$_SERVER['REMOTE_ADDR'] = '203.0.113.7';

section('2c. no raw IP is stored anywhere');
reset_state();
Form_Handler::process(attack());
$dump = json_encode([$GLOBALS['TRANSIENTS'], $GLOBALS['ENTRIES']]);
check('203.0.113.7 absent from transients and entries', strpos($dump, '203.0.113.7') === false, true);
check('a hashed bucket key does exist', (bool) preg_grep('/^dcc_cf_rl_/', array_keys($GLOBALS['TRANSIENTS'])), true);

/* ------------------------------------------------------------------ */
section('3. TIMING FIELD IS REQUIRED');
reset_state();
$missing = attack();
unset($missing['dcc_ts']);
$rm = Form_Handler::process($missing);
check('absent dcc_ts REJECTED',        $rm['ok'], false);
check('absent dcc_ts sent no mail',    count($GLOBALS['MAILS']), 0);
check('absent dcc_ts recorded as spam:time', end($GLOBALS['ENTRIES'])['spam_result'], 'spam:time');

reset_state();
check('empty dcc_ts REJECTED',       Form_Handler::process(attack(['dcc_ts' => '']))['ok'], false);
reset_state();
check('non-numeric dcc_ts REJECTED', Form_Handler::process(attack(['dcc_ts' => 'abc']))['ok'], false);
reset_state();
check('too-fast dcc_ts REJECTED',    Form_Handler::process(attack(['dcc_ts' => '400']))['ok'], false);
reset_state();
check('valid dcc_ts accepted',       Form_Handler::process(attack(['dcc_ts' => '9000']))['ok'], true);

/* ------------------------------------------------------------------ */
section('4. REGRESSION: the other layers and the happy path still work');
reset_state();
check('honeypot still silently rejects', Form_Handler::process(attack(['dcc_contact_code' => 'x']))['ok'], true);
check('honeypot sent no mail',           count($GLOBALS['MAILS']), 0);

reset_state();
$GLOBALS['RC'] = ['success' => true, 'score' => 0.1, 'action' => 'dcc_contact', 'hostname' => 'doracanalcourt.com'];
check('low reCAPTCHA score still rejects', Form_Handler::process(attack())['ok'], false);
check('low score sent no mail',            count($GLOBALS['MAILS']), 0);
$GLOBALS['RC'] = null;

reset_state();
$clean = attack(['dcc_field' => [
    'f1' => ['first' => 'Jane', 'last' => 'Guest'],
    'f2' => 'jane@example.com',
    'f4' => 'Is the cottage free in March?',
]]);
unset($clean['dcc_copy']);
$rc = Form_Handler::process($clean);
check('legitimate submission accepted',  $rc['ok'], true);
check('legitimate sends ONE mail (no copy requested)', count($GLOBALS['MAILS']), 1);
check('legitimate stored as ham', end($GLOBALS['ENTRIES'])['spam_result'], 'ham');
$h = $GLOBALS['MAILS'][0]['headers'];
check('From still aligned', in_array('From: Dora Canal Court <contact@doracanalcourt.com>', $h, true), true);
check('Reply-To still the guest', in_array('Reply-To: jane@example.com', $h, true), true);

echo "\n" . ($fail === 0 ? "ALL $pass CHECKS PASS\n" : "$fail FAILED / $pass passed\n");
exit($fail === 0 ? 0 : 1);
}
