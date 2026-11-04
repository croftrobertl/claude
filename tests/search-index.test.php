<?php
/**
 * DCC Guest Guide — search-index endpoint, public mode (v0.27.7, S2).
 *
 * Drives the REAL handler, Plugin::handle_search_index(), with the real
 * widget lookup and the real index builder behind it. The property under
 * test: a widget that is itself in public mode can only ever answer with its
 * public sections. Before v0.27.7 this endpoint — which is wp_ajax_nopriv and
 * returns every item's text to an anonymous caller — applied no audience
 * filter at all, while handle_ai_query() next door did.
 *
 * The second property is just as important and is the reason the brief says
 * "no change for /guest/ or /test/": a GUEST widget must still answer with
 * its full index. Public mode is a property of the widget being named, not
 * of the caller, so this endpoint must not start guessing.
 *
 *   php tests/search-index.test.php
 *   DCCGG_PLUGIN_DIR=/path/to/dcc-guest-guide php tests/search-index.test.php   (mutation runs)
 */
define('ABSPATH', '/tmp/');
define('DCCGG_VERSION', 'test');
define('MINUTE_IN_SECONDS', 60);
define('HOUR_IN_SECONDS', 3600);
// Honour DCCGG_PLUGIN_DIR for every file this harness READS, not just the
// first: twice now a mutation run has reported healthy survivors because the
// harness loaded the real plugin instead of the mutant.
$GLOBALS["PLUGIN"] = $PLUGIN = rtrim(getenv('DCCGG_PLUGIN_DIR') ?: __DIR__ . '/../dcc-guest-guide', '/') . '/';

$GLOBALS['transients'] = [];
$GLOBALS['posts'] = [];
$GLOBALS['can_read'] = [];
$GLOBALS['meta'] = [];
$GLOBALS['options'] = [];

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
function wp_kses_post($s) { return (string) $s; }
function wp_strip_all_tags($s) { return strip_tags((string) $s); }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }
function wpautop($s) { return (string) $s; }
function apply_filters($tag, $v) { return $v; }
function get_option($k, $d = false) { return $GLOBALS['options'][$k] ?? $d; }
function update_option($k, $v, $a = null) { $GLOBALS['options'][$k] = $v; return true; }
function did_action($h) { return 0; }
function absint($n) { return abs((int) $n); }
function sanitize_html_class($s) { return preg_replace('/[^A-Za-z0-9_-]/', '', (string) $s); }
function wp_unique_id($p = '') { static $i = 0; return $p . (++$i); }
function get_post($id) {
    $p = $GLOBALS['posts'][(int) $id] ?? null;
    return $p ? (object) ['ID' => (int) $id, 'post_status' => $p['status'],
        'post_password' => $p['password'] ? 'x' : ''] : null;
}
function post_password_required($p) { return is_object($p) && $p->post_password !== ''; }
function current_user_can($cap, $id = 0) { return $cap === 'read_post' && in_array((int) $id, $GLOBALS['can_read'], true); }
function get_transient($k) { return $GLOBALS['transients'][$k] ?? false; }
function set_transient($k, $v, $t) { $GLOBALS['transients'][$k] = $v; return true; }
function delete_transient($k) { unset($GLOBALS['transients'][$k]); return true; }
function current_datetime() { return new DateTimeImmutable('2026-11-04 15:00:00'); }
function add_action(...$a) {}
function add_filter(...$a) {}
function add_shortcode(...$a) {}
function register_activation_hook(...$a) {}
function register_deactivation_hook(...$a) {}
function plugin_dir_path($f) { return $GLOBALS['PLUGIN']; }
function plugin_dir_url($f) { return 'https://doracanalcourt.com/wp-content/plugins/dcc-guest-guide/'; }
function plugin_basename($f) { return 'dcc-guest-guide/dcc-guest-guide.php'; }
function check_ajax_referer($a, $b) { return true; }
function get_post_meta($id, $key, $single = false) { return $GLOBALS['meta'][$id][$key] ?? ''; }
function is_wp_error($x) { return false; }
function nocache_headers() {}

class DCCGG_Halt extends \Exception { public $payload; public $code_; }
function wp_send_json_error($p = null, $c = 0) { $e = new DCCGG_Halt('error'); $e->payload = $p; $e->code_ = $c; throw $e; }
function wp_send_json_success($p = null, $c = 0) { $e = new DCCGG_Halt('success'); $e->payload = $p; $e->code_ = $c; throw $e; }

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

