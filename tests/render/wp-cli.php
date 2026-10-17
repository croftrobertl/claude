<?php
/**
 * RUN tools/wp-cli/mphbac-redundant-keys.php AGAINST AN EXPORT, OFFLINE
 * (0.46.7).
 *
 *   php tests/render/wp-cli.php <plugin_dir> <live.json> [script]
 *
 * Boots the site the way render.php does — the plugin through its real main
 * file, under the Elementor emulator in its FRONT-END posture: style controls
 * filed apart and left out of get_controls(), duplication mode 'off' — which
 * is how WP-CLI meets Elementor on live (is_admin() is false there too, so
 * Performance::should_optimize_controls() holds). Each widget in the export
 * becomes a post whose _elementor_data holds it, and the script runs exactly
 * as `wp eval-file` would, with `--json`. Prints the script's JSON.
 */
[$self, $dir, $json, $script] = $argv + [null, null, null, dirname(__DIR__, 2) . '/tools/wp-cli/mphbac-redundant-keys.php'];
$live = json_decode((string) file_get_contents($json), true);

require __DIR__ . '/boot.php';
foreach ($live['options'] as $k => $v) {
    $GLOBALS['t_options'][$k] = $v;
}

define('WP_CLI', true);
final class WP_CLI
{
    public static array $out = [];
    public static function line($s = '') { self::$out[] = (string) $s; }
    public static function error($s) { fwrite(STDERR, "WP_CLI::error: $s\n"); exit(1); }
}

// One post per widget, its _elementor_data a section holding that widget.
$ids = [];
foreach ($live['widgets'] as $w) {
    $pid = (int) $w['post_id'];
    if (!isset($GLOBALS['t_posts'][$pid])) {
        t_post($pid, $w['post_type'], $w['post_status'], $w['post_title']);
    }
    $GLOBALS['t_posts'][$pid]->post_title = $w['post_title'];
    $GLOBALS['t_meta'][$pid]['_elementor_data'] = json_encode([[
        'id' => 's' . $pid, 'elType' => 'section', 'settings' => [],
        'elements' => [['id' => 'c' . $pid, 'elType' => 'column', 'settings' => [], 'elements' => [[
            'id' => $w['widget_id'], 'elType' => 'widget', 'widgetType' => $w['widget_type'],
            'settings' => is_array($w['stored_settings']) ? $w['stored_settings'] : [], 'elements' => [],
        ]]]],
    ]]);
    $ids[] = $pid;
}
$GLOBALS['wpdb'] = new class($ids) extends T_WPDB {
    public function __construct(private array $ids) {}
    public function get_col($sql) { return $this->ids; }
};

$before = $GLOBALS['t_options'];
$args = ['--json'];
(static function () use ($script, $args) { global $wpdb; include $script; })();
// The calendar's cache rows (Cache, mphbac_c_<hash>) are not settings: since
// 0.47.4 they are options where they used to be transients, which this check
// never saw. Rendering a widget fills them, as any page view does.
$settings_only = static fn(array $o): array => array_filter($o, static fn($k) => strncmp((string) $k, 'mphbac_c_', 9) !== 0, ARRAY_FILTER_USE_KEY);
if ($settings_only($GLOBALS['t_options']) !== $settings_only($before)) {
    fwrite(STDERR, 'wp-cli.php: changed: ' . implode(', ', array_keys(array_diff_key($settings_only($GLOBALS['t_options']), $settings_only($before)))) . "\n");
    fwrite(STDERR, "wp-cli.php: the script WROTE an option\n");
    exit(3);
}
echo implode("\n", WP_CLI::$out), "\n";
