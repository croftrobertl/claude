<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

use Elementor\Widget_Base;
use Elementor\Controls_Manager;
use Elementor\Group_Control_Typography;
use Elementor\Group_Control_Border;
use Elementor\Group_Control_Box_Shadow;

/**
 * The full cottage-selector Elementor widget. render() outputs only a shell with
 * all data + copy serialized into data-config; assets/js/selector.js renders the
 * three interactive modes client-side.
 */
class Selector_Widget extends Widget_Base
{
    /**
     * Doubled-class specificity prefix so style controls outrank the Bravada
     * theme's Elementor-kit resets. Reaches (0,4,0).
     */
    private const SEL = '{{WRAPPER}} .dccs-root.dccs-root ';

    /** Root element itself (no trailing space) — for root-level box properties. */
    private const ROOT = '{{WRAPPER}} .dccs-root.dccs-root';

    public function get_name(): string
    {
        return 'dccs_selector';
    }

    public function get_title(): string
    {
        return __('Cottage Selector', 'dcc-cottage-selector');
    }

    public function get_icon(): string
    {
        return 'eicon-form-horizontal';
    }

    public function get_categories(): array
    {
        return ['claude-code'];
    }

    public function get_keywords(): array
    {
        return ['cottage', 'selector', 'quiz', 'compare', 'dora canal'];
    }

    public function get_script_depends(): array
    {
        // List the whole chain so the data layer is guaranteed present at boot,
        // on the front-end and in the Elementor editor preview alike.
        return ['dccs-score', 'dccs-labels', 'dccs-selector'];
    }

    public function get_style_depends(): array
    {
        return ['dccs-selector'];
    }

    protected function register_controls(): void
    {
        $this->register_content_controls();
        $this->register_strings_controls();

        // Style tab — every section maps to CSS custom properties / element
        // selectors via the SEL prefix. Controls carry no defaults; the baked
        // look lives in selector.css and these only override it.
        $this->register_layout_style_controls();
        $this->register_color_style_controls();
        $this->register_heading_style_controls();
        $this->register_modebar_style_controls();
        $this->register_progress_style_controls();
        $this->register_question_style_controls();
        $this->register_button_style_controls();
        $this->register_card_style_controls();
        $this->register_compare_style_controls();
    }

