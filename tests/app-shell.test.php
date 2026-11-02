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
$propPhp = plugin_file('includes/class-property.php');
$css    = plugin_file('assets/css/widget.css');
$cssMin = plugin_file('assets/css/widget.min.css');
$cssG   = plugin_file('assets/css/widget-guest.min.css');
$jsCore = plugin_file('assets/js/widget.js');
$jsApp  = plugin_file('assets/js/widget-app.js');
$jsCond = plugin_file('assets/js/widget-conditions.js');
$build  = (string) @file_get_contents(__DIR__ . '/../build-min.sh');

require_once __DIR__ . '/_emit-guide.php';

// Render the three states once; every markup assertion reads these.
$appHtml    = dccgg_render_guide(dccgg_guide_case('app'));
$appPublic  = dccgg_render_guide(dccgg_guide_case('app-public'));
$gridHtml   = dccgg_render_guide(dccgg_guide_case('all-on'));
// The staging state: the app layout on a guide with NO section roles, NO
// tab settings and NO tile nouns — which is how every fresh widget starts.
$appNoCfg   = dccgg_render_guide(dccgg_guide_case('app-bare'));

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
// v0.27.0: ONE pill, under the hero. The per-section
// "%s Not Working? Tell the Front Desk" is gone from the plugin, not hidden
// on one widget — Rob's words: tacky, and it invites a guest to ask before
// they look for the answer already on the screen.
check('there is one Front Desk pill, under the hero',
    substr_count($appHtml, 'dccgg-report-pill--hero') === 1);
check('…and not one inside any section',
    strpos($appHtml, 'dccgg-report-pill--section') === false
    && strpos($css, 'dccgg-report-pill--section') === false);
check('…and the string that built it is gone from the panel too',
    strpos($widget, 'str_app_section_fd') === false
    && strpos($widget, 'Not Working?') === false);
check('the app layout is one SELECT value, not a second switch',
    preg_match("/'app'\s*=>\s*__\('App shell/", $widget) === 1);
check('flip falls back to stage in the app layout — a sheet needs the stage',
    strpos($widget, "\$flip_incompatible = ['list', 'carousel', 'split-pane', 'app'];") !== false);

echo "\nB. The stay resolver is GONE\n";

// Rob's decision: no per-guest links, so nothing resolves a booking and the
// machinery that did is removed rather than left idle. An unused public
// endpoint backed by a secret is something we would have to defend for
// nothing. These are absence checks, and absence is the whole feature.
check('there is no Stay class left', !is_readable($dir . 'includes/class-stay.php'));
foreach ([
    'the signed token'   => 'dccgg-stay-v1',
    'the signing helper' => 'hash_hmac',
    'the booking lookup' => 'mphb_booking',
    'the cottage label'  => 'short_cottage_name',
] as $what => $needle) {
    check("$what is gone from the plugin",
        strpos($propPhp, $needle) === false
        && strpos($widget, $needle) === false
        && strpos($plugin, $needle) === false);
}
check('the dccgg_stay endpoint is unregistered', strpos($plugin, 'dccgg_stay') === false);
check('…and its handler is gone', strpos($plugin, 'function handle_stay') === false);
check('the Guest Links admin page is gone',
    strpos($plugin, 'Guest Links') === false
    && strpos($plugin, 'render_guest_links_panel') === false);
check('the chunk no longer asks for a stay',
    strpos($jsApp, 'dccgg_stay') === false && strpos($jsApp, "get('t')") === false);
check('…and no longer paints dates or a progress bar',
    strpos($jsApp, 'data-dccgg-dates') === false && strpos($jsApp, 'progress-fill') === false);
check('the hero markup carries neither',
    strpos($appHtml, 'data-dccgg-dates') === false
    && strpos($appHtml, 'data-dccgg-progress') === false);
check('the secret is deleted once, from admin only',
    strpos($plugin, "'forget_dead_secret'") !== false
    && substr_count($propPhp, 'delete_option(') === 1);
check('…and only when it is there, so nothing is written twice',
    strpos($propPhp, 'get_option(self::DEAD_SECRET_OPTION, null) !== null') !== false);

echo "\nC. The property's clock\n";

check('"11:00" reads as "11:00 AM"', \DCCGG\Widget::app_clock('11:00') === '11:00 AM');
check('"14:00" reads as "2:00 PM"',  \DCCGG\Widget::app_clock('14:00') === '2:00 PM');
check('"00:30" reads as "12:30 AM"', \DCCGG\Widget::app_clock('00:30') === '12:30 AM');
foreach (['', '11', '25:00', '11:60', 'eleven', '11:0', '1100'] as $bad) {
    check('an unreadable time prints nothing: ' . var_export($bad, true),
        \DCCGG\Widget::app_clock($bad) === '');
}
check('MotoPress is asked first, the option second, and nothing third',
    strpos($propPhp, 'getCheckInTime') !== false
    && strpos($propPhp, 'get_option($option') !== false);
