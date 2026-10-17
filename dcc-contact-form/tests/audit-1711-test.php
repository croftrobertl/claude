<?php
/**
 * Coverage for the 2026-10-17 audit fixes (1.7.1).
 *
 *   php dcc-contact-form/tests/audit-1711-test.php
 *
 * Server-side only; the three browser fixes (7, 8, 9) are covered by
 * tests/browser-test.js. Not shipped in the plugin zip.
 */

namespace {
    define('ABSPATH', __DIR__ . '/');
    $GLOBALS['OPT'] = ['dcc_contact_db_version' => '1'];
    $GLOBALS['TRANSIENTS'] = [];
    $GLOBALS['MAILS'] = [];
    $GLOBALS['ROWS'] = [];      // the fake entries table
    $GLOBALS['NOTICES'] = '';
    $_SERVER['REMOTE_ADDR'] = '203.0.113.7';
    $_SERVER['HTTP_REFERER'] = 'https://doracanalcourt.com/contact/';

    function __($t, $d = null) { return $t; }
    function _x($t, $c = '', $d = null) { return $t; }
    function _n($s, $p, $n, $d = null) { return $n === 1 ? $s : $p; }
    function esc_html__($t, $d = null) { return htmlspecialchars($t, ENT_QUOTES); }
    function esc_attr__($t, $d = null) { return htmlspecialchars($t, ENT_QUOTES); }
    function esc_html_e($t, $d = null) { echo htmlspecialchars($t, ENT_QUOTES); }
    function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
    function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
    function esc_url($u) { return $u; }
    function esc_textarea($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
    function number_format_i18n($n) { return number_format((float) $n); }
    function sanitize_key($k) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $k)); }
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
    function current_user_can($c) { return true; }
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
    function add_query_arg($args, $url) { return $url . '?' . http_build_query($args); }
    function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
    function get_bloginfo($k) { return 'Dora Canal Court'; }
    function current_time($t) { return $t === 'mysql' ? date('Y-m-d H:i:s') : date($t); }
    function wp_date($f, $ts) { return date($f, $ts); }
    function get_option($k, $d = false) { return $GLOBALS['OPT'][$k] ?? $d; }
    function update_option($k, $v, $a = null) { $GLOBALS['OPT'][$k] = $v; return true; }
    function get_transient($k) { return $GLOBALS['TRANSIENTS'][$k] ?? false; }
    function set_transient($k, $v, $t = 0) { $GLOBALS['TRANSIENTS'][$k] = $v; return true; }
    function wp_salt($s = '') { return 'test-salt-' . $s; }
    function nocache_headers() {}
    function apply_filters($t, $v) { return $v; }
    function add_action(...$a) {}
    function wp_mail($to, $s, $b, $h = []) {
        $GLOBALS['MAILS'][] = ['to' => $to, 'subject' => $s, 'body' => $b, 'headers' => $h];
        return empty($GLOBALS['MAIL_FAILS']);
    }
    function wp_remote_post($u, $a = []) {
        if (!empty($GLOBALS['RC_WP_ERROR'])) { return new WP_Error_Stub(); }
        if (isset($GLOBALS['RC_HTTP']) && $GLOBALS['RC_HTTP'] !== 200) {
            return ['response' => ['code' => $GLOBALS['RC_HTTP']], 'body' => ''];
        }
        if (isset($GLOBALS['RC_RAW'])) {
            return ['response' => ['code' => 200], 'body' => $GLOBALS['RC_RAW']];
        }
        return [
            'response' => ['code' => 200],
            'body' => json_encode($GLOBALS['RC'] ?? [
                'success' => true, 'score' => 0.9,
                'action' => 'dcc_contact', 'hostname' => 'doracanalcourt.com',
            ]),
        ];
    }
    class WP_Error_Stub {}
    function is_wp_error($t) { return $t instanceof WP_Error_Stub; }
    function wp_remote_retrieve_body($r) { return is_array($r) ? ($r['body'] ?? '') : ''; }
    function wp_remote_retrieve_response_code($r) { return is_array($r) ? ($r['response']['code'] ?? 200) : 0; }

    /**
     * Fake wpdb that stores rows and really evaluates the LIKE predicates the
     * plugin builds, so the tab and count tests exercise the actual SQL shapes
     * rather than a stub that always agrees.
     */
    class FakeWpdb
    {
        public $prefix = 'wp_';
        public $insert_id = 0;

        public function get_charset_collate() { return ''; }

        public function insert($t, $d, $f = null)
        {
            $GLOBALS['ROWS'][] = (object) array_merge(['id' => count($GLOBALS['ROWS']) + 1], $d);
            $this->insert_id = count($GLOBALS['ROWS']);
            return 1;
        }

        public function update($t, $d, $w, $a = null, $b = null)
        {
            foreach ($GLOBALS['ROWS'] as $row) {
                if ((int) $row->id === (int) $w['id']) {
                    foreach ($d as $k => $v) { $row->$k = $v; }
                    return 1;
                }
            }
            return 0;
        }

        public function prepare($q, ...$a)
        {
            // Good enough for the %d placeholders this plugin uses.
            foreach ($a as $v) {
                if (is_array($v)) { foreach ($v as $x) { $q = preg_replace('/%d/', (string) (int) $x, $q, 1); } continue; }
                $q = preg_replace('/%d/', (string) (int) $v, $q, 1);
            }
            return $q;
        }

        public function get_var($q)
        {
            if (strpos($q, 'COUNT(*)') === false) { return 0; }
            return count($this->matching($q));
        }

        public function get_results($q)
        {
            $rows = $this->matching($q);
            usort($rows, static fn($a, $b) => $b->id <=> $a->id);

            if (preg_match('/LIMIT (\d+) OFFSET (\d+)/', $q, $m)) {
                $rows = array_slice($rows, (int) $m[2], (int) $m[1]);
            }
            return $rows;
        }

        public function get_row($q)
        {
            if (preg_match('/WHERE id = (\d+)/', $q, $m)) {
                foreach ($GLOBALS['ROWS'] as $row) {
                    if ((int) $row->id === (int) $m[1]) { return $row; }
                }
            }
            return null;
        }

        public function delete($t, $w, $f = null)
        {
            foreach ($GLOBALS['ROWS'] as $i => $row) {
                if ((int) $row->id === (int) $w['id']) { unset($GLOBALS['ROWS'][$i]); return 1; }
            }
            return 0;
        }

        public function query($q)
        {
            if (preg_match('/DELETE FROM .* WHERE id IN \(([0-9,\s]+)\)/', $q, $m)) {
                $ids = array_map('intval', explode(',', $m[1]));
                $n = 0;
                foreach ($GLOBALS['ROWS'] as $i => $row) {
                    if (in_array((int) $row->id, $ids, true)) { unset($GLOBALS['ROWS'][$i]); $n++; }
                }
                return $n;
            }
            return 1;
        }

        /** Evaluate the WHERE clause against the stored rows. */
        private function matching(string $q): array
        {
            if (!preg_match('/WHERE (.*?)(?: ORDER BY| LIMIT|$)/s', $q, $m)) {
                return array_values($GLOBALS['ROWS']);
            }
            $where = trim($m[1]);
            if ($where === '1=1') { return array_values($GLOBALS['ROWS']); }

            $terms = preg_split('/\s+AND\s+/i', $where);
            $out = [];
            foreach ($GLOBALS['ROWS'] as $row) {
                $ok = true;
                foreach ($terms as $term) {
                    if (!preg_match("/spam_result\s+(NOT\s+)?LIKE\s+'([^']*)'/i", $term, $t)) { continue; }
                    $negate = $t[1] !== '';
                    $hit = self::like((string) $row->spam_result, $t[2]);
                    if ($negate ? $hit : !$hit) { $ok = false; break; }
                }
                if ($ok) { $out[] = $row; }
            }
            return $out;
        }

        private static function like(string $value, string $pattern): bool
        {
            $re = '/^' . str_replace('%', '.*', preg_quote($pattern, '/')) . '$/s';
            $re = str_replace('\\%', '.*', $re);
            return (bool) preg_match($re, $value);
        }
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

use DCC_Contact\Admin;
use DCC_Contact\Entries;
use DCC_Contact\Form_Config;
use DCC_Contact\Form_Handler;
use DCC_Contact\Recaptcha;
use DCC_Contact\Settings;
use DCC_Contact\Triage;
use DCC_Contact\Urls;

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
]);

