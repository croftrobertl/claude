<?php
/**
 * 0.46.6: LIVE IS THE DEFAULT, AND PART A IS THE ONLY CHANGE.
 *
 * Rob's brief: "a blind install must look and behave exactly like live does
 * today", plus Part A (the overview calendar's past days grey and "Past" in
 * its key, still opening on today). The source of truth is the Website
 * Director's export of live, tests/render/live-state-0.46.5.json: every
 * instance's stored Elementor settings and the mphbac_settings row.
 *
 * Every instance is rendered by tests/render/render.php — the real plugin,
 * loaded through its main file, under an Elementor emulator that resolves
 * defaults, conditions, popover groups and per-post CSS the way Elementor
 * does — and held to four things:
 *
 *   1. THE PACKAGED DEFAULTS ARE LIVE'S. The settings schema equals live's
 *      option row, key for key; and each instance rendered as a BLIND
 *      INSTALL (no option row, no stored keys but single_cottage) renders
 *      exactly what it renders from live's settings.
 *   2. NOTHING ELSE CHANGED. Against tests/render/live-render-0.46.5.json —
 *      what 0.46.5 rendered from the same settings — the cottage and staff
 *      calendars are byte-identical, and the overview calendar differs only
 *      by Part A.
 *   3. PART A. The overview calendar never blanks past days, lists Available,
 *      Booked, Past in that order, and still opens on today; the cottage
 *      calendar's rule is unchanged.
 *   4. THE RULES AROUND IT. A stored value still beats a default and the
 *      settings screen still reaches the cottage calendar; the per-cottage
 *      id has no default; activation writes no plugin option; the only
 *      stored keys a blind install cannot reproduce are single_cottage.
 */
$ROOT = dirname(__DIR__);
$PLUGIN = $ROOT . '/mphb-availability-calendar';
$LIVE = __DIR__ . '/render/live-state-0.46.5.json';
$live = json_decode((string) file_get_contents($LIVE), true);
$golden = json_decode((string) file_get_contents(__DIR__ . '/render/live-render-0.46.5.json'), true);

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}
function render(string $case, string $mode): array {
    global $PLUGIN, $LIVE;
    $out = shell_exec('php ' . escapeshellarg(__DIR__ . '/render/render.php') . ' ' . escapeshellarg($PLUGIN) . ' '
        . escapeshellarg($LIVE) . ' ' . escapeshellarg($case) . ' ' . escapeshellarg($mode) . ' 2>&1');
    $r = json_decode((string) $out, true);
    if (!is_array($r)) {
        echo "FAIL  render.php could not render $case ($mode): " . substr((string) $out, 0, 300) . "\n";
        exit(1);
    }
    $r['html'] = preg_replace('/renderedAt&quot;:\d+/', 'renderedAt&quot;:0', $r['html']);
    return $r;
}
function config(array $r): array {
    preg_match('/data-config="([^"]*)"/', $r['html'], $m);
    return json_decode(html_entity_decode($m[1] ?? '{}', ENT_QUOTES), true) ?: [];
}
function legend(array $r): array {
    preg_match('/<div class="mphbac-legend"[^>]*>(.*?)<\/div>/s', $r['html'], $m);
    preg_match_all('/<span class="mphbac-legend-item"><span class="mphbac-swatch mphbac-swatch-(\w+)"[^>]*><\/span>([^<]*)<\/span>/', $m[1] ?? '', $x, PREG_SET_ORDER);
    return array_map(static fn($i) => $i[1] . ':' . trim($i[2]), $x);
}
function norm($v) {
    if (is_array($v)) {
        $list = array_keys($v) === range(0, count($v) - 1);
        $o = [];
        foreach ($v as $k => $x) { $o[$k] = norm($x); }
        if (!$list) { ksort($o); }
        return $o;
    }
    if (is_bool($v)) { return $v ? 'yes' : ''; }
    return $v === null ? '' : (string) $v;
}
function snap(string $html): string {
    $html = preg_replace('/\d{4}-\d{2}-\d{2}/', 'D', $html);
    return preg_replace('/\d{4}-\d{2}(?!\d)/', 'Y-M', $html);
}

