<?php
/**
 * Unit test for the design-mirroring core: Selector_Widget::design_snapshot(),
 * config_from_snapshot(), and publish_design() (the registry round-trip a Mini
 * Entry relies on when mirroring a Cottage Selector). Pure PHP with tiny stubs for
 * the handful of WP/Elementor symbols these static methods touch — no real WP needed.
 *
 * Run: php tests/test-design-snapshot.php
 */

namespace {
    define('ABSPATH', sys_get_temp_dir() . '/');
    define('DCCS_DIR', __DIR__ . '/../dcc-cottage-selector/');

    if (!function_exists('__')) {
        function __($text, $domain = null) { return $text; }
    }
    if (!function_exists('wp_json_encode')) {
        function wp_json_encode($data) { return json_encode($data); }
    }
    // register_controls() renders labels/descriptions through the escaping helpers.
    if (!function_exists('esc_html__')) {
        function esc_html__($t, $d = null) { return $t; }
        function esc_attr__($t, $d = null) { return $t; }
        function esc_html($t) { return $t; }
        function esc_attr($t) { return $t; }
    }

    // In-memory options store so publish_design()/get_option() can round-trip.
    $GLOBALS['__opts'] = [];
    function get_option($k, $default = false) { return $GLOBALS['__opts'][$k] ?? $default; }
    function update_option($k, $v, $autoload = null) { $GLOBALS['__opts'][$k] = $v; return true; }
}

// Minimal Elementor base so the widget class can load (design_snapshot et al. are
// static and never touch the parent; the Icons_Manager guard is class_exists()'d).
// The control methods RECORD what register_controls() registers, which lets the
// preset-defaults test below check every preset key against a real control.
namespace Elementor {
    class Controls_Manager {
        const TAB_CONTENT = 'content'; const TAB_STYLE = 'style';
        const TEXT = 'text'; const TEXTAREA = 'textarea'; const COLOR = 'color';
        const SELECT = 'select'; const SWITCHER = 'switcher'; const SLIDER = 'slider';
        const DIMENSIONS = 'dimensions'; const CHOOSE = 'choose'; const ICONS = 'icons';
        const RAW_HTML = 'raw_html'; const HEADING = 'heading'; const SELECT2 = 'select2';
        const WYSIWYG = 'wysiwyg'; const NUMBER = 'number'; const URL = 'url';
        const MEDIA = 'media'; const REPEATER = 'repeater'; const HIDDEN = 'hidden';
        const ALERT = 'alert'; const POPOVER_TOGGLE = 'popover_toggle';
    }
    class Group_Control_Typography { public static function get_type() { return 'typography'; } }
    class Group_Control_Border { public static function get_type() { return 'border'; } }
    class Group_Control_Box_Shadow { public static function get_type() { return 'box_shadow'; } }
    class Base_Data_Control { public function get_type() { return 'x'; } }
    // NOTE: these three signatures mirror Elementor\Controls_Stack EXACTLY, including
    // `final` on add_group_control()/add_responsive_control() and the required
    // `array $args`. v0.19.0 shipped overrides of the final ones, which is a fatal
    // "Cannot override final method" as soon as the widget class is autoloaded — it
    // took down every front-end page carrying the widget. Keeping the real modifiers
    // here means any future attempt to override them fails this test file outright
    // instead of reaching a live site.
    class Widget_Base {
        public $__ctrls = [];
        public $__gfields = [];
        public function add_control($id, array $args, $o = []) { $this->__ctrls[$id] = true; }
        final public function add_responsive_control($id, array $args, $o = []) { $this->__ctrls[$id] = true; }
        final public function add_group_control($t, array $args = [], array $o = []) {
            foreach ((array) ($args['fields_options'] ?? []) as $f => $fa) {
                $this->__gfields[($args['name'] ?? '') . '_' . $f] = true;
            }
        }
        public function start_controls_section($i, $a = []) {} public function end_controls_section() {}
        public function start_controls_tabs($i, $a = []) {} public function end_controls_tabs() {}
        public function start_controls_tab($i, $a = []) {} public function end_controls_tab() {}
        public function get_settings_for_display($k = null) { return []; }
    }
}

namespace {
    require DCCS_DIR . 'includes/class-data.php';
    require DCCS_DIR . 'includes/class-config.php';
    require DCCS_DIR . 'includes/class-selector-widget.php';

    use DCCS\Selector_Widget;

    $pass = 0; $fail = 0;
    function ok($label, $cond) {
        global $pass, $fail;
        if ($cond) { $pass++; echo "  ok  - $label\n"; }
        else { $fail++; echo "  NOT OK - $label\n"; }
    }

    // A representative Selector settings array (as Elementor would store it).
    $settings = [
        'str_heading'         => 'Find your cottage',
        'str_results_heading' => 'Your top matches',
        'start_mode'          => 'weights',
        'enabled_modes'       => ['weights', 'compare'],
        'show_heading'        => '',                 // heading off
        'icon_submit'         => ['value' => ''],    // empty icon -> dropped
        'icon_side_view'      => 'right',
        'not_a_string'        => ['x' => 1],         // ignored (non-scalar, non str_)
        'color_accent'        => '#123456',          // -> --dccs-accent
        'color_text'          => '',                 // unset -> dropped
        'color_btn_bg'        => '#abcdef',          // -> --dccs-btn-bg (split-out palette)
        'color_results_bg'    => '#fafafa',          // -> --dccs-results-bg
        'corner_radius'       => ['size' => 14, 'unit' => 'px'], // -> --dccs-radius: 14px
    ];

