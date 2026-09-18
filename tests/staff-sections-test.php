<?php
/**
 * THE PAYLOAD IS TEXT. Every value the staff panel sends must be plain text:
 * the client renders with textContent and never innerHTML, which is the one
 * XSS defence a crafted guest name cannot bypass. The contract is kept on the
 * SERVER; the client never relaxes it.
 *
 * So this suite feeds hostile and markup-bearing values through the real
 * section builders and asserts what comes out the other side.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
function mphb_format_price($v) {
    return '<span class="mphb-price"><span class="mphb-currency">&#036;</span>' . number_format((float) $v, 2) . '</span>';
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

function detail(array $meta): array {
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = []; $GLOBALS['wpdb']->payment_rows = [];
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => 4]);
    t_post(220, 'mphb_room', 'publish', 'R', ['mphb_room_type_id' => 22]);
    t_post(800, 'mphb_booking', 'confirmed', 'B', $meta + ['mphb_total_price' => 0]);
    t_post(801, 'mphb_reserved_room', 'publish', 'RR', ['_mphb_room_id' => 220, '_mphb_adults' => 2]);
    $GLOBALS['t_posts'][801]->post_parent = 800;
    return Staff_Data::booking_detail(800);
}
/** Every string that reaches the client, from every section. */
function values(array $d): array {
    $out = [];
    foreach ($d['sections'] as $sec) {
        foreach ($sec as $r) {
            foreach (['label', 'value'] as $k) { if (isset($r[$k])) { $out[] = (string) $r[$k]; } }
        }
    }
    return $out;
}

echo "-- a hostile guest name --\n";
{
    $d = detail(['mphb_first_name' => '<script>alert(1)</script>Dana',
                 'mphb_last_name'  => 'Reyes" onmouseover="x',
                 'mphb_phone'      => '<img src=x onerror=alert(1)>555-0000']);
    $v = values($d);
    check('no value contains a tag', !array_filter($v, static fn($s) => str_contains($s, '<')), $v);
    check('the readable part survives rather than the row vanishing',
        (bool) array_filter($v, static fn($s) => str_contains($s, 'Dana')), $v);
    check('an attribute-breaking quote is carried as TEXT, not stripped into something else',
        (bool) array_filter($v, static fn($s) => str_contains($s, 'Reyes')), $v);
}

echo "-- entities are decoded, not double-escaped --\n";
{
    $d = detail(['mphb_first_name' => 'Dock Buchanan &amp; Co']);
    $v = values($d);
    check('"&amp;" arrives as "&" — the client will not decode it again',
        (bool) array_filter($v, static fn($s) => str_contains($s, 'Dock Buchanan & Co')), $v);
    check('...and no raw entity survives anywhere',
        !array_filter($v, static fn($s) => preg_match('/&(amp|lt|gt|#\d+);/', $s)), $v);
}

echo "-- money is text too --\n";
{
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = []; $GLOBALS['wpdb']->payment_rows = [];
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => 4]);
    t_post(220, 'mphb_room', 'publish', 'R', ['mphb_room_type_id' => 22]);
    t_post(810, 'mphb_booking', 'confirmed', 'B', ['mphb_total_price' => 1500]);
    t_post(811, 'mphb_reserved_room', 'publish', 'RR', ['_mphb_room_id' => 220, '_mphb_adults' => 2]);
    $GLOBALS['t_posts'][811]->post_parent = 810;
    $v = values(Staff_Data::booking_detail(810));
    check('mphb_format_price markup never reaches the client',
        !array_filter($v, static fn($s) => str_contains($s, '<span')), $v);
    check('the price is readable after stripping', in_array('$1,500.00', $v, true), $v);
}

echo "-- the section shape the client relies on --\n";
{
    $d = detail(['mphb_first_name' => 'Dana']);
    check('exactly three sections, named', array_keys($d['sections']) === ['booking', 'customer', 'notes'],
        array_keys($d['sections']));
    $rows = array_merge(...array_values($d['sections']));
    check('every row has a label and a string value',
        !array_filter($rows, static fn($r) => !isset($r['label']) || !is_string($r['value'] ?? '')),
        array_slice($rows, 0, 3));
    check('the top level carries the id and the imported flag',
        $d['id'] === 800 && array_key_exists('imported', $d), array_intersect_key($d, ['id' => 1, 'imported' => 1]));
}

echo "-- the source still says the contract out loud --\n";
{
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-staff-data.php');
    check('plain() strips tags AND decodes entities',
        str_contains($src, 'wp_strip_all_tags') && str_contains($src, 'html_entity_decode'));
    check('the textContent-only rule is recorded where money() is defined',
        str_contains($src, 'PLAIN TEXT, always'));
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
