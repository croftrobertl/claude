<?php
/**
 * v0.34.0 — Rob's pet policy (11 October): the pet fee MODE, the old fees
 * RECOGNISED everywhere, and the dog SIZES offered or kept.
 *
 *     php tests/petpolicy/run.php
 *
 * WHAT IS REAL HERE: Config, Settings, Pet_Service, Checkout_Request,
 * Rest_Guard, Dog_Sizes — the shipped files.
 *
 * WHAT IS A STAND-IN, and what it is built from:
 *  - get_post_meta() runs the `get_post_metadata` filter exactly as core's
 *    get_metadata() does (a non-null result short-circuits; a single read
 *    takes element 0), because that filter is how Dog_Sizes serves the Dog
 *    Size field's options;
 *  - MotoPress's admin SelectField, as the Director read it (core
 *    admin/fields/select-field.php): renderInput() marks only a matching key
 *    selected; sanitize() keeps only keys in the list. The options come from
 *    the field's mphb_cf_options mapped value => label
 *    (CheckoutFieldRepository.php ~30–38). This is what decides whether a
 *    stored size survives an Update on the booking screen;
 *  - the Dog Size field (17727, dog_size) with the options the Director
 *    stored on live: "— Select —" and "Up to 20 lbs";
 *  - Cottage 34 (1607) with what MotoPress has attached: ["19692"] on live.
 */
namespace {
define('ABSPATH', __DIR__);
define('DAY_IN_SECONDS', 86400);

$GLOBALS['opt'] = []; $GLOBALS['hooks'] = []; $GLOBALS['meta'] = []; $GLOBALS['posts'] = [];
$GLOBALS['admin'] = false; $GLOBALS['ajax'] = false; $GLOBALS['referer'] = ''; $GLOBALS['settings_errors'] = [];

function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
function add_filter($h, $cb, $p = 10, $a = 1) { $GLOBALS['hooks'][$h][$p][] = [$cb, $a]; }
function add_action($h, $cb, $p = 10, $a = 1) { add_filter($h, $cb, $p, $a); }
function apply_filters($h, $v, ...$args) {
    $byp = $GLOBALS['hooks'][$h] ?? []; ksort($byp);
    foreach ($byp as $list) { foreach ($list as [$cb, $n]) { $v = $cb(...array_slice(array_merge([$v], $args), 0, $n)); } }
    return $v;
}
/* core get_metadata(): the short-circuit filter first, then storage. */
function get_post_meta($id, $k = '', $single = false) {
    $check = apply_filters('get_post_metadata', null, (int) $id, $k, $single, 'post');
    if ($check !== null) { return ($single && is_array($check)) ? $check[0] : $check; }
    $v = $GLOBALS['meta'][(int) $id][$k] ?? null;
    return $single ? ($v ?? '') : ($v === null ? [] : [$v]);
}
function get_post_type($id) { return $GLOBALS['posts'][(int) $id]['type'] ?? false; }
function get_posts($a = []) {
    $out = [];
    foreach ($GLOBALS['posts'] as $id => $p) {
        if ($p['type'] !== ($a['post_type'] ?? '')) { continue; }
        if (isset($a['post_status']) && $a['post_status'] !== 'any' && $p['status'] !== $a['post_status']) { continue; }
        if (isset($a['meta_key']) && (string) ($GLOBALS['meta'][$id][$a['meta_key']] ?? '') !== (string) $a['meta_value']) { continue; }
        $out[] = $id;
    }
    return $out;
}
function get_the_title($id) { return $GLOBALS['posts'][(int) $id]['title'] ?? ''; }
function get_post($id = null) { return null; }
function is_admin() { return $GLOBALS['admin']; }
function wp_doing_ajax() { return $GLOBALS['ajax']; }
function wp_get_referer() { return $GLOBALS['referer']; }
function admin_url($p = '') { return 'https://example.test/wp-admin/' . $p; }
function home_url($p = '/') { return 'https://example.test' . $p; }
function wp_unslash($v) { return $v; }
function sanitize_text_field($v) { return is_string($v) ? trim(strip_tags($v)) : ''; }
function sanitize_key($v) { return is_string($v) ? strtolower(preg_replace('/[^a-z0-9_\-]/i', '', $v)) : ''; }
function untrailingslashit($s) { return rtrim((string) $s, '/\\'); }
function __($t, $d = null) { return $t; }
function esc_html__($t, $d = null) { return esc_html($t); }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function checked($a, $b, $e = true) { $r = ((string) $a === (string) $b) ? ' checked=\'checked\'' : ''; if ($e) { echo $r; } return $r; }
function add_settings_error($s, $c, $m) { $GLOBALS['settings_errors'][] = [$c, $m]; }
function get_post_status($id) { return 'publish'; }
class WP_Post {}
class WP_Error { public $code; public $message; public function __construct($c = '', $m = '', $d = []) { $this->code = $c; $this->message = $m; } }
class WP_REST_Request {
    private $m; private $r; private $p;
    public function __construct($m, $r, $p) { $this->m = $m; $this->r = $r; $this->p = $p; }
    public function get_method() { return $this->m; }
    public function get_route() { return $this->r; }
    public function get_params() { return $this->p; }
}

/* What MotoPress has attached to each room type. */
$GLOBALS['room_types'] = [1607 => [19692], 1065 => [18063]];
function MPHB() {
    return new class {
        public function getRoomTypeRepository() {
            return new class {
                public function findById($id) {
                    if (!array_key_exists((int) $id, $GLOBALS['room_types'])) { return null; }
                    return new class($GLOBALS['room_types'][(int) $id]) {
                        private $s; public function __construct($s) { $this->s = $s; }
                        public function getServices() { return $this->s; }
                    };
                }
            };
        }
    };
}

foreach (['config', 'checkout-request', 'rest-guard', 'pet-service', 'dog-sizes', 'guest-fields', 'extra-guest-service', 'settings'] as $c) {
    require __DIR__ . '/../../dcc-custom-checkout/includes/class-' . $c . '.php';
}
}

