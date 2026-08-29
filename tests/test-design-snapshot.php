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
    if (!function_exists('esc_url_raw')) {
        // Pass-through is fine for tests: design_snapshot() only needs it defined.
        function esc_url_raw($url) { return $url; }
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
        // The args are kept, not just the id, so the preset test can check each preset
        // VALUE against the control TYPE it will be handed to.
        public function add_control($id, array $args, $o = []) { $this->__ctrls[$id] = $args; }
        final public function add_responsive_control($id, array $args, $o = []) { $this->__ctrls[$id] = $args; }
        final public function add_group_control($t, array $args = [], array $o = []) {
            foreach ((array) ($args['fields_options'] ?? []) as $f => $fa) {
                $this->__gfields[($args['name'] ?? '') . '_' . $f] = $fa;
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
    // Elementor groups the panel by SLUG, not by title. 'dcc-widgets' is the slug the
    // sibling DCC plugins register on the LIVE install (verified: Guest Guide, Contact
    // Form, Availability Calendar), so sharing it is what puts all the widgets in ONE
    // "Dora Canal Court" section; any other slug silently splits the panel in two.
    ok('category slug is the one shared with the sibling DCC plugins', $selCats === ['dcc-widgets']);
    ok('Mini Entry inherits the category (no duplicated slug to drift)',
        $miniRef->getMethod('get_categories')->getDeclaringClass()->getName() === Selector_Widget::class);

    // The [dcc_selector_entry] shortcode builds its pop-up config WITHOUT a widget,
    // via Config::build(). selector.js reads a MISSING key as "on"
    // (`config.showReview !== false`), so any default the widget sets must also be
    // present here or the shortcode pop-up silently behaves differently.
    $shortcodeCfg = \DCCS\Config::build([], ['highlight' => '22', 'startMode' => 'quick']);
    $widgetCfg    = Selector_Widget::config_from_snapshot(Selector_Widget::design_snapshot([]));
    foreach (['showReview', 'showHeading', 'showCompareTip', 'capacityFeeUrl', 'petFeeUrl'] as $key) {
        ok("shortcode pop-up config declares $key (no silent JS default)", array_key_exists($key, $shortcodeCfg));
        ok("shortcode $key matches the widget default", ($shortcodeCfg[$key] ?? null) === ($widgetCfg[$key] ?? null));
    }
    ok('review step is off by default on both paths', ($shortcodeCfg['showReview'] ?? null) === false);

    // The "pick 2" tip switch: off by default, and a MISSING stored key (every
    // instance placed before 0.21.0) must read as off too.
    ok('compare tip is off by default on both paths', ($shortcodeCfg['showCompareTip'] ?? null) === false);
    ok('snapshot maps a missing show_compare_tip to off',
        Selector_Widget::design_snapshot([])['showCompareTip'] === false);
    ok('snapshot maps show_compare_tip=yes to on',
        Selector_Widget::design_snapshot(['show_compare_tip' => 'yes'])['showCompareTip'] === true);

    // Fee-details URLs (v0.22.0): DEFAULT EMPTY -> no link renders; a set URL
    // control carries through the snapshot to the JS config.
    ok('capacity fee URL defaults empty',
        Selector_Widget::design_snapshot([])['capacityFeeUrl'] === '');
    ok('pet fee URL defaults empty',
        Selector_Widget::design_snapshot([])['petFeeUrl'] === '');
    ok('a set capacity fee URL flows through the snapshot',
        Selector_Widget::design_snapshot(['capacity_fee_url' => ['url' => '/extra-guest-fees/']])['capacityFeeUrl'] === '/extra-guest-fees/');
    ok('a set pet fee URL flows through the snapshot',
        Selector_Widget::design_snapshot(['pet_fee_url' => ['url' => '/pet-policy/']])['petFeeUrl'] === '/pet-policy/');

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

    // ---- after_save must never re-enter Document::get_elements_data() -----------
    // Elementor's get_elements_data(), in edit mode on a document with no elements,
    // calls convert_to_elementor(), whose first statement is save([]) — and save()
    // ends by firing 'elementor/document/after_save'. A handler that answers by
    // calling get_elements_data() therefore recurses forever: save([]) carries no
    // 'elements' key, so save_elements() never runs, _elementor_data stays empty, and
    // the `empty( $elements )` guard never flips. That was the "critical error" on any
    // page opened in the editor with nothing on it (v0.11.0–v0.19.4).
    //
    // The trap document throws if the elements are read from it, so the recursion can
    // only come back as a failure here rather than as a white screen on the site.
    require_once DCCS_DIR . 'includes/class-plugin.php';
    $trapDoc = new class {
        public function get_main_id() { return 123; }
        public function get_elements_data() {
            throw new \RuntimeException('after_save handler re-entered get_elements_data()');
        }
    };
    $plugin = \DCCS\Plugin::instance();
    $selectorEl = [[
        'elType' => 'widget', 'widgetType' => 'dccs_selector', 'id' => 'deadbee',
        'settings' => ['share_design' => 'yes', 'design_name' => 'FromPayload', 'str_heading' => 'Payload'],
    ]];

    $threw = '';
    try {
        // The exact re-entrant call: convert_to_elementor()'s save([]).
        $plugin->republish_designs($trapDoc, []);
        // A settings-only save — also no 'elements' key.
        $plugin->republish_designs($trapDoc, ['settings' => ['post_status' => 'publish']]);
        // A real editor save carrying the tree.
        $plugin->republish_designs($trapDoc, ['elements' => $selectorEl]);
    } catch (\Throwable $e) {
        $threw = $e->getMessage();
    }
    ok('after_save never reads elements off the document' . ($threw ? " [$threw]" : ''), $threw === '');

    $reg4 = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('after_save publishes from the payload Elementor passes', isset($reg4['FromPayload']));
    ok('the published entry is scoped to the saved document', ($reg4['FromPayload']['post_id'] ?? null) === 123);

    // An autosave is a draft; mirroring must follow the saved design, not the draft.
    $plugin->republish_designs($trapDoc, [
        'elements' => [[
            'elType' => 'widget', 'widgetType' => 'dccs_selector', 'id' => 'deadbee',
            'settings' => ['share_design' => 'yes', 'design_name' => 'FromAutosave'],
        ]],
        'settings' => ['post_status' => 'autosave'],
    ]);
    ok('autosaves do not publish a design', !isset(get_option(Selector_Widget::DESIGN_OPTION, [])['FromAutosave']));

    // ---- Registry pruning on save --------------------------------------------
    // A save's payload is the full truth for its document: any registry entry this
    // document owns but no longer publishes (widget deleted, share turned off, or
    // design renamed) must be dropped, or the dead name haunts every Mini Entry's
    // "Mirror design from" dropdown forever. Entries owned by OTHER pages are
    // untouchable. Note the earlier direct publish_design('Main', 123, …) was
    // already pruned by the payload save above, which published only 'FromPayload'.
    ok('a save prunes this page\'s designs the payload no longer publishes',
        !isset(get_option(Selector_Widget::DESIGN_OPTION, [])['Main']));

    Selector_Widget::publish_design('OtherPage', 999, 'el999', $settings);
    $plugin->republish_designs($trapDoc, ['elements' => $selectorEl]);
    $regP = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('pruning never touches designs owned by other pages', isset($regP['OtherPage']));
    ok('the payload\'s own design is kept through a prune', isset($regP['FromPayload']));

    // Renaming: the new name replaces the old one instead of accumulating.
    $renamedEl = $selectorEl;
    $renamedEl[0]['settings']['design_name'] = 'RenamedDesign';
    $plugin->republish_designs($trapDoc, ['elements' => $renamedEl]);
    $regR = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('a renamed design publishes under the new name', isset($regR['RenamedDesign']));
    ok('…and its old name is pruned', !isset($regR['FromPayload']));

    // Turning "Share this design" off: the save publishes nothing, so the page's
    // entry disappears (other pages' entries still survive).
    $offEl = $selectorEl;
    $offEl[0]['settings']['share_design'] = '';
    $plugin->republish_designs($trapDoc, ['elements' => $offEl]);
    $regO = get_option(Selector_Widget::DESIGN_OPTION, []);
    ok('share turned off prunes the page\'s design', !isset($regO['RenamedDesign']));
    ok('share turned off leaves other pages\' designs alone', isset($regO['OtherPage']));

    // Elementor is not the only thing that can fire the action; a one-argument or
    // non-array call must not be an ArgumentCountError/TypeError fatal.
    $survived = true;
    try {
        $plugin->republish_designs($trapDoc);
        $plugin->republish_designs($trapDoc, null);
        $plugin->republish_designs(null, ['elements' => $selectorEl]);
    } catch (\Throwable $e) {
        $survived = false;
    }
    ok('a malformed after_save payload is ignored, not fatal', $survived);

    // ---- Site preset defaults (Preset_Defaults) --------------------------------
    require_once DCCS_DIR . 'includes/class-preset-defaults.php';
    require_once DCCS_DIR . 'includes/class-control-design-io.php';
    require_once DCCS_DIR . 'includes/class-mini-entry-widget.php';
    // The preset is ON (0.19.6). It must actually reach the controls, and — because it
    // OVERRIDES inline defaults by design — it must override them rather than defer.
    ok('preset is enabled by default', \DCCS\Preset_Defaults::enabled() === true);
    ok('apply() overrides an inline factory default',
        \DCCS\Preset_Defaults::apply('str_heading', ['default' => 'Factory'])['default'] === 'Cottage Wizard');
    ok('apply() seeds a control that had no default',
        \DCCS\Preset_Defaults::apply('color_accent', [])['default'] === '#002E7A');
    ok('apply() leaves the rest of the control args intact',
        \DCCS\Preset_Defaults::apply('color_accent', ['label' => 'L', 'type' => 'color'])['label'] === 'L');
    ok('apply() ignores a control the preset says nothing about',
        \DCCS\Preset_Defaults::apply('not_in_preset', ['default' => 'keep']) === ['default' => 'keep']);
    ok('group_fields() feeds typography groups',
        (\DCCS\Preset_Defaults::group_fields('chip_typography')['typography']['default'] ?? null) === 'custom');
    ok('group_fields() is empty for an unknown group', \DCCS\Preset_Defaults::group_fields('nope') === []);

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

    ok('map still holds the captured site wording', ($preset['str_q_desk'] ?? null) === 'Do you need a computer desk?');
    ok('map still holds the captured icons', is_array($preset['icon_submit'] ?? null));

    // Now that the preset is live, every value is handed to Elementor as a control
    // DEFAULT — so its SHAPE has to match what that control type expects. A colour
    // string parked on a SLIDER (or a slider array on a COLOR) is not a PHP error; it
    // surfaces as a broken or dead control in the editor panel, which is exactly the
    // kind of damage a preset captured by hand can do. Check each value against the
    // type of the control it targets.
    $shapeOk = function ($type, $v) {
        switch ($type) {
            case 'color':
            case 'text':
            case 'textarea':
            case 'wysiwyg':
            case 'select':
            case 'switcher':
                return is_string($v);
            case 'slider':
                return is_array($v) && array_key_exists('size', $v) && array_key_exists('unit', $v);
            case 'dimensions':
                return is_array($v) && isset($v['unit'])
                    && isset($v['top'], $v['right'], $v['bottom'], $v['left']);
            case 'icons':
                return is_array($v) && array_key_exists('value', $v) && array_key_exists('library', $v);
            case 'select2':
                return is_array($v) || is_string($v);
            default:
                return true;   // group fields and anything exotic: shape is the group's business
        }
    };
    $badShape = [];
    foreach ($preset as $key => $value) {
        $args = $reg[$key] ?? null;
        if (!is_array($args)) {
            continue;   // group-control field; covered by the orphan check above
        }
        $type = (string) ($args['type'] ?? 'text');
        if (!$shapeOk($type, $value)) {
            $badShape[] = "$key($type)";
        }
    }
    ok('every preset value matches its control type' . ($badShape ? ' [' . implode(', ', $badShape) . ']' : ''),
        $badShape === []);

    // A SELECT default that isn't one of its own options renders as a blank dropdown.
    $badOption = [];
    foreach ($preset as $key => $value) {
        $args = $reg[$key] ?? null;
        if (!is_array($args) || ($args['type'] ?? '') !== 'select' || !isset($args['options'])) {
            continue;
        }
        if (!array_key_exists((string) $value, (array) $args['options'])) {
            $badOption[] = $key;
        }
    }
    ok('every preset SELECT value is one of that control\'s options'
        . ($badOption ? ' [' . implode(', ', $badOption) . ']' : ''), $badOption === []);

    echo "\n$pass passed, $fail failed\n";
    exit($fail ? 1 : 0);
}
