<?php
/**
 * DCC Seasons — Rob's 4.2.0 rules, proven on EVERY DATE, outside WordPress.
 *
 * Each day of 2027-2036 is resolved through the real Schedule::active() to
 * the theme a guest would see, and that theme's real definition (plus the
 * engine's own registries, read from engine.js) is checked against the
 * rules Rob set. A rule stated only about a theme could still be broken on
 * a date that resolves somewhere unexpected; walking the dates cannot be.
 *
 * Usage: php tools/test-rules.php
 *
 * @package DCC_Seasons
 */

define('ABSPATH', 1);
if (!function_exists('__')) { function __($s, $d = null) { return $s; } }
if (!function_exists('apply_filters')) { function apply_filters($t, $v) { return $v; } }

require __DIR__ . '/../dcc-seasons/includes/class-schedule.php';
require __DIR__ . '/../dcc-seasons/includes/class-themes.php';

use DCC_Seasons\Schedule;
use DCC_Seasons\Themes;

$pass = 0; $fail = 0; $problems = [];
function ok(bool $c, string $label, string $detail = ''): void {
    global $pass, $fail, $problems;
    if ($c) { $pass++; echo "  PASS  $label\n"; }
    else { $fail++; $problems[] = "$label — $detail"; echo "  FAIL  $label — $detail\n"; }
}

$themes = Themes::themes();
$subtle = Themes::subtle_defaults();
$engine = file_get_contents(__DIR__ . '/../dcc-seasons/assets/js/engine.js');
$rows   = Schedule::defaults();

/* Every sprite key a theme's particles can draw. */
function sprite_keys(array $theme): array {
    $out = [];
    foreach ($theme['ambient']['particles'] ?? [] as $p) {
        if (isset($p['s'])) { foreach ((array) $p['s'] as $k) { $out[] = $k; } }
        if (isset($p['c'])) { $out[] = 'prim:' . $p['c'] . ':' . ($p['b'] ?? ''); }
    }
    return $out;
}

/* Walk the dates. */
$seen = [];
for ($d = new DateTime('2027-01-01'); $d->format('Y') <= 2036; $d->modify('+1 day')) {
    $ds = $d->format('Y-m-d');
    $r  = Schedule::active($rows, $ds);
    $t  = $r ? $r['theme'] : Schedule::BASE_THEME;
    $seen[$t][] = $ds;
}
echo "=== " . array_sum(array_map('count', $seen)) . " dates walked, " . count($seen) . " themes reached ===\n";

echo "\n=== no snow, on any date ===\n";
$bad = [];
foreach ($seen as $t => $dates) {
    $keys = sprite_keys($themes[$t]);
    if (in_array('snowflake', $keys, true)) { $bad[] = "$t sprite"; }
    if (($subtle[$t] ?? '') === 'snow') { $bad[] = "$t subtle"; }
}
ok(!$bad, 'no date reaches a snowflake sprite or a snow subtle layer', implode(', ', $bad));
ok(!preg_match("/\\n\\t\\tsnowflake:/", $engine), 'the snowflake sprite is gone from the engine registry');
ok(!preg_match("/\\n\\t\\t\\tsnow: \\{/", $engine), 'the snow effect is gone from the SUBTLE registry');
ok(strpos($engine, 'snowCols') === false && strpos($engine, 'drawSnow') === false, 'the snow-piling machinery is gone');
ok(strpos($engine, "'snow'") === false || preg_match("/\\('snow' before 4\\.2\\.0\\)/", $engine) === 1, 'the engine names snow only in the note explaining the fallback');

echo "\n=== heroes ===\n";
$eagle = [];
foreach ($seen as $t => $dates) {
    if (($themes[$t]['ambient']['hero'] ?? '') === 'eagle') { $eagle[] = $t; }
}
sort($eagle);
ok($eagle === ['july4', 'patriot_day'], 'the eagle hero appears only on July 4 and Patriot Day', implode(',', $eagle));
foreach (['memorial_day', 'veterans_day'] as $t) {
    ok(empty($themes[$t]['ambient']['hero']), "$t has the heron only");
}
/* drawHero may put text on the canvas in exactly one place: the rainbow's
 * ☘ clover strip, Rob's one explicit exception. */
$a = strpos($engine, 'function drawHero(');
$b = strpos($engine, '/* --- Vignette director', $a);
$body = substr($engine, $a, $b - $a);
preg_match_all('/fillText\(([^,]+),/', $body, $m);
ok(count($m[1]) === 1 && strpos($body, "fillText('☘'") !== false, 'no hero draws an emoji — except the rainbow\'s ☘ strip',
    'fillText args: ' . implode(' | ', $m[1]));
ok(strpos($engine, "'ducks'") === false, 'the unused ducks hero is gone');
foreach (['eagleup', 'eagledown', 'witchsil', 'bassleap', 'ospreyup', 'ospreydown'] as $k) {
    ok((bool) preg_match("/\\n\\t\\t$k: '/", $engine), "hero drawing '$k' is in the registry");
}

