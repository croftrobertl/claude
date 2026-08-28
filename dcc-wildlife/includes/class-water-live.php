<?php
/**
 * Water module — the optional live-conditions layer.
 *
 * WHY THIS LAYER IS TRUSTWORTHY: it never states a number this plugin's
 * author chose. Each reading arrives from the upstream API together with
 * its own station name, units and measurement timestamp, and those are what
 * get rendered. The code is a parser, not a source.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WATER TEMPERATURE IS DELIBERATELY ABSENT. DO NOT ADD IT BACK.
 *
 * There is no USGS `00010` series on this water. The two nearest active
 * ones (Rock Springs ~15 mi, Wekiwa Springs ~18 mi) are SPRINGS, which
 * discharge at a nearly constant ~72 °F year round, while the canal is
 * shallow surface water swinging from the fifties to near ninety. Since
 * water temperature is the single value that drives bass behaviour, a
 * spring reading would be confidently wrong in the direction that matters
 * most — reading 72 °F in January and 72 °F in August, telling an angler
 * the opposite of the truth in both. Disclosing the distance does not
 * rescue it.
 *
 * If a thermometer ever goes on the dock, it enters as a dated OWNER
 * OBSERVATION, never as a gauge reading.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Cache safety: SpeedyCache serves this site's HTML for hours, so nothing
 * time-sensitive may be rendered by PHP into the page. Everything here is
 * fetched server-side into a transient and served through the REST route,
 * which the browser calls after the cached shell has painted.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Water_Live {

	private const CACHE_KEY = 'dcc_wl_water_cond';
	private const LOCK_KEY  = 'dcc_wl_water_lock';
	private const FAIL_KEY  = 'dcc_wl_water_fail';
	private const DV_KEY    = 'dcc_wl_water_dv_';

	/**
	 * Staleness guards. USGS leaves dead series published — 02238000's flow
	 * has been offline for maintenance since 2026-03-03 — and a value whose
	 * timestamp is five months old must never render as a current condition.
	 */
	private const STALE_RAIN_DAYS = 3;    // Daily totals; allow for reporting lag.
	private const TTL_DV          = 86400; // USGS daily values change once a day.

	/**
	 * Water Atlas values move monthly, not by the minute, and it is an
	 * academic API — so cache hard and never poll.
	 */
	private const TTL_ATLAS = 21600; // 6 h.

	/**
	 * A continuous SJRWMD hydro station should report near-daily; 45 days
	 * without a sample means the station is down, not that the lake has not
	 * moved, so the deviation is withheld rather than computed from a stale
	 * reading. Lab samples (Secchi, DO, TSI) run monthly to quarterly and
	 * are shown with their sample date regardless, up to a one-year backstop.
	 */
	private const LEVEL_MAX_AGE_DAYS = 45;
	private const ATLAS_MAX_AGE_DAYS = 365;

	/**
	 * Below this the level line stays silent. A lake sitting an inch off its
	 * monthly norm has nothing to tell an angler, and printing "about normal"
	 * every day trains guests to stop reading the section.
	 */
	private const LEVEL_SILENT_INCHES = 2;

	/**
	 * Uncached Atlas requests allowed per background refresh pass.
	 *
	 * The chain can now hold twenty-odd waters, which is 40+ report fetches
	 * on a cold cache. The background pass deliberately trickles: uncached
	 * waters fill in over successive passes rather than bursting at an
	 * academic API, and a water with nothing cached yet simply does not
	 * appear until it does. Everything is cached for six hours after that.
	 */
	private const ATLAS_FETCH_BUDGET = 8;

	/** Ceiling on the larger budget an explicit map open is allowed. */
	private const MAP_FETCH_CEILING = 30;

	/** FWC's ramp inventory is effectively static: cache it for a week. */
	private const TTL_RAMPS = 604800;

	private static int $fetch_budget = self::ATLAS_FETCH_BUDGET;

	/**
	 * Secchi comparison thresholds against the period-of-record median.
	 * Deliberately wide: the clause only appears when the difference is
	 * unmistakable, so a middling reading gets no editorial spin.
	 */
	private const SECCHI_CLEARER = 1.5;
	private const SECCHI_MURKIER = 0.67;

	private static function user_agent(): string {
		return sprintf( 'DCC-Wildlife-WordPress/%s (%s)', DCC_WL_VERSION, home_url( '/' ) );
	}

	/**
	 * @return array{facts:array<int,array<string,string>>,fetched:string}
	 */
	public static function conditions(): array {
		$empty = [
			'facts'   => [],
			'fetched' => '',
		];

		if ( ! Water_Data::live_enabled() ) {
			return $empty;
		}

		$cached = get_transient( self::CACHE_KEY );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		if ( get_transient( self::FAIL_KEY ) || get_transient( self::LOCK_KEY ) ) {
			return $empty;
		}

		set_transient( self::LOCK_KEY, 1, 30 );
		$result = self::refresh();
		delete_transient( self::LOCK_KEY );

		return $result;
	}

	/**
	 * @return array{facts:array<int,array<string,string>>,fetched:string}
	 */
	public static function refresh(): array {
		self::$fetch_budget = self::ATLAS_FETCH_BUDGET;

		$rows = array_merge(
			self::fetch_atlas(),
			self::chain_clarity(),
			self::fetch_rainfall(),
			self::fetch_nws()
		);

		$gated = [];
		foreach ( Water_Fact::collect( $rows ) as $fact ) {
			$gated[] = $fact->to_array();
		}

		$payload = [
			'facts'   => $gated,
			'fetched' => gmdate( 'c' ),
		];

		if ( $gated ) {
			set_transient( self::CACHE_KEY, $payload, (int) min( Water_Data::TTL_USGS, Water_Data::TTL_NWS ) );
		} else {
			set_transient( self::FAIL_KEY, 1, Water_Data::TTL_FAIL );
		}

		return $payload;
	}

	/* =====================================================================
	 * Lake County Water Atlas — level, clarity, DO, TSI, bathymetry.
	 *
	 * Resolved against the live API on 2026-08-27. Two earlier assumptions
	 * were wrong and are recorded here so they are not repeated:
	 *
	 *   1. There is NO `/api/` path prefix. The bare
	 *      `/waterbodies/{id}/{report}` path is correct.
	 *   2. The API key is the Water Atlas WATERBODY ID (Lake Dora = 7972),
	 *      NOT the FDEP WBID (2831B), which is a different identifier
	 *      entirely and 404s here.
	 *
	 * Also: `s` is an integer Site Id (`s=1`); `s=lake` returns 400 and
	 * omitting it 404s. And `WaterClarity?siteID=` is the wrong endpoint —
	 * it is an annual report carrying colour/chlorophyll/turbidity and no
	 * Secchi at all. Do not reintroduce it.
	 * ===================================================================== */

	/**
	 * @return array<int,array<string,mixed>>
	 */
	private static function fetch_atlas(): array {
		$wq = self::atlas_report( 'WaterQuality' );
		$lf = self::atlas_report( 'LevelsFlows' );

		return array_merge(
			self::atlas_level( $lf ),
			self::atlas_secchi( $wq ),
			self::atlas_dissolved_oxygen( $wq ),
			self::atlas_tsi( $wq ),
			self::atlas_bathymetry( $lf )
		);
	}

	/**
	 * One cached report fetch. Returns null on any failure.
	 *
	 * @return array<mixed>|null
	 */
	private static function atlas_report( string $report, string $waterbody = '' ): ?array {
		$base      = Water_Data::atlas_base();
		$waterbody = '' !== $waterbody ? $waterbody : Water_Data::primary_water();
		$site      = Water_Data::atlas_site();
		if ( '' === $base || '' === $waterbody ) {
			return null;
		}

		$key    = 'dcc_wl_atlas_' . md5( $base . $waterbody . $site . $report );
		$cached = get_transient( $key );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		if ( 'MISS' === $cached ) {
			return null; // Recent failure; do not re-hit an academic API.
		}

		$url = sprintf(
			'%s/waterbodies/%s/%s?s=%s',
			untrailingslashit( $base ),
			rawurlencode( $waterbody ),
			rawurlencode( $report ),
			rawurlencode( $site )
		);

		// Chain-wide means up to 20 requests on a cold cache. Fetch at most a
		// few uncached waters per refresh so the chain warms up over a couple
		// of passes instead of hammering an academic API in one burst.
		if ( self::$fetch_budget <= 0 ) {
			return null;
		}
		--self::$fetch_budget;

		$body = self::get_json( $url );
		if ( ! is_array( $body ) ) {
			set_transient( $key, 'MISS', Water_Data::TTL_FAIL );
			return null;
		}

		set_transient( $key, $body, self::TTL_ATLAS );
		return $body;
	}

	/* =====================================================================
	 * Chain-wide: each water against ITS OWN record.
	 * ===================================================================== */

	/**
	 * Clarity for every configured water, compared with that water's own
	 * long-run median.
	 *
	 * This is the view that needs no local knowledge and that a visiting
	 * angler can actually act on: Eustis unusually clear at 4.27 against its
	 * own 2.30, Harris sitting exactly at its median, Yale well below its
	 * own. Every number is the Atlas's, and each comparison is against the
	 * right baseline — a chain-wide average would be meaningless when the
	 * medians range from 1.21 to 2.80.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private static function chain_clarity(): array {
		$waters = Water_Data::chain_waters();
		if ( count( $waters ) < 2 ) {
			return []; // Nothing to compare against.
		}

		$rows = [];
		foreach ( $waters as $w ) {
			$c = self::find_component(
				self::atlas_report( 'WaterQuality', $w['id'] ),
				static fn( string $n ): bool => false !== strpos( $n, 'secchi' )
			);
			if ( null === $c || ! is_numeric( $c['value'] ?? null ) ) {
				continue;
			}

			$date = self::comp_str( $c, 'sampleDate' );
			$age  = self::comp_age_days( $date );
			if ( null === $age || $age > self::ATLAS_MAX_AGE_DAYS ) {
				continue;
			}

			$units   = self::comp_str( $c, 'units' );
			$current = (float) $c['value'];
			$hist    = ( isset( $c['historic'] ) && is_array( $c['historic'] ) ) ? $c['historic'] : [];
			$med     = $hist['medValue'] ?? null;
			if ( ! is_numeric( $med ) || (float) $med <= 0 ) {
				continue; // No baseline for this water: no comparison to make.
			}

			$ratio = $current / (float) $med;
			if ( $ratio >= self::SECCHI_CLEARER ) {
				$verdict = __( 'clearer than usual for this water', 'dcc-wildlife' );
			} elseif ( $ratio <= self::SECCHI_MURKIER ) {
				$verdict = __( 'murkier than usual for this water', 'dcc-wildlife' );
			} else {
				$verdict = __( 'about usual for this water', 'dcc-wildlife' );
			}

			$rows[] = [
				'label'       => $w['name'],
				'value'       => sprintf(
					/* translators: 1: current reading, 2: verdict, 3: this water's median. */
					__( '%1$s — %2$s (its median is %3$s)', 'dcc-wildlife' ),
					self::fmt_measure( $current, $c['precision'] ?? null, $units ),
					$verdict,
					self::fmt_measure( $med, 2, $units )
				),
				'tier'        => Water_Fact::TIER_PUBLISHED,
				'source_name' => self::atlas_source_name( $c, __( 'Lake County Water Atlas', 'dcc-wildlife' ) ),
				'source_url'  => self::station_url( $c ),
				'date'        => $date,
				'date_label'  => __( 'sampled', 'dcc-wildlife' ),
				'date_precision' => 'day',
				'note'        => '',
				'group'       => 'chain',
				'_ratio'      => $ratio,
			];
		}

		// Clearest relative to its own normal first — the ordering someone
		// choosing a lake this week would want. Ordering, not a claim.
		usort( $rows, static fn( array $a, array $b ): int => $b['_ratio'] <=> $a['_ratio'] );

		return $rows;
	}

	/**
	 * Everything the map draws, assembled from the SAME cached readings the
	 * text uses — so the map can never disagree with the page above it.
	 *
	 * A water with no coordinates is still returned (its readings are real)
	 * but carries lat/lon null, and the map simply does not place it. The
	 * owner's capture did not include waterbody coordinates, so none are
	 * invented here; the Atlas payload is scanned for them and the admin
	 * screen lets him enter any that are missing.
	 *
	 * @return array<string,mixed>
	 */
	public static function map_data(): array {
		$chain = Water_Data::chain_waters();

		// The background conditions refresh trickles a few uncached waters
		// per pass so an academic API never sees a burst. Opening the map is
		// different: it is explicit, rare, and its answer is cached for
		// hours, so it gets a budget sized to the chain (two reports each)
		// rather than being starved into a half-drawn map.
		self::$fetch_budget = (int) min( self::MAP_FETCH_CEILING, ( count( $chain ) * 2 ) + 2 );

		$waters = [];
		foreach ( $chain as $w ) {
			$wq = self::atlas_report( 'WaterQuality', $w['id'] );
			$lf = self::atlas_report( 'LevelsFlows', $w['id'] );

			$entry = [
				'id'      => $w['id'],
				'name'    => $w['name'],
				'lat'     => '' !== $w['lat'] ? (float) $w['lat'] : null,
				'lon'     => '' !== $w['lon'] ? (float) $w['lon'] : null,
				'clarity' => null,
				'level'   => null,
				'depthMap'=> null,
				'ageDays' => null,
			];

			$sec = self::find_component( $wq, static fn( string $n ): bool => false !== strpos( $n, 'secchi' ) );
			if ( null !== $sec && is_numeric( $sec['value'] ?? null ) ) {
				$hist = ( isset( $sec['historic'] ) && is_array( $sec['historic'] ) ) ? $sec['historic'] : [];
				$med  = $hist['medValue'] ?? null;
				$date = self::comp_str( $sec, 'sampleDate' );
				$age  = self::comp_age_days( $date );
				$entry['clarity'] = [
					'value'  => (float) $sec['value'],
					'units'  => self::comp_str( $sec, 'units' ),
					'median' => is_numeric( $med ) ? (float) $med : null,
					'ratio'  => ( is_numeric( $med ) && (float) $med > 0 ) ? (float) $sec['value'] / (float) $med : null,
					'date'   => $date,
					'age'    => null !== $age ? (int) floor( $age ) : null,
					'station'=> self::comp_str( $sec, 'stationId' ),
					'url'    => self::station_url( $sec ),
				];
				$entry['ageDays'] = null !== $age ? (int) floor( $age ) : null;
				if ( null === $entry['lat'] ) {
					$geo = self::coords_in( $sec );
					if ( null !== $geo ) {
						$entry['lat'] = $geo[0];
						$entry['lon'] = $geo[1];
					}
				}
			}

			$lvl = self::find_component( $lf, static fn( string $n ): bool => 'water levels' === $n );
			if ( null !== $lvl && is_numeric( $lvl['value'] ?? null ) ) {
				$avg  = ( isset( $lvl['historicAverageForMonth'] ) && is_array( $lvl['historicAverageForMonth'] ) )
					? $lvl['historicAverageForMonth'] : [];
				$norm = $avg['norm'] ?? null;
				$date = self::comp_str( $lvl, 'sampleDate' );
				$age  = self::comp_age_days( $date );
				$entry['level'] = [
					'value'  => (float) $lvl['value'],
					'units'  => self::comp_str( $lvl, 'units' ),
					'datum'  => self::comp_str( $lvl, 'verticalDatum' ),
					'norm'   => is_numeric( $norm ) ? (float) $norm : null,
					// Per-water staleness: Griffin's level is from 2008 and
					// Yale's from 2025. Neither may read as current, so the
					// age travels with the reading and the map greys it.
					'inches' => is_numeric( $norm ) ? round( ( (float) $lvl['value'] - (float) $norm ) * 12, 1 ) : null,
					'date'   => $date,
					'age'    => null !== $age ? (int) floor( $age ) : null,
					'stale'  => ( null === $age || $age > self::LEVEL_MAX_AGE_DAYS ),
					'station'=> self::comp_str( $lvl, 'stationId' ),
					'url'    => self::station_url( $lvl ),
				];
				if ( null === $entry['lat'] ) {
					$geo = self::coords_in( $lvl );
					if ( null !== $geo ) {
						$entry['lat'] = $geo[0];
						$entry['lon'] = $geo[1];
					}
				}
			}

			foreach ( self::atlas_bathymetry( $lf ) as $b ) {
				$entry['depthMap'] = [
					'url'  => $b['source_url'],
					'date' => $b['date'],
				];
			}

			if ( null !== $entry['lat'] ) {
				$entry['miles'] = self::miles_from_property( $entry['lat'], $entry['lon'] );
			}

			$waters[] = $entry;
		}

		$property = Water_Data::coords();

		return [
			'waters'   => $waters,
			'ramps'    => self::fwc_ramps(),
			'property' => null !== $property ? [ 'lat' => $property['lat'], 'lon' => $property['lon'] ] : null,
			'levelMaxAgeDays' => self::LEVEL_MAX_AGE_DAYS,
		];
	}

	/**
	 * Latitude/longitude anywhere inside a component, or null.
	 *
	 * @param array<mixed> $node
	 * @return array{0:float,1:float}|null
	 */
	private static function coords_in( array $node ): ?array {
		$queue = [ $node ];
		while ( $queue ) {
			$cur = array_shift( $queue );
			if ( ! is_array( $cur ) ) {
				continue;
			}
			$lat = null;
			$lon = null;
			foreach ( $cur as $k => $v ) {
				if ( is_array( $v ) ) {
					$queue[] = $v;
					continue;
				}
				$key = strtolower( (string) $k );
				if ( is_numeric( $v ) && in_array( $key, [ 'latitude', 'lat' ], true ) ) {
					$lat = (float) $v;
				}
				if ( is_numeric( $v ) && in_array( $key, [ 'longitude', 'lon', 'lng' ], true ) ) {
					$lon = (float) $v;
				}
			}
			if ( null !== $lat && null !== $lon && abs( $lat ) <= 90 && abs( $lon ) <= 180 && ( 0.0 !== $lat || 0.0 !== $lon ) ) {
				return [ $lat, $lon ];
			}
		}
		return null;
	}

	/* =====================================================================
	 * FWC boat ramps
	 * ===================================================================== */

	/**
	 * Lake County ramps from FWC's public ArcGIS inventory.
	 *
	 * Paginated: the layer sets `exceededTransferLimit`, and there are 35+
	 * in Lake County. `Status` is carried through and honoured by the map —
	 * sending a guest with a loaded trailer to a closed ramp is exactly the
	 * kind of error this module exists to prevent.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function fwc_ramps(): array {
		if ( ! Water_Data::map_ramps_enabled() ) {
			return [];
		}

		$key    = 'dcc_wl_ramps';
		$cached = get_transient( $key );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		if ( 'MISS' === $cached ) {
			return [];
		}

		$base   = 'https://gis.myfwc.com/mapping/rest/services/Open_Data/FWC_Florida_Boat_Ramp_Inventory/MapServer/4/query';
		$fields = 'RampName,WaterBodyName,City,TotalLanes,isFeeRequired,RestroomType,Status,Latitude,Longitude';
		$out    = [];
		$offset = 0;

		// Hard page cap: a runaway loop against a public GIS service is
		// worse than an incomplete list.
		for ( $page = 0; $page < 5; $page++ ) {
			$body = self::get_json(
				add_query_arg(
					[
						'where'             => "County='Lake'",
						'outFields'         => $fields,
						'returnGeometry'    => 'false',
						'f'                 => 'json',
						'resultOffset'      => $offset,
						'resultRecordCount' => 1000,
					],
					$base
				)
			);
			if ( ! is_array( $body ) || ! isset( $body['features'] ) || ! is_array( $body['features'] ) ) {
				break;
			}

			foreach ( $body['features'] as $feature ) {
				$a = ( is_array( $feature ) && isset( $feature['attributes'] ) && is_array( $feature['attributes'] ) )
					? $feature['attributes']
					: null;
				if ( null === $a ) {
					continue;
				}
				$lat = $a['Latitude'] ?? null;
				$lon = $a['Longitude'] ?? null;
				if ( ! is_numeric( $lat ) || ! is_numeric( $lon ) ) {
					continue; // Cannot place it, so do not claim it.
				}
				$out[] = [
					'name'    => sanitize_text_field( (string) ( $a['RampName'] ?? '' ) ),
					'water'   => sanitize_text_field( (string) ( $a['WaterBodyName'] ?? '' ) ),
					'city'    => sanitize_text_field( (string) ( $a['City'] ?? '' ) ),
					'lanes'   => is_numeric( $a['TotalLanes'] ?? null ) ? (int) $a['TotalLanes'] : null,
					'fee'     => sanitize_text_field( (string) ( $a['isFeeRequired'] ?? '' ) ),
					'restroom'=> sanitize_text_field( (string) ( $a['RestroomType'] ?? '' ) ),
					'status'  => sanitize_text_field( (string) ( $a['Status'] ?? '' ) ),
					'lat'     => (float) $lat,
					'lon'     => (float) $lon,
					'miles'   => self::miles_from_property( (float) $lat, (float) $lon ),
				];
			}

			if ( empty( $body['exceededTransferLimit'] ) ) {
				break;
			}
			$offset += 1000;
		}

		if ( ! $out ) {
			set_transient( $key, 'MISS', Water_Data::TTL_FAIL );
			return [];
		}

		set_transient( $key, $out, self::TTL_RAMPS );
		return $out;
	}

	/**
	 * Straight-line miles from the cottages. Deliberately NOT drive time,
	 * which cannot be sourced from coordinates.
	 */
	private static function miles_from_property( float $lat, float $lon ): ?float {
		$c = Water_Data::coords();
		if ( null === $c ) {
			return null;
		}
		$r  = 3958.7613;
		$dl = deg2rad( $lat - $c['lat'] );
		$dg = deg2rad( $lon - $c['lon'] );
		$a  = sin( $dl / 2 ) ** 2 + cos( deg2rad( $c['lat'] ) ) * cos( deg2rad( $lat ) ) * sin( $dg / 2 ) ** 2;
		return round( $r * 2 * atan2( sqrt( $a ), sqrt( 1 - $a ) ), 1 );
	}

	/**
	 * Admin-only: find Harris Chain waters the Atlas knows about.
	 *
	 * `closest` is the endpoint that works — `search/waterbodies` returns 500
	 * — and its `len` caps at 20. Twenty nearest to the property is not the
	 * whole chain, so this SWEEPS: it queries from the property and from
	 * each already-configured water, then unions and dedupes the results.
	 * Waters at the far ends of the chain turn up in a sweep centred on
	 * their own neighbourhood even when they fall outside the property's
	 * own twenty.
	 *
	 * Nothing is added automatically. Candidates are returned with their
	 * name, Atlas id, coordinates and distance so the owner picks — the
	 * endpoint returns whatever is nearest, which includes ponds and
	 * unrelated water that are not part of the chain.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function discover_waters(): array {
		$base = Water_Data::atlas_base();
		if ( '' === $base ) {
			return [];
		}

		$cached = get_transient( 'dcc_wl_water_discovery' );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$site   = Water_Data::atlas_site();
		$chain  = Water_Data::chain_waters();
		$known  = [];
		foreach ( $chain as $w ) {
			$known[ $w['id'] ] = true;
		}

		// Sweep points: the property, then each configured water that has
		// coordinates. Capped so a big chain cannot cause a request storm.
		$points = [];
		$coords = Water_Data::coords();
		if ( null !== $coords ) {
			$points[] = [ $coords['lat'], $coords['lon'] ];
		}
		foreach ( $chain as $w ) {
			if ( '' !== $w['lat'] && '' !== $w['lon'] ) {
				$points[] = [ (float) $w['lat'], (float) $w['lon'] ];
			}
			if ( count( $points ) >= 8 ) {
				break;
			}
		}
		if ( ! $points ) {
			return [];
		}

		$found = [];
		foreach ( $points as $pt ) {
			$body = self::get_json(
				sprintf(
					'%s/waterbodies/closest?lat=%s&lng=%s&len=20&s=%s',
					untrailingslashit( $base ),
					rawurlencode( (string) round( $pt[0], 5 ) ),
					rawurlencode( (string) round( $pt[1], 5 ) ),
					rawurlencode( $site )
				)
			);
			if ( ! is_array( $body ) ) {
				continue;
			}
			foreach ( self::parse_waterbodies( $body ) as $wb ) {
				if ( isset( $known[ $wb['id'] ] ) || isset( $found[ $wb['id'] ] ) ) {
					continue;
				}
				$wb['miles']       = self::miles_from_property( $wb['lat'], $wb['lon'] );
				$found[ $wb['id'] ] = $wb;
			}
		}

		$out = array_values( $found );
		usort(
			$out,
			static function ( array $a, array $b ): int {
				$am = null === $a['miles'] ? PHP_INT_MAX : $a['miles'];
				$bm = null === $b['miles'] ? PHP_INT_MAX : $b['miles'];
				return $am <=> $bm;
			}
		);

		set_transient( 'dcc_wl_water_discovery', $out, DAY_IN_SECONDS );
		return $out;
	}

	/**
	 * Pull {id, name, lat, lon} waterbodies out of a `closest` response.
	 *
	 * Shape-tolerant, like the rest of the Atlas parsing: the owner's
	 * capture confirmed a `Waterbody.Location` structure but not the
	 * surrounding envelope, so this walks the tree for nodes carrying a
	 * numeric id, a name and coordinates together, and ignores everything
	 * else rather than guessing.
	 *
	 * @param array<mixed> $body
	 * @return array<int,array<string,mixed>>
	 */
	private static function parse_waterbodies( array $body ): array {
		$out   = [];
		$queue = [ $body ];

		while ( $queue ) {
			$node = array_shift( $queue );
			if ( ! is_array( $node ) ) {
				continue;
			}

			$id   = '';
			$name = '';
			foreach ( $node as $k => $v ) {
				if ( is_array( $v ) ) {
					$queue[] = $v;
					continue;
				}
				$key = strtolower( preg_replace( '/[^a-z]/i', '', (string) $k ) );
				if ( '' === $id && in_array( $key, [ 'waterbodyid', 'wbid', 'id' ], true )
					&& is_numeric( $v ) && (int) $v > 0 ) {
					$id = (string) (int) $v;
				}
				if ( '' === $name && in_array( $key, [ 'waterbodyname', 'name', 'title' ], true )
					&& is_string( $v ) && '' !== trim( $v ) ) {
					$name = trim( $v );
				}
			}

			if ( '' === $id || '' === $name ) {
				continue;
			}
			$geo = self::coords_in( $node );
			if ( null === $geo ) {
				continue; // No coordinates: cannot place it, so do not offer it.
			}

			$out[] = [
				'id'   => $id,
				'name' => sanitize_text_field( $name ),
				'lat'  => $geo[0],
				'lon'  => $geo[1],
			];
		}

		return $out;
	}

	/**
	 * Admin-only probe: call both Water Atlas reports and report which
	 * components were recognised, so the integration is confirmed from the
	 * live server rather than taken on trust.
	 *
	 * @return array<string,mixed>
	 */
	public static function probe_atlas(): array {
		$wq = self::atlas_report( 'WaterQuality' );
		$lf = self::atlas_report( 'LevelsFlows' );

		if ( null === $wq && null === $lf ) {
			return [
				'ok'     => false,
				'reason' => __( 'Neither report could be fetched. Check the base URL, the waterbody id and the site id.', 'dcc-wildlife' ),
			];
		}

		$found = [];
		foreach ( self::fetch_atlas() as $row ) {
			$found[] = [
				'label' => (string) ( $row['label'] ?? '' ),
				'value' => (string) ( $row['value'] ?? '' ),
				'date'  => (string) ( $row['date'] ?? '' ),
			];
		}

		return [
			'ok'           => true,
			'waterQuality' => null !== $wq,
			'levelsFlows'  => null !== $lf,
			'found'        => $found,
		];
	}

	/**
	 * Breadth-first search for a named component, returning its PAYLOAD.
	 *
	 * BFS is deliberate: the shallowest match is the component itself, so a
	 * nested `historic` sub-block carrying the same parameter name can never
	 * be mistaken for the current reading.
	 *
	 * THE ENVELOPE (fixed 1.7.0 — this bug shipped in 1.6.0). The Atlas wraps
	 * every reading as:
	 *
	 *   { name, payloadType, payload: { value, sampleDate, units, precision,
	 *     historic, ... }, section, sortOrder }
	 *
	 * The WRAPPER carries the name this matcher matches on; the PAYLOAD
	 * carries the data. 1.6.0 returned the wrapper, so `value`, `sampleDate`
	 * and `units` were all null, every reading failed its age check and was
	 * silently dropped — while probe_atlas() still reported both endpoints
	 * healthy, because they were. Exactly the class of bug an offline build
	 * cannot see.
	 *
	 * Bathymetry's payload is a LIST of maps rather than one reading, so a
	 * list payload keeps the wrapper and lets the caller walk it.
	 *
	 * @param array<mixed>|null $body
	 * @return array<string,mixed>|null
	 */
	private static function find_component( ?array $body, callable $matches ): ?array {
		if ( null === $body ) {
			return null;
		}

		$queue = [ $body ];
		while ( $queue ) {
			$node = array_shift( $queue );
			if ( ! is_array( $node ) ) {
				continue;
			}

			$name = '';
			foreach ( [ 'displayName', 'parameter', 'componentName', 'name' ] as $k ) {
				if ( isset( $node[ $k ] ) && is_string( $node[ $k ] ) && '' !== trim( $node[ $k ] ) ) {
					$name = strtolower( trim( $node[ $k ] ) );
					break;
				}
			}
			if ( '' !== $name && $matches( $name ) ) {
				return self::unwrap_payload( $node );
			}

			foreach ( $node as $child ) {
				if ( is_array( $child ) ) {
					$queue[] = $child;
				}
			}
		}

		return null;
	}

	/**
	 * Return a component's associative `payload`, or the node itself when
	 * there is no payload or the payload is a list (Bathymetry).
	 *
	 * @param array<string,mixed> $node
	 * @return array<string,mixed>
	 */
	private static function unwrap_payload( array $node ): array {
		if ( ! isset( $node['payload'] ) || ! is_array( $node['payload'] ) ) {
			return $node;
		}
		if ( self::is_list( $node['payload'] ) ) {
			return $node; // A list of maps — the caller walks it.
		}
		// Keep the wrapper's identity keys available to the caller.
		return $node['payload'] + array_diff_key( $node, [ 'payload' => 1 ] );
	}

	/**
	 * array_is_list() is PHP 8.1+, and this plugin supports 8.0.
	 *
	 * @param array<mixed> $a
	 */
	private static function is_list( array $a ): bool {
		if ( function_exists( 'array_is_list' ) ) {
			return array_is_list( $a );
		}
		$i = 0;
		foreach ( $a as $k => $_ ) {
			if ( $k !== $i++ ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Format a measurement using the units and precision the API supplied.
	 * Neither is ever assumed: an absent precision means the value is
	 * printed as given rather than rounded to a guess.
	 *
	 * @param mixed $value
	 * @param mixed $precision
	 */
	private static function fmt_measure( $value, $precision, string $units ): string {
		if ( ! is_numeric( $value ) ) {
			return '';
		}
		if ( is_numeric( $precision ) && $precision >= 0 && $precision <= 6 ) {
			$out = number_format( (float) $value, (int) $precision, '.', '' );
		} else {
			$out = rtrim( rtrim( number_format( (float) $value, 4, '.', '' ), '0' ), '.' );
		}
		return '' !== $units ? $out . ' ' . $units : $out;
	}

	/**
	 * @param array<string,mixed> $c
	 */
	private static function comp_str( array $c, string $key ): string {
		return isset( $c[ $key ] ) && is_scalar( $c[ $key ] ) ? trim( (string) $c[ $key ] ) : '';
	}

	/**
	 * Age in days of a component's sample, or null when undatable.
	 */
	private static function comp_age_days( string $date ): ?float {
		if ( '' === $date ) {
			return null;
		}
		$ts = strtotime( $date );
		if ( false === $ts ) {
			return null;
		}
		return ( time() - $ts ) / DAY_IN_SECONDS;
	}

	/**
	 * @param array<string,mixed> $c
	 */
	private static function station_url( array $c ): string {
		$url = '';
		if ( isset( $c['samplingStation'] ) && is_array( $c['samplingStation'] ) ) {
			$url = trim( (string) ( $c['samplingStation']['stationUrl'] ?? '' ) );
		}
		if ( '' === $url ) {
			$url = Water_Data::clarity_link();
		}
		return esc_url_raw( $url );
	}

	/**
	 * Water level, from SJRWMD station 30013010 — which is ON Lake Dora,
	 * unlike the USGS gauges this replaced.
	 *
	 * The headline is a deviation. 61.19 ft is an elevation above NAVD88 and
	 * a guest reads that as depth; that is the exact trap the USGS gauges
	 * were dropped for, and the atlas station is no different.
	 *
	 * The baseline is `historicAverageForMonth.norm` and NOTHING ELSE. The
	 * component's outer `historic` block is unreliable for this parameter —
	 * its minValue is 0, impossible for a lake sitting at 61 ft NAVD88, and
	 * its medValue is null. (Secchi's `historic` block IS sound and is used;
	 * the difference is per-parameter, not a rule about the API.)
	 *
	 * @param array<mixed>|null $lf
	 * @return array<int,array<string,mixed>>
	 */
	private static function atlas_level( ?array $lf ): array {
		$c = self::find_component( $lf, static fn( string $n ): bool => 'water levels' === $n );
		if ( null === $c || ! is_numeric( $c['value'] ?? null ) ) {
			return [];
		}

		$date = self::comp_str( $c, 'sampleDate' );
		$age  = self::comp_age_days( $date );
		if ( null === $age || $age > self::LEVEL_MAX_AGE_DAYS ) {
			return [];
		}

		$avg = ( isset( $c['historicAverageForMonth'] ) && is_array( $c['historicAverageForMonth'] ) )
			? $c['historicAverageForMonth']
			: [];
		$norm = $avg['norm'] ?? null;
		if ( ! is_numeric( $norm ) ) {
			return [];
		}

		$current = (float) $c['value'];
		$inches  = ( $current - (float) $norm ) * 12.0;

		// Nothing worth saying: stay silent rather than print "about normal".
		if ( abs( $inches ) < self::LEVEL_SILENT_INCHES ) {
			return [];
		}

		$units = self::comp_str( $c, 'units' );
		$datum = self::comp_str( $c, 'verticalDatum' );
		$ts    = strtotime( $date );
		$month = false !== $ts ? gmdate( 'F', $ts ) : '';

		$basis = sprintf(
			/* translators: 1: the monthly norm with units, 2: period of record. */
			__( 'the Water Atlas monthly norm is %1$s%2$s', 'dcc-wildlife' ),
			self::fmt_measure( $norm, 2, $units ),
			self::por_suffix( $avg )
		);

		return [
			[
				'label'       => __( 'Water level', 'dcc-wildlife' ),
				'value'       => self::describe_deviation(
					$inches,
					'' !== $month
						/* translators: %s: month name. */
						? sprintf( __( 'normal for %s', 'dcc-wildlife' ), $month )
						: __( 'the monthly norm', 'dcc-wildlife' )
				),
				'tier'        => Water_Fact::TIER_LIVE,
				'source_name' => self::atlas_source_name( $c, __( 'SJRWMD station', 'dcc-wildlife' ) ),
				'source_url'  => self::station_url( $c ),
				'date'        => $date,
				'date_label'  => __( 'reading', 'dcc-wildlife' ),
				// SJRWMD publishes this to the day; the clock component is an
				// artefact of parsing a bare date.
				'date_precision' => 'day',
				'note'        => sprintf(
					/* translators: 1: raw station reading, 2: datum, 3: comparison basis. */
					__( 'station reading %1$s%2$s; %3$s', 'dcc-wildlife' ),
					self::fmt_measure( $current, $c['precision'] ?? null, $units ),
					'' !== $datum ? ' ' . $datum : '',
					$basis
				),
			],
		];
	}

	/**
	 * Turn a signed inch difference into plain language. The caller has
	 * already decided the difference is worth mentioning at all — see
	 * LEVEL_SILENT_INCHES — so this never has to say "about the same".
	 */
	private static function describe_deviation( float $inches, string $basis_label ): string {
		$abs = (int) round( abs( $inches ) );
		if ( $abs < 1 ) {
			$abs = 1;
		}

		return $inches > 0
			/* translators: 1: whole inches, 2: e.g. "normal for August". */
			? sprintf( _n( 'About %1$d inch above %2$s', 'About %1$d inches above %2$s', $abs, 'dcc-wildlife' ), $abs, $basis_label )
			/* translators: 1: whole inches, 2: e.g. "normal for August". */
			: sprintf( _n( 'About %1$d inch below %2$s', 'About %1$d inches below %2$s', $abs, 'dcc-wildlife' ), $abs, $basis_label );
	}

	/**
	 * " over 1994–2026" when the API states its period of record.
	 *
	 * @param array<string,mixed> $block
	 */
	private static function por_suffix( array $block ): string {
		$from = strtotime( (string) ( $block['porStartDate'] ?? '' ) );
		$to   = strtotime( (string) ( $block['porEndDate'] ?? '' ) );
		if ( false === $from ) {
			return '';
		}
		return sprintf(
			/* translators: 1: first year of record, 2: last year of record. */
			__( ' over %1$s–%2$s', 'dcc-wildlife' ),
			gmdate( 'Y', $from ),
			false !== $to ? gmdate( 'Y', $to ) : gmdate( 'Y' )
		);
	}

	/**
	 * "<Source> station <id>, via the Lake County Water Atlas".
	 *
	 * @param array<string,mixed> $c
	 */
	private static function atlas_source_name( array $c, string $fallback ): string {
		$station = self::comp_str( $c, 'stationId' );
		$source  = self::comp_str( $c, 'dataSetName' );
		if ( '' === $source ) {
			$source = self::comp_str( $c, 'source' );
		}
		$who = '' !== $source ? $source : $fallback;

		return '' !== $station
			? sprintf(
				/* translators: 1: data source name, 2: station identifier. */
				__( '%1$s, station %2$s — via the Lake County Water Atlas', 'dcc-wildlife' ),
				$who,
				$station
			)
			: sprintf(
				/* translators: %s: data source name. */
				__( '%s — via the Lake County Water Atlas', 'dcc-wildlife' ),
				$who
			);
	}

	/**
	 * Water clarity. The API supplies its own period-of-record statistics,
	 * so the "clearer than usual" framing is the API's arithmetic, not ours.
	 *
	 * The sample date is stated plainly and no current-versus-stale label is
	 * applied: Lake County samples monthly to quarterly, so a 45-day rule
	 * would have read "most recent known reading" almost permanently —
	 * accurate, but it reads as broken. The date does the honest work.
	 *
	 * @param array<mixed>|null $wq
	 * @return array<int,array<string,mixed>>
	 */
	private static function atlas_secchi( ?array $wq ): array {
		$c = self::find_component( $wq, static fn( string $n ): bool => false !== strpos( $n, 'secchi' ) );
		if ( null === $c || ! is_numeric( $c['value'] ?? null ) ) {
			return [];
		}

		$date = self::comp_str( $c, 'sampleDate' );
		$age  = self::comp_age_days( $date );
		if ( null === $age || $age > self::ATLAS_MAX_AGE_DAYS ) {
			return [];
		}

		$units   = self::comp_str( $c, 'units' );
		$current = (float) $c['value'];
		$value   = self::fmt_measure( $current, $c['precision'] ?? null, $units );

		$hist = ( isset( $c['historic'] ) && is_array( $c['historic'] ) ) ? $c['historic'] : [];
		$med  = $hist['medValue'] ?? null;
		$note = '';

		if ( is_numeric( $med ) && (float) $med > 0 ) {
			$ratio = $current / (float) $med;
			if ( $ratio >= self::SECCHI_CLEARER ) {
				$value .= __( ' — clearer than usual here', 'dcc-wildlife' );
			} elseif ( $ratio <= self::SECCHI_MURKIER ) {
				$value .= __( ' — murkier than usual here', 'dcc-wildlife' );
			}

			$samples = $hist['numSamples'] ?? null;
			$note    = is_numeric( $samples )
				? sprintf(
					/* translators: 1: median with units, 2: sample count, 3: period of record. */
					__( 'long-run median here is %1$s across %2$s samples%3$s', 'dcc-wildlife' ),
					self::fmt_measure( $med, 2, $units ),
					number_format( (int) $samples ),
					self::por_suffix( $hist )
				)
				: sprintf(
					/* translators: 1: median with units, 2: period of record. */
					__( 'long-run median here is %1$s%2$s', 'dcc-wildlife' ),
					self::fmt_measure( $med, 2, $units ),
					self::por_suffix( $hist )
				);
		}

		return [
			[
				'label'       => __( 'Water clarity (Secchi depth)', 'dcc-wildlife' ),
				'value'       => $value,
				'tier'        => Water_Fact::TIER_PUBLISHED,
				'source_name' => self::atlas_source_name( $c, __( 'Lake County Water Atlas', 'dcc-wildlife' ) ),
				'source_url'  => self::station_url( $c ),
				'date'        => $date,
				'date_label'  => __( 'sampled', 'dcc-wildlife' ),
				'date_precision' => 'day',
				'note'        => $note,
			],
		];
	}

	/**
	 * Dissolved oxygen, with a gloss. A bare "9.91" means nothing to a guest,
	 * and an unexplained number on this page costs more than it gives — so
	 * the note explains what the parameter is, without making a claim about
	 * what today's particular value implies.
	 *
	 * @param array<mixed>|null $wq
	 * @return array<int,array<string,mixed>>
	 */
	private static function atlas_dissolved_oxygen( ?array $wq ): array {
		$c = self::find_component(
			$wq,
			static fn( string $n ): bool => false !== strpos( $n, 'dissolved oxygen' ) || 'do' === $n
		);
		if ( null === $c || ! is_numeric( $c['value'] ?? null ) ) {
			return [];
		}

		$date = self::comp_str( $c, 'sampleDate' );
		$age  = self::comp_age_days( $date );
		if ( null === $age || $age > self::ATLAS_MAX_AGE_DAYS ) {
			return [];
		}

		return [
			[
				'label'       => __( 'Dissolved oxygen', 'dcc-wildlife' ),
				'value'       => self::fmt_measure( $c['value'], $c['precision'] ?? null, self::comp_str( $c, 'units' ) ),
				'tier'        => Water_Fact::TIER_PUBLISHED,
				'source_name' => self::atlas_source_name( $c, __( 'Lake County Water Atlas', 'dcc-wildlife' ) ),
				'source_url'  => self::station_url( $c ),
				'date'        => $date,
				'date_label'  => __( 'sampled', 'dcc-wildlife' ),
				'date_precision' => 'day',
				'note'        => __( 'how much oxygen the water holds — fish tend to move out of water that runs low', 'dcc-wildlife' ),
			],
		];
	}

	/**
	 * Trophic State Index. This component arrives as payloadType
	 * `LimitingParameter` rather than `SingleParameter`, so it is handled
	 * explicitly instead of being assumed to share the common shape — it
	 * carries a `limitingNutrient` the others do not.
	 *
	 * @param array<mixed>|null $wq
	 * @return array<int,array<string,mixed>>
	 */
	private static function atlas_tsi( ?array $wq ): array {
		$c = self::find_component(
			$wq,
			static fn( string $n ): bool => 'tsi' === $n || false !== strpos( $n, 'trophic' )
		);
		if ( null === $c || ! is_numeric( $c['value'] ?? null ) ) {
			return [];
		}

		$date = self::comp_str( $c, 'sampleDate' );
		$age  = self::comp_age_days( $date );
		if ( null === $age || $age > self::ATLAS_MAX_AGE_DAYS ) {
			return [];
		}

		$gloss    = __( 'a measure of how nutrient-rich and productive the water is — lower means clearer and less productive', 'dcc-wildlife' );
		$nutrient = self::comp_str( $c, 'limitingNutrient' );
		if ( '' !== $nutrient ) {
			$gloss .= sprintf(
				/* translators: %s: the limiting nutrient, e.g. "phosphorus". */
				__( '; %s is the limiting nutrient here', 'dcc-wildlife' ),
				strtolower( $nutrient )
			);
		}

		return [
			[
				'label'       => __( 'Trophic State Index (TSI)', 'dcc-wildlife' ),
				'value'       => self::fmt_measure( $c['value'], $c['precision'] ?? null, self::comp_str( $c, 'units' ) ),
				'tier'        => Water_Fact::TIER_PUBLISHED,
				'source_name' => self::atlas_source_name( $c, __( 'Lake County Water Atlas', 'dcc-wildlife' ) ),
				'source_url'  => self::station_url( $c ),
				'date'        => $date,
				'date_label'  => __( 'sampled', 'dcc-wildlife' ),
				'date_precision' => 'day',
				'note'        => $gloss,
			],
		];
	}

	/**
	 * The bathymetric survey — the answer to "how deep is the water", which
	 * has been an open question since 1.4.0 because no single depth figure
	 * could be sourced. An authoritative depth CHART is more use to an
	 * angler than any average would have been, and it invents nothing.
	 *
	 * @param array<mixed>|null $lf
	 * @return array<int,array<string,mixed>>
	 */
	private static function atlas_bathymetry( ?array $lf ): array {
		$c = self::find_component( $lf, static fn( string $n ): bool => false !== strpos( $n, 'bathymetry' ) );
		if ( null === $c ) {
			return [];
		}

		// Bathymetry's payload is a LIST of survey maps, so find_component()
		// hands back the wrapper. Consider EVERY entry, not just the first.
		$entries = [ $c ];
		if ( isset( $c['payload'] ) && is_array( $c['payload'] ) && self::is_list( $c['payload'] ) ) {
			$identity = array_diff_key( $c, [ 'payload' => 1 ] );
			$entries  = [];
			foreach ( $c['payload'] as $entry ) {
				if ( is_array( $entry ) ) {
					$entries[] = $entry + $identity;
				}
			}
		}

		$best = null;
		foreach ( $entries as $entry ) {
			$url = self::first_url_in( $entry );
			if ( '' === $url ) {
				continue;
			}
			$date = '';
			foreach ( [ 'assessmentDate', 'assessedDate', 'sampleDate', 'date' ] as $k ) {
				$candidate = self::comp_str( $entry, $k );
				if ( '' !== $candidate && false !== strtotime( $candidate ) ) {
					$date = $candidate;
					break;
				}
			}
			if ( '' === $date ) {
				continue; // No date, no fact — the gate would drop it anyway.
			}

			$method = self::comp_str( $entry, 'method' );
			$known  = ! self::is_placeholder( $method );
			$ts     = (int) strtotime( $date );

			// Selection rule, and the reason for it: the waters usually
			// publish a same-date PAIR — one entry with method UNKNOWN and
			// one DGPS-SONAR — which are different exports of the same
			// survey, not better and worse versions. So date decides first.
			//
			// Preferring the known method outright would hand Lake Harris a
			// 2001 map in place of its 2014 one, which is exactly backwards
			// for a boater. Method only breaks a tie.
			if ( null === $best
				|| $ts > $best['ts']
				|| ( $ts === $best['ts'] && $known && ! $best['known'] ) ) {
				$best = [
					'url'    => $url,
					'date'   => $date,
					'ts'     => $ts,
					'method' => $known ? $method : '',
					'known'  => $known,
					'entry'  => $entry,
				];
			}
		}

		if ( null === $best ) {
			return []; // Eustis and Yale have no bathymetry at all.
		}

		$entry = $best['entry'];
		$datum = self::comp_str( $entry, 'verticalDatum' );
		if ( self::is_placeholder( $datum ) ) {
			$datum = '';
		}

		$source = self::comp_str( $entry, 'dataSetName' );
		if ( '' === $source ) {
			$source = self::comp_str( $entry, 'source' );
		}
		if ( '' === $source || self::is_placeholder( $source ) ) {
			$source = __( 'Lake County Water Authority', 'dcc-wildlife' );
		}

		// Lead with the year — the part a boater can actually use — and
		// append the method only when it is a real one.
		$year  = gmdate( 'Y', $best['ts'] );
		$value = '' !== $best['method']
			/* translators: 1: survey year, 2: survey method, e.g. "DGPS-SONAR". */
			? sprintf( __( 'Bathymetric survey, %1$s (%2$s)', 'dcc-wildlife' ), $year, $best['method'] )
			/* translators: %s: survey year. */
			: sprintf( __( 'Bathymetric survey, %s', 'dcc-wildlife' ), $year );

		return [
			[
				'label'          => __( 'Depth map', 'dcc-wildlife' ),
				'value'          => $value,
				'tier'           => Water_Fact::TIER_PUBLISHED,
				'source_name'    => sprintf(
					/* translators: %s: the dataset name. */
					__( '%s — open the depth map (PDF)', 'dcc-wildlife' ),
					$source
				),
				'source_url'     => $best['url'],
				'date'           => $best['date'],
				'date_label'     => __( 'surveyed', 'dcc-wildlife' ),
				'date_precision' => 'day',
				'note'           => '' !== $datum ? $datum : '',
			],
		];
	}

	/**
	 * Placeholder strings the Atlas emits in place of a real value.
	 *
	 * `UNKNOWN` is the literal `method` on most of the chain's depth maps,
	 * and printing it produced "Bathymetric survey (UNKNOWN)" on the live
	 * page. Treated as absent so the label falls through cleanly.
	 */
	private static function is_placeholder( string $v ): bool {
		$v = strtolower( trim( $v ) );
		return in_array( $v, [ '', 'unknown', 'n/a', 'na', 'none', 'null', 'tbd', '-' ], true );
	}

	/**
	 * First http(s) URL anywhere in a component, preferring a PDF.
	 *
	 * @param array<mixed> $node
	 */
	private static function first_url_in( array $node ): string {
		$found = '';
		$queue = [ $node ];

		while ( $queue ) {
			$cur = array_shift( $queue );
			if ( ! is_array( $cur ) ) {
				continue;
			}
			foreach ( $cur as $v ) {
				if ( is_array( $v ) ) {
					$queue[] = $v;
					continue;
				}
				if ( ! is_string( $v ) || ! preg_match( '#^https?://#i', trim( $v ) ) ) {
					continue;
				}
				$url = esc_url_raw( trim( $v ) );
				if ( '' === $url ) {
					continue;
				}
				if ( preg_match( '#\.pdf($|\?)#i', $url ) ) {
					return $url;
				}
				if ( '' === $found ) {
					$found = $url;
				}
			}
		}

		return $found;
	}

	/* =====================================================================
	 * Rainfall — the pairing with the owner's own observation.
	 * ===================================================================== */

	/**
	 * Daily totals (`statCd=00006`, sum) rather than summed instantaneous
	 * values: `00045` reporting semantics vary between sites, whereas the
	 * daily sum is unambiguous. Consequently this is labelled by CALENDAR
	 * DAYS, not as a rolling "last 48 hours" — the label matches the
	 * statistic, same discipline as the level figure.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private static function fetch_rainfall(): array {
		$site = Water_Data::rain_site();
		if ( '' === $site ) {
			return [];
		}

		$daily = self::usgs_daily( $site, '00045', '00006', '0', 8 );
		if ( count( $daily ) < 2 ) {
			return [];
		}

		$recent = array_slice( $daily, -2 );
		$last   = end( $recent );
		$ts     = strtotime( $last['date'] . ' 12:00:00 UTC' );
		if ( false === $ts || ( time() - $ts ) > ( self::STALE_RAIN_DAYS * DAY_IN_SECONDS ) ) {
			return []; // Reporting has lapsed; do not present it as current.
		}

		$total = 0.0;
		foreach ( $recent as $d ) {
			$total += $d['value'];
		}

		// Same principle as the level line: a dry couple of days is the
		// default state here, and printing "0 in. of rain" daily is noise.
		if ( $total < 0.005 ) {
			return [];
		}

		$first_date = $recent[0]['date'];
		$last_date  = $last['date'];

		return [
			[
				'label'       => __( 'Recent rain', 'dcc-wildlife' ),
				'value'       => sprintf(
					/* translators: %s: rainfall total in inches. */
					__( '%s in. over the last two days', 'dcc-wildlife' ),
					rtrim( rtrim( number_format( $total, 2, '.', '' ), '0' ), '.' )
				),
				'tier'        => Water_Fact::TIER_LIVE,
				'source_name' => sprintf(
					/* translators: %s: USGS site number. */
					__( 'USGS rain gauge (site %s)', 'dcc-wildlife' ),
					$site
				),
				'source_url'  => 'https://waterdata.usgs.gov/monitoring-location/' . rawurlencode( $site ) . '/',
				'date'        => $last_date,
				// USGS daily values carry a date and no clock.
				'date_precision' => 'day',
				'note'        => sprintf(
					/* translators: 1: first calendar date, 2: last calendar date. */
					__( 'calendar-day totals for %1$s and %2$s', 'dcc-wildlife' ),
					$first_date,
					$last_date
				),
			],
		];
	}

	/* The USGS instantaneous-values reader was removed in 1.6.0 along with
	 * the USGS level gauges: neither sat on Lake Dora, and the atlas exposes
	 * an SJRWMD station that does. Rainfall below still uses USGS daily
	 * values, which is the one thing those gauges do better than anything
	 * else nearby. */

	/**
	 * Daily values, oldest first. Cached for a day — these change once.
	 *
	 * @return array<int,array{date:string,value:float}>
	 */
	private static function usgs_daily( string $site, string $param, string $stat, string $years, int $days = 0 ): array {
		$key    = self::DV_KEY . md5( $site . $param . $stat . $years . $days );
		$cached = get_transient( $key );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$args = [
			'format'      => 'json',
			'sites'       => $site,
			'parameterCd' => $param,
			'statCd'      => $stat,
		];
		if ( $days > 0 ) {
			$args['period'] = 'P' . (int) $days . 'D';
		} else {
			$args['startDT'] = gmdate( 'Y-m-d', strtotime( '-' . (int) $years . ' years' ) );
			$args['endDT']   = gmdate( 'Y-m-d' );
		}

		$body   = self::get_json( add_query_arg( $args, 'https://waterservices.usgs.gov/nwis/dv/' ) );
		$series = $body['value']['timeSeries'][0]['values'][0]['value'] ?? null;

		$out = [];
		if ( is_array( $series ) ) {
			foreach ( $series as $point ) {
				$v = $point['value'] ?? '';
				$d = trim( (string) ( $point['dateTime'] ?? '' ) );
				if ( ! is_numeric( $v ) || '' === $d || (float) $v <= -999998 ) {
					continue;
				}
				$out[] = [
					'date'  => substr( $d, 0, 10 ),
					'value' => (float) $v,
				];
			}
		}

		set_transient( $key, $out, self::TTL_DV );
		return $out;
	}

	/* =====================================================================
	 * NWS
	 * ===================================================================== */

	/**
	 * @return array<int,array<string,mixed>>
	 */
	private static function fetch_nws(): array {
		$coords = Water_Data::coords();
		if ( null === $coords ) {
			return [];
		}

		$points = self::get_json(
			sprintf(
				'https://api.weather.gov/points/%s,%s',
				rawurlencode( (string) round( $coords['lat'], 4 ) ),
				rawurlencode( (string) round( $coords['lon'], 4 ) )
			)
		);
		$forecast_url = trim( (string) ( $points['properties']['forecast'] ?? '' ) );
		if ( '' === $forecast_url ) {
			return [];
		}

		$forecast = self::get_json( $forecast_url );
		// Fixed 1.7.0 (this bug shipped in 1.6.0): NWS forecast responses do
		// NOT carry `properties.updated`. They carry units, forecastGenerator,
		// generatedAt, updateTime, validTimes, elevation and periods. The old
		// guard therefore dropped forecast AND wind every single time.
		//
		// `updateTime` is the ISSUANCE time — the measurement time we want.
		// `generatedAt` is merely when the JSON was rendered, so it is the
		// last resort rather than the first choice.
		$props   = $forecast['properties'] ?? [];
		$updated = '';
		foreach ( [ 'updated', 'updateTime', 'generatedAt' ] as $k ) {
			$candidate = trim( (string) ( $props[ $k ] ?? '' ) );
			if ( '' !== $candidate ) {
				$updated = $candidate;
				break;
			}
		}
		$period = $props['periods'][0] ?? null;
		if ( ! is_array( $period ) || '' === $updated ) {
			return [];
		}

		$name  = trim( (string) ( $period['name'] ?? '' ) );
		$short = trim( (string) ( $period['shortForecast'] ?? '' ) );
		$temp  = $period['temperature'] ?? null;
		$tunit = trim( (string) ( $period['temperatureUnit'] ?? '' ) );
		$wspd  = trim( (string) ( $period['windSpeed'] ?? '' ) );
		$wdir  = trim( (string) ( $period['windDirection'] ?? '' ) );

		$source = __( 'National Weather Service forecast', 'dcc-wildlife' );
		$rows   = [];

		if ( '' !== $short ) {
			$rows[] = [
				'label'       => '' !== $name
					/* translators: %s: NWS forecast period name, e.g. "This Afternoon". */
					? sprintf( __( 'Forecast — %s', 'dcc-wildlife' ), $name )
					: __( 'Forecast', 'dcc-wildlife' ),
				'value'       => is_numeric( $temp ) && '' !== $tunit
					? sprintf( '%s, %s °%s', $short, (string) $temp, $tunit )
					: $short,
				'tier'        => Water_Fact::TIER_LIVE,
				'source_name' => $source,
				'source_url'  => 'https://www.weather.gov/',
				'date'        => $updated,
				// The one source with a real clock worth printing.
				'date_precision' => 'minute',
				'note'        => '',
			];
		}

		if ( '' !== $wspd ) {
			$rows[] = [
				'label'       => __( 'Wind', 'dcc-wildlife' ),
				'value'       => '' !== $wdir ? trim( $wdir . ' ' . $wspd ) : $wspd,
				'tier'        => Water_Fact::TIER_LIVE,
				'source_name' => $source,
				'source_url'  => 'https://www.weather.gov/',
				'date'        => $updated,
				'date_precision' => 'minute',
				'note'        => '',
			];
		}

		return $rows;
	}

	/* =====================================================================
	 * HTTP + discovery
	 * ===================================================================== */

	/**
	 * @return array<mixed>|null
	 */
	public static function get_json( string $url ): ?array {
		$res = wp_remote_get(
			$url,
			[
				'timeout'     => 10,
				'redirection' => 3,
				'user-agent'  => self::user_agent(),
				'headers'     => [ 'Accept' => 'application/json' ],
			]
		);

		if ( is_wp_error( $res ) ) {
			self::log( $url, $res->get_error_message() );
			return null;
		}
		if ( 200 !== (int) wp_remote_retrieve_response_code( $res ) ) {
			self::log( $url, 'HTTP ' . wp_remote_retrieve_response_code( $res ) );
			return null;
		}

		$data = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		return is_array( $data ) ? $data : null;
	}

	private static function log( string $url, string $why ): void {
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( sprintf( 'DCC_WL water fetch failed (%s): %s', $url, $why ) );
		}
	}

	/**
	 * Admin-only: ask USGS which active gauges exist near the property.
	 *
	 * NOTE: the site service rejects `stateCd` and `countyCd` together with
	 * HTTP 400 — only one major filter is allowed. This uses a bounding box
	 * for that reason.
	 *
	 * @return array<int,array<string,string>>
	 */
	public static function discover_gauges(): array {
		$coords = Water_Data::coords();
		if ( null === $coords ) {
			return [];
		}

		$pad  = 0.35;
		$bbox = implode(
			',',
			[
				round( $coords['lon'] - $pad, 4 ),
				round( $coords['lat'] - $pad, 4 ),
				round( $coords['lon'] + $pad, 4 ),
				round( $coords['lat'] + $pad, 4 ),
			]
		);

		$res = wp_remote_get(
			add_query_arg(
				[
					'format'        => 'rdb',
					'bBox'          => $bbox,
					'siteStatus'    => 'active',
					'hasDataTypeCd' => 'iv',
				],
				'https://waterservices.usgs.gov/nwis/site/'
			),
			[
				'timeout'    => 15,
				'user-agent' => self::user_agent(),
			]
		);
		if ( is_wp_error( $res ) || 200 !== (int) wp_remote_retrieve_response_code( $res ) ) {
			return [];
		}

		return self::parse_rdb( (string) wp_remote_retrieve_body( $res ) );
	}

	/**
	 * @return array<int,array<string,string>>
	 */
	private static function parse_rdb( string $body ): array {
		$lines  = preg_split( '/\r\n|\n|\r/', $body );
		$header = null;
		$out    = [];

		foreach ( (array) $lines as $line ) {
			if ( '' === $line || '#' === substr( $line, 0, 1 ) ) {
				continue;
			}
			$cols = explode( "\t", $line );
			if ( null === $header ) {
				$header = $cols;
				continue;
			}
			if ( isset( $cols[0] ) && preg_match( '/^\d+[sndx]$/', trim( $cols[0] ) ) ) {
				continue;
			}
			$row = [];
			foreach ( $header as $i => $key ) {
				$row[ $key ] = isset( $cols[ $i ] ) ? trim( $cols[ $i ] ) : '';
			}
			if ( '' === ( $row['site_no'] ?? '' ) ) {
				continue;
			}
			$out[] = [
				'site_no'    => $row['site_no'],
				'station_nm' => $row['station_nm'] ?? '',
				'site_tp_cd' => $row['site_tp_cd'] ?? '',
			];
		}

		return $out;
	}

	public static function flush(): void {
		global $wpdb;
		delete_transient( 'dcc_wl_water_discovery' );
		// Atlas transients are keyed by endpoint hash; clear them too so a
		// settings change is reflected immediately rather than in six hours.
		if ( isset( $wpdb ) && is_object( $wpdb ) ) {
			$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_dcc_wl_atlas_%' OR option_name LIKE '_transient_timeout_dcc_wl_atlas_%'" );
		}
		delete_transient( self::CACHE_KEY );
		delete_transient( self::FAIL_KEY );
		delete_transient( self::LOCK_KEY );
	}
}
