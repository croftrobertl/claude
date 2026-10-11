<?php
/**
 * v0.32.0 — "Extra Details/Options", the import default, and the confirmed
 * marker through MotoPress's Edit Accommodations.
 *
 *     php tests/extras/run.php
 *
 * WordPress is shimmed with a post + meta store. The MotoPress facts used are
 * the Director's reads of live 6.3.0: imports carry mphb_ical_prodid on the
 * booking; the importer writes the room type's adults capacity and fires
 * mphb_create_booking_via_ical($booking) AFTER the reserved rooms are saved;
 * the Edit Accommodations save deletes every reserved-room post and saves new
 * ones, then fires mphb_booking_edited($new, $old).
 */
define('ABSPATH', __DIR__);
define('DOING_AUTOSAVE', false);

$GLOBALS['posts'] = []; $GLOBALS['meta'] = []; $GLOBALS['opt'] = []; $GLOBALS['caps'] = true; $GLOBALS['hooks'] = [];
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
function apply_filters($h, $v) { return $v; }
function add_action($h, $cb, $p = 10, $a = 1) { $GLOBALS['hooks'][$h][] = $cb; }
function do_action($h, ...$args) { foreach ($GLOBALS['hooks'][$h] ?? [] as $cb) { $cb(...$args); } }
function add_meta_box() {}
function get_post_meta($id, $k, $s = false) { return $GLOBALS['meta'][(int) $id][$k] ?? ''; }
function update_post_meta($id, $k, $v) { $GLOBALS['meta'][(int) $id][$k] = $v; return true; }
function delete_post_meta($id, $k) { unset($GLOBALS['meta'][(int) $id][$k]); return true; }
function get_post($id = null) { $p = $GLOBALS['posts'][(int) $id] ?? null; return $p ? (object) (['ID' => (int) $id] + $p) : null; }
function get_posts($a) {
    $out = [];
    foreach ($GLOBALS['posts'] as $id => $p) {
        if ($p['post_type'] !== ($a['post_type'] ?? '')) { continue; }
        if (isset($a['post_parent']) && (int) $p['post_parent'] !== (int) $a['post_parent']) { continue; }
        $out[] = ($a['fields'] ?? '') === 'ids' ? $id : (object) (['ID' => $id] + $p);
    }
    return $out;
}
/* MotoPress's delete: fires before_delete_post, as wp_delete_post() does. */
function wp_delete_post($id) { do_action('before_delete_post', $id, get_post($id)); unset($GLOBALS['posts'][$id], $GLOBALS['meta'][$id]); }
function current_user_can($c, $id = 0) { return $GLOBALS['caps']; }
function wp_verify_nonce($n, $a) { return $n === 'good' ? 1 : false; }
function wp_nonce_field($a, $n, $r = true, $e = true) { return '<input type="hidden" name="' . $n . '" value="good">'; }
function wp_unslash($v) { return $v; }
function sanitize_text_field($v) { return is_string($v) ? trim($v) : ''; }
function sanitize_key($v) { return strtolower(preg_replace('/[^a-z0-9_\-]/i', '', (string) $v)); }
function __($t, $d = null) { return $t; }
function esc_html__($t, $d = null) { return htmlspecialchars($t, ENT_QUOTES); }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function maybe_unserialize($v) { if (is_string($v)) { $u = @unserialize($v); return ($u === false && $v !== 'b:0;') ? $v : $u; } return $v; }
class WP_Post { public $ID = 0; public $post_type = ''; }

/* Room types and their services, as live: 1607 (Cottage 34) the pet services; 1065 the extra-guest fee. */
$GLOBALS['room_types'] = [1065 => [18063], 1607 => [17712, 17711, 14926]];
function MPHB() {
    return new class {
        public function getRoomTypeRepository() {
            return new class {
                public function findById($id) {
                    $svc = $GLOBALS['room_types'][(int) $id] ?? null;
                    return $svc === null ? null : new class($svc) {
                        private $s; public function __construct($s) { $this->s = $s; }
                        public function getServices() { return $this->s; }
                    };
                }
            };
        }
    };
}

