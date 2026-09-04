<?php
/**
 * DCC Guest Guide — public-mode audience filter tests.
 *
 * The public guide is an indexable page and one guest-only section holds
 * Wi-Fi passwords, so "guest content is absent from the HTML" is a security
 * property, not a cosmetic one. These tests drive the REAL filter
 * (Widget::apply_public_mode) and the REAL search-index builder
 * (Widget::build_search_index) — the latter matters because its output is
 * inlined verbatim into the page's data-config attribute, which is the
 * easiest place for guest text to leak while the visible markup looks clean.
 *
 *   php tests/public-mode.test.php
 */
define('ABSPATH', '/tmp/');
define('DCCGG_VERSION', 'test');

// Minimal WP surface used by the code under test.
function __($s, $d = null) { return $s; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_html($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function esc_attr($s) { return htmlspecialchars((string) $s, ENT_QUOTES); }
function wp_strip_all_tags($s) { return strip_tags((string) $s); }
function wp_kses_post($s) { return $s; }
function do_shortcode($s) { return $s; }
function apply_filters($t, $v) { return $v; }
function mb_substr_compat($s, $a, $b) { return mb_substr($s, $a, $b); }

require __DIR__ . '/_elementor-stub.php';
require __DIR__ . '/../dcc-guest-guide/includes/class-widget.php';

$pass = 0; $fail = 0; $failures = [];
function check($name, $cond, $detail = '') {
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $fail++; $failures[] = $name . ($detail ? " — $detail" : ''); echo "  ✗ $name" . ($detail ? " — $detail" : '') . "\n"; }
}

// A guide mirroring the real one: public-tagged marketing sections, plus
// guest-only sections including the one holding Wi-Fi credentials, plus a
// legacy section with NO audience key at all (must default to guest-only).
$settings = [
    'guide_mode' => 'public',
    'enable_problem_report'  => 'yes',
    'enable_per_item_report' => 'yes',
    'enable_checkout_review' => 'yes',
    'guide_sections' => [
        ['section_key' => 'amenities', 'section_title' => 'Amenities',        'section_audience' => 'public'],
        ['section_key' => 'clubhouse', 'section_title' => 'Clubhouse',        'section_audience' => 'both'],
        ['section_key' => 'boating',   'section_title' => 'Boating & Fishing','section_audience' => 'public'],
        ['section_key' => 'wifi',      'section_title' => 'Internet',         'section_audience' => 'guest'],
        ['section_key' => 'checkout',  'section_title' => 'Checkout',         'section_audience' => 'guest'],
        ['section_key' => 'legacy',    'section_title' => 'Legacy Untagged'],            // no key at all
        ['section_key' => 'typo',      'section_title' => 'Typo Audience', 'section_audience' => 'publik'],
    ],
    'guide_items' => [
        ['item_section' => 'amenities', 'item_title' => 'Heated pool',   'item_text' => 'Open year round.'],
        ['item_section' => 'clubhouse', 'item_title' => 'Coffee',        'item_text' => 'Free coffee daily.'],
        ['item_section' => 'wifi',      'item_title' => 'Wifi Name',     'item_text' => 'Password: "DCC32586"'],
        ['item_section' => 'wifi',      'item_title' => 'Guest network', 'item_text' => 'Password: "excitedgadfly450"'],
        ['item_section' => 'checkout',  'item_title' => 'Strip the beds','item_text' => 'Leave keys on the counter.'],
        ['item_section' => 'legacy',    'item_title' => 'Door code',     'item_text' => 'Front door code 4417.'],
        ['item_section' => 'typo',      'item_title' => 'Typo item',     'item_text' => 'Should not appear.'],
    ],
];

// Every string that must never reach the public page.
$GUEST_SECRETS = ['DCC32586', 'excitedgadfly450', '4417', 'Strip the beds',
                  'Leave keys on the counter', 'Door code', 'Guest network',
                  'Internet', 'Checkout', 'Legacy Untagged', 'Typo item'];

echo "\nA. apply_public_mode() — section filtering\n";
$s = $settings;
\DCCGG\Widget::apply_public_mode($s);
$keys = array_map(fn($x) => $x['section_key'], $s['guide_sections']);
sort($keys);
check('keeps only public/both sections', $keys === ['amenities', 'boating', 'clubhouse'], implode(',', $keys));
check('untagged legacy section is dropped (fail-safe)', !in_array('legacy', $keys, true));
check('unrecognised audience value is dropped (fail-safe)', !in_array('typo', $keys, true));
check('guest-only Wi-Fi section is dropped', !in_array('wifi', $keys, true));

echo "\nB. Items follow their section\n";
$itemKeys = array_map(fn($x) => $x['item_section'], $s['guide_items']);
check('only items of surviving sections remain', count(array_diff($itemKeys, ['amenities','clubhouse'])) === 0, implode(',', $itemKeys));
check('Wi-Fi password items dropped', !in_array('wifi', $itemKeys, true));

echo "\nC. Hard exclusions forced off regardless of settings\n";
check('Request Support disabled', ($s['enable_problem_report'] ?? '') !== 'yes');
check('per-item report disabled',  ($s['enable_per_item_report'] ?? '') !== 'yes');
check('checkout review prompt disabled', ($s['enable_checkout_review'] ?? '') !== 'yes');

echo "\nD. Leak sweep — the content render() feeds every consumer\n";
// Sweep the CONTENT subtrees, i.e. everything that becomes visible text or
// data-config payload. The whole-settings blob is deliberately not swept for
// generic words: it still carries configuration KEY NAMES such as
// enable_checkout_review, whose value is now empty. Matching those would
// assert against key names rather than guest content and give a false alarm.
$contentBlob = json_encode(['s' => $s['guide_sections'], 'i' => $s['guide_items']]);
$leaked = array_values(array_filter($GUEST_SECRETS, fn($n) => stripos($contentBlob, $n) !== false));
check('no guest-only content survives sections/items', !$leaked, implode(' | ', $leaked));

// Credentials and codes are swept across the ENTIRE settings array — those
// literals have no legitimate reason to appear anywhere in public output.
$SENSITIVE = ['DCC32586', 'excitedgadfly450', '4417'];
$wholeBlob = json_encode($s);
$sensLeak = array_values(array_filter($SENSITIVE, fn($n) => stripos($wholeBlob, $n) !== false));
check('no password or door code anywhere in the settings', !$sensLeak, implode(' | ', $sensLeak));

echo "\nE. Leak sweep — search index (inlined into data-config)\n";
$index = \DCCGG\Widget::build_search_index($s);
$idxBlob = json_encode($index);
$idxLeak = array_values(array_filter($GUEST_SECRETS, fn($n) => stripos($idxBlob, $n) !== false));
check('search index contains no guest-only content', !$idxLeak, implode(' | ', $idxLeak));
check('search index still indexes the public sections', stripos($idxBlob, 'Heated pool') !== false && stripos($idxBlob, 'Coffee') !== false);

echo "\nF. Full mode is untouched\n";
$full = $settings; $full['guide_mode'] = 'full';
check('full mode is not public mode', !\DCCGG\Widget::is_public_mode($full));
check('public mode detected from settings', \DCCGG\Widget::is_public_mode($settings));
$fullCopy = $full;   // render() only filters when is_public_mode() is true
check('full mode keeps every section', count($fullCopy['guide_sections']) === 7);
check('full mode keeps Request Support', $fullCopy['enable_problem_report'] === 'yes');

echo "\nG. Degenerate guides degrade cleanly (no notices, no half-state)\n";
// Every section guest-only: the public page must come back empty and
// well-formed rather than warning or emitting a partial section.
$allGuest = [
    'guide_mode' => 'public',
    'guide_sections' => [['section_key' => 'wifi', 'section_title' => 'Internet', 'section_audience' => 'guest']],
    'guide_items'    => [['item_section' => 'wifi', 'item_title' => 'Password', 'item_text' => 'DCC32586']],
];
$g = $allGuest;
\DCCGG\Widget::apply_public_mode($g);
check('all-guest guide yields zero sections', $g['guide_sections'] === []);
check('all-guest guide yields zero items', $g['guide_items'] === []);
check('all-guest guide leaks nothing', stripos(json_encode([$g['guide_sections'], $g['guide_items']]), 'DCC32586') === false);
$emptyIdx = \DCCGG\Widget::build_search_index($g);
check('search index over an empty public guide is empty', $emptyIdx === [] || $emptyIdx === array_values([]));

// A guide with no sections/items keys at all must not warn or fatal.
$bare = ['guide_mode' => 'public'];
\DCCGG\Widget::apply_public_mode($bare);
check('missing guide_sections/guide_items keys handled', $bare['guide_sections'] === [] && $bare['guide_items'] === []);

// Malformed rows (non-arrays) must be skipped, not crash the filter.
$malformed = [
    'guide_mode' => 'public',
    'guide_sections' => ['not-an-array', ['section_key' => 'ok', 'section_audience' => 'public']],
    'guide_items'    => ['also-not-an-array', ['item_section' => 'ok', 'item_title' => 'Fine']],
];
\DCCGG\Widget::apply_public_mode($malformed);
check('malformed rows skipped without error', count($malformed['guide_sections']) === 1 && count($malformed['guide_items']) === 1);

echo "\nH. Shortcode audience mapping fails SAFE\n";
// The shortcode attribute is typed by hand into page content. Before v0.10.2
// the mapping was `=== 'public' ? public : full`, so any slip — wrong case, a
// typo, an empty value — published the FULL guest guide, Wi-Fi passwords and
// all, on an indexable page. Only an explicit, recognised request for the
// guest guide may return 'full'.
$mustBePublic = ['public', 'Public', 'PUBLIC', ' public ', 'publc', 'prospects',
                 'prospect', '', 'yes', 'no', 'true', '0', 'gues', 'ful', 'anything'];
$leaky = [];
foreach ($mustBePublic as $a) {
    if (\DCCGG\Widget::mode_for_audience($a) !== 'public') { $leaky[] = var_export($a, true); }
}
check('typos, casing and empty values all resolve to public', !$leaky, implode(' | ', $leaky));

$mustBeFull = ['full', 'Full', 'FULL', ' full ', 'guest', 'Guest', 'guests'];
$wrong = [];
foreach ($mustBeFull as $a) {
    if (\DCCGG\Widget::mode_for_audience($a) !== 'full') { $wrong[] = var_export($a, true); }
}
check('explicit full/guest still renders the guest guide', !$wrong, implode(' | ', $wrong));

// Non-string inputs must not warn or fatal.
check('non-string audience handled', \DCCGG\Widget::mode_for_audience(null) === 'public'
    && \DCCGG\Widget::mode_for_audience(0) === 'public'
    && \DCCGG\Widget::mode_for_audience([]) === 'public');

// End-to-end: the mode the shortcode picks must actually filter the guide.
$srcSettings = $settings;                 // fixture with Wi-Fi + checkout guest sections
$srcSettings['guide_mode'] = \DCCGG\Widget::mode_for_audience('Public');   // capital P
if (\DCCGG\Widget::is_public_mode($srcSettings)) { \DCCGG\Widget::apply_public_mode($srcSettings); }
$blob = json_encode([$srcSettings['guide_sections'], $srcSettings['guide_items']]);
check('capital-P "Public" still filters out guest content', stripos($blob, 'DCC32586') === false
    && stripos($blob, 'excitedgadfly450') === false, 'guest content survived');

echo "\n$pass passed, $fail failed\n";
if ($fail) { echo "Failures:\n"; foreach ($failures as $f) { echo "  - $f\n"; } exit(1); }
