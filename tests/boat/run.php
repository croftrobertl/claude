<?php
/**
 * v0.31.0 — the "Bringing a boat or trailer?" Checkout Field (Boat_Field).
 *
 *     php tests/boat/run.php
 *
 * The site is the LIVE one as the Director read it on 2026-10-10: 22
 * mphb_checkout_field posts at menu_order 1–22 (upload_id 14, dog_type 15,
 * note 18, guest4_last_name 22), all published, and Dog Size's meta and raw
 * serialised options verbatim. Meta is stored the way WordPress stores it —
 * arrays SERIALISED — so the raw form is compared, not just the decoded one.
 */
define('ABSPATH', __DIR__);
define('DCC_CHECKOUT_VERSION', '0.31.0');

/* ---- A WordPress stand-in ------------------------------------------------ */
$GLOBALS['posts'] = []; $GLOBALS['meta'] = []; $GLOBALS['opt'] = []; $GLOBALS['next_id'] = 20000;
$GLOBALS['cap'] = true; $GLOBALS['ajax'] = false; $GLOBALS['type_exists'] = true;
$GLOBALS['on_insert'] = null; $GLOBALS['insert_fails'] = false; $GLOBALS['db_writes'] = 0;
$GLOBALS['hooks'] = [];

class WP_Error {}
function is_wp_error($x) { return $x instanceof WP_Error; }
function wp_json_encode($v) { return json_encode($v); }
$GLOBALS['queries'] = 0; $GLOBALS['race'] = false;
function add_action($h, $cb) { $GLOBALS['hooks'][$h][] = $cb; }
function wp_doing_ajax() { return $GLOBALS['ajax']; }
function current_user_can($c) { return $GLOBALS['cap']; }
function post_type_exists($t) {
    // RACE: another request claims the run between this request's marker check
    // and its own claim — the only window the claim exists to close.
    if ($GLOBALS['race']) { $GLOBALS['opt']['dcc_checkout_boat_field'] = ['state' => 'creating']; }
    return $GLOBALS['type_exists'] && $t === 'mphb_checkout_field';
}
function get_post_stati() { return ['publish' => 1, 'future' => 1, 'draft' => 1, 'pending' => 1, 'private' => 1, 'trash' => 1, 'auto-draft' => 1, 'inherit' => 1]; }
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opt']) ? $GLOBALS['opt'][$k] : $d; }
function add_option($k, $v, $x = '', $a = 'yes') { if (array_key_exists($k, $GLOBALS['opt'])) { return false; } $GLOBALS['opt'][$k] = $v; return true; }
function update_option($k, $v, $a = null) { $GLOBALS['opt'][$k] = $v; return true; }
function delete_option($k) { unset($GLOBALS['opt'][$k]); return true; }
/* Meta as WordPress keeps it: scalars as strings, arrays serialised. */
function update_post_meta($id, $k, $v) { $GLOBALS['meta'][$id][$k] = is_array($v) ? serialize($v) : (string) $v; return true; }
function get_post_meta($id, $k, $single = false) {
    if (!isset($GLOBALS['meta'][$id][$k])) { return ''; }
    $raw = $GLOBALS['meta'][$id][$k];
    $u = @unserialize($raw);
    return ($raw === 'b:0;' || $u !== false) ? $u : $raw;
}
function wp_insert_post($a, $err = false) {
    if ($GLOBALS['insert_fails']) { return new WP_Error(); }
    $id = $GLOBALS['next_id']++;
    $GLOBALS['posts'][$id] = (object) ['ID' => $id, 'post_type' => $a['post_type'], 'post_status' => $a['post_status'],
        'post_title' => $a['post_title'], 'menu_order' => (int) ($a['menu_order'] ?? 0)];
    // A save_post handler that writes meta during the insert (unknown in the
    // add-on, so assumed hostile): the plugin's own values must win.
    if ($GLOBALS['on_insert']) { ($GLOBALS['on_insert'])($id); }
    return $id;
}
function get_posts($q) {
    $GLOBALS['queries']++;
    $st = (array) $q['post_status'];
    $out = [];
    foreach ($GLOBALS['posts'] as $p) {
        if ($p->post_type !== $q['post_type'] || !in_array($p->post_status, $st, true)) { continue; }
        if (isset($q['meta_key']) && get_post_meta($p->ID, $q['meta_key'], true) !== $q['meta_value']) { continue; }
        $out[] = $p;
    }
    usort($out, function ($a, $b) { return $a->ID <=> $b->ID; });
    if (($q['numberposts'] ?? -1) > 0) { $out = array_slice($out, 0, $q['numberposts']); }
    return ($q['fields'] ?? '') === 'ids' ? array_map(function ($p) { return $p->ID; }, $out) : $out;
}
function clean_post_cache($id) {}
class FakeDb {
    public $posts = 'portal_posts';
    public function update($table, $data, $where, $f = null, $wf = null) {
        $GLOBALS['db_writes']++;
        if (!isset($GLOBALS['posts'][$where['ID']])) { return false; }
        $GLOBALS['posts'][$where['ID']]->menu_order = (int) $data['menu_order'];
        return 1;
    }
}
$GLOBALS['wpdb'] = new FakeDb();