$FIELDS = [
    ['id' => 'f1', 'type' => 'name',     'label' => 'Name',          'required' => true,  'options' => []],
    ['id' => 'f2', 'type' => 'email',    'label' => 'Email Address', 'required' => true,  'options' => []],
    ['id' => 'f3', 'type' => 'tel',      'label' => 'Phone',         'required' => false, 'options' => []],
    ['id' => 'f4', 'type' => 'textarea', 'label' => 'Message',       'required' => true,  'options' => []],
];
Form_Config::save('t1', [
    'fields' => $FIELDS,
    'recipient' => 'contact@doracanalcourt.com',
    'subject' => 'Contact Request: {Name}',
    'from_email' => 'contact@doracanalcourt.com',
    'from_name' => '',
    'reply_to' => '{email}',
    'confirmation' => 'Thank you. We will contact you shortly.',
    'copy_enabled' => false,
    'spam' => ['honeypot' => true, 'time_trap' => true, 'keyword_filter' => true, 'recaptcha' => true],
]);

function post(array $over = []): array {
    $base = [
        'action' => 'dcc_contact_submit', 'form_id' => 't1',
        'dcc_nonce' => wp_create_nonce(Form_Handler::NONCE_ACTION),
        'dcc_ts' => '9000', 'dcc_recaptcha' => 'TOKEN', 'dcc_contact_code' => '',
        'dcc_field' => [
            'f1' => ['first' => 'Jane', 'last' => 'Guest'],
            'f2' => 'jane@example.com',
            'f3' => '352 555 0133',
            'f4' => 'We would like to ask about availability for two nights in June.',
        ],
    ];
    if (isset($over['dcc_field'])) {
        $base['dcc_field'] = array_merge($base['dcc_field'], $over['dcc_field']);
        unset($over['dcc_field']);
    }
    return array_merge($base, $over);
}
function reset_state(): void {
    $GLOBALS['MAILS'] = []; $GLOBALS['ROWS'] = []; $GLOBALS['TRANSIENTS'] = [];
    unset($GLOBALS['RC'], $GLOBALS['RC_WP_ERROR'], $GLOBALS['RC_HTTP'], $GLOBALS['RC_RAW'], $GLOBALS['MAIL_FAILS']);
    $GLOBALS['OPT']['dcc_contact_spam_day'] = ['day' => date('Y-m-d'), 'stored' => 0, 'suppressed' => 0];
    $GLOBALS['OPT'][Entries::MAIL_FAILED_OPTION] = 0;
    $GLOBALS['OPT'][Entries::MAYBE_REAL_OPTION] = 0;
}
function last_row() { $r = array_values($GLOBALS['ROWS']); return end($r); }
function notice_html(): string {
    ob_start(); Admin::attention_notice(); return (string) ob_get_clean();
}