namespace {
use DCC_Checkout\{Config, Settings, Pet_Service, Dog_Sizes, Rest_Guard, Checkout_Request};

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) { echo '      expected: ' . var_export($expected, true) . "\n      actual:   " . var_export($actual, true) . "\n"; }
}
function settings_set(array $stored) { $GLOBALS['opt']['dcc_checkout_settings'] = $stored; Config::flush_cache(); }

/* Posts: the services and Cottage 34, and the Dog Size field as on live. */
$GLOBALS['posts'] = [
    19692 => ['type' => 'mphb_room_service', 'status' => 'publish', 'title' => 'Pet Fee (per night)'],
    17712 => ['type' => 'mphb_room_service', 'status' => 'publish', 'title' => 'Pet Fee &#8211; Daily Rate'],
    17711 => ['type' => 'mphb_room_service', 'status' => 'publish', 'title' => 'Pet Fee &#8211; Weekly Rate'],
    14926 => ['type' => 'mphb_room_service', 'status' => 'publish', 'title' => 'Pet Fee &#8211; Monthly Rate'],
    1607  => ['type' => 'mphb_room_type', 'status' => 'publish', 'title' => 'Cottage 34'],
    17727 => ['type' => 'mphb_checkout_field', 'status' => 'publish', 'title' => 'Dog Size'],
    17726 => ['type' => 'mphb_checkout_field', 'status' => 'publish', 'title' => 'Dog Type'],
];
$LIVE_SIZE_OPTIONS = [['value' => '', 'label' => '— Select —'], ['value' => 'Up to 20 lbs', 'label' => 'Up to 20 lbs']];
$GLOBALS['meta'][17727] = ['mphb_cf_name' => 'dog_size', 'mphb_cf_enabled' => '1', 'mphb_cf_options' => $LIVE_SIZE_OPTIONS];
$GLOBALS['meta'][17726] = ['mphb_cf_name' => 'dog_type', 'mphb_cf_enabled' => '1', 'mphb_cf_options' => [['value' => 'x', 'label' => 'x']]];

