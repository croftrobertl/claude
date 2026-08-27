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
		$rows = array_merge(
			self::fetch_atlas(),
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
	private static function atlas_report( string $report ): ?array {
		$base      = Water_Data::atlas_base();
		$waterbody = Water_Data::atlas_waterbody();
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

		$body = self::get_json( $url );
		if ( ! is_array( $body ) ) {
			set_transient( $key, 'MISS', Water_Data::TTL_FAIL );
			return null;
		}

		set_transient( $key, $body, self::TTL_ATLAS );
		return $body;
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
	 * Breadth-first search for a named component.
	 *
	 * BFS is deliberate: the shallowest match is the component itself, so a
	 * nested `historic` sub-block carrying the same parameter name can never
	 * be mistaken for the current reading.
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
				return $node;
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

		$url = self::first_url_in( $c );
		if ( '' === $url ) {
			return [];
		}

		$date = '';
		foreach ( [ 'assessmentDate', 'assessedDate', 'sampleDate', 'date' ] as $k ) {
			$candidate = self::comp_str( $c, $k );
			if ( '' !== $candidate && false !== strtotime( $candidate ) ) {
				$date = $candidate;
				break;
			}
		}
		if ( '' === $date ) {
			return []; // No date, no fact — the gate would drop it anyway.
		}

		$method = self::comp_str( $c, 'method' );
		$datum  = self::comp_str( $c, 'verticalDatum' );
		$bits   = array_filter( [ $method, $datum ] );

		$source = self::comp_str( $c, 'dataSetName' );
		if ( '' === $source ) {
			$source = self::comp_str( $c, 'source' );
		}
		if ( '' === $source ) {
			$source = __( 'Lake County Water Authority', 'dcc-wildlife' );
		}

		return [
			[
				'label'       => __( 'Depth map', 'dcc-wildlife' ),
				'value'       => '' !== $method
					/* translators: %s: survey method, e.g. "DGPS-SONAR". */
					? sprintf( __( 'Bathymetric survey (%s)', 'dcc-wildlife' ), $method )
					: __( 'Bathymetric survey', 'dcc-wildlife' ),
				'tier'        => Water_Fact::TIER_PUBLISHED,
				'source_name' => sprintf(
					/* translators: %s: the dataset name. */
					__( '%s — open the depth map (PDF)', 'dcc-wildlife' ),
					$source
				),
				'source_url'  => $url,
				'date'        => $date,
				'date_label'  => __( 'surveyed', 'dcc-wildlife' ),
				'note'        => $bits ? implode( ', ', $bits ) : '',
			],
		];
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
		global $wpdb;
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
