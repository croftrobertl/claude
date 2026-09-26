<?php
/**
 * Guide settings — everything tunable about the wildlife guide itself.
 *
 * A SECOND option, deliberately, rather than more keys in `dcc_wl_water`.
 * The water option is 24 keys with its own sanitiser and its own per-row merge
 * for the chain, the almanac and the link lists; adding display settings to it
 * would mean one sanitiser reasoning about two unrelated shapes, and a mistake
 * in the guide half could reach the water module's stored rows. They share the
 * settings PAGE and the settings GROUP, so one form and one Save button still
 * covers both — only the storage is separate.
 *
 * Every key here CHANGES SOMETHING. A setting that does not is worse than a
 * missing one: it invites a decision and then ignores it, which is exactly why
 * the month widget's "Show season countdown" switcher was removed in 1.31.0.
 * If a key ever stops being read, delete it rather than leave it on the page.
 *
 * WHAT IS DELIBERATELY NOT HERE, because "everything plausibly tunable" is not
 * the same as "everything":
 *
 *  - The photo credits panel and the modification notice. Both are LICENCE
 *    obligations — four photographs carry a real CC BY requirement — so they
 *    are not the owner's to switch off by accident.
 *  - The footnote row. It is the container for the prose guide AND the credits,
 *    so a switch on it is a switch on both of those, by another name. It is
 *    also the only door to the month picker on the hub.
 *  - The flag key. The 1.18.0 rule is that a colour carrying meaning has a key
 *    beside it, so the key cannot be hidden while the marks remain — and the
 *    other way round would take the danger mark off four venomous snakes. One
 *    checkbox is the wrong distance from that.
 *  - The crawlable prose guide. Hiding content that exists for crawlers is a
 *    guidelines problem, not a preference.
 *  - The Atlas fetch budget and the map fetch ceiling. Setting either too low
 *    does not fail, it draws a map with waters silently missing, which is the
 *    hardest class of bug to notice.
 *  - The photo drop folder. Changing it orphans an import that has already run.
 *  - Whether the safety section is month-filtered. The owner settled that: it
 *    never is.
 *
 * @package DCC_Wildlife
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Guide_Data {

	public const OPTION = 'dcc_wl_guide';

	/**
	 * Every default reproduces 1.31.0 EXACTLY. That is the promise this class
	 * makes, and test-guide-settings.php checks it by rendering both and
	 * comparing, not by reading the numbers back out of here.
	 *
	 * @return array<string,mixed>
	 */
	public static function defaults(): array {
		return [
			/* ---- what the guide shows ---------------------------------- */
			'show_spotlight' => 1,
			'show_search'    => 1,
			'show_subnav'    => 1,
			'show_jump'      => 1,
			'show_compact'   => 1,
			// The water module's "Tonight on the canal" moon card. A display
			// element with no data cost — pure client-side astronomy, no
			// network call — so it is safe to switch either way, which is why
			// it lives here with the other display choices rather than beside
			// the water module's capability settings.
			'show_moon'      => 1,

			/* ---- how the species list opens ---------------------------- */
			// 'deck' is the paged carousel; 'compact' is the short-row list.
			'default_view'   => 'deck',

			/* ---- thresholds -------------------------------------------- */
			// Species::LIKELY_MIN_SPOTLIGHT and LIKELY_PEAK. Kept as settings
			// AND as constants: the constants remain the defaults, so a site
			// with nothing stored behaves exactly as it always has.
			'spotlight_min'  => Species::LIKELY_MIN_SPOTLIGHT,
			'peak_score'     => Species::LIKELY_PEAK,
			// The punctuation-insensitive search fallback ("blackcrowned")
			// needs a floor, or two letters match half the registry.
			'search_squash_min' => 3,

			/* ---- the hub ----------------------------------------------- */
			'hub_preview_max' => 5,
			'now_names_max'   => 2,
			'month_art_max'   => 3,

			/* ---- advanced ---------------------------------------------- */
			'deck_rows'      => 3,
			// 0 means "work it out from the page", which canal.js does by
			// probing for a sticky header. A number here overrides that.
			'sticky_offset'  => 0,
			'show_jsonld'    => 1,
			// Minutes. The chain map's assembled payload; see Water_Live.
			'map_cache_ttl'  => 180,
			'map_warm'       => 1,
		];
	}

	/**
	 * How each key is validated. The TYPE is what the sanitiser dispatches on,
	 * so a new key cannot be added without saying what it is.
	 *
	 * @return array<string,array<string,mixed>>
	 */
	public static function schema(): array {
		return [
			'show_spotlight'    => [ 'type' => 'bool' ],
			'show_search'       => [ 'type' => 'bool' ],
			'show_subnav'       => [ 'type' => 'bool' ],
			'show_jump'         => [ 'type' => 'bool' ],
			'show_compact'      => [ 'type' => 'bool' ],
			'show_moon'         => [ 'type' => 'bool' ],
			'show_jsonld'       => [ 'type' => 'bool' ],
			'map_warm'          => [ 'type' => 'bool' ],
			'default_view'      => [ 'type' => 'enum', 'values' => [ 'deck', 'compact' ] ],
			'spotlight_min'     => [ 'type' => 'int', 'min' => 1, 'max' => 3 ],
			'peak_score'        => [ 'type' => 'int', 'min' => 1, 'max' => 3 ],
			'search_squash_min' => [ 'type' => 'int', 'min' => 1, 'max' => 8 ],
			'hub_preview_max'   => [ 'type' => 'int', 'min' => 0, 'max' => 12 ],
			'now_names_max'     => [ 'type' => 'int', 'min' => 0, 'max' => 6 ],
			'month_art_max'     => [ 'type' => 'int', 'min' => 0, 'max' => 6 ],
			'deck_rows'         => [ 'type' => 'int', 'min' => 1, 'max' => 4 ],
			'sticky_offset'     => [ 'type' => 'int', 'min' => 0, 'max' => 400 ],
			'map_cache_ttl'     => [ 'type' => 'int', 'min' => 5, 'max' => 1440 ],
		];
	}

	/**
	 * Stored values over defaults, merged at READ time.
	 *
	 * Same doctrine as Water_Data::all(): a key added in a new version reads
	 * its default on a site whose stored row predates it, so a new feature is
	 * never silently off. Nothing here is an array, so there is no nested
	 * shadowing to guard against — the reason this option was kept flat.
	 *
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

	public static function flag( string $key ): bool {
		return 1 === (int) self::get( $key );
	}

	public static function num( string $key ): int {
		return (int) self::get( $key );
	}

	/**
	 * Validate a whole posted option.
	 *
	 * AN UNCHECKED CHECKBOX POSTS NOTHING. That is the trap this method is
	 * shaped around: it walks the SCHEMA, not the input, so an absent boolean
	 * becomes 0 rather than keeping its old value. Reading the input's keys
	 * instead would make a box impossible to untick — it would save as
	 * "unchanged" every time.
	 *
	 * @param mixed $input
	 * @return array<string,mixed>
	 */
	public static function sanitize( $input ): array {
		$in   = is_array( $input ) ? $input : [];
		$out  = [];
		$defs = self::defaults();

		foreach ( self::schema() as $key => $rule ) {
			$raw     = $in[ $key ] ?? null;
			$default = $defs[ $key ];

			switch ( $rule['type'] ) {
				case 'bool':
					// Absent means unticked, which is 0 — never the default.
					$out[ $key ] = ( null !== $raw && '' !== $raw && '0' !== (string) $raw ) ? 1 : 0;
					break;

				case 'enum':
					$val         = is_scalar( $raw ) ? (string) $raw : '';
					$out[ $key ] = in_array( $val, (array) $rule['values'], true ) ? $val : $default;
					break;

				case 'int':
					// A blank or non-numeric field falls back to the default
					// rather than to zero: an empty box means "I did not
					// choose", and zero is a real value for some of these.
					if ( null === $raw || '' === $raw || ! is_numeric( $raw ) ) {
						$out[ $key ] = (int) $default;
						break;
					}
					$out[ $key ] = max( (int) $rule['min'], min( (int) $rule['max'], (int) $raw ) );
					break;

				default:
					$out[ $key ] = $default;
			}
		}

		return $out;
	}

	/* =====================================================================
	 * Per-placement overrides
	 *
	 * An Elementor SWITCHER has two states and no third, so it cannot express
	 * "inherit" — Contact Form 1.6.0 found that the hard way. Every boolean
	 * override is therefore a SELECT whose empty value means inherit, and these
	 * two resolvers are the only place that mapping lives.
	 *
	 * THE RULE ABOUT WHAT MAY BE OVERRIDDEN EITHER WAY. A setting that is off
	 * for DISPLAY reasons can be turned back on for one placement. A setting
	 * that is off for CAPABILITY reasons — the live layer, the map, the fishing
	 * almanac, all of which govern network calls or data that may not exist —
	 * may only be HIDDEN by a placement, never forced on. Otherwise a widget
	 * could promise a section the site has nothing to fill.
	 * ================================================================== */

	/**
	 * The control SHAPE for a three-way override, defined here on purpose.
	 *
	 * Its option keys have to be exactly what resolve() accepts, so keeping the
	 * control and the resolver in one file is the coupling that matters — four
	 * widgets each writing their own option list is how one of them ends up
	 * offering a value nothing reads.
	 *
	 * NOT a SWITCHER. A switcher has two states and no third, so it cannot say
	 * "leave this to the settings page": every placement would be forced to
	 * assert a value, and a widget saved today would freeze today's default for
	 * ever. Contact Form 1.6.0 found that; the empty option is the fix.
	 *
	 * @return array<string,mixed>
	 */
	public static function three_way( string $label, bool $hide_only = false ): array {
		$options = [ '' => __( 'Use the setting', 'dcc-wildlife' ) ];
		if ( ! $hide_only ) {
			$options['on'] = __( 'Show', 'dcc-wildlife' );
		}
		$options['off'] = __( 'Hide', 'dcc-wildlife' );

		return [
			'label'   => $label,
			// The literal, not \Elementor\Controls_Manager::SELECT: this class
			// must stay loadable with Elementor absent, and the constant's
			// value IS this string.
			'type'    => 'select',
			'default' => '',
			'options' => $options,
		];
	}

	/**
	 * A number control that inherits when left empty.
	 *
	 * @return array<string,mixed>
	 */
	public static function number_control( string $label, string $key ): array {
		$rule = self::schema()[ $key ] ?? [];
		return [
			'label'       => $label,
			'type'        => 'number',   // Controls_Manager::NUMBER; see above.
			'default'     => '',
			'min'         => (int) ( $rule['min'] ?? 0 ),
			'max'         => (int) ( $rule['max'] ?? 999 ),
			'placeholder' => __( 'Use the setting', 'dcc-wildlife' ),
		];
	}

	/**
	 * @param mixed $override '' or null to inherit, 'on', or 'off'.
	 */
	public static function resolve( $override, string $key ): bool {
		$v = is_scalar( $override ) ? (string) $override : '';
		if ( 'on' === $v ) {
			return true;
		}
		if ( 'off' === $v ) {
			return false;
		}
		return self::flag( $key );
	}

	/**
	 * A hide-only override, for anything gated by capability rather than taste.
	 *
	 * @param mixed $override
	 */
	public static function resolve_hide( $override, bool $capable ): bool {
		return 'off' === ( is_scalar( $override ) ? (string) $override : '' ) ? false : $capable;
	}

	/**
	 * A numeric override, clamped by the same schema bounds the settings page
	 * uses. An empty field inherits — it is not zero, because zero is a real
	 * value for several of these.
	 *
	 * @param mixed $override
	 */
	public static function resolve_num( $override, string $key ): int {
		if ( null === $override || '' === $override || ! is_numeric( $override ) ) {
			return self::num( $key );
		}
		$rule = self::schema()[ $key ] ?? [];
		$v    = (int) $override;
		if ( isset( $rule['min'], $rule['max'] ) ) {
			$v = max( (int) $rule['min'], min( (int) $rule['max'], $v ) );
		}
		return $v;
	}

	/**
	 * An enum override, checked against the schema's own value list.
	 *
	 * @param mixed $override
	 */
	public static function resolve_enum( $override, string $key ): string {
		$v      = is_scalar( $override ) ? (string) $override : '';
		$values = (array) ( self::schema()[ $key ]['values'] ?? [] );
		return in_array( $v, $values, true ) ? $v : (string) self::get( $key );
	}

	/**
	 * Write the merged option back on upgrade, so the stored row DESCRIBES
	 * behaviour rather than waiting for a manual save. Same reasoning as
	 * Water_Data::persist_merged(); simpler here because nothing is nested.
	 *
	 * A site with nothing stored is left alone — all() already answers with
	 * defaults and a row saying the same thing would only be clutter.
	 */
	public static function persist_merged(): void {
		$stored = get_option( self::OPTION, null );
		if ( ! is_array( $stored ) ) {
			return;
		}
		update_option( self::OPTION, wp_parse_args( $stored, self::defaults() ) );
	}
}
