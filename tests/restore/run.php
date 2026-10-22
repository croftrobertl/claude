<?php
/**
 * v0.35.0 — WHAT PHP HANDS THE BROWSER FOR ITEM 10 (the kept answers and the
 * Continue card).
 *
 *     php tests/restore/run.php
 *
 * WHAT THIS PROVES
 *   - The five fields the Continue card re-posts are the ones the cottage page
 *     sends, with the dates EXACTLY as submitted — not recomputed, not
 *     today's. `mphb_rooms_details` is passed through as posted when the
 *     request carries it.
 *   - `rooms_details` and `room_details` are not confused for each other.
 *     They are different MotoPress fields and reading the wrong one would
 *     either post nothing or post the checkout form's per-room detail.
 *   - A request with no readable stay hands over NOTHING, so the card falls
 *     back to "Pick Your Dates Again" rather than offering a half stay.
 *   - The stay carries a key made of the room type and both dates, which is
 *     what stops one stay's answers being offered against another's.
 *   - The script is enqueued for EVERY guest on the checkout — item 10 is
 *     deliberately not behind the preview gate — and through asset_url(), so
 *     a guest gets the built file.
 *   - No string the browser is given is a boolean (0.29.0:
 *     `wp_localize_script` casts top-level scalars with `(string)`).
 */
define('ABSPATH', __DIR__);
define('DCC_CHECKOUT_VERSION', 'test');
define('DCC_CHECKOUT_FILE', __FILE__);
define('DCC_CHECKOUT_DIR', dirname(__DIR__, 2) . '/dcc-custom-checkout/');
define('DCC_CHECKOUT_URL', 'https://example.test/wp-content/plugins/dcc-custom-checkout/');
define('DAY_IN_SECONDS', 86400);
define('YEAR_IN_SECONDS', 31536000);

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

$GLOBALS['state'] = [
    'filters' => [],
    'option'  => [],
    'is_page' => true,
    'thumbs'  => [1607 => 2206, 1742 => 2208],
    'titles'  => [1607 => 'Cottage 34: Test Cottage', 1742 => 'Cottage 36'],
];
$GLOBALS['scripts'] = [];
$GLOBALS['localized'] = [];

function add_filter($hook, $cb, $p = 10, $a = 1) { $GLOBALS['state']['filters'][$hook][] = $cb; return true; }
function add_action($hook, $cb, $p = 10, $a = 1) { return add_filter($hook, $cb, $p, $a); }
function apply_filters($hook, $value, ...$rest) {
    foreach ($GLOBALS['state']['filters'][$hook] ?? [] as $cb) { $value = $cb($value, ...$rest); }
    return $value;
}
function do_action($hook, ...$args) {
    foreach ($GLOBALS['state']['filters'][$hook] ?? [] as $cb) { $cb(...$args); }
}
function __($t, $d = null) { return $t; }
function _x($t, $c = '', $d = null) { return $t; }
function _n($s, $p, $n, $d = null) { return $n === 1 ? $s : $p; }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_url($u) { return (string) $u; }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function number_format_i18n($n) { return (string) $n; }
function date_i18n($f, $ts) { return gmdate($f, (int) $ts); }
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }
function sanitize_key($k) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $k)); }
function wp_unslash($v) { return $v; }
function is_admin() { return false; }
function wp_doing_ajax() { return false; }
function is_ssl() { return true; }
function home_url($p = '') { return 'https://example.test' . $p; }
function add_query_arg($k, $v, $u) { return $u . '?' . $k . '=' . $v; }
function get_option($k, $d = false) { return $GLOBALS['state']['option'][$k] ?? $d; }
function update_option($k, $v) { $GLOBALS['state']['option'][$k] = $v; return true; }
function is_page($id = null) { return (bool) $GLOBALS['state']['is_page']; }
function get_the_title($id) { return $GLOBALS['state']['titles'][(int) $id] ?? ''; }
function get_post_thumbnail_id($id) { return $GLOBALS['state']['thumbs'][(int) $id] ?? 0; }
function get_post_meta($id, $k, $single = false) { return $single ? '' : []; }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }
function wp_enqueue_script($h, $src = '', $deps = [], $ver = false, $footer = false) {
    $GLOBALS['scripts'][$h] = ['src' => $src, 'deps' => $deps, 'footer' => $footer];
}
function wp_enqueue_style($h = '', $src = '', $deps = [], $ver = false, $m = 'all') {
    $GLOBALS['styles'][$h] = ['src' => $src, 'deps' => $deps];
}
function wp_localize_script($h, $name, $data) { $GLOBALS['localized'][$h] = $data; return true; }

