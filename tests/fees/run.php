<?php
/**
 * v0.33.1 — fees follow the booking screen's Update button (Fee_Sync), and
 * ONLY the fee moves: the stay is never repriced.
 *
 *     php tests/fees/run.php
 *
 * WHAT IS REAL HERE: Fee_Sync, Admin_Guests (it writes the new count first),
 * Extra_Details, Config, Admin_Fields, Policies — the shipped files.
 *
 * THE FIXTURES ARE THE DIRECTOR'S RAW VALUES (live 6.3.0, 2026-10-11):
 *  - #17730's `_mphb_booking_price_breakdown`, byte for byte, with the two
 *    values the Director elided (room.type, room.rate) filled with a string —
 *    nothing reads or writes them — and its `_mphb_services` row;
 *  - #19656's extra-guest line and row, byte for byte, its room total (175),
 *    taxes (7 / 1.75 / 10.5 = 19.25) and booking total (244.25);
 *  - the staging totals the Director measured on #10212 ($555), #8798
 *    ($1,021.20, stored as 1021.2000000000000454…), #10198 ($333) and #10222,
 *    and the totals Rob's decision makes them ($655, $1,181.20, $433 / $533,
 *    $327.50). Those four breakdowns are BUILT here in MotoPress's shape, from
 *    a room price and the site's three taxes (4% / 1% / 6%, which reproduce
 *    both raw breakdowns above to the cent — asserted); their nights and tiers
 *    are the stand-in's. The Director's rerun on the real bookings is the proof.
 *
 * WHAT IS A STAND-IN. MotoPress cannot run here:
 *  - ReservedService::create(['id','adults','quantity']) — null for an id it
 *    does not know; calcPrice() and toString('price', $nights) reproduce
 *    entities/reserved-service.php (~90, ~134) as the Director read it, with
 *    the stand-in's own prices ($25 / $20 / $10 a night for the pet tiers,
 *    $50 a night per guest for 18063, a $20 once-only "other" service) —
 *    asserted to rebuild both raw lines byte for byte;
 *  - mphb_format_price() — the markup in the raw details strings;
 *  - the service repository's titles (today's: "Pet Fee &#8211; Daily Rate",
 *    where #17730 stored the booking-time "Pet Fee &#8211; Daily");
 *  - Booking: dates, nights, addLog() — and updateTotal() / setRooms(), which
 *    COUNT a call, because calling them is the 0.33.0 defect;
 *  - BookingRepository: findById() caches the entity as MotoPress's does, and
 *    save() fires the nested save_post and THEN writes the reloaded total and
 *    breakdown (CPTPersistence::update() ~172, verified) — MotoPress's own
 *    Update, which runs before the redirect;
 *  - update_post_meta() UNSLASHES strings as WordPress does, so a breakdown
 *    written without wp_slash() comes back broken.
 */
namespace {
define('ABSPATH', __DIR__);

$GLOBALS['hooks'] = []; $GLOBALS['posts'] = []; $GLOBALS['meta'] = []; $GLOBALS['opt'] = [];
$GLOBALS['caps'] = true; $GLOBALS['trans'] = []; $GLOBALS['post_status'] = []; $GLOBALS['saves'] = 0;
$GLOBALS['logs'] = []; $GLOBALS['mp_order'] = []; $GLOBALS['repriced'] = 0; $GLOBALS['entity_cache'] = [];

function add_action($h, $cb, $p = 10, $a = 1) { $GLOBALS['hooks'][$h][$p][] = [$cb, $a]; }
function add_filter($h, $cb, $p = 10, $a = 1) { add_action($h, $cb, $p, $a); }
function remove_action($h, $cb, $p = 10) {
    foreach ($GLOBALS['hooks'][$h][$p] ?? [] as $i => $e) { if ($e[0] === $cb) { unset($GLOBALS['hooks'][$h][$p][$i]); } }
}
function do_action($h, ...$args) {
    $byp = $GLOBALS['hooks'][$h] ?? []; ksort($byp);
    foreach ($byp as $p => $list) { foreach ($list as $e) { if (in_array($e, $GLOBALS['hooks'][$h][$p] ?? [], true)) { ($e[0])(...array_slice($args, 0, $e[1])); } } }
}
function apply_filters($h, $v, ...$args) {
    $byp = $GLOBALS['hooks'][$h] ?? []; ksort($byp);
    foreach ($byp as $list) { foreach ($list as $e) { $v = ($e[0])(...array_slice(array_merge([$v], $args), 0, $e[1])); } }
    return $v;
}
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
function get_post_meta($id, $k, $s = false) { return $GLOBALS['meta'][(int) $id][$k] ?? ''; }
/* As WordPress: update_post_meta() unslashes what it is given. */
function wp_unslash_deep($v) { return is_string($v) ? stripslashes($v) : (is_array($v) ? array_map('wp_unslash_deep', $v) : $v); }
function update_post_meta($id, $k, $v) { $GLOBALS['meta'][(int) $id][$k] = wp_unslash_deep($v); return true; }
function delete_post_meta($id, $k) { unset($GLOBALS['meta'][(int) $id][$k]); return true; }
function wp_slash($v) { return is_string($v) ? addslashes($v) : (is_array($v) ? array_map('wp_slash', $v) : $v); }
function get_post_status($id = null) { return $GLOBALS['post_status'][(int) $id] ?? 'confirmed'; }
function get_posts($a) {
    $out = [];
    foreach ($GLOBALS['posts'] as $id => $p) {
        if ($p['type'] !== ($a['post_type'] ?? '') || (int) $p['parent'] !== (int) ($a['post_parent'] ?? -1)) { continue; }
        $out[] = ($a['fields'] ?? '') === 'ids' ? $id : (object) ['ID' => $id];
    }
    return $out;
}
function get_the_title($id) { return 'Cottage ' . $id; }
function get_post($id = null) { return null; }
function current_user_can($c, $id = 0) { return $GLOBALS['caps']; }
function get_current_user_id() { return 7; }
class WP_User { public $display_name = 'Rob'; public function exists() { return true; } }
function wp_get_current_user() { return new WP_User(); }
function wp_verify_nonce($n, $a) { return ($a === 'dcc_fee_sync' && $n === 'fee-ok') || ($a === 'dcc_admin_guests' && $n === 'guests-ok') ? 1 : false; }
function wp_nonce_field($a, $n, $r = true, $e = true) { return '<input type="hidden" name="' . $n . '" value="x">'; }
function wp_is_post_revision($id) { return false; }
function wp_unslash($v) { return $v; }
function sanitize_text_field($v) { return is_string($v) ? trim($v) : ''; }
function sanitize_key($v) { return strtolower(preg_replace('/[^a-z0-9_\-]/i', '', (string) $v)); }
function maybe_unserialize($v) { if (is_string($v)) { $u = @unserialize($v); return ($u === false && $v !== 'b:0;') ? $v : $u; } return $v; }
function __($t, $d = null) { return $t; }
function _n($s, $p, $n, $d = null) { return $n === 1 ? $s : $p; }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_html__($t, $d = null) { return esc_html($t); }
function esc_url($u) { return (string) $u; }
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function set_transient($k, $v, $t = 0) { $GLOBALS['trans'][$k] = $v; return true; }
function get_transient($k) { return $GLOBALS['trans'][$k] ?? false; }
function delete_transient($k) { unset($GLOBALS['trans'][$k]); return true; }
function wp_cache_delete($k, $g = '') { return true; }
function selected($a, $b, $e = true) { return (string) $a === (string) $b ? ' selected' : ''; }
class WP_Post { public $ID; public $post_type = 'mphb_booking'; public function __construct($id) { $this->ID = $id; } }

/* MotoPress's price markup, as it appears in the stored details strings. */
function mphb_format_price($price, $atts = []) {
    $n = number_format((float) $price, 2);
    $n = preg_replace('/\.00$/', '', $n);
    return '<span class="mphb-price"><span class="mphb-currency">&#36;</span>' . $n . '</span>';
}

/* Room types and what MotoPress attaches to each (live picture). */
$GLOBALS['room_types'] = [
    1065 => ['services' => [18063, 999], 'adults' => 4],                  // Cottage 22, a 4-sleeper
    1607 => ['services' => [17712, 17711, 14926, 999], 'adults' => 2],    // Cottage 34
    1604 => ['services' => [], 'adults' => 2],                            // Cottage 33
];
/* The stand-in's services: today's title, price, and how MotoPress prices it. */
$GLOBALS['svc'] = [
    // v0.34.0 — Rob's flat pet fee (Director, 2026-10-12): $50 a night, per
    // night, quantity once; its line reads "Pet Fee (per night) | $50 × 2 nights | 100".
    19692 => ['title' => 'Pet Fee (per night)', 'price' => 50, 'night' => true, 'adult' => false],
    17712 => ['title' => 'Pet Fee &#8211; Daily Rate', 'price' => 25, 'night' => true, 'adult' => false],
    17711 => ['title' => 'Pet Fee &#8211; Weekly Rate', 'price' => 20, 'night' => true, 'adult' => false],
    14926 => ['title' => 'Pet Fee &#8211; Monthly Rate', 'price' => 10, 'night' => true, 'adult' => false],
    18063 => ['title' => 'Extra Guest Fee (per guest beyond 2)', 'price' => 50, 'night' => true, 'adult' => true],
    999   => ['title' => 'Late Checkout', 'price' => 20, 'night' => false, 'adult' => false],
];

function MPHB() {
    return new class {
        public function getRoomTypeRepository() {
            return new class {
                public function findById($id) {
                    $t = $GLOBALS['room_types'][(int) $id] ?? null;
                    return $t === null ? null : new class($t) {
                        private $t; public function __construct($t) { $this->t = $t; }
                        public function getServices() { return $this->t['services']; }
                        public function getAdultsCapacity() { return $this->t['adults']; }
                    };
                }
            };
        }
        public function getBookingRepository() { return new \MPHB\Repositories\BookingRepository(); }
        public function getServiceRepository() {
            return new class {
                public function findById($id) {
                    $s = $GLOBALS['svc'][(int) $id] ?? null;
                    return $s === null ? null : new class($s['title'], $s['price']) {
                        private $t, $p; public function __construct($t, $p) { $this->t = $t; $this->p = $p; }
                        public function getTitle() { return $this->t; }
                        public function getPrice() { return $this->p; }
                    };
                }
            };
        }
    };
}
}

