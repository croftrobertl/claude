<?php
/**
 * The mutation run: break each guarantee on purpose, and check a test catches it.
 *
 *     php tests/mutations.php
 *
 * Each mutation is applied to a throwaway copy of the plugin. A mutation that
 * the suite still passes is a hole in the tests, and is reported as a failure
 * of this run.
 */

declare(strict_types=1);

$plugin  = dirname(__DIR__);
$work    = sys_get_temp_dir() . '/dccl-mutations';

$mutations = [
    [
        'name' => 'A write to MotoPress during linking',
        'file' => 'includes/class-linker.php',
        'from' => '        $bookings = Mphb_Reader::bookings();',
        'to'   => "        global \$wpdb;\n        \$wpdb->insert(\$wpdb->postmeta, ['post_id' => 9001, 'meta_key' => 'dccl_touched', 'meta_value' => '1']);\n        \$bookings = Mphb_Reader::bookings();",
    ],
    [
        'name' => 'An overlap auto-linked instead of an exact match',
        'file' => 'includes/class-linker.php',
        'from' => '        $key  = self::key((string) $stay[\'cottage\'], (string) $stay[\'check_in\'], (string) $stay[\'check_out\']);
        $hits = $index[\'by_dates\'][$key] ?? [];',
        'to'   => '        $hits = [];
        foreach ($index[\'by_dates\'] as $k => $candidates) {
            foreach ($candidates as $candidate) {
                if ((string) $candidate[\'cottage\'] === (string) $stay[\'cottage\'] && self::overlaps($stay, $candidate)) {
                    $hits[] = $candidate;
                }
            }
        }',
    ],
    [
        'name' => 'A cross-channel match auto-linked',
        'file' => 'includes/class-linker.php',
        'from' => '            if ($booking[\'channel\'] !== $stay[\'channel\']) {
                continue;
            }
            $open[] = $booking;',
        'to'   => '            $open[] = $booking;',
    ],
    [
        'name' => 'A guest name stored on the stay',
        'file' => 'includes/parsers/class-airbnb-payout.php',
        'from' => "                    'ok'\n                ));",
        'to'   => "                    'ok',\n                    null,\n                    ['guest' => (string) (\$row['Guest'] ?? '')]\n                ));",
    ],
    [
        'name' => 'A Crofty Bear row included',
        'file' => 'includes/parsers/class-bookingcom-reservations.php',
        'from' => '            if ($this->is_excluded($cottage)) {
                $result[\'counts\'][\'excluded\']++;
                continue;
            }',
        'to'   => '            if ($this->is_excluded($cottage)) {
                $cottage = \'34\';
            }',
    ],
    [
        'name' => 'A hand-typed copy counted a second time',
        'file' => 'includes/class-reports.php',
        'from' => '            if (isset($copies[(int) $booking[\'id\']])) {',
        'to'   => '            if (false && isset($copies[(int) $booking[\'id\']])) {',
    ],
    [
        'name' => 'A moved-cottage copy auto-linked without asking',
        'file' => 'includes/class-linker.php',
        'from' => '                $key   = self::key((string) $booking[\'cottage\'], (string) $booking[\'check_in\'], (string) $booking[\'check_out\']);
                $exact = $by_key[$key] ?? [];',
        'to'   => '                $exact = [];
                foreach ($by_key as $k => $candidates) {
                    [$c, $in, $out] = explode(\'|\', $k);
                    if ($in === (string) $booking[\'check_in\'] && $out === (string) $booking[\'check_out\']) {
                        foreach ($candidates as $candidate) {
                            $exact[] = $candidate;
                        }
                    }
                }',
    ],
    [
        'name' => 'A same-cottage copy no longer raised on the cleanup list',
        'file' => 'includes/class-issues.php',
        'from' => '        self::handtyped_matches($items, $stays, $links, $bookings);',
        'to'   => '        // removed',
    ],
    [
        'name' => 'An assumed payment reported as recorded',
        'file' => 'includes/class-mphb-reader.php',
        'from' => '            if ($assumed) {
                $out[$id][\'assumed\'] += $amount;
            } else {
                $out[$id][\'recorded\'] += $amount;
            }',
        'to'   => '            $out[$id][\'recorded\'] += $amount;',
    ],
    [
        'name' => 'A payment on a copy counted as money received',
        'file' => 'includes/class-reports.php',
        'from' => '                    $out[\'copy_payments\'] = round($out[\'copy_payments\'] + (float) $booking[\'paid_recorded\'], 2);',
        'to'   => '                    $out[\'copy_payments\'] = round($out[\'copy_payments\'] + (float) $booking[\'paid_recorded\'], 2);
                    $out[\'recorded\']      = round($out[\'recorded\'] + (float) $booking[\'paid_recorded\'], 2);',
    ],
    [
        'name' => 'Airbnb-remitted tax added to revenue',
        'file' => 'includes/class-reports.php',
        'from' => '        $room_revenue = round($ota[\'guest_total\'] - $ota[\'tax_in_payout\'] - $ota[\'tax_platform_remitted\'], 2);',
        'to'   => '        $room_revenue = round($ota[\'guest_total\'] - $ota[\'tax_in_payout\'], 2);',
    ],
    [
        'name' => "Vrbo's missing tax shown as $0 rather than unknown",
        'file' => 'includes/class-reports.php',
        'from' => '            if ((int) $row[\'stays\'] > 0 && round((float) $row[\'tax\'], 2) == 0.0) {',
        'to'   => '            if (false) {',
    ],
    [
        'name' => 'A hash that changes between imports',
        'file' => 'includes/class-repo.php',
        'from' => "            'seq'        => \$seq,",
        'to'   => "            'seq'        => \$seq,\n            'nonce'      => random_int(1, PHP_INT_MAX),",
    ],
    [
        'name' => 'Undo deleting rows it did not insert',
        'file' => 'includes/class-batches.php',
        'from' => '            $wpdb->prepare("DELETE FROM {$lines_t} WHERE source_batch = %d", $batch_id)',
        'to'   => '            "DELETE FROM {$lines_t}"',
    ],
    [
        'name' => 'The uploaded file left on disk',
        'file' => 'includes/class-admin.php',
        'from' => '        } finally {
            if (file_exists($temp)) {
                @unlink($temp);
            }
        }',
        'to'   => '        } finally {
            // mutation: the file is kept
        }',
    ],
    [
        'name' => 'A missing capability check',
        'file' => 'includes/class-admin.php',
        'from' => '        if (!current_user_can(self::CAP)) {
            wp_die(esc_html__(\'You do not have permission to do that.\', \'dcc-ledger\'), \'\', [\'response\' => 403]);
        }
        check_admin_referer(self::NONCE);
    }',
        'to'   => '        check_admin_referer(self::NONCE);
    }',
    ],
];

$caught = 0;
$missed = [];

echo "Mutation run\n";
echo str_repeat('=', 60) . "\n";

foreach ($mutations as $index => $mutation) {
    // Fresh copy of the plugin for each mutation.
    if (is_dir($work)) {
        exec('rm -rf ' . escapeshellarg($work));
    }
    exec(sprintf('cp -r %s %s', escapeshellarg($plugin), escapeshellarg($work)));

    $target = $work . '/' . $mutation['file'];
    $source = (string) file_get_contents($target);

    if (!str_contains($source, $mutation['from'])) {
        $missed[] = $mutation['name'] . ' — the mutation did not apply (the code it patches has moved)';
        echo sprintf("  ?? %-58s could not be applied\n", $mutation['name']);
        continue;
    }

    file_put_contents(
        $target,
        str_replace($mutation['from'], $mutation['to'], $source)
    );

    // The temp-file mutation also needs the shutdown safety net removed, or
    // the file is cleaned up anyway and the mutation proves nothing.
    if (str_contains($mutation['name'], 'uploaded file')) {
        $admin = $work . '/includes/class-admin.php';
        $text  = (string) file_get_contents($admin);
        $text  = preg_replace('/register_shutdown_function\(static function[^;]+;\s*\}\);/s', '', $text) ?? $text;
        file_put_contents($admin, $text);
    }

    $output = [];
    $status = 0;
    exec(
        sprintf(
            'DCCL_TEST_DIR=%s php %s 2>&1',
            escapeshellarg($work),
            escapeshellarg(__DIR__ . '/run-tests.php')
        ),
        $output,
        $status
    );

    $tail = '';
    foreach ($output as $line) {
        if (str_contains($line, 'failed')) {
            $tail = trim($line);
        }
    }

    if ($status !== 0) {
        $caught++;
        echo sprintf("  OK %-58s caught (%s)\n", $mutation['name'], $tail !== '' ? $tail : 'fatal error');
        continue;
    }

    $missed[] = $mutation['name'];
    echo sprintf("  !! %-58s NOT CAUGHT\n", $mutation['name']);
}

if (is_dir($work)) {
    exec('rm -rf ' . escapeshellarg($work));
}

echo str_repeat('=', 60) . "\n";
echo sprintf("%d of %d mutations caught\n", $caught, count($mutations));
foreach ($missed as $miss) {
    echo '  - ' . $miss . "\n";
}

exit($missed === [] ? 0 : 1);