/* ================================================================== */
section('FIX 1. reCAPTCHA: no verdict means UNVERIFIED, not rejected');

/* 1a. No token at all — the script was blocked, or a fast submit beat it. */
reset_state();
$r = Form_Handler::process(post(['dcc_recaptcha' => '']));
check('no token: guest sees success',        $r['ok'], true);
check('no token: normal confirmation',       strpos($r['confirmation'], 'Thank you') !== false, true);
check('no token: stored',                    count($GLOBALS['ROWS']), 1);
check('no token: stored as ham:unverified',  last_row()->spam_result, Entries::STATUS_UNVERIFIED);
check('no token: EMAILED',                   count($GLOBALS['MAILS']), 1);
check('no token: subject marked Unverified', strpos($GLOBALS['MAILS'][0]['subject'], '[Unverified]') !== false, true);
check('no token: subject keeps the real subject too',
    strpos($GLOBALS['MAILS'][0]['subject'], 'Contact Request: Jane Guest') !== false, true);
check('no token: body still has the message',
    strpos($GLOBALS['MAILS'][0]['body'], 'availability for two nights') !== false, true);

/* 1b. Google unreachable / DNS failure / our 8s timeout. */
reset_state();
$GLOBALS['RC_WP_ERROR'] = true;
$r = Form_Handler::process(post());
check('unreachable: guest sees success',    $r['ok'], true);
check('unreachable: emailed',               count($GLOBALS['MAILS']), 1);
check('unreachable: unverified',            last_row()->spam_result, Entries::STATUS_UNVERIFIED);

