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
				'raw'  => '<p style="margin:0">' . esc_html__( 'All of this is set once in DCC → Wildlife. Change something here only to make THIS hub differ. "Use the setting" stores nothing, so the widget keeps following the settings page as you change it.', 'dcc-wildlife' ) . '</p>',
			]
		);

		$this->add_control( 'ov_search', Guide_Data::three_way( __( 'Search box', 'dcc-wildlife' ) ) );
		$this->add_control( 'ov_subnav', Guide_Data::three_way( __( 'Group chips', 'dcc-wildlife' ) ) );
		$this->add_control( 'ov_jump', Guide_Data::three_way( __( '"Jump to a species" list', 'dcc-wildlife' ) ) );
		$this->add_control( 'ov_compact_btn', Guide_Data::three_way( __( '"Compact" button', 'dcc-wildlife' ) ) );

		$this->add_control(
			'ov_view',
			[
				'label'   => __( 'Species list opens as', 'dcc-wildlife' ),
				'type'    => 'select',
				'default' => '',
				'options' => [
					''        => __( 'Use the setting', 'dcc-wildlife' ),
					'deck'    => __( 'Photo cards', 'dcc-wildlife' ),
					'compact' => __( 'Short rows', 'dcc-wildlife' ),
				],
			]
		);

		$this->add_control( 'ov_deck_rows', Guide_Data::number_control( __( 'Rows per page of cards, on a phone', 'dcc-wildlife' ), 'deck_rows' ) );
		$this->add_control( 'ov_hub_preview_max', Guide_Data::number_control( __( 'Species named on the Wildlife tile', 'dcc-wildlife' ), 'hub_preview_max' ) );
		$this->add_control( 'ov_now_names_max', Guide_Data::number_control( __( 'Species named in the "right now" line', 'dcc-wildlife' ), 'now_names_max' ) );
		$this->add_control( 'ov_month_art_max', Guide_Data::number_control( __( 'Species drawn on each month tile', 'dcc-wildlife' ), 'month_art_max' ) );
		$this->add_control( 'ov_sticky_offset', Guide_Data::number_control( __( 'Sticky header height, in pixels', 'dcc-wildlife' ), 'sticky_offset' ) );

		$this->end_controls_section();
	}

	protected function render(): void {
		$s = $this->get_settings_for_display();

		// Canal_Render escapes all of its own output. Overrides are relayed
		// RAW: Canal_Render and Guide_Data own what they mean, so a widget
		// cannot invent a third interpretation of 'on'.
		echo Canal_Render::render( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			[
				'title'           => (string) ( $s['widget_title'] ?? '' ),
				'search'          => $s['ov_search'] ?? null,
				'subnav'          => $s['ov_subnav'] ?? null,
				'jump'            => $s['ov_jump'] ?? null,
				'compact_btn'     => $s['ov_compact_btn'] ?? null,
				'view'            => $s['ov_view'] ?? null,
				'deck_rows'       => $s['ov_deck_rows'] ?? null,
				'hub_preview_max' => $s['ov_hub_preview_max'] ?? null,
				'now_names_max'   => $s['ov_now_names_max'] ?? null,
				'month_art_max'   => $s['ov_month_art_max'] ?? null,
				'sticky_offset'   => $s['ov_sticky_offset'] ?? null,
			]
		);
	}
}
