<?php
/**
 * DCC Seasons — a fake WordPress just big enough for the scope gate.
 *
 * Shared by tools/test-scope.php (the matrix) and tools/scope-decide.php
 * (which answers LOAD/SKIP for one page so a browser suite can serve the
 * page the way the site would). One copy, so the two cannot disagree about
 * what a cottage page or a search result looks like.
 *
 * Every stub reads $GLOBALS['REQ']; set it before asking anything.
 *
 * @package DCC_Seasons
 */

class WP_Post { public $ID = 0; public $post_name = ''; public $post_status = 'publish'; }

define('ABSPATH', 1);
define('DCC_SEASONS_VERSION', 'test');
define('DCC_SEASONS_URL', './');
define('DCC_SEASONS_FILE', __DIR__ . '/../dcc-seasons/dcc-seasons.php');

/** The request under test. Every stub below reads this. */
$GLOBALS['FILTERS'] = [];
$GLOBALS['REQ'] = [
    'front' => false, 'page' => false, 'cottage' => false,
    'id' => 0, 'slug' => '', 'path' => '/',
];

function __($s, $d = null) { return $s; }
function esc_html__($s, $d = null) { return $s; }
function esc_attr__($s, $d = null) { return $s; }
function esc_html($s) { return $s; }
function esc_attr($s) { return $s; }
function esc_textarea($s) { return $s; }
/* A filter can be installed for one check ($GLOBALS['FILTERS'][$tag]):
 * the dcc_seasons_in_scope contract is part of what a scope tier promises. */
function apply_filters($tag, $value) {
    $f = $GLOBALS['FILTERS'][$tag] ?? null;
    if (!$f) { return $value; }
    $args = array_slice(func_get_args(), 1);
    return $f(...$args);
}
function do_action() {}
function add_action() {}
function add_filter() {}
function did_action() { return false; }
function sanitize_key($k) { return strtolower(preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) $k)); }
function sanitize_text_field($v) { return trim(strip_tags((string) $v)); }
function wp_unslash($v) { return $v; }
function absint($v) { return abs((int) $v); }
function wp_parse_args($a, $d) { return array_merge($d, is_array($a) ? $a : []); }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function plugin_basename($f) { return basename($f); }
function plugin_dir_url($f) { return './'; }
function get_option($k, $d = false) { return $GLOBALS['OPTIONS'][$k] ?? $d; }
function update_option($k, $v, $a = null) { $GLOBALS['OPTIONS'][$k] = $v; return true; }
function is_front_page() { return (bool) $GLOBALS['REQ']['front']; }
function is_singular($types = '') {
    if (!$GLOBALS['REQ']['cottage']) { return false; }
    $types = (array) $types;
    return in_array('mphb_room_type', $types, true) || $types === [];
}
function is_page($x = '') {
    if (!$GLOBALS['REQ']['page']) { return false; }
    if ($x === '' || $x === []) { return true; }
    foreach ((array) $x as $v) {
        if (is_int($v) || ctype_digit((string) $v)) {
            if ((int) $v === (int) $GLOBALS['REQ']['id']) { return true; }
        } elseif ((string) $v === (string) $GLOBALS['REQ']['slug']) {
            return true;
        }
    }
    return false;
}
/* 4.15.0, Show On: the queried ID (a page or a cottage page), and the
 * site's published pages by ID and by slug ($GLOBALS['PAGES']: id => slug). */
$GLOBALS['PAGES'] = [22 => 'contact', 1005 => 'cottages', 1399 => 'submit-booking', 2393 => 'checkout', 4645 => 'guest', 18102 => 'staff', 18119 => 'explore'];
function get_queried_object_id() { return ($GLOBALS['REQ']['page'] || $GLOBALS['REQ']['cottage']) ? (int) $GLOBALS['REQ']['id'] : 0; }
function get_post($id) {
    $id = (int) $id;
    if (!isset($GLOBALS['PAGES'][$id])) { return null; }
    $p = new \WP_Post(); $p->ID = $id; $p->post_name = $GLOBALS['PAGES'][$id]; $p->post_status = 'publish';
    return $p;
}
function get_page_by_path($slug) {
    $id = array_search((string) $slug, $GLOBALS['PAGES'], true);
    return $id === false ? null : get_post($id);
}
function get_queried_object() {
    if (!$GLOBALS['REQ']['page']) { return null; }
    $p = new \WP_Post();
    $p->ID = (int) $GLOBALS['REQ']['id'];
    $p->post_name = (string) $GLOBALS['REQ']['slug'];
    return $p;
}

require __DIR__ . '/../dcc-seasons/includes/class-schedule.php';
require __DIR__ . '/../dcc-seasons/includes/class-themes.php';
require __DIR__ . '/../dcc-seasons/includes/class-settings.php';
require __DIR__ . '/../dcc-seasons/includes/class-menu.php';
require __DIR__ . '/../dcc-seasons/includes/class-cache-purge.php';
require __DIR__ . '/../dcc-seasons/includes/class-plugin.php';

use DCC_Seasons\Plugin;
use DCC_Seasons\Settings;
