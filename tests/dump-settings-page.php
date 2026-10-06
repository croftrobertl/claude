<?php
/** Prints the settings page's markup for the jsdom suite. Args: key=value as $_GET. */
require __DIR__ . '/settings-page-stubs.php';
foreach (array_slice($argv, 1) as $kv) { [$k, $v] = array_pad(explode('=', $kv, 2), 2, ''); $_GET[$k] = $v; }
\DCCS\Settings_Page::render();
