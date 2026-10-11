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
$GLOBALS['opt'] = [];       // v0.25.0: Config reads its settings row from here.

function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
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
            $out[] = ($args['fields'] ?? '') === 'ids' ? $id : (object) ['ID' => $id];
        }
    }
    return $out;
}
function sanitize_key($v) { return strtolower(preg_replace('/[^a-z0-9_\-]/i', '', (string) $v)); }

/* v0.25.0: the guest-count range now comes from Config (the setting
   admin_guest_fallback, clamped by Admin_Guests::MAX_OPTIONS), so Config is
   loaded here too. get_option() is already shimmed above, which is all Config
   needs to return its defaults. */
function maybe_unserialize($v) {
    if (is_string($v)) {
        $u = @unserialize($v);
        return ($u === false && $v !== 'b:0;') ? $v : $u;
    }
    return $v;
}
class WP_Post { public $ID = 0; public $post_type = ''; }

/* v0.29.0: the Pet fee line is printed on a pet-fee cottage only, which is
   read from the services MotoPress attached to the cottage — the same reading
   the Add New map uses. 1065 carries the Extra Guest Fee; 1607 (Cottage 34)
   the three pet services; 1999 cannot be read at all. */
$GLOBALS['room_types'] = [1065 => [18063], 1607 => [17712, 17711, 14926], 1999 => null];
function MPHB() {
    return new class {
        // v0.32.0: a booking repository whose addLog() RECORDS, so "no log
        // line" is an observation and not an assertion about an array nothing
        // ever writes (the stand-in had none, and every log call failed silently).
        public function getBookingRepository() {
            return new class {
                public function findById($id) {
                    return new class($id) {
                        private $id;
                        public function __construct($id) { $this->id = $id; }
                        public function addLog($m, $a = null) { $GLOBALS['logs'][$this->id][] = $m; }
                    };
                }
            };
        }
        public function getRoomTypeRepository() {
            return new class {
                public function findById($id) {
                    $svc = $GLOBALS['room_types'][(int) $id] ?? null;
                    return $svc === null ? null : new class($svc) {
                        private $s;
                        public function __construct($s) { $this->s = $s; }
                        public function getServices() { return $this->s; }
                    };
                }
            };
        }
    };
}

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-admin-guests.php';
// v0.28.0: the Guests box prints the read-only "Pet fee" line from
// Admin_Fields::booking_pet_fee(), so the box cannot be rendered without it.
require __DIR__ . '/../../dcc-custom-checkout/includes/class-admin-fields.php';
// v0.32.0: the Pet fee line moved to the "Extra Details/Options" box.
require __DIR__ . '/../../dcc-custom-checkout/includes/class-policies.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-extra-details.php';

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

/* CROSS-PLUGIN CONTRACT 2026-09-18 — the Availability Calendar reads
 * _mphb_adults_confirmed as "non-empty and not 0". This half tested only
 * !== '', so a stored "0" read as CONFIRMED here and as UNCONFIRMED there.
 * No divergence exists on live (the one marker in the database is '1'), and
 * nothing would have failed if it did -- which is the reason to pin it.
 *
 * Note what the loose test did BESIDES disagreeing: $had_mark came out true
 * for "0", so the save wrote no marker and the bad value survived every
 * subsequent save. The strict test repairs it instead. */
seed();
$GLOBALS['meta'][99]['_mphb_adults_confirmed'] = '0';
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '3']];
$g->save(18433);
check('a stored "0" marker does not count as confirmed — it is repaired to 1',
    $GLOBALS['meta'][99]['_mphb_adults_confirmed'], 1);
check('and the count still lands', $GLOBALS['meta'][99]['_mphb_adults'], 3);

seed();
$GLOBALS['meta'][99]['_mphb_adults_confirmed'] = '0';
$rooms = (function () { return $this->reserved_rooms(18433); })->call($g);
check('the screen reads a "0" marker as NOT confirmed, as the Calendar does',
    $rooms[0]['confirmed'], false);

seed();
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '2']];
$g->save(18433);
$rooms = (function () { return $this->reserved_rooms(18433); })->call($g);
check('a real marker still reads as confirmed', $rooms[0]['confirmed'], true);

