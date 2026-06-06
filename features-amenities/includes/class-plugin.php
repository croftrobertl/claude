<?php
namespace FeaturesAmenities;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Plugin {
	private static ?Plugin $instance = null;

	public static function instance(): self {
		return self::$instance ??= new self();
	}

	private function __construct() {}

	public function boot(): void {
		add_action( 'init', [ $this, 'load_textdomain' ] );
		add_action( 'elementor/elements/categories_registered', [ $this, 'register_category' ] );
		add_action( 'elementor/widgets/register', [ $this, 'register_widget' ] );
		add_action( 'wp_enqueue_scripts', [ $this, 'register_assets' ] );
		add_action( 'elementor/editor/after_enqueue_scripts', [ $this, 'register_assets' ] );
	}

	public function load_textdomain(): void {
		load_plugin_textdomain( 'features-amenities', false, dirname( plugin_basename( FA_FILE ) ) . '/languages' );
	}

	public function register_category( $elements_manager ): void {
		$elements_manager->add_category(
			'claude-code',
			[
				'title' => __( 'Claude Code', 'features-amenities' ),
				'icon'  => 'fa fa-plug',
			]
		);
	}

	public function register_widget( $widgets_manager ): void {
		$widgets_manager->register( new Widget() );
	}

	public function register_assets(): void {
		wp_register_style(
			'features-amenities',
			FA_URL . 'assets/css/widget.css',
			[],
			FA_VERSION
		);
		wp_register_script(
			'features-amenities',
			FA_URL . 'assets/js/widget.js',
			[ 'elementor-frontend' ],
			FA_VERSION,
			true
		);
	}
}
