<?php
/**
 * Minimal WordPress + MotoPress stubs for the plugin's PHP harnesses.
 *
 * WHY THIS LIVES IN THE REPOSITORY. Every harness this project has ever had
 * was written into the session scratchpad, which is ephemeral: on
 * 2026-09-17 a container recycle deleted all 31 of them at once, after
 * fourteen releases had been verified with them. Tests that are load-bearing
 * belong in version control. They sit OUTSIDE mphb-availability-calendar/ so
 * the release zip, which is built from that directory, stays clean.
 *
 * STUBS MUST NOT BE MORE FORGIVING THAN PRODUCTION. This project's own notes
 * record a missing MPHB() stub hiding two N+1s. Where a real function would
 * fail, fail the same way here.
 */

$GLOBALS['t_meta']  = [];   // post_id => [key => value]
$GLOBALS['t_posts'] = [];   // post_id => WP_Post-ish
$GLOBALS['t_calls'] = [];   // function name => count

if (!defined('ABSPATH')) { define('ABSPATH', __DIR__); }
if (!defined('HOUR_IN_SECONDS')) { define('HOUR_IN_SECONDS', 3600); }

function t_count(string $fn): void { $GLOBALS['t_calls'][$fn] = ($GLOBALS['t_calls'][$fn] ?? 0) + 1; }
function t_reset(): void { $GLOBALS['t_calls'] = []; }

function t_post(int $id, string $type, string $status = 'publish', string $title = '', array $meta = []): void {
    $GLOBALS['t_posts'][$id] = (object) [
        'ID' => $id, 'post_type' => $type, 'post_status' => $status,
        'post_title' => $title, 'post_parent' => 0,
    ];
    $GLOBALS['t_meta'][$id] = $meta;
}

function get_post($id) { return $GLOBALS['t_posts'][(int) $id] ?? null; }

function get_post_meta($id, $key = '', $single = false) {
    t_count('get_post_meta');
    $all = $GLOBALS['t_meta'][(int) $id] ?? [];
    if ($key === '') {
        // WordPress returns EVERY value as an array, even single ones. Getting
        // this wrong makes a harness kinder than production.
        $out = [];
        foreach ($all as $k => $v) { $out[$k] = [$v]; }
        return $out;
    }
    if (!array_key_exists($key, $all)) { return $single ? '' : []; }
    return $single ? $all[$key] : [$all[$key]];
}

function get_posts(array $args = []) {
    t_count('get_posts');
    $type   = $args['post_type'] ?? 'post';
    $parent = $args['post_parent'] ?? null;
    $incl   = $args['post__in'] ?? null;
    $fields = $args['fields'] ?? '';
    $out = [];
    foreach ($GLOBALS['t_posts'] as $id => $p) {
        if ($p->post_type !== $type) { continue; }
        if ($parent !== null && (int) $p->post_parent !== (int) $parent) { continue; }
        if ($incl !== null && !in_array((int) $id, array_map('intval', (array) $incl), true)) { continue; }
        $out[] = $fields === 'ids' ? (int) $id : $p;
    }
    return $out;
}

function maybe_unserialize($v) { return is_string($v) && @unserialize($v) !== false ? unserialize($v) : $v; }
function apply_filters($tag, $value, ...$rest) { return $value; }
function __($t, $d = '') { return $t; }
function _n($s, $p, $n, $d = '') { return $n === 1 ? $s : $p; }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function absint($v) { return abs((int) $v); }
function wp_json_encode($v) { return json_encode($v); }
function get_permalink($id) { return 'https://example.test/?p=' . (int) $id; }
function sanitize_text_field($t) { return trim(strip_tags((string) $t)); }

$GLOBALS['t_options'] = [];
if (!function_exists('get_option')) {
    function get_option($k, $default = false) { return $GLOBALS['t_options'][$k] ?? $default; }
}
if (!function_exists('update_option')) {
    function update_option($k, $v, $auto = null) { $GLOBALS['t_options'][$k] = $v; return true; }
}
if (!function_exists('add_option')) {
    function add_option($k, $v, $d = '', $auto = null) { $GLOBALS['t_options'][$k] = $v; return true; }
}
if (!function_exists('wp_cache_get')) {
    function wp_cache_get($k, $g = '') { return false; }
}
if (!function_exists('wp_cache_set')) {
    function wp_cache_set($k, $v, $g = '', $t = 0) { return true; }
}
if (!function_exists('did_action')) {
    function did_action($t) { return 0; }
}
if (!function_exists('is_user_logged_in')) {
    function is_user_logged_in() { return false; }
}
if (!function_exists('current_user_can')) {
    function current_user_can($c) { return false; }
}
if (!function_exists('post_password_required')) {
    function post_password_required($p = null) { return false; }
}
if (!function_exists('get_the_title')) {
    function get_the_title($id = 0) { $p = get_post($id); return $p ? $p->post_title : ''; }
}