foreach (['config', 'policies', 'id-files', 'boat-field', 'admin-fields', 'admin-guests', 'extra-details', 'ical-defaults', 'edit-flow-markers'] as $c) {
    require __DIR__ . '/../../dcc-custom-checkout/includes/class-' . $c . '.php';
}
use DCC_Checkout\{Extra_Details, Ical_Defaults, Edit_Flow_Markers, Admin_Fields, Admin_Guests};

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) { echo '      expected: ' . var_export($expected, true) . "\n      actual:   " . var_export($actual, true) . "\n"; }
}
/** Booking 19674 with one reserved room 900 (physical room 500) on cottage $type. */
function booking(int $type, bool $imported = false, array $roomMeta = []) {
    $GLOBALS['posts'] = [19674 => ['post_type' => 'mphb_booking', 'post_parent' => 0],
        900 => ['post_type' => 'mphb_reserved_room', 'post_parent' => 19674]];
    $GLOBALS['meta'] = [900 => ['_mphb_room_id' => '500'] + $roomMeta, 500 => ['mphb_room_type_id' => (string) $type]];
    if ($imported) { $GLOBALS['meta'][19674]['mphb_ical_prodid'] = '-//Airbnb Inc//Hosting Calendar//EN'; }
    $GLOBALS['caps'] = true; $_POST = [];
}
$book = new class { public $id = 19674; public function getId() { return $this->id; } };

/* ===================================================================== *
 * A / C — the box.
 * ===================================================================== */
booking(1607, true);
$h = Extra_Details::box_html(19674);
check('import on Cottage 34: "Bringing a dog?" (— Select — / No / Yes), opening unanswered, with a nonce',
    [(bool) preg_match('#<label for="dcc_dog"><strong>Bringing a dog\?</strong>#', $h), (bool) preg_match('#<option value="" selected>#', $h),
     substr_count($h, '<option'), strpos($h, 'name="dcc_extra_details_nonce"') !== false], [true, true, 3, true]);
check('... and NO pet fee line, no Edit Accommodations prompt: an import never gets a fee from here',
    [strpos($h, 'dcc_admin-petfee-line'), strpos($h, 'data-dcc-edit-accommodations')], [false, false]);
booking(1607, false, ['_mphb_services' => [17712]]);
$h = Extra_Details::box_html(19674);
check('direct booking on Cottage 34: "Pet fee: Yes" read-only, plus the Edit Accommodations prompt, no dog select',
    [(bool) preg_match('#<strong>Pet fee:</strong> Yes</p>#', $h), strpos($h, 'data-dcc-edit-accommodations="1"') !== false, strpos($h, 'dcc_dog')],
    [true, true, false]);
booking(1065);
$h = Extra_Details::box_html(19674);
check('Cottage 22 (not a pet-fee cottage): no pet part at all, just the table the rows move into',
    [strpos($h, 'dcc_dog'), strpos($h, 'Pet fee'), strpos($h, 'id="dcc_extras_rows"') !== false], [false, false, true]);
booking(1607, true);
check('every cottage gets the table for the moved rows (Dog, then boat)', strpos(Extra_Details::box_html(19674), 'id="dcc_extras_rows"') !== false, true);
check('the moved fields, in order: Dog type, size, hair, then the boat question',
    Admin_Fields::extras_fields(), ['mphb_dog_type', 'mphb_dog_size', 'mphb_dog_hair', 'mphb_boat']);
check('Customer Information no longer has Dog or Boat / trailer groups (Note stays)',
    array_column(Admin_Fields::customer_layout(), 'key'), ['guest1', 'address', 'guest2', 'guest3', 'guest4', 'note']);

