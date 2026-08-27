<?php
/**
 * Water module — Settings → DCC Water.
 *
 * MENU SLUG: `dcc-wildlife-water`, deliberately NOT `dcc-wildlife`.
 * A site mu-plugin (dcc-wildlife-countdown.php) already registers a
 * "DCC → Wildlife" submenu at slug `dcc-wildlife`. Taking that slug would
 * make one of the two pages silently disappear, so this page lives under
 * Settings with its own slug and does not touch the mu-plugin's menu. If
 * the countdown is ever folded into this plugin, both can be merged then.
 *
 * The save handler is where the owner's rule becomes visible: every almanac
 * row missing a tier, a source name or a valid date is DROPPED on save, and
 * the screen reports exactly which rows went and what they lacked. Silent
 * rejection would be its own kind of dishonesty.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Water_Admin {

	public const SLUG   = 'dcc-wildlife-water';
	private const NOTICE = 'dcc_wl_water_notice';

	public static function register_hooks(): void {
		add_action( 'admin_menu', [ self::class, 'add_page' ] );
		add_action( 'admin_init', [ self::class, 'register' ] );
		add_action( 'admin_notices', [ self::class, 'notices' ] );
		add_action( 'admin_enqueue_scripts', [ self::class, 'assets' ] );
	}

	public static function add_page(): void {
		add_options_page(
			__( 'DCC Water', 'dcc-wildlife' ),
			__( 'DCC Water', 'dcc-wildlife' ),
			'manage_options',
			self::SLUG,
			[ self::class, 'render_page' ]
		);
	}

	public static function register(): void {
		register_setting(
			'dcc_wl_water',
			Water_Data::OPTION,
			[
				'type'              => 'array',
				'sanitize_callback' => [ self::class, 'sanitize' ],
				'default'           => Water_Data::defaults(),
			]
		);
	}

	public static function assets( string $hook ): void {
		if ( 'settings_page_' . self::SLUG !== $hook ) {
			return;
		}
		wp_enqueue_script(
			'dcc-wildlife-water-admin',
			DCC_WL_URL . 'assets/js/admin-water.js',
			[],
			DCC_WL_VERSION,
			true
		);
		wp_add_inline_script(
			'dcc-wildlife-water-admin',
			'window.DCC_WL_WATER_ADMIN = ' . wp_json_encode(
				[
					'discover' => esc_url_raw( rest_url( Water_Rest::NS . '/discover-gauges' ) ),
					'nonce'    => wp_create_nonce( 'wp_rest' ),
					'i18n'     => [
						'searching' => __( 'Asking USGS…', 'dcc-wildlife' ),
						'none'      => __( 'No active gauges returned for that area. Check the coordinates, or add site IDs by hand.', 'dcc-wildlife' ),
						'failed'    => __( 'Could not reach USGS. Nothing was changed.', 'dcc-wildlife' ),
						'add'       => __( 'Use this gauge', 'dcc-wildlife' ),
						'noCoords'  => __( 'Enter and save the property latitude and longitude first.', 'dcc-wildlife' ),
					],
				]
			) . ';',
			'before'
		);
	}

	/**
	 * @param mixed $input
	 * @return array<string,mixed>
	 */
	public static function sanitize( $input ): array {
		$input = is_array( $input ) ? $input : [];
		$out   = Water_Data::defaults();

		$out['live_enabled'] = empty( $input['live_enabled'] ) ? 0 : 1;

		foreach ( [ 'lat', 'lon' ] as $k ) {
			$v          = trim( (string) ( $input[ $k ] ?? '' ) );
			$out[ $k ]  = is_numeric( $v ) ? $v : '';
		}

		// Site IDs: newline/comma separated, digits only.
		$raw_sites = (string) ( $input['usgs_sites_raw'] ?? '' );
		$sites     = preg_split( '/[\s,]+/', $raw_sites ) ?: [];
		$clean     = [];
		foreach ( $sites as $s ) {
			$s = preg_replace( '/\D/', '', (string) $s );
			if ( is_string( $s ) && preg_match( '/^\d{8,15}$/', $s ) ) {
				$clean[] = $s;
			}
		}
		$out['usgs_sites'] = array_values( array_unique( $clean ) );

		$out['dock_notes'] = wp_kses_post( trim( (string) ( $input['dock_notes'] ?? '' ) ) );
		$dock_updated      = trim( (string) ( $input['dock_updated'] ?? '' ) );
		$out['dock_updated'] = preg_match( '/^\d{4}-\d{2}-\d{2}$/', $dock_updated ) ? $dock_updated : '';

		// --- Almanac: the gate ------------------------------------------
		$rows     = is_array( $input['almanac'] ?? null ) ? array_values( $input['almanac'] ) : [];
		$rows     = array_filter( $rows, static fn( $r ): bool => is_array( $r ) && '' !== trim( implode( '', array_map( 'strval', $r ) ) ) );
		$kept     = [];
		$rejected = [];

		foreach ( $rows as $row ) {
			$candidate = [
				'waterbody'   => sanitize_text_field( (string) ( $row['waterbody'] ?? '' ) ),
				'label'       => sanitize_text_field( (string) ( $row['label'] ?? '' ) ),
				'value'       => sanitize_text_field( (string) ( $row['value'] ?? '' ) ),
				'tier'        => sanitize_key( (string) ( $row['tier'] ?? '' ) ),
				'source_name' => sanitize_text_field( (string) ( $row['source_name'] ?? '' ) ),
				'source_url'  => esc_url_raw( trim( (string) ( $row['source_url'] ?? '' ) ) ),
				'date'        => sanitize_text_field( (string) ( $row['date'] ?? '' ) ),
				'note'        => sanitize_text_field( (string) ( $row['note'] ?? '' ) ),
			];

			if ( Water_Fact::make( $candidate ) instanceof Water_Fact ) {
				$kept[] = $candidate;
				continue;
			}
			$reasons    = Water_Fact::rejection_reasons( [ $candidate ] );
			$rejected[] = sprintf(
				/* translators: 1: the field label the owner typed, 2: list of what was missing. */
				__( '"%1$s" — missing %2$s', 'dcc-wildlife' ),
				'' !== $candidate['label'] ? $candidate['label'] : __( '(unnamed row)', 'dcc-wildlife' ),
				$reasons[0] ?? __( 'required attribution', 'dcc-wildlife' )
			);
		}

		$out['almanac'] = $kept;
		if ( $rejected ) {
			set_transient( self::NOTICE, $rejected, 60 );
		}

		$out['links']   = self::sanitize_links( $input['links'] ?? [] );
		$out['reports'] = self::sanitize_links( $input['reports'] ?? [] );

		Water_Live::flush(); // Settings changed — do not serve the old cache.

		return $out;
	}

	/**
	 * @param mixed $rows
	 * @return array<int,array<string,string>>
	 */
	private static function sanitize_links( $rows ): array {
		$rows = is_array( $rows ) ? array_values( $rows ) : [];
		$out  = [];
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$label = sanitize_text_field( (string) ( $row['label'] ?? '' ) );
			$url   = esc_url_raw( trim( (string) ( $row['url'] ?? '' ) ) );
			if ( '' === $label || '' === $url ) {
				continue;
			}
			$out[] = [
				'label' => $label,
				'url'   => $url,
			];
		}
		return $out;
	}

	public static function notices(): void {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || 'settings_page_' . self::SLUG !== $screen->id ) {
			return;
		}
		$rejected = get_transient( self::NOTICE );
		if ( ! is_array( $rejected ) || ! $rejected ) {
			return;
		}
		delete_transient( self::NOTICE );
		?>
		<div class="notice notice-warning">
			<p><strong><?php esc_html_e( 'Some almanac rows were not saved, because a guest page may not show a fact without a source.', 'dcc-wildlife' ); ?></strong></p>
			<ul style="list-style:disc;margin-left:20px">
				<?php foreach ( $rejected as $line ) : ?>
					<li><?php echo esc_html( $line ); ?></li>
				<?php endforeach; ?>
			</ul>
			<p><?php esc_html_e( 'Add the missing pieces and save again, or leave the row out — an omitted line is better than an unsourced one.', 'dcc-wildlife' ); ?></p>
		</div>
		<?php
	}

	public static function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access this page.', 'dcc-wildlife' ) );
		}
		$o    = Water_Data::all();
		$name = Water_Data::OPTION;
		?>
		<div class="wrap dccwl-water-admin">
			<h1><?php esc_html_e( 'DCC Water — fishing & conditions', 'dcc-wildlife' ); ?></h1>

			<div class="notice notice-info inline" style="margin:12px 0;padding:8px 12px">
				<p style="margin:.4em 0">
					<strong><?php esc_html_e( 'The rule this page enforces:', 'dcc-wildlife' ); ?></strong>
					<?php esc_html_e( 'nothing reaches the guest page without a source and a date. Rows missing either are dropped on save and listed back to you. An omitted line is always better than a wrong one.', 'dcc-wildlife' ); ?>
				</p>
				<p style="margin:.4em 0">
					<?php esc_html_e( 'Place the module with the "DCC Water — Fishing & Conditions" Elementor widget, or the [dcc_water] shortcode. It renders nowhere until you place it.', 'dcc-wildlife' ); ?>
				</p>
			</div>

			<form action="options.php" method="post">
				<?php settings_fields( 'dcc_wl_water' ); ?>

				<h2><?php esc_html_e( 'Live conditions (optional)', 'dcc-wildlife' ); ?></h2>
				<p class="description" style="max-width:46em">
					<?php esc_html_e( 'Off by default. When on, the site fetches public USGS gauge readings and the National Weather Service forecast server-side (no API keys, no accounts). Every reading is shown with its own source and measurement time. If a source is unreachable, the strip is simply absent — guests never see an error.', 'dcc-wildlife' ); ?>
				</p>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Live layer', 'dcc-wildlife' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[live_enabled]" value="1" <?php checked( (int) $o['live_enabled'], 1 ); ?> />
								<?php esc_html_e( 'Fetch live gauge and weather data', 'dcc-wildlife' ); ?>
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-lat"><?php esc_html_e( 'Property latitude', 'dcc-wildlife' ); ?></label></th>
						<td>
							<input type="text" id="dccwl-lat" class="regular-text" name="<?php echo esc_attr( $name ); ?>[lat]" value="<?php echo esc_attr( (string) $o['lat'] ); ?>" placeholder="28.8..." />
							<p class="description"><?php esc_html_e( 'Used for the weather forecast and to find nearby gauges. Nothing is guessed — leave blank and the forecast is omitted.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-lon"><?php esc_html_e( 'Property longitude', 'dcc-wildlife' ); ?></label></th>
						<td><input type="text" id="dccwl-lon" class="regular-text" name="<?php echo esc_attr( $name ); ?>[lon]" value="<?php echo esc_attr( (string) $o['lon'] ); ?>" placeholder="-81.7..." /></td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-sites"><?php esc_html_e( 'USGS site IDs', 'dcc-wildlife' ); ?></label></th>
						<td>
							<textarea id="dccwl-sites" class="large-text code" rows="3" name="<?php echo esc_attr( $name ); ?>[usgs_sites_raw]"><?php echo esc_textarea( implode( "\n", (array) $o['usgs_sites'] ) ); ?></textarea>
							<p class="description"><?php esc_html_e( 'One numeric site ID per line. Do not type these from memory — use the button below to ask USGS which gauges are actually near you, then pick from real results.', 'dcc-wildlife' ); ?></p>
							<p>
								<button type="button" class="button" id="dccwl-discover"><?php esc_html_e( 'Find nearby USGS gauges', 'dcc-wildlife' ); ?></button>
								<span id="dccwl-discover-status" style="margin-left:8px"></span>
							</p>
							<div id="dccwl-discover-results"></div>
						</td>
					</tr>
				</table>

				<h2><?php esc_html_e( 'From the dock', 'dcc-wildlife' ); ?></h2>
				<p class="description" style="max-width:46em">
					<?php esc_html_e( 'Your own first-hand knowledge — where guests actually catch things off this property, what the canal does after heavy rain, when the specks show up. This is the one section no national source can provide, and it renders visibly marked as your observation rather than published data.', 'dcc-wildlife' ); ?>
				</p>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="dccwl-dock"><?php esc_html_e( 'Notes', 'dcc-wildlife' ); ?></label></th>
						<td><textarea id="dccwl-dock" class="large-text" rows="7" name="<?php echo esc_attr( $name ); ?>[dock_notes]"><?php echo esc_textarea( (string) $o['dock_notes'] ); ?></textarea></td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-dock-date"><?php esc_html_e( 'Last updated', 'dcc-wildlife' ); ?></label></th>
						<td><input type="date" id="dccwl-dock-date" name="<?php echo esc_attr( $name ); ?>[dock_updated]" value="<?php echo esc_attr( (string) $o['dock_updated'] ); ?>" /></td>
					</tr>
				</table>

				<h2><?php esc_html_e( 'Almanac facts', 'dcc-wildlife' ); ?></h2>
				<p class="description" style="max-width:46em">
					<?php esc_html_e( 'Depths, clarity readings, species notes, ramps, seasons. Every row needs a confidence tier, a source name and a date, or it will not save. This table ships empty on purpose: nothing was pre-filled because none of it could be verified against USGS, FWC or the Water Atlas at build time.', 'dcc-wildlife' ); ?>
				</p>
				<?php self::render_almanac_table( $name, (array) $o['almanac'] ); ?>

				<h2><?php esc_html_e( 'Official information links', 'dcc-wildlife' ); ?></h2>
				<?php self::render_link_table( $name, 'links', (array) $o['links'] ); ?>

				<h2><?php esc_html_e( 'Local reports & charters', 'dcc-wildlife' ); ?></h2>
				<p class="description" style="max-width:46em">
					<?php esc_html_e( 'Outbound links only. Their content is copyrighted and their reports describe one person\'s afternoon, so nothing from them is ever copied onto your page as fact — but linking the ones you trust is genuinely useful to guests.', 'dcc-wildlife' ); ?>
				</p>
				<?php self::render_link_table( $name, 'reports', (array) $o['reports'] ); ?>

				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}

	/**
	 * @param array<int,array<string,string>> $rows
	 */
	private static function render_almanac_table( string $name, array $rows ): void {
		$rows[] = [];  // one blank row to type into
		$tiers  = [
			Water_Fact::TIER_LIVE      => __( 'live — measured now by a gauge/API', 'dcc-wildlife' ),
			Water_Fact::TIER_PUBLISHED => __( 'published — official dataset', 'dcc-wildlife' ),
			Water_Fact::TIER_GENERAL   => __( 'general — angling guidance, not this water', 'dcc-wildlife' ),
		];
		?>
		<table class="widefat striped dccwl-rows" id="dccwl-almanac">
			<thead>
				<tr>
					<th><?php esc_html_e( 'Waterbody', 'dcc-wildlife' ); ?></th>
					<th><?php esc_html_e( 'Field', 'dcc-wildlife' ); ?></th>
					<th><?php esc_html_e( 'Value', 'dcc-wildlife' ); ?></th>
					<th><?php esc_html_e( 'Tier *', 'dcc-wildlife' ); ?></th>
					<th><?php esc_html_e( 'Source name *', 'dcc-wildlife' ); ?></th>
					<th><?php esc_html_e( 'Source URL', 'dcc-wildlife' ); ?></th>
					<th><?php esc_html_e( 'Date *', 'dcc-wildlife' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php foreach ( array_values( $rows ) as $i => $row ) : ?>
					<tr>
						<td><input type="text" name="<?php echo esc_attr( $name ); ?>[almanac][<?php echo (int) $i; ?>][waterbody]" value="<?php echo esc_attr( (string) ( $row['waterbody'] ?? '' ) ); ?>" placeholder="<?php esc_attr_e( 'Dora Canal', 'dcc-wildlife' ); ?>" /></td>
						<td><input type="text" name="<?php echo esc_attr( $name ); ?>[almanac][<?php echo (int) $i; ?>][label]" value="<?php echo esc_attr( (string) ( $row['label'] ?? '' ) ); ?>" placeholder="<?php esc_attr_e( 'Max depth', 'dcc-wildlife' ); ?>" /></td>
						<td><input type="text" name="<?php echo esc_attr( $name ); ?>[almanac][<?php echo (int) $i; ?>][value]" value="<?php echo esc_attr( (string) ( $row['value'] ?? '' ) ); ?>" /></td>
						<td>
							<select name="<?php echo esc_attr( $name ); ?>[almanac][<?php echo (int) $i; ?>][tier]">
								<option value=""><?php esc_html_e( '— choose —', 'dcc-wildlife' ); ?></option>
								<?php foreach ( $tiers as $slug => $label ) : ?>
									<option value="<?php echo esc_attr( $slug ); ?>" <?php selected( (string) ( $row['tier'] ?? '' ), $slug ); ?>><?php echo esc_html( $label ); ?></option>
								<?php endforeach; ?>
							</select>
						</td>
						<td><input type="text" name="<?php echo esc_attr( $name ); ?>[almanac][<?php echo (int) $i; ?>][source_name]" value="<?php echo esc_attr( (string) ( $row['source_name'] ?? '' ) ); ?>" placeholder="<?php esc_attr_e( 'FWC bathymetry', 'dcc-wildlife' ); ?>" /></td>
						<td><input type="url" name="<?php echo esc_attr( $name ); ?>[almanac][<?php echo (int) $i; ?>][source_url]" value="<?php echo esc_attr( (string) ( $row['source_url'] ?? '' ) ); ?>" /></td>
						<td><input type="text" name="<?php echo esc_attr( $name ); ?>[almanac][<?php echo (int) $i; ?>][date]" value="<?php echo esc_attr( (string) ( $row['date'] ?? '' ) ); ?>" placeholder="2024 / 2024-06 / 2024-06-01" size="12" /></td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
		<p><button type="button" class="button dccwl-add-row" data-target="dccwl-almanac"><?php esc_html_e( '+ Add row', 'dcc-wildlife' ); ?></button>
		<span class="description"><?php esc_html_e( '* required — a row without these will not save.', 'dcc-wildlife' ); ?></span></p>
		<?php
	}

	/**
	 * @param array<int,array<string,string>> $rows
	 */
	private static function render_link_table( string $name, string $key, array $rows ): void {
		$rows[] = [];
		$id     = 'dccwl-' . $key;
		?>
		<table class="widefat striped dccwl-rows" id="<?php echo esc_attr( $id ); ?>">
			<thead>
				<tr>
					<th style="width:35%"><?php esc_html_e( 'Label', 'dcc-wildlife' ); ?></th>
					<th><?php esc_html_e( 'URL', 'dcc-wildlife' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php foreach ( array_values( $rows ) as $i => $row ) : ?>
					<tr>
						<td><input type="text" class="large-text" name="<?php echo esc_attr( $name ); ?>[<?php echo esc_attr( $key ); ?>][<?php echo (int) $i; ?>][label]" value="<?php echo esc_attr( (string) ( $row['label'] ?? '' ) ); ?>" /></td>
						<td><input type="url" class="large-text" name="<?php echo esc_attr( $name ); ?>[<?php echo esc_attr( $key ); ?>][<?php echo (int) $i; ?>][url]" value="<?php echo esc_attr( (string) ( $row['url'] ?? '' ) ); ?>" /></td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
		<p><button type="button" class="button dccwl-add-row" data-target="<?php echo esc_attr( $id ); ?>"><?php esc_html_e( '+ Add row', 'dcc-wildlife' ); ?></button></p>
		<?php
	}
}
