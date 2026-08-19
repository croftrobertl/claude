<?php
namespace FeaturesAmenities;

use Elementor\Widget_Base;
use Elementor\Controls_Manager;
use Elementor\Repeater;
use Elementor\Icons_Manager;
use Elementor\Group_Control_Typography;
use Elementor\Group_Control_Border;
use Elementor\Group_Control_Box_Shadow;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Widget extends Widget_Base {

	public function get_name() {
		return 'features_and_amenities';
	}

	public function get_title() {
		return esc_html__( 'DCC Features and Amenities', 'features-amenities' );
	}

	public function get_icon() {
		return 'eicon-bullet-list';
	}

	public function get_categories() {
		return [ 'dcc-widgets', 'general' ];
	}

	public function get_keywords() {
		return [ 'features', 'amenities', 'list', 'accordion', 'cottage' ];
	}

	public function get_script_depends() {
		return [ 'features-amenities' ];
	}

	public function get_style_depends() {
		return [ 'features-amenities' ];
	}

	// Doubled class makes every style-control selector (0,3,0) so it
	// outranks aggressive theme resets (e.g. Bravada at (0,3,1)).
	private const SEL = '{{WRAPPER}} .fal-container.fal-container ';

	private function get_motopress_templates(): array {
		$templates = [ '' => esc_html__( 'None (Use custom list below)', 'features-amenities' ) ];
		if ( post_type_exists( 'mphb_template' ) ) {
			$query = new \WP_Query(
				[
					'post_type'              => 'mphb_template',
					'posts_per_page'         => -1,
					'post_status'            => 'publish',
					'no_found_rows'          => true,
					'update_post_meta_cache' => false,
					'update_post_term_cache' => false,
				]
			);
			if ( $query->have_posts() ) {
				foreach ( $query->posts as $post ) {
					$templates[ $post->ID ] = $post->post_title;
				}
			}
		}
		return $templates;
	}

	private function get_default_list_items(): array {
		$section = static fn( string $text, string $icon, string $lib ) => [
			'item_type' => 'section',
			'item_text' => $text,
			'item_icon' => [ 'value' => $icon, 'library' => $lib ],
		];
		$amenity = static fn( string $title, string $desc ) => [
			'item_type'        => 'amenity',
			'item_text'        => $title,
			'item_description' => $desc,
			'item_icon'        => [ 'value' => '', 'library' => '' ],
		];

		return [
			$section( 'Location Highlights', 'fas fa-trophy', 'fa-solid' ),
			$amenity( 'Nightlife & Shopping', 'Walking distance to downtown Tavares, Florida.' ),
			$amenity( 'Waterfront', 'Boat docks on the Dora Canal with access to the Harris Chain of Lakes.' ),

			$section( 'Kitchen & Dining', 'fas fa-utensils', 'fa-solid' ),
			$amenity( 'Fully Equipped Kitchenette', 'A kitchenette with a microwave, full-size refrigerator/freezer, induction stovetop, coffee maker, ice maker.' ),
			$amenity( 'Essentials', 'Pantry closet, essential kitchenware, and paper towels.' ),
			$amenity( 'Dining Area', 'Dining table with seating for 2.' ),

			$section( 'Bedroom & Bathroom', 'fas fa-bath', 'fa-solid' ),
			$amenity( 'Bedroom', 'One queen bed with fresh linens and pillows, a closet, and a Smart TV. Extra sleeping space: There is also a pullout couch in the living room.' ),
			$amenity( 'Bathroom', 'Walk-in shower with bath linens and toiletries, such as towels, washcloths, hand towels, hand soap, bath mat, toilet paper, etc.' ),

			$section( 'Comfort & Entertainment', 'fas fa-wifi', 'fa-solid' ),
			$amenity( 'Internet', 'Free high-speed WiFi across the property.' ),
			$amenity( 'Entertainment', 'Smart TVs with streaming services in both the living room and bedroom.' ),
			$amenity( 'Climate Control', 'Air conditioning and heating.' ),

			$section( 'Community Amenities', 'fas fa-umbrella-beach', 'fa-solid' ),
			$amenity( 'Outdoor Space', 'Enjoy the sun deck, picnic area, dining area, and a community fire pit.' ),
			$amenity( 'Parking & Laundry', 'Free private parking, and a coin-operated laundry facility on-site.' ),
			$amenity( 'Grilling', 'A shared BBQ grill is available for guest use.' ),

			$section( 'Accessibility & Safety', 'fab fa-accessible-icon', 'fa-brands' ),
			$amenity( 'Accessibility', 'Ground-floor unit with a stair-free, well-lit path to the entrance.' ),
			$amenity( 'Safety', 'The property is monitored by CCTV.' ),
			$amenity( 'Rules', 'No smoking inside the cottage. No children or pets are allowed.' ),
		];
	}

	protected function register_controls() {
		$this->register_data_source_controls();
		$this->register_list_controls();
		$this->register_search_controls();
		$this->register_layout_controls();
		$this->register_color_controls();
		$this->register_section_header_style_controls();
		$this->register_amenity_card_style_controls();
	}

	private function register_data_source_controls(): void {
		$this->start_controls_section(
			'section_data_source',
			[
				'label' => esc_html__( 'Data Source', 'features-amenities' ),
				'tab'   => Controls_Manager::TAB_CONTENT,
			]
		);
		$this->add_control(
			'motopress_template_id',
			[
				'label'       => esc_html__( 'MotoPress Template', 'features-amenities' ),
				'type'        => Controls_Manager::SELECT,
				'options'     => $this->get_motopress_templates(),
				'default'     => '',
				'description' => esc_html__( 'Select a MotoPress Template to display its full content. If selected, the custom list below will be ignored.', 'features-amenities' ),
			]
		);
		$this->end_controls_section();
	}

	private function register_list_controls(): void {
		$this->start_controls_section(
			'section_content',
			[
				'label'     => esc_html__( 'List Items', 'features-amenities' ),
				'tab'       => Controls_Manager::TAB_CONTENT,
				'condition' => [ 'motopress_template_id' => '' ],
			]
		);

		$this->add_control(
			'guide_export_import',
			[
				'type' => Controls_Manager::RAW_HTML,
				'raw'  => '<div style="margin-bottom:10px;">'
					. '<button class="elementor-button elementor-button-default" data-fal-export type="button" style="width:100%;margin-bottom:5px;">' . esc_html__( 'Export List to Clipboard', 'features-amenities' ) . '</button>'
					. '<button class="elementor-button elementor-button-default" data-fal-import type="button" style="width:100%;">' . esc_html__( 'Import from Elementor Template File…', 'features-amenities' ) . '</button>'
					. '<div style="margin-top:6px;font-size:11px;opacity:0.7;line-height:1.4;">' . esc_html__( 'Import accepts a JSON file exported from an Elementor container template that contains Icon List widgets. The first item of each Icon List becomes a Section Header; the rest become Amenities.', 'features-amenities' ) . '</div>'
					. '</div>',
			]
		);

		$repeater = new Repeater();
		$repeater->add_control(
			'item_type',
			[
				'label'   => esc_html__( 'Item Type', 'features-amenities' ),
				'type'    => Controls_Manager::SELECT,
				'default' => 'amenity',
				'options' => [
					'section' => esc_html__( 'Section Header', 'features-amenities' ),
					'amenity' => esc_html__( 'Amenity / Feature', 'features-amenities' ),
				],
			]
		);
		$repeater->add_control(
			'item_text',
			[
				'label'       => esc_html__( 'Text / Title', 'features-amenities' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => esc_html__( 'List Item', 'features-amenities' ),
				'label_block' => true,
			]
		);
		$repeater->add_control(
			'item_description',
			[
				'label'       => esc_html__( 'Description', 'features-amenities' ),
				'type'        => Controls_Manager::TEXTAREA,
				'condition'   => [ 'item_type' => 'amenity' ],
				'label_block' => true,
			]
		);
		$repeater->add_control(
			'item_icon',
			[
				'label'   => esc_html__( 'Icon', 'features-amenities' ),
				'type'    => Controls_Manager::ICONS,
				'default' => [ 'value' => '', 'library' => '' ],
			]
		);

		$this->add_control(
			'list_items',
			[
				'label'       => esc_html__( 'Features & Amenities', 'features-amenities' ),
				'type'        => Controls_Manager::REPEATER,
				'fields'      => $repeater->get_controls(),
				'default'     => $this->get_default_list_items(),
				'title_field' => '{{{ item_type === "section" ? "<strong style=\"font-size:1.05em;\">📁 " + item_text + "</strong>" : "<span style=\"padding-left:24px;opacity:0.85;\">⚓︎ " + item_text + "</span>" }}}',
			]
		);

		$this->add_control(
			'default_amenity_icon',
			[
				'label'     => esc_html__( 'Default Amenity Icon', 'features-amenities' ),
				'type'      => Controls_Manager::ICONS,
				'default'   => [ 'value' => 'fas fa-anchor', 'library' => 'fa-solid' ],
				'separator' => 'before',
			]
		);
		$this->end_controls_section();
	}

	private function register_search_controls(): void {
		$this->start_controls_section(
			'section_search',
			[
				'label'     => esc_html__( 'Search', 'features-amenities' ),
				'tab'       => Controls_Manager::TAB_CONTENT,
				'condition' => [ 'motopress_template_id' => '' ],
			]
		);
		$this->add_control(
			'enable_search',
			[
				'label'        => esc_html__( 'Enable Search Bar', 'features-amenities' ),
				'type'         => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'default'      => 'no',
			]
		);
		$this->add_control(
			'search_placeholder',
			[
				'label'     => esc_html__( 'Placeholder', 'features-amenities' ),
				'type'      => Controls_Manager::TEXT,
				'default'   => esc_html__( 'Search amenities...', 'features-amenities' ),
				'condition' => [ 'enable_search' => 'yes' ],
			]
		);
		$this->end_controls_section();
	}

	private function register_layout_controls(): void {
		$this->start_controls_section(
			'section_layout_options',
			[
				'label'     => esc_html__( 'Layout Variations', 'features-amenities' ),
				'tab'       => Controls_Manager::TAB_STYLE,
				'condition' => [ 'motopress_template_id' => '' ],
			]
		);
		$this->add_control(
			'density',
			[
				'label'        => esc_html__( 'Density Mode', 'features-amenities' ),
				'type'         => Controls_Manager::SELECT,
				'default'      => 'cozy',
				'options'      => [
					'compact' => esc_html__( 'Compact', 'features-amenities' ),
					'cozy'    => esc_html__( 'Cozy (Default)', 'features-amenities' ),
					'comfy'   => esc_html__( 'Comfy', 'features-amenities' ),
				],
				'prefix_class' => 'fal-density-',
			]
		);
		$this->add_control(
			'menu_layout',
			[
				'label'        => esc_html__( 'Menu Layout', 'features-amenities' ),
				'type'         => Controls_Manager::SELECT,
				'default'      => 'list',
				'options'      => [
					'grid' => esc_html__( 'Grid View', 'features-amenities' ),
					'list' => esc_html__( 'List View', 'features-amenities' ),
				],
				'prefix_class' => 'fal-layout-',
			]
		);
		$this->add_control(
			'desktop_accordion',
			[
				'label'        => esc_html__( 'Enable Desktop Accordion', 'features-amenities' ),
				'type'         => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'default'      => 'no',
			]
		);
		$this->add_control(
			'exclusive_accordion',
			[
				'label'        => esc_html__( 'Close Others When Opening', 'features-amenities' ),
				'type'         => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'default'      => 'no',
				'description'  => esc_html__( 'When a section is opened, automatically close any other open accordion sections. Applies wherever the accordion is active (mobile, and desktop if enabled above).', 'features-amenities' ),
			]
		);
		$this->add_control(
			'auto_fold_words',
			[
				'label'       => esc_html__( 'Auto-fold Description (Words)', 'features-amenities' ),
				'type'        => Controls_Manager::NUMBER,
				'default'     => 0,
				'description' => esc_html__( '0 to disable. Adds Read More if description exceeds this word count.', 'features-amenities' ),
			]
		);
		$this->end_controls_section();
	}

	private function register_color_controls(): void {
		$this->start_controls_section(
			'style_colors',
			[
				'label'     => esc_html__( 'Colors & Glass', 'features-amenities' ),
				'tab'       => Controls_Manager::TAB_STYLE,
				'condition' => [ 'motopress_template_id' => '' ],
			]
		);
		$this->add_control(
			'inherit_theme',
			[
				'label'        => esc_html__( 'Inherit Theme Styles', 'features-amenities' ),
				'description'  => esc_html__( 'When on, the widget uses your WordPress theme\'s colors, fonts, and backgrounds by default. Style controls below still override.', 'features-amenities' ),
				'type'         => Controls_Manager::SWITCHER,
				'prefix_class' => 'fal-inherit-',
				'return_value' => 'yes',
				'default'      => 'yes',
				'separator'    => 'after',
			]
		);
		$this->add_control(
			'primary_color',
			[
				'label'     => esc_html__( 'Primary Brand Color', 'features-amenities' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => [ self::SEL => '--fal-primary: {{VALUE}};' ],
			]
		);
		$this->add_control(
			'glassmorphism',
			[
				'label'        => esc_html__( 'Enable Glassmorphism', 'features-amenities' ),
				'type'         => Controls_Manager::SWITCHER,
				'prefix_class' => 'fal-glass-',
				'default'      => 'yes',
				'return_value' => 'yes',
			]
		);
		$this->end_controls_section();
	}

	private function register_section_header_style_controls(): void {
		$this->start_controls_section(
			'style_section_headers',
			[
				'label'     => esc_html__( 'Section Headers', 'features-amenities' ),
				'tab'       => Controls_Manager::TAB_STYLE,
				'condition' => [ 'motopress_template_id' => '' ],
			]
		);

		$this->add_responsive_control(
			'header_text_align',
			[
				'label'     => esc_html__( 'Text Alignment', 'features-amenities' ),
				'type'      => Controls_Manager::CHOOSE,
				'default'   => 'center',
				'options'   => [
					'left'    => [ 'title' => esc_html__( 'Left', 'features-amenities' ),    'icon' => 'eicon-text-align-left' ],
					'center'  => [ 'title' => esc_html__( 'Center', 'features-amenities' ),  'icon' => 'eicon-text-align-center' ],
					'right'   => [ 'title' => esc_html__( 'Right', 'features-amenities' ),   'icon' => 'eicon-text-align-right' ],
					'justify' => [ 'title' => esc_html__( 'Justify', 'features-amenities' ), 'icon' => 'eicon-text-align-justify' ],
				],
				'selectors' => [ self::SEL . '.fal-section-title' => 'text-align: {{VALUE}};' ],
			]
		);
		$this->add_control(
			'header_hover',
			[
				'label'        => esc_html__( 'Hover Effect', 'features-amenities' ),
				'type'         => Controls_Manager::SELECT,
				'default'      => 'lift',
				'options'      => [
					'lift' => esc_html__( 'Lift up (default)', 'features-amenities' ),
					'none' => esc_html__( 'None', 'features-amenities' ),
				],
				'description'  => esc_html__( 'Visual effect when the section header is hovered.', 'features-amenities' ),
				'prefix_class' => 'fal-hh-',
			]
		);
		$this->add_control(
			'header_bg_color',
			[
				'label'     => esc_html__( 'Background Color', 'features-amenities' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => [ self::SEL . '.fal-section-header' => 'background: {{VALUE}};' ],
			]
		);
		$this->add_control(
			'header_text_color',
			[
				'label'     => esc_html__( 'Title Color', 'features-amenities' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => [ self::SEL . '.fal-section-title' => 'color: {{VALUE}};' ],
			]
		);
		$this->add_control(
			'header_icon_color',
			[
				'label'       => esc_html__( 'Icon Color', 'features-amenities' ),
				'type'        => Controls_Manager::COLOR,
				'description' => esc_html__( 'Colors the section icon and the accordion arrow (▼).', 'features-amenities' ),
				'selectors'   => [
					self::SEL . '.fal-section-icon, ' . self::SEL . '.fal-section-icon svg' => 'color: {{VALUE}}; fill: {{VALUE}};',
					self::SEL . '.fal-section-header::after'                                 => 'color: {{VALUE}};',
				],
			]
		);
		$this->add_responsive_control(
			'header_icon_size',
			[
				'label'      => esc_html__( 'Icon Size', 'features-amenities' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => [ 'px', 'em' ],
				'range'      => [ 'px' => [ 'min' => 8, 'max' => 72 ], 'em' => [ 'min' => 0.5, 'max' => 4, 'step' => 0.1 ] ],
				'selectors'  => [ self::SEL . '.fal-section-icon' => 'font-size: {{SIZE}}{{UNIT}};' ],
			]
		);
		$this->add_group_control(
			Group_Control_Typography::get_type(),
			[
				'name'     => 'header_typography',
				'label'    => esc_html__( 'Title Typography', 'features-amenities' ),
				'selector' => self::SEL . '.fal-section-title',
			]
		);
		$this->add_responsive_control(
			'header_padding',
			[
				'label'      => esc_html__( 'Padding', 'features-amenities' ),
				'type'       => Controls_Manager::DIMENSIONS,
				'size_units' => [ 'px', 'em', '%' ],
				'selectors'  => [ self::SEL . '.fal-section-header' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};' ],
			]
		);
		$this->add_responsive_control(
			'header_gap',
			[
				'label'      => esc_html__( 'Icon → Title Gap', 'features-amenities' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => [ 'px', 'em' ],
				'range'      => [ 'px' => [ 'min' => 0, 'max' => 60 ] ],
				'selectors'  => [ self::SEL . '.fal-section-header' => 'gap: {{SIZE}}{{UNIT}};' ],
			]
		);
		$this->add_responsive_control(
			'header_icon_edge_gap',
			[
				'label'       => esc_html__( 'Icon Edge Spacing', 'features-amenities' ),
				'type'        => Controls_Manager::SLIDER,
				'size_units'  => [ 'px', 'em' ],
				'range'       => [ 'px' => [ 'min' => 0, 'max' => 60 ], 'em' => [ 'min' => 0, 'max' => 4, 'step' => 0.1 ] ],
				'default'     => [ 'unit' => 'px', 'size' => 5 ],
				'description' => esc_html__( 'Extra space between the section icon and the left edge of the header, added on top of the header padding. Defaults to 5px.', 'features-amenities' ),
				'selectors'   => [ self::SEL . '.fal-section-icon' => 'margin-left: {{SIZE}}{{UNIT}};' ],
			]
		);
		$this->add_responsive_control(
			'header_arrow_edge_gap',
			[
				'label'       => esc_html__( 'Accordion Arrow Edge Spacing', 'features-amenities' ),
				'type'        => Controls_Manager::SLIDER,
				'size_units'  => [ 'px', 'em' ],
				'range'       => [ 'px' => [ 'min' => 0, 'max' => 60 ], 'em' => [ 'min' => 0, 'max' => 4, 'step' => 0.1 ] ],
				'default'     => [ 'unit' => 'px', 'size' => 5 ],
				'description' => esc_html__( 'Extra space between the accordion arrow (▼) and the right edge of the header, added on top of the header padding. Defaults to 5px. Only visible where the accordion arrow shows.', 'features-amenities' ),
				'selectors'   => [ self::SEL . '.fal-section-header::after' => 'margin-right: {{SIZE}}{{UNIT}};' ],
			]
		);
		$this->add_responsive_control(
			'header_margin_bottom',
			[
				'label'      => esc_html__( 'Spacing Below Header', 'features-amenities' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => [ 'px', 'em' ],
				'range'      => [ 'px' => [ 'min' => 0, 'max' => 80 ] ],
				'selectors'  => [ self::SEL . '.fal-section-header' => 'margin-bottom: {{SIZE}}{{UNIT}};' ],
			]
		);
		$this->add_responsive_control(
			'section_margin_bottom',
			[
				'label'      => esc_html__( 'Spacing Between Sections', 'features-amenities' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => [ 'px', 'em' ],
				'range'      => [ 'px' => [ 'min' => 0, 'max' => 120 ] ],
				'selectors'  => [ self::SEL . '.fal-section' => 'margin-bottom: {{SIZE}}{{UNIT}};' ],
			]
		);
		$this->add_group_control(
			Group_Control_Border::get_type(),
			[
				'name'     => 'header_border',
				'label'    => esc_html__( 'Border', 'features-amenities' ),
				'selector' => self::SEL . '.fal-section-header',
			]
		);
		$this->add_responsive_control(
			'header_border_radius',
			[
				'label'      => esc_html__( 'Border Radius', 'features-amenities' ),
				'type'       => Controls_Manager::DIMENSIONS,
				'size_units' => [ 'px', '%' ],
				'selectors'  => [ self::SEL . '.fal-section-header' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};' ],
			]
		);
		$this->add_group_control(
			Group_Control_Box_Shadow::get_type(),
			[
				'name'     => 'header_box_shadow',
				'label'    => esc_html__( 'Box Shadow', 'features-amenities' ),
				'selector' => self::SEL . '.fal-section-header',
			]
		);

		$this->end_controls_section();
	}

	private function register_amenity_card_style_controls(): void {
		$this->start_controls_section(
			'style_amenities',
			[
				'label'     => esc_html__( 'Amenity Cards', 'features-amenities' ),
				'tab'       => Controls_Manager::TAB_STYLE,
				'condition' => [ 'motopress_template_id' => '' ],
			]
		);

		$this->add_responsive_control(
			'amenity_text_align',
			[
				'label'     => esc_html__( 'Text Alignment', 'features-amenities' ),
				'type'      => Controls_Manager::CHOOSE,
				'default'   => 'center',
				'options'   => [
					'left'    => [ 'title' => esc_html__( 'Left', 'features-amenities' ),    'icon' => 'eicon-text-align-left' ],
					'center'  => [ 'title' => esc_html__( 'Center', 'features-amenities' ),  'icon' => 'eicon-text-align-center' ],
					'right'   => [ 'title' => esc_html__( 'Right', 'features-amenities' ),   'icon' => 'eicon-text-align-right' ],
					'justify' => [ 'title' => esc_html__( 'Justify', 'features-amenities' ), 'icon' => 'eicon-text-align-justify' ],
				],
				'selectors' => [ self::SEL . '.fal-amenity' => 'text-align: {{VALUE}};' ],
			]
		);
		$this->add_control(
			'amenity_hover',
			[
				'label'        => esc_html__( 'Hover Effect', 'features-amenities' ),
				'type'         => Controls_Manager::SELECT,
				'default'      => 'scale',
				'options'      => [
					'scale' => esc_html__( 'Scale up (default)', 'features-amenities' ),
					'none'  => esc_html__( 'None', 'features-amenities' ),
				],
				'description'  => esc_html__( 'Visual effect when an amenity card is hovered.', 'features-amenities' ),
				'prefix_class' => 'fal-ah-',
			]
		);
		$this->add_control(
			'amenity_bg_color',
			[
				'label'     => esc_html__( 'Background Color', 'features-amenities' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => [ self::SEL . '.fal-amenity' => 'background: {{VALUE}};' ],
			]
		);
		$this->add_control(
			'amenity_title_color',
			[
				'label'     => esc_html__( 'Title Color', 'features-amenities' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => [ self::SEL . '.fal-amenity-title' => 'color: {{VALUE}};' ],
			]
		);
		$this->add_control(
			'amenity_desc_color',
			[
				'label'     => esc_html__( 'Description Color', 'features-amenities' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => [ self::SEL . '.fal-amenity-desc' => 'color: {{VALUE}}; opacity: 1;' ],
			]
		);
		$this->add_control(
			'amenity_icon_color',
			[
				'label'     => esc_html__( 'Icon Color', 'features-amenities' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => [
					self::SEL . '.fal-amenity-icon-wrap, ' . self::SEL . '.fal-amenity-icon-wrap svg' => 'color: {{VALUE}}; fill: {{VALUE}};',
				],
			]
		);
		$this->add_control(
			'amenity_icon_bg_color',
			[
				'label'     => esc_html__( 'Icon Background Color', 'features-amenities' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => [ self::SEL . '.fal-amenity-icon-wrap' => 'background: {{VALUE}};' ],
			]
		);
		$this->add_responsive_control(
			'amenity_icon_wrap_size',
			[
				'label'      => esc_html__( 'Icon Wrapper Size', 'features-amenities' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => [ 'px' ],
				'range'      => [ 'px' => [ 'min' => 16, 'max' => 120 ] ],
				'selectors'  => [
					self::SEL . '.fal-amenity-icon-wrap' => 'width: {{SIZE}}{{UNIT}}; height: {{SIZE}}{{UNIT}};',
				],
			]
		);
		$this->add_responsive_control(
			'amenity_icon_size',
			[
				'label'      => esc_html__( 'Icon Size', 'features-amenities' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => [ 'px', 'em' ],
				'range'      => [ 'px' => [ 'min' => 8, 'max' => 80 ], 'em' => [ 'min' => 0.5, 'max' => 4, 'step' => 0.1 ] ],
				'selectors'  => [
					self::SEL . '.fal-amenity-icon-wrap i'   => 'font-size: {{SIZE}}{{UNIT}};',
					self::SEL . '.fal-amenity-icon-wrap svg' => 'width: 1em; height: 1em; font-size: {{SIZE}}{{UNIT}};',
				],
			]
		);
		$this->add_group_control(
			Group_Control_Typography::get_type(),
			[
				'name'     => 'amenity_title_typography',
				'label'    => esc_html__( 'Title Typography', 'features-amenities' ),
				'selector' => self::SEL . '.fal-amenity-title',
			]
		);
		$this->add_group_control(
			Group_Control_Typography::get_type(),
			[
				'name'     => 'amenity_desc_typography',
				'label'    => esc_html__( 'Description Typography', 'features-amenities' ),
				'selector' => self::SEL . '.fal-amenity-desc',
			]
		);
		$this->add_responsive_control(
			'amenity_padding',
			[
				'label'      => esc_html__( 'Padding', 'features-amenities' ),
				'type'       => Controls_Manager::DIMENSIONS,
				'size_units' => [ 'px', 'em', '%' ],
				'selectors'  => [ self::SEL . '.fal-amenity' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}}; --fal-density-pad: 0;' ],
			]
		);
		$this->add_responsive_control(
			'amenity_gap',
			[
				'label'      => esc_html__( 'Gap Between Cards', 'features-amenities' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => [ 'px', 'em' ],
				'range'      => [ 'px' => [ 'min' => 0, 'max' => 80 ] ],
				'selectors'  => [ self::SEL . '.fal-amenities' => 'gap: {{SIZE}}{{UNIT}}; --fal-density-gap: 0;' ],
			]
		);
		$this->add_responsive_control(
			'amenity_inner_gap',
			[
				'label'       => esc_html__( 'Icon → Heading Spacing', 'features-amenities' ),
				'type'        => Controls_Manager::SLIDER,
				'size_units'  => [ 'px', 'em' ],
				'range'       => [ 'px' => [ 'min' => 0, 'max' => 80 ] ],
				'description' => esc_html__( 'Vertical space between the amenity icon and the title heading. Defaults to 10px when unset.', 'features-amenities' ),
				'selectors'   => [ self::SEL . '.fal-amenity' => 'gap: {{SIZE}}{{UNIT}};' ],
			]
		);
		$this->add_responsive_control(
			'amenity_title_margin_bottom',
			[
				'label'      => esc_html__( 'Title → Description Spacing', 'features-amenities' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => [ 'px', 'em' ],
				'range'      => [ 'px' => [ 'min' => 0, 'max' => 40 ] ],
				'selectors'  => [ self::SEL . '.fal-amenity-title' => 'margin-bottom: {{SIZE}}{{UNIT}};' ],
			]
		);
		$this->add_group_control(
			Group_Control_Border::get_type(),
			[
				'name'     => 'amenity_border',
				'label'    => esc_html__( 'Border', 'features-amenities' ),
				'selector' => self::SEL . '.fal-amenity',
			]
		);
		$this->add_responsive_control(
			'amenity_border_radius',
			[
				'label'      => esc_html__( 'Border Radius', 'features-amenities' ),
				'type'       => Controls_Manager::DIMENSIONS,
				'size_units' => [ 'px', '%' ],
				'selectors'  => [ self::SEL . '.fal-amenity' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};' ],
			]
		);
		$this->add_group_control(
			Group_Control_Box_Shadow::get_type(),
			[
				'name'     => 'amenity_box_shadow',
				'label'    => esc_html__( 'Box Shadow', 'features-amenities' ),
				'selector' => self::SEL . '.fal-amenity',
			]
		);
		$this->add_responsive_control(
			'amenity_grid_min_col',
			[
				'label'       => esc_html__( 'Grid Min Column Width', 'features-amenities' ),
				'type'        => Controls_Manager::SLIDER,
				'size_units'  => [ 'px' ],
				'range'       => [ 'px' => [ 'min' => 100, 'max' => 600 ] ],
				'description' => esc_html__( 'Only applies when Menu Layout is set to Grid View.', 'features-amenities' ),
				'selectors'   => [ '{{WRAPPER}}.fal-layout-grid .fal-amenities' => 'grid-template-columns: repeat(auto-fill, minmax({{SIZE}}{{UNIT}}, 1fr));' ],
			]
		);
		$this->end_controls_section();
	}

	protected function render() {
		$settings = $this->get_settings_for_display();

		if ( ! empty( $settings['motopress_template_id'] ) ) {
			$template_id   = intval( $settings['motopress_template_id'] );
			$template_post = get_post( $template_id );
			if ( $template_post && $template_post->post_type === 'mphb_template' && $template_post->post_status === 'publish' ) {
				echo '<div class="fal-motopress-template-wrapper">';
				$document = class_exists( '\\Elementor\\Plugin' ) ? \Elementor\Plugin::$instance->documents->get( $template_id ) : null;
				if ( $document && $document->is_built_with_elementor() ) {
					echo \Elementor\Plugin::instance()->frontend->get_builder_content_for_display( $template_id ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				} else {
					echo apply_filters( 'the_content', $template_post->post_content ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				}
				echo '</div>';
				return;
			}
		}

		if ( empty( $settings['list_items'] ) ) {
			return;
		}

		$desktop_accordion   = ( 'yes' === ( $settings['desktop_accordion'] ?? 'no' ) ) ? ' desktop-accordion-enabled' : '';
		$exclusive_accordion = ( 'yes' === ( $settings['exclusive_accordion'] ?? 'no' ) ) ? ' exclusive-accordion-enabled' : '';
		$auto_fold           = (int) ( $settings['auto_fold_words'] ?? 0 );
		$enable_search       = 'yes' === ( $settings['enable_search'] ?? '' );
		$search_placeholder  = $settings['search_placeholder'] ?? __( 'Search amenities...', 'features-amenities' );

		echo '<div class="fal-container' . esc_attr( $desktop_accordion . $exclusive_accordion ) . '">';

		if ( $enable_search ) {
			echo '<div class="fal-search-wrap">';
			echo '<i class="fas fa-search fal-search-icon" aria-hidden="true"></i>';
			echo '<input type="text" class="fal-search-input" placeholder="' . esc_attr( $search_placeholder ) . '" aria-label="' . esc_attr( $search_placeholder ) . '">';
			echo '<button class="fal-search-clear" type="button" aria-label="' . esc_attr__( 'Clear search', 'features-amenities' ) . '">';
			echo '<svg class="fal-search-clear-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
			echo '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>';
			echo '</svg>';
			echo '</button>';
			echo '</div>';
			echo '<div class="fal-search-status" aria-live="polite"></div>';
		}

		$in_section   = false;
		$default_icon = $settings['default_amenity_icon'] ?? [ 'value' => 'fas fa-anchor', 'library' => 'fa-solid' ];

		foreach ( $settings['list_items'] as $item ) {
			$is_section = ( $item['item_type'] === 'section' );

			if ( $is_section ) {
				if ( $in_section ) {
					echo '</div></div></div>';
				}
				echo '<div class="fal-section">';
				echo '<div class="fal-section-header elementor-repeater-item-' . esc_attr( $item['_id'] ) . '">';
				echo '<span class="fal-section-icon">';
				Icons_Manager::render_icon( $item['item_icon'], [ 'aria-hidden' => 'true' ] );
				echo '</span>';
				echo '<span class="fal-section-title">' . wp_kses_post( $item['item_text'] ) . '</span>';
				echo '</div>';
				echo '<div class="fal-section-content"><div class="fal-amenities">';
				$in_section = true;
			} else {
				if ( ! $in_section ) {
					echo '<div class="fal-section"><div class="fal-section-content"><div class="fal-amenities">';
					$in_section = true;
				}
				echo '<div class="fal-amenity elementor-repeater-item-' . esc_attr( $item['_id'] ) . '">';
				echo '<div class="fal-amenity-icon-wrap"><span class="fal-amenity-icon">';
				$icon_to_render = ! empty( $item['item_icon']['value'] ) ? $item['item_icon'] : $default_icon;
				Icons_Manager::render_icon( $icon_to_render, [ 'aria-hidden' => 'true' ] );
				echo '</span></div>';

				echo '<div class="fal-amenity-content">';
				echo '<div class="fal-amenity-title">' . wp_kses_post( $item['item_text'] ) . '</div>';

				if ( ! empty( $item['item_description'] ) ) {
					$desc           = wpautop( wp_kses_post( $item['item_description'] ) );
					$is_auto_folded = false;
					if ( $auto_fold > 0 ) {
						$word_count = count( preg_split( '/\s+/u', wp_strip_all_tags( $desc ), -1, PREG_SPLIT_NO_EMPTY ) );
						if ( $word_count > $auto_fold ) {
							$is_auto_folded = true;
						}
					}

					echo '<div class="fal-amenity-desc-wrap ' . ( $is_auto_folded ? 'fal-collapsible' : '' ) . '">';
					echo '<div class="fal-amenity-desc">' . $desc . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
					echo '</div>';
					if ( $is_auto_folded ) {
						echo '<button class="fal-read-more" type="button">' . esc_html__( 'Read More', 'features-amenities' ) . '</button>';
					}
				}
				echo '</div></div>';
			}
		}
		if ( $in_section ) {
			echo '</div></div></div>';
		}
		echo '</div>';
	}

	protected function content_template() {
		?>
		<#
		if ( settings.motopress_template_id ) {
			#>
			<div style="padding: 20px; background: #e2e3e5; text-align: center;"><?php echo esc_html__( 'Please preview to see MotoPress content.', 'features-amenities' ); ?></div>
			<# return;
		}
		if ( ! settings.list_items || settings.list_items.length === 0 ) return;

		var defaultIcon = elementor.helpers.renderIcon( view, settings.default_amenity_icon, { 'aria-hidden': 'true' }, 'i', 'object' );
		var renderedDefaultIcon = ( defaultIcon && defaultIcon.value ) ? defaultIcon.value : '';
		var desktopAccordionClass   = ( 'yes' === settings.desktop_accordion )   ? ' desktop-accordion-enabled'   : '';
		var exclusiveAccordionClass = ( 'yes' === settings.exclusive_accordion ) ? ' exclusive-accordion-enabled' : '';
		var autoFold = parseInt( settings.auto_fold_words, 10 ) || 0;
		#>
		<div class="fal-container{{ desktopAccordionClass }}{{ exclusiveAccordionClass }}">
		<# if ( 'yes' === settings.enable_search ) { #>
			<div class="fal-search-wrap">
				<i class="fas fa-search fal-search-icon" aria-hidden="true"></i>
				<input type="text" class="fal-search-input" placeholder="{{ settings.search_placeholder }}" aria-label="{{ settings.search_placeholder }}">
				<button class="fal-search-clear" type="button" aria-label="<?php echo esc_attr__( 'Clear search', 'features-amenities' ); ?>">
					<svg class="fal-search-clear-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>
				</button>
			</div>
			<div class="fal-search-status" aria-live="polite"></div>
		<# } #>
		<#
		var in_section = false;
		_.each( settings.list_items, function( item ) {
			var iconHTML = elementor.helpers.renderIcon( view, item.item_icon, { 'aria-hidden': 'true' }, 'i', 'object' );
			var ownIcon  = ( iconHTML && iconHTML.value ) ? iconHTML.value : '';

			if ( item.item_type === 'section' ) {
				if ( in_section ) #></div></div></div><#
				#>
				<div class="fal-section">
					<div class="fal-section-header elementor-repeater-item-{{ item._id }}">
						<span class="fal-section-icon">{{{ ownIcon }}}</span>
						<span class="fal-section-title">{{{ item.item_text }}}</span>
					</div>
					<div class="fal-section-content"><div class="fal-amenities">
				<# in_section = true;
			} else {
				if ( ! in_section ) {
					#><div class="fal-section"><div class="fal-section-content"><div class="fal-amenities"><#
					in_section = true;
				}
				var renderedIcon = ownIcon || renderedDefaultIcon;
				var isFolded = false;
				if ( autoFold > 0 && item.item_description ) {
					var plain = jQuery( '<div>' ).html( item.item_description ).text();
					isFolded  = plain.trim().split( /\s+/ ).filter( Boolean ).length > autoFold;
				}
				#>
				<div class="fal-amenity elementor-repeater-item-{{ item._id }}">
					<div class="fal-amenity-icon-wrap"><span class="fal-amenity-icon">{{{ renderedIcon }}}</span></div>
					<div class="fal-amenity-content">
						<div class="fal-amenity-title">{{{ item.item_text }}}</div>
						<# if ( item.item_description ) { #>
							<div class="fal-amenity-desc-wrap{{ isFolded ? ' fal-collapsible' : '' }}"><div class="fal-amenity-desc">{{{ item.item_description }}}</div></div>
							<# if ( isFolded ) { #><button class="fal-read-more" type="button"><?php echo esc_html__( 'Read More', 'features-amenities' ); ?></button><# } #>
						<# } #>
					</div>
				</div>
				<#
			}
		} );
		if ( in_section ) #></div></div></div><#
		#></div>
		<?php
	}
}