require __DIR__ . '/../../dcc-custom-checkout/includes/class-boat-field.php';
use DCC_Checkout\Boat_Field;

/* The 22 live fields (Director, 2026-10-10). */
const LIVE = ['first_name', 'last_name', 'phone', 'email', 'guest2_first_name', 'guest2_last_name', 'guest2_phone',
    'address1', 'apartment-units', 'city', 'state', 'country', 'zip', 'upload_id', 'dog_type', 'dog_size',
    'dog_hair', 'note', 'guest3_first_name', 'guest3_last_name', 'guest4_first_name', 'guest4_last_name'];
/* Dog Size's mphb_cf_options, raw from the live database. */
const DOG_SIZE_RAW = 'a:4:{i:0;a:2:{s:5:"value";s:0:"";s:5:"label";s:14:"— Select —";}i:1;a:2:{s:5:"value";s:9:"10-20 lbs";s:5:"label";s:9:"10-20 lbs";}i:2;a:2:{s:5:"value";s:9:"20-30 lbs";s:5:"label";s:9:"20-30 lbs";}i:3;a:2:{s:5:"value";s:9:"30-40 lbs";s:5:"label";s:9:"30-40 lbs";}}';
/* The contract: blank / No / Yes, in Dog Size's own serialised shape. */
const BOAT_RAW = 'a:3:{i:0;a:2:{s:5:"value";s:0:"";s:5:"label";s:14:"— Select —";}i:1;a:2:{s:5:"value";s:2:"No";s:5:"label";s:2:"No";}i:2;a:2:{s:5:"value";s:3:"Yes";s:5:"label";s:3:"Yes";}}';

function site(array $names = LIVE, array $orders = []) {
    $GLOBALS['posts'] = []; $GLOBALS['meta'] = []; $GLOBALS['opt'] = []; $GLOBALS['next_id'] = 20000;
    $GLOBALS['cap'] = true; $GLOBALS['ajax'] = false; $GLOBALS['type_exists'] = true;
    $GLOBALS['on_insert'] = null; $GLOBALS['insert_fails'] = false; $GLOBALS['db_writes'] = 0;
    foreach ($names as $i => $n) {
        $id = 17700 + $i;
        $GLOBALS['posts'][$id] = (object) ['ID' => $id, 'post_type' => 'mphb_checkout_field', 'post_status' => 'publish',
            'post_title' => ucfirst(str_replace('_', ' ', $n)), 'menu_order' => $orders[$n] ?? ($i + 1)];
        $GLOBALS['meta'][$id] = ['mphb_cf_name' => $n, 'mphb_cf_type' => 'text'];
        if ($n === 'dog_size') { $GLOBALS['meta'][$id]['mphb_cf_options'] = DOG_SIZE_RAW; $GLOBALS['meta'][$id]['mphb_cf_type'] = 'select'; }
        if ($n === 'note') { $GLOBALS['meta'][$id]['mphb_cf_enabled'] = '0'; }
    }
}
function boats() { return array_values(array_filter($GLOBALS['posts'], function ($p) { return get_post_meta($p->ID, 'mphb_cf_name', true) === 'boat'; })); }
function orders() { $o = []; foreach ($GLOBALS['posts'] as $p) { $o[get_post_meta($p->ID, 'mphb_cf_name', true)] = $p->menu_order; } return $o; }
function order_list() { $o = orders(); asort($o); return array_keys($o); }

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) { echo '      expected: ' . var_export($expected, true) . "\n      actual:   " . var_export($actual, true) . "\n"; }
}

/* ---- The contract, against the proven shape ----------------------------- */
check('guard: Dog Size\'s raw live options decode to rows of exactly {value, label}, blank first',
    [array_keys(unserialize(DOG_SIZE_RAW)[0]), unserialize(DOG_SIZE_RAW)[0]['value']], [['value', 'label'], '']);
check('the boat options serialise to EXACTLY the contract, in Dog Size\'s shape (a PHP array, not JSON)',
    serialize(Boat_Field::options()), BOAT_RAW);
check('... and the blank row is the same bytes as Dog Size\'s ("— Select —", 14 bytes)',
    Boat_Field::options()[0], unserialize(DOG_SIZE_RAW)[0]);
