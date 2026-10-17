<?php
/**
 * WordPress + the plugin, loaded the way render.php needs them (0.46.7: split
 * out so the WP-CLI script's test can boot the same site).
 *
 *   $dir = '<plugin_dir>'; require __DIR__ . '/boot.php';
 */
// ---- WordPress, as far as rendering a widget needs ------------------------
// Defined BEFORE the shared bootstrap, whose own versions are guarded by
// function_exists: Elementor IS loaded here, and an editor can see the board.
function did_action($t) { return $t === 'elementor/loaded' ? 1 : 0; }
function is_user_logged_in() { return !empty($GLOBALS['r_staff_user']); }
function current_user_can($c) { return !empty($GLOBALS['r_staff_user']); }
require dirname(__DIR__) . '/bootstrap.php';

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

// MOTOPRESS'S RULE ENGINE (0.47.4), with live's rules as the WD read them on
// 2026-10-17: one 2-night minimum for every cottage and season, nothing else,
// and live's four seasons. MPHB() is the harness's (it was a bare stdClass).
require dirname(__DIR__) . '/mphb-rules-harness.php';
$GLOBALS['t_options']['mphb_min_stay_length'] = [['season_ids' => [0], 'room_type_ids' => [0], 'min_stay_length' => 2]];
foreach ([[2080, '2025-12-31', '2027-03-31'], [2082, '2025-04-15', '2025-12-15'], [2079, '2024-12-15', '2025-04-15'], [2081, '2024-04-15', '2024-12-15']] as [$sid, $a, $b]) {
    t_mphb_season($sid, $a, $b);
}

require __DIR__ . '/elementor-emu.php';
require rtrim($dir, '/') . '/mphb-availability-calendar.php';
\Elementor\Plugin::$emu_types = ['mphbac_calendar' => \MPHBAC\Widget::class, 'dccac_single' => \MPHBAC\Widget_Single::class,
    'dccac_staff' => \MPHBAC\Staff_Elementor::class];

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
// 0.47.4: a real database and booking rules behind the page and the endpoint.
if (getenv('MPHBAC_FIXTURE_0474')) {
    require __DIR__ . '/fixture-0474.php';
}
$GLOBALS['t_posts'][18102]->post_password = 'x';

