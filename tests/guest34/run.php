<?php
/**
 * The Guest 3 / Guest 4 switch (v0.24.0).
 *
 *     php tests/guest34/run.php
 *
 * WHAT THE SWITCH HAS TO DO, and why the interesting half is not the obvious one.
 *
 * "No extra-guest fee when the switch is off" is not something this plugin can
 * achieve by NOT doing something. Service 18063 is linked in MotoPress's OWN
 * mphb_services meta on room types 1065/1067/1069/1071, and MotoPress renders and
 * prices it without asking this plugin. So suppression is ACTIVE, and it must
 * fail closed: hidden in the UI *and* refused at submit, because a stale page, a
 * cached form or a crafted request can post a fee the owner switched off. A test
 * that only checks the field is absent from the rendered form is the happy path.
 *
 * So the load-bearing assertions here POST THE FEE WITH THE SWITCH OFF and
 * require a refusal. `wp_safe_redirect` is shimmed to throw, so the refusal is
 * observable and the process survives the `exit` that follows it.
 *
 * ABSENT MEANS ON is asserted first, because it is the promise that a site which
 * has never seen this setting behaves exactly as it did before it existed.
 */
define('ABSPATH', __DIR__);
define('DAY_IN_SECONDS', 86400);

class DccRedirected extends \Exception {}

$GLOBALS['opt']     = [];
$GLOBALS['ajax']    = false;
$GLOBALS['admin']   = false;
$GLOBALS['filters'] = [];   // hook => value to force

function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
function update_option($k, $v) { $GLOBALS['opt'][$k] = $v; return true; }
function delete_option($k) { unset($GLOBALS['opt'][$k]); return true; }
function apply_filters($hook, $value) {
    return array_key_exists($hook, $GLOBALS['filters']) ? $GLOBALS['filters'][$hook] : $value;
}
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
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function number_format_i18n($n, $d = 0) { return number_format((float) $n, (int) $d); }

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-rest-guard.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-checkout-request.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-extra-guest-service.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-guest-fields.php';

use DCC_Checkout\Config;
use DCC_Checkout\Extra_Guest_Service;
use DCC_Checkout\Guest_Fields;

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

/** Put the site in the owner's live configuration. */
function seed_live_config(): void
{
    $GLOBALS['filters'] = [];
    $GLOBALS['opt'] = [
        'dcc_checkout_settings' => [
            'guest_fee_enabled'     => 1,
            'guest_fee_amount'      => 50.0,
            'guest_service_daily'   => 18063,
            'guest_service_weekly'  => 18063,
            'guest_service_monthly' => 18063,
        ],
    ];
    Config::flush_cache();
}

function switch_off(): void { $GLOBALS['opt'][Config::GUEST34_OPTION] = ''; }
function switch_on(): void  { $GLOBALS['opt'][Config::GUEST34_OPTION] = '1'; }

/** A booking for 3 adults on a fee-bearing cottage, with the fee attached. */
function seed_post_with_fee(): void
{
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SERVER['REQUEST_URI']    = '/submit-booking/';
    $_POST = [
        'mphb_check_in_date'  => '2026-10-01',
        'mphb_check_out_date' => '2026-10-04',
        'mphb_room_details'   => [
            0 => [
                'room_type_id' => 1065,
                'adults'       => 3,
                'services'     => [0 => ['id' => 18063, 'adults' => 1]],
            ],
        ],
    ];
}

function ran_redirect($svc): bool
{
    try { $svc->validate_submission(); } catch (DccRedirected $e) { return true; }
    return false;
}

$eg = new Extra_Guest_Service();

/* ===================================================================== *
 * ABSENT MEANS ON. The contract with the Cottage Selector starts here.
 * ===================================================================== */
seed_live_config();
check('the option is genuinely absent to start with',
    array_key_exists(Config::GUEST34_OPTION, $GLOBALS['opt']), false);
check('ABSENT MEANS ON', Config::guest34_enabled(), true);
check('... so the fee is enabled on a site that has never seen the setting',
    Config::guest_fee_enabled(), true);
check('... and active, since the service ids are configured',
    Config::guest_fee_active(), true);

/* --- The stored shapes. This plugin writes '1' / '' and reads leniently. */
seed_live_config();
foreach ([['1', true], [1, true], ['', false], ['0', false], [0, false],
          ['yes', false], ['true', false]] as [$stored, $want]) {
    $GLOBALS['opt'][Config::GUEST34_OPTION] = $stored;
    check('stored ' . var_export($stored, true) . ' reads as ' . ($want ? 'ON' : 'OFF'),
        Config::guest34_enabled(), $want);
}

/* --- Deleting the option must return the site to ON, not to OFF. A stored
   '' that is later removed is the uninstall-a-setting case. */
seed_live_config();
switch_off();
check('with the switch off, the fee is off', Config::guest_fee_enabled(), false);
delete_option(Config::GUEST34_OPTION);
check('deleting the option returns the site to ON', Config::guest34_enabled(), true);
check('... and the fee with it', Config::guest_fee_enabled(), true);

