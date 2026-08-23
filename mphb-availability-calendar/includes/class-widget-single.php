<?php
namespace MPHBAC;

use Elementor\Controls_Manager;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Single-cottage variant of the availability calendar.
 *
 * Intended for the individual /accommodation/<slug>/ Elementor templates,
 * where the page already IS one cottage: it renders that cottage's
 * availability strip only.
 *
 * It deliberately extends Widget rather than duplicating it, so the data
 * pipeline, caching, date-range navigation, legend, styling, and every style
 * control stay literally the same code. Only three things differ:
 *
 *   1. Cottage selection — one SELECT dropdown (`single_cottage`) instead of
 *      the multi-select `cottages`, resolved via resolve_selected_ids().
 *   2. No row-label column — single_mode() adds the `mphbac-single` root
 *      class and sets config.singleMode, which together drop the label cells
 *      from the grid and let the day cells use the full width.
 *   3. No cottage-details popup — register_info_controls() is a no-op here,
 *      so no cottage_info rows exist, so render() emits neither the hidden
 *      info content nor the popup markup, and no .mphbac-row-toggle trigger
 *      is ever created (the label button that opened it is gone anyway).
 *
 * The Book Now popup is NOT removed — it is a booking affordance rather than
 * a "details" one, and it remains governed by the inherited "Enable Book Now
 * popup" switch, so it can be turned off per-instance from the panel.
 */
class Widget_Single extends Widget
{
    public function get_name(): string
    {
        return 'dccac_single';
    }

    public function get_title(): string
    {
        return __('DCC Availability — Single Cottage', 'mphb-availability-calendar');
    }

    public function get_icon(): string
    {
        return 'eicon-calendar';
    }

    public function get_keywords(): array
    {
        return ['motopress', 'mphb', 'availability', 'calendar', 'cottage', 'single', 'accommodation'];
    }

    protected function single_mode(): bool
    {
        return true;
    }

    /**
     * Month grid is the default for this variant, including for instances
     * placed before 0.18.0: Elementor returns no value for a control that did
     * not exist when the widget was saved, and the `?? 'month'` fallback then
     * lands those on the grid without anyone re-saving the page. Choosing
     * "Day strip" restores the pre-0.18.0 linear layout.
     */
    protected function month_mode(array $settings): bool
    {
        return ($settings['layout'] ?? 'month') !== 'strip';
    }

    /**
     * Default OFF — same missing-key fallback pattern as `layout`, so the
     * already-placed instances (no stored value) lose the filter bar
     * automatically and the site's mu-plugin hide rule can be retired. The
     * skip is server-side: with this off the .mphbac-filters block is never
     * rendered, not merely hidden.
     */
    protected function show_filters(array $settings): bool
    {
        return ($settings['show_filters'] ?? '') === 'yes';
    }

    /**
     * Exactly the one chosen cottage — and only if it is still a published
     * accommodation type. A cottage that was deleted or unpublished after
     * being selected resolves to nothing, which render() treats as "show
     * nothing" rather than silently falling back to all cottages.
     */
    protected function resolve_selected_ids(array $settings, array $all_types): array
    {
        $cid = (int) ($settings['single_cottage'] ?? 0);
        if ($cid <= 0) {
            return [];
        }
        $valid = array_map(static fn($t) => (int) $t['id'], $all_types);
        return in_array($cid, $valid, true) ? [$cid] : [];
    }