/** Sizes, so Hero::photo() and the card thumbnail resolve. */
function wp_get_attachment_image_src($att, $size = 'thumbnail') {
    $full = [2206 => [2000, 1500], 2208 => [1500, 2000]][(int) $att] ?? null;
    if ($full === null) { return false; }
    [$fw, $fh] = $full;
    $boxes = ['medium' => [300, 300], 'medium_large' => [768, 0], 'large' => [1024, 1024], '1536x1536' => [1536, 1536]];
    if ($size === 'full' || !isset($boxes[$size])) { return ["https://example.test/u/$att-full.jpg", $fw, $fh]; }
    [$bw, $bh] = $boxes[$size];
    $ratio = $bh > 0 ? min($bw / $fw, $bh / $fh) : $bw / $fw;
    if ($ratio >= 1) { return ["https://example.test/u/$att-full.jpg", $fw, $fh]; }
    $w = (int) round($fw * $ratio); $h = (int) round($fh * $ratio);
    return ["https://example.test/u/$att-{$w}x{$h}.jpg", $w, $h];
}

class MPHB_Pages_Stub {
    public function getCheckoutPageId() { return 1399; }
    public function getCheckoutPageUrl() { return 'https://example.test/submit-booking/'; }
}
class MPHB_Settings_Stub { public function pages() { return new MPHB_Pages_Stub(); } }
class MPHB_Stub { public function settings() { return new MPHB_Settings_Stub(); } }
function MPHB() { return new MPHB_Stub(); }

$plugin = dirname(__DIR__, 2) . '/dcc-custom-checkout';
foreach (['config', 'layout', 'checkout-request', 'assets', 'hero', 'restore'] as $f) {
    require $plugin . '/includes/class-' . $f . '.php';
}

use DCC_Checkout\Restore;

function with_post(array $post): void {
    $_POST = $post;
    $_GET = [];
    $GLOBALS['state']['option'] = [];
    \DCC_Checkout\Config::flush_cache();
    \DCC_Checkout\Layout::flush();
}

/* ========================================================================== *
 * 1. The stay, and the five fields
 * ========================================================================== */

echo "--- the stay PHP hands over ---\n";

with_post([
    'mphb_room_type_id'      => '1607',
    'mphb_check_in_date'     => '2026-11-16',
    'mphb_check_out_date'    => '2026-11-19',
    'mphb_rooms_details'     => ['1607' => '1'],
    'mphb_is_direct_booking' => '1',
]);
$stay = Restore::stay();

check('the room type is the one submitted', $stay['roomTypeId'], '1607');
check('the dates are EXACTLY as submitted, never recomputed',
    [$stay['checkIn'], $stay['checkOut']], ['2026-11-16', '2026-11-19']);
check('mphb_rooms_details is passed through as posted',
    $stay['roomsDetails'], ['1607' => '1']);
check('the cottage name is the title without its number', $stay['name'], 'Test Cottage');
check('the card photo is a small registered size, never the original',
    $stay['photo'], 'https://example.test/u/2206-300x225.jpg');
check('the dates read as a sentence with the night count',
    $stay['dates'], 'Mon, Nov 16 → Thu, Nov 19 · 3 Nights');
check('the key names the room type AND both dates',
    $stay['key'], '1607|2026-11-16|2026-11-19');

/* The cottage page sends rooms_details; a request without it still gets the
   one pair MotoPress expects rather than an empty array. */
with_post([
    'mphb_room_type_id'   => '1607',
    'mphb_check_in_date'  => '2026-11-16',
    'mphb_check_out_date' => '2026-11-19',
]);
check('with no rooms_details posted, the one pair the cottage page sends is used',
    Restore::stay()['roomsDetails'], ['1607' => '1']);

/* THE TWO MOTOPRESS FIELDS ARE NOT THE SAME FIELD. `room_details` is what the
   checkout FORM submits; reading it here would post the wrong thing. */
with_post([
    'mphb_room_type_id'   => '1607',
    'mphb_check_in_date'  => '2026-11-16',
    'mphb_check_out_date' => '2026-11-19',
    'mphb_room_details'   => [['room_type_id' => '1607', 'adults' => '2']],
]);
check('mphb_room_details is NOT mistaken for mphb_rooms_details',
    Restore::stay()['roomsDetails'], ['1607' => '1']);

/* A stay that cannot be read offers nothing at all. */
foreach ([
    'no dates'       => ['mphb_room_type_id' => '1607'],
    'no room type'   => ['mphb_check_in_date' => '2026-11-16', 'mphb_check_out_date' => '2026-11-19'],
    'half the dates' => ['mphb_room_type_id' => '1607', 'mphb_check_in_date' => '2026-11-16'],
    'nothing at all' => [],
    'a junk date'    => ['mphb_room_type_id' => '1607', 'mphb_check_in_date' => 'tomorrow', 'mphb_check_out_date' => '2026-11-19'],
] as $label => $post) {
    with_post($post);
    check("$label: no stay is handed over, so the card asks for the dates again",
        Restore::stay(), []);
}

