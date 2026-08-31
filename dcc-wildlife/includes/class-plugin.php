<?php
/**
 * Singleton orchestrator: registers all WordPress hooks.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Plugin {

	private static ?Plugin $instance = null;

	public static function instance(): Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/** Stored-version option driving one-time upgrade routines. */
	public const VERSION_OPTION = 'dcc_wl_version';

	private function __construct() {
		add_action( 'init', [ $this, 'load_textdomain' ] );
		add_action( 'init', [ $this, 'register_shortcode' ] );
		add_action( 'init', [ $this, 'maybe_upgrade' ], 5 );
		add_action( 'wp_enqueue_scripts', [ $this, 'register_assets' ] );

		Water_Rest::register_hooks();
		if ( is_admin() ) {
			Water_Admin::register_hooks();
		}

		// Elementor (free). The widget file only loads when Elementor is active.
		add_action( 'elementor/widgets/register', [ $this, 'register_widget' ] );
		add_action( 'elementor/elements/categories_registered', [ $this, 'register_category' ] );
	}

	public function load_textdomain(): void {
		load_plugin_textdomain( 'dcc-wildlife', false, dirname( plugin_basename( DCC_WL_FILE ) ) . '/languages' );
	}

	public function register_shortcode(): void {
		add_shortcode( 'dcc_wildlife', [ Render::class, 'shortcode' ] );
		add_shortcode( 'dcc_water', [ Water_Render::class, 'shortcode' ] );

		// Season countdown, standalone (1.8.0, absorbed from the mu-plugin).
		// While dcc-wildlife-countdown.php still exists it registered this tag
		// at load time and owns the rendering — never fight it for the tag, so
		// the handover is safe whichever file wins an update race.
		if ( ! shortcode_exists( 'dcc_wildlife_countdown' ) ) {
			add_shortcode( 'dcc_wildlife_countdown', [ Render::class, 'countdown_shortcode' ] );
		}
	}

	/**
	 * Run one-time upgrade routines when the stored version changes — the
	 * armour against the settings-merge class of bug (1.8.0, finding 1):
	 * wp_parse_args() cannot push new seeded values into an array-typed
	 * setting a site already stored, so any such change MUST ship with a
	 * migration step in Water_Data::upgrade().
	 */
	public function maybe_upgrade(): void {
		if ( DCC_WL_VERSION === get_option( self::VERSION_OPTION ) ) {
			return;
		}
		Water_Data::upgrade();
		update_option( self::VERSION_OPTION, DCC_WL_VERSION, false );
	}

	/**
	 * Register (not enqueue) the two assets. Render::render() enqueues them
	 * only when the widget/shortcode is actually on the page.
	 */
	public function register_assets(): void {
		// The app layer (1.9.0): tokens + shared primitives + the sliding
		// sheet. Declared as DEPENDENCIES of the two widget bundles rather
		// than enqueued separately, so WordPress loads them exactly once and
		// only on pages that actually place a widget.
		wp_register_style(
			'dcc-wildlife-app',
			DCC_WL_URL . 'assets/css/app.css',
			[],
			DCC_WL_VERSION
		);
		wp_register_script(
			'dcc-wildlife-sheet',
			DCC_WL_URL . 'assets/js/sheet.js',
			[],
			DCC_WL_VERSION,
			true
		);

		wp_register_style(
			'dcc-wildlife',
			DCC_WL_URL . 'assets/css/widget.css',
			[ 'dcc-wildlife-app' ],
			DCC_WL_VERSION
		);
		wp_register_script(
			'dcc-wildlife',
			DCC_WL_URL . 'assets/js/widget.js',
			[ 'dcc-wildlife-sheet' ],
			DCC_WL_VERSION,
			true
		);

		// Water module. Registered only; Water_Render enqueues at render
		// time so nothing loads on pages without the widget/shortcode.
		wp_register_style(
			'dcc-wildlife-water',
			DCC_WL_URL . 'assets/css/water.css',
			[ 'dcc-wildlife-app' ],
			DCC_WL_VERSION
		);
		wp_register_script(
			'dcc-wildlife-water',
			DCC_WL_URL . 'assets/js/water.js',
			[ 'dcc-wildlife-sheet' ],
			DCC_WL_VERSION,
			true
		);
	}

	/**
	 * Site convention: all DCC-built widgets share the "Dora Canal Court"
	 * Elementor category (slug `dcc-widgets`). Registered idempotently so
	 * it is safe regardless of which DCC plugin activates first.
	 *
	 * @param \Elementor\Elements_Manager $elements_manager Elementor elements manager.
	 */
	public function register_category( $elements_manager ): void {
		$categories = $elements_manager->get_categories();
		if ( ! isset( $categories['dcc-widgets'] ) ) {
			$elements_manager->add_category(
				'dcc-widgets',
				[
					'title' => __( 'Dora Canal Court', 'dcc-wildlife' ),
					'icon'  => 'fa fa-plug',
				]
			);
		}
	}

	/**
	 * @param \Elementor\Widgets_Manager $widgets_manager Elementor widgets manager.
	 */
	public function register_widget( $widgets_manager ): void {
		require_once DCC_WL_DIR . 'includes/class-widget.php';
		require_once DCC_WL_DIR . 'includes/class-water-widget.php';
		require_once DCC_WL_DIR . 'includes/class-countdown-widget.php';
		$widgets_manager->register( new Widget() );
		$widgets_manager->register( new Water_Widget() );
		$widgets_manager->register( new Countdown_Widget() );
	}
}
