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
// Live as it is now (exported after the Website Director cleared the keys
// 0.46.6 made redundant), and live as it was before (0.46.5's export, every
// key still stored). Both must render the same as a blind install.
$LIVE6 = __DIR__ . '/render/live-state-0.46.6.json';
$LIVE5 = __DIR__ . '/render/live-state-0.46.5.json';
$LIVE = $LIVE6;
$live = json_decode((string) file_get_contents($LIVE6), true);
$golden = json_decode((string) file_get_contents(__DIR__ . '/render/live-render-0.46.6.json'), true);

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}
/**
 * $order: 'cached' — an ordinary page view (Elementor's controls stack in its
 * default single-control shape); 'fresh' — the view that rewrites the post's
 * CSS first, leaving the per-device stack for the render. See
 * Widget::device_setting(): 0.46.6 emitted different config in the two.
 */
function render(string $case, string $mode, string $order = 'cached', ?string $export = null): array {
    global $PLUGIN, $LIVE;
    $out = shell_exec('MPHBAC_ORDER=' . escapeshellarg($order) . ' php ' . escapeshellarg(__DIR__ . '/render/render.php') . ' '
        . escapeshellarg($PLUGIN) . ' ' . escapeshellarg($export ?? $LIVE) . ' ' . escapeshellarg($case) . ' ' . escapeshellarg($mode) . ' 2>&1');
    $r = json_decode((string) $out, true);
    if (!is_array($r)) {
        echo "FAIL  render.php could not render $case ($mode): " . substr((string) $out, 0, 300) . "\n";
        exit(1);
    }
    $r['html'] = preg_replace('/renderedAt&quot;:\d+/', 'renderedAt&quot;:0', $r['html']);
    return $r;
}
function config(array $r): array {
    preg_match('/data-(?:staff-)?config="([^"]*)"/', $r['html'], $m);
    return json_decode(html_entity_decode($m[1] ?? '{}', ENT_QUOTES), true) ?: [];
}
/** Every emitted config value that differs, as "path: a ≠ b". */
function config_diff($a, $b, string $path = ''): array {
    if (is_array($a) && is_array($b)) {
        $out = [];
        foreach (array_unique(array_merge(array_keys($a), array_keys($b))) as $k) {
            $out = array_merge($out, config_diff($a[$k] ?? '(absent)', $b[$k] ?? '(absent)', $path . '.' . $k));
        }
        return $out;
    }
    return $a === $b ? [] : [ltrim($path, '.') . ': ' . json_encode($a) . ' ≠ ' . json_encode($b)];
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
/**
 * A day's availability in the calendar's data ("2026-10-14": "booked") as it
 * stands on the day the test runs: the recorded render is from 2026-10-14,
 * and a booked day since gone by reads "past" now. What this file holds the
 * page to is its settings and markup, not the calendar's dates, so each
 * day's state is set aside on both sides (0.47.0: found when two days had
 * passed).
 */
function undated(string $html): string {
    return preg_replace('/D&quot;:&quot;[a-z-]+&quot;/', 'D&quot;:&quot;S&quot;', $html);
}
/**
 * 0.47.4's additions to a public widget's data-config, removed: the embedded
 * `rules` (one entry per cottage) and the new strings (STRINGS_0474). Answers
 * [html without them, true] — or a description of what was missing.
 */
const STRINGS_0474 = ['ruleNoCheckIn', 'ruleTooSoon', 'ruleTooFar', 'sheetNoCheckIn', 'sheetTooSoon', 'sheetTooFar', 'sheetNoCheckOut', 'bookMaxNights', 'bookMinNightsN', 'legendNoCheckIn'];
function without_0474(string $html): array {
    $n = 0;
    $html = preg_replace('/,&quot;rules&quot;:\{(?:[^{}]|\{[^{}]*\})*\}/', '', $html, -1, $n);
    if ($n !== 1) {
        return [$html, "rules found $n times"];
    }
    foreach (STRINGS_0474 as $k) {
        $m = 0;
        $html = preg_replace('/,&quot;' . preg_quote($k, '/') . '&quot;:&quot;(?:[^&]|&(?!quot;))*&quot;/', '', $html, 1, $m);
        if ($m !== 1) {
            return [$html, "string $k missing"];
        }
    }
    return [$html, true];
}
/** The staff shell's config, decoded. */
function staff_config(string $html): array {
    preg_match('/data-staff-config="([^"]*)"/', $html, $m);
    return json_decode(html_entity_decode($m[1] ?? '{}', ENT_QUOTES), true) ?: [];
}
/** 0.46.7's Part A labels, as 0.46.5's export stored them before the WD cleared them. */
const OLD_LABELS = ['>Check-in<' => '>Check-In<', '>Check-out<' => '>Check-Out<', 'Estimated total:' => 'Estimated Total:'];

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
    check('...including day cells 38px (the WD measured 38 on live) and lazy panels on',
        $defaults['cell_min_height'] === 38 && $defaults['lazy_cottage_panels'] === true);
}

