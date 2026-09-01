<?php
/**
 * The species registry and monthly likelihood calendar.
 *
 * Both datasets ship as PHP data (no external services) and are filterable
 * via `dcc_wl_species` and `dcc_wl_calendar`.
 *
 * ACCURACY (v1.11.0). Every entry now carries a scientific name and the facts
 * were re-verified against authoritative sources (FWC, Cornell Lab / All About
 * Birds, USF Plant Atlas, USGS, USFWS, Florida Museum). The audit trail — what
 * changed and why — is in WATER-SOURCES.md under "Wildlife guide accuracy pass".
 * Notable corrections baked in here: the canal turtles no longer include the
 * dry-upland gopher tortoise; the manatee is framed as the rare, recent,
 * warm-month visitor it actually is (not a winter regular); the bald-cypress
 * "knees" are described as an unresolved mystery, not a settled fact; the wood
 * stork is a post-2026 Endangered-list-recovery success; the resurrection fern
 * uses its current name (Pleopeltis michauxiana). Facts stay warm and readable —
 * the sourcing lives in the docs, not on the guest's screen — but nothing here
 * is a claim a naturalist could fault.
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
	 * `sci`   = scientific name (italicised in the detail sheet);
	 * `best`  = time of day to look; `where` = where to look from the dock /
	 * canal bank. `emoji` is a fallback only — species with a bespoke sprite in
	 * class-sprites.php never show it.
	 *
	 * @return array<string,array<string,mixed>>
	 */
	public static function registry(): array {
		$species = [
			// ---- CRITTERS ----------------------------------------------
			'alligator'  => [
				'emoji' => '🐊',
				'name'  => __( 'Alligator', 'dcc-wildlife' ),
				'sci'   => 'Alligator mississippiensis',
				'group' => 'critters',
				'fact'  => __( 'Florida’s state reptile. In spring the big bulls bellow at a pitch you feel as much as hear — hard enough to tremble the water into a fine spray off their backs.', 'dcc-wildlife' ),
				'best'  => __( 'warm, sunny middays', 'dcc-wildlife' ),
				'where' => __( 'basking on sunny banks, or holding log-still mid-canal', 'dcc-wildlife' ),
			],
			'manatee'    => [
				'emoji' => '🦭',
				'name'  => __( 'Manatee', 'dcc-wildlife' ),
				'sci'   => 'Trichechus manatus latirostris',
				'group' => 'critters',
				'fact'  => __( 'A rare and special visitor: the first manatee ever recorded in the Harris Chain arrived in 2015, and one has wandered up into the canal only a handful of times since — most likely in the warmer months. They’re kin to elephants, not seals.', 'dcc-wildlife' ),
				'best'  => __( 'calm, sunny days', 'dcc-wildlife' ),
				'where' => __( 'slow water mid-canal — watch for a swirl and a round snout surfacing', 'dcc-wildlife' ),
			],
			'otter'      => [
				'emoji' => '🦦',
				'name'  => __( 'River Otter', 'dcc-wildlife' ),
				'sci'   => 'Lontra canadensis',
				'group' => 'critters',
				'fact'  => __( 'Playful and semi-aquatic, it can hold its breath up to eight minutes when it needs to. Listen for sharp whistles, and look for well-worn “latrine” spots where a family checks in along the bank.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'along the banks near fallen trees and root tangles', 'dcc-wildlife' ),
			],
			'turtle'     => [
				'emoji' => '🐢',
				'name'  => __( 'Turtles', 'dcc-wildlife' ),
				'sci'   => 'Pseudemys spp. & Apalone ferox',
				'group' => 'critters',
				'fact'  => __( 'Peninsula and red-bellied cooters and yellow-bellied sliders line the logs to bask. The flat, leathery Florida softshell is the odd one out — it snorkels at the surface with its body buried in the mud.', 'dcc-wildlife' ),
				'best'  => __( 'sunny afternoons', 'dcc-wildlife' ),
				'where' => __( 'lined up on half-sunken logs across from the dock', 'dcc-wildlife' ),
			],
			'snake'      => [
				'emoji' => '🐍',
				'name'  => __( 'Water Snake', 'dcc-wildlife' ),
				'sci'   => 'Nerodia fasciata pictiventris',
				'group' => 'critters',
				'fact'  => __( 'Nearly every snake you’ll see over the water is a harmless banded watersnake. Florida’s one venomous water snake — the cottonmouth — lives here too, so enjoy any snake from a distance and never try to handle it.', 'dcc-wildlife' ),
				'best'  => __( 'warm afternoons', 'dcc-wildlife' ),
				'where' => __( 'around dock pilings and sunny shoreline brush', 'dcc-wildlife' ),
			],
			'fish'       => [
				'emoji' => '🐟',
				'name'  => __( 'Largemouth Bass', 'dcc-wildlife' ),
				'sci'   => 'Micropterus salmoides',
				'group' => 'critters',
				'fact'  => __( 'The Harris Chain is a nationally known trophy-bass water — Lake Dora has given up largemouth over twelve pounds. Bluegill and black crappie school in the clear shallows around them.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'clear shallows off the dock, and along the deep hydrilla edges', 'dcc-wildlife' ),
			],
			'applesnail' => [
				'emoji' => '🐌',
				'name'  => __( 'Apple Snail', 'dcc-wildlife' ),
				'sci'   => 'Pomacea paludosa',
				'group' => 'critters',
				'fact'  => __( 'The humble native apple snail is the hinge the whole canal turns on — it’s the main food of the limpkin and the endangered snail kite. Look for its little clusters of pale, pearly eggs on stems just above the waterline.', 'dcc-wildlife' ),
				'best'  => __( 'warm months', 'dcc-wildlife' ),
				'where' => __( 'on emergent stems and bulrush right at the water’s edge', 'dcc-wildlife' ),
			],

			// ---- BIRDS -------------------------------------------------
			'eagle'      => [
				'emoji' => '🦅',
				'name'  => __( 'Bald Eagle', 'dcc-wildlife' ),
				'sci'   => 'Haliaeetus leucocephalus',
				'group' => 'birds',
				'fact'  => __( 'Bald eagles build the largest nests of any North American bird — one Florida nest weighed over two tons after years of reuse. Ours nest through the cool season, opposite their northern cousins.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'tall pines and bare snags above the treeline', 'dcc-wildlife' ),
			],
			'osprey'     => [
				'emoji' => '🐦',
				'name'  => __( 'Osprey', 'dcc-wildlife' ),
				'sci'   => 'Pandion haliaetus',
				'group' => 'birds',
				'fact'  => __( 'The only raptor that plunges feet-first — sometimes fully underwater — to catch fish. A reversible outer toe lets it grip a slippery catch and line it up head-first in flight to cut the drag.', 'dcc-wildlife' ),
				'best'  => __( 'mid-morning', 'dcc-wildlife' ),
				'where' => __( 'circling high over open water, then a sudden plunge', 'dcc-wildlife' ),
			],
			'anhinga'    => [
				'emoji' => '🐦',
				'name'  => __( 'Anhinga', 'dcc-wildlife' ),
				'sci'   => 'Anhinga anhinga',
				'group' => 'birds',
				'fact'  => __( 'The “snakebird” swims with only its sinuous neck above the surface. Its feathers aren’t waterproof — a feature, not a flaw, since it sinks to hunt — so it must perch with wings spread wide to dry.', 'dcc-wildlife' ),
				'best'  => __( 'sunny middays', 'dcc-wildlife' ),
				'where' => __( 'perched wings-out on snags and dock rails, drying off', 'dcc-wildlife' ),
			],
			'heron'      => [
				'emoji' => '🐦',
				'name'  => __( 'Great Blue Heron', 'dcc-wildlife' ),
				'sci'   => 'Ardea herodias',
				'group' => 'birds',
				'fact'  => __( 'A special hinge in the sixth neck bone lets the great blue coil and fire its bill forward like a loosed spring. With rod-rich eyes, it can hunt by day or night.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'standing statue-still in the shallows along the bank', 'dcc-wildlife' ),
			],
			'egret'      => [
				'emoji' => '🐦',
				'name'  => __( 'Snowy Egret', 'dcc-wildlife' ),
				'sci'   => 'Egretta thula',
				'group' => 'birds',
				'fact'  => __( 'It shuffles its golden-yellow feet to spook prey from the mud. Its lacy plumes were nearly hunted out for ladies’ hats a century ago — the fight to stop that helped launch the Audubon movement.', 'dcc-wildlife' ),
				'best'  => __( 'early mornings', 'dcc-wildlife' ),
				'where' => __( 'wading the muddy edges where the bank meets the water', 'dcc-wildlife' ),
			],
			'kingfisher' => [
				'emoji' => '🐦',
				'name'  => __( 'Belted Kingfisher', 'dcc-wildlife' ),
				'sci'   => 'Megaceryle alcyon',
				'group' => 'birds',
				'fact'  => __( 'It hovers on beating wings, then dives headfirst after small fish. The female is the brighter of the pair — an extra rusty band across the belly — which is unusual among our birds. Mostly a winter visitor here.', 'dcc-wildlife' ),
				'best'  => __( 'all day', 'dcc-wildlife' ),
				'where' => __( 'low perches and wires over the water — listen for the dry rattle', 'dcc-wildlife' ),
			],
			'limpkin'    => [
				'emoji' => '🐦',
				'name'  => __( 'Limpkin', 'dcc-wildlife' ),
				'sci'   => 'Aramus guarauna',
				'group' => 'birds',
				'fact'  => __( 'An apple-snail specialist whose bill is even bent slightly to slip into the shell. Its wild, wailing night-scream is so eerie it’s a stock “jungle” sound in old films. Florida’s limpkins have boomed since the 2000s.', 'dcc-wildlife' ),
				'best'  => __( 'dawn, dusk & after dark', 'dcc-wildlife' ),
				'where' => __( 'stalking the reedy shallows — you’ll often hear it long before you see it', 'dcc-wildlife' ),
			],
			'ibis'       => [
				'emoji' => '🐦',
				'name'  => __( 'White Ibis', 'dcc-wildlife' ),
				'sci'   => 'Eudocimus albus',
				'group' => 'birds',
				'fact'  => __( 'Flocks probe the mud by feel, snapping that curved red bill shut on crayfish they never see. All white, with jet-black wingtips that only flash when they take to the air.', 'dcc-wildlife' ),
				'best'  => __( 'all day', 'dcc-wildlife' ),
				'where' => __( 'flocks working the shallows and the shoreline grass', 'dcc-wildlife' ),
			],
			'woodstork'  => [
				'emoji' => '🐦',
				'name'  => __( 'Wood Stork', 'dcc-wildlife' ),
				'sci'   => 'Mycteria americana',
				'group' => 'birds',
				'fact'  => __( 'Florida’s only native stork feeds entirely by touch — it wades with its bill open underwater and snaps shut the instant a fish brushes it. Once federally endangered, it recovered so well it left the Endangered list in 2026.', 'dcc-wildlife' ),
				'best'  => __( 'dry-season shallows', 'dcc-wildlife' ),
				'where' => __( 'wading shrinking pools where falling water traps the fish', 'dcc-wildlife' ),
			],
			'littleblue' => [
				'emoji' => '🐦',
				'name'  => __( 'Little Blue Heron', 'dcc-wildlife' ),
				'sci'   => 'Egretta caerulea',
				'group' => 'birds',
				'fact'  => __( 'The only heron that changes color with age — snow-white as a youngster, deep slate-blue as an adult, and a patchy “calico” in between. The white youngsters even hunt alongside snowy egrets.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'quiet, vegetated edges, hunting slow and deliberate', 'dcc-wildlife' ),
			],
			'tricolored' => [
				'emoji' => '🐦',
				'name'  => __( 'Tricolored Heron', 'dcc-wildlife' ),
				'sci'   => 'Egretta tricolor',
				'group' => 'birds',
				'fact'  => __( 'A restless, acrobatic hunter — it dashes, pirouettes, and even stirs the bottom with a foot to flush minnows, which make up almost its entire diet.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'dancing through the shallow edges after small fish', 'dcc-wildlife' ),
			],
			'greenheron' => [
				'emoji' => '🐦',
				'name'  => __( 'Green Heron', 'dcc-wildlife' ),
				'sci'   => 'Butorides virescens',
				'group' => 'birds',
				'fact'  => __( 'One of the very few tool-using birds on Earth: it drops a twig, feather, or insect onto the water as bait, then snatches the curious fish that rises to it.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'crouched low on a branch or root over shady water', 'dcc-wildlife' ),
			],

			// ---- PLANTS ------------------------------------------------
			'cypress'    => [
				'emoji' => '🌲',
				'name'  => __( 'Bald Cypress', 'dcc-wildlife' ),
				'sci'   => 'Taxodium distichum',
				'group' => 'plants',
				'fact'  => __( 'The cathedral tree of the canal, spared by the loggers of the 1800s. It can live past 2,000 years — and the purpose of its woody “knees” still genuinely puzzles botanists after two centuries of study.', 'dcc-wildlife' ),
				'best'  => __( 'golden hour', 'dcc-wildlife' ),
				'where' => __( 'lining both banks — the knees poke up along the waterline', 'dcc-wildlife' ),
			],
			'moss'       => [
				'emoji' => '🌿',
				'name'  => __( 'Spanish Moss', 'dcc-wildlife' ),
				'sci'   => 'Tillandsia usneoides',
				'group' => 'plants',
				'fact'  => __( 'Not a moss at all but an air plant in the pineapple family — and no parasite. It takes nothing from its tree, drinking rain, fog, and dust through tiny silvery scales along each strand.', 'dcc-wildlife' ),
				'best'  => __( 'any time', 'dcc-wildlife' ),
				'where' => __( 'draped from the cypress and oak canopy overhead', 'dcc-wildlife' ),
			],
			'fern'       => [
				'emoji' => '🌱',
				'name'  => __( 'Resurrection Fern', 'dcc-wildlife' ),
				'sci'   => 'Pleopeltis michauxiana',
				'group' => 'plants',
				'fact'  => __( 'In a dry spell it curls up gray and “dead,” shedding up to 97% of its water — then greens fully back to life within about a day of rain. It only rides on the tree’s bark; it takes nothing from it.', 'dcc-wildlife' ),
				'best'  => __( 'right after rain', 'dcc-wildlife' ),
				'where' => __( 'carpeting the tops of the big oak and cypress limbs', 'dcc-wildlife' ),
			],
			'lily'       => [
				'emoji' => '🌸',
				'name'  => __( 'White Waterlily', 'dcc-wildlife' ),
				'sci'   => 'Nymphaea odorata',
				'group' => 'plants',
				'fact'  => __( 'Its fragrant white blooms open each morning and close by afternoon. The floating pads shade and shelter the fish below and give frogs and dragonflies a place to rest — prime habitat in the canal.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'quiet coves and canal edges', 'dcc-wildlife' ),
			],
			'palmetto'   => [
				'emoji' => '🌴',
				'name'  => __( 'Saw Palmetto', 'dcc-wildlife' ),
				'sci'   => 'Serenoa repens',
				'group' => 'plants',
				'fact'  => __( 'Ancient and fire-adapted, it resprouts from underground stems after a burn. Its spring flowers are an important nectar source, and its berries feed gopher tortoises, foxes, and more than twenty kinds of bird.', 'dcc-wildlife' ),
				'best'  => __( 'any time', 'dcc-wildlife' ),
				'where' => __( 'the shady understory along the banks', 'dcc-wildlife' ),
			],
		];

		/**
		 * Filter the species registry.
		 *
		 * @param array $species Keyed by species id; each entry has emoji,
		 *                       name, sci, group, fact, best and where.
		 */
		return apply_filters( 'dcc_wl_species', $species );
	}

	/**
	 * Monthly likelihood per species, Jan..Dec (0–3). Filterable via
	 * `dcc_wl_calendar`. Seasonality re-checked against FWC / Cornell range and
	 * behaviour notes in v1.11.0 (see WATER-SOURCES.md).
	 *
	 * @return array<string,int[]>
	 */
	public static function calendar(): array {
		$calendar = [
			//                 J  F  M  A  M  J  J  A  S  O  N  D
			// Critters
			'alligator'  => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Most conspicuous Apr–Sep; spring courtship & bellowing.
			'manatee'    => [ 0, 0, 0, 1, 1, 1, 2, 2, 1, 1, 0, 0 ], // RARE, and warm-months-only — never a winter regular here.
			'otter'      => [ 2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 2 ], // Year-round; dawn & dusk.
			'turtle'     => [ 1, 1, 2, 3, 3, 3, 3, 3, 2, 2, 1, 1 ], // Baskers most visible spring–summer.
			'snake'      => [ 0, 0, 1, 2, 2, 2, 2, 2, 2, 1, 0, 0 ], // Out on warm days.
			'fish'       => [ 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3 ], // Trophy bass peak: winter–spring spawn, plus a fall feed-up.
			'applesnail' => [ 1, 1, 1, 2, 2, 3, 3, 3, 2, 1, 1, 1 ], // Egg clutches spring–summer.
			// Birds
			'eagle'      => [ 3, 3, 3, 2, 1, 0, 0, 0, 1, 2, 3, 3 ], // FL nesting is the cool season (Oct–May).
			'osprey'     => [ 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3 ], // Year-round; nesting Dec–Apr.
			'anhinga'    => [ 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2 ], // Year-round resident.
			'heron'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Abundant year-round resident.
			'egret'      => [ 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2 ], // Year-round; plumes peak in spring.
			'kingfisher' => [ 3, 3, 2, 1, 0, 0, 0, 1, 2, 3, 3, 3 ], // Winter visitor; breeds far north in summer.
			'limpkin'    => [ 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2 ], // Year-round; loudest in spring breeding.
			'ibis'       => [ 3, 3, 3, 3, 2, 2, 2, 2, 3, 3, 3, 3 ], // Abundant year-round.
			'woodstork'  => [ 3, 3, 3, 2, 1, 1, 1, 1, 1, 2, 3, 3 ], // Concentrates at shrinking dry-season pools.
			'littleblue' => [ 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2 ], // Year-round resident.
			'tricolored' => [ 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1 ], // Regular inland, densest on the coast.
			'greenheron' => [ 1, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1, 1 ], // More numerous & vocal in the warm breeding season.
			// Plants
			'cypress'    => [ 2, 2, 3, 3, 3, 3, 3, 3, 2, 3, 3, 2 ], // Spring green-up; rust-orange in fall.
			'moss'       => [ 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2 ], // Evergreen year-round.
			'fern'       => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Greens spectacularly after the summer rains.
			'lily'       => [ 0, 0, 1, 2, 3, 3, 3, 3, 3, 2, 1, 0 ], // Blooms spring through fall.
			'palmetto'   => [ 1, 1, 1, 2, 3, 3, 2, 2, 2, 1, 1, 1 ], // Flowers in spring; berries ripen late summer.
		];

		/**
		 * Filter the monthly likelihood calendar.
		 *
		 * @param array $calendar Keyed by species id; 12 ints (Jan..Dec), 0–3.
		 */
		return apply_filters( 'dcc_wl_calendar', $calendar );
	}

	/**
	 * Real-photo filenames per species (v1.11.0), relative to assets/photos/.
	 *
	 * Licensed free-tier Adobe Stock photos, shown as the hero image in the
	 * detail sheet (the small tiles keep the bespoke sprite for speed). Only
	 * species with an accurate, vetted photo appear here; the rest fall back to
	 * their drawn scene + sprite, so a wrong-species stock photo can never
	 * undercut the guide's accuracy. Filterable via `dcc_wl_photos`.
	 *
	 * @return array<string,string>
	 */
	public static function photos(): array {
		$ids = [
			'alligator', 'manatee', 'otter', 'turtle', 'fish', 'eagle', 'osprey',
			'anhinga', 'heron', 'egret', 'kingfisher', 'limpkin', 'greenheron',
			'cypress', 'moss', 'lily', 'palmetto',
		];
		$photos = [];
		foreach ( $ids as $id ) {
			$photos[ $id ] = $id . '.jpg';
		}

		/**
		 * Filter the species photo map (species id => filename in assets/photos/).
		 *
		 * @param array<string,string> $photos
		 */
		return apply_filters( 'dcc_wl_photos', $photos );
	}

	/**
	 * Registry + calendar merged into a JS-friendly ordered list, with the
	 * filtered values normalized (12 months per species, each clamped 0–3).
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function dataset(): array {
		$calendar = self::calendar();
		$photos   = self::photos();
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
				'id'        => (string) $id,
				'emoji'     => (string) ( $sp['emoji'] ?? '' ),
				'name'      => (string) ( $sp['name'] ?? $id ),
				'sci'       => (string) ( $sp['sci'] ?? '' ),
				'photo'     => (string) ( $photos[ $id ] ?? '' ),
				'group'     => (string) ( $sp['group'] ?? 'critters' ),
				'fact'      => (string) ( $sp['fact'] ?? '' ),
				'best'      => (string) ( $sp['best'] ?? '' ),
				'where'     => (string) ( $sp['where'] ?? '' ),
				'months'    => $months,
				'bestLabel' => self::best_months_label( $months ),
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
