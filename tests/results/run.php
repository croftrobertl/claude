<?php
/**
 * v0.30.1 — Add New Booking, step 2: the search-results table's labels.
 * v0.30.2 — headings per Rob: "Capacity" (MotoPress's own, left as printed)
 * and "Total (minus taxes/fees)". With the Capacity heading identical either
 * way, "relabelled" and "left as drawn" are told apart by the CELLS.
 *
 *     php tests/results/run.php            assertions
 *     php tests/results/run.php fixture X  print the rendered form for the
 *                                          browser suite (X = live|children)
 *
 * The table is rendered from reserve-rooms.php (the Director's verbatim read of
 * live MotoPress 6.3.0) THROUGH MotoPress's own hooks, with the shipped
 * Results_Labels registered on them — so what is asserted is what the page
 * would print. Capacities are the live ones (Director, J): six cottages
 * 4 / 0 / 4, Cottages 33 and 34 2 / 0 / 2.
 */
define('ABSPATH', __DIR__);

$GLOBALS['hooks'] = [];
$GLOBALS['translate'] = [];   // msgid => translation, to test a translated site
$GLOBALS['is_admin'] = true;

function add_action($h, $cb, $p = 10, $a = 1) { $GLOBALS['hooks'][$h][$p][] = [$cb, $a]; ksort($GLOBALS['hooks'][$h]); return true; }
function add_filter($h, $cb, $p = 10, $a = 1) { return add_action($h, $cb, $p, $a); }
function do_action($h, ...$args) { foreach ($GLOBALS['hooks'][$h] ?? [] as $l) { foreach ($l as [$cb, $n]) { $cb(...array_slice($args, 0, $n)); } } }
function has_filter($h) { return !empty($GLOBALS['hooks'][$h]); }
function __($t, $d = null) { return $GLOBALS['translate'][$t] ?? $t; }
function _n($s, $p, $n, $d = null) { return $n == 1 ? $s : $p; }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); }
function esc_html__($t, $d = null) { return esc_html(__($t, $d)); }
function esc_html_e($t, $d = null) { echo esc_html__($t, $d); }
function esc_attr($t) { return esc_html($t); }
function esc_attr_e($t, $d = null) { echo esc_attr(__($t, $d)); }
function esc_url($u) { return (string) $u; }
function is_admin() { return $GLOBALS['is_admin']; }
function sanitize_key($k) { return strtolower(preg_replace('/[^a-z0-9_\-]/i', '', (string) $k)); }
function wp_unslash($v) { return $v; }
function mphb_format_price($p) { return '<span class="mphb-price"><span class="mphb-currency">$</span>' . (int) $p . '</span>'; }

/* Room types, live capacities (Director, J). Repository read by Results_Labels. */
$GLOBALS['types'] = [
    1065 => [4, 0, 4], 1067 => [4, 0, 4], 1069 => [4, 0, 4], 1071 => [4, 0, 4], 1740 => [4, 0, 4], 1742 => [4, 0, 4],
    1604 => [2, 0, 2], 1607 => [2, 0, 2],
];
function MPHB() {
    return new class {
        public function getRoomTypeRepository() {
            return new class {
                public function findById($id) {
                    $t = $GLOBALS['types'][(int) $id] ?? null;
                    return $t === null ? null : new class($t) {
                        private $t; public function __construct($t) { $this->t = $t; }
                        public function getAdultsCapacity() { return $this->t[0]; }
                        public function getChildrenCapacity() { return $this->t[1]; }
                        public function calcTotalCapacity() { return $this->t[2]; }
                    };
                }
            };
        }
    };
}

require __DIR__ . '/../../dcc-custom-checkout/includes/class-results-labels.php';
use DCC_Checkout\Results_Labels;

(new Results_Labels())->register();

