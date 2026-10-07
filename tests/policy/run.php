<?php
/**
 * v0.30.0 — the checkout's acceptance box (label + links) and the acceptance
 * record on each booking.
 *
 *     php tests/policy/run.php            run the assertions
 *     php tests/policy/run.php fixture X  print the checkout fragment for the
 *                                         browser suite (X = published|unpublished)
 *
 * WordPress is shimmed, not loaded. Two shims are deliberately FAITHFUL rather
 * than convenient, because the defects they stand for are real:
 *  - add_post_meta()/update_post_meta() UNSLASH what they are given, as core
 *    does. Elementor's JSON is full of backslashes; a version stored without
 *    wp_slash() would come back altered and stop matching its fingerprint.
 *  - MotoPress's render is reproduced from what the Director read in 6.1.0
 *    (checkout-view.php ~531–537): the input markup and
 *    printf(_x("I've read and accept the %s", …), $link). The wrapping <p> and
 *    <label> are a STAND-IN; only those two facts are verified.
 */
define('ABSPATH', __DIR__);

$GLOBALS['opt']      = [];
$GLOBALS['posts']    = [];
$GLOBALS['meta']     = [];
$GLOBALS['hooks']    = [];
$GLOBALS['is_admin'] = false;
$GLOBALS['referer']  = '';
$GLOBALS['caps']     = true;
$GLOBALS['next_id']  = 9000;

class WP_Post {
    public $ID = 0; public $post_type = ''; public $post_status = 'publish';
    public $post_title = ''; public $post_content = ''; public $post_name = '';
    public $post_parent = 0; public $post_modified_gmt = '2026-10-07 12:00:00';
}
class WP_Error { public $m; public function __construct($c = '', $m = '') { $this->m = $m; } }
class WP_REST_Request {
    private $m; private $r; private $p;
    public function __construct($m, $r, $p) { $this->m = $m; $this->r = $r; $this->p = $p; }
    public function get_method() { return $this->m; }
    public function get_route() { return $this->r; }
    public function get_params() { return $this->p; }
}
class Died extends Exception { public $status; public function __construct($msg, $status) { parent::__construct($msg); $this->status = $status; } }

