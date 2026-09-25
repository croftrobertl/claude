<?php
namespace FeaturesAmenities;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Site-wide defaults for the Features & Amenities widget.
 *
 * One schema drives everything: the stored defaults, the sanitiser, the admin
 * form, and the Elementor control defaults. Adding a key in one place is enough.
 *
 * Every default here reproduces the value the Elementor control carried in
 * 1.10.2, so a fresh install and an untouched widget behave exactly as before.
 */
class Settings {

	public const OPTION  = 'features_amenities_settings';
	public const GROUP   = 'features_amenities_settings_group';
	public const PAGE    = 'fa-settings';
	public const PARENT  = 'dcc';

	/** Bumped when keys are added, so stored rows can be merged forward. */
	public const SCHEMA_VERSION = 1;

	private static ?array $cache = null;

	/**
	 * key => [ type, default, label, section, desc?, choices? ]
	 *
	 * type: checkbox | text | number | color | select
	 * section: 'content' | 'appearance' | 'advanced'
	 *
	 * Defaults are the 1.10.2 Elementor control defaults, verbatim.
	 */
	public static function schema(): array {
		return [
			// ---- Content & behaviour -------------------------------------
			'default_amenity_icon' => [
				'type'    => 'text',
				'default' => 'fas fa-anchor',
				'section' => 'content',
				'label'   => __( 'Default Amenity Icon', 'features-amenities' ),
				'desc'    => __( 'FontAwesome class used when an amenity has no icon of its own. Example: fas fa-anchor', 'features-amenities' ),
			],
			'enable_search' => [
				'type'    => 'checkbox',
				'default' => '0',
				'section' => 'content',
				'label'   => __( 'Enable search bar', 'features-amenities' ),
				'desc'    => __( 'Off by default, matching 1.7.3 onwards.', 'features-amenities' ),
			],
			'search_placeholder' => [
				'type'    => 'text',
				'default' => 'Search amenities...',
				'section' => 'content',
				'label'   => __( 'Search placeholder', 'features-amenities' ),
			],
			'desktop_accordion' => [
				'type'    => 'checkbox',
				'default' => '0',
				'section' => 'content',
				'label'   => __( 'Enable desktop accordion', 'features-amenities' ),
				'desc'    => __( 'Mobile is always an accordion regardless of this setting.', 'features-amenities' ),
			],
			'exclusive_accordion' => [
				'type'    => 'checkbox',
				'default' => '0',
				'section' => 'content',
				'label'   => __( 'Close other sections when one opens', 'features-amenities' ),
			],
			'auto_fold_words' => [
				'type'    => 'number',
				'default' => 0,
				'min'     => 0,
				'max'     => 500,
				'section' => 'content',
				'label'   => __( 'Auto-fold description after N words', 'features-amenities' ),
				'desc'    => __( '0 disables folding. Above 0, longer descriptions get a Read More button.', 'features-amenities' ),
			],

			// ---- Appearance ----------------------------------------------
			'density' => [
				'type'    => 'select',
				'default' => 'cozy',
				'section' => 'appearance',
				'label'   => __( 'Density', 'features-amenities' ),
				'choices' => [
					'compact' => __( 'Compact', 'features-amenities' ),
					'cozy'    => __( 'Cozy (default)', 'features-amenities' ),
					'comfy'   => __( 'Comfy', 'features-amenities' ),
				],
			],
			'menu_layout' => [
				'type'    => 'select',
				'default' => 'list',
				'section' => 'appearance',
				'label'   => __( 'Layout', 'features-amenities' ),
				'choices' => [
					'list' => __( 'List (default)', 'features-amenities' ),
					'grid' => __( 'Grid', 'features-amenities' ),
				],
			],
			'inherit_theme' => [
				'type'    => 'checkbox',
				'default' => '1',
				'section' => 'appearance',
				'label'   => __( 'Inherit theme styles', 'features-amenities' ),
				'desc'    => __( 'Let the active theme supply colours, fonts and backgrounds. Style controls still override.', 'features-amenities' ),
			],
			'glassmorphism' => [
				'type'    => 'checkbox',
				'default' => '1',
				'section' => 'appearance',
				'label'   => __( 'Glassmorphism', 'features-amenities' ),
			],
			'primary_color' => [
				'type'    => 'color',
				'default' => '#0E9AAF',
				'section' => 'appearance',
				'label'   => __( 'Primary brand colour', 'features-amenities' ),
				'desc'    => __( 'Used for icons, the focus ring and highlight tint — non-text uses, which meet WCAG AA at 3:1.', 'features-amenities' ),
			],
			'primary_text_color' => [
				'type'    => 'color',
				'default' => '#0B7C8C',
				'section' => 'appearance',
				'label'   => __( 'Accent text colour', 'features-amenities' ),
				'desc'    => __( 'Used where the accent colour becomes readable text, such as the Read More button. Kept darker than the brand colour so it meets WCAG AA at 4.5:1 on white.', 'features-amenities' ),
			],

			// ---- Advanced -------------------------------------------------
			'header_text_align' => [
				'type'    => 'select',
				'default' => 'center',
				'section' => 'advanced',
				'label'   => __( 'Section header text alignment', 'features-amenities' ),
				'choices' => [
					'left'    => __( 'Left', 'features-amenities' ),
					'center'  => __( 'Center', 'features-amenities' ),
					'right'   => __( 'Right', 'features-amenities' ),
					'justify' => __( 'Justify', 'features-amenities' ),
				],
			],
			'amenity_text_align' => [
				'type'    => 'select',
				'default' => 'center',
				'section' => 'advanced',
				'label'   => __( 'Amenity card text alignment', 'features-amenities' ),
				'choices' => [
					'left'    => __( 'Left', 'features-amenities' ),
					'center'  => __( 'Center', 'features-amenities' ),
					'right'   => __( 'Right', 'features-amenities' ),
					'justify' => __( 'Justify', 'features-amenities' ),
				],
			],
			'header_hover' => [
				'type'    => 'select',
				'default' => 'lift',
				'section' => 'advanced',
				'label'   => __( 'Section header hover effect', 'features-amenities' ),
				'choices' => [
					'lift' => __( 'Lift up (default)', 'features-amenities' ),
					'none' => __( 'None', 'features-amenities' ),
				],
			],
			'amenity_hover' => [
				'type'    => 'select',
				'default' => 'scale',
				'section' => 'advanced',
				'label'   => __( 'Amenity card hover effect', 'features-amenities' ),
				'choices' => [
					'scale' => __( 'Scale up (default)', 'features-amenities' ),
					'none'  => __( 'None', 'features-amenities' ),
				],
			],
			'header_icon_edge_gap' => [
				'type'    => 'number',
				'default' => 5,
				'min'     => 0,
				'max'     => 60,
				'section' => 'advanced',
				'label'   => __( 'Section icon edge spacing (px)', 'features-amenities' ),
			],
			'header_arrow_edge_gap' => [
				'type'    => 'number',
				'default' => 5,
				'min'     => 0,
				'max'     => 60,
				'section' => 'advanced',
				'label'   => __( 'Accordion arrow edge spacing (px)', 'features-amenities' ),
			],
			'amenity_grid_min_col' => [
				'type'    => 'number',
				'default' => 200,
				'min'     => 100,
				'max'     => 600,
				'section' => 'advanced',
				'label'   => __( 'Grid minimum column width (px)', 'features-amenities' ),
				'desc'    => __( 'Only applies when Layout is set to Grid.', 'features-amenities' ),
			],
		];
	}

