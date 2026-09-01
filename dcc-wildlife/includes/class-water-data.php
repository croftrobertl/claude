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

			// Apopka-Beauclair is the only nearby gauge reporting
			// precipitation (00045). (The old `usgs_sites` list was removed in
			// 1.8.0 — nothing had read it since 1.6.0 dropped the USGS level
			// gauges; the rain gauge above is the one USGS site in use.)
			'rain_site'         => '02237700',

			// The Harris Chain, chain-wide since 1.7.0. Every id below was
			// resolved from the live API on 2026-08-27 via
			// /waterbodies/closest?lat=&lng=&len=20&s=1 — note `len` caps at
			// 20, and search/waterbodies returns 500, so use `closest`.
			//
			// Coordinates ARE seeded since 1.7.1: the owner retrieved each
			// waterbody's own `Waterbody.Location` centroid from the Atlas on
			// 2026-08-27, so the chain can be drawn rather than only listed.
			// They are the Atlas's centroid points — `published`, sourced to
			// the Atlas, not anything measured on the water. Still editable.
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
			// TWO base layers, both verified working 2026-08-27.
			//
			// MIND THE COORDINATE ORDER. Esri's template is {z}/{y}/{x} and
			// OSM's is {z}/{x}/{y}. Swapping them yields a map that renders
			// perfectly and shows the wrong part of Florida — no error, no
			// blank tiles, just the wrong place. Both are settings precisely
			// so a provider swap is a paste, not a release.
			'map_sat_url'       => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
			'map_sat_attrib'    => 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
			'map_tile_url'      => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
			'map_tile_attrib'   => '&copy; OpenStreetMap contributors',
			// Anglers and boaters read structure, grass lines and shoreline
			// far better from imagery than from a street map.
			'map_default_layer' => 'satellite',
			'map_ramps'         => 1,

			'almanac'           => self::default_almanac(),
			'links'             => self::default_links(),
			'reports'           => [],  // "Local reports & charters" — owner-supplied only.

			// Fishing almanac (v1.11.0). Static, FWC-sourced angling guidance —
			// species, limits, the Lake Dora fish attractors and a month-by-month
			// pattern. It makes NO network call (unlike the live layer), so it is
			// on by default. This is a DELIBERATE expansion, authorised by the
			// owner on 2026-09-01, of the prior "fishing is link-only" policy
			// (see class-water-data's dock-notes comment and WATER-SOURCES.md):
			// every claim is attributed to FWC or flagged as veteran-guide
			// guidance, the block never masquerades as a measured reading, and it
			// carries the same "check FWC, seasons change" disclaimer.
			'fishing_enabled'   => 1,

			// Uninstall stays conservative unless the owner opts in: the site
			// reinstalls zips routinely, and hand-tuned settings must never be
			// lost to an accidental delete-then-reinstall.
			'delete_on_uninstall' => 0,
		];
	}

	/**
	 * The Harris Chain waters, ids verified live 2026-08-27.
	 *
	 * @return array<int,array<string,string>>
	 */
	public static function default_chain(): array {
		$w = [
			[ '7972', __( 'Lake Dora', 'dcc-wildlife' ), '28.79067', '-81.69114' ],
			[ '7985', __( 'Lake Eustis', 'dcc-wildlife' ), '28.84662', '-81.72718' ],
			[ '7999', __( 'Lake Harris', 'dcc-wildlife' ), '28.77764', '-81.81551' ],
			[ '8099', __( 'Little Lake Harris', 'dcc-wildlife' ), '28.72206', '-81.75587' ],
			[ '7998', __( 'Lake Griffin', 'dcc-wildlife' ), '28.86775', '-81.84831' ],
			[ '7953', __( 'Lake Beauclair', 'dcc-wildlife' ), '28.77345', '-81.66019' ],
			[ '7840', __( 'Lake Carlton', 'dcc-wildlife' ), '28.75970', '-81.65749' ],
			[ '8080', __( 'Lake Yale', 'dcc-wildlife' ), '28.91248', '-81.73657' ],
			[ '1101', __( 'Apopka-Beauclair Canal', 'dcc-wildlife' ), '28.73306', '-81.68444' ],
			[ '1107', __( 'Dead River', 'dcc-wildlife' ), '28.81391', '-81.76456' ],
		];
		$out = [];
		foreach ( $w as [ $id, $name, $lat, $lon ] ) {
			$out[] = [
				'id'   => $id,
				'name' => $name,
				'lat'  => $lat,
				'lon'  => $lon,
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
			$out[] = self::backfill_chain_row(
				[
					'id'   => $id,
					'name' => '' !== $name ? $name : $id,
					'lat'  => is_numeric( $lat ) ? $lat : '',
					'lon'  => is_numeric( $lon ) ? $lon : '',
				]
			);
		}
		return $out;
	}

	/**
	 * Fill a chain row's empty coordinates from the seeded defaults when the
	 * Atlas id matches. Belt-and-braces against the settings-merge hole
	 * (1.8.0, finding 1): a `chain_waters` array stored by an older version
	 * shadows the seeded defaults entirely under wp_parse_args(), so seeded
	 * coordinates added later would otherwise never reach an upgraded site.
	 * Only EMPTY fields are filled — a coordinate the owner typed always wins.
	 *
	 * @param array{id:string,name:string,lat:string,lon:string} $row
	 * @return array{id:string,name:string,lat:string,lon:string}
	 */
	private static function backfill_chain_row( array $row ): array {
		if ( '' !== $row['lat'] && '' !== $row['lon'] ) {
			return $row;
		}
		foreach ( self::default_chain() as $seed ) {
			if ( $seed['id'] === $row['id'] ) {
				if ( '' === $row['lat'] ) {
					$row['lat'] = $seed['lat'];
				}
				if ( '' === $row['lon'] ) {
					$row['lon'] = $seed['lon'];
				}
				break;
			}
		}
		return $row;
	}

	/**
	 * One-time upgrade pass, run by Plugin when the stored version changes.
	 *
	 * Persists what backfill_chain_row() would compute anyway, and drops
	 * stored keys no current code reads — so the option on disk matches what
	 * the code serves, instead of relying on runtime patching forever. Adding
	 * a future migration means adding a step here; the version bump triggers
	 * it on every site automatically.
	 */
	public static function upgrade(): void {
		$stored = get_option( self::OPTION, null );
		if ( ! is_array( $stored ) ) {
			return; // Never saved: defaults already serve, nothing to migrate.
		}

		$changed = false;

		// 1.8.0: seed coordinates into coordinate-less chain rows (finding 1).
		if ( isset( $stored['chain_waters'] ) && is_array( $stored['chain_waters'] ) ) {
			foreach ( $stored['chain_waters'] as $i => $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$filled = self::backfill_chain_row(
					[
						'id'   => (string) ( $row['id'] ?? '' ),
						'name' => (string) ( $row['name'] ?? '' ),
						'lat'  => trim( (string) ( $row['lat'] ?? '' ) ),
						'lon'  => trim( (string) ( $row['lon'] ?? '' ) ),
					]
				);
				if ( $filled['lat'] !== ( $row['lat'] ?? '' ) || $filled['lon'] !== ( $row['lon'] ?? '' ) ) {
					$stored['chain_waters'][ $i ]['lat'] = $filled['lat'];
					$stored['chain_waters'][ $i ]['lon'] = $filled['lon'];
					$changed                             = true;
				}
			}
		}

		// 1.8.0: drop the dead `usgs_sites` list (finding 9).
		if ( array_key_exists( 'usgs_sites', $stored ) ) {
			unset( $stored['usgs_sites'] );
			$changed = true;
		}

		if ( $changed ) {
			update_option( self::OPTION, $stored );
		}
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

	public static function fishing_enabled(): bool {
		return (bool) self::get( 'fishing_enabled' );
	}

	/**
	 * The fishing almanac (v1.11.0), or null when switched off.
	 *
	 * Static, FWC-sourced angling guidance — makes NO network call. Authorised
	 * by the owner on 2026-09-01 as a deliberate expansion of the prior
	 * "fishing is link-only" policy (see the dock-notes comment above and
	 * WATER-SOURCES.md). Every claim is either FWC-official (regs, sportfish,
	 * attractors) or FWC-plus-veteran-guide seasonal guidance, it is rendered
	 * under its own honestly-labelled heading (never as a measured reading),
	 * and it is SEASON-shaped rather than month-shaped so nothing time-specific
	 * is baked into the cached page.
	 *
	 * Regs verified against FWC statewide bag & length limits; sportfish and
	 * fish attractors from the FWC Harris Chain forecast and attractor list;
	 * seasonal patterns from that forecast plus reputable guide reports. The
	 * FWC forecast text rotates through the year, so this stays at season scale.
	 *
	 * @return array<string,mixed>|null
	 */
	public static function fishing(): ?array {
		if ( ! self::fishing_enabled() ) {
			return null;
		}

		/**
		 * Filter the fishing almanac before it renders. Return null to hide it.
		 *
		 * @param array<string,mixed> $data
		 */
		$data = apply_filters( 'dcc_wl_fishing', self::default_fishing() );
		return is_array( $data ) ? $data : null;
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function default_fishing(): array {
		return [
			'intro'            => __( 'Lake Dora and Lake Eustis are two links in the Harris Chain of Lakes — a nationally known trophy-bass fishery that also gives up excellent crappie (speckled perch) and bream. Here is the shape of the year.', 'dcc-wildlife' ),

			// FWC-official reference.
			'sportfish'        => __( 'The headline sportfish are largemouth bass, black crappie (speckled perch), and bream — bluegill and redear (shellcracker); FWC has also stocked sunshine bass. FWC rates Dora and Harris for strong bluegill, and Dora and Griffin for big shellcracker.', 'dcc-wildlife' ),
			'attractors'       => __( 'FWC has sunk eleven “Mossback” brush-pile fish attractors in Lake Dora — offshore cover that pulls in crappie and bream. Their GPS coordinates and a map are on FWC’s Harris Chain attractor list.', 'dcc-wildlife' ),
			'attractors_url'   => 'https://myfwc.com/media/20144/fw-harris-fish-attractors.pdf',
			'attractors_label' => __( 'FWC — Harris Chain fish-attractor list (PDF)', 'dcc-wildlife' ),

			// Season-shaped so nothing month-specific enters cached HTML.
			// bass / crappie / bream lines per season; FWC + veteran-guide.
			'seasons'          => [
				[
					'name'    => __( 'Winter · Dec–Feb', 'dcc-wildlife' ),
					'bass'    => __( 'Pre-spawn — the big females stage on deep hydrilla edges. Work speed worms and crankbaits, and flip the back canals on the warmer afternoons.', 'dcc-wildlife' ),
					'crappie' => __( 'The year’s best. Drift the open water and channel edges with minnows or small jigs; the February full moon fires them up (FWC).', 'dcc-wildlife' ),
					'bream'   => __( 'Slow in the cold — not a target now.', 'dcc-wildlife' ),
				],
				[
					'name'    => __( 'Spring · Mar–May', 'dcc-wildlife' ),
					'bass'    => __( 'The spawn — bass move shallow into the canals and grassy flats. Live shiners, soft plastics, and flipping jigs.', 'dcc-wildlife' ),
					'crappie' => __( 'Still strong on the March full moon, then tapering as the water warms.', 'dcc-wildlife' ),
					'bream'   => __( 'The bite opens up: redear (shellcracker) on the March–April full moons, bluegill close behind. Worms and crickets on shallow sandy beds (FWC).', 'dcc-wildlife' ),
				],
				[
					'name'    => __( 'Summer · Jun–Aug', 'dcc-wildlife' ),
					'bass'    => __( 'Beat the heat: fish dawn and dusk with frogs over the pads, and deep-diving crankbaits on the offshore hydrilla and the fish attractors (FWC).', 'dcc-wildlife' ),
					'crappie' => __( 'Slow by day — look for a night bite in deeper water.', 'dcc-wildlife' ),
					'bream'   => __( 'Prime and dependable — bedding on the full moons all summer. A great month for kids, with crickets and worms (FWC).', 'dcc-wildlife' ),
				],
				[
					'name'    => __( 'Fall · Sep–Nov', 'dcc-wildlife' ),
					'bass'    => __( 'The fall feed-up — bass chase shad shallow. Cover water with crankbaits, spinnerbaits, and topwater.', 'dcc-wildlife' ),
					'crappie' => __( 'Turning back on as the water cools, ramping toward the winter peak.', 'dcc-wildlife' ),
					'bream'   => __( 'Fading with the first cool fronts.', 'dcc-wildlife' ),
				],
			],

			'moon'             => __( 'Bream bed on the full moon — FWC times redear to the March–April full moons and bluegill through the summer moons — and crappie spawning peaks on the February and March full moons. Broader “solunar” bite-time tables are angler tradition, not FWC science: water temperature, cold fronts, and plain old dawn and dusk are what actually move fish.', 'dcc-wildlife' ),

			// FWC statewide limits (verified against the FWC page).
			'regs'             => [
				[ __( 'Largemouth bass', 'dcc-wildlife' ), __( '5 per day — only one may be 16″ or longer; no minimum size', 'dcc-wildlife' ) ],
				[ __( 'Black crappie (specks)', 'dcc-wildlife' ), __( '25 per day — no size limit', 'dcc-wildlife' ) ],
				[ __( 'Panfish (bluegill, shellcracker…)', 'dcc-wildlife' ), __( '50 per day, in total', 'dcc-wildlife' ) ],
				[ __( 'Sunshine / striped / white bass', 'dcc-wildlife' ), __( '20 per day — only 6 may be 24″ or longer', 'dcc-wildlife' ) ],
				[ __( 'Catfish, gar, bowfin, pickerel', 'dcc-wildlife' ), __( 'No statewide bag or size limit', 'dcc-wildlife' ) ],
			],
			'regs_url'         => 'https://myfwc.com/fishing/freshwater/regulations/general/',
			'regs_label'       => __( 'FWC — statewide bag & length limits', 'dcc-wildlife' ),
			'license'          => __( 'Anglers 16 and older need a Florida freshwater fishing licence (some exemptions — under-16, resident seniors 65+, free-fishing days).', 'dcc-wildlife' ),
			'license_url'      => 'https://myfwc.com/license/recreational/do-i-need-one/',

			'forecast_url'     => 'https://myfwc.com/fishing/freshwater/sites-forecasts/ne/lake-harris/',
			'forecast_label'   => __( 'FWC — Harris Chain fishing forecast', 'dcc-wildlife' ),
			'source'           => __( 'Limits, sportfish and attractors from Florida FWC; seasonal patterns from FWC’s Harris Chain forecast and veteran-guide reports. The FWC forecast updates through the year — always check the FWC before you keep a fish.', 'dcc-wildlife' ),
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

	public static function map_sat_url(): string {
		$v = trim( (string) self::get( 'map_sat_url' ) );
		return preg_match( '#^https://#i', $v ) ? $v : '';
	}

	/** 'satellite' or 'streets'. Falls back to whichever layer exists. */
	public static function map_default_layer(): string {
		$v = 'streets' === (string) self::get( 'map_default_layer' ) ? 'streets' : 'satellite';
		if ( 'satellite' === $v && '' === self::map_sat_url() ) {
			return 'streets';
		}
		if ( 'streets' === $v && '' === self::map_tile_url() ) {
			return '' !== self::map_sat_url() ? 'satellite' : 'streets';
		}
		return $v;
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
			&& ( '' !== self::map_tile_url() || '' !== self::map_sat_url() );
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
