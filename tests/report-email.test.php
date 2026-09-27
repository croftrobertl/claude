<?php
/**
 * DCC Guest Guide — problem-report email tests.
 *
 * Drives the REAL handler (Plugin::handle_report_problem) with the real
 * widget-settings lookup behind it, and captures the exact arguments handed
 * to wp_mail(). What this cannot do is watch the message leave the server:
 * everything after wp_mail() belongs to WordPress and the host's SMTP. So
 * these assertions are about the envelope this plugin constructs — To,
 * Subject, every header, and the body — which is the part that decides
 * whether the message is DMARC-aligned.
 *
 *   php tests/report-email.test.php
 */
define('ABSPATH', '/tmp/');
define('DCCGG_VERSION', 'test');
define('MINUTE_IN_SECONDS', 60);

$GLOBALS['sent'] = [];
$GLOBALS['transients'] = [];

function __($s, $d = null) { return $s; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_html($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_attr($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_url($s) { return (string) $s; }
function esc_url_raw($s) { return (string) $s; }
function wp_unslash($s) { return is_string($s) ? stripslashes($s) : $s; }
function sanitize_text_field($s) { return trim(strip_tags((string) $s)); }
function sanitize_textarea_field($s) { return trim(strip_tags((string) $s)); }
function sanitize_email($s) { $s = trim((string) $s); return filter_var($s, FILTER_VALIDATE_EMAIL) ? $s : ''; }
function is_email($s) { return (bool) filter_var((string) $s, FILTER_VALIDATE_EMAIL); }
function get_bloginfo($k) { return $k === 'name' ? 'Dora Canal Court' : ''; }
function home_url($p = '/') { return 'https://doracanalcourt.com' . $p; }
function current_time($t) { return '2026-09-12 09:14:00'; }
function get_option($k, $d = '') {
    if (array_key_exists($k, $GLOBALS['options'] ?? [])) { return $GLOBALS['options'][$k]; }
    return $k === 'admin_email' ? 'admin@doracanalcourt.com' : $d;
}
function get_post($id) { return in_array((int) $id, [4645], true) ? (object) ['ID' => (int) $id, 'post_status' => 'publish'] : null; }
function post_password_required($p) { return false; }
function nocache_headers() {}
function get_transient($k) { return $GLOBALS['transients'][$k] ?? false; }
function set_transient($k, $v, $t) { $GLOBALS['transients'][$k] = $v; return true; }
function add_action(...$a) {}
function add_filter(...$a) {}
function add_shortcode(...$a) {}
function register_activation_hook(...$a) {}
function register_deactivation_hook(...$a) {}
function plugin_dir_path($f) { return __DIR__ . '/../dcc-guest-guide/'; }
function plugin_dir_url($f) { return 'https://doracanalcourt.com/wp-content/plugins/dcc-guest-guide/'; }
function plugin_basename($f) { return 'dcc-guest-guide/dcc-guest-guide.php'; }
function check_ajax_referer($a, $b) { return true; }
function get_post_meta($id, $key, $single = false) { return $GLOBALS['meta'][$id][$key] ?? ''; }
function wp_mail($to, $subject, $body, $headers = []) {
    $GLOBALS['sent'][] = ['to' => $to, 'subject' => $subject, 'body' => $body, 'headers' => $headers];
    return true;
}
class DCCGG_Halt extends \Exception { public $payload; public $code_; }
function wp_send_json_error($p = null, $c = 0) { $e = new DCCGG_Halt('error'); $e->payload = $p; $e->code_ = $c; throw $e; }
function wp_send_json_success($p = null, $c = 0) { $e = new DCCGG_Halt('success'); $e->payload = $p; $e->code_ = $c; throw $e; }

require __DIR__ . '/_elementor-stub.php';
// v0.23.0: the renderer and the handlers read plugin settings.
if (!function_exists('get_option'))    { function get_option($k, $d = false) { return $GLOBALS['options'][$k] ?? $d; } }
if (!function_exists('update_option')) { function update_option($k, $v, $a = null) { $GLOBALS['options'][$k] = $v; return true; } }
if (!function_exists('did_action'))    { function did_action($h) { return 0; } }
require __DIR__ . '/../dcc-guest-guide/includes/class-settings.php';

require __DIR__ . '/../dcc-guest-guide/includes/class-plugin.php';

$pass = 0; $fail = 0; $failures = [];
function check($name, $cond, $detail = '') {
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $fail++; $failures[] = $name . ($detail ? " — $detail" : ''); echo "  ✗ $name" . ($detail ? " — $detail" : '') . "\n"; }
}

/** Build an Elementor tree carrying the guide widget's saved settings. */
function elementor_tree(array $settings): string {
    return json_encode([[
        'id' => 'sec1', 'elType' => 'section', 'elements' => [[
            'id' => 'col1', 'elType' => 'column', 'elements' => [[
                'id' => 'abc123', 'elType' => 'widget', 'widgetType' => 'dccgg_guide',
                'settings' => $settings,
            ]],
        ]],
    ]]);
}

/** POST a report exactly as widget.js does, and return what wp_mail got. */
function submit(array $widget_settings, array $overrides = []): ?array {
    $GLOBALS['sent'] = [];
    $GLOBALS['transients'] = [];
    $GLOBALS['meta'] = [4645 => ['_elementor_data' => elementor_tree($widget_settings)]];
    $_SERVER['REMOTE_ADDR'] = '203.0.113.9';
    $_SERVER['HTTP_USER_AGENT'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) Safari/605.1.15';
    $_POST = array_merge([
        'action'           => 'dccgg_report_problem',
        'category'         => 'Something is broken',
        'description'      => "The dock light is out.\nSecond line.",
        'contact'          => 'guest@gmail.com',
        'reporter_name'    => 'Jane Guest',
        'reporter_cottage' => 'Cottage 4',
        'reporter_phone'   => '352-555-0134',
        'section'          => 'Amenities',
        'item'             => 'Boat lift',
        'page_url'         => 'https://doracanalcourt.com/guest/',
        'post_id'          => 4645,
        'widget_id'        => 'abc123',
    ], $overrides);
    try { \DCCGG\Plugin::instance()->handle_report_problem(); }
    catch (DCCGG_Halt $e) { /* the handler always ends in a json response */ }
    return $GLOBALS['sent'][0] ?? null;
}

// The configuration the host intends: reports to contact@, sent as support@
// so the envelope is aligned with the domain's DMARC policy.
$INTENDED = [
    'problem_report_recipients' => "contact@doracanalcourt.com",
    'problem_report_from_email' => 'support@doracanalcourt.com',
    'problem_report_from_name'  => 'Dora Canal Court Guest Guide',
];

echo "A. The message the plugin hands to wp_mail()\n";
$m = submit($INTENDED);
check('a message is sent', $m !== null);
if ($m) {
    echo "\n  --- captured message ---\n";
    echo "  To:      " . implode(', ', (array) $m['to']) . "\n";
    echo "  Subject: " . $m['subject'] . "\n";
    foreach ($m['headers'] as $h) { echo "  " . $h . "\n"; }
    echo "  --- body ---\n";
    foreach (explode("\n", $m['body']) as $line) { echo "  " . $line . "\n"; }
    echo "  --- end ---\n\n";

    check('goes to contact@doracanalcourt.com',
        in_array('contact@doracanalcourt.com', (array) $m['to'], true), implode(',', (array) $m['to']));
    check('From: is the aligned support@ address, not the guest',
        in_array('From: Dora Canal Court Guest Guide <support@doracanalcourt.com>', $m['headers'], true),
        implode(' | ', $m['headers']));
    check('the guest address is Reply-To, never From',
        in_array('Reply-To: guest@gmail.com', $m['headers'], true)
        && !preg_grep('/^From:.*guest@gmail\.com/', $m['headers']));
    check('the item name is in the body', strpos($m['body'], 'Boat lift') !== false);
    check('the cottage is in the body', strpos($m['body'], 'Cottage 4') !== false);
    check('the section and page are in the body',
        strpos($m['body'], 'Amenities') !== false
        && strpos($m['body'], 'https://doracanalcourt.com/guest/') !== false);
    check('sent as HTML', in_array('Content-Type: text/html; charset=UTF-8', $m['headers'], true));
    check('the guest\'s line breaks survive', strpos($m['body'], '<br />') !== false || strpos($m['body'], '<br>') !== false);
}

echo "\nB. With no From configured — the DMARC-relevant default\n";
$noFrom = $INTENDED; unset($noFrom['problem_report_from_email']);
$m2 = submit($noFrom);
check('the plugin emits NO From header at all',
    $m2 && !preg_grep('/^From:/i', $m2['headers']),
    $m2 ? implode(' | ', $m2['headers']) : 'no message');
check('so WordPress supplies its own default sender (not the guest)',
    $m2 && !preg_grep('/guest@gmail\.com/', array_filter($m2['headers'], fn($h) => stripos($h, 'From:') === 0)));

echo "\nC. The guest can never become the sender\n";
// A guest supplying a lookalike address, and an attempt to splice a header.
$m3 = submit($INTENDED, ['contact' => "attacker@evil.test\r\nBcc: leak@evil.test"]);
check('a CRLF in the guest email cannot add a Bcc',
    $m3 && !preg_grep('/^Bcc:/i', $m3['headers']), $m3 ? implode(' | ', $m3['headers']) : '');
$injected = $INTENDED;
$injected['problem_report_from_name'] = "Guide\r\nBcc: leak@evil.test";
$m4 = submit($injected);
check('a CRLF in the From name cannot add a Bcc',
    $m4 && !preg_grep('/^Bcc:/i', $m4['headers'])
    && count(preg_grep('/^From:/', $m4['headers'])) === 1,
    $m4 ? implode(' | ', $m4['headers']) : '');

echo "\nD. Recipients fall back to the site admin, never to nobody\n";
$noRcpt = $INTENDED; $noRcpt['problem_report_recipients'] = '';
$m5 = submit($noRcpt);
check('an unconfigured recipient list falls back to admin_email',
    $m5 && in_array('admin@doracanalcourt.com', (array) $m5['to'], true),
    $m5 ? implode(',', (array) $m5['to']) : 'no message');

echo "\nE. Rate limiting still holds\n";
$GLOBALS['transients'] = [];
$GLOBALS['meta'] = [4645 => ['_elementor_data' => elementor_tree($INTENDED)]];
$sentCount = 0;
for ($i = 0; $i < 5; $i++) {
    $GLOBALS['sent'] = [];
    $_POST = ['action' => 'dccgg_report_problem', 'description' => 'test', 'section' => 'Amenities',
              'item' => 'Boat lift', 'post_id' => 4645, 'widget_id' => 'abc123'];
    $_SERVER['REMOTE_ADDR'] = '203.0.113.9';
    try { \DCCGG\Plugin::instance()->handle_report_problem(); } catch (DCCGG_Halt $e) {}
    $sentCount += count($GLOBALS['sent']);
}
check('at most 3 reports per IP per 15 minutes', $sentCount === 3, "sent $sentCount");


echo "\nF. Every setting changes an outcome (v0.23.0) — server side\n";
// The standing rule after v0.21.0: a test that proves the default EQUALS
// current behaviour proves nothing about whether the code READS the setting.
// Each of these flips a setting and watches the handler do something else.
if (!defined('DCCGG_DIR')) { define('DCCGG_DIR', __DIR__ . '/../dcc-guest-guide/'); }
if (!defined('DCCGG_URL')) { define('DCCGG_URL', 'https://doracanalcourt.com/wp-content/plugins/dcc-guest-guide/'); }
$setSettings = static function (array $over) {
    $GLOBALS['options'][\DCCGG\Settings::OPTION] = array_merge(\DCCGG\Settings::defaults(), $over, ['_version' => DCCGG_VERSION]);
    \DCCGG\Settings::flush();
};

// report_rate_limit: with 1, the second report is refused.
$countSent = static function (int $limit) use ($INTENDED): int {
    $GLOBALS['transients'] = [];
    $GLOBALS['meta'] = [4645 => ['_elementor_data' => elementor_tree($INTENDED)]];
    $n = 0;
    for ($i = 0; $i < 4; $i++) {
        $GLOBALS['sent'] = [];
        $_POST = ['description' => 'x', 'section' => 'A', 'item' => 'B', 'post_id' => 4645, 'widget_id' => 'abc123'];
        $_SERVER['REMOTE_ADDR'] = '203.0.113.9';
        try { \DCCGG\Plugin::instance()->handle_report_problem(); } catch (DCCGG_Halt $e) {}
        $n += count($GLOBALS['sent']);
    }
    return $n;
};
$setSettings(['report_rate_limit' => 1]);
$one = $countSent(1);
$setSettings(['report_rate_limit' => 3]);
$three = $countSent(3);
check('report_rate_limit: 1 allows one report, 3 allows three', $one === 1 && $three === 3, "$one / $three");

// log_search_misses + search_miss_keep, through the real handler.
function _miss(string $q): void {
    $_POST = ['q' => $q, 'nonce' => 'n'];
    $_SERVER['REMOTE_ADDR'] = '203.0.113.' . random_int(1, 250);
    try { \DCCGG\Plugin::instance()->handle_search_miss(); } catch (DCCGG_Halt $e) {}
}
$GLOBALS['options']['dccgg_search_misses'] = [];
$GLOBALS['transients'] = [];
$setSettings(['log_search_misses' => false]);
_miss('hot tub cover');
check('log_search_misses=false stores nothing', empty($GLOBALS['options']['dccgg_search_misses']));
$setSettings(['log_search_misses' => true, 'search_miss_keep' => 5]);
$GLOBALS['transients'] = [];
foreach (['a1','b2','c3','d4','e5','f6','g7','h8'] as $q) { _miss($q . ' query'); }
check('search_miss_keep=5 caps the stored list at 5',
    count($GLOBALS['options']['dccgg_search_misses']) === 5, (string) count($GLOBALS['options']['dccgg_search_misses']));
$setSettings(['log_search_misses' => true, 'search_miss_keep' => 200]);
$GLOBALS['transients'] = []; $GLOBALS['options']['dccgg_search_misses'] = [];
foreach (['a1','b2','c3','d4','e5','f6','g7','h8'] as $q) { _miss($q . ' query'); }
check('and the default keeps all eight', count($GLOBALS['options']['dccgg_search_misses']) === 8);

// #9 reveal rate limit: the 61st reveal from one IP in a window is refused.
$GLOBALS['transients'] = [];
$GLOBALS['meta'] = [4645 => ['_elementor_data' => elementor_tree(['guide_items' => [
    ['_id' => 'r1', 'item_section' => 'internet', 'item_title' => 'Wifi', 'item_copy' => 'yes',
     'item_copy_value' => 'DCC32586', 'item_mask_value' => 'yes'],
]])]];
$codes = [];
for ($i = 0; $i < 62; $i++) {
    $_POST = ['post_id' => 4645, 'widget_id' => 'abc123', 'ref' => 'id:r1', 'nonce' => 'n'];
    $_SERVER['REMOTE_ADDR'] = '203.0.113.77';
    try { \DCCGG\Plugin::instance()->handle_reveal_secret(); $codes[] = 200; }
    catch (DCCGG_Halt $e) { $codes[] = $e->getMessage() === 'success' ? 200 : (int) $e->code_; }
}
check('reveal: 60 succeed, the 61st is rate-limited',
    count(array_filter($codes, static fn($c) => $c === 200)) === 60 && $codes[60] === 429 && $codes[61] === 429,
    'codes ' . implode(',', array_slice($codes, 58, 4)));

// #5 the legacy redirect must leave the fallback page alone.
$redirected = [];
if (!function_exists('wp_safe_redirect')) { function wp_safe_redirect($u) { $GLOBALS['redirected'][] = $u; throw new DCCGG_Halt('redirect'); } }
if (!function_exists('admin_url')) { function admin_url($p = '') { return 'https://x/wp-admin/' . $p; } }
if (!function_exists('current_user_can')) { function current_user_can($c, $id = 0) { return true; } }
$GLOBALS['pagenow'] = 'options-general.php'; $_GET = ['page' => 'dccgg-settings'];
$GLOBALS['admin_page_hooks'] = [];                                   // no dcc parent
// v0.23.1: each call is counted on its own. The second check used to count
// both calls together, so on v0.22.0 (which always redirected) it saw TWO and
// failed for the wrong reason.
$redirectsFor = static function (array $hooks): array {
    $GLOBALS['admin_page_hooks'] = $hooks;
    $GLOBALS['redirected'] = [];
    try { \DCCGG\Plugin::instance()->redirect_legacy_settings_url(); } catch (DCCGG_Halt $e) {}
    return $GLOBALS['redirected'];
};
$none = $redirectsFor([]);                                          // no dcc parent
check('#5 with NO dcc parent the fallback URL is not redirected away', $none === [], implode(',', $none));
$with = $redirectsFor(['dcc' => 'toplevel_page_dcc']);              // parent present
check('#5 with the parent present the old URL forwards, once, to the dcc page',
    $with === ['https://x/wp-admin/admin.php?page=dccgg-settings'], implode(',', $with));

// #8 the priority-30 submenu is skipped when there is no parent; the
// 990 fallback then registers under Settings — and not the other way round.
$GLOBALS['registered'] = [];
if (!function_exists('add_submenu_page')) { function add_submenu_page(...$a) { $GLOBALS['registered'][] = 'submenu:' . $a[0]; return 'hook'; } }
if (!function_exists('add_options_page')) { function add_options_page(...$a) { $GLOBALS['registered'][] = 'options'; return 'hook'; } }
$GLOBALS['admin_page_hooks'] = [];
\DCCGG\Plugin::instance()->register_settings_page();
\DCCGG\Plugin::instance()->register_settings_fallback();
check('#8 no parent: only the Settings fallback registers', $GLOBALS['registered'] === ['options'], implode(',', $GLOBALS['registered']));
$GLOBALS['registered'] = []; $GLOBALS['admin_page_hooks'] = ['dcc' => 'x'];
\DCCGG\Plugin::instance()->register_settings_page();
\DCCGG\Plugin::instance()->register_settings_fallback();
check('#8 parent present: only the dcc submenu registers', $GLOBALS['registered'] === ['submenu:dcc'], implode(',', $GLOBALS['registered']));

// #6 the service worker precaches the guest bundle when the split is on.
$setSettings(['split_guest_css' => true]);
$on  = \DCCGG\Plugin::instance()->sw_precache_list('https://x/guest/');
$setSettings(['split_guest_css' => false]);
$off = \DCCGG\Plugin::instance()->sw_precache_list('https://x/guest/');
$has = static fn(array $l) => (bool) array_filter($l, static fn($u) => strpos($u, 'widget-guest.min.css') !== false);
check('#6 split on: widget-guest.min.css is precached', $has($on) && count($on) === 4, implode(' ', $on));
check('#6 split off: it is not', !$has($off) && count($off) === 3);

echo "\n$pass passed, $fail failed\n";
if ($fail) { echo "Failures:\n"; foreach ($failures as $f) { echo "  - $f\n"; } exit(1); }
