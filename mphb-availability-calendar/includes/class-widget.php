<?php
namespace MPHBAC;

use Elementor\Controls_Manager;
use Elementor\Widget_Base;

if (!defined('ABSPATH')) {
    exit;
}

final class Widget extends Widget_Base
{
    private static ?array $cached_room_types = null;

    private static function room_types(): array
    {
        return self::$cached_room_types ??= Data_Provider::list_room_types();
    }

    public function get_name(): string
    {
        return 'mphbac_calendar';
    }

    public function get_title(): string
    {
        return __('MPHB Availability Calendar', 'mphb-availability-calendar');
    }

    public function get_icon(): string
    {
        return 'eicon-calendar';
    }

    public function get_categories(): array
    {
        return ['claude-code'];
    }

    public function get_keywords(): array
    {
        return ['motopress', 'mphb', 'availability', 'calendar', 'hotel', 'booking', 'cottage'];
    }

    public function get_script_depends(): array
    {
        return ['mphbac-widget'];
    }

    public function get_style_depends(): array
    {
        return ['mphbac-widget'];
    }

    public static function register_assets(): void
    {
        wp_register_style(
            'mphbac-widget',
            MPHBAC_URL . 'assets/css/widget.css',
            [],
            MPHBAC_VERSION
        );
        // No JS deps. The jQuery UI datepicker is used as an OPTIONAL fallback
        // by wireFilters() only when `<input type="date">` is unsupported and
        // jQuery UI happens to be on the page anyway (loaded by the theme or
        // another plugin). Declaring it as a hard dep here would force ~70 KB
        // of JS + CSS onto every page, just for a fallback that browsers
        // within the support floor (Safari 16+ / iOS 16+ / evergreen Chrome
        // and Firefox) never trigger.
        wp_register_script(
            'mphbac-widget',
            MPHBAC_URL . 'assets/js/widget.js',
            [],
            MPHBAC_VERSION,
            true
        );
    }

    /**
     * Force the widget's CSS/JS into the Elementor editor preview iframe so the
     * client-rendered grid actually draws while editing.
     */
    public static function enqueue_for_preview(): void
    {
        self::register_assets();
        wp_enqueue_style('mphbac-widget');
        wp_enqueue_script('mphbac-widget');
    }

    protected function register_controls(): void
    {
        $this->register_content_controls();
        $this->register_display_controls();
        $this->register_labels_controls();
        $this->register_info_controls();
        $this->register_strings_controls();
        $this->register_style_controls();
        $this->register_heading_style_controls();
        $this->register_field_style_controls();
        $this->register_calheader_style_controls();
        $this->register_namecol_style_controls();
        $this->register_button_style_controls();
        $this->register_nav_style_controls();
        $this->register_legend_style_controls();
        $this->register_cell_style_controls();
    }