/* 1c. Google answers with an HTTP error. */
reset_state();
$GLOBALS['RC_HTTP'] = 503;
check('http 503: accepted as unverified',   Form_Handler::process(post())['ok'], true);
check('http 503: unverified',               last_row()->spam_result, Entries::STATUS_UNVERIFIED);

/* 1d. Unparseable reply. */
reset_state();
$GLOBALS['RC_RAW'] = 'not json at all';
check('garbage reply: accepted as unverified', Form_Handler::process(post())['ok'], true);
check('garbage reply: unverified',             last_row()->spam_result, Entries::STATUS_UNVERIFIED);

/* 1e. OUR key is wrong — must never cost a lead. */
reset_state();
$GLOBALS['RC'] = ['success' => false, 'error-codes' => ['invalid-input-secret']];
check('bad secret key: accepted as unverified', Form_Handler::process(post())['ok'], true);
check('bad secret key: emailed',                count($GLOBALS['MAILS']), 1);

/* 1f. An expired/already-used token: a guest who left the tab open. */
reset_state();
$GLOBALS['RC'] = ['success' => false, 'error-codes' => ['timeout-or-duplicate']];
check('expired token: accepted as unverified',  Form_Handler::process(post())['ok'], true);

/* 1g. A verified token with no score is not a judgement. */
reset_state();
$GLOBALS['RC'] = ['success' => true, 'action' => 'dcc_contact', 'hostname' => 'doracanalcourt.com'];
check('no score: accepted as unverified',       Form_Handler::process(post())['ok'], true);
check('no score: unverified',                   last_row()->spam_result, Entries::STATUS_UNVERIFIED);

section('FIX 1. …but a real verdict against the submission still rejects');

/* A low score is Google judging it a bot. Unchanged behaviour. */
reset_state();
$GLOBALS['RC'] = ['success' => true, 'score' => 0.1, 'action' => 'dcc_contact', 'hostname' => 'doracanalcourt.com'];
$r = Form_Handler::process(post());
check('low score REJECTED',               $r['ok'], false);
check('low score sent no mail',           count($GLOBALS['MAILS']), 0);
check('low score stored as spam',         last_row()->spam_result, 'spam:recaptcha');

/* Exactly at the threshold passes; a hair under does not. */
reset_state();
$GLOBALS['RC'] = ['success' => true, 'score' => 0.4, 'action' => 'dcc_contact', 'hostname' => 'doracanalcourt.com'];
check('score exactly at 0.4 passes',      Recaptcha::check('T'), Recaptcha::PASS);
$GLOBALS['RC'] = ['success' => true, 'score' => 0.39, 'action' => 'dcc_contact', 'hostname' => 'doracanalcourt.com'];
check('score 0.39 is spam',               Recaptcha::check('T'), Recaptcha::SPAM);

/* A forged token — Google says it was never minted for us. */
$GLOBALS['RC'] = ['success' => false, 'error-codes' => ['invalid-input-response']];
check('forged token is spam',             Recaptcha::check('T'), Recaptcha::SPAM);

