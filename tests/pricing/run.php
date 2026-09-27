<?php
/**
 * Pet-fee bucket tests: Config::service_id_for_nights(), and the JS mirror.
 *
 *     php tests/pricing/run.php
 *
 * WHY THIS EXISTS (added by the 2026-09-19 sweep). This function chooses which
 * MotoPress service a stay is charged under, so it decides what a guest pays.
 * It had no test of any kind, in either language, and there are TWO
 * implementations of it: Config::service_id_for_nights() here, and
 * serviceForNights() in assets/checkout.js, whose comment says "Mirrors
 * Config::service_id_for_nights() -- keep the two in step" with nothing
 * enforcing that. The mirror check below is that enforcement: it extracts the
 * JS function from the shipped file and runs it over the same night counts.
 *
 * The boundaries are the point. 6 vs 7 and 29 vs 30 are where a night moves
 * between a $25 and a $20 rate, and an off-by-one there is invisible on the
 * page -- the guest simply pays the wrong amount.
 */
define('ABSPATH', __DIR__);

$GLOBALS['opt'] = [];
function get_option($k, $d = []) { return $GLOBALS['opt'][$k] ?? $d; }
function apply_filters($h, $v) { return $v; }
function esc_html__($t, $d = null) { return $t; }
function __($t, $d = null) { return $t; }
function esc_attr($t) { return $t; }
function esc_html($t) { return $t; }
function wp_parse_args($a, $d) { return array_merge($d, (array) $a); }

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';

use DCC_Checkout\Config;

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

$ids = Config::pet_service_ids();
$t   = Config::bucket_thresholds();

/* --- The shipped defaults match the live configuration FOR THE PET FEE.
   Confirmed from dcc_checkout_settings on live, 2026-09-19. Pinned because
   it is what makes the pet assertions below meaningful: three DISTINCT
   services, so a wrong bucket is visible in the returned id. The rate
   genuinely varies by stay length (the owner confirmed it does on Cottage
   34), which is why this fee has three and the extra-guest fee has one. */
check('default thresholds are 2 / 7 / 30',
    [$t['min_daily'], $t['min_weekly'], $t['min_monthly']], [2, 7, 30]);
check('the pet buckets are three DISTINCT services, as on live',
    [$ids['daily'], $ids['weekly'], $ids['monthly']], [17712, 17711, 14926]);
check('... so a pet bucket bug is observable in the value',
    count(array_unique(array_values($ids))), 3);

/* --- 0 nights means "stay length unknown" and must charge NOTHING. ------
   Returning a real service ID here would attach a pet fee to a booking
   whose dates could not be read. */
check('0 nights charges nothing', Config::service_id_for_nights(0), 0);
check('a negative night count charges nothing', Config::service_id_for_nights(-3), 0);

/* --- The daily bucket has no lower bound (since 0.3.5): the fee applies
   from night one, so min_daily is NOT a floor on being charged. --------- */
check('1 night is the daily bucket, not nothing',
    Config::service_id_for_nights(1), $ids['daily']);

/* --- The two boundaries where money changes. ---------------------------- */
check('6 nights is still daily',   Config::service_id_for_nights(6),  $ids['daily']);
check('7 nights becomes weekly',   Config::service_id_for_nights(7),  $ids['weekly']);
check('29 nights is still weekly', Config::service_id_for_nights(29), $ids['weekly']);
check('30 nights becomes monthly', Config::service_id_for_nights(30), $ids['monthly']);
check('a long stay stays monthly', Config::service_id_for_nights(400), $ids['monthly']);

/* --- The thresholds come from the settings option, so a changed setting
   must actually move the boundary -- otherwise the admin screen lies. --- */
$GLOBALS['opt']['dcc_checkout_settings'] = ['min_weekly' => 4, 'min_monthly' => 10];
Config::flush_cache();
$ids2 = Config::pet_service_ids();
check('a changed min_weekly moves the boundary',
    [Config::service_id_for_nights(3), Config::service_id_for_nights(4)],
    [$ids2['daily'], $ids2['weekly']]);
check('a changed min_monthly moves the boundary',
    [Config::service_id_for_nights(9), Config::service_id_for_nights(10)],
    [$ids2['weekly'], $ids2['monthly']]);
$GLOBALS['opt'] = [];
Config::flush_cache();

/* =====================================================================
 * THE EXTRA-GUEST FEE -- the same shape again, and the one CLAUDE.md warns
 * hardest about ("would silently stop charging the $50 extra-guest fee").
 *
 * This is a SECOND pair: Config::guest_service_id_for_nights() and
 * guestServiceForNights() in checkout.js. Four copies of the bucket logic
 * ship in total, across two languages, each pair carrying its own "keep the
 * two in step" comment. The sweep found them only because a mutation came
 * back STALE on "pattern found 2x" -- so the count is asserted here too.
 * ===================================================================== */