namespace MPHB\Entities {
class ReservedService {
    public $id, $adults, $quantity;
    public static function create($atts) {
        if (!isset($atts['id'], $atts['adults']) || !isset($GLOBALS['svc'][(int) $atts['id']])) { return null; }
        $s = new self(); $s->id = (int) $atts['id']; $s->adults = (int) $atts['adults']; $s->quantity = (int) ($atts['quantity'] ?? 1);
        return $s;
    }
    public function getId() { return $this->id; }
    public function getTitle() { return 'own:' . $GLOBALS['svc'][$this->id]['title']; }
    private function cfg() { return $GLOBALS['svc'][$this->id]; }
    public function calcPrice($in, $out) {
        $c = $this->cfg();
        $p = (float) $c['price'];
        if ($c['night']) { $p *= (int) $in->diff($out)->days; }
        if ($c['adult']) { $p *= $this->adults; }
        return $p;
    }
    /* entities/reserved-service.php ~90, as read. */
    public function toString($what, $nights) {
        $c = $this->cfg();
        $s = mphb_format_price($c['price']);
        if ($c['night']) { $s .= ' &#215; ' . sprintf(_n('%d night', '%d nights', $nights), $nights); }
        if ($c['adult']) { $s .= ' &#215; ' . sprintf(_n('%d guest', '%d guests', $this->adults), $this->adults); }
        return $s;
    }
}
class Booking {
    public $id, $total, $raw, $status;
    public function getCheckInDate() { return new \DateTime((string) get_post_meta($this->id, 'mphb_check_in_date', true)); }
    public function getCheckOutDate() { return new \DateTime((string) get_post_meta($this->id, 'mphb_check_out_date', true)); }
    public function getNightsCount() { return (int) $this->getCheckInDate()->diff($this->getCheckOutDate())->days; }
    public function setStatus($s) { $this->status = $s; }
    public function addLog($msg, $author = null) { $GLOBALS['logs'][] = [$this->id, $msg, $author]; }
    /* 0.33.0 repriced the whole stay through these. Counted, never used. */
    public function updateTotal() { $GLOBALS['repriced']++; }
    public function setRooms($r) { $GLOBALS['repriced']++; }
}
}

namespace MPHB\Repositories {
use MPHB\Entities\Booking;
class BookingRepository {
    public function findById($id, $force = false) {
        // As MotoPress: an entity, once loaded, is served from the cache.
        if (!$force && isset($GLOBALS['entity_cache'][(int) $id])) { return $GLOBALS['entity_cache'][(int) $id]; }
        $b = new Booking(); $b->id = (int) $id;
        $b->total = get_post_meta($id, 'mphb_total_price', true);
        $b->raw = get_post_meta($id, '_mphb_booking_price_breakdown', true);
        $b->status = get_post_status($id);
        return $GLOBALS['entity_cache'][(int) $id] = $b;
    }
    public function save($b) {
        $GLOBALS['saves']++;
        $GLOBALS['post_status'][$b->id] = $b->status;
        // wp_update_post(): save_post fires, nested, BEFORE the meta below.
        do_action('save_post_mphb_booking', $b->id, new \WP_Post($b->id), true);
        do_action('save_post', $b->id, new \WP_Post($b->id), true);
        update_post_meta($b->id, 'mphb_total_price', $b->total);
        update_post_meta($b->id, '_mphb_booking_price_breakdown', wp_slash($b->raw));
    }
}
}

namespace {
foreach (['config', 'policies', 'id-files', 'boat-field', 'admin-fields', 'admin-guests', 'extra-details', 'fee-sync'] as $c) {
    require __DIR__ . '/../../dcc-custom-checkout/includes/class-' . $c . '.php';
}
use DCC_Checkout\{Fee_Sync, Admin_Guests, Config};

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) { echo '      expected: ' . var_export($expected, true) . "\n      actual:   " . var_export($actual, true) . "\n"; }
}

/** MotoPress's own Update (EditCPTPage::saveMetaBoxes), in its verified write order. */
function motopress_save($post_id, $post = null) {
    if ((int) ($_POST['post_ID'] ?? 0) !== (int) $post_id) { return; }
    remove_action('save_post', 'motopress_save', 10);
    $GLOBALS['mp_order'][] = 'motopress';
    $repo = MPHB()->getBookingRepository();
    $b = $repo->findById($post_id, true);
    $b->setStatus($_POST['mphb_post_status'] ?? $b->status);
    $repo->save($b);   // writes the reloaded total and breakdown LAST
}

/* ===================================================================== *
 * Fixtures
 * ===================================================================== */

/** #17730, byte for byte (room.type / room.rate elided by the Director). */
const RAW_17730 = '{"rooms":[{"room":{"type":"Cottage 34","rate":"Cottage 34","list":{"2026-09-04":150,"2026-09-05":150},"total":300,"discount":0,"discount_total":300,"adults":2,"children":0,"children_capacity":0},"services":{"list":[{"title":"Pet Fee &#8211; Daily","details":"<span class=\"mphb-price\"><span class=\"mphb-currency\">&#36;<\/span>25<\/span> &#215; 2 nights","total":50}],"total":50,"discount":0,"discount_total":50},"fees":{"list":[],"total":0,"discount":0,"discount_total":0},"taxes":{"room":{"list":[{"label":"Lake County Tourist Development Tax","price":12},{"label":"Lake County Discretionary Sales Surtax","price":3},{"label":"Florida Sales and Use Tax","price":18}],"total":33},"services":{"list":[],"total":0},"fees":{"list":[],"total":0}},"total":383,"discount":0,"discount_total":383}],"total":383}';
const SVC_17730 = 'a:1:{i:0;a:3:{s:2:"id";i:17712;s:6:"adults";i:1;s:8:"quantity";i:1;}}';
/** #19656's extra-guest line and row, byte for byte. */
const LINE_19656 = '{"title":"Extra Guest Fee (per guest beyond 2)","details":"<span class=\"mphb-price\"><span class=\"mphb-currency\">&#36;<\/span>50<\/span> &#215; 1 night &#215; 1 guest","total":50}';
const SVC_19656 = 'a:1:{i:0;a:3:{s:2:"id";i:18063;s:6:"adults";i:1;s:8:"quantity";i:1;}}';

