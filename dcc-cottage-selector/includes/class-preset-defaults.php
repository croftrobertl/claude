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
            'enabled_modes' => ['quick', 'compare'],

            // ---- Text & labels ----
            // NONE since 0.54.0. Every str_ control is placeholder-only now (see
            // register_strings_controls()): a preset value becomes a control DEFAULT,
            // and Elementor writes defaults into the settings it saves, so the next
            // Update would have re-stored all of these on the widget — exactly the
            // 31/35 str_* keys the Website Director removed from live on 2026-10-22.
            // The packaged Config::strings() text is the only copy; a field left
            // empty falls through to it. (History: until 0.53.2 this block held 39
            // captured strings, which had to equal Config word for word.)

            // ---- Icons ----
            'icon_back' => ['value' => 'fas fa-arrow-left', 'library' => 'fa-solid'],
            'icon_edit_answers' => ['value' => 'fas fa-edit', 'library' => 'fa-solid'],
            // 0.53.1 (Rob, B6): rendered as inline SVG by Icons, so they show where the
            // Font Awesome font is not loaded.
            'icon_mode_compare' => ['value' => 'fas fa-balance-scale', 'library' => 'fa-solid'],
            'icon_mode_quick' => ['value' => 'fas fa-clipboard-check', 'library' => 'fa-solid'],
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
            'color_item_text' => '#000000',
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
            'matrix_head_bg' => '#020101',
            'mode_item_padding' => ['unit' => 'px', 'top' => '0', 'right' => '0', 'bottom' => '0', 'left' => '0', 'isLinked' => false],
            'mode_item_radius' => ['unit' => 'px', 'size' => 0, 'sizes' => []],
            'mode_panel_radius' => ['unit' => 'px', 'size' => 25, 'sizes' => []],
            'mode_trigger_radius' => ['unit' => 'px', 'size' => 25, 'sizes' => []],
            'modetab_bg_active' => '#002E7A',
            'modetab_color_active' => '#FFFFFF',
            'progress_label_color' => '#000000',
            'question_color' => '#000000',
            // NOTE: style_comparebtn_* is deliberately NOT preset (0.27.0). Those
            // controls emit `{{WRAPPER}} .dccs-root.dccs-root .dccs-open-compare`
            // = (0,4,0), which outranks the stylesheet's button-spec rule (0,3,0) —
            // so presetting the old navy #002E7A would have pinned the ONE button
            // Rob named off the site button spec, while the spec appeared to be
            // applied everywhere else. Unset, the Compare button takes the spec;
            // a widget that wants something else can still set the control.
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
        if (!self::enabled()) {
            return [];
        }

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
        if (!self::enabled()) {
            return $args;
        }

        $map = self::map();
        // A string control never takes a default (0.54.0): it would be re-saved
        // into the widget on the next Update. See map().
        if (strncmp($id, 'str_', 4) === 0) {
            return $args;
        }
        if (array_key_exists($id, $map)) {
            $args['default'] = $map[$id];
        }

        return $args;
    }

    /**
     * Master switch for the preset. ON since 0.19.6.
     *
     * History, so nobody switches this off again for the wrong reason: 0.19.2 disabled
     * the preset believing it caused a fatal in the Elementor editor. It did not. The
     * real cause — found in 0.19.5 — was Plugin::republish_designs() recursing through
     * Document::get_elements_data() whenever an EMPTY page was opened in the editor,
     * a bug that had been present since 0.11.0. 0.19.2's reasoning ("the preset is the
     * only change since 0.18.0") only looked right because 0.18.0's editor had never
     * been opened on an empty page. With that fixed and confirmed on the live site, the
     * preset is back on.
     *
     * The genuine preset-related fatal was a different bug, fixed in 0.19.1: 0.19.0
     * applied the preset by overriding Elementor's add_responsive_control() and
     * add_group_control(), which are `final`. The preset now goes through this plugin's
     * own preset_control()/preset_responsive_control()/preset_group_control() wrappers
     * and touches no Elementor API; test-design-snapshot.php fails if that regresses.
     *
     * Can still be switched off site-side without reinstalling:
     *
     *     add_filter('dccs_preset_defaults_enabled', '__return_false');
     */
    public static function enabled(): bool
    {
        $enabled = true;

        return function_exists('apply_filters')
            ? (bool) apply_filters('dccs_preset_defaults_enabled', $enabled)
            : $enabled;
    }
}