// ---- Fixtures --------------------------------------------------------
// Shaped like the real guide: a public-tagged marketing section, a 'both',
// a guest-only section holding the credentials, and — deliberately — a
// LEGACY section with no audience key at all, which must resolve to
// guest-only. Omission can never leak.
const SECRET = 'DCC32586';
const POOL_TEXT = 'Open eight to ten. Towels in the shed.';
const RULES_TEXT = 'No smoking anywhere on the property.';

function guide(string $mode): array {
    return [
        'guide_mode' => $mode,
        'enable_ai_search' => 'yes',
        'enable_problem_report' => 'yes',
        'guide_sections' => [
            ['section_key' => 'amenities', 'section_title' => 'Amenities', 'section_audience' => 'public'],
            ['section_key' => 'pool',      'section_title' => 'Pool',      'section_audience' => 'both'],
            ['section_key' => 'wifi',      'section_title' => 'Internet',  'section_audience' => 'guest'],
            ['section_key' => 'rules',     'section_title' => 'Rules'],   // legacy: no audience key
        ],
        'guide_items' => [
            ['item_section' => 'amenities', 'item_title' => 'Laundromat', 'item_content' => '<p>Washers are two dollars.</p>'],
            ['item_section' => 'pool',      'item_title' => 'Pool hours', 'item_content' => '<p>' . POOL_TEXT . '</p>'],
            ['item_section' => 'wifi',      'item_title' => 'Wifi #1',    'item_content' => '<p>Join the cottage network.</p>',
             'item_copy' => 'yes', 'item_copy_value' => SECRET, 'item_mask_value' => 'yes',
             'item_wifi_mode' => 'yes', 'wifi_ssid' => 'topoftheworld'],
            ['item_section' => 'rules',     'item_title' => 'No Smoking', 'item_content' => '<p>' . RULES_TEXT . '</p>'],
        ],
    ];
}
function put(int $post, array $widgets, string $status = 'publish', bool $password = false): void {
    $els = [];
    foreach ($widgets as $id => [$type, $settings]) {
        $els[] = ['id' => $id, 'elType' => 'widget', 'widgetType' => $type, 'settings' => $settings, 'elements' => []];
    }
    $GLOBALS['meta'][$post]['_elementor_data'] = json_encode([['id' => 's1', 'elType' => 'section', 'elements' => $els]]);
    $GLOBALS['posts'][$post] = ['status' => $status, 'password' => $password];
}
/** GET/POST the real handler. Returns [outcome, http code, payload]. */
function ask(array $req): array {
    $_REQUEST = $_POST = $req + ['nonce' => 'n'];
    try { \DCCGG\Plugin::instance()->handle_search_index(); return ['none', 0, null]; }
    catch (DCCGG_Halt $e) { return [$e->getMessage(), (int) $e->code_, $e->payload]; }
}
function sections(array $r): array {
    $out = [];
    foreach (($r[2]['index'] ?? []) as $e) { $out[$e['section']] = true; }
    $k = array_keys($out); sort($k); return $k;
}
function blob(array $r): string { return json_encode($r[2]['index'] ?? []); }

// Two widgets on one post: the guest guide, and a second one in public mode.
put(4645, [
    'guestw' => ['dccgg_guide', guide('full')],
    'publicw' => ['dccgg_guide', guide('public')],
]);

echo "\nA. A widget in public mode answers with its public sections only\n";
$GLOBALS['transients'] = [];
$r = ask(['post_id' => 4645, 'widget_id' => 'publicw']);
check('the request succeeds', $r[0] === 'success', json_encode($r[1]));
check('only the public and both sections come back',
    sections($r) === ['amenities', 'pool'], json_encode(sections($r)));
check('the guest-only wifi section is absent', !in_array('wifi', sections($r), true));
check('the LEGACY section with no audience key is absent too',
    !in_array('rules', sections($r), true), 'omission must never leak');
check('no guest item text appears anywhere in the payload',
    strpos(blob($r), RULES_TEXT) === false && strpos(blob($r), 'cottage network') === false);
check('the Wi-Fi SSID does not appear', strpos(blob($r), 'topoftheworld') === false);
check('the masked value never appears', strpos(blob($r), SECRET) === false);

echo "\nB. A guest widget is unchanged — this is what /guest/ and /test/ do\n";
$GLOBALS['transients'] = [];
$r = ask(['post_id' => 4645, 'widget_id' => 'guestw']);
check('the request succeeds', $r[0] === 'success');
check('every section comes back, legacy included',
    sections($r) === ['amenities', 'pool', 'rules', 'wifi'], json_encode(sections($r)));
