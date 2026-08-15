<?php
/**
 * Emit the exact data-config JSON the Selector widget would render, so the DOM
 * smoke test exercises the real cottage data and the real translatable strings.
 * Run: php tests/dump-config.php
 */
define('ABSPATH', sys_get_temp_dir() . '/');
define('DCCS_DIR', __DIR__ . '/../dcc-cottage-selector/');
if (!function_exists('__')) {
    function __($text, $domain = null) { return $text; }
}

require DCCS_DIR . 'includes/class-data.php';
require DCCS_DIR . 'includes/class-config.php';

echo json_encode(\DCCS\Config::build([], [
    'startMode'    => 'quick',
    'enabledModes' => ['quick', 'weights', 'compare'],
    'showHeading'  => true,
    'remember'     => true,
]));