/* ===================================================================== *
 * A1 — THE MODE, AND THE UPGRADE FROM TODAY'S STORED OPTION
 * ===================================================================== */
settings_set([]);
check('a fresh install: flat mode, 19692, the tiers kept at 17712 / 17711 / 14926, thresholds 2 / 7 / 30',
    [Config::pet_fee_mode(), Config::pet_flat_service_id(), array_values(Config::pet_tier_service_ids()), array_values(Config::bucket_thresholds())],
    ['flat', 19692, [17712, 17711, 14926], [2, 7, 30]]);

/* Live and staging since 2026-10-11 (Director): all three tier keys 19692,
   no mode key, the rest of the option as it was. */
$TODAY = ['pet_fee_enabled' => 1, 'pet_accommodations' => [1607], 'service_daily' => 19692, 'service_weekly' => 19692,
          'service_monthly' => 19692, 'min_daily' => 2, 'min_weekly' => 7, 'min_monthly' => 30,
          'guest_service_daily' => 18063, 'guest_service_weekly' => 18063, 'guest_service_monthly' => 18063, 'guest_fee_amount' => 50];
settings_set($TODAY);
check('UPGRADE from today\'s option (tiers all 19692, no mode): flat on 19692, tiers from the baked defaults — 19692 never left in a tier slot',
    [Config::pet_fee_mode(), Config::pet_flat_service_id(), array_values(Config::pet_tier_service_ids())],
    ['flat', 19692, [17712, 17711, 14926]]);
check('... it charges 19692 for every stay of 1–45 nights',
    array_values(array_unique(array_map([Config::class, 'service_id_for_nights'], range(1, 45)))), [19692]);
check('... recognises the flat service AND the three old tiers', Config::recognised_pet_service_ids(), [19692, 17712, 17711, 14926]);
check('... and the other settings read exactly as stored', [Config::settings()['guest_service_daily'], Config::settings()['guest_fee_amount']], [18063, 50]);
check('... nothing is written by reading it', $GLOBALS['opt']['dcc_checkout_settings'], $TODAY);

settings_set(['service_daily' => 17712, 'service_weekly' => 17711, 'service_monthly' => 14926]);
check('an older site charging by length of stay (three distinct ids, no mode): still tiers, unchanged',
    [Config::pet_fee_mode(), Config::service_id_for_nights(3), Config::service_id_for_nights(8), Config::service_id_for_nights(31)],
    ['tiers', 17712, 17711, 14926]);

/* ACTIVE vs RECOGNISED, in each mode. */
settings_set(['pet_fee_mode' => 'tiers']);
check('tiers mode: active = the three tiers; recognised = the flat one as well',
    [Config::active_pet_service_ids(), Config::recognised_pet_service_ids()], [[17712, 17711, 14926], [19692, 17712, 17711, 14926]]);
settings_set(['pet_fee_mode' => 'flat']);
check('flat mode: active = the flat service only', Config::active_pet_service_ids(), [19692]);
settings_set(['pet_fee_mode' => 'nonsense']);
check('an unrecognised mode reads as flat (the policy in force)', Config::pet_fee_mode(), 'flat');

/* A MODE SWITCH ROUND TRIP through the settings page keeps both id sets. */
$settings = new Settings();
settings_set($TODAY);
$post = Config::settings();
$post['pet_fee_mode'] = 'tiers';
$saved = $settings->sanitize($post);
settings_set($saved);
check('switch to tiers and save: both id sets and the thresholds stored, tiers charging',
    [$saved['pet_fee_mode'], $saved['service_flat'], $saved['service_daily'], $saved['service_weekly'], $saved['service_monthly'],
     $saved['min_weekly'], $saved['min_monthly'], Config::service_id_for_nights(3), Config::service_id_for_nights(10)],
    ['tiers', 19692, 17712, 17711, 14926, 7, 30, 17712, 17711]);
