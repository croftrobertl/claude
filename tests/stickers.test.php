<?php
/**
 * DCC Guest Guide — section stickers and the bundled icon library (v0.24.1).
 *
 * Drives the REAL renderer. The properties under test: each section's circle
 * takes its colour from its own key, the hub tile and that section's popup
 * mini tile can never disagree, the eight bundled glyphs are emitted as ONE
 * <symbol> each however many tiles use them, and a guide still on Font Awesome
 * values keeps rendering untouched.
 *
 *   php tests/stickers.test.php
 *   DCCGG_PLUGIN_DIR=/path/to/dcc-guest-guide php tests/stickers.test.php
 */
require __DIR__ . '/_emit-guide.php';

/** Read a plugin file from the tree under test, not always the real one. */
function plugin_file(string $rel): string {
    $base = rtrim(getenv('DCCGG_PLUGIN_DIR') ?: __DIR__ . '/../dcc-guest-guide', '/');
    return (string) @file_get_contents($base . '/' . $rel);
}

$pass = 0; $fail = 0; $failures = [];
function check($name, $cond, $detail = '') {
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $fail++; $failures[] = $name . ($detail ? " — $detail" : ''); echo "  ✗ $name" . ($detail ? " — $detail" : '') . "\n"; }
}
/** [section key => sticker colour] for hub tiles and for popup titles. */
function stickers(string $html): array {
    $out = ['hub' => [], 'title' => []];
    if (preg_match_all('#<div class="dccgg-tile-wrap[^"]*" data-section-key="([^"]+)".*?<span class="dccgg-tile-icon" style="--dccgg-sticker:([^"]+)"#s', $html, $m, PREG_SET_ORDER)) {
        foreach ($m as $x) { $out['hub'][$x[1]] = strtoupper($x[2]); }
    }
    if (preg_match_all('#<div class="dccgg-detail[^"]*" data-key="([^"]+)".*?<span class="dccgg-detail-title-icon" style="--dccgg-sticker:([^"]+)"#s', $html, $m, PREG_SET_ORDER)) {
        foreach ($m as $x) { $out['title'][$x[1]] = strtoupper($x[2]); }
    }
    return $out;
}
$live = dccgg_render_guide(dccgg_guide_case('live-sections'));

echo "\nA. Every section wears its own colour, from its key\n";
$PALETTE = ['internet' => '#0E9AAF', 'amenities' => '#FFA000', 'clubhouse' => '#E1637A',
            'canal' => '#078732', 'checkout' => '#0A50B2', 'rules' => '#C43A3A',
            'map' => '#4DB0EA', 'review' => '#F08080'];
$st = stickers($live);
foreach ($PALETTE as $key => $hex) {
    check("$key is $hex on its hub tile", ($st['hub'][$key] ?? '') === strtoupper($hex), $st['hub'][$key] ?? 'missing');
}
check('all eight hub tiles carry a sticker', count($st['hub']) === 8, (string) count($st['hub']));
check('an unknown key falls back to the guide blue',
    \DCCGG\Icons::color_for('something-new') === '#006BCF' && \DCCGG\Icons::color_for('') === '#006BCF');
check('the key match ignores case and stray spaces', \DCCGG\Icons::color_for('  Internet ') === '#0E9AAF');
check('a per-section colour overrides the packaged one',
    \DCCGG\Widget::sticker_style(['section_key' => 'rules', 'section_tile_color' => '#123456']) === ' style="--dccgg-sticker:#123456"');
check('and an EMPTY per-section colour means "use the packaged one"',
    \DCCGG\Widget::sticker_style(['section_key' => 'rules', 'section_tile_color' => '']) === ' style="--dccgg-sticker:#C43A3A"');

echo "\nB. The mini tile in each title matches its hub tile\n";
check('all eight popup titles carry a sticker', count($st['title']) === 8, (string) count($st['title']));
$drift = [];
foreach ($st['hub'] as $key => $hex) { if (($st['title'][$key] ?? null) !== $hex) { $drift[] = $key; } }
check('not one of them differs from its hub tile', $drift === [], implode(',', $drift));
check('both are written by the same helper, from the same key',
    substr_count(plugin_file('includes/class-widget.php'), 'self::sticker_style($sec)') === 2);

echo "\nC. One symbol per glyph, however many tiles use it\n";
preg_match_all('/<symbol id="(dccgg-sym-[a-z-]+)"/', $live, $sym);
preg_match_all('/<use href="#(dccgg-sym-[a-z-]+)"/', $live, $use);
check('16 tiles point at 8 symbols', count($use[1]) === 16 && count($sym[1]) === 8,
    count($use[1]) . ' uses, ' . count($sym[1]) . ' symbols');