$cases = [];
foreach ($live['widgets'] as $w) {
    $cases[$w['post_id'] . ':' . $w['widget_id']] = $w;
}
$V1 = ['620:b7318c3', '1005:5f8802c'];

echo "-- 1. the packaged settings defaults ARE live's option row --\n";
{
    require __DIR__ . '/bootstrap.php';
    require $PLUGIN . '/includes/class-settings.php';
    $defaults = \MPHBAC\Settings::defaults();
    $row = $live['options']['mphbac_settings'];
    $drift = [];
    foreach ($row as $k => $v) {
        if (!array_key_exists($k, $defaults) || norm($defaults[$k]) !== norm($v)) {
            $drift[$k] = ['live' => $v, 'default' => $defaults[$k] ?? '(no such key)'];
        }
    }
    check('every key in live\'s mphbac_settings equals its packaged default', $drift === [], $drift);
    check('...and the schema has no key live\'s row lacks', array_diff_key($defaults, $row) === [], array_keys(array_diff_key($defaults, $row)));
    check('...including the two that differed: day cells 38px and lazy panels on',
        $defaults['cell_min_height'] === 38 && $defaults['lazy_cottage_panels'] === true);
}

echo "\n-- 1. a BLIND install renders what live renders, instance by instance --\n";
$liveR = [];
foreach ($cases as $case => $w) {
    $a = $liveR[$case] = render($case, 'live');
    $b = render($case, 'blind');
    $orphans = ['str_info_loading', 'str_info_unavail'];
    $sa = array_diff_key($a['settings'], array_flip($orphans));
    $sb = array_diff_key($b['settings'], array_flip($orphans));
    // Elementor's own keys are not the plugin's to default (blind keeps them).
    $diff = [];
    foreach (array_keys($sa + $sb) as $k) {
        if (norm($sa[$k] ?? null) !== norm($sb[$k] ?? null)) { $diff[] = $k; }
    }
    // The home page stores the two column colours the settings screen has;
    // a blind install follows those through the stylesheet instead of
    // emitting them, so its CSS lacks exactly those two declarations.
    $cssA = str_replace(['--mphbac-color-namecol:#F8F9FA;', '--mphbac-color-namecol-alt:#F1F3F5;'], '', $a['css']);
    $label = sprintf('%-13s %-16s', $case, $w['widget_type']);
    check("$label settings: identical (only the controls stored on live differ in storage, never in value)",
        array_diff($diff, ['namecol_bg', 'namecol_alt_bg']) === [], $diff);
    check("$label HTML, per-post CSS and tokens: identical", $a['html'] === $b['html'] && $cssA === $b['css'] && $a['tokens'] === $b['tokens'],
        $a['html'] === $b['html'] ? 'css differs' : 'html differs');
}
{
    $css = file_get_contents($PLUGIN . '/assets/css/widget.css');
    check('...and those two colours ARE the stylesheet\'s own (so the home page looks the same either way)',
        str_contains($css, '--mphbac-color-namecol: #F8F9FA;') && str_contains($css, '--mphbac-color-namecol-alt: #F1F3F5;'));
}