	public static function defaults(): array {
		$out = [];
		foreach ( self::schema() as $key => $field ) {
			$out[ $key ] = $field['default'];
		}
		return $out;
	}

	/**
	 * Merge stored values over defaults. Keys added by a later version appear
	 * with their default rather than going missing — the trap that made Seasons
	 * 4.0.0 look switched off after upgrade.
	 */
	public static function merge_defaults( $stored ): array {
		$defaults = self::defaults();
		if ( ! is_array( $stored ) ) {
			return $defaults;
		}
		// array_merge, not + , so stored scalars win but unknown keys are dropped.
		$merged = $defaults;
		foreach ( $defaults as $key => $default ) {
			if ( array_key_exists( $key, $stored ) ) {
				$merged[ $key ] = $stored[ $key ];
			}
		}
		return $merged;
	}

	public static function all(): array {
		if ( null === self::$cache ) {
			self::$cache = self::merge_defaults( get_option( self::OPTION, [] ) );
		}
		return self::$cache;
	}

	/** Read one setting, falling back to its schema default. */
	public static function get( string $key ) {
		$all = self::all();
		return $all[ $key ] ?? ( self::defaults()[ $key ] ?? null );
	}

	/** Truthiness for checkbox-backed settings, as Elementor's 'yes'/'' pair. */
	public static function yes( string $key ): string {
		return self::get( $key ) ? 'yes' : '';
	}