function wp_slash($v) { return is_array($v) ? array_map('wp_slash', $v) : (is_string($v) ? addslashes($v) : $v); }
function wp_unslash($v) { return is_array($v) ? array_map('wp_unslash', $v) : (is_string($v) ? stripslashes($v) : $v); }
function maybe_unserialize($v) { return $v; }
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
function add_filter($h, $cb, $p = 10, $a = 1) { $GLOBALS['hooks'][$h][$p][] = [$cb, $a]; ksort($GLOBALS['hooks'][$h]); return true; }
function add_action($h, $cb, $p = 10, $a = 1) { return add_filter($h, $cb, $p, $a); }
function remove_filter($h, $cb, $p = 10) {
    foreach ($GLOBALS['hooks'][$h][$p] ?? [] as $i => $e) { if ($e[0] == $cb) { unset($GLOBALS['hooks'][$h][$p][$i]); } }
    return true;
}
function apply_filters($h, $v, ...$args) {
    foreach ($GLOBALS['hooks'][$h] ?? [] as $list) {
        foreach ($list as [$cb, $n]) { $v = $cb(...array_slice(array_merge([$v], $args), 0, max(1, $n))); }
    }
    return $v;
}
function do_action($h, ...$args) {
    foreach ($GLOBALS['hooks'][$h] ?? [] as $list) {
        foreach ($list as [$cb, $n]) { $cb(...array_slice($args, 0, $n)); }
    }
}
function __($t, $d = null) { return $t; }
function _x($t, $c, $d = null) { return apply_filters('gettext_with_context', $t, $t, $c, $d); }
function esc_html__($t, $d = null) { return esc_html($t); }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_attr($t) { return esc_html($t); }
function esc_url($u) { return str_replace('&', '&#038;', (string) $u); }
function wp_kses_post($h) { return preg_replace('#<script\b[^>]*>.*?</script>#is', '', (string) $h); }
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function wpautop($t) { return '<p>' . $t . '</p>'; }
function wp_json_encode($v) { return json_encode($v); }
function sanitize_text_field($v) { return is_string($v) ? trim(strip_tags($v)) : ''; }
function admin_url($p = '') { return 'https://doracanalcourt.com/wp-admin/' . $p; }
function wp_get_referer() { return $GLOBALS['referer']; }
function is_admin() { return $GLOBALS['is_admin']; }
function wp_doing_ajax() { return !empty($GLOBALS['ajax']); }
function wp_doing_cron() { return false; }
function current_user_can($c, ...$a) { return $GLOBALS['caps']; }
function is_wp_error($v) { return $v instanceof WP_Error; }
function wp_date($f, $ts) { return gmdate($f, $ts); }
function wp_die($m = '', $t = '', $a = []) { throw new Died((string) $m, (int) ($a['response'] ?? 500)); }
function nocache_headers() {}
function get_post_type($id) { return isset($GLOBALS['posts'][(int) $id]) ? $GLOBALS['posts'][(int) $id]->post_type : false; }
function get_post($id = null) { return $GLOBALS['posts'][(int) $id] ?? null; }
function get_permalink($id) {
    $p = $GLOBALS['posts'][(int) $id] ?? null;
    return $p ? 'https://doracanalcourt.com/' . $p->post_name . '/' : false;
}
function get_post_meta($id, $k, $single = false) { return $GLOBALS['meta'][(int) $id][$k] ?? ''; }
function add_post_meta($id, $k, $v, $unique = false) {
    if ($unique && isset($GLOBALS['meta'][(int) $id][$k])) { return false; }
    $GLOBALS['meta'][(int) $id][$k] = wp_unslash($v); // core unslashes
    return true;
}
function update_post_meta($id, $k, $v) { $GLOBALS['meta'][(int) $id][$k] = wp_unslash($v); return true; }
function wp_insert_post($a, $err = false) {
    $p = new WP_Post();
    $p->ID = $GLOBALS['next_id']++;
    foreach ($a as $k => $v) { $p->$k = $v; }
    $GLOBALS['posts'][$p->ID] = $p;
    do_action('wp_insert_post', $p->ID, $p, false);
    return $p->ID;
}
function get_posts($a) {
    $out = [];
    foreach ($GLOBALS['posts'] as $id => $p) {
        if (($a['post_type'] ?? '') !== $p->post_type) { continue; }
        if (isset($a['post_parent']) && (int) $p->post_parent !== (int) $a['post_parent']) { continue; }
        if (isset($a['meta_key']) && (string) get_post_meta($id, $a['meta_key'], true) !== (string) $a['meta_value']) { continue; }
        $out[] = ($a['fields'] ?? '') === 'ids' ? $id : $p;
    }
    return $out;
}

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-rest-guard.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-policies.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-policy-record.php';

use DCC_Checkout\Config;
use DCC_Checkout\Policies;
use DCC_Checkout\Policy_Record;

/* ---- the site: the two policy pages as the Director left them ---------- */
function page($id, $slug, $title, $elementor, $status = 'publish') {
    $p = new WP_Post();
    $p->ID = $id; $p->post_type = 'page'; $p->post_status = $status;
    $p->post_name = $slug; $p->post_title = $title;
    $GLOBALS['posts'][$id] = $p;
    $GLOBALS['meta'][$id]['_elementor_data'] = $elementor;
}
function reset_site() {
    $GLOBALS['posts'] = []; $GLOBALS['meta'] = []; $GLOBALS['opt'] = [];
    $GLOBALS['is_admin'] = false; $GLOBALS['referer'] = ''; $GLOBALS['ajax'] = false; $_POST = [];
    Config::flush_cache();
    $GLOBALS['opt']['mphb_terms_and_conditions_page'] = 2515;
    // Elementor JSON as it is stored: escaped slashes and quotes.
    page(2515, 'terms-conditions', 'Terms & Conditions',
        '[{"elType":"widget","settings":{"title":"Terms"},"elements":[]},{"elType":"widget","settings":{"editor":"<p>Section 3: see the <a href=\"https:\/\/doracanalcourt.com\/cancellation-refund-policy\/\">Cancellation &amp; Refund Policy<\/a>, which forms part of this Agreement.<\/p>"},"elements":[]}]');
    page(2394, 'cancellation-refund-policy', 'Cancellation & Refund Policy',
        '[{"elType":"widget","settings":{"editor":"<p>POLICY TEXT v1 \u2014 \"quoted\" C:\\\\path<\/p><script>alert(1)<\/script>"},"elements":[]}]');
    $r = new ReflectionClass(Policy_Record::class);
    foreach (['rest_seen' => false, 'rest_tick' => false] as $k => $v) {
        $prop = $r->getProperty($k); $prop->setAccessible(true); $prop->setValue(null, $v);
    }
}
function booking($id, $rooms = []) {
    $b = new WP_Post(); $b->ID = $id; $b->post_type = 'mphb_booking'; $GLOBALS['posts'][$id] = $b;
    foreach ($rooms as $i => $meta) {
        $r = new WP_Post(); $r->ID = $id * 10 + $i; $r->post_type = 'mphb_reserved_room'; $r->post_parent = $id;
        $GLOBALS['posts'][$r->ID] = $r;
        foreach ($meta as $k => $v) { $GLOBALS['meta'][$r->ID][$k] = $v; }
    }
    return new class($id) { private $i; public function __construct($i) { $this->i = $i; } public function getId() { return $this->i; } };
}

