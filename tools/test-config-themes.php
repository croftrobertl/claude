<?php
/**
 * DCC Seasons — what the INLINE CONFIG carries (4.12.1).
 *
 * The config used to ship all 27 theme definitions on every page, 10.0KB of
 * a 16.5KB object, for one theme's worth of use. It now ships only the
 * themes a page served today could need. This drives the REAL
 * Plugin::config() on the fake WordPress and asserts:
 *
 *   - every theme the schedule resolves to from yesterday to today + 14;
 *   - the base theme and 'classic' always, because ambient.js falls back to
 *     them (the resolved key, and the egg palette, respectively);
 *   - nothing else;
 *   - an admin preview of ANY theme still receives that theme's definition;
 *   - the trim is the only thing that changed: every other key is identical
 *     to the untrimmed config.
 *
 *   php tools/test-config-themes.php
 *
 * @package DCC_Seasons
 */

/* Stubs scope-stubs.php does not carry. Defined first; it defines the rest. */
function current_user_can($cap) { return !empty($GLOBALS['IS_ADMIN']); }
function add_query_arg($k, $v, $url) { return $url . '?' . $k . '=' . $v; }
function current_time($fmt) { return gmdate($fmt, strtotime($GLOBALS['TODAY'] . ' 12:00:00 UTC')); }
function home_url($p = '') { return 'https://example.test' . $p; }
function wp_json_encode($v) { return json_encode($v); }

require __DIR__ . '/scope-stubs.php';

use DCC_Seasons\Plugin;
use DCC_Seasons\Settings;
use DCC_Seasons\Schedule;
use DCC_Seasons\Themes;

$pass = 0; $fail = 0; $problems = [];
function ok($c, $label, $detail = '') {
    global $pass, $fail, $problems;
    if ($c) { $pass++; echo "    PASS  $label\n"; }
    else { $fail++; $problems[] = "$label — $detail"; echo "    FAIL  $label — $detail\n"; }
}

$GLOBALS['TODAY'] = '2027-03-25';
$GLOBALS['IS_ADMIN'] = false;
$GLOBALS['REQ'] = ['front' => true, 'page' => false, 'cottage' => false, 'id' => 0, 'slug' => '', 'path' => '/'];
$opt = Settings::defaults();
$GLOBALS['OPTIONS'][Settings::OPTION] = $opt;
$_SERVER['REQUEST_URI'] = '/';

$ref = new \ReflectionClass(Plugin::class);
$cm  = $ref->getMethod('config');
$cm->setAccessible(true);
$inst = $ref->newInstanceWithoutConstructor();
$cfg = function () use ($cm, $inst, &$opt) { return $cm->invoke($inst, $opt); };

$all   = Themes::themes();
$rows  = Themes::schedule($opt['schedule']);

/* ---- the window, on several days of the year ---- */
foreach (['2026-10-17', '2027-01-31', '2027-03-25', '2027-06-21', '2027-12-20'] as $day) {
    echo "\n  --- served on $day ---\n";
    $GLOBALS['TODAY'] = $day;
    $c = $cfg();
    $want = [Schedule::BASE_THEME => true, 'classic' => true];
    $start = new DateTimeImmutable($day . ' 00:00:00', new DateTimeZone('UTC'));
    for ($i = -1; $i <= Themes::WINDOW_DAYS; $i++) {
        $r = Schedule::active($rows, $start->modify(($i >= 0 ? '+' : '') . $i . ' day')->format('Y-m-d'));
        if (is_array($r) && !empty($r['theme'])) { $want[$r['theme']] = true; }
    }
    $got = array_keys($c['themes']);
    sort($got); $w = array_keys($want); sort($w);
    ok($got === $w, 'exactly the reachable themes plus the two fallbacks (' . count($got) . ')',
        'got ' . implode(',', $got) . ' want ' . implode(',', $w));
    ok(isset($c['themes'][Schedule::BASE_THEME]), 'the base theme is there (ambient.js falls back to it)');
    ok(isset($c['themes']['classic']), "'classic' is there (the egg's palette fallback)");
    ok(count($got) < count($all), 'and it is a subset, not the whole table (' . count($got) . ' of ' . count($all) . ')');
    /* the theme a visitor resolving TODAY gets is present, definition and all */
    $live = Schedule::active($rows, $day);
    $key = is_array($live) && !empty($live['theme']) ? $live['theme'] : Schedule::BASE_THEME;
    ok(isset($c['themes'][$key]['ambient']) || isset($c['themes'][$key]['egg']),
        "today's own theme ($key) is carried in full", json_encode(array_keys($c['themes'][$key] ?? [])));
}

