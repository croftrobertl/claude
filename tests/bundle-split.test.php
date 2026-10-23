<?php
/**
 * DCC Guest Guide — v0.25.0, the two script splits, checked against the source.
 *
 *   A. the guest-only bundle: the four guest features left core, core guards
 *      every call, and the contract between the two files is the only way
 *      across;
 *   B. the four per-element chunks: they left core, core knows which element
 *      each needs, and nothing fetches one on a tap;
 *   C. the server decides, in the same place the stylesheet split does, and
 *      the service worker precaches what an offline guide will need;
 *   D. the Front Desk note follows Rob's alignment rule from its own text.
 *
 *   php tests/bundle-split.test.php
 *   DCCGG_PLUGIN_DIR=… php tests/bundle-split.test.php
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

$core   = plugin_file('assets/js/widget.js');
$guest  = plugin_file('assets/js/widget-guest.js');
$widget = plugin_file('includes/class-widget.php');
$plugin = plugin_file('includes/class-plugin.php');
$css    = plugin_file('assets/css/widget.css');
$chunks = [
    'conditions' => plugin_file('assets/js/widget-conditions.js'),
    'gallery'    => plugin_file('assets/js/widget-gallery.js'),
    'wizard'     => plugin_file('assets/js/widget-wizard.js'),
    'video'      => plugin_file('assets/js/widget-video.js'),
];

echo "\nA. The guest-only bundle\n";

check('widget-guest.js exists', $guest !== '');
// The four features apply_public_mode() switches off. A prospect downloaded
// every one of them before v0.25.0 and could use none.
$moved = ['wireReportProblem', 'sendReport', 'wireReview', 'interpolateReview',
          'wireVoiceConcierge', 'recordOnce', 'speak', 'askAi', 'reportSearchMiss'];
foreach ($moved as $fn) {
    check("$fn is in the guest bundle", strpos($guest, "function $fn(") !== false);
    check("…and gone from core", strpos($core, "function $fn(") === false);
}
// Three helpers the brief named as staying, because the PUBLIC guide uses them.
foreach (['dccggFetch', 'showToast', 'renderEmptyState'] as $fn) {
    check("$fn stays in core", strpos($core, "function $fn(") !== false);
    check("…and is not duplicated in the guest bundle", strpos($guest, "function $fn(") === false);
}

echo "\n   Core guards every call\n";
// A bare call would throw on /explore/, where the bundle is absent.
foreach (['wireReportProblem', 'wireVoiceConcierge', 'wireReview', 'askAi', 'reportSearchMiss'] as $fn) {
    check("no unguarded call to $fn in core",
        preg_match('/(^|[^.A-Za-z0-9_$])' . preg_quote($fn, '/') . '\s*\(/m', $core) !== 1);
}
check('the three wirers go through applyGuest, behind one window.DCCGG_GUEST test',
    preg_match('/function applyGuest\(root, config\)\s*\{\s*const G = window\.DCCGG_GUEST;\s*if \(!G \|\| root\.__dccggGuestWired\) return;/s', $core) === 1);
check('applyGuest refuses a root it has already wired',
    strpos($core, 'root.__dccggGuestWired = true;') !== false);
check('the two calls inside renderEmptyState are guarded individually',
    substr_count($core, 'if (window.DCCGG_GUEST) window.DCCGG_GUEST.') === 2);

echo "\n   The contract, and only the contract\n";
$expected = ['bindGlobal', 'copyText', 'dccggFetch', 'escAttr', 'escHtml',
             'getWidgetId', 'showToast', 'stayKey'];
check('core publishes DCCGG_CORE', strpos($core, 'window.DCCGG_CORE = {') !== false);
foreach ($expected as $h) {
    check("DCCGG_CORE carries $h", preg_match('/window\.DCCGG_CORE = \{.*?\b' . $h . '\b.*?\n    \};/s', $core) === 1);
}
check('the guest bundle publishes DCCGG_GUEST with the five entry points',
    preg_match('/window\.DCCGG_GUEST = \{\s*wireReportProblem,\s*wireVoiceConcierge,\s*wireReview,\s*askAi,\s*reportSearchMiss,\s*\};/s', $guest) === 1);
// The boundary is the point. If the bundle reaches a core function by name
// rather than through CORE, the split has stopped being a boundary.
preg_match_all('/^    (?:async )?function ([A-Za-z0-9_$]+)\(/m', $core, $m);
$coreFns = $m[1];
// Comments name applyGuest() and init() when explaining the handshake, and a
// mention is not a reach. Strip them before looking for real calls.
$guestCode = preg_replace(['#/\*[\s\S]*?\*/#', '#(^|\s)//[^\n]*#m'], ' ', $guest);
preg_match_all('/^    (?:async )?function ([A-Za-z0-9_$]+)\(/m', $guest, $m2);
$guestOwn = $m2[1];
$leaks = [];
foreach ($coreFns as $fn) {
    if (in_array($fn, $guestOwn, true) || in_array($fn, $expected, true)) { continue; }
    if (preg_match('/(^|[^.A-Za-z0-9_$])' . preg_quote($fn, '/') . '\s*\(/m', $guestCode)) { $leaks[] = $fn; }
}
check('the guest bundle reaches core only through DCCGG_CORE', $leaks === [], implode(' ', $leaks));

