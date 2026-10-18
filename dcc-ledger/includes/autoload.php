<?php
/**
 * Lazy autoloader for the DCCL\ namespace.
 *
 * Nothing in this plugin runs work on load — the autoloader only maps class
 * names to files. DCCL\Parsers\Foo_Bar lives in includes/parsers/class-foo-bar.php.
 */

if (!defined('ABSPATH')) {
    exit;
}

spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'DCCL\\', 5) !== 0) {
        return;
    }
    $short = substr($class, 5);
    $dir   = 'includes/';
    if (strncmp($short, 'Parsers\\', 8) === 0) {
        $short = substr($short, 8);
        $dir  .= 'parsers/';
    }
    $file = DCCL_DIR . $dir . 'class-' . strtolower(str_replace('_', '-', $short)) . '.php';
    if (is_readable($file)) {
        require_once $file;
    }
});
