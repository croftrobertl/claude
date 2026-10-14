<?php
/**
 * WHAT A PLUGIN TREE RENDERS FOR EVERY LIVE INSTANCE (0.46.6).
 *
 *   php tests/render/snapshot.php <plugin_dir> <live.json> [mode]  > out.json
 *
 * Runs render.php for each instance in the export (mode: live by default)
 * and prints, per instance, the widget's HTML, its Elementor per-post CSS
 * and the settings token CSS — normalised so two runs on different days
 * compare: every date becomes D, every month Y-M, the render timestamp 0.
 *
 * tests/render/live-render-0.46.6.json is this script's output for the
 * 0.46.6 tree from live's current export, made once, so
 * live-defaults-test.php can hold the current tree to "renders exactly what
 * 0.46.6 rendered" (0.46.7's two changes apart) without a 0.46.6 checkout:
 *   git worktree add /tmp/v0466 4e380cc
 *   MPHBAC_ORDER=cached php tests/render/snapshot.php /tmp/v0466/mphb-availability-calendar \
 *       tests/render/live-state-0.46.6.json > tests/render/live-render-0.46.6.json
 */
[$self, $dir, $json, $mode] = $argv + [null, null, null, 'live'];
$live = json_decode((string) file_get_contents($json), true);

function normalise(string $s): string
{
    $s = preg_replace('/renderedAt&quot;:\d+/', 'renderedAt&quot;:0', $s);
    $s = preg_replace('/\d{4}-\d{2}-\d{2}/', 'D', $s);
    return preg_replace('/\d{4}-\d{2}(?!\d)/', 'Y-M', $s);
}

$out = [];
foreach ($live['widgets'] as $w) {
    $case = $w['post_id'] . ':' . $w['widget_id'];
    $r = json_decode((string) shell_exec('php ' . escapeshellarg(__DIR__ . '/render.php') . ' ' . escapeshellarg($dir)
        . ' ' . escapeshellarg($json) . ' ' . escapeshellarg($case) . ' ' . escapeshellarg($mode)), true);
    if (!is_array($r)) {
        fwrite(STDERR, "snapshot: render failed for $case\n");
        exit(1);
    }
    $out[$case] = ['type' => $r['type'], 'html' => normalise($r['html']), 'css' => $r['css'], 'tokens' => $r['tokens']];
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
