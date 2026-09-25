<?php
/**
 * The cottage column's short name.
 *
 * The rule: drop a leading article, then drop TRAILING generic accommodation
 * nouns while more than one word remains. Until 0.23.5 it took the FIRST
 * non-article word and stopped, which turned "Blue Heron Hideaway" into
 * "Blue" — a name that means nothing to a guest.
 *
 * Tested through list_room_types(), the public entry, rather than by
 * reflecting into the private helper: the splitting of "Cottage 35: X" from
 * the abbreviation is part of the behaviour and would be skipped otherwise.
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

use MPHBAC\Data_Provider;

$fail = 0;
function check(string $l, bool $c, $x = null): void {
    global $fail;
    echo ($c ? 'PASS  ' : 'FAIL  ') . $l . ($x !== null ? '   [' . (is_string($x) ? $x : json_encode($x)) . ']' : '') . "\n";
    if (!$c) { $fail++; }
}

/** Seed one room type and read back what the calendar would label it. */
function label(string $title): array {
    $GLOBALS['t_posts'] = [];
    $GLOBALS['t_meta'] = [];
    t_post(100, 'mphb_room_type', 'publish', $title);
    $t = Data_Provider::list_room_types();
    return $t[0] ?? [];
}

echo "-- the live cottages --\n";
foreach ([
    ['Cottage 22: The Boathouse',       '22', 'Boathouse'],
    ['Cottage 31: Hibiscus Hut',        '31', 'Hibiscus'],
    ['Cottage 35: Blue Heron Hideaway', '35', 'Blue Heron'],
] as [$title, $num, $abbrev]) {
    $r = label($title);
    check("\"$title\" -> #$num / $abbrev",
        ($r['number'] ?? null) === $num && ($r['abbrev'] ?? null) === $abbrev,
        ['number' => $r['number'] ?? null, 'abbrev' => $r['abbrev'] ?? null]);
}

echo "\n-- THE 0.23.5 REGRESSION: never stop at the first word --\n";
check('"Blue Heron Hideaway" keeps BOTH distinctive words, not just "Blue"',
    label('Cottage 35: Blue Heron Hideaway')['abbrev'] === 'Blue Heron');
check('"Morning Glory Cottage" keeps both too',
    label('Cottage 1: Morning Glory Cottage')['abbrev'] === 'Morning Glory',
    label('Cottage 1: Morning Glory Cottage')['abbrev']);

echo "\n-- the single-word guard --\n";
check('"The Boathouse" is not reduced to nothing when the last word is itself generic',
    label('Cottage 22: The Boathouse')['abbrev'] === 'Boathouse');
check('a bare generic name survives rather than emptying',
    label('Cottage 9: Cottage')['abbrev'] === 'Cottage',
    label('Cottage 9: Cottage')['abbrev']);

echo "\n-- the title is preserved verbatim --\n";
{
    $r = label('Cottage 35: Blue Heron Hideaway');
    check('the full title is kept alongside the abbreviation, unmodified',
        $r['title'] === 'Cottage 35: Blue Heron Hideaway', $r['title'] ?? null);
    $odd = label('Lakeside Retreat');           // no "Cottage N:" prefix
    check('a title with no "Cottage N:" prefix yields no number and still abbreviates',
        $odd['number'] === '' && $odd['abbrev'] === 'Lakeside', $odd);
}

echo "\n-- the length cap never cuts mid-word --\n";
{
    $r = label('Cottage 7: Extraordinarily Long Cottage Name Here');
    $a = $r['abbrev'];
    check('the cap holds', mb_strlen($a) <= 16, $a);
    check('...and it breaks on a space, never mid-word — "Morning Glor" reads as a bug',
        $a === '' || !preg_match('/\S$/', mb_substr($a, -1)) || strpos('Extraordinarily Long Cottage Name Here', $a) === 0,
        $a);
    check('the word it ends on is a whole word',
        in_array($a, explode('|', implode('|', array_map(
            static fn($n) => implode(' ', array_slice(explode(' ', 'Extraordinarily Long Cottage Name Here'), 0, $n)),
            range(1, 5)
        ))), true), $a);
}

echo "\n-- the generic list is filterable, and filtering it really changes the answer --\n";
{
    // apply_filters is a no-op in bootstrap.php, so prove the seam exists in
    // the source rather than claiming a behaviour the stub cannot show.
    $src = file_get_contents(dirname(__DIR__) . '/mphb-availability-calendar/includes/class-data-provider.php');
    check('the generic-noun list goes through mphbac_generic_room_words',
        str_contains($src, "apply_filters('mphbac_generic_room_words'"));
    check('...and the article list is applied before it, not after',
        strpos($src, "articles = ['the'") < strpos($src, 'mphbac_generic_room_words'));
}

echo "\n" . ($fail ? "$fail FAILED\n" : "all passed\n");
exit($fail ? 1 : 0);
