<?php
/**
 * THE STANDING CONSTRAINT, re-asserted. The owner's instruction from v0.23.0,
 * repeated every round since: "DO NOT WEAKEN, and re-assert in tests:
 * Staff::is_authorized(), the gated endpoints, the password-removed
 * fail-closed path, and 'no PII in page HTML'."
 *
 * Rebuilt 2026-09-17 after the scratchpad harnesses were lost to a container
 * recycle, and committed this time — see bootstrap.php.
 *
 * The fail-closed path is the one worth staring at: post_password_required()
 * returns FALSE for a post with NO password, so a naive gate swings WIDE OPEN
 * the moment someone clears the password in the editor.
 */
require __DIR__ . '/bootstrap.php';

$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }

// These four are what the gate actually turns on, so the harness drives them.
$GLOBALS['t_logged_in'] = false;
$GLOBALS['t_can']       = false;
$GLOBALS['t_pw_req']    = true;
// error_log() is a PHP builtin and cannot be redeclared, so redirect it to a
// file and read that back — which also tests the real call, not a stub of it.
$GLOBALS['t_errlog'] = sys_get_temp_dir() . '/mphbac-gate-' . getmypid() . '.log';
@unlink($GLOBALS['t_errlog']);
ini_set('log_errors', '1');
ini_set('error_log', $GLOBALS['t_errlog']);
function is_user_logged_in() { return $GLOBALS['t_logged_in']; }
function current_user_can($c) { return $GLOBALS['t_can']; }
function post_password_required($p = null) { return $GLOBALS['t_pw_req']; }

require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-staff-data.php';

use MPHBAC\Staff;
use MPHBAC\Staff_Data;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

function staff_page(string $password, string $status = 'publish'): void {
    $GLOBALS['t_posts'] = [];
    $GLOBALS['t_meta'] = [];
    t_post(Staff::DEFAULT_PAGE_ID, 'page', $status, 'Staff');
    $GLOBALS['t_posts'][Staff::DEFAULT_PAGE_ID]->post_password = $password;
}

echo "-- the cookie path --\n";
staff_page('secret');
$GLOBALS['t_logged_in'] = false; $GLOBALS['t_can'] = false; $GLOBALS['t_pw_req'] = true;
check('a visitor who has NOT typed the password is refused', Staff::is_authorized() === false);
$GLOBALS['t_pw_req'] = false;
check('a visitor who HAS typed it is allowed', Staff::is_authorized() === true);

echo "\n-- the fail-closed path: the password is removed in the editor --\n";
staff_page('');
$GLOBALS['t_pw_req'] = false;   // what WordPress reports for an unprotected post
@unlink($GLOBALS['t_errlog']);
check('THE CRUX: an unprotected page authorizes NOBODY through the cookie path',
    Staff::is_authorized() === false);
$logged = is_readable($GLOBALS['t_errlog']) ? (string) file_get_contents($GLOBALS['t_errlog']) : '';
check('...and it says so in the log rather than failing silently',
    str_contains($logged, 'fail-closed'), trim($logged));

echo "\n-- the capability path is independent of the page --\n";
staff_page('');
$GLOBALS['t_logged_in'] = true; $GLOBALS['t_can'] = true; $GLOBALS['t_pw_req'] = false;
check('a manager is still allowed even with the page unprotected', Staff::is_authorized() === true);
$GLOBALS['t_can'] = false;
check('a logged-in user WITHOUT the capability is not', Staff::is_authorized() === false);
staff_page('secret', 'draft');
$GLOBALS['t_logged_in'] = false; $GLOBALS['t_pw_req'] = false;
check('an unpublished staff page authorizes nobody', Staff::is_authorized() === false);

echo "\n-- booking_detail refuses what it should --\n";
$GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = [];
t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => 4]);
t_post(900, 'mphb_booking', 'cancelled', 'Cancelled booking', ['mphb_total_price' => 100]);
t_post(901, 'page', 'publish', 'Not a booking');
t_post(902, 'mphb_booking', 'confirmed', 'Live booking', ['mphb_total_price' => 100]);
check('a cancelled booking is not reachable', Staff_Data::booking_detail(900) === null);
check('a post that is not a booking is not reachable', Staff_Data::booking_detail(901) === null);
check('a missing id is not reachable', Staff_Data::booking_detail(999999) === null);
check('a live booking IS reachable (so the refusals above mean something)',
    is_array(Staff_Data::booking_detail(902)));
check('the visible-status whitelist has not quietly grown',
    Staff::VISIBLE_STATUSES === ['confirmed', 'pending', 'pending-payment', 'pending-user'],
    Staff::VISIBLE_STATUSES);

echo "\n-- no PII in page HTML --\n";
{
    // The widget renders a shell; guest data arrives only through the gated
    // endpoint. Assert against the SOURCE of the render path: no booking field
    // may be echoed into the markup.
    $widget = file_get_contents($ROOT . '/includes/class-staff-widget.php');
    $render = $widget;
    $leaks = [];
    foreach (['getFirstName', 'getLastName', 'getEmail', 'getPhone', 'mphb_email',
              'mphb_first_name', 'mphb_last_name', 'booking_detail', 'Staff_Data::'] as $needle) {
        if (str_contains($render, $needle)) { $leaks[] = $needle; }
    }
    check('the staff widget markup contains no guest field and never calls the detail layer',
        $leaks === [], $leaks);

    $data = file_get_contents($ROOT . '/includes/class-staff-data.php');
    check('every value still leaves the server as plain text (the textContent contract)',
        str_contains($data, 'PLAIN TEXT, always') && str_contains($data, 'wp_strip_all_tags'));
    check('the photo is still an opaque booking-scoped reference, never a URL',
        str_contains($data, 'never emitted as a')
        && !preg_match("/'url'\s*=>\s*\\\$(photo|url)/", $data));
}

@unlink($GLOBALS['t_errlog']);
echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
