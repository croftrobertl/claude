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

    /** Registry option mapping a design name to a published Selector design snapshot. */
    public const DESIGN_OPTION = 'dccs_design_sources';

    public function get_name(): string
    {
        return 'dccs_selector';
    }

    public function get_title(): string
    {
        return __('DCC Cottage Selector', 'dcc-cottage-selector');
    }

    public function get_icon(): string
    {
        return 'eicon-form-horizontal';
    }

    public function get_categories(): array
    {
        // Shared with the other DCC plugins — see Plugin::register_category().
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

    /**
     * Register a control seeded with the site preset (see Preset_Defaults), so a NEW
     * widget starts from the site's configuration rather than the generic factory
     * look. Routing every registration through these three wrappers keeps the preset
     * out of ~90 individual control definitions.
     *
     * These are deliberately OUR OWN methods rather than overrides of Elementor's
     * add_control() / add_responsive_control() / add_group_control(): the latter two
     * are declared `final` in Controls_Stack, so overriding them is a fatal
     * "Cannot override final method" the moment this class is autoloaded.
     *
     * Saved widgets are unaffected: Elementor merges stored settings over control
     * defaults and stored values win, so a default only ever fills a key the widget
     * never saved.
     *
     * @param array<string,mixed> $args
     * @param array<string,mixed> $options
     */
    protected function preset_control(string $id, array $args = [], array $options = []): void
    {
        $this->add_control($id, Preset_Defaults::apply($id, $args), $options);
    }

    /**
     * @param array<string,mixed> $args
     * @param array<string,mixed> $options
     */
    protected function preset_responsive_control(string $id, array $args = [], array $options = []): void
    {
        $this->add_responsive_control($id, Preset_Defaults::apply($id, $args), $options);
    }

    /**
     * Group controls (typography, box-shadow …) hold their defaults in
     * `fields_options`, not in a top-level `default`, so they are merged here.
     *
     * @param array<string,mixed> $args
     */
    protected function preset_group_control(string $type, array $args = []): void
    {
        $fields = Preset_Defaults::group_fields((string) ($args['name'] ?? ''));
        if ($fields) {
            $args['fields_options'] = array_replace_recursive($fields, $args['fields_options'] ?? []);
        }

        $this->add_group_control($type, $args);
    }

    protected function register_controls(): void
    {
        $this->register_content_controls();
        $this->register_design_source_controls();
        $this->register_icon_controls();
        $this->register_qa_icon_controls();
        $this->register_strings_controls();
        $this->register_qa_text_controls();
        $this->register_badge_text_controls();

        // Style tab — every section maps to CSS custom properties / element
        // selectors via the SEL prefix. Controls carry no defaults; the baked
        // look lives in selector.css and these only override it.
        $this->register_layout_style_controls();
        $this->register_color_style_controls();
        $this->register_heading_style_controls();
        $this->register_modebar_style_controls();
        $this->register_progress_style_controls();
        $this->register_question_style_controls();
        $this->register_editanswers_style_controls();
        $this->register_button_style_controls();
        $this->register_card_style_controls();
        $this->register_viewbtn_style_controls();
        $this->register_comparebtn_style_controls();
        $this->register_cmpmenu_style_controls();
        $this->register_compare_style_controls();
    }

    private function register_content_controls(): void
    {
        $this->section('content', [
            'label' => __('Content', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->preset_control('show_heading', [
            'label'        => __('Show heading', 'dcc-cottage-selector'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => 'yes',
            'return_value' => 'yes',
        ]);

        $this->preset_control('show_review', [
            'label'        => __('Show “Review your answers” step', 'dcc-cottage-selector'),
            'description'  => __('Off by default: the quiz jumps straight to the matches after the last question (the results still have an “Edit answers” button). Turn on to add a review-and-confirm step before results.', 'dcc-cottage-selector'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => '',
            'return_value' => 'yes',
        ]);

        $this->preset_control('start_mode', [
            'label'   => __('Starting mode', 'dcc-cottage-selector'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'quick',
            'options' => [
                'quick'   => __('Quick Pick', 'dcc-cottage-selector'),
                'weights' => __('What Matters Most', 'dcc-cottage-selector'),
                'compare' => __('Compare', 'dcc-cottage-selector'),
            ],
        ]);

        $this->preset_control('enabled_modes', [
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
     * "Design source" section — lets a Cottage Selector publish its full design +
     * copy under a name so Mini Entry widgets can mirror it (see Mini_Entry_Widget).
     * Mini Entry overrides this method to a no-op, so the controls appear only on the
     * Selector.
     */
    protected function register_design_source_controls(): void
    {
        $this->section('design_source', [
            'label' => __('Design source', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->preset_control('share_design', [
            'label'        => __('Share this design', 'dcc-cottage-selector'),
            'description'  => __('Publish this widget\'s full design + text under a name so Mini Entry widgets can mirror it.', 'dcc-cottage-selector'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => '',
        ]);

        $this->preset_control('design_name', [
            'label'       => __('Design name', 'dcc-cottage-selector'),
            'description' => __('A short label Mini Entries pick from (e.g. "Main"). Save the page to publish it.', 'dcc-cottage-selector'),
            'type'        => Controls_Manager::TEXT,
            'default'     => '',
            'condition'   => ['share_design' => 'yes'],
        ]);

        // One-time copy (as opposed to the live mirror above): export this Selector's
        // TEXT as a code to paste into a Mini Entry. The visual design is copied
        // separately with Elementor's native right-click Copy → Paste Style.
        $this->preset_control('copy_hint', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('To copy the LOOK: right-click this widget → Copy, then right-click a Mini Entry → Paste Style. To copy the TEXT: use the button below.', 'dcc-cottage-selector'),
            'content_classes' => 'elementor-descriptor',
        ]);

        $this->preset_control('export_text', [
            'label'       => __('Export text', 'dcc-cottage-selector'),
            'type'        => Control_Design_IO::TYPE,
            'mode'        => 'export',
            'button_text' => __('Copy text code', 'dcc-cottage-selector'),
            'placeholder' => __('Click “Copy text code” to generate a code…', 'dcc-cottage-selector'),
            'description' => __('Copies this Selector’s wording (headings, labels, buttons, questions, badges…) as a code. Paste it into a Mini Entry’s “Import text”.', 'dcc-cottage-selector'),
        ]);

        $this->end_controls_section();
    }

    /**
     * Sections to hide when this widget is a Mini Entry mirroring a source design.
     * Empty for the Selector itself (returns no condition). Mini_Entry_Widget
     * overrides it to `['mirror_source' => '']` so all inherited content + style
     * sections collapse once a source is chosen.
     *
     * @return array<string,mixed>
     */
    protected function inherited_section_condition(): array
    {
        return [];
    }

    /**
     * start_controls_section that also applies inherited_section_condition(), so a
     * subclass can hide every inherited section at once without editing each one.
     *
     * @param array<string,mixed> $args
     */
    protected function section(string $id, array $args): void
    {
        $cond = $this->inherited_section_condition();
        if (!empty($cond)) {
            $args['condition'] = array_merge($args['condition'] ?? [], $cond);
        }
        $this->start_controls_section($id, $args);
    }

    /**
     * Optional leading icons for the fixed action buttons. Each picker accepts a
     * Font Awesome icon or an uploaded SVG; the chosen icon is rendered to HTML in
     * render() and passed through data-config so selector.js can inject it (the body
     * is client-rendered). Emoji can still be typed directly into the button labels.
     */
    private function register_icon_controls(): void
    {
        $this->section('icons', [
            'label' => __('Button icons', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $buttons = [
            'submit'         => __('Submit button', 'dcc-cottage-selector'),
            'restart'        => __('Restart button', 'dcc-cottage-selector'),
            'next'           => __('Next button', 'dcc-cottage-selector'),
            'back'           => __('Back button', 'dcc-cottage-selector'),
            'view'           => __('View cottage button', 'dcc-cottage-selector'),
            'compare'        => __('Compare chip (result card)', 'dcc-cottage-selector'),
            'edit_answers'   => __('Edit answers button', 'dcc-cottage-selector'),
            'mode_quick'     => __('Landing choice: Quick finder', 'dcc-cottage-selector'),
            'mode_weights'   => __('Landing choice: Weigh priorities', 'dcc-cottage-selector'),
            'mode_compare'   => __('Landing choice: Compare', 'dcc-cottage-selector'),
        ];
        foreach ($buttons as $key => $label) {
            $this->preset_control('icon_' . $key, [
                'label'       => $label,
                'type'        => Controls_Manager::ICONS,
                'skin'        => 'inline',
                'label_block' => false,
            ]);
        }

        $this->preset_control('icons_note', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('Leave a picker empty for no icon. You can also type an emoji directly into a label under “Text & labels”.', 'dcc-cottage-selector'),
            'content_classes' => 'elementor-descriptor',
        ]);

        $this->end_controls_section();
    }

    /** A keyed map of every icon the front end can place, name => editor label. */
    private static function icon_keys(): array
    {
        return [
            // Buttons + landing choices (declared in register_icon_controls()).
            'submit', 'restart', 'next', 'back', 'view', 'compare',
            'edit_answers', 'mode_quick', 'mode_weights', 'mode_compare',
            // Questions + answers (declared in register_qa_icon_controls()).
            'w_question', 'q_desk', 'q_pullout', 'q_layout', 'q_dining', 'q_pet', 'q_ground', 'q_screenedporch',
            'ans_yes', 'ans_no', 'ans_either', 'ans_studio', 'ans_onebed', 'ans_2', 'ans_4',
            'lvl_1', 'lvl_2', 'lvl_3',
        ];
    }

    /**
     * Optional leading icons for each wizard question and each answer option. Like
     * the button icons, the chosen icon is rendered in render() and injected by
     * selector.js (the body is client-rendered). Answer icons are keyed by option
     * value (ans_* for Quick finder, lvl_* for the Weigh-priorities levels).
     */
    private function register_qa_icon_controls(): void
    {
        $this->section('qa_icons', [
            'label' => __('Question & answer icons', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $questions = [
            'q_desk'     => __('Question: desk', 'dcc-cottage-selector'),
            'q_pullout'  => __('Question: pullout couch', 'dcc-cottage-selector'),
            'q_layout'   => __('Question: layout', 'dcc-cottage-selector'),
            'q_dining'   => __('Question: dining', 'dcc-cottage-selector'),
            'q_pet'      => __('Question: pet-friendly', 'dcc-cottage-selector'),
            'q_ground'   => __('Question: ground floor', 'dcc-cottage-selector'),
            'q_screenedporch' => __('Question: screened porch', 'dcc-cottage-selector'),
            'w_question' => __('Question: Weigh priorities (all)', 'dcc-cottage-selector'),
        ];
        $answers = [
            'ans_yes'    => __('Answer: Yes', 'dcc-cottage-selector'),
            'ans_no'     => __('Answer: No', 'dcc-cottage-selector'),
            'ans_either' => __('Answer: No preference', 'dcc-cottage-selector'),
            'ans_studio' => __('Answer: Studio', 'dcc-cottage-selector'),
            'ans_onebed' => __('Answer: 1-bedroom', 'dcc-cottage-selector'),
            'ans_2'      => __('Answer: Table for 2', 'dcc-cottage-selector'),
            'ans_4'      => __('Answer: Table for 4', 'dcc-cottage-selector'),
            'lvl_1'      => __('Answer: Low', 'dcc-cottage-selector'),
            'lvl_2'      => __('Answer: Medium', 'dcc-cottage-selector'),
            'lvl_3'      => __('Answer: High', 'dcc-cottage-selector'),
        ];
        foreach (array_merge($questions, $answers) as $key => $label) {
            $this->preset_control('icon_' . $key, [
                'label'       => $label,
                'type'        => Controls_Manager::ICONS,
                'skin'        => 'inline',
                'label_block' => false,
            ]);
        }

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
        $this->section('strings', [
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
            'review_heading'  => __('Wizard review heading', 'dcc-cottage-selector'),
            'reset'           => __('Reset button', 'dcc-cottage-selector'),
            'edit_answers'    => __('Edit answers button', 'dcc-cottage-selector'),
            'view_cottage'    => __('View cottage button', 'dcc-cottage-selector'),
            'compare_prompt'  => __('Compare subheader', 'dcc-cottage-selector'),
            'compare_need_two' => __('Compare “pick 2” tip', 'dcc-cottage-selector'),
            'compare_scroll_all' => __('Compare “scroll to see all” cue', 'dcc-cottage-selector'),
            'count_zero_hint' => __('Zero-match note', 'dcc-cottage-selector'),
        ];

        foreach ($editable as $key => $label) {
            $this->preset_control('str_' . $key, [
                'label'       => $label,
                'type'        => $key === 'intro' ? Controls_Manager::TEXTAREA : Controls_Manager::TEXT,
                'default'     => $defaults[$key] ?? '',
                'label_block' => true,
            ]);
        }

        $this->preset_control('strings_note', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('All other labels are translatable with Loco Translate (text domain: dcc-cottage-selector).', 'dcc-cottage-selector'),
            'content_classes' => 'elementor-descriptor',
        ]);

        $this->end_controls_section();
    }

    /**
     * Per-instance overrides for the wizard question + answer wording. These are the
     * same translatable Config::strings() keys; each str_<key> control flows through
     * the generic override in render(), so no extra plumbing is needed. (Translators
     * can still localize the defaults via Loco.)
     */
    private function register_qa_text_controls(): void
    {
        $this->section('qa_text', [
            'label' => __('Questions & answers text', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $defaults = Config::strings();
        $fields = [
            // Quick finder questions
            'q_desk'      => __('Question: desk', 'dcc-cottage-selector'),
            'q_pullout'   => __('Question: pullout couch', 'dcc-cottage-selector'),
            'q_layout'    => __('Question: layout', 'dcc-cottage-selector'),
            'q_dining'    => __('Question: dining', 'dcc-cottage-selector'),
            'q_pet'       => __('Question: pet-friendly', 'dcc-cottage-selector'),
            'q_ground'    => __('Question: ground floor', 'dcc-cottage-selector'),
            'q_screenedporch' => __('Question: screened porch', 'dcc-cottage-selector'),
            // Weigh priorities — the question template + the priority rows
            'w_question'  => __('Weigh priorities question (use %s)', 'dcc-cottage-selector'),
            'w_workspace' => __('Priority: Workspace', 'dcc-cottage-selector'),
            'w_moreroom'  => __('Priority: More room', 'dcc-cottage-selector'),
            'w_fewerstairs' => __('Priority: Fewer stairs', 'dcc-cottage-selector'),
            'w_pet'       => __('Priority: Pet-friendly', 'dcc-cottage-selector'),
            'w_studio'    => __('Priority: Studio simplicity', 'dcc-cottage-selector'),
            'w_onebed'    => __('Priority: 1-bedroom separation', 'dcc-cottage-selector'),
            'w_dining'    => __('Priority: Dining comfort', 'dcc-cottage-selector'),
            'w_pullout'   => __('Priority: Pullout couch', 'dcc-cottage-selector'),
            'w_screenedporch' => __('Priority: Screened-in porch', 'dcc-cottage-selector'),
            // Answer options
            'opt_yes'     => __('Answer: Yes', 'dcc-cottage-selector'),
            'opt_no'      => __('Answer: No', 'dcc-cottage-selector'),
            'opt_either'  => __('Answer: No preference', 'dcc-cottage-selector'),
            'opt_studio'  => __('Answer: Studio', 'dcc-cottage-selector'),
            'opt_onebed'  => __('Answer: 1-bedroom', 'dcc-cottage-selector'),
            'opt_seats2'  => __('Answer: Table for 2', 'dcc-cottage-selector'),
            'opt_seats4'  => __('Answer: Table for 4', 'dcc-cottage-selector'),
            'lvl_low'     => __('Answer: Low', 'dcc-cottage-selector'),
            'lvl_med'     => __('Answer: Medium', 'dcc-cottage-selector'),
            'lvl_high'    => __('Answer: High', 'dcc-cottage-selector'),
        ];
        // Use a placeholder (not a default) so an empty field keeps the translated /
        // Config string — only a typed value overrides it. This preserves Loco
        // translations for the many question/answer strings.
        foreach ($fields as $key => $label) {
            $this->preset_control('str_' . $key, [
                'label'       => $label,
                'type'        => Controls_Manager::TEXT,
                'placeholder' => $defaults[$key] ?? '',
                'label_block' => true,
            ]);
        }

        $this->end_controls_section();
    }

    /**
     * Editable text for the short-hand cottage description badges. Same str_<key>
     * override path; placeholder (not default) so an empty field keeps the
     * Config/Loco string.
     */
    private function register_badge_text_controls(): void
    {
        $this->section('badge_text', [
            'label' => __('Badge labels', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $defaults = Config::strings();
        $fields = [
            'badge_spacious' => __('Badge: 1-Bedroom (largest)', 'dcc-cottage-selector'),
            'badge_work'     => __('Badge: Work desk', 'dcc-cottage-selector'),
            'badge_compact'  => __('Badge: Studio layout', 'dcc-cottage-selector'),
            'badge_pet'      => __('Badge: Pet-friendly', 'dcc-cottage-selector'),
            'badge_ground'   => __('Badge: Ground floor', 'dcc-cottage-selector'),
            'badge_upstairs' => __('Badge: Upstairs', 'dcc-cottage-selector'),
            'badge_suite'    => __('Badge: 1-Bedroom suite', 'dcc-cottage-selector'),
            'badge_porch'    => __('Badge: Screened porch', 'dcc-cottage-selector'),
        ];
        foreach ($fields as $key => $label) {
            $this->preset_control('str_' . $key, [
                'label'       => $label,
                'type'        => Controls_Manager::TEXT,
                'placeholder' => $defaults[$key] ?? '',
                'label_block' => true,
            ]);
        }

        $this->end_controls_section();
    }

    /** Shorthand: a COLOR control that drives a CSS custom property on the root. */
    private function var_color(string $id, string $label, string $var, array $args = []): void
    {
        $this->preset_control($id, array_merge([
            'label'     => $label,
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::ROOT => $var . ': {{VALUE}};'],
        ], $args));
    }

    /** Overall size, spacing, alignment and the widget container. */
    private function register_layout_style_controls(): void
    {
        $this->section('style_layout', [
            'label' => __('Layout & spacing', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->preset_responsive_control('align', [
            'label'   => __('Text alignment', 'dcc-cottage-selector'),
            'type'    => Controls_Manager::CHOOSE,
            'options' => [
                'left'   => ['title' => __('Left', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-left'],
                'center' => ['title' => __('Center', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-center'],
                'right'  => ['title' => __('Right', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-right'],
            ],
            'selectors' => [self::ROOT => '--dccs-align: {{VALUE}};'],
        ]);

        $this->preset_responsive_control('content_max_width', [
            'label'      => __('Maximum width', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', '%'],
            'range'      => ['px' => ['min' => 320, 'max' => 1100, 'step' => 10], '%' => ['min' => 40, 'max' => 100]],
            'selectors'  => [self::ROOT => 'max-width: {{SIZE}}{{UNIT}};'],
        ]);

        $this->preset_responsive_control('root_padding', [
            'label'      => __('Padding', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em', 'rem'],
            'selectors'  => [self::ROOT => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->preset_responsive_control('corner_radius', [
            'label'      => __('Corner radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range'      => ['px' => ['min' => 0, 'max' => 40]],
            'selectors'  => [self::ROOT => '--dccs-radius: {{SIZE}}{{UNIT}};'],
        ]);

        $this->preset_responsive_control('section_gap', [
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
        $this->section('style_colors', [
            'label' => __('Colors', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->preset_control('inherit_theme', [
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
        $this->var_color('color_surface', __('Other surfaces (chips, table & pop-ups)', 'dcc-cottage-selector'), '--dccs-surface', [
            'description' => __('Background for answer chips, the compare table and the pop-up. Result cards, buttons and menus have their own settings below.', 'dcc-cottage-selector'),
        ]);
        $this->var_color('color_bg', __('Widget background', 'dcc-cottage-selector'), '--dccs-bg');
        $this->var_color('color_text', __('Text', 'dcc-cottage-selector'), '--dccs-text', $inherited);
        $this->var_color('color_muted', __('Muted text', 'dcc-cottage-selector'), '--dccs-muted');
        $this->var_color('color_border', __('Borders', 'dcc-cottage-selector'), '--dccs-border');
        $this->var_color('color_good', __('Positive highlight', 'dcc-cottage-selector'), '--dccs-good');
        $this->var_color('color_diff', __('Compare “differs” highlight', 'dcc-cottage-selector'), '--dccs-diff');

        // Result-card background (own control, split out of the generic surface).
        $this->preset_control('results_bg_heading', [
            'label'     => __('Results', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::HEADING,
            'separator' => 'before',
        ]);
        $this->var_color('color_results_bg', __('Results background', 'dcc-cottage-selector'), '--dccs-results-bg', [
            'description' => __('Background of the result cards on the matches screen.', 'dcc-cottage-selector'),
        ]);

        // Every button and menu trigger (Next / Back / Submit, the landing choices,
        // Compare, edit links, and the two dropdown trigger bars + panels).
        $this->preset_control('btn_bg_heading', [
            'label'     => __('Buttons & menus', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::HEADING,
            'separator' => 'before',
        ]);
        $this->var_color('color_btn_bg', __('Button background', 'dcc-cottage-selector'), '--dccs-btn-bg', [
            'description' => __('Applies to every button and menu trigger. Individual buttons with their own Style section (View cottage, Edit answers) can still override this.', 'dcc-cottage-selector'),
        ]);
        $this->var_color('color_btn_bg_hover', __('Button background (hover)', 'dcc-cottage-selector'), '--dccs-btn-bg-hover');

        // The individual selectable items inside the two dropdown menus.
        $this->preset_control('item_bg_heading', [
            'label'     => __('Drop-down menu items', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::HEADING,
            'separator' => 'before',
        ]);
        $this->var_color('color_item_bg', __('Item background', 'dcc-cottage-selector'), '--dccs-item-bg');
        $this->var_color('color_item_text', __('Item text', 'dcc-cottage-selector'), '--dccs-item-text');
        $this->var_color('color_item_bg_hover', __('Item background (hover)', 'dcc-cottage-selector'), '--dccs-item-bg-hover');
        $this->var_color('color_item_text_hover', __('Item text (hover)', 'dcc-cottage-selector'), '--dccs-item-text-hover');

        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'      => 'base_typography',
            'selector'  => self::SEL,
            'separator' => 'before',
        ]);

        $this->end_controls_section();
    }

    /** Heading + intro typography and color. */
    private function register_heading_style_controls(): void
    {
        $this->section('style_heading', [
            'label' => __('Heading & intro', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->preset_control('heading_color', [
            'label'     => __('Heading color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-heading' => 'color: {{VALUE}};'],
        ]);
        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'heading_typography',
            'selector' => self::SEL . '.dccs-heading',
        ]);
        $this->preset_control('intro_color', [
            'label'     => __('Intro color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-intro' => 'color: {{VALUE}};'],
        ]);
        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'intro_typography',
            'selector' => self::SEL . '.dccs-intro',
        ]);

        $this->end_controls_section();
    }

    /** The top mode-switcher dropdown (trigger + options). */
    private function register_modebar_style_controls(): void
    {
        $this->section('style_modebar', [
            'label' => __('Mode switcher', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->preset_responsive_control('menu_align', [
            'label'   => __('Option alignment', 'dcc-cottage-selector'),
            'type'    => Controls_Manager::CHOOSE,
            'options' => [
                'left'   => ['title' => __('Left', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-left'],
                'center' => ['title' => __('Center', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-center'],
                'right'  => ['title' => __('Right', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-right'],
            ],
            'selectors' => [self::ROOT => '--dccs-menu-align: {{VALUE}};'],
        ]);
        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'modetab_typography',
            'selector' => self::SEL . '.dccs-modeselect-trigger, ' . self::SEL . '.dccs-modetab',
        ]);
        // Normal/Hover style the closed switcher BUTTON itself; "Selected" styles the
        // highlighted option inside the open drop-down. Leaving a color empty falls back
        // to the global Colors → Buttons & menus values.
        $this->start_controls_tabs('modetab_tabs');
        $this->start_controls_tab('modetab_normal', ['label' => __('Normal', 'dcc-cottage-selector')]);
        $this->preset_control('modetab_color', [
            'label'     => __('Trigger text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-modeselect-trigger' => 'color: {{VALUE}};',
            ],
        ]);
        $this->preset_control('modetab_bg', [
            'label'     => __('Trigger background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-modeselect-trigger' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();
        $this->start_controls_tab('modetab_hover', ['label' => __('Hover', 'dcc-cottage-selector')]);
        $this->preset_control('modetab_color_hover', [
            'label'     => __('Trigger text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-modeselect-trigger:hover'         => 'color: {{VALUE}};',
                self::SEL . '.dccs-modeselect-trigger:focus-visible' => 'color: {{VALUE}};',
            ],
        ]);
        $this->preset_control('modetab_bg_hover', [
            'label'     => __('Trigger background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-modeselect-trigger:hover'         => 'background-color: {{VALUE}};',
                self::SEL . '.dccs-modeselect-trigger:focus-visible' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();
        $this->start_controls_tab('modetab_active', ['label' => __('Selected', 'dcc-cottage-selector')]);
        $this->preset_control('modetab_color_active', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-modetab.is-active' => 'color: {{VALUE}};'],
        ]);
        $this->preset_control('modetab_bg_active', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-modetab.is-active' => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->end_controls_tabs();

        $this->add_dropdown_shape_effects(
            'mode',
            self::SEL . '.dccs-modeselect-trigger',
            self::SEL . '.dccs-modeselect-list',
            self::SEL . '.dccs-modetab'
        );

        $this->end_controls_section();
    }

    /** Progress label, live count badge and the stepper dots. */
    private function register_progress_style_controls(): void
    {
        $this->section('style_progress', [
            'label' => __('Progress & steps', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->preset_responsive_control('dot_height', [
            'label'      => __('Step bar thickness', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range'      => ['px' => ['min' => 2, 'max' => 16]],
            'selectors'  => [self::ROOT => '--dccs-dot-h: {{SIZE}}{{UNIT}};'],
        ]);
        $this->preset_control('dot_done_color', [
            'label'     => __('Completed step color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-step-dot.is-done' => 'background-color: {{VALUE}};'],
        ]);
        $this->preset_control('dot_idle_color', [
            'label'     => __('Upcoming step color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-step-dot' => 'background-color: {{VALUE}};'],
        ]);
        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'progress_label_typography',
            'selector' => self::SEL . '.dccs-progress-label',
        ]);
        $this->preset_control('progress_label_color', [
            'label'     => __('Progress label color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-progress-label' => 'color: {{VALUE}};'],
        ]);
        $this->preset_control('count_bg', [
            'label'     => __('Match-count background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-count' => 'background-color: {{VALUE}};'],
        ]);
        $this->preset_control('count_color', [
            'label'     => __('Match-count text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-count' => 'color: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    /** The question text and the answer chips (Normal / Hover / Selected). */
    private function register_question_style_controls(): void
    {
        $this->section('style_question', [
            'label' => __('Questions & answers', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'question_typography',
            'selector' => self::SEL . '.dccs-step-q',
        ]);
        $this->preset_control('question_color', [
            'label'     => __('Question color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-step-q' => 'color: {{VALUE}};'],
        ]);
        $this->preset_control('question_bg', [
            'label'     => __('Question background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-step-q' => 'background-color: {{VALUE}};'],
        ]);
        $this->preset_responsive_control('question_align', [
            'label'   => __('Question alignment', 'dcc-cottage-selector'),
            'type'    => Controls_Manager::CHOOSE,
            'options' => [
                'left'   => ['title' => __('Left', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-left'],
                'center' => ['title' => __('Center', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-center'],
                'right'  => ['title' => __('Right', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-right'],
            ],
            'selectors' => [self::ROOT => '--dccs-question-align: {{VALUE}};'],
        ]);
        $this->add_icon_side_control('questions');

        $this->preset_responsive_control('answer_align', [
            'label'   => __('Answer alignment', 'dcc-cottage-selector'),
            'type'    => Controls_Manager::CHOOSE,
            'options' => [
                'left'   => ['title' => __('Left', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-left'],
                'center' => ['title' => __('Center', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-center'],
                'right'  => ['title' => __('Right', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-right'],
            ],
            'selectors' => [self::ROOT => '--dccs-answer-align: {{VALUE}};'],
        ]);
        $this->add_icon_side_control('answers');
        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'chip_typography',
            'selector' => self::SEL . '.dccs-chip',
        ]);
        $this->preset_group_control(Group_Control_Border::get_type(), [
            'name'     => 'chip_border',
            'selector' => self::SEL . '.dccs-chip',
        ]);
        $this->preset_responsive_control('chip_radius', [
            'label'      => __('Answer radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [self::SEL . '.dccs-chip' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->preset_responsive_control('chip_padding', [
            'label'      => __('Answer padding', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [self::SEL . '.dccs-chip' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        $this->start_controls_tabs('chip_tabs');
        $this->start_controls_tab('chip_normal', ['label' => __('Normal', 'dcc-cottage-selector')]);
        $this->preset_control('chip_color', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-chip' => 'color: {{VALUE}};'],
        ]);
        $this->preset_control('chip_bg', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-chip' => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->start_controls_tab('chip_hover', ['label' => __('Hover', 'dcc-cottage-selector')]);
        $this->preset_control('chip_color_hover', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-chip:hover'         => 'color: {{VALUE}};',
                self::SEL . '.dccs-chip:focus-visible' => 'color: {{VALUE}};',
            ],
        ]);
        $this->preset_control('chip_bg_hover', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-chip:hover'         => 'background-color: {{VALUE}};',
                self::SEL . '.dccs-chip:focus-visible' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();
        $this->start_controls_tab('chip_selected', ['label' => __('Selected', 'dcc-cottage-selector')]);
        $this->preset_control('chip_color_active', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-chip.is-active' => 'color: {{VALUE}};'],
        ]);
        $this->preset_control('chip_bg_active', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-chip.is-active' => 'background-color: {{VALUE}};'],
        ]);
        $this->preset_control('chip_border_active', [
            'label'     => __('Border', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-chip.is-active' => 'border-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->end_controls_tabs();

        $this->end_controls_section();
    }

    /** Primary button (Next / See matches) + the low-emphasis link controls. */
    /**
     * A self-contained "button" Style section: typography, border, radius, padding,
     * content alignment, and Normal/Hover text + background. Used for the Edit-answers
     * button and the View-cottage link so each can be styled independently of the
     * primary Next/Submit buttons. $sel already carries the self::SEL specificity.
     */
    /** A Left/Right select controlling which side of the label an icon sits on. */
    private function add_icon_side_control(string $key): void
    {
        $this->preset_control('icon_side_' . $key, [
            'label'   => __('Icon side', 'dcc-cottage-selector'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'left',
            'options' => [
                'left'  => __('Left of text', 'dcc-cottage-selector'),
                'right' => __('Right of text', 'dcc-cottage-selector'),
            ],
        ]);
    }

    private function add_button_style_section(string $id, string $label, string $sel, string $side_key = ''): void
    {
        $this->section($id, ['label' => $label, 'tab' => Controls_Manager::TAB_STYLE]);

        if ($side_key !== '') {
            $this->add_icon_side_control($side_key);
        }

        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'     => $id . '_typography',
            'selector' => $sel,
        ]);
        $this->preset_group_control(Group_Control_Border::get_type(), [
            'name'     => $id . '_border',
            'selector' => $sel,
        ]);
        $this->preset_responsive_control($id . '_radius', [
            'label'      => __('Corner radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [$sel => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->preset_responsive_control($id . '_padding', [
            'label'      => __('Padding', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [$sel => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->preset_responsive_control($id . '_align', [
            'label'   => __('Text alignment', 'dcc-cottage-selector'),
            'type'    => Controls_Manager::CHOOSE,
            'options' => [
                'left'   => ['title' => __('Left', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-left'],
                'center' => ['title' => __('Center', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-center'],
                'right'  => ['title' => __('Right', 'dcc-cottage-selector'), 'icon' => 'eicon-text-align-right'],
            ],
            'selectors' => [$sel => 'text-align: {{VALUE}}; justify-content: {{VALUE}};'],
        ]);

        $this->start_controls_tabs($id . '_tabs');
        $this->start_controls_tab($id . '_normal', ['label' => __('Normal', 'dcc-cottage-selector')]);
        $this->preset_control($id . '_color', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [$sel => 'color: {{VALUE}};'],
        ]);
        $this->preset_control($id . '_bg', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [$sel => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->start_controls_tab($id . '_hover', ['label' => __('Hover', 'dcc-cottage-selector')]);
        $this->preset_control($id . '_color_hover', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                $sel . ':hover'         => 'color: {{VALUE}};',
                $sel . ':focus-visible' => 'color: {{VALUE}};',
            ],
        ]);
        $this->preset_control($id . '_bg_hover', [
            'label'     => __('Background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                $sel . ':hover'         => 'background-color: {{VALUE}};',
                $sel . ':focus-visible' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();
        $this->end_controls_tabs();

        $this->end_controls_section();
    }

    /** Dedicated styling for the "Edit answers" button (decoupled from the primary CTA). */
    private function register_editanswers_style_controls(): void
    {
        $this->add_button_style_section('style_editanswers', __('Edit answers button', 'dcc-cottage-selector'), self::SEL . '.dccs-edit-answers', 'edit_answers');
    }

    /** Dedicated styling for the "View this cottage" link on each result card. */
    private function register_viewbtn_style_controls(): void
    {
        $this->add_button_style_section('style_viewbtn', __('View cottage button', 'dcc-cottage-selector'), self::SEL . '.dccs-view', 'view');
    }

    /**
     * Dedicated styling for the "Compare N cottages" button. This is ONE element
     * (.dccs-open-compare) rendered in two places — the Compare-mode CTA under the
     * cottage checklist, and the button that appears under the Matching Quiz results
     * once two or more cards are ticked — so these controls govern both.
     */
    private function register_comparebtn_style_controls(): void
    {
        $this->add_button_style_section('style_comparebtn', __('Compare button', 'dcc-cottage-selector'), self::SEL . '.dccs-open-compare');
    }

    private function register_button_style_controls(): void
    {
        $this->section('style_buttons', [
            'label' => __('Buttons', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        // The green default that separates the navigation/action buttons (Next, Back,
        // Edit answers, Restart, See matches) from the accent-blue answer selections.
        // The global "Button background" (Colors) still overrides this when set.
        $this->var_color('color_action', __('Action button color (Next / Back / Restart …)', 'dcc-cottage-selector'), '--dccs-action', [
            'description' => __('Default background for the navigation & action buttons, kept distinct from the answer buttons.', 'dcc-cottage-selector'),
        ]);

        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'      => 'btn_typography',
            'selector'  => self::SEL . '.dccs-primary',
            'separator' => 'before',
        ]);
        $this->preset_responsive_control('btn_radius', [
            'label'      => __('Button radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [self::SEL . '.dccs-primary' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->preset_responsive_control('btn_padding', [
            'label'      => __('Button padding', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [self::SEL . '.dccs-primary' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);

        // Button background (normal + hover) is set globally in Colors → Buttons &
        // menus; this section keeps the primary button's text color and typography.
        $this->start_controls_tabs('btn_tabs');
        $this->start_controls_tab('btn_normal', ['label' => __('Normal', 'dcc-cottage-selector')]);
        $this->preset_control('btn_color', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-primary' => 'color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();
        $this->start_controls_tab('btn_hover', ['label' => __('Hover', 'dcc-cottage-selector')]);
        $this->preset_control('btn_color_hover', [
            'label'     => __('Text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-primary:hover'         => 'color: {{VALUE}};',
                self::SEL . '.dccs-primary:focus-visible' => 'color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();
        $this->end_controls_tabs();

        $this->preset_control('link_color', [
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
        $this->section('style_cards', [
            'label' => __('Result cards', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        // Card background is set in Colors → Results background.
        $this->preset_group_control(Group_Control_Border::get_type(), [
            'name'     => 'card_border',
            'selector' => self::SEL . '.dccs-card',
        ]);
        $this->preset_responsive_control('card_radius', [
            'label'      => __('Radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [self::SEL . '.dccs-card' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->preset_responsive_control('card_padding', [
            'label'      => __('Padding', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [self::SEL . '.dccs-card' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->preset_group_control(Group_Control_Box_Shadow::get_type(), [
            'name'     => 'card_shadow',
            'selector' => self::SEL . '.dccs-card',
        ]);
        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'card_title_typography',
            'selector' => self::SEL . '.dccs-card h4',
        ]);
        $this->preset_control('badge_bg', [
            'label'     => __('Badge background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'separator' => 'before',
            'selectors' => [self::SEL . '.dccs-badge' => 'background-color: {{VALUE}};'],
        ]);
        $this->preset_control('badge_color', [
            'label'     => __('Badge text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-badge' => 'color: {{VALUE}};'],
        ]);
        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'badge_typography',
            'selector' => self::SEL . '.dccs-badge',
        ]);
        $this->preset_responsive_control('badge_radius', [
            'label'      => __('Badge radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', '%'],
            'range'      => ['px' => ['min' => 0, 'max' => 30]],
            'selectors'  => [self::SEL . '.dccs-badge' => 'border-radius: {{SIZE}}{{UNIT}};'],
        ]);

        $this->end_controls_section();
    }

    /** The side-by-side comparison table. */
    private function register_compare_style_controls(): void
    {
        $this->section('style_compare', [
            'label' => __('Compare table', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->preset_control('matrix_head_bg', [
            'label'     => __('Header background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-matrix thead th' => 'background-color: {{VALUE}};'],
        ]);
        $this->preset_control('matrix_head_color', [
            'label'     => __('Header text', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-matrix thead th' => 'color: {{VALUE}};'],
        ]);
        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'matrix_typography',
            'selector' => self::SEL . '.dccs-matrix td, ' . self::SEL . '.dccs-matrix th',
        ]);
        $this->preset_control('matrix_diff_bg', [
            'label'     => __('“Differs” cell highlight', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.dccs-matrix td.is-diff' => 'background-color: {{VALUE}};'],
        ]);
        $this->preset_control('matrix_border', [
            'label'     => __('Cell borders', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.dccs-matrix th' => 'border-color: {{VALUE}};',
                self::SEL . '.dccs-matrix td' => 'border-color: {{VALUE}};',
            ],
        ]);

        $this->end_controls_section();
    }

    /** The compare-mode cottage picker (its own dropdown, mirrors the mode switcher). */
    private function register_cmpmenu_style_controls(): void
    {
        $this->section('style_cmpmenu', [
            'label' => __('Compare picker', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        // The compare picker is an always-visible checklist (no trigger). Row/option
        // colors come from Colors → Drop-down menu items; the panel background from
        // Colors → Buttons & menus. This section styles the checklist box + rows.
        $this->preset_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'cmpmenu_typography',
            'selector' => self::SEL . '.dccs-cmp-option',
        ]);
        $this->preset_group_control(Group_Control_Border::get_type(), [
            'name'     => 'cmpmenu_panel_border',
            'selector' => self::SEL . '.dccs-cmp-list',
        ]);
        $this->preset_responsive_control('cmpmenu_panel_radius', [
            'label'      => __('Checklist corner radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', '%'],
            'range'      => ['px' => ['min' => 0, 'max' => 40], '%' => ['min' => 0, 'max' => 50]],
            'selectors'  => [self::SEL . '.dccs-cmp-list' => 'border-radius: {{SIZE}}{{UNIT}};'],
        ]);
        $this->preset_responsive_control('cmpmenu_item_padding', [
            'label'      => __('Row padding', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [self::SEL . '.dccs-cmp-option' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->preset_group_control(Group_Control_Box_Shadow::get_type(), [
            'name'     => 'cmpmenu_panel_shadow',
            'selector' => self::SEL . '.dccs-cmp-list',
        ]);

        $this->end_controls_section();
    }

    /**
     * Shared "Shape" + "Effects" controls for a dropdown menu (trigger + panel +
     * items). Used by both the mode switcher and the compare picker so they expose
     * identical corner-radius, border, padding, panel-shadow, hover and transition
     * controls. $prefix keeps the generated control names unique per menu; the three
     * selector strings already include the self::SEL specificity prefix.
     */
    private function add_dropdown_shape_effects(string $prefix, string $trigger, string $panel, string $item): void
    {
        $this->preset_control($prefix . '_shape_heading', [
            'label'     => __('Shape', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::HEADING,
            'separator' => 'before',
        ]);
        $this->preset_responsive_control($prefix . '_trigger_radius', [
            'label'      => __('Trigger corner radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', '%'],
            'range'      => ['px' => ['min' => 0, 'max' => 100], '%' => ['min' => 0, 'max' => 50]],
            'selectors'  => [$trigger => 'border-radius: {{SIZE}}{{UNIT}};'],
        ]);
        $this->preset_responsive_control($prefix . '_panel_radius', [
            'label'      => __('Menu panel corner radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', '%'],
            'range'      => ['px' => ['min' => 0, 'max' => 100], '%' => ['min' => 0, 'max' => 50]],
            'selectors'  => [$panel => 'border-radius: {{SIZE}}{{UNIT}};'],
        ]);
        $this->preset_responsive_control($prefix . '_item_radius', [
            'label'      => __('Item corner radius', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', '%'],
            'range'      => ['px' => ['min' => 0, 'max' => 60], '%' => ['min' => 0, 'max' => 50]],
            'selectors'  => [$item => 'border-radius: {{SIZE}}{{UNIT}};'],
        ]);
        $this->preset_responsive_control($prefix . '_item_padding', [
            'label'      => __('Item padding', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [$item => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'],
        ]);
        $this->preset_group_control(Group_Control_Border::get_type(), [
            'name'     => $prefix . '_trigger_border',
            'selector' => $trigger,
        ]);

        $this->preset_control($prefix . '_fx_heading', [
            'label'     => __('Effects', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::HEADING,
            'separator' => 'before',
        ]);
        $this->preset_group_control(Group_Control_Box_Shadow::get_type(), [
            'name'     => $prefix . '_panel_shadow',
            'selector' => $panel,
        ]);
        // Item hover colors are set globally in Colors → Drop-down menu items.
        $this->preset_responsive_control($prefix . '_transition', [
            'label'      => __('Hover transition speed', 'dcc-cottage-selector'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['ms'],
            'range'      => ['ms' => ['min' => 0, 'max' => 1000, 'step' => 10]],
            'selectors'  => [
                $trigger => 'transition-duration: {{SIZE}}ms;',
                $item    => 'transition-duration: {{SIZE}}ms;',
            ],
        ]);
    }

    /**
     * Render each chosen button icon to a trusted HTML string keyed by the JS-side
     * name (submit/restart/next/back/view/compare). Empty pickers are omitted.
     *
     * @param array<string,mixed> $settings
     * @return array<string,string>
     */
    private static function collect_icons(array $settings): array
    {
        $keys = self::icon_keys();
        $icons = [];
        foreach ($keys as $key) {
            $icon = $settings['icon_' . $key] ?? null;
            $html = self::icon_html($icon);
            if ($html !== '') {
                $icons[$key] = $html;
            }
        }
        return $icons;
    }

    /**
     * Which side ('left'|'right') each icon-bearing element places its icon on.
     * Mirrors the icon_side_* SELECT controls; defaults to 'left'.
     *
     * @param array<string,mixed> $settings
     * @return array<string,string>
     */
    private static function collect_icon_sides(array $settings): array
    {
        $sides = [];
        foreach (['edit_answers', 'view', 'questions', 'answers'] as $key) {
            $sides[$key] = ($settings['icon_side_' . $key] ?? 'left') === 'right' ? 'right' : 'left';
        }
        return $sides;
    }

    /**
     * Render an Elementor ICONS control value (Font Awesome or uploaded SVG) to an
     * HTML string. Returns '' when nothing is selected or the icon manager is absent.
     *
     * @param mixed $icon
     */
    private static function icon_html($icon): string
    {
        if (!is_array($icon) || empty($icon['value']) || !class_exists('\Elementor\Icons_Manager')) {
            return '';
        }
        ob_start();
        \Elementor\Icons_Manager::render_icon($icon, ['aria-hidden' => 'true']);
        return trim((string) ob_get_clean());
    }

    /**
     * Assemble the full front-end config from this widget instance's settings:
     * per-instance string overrides, icons, icon sides, mode + heading options.
     * Shared by the Selector and the Mini-Entry (which subclasses this widget), so
     * both popups carry the same text + style customizations. $extra is merged last
     * (e.g. the Mini-Entry passes 'highlight').
     *
     * @param array<string,mixed> $extra
     * @return array<string,mixed>
     */
    protected function build_config(array $extra = []): array
    {
        return self::config_from_snapshot(self::design_snapshot($this->get_settings_for_display()), $extra);
    }

    /**
     * Distil a settings array into the portable design payload (string overrides,
     * icons, icon sides, mode + heading options) that drives the front end. Static so
     * it works on a raw settings array with no bound widget — used both by
     * build_config() and by the design-publishing path (render + the save hook).
     *
     * @param array<string,mixed> $settings
     * @return array<string,mixed>
     */
    public static function design_snapshot(array $settings): array
    {
        $string_overrides = [];
        foreach ($settings as $k => $v) {
            if (strncmp((string) $k, 'str_', 4) === 0 && is_scalar($v)) {
                $string_overrides[substr((string) $k, 4)] = (string) $v;
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

        return [
            'string_overrides' => $string_overrides,
            'startMode'        => (string) $start,
            'enabledModes'     => array_values($enabled),
            'showHeading'      => ($settings['show_heading'] ?? 'yes') === 'yes',
            'showReview'       => ($settings['show_review'] ?? '') === 'yes',
            'icons'            => self::collect_icons($settings),
            'iconSides'        => self::collect_icon_sides($settings),
            'cssVars'          => self::collect_css_vars($settings),
        ];
    }

    /**
     * The palette + spacing as CSS custom properties (the same `--dccs-*` vars the
     * colour/slider style controls feed through Elementor `selectors`). Emitted INLINE
     * on a mirrored pop-up root so the colours/spacing survive SpeedyCache's "remove
     * unused CSS" — inline properties win over (and are never stripped with) the
     * deferred stylesheets. Only explicitly-set values are returned; the rest fall
     * through to selector.css's baked defaults, exactly as on the source Selector.
     *
     * @param array<string,mixed> $settings
     * @return array<string,string>
     */
    private static function collect_css_vars(array $settings): array
    {
        $vars = [];
        $colors = [
            'color_accent'      => '--dccs-accent',
            'color_accent_text' => '--dccs-accent-text',
            'color_accent2'     => '--dccs-accent-2',
            'color_surface'     => '--dccs-surface',
            'color_bg'          => '--dccs-bg',
            'color_text'        => '--dccs-text',
            'color_muted'       => '--dccs-muted',
            'color_border'      => '--dccs-border',
            'color_good'        => '--dccs-good',
            'color_diff'        => '--dccs-diff',
            'color_action'        => '--dccs-action',
            'color_results_bg'    => '--dccs-results-bg',
            'color_btn_bg'        => '--dccs-btn-bg',
            'color_btn_bg_hover'  => '--dccs-btn-bg-hover',
            'color_item_bg'       => '--dccs-item-bg',
            'color_item_text'     => '--dccs-item-text',
            'color_item_bg_hover' => '--dccs-item-bg-hover',
            'color_item_text_hover' => '--dccs-item-text-hover',
        ];
        foreach ($colors as $key => $var) {
            $v = $settings[$key] ?? '';
            if (is_string($v) && $v !== '') {
                $vars[$var] = $v;
            }
        }
        // SLIDER controls store ['size' => n, 'unit' => 'px'].
        $sliders = [
            'corner_radius' => '--dccs-radius',
            'section_gap'   => '--dccs-gap',
        ];
        foreach ($sliders as $key => $var) {
            $sz = $settings[$key] ?? null;
            if (is_array($sz) && isset($sz['size']) && $sz['size'] !== '') {
                $vars[$var] = $sz['size'] . ($sz['unit'] ?? 'px');
            }
        }
        return $vars;
    }

    /**
     * Build the full front-end config from a design snapshot. $extra is merged last
     * (e.g. a Mini Entry passes 'highlight').
     *
     * @param array<string,mixed> $snap
     * @param array<string,mixed> $extra
     * @return array<string,mixed>
     */
    public static function config_from_snapshot(array $snap, array $extra = []): array
    {
        return Config::build($snap['string_overrides'] ?? [], array_merge([
            'startMode'    => $snap['startMode'] ?? 'quick',
            'enabledModes' => $snap['enabledModes'] ?? ['quick', 'weights', 'compare'],
            'showHeading'  => $snap['showHeading'] ?? true,
            'showReview'   => $snap['showReview'] ?? false,
            'icons'        => $snap['icons'] ?? [],
            'iconSides'    => $snap['iconSides'] ?? [],
            'cssVars'      => $snap['cssVars'] ?? [],
        ], $extra));
    }

    /**
     * Publish a Selector's design into the shared registry option so Mini Entry
     * widgets can mirror it. Stores the portable snapshot plus the source's Elementor
     * scope classes (so the mirrored pop-up can reuse the source's generated CSS).
     * Deduped by hash so ordinary front-end views don't thrash the DB.
     *
     * @param array<string,mixed> $settings
     */
    public static function publish_design(string $name, int $post_id, string $el_id, array $settings): void
    {
        $name = trim($name);
        if ($name === '' || $post_id <= 0 || $el_id === '') {
            return;
        }

        $entry = [
            'post_id'    => $post_id,
            'page_class' => 'elementor-' . $post_id,
            'el_class'   => 'elementor-element-' . $el_id,
            'overrides'  => self::design_snapshot($settings),
        ];
        $entry['hash'] = md5((string) wp_json_encode($entry));

        $sources = get_option(self::DESIGN_OPTION, []);
        if (!is_array($sources)) {
            $sources = [];
        }
        if (isset($sources[$name]['hash']) && $sources[$name]['hash'] === $entry['hash']) {
            return; // Unchanged — skip the write.
        }
        $entry['updated'] = time();
        $sources[$name]   = $entry;
        update_option(self::DESIGN_OPTION, $sources, false);
    }

    protected function render(): void
    {
        $settings = $this->get_settings_for_display();

        // Publish this design for Mini Entries to mirror (the Elementor save hook is
        // the authoritative refresh; this keeps the registry fresh on front-end views).
        // The post id must be the document that CONTAINS the widget — get_the_ID()
        // alone would return the host page when the Selector renders via a global
        // template/shortcode, and a wrong id poisons the mirror's CSS scope.
        if (($settings['share_design'] ?? '') === 'yes') {
            $post_id = 0;
            if (class_exists('\Elementor\Plugin')) {
                $doc = \Elementor\Plugin::$instance->documents->get_current();
                if ($doc) {
                    $post_id = (int) $doc->get_main_id();
                }
            }
            if ($post_id <= 0 && is_singular()) {
                $post_id = (int) get_the_ID();
            }
            self::publish_design(
                (string) ($settings['design_name'] ?? ''),
                $post_id,
                (string) $this->get_id(),
                $settings
            );
        }

        $cottages = Data::all();

        $config = $this->build_config();

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
        <div class="<?php echo esc_attr($root_class); ?>" data-config="<?php echo esc_attr((string) (wp_json_encode($config) ?: '{}')); ?>">
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