/* A cottage with no featured image still gets a card — without a photo. */
with_post([
    'mphb_room_type_id'   => '1742',
    'mphb_check_in_date'  => '2026-11-16',
    'mphb_check_out_date' => '2026-11-17',
]);
$portrait = Restore::stay();
check('a title with no colon is used whole', $portrait['name'], 'Cottage 36');
check('one night reads "1 Night"',
    strpos($portrait['dates'], '· 1 Night') !== false, true);

/* ========================================================================== *
 * 2. The config, and that nothing in it is a boolean
 * ========================================================================== */

echo "\n--- the config ---\n";

with_post([
    'mphb_room_type_id'   => '1607',
    'mphb_check_in_date'  => '2026-11-16',
    'mphb_check_out_date' => '2026-11-19',
]);
$cfg = Restore::config();

check('the checkout URL is MotoPress\'s own', $cfg['checkout'], 'https://example.test/submit-booking/');
check('"Pick Your Dates Again" goes to /cottages/', $cfg['cottages'], 'https://example.test/cottages/');
$GLOBALS['state']['filters']['dcc_checkout_cottages_url'][] = static function () {
    return 'https://example.test/stay/';
};
check('… and that page is filterable, so a rename does not strand the one link',
    Restore::config()['cottages'], 'https://example.test/stay/');
$GLOBALS['state']['filters']['dcc_checkout_cottages_url'] = [];

check('the guest is told the photo ID has to be added again',
    strpos($cfg['i18n']['welcome'], 'photo ID') !== false, true);

/* 0.29.0: wp_localize_script casts top-level scalars with (string), so a
   boolean would arrive as "1" or "". Nothing here may be one. */
$bools = [];
foreach ($cfg as $k => $v) {
    if (is_bool($v)) { $bools[] = $k; }
}
check('no top-level value is a boolean (0.29.0)', $bools, []);

/* ========================================================================== *
 * 3. Who gets the script
 * ========================================================================== */

echo "\n--- who gets it ---\n";

$GLOBALS['state']['filters']['dcc_checkout_is_checkout_page'] = [];
$GLOBALS['scripts'] = [];
(new Restore())->enqueue();
check('the checkout gets restore.js — EVERY guest, not only the new layout',
    isset($GLOBALS['scripts'][Restore::HANDLE]), true);
check('… as the BUILT file, after checkout.js',
    [basename($GLOBALS['scripts'][Restore::HANDLE]['src']),
     $GLOBALS['scripts'][Restore::HANDLE]['deps'],
     $GLOBALS['scripts'][Restore::HANDLE]['footer']],
    ['restore.min.js', ['dcc-checkout'], true]);

/* With the layout switch OFF and no preview cookie — the state live will be
   in — it is still there. That is the whole point of item 10. */
$GLOBALS['state']['option'] = [\DCC_Checkout\Config::OPTION => ['layout_enabled' => 0]];
\DCC_Checkout\Config::flush_cache();
\DCC_Checkout\Layout::flush();
$GLOBALS['scripts'] = [];
(new Restore())->enqueue();
check('with the new layout switched off, restore.js is STILL enqueued',
    isset($GLOBALS['scripts'][Restore::HANDLE]), true);

$GLOBALS['state']['is_page'] = false;
$GLOBALS['scripts'] = [];
(new Restore())->enqueue();
check('no other page gets it', isset($GLOBALS['scripts'][Restore::HANDLE]), false);
$GLOBALS['state']['is_page'] = true;

/* ========================================================================== *
 * 4. The script's own promises, read from the file
 * ========================================================================== */

echo "\n--- restore.js, read ---\n";

/* THE BUILT FILE, because the SOURCE's own comments say "never localStorage"
   and quote MotoPress's error — so scanning the source would always hit the
   prose rather than the code. The built file has no comments at all
   (tools/build-assets.php), which makes it the honest reader here, and it is
   also the file a guest downloads. */
$js = (string) file_get_contents($plugin . '/assets/restore.min.js');
check('the built file is on disk to read (the guard on the two checks below)',
    $js !== '', true);

check('sessionStorage only — never localStorage, never a cookie',
    [strpos($js, 'localStorage') !== false, strpos($js, 'document.cookie') !== false],
    [false, false]);
check('the dead end is found by the ABSENCE of the form, never by the error\'s words',
    (bool) preg_match('/is not valid|Check-?in date/i', $js), false);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