/* A token minted elsewhere, or for another action. */
$GLOBALS['RC'] = ['success' => true, 'score' => 0.9, 'action' => 'other', 'hostname' => 'doracanalcourt.com'];
check('wrong action is spam',             Recaptcha::check('T'), Recaptcha::SPAM);
$GLOBALS['RC'] = ['success' => true, 'score' => 0.9, 'action' => 'dcc_contact', 'hostname' => 'evil.example'];
check('wrong hostname is spam',           Recaptcha::check('T'), Recaptcha::SPAM);
$GLOBALS['RC'] = ['success' => true, 'score' => 0.9, 'action' => 'dcc_contact', 'hostname' => 'www.doracanalcourt.com'];
check('www. hostname still passes',       Recaptcha::check('T'), Recaptcha::PASS);
check('empty token never calls out',      Recaptcha::check(''), Recaptcha::UNVERIFIED);

section('FIX 2. Honeypot catches keep their content');
reset_state();
$r = Form_Handler::process(post(['dcc_contact_code' => 'autofilled']));
check('honeypot: fake success as before',  $r['ok'], true);
check('honeypot: no mail',                 count($GLOBALS['MAILS']), 0);
check('honeypot: a row was stored',        count($GLOBALS['ROWS']), 1);
$stored = Entries::decode_fields(last_row()->fields);
check('honeypot: rows are NOT empty',      count($stored), 4);
check('honeypot: the message survived',
    strpos(json_encode($stored), 'availability for two nights') !== false, true);
check('honeypot: the email survived',
    strpos(json_encode($stored), 'jane@example.com') !== false, true);
check('honeypot: subject stored too',      last_row()->subject !== '', true);

/* This one reads human — no links, a real email, prose — so it is flagged. */
check('honeypot: flagged possible-real',   last_row()->spam_result, 'spam:honeypot:maybe-real');
check('honeypot: review count is 1',       Entries::maybe_real_count(), 1);
check('notice mentions the trapped message',
    strpos(notice_html(), 'possible real message') !== false, true);

/* Obvious spam trapped by the honeypot is NOT flagged. */
reset_state();
Form_Handler::process(post(['dcc_contact_code' => 'x', 'dcc_field' => [
    'f4' => 'BUY CHEAP WATCHES http://evil.example/offer BEST PRICE',
]]));
check('spammy trap catch not flagged',     last_row()->spam_result, 'spam:honeypot');
check('spammy trap catch still has content',
    strpos((string) last_row()->fields, 'CHEAP WATCHES') !== false, true);
check('review count stays 0',              Entries::maybe_real_count(), 0);

section('FIX 2. the triage heuristic itself');
$human = [
    ['label' => 'Name', 'value' => 'Jane Guest'],
    ['label' => 'Email', 'value' => 'jane@example.com'],
    ['label' => 'Message', 'value' => 'Hello, we would like to book a room for two nights in June please.'],
];
check('prose + email = human',        Triage::looks_human($human), true);

$phone_only = [
    ['label' => 'Name', 'value' => 'Bob'],
    ['label' => 'Phone', 'value' => '(352) 555-0133'],
    ['label' => 'Message', 'value' => 'Please call me about a reservation, thanks.'],
];
check('prose + US phone = human',     Triage::looks_human($phone_only), true);

check('a link disqualifies', Triage::looks_human([
    ['label' => 'Email', 'value' => 'jane@example.com'],
    ['label' => 'Message', 'value' => 'Nice site, visit https://cheap.example for deals'],
]), false);
check('a bare domain disqualifies', Triage::looks_human([
    ['label' => 'Email', 'value' => 'jane@example.com'],
    ['label' => 'Message', 'value' => 'Great rates at cheapwatches.top call today'],
]), false);
check('no contact route = not human', Triage::looks_human([
    ['label' => 'Message', 'value' => 'Just some ordinary text with nothing to reply to at all.'],
]), false);
check('SHOUTING is not prose', Triage::looks_human([
    ['label' => 'Email', 'value' => 'x@example.com'],
    ['label' => 'Message', 'value' => 'BUY NOW CHEAP WATCHES BEST PRICE GUARANTEED CALL TODAY OFFER'],
]), false);
check('symbol soup is not prose', Triage::looks_human([
    ['label' => 'Email', 'value' => 'x@example.com'],
    ['label' => 'Message', 'value' => '{{$$}}[[##]]~~~^^^&&&***(((...)))+++===///|||???!!!@@@%%%'],
]), false);
check('a 10-digit US number is a phone',  Triage::looks_human([
    ['label' => 'Phone', 'value' => '3525550133'], ['label' => 'M', 'value' => 'Call me please.'],
]), true);
check('a number starting 1 in the area code is not', Triage::looks_human([
    ['label' => 'Phone', 'value' => '1525550133'], ['label' => 'M', 'value' => 'Call me please.'],
]), false);