/* ---- MotoPress's render: the Director's reading of 6.1.0 ----------------- */
function motopress_render_terms() {
    $link = sprintf('<a href="%s" target="_blank">%s</a>',
        esc_url(get_permalink(get_option('mphb_terms_and_conditions_page'))),
        _x('terms & conditions', "I've read and accept the terms & conditions", 'motopress-hotel-booking'));
    echo '<p class="mphb-terms-and-conditions-accept"><label for="mphb_accept_terms">'
        . '<input type="checkbox" id="mphb_accept_terms" name="mphb_accept_terms" value="1" required> ';
    printf(_x("I've read and accept the %s", "I've read and accept the <tag>terms & conditions</tag>", 'motopress-hotel-booking'), $link);
    echo ' <abbr title="required">*</abbr></label></p>';
}
function checkout_fragment(): string {
    ob_start();
    do_action('mphb_sc_checkout_form');
    return (string) ob_get_clean();
}

$rec = new Policy_Record();
$rec->register();
add_action('mphb_sc_checkout_form', 'motopress_render_terms', 60, 0);

if (($argv[1] ?? '') === 'fixture') {
    reset_site();
    if (($argv[2] ?? '') === 'unpublished') { $GLOBALS['posts'][2394]->post_status = 'draft'; }
    echo checkout_fragment();
    exit(0);
}

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) {
        echo '      expected: ' . var_export($expected, true) . "\n      actual:   " . var_export($actual, true) . "\n";
    }
}
function sha_of_page($id) { return hash('sha256', Policies::bundle_json($GLOBALS['posts'][$id])); }

/* === 1. THE LABEL ======================================================== */
reset_site();
$html = checkout_fragment();
check('label: one sentence, both policies, in the owner\'s wording',
    trim(html_entity_decode(strip_tags(preg_replace('#<abbr.*?</abbr>#', '', $html)), ENT_QUOTES)),
    "I've read and accept the Terms & Conditions and the Cancellation & Refund Policy.");
preg_match_all('#<a href="([^"]+)" target="_blank" rel="noopener">([^<]+)</a>#', $html, $m);
check('label: two links, each opening in a new tab (target=_blank, rel=noopener)', $m[1],
    ['https://doracanalcourt.com/terms-conditions/', 'https://doracanalcourt.com/cancellation-refund-policy/']);
check('... the refund link is built from the PAGE ID setting (2394), never a typed URL', Config::refund_page_id(), 2394);
check('label: the checkbox itself is untouched — still required, same name and value',
    (bool) preg_match('#<input type="checkbox" id="mphb_accept_terms" name="mphb_accept_terms" value="1" required>#', $html), true);
check('label: MotoPress\'s own "terms & conditions" link is not printed as well', substr_count($html, '<a '), 2);
check('label: the swap is scoped — the same string OUTSIDE the box keeps MotoPress\'s wording',
    _x("I've read and accept the %s", "I've read and accept the <tag>terms & conditions</tag>", 'motopress-hotel-booking'),
    "I've read and accept the %s");

