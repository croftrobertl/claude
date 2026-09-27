<?php
/**
 * Server-side backstop guards: the stand-down rules, tested directly.
 *
 *     php tests/backstops/run.php
 *
 * WHY THIS EXISTS (added by the 2026-09-19 sweep). Four files carry the same
 * comment in almost the same words:
 *
 *     "Never redirect during an AJAX submission — it would break the JSON
 *      response MotoPress expects."
 *
 * class-pet-service.php:54, class-guest-fields.php:35,
 * class-extra-guest-service.php:43 and class-checkout-request.php:307. It is a
 * booking-breaking guarantee -- a 302 in the middle of MotoPress's AJAX submit
 * loses the guest's reservation with no message -- and nothing tested it in any
 * of the four. The same is true of the wp-admin and REST stand-downs beside it.
 *
 * HOW A REDIRECT IS DETECTED. Checkout_Request::redirect_back_with_error()
 * calls wp_safe_redirect() and then exit. wp_safe_redirect is shimmed here to
 * throw, so the attempt is observable and the test process survives. That means
 * the assertions below distinguish "redirected" from "stood down" for real,
 * rather than asserting that a flag was read.
 */
define('ABSPATH', __DIR__);
define('DAY_IN_SECONDS', 86400);

class DccRedirected extends \Exception {}

$GLOBALS['opt']   = [];
$GLOBALS['ajax']  = false;
$GLOBALS['admin'] = false;

function get_option($k, $d = []) { return $GLOBALS['opt'][$k] ?? $d; }
function update_option($k, $v) { $GLOBALS['opt'][$k] = $v; return true; }
function apply_filters($h, $v) { return $v; }
function add_action() {}
function add_filter() {}
function __($t, $d = null) { return $t; }
function esc_html__($t, $d = null) { return $t; }
function esc_attr($t) { return $t; }
function esc_html($t) { return $t; }
function wp_unslash($v) { return $v; }
function wp_doing_ajax() { return $GLOBALS['ajax']; }
function is_admin() { return $GLOBALS['admin']; }
function wp_get_referer() { return 'https://example.test/submit-booking/'; }
function home_url($p = '/') { return 'https://example.test' . $p; }
function add_query_arg($k, $v, $url) { return $url . '?' . $k . '=' . $v; }
function wp_safe_redirect($url) { throw new DccRedirected($url); }
function sanitize_text_field($v) { return is_string($v) ? trim($v) : ''; }
function absint($v) { return abs((int) $v); }
function get_post_meta($id, $k, $s = false) { return ''; }
function did_action($h) { return 0; }

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-rest-guard.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-checkout-request.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-pet-service.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-guest-fields.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-extra-guest-service.php';

use DCC_Checkout\Config;
use DCC_Checkout\Pet_Service;
use DCC_Checkout\Guest_Fields;
use DCC_Checkout\Extra_Guest_Service;
use DCC_Checkout\Rest_Guard;
use DCC_Checkout\Checkout_Request;

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) {
        echo '      expected: ' . var_export($expected, true) . "\n";
        echo '      actual:   ' . var_export($actual, true) . "\n";
    }
}

/**
 * A tampering submission: 3 nights (the DAILY bucket) with the MONTHLY pet
 * service attached instead. find_violation() must call this 'pet'.
 */
function seed_violation(): void
{
    $ids = Config::pet_service_ids();
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SERVER['REQUEST_URI']    = '/submit-booking/';
    $_POST = [
        'mphb_check_in_date'  => '2026-10-01',
        'mphb_check_out_date' => '2026-10-04',      // 3 nights -> daily bucket
        'mphb_room_details'   => [
            0 => [
                'room_type_id' => 1065,
                'adults'       => 2,
                'services'     => [
                    0 => ['id' => $ids['monthly'], 'quantity' => 1],  // WRONG bucket
                ],
            ],
        ],
    ];
}

/** Run any backstop and report whether it tried to redirect. */
function ran_redirect($svc): bool
{
    try {
        $svc->validate_submission();
    } catch (DccRedirected $e) {
        return true;
    }
    return false;
}

$svc = new Pet_Service();

