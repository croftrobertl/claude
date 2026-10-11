<?php
/**
 * v0.33.0 — fees follow the booking screen's Update button (Fee_Sync).
 *
 *     php tests/fees/run.php
 *
 * WHAT IS REAL HERE: Fee_Sync, Admin_Guests (it writes the new count first),
 * Config, Admin_Fields, Policies — the shipped files.
 *
 * WHAT IS A STAND-IN, and what it is built from. MotoPress cannot run here, so
 * its booking repository and entities are modelled on the Director's reads of
 * live 6.3.0 (CLAUDE.md, "ONE-TAP PET FEE (B)"):
 *  - ReservedRoom: the constructor atts and getters as read; an omitted `uid`
 *    makes a NEW uid (the trap the code must avoid);
 *  - ReservedService::create(['id','adults','quantity']): null for an id it
 *    does not know;
 *  - BookingRepository::findById($id, true) reloads from storage; save()
 *    writes `mphb_total_price` and fires save_post (it calls wp_update_post);
 *    updateReservedRooms($id) saves a listed room IN PLACE and deletes any
 *    other room of the booking;
 *  - Booking::setRooms() / updateTotal() / addLog().
 * The PRICES are the stand-in's own ($100/night base, pet $25/$20/$10 a night,
 * extra guest $50 a night per guest, a $20 "other" service): what is proven is
 * what MotoPress is GIVEN and that it is asked to reprice — never MotoPress's
 * arithmetic. The Director's staging comparison is the proof of the total.
 *
 * MOTOPRESS'S OWN UPDATE is modelled too (EditCPTPage::saveMetaBoxes on
 * save_post at 10: removes itself, reloads, sets the posted status, saves) —
 * in the order it really runs: it writes the reloaded (stale) total AFTER its
 * own nested save_post has run. First built as the worst plausible case; then
 * VERIFIED as MotoPress's real order (Director, live 6.3.0:
 * CPTPersistence::update() ~172 calls wp_update_post() before
 * updatePostRelatedData(), which writes mphb_total_price). That is what
 * decides where the rebuild may run.
 */
namespace {
define('ABSPATH', __DIR__);

$GLOBALS['hooks'] = []; $GLOBALS['posts'] = []; $GLOBALS['meta'] = []; $GLOBALS['opt'] = [];
$GLOBALS['caps'] = true; $GLOBALS['trans'] = []; $GLOBALS['post_status'] = []; $GLOBALS['saves'] = 0;
$GLOBALS['logs'] = []; $GLOBALS['next_id'] = 5000; $GLOBALS['mp_order'] = [];

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
function update_post_meta($id, $k, $v) { $GLOBALS['meta'][(int) $id][$k] = $v; return true; }
function delete_post_meta($id, $k) { unset($GLOBALS['meta'][(int) $id][$k]); return true; }
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
function wp_delete_post($id) { do_action('before_delete_post', $id); unset($GLOBALS['posts'][$id], $GLOBALS['meta'][$id]); }
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
function wp_strip_all_tags($t) { return strip_tags((string) $t); }
function set_transient($k, $v, $t = 0) { $GLOBALS['trans'][$k] = $v; return true; }
function get_transient($k) { return $GLOBALS['trans'][$k] ?? false; }
function delete_transient($k) { unset($GLOBALS['trans'][$k]); return true; }
function wp_cache_delete($k, $g = '') { return true; }
function selected($a, $b, $e = true) { return (string) $a === (string) $b ? ' selected' : ''; }
class WP_Post { public $ID; public $post_type = 'mphb_booking'; public function __construct($id) { $this->ID = $id; } }

/* Room types and what MotoPress attaches to each (live picture). */
$GLOBALS['room_types'] = [
    1065 => ['services' => [18063, 999], 'adults' => 4],   // Cottage 22, a 4-sleeper
    1607 => ['services' => [17712, 17711, 14926, 999], 'adults' => 2],   // Cottage 34
    1604 => ['services' => [], 'adults' => 2],              // Cottage 33
];
/* The stand-in's own prices, per night (999 is flat). */
$GLOBALS['price'] = [17712 => 25, 17711 => 20, 14926 => 10, 18063 => 50, 999 => 20];

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
    };
}
}