	public static function flush_cache(): void {
		self::$cache = null;
	}

	/**
	 * Sanitise a submitted settings array.
	 *
	 * Checkboxes are resolved from presence, NOT from the default — an absent
	 * checkbox means the user unticked it and must store '0'. Rebuilding from
	 * defaults and copying only POSTed keys would silently re-tick every
	 * checkbox whose default is on (the Contact Form trap).
	 */
	public static function sanitize( $input ): array {
		$schema = self::schema();
		$clean  = [];

		if ( ! is_array( $input ) ) {
			$input = [];
		}

		foreach ( $schema as $key => $field ) {
			$raw = $input[ $key ] ?? null;

			switch ( $field['type'] ) {
				case 'checkbox':
					// Presence decides. Absent === unticked === '0'.
					$clean[ $key ] = ( null !== $raw && '' !== $raw && '0' !== $raw ) ? '1' : '0';
					break;

				case 'number':
					if ( null === $raw || '' === $raw || ! is_numeric( $raw ) ) {
						$clean[ $key ] = $field['default'];
						break;
					}
					$n = (int) $raw;
					if ( isset( $field['min'] ) && $n < $field['min'] ) {
						$n = $field['default'];
					}
					if ( isset( $field['max'] ) && $n > $field['max'] ) {
						$n = $field['default'];
					}
					$clean[ $key ] = $n;
					break;

				case 'color':
					$hex = is_string( $raw ) ? sanitize_hex_color( $raw ) : null;
					$clean[ $key ] = $hex ? $hex : $field['default'];
					break;

				case 'select':
					$choices       = isset( $field['choices'] ) ? array_keys( $field['choices'] ) : [];
					$clean[ $key ] = ( is_string( $raw ) && in_array( $raw, $choices, true ) )
						? $raw
						: $field['default'];
					break;

				case 'text':
				default:
					$clean[ $key ] = is_string( $raw ) ? sanitize_text_field( $raw ) : $field['default'];
					break;
			}
		}

		$clean['_schema_version'] = self::SCHEMA_VERSION;
		return $clean;
	}

	// -----------------------------------------------------------------
	// WordPress wiring
	// -----------------------------------------------------------------

	public function boot(): void {
		add_action( 'admin_menu', [ $this, 'register_page' ], 35 );
		add_action( 'admin_init', [ $this, 'register_option' ] );
		add_action( 'admin_init', [ $this, 'maybe_upgrade' ] );
	}

	/**
	 * Submenu only. The `dcc` parent is owned by the site-side dcc-menu
	 * mu-plugin, which registers it at priority 5 and removes WordPress's
	 * mirrored duplicate at 999. Registering a parent here is what created the
	 * duplicate-parent mess in the first place — so we never do.
	 *
	 * Priority 35 is assigned to this plugin (20 contact-form, 30 guest-guide,
	 * 40 seasons, 45 cottage-selector, 50 custom-checkout, 55 calendar,
	 * 63 wildlife; 10 and 60 reserved for mu-plugins).
	 */
	public function register_page(): void {
		add_submenu_page(
			self::PARENT,
			__( 'Features & Amenities', 'features-amenities' ),
			__( 'Features & Amenities', 'features-amenities' ),
			'manage_options',
			self::PAGE,
			[ $this, 'render_page' ]
		);
	}

	public function register_option(): void {
		register_setting(
			self::GROUP,
			self::OPTION,
			[
				'type'              => 'array',
				'sanitize_callback' => [ $this, 'sanitize_callback' ],
				'default'           => self::defaults(),
			]
		);
	}

