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
	private const STALE_IV_SECONDS   = 21600;   // 6 h; gauge data is 15-minute.
	private const STALE_RAIN_DAYS    = 3;       // Daily totals; allow for reporting lag.
	private const CLARITY_FRESH_DAYS = 45;      // Secchi runs are often monthly.
	private const CLARITY_MAX_DAYS   = 365;     // Older than a year: dropped entirely.
	private const TTL_DV             = 86400;   // Daily values change once a day.

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
		$rows = array_merge(
			self::fetch_level(),
			self::fetch_rainfall(),
			self::fetch_clarity(),
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
	 * Water level — expressed as CHANGE, never as raw elevation.
	 * ===================================================================== */

	/**
	 * `00065` and `63160` are heights above a datum, not water depth. The
	 * Apopka-Beauclair gauge reads about 65.93 ft; printed as a headline a
	 * guest reads "the water is 65 feet deep", which is a falsehood produced
	 * by the module built to prevent falsehoods.
	 *
	 * So the headline is a deviation in inches, and the raw reading appears
	 * only in the attribution line where it is unambiguous.
	 *
	 * The comparison basis is chosen honestly: the same calendar week across
	 * the period of record if the record supports it (so "normal for this
	 * week" is literally true), otherwise a trailing 30-day mean which is
	 * labelled as exactly that. The label always matches the statistic.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private static function fetch_level(): array {
		$site = Water_Data::featured_site();
		if ( '' === $site ) {
			return [];
		}

		$iv = self::usgs_iv( [ $site ], '00065,63160' );
		if ( ! $iv ) {
			return [];
		}

		// Prefer gage height; fall back to NAVD88 elevation at sites that
		// only publish the latter.
		$current = $iv['00065'] ?? $iv['63160'] ?? null;
		if ( null === $current ) {
			return [];
		}

		$param    = isset( $iv['00065'] ) ? '00065' : '63160';
		$baseline = self::level_baseline( $site, $param );
		if ( null === $baseline ) {
			return [];
		}

		$inches = ( (float) $current['value'] - $baseline['mean'] ) * 12.0;
		$phrase = self::describe_deviation( $inches, $baseline['label'] );

		$station = self::station_label( $current );

		return [
			[
				'label'       => __( 'Water level', 'dcc-wildlife' ),
				'value'       => $phrase,
				'tier'        => Water_Fact::TIER_LIVE,
				'source_name' => $station,
				'source_url'  => 'https://waterdata.usgs.gov/monitoring-location/' . rawurlencode( $site ) . '/',
				'date'        => $current['when'],
				'note'        => sprintf(
					/* translators: 1: raw gauge reading with units, 2: description of the comparison basis. */
					__( 'gauge reading %1$s; compared with %2$s', 'dcc-wildlife' ),
					$current['value'] . ( '' !== $current['unit'] ? ' ' . $current['unit'] : '' ),
					$baseline['basis']
				),
			],
		];
	}

	/**
	 * Turn a signed inch difference into plain language. Sub-inch
	 * differences are not dressed up as a trend.
	 */
	private static function describe_deviation( float $inches, string $basis_label ): string {
		$abs = (int) round( abs( $inches ) );

		if ( $abs < 1 ) {
			return sprintf(
				/* translators: %s: e.g. "normal for this week". */
				__( 'About the same as %s', 'dcc-wildlife' ),
				$basis_label
			);
		}

		return $inches > 0
			/* translators: 1: whole inches, 2: e.g. "normal for this week". */
			? sprintf( _n( 'About %1$d inch above %2$s', 'About %1$d inches above %2$s', $abs, 'dcc-wildlife' ), $abs, $basis_label )
			/* translators: 1: whole inches, 2: e.g. "normal for this week". */
			: sprintf( _n( 'About %1$d inch below %2$s', 'About %1$d inches below %2$s', $abs, 'dcc-wildlife' ), $abs, $basis_label );
	}

	/**
	 * The comparison figure, with the label that honestly describes it.
	 *
	 * @return array{mean:float,label:string,basis:string}|null
	 */
	private static function level_baseline( string $site, string $param ): ?array {
		$daily = self::usgs_daily( $site, $param, '00003', '10' );
		if ( ! $daily ) {
			return null;
		}

		$this_week = (int) gmdate( 'W' );
		$same_week = [];
		$years     = [];

		foreach ( $daily as $day ) {
			$ts = strtotime( $day['date'] . ' 12:00:00 UTC' );
			if ( false === $ts ) {
				continue;
			}
			if ( (int) gmdate( 'W', $ts ) === $this_week ) {
				$same_week[]                    = $day['value'];
				$years[ (int) gmdate( 'Y', $ts ) ] = true;
			}
		}

		// "Normal for this week" is only allowed to be said when the record
		// actually supports it: three or more distinct years of that week.
		if ( count( $years ) >= 3 && count( $same_week ) >= 9 ) {
			$yr = array_keys( $years );
			sort( $yr );
			return [
				'mean'  => array_sum( $same_week ) / count( $same_week ),
				'label' => __( 'normal for this week', 'dcc-wildlife' ),
				'basis' => sprintf(
					/* translators: 1: first year of record, 2: last year of record. */
					__( 'the %1$d–%2$d average for this calendar week', 'dcc-wildlife' ),
					(int) $yr[0],
					(int) end( $yr )
				),
			];
		}

		// Fallback. This is NOT "normal" and must never be labelled as such.
		$recent = array_slice( $daily, -30 );
		if ( count( $recent ) < 20 ) {
			return null;
		}
		$values = array_column( $recent, 'value' );

		return [
			'mean'  => array_sum( $values ) / count( $values ),
			'label' => __( 'the last 30 days', 'dcc-wildlife' ),
			'basis' => __( 'the average of the last 30 days (the record is too short to say what is normal for this week)', 'dcc-wildlife' ),
		];
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
				'note'        => sprintf(
					/* translators: 1: first calendar date, 2: last calendar date. */
					__( 'calendar-day totals for %1$s and %2$s', 'dcc-wildlife' ),
					$first_date,
					$last_date
				),
			],
		];
	}

	/* =====================================================================
	 * Water clarity (Secchi) — Lake County Water Atlas.
	 * ===================================================================== */

	/**
	 * The Water Atlas publishes a Water Clarity Report and exposes a public
	 * API at api.wateratlas.usf.edu. The exact request path and response
	 * shape could NOT be confirmed from the build environment, so the
	 * endpoint is a configurable template and the parser below is
	 * deliberately shape-tolerant: it walks whatever JSON comes back looking
	 * for records that carry a depth-like value and a date-like value.
	 * Settings → DCC Water has a Test button that prints what actually came
	 * back, so the path is confirmed against the live API rather than
	 * guessed here.
	 *
	 * Staleness matters more here than anywhere: Secchi runs are often
	 * monthly, and a six-week-old clarity figure shown as a current
	 * condition is precisely the quiet staleness that erodes trust. Readings
	 * within 45 days read as current; older ones are explicitly labelled
	 * "most recent known reading"; anything over a year is dropped.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private static function fetch_clarity(): array {
		$template = Water_Data::clarity_endpoint();
		$wbid     = Water_Data::clarity_wbid();
		if ( '' === $template || '' === $wbid ) {
			return [];
		}

		$url  = str_replace( '{wbid}', rawurlencode( $wbid ), $template );
		$body = self::get_json( $url );
		if ( ! is_array( $body ) ) {
			return [];
		}

		$reading = self::latest_clarity_reading( $body );
		if ( null === $reading ) {
			return [];
		}

		$age_days = ( time() - $reading['ts'] ) / DAY_IN_SECONDS;
		if ( $age_days > self::CLARITY_MAX_DAYS ) {
			return [];
		}

		$is_current = $age_days <= self::CLARITY_FRESH_DAYS;

		return [
			[
				'label'       => $is_current
					? __( 'Water clarity (Secchi depth)', 'dcc-wildlife' )
					: __( 'Water clarity — most recent known reading', 'dcc-wildlife' ),
				'value'       => sprintf(
					/* translators: %s: Secchi depth in feet. */
					__( '%s ft', 'dcc-wildlife' ),
					rtrim( rtrim( number_format( $reading['value'], 2, '.', '' ), '0' ), '.' )
				),
				'tier'        => Water_Fact::TIER_PUBLISHED,
				'source_name' => __( 'Lake County Water Atlas (USF Water Institute)', 'dcc-wildlife' ),
				'source_url'  => Water_Data::clarity_link(),
				'date'        => $reading['date'],
				'note'        => $is_current
					? ''
					: __( 'not a current condition — this is simply the latest reading on record', 'dcc-wildlife' ),
			],
		];
	}

	/**
	 * Admin-only probe: fetch the configured clarity endpoint and report
	 * what came back, so the owner confirms the path against the live API
	 * instead of anyone guessing it here.
	 *
	 * @return array<string,mixed>
	 */
	public static function probe_clarity(): array {
		$template = Water_Data::clarity_endpoint();
		$wbid     = Water_Data::clarity_wbid();

		if ( '' === $template ) {
			return [
				'ok'     => false,
				'reason' => __( 'No endpoint URL saved yet.', 'dcc-wildlife' ),
			];
		}

		$url  = str_replace( '{wbid}', rawurlencode( $wbid ), $template );
		$body = self::get_json( $url );
		if ( ! is_array( $body ) ) {
			return [
				'ok'     => false,
				'url'    => $url,
				'reason' => __( 'No JSON came back (unreachable, not JSON, or non-200).', 'dcc-wildlife' ),
			];
		}

		$reading = self::latest_clarity_reading( $body );
		if ( null === $reading ) {
			return [
				'ok'     => false,
				'url'    => $url,
				'reason' => __( 'JSON parsed, but no depth + date pair was recognised in it. Check the path, or send me a sample of the response.', 'dcc-wildlife' ),
			];
		}

		$age = (int) floor( ( time() - $reading['ts'] ) / DAY_IN_SECONDS );

		return [
			'ok'      => true,
			'url'     => $url,
			'value'   => $reading['value'],
			'date'    => $reading['date'],
			'ageDays' => $age,
			'wouldShow' => $age <= self::CLARITY_MAX_DAYS,
			'asCurrent' => $age <= self::CLARITY_FRESH_DAYS,
		];
	}

	/**
	 * Shape-tolerant scan for the newest {depth, date} pair in an arbitrary
	 * JSON tree. Returns null rather than guessing when nothing matches.
	 *
	 * @param array<mixed> $body
	 * @return array{value:float,date:string,ts:int}|null
	 */
	private static function latest_clarity_reading( array $body ): ?array {
		$best  = null;
		$stack = [ $body ];

		$depth_keys = [ 'secchi', 'secchidepth', 'secchi_depth', 'result', 'value', 'depth', 'resultvalue' ];
		$date_keys  = [ 'sampledate', 'sample_date', 'date', 'datetime', 'observationdate', 'resultdate' ];

		while ( $stack ) {
			$node = array_pop( $stack );
			if ( ! is_array( $node ) ) {
				continue;
			}

			$value = null;
			$date  = null;
			foreach ( $node as $k => $v ) {
				if ( is_array( $v ) ) {
					$stack[] = $v;
					continue;
				}
				$key = strtolower( preg_replace( '/[^a-z_]/i', '', (string) $k ) );
				if ( null === $value && in_array( $key, $depth_keys, true ) && is_numeric( $v ) ) {
					$value = (float) $v;
				}
				if ( null === $date && in_array( $key, $date_keys, true ) && is_string( $v ) && '' !== $v ) {
					$date = $v;
				}
			}

			if ( null === $value || null === $date || $value <= 0 ) {
				continue;
			}
			$ts = strtotime( $date );
			if ( false === $ts ) {
				continue;
			}
			if ( null === $best || $ts > $best['ts'] ) {
				$best = [
					'value' => $value,
					'date'  => gmdate( 'Y-m-d', $ts ),
					'ts'    => $ts,
				];
			}
		}

		return $best;
	}

	/* =====================================================================
	 * USGS plumbing
	 * ===================================================================== */

	/**
	 * Latest instantaneous value per parameter for one or more sites.
	 * Stale series and the -999999 no-data sentinel are dropped here so no
	 * caller has to remember to check.
	 *
	 * @param string[] $sites
	 * @return array<string,array{value:string,unit:string,when:string,station:string,site:string,lat:?float,lon:?float}>
	 */
	private static function usgs_iv( array $sites, string $params ): array {
		if ( ! $sites ) {
			return [];
		}

		$body = self::get_json(
			add_query_arg(
				[
					'format'      => 'json',
					'sites'       => implode( ',', $sites ),
					'parameterCd' => $params,
					'siteStatus'  => 'active',
				],
				'https://waterservices.usgs.gov/nwis/iv/'
			)
		);

		$series = $body['value']['timeSeries'] ?? null;
		if ( ! is_array( $series ) ) {
			return [];
		}

		$out = [];
		foreach ( $series as $ts ) {
			if ( ! is_array( $ts ) ) {
				continue;
			}
			$code = trim( (string) ( $ts['variable']['variableCode'][0]['value'] ?? '' ) );
			$vals = $ts['values'][0]['value'] ?? [];
			if ( '' === $code || ! is_array( $vals ) || ! $vals ) {
				continue;
			}
			$point = end( $vals );
			$value = trim( (string) ( $point['value'] ?? '' ) );
			$when  = trim( (string) ( $point['dateTime'] ?? '' ) );
			if ( '' === $value || '' === $when || (float) $value <= -999998 ) {
				continue;
			}

			// Dead series guard: USGS keeps publishing offline sensors.
			$when_ts = strtotime( $when );
			if ( false === $when_ts || ( time() - $when_ts ) > self::STALE_IV_SECONDS ) {
				continue;
			}

			$lat = $ts['sourceInfo']['geoLocation']['geogLocation']['latitude'] ?? null;
			$lon = $ts['sourceInfo']['geoLocation']['geogLocation']['longitude'] ?? null;

			$out[ $code ] = [
				'value'   => $value,
				'unit'    => trim( (string) ( $ts['variable']['unit']['unitCode'] ?? '' ) ),
				'when'    => $when,
				'station' => trim( (string) ( $ts['sourceInfo']['siteName'] ?? '' ) ),
				'site'    => trim( (string) ( $ts['sourceInfo']['siteCode'][0]['value'] ?? '' ) ),
				'lat'     => is_numeric( $lat ) ? (float) $lat : null,
				'lon'     => is_numeric( $lon ) ? (float) $lon : null,
			];
		}

		return $out;
	}

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

	/**
	 * "USGS <STATION> (site <n>) — about N mi from the property".
	 *
	 * Neither configured gauge sits in Lake Dora, so the station is named
	 * plainly with its straight-line distance and never described as "your
	 * water". The chain's hydrology and flow direction remain unsourced and
	 * are not asserted anywhere.
	 *
	 * @param array{station:string,site:string,lat:?float,lon:?float} $s
	 */
	private static function station_label( array $s ): string {
		$base = '' !== $s['station']
			? sprintf(
				/* translators: 1: USGS station name, 2: USGS site number. */
				__( 'USGS %1$s (site %2$s)', 'dcc-wildlife' ),
				$s['station'],
				$s['site']
			)
			: __( 'USGS Water Services', 'dcc-wildlife' );

		$coords = Water_Data::coords();
		if ( null === $coords || null === $s['lat'] || null === $s['lon'] ) {
			return $base;
		}

		$miles = self::distance_miles( $coords['lat'], $coords['lon'], $s['lat'], $s['lon'] );
		return sprintf(
			/* translators: 1: station description, 2: straight-line distance in miles. */
			__( '%1$s — about %2$s mi from the property, straight line', 'dcc-wildlife' ),
			$base,
			number_format( $miles, $miles < 10 ? 1 : 0, '.', '' )
		);
	}

	private static function distance_miles( float $lat1, float $lon1, float $lat2, float $lon2 ): float {
		$r  = 3958.7613;
		$dl = deg2rad( $lat2 - $lat1 );
		$dg = deg2rad( $lon2 - $lon1 );
		$a  = sin( $dl / 2 ) ** 2 + cos( deg2rad( $lat1 ) ) * cos( deg2rad( $lat2 ) ) * sin( $dg / 2 ) ** 2;
		return $r * 2 * atan2( sqrt( $a ), sqrt( 1 - $a ) );
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
		$updated  = trim( (string) ( $forecast['properties']['updated'] ?? '' ) );
		$period   = $forecast['properties']['periods'][0] ?? null;
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
		delete_transient( self::CACHE_KEY );
		delete_transient( self::FAIL_KEY );
		delete_transient( self::LOCK_KEY );
	}
}