/** Two cottages of the live run: Cottage 32 (1065, $700) and Cottage 33 (1604, $600). */
function rooms_list(array $types = [1065 => ['Cottage 32: Flamingo Bungalow', 700], 1604 => ['Cottage 33', 600]]) {
    $list = [];
    $i = 500;
    foreach ($types as $tid => [$title, $price]) {
        $cap = $GLOBALS['types'][$tid] ?? [4, 0, 4];
        $list[$tid] = ['title' => $title, 'url' => "https://doracanalcourt.com/accommodation/$tid/", 'rooms' => [
            ['id' => $i++, 'type_id' => $tid, 'title' => $title, 'adults' => $cap[0], 'children' => $cap[1], 'price' => $price],
        ]];
    }
    return $list;
}
/** Render the template exactly as MotoPress's results step would. */
function render(array $roomsList, bool $condensed = false, string $tpl = '') {
    $actionUrl = 'https://doracanalcourt.com/wp-admin/admin.php?page=mphb_add_new_booking&step=3';
    $checkInDate = '2027-05-10'; $checkOutDate = '2027-05-14';
    $file = $tpl !== '' ? $tpl : __DIR__ . '/reserve-rooms.php';
    if ($condensed) {
        $src = preg_replace('#>\s+<#', '><', file_get_contents($file));
        $file = sys_get_temp_dir() . '/dcc-reserve-rooms-condensed.php';
        file_put_contents($file, $src);
    }
    ob_start();
    include $file;
    return (string) ob_get_clean();
}
/** What MotoPress alone prints: the hooks bypassed. */
function render_plain(array $roomsList, bool $condensed = false) {
    $saved = $GLOBALS['hooks'];
    $GLOBALS['hooks'] = [];
    $h = render($roomsList, $condensed);
    $GLOBALS['hooks'] = $saved;
    return $h;
}

$_GET = ['page' => 'mphb_add_new_booking', 'step' => '2'];

if (($argv[1] ?? '') === 'fixture') {
    if (($argv[2] ?? '') === 'children') { $GLOBALS['types'][1065] = [4, 2, 6]; }
    echo render(rooms_list(['1065' => ['Cottage 32: Flamingo Bungalow', 700], 1071 => ['Cottage 22: The Boathouse', 800], 1604 => ['Cottage 33', 600]]));
    exit(0);
}

$failures = 0;
function check($name, $actual, $expected) {
    global $failures;
    $ok = $actual === $expected;
    if (!$ok) { $failures++; }
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . "\n";
    if (!$ok) { echo '      expected: ' . var_export($expected, true) . "\n      actual:   " . var_export($actual, true) . "\n"; }
}
function heads($h) { preg_match_all('#<th class="row-title">([^<]*)</th>#', $h, $m); return $m[1]; }
function cap_cells($h) { preg_match_all('#</label></td>\s*<td>([^<]*)</td>#', $h, $m); return $m[1]; }

foreach ([false => 'as a WP template prints it', true => 'with the whitespace condensed'] as $condensed => $how) {
    $out = render(rooms_list(), (bool) $condensed);
    check("step 2 ($how): headings read Title / Capacity / Total (minus taxes/fees)",
        array_values(array_unique(heads($out))), ['Title', 'Capacity', 'Total (minus taxes/fees)']);
    check("... the Capacity heading is byte-for-byte MotoPress's own (not re-printed by this plugin)",
        substr_count($out, '<th class="row-title">Capacity</th>'), substr_count(render_plain(rooms_list(), (bool) $condensed), '<th class="row-title">Capacity</th>'));
    check("... recognised, told apart from 'as drawn' by the CELLS: no \"Adults:\" left (MotoPress's own has 2)",
        [substr_count($out, 'Adults:'), substr_count(render_plain(rooms_list(), (bool) $condensed), 'Adults:')], [0, 2]);
    check("... each cottage's cell is its calcTotalCapacity(): 4 for Cottage 32, 2 for Cottage 33", cap_cells($out), ['4', '2']);
    check('... amounts unchanged ($700, $600)', substr_count($out, '<span class="mphb-currency">$</span>700</span>') + substr_count($out, '<span class="mphb-currency">$</span>600</span>'), 2);
    check('... nothing else changed: the output equals MotoPress\'s with only those strings swapped',
        $out, str_replace(
            ['<th class="row-title">Base price</th>', 'Adults:&nbsp;4 Children:&nbsp;0', 'Adults:&nbsp;2 Children:&nbsp;0'],
            ['<th class="row-title">Total (minus taxes/fees)</th>', '4', '2'],
            render_plain(rooms_list(), (bool) $condensed)));
}