echo "\n-- 1. a BLIND install emits what live emits: every config value, the HTML, the CSS --\n";
// Both exports, and both request orders — an ordinary view and the one that
// rewrites the post's CSS. 0.46.6 failed this on live: /cottages/' phone side
// margin came out 37 or 12 depending on the request.
$liveR = [];
foreach (['live now (0.46.6 export)' => $LIVE6, 'live before the clearing (0.46.5 export)' => $LIVE5] as $which => $export) {
    $exp = json_decode((string) file_get_contents($export), true);
    foreach ($exp['widgets'] as $w) {
        $case = $w['post_id'] . ':' . $w['widget_id'];
        $label = sprintf('%-13s %-16s', $case, $w['widget_type']);
        $byOrder = [];
        foreach (['cached', 'fresh'] as $order) {
            $a = render($case, 'live', $order, $export);
            $b = render($case, 'blind', $order, $export);
            if ($export === $LIVE6 && $order === 'cached') {
                $liveR[$case] = $a;
            }
            // 0.46.5's export still stores the three labels Part A retitles:
            // a blind install shows the new ones, and must differ by nothing else.
            if ($export === $LIVE5) {
                $a['html'] = strtr($a['html'], OLD_LABELS);
            }
            $cssA = str_replace(['--mphbac-color-namecol:#F8F9FA;', '--mphbac-color-namecol-alt:#F1F3F5;'], '', $a['css']);
            $cd = config_diff(config($a), config($b));
            check("$which, $order view — $label: every emitted config value identical", $cd === [], $cd);
            check("$which, $order view — $label: HTML, per-post CSS and tokens identical",
                $a['html'] === $b['html'] && $cssA === $b['css'] && $a['tokens'] === $b['tokens'],
                $a['html'] === $b['html'] ? 'css differs' : 'html differs');
            $byOrder[$order] = $a;
        }
        check("$which — $label: the ordinary view and the CSS-rewriting view emit the SAME config and HTML",
            config_diff(config($byOrder['cached']), config($byOrder['fresh'])) === [] && $byOrder['cached']['html'] === $byOrder['fresh']['html'],
            config_diff(config($byOrder['cached']), config($byOrder['fresh'])));
    }
}
{
    $css = file_get_contents($PLUGIN . '/assets/css/widget.css');
    check('the home page\'s two stored column colours ARE the stylesheet\'s own (so it looks the same either way)',
        str_contains($css, '--mphbac-color-namecol: #F8F9FA;') && str_contains($css, '--mphbac-color-namecol-alt: #F1F3F5;'));
    $c = config($liveR['1005:5f8802c']);
    check('/cottages/\' info popup side margin is {32, 20, 12} on every view: full width is off, so its condition hides it on every device',
        $c['infoPopupSideMargin'] === ['desktop' => 32, 'tablet' => 20, 'mobile' => 12], $c['infoPopupSideMargin']);
}

