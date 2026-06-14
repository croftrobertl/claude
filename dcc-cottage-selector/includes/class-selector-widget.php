<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

use Elementor\Widget_Base;
use Elementor\Controls_Manager;
use Elementor\Group_Control_Typography;

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
        return ['dccs-selector'];
    }

    public function get_style_depends(): array
    {
        return ['dccs-selector'];
    }

    protected function register_controls(): void
    {
        $this->register_content_controls();
        $this->register_strings_controls();
        $this->register_style_controls();
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

        $this->add_control('remember', [
            'label'        => __('Remember visitor choices', 'dcc-cottage-selector'),
            'description'  => __('Saves the last preferences in the browser so returning guests resume where they left off.', 'dcc-cottage-selector'),
            'type'         => Controls_Manager::SWITCHER,
            'default'      => 'yes',
            'return_value' => 'yes',
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
            'mode_quick'      => __('Tab: Quick Pick', 'dcc-cottage-selector'),
            'mode_weights'    => __('Tab: What Matters Most', 'dcc-cottage-selector'),
            'mode_compare'    => __('Tab: Compare', 'dcc-cottage-selector'),
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

    /**
     * Style controls map to CSS custom properties on .dccs-root. Controls carry
     * no defaults — the baked look lives in selector.css; these are override-only.
     */
    private function register_style_controls(): void
    {
        $this->start_controls_section('style', [
            'label' => __('Style', 'dcc-cottage-selector'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('color_accent', [
            'label'     => __('Accent color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--dccs-accent: {{VALUE}};'],
        ]);

        $this->add_control('color_accent_text', [
            'label'     => __('Accent text color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--dccs-accent-text: {{VALUE}};'],
        ]);

        $this->add_control('color_surface', [
            'label'     => __('Card background', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--dccs-surface: {{VALUE}};'],
        ]);

        $this->add_control('color_text', [
            'label'     => __('Text color', 'dcc-cottage-selector'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--dccs-text: {{VALUE}};'],
        ]);

        $this->add_group_control(Group_Control_Typography::get_type(), [
            'name'     => 'base_typography',
            'selector' => self::SEL,
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
            'remember'     => ($settings['remember'] ?? 'yes') === 'yes',
        ]);

        if (empty($cottages)) {
            printf(
                '<div class="dccs-root dccs-root"><p class="dccs-unavailable">%s</p></div>',
                esc_html($config['strings']['unavailable'])
            );
            return;
        }

        $strings = $config['strings'];
        ?>
        <div class="dccs-root dccs-root" data-config="<?php echo esc_attr((string) wp_json_encode($config)); ?>">
            <noscript>
                <ul class="dccs-noscript">
                    <?php foreach ($cottages as $c) : ?>
                        <li>
                            <a href="<?php echo esc_url((string) ($c['pageUrl'] ?? '#')); ?>">
                                <?php echo esc_html((string) ($c['name'] ?? '')); ?>
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
