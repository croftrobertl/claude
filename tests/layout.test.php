<?php
/**
 * DCC Guest Guide — page layout, from the WHOLE widget's real render() (v0.23.2).
 *
 * The public guide reads: intro line, search bar, section tiles. The guest
 * guide has no intro line and keeps its own order. Earlier suites drive
 * render_item() or static helpers; this one drives render() itself, with every
 * setting at its own control's default (tests/_render-guide.php).
 *
 *   php tests/layout.test.php
 */
require __DIR__ . '/_emit-guide.php';

$pass = 0; $fail = 0; $failures = [];
function check($name, $cond, $detail = '') {
    global $pass, $fail, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $fail++; $failures[] = $name . ($detail ? " — $detail" : ''); echo "  ✗ $name" . ($detail ? " — $detail" : '') . "\n"; }
}
$order = function (string $html): array {
    preg_match_all('/class="(dccgg-heading|dccgg-toolbar|dccgg-public-intro|dccgg-search|dccgg-stage-container|dccgg-public-cta-wrap)"/', $html, $m);
    return $m[1];
};
$pos = function (array $o, string $k) { $i = array_search($k, $o, true); return $i === false ? -1 : $i; };

echo "\nA. Public guide: intro line, then search, then tiles\n";
$pub = dccgg_render_guide(dccgg_guide_case('public-intro'));
$o = $order($pub);
check('the intro line renders on the public guide', $pos($o, 'dccgg-public-intro') >= 0, implode(' > ', $o));
check('the intro comes BEFORE the search bar', $pos($o, 'dccgg-public-intro') < $pos($o, 'dccgg-search'), implode(' > ', $o));
check('the search bar comes before the section tiles', $pos($o, 'dccgg-search') < $pos($o, 'dccgg-stage-container'), implode(' > ', $o));
check('and they are adjacent: nothing renders between intro and search, or search and tiles',
    $pos($o, 'dccgg-search') === $pos($o, 'dccgg-public-intro') + 1
    && $pos($o, 'dccgg-stage-container') === $pos($o, 'dccgg-search') + 1, implode(' > ', $o));
// The search box itself is untouched: same children, same order.
$kids = [];
if (preg_match('/<div class="dccgg-search">([\s\S]*?)<\/div>\s*<\/div>/', $pub, $box)) {
    preg_match_all('/class="[^"]*?\\b(dccgg-search-[a-z]+|dccgg-sr-only)"/', $box[1], $km);
    $kids = $km[1];
}
check('the search box keeps its icon, input, ⌘K hint, results list and live count, in that order',
    $kids === ['dccgg-search-icon', 'dccgg-search-input', 'dccgg-search-kbd', 'dccgg-search-results', 'dccgg-sr-only'],
    implode(',', $kids));
check('the intro text is the host\'s line, escaped', strpos($pub, '<p class="dccgg-public-intro">Take a look at what life is like at Dora Canal Court — from the amenities') !== false);

echo "\nB. Public guide without an intro: search, then tiles (unchanged)\n";
$o = $order(dccgg_render_guide(dccgg_guide_case('public-no-intro')));
check('no intro element, and search sits directly above the tiles',
    $pos($o, 'dccgg-public-intro') === -1 && $pos($o, 'dccgg-stage-container') === $pos($o, 'dccgg-search') + 1, implode(' > ', $o));

echo "\nC. Guest guide: no intro line, order unchanged\n";
$guest = dccgg_render_guide(dccgg_guide_case('guest'));
$o = $order($guest);
check('the guest guide never renders the intro, even if the field is filled', strpos($guest, 'dccgg-public-intro') === false);
check('guest order is heading > toolbar > search > tiles',
    implode(' > ', $o) === 'dccgg-heading > dccgg-toolbar > dccgg-search > dccgg-stage-container', implode(' > ', $o));

echo "\n$pass passed, $fail failed\n";
if ($fail) { echo "Failures:\n"; foreach ($failures as $f) { echo "  - $f\n"; } exit(1); }