/* ===================================================================== *
 * THE SWITCH BEATS THE FILTER, AND IT BEATS IT FIRST.
 * A snippet must not be able to re-enable a fee the owner switched off.
 * ===================================================================== */
seed_live_config();
switch_off();
$GLOBALS['filters']['dcc_checkout_guest_fee_enabled'] = true;
check('a filter cannot switch the fee back on behind the master switch',
    Config::guest_fee_enabled(), false);
$GLOBALS['filters'] = [];

/* --- But the switch itself is filterable, which is how a snippet or the
   Cottage Selector's own tests can drive it. */
seed_live_config();
$GLOBALS['filters']['dcc_guest34_enabled'] = false;
check('the switch itself is filterable', Config::guest34_enabled(), false);
check('... and that turns the fee off too', Config::guest_fee_enabled(), false);
$GLOBALS['filters'] = [];

/* ===================================================================== *
 * THE LOAD-BEARING HALF: THE FEE IS REFUSED, NOT MERELY HIDDEN.
 *
 * MotoPress links service 18063 itself, so the fee can arrive from a stale
 * page or a crafted request whatever the checkout rendered. Each of these
 * POSTS IT with the switch off and requires a refusal.
 * ===================================================================== */
seed_live_config();
switch_on();
seed_post_with_fee();
check('CONTROL: with the switch ON, a correct 3-guest booking is accepted',
    $eg->find_violation(), null);
check('... and is not redirected', ran_redirect($eg), false);

seed_live_config();
switch_off();
seed_post_with_fee();
check('THE FEE POSTED WITH THE SWITCH OFF IS A VIOLATION',
    $eg->find_violation(), 'guests');
check('... and the submission is actually refused',
    ran_redirect($eg), true);

/* --- 3 guests with NO fee attached is refused too: with the offering off,
   nobody may exceed the included count, so a guest cannot simply omit the
   fee and book four people free. */
seed_live_config();
switch_off();
seed_post_with_fee();
$_POST['mphb_room_details'][0]['services'] = [];
check('3 guests with the fee OMITTED is also refused',
    $eg->find_violation(), 'guests');
check('... and redirected', ran_redirect($eg), true);

/* --- A 2-guest booking is untouched by the switch in either state. Guest 2
   is not part of the offering. */
foreach ([['on', true], ['off', false]] as [$label, $on]) {
    seed_live_config();
    $on ? switch_on() : switch_off();
    seed_post_with_fee();
    $_POST['mphb_room_details'][0]['adults']   = 2;
    $_POST['mphb_room_details'][0]['services'] = [];
    check("a 2-guest booking is fine with the switch $label",
        $eg->find_violation(), null);
    check("... and not redirected with the switch $label",
        ran_redirect($eg), false);
}

/* --- The REST path refuses it as well. Rest_Guard calls the same
   find_violation(), so the assertion that matters is that the 302 backstop
   stands down there while the violation is still detected. */
seed_live_config();
switch_off();
seed_post_with_fee();
(new \DCC_Checkout\Rest_Guard())->register();
$_SERVER['REQUEST_URI'] = '/wp-json/mphb/v1/checkout';
check('on the REST route the violation is still found',
    $eg->find_violation(), 'guests');
check('... and the 302 stands down, because Rest_Guard answers in JSON',
    ran_redirect($eg), false);

/* ===================================================================== *
 * v0.25.1 — included_guests = 0 MUST NOT BE REACHABLE, because it is an
 * outage. Constructed here: the accessor is driven to 0 through its filter
 * (the sanitiser is the other guard and is tested in tests/settings), and a
 * one-guest booking must still go through on both paths that read it.
 * ===================================================================== */
seed_live_config();
$GLOBALS['filters']['dcc_checkout_included_guests'] = 0;
check('outage guard: the accessor floors a 0 to 1', Config::included_guests(), 1);

/* Path 1: fee ON, a non-guest accommodation (Cottage 33 = 1604) is capped at
   `included`. At 0 a single guest would be refused. */
switch_on();
seed_post_with_fee();
$_POST['mphb_room_details'][0] = ['room_type_id' => 1604, 'adults' => 1, 'services' => []];
check('outage guard: one guest on Cottage 33 is NOT refused', $eg->find_violation(), null);

/* Path 2: switch OFF, every room is capped at `included`. At 0 every booking
   with any adults would be refused. */
switch_off();
seed_post_with_fee();
$_POST['mphb_room_details'][0] = ['room_type_id' => 1065, 'adults' => 1, 'services' => []];
check('outage guard: one guest with the switch off is NOT refused', $eg->find_violation(), null);
$GLOBALS['filters'] = [];

/* ===================================================================== *
 * THE FIELDS HALF — and the line decision 1 draws.
 * ===================================================================== */
seed_live_config();
switch_on();
check('switch ON: three groups are collected',
    array_keys(Config::collected_guest_field_groups()), [2, 3, 4]);

