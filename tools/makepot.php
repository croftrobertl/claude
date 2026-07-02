<?php
/**
 * Minimal POT generator for the Dora Canal Cottage Selector.
 *
 * Scans the plugin's PHP for WordPress i18n calls (__, esc_html__, esc_attr__,
 * _e, esc_html_e, esc_attr_e, _x, esc_html_x) whose text domain is
 * dcc-cottage-selector and writes a sorted, de-duplicated .pot. No WP-CLI needed.
 *
 * Usage: php tools/makepot.php
 */

$pluginDir = dirname(__DIR__) . '/dcc-cottage-selector';
$domain    = 'dcc-cottage-selector';
$version   = '0.12.0';
$out       = $pluginDir . '/languages/dcc-cottage-selector.pot';

$gettext   = ['__', 'esc_html__', 'esc_attr__', '_e', 'esc_html_e', 'esc_attr_e'];
$gettextX  = ['_x', 'esc_html_x', 'esc_attr_x', '_ex'];

/** @var array<string,array{ctx:?string,refs:string[]}> */
$entries = [];

$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($pluginDir, FilesystemIterator::SKIP_DOTS));
foreach ($it as $file) {
    if ($file->getExtension() !== 'php') {
        continue;
    }
    $rel    = str_replace($pluginDir . '/', '', $file->getPathname());
    $tokens = token_get_all(file_get_contents($file->getPathname()));
    $count  = count($tokens);

    for ($i = 0; $i < $count; $i++) {
        $tok = $tokens[$i];
        if (!is_array($tok) || $tok[0] !== T_STRING) {
            continue;
        }
        $fn = $tok[1];
        $isPlain = in_array($fn, $gettext, true);
        $isCtx   = in_array($fn, $gettextX, true);
        if (!$isPlain && !$isCtx) {
            continue;
        }
        // Next non-whitespace token must be "(".
        $j = $i + 1;
        while ($j < $count && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) {
            $j++;
        }
        if ($tokens[$j] !== '(') {
            continue;
        }
        // First argument: a single string literal.
        $k = $j + 1;
        while ($k < $count && is_array($tokens[$k]) && $tokens[$k][0] === T_WHITESPACE) {
            $k++;
        }
        if (!is_array($tokens[$k]) || $tokens[$k][0] !== T_CONSTANT_ENCAPSED_STRING) {
            continue;
        }
        $msgid = unquote($tokens[$k][1]);

        $context = null;
        if ($isCtx) {
            // _x( msgid, context, domain ) — find the second string literal.
            $m = $k + 1;
            while ($m < $count && $tokens[$m] !== ',') {
                $m++;
            }
            $m++;
            while ($m < $count && is_array($tokens[$m]) && $tokens[$m][0] === T_WHITESPACE) {
                $m++;
            }
            if (is_array($tokens[$m]) && $tokens[$m][0] === T_CONSTANT_ENCAPSED_STRING) {
                $context = unquote($tokens[$m][1]);
            }
        }

        $key = ($context === null ? '' : $context . "\4") . $msgid;
        if (!isset($entries[$key])) {
            $entries[$key] = ['msgid' => $msgid, 'ctx' => $context, 'refs' => []];
        }
        $entries[$key]['refs'][] = $rel . ':' . $tok[2];
    }
}

ksort($entries, SORT_STRING);

$header = "# Dora Canal Cottage Selector\n"
    . "# Copyright (C) 2026 Dora Canal Court\n"
    . "# This file is distributed under GPL-2.0-or-later.\n"
    . "msgid \"\"\nmsgstr \"\"\n"
    . "\"Project-Id-Version: Dora Canal Cottage Selector {$version}\\n\"\n"
    . "\"MIME-Version: 1.0\\n\"\n"
    . "\"Content-Type: text/plain; charset=UTF-8\\n\"\n"
    . "\"Content-Transfer-Encoding: 8bit\\n\"\n"
    . "\"X-Domain: {$domain}\\n\"\n\n";

$body = '';
foreach ($entries as $e) {
    foreach ($e['refs'] as $ref) {
        $body .= "#: {$ref}\n";
    }
    if ($e['ctx'] !== null) {
        $body .= 'msgctxt ' . potQuote($e['ctx']) . "\n";
    }
    $body .= 'msgid ' . potQuote($e['msgid']) . "\n";
    $body .= "msgstr \"\"\n\n";
}

file_put_contents($out, $header . $body);
echo 'Wrote ' . count($entries) . " strings to {$out}\n";

/** Resolve a PHP single/double quoted literal to its runtime string. */
function unquote(string $raw): string
{
    if ($raw === '') {
        return '';
    }
    $q = $raw[0];
    $inner = substr($raw, 1, -1);
    if ($q === "'") {
        return str_replace(["\\'", '\\\\'], ["'", '\\'], $inner);
    }
    return stripcslashes($inner);
}

/** Escape a string for a POT msgid/msgctxt. */
function potQuote(string $s): string
{
    $s = str_replace(['\\', '"', "\n", "\t"], ['\\\\', '\\"', '\\n', '\\t'], $s);
    return '"' . $s . '"';
}
