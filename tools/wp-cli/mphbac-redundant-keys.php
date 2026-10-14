<?php
/**
 * READ-ONLY: WHICH STORED CALENDAR SETTINGS EQUAL THE INSTALLED DEFAULTS?
 *
 *   wp eval-file mphbac-redundant-keys.php            (a table per instance)
 *   wp eval-file mphbac-redundant-keys.php -- --json  (the same, as JSON)
 *
 * For every published post, page or template whose Elementor data holds one
 * of the three DCC calendar widgets — the overview calendar (mphbac_calendar),
 * the cottage calendar (dccac_single), the staff calendar (dccac_staff) — it
 * sorts each STORED setting into one bucket:
 *
 *   redundant  equal to the installed plugin's default for that control —
 *              clearing it changes nothing on the page;
 *   global     a "follow DCC" colour storing exactly what DCC → Availability
 *              Calendar says — clearing it changes nothing today, and the
 *              widget then follows the settings screen;
 *   orphan     no such control exists any more — nothing reads it;
 *   elementor  Elementor's own (leading "_"), not the plugin's;
 *   keep       differs from the default — clearing it WOULD change the page.
 *
 * Equality is Elementor's own: each value is resolved by the control's own
 * get_value() (a repeater row's unset fields filled from their defaults, a
 * slider's missing keys from the type's), then compared with array key order
 * ignored and numbers equal to their numeric strings.
 *
 * IT CHANGES NOTHING. It reads _elementor_data and the plugin's settings and
 * prints; it calls no update, save, delete or cache function. Run it before
 * and after clearing keys: after, the cleared keys are simply gone from the
 * list, and "keep" must read the same.
 *
 * Revisions and autosaves are skipped — they hold copies of _elementor_data.
 */

if (!defined('WP_CLI') || !WP_CLI) {
    echo "Run with WP-CLI: wp eval-file mphbac-redundant-keys.php\n";
    return;
}
if (!class_exists('\Elementor\Plugin') || !class_exists('\MPHBAC\Settings')) {
    WP_CLI::error('Elementor and the DCC Availability Calendar plugin must both be active.');
}

$as_json = in_array('--json', (array) ($args ?? []), true);
$types = ['mphbac_calendar', 'dccac_single', 'dccac_staff'];

global $wpdb;
$likes = implode(' OR ', array_map(static fn($t) => $wpdb->prepare('pm.meta_value LIKE %s', '%' . $wpdb->esc_like('"' . $t . '"') . '%'), $types));
$post_ids = $wpdb->get_col(
    "SELECT DISTINCT pm.post_id FROM {$wpdb->postmeta} pm
     INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id
     WHERE pm.meta_key = '_elementor_data' AND p.post_status = 'publish'
       AND p.post_type NOT IN ('revision', 'customize_changeset') AND ($likes)
     ORDER BY pm.post_id"
);

$norm = static function ($v) use (&$norm) {
    if (is_array($v)) {
        $list = array_keys($v) === range(0, count($v) - 1);
        $o = [];
        foreach ($v as $k => $x) { $o[$k] = $norm($x); }
        if (!$list) { ksort($o); }
        return $o;
    }
    if (is_int($v) || is_float($v)) { return (string) $v; }
    if (is_bool($v)) { return $v ? 'yes' : ''; }
    return $v === null ? '' : (string) $v;
};
$same = static fn($a, $b): bool => $norm($a) === $norm($b);

$schema = \MPHBAC\Settings::schema();
$controls_manager = \Elementor\Plugin::$instance->controls_manager;
$report = [];

$walk = static function (array $elements, callable $visit) use (&$walk) {
    foreach ($elements as $el) {
        if (($el['elType'] ?? '') === 'widget') {
            $visit($el);
        }
        if (!empty($el['elements']) && is_array($el['elements'])) {
            $walk($el['elements'], $visit);
        }
    }
};

foreach ($post_ids as $post_id) {
    $raw = get_post_meta((int) $post_id, '_elementor_data', true);
    $data = is_string($raw) ? json_decode($raw, true) : $raw;
    if (!is_array($data)) {
        continue;
    }
    $walk($data, static function (array $node) use ($post_id, $types, $controls_manager, $schema, $same, &$report) {
        if (!in_array($node['widgetType'] ?? '', $types, true)) {
            return;
        }
        $widget = \Elementor\Plugin::$instance->elements_manager->create_element_instance($node);
        if (!$widget) {
            return;
        }
        $controls = $widget->get_controls();
        $stored = is_array($node['settings'] ?? null) ? $node['settings'] : [];
        $buckets = ['redundant' => [], 'global' => [], 'orphan' => [], 'elementor' => [], 'keep' => []];
        foreach ($stored as $key => $value) {
            if (is_string($key) && $key !== '' && $key[0] === '_') {
                $buckets['elementor'][] = $key;
                continue;
            }
            if (!isset($controls[$key])) {
                $buckets['orphan'][] = $key;
                continue;
            }
            $control = $controls[$key];
            $obj = $controls_manager->get_control($control['type']);
            if (!$obj instanceof \Elementor\Base_Data_Control) {
                $buckets['orphan'][] = $key;
                continue;
            }
            $control = array_merge_recursive($obj->get_settings(), $control);
            $default  = $obj->get_value($control, []);
            $resolved = $obj->get_value($control, [$key => $value]);
            if ($same($resolved, $default)) {
                $buckets['redundant'][] = $key;
            } elseif ($control['type'] === 'color' && ($default === '' || $default === null)
                && isset($schema[$key]) && $same($value, \MPHBAC\Settings::get($key))) {
                $buckets['global'][] = $key;
            } else {
                $buckets['keep'][] = $key;
            }
        }
        $report[] = ['post_id' => (int) $post_id, 'title' => get_the_title((int) $post_id),
            'widget_id' => (string) ($node['id'] ?? ''), 'type' => (string) $node['widgetType'],
            'stored' => count($stored)] + $buckets;
    });
}

if ($as_json) {
    WP_CLI::line((string) wp_json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    return;
}
WP_CLI::line('DCC calendar settings vs the installed defaults (plugin ' . (defined('MPHBAC_VERSION') ? MPHBAC_VERSION : '?') . ') — read-only');
foreach ($report as $r) {
    WP_CLI::line('');
    WP_CLI::line(sprintf('%d:%s  %s (%s), %d stored keys', $r['post_id'], $r['widget_id'], $r['title'], $r['type'], $r['stored']));
    foreach (['redundant', 'global', 'orphan', 'elementor', 'keep'] as $b) {
        WP_CLI::line(sprintf('  %-10s %2d  %s', $b, count($r[$b]), implode(', ', $r[$b])));
    }
}
WP_CLI::line('');
WP_CLI::line(sprintf('%d instances. Safe to clear: the redundant, global and orphan keys. Keep: elementor and keep.', count($report)));
