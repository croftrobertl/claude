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

// ---- WordPress, as far as rendering a widget needs ------------------------
// Defined BEFORE the shared bootstrap, whose own versions are guarded by
// function_exists: Elementor IS loaded here, and an editor can see the board.
function did_action($t) { return $t === 'elementor/loaded' ? 1 : 0; }
function is_user_logged_in() { return !empty($GLOBALS['r_staff_user']); }
function current_user_can($c) { return !empty($GLOBALS['r_staff_user']); }
require dirname(__DIR__) . '/bootstrap.php';

function MPHB() { return new stdClass(); }
function plugin_dir_path($f) { return rtrim(dirname($f), '/') . '/'; }
function plugin_dir_url($f) { return 'https://example.test/wp-content/plugins/' . basename(dirname($f)) . '/'; }
function plugin_basename($f) { return basename(dirname($f)) . '/' . basename($f); }
function register_activation_hook($f, $cb) { $GLOBALS['r_activation'][] = $cb; }
function register_deactivation_hook($f, $cb) {}
function add_action(...$a) { return true; }
function add_filter(...$a) { return true; }
function is_admin() { return false; }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_url($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_html__($t, $d = '') { return esc_html($t); }
function esc_attr__($t, $d = '') { return esc_attr($t); }
function esc_html_e($t, $d = '') { echo esc_html($t); }
function admin_url($p = '') { return 'https://example.test/wp-admin/' . $p; }
function home_url($p = '') { return 'https://example.test' . $p; }
function wpautop($t) { return '<p>' . $t . '</p>'; }
function wp_kses_post($t) { return (string) $t; }
function wp_hash($d) { return hash('sha256', 'salt|' . $d); }
function get_transient($k) { return false; }
function set_transient($k, $v, $t = 0) { return true; }
function delete_transient($k) { return true; }
function wp_register_style(...$a) {}
function wp_register_script(...$a) {}
function wp_enqueue_style(...$a) {}
function wp_enqueue_script(...$a) {}
function wp_add_inline_style(...$a) {}
function wp_create_nonce($a = '') { return 'nonce'; }
function get_locale() { return 'en_US'; }
if (!defined('MINUTE_IN_SECONDS')) { define('MINUTE_IN_SECONDS', 60); }
if (!defined('DAY_IN_SECONDS')) { define('DAY_IN_SECONDS', 86400); }

require __DIR__ . '/elementor-emu.php';
require rtrim($dir, '/') . '/mphb-availability-calendar.php';

// ---- the site: eight cottages, the info templates, the staff page ---------
$cottages = [1071 => 'Cottage 22: The Boathouse', 1069 => 'Cottage 23: The Lighthouse', 1067 => 'Cottage 31: Hibiscus Hut',
             1065 => 'Cottage 32: Flamingo Bungalow', 1604 => 'Cottage 33: Pineapple Place', 1607 => 'Cottage 34: Coconut Cottage',
             1740 => 'Cottage 35: Blue Heron Hideaway', 1742 => 'Cottage 36: Sunshine Suite'];
foreach ($cottages as $id => $title) {
    t_post($id, 'mphb_room_type', 'publish', $title);
}
foreach ([11973, 11935, 11940, 11946, 11951, 11957, 11962, 11968] as $tpl) {
    t_post($tpl, 'elementor_library', 'publish', 'Info ' . $tpl);
}
t_post(18102, 'page', 'publish', 'Staff');
$GLOBALS['t_posts'][18102]->post_password = 'x';

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
$rc = new ReflectionMethod($widget, 'register_controls');
$rc->setAccessible(true);
$rc->invoke($widget);

if ($mode === 'defaults') {
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

ob_start();
$rr = new ReflectionMethod($widget, 'render');
$rr->setAccessible(true);
$rr->invoke($widget);
$html = ob_get_clean();

$wrapper = '.elementor-' . $post_id . ' .elementor-element.elementor-element-' . $widget_id;
echo json_encode([
    'case'     => $case,
    'type'     => $inst['widget_type'],
    'mode'     => $mode,
    'version'  => MPHBAC_VERSION,
    'html'     => $html,
    'css'      => $widget->emu_css($wrapper),
    'tokens'   => \MPHBAC\Settings::tokens_css(),
    'settings' => $widget->get_settings_for_display(),
    'controls' => array_keys(array_filter($widget->get_controls(), static fn($c) => in_array($c['type'] ?? '', \Elementor\Controls_Manager::DATA, true))),
    'activation' => array_map(static fn($cb) => is_array($cb) ? implode('::', $cb) : (string) $cb, $GLOBALS['r_activation'] ?? []),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
