<?php
/**
 * Water module — stored configuration and the almanac layer.
 *
 * v1.4.0 shipped this empty because it was built with no network access and
 * nothing could be verified. In v1.5.0 the owner verified the sources from a
 * networked session on 2026-08-27, so the defaults below now carry a small
 * number of CHECKED values — the gauge IDs he confirmed active, the
 * coordinates his own mu-plugin has always used, and one published figure
 * (Lake Dora's area). Provenance for every seeded value is in
 * WATER-SOURCES.md; anything he did not verify is still absent.
 *
 * Facts enter this layer one of three ways, all attributed:
 *
 *   1. The owner adds them on Settings → DCC Water, where the form refuses
 *      any row without a tier, a source name and a date.
 *   2. Code adds them through the `dcc_wl_water_almanac` filter, in the
 *      same shape, subject to the same gate in Water_Fact::make().
 *   3. The live layer fetches them at runtime, where the value, the source
 *      and the measurement time all arrive together from the API.
 *
 * An empty almanac renders as an absent section. That is the correct
 * behaviour, not a bug to be "fixed" with plausible placeholder numbers.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Water_Data {

	public const OPTION = 'dcc_wl_water';

	/** Weather/gauge cache TTLs, in seconds. */
	public const TTL_USGS = 900;   // 15 min — matches USGS instantaneous-values cadence.
	public const TTL_NWS  = 1800;  // 30 min.
	public const TTL_FAIL = 300;   // Back off 5 min after a failure; never hammer a source.

	/**
	 * @return array<string,mixed>
	 */
	public static function defaults(): array {
		return [
			// Still off by default: it makes network calls, so switching it
			// on stays a deliberate act by the owner.
			'live_enabled'      => 0,

			// Verified 2026-08-27: api.weather.gov/points/28.8045,-81.7450
			// resolves to Tavares, FL — office MLB, grid 11,78. These are the
			// coordinates the owner's own dcc-sun-canal.php mu-plugin has
			// used all along for its sunrise/sunset maths. NWS forecasts are
			// gridded at roughly city scale, so this exposes no home address.
			'lat'               => '28.8045',
			'lon'               => '-81.7450',

			// Active gauges confirmed by the owner in Lake County (12069).
			// Since 1.6.0 these are used for RAINFALL ONLY — the USGS level
			// gauges were dropped because none sits on Lake Dora, and the
			// Water Atlas exposes an SJRWMD station that does.
			'usgs_sites'        => [ '02237700', '02237701', '02238000', '02238001', '02237734' ],

			// Apopka-Beauclair is the only nearby gauge reporting
			// precipitation (00045).
			'rain_site'         => '02237700',

			// The Harris Chain, chain-wide since 1.7.0. Every id below was
			// resolved from the live API on 2026-08-27 via
			// /waterbodies/closest?lat=&lng=&len=20&s=1 — note `len` caps at
			// 20, and search/waterbodies returns 500, so use `closest`.
			//
			// Coordinates are NOT seeded: the owner's capture did not include
			// them, so nothing is guessed. A water without coordinates still
			// appears in the chain comparison and its readings; it simply is
			// not drawn on the map until coordinates are entered or the API
			// supplies them.
			'chain_waters'      => self::default_chain(),
			'primary_water'     => '7972',

			// Lake County Water Atlas, resolved live 2026-08-27.
			// NOTE: 7972 is the Water Atlas WATERBODY id for Lake Dora. It is
			// NOT the FDEP WBID (2831B), which is a different identifier and
			// 404s against this API. `s` is an integer Site Id.
			'atlas_base'        => 'https://api.wateratlas.usf.edu',
			'atlas_waterbody'   => '7972',
			'atlas_site'        => '1',
			'clarity_link'      => 'https://lake.wateratlas.usf.edu/waterbodies/lakes/7972/lake-dora',

			// Map. Off by default like the rest of the live layer, and it
			// loads NOTHING external until a guest actually opens it.
			'map_enabled'       => 0,
			'map_leaflet_js'    => 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
			'map_leaflet_css'   => 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
			'map_tile_url'      => 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
			'map_tile_attrib'   => '&copy; OpenStreetMap contributors',
			'map_ramps'         => 1,

			'almanac'           => self::default_almanac(),
			'links'             => self::default_links(),
			'reports'           => [],  // "Local reports & charters" — owner-supplied only.
		];
	}

	/**
	 * The Harris Chain waters, ids verified live 2026-08-27.
	 *
	 * @return array<int,array<string,string>>
	 */
	public static function default_chain(): array {
		$w = [
			[ '7972', __( 'Lake Dora', 'dcc-wildlife' ) ],
			[ '7985', __( 'Lake Eustis', 'dcc-wildlife' ) ],
			[ '7999', __( 'Lake Harris', 'dcc-wildlife' ) ],
			[ '8099', __( 'Little Lake Harris', 'dcc-wildlife' ) ],
			[ '7998', __( 'Lake Griffin', 'dcc-wildlife' ) ],
			[ '7953', __( 'Lake Beauclair', 'dcc-wildlife' ) ],
			[ '7840', __( 'Lake Carlton', 'dcc-wildlife' ) ],
			[ '8080', __( 'Lake Yale', 'dcc-wildlife' ) ],
			[ '1101', __( 'Apopka-Beauclair Canal', 'dcc-wildlife' ) ],
			[ '1107', __( 'Dead River', 'dcc-wildlife' ) ],
		];
		$out = [];
		foreach ( $w as [ $id, $name ] ) {
			$out[] = [
				'id'   => $id,
				'name' => $name,
				'lat'  => '',
				'lon'  => '',
			];
		}
		return $out;
	}

	/**
	 * @return array<int,array<string,string>>
	 */
	public static function chain_waters(): array {
		$rows = self::get( 'chain_waters' );
		if ( ! is_array( $rows ) ) {
			return [];
		}
		$out = [];
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$id = preg_replace( '/\D/', '', (string) ( $row['id'] ?? '' ) );
			if ( ! is_string( $id ) || '' === $id ) {
				continue;
			}
			$name = sanitize_text_field( (string) ( $row['name'] ?? '' ) );
			$lat  = trim( (string) ( $row['lat'] ?? '' ) );
			$lon  = trim( (string) ( $row['lon'] ?? '' ) );
			$out[] = [
				'id'   => $id,
				'name' => '' !== $name ? $name : $id,
				'lat'  => is_numeric( $lat ) ? $lat : '',
				'lon'  => is_numeric( $lon ) ? $lon : '',
			];
		}
		return $out;
	}

	/** The water whose detailed conditions head the module. */
	public static function primary_water(): string {
		$v = preg_replace( '/\D/', '', (string) self::get( 'primary_water' ) );
		if ( is_string( $v ) && '' !== $v ) {
			return $v;
		}
		$chain = self::chain_waters();
		return $chain ? $chain[0]['id'] : self::atlas_waterbody();
	}

	/**
	 * The one published figure verified at build time.
	 *
	 * Lake Dora's area comes from the Water Atlas waterbody page the owner
	 * checked on 2026-08-27. The date is the retrieval date, not a claim
	 * about when the survey was done. Nothing else is seeded: no depths, no
	 * clarity, no species, no hydrology.
	 *
	 * It carries `section => about` because acreage is NOT a condition. A
	 * section headed "Fishing & water conditions" must not appear on the
	 * strength of a surface-area figure alone, so `about` rows render in
	 * their own block below and never satisfy has_static_content().
	 *
	 * @return array<int,array<string,string>>
	 */
	public static function default_almanac(): array {
		return [
			[
				'waterbody'   => __( 'Lake Dora', 'dcc-wildlife' ),
				'label'       => __( 'Surface area', 'dcc-wildlife' ),
				'value'       => __( '4,385 acres', 'dcc-wildlife' ),
				'tier'        => Water_Fact::TIER_PUBLISHED,
				'source_name' => __( 'Lake County Water Atlas — Lake Dora (WBID 2831B), retrieved', 'dcc-wildlife' ),
				'source_url'  => 'https://lake.wateratlas.usf.edu/waterbodies/lakes/7972/lake-dora',
				'date'        => '2026-08-27',
				'note'        => '',
				'section'     => 'about',
			],
		];
	}

	/**
	 * Authority links only.
	 *
	 * Provenance: the Lake Dora page is a deep link the owner verified on
	 * 2026-08-27. The two USGS entries are built from site IDs he confirmed
	 * active, using the monitoring-location URL pattern this plugin already
	 * uses for its source links. FWC, NWS and SJRWMD remain roots: no
	 * Lake-County-specific path on those sites was verified, and a guessed
	 * deep link is a broken link. They are flagged in WATER-SOURCES.md as
	 * the owner's to improve. All of these are links, not claims — no fact
	 * is asserted about their contents.
	 *
	 * Commercial and user-generated sites (charters, fishing-report blogs,
	 * app check-ins) are deliberately NOT prefilled: their pages are
	 * copyrighted, have no public API, and their "reports" are exactly the
	 * anecdote this module refuses to state as fact. The owner can add the
	 * ones he trusts under "Local reports & charters", where they render
	 * plainly as outbound links.
	 *
	 * @return array<int,array<string,string>>
	 */
	public static function default_links(): array {
		return [
			[
				'label' => __( 'Florida FWC — fishing licences & regulations', 'dcc-wildlife' ),
				'url'   => 'https://myfwc.com/',
			],
			[
				'label' => __( 'Lake Dora — Water Atlas waterbody page (USF Water Institute)', 'dcc-wildlife' ),
				'url'   => 'https://lake.wateratlas.usf.edu/waterbodies/lakes/7972/lake-dora',
			],
			[
				'label' => __( 'USGS gauge — Apopka-Beauclair Canal near Astatula', 'dcc-wildlife' ),
				'url'   => 'https://waterdata.usgs.gov/monitoring-location/02237700/',
			],
			[
				'label' => __( 'USGS gauge — Haynes Creek at Lisbon', 'dcc-wildlife' ),
				'url'   => 'https://waterdata.usgs.gov/monitoring-location/02238000/',
			],
			[
				'label' => __( 'National Weather Service forecast', 'dcc-wildlife' ),
				'url'   => 'https://www.weather.gov/',
			],
			[
				'label' => __( 'St. Johns River Water Management District', 'dcc-wildlife' ),
				'url'   => 'https://www.sjrwmd.com/',
			],
		];
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function all(): array {
		$stored = get_option( self::OPTION, [] );
		if ( ! is_array( $stored ) ) {
			$stored = [];
		}
		return wp_parse_args( $stored, self::defaults() );
	}

	/**
	 * @return mixed
	 */
	public static function get( string $key ) {
		$all = self::all();
		return $all[ $key ] ?? null;
	}

	public static function live_enabled(): bool {
		return (bool) self::get( 'live_enabled' );
	}

	/**
	 * Property coordinates, or null when unset. Required for the NWS
	 * forecast and for USGS gauge discovery; nothing is guessed.
	 *
	 * @return array{lat:float,lon:float}|null
	 */
	public static function coords(): ?array {
		$lat = trim( (string) self::get( 'lat' ) );
		$lon = trim( (string) self::get( 'lon' ) );
		if ( '' === $lat || '' === $lon || ! is_numeric( $lat ) || ! is_numeric( $lon ) ) {
			return null;
		}
		$lat = (float) $lat;
		$lon = (float) $lon;
		if ( $lat < -90 || $lat > 90 || $lon < -180 || $lon > 180 ) {
			return null;
		}
		return [ 'lat' => $lat, 'lon' => $lon ];
	}

	/**
	 * Configured USGS site IDs (numeric strings, 8–15 digits).
	 *
	 * @return string[]
	 */
	public static function usgs_sites(): array {
		$sites = self::get( 'usgs_sites' );
		if ( ! is_array( $sites ) ) {
			return [];
		}
		$out = [];
		foreach ( $sites as $s ) {
			$s = preg_replace( '/\D/', '', (string) $s );
			if ( is_string( $s ) && preg_match( '/^\d{8,15}$/', $s ) ) {
				$out[] = $s;
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * The almanac, as gated Facts grouped by waterbody label.
	 *
	 * Rows are drawn from stored settings plus the `dcc_wl_water_almanac`
	 * filter, then passed through Water_Fact::make(). Anything unattributed
	 * is dropped here and can never reach the renderer.
	 *
	 * @param string $section 'conditions' (default) or 'about'.
	 * @return array<string,Water_Fact[]>
	 */
	public static function almanac( string $section = 'conditions' ): array {
		$rows = self::get( 'almanac' );
		$rows = is_array( $rows ) ? $rows : [];

		/**
		 * Filter almanac rows before gating.
		 *
		 * Rows are arrays with: waterbody, label, value, tier
		 * (live|published|general), source_name, source_url, date, note.
		 * Rows missing tier, source_name or date are discarded — adding a
		 * row through this filter does not bypass attribution.
		 *
		 * @param array<int,array<string,mixed>> $rows
		 */
		$rows = apply_filters( 'dcc_wl_water_almanac', $rows );
		$rows = is_array( $rows ) ? $rows : [];

		$grouped = [];
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$row_section = 'about' === trim( (string) ( $row['section'] ?? '' ) ) ? 'about' : 'conditions';
			if ( $row_section !== $section ) {
				continue;
			}
			$fact = Water_Fact::make( $row );
			if ( ! $fact instanceof Water_Fact ) {
				continue;
			}
			$body = trim( (string) ( $row['waterbody'] ?? '' ) );
			if ( '' === $body ) {
				$body = __( 'General', 'dcc-wildlife' );
			}
			$grouped[ $body ][] = $fact;
		}
		return $grouped;
	}

	private static function site_id( string $key ): string {
		$v = preg_replace( '/\D/', '', (string) self::get( $key ) );
		return ( is_string( $v ) && preg_match( '/^\d{8,15}$/', $v ) ) ? $v : '';
	}

	/** Gauge whose precipitation drives the rainfall line. */
	public static function rain_site(): string {
		return self::site_id( 'rain_site' );
	}

	public static function atlas_base(): string {
		$v = esc_url_raw( trim( (string) self::get( 'atlas_base' ) ) );
		return preg_match( '#^https://#i', $v ) ? untrailingslashit( $v ) : '';
	}

	/** Water Atlas waterbody id — NOT the FDEP WBID. Lake Dora = 7972. */
	public static function atlas_waterbody(): string {
		$v = preg_replace( '/\D/', '', (string) self::get( 'atlas_waterbody' ) );
		return is_string( $v ) ? $v : '';
	}

	/** Site Id: an integer. `s=lake` returns 400. */
	public static function atlas_site(): string {
		$v = preg_replace( '/\D/', '', (string) self::get( 'atlas_site' ) );
		return ( is_string( $v ) && '' !== $v ) ? $v : '1';
	}

	public static function atlas_configured(): bool {
		return '' !== self::atlas_base() && ( '' !== self::primary_water() || '' !== self::atlas_waterbody() );
	}

	public static function clarity_link(): string {
		$v = esc_url_raw( trim( (string) self::get( 'clarity_link' ) ) );
		return preg_match( '#^https?://#i', $v ) ? $v : 'https://lake.wateratlas.usf.edu/';
	}

	public static function map_enabled(): bool {
		return (bool) self::get( 'map_enabled' );
	}

	public static function map_asset( string $key ): string {
		$v = esc_url_raw( trim( (string) self::get( $key ) ) );
		return preg_match( '#^https://#i', $v ) ? $v : '';
	}

	public static function map_tile_url(): string {
		$v = trim( (string) self::get( 'map_tile_url' ) );
		return preg_match( '#^https://#i', $v ) ? $v : '';
	}

	public static function map_ramps_enabled(): bool {
		return (bool) self::get( 'map_ramps' );
	}

	/**
	 * Is the map actually usable? Requires the toggle, the live layer and a
	 * Leaflet URL — without all three there is nothing to open.
	 */
	public static function map_possible(): bool {
		return self::map_enabled()
			&& self::live_enabled()
			&& '' !== self::map_asset( 'map_leaflet_js' )
			&& '' !== self::map_tile_url();
	}

	/**
	 * Does the module hold anything worth showing WITHOUT a network call?
	 *
	 * Drives the auto-hide: a heading over a few links reads as unfinished
	 * on a guest page, so the module renders nothing at all unless it has a
	 * sourced CONDITION fact. Live readings cannot be counted here — they
	 * arrive after paint — so the renderer keeps the section hidden and lets
	 * the JS reveal it if, and only if, real readings turn up.
	 *
	 * almanac('conditions') only: an "About the water" row such as surface
	 * area is not a condition and must not be the sole reason a section
	 * headed "Fishing & water conditions" appears.
	 */
	public static function has_static_content(): bool {
		return (bool) self::almanac( 'conditions' );
	}

	/**
	 * Could a live reading plausibly arrive? Used to decide whether to emit
	 * the hidden shell at all, so a module with the layer switched off (or
	 * unconfigured) emits no markup whatsoever.
	 */
	public static function live_possible(): bool {
		if ( ! self::live_enabled() ) {
			return false;
		}
		return '' !== self::rain_site()
			|| null !== self::coords()
			|| self::atlas_configured();
	}

	/* The owner's "From the dock" notes and his rain-note were removed in
	 * 1.7.0 at his request. He lives about an hour from the cottages and
	 * does not fish, and would not risk giving inaccurate local detail to
	 * guests who are seasoned, dedicated fishermen and boaters. The module
	 * speaks at Harris Chain scale from sourced data instead. Restore from
	 * git history at v1.6.0 if that ever changes. */

	/**
	 * @param string $key 'links' or 'reports'
	 * @return array<int,array<string,string>>
	 */
	public static function link_list( string $key ): array {
		$rows = self::get( $key );
		if ( ! is_array( $rows ) ) {
			return [];
		}
		$out = [];
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$label = trim( (string) ( $row['label'] ?? '' ) );
			$url   = esc_url_raw( trim( (string) ( $row['url'] ?? '' ) ) );
			if ( '' === $label || '' === $url || ! preg_match( '#^https?://#i', $url ) ) {
				continue;
			}
			$out[] = [
				'label' => $label,
				'url'   => $url,
			];
		}
		return $out;
	}
}
