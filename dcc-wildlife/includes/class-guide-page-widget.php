<?php
/**
 * Elementor widget `dccwl_guide_page` (1.43.0) — the Wildlife Guide page.
 *
 * A thin wrapper over Guide_Page, which composes Render::species_prose(). The
 * Director places this on /wildlife-guide/; `[dcc_wildlife_guide]` does the
 * same job where a shortcode is simpler.
 *
 * NOTE ON CACHING, and it is the opposite of every other widget here:
 * `is_dynamic_content()` is NOT overridden, so Elementor may cache this
 * element freely. Everything it renders is month-independent and
 * time-independent — the prose, the scientific names, the field marks and the
 * credits — which is exactly the property that let the prose be
 * server-rendered in the first place (1.16.0). The hub has to refuse caching
 * because it bakes a measured age into its HTML; this page bakes nothing.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Guide_Page_Widget extends \Elementor\Widget_Base {

	public function get_name(): string {
		return 'dccwl_guide_page';
	}

	public function get_title(): string {
		return __( 'DCC Wildlife Guide — Full Page', 'dcc-wildlife' );
	}

	public function get_icon(): string {
		return 'eicon-document-file';
	}

	public function get_categories(): array {
		return [ 'dcc-widgets' ];
	}

	/** The editor preview needs telling; the front end enqueues at render. */
	public function get_style_depends(): array {
		return [ 'dcc-wildlife' ];
	}

	/**
	 * DELIBERATELY EMPTY. This page loads no JavaScript at all — the
	 * Director's "nothing heavy runs on load" — and naming a script here
	 * would load one in the editor that the front end never serves, which is
	 * the editor-preview-disagrees-with-live defect from 1.32.x.
	 */
	public function get_script_depends(): array {
		return [];
	}

	public function get_keywords(): array {
		return [ 'wildlife', 'guide', 'species', 'field guide', 'dcc' ];
	}

	protected function register_controls(): void {
		$this->start_controls_section(
			'section_content',
			[
				'label' => __( 'Wildlife Guide', 'dcc-wildlife' ),
				'tab'   => \Elementor\Controls_Manager::TAB_CONTENT,
			]
		);

		/*
		 * There is deliberately NO control here that could hide, shorten or
		 * paginate the guide. This page exists because the prose has to be
		 * fully present in the HTML; a switch that took part of it away would
		 * be a switch on the reason the page exists. Same rule as the
		 * crawlable prose in Guide_Data's not-settable list.
		 */
		$this->add_control(
			'note',
			[
				'type' => \Elementor\Controls_Manager::RAW_HTML,
				'raw'  => esc_html__( 'Renders every species in the guide, in full, as page text. There are no display options: the page exists so the whole guide is readable and crawlable, so nothing here may hide part of it.', 'dcc-wildlife' ),
			]
		);

		$this->end_controls_section();
	}

	protected function render(): void {
		Guide_Page::render( [] );
	}
}