// A '%' in a URL must survive MotoPress's printf.
$GLOBALS['posts'][2394]->post_name = 'caf%C3%A9-policy';
// Unescaped, PHP 8's printf throws on "%C3" — caught, so it reads as a FAIL here
// rather than as a crashed suite.
$lvl = ob_get_level();
try { $pct = (bool) strpos(checkout_fragment(), 'caf%C3%A9-policy'); }
catch (\Throwable $e) { while (ob_get_level() > $lvl) { ob_end_clean(); } $pct = false; }
check('label: a "%" in a policy URL survives MotoPress\'s printf', $pct, true);

// The setting reaches the label (A SETTING MUST REACH ITS CONSUMER).
reset_site();
page(3001, 'other-policy', 'Other Policy', '[]');
$GLOBALS['opt']['dcc_checkout_settings'] = ['refund_page_id' => 3001];
Config::flush_cache();
check('label: choosing another page in the setting moves the link to it',
    (bool) strpos(checkout_fragment(), 'https://doracanalcourt.com/other-policy/'), true);

// Fallback: refund page unpublished / missing / none chosen; terms missing.
$mp = "I've read and accept the terms & conditions *";
foreach ([
    'refund page unpublished (draft)' => function () { $GLOBALS['posts'][2394]->post_status = 'draft'; },
    'refund page deleted'             => function () { unset($GLOBALS['posts'][2394]); },
    'no refund page chosen (0)'       => function () { $GLOBALS['opt']['dcc_checkout_settings'] = ['refund_page_id' => 0]; Config::flush_cache(); },
    'MotoPress terms page unpublished' => function () { $GLOBALS['posts'][2515]->post_status = 'private'; },
] as $case => $break) {
    reset_site();
    $break();
    $h = checkout_fragment();
    check("fallback, $case: MotoPress's original label, exactly",
        trim(html_entity_decode(strip_tags($h), ENT_QUOTES)), $mp);
}

/* === 2. THE RECORD ======================================================= */
reset_site();
$rec->capture_rest(null, null, new WP_REST_Request('POST', '/mphb/v1/checkout', ['mphb_accept_terms' => '1', 'room_details' => []]));
$rec->on_booking_created(booking(501));
$r1 = get_post_meta(501, Policy_Record::META, true);
check('record (tick received): its keys are exactly when / channel / tick / label / policies — nothing about the guest',
    array_keys($r1), ['v', 'channel', 'at_gmt', 'tick', 'label', 'policies']);
check('... tick "received"', $r1['tick'], 'received');
check('... UTC timestamp', (bool) preg_match('/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/', $r1['at_gmt']), true);
check('... the label shown, as text', $r1['label'], "I've read and accept the Terms & Conditions and the Cancellation & Refund Policy.");
check('... both pages: role, ID, SHA-256 of the content, post_modified_gmt, saved',
    array_map(function ($p) { return [$p['role'], $p['id'], $p['sha256'], $p['modified_gmt'], $p['saved']]; }, $r1['policies']),
    [['terms', 2515, sha_of_page(2515), '2026-10-07 12:00:00', true],
     ['refund', 2394, sha_of_page(2394), '2026-10-07 12:00:00', true]]);
$versions = function () { return count(get_posts(['post_type' => Policies::VERSION_TYPE])); };
check('... one stored copy per page version', $versions(), 2);
$copy = Policies::find_version(sha_of_page(2394));
check('... the stored copy is EXACTLY the page as it was (backslashes, quotes, unicode intact)',
    [$copy['intact'], $copy['bundle'] === Policies::bundle_json($GLOBALS['posts'][2394])], [true, true]);
$box = Policy_Record::box_html(501);
check('edit screen, tick received: "Policies accepted online: …"', (bool) strpos(' ' . $box, 'Policies accepted online: '), true);
check('... with both versions, saved, and a link to view each',
    substr_count($box, 'admin-post.php?action=dcc_policy_version&#038;sha='), 2);

// Tick NOT received (the expected live case): never called "accepted".
$rec->capture_rest(null, null, new WP_REST_Request('POST', '/mphb/v1/checkout', ['room_details' => []]));
$rec->on_booking_created(booking(502));
$r2 = get_post_meta(502, Policy_Record::META, true);
check('record (tick absent from the submission): "not_received"', $r2['tick'], 'not_received');
$box2 = Policy_Record::box_html(502);
check('... the edit screen never says "accepted" for it', [strpos($box2, 'Policies accepted'), strpos($box2, 'Booked online: ') !== false], [false, true]);
check('... same versions: no new copies stored', $versions(), 2);

