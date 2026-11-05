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
        //
        // v0.27.1: these were briefly renamed to Rob's own checkout titles, to
        // give the narrow-width-gap mutant a word at its track to break. It
        // does not work, and the reason is worth keeping. Measured at 320:
        // this harness lays the title track out at 82px in 20px type, where
        // the live page gives it 151px in 25px. That is a different type
        // scale, not a slightly narrower column, so 'Kitchenware' splits here
        // whatever the gap does, while on live it sits on one line. The
        // harness models the theme and its geometry is the model's, not the
        // property's — the same divergence as the Font Awesome width in the
        // kit block. The real guarantee is measured against the real pages by
        // tools/title-overlap.js instead.
        // v0.27.5: these two carry an ITEM EMOJI, which nothing in this
        // fixture did before — the only emoji in it was the emergency
        // section's. Every item in Rob's content has one, and pick A is
        // entirely about where it sits, so without one here all three of
        // its mutants survived with nothing to measure.
        ['_id' => 'c1', 'item_section' => 'checkout', 'item_title' => 'Strip the beds',
         'item_emoji' => '🛏',
         'item_content' => '<p>Leave them in the hamper.</p>', 'item_checkable' => 'yes'],
        ['_id' => 'c2', 'item_section' => 'checkout', 'item_title' => 'Lock the door',
         'item_emoji' => '🔑',
         'item_content' => '<p>Twice.</p>', 'item_checkable' => 'yes'],
        // v0.27.0: a paragraph of MORE THAN ONE SENTENCE. Without one in the
        // fixture, "a multi-sentence paragraph still reads left" passed
        // whether or not anything marked one — a test that can only pass.
        // v0.27.1: ONE LONG WORD, longer than the centre track can be at 320.
        // Without it nothing exercises hyphenation or the overflow backstop,
        // and the mutants for both pass by having nothing to break.
        ['_id' => 'c5', 'item_section' => 'checkout', 'item_title' => 'Troubleshooting',
         'item_content' => '<p>Ask the Front Desk.</p>', 'item_checkable' => 'yes'],
        ['_id' => 'c4', 'item_section' => 'checkout', 'item_title' => 'Bins',
         'item_content' => '<p>Wheel the bin to the kerb. Collection is Tuesday morning.</p>',
         'item_checkable' => 'yes'],
        // v0.25.1: pasted copy carries its own inline weight. An inline style
        // beats any author rule that is not !important, so this is the only
        // thing that exercises the !important on .dccgg-item-body — the host
        // inheriting 400 from the root cannot reach it.
        // v0.27.5: paragraph shapes for the blank-line rule. These began
        // life in 0.27.3 as "where does the multi-sentence paragraph sit",
        // for a rule Rob has since rejected; they are kept because what they
        // actually provide is items of three paragraphs and an item of one,
        // which is what the gap needs. In AMENITIES rather than checkout,
        // deliberately: checkout's item count is pinned by
        // app-shell.test.php ("11:00 AM · 5 steps"). Rob's rule is ANY paragraph, so WHERE the multi-sentence one
        // sits must not matter — first, middle or last, the whole item reads
        // left. The all-single item is the control: without it, a mutant that
        // simply left-aligns everything would pass.
        ['_id' => 'a1', 'item_section' => 'amenities', 'item_title' => 'Multi first',
         'item_content' => '<p>One. Two.</p><p>Only one here.</p><p>Also one.</p>'],
        ['_id' => 'a2', 'item_section' => 'amenities', 'item_title' => 'Multi middle',
         'item_content' => '<p>Only one here.</p><p>One. Two.</p><p>Also one.</p>'],
        ['_id' => 'a3', 'item_section' => 'amenities', 'item_title' => 'Multi last',
         'item_content' => '<p>Only one here.</p><p>Also one.</p><p>One. Two.</p>'],
        ['_id' => 'a4', 'item_section' => 'amenities', 'item_title' => 'All single',
         'item_content' => '<p>Only one here.</p><p>Also one.</p><p>And one.</p>'],
        // A LIST, because the rule counts list items too and nothing in this
        // fixture had one — the mutant that drops li from the query passed
        // with nothing to notice. The paragraph here is single-sentence, so
        // only the li can make this item read left.
        ['_id' => 'a5', 'item_section' => 'amenities', 'item_title' => 'Multi in a list',
         'item_content' => '<p>Short intro.</p><ul><li>One. Two.</li><li>Just one.</li></ul>'],
        // v0.27.5: a SINGLE line break inside a paragraph. Rob's "Where to
        // Launch" has six of them and they must not open a gap — the gap is
        // between sibling <p>s, and a <br> is not one. Without this item the
        // promise has nothing to be wrong about.
        // v0.27.6: TEMPLATE ITEMS. Their content is an Elementor template,
        // rendered verbatim, with no .dccgg-item-body anywhere in it — so
        // every text rule written before this release misses them. t1 holds
        // the shapes the live templates hold: prose, a real bulleted list,
        // and beside them a button, a nav menu and an iframe map that must
        // not follow the rule. t2's paragraph carries the template's OWN
        // inline style, which has to keep winning.
        ['_id' => 't1', 'item_section' => 'amenities', 'item_title' => 'From a template',
         'content_source' => 'template', 'item_template' => '77'],
        ['_id' => 't2', 'item_section' => 'amenities', 'item_title' => 'Template sets its own',
         'content_source' => 'template', 'item_template' => '99'],
        // v0.27.8: the two items that really do share one template on live —
        // "Amenities Map" and "Property Map" both render 9473. Both carry
        // enable_map too, because the DUPLICATE "View in Maps" link is what
        // the swap has to suppress, and an item without one cannot show it.
        ['_id' => 'm1', 'item_section' => 'amenities', 'item_title' => 'Amenities Map',
         'content_source' => 'template', 'item_template' => '55',
         'enable_map' => 'yes', 'map_url' => ['url' => 'https://www.google.com/maps/d/viewer?mid=1mnhrewsiRpXeD9f_AvolglnCbpvLylo']],
        ['_id' => 'm2', 'item_section' => 'map', 'item_title' => 'Property Map',
         'content_source' => 'template', 'item_template' => '55',
         'enable_map' => 'yes', 'map_url' => ['url' => 'https://www.google.com/maps/d/viewer?mid=1mnhrewsiRpXeD9f_AvolglnCbpvLylo']],
        // The control, and the reason the swap is gated on the SWAP rather
        // than on a title: "Where to Launch" is a maps SEARCH link on a
        // wysiwyg item. It must keep its own View in Maps button.
        // An item with "Map" IN ITS TITLE that is NOT a card, and the only
        // thing that can tell a gate keyed on the swap from one keyed on the
        // word "map". Without it, a mutant that strips the link from any
        // item whose title contains "map" behaves identically on this
        // fixture and survives.
        ['_id' => 'm4', 'item_section' => 'clubhouse', 'item_title' => 'Parking Map',
         'item_content' => '<p>Spaces are numbered to match the cottages.</p>',
         'enable_map' => 'yes', 'map_url' => ['url' => 'https://www.google.com/maps/search/parking']],
        ['_id' => 'm3', 'item_section' => 'canal', 'item_title' => 'Where to Launch',
         'item_content' => '<p>Public ramp at Wooton Park.</p>',
         'enable_map' => 'yes', 'map_url' => ['url' => 'https://www.google.com/maps/search/boat+launch']],
        ['_id' => 'a6', 'item_section' => 'amenities', 'item_title' => 'Line break inside',
         'item_content' => '<p>First line,<br>second line of the same sentence.</p>'],
        // v0.27.7: the three shapes the add-on is about, and none of them
        // existed in this fixture before.
        //
        // a7 — a line long enough to exceed the 520px cap at a desktop
        // width. Rob's own worst is "Key & Lock" at 647px on one line at
        // 1440; without a line of that order here the cap has nothing to
        // act on and a mutant that deletes it passes unnoticed.
        ['_id' => 'a7', 'item_section' => 'amenities', 'item_title' => 'A very long single line',
         'item_content' => '<p>The laundromat is open from eight in the morning '
            . 'until eight at night and takes quarters only, so bring change.</p>'],
        // a8 — EMPTY PARAGRAPHS, in the three spellings the guard accepts.
        // The two real ones on pages 4645 and 17685 have been removed at
        // source by the Website Director, so live carries none and only a
        // fixture can show the guard working.
        ['_id' => 'a8', 'item_section' => 'amenities', 'item_title' => 'Stray empty lines',
         'item_content' => '<p>Before the gap.</p><p>&nbsp;</p><p> </p><p><br></p>'
            . '<p>After the gap.</p>'],
        // a9 — content the cap must NOT touch. A table and an iframe are
        // wider than 520px by nature; the rule is an allow-list naming p,
        // ul and ol, so these are untouched because they were never matched.
        ['_id' => 'a9', 'item_section' => 'amenities', 'item_title' => 'A table and an embed',
         'item_content' => '<p>Rates below.</p>'
            // Wide ENOUGH to want more than the 520px cap on its own: a
            // table sizes to its content, so a narrow one would sit under
            // the cap whether the rule reached it or not, and the test
            // would be measuring the fixture instead of the rule. Measured
            // at 458px before this was lengthened.
            . '<table><tr><td>Washing machine</td><td>Two dollars in quarters</td>'
            . '<td>Open eight in the morning to eight at night</td>'
            . '<td>Quarters from the office</td><td>Beside the lower dock</td></tr></table>'
            . '<iframe src="https://dccgg.test/map" width="900" height="200"></iframe>'],
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
        'cottage_latitude' => 28.8005, 'cottage_longitude' => -81.7374,
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

