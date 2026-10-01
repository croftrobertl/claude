<?php
/**
 * Print the WHOLE widget as render() emits it, for one named case, so the
 * browser suite can exercise the real page layout (v0.23.2).
 *
 *   php tests/_emit-guide.php <case>   case: public-intro | public-no-intro | guest
 */
require __DIR__ . '/_render-guide.php';

function dccgg_guide_case(string $case): array {
    $sections = [
        ['_id' => 's1', 'section_key' => 'pool', 'section_title' => 'Pool', 'section_audience' => 'both'],
        ['_id' => 's2', 'section_key' => 'canal', 'section_title' => 'Canal & Wildlife', 'section_audience' => 'both'],
        ['_id' => 's3', 'section_key' => 'wifi', 'section_title' => 'Internet', 'section_audience' => 'guest'],
    ];
    $items = [
        ['_id' => 'i1', 'item_section' => 'pool', 'item_title' => 'Pool hours', 'item_content' => '<p>Open eight to ten.</p>'],
        ['_id' => 'i2', 'item_section' => 'canal', 'item_title' => 'Manatees', 'item_content' => '<p>Look for them in the canal.</p>'],
        ['_id' => 'i3', 'item_section' => 'wifi', 'item_title' => 'Wifi', 'item_content' => '<p>Join.</p>',
         'item_copy' => 'yes', 'item_copy_value' => 'DCC32586', 'item_mask_value' => 'yes',
         'item_wifi_mode' => 'yes', 'wifi_ssid' => 'topoftheworld'],
    ];
    $intro = 'Take a look at what life is like at Dora Canal Court — from the amenities and rules to the canal and wildlife.';
    $cases = [
        'public-intro'    => ['guide_mode' => 'public', 'public_intro' => $intro],
        'public-no-intro' => ['guide_mode' => 'public'],
        'guest'           => ['guide_mode' => 'full', 'public_intro' => $intro],   // a stray intro must still not show
    ];
    return ($cases[$case] ?? $cases['public-intro']) + ['guide_sections' => $sections, 'guide_items' => $items];
}

if (PHP_SAPI === 'cli' && realpath($argv[0] ?? '') === __FILE__) {
    echo dccgg_render_guide(dccgg_guide_case($argv[1] ?? 'public-intro'));
}
