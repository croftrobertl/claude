<?php
/**
 * DCC Guest Guide — v0.24.5, the three safe changes, checked against the
 * source rather than a browser.
 *
 *   A. the site blue: #0f6dbf is gone everywhere, #006BCF is in its place,
 *      and the three colours Rob keeps are untouched;
 *   B. the editor-only bundle: moved out of core, enqueued only by the two
 *      editor entry points, and core keeps exactly what it still needs;
 *   C. the Front Desk form: Title Case labels in BOTH the control default and
 *      the runtime fallback, and nothing left in sentence case.
 *
 *   php tests/site-blue.test.php
 *   DCCGG_PLUGIN_DIR=… php tests/site-blue.test.php
 */

$dir = rtrim(getenv('DCCGG_PLUGIN_DIR') ?: __DIR__ . '/../dcc-guest-guide', '/') . '/';
/** Read a plugin file, honouring DCCGG_PLUGIN_DIR so a mutant is the one tested. */
function plugin_file(string $rel): string
{
    global $dir;
    $path = $dir . $rel;
    return is_readable($path) ? (string) file_get_contents($path) : '';
}

$pass = 0;
$fail = 0;
$failures = [];
function check(string $name, bool $cond, string $detail = ''): void
{
    global $pass, $fail, $failures;
    if ($cond) {
        $pass++;
        echo "  ✓ $name\n";
    } else {
        $fail++;
        $failures[] = $name . ($detail !== '' ? ' — ' . $detail : '');
        echo "  ✗ $name" . ($detail !== '' ? ' — ' . $detail : '') . "\n";
    }
}

$css       = plugin_file('assets/css/widget.css');
// v0.25.0: core plus the guest-only bundle. The Front Desk form moved into
// the latter, and these checks are about the form's behaviour, not its file.
$js        = plugin_file('assets/js/widget.js') . plugin_file('assets/js/widget-guest.js');
$jsCore    = plugin_file('assets/js/widget.js');
$jsEd      = plugin_file('assets/js/widget-editor.js');
$widget    = plugin_file('includes/class-widget.php');
$pluginPhp = plugin_file('includes/class-plugin.php');
$cssMin    = plugin_file('assets/css/widget.min.css');
$cssGuest  = plugin_file('assets/css/widget-guest.min.css');
$jsMin     = plugin_file('assets/js/widget.min.js');
$jsEdMin   = plugin_file('assets/js/widget-editor.min.js');

echo "\nA. The site blue (#006BCF) replaces the guide blue (#0f6dbf)\n";

$sources = [
    'widget.css'        => $css,
    'widget.js'         => $js,
    'widget-editor.js'  => $jsEd,
    'class-widget.php'  => $widget,
    'class-plugin.php'  => $pluginPhp,
];
foreach ($sources as $name => $src) {
    check("no #0f6dbf left in $name", stripos($src, '0f6dbf') === false,
        (string) substr_count(strtolower($src), '0f6dbf') . ' left');
    check("no rgb(15, 109, 191) left in $name",
        preg_match('/15\s*,\s*109\s*,\s*191/', $src) !== 1);
}
// The built bundles are what the page actually downloads.
foreach (['widget.min.css' => $cssMin, 'widget-guest.min.css' => $cssGuest,
          'widget.min.js' => $jsMin, 'widget-editor.min.js' => $jsEdMin] as $name => $src) {
    check("no #0f6dbf in the built $name", $src !== '' && stripos($src, '0f6dbf') === false);
    check("no rgb(15,109,191) in the built $name",
        $src !== '' && preg_match('/15\s*,\s*109\s*,\s*191/', $src) !== 1);
}

// Each site the brief named, by what it means rather than by line number.
check('the --dccgg-primary token is the site blue',
    preg_match('/--dccgg-primary:\s*#006bcf;/i', $css) === 1);
check('the tile border is derived from it',
    preg_match('/--dccgg-tile-border:\s*rgba\(0,\s*107,\s*207,\s*0\.15\)/i', $css) === 1);
check('the coastal preset moved with it (CSS)',
    preg_match('/\.dccgg-preset-coastal\s*\{[^}]*--dccgg-primary:\s*#006bcf;[^}]*--dccgg-btn-bg:\s*#006bcf;/is', $css) === 1);
check('the coastal preset moved with it (PHP map)',
    strpos($widget, "'--dccgg-primary'      => '#006bcf',") !== false
    && strpos($widget, "'--dccgg-btn-bg'       => '#006bcf',") !== false
    && strpos($widget, "'--dccgg-tile-border'  => 'rgba(0,107,207,0.15)',") !== false);
