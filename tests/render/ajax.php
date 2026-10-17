<?php
/**
 * THE PUBLIC ENDPOINT, OFFLINE (0.47.4).
 *
 *   MPHBAC_FIXTURE_0474=<mode> php tests/render/ajax.php <plugin_dir> <post body>
 *
 * Boots the site as render.php does (boot.php, with fixture-0474.php's
 * database and rules), puts the urlencoded POST body in $_POST and runs the
 * plugin's real Ajax::handle(). Prints what WordPress would send: the JSON
 * envelope. The browser tests route the calendar's admin-ajax.php requests
 * here, so the page talks to the real endpoint end to end.
 */
[$self, $dir, $body] = $argv + [null, null, ''];
require __DIR__ . '/boot.php';

function wp_send_json_success($d = null, $code = null) { echo json_encode(['success' => true, 'data' => $d]); exit(0); }
function wp_send_json_error($d = null, $code = null) { echo json_encode(['success' => false, 'data' => $d]); exit(0); }
if (!function_exists('nocache_headers')) { function nocache_headers() {} }
if (!function_exists('wp_unslash')) { function wp_unslash($v) { return $v; } }

parse_str((string) $body, $post);
$_POST = $post;
\MPHBAC\Ajax::handle();