echo "\n   Either load order works\n";
// SpeedyCache combines and defers scripts on this host, so neither file can
// assume it runs second.
check('the bundle starts now when core is already there',
    strpos($guest, 'if (window.DCCGG_CORE) { boot(window.DCCGG_CORE); }') !== false);
check('…and leaves boot() behind when it is not',
    strpos($guest, 'else { window.__dccggGuestBoot = boot; }') !== false);
check('core runs a waiting boot() the moment it publishes the contract',
    preg_match('/window\.DCCGG_CORE = \{.*?\};\s*\/\/.*?\n\s*if \(typeof window\.__dccggGuestBoot === .function.\)/s', $core) === 1);
check('the helpers are bound in boot(), not at definition time',
    preg_match('/let CORE, bindGlobal, copyText, dccggFetch/', $guest) === 1);

echo "\nB. The four per-element chunks\n";

$selectors = [
    'conditions' => '.dccgg-conditions',
    'gallery'    => '.dccgg-gallery-thumb, img.dccgg-media',
    'wizard'     => '.dccgg-wizard',
    'video'      => '.dccgg-video-poster',
];
foreach ($selectors as $name => $sel) {
    check("the $name chunk exists", $chunks[$name] !== '');
    check("…and registers itself under '$name'",
        strpos($chunks[$name], "window.DCCGG_CHUNK || {})['" . $name . "']") !== false);
    check("core knows its element is $sel",
        preg_match('/const CHUNKS = \{.*?' . preg_quote($sel, '/') . '.*?\};/s', $core) === 1);
}
foreach (['wireConditions', 'wireGalleryStrip', 'wireLightbox', 'openGalleryLightbox',
          'ensureLightbox', 'wireWizard', 'wireVideoPosters', 'weatherEmoji',
          'renderWindRow', 'leewardTipForLakeDora'] as $fn) {
    check("$fn left core", strpos($core, "function $fn(") === false);
}
check('every chunk reads its helpers from DCCGG_CORE, if it needs any',
    count(array_filter($chunks, fn($c) => $c !== '' && strpos($c, 'window.DCCGG_CORE') === false)) === 0);
check('the chunks that need helpers get them from the same contract',
    strpos($chunks['conditions'], 'dccggFetchGet') !== false
    && strpos($chunks['wizard'], 'spawnConfetti') !== false
    && strpos($chunks['gallery'], 'bindGlobal') !== false);
foreach (['dccggFetchGet', 'hapticPulse', 'spawnConfetti', 'REDUCED_MOTION'] as $h) {
    check("DCCGG_CORE carries $h for the chunks",
        preg_match('/window\.DCCGG_CORE = \{.*?\b' . $h . '\b.*?\n    \};/s', $core) === 1);
}

echo "\n   Never on a tap — the three-tap lesson\n";
// v0.9.7 fetched on first use and the host had to tap three times before
// anything happened. A chunk is requested at init or not at all.
check('applyChunks is called from init(), with applyGuest',
    preg_match('/applyGuest\(root, config\);\s*\n\s*applyChunks\(root, config\);\s*\n\s*\}/', $core) === 1);
