<?php
/**
 * Internal notes — entry_rows()/note_entry(), and the TypeError that took the
 * popup down for two thirds of live bookings.
 *
 * MPHB's getInternalNotes() returns an ARRAY of {note, date, user}. A
 * `?object` parameter hint on the helper that unpacked it threw BEFORE its own
 * is_object() guard could run, so every booking WITH notes fataled. The hints
 * are gone; this keeps them gone and feeds the shapes that broke it.
 */
require __DIR__ . '/bootstrap.php';
$ROOT = dirname(__DIR__) . '/mphb-availability-calendar';
function get_transient($k) { return false; }
function set_transient($k, $v, $t) { return true; }
function delete_transient($k) { return true; }
// Settings is required by the classes below since 0.40.0 (Cache::ttl(),
// Staff::page_id(), the Ajax clamps, the widgets' control defaults). In
// production the plugin's autoloader supplies it on demand; these harnesses
// require their classes explicitly, so it has to be named here. Left out, the
// suite FATALS rather than failing — which mutate.php reports as NO RUN, and
// which is how this was caught before it shipped.
require $ROOT . '/includes/class-settings.php';
require $ROOT . '/includes/class-cache.php';
require $ROOT . '/includes/class-data-provider.php';
require $ROOT . '/includes/class-staff.php';
require $ROOT . '/includes/class-staff-data.php';

use MPHBAC\Staff_Data;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

/** A booking entity whose getInternalNotes() returns whatever we hand it. */
function with_notes($notes): array {
    $GLOBALS['t_posts'] = []; $GLOBALS['t_meta'] = []; $GLOBALS['wpdb']->payment_rows = [];
    t_post(22, 'mphb_room_type', 'publish', 'Cottage 22', ['mphb_adults_capacity' => 4]);
    t_post(220, 'mphb_room', 'publish', 'R', ['mphb_room_type_id' => 22]);
    t_post(950, 'mphb_booking', 'confirmed', 'B', ['mphb_total_price' => 0]);
    t_post(951, 'mphb_reserved_room', 'publish', 'RR', ['_mphb_room_id' => 220, '_mphb_adults' => 2]);
    $GLOBALS['t_posts'][951]->post_parent = 950;
    $GLOBALS['t_notes'] = $notes;
    return Staff_Data::booking_detail(950)['sections']['notes'];
}

/* MPHB is reached through MPHB()->getBookingRepository()->findById(). The
   entity below returns notes in MPHB's real shape — an ARRAY of assoc rows —
   because that is precisely what the removed ?object hints could not take. */
class T_Booking {
    public function getInternalNotes() { return $GLOBALS['t_notes']; }
    // 0.43.0: the guest's checkout note, through MotoPress's own getter.
    public function getNote() { return $GLOBALS['t_note'] ?? ''; }
    public function getCustomer() { return new T_Customer(); }
}
/* The customer entity's checkout custom fields, as getCustomFields() returns
   them — keyed by the checkout form's field names, hyphens and all. */
class T_Customer {
    public function getCustomFields() { return $GLOBALS['t_custom'] ?? []; }
}
class T_Repo { public function findById($id) { return new T_Booking(); } }
class T_MPHB { public function getBookingRepository() { return new T_Repo(); } }
function MPHB() { return new T_MPHB(); }

echo "-- THE 0.23.1 FATAL: notes as an array of rows --\n";
{
    $rows = with_notes([
        ['note' => 'Guest called about late arrival', 'date' => '2026-09-10 14:00', 'user' => 'Rob'],
        ['note' => 'Dog confirmed',                   'date' => '2026-09-11 09:30', 'user' => 'Rob'],
    ]);
    check('an ARRAY of note rows renders instead of fatalling', count($rows) === 2, count($rows));
    check('each note is a LIST entry, not one concatenated blob',
        count(array_unique(array_column($rows, 'value'))) === 2, array_column($rows, 'value'));
    check('newest first', str_contains($rows[0]['value'], 'Dog confirmed'), $rows[0]['value'] ?? null);
    check('the date and author reach the label', str_contains($rows[0]['label'], 'Rob'), $rows[0]['label'] ?? null);
}

