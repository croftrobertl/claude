<?php
/**
 * The widget's DEFAULT field definitions — Rob's picks 3 and 4 (2026-11-03).
 *
 *   php dcc-contact-form/tests/widget-defaults-test.php
 *
 * These are what a NEW placement of the widget starts from. A widget already
 * placed on a page carries its own stored copy in the page's Elementor data,
 * which overrides every one of these; see the release notes for the keys.
 *
 * Elementor is stubbed just far enough to let register_controls() run and to
 * record what it registered. Not shipped in the plugin zip.
 */

namespace {
    define('ABSPATH', __DIR__ . '/');
    $GLOBALS['OPT'] = [];

    function __($t, $d = null) { return $t; }
    function _x($t, $c = '', $d = null) { return $t; }
    function esc_html__($t, $d = null) { return htmlspecialchars($t, ENT_QUOTES); }
    function esc_attr__($t, $d = null) { return htmlspecialchars($t, ENT_QUOTES); }
    function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
    function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
    function esc_url($u) { return $u; }
    function sanitize_text_field($s) { return trim(strip_tags((string) $s)); }
    function get_option($k, $d = false) { return $GLOBALS['OPT'][$k] ?? $d; }
    function update_option($k, $v, $a = null) { $GLOBALS['OPT'][$k] = $v; return true; }
    function apply_filters($t, $v) { return $v; }
    function home_url($p = '') { return 'https://doracanalcourt.com' . $p; }
    function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
}

/* ---- The smallest Elementor that register_controls() can run against. ---- */
namespace Elementor {

    class Controls_Manager
    {
        const TEXT = 'text';
        const TEXTAREA = 'textarea';
        const NUMBER = 'number';
        const SELECT = 'select';
        const SWITCHER = 'switcher';
        const REPEATER = 'repeater';
        const COLOR = 'color';
        const SLIDER = 'slider';
        const HEADING = 'heading';
        const DIVIDER = 'divider';
        const DIMENSIONS = 'dimensions';
        const RAW_HTML = 'raw_html';
        const TAB_STYLE = 'style';
        const TAB_CONTENT = 'content';
    }

    class Group_Control_Typography
    {
        public static function get_type() { return 'typography'; }
    }

    class Group_Control_Border
    {
        public static function get_type() { return 'border'; }
    }

    /** Records controls so a test can read them back. */
    class Widget_Base
    {
        /** @var array<string,array> */
        public array $recorded = [];

        public function add_control(string $id, array $args = []): void
        {
            $this->recorded[$id] = $args;
        }

        public function add_responsive_control(string $id, array $args = []): void
        {
            $this->recorded[$id] = $args;
        }

        public function add_group_control($type, array $args = []): void
        {
            $this->recorded['group:' . ($args['name'] ?? $type)] = $args;
        }

        public function start_controls_section(string $id, array $args = []): void {}
        public function end_controls_section(): void {}
        public function start_controls_tabs(string $id): void {}
        public function end_controls_tabs(): void {}
        public function start_controls_tab(string $id, array $args = []): void {}
        public function end_controls_tab(): void {}
        public function get_id(): string { return 'stub'; }
    }

    class Repeater extends Widget_Base
    {
        public function get_controls(): array { return $this->recorded; }
    }
}

namespace {

use DCC_Contact\Widget;

define('DCC_CONTACT_VERSION', 'test');
define('DCC_CONTACT_URL', '/u/');
define('DCC_CONTACT_DIR', dirname(__DIR__) . '/');
define('DCC_CONTACT_AJAX_ACTION', 'dcc_contact_submit');
spl_autoload_register(static function (string $c): void {
    if (strncmp($c, 'DCC_Contact\\', 12) !== 0) { return; }
    $f = DCC_CONTACT_DIR . 'includes/class-' . strtolower(str_replace('_', '-', substr($c, 12))) . '.php';
    if (is_readable($f)) { require_once $f; }
});

$pass = 0; $fail = 0;
function check(string $label, $got, $want): void {
    global $pass, $fail;
    if ($got === $want) { $pass++; printf("  ok   %s\n", $label); return; }
    $fail++;
    printf("  FAIL %s\n         got=%s want=%s\n", $label, var_export($got, true), var_export($want, true));
}
function section(string $t): void { echo "\n=== $t ===\n"; }

/* Run the real register_controls() against the stub. */
$widget = new Widget();
$reflection = new ReflectionMethod($widget, 'register_controls');
$reflection->setAccessible(true);
$reflection->invoke($widget);

$fields = $widget->recorded['fields']['default'] ?? [];
$by_type = [];
foreach ($fields as $row) {
    $by_type[$row['field_type']] = $row;
}

section('the default field set is intact');
check('four fields by default', count($fields), 4);
check('their types and order',
    array_map(static fn($f) => $f['field_type'], $fields),
    ['name', 'email', 'tel', 'textarea']);

section('PICK 3. the message label');
check('the message label is "Enter your message below"',
    $by_type['textarea']['field_label'] ?? null, 'Enter your message below');
check('it is NOT the live wording "Your Message"',
    ($by_type['textarea']['field_label'] ?? '') === 'Your Message', false);
check('the message field is still required, so the asterisk stays',
    $by_type['textarea']['field_required'] ?? null, 'yes');

section('PICK 4. the email and phone hints');
check('email placeholder is the worked example',
    $by_type['email']['field_placeholder'] ?? null, 'name@example.com');
check('phone placeholder is the worked example',
    $by_type['tel']['field_placeholder'] ?? null, '(352) 555-0123');
check('the phone hint uses the (352) area code',
    strpos((string) ($by_type['tel']['field_placeholder'] ?? ''), '(352)') === 0, true);

/* The hints must be HINTS, not prefilled values: a placeholder attribute,
   never a default the visitor would have to clear. */
check('email has no default VALUE',    isset($by_type['email']['field_value']), false);
check('phone has no default VALUE',    isset($by_type['tel']['field_value']), false);

section('the fields these picks must not disturb');
check('the name label is unchanged',   $by_type['name']['field_label'] ?? null, 'Name');
check('the email label is unchanged',  $by_type['email']['field_label'] ?? null, 'Email Address');
check('the phone label is unchanged',  $by_type['tel']['field_label'] ?? null, 'Phone Number');
check('name has no placeholder (its First/Last hints are built in)',
    isset($by_type['name']['field_placeholder']), false);
check('email is still a 50% column',   $by_type['email']['field_width'] ?? null, '50');
check('phone is still a 50% column',   $by_type['tel']['field_width'] ?? null, '50');

section('the label typography control still exists, so a decoration can be set');
check('a Label Typography group is registered',
    isset($widget->recorded['group:label_typography']), true);
check('…targeting the label',
    $widget->recorded['group:label_typography']['selector'] ?? null,
    '{{WRAPPER}} .dcc-label');

printf("\n%s\n", $fail === 0
    ? sprintf('ALL %d CHECKS PASS', $pass)
    : sprintf('%d passed, %d FAILED', $pass, $fail));
exit($fail === 0 ? 0 : 1);

}