switch_off();
check('switch OFF: only guest 2 is collected',
    array_keys(Config::collected_guest_field_groups()), [2]);
check('switch OFF: the FULL list is unchanged — this is what the admin screen '
    . 'uses, so an existing booking still shows its Guest 3 details',
    array_keys(Config::guest_field_groups()), [2, 3, 4]);

/* --- The server backstop stops demanding guest 3/4 fields, and keeps
   demanding guest 2's. A blank rendered field is the violation case. */
function seed_blank_guest_fields(int $adults): void
{
    $names = [];
    foreach (Config::guest_field_groups() as $group) {   // FULL: render them all
        foreach ($group['names'] as $n) { $names[$n] = ''; }
    }
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SERVER['REQUEST_URI']    = '/submit-booking/';
    $_POST = [
        'mphb_check_in_date'  => '2026-10-01',
        'mphb_check_out_date' => '2026-10-04',
        'mphb_room_details'   => [
            0 => ['room_type_id' => 1065, 'adults' => $adults, 'services' => []],
        ],
        'customer_fields'     => $names,
    ];
}

$gf = new Guest_Fields();

seed_live_config();
switch_on();
seed_blank_guest_fields(3);
check('switch ON: blank guest 3 names are demanded', $gf->find_violation(), 'guest2');

seed_live_config();
switch_off();
seed_blank_guest_fields(3);
/* Guest 2's fields are blank here too, and guest 2 is NOT part of the switch,
   so this is still a violation -- via group 2. Asserted separately below with
   guest 2 filled, which is the case that isolates groups 3 and 4. */
check('switch OFF: guest 2 is still demanded', $gf->find_violation(), 'guest2');

seed_live_config();
switch_off();
seed_blank_guest_fields(3);
foreach (Config::guest2_field_name_list() as $n) {
    $_POST['customer_fields'][$n] = 'filled';
}
check('switch OFF: with guest 2 filled, blank guest 3/4 names are NOT demanded',
    $gf->find_violation(), null);

seed_live_config();
switch_on();
seed_blank_guest_fields(3);
foreach (Config::guest2_field_name_list() as $n) {
    $_POST['customer_fields'][$n] = 'filled';
}
check('switch ON: the same payload IS a violation, so the test above is not vacuous',
    $gf->find_violation(), 'guest2');

/* ===================================================================== *
 * WHAT THE SETTINGS PAGE WRITES. Read leniently, write strictly -- so the
 * stored shape is asserted at the writing end too, or "we write '1' / ''"
 * is just a sentence in a docblock.
 * ===================================================================== */
require __DIR__ . '/../../dcc-custom-checkout/includes/class-settings.php';
$settings = new \DCC_Checkout\Settings();
check('a ticked box stores exactly \'1\'', $settings->sanitize_guest34('1'), '1');
check('an UNTICKED box stores \'\', which is what the hidden field makes possible',
    $settings->sanitize_guest34(''), '');
check('and anything unexpected stores \'\' rather than being passed through',
    [$settings->sanitize_guest34('yes'), $settings->sanitize_guest34(null),
     $settings->sanitize_guest34(0), $settings->sanitize_guest34('on')],
    ['', '', '', '']);
/* The round trip is what actually matters: what the page writes must read
   back as the state the owner chose. */
seed_live_config();
$GLOBALS['opt'][Config::GUEST34_OPTION] = $settings->sanitize_guest34('1');
check('round trip: ticked -> ON', Config::guest34_enabled(), true);
$GLOBALS['opt'][Config::GUEST34_OPTION] = $settings->sanitize_guest34('');
check('round trip: unticked -> OFF', Config::guest34_enabled(), false);

/* ===================================================================== *
 * THE FEE LABEL follows the same switch.
 * ===================================================================== */
seed_live_config();
switch_on();
check('switch ON: the fee is offered, so a label can be built',
    !empty(Config::offered_guest_fee_steps()), true);
switch_off();
check('switch OFF: nothing is offered, so no label can state a price',
    Config::offered_guest_fee_steps(), []);

/* --- AND THE LINE DECISION 1 DRAWS, AGAIN. The FULL ladder is unchanged,
   because Admin_Fields prices the fee an EXISTING booking actually carries.
   Gating the wrong one of these two would have stripped the price label off
   past bookings in wp-admin -- the first version of this change did exactly
   that, and it was caught by asking who called it, not by this suite. */
check('switch OFF: the FULL ladder is untouched, so wp-admin can still price '
    . 'a fee a past booking really carries',
    !empty(Config::guest_fee_steps()), true);
check('... and it is the same ladder as when the switch is on',
    Config::guest_fee_steps(), (static function () { switch_on(); $x = Config::guest_fee_steps(); switch_off(); return $x; })());

/* --- The owner's live amount, changed 2026-09-19 with his approval: 50.
   Pinned because the two-line "$50/night / x N guests" detail depends on it
   being non-zero, and it was 0 for the whole time that code existed. */
seed_live_config();
check('the live guest_fee_amount is 50, not 0', Config::guest_fee_amount(), 50.0);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
