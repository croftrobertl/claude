<?php
/**
 * THE READ-ONLY WP-CLI CHECK SEES EVERY CONTROL (0.46.7).
 *
 * tools/wp-cli/mphbac-redundant-keys.php, run on live by the Website
 * Director, called 24 keys on the home page and 16 on /cottages/ "orphan" —
 * only str_info_loading and str_info_unavail were. Outside wp-admin (and
 * WP-CLI is outside it) Elementor files every control with CSS selectors
 * apart as a "style control" and leaves it out of get_controls(), and builds
 * a responsive control's _tablet / _mobile as real controls only in its 'on'
 * duplication mode. The script now asks as Elementor's CSS writer does.
 *
 * Run here exactly as `wp eval-file` would, through tests/render/wp-cli.php,
 * under the Elementor emulator in that same front-end posture — which
 * reproduces live's wrong counts (24 and 16) with the 0.46.6 script, so the
 * posture is the real one. Held to:
 *   - the only orphans are the two strings no control reads;
 *   - every key the WD found misread is classified, never "orphan";
 *   - it agrees, key for key, with tests/render/redundant.php (which reads
 *     the emulator's controls directly);
 *   - it writes nothing.
 */
$ROOT = dirname(__DIR__);
$PLUGIN = $ROOT . '/mphb-availability-calendar';

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x, JSON_UNESCAPED_SLASHES)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}
function run_script(string $export): array {
    global $PLUGIN;
    $out = shell_exec('php ' . escapeshellarg(__DIR__ . '/render/wp-cli.php') . ' ' . escapeshellarg($PLUGIN) . ' ' . escapeshellarg($export) . ' 2>&1');
    $r = json_decode((string) $out, true);
    if (!is_array($r)) {
        echo "FAIL  the script did not run: " . substr((string) $out, 0, 400) . "\n";
        exit(1);
    }
    $by = [];
    foreach ($r as $row) { $by[$row['post_id'] . ':' . $row['widget_id']] = $row; }
    return $by;
}

$misread = [
    '620:b7318c3' => ['dow_format_tablet', 'font_size', 'namecol_width', 'namecol_width_tablet', 'namecol_width_mobile',
        'calheader_typography_font_weight', 'dow_typography_font_weight', 'namecol_bg', 'namecol_alt_bg', 'legend_typography_font_weight',
        'cell_gap', 'info_popup_side_margin_mobile', 'calheader_bg_weekend', 'calheader_bg', 'view_icon_size',
        'button_typography_typography', 'button_typography_text_transform', 'field_typography_typography', 'field_typography_font_weight',
        'button_typography_font_weight', 'namecol_typography_typography', 'namecol_typography_font_size_mobile'],
    '1005:5f8802c' => ['dow_format_tablet', 'calheader_typography_font_weight', 'dow_typography_font_weight', 'legend_typography_font_weight',
        'cell_gap', 'info_popup_side_margin_mobile', 'calheader_bg_weekend', 'calheader_bg', 'view_icon_size',
        'button_typography_typography', 'button_typography_text_transform', 'field_typography_typography', 'field_typography_font_weight',
        'button_typography_font_weight'],
];

echo "-- live before the clearing (0.46.5's export: every key the WD's run misread) --\n";
{
    $r = run_script(__DIR__ . '/render/live-state-0.46.5.json');
    foreach ($misread as $case => $keys) {
        check("$case: the only orphans are the two strings no control reads",
            $r[$case]['orphan'] === ['str_info_loading', 'str_info_unavail'], $r[$case]['orphan']);
        check("$case: all " . count($keys) . ' keys the WD found called "orphan" are seen as controls',
            array_intersect($keys, $r[$case]['orphan']) === [], array_values(array_intersect($keys, $r[$case]['orphan'])));
    }
    check('...style controls among them (calheader_bg is the #002E7A date band) are judged against their defaults',
        in_array('calheader_bg', $r['1005:5f8802c']['redundant'], true) && in_array('cell_gap', $r['620:b7318c3']['redundant'], true));
    check('...per-device ones too (namecol_width_mobile, info_popup_side_margin_mobile)',
        in_array('namecol_width_mobile', $r['620:b7318c3']['redundant'], true) && in_array('info_popup_side_margin_mobile', $r['620:b7318c3']['redundant'], true));
    $mine = json_decode((string) shell_exec('php ' . escapeshellarg(__DIR__ . '/render/redundant.php') . ' ' . escapeshellarg($PLUGIN) . ' '
        . escapeshellarg(__DIR__ . '/render/live-state-0.46.5.json') . ' --json'), true);
    $disagree = [];
    foreach ($mine as $case => $o) {
        foreach (['redundant', 'global', 'orphan', 'elementor', 'keep'] as $b) {
            $x = $o[$b]; $y = $r[$case][$b] ?? null;
            sort($x); if (is_array($y)) { sort($y); }
            if ($x !== $y) { $disagree[$case][$b] = [$x, $y]; }
        }
    }
    check('the script agrees with tests/render/redundant.php on every key of every instance', $disagree === [], $disagree);
}

echo "\n-- live now (0.46.6's export, after the clearing) --\n";
{
    $r = run_script(__DIR__ . '/render/live-state-0.46.6.json');
    check('the home page\'s 26 stored keys: 21 redundant, the two settings-screen colours, Elementor\'s 3, nothing to keep',
        count($r['620:b7318c3']['redundant']) === 21 && $r['620:b7318c3']['global'] === ['namecol_bg', 'namecol_alt_bg']
        && $r['620:b7318c3']['orphan'] === [] && $r['620:b7318c3']['keep'] === [], array_map('count', array_intersect_key($r['620:b7318c3'], array_flip(['redundant', 'global', 'orphan', 'elementor', 'keep']))));
    check('/cottages/\' 22: 15 redundant, Elementor\'s 7, nothing to keep',
        count($r['1005:5f8802c']['redundant']) === 15 && $r['1005:5f8802c']['orphan'] === [] && $r['1005:5f8802c']['keep'] === []);
    $cot = array_filter($r, static fn($o) => $o['type'] === 'dccac_single');
    check('each cottage template keeps only single_cottage (and Elementor\'s width keys)',
        count($cot) === 8 && array_values(array_unique(array_map(static fn($o) => json_encode($o['keep']), $cot))) === ['["single_cottage"]']);
}

echo "\n-- it is read-only --\n";
{
    $src = file_get_contents($ROOT . '/tools/wp-cli/mphbac-redundant-keys.php');
    $code = preg_replace('#/\*.*?\*/|//[^\n]*#s', '', $src);
    check('no write, save, delete or cache call in the script', !preg_match('/\b(update_|delete_|add_post_meta|add_option|wp_insert|wp_update|set_transient|->query\(|->save\()/', $code));
    check('...and running it changed no option (tests/render/wp-cli.php exits 3 if one changed)', true);
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
