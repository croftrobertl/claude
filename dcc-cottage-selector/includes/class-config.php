<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Builds the JSON config handed to the browser via the root element's
 * data-config attribute. ALL user-facing copy lives here (translatable), keyed
 * by stable keys — the JS engine operates only on data keys and never holds
 * display strings, satisfying the "zero hardcoded business-logic strings" rule.
 */
final class Config
{
    /**
     * Default English strings, every one translatable so Loco can localize them.
     *
     * @return array<string,string>
     */
    public static function strings(): array
    {
        return [
            // Shell / modes
            // 0.53.1 (Rob, Part D): every string below that the live widgets show
            // from the site preset now carries the SAME text here, so a blind install,
            // the [dcc_selector_entry] shortcode (which has no preset) and a cleared
            // field all show what live shows. Twelve differed; a PHP test now fails if
            // a preset str_ value and its packaged string ever drift apart again.
            'heading'           => __('Cottage Wizard', 'dcc-cottage-selector'),
            /* The one line above the mode buttons (0.53.1, Rob), also shown above the Mini
               Entry's "Cottage Wizard" button. A sentence, so sentence case. */
            'intro'             => __('Answer a few questions to find your best match, or select cottages to compare side by side.', 'dcc-cottage-selector'),
            /* The line above the Mini Entry's "Cottage Wizard" button on cottage pages
               (0.53.2, Rob). Its OWN text, not the pop-up's intro: mirroring never
               touches it. A sentence, so sentence case. */
            'entry_line'        => __('Use the Cottage Wizard below to compare cottages or find your best match.', 'dcc-cottage-selector'),
            'mode_quick'        => __('Matching Quiz', 'dcc-cottage-selector'),
            'mode_weights'      => __('Weigh Priorities', 'dcc-cottage-selector'),
            'mode_compare'      => __('Compare Mode', 'dcc-cottage-selector'),
            /* The comparison pop-up's title. Was mode_compare until 0.53.0; split out when
               the mode was renamed "Compare Mode", because the pop-up also opens from the
               Matching Quiz's results and is a comparison, not a mode. */
            'compare_title'     => __('Compare', 'dcc-cottage-selector'),
            /* Accessible name of the mode-menu button: it must say which mode is current
               and contain the visible label (WCAG 2.5.3). %s: the current mode's name. */
            'mode_current'      => /* translators: %s: name of the mode in use, e.g. Matching Quiz */ __('Current mode: %s', 'dcc-cottage-selector'),
            'name_format'       => /* translators: %1$s: cottage number, %2$s: cottage name */ __('Cottage %1$s: %2$s', 'dcc-cottage-selector'),
            'match_count'       => /* translators: %d: number of matching cottages (2+) */ __('%d cottages match', 'dcc-cottage-selector'),
            'match_count_one'   => /* translators: %d: number of matching cottages (always 1) */ __('%d cottage matches', 'dcc-cottage-selector'),
            'count_zero_hint'   => __('Your closest matches are shown at the end.', 'dcc-cottage-selector'),
            'sr_top_match'      => /* translators: %s: cottage name */ __('Top match: %s', 'dcc-cottage-selector'),
            'loading'           => __('Loading…', 'dcc-cottage-selector'),
            'unavailable'       => __('The cottage selector is temporarily unavailable.', 'dcc-cottage-selector'),

            // Quick Pick questions
            'q_party'           => __('How many guests will there be?', 'dcc-cottage-selector'),
            // Short label for the party-size row on the review screen. (The compare
            // matrix's "Sleeps (max)" caption was borrowed for this before 0.23.0 and
            // read oddly as a question topic.)
            'party_short'       => __('Guests', 'dcc-cottage-selector'),
            'q_dates'           => __('When were you thinking of staying?', 'dcc-cottage-selector'),
            'dates_short'       => __('Dates', 'dcc-cottage-selector'),
            'dates_in'          => __('Check-In', 'dcc-cottage-selector'),
            'dates_out'         => __('Check-Out', 'dcc-cottage-selector'),
            'dates_skip'        => __('Not Sure Yet', 'dcc-cottage-selector'),
            'dates_none'        => __('No Dates Yet', 'dcc-cottage-selector'),
            'dates_hint'        => __('Optional. Give us dates and we will only recommend cottages that are free.', 'dcc-cottage-selector'),
            'dates_invalid'     => __('Check-out must be after check-in.', 'dcc-cottage-selector'),
            'q_desk'            => __('Do you need a computer desk?', 'dcc-cottage-selector'),
            'q_pullout'         => __('What about a pull-out couch?', 'dcc-cottage-selector'),
            'q_layout'          => __('Which layout: studio or 1-bedroom?', 'dcc-cottage-selector'),
            'q_pet'             => __('Do you need a pet-friendly cottage?', 'dcc-cottage-selector'),
            'q_ground'          => __('Do you need ground floor only?', 'dcc-cottage-selector'),
            'q_screenedporch'   => __('Do you prefer a private, screened-in porch?', 'dcc-cottage-selector'),

            // Wizard flow
            'wiz_progress'      => /* translators: %1$d: current step, %2$d: total steps */ __('Step %1$d of %2$d', 'dcc-cottage-selector'),
            'wiz_back'          => __('Back', 'dcc-cottage-selector'),
            'wiz_next'          => __('Next', 'dcc-cottage-selector'),
            'next_hint'         => __('Choose an answer to continue', 'dcc-cottage-selector'),
            'review_heading'    => __('Review Your Answers', 'dcc-cottage-selector'),
            'edit'              => __('Edit', 'dcc-cottage-selector'),
            'edit_answers'      => __('Edit Answers', 'dcc-cottage-selector'),
            // Title Case is carried by the STRING now, not by a text-transform:
            // the site button spec sets text-transform:none (0.27.0), so whatever
            // is stored here is what renders.
            'compare_btn'       => /* translators: %d: number of cottages selected */ __('Compare %d Cottages', 'dcc-cottage-selector'),

            // No-match "what it misses" tags
            'tag_pet'           => __('Not Pet-Friendly', 'dcc-cottage-selector'),
            'tag_upstairs'      => __('Upstairs', 'dcc-cottage-selector'),
            'tag_dining'        => __('No table for 4', 'dcc-cottage-selector'),
            'tag_porch'         => __('No Screened Porch', 'dcc-cottage-selector'),
            'tag_desk'          => __('No Desk', 'dcc-cottage-selector'),
            'tag_pullout'       => __('No Pull-Out Couch', 'dcc-cottage-selector'),
            'tag_studio'        => __('Not a Studio', 'dcc-cottage-selector'),
            'tag_onebed'        => __('Not a 1-Bedroom', 'dcc-cottage-selector'),
            'tag_moreroom'      => __('Less Square Footage', 'dcc-cottage-selector'),
            'tag_party'         => __('Sleeps 2 Max', 'dcc-cottage-selector'),

            // Generic chip answers
            'opt_yes'           => __('Yes', 'dcc-cottage-selector'),
            'opt_no'            => __('No', 'dcc-cottage-selector'),
            'opt_either'        => __('Skip', 'dcc-cottage-selector'),
            'opt_studio'        => __('Studio', 'dcc-cottage-selector'),
            'opt_onebed'        => __('1-Bedroom', 'dcc-cottage-selector'),
            'opt_party2'        => __('1-2', 'dcc-cottage-selector'),
            'opt_party34'       => __('3-4', 'dcc-cottage-selector'),

            // What Matters Most rows + 3-state toggle
            'w_question'        => /* translators: %s: a priority, e.g. "Workspace" */ __('How much does %s matter?', 'dcc-cottage-selector'),
            'w_workspace'       => __('Deskspace', 'dcc-cottage-selector'),
            'w_moreroom'        => __('More Room', 'dcc-cottage-selector'),
            'w_fewerstairs'     => __('No Stairway', 'dcc-cottage-selector'),
            'w_pet'             => __('Pet-Friendly', 'dcc-cottage-selector'),
            'w_studio'          => __('Studio Simplicity', 'dcc-cottage-selector'),
            'w_onebed'          => __('1-Bedroom Separation', 'dcc-cottage-selector'),
            'w_dining'          => __('4+ Dining Comfort', 'dcc-cottage-selector'),
            'w_pullout'         => __('Pull-Out Couch Flexibility', 'dcc-cottage-selector'),
            'w_screenedporch'   => __('Private, Screened-In Porch', 'dcc-cottage-selector'),
            'w_party'           => __('Room for 3-4 Guests', 'dcc-cottage-selector'),
            'lvl_low'           => __('Low', 'dcc-cottage-selector'),
            'lvl_med'           => __('Medium', 'dcc-cottage-selector'),
            'lvl_high'          => __('High', 'dcc-cottage-selector'),

            // Compare matrix row headers
            'diff_guests'       => __('Sleeps (Max)', 'dcc-cottage-selector'),
            'diff_bed'          => __('Bed', 'dcc-cottage-selector'),
            'diff_squareFeet'   => __('Size', 'dcc-cottage-selector'),
            'diff_layoutType'   => __('Layout', 'dcc-cottage-selector'),
            'diff_floorLevel'   => __('Floor', 'dcc-cottage-selector'),
            'diff_diningSeats'  => __('Dining Table', 'dcc-cottage-selector'),
            'diff_desk'         => __('Desk / Workspace', 'dcc-cottage-selector'),
            'diff_pulloutCouch' => __('Pull-Out Couch', 'dcc-cottage-selector'),
            'diff_screenedPorch' => __('Screened Porch', 'dcc-cottage-selector'),
            'diff_petAllowed'   => __('Pets', 'dcc-cottage-selector'),
            'val_sqft'          => /* translators: %d: square feet */ __('%d sq ft', 'dcc-cottage-selector'),
            'val_seats'         => /* translators: %d: number of seats */ __('Seats %d', 'dcc-cottage-selector'),
            'val_queen'         => __('Queen', 'dcc-cottage-selector'),
            'floor_ground'      => __('Ground Floor', 'dcc-cottage-selector'),
            'floor_second'      => __('Second Floor', 'dcc-cottage-selector'),
            'compare_prompt'    => __('Pick 2+ cottages to compare their features side by side.', 'dcc-cottage-selector'),
            'compare_need_two'  => __('Tip: check at least 2 cottages, then tap “Compare”.', 'dcc-cottage-selector'),
            'cmp_range'         => /* translators: %1$d-%2$d of %3$d cottages */ __('Showing %1$d-%2$d of %3$d', 'dcc-cottage-selector'),
            'cmp_prev'          => __('Previous cottages', 'dcc-cottage-selector'),
            'cmp_next'          => __('Next cottages', 'dcc-cottage-selector'),

            // Results
            'results_heading'   => __('Your Top Matches', 'dcc-cottage-selector'),
            'view_cottage'      => __('View Cottage', 'dcc-cottage-selector'),
            /* The narrow-screen form of view_cottage. Both ship in the markup and CSS
               picks one, so a full-page cache can serve the same HTML to every device. */
            'view_cottage_short' => __('View', 'dcc-cottage-selector'),
            /* Appended to every View link's aria-label: the link opens in a new tab
               (0.51.0) and says so to a screen reader. It is NOT visible text — the
               explicit aria-label replaces the link's content as its accessible name,
               so a visually hidden span inside the link would never be announced. */
            'opens_new_tab'     => __('(opens in a new tab)', 'dcc-cottage-selector'),
            'add_compare'       => __('Compare', 'dcc-cottage-selector'),
            'reset'             => __('Restart', 'dcc-cottage-selector'),
            'see_matches'       => __('Submit', 'dcc-cottage-selector'),
            'rank_label'        => /* translators: %d: ranking position */ __('Ranked #%d for You', 'dcc-cottage-selector'),
            'dup_note'          => /* translators: %s: list of cottage numbers, e.g. "35 & 36" */ __('Note: Cottages %s have identical layouts & features', 'dcc-cottage-selector'),

            // Empty state
            'empty_heading'     => __('No Perfect Matches', 'dcc-cottage-selector'),
            'empty_sub'         => __('Your next best matches are below. Changing the choices in red will bring more matches.', 'dcc-cottage-selector'),
            'empty_sub_one'     => __('Your next best match is below. Changing the choices in red will bring more matches.', 'dcc-cottage-selector'),

            // Badges — factual labels describing what each badge actually marks.
            'badge_spacious'    => __('Layout: 1-Bedroom', 'dcc-cottage-selector'),
            'badge_work'        => __('Work Desk', 'dcc-cottage-selector'),
            'badge_compact'     => __('Layout: Studio', 'dcc-cottage-selector'),
            'badge_pet'         => __('Pet-Friendly', 'dcc-cottage-selector'),
            'badge_ground'      => __('Ground Floor', 'dcc-cottage-selector'),
            'badge_upstairs'    => __('Upstairs', 'dcc-cottage-selector'),
            'badge_suite'       => __('1-Bedroom Suite', 'dcc-cottage-selector'),
            'badge_porch'       => __('Screened Porch', 'dcc-cottage-selector'),

            // "Why this fits" reason fragments (assembled by JS from data keys)
            'why_desk'          => __('a dedicated desk for getting work done', 'dcc-cottage-selector'),
            'why_space'         => __('the most square footage of the bunch', 'dcc-cottage-selector'),
            'why_pet'           => __('a warm welcome for your pet', 'dcc-cottage-selector'),
            'why_ground'        => __('easy ground-floor access, no stairs', 'dcc-cottage-selector'),
            'why_studio'        => __('a simple, open studio layout', 'dcc-cottage-selector'),
            'why_onebed'        => __('a separate bedroom for privacy', 'dcc-cottage-selector'),
            'why_dining'        => __('a dining table that seats four', 'dcc-cottage-selector'),
            'why_pullout'       => __('a pull-out couch for two extra guests', 'dcc-cottage-selector'),
            'why_party'         => __('room for up to four (the extra two on a pull-out couch, for a nightly fee)', 'dcc-cottage-selector'),
            'why_porch'         => __('a private screened-in porch', 'dcc-cottage-selector'),
            'why_lead'          => __('Great because it offers', 'dcc-cottage-selector'),

            // Informational notes under the party-size / pet questions. No fee
            // amounts anywhere in this plugin (single source of truth elsewhere).
            'capacity_note'     => __('Guests 1-2 are included in the nightly rate and will have a queen bed. Guests 3-4 will have a pull-out couch and be charged a nightly fee.', 'dcc-cottage-selector'),
            'pet_note'          => __('Pets are only allowed in Cottage 34 and must be pre-approved.', 'dcc-cottage-selector'),
            'fee_link'          => __('Fee Details', 'dcc-cottage-selector'),

            // Availability, when the guest supplied dates (see assets/js/availability.js)
            'avail_yes'         => __('Available for Your Dates', 'dcc-cottage-selector'),
            'avail_no'          => __('Booked for Your Dates', 'dcc-cottage-selector'),
            'avail_calendar'    => __('See Open Dates', 'dcc-cottage-selector'),
            'avail_checking'    => __('Checking availability…', 'dcc-cottage-selector'),
            'avail_error'       => __('We could not check availability just now — these are ranked without it.', 'dcc-cottage-selector'),
            'avail_none_free'   => __('None of your matches are free for those dates. They are listed below so you can pick other dates.', 'dcc-cottage-selector'),
            // share_btn / share_done / share_fail were removed in 0.31.0 with the
            // Share button. Deep links still work; nothing produces one any more.

            // Misc value labels
            'val_yes'           => __('Yes', 'dcc-cottage-selector'),
            'val_no'            => __('No', 'dcc-cottage-selector'),
        ];
    }

