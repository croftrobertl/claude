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

/**
 * v0.24.4: every feature that puts a <button> on the page, at once.
 *
 * The focus audit must not work from a list someone remembered to update, so
 * it renders THIS and enumerates what is actually in the DOM. Any button added
 * later shows up in the audit the moment its feature is switched on here.
 */
function dccgg_all_on(): array {
    $sections = dccgg_live_sections(true);
    foreach ($sections as &$sec) {
        // Checkout carries the review prompt; its two buttons hang off the role.
        if ($sec['section_key'] === 'checkout') {
            $sec['section_role'] = 'checkout';
            $sec['checklist_mode'] = 'yes';          // brings the Reset button
        }
        // The quick action hangs off the SECTION, not the item.
        if ($sec['section_key'] === 'amenities') {
            $sec['enable_quick_action'] = 'yes';
            $sec['quick_action_type']   = 'copy';
            $sec['quick_action_val']    = '4321';
        }
        if ($sec['section_key'] === 'clubhouse') {
            $sec['enable_quick_action'] = 'yes';
            $sec['quick_action_type']   = 'link';     // the <a> variant
            $sec['quick_action_val']    = 'https://dccgg.test/clubhouse';
        }
        // v0.25.0: both of these are SECTION keys, not widget keys, and both
        // drive a per-element chunk — without them the conditions card and the
        // wizard never render and their chunks go unmeasured.
        if ($sec['section_key'] === 'canal')  { $sec['show_conditions_card'] = 'yes'; }
        if ($sec['section_key'] === 'rules')  { $sec['wizard_mode'] = 'yes'; }
    }
    unset($sec);
    $sections[] = ['_id' => 's_emergency', 'section_key' => 'emergency',
        'section_title' => 'Emergency', 'section_audience' => 'guest',
        'section_role' => 'emergency'];
    $items = [
        // Wi-Fi: the Show / Copy pair, masked.
        ['_id' => 'w1', 'item_section' => 'internet', 'item_title' => 'Wi-Fi password',
         'item_content' => '<p>Join the network.</p>', 'item_copy' => 'yes',
         'item_copy_value' => 'DCC32586', 'item_mask_value' => 'yes',
         'item_wifi_mode' => 'yes', 'wifi_ssid' => 'topoftheworld'],
        // A plain copy row: Copy without the mask, so .dccgg-copy appears alone.
        ['_id' => 'w2', 'item_section' => 'internet', 'item_title' => 'Guest network',
         'item_content' => '<p>No password.</p>', 'item_copy' => 'yes',
         'item_copy_value' => 'dcc-guest'],
        // Checkable, so the checklist and its Reset render.
        ['_id' => 'c1', 'item_section' => 'checkout', 'item_title' => 'Strip the beds',
         'item_content' => '<p>Leave them in the hamper.</p>', 'item_checkable' => 'yes'],
        ['_id' => 'c2', 'item_section' => 'checkout', 'item_title' => 'Lock the door',
         'item_content' => '<p>Twice.</p>', 'item_checkable' => 'yes'],
        // v0.25.1: pasted copy carries its own inline weight. An inline style
        // beats any author rule that is not !important, so this is the only
        // thing that exercises the !important on .dccgg-item-body — the host
        // inheriting 400 from the root cannot reach it.
        ['_id' => 'c3', 'item_section' => 'checkout', 'item_title' => 'Pasted from an email',
         'item_content' => '<p style="font-weight:700">Someone pasted this in bold.</p>'],
        // Long enough to collapse, so Read more renders.
        ['_id' => 'r1', 'item_section' => 'rules', 'item_title' => 'House rules',
         'enable_read_more' => 'yes',
         'item_content' => '<p>' . str_repeat('Quiet hours run from ten at night until eight in the morning. ', 24) . '</p>'],
        // A quick action with a copyable value.
        ['_id' => 'q1', 'item_section' => 'amenities', 'item_title' => 'Gate code',
         'item_content' => '<p>At the north gate.</p>'],
        // A gallery, for the thumbnails and the lightbox.
        ['_id' => 'g1', 'item_section' => 'clubhouse', 'item_title' => 'Photos',
         'item_content' => '<p>Have a look.</p>', 'media_type' => 'gallery',
         'item_gallery' => [['id' => 0, 'url' => 'https://dccgg.test/a.jpg'],
                            ['id' => 0, 'url' => 'https://dccgg.test/b.jpg']]],
        // A video, for the poster button.
        ['_id' => 'v1', 'item_section' => 'map', 'item_title' => 'Tour', 'media_type' => 'video',
         'item_content' => '<p>Two minutes.</p>', 'item_video' => 'https://www.youtube.com/watch?v=aaaaaaaaaaa'],
        ['_id' => 'e1', 'item_section' => 'emergency', 'item_title' => 'Front desk',
         'item_content' => '<p>Call us.</p>'],
    ];
    return ['guide_mode' => 'full',
        'cottage_latitude' => 28.8028, 'cottage_longitude' => -81.6448,
        'guide_sections' => $sections, 'guide_items' => $items,
        'enable_search' => 'yes', 'enable_ai_search' => 'yes',
        'enable_print' => 'yes', 'enable_emergency_fab' => 'yes',
        // enable_fab is deliberately OFF: it collapses the hub behind a
        // launcher, so the sections cannot be opened. .dccgg-fab and
        // .dccgg-fab-close are covered by the class sweep instead.
        'enable_section_nav' => 'yes', 'enable_read_more' => 'yes',
        'enable_quick_action' => 'yes', 'enable_map' => 'yes',
        'enable_video_thumbnails' => 'yes', 'enable_conditions_extras' => 'yes',
        'show_conditions_card' => 'yes', 'show_theme_toggle' => 'yes',
        'enable_problem_report' => 'yes', 'enable_per_item_report' => 'yes',
        'problem_report_recipients' => 'host@example.test',
        'enable_checkout_review' => 'yes',
        'enable_detail_more_menu' => 'yes', 'enable_popup_more_menu' => 'yes',
        'more_menu_slot_1' => 'report', 'more_menu_slot_2' => 'print',
        'more_menu_slot_3' => 'save_pdf'];
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
        // v0.24.4: every feature that renders a <button>, so the focus audit
        // can enumerate the real set instead of a hand-kept list.
        'all-on'          => dccgg_all_on(),
    ];
    return ($cases[$case] ?? $cases['public-intro']) + ['guide_sections' => $sections, 'guide_items' => $items];
}

if (PHP_SAPI === 'cli' && realpath($argv[0] ?? '') === __FILE__) {
    echo dccgg_render_guide(dccgg_guide_case($argv[1] ?? 'public-intro'));
}
