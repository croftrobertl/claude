<?php
/**
 * Settings: defaults, the upgrade path, and sanitisation (v0.25.0).
 *
 *     php tests/settings/run.php
 *
 * THE FIRST REQUIREMENT IS THE DANGEROUS ONE. "Defaults must reproduce current
 * behaviour exactly" is a claim about a checkout, where a silent behaviour
 * change is a lost booking. So the literals the code used BEFORE these settings
 * existed are pinned here by value, not described: 2 included guests, an 8-long
 * fee ladder, an 8 fallback range and a 20 ceiling on the booking screen.
 *
 * THE DOCUMENTED UPGRADE TRAP DOES NOT APPLY TO THIS PLUGIN, and this suite is
 * where that is established rather than asserted. The trap is "a new version's
 * defaults do not merge into an already-stored row, so new features look
 * switched off". Config::settings() merges at READ time --
 * array_merge(defaults(), $saved) on every call -- so a row stored by an older
 * version picks the new keys up immediately. That is tested below with a row
 * that contains only pre-0.25.0 keys.
 */
define('ABSPATH', __DIR__);

$GLOBALS['opt']     = [];
$GLOBALS['filters'] = [];

function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
function update_option($k, $v) { $GLOBALS['opt'][$k] = $v; return true; }
function delete_option($k) { unset($GLOBALS['opt'][$k]); return true; }
function apply_filters($hook, $value) {
    return array_key_exists($hook, $GLOBALS['filters']) ? $GLOBALS['filters'][$hook] : $value;
}
function add_action() {} function add_filter() {}
function __($t, $d = null) { return $t; }
function esc_html__($t, $d = null) { return $t; }
function esc_attr__($t, $d = null) { return $t; }
function esc_html($t) { return $t; } function esc_attr($t) { return $t; }
function sanitize_text_field($v) { return is_string($v) ? trim($v) : ''; }
function sanitize_key($v) { return is_string($v) ? strtolower(preg_replace('/[^a-z0-9_\-]/i', '', $v)) : ''; }
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function number_format_i18n($n, $d = 0) { return number_format((float) $n, (int) $d); }
function wp_parse_args($a, $b) { return array_merge($b, (array) $a); }
function get_post_meta($id, $k, $s = false) { return ''; }
// v0.30.0: the refund-page picker keeps an ID only if it names a page.
$GLOBALS['post_types'] = [2394 => 'page', 3001 => 'page', 18063 => 'mphb_room_service'];
function get_post_type($id) { return $GLOBALS['post_types'][(int) $id] ?? false; }
function did_action($h) { return 0; }
// WordPress's checked(): compares the two as STRINGS, as core does.
function checked($a, $b = true, $echo = true) {
    $r = ((string) $a === (string) $b) ? " checked='checked'" : '';
    if ($echo) { echo $r; }
    return $r;
}

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-settings.php';

use DCC_Checkout\Config;
use DCC_Checkout\Settings;

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
function fresh() { $GLOBALS['opt'] = []; $GLOBALS['filters'] = []; Config::flush_cache(); }

/* ===================================================================== *
 * 1. DEFAULTS REPRODUCE THE PRE-0.25.0 LITERALS, BY VALUE.
 * ===================================================================== */
fresh();
check('included_guests defaults to 2', Config::included_guests(), 2);
check('the fee ladder defaults to 8 steps', Config::guest_fee_steps_max(), 8);
check('the admin fallback range defaults to 8', Config::admin_guest_fallback(), 8);
check('the admin ceiling defaults to 20', Config::admin_guest_max(), 20);

/* The ladder's LENGTH is what the old default parameter produced. Seed an
   amount so the ladder is non-empty, then count it. */
$GLOBALS['opt']['dcc_checkout_settings'] = ['guest_fee_amount' => 50.0];
Config::flush_cache();
check('the default ladder has exactly 8 rungs, as $max_extra = 8 produced',
    count(Config::guest_fee_steps()), 8);
check('an explicit argument still wins, so old callers are unchanged',
    count(Config::guest_fee_steps(3)), 3);
check('the OFFERED ladder honours the setting too -- it is the checkout path',
    count(Config::offered_guest_fee_steps()), 8);

