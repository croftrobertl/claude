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
define('HOUR_IN_SECONDS', 3600);
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

/* 0.36.0 — the open-dates endpoint, the cottage strip and its half-day cache. */
function admin_url($p = '') { return 'https://example.test/wp-admin/' . $p; }
function get_permalink($id) { return $GLOBALS['state']['links'][(int) $id] ?? ''; }
function get_posts($args = []) { return $GLOBALS['state']['posts'] ?? []; }
function get_transient($k) {
    $GLOBALS['state']['transient_reads'][] = $k;
    return $GLOBALS['state']['transient'][$k] ?? false;
}
function set_transient($k, $v, $ttl = 0) {
    $GLOBALS['state']['transient'][$k] = $v;
    $GLOBALS['state']['transient_ttl'][$k] = $ttl;
    return true;
}

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
foreach (['config', 'layout', 'checkout-request', 'rendered-stay', 'assets', 'hero', 'restore'] as $f) {
    require $plugin . '/includes/class-' . $f . '.php';
}

use DCC_Checkout\Restore;

/**
 * `Restore::stay()`, with a throw turned into a value.
 *
 * A mutation that lets the method run on a half-read stay makes it call
 * gmdate() with null, which PHP 8 throws on — and the suite CRASHED rather
 * than failed, so the runner reported HARNESS and the mutation was no
 * evidence either way (res-half-stay-offered). A harness that cannot tell a
 * broken claim from a broken harness is the thing tests/mutate exists to stop,
 * so the throw is caught here and reported as what it is.
 */
function stay_of(): array {
    try {
        return Restore::stay();
    } catch (\Throwable $e) {
        return ['threw' => get_class($e) . ': ' . $e->getMessage()];
    }
}

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

/* THE PASS-THROUGH IS ONLY OBSERVABLE WHEN THE POSTED ARRAY DIFFERS from
   what the fallback would build. With `['1607' => '1']` posted — the ordinary
   case — a mutation that drops the pass-through entirely produces the same
   answer, and both res-rooms-details-guessed and res-reads-room-details
   survived on exactly that. */
with_post([
    'mphb_room_type_id'   => '1607',
    'mphb_check_in_date'  => '2026-11-16',
    'mphb_check_out_date' => '2026-11-19',
    'mphb_rooms_details'  => ['1607' => '2', '1742' => '1'],
]);
check('a posted rooms_details that differs from the fallback is passed through, not rebuilt',
    Restore::stay()['roomsDetails'], ['1607' => '2', '1742' => '1']);

/* It is replayed into a form, so keys and values are sanitised and anything
   that is not a scalar is dropped rather than coerced. */
with_post([
    'mphb_room_type_id'   => '1607',
    'mphb_check_in_date'  => '2026-11-16',
    'mphb_check_out_date' => '2026-11-19',
    'mphb_rooms_details'  => ['1607' => '<b>1</b>', '1742' => ['nested'], '' => '1'],
]);
check('… sanitised, with non-scalars and empty keys dropped',
    Restore::stay()['roomsDetails'], ['1607' => '1']);

/* THE TWO MOTOPRESS FIELDS ARE NOT THE SAME FIELD. `room_details` is what the
   checkout FORM submits; reading it here would post the wrong thing. */
with_post([
    'mphb_room_type_id'   => '1607',
    'mphb_check_in_date'  => '2026-11-16',
    'mphb_check_out_date' => '2026-11-19',
    'mphb_room_details'   => [['room_type_id' => '1607', 'adults' => '2']],
    // Posted alongside, and DIFFERENT, so reading the wrong field is visible
    // in the answer rather than hidden behind the fallback.
    'mphb_rooms_details'  => ['1607' => '3'],
]);
check('mphb_room_details is NOT mistaken for mphb_rooms_details',
    Restore::stay()['roomsDetails'], ['1607' => '3']);

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
        stay_of(), []);
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
 * 2b. "THOSE DATES ARE TAKEN" IS NOT "WE LOST YOUR DATES" (v0.35.1, item 2)
 *
 * Cottage 36, Jan 11-14 2027 is booked. MotoPress declines to draw a form and
 * prints "Accommodation is already booked."; 0.35.0's card said "We do not
 * have your dates any more." We have the dates. They are taken.
 *
 * PHP decides which card the REQUEST has earned, because PHP is the half
 * holding the submission. The browser knows the one thing PHP cannot — whether
 * MotoPress drew a form — and that half is in restore/browser.js.
 *
 * Never MotoPress's words: they are translated on this site, and matching text
 * that can change is how features here have quietly died before.
 * ========================================================================== */

echo "\n--- taken, or lost (item 2) ---\n";