echo "\n-- 2. against what 0.46.5 rendered from the same settings --\n";
foreach ($cases as $case => $w) {
    $now = ['html' => snap($liveR[$case]['html']), 'css' => $liveR[$case]['css'], 'tokens' => $liveR[$case]['tokens']];
    $was = $golden[$case];
    $label = sprintf('%-13s %-16s', $case, $w['widget_type']);
    if (!in_array($case, $V1, true)) {
        check("$label byte-identical to 0.46.5 (HTML, CSS, tokens)",
            $now['html'] === $was['html'] && $now['css'] === $was['css'] && $now['tokens'] === $was['tokens']);
        continue;
    }
    // Part A, applied to 0.46.5's output by hand, must give exactly today's.
    $expect = str_replace(' mphbac-hide-past', '', $was['html']);
    $expect = preg_replace('#(<span class="mphbac-legend-item"><span class="mphbac-swatch mphbac-swatch-booked"[^>]*></span>Booked</span>)#',
        "$1\n                                            <span class=\"mphbac-legend-item\"><span class=\"mphbac-swatch mphbac-swatch-past\" aria-hidden=\"true\"></span>Past</span>", $expect);
    check("$label HTML = 0.46.5's plus Part A, and nothing else", $now['html'] === $expect);
    // /cottages/ stores no cottage-name typography; it now takes the home
    // page's (18px on phones), which the 16px/12px label spans do not
    // inherit — shoot.js shows it pixel-identical.
    $extra = $case === '1005:5f8802c'
        ? '.elementor-1005 .elementor-element.elementor-element-5f8802c .mphbac-root.mphbac-root .mphbac-row-toggle{font-size:18px;}' : '';
    check("$label per-post CSS = 0.46.5's" . ($extra ? ' plus the home page\'s cottage-name size on phones' : ''),
        $extra === '' ? $now['css'] === $was['css'] : str_replace($extra, '', $now['css']) === $was['css'] && substr_count($now['css'], $extra) === 1);
}

echo "\n-- 3. Part A: the overview calendar's past days --\n";
foreach ($V1 as $case) {
    foreach (['live', 'blind'] as $mode) {
        $r = $mode === 'live' ? $liveR[$case] : render($case, 'blind');
        $c = config($r);
        check("$case $mode: past days are never blanked (no mphbac-hide-past)", !str_contains($r['html'], 'mphbac-hide-past'));
        check("$case $mode: the key reads Available, Booked, Past — in that order", legend($r) === ['available:Available', 'booked:Booked', 'past:Past'], legend($r));
        check("$case $mode: and it still OPENS on today (showPast off, the first paint starts today)",
            ($c['showPast'] ?? null) === false && ($c['initial']['from'] ?? null) === ($c['today'] ?? 'x'), [$c['showPast'] ?? null, $c['initial']['from'] ?? null, $c['today'] ?? null]);
    }
}
{
    $r = render('1005:5f8802c', 'live+{"stored":{"show_past":"yes"}}');
    $c = config($r);
    check('show_past on the overview now ONLY moves the start to yesterday — the key and the cells are the same',
        $c['initial']['from'] < $c['today'] && legend($r) === ['available:Available', 'booked:Booked', 'past:Past'] && !str_contains($r['html'], 'mphbac-hide-past'));
    $r = render('3043:8e23564', 'live+{"stored":{"show_past":""}}');
    check('the cottage calendar\'s rule is unchanged: show_past off still means hide-past and no "Past" in its key',
        str_contains($r['html'], 'mphbac-hide-past') && legend($r) === ['available:Available', 'booked:Booked'], legend($r));
    check('...and on, as all eight are on live, "Past" is listed and nothing is blanked',
        !str_contains($liveR['3043:8e23564']['html'], 'mphbac-hide-past') && legend($liveR['3043:8e23564']) === ['available:Available', 'booked:Booked', 'past:Past']);
}