/* The setting must actually move the ladder, or it is decoration. */
$GLOBALS['opt']['dcc_checkout_settings'] = ['guest_fee_amount' => 50.0, 'guest_fee_steps_max' => 3];
Config::flush_cache();
check('raising/lowering the setting moves the real ladder',
    count(Config::guest_fee_steps()), 3);
check('...and the offered ladder with it',
    count(Config::offered_guest_fee_steps()), 3);

/* ===================================================================== *
 * 2. THE UPGRADE PATH. A row stored by an older version -- containing NONE
 *    of the v0.25.0 keys -- must read as the new defaults, not as 0/empty.
 *    This is the "new features silently look switched off" trap, tested by
 *    constructing the pre-upgrade row rather than by reasoning about it.
 * ===================================================================== */
fresh();
$GLOBALS['opt']['dcc_checkout_settings'] = [
    // A plausible pre-0.25.0 row: real keys, real values, no new ones.
    'guest_fee_enabled'     => 1,
    'guest_fee_amount'      => 50.0,
    'guest_service_daily'   => 18063,
    'guest_service_weekly'  => 18063,
    'guest_service_monthly' => 18063,
    'included_guests'       => 2,
];
Config::flush_cache();
check('an old stored row has none of the new keys',
    array_intersect(['guest_fee_steps_max', 'admin_guest_fallback', 'admin_guest_max'],
        array_keys($GLOBALS['opt']['dcc_checkout_settings'])), []);
check('...yet the new keys read as their defaults, not as 0',
    [Config::guest_fee_steps_max(), Config::admin_guest_fallback(), Config::admin_guest_max()],
    [8, 8, 20]);
check('...and the values the owner DID store still win',
    [Config::guest_fee_amount(), Config::included_guests()], [50.0, 2]);
check('the ladder is still 8 rungs on that old row — nothing looks switched off',
    count(Config::guest_fee_steps()), 8);

/* A stored 0 is an explicit choice and must NOT be overwritten by the default:
   the merge direction matters, and getting it backwards would silently undo
   the owner's settings on every read. */
/* Probe with 1 (default is 2): distinct from the default, and NOT subject to
   the floor of 1. The first version stored 0 here, which the v0.25.1 floor
   correctly lifts to 1 -- the merge-direction claim was never in doubt, the
   probe value was. */
fresh();
$GLOBALS['opt']['dcc_checkout_settings'] = ['included_guests' => 1];
Config::flush_cache();
check('a stored value beats the default — saved values win over defaults',
    Config::included_guests(), 1);

/* ===================================================================== *
 * 3. SANITISATION. Bad input falls back to the DEFAULT, never to 0 and
 *    never to the posted value. On a checkout, "0 guests included" arriving
 *    from a malformed POST would silently start charging from guest one.
 * ===================================================================== */
fresh();
$settings = new Settings();
$base = [
    'guest_fee_enabled' => 1,
    'included_guests' => 2, 'guest_fee_steps_max' => 8,
    'admin_guest_fallback' => 8, 'admin_guest_max' => 20,
];

$out = $settings->sanitize($base);
check('a clean round trip preserves every advanced value',
    [$out['included_guests'], $out['guest_fee_steps_max'],
     $out['admin_guest_fallback'], $out['admin_guest_max']], [2, 8, 8, 20]);

foreach ([
    ['a missing key',            null,        'guest_fee_steps_max', 8],
    ['a non-numeric string',     'lots',      'guest_fee_steps_max', 8],
    ['an empty string',          '',          'guest_fee_steps_max', 8],
    ['a negative number',        -5,          'guest_fee_steps_max', 8],
    ['zero where 1 is the floor', 0,          'guest_fee_steps_max', 8],
    ['an absurd number',         9999,        'guest_fee_steps_max', 8],
    ['an absurd admin ceiling',  9999,        'admin_guest_max',     20],
    ['an absurd included count', 9999,        'included_guests',     2],
    ['an array',                 ['x'],       'admin_guest_fallback', 8],
] as [$label, $value, $key, $want]) {
    $in = $base;
    if ($value === null) { unset($in[$key]); } else { $in[$key] = $value; }
    $got = $settings->sanitize($in);
    check("sanitise: $label for $key falls back to the default", $got[$key], $want);
}