/* --- The violation must be detected at all. If this fails, every stand-down
   assertion below becomes vacuous -- they would all pass simply because
   nothing was ever going to redirect. This is the guard on the guards. */
seed_violation();
check('the tampering payload really is a violation', $svc->find_violation(), 'pet');

/* --- A plain browser POST: the backstop fires. ------------------------- */
seed_violation();
$GLOBALS['ajax'] = false; $GLOBALS['admin'] = false;
check('a plain POST with a tampered pet service IS redirected',
    ran_redirect($svc), true);

/* --- AJAX: it must NOT. A 302 here loses the booking. ------------------ */
seed_violation();
$GLOBALS['ajax'] = true; $GLOBALS['admin'] = false;
check('NEVER during AJAX -- a 302 would break MotoPress\'s JSON response',
    ran_redirect($svc), false);

/* --- wp-admin: it must NOT. An admin may attach a non-bucket service on
   purpose, and admin screens POST a room_details shape of their own. --- */
seed_violation();
$GLOBALS['ajax'] = false; $GLOBALS['admin'] = true;
check('NEVER in wp-admin -- a manual override is not tampering',
    ran_redirect($svc), false);

/* --- Both at once, for completeness. ---------------------------------- */
seed_violation();
$GLOBALS['ajax'] = true; $GLOBALS['admin'] = true;
check('and not when both are true', ran_redirect($svc), false);

/* --- The master switch stands the whole backstop down. ---------------- */
seed_violation();
$GLOBALS['ajax'] = false; $GLOBALS['admin'] = false;
$GLOBALS['opt']['dcc_checkout_settings'] = ['pet_fee_enabled' => 0];
Config::flush_cache();
check('with the pet flow switched off, nothing is enforced',
    ran_redirect($svc), false);
$GLOBALS['opt'] = [];
Config::flush_cache();

/* --- A NON-submission is never touched: a GET, or a POST that carries no
   room details, must not be evaluated at all. --------------------------- */
$_POST = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
check('a GET is not a checkout submission',
    \DCC_Checkout\Checkout_Request::is_checkout_submission(), false);
check('and is never redirected', ran_redirect($svc), false);

$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = ['mphb_check_in_date' => '2026-10-01'];
check('a POST with no room details is not a checkout submission',
    \DCC_Checkout\Checkout_Request::is_checkout_submission(), false);
check('and is never redirected either', ran_redirect($svc), false);

/* --- A CORRECT submission is left alone. Without this, "no redirect" above
   could just mean the detector says 'violation' to everything. --------- */
seed_violation();
$ids = Config::pet_service_ids();
$_POST['mphb_room_details'][0]['services'][0]['id'] = $ids['daily']; // right bucket
check('the right bucket for the stay length is NOT a violation',
    $svc->find_violation(), null);
check('and a correct booking is never redirected', ran_redirect($svc), false);

/* =====================================================================
 * THE SAME GUARANTEE, IN THE OTHER THREE FILES THAT CLAIM IT.
 *
 * Testing it once in Pet_Service would leave the other three carrying the
 * same sentence with nothing behind it -- and they are separate code paths,
 * not shared. Guest_Fields and Extra_Guest_Service each have their own copy
 * of the gate; a refactor could drop one and every test would stay green.
 * ===================================================================== */

/* --- Extra guest: 3 adults on a guest accommodation with NO extra-guest
   service attached is the tampering case ('guests'). The service ids must
   be seeded or the whole check stands down as unevaluable. -------------- */
function seed_guest_violation(): void
{
    $GLOBALS['opt']['dcc_checkout_settings'] = [
        'guest_fee_enabled'     => 1,
        'guest_service_daily'   => 901,
        'guest_service_weekly'  => 902,
        'guest_service_monthly' => 903,
    ];
    Config::flush_cache();
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SERVER['REQUEST_URI']    = '/submit-booking/';
    $_POST = [
        'mphb_check_in_date'  => '2026-10-01',
        'mphb_check_out_date' => '2026-10-04',
        'mphb_room_details'   => [
            0 => ['room_type_id' => 1065, 'adults' => 3, 'services' => []],
        ],
    ];
}

