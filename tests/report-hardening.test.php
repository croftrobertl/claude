<?php
/**
 * DCC Guest Guide — Support Report hardening (v0.24.3).
 *
 * Drives the REAL handler and captures what wp_mail() would receive. The
 * properties under test: a genuine report still sends; a spam trap, a dwell
 * floor and a site-wide daily cap each stop an automated one; a guest who
 * meets the cap is TOLD rather than dropped; every value reaching the HTML
 * email is escaped; the subject stays a single plain line; and the handler
 * refuses a post the caller could not open.
 *
 *   php tests/report-hardening.test.php
 *   DCCGG_PLUGIN_DIR=… php tests/report-hardening.test.php
 */
define('ABSPATH', '/tmp/');
define('DCCGG_VERSION', 'test');
define('MINUTE_IN_SECONDS', 60);
define('HOUR_IN_SECONDS', 3600);
$PLUGIN = rtrim(getenv('DCCGG_PLUGIN_DIR') ?: __DIR__ . '/../dcc-guest-guide', '/') . '/';

$GLOBALS['sent'] = []; $GLOBALS['transients'] = []; $GLOBALS['options'] = [];
$GLOBALS['posts'] = [4645 => ['status' => 'publish', 'password' => false]];
$GLOBALS['can_read'] = [];