function money_out(int $c) { return $c % 100 === 0 ? intdiv($c, 100) : $c / 100; }

/**
 * A breakdown in MotoPress's shape (key order as #17730), from the room's
 * price in cents and the site's three taxes on it, with the given lines
 * (each [title, details, cents]).
 */
function breakdown(string $in, int $nights, int $room_cents, array $lines, int $adults): string {
    $per = intdiv($room_cents, $nights);
    $list = new stdClass();
    $d = new DateTime($in);
    for ($i = 0; $i < $nights; $i++) { $list->{$d->format('Y-m-d')} = money_out($per); $d->modify('+1 day'); }
    $taxes = [];
    foreach (['Lake County Tourist Development Tax' => 400, 'Lake County Discretionary Sales Surtax' => 100, 'Florida Sales and Use Tax' => 600] as $label => $bp) {
        $taxes[] = ['label' => $label, 'price' => money_out(intdiv($room_cents * $bp, 10000))];
    }
    $tax_cents = array_sum(array_map(function ($t) { return (int) round($t['price'] * 100); }, $taxes));
    $svc_cents = array_sum(array_column($lines, 2));
    $room_total = $room_cents + $svc_cents + $tax_cents;
    $b = ['rooms' => [[
        'room' => ['type' => 'Cottage', 'rate' => 'Cottage', 'list' => $list, 'total' => money_out($room_cents), 'discount' => 0,
                   'discount_total' => money_out($room_cents), 'adults' => $adults, 'children' => 0, 'children_capacity' => 0],
        'services' => ['list' => array_map(function ($l) { return ['title' => $l[0], 'details' => $l[1], 'total' => money_out($l[2])]; }, $lines),
                       'total' => money_out($svc_cents), 'discount' => 0, 'discount_total' => money_out($svc_cents)],
        'fees' => ['list' => [], 'total' => 0, 'discount' => 0, 'discount_total' => 0],
        'taxes' => ['room' => ['list' => $taxes, 'total' => money_out($tax_cents)], 'services' => ['list' => [], 'total' => 0], 'fees' => ['list' => [], 'total' => 0]],
        'total' => money_out($room_total), 'discount' => 0, 'discount_total' => money_out($room_total),
    ]], 'total' => money_out($room_total)];
    return json_encode($b);
}

/** The line MotoPress would build for a row (stand-in's prices), with a booking-time title. */
function line_for(array $row, string $in, int $nights, ?string $title = null): array {
    $s = \MPHB\Entities\ReservedService::create($row);
    $o = (new DateTime($in))->modify("+$nights days");
    return [$title ?? $GLOBALS['svc'][$row['id']]['title'], $s->toString('price', $nights), (int) round($s->calcPrice(new DateTime($in), $o) * 100)];
}

/**
 * Booking 19674, one reserved room 900 (physical room 500) on $type.
 * $o: in, nights, adults, rows (service rows), raw (breakdown JSON),
 *     room_cents, total (mphb_total_price), imported, status, coupon,
 *     second_room / second_type.
 */
function seed(int $type, array $o) {
    $in = $o['in'] ?? '2026-11-02';
    $nights = $o['nights'] ?? 2;
    $out = (new DateTime($in))->modify('+' . $nights . ' days')->format('Y-m-d');
    $rows = $o['rows'] ?? [];
    $list_rows = is_string($rows) ? unserialize($rows) : $rows;
    $raw = $o['raw'] ?? breakdown($in, $nights, $o['room_cents'] ?? 30000,
        array_map(function ($r) use ($in, $nights) { return is_array($r) && isset($GLOBALS['svc'][(int) $r['id']]) ? line_for($r, $in, $nights) : ['?', '?', 0]; }, $list_rows),
        $o['adults'] ?? 2);
    $GLOBALS['posts'] = [19674 => ['type' => 'mphb_booking', 'parent' => 0], 900 => ['type' => 'mphb_reserved_room', 'parent' => 19674]];
    $GLOBALS['meta'] = [
        19674 => ['mphb_check_in_date' => $in, 'mphb_check_out_date' => $out, '_mphb_booking_price_breakdown' => $raw,
                  'mphb_total_price' => (string) ($o['total'] ?? json_decode($raw)->total)],
        900   => ['_mphb_room_id' => '500', '_mphb_adults' => (string) ($o['adults'] ?? 2), '_mphb_adults_confirmed' => '1', '_mphb_children' => '0',
                  '_mphb_rate_id' => '4321', '_mphb_guest_name' => 'G', '_mphb_uid' => 'UID-900', '_mphb_services' => $rows],
        500   => ['mphb_room_type_id' => (string) $type],
    ];
    if (!empty($o['imported'])) { $GLOBALS['meta'][19674]['mphb_ical_prodid'] = '-//Vrbo//EN'; }
    if (isset($o['coupon'])) { $GLOBALS['meta'][19674]['mphb_coupon_id'] = $o['coupon']; }
    if (array_key_exists('second_room', $o)) {
        $GLOBALS['posts'][901] = ['type' => 'mphb_reserved_room', 'parent' => 19674];
        $GLOBALS['meta'][901] = ['_mphb_room_id' => '501', '_mphb_adults' => '2', '_mphb_services' => $o['second_room'], '_mphb_uid' => 'UID-901', '_mphb_rate_id' => '1'];
        $GLOBALS['meta'][501] = ['mphb_room_type_id' => (string) ($o['second_type'] ?? $type)];
    }
    $GLOBALS['post_status'] = [19674 => $o['status'] ?? 'confirmed'];
    $GLOBALS['logs'] = []; $GLOBALS['saves'] = 0; $GLOBALS['trans'] = []; $GLOBALS['caps'] = true; $GLOBALS['mp_order'] = [];
    $GLOBALS['repriced'] = 0; $GLOBALS['entity_cache'] = [];
    unset($GLOBALS['opt']['mphb_service_taxes']);
}

/** Boot the hooks as Plugin::boot() does, plus MotoPress's own save. */
function boot() {
    $GLOBALS['hooks'] = [];
    $r = new ReflectionProperty(Fee_Sync::class, 'before'); $r->setAccessible(true); $r->setValue(null, []);
    $r = new ReflectionProperty(Fee_Sync::class, 'pending'); $r->setAccessible(true); $r->setValue(null, []);
    (new Admin_Guests())->register();
    (new Fee_Sync())->register();
    add_action('save_post', 'motopress_save', 10, 2);
}

/**
 * post.php's Update: the hooks wp_update_post() fires, then redirect_post().
 * $fresh = false: the SAME process as the last Update — no reboot, no
 * static reset (only MotoPress's self-removing handler is put back).
 */
function update(array $form, bool $fresh = true) {
    if ($fresh) { boot(); } else { add_action('save_post', 'motopress_save', 10, 2); }
    $_POST = $form + ['post_ID' => 19674, 'dcc_fee_sync_nonce' => 'fee-ok', 'dcc_admin_guests_nonce' => 'guests-ok', 'mphb_post_status' => get_post_status(19674)];
    do_action('save_post_mphb_booking', 19674, new WP_Post(19674), true);
    do_action('save_post', 19674, new WP_Post(19674), true);
    return apply_filters('redirect_post_location', 'post.php?post=19674&action=edit&message=1', 19674);
}

