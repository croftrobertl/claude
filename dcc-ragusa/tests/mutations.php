<?php
/**
 * The mutation run: break each guarantee on purpose, and check a test
 * catches it.
 *
 *     php tests/mutations.php
 *
 * Each mutation is applied to a throwaway copy of the plugin and the whole
 * suite runs against the copy. A mutation the suite still passes is a hole
 * in the tests, and is reported as a failure of this run.
 */

declare(strict_types=1);

$plugin = dirname(__DIR__);
$work   = sys_get_temp_dir() . '/dccr-mutations';

$mutations = [
    [
        'name' => 'An existing uploads .htaccess gets quarantined (presence judged, not meaning)',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "\$dangerous = \$base === '.htaccess' ? Htaccess::enables_execution(\$content) : Htaccess::ini_enables_execution(\$content);",
        'to'   => '$dangerous = true;',
    ],
    [
        'name' => 'The first pass does not baseline the uploads control files',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "\$first   = !(bool) State::get('uploads_ht_baselined', false);",
        'to'   => '$first = false;',
    ],
    [
        'name' => 'The .htaccess rule matches the word php instead of a directive that enables it',
        'file' => 'includes/class-htaccess.php',
        'from' => "        \$lines = preg_split('/\\r?\\n/', \$content) ?: [];\n        \$in_files = false;",
        'to'   => "        if (stripos(\$content, 'php') !== false) { return true; }\n        \$lines = preg_split('/\\r?\\n/', \$content) ?: [];\n        \$in_files = false;",
    ],
    [
        'name' => 'A single failed check rolls the update back',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'edits' => [
            ['        if ($first === null) {', '        if (false) {'],
            ["        \$repeated = array_intersect((array) (\$first['failed'] ?? []), \$failed);", '        $repeated = $failed;'],
        ],
    ],
    [
        'name' => 'A host that does not answer counts as a failed update',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "        if (!\$results['host_up']) {",
        'to'   => '        if (false) {',
    ],
    [
        'name' => 'The sealed copy is put back without a syntax check',
        'file' => 'includes/actions/class-restore-guard.php',
        'from' => "        if (str_ends_with(\$rel, '.php')) {",
        'to'   => '        if (false) {',
    ],
    [
        'name' => 'Guard copies can be evicted from the vault',
        'file' => 'includes/class-vault.php',
        'from' => "            if (!empty(\$e['protected']) || in_array(\$e['kind'] ?? '', self::PROTECTED_KINDS, true)) {\n                continue;\n            }",
        'to'   => '',
    ],
    [
        'name' => 'The manifest signature is never checked',
        'file' => 'includes/class-vault.php',
        'from' => "        if (!is_readable(\$sig)) {\n            return false;\n        }",
        'to'   => '        return true;',
    ],
    [
        'name' => 'Emails are sent from staging',
        'file' => 'includes/class-alerts.php',
        'from' => "        if (!Site::is_live() && !self::\$force) {\n            // The page's amber notice",
        'to'   => "        if (false) {\n            // The page's amber notice",
    ],
    [
        'name' => 'The heartbeat URL is written into an event',
        'file' => 'includes/class-heartbeat.php',
        'from' => "        \$result = (\$code >= 200 && \$code < 300) ? 'sent' : 'failed';",
        'to'   => "        \$result = (\$code >= 200 && \$code < 300) ? 'sent' : 'failed';\n        Events::record(Fortress::LOVRIJENAC, Events::INFO, 'ping', \$target, 'pinged ' . \$target);",
    ],
    [
        'name' => 'A new mu-plugin is quarantined instead of reported',
        'file' => 'includes/fortresses/class-minceta.php',
        'from' => "        if (\$where === 'mu') {\n            \$what .= ' ' . __('Nothing legitimately adds a must-use plugin without the site director knowing.', 'dcc-ragusa');\n        }",
        'to'   => "        if (\$where === 'mu') {\n            Quarantine::run(['path' => Site::abspath() . '/' . \$rel, 'reason' => 'mutation']);\n        }",
    ],
    [
        'name' => 'An upload put back on request is not allowlisted',
        'file' => 'includes/actions/class-quarantine.php',
        'from' => "        \$b['uploads_allow'][\$rel] = (int) filesize(\$path);",
        'to'   => '',
    ],
    [
        'name' => 'The raw IP address is stored',
        'file' => 'includes/fortresses/class-bokar.php',
        'from' => "            \$hash    = self::hash_ip(\$ip);",
        'to'   => '            $hash    = $ip;',
    ],
    [
        'name' => 'Recovery abandons a restore whose rename had completed',
        'file' => 'includes/actions/class-restore-guard.php',
        'from' => "                if (self::sha(\$path) === (string) (\$row['after']['sha256'] ?? '-')) {",
        'to'   => '                if (false) {',
    ],
    [
        'name' => 'Secrets are stored in plain text',
        'file' => 'includes/class-crypto.php',
        'from' => "        if (function_exists('sodium_crypto_secretbox')) {\n            return 'sodium';\n        }",
        'to'   => '',
    ],
    [
        'name' => 'uploads/.htaccess is dropped from the guard set',
        'file' => 'includes/fortresses/class-revelin.php',
        'from' => "        \$out['uploads/.htaccess']                     = \$up . '/.htaccess';",
        'to'   => '',
    ],
    [
        'name' => 'The one-hour rollback window is ignored',
        'file' => 'includes/fortresses/class-sveti-ivan.php',
        'from' => "            && (time() - (int) (\$before['started'] ?? 0)) <= self::WINDOW;",
        'to'   => '            && true;',
    ],
];

