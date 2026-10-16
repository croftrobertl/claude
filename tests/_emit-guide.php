<?php
/**
 * Print the WHOLE widget as render() emits it, for one named case, so the
 * browser suite can exercise the real page layout (v0.23.2).
 *
 *   php tests/_emit-guide.php <case>   case: public-intro | public-no-intro | guest | guest-more | guest-fd | live-sections | live-sections-fa | guest-live
 */
require __DIR__ . '/_render-guide.php';

/** The eight live sections, with v0.24.1's bundled icons. */
function dccgg_live_sections(bool $new_icons = true): array {
    $spec = [
        ['internet',  'Internet',          'devices',          'fas fa-wifi'],
        ['amenities', 'Amenities',         'laundry',          'fas fa-concierge-bell'],
        ['clubhouse', 'Clubhouse',         'campfire',         'fas fa-users'],
        ['canal',     'Boating / Fishing', 'fish',             'fas fa-fish'],
        ['checkout',  'Checkout',          'suitcase-rolling', 'fas fa-suitcase-rolling'],
        ['rules',     'Rules',             'gavel',            'fas fa-gavel'],
        ['map',       'Map',               'signpost',         'fas fa-map-signs'],
        ['review',    'Review Us',         'hand-heart',       'fas fa-trophy'],
    ];
    $out = [];
    foreach ($spec as [$key, $title, $glyph, $fa]) {
        $out[] = ['_id' => 's_' . $key, 'section_key' => $key, 'section_title' => $title,
            'section_audience' => 'both',
            'section_icon' => $new_icons
                ? ['value' => 'dccgg-icon-' . $glyph, 'library' => 'dccgg-icons']
                : ['value' => $fa, 'library' => 'fa-solid']];
    }
    return $out;
}

/** One item per live section, so every popup has something in it. */
function dccgg_live_items(): array {
    $out = [];
    foreach (dccgg_live_sections() as $i => $sec) {
        $out[] = ['_id' => 'i' . $i, 'item_section' => $sec['section_key'],
            'item_title' => $sec['section_title'] . ' notes',
            'item_content' => '<p>Something about ' . $sec['section_title'] . '.</p>'];
    }
    return $out;
}

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
        // v0.23.4: the guest guide as live runs it, with the ⋯ More menu on.
        // The ⋯ popover: two items, so it stays a <details>.
        'guest-more'      => ['guide_mode' => 'full', 'enable_detail_more_menu' => 'yes',
                              'more_menu_slot_1' => 'print', 'more_menu_slot_2' => 'save_pdf'],
        // Page 4645 as it stands on live: the ⋯ button's label set to two
        // emoji, slots report/none/none, report on. Rendered on 0.23.5 this is
        // the 6px-radius text box; on 0.24.0 with those keys cleared it is the
        // Front Desk button (case 'guest-fd').
        'guest-live'      => ['guide_mode' => 'full', 'enable_detail_more_menu' => 'yes',
                              'enable_popup_more_menu' => 'yes', 'enable_problem_report' => 'yes',
                              'problem_report_recipients' => 'host@example.test',
                              'more_button_label' => '🧑‍✈️🛎️', 'str_more_menu' => 'More',
                              'more_menu_slot_1' => 'report', 'more_menu_slot_2' => 'none',
                              'more_menu_slot_3' => 'none'],
        // Same two, but with the hub's Print button on, which already makes the
        // toolbar 50px tall — the row the Front Desk button has to share.
        'guest-live-print' => ['guide_mode' => 'full', 'enable_detail_more_menu' => 'yes', 'enable_print' => 'yes',
                              'enable_popup_more_menu' => 'yes', 'enable_problem_report' => 'yes',
                              'problem_report_recipients' => 'host@example.test',
                              'more_button_label' => '🧑‍✈️🛎️', 'more_menu_slot_1' => 'report',
                              'more_menu_slot_2' => 'none', 'more_menu_slot_3' => 'none'],
        'guest-fd-print'  => ['guide_mode' => 'full', 'enable_detail_more_menu' => 'yes', 'enable_print' => 'yes',
                              'enable_popup_more_menu' => 'yes', 'enable_problem_report' => 'yes',
                              'problem_report_recipients' => 'host@example.test'],
        // One Print item: the direct button's other action path.
        'guest-fd-print-only' => ['guide_mode' => 'full', 'enable_detail_more_menu' => 'yes',
                              'more_menu_slot_1' => 'print', 'more_menu_slot_2' => 'none', 'more_menu_slot_3' => 'none'],
        // The eight live sections with the new icons: the release's own look.
        'live-sections'   => ['guide_mode' => 'full', 'enable_detail_more_menu' => 'yes',
                              'enable_popup_more_menu' => 'yes', 'enable_problem_report' => 'yes',
                              'problem_report_recipients' => 'host@example.test',
                              'guide_sections' => dccgg_live_sections(true),
                              'guide_items' => dccgg_live_items()],
        // The same eight still on their Font Awesome values, which must keep
        // rendering until the Director switches them over.
        'live-sections-fa' => ['guide_mode' => 'full', 'enable_detail_more_menu' => 'yes',
                              'enable_popup_more_menu' => 'yes', 'enable_problem_report' => 'yes',
                              'problem_report_recipients' => 'host@example.test',
                              'guide_sections' => dccgg_live_sections(false),
                              'guide_items' => dccgg_live_items()],
        // v0.24.0 Front Desk: the shipped defaults (Report alone) with the
        // report feature on, in the hub toolbar and every popup header.
        'guest-fd'        => ['guide_mode' => 'full', 'enable_detail_more_menu' => 'yes',
                              'enable_popup_more_menu' => 'yes', 'enable_problem_report' => 'yes',
                              'problem_report_recipients' => 'host@example.test'],
    ];
    return ($cases[$case] ?? $cases['public-intro']) + ['guide_sections' => $sections, 'guide_items' => $items];
}

if (PHP_SAPI === 'cli' && realpath($argv[0] ?? '') === __FILE__) {
    echo dccgg_render_guide(dccgg_guide_case($argv[1] ?? 'public-intro'));
}
