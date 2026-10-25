<?php
/**
 * A WP-CLI stub for the suite: logs are captured, error() throws, and
 * format_items() records the rows it was given.
 */

namespace {
    if (!class_exists('WP_CLI')) {
        final class WP_CLI_Error extends \RuntimeException {}
        final class WP_CLI
        {
            public static function log(string $s): void { $GLOBALS['dccr_cli'][] = ['log', $s]; }
            public static function line(string $s = ''): void { $GLOBALS['dccr_cli'][] = ['log', $s]; }
            public static function success(string $s): void { $GLOBALS['dccr_cli'][] = ['success', $s]; }
            public static function warning(string $s): void { $GLOBALS['dccr_cli'][] = ['warning', $s]; }
            public static function error(string $s): void { $GLOBALS['dccr_cli'][] = ['error', $s]; throw new WP_CLI_Error($s); }
            public static function add_command(string $n, $c): void {}
        }
    }
    $GLOBALS['dccr_cli'] = [];
    function dccr_cli_reset(): void { $GLOBALS['dccr_cli'] = []; $GLOBALS['dccr_cli_items'] = []; }
    function dccr_cli_text(): string { return implode("\n", array_map(static fn($l) => $l[1], $GLOBALS['dccr_cli'])); }
}

namespace WP_CLI\Utils {
    function format_items(string $format, array $items, $fields): void
    {
        $GLOBALS['dccr_cli_items'] = ['format' => $format, 'items' => $items, 'fields' => $fields];
        $GLOBALS['dccr_cli'][]     = ['log', $format === 'json' ? (string) json_encode($items) : count($items) . ' rows'];
    }
}