check('the meta carries every mphb_cf_* key Dog Size carries (Director\'s raw list), and no other',
    array_values(array_diff(array_keys(Boat_Field::meta()), ['mphb_cf_options'])) == ['mphb_cf_name', 'mphb_cf_type', 'mphb_cf_required', 'mphb_cf_enabled',
        'mphb_cf_checked', 'mphb_cf_css_class', 'mphb_cf_description', 'mphb_cf_file_types', 'mphb_cf_inner_label',
        'mphb_cf_pattern', 'mphb_cf_placeholder', 'mphb_cf_text_content', 'mphb_cf_upload_size'], true);

/* ---- The live site: created once, placed above the dog questions -------- */
site();
$hook = $GLOBALS['hooks']['admin_init'] ?? [];
(new Boat_Field())->register();
check('registered on admin_init', count($GLOBALS['hooks']['admin_init']) - count($hook), 1);
Boat_Field::maybe_create();
$b = boats();
check('one run on the live site: exactly ONE field named "boat"', count($b), 1);
$id = $b[0]->ID;
check('... titled "Bringing a boat or trailer?", published, a select',
    [$b[0]->post_title, $b[0]->post_status, get_post_meta($id, 'mphb_cf_type', true)], ['Bringing a boat or trailer?', 'publish', 'select']);
check('... not required, enabled, nothing pre-checked',
    [get_post_meta($id, 'mphb_cf_required', true), get_post_meta($id, 'mphb_cf_enabled', true), get_post_meta($id, 'mphb_cf_checked', true)], ['0', '1', '0']);
check('... its options are STORED as the exact serialised contract (raw, as the add-on reads them)',
    $GLOBALS['meta'][$id]['mphb_cf_options'], BOAT_RAW);
check('... the blank default is the first option, so the dropdown opens unanswered',
    get_post_meta($id, 'mphb_cf_options', true)[0]['value'], '');
check('position: directly after Photo ID, directly before Dog Type (Rob\'s pick A)',
    array_slice(order_list(), 13, 3), ['upload_id', 'boat', 'dog_type']);
check('... boat at 15; dog_type, dog_size, dog_hair, note, guest3/4 each down one (16–23)',
    array_intersect_key(orders(), array_flip(['upload_id', 'boat', 'dog_type', 'dog_size', 'dog_hair', 'note', 'guest3_first_name', 'guest4_last_name'])),
    ['upload_id' => 14, 'dog_type' => 16, 'dog_size' => 17, 'dog_hair' => 18, 'note' => 19, 'guest3_first_name' => 20, 'guest4_last_name' => 23, 'boat' => 15]);
check('... fields 1–14 did not move', array_slice(array_values(orders()), 0, 14), range(1, 14));
$m = get_option(Boat_Field::MARKER);
check('the marker records the run: created, which post, where, how', [$m['state'], $m['id'], $m['position'], $m['placement'], $m['meta_ok']], ['created', $id, 15, 'shifted', true]);
check('... and every move with its previous position, so it can be reversed (8 fields)',
    array_map(function ($s) { return $s['name'] . ':' . $s['from'] . '>' . $s['to']; }, $m['shifted']),
    ['dog_type:15>16', 'dog_size:16>17', 'dog_hair:17>18', 'note:18>19', 'guest3_first_name:19>20', 'guest3_last_name:20>21', 'guest4_first_name:21>22', 'guest4_last_name:22>23']);
check('... nothing failed, and nothing about any guest is in it', [$m['failed'], strpos(serialize($m), '@')], [[], false]);

/* ---- Twice, and every way it could come back ----------------------------- */
$before = [orders(), count($GLOBALS['posts']), $GLOBALS['db_writes']];
$GLOBALS['queries'] = 0;
Boat_Field::maybe_create();
check('after the run, an admin page load makes NO query at all (the marker ends it: no per-request cost)',
    $GLOBALS['queries'], 0);
Boat_Field::ensure();
check('run again (twice more): still exactly ONE "boat", no position changed, nothing written',
    [count(boats()), orders(), count($GLOBALS['posts']), $GLOBALS['db_writes']], [1, $before[0], $before[1], $before[2]]);

$GLOBALS['posts'][$id]->post_status = 'trash';
Boat_Field::ensure();
check('Rob trashes it: NOT recreated (C)', count(boats()), 1);
unset($GLOBALS['posts'][$id], $GLOBALS['meta'][$id]);
Boat_Field::ensure();
check('Rob deletes it permanently: NOT recreated (C)', count(boats()), 0);

