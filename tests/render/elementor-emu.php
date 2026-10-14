<?php
/**
 * AN ELEMENTOR EMULATOR FOR RENDERING A WIDGET FROM STORED SETTINGS (0.46.6).
 *
 * tests/elementor-stub.php RECORDS controls; this one RESOLVES them, the way
 * Elementor does on a live page, so a widget can be rendered from the
 * settings exported from live and its per-post CSS generated:
 *
 *   - DEFAULT MERGING (Controls_Stack::get_init_settings). Every data control
 *     gets its stored value if the key is SET (an empty string is set), else
 *     its default. Slider / dimensions / icons merge the stored array over
 *     the type's default array over the control's default array.
 *   - RESPONSIVE CONTROLS become three controls: id, id_tablet, id_mobile,
 *     each defaulting to its {device}_default.
 *   - GROUP CONTROLS expand into their fields, named {name}_{field}. The
 *     typography group is a POPOVER: every field carries the condition
 *     {name}_typography != '' — so a stored font weight with no "custom"
 *     toggle is INERT, exactly as on live.
 *   - SECTION CONDITIONS are copied onto every control in the section
 *     (Controls_Stack::get_section_args: 'tab' and 'condition').
 *   - get_settings_for_display() nulls every control whose conditions fail
 *     (get_active_settings).
 *   - PER-POST CSS: every visible data control with selectors and a
 *     non-empty value; an empty {{PLACEHOLDER}} drops that selector (as
 *     Elementor's parse throws and skips it); device controls go inside
 *     @media(max-width:1024px) / (max-width:767px), after the desktop rules;
 *     rules for one selector merge, later properties winning.
 *
 * Breakpoints are Elementor's defaults (tablet 1024, mobile 767). Elementor's
 * own common controls (_margin, _padding, _element_width…) are not the
 * plugin's and are not modelled; they render the same under both versions.
 *
 * Unknown APIs throw, like the recording stub: a widget reaching for
 * something this emulator does not model must fail, not silently no-op.
 */

namespace Elementor;

class Controls_Manager
{
    const TEXT = 'text';
    const NUMBER = 'number';
    const SELECT = 'select';
    const SELECT2 = 'select2';
    const SWITCHER = 'switcher';
    const COLOR = 'color';
    const SLIDER = 'slider';
    const DIMENSIONS = 'dimensions';
    const HEADING = 'heading';
    const RAW_HTML = 'raw_html';
    const ICONS = 'icons';
    const REPEATER = 'repeater';
    const WYSIWYG = 'wysiwyg';
    const POPOVER_TOGGLE = 'popover_toggle';
    const FONT = 'font';
    const SECTION = 'section';
    const TAB_CONTENT = 'content';
    const TAB_STYLE = 'style';

    /** Types that hold a value (Base_Data_Control). The rest are UI only. */
    const DATA = ['text', 'number', 'select', 'select2', 'switcher', 'color', 'slider', 'dimensions',
                  'icons', 'repeater', 'wysiwyg', 'popover_toggle', 'font'];

    /** Base_Data_Control::get_default_value() per type. */
    public static function type_default(string $type)
    {
        switch ($type) {
            case 'slider':     return ['unit' => 'px', 'size' => '', 'sizes' => []];
            case 'dimensions': return ['unit' => 'px', 'top' => '', 'right' => '', 'bottom' => '', 'left' => '', 'isLinked' => true];
            case 'icons':      return ['value' => '', 'library' => ''];
            case 'repeater':   return [];
        }
        return '';
    }

    public static function is_multiple(string $type): bool
    {
        return in_array($type, ['slider', 'dimensions', 'icons'], true);
    }
}

/** The two group controls the plugin uses, with Elementor's own fields. */
class Group_Control_Typography
{
    public static function get_type() { return 'typography'; }

    public static function fields(): array
    {
        $resp = ['responsive' => true];
        return [
            'font_family'     => ['type' => Controls_Manager::FONT, 'selector_value' => 'font-family: "{{VALUE}}", Sans-serif;'],
            'font_size'       => $resp + ['type' => Controls_Manager::SLIDER, 'selector_value' => 'font-size: {{SIZE}}{{UNIT}}'],
            'font_weight'     => ['type' => Controls_Manager::SELECT, 'selector_value' => 'font-weight: {{VALUE}};'],
            'text_transform'  => ['type' => Controls_Manager::SELECT, 'selector_value' => 'text-transform: {{VALUE}}'],
            'font_style'      => ['type' => Controls_Manager::SELECT, 'selector_value' => 'font-style: {{VALUE}}'],
            'text_decoration' => ['type' => Controls_Manager::SELECT, 'selector_value' => 'text-decoration: {{VALUE}}'],
            'line_height'     => $resp + ['type' => Controls_Manager::SLIDER, 'selector_value' => 'line-height: {{SIZE}}{{UNIT}}'],
            'letter_spacing'  => $resp + ['type' => Controls_Manager::SLIDER, 'selector_value' => 'letter-spacing: {{SIZE}}{{UNIT}}'],
            'word_spacing'    => $resp + ['type' => Controls_Manager::SLIDER, 'selector_value' => 'word-spacing: {{SIZE}}{{UNIT}}'],
        ];
    }

