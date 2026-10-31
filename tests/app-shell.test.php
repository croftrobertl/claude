<?php
/**
 * DCC Guest Guide — the app shell (v0.26.0), checked in PHP.
 *
 *   A. OPT-IN. A guide on any other layout renders not one byte of it.
 *   B. The stay token: what it proves, and everything it refuses.
 *   C. The property's clock, and the cottage label.
 *   D. Tile summaries: authored, counted, and silent.
 *   E. Public mode: the Front Desk pill and tab are absent, and so is the
 *      Wi-Fi password — the two things that must never leak.
 *   F. The endpoint reads and never writes, and says "nobody" rather than
 *      erroring when there is nobody.
 *   G. The pieces are wired up: chunk, precache, build, bundle split.
 *
 *   php tests/app-shell.test.php
 *   DCCGG_PLUGIN_DIR=… php tests/app-shell.test.php
 */

$dir = rtrim(getenv('DCCGG_PLUGIN_DIR') ?: __DIR__ . '/../dcc-guest-guide', '/') . '/';
function plugin_file(string $rel): string
{
    global $dir;
    $path = $dir . $rel;
    return is_readable($path) ? (string) file_get_contents($path) : '';
}

$pass = 0; $fail = 0; $failures = [];
function check(string $name, bool $cond, string $detail = ''): void
{
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $fail++; $failures[] = $name . ($detail !== '' ? ' — ' . $detail : '');
           echo "  ✗ $name" . ($detail !== '' ? ' — ' . $detail : '') . "\n"; }
}

$widget = plugin_file('includes/class-widget.php');
$plugin = plugin_file('includes/class-plugin.php');
$stayPhp = plugin_file('includes/class-stay.php');
$css    = plugin_file('assets/css/widget.css');
$cssMin = plugin_file('assets/css/widget.min.css');
$cssG   = plugin_file('assets/css/widget-guest.min.css');
$jsCore = plugin_file('assets/js/widget.js');
$jsApp  = plugin_file('assets/js/widget-app.js');
$build  = (string) @file_get_contents(__DIR__ . '/../build-min.sh');

require_once __DIR__ . '/_emit-guide.php';

// Render the three states once; every markup assertion reads these.
$appHtml    = dccgg_render_guide(dccgg_guide_case('app'));
$appPublic  = dccgg_render_guide(dccgg_guide_case('app-public'));
$gridHtml   = dccgg_render_guide(dccgg_guide_case('all-on'));

echo "\nA. Opt-in: every other layout is untouched\n";

// The whole safety story of this release is in this block. /guest/ is on the
// grid layout, and if any of these fail it has changed without being asked.
$appOnly = [
    'dccgg-app-shell', 'dccgg-app-hero', 'dccgg-app-stay', 'dccgg-app-welcome',
    'dccgg-app-now', 'dccgg-app-tabs', 'dccgg-app-tab', 'dccgg-tile-summary',
    'dccgg-app-due', 'dccgg-report-pill',
    'dccgg-detail--fullscreen', 'dccgg-app-maps', 'dccgg-stage--app',
];
foreach ($appOnly as $cls) {
    check("a grid guide renders no .$cls", strpos($gridHtml, $cls) === false);
}
check('…and no app block in its data-config either',
    strpos($gridHtml, '&quot;app&quot;:{') === false
    && strpos($gridHtml, '&quot;app&quot;:null') !== false);
check('the app layout does render the shell',
    strpos($appHtml, 'dccgg-app-shell') !== false
    && strpos($appHtml, 'dccgg-app-hero') !== false
    && strpos($appHtml, 'dccgg-app-tabs') !== false);
// v0.26.0: ONE Front Desk affordance per screen. The hub's round ⋯ and the
// pop-up header's are both dropped in this layout — the pill replaces them,
// and the round face is 44px wide around a 48px circle, so in a 390 sheet the
// bell is cut off. That geometry is older than this release (the grid layout
// overflows 390 by 25px with it) and is reported, not fixed here.
check('the hub toolbar carries no second Front Desk control',
    strpos($appHtml, 'dccgg-more--hub') === false
    && strpos($gridHtml, 'dccgg-more--hub') !== false);
check('nor does the pop-up header',
    strpos($appHtml, "render_more_menu(\$s, 'popup'") === false
    && substr_count($appHtml, 'dccgg-more-summary--fd') === 0
    && substr_count($gridHtml, 'dccgg-more-summary--fd') > 0);
check('the pill is there in their place, once per section plus once under the hero',
    substr_count($appHtml, 'dccgg-report-pill--hero') === 1
    && substr_count($appHtml, 'dccgg-report-pill--section') === 9);
check('the app layout is one SELECT value, not a second switch',
    preg_match("/'app'\s*=>\s*__\('App shell/", $widget) === 1);
