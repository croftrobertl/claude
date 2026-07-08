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

    // In-memory options store so publish_design()/get_option() can round-trip.
    $GLOBALS['__opts'] = [];
    function get_option($k, $default = false) { return $GLOBALS['__opts'][$k] ?? $default; }
    function update_option($k, $v, $autoload = null) { $GLOBALS['__opts'][$k] = $v; return true; }
}

// Minimal Elementor base so the widget class can load (design_snapshot et al. are
// static and never touch the parent; the Icons_Manager guard is class_exists()'d).
namespace Elementor {
    class Widget_Base {}
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

    echo "\n$pass passed, $fail failed\n";
    exit($fail ? 1 : 0);
}
