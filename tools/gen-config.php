<?php
/**
 * DCC Seasons — emit the CLIENT CONFIG as JSON, outside WordPress.
 *
 * The browser suites need the same `window.DCC_SEASONS` object the plugin
 * prints on a real page. Rebuilding that object by hand in every fixture is
 * how fixtures drift away from the plugin; this reads the actual Themes and
 * Schedule classes instead, so a theme or row added in PHP shows up in the
 * tests without anyone remembering to copy it.
 *
 * Usage:
 *   php tools/gen-config.php [--placement=footer|content] [--theme=<key>]
 *                            [--density=N] [--diag]
 *
 * --theme pins a theme regardless of today's date (the suites must not
 * change behaviour on 25 December). It is expressed the way the plugin
 * expresses it — as the admin preview flag — so the loader takes the same
 * path a real preview does.
 *
 * @package DCC_Seasons
 */

define('ABSPATH', 1);
define('DCC_SEASONS_VERSION', 'test');
define('DCC_SEASONS_URL', './');

if (!function_exists('__')) {
    function __($s, $d = null) { return $s; }
}
if (!function_exists('esc_html__')) {
    function esc_html__($s, $d = null) { return $s; }
}
if (!function_exists('apply_filters')) {
    function apply_filters($tag, $value) { return $value; }
}
if (!function_exists('add_query_arg')) {
    function add_query_arg($k, $v, $url) { return $url; }
}

if (!function_exists('sanitize_key')) {
    function sanitize_key($k) { return strtolower(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $k)); }
}

require __DIR__ . '/../dcc-seasons/includes/class-schedule.php';
require __DIR__ . '/../dcc-seasons/includes/class-themes.php';
require __DIR__ . '/../dcc-seasons/includes/class-settings.php';
require_once __DIR__ . '/../dcc-seasons/includes/class-plugin.php';

use DCC_Seasons\Schedule;
use DCC_Seasons\Themes;

$args = [];
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--([a-z]+)(?:=(.*))?$/', $a, $m)) {
        $args[$m[1]] = $m[2] ?? true;
    }
}

/* The themes the inline config carries. --window[=N] mirrors
 * Plugin::config()'s 4.12.1 trim; --today=YYYY-MM-DD pins the window's
 * start so a suite does not change behaviour on 25 December. */
function dcc_windowed(array $themes, array $args): array {
    if (empty($args['window'])) { return $themes; }
    $days = $args['window'] === true ? null : (int) $args['window'];
    $today = isset($args['today']) && $args['today'] !== true ? (string) $args['today'] : null;
    $out = Themes::reachable(Schedule::defaults(), $today, $days);
    $pin = isset($args['theme']) && $args['theme'] !== true ? (string) $args['theme'] : '';
    if ($pin !== '' && isset($themes[$pin]) && !isset($out[$pin])) { $out[$pin] = $themes[$pin]; }
    foreach ($out as $k => $v) { $out[$k] = $themes[$k]; }  /* keep --noparticles */
    return $out;
}

/** Anchors in the shape the client expects (mirrors Plugin::client_anchors). */
$anchors = [];
foreach (Schedule::anchors() as $key => $a) {
    $out = ['type' => $a['type']];
    foreach (['m', 'd', 'wd', 'n', 'off'] as $k) {
        if (isset($a[$k])) { $out[$k] = $a[$k]; }
    }
    $anchors[$key] = $out;
}

$themes = Themes::themes();
/* --noparticles empties every theme's particle list. This is the ONLY
 * honest way for a suite to isolate the subtle layer: --density=0 does the
 * opposite of what it looks like, because the engine reads
 * `CFG.density || 10` and 0 is falsy, so zero density becomes TEN sprites.
 * richness=minimal drops heroes and vignettes but not the sprites. */
if (!empty($args['noparticles'])) {
    foreach ($themes as $k => $t) {
        if (isset($t['ambient']['particles'])) {
            $themes[$k]['ambient']['particles'] = [];
        }
    }
}

$windowed = dcc_windowed($themes, $args);