section('FIX 3. server-side length caps');
reset_state();
$long_msg = str_repeat('a', 6000);
$r = Form_Handler::process(post(['dcc_field' => ['f4' => $long_msg]]));
check('6000-char message REFUSED',        $r['ok'], false);
check('…with a per-field error',          isset($r['errors']['f4']), true);
check('…naming the limit',                strpos($r['errors']['f4'], '5,000') !== false, true);
check('…and nothing was emailed',         count($GLOBALS['MAILS']), 0);

reset_state();
$r = Form_Handler::process(post(['dcc_field' => ['f4' => str_repeat('a', 5000)]]));
check('exactly 5000 chars accepted',      $r['ok'], true);

reset_state();
$r = Form_Handler::process(post(['dcc_field' => ['f1' => ['first' => str_repeat('b', 201), 'last' => 'Guest']]]));
check('201-char name REFUSED',            $r['ok'], false);
check('…error on the name field',         isset($r['errors']['f1']), true);
check('…naming the 200 limit',            strpos($r['errors']['f1'], '200') !== false, true);

/* The cap also TRIMS, so the honeypot path cannot store an unbounded value. */
reset_state();
Form_Handler::process(post(['dcc_contact_code' => 'x', 'dcc_field' => ['f4' => $long_msg]]));
$stored = Entries::decode_fields(last_row()->fields);
$message = '';
foreach ($stored as $row) { if ($row['label'] === 'Message') { $message = $row['value']; } }
check('trapped over-long value is trimmed to the cap', mb_strlen($message), 5000);

section('FIX 3. the daily spam-content cap');
reset_state();
$GLOBALS['RC'] = ['success' => true, 'score' => 0.05, 'action' => 'dcc_contact', 'hostname' => 'doracanalcourt.com'];
for ($i = 0; $i < Entries::MAX_SPAM_ROWS_PER_DAY; $i++) {
    Form_Handler::process(post());
}
check('200 spam rows stored',             count($GLOBALS['ROWS']), 200);
check('tally says 200 stored',            Entries::spam_tally()['stored'], 200);

/* Past the cap: still refused, still counted, but no row and no content. */
for ($i = 0; $i < 25; $i++) { Form_Handler::process(post()); }
check('still only 200 rows after 25 more', count($GLOBALS['ROWS']), 200);
check('…and the 25 are counted',           Entries::spam_tally()['suppressed'], 25);
check('…the submitter is still refused',   Form_Handler::process(post())['ok'], false);

/* …while REAL mail still stores and sends, cap or no cap. */
unset($GLOBALS['RC']);
$r = Form_Handler::process(post());
check('a real message still stores past the cap', $r['ok'], true);
check('…as ham',                           last_row()->spam_result, Entries::STATUS_OK);
check('…and is emailed',                   count($GLOBALS['MAILS']), 1);

/* …and so does an unverified one. */
$GLOBALS['RC_WP_ERROR'] = true;
check('an unverified message stores past the cap', Form_Handler::process(post())['ok'], true);
check('…as ham:unverified',                last_row()->spam_result, Entries::STATUS_UNVERIFIED);
unset($GLOBALS['RC_WP_ERROR']);

/* A new day resets the allowance. */
$GLOBALS['OPT']['dcc_contact_spam_day'] = ['day' => '2000-01-01', 'stored' => 200, 'suppressed' => 9];
check('the tally resets on a new day',     Entries::spam_tally()['stored'], 0);