check('no symbol is emitted twice', count($sym[1]) === count(array_unique($sym[1])));
check('every <use> resolves to a symbol that is on the page', array_diff(array_unique($use[1]), $sym[1]) === []);
check('the sprite itself appears once', substr_count($live, 'class="dccgg-sprite"') === 1);
check('and is hidden from assistive tech and from layout',
    preg_match('/<svg class="dccgg-sprite" aria-hidden="true"[^>]*width:0;height:0/', $live) === 1);
check('glyphs inherit colour rather than carrying their own',
    strpos($live, 'fill="currentColor"') === false && preg_match('/<symbol[^>]*>.*?fill="(?!none)/s', $live) !== 1);

echo "\nD. Font Awesome section icons still render\n";
$fa = dccgg_render_guide(dccgg_guide_case('live-sections-fa'));
// The harness's Elementor stub prints a bare <i>, so what is checked here is
// that the ELEMENTOR path was taken for those sections, not ours.
check('a guide still on Font Awesome goes through Elementor, not our sprite',
    strpos($fa, '<use href="#dccgg-sym-') === false
    && substr_count($fa, '<span class="dccgg-tile-icon" style="--dccgg-sticker:') === 8
    && substr_count($fa, "<i></i>") >= 8, substr_count($fa, "<i></i>") . ' icon elements');
check('and no sprite at all, because no bundled glyph was used', strpos($fa, 'dccgg-sprite') === false);
check('but it still gets its stickers', count(stickers($fa)['hub']) === 8);
check('an unknown value from OUR library renders nothing, not broken markup', (function () {
    ob_start(); \DCCGG\Icons::render(['value' => 'dccgg-icon-nope', 'library' => 'dccgg-icons']); $o = ob_get_clean();
    return $o === '';
})());
check('and leaves the sprite empty', (function () {
    \DCCGG\Icons::reset(); \DCCGG\Icons::render(['value' => 'dccgg-icon-nope', 'library' => 'dccgg-icons']);
    ob_start(); \DCCGG\Icons::sprite(); return ob_get_clean() === '';
})());
check('a value from another library is left to Elementor', \DCCGG\Icons::key_of(['value' => 'fas fa-wifi', 'library' => 'fa-solid']) === '');

echo "\nE. The library, and what it costs the page\n";
$glyphs = \DCCGG\Icons::glyphs();
check('eight glyphs ship', count($glyphs) === 8, (string) count($glyphs));
foreach (['devices' => 'Phosphor Fill', 'laundry' => 'Material Symbols Rounded Fill', 'fish' => 'Phosphor Fill'] as $k => $src) {
    check("$k comes from $src", ($glyphs[$k]['source'] ?? '') === $src);
}
check('the Material washer is scaled to sit level with the Phosphor seven',
    (float) $glyphs['laundry']['scale'] === 0.90 && (float) $glyphs['devices']['scale'] === 1.0);
check('both licence notices ship with the plugin', (function () {
    $t = plugin_file('assets/icons/LICENSES.md');
    return strpos($t, 'MIT License') !== false && strpos($t, 'Apache License, Version 2.0') !== false;
})());
check('the page asks for no icon font, Google Font or outside host',
    !preg_match('#<link[^>]+href=["\']https?://#i', $live)
    && stripos($live, 'fonts.googleapis') === false && stripos($live, 'cdn') === false
    && stripos($live, '@font-face') === false, 'an outside reference appeared in the markup');