namespace MPHB\Entities {
class ReservedService {
    public $id, $adults, $quantity;
    public static function create($atts) {
        if (!isset($atts['id'], $atts['adults']) || !isset($GLOBALS['price'][(int) $atts['id']])) { return null; }
        $s = new self(); $s->id = (int) $atts['id']; $s->adults = (int) $atts['adults']; $s->quantity = (int) ($atts['quantity'] ?? 1);
        return $s;
    }
}
class ReservedRoom {
    public $a;
    public function __construct(array $atts) {
        // As read: uid via array_key_exists — omitted, a NEW one is generated.
        if (!array_key_exists('uid', $atts)) { $atts['uid'] = 'NEW-' . (++$GLOBALS['next_id']); }
        $this->a = $atts + ['status' => 'publish'];
    }
    public function getId() { return (int) ($this->a['id'] ?? 0); }
    public function getRoomId() { return $this->a['room_id']; }
    public function getRateId() { return $this->a['rate_id']; }
    public function getAdults() { return $this->a['adults']; }
    public function getChildren() { return $this->a['children']; }
    public function getGuestName() { return $this->a['guest_name']; }
    public function getStatus() { return $this->a['status']; }
    public function getUid() { return $this->a['uid']; }
    public function getReservedServices() { return $this->a['reserved_services']; }
}
class Booking {
    public $id, $rooms, $total, $status;
    public function getReservedRooms() { return $this->rooms; }
    public function setRooms($rooms) { $this->rooms = $rooms; }
    public function updateTotal() {
        $n = \DCC_Checkout\Fee_Sync::nights($this->id);
        $t = 0;
        foreach ($this->rooms as $r) {
            $t += 100 * $n;
            foreach ($r->getReservedServices() as $s) {
                $t += $s->id === 999 ? 20 : $GLOBALS['price'][$s->id] * $n * max(1, $s->adults);
            }
        }
        $this->total = $t;
    }
    public function setStatus($s) { $this->status = $s; }
    public function addLog($msg, $author = null) { $GLOBALS['logs'][] = [$this->id, $msg, $author]; }
}
}