check('flip falls back to stage in the app layout — a sheet needs the stage',
    strpos($widget, "\$flip_incompatible = ['list', 'carousel', 'split-pane', 'app'];") !== false);

echo "\nB. The stay token\n";

// _render-guide.php already defines get_option; Stay also needs these two.
$GLOBALS['options'] = $GLOBALS['options'] ?? [];
if (!function_exists('add_option')) {
    function add_option($k, $v, $x = '', $a = true) {
        if (!array_key_exists($k, $GLOBALS['options'])) { $GLOBALS['options'][$k] = $v; }
        return true;
    }
}
if (!function_exists('wp_strip_all_tags')) {
    function wp_strip_all_tags($s) { return strip_tags((string) $s); }
}
// Guarded so a red run against a tree that predates the class reports real
// failures instead of fatalling on line one of this block.
check('the Stay resolver exists at all', is_readable($dir . 'includes/class-stay.php'));
if (is_readable($dir . 'includes/class-stay.php')) {
    require_once $dir . 'includes/class-stay.php';
}
if (!class_exists('\\DCCGG\\Stay')) {
    echo "  (skipping the rest of B and C — no Stay class)\n";
} else {
$tok = \DCCGG\Stay::token(4242);
check('a minted token verifies back to its booking', \DCCGG\Stay::verify($tok) === 4242);
check('the secret is 64 hex characters',
    preg_match('/^[0-9a-f]{64}$/', (string) get_option(\DCCGG\Stay::SECRET_OPTION, '')) === 1);
check('a token for one booking does not verify as another',
    \DCCGG\Stay::verify('4243.' . explode('.', $tok)[1]) === 0);
check('one flipped character in the signature fails',
    \DCCGG\Stay::verify(substr($tok, 0, -1) . (substr($tok, -1) === 'a' ? 'b' : 'a')) === 0);
check('a truncated signature fails rather than matching a prefix',
    \DCCGG\Stay::verify(substr($tok, 0, strlen($tok) - 4)) === 0);
foreach (['', '   ', '4242', '4242.', '.abc', '4242.4242.abc', '0.' . explode('.', $tok)[1],
          '-1.aaaaaaaaaaaaaaaaaaaa', str_repeat('9', 200)] as $junk) {
    check("junk token " . var_export($junk, true) . " is refused", \DCCGG\Stay::verify($junk) === 0);
}
check('an unverified id resolves to nothing, whatever the caller passes',
    \DCCGG\Stay::resolve(0) === null && \DCCGG\Stay::resolve(-5) === null);
check('the comparison is constant-time, not ===',
    strpos($stayPhp, 'hash_equals(') !== false
    && preg_match('/==\s*\$sig|\$sig\s*==/', $stayPhp) !== 1);
check('the signature is domain-separated, so it cannot be replayed elsewhere',
    strpos($stayPhp, "HMAC_CONTEXT = 'dccgg-stay-v1|'") !== false);
check('only a CONFIRMED booking greets anyone',
    strpos($stayPhp, "GREETING_STATUS = 'confirmed'") !== false
    && strpos($stayPhp, '$booking->post_status !== self::GREETING_STATUS') !== false);
check('the post type is checked too, so any post id is not a stay',
    strpos($stayPhp, "post_type !== 'mphb_booking'") !== false);
check('the resolved stay carries dates and a cottage, and nothing personal',
    preg_match('/\$stay = \[\s*\'cottage\'.*?\'checkIn\'.*?\'checkOut\'.*?\'timeIn\'.*?\'timeOut\'.*?\];/s', $stayPhp) === 1
    && !preg_match("/'(email|guestName|name|price|total|phone)'\s*=>/", $stayPhp));
check('the secret is NOT written on install, activation or upgrade',
    strpos($plugin, 'Stay::secret') === false
    && strpos($stayPhp, 'register_activation_hook') === false);
check('a backwards date range is refused',
    strpos($stayPhp, '$out <= $in') !== false);

echo "\nC. The property's clock, and the cottage label\n";

check('"11:00" reads as "11:00 AM"', \DCCGG\Widget::app_clock('11:00') === '11:00 AM');
check('"14:00" reads as "2:00 PM"',  \DCCGG\Widget::app_clock('14:00') === '2:00 PM');
check('"00:30" reads as "12:30 AM"', \DCCGG\Widget::app_clock('00:30') === '12:30 AM');
foreach (['', '11', '25:00', '11:60', 'eleven', '11:0', '1100'] as $bad) {
    check('an unreadable time prints nothing: ' . var_export($bad, true),
        \DCCGG\Widget::app_clock($bad) === '');
}
check('MotoPress is asked first, the option second, and nothing third',
    strpos($stayPhp, 'getCheckInTime') !== false
    && strpos($stayPhp, "get_option(\$option, '')") !== false);
check('a malformed time from either source is discarded, not shown',
    substr_count($stayPhp, "preg_match('/^([01]?\\d|2[0-3]):[0-5]\\d\$/'") === 2);
check('"Cottage 34: Coconut Cottage" shortens to "Cottage 34"',
    \DCCGG\Stay::short_cottage_name('Cottage 34: Coconut Cottage') === 'Cottage 34');
check('a title with no colon is kept whole',
    \DCCGG\Stay::short_cottage_name('The Boathouse') === 'The Boathouse');
check('a leading colon does not empty the label',
    \DCCGG\Stay::short_cottage_name(': Coconut') === ': Coconut');
check('an ISO date is validated, not just pattern-matched',
    \DCCGG\Stay::is_iso_date('2026-02-29') === false
    && \DCCGG\Stay::is_iso_date('2028-02-29') === true
    && \DCCGG\Stay::is_iso_date('2026-13-01') === false);

}