// Both sources, by the clock pattern itself rather than by counting every
// preg_match in the file — sun_today() has one of its own now.
check('a malformed time from either source is discarded, not shown',
    substr_count($propPhp, "([01]?\\d|2[0-3]):[0-5]\\d") === 2);

echo "\nC2. Working with nothing configured\n";

// Every one of these was reported from staging, where the widget was fresh:
// no section roles, no tab settings, no tile nouns.
$live_like = [
    ['section_key' => 'internet', 'section_title' => 'Internet'],
    ['section_key' => 'canal',    'section_title' => 'Boating / Fishing'],
    ['section_key' => 'checkout', 'section_title' => 'Checkout'],
    ['section_key' => 'map',      'section_title' => 'Map'],
];
check('the checkout section is found by KEY when no role is set',
    \DCCGG\Widget::app_checkout_key($live_like) === 'checkout');
check('…and by role when one is given, which still wins',
    \DCCGG\Widget::app_checkout_key(
        [['section_key' => 'leaving', 'section_role' => 'checkout'], ['section_key' => 'checkout']]
    ) === 'leaving');
check('…and is empty when the guide has neither',
    \DCCGG\Widget::app_checkout_key([['section_key' => 'pool']]) === '');
check('the Canal tab finds the map section',
    \DCCGG\Widget::app_map_key($live_like) === 'map');
check('…falling back to a canal one when there is no map',
    \DCCGG\Widget::app_map_key([['section_key' => 'canal', 'section_title' => 'Boating / Fishing']]) === 'canal');
check('…and to nothing at all rather than a wrong guess',
    \DCCGG\Widget::app_map_key([['section_key' => 'pool', 'section_title' => 'Pool']]) === '');
check('the welcome names the property from the site title',
    \DCCGG\Widget::default_welcome() === 'Welcome to Dora Canal Court',
    \DCCGG\Widget::default_welcome());
check('the Guide tab renders even with no section chosen',
    substr_count($appNoCfg, 'data-app-tab="menu"') === 1);
check('…and the Canal tab appears from the auto-detected map section',
    strpos($appNoCfg, 'data-app-tab-key="map"') !== false);
check('a fresh widget gets four tabs, not the two staging showed',
    substr_count($appNoCfg, 'data-app-tab=') === 4,
    (string) substr_count($appNoCfg, 'data-app-tab='));
check('the Checkout tile carries the property clock with no role set',
    strpos($appNoCfg, '11:00 AM · 3 steps') !== false,
    implode(' | ', (function ($h) {
        preg_match_all('/dccgg-tile-summary">([^<]*)</', $h, $m);
        return $m[1];
    })($appNoCfg)));

echo "\nC3. v0.26.2 — the property's name, the noun, and one sun\n";

check('an all-capitals site name is read in Title Case',
    \DCCGG\Widget::title_case('DORA CANAL COURT') === 'Dora Canal Court');
check('…with the small words left small in the middle',
    \DCCGG\Widget::title_case('THE INN OF THE LAKES') === 'The Inn of the Lakes');
check('…and capitalised after a hyphen',
    \DCCGG\Widget::title_case('SMITH-JONES COTTAGES') === 'Smith-Jones Cottages');
check('a name the host already cased is left exactly alone',
    \DCCGG\Widget::title_case('McBride House') === 'McBride House'
    && \DCCGG\Widget::title_case('cottage iQ') === 'cottage iQ');
check('a single all-capitals word is left alone — it may be an initialism',
    \DCCGG\Widget::title_case('DCC') === 'DCC'
    && \DCCGG\Widget::title_case('NASA') === 'NASA');
check('an empty name stays empty', \DCCGG\Widget::title_case('') === '');
check('the welcome itself is Title Case on this site',
    \DCCGG\Widget::default_welcome() === 'Welcome to Dora Canal Court');

$sec2 = fn(array $x = []) => $x + ['section_key' => 'k'];
check('a checklist section counts STEPS, not items',
    \DCCGG\Widget::app_tile_summary($sec2(['checklist_mode' => 'yes']), 7) === '7 steps');
check('…and a plain one still counts items',
    \DCCGG\Widget::app_tile_summary($sec2(), 7) === '7 items');
check('…while the host\'s own noun still beats both',
    \DCCGG\Widget::app_tile_summary($sec2(['checklist_mode' => 'yes', 'section_summary_noun' => 'networks']), 7)
        === '7 networks');
check('one step is a step', \DCCGG\Widget::app_tile_summary($sec2(['checklist_mode' => 'yes']), 1) === '1 step');

// Rob's pick: the live conditions inside the frosted card.
check('the conditions strip renders inside the hero card',
    preg_match('/dccgg-app-stay.*?data-dccgg-now.*?<\/div>\s*<\/div>/s', $appHtml) === 1);