check('guest item text IS present, as it must be for the guide to search',
    strpos(blob($r), RULES_TEXT) !== false);
check('the Wi-Fi SSID IS present — a network name is not a secret',
    strpos(blob($r), 'topoftheworld') !== false);
check('but the masked value is still excluded, in guest mode too',
    strpos(blob($r), SECRET) === false, 'the index is inlined into data-config');

echo "\nC. A warm cache for one mode never answers the other\n";
// WHAT THIS DOES AND DOES NOT PIN, measured rather than assumed.
//
// It does NOT pin the ordering on its own. Moving the filter to AFTER the
// cache lookup leaves all 22 assertions green, because guide_mode is itself
// part of the hashed settings, so a public and a guest widget can never
// collide on a key. That mutant is equivalent, and it is recorded as such in
// the runner rather than dressed up as a kill.
//
// What it DOES pin is the compound failure the ordering is insurance
// against: drop the mode from the key AND filter after the lookup, and the
// two widgets share a transient. Verified — that mutant fails all three
// assertions below, in both directions. Either half alone is harmless, which
// is exactly why the safe order is worth keeping.
$GLOBALS['transients'] = [];
ask(['post_id' => 4645, 'widget_id' => 'guestw']);          // warms a full index
$r = ask(['post_id' => 4645, 'widget_id' => 'publicw']);    // must not get it
check('a public request after a guest request is still public-only',
    sections($r) === ['amenities', 'pool'], json_encode(sections($r)));
check('and still carries no guest text', strpos(blob($r), RULES_TEXT) === false);
// ...and the reverse order, so neither direction can be the lucky one.
$GLOBALS['transients'] = [];
ask(['post_id' => 4645, 'widget_id' => 'publicw']);
$r = ask(['post_id' => 4645, 'widget_id' => 'guestw']);
check('a guest request after a public request is still complete',
    sections($r) === ['amenities', 'pool', 'rules', 'wifi'], json_encode(sections($r)));

echo "\nD. Served from cache, the public answer is still filtered\n";
$GLOBALS['transients'] = [];
$first = ask(['post_id' => 4645, 'widget_id' => 'publicw']);
$second = ask(['post_id' => 4645, 'widget_id' => 'publicw']);
check('the second request is a cache hit (a transient was written)',
    count($GLOBALS['transients']) > 0);
check('and returns exactly the same public-only index',
    blob($first) === blob($second) && sections($second) === ['amenities', 'pool']);

echo "\nE. The visibility guard still comes first\n";
// v0.24.3's guard is not replaced by the new filter: a caller must not be
// able to name a draft or password-protected page at all, whatever its mode.
put(777, ['publicw' => ['dccgg_guide', guide('public')]], 'draft');
$GLOBALS['transients'] = [];
$r = ask(['post_id' => 777, 'widget_id' => 'publicw']);
check('a draft page answers 404, not an index', $r[0] === 'error' && $r[1] === 404, json_encode($r));
put(778, ['guestw' => ['dccgg_guide', guide('full')]], 'publish', true);
$r = ask(['post_id' => 778, 'widget_id' => 'guestw']);
check('a password-protected page answers 404', $r[0] === 'error' && $r[1] === 404, json_encode($r));
$r = ask(['post_id' => 999, 'widget_id' => 'guestw']);
check('a post that does not exist answers 404', $r[0] === 'error' && $r[1] === 404);
$r = ask(['post_id' => 4645, 'widget_id' => '']);
check('a missing widget id is rejected', $r[0] === 'error' && $r[1] === 400);

echo "\nF. A widget this post does not hold answers with nothing\n";
// This is /explore/'s own pair: its data-config names the SOURCE widget,
// which is not in the public page's _elementor_data. Measured on live.
$GLOBALS['transients'] = [];
$r = ask(['post_id' => 4645, 'widget_id' => 'nothere']);
check('an unknown widget id yields an empty index, not an error',
    $r[0] === 'success' && ($r[2]['index'] ?? null) === [], json_encode($r));

echo "\n";
if ($fail) {
    echo "FAILED ($fail):\n";
    foreach ($failures as $f) { echo "  - $f\n"; }
}
echo ($fail ? "✗" : "✓") . " search-index: $pass passed, $fail failed\n";
exit($fail ? 1 : 0);
