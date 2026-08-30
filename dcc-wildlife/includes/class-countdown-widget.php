<?php
/**
 * Elementor widget `dccwl_countdown` — the season countdown on its own
 * (1.8.1). A thin wrapper over the SAME renderer the month widget's toggle
 * and the legacy [dcc_wildlife_countdown] shortcode use: one renderer,
 * three entry points, and the shell is emitted once per page whichever
 * combination is placed. The day count is computed client-side in canal
 * time — never baked into cached HTML.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Countdown_Widget extends \Elementor\Widget_Base {

	public function get_name(): string {
		return 'dccwl_countdown';
	}

	public function get_title(): string {
		return __( 'DCC Wildlife — Season Countdown', 'dcc-wildlife' );
	}

	public function get_icon(): string {
		return 'eicon-countdown';
	}

	public function get_categories(): array {
		return [ 'dcc-widgets' ];
	}

	public function get_keywords(): array {
		return [ 'countdown', 'season', 'wildlife', 'dcc' ];
	}

	protected function register_controls(): void {
		$this->start_controls_section(
			'section_content',
			[
				'label' => __( 'Season countdown', 'dcc-wildlife' ),
				'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
			]
		);

		// No per-widget options: the line's content comes from the species
		// calendar and the on/off switch is sitewide, so placing the widget
		// IS the configuration.
		$this->add_control(
			'countdown_note',
			[
				'type' => \Elementor\Controls_Manager::RAW_HTML,
				'raw'  => esc_html__( 'Shows "…season starts in N days", computed in the visitor\'s browser from the species calendar (in canal time). The sitewide on/off switch lives in DCC → Wildlife.', 'dcc-wildlife' ),
			]
		);

		$this->end_controls_section();
	}

	protected function render(): void {
		// Same output path as the shortcode: gate, enqueue, one-per-page shell.
		$out = Render::countdown_shortcode();

		if ( '' === $out && $this->is_editor() ) {
			// In the editor an empty render reads as a broken widget, so say
			// why it is empty instead. Front-end output stays truly empty.
			echo '<div class="dccwl-countdown" style="opacity:.6">'
				. esc_html__( 'Season countdown is turned off in DCC → Wildlife, or already shown by another widget on this page.', 'dcc-wildlife' )
				. '</div>';
			return;
		}

		echo $out; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static trusted shell markup.
	}

	/** Editor detection that cannot fatal if Elementor internals move. */
	private function is_editor(): bool {
		if ( ! class_exists( '\Elementor\Plugin' ) || ! isset( \Elementor\Plugin::$instance->editor ) ) {
			return false;
		}
		$editor = \Elementor\Plugin::$instance->editor;
		return is_object( $editor ) && method_exists( $editor, 'is_edit_mode' ) && $editor->is_edit_mode();
	}
}
