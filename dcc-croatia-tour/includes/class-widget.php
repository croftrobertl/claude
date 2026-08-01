<?php
namespace DCCTour;

use Elementor\Controls_Manager;
use Elementor\Widget_Base;

if (!defined('ABSPATH')) {
    exit;
}

final class Widget extends Widget_Base
{
    // Doubled class reaches (0,4,0) so the loader's style rules outrank Bravada's
    // (0,3,1) Elementor-kit resets. Same trick as Widget::SEL in the MPHB plugin.
    private const SEL = '{{WRAPPER}} .dcc-tour-root.dcc-tour-root ';

    public function get_name(): string
    {
        return 'dcc_croatia_tour';
    }

    public function get_title(): string
    {
        return __('Croatia Tour', 'dcc-croatia-tour');
    }

    public function get_icon(): string
    {
        return 'eicon-google-maps';
    }

    public function get_categories(): array
    {
        return ['claude-code'];
    }

    public function get_keywords(): array
    {
        return ['croatia', 'tour', 'map', 'trip', 'photos', 'travel'];
    }

    public function get_script_depends(): array
    {
        return ['dcc-tour-loader'];
    }

    public function get_style_depends(): array
    {
        return ['dcc-tour-loader'];
    }

    public static function register_assets(): void
    {
        wp_register_style(
            'dcc-tour-loader',
            DCC_TOUR_URL . 'assets/loader.css',
            [],
            DCC_TOUR_VERSION
        );
        wp_register_script(
            'dcc-tour-loader',
            DCC_TOUR_URL . 'assets/loader.js',
            [],
            DCC_TOUR_VERSION,
            true
        );
    }

    public static function enqueue_for_preview(): void
    {
        self::register_assets();
        wp_enqueue_style('dcc-tour-loader');
        wp_enqueue_script('dcc-tour-loader');
    }

    protected function register_controls(): void
    {
        $this->register_content_controls();
        $this->register_layout_controls();
        $this->register_style_controls();
    }

    private function register_content_controls(): void
    {
        $this->start_controls_section('section_content', [
            'label' => __('Tour data', 'dcc-croatia-tour'),
        ]);

        $this->add_control('bundle_url', [
            'label'       => __('Bundle URL', 'dcc-croatia-tour'),
            'type'        => Controls_Manager::URL,
            'default'     => ['url' => DCC_TOUR_DEFAULT_BUNDLE_URL],
            'placeholder' => DCC_TOUR_DEFAULT_BUNDLE_URL,
            'show_external' => false,
            'description' => __('URL of the published croatia/ folder. Defaults to GitHub Pages.', 'dcc-croatia-tour'),
        ]);

        $this->end_controls_section();
    }

    private function register_layout_controls(): void
    {
        $this->start_controls_section('section_layout', [
            'label' => __('Layout', 'dcc-croatia-tour'),
        ]);

        $this->add_responsive_control('height', [
            'label'      => __('Height', 'dcc-croatia-tour'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px', 'vh'],
            'range'      => [
                'px' => ['min' => 360, 'max' => 1200, 'step' => 10],
                'vh' => ['min' => 40, 'max' => 100, 'step' => 1],
            ],
            'default'           => ['unit' => 'px', 'size' => 720],
            'tablet_default'    => ['unit' => 'px', 'size' => 640],
            'mobile_default'    => ['unit' => 'px', 'size' => 560],
            'selectors'  => [self::SEL => 'min-height: {{SIZE}}{{UNIT}};'],
        ]);

        $this->end_controls_section();
    }

    private function register_style_controls(): void
    {
        $this->start_controls_section('section_style', [
            'label' => __('Theme', 'dcc-croatia-tour'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('primary_color', [
            'label'     => __('Primary color', 'dcc-croatia-tour'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--dcc-tour-primary: {{VALUE}};'],
        ]);

        $this->add_control('secondary_color', [
            'label'     => __('Accent color', 'dcc-croatia-tour'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL => '--dcc-tour-secondary: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    protected function render(): void
    {
        $settings = $this->get_settings_for_display();
        $bundle = isset($settings['bundle_url']['url']) && $settings['bundle_url']['url']
            ? $settings['bundle_url']['url']
            : DCC_TOUR_DEFAULT_BUNDLE_URL;
        $bundle = rtrim(esc_url($bundle), '/') . '/';

        $config = [
            'bundleUrl' => $bundle,
        ];

        // The loader fetches bundle.js/css (and vendored Leaflet) from the bundle URL
        // and mounts the same app that the standalone site uses. bundle.js replaces
        // this element's contents entirely, so only a placeholder is rendered here.
        ?>
        <div class="dcc-tour-root" data-dcc-tour-config="<?php echo esc_attr(wp_json_encode($config)); ?>">
            <div class="dcc-tour-placeholder"><?php echo esc_html__('Loading the trip…', 'dcc-croatia-tour'); ?></div>
        </div>
        <?php
    }
}