/* A value inside range must survive, or the clamp is just a reset. */
$in = $base; $in['guest_fee_steps_max'] = 12;
check('sanitise: an in-range value is kept', $settings->sanitize($in)['guest_fee_steps_max'], 12);
/* v0.25.1 — THIS ASSERTION USED TO SAY THE OPPOSITE. The first version
   accepted 0 as "a coherent configuration". It is a booking outage: the
   server refuses `adults > included` while the Guest 3/4 switch is off, and
   on Cottages 33/34 always. The test encoded the belief; the self-audit
   caught it before the zip was installed. tests/guest34 now constructs the
   outage directly. */
$in = $base; $in['included_guests'] = 0;
check('sanitise: 0 included guests is REFUSED and falls back to 2',
    $settings->sanitize($in)['included_guests'], 2);

/* The accessor has the same floor, because a filter bypasses the sanitiser
   and checkout.js treats 0 as "unset" and uses 2 -- PHP and JS must agree. */
fresh();
$GLOBALS['filters']['dcc_checkout_included_guests'] = 0;
check('a filter returning 0 is floored to 1, keeping PHP in step with the JS',
    Config::included_guests(), 1);
$GLOBALS['filters']['dcc_checkout_included_guests'] = -5;
check('...and a negative value likewise', Config::included_guests(), 1);
fresh();

/* The couch note follows the setting the only safe way: by disappearing. */
fresh();
check('at the default, the offered couch note IS the pinned literal',
    Config::offered_couch_note(), Config::couch_note_text());
$GLOBALS['opt']['dcc_checkout_settings'] = ['included_guests' => 3];
Config::flush_cache();
check('at any other included count the note is withheld rather than shown false',
    Config::offered_couch_note(), '');

/* ===================================================================== *
 * 4. THE CEILING CANNOT BE RAISED BY A SETTING OR A FILTER.
 *    Admin_Guests clamps admin_guest_max with its own constant, because the
 *    range drives an <option> loop partly fed from the database.
 * ===================================================================== */
fresh();
$GLOBALS['filters']['dcc_checkout_admin_guest_max'] = 9999;
check('a filter cannot push the ceiling past the accessor bound',
    Config::admin_guest_max(), 50);
fresh();
$GLOBALS['filters']['dcc_checkout_guest_fee_steps_max'] = 100000;
check('nor the ladder length', Config::guest_fee_steps_max(), 50);
fresh();
$GLOBALS['filters']['dcc_checkout_admin_guest_fallback'] = 9999;
check('the fallback is clamped to the ceiling, not to its own bound',
    Config::admin_guest_fallback(), Config::admin_guest_max());

/* ===================================================================== *
 * 5. THE PREVIEW SHOWS WHAT A GUEST SEES — UNDER THE CURRENT SWITCHES.
 *    It is headed "What the guest sees" and it is the owner's instrument for
 *    checking money copy. Until 0.25.2 it read the UNGATED pair
 *    (guest_fee_steps + couch_note_text), so with Guests 3/4 off, or
 *    included_guests not 2, it showed "(+$50/night)" labels and a couch note
 *    that no guest would ever see. Every case is constructed; the first one
 *    is the guard on the guards — the labels and note DO render when they
 *    should, so their absence below means something.
 * ===================================================================== */
function preview_html(): string {
    $m = new ReflectionMethod(Settings::class, 'render_guest_copy_preview');
    $m->setAccessible(true);
    ob_start();
    $m->invoke(new Settings());
    return (string) ob_get_clean();
}
function fee_on_row(array $extra = []): array {
    return array_merge([
        'guest_fee_enabled' => 1, 'guest_fee_amount' => 50,
        'guest_service_daily' => 18063, 'guest_service_weekly' => 18063,
        'guest_service_monthly' => 18063,
    ], $extra);
}
$literal = Config::couch_note_text();

fresh();
$GLOBALS['opt'][Config::OPTION] = fee_on_row();
$h = preview_html();
check('preview, fee on: the guard — "(+" labels DO render', strpos($h, '(+') !== false, true);
check('preview, fee on: the guard — the couch note DOES render', strpos($h, $literal) !== false, true);