namespace MPHB\Repositories {
use MPHB\Entities\{Booking, ReservedRoom, ReservedService};
class BookingRepository {
    public static $last = null;
    public function findById($id, $force = false) {
        $b = new Booking(); $b->id = (int) $id; $b->rooms = [];
        $b->total = (float) get_post_meta($id, 'mphb_total_price', true);
        $b->status = get_post_status($id);
        foreach (get_posts(['post_type' => 'mphb_reserved_room', 'post_parent' => $id]) as $p) {
            $m = $GLOBALS['meta'][$p->ID];
            $svcs = [];
            foreach ((array) maybe_unserialize($m['_mphb_services'] ?? []) as $row) {
                // As loaded: a service MotoPress no longer knows does not come back.
                if (is_array($row) && ($svc = ReservedService::create($row))) { $svcs[] = $svc; }
            }
            $b->rooms[] = new ReservedRoom(['id' => $p->ID, 'room_id' => $m['_mphb_room_id'], 'booking_id' => $id,
                'rate_id' => $m['_mphb_rate_id'] ?? 0, 'adults' => (int) ($m['_mphb_adults'] ?? 0), 'children' => (int) ($m['_mphb_children'] ?? 0),
                'reserved_services' => $svcs, 'guest_name' => $m['_mphb_guest_name'] ?? '', 'uid' => $m['_mphb_uid'] ?? '']);
        }
        return $b;
    }
    public function save($b) {
        $GLOBALS['saves']++;
        self::$last = $b;
        $GLOBALS['post_status'][$b->id] = $b->status;
        // wp_update_post(): save_post fires, nested, BEFORE the meta below.
        do_action('save_post_mphb_booking', $b->id, new \WP_Post($b->id), true);
        do_action('save_post', $b->id, new \WP_Post($b->id), true);
        update_post_meta($b->id, 'mphb_total_price', $b->total);
    }
    public function updateReservedRooms($id) {
        $keep = [];
        foreach (self::$last->getReservedRooms() as $r) {
            $rid = $r->getId();
            $keep[] = $rid;
            $rows = array_map(function ($s) { return ['id' => $s->id, 'adults' => $s->adults, 'quantity' => $s->quantity]; }, $r->getReservedServices());
            update_post_meta($rid, '_mphb_services', $rows);
            update_post_meta($rid, '_mphb_adults', $r->getAdults());
            update_post_meta($rid, '_mphb_children', $r->getChildren());
            update_post_meta($rid, '_mphb_uid', $r->getUid());
            update_post_meta($rid, '_mphb_rate_id', $r->getRateId());
            update_post_meta($rid, '_mphb_guest_name', $r->getGuestName());
        }
        foreach (get_posts(['post_type' => 'mphb_reserved_room', 'post_parent' => $id]) as $p) {
            if (!in_array($p->ID, $keep, true)) { wp_delete_post($p->ID); }
        }
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
    $stale = $b->total;
    $b->setStatus($_POST['mphb_post_status'] ?? $b->status);
    $repo->save($b);
    update_post_meta($post_id, 'mphb_total_price', $stale);   // the stale total, written LAST
}

/**
 * Booking 19674 with one reserved room 900 (physical room 500) on $type, $nights
 * long, `$adults` stored and confirmed, the given service rows, imported or not.
 */
function seed(int $type, int $nights, int $adults, array $services, array $opts = []) {
    $GLOBALS['posts'] = [19674 => ['type' => 'mphb_booking', 'parent' => 0], 900 => ['type' => 'mphb_reserved_room', 'parent' => 19674]];
    $in = new DateTime('2026-11-02');
    $out = (clone $in)->modify('+' . $nights . ' days');
    $GLOBALS['meta'] = [
        19674 => ['mphb_check_in_date' => $in->format('Y-m-d'), 'mphb_check_out_date' => $out->format('Y-m-d')],
        900   => ['_mphb_room_id' => '500', '_mphb_adults' => (string) $adults, '_mphb_adults_confirmed' => '1', '_mphb_children' => 0,
                  '_mphb_rate_id' => 4321, '_mphb_guest_name' => 'G', '_mphb_uid' => 'UID-900', '_mphb_services' => $services],
        500   => ['mphb_room_type_id' => (string) $type],
    ];
    if (!empty($opts['imported'])) { $GLOBALS['meta'][19674]['mphb_ical_prodid'] = '-//Vrbo//EN'; }
    if (array_key_exists('second_room', $opts)) {
        $GLOBALS['posts'][901] = ['type' => 'mphb_reserved_room', 'parent' => 19674];
        $GLOBALS['meta'][901] = ['_mphb_room_id' => '501', '_mphb_adults' => '2', '_mphb_services' => $opts['second_room'], '_mphb_uid' => 'UID-901', '_mphb_rate_id' => 1];
        $GLOBALS['meta'][501] = ['mphb_room_type_id' => (string) ($opts['second_type'] ?? $type)];
    }
    $GLOBALS['post_status'] = [19674 => $opts['status'] ?? 'confirmed'];
    // The stored total, as MotoPress last priced it.
    $b = MPHB()->getBookingRepository()->findById(19674, true);
    $b->updateTotal();
    $GLOBALS['meta'][19674]['mphb_total_price'] = $b->total;
    $GLOBALS['logs'] = []; $GLOBALS['saves'] = 0; $GLOBALS['trans'] = []; $GLOBALS['caps'] = true; $GLOBALS['mp_order'] = [];
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

/** post.php's Update: the hooks wp_update_post() fires, then redirect_post(). */
function update(array $form) {
    boot();
    $_POST = $form + ['post_ID' => 19674, 'dcc_fee_sync_nonce' => 'fee-ok', 'dcc_admin_guests_nonce' => 'guests-ok', 'mphb_post_status' => get_post_status(19674)];
    do_action('save_post_mphb_booking', 19674, new WP_Post(19674), true);
    do_action('save_post', 19674, new WP_Post(19674), true);
    return apply_filters('redirect_post_location', 'post.php?post=19674&action=edit&message=1', 19674);
}

function services(int $rid = 900) { return Fee_Sync::read_services(get_post_meta($rid, '_mphb_services', true)); }
function total() { return (float) get_post_meta(19674, 'mphb_total_price', true); }
function ids(int $rid = 900) { return array_column(services($rid), 'id'); }
function notice() { ob_start(); Fee_Sync::notice(); return (string) ob_get_clean(); }
/** Fee_Sync's log lines (Admin_Guests writes its own "Guest count …" line too). */
function feelogs() { return array_values(array_filter($GLOBALS['logs'], function ($l) { return strpos($l[1], 'Guest count') !== 0; })); }

$PET1 = [['id' => 17712, 'adults' => 1, 'quantity' => 1]];   // the live row shape
$OTHER = ['id' => 999, 'adults' => 1, 'quantity' => 1];

/* ===================================================================== *
 * Guards first: the stand-in really reprices, and MotoPress's own save
 * really writes a stale total LAST (or the timing test proves nothing).
 * ===================================================================== */
seed(1607, 2, 2, []);
check('guard: a 2-night stay on Cottage 34 is stored at $200', total(), 200.0);
boot();
$_POST = ['post_ID' => 19674];
update_post_meta(19674, 'mphb_total_price', 123);
$GLOBALS['meta'][19674]['mphb_total_price'] = 123;
motopress_save(19674);
check('guard: MotoPress\'s own save, modelled, leaves its reloaded total behind — written after its nested save_post', total(), 123.0);

/* ===================================================================== *
 * The pet fee, at each tier.
 * ===================================================================== */
foreach ([[2, 17712, 25], [6, 17712, 25], [7, 17711, 20], [29, 17711, 20], [30, 14926, 10], [45, 14926, 10]] as [$nights, $tier, $rate]) {
    seed(1607, $nights, 2, [$OTHER]);
    $was = total();
    $loc = update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']]);
    check("pet Yes, $nights nights: the $tier tier is added, the other service kept, and the total repriced",
        [ids(), total()], [[999, $tier], $was + $rate * $nights]);
    check("... the location is returned untouched", $loc, 'post.php?post=19674&action=edit&message=1');
    seed(1607, $nights, 2, [$OTHER, ['id' => $tier, 'adults' => 1, 'quantity' => 1]]);
    $was = total();
    update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => '2']]);
    check("pet No, $nights nights: the pet service is removed, the other service kept, total back down",
        [ids(), total()], [[999], $was - $rate * $nights]);
}
seed(1607, 2, 2, $PET1);
update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => '2']]);
check('the log line names what changed, with the totals before and after',
    feelogs(), [[19674, 'Pet fee removed; total $250 → $200', 'Rob']]);