echo "\nD. Tile summaries\n";

$sec = fn(array $x = []) => $x + ['section_key' => 'k'];
check('an authored line wins over the count',
    \DCCGG\Widget::app_tile_summary($sec(['section_summary' => 'Coffee · Games']), 9) === 'Coffee · Games');
check('otherwise the items are counted, with the host\'s noun',
    \DCCGG\Widget::app_tile_summary($sec(['section_summary_noun' => 'networks']), 3) === '3 networks');
check('one of them drops the plural',
    \DCCGG\Widget::app_tile_summary($sec(['section_summary_noun' => 'networks']), 1) === '1 network');
check('no noun falls back to "items"',
    \DCCGG\Widget::app_tile_summary($sec(), 4) === '4 items');
check('an empty section says NOTHING rather than "0 items"',
    \DCCGG\Widget::app_tile_summary($sec(), 0) === '');
check('the checkout tile leads with the property\'s time',
    \DCCGG\Widget::app_tile_summary($sec(['section_role' => 'checkout', 'section_summary_noun' => 'steps']), 7, '11:00')
        === '11:00 AM · 7 steps');
check('…and drops it when MotoPress reports none',
    \DCCGG\Widget::app_tile_summary($sec(['section_role' => 'checkout', 'section_summary_noun' => 'steps']), 7, '')
        === '7 steps');
check('…and is the time alone when there is nothing to count',
    \DCCGG\Widget::app_tile_summary($sec(['section_role' => 'checkout']), 0, '11:00') === '11:00 AM');
check('the rendered guide carries the real lines, not placeholders',
    strpos($appHtml, '>2 networks<') !== false
    && strpos($appHtml, '>11:00 AM · 3 steps<') !== false
    && strpos($appHtml, '>Coffee · Games<') !== false);

echo "\nE. Public mode, and the secrets\n";

check('the public app shell has no Front Desk pill',
    strpos($appPublic, 'dccgg-report-pill') === false
    && strpos($appHtml, 'dccgg-report-pill') !== false);
check('…and no Front Desk tab',
    substr_count($appPublic, 'data-app-tab="report"') === 0
    && substr_count($appHtml, 'data-app-tab="report"') === 1);
check('…but it still has a tab bar, so the layout is not half-rendered',
    strpos($appPublic, 'dccgg-app-tabs') !== false);
check('the Wi-Fi password is absent from the public app shell',
    strpos($appPublic, 'DCC32586') === false);
check('…and from the guest app shell\'s source as well — it is revealed, not rendered',
    strpos($appHtml, 'DCC32586') === false);
check('a guest-only section is dropped from the public app shell',
    strpos($appPublic, 'data-section-key="emergency"') === false);
check('the hero itself is the same either way — it holds no stay details',
    strpos($appPublic, 'dccgg-app-hero') !== false
    && strpos($appPublic, 'data-dccgg-dates') !== false);

echo "\nF. The endpoint\n";

check('dccgg_stay is registered for logged-out guests too',
    strpos($plugin, "add_action('wp_ajax_nopriv_dccgg_stay'") !== false);
check('it reads $_GET, never $_POST',
    preg_match('/function handle_stay\(\).*?\n    \}/s', $plugin, $m) === 1
    && strpos($m[0], "\$_GET['t']") !== false
    && strpos($m[0], '$_POST') === false);
check('it writes nothing but its own rate-limit counter',
    isset($m[0]) && substr_count($m[0], 'set_transient') === 1
    && strpos($m[0], 'update_option') === false
    && strpos($m[0], 'wp_insert') === false);
check('no token is a plain success with no stay, not an error',
    isset($m[0]) && strpos($m[0], "wp_send_json_success(['stay' => \$stay ?: null])") !== false);
check('it is rate-limited',
    isset($m[0]) && strpos($m[0], 'dccgg_stay_rl_') !== false);