function services(int $rid = 900) { return Fee_Sync::read_services(get_post_meta($rid, '_mphb_services', true)); }
function ids(int $rid = 900) { return array_column(services($rid) ?? [], 'id'); }
function total() { return Fee_Sync::cents(get_post_meta(19674, 'mphb_total_price', true)); }
function bd() { return json_decode((string) get_post_meta(19674, '_mphb_booking_price_breakdown', true)); }
function raw() { return (string) get_post_meta(19674, '_mphb_booking_price_breakdown', true); }
function notice() { ob_start(); Fee_Sync::notice(); return (string) ob_get_clean(); }
/** Fee_Sync's log lines (Admin_Guests writes its own "Guest count …" line too). */
function feelogs() { return array_values(array_filter($GLOBALS['logs'], function ($l) { return strpos($l[1], 'Guest count') !== 0; })); }
/** Every meta value, to prove a refusal wrote nothing. */
function snapshot_meta() { return serialize($GLOBALS['meta']); }
/** Meta with the guest count and its confirmed mark (Admin_Guests' writes, not ours) taken out. */
function snapshot_money() {
    $m = $GLOBALS['meta'];
    foreach ([900, 901] as $r) { unset($m[$r]['_mphb_adults'], $m[$r]['_mphb_adults_confirmed']); }
    return serialize($m);
}

/** The paths at which two decoded breakdowns differ — type-strict, so 50 vs 50.0 is a difference. */
function diff_paths($a, $b, string $p = '') {
    if (is_object($a) && is_object($b)) {
        $ka = array_keys(get_object_vars($a)); $kb = array_keys(get_object_vars($b));
        if ($ka !== $kb) { return [$p . '{keys}']; }
        $out = [];
        foreach ($ka as $k) { $out = array_merge($out, diff_paths($a->$k, $b->$k, "$p.$k")); }
        return $out;
    }
    if (is_array($a) && is_array($b)) {
        if (count($a) !== count($b)) { return [$p]; }
        $out = [];
        foreach ($a as $i => $v) { $out = array_merge($out, diff_paths($v, $b[$i], $p . "[$i]")); }
        return $out;
    }
    return $a === $b ? [] : [$p];
}
const MONEY_PATHS = ['.rooms[0].services.list', '.rooms[0].services.total', '.rooms[0].services.discount_total',
                     '.rooms[0].total', '.rooms[0].discount_total', '.total'];

$PET = ['id' => 17712, 'adults' => 1, 'quantity' => 1];
$OTHER = ['id' => 999, 'adults' => 1, 'quantity' => 1];
// v0.34.0 — everything down to the FLAT MODE block runs in 'tiers' mode: the
// 0.33.1 proofs were built on the length-of-stay prices ($25 / $20 / $10) the
// Director measured, and stay valid as proofs of the add-only arithmetic.
$GLOBALS['opt']['dcc_checkout_settings'] = ['pet_fee_mode' => 'tiers', 'guest_service_daily' => 18063, 'guest_service_weekly' => 18063, 'guest_service_monthly' => 18063, 'guest_fee_amount' => 50];
Config::flush_cache();

/* ===================================================================== *
 * Guards: the fixtures and the stand-in agree with the Director's reads,
 * or nothing below proves anything.
 * ===================================================================== */
check('guard: #17730\'s raw breakdown re-encodes to itself byte for byte (json_encode, default flags)',
    json_encode(json_decode(RAW_17730)), RAW_17730);
$l = \MPHB\Entities\ReservedService::create(unserialize(SVC_17730)[0]);
$d = json_decode(RAW_17730)->rooms[0]->services->list[0];
check('guard: the stand-in builds #17730\'s pet line exactly as stored (details byte for byte, total 50)',
    [$l->toString('price', 2), $l->calcPrice(new DateTime('2026-09-04'), new DateTime('2026-09-06'))], [$d->details, 50.0]);
$l = \MPHB\Entities\ReservedService::create(unserialize(SVC_19656)[0]);
check('guard: and #19656\'s extra-guest line, byte for byte',
    json_encode((object) ['title' => $GLOBALS['svc'][18063]['title'], 'details' => $l->toString('price', 1),
        'total' => (int) $l->calcPrice(new DateTime('2026-10-01'), new DateTime('2026-10-02'))]), LINE_19656);
$b19656 = breakdown('2026-10-01', 1, 17500, [line_for(unserialize(SVC_19656)[0], '2026-10-01', 1)], 3);
$x = json_decode($b19656)->rooms[0];
check('guard: the built breakdown reproduces #19656 (taxes 7 / 1.75 / 10.5 = 19.25, room 244.25, booking 244.25) with its raw line',
    [array_column($x->taxes->room->list, 'price'), $x->taxes->room->total, $x->total, json_decode($b19656)->total, json_encode($x->services->list[0])],
    [[7, 1.75, 10.5], 19.25, 244.25, 244.25, LINE_19656]);
check('guard: and #17730 (taxes 12 / 3 / 18 = 33, 383) from 300 and its line, byte for byte',
    breakdown('2026-09-04', 2, 30000, [line_for(unserialize(SVC_17730)[0], '2026-09-04', 2, 'Pet Fee &#8211; Daily')], 2),
    str_replace('"Cottage 34"', '"Cottage"', RAW_17730));
check('guard: #8798\'s stored total, 1021.2000000000000454…, decodes to the same number as 1021.20',
    json_decode('{"t":1021.2000000000000454747350886464118957519531}')->t, 1021.2);
seed(1607, ['in' => '2026-09-04', 'nights' => 2, 'rows' => SVC_17730, 'raw' => RAW_17730]);
check('guard: the shape check accepts the raw #17730 breakdown', Fee_Sync::read_breakdown(19674) !== null, true);

/* ===================================================================== *
 * #17730, the Director's raw value: pet off, then on again.
 * ===================================================================== */
seed(1607, ['in' => '2026-09-04', 'nights' => 2, 'rows' => SVC_17730, 'raw' => RAW_17730]);
$orig = json_decode(RAW_17730);
update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
$after = bd();
check('#17730 pet off: only the money paths change', diff_paths($orig, $after), MONEY_PATHS);
check('... the line is gone, services 0, room total 333, booking total 333, mphb_total_price 333',
    [$after->rooms[0]->services->list, $after->rooms[0]->services->total, $after->rooms[0]->services->discount_total,
     $after->rooms[0]->total, $after->rooms[0]->discount_total, $after->total, total()],
    [[], 0, 0, 333, 333, 333, 33300]);
check('... the room line, its taxes and fees are byte-identical',
    [json_encode($after->rooms[0]->room), json_encode($after->rooms[0]->taxes), json_encode($after->rooms[0]->fees)],
    [json_encode($orig->rooms[0]->room), json_encode($orig->rooms[0]->taxes), json_encode($orig->rooms[0]->fees)]);
check('... the row is gone from _mphb_services', services(), []);
check('... one log line and the same notice', [feelogs(), notice()],
    [[[19674, 'Pet fee removed; total $383 → $333', 'Rob']], '<div class="notice notice-info is-dismissible"><p>Pet fee removed; total $383 → $333</p></div>']);
check('... the stay was NOT repriced: updateTotal()/setRooms() never called; MotoPress\'s own save ran once',
    [$GLOBALS['repriced'], $GLOBALS['saves']], [0, 1]);

update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
$again = bd();
check('#17730 pet on again: total back to 383 exactly', [total(), $again->total], [38300, 383]);
check('... the new line is MotoPress\'s: today\'s title, the details BYTE-IDENTICAL to the stored raw, calcPrice()\'s total',
    [$again->rooms[0]->services->list[0]->title, json_encode($again->rooms[0]->services->list[0]->details), $again->rooms[0]->services->list[0]->total],
    ['Pet Fee &#8211; Daily Rate', json_encode($orig->rooms[0]->services->list[0]->details), 50]);
check('... so against the original ONLY the title differs (booking-time "Pet Fee &#8211; Daily" vs today\'s); calcPrice()\'s 50.0 is stored as 50, as MotoPress stored it',
    diff_paths($orig, $again), ['.rooms[0].services.list[0].title']);
check('... the row is back as MotoPress writes it', $GLOBALS['meta'][900]['_mphb_services'], unserialize(SVC_17730));
check('... stored as MotoPress stores it: re-encoding the stored value changes nothing (default flags, slashes survived wp_slash)',
    [json_encode(json_decode(raw())) === raw(), strpos(raw(), '<\/span>') !== false], [true, true]);

/* ===================================================================== *
 * The Director's expected totals.
 * ===================================================================== */