    $snap = Selector_Widget::design_snapshot($settings);

    ok('string overrides strip the str_ prefix', ($snap['string_overrides']['heading'] ?? null) === 'Find your cottage');
    ok('multiple string overrides captured', ($snap['string_overrides']['results_heading'] ?? null) === 'Your top matches');
    ok('non str_ / non-scalar keys ignored', !array_key_exists('not_a_string', $snap['string_overrides']));
    ok('startMode carried', $snap['startMode'] === 'weights');
    ok('enabledModes carried', $snap['enabledModes'] === ['weights', 'compare']);
    ok('showHeading reflects the switcher (off)', $snap['showHeading'] === false);
    ok('empty icons are dropped', !isset($snap['icons']['submit']));
    ok('icon sides captured', ($snap['iconSides']['view'] ?? null) === 'right');
    ok('icon sides default to left', ($snap['iconSides']['questions'] ?? null) === 'left');
    ok('cssVars capture a set colour', ($snap['cssVars']['--dccs-accent'] ?? null) === '#123456');
    ok('cssVars capture the split-out button background', ($snap['cssVars']['--dccs-btn-bg'] ?? null) === '#abcdef');
    ok('cssVars capture the split-out results background', ($snap['cssVars']['--dccs-results-bg'] ?? null) === '#fafafa');
    ok('cssVars format a slider as size+unit', ($snap['cssVars']['--dccs-radius'] ?? null) === '14px');
    ok('cssVars drop unset colours', !array_key_exists('--dccs-text', $snap['cssVars']));

    // Rebuild the front-end config from the snapshot (what a Mini Entry does when mirroring).
    $cfg = Selector_Widget::config_from_snapshot($snap, ['highlight' => '31']);
    ok('config applies the mirrored heading string', ($cfg['strings']['heading'] ?? null) === 'Find your cottage');
    ok('config carries startMode from the snapshot', ($cfg['startMode'] ?? null) === 'weights');
    ok('config carries the extra highlight', ($cfg['highlight'] ?? null) === '31');
    ok('config still includes the cottage dataset', !empty($cfg['cottages']));
    ok('config surfaces cssVars for inline application', ($cfg['cssVars']['--dccs-accent'] ?? null) === '#123456');

    // publish_design() round-trip + hash dedupe.
    Selector_Widget::publish_design('Main', 123, 'abc123', $settings);
    $reg = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('registry stores the named design', isset($reg['Main']));
    ok('registry records the source post id', ($reg['Main']['post_id'] ?? null) === 123);
    ok('registry records the page scope class', ($reg['Main']['page_class'] ?? null) === 'elementor-123');
    ok('registry records the element scope class', ($reg['Main']['el_class'] ?? null) === 'elementor-element-abc123');
    ok('registry stores the snapshot overrides', ($reg['Main']['overrides']['string_overrides']['heading'] ?? null) === 'Find your cottage');

    $hash1 = $reg['Main']['hash'];
    Selector_Widget::publish_design('Main', 123, 'abc123', $settings);   // unchanged
    $reg2 = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('re-publishing identical settings is a no-op (same hash)', $reg2['Main']['hash'] === $hash1);

    $settings['str_heading'] = 'Changed';
    Selector_Widget::publish_design('Main', 123, 'abc123', $settings);   // changed
    $reg3 = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('a real change updates the registry', ($reg3['Main']['overrides']['string_overrides']['heading'] ?? null) === 'Changed');

    // ---- Mini Entry parity with the Cottage Selector ----------------------------
    // Mini_Entry_Widget subclasses Selector_Widget, so it must land in the SAME
    // Elementor category without redeclaring it.
    require DCCS_DIR . 'includes/class-mini-entry-widget.php';
    $selCats  = (new \ReflectionClass(Selector_Widget::class))->newInstanceWithoutConstructor()->get_categories();
    $miniRef  = new \ReflectionClass(\DCCS\Mini_Entry_Widget::class);
    $miniCats = $miniRef->newInstanceWithoutConstructor()->get_categories();
    ok('Mini Entry shares the Selector\'s Elementor category', $miniCats === $selCats);
    ok('category is the branded slug, not a leftover working name', $selCats === ['dora-canal-court']);
    ok('Mini Entry inherits the category (no duplicated slug to drift)',
        $miniRef->getMethod('get_categories')->getDeclaringClass()->getName() === Selector_Widget::class);