    /**
     * Assemble the full config object for data-config.
     *
     * @param array<string,string> $string_overrides Elementor string-control values keyed by string key.
     * @param array<string,mixed>  $extra            Additional top-level config (startMode, enabledModes, highlight, selectorUrl, modal).
     * @return array<string,mixed>
     */
    /**
     * The site-wide 3-4 guest switch (option dcc_guest34_enabled). DCC Custom
     * Checkout WRITES it — '1' for on, '' for off — and this plugin only READS it,
     * directly, so it never depends on Checkout being active.
     *
     * THIS READER MUST AGREE WITH CHECKOUT'S CHARACTER FOR CHARACTER (Checkout's
     * Config::guest34_enabled() says so too). ON only when the option is ABSENT,
     * '1' or 1; everything else — '', '0', 0, 'yes', 'no', true — is OFF.
     * 0.43.0-0.49.0 used (bool), which read 'yes'/'no'/'false'/'off' as ON; no
     * live value was affected ('1' and '' read the same either way), but two
     * readers of one switch that disagree on any input are a bug waiting for a
     * writer to change. No filter hook: Checkout is dropping its own, and a hook
     * here would let a third party make the two disagree.
     *
     * Deliberately NOT part of the design snapshot: site-wide, read afresh on
     * every render, never frozen into a published design.
     */
    public static function guest34_enabled(): bool
    {
        if (!function_exists('get_option')) {
            return true;
        }
        $raw = get_option('dcc_guest34_enabled', null);
        return ($raw === null) || ($raw === '1') || ($raw === 1);
    }