    /** The popover: every field is conditioned on its toggle being set. */
    public static function popover(): ?string { return 'typography'; }
}

class Group_Control_Border
{
    public static function get_type() { return 'border'; }

    public static function fields(): array
    {
        return [
            'border' => ['type' => Controls_Manager::SELECT, 'selector_value' => 'border-style: {{VALUE}};'],
            'width'  => ['type' => Controls_Manager::DIMENSIONS, 'responsive' => true,
                         'selector_value' => 'border-width: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};',
                         'condition' => ['border!' => ['', 'none']]],
            'color'  => ['type' => Controls_Manager::COLOR, 'selector_value' => 'border-color: {{VALUE}};',
                         'condition' => ['border!' => ['', 'none']]],
        ];
    }

    public static function popover(): ?string { return null; }
}

class Repeater
{
    public array $controls = [];
    public function add_control($id, array $args = []) { $this->controls[$id] = $args + ['name' => $id]; return true; }
    public function get_controls() { return $this->controls; }
}

class Icons_Manager
{
    public static function render_icon($icon, $attributes = [], $tag = 'i')
    {
        $value = is_array($icon) ? (string) ($icon['value'] ?? '') : '';
        if ($value === '') {
            return false;
        }
        echo '<i aria-hidden="true" class="' . htmlspecialchars($value, ENT_QUOTES) . '"></i>';
        return true;
    }
}

/** Base_Data_Control / Base_UI_Control, as the WP-CLI script meets them. */
class Base_Control { public string $type; public function __construct(string $t) { $this->type = $t; } public function get_settings() { return []; } }
class Base_UI_Control extends Base_Control {}
class Base_Data_Control extends Base_Control
{
    public function get_default_value() { return Controls_Manager::type_default($this->type); }
    public function get_value($control, $settings) { return Widget_Base::emu_value($control, (array) $settings); }
}

class Plugin
{
    public static ?Plugin $instance = null;
    public $editor;
    public $documents;
    public $widgets_manager;
    public $breakpoints;
    public $controls_manager;
    public $elements_manager;
    /** widget type => class, for elements_manager->create_element_instance() */
    public static array $emu_types = [];

    public static function instance(): self
    {
        if (!self::$instance) {
            self::$instance = new self();
            self::$instance->editor = new class { public function is_edit_mode() { return false; } };
            self::$instance->documents = new class { public function get($id) { return null; } };
            self::$instance->widgets_manager = new class { public function get_widget_types($t = null) { return null; } };
            // Elementor's Breakpoints\Manager: 'off' unless something (the CSS
            // writer) switches it for the duration of its work.
            self::$instance->breakpoints = new class {
                private $mode = 'off';
                public function get_responsive_control_duplication_mode() { return $this->mode; }
                public function set_responsive_control_duplication_mode($m) { $this->mode = $m; }
            };
            self::$instance->controls_manager = new class {
                public function get_control($type) {
                    return in_array($type, Controls_Manager::DATA, true) ? new Base_Data_Control($type) : new Base_UI_Control((string) $type);
                }
            };
            self::$instance->elements_manager = new class {
                public function create_element_instance(array $data) {
                    $class = Plugin::$emu_types[$data['widgetType'] ?? ''] ?? null;
                    return $class ? new $class(['id' => $data['id'] ?? '', 'settings' => (array) ($data['settings'] ?? [])]) : null;
                }
            };
        }
        return self::$instance;
    }
}
Plugin::instance();

abstract class Widget_Base
{
    /**
     * THE CONTROLS STACK, AS ELEMENTOR KEEPS IT (Controls_Manager::$stacks):
     * one per widget TYPE, cached for the request, and built in the
     * responsive-duplication mode current at the time.
     *   'off' (Elementor's default, every front-end render): a responsive
     *     control is ONE control; its _tablet/_mobile values are raw stored
     *     keys — no default, no condition applies to them.
     *   'on' (set while the CSS writer parses a post's CSS): one control per
     *     device, each with its {device}_default and the parent's condition.
     * A stack is rebuilt only UPWARD (off → on), never back, so a render that
     * follows a CSS parse in the same request sees the 'on' stack.
     * On the front end and in WP-CLI (not admin) controls with selectors are
     * filed apart as style controls, and get_controls() leaves them out
     * unless Performance::set_use_style_controls(true) — which only the CSS
     * writer calls.
     * @var array<string,array{mode:string,controls:array,style:array}>
     */
    public static array $emu_stacks = [];
    /** Building into this stack right now. */
    protected ?string $emu_building = null;
    protected ?array $emu_section = null;
    protected array $emu_data;