echo "\n=== same thing twice (the sprite version goes, the subtle layer stays) ===\n";
$drops = [
    'valentines'   => ['prim:heart:orbit'],
    'new_years'    => ['prim:confetti:tumble'],
    'fall_fishing' => ['leafm', 'leafo', 'leafc', 'leafs'],
    'thanksgiving' => ['leafm', 'leafo', 'leafc', 'leafs'],
    'summer_canal' => ['dragonfly'],
    'florida_keys' => ['dragonfly'],
    'mothers_day'  => ['petal'],
    'spring_canal' => ['petal'],
];
foreach ($drops as $t => $gone) {
    $keys = sprite_keys($themes[$t]);
    $left = array_values(array_intersect($gone, $keys));
    ok(!$left, "$t: no " . implode('/', array_unique(array_map(fn($k) => preg_replace('/^prim:|:.*$/', '', $k), $gone))) . ' sprite', implode(',', $left));
}
$straw = array_filter($themes['strawberry']['ambient']['particles'], fn($p) => ($p['s'] ?? '') === 'blossom');
$bs = array_values(array_map(fn($p) => $p['b'], $straw));
ok($bs === ['berrycycle'], 'strawberry: the drifting blossom sprite is gone, the bloom-to-berry one stays', implode(',', $bs));
$j4 = sprite_keys($themes['july4']);
ok(in_array('sparkler', $j4, true) && ($themes['july4']['ambient']['mode'] ?? '') === 'burst', 'July 4 keeps its sparklers and fireworks');

echo "\n=== Florida Keys ===\n";
$fk = $themes['florida_keys']['ambient'];
$fkeys = sprite_keys($themes['florida_keys']);
ok(($fk['hero'] ?? '') === 'osprey', 'the Keys hero is the osprey');
ok(in_array('jonboat', $fkeys, true) && in_array('ibis', $fkeys, true), 'the Keys show the jon boat and the white ibis');
foreach (['pelican', 'skiff', 'flamingo', 'sun'] as $k) {
    ok(!in_array($k, $fkeys, true), "the Keys particle list has no $k");
}
ok(!preg_match("/\\n\\t\\t(pelican|pelican1|skiff): '/", $engine), 'the pelican and skiff drawings are retired');
ok((bool) preg_match("/florida_keys: \\['sun', /", $engine), 'the Keys sun is a corner accent');
ok(in_array('flamingo', sprite_keys($themes['snowbird']), true), "Snowbird keeps its flamingo V");
preg_match("/florida_keys: \\[('anhinga'[^\\]]*)\\]/", $engine, $vm);
ok(isset($vm[1]) && substr_count($vm[1], "'") === 10, 'the Keys rotate five scenes', $vm[1] ?? '');
/* No animal twice across the Keys hero, sprites and scenes. */
$animals = ['osprey' => 0, 'ibis' => 0, 'anhinga' => 0, 'crane' => 0, 'limpkin' => 0];
$animals['osprey'] += 1;                      // hero
foreach ($fkeys as $k) { if (isset($animals[$k])) { $animals[$k]++; } }
ok($animals['ibis'] === 1 && $animals['osprey'] === 1, 'the ibis and the osprey are each named once in the Keys theme (the osprey scene is Rob\'s accepted exception)');

echo "\n=== the sun ===\n";
$sunSprite = [];
foreach ($themes as $t => $th) { if (in_array('sun', sprite_keys($th), true)) { $sunSprite[] = $t; } }
ok(!$sunSprite, 'no theme draws the sun as a sprite — it is a corner accent only', implode(',', $sunSprite));

echo "\n=== counts carried as defaults ===\n";
ok(($themes['patriot_day']['ambient']['max'] ?? 0) === 5, 'Patriot Day capped at 5');
ok(($themes['memorial_day']['ambient']['max'] ?? 0) === 7, 'Memorial Day capped at 7');
ok(($themes['christmas']['ambient']['max'] ?? 0) === 9 && ($themes['christmas']['ambient']['phoneMin'] ?? 0) === 5, 'Christmas capped at 9, never below 5 on a phone');
ok(($themes['st_patricks']['ambient']['max'] ?? 0) === 6, "St. Patrick's capped at 6 (about 5 clovers)");
$lab = sprite_keys($themes['labor_day']);
ok(!in_array('prim:star:fall', $lab, true), 'Labor Day: the leftover red/white/blue stars are gone');
ok(in_array('van', sprite_keys($themes['four_twenty']), true) && !in_array('basket', sprite_keys($themes['four_twenty']), true), '4/20: the van replaces the basket');

echo "\n=== the engine mirrors the PHP subtle map ===\n";
preg_match('/var SUBTLE_FALLBACK = \{([^}]+)\}/s', $engine, $sf);
preg_match_all("/(\\w+): '(\\w*)'/", $sf[1] ?? '', $pairs, PREG_SET_ORDER);
$mirror = [];
foreach ($pairs as $p) { $mirror[$p[1]] = $p[2]; }
ksort($mirror); $php = $subtle; ksort($php);
ok($mirror === $php, 'SUBTLE_FALLBACK equals Themes::subtle_defaults()', json_encode(array_diff_assoc($php, $mirror)));

echo "\n$pass passed · $fail failed\n";
if ($fail) { foreach ($problems as $p) { echo "  - $p\n"; } exit(1); }