echo "\n-- every other shape MPHB has returned --\n";
check('a single string note renders', count(with_notes('Just one note')) === 1);
check('null renders nothing rather than a blank row', with_notes(null) === []);
check('an empty array renders nothing', with_notes([]) === []);
check('an empty string renders nothing', with_notes('') === []);
check('a list of bare strings renders', count(with_notes(['one', 'two'])) === 2);
check('rows with a different text key still render',
    count(with_notes([['text' => 'via text key', 'date' => '2026-09-01']])) === 1);
check('a row whose text is whitespace is dropped, not rendered empty',
    with_notes([['note' => '   ', 'date' => '2026-09-01']]) === []);
/* TWO SEPARATE GUARDS, and only the second catches this. Whitespace is
 * trimmed to '' by plain() and dropped at the parse step; an em dash is
 * non-empty, so it reaches the is_blank() check. MPHB checkout fields collect
 * exactly these placeholders when a guest skips them, so a note reading "—"
 * must not render as a row that says nothing. */
foreach (['—', '-', 'N/A', 'none', '0'] as $placeholder) {
    check("a note of \"$placeholder\" is a placeholder, not a note",
        with_notes([['note' => $placeholder, 'date' => '2026-09-01']]) === [],
        $placeholder);
}
/* An OBJECT note is read through GETTERS, not public properties — the same
 * "read MPHB through its own getters" rule the whole file follows. A
 * property-only stdClass is not a shape MPHB produces, and the file's own
 * contract for an unrecognised shape is to degrade to empty, never to fatal.
 * Both halves are asserted, because the second is the one that matters: a
 * fatal here took the popup down for two thirds of live bookings once. */
class T_Note {
    public function getNote() { return 'from an object'; }
    public function getDate() { return '2026-09-01 10:00'; }
    public function getUser() { return 'Rob'; }
}
check('an object note with getters renders', count(with_notes([new T_Note()])) === 1);
check('...carrying its date and author too',
    str_contains(with_notes([new T_Note()])[0]['label'], 'Rob'), with_notes([new T_Note()])[0]['label'] ?? null);
check('a property-only object degrades to nothing rather than fatalling',
    with_notes([(object) ['note' => 'no getter here']]) === []);

echo "\n-- the notes are plain text like everything else --\n";
{
    $rows = with_notes([['note' => '<b>bold</b> &amp; dangerous<script>x</script>', 'date' => '2026-09-01']]);
    check('tags are stripped and entities decoded',
        !str_contains($rows[0]['value'], '<') && str_contains($rows[0]['value'], '&'), $rows[0]['value'] ?? null);
}

echo "\n-- the hints that caused the fatal must stay gone --\n";
{
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-staff-data.php');
    check('no ?object parameter hint remains anywhere in the file',
        !preg_match('/\(\s*\?object\s+\$/', $src),
        implode(' | ', array_slice((array) (preg_match_all('/function \w+\(\s*\?object[^)]*\)/', $src, $m) ? $m[0] : []), 0, 3)));
    check('first_of() still guards with is_object() at RUNTIME, where an array can reach it',
        preg_match('/function first_of\([^)]*\)[^{]*\{[\s\S]{0,200}is_object/', $src) === 1);
    check('...and it is not type-hinted to object either', !preg_match('/function first_of\(\s*object /', $src));
}

echo "\n-- a very long note list is bounded --\n";
{
    $many = array_map(static fn($i) => ['note' => "note $i", 'date' => '2026-09-01'], range(1, 200));
    $rows = with_notes($many);
    check('the list is capped rather than rendering 200 rows', count($rows) <= 50, count($rows));
}