check('no stylesheet the guide ships names an outside host', (function () {
    foreach (['widget.css', 'widget.min.css', 'widget-guest.min.css'] as $f) {
        $css = plugin_file('assets/css/' . $f);
        // url() to a remote host, or any @import at all: both are a request.
        if (preg_match('#url\(\s*["\']?https?://#i', $css)) { return false; }
        if (preg_match('#@import#i', $css)) { return false; }
        if (preg_match('#@font-face#i', $css)) { return false; }
    }
    return true;
})());
check('the picker faces are generated, and are editor-only', (function () {
    $css = plugin_file('assets/css/dccgg-icons.css');
    $w   = plugin_file('includes/class-widget.php');
    return strpos($css, '.dccgg-icon-devices{') !== false && strpos($css, 'data:image/svg+xml,') !== false
        // Every url() is a data: URI. (The only http:// in the file is the SVG
        // xmlns, which is an identifier, not something fetched.)
        && preg_match('#url\(["\']?https?://#i', $css) !== 1
        && preg_match('/enqueue_for_editor[\s\S]{0,700}dccgg-icons-picker/', $w) === 1;
})());
check('the library registers itself with Elementor\'s icon picker', (function () {
    $tabs = \DCCGG\Icons::register_tab([]);
    $t = $tabs['dccgg-icons'] ?? [];
    return ($t['prefix'] ?? '') === 'dccgg-icon-' && ($t['displayPrefix'] ?? '') === 'dccgg-ico'
        && strpos((string) ($t['url'] ?? ''), 'dccgg-icons.css') !== false
        && strpos((string) ($t['fetchJson'] ?? ''), 'dccgg-icons.json') !== false
        && ($t['native'] ?? true) === false;
})());
check('and the list it fetches names all eight', (function () {
    $j = json_decode(plugin_file('assets/icons/dccgg-icons.json'), true);
    $want = array_map(static fn($k) => 'dccgg-icon-' . $k, array_keys(\DCCGG\Icons::glyphs()));
    return ($j['icons'] ?? []) === $want;
})());
check('the plugin hooks the library into Elementor',
    strpos(plugin_file('includes/class-plugin.php'),
        "add_filter('elementor/icons_manager/additional_tabs'") !== false);

echo "\nF. The look: rim, shadow, glyph, motion, print\n";
$src = plugin_file('assets/css/widget.css');
check('a 3px white rim on the hub sticker', preg_match('/\.dccgg-tile-icon[^{]*\{[^}]*border: 3px solid #fff/s', $src) === 1);
check('the two-part shadow', strpos($src, 'box-shadow: 0 0 0 2px rgba(0,0,0,.06), 0 5px 10px rgba(0,0,0,.18)') !== false);
check('the glyph is white with a soft drop-shadow',
    preg_match('/\.dccgg-glyph[^{]*\{[^}]*filter: drop-shadow\(0 1px 1px rgba\(0,0,0,\.25\)\)/s', $src) === 1
    || strpos($src, 'drop-shadow(0 1px 1px rgba(0,0,0,.25))') !== false);
check('the glyph takes currentColor, never a colour of its own',
    preg_match('/\.dccgg-glyph[^{]*,[\s\S]{0,600}?\{[^}]*fill: currentColor/s', $src) === 1);
check('the mini tile is 34px with a 2px rim',
    preg_match('/\.dccgg-detail-title-icon[^{]*\{[^}]*width: 34px[^}]*border-width: 2px/s', $src) === 1);
check('hover deepens the shadow and does NOT recolour',
    preg_match('/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.dccgg-root\.dccgg-root \.dccgg-tile:hover \.dccgg-tile-icon[\s\S]{0,260}?\}/', $src, $m) === 1
    && strpos($m[0], 'background') === false, $m[0] ?? 'rule not found');
check('focus draws a ring outside the white rim',
    preg_match('/\.dccgg-tile:focus-visible \.dccgg-tile-icon[\s\S]{0,300}?0 0 0 6px var\(--dccgg-primary/s', $src) === 1);
check('the wiggle animates transform only',
    preg_match('/@keyframes dccgg-icon-wiggle \{([^}]*\}){3}/s', $src, $m) === 1
    && strpos($m[0], 'box-shadow') === false && strpos($m[0], 'filter') === false);
check('and the sticker transition names box-shadow only, so it cannot fight it', (function () use ($src) {
    // the sticker rule's own body
    if (!preg_match('/\.dccgg-root\.dccgg-root \.dccgg-tile-icon,[^{]*\{([^}]*)\}/s', $src, $m)) { return false; }
    $body = preg_replace('#/\*[\s\S]*?\*/#', '', $m[1]);   // comments mention transform; declarations must not
    return preg_match('/transition: box-shadow var\(--dccgg-transition-duration/', $body) === 1
        && strpos($body, 'transform') === false;
})());
check('reduced motion stops the sticker transition',
    preg_match('/@media \(prefers-reduced-motion: reduce\) \{\s*\.dccgg-root\.dccgg-root \.dccgg-tile-icon[\s\S]{0,180}?transition: none/s', $src) === 1);
check('the print sheet still decides about tiles, untouched by this release',
    preg_match('/@media print[\s\S]*?\.dccgg-root \.dccgg-menu,/s', $src) === 1);

echo "\n$pass passed, $fail failed\n";
if ($fail) { echo "Failures:\n"; foreach ($failures as $f) { echo "  - $f\n"; } exit(1); }