    // The [dcc_selector_entry] shortcode builds its pop-up config WITHOUT a widget,
    // via Config::build(). selector.js reads a MISSING key as "on"
    // (`config.showReview !== false`), so any default the widget sets must also be
    // present here or the shortcode pop-up silently behaves differently.
    $shortcodeCfg = \DCCS\Config::build([], ['highlight' => '22', 'startMode' => 'quick']);
    $widgetCfg    = Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot([]));
    foreach (['showReview', 'showHeading'] as $key) {
        ok("shortcode pop-up config declares $key (no silent JS default)", array_key_exists($key, $shortcodeCfg));
        ok("shortcode $key matches the widget default", ($shortcodeCfg[$key] ?? null) === ($widgetCfg[$key] ?? null));
    }
    ok('review step is off by default on both paths', ($shortcodeCfg['showReview'] ?? null) === false);

    // ---- Never override an Elementor `final` method ----------------------------
    // Controls_Stack marks add_group_control()/add_responsive_control() (and others)
    // final; declaring them in a subclass is a fatal error at class-declaration time,
    // which takes down every front-end page that autoloads the widget. v0.19.0 shipped
    // exactly that. This list is from Elementor's controls-stack / widget-base /
    // element-base sources.
    $elementorFinal = [
        'add_group_control', 'add_responsive_control', 'remove_responsive_control',
        'update_responsive_control', 'start_injection', 'end_injection', 'get_injection_point',
        'start_popover', 'end_popover', 'get_class_name', 'get_config', 'get_control_index',
        'get_control_key', 'get_section_controls', 'get_style_controls', 'get_tabs_controls',
        'get_frontend_settings_keys', 'get_position_info', 'print_text_editor',
        'print_unescaped_setting', 'enqueue_scripts', 'enqueue_styles',
    ];
    foreach (['DCCS\Selector_Widget', 'DCCS\Mini_Entry_Widget'] as $cls) {
        $declared = [];
        foreach ((new \ReflectionClass($cls))->getMethods() as $meth) {
            if ($meth->getDeclaringClass()->getName() === $cls) { $declared[] = $meth->getName(); }
        }
        $clash = array_values(array_intersect($declared, $elementorFinal));
        ok(basename(str_replace('\\', '/', $cls)) . ' overrides no Elementor final method'
            . ($clash ? ' [' . implode(', ', $clash) . ']' : ''), $clash === []);
    }

    // ---- Site preset defaults (Preset_Defaults) --------------------------------
    require_once DCCS_DIR . 'includes/class-preset-defaults.php';
    require_once DCCS_DIR . 'includes/class-control-design-io.php';
    require_once DCCS_DIR . 'includes/class-mini-entry-widget.php';
    // The preset is currently DISABLED (see Preset_Defaults::enabled()) pending
    // diagnosis of the Elementor-editor fatal, so apply() must be a pure no-op and
    // control registration must match 0.18.0 exactly.
    ok('preset is disabled by default', \DCCS\Preset_Defaults::enabled() === false);
    ok('apply() is a no-op while disabled',
        \DCCS\Preset_Defaults::apply('str_heading', ['default' => 'Factory']) === ['default' => 'Factory']);
    ok('apply() adds nothing to a bare control while disabled',
        \DCCS\Preset_Defaults::apply('color_accent', []) === []);
    ok('group_fields() is empty while disabled', \DCCS\Preset_Defaults::group_fields('chip_typography') === []);

    $preset = \DCCS\Preset_Defaults::map();
    ok('preset defines a non-trivial set of defaults', count($preset) > 50);
    ok('preset carries the site heading + palette',
        ($preset['str_heading'] ?? null) === 'Cottage Wizard' &&
        ($preset['color_accent'] ?? null) === '#002E7A');
    ok('preset carries the enabled modes', ($preset['enabled_modes'] ?? null) === ['quick', 'compare']);

    // Instance-specific wiring must never be preset: design_name/share_design would make
    // every new Selector republish itself as the shared source and clobber the registry.
    foreach (['share_design', 'design_name', 'mirror_source', 'current', 'selector_url'] as $k) {
        ok("preset excludes instance-specific '$k'", !array_key_exists($k, $preset));
    }

    // Every preset key must correspond to a control that is actually registered,
    // otherwise a typo/renamed control would silently do nothing.
    $reg = [];
    foreach (['DCCS\Selector_Widget', 'DCCS\Mini_Entry_Widget'] as $cls) {
        $r = new \ReflectionClass($cls);
        $w = $r->newInstanceWithoutConstructor();
        $m = $r->getMethod('register_controls');
        $m->setAccessible(true);
        $m->invoke($w);
        $reg += $w->__ctrls + $w->__gfields;
    }
    $orphans = array_values(array_diff(array_keys($preset), array_keys($reg)));
    ok('every preset key maps to a registered control' . ($orphans ? ' [' . implode(', ', $orphans) . ']' : ''),
        $orphans === []);

    // apply() must override an inline default (the factory strings) but leave
    // unrelated controls untouched.
    // The map itself is kept intact so the preset can be re-enabled once the editor
    // fatal is diagnosed; only its APPLICATION is switched off.
    ok('map still holds the captured site wording', ($preset['str_q_desk'] ?? null) === 'Do you need a computer desk?');
    ok('map still holds the captured icons', is_array($preset['icon_submit'] ?? null));

    echo "\n$pass passed, $fail failed\n";
    exit($fail ? 1 : 0);
}