check('it checks the nonce',
    isset($m[0]) && strpos($m[0], "check_ajax_referer('dccgg_nonce'") !== false);

echo "\nG. The wiring\n";

check('the app chunk is in CHUNKS, gated on the shell class',
    strpos($jsCore, "app:        '.dccgg-app-shell'") !== false);
check('…and the gate tests the ROOT, not only its descendants',
    strpos($jsCore, 'root.matches && root.matches(CHUNKS[name])') !== false);
check('core publishes openDetail / closeDetail for it',
    preg_match('/window\.DCCGG_CORE = \{.*?openDetail,.*?closeDetail,.*?\};/s', $jsCore) === 1);
check('the chunk reaches core only through DCCGG_CORE',
    strpos($jsApp, 'window.DCCGG_CORE') !== false
    && !preg_match('/window\.(?!DCCGG_CORE|DCCGG_CHUNK|location|history|history|Date|Intl)[A-Za-z_]*DCCGG/', $jsApp));
check('the chunk refuses a root it has already wired',
    strpos($jsApp, 'root.__dccggAppWired') !== false);
check('it does not reimplement the swipe core already has',
    strpos($jsApp, "addEventListener('touchmove'") === false
    && strpos($jsApp, 'SWIPE-DOWN IS NOT HERE') !== false);
check('the build script minifies it',
    strpos($build, 'CHUNKS="conditions gallery wizard video app"') !== false);
check('the service worker precaches it',
    strpos($plugin, "'conditions', 'gallery', 'wizard', 'video', 'app'") !== false);
check('the pill\'s CSS is in the GUEST bundle, where public mode cannot reach it',
    strpos($cssG, 'dccgg-report-pill') !== false
    && strpos($cssMin, 'dccgg-report-pill') === false);
check('the tab bar\'s CSS is in CORE — the public guide has a tab bar too',
    strpos($cssMin, 'dccgg-app-tab') !== false);
// The splitter moves a rule PER SELECTOR, so a list mixing a pill selector
// with a public one would put the public half in core and the pill half in
// the guest bundle — which is fine — but an :is() holding both counts as ONE
// selector and would carry the pill into the public page. Parse the authored
// stylesheet and check every list that mentions the pill.
$mixed = [];
$stripped = preg_replace('~/\*[\s\S]*?\*/~', '', $css);
foreach (preg_split('/\}/', (string) $stripped) as $chunk) {
    $at = strrpos($chunk, '{');
    if ($at === false) { continue; }
    $prelude = substr($chunk, 0, $at);
    if (strpos($prelude, 'dccgg-report-pill') === false) { continue; }
    // Top-level commas only: :is(a, b) is ONE selector, the same way
    // build-min.sh counts it.
    $sel = ''; $depth = 0; $list = [];
    foreach (str_split($prelude) as $ch) {
        if ($ch === '(') { $depth++; }
        elseif ($ch === ')') { $depth--; }
        if ($ch === ',' && $depth === 0) { $list[] = trim($sel); $sel = ''; }
        else { $sel .= $ch; }
    }
    if (trim($sel) !== '') { $list[] = trim($sel); }
    foreach ($list as $one) {
        if (strpos($one, 'dccgg-report-pill') === false) { continue; }
        // Every part of a selector the splitter would keep must itself be
        // guest-only — the splitter tests the whole selector string.
        if (!preg_match('/\.dccgg-(report|review|ai-|sos|more|btn-send|btn-cancel)/', $one)) {
            $mixed[] = $one;
        }
    }
}
check('every pill selector is one the splitter recognises as guest-only',
    $mixed === [], implode(' | ', $mixed));
check('the tab bar is re-asserted stateless at (0,4,0), beating the kit',
    strpos($css, '.dccgg-root.dccgg-root .dccgg-app-tabs .dccgg-app-tab {') !== false);
check('…and the pill on both hosts, because the stage is portaled to <body>',
    strpos($css, '.dccgg-root.dccgg-root .dccgg-report-pill.dccgg-report-pill,') !== false
    && strpos($css, '.dccgg-stage.dccgg-stage .dccgg-report-pill.dccgg-report-pill') !== false);
check('the tab label is 14px fixed, not em',
    preg_match('/\.dccgg-app-tab-label \{[^}]*font-size: 14px;/s', $css) === 1);
check('sunset is asked of the weather proxy, and its cache key moved with it',
    strpos($plugin, 'uv_index_max,sunset') !== false
    && strpos($plugin, "'dccgg_wx2_'") !== false);

echo "\n$pass passed, $fail failed\n";
if ($failures) {
    echo "\nFailures:\n";
    foreach ($failures as $f) { echo "  - $f\n"; }
}
exit($fail === 0 ? 0 : 1);