    public function __construct($data = [], $args = null)
    {
        $this->emu_data = is_array($data) ? $data : [];
        $this->emu_data['settings'] = (array) ($this->emu_data['settings'] ?? []);
    }

    public function get_id() { return (string) ($this->emu_data['id'] ?? 'emu'); }
    public function get_data($item = null) { return $item === null ? $this->emu_data : ($this->emu_data[$item] ?? null); }

    public static function emu_mode_rank(string $m): int { return ['off' => 1, 'dynamic' => 2, 'on' => 3][$m] ?? 1; }

    /** Controls_Stack::get_stack(): build on first use, rebuild only upward. */
    protected function emu_stack(): array
    {
        $name = $this->get_name();
        $mode = Plugin::$instance->breakpoints->get_responsive_control_duplication_mode();
        $have = self::$emu_stacks[$name] ?? null;
        if ($have === null || self::emu_mode_rank($have['mode']) < self::emu_mode_rank($mode)) {
            self::$emu_stacks[$name] = ['mode' => $mode, 'controls' => [], 'style' => []];
            $this->emu_building = $name;
            $this->register_controls();
            $this->emu_building = null;
        }
        return self::$emu_stacks[$name];
    }

    // ---- registration -----------------------------------------------------

    public function start_controls_section($id, array $args = [])
    {
        $args['type'] = Controls_Manager::SECTION;
        self::$emu_stacks[$this->emu_building]['controls'][$id] = $args + ['name' => $id];
        $this->emu_section = ['section' => $id];
        if (isset($args['tab'])) { $this->emu_section['tab'] = $args['tab']; }
        if (!empty($args['condition'])) { $this->emu_section['condition'] = $args['condition']; }
    }

    public function end_controls_section() { $this->emu_section = null; }
    public function start_controls_tabs($id, array $args = []) {}
    public function start_controls_tab($id, array $args = []) {}
    public function end_controls_tab() {}
    public function end_controls_tabs() {}

    /** Controls_Manager::is_style_control(): selectors, and not content-bound. */
    protected static function emu_is_style(array $c): bool
    {
        if (!empty($c['frontend_available']) || ($c['control_type'] ?? '') === 'content' || !empty($c['prefix_class'])) {
            return false;
        }
        if (($c['render_type'] ?? '') === 'template') { return false; }
        if (($c['render_type'] ?? '') === 'ui') { return true; }
        return !empty($c['selectors']);
    }

    public function add_control($id, array $args = [], $options = [])
    {
        $st = &self::$emu_stacks[$this->emu_building];
        if (isset($st['controls'][$id]) || isset($st['style'][$id])) {
            throw new \LogicException("elementor-emu: control '$id' registered twice");
        }
        if ($this->emu_section !== null) {
            $args = array_replace_recursive($this->emu_section, $args);
        }
        $args['name'] = $id;
        $st[self::emu_is_style($args) ? 'style' : 'controls'][$id] = $args;
        return true;
    }

    /** Controls_Stack::add_responsive_control(), in both modes. */
    public function add_responsive_control($id, array $args = [], $options = [])
    {
        if (self::$emu_stacks[$this->emu_building]['mode'] !== 'on') {
            $args['is_responsive'] = true;     // device defaults stay as args
            return $this->add_control($id, $args, $options);
        }
        if (array_key_exists('default', $args)) {
            $args['desktop_default'] = $args['default'];
            unset($args['default']);
        }
        foreach (['desktop' => '', 'tablet' => '_tablet', 'mobile' => '_mobile'] as $device => $suffix) {
            $a = $args;
            if (array_key_exists($device . '_default', $a)) {
                $a['default'] = $a[$device . '_default'];
            }
            unset($a['desktop_default'], $a['tablet_default'], $a['mobile_default']);
            $a['responsive'] = $device;
            $this->add_control($id . $suffix, $a, $options);
        }
        return true;
    }