/* --- saving _dcc_dog ----------------------------------------------------- */
$x = new Extra_Details();
booking(1607, true);
$_POST = ['dcc_extra_details_nonce' => 'good', 'dcc_dog' => 'yes'];
$x->save(19674);
check('import, Cottage 34: "Yes" is stored as _dcc_dog = yes', get_post_meta(19674, '_dcc_dog'), 'yes');
check('... and NOTHING about money is written: no services, no fee', [get_post_meta(900, '_mphb_services'), array_keys($GLOBALS['meta'][19674])], ['', ['mphb_ical_prodid', '_dcc_dog']]);
check('... the Dog fields then follow it (statedPetFee for the import reads _dcc_dog)', Admin_Fields::booking_pet_state(19674), 'yes');
$_POST = ['dcc_extra_details_nonce' => 'good', 'dcc_dog' => 'no'];
$x->save(19674);
check('"No" is stored as no', [get_post_meta(19674, '_dcc_dog'), Admin_Fields::booking_pet_state(19674)], ['no', 'no']);
$_POST = ['dcc_extra_details_nonce' => 'good', 'dcc_dog' => ''];
$x->save(19674);
check('"— Select —" removes it (absent = not asked)', array_key_exists('_dcc_dog', $GLOBALS['meta'][19674]), false);
foreach ([
    'no nonce'          => function () { $_POST = ['dcc_dog' => 'yes']; },
    'a bad nonce'       => function () { $_POST = ['dcc_extra_details_nonce' => 'bad', 'dcc_dog' => 'yes']; },
    'no edit capability' => function () { $GLOBALS['caps'] = false; $_POST = ['dcc_extra_details_nonce' => 'good', 'dcc_dog' => 'yes']; },
    'a value not offered' => function () { $_POST = ['dcc_extra_details_nonce' => 'good', 'dcc_dog' => 'maybe']; },
] as $label => $set) {
    booking(1607, true); $set(); $x->save(19674);
    check("import save with $label: nothing stored", array_key_exists('_dcc_dog', $GLOBALS['meta'][19674] ?? []), false);
}
booking(1607, false);
$_POST = ['dcc_extra_details_nonce' => 'good', 'dcc_dog' => 'yes'];
$x->save(19674);
check('a DIRECT booking never gets _dcc_dog (its record is the pet fee)', array_key_exists('_dcc_dog', $GLOBALS['meta'][19674] ?? []), false);
booking(1065, true);
$_POST = ['dcc_extra_details_nonce' => 'good', 'dcc_dog' => 'yes'];
$x->save(19674);
check('an import on a cottage with no pet fee never gets it either (the control is not drawn there)', array_key_exists('_dcc_dog', $GLOBALS['meta'][19674] ?? []), false);

/* ===================================================================== *
 * D — new imports start at 2, unconfirmed.
 * ===================================================================== */
(new Ical_Defaults())->register();
booking(1065, true, ['_mphb_adults' => '4']);
do_action('mphb_create_booking_via_ical', $book);
check('a new import the importer set to 4 (capacity) starts at 2', get_post_meta(900, '_mphb_adults'), 2);
check('... and is NOT confirmed', array_key_exists('_mphb_adults_confirmed', $GLOBALS['meta'][900]), false);
booking(1065, true, ['_mphb_adults' => '4', '_mphb_adults_confirmed' => '1']);
do_action('mphb_create_booking_via_ical', $book);
check('a room already staff-confirmed is never touched', [get_post_meta(900, '_mphb_adults'), get_post_meta(900, '_mphb_adults_confirmed')], ['4', '1']);
booking(1065, true, ['_mphb_adults' => '1']);
do_action('mphb_create_booking_via_ical', $book);
check('a count at or below 2 is never RAISED', get_post_meta(900, '_mphb_adults'), '1');
booking(1065, true);
do_action('mphb_create_booking_via_ical', $book);
check('no count stored: nothing is invented', array_key_exists('_mphb_adults', $GLOBALS['meta'][900]), false);
booking(1065, true, ['_mphb_adults' => '4']);
$GLOBALS['posts'][901] = ['post_type' => 'mphb_reserved_room', 'post_parent' => 19674];
$GLOBALS['meta'][901] = ['_mphb_adults' => '4'];
$GLOBALS['posts'][950] = ['post_type' => 'mphb_reserved_room', 'post_parent' => 11111];
$GLOBALS['meta'][950] = ['_mphb_adults' => '4'];
do_action('mphb_create_booking_via_ical', $book);
check('two rooms on the import: both at 2; a room of ANOTHER booking untouched',
    [get_post_meta(900, '_mphb_adults'), get_post_meta(901, '_mphb_adults'), get_post_meta(950, '_mphb_adults')], [2, 2, '4']);
check('children are not written (key unread from source; live capacity 0)', array_key_exists('_mphb_children', $GLOBALS['meta'][900]), false);
check('nothing is hooked on mphb_update_booking_via_ical: a sync can never reset the 2',
    isset($GLOBALS['hooks']['mphb_update_booking_via_ical']), false);
booking(1065, false, ['_mphb_adults' => '4']);
do_action('mphb_create_booking_via_book_by_staff', $book);   // any other path
check('only the iCal hook does it: a direct booking keeps its 4', get_post_meta(900, '_mphb_adults'), '4');

/* ===================================================================== *
 * B fallback — the confirmed marker through Edit Accommodations.
 * ===================================================================== */