echo "\n-- 4. the rules around it --\n";
{
    $r = render('620:b7318c3', 'live+{"stored":{"calheader_bg":"#123456","visible_days":10,"str_apply":"Go","show_past":"yes"}}');
    $c = config($r);
    check('a value an instance stores still beats the default (colour, number, string, switch)',
        str_contains($r['css'], '--mphbac-color-header:#123456') && $c['daysDesktop'] === 10
        && str_contains($r['html'], '>Go</button>') && $c['showPast'] === true);
    $r = render('3043:8e23564', 'live+{"options":{"cell_min_height":40,"color_past":"#999999"}}');
    check('the settings screen still reaches a calendar that stores nothing for it (cell height, past colour)',
        str_contains($r['css'], '--mphbac-cell-min:40px') && str_contains($r['tokens'], '--mphbac-color-past:#999999'));

    $d = json_decode((string) shell_exec('php ' . escapeshellarg(__DIR__ . '/render/render.php') . ' ' . escapeshellarg($PLUGIN) . ' '
        . escapeshellarg($LIVE) . ' 3043:8e23564 defaults'), true);
    check('the per-cottage id has NO default — an unconfigured cottage calendar shows nothing, not Cottage 22',
        ($d['defaults']['single_cottage'] ?? 'x') === '');
    $src = file_get_contents($PLUGIN . '/includes/class-widget-single.php');
    check('...and no live_defaults() entry names it', !preg_match("/'single_cottage'\\s*=>/", substr($src, strpos($src, 'function live_defaults'), 1200)));

    $red = json_decode((string) shell_exec('php ' . escapeshellarg(__DIR__ . '/render/redundant.php') . ' ' . escapeshellarg($PLUGIN) . ' ' . escapeshellarg($LIVE) . ' --json'), true);
    $keep = [];
    foreach ($red as $case => $o) {
        if ($o['keep']) { $keep[$case] = $o['keep']; }
    }
    check('every stored key but each cottage page\'s single_cottage is redundant, a settings-screen colour, an orphan or Elementor\'s own',
        array_unique(array_merge(...array_values($keep))) === ['single_cottage'] && count($keep) === 8, $keep);
    check('...the overview pages\' cottage_info and cottage_labels among the redundant',
        in_array('cottage_info', $red['620:b7318c3']['redundant'], true) && in_array('cottage_labels', $red['1005:5f8802c']['redundant'], true));
}

echo "\n-- 4. install, activation and upgrade write no plugin option --\n";
{
    $r = $liveR['18102:afeefb0'];
    check('the one activation hook is the SpeedyCache exclusion', $r['activation'] === ['\\MPHBAC\\Cache_Integration::on_activate'], $r['activation']);
    // Run it: a fresh site's options must come out without a plugin row.
    $GLOBALS['t_options'] = ['speedycache_options' => ['exclude' => []]];
    if (!function_exists('set_transient')) { function set_transient($k, $v, $t = 0) { $GLOBALS['t_transients'][$k] = $v; return true; } }
    if (!function_exists('add_filter')) { function add_filter(...$a) { return true; } }
    if (!function_exists('wp_parse_url')) { function wp_parse_url($u, $c = -1) { return parse_url($u, $c); } }
    if (!function_exists('admin_url')) { function admin_url($p = '') { return 'https://example.test/wp-admin/' . $p; } }
    if (!defined('MINUTE_IN_SECONDS')) { define('MINUTE_IN_SECONDS', 60); }
    if (!defined('MPHBAC_AJAX_ACTION')) { define('MPHBAC_AJAX_ACTION', 'mphbac_query'); define('MPHBAC_PRICE_ACTION', 'mphbac_price'); define('MPHBAC_INFO_ACTION', 'mphbac_info'); }
    foreach (['cache', 'data-provider', 'staff', 'cache-integration'] as $f) { require_once $PLUGIN . "/includes/class-$f.php"; }
    \MPHBAC\Cache_Integration::on_activate();
    $mine = array_filter(array_keys($GLOBALS['t_options']), static fn($k) => str_starts_with($k, 'mphbac'));
    check('activating writes no mphbac_* option (it only adds the exclusion to SpeedyCache\'s own)', $mine === [], $mine);
    $writes = [];
    foreach (glob($PLUGIN . '/includes/*.php') as $f) {
        foreach (file($f) as $n => $line) {
            if (preg_match('/(update_option|add_option)\(\s*(Settings::OPTION|Settings::VERSION_OPT|self::OPTION|\'mphbac_settings)/', $line)) {
                $writes[] = basename($f) . ':' . ($n + 1);
            }
        }
    }
    check('the only writes of the settings row are the settings screen\'s Save and Reset', count($writes) === 2
        && count(array_filter($writes, static fn($w) => str_starts_with($w, 'class-admin.php:'))) === 2, $writes);
    $main = file_get_contents($PLUGIN . '/mphb-availability-calendar.php');
    check('...and the main file registers no other activation hook', substr_count($main, 'register_activation_hook') === 1);
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