/**
 * v0.26.0: the app shell, on top of the same eight live sections.
 *
 * Built from dccgg_all_on() rather than a fresh set, so the shell is measured
 * with every other feature switched on around it — which is the state page
 * 4645 is actually in, and the only way a layout change can be shown not to
 * have moved anything else.
 */
function dccgg_app_case(bool $public = false): array {
    // MotoPress's own check-in / check-out times, as this property keeps them.
    // Stay::property_times() reads the option when the MPHB accessor is not
    // there, which is exactly the harness's situation — so the clock path is
    // measured rather than skipped.
    $GLOBALS['options'] = ($GLOBALS['options'] ?? []) + [
        'mphb_check_in_time'  => '14:00',
        'mphb_check_out_time' => '11:00',
    ];
    $cfg = dccgg_all_on();
    $cfg['menu_layout'] = 'app';
    $cfg['guide_mode']  = $public ? 'public' : 'full';
    $cfg['app_hero_image'] = ['url' => 'https://dccgg.test/canal.jpg'];
    $cfg['app_hero_alt']   = 'The Dora Canal at the dock, with cypress trees reflected in still water.';
    $cfg['app_tab_guide_key'] = 'amenities';
    $cfg['app_tab_canal_key'] = 'canal';
    $cfg['app_map_url'] = ['url' => 'https://www.google.com/maps/d/viewer?mid=TEST', 'is_external' => true];
    // Two tiles carry an authored line; the rest fall back to the count, so
    // both halves of app_tile_summary() are exercised on one page.
    foreach ($cfg['guide_sections'] as &$sec) {
        if ($sec['section_key'] === 'internet')  { $sec['section_summary_noun'] = 'networks'; }
        if ($sec['section_key'] === 'checkout')  { $sec['section_summary_noun'] = 'steps'; }
        if ($sec['section_key'] === 'clubhouse') { $sec['section_summary'] = 'Coffee · Games'; }
        if ($sec['section_key'] === 'canal')     { $sec['section_summary'] = 'Slips · Launch'; }
    }
    unset($sec);
    // Two things dccgg_all_on() leaves that the LIVE guide does not have, and
    // that made v0.26.0's stills look broken when they were not: an Emergency
    // section with no icon (a blank sticker) and quick actions with no icon
    // (an empty circle on the tile). Checked against doracanalcourt.com/guest/
    // on 2026-11-01: it has no quick actions at all and no section without an
    // icon. The fixture now matches, so a still shows the guide and not the
    // fixture's gaps.
    foreach ($cfg['guide_sections'] as &$sec2) {
        if (($sec2['section_key'] ?? '') === 'emergency' && empty($sec2['section_icon'])) {
            $sec2['section_emoji']   = '🚨';
            $sec2['section_summary'] = 'Who To Call';
        }
        unset($sec2['enable_quick_action'], $sec2['quick_action_type'], $sec2['quick_action_val']);
    }
    unset($sec2);
    return $cfg;
}