foreach (['1' => true, 'on' => true, 'yes' => true, '' => false, '0' => false, 'false' => false, 'off' => false] as $v => $want) {
    check("tick_in: mphb_accept_terms=\"$v\" -> " . ($want ? 'received' : 'not received'), Policy_Record::tick_in(['mphb_accept_terms' => (string) $v]), $want);
}
check('tick_in: an array is not a tick', Policy_Record::tick_in(['mphb_accept_terms' => ['1']]), false);
check('tick_in: missing is not a tick', Policy_Record::tick_in([]), false);

// A policy edit: new fingerprint, a SECOND copy, the old booking unchanged.
$old_refund = sha_of_page(2394);
$GLOBALS['meta'][2394]['_elementor_data'] = '[{"elType":"widget","settings":{"editor":"<p>POLICY TEXT v2<\/p>"},"elements":[]}]';
// post_modified is deliberately NOT bumped — the Director's CLI edits did not.
$rec->capture_rest(null, null, new WP_REST_Request('POST', '/mphb/v1/checkout', ['mphb_accept_terms' => '1']));
$rec->on_booking_created(booking(503));
$r3 = get_post_meta(503, Policy_Record::META, true);
check('policy edited (post_modified NOT bumped): the new booking gets a NEW fingerprint',
    $r3['policies'][1]['sha256'] !== $old_refund && $r3['policies'][1]['sha256'] === sha_of_page(2394), true);
check('... and a second stored copy of that page', $versions(), 3);
check('... the old booking still points at the FIRST version', get_post_meta(501, Policy_Record::META, true)['policies'][1]['sha256'], $old_refund);
check('... and the first copy is still intact, with the old text', [Policies::find_version($old_refund)['intact'], strpos(Policies::find_version($old_refund)['bundle'], 'POLICY TEXT v1') !== false], [true, true]);

// Never over an existing record; never to an existing booking.
$GLOBALS['meta'][2394]['_elementor_data'] = '[{"elType":"widget","settings":{"editor":"<p>POLICY TEXT v3<\\/p>"},"elements":[]}]';
$before = $versions();
check('a record is never overwritten', Policy_Record::write_record(501, false), false);
check('... it still says "received"', get_post_meta(501, Policy_Record::META, true)['tick'], 'received');
check('... and nothing is captured for it either: no new copy stored', $versions(), $before);

// Fallback label recorded, refund page not recorded (it was not linked).
reset_site();
$GLOBALS['posts'][2394]->post_status = 'draft';
$rec->capture_rest(null, null, new WP_REST_Request('POST', '/mphb/v1/checkout', ['mphb_accept_terms' => '1']));
$rec->on_booking_created(booking(504));
$r4 = get_post_meta(504, Policy_Record::META, true);
check('refund page unpublished: the record keeps MotoPress\'s label and only the Terms page',
    [$r4['label'], array_column($r4['policies'], 'role')], ["I've read and accept the terms & conditions", ['terms']]);

// Plain front-end form post (no REST): $_POST is read.
reset_site();
$_POST = ['mphb_accept_terms' => '1'];
$rec->on_booking_created(booking(505));
check('front-end form post (no REST): the tick is read from the post', get_post_meta(505, Policy_Record::META, true)['tick'], 'received');

/* === 3. STAFF, IMPORTED, NONE ============================================= */
reset_site();
$GLOBALS['referer'] = 'https://doracanalcourt.com/wp-admin/admin.php?page=mphb_add_new_booking';
$rec->capture_rest(null, null, new WP_REST_Request('POST', '/mphb/v1/checkout', []));
$rec->on_booking_created(booking(601));
check('booking created from a wp-admin screen: NO online record', get_post_meta(601, Policy_Record::META, true), '');
check('... "Entered by staff — not accepted online"', strip_tags(Policy_Record::box_html(601)), 'Entered by staff — not accepted online');

reset_site();
$GLOBALS['is_admin'] = true;
$id = wp_insert_post(['post_type' => 'mphb_booking', 'post_status' => 'confirmed']);
check('wp-admin screen creates a booking: marked staff-entered', strip_tags(Policy_Record::box_html($id)), 'Entered by staff — not accepted online');
$GLOBALS['ajax'] = true;
$id2 = wp_insert_post(['post_type' => 'mphb_booking']);
check('... an AJAX request (e.g. an import) is not a screen: not marked', get_post_meta($id2, Policy_Record::STAFF_META, true), '');
$GLOBALS['ajax'] = false;
booking(602);
$rec->mark_staff(602, $GLOBALS['posts'][602], true);
check('... an UPDATE to an existing booking is never marked', get_post_meta(602, Policy_Record::STAFF_META, true), '');