/** A stay posted for a cottage, relative to today in US/Eastern. */
function stay_post(int $days_ahead, int $nights = 3, int $type = 1742): array {
    /* `sprintf('%+d')`, NOT "+$n": PHP reads `modify('+-5 day')` as PLUS five
       days, so the first draft of this helper produced a FUTURE stay for every
       "in the past" case and three assertions passed by not being tested.
       Measured before fixing. */
    $tz = new DateTimeZone('America/New_York');
    $base = (new DateTimeImmutable('now', $tz))->modify(sprintf('%+d day', $days_ahead));
    return [
        'mphb_room_type_id'   => (string) $type,
        'mphb_check_in_date'  => $base->format('Y-m-d'),
        'mphb_check_out_date' => $base->modify(sprintf('%+d day', $nights))->format('Y-m-d'),
    ];
}

with_post(stay_post(30));
check('a complete stay for future dates: the dates are TAKEN, not lost',
    Restore::offer(), 'taken');
check('… and the config carries that word, not a boolean',
    [Restore::config()['offer'], is_string(Restore::config()['offer'])], ['taken', true]);
check('… and the stay is still handed over, so the cottage can be named',
    Restore::stay()['name'], 'Cottage 36');

with_post([]);
check('nothing posted at all: the reloaded-tab dead end, which is LOST',
    Restore::offer(), 'lost');

with_post(['mphb_room_type_id' => '1742']);
check('a room type with no dates is LOST — there is nothing to say is taken',
    Restore::offer(), 'lost');

$half = stay_post(30);
unset($half['mphb_check_out_date']);
with_post($half);
check('half a stay is LOST', Restore::offer(), 'lost');

/* "SOMEONE JUST BOOKED IT" IS A CLAIM, and it must not be made about a stay
   MotoPress may have refused for an entirely different reason. */
with_post(stay_post(-5));
check('a check-in already in the past is LOST, never "taken"',
    Restore::offer(), 'lost');
with_post(stay_post(30, 0));
check('a zero-night stay is LOST', Restore::offer(), 'lost');
with_post(stay_post(30, -2));
check('dates the wrong way round are LOST', Restore::offer(), 'lost');

/* THE BOUNDARY, IN US/EASTERN LIKE EVERY OTHER "TODAY" HERE. The cottages are
   in Florida: a guest in Sydney must not be told their dates are in the past
   because it is already tomorrow where they are. */
with_post(stay_post(0));
check('a check-in TODAY (Florida time) is still takeable',
    Restore::offer(), 'taken');
with_post(stay_post(-1));
check('… and yesterday is not', Restore::offer(), 'lost');

/* ========================================================================== *
 * 2c. THE WORDS (v0.35.1, item 6, and Rob's alignment rule)
 * ========================================================================== */

echo "\n--- the words ---\n";

with_post(stay_post(30));
$i18n = Restore::config()['i18n'];

/* v0.35.2 — THE WORDS ARE TRUE OF EVERY REFUSAL THAT REACHES THIS STATE
   (Rob's pick). This site has a TWO-NIGHT MINIMUM (`mphb_min_stay_length` = 2),
   so a one-night request is refused with no form and nobody has booked
   anything; 0.35.1 told that guest "Someone just booked …", which was false.
   Pinned as whole sentences, because that is the only kind of assertion that
   could have caught it. */
check('the taken card\'s title is a title, in Title Case',
    $i18n['takenTitle'], 'Those Dates Aren\'t Available');
check('the lead claims unavailability, never that a booking happened',
    $i18n['takenLead'],
    '%s isn\'t available for those nights. Choose new dates and we\'ll bring you straight back.');
check('… and there is a nameless wording, so no sentence has a hole in it',
    $i18n['takenLeadPlain'],
    'Those nights aren\'t available. Choose new dates and we\'ll bring you straight back.');
check('NOTHING anywhere in the strings says a booking has just happened',
    array_values(array_filter($i18n, static function ($v) {
        return is_string($v) && preg_match('/just booked|someone/i', $v);
    })), []);
check('… and the cottage is named through a %s rather than concatenation',
    [strpos($i18n['takenLead'], '%s') !== false,
     strpos($i18n['takenLeadPlain'], '%s')], [true, false]);
check('the one action is forward, never a re-POST of a refused stay',
    $i18n['takenButton'], 'Pick New Dates');

/* ITEM 6. Rob's rule: Title Case is for titles and labels; sentences stay
   sentence case. 0.35.0 shipped this one as "Welcome Back. We Kept Your
   Answers." */
check('the welcome line is three SENTENCES, so sentence case',
    $i18n['welcome'], 'Welcome back. We kept your answers. Please add your photo ID again.');