    public static function build(array $string_overrides = [], array $extra = []): array
    {
        $strings = self::strings();
        foreach ($string_overrides as $key => $val) {
            if (is_string($val) && $val !== '' && array_key_exists($key, $strings)) {
                $strings[$key] = $val;
            }
        }

        // These defaults must mirror the widget's own defaults (see
        // Selector_Widget::design_snapshot()). Callers that build a config WITHOUT a
        // widget — notably the [dcc_selector_entry] shortcode's pop-up — would
        // otherwise omit the keys entirely, and selector.js reads a missing key as
        // "on" (`config.showReview !== false`). That silently gave the shortcode
        // pop-up the review step the widget skips. $extra still overrides both.
        // Site-wide defaults come from the settings page (Settings::get() falls
        // back to Settings::defaults(), which reproduces the literals that used to
        // sit here). $extra — a widget's own deliberate overrides — still wins.
        $st = Settings::get();

        $config = array_merge([
            'cottages'     => Data::all(),
            'diffFields'   => Data::DIFF_FIELDS,
            'strings'      => $strings,
            // Site-wide 3-4 guest switch; false drops the party question entirely.
            'guest34'      => self::guest34_enabled(),
            'startMode'    => $st['start_mode'],
            'enabledModes' => $st['enabled_modes'],
            'highlight'    => '',
            'showHeading'  => (bool) $st['show_heading'],
            'showReview'   => (bool) $st['show_review'],
            'showCompareTip' => (bool) $st['show_compare_tip'],
            'capacityFeeUrl' => $st['capacity_fee_url'],
            'petFeeUrl'      => $st['pet_fee_url'],
            // How many matches the results screen lists, how many badges a card
            // carries, and how many "why this fits" reasons it may show. These were
            // hard-coded 3s in the JS until 0.44.0.
            'resultsCount' => (int) $st['results_count'],
            'badgesMax'    => (int) $st['badges_max'],
            'reasonsMax'   => (int) $st['reasons_max'],
            // Availability lookup. Disabled unless it is turned on: the check
            // is the ONLY runtime request this plugin makes, and it depends on the
            // MPHB Availability Calendar plugin being active to answer it.
            'availability'   => $site_avail = [
                'enabled'     => (bool) $st['avail_enable'],
                // The endpoint is computed HERE, not by the widget: a widget that
                // inherits "enabled" must still get a URL to call.
                'ajaxUrl'     => function_exists('admin_url') ? admin_url('admin-ajax.php') : '',
                'action'      => $st['avail_action'],
                'calendarUrl' => $st['avail_calendar_url'],
                'maxNights'   => (int) $st['avail_max_nights'],
            ],
        ], $extra);

        // A widget's availability override is PARTIAL (only the sub-keys it set), so
        // merge it over the site block sub-key by sub-key rather than replacing it —
        // array_merge above replaced the whole block.
        if (isset($extra['availability']) && is_array($extra['availability'])) {
            $config['availability'] = array_merge($site_avail, $extra['availability']);
        }
        // A widget may set an opening mode while inheriting the mode set (or the
        // reverse); resolve the pair against what is EFFECTIVELY enabled.
        if (!is_array($config['enabledModes']) || $config['enabledModes'] === []) {
            $config['enabledModes'] = $st['enabled_modes'];
        }
        if (!in_array($config['startMode'], $config['enabledModes'], true)) {
            $config['startMode'] = $config['enabledModes'][0];
        }

        // 0.26.0 merged Heading_Marks::all() in here so the drawn cottage/heron
        // marks flanked the heading. 0.29.0 retired them — see the note at the top
        // of class-heading-marks.php. The class is deliberately left in the repo,
        // unreferenced: the drawing notes in it are the useful part.
        return $config;
    }
}
