<?php
/**
 * MUTATION CHECK. "A harness that cannot fail is worse than none."
 *
 * Each entry below breaks ONE guarded behaviour in the plugin source and
 * expects a named suite to go red. A mutation that survives means the
 * assertion protecting it does not actually test it — which is exactly the
 * failure the Custom Checkout button-colour assertion had for weeks.
 *
 * Run: php tests/mutate.php        (restores every file, even on Ctrl-C)
 */
$root  = dirname(__DIR__);
$plugin = $root . '/mphb-availability-calendar/includes/';

$mutations = [
    // --- rule 1: the photo ID -------------------------------------------
    ['staff panel: photo ID matches on the key alone again', 'class-staff-data.php',
     "if (!is_scalar(\$val) || self::is_blank(trim((string) \$val))) {\n            return false;\n        }",
     "if (false) {\n            return false;\n        }",
     'staff-panel-test.php'],

    // --- rule 2: money --------------------------------------------------
    ['staff panel: money rows render without a price', 'class-staff-data.php',
     '$has_price = ($total_f !== null && $total_f > 0);',
     '$has_price = true;',
     'staff-panel-test.php'],
    ['staff panel: Balance Due stops rendering when paid off', 'class-staff-data.php',
     "            self::push(\$out, __('Balance Due', 'mphb-availability-calendar'), self::money(\$owed), ['money' => true]);",
     "            if (\$owed > 0) { self::push(\$out, __('Balance Due', 'mphb-availability-calendar'), self::money(\$owed), ['money' => true]); }",
     'staff-panel-test.php'],
    ['staff panel: Total and Paid render even when nothing is owed', 'class-staff-data.php',
     '            if ($owed > 0) {
                self::push($out, __(\'Total\', \'mphb-availability-calendar\'), self::money($total), [\'money\' => true]);',
     '            if (true) {
                self::push($out, __(\'Total\', \'mphb-availability-calendar\'), self::money($total), [\'money\' => true]);',
     'staff-panel-test.php'],

    // --- rule 4: the guest count ----------------------------------------
    ['staff panel: the confirmed-count marker is ignored', 'class-staff-data.php',
     'return $found ? [\'adults\' => $adults, \'children\' => $children] : null;',
     'return null;',
     'staff-panel-test.php'],
    ['staff panel: every imported count is treated as the capacity default', 'class-staff-data.php',
     'return $capacity === 0 || $adults === $capacity;',
     'return true;',
     'staff-panel-test.php'],

    // --- rule 5: the pet gate -------------------------------------------
    ['staff panel: the pet block is ungated', 'class-staff-data.php',
     'if (!self::is_blank($dog_type) || self::has_pet_service(self::reserved_entities($id, $b))) {',
     'if (true) {',
     'staff-panel-test.php'],
    ['staff panel: a non-pet service counts as a pet fee', 'class-staff-data.php',
     "if (preg_match('/\\b(pet|dog)/i', (string) \$post->post_title)) {",
     'if (true) {',
     'staff-panel-test.php'],
    ['staff panel: service ids read from the value instead of the key', 'class-staff-data.php',
     '$sid = (int) ($is_list ? $v : $k);',
     '$sid = (int) $v;',
     'staff-panel-test.php'],

    // --- the standing security constraints ------------------------------
    ['security: the fail-closed password check is removed', 'class-staff.php',
     "if (!is_string(\$post->post_password) || \$post->post_password === '') {",
     'if (false) {',
     'staff-gate-test.php'],
    ['security: the capability path stops being checked', 'class-staff.php',
     'if (is_user_logged_in() && current_user_can(self::capability())) {',
     'if (false) {',
     'staff-gate-test.php'],
    ['security: cancelled bookings become reachable', 'class-staff.php',
     "public const VISIBLE_STATUSES = ['confirmed', 'pending', 'pending-payment', 'pending-user'];",
     "public const VISIBLE_STATUSES = ['confirmed', 'pending', 'pending-payment', 'pending-user', 'cancelled'];",
     'staff-gate-test.php'],
];

$originals = [];
$restore = static function () use (&$originals) {
    foreach ($originals as $path => $body) { file_put_contents($path, $body); }
    $originals = [];
};
register_shutdown_function($restore);
foreach ([SIGINT, SIGTERM] as $sig) {
    if (function_exists('pcntl_signal')) { pcntl_signal($sig, static function () use ($restore) { $restore(); exit(2); }); }
}

$survived = [];
$broken    = [];
echo "MUTATION CHECK — each line breaks one guarded behaviour and must go RED.\n\n";
foreach ($mutations as [$name, $file, $from, $to, $suite]) {
    $path = $plugin . $file;
    $body = file_get_contents($path);
    if (!str_contains($body, $from)) {
        $broken[] = $name;
        printf("%-8s %s\n", 'STALE', $name . '  (the code it mutates has moved — fix the mutation)');
        continue;
    }
    $originals[$path] = $body;
    file_put_contents($path, str_replace($from, $to, $body, ));
    $out = [];
    $code = 0;
    exec('php ' . escapeshellarg(__DIR__ . '/' . $suite) . ' 2>&1', $out, $code);
    file_put_contents($path, $body);
    unset($originals[$path]);
    $went_red = $code !== 0;
    printf("%-8s %s\n", $went_red ? 'red ok' : 'SURVIVED', $name);
    if (!$went_red) { $survived[] = $name; }
}

echo "\n" . count($mutations) . " mutations, " . count($survived) . " survived, " . count($broken) . " stale\n";
if ($survived) {
    echo "\nSURVIVING MUTATIONS — these behaviours are NOT actually guarded:\n";
    foreach ($survived as $s) { echo "  - $s\n"; }
}
exit(($survived || $broken) ? 1 : 0);