$post = Config::settings();
$post['pet_fee_mode'] = 'flat';
$saved2 = $settings->sanitize($post);
settings_set($saved2);
check('... and back to flat: nothing retyped, nothing lost', [$saved2['pet_fee_mode'], $saved2['service_flat'],
    [$saved2['service_daily'], $saved2['service_weekly'], $saved2['service_monthly']], Config::service_id_for_nights(10)],
    ['flat', 19692, [17712, 17711, 14926], 19692]);
check('... and the two saves differ only in the mode', array_keys(array_diff_assoc(
    array_map('serialize', $saved), array_map('serialize', $saved2))), ['pet_fee_mode']);
check('a posted mode that is neither falls back to flat', $settings->sanitize(['pet_fee_mode' => 'free'])['pet_fee_mode'], 'flat');

/* The attachment warning. */
settings_set(['pet_fee_mode' => 'flat']);
check('flat mode, 19692 attached to Cottage 34: no warning', $settings->pet_attachment_warnings_html(), '');
$GLOBALS['room_types'][1607] = [17712, 17711, 14926];
check('flat mode, 19692 NOT attached: a warning naming the service and the cottage',
    (bool) preg_match('/The active pet fee &quot;Pet Fee \(per night\)&quot; \(#19692\) is not attached to Cottage 34 \(#1607\)/', $settings->pet_attachment_warnings_html()), true);
settings_set(['pet_fee_mode' => 'tiers']);
check('... the same cottage in tiers mode: no warning', $settings->pet_attachment_warnings_html(), '');
$GLOBALS['room_types'][1607] = [19692];
check('tiers mode on today\'s cottage: one warning per tier not attached (re-attach before switching back)',
    substr_count($settings->pet_attachment_warnings_html(), 'is not attached to Cottage 34'), 3);
unset($GLOBALS['room_types'][1607]);
check('a cottage whose services cannot be read: no warning (never a false alarm)', $settings->pet_attachment_warnings_html(), '');
$GLOBALS['room_types'][1607] = [19692];

/* ===================================================================== *
 * A2 — Pet_Service: the ACTIVE service is accepted, a wrong one refused,
 * in both modes.
 * ===================================================================== */
function submit(array $services, int $nights, array $customer = []) {
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SERVER['REQUEST_URI'] = '/submit-booking/';
    $in = new DateTime('2026-11-02');
    $_POST = [
        'mphb_check_in_date'  => $in->format('Y-m-d'),
        'mphb_check_out_date' => (clone $in)->modify("+$nights days")->format('Y-m-d'),
        'mphb_room_details'   => [0 => ['room_type_id' => 1607, 'adults' => 2,
            'services' => array_map(function ($id) { return ['id' => $id, 'quantity' => 1]; }, $services)]],
        'customer_fields'     => $customer,
    ];
    return (new Pet_Service())->find_violation();
}
$DOG = ['mphb_dog_type' => 'Poodle', 'mphb_dog_size' => 'Up to 20 lbs', 'mphb_dog_hair' => 'Short'];
settings_set(['pet_fee_mode' => 'flat']);
check('flat mode: a dog booking carrying 19692 is accepted (2, 8 and 35 nights)',
    [submit([19692], 2, $DOG), submit([19692], 8, $DOG), submit([19692], 35, $DOG)], [null, null, null]);
check('flat mode: an old tier instead is refused (a stale page)', [submit([17712], 2, $DOG), submit([17711], 8, $DOG), submit([14926], 35, $DOG)], ['pet', 'pet', 'pet']);
check('flat mode: the flat fee PLUS an old tier is refused', submit([19692, 17712], 2, $DOG), 'pet');
check('flat mode: no pet service is a no-dog booking — nothing about the dog is required', submit([], 2, []), null);
settings_set(['pet_fee_mode' => 'tiers']);
check('tiers mode: the bucket for the stay is accepted', [submit([17712], 2, $DOG), submit([17711], 8, $DOG), submit([14926], 35, $DOG)], [null, null, null]);
check('tiers mode: the flat service, or the wrong bucket, is refused', [submit([19692], 2, $DOG), submit([17711], 2, $DOG)], ['pet', 'pet']);

/* ===================================================================== *
 * A3 — DOG SIZES
 * ===================================================================== */