check('... and staff are told the same once (escaped), then it is gone',
    [notice(), notice()], ['<div class="notice notice-info is-dismissible"><p>Pet fee removed; total $250 → $200</p></div>', '']);

/* What must NOT change. */
seed(1607, 2, 1, [$OTHER]);
$GLOBALS['meta'][900]['_mphb_children'] = 0;
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => 'keep']]);
$m = $GLOBALS['meta'][900];
check('the room is rebuilt IN PLACE: same post, same uid, same rate, guest name, adults and children',
    [isset($GLOBALS['posts'][900]), $m['_mphb_uid'], $m['_mphb_rate_id'], $m['_mphb_guest_name'], (string) $m['_mphb_adults'], $m['_mphb_children']],
    [true, 'UID-900', 4321, 'G', '1', 0]);
check('... and the confirmed mark is untouched (the room was never deleted)', $m['_mphb_adults_confirmed'], '1');
check('... and the status is the one MotoPress saved', get_post_status(19674), 'confirmed');

/* No change asked: nothing written by Fee_Sync. */
seed(1607, 2, 2, $PET1);
$GLOBALS['saves'] = 0;
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']]);
check('pet already Yes and count unchanged: only MotoPress\'s own save ran (one), no log line, no notice',
    [$GLOBALS['saves'], feelogs(), notice()], [1, [], '']);
check('guard: and in that request MotoPress\'s stale total is what is left — the same, because nothing changed', total(), 250.0);

/* ===================================================================== *
 * The extra-guest fee: count 2 -> 3 -> 4 -> 2 on a 4-sleeper.
 * ===================================================================== */