/* THE SHIPPED DEFAULTS FOR THESE THREE IDs ARE ALL 0, so testing this
   function against them compares 0 to 0 at every night count and cannot
   fail. The first draft of this file did exactly that -- eight assertions,
   all green, all vacuous, caught only when the mutation runner killed
   nothing. So the buckets are seeded with DISTINCT ids here: a boundary
   bug has to be visible in the value to be visible at all. */
check('the shipped defaults really are 0 -- this is why the seeding below matters',
    array_values(Config::guest_service_ids()), [0, 0, 0]);

$GLOBALS['opt']['dcc_checkout_settings'] = [
    'guest_service_daily'   => 901,
    'guest_service_weekly'  => 902,
    'guest_service_monthly' => 903,
];
Config::flush_cache();
$g = Config::guest_service_ids();
check('the seeded ids are distinct, so a wrong bucket is observable',
    count(array_unique(array_values($g))), 3);

check('0 nights charges no extra guest', Config::guest_service_id_for_nights(0), 0);
check('a negative night count charges no extra guest',
    Config::guest_service_id_for_nights(-1), 0);
check('1 night still bills the extra guest -- the fee is flat, from night one',
    Config::guest_service_id_for_nights(1), 901);
check('extra guest: 6 nights is daily',   Config::guest_service_id_for_nights(6),  901);
check('extra guest: 7 nights is weekly',  Config::guest_service_id_for_nights(7),  902);
check('extra guest: 29 nights is weekly', Config::guest_service_id_for_nights(29), 902);
check('extra guest: 30 nights is monthly',Config::guest_service_id_for_nights(30), 903);

/* THE LIVE CONFIGURATION attaches one service (18063) to all three
   extra-guest buckets -- measured, 2026-09-19 -- so a boundary bug on the
   real site is invisible in the ID. That may well be deliberate: a flat $50
   regardless of stay length. Do NOT change the config to match the pet
   pattern on the strength of this test.
   Note also what is NOT zero on live: the service ids are all 18063 and the
   fee does charge $50. The zero on live is `guest_fee_amount`, which is this
   plugin's own setting and drives the LABEL, not the charge. */
$GLOBALS['opt']['dcc_checkout_settings'] = [
    'guest_service_daily'   => 18063,
    'guest_service_weekly'  => 18063,
    'guest_service_monthly' => 18063,
];
Config::flush_cache();
check('live-shaped config: one service for every bucket, so a bucket bug hides',
    count(array_unique(array_values(Config::guest_service_ids()))), 1);
check('and 0 nights still charges nothing even then',
    Config::guest_service_id_for_nights(0), 0);

/* --- THE MIRROR. assets/checkout.js carries its own copy of this logic. -
   Build a table from PHP and hand it to node, which extracts the JS
   function from the SHIPPED file and runs it over the same inputs. A
   missing node is reported as a failure, never skipped quietly: a check
   that did not run must not read as a check that passed. */
$nights = [0, -3, 1, 2, 6, 7, 8, 29, 30, 31, 400];
$table  = [];
foreach ($nights as $n) { $table[(string) $n] = Config::service_id_for_nights($n); }
/* Seed distinct ids again for the mirror table, for the same reason. */
$GLOBALS['opt']['dcc_checkout_settings'] = [
    'guest_service_daily'   => 901,
    'guest_service_weekly'  => 902,
    'guest_service_monthly' => 903,
];
Config::flush_cache();
$g = Config::guest_service_ids();
$gtable = [];
foreach ($nights as $n) { $gtable[(string) $n] = Config::guest_service_id_for_nights($n); }
$payload = [
    'thresholds'      => Config::bucket_thresholds(),
    'serviceIds'      => $ids,
    'guestServiceIds' => $g,
    'expected'        => $table,
    'expectedGuest'   => $gtable,
];
$tmp = sys_get_temp_dir() . '/dcc-pricing-' . getmypid() . '.json';
file_put_contents($tmp, json_encode($payload));
$mirror = __DIR__ . '/mirror.js';
exec('node ' . escapeshellarg($mirror) . ' ' . escapeshellarg($tmp) . ' 2>&1', $out, $code);
@unlink($tmp);
echo implode("\n", $out) . "\n";
if ($code !== 0) {
    $failures++;
    echo "FAIL  the JS mirror check did not run or did not agree (exit $code)\n";
}

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