settings_set([]);
check('the baked sizes: "Up to 20 lbs" offered; 10-20, 20-30, 30-40 lbs kept, not offered',
    [Config::active_dog_sizes(), Config::all_dog_sizes()],
    [['Up to 20 lbs'], ['Up to 20 lbs', '10-20 lbs', '20-30 lbs', '30-40 lbs']]);

(new Dog_Sizes())->register();
$values = function () { return array_column(get_post_meta(17727, 'mphb_cf_options', true), 'value'); };

$GLOBALS['admin'] = false;
check('the guest checkout: "— Select —" first (empty, so nothing pre-selected), then only the offered sizes',
    get_post_meta(17727, 'mphb_cf_options', true), [['value' => '', 'label' => '— Select —'], ['value' => 'Up to 20 lbs', 'label' => 'Up to 20 lbs']]);
check('... a non-single read gives the same list as its one value', get_post_meta(17727, 'mphb_cf_options', false)[0], get_post_meta(17727, 'mphb_cf_options', true));
$GLOBALS['admin'] = true; $_GET = ['post' => 19674, 'action' => 'edit'];
check('the booking edit screen: every size, so a stored one is still in the list', $values(), ['', 'Up to 20 lbs', '10-20 lbs', '20-30 lbs', '30-40 lbs']);
$_GET = ['page' => 'mphb_add_new_booking', 'step' => '3'];
check('Add New Booking (a new stay, under the current policy): offered sizes only', $values(), ['', 'Up to 20 lbs']);
$_GET = [];
$GLOBALS['ajax'] = true; $GLOBALS['referer'] = 'https://example.test/submit-booking/';
check('a front-end AJAX request: offered sizes only', $values(), ['', 'Up to 20 lbs']);
$GLOBALS['referer'] = 'https://example.test/wp-admin/post.php?post=19674&action=edit';
check('an AJAX request from a wp-admin screen: every size', count($values()), 5);
$GLOBALS['ajax'] = false; $GLOBALS['admin'] = false;
check('another Checkout Field\'s options are untouched', get_post_meta(17726, 'mphb_cf_options', true), [['value' => 'x', 'label' => 'x']]);
check('another meta key of the Dog Size field is untouched', get_post_meta(17727, 'mphb_cf_name', true), 'dog_size');
add_filter('get_post_metadata', function ($v, $id, $k) { return $k === 'mphb_cf_options' && $id === 17727 ? [['EARLIER']] : $v; }, 5, 3);
check('a value another filter already decided is passed through', get_post_meta(17727, 'mphb_cf_options', true), ['EARLIER']);
unset($GLOBALS['hooks']['get_post_metadata'][5]);

/* MotoPress's admin SelectField, modelled from the Director's read. */
function select_field_options(): array {
    $map = [];
    foreach ((array) get_post_meta(17727, 'mphb_cf_options', true) as $o) { $map[(string) $o['value']] = (string) $o['label']; }
    return $map;
}
function select_render_selected(string $stored): string {
    foreach (select_field_options() as $k => $l) { if ((string) $k === $stored) { return $l; } }
    return '— Select —';   // nothing matches: the first option shows
}
function select_sanitize(string $posted): string {
    return array_key_exists($posted, select_field_options()) ? $posted : '';
}
$GLOBALS['admin'] = true; $_GET = ['post' => 17795, 'action' => 'edit'];
check('#17795\'s stored "30-40 lbs" (no longer offered) SHOWS on the booking screen',
    select_render_selected('30-40 lbs'), '30-40 lbs');
check('... and SURVIVES an Update unchanged (the form posts it back; sanitize keeps it)', select_sanitize('30-40 lbs'), '30-40 lbs');
check('... and #17730\'s "10-20 lbs" too', [select_render_selected('10-20 lbs'), select_sanitize('10-20 lbs')], ['10-20 lbs', '10-20 lbs']);
$GLOBALS['admin'] = false; $_GET = [];
check('guard: with the guest list, the same SelectField would erase it — the reason the full list is served on the booking screen',
    [select_render_selected('30-40 lbs'), select_sanitize('30-40 lbs')], ['— Select —', '']);

