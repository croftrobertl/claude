<?php
/**
 * Save-path tests for DCC_Checkout\Admin_Guests.
 *
 *   php tests/admin-guests/run.php
 *
 * This control WRITES STORED DATA on a real booking, and the difference
 * between "not provided" and a number is the whole reason it exists — /staff/
 * cannot tell a real 4 from MotoPress's defaulted 4 unless this stores the two
 * differently. So the save path is tested directly, against a fake post store,
 * rather than trusted to review.
 *
 * WordPress is shimmed, not loaded. Only the functions Admin_Guests actually
 * calls are provided, and each records what it did so the assertions can read
 * the writes back.
 */
define('ABSPATH', __DIR__);

$GLOBALS['meta'] = [];      // post_id => [key => value]
$GLOBALS['posts'] = [];     // post_id => ['type'=>, 'parent'=>, 'title'=>]
$GLOBALS['logs'] = [];      // booking_id => [messages]
$GLOBALS['caps'] = true;

function get_post_meta($id, $key, $single = false) { return $GLOBALS['meta'][$id][$key] ?? ''; }
function update_post_meta($id, $key, $value) { $GLOBALS['meta'][$id][$key] = $value; return true; }
function delete_post_meta($id, $key) { unset($GLOBALS['meta'][$id][$key]); return true; }
function get_the_title($id) { return $GLOBALS['posts'][$id]['title'] ?? ''; }
function current_user_can($cap, $id = 0) { return $GLOBALS['caps']; }
function wp_unslash($v) { return $v; }
function sanitize_text_field($v) { return is_string($v) ? trim($v) : ''; }
function wp_verify_nonce($n, $a) { return $n === 'good-nonce' ? 1 : false; }
function wp_get_current_user() { return null; }
function __($t, $d = null) { return $t; }
function esc_html__($t, $d = null) { return $t; }
function esc_html($t) { return $t; }
function esc_attr($t) { return $t; }
function selected($a, $b, $echo = true) { return (string) $a === (string) $b ? ' selected' : ''; }
function wp_nonce_field($a, $n, $r = true, $e = true) {}
function add_action() {}
function add_meta_box() {}
function apply_filters($h, $v) { return $v; }
function get_posts($args) {
    $out = [];
    foreach ($GLOBALS['posts'] as $id => $p) {
        if (($p['type'] ?? '') === ($args['post_type'] ?? '') && ($p['parent'] ?? 0) === ($args['post_parent'] ?? 0)) {
            $out[] = (object) ['ID' => $id];
        }
    }
    return $out;
}

require __DIR__ . '/../../dcc-custom-checkout/includes/class-admin-guests.php';

use DCC_Checkout\Admin_Guests;

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS' : 'FAIL') . "  $name\n";
    if (!$ok) { echo "      expected: " . var_export($expected, true) . "\n      actual:   " . var_export($actual, true) . "\n"; }
}

/** Booking 18433 with one reserved room (99) on a 4-capacity cottage (1065). */
function seed() {
    $GLOBALS['posts'] = [
        18433 => ['type' => 'mphb_booking', 'parent' => 0, 'title' => 'Booking'],
        99    => ['type' => 'mphb_reserved_room', 'parent' => 18433, 'title' => 'RR'],
        1065  => ['type' => 'mphb_room_type', 'parent' => 0, 'title' => 'Cottage 22: The Boathouse'],
        500   => ['type' => 'mphb_room', 'parent' => 0, 'title' => 'Room'],
    ];
    $GLOBALS['meta'] = [
        99   => ['_mphb_room_id' => 500, '_mphb_adults' => 4],   // MotoPress's defaulted 4
        500  => ['mphb_room_type_id' => 1065],
        1065 => ['mphb_adults_capacity' => 4],
    ];
    $GLOBALS['caps'] = true;
    $_POST = [];
}

$g = new Admin_Guests();

// --- The reported case: an imported 4 that was really 2. -------------------
seed();
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '2']];
$g->save(18433);
check('an imported default can be corrected to the real number',
    $GLOBALS['meta'][99]['_mphb_adults'], 2);

// --- "Not provided" stores NOTHING, not a zero. ---------------------------
seed();
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '']];
$g->save(18433);
check('"Not provided" deletes the meta rather than storing 0',
    array_key_exists('_mphb_adults', $GLOBALS['meta'][99]), false);

// --- Range is the room type's capacity. -----------------------------------
seed();
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '5']];
$g->save(18433);
check('a count above the cottage capacity is refused, leaving the old value',
    $GLOBALS['meta'][99]['_mphb_adults'], 4);