site();
$GLOBALS['posts'][19999] = (object) ['ID' => 19999, 'post_type' => 'mphb_checkout_field', 'post_status' => 'trash', 'post_title' => 'Boat?', 'menu_order' => 3];
$GLOBALS['meta'][19999] = ['mphb_cf_name' => 'boat', 'mphb_cf_options' => serialize([['value' => 'y', 'label' => 'Rob\'s']])];
$o = orders();
$r = Boat_Field::ensure();
check('a "boat" field already exists (in the TRASH, Rob\'s own label and options): adopted, not duplicated',
    [count(boats()), $r['state'], $r['id']], [1, 'adopted', 19999]);
check('... and NOT edited: title, status, options and every position unchanged',
    [$GLOBALS['posts'][19999]->post_title, $GLOBALS['posts'][19999]->post_status, $GLOBALS['meta'][19999]['mphb_cf_options'], orders()],
    ['Boat?', 'trash', serialize([['value' => 'y', 'label' => 'Rob\'s']]), $o]);

/* ---- Rob has reordered: nothing is renumbered ---------------------------- */
site(LIVE, ['dog_type' => 3]);
$o = orders();
Boat_Field::ensure();
$m = get_option(Boat_Field::MARKER);
check('Rob has moved Dog Type away from Photo ID: no field is renumbered',
    array_diff_key(orders(), ['boat' => 1]), $o);
check('... the field goes last instead (23), and the marker says why',
    [orders()['boat'], $m['placement'], $m['shifted']], [23, 'end', []]);
site(LIVE, ['city' => 15, 'dog_type' => 16, 'dog_size' => 17, 'dog_hair' => 18]);
$o = orders();
Boat_Field::ensure();
check('a field placed between Photo ID and Dog Type: nothing renumbered, field last',
    [array_diff_key(orders(), ['boat' => 1]) === $o, get_option(Boat_Field::MARKER)['placement']], [true, 'end']);
site(array_values(array_diff(LIVE, ['upload_id'])));
Boat_Field::ensure();
check('no Photo ID field: nothing renumbered, field last', get_option(Boat_Field::MARKER)['placement'], 'end');
site(LIVE, ['dog_type' => 16, 'dog_size' => 17, 'dog_hair' => 18, 'note' => 19]);
$o = orders();
Boat_Field::ensure();
check('a free number between Photo ID (14) and Dog Type (16): the field takes 15, nothing moves',
    [orders()['boat'], array_diff_key(orders(), ['boat' => 1]) === $o, get_option(Boat_Field::MARKER)['placement']], [15, true, 'gap']);

/* ---- When it must not run ------------------------------------------------ */
site(); $GLOBALS['type_exists'] = false;
Boat_Field::ensure();
check('Checkout Fields add-on not active: nothing created, NO marker (it tries again later)',
    [count(boats()), get_option(Boat_Field::MARKER, null)], [0, null]);
site(); $GLOBALS['cap'] = false;
Boat_Field::maybe_create();
check('a non-administrator\'s admin page load: nothing', [count(boats()), get_option(Boat_Field::MARKER, null)], [0, null]);
site(); $GLOBALS['ajax'] = true;
Boat_Field::maybe_create();
check('an admin-ajax request: nothing', [count(boats()), get_option(Boat_Field::MARKER, null)], [0, null]);
site(); $GLOBALS['insert_fails'] = true;
$o = orders();
Boat_Field::ensure();
check('the insert fails: no field, NO position changed, the claim released so a later load can try again',
    [count(boats()), orders(), get_option(Boat_Field::MARKER, null)], [0, $o, null]);
site(); $GLOBALS['opt'][Boat_Field::MARKER] = ['state' => 'creating'];
Boat_Field::ensure();
check('another request is already creating it (claim held): this one creates nothing', count(boats()), 0);
site(); $GLOBALS['race'] = true;
$o = orders();
Boat_Field::ensure();
$GLOBALS['race'] = false;
check('RACE: another request claims after this one\'s check: this one creates nothing and moves nothing',
    [count(boats()), orders()], [0, $o]);

/* ---- A save_post handler during the insert cannot change the contract ---- */
site();
$GLOBALS['on_insert'] = function ($id) { update_post_meta($id, 'mphb_cf_required', '1'); update_post_meta($id, 'mphb_cf_options', 'junk'); update_post_meta($id, 'mphb_cf_name', ''); };
Boat_Field::ensure();
$b = boats();
check('a handler that writes meta DURING the insert is overwritten: name, options, not-required all per contract',
    [count($b), $GLOBALS['meta'][$b[0]->ID]['mphb_cf_options'] ?? null, get_post_meta($b[0]->ID, 'mphb_cf_required', true)], [1, BOAT_RAW, '0']);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