/* Every lead on the card is prose, and prose is left-aligned (Rob's standing
   rule) — the titles and fragments around it stay centred. The leads are the
   multi-sentence ones, and the test is that they really are: a one-sentence
   lead would not earn the class the stylesheet keys on. */
foreach (['takenLead', 'takenLeadPlain', 'restartLead', 'continueLead'] as $key) {
    check("$key is multi-sentence, which is what makes it left-aligned",
        preg_match_all('/[.!?](\s|$)/', $i18n[$key]) >= 2, true);
}
foreach (['takenTitle', 'restartTitle', 'continueTitle', 'takenButton', 'restartButton',
          'continueButton', 'startOver'] as $key) {
    check("$key is a title or a label, so it is ONE phrase",
        preg_match_all('/[.!?](\s|$)/', $i18n[$key]), 0);
}

/* ---------------------------------------------------------------------- *
 * 0.36.0 — THE DEAD END'S NEW SENTENCE, AND THE TAKEN CARD'S OLD ONES.
 *
 * EXACT SENTENCES, never substrings. 0.35.1 shipped two casing fixes green
 * because both checks were substrings that survived either casing; an exact
 * comparison is the only one that can fail for the reason it names.
 * ---------------------------------------------------------------------- */
check('the dead end is Rob\'s wording, with American "anymore"',
    $i18n['restartLead'],
    "We don't have your dates anymore. Pick them again and we'll bring you straight back to checkout.");
check('… and nothing anywhere still says "any more"',
    (bool) preg_match('/any more/i', implode(' ', $i18n)), false);

/* PINNED, UNCHANGED FROM 0.35.2 (Rob: "Keep the taken card's three sentences
   exactly"). These were made honest when the two-night minimum showed the
   older wording could claim a booking that had not happened. */
check('the taken card\'s title is exactly as 0.35.2 pinned it',
    $i18n['takenTitle'], "Those Dates Aren't Available");
check('… its named lead, exactly',
    $i18n['takenLead'],
    "%s isn't available for those nights. Choose new dates and we'll bring you straight back.");
check('… its nameless lead, exactly',
    $i18n['takenLeadPlain'],
    "Those nights aren't available. Choose new dates and we'll bring you straight back.");
check('… and its button, exactly', $i18n['takenButton'], 'Pick New Dates');

/* Rob's casing rule: a preposition or an article stays down inside Title
   Case ("Show Me ↑ 1 of 2", 0.35.1). */
check('the two new titles keep prepositions and articles lower case',
    [$i18n['altTitle'], $i18n['stripTitle']],
    ['Open Dates for This Cottage', 'Or Browse the Cottages']);

/* ---------------------------------------------------------------------- *
 * AND THE BROWSER FIXTURE'S COPY IS THE SAME STRING.
 *
 * tests/cards/browser.js carries its own copy of these words, because a page
 * fixture has to. That copy cannot see a change made here — which is exactly
 * the apparent coverage 0.35.1 named — so it is compared against the PHP that
 * really sends them.
 * ---------------------------------------------------------------------- */
$fixture = (string) file_get_contents(dirname(__DIR__) . '/cards/browser.js');
check('the card fixture is on disk to read (the guard on the check below)',
    $fixture !== '', true);
foreach ($i18n as $key => $value) {
    if (!is_string($value) || $value === '') { continue; }
    /* Either quoting style, since an apostrophe decides which the fixture
       uses; the STRING is what is being compared, not its delimiters. */
    $found = strpos($fixture, "'" . $value . "'") !== false
        || strpos($fixture, '"' . $value . '"') !== false
        || strpos($fixture, '"' . str_replace("'", "\\'", $value) . '"') !== false;
    check("the browser fixture's $key is the string PHP really sends", $found, true);
}

/* The stylesheet's half of the rule, read from the file. */
$css = (string) file_get_contents($plugin . '/assets/checkout.css');
check('the card is centred and only its lead opts out (Rob\'s alignment rule)',
    [(bool) preg_match('/\.dcc_checkout-continue\s*\{[^}]*text-align:\s*center/s', $css),
     (bool) preg_match('/\.dcc_checkout-continue__lead\s*\{[^}]*text-align:\s*left/s', $css),
     (bool) preg_match('/\.dcc_checkout-welcome\s*\{[^}]*text-align:\s*left/s', $css)],
    [true, true, true]);

/* ========================================================================== *
 * 2b. 0.36.0 — THE WAY FORWARD OUT OF EACH CARD
 *
 * The performance rule first: Rob asked for ZERO new requests on the normal
 * form path, so each half has to be sent ONLY for the state that can use it.
 * A posted stay is what a working checkout carries, so that path must get no
 * cottage query; and the open-dates endpoint must not be described to a page
 * that will never ask it.
 * ========================================================================== */

