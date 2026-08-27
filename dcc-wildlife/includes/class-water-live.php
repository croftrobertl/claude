<?php
/**
 * Water module — the optional live-conditions layer (USGS + NWS).
 *
 * WHY THIS LAYER IS TRUSTWORTHY: it never states a number this plugin's
 * author chose. Each reading arrives from the upstream API together with
 * its own site name, parameter name, units and measurement timestamp, and
 * those are what get rendered. The code is a parser, not a source.
 *
 * Cache safety: SpeedyCache serves this site's HTML for hours, so nothing
 * time-sensitive may be rendered by PHP into the page. Everything here is
 * fetched server-side into a transient and served through the REST route,
 * which the browser calls after the cached shell has painted.
 *
 * Politeness: one lock prevents a stampede when the transient expires, and
 * a failure marker backs off for TTL_FAIL seconds so a broken upstream is
 * never hammered. Guests never see an error — a failed fetch renders as an
 * absent conditions strip.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Water_Live {

	private const CACHE_KEY = 'dcc_wl_water_cond';
	private const LOCK_KEY  = 'dcc_wl_water_lock';
	private const FAIL_KEY  = 'dcc_wl_water_fail';

	/**
	 * NWS requires a descriptive User-Agent identifying the application and
	 * a contact. USGS has no such requirement but is sent the same.
	 */
	private static function user_agent(): string {
		return sprintf( 'DCC-Wildlife-WordPress/%s (%s)', DCC_WL_VERSION, home_url( '/' ) );
	}

	/**
	 * Cached conditions for the REST layer.
	 *
	 * @return array{facts:array<int,array<string,string>>,fetched:string}
	 */
	public static function conditions(): array {
		if ( ! Water_Data::live_enabled() ) {
			return [
				'facts'   => [],
				'fetched' => '',
			];
		}

		$cached = get_transient( self::CACHE_KEY );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		// Upstream recently failed, or another request is already fetching:
		// serve nothing rather than piling on.
		if ( get_transient( self::FAIL_KEY ) || get_transient( self::LOCK_KEY ) ) {
			return [
				'facts'   => [],
				'fetched' => '',
			];
		}

		set_transient( self::LOCK_KEY, 1, 30 );
		$result = self::refresh();
		delete_transient( self::LOCK_KEY );

		return $result;
	}

	/**
	 * Fetch every configured source and cache the gated result.
	 *
	 * @return array{facts:array<int,array<string,string>>,fetched:string}
	 */
	public static function refresh(): array {
		$facts = [];

		foreach ( self::fetch_usgs() as $row ) {
			$facts[] = $row;
		}
		foreach ( self::fetch_nws() as $row ) {
			$facts[] = $row;
		}

		// Gate every row, exactly like the almanac. A malformed upstream
		// payload cannot produce an unattributed line on the page.
		$gated = [];
		foreach ( Water_Fact::collect( $facts ) as $fact ) {
			$gated[] = $fact->to_array();
		}

		$payload = [
			'facts'   => $gated,
			'fetched' => gmdate( 'c' ),
		];

		if ( $gated ) {
			set_transient( self::CACHE_KEY, $payload, self::TTL() );
		} else {
			// Nothing usable came back — back off before trying again.
			set_transient( self::FAIL_KEY, 1, Water_Data::TTL_FAIL );
		}

		return $payload;
	}

	private static function TTL(): int {
		return (int) min( Water_Data::TTL_USGS, Water_Data::TTL_NWS );
	}

	/**
	 * @return array<int,array<string,mixed>> Raw rows for Water_Fact::make().
	 */
	private static function fetch_usgs(): array {
		$sites = Water_Data::usgs_sites();
		if ( ! $sites ) {
			return [];
		}

		$url = add_query_arg(
			[
				'format'       => 'json',
				'sites'        => implode( ',', $sites ),
				'parameterCd'  => '00010,00065,00060',
				'siteStatus'   => 'active',
			],
			'https://waterservices.usgs.gov/nwis/iv/'
		);

		$body = self::get_json( $url );
		if ( ! is_array( $body ) ) {
			return [];
		}

		$series = $body['value']['timeSeries'] ?? null;
		if ( ! is_array( $series ) ) {
			return [];
		}

		$rows = [];
		foreach ( $series as $ts ) {
			if ( ! is_array( $ts ) ) {
				continue;
			}
			$site_name = trim( (string) ( $ts['sourceInfo']['siteName'] ?? '' ) );
			$site_no   = trim( (string) ( $ts['sourceInfo']['siteCode'][0]['value'] ?? '' ) );
			$var_name  = html_entity_decode(
				trim( (string) ( $ts['variable']['variableName'] ?? '' ) ),
				ENT_QUOTES,
				'UTF-8'
			);
			$var_code  = trim( (string) ( $ts['variable']['variableCode'][0]['value'] ?? '' ) );
			$unit      = trim( (string) ( $ts['variable']['unit']['unitCode'] ?? '' ) );

			$latest = $ts['values'][0]['value'] ?? [];
			if ( ! is_array( $latest ) || ! $latest ) {
				continue;
			}
			$point = end( $latest );
			$value = trim( (string) ( $point['value'] ?? '' ) );
			$when  = trim( (string) ( $point['dateTime'] ?? '' ) );

			// USGS uses -999999 as its no-data sentinel. Never render it.
			if ( '' === $value || '' === $when || (float) $value <= -999998 ) {
				continue;
			}

			$label = self::usgs_label( $var_code, $var_name );
			$note  = '';

			// Water temperature is reported in Celsius; guests read
			// Fahrenheit. Converting a sourced measurement is lossless, and
			// the original reading is disclosed in the note.
			if ( '00010' === $var_code && is_numeric( $value ) ) {
				$c     = (float) $value;
				$note  = sprintf(
					/* translators: %s: the original Celsius reading. */
					__( 'converted from %s °C as reported', 'dcc-wildlife' ),
					rtrim( rtrim( number_format( $c, 1, '.', '' ), '0' ), '.' )
				);
				$value = number_format( ( $c * 9 / 5 ) + 32, 1, '.', '' ) . ' °F';
			} elseif ( '' !== $unit ) {
				$value .= ' ' . $unit;
			}

			$rows[] = [
				'label'       => $label,
				'value'       => $value,
				'tier'        => Water_Fact::TIER_LIVE,
				'source_name' => '' !== $site_name
					? sprintf(
						/* translators: 1: USGS station name, 2: USGS site number. */
						__( 'USGS %1$s (site %2$s)', 'dcc-wildlife' ),
						$site_name,
						$site_no
					)
					: __( 'USGS Water Services', 'dcc-wildlife' ),
				'source_url'  => '' !== $site_no
					? 'https://waterdata.usgs.gov/monitoring-location/' . rawurlencode( $site_no ) . '/'
					: 'https://waterdata.usgs.gov/',
				'date'        => $when,
				'note'        => $note,
			];
		}

		return $rows;
	}

	/**
	 * Prefer a plain-English label for the parameters we request; fall back
	 * to whatever USGS called it rather than inventing a name.
	 */
	private static function usgs_label( string $code, string $fallback ): string {
		switch ( $code ) {
			case '00010':
				return __( 'Water temperature', 'dcc-wildlife' );
			case '00065':
				return __( 'Gauge height', 'dcc-wildlife' );
			case '00060':
				return __( 'Discharge', 'dcc-wildlife' );
		}
		return '' !== $fallback ? $fallback : __( 'Gauge reading', 'dcc-wildlife' );
	}

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
		if ( ! is_array( $points ) ) {
			return [];
		}

		$forecast_url = trim( (string) ( $points['properties']['forecast'] ?? '' ) );
		if ( '' === $forecast_url ) {
			return [];
		}

		$forecast = self::get_json( $forecast_url );
		if ( ! is_array( $forecast ) ) {
			return [];
		}

		$updated = trim( (string) ( $forecast['properties']['updated'] ?? '' ) );
		$period  = $forecast['properties']['periods'][0] ?? null;
		if ( ! is_array( $period ) || '' === $updated ) {
			return [];
		}

		$name  = trim( (string) ( $period['name'] ?? '' ) );
		$short = trim( (string) ( $period['shortForecast'] ?? '' ) );
		$temp  = $period['temperature'] ?? null;
		$tunit = trim( (string) ( $period['temperatureUnit'] ?? '' ) );
		$wspd  = trim( (string) ( $period['windSpeed'] ?? '' ) );
		$wdir  = trim( (string) ( $period['windDirection'] ?? '' ) );

		$source_name = __( 'National Weather Service forecast', 'dcc-wildlife' );
		$rows        = [];

		if ( '' !== $short ) {
			$rows[] = [
				'label'       => '' !== $name
					? sprintf(
						/* translators: %s: NWS forecast period name, e.g. "This Afternoon". */
						__( 'Forecast — %s', 'dcc-wildlife' ),
						$name
					)
					: __( 'Forecast', 'dcc-wildlife' ),
				'value'       => is_numeric( $temp ) && '' !== $tunit
					? sprintf( '%s, %s °%s', $short, (string) $temp, $tunit )
					: $short,
				'tier'        => Water_Fact::TIER_LIVE,
				'source_name' => $source_name,
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
				'source_name' => $source_name,
				'source_url'  => 'https://www.weather.gov/',
				'date'        => $updated,
				'note'        => '',
			];
		}

		return $rows;
	}

	/**
	 * @return array<mixed>|null
	 */
	private static function get_json( string $url ): ?array {
		$res = wp_remote_get(
			$url,
			[
				'timeout'     => 8,
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
	 * Admin-only: ask USGS which active gauges exist near the property, so
	 * the owner picks real site IDs from live results instead of anyone
	 * typing a remembered number. Returns [] on any failure.
	 *
	 * @return array<int,array<string,string>>
	 */
	public static function discover_gauges(): array {
		$coords = Water_Data::coords();
		if ( null === $coords ) {
			return [];
		}

		$pad  = 0.35; // ~24 statute miles; wide enough for the chain, inside USGS limits.
		$bbox = implode(
			',',
			[
				round( $coords['lon'] - $pad, 4 ),
				round( $coords['lat'] - $pad, 4 ),
				round( $coords['lon'] + $pad, 4 ),
				round( $coords['lat'] + $pad, 4 ),
			]
		);

		$url = add_query_arg(
			[
				'format'         => 'rdb',
				'bBox'           => $bbox,
				'siteStatus'     => 'active',
				'hasDataTypeCd'  => 'iv',
			],
			'https://waterservices.usgs.gov/nwis/site/'
		);

		$res = wp_remote_get(
			$url,
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
	 * USGS RDB is tab-separated: '#' comment lines, one header row, one
	 * column-format row, then data.
	 *
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
			// The format row ("5s", "12n"…) directly follows the header.
			if ( isset( $cols[0] ) && preg_match( '/^\d+[sndx]$/', trim( $cols[0] ) ) ) {
				continue;
			}
			$row = [];
			foreach ( $header as $i => $key ) {
				$row[ $key ] = isset( $cols[ $i ] ) ? trim( $cols[ $i ] ) : '';
			}
			$site = $row['site_no'] ?? '';
			if ( '' === $site ) {
				continue;
			}
			$out[] = [
				'site_no'    => $site,
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