(new Edit_Flow_Markers())->register();
/** MotoPress's save step: delete every reserved room, save new ones, fire the hook. */
function edit_flow(array $newRooms) {
    foreach (array_keys($GLOBALS['posts']) as $id) {
        if ($GLOBALS['posts'][$id]['post_type'] === 'mphb_reserved_room' && $GLOBALS['posts'][$id]['post_parent'] === 19674) { wp_delete_post($id); }
    }
    foreach ($newRooms as $id => $m) {
        $GLOBALS['posts'][$id] = ['post_type' => 'mphb_reserved_room', 'post_parent' => 19674];
        $GLOBALS['meta'][$id] = $m;
    }
    do_action('mphb_booking_edited', $GLOBALS['book'], $GLOBALS['book']);
}
$GLOBALS['book'] = $book;
booking(1607, false, ['_mphb_adults' => '3', '_mphb_adults_confirmed' => '1', '_mphb_services' => []]);
edit_flow([1200 => ['_mphb_room_id' => '500', '_mphb_adults' => '3', '_mphb_services' => [17712]]]);
check('guard: MotoPress\'s flow really replaced the room (old 900 gone, new 1200)', [isset($GLOBALS['posts'][900]), isset($GLOBALS['posts'][1200])], [false, true]);
check('a confirmed 3 on the same physical room, still 3: the marker is carried to the new room',
    get_post_meta(1200, '_mphb_adults_confirmed'), 1);
booking(1607, false, ['_mphb_adults' => '3', '_mphb_adults_confirmed' => '1']);
edit_flow([1201 => ['_mphb_room_id' => '500', '_mphb_adults' => '2']]);
check('the count changed in the flow (3 → 2): NOT carried — nobody confirmed the new number', get_post_meta(1201, '_mphb_adults_confirmed'), '');
booking(1607, false, ['_mphb_adults' => '3']);
edit_flow([1202 => ['_mphb_room_id' => '500', '_mphb_adults' => '3']]);
check('an unconfirmed room stays unconfirmed', get_post_meta(1202, '_mphb_adults_confirmed'), '');
booking(1607, false, ['_mphb_adults' => '3', '_mphb_adults_confirmed' => '1']);
edit_flow([1203 => ['_mphb_room_id' => '501', '_mphb_adults' => '3']]);
check('a DIFFERENT physical room: not carried', get_post_meta(1203, '_mphb_adults_confirmed'), '');
booking(1607, false, ['_mphb_adults' => '3', '_mphb_adults_confirmed' => '0']);
edit_flow([1204 => ['_mphb_room_id' => '500', '_mphb_adults' => '3']]);
check('a stored "0" marker is not confirmed (the strict test), so nothing is carried', get_post_meta(1204, '_mphb_adults_confirmed'), '');
booking(1607, false, ['_mphb_adults' => '3', '_mphb_adults_confirmed' => '1']);
$GLOBALS['posts'][1300] = ['post_type' => 'mphb_reserved_room', 'post_parent' => 19674];
$GLOBALS['meta'][1300] = ['_mphb_room_id' => '500', '_mphb_adults' => '3'];
do_action('mphb_booking_edited', $book, $book);   // no deletion seen in this request
check('fails safe: with no deletion seen, nothing is written', get_post_meta(1300, '_mphb_adults_confirmed'), '');

/* ---- Box order: "Extra Details/Options" directly under "Guest count". ----
   WordPress draws boxes of one column and priority in registration order, so
   the order is decided in Plugin::boot(): Extra_Details must register NEXT
   after Admin_Guests, both 'side' / 'default'. */
$boot = file_get_contents(__DIR__ . '/../../dcc-custom-checkout/includes/class-plugin.php');
preg_match_all('#new (\w+)\(\)\)->register\(\)#', $boot, $m);
$i = array_search('Admin_Guests', $m[1], true);
check('box order: Extra_Details registers immediately after Admin_Guests', $m[1][$i + 1] ?? null, 'Extra_Details');
$src = static function ($f) { return file_get_contents(__DIR__ . '/../../dcc-custom-checkout/includes/' . $f); };
check('... both in the side column at default priority',
    [(bool) preg_match("#'side',\s*'default'#", $src('class-admin-guests.php')), (bool) preg_match("#'side',\s*'default'#", $src('class-extra-details.php'))], [true, true]);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
