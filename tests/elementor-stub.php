<?php
/**
 * Minimal Elementor stand-in for the widget classes.
 *
 * IT RECORDS, IT DOES NOT SWALLOW. Every control registered is kept with its
 * args, so a suite can assert on defaults and selectors as the real panel
 * would emit them. A stub that accepted calls and discarded them would let a
 * control be renamed, lose its default, or drop its selectors with nothing
 * noticing — which is the shape of fault this project keeps meeting.
 *
 * Unknown methods are NOT tolerated: __call throws, so a widget reaching for
 * an Elementor API this stub does not model fails loudly instead of silently
 * doing nothing.
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
    const TAB_CONTENT = 'content';
    const TAB_STYLE = 'style';
}

/* Only the two group controls the plugin uses. A third would surface as an
   unknown class rather than as a silently accepted no-op. */
class Group_Control_Typography { public static function get_type() { return 'typography'; } }
class Group_Control_Border { public static function get_type() { return 'border'; } }
class Group_Control_Box_Shadow { public static function get_type() { return 'box-shadow'; } }
class Group_Control_Background { public static function get_type() { return 'background'; } }

class Repeater
{
    public array $controls = [];
    public function add_control($id, array $args = []) { $this->controls[$id] = $args; return $this; }
    public function get_controls() { return $this->controls; }
}

abstract class Widget_Base
{
    /** @var array<string,array> every add_control(), in registration order */
    public array $t_controls = [];
    /** @var array<string,array> every add_group_control() */
    public array $t_groups = [];
    /** @var string[] section ids, in order */
    public array $t_sections = [];
    /** @var array<string,mixed> what get_settings_for_display() returns */
    public array $t_settings = [];

    public function __construct($data = [], $args = null) {}

    public function add_control($id, array $args = [], array $options = [])
    {
        $this->t_controls[$id] = $args;
    }

    public function add_responsive_control($id, array $args = [], array $options = [])
    {
        $args['__responsive'] = true;
        $this->t_controls[$id] = $args;
    }

    public function add_group_control($type, array $args = [], array $options = [])
    {
        $name = $args['name'] ?? $type;
        $this->t_groups[$name] = $args + ['__type' => $type];
    }

    public function start_controls_section($id, array $args = []) { $this->t_sections[] = $id; }
    public function end_controls_section() {}
    public function start_controls_tabs($id, array $args = []) {}
    public function start_controls_tab($id, array $args = []) {}
    public function end_controls_tab() {}
    public function end_controls_tabs() {}

    public function get_settings_for_display($key = null)
    {
        if ($key === null) { return $this->t_settings; }
        return $this->t_settings[$key] ?? null;
    }

    public function get_id() { return 'stubid'; }
    public function get_name() { return 'stub'; }

    /**
     * Anything not modelled above is a hole in this stub, not a no-op.
     */
    public function __call($name, $args)
    {
        throw new \BadMethodCallException(
            'elementor-stub: unmodelled Elementor API called: ' . static::class . '::' . $name . '()'
        );
    }
}
