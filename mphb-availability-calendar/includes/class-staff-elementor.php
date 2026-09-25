<?php
namespace MPHBAC;

use Elementor\Controls_Manager;
use Elementor\Widget_Base;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * "DCC Staff Calendar" — Elementor widget wrapper around the staff calendar.
 *
 * Deliberately a THIN wrapper: render() delegates straight to
 * Staff_Widget::render(), the same method the [mphb_staff_calendar] shortcode
 * calls. There is no second data path, no second copy of the markup, and no
 * second place where the authorization gate could drift — Staff_Widget still
 * performs the Staff::is_authorized() check and still emits a PII-free shell,
 * so both entry points are governed by exactly one implementation.
 *
 * Note this widget does NOT extend Widget/Widget_Single: those are the public
 * availability calendar and share render()/controls that have nothing to do
 * with staff data. Sharing that hierarchy would drag the whole public control
 * set (and its render path) into a page that shows guest PII.
 */
final class Staff_Elementor extends Widget_Base
{
    public function get_name(): string
    {
        return 'dccac_staff';
    }

    public function get_title(): string
    {
        return __('DCC Staff Calendar', 'mphb-availability-calendar');
    }

    public function get_icon(): string
    {
        return 'eicon-calendar';
    }

    public function get_categories(): array
    {
        return ['dcc-widgets'];
    }

    public function get_keywords(): array
    {
        return ['staff', 'booking', 'calendar', 'guest', 'checkin', 'motopress', 'mphb'];
    }

    public function get_script_depends(): array
    {
        return ['mphbac-staff'];
    }

    public function get_style_depends(): array
    {
        return ['mphbac-staff'];
    }

    /**
     * Wrapper-scoped, class-doubled — the same specificity strategy
     * Widget::SEL uses ({{WRAPPER}} .mphbac-root.mphbac-root), so these beat
     * the theme's button rules without !important.
     */
    private const SEL = '{{WRAPPER}} .mphbac-staff.mphbac-staff ';

    protected function register_controls(): void
    {
        $this->register_content_controls();
        $this->register_nav_style_controls();
    }

    /**
     * Deliberately mirrors Widget::register_nav_style_controls() control for
     * control, so a future restyle can be applied to both widgets by hand
     * without translating between two different control sets. Only the
     * DEFAULTS differ: the staff calendar ships with the values the public
     * nav actually renders on /cottages/, so it matches out of the box.
     */
    protected function register_nav_style_controls(): void
    {
        $this->start_controls_section('section_style_nav', [
            'label' => __('Navigation', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('nav_btn_bg', [
            'label'     => __('Button background', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            // TOKEN, not background-color — and this half matters as much as the
            // hover half. Emitted as a paint property it lands at (0,7,0) and
            // OUT-SPECIFIES both the :hover and the :focus-visible rules in
            // staff.css at (0,2,0), so the nav would keep its resting colour
            // through both. Measured: exactly that, before this change.
            // Rest and hover have to resolve in the same place. Identical to
            // the public widget's 0.31.1 fix.
            'selectors' => [self::SEL . '.mphbac-staff-nav' => '--staff-nav-bg: {{VALUE}};'],
            'description' => __('Leave empty to follow DCC → Availability Calendar.', 'mphb-availability-calendar'),
        ]);

        $this->add_control('nav_btn_text', [
            'label'     => __('Button arrow color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.mphbac-staff-nav' => '--staff-nav-text: {{VALUE}};'],
            'description' => __('Leave empty to follow DCC → Availability Calendar.', 'mphb-availability-calendar'),
        ]);

        $this->add_control('nav_btn_hover_bg', [
            'label'     => __('Button hover background', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            // Writes a TOKEN; it does not emit :hover or :focus-visible itself.
            // Three reasons, all of which a staff.css-only change would miss:
            //
            //  a. This rule lands in _elementor_css at (0,7,0) — measured on
            //     page 18102 — while staff.css is (0,2,0), so anything the
            //     stylesheet says about the nav's hover colour LOSES.
            //  b. Per-post CSS is not inside this plugin's stylesheet, so the
            //     (hover: hover) guard cannot reach it and the iOS sticky-hover
            //     bug survives a fix meant to remove it.
            //  c. One control emitting BOTH :hover and :focus-visible makes them
            //     a single value. Splitting them — hover gated, focus not — is
            //     therefore a control change, not a CSS change.
            //
            // Same restructuring the public widget's controls had in 0.31.0.
            // NOTE FOR DEPLOY: Elementor's cached per-post CSS does NOT refresh
            // on a plugin update. Until 18102's _elementor_css is regenerated
            // the old #FFA000 :hover rule keeps painting.
            'selectors' => [
                self::SEL . '.mphbac-staff-nav' => '--staff-nav-hover: {{VALUE}};',
            ],
            'description' => __('Leave empty to follow DCC → Availability Calendar.', 'mphb-availability-calendar'),
        ]);

        $this->add_control('nav_btn_radius', [
            'label'      => __('Button corner radius', 'mphb-availability-calendar'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', '%'],
            'default'    => ['size' => 30, 'unit' => 'px'],
            'range'      => ['px' => ['min' => 0, 'max' => 40, 'step' => 1], '%' => ['min' => 0, 'max' => 50, 'step' => 1]],
            'selectors'  => [self::SEL . '.mphbac-staff-nav' => 'border-radius: {{SIZE}}{{UNIT}};'],
        ]);

        $this->add_control('nav_label_color', [
            'label'     => __('Month/day label color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.mphbac-staff-title' => 'color: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    protected function register_content_controls(): void
    {
        $this->start_controls_section('section_staff', [
            'label' => __('Staff Calendar', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        // No settings by design: everything about this widget (which page
        // authorizes it, which statuses show) is a server-side concern with a
        // filter, not something that should be editable per placement.
        $this->add_control('staff_intro', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('Shows all cottages for a month with each booking\'s check-in and check-out, and opens full guest details on tap. Guest information is protected server-side: it only loads for someone who entered the staff page password or is a logged-in manager. Place this on the password-protected staff page only.', 'mphb-availability-calendar'),
            'content_classes' => 'elementor-descriptor',
        ]);

        $this->end_controls_section();
    }

    protected function render(): void
    {
        if (!Plugin::instance()->dependencies_present()) {
            return;
        }

        // ONE implementation, shared with the shortcode. Staff_Widget::render()
        // re-checks authorization itself and returns '' when it fails, so the
        // check below is purely to give an editor a reason for the blank.
        $html = Staff_Widget::render();

        if ($html !== '') {
            // Safe: the shell is built entirely from esc_*'d output and a
            // wp_json_encode'd config in an esc_attr'd attribute, and contains
            // no booking data whatsoever.
            echo $html; // phpcs:ignore WordPress.Security.EscapeOutput
            return;
        }

        // Nothing rendered — explain why, but only inside the editor. On the
        // front end an unauthorized visitor gets absolute silence.
        if (!\Elementor\Plugin::$instance->editor->is_edit_mode()) {
            return;
        }
        printf(
            '<div class="mphbac-staff-placeholder">%s</div>',
            esc_html__(
                'Staff calendar: nothing is shown here because this account cannot view bookings and the staff page password has not been entered in this browser. It will appear for staff who enter the page password, and for logged-in managers.',
                'mphb-availability-calendar'
            )
        );
    }
}
