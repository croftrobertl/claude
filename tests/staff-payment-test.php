<?php
/**
 * payment_info() — how much has actually been received, and through what.
 *
 * PLAIN TEXT IS THE CONTRACT. mphb_format_price() returns markup
 * (<span class="mphb-price">…), and the client renders every value with
 * textContent — the one XSS defence a crafted guest name cannot bypass. So
 * money() must strip tags and decode entities on the SERVER; a value that
 * arrives as markup is a bug even though it looks right in a browser.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
/** MPHB's own formatter, markup and all — as it really behaves. */
function mphb_format_price($v) {
    return '<span class="mphb-price"><span class="mphb-currency">&#036;</span>'
         . number_format((float) $v, 2) . '</span>';
}
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-staff-data.php';

use MPHBAC\Staff_Data;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

function scene(float $total, array $payments): array {
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = [];
    $GLOBALS['wpdb']->payment_rows = [];
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => 4]);
    t_post(220, 'mphb_room', 'publish', 'R', ['mphb_room_type_id' => 22]);
    t_post(700, 'mphb_booking', 'confirmed', 'B', ['mphb_total_price' => $total]);
    t_post(701, 'mphb_reserved_room', 'publish', 'RR', ['_mphb_room_id' => 220, '_mphb_adults' => 2]);
    $GLOBALS['t_posts'][701]->post_parent = 700;
    foreach ($payments as [$amt, $status]) { t_payment(700, $amt, $status); }
    return Staff_Data::booking_detail(700)['sections']['booking'];
}
function row(array $rows, string $label): ?array {
    foreach ($rows as $r) { if ($r['label'] === $label) { return $r; } }
    return null;
}

echo "-- money leaves the server as PLAIN TEXT --\n";
{
    $b = scene(1200, [[400, 'mphb-p-completed']]);
    $total = row($b, 'Total')['value'];
    check('the currency symbol is a decoded character, not an entity or a tag',
        $total === '$1,200.00', $total);
    check('no markup survives in any money row',
        !array_filter($b, static fn($r) => str_contains((string) ($r['value'] ?? ''), '<')),
        array_map(static fn($r) => $r['value'] ?? '', $b));
}

echo "\n-- only PAID statuses count toward the total received --\n";
{
    $b = scene(1000, [[500, 'mphb-p-completed'], [500, 'mphb-p-failed']]);
    check('a failed payment does not reduce the balance',
        row($b, 'Paid')['value'] === '$500.00' && row($b, 'Balance Due')['value'] === '$500.00',
        [row($b, 'Paid')['value'], row($b, 'Balance Due')['value']]);
    $b2 = scene(1000, [[400, 'mphb-p-completed'], [350, 'mphb-p-completed']]);
    check('several completed payments sum', row($b2, 'Paid')['value'] === '$750.00', row($b2, 'Paid')['value'] ?? null);
    check('...and the balance is the remainder', row($b2, 'Balance Due')['value'] === '$250.00', row($b2, 'Balance Due')['value'] ?? null);
    $b3 = scene(1000, [[400, 'mphb-p-completed'], [600, 'mphb-p-completed']]);
    check('a fully-paid booking shows Balance Due $0.00 with no Total or Paid row',
        row($b3, 'Balance Due')['value'] === '$0.00' && row($b3, 'Total') === null && row($b3, 'Paid') === null,
        array_map(static fn($r) => $r['label'], $b3));
}

echo "\n-- no payment recorded is a VALUE, not a blank --\n";
{
    $b = scene(900, []);
    check('"No payment recorded" is shown rather than an em dash or nothing',
        row($b, 'Paid')['value'] === 'No payment recorded', row($b, 'Paid')['value'] ?? null);
    check('...and it is not flagged as money, so the UI can style it as prose',
        empty(row($b, 'Paid')['money']), row($b, 'Paid'));
    check('the full total is still owed', row($b, 'Balance Due')['value'] === '$900.00');
}

echo "\n-- the paid-status list is filterable --\n";
{
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-staff-data.php');
    check('paid statuses go through mphbac_staff_paid_statuses',
        str_contains($src, "apply_filters('mphbac_staff_paid_statuses'"));
    check('the payment query is prepared, never interpolated',
        str_contains($src, '$wpdb->prepare') && !preg_match('/\$wpdb->get_results\(\s*"[^"]*\$/', $src));
}

echo "\n-- a failed DB read must not be cached as a zero --\n";
{
    $GLOBALS['wpdb']->last_error = 'gone away';
    $b = scene(800, [[800, 'mphb-p-completed']]);
    $GLOBALS['wpdb']->last_error = '';
    check('with the query erroring, the panel does not claim the booking is paid off',
        row($b, 'Balance Due') === null || row($b, 'Balance Due')['value'] !== '$0.00',
        row($b, 'Balance Due')['value'] ?? null);
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
