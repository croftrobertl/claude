<?php
/**
 * Prints the admin script's config exactly as Admin_Fields builds it, as JSON.
 *
 *     php tests/admin-layout/config.php [included_guests] [booking-json]
 *
 * booking-json describes an EXISTING booking being edited, e.g.
 *     {"rooms":[{"type":1604,"adults":2,"services":[17712]},{"type":1065}]}
 * Each room becomes a `mphb_reserved_room` child of booking 19615 with an
 * `_mphb_room_id`, and that room carries `mphb_room_type_id` — the chain
 * confirmed on live. {"type":0} is a room whose type cannot be read.
 * `adults` becomes `_mphb_adults` (omitted = missing meta); `services` becomes
 * `_mphb_services` exactly as given — a list, a map, a list of arrays, or a
 * string — so each storage shape is constructed rather than assumed.
 * Omitted: a NEW booking (no post), as before.
 *
 * [wizard-json] {"nights":N} adds `_wizardPetService`: what the shipped
 * Admin_Fields::wizard_pet_service() picks for a stay of N nights.
 *
 * The layout suite reads this instead of keeping its own copy of the group
 * list, so the test exercises the SHIPPED PHP: a renamed field, a reordered
 * group or a wrong `governed` flag in Admin_Fields::customer_layout() changes
 * what the browser sees, and the mutation runner can prove it.
 */
define('ABSPATH', __DIR__);

$GLOBALS['opt']     = [];
$GLOBALS['filters'] = [];
// The LIVE fee configuration, as measured 2026-09-19 (CLAUDE.md): service
// 18063 in all three extra-guest buckets at $50, on the six couch cottages.
// The shipped defaults are 0, and with them every fee assertion in this suite
// would pass vacuously — nothing would ever be ticked or labelled.
$GLOBALS['opt']['dcc_checkout_settings'] = [
    'guest_fee_enabled'     => 1,
    'guest_fee_amount'      => 50,
    'guest_service_daily'   => 18063,
    'guest_service_weekly'  => 18063,
    'guest_service_monthly' => 18063,
    'guest_accommodations'  => [1071, 1069, 1067, 1065, 1740, 1742],
];
if (isset($argv[1]) && $argv[1] !== '') {
    $GLOBALS['opt']['dcc_checkout_settings']['included_guests'] = (int) $argv[1];
}

function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
function apply_filters($hook, $value) {
    return array_key_exists($hook, $GLOBALS['filters']) ? $GLOBALS['filters'][$hook] : $value;
}
function add_action() {} function add_filter() {}
function __($t, $d = null) { return $t; }
function esc_html__($t, $d = null) { return $t; }
function sanitize_text_field($v) { return is_string($v) ? trim($v) : ''; }
function sanitize_key($v) { return is_string($v) ? strtolower(preg_replace('/[^a-z0-9_\-]/i', '', $v)) : ''; }
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function number_format_i18n($n, $d = 0) { return number_format((float) $n, (int) $d); }
class WP_Post { public $ID = 0; public $post_type = ''; public $post_status = ''; }

$GLOBALS['booking'] = null;
$GLOBALS['meta']    = [];
$GLOBALS['reserved']      = [];
if (isset($argv[2]) && $argv[2] !== '') {
    $spec = json_decode($argv[2], true);
    $b = new WP_Post();
    $b->ID = 19615; $b->post_type = 'mphb_booking'; $b->post_status = 'confirmed';
    $GLOBALS['booking'] = $b;
    foreach ((array) ($spec['rooms'] ?? []) as $i => $room) {
        $rr = new WP_Post();
        $rr->ID = 900 + $i; $rr->post_type = 'mphb_reserved_room';
        $GLOBALS['reserved'][] = $rr;
        $room_id = 500 + $i;
        $GLOBALS['meta'][$rr->ID]['_mphb_room_id'] = (string) $room_id;
        if ((int) ($room['type'] ?? 0) > 0) {
            $GLOBALS['meta'][$room_id]['mphb_room_type_id'] = (string) (int) $room['type'];
        }
        if (array_key_exists('adults', $room)) {
            $GLOBALS['meta'][$rr->ID]['_mphb_adults'] = (string) $room['adults'];
        }
        if (array_key_exists('services', $room)) {
            $GLOBALS['meta'][$rr->ID]['_mphb_services'] = $room['services'];
        }
    }
}

function get_post_meta($id, $k, $s = false) { return $GLOBALS['meta'][(int) $id][$k] ?? ''; }
function get_posts($a = []) {
    if (($a['post_type'] ?? '') === 'mphb_reserved_room' && $GLOBALS['booking']
        && (int) ($a['post_parent'] ?? 0) === $GLOBALS['booking']->ID) {
        return $GLOBALS['reserved'];
    }
    return [];
}
function get_post($id = null) { return $GLOBALS['booking']; }
function did_action($h) { return 0; }
function maybe_unserialize($v) {
    if (is_string($v)) {
        $u = @unserialize($v);
        return ($u === false && $v !== 'b:0;') ? $v : $u;
    }
    return $v;
}

require __DIR__ . '/../../dcc-custom-checkout/includes/class-config.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-id-files.php';
require __DIR__ . '/../../dcc-custom-checkout/includes/class-admin-fields.php';

$m = new ReflectionMethod(\DCC_Checkout\Admin_Fields::class, 'script_config');
$m->setAccessible(true);
$out = $m->invoke(new \DCC_Checkout\Admin_Fields());

if (isset($argv[3]) && $argv[3] !== '') {
    $w = json_decode($argv[3], true);
    $nights = (int) ($w['nights'] ?? 0);
    $booking = new class($nights) {
        private $n;
        public function __construct($n) { $this->n = $n; }
        public function getCheckInDate() { return new DateTime('2026-11-20'); }
        public function getCheckOutDate() { return (new DateTime('2026-11-20'))->modify('+' . $this->n . ' days'); }
    };
    $wp = new ReflectionMethod(\DCC_Checkout\Admin_Fields::class, 'wizard_pet_service');
    $wp->setAccessible(true);
    $out['_wizardPetService'] = $wp->invoke(null, $booking);
}

echo json_encode($out, JSON_UNESCAPED_UNICODE);
