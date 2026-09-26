<?php
/**
 * Water module — Elementor widget `dccwl_water`.
 *
 * A thin wrapper over Water_Render so the widget and the [dcc_water]
 * shortcode produce identical output. Free-Elementor APIs only.
 *
 * Placement is manual by design: this widget renders nowhere until it is
 * placed on a page. Nothing is auto-injected into the Guest Guide or
 * anywhere else.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Water_Widget extends \Elementor\Widget_Base {

	public function get_name(): string {
		return 'dccwl_water';
	}

	public function get_title(): string {
		return __( 'DCC Water — Fishing & Conditions', 'dcc-wildlife' );
	}

	public function get_icon(): string {
		return 'eicon-info-circle-o';
	}

	public function get_categories(): array {
		return [ 'dcc-widgets' ];
	}

	public function get_keywords(): array {
		return [ 'fishing', 'water', 'canal', 'conditions', 'dcc' ];
	}

	protected function register_controls(): void {
		$this->start_controls_section(
			'section_water',
			[
				'label' => __( 'Fishing & water', 'dcc-wildlife' ),
				'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
			]
		);

		$this->add_control(
			'water_title',
			[
				'label'       => __( 'Title', 'dcc-wildlife' ),
				'type'        => \Elementor\Controls_Manager::TEXT,
				'default'     => '',
				'placeholder' => __( 'Fishing & water conditions', 'dcc-wildlife' ),
				'description' => __( 'Leave empty for the default title.', 'dcc-wildlife' ),
			]
		);

		$this->add_control(
			'water_notice',
			[
				'type'            => \Elementor\Controls_Manager::RAW_HTML,
				'raw'             => esc_html__( 'Content is managed under Settings → DCC Water. Sections with no sourced content simply do not render.', 'dcc-wildlife' ),
				'content_classes' => 'elementor-descriptor',
			]
		);

		$this->end_controls_section();

		$this->start_controls_section(
			'section_overrides',
			[
				'label' => __( 'Override for this placement', 'dcc-wildlife' ),
				'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
			]
		);

		$this->add_control(
			'ov_note',
			[
				'type' => \Elementor\Controls_Manager::RAW_HTML,
				'raw'  => '<p style="margin:0">' . esc_html__( 'Two of these can only HIDE a section. The fishing almanac and the chain map depend on there being sourced content and a configured map, so a widget cannot promise either — it can only leave it out. The moon card has no such dependency and can be switched either way.', 'dcc-wildlife' ) . '</p>',
			]
		);

		$this->add_control( 'ov_moon', Guide_Data::three_way( __( '"Tonight on the canal" card', 'dcc-wildlife' ) ) );
		$this->add_control( 'ov_fishing', Guide_Data::three_way( __( 'Fishing the Harris Chain', 'dcc-wildlife' ), true ) );
		$this->add_control( 'ov_map_button', Guide_Data::three_way( __( 'Chain map button', 'dcc-wildlife' ), true ) );

		$this->end_controls_section();
	}

	protected function render(): void {
		$settings = $this->get_settings_for_display();

		// Water_Render escapes all output internally.
		echo Water_Render::render( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			[
				'title'      => (string) ( $settings['water_title'] ?? '' ),
				'moon'       => $settings['ov_moon'] ?? null,
				'fishing'    => $settings['ov_fishing'] ?? null,
				'map_button' => $settings['ov_map_button'] ?? null,
			]
		);
	}
}