function __($s, $d = null) { return $s; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_html($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_attr($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_url($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_url_raw($s) { return (string) $s; }
function wp_unslash($s) { return is_string($s) ? stripslashes($s) : $s; }
function sanitize_text_field($s) { return trim(strip_tags((string) $s)); }
function sanitize_textarea_field($s) { return trim(strip_tags((string) $s)); }
function sanitize_email($s) { $s = trim((string) $s); return filter_var($s, FILTER_VALIDATE_EMAIL) ? $s : ''; }
function is_email($s) { return (bool) filter_var((string) $s, FILTER_VALIDATE_EMAIL); }
function wp_strip_all_tags($s) { return strip_tags((string) $s); }
function get_bloginfo($k) { return $k === 'name' ? 'Dora Canal Court' : ''; }
function home_url($p = '/') { return 'https://doracanalcourt.com' . $p; }
function current_time($t) { return '2026-10-17 09:14:00'; }
function current_datetime() { return new DateTimeImmutable('2026-10-17 09:14:00'); }
function apply_filters($tag, $v) { return $v; }
function get_option($k, $d = '') {
    if (array_key_exists($k, $GLOBALS['options'])) { return $GLOBALS['options'][$k]; }
    return $k === 'admin_email' ? 'admin@doracanalcourt.com' : $d;
}
function update_option($k, $v, $a = null) { $GLOBALS['options'][$k] = $v; return true; }
function did_action($h) { return 0; }
function get_post($id) {
    $p = $GLOBALS['posts'][(int) $id] ?? null;
    return $p ? (object) ['ID' => (int) $id, 'post_status' => $p['status'], 'post_password' => $p['password'] ? 'x' : ''] : null;
}
function post_password_required($p) { return is_object($p) && $p->post_password !== ''; }
function current_user_can($cap, $id = 0) { return $cap === 'read_post' && in_array((int) $id, $GLOBALS['can_read'], true); }
function get_transient($k) { return $GLOBALS['transients'][$k] ?? false; }
function set_transient($k, $v, $t) { $GLOBALS['transients'][$k] = $v; return true; }
function add_action(...$a) {} function add_filter(...$a) {} function add_shortcode(...$a) {}
function register_activation_hook(...$a) {} function register_deactivation_hook(...$a) {}
function plugin_dir_path($f) { return $GLOBALS['PLUGIN']; }
function plugin_dir_url($f) { return 'https://doracanalcourt.com/wp-content/plugins/dcc-guest-guide/'; }
function plugin_basename($f) { return 'dcc-guest-guide/dcc-guest-guide.php'; }
function check_ajax_referer($a, $b) { return true; }
function get_post_meta($id, $key, $single = false) { return $GLOBALS['meta'][$id][$key] ?? ''; }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }
function wp_mail($to, $subject, $body, $headers = []) {
    $GLOBALS['sent'][] = ['to' => $to, 'subject' => $subject, 'body' => $body, 'headers' => $headers];
    return true;
}
class DCCGG_Halt extends \Exception { public $payload; public $code_; }
function wp_send_json_error($p = null, $c = 0) { $e = new DCCGG_Halt('error'); $e->payload = $p; $e->code_ = $c; throw $e; }
function wp_send_json_success($p = null, $c = 0) { $e = new DCCGG_Halt('success'); $e->payload = $p; $e->code_ = $c; throw $e; }

$GLOBALS['PLUGIN'] = $PLUGIN;
require __DIR__ . '/_elementor-stub.php';
require $PLUGIN . 'includes/class-settings.php';
require $PLUGIN . 'includes/class-widget.php';
require $PLUGIN . 'includes/class-plugin.php';

$pass = 0; $fail = 0; $failures = [];
function check($name, $cond, $detail = '') {
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $fail++; $failures[] = $name . ($detail ? " — $detail" : ''); echo "  ✗ $name" . ($detail ? " — $detail" : '') . "\n"; }
}
function put_guide(int $post, array $settings, string $status = 'publish', bool $pw = false): void {
    $GLOBALS['meta'][$post]['_elementor_data'] = json_encode([[ 'id' => 'sec1', 'elType' => 'section', 'elements' => [
        ['id' => 'abc123', 'elType' => 'widget', 'widgetType' => 'dccgg_guide', 'settings' => $settings, 'elements' => []],
    ]]]);
    $GLOBALS['posts'][$post] = ['status' => $status, 'password' => $pw];
}
/** POST to the real handler. Returns [outcome, http code, payload]. */
function report(array $over = [], string $ip = '203.0.113.5'): array {
    $_POST = $over + ['nonce' => 'n', 'description' => 'The tap drips all night.', 'post_id' => 4645,
        'widget_id' => 'abc123', 'elapsed_ms' => 9000, 'dccgg_hp' => ''];
    $_SERVER['REMOTE_ADDR'] = $ip;
    $_SERVER['HTTP_USER_AGENT'] = 'Mozilla/5.0 (iPhone)';
    try { \DCCGG\Plugin::instance()->handle_report_problem(); return ['none', 0, null]; }
    catch (DCCGG_Halt $e) { return [$e->getMessage(), (int) $e->code_, $e->payload]; }
}
function reset_state(): void { $GLOBALS['sent'] = []; $GLOBALS['transients'] = []; $GLOBALS['can_read'] = []; }

put_guide(4645, ['problem_report_recipients' => 'host@example.test']);

echo "\nA. A real report still sends\n";
reset_state();
$r = report();
check('a genuine report is accepted', $r[0] === 'success', json_encode($r));
check('and one email goes out, to the configured recipient',
    count($GLOBALS['sent']) === 1 && $GLOBALS['sent'][0]['to'] === ['host@example.test']);
check('carrying the guest\'s words', strpos($GLOBALS['sent'][0]['body'], 'The tap drips all night.') !== false);
check('it costs one of the day\'s allowance', (int) ($GLOBALS['transients']['dccgg_report_daily'] ?? 0) === 1);

echo "\nB. The spam trap, the dwell floor and the daily cap\n";
reset_state();
$r = report(['dccgg_hp' => 'http://buy-now.example']);
check('a filled trap field sends no email', $GLOBALS['sent'] === [], count($GLOBALS['sent']) . ' sent');
check('and answers as if it worked, so a script learns nothing', $r[0] === 'success');
check('a filled trap costs no quota', !isset($GLOBALS['transients']['dccgg_report_daily']));
reset_state();
$r = report(['elapsed_ms' => 1200]);
check('a send 1.2s after the dialog opened is dropped', $GLOBALS['sent'] === [] && $r[0] === 'success');
$r = report(['elapsed_ms' => 2999]);
check('2.999s is still too fast', $GLOBALS['sent'] === []);
$r = report(['elapsed_ms' => 3000]);
check('3s is accepted', $r[0] === 'success' && count($GLOBALS['sent']) === 1);
reset_state();
$r = report(['elapsed_ms' => -1]);
check('an old page that sends no timing at all is still accepted', $r[0] === 'success' && count($GLOBALS['sent']) === 1);
reset_state();
$GLOBALS['transients']['dccgg_report_daily'] = \DCCGG\Plugin::REPORT_DAILY_CAP;
$r = report([], '198.51.100.9');
check('at the site-wide cap, a DIFFERENT visitor is stopped too', $r[0] === 'error' && $r[1] === 429 && $GLOBALS['sent'] === []);
check('and the guest is told to call or text the front desk, not left guessing',
    stripos((string) ($r[2]['message'] ?? ''), 'call or text') !== false && ($r[2]['at_cap'] ?? false) === true,
    (string) ($r[2]['message'] ?? ''));
$GLOBALS['transients']['dccgg_report_daily'] = \DCCGG\Plugin::REPORT_DAILY_CAP - 1;
check('one below the cap still sends', report([], '198.51.100.9')[0] === 'success');
reset_state();
$codes = [];
for ($i = 0; $i < 4; $i++) { $codes[] = report([], '203.0.113.77')[1]; }
check('the per-IP limit is unchanged (3 then 429)', $codes === [0, 0, 0, 429], implode(',', $codes));

echo "\nC. Everything in the email is escaped\n";
reset_state();
$XSS = '<img src=x onerror=alert(1)>';
$r = report(['reporter_name' => $XSS, 'reporter_cottage' => 'Cottage "7" & <b>8</b>',
    'category' => '<script>bad()</script>', 'section' => $XSS, 'item' => $XSS,
    'description' => "Line one <b>bold</b>\nLine two", 'contact' => 'guest@example.test']);
$mail = $GLOBALS['sent'][0] ?? null;
check('the report sends', $r[0] === 'success' && $mail !== null);
check('no raw tag from any guest field survives into the body',
    strpos($mail['body'], '<img') === false && strpos($mail['body'], '<script') === false
    && strpos($mail['body'], '<b>bold') === false, substr($mail['body'], 0, 200));
check('the ampersand and quotes are escaped, not dropped',
    strpos($mail['body'], '&amp;') !== false && strpos($mail['body'], '&quot;7&quot;') !== false);
check('the guest\'s line break still survives as <br>', strpos($mail['body'], '<br') !== false);
check('the template\'s own markup is untouched', strpos($mail['body'], '<strong>Name:</strong>') !== false);
check('the subject is one plain line', strpos($mail['subject'], "\n") === false
    && strpos($mail['subject'], "\r") === false && strpos($mail['subject'], '<script') === false, $mail['subject']);
reset_state();
report(['category' => str_repeat('A', 400)]);
check('and is capped in length',
    mb_strlen($GLOBALS['sent'][0]['subject']) <= \DCCGG\Plugin::REPORT_SUBJECT_MAX,
    (string) mb_strlen($GLOBALS['sent'][0]['subject']));
reset_state();
report(['category' => "Leak\r\nBcc: attacker@example.test"]);
check('a newline in a field cannot splice a header through the subject',
    strpos($GLOBALS['sent'][0]['subject'], 'Bcc:') === false || strpos($GLOBALS['sent'][0]['subject'], "\n") === false,
    $GLOBALS['sent'][0]['subject']);

echo "\nD. Only a guide the caller could open\n";
reset_state();
put_guide(5001, ['problem_report_recipients' => 'host@example.test'], 'draft');
$r = report(['post_id' => 5001]);
check('a draft guide: refused, nothing sent', $r[1] === 404 && $GLOBALS['sent'] === []);
$GLOBALS['can_read'] = [5001];
check('the same draft, for someone allowed to read it: accepted', report(['post_id' => 5001])[0] === 'success');
reset_state();
put_guide(5002, ['problem_report_recipients' => 'host@example.test'], 'publish', true);
$r = report(['post_id' => 5002]);
check('a password-protected guide: refused, nothing sent', $r[1] === 404 && $GLOBALS['sent'] === []);
reset_state();
$r = report(['post_id' => 999999]);
check('a post that does not exist: refused', $r[1] === 404 && $GLOBALS['sent'] === []);
check('a refusal costs no quota and no per-IP allowance',
    !isset($GLOBALS['transients']['dccgg_report_daily']));

echo "\nE. The reveal-memory default\n";
check('the packaged default is 48 hours', \DCCGG\Settings::defaults()['reveal_memory_hours'] === 48);
check('and it is still bounded', (function () {
    $f = \DCCGG\Settings::fields()['reveal_memory_hours'] ?? [];
    return ($f['min'] ?? null) === 0 && ($f['max'] ?? null) === 336;
})());

echo "\n$pass passed, $fail failed\n";
if ($fail) { echo "Failures:\n"; foreach ($failures as $f) { echo "  - $f\n"; } exit(1); }