{
    // Live keeps "Full viewport width" off, so the side margin's condition
    // hides it and its device defaults never come into play there. Switch it
    // on, store no margin at all, and the per-device defaults must be the
    // ones Elementor's CSS writer uses — live's phone 37 included — on BOTH
    // kinds of view (0.46.6's ordinary view fell through to 12).
    $exp = json_decode((string) file_get_contents($LIVE6), true);
    foreach ($exp['widgets'] as &$w) {
        if (in_array($w['post_id'] . ':' . $w['widget_id'], $V1, true)) {
            $w['stored_settings'] = array_diff_key((array) $w['stored_settings'],
                array_flip(['info_popup_side_margin', 'info_popup_side_margin_tablet', 'info_popup_side_margin_mobile']));
            $w['stored_settings']['info_popup_full_width'] = 'yes';
        }
    }
    unset($w);
    $tmp = tempnam(sys_get_temp_dir(), 'mphbac-fw');
    file_put_contents($tmp, json_encode($exp));
    foreach ($V1 as $case) {
        $got = [];
        foreach (['cached', 'fresh'] as $order) {
            $got[$order] = config(render($case, 'live', $order, $tmp))['infoPopupSideMargin'] ?? null;
        }
        check("$case with full width on and no stored margin: side margin {10, 20, 37} on the ordinary AND the CSS-rewriting view",
            $got['cached'] === ['desktop' => 10, 'tablet' => 20, 'mobile' => 37] && $got['fresh'] === $got['cached'], $got);
    }
    unlink($tmp);
}