    public function add_group_control($type, array $args = [], array $options = [])
    {
        $class = ['typography' => Group_Control_Typography::class, 'border' => Group_Control_Border::class][$type] ?? null;
        if ($class === null) {
            throw new \BadMethodCallException("elementor-emu: unmodelled group control '$type'");
        }
        $name = (string) $args['name'];
        $popover = $class::popover();
        if ($popover !== null) {
            // Group_Control_Typography's starter: render_type 'ui', which
            // files it with the style controls (Controls_Manager::is_style_control).
            $this->add_control($name . '_' . $popover, ['type' => Controls_Manager::POPOVER_TOGGLE, 'default' => '',
                'return_value' => 'custom', 'render_type' => 'ui']);
        }
        $exclude = (array) ($args['exclude'] ?? []);
        foreach ($class::fields() as $field => $f) {
            if (in_array($field, $exclude, true)) {
                continue;
            }
            $condition = [];
            foreach ((array) ($f['condition'] ?? []) as $k => $v) {
                $condition[$name . '_' . $k] = $v;
            }
            if ($popover !== null) {
                $condition[$name . '_' . $popover . '!'] = '';
            }
            $control = ['type' => $f['type'], 'selectors' => [$args['selector'] => $f['selector_value']]];
            if ($condition) {
                $control['condition'] = $condition;
            }
            if (!empty($f['responsive'])) {
                $this->add_responsive_control($name . '_' . $field, $control);
            } else {
                $this->add_control($name . '_' . $field, $control);
            }
        }
        return true;
    }

    /** Controls_Manager::update_control_in_stack, non-recursive: array_merge. */
    public function update_control($id, array $args, array $options = [])
    {
        $name = $this->emu_building ?? $this->get_name();
        foreach (['controls', 'style'] as $bucket) {
            if (isset(self::$emu_stacks[$name][$bucket][$id])) {
                self::$emu_stacks[$name][$bucket][$id] = array_merge(self::$emu_stacks[$name][$bucket][$id], $args);
                return true;
            }
        }
        return false;
    }

    /** Controls_Stack::get_controls(): style controls only when switched on. */
    public function get_controls($id = null)
    {
        $st = $this->emu_stack();
        if ($id !== null) {
            return $st['controls'][$id] ?? $st['style'][$id] ?? null;
        }
        return \Elementor\Core\Frontend\Performance::is_use_style_controls() ? $st['controls'] + $st['style'] : $st['controls'];
    }

    // ---- settings ---------------------------------------------------------

    /** Base_Data_Control::get_value (and the multiple / repeater variants). */
    public static function emu_value(array $control, array $settings)
    {
        $type = (string) ($control['type'] ?? '');
        $name = (string) $control['name'];
        $default = array_key_exists('default', $control) ? $control['default'] : Controls_Manager::type_default($type);
        $value = isset($settings[$name]) ? $settings[$name] : $default;
        if (Controls_Manager::is_multiple($type)) {
            $base = Controls_Manager::type_default($type);
            $def = is_array($control['default'] ?? null) ? $control['default'] : [];
            $value = array_merge(array_merge($base, $def), is_array($value) && isset($settings[$name]) ? $value : []);
        }
        if ($type === Controls_Manager::REPEATER && is_array($value)) {
            foreach ($value as &$row) {
                foreach ((array) ($control['fields'] ?? []) as $field) {
                    if (in_array($field['type'] ?? '', Controls_Manager::DATA, true)) {
                        $row[$field['name']] = self::emu_value($field, (array) $row);
                    }
                }
            }
            unset($row);
        }
        return $value;
    }

    /** get_init_settings(): stored data, with every data control resolved. */
    public function emu_init_settings(): array
    {
        $settings = $this->emu_data['settings'];
        foreach ($this->get_controls() as $name => $control) {
            if (in_array($control['type'] ?? '', Controls_Manager::DATA, true)) {
                $settings[$name] = self::emu_value($control, $this->emu_data['settings']);
            }
        }
        return $settings;
    }

    /** Controls_Stack::is_control_visible — strict, as Elementor compares;
     *  a condition on a key that has no value at all fails. */
    public static function emu_visible(array $control, array $values): bool
    {
        foreach ((array) ($control['condition'] ?? []) as $key => $want) {
            preg_match('/([a-z_\-0-9]+)(?:\[([a-z_]+)])?(!?)$/i', $key, $m);
            $pure = $m[1];
            $sub = $m[2] ?? '';
            $negative = ($m[3] ?? '') === '!';
            if (!isset($values[$pure])) {
                return false;
            }
            $have = $values[$pure];
            if ($sub !== '' && is_array($have)) {
                $have = $have[$sub] ?? '';
            }
            if (is_array($want) && !empty($want)) {
                $contains = in_array($have, $want, true);
            } elseif (is_array($have) && !empty($have)) {
                $contains = in_array($want, $have, true);
            } else {
                $contains = $have === $want;
            }
            if (($negative && $contains) || (!$negative && !$contains)) {
                return false;
            }
        }
        return true;
    }

