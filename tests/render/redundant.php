<?php
/**
 * WHICH STORED KEYS DOES 0.46.6 MAKE REDUNDANT? (0.46.6)
 *
 *   php tests/render/redundant.php <plugin_dir> <live.json> [--json]
 *
 * For every instance in the export, every stored key falls in one bucket:
 *
 *   redundant   equal to the control's default in this plugin tree — clearing
 *               it changes nothing, now or when a later release's default
 *               moves (it then follows the default, as it should);
 *   global      a "follow DCC" colour storing exactly what the settings
 *               screen says — clearing it changes nothing today, and the
 *               instance then follows the settings screen;
 *   orphan      no control of that name exists — nothing reads it;
 *   elementor   Elementor's own (leading "_"): not the plugin's to default;
 *   keep        differs from the default: clearing it WOULD change the page.
 *
 * Equality is Elementor's: the stored value AS ELEMENTOR RESOLVES IT against
 * the resolved default — a repeater row's unset fields filled from their
 * defaults — arrays compared key-order-insensitively, numbers against
 * numeric strings.
 * The same rules are implemented for the live site, with real Elementor, in
 * tests/render/wp-cli-redundant-keys.php.
 */
[$self, $dir, $json] = $argv + [null, null, null];
$asJson = in_array('--json', $argv, true);
$live = json_decode((string) file_get_contents($json), true);

$out = [];
foreach ($live['widgets'] as $w) {
    $case = $w['post_id'] . ':' . $w['widget_id'];
    // The controls and their defaults, from the tree, with live's option row
    // (so a settings-driven default resolves as it does on live).
    $r = json_decode((string) shell_exec('php ' . escapeshellarg(__DIR__ . '/render.php') . ' '
        . escapeshellarg($dir) . ' ' . escapeshellarg($json) . ' ' . escapeshellarg($case) . ' defaults'), true);
    $buckets = ['redundant' => [], 'global' => [], 'orphan' => [], 'elementor' => [], 'keep' => []];
    foreach ((array) $w['stored_settings'] as $key => $value) {
        if ($key[0] === '_') {
            $buckets['elementor'][] = $key;
        } elseif (!array_key_exists($key, $r['defaults'])) {
            $buckets['orphan'][] = $key;
        } elseif (same($r['resolved'][$key] ?? $value, $r['defaults'][$key])) {
            // Both sides as Elementor resolves them: a repeater row's unset
            // fields filled from their own defaults, a slider's missing keys
            // from the type's.

            $buckets['redundant'][] = $key;
        } elseif (isset($r['globals'][$key]) && same($value, $r['globals'][$key])) {
            $buckets['global'][] = $key;
        } else {
            $buckets['keep'][] = $key;
        }
    }
    $out[$case] = ['post' => $w['post_title'], 'type' => $w['widget_type'], 'stored' => count((array) $w['stored_settings'])] + $buckets;
}

function norm($v) {
    if (is_array($v)) {
        $isList = array_keys($v) === range(0, count($v) - 1);
        $o = [];
        foreach ($v as $k => $x) { $o[$k] = norm($x); }
        if (!$isList) { ksort($o); }
        return $o;
    }
    if (is_int($v) || is_float($v)) { return (string) $v; }
    if (is_bool($v)) { return $v ? 'yes' : ''; }
    return $v === null ? '' : (string) $v;
}
function same($a, $b): bool { return norm($a) === norm($b); }

if ($asJson) {
    echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
    exit(0);
}
foreach ($out as $case => $o) {
    printf("%s  %s (%s), %d stored keys\n", $case, $o['post'], $o['type'], $o['stored']);
    foreach (['redundant', 'global', 'orphan', 'elementor', 'keep'] as $b) {
        printf("  %-10s %2d  %s\n", $b, count($o[$b]), implode(', ', $o[$b]));
    }
}