/* ---- yesterday matters: a visitor's local clock can be a day behind ---- */
echo "\n  --- yesterday is inside the window ---\n";
{
    /* a day whose PREVIOUS day belongs to a different theme */
    $found = null;
    $d = new DateTimeImmutable('2027-01-01', new DateTimeZone('UTC'));
    for ($i = 0; $i < 365 && $found === null; $i++, $d = $d->modify('+1 day')) {
        $a = Schedule::active($rows, $d->modify('-1 day')->format('Y-m-d'));
        $b = Schedule::active($rows, $d->format('Y-m-d'));
        $ka = $a['theme'] ?? ''; $kb = $b['theme'] ?? '';
        if ($ka && $kb && $ka !== $kb) { $found = [$d->format('Y-m-d'), $ka]; }
    }
    ok($found !== null, 'found a day whose yesterday had another theme', 'none in 2027');
    if ($found) {
        $GLOBALS['TODAY'] = $found[0];
        $c = $cfg();
        ok(isset($c['themes'][$found[1]]), "yesterday's theme ({$found[1]}) is still carried on {$found[0]}",
            implode(',', array_keys($c['themes'])));
    }
}

/* ---- a preview of any theme still works ---- */
echo "\n  --- admin preview of a theme outside the window ---\n";
{
    $GLOBALS['TODAY'] = '2027-03-25';
    $c = $cfg();
    $outside = null;
    foreach ($all as $k => $v) { if (!isset($c['themes'][$k])) { $outside = $k; break; } }
    ok($outside !== null, 'there is a theme outside the window to preview', 'none');
    $GLOBALS['IS_ADMIN'] = true;
    $_GET['dcc_season'] = $outside;
    $c2 = $cfg();
    ok($c2['preview'] === $outside, "the preview flag is set ($outside)", json_encode($c2['preview']));
    ok(isset($c2['themes'][$outside]), 'and its definition rides along', implode(',', array_keys($c2['themes'])));
    ok($c2['themes'][$outside] === $all[$outside], 'byte-identical to the full table entry');
    /* every theme, one at a time */
    $missing = [];
    foreach (array_keys($all) as $k) {
        $_GET['dcc_season'] = $k;
        $cc = $cfg();
        if (!isset($cc['themes'][$k]) || $cc['themes'][$k] !== $all[$k]) { $missing[] = $k; }
    }
    ok(!$missing, 'a preview of EVERY one of the ' . count($all) . ' themes receives its theme', implode(',', $missing));
    /* a visitor cannot ask for one */
    $GLOBALS['IS_ADMIN'] = false;
    $_GET['dcc_season'] = $outside;
    $c3 = $cfg();
    ok($c3['preview'] === null && !isset($c3['themes'][$outside]),
        'a logged-out visitor asking for it gets neither the flag nor the theme', json_encode($c3['preview']));
    unset($_GET['dcc_season']);
}

/* ---- nothing else about the config moved ---- */
echo "\n  --- the trim is the only change ---\n";
{
    $GLOBALS['TODAY'] = '2027-03-25';
    $c = $cfg();
    $keys = array_keys($c);
    ok(in_array('schedule', $keys, true) && $c['schedule'] === $rows, 'the schedule is unchanged and complete (all rows)');
    ok(isset($c['holidays'], $c['clashWins'], $c['anchors']), 'the calendar tables are still shipped');
    $raw = strlen(json_encode($c));
    $fullCfg = $c; $fullCfg['themes'] = $all;
    $rawFull = strlen(json_encode($fullCfg));
    ok($raw < $rawFull * 0.6, sprintf('the config is smaller: %d bytes against %d (%.0f%%)', $raw, $rawFull, 100 * $raw / $rawFull),
        "$raw vs $rawFull");
    echo sprintf("    note  %d raw bytes, was %d (%d themes of %d)\n", $raw, $rawFull, count($c['themes']), count($all));
}

/* ---- a broken date never costs a theme ---- */
echo "\n  --- defensive ---\n";
{
    ok(count(Themes::reachable($rows, 'not-a-date')) === count($all), 'an unparseable date falls back to the whole table');
    ok(count(Themes::reachable([], '2027-03-25')) >= 2, 'an empty schedule still carries the two fallbacks');
    $wide = Themes::reachable($rows, '2027-03-25', 366);
    $narrow = Themes::reachable($rows, '2027-03-25', 1);
    ok(count($wide) >= count($narrow), 'a wider window is never smaller');
    ok(count($narrow) >= 2, 'the narrowest window still carries the fallbacks');
}

echo "\n$pass passed · $fail failed\n";
foreach ($problems as $p) { echo "  - $p\n"; }
exit($fail ? 1 : 0);