/* v0.25.0 — THE SETTING MAY ONLY SHRINK THE RANGE, NEVER WIDEN IT.
 *
 * `admin_guest_max` is configurable, but Admin_Guests clamps it with its own
 * MAX_OPTIONS constant because `max` drives the <option> loop and one of its
 * inputs is database-sourced. Found by a mutation: removing the clamp changed
 * nothing at the DEFAULT setting, so the guarantee was only tested in the one
 * case where it makes no difference. These seed the setting ABOVE the ceiling,
 * which is the only way the clamp is observable. */
seed();
$GLOBALS['opt']['dcc_checkout_settings'] = ['admin_guest_max' => 50];
\DCC_Checkout\Config::flush_cache();
$GLOBALS['meta'][1065]['mphb_adults_capacity'] = 9999;
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '30']];
$g->save(18433);
/* seed() stores 4, so a REFUSED submission leaves that 4 in place. Asserting
   the stored value is unchanged is the suite's existing idiom for "refused". */
check('a setting of 50 cannot widen the range past the hard ceiling of 20',
    $GLOBALS['meta'][99]['_mphb_adults'], 4);

seed();
$GLOBALS['opt']['dcc_checkout_settings'] = ['admin_guest_max' => 50];
\DCC_Checkout\Config::flush_cache();
$GLOBALS['meta'][1065]['mphb_adults_capacity'] = 9999;
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '20']];
$g->save(18433);
check('...and 20 is still accepted at that setting', $GLOBALS['meta'][99]['_mphb_adults'], 20);

/* And the setting really does SHRINK it, or it is decoration. */
seed();
$GLOBALS['opt']['dcc_checkout_settings'] = ['admin_guest_max' => 3];
\DCC_Checkout\Config::flush_cache();
$GLOBALS['meta'][1065]['mphb_adults_capacity'] = 9999;
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '4']];
$g->save(18433);
check('a setting of 3 does shrink the accepted range',
    $GLOBALS['meta'][99]['_mphb_adults'], 4);
$GLOBALS['opt'] = [];
\DCC_Checkout\Config::flush_cache();

/* --- v0.28.0: the read-only "Pet fee" line, rendered. --------------------
   Constructed both ways and the unreadable case; never a dropdown, because
   the fee cannot be changed from this box. */
function pet_line(Admin_Guests $g): string {
    // v0.32.0: the line lives in "Extra Details/Options" now.
    $h = \DCC_Checkout\Extra_Details::box_html(18433);
    return preg_match('#<p class="dcc_admin-petfee-line"><strong>Pet fee:</strong> (.*?)</p>#', $h, $m) ? $m[1] : '(no line)';
}
// On the pet-fee cottage (Cottage 34, 1607).
function seed34() { seed(); $GLOBALS['meta'][500]['mphb_room_type_id'] = 1607; }
seed34();
$GLOBALS['meta'][99]['_mphb_services'] = [17712];
check('Cottage 34: the Guests box says "Pet fee: Yes" when a pet service is saved', pet_line($g), 'Yes');
seed34();
$GLOBALS['meta'][99]['_mphb_services'] = [18063];
check('... "No" when only another service is saved', pet_line($g), 'No');
seed34();
check('... "No" when no service is saved at all', pet_line($g), 'No');
seed34();
$GLOBALS['meta'][99]['_mphb_services'] = 'not-serialised garbage';
check('... and says it could not be read, rather than guessing',
    pet_line($g), 'could not be read, so the dog details are shown.');
// v0.29.0 — only on a pet-fee cottage (owner: "Keep 34 as the only pet fee
// cottage"; Director's default: the line only where the fee exists).
seed();
check('Cottage 22 (no pet fee): NO Pet fee line at all', pet_line($g), '(no line)');
seed();
$GLOBALS['meta'][500]['mphb_room_type_id'] = 1999;
check('a cottage that cannot be read: no Pet fee line either', pet_line($g), '(no line)');

/* ===================================================================== *
 * v0.32.0 (A) — the Pet fee line LEFT the Guest count box.
 * ===================================================================== */
