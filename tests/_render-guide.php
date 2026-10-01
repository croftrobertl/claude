<?php
/**
 * Render the WHOLE widget through its real render(), with every setting at
 * the default its own Elementor control declares, plus per-call overrides.
 * Elementor's control registry is stubbed only far enough to COLLECT those
 * defaults; nothing here produces markup. Used by layout.test.php.
 *
 *   require this file, then: dccgg_render_guide(array $overrides): string
 */
namespace Elementor {
    class Controls_Manager {
        const TAB_CONTENT = 'content'; const TAB_STYLE = 'style';
        const CHOOSE = 'choose'; const COLOR = 'color'; const DIMENSIONS = 'dimensions';
        const GALLERY = 'gallery'; const HEADING = 'heading'; const ICONS = 'icons';
        const MEDIA = 'media'; const NUMBER = 'number'; const RAW_HTML = 'raw_html';
        const REPEATER = 'repeater'; const SELECT = 'select'; const SLIDER = 'slider';
        const SWITCHER = 'switcher'; const TEXT = 'text'; const TEXTAREA = 'textarea';
        const URL = 'url'; const WYSIWYG = 'wysiwyg';
    }
    abstract class Group_Control_Base { public static function get_type() { return static::class; } }
    class Group_Control_Background extends Group_Control_Base {}
    class Group_Control_Border extends Group_Control_Base {}
    class Group_Control_Box_Shadow extends Group_Control_Base {}
    class Group_Control_Typography extends Group_Control_Base {}
    class Icons_Manager { public static function render_icon($icon, $attrs = []) { echo '<i></i>'; } }
    class Repeater {
        private $c = [];
        public function add_control($id, $args) { $this->c[$id] = $args; }
        public function get_controls() { return $this->c; }
    }
    class Widget_Base {
        public $__defaults = [];
        public $__overrides = [];
        public function __construct($data = [], $args = null) {}
        protected function add_control($id, $args) {
            if (array_key_exists('default', $args)) { $this->__defaults[$id] = $args['default']; }
        }
        protected function add_responsive_control($id, $args) { $this->add_control($id, $args); }
        protected function add_group_control($type, $args) {}
        protected function start_controls_section($id, $args = []) {}
        protected function end_controls_section() {}
        protected function start_controls_tabs($id, $args = []) {}
        protected function end_controls_tabs() {}
        protected function start_controls_tab($id, $args = []) {}
        protected function end_controls_tab() {}
        public function get_settings_for_display($key = null) {
            $s = array_merge($this->__defaults, $this->__overrides);
            return $key === null ? $s : ($s[$key] ?? null);
        }
        public function get_id() { return 'abc1234'; }
        public function get_name() { return 'dccgg_guide'; }
    }
}

namespace DCCGG {
    // render() asks only one thing of the Plugin singleton: whether Elementor
    // and MotoPress are present. The real class registers WordPress hooks in
    // its constructor, so a one-method stand-in is used instead.
    if (!class_exists('DCCGG\\Plugin')) {
        final class Plugin {
            public static function instance() { static $i; return $i ?: ($i = new self()); }
            public function dependencies_present() { return true; }
        }
    }
}

