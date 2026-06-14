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
            'heading'           => __('Find your perfect cottage', 'dcc-cottage-selector'),
            'intro'             => __('All our cottages sleep two with a queen bed — here is what actually sets them apart. Answer a few quick questions and we will match you in seconds.', 'dcc-cottage-selector'),
            'mode_quick'        => __('Quick Pick', 'dcc-cottage-selector'),
            'mode_weights'      => __('What Matters Most', 'dcc-cottage-selector'),
            'mode_compare'      => __('Compare', 'dcc-cottage-selector'),
            'loading'           => __('Loading…', 'dcc-cottage-selector'),
            'unavailable'       => __('The cottage selector is temporarily unavailable.', 'dcc-cottage-selector'),

            // Quick Pick questions
            'q_desk'            => __('Do you need a desk for work?', 'dcc-cottage-selector'),
            'q_pullout'         => __('Do you want a pullout couch?', 'dcc-cottage-selector'),
            'q_layout'          => __('Studio or 1-bedroom?', 'dcc-cottage-selector'),
            'q_dining'          => __('Table for two or four?', 'dcc-cottage-selector'),
            'q_pet'             => __('Do you need a pet-friendly cottage?', 'dcc-cottage-selector'),
            'q_ground'          => __('Ground floor only?', 'dcc-cottage-selector'),
            'q_largest'         => __('Want the largest space available?', 'dcc-cottage-selector'),

            // Generic chip answers
            'opt_yes'           => __('Yes', 'dcc-cottage-selector'),
            'opt_no'            => __('No', 'dcc-cottage-selector'),
            'opt_either'        => __('No preference', 'dcc-cottage-selector'),
            'opt_studio'        => __('Studio', 'dcc-cottage-selector'),
            'opt_onebed'        => __('1-bedroom', 'dcc-cottage-selector'),
            'opt_seats2'        => __('Table for 2', 'dcc-cottage-selector'),
            'opt_seats4'        => __('Table for 4', 'dcc-cottage-selector'),

            // What Matters Most rows + 3-state toggle
            'w_intro'           => __('Tap to set how much each thing matters to you.', 'dcc-cottage-selector'),
            'w_workspace'       => __('Workspace', 'dcc-cottage-selector'),
            'w_moreroom'        => __('More room', 'dcc-cottage-selector'),
            'w_fewerstairs'     => __('Fewer stairs', 'dcc-cottage-selector'),
            'w_pet'             => __('Pet-friendly', 'dcc-cottage-selector'),
            'w_studio'          => __('Studio simplicity', 'dcc-cottage-selector'),
            'w_onebed'          => __('1-bedroom separation', 'dcc-cottage-selector'),
            'w_dining'          => __('Dining comfort', 'dcc-cottage-selector'),
            'w_pullout'         => __('Pullout couch flexibility', 'dcc-cottage-selector'),
            'lvl_low'           => __('Low', 'dcc-cottage-selector'),
            'lvl_med'           => __('Medium', 'dcc-cottage-selector'),
            'lvl_high'          => __('High', 'dcc-cottage-selector'),

            // Compare matrix row headers (the 7 differences)
            'diff_squareFeet'   => __('Size', 'dcc-cottage-selector'),
            'diff_layoutType'   => __('Layout', 'dcc-cottage-selector'),
            'diff_floorLevel'   => __('Floor', 'dcc-cottage-selector'),
            'diff_diningSeats'  => __('Dining table', 'dcc-cottage-selector'),
            'diff_desk'         => __('Desk / workspace', 'dcc-cottage-selector'),
            'diff_pulloutCouch' => __('Pullout couch', 'dcc-cottage-selector'),
            'diff_petAllowed'   => __('Pets', 'dcc-cottage-selector'),
            'val_sqft'          => /* translators: %d: square feet */ __('%d sq ft', 'dcc-cottage-selector'),
            'val_seats'         => /* translators: %d: number of seats */ __('Seats %d', 'dcc-cottage-selector'),
            'compare_prompt'    => __('Pick 2 to 4 cottages to compare side by side.', 'dcc-cottage-selector'),

            // Results
            'results_heading'   => __('Your top matches', 'dcc-cottage-selector'),
            'why_heading'       => __('Why this fits your trip', 'dcc-cottage-selector'),
            'view_cottage'      => __('View this cottage', 'dcc-cottage-selector'),
            'add_compare'       => __('Compare', 'dcc-cottage-selector'),
            'reset'             => __('Start over', 'dcc-cottage-selector'),
            'see_matches'       => __('See my matches', 'dcc-cottage-selector'),
            'rank_label'        => /* translators: %d: ranking position */ __('Ranked #%d for you', 'dcc-cottage-selector'),
            'dup_note'          => /* translators: %s: other cottage name */ __('Note: this cottage has an identical layout and features to %s.', 'dcc-cottage-selector'),

            // Empty state
            'empty_heading'     => __('No cottage meets every must-have', 'dcc-cottage-selector'),
            'empty_relax'       => /* translators: %s: name of the filter to relax */ __('Try relaxing “%s” — here are the closest options.', 'dcc-cottage-selector'),

            // Show why excluded
            'excluded_toggle'   => __('Why aren’t the others shown?', 'dcc-cottage-selector'),
            'ex_pet'            => /* translators: %s: cottage name */ __('%s hidden: not pet-friendly.', 'dcc-cottage-selector'),
            'ex_upstairs'       => /* translators: %s: cottage name */ __('%s hidden: upstairs.', 'dcc-cottage-selector'),
            'ex_dining'         => /* translators: %s: cottage name */ __('%s hidden: no table for four.', 'dcc-cottage-selector'),

            // Badges
            'badge_spacious'    => __('Spacious Retreat', 'dcc-cottage-selector'),
            'badge_work'        => __('Work-Friendly Hideaway', 'dcc-cottage-selector'),
            'badge_compact'     => __('Compact Escape', 'dcc-cottage-selector'),
            'badge_pet'         => __('Pet Stay Cottage', 'dcc-cottage-selector'),
            'badge_ground'      => __('Easy-Access Ground Floor', 'dcc-cottage-selector'),
            'badge_upstairs'    => __('Upstairs Quiet View', 'dcc-cottage-selector'),
            'badge_suite'       => __('Suite-Style Comfort', 'dcc-cottage-selector'),

            // "Why this fits" reason fragments (assembled by JS from data keys)
            'why_desk'          => __('a dedicated desk for getting work done', 'dcc-cottage-selector'),
            'why_space'         => __('the most square footage of the bunch', 'dcc-cottage-selector'),
            'why_pet'           => __('a warm welcome for your pet', 'dcc-cottage-selector'),
            'why_ground'        => __('easy ground-floor access, no stairs', 'dcc-cottage-selector'),
            'why_studio'        => __('a simple, open studio layout', 'dcc-cottage-selector'),
            'why_onebed'        => __('a separate bedroom for privacy', 'dcc-cottage-selector'),
            'why_dining'        => __('a dining table that seats four', 'dcc-cottage-selector'),
            'why_pullout'       => __('a pullout couch for an extra guest', 'dcc-cottage-selector'),
            'why_lead'          => __('Great because it offers', 'dcc-cottage-selector'),

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
    public static function build(array $string_overrides = [], array $extra = []): array
    {
        $strings = self::strings();
        foreach ($string_overrides as $key => $val) {
            if (is_string($val) && $val !== '' && array_key_exists($key, $strings)) {
                $strings[$key] = $val;
            }
        }

        return array_merge([
            'cottages'     => Data::all(),
            'diffFields'   => Data::DIFF_FIELDS,
            'strings'      => $strings,
            'startMode'    => 'quick',
            'enabledModes' => ['quick', 'weights', 'compare'],
            'remember'     => true,
            'highlight'    => '',
        ], $extra);
    }
}