fresh();
$GLOBALS['opt'][Config::OPTION] = fee_on_row();
$GLOBALS['opt'][Config::GUEST34_OPTION] = '';
$h = preview_html();
check('preview, Guests 3/4 OFF: no "(+" label is shown', strpos($h, '(+'), false);
check('preview, Guests 3/4 OFF: no couch note is shown', strpos($h, $literal), false);
check('preview, Guests 3/4 OFF: it says the dropdown is capped',
    strpos($h, 'capped at 2') !== false, true);

fresh();
$GLOBALS['opt'][Config::OPTION] = fee_on_row(['guest_fee_enabled' => 0]);
$h = preview_html();
check('preview, fee setting OFF (switch on): no "(+" label is shown', strpos($h, '(+'), false);

fresh();
$GLOBALS['opt'][Config::OPTION] = fee_on_row(['included_guests' => 3]);
$h = preview_html();
check('preview, 3 included: the couch note (which says 1-2) is NOT shown', strpos($h, $literal), false);
check('preview, 3 included: guest 3 carries no fee label', strpos($h, '<code>3 (+'), false);
check('preview, 3 included: guest 4 carries the first step', strpos($h, '<code>4 (+') !== false, true);

/* ===================================================================== *
 * 6. THE "GUESTS 3 AND 4" BOX SHOWS THE STORED VALUE (owner decision
 *    2026-09-27, 0.26.0). Rendered, not inferred: the row is drawn and the
 *    checkbox's `checked` read off the markup. The last two cases are the
 *    reason for the decision — with the hook gone a filter cannot make the
 *    box disagree with storage, so a save cannot persist an override.
 * ===================================================================== */
function guest34_box_checked(): ?bool {
    $m = new ReflectionMethod(Settings::class, 'render_guest34_row');
    $m->setAccessible(true);
    ob_start();
    $m->invoke(new Settings());
    $h = (string) ob_get_clean();
    if (!preg_match('/<input type="checkbox"[^>]*>/', $h, $box)) { return null; }
    return strpos($box[0], "checked='checked'") !== false;
}
fresh();
check('the guard: the row really renders a checkbox', guest34_box_checked() !== null, true);
fresh();
check('nothing stored (absent = ON): the box is ticked', guest34_box_checked(), true);
fresh(); $GLOBALS['opt'][Config::GUEST34_OPTION] = '1';
check("stored '1': ticked", guest34_box_checked(), true);
fresh(); $GLOBALS['opt'][Config::GUEST34_OPTION] = '';
check("stored '': unticked", guest34_box_checked(), false);
fresh(); $GLOBALS['opt'][Config::GUEST34_OPTION] = '1';
$GLOBALS['filters']['dcc_guest34_enabled'] = false;
check("stored '1' with a filter saying OFF: still ticked — the box shows storage", guest34_box_checked(), true);
fresh(); $GLOBALS['opt'][Config::GUEST34_OPTION] = '';
$GLOBALS['filters']['dcc_guest34_enabled'] = true;
check("stored '' with a filter saying ON: still unticked", guest34_box_checked(), false);

/* =====================================================================
 * v0.30.0 -- the Cancellation & Refund Policy page picker. A PAGE ID, never
 * a URL. Defaults to 2394 on a site that never saved it (read-time merge).
 * ===================================================================== */
fresh();
check('refund page: a site that never saved it reads the live page, 2394', Config::refund_page_id(), 2394);
foreach ([
    ['another page',              3001,     3001],
    ['0 (none: MotoPress\'s label)', 0,     0],
    ['"0" as posted',             '0',      0],
    ['a post that is not a page', 18063,    2394],
    ['an ID that does not exist', 77777,    2394],
    ['a negative number',         -3,       2394],
    ['garbage',                   'policy', 2394],
    ['missing',                   null,     2394],
] as [$label, $value, $want]) {
    fresh();
    $in = $base;
    if ($value !== null) { $in['refund_page_id'] = $value; }
    check("refund page: $label -> $want", $settings->sanitize($in)['refund_page_id'], $want);
}
fresh();
$GLOBALS['opt'][Config::OPTION] = ['refund_page_id' => 3001];
$in = $base; $in['refund_page_id'] = 18063;
check('refund page: a bad post keeps the STORED choice, not the default', $settings->sanitize($in)['refund_page_id'], 3001);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