$config = [
    'enabled'      => true,
    /* --ambient=0: the falling/drifting sprites off (4.5.0: that is ALL
     * the switch does). 'engine' comes from the plugin's own rule. */
    'ambient'      => (($args['ambient'] ?? '1') !== '0'),
    'engine'       => \DCC_Seasons\Settings::engine_needed([
        'ambient'          => (($args['ambient'] ?? '1') !== '0') ? 1 : 0,
        'subtle'           => (($args['subtle'] ?? '') !== 'off') ? 1 : 0,
        'subtle_intensity' => isset($args['intensity']) ? (float) $args['intensity'] : 0.6,
        'richness'         => (string) ($args['richness'] ?? 'full'),
    ]),
    'egg'          => true,
    /* The plugin's own defaults (4.7.0: the homepage banner title, 4 taps),
     * so the suites follow them; --tapsel= / --taps= override. */
    'tapSelector'  => (string) ($args['tapsel'] ?? \DCC_Seasons\Settings::defaults()['tap_selector']),
    'tapCount'     => (int) ($args['taps'] ?? \DCC_Seasons\Settings::defaults()['tap_count']),
    'tapWindow'    => 3000,
    'density'      => (int) ($args['density'] ?? 16),
    'opacity'      => isset($args['opacity']) ? (float) $args['opacity'] : 1.0,
    /* 1 = 'behind' (mount inside the host at z-index -1), 0 = 'front'
     * (fixed, full viewport, on <body> at frontZ). The live site runs
     * front, so a suite that only ever tests behind tests the wrong thing. */
    'layer'        => (($args['layering'] ?? 'behind') === 'front') ? 0 : 1,
    'frontZ'       => isset($args['frontz']) ? (int) $args['frontz'] : 9000,
    'placement'    => (string) ($args['placement'] ?? 'footer'),
    'footerSel'    => 'footer#colophon, #colophon, footer.site-footer, .site-footer, footer[role="contentinfo"], #footer, footer',
    'headerSel'    => '#masthead, header.site-header, header[role="banner"], .elementor-location-header',
    'foreSel'      => '.dcc-hl-wrap, .dcc-gh-fore, [data-dcc-fore], [data-dcc-fore-box]',
    'skySel'       => '#header-image-main-inside',
    'backdropHost' => '',
    /* Layer 1. --subtle=<effect> pins one effect for a contact sheet;
     * --subtle=off turns the layer off entirely. */
    'subtle'       => [
        'on'        => (($args['subtle'] ?? '') !== 'off'),
        'intensity' => isset($args['intensity']) ? (float) $args['intensity'] : 0.6,
        'map'       => (isset($args['subtle']) && $args['subtle'] !== 'off' && $args['subtle'] !== true)
            ? array_fill_keys(array_keys(Themes::subtle_defaults()), (string) $args['subtle'])
            : Themes::subtle_defaults(),
    ],
    /* --richness=minimal is how a suite isolates ONE layer: it drops the
     * heroes and the vignettes as well as the extras, so density=0 then
     * really does leave the canvas to the subtle layer. Without it the
     * year-round heron still crosses the screen and gets measured. */
    'visual'       => [
        'richness'    => (string) ($args['richness'] ?? 'full'),
        'reflections' => true,
        'vignettes'   => true,
        'pointer'     => true,
        'evening'     => false,
    ],
    'schedule'     => Schedule::defaults(),
    'anchors'      => $anchors,
    'holidays'     => Schedule::HOLIDAY_ANCHOR,
    'clashWins'    => Schedule::CLASH_WINS,
    /* --window[=N] ships only the themes a page served today could need —
     * what Plugin::config() does since 4.12.1 — plus the pinned preview
     * theme, exactly as a real preview adds it. Off by default so every
     * older suite still sees the whole table. */
    'themes'       => $windowed,
    /* --min points the loader at the MINIFIED build. A suite that only
     * ever exercises the readable source cannot catch a stale or broken
     * .min.js, and that is what actually ships. */
    'matrixSrc'    => !empty($args['min']) ? 'matrix.min.js' : 'matrix.js',
    'engineSrc'    => !empty($args['min']) ? 'engine.min.js' : 'engine.js',
    /* 4.13.4: the seasons whose art is its own file, as the plugin lists them */
    'art'          => array_map(function ($packs) use ($args) { return array_map(function ($p) use ($args) { return 'art-' . $p . (!empty($args['min']) ? '.min' : '') . '.js'; }, $packs); }, \DCC_Seasons\Plugin::ART_PACKS),
    /* One appearance every 60-90 s after the first ones (4.8.0), from the
     * plugin's own constant. --heroevery=<seconds> is a DEBUG knob: the gap
     * after a hero, so a suite can observe several without waiting. */
    'every'        => \DCC_Seasons\Plugin::EVERY,
    'heroEvery'    => isset($args['heroevery'])
        ? [(int) $args['heroevery'], (int) $args['heroevery'] + 1]
        : null,
    'preview'      => isset($args['theme']) ? (string) $args['theme'] : null,
    'previewLabel' => isset($args['theme']) ? (string) $args['theme'] : '',
    'version'      => 'test',
    'diag'         => !empty($args['diag']),
    'i18n'         => ['close' => 'Close'],
];

echo json_encode($config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