$GLOBALS['opt']['dcc_checkout_settings'] = ['guest_service_daily' => 18063, 'guest_service_weekly' => 18063, 'guest_service_monthly' => 18063, 'guest_fee_amount' => 50];
Config::flush_cache();
seed(1065, 3, 2, [$OTHER]);
$steps = [];
foreach (['3', '4', '2'] as $n) {
    update(['dcc_adults' => [900 => $n]]);
    $fee = array_values(array_filter(services(), function ($r) { return $r['id'] === 18063; }));
    $steps[] = [$n, (string) $GLOBALS['meta'][900]['_mphb_adults'], $fee ? $fee[0]['adults'] : 0, total()];
}
check('Cottage 22, 3 nights: 2→3 adds the fee for 1, →4 makes it 2, →2 removes it; totals follow',
    $steps, [['3', '3', 1, 470.0], ['4', '4', 2, 620.0], ['2', '2', 0, 320.0]]);
check('... the other service rides through every step', in_array(999, ids(), true), true);
check('... three fee log lines, one per Update, naming the fee and the totals', array_column(feelogs(), 1), [
    'Extra guest fee set to 1 guest; total $320 → $470',
    'Extra guest fee set to 2 guests; total $470 → $620',
    'Extra guest fee removed; total $620 → $320',
]);
check('... beside Admin_Guests\' own count line, which is unchanged',
    count($GLOBALS['logs']) - count(feelogs()), 3);
check('... and the confirmed mark survives each rebuild', (string) $GLOBALS['meta'][900]['_mphb_adults_confirmed'], '1');

/* Count unchanged, fee mismatched (an old booking, or a waived fee): left alone. */
seed(1065, 3, 3, [$OTHER]);
$was = total();
update(['dcc_adults' => [900 => 'keep']]);
check('a 3-guest booking WITHOUT the fee, saved for another reason: left exactly as it is', [ids(), total(), feelogs()], [[999], $was, []]);
seed(1065, 3, 3, [$OTHER]);
update(['dcc_adults' => [900 => '3']]);
check('... and confirming the same number is not a change either', [ids(), feelogs()], [[999], []]);

/* A 2-sleeper: the count never brings a fee. */
seed(1604, 3, 1, []);
$GLOBALS['saves'] = 0;
update(['dcc_adults' => [900 => '2']]);
check('Cottage 33 (a 2-sleeper): 1→2 adds nothing; only MotoPress\'s save ran, and no notice (nothing was asked of it)',
    [ids(), $GLOBALS['saves'], feelogs(), notice()], [[], 1, [], '']);
seed(1607, 3, 1, []);
update(['dcc_adults' => [900 => '2']]);
check('Cottage 34 (a 2-sleeper): the same', [ids(), feelogs()], [[], []]);

/* A SETTING MUST REACH ITS CONSUMER: a 4-sleeper the owner has taken off the
   extra-guest list (DCC → Custom Checkout) gets no fee from a count change,
   even though MotoPress still offers the service there. */
$GLOBALS['opt']['dcc_checkout_settings']['guest_accommodations'] = [1071, 1069, 1067, 1740, 1742];
Config::flush_cache();
seed(1065, 3, 2, [$OTHER]);
update(['dcc_adults' => [900 => '3']]);
check('Cottage 22 taken off the extra-guest list in settings: 2→3 adds no fee', [ids(), feelogs()], [[999], []]);
$GLOBALS['opt']['dcc_checkout_settings']['guest_accommodations'] = [1071, 1069, 1067, 1065, 1740, 1742];
Config::flush_cache();
seed(1065, 3, 2, [$OTHER]);
update(['dcc_adults' => [900 => '3']]);
check('guard: back on the list, the same Update does add it', ids(), [999, 18063]);

/* The Guest 3 / 4 switch off: the count changes no fee (history kept). */
$GLOBALS['opt']['dcc_guest34_enabled'] = '';
Config::flush_cache();
seed(1065, 3, 2, [$OTHER]);
update(['dcc_adults' => [900 => '3']]);
check('Guests 3 and 4 switched off: 2→3 adds no fee', [ids(), feelogs()], [[999], []]);
unset($GLOBALS['opt']['dcc_guest34_enabled']);
Config::flush_cache();

