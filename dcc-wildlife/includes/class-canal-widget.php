<?php
/**
 * Elementor widget `dccwl_canal` (1.10.0) — the Canal hub app.
 *
 * A thin wrapper over Canal_Render, which itself composes the existing
 * month and water renderers. The legacy widgets (dccwl_month, dccwl_water,
 * dccwl_countdown) still work when placed on their own; this one gathers
 * them into a single hub → section → detail app.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Canal_Widget extends \Elementor\Widget_Base {

	public function get_name(): string {
		return 'dccwl_canal';
	}

	public function get_title(): string {
		return __( 'DCC Canal — Wildlife & Water', 'dcc-wildlife' );
	}

	public function get_icon(): string {
		return 'eicon-menu-card';
	}

	public function get_categories(): array {
		return [ 'dcc-widgets' ];
	}

	public function get_keywords(): array {
		return [ 'canal', 'wildlife', 'water', 'fishing', 'dcc' ];
	}

	protected function register_controls(): void {
		$this->start_controls_section(
			'section_content',
			[
				'label' => __( 'Canal', 'dcc-wildlife' ),
				'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
			]
		);

		$this->add_control(
			'widget_title',
			[
				'label'       => __( 'Hub heading', 'dcc-wildlife' ),
				'type'        => \Elementor\Controls_Manager::TEXT,
				'default'     => '',
				'placeholder' => __( 'The Dora Canal', 'dcc-wildlife' ),
				'description' => __( 'Leave empty for the default heading.', 'dcc-wildlife' ),
			]
		);

		$this->add_control(
			'canal_note',
			[
				'type' => \Elementor\Controls_Manager::RAW_HTML,
				'raw'  => esc_html__( 'One widget for the whole canal: the season countdown, a Wildlife path (months → species → detail) and the full Water module. Place this INSTEAD of the separate Wildlife and Water widgets — placing both would show the same content twice.', 'dcc-wildlife' ),
			]
		);

		$this->end_controls_section();
	}

	protected function render(): void {
		// Canal_Render escapes all of its own output.
		echo Canal_Render::render( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			[ 'title' => (string) ( $this->get_settings_for_display()['widget_title'] ?? '' ) ]
		);
	}
}
