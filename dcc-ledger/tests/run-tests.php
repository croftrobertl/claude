<?php
/**
 * Run every test: php tests/run-tests.php
 */

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/fixtures/mphb-dataset.php';

$only = $argv[1] ?? '';

$suites = [
    'parsers'   => __DIR__ . '/test-parsers.php',
    'import'    => __DIR__ . '/test-import.php',
    'snapshot'  => __DIR__ . '/test-snapshot.php',
    'linking'   => __DIR__ . '/test-linking.php',
    'reports'   => __DIR__ . '/test-reports.php',
    'issues'    => __DIR__ . '/test-issues.php',
    'privacy'   => __DIR__ . '/test-privacy.php',
    'security'  => __DIR__ . '/test-security.php',
    'render'    => __DIR__ . '/test-render.php',
];

foreach ($suites as $name => $file) {
    if ($only !== '' && $only !== $name) {
        continue;
    }
    dccl_reset_db();
    require $file;
}

exit(T::summary());