$extra = new Extra_Guest_Service();
seed_guest_violation();
check('extra guest: 3 adults with no fee attached really is a violation',
    $extra->find_violation(), 'guests');

seed_guest_violation();
$GLOBALS['ajax'] = false; $GLOBALS['admin'] = false;
check('extra guest: a plain POST IS redirected', ran_redirect($extra), true);

seed_guest_violation();
$GLOBALS['ajax'] = true;
check('extra guest: NEVER during AJAX', ran_redirect($extra), false);

seed_guest_violation();
$GLOBALS['ajax'] = false; $GLOBALS['admin'] = true;
check('extra guest: NEVER in wp-admin', ran_redirect($extra), false);
$GLOBALS['admin'] = false;

/* --- Guest-2 fields: 2 adults with a rendered-but-blank required field. -- */
function seed_guest2_violation(): void
{
    $GLOBALS['opt'] = [];
    Config::flush_cache();
    $names = [];
    foreach (Config::guest_field_groups() as $group) {
        if ((int) $group['min'] <= 2) {
            foreach ($group['names'] as $n) { $names[$n] = ''; }  // rendered, blank
        }
    }
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SERVER['REQUEST_URI']    = '/submit-booking/';
    $_POST = [
        'mphb_check_in_date'  => '2026-10-01',
        'mphb_check_out_date' => '2026-10-04',
        'mphb_room_details'   => [
            0 => ['room_type_id' => 1065, 'adults' => 2, 'services' => []],
        ],
        'customer_fields'     => $names,
    ];
}

$g2 = new Guest_Fields();
seed_guest2_violation();
check('guest 2: a blank rendered required field really is a violation',
    $g2->find_violation(), 'guest2');

seed_guest2_violation();
$GLOBALS['ajax'] = false; $GLOBALS['admin'] = false;
check('guest 2: a plain POST IS redirected', ran_redirect($g2), true);

seed_guest2_violation();
$GLOBALS['ajax'] = true;
check('guest 2: NEVER during AJAX', ran_redirect($g2), false);

seed_guest2_violation();
$GLOBALS['ajax'] = false; $GLOBALS['admin'] = true;
check('guest 2: NEVER in wp-admin', ran_redirect($g2), false);
$GLOBALS['admin'] = false;

/* --- A field that is NOT rendered must never be demanded. The comment says
   "if the owner hasn't enabled them, they won't submit and we must not
   reject on their absence" -- so an empty customer_fields is not a
   violation, and a booking is not blocked for a field nobody was shown. */
seed_guest2_violation();
$_POST['customer_fields'] = [];
check('guest 2: a field the owner never enabled is not demanded',
    $g2->find_violation(), null);
check('... and such a booking is never redirected', ran_redirect($g2), false);

/* =====================================================================
 * THE REST STAND-DOWN. Rest_Guard enforces the same rules with a JSON
 * error; the wp_loaded backstops must stand down on that route or the
 * guest gets a 302 instead. Nothing tested this path at all.
 * ===================================================================== */
$rg = new Rest_Guard();
$rg->register();                      // arms is_registered()
check('the REST guard reports itself armed once registered',
    Rest_Guard::is_registered(), true);

foreach ([
    '/wp-json/mphb/v1/checkout'                  => 'the pretty REST route',
    '/index.php?rest_route=/mphb/v1/checkout'    => 'the plain-permalink form',
    '/index.php?rest_route=%2Fmphb%2Fv1%2Fcheckout' => 'the URL-encoded form',
] as $uri => $label) {
    seed_violation();
    $_SERVER['REQUEST_URI'] = $uri;
    check("defer_to_rest() recognises $label", Checkout_Request::defer_to_rest(), true);
    check("... so the 302 backstop stands down there", ran_redirect($svc), false);
}

/* And an ordinary checkout URL must NOT be mistaken for the REST route --
   otherwise every browser POST would stand down and nothing is enforced. */
seed_violation();
$_SERVER['REQUEST_URI'] = '/submit-booking/';
check('an ordinary checkout URL is not the REST route',
    Checkout_Request::defer_to_rest(), false);
check('... so it is still enforced', ran_redirect($svc), true);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