section('FIX 4. a failed notification is visible');
reset_state();
check('no notice when all is well',        notice_html(), '');

$GLOBALS['MAIL_FAILS'] = true;
$r = Form_Handler::process(post());
check('guest still sees success',          $r['ok'], true);
check('entry still stored',                count($GLOBALS['ROWS']), 1);
check('flagged as mail-failed',            last_row()->spam_result, Entries::STATUS_MAIL_FAILED);
check('count option is 1',                 Entries::mail_failed_count(), 1);
$html = notice_html();
check('notice is shown',                   strpos($html, 'could not be emailed') !== false, true);
check('notice counts one',                 strpos($html, '1 contact submission was') !== false, true);
check('notice links to submissions',       strpos($html, 'dcc-contact-form') !== false, true);

/* An unverified message whose mail also fails keeps BOTH flags. */
$GLOBALS['RC_WP_ERROR'] = true;
Form_Handler::process(post());
check('unverified + mail-failed',          last_row()->spam_result, Entries::STATUS_UNVERIFIED_MAIL_FAILED);
check('both counted',                      Entries::mail_failed_count(), 2);
unset($GLOBALS['RC_WP_ERROR'], $GLOBALS['MAIL_FAILS']);

/* Opening an entry stands the notice down, without losing the history. */
$id = (int) last_row()->id;
Entries::mark_seen($id);
check('opening it drops the count',        Entries::mail_failed_count(), 1);
check('…and the row remembers the failure',
    Entries::is_mail_failed((string) last_row()->spam_result), true);
check('…and is marked seen',               Entries::is_seen((string) last_row()->spam_result), true);
check('marking twice is idempotent',
    (function () use ($id) { Entries::mark_seen($id); return Entries::mail_failed_count(); })(), 1);

check('the Watchdog option name',          Entries::MAIL_FAILED_OPTION, 'dcc_contact_mail_failed_count');
check('the review option name',            Entries::MAYBE_REAL_OPTION, 'dcc_contact_trapped_review_count');
check('the option really holds the count', $GLOBALS['OPT']['dcc_contact_mail_failed_count'], 1);

section('FIX 5. Received / Unverified / Spam tabs');
reset_state();
/* Two real, one unverified, one spam. */
Form_Handler::process(post());
Form_Handler::process(post());
$GLOBALS['RC_WP_ERROR'] = true;
Form_Handler::process(post());
unset($GLOBALS['RC_WP_ERROR']);
$GLOBALS['RC'] = ['success' => true, 'score' => 0.01, 'action' => 'dcc_contact', 'hostname' => 'doracanalcourt.com'];
Form_Handler::process(post());
unset($GLOBALS['RC']);

check('4 rows in total',                   Entries::count(), 4);
check('Received tab shows 2',              Entries::count('received'), 2);
check('Unverified tab shows 1',            Entries::count('unverified'), 1);
check('Spam tab shows 1',                  Entries::count('spam'), 1);
check('the three tabs account for everything',
    Entries::count('received') + Entries::count('unverified') + Entries::count('spam'), 4);

check('Received page returns only ham',
    array_values(array_unique(array_map(
        static fn($r) => $r->spam_result,
        Entries::get_page(30, 0, 'received')
    ))), [Entries::STATUS_OK]);
check('Unverified page returns only unverified',
    array_values(array_unique(array_map(
        static fn($r) => $r->spam_result,
        Entries::get_page(30, 0, 'unverified')
    ))), [Entries::STATUS_UNVERIFIED]);
check('Spam page returns only spam',
    array_values(array_unique(array_map(
        static fn($r) => $r->spam_result,
        Entries::get_page(30, 0, 'spam')
    ))), ['spam:recaptcha']);

/* A mail-failed real message belongs in Received, not hidden away.
   Clear the rate-limit bucket first: four submissions have already gone
   through this section and the limiter would refuse the next one. */
$GLOBALS['TRANSIENTS'] = [];
$GLOBALS['MAIL_FAILS'] = true;
Form_Handler::process(post());
unset($GLOBALS['MAIL_FAILS']);
check('mail-failed stays in Received',     Entries::count('received'), 3);