seed34();
$GLOBALS['meta'][99]['_mphb_services'] = [17712];
$post = new WP_Post(); $post->ID = 18433;
ob_start(); $g->render($post); $h = (string) ob_get_clean();
check('the Guest count box no longer carries a Pet fee line (it is in Extra Details/Options)',
    strpos($h, 'dcc_admin-petfee-line'), false);
check('... and its help text no longer says MotoPress fills it with the capacity (D)',
    [strpos($h, 'starts at 2 guests') !== false, strpos($h, 'fills this with the cottage') === false], [true, true]);

/* ===================================================================== *
 * v0.32.0 (E) — EVERY Update submits this select. An untouched one must
 * write NOTHING; only a choice confirms.
 * ===================================================================== */
function box_html(Admin_Guests $g): string {
    $post = new WP_Post(); $post->ID = 18433;
    ob_start(); $g->render($post); return (string) ob_get_clean();
}
seed();
$GLOBALS['logs'] = [];
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '2']];
$g->save(18433);
check('guard-on-the-guard: a real change DOES write a log line (so "no log" below can fail)',
    count($GLOBALS['logs'][18433] ?? []), 1);
seed();   // an unconfirmed 4 (MotoPress's default)
$GLOBALS['logs'] = [];
$h = box_html($g);
check('render, unconfirmed count: the select OPENS on "4 (not confirmed)" — the keep option',
    (bool) preg_match('#<option value="keep" selected>4 \(not confirmed\)</option>#', $h), true);
check('... and no number is pre-selected, so choosing 4 is a real choice',
    (bool) preg_match('#<option value="4" selected>#', $h), false);
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => 'keep']];
$g->save(18433);
check('UNTOUCHED save (keep submitted): NO marker, count untouched, no log',
    [array_key_exists('_mphb_adults_confirmed', $GLOBALS['meta'][99]), $GLOBALS['meta'][99]['_mphb_adults'], $GLOBALS['logs'][18433] ?? []],
    [false, 4, []]);
seed();
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '4']];
$g->save(18433);
check('picking the SAME number (4) confirms it: marker written, count unchanged',
    [$GLOBALS['meta'][99]['_mphb_adults_confirmed'] ?? null, $GLOBALS['meta'][99]['_mphb_adults']], [1, 4]);
seed();
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '2']];
$g->save(18433);
check('picking a DIFFERENT number: marker plus the new count',
    [$GLOBALS['meta'][99]['_mphb_adults_confirmed'] ?? null, $GLOBALS['meta'][99]['_mphb_adults']], [1, 2]);
seed();
$GLOBALS['meta'][99]['_mphb_adults_confirmed'] = 1;
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '']];
$g->save(18433);
check('"Not provided" removes both keys',
    [array_key_exists('_mphb_adults', $GLOBALS['meta'][99]), array_key_exists('_mphb_adults_confirmed', $GLOBALS['meta'][99])], [false, false]);
seed();
$GLOBALS['meta'][99]['_mphb_adults_confirmed'] = 1;
$h = box_html($g);
check('render, CONFIRMED count: no keep option, the number itself is selected',
    [strpos($h, 'value="keep"'), (bool) preg_match('#<option value="4" selected>#', $h)], [false, true]);
$GLOBALS['logs'] = [];
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '4']];
$g->save(18433);
check('... an untouched CONFIRMED count resubmits its own number: nothing written, no log',
    [$GLOBALS['meta'][99]['_mphb_adults'], $GLOBALS['meta'][99]['_mphb_adults_confirmed'], $GLOBALS['logs'][18433] ?? []], [4, 1, []]);
seed();
unset($GLOBALS['meta'][99]['_mphb_adults']);
$h = box_html($g);
check('render, no count stored: "Not provided" is selected, no keep option',
    [strpos($h, 'value="keep"'), (bool) preg_match('#<option value="" selected>Not provided#', $h)], [false, true]);
$_POST = ['dcc_admin_guests_nonce' => 'good-nonce', 'dcc_adults' => [99 => '']];
$g->save(18433);
check('... untouched: still nothing stored, no marker',
    [array_key_exists('_mphb_adults', $GLOBALS['meta'][99]), array_key_exists('_mphb_adults_confirmed', $GLOBALS['meta'][99])], [false, false]);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
