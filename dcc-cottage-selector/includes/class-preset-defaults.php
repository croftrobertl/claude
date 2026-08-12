<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Site preset: the Elementor control defaults a NEW widget instance starts from.
 *
 * These values were captured from the live doracanalcourt.com configuration so a
 * freshly dropped Cottage Selector / Mini Entry already matches the site design
 * instead of the generic factory look.
 *
 * IMPORTANT — how this interacts with saved widgets:
 * Elementor merges a widget's SAVED settings over its control defaults, and saved
 * values always win. Changing a default therefore only affects keys a widget has
 * never stored, which is why existing instances keep rendering exactly as before.
 * Every key below was present in the captured export, so the widget it came from
 * has its own saved value for it.
 *
 * Deliberately NOT preset (instance-specific wiring, see readme):
 *   share_design / design_name  — would make every new Selector publish itself as
 *                                 the shared design source and clobber the registry.
 *   mirror_source               — points at one specific named design.
 *   current / selector_url      — identify a particular cottage / page.
 */
final class Preset_Defaults
{
    /**
     * Control id => default value.
     *
     * @return array<string,mixed>
     */
    public static function map(): array
    {
        return [
            // ---- Content ----
            'copy' => '🏠 Cottage Wizard 🧙‍♂️',
            'enabled_modes' => ['quick', 'compare'],

            // ---- Text & labels ----
            'str_compare_need_two' => 'Tip: check at least 2 cottages, then tap “Compare”.',
            'str_compare_prompt' => 'Select 2+ cottages to compare side by side.',
            'str_compare_scroll_all' => 'Scroll the list to see all %d cottages.',
            'str_count_zero_hint' => 'Your closest matches are shown at the end.',
            'str_edit_answers' => 'Edit Answers',
            'str_heading' => 'Cottage Wizard',
            'str_intro' => 'Answer a few quick questions to find your best match.',
            'str_lvl_high' => 'High',
            'str_lvl_low' => 'Low',
            'str_lvl_med' => 'Medium',
            'str_mode_compare' => 'Compare',
            'str_mode_quick' => 'Matching Quiz',
            'str_mode_weights' => 'Weigh Priorities',
            'str_opt_either' => 'No Preference',
            'str_opt_no' => 'No',
            'str_opt_onebed' => '1-Bedroom',
            'str_opt_seats2' => 'Table for 2',
            'str_opt_seats4' => 'Table for 4',
            'str_opt_studio' => 'Studio',
            'str_opt_yes' => 'Yes',
            'str_q_desk' => 'Do you need a computer desk?',
            'str_q_dining' => 'Do you need a dining table for 2 or 4?',
            'str_q_layout' => 'Which layout do you prefer: studio or 1-bedroom?',
            'str_q_pet' => 'Do you need a pet-friendly cottage?',
            'str_q_pullout' => 'Do you need a pull-out couch?',
            'str_q_screenedporch' => 'Do you prefer a private, screened-in porch?',
            'str_reset' => 'Restart',
            'str_results_heading' => 'Your top matches',
            'str_review_heading' => 'Review your answers',
            'str_view_cottage' => 'View Cottage',
            'str_w_dining' => '4+ dining comfort',
            'str_w_fewerstairs' => 'No stairway',
            'str_w_moreroom' => 'More room',
            'str_w_onebed' => '1-bedroom separation',
            'str_w_pet' => 'Pet-friendly',
            'str_w_pullout' => 'Pullout couch flexibility',
            'str_w_question' => 'How much does %s matter?',
            'str_w_screenedporch' => 'Private, screened-in porch',
            'str_w_studio' => 'Studio simplicity',
            'str_w_workspace' => 'Deskspace',

            // ---- Icons ----
            'icon_back' => ['value' => 'fas fa-arrow-left', 'library' => 'fa-solid'],
            'icon_edit_answers' => ['value' => 'fas fa-edit', 'library' => 'fa-solid'],
            'icon_mode_compare' => ['value' => 'fas fa-object-ungroup', 'library' => 'fa-solid'],
            'icon_mode_quick' => ['value' => 'fas fa-list-ol', 'library' => 'fa-solid'],
            'icon_mode_weights' => ['value' => 'fas fa-balance-scale', 'library' => 'fa-solid'],
            'icon_next' => ['value' => 'fas fa-arrow-right', 'library' => 'fa-solid'],
            'icon_restart' => ['value' => 'fas fa-undo', 'library' => 'fa-solid'],
            'icon_submit' => ['value' => 'fas fa-check', 'library' => 'fa-solid'],

            // ---- Palette (Colors section) ----
            'color_accent' => '#002E7A',
            'color_accent_text' => '#FFFFFF',
            'color_bg' => '#FFFFFF',
            'color_border' => '#F4DA62',
            'color_btn_bg_hover' => '#F08080',
            'color_diff' => '#F4DA62',
            'color_item_bg' => '#FFFFFF',
            'color_item_bg_hover' => '#F08080',
            'color_item_text' => '#000000',
            'color_item_text_hover' => '#FFFFFF',
            'color_muted' => '#000000',
            'color_text' => '#000000',

            // ---- Per-element styles ----
            'chip_bg_active' => '#002E7A',
            'chip_bg_hover' => '#F08080',
            'chip_border_active' => '#F4DA62',
            'chip_color_active' => '#FEFEFE',
            'chip_color_hover' => '#FFFFFF',
            'cmpmenu_panel_radius' => ['unit' => 'px', 'size' => 15, 'sizes' => []],
            'dot_height' => ['unit' => 'px', 'size' => 10, 'sizes' => []],
            'heading_color' => '#000000',
            'intro_color' => '#002E7A',
            'matrix_head_bg' => '#020101',
            'mode_item_padding' => ['unit' => 'px', 'top' => '0', 'right' => '0', 'bottom' => '0', 'left' => '0', 'isLinked' => false],
            'mode_item_radius' => ['unit' => 'px', 'size' => 0, 'sizes' => []],
            'mode_panel_radius' => ['unit' => 'px', 'size' => 25, 'sizes' => []],
            'mode_trigger_radius' => ['unit' => 'px', 'size' => 25, 'sizes' => []],
            'modetab_bg' => '#FFFFFF',
            'modetab_bg_active' => '#002E7A',
            'modetab_color' => '#000000',
            'modetab_color_active' => '#FFFFFF',
            'progress_label_color' => '#000000',
            'question_color' => '#000000',
            'style_comparebtn_bg' => '#002E7A',
            'style_comparebtn_bg_hover' => '#F08080',
            'style_comparebtn_color' => '#FFFFFF',
            'style_comparebtn_color_hover' => '#FCFCFC',
        ];
    }

    /**
     * Defaults that live inside an Elementor GROUP control (typography, box-shadow
     * …). Keyed by the group's `name`, then by the group's own field id.
     *
     * @return array<string,array<string,array<string,mixed>>>
     */
    public static function group_fields(string $group): array
    {
        $map = [
            'chip_typography' => [
                'typography'     => ['default' => 'custom'],
                'text_transform' => ['default' => 'capitalize'],
            ],
            'btn_typography' => [
                'typography'     => ['default' => 'custom'],
                'text_transform' => ['default' => 'capitalize'],
            ],
            'cmpmenu_panel_shadow' => [
                'box_shadow_type' => ['default' => 'yes'],
            ],
        ];

        return $map[$group] ?? [];
    }

    /**
     * Inject the preset default into a control's args. The preset intentionally
     * OVERRIDES any inline default (e.g. the factory strings from Config::strings())
     * — that is the whole point of the preset — but never touches a control the
     * preset says nothing about.
     *
     * @param array<string,mixed> $args
     * @return array<string,mixed>
     */
    public static function apply(string $id, array $args): array
    {
        $map = self::map();
        if (array_key_exists($id, $map)) {
            $args['default'] = $map[$id];
        }

        return $args;
    }
}