/* #10212: 4 nights, $555 (room 500 + taxes 55). */
seed(1607, ['nights' => 4, 'room_cents' => 50000]);
$orig = bd();
check('guard: #10212 stand-in is $555', total(), 55500);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
check('#10212 pet on → $655; only the money paths changed', [total(), bd()->total, diff_paths($orig, bd())], [65500, 655, MONEY_PATHS]);
update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
check('#10212 pet off → $555, and the breakdown is back EXACTLY (every path, type-strict)', [total(), diff_paths($orig, bd())], [55500, []]);
check('... byte for byte', raw(), json_encode($orig));
check('... two log lines', array_column(feelogs(), 1), ['Pet fee added; total $555 → $655', 'Pet fee removed; total $655 → $555']);

/* #8798: $1,021.20, a float total. 8 nights, the weekly tier. */
seed(1607, ['nights' => 8, 'room_cents' => 92000]);
$orig = bd();
check('guard: #8798 stand-in is $1,021.20 with float taxes', [total(), $orig->total, $orig->rooms[0]->taxes->room->total], [102120, 1021.2, 101.2]);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
check('#8798 pet on → $1,181.20 (the weekly tier, 8 × $20)', [total(), bd()->total, ids()], [118120, 1181.2, [17711]]);
update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
check('#8798 pet off → $1,021.20 to the cent, and the breakdown back exactly', [total(), diff_paths($orig, bd())], [102120, []]);
check('... the log reads in money, not floats', array_column(feelogs(), 1),
    ['Pet fee added; total $1,021.20 → $1,181.20', 'Pet fee removed; total $1,181.20 → $1,021.20']);

/* #10222: on → $327.50 (room 250 + taxes 27.50; 2 nights, the daily tier). */
seed(1607, ['nights' => 2, 'room_cents' => 25000]);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
check('#10222 pet on → $327.50, stored as a float', [total(), bd()->total, $GLOBALS['meta'][19674]['mphb_total_price']], [32750, 327.5, 327.5]);

/* To the cent: a total whose float × 100 falls just below a whole cent (266.4 → 26639.999…). */
seed(1607, ['nights' => 2, 'room_cents' => 24000]);
$orig = bd();
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
$on = [total(), bd()->total, feelogs()[0][1] ?? ''];
update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
check('$266.40 (a float that is 26639.999… cents): on → $316.40, off → back exactly, logged in whole cents',
    [$on, total(), diff_paths($orig, bd())], [[31640, 316.4, 'Pet fee added; total $266.40 → $316.40'], 26640, []]);

/* #10198: 2 nights, $333, count 2 → 3 → 4 → 2, IN ONE PROCESS. */
seed(1065, ['nights' => 2, 'room_cents' => 30000]);
$orig = bd();
boot();
$steps = [];
foreach (['3', '4', '2'] as $n) {
    update(['dcc_adults' => [900 => $n]], false);
    $fee = array_values(array_filter(services(), function ($r) { return $r['id'] === 18063; }));
    $steps[] = [$n, (string) $GLOBALS['meta'][900]['_mphb_adults'], bd()->rooms[0]->room->adults, $fee ? $fee[0]['adults'] : 0, total()];
}
check('#10198, ONE process, 2→3→4→2: each Update keeps ITS count (meta and room.adults); the fee follows; $433 / $533 / $333',
    $steps, [['3', '3', 3, 1, 43300], ['4', '4', 4, 2, 53300], ['2', '2', 2, 0, 33300]]);
check('... and ends EXACTLY where it started: every path, type-strict, and byte for byte', [diff_paths($orig, bd()), raw()], [[], json_encode($orig)]);
check('... three fee log lines', array_column(feelogs(), 1), [
    'Extra guest fee set to 1 guest; total $333 → $433',
    'Extra guest fee set to 2 guests; total $433 → $533',
    'Extra guest fee removed; total $533 → $333',
]);
check('... the confirmed mark untouched; nothing repriced', [(string) $GLOBALS['meta'][900]['_mphb_adults_confirmed'], $GLOBALS['repriced']], ['1', 0]);

/* The same with another service before the fee: it rides through, first in the list. */
seed(1065, ['nights' => 2, 'room_cents' => 30000, 'rows' => [$OTHER]]);
$orig = bd();
boot();
foreach (['3', '4', '2'] as $n) { update(['dcc_adults' => [900 => $n]], false); }
check('with another service on the room: it stays first and the round trip still ends exactly where it started',
    [ids(), diff_paths($orig, bd())], [[999], []]);

/* A 3→2 in the SAME process as a 2→3: the snapshot must be this Update's. */
seed(1065, ['nights' => 2, 'room_cents' => 30000]);
boot();
update(['dcc_adults' => [900 => '3']], false);
update(['dcc_adults' => [900 => '2']], false);
check('one process, 2→3 then 3→2: the second Update sees its own change (fee removed, $333)', [ids(), total()], [[], 33300]);

/* #19656: the extra-guest line replaced IN PLACE, and removed. */
seed(1065, ['in' => '2026-10-01', 'nights' => 1, 'adults' => 3, 'rows' => SVC_19656, 'raw' => $b19656]);
$orig = bd();
update(['dcc_adults' => [900 => '4']]);
$after = bd();
check('#19656 3→4: the line replaced in place — details, total, the money totals and room.adults; nothing else',
    diff_paths($orig, $after), ['.rooms[0].room.adults', '.rooms[0].services.list[0].details', '.rooms[0].services.list[0].total',
     '.rooms[0].services.total', '.rooms[0].services.discount_total', '.rooms[0].total', '.rooms[0].discount_total', '.total']);
check('... "× 1 night × 2 guests", $100; total $294.25; taxes still 19.25',
    [$after->rooms[0]->services->list[0]->details, $after->rooms[0]->services->list[0]->total, total(), $after->rooms[0]->taxes->room->total],
    ['<span class="mphb-price"><span class="mphb-currency">&#36;</span>50</span> &#215; 1 night &#215; 2 guests', 100, 29425, 19.25]);
check('... the row now carries 2 extra guests, quantity 1', services(), [['id' => 18063, 'adults' => 2, 'quantity' => 1]]);
seed(1065, ['in' => '2026-10-01', 'nights' => 1, 'adults' => 3, 'rows' => SVC_19656, 'raw' => $b19656]);
update(['dcc_adults' => [900 => '2']]);
check('#19656 3→2: the line removed, $194.25, room.adults 2', [bd()->rooms[0]->services->list, total(), bd()->rooms[0]->room->adults, services()], [[], 19425, 2, []]);

/* ===================================================================== *
 * The pet fee, at each tier: the stay's own length decides.
 * ===================================================================== */
foreach ([[2, 17712, 25], [6, 17712, 25], [7, 17711, 20], [29, 17711, 20], [30, 14926, 10], [45, 14926, 10]] as [$nights, $tier, $rate]) {
    seed(1607, ['nights' => $nights, 'room_cents' => 10000 * $nights, 'rows' => [$OTHER]]);
    $was = total();
    $loc = update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
    check("pet Yes, $nights nights: the $tier tier appended after the other service, + exactly $rate × $nights",
        [ids(), total() - $was, count(bd()->rooms[0]->services->list)], [[999, $tier], $rate * $nights * 100, 2]);
    check("... the location is returned untouched", $loc, 'post.php?post=19674&action=edit&message=1');
}

/* The translated service id is the one titled (PriceBreakdownHelper's filter). */
seed(1607, ['nights' => 2]);
boot();
add_filter('_mphb_translate_post_id', function ($id) { return $id === 17712 ? 999 : $id; }, 10, 1);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']], false);
check('the title comes from the service the translation filter names', bd()->rooms[0]->services->list[0]->title, 'Late Checkout');

/* What must NOT change. */
seed(1607, ['nights' => 2, 'adults' => 1, 'rows' => [$OTHER]]);
$before = $GLOBALS['meta'][900];
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
$m = $GLOBALS['meta'][900];
unset($before['_mphb_services'], $m['_mphb_services']);
check('the reserved room: every meta but _mphb_services untouched (uid, rate, guest name, adults, children, confirmed mark)',
    [$m, isset($GLOBALS['posts'][900]), get_post_status(19674)], [$before, true, 'confirmed']);

