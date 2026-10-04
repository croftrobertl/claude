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

	/**
	 * NEVER CACHE THIS ELEMENT (1.33.0).
	 *
	 * Elementor's Element Caching is ACTIVE on live (`elementor_element_cache_ttl`
	 * = 12). Elementor's own default for a third-party widget is already
	 * "dynamic", so this declaration changes nothing today — it is insurance,
	 * and it is here because the cost of that default changing under us is a
	 * guest served a stale page for twelve hours with no way to tell.
	 *
	 * This widget's HTML carries no date: the month is chosen in the browser,
	 * in canal time, which is the whole reason for that rule. It is still
	 * dynamic, for a reason that is easy to miss — IT EMITS THE SHARED INLINE
	 * CONFIG, ONCE PER PAGE, through Render::$config_added. Whether a given
	 * placement's HTML contains that config depends on which widget rendered
	 * first. Cache one placement's output and replay it in a different order
	 * and the config can go missing from the page entirely, leaving every
	 * Wildlife widget on it inert. The same applies to the prose guide and the
	 * JSON-LD block, which have their own once-per-page guards.
	 *
	 * Its photo URLs also come from the media library, so a photo import would
	 * not reach a cached element until the TTL expired.
	 */
	protected function is_dynamic_content(): bool {
		return true;
	}

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

	/**
	 * The handles Elementor must enqueue for this widget (1.33.0).
	 *
	 * This is the mechanism Elementor actually reads, and the reason the
	 * editor preview now matches live. Render::enqueue_assets() still calls
	 * wp_enqueue_style/script at render time — that is what keeps the assets
	 * off pages with no widget on them, which a shortcode placement also
	 * relies on — but in the editor Elementor wants to be told, and an
	 * unregistered or unrequested handle is a silent no-op there.
	 *
	 * Dependencies resolve themselves: `dcc-wildlife` pulls in
	 * `dcc-wildlife-app`, `dcc-wildlife-sheet` and `dcc-wildlife-deck`. Naming
	 * only the top of each chain keeps one source of truth in
	 * Plugin::register_assets().
	 */
	public function get_style_depends(): array {
		return [ 'dcc-wildlife' ];
	}

	public function get_script_depends(): array {
		return [ 'dcc-wildlife' ];
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

		/*
		 * There WAS a "Show season countdown" switcher here, added in 1.8.1.
		 * The countdown was retired, and Render::countdown_possible() has been
		 * hard-false since — so the switch rendered, invited a decision, and
		 * then did absolutely nothing whichever way it was set. A control that
		 * lies is worse than a missing one, so it is gone.
		 *
		 * Any `show_countdown` value already stored against a placed widget is
		 * simply ignored, which is what an unknown Elementor setting always
		 * is. Nothing needs migrating. If the countdown is ever revived, the
		 * control comes back WITH the feature, not before it.
		 */

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
				'raw'  => '<p style="margin:0">' . esc_html__( 'Everything here is set once in DCC → Wildlife. Change something below only to make THIS widget differ. "Use the setting" means follow the settings page, so leaving these alone stores nothing and this widget keeps tracking whatever you change there later.', 'dcc-wildlife' ) . '</p>',
			]
		);

		foreach ( self::override_switches() as $id => $label ) {
			$this->add_control( $id, Guide_Data::three_way( $label ) );
		}

		$this->add_control(
			'ov_view',
			[
				'label'   => __( 'Species list opens as', 'dcc-wildlife' ),
				'type'    => \Elementor\Controls_Manager::SELECT,
				'default' => '',
				'options' => [
					''        => __( 'Use the setting', 'dcc-wildlife' ),
					'deck'    => __( 'Photo cards', 'dcc-wildlife' ),
					'compact' => __( 'Short rows', 'dcc-wildlife' ),
				],
			]
		);

		$this->add_control(
			'ov_deck_rows',
			Guide_Data::number_control( __( 'Rows per page of cards, on a phone', 'dcc-wildlife' ), 'deck_rows' )
		);

		$this->end_controls_section();
	}

	/**
	 * The gates a placement may flip either way, and their labels.
	 *
	 * @return array<string,string>
	 */
	private static function override_switches(): array {
		return [
			'ov_spotlight'   => __( "This month's spotlight", 'dcc-wildlife' ),
			'ov_search'      => __( 'Search box', 'dcc-wildlife' ),
			'ov_subnav'      => __( 'Category picker', 'dcc-wildlife' ),
			'ov_compact_btn' => __( '"Compact" button', 'dcc-wildlife' ),
		];
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

				/*
				 * Per-placement overrides. '' is "use the setting", so an
				 * untouched control resolves to whatever DCC → Wildlife says —
				 * today and after the owner changes it. Resolution lives in
				 * Guide_Data, not here, so the month widget, the hub and the
				 * water widget cannot drift apart on what 'on' means.
				 */
				'spotlight'     => Guide_Data::resolve( $settings['ov_spotlight'] ?? '', 'show_spotlight' ),
				'search'        => Guide_Data::resolve( $settings['ov_search'] ?? '', 'show_search' ),
				'subnav'        => $settings['ov_subnav'] ?? null,
				'compact_btn'   => $settings['ov_compact_btn'] ?? null,
				'view_override' => $settings['ov_view'] ?? null,
				'rows_override' => $settings['ov_deck_rows'] ?? null,
			]
		);
	}
}