	/**
	 * Capability is re-checked here as well as on render. options.php already
	 * verifies the nonce and the option-group capability; this is defence in
	 * depth, not a substitute.
	 */
	public function sanitize_callback( $input ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return self::merge_defaults( get_option( self::OPTION, [] ) );
		}
		self::flush_cache();
		return self::sanitize( $input );
	}

	/** Merge newly added schema keys into an already-stored row. */
	public function maybe_upgrade(): void {
		$stored = get_option( self::OPTION, null );
		if ( ! is_array( $stored ) ) {
			return; // Nothing stored yet; defaults apply as-is.
		}
		$version = isset( $stored['_schema_version'] ) ? (int) $stored['_schema_version'] : 0;
		if ( $version >= self::SCHEMA_VERSION ) {
			return;
		}
		$merged                    = self::merge_defaults( $stored );
		$merged['_schema_version'] = self::SCHEMA_VERSION;
		update_option( self::OPTION, $merged );
		self::flush_cache();
	}

	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'features-amenities' ) );
		}

		$values = self::all();
		$schema = self::schema();
		?>
		<div class="wrap">
			<h1><?php echo esc_html__( 'Features &amp; Amenities', 'features-amenities' ); ?></h1>
			<p><?php echo esc_html__( 'Site-wide defaults for the Features & Amenities Elementor widget. Each widget can still override any of these individually in Elementor; changing a value here only affects widgets that have not overridden it.', 'features-amenities' ); ?></p>

			<form method="post" action="options.php">
				<?php settings_fields( self::GROUP ); ?>

				<h2><?php echo esc_html__( 'Content &amp; behaviour', 'features-amenities' ); ?></h2>
				<table class="form-table" role="presentation">
					<?php $this->render_rows( $schema, $values, 'content' ); ?>
				</table>

				<h2><?php echo esc_html__( 'Appearance', 'features-amenities' ); ?></h2>
				<table class="form-table" role="presentation">
					<?php $this->render_rows( $schema, $values, 'appearance' ); ?>
				</table>

				<details style="margin-top:1.5em;">
					<summary style="cursor:pointer;font-size:1.3em;font-weight:600;padding:.4em 0;">
						<?php echo esc_html__( 'Advanced', 'features-amenities' ); ?>
					</summary>
					<table class="form-table" role="presentation">
						<?php $this->render_rows( $schema, $values, 'advanced' ); ?>
					</table>
				</details>

				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}

	private function render_rows( array $schema, array $values, string $section ): void {
		foreach ( $schema as $key => $field ) {
			if ( ( $field['section'] ?? '' ) !== $section ) {
				continue;
			}
			$id    = 'fa-' . $key;
			$name  = self::OPTION . '[' . $key . ']';
			$value = $values[ $key ] ?? $field['default'];
			?>
			<tr>
				<th scope="row">
					<label for="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $field['label'] ); ?></label>
				</th>
				<td>
					<?php
					switch ( $field['type'] ) {
						case 'checkbox':
							?>
							<input type="checkbox" id="<?php echo esc_attr( $id ); ?>"
								name="<?php echo esc_attr( $name ); ?>" value="1"
								<?php checked( '1', (string) $value ); ?> />
							<?php
							break;

						case 'number':
							?>
							<input type="number" id="<?php echo esc_attr( $id ); ?>"
								name="<?php echo esc_attr( $name ); ?>"
								value="<?php echo esc_attr( (string) $value ); ?>"
								min="<?php echo esc_attr( (string) ( $field['min'] ?? 0 ) ); ?>"
								max="<?php echo esc_attr( (string) ( $field['max'] ?? 9999 ) ); ?>"
								class="small-text" />
							<?php
							break;

						case 'color':
							?>
							<input type="color" id="<?php echo esc_attr( $id ); ?>"
								name="<?php echo esc_attr( $name ); ?>"
								value="<?php echo esc_attr( (string) $value ); ?>" />
							<code><?php echo esc_html( (string) $value ); ?></code>
							<?php
							break;

						case 'select':
							?>
							<select id="<?php echo esc_attr( $id ); ?>" name="<?php echo esc_attr( $name ); ?>">
								<?php foreach ( ( $field['choices'] ?? [] ) as $ck => $cl ) : ?>
									<option value="<?php echo esc_attr( $ck ); ?>" <?php selected( $ck, $value ); ?>>
										<?php echo esc_html( $cl ); ?>
									</option>
								<?php endforeach; ?>
							</select>
							<?php
							break;

						case 'text':
						default:
							?>
							<input type="text" id="<?php echo esc_attr( $id ); ?>"
								name="<?php echo esc_attr( $name ); ?>"
								value="<?php echo esc_attr( (string) $value ); ?>"
								class="regular-text" />
							<?php
							break;
					}
					?>
					<?php if ( ! empty( $field['desc'] ) ) : ?>
						<p class="description"><?php echo esc_html( $field['desc'] ); ?></p>
					<?php endif; ?>
				</td>
			</tr>
			<?php
		}
	}
}
