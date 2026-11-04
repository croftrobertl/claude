<?php
/**
 * 0.56.0 — THE POP-UP'S "SUMMARY ON TOP" (Rob's layout C), on the server.
 *
 * tests/render/popup-0560.php runs nine invented bookings through the real
 * Staff_Data of this checkout and of 0.55.0 (from git, 1393cd1). Checked:
 *   - SEARCH UNCHANGED: every search_doc() and Staff_Search::index() itself,
 *     byte for byte the same as 0.55.0's;
 *   - the pop-up's answer is 0.55.0's with the Accommodation Type, Check-In
 *     and Check-Out rows and an import's "count not provided by …" row taken
 *     out of the Booking section and sent once as `summary` — every other row
 *     the same, label and value, in the same order; the guest's own note
 *     marked `guest`;
 *   - the summary per case: the cottage(s), the ISO dates, the channel of an
 *     import (none for a direct booking), "count not sent" only where 0.55.0
 *     said "count not provided by …" — never in place of a confirmed count.
 */
$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}
$REPO = dirname(__DIR__);
$OLD = sys_get_temp_dir() . '/popup-0560-' . getmypid();
@mkdir($OLD);
exec('git -C ' . escapeshellarg($REPO) . ' archive 1393cd1 mphb-availability-calendar | tar -x -C ' . escapeshellarg($OLD), $o, $rc);
check('(instrument check) 0.55.0 itself, from git (1393cd1)', $rc === 0 && is_file("$OLD/mphb-availability-calendar/includes/class-staff-data.php"));
$run = static fn(string $dir) => (string) shell_exec('php ' . escapeshellarg(__DIR__ . '/render/popup-0560.php') . ' ' . escapeshellarg($dir) . ' 2>&1');
$rawOld = $run("$OLD/mphb-availability-calendar");
$rawNew = $run("$REPO/mphb-availability-calendar");
$old = json_decode($rawOld, true); $new = json_decode($rawNew, true);
check('(instrument check) both answered for all nine bookings', is_array($old) && is_array($new) && count($new['details']) === 9 && count($old['details']) === 9, [substr($rawNew, 0, 200)]);

echo "\n-- search: unchanged --\n";
$enc = static fn($v) => json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
check('Staff_Search::index() byte-identical to 0.55.0 (' . strlen($enc($new['index'])) . ' bytes, ' . count((array) $new['index']) . ' bookings)', is_array($new['index']) && $enc($new['index']) === $enc($old['index']));
foreach ($new['search'] as $id => $doc) {
    check("booking $id: search_doc() byte-identical — the cottage, Check-In and Check-Out still among its fields", $enc($doc) === $enc($old['search'][$id])
        && in_array('Check-In', array_column($doc['fields'], 0), true) && in_array('Accommodation Type', array_column($doc['fields'], 0), true));
}

echo "\n-- the pop-up's answer: 0.55.0's rows, the summary taken out --\n";
$strip = static fn(array $rows) => array_map(static fn($r) => ['label' => $r['label'], 'value' => $r['value']], $rows);
$SUMMARY = ['Accommodation Type', 'Check-In', 'Check-Out'];
foreach ($new['details'] as $id => $d) {
    $o = $old['details'][$id];
    $keep = array_values(array_filter($o['sections']['booking'], static fn($r) => !in_array($r['label'], $SUMMARY, true) && empty($r['muted'])));
    check("booking $id: Booking Information = 0.55.0's minus Accommodation Type, Check-In, Check-Out and any \"count not provided\" row",
        $enc($strip($d['sections']['booking'])) === $enc($strip($keep)) && !array_filter($d['sections']['booking'], static fn($r) => isset($r['summary']) || isset($r['muted'])), $strip($d['sections']['booking']));
    check("booking $id: Customer Information identical to 0.55.0's, row for row (labels, values, links)", $enc($d['sections']['customer']) === $enc($o['sections']['customer']));
    check("booking $id: the notes 0.55.0's, the guest's own one marked guest", $enc($strip($d['sections']['notes'])) === $enc($strip($o['sections']['notes']))
        && array_values(array_map(static fn($r) => !empty($r['guest']), $d['sections']['notes'])) === array_values(array_map(static fn($r) => $r['label'] === 'Customer Note', $o['sections']['notes'])));
    $ob = array_column($o['sections']['booking'], 'value', 'label');
    check("booking $id: summary dates are 0.55.0's Check-In / Check-Out values, the cottages its Accommodation Type", $d['summary']['checkin'] === $ob['Check-In'] && $d['summary']['checkout'] === $ob['Check-Out']
        && implode(', ', $d['summary']['cottages']) === $ob['Accommodation Type'], $d['summary']);
    unset($d['sections'], $d['summary'], $o['sections']);
    check("booking $id: everything else in the answer (id, source, imported) unchanged", $enc($d) === $enc($o));
}

echo "\n-- the summary, case by case --\n";
$S = static fn($id) => $new['details'][$id]['summary'];
check('801 direct: no source chip, count known; Total / Paid / Balance Due stay in Booking Information', $S(801)['source'] === '' && !$S(801)['guestCountNotSent']
    && array_column($new['details'][801]['sections']['booking'], 'label') === ['Number of Guests', 'Total', 'Paid', 'Balance Due']);
check('802 Booking.com, no count: source "booking", count not sent — and NO Number of Guests row left', $S(802)['source'] === 'booking' && $S(802)['guestCountNotSent'] === true
    && $new['details'][802]['sections']['booking'] === []);
check('...where 0.55.0 had "count not provided by Booking.com"', in_array('count not provided by Booking.com', array_column($old['details'][802]['sections']['booking'], 'value'), true));
check('803 Airbnb, CONFIRMED count: source "airbnb", count NOT flagged as not sent, the Number of Guests row kept ("4 (3 adults, 1 child)")', $S(803)['source'] === 'airbnb' && $S(803)['guestCountNotSent'] === false
    && array_column($new['details'][803]['sections']['booking'], 'value', 'label') === ['Number of Guests' => '4 (3 adults, 1 child)']);
check('805 Vrbo, no count: "vrbo", not sent', $S(805)['source'] === 'vrbo' && $S(805)['guestCountNotSent'] === true);
check('806 two cottages: both, one each', $S(806)['cottages'] === ['Cottage 22: The Boathouse', 'Cottage 23: The Lighthouse']);
check('809 across New Year: 2026-12-30 → 2027-01-02', $S(809)['checkin'] === '2026-12-30' && $S(809)['checkout'] === '2027-01-02');
check('the declined changes are not made: First Name and Last Name still two rows; Guest2 / Dog / Boat labels as before', array_column($new['details'][807]['sections']['customer'], 'label')
    === ['First Name', 'Last Name', 'Email', 'Phone', 'Guest2 First Name', 'Guest2 Last Name', 'Guest 2 Phone', 'Dog Type', 'Dog Size', 'Boat']);

exec('rm -rf ' . escapeshellarg($OLD));
echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