/* Rows this does not change are written back as stored. */
seed(1607, ['nights' => 2, 'rows' => [['id' => '999', 'adults' => '1', 'quantity' => '1', 'note' => 'x']]]);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
check('an untouched row keeps its exact stored form (string ids, extra keys)', $GLOBALS['meta'][900]['_mphb_services'][0],
    ['id' => '999', 'adults' => '1', 'quantity' => '1', 'note' => 'x']);

/* No change asked. */
seed(1607, ['nights' => 2, 'rows' => [$PET]]);
$snap = snapshot_meta();
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']]);
check('pet already Yes and count unchanged: nothing written beyond MotoPress\'s own save, no log, no notice',
    [snapshot_meta() === $snap, $GLOBALS['saves'], feelogs(), notice()], [true, 1, [], '']);

/* Count unchanged, fee mismatched (an old booking, a waived fee): left alone. */
seed(1065, ['nights' => 3, 'adults' => 3, 'rows' => [$OTHER]]);
$snap = snapshot_meta();
update(['dcc_adults' => [900 => 'keep']]);
check('a 3-guest booking WITHOUT the fee, saved for another reason: left exactly as it is', [snapshot_meta() === $snap, feelogs()], [true, []]);
seed(1065, ['nights' => 3, 'adults' => 3, 'rows' => [$OTHER]]);
update(['dcc_adults' => [900 => '3']]);
check('... and confirming the same number is not a change either', [ids(), feelogs()], [[999], []]);

/* A 2-sleeper: the count never brings a fee — but the breakdown gets the count. */
seed(1604, ['nights' => 3, 'adults' => 1]);
$orig = bd();
update(['dcc_adults' => [900 => '2']]);
check('Cottage 33: 1→2 adds no fee and says nothing; the breakdown\'s room.adults becomes 2 and NOTHING else changes',
    [ids(), feelogs(), notice(), diff_paths($orig, bd()), bd()->rooms[0]->room->adults, total()],
    [[], [], '', ['.rooms[0].room.adults'], 2, Fee_Sync::cents($orig->total)]);
seed(1607, ['nights' => 3, 'adults' => 1]);
update(['dcc_adults' => [900 => '2']]);
check('Cottage 34: the same', [ids(), feelogs(), bd()->rooms[0]->room->adults], [[], [], 2]);
seed(1604, ['nights' => 3, 'adults' => 1, 'coupon' => '55']);
update(['dcc_adults' => [900 => '2']]);
check('... a count-only change is recorded even with a coupon (no money moves)', [bd()->rooms[0]->room->adults, notice()], [2, '']);

/* A SETTING MUST REACH ITS CONSUMER. */
$GLOBALS['opt']['dcc_checkout_settings']['guest_accommodations'] = [1071, 1069, 1067, 1740, 1742];
Config::flush_cache();
seed(1065, ['nights' => 3, 'rows' => [$OTHER]]);
update(['dcc_adults' => [900 => '3']]);
check('Cottage 22 taken off the extra-guest list in settings: 2→3 adds no fee', [ids(), feelogs()], [[999], []]);
$GLOBALS['opt']['dcc_checkout_settings']['guest_accommodations'] = [1071, 1069, 1067, 1065, 1740, 1742];
Config::flush_cache();
seed(1065, ['nights' => 3, 'rows' => [$OTHER]]);
update(['dcc_adults' => [900 => '3']]);
check('guard: back on the list, the same Update does add it', ids(), [999, 18063]);

$GLOBALS['opt']['dcc_guest34_enabled'] = '';
Config::flush_cache();
seed(1065, ['nights' => 3, 'rows' => [$OTHER]]);
update(['dcc_adults' => [900 => '3']]);
check('Guests 3 and 4 switched off: 2→3 adds no fee', [ids(), feelogs()], [[999], []]);
unset($GLOBALS['opt']['dcc_guest34_enabled']);
Config::flush_cache();

/* ===================================================================== *
 * Never: imports, cancelled, abandoned.
 * ===================================================================== */
seed(1607, ['nights' => 2, 'imported' => true]);
$snap = snapshot_money();
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']]);
check('an IMPORT: the pet choice writes nothing', [snapshot_money() === $snap, feelogs()], [true, []]);
seed(1065, ['nights' => 3, 'imported' => true]);
$snap = snapshot_money();
update(['dcc_adults' => [900 => '4']]);
check('an IMPORT: a count change brings no fee and leaves the breakdown alone', [snapshot_money() === $snap, feelogs()], [true, []]);
foreach (['cancelled', 'abandoned'] as $st) {
    seed(1607, ['nights' => 2, 'status' => $st]);
    update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']]);
    $pet = [ids(), feelogs()];
    seed(1065, ['nights' => 3, 'status' => $st]);
    $snap = snapshot_money();
    update(['dcc_adults' => [900 => '4']]);
    check("a $st booking: no pet fee, no extra-guest fee, the breakdown untouched", [$pet, snapshot_money() === $snap, feelogs()], [[[], []], true, []]);
}
seed(1607, ['nights' => 2]);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2'], 'mphb_post_status' => 'cancelled']);
check('cancelled IN THIS Update (MotoPress saves the new status first): no fee is added', [get_post_status(19674), ids()], ['cancelled', []]);

/* ===================================================================== *
 * Only the booking screen's own Update, by someone allowed.
 * ===================================================================== */