check('the only caller of loadChunk is applyChunks',
    substr_count($core, 'loadChunk(') === 2);
foreach (['click', 'touchstart', 'touchend', 'pointerdown'] as $evt) {
    check("no $evt listener anywhere near the loader",
        preg_match('/function applyChunks.*?\}\s*\n\s*\n/s', $core, $mm) === 1
        && strpos($mm[0], $evt) === false);
}
check('a chunk that fails to load is reported and left retryable, not silent',
    preg_match('/\.catch\(\(err\) => \{.*?done\[name\] = false;.*?console\.warn/s', $core) === 1);
check('a root is never wired for the same chunk twice',
    strpos($core, 'const done = root.__dccggChunks || (root.__dccggChunks = {});') !== false);

echo "\nC. The server decides, and the worker remembers\n";

check('the guest SCRIPT is registered as its own handle',
    strpos($widget, "wp_register_script('dccgg-widget-guest'") !== false);
check('…depending on core',
    preg_match("/wp_register_script\('dccgg-widget-guest'[^;]*\['dccgg-widget'\]/s", $widget) === 1);
check('render() asks for it on the NOT-public branch, beside the stylesheet',
    preg_match('/if \(self::is_public_mode\(\$s\)\) \{\s*self::apply_public_mode\(\$s\);\s*\} else \{\s*self::enqueue_guest_css\(\);\s*self::enqueue_guest_js\(\);\s*\}/s', $widget) === 1);
// The stylesheet split is a preference; the script split is structural. A
// full guide that skipped the script would render a dead Front Desk button.
check('enqueue_guest_js does NOT consult split_guest_css',
    preg_match('/function enqueue_guest_js\(\): void\s*\{\s*if \(wp_script_is/s', $widget) === 1);
check('…while enqueue_guest_css still does',
    preg_match('/function enqueue_guest_css\(\): void\s*\{\s*if \(!Settings::get\(.split_guest_css.\)\)/s', $widget) === 1);
check('the head-time detector enqueues the script too',
    preg_match('/Widget::enqueue_guest_css\(\);.*?Widget::enqueue_guest_js\(\);/s', $plugin) === 1);
check('the chunk base URL is handed to core, not guessed',
    preg_match("/wp_localize_script\('dccgg-widget', 'dccggChunks', \[/", $widget) === 1
    && strpos($widget, "'base' => DCCGG_URL . 'assets/js/',") !== false);
check('the chunks are NOT registered with WordPress — core fetches them',
    strpos($widget, "wp_register_script('dccgg-widget-conditions'") === false);
check('the worker precaches the guest script',
    strpos($plugin, 'widget-guest.min.js') !== false);
check('…and all four chunks, since it cannot know which a guide needs',
    preg_match("/foreach \(\['conditions', 'gallery', 'wizard', 'video'\] as \\\$name\)/", $plugin) === 1);

echo "\nD. Rob's alignment rule in the Front Desk note\n";

// The same test the Cottage Selector uses (selector.js, isMulti at 0.54.0).
check('the note is classed from its own text, not by which string it is',
    strpos($guest, "const isMulti = (text) => /[.!?][\"\\u201D']?\\s+\\S/.test(") !== false);
check('the class lands on the privacy note',
    strpos($guest, "dccgg-report-privacy\${isMulti(STR.privacy) ? ' dccgg-multi' : ''}") !== false);
check('and the stylesheet left-aligns it',
    preg_match('/\.dccgg-report-dialog\.dccgg-report-dialog \.dccgg-multi \{ text-align: left; \}/', $css) === 1);
check('titles stay centred — the rule is a complement, not a replacement',
    preg_match('/\.dccgg-report-head h3[^{]*\{[^}]*text-align:\s*center/s', $css) === 1
    || preg_match('/\.dccgg-report-head h3 \{[^}]*\}/s', $css) === 1);

echo "\n$pass passed, $fail failed\n";
if ($fail > 0) { echo "\nFailures:\n"; foreach ($failures as $f) { echo "  - $f\n"; } }
exit($fail > 0 ? 1 : 0);
