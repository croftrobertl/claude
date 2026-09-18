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
check('a row whose text is blank is dropped, not rendered empty',
    with_notes([['note' => '   ', 'date' => '2026-09-01']]) === []);
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

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