check('…and is not also left standing on its own below the hero',
    substr_count($appHtml, 'class="dccgg-app-now"') === 1,
    (string) substr_count($appHtml, 'class="dccgg-app-now"'));

// ONE sun. Two places used to work it out separately.
check('the server resolves today\'s sun times for everyone',
    strpos($propPhp, 'function sun_today') !== false
    && strpos($propPhp, "\$data['sunToday'] = \$sun;") !== false);
check('…picking the row by DATE, never by position',
    strpos($propPhp, "array_search(\$today, \$times, true)") !== false);
check('…in the cottage\'s timezone, not the server\'s',
    strpos($propPhp, "\$data['timezone']") !== false);
check('…and at send time, so a cache across midnight cannot serve yesterday',
    substr_count($plugin, 'sun_today(') === 2
    && substr_count($propPhp, 'function sun_today') === 1);

// Run it, rather than only reading it — and with no guard, because a guard
// is how this very rule survived a mutation run: it lived on Plugin, the
// render harness stubs that class, and the whole block skipped in silence.
$far  = (new DateTimeImmutable('now', new DateTimeZone('Pacific/Kiritimati')))->format('Y-m-d');
$near = (new DateTimeImmutable('now', new DateTimeZone('Pacific/Niue')))->format('Y-m-d');
check('the two probe zones are on different days — 25 hours apart, always',
    $far !== $near, "$far vs $near");
$payload = static fn(string $tz) => [
    'timezone' => $tz,
    'daily' => [
        'time'    => [$near, $far],
        'sunrise' => [$near . 'T05:00', $far . 'T06:00'],
        'sunset'  => [$near . 'T17:00', $far . 'T18:00'],
    ],
];
$a = \DCCGG\Property::sun_today($payload('Pacific/Kiritimati'));
$b = \DCCGG\Property::sun_today($payload('Pacific/Niue'));
check('today is read in the payload\'s own timezone, not this machine\'s',
    ($a['sunToday']['sunset'] ?? '') === '18:00'
    && ($b['sunToday']['sunset'] ?? '') === '17:00',
    json_encode([$a['sunToday'] ?? null, $b['sunToday'] ?? null]));
check('…and the row is found by date, not by sitting at index 0',
    ($a['sunToday']['sunrise'] ?? '') === '06:00');
$none = \DCCGG\Property::sun_today(['timezone' => 'Pacific/Niue',
    'daily' => ['time' => ['1999-01-01'], 'sunset' => ['1999-01-01T17:00']]]);
check('a payload with no row for today gains nothing rather than a wrong one',
    !isset($none['sunToday']));
check('a payload with no daily block is returned untouched',
    \DCCGG\Property::sun_today(['current' => []]) === ['current' => []]);
check('the conditions card reads it rather than its own calculation',
    strpos($jsCond, 'sunToday') !== false
    && strpos($widget, 'data-dccgg-sun="sunset"') !== false);
check('the app strip reads the same field',
    strpos($jsApp, 'd.sunToday && d.sunToday.sunset') !== false);
check('…and neither scans the daily array for itself any more',
    strpos($jsApp, 'daily.sunset') === false);

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
    && strpos($appHtml, '>11:00 AM · 5 steps<') !== false
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
check('the hero is the same either way, and holds no stay details on either',
    strpos($appPublic, 'dccgg-app-hero') !== false
    && strpos($appPublic, 'data-dccgg-dates') === false
    && strpos($appHtml, 'data-dccgg-dates') === false);

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
// v0.27.0: anchored on the BAR, because it is moved to <body>. A
// `.dccgg-root …` rule would stop matching the moment it moved.
check('the tab bar is re-asserted stateless at (0,4,0), beating the kit',
    strpos($css, '.dccgg-app-tabs.dccgg-app-tabs .dccgg-app-tab.dccgg-app-tab {') !== false);
check('…and no tab-bar rule is anchored on the root it leaves',
    !preg_match('/\.dccgg-root[^{,]*\.dccgg-app-tab/', $css));
// v0.27.0: ONE host. The pill lives under the hero and nowhere else, so the
// stage no longer needs a copy of its rules.
check('…and the pill, on the one host it still has',
    strpos($css, '.dccgg-root.dccgg-root.dccgg-app-shell .dccgg-report-pill {') !== false
    && strpos($css, '.dccgg-stage.dccgg-stage .dccgg-detail .dccgg-report-pill') === false);
check('the tab label is 14px fixed, not em',
    preg_match('/\.dccgg-app-tab-label \{[^}]*font-size: 14px;/s', $css) === 1);
check('both sun times are asked of the weather proxy, and the cache key moved',
    strpos($plugin, 'uv_index_max,sunrise,sunset') !== false
    && strpos($plugin, "'dccgg_wx3_'") !== false);

echo "\n$pass passed, $fail failed\n";
if ($failures) {
    echo "\nFailures:\n";
    foreach ($failures as $f) { echo "  - $f\n"; }
}
exit($fail === 0 ? 0 : 1);
