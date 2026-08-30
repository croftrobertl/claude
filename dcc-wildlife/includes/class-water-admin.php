<?php
/**
 * Water module — Settings → DCC Water.
 *
 * ONE PAGE (1.7.0). Until now there were two — DCC → Wildlife, owned by the
 * site mu-plugin `dcc-wildlife-countdown.php`, and DCC → Water, owned by
 * this plugin. Two pages for one plugin, which the owner rightly queried.
 * The mu-plugin came first, when this plugin had no settings page at all;
 * now it does, so the countdown toggle moves in here and everything lives
 * on a single page with Field guide / Water / Map sections.
 *
 * SLUG HANDOVER. This registers at `dcc-wildlife` — but only if that slug
 * is still free. While the mu-plugin is active it owns that slug, so we
 * fall back to `dcc-wildlife-water` and show a notice telling the owner to
 * delete the mu-plugin, at which point this page takes the slug over. That
 * way neither page ever silently disappears, whichever order things happen
 * in. `dcc-wildlife-countdown.php` can be deleted as part of this change.
 *
 * COUNTDOWN VALUE. The toggle is stored in its own standalone option so the
 * mu-plugin's existing value survives the move rather than being reset to a
 * default. See COUNTDOWN_OPTION — that key MUST be confirmed against the
 * mu-plugin before it is deleted; it is filterable via
 * `dcc_wl_countdown_option` if it turns out to differ.
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

	public const SLUG     = 'dcc-wildlife';
	public const SLUG_ALT = 'dcc-wildlife-water';
	public const PARENT   = 'dcc';

	/**
	 * Standalone option holding the season-countdown toggle, kept separate
	 * from this plugin's settings array so the mu-plugin's existing value
	 * carries over untouched.
	 *
	 * Confirmed 1.7.1 against dcc-wildlife-countdown.php line 17:
	 *   const DCC_WL_COUNTDOWN_OPTION = 'dcc_wl_countdown_enabled';
	 * read with a default of 1. My 1.7.0 inference (`dcc_wildlife_countdown`)
	 * was wrong and would have shown the owner's toggle as OFF the first
	 * time. The default below is 1 to match the mu-plugin, so deleting that
	 * file changes nothing for a site that never touched the setting.
	 */
	public const COUNTDOWN_OPTION = 'dcc_wl_countdown_enabled';

	public static function countdown_option(): string {
		/**
		 * Filter the option name holding the season-countdown toggle.
		 *
		 * @param string $option
		 */
		return (string) apply_filters( 'dcc_wl_countdown_option', self::COUNTDOWN_OPTION );
	}

	public static function countdown_enabled(): bool {
		// Default 1, matching the mu-plugin this replaces.
		return (bool) get_option( self::countdown_option(), 1 );
	}

	/** Which slug we actually ended up on. */
	private static string $slug = self::SLUG_ALT;
	private const NOTICE = 'dcc_wl_water_notice';

	/** Hook suffix of whichever page we ended up registering. */
	private static string $hook = '';

	public static function register_hooks(): void {
		// Priority 63: after the mu-plugins that construct the DCC menu
		// (top-level registered around 58–62).
		add_action( 'admin_menu', [ self::class, 'add_page' ], 63 );
		add_action( 'admin_init', [ self::class, 'register' ] );
		add_action( 'admin_notices', [ self::class, 'notices' ] );
		add_action( 'admin_enqueue_scripts', [ self::class, 'assets' ] );
	}

	public static function add_page(): void {
		$parent_exists = isset( $GLOBALS['admin_page_hooks'][ self::PARENT ] );

		// Claim `dcc-wildlife` only if the mu-plugin has not already taken
		// it. Two registrations of one slug means one page vanishes.
		self::$slug = self::slug_taken( self::SLUG ) ? self::SLUG_ALT : self::SLUG;

		$title = __( 'DCC Wildlife', 'dcc-wildlife' );
		$label = self::SLUG === self::$slug
			? __( 'Wildlife', 'dcc-wildlife' )
			: __( 'Water', 'dcc-wildlife' );

		$hook = $parent_exists
			? add_submenu_page( self::PARENT, $title, $label, 'manage_options', self::$slug, [ self::class, 'render_page' ] )
			: add_options_page( $title, $title, 'manage_options', self::$slug, [ self::class, 'render_page' ] );

		self::$hook = is_string( $hook ) ? $hook : '';
	}

	private static function slug_taken( string $slug ): bool {
		$submenu = $GLOBALS['submenu'][ self::PARENT ] ?? [];
		if ( ! is_array( $submenu ) ) {
			return false;
		}
		foreach ( $submenu as $item ) {
			if ( is_array( $item ) && isset( $item[2] ) && $slug === $item[2] ) {
				return true;
			}
		}
		return false;
	}

	public static function register(): void {
		// Separate option so the mu-plugin's saved value survives the move.
		register_setting(
			'dcc_wl_water',
			self::countdown_option(),
			[
				'type'              => 'boolean',
				'sanitize_callback' => static fn( $v ): int => empty( $v ) ? 0 : 1,
			]
		);

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
		if ( '' === self::$hook || $hook !== self::$hook ) {
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
					'clarity'  => esc_url_raw( rest_url( Water_Rest::NS . '/test-atlas' ) ),
					'waters'   => esc_url_raw( rest_url( Water_Rest::NS . '/discover-waters' ) ),
					'nonce'    => wp_create_nonce( 'wp_rest' ),
					'i18n'     => [
						'testing'    => __( 'Asking the Water Atlas…', 'dcc-wildlife' ),
						'clarityBad' => __( 'No usable readings found.', 'dcc-wildlife' ),
						'sweeping'   => __( 'Sweeping the chain…', 'dcc-wildlife' ),
						'noWaters'   => __( 'No further waters came back. Everything the Atlas knows nearby is already listed.', 'dcc-wildlife' ),
						'addWater'   => __( 'Add', 'dcc-wildlife' ),
						'added'      => __( 'Added — remember to Save', 'dcc-wildlife' ),
						'foundWaters'=> __( 'candidates found — add the ones that belong to the chain, then Save.', 'dcc-wildlife' ),
						'searching' => __( 'Asking USGS…', 'dcc-wildlife' ),
						'none'      => __( 'No active gauges returned for that area. Check the coordinates, or add site IDs by hand.', 'dcc-wildlife' ),
						'failed'    => __( 'Could not reach USGS. Nothing was changed.', 'dcc-wildlife' ),
						'add'       => __( 'Use as rain gauge', 'dcc-wildlife' ),
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

		$rain      = preg_replace( '/\D/', '', (string) ( $input['rain_site'] ?? '' ) );
		$out['rain_site'] = ( is_string( $rain ) && preg_match( '/^\d{8,15}$/', $rain ) ) ? $rain : '';

		// Water Atlas: https only — fetched server-side. The waterbody and
		// site ids are integers; anything else is dropped rather than sent.
		$base = esc_url_raw( trim( (string) ( $input['atlas_base'] ?? '' ) ) );
		$out['atlas_base'] = preg_match( '#^https://#i', $base ) ? untrailingslashit( $base ) : '';
		$wb   = preg_replace( '/\D/', '', (string) ( $input['atlas_waterbody'] ?? '' ) );
		$out['atlas_waterbody'] = is_string( $wb ) ? $wb : '';
		$site = preg_replace( '/\D/', '', (string) ( $input['atlas_site'] ?? '' ) );
		$out['atlas_site'] = ( is_string( $site ) && '' !== $site ) ? $site : '1';

		$primary = preg_replace( '/\D/', '', (string) ( $input['primary_water'] ?? '' ) );
		$out['primary_water'] = is_string( $primary ) ? $primary : '';

		$chain = is_array( $input['chain_waters'] ?? null ) ? array_values( $input['chain_waters'] ) : [];
		$rows  = [];
		foreach ( $chain as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$id = preg_replace( '/\D/', '', (string) ( $row['id'] ?? '' ) );
			if ( ! is_string( $id ) || '' === $id ) {
				continue;
			}
			$lat = trim( (string) ( $row['lat'] ?? '' ) );
			$lon = trim( (string) ( $row['lon'] ?? '' ) );
			$rows[] = [
				'id'   => $id,
				'name' => sanitize_text_field( (string) ( $row['name'] ?? '' ) ),
				'lat'  => is_numeric( $lat ) ? $lat : '',
				'lon'  => is_numeric( $lon ) ? $lon : '',
			];
		}
		$out['chain_waters'] = $rows;

		$out['map_enabled'] = empty( $input['map_enabled'] ) ? 0 : 1;
		$out['map_ramps']   = empty( $input['map_ramps'] ) ? 0 : 1;
		$out['map_default_layer'] = 'streets' === ( $input['map_default_layer'] ?? '' ) ? 'streets' : 'satellite';
		$out['map_sat_attrib']    = wp_kses_post( trim( (string) ( $input['map_sat_attrib'] ?? '' ) ) );
		foreach ( [ 'map_leaflet_js', 'map_leaflet_css', 'map_tile_url', 'map_sat_url' ] as $k ) {
			$v         = trim( (string) ( $input[ $k ] ?? '' ) );
			$out[ $k ] = preg_match( '#^https://#i', $v ) ? esc_url_raw( $v ) : '';
		}
		$out['map_tile_attrib'] = wp_kses_post( trim( (string) ( $input['map_tile_attrib'] ?? '' ) ) );

		$clarity_link            = esc_url_raw( trim( (string) ( $input['clarity_link'] ?? '' ) ) );
		$out['clarity_link']     = preg_match( '#^https?://#i', $clarity_link ) ? $clarity_link : '';

		// Uninstall is destructive, so it is opt-in and defaults off.
		$out['delete_on_uninstall'] = empty( $input['delete_on_uninstall'] ) ? 0 : 1;

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
				'section'     => 'about' === sanitize_key( (string) ( $row['section'] ?? '' ) ) ? 'about' : 'conditions',
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
		if ( ! $screen || '' === self::$hook || $screen->id !== self::$hook ) {
			return;
		}
		if ( self::SLUG_ALT === self::$slug ) {
			?>
			<div class="notice notice-info">
				<p>
					<strong><?php esc_html_e( 'One page instead of two:', 'dcc-wildlife' ); ?></strong>
					<?php esc_html_e( 'the season-countdown toggle now lives on this page, so the old mu-plugin is no longer needed. Delete wp-content/mu-plugins/dcc-wildlife-countdown.php and this page moves to DCC → Wildlife, replacing both.', 'dcc-wildlife' ); ?>
				</p>
			</div>
			<?php
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
					<?php esc_html_e( 'Place the module with the "DCC Water — Fishing & Conditions" Elementor widget, or the [dcc_water] shortcode. It renders nowhere until you place it — and once placed it stays completely invisible until it has something sourced to say, so you can put it on the Guest Guide now and let it light up as it fills.', 'dcc-wildlife' ); ?>
				</p>
			</div>

			<form action="options.php" method="post">
				<?php settings_fields( 'dcc_wl_water' ); ?>

				<h2><?php esc_html_e( 'Field guide', 'dcc-wildlife' ); ?></h2>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Season countdown', 'dcc-wildlife' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( self::countdown_option() ); ?>" value="1" <?php checked( self::countdown_enabled(), true ); ?> />
								<?php esc_html_e( 'Show the season countdown on the wildlife guide', 'dcc-wildlife' ); ?>
							</label>
							<p class="description"><?php esc_html_e( 'Moved here from the mu-plugin so this plugin has one settings page. Your existing setting was carried over, not reset.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
				</table>

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
						<th scope="row"><label for="dccwl-rainsite"><?php esc_html_e( 'Rain gauge', 'dcc-wildlife' ); ?></label></th>
						<td>
							<input type="text" id="dccwl-rainsite" class="regular-text code" name="<?php echo esc_attr( $name ); ?>[rain_site]" value="<?php echo esc_attr( (string) $o['rain_site'] ); ?>" />
							<p class="description"><?php esc_html_e( 'Site 02237700 is the only nearby gauge reporting precipitation. Totals are whole calendar days, and the page says so rather than claiming a rolling 48 hours. Do not type a site from memory — use the button to ask USGS what is actually near you, then pick from real results.', 'dcc-wildlife' ); ?></p>
							<p>
								<button type="button" class="button" id="dccwl-discover"><?php esc_html_e( 'Find nearby USGS gauges', 'dcc-wildlife' ); ?></button>
								<span id="dccwl-discover-status" style="margin-left:8px"></span>
							</p>
							<div id="dccwl-discover-results"></div>
						</td>
					</tr>
				</table>

				<h2><?php esc_html_e( 'Lake County Water Atlas', 'dcc-wildlife' ); ?></h2>
				<p class="description" style="max-width:46em">
					<?php esc_html_e( 'Supplies water level (from an SJRWMD station on Lake Dora itself), Secchi clarity, dissolved oxygen, TSI and the bathymetric depth map. Each reading arrives with its own units, precision, sample date and station, and those are what get shown.', 'dcc-wildlife' ); ?>
				</p>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="dccwl-atlas-base"><?php esc_html_e( 'API base URL', 'dcc-wildlife' ); ?></label></th>
						<td>
							<input type="url" id="dccwl-atlas-base" class="large-text code" name="<?php echo esc_attr( $name ); ?>[atlas_base]" value="<?php echo esc_attr( (string) $o['atlas_base'] ); ?>" />
							<p class="description"><?php esc_html_e( 'No /api/ prefix — that path 404s. The bare host is correct.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-atlas-wb"><?php esc_html_e( 'Waterbody id', 'dcc-wildlife' ); ?></label></th>
						<td>
							<input type="text" id="dccwl-atlas-wb" class="regular-text code" name="<?php echo esc_attr( $name ); ?>[atlas_waterbody]" value="<?php echo esc_attr( (string) $o['atlas_waterbody'] ); ?>" />
							<p class="description"><?php esc_html_e( 'Lake Dora is 7972. This is the Water Atlas waterbody id — NOT the FDEP WBID (2831B), which is a different identifier and does not work here.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-atlas-site"><?php esc_html_e( 'Site id', 'dcc-wildlife' ); ?></label></th>
						<td>
							<input type="text" id="dccwl-atlas-site" class="small-text code" name="<?php echo esc_attr( $name ); ?>[atlas_site]" value="<?php echo esc_attr( (string) $o['atlas_site'] ); ?>" />
							<p class="description"><?php esc_html_e( 'An integer; 1 is correct here. Text values return 400 and omitting it 404s.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-clarity-link"><?php esc_html_e( 'Waterbody page (fallback source link)', 'dcc-wildlife' ); ?></label></th>
						<td>
							<input type="url" id="dccwl-clarity-link" class="large-text code" name="<?php echo esc_attr( $name ); ?>[clarity_link]" value="<?php echo esc_attr( (string) $o['clarity_link'] ); ?>" />
							<p>
								<button type="button" class="button" id="dccwl-test-clarity"><?php esc_html_e( 'Test the Water Atlas', 'dcc-wildlife' ); ?></button>
								<span id="dccwl-clarity-status" style="margin-left:8px"></span>
							</p>
							<div id="dccwl-clarity-results"></div>
							<p class="description"><?php esc_html_e( 'Save first — the test runs against the saved values and lists every reading it recognised.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
				</table>

				<h2><?php esc_html_e( 'Harris Chain waters', 'dcc-wildlife' ); ?></h2>
				<p class="description" style="max-width:46em">
					<?php esc_html_e( 'Ids were resolved live from the Water Atlas. Each water is compared against its OWN long-run median and its own monthly norm — a chain-wide average would be meaningless when the medians range from 1.21 to 2.80 ft. Coordinates are optional: without them a water still appears in the comparison, it is just not drawn on the map.', 'dcc-wildlife' ); ?>
				</p>
				<?php self::render_chain_table( $name, (array) $o['chain_waters'], (string) $o['primary_water'] ); ?>

				<h2><?php esc_html_e( 'Map', 'dcc-wildlife' ); ?></h2>
				<p class="description" style="max-width:46em">
					<?php esc_html_e( 'Nothing external — no Leaflet, no tiles, no map data — loads until a guest presses the Open button. Satellite and street layers are both available, each carrying its provider’s required attribution. If tiles ever fail to load the map falls back to the other layer, and then to markers on a plain background rather than a grid of grey squares.', 'dcc-wildlife' ); ?>
				</p>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Map', 'dcc-wildlife' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[map_enabled]" value="1" <?php checked( (int) $o['map_enabled'], 1 ); ?> />
								<?php esc_html_e( 'Offer the chain map (requires the live layer above)', 'dcc-wildlife' ); ?>
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Boat ramps', 'dcc-wildlife' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[map_ramps]" value="1" <?php checked( (int) $o['map_ramps'], 1 ); ?> />
								<?php esc_html_e( 'Include FWC’s Lake County ramp inventory', 'dcc-wildlife' ); ?>
							</label>
							<p class="description"><?php esc_html_e( 'Closed ramps are shown greyed and marked CLOSED rather than hidden — a guest towing a boat needs to know.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Default base map', 'dcc-wildlife' ); ?></th>
						<td>
							<label style="margin-right:14px">
								<input type="radio" name="<?php echo esc_attr( $name ); ?>[map_default_layer]" value="satellite" <?php checked( 'streets' !== (string) $o['map_default_layer'] ); ?> />
								<?php esc_html_e( 'Satellite', 'dcc-wildlife' ); ?>
							</label>
							<label>
								<input type="radio" name="<?php echo esc_attr( $name ); ?>[map_default_layer]" value="streets" <?php checked( 'streets' === (string) $o['map_default_layer'] ); ?> />
								<?php esc_html_e( 'Streets', 'dcc-wildlife' ); ?>
							</label>
							<p class="description"><?php esc_html_e( 'Guests can switch under Layers. Satellite is the default because structure, grass lines and shoreline read far better from imagery.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-sat"><?php esc_html_e( 'Satellite tile URL', 'dcc-wildlife' ); ?></label></th>
						<td>
							<input type="text" id="dccwl-sat" class="large-text code" name="<?php echo esc_attr( $name ); ?>[map_sat_url]" value="<?php echo esc_attr( (string) $o['map_sat_url'] ); ?>" />
							<p class="description"><strong><?php esc_html_e( 'Note the order:', 'dcc-wildlife' ); ?></strong> <?php esc_html_e( 'Esri uses {z}/{y}/{x} while OpenStreetMap uses {z}/{x}/{y}. Swapping them gives a map that renders perfectly and shows the wrong place — check it over the canal at zoom 13.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-sat-attr"><?php esc_html_e( 'Satellite attribution', 'dcc-wildlife' ); ?></label></th>
						<td>
							<input type="text" id="dccwl-sat-attr" class="large-text" name="<?php echo esc_attr( $name ); ?>[map_sat_attrib]" value="<?php echo esc_attr( (string) $o['map_sat_attrib'] ); ?>" />
							<p class="description"><?php esc_html_e( 'Shown whenever the satellite layer is active. Required by the provider.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-tile"><?php esc_html_e( 'Streets tile URL', 'dcc-wildlife' ); ?></label></th>
						<td>
							<input type="text" id="dccwl-tile" class="large-text code" name="<?php echo esc_attr( $name ); ?>[map_tile_url]" value="<?php echo esc_attr( (string) $o['map_tile_url'] ); ?>" />
							<p class="description"><?php esc_html_e( 'If either provider ever throttles or blocks the site, paste a replacement URL here — swapping providers is a paste, not a release.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-tile-attr"><?php esc_html_e( 'Streets attribution', 'dcc-wildlife' ); ?></label></th>
						<td><input type="text" id="dccwl-tile-attr" class="large-text" name="<?php echo esc_attr( $name ); ?>[map_tile_attrib]" value="<?php echo esc_attr( (string) $o['map_tile_attrib'] ); ?>" /></td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-leaflet-js"><?php esc_html_e( 'Leaflet script', 'dcc-wildlife' ); ?></label></th>
						<td>
							<input type="url" id="dccwl-leaflet-js" class="large-text code" name="<?php echo esc_attr( $name ); ?>[map_leaflet_js]" value="<?php echo esc_attr( (string) $o['map_leaflet_js'] ); ?>" />
							<p class="description"><?php esc_html_e( 'The map’s one third-party script, loaded on demand only. Pinned to a version rather than a floating tag.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="dccwl-leaflet-css"><?php esc_html_e( 'Leaflet stylesheet', 'dcc-wildlife' ); ?></label></th>
						<td><input type="url" id="dccwl-leaflet-css" class="large-text code" name="<?php echo esc_attr( $name ); ?>[map_leaflet_css]" value="<?php echo esc_attr( (string) $o['map_leaflet_css'] ); ?>" /></td>
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

				<h2><?php esc_html_e( 'Housekeeping', 'dcc-wildlife' ); ?></h2>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'On uninstall', 'dcc-wildlife' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[delete_on_uninstall]" value="1" <?php checked( (int) ( $o['delete_on_uninstall'] ?? 0 ), 1 ); ?> />
								<?php esc_html_e( 'Delete all plugin data when the plugin is uninstalled', 'dcc-wildlife' ); ?>
							</label>
							<p class="description"><?php esc_html_e( 'Off by default on purpose: deleting and re-uploading the plugin zip is routine here, and these hand-tuned settings must survive it. Cached data is always cleaned up on uninstall; the settings, this page’s toggles and any old sighting posts are removed only when this box is checked.', 'dcc-wildlife' ); ?></p>
						</td>
					</tr>
				</table>

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
					<th><?php esc_html_e( 'Section', 'dcc-wildlife' ); ?></th>
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
						<td>
							<select name="<?php echo esc_attr( $name ); ?>[almanac][<?php echo (int) $i; ?>][section]">
								<option value="conditions" <?php selected( (string) ( $row['section'] ?? 'conditions' ), 'conditions' ); ?>><?php esc_html_e( 'Conditions', 'dcc-wildlife' ); ?></option>
								<option value="about" <?php selected( (string) ( $row['section'] ?? '' ), 'about' ); ?>><?php esc_html_e( 'About the water', 'dcc-wildlife' ); ?></option>
							</select>
						</td>
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
	private static function render_chain_table( string $name, array $rows, string $primary ): void {
		$rows[] = [];
		?>
		<table class="widefat striped dccwl-rows" id="dccwl-chain">
			<thead>
				<tr>
					<th style="width:90px"><?php esc_html_e( 'Atlas id', 'dcc-wildlife' ); ?></th>
					<th><?php esc_html_e( 'Name', 'dcc-wildlife' ); ?></th>
					<th style="width:120px"><?php esc_html_e( 'Latitude', 'dcc-wildlife' ); ?></th>
					<th style="width:120px"><?php esc_html_e( 'Longitude', 'dcc-wildlife' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php foreach ( array_values( $rows ) as $i => $row ) : ?>
					<tr>
						<td><input type="text" class="code" size="8" name="<?php echo esc_attr( $name ); ?>[chain_waters][<?php echo (int) $i; ?>][id]" value="<?php echo esc_attr( (string) ( $row['id'] ?? '' ) ); ?>" /></td>
						<td><input type="text" class="large-text" name="<?php echo esc_attr( $name ); ?>[chain_waters][<?php echo (int) $i; ?>][name]" value="<?php echo esc_attr( (string) ( $row['name'] ?? '' ) ); ?>" /></td>
						<td><input type="text" class="code" size="10" name="<?php echo esc_attr( $name ); ?>[chain_waters][<?php echo (int) $i; ?>][lat]" value="<?php echo esc_attr( (string) ( $row['lat'] ?? '' ) ); ?>" /></td>
						<td><input type="text" class="code" size="10" name="<?php echo esc_attr( $name ); ?>[chain_waters][<?php echo (int) $i; ?>][lon]" value="<?php echo esc_attr( (string) ( $row['lon'] ?? '' ) ); ?>" /></td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
		<p>
			<button type="button" class="button dccwl-add-row" data-target="dccwl-chain"><?php esc_html_e( '+ Add water', 'dcc-wildlife' ); ?></button>
			<button type="button" class="button" id="dccwl-find-waters"><?php esc_html_e( 'Find more chain waters', 'dcc-wildlife' ); ?></button>
			<span id="dccwl-waters-status" style="margin-left:8px"></span>
			<label style="margin-left:12px">
				<?php esc_html_e( 'Featured water (detailed conditions):', 'dcc-wildlife' ); ?>
				<input type="text" class="code" size="8" name="<?php echo esc_attr( $name ); ?>[primary_water]" value="<?php echo esc_attr( $primary ); ?>" />
			</label>
		</p>
		<div id="dccwl-waters-results"></div>
		<p class="description" style="max-width:46em">
			<?php esc_html_e( 'The search asks the Atlas what water lies nearest — from the property and from each water already listed, so the far ends of the chain turn up too. It returns whatever is closest, which includes ponds and unrelated water, so nothing is added automatically: add the ones that belong to the chain. Names worth looking for that are not yet listed include Haines Creek, Lake Denham and Trout Lake — that is general local knowledge, not sourced data, so check what the Atlas actually returns.', 'dcc-wildlife' ); ?>
		</p>
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