foreach ([
    'no fee nonce'    => ['dcc_fee_sync_nonce' => ''],
    'a bad nonce'     => ['dcc_fee_sync_nonce' => 'nope'],
    'another post_ID' => ['post_ID' => 123],
] as $label => $over) {
    seed(1607, ['nights' => 2]);
    update(array_merge(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']], $over));
    check("$label: nothing", [ids(), feelogs()], [[], []]);
}
seed(1607, ['nights' => 2]);
$GLOBALS['caps'] = false;
update(['dcc_pet_fee' => 'yes']);
check('no edit_post capability: nothing', [ids(), feelogs()], [[], []]);
seed(1607, ['nights' => 2]);
boot();
$_POST = ['post_ID' => 19674, 'dcc_fee_sync_nonce' => 'fee-ok', 'dcc_pet_fee' => 'yes'];
do_action('save_post', 19674, new WP_Post(19674), true);
check('no redirect (not the edit form\'s Update): nothing changes', [ids(), feelogs()], [[], []]);

/* ===================================================================== *
 * Timing.
 * ===================================================================== */
seed(1607, ['nights' => 2]);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']]);
check('MotoPress\'s save writes its reloaded total and breakdown LAST, yet the new ones stand: the change ran after it',
    [$GLOBALS['mp_order'], total(), count(bd()->rooms[0]->services->list), count(feelogs())], [['motopress'], 38300, 1, 1]);

/* At save_post 20 — the Director's first proposal — against the same MotoPress. */
seed(1607, ['nights' => 2]);
boot();
$GLOBALS['hooks']['redirect_post_location'] = [];
add_action('save_post', function ($id) {
    if ((int) $id === 19674 && empty($GLOBALS['ran'])) { $GLOBALS['ran'] = 1; Fee_Sync::sync(19674, 'yes', []); }
}, 20, 1);
$_POST = ['post_ID' => 19674, 'dcc_fee_sync_nonce' => 'fee-ok', 'mphb_post_status' => 'confirmed'];
do_action('save_post', 19674, new WP_Post(19674), true);
check('guard: run at save_post 20 instead, MotoPress\'s reloaded writes overwrite it — services say Yes, total and breakdown say No',
    [ids(), total(), count(bd()->rooms[0]->services->list)], [[17712], 33300, 0]);
unset($GLOBALS['ran']);

/* ===================================================================== *
 * FAIL SAFE: each refusal writes NOTHING and tells staff.
 * ===================================================================== */
function refused(string $label, string $needle, callable $setup, array $form = ['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]) {
    $setup();
    $snap = snapshot_money();
    update($form);
    $n = notice();
    check("refused — $label: nothing written, staff told to use Edit Accommodations",
        [snapshot_money() === $snap, strpos($n, $needle) !== false, strpos($n, 'Use Edit Accommodations.') !== false, feelogs()],
        [true, true, true, []]);
}
refused('a coupon on the booking', 'has a coupon', function () { seed(1607, ['nights' => 2, 'coupon' => '12']); });
refused('a coupon on the booking (removal too)', 'has a coupon', function () use ($PET) { seed(1607, ['nights' => 2, 'rows' => [$PET], 'coupon' => '12']); },
    ['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
refused('service taxes configured', 'service taxes', function () { seed(1607, ['nights' => 2]); $GLOBALS['opt']['mphb_service_taxes'] = [5]; });
refused('a service discount', 'not in the form', function () {
    seed(1607, ['nights' => 2]);
    $b = bd(); $b->rooms[0]->services->discount = 5; $GLOBALS['meta'][19674]['_mphb_booking_price_breakdown'] = json_encode($b);
});
refused('a service tax line in the breakdown', 'not in the form', function () {
    seed(1607, ['nights' => 2]);
    $b = bd(); $b->rooms[0]->taxes->services->list = [(object) ['label' => 'x', 'price' => 1]]; $b->rooms[0]->taxes->services->total = 1;
    $GLOBALS['meta'][19674]['_mphb_booking_price_breakdown'] = json_encode($b);
});
refused('the breakdown total disagrees with mphb_total_price', 'not in the form', function () {
    seed(1607, ['nights' => 2]); $GLOBALS['meta'][19674]['mphb_total_price'] = '334';
});
refused('two rooms in the breakdown', 'not in the form', function () {
    seed(1607, ['nights' => 2]);
    $b = bd(); $b->rooms[] = $b->rooms[0]; $GLOBALS['meta'][19674]['_mphb_booking_price_breakdown'] = json_encode($b);
});
refused('a breakdown that is not JSON', 'not in the form', function () { seed(1607, ['nights' => 2]); $GLOBALS['meta'][19674]['_mphb_booking_price_breakdown'] = 'a:0:{}'; });
refused('no breakdown at all', 'not in the form', function () { seed(1607, ['nights' => 2]); $GLOBALS['meta'][19674]['_mphb_booking_price_breakdown'] = ''; });
refused('services missing a key', 'not in the form', function () {
    seed(1607, ['nights' => 2]);
    $b = bd(); unset($b->rooms[0]->services->discount_total); $GLOBALS['meta'][19674]['_mphb_booking_price_breakdown'] = json_encode($b);
});
refused('a row MotoPress no longer knows (its line was skipped, so positions cannot be trusted)', 'do not line up', function () use ($OTHER) {
    seed(1607, ['nights' => 2, 'rows' => [$OTHER]]);
    $GLOBALS['meta'][900]['_mphb_services'] = [['id' => 4444, 'adults' => 1, 'quantity' => 1], $OTHER];
});
refused('the line at that position is not the fee\'s price (repriced since, or not that line)', 'is not the one this would remove', function () use ($PET) {
    seed(1607, ['nights' => 2, 'rows' => [$PET]]);
    $b = bd(); $b->rooms[0]->services->list[0]->total = 40; $b->rooms[0]->services->total = 40; $b->rooms[0]->services->discount_total = 40;
    $b->rooms[0]->total -= 10; $b->rooms[0]->discount_total -= 10; $b->total -= 10;
    $GLOBALS['meta'][19674]['_mphb_booking_price_breakdown'] = json_encode($b); $GLOBALS['meta'][19674]['mphb_total_price'] = (string) $b->total;
}, ['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
refused('the extra-guest line is not 18063\'s price × its row', 'is not the one this would remove', function () use ($b19656) {
    seed(1065, ['in' => '2026-10-01', 'nights' => 1, 'adults' => 3, 'rows' => SVC_19656, 'raw' => $b19656]);
    $GLOBALS['meta'][900]['_mphb_services'] = [['id' => 18063, 'adults' => 2, 'quantity' => 1]];   // row says 2, line says 1
}, ['dcc_adults' => [900 => '2']]);
refused('services in a shape this cannot read', 'could not be read', function () { seed(1607, ['nights' => 2, 'rows' => [17712]]); },
    ['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
refused('the tier for this stay is not on the cottage', 'was not added', function () {
    seed(1607, ['nights' => 2]); $GLOBALS['room_types'][1607]['services'] = [17711, 14926];
});
$GLOBALS['room_types'][1607]['services'] = [17712, 17711, 14926, 999];
refused('a two-room booking whose count change needs a fee', 'more than one accommodation', function () {
    seed(1065, ['nights' => 3, 'second_room' => [], 'second_type' => 1604]);
}, ['dcc_adults' => [900 => '3', 901 => '2']]);
refused('MotoPress cannot build the new line (create() returns null for the tier)', 'could not price', function () {
    seed(1607, ['nights' => 2]);
    $GLOBALS['svc_backup'] = $GLOBALS['svc'];
    unset($GLOBALS['svc'][17712]);
});
$GLOBALS['svc'] = $GLOBALS['svc_backup'];

seed(1607, ['nights' => 2, 'second_room' => [], 'second_type' => 1607]);
$snap = snapshot_meta();
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep', 901 => 'keep']]);
check('two rooms on a pet-fee cottage: the pet choice is not applied (whose dog?) and nothing is said', [snapshot_meta() === $snap, notice()], [true, '']);
seed(1604, ['nights' => 3, 'adults' => 1, 'second_room' => [], 'second_type' => 1604]);
$snap = $GLOBALS['meta'][19674];
update(['dcc_adults' => [900 => '2', 901 => 'keep']]);
check('two rooms, a count-only change: the breakdown is not touched (which room is which is not proven), nothing said',
    [$GLOBALS['meta'][19674] === $snap, notice()], [true, '']);

/* ===================================================================== *
 * What the booking screen offers.
 * ===================================================================== */
seed(1607, ['nights' => 2, 'rows' => [$PET]]);
check('screen: a direct, active Cottage 34 booking gets the control', Fee_Sync::pet_control(19674), 'select');
seed(1607, ['nights' => 2, 'rows' => [17712]]);
check('... services it cannot read: read-only', Fee_Sync::pet_control(19674), 'readonly');
seed(1607, ['nights' => 2, 'rows' => [$PET], 'status' => 'cancelled']);
check('... cancelled: read-only', Fee_Sync::pet_control(19674), 'readonly');
seed(1607, ['nights' => 2, 'imported' => true]);
check('... an import: no pet part from here ("Bringing a dog?" instead)', Fee_Sync::pet_control(19674), '');
seed(1065, ['nights' => 2]);
check('... not a pet-fee cottage: none', Fee_Sync::pet_control(19674), '');
seed(1607, ['nights' => 2, 'second_room' => [], 'second_type' => 1607]);
check('... two rooms on a pet-fee cottage: read-only (the save would not apply it either)', Fee_Sync::pet_control(19674), 'readonly');
seed(1065, ['nights' => 3, 'adults' => 4, 'rows' => [['id' => 18063, 'adults' => 2, 'quantity' => 1]]]);
check('the stored extra-guest multiplier is read from the room', [Fee_Sync::room_fee_multiplier(900), Fee_Sync::fee_cottage(900)], [2, true]);

function extras_box() { return \DCC_Checkout\Extra_Details::box_html(19674); }
seed(1607, ['nights' => 2, 'rows' => [$PET]]);
$h = extras_box();
check('Extra Details/Options, direct and active: the control says the room price is not changed, and the note sits beside Edit Accommodations',
    [strpos($h, 'The room price is not changed.') !== false, strpos($h, 'data-dcc-edit-accommodations="1"') !== false,
     (bool) preg_match('/data-dcc-edit-accommodations="1">[^<]*<\/p><p class="dcc_extras-edit-note description">Edit Accommodations recalculates the whole stay at today&#039;s rates\.<\/p>/', $h)],
    [true, true, true]);
seed(1607, ['nights' => 2, 'rows' => [17712]]);
check('... read-only but active: the Edit Accommodations prompt and the note', (bool) preg_match('/To add or remove the pet fee, use Edit Accommodations\.<\/p><p class="dcc_extras-edit-note description">/', extras_box()), true);
seed(1607, ['nights' => 2, 'rows' => [$PET], 'status' => 'cancelled']);
check('... cancelled: no Edit Accommodations link and no note', [strpos(extras_box(), 'data-dcc-edit-accommodations'), strpos(extras_box(), 'today&#039;s rates')], [false, false]);

function guests_box() { ob_start(); (new Admin_Guests())->render(new WP_Post(19674)); return (string) ob_get_clean(); }
seed(1065, ['nights' => 3, 'adults' => 4, 'rows' => [['id' => 18063, 'adults' => 2, 'quantity' => 1]]]);
$h = guests_box();
check('Guest count box, active 4-sleeper: the stored fee, the Update hint (room price unchanged), and the fee nonce',
    [strpos($h, 'Extra guest fee: 2 guests × $50/night') !== false, strpos($h, 'press Update: the extra guest fee is added, changed or removed. The room price is not changed.') !== false,
     strpos($h, 'name="dcc_fee_sync_nonce"') !== false], [true, true, true]);
seed(1065, ['nights' => 3, 'adults' => 3, 'rows' => [['id' => 18063, 'adults' => 1, 'quantity' => 1]], 'status' => 'cancelled']);
$h = guests_box();
check('... cancelled: the fee still shown as charged, and the hint says it is not changed',
    [strpos($h, 'Extra guest fee: 1 guest × $50/night') !== false, strpos($h, "Fees aren&#039;t changed on a cancelled or abandoned booking.") !== false,
     strpos($h, 'press Update') === false], [true, true, true]);
seed(1065, ['nights' => 3, 'adults' => 4, 'imported' => true]);
$h = guests_box();
check('... an import: no fee line and no hint (imports never carry the fee)',
    [strpos($h, 'dcc_admin-feeline'), strpos($h, 'dcc_admin-feehint')], [false, false]);
seed(1607, ['nights' => 3]);
check('... Cottage 34: no fee line or hint (not a cottage with the fee)', strpos(guests_box(), 'dcc_admin-fee'), false);

/* Notices are escaped. */
seed(1607, ['nights' => 2, 'rows' => [17712]]);
update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
check('the notice is escaped', notice(),
    '<div class="notice notice-info is-dismissible"><p>Fees were not changed: this booking&#039;s services could not be read. Use Edit Accommodations.</p></div>');

/* ===================================================================== *
 * v0.34.0 — FLAT MODE, as live since 2026-10-11. Cottage 34 carries only
 * 19692 ($50 a night); the three tier services stay published, detached,
 * and are still RECOGNISED on the bookings that carry them.
 * ===================================================================== */
$GLOBALS['opt']['dcc_checkout_settings']['pet_fee_mode'] = 'flat';
unset($GLOBALS['opt']['dcc_checkout_settings']['service_flat']);
Config::flush_cache();
$GLOBALS['room_types'][1607]['services'] = [19692, 999];
check('guard: flat mode, the flat service is 19692 and every stay is charged it',
    [Config::pet_fee_mode(), Config::service_id_for_nights(2), Config::service_id_for_nights(8), Config::service_id_for_nights(35)],
    ['flat', 19692, 19692, 19692]);

/* Flat prices 2 / 8 / 35 nights at $100 / $400 / $1,750, and each round
   trip ends exactly where it started. */
foreach ([[2, 10000], [8, 40000], [35, 175000]] as [$nights, $fee]) {
    seed(1607, ['nights' => $nights, 'room_cents' => 10000 * $nights]);
    $orig = bd();
    $was  = total();
    update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
    $line = bd()->rooms[0]->services->list[0] ?? null;
    check("flat, $nights nights, pet on: + exactly \$" . ($fee / 100) . ", the flat line as MotoPress builds it, only the money paths changed",
        [total() - $was, ids(), $line ? $line->title : null, $line ? $line->details : null, diff_paths($orig, bd())],
        [$fee, [19692], 'Pet Fee (per night)',
         '<span class="mphb-price"><span class="mphb-currency">&#36;</span>50</span> &#215; ' . $nights . ' nights', MONEY_PATHS]);
    update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
    check("flat, $nights nights, pet off: back EXACTLY (every path, and byte for byte)", [total(), diff_paths($orig, bd()), raw()], [$was, [], json_encode($orig)]);
}

/* The Director's staging figures with 0.33.1 under the flat settings:
   #10222 (2 nights) +$100, #8798 (8 nights) +$400. */
seed(1607, ['nights' => 2, 'room_cents' => 25000]);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
check('#10222 shape (2 nights): pet on adds $100', total(), 27750 + 10000);
seed(1607, ['nights' => 8, 'room_cents' => 92000]);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
check('#8798 shape (8 nights): pet on adds $400 — $1,021.20 → $1,421.20', [total(), bd()->total], [142120, 1421.2]);

/* AN OLD-TIER BOOKING under flat mode (#17730, raw): its 17712 line is a pet
   fee. Yes adds NO second line; No removes it by index with the calcPrice
   check (the old service's price is unchanged); a later Yes adds the flat. */
seed(1607, ['in' => '2026-09-04', 'nights' => 2, 'rows' => SVC_17730, 'raw' => RAW_17730]);
$snap = snapshot_meta();
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
check('old-tier booking, flat mode, pet Yes (already on): NO second line — nothing written at all, byte-identical',
    [snapshot_meta() === $snap, raw(), feelogs(), notice()], [true, RAW_17730, [], '']);
check('... the screen offers the control, opening on Yes (the old fee is recognised)',
    [Fee_Sync::pet_control(19674), \DCC_Checkout\Admin_Fields::booking_pet_state(19674)], ['select', 'yes']);
update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
$off = bd();
check('old-tier booking, flat mode, pet No: the OLD line is removed, $383 → $333, only the money paths changed',
    [ids(), total(), $off->rooms[0]->services->list, diff_paths(json_decode(RAW_17730), $off), feelogs()[0][1] ?? ''],
    [[], 33300, [], MONEY_PATHS, 'Pet fee removed; total $383 → $333']);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
check('... then Yes: the ACTIVE flat fee is added (2 × $50), never the old tier',
    [ids(), total(), bd()->rooms[0]->services->list[0]->title], [[19692], 43300, 'Pet Fee (per night)']);
update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
check('... and No again: back to the off state exactly', [total(), diff_paths($off, bd())], [33300, []]);

/* A stored line that is not the old service's price today refuses, as 0.33.1. */
seed(1607, ['in' => '2026-09-04', 'nights' => 2, 'rows' => SVC_17730, 'raw' => RAW_17730]);
$GLOBALS['svc'][17712]['price'] = 30;
$snap = snapshot_money();
update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => 'keep']]);
check('old-tier line whose service price has changed since: refused, nothing written',
    [snapshot_money() === $snap, strpos(notice(), 'is not the one this would remove') !== false], [true, true]);
$GLOBALS['svc'][17712]['price'] = 25;

/* The flat service not attached to the cottage: the mode-aware refusal. */
seed(1607, ['nights' => 2]);
$GLOBALS['room_types'][1607]['services'] = [17712, 999];
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
check('flat mode, the flat service not attached: nothing added, and the message names the attachment',
    [ids(), strpos(notice(), 'its service is not attached to this cottage in MotoPress') !== false], [[], true]);
$GLOBALS['room_types'][1607]['services'] = [19692, 999];

seed(1607, ['nights' => 2, 'rows' => [['id' => 19692, 'adults' => 1, 'quantity' => 1]]]);
check('flat mode screen hint: the flat fee\'s own amount, from its service',
    \DCC_Checkout\Extra_Details::pet_update_hint(),
    'Change it and press Update: the pet fee ($50 per night) is added or removed. The room price is not changed.');
$GLOBALS['opt']['dcc_checkout_settings']['pet_fee_mode'] = 'tiers';
Config::flush_cache();
check('tiers mode screen hint: the stay\'s length decides',
    \DCC_Checkout\Extra_Details::pet_update_hint(),
    "Change it and press Update: the pet fee for this stay's length is added or removed. The room price is not changed.");

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
}
