<?php
/**
 * Settings → DCC Wildlife admin page (Settings API).
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Settings {

	public const OPTION = 'dcc_wl_settings';

	public static function register_hooks(): void {
		add_action( 'admin_menu', [ self::class, 'add_page' ] );
		add_action( 'admin_init', [ self::class, 'register' ] );
	}

	/**
	 * @return array<string,int>
	 */
	public static function defaults(): array {
		return [
			'sightings_enabled' => 1,
		];
	}

	/**
	 * Read one setting with defaults applied.
	 */
	public static function get( string $key ) {
		$options = get_option( self::OPTION, [] );
		if ( ! is_array( $options ) ) {
			$options = [];
		}
		$options = wp_parse_args( $options, self::defaults() );
		return $options[ $key ] ?? null;
	}

	public static function add_page(): void {
		add_options_page(
			__( 'DCC Wildlife', 'dcc-wildlife' ),
			__( 'DCC Wildlife', 'dcc-wildlife' ),
			'manage_options',
			'dcc-wildlife',
			[ self::class, 'render_page' ]
		);
	}

	public static function register(): void {
		register_setting(
			'dcc_wl',
			self::OPTION,
			[
				'type'              => 'array',
				'sanitize_callback' => [ self::class, 'sanitize' ],
				'default'           => self::defaults(),
			]
		);

		add_settings_section(
			'dcc_wl_main',
			__( 'Guest sightings', 'dcc-wildlife' ),
			'__return_empty_string',
			'dcc-wildlife'
		);

		add_settings_field(
			'sightings_enabled',
			__( 'Sightings module', 'dcc-wildlife' ),
			[ self::class, 'render_sightings_field' ],
			'dcc-wildlife',
			'dcc_wl_main'
		);
	}

	/**
	 * @param mixed $input Raw option value from the form.
	 * @return array<string,int>
	 */
	public static function sanitize( $input ): array {
		$input = is_array( $input ) ? $input : [];
		return [
			'sightings_enabled' => empty( $input['sightings_enabled'] ) ? 0 : 1,
		];
	}

	public static function render_sightings_field(): void {
		$enabled = (int) self::get( 'sightings_enabled' );
		?>
		<label for="dcc_wl_sightings_enabled">
			<input type="checkbox" id="dcc_wl_sightings_enabled"
				name="<?php echo esc_attr( self::OPTION ); ?>[sightings_enabled]"
				value="1" <?php checked( $enabled, 1 ); ?> />
			<?php esc_html_e( 'Enable the guest sightings log (button, form and “Recent sightings” list on the widget)', 'dcc-wildlife' ); ?>
		</label>
		<p class="description">
			<?php esc_html_e( 'When off, the sightings module renders nothing on the site. Already-saved sightings are kept.', 'dcc-wildlife' ); ?>
		</p>
		<?php
	}

	public static function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'dcc-wildlife' ) );
		}
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'DCC Wildlife', 'dcc-wildlife' ); ?></h1>
			<form action="options.php" method="post">
				<?php
				settings_fields( 'dcc_wl' );
				do_settings_sections( 'dcc-wildlife' );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}
}