// Children capacity > 0: the suffix (none live today).
$GLOBALS['types'][1065] = [4, 2, 6];
check('a cottage taking children: "6 · up to 2 children" (total from calcTotalCapacity)', cap_cells(render(rooms_list()))[0], '6 · up to 2 children');
$GLOBALS['types'][1065] = [4, 1, 5];
check('... one child: "5 · up to 1 child"', cap_cells(render(rooms_list()))[0], '5 · up to 1 child');
$GLOBALS['types'][1065] = [4, 0, 4];
check('... and with none, no suffix at all', strpos(render(rooms_list()), ' · up to'), false);
// A total capacity set below adults + children: calcTotalCapacity() wins, not a sum.
$GLOBALS['types'][1065] = [4, 2, 4];
check('total capacity set (4) below adults + children (6): "4 · up to 2 children", never a sum', cap_cells(render(rooms_list()))[0], '4 · up to 2 children');
$GLOBALS['types'][1065] = [4, 0, 4];

// A translated site: MotoPress's words as translated are what is matched.
$GLOBALS['translate'] = ['Capacity' => 'Capacité', 'Adults:' => 'Adultes :'];
$out = render(rooms_list());
check('a translated MotoPress table is still recognised (its translated words are matched)', cap_cells($out), ['4', '2']);
$GLOBALS['translate'] = [];

/* ---- Left EXACTLY as drawn when not recognised ------------------------- */
$cases = [
    'a room type the repository cannot read' => function () { unset($GLOBALS['types'][1604]); },
    'a cell that disagrees with the room type (adults 3 printed, 4 stored)' => function () { $GLOBALS['types'][1065] = [3, 0, 3]; },
    'a calcTotalCapacity() of 0' => function () { $GLOBALS['types'][1065] = [4, 0, 0]; },
];
foreach ($cases as $label => $break) {
    $keep = $GLOBALS['types'];
    $list = rooms_list();
    $break();
    check("unrecognised — $label: the form is printed exactly as MotoPress drew it", render($list), render_plain($list));
    $GLOBALS['types'] = $keep;
}
$extra = str_replace('<th class="row-title"><?php esc_html_e( \'Base price\', \'motopress-hotel-booking\' ); ?></th>',
    '<th class="row-title"><?php esc_html_e( \'Base price\', \'motopress-hotel-booking\' ); ?></th><th>Extra</th>', file_get_contents(__DIR__ . '/reserve-rooms.php'));
$tpl = sys_get_temp_dir() . '/dcc-reserve-rooms-extra.php';
file_put_contents($tpl, $extra);
$fifth = render(rooms_list(), false, $tpl);
check('unrecognised — a fifth column (MotoPress changed the template): left exactly as drawn (cells keep "Adults:", price heading kept)',
    [substr_count($fifth, 'Adults:&nbsp;'), strpos($fifth, 'Base price</th>') !== false, strpos($fifth, 'Total (minus')], [2, true, false]);
$good = render_plain(rooms_list(['1065' => ['Cottage 32', 700], 1067 => ['Cottage 31', 700]]));
// Two rows in ONE table: make the second row's checkbox carry an extra attribute.
$one = preg_replace('#<table class="widefat striped fixed">#', '<table class="widefat striped fixed">', $good, 1);
$merged = preg_replace('#</tbody>\s*</table>\s*<h4>.*?<tbody>#s', '', $one, 1);
$partial = preg_replace('#(<input type="checkbox" name="mphb_rooms\[1067\]\[\]")#', '$1 data-x="1"', $merged, 1);
check('guard-on-the-guard: the fixture really is ONE table holding TWO rows, one of them altered',
    [substr_count($merged, '<table'), substr_count($merged, 'type="checkbox"'), substr_count($partial, 'data-x="1"')], [1, 2, 1]);