echo "\n-- 2. against what 0.46.6 rendered from live's settings now --\n";
// 0.46.7 changes exactly two things a page can carry: Part A's labels, and
// the phone side margin an ordinary view of the overview calendar emitted
// (37 → 12, now the same on every view; invisible: full width is off).
foreach ($cases as $case => $w) {
    $now = ['html' => snap($liveR[$case]['html']), 'css' => $liveR[$case]['css'], 'tokens' => $liveR[$case]['tokens']];
    $was = $golden[$case];
    $label = sprintf('%-13s %-16s', $case, $w['widget_type']);
    $expect = strtr($was['html'], OLD_LABELS + [
        '>Go to date<' => '>Go to Date<', '&quot;In house&quot;' => '&quot;In House&quot;', '&quot;View photo ID&quot;' => '&quot;View Photo ID&quot;',
        '&quot;Week of&quot;' => '&quot;Week Of&quot;', '&quot;All sources&quot;' => '&quot;All Sources&quot;', '&quot;Next {n} days&quot;' => '&quot;Next {n} Days&quot;',
        '&quot;checkIn&quot;:&quot;Check-in&quot;' => '&quot;checkIn&quot;:&quot;Check-In&quot;', '&quot;checkOut&quot;:&quot;Check-out&quot;' => '&quot;checkOut&quot;:&quot;Check-Out&quot;',
    ]);
    if (in_array($case, $V1, true)) {
        $expect = str_replace('&quot;mobile&quot;:37}', '&quot;mobile&quot;:12}', $expect);
    }
    $nowHtml = undated($now['html']);
    $expect = undated($expect);
    if ($w['widget_type'] !== 'dccac_staff') {
        // 0.47.4 adds MotoPress's booking rules to the embedded first paint
        // (a new key, `rules`, beside `availability`) and the guest messages
        // they need. Each is checked present, then set aside; the rest of
        // the page must still be what it was.
        [$nowHtml, $added] = without_0474($nowHtml);
        check("$label carries 0.47.4's embedded rules and its new strings", $added === true, $added);
    }
    if ($w['widget_type'] === 'dccac_staff') {
        // 0.47.0 changes two things in the staff shell, both on purpose: the
        // row under the calendar (the Off · Behind · In Front control) and
        // the strings it is sent. Each is checked here key by key; the rest
        // of the shell must still be 0.46.6's, byte for byte.
        $a = staff_config($expect)['strings'] ?? [];
        $b = staff_config($nowHtml)['strings'] ?? [];
        $gone = ['stTipOnce', 'stTipNightOnce', 'stBySourceOnce', 'stWeekdaysSame', 'stTipDock', 'stBookedDock', 'stTurnoversOnce', 'stLeadAfter', 'stTipVsPrev', 'stVsPrevSr',
            'updated',                                        // 0.47.1: "Updated hh:mm" removed (Rob)
            'photoNote'];                                     // 0.47.5: the line under View Photo ID removed (Rob)
        $new = ['lyTag', 'lyName', 'lyDates', 'lyHead', 'stVsDatesSr', 'stColCottage', 'stColNights', 'stColOcc', 'stColVs', 'stTipVsOcc'];
        $renamed = ['stPerCottage', 'stBySource', 'stMix', 'stWeekdays', 'stLead', 'stPace', 'stHeat'];
        $same = static function (array $x, array $y): bool { sort($x); sort($y); return $x === $y; };
        $changed = array_keys(array_filter($b, static fn($v, $k) => array_key_exists($k, $a) && $a[$k] !== $v, ARRAY_FILTER_USE_BOTH));
        check("$label strings: 0.47.0 removes the eight counting-rule lines and the previous-timeframe pair, adds last year's and the table's, renames the seven sections — and drops the Updated {time} line (0.47.1) and the Photo ID note (0.47.5) — nothing else",
            $same(array_diff(array_keys($a), array_keys($b)), $gone) && $same(array_diff(array_keys($b), array_keys($a)), $new) && $same($changed, $renamed),
            ['gone' => array_values(array_diff(array_keys($a), array_keys($b))), 'new' => array_values(array_diff(array_keys($b), array_keys($a))), 'changed' => $changed]);
        $cut = static fn($h) => preg_replace(['/data-staff-config="[^"]*"/', '/\s*<div class="mphbac-staff-under">.*?(?=<details class="mphbac-staff-stats">)/s'], ['', ''], $h);
        check("$label the rest of the shell = 0.46.6's with Part A's labels (the row under the calendar apart)", $cut($nowHtml) === $cut($expect));
        check("$label ...and that row is the Off · Behind · In Front control, Off checked", (bool) preg_match('/role="radiogroup".*aria-checked="true"[^>]*>Off<.*>Behind<.*>In Front</s', $nowHtml));
    } else {
        check("$label HTML = 0.46.6's with Part A's labels" . (in_array($case, $V1, true) ? ' and the side margin settled' : '') . ', nothing else',
            $nowHtml === $expect);
    }
    check("$label per-post CSS and tokens = 0.46.6's", $now['css'] === $was['css'] && $now['tokens'] === $was['tokens']);
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

    $red = json_decode((string) shell_exec('php ' . escapeshellarg(__DIR__ . '/render/redundant.php') . ' ' . escapeshellarg($PLUGIN) . ' ' . escapeshellarg($LIVE5) . ' --json'), true);
    $keep = [];
    foreach ($red as $case => $o) {
        if ($o['keep']) { $keep[$case] = $o['keep']; }
    }
    // 0.46.5's export: everything but single_cottage, and Part A's three
    // labels, which it still stored in their old wording.
    $labels = ['str_checkin', 'str_checkout', 'str_price_label'];
    $bad = [];
    foreach ($keep as $case => $k) {
        $rest = array_values(array_diff($k, $labels, ['single_cottage']));
        if ($rest) { $bad[$case] = $rest; }
    }
    check('0.46.5\'s export: every stored key but single_cottage and Part A\'s three old labels is redundant, a settings colour, an orphan or Elementor\'s own',
        $bad === [] && count($keep) === 10, $keep);
    $red6 = json_decode((string) shell_exec('php ' . escapeshellarg(__DIR__ . '/render/redundant.php') . ' ' . escapeshellarg($PLUGIN) . ' ' . escapeshellarg($LIVE6) . ' --json'), true);
    $keep6 = [];
    foreach ($red6 as $case => $o) {
        if ($o['keep'] || $o['orphan']) { $keep6[$case] = array_merge($o['keep'], $o['orphan']); }
    }
    check('live NOW: every key still stored is redundant, a settings colour or Elementor\'s own — but each cottage page\'s single_cottage',
        array_unique(array_merge(...array_values($keep6))) === ['single_cottage'] && count($keep6) === 8, $keep6);
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