reset_site();
booking(701);
$GLOBALS['meta'][701]['mphb_ical_prodid'] = '-//Airbnb Inc//Hosting Calendar 0.8.8//EN';
check('imported booking (prodid on the booking): "Imported booking — not accepted on this site"',
    strip_tags(Policy_Record::box_html(701)), 'Imported booking — not accepted on this site');
booking(702, [['mphb_ical_prodid' => '-//Booking.com//EN']]);
check('... prodid on a reserved room instead: the same', strip_tags(Policy_Record::box_html(702)), 'Imported booking — not accepted on this site');
$GLOBALS['meta'][702]['_dcc_policy_staff'] = '1';
check('... an import wins over a staff mark (an admin-run import is still an import)',
    strip_tags(Policy_Record::box_html(702)), 'Imported booking — not accepted on this site');
booking(703);
check('no record, not staff, not imported: "No online acceptance on record"', strip_tags(Policy_Record::box_html(703)), 'No online acceptance on record');

// Another REST route is not the checkout.
reset_site();
define('REST_REQUEST', true);
$rec->capture_rest(null, null, new WP_REST_Request('POST', '/wp/v2/posts', ['mphb_accept_terms' => '1']));
$rec->on_booking_created(booking(801));
check('a booking created under some OTHER REST route: nothing written', get_post_meta(801, Policy_Record::META, true), '');

/* === 4. THE VIEWER ======================================================== */
reset_site();
$rec->capture_rest(null, null, new WP_REST_Request('POST', '/mphb/v1/checkout', ['mphb_accept_terms' => '1']));
$rec->on_booking_created(booking(901));
$sha = sha_of_page(2394);
$_GET = ['sha' => $sha];
ob_start();
try { $rec->render_version(); } catch (Died $e) { }
$page = (string) ob_get_clean();
check('viewer: shows the saved text, says it matches its fingerprint',
    [strpos($page, 'POLICY TEXT v1') !== false, strpos($page, 'This copy matches its fingerprint.') !== false], [true, true]);
check('viewer: page script in the saved text is never executed (stripped in the readable view)',
    strpos(Policies::readable_html(Policies::find_version($sha)['bundle']), '<script'), false);
$GLOBALS['caps'] = false;
$code = 0;
ob_start(); // a viewer that wrongly renders must not swallow the FAIL line below
try { $rec->render_version(); } catch (Died $e) { $code = $e->status; }
$leaked = (string) ob_get_clean();
check('viewer: refused (403) without the capability, and shows nothing', [$code, strpos($leaked, 'POLICY TEXT')], [403, false]);
$GLOBALS['caps'] = true;
$_GET = ['sha' => 'not-a-hash'];
$code = 0;
try { $rec->render_version(); } catch (Died $e) { $code = $e->status; }
check('viewer: an unknown fingerprint is a 404, not an error page with data', $code, 404);

/* === 5. THE OWNER'S STANDING RULE ========================================= */
// The policy's terms live ONLY on the policy page. Nothing in this feature
// may restate them: no time limits, no amounts, no conditions.
$src = '';
foreach (['class-policies.php', 'class-policy-record.php', 'class-settings.php', 'class-config.php'] as $f) {
    $src .= file_get_contents(__DIR__ . '/../../dcc-custom-checkout/includes/' . $f);
}
// ...and its notes: the readme and the repository's CLAUDE.md.
$src .= file_get_contents(__DIR__ . '/../../dcc-custom-checkout/readme.txt');
$src .= file_get_contents(__DIR__ . '/../../CLAUDE.md');
preg_match_all('/free cancell|non-refundable|\b\d+\s*(?:hours?|days?|weeks?)\s+(?:before|prior|in advance)|\d+\s*%\s*(?:refund|of the)|refund(?:ed)?\s+(?:within|up to|in full)/i', $src, $hits);
check('no policy terms restated anywhere in this feature\'s code, settings or defaults', $hits[0], []);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