/* The server-side size check (MotoPress saves whatever is posted). */
settings_set(['pet_fee_mode' => 'flat']);
check('a dog booking with "Up to 20 lbs": accepted', submit([19692], 2, $DOG), null);
foreach (['30-40 lbs', '10-20 lbs', '20-30 lbs', 'Up to 60 lbs'] as $bad) {
    check("a dog booking posting \"$bad\" (not offered): refused as 'dogsize'", submit([19692], 2, array_merge($DOG, ['mphb_dog_size' => $bad])), 'dogsize');
}
check('a dog booking with an EMPTY size: refused', submit([19692], 2, array_merge($DOG, ['mphb_dog_size' => ''])), 'dogsize');
$noSize = $DOG; unset($noSize['mphb_dog_size']);
check('a dog booking with NO size at all (MotoPress sends nothing for an empty select): refused while the field is in use',
    submit([19692], 2, $noSize), 'dogsize');
$GLOBALS['meta'][17727]['mphb_cf_enabled'] = '0';
check('... but not when the Dog Size field is switched off in MotoPress', submit([19692], 2, $noSize), null);
$GLOBALS['meta'][17727]['mphb_cf_enabled'] = '1';
check('a NO-dog booking: nothing about the size is required', submit([], 2, []), null);
settings_set(['pet_fee_mode' => 'flat', 'dog_sizes' => [['label' => 'Up to 20 lbs', 'active' => 1], ['label' => '30-40 lbs', 'active' => 1]]]);
check('a size Rob switches back ON is accepted', submit([19692], 2, array_merge($DOG, ['mphb_dog_size' => '30-40 lbs'])), null);

/* The same over REST (Rest_Guard), with its own message. */
settings_set([]);
(new Rest_Guard())->register();
$_SERVER['REQUEST_URI'] = '/wp-json/mphb/v1/checkout';
$r = (new Rest_Guard())->intercept(null, null, new WP_REST_Request('POST', '/mphb/v1/checkout', [
    'check_in_date' => '2026-11-02', 'check_out_date' => '2026-11-04',
    'room_details' => [0 => ['room_type_id' => 1607, 'adults' => 2, 'services' => [['id' => 19692, 'quantity' => 1]]]],
    'customer_fields' => array_merge($DOG, ['mphb_dog_size' => '30-40 lbs']),
]));
check('REST: an inactive size is refused with a clear message',
    [$r instanceof WP_Error ? $r->code : null, $r instanceof WP_Error ? $r->message : null],
    ['dcc_checkout_dogsize', "Please choose your dog's size from the list."]);

/* The settings sanitiser. */
settings_set([]);
$GLOBALS['settings_errors'] = [];
$out = $settings->sanitize(['dog_sizes' => [
    ['label' => 'Up to 20 lbs', 'active' => '1'], ['label' => '10-20 lbs'], ['label' => '20-30 lbs', 'active' => '1'], ['label' => '30-40 lbs'],
]]);
check('sizes are flipped on and off as posted, every size kept', $out['dog_sizes'], [
    ['label' => 'Up to 20 lbs', 'active' => 1], ['label' => '10-20 lbs', 'active' => 0],
    ['label' => '20-30 lbs', 'active' => 1], ['label' => '30-40 lbs', 'active' => 0]]);
$out = $settings->sanitize(['dog_sizes' => [['label' => 'Up to 20 lbs'], ['label' => '10-20 lbs']]]);
check('NONE offered would refuse every dog booking: the saved list is kept and the page says so',
    [$out['dog_sizes'][0], count($GLOBALS['settings_errors'])], [['label' => 'Up to 20 lbs', 'active' => 1], 1]);
$out = $settings->sanitize(['dog_sizes' => 'garbage']);
check('an unreadable post keeps the saved list', array_column($out['dog_sizes'], 'label'), ['Up to 20 lbs', '10-20 lbs', '20-30 lbs', '30-40 lbs']);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
}
