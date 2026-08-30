<?php
/**
 * Elementor widget `dccwl_month` — a thin wrapper over Render::render() so
 * the widget and the [dcc_wildlife] shortcode produce identical output.
 * Uses only free-Elementor APIs.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Widget extends \Elementor\Widget_Base {

	public function get_name(): string {
		return 'dccwl_month';
	}

	public function get_title(): string {
		return __( 'DCC Wildlife — On the Canal', 'dcc-wildlife' );
	}

	public function get_icon(): string {
		return 'eicon-globe';
	}

	public function get_categories(): array {
		return [ 'dcc-widgets' ];
	}

	public function get_keywords(): array {
		return [ 'wildlife', 'canal', 'nature', 'dcc' ];
	}

	protected function register_controls(): void {
		$this->start_controls_section(
			'section_content',
			[
				'label' => __( 'Wildlife', 'dcc-wildlife' ),
				'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
			]
		);

		$this->add_control(
			'widget_title',
			[
				'label'       => __( 'Title', 'dcc-wildlife' ),
				'type'        => \Elementor\Controls_Manager::TEXT,
				'default'     => '',
				'placeholder' => __( 'On the canal this month', 'dcc-wildlife' ),
				'description' => __( 'Leave empty for the default title.', 'dcc-wildlife' ),
			]
		);

		$this->add_control(
			'show_guide',
			[
				'label'   => __( 'Show field guide', 'dcc-wildlife' ),
				'type'    => \Elementor\Controls_Manager::SWITCHER,
				'default' => 'yes',
			]
		);

		$this->add_control(
			'show_browser',
			[
				'label'   => __( 'Show month browser', 'dcc-wildlife' ),
				'type'    => \Elementor\Controls_Manager::SWITCHER,
				'default' => 'yes',
			]
		);

		$this->add_control(
			'compact',
			[
				'label'       => __( 'Compact mode', 'dcc-wildlife' ),
				'type'        => \Elementor\Controls_Manager::SWITCHER,
				'default'     => '',
				'description' => __( 'Spotlight band only — hides the field guide and month browser.', 'dcc-wildlife' ),
			]
		);

		// 1.8.1: the preferred, zero-config countdown placement — appended
		// under this widget wherever it already sits. The default mirrors the
		// sitewide toggle at the moment the control is registered; the
		// sitewide toggle still overrides when off.
		$this->add_control(
			'show_countdown',
			[
				'label'       => __( 'Show season countdown', 'dcc-wildlife' ),
				'type'        => \Elementor\Controls_Manager::SWITCHER,
				'default'     => Water_Admin::countdown_enabled() ? 'yes' : '',
				'description' => __( 'Appends the "…season starts in N days" line below the widget. The sitewide toggle in DCC → Wildlife must also be on.', 'dcc-wildlife' ),
			]
		);

		$this->end_controls_section();
	}

	protected function render(): void {
		$settings = $this->get_settings_for_display();

		// Render::render() escapes all output internally.
		echo Render::render( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			[
				'title'        => (string) ( $settings['widget_title'] ?? '' ),
				'show_guide'   => 'yes' === ( $settings['show_guide'] ?? 'yes' ),
				'show_browser' => 'yes' === ( $settings['show_browser'] ?? 'yes' ),
				'compact'      => 'yes' === ( $settings['compact'] ?? '' ),
				// Missing on widgets saved before 1.8.1 — default to 'yes' so
				// the 1.8.0 auto-append behaviour carries over unchanged.
				'countdown'    => 'yes' === ( $settings['show_countdown'] ?? 'yes' ),
			]
		);
	}
}
