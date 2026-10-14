<?php
/**
 * RENDER ONE LIVE WIDGET INSTANCE, OFFLINE (0.46.6).
 *
 *   php tests/render/render.php <plugin_dir> <live.json> <case> <mode>
 *
 *   <plugin_dir>  a plugin tree: mphb-availability-calendar/ of THIS checkout,
 *                 or of another version (a git worktree of 0.46.5), so the
 *                 same instance can be rendered by both and compared.
 *   <live.json>   the Website Director's export of live (widgets + options).
 *   <case>        <post_id>:<widget_id>, e.g. 1005:5f8802c, or "list".
 *   <mode>        live   — the instance's stored settings and live's option row;
 *                 blind  — a blind install: NO option row, and the instance's
 *                          stored keys removed, except single_cottage (the
 *                          one genuinely per-instance value) and Elementor's
 *                          own "_" keys (not the plugin's to default).
 *                 strip:<key>[,<key>…] — live, minus those stored keys;
 *                 live+{"stored":{…},"options":{…}} — live, with those stored
 *                          values and option-row values merged in;
 *                 defaults — print each control's resolved default instead.
 *
 * Prints JSON: the widget's HTML, its Elementor per-post CSS (from the
 * emulator), the settings token CSS, and get_settings_for_display(). The
 * plugin is loaded through its real main file, so its own constants,
 * autoloader and classes are exactly what ships.
 */

[$self, $dir, $json, $case, $mode] = $argv + [null, null, null, null, 'live'];
$live = json_decode((string) file_get_contents($json), true);
if (!is_array($live)) {
    fwrite(STDERR, "render: cannot read $json\n");
    exit(2);
}
if ($case === 'list') {
    foreach ($live['widgets'] as $w) {
        echo $w['post_id'] . ':' . $w['widget_id'] . ' ' . $w['widget_type'] . "\n";
    }
    exit(0);
}

require __DIR__ . '/boot.php';

// ---- the instance ---------------------------------------------------------
[$post_id, $widget_id] = explode(':', (string) $case) + [null, null];
$inst = null;
foreach ($live['widgets'] as $w) {
    if ((string) $w['post_id'] === (string) $post_id && $w['widget_id'] === $widget_id) {
        $inst = $w;
    }
}
if ($inst === null) {
    fwrite(STDERR, "render: no instance $case\n");
    exit(2);
}
$stored = is_array($inst['stored_settings']) ? $inst['stored_settings'] : [];
$options = $live['options'];

if ($mode === 'blind') {
    $kept = [];
    foreach ($stored as $k => $v) {
        if ($k === 'single_cottage' || $k[0] === '_') {
            $kept[$k] = $v;
        }
    }
    $stored = $kept;
    $options = [];
} elseif (strncmp((string) $mode, 'strip:', 6) === 0) {
    foreach (explode(',', substr($mode, 6)) as $k) {
        unset($stored[$k]);
    }
} elseif (strncmp((string) $mode, 'live+', 5) === 0) {
    $extra = json_decode(substr($mode, 5), true);
    $stored = array_replace($stored, (array) ($extra['stored'] ?? []));
    $options['mphbac_settings'] = array_replace((array) ($options['mphbac_settings'] ?? []), (array) ($extra['options'] ?? []));
}
foreach ($options as $k => $v) {
    $GLOBALS['t_options'][$k] = $v;
}

$class = ['mphbac_calendar' => \MPHBAC\Widget::class, 'dccac_single' => \MPHBAC\Widget_Single::class,
          'dccac_staff' => \MPHBAC\Staff_Elementor::class][$inst['widget_type']];
if ($inst['widget_type'] === 'dccac_staff') {
    $GLOBALS['r_staff_user'] = true;
}
$widget = new $class(['id' => $widget_id, 'settings' => $stored]);

if ($mode === 'defaults') {
    // Every control, as the CSS writer sees them: per device, style ones in.
    \Elementor\Core\Frontend\Performance::set_use_style_controls(true);
    \Elementor\Plugin::$instance->breakpoints->set_responsive_control_duplication_mode('on');
    // Each data control's resolved default (no stored value), and for a
    // "follow DCC" colour — a control with no default whose name is also a
    // settings key — the settings-screen value it follows when empty.
    $defaults = $globals = $resolved = [];
    $schema = \MPHBAC\Settings::schema();
    foreach ($widget->get_controls() as $id => $c) {
        if (!in_array($c['type'] ?? '', \Elementor\Controls_Manager::DATA, true)) {
            continue;
        }
        $defaults[$id] = \Elementor\Widget_Base::emu_value($c, []);
        if (array_key_exists($id, $stored)) {
            $resolved[$id] = \Elementor\Widget_Base::emu_value($c, $stored);
        }
        if (($c['type'] ?? '') === 'color' && ($defaults[$id] === '' || $defaults[$id] === null) && isset($schema[$id])) {
            $globals[$id] = \MPHBAC\Settings::get($id);
        }
    }
    echo json_encode(['defaults' => $defaults, 'globals' => $globals, 'resolved' => $resolved], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit(0);
}

// THE ORDER OF ONE REQUEST. 'cached' (an ordinary page view: the post's
// CSS is already written) renders with Elementor's default 'off' stack.
// 'fresh' (the first view after a save, when Elementor rewrites the post's
// CSS before the widgets render) leaves the stack rebuilt 'on' for the render.
$order = getenv('MPHBAC_ORDER') ?: 'cached';
$wrapper = '.elementor-' . $post_id . ' .elementor-element.elementor-element-' . $widget_id;
if ($order === 'fresh') {
    $css = $widget->emu_css($wrapper);
}
ob_start();
$rr = new ReflectionMethod($widget, 'render');
$rr->setAccessible(true);
$rr->invoke($widget);
$html = ob_get_clean();
$display = $widget->get_settings_for_display();
$data_controls = array_keys(array_filter($widget->get_controls(), static fn($c) => in_array($c['type'] ?? '', \Elementor\Controls_Manager::DATA, true)));
if ($order !== 'fresh') {
    $css = $widget->emu_css($wrapper);
}

echo json_encode([
    'order'    => $order,
    'case'     => $case,
    'type'     => $inst['widget_type'],
    'mode'     => $mode,
    'version'  => MPHBAC_VERSION,
    'html'     => $html,
    'css'      => $css,
    'tokens'   => \MPHBAC\Settings::tokens_css(),
    'settings' => $display,
    'controls' => $data_controls,
    'activation' => array_map(static fn($cb) => is_array($cb) ? implode('::', $cb) : (string) $cb, $GLOBALS['r_activation'] ?? []),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