check('the installable manifest declares the site blue',
    strpos($pluginPhp, "'theme_color'      => '#006bcf',") !== false);
check('and so does the theme-color meta tag',
    strpos($pluginPhp, '<meta name="theme-color" content="#006bcf">') !== false);
check('the confetti palette uses the site blue',
    strpos($js, "'#006bcf', '#c19a4b'") !== false);
// A var() fallback is what paints when a preset or a host override is absent,
// so every one of them has to move too, not just the token.
check('every var(--dccgg-primary, …) fallback is the site blue',
    preg_match('/var\(\s*--dccgg-primary\s*,\s*#(?!006bcf)[0-9a-f]{6}/i', $css) !== 1);
// Print styles are a separate cascade that no token reaches.
$printBlock = '';
if (preg_match('/@media print\s*\{.*/is', $css, $m)) {
    $printBlock = $m[0];
}
check('the print stylesheet carries the site blue and no other',
    $printBlock !== '' && stripos($printBlock, '0f6dbf') === false
    && stripos($printBlock, '#006bcf') !== false);

echo "\n   The three Rob keeps\n";
// By the TOKEN, not by a count: 24 other rules mention the coral, so a count
// stayed healthy even with --dccgg-btn-hover-bg itself overwritten.
check('the coral hover token still holds the coral',
    preg_match('/--dccgg-btn-hover-bg:\s*#f08080;/i', $css) === 1);
check('and the coral is still used widely', substr_count(strtolower($css), 'f08080') >= 10);
check("dark mode's #5fa8e8 survives", substr_count(strtolower($css), '5fa8e8') >= 5);
check("the minimal preset's #0066ff survives", stripos($css, '#0066ff') !== false);
check('the confetti palette still carries the dark-mode blue too',
    strpos($js, "'#5fa8e8'") !== false);

echo "\n   Nothing in the plugin pins the old colour as a control default\n";
// A control default is written into the page's own stylesheet the moment the
// page is saved, which would outrank everything above.
check('no Elementor control defaults to any blue',
    preg_match("/'default'\s*=>\s*'#(0f6dbf|006bcf|0066ff)'/i", $widget) !== 1);
check('the Primary / accent control is override-only (no default at all)',
    preg_match("/add_control\('primary_color',\s*\[[^\]]*'default'/s", $widget) !== 1);

echo "\nB. The editor-only bundle\n";

check('widget-editor.js exists', $jsEd !== '');
foreach (['wireWelcomePackEditor', 'exportGuide', 'importGuide', 'insertWelcomePack',
          'welcomePackPayload', 'editorPostId'] as $fn) {
    check("$fn lives in the editor bundle", strpos($jsEd, "function $fn(") !== false);
    check("…and no longer in core", strpos($jsCore, "function $fn(") === false);
}
check('the real toast moved to the editor bundle',
    strpos($jsEd, 'function editorPreviewToast(') !== false);
// The forwarding STATEMENT, not a mention of the name: the comment above it
// names the hook too, so a substring test passed even with the line gutted.
check('core keeps a forwarding stub, so its call sites are unchanged',
    strpos($jsCore, 'function editorPreviewToast(') !== false
    && preg_match('/const fn\s*=\s*window\.__dccggEditorToast\s*;/', $js) === 1
    && preg_match('/if\s*\(typeof fn !== .function.\)\s*return;/', $js) === 1
    && preg_match('/fn\(title,\s*detail\)/', $js) === 1);
check('the editor bundle installs the real one on that hook',
    strpos($jsEd, 'window.__dccggEditorToast = editorPreviewToast;') !== false);
// shouldUseDetailModal() needs this on the FRONT END: in the editor preview a
// portaled fixed modal is invisible, so the guide falls back to an inline
// reveal (v0.9.7.24). Moving it out would reintroduce that bug.
check('core still owns isElementorEditorPreview, which it needs itself',
    strpos($jsCore, 'function isElementorEditorPreview(') !== false);
check('and still calls it from shouldUseDetailModal',
    preg_match('/function shouldUseDetailModal\(root\)\s*\{.*?isElementorEditorPreview\(\)/s', $jsCore) === 1);
check('core no longer registers the editor click listener at boot',
    strpos($jsCore, 'wireWelcomePackEditor();') === false);
check('the editor bundle registers it instead',
    strpos($jsEd, 'wireWelcomePackEditor();') !== false);