/**
 * The app shell with nothing configured, on live-shaped sections.
 *
 * Deliberately NOT built from dccgg_all_on(): that fixture sets roles and
 * nouns, and the point here is a guide that sets neither.
 */
function dccgg_app_bare(): array {
    $GLOBALS['options'] = ($GLOBALS['options'] ?? []) + [
        'mphb_check_in_time'  => '14:00',
        'mphb_check_out_time' => '11:00',
    ];
    $spec = [
        ['internet',  'Internet'],
        ['amenities', 'Amenities'],
        ['clubhouse', 'Clubhouse'],
        ['canal',     'Boating / Fishing'],
        ['checkout',  'Checkout'],
        ['rules',     'Rules'],
        ['map',       'Map'],
        ['review',    'Review Us'],
    ];
    $sections = $items = [];
    foreach ($spec as $i => [$key, $title]) {
        $sections[] = ['_id' => 's_' . $key, 'section_key' => $key,
            'section_title' => $title, 'section_audience' => 'both',
            // Checkout is in checklist mode on live — measured 2026-11-01:
            // seven checkable items and a progress bar — and NO section role,
            // which is the whole point of this fixture.
            'checklist_mode' => $key === 'checkout' ? 'yes' : '',
            'section_icon' => ['value' => 'fas fa-circle', 'library' => 'fa-solid']];
        for ($n = 1; $n <= ($key === 'checkout' ? 3 : 2); $n++) {
            $items[] = ['_id' => 'i' . $i . $n, 'item_section' => $key,
                'item_title' => $title . ' ' . $n,
                'item_content' => '<p>Something about ' . $title . '.</p>']
                + ($key === 'checkout' ? ['item_checkable' => 'yes'] : []);
        }
    }
    return ['guide_mode' => 'full', 'menu_layout' => 'app',
        'cottage_latitude' => 28.8005, 'cottage_longitude' => -81.7374,
        'guide_sections' => $sections, 'guide_items' => $items,
        'enable_search' => 'yes', 'enable_problem_report' => 'yes',
        'problem_report_recipients' => 'host@example.test',
        'app_hero_image' => ['url' => 'https://dccgg.test/canal.jpg']];
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
        // v0.26.0: the app shell, full and public.
        'app'             => dccgg_app_case(false),
        'app-public'      => dccgg_app_case(true),
        // The approved A1 exactly: no Print button in the hub toolbar, which
        // the mockup does not have. Print is a host toggle, and this is the
        // state the stills are taken in.
        'app-a1'          => ['enable_print' => ''] + dccgg_app_case(false),
        // v0.26.1: the app layout on a guide configured the way the LIVE one
        // is — no section roles at all (measured on doracanalcourt.com/guest/
        // 2026-11-01: not one data-section-role in the page), no tab targets,
        // no tile nouns. This is what a fresh widget looks like, and it is
        // the state every fault the Director reported from staging came from.
        'app-bare'        => dccgg_app_bare(),
    ];
    return ($cases[$case] ?? $cases['public-intro']) + ['guide_sections' => $sections, 'guide_items' => $items];
}

if (PHP_SAPI === 'cli' && realpath($argv[0] ?? '') === __FILE__) {
    echo dccgg_render_guide(dccgg_guide_case($argv[1] ?? 'public-intro'));
}