/* Legacy rows written before the status vocabulary existed. */
Entries::insert([['label' => 'Name', 'value' => 'Old']], 'Legacy', 't1', '');
check('a legacy blank status lists as Received', Entries::count('received'), 4);

section('FIX 6. the same-origin referer check actually rejects');
reset_state();
$_SERVER['HTTP_REFERER'] = 'https://evil.example/';
$r = Form_Handler::process(post());
check('foreign referer REFUSED',           $r['ok'], false);
check('…with the verification message',    strpos($r['message'], 'could not be verified') !== false, true);
check('…and nothing stored',               count($GLOBALS['ROWS']), 0);
check('…and nothing emailed',              count($GLOBALS['MAILS']), 0);

$_SERVER['HTTP_REFERER'] = 'https://doracanalcourt.com.evil.example/contact/';
check('a lookalike suffix host REFUSED',   Form_Handler::process(post())['ok'], false);

$_SERVER['HTTP_REFERER'] = 'garbage-without-a-host';
check('an unparseable referer REFUSED',    Form_Handler::process(post())['ok'], false);

reset_state();
unset($_SERVER['HTTP_REFERER']);
check('an ABSENT referer is allowed',      Form_Handler::process(post())['ok'], true);

reset_state();
$_SERVER['HTTP_REFERER'] = '';
check('an EMPTY referer is allowed',       Form_Handler::process(post())['ok'], true);

reset_state();
$_SERVER['HTTP_REFERER'] = 'https://www.doracanalcourt.com/contact/';
check('the www. spelling is allowed',      Form_Handler::process(post())['ok'], true);

reset_state();
$_SERVER['HTTP_REFERER'] = 'https://doracanalcourt.com/some/other/page/';
check('any page on our own host is allowed', Form_Handler::process(post())['ok'], true);
$_SERVER['HTTP_REFERER'] = 'https://doracanalcourt.com/contact/';

check('Urls::same_host is www-insensitive', Urls::same_host('www.a.com', 'a.com'), true);
check('Urls::same_host rejects a suffix',   Urls::same_host('a.com.evil.net', 'a.com'), false);
check('Urls::same_host rejects empties',    Urls::same_host('', ''), false);

section('REGRESSION. the 1.7.0 fixes still hold');
reset_state();
check('absent dcc_ts still rejected',      Form_Handler::process(post(['dcc_ts' => null]))['ok'], false);
check('…recorded as spam:time',            last_row()->spam_result, 'spam:time');

reset_state();
for ($i = 0; $i < 3; $i++) { Form_Handler::process(post()); }
check('3 accepted',                        count($GLOBALS['MAILS']), 3);
$r = Form_Handler::process(post());
check('the 4th is rate-limited',           $r['ok'], false);
check('…as spam:rate',                     last_row()->spam_result, 'spam:rate');
check('no raw IP anywhere',
    strpos(json_encode([$GLOBALS['TRANSIENTS'], $GLOBALS['ROWS']]), '203.0.113.7') === false, true);

reset_state();
$GLOBALS['OPT']['dcc_contact_settings']['keyword_filter'] = "casino\nviagra";
$r = Form_Handler::process(post(['dcc_field' => ['f4' => 'this message mentions viagra for sale']]));
check('keyword filter still rejects',   $r['ok'], false);
check('…as spam:keyword',               last_row()->spam_result, 'spam:keyword');
check('…and keeps its content',
    strpos((string) last_row()->fields, 'viagra for sale') !== false, true);
check('a word-boundary false positive still avoided',
    Form_Handler::process(post(['dcc_field' => ['f4' => 'We attended a class in Cassino once.']]))['ok'], true);
$GLOBALS['OPT']['dcc_contact_settings']['keyword_filter'] = '';

/* ================================================================== */
printf("\n%s\n", $fail === 0
    ? sprintf('ALL %d CHECKS PASS', $pass)
    : sprintf('%d passed, %d FAILED', $pass, $fail));
exit($fail === 0 ? 0 : 1);

}