check('the editor bundle is registered as its own handle',
    strpos($widget, "wp_register_script('dccgg-widget-editor'") !== false);
check('…depending on core, so it loads after it',
    preg_match("/wp_register_script\('dccgg-widget-editor'[^;]*\['dccgg-widget'\]/s", $widget) === 1);
check('…and prefers its minified build when present',
    strpos($widget, "assets/js/widget-editor.min.js") !== false);
check('the editor panel enqueues it',
    preg_match('/function enqueue_for_editor\(\).*?wp_enqueue_script\(\'dccgg-widget-editor\'\)/s', $widget) === 1);
check('the preview iframe enqueues it',
    preg_match('/function enqueue_for_preview\(\).*?wp_enqueue_script\(\'dccgg-widget-editor\'\)/s', $widget) === 1);
check('the Export / Import data rides on the editor handle',
    strpos($widget, "wp_localize_script('dccgg-widget-editor', 'dccggEditor'") !== false);
// The whole point: a visitor's page must not ask for it.
check('nothing on the front end enqueues it',
    substr_count($widget, "wp_enqueue_script('dccgg-widget-editor')") === 2);
check('render() never enqueues it',
    preg_match('/function render\(\).*?dccgg-widget-editor/s', $widget) !== 1);

echo "\nC. The Front Desk form's labels\n";

$titleCase = [
    'category' => "What's the Issue?",
    'name'     => 'Your Name (Optional)',
    'cottage'  => 'Which Cottage Are You Staying In?',
    'phone'    => 'Phone (Optional)',
    'contact'  => 'Email to Reach You Back (Optional)',
    'desc'     => 'Describe the Problem',
];
foreach ($titleCase as $key => $text) {
    $escaped = str_replace("'", "\\'", $text);
    // Twice: once as the Elementor control default, once as the runtime
    // fallback in config_report_strings(). Miss either and a guide saved
    // before this release keeps the old wording.
    check("\"$text\" appears as both the control default and the fallback",
        substr_count($widget, "__('" . $escaped . "', 'dcc-guest-guide')") === 2,
        (string) substr_count($widget, "__('" . $escaped . "', 'dcc-guest-guide')") . 'x');
}
$sentenceCase = ["What's the issue?", 'Your name (optional)', 'Which cottage are you staying in?',
                 'Phone (optional)', 'Email to reach you back (optional)', 'Describe the problem'];
foreach ($sentenceCase as $text) {
    $escaped = str_replace("'", "\\'", $text);
    check("the sentence-case \"$text\" is gone from the PHP",
        strpos($widget, "__('" . $escaped . "', 'dcc-guest-guide')") === false);
    check("…and from the JS fallbacks", strpos($js, "'" . $text . "'") === false);
}

echo "\n   Where the form lands when it opens\n";
check('the dialog heading is a focus target that is not a Tab stop',
    strpos($js, 'tabindex="-1"') !== false
    && strpos($js, 'const headAttrs =') !== false);
check('opening focuses the heading, not a field',
    strpos($js, "d.querySelector('.dccgg-report-head h3')") !== false);
check('the Name field is no longer focused on open',
    strpos($js, '(nameEl || desc).focus()') === false);
check('the heading shows no ring of its own',
    preg_match('/\.dccgg-report-dialog\.dccgg-report-dialog \.dccgg-report-head h3:focus[^{]*\{[^}]*outline:\s*none/s', $css) === 1);

echo "\n   The Voice Search button's tap area\n";
check('the mic is in the 44x44 pass',
    strpos($css, '.dccgg-root .dccgg-search-mic::after,') !== false
    && strpos($css, '.dccgg-stage .dccgg-search-mic::after {') !== false);
// It is absolutely positioned inside the search bar already; adding
// `position: relative` at (0,2,0) would beat that and drop it out of the field.
check('and is NOT given position: relative, which would displace it',
    preg_match('/\.dccgg-root \.dccgg-search-mic,\s*\n\s*\.dccgg-stage/', $css) !== 1
    && preg_match('/\.dccgg-stage \.dccgg-search-mic \{\s*position: relative/', $css) !== 1);
check('the mic keeps its own absolute placement',
    preg_match('/\.dccgg-search-mic\s*\{[^}]*position:\s*absolute/s', $css) === 1);

echo "\n$pass passed, $fail failed\n";
if ($fail > 0) {
    echo "\nFailures:\n";
    foreach ($failures as $f) {
        echo "  - $f\n";
    }
}
exit($fail > 0 ? 1 : 0);
