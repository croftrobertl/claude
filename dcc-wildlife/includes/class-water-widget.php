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
	}

	protected function render(): void {
		$settings = $this->get_settings_for_display();

		// Water_Render escapes all output internally.
		echo Water_Render::render( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			[ 'title' => (string) ( $settings['water_title'] ?? '' ) ]
		);
	}
}
