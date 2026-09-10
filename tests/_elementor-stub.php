<?php
/**
 * Minimal Elementor surface so class-widget.php can be loaded outside
 * WordPress. Only the static, dependency-free methods under test are called,
 * so these stubs cannot influence the behaviour being asserted.
 */
namespace Elementor;

class Widget_Base {}
class Repeater {}
class Controls_Manager {}
class Icons_Manager {
    /**
     * Real Elementor echoes an <i>/<svg> for the chosen icon. Emitting a bare
     * <i> keeps the stub honest: it adds markup but never text, which is what
     * the rendered-markup tests measure.
     */
    public static function render_icon($icon, $attrs = []) { echo '<i></i>'; }
}