if (is_dir($work)) {
    DCCR_rm($work);
}
function DCCR_rm(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) {
        $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    }
    @rmdir($dir);
}
function DCCR_copy(string $from, string $to): void
{
    @mkdir($to, 0755, true);
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($from, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
    foreach ($it as $f) {
        $target = $to . '/' . substr($f->getPathname(), strlen($from) + 1);
        $f->isDir() ? @mkdir($target, 0755, true) : copy($f->getPathname(), $target);
    }
}

$failed = 0;
foreach ($mutations as $i => $m) {
    DCCR_rm($work);
    DCCR_copy($plugin, $work);
    $file  = $work . '/' . $m['file'];
    $src   = (string) file_get_contents($file);
    $edits = $m['edits'] ?? [[$m['from'], $m['to']]];
    $bad   = false;
    foreach ($edits as [$from, $to]) {
        $n = substr_count($src, $from);
        if ($n !== 1) {
            echo sprintf("  ERROR  mutation %d (%s): anchor found %d times in %s\n", $i + 1, $m['name'], $n, $m['file']);
            $bad = true;
            break;
        }
        $src = str_replace($from, $to, $src);
    }
    if ($bad) {
        $failed++;
        continue;
    }
    file_put_contents($file, $src);
    $out  = [];
    $code = 0;
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($work . '/tests/run-tests.php') . ' 2>&1', $out, $code);
    $summary = '';
    foreach (array_reverse($out) as $line) {
        if (preg_match('/^\d+ passed, \d+ failed/', $line)) {
            $summary = $line;
            break;
        }
    }
    if ($code === 0) {
        echo sprintf("  NOT CAUGHT  %s (%s)\n", $m['name'], $summary);
        $failed++;
    } else {
        $first = '';
        foreach ($out as $line) {
            if (str_starts_with($line, '  FAIL') || str_starts_with($line, '  ERROR')) {
                $first = trim($line);
                break;
            }
        }
        echo sprintf("  caught      %s\n              %s\n", $m['name'], mb_substr($first, 0, 150));
    }
}
DCCR_rm($work);
echo sprintf("\n%d mutations, %d not caught\n", count($mutations), $failed);
exit($failed === 0 ? 0 : 1);
