<?php
/**
 * Water module — stored configuration and the almanac layer.
 *
 * THE ALMANAC SHIPS EMPTY, ON PURPOSE.
 *
 * This plugin was built in an environment with no outbound network access,
 * so no lake depth, Secchi reading, gauge ID or species list could be
 * verified against USGS, FWC or the Lake County Water Atlas. Under the
 * owner's rule, an unverifiable figure must not reach the page — so none
 * were written. Facts enter this layer one of three ways, all attributed:
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
			'live_enabled' => 0,   // Off by default — see readme/CLAUDE.md for the reasoning.
			'lat'          => '',
			'lon'          => '',
			'usgs_sites'   => [],  // Populated by discovery against the live USGS API.
			'dock_notes'   => '',
			'dock_updated' => '',
			'almanac'      => [],  // Intentionally empty. See the class docblock.
			'links'        => self::default_links(),
			'reports'      => [],  // "Local reports & charters" — owner-supplied only.
		];
	}

	/**
	 * Authority links only.
	 *
	 * Provenance: every URL here is one the OWNER named in his own source
	 * list, reproduced at its root. None was reachable from the build
	 * environment, so none is verified by this plugin's author. They are
	 * links, not claims — no fact is asserted about their contents.
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
				'label' => __( 'Lake County Water Atlas (USF Water Institute)', 'dcc-wildlife' ),
				'url'   => 'https://lake.wateratlas.usf.edu/',
			],
			[
				'label' => __( 'USGS water data', 'dcc-wildlife' ),
				'url'   => 'https://waterdata.usgs.gov/',
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
	 * @return array<string,Water_Fact[]>
	 */
	public static function almanac(): array {
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

	/**
	 * Owner's first-hand notes. Free text — the one part of this module no
	 * published source can provide, and the only part that is allowed to
	 * speak without a citation, because it is explicitly labelled as the
	 * owner's own observation rather than published data.
	 *
	 * @return array{text:string,updated:string}|null
	 */
	public static function dock_notes(): ?array {
		$text = trim( (string) self::get( 'dock_notes' ) );
		if ( '' === $text ) {
			return null;
		}
		return [
			'text'    => $text,
			'updated' => trim( (string) self::get( 'dock_updated' ) ),
		];
	}

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
