<?php
/**
 * The species registry and monthly likelihood calendar.
 *
 * Both datasets ship as PHP data (no external services) and are filterable
 * via `dcc_wl_species` and `dcc_wl_calendar`.
 */

namespace DCC_WL;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Species {

	/**
	 * Likelihood scale: 0 = rare/absent, 1 = possible, 2 = good, 3 = peak.
	 */
	public const LIKELY_MIN_SPOTLIGHT = 2;
	public const LIKELY_PEAK          = 3;

	/**
	 * Group slugs => translated labels, in display order.
	 *
	 * @return array<string,string>
	 */
	public static function groups(): array {
		return [
			'critters' => __( 'Critters', 'dcc-wildlife' ),
			'birds'    => __( 'Birds', 'dcc-wildlife' ),
			'plants'   => __( 'Plants', 'dcc-wildlife' ),
		];
	}

	/**
	 * The species registry. Filterable via `dcc_wl_species`.
	 *
	 * `best` = time of day to look; `where` = where to look from the dock /
	 * canal bank. Facts were salvaged from the owner's earlier tracker.
	 *
	 * @return array<string,array<string,mixed>>
	 */
	public static function registry(): array {
		$species = [
			'alligator'  => [
				'emoji' => '🐊',
				'name'  => __( 'Alligator', 'dcc-wildlife' ),
				'group' => 'critters',
				'fact'  => __( 'Florida’s state reptile — they can live up to 50 years in the wild and maintain the same territory for decades.', 'dcc-wildlife' ),
				'best'  => __( 'warm, sunny middays', 'dcc-wildlife' ),
				'where' => __( 'basking on sunny banks and floating log-still mid-canal', 'dcc-wildlife' ),
			],
			'manatee'    => [
				'emoji' => '🦭',
				'name'  => __( 'Manatee', 'dcc-wildlife' ),
				'group' => 'critters',
				'fact'  => __( 'These gentle giants migrate to warmer waters in winter. They’re often spotted in the Dora Canal Nov–Mar.', 'dcc-wildlife' ),
				'best'  => __( 'calm, sunny mornings', 'dcc-wildlife' ),
				'where' => __( 'slow water mid-canal — watch for swirls and a round snout surfacing', 'dcc-wildlife' ),
			],
			'otter'      => [
				'emoji' => '🦦',
				'name'  => __( 'River Otter', 'dcc-wildlife' ),
				'group' => 'critters',
				'fact'  => __( 'Playful and semi-aquatic, otters can stay underwater for up to 8 minutes. Listen for their whistles!', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'along the canal banks near fallen trees and root tangles', 'dcc-wildlife' ),
			],
			'turtle'     => [
				'emoji' => '🐢',
				'name'  => __( 'Turtle', 'dcc-wildlife' ),
				'group' => 'critters',
				'fact'  => __( 'Several turtle species live in the Harris Chain, including the Florida softshell and gopher tortoise.', 'dcc-wildlife' ),
				'best'  => __( 'sunny afternoons', 'dcc-wildlife' ),
				'where' => __( 'lined up on half-sunken logs across from the dock', 'dcc-wildlife' ),
			],
			'snake'      => [
				'emoji' => '🐍',
				'name'  => __( 'Snake', 'dcc-wildlife' ),
				'group' => 'critters',
				'fact'  => __( 'Most canal snakes are harmless water snakes. Banded water snakes are common around dock pilings.', 'dcc-wildlife' ),
				'best'  => __( 'warm afternoons', 'dcc-wildlife' ),
				'where' => __( 'around dock pilings and sunny shoreline brush', 'dcc-wildlife' ),
			],
			'fish'       => [
				'emoji' => '🐟',
				'name'  => __( 'Fish', 'dcc-wildlife' ),
				'group' => 'critters',
				'fact'  => __( 'The Harris Chain holds world-class largemouth bass. Schools of bluegill and crappie are visible in clear shallows.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'clear shallows right off the dock — look straight down', 'dcc-wildlife' ),
			],
			'eagle'      => [
				'emoji' => '🦅',
				'name'  => __( 'Bald Eagle', 'dcc-wildlife' ),
				'group' => 'birds',
				'fact'  => __( 'These raptors build the largest nests of any North American bird — some weigh over a ton!', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'tall pines and bare snags above the treeline', 'dcc-wildlife' ),
			],
			'osprey'     => [
				'emoji' => '🐦',
				'name'  => __( 'Osprey', 'dcc-wildlife' ),
				'group' => 'birds',
				'fact'  => __( 'Osprey dive feet-first into water to catch fish. Their talons have reversible toes for a better grip.', 'dcc-wildlife' ),
				'best'  => __( 'mid-morning', 'dcc-wildlife' ),
				'where' => __( 'circling high over open water, then a sudden plunge', 'dcc-wildlife' ),
			],
			'anhinga'    => [
				'emoji' => '🐦',
				'name'  => __( 'Anhinga', 'dcc-wildlife' ),
				'group' => 'birds',
				'fact'  => __( 'Often called “Snake Birds,” they must dry their wings in the sun because their feathers aren’t waterproof.', 'dcc-wildlife' ),
				'best'  => __( 'sunny middays', 'dcc-wildlife' ),
				'where' => __( 'perched wings-out on snags and dock rails, drying off', 'dcc-wildlife' ),
			],
			'heron'      => [
				'emoji'  => '🦢',
				'name'   => __( 'Great Blue Heron', 'dcc-wildlife' ),
				'group'  => 'birds',
				'fact'   => __( 'Great Blue Herons stand motionless for minutes before striking prey with lightning speed.', 'dcc-wildlife' ),
				'best'   => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where'  => __( 'standing statue-still in the shallows along the bank', 'dcc-wildlife' ),
				'mascot' => true,
			],
			'egret'      => [
				'emoji' => '🦤',
				'name'  => __( 'Snowy Egret', 'dcc-wildlife' ),
				'group' => 'birds',
				'fact'  => __( 'Snowy egrets use their bright yellow feet to stir up prey hiding in the mud beneath the water.', 'dcc-wildlife' ),
				'best'  => __( 'early mornings', 'dcc-wildlife' ),
				'where' => __( 'wading the muddy edges where the bank meets the water', 'dcc-wildlife' ),
			],
			'kingfisher' => [
				'emoji' => '🐦',
				'name'  => __( 'Belted Kingfisher', 'dcc-wildlife' ),
				'group' => 'birds',
				'fact'  => __( 'Belted Kingfishers hover over water then dive headfirst at up to 25 mph to catch small fish.', 'dcc-wildlife' ),
				'best'  => __( 'all day', 'dcc-wildlife' ),
				'where' => __( 'low perches and lines over the water — listen for the rattle call', 'dcc-wildlife' ),
			],
			'cypress'    => [
				'emoji' => '🌲',
				'name'  => __( 'Bald Cypress', 'dcc-wildlife' ),
				'group' => 'plants',
				'fact'  => __( 'These trees grow “knees” above the waterline for stability and can live over 2,000 years.', 'dcc-wildlife' ),
				'best'  => __( 'golden hour', 'dcc-wildlife' ),
				'where' => __( 'lining both sides of the canal — the knees poke up at the waterline', 'dcc-wildlife' ),
			],
			'moss'       => [
				'emoji' => '🌿',
				'name'  => __( 'Spanish Moss', 'dcc-wildlife' ),
				'group' => 'plants',
				'fact'  => __( 'An “air plant” that gets all nutrients from rain and fog — it doesn’t harm the trees it drapes.', 'dcc-wildlife' ),
				'best'  => __( 'any time', 'dcc-wildlife' ),
				'where' => __( 'draped from the cypress and oak canopy overhead', 'dcc-wildlife' ),
			],
			'fern'       => [
				'emoji' => '🌱',
				'name'  => __( 'Resurrection Fern', 'dcc-wildlife' ),
				'group' => 'plants',
				'fact'  => __( 'Can lose 97% of its water and appear completely dead, then spring fully back to life after rain.', 'dcc-wildlife' ),
				'best'  => __( 'right after rain', 'dcc-wildlife' ),
				'where' => __( 'carpeting the tops of big oak and cypress limbs', 'dcc-wildlife' ),
			],
			'lily'       => [
				'emoji' => '🌸',
				'name'  => __( 'Water Lily', 'dcc-wildlife' ),
				'group' => 'plants',
				'fact'  => __( 'Their large floating leaves provide shade and protection for fish — key habitat in the canal.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'quiet coves and canal edges — blooms close up by afternoon', 'dcc-wildlife' ),
			],
			'palmetto'   => [
				'emoji' => '🌴',
				'name'  => __( 'Saw Palmetto', 'dcc-wildlife' ),
				'group' => 'plants',
				'fact'  => __( 'Fire-resistant plants that provide vital cover for local wildlife including gopher tortoises.', 'dcc-wildlife' ),
				'best'  => __( 'any time', 'dcc-wildlife' ),
				'where' => __( 'the shady understory along the banks', 'dcc-wildlife' ),
			],
		];

		/**
		 * Filter the species registry.
		 *
		 * @param array $species Keyed by species id; each entry has emoji,
		 *                       name, group, fact, best, where, and an
		 *                       optional `mascot` flag.
		 */
		return apply_filters( 'dcc_wl_species', $species );
	}

	/**
	 * Monthly likelihood per species, Jan..Dec (0–3). Filterable via
	 * `dcc_wl_calendar`.
	 *
	 * @return array<string,int[]>
	 */
	public static function calendar(): array {
		$calendar = [
			//                 J  F  M  A  M  J  J  A  S  O  N  D
			'alligator'  => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Basking peaks with warm sun; most active Apr–Sep.
			'manatee'    => [ 3, 3, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3 ], // Warm-water refuge season Nov–Mar.
			'otter'      => [ 2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2 ],
			'turtle'     => [ 1, 1, 2, 3, 3, 3, 3, 3, 2, 2, 1, 1 ],
			'snake'      => [ 0, 0, 1, 2, 2, 2, 2, 2, 2, 1, 0, 0 ],
			'fish'       => [ 2, 2, 3, 3, 2, 2, 2, 2, 2, 3, 3, 2 ], // Bass spawn Feb–Apr; fall bite Oct–Nov.
			'eagle'      => [ 3, 3, 2, 1, 0, 0, 0, 0, 1, 2, 3, 3 ], // Nesting season Oct–Apr.
			'osprey'     => [ 2, 2, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2 ],
			'anhinga'    => [ 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2 ],
			'heron'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Year-round resident — always on the spotlight.
			'egret'      => [ 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2 ],
			'kingfisher' => [ 2, 2, 1, 1, 1, 1, 1, 1, 2, 3, 3, 3 ], // Winter visitors swell numbers.
			'cypress'    => [ 1, 1, 2, 3, 3, 3, 3, 3, 2, 3, 3, 2 ], // Spring green-up; fall rust color Oct–Nov.
			'moss'       => [ 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2 ],
			'fern'       => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Revives spectacularly after summer rains.
			'lily'       => [ 0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0 ], // Blooming May–Sep.
			'palmetto'   => [ 1, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1, 1 ], // Blooms late spring–summer.
		];

		/**
		 * Filter the monthly likelihood calendar.
		 *
		 * @param array $calendar Keyed by species id; 12 ints (Jan..Dec), 0–3.
		 */
		return apply_filters( 'dcc_wl_calendar', $calendar );
	}

	/**
	 * Registry + calendar merged into a JS-friendly ordered list, with the
	 * filtered values normalized (12 months per species, each clamped 0–3).
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function dataset(): array {
		$calendar = self::calendar();
		$dataset  = [];

		foreach ( self::registry() as $id => $sp ) {
			$months = isset( $calendar[ $id ] ) && is_array( $calendar[ $id ] )
				? array_values( $calendar[ $id ] )
				: [];
			$months = array_pad( array_slice( $months, 0, 12 ), 12, 0 );
			$months = array_map(
				static fn( $v ): int => max( 0, min( 3, (int) $v ) ),
				$months
			);

			$dataset[] = [
				'id'     => (string) $id,
				'emoji'  => (string) ( $sp['emoji'] ?? '' ),
				'name'   => (string) ( $sp['name'] ?? $id ),
				'group'  => (string) ( $sp['group'] ?? 'critters' ),
				'fact'   => (string) ( $sp['fact'] ?? '' ),
				'best'   => (string) ( $sp['best'] ?? '' ),
				'where'  => (string) ( $sp['where'] ?? '' ),
				'mascot' => ! empty( $sp['mascot'] ),
				'months' => $months,
			];
		}

		return $dataset;
	}

	/**
	 * "Best: Nov–Mar"-style label derived from a species' 12-month row.
	 * Uses the months at value 3, falling back to the months at the row's
	 * max value; ranges wrap across the year end.
	 */
	public static function best_months_label( array $months ): string {
		$months = array_pad( array_slice( array_values( $months ), 0, 12 ), 12, 0 );
		$max    = max( $months );
		if ( $max <= 0 ) {
			return '';
		}

		$has_peak = in_array( self::LIKELY_PEAK, $months, true );
		$target   = $has_peak ? self::LIKELY_PEAK : $max;
		$selected = array_map( static fn( $v ): bool => (int) $v === $target, $months );

		if ( ! in_array( false, $selected, true ) ) {
			return __( 'Year-round', 'dcc-wildlife' );
		}

		$abbrevs = self::month_abbrevs();
		$ranges  = [];
		for ( $i = 0; $i < 12; $i++ ) {
			// A run starts where the previous (circular) month is unselected.
			if ( ! $selected[ $i ] || $selected[ ( $i + 11 ) % 12 ] ) {
				continue;
			}
			$end = $i;
			while ( $selected[ ( $end + 1 ) % 12 ] ) {
				$end = ( $end + 1 ) % 12;
			}
			$ranges[] = $i === $end
				? $abbrevs[ $i ]
				: sprintf(
					/* translators: 1: first month abbreviation, 2: last month abbreviation. */
					_x( '%1$s–%2$s', 'month range', 'dcc-wildlife' ),
					$abbrevs[ $i ],
					$abbrevs[ $end ]
				);
		}

		return implode( _x( ', ', 'month range separator', 'dcc-wildlife' ), $ranges );
	}

	/**
	 * Localized month abbreviations, Jan..Dec.
	 *
	 * @return string[]
	 */
	public static function month_abbrevs(): array {
		global $wp_locale;
		$out = [];
		for ( $m = 1; $m <= 12; $m++ ) {
			$out[] = $wp_locale instanceof \WP_Locale
				? $wp_locale->get_month_abbrev( $wp_locale->get_month( $m ) )
				: gmdate( 'M', gmmktime( 0, 0, 0, $m, 1, 2000 ) );
		}
		return $out;
	}

	/**
	 * Localized full month names, Jan..Dec.
	 *
	 * @return string[]
	 */
	public static function month_names(): array {
		global $wp_locale;
		$out = [];
		for ( $m = 1; $m <= 12; $m++ ) {
			$out[] = $wp_locale instanceof \WP_Locale
				? $wp_locale->get_month( $m )
				: gmdate( 'F', gmmktime( 0, 0, 0, $m, 1, 2000 ) );
		}
		return $out;
	}
}