echo "\n--- 0.36.0: open dates, and the cottages ---\n";

$GLOBALS['state']['posts'] = [];
$GLOBALS['state']['links'] = [];
foreach ([1065, 1067, 1069, 1071, 1604, 1607, 1740, 1742] as $i => $id) {
    $GLOBALS['state']['posts'][] = (object) ['ID' => $id];
    $GLOBALS['state']['links'][$id] = 'https://example.test/accommodation/c' . $i . '/';
    $GLOBALS['state']['titles'][$id] = 'Cottage ' . $id . ': Name ' . $i;
}

with_post([
    'mphb_room_type_id'   => '1607',
    'mphb_check_in_date'  => '2126-01-11',
    'mphb_check_out_date' => '2126-01-14',
]);
$GLOBALS['state']['transient'] = [];
$taken = Restore::config();
check('a posted stay is the "taken" state', $taken['offer'], 'taken');
check('… so it is told how to ask for open dates',
    [$taken['avail']['action'], $taken['avail']['chips'], $taken['avail']['minNights'],
     $taken['avail']['timeoutMs'], $taken['avail']['windowDays']],
    ['mphbac_query', 3, 2, 3000, 94]);
check('… at admin-ajax, which is where that endpoint lives',
    $taken['avail']['url'], 'https://example.test/wp-admin/admin-ajax.php');
/* THE PERFORMANCE RULE, CONSTRUCTED: a working checkout posts a stay, so this
   is also the normal form path, and it must not have queried the cottages. */
check('THE NORMAL FORM PATH GETS NO COTTAGE STRIP, and makes no query for one',
    [$taken['cottageList'], $GLOBALS['state']['transient']],
    [[], []]);

with_post([]);
$GLOBALS['state']['transient'] = [];
$lost = Restore::config();
check('no stay at all is the "lost" state', $lost['offer'], 'lost');
check('… so it gets every published cottage, with a page and a picture',
    [count($lost['cottageList']), $lost['cottageList'][0]['name'],
     $lost['cottageList'][0]['url']],
    [8, 'Name 0', 'https://example.test/accommodation/c0/']);
check('… and NOT the open-dates endpoint, which it has no stay to ask about',
    $lost['avail'], []);

/* THE CASE THAT TELLS THE GATE FROM THE EMPTY STAY. The check above cannot:
   with no stay posted, avail_config() returns [] of its own accord, so
   removing the `$offer === 'taken'` gate changes nothing and the mutation
   survived a whole run. A stay that EXISTS but is not bookable in principle —
   a check-in already past — is 'lost' with a readable stay, and there the
   gate is the only thing saying no. (A guest whose dates are behind them
   should not set an availability lookup going either.) */
with_post([
    'mphb_room_type_id'   => '1607',
    'mphb_check_in_date'  => '2020-01-11',
    'mphb_check_out_date' => '2020-01-14',
]);
$past = Restore::config();
check('a stay in the past is lost, and its stay is still readable (the guard)',
    [$past['offer'], $past['stay']['roomTypeId'] ?? null], ['lost', '1607']);
check('… and it is NOT told how to ask for open dates', $past['avail'], []);

/* CACHED FOR HALF A DAY. A cookie-rebuilt checkout IS the lost state (0.35.1,
   item 1) and renders a working form, so without this the query would run on
   a normal render. Constructed by emptying the post list and asking again:
   a second call that still answers is a call that did not query. */
check('the strip is stored for half a day',
    $GLOBALS['state']['transient_ttl']['dcc_checkout_cottage_strip'] ?? null, 12 * 3600);
$GLOBALS['state']['posts'] = [];
check('… and read from the store rather than queried again',
    count(Restore::cottage_list()), 8);

/* The floor under a chip's length. The site has a two-night minimum, which is
   exactly why a one-night request is refused with no form in the first place:
   offering more one-night stays would walk the guest into the same wall. */
$GLOBALS['state']['filters']['dcc_checkout_min_nights'][] = static function () { return 3; };
with_post([
    'mphb_room_type_id'   => '1607',
    'mphb_check_in_date'  => '2126-01-11',
    'mphb_check_out_date' => '2126-01-14',
]);
check('the minimum nights is filterable', Restore::config()['avail']['minNights'], 3);
$GLOBALS['state']['filters']['dcc_checkout_min_nights'] = [static function () { return 0; }];
check('… and can never be driven below one night',
    Restore::config()['avail']['minNights'], 1);
$GLOBALS['state']['filters']['dcc_checkout_min_nights'] = [];

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
