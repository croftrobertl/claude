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

	private function __construct() {
		add_action( 'init', [ $this, 'load_textdomain' ] );
		add_action( 'init', [ $this, 'register_shortcode' ] );
		add_action( 'wp_enqueue_scripts', [ $this, 'register_assets' ] );

		// Elementor (free). The widget file only loads when Elementor is active.
		add_action( 'elementor/widgets/register', [ $this, 'register_widget' ] );
		add_action( 'elementor/elements/categories_registered', [ $this, 'register_category' ] );
	}

	public function load_textdomain(): void {
		load_plugin_textdomain( 'dcc-wildlife', false, dirname( plugin_basename( DCC_WL_FILE ) ) . '/languages' );
	}

	public function register_shortcode(): void {
		add_shortcode( 'dcc_wildlife', [ Render::class, 'shortcode' ] );
	}

	/**
	 * Register (not enqueue) the two assets. Render::render() enqueues them
	 * only when the widget/shortcode is actually on the page.
	 */
	public function register_assets(): void {
		wp_register_style(
			'dcc-wildlife',
			DCC_WL_URL . 'assets/css/widget.css',
			[],
			DCC_WL_VERSION
		);
		wp_register_script(
			'dcc-wildlife',
			DCC_WL_URL . 'assets/js/widget.js',
			[],
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
		$widgets_manager->register( new Widget() );
	}
}