echo "\n-- 0.43.0: the customer's note, through Booking::getNote() --\n";
{
    /* Missing from the sheet until 0.43.0 — 35 confirmed bookings on live
       carry one. Read through the entity getter, per Rob's 2026-09-03
       decision that the sheet is sourced through MotoPress's getters. */
    $GLOBALS['t_note'] = 'Arriving late, please leave the key';
    $rows = with_notes([['note' => 'Called guest', 'date' => '2026-09-10 14:00']]);
    check('the customer note is a row in the Notes section',
        (bool) array_filter($rows, static fn($r) => $r['label'] === 'Customer Note'
            && $r['value'] === 'Arriving late, please leave the key'), $rows);
    check('...and it comes ABOVE the admin notes',
        ($rows[0]['label'] ?? '') === 'Customer Note', array_column($rows, 'label'));
    check('the admin notes are still there beneath it',
        count($rows) === 2 && str_contains($rows[1]['value'] ?? '', 'Called guest'), $rows);
    $GLOBALS['t_note'] = '   ';
    $rows = with_notes([]);
    check('a blank note adds no row — the sheet shows only what the booking contains',
        !array_filter($rows, static fn($r) => $r['label'] === 'Customer Note'), $rows);
    $GLOBALS['t_note'] = '<b>Bold</b> & <script>x</script>';
    $rows = with_notes([]);
    check('the note arrives as plain text — the board writes it with textContent',
        ($rows[0]['value'] ?? '') !== '' && !str_contains($rows[0]['value'], '<'), $rows[0] ?? null);
    unset($GLOBALS['t_note']);
}

echo "\n-- 0.43.0: Apartment / Unit, through the customer's getCustomFields() --\n";
{
    $customer = static function (array $custom): array {
        $GLOBALS['t_custom'] = $custom;
        with_notes([]);
        return Staff_Data::booking_detail(950)['sections']['customer'];
    };
    $rows = $customer(['address1' => '1 Canal St', 'apartment-units' => '4B', 'city' => 'Dora']);
    $labels = array_column($rows, 'label');
    check('the checkout field "apartment-units" appears as Apartment / Unit',
        in_array('Apartment / Unit', $labels, true)
        && $rows[array_search('Apartment / Unit', $labels, true)]['value'] === '4B', $rows);
    check('...immediately after Address',
        array_search('Apartment / Unit', $labels, true) === array_search('Address', $labels, true) + 1, $labels);
    $rows = $customer(['address1' => '1 Canal St']);
    check('no field, no row', !in_array('Apartment / Unit', array_column($rows, 'label'), true));
    unset($GLOBALS['t_custom']);
}

echo "\n-- 0.43.1: two bookings with the same custom-field KEYS in one request --\n";
{
    // Every live booking carries the identical 12-key set. Up to 0.43.0
    // custom_get() cached its normalised map keyed by the key names alone, so
    // the second booking read the first booking's values. Same keys, different
    // values, one process.
    $values = static function (array $custom): array {
        $GLOBALS['t_custom'] = $custom;
        with_notes([]);
        $out = [];
        foreach (Staff_Data::booking_detail(950)['sections'] as $rows) {
            foreach ((array) $rows as $r) {
                if (is_array($r) && isset($r['label'], $r['value'])) {
                    $out[$r['label']] = $r['value'];
                }
            }
        }
        return $out;
    };
    $keys = ['address1', 'apartment-units', 'guest-2-first-name', 'dog-type'];
    $a = $values(array_combine($keys, ['1 Canal St', '4B', 'Alice', 'Labrador']));
    $b = $values(array_combine($keys, ['9 Lock Rd', '12', 'Bertie', 'Spaniel']));
    check('the first booking reads its own unit', ($a['Apartment / Unit'] ?? null) === '4B', $a);
    check('the second booking reads ITS unit, not the first one\'s', ($b['Apartment / Unit'] ?? null) === '12', $b);
    check('...and its own Guest 2', ($b['Guest2 First Name'] ?? null) === 'Bertie', $b);
    check('...and its own dog', in_array('Spaniel', $b, true) && !in_array('Labrador', $b, true), $b);
    $c = $values(array_combine($keys, ['1 Canal St', '—', '', 'Labrador']));
    check('a third booking with the field blank shows no unit rather than an earlier one',
        !isset($c['Apartment / Unit']), $c);
    unset($GLOBALS['t_custom']);
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