namespace {
    if (!defined('ABSPATH'))        define('ABSPATH', '/tmp/');
    if (!defined('DCCGG_VERSION'))  define('DCCGG_VERSION', 'test');
    if (!defined('DCCGG_URL'))      define('DCCGG_URL', 'https://example.test/wp-content/plugins/dcc-guest-guide/');
    if (!defined('DCCGG_DIR'))      define('DCCGG_DIR', __DIR__ . '/../dcc-guest-guide/');
    $GLOBALS['options'] = $GLOBALS['options'] ?? [];
    $stub = [
        '__' => fn($s, $d = null) => $s, 'esc_html__' => fn($s, $d = null) => $s, 'esc_attr__' => fn($s, $d = null) => $s,
        '_x' => fn($s, $c = null, $d = null) => $s, '_n' => fn($a, $b, $n, $d = null) => $n == 1 ? $a : $b,
        'esc_html' => fn($s) => htmlspecialchars((string) $s, ENT_QUOTES),
        'esc_attr' => fn($s) => htmlspecialchars((string) $s, ENT_QUOTES),
        'esc_url' => fn($s) => htmlspecialchars((string) $s, ENT_QUOTES), 'esc_url_raw' => fn($s) => (string) $s,
        'esc_textarea' => fn($s) => htmlspecialchars((string) $s, ENT_QUOTES),
        'wp_strip_all_tags' => fn($s) => strip_tags((string) $s), 'wp_kses_post' => fn($s) => $s,
        'do_shortcode' => fn($s) => $s, 'apply_filters' => fn($t, $v) => $v, 'wpautop' => fn($s) => (string) $s,
        'sanitize_html_class' => fn($s) => preg_replace('/[^A-Za-z0-9_-]/', '', (string) $s),
        'sanitize_title' => fn($s) => strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', (string) $s)),
        'sanitize_key' => fn($s) => strtolower(preg_replace('/[^a-z0-9_\-]/i', '', (string) $s)),
        'absint' => fn($n) => abs((int) $n), 'wp_json_encode' => fn($v, $f = 0) => json_encode($v, $f),
        'admin_url' => fn($p = '') => 'https://example.test/wp-admin/' . $p,
        'home_url' => fn($p = '') => 'https://example.test' . $p, 'get_permalink' => fn($id = 0) => 'https://example.test/explore/',
        'get_the_ID' => fn() => 4645, 'get_queried_object_id' => fn() => 4645,
        'wp_create_nonce' => fn($a = '') => 'nonce123', 'is_user_logged_in' => fn() => false,
        'current_user_can' => fn($c) => false, 'get_bloginfo' => fn($k = '') => 'Dora Canal Court',
        'wp_enqueue_style' => fn(...$a) => null, 'wp_enqueue_script' => fn(...$a) => null,
        'wp_style_is' => fn(...$a) => true, 'wp_script_is' => fn(...$a) => true,
        'get_option' => fn($k, $d = false) => $GLOBALS['options'][$k] ?? $d,
        'update_option' => function ($k, $v, $a = null) { $GLOBALS['options'][$k] = $v; return true; },
        'did_action' => fn($h) => 0, 'is_admin' => fn() => false, 'wp_doing_ajax' => fn() => false,
        'date_i18n' => fn($f, $t = null) => date($f, $t ?? time()), 'current_time' => fn($t) => time(),
        'wp_unique_id' => function ($p = '') { static $i = 0; return $p . (++$i); },
        'get_posts' => fn(...$a) => [],
        'wp_kses' => fn($s, ...$a) => (string) $s,
        'esc_html_e' => function ($s, $d = null) { echo htmlspecialchars((string) $s, ENT_QUOTES); },
        'get_locale' => fn() => 'en_US', 'is_rtl' => fn() => false, 'wp_get_attachment_image_url' => fn(...$a) => '',
    ];
    foreach ($stub as $name => $fn) {
        if (!function_exists($name)) {
            $GLOBALS['__stub_' . $name] = $fn;
            eval("function $name(...\$a) { return (\$GLOBALS['__stub_$name'])(...\$a); }");
        }
    }
    require_once __DIR__ . '/../dcc-guest-guide/includes/class-settings.php';
    require_once __DIR__ . '/../dcc-guest-guide/includes/class-widget.php';

    function dccgg_render_guide(array $overrides = []): string {
        $w = new \DCCGG\Widget();
        $rc = new ReflectionMethod($w, 'register_controls'); $rc->setAccessible(true); $rc->invoke($w);
        $w->__overrides = $overrides;
        $r = new ReflectionMethod($w, 'render'); $r->setAccessible(true);
        ob_start();
        $r->invoke($w);
        return (string) ob_get_clean();
    }
}
