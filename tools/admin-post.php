<?php
/**
 * DCC Seasons — what WordPress would store for a posted settings form
 * (4.18.0). Reads a urlencoded POST body (the form's FormData) and prints
 * serialize(Settings::sanitize($_POST['dcc_seasons_options'])) — the bytes
 * update_option() would write. Used by tools/test-admin.js.
 *
 * Usage: DCC_ROOT=<plugin dir> php tools/admin-post.php <body-file> [--json]
 */
putenv('DCC_STUBS_ONLY=1');
$body = file_get_contents($argv[1]);
$json = in_array('--json', $argv, true);
$argv = [$argv[0]];
require __DIR__ . '/render-settings.php';
parse_str($body, $post);
$out = \DCC_Seasons\Settings::sanitize($post['dcc_seasons_options'] ?? []);
echo $json ? json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : serialize($out);