    /**
     * Replaces the parent's Content section: same heading controls, but the
     * multi-cottage SELECT2 is swapped for a single-cottage dropdown. Options
     * come from cottage_options(), which reads the published mphb_room_type
     * posts at editor load — so a cottage added later appears automatically,
     * with no hardcoded IDs anywhere.
     */
    protected function register_content_controls(): void
    {
        $this->start_controls_section('section_content', [
            'label' => __('Content', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('single_cottage', [
            'label'       => __('Cottage', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::SELECT2,
            'options'     => $this->cottage_options(),
            'label_block' => true,
            'default'     => '',
            'description' => __('Which cottage this calendar shows. Place this widget on that cottage\'s own page — the row label is omitted because the page already identifies the cottage.', 'mphb-availability-calendar'),
        ]);

        $this->add_control('layout', [
            'label'       => __('Layout', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::SELECT,
            'default'     => 'month',
            'options'     => [
                'month' => __('Month grid', 'mphb-availability-calendar'),
                'strip' => __('Day strip', 'mphb-availability-calendar'),
            ],
            'description' => __('Month grid shows one calendar month at a time (7 columns, week rows) and fits a phone without sideways scrolling. Day strip is the original horizontal run of days, paged by the number of days set under Display.', 'mphb-availability-calendar'),
        ]);

        $this->add_responsive_control('months_shown', [
            'label'          => __('Months shown', 'mphb-availability-calendar'),
            'type'           => Controls_Manager::NUMBER,
            'min'            => 1,
            'max'            => 4,
            'step'           => 1,
            'default'        => 3,
            'tablet_default' => 2,
            'mobile_default' => 1,
            'description'    => __('How many calendar months appear side by side. Months wrap to a second row instead of shrinking when the widget\'s column is too narrow.', 'mphb-availability-calendar'),
            'condition'      => ['layout' => 'month'],
        ]);

        $this->add_control('show_filters', [
            'label'        => __('Show date filters', 'mphb-availability-calendar'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
            'description'  => __('Shows the check-in / check-out inputs with Show and Reset buttons above the calendar. Off by default — on a cottage page the month navigation usually covers it.', 'mphb-availability-calendar'),
        ]);

        $this->add_responsive_control('top_spacing', [
            'label'      => __('Top spacing', 'mphb-availability-calendar'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range'      => ['px' => ['min' => 0, 'max' => 120, 'step' => 1]],
            'default'        => ['size' => 40, 'unit' => 'px'],
            'tablet_default' => ['size' => 40, 'unit' => 'px'],
            'mobile_default' => ['size' => 40, 'unit' => 'px'],
            'description'    => __('Space between the content above and the calendar. The 40px default matches the site\'s previous hand-added rule.', 'mphb-availability-calendar'),
            'selectors'  => [
                '{{WRAPPER}}' => 'margin-top: {{SIZE}}{{UNIT}};',
            ],
        ]);

        $this->add_control('heading_show', [
            'label'        => __('Show heading', 'mphb-availability-calendar'),
            'type'         => Controls_Manager::SWITCHER,
            'label_on'     => __('Show', 'mphb-availability-calendar'),
            'label_off'    => __('Hide', 'mphb-availability-calendar'),
            'return_value' => 'yes',
            'default'      => '',
        ]);

        $this->add_control('heading_text', [
            'label'     => __('Heading text', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::TEXT,
            'default'   => __('Availability', 'mphb-availability-calendar'),
            'condition' => ['heading_show' => 'yes'],
        ]);

        $this->end_controls_section();
    }

    /**
     * No cottage-info popups on this variant — the details it would show are
     * already on the page hosting the widget. A no-op (rather than a hidden
     * section) means `cottage_info` never exists in settings, so render()
     * emits no hidden info content and no popup markup at all.
     */
    protected function register_info_controls(): void
    {
    }

    /**
     * The custom-label repeater is meaningless without a label column.
     */
    protected function register_labels_controls(): void
    {
    }

    /**
     * Likewise the label-column styling section.
     */
    protected function register_namecol_style_controls(): void
    {
    }

    /**
     * ...and the "View Cottage Page" button, which only ever appeared inside
     * the info popup this variant does not have.
     */
    protected function register_view_button_style_controls(): void
    {
    }

    protected function register_popup_title_style_controls(): void
    {
        // Only the Book Now popup remains here, and its title is styled by
        // the same baked CSS; keeping the section would expose controls for
        // a mostly-absent element.
    }

    protected function render(): void
    {
        $settings = $this->get_settings_for_display();
        $cid      = (int) ($settings['single_cottage'] ?? 0);

        if ($cid <= 0) {
            // Editor-only affordance so an unconfigured widget isn't an
            // invisible blank on the canvas. Front end renders nothing.
            if (\Elementor\Plugin::$instance->editor->is_edit_mode()) {
                printf(
                    '<div class="mphbac-single-placeholder">%s</div>',
                    esc_html__('Choose a cottage…', 'mphb-availability-calendar')
                );
            }
            return;
        }

        parent::render();
    }
}