    public function get_settings_for_display($key = null)
    {
        $init = $this->emu_init_settings();
        $controls = $this->get_controls();
        $active = [];
        foreach ($init as $k => $v) {
            if (!isset($controls[$k])) {
                $active[$k] = $v;
                continue;
            }
            $active[$k] = self::emu_visible($controls[$k], $init) ? $v : null;
        }
        return $key === null ? $active : ($active[$key] ?? null);
    }

    // ---- per-post CSS -----------------------------------------------------

    /**
     * Post CSS, the way Elementor's Base::parse_content() makes it: style
     * controls switched on, duplication mode 'on' for the parse — which
     * rebuilds this widget type's stack upward — then both put back. The
     * stack STAYS 'on' for the rest of the request, as in Elementor.
     */
    public function emu_css(string $wrapper): string
    {
        $bp = Plugin::$instance->breakpoints;
        $was = $bp->get_responsive_control_duplication_mode();
        \Elementor\Core\Frontend\Performance::set_use_style_controls(true);
        $bp->set_responsive_control_duplication_mode('on');
        try {
            return $this->emu_css_parse($wrapper);
        } finally {
            $bp->set_responsive_control_duplication_mode($was);
            \Elementor\Core\Frontend\Performance::set_use_style_controls(false);
        }
    }

    private function emu_css_parse(string $wrapper): string
    {
        $values = $this->emu_init_settings();
        $rules = ['' => [], 'tablet' => [], 'mobile' => []];
        foreach ($this->get_controls() as $control) {
            if (empty($control['selectors']) || !in_array($control['type'] ?? '', Controls_Manager::DATA, true)) {
                continue;
            }
            if (!self::emu_visible($control, $values)) {
                continue;
            }
            $value = $values[$control['name']] ?? null;
            if (is_string($value) && isset($control['selectors_dictionary'][$value])) {
                $value = $control['selectors_dictionary'][$value];
            }
            if (!is_numeric($value) && empty($value)) {
                continue;
            }
            $device = in_array($control['responsive'] ?? '', ['tablet', 'mobile'], true) ? $control['responsive'] : '';
            foreach ($control['selectors'] as $selector => $template) {
                $ok = true;
                $css = preg_replace_callback('/{{([A-Z]+)}}/', static function ($m) use ($value, &$ok) {
                    $p = $m[1];
                    if ($p === 'VALUE' && !is_array($value)) {
                        $v = $value;
                    } elseif ($p === 'VALUE') {
                        $v = $value['value'] ?? '';
                    } else {
                        $v = is_array($value) ? ($value[strtolower($p)] ?? '') : '';
                    }
                    if ($v === '' || $v === null) {
                        $ok = false;
                        return '';
                    }
                    return (string) $v;
                }, $template);
                if (!$ok) {
                    continue;
                }
                $sel = str_replace('{{WRAPPER}}', $wrapper, $selector);
                foreach (preg_split('/;(?=(?:[^"]*"[^"]*")*[^"]*$)/', $css) as $decl) {
                    $decl = trim($decl);
                    if ($decl === '' || strpos($decl, ':') === false) {
                        continue;
                    }
                    [$prop, $val] = array_map('trim', explode(':', $decl, 2));
                    $rules[$device][$sel][$prop] = $val;
                }
            }
        }
        $out = '';
        foreach (['' => null, 'tablet' => 1024, 'mobile' => 767] as $device => $max) {
            $block = '';
            foreach ($rules[$device] as $sel => $props) {
                $block .= $sel . '{';
                foreach ($props as $p => $v) {
                    $block .= $p . ':' . $v . ';';
                }
                $block .= '}';
            }
            if ($block !== '') {
                $out .= $max === null ? $block : '@media(max-width:' . $max . 'px){' . $block . '}';
            }
        }
        return $out;
    }

    public function __call($name, $args)
    {
        throw new \BadMethodCallException('elementor-emu: unmodelled Elementor API called: ' . static::class . '::' . $name . '()');
    }
}

namespace Elementor\Core\Frontend;

/** Elementor's Performance: style controls are left out of get_controls()
 *  unless switched on (the CSS writer does, for its parse). */
class Performance
{
    private static $use_style_controls = false;
    public static function set_use_style_controls(bool $is_use): void { static::$use_style_controls = $is_use; }
    public static function is_use_style_controls(): bool { return static::$use_style_controls; }
    public static function should_optimize_controls() { return true; }
}