seed();
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '0']];
$g->save(18433);
check('zero is refused too — that is what "Not provided" is for',
    $GLOBALS['meta'][99]['_mphb_adults'], 4);

// --- Never write on a save that did not come from this control. -----------
seed();
$_POST = ['dcc_adults' => [99 => '2']];              // no nonce at all
$g->save(18433);
check('a save with no nonce (bulk edit, REST, another plugin) writes nothing',
    $GLOBALS['meta'][99]['_mphb_adults'], 4);

seed();
$_POST = ['dcc_admin_guests_nonce' => 'bad', 'dcc_adults' => [99 => '2']];
$g->save(18433);
check('a bad nonce writes nothing', $GLOBALS['meta'][99]['_mphb_adults'], 4);

seed();
$GLOBALS['caps'] = false;
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '2']];
$g->save(18433);
check('a user who cannot edit the booking writes nothing',
    $GLOBALS['meta'][99]['_mphb_adults'], 4);

// --- Only rooms that belong to THIS booking. ------------------------------
seed();
$GLOBALS['posts'][77] = ['type' => 'mphb_reserved_room', 'parent' => 999, 'title' => 'Someone else'];
$GLOBALS['meta'][77] = ['_mphb_adults' => 3];
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [77 => '1']];
$g->save(18433);
check('a reserved room belonging to a DIFFERENT booking is never touched',
    $GLOBALS['meta'][77]['_mphb_adults'], 3);

/* ===================================================================== *
 * v0.23.0 — PROVENANCE. The marker is the contract with the Availability
 * Calendar: present means _mphb_adults is a real count, whatever its value.
 * ===================================================================== */

// --- The #18433 case, and the reason the marker exists at all. ------------
// MotoPress defaulted this to 4 on a 4-capacity cottage. The owner selects 4
// because the party really is four. The NUMBER DOES NOT CHANGE — and an
// earlier version returned early on exactly that, so no marker was written
// and /staff/ went on saying "count not provided" for a count just confirmed
// by hand.
seed();
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '4']];
$g->save(18433);
check('confirming an unchanged default still writes the marker',
    $GLOBALS['meta'][99]['_mphb_adults_confirmed'], 1);
check('and leaves the count itself alone', $GLOBALS['meta'][99]['_mphb_adults'], 4);

// --- A changed count is confirmed too. -----------------------------------
seed();
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '2']];
$g->save(18433);
check('a corrected count is marked confirmed', $GLOBALS['meta'][99]['_mphb_adults_confirmed'], 1);
check('with the corrected value', $GLOBALS['meta'][99]['_mphb_adults'], 2);

// --- "Not provided" clears BOTH. -----------------------------------------
seed();
$GLOBALS['meta'][99]['_mphb_adults_confirmed'] = 1;
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '']];
$g->save(18433);
check('"Not provided" deletes the count', array_key_exists('_mphb_adults', $GLOBALS['meta'][99]), false);
check('"Not provided" deletes the marker too — it must not outlive the number',
    array_key_exists('_mphb_adults_confirmed', $GLOBALS['meta'][99]), false);

// --- An out-of-range value confirms nothing. -----------------------------
seed();
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '9']];
$g->save(18433);
check('a refused count does not get a marker',
    array_key_exists('_mphb_adults_confirmed', $GLOBALS['meta'][99]), false);

// --- A save that writes nothing writes no log line either. ---------------
seed();
unset($GLOBALS['meta'][99]['_mphb_adults']);
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '']];
$g->save(18433);
check('saving "Not provided" when it was already nothing changes nothing',
    array_key_exists('_mphb_adults', $GLOBALS['meta'][99]), false);

/* AUDIT 2026-09-18 — `max` drives both the <option> loop and the accepted
 * range, and it comes from the database. A corrupted mphb_adults_capacity
 * would otherwise render that many options and wedge the booking screen. */
seed();
$GLOBALS['meta'][1065]['mphb_adults_capacity'] = 9999;
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '500']];
$g->save(18433);
check('an absurd capacity cannot widen the accepted range',
    $GLOBALS['meta'][99]['_mphb_adults'], 4);

seed();
$GLOBALS['meta'][1065]['mphb_adults_capacity'] = 9999;
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '20']];
$g->save(18433);
check('but the sane ceiling is still accepted', $GLOBALS['meta'][99]['_mphb_adults'], 20);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