/* Pet and count in one Update, on two rooms: one log line. */
seed(1607, 2, 2, [], ['second_room' => [$OTHER], 'second_type' => 1065]);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2', 901 => '4']]);
check('two rooms: pet added on 34, the fee for 2 on 22, ONE log line naming both',
    [ids(900), ids(901), count(feelogs()), (feelogs()[0][1] ?? '')],
    [[17712], [999, 18063], 1, 'Pet fee added; Extra guest fee set to 2 guests; total $420 → $670']);

/* ===================================================================== *
 * Never: imports, cancelled, abandoned.
 * ===================================================================== */
seed(1607, 2, 2, [], ['imported' => true]);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']]);
seed(1065, 3, 2, [], ['imported' => true]);
update(['dcc_adults' => [900 => '4']]);
check('an IMPORT: neither the pet choice nor a count change brings a fee', [ids(), feelogs()], [[], []]);
foreach (['cancelled', 'abandoned'] as $st) {
    seed(1607, 2, 2, [], ['status' => $st]);
    update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']]);
    $pet = [ids(), feelogs()];
    seed(1065, 3, 2, [], ['status' => $st]);
    update(['dcc_adults' => [900 => '4']]);
    check("a $st booking: no pet fee and no extra-guest fee", [$pet, ids(), feelogs()], [[[], []], [], []]);
}
seed(1607, 2, 2, [], ['status' => 'confirmed']);
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
    seed(1607, 2, 2, []);
    update(array_merge(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']], $over));
    check("$label: nothing", [ids(), feelogs()], [[], []]);
}
seed(1607, 2, 2, []);
$GLOBALS['caps'] = false;
update(['dcc_pet_fee' => 'yes']);
check('no edit_post capability: nothing', [ids(), feelogs()], [[], []]);
seed(1607, 2, 2, []);
boot();
$_POST = ['post_ID' => 19674, 'dcc_fee_sync_nonce' => 'fee-ok', 'dcc_pet_fee' => 'yes'];
do_action('save_post', 19674, new WP_Post(19674), true);
check('no redirect (not the edit form\'s Update): nothing changes', [ids(), feelogs()], [[], []]);

/* ===================================================================== *
 * Timing and re-entry.
 * ===================================================================== */
seed(1607, 2, 2, []);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']]);
check('MotoPress\'s save writes its stale total LAST, yet the new total stands: the rebuild ran after it',
    [$GLOBALS['mp_order'], total()], [['motopress'], 250.0]);
check('re-entry: our own save fires save_post again and nothing runs twice (one rebuild, one log)',
    [$GLOBALS['saves'], count(feelogs())], [2, 1]);

/* What the rebuild would do at save_post 20 — the Director's first proposal —
   against the same MotoPress: constructed to show why it runs on the redirect. */
seed(1607, 2, 2, []);
boot();
$GLOBALS['hooks']['redirect_post_location'] = [];
add_action('save_post', function ($id) {
    if ((int) $id === 19674 && empty($GLOBALS['ran'])) { $GLOBALS['ran'] = 1; Fee_Sync::sync(19674, 'yes', []); }
}, 20, 1);
$_POST = ['post_ID' => 19674, 'dcc_fee_sync_nonce' => 'fee-ok', 'mphb_post_status' => 'confirmed'];
do_action('save_post', 19674, new WP_Post(19674), true);
check('guard: run at save_post 20 instead, MotoPress\'s stale total overwrites it — services say Yes, total says No',
    [ids(), total()], [[17712], 200.0]);
unset($GLOBALS['ran']);

/* ===================================================================== *
 * Fail closed: anything unreadable writes nothing, and staff are told.
 * ===================================================================== */
seed(1607, 2, 2, [17712]);   // a list of bare ids: not MotoPress's row shape
$GLOBALS['saves'] = 0;
update(['dcc_pet_fee' => 'no', 'dcc_adults' => [900 => '2']]);
check('services in a shape this cannot rebuild: nothing written, staff told to use Edit Accommodations — escaped',
    [get_post_meta(900, '_mphb_services'), $GLOBALS['saves'], notice()],
    [[17712], 1, '<div class="notice notice-info is-dismissible"><p>Fees were not changed: this booking&#039;s services could not be read. Use Edit Accommodations.</p></div>']);
seed(1607, 2, 2, []);
$GLOBALS['room_types'][1607]['services'] = [17711, 14926];   // the 2-night tier not on the cottage
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']]);
check('the tier for this stay is not on the cottage: nothing added, staff told', [ids(), strpos(notice(), 'was not added') !== false], [[], true]);
$GLOBALS['room_types'][1607]['services'] = [17712, 17711, 14926, 999];
seed(1607, 2, 2, [['id' => 4444, 'adults' => 1, 'quantity' => 1]]);   // an id MotoPress no longer knows
$GLOBALS['saves'] = 0;
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2']]);
check('MotoPress cannot rebuild one of the room\'s services: NOTHING written (checked before the first write), staff told',
    [ids(), $GLOBALS['saves'], total(), strpos(notice(), 'could not reprice') !== false], [[4444], 1, 200.0, true]);
seed(1607, 2, 2, [], ['second_room' => [], 'second_type' => 1607]);
update(['dcc_pet_fee' => 'yes', 'dcc_adults' => [900 => '2', 901 => '2']]);
check('two rooms on a pet-fee cottage: the pet choice is not applied (whose dog?)', [ids(900), ids(901), feelogs()], [[], [], []]);

/* ===================================================================== *
 * What the booking screen offers.
 * ===================================================================== */
seed(1607, 2, 2, $PET1);
check('screen: a direct, active Cottage 34 booking gets the control', Fee_Sync::pet_control(19674), 'select');
seed(1607, 2, 2, [17712]);
check('... services it cannot rebuild: read-only', Fee_Sync::pet_control(19674), 'readonly');
seed(1607, 2, 2, $PET1, ['status' => 'cancelled']);
check('... cancelled: read-only', Fee_Sync::pet_control(19674), 'readonly');
seed(1607, 2, 2, [], ['imported' => true]);
check('... an import: no pet part from here ("Bringing a dog?" instead)', Fee_Sync::pet_control(19674), '');
seed(1065, 2, 2, []);
check('... not a pet-fee cottage: none', Fee_Sync::pet_control(19674), '');
seed(1607, 2, 2, [], ['second_room' => [], 'second_type' => 1607]);
check('... two rooms on a pet-fee cottage: read-only (the save would not apply it either)', Fee_Sync::pet_control(19674), 'readonly');
seed(1065, 3, 4, [['id' => 18063, 'adults' => 2, 'quantity' => 1]]);
check('the stored extra-guest multiplier is read from the room', [Fee_Sync::room_fee_multiplier(900), Fee_Sync::fee_cottage(900)], [2, true]);

/* The Guest count box (Admin_Guests::render), as the screen shows it. */
function guests_box() { ob_start(); (new Admin_Guests())->render(new WP_Post(19674)); return (string) ob_get_clean(); }
seed(1065, 3, 4, [['id' => 18063, 'adults' => 2, 'quantity' => 1]]);
$h = guests_box();
check('Guest count box, active 4-sleeper: the stored fee, the Update hint, and the fee nonce',
    [strpos($h, 'Extra guest fee: 2 guests × $50/night') !== false, strpos($h, 'press Update: the extra guest fee is added') !== false,
     strpos($h, 'name="dcc_fee_sync_nonce"') !== false], [true, true, true]);
seed(1065, 3, 3, [['id' => 18063, 'adults' => 1, 'quantity' => 1]], ['status' => 'cancelled']);
$h = guests_box();
check('... cancelled: the fee still shown as charged, and the hint says it is not changed',
    [strpos($h, 'Extra guest fee: 1 guest × $50/night') !== false, strpos($h, "Fees aren&#039;t changed on a cancelled or abandoned booking.") !== false,
     strpos($h, 'press Update') === false], [true, true, true]);
seed(1065, 3, 4, [], ['imported' => true]);
$h = guests_box();
check('... an import: no fee line and no hint (imports never carry the fee)',
    [strpos($h, 'dcc_admin-feeline'), strpos($h, 'dcc_admin-feehint')], [false, false]);
seed(1607, 3, 2, []);
check('... Cottage 34: no fee line or hint (not a cottage with the fee)', strpos(guests_box(), 'dcc_admin-fee'), false);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
}
