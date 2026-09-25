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

		// Keep the chain map's payload warm on a schedule, so the cost of
		// assembling it lands on cron rather than on the first guest to tap
		// the button. Scheduled lazily: no activation hook has ever existed
		// for this plugin, and adding one would miss every site already
		// running it.
		add_action( self::WARM_HOOK, [ Water_Live::class, 'warm_map' ] );
		add_action( 'init', [ $this, 'maybe_schedule_warm' ], 20 );

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
		add_shortcode( 'dcc_canal', [ Canal_Render::class, 'shortcode' ] );

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
	/** The cron hook that warms the map payload. Mirrors Water_Live::WARM_HOOK. */
	public const WARM_HOOK = 'dcc_wl_warm_map';

	/**
	 * Schedule the warmer once, and only while the map is actually enabled.
	 * Switching the map off removes the event rather than leaving a job that
	 * wakes up hourly to do nothing.
	 */
	public function maybe_schedule_warm(): void {
		$wanted = Water_Data::map_possible();
		$booked = wp_next_scheduled( self::WARM_HOOK );

		if ( $wanted && ! $booked ) {
			wp_schedule_event( time() + 300, 'hourly', self::WARM_HOOK );
			return;
		}
		if ( ! $wanted && $booked ) {
			wp_clear_scheduled_hook( self::WARM_HOOK );
		}
	}

	/** Called from the deactivation hook: never leave a scheduled job behind. */
	public static function on_deactivate(): void {
		wp_clear_scheduled_hook( self::WARM_HOOK );
	}

	/**
	 * Run once per version change, on init at priority 5.
	 *
	 * The guard compares with version_compare rather than string equality now.
	 * Equality also fired on a DOWNGRADE, re-running every step against an
	 * older codebase, which is the one direction a migration has no business
	 * running in.
	 */
	public function maybe_upgrade(): void {
		$from = (string) get_option( self::VERSION_OPTION, '' );
		if ( DCC_WL_VERSION === $from ) {
			return;
		}

		// Moving BACKWARDS: record where we are and run nothing. A step written
		// for a later version cannot be assumed safe against earlier code.
		if ( '' !== $from && version_compare( $from, DCC_WL_VERSION, '>' ) ) {
			update_option( self::VERSION_OPTION, DCC_WL_VERSION, false );
			return;
		}

		Water_Data::upgrade();

		// 1.31.0: `dcc_wl_settings` belonged to the guest sightings log, which
		// was removed in 1.2.0. Nothing has written it in eleven releases, but
		// it is autoloaded on every request of every site that ever ran 1.1.0.
		if ( '' === $from || version_compare( $from, '1.31.0', '<' ) ) {
			delete_option( 'dcc_wl_settings' );
		}

		// Make the stored row describe what the site actually does.
		Water_Data::persist_merged();

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
		// The tile deck (1.23.0): one implementation, used by the species
		// tiles and the water cards, so the two cannot drift apart.
		wp_register_script(
			'dcc-wildlife-deck',
			DCC_WL_URL . 'assets/js/deck.js',
			[],
			DCC_WL_VERSION,
			true
		);
		wp_register_script(
			'dcc-wildlife',
			DCC_WL_URL . 'assets/js/widget.js',
			[ 'dcc-wildlife-sheet', 'dcc-wildlife-deck' ],
			DCC_WL_VERSION,
			true
		);

		// The Canal hub (1.10.0). Its stylesheet builds on the app layer and
		// its script drives the existing widget rather than replacing it, so
		// both are dependencies rather than copies.
		wp_register_style(
			'dcc-wildlife-canal',
			DCC_WL_URL . 'assets/css/canal.css',
			[ 'dcc-wildlife' ],
			DCC_WL_VERSION
		);
		wp_register_script(
			'dcc-wildlife-canal',
			DCC_WL_URL . 'assets/js/canal.js',
			[ 'dcc-wildlife' ],
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
			[ 'dcc-wildlife-sheet', 'dcc-wildlife-deck' ],
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
		require_once DCC_WL_DIR . 'includes/class-canal-widget.php';
		$widgets_manager->register( new Widget() );
		$widgets_manager->register( new Water_Widget() );
		$widgets_manager->register( new Countdown_Widget() );
		$widgets_manager->register( new Canal_Widget() );
	}
}