    private function register_info_controls(): void
    {
        $this->start_controls_section('section_info', [
            'label' => __('Cottage Info Popups', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('info_intro', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('Tapping a cottage name opens an info popup. Add a row per cottage and choose either custom text, an Elementor template, or the cottage\'s full MotoPress accommodation page (gallery, description, attributes, rates). Cottages with no row here are not clickable.', 'mphb-availability-calendar'),
            'content_classes' => 'elementor-descriptor',
        ]);

        $repeater = new \Elementor\Repeater();
        $repeater->add_control('ci_cottage', [
            'label'       => __('Cottage', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::SELECT,
            'options'     => $this->cottage_options(),
            'label_block' => true,
        ]);
        $repeater->add_control('ci_title', [
            'label'       => __('Popup title (optional)', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::TEXT,
            'label_block' => true,
            'description' => __('Overrides the cottage name as the popup header. Leave empty to use the cottage name from MotoPress.', 'mphb-availability-calendar'),
        ]);
        $repeater->add_control('ci_title_url', [
            'label'       => __('Title link URL (optional)', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::TEXT,
            'label_block' => true,
            'input_type'  => 'url',
            'description' => __('Leave empty to link the popup title to this cottage\'s accommodation page (MotoPress permalink). Set a URL here to override.', 'mphb-availability-calendar'),
        ]);
        $repeater->add_control('ci_source', [
            'label'   => __('Content source', 'mphb-availability-calendar'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'text',
            'options' => [
                'text'              => __('Custom text', 'mphb-availability-calendar'),
                'template'          => __('Elementor template', 'mphb-availability-calendar'),
                'mphb_accommodation'=> __('MotoPress accommodation page (auto)', 'mphb-availability-calendar'),
            ],
        ]);
        $repeater->add_control('ci_text', [
            'label'     => __('Custom text', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::WYSIWYG,
            'default'   => '',
            'condition' => ['ci_source' => 'text'],
        ]);
        $repeater->add_control('ci_template', [
            'label'       => __('Elementor template', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::SELECT,
            'options'     => $this->template_options(),
            'label_block' => true,
            'condition'   => ['ci_source' => 'template'],
        ]);
        $repeater->add_control('ci_mphb_info', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('Renders the same content visitors see on the cottage\'s own /accommodation/ page — gallery, description, attributes, services, and rates. No extra setup needed; the cottage is taken from the "Cottage" field above.', 'mphb-availability-calendar'),
            'content_classes' => 'elementor-descriptor',
            'condition'       => ['ci_source' => 'mphb_accommodation'],
        ]);

        $this->add_control('cottage_info', [
            'label'         => __('Info popups', 'mphb-availability-calendar'),
            'type'          => Controls_Manager::REPEATER,
            'fields'        => $repeater->get_controls(),
            // Without an explicit title_field, the last row's delete-X
            // disappears in some Elementor versions because the only row
            // is force-expanded and the collapsed-row tools (including X)
            // never render. Matching the working `cottage_labels`
            // pattern restores the X. prevent_empty=false is explicit
            // for the same reason — defaults have changed across
            // Elementor versions.
            'title_field'   => '<# print( ci_cottage ? "Cottage " + ci_cottage : "Cottage info" ) #>',
            'prevent_empty' => false,
        ]);

        $this->end_controls_section();
    }

    private function register_legend_style_controls(): void
    {
        $this->start_controls_section('section_style_legend', [
            'label'     => __('Legend', 'mphb-availability-calendar'),
            'tab'       => Controls_Manager::TAB_STYLE,
            'condition' => ['show_legend' => 'yes'],
        ]);

        $this->add_control('legend_text_color', [
            'label'     => __('Text color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#111111',
            'selectors' => [self::SEL . '.mphbac-legend' => 'color: {{VALUE}};'],
        ]);

        $this->add_group_control(
            \Elementor\Group_Control_Typography::get_type(),
            [
                'name'     => 'legend_typography',
                'selector' => self::SEL . '.mphbac-legend',
            ]
        );

        $this->end_controls_section();
    }

    /**
     * @return array<int,string>
     */
    private function template_options(): array
    {
        $options = ['' => __('— Select a template —', 'mphb-availability-calendar')];
        $posts = get_posts([
            'post_type'      => 'elementor_library',
            'posts_per_page' => -1,
            'post_status'    => 'publish',
            'orderby'        => 'title',
            'order'          => 'ASC',
            'no_found_rows'  => true,
        ]);
        foreach ($posts as $post) {
            $options[(int) $post->ID] = $post->post_title !== ''
                ? $post->post_title
                : sprintf(__('Template #%d', 'mphb-availability-calendar'), $post->ID);
        }
        return $options;
    }

    private function register_labels_controls(): void
    {
        $this->start_controls_section('section_labels', [
            'label' => __('Custom Cottage Labels', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('labels_intro', [
            'type'            => Controls_Manager::RAW_HTML,
            'raw'             => esc_html__('Override the auto-generated short name for any cottage. The custom label replaces the abbreviation and number entirely — type exactly what should appear in the calendar.', 'mphb-availability-calendar'),
            'content_classes' => 'elementor-descriptor',
        ]);

        $repeater = new \Elementor\Repeater();
        $repeater->add_control('cl_cottage', [
            'label'       => __('Cottage', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::SELECT,
            'options'     => $this->cottage_options(),
            'label_block' => true,
        ]);
        $repeater->add_control('cl_label', [
            'label'       => __('Custom label', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::TEXT,
            'label_block' => true,
        ]);

        $this->add_control('cottage_labels', [
            'label'       => __('Labels', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::REPEATER,
            'fields'      => $repeater->get_controls(),
            'title_field' => '{{{ cl_label }}}',
        ]);

        $this->end_controls_section();
    }

    private function register_calheader_style_controls(): void
    {
        $this->start_controls_section('section_style_calheader', [
            'label' => __('Calendar Header Row', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('calheader_bg', [
            'label'     => __('Weekday background color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#0A50B2',
            'selectors' => [
                self::SEL => '--mphbac-color-header: {{VALUE}};',
            ],
        ]);

        $this->add_control('calheader_text', [
            'label'     => __('Weekday text color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#FFFFFF',
            'selectors' => [
                self::SEL . '.mphbac-cell-day'                 => 'color: {{VALUE}};',
                self::SEL . '.mphbac-row-header .mphbac-cell-label' => 'color: {{VALUE}};',
            ],
        ]);

        $this->add_control('calheader_bg_weekend', [
            'label'       => __('Weekend background color', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::COLOR,
            'description' => __('Applied to Saturday and Sunday header cells only. Leave empty to use the weekday background.', 'mphb-availability-calendar'),
            'selectors'   => [
                self::SEL => '--mphbac-color-header-weekend: {{VALUE}};',
            ],
        ]);

        $this->add_control('calheader_text_weekend', [
            'label'       => __('Weekend text color', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::COLOR,
            'description' => __('Applied to Saturday and Sunday header cells only. Leave empty to use the weekday text color.', 'mphb-availability-calendar'),
            'selectors'   => [
                self::SEL . '.mphbac-cell-day.is-weekend' => 'color: {{VALUE}};',
            ],
        ]);

        $this->add_group_control(
            \Elementor\Group_Control_Typography::get_type(),
            [
                'name'     => 'calheader_typography',
                'label'    => __('Header typography (overall)', 'mphb-availability-calendar'),
                'selector' => self::SEL . '.mphbac-cell-day, ' . self::SEL . '.mphbac-row-header .mphbac-cell-label',
            ]
        );

        $this->add_control('dow_heading', [
            'type'      => Controls_Manager::HEADING,
            'label'     => __('Day-of-week text', 'mphb-availability-calendar'),
            'separator' => 'before',
        ]);
        $this->add_group_control(
            \Elementor\Group_Control_Typography::get_type(),
            [
                'name'     => 'dow_typography',
                'selector' => self::SEL . '.mphbac-d-dow',
            ]
        );

        $this->add_control('date_heading', [
            'type'      => Controls_Manager::HEADING,
            'label'     => __('Date-of-month text', 'mphb-availability-calendar'),
            'separator' => 'before',
        ]);
        $this->add_group_control(
            \Elementor\Group_Control_Typography::get_type(),
            [
                'name'     => 'date_typography',
                'selector' => self::SEL . '.mphbac-d-num',
            ]
        );

        $this->end_controls_section();
    }

    private function register_namecol_style_controls(): void
    {
        $this->start_controls_section('section_style_namecol', [
            'label' => __('Cottage Name Column', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('namecol_bg', [
            'label'     => __('Background color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#F8F9FA',
            'selectors' => [self::SEL => '--mphbac-color-namecol: {{VALUE}};'],
        ]);

        $this->add_control('namecol_alt_bg', [
            'label'       => __('Alternating row color', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::COLOR,
            'default'     => '#F1F3F5',
            'selectors'   => [self::SEL => '--mphbac-color-namecol-alt: {{VALUE}};'],
        ]);

        $this->add_control('namecol_text', [
            'label'     => __('Text color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#111111',
            'selectors' => [self::SEL . '.mphbac-row-toggle' => 'color: {{VALUE}};'],
        ]);

        $this->add_group_control(
            \Elementor\Group_Control_Typography::get_type(),
            [
                'name'     => 'namecol_typography',
                'selector' => self::SEL . '.mphbac-row-toggle',
            ]
        );

        $this->add_responsive_control('namecol_width', [
            'label'         => __('Column width', 'mphb-availability-calendar'),
            'type'          => Controls_Manager::SLIDER,
            'size_units'    => ['px', 'em'],
            'default'       => ['size' => 180, 'unit' => 'px'],
            'tablet_default'=> ['size' => 140, 'unit' => 'px'],
            'mobile_default'=> ['size' => 100, 'unit' => 'px'],
            'range'         => [
                'px' => ['min' => 70, 'max' => 320, 'step' => 2],
                'em' => ['min' => 4, 'max' => 22, 'step' => 0.5],
            ],
            'selectors'     => [self::SEL => '--mphbac-label-width: {{SIZE}}{{UNIT}};'],
        ]);

        $this->end_controls_section();
    }

    private function register_nav_style_controls(): void
    {
        $this->start_controls_section('section_style_nav', [
            'label'     => __('Navigation', 'mphb-availability-calendar'),
            'tab'       => Controls_Manager::TAB_STYLE,
            'condition' => ['show_nav' => 'yes'],
        ]);

        $this->add_control('nav_btn_bg', [
            'label'     => __('Button background', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#C43A3A',
            'selectors' => [self::SEL . '.mphbac-nav-btn' => 'background-color: {{VALUE}};'],
        ]);

        $this->add_control('nav_btn_text', [
            'label'     => __('Button arrow color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#FFFFFF',
            'selectors' => [self::SEL . '.mphbac-nav-btn' => 'color: {{VALUE}};'],
        ]);

        $this->add_control('nav_btn_hover_bg', [
            'label'     => __('Button hover background', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#078732',
            'selectors' => [
                self::SEL . '.mphbac-nav-btn:hover'         => 'background-color: {{VALUE}};',
                self::SEL . '.mphbac-nav-btn:focus-visible' => 'background-color: {{VALUE}};',
            ],
        ]);

        $this->add_control('nav_label_color', [
            'label'     => __('Date-range label color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.mphbac-nav-range' => 'color: {{VALUE}};'],
        ]);

        $this->end_controls_section();
    }

    private function register_content_controls(): void
    {
        $this->start_controls_section('section_content', [
            'label' => __('Content', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_control('heading_show', [
            'label'        => __('Show heading', 'mphb-availability-calendar'),
            'type'         => Controls_Manager::SWITCHER,
            'label_on'     => __('Show', 'mphb-availability-calendar'),
            'label_off'    => __('Hide', 'mphb-availability-calendar'),
            'return_value' => 'yes',
            'default'      => 'yes',
        ]);

        $this->add_control('heading_text', [
            'label'     => __('Heading text', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::TEXT,
            'default'   => __('Cottage Availability', 'mphb-availability-calendar'),
            'condition' => ['heading_show' => 'yes'],
        ]);

        $this->add_control('cottages', [
            'label'       => __('Cottages to show', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::SELECT2,
            'multiple'    => true,
            'options'     => $this->cottage_options(),
            'default'     => array_keys($this->cottage_options()),
            'label_block' => true,
            'description' => __('Leave empty to show all accommodation types.', 'mphb-availability-calendar'),
        ]);

        $this->end_controls_section();
    }

    private function register_display_controls(): void
    {
        $this->start_controls_section('section_display', [
            'label' => __('Display', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $this->add_responsive_control('visible_days', [
            'label'          => __('Days to show', 'mphb-availability-calendar'),
            'type'           => Controls_Manager::NUMBER,
            'min'            => 1,
            'max'            => 62,
            'step'           => 1,
            'default'        => 31,
            'tablet_default' => 14,
            'mobile_default' => 7,
            'description'    => __('How many days the calendar shows. Set a value per device with the desktop/tablet/mobile switcher.', 'mphb-availability-calendar'),
        ]);

        $this->add_responsive_control('dow_format', [
            'label'          => __('Day-of-week format', 'mphb-availability-calendar'),
            'type'           => Controls_Manager::SELECT,
            'default'        => 'long',
            'tablet_default' => 'long',
            'mobile_default' => 'short',
            'options'        => [
                'long'  => __('Three letters (Mon)', 'mphb-availability-calendar'),
                'short' => __('One letter (M)', 'mphb-availability-calendar'),
            ],
            'selectors_dictionary' => [
                'long'  => '--mphbac-dow-long: inline; --mphbac-dow-short: none;',
                'short' => '--mphbac-dow-long: none; --mphbac-dow-short: inline;',
            ],
            'selectors'      => [
                '{{WRAPPER}} .mphbac-root' => '{{VALUE}}',
            ],
        ]);

        $this->add_control('label_style', [
            'label'   => __('Row label style', 'mphb-availability-calendar'),
            'type'    => Controls_Manager::SELECT,
            'default' => 'abbrev_number',
            'options' => [
                'abbrev_number' => __('Two-line: short name + number', 'mphb-availability-calendar'),
                'number_only'   => __('Number only (full name in tooltip)', 'mphb-availability-calendar'),
            ],
        ]);

        $this->add_control('show_legend', [
            'label'        => __('Show color legend', 'mphb-availability-calendar'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
        ]);

        $this->add_control('show_nav', [
            'label'        => __('Show navigation arrows', 'mphb-availability-calendar'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'description'  => __('The prev/next arrows page the calendar by month. On touch devices visitors can also swipe.', 'mphb-availability-calendar'),
        ]);

        $this->add_control('show_past', [
            'label'        => __('Show past days', 'mphb-availability-calendar'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'description'  => __('Past days are shown greyed out using the "Past" color.', 'mphb-availability-calendar'),
        ]);

        $this->add_control('font_size', [
            'label'      => __('Font size', 'mphb-availability-calendar'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range'      => ['px' => ['min' => 10, 'max' => 22, 'step' => 1]],
            'default'    => ['unit' => 'px', 'size' => 14],
            'selectors'  => [
                '{{WRAPPER}} .mphbac-root' => '--mphbac-font-size: {{SIZE}}{{UNIT}};',
            ],
        ]);

        $this->add_control('enable_popup', [
            'label'        => __('Enable Book Now popup', 'mphb-availability-calendar'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'description'  => __('When on, tapping an available day or the "Book this cottage" button opens a sheet that submits a booking to MotoPress checkout.', 'mphb-availability-calendar'),
        ]);

        $this->add_control('min_nights', [
            'label'       => __('Minimum nights', 'mphb-availability-calendar'),
            'type'        => Controls_Manager::NUMBER,
            'min'         => 1,
            'max'         => 60,
            'step'        => 1,
            'default'     => 2,
            'description' => __('The booking popup defaults the check-out date this many nights after the chosen check-in, and rejects shorter stays. Match this to your MotoPress minimum-stay rule.', 'mphb-availability-calendar'),
            'condition'   => ['enable_popup' => 'yes'],
        ]);

        $this->add_control('info_popup_full_width', [
            'label'        => __('Full viewport width', 'mphb-availability-calendar'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'description'  => __('When on, the cottage-info popup fills the entire viewport (recommended when the source is the MotoPress accommodation page, so its gallery/rates/attributes render at their natural width). When off, the popup is a centered modal capped by the Max width setting below.', 'mphb-availability-calendar'),
        ]);

        $this->add_responsive_control('info_popup_max_width', [
            'label'          => __('Info popup max width (px)', 'mphb-availability-calendar'),
            'type'           => Controls_Manager::NUMBER,
            'min'            => 320,
            'max'            => 1600,
            'step'           => 10,
            'default'        => 1200,
            'tablet_default' => 800,
            'mobile_default' => 480,
            'description'    => __('Maximum width of the cottage-info popup when "Full viewport width" is off. Set independent values per device using the icons next to the label. The popup is always capped at 96vw to avoid horizontal scroll.', 'mphb-availability-calendar'),
            'condition'      => ['info_popup_full_width!' => 'yes'],
        ]);

        $this->add_responsive_control('info_popup_side_margin', [
            'label'          => __('Info popup side margin', 'mphb-availability-calendar'),
            'type'           => Controls_Manager::SLIDER,
            'size_units'     => ['px'],
            'default'        => ['size' => 32, 'unit' => 'px'],
            'tablet_default' => ['size' => 20, 'unit' => 'px'],
            'mobile_default' => ['size' => 12, 'unit' => 'px'],
            'range'          => [
                'px' => ['min' => 0, 'max' => 200, 'step' => 1],
            ],
            'description'    => __('Horizontal gutter between the cottage info popup and the viewport edges. Applies when "Full viewport width" is on. Set independent values per device using the icons next to the label.', 'mphb-availability-calendar'),
            'condition'      => ['info_popup_full_width' => 'yes'],
        ]);

        $this->end_controls_section();
    }

    private function register_strings_controls(): void
    {
        $this->start_controls_section('section_strings', [
            'label' => __('Labels & Strings', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_CONTENT,
        ]);

        $strings = [
            'str_property'      => [__('Cottage-column header label', 'mphb-availability-calendar'), __('Property', 'mphb-availability-calendar')],
            'str_checkin'       => [__('Check-in label', 'mphb-availability-calendar'), __('Check-in', 'mphb-availability-calendar')],
            'str_checkout'      => [__('Check-out label', 'mphb-availability-calendar'), __('Check-out', 'mphb-availability-calendar')],
            'str_apply'         => [__('Apply button', 'mphb-availability-calendar'), __('Apply', 'mphb-availability-calendar')],
            'str_reset'         => [__('Reset button', 'mphb-availability-calendar'), __('Reset', 'mphb-availability-calendar')],
            'str_empty'         => [__('Empty-state message', 'mphb-availability-calendar'), __('No cottages available — try different dates.', 'mphb-availability-calendar')],
            'str_legend_avail'  => [__('Legend: available', 'mphb-availability-calendar'), __('Available', 'mphb-availability-calendar')],
            'str_legend_booked' => [__('Legend: booked', 'mphb-availability-calendar'), __('Booked', 'mphb-availability-calendar')],
            'str_legend_past'   => [__('Legend: past', 'mphb-availability-calendar'), __('Past', 'mphb-availability-calendar')],
            'str_prev_month'    => [__('Previous month label', 'mphb-availability-calendar'), __('Previous month', 'mphb-availability-calendar')],
            'str_next_month'    => [__('Next month label', 'mphb-availability-calendar'), __('Next month', 'mphb-availability-calendar')],
            'str_today'         => [__('Back-to-today button label', 'mphb-availability-calendar'), __('Today', 'mphb-availability-calendar')],
            'str_today_hint'    => [__('Back-to-today button tooltip', 'mphb-availability-calendar'), __('Jump back to today\'s availability', 'mphb-availability-calendar')],
            'str_loading'       => [__('Loading status (screen-reader)', 'mphb-availability-calendar'), __('Loading availability…', 'mphb-availability-calendar')],
            'str_checkout_moved' => [__('Forced-checkout-date announcement (screen-reader, {date} is replaced)', 'mphb-availability-calendar'), __('Checkout date moved to {date}.', 'mphb-availability-calendar')],
            'str_info_close'     => [__('Info popup close (aria-label)', 'mphb-availability-calendar'), __('Close', 'mphb-availability-calendar')],
            'str_book_heading'   => [__('Popup heading prefix', 'mphb-availability-calendar'), __('Book', 'mphb-availability-calendar')],
            'str_book_confirm'   => [__('Popup confirm button', 'mphb-availability-calendar'), __('Book Now', 'mphb-availability-calendar')],
            'str_book_cancel'    => [__('Popup cancel button', 'mphb-availability-calendar'), __('Cancel', 'mphb-availability-calendar')],
            'str_book_close'     => [__('Popup close (aria-label)', 'mphb-availability-calendar'), __('Close booking dialog', 'mphb-availability-calendar')],
            'str_book_unavailable' => [__('Popup unavailable message', 'mphb-availability-calendar'), __("These dates aren't all available. Please pick different dates.", 'mphb-availability-calendar')],
            'str_book_invalid_range' => [__('Popup invalid-range message', 'mphb-availability-calendar'), __('Check-out must be after check-in.', 'mphb-availability-calendar')],
            'str_book_min_nights' => [__('Popup minimum-nights message', 'mphb-availability-calendar'), __('Must be a minimum of two nights. Please select new dates.', 'mphb-availability-calendar')],
            'str_all_booked'     => [__('Hint: all booked through date', 'mphb-availability-calendar'), __('All cottages booked through {through}.', 'mphb-availability-calendar')],
            'str_next_opening'   => [__('Hint: next opening', 'mphb-availability-calendar'), __('Next opening: {date} ({cottage}).', 'mphb-availability-calendar')],
        ];

        foreach ($strings as $key => [$label, $default]) {
            $this->add_control($key, [
                'label'   => $label,
                'type'    => Controls_Manager::TEXT,
                'default' => $default,
            ]);
        }

        $this->end_controls_section();
    }

    private function register_style_controls(): void
    {
        $this->start_controls_section('section_style', [
            'label' => __('Colors', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('inherit_theme', [
            'label'        => __('Inherit theme colors', 'mphb-availability-calendar'),
            'type'         => Controls_Manager::SWITCHER,
            'return_value' => 'yes',
            'default'      => 'yes',
            'description'  => __('When on, colors inherit from your theme via CSS custom properties. When off, the colors below apply.', 'mphb-availability-calendar'),
        ]);

        $this->add_control('color_available', [
            'label'     => __('Available color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#7BDCB5',
            'condition' => ['inherit_theme!' => 'yes'],
            'selectors' => [
                '{{WRAPPER}} .mphbac-root' => '--mphbac-color-available: {{VALUE}};',
            ],
        ]);

        $this->add_control('color_booked', [
            'label'     => __('Booked color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#FB6962',
            'condition' => ['inherit_theme!' => 'yes'],
            'selectors' => [
                '{{WRAPPER}} .mphbac-root' => '--mphbac-color-booked: {{VALUE}};',
            ],
        ]);

        $this->add_control('color_past', [
            'label'     => __('Past color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#bdc3c7',
            'condition' => ['inherit_theme!' => 'yes'],
            'selectors' => [
                '{{WRAPPER}} .mphbac-root' => '--mphbac-color-past: {{VALUE}};',
            ],
        ]);

        $this->end_controls_section();
    }

    /**
     * Selector prefix that outranks aggressive theme resets (e.g. Bravada's
     * Elementor kit). The doubled .mphbac-root adds a class' worth of
     * specificity without changing what it matches.
     */
    private const SEL = '{{WRAPPER}} .mphbac-root.mphbac-root ';

    private function register_heading_style_controls(): void
    {
        $this->start_controls_section('section_style_heading', [
            'label'     => __('Heading', 'mphb-availability-calendar'),
            'tab'       => Controls_Manager::TAB_STYLE,
            'condition' => ['heading_show' => 'yes'],
        ]);

        $this->add_control('heading_color', [
            'label'     => __('Heading color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.mphbac-heading' => 'color: {{VALUE}};'],
        ]);

        $this->add_group_control(
            \Elementor\Group_Control_Typography::get_type(),
            [
                'name'     => 'heading_typography',
                'selector' => self::SEL . '.mphbac-heading',
            ]
        );

        $this->end_controls_section();
    }

    private function register_field_style_controls(): void
    {
        $this->start_controls_section('section_style_fields', [
            'label' => __('Filter Fields', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('field_text_color', [
            'label'     => __('Text color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.mphbac-input' => 'color: {{VALUE}};'],
        ]);

        $this->add_control('field_bg_color', [
            'label'     => __('Background color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [self::SEL . '.mphbac-input' => 'background-color: {{VALUE}};'],
        ]);

        $this->add_group_control(
            \Elementor\Group_Control_Typography::get_type(),
            [
                'name'     => 'field_typography',
                'selector' => self::SEL . '.mphbac-input',
                // line-height is pinned in widget.css to defeat the theme's
                // 1px reset, so don't expose a control that can't win.
                'exclude'  => ['line_height'],
            ]
        );

        $this->add_group_control(
            \Elementor\Group_Control_Border::get_type(),
            [
                'name'     => 'field_border',
                'selector' => self::SEL . '.mphbac-input',
            ]
        );

        $this->add_responsive_control('field_radius', [
            'label'      => __('Border radius', 'mphb-availability-calendar'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [
                self::SEL . '.mphbac-input' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};',
            ],
        ]);

        $this->end_controls_section();
    }

    private function register_button_style_controls(): void
    {
        $this->start_controls_section('section_style_buttons', [
            'label' => __('Buttons', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_group_control(
            \Elementor\Group_Control_Typography::get_type(),
            [
                'name'     => 'button_typography',
                'selector' => self::SEL . '.mphbac-btn',
            ]
        );

        $this->add_group_control(
            \Elementor\Group_Control_Border::get_type(),
            [
                'name'     => 'button_border',
                'selector' => self::SEL . '.mphbac-btn',
            ]
        );

        $this->add_control('button_radius', [
            'label'      => __('Border radius', 'mphb-availability-calendar'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', '%'],
            'selectors'  => [
                self::SEL . '.mphbac-btn' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};',
            ],
        ]);

        $this->add_control('button_padding', [
            'label'      => __('Padding', 'mphb-availability-calendar'),
            'type'       => Controls_Manager::DIMENSIONS,
            'size_units' => ['px', 'em'],
            'selectors'  => [
                self::SEL . '.mphbac-btn' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};',
            ],
        ]);

        $this->start_controls_tabs('button_color_tabs');

        $this->start_controls_tab('button_tab_normal', [
            'label' => __('Normal', 'mphb-availability-calendar'),
        ]);
        $this->add_control('button_text_color', [
            'label'     => __('Text color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#ffffff',
            'selectors' => [self::SEL . '.mphbac-btn' => 'color: {{VALUE}};'],
        ]);
        $this->add_control('button_bg_color', [
            'label'     => __('Background color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#0f6dbf',
            'selectors' => [self::SEL . '.mphbac-btn' => 'background-color: {{VALUE}};'],
        ]);
        $this->end_controls_tab();

        $this->start_controls_tab('button_tab_hover', [
            'label' => __('Hover', 'mphb-availability-calendar'),
        ]);
        $this->add_control('button_text_color_hover', [
            'label'     => __('Text color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'selectors' => [
                self::SEL . '.mphbac-btn:hover'         => 'color: {{VALUE}};',
                self::SEL . '.mphbac-btn:focus-visible' => 'color: {{VALUE}};',
            ],
        ]);
        $this->add_control('button_bg_color_hover', [
            'label'     => __('Background color', 'mphb-availability-calendar'),
            'type'      => Controls_Manager::COLOR,
            'default'   => '#0a4f8c',
            'selectors' => [
                self::SEL . '.mphbac-btn:hover'         => 'background-color: {{VALUE}};',
                self::SEL . '.mphbac-btn:focus-visible' => 'background-color: {{VALUE}};',
            ],
        ]);
        $this->end_controls_tab();

        $this->end_controls_tabs();

        $this->end_controls_section();
    }

    private function register_cell_style_controls(): void
    {
        $this->start_controls_section('section_style_cells', [
            'label' => __('Calendar Cells', 'mphb-availability-calendar'),
            'tab'   => Controls_Manager::TAB_STYLE,
        ]);

        $this->add_control('cell_radius', [
            'label'      => __('Cell corner radius', 'mphb-availability-calendar'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'default'    => ['size' => 4, 'unit' => 'px'],
            'range'      => ['px' => ['min' => 0, 'max' => 16, 'step' => 1]],
            'selectors'  => [
                self::SEL . '.mphbac-cell-status' => 'border-radius: {{SIZE}}{{UNIT}};',
            ],
        ]);

        $this->add_control('cell_min_height', [
            'label'      => __('Cottage row height', 'mphb-availability-calendar'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'default'    => ['size' => 38, 'unit' => 'px'],
            'range'      => ['px' => ['min' => 16, 'max' => 60, 'step' => 2]],
            'selectors'  => [
                self::SEL => '--mphbac-cell-min: {{SIZE}}{{UNIT}};',
            ],
        ]);

        $this->add_control('header_min_height', [
            'label'      => __('Header row height', 'mphb-availability-calendar'),
            'description'=> __('Height of the top day-of-week / date row.', 'mphb-availability-calendar'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'default'    => ['size' => 38, 'unit' => 'px'],
            'range'      => ['px' => ['min' => 16, 'max' => 60, 'step' => 2]],
            'selectors'  => [
                self::SEL => '--mphbac-header-min: {{SIZE}}{{UNIT}};',
            ],
        ]);

        $this->add_control('cell_gap', [
            'label'      => __('Gap between cells', 'mphb-availability-calendar'),
            'type'       => Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'default'    => ['size' => 2, 'unit' => 'px'],
            'range'      => ['px' => ['min' => 0, 'max' => 10, 'step' => 1]],
            'selectors'  => [
                self::SEL => '--mphbac-gap: {{SIZE}}{{UNIT}};',
            ],
        ]);

        $this->end_controls_section();
    }

    /**
     * @return array<int,string>
     */
    private function cottage_options(): array
    {
        $options = [];
        foreach (self::room_types() as $type) {
            $options[$type['id']] = $type['title'] !== ''
                ? $type['title']
                : sprintf(__('Accommodation #%d', 'mphb-availability-calendar'), $type['id']);
        }
        return $options;
    }

    protected function render(): void
    {
        if (!Plugin::instance()->dependencies_present()) {
            return;
        }

        $settings = $this->get_settings_for_display();

        $all_types       = self::room_types();
        $selected_ids    = array_map('intval', (array) ($settings['cottages'] ?? []));
        if (empty($selected_ids)) {
            $selected_ids = array_map(static fn($t) => (int) $t['id'], $all_types);
        }
        $rooms = array_values(array_filter($all_types, static fn($t) => in_array((int) $t['id'], $selected_ids, true)));

        $today = Data_Provider::today();

        // Per-device day counts (grid is drawn client-side, so each device
        // can show its own count). Elementor only persists values the editor
        // has explicitly touched, so untouched tablet/mobile slots arrive
        // here as "" — fall back to the declared per-device defaults
        // (31/14/7) directly. Cascading to the desktop value silently
        // collapses every device to whatever desktop is set to whenever a
        // user edits the widget without touching the per-device switcher.
        $days_desktop = (int) ($settings['visible_days'] ?? 0);
        $days_desktop = $days_desktop > 0 ? $days_desktop : 31;
        $days_tablet  = (int) ($settings['visible_days_tablet'] ?? 0);
        $days_tablet  = $days_tablet  > 0 ? $days_tablet  : 14;
        $days_mobile  = (int) ($settings['visible_days_mobile'] ?? 0);
        $days_mobile  = $days_mobile  > 0 ? $days_mobile  : 7;

        $rooms_by_id = [];
        foreach ($rooms as $r) {
            $rooms_by_id[(int) $r['id']] = $r['title'];
        }

        $popup_enabled = ($settings['enable_popup'] ?? 'yes') === 'yes';
        $min_nights    = max(1, (int) ($settings['min_nights'] ?? 2));

        $property_label = (string) ($settings['str_property'] ?? '');

        $custom_labels = [];
        foreach ((array) ($settings['cottage_labels'] ?? []) as $row) {
            $cid = (int) ($row['cl_cottage'] ?? 0);
            $lbl = trim((string) ($row['cl_label'] ?? ''));
            if ($cid > 0 && $lbl !== '') {
                $custom_labels[$cid] = $lbl;
            }
        }

        // Per-cottage info-popup content (Elementor template or custom text).
        // Templates are server-rendered into hidden divs on the page so the
        // template's per-widget CSS file gets enqueued via Elementor's normal
        // page-render path. (An earlier v0.6.0 attempted to lazy-load these
        // via AJAX but Elementor never enqueues template CSS on the parent
        // page in that mode, so multi-column widgets like a pricing-table
        // switcher lost their styles on subsequent opens.)
        $info_html = [];
        $info_titles = [];
        $info_title_urls = [];
        foreach ((array) ($settings['cottage_info'] ?? []) as $row) {
            $cid = (int) ($row['ci_cottage'] ?? 0);
            if ($cid <= 0) {
                continue;
            }
            $title_override = trim((string) ($row['ci_title'] ?? ''));
            if ($title_override !== '') {
                $info_titles[$cid] = $title_override;
            }
            // Title link: explicit URL override wins; otherwise the
            // cottage's accommodation page (the cottage IS the mphb_room_type
            // post, so $cid == accommodation post ID per the CLAUDE.md
            // invariant). Skip when neither resolves to a usable URL.
            $title_url_override = trim((string) ($row['ci_title_url'] ?? ''));
            if ($title_url_override !== '') {
                $info_title_urls[$cid] = esc_url($title_url_override);
            } else {
                $permalink = get_permalink($cid);
                if (is_string($permalink) && $permalink !== '') {
                    $info_title_urls[$cid] = esc_url($permalink);
                }
            }
            $source = (string) ($row['ci_source'] ?? 'text');
            if ($source === 'template') {
                $tpl_id = (int) ($row['ci_template'] ?? 0);
                if ($tpl_id > 0) {
                    $html = self::render_template($tpl_id);
                    if ($html !== '') {
                        $info_html[$cid] = $html;
                    }
                }
            } elseif ($source === 'mphb_accommodation') {
                // The cottage IS the mphb_room_type post, so $cid is also the
                // accommodation post ID — no extra select control needed.
                $html = self::render_motopress_accommodation($cid);
                if ($html !== '') {
                    $info_html[$cid] = $html;
                }
            } else {
                $text = (string) ($row['ci_text'] ?? '');
                if (trim(wp_strip_all_tags($text)) !== '') {
                    $info_html[$cid] = wpautop(wp_kses_post($text));
                }
            }
        }
        $info_has_any = !empty($info_html);
        $info_full_width = ($settings['info_popup_full_width'] ?? 'yes') === 'yes';

        $status_labels = [
            Data_Provider::ST_AVAIL  => (string) ($settings['str_legend_avail'] ?? ''),
            Data_Provider::ST_BOOKED => (string) ($settings['str_legend_booked'] ?? ''),
            Data_Provider::ST_PAST   => (string) ($settings['str_legend_past'] ?? ''),
        ];

        $config = [
            'ajaxUrl'        => admin_url('admin-ajax.php'),
            'action'         => MPHBAC_AJAX_ACTION,
            'roomTypeIds'    => array_map(static fn($r) => (int) $r['id'], $rooms),
            'roomTitles'     => $rooms_by_id,
            'daysDesktop'    => $days_desktop,
            'daysTablet'     => $days_tablet,
            'daysMobile'     => $days_mobile,
            'showPast'       => $settings['show_past'] === 'yes',
            'today'          => $today->format('Y-m-d'),
            'popupEnabled'   => $popup_enabled,
            'minNights'      => $min_nights,
            'customLabels'   => $custom_labels,
            'statusLabels'   => $status_labels,
            'checkoutUrl'    => self::resolve_checkout_url(),
            'infoPopupMaxWidth' => [
                'desktop' => max(320, min(1600, (int) ($settings['info_popup_max_width']        ?? 1200))),
                'tablet'  => max(320, min(1600, (int) ($settings['info_popup_max_width_tablet'] ?? 800))),
                'mobile'  => max(320, min(1600, (int) ($settings['info_popup_max_width_mobile'] ?? 480))),
            ],
            'infoTitles'       => $info_titles,
            'infoTitleUrls'    => $info_title_urls,
            'infoPopupSideMargin' => [
                'desktop' => max(0, min(200, (int) ($settings['info_popup_side_margin']['size']        ?? 32))),
                'tablet'  => max(0, min(200, (int) ($settings['info_popup_side_margin_tablet']['size'] ?? 20))),
                'mobile'  => max(0, min(200, (int) ($settings['info_popup_side_margin_mobile']['size'] ?? 12))),
            ],
            'strings'        => [
                'empty'         => (string) ($settings['str_empty'] ?? ''),
                'reset'         => (string) ($settings['str_reset'] ?? ''),
                'prev'          => (string) ($settings['str_prev_month'] ?? ''),
                'next'          => (string) ($settings['str_next_month'] ?? ''),
                'bookHeading'   => (string) ($settings['str_book_heading'] ?? ''),
                'bookConfirm'   => (string) ($settings['str_book_confirm'] ?? ''),
                'bookCancel'    => (string) ($settings['str_book_cancel'] ?? ''),
                'bookClose'     => (string) ($settings['str_book_close'] ?? ''),
                'bookUnavail'   => (string) ($settings['str_book_unavailable'] ?? ''),
                'bookInvalid'   => (string) ($settings['str_book_invalid_range'] ?? ''),
                'bookMinNights' => (string) ($settings['str_book_min_nights'] ?? ''),
                'checkin'       => (string) ($settings['str_checkin'] ?? ''),
                'checkout'      => (string) ($settings['str_checkout'] ?? ''),
                'property'      => $property_label,
                'allBooked'     => (string) ($settings['str_all_booked'] ?? ''),
                'nextOpening'   => (string) ($settings['str_next_opening'] ?? ''),
                'loading'       => (string) ($settings['str_loading'] ?? ''),
                'checkoutMoved' => (string) ($settings['str_checkout_moved'] ?? ''),
            ],
        ];

        $root_classes = ['mphbac-root'];
        if ($settings['inherit_theme'] === 'yes') {
            $root_classes[] = 'mphbac-inherit-theme';
        }
        if ($settings['show_past'] !== 'yes') {
            $root_classes[] = 'mphbac-hide-past';
        }
        if ($popup_enabled) {
            $root_classes[] = 'mphbac-popup-enabled';
        }
        $root_classes[] = 'mphbac-label-' . ($settings['label_style'] === 'number_only' ? 'number' : 'abbrev');

        ?>
        <div class="<?php echo esc_attr(implode(' ', $root_classes)); ?>"
             data-config="<?php echo esc_attr((string) wp_json_encode($config)); ?>">

            <?php if ($settings['heading_show'] === 'yes' && $settings['heading_text'] !== '') : ?>
                <h2 class="mphbac-heading"><?php echo esc_html($settings['heading_text']); ?></h2>
            <?php endif; ?>

            <div class="mphbac-filters" role="search">
                <label class="mphbac-filter mphbac-filter-checkin">
                    <span class="mphbac-filter-label"><?php echo esc_html($settings['str_checkin']); ?></span>
                    <input type="date" class="mphbac-input mphbac-input-checkin"
                           name="mphbac_checkin"
                           min="<?php echo esc_attr($today->format('Y-m-d')); ?>"
                           autocomplete="off">
                </label>
                <label class="mphbac-filter mphbac-filter-checkout">
                    <span class="mphbac-filter-label"><?php echo esc_html($settings['str_checkout']); ?></span>
                    <input type="date" class="mphbac-input mphbac-input-checkout"
                           name="mphbac_checkout"
                           min="<?php echo esc_attr($today->format('Y-m-d')); ?>"
                           autocomplete="off">
                </label>
                <div class="mphbac-filter-actions">
                    <button type="button" class="mphbac-btn mphbac-btn-apply"><?php echo esc_html($settings['str_apply']); ?></button>
                    <button type="button" class="mphbac-btn mphbac-btn-reset"><?php echo esc_html($settings['str_reset']); ?></button>
                </div>
                <span class="mphbac-sr-only mphbac-filter-status" role="status" aria-live="polite"></span>
            </div>

            <?php if ($settings['show_legend'] === 'yes') : ?>
                <div class="mphbac-legend" aria-hidden="false">
                    <span class="mphbac-legend-item"><span class="mphbac-swatch mphbac-swatch-available" aria-hidden="true"></span><?php echo esc_html($settings['str_legend_avail']); ?></span>
                    <span class="mphbac-legend-item"><span class="mphbac-swatch mphbac-swatch-booked" aria-hidden="true"></span><?php echo esc_html($settings['str_legend_booked']); ?></span>
                    <?php if ($settings['show_past'] === 'yes') : ?>
                        <span class="mphbac-legend-item"><span class="mphbac-swatch mphbac-swatch-past" aria-hidden="true"></span><?php echo esc_html($settings['str_legend_past']); ?></span>
                    <?php endif; ?>
                </div>
            <?php endif; ?>

            <?php if ($settings['show_nav'] === 'yes') : ?>
                <div class="mphbac-nav">
                    <button type="button" class="mphbac-nav-btn mphbac-nav-prev" aria-label="<?php echo esc_attr($settings['str_prev_month']); ?>">&larr;</button>
                    <span class="mphbac-nav-range" aria-live="polite"></span>
                    <button type="button" class="mphbac-nav-btn mphbac-nav-today"
                            title="<?php echo esc_attr($settings['str_today_hint']); ?>"
                            aria-label="<?php echo esc_attr($settings['str_today_hint']); ?>"
                            hidden><?php echo esc_html($settings['str_today']); ?></button>
                    <button type="button" class="mphbac-nav-btn mphbac-nav-next" aria-label="<?php echo esc_attr($settings['str_next_month']); ?>">&rarr;</button>
                </div>
            <?php endif; ?>

            <div class="mphbac-grid-wrap" role="region" aria-live="polite" aria-label="<?php echo esc_attr__('Availability calendar', 'mphb-availability-calendar'); ?>">
                <div class="mphbac-skeleton" aria-hidden="true">
                    <div class="mphbac-skeleton-row mphbac-skeleton-row--header"></div>
                    <?php foreach ($rooms as $i => $r) : ?>
                        <div class="mphbac-skeleton-row<?php echo ($i % 2 === 1) ? ' mphbac-skeleton-row-alt' : ''; ?>">
                            <span class="mphbac-skeleton-name"></span>
                            <span class="mphbac-skeleton-cells"></span>
                        </div>
                    <?php endforeach; ?>
                </div>
                <span class="mphbac-sr-only" role="status" aria-live="polite"><?php echo esc_html($settings['str_loading']); ?></span>
            </div>

            <?php foreach ($info_html as $cid => $html) : ?>
                <?php // $html is already safe: custom text is wp_kses_post()'d when built,
                      // template output is first-party Elementor render. ?>
                <div class="mphbac-info-content" data-room-type-id="<?php echo esc_attr((string) $cid); ?>" hidden><?php
                    echo $html; // phpcs:ignore WordPress.Security.EscapeOutput
                ?></div>
            <?php endforeach; ?>

            <?php if ($info_has_any) : ?>
                <div class="mphbac-info-overlay" hidden></div>
                <div class="mphbac-info-sheet<?php echo $info_full_width ? ' mphbac-info-sheet--full' : ''; ?>" role="dialog" aria-modal="true" aria-labelledby="mphbac-info-title" hidden>
                    <button type="button" class="mphbac-sheet-close mphbac-info-close mphbac-info-close--floating" aria-label="<?php echo esc_attr($settings['str_info_close']); ?>">&times;</button>
                    <div class="mphbac-sheet-header mphbac-sheet-header--info">
                        <h3 class="mphbac-sheet-title" id="mphbac-info-title"></h3>
                    </div>
                    <div class="mphbac-info-body"></div>
                </div>
            <?php endif; ?>

            <div class="mphbac-empty" hidden>
                <p><?php echo esc_html($settings['str_empty']); ?></p>
                <button type="button" class="mphbac-btn mphbac-btn-reset-empty"><?php echo esc_html($settings['str_reset']); ?></button>
            </div>

            <?php if ($popup_enabled) : ?>
                <div class="mphbac-sheet-overlay" hidden></div>
                <div class="mphbac-sheet" role="dialog" aria-modal="true" aria-labelledby="mphbac-sheet-title" hidden>
                    <div class="mphbac-sheet-header">
                        <h3 class="mphbac-sheet-title" id="mphbac-sheet-title"></h3>
                        <button type="button" class="mphbac-sheet-close" aria-label="<?php echo esc_attr($settings['str_book_close']); ?>">&times;</button>
                    </div>
                    <div class="mphbac-sheet-body">
                        <label class="mphbac-sheet-field">
                            <span><?php echo esc_html($settings['str_checkin']); ?></span>
                            <input type="date" class="mphbac-input mphbac-sheet-checkin"
                                   name="mphbac_sheet_checkin"
                                   min="<?php echo esc_attr($today->format('Y-m-d')); ?>"
                                   autocomplete="off">
                        </label>
                        <label class="mphbac-sheet-field">
                            <span><?php echo esc_html($settings['str_checkout']); ?></span>
                            <input type="date" class="mphbac-input mphbac-sheet-checkout"
                                   name="mphbac_sheet_checkout"
                                   min="<?php echo esc_attr($today->modify('+' . $min_nights . ' days')->format('Y-m-d')); ?>"
                                   autocomplete="off">
                        </label>
                        <p class="mphbac-sheet-error" role="alert" hidden></p>
                    </div>
                    <div class="mphbac-sheet-actions">
                        <button type="button" class="mphbac-btn mphbac-sheet-cancel"><?php echo esc_html($settings['str_book_cancel']); ?></button>
                        <button type="button" class="mphbac-btn mphbac-btn-primary mphbac-sheet-confirm"><?php echo esc_html($settings['str_book_confirm']); ?></button>
                    </div>
                </div>
            <?php endif; ?>
        </div>
        <?php
    }

    public static function resolve_checkout_url(): string
    {
        try {
            if (function_exists('MPHB')) {
                $mphb = \MPHB();
                if (is_object($mphb) && method_exists($mphb, 'settings')) {
                    $s = $mphb->settings();
                    if (is_object($s) && method_exists($s, 'pages')) {
                        $p = $s->pages();
                        if (is_object($p) && method_exists($p, 'getCheckoutPageUrl')) {
                            $url = (string) $p->getCheckoutPageUrl();
                            if ($url !== '') {
                                return $url;
                            }
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('MPHBAC: resolve_checkout_url failed: ' . $e->getMessage());
        }
        return home_url('/submit-booking/');
    }

    /**
     * Render a cottage's full MotoPress single-accommodation page content
     * (gallery + description + attributes + services + rates) for the info
     * popup. MotoPress's the_content filter callbacks inject those sections
     * but bail unless BOTH is_singular('mphb_room_type') AND is_main_query()
     * return true — the latter compares the active query identity against
     * $GLOBALS['wp_the_query'], so swapping $wp_query alone isn't enough.
     * We snapshot $wp_query, $wp_the_query, and $post, swap both queries
     * to a one-post query targeting the cottage, render, then restore.
     */
    private static function render_motopress_accommodation(int $room_type_id): string
    {
        if ($room_type_id <= 0 || !function_exists('MPHB')) {
            return '';
        }
        $post = get_post($room_type_id);
        if (!$post || $post->post_type !== 'mphb_room_type' || $post->post_status !== 'publish') {
            return '';
        }

        $saved_query     = $GLOBALS['wp_query']     ?? null;
        $saved_the_query = $GLOBALS['wp_the_query'] ?? null;
        $saved_post      = $GLOBALS['post']         ?? null;
        $html            = '';

        try {
            $query = new \WP_Query([
                'p'         => $room_type_id,
                'post_type' => 'mphb_room_type',
            ]);
            if (!$query->have_posts()) {
                return '';
            }
            $GLOBALS['wp_query']     = $query;
            $GLOBALS['wp_the_query'] = $query;
            $query->the_post();

            ob_start();
            echo '<div class="mphbac-mphb-accommodation">';
            the_content();
            echo '</div>';
            $html = (string) ob_get_clean();

            // If the cottage post itself has no body content AND MotoPress's
            // filter callbacks added nothing, the output is just our wrapper
            // div. Treat that as "render failed" so the caller falls back to
            // skipping this cottage rather than showing a blank popup.
            $stripped = trim(wp_strip_all_tags($html));
            if ($stripped === '') {
                error_log('MPHBAC: render_motopress_accommodation produced empty output for ' . $room_type_id);
                $html = '';
            }
        } catch (\Throwable $e) {
            error_log('MPHBAC: render_motopress_accommodation failed for ' . $room_type_id . ': ' . $e->getMessage());
            $html = '';
        } finally {
            wp_reset_postdata();
            if ($saved_query !== null) {
                $GLOBALS['wp_query'] = $saved_query;
            }
            if ($saved_the_query !== null) {
                $GLOBALS['wp_the_query'] = $saved_the_query;
            }
            if ($saved_post !== null) {
                $GLOBALS['post'] = $saved_post;
            }
        }

        return $html;
    }

    /**
     * Render a saved Elementor template's HTML (for cottage info popups).
     * Server-rendering on the calendar page is required so Elementor enqueues
     * the template's per-widget CSS for the page — AJAX-only rendering leaves
     * those stylesheets unloaded and breaks any widget with its own styles.
     */
    private static function render_template(int $template_id): string
    {
        if ($template_id <= 0) {
            return '';
        }
        try {
            if (class_exists('\\Elementor\\Plugin')) {
                $elementor = \Elementor\Plugin::instance();
                if (isset($elementor->frontend) && method_exists($elementor->frontend, 'get_builder_content_for_display')) {
                    // Templates are first-party content authored in Elementor
                    // by the site owner. Returning the raw render preserves
                    // the inline scripts (image carousel bootstrap, accordion
                    // initializer, etc.), the container classes (alignment,
                    // grid, theme-globals), and the inline style attributes
                    // that wp_kses_post() previously stripped — which was
                    // breaking the image carousel widget and the container
                    // template's centering / text-color styling. Trust
                    // boundary: only the site owner can publish templates.
                    return (string) $elementor->frontend->get_builder_content_for_display($template_id, true);
                }
            }
        } catch (\Throwable $e) {
            error_log('MPHBAC: render_template failed for ' . $template_id . ': ' . $e->getMessage());
        }
        return '';
    }
}
