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

		/*
		 * NO CONTROLS, and that is the honest answer rather than a gap.
		 *
		 * The countdown was retired in 1.27.0: countdown_possible() returns
		 * false, so this widget renders nothing by any path. Giving it
		 * overrides would be giving controls to a widget with no output — the
		 * exact defect that removed the month widget's countdown switcher in
		 * 1.31.0 and the sitewide checkbox in 1.32.0. The registration stays so
		 * that a page already placing this widget does not error.
		 *
		 * What it gets instead is an accurate note, because an editor looking
		 * at an empty widget deserves to be told why.
		 */
		$this->add_control(
			'countdown_note',
			[
				'type' => \Elementor\Controls_Manager::RAW_HTML,
				'raw'  => '<p style="margin:0">' . esc_html__( 'This widget is retired and renders nothing. The season countdown card was removed in 1.27.0. You can delete this widget from the page — it is harmless either way, and it has no settings because there is nothing left for them to change.', 'dcc-wildlife' ) . '</p>',
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