    private function register_content_controls(): void
    {
        $this->start_controls_section('content', [
            'label' => __('Content', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('show_heading', [
            'label'        => __('Show heading', 'dcc-cottage-selector'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => 'yes',
            'return_value' => 'yes',
        ]);

        $this->add_control('start_mode', [
            'label'   => __('Starting mode', 'dcc-cottage-selector'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'quick',
            'options' => [
                'quick'   => __('Quick Pick', 'dcc-cottage-selector'),
                'weights' => __('What Matters Most', 'dcc-cottage-selector'),
                'compare' => __('Compare', 'dcc-cottage-selector'),
            ],
        ]);

        $this->add_control('enabled_modes', [
            'label'    => __('Enabled modes', 'dcc-cottage-selector'),
            'type'     => Controls_Manager::SELECT2,
            'multiple' => true,
            'default'  => ['quick', 'weights', 'compare'],
            'options'  => [
                'quick'   => __('Quick Pick', 'dcc-cottage-selector'),
                'weights' => __('What Matters Most', 'dcc-cottage-selector'),
                'compare' => __('Compare', 'dcc-cottage-selector'),
            ],
        ]);

        $this->end_controls_section();
    }

    /**
     * Override controls for the headline-level strings. Every string in the tool
     * is already translatable via Config::strings() (Loco picks them up from the
     * __() calls); these controls let an editor tweak the most-edited copy
     * per-instance without touching translations.
     */
    private function register_strings_controls(): void
    {
        $this->start_controls_section('strings', [
            'label' => __('Text & labels', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $defaults = Config::strings();
        $editable = [
            'heading'         => __('Heading', 'dcc-cottage-selector'),
            'intro'           => __('Intro text', 'dcc-cottage-selector'),
            'mode_quick'      => __('Mode label: Quick finder', 'dcc-cottage-selector'),
            'mode_weights'    => __('Mode label: Weigh priorities', 'dcc-cottage-selector'),
            'mode_compare'    => __('Mode label: Compare', 'dcc-cottage-selector'),
            'results_heading' => __('Results heading', 'dcc-cottage-selector'),
            'reset'           => __('Reset button', 'dcc-cottage-selector'),
        ];

        foreach ($editable as $key => $label) {
            $this->add_control('str_' . $key, [
                'label'       => $label,
                'type'        => $key === 'intro' ? Controls_Manager::TEXTAREA : Controls_Manager::TEXT,
                'default'     => $defaults[$key] ?? '',
                'label_block' => true,
            ]);
        }

        $this->add_control('strings_note', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('All other labels are translatable with Loco Translate (text domain: dcc-cottage-selector).', 'dcc-cottage-selector'),
            'content_classes' => 'elementor-descriptor',
        ]);

        $this->end_controls_section();
    }

    /** Shorthand: a COLOR control that drives a CSS custom property on the root. */
    private function var_color(string $id, string $label, string $var, array $args = []): void
    {
        $this->add_control($id, array_merge([
            'label'     => $label,
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::ROOT => $var . ': {{VALUE}};'],
        ], $args));
    }

    /** Overall size, spacing, alignment and the widget container. */
    private function register_layout_style_controls(): void
    {
        $this->start_controls_section('style_layout', [
            'label' => __('Layout & spacing', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_responsive_control('align', [
            'label'   => __('Text alignment', 'dcc-cottage-selector'),
            'type'    => Controls_Manager::CHOOSE,
            'options' => [
                'left'   => ['title' => __('Left', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-left'],
                'center' => ['title' => __('Center', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-center'],
                'right'  => ['title' => __('Right', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-right'],
            ],
            'selectors' => [self::ROOT => '--dccs-align: {{VALUE}};'],
        ]);

        $this->add_responsive_control('content_max_width', [
            'label'      => __('Maximum width', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', '%'],
            'range'      => ['px' => ['min' => 320, 'max' => 1100, 'step' => 10], '%' => ['min' => 40, 'max' => 100]],
            'selectors'  => [self::ROOT => 'max-width: {{SIZE}}{{UNIT}};'],
        ]);

        $this->add_responsive_control('root_padding', [
            'label'      => __('Padding', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em', 'rem'],
            'selectors'  => [self::ROOT => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->add_responsive_control('corner_radius', [
            'label'      => __('Corner radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range'      => ['px' => ['min' => 0, 'max' => 40]],
            'selectors'  => [self::ROOT => '--dccs-radius: {{SIZE}}{{UNIT}};'],
        ]);

        $this->add_responsive_control('section_gap', [
            'label'      => __('Element spacing', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range'      => ['px' => ['min' => 2, 'max' => 30]],
            'selectors'  => [self::ROOT => '--dccs-gap: {{SIZE}}{{UNIT}};'],
        ]);

        $this->end_controls_section();
    }

    /** The palette: every CSS custom property is exposed. */
    private function register_color_style_controls(): void
    {
        $this->start_controls_section('style_colors', [
            'label' => __('Colors', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('inherit_theme', [
            'label'        => __('Match site theme colors', 'dcc-cottage-selector'),
            'description'  => __('Use the theme\'s global colors instead of the built-in palette.', 'dcc-cottage-selector'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => '',
            'return_value' => 'yes',
        ]);

        // These three are also driven by the "Match site theme colors" rule (which
        // wins on specificity), so hide them while inheriting to avoid a dead picker.
        $inherited = [
            'condition'   => ['inherit_theme!' => 'yes'],
            'description' => __('Hidden while “Match site theme colors” is on.', 'dcc-cottage-selector'),
        ];
        $this->var_color('color_accent', __('Accent', 'dcc-cottage-selector'), '--dccs-accent', $inherited);
        $this->var_color('color_accent_text', __('Accent text', 'dcc-cottage-selector'), '--dccs-accent-text');
        $this->var_color('color_accent2', __('Secondary accent', 'dcc-cottage-selector'), '--dccs-accent-2', $inherited);
        $this->var_color('color_surface', __('Card background', 'dcc-cottage-selector'), '--dccs-surface');
        $this->var_color('color_bg', __('Widget background', 'dcc-cottage-selector'), '--dccs-bg');
        $this->var_color('color_text', __('Text', 'dcc-cottage-selector'), '--dccs-text', $inherited);
        $this->var_color('color_muted', __('Muted text', 'dcc-cottage-selector'), '--dccs-muted');
        $this->var_color('color_border', __('Borders', 'dcc-cottage-selector'), '--dccs-border');
        $this->var_color('color_good', __('Positive highlight', 'dcc-cottage-selector'), '--dccs-good');
        $this->var_color('color_diff', __('Compare “differs” highlight', 'dcc-cottage-selector'), '--dccs-diff');

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'base_typography',
            'selector' => self::SEL,
        ]);

        $this->end_controls_section();
    }

    /** Heading + intro typography and color. */
    private function register_heading_style_controls(): void
    {
        $this->start_controls_section('style_heading', [
            'label' => __('Heading & intro', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('heading_color', [
            'label'     => __('Heading color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-heading' => 'color: {{VALUE}};'],
        ]);
        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'heading_typography',
            'selector' => self::SEL . '.dccs-heading',
        ]);
        $this->add_control('intro_color', [
            'label'     => __('Intro color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-intro' => 'color: {{VALUE}};'],
        ]);
        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'intro_typography',
            'selector' => self::SEL . '.dccs-intro',
        ]);

        $this->end_controls_section();
    }

    /** The top mode-toggle pills (Normal / Active). */
    private function register_modebar_style_controls(): void
    {
        $this->start_controls_section('style_modebar', [
            'label' => __('Mode toggle', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'modetab_typography',
            'selector' => self::SEL . '.dccs-modetab',
        ]);
        $this->add_control('modebar_bg', [
            'label'     => __('Bar background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-modebar' => 'background-color: {{VALUE}};'],
        ]);

        $this->start_controls_tabs('modetab_tabs');
        $this->start_controls_tab('modetab_normal', ['label' => __('Normal', 'dcc-cottage-selector')]);
        $this->add_control('modetab_color', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-modetab' => 'color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->start_controls_tab('modetab_active', ['label' => __('Active', 'dcc-cottage-selector')]);
        $this->add_control('modetab_color_active', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-modetab.is-active' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('modetab_bg_active', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-modetab.is-active' => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->end_controls_tabs();

        $this->end_controls_section();
    }

    /** Progress label, live count badge and the stepper dots. */
    private function register_progress_style_controls(): void
    {
        $this->start_controls_section('style_progress', [
            'label' => __('Progress & steps', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_responsive_control('dot_height', [
            'label'      => __('Step bar thickness', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range'      => ['px' => ['min' => 2, 'max' => 16]],
            'selectors'  => [self::ROOT => '--dccs-dot-h: {{SIZE}}{{UNIT}};'],
        ]);
        $this->add_control('dot_done_color', [
            'label'     => __('Completed step color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-step-dot.is-done' => 'background-color: {{VALUE}};'],
        ]);
        $this->add_control('dot_idle_color', [
            'label'     => __('Upcoming step color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-step-dot' => 'background-color: {{VALUE}};'],
        ]);
        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'progress_label_typography',
            'selector' => self::SEL . '.dccs-progress-label',
        ]);
        $this->add_control('progress_label_color', [
            'label'     => __('Progress label color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-progress-label' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('count_bg', [
            'label'     => __('Match-count background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-count' => 'background-color: {{VALUE}};'],
        ]);
        $this->add_control('count_color', [
            'label'     => __('Match-count text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-count' => 'color: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    /** The question text and the answer chips (Normal / Hover / Selected). */
    private function register_question_style_controls(): void
    {
        $this->start_controls_section('style_question', [
            'label' => __('Questions & answers', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'question_typography',
            'selector' => self::SEL . '.dccs-step-q',
        ]);
        $this->add_control('question_color', [
            'label'     => __('Question color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-step-q' => 'color: {{VALUE}};'],
        ]);

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'chip_typography',
            'selector' => self::SEL . '.dccs-chip',
        ]);
        $this->add_group_control(Group_Control_Border::get_type(), [
            'name'     => 'chip_border',
            'selector' => self::SEL . '.dccs-chip',
        ]);
        $this->add_responsive_control('chip_radius', [
            'label'      => __('Answer radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [self::SEL . '.dccs-chip' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->add_responsive_control('chip_padding', [
            'label'      => __('Answer padding', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [self::SEL . '.dccs-chip' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->start_controls_tabs('chip_tabs');
        $this->start_controls_tab('chip_normal', ['label' => __('Normal', 'dcc-cottage-selector')]);
        $this->add_control('chip_color', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-chip' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('chip_bg', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-chip' => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->start_controls_tab('chip_hover', ['label' => __('Hover', 'dcc-cottage-selector')]);
        $this->add_control('chip_color_hover', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-chip:hover'         => 'color: {{VALUE}};',
                self::SEL . '.dccs-chip:focus-visible' => 'color: {{VALUE}};',
            ],
        ]);
        $this->add_control('chip_bg_hover', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-chip:hover'         => 'background-color: {{VALUE}};',
                self::SEL . '.dccs-chip:focus-visible' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();
        $this->start_controls_tab('chip_selected', ['label' => __('Selected', 'dcc-cottage-selector')]);
        $this->add_control('chip_color_active', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-chip.is-active' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('chip_bg_active', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-chip.is-active' => 'background-color: {{VALUE}};'],
        ]);
        $this->add_control('chip_border_active', [
            'label'     => __('Border', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-chip.is-active' => 'border-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->end_controls_tabs();

        $this->end_controls_section();
    }

    /** Primary button (Next / See matches) + the low-emphasis link controls. */
    private function register_button_style_controls(): void
    {
        $this->start_controls_section('style_buttons', [
            'label' => __('Buttons', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'btn_typography',
            'selector' => self::SEL . '.dccs-primary',
        ]);
        $this->add_responsive_control('btn_radius', [
            'label'      => __('Button radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [self::SEL . '.dccs-primary' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->add_responsive_control('btn_padding', [
            'label'      => __('Button padding', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [self::SEL . '.dccs-primary' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->start_controls_tabs('btn_tabs');
        $this->start_controls_tab('btn_normal', ['label' => __('Normal', 'dcc-cottage-selector')]);
        $this->add_control('btn_color', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-primary' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('btn_bg', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-primary' => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->start_controls_tab('btn_hover', ['label' => __('Hover', 'dcc-cottage-selector')]);
        $this->add_control('btn_color_hover', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-primary:hover'         => 'color: {{VALUE}};',
                self::SEL . '.dccs-primary:focus-visible' => 'color: {{VALUE}};',
            ],
        ]);
        $this->add_control('btn_bg_hover', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-primary:hover'         => 'background-color: {{VALUE}};',
                self::SEL . '.dccs-primary:focus-visible' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();
        $this->end_controls_tabs();

        $this->add_control('link_color', [
            'label'     => __('Back link', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'separator' => 'before',
            'selectors' => [self::SEL . '.dccs-back' => 'color: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    /** Result cards: surface, border, shadow, title, badges. */
    private function register_card_style_controls(): void
    {
        $this->start_controls_section('style_cards', [
            'label' => __('Result cards', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('card_bg', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-card' => 'background-color: {{VALUE}};'],
        ]);
        $this->add_group_control(Group_Control_Border::get_type(), [
            'name'     => 'card_border',
            'selector' => self::SEL . '.dccs-card',
        ]);
        $this->add_responsive_control('card_radius', [
            'label'      => __('Radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [self::SEL . '.dccs-card' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->add_responsive_control('card_padding', [
            'label'      => __('Padding', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [self::SEL . '.dccs-card' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->add_group_control(Group_Control_Box_Shadow::get_type(), [
            'name'     => 'card_shadow',
            'selector' => self::SEL . '.dccs-card',
        ]);
        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'card_title_typography',
            'selector' => self::SEL . '.dccs-card h4',
        ]);
        $this->add_control('badge_bg', [
            'label'     => __('Badge background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'separator' => 'before',
            'selectors' => [self::SEL . '.dccs-badge' => 'background-color: {{VALUE}};'],
        ]);
        $this->add_control('badge_color', [
            'label'     => __('Badge text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-badge' => 'color: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    /** The side-by-side comparison table. */
    private function register_compare_style_controls(): void
    {
        $this->start_controls_section('style_compare', [
            'label' => __('Compare table', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('matrix_head_bg', [
            'label'     => __('Header background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-matrix thead th' => 'background-color: {{VALUE}};'],
        ]);
        $this->add_control('matrix_head_color', [
            'label'     => __('Header text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-matrix thead th' => 'color: {{VALUE}};'],
        ]);
        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'matrix_typography',
            'selector' => self::SEL . '.dccs-matrix td, ' . self::SEL . '.dccs-matrix th',
        ]);
        $this->add_control('matrix_diff_bg', [
            'label'     => __('“Differs” cell highlight', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-matrix td.is-diff' => 'background-color: {{VALUE}};'],
        ]);
        $this->add_control('matrix_border', [
            'label'     => __('Cell borders', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-matrix th' => 'border-color: {{VALUE}};',
                self::SEL . '.dccs-matrix td' => 'border-color: {{VALUE}};',
            ],
        ]);

        $this->end_controls_section();
    }

    protected function render(): void
    {
        $settings = $this->get_settings_for_display();

        $cottages = Data::all();

        $string_overrides = [];
        foreach ($settings as $k => $v) {
            if (strncmp($k, 'str_', 4) === 0) {
                $string_overrides[substr($k, 4)] = (string) $v;
            }
        }

        $enabled = $settings['enabled_modes'] ?? ['quick', 'weights', 'compare'];
        if (!is_array($enabled) || empty($enabled)) {
            $enabled = ['quick', 'weights', 'compare'];
        }
        $start = $settings['start_mode'] ?? 'quick';
        if (!in_array($start, $enabled, true)) {
            $start = $enabled[0];
        }

        $config = Config::build($string_overrides, [
            'startMode'    => $start,
            'enabledModes' => array_values($enabled),
            'showHeading'  => ($settings['show_heading'] ?? 'yes') === 'yes',
        ]);

        if (empty($cottages)) {
            printf(
                '<div class="dccs-root dccs-root"><p class="dccs-unavailable">%s</p></div>',
                esc_html($config['strings']['unavailable'])
            );
            return;
        }

        $strings = $config['strings'];
        $root_class = 'dccs-root dccs-root';
        if (($settings['inherit_theme'] ?? '') === 'yes') {
            $root_class .= ' dccs-inherit-theme';
        }
        ?>
        <div class="<?php echo esc_attr($root_class); ?>" data-config="<?php echo esc_attr((string) wp_json_encode($config)); ?>">
            <noscript>
                <ul class="dccs-noscript">
                    <?php foreach ($cottages as $c) : ?>
                        <li>
                            <a href="<?php echo esc_url((string) ($c['pageUrl'] ?? '#')); ?>">
                                <?php echo esc_html(sprintf(
                                    (string) ($strings['name_format'] ?? '%2$s'),
                                    (string) ($c['id'] ?? ''),
                                    (string) ($c['name'] ?? '')
                                )); ?>
                            </a>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </noscript>
            <div class="dccs-loading"><?php echo esc_html($strings['loading']); ?></div>
        </div>
        <?php
    }
}