check('guard: the two-row table is recognised as a whole', is_string(Results_Labels::transform($merged, [Results_Labels::class, 'capacity_of'])), true);
check('... but if ONE of its rows does not match, the whole form is left as drawn (never half-relabelled)',
    Results_Labels::transform($partial, [Results_Labels::class, 'capacity_of']), null);
// v0.30.3 — a row whose <tr> carries an attribute is not matched by the row
// pattern; it used to go uncounted too, so the table was half-relabelled.
$pos = strpos($merged, 'mphb_rooms[1067]');
$trpos = strrpos(substr($merged, 0, $pos), '<tr>');
$alt = substr_replace($merged, '<tr class="alt">', $trpos, 4);
check('guard-on-the-guard: the second row\'s <tr> carries a class, the first\'s does not',
    [substr_count($alt, '<tr class="alt">'), substr_count($alt, 'type="checkbox"')], [1, 2]);
check('a row whose <tr> carries an attribute: the whole form is left as drawn (not one row skipped)',
    Results_Labels::transform($alt, [Results_Labels::class, 'capacity_of']), null);
$mixed = preg_replace('#<th class="row-title">Capacity</th>#', '<th class="row-title">Capacity (new)</th>', $good, 1);
check('guard-on-the-guard: one table\'s heading changed, the other\'s not', [substr_count($mixed, 'Capacity (new)'), substr_count($mixed, '>Capacity</th>')], [1, 1]);
check('ONE table with changed headings beside a normal one: the WHOLE form is left as drawn (the normal one is not relabelled alone)',
    Results_Labels::transform($mixed, [Results_Labels::class, 'capacity_of']), null);
check('a second, foreign <table> inside the form: left as drawn',
    Results_Labels::transform($good . '<table class="other"><tr><td>x</td></tr></table>', [Results_Labels::class, 'capacity_of']), null);
check('Results_Labels::transform() on a page with no results table: null (nothing to change)',
    Results_Labels::transform('<p class="mphb-search-results-summary">No cottages</p>', [Results_Labels::class, 'capacity_of']), null);

/* ---- Scope: this step only; never a global string filter --------------- */
$plain = render_plain(rooms_list());
foreach ([
    'step 1 (search form)'   => ['page' => 'mphb_add_new_booking', 'step' => '1'],
    'step 3 (checkout)'      => ['page' => 'mphb_add_new_booking', 'step' => '3'],
    'another admin page'     => ['page' => 'mphb_booking_calendar', 'step' => '2'],
    'no step parameter'      => ['page' => 'mphb_add_new_booking'],
] as $label => $get) {
    $_GET = $get;
    check("not the results step — $label: untouched", render(rooms_list()), $plain);
}
$_GET = ['page' => 'mphb_add_new_booking', 'step' => '2'];
$GLOBALS['is_admin'] = false;
check('not wp-admin (front end): untouched', render(rooms_list()), $plain);
$GLOBALS['is_admin'] = true;
check("'Capacity' elsewhere is MotoPress's word: no gettext filter of any kind is registered",
    [has_filter('gettext'), has_filter('gettext_with_context'), __('Capacity', 'motopress-hotel-booking')], [false, false, 'Capacity']);
render(rooms_list());
check('... and after the table has rendered, still none', [has_filter('gettext'), __('Capacity', 'motopress-hotel-booking')], [false, 'Capacity']);
check('the output buffer is closed after the table (no level left open)', ob_get_level(), 0);

echo $failures ? "\n$failures failing\n" : "\nall passing\n";
exit($failures ? 1 : 0);
