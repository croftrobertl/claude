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
	 *
	 * Every species has at least one month at 3 (1.17.0). The peak badge,
	 * the "N at peak" counts, the countdown and the "fullest months" line
	 * all key on 3, and through 1.16.2 seven species topped out at 2 — so
	 * their sheets promised "Best: Jul–Aug" while nothing in the UI ever
	 * featured them. A species' best window IS its peak; the two must agree.
	 * Year-round residents (anhinga, little blue heron, Spanish moss) are at
	 * 3 all year, like the great blue heron, and the countdown skips them
	 * because they never "rise".
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
			// 1.19.0: the safety group renders FIRST, everywhere groups are
			// listed. The owner's brief: naming none of the four venomous
			// species in the county is not gentle, it is unhelpful.
			'safety'   => __( 'Know before you go', 'dcc-wildlife' ),
			'critters' => __( 'Critters', 'dcc-wildlife' ),
			'birds'    => __( 'Birds', 'dcc-wildlife' ),
			'plants'   => __( 'Plants', 'dcc-wildlife' ),
		];
	}

	/**
	 * DISPLAY SECTIONS (1.27.0) — what the guide is navigated by, which is no
	 * longer the same thing as groups().
	 *
	 * Critters and Birds were folded into one "Animals" section: the split was
	 * folksy rather than useful, and at 38 species between them a guest looking
	 * for a heron does not first ask whether a heron is a critter. Safety keeps
	 * its own destination — it holds the four venomous snakes, the fire ant,
	 * the mosquitoes, the lovebugs and the poison ivy, and merging it would
	 * scatter them through 38 animals with no read-this-first surface. It is
	 * renamed to the plain word, which was the actual objection. DO NOT let a
	 * later tidy-up merge it into Animals.
	 *
	 * groups() is unchanged and still the DATA taxonomy: it keys the group
	 * glyph a species falls back to when it has neither a photograph nor its
	 * own drawing, and a bird glyph is not a critter glyph.
	 *
	 * @return array<string,string>
	 */
	/**
	 * Browse sub-groups WITHIN the Animals section, in the order they are shown.
	 *
	 * Thirty-eight animals is between six and seven swipes of a deck with only
	 * a counter for orientation. These chips are what let a guest go straight
	 * to the part of the section they mean. They are NAVIGATION, not a filter:
	 * nothing is hidden by choosing one, so every species stays reachable
	 * however the guest arrived.
	 *
	 * Two labels deviate from the ones first proposed, because a label is a
	 * claim like any other:
	 *  - "Reptiles", not "Reptiles & amphibians". The registry holds five
	 *    reptiles and NO amphibians, and a chip should not promise a frog that
	 *    is not there. If one is ever added, widen the label then.
	 *  - "Waterfowl & swimmers", not "Waterfowl". Only three of the ten are
	 *    ducks; the rest are coots, gallinules, a grebe, the anhinga, the
	 *    cormorant and the white pelican, and calling them waterfowl would
	 *    teach a guest something untrue.
	 *
	 * @return array<string,string>
	 */
	/**
	 * Does the registry hold an amphibian yet?
	 *
	 * Amphibians share the reptiles chip (the owner's option C), so they are
	 * marked with `class => 'amphibian'` rather than a browse slug of their
	 * own. That one key is what renames the chip, so adding the first frog is
	 * the whole change — there is no second place to remember.
	 */
	public static function has_amphibian(): bool {
		foreach ( self::registry() as $sp ) {
			// It has to be under THAT CHIP, not merely in the registry. The
			// cane toad is an amphibian and a hazard; if it only appeared in
			// Know before you go, renaming the Animals chip on its account
			// would be the same over-promise in a new place. It happens to
			// sit in Animals as well, so it does flip the label — but the
			// test is the browse slug, not the class alone.
			if ( 'amphibian' === (string) ( $sp['class'] ?? '' )
				&& 'reptiles' === (string) ( $sp['browse'] ?? '' ) ) {
				return true;
			}
		}
		return false;
	}

	public static function browse_groups(): array {
		return [
			// ---- Animals (the owner's option C, 2026-09-29) --------------
			// Five chips, in this order. The three bird chips they replace —
			// Wading birds, Waterfowl & swimmers, Raptors & others — are
			// RETIRED, not renamed: at 169 species a guest looking for a
			// kingfisher should not first have to decide whether a kingfisher
			// is a raptor. Finding one bird among many is the jump-to menu's
			// job; these chips only get you to the right part of the section.
			// THE LABEL TRACKS WHAT IS ACTUALLY THERE. The owner chose the name
			// "Reptiles & amphibians"; the guide's older and equally firm rule
			// is that a label is a claim and may not promise what the registry
			// does not hold. Both are satisfied by deriving it: the moment the
			// first amphibian entry lands, the chip renames itself, and until
			// then it does not offer frogs the guide has not got.
			'reptiles' => self::has_amphibian()
				? __( 'Reptiles & amphibians', 'dcc-wildlife' )
				: __( 'Reptiles', 'dcc-wildlife' ),
			'birds'    => __( 'Birds', 'dcc-wildlife' ),
			'mammals'  => __( 'Mammals', 'dcc-wildlife' ),
			'fish'     => __( 'Fish', 'dcc-wildlife' ),
			// Snails live here, by the owner's decision. "Fish & snails" was a
			// pairing of convenience and nothing else.
			'insects'  => __( 'Insects & small things', 'dcc-wildlife' ),

			// ---- Plants (new in 1.33.0) ----------------------------------
			// The same three groups the owner's own master list is organised
			// by. They share the Animals chips' toggle behaviour exactly:
			// navigation, not a filter — nothing is hidden by choosing one.
			//
			// EPIPHYTES GO UNDER "TREES" (the owner's decision, 2026-09-29).
			// Spanish moss and the resurrection fern are neither trees nor
			// wildflowers, and 1.33.0 first filed them in the catch-all on the
			// reasoning that the master list puts a lichen there. His ruling
			// overrides that, and the reason is better: a guest meets these
			// looking UP AT AN OAK OR A CYPRESS, so that is the chip they will
			// reach for. Ball moss goes here too when it lands. The chip is a
			// place to look, not a botanical rank.
			'trees'       => __( 'Trees', 'dcc-wildlife' ),
			'wildflowers' => __( 'Wildflowers & shrubs', 'dcc-wildlife' ),
			'waterplants' => __( 'Water plants', 'dcc-wildlife' ),
		];
	}

	/**
	 * The dataset rows of one browse sub-group, in dataset order.
	 *
	 * @param array<int,array<string,mixed>> $dataset
	 * @return array<int,array<string,mixed>>
	 */
	public static function browse_members( array $dataset, string $slug ): array {
		return array_values(
			array_filter(
				$dataset,
				static fn( array $sp ): bool => $slug === (string) ( $sp['browse'] ?? '' )
			)
		);
	}

	/**
	 * Order a section's members so each browse sub-group is CONTIGUOUS.
	 *
	 * Necessary because registry order is field-guide order and the sub-groups
	 * interleave in it: the critters run alligator, manatee, otter, turtle,
	 * three watersnakes, bass, apple snail — reptile, two mammals, four more
	 * reptiles. A chip that claims to jump to "Reptiles" has to land on a run
	 * of reptiles, and a position line reading "Reptiles · 1/1" has to be true.
	 *
	 * The sort is STABLE, so the order WITHIN a sub-group is untouched and the
	 * confusable birds still sit together — which is the whole reason registry
	 * order is what it is. Nothing else reorders: the prose guide, the JSON-LD
	 * and the dataset all read the registry directly, so this affects the deck
	 * and only the deck.
	 *
	 * @param array<int,array<string,mixed>> $members
	 * @return array<int,array<string,mixed>>
	 */
	public static function browse_order( array $members ): array {
		$rank = array_flip( array_keys( self::browse_groups() ) );
		$keyed = [];
		foreach ( array_values( $members ) as $i => $sp ) {
			$b = (string) ( $sp['browse'] ?? '' );
			// A member with no sub-group keeps its place at the end rather than
			// being dropped or floated to the front.
			$keyed[] = [ $rank[ $b ] ?? PHP_INT_MAX, $i, $sp ];
		}
		usort(
			$keyed,
			static fn( array $a, array $b ): int => $a[0] <=> $b[0] ?: $a[1] <=> $b[1]
		);
		return array_map( static fn( array $row ): array => $row[2], $keyed );
	}

	public static function sections(): array {
		return [
			'animals' => __( 'Animals', 'dcc-wildlife' ),
			'plants'  => __( 'Plants', 'dcc-wildlife' ),
			'safety'  => __( 'Safety', 'dcc-wildlife' ),
		];
	}

	/** Which display section a data group belongs to. */
	public static function section_of( string $group ): string {
		return in_array( $group, [ 'critters', 'birds' ], true ) ? 'animals' : $group;
	}

	/**
	 * The species of one display section, in registry order.
	 *
	 * @param array<int,array<string,mixed>> $dataset
	 * @return array<int,array<string,mixed>>
	 */
	/**
	 * Is this species a HAZARD — something the Safety section exists for?
	 *
	 * One definition, used by every surface that has to agree about it: the
	 * Safety section's membership, the "at peak" and "worth looking for"
	 * counts, the Peak Now tab, the spotlight and the hub tile's preview art.
	 *
	 * 1.33.0, AND IT REVERSES A DECISION — THE OWNER'S, DATED 2026-09-28.
	 * From 1.27.0 to 1.32.1, Peak Now showed a venomous snake at its most
	 * active on the grounds that a guest should be shown it rather than
	 * spared it. The owner's ruling now is the opposite: hazards belong in
	 * Safety, which is a destination a guest chooses, and Peak Now is a list
	 * of things worth going to look for. Nobody goes looking for a
	 * cottonmouth. Do not restore the old rule without asking him.
	 *
	 * It takes a registry row or a dataset row — both carry `group` and
	 * `flags` — so there is no second, drifting copy for the client.
	 *
	 * @param array<string,mixed> $sp
	 */
	public static function is_hazard( array $sp ): bool {
		if ( 'safety' === self::section_of( (string) ( $sp['group'] ?? '' ) ) ) {
			return true;
		}
		// The alligator: group `critters`, flag `danger`, and shown in Safety
		// too. Flagged danger IS a hazard wherever the species is filed.
		return in_array( 'danger', (array) ( $sp['flags'] ?? [] ), true );
	}

	public static function section_members( array $dataset, string $section, bool $include_flagged = true ): array {
		return array_values( array_filter( $dataset, static function ( array $sp ) use ( $section, $include_flagged ): bool {
			if ( self::section_of( (string) ( $sp['group'] ?? '' ) ) === $section ) {
				return true;
			}
			if ( ! $include_flagged ) {
				return false;
			}
			/*
			 * The same dual membership group_members() has, and it must not be
			 * lost in the section merge: anything flagged `danger` also shows
			 * in Safety whatever group it belongs to. That is the alligator,
			 * which lives in Animals and appears in the safety list too — 52
			 * tile faces across 51 species. Filtering on the group alone drops
			 * it from Safety, which is a safety regression however tidy the
			 * code looks.
			 *
			 * $include_flagged = false switches it off for the one caller that
			 * must not have it: the PROSE guide. A tile shown twice is a
			 * convenience; a species written out twice is duplicated content
			 * for a crawler and a second helping for a screen reader. The
			 * prose has always listed each species exactly once and must keep
			 * doing so.
			 */
			return 'safety' === $section && self::is_hazard( $sp );
		} ) );
	}

	/**
	 * Flag slugs => [ label, one-line meaning ], in legend order (1.19.0).
	 * These are what the colour legend encodes; a mark that cannot earn a
	 * line here must not appear on a tile.
	 *
	 * @return array<string,string[]>
	 */
	public static function flags(): array {
		return [
			'danger'    => [ __( 'Danger', 'dcc-wildlife' ), __( 'venomous, or it bites or stings', 'dcc-wildlife' ) ],
			'invasive'  => [ __( 'Invasive', 'dcc-wildlife' ), __( 'not native, and spreading', 'dcc-wildlife' ) ],
			'protected' => [ __( 'Protected', 'dcc-wildlife' ), __( 'by law — keep your distance', 'dcc-wildlife' ) ],
			'nuisance'  => [ __( 'Nuisance', 'dcc-wildlife' ), __( 'a bother, not a danger', 'dcc-wildlife' ) ],
		];
	}

	/**
	 * Odds slugs => label (1.19.0): how likely a guest is to meet one on an
	 * ordinary stay, independent of month. 'daytrip' is reserved for later
	 * entries that need a drive (`place`).
	 *
	 * @return array<string,string>
	 */
	public static function odds(): array {
		return [
			'certain'    => __( 'You will see one', 'dcc-wildlife' ),
			'likely'     => __( 'Good odds', 'dcc-wildlife' ),
			'occasional' => __( 'With luck', 'dcc-wildlife' ),
			'rare'       => __( 'A rare treat', 'dcc-wildlife' ),
			'daytrip'    => __( 'A day trip away', 'dcc-wildlife' ),
		];
	}

	/**
	 * The species shown under a group heading. Home group, plus — for the
	 * safety group only — anything flagged DANGER that lives elsewhere (the
	 * alligator stays a critter, and belongs on the safety list too).
	 *
	 * @param array<int,array<string,mixed>> $dataset dataset() rows.
	 * @return array<int,array<string,mixed>>
	 */
	public static function group_members( array $dataset, string $slug ): array {
		return array_values( array_filter( $dataset, static function ( array $sp ) use ( $slug ): bool {
			if ( ( $sp['group'] ?? '' ) === $slug ) {
				return true;
			}
			return 'safety' === $slug && in_array( 'danger', (array) ( $sp['flags'] ?? [] ), true );
		} ) );
	}

	/** A safety-group species never drives the countdown, counts or art. */
	public static function is_spotting( array $sp ): bool {
		return 'safety' !== ( $sp['group'] ?? '' );
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
			// ---- KNOW BEFORE YOU GO (1.19.0) ------------------------------
			// The one group a guest needs before the dock: the four venomous
			// snakes of Lake County, the alligator (listed under Critters, shown
			// here too), and the things that sting, itch and swarm. `safe` is
			// the plain what-to-do line and is rendered before anything else.
			'cottonmouth' => [
				'emoji' => '🐍',
				'name'  => __( 'Florida Cottonmouth', 'dcc-wildlife' ),
				'sci'   => 'Agkistrodon conanti',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'certain',
				'fact'  => __( 'The one to learn: the only venomous snake you are likely to meet at the water’s edge here. Blocky head, a dark mask through the eye, a pale stripe along the lip; youngsters wiggle a yellow tail tip like a caterpillar to lure frogs in. Cornered, it will not run — it coils and gapes a mouth as white as cotton. Take that at its word. It does not chase people; that part is folklore.', 'dcc-wildlife' ),
				'safe'  => __( 'Give it room. Step back, let it leave, and never try to move or kill it — most bites happen to people handling snakes.', 'dcc-wildlife' ),
				'best'  => __( 'warm afternoons, and warm nights after rain', 'dcc-wildlife' ),
				'where' => __( 'shorelines, dock pilings and the brush along the bank, often basking in the open', 'dcc-wildlife' ),
				'idgroup' => 'snakes',
				'mark'  => __( 'a thick body, a blocky head with a dark eye-stripe and a vertical pupil, and a facial pit between eye and nostril; it holds its ground and gapes white', 'dcc-wildlife' ),
			],
			'diamondback' => [
				'emoji' => '🐍',
				'name'  => __( 'Eastern Diamondback Rattlesnake', 'dcc-wildlife' ),
				'sci'   => 'Crotalus adamanteus',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'occasional',
				'fact'  => __( 'The largest venomous snake in North America, and not a canal animal at all — it belongs to dry ground, the palmetto scrub and the sandhill pine. Bold diamonds down the back, and a rattle that carries a long way when it is used. Do not count on hearing it: one that would rather go unnoticed lies still and says nothing. Uncommon here, and scarcer every year.', 'dcc-wildlife' ),
				'safe'  => __( 'If you hear the buzz, stop, find it, and walk the other way — it will not follow. And watch your feet on dry ground: silence is not an all-clear.', 'dcc-wildlife' ),
				'best'  => __( 'spring and autumn mornings', 'dcc-wildlife' ),
				'where' => __( 'dry uplands and palmetto scrub away from the water — seldom near the canal', 'dcc-wildlife' ),
			],
			'pygmy'       => [
				'emoji' => '🐍',
				'name'  => __( 'Dusky Pygmy Rattlesnake', 'dcc-wildlife' ),
				'sci'   => 'Sistrurus miliarius barbouri',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'occasional',
				'fact'  => __( 'Florida’s most abundant venomous snake, and the easiest to step near: a foot or two of grey and dark blotches with a rusty stripe down the back, lying still in the leaf litter at a trail edge. The rattle is so slight it passes for an insect, which is how people walk right up to one. Bites hurt, and tissue damage is common — but no death from one has ever been recorded.', 'dcc-wildlife' ),
				'safe'  => __( 'Watch where you put your feet and hands in leaf litter, and step wide around one you spot.', 'dcc-wildlife' ),
				'best'  => __( 'warm days, especially late summer', 'dcc-wildlife' ),
				'where' => __( 'leaf litter along trail edges and the base of palmettos', 'dcc-wildlife' ),
			],
			'coralsnake'  => [
				'emoji' => '🐍',
				'name'  => __( 'Eastern Coral Snake', 'dcc-wildlife' ),
				'sci'   => 'Micrurus fulvius',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'occasional',
				'fact'  => __( 'Slender, secretive, and ringed red, yellow and black the whole way round. The head is the surest tell: this one’s snout is black, where its harmless mimics — the scarlet kingsnake and the scarlet snake — have red heads. The old rhyme — red touching yellow — works on a normally marked snake; the black snout works on all of them. It lives under leaf litter and logs, and almost never bites unless it is picked up.', 'dcc-wildlife' ),
				'safe'  => __( 'So don’t handle it. Leave it under its log and it will stay there.', 'dcc-wildlife' ),
				'best'  => __( 'spring and autumn, after rain', 'dcc-wildlife' ),
				'where' => __( 'under leaf litter, logs and mulch on the drier ground', 'dcc-wildlife' ),
			],
			'fireant'     => [
				'emoji' => '🐜',
				'name'  => __( 'Red Imported Fire Ant', 'dcc-wildlife' ),
				'sci'   => 'Solenopsis invicta',
				'group' => 'safety',
				'flags' => [ 'danger', 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'A South American ant that came ashore at Mobile in the 1930s in soil used as ship’s ballast, and now owns most Florida lawns. The giveaway is the mound: a crumbly dome with no hole in the top, because the ants come and go through tunnels that run yards out from it. Stand on one and hundreds pour out at once, stinging together and raising white pustules that itch for days.', 'dcc-wildlife' ),
				'safe'  => __( 'Look before you set down a chair, a towel or a bare foot. Stung? Brush them off fast, wash, and watch anyone who is allergic to stings.', 'dcc-wildlife' ),
				'best'  => __( 'any warm day; mounds show best after rain', 'dcc-wildlife' ),
				'where' => __( 'lawn mounds, along paths, and at the base of the docks', 'dcc-wildlife' ),
			],
			'poisonivy'   => [
				'emoji' => '🌿',
				'name'  => __( 'Poison Ivy', 'dcc-wildlife' ),
				'sci'   => 'Toxicodendron radicans',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'certain',
				'fact'  => __( 'Leaves of three, let it be. It climbs the oaks and cypress as a rope of a vine furred with red-brown hairs; the three glossy leaflets may be toothed or smooth, and turn red in spring and again in autumn. Every part carries the same oil — leaf, stem, root, and the bare winter vine with no leaf on it at all. The rash follows hours or days later.', 'dcc-wildlife' ),
				'safe'  => __( 'Don’t touch the hairy vines on the trees. If you brush against it, wash with soap and cool water as soon as you can — the oil starts binding to skin within about fifteen minutes.', 'dcc-wildlife' ),
				'best'  => __( 'year-round; in leaf March to November', 'dcc-wildlife' ),
				'where' => __( 'vines up the oaks and cypress, and the shady edges of the lawn', 'dcc-wildlife' ),
			],
			'mosquito'    => [
				'emoji' => '🦟',
				'name'  => __( 'Mosquitoes and No-see-ums', 'dcc-wildlife' ),
				'sci'   => 'Culicidae / Culicoides',
				'group' => 'safety',
				'flags' => [ 'nuisance' ],
				'odds'  => 'certain',
				'fact'  => __( 'Dusk on the water belongs to them. Mosquitoes rise after the summer rains; the no-see-ums are biting midges one to three millimetres long — small enough to walk straight through an ordinary window screen — and they work the still, humid air at dawn and dusk from April into November. Neither will spoil a stay. Both will spoil a sunset.', 'dcc-wildlife' ),
				'safe'  => __( 'Bring repellent — we mean it — and long sleeves for the last hour of light.', 'dcc-wildlife' ),
				'best'  => __( 'dawn and dusk, on still humid air, April into November', 'dcc-wildlife' ),
				'where' => __( 'anywhere along the water’s edge at last light', 'dcc-wildlife' ),
			],
			'lovebug'     => [
				'emoji' => '🪰',
				'name'  => __( 'Lovebugs', 'dcc-wildlife' ),
				'sci'   => 'Plecia nearctica',
				'group' => 'safety',
				'flags' => [ 'nuisance' ],
				'odds'  => 'certain',
				'fact'  => __( 'Twice a year — four or five weeks from late April, and again from late August — the air fills with small black flies joined in pairs, drifting over the road and the lawn. They neither bite nor sting; they are march flies, and their larvae spend their lives quietly composting the lawn. The only thing they harm is car paint.', 'dcc-wildlife' ),
				'safe'  => __( 'Nothing to do but wash the windshield the same day — they turn acidic as they break down.', 'dcc-wildlife' ),
				'best'  => __( 'mid-morning to late afternoon, in the two flights', 'dcc-wildlife' ),
				'where' => __( 'everywhere — over the lawn, the road and the dock', 'dcc-wildlife' ),
			],
			// ---- BATCH 7 (1.33.0): the rest of Know before you go ----------
			// Fourteen more, every one of them something a guest DOES something
			// about: looks before reaching, keeps the dog off the lawn at night,
			// checks for ticks, does not touch the furry caterpillar.
			//
			// The no-see-ums leave the composite "Mosquitoes and No-see-ums" and
			// stand alone, by the owner's decision. They are a different animal
			// with a different season and a different defence — a screen stops a
			// mosquito and does not stop these.
			//
			// The cane toad is the only one here that is NOT group=safety: it is
			// an animal a guest will want to read about as well as a hazard, so
			// it sits in Animals and reaches Safety through its danger flag, the
			// same double membership the alligator has had since 1.19.0.
			'noseeums'        => [
				'emoji' => '🦟',
				'name'  => __( 'No-see-ums', 'dcc-wildlife' ),
				'sci'   => 'Culicoides spp.',
				'group' => 'safety',
				'flags' => [ 'nuisance' ],
				'odds'  => 'certain',
				'fact'  => __( 'Biting midges one to three millimetres long — small enough to walk straight through an ordinary window screen, which is how they get in. You feel the bite and see nothing, which is the whole of the name. They work still, humid air at dawn and dusk from April into November, and a breeze is the best defence there is.', 'dcc-wildlife' ),
				'safe'  => __( 'Repellent on exposed skin, and sit where the air is moving — a fan on the porch works better than anything you can spray.', 'dcc-wildlife' ),
				'best'  => __( 'dawn and dusk on still air, April into November', 'dcc-wildlife' ),
				'where' => __( 'the water’s edge and the porch at last light, worst when the air is dead still', 'dcc-wildlife' ),
				'mark'  => __( 'you will not see it; a sudden sharp bite with nothing on your arm is the identification', 'dcc-wildlife' ),
			],
			'canetoad'        => [
				'emoji' => '🐸',
				'name'  => __( 'Cane Toad', 'dcc-wildlife' ),
				'sci'   => 'Rhinella marina',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'toads',
				'flags' => [ 'danger', 'invasive' ],
				'odds'  => 'occasional',
				'fact'  => __( 'A South American toad brought in to eat cane beetles, which it did not, and which now turns up on Florida lawns at night the size of a dinner plate. Behind each eye is a large triangular gland, and the milky venom it releases is what makes this a dog problem rather than a frog: a dog that mouths one can be in serious trouble within minutes.', 'dcc-wildlife' ),
				'safe'  => __( 'Keep dogs away from toads at night, and off the lawn after rain. If your dog mouths one, wipe the gums and tongue with a cloth, rinse the mouth with a hose pointed downwards and out for several minutes so it does not swallow, and ring a vet straight away.', 'dcc-wildlife' ),
				'sound' => __( 'A low, slow, rattling trill that runs on and on — more like a distant tractor idling than a frog. The native southern toad’s trill is higher, shorter and musical.', 'dcc-wildlife' ),
				'best'  => __( 'warm wet nights, on lit lawns', 'dcc-wildlife' ),
				'where' => __( 'lawns, driveways and anywhere a light draws insects after dark', 'dcc-wildlife' ),
				'mark'  => __( 'very large, with a big triangular gland behind each eye and no ridges across the crown; native southern toads are far smaller', 'dcc-wildlife' ),
			],
			'blackwidow'      => [
				'emoji' => '🕷',
				'name'  => __( 'Southern Black Widow', 'dcc-wildlife' ),
				'sci'   => 'Latrodectus mactans',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'occasional',
				'fact'  => __( 'Glossy jet black, with a red hourglass on the underside of the abdomen — on this species a single joined shape, not two separate marks. She is not aggressive and will not come at you; the bites happen when a hand goes somewhere unseen and she is between it and the wall. Her webs are untidy tangles in dark, still, sheltered places.', 'dcc-wildlife' ),
				'safe'  => __( 'Look before you reach into a dark corner — under the dock, behind a pot, inside a rarely used shed. Wear gloves for that kind of job. A bite needs medical advice, not a wait-and-see.', 'dcc-wildlife' ),
				'best'  => __( 'any month; more noticed in the warm ones', 'dcc-wildlife' ),
				'where' => __( 'tangled webs in dark, undisturbed corners — under decking, behind pots, in sheds', 'dcc-wildlife' ),
				'mark'  => __( 'glossy black with a single joined red hourglass underneath, and a messy tangled web', 'dcc-wildlife' ),
			],
			'brownwidow'      => [
				'emoji' => '🕷',
				'name'  => __( 'Brown Widow', 'dcc-wildlife' ),
				'sci'   => 'Latrodectus geometricus',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'likely',
				'fact'  => __( 'Now the commoner widow around Florida buildings, and the easiest to identify without ever seeing the spider: the egg sac gives it away, a pale ball covered in little spikes like a sandspur. The spider is grey-brown and patterned, with an orange or yellow hourglass. Its venom is stronger than a black widow’s drop for drop, but it delivers far less and would much rather hide.', 'dcc-wildlife' ),
				'safe'  => __( 'The same rule as the black widow: look before you reach into anywhere dark. Spiky egg sacs under the rails mean the spiders are there too.', 'dcc-wildlife' ),
				'best'  => __( 'any month, most obvious in summer', 'dcc-wildlife' ),
				'where' => __( 'under rails, chairs, letterboxes and the underside of anything left outdoors', 'dcc-wildlife' ),
				'mark'  => __( 'grey-brown and patterned with an orange hourglass — and a spiky egg sac like a tiny sandspur', 'dcc-wildlife' ),
			],
			'pusscaterpillar' => [
				'emoji' => '🐛',
				'name'  => __( 'Puss Caterpillar', 'dcc-wildlife' ),
				'sci'   => 'Megalopyge opercularis',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'occasional',
				'fact'  => __( 'It looks like a scrap of orange fur, and it is one of the most venomous caterpillars in the United States. Under the fur are hollow spines that break off in skin; the sting is an immediate deep burn with a grid of red spots in it, and it can bring on swelling and nausea. The temptation to touch something that soft is the entire danger.', 'dcc-wildlife' ),
				'safe'  => __( 'Do not touch it — and tell children that first, because it looks strokeable. Stung? Strip the spines out with sticky tape pressed on and pulled off, then ice it. Get help for swelling, breathing trouble or a bad reaction.', 'dcc-wildlife' ),
				'best'  => __( 'late summer and autumn', 'dcc-wildlife' ),
				'where' => __( 'on oak and elm leaves, and on anything the wind drops them onto', 'dcc-wildlife' ),
				'mark'  => __( 'a teardrop of soft orange-brown “fur” with a tail, about an inch long; no obvious head', 'dcc-wildlife' ),
			],
			'saddleback'      => [
				'emoji' => '🐛',
				'name'  => __( 'Saddleback Caterpillar', 'dcc-wildlife' ),
				'sci'   => 'Acharia stimulea',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'occasional',
				'fact'  => __( 'Unmistakable and unmissable: a brown caterpillar wearing a bright green blanket with a purple-brown saddle in the middle of it, and four fat horns of spines at either end. The spines are hollow, tipped with venom, and break off in the skin. Nothing else here looks remotely like it, which is the plant’s warning working exactly as intended.', 'dcc-wildlife' ),
				'safe'  => __( 'Do not brush it off with a bare hand. Lift the spines out with sticky tape, then ice it; see someone if the reaction spreads.', 'dcc-wildlife' ),
				'best'  => __( 'late summer into autumn', 'dcc-wildlife' ),
				'where' => __( 'the undersides of leaves on shrubs, palms and garden plants — found by reaching, not by looking', 'dcc-wildlife' ),
				'mark'  => __( 'a green “saddle blanket” with a brown oval in the middle, and spiny horns at both ends', 'dcc-wildlife' ),
			],
			'paperwasps'      => [
				'emoji' => '🐝',
				'name'  => __( 'Paper Wasps', 'dcc-wildlife' ),
				'sci'   => 'Polistes spp.',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'certain',
				'fact'  => __( 'The open grey nest under an eave, a rail or the underside of the dock, like a small upturned umbrella with the cells showing and the wasps standing on them. They are not looking for you and will ignore you entirely until the nest is jarred — then they defend it, and unlike a bee each one can sting more than once.', 'dcc-wildlife' ),
				'safe'  => __( 'Look under rails and eaves before you lean, sit or put a hand up. If a nest is somewhere you cannot avoid, tell us rather than knocking it down yourself.', 'dcc-wildlife' ),
				'best'  => __( 'spring through autumn; nests grow through the summer', 'dcc-wildlife' ),
				'where' => __( 'under eaves, rails, dock boards and garden furniture', 'dcc-wildlife' ),
				'mark'  => __( 'an open, unwrapped grey comb like a small umbrella, with the wasps visible on it', 'dcc-wildlife' ),
			],
			'yellowjacket'    => [
				'emoji' => '🐝',
				'name'  => __( 'Southern Yellowjacket', 'dcc-wildlife' ),
				'sci'   => 'Vespula squamosa',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'likely',
				'fact'  => __( 'The one that nests in the ground, and the reason that matters is that you find it with your feet. The nest is hidden in a hole or under a board, so there is no umbrella of comb to spot; the first sign is usually wasps pouring out. Each of them can sting over and over, and in a warm winter a southern colony carries on rather than dying back, so the nests get very large.', 'dcc-wildlife' ),
				'safe'  => __( 'If wasps come up out of the ground, walk away quickly and keep going — they follow. Mark the spot and tell us. Anyone allergic to stings should carry what they normally carry.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, and nests at their biggest in late summer', 'dcc-wildlife' ),
				'where' => __( 'ground holes, wall voids, and under sheds and decking', 'dcc-wildlife' ),
				'mark'  => __( 'black and yellow like a paper wasp, but going in and out of a hole in the ground', 'dcc-wildlife' ),
			],
			'lonestartick'    => [
				'emoji' => '🪲',
				'name'  => __( 'Lone Star Tick', 'dcc-wildlife' ),
				'sci'   => 'Amblyomma americanum',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'likely',
				'fact'  => __( 'The commonest tick to bite people in Florida, and the female is easy: one silvery-white spot in the middle of her back. It is also the tick behind alpha-gal syndrome — a bite that can leave a person allergic to red meat, with reactions hours after a meal rather than minutes. That is rare, and it is the reason to take ticks seriously rather than brush them off.', 'dcc-wildlife' ),
				'safe'  => __( 'Walk the middle of paths, check yourself and children after anything long-grass, and check dogs too. Found one attached? Pull it straight out with fine tweezers as close to the skin as you can get — no twisting, no burning — and wash the spot.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, worst spring into summer', 'dcc-wildlife' ),
				'where' => __( 'long grass, brush and the edges of shaded paths', 'dcc-wildlife' ),
				'mark'  => __( 'a single silvery-white spot on the female’s back; males have pale streaks round the rim', 'dcc-wildlife' ),
			],
			'chiggers'        => [
				'emoji' => '🐛',
				'name'  => __( 'Chiggers', 'dcc-wildlife' ),
				'sci'   => 'Trombiculidae',
				'group' => 'safety',
				'flags' => [ 'nuisance' ],
				'odds'  => 'likely',
				'fact'  => __( 'Almost nobody has seen one. The biting stage is a mite larva too small to make out, and it does not burrow and does not drink blood — it spits a digestive enzyme into the skin, builds a straw out of the hardened tissue, and feeds through that. The welt and the itch arrive later, after the mite has already gone. Nail polish does nothing: there is nothing under there to smother.', 'dcc-wildlife' ),
				'safe'  => __( 'Repellent round ankles, socks over trouser cuffs, and a hot soapy shower as soon as you come in from long grass. Then anti-itch cream and leave it alone.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in long grass and leaf litter', 'dcc-wildlife' ),
				'where' => __( 'long grass, weedy edges and brush — they wait on the tips and climb on', 'dcc-wildlife' ),
				'mark'  => __( 'you will not see it; a cluster of intensely itchy welts round sock lines and waistbands is the sign', 'dcc-wildlife' ),
			],
			'yellowfly'       => [
				'emoji' => '🪰',
				'name'  => __( 'Yellow Fly', 'dcc-wildlife' ),
				'sci'   => 'Diachlorus ferrugatus',
				'group' => 'safety',
				'flags' => [ 'nuisance' ],
				'odds'  => 'likely',
				'fact'  => __( 'Described by entomologists at the University of Florida as the most aggressive fly in the state, which is saying something. It is a stocky yellow horsefly with purple-banded green eyes, and the female cuts rather than pierces — the bite hurts at once and can blister days later. It hunts in shade and follows anything warm that moves.', 'dcc-wildlife' ),
				'safe'  => __( 'It comes for you in shade and at the water’s edge in late spring. Repellent, long sleeves, and keep moving — they are much less interested in a moving target.', 'dcc-wildlife' ),
				'best'  => __( 'late spring into early summer, in shade', 'dcc-wildlife' ),
				'where' => __( 'shaded banks and the wood’s edge, especially on still afternoons', 'dcc-wildlife' ),
				'mark'  => __( 'a stout yellow fly about a centimetre long with black front legs and green eyes banded purple', 'dcc-wildlife' ),
			],
			'treadsoftly'     => [
				'emoji' => '🌿',
				'name'  => __( 'Tread-softly', 'dcc-wildlife' ),
				'sci'   => 'Cnidoscolus stimulosus',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'likely',
				'fact'  => __( 'The name is the instruction. A low plant with deeply lobed leaves and pretty white flowers, and every part of it — stem, leaf, flower, fruit — is armed with long stiff hollow hairs that break off in skin and inject an irritant. Brushing past is enough. Its other name is finger rot, which tells you how much people enjoyed picking the flowers.', 'dcc-wildlife' ),
				'safe'  => __( 'Bare legs and sandy ground are a bad combination. If you are stung, do not rub it in — lift what you can with sticky tape, wash, and expect it to hurt for a while.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer, when it flowers', 'dcc-wildlife' ),
				'where' => __( 'dry sandy ground, path edges and open scrub', 'dcc-wildlife' ),
				'mark'  => __( 'deeply lobed leaves and white five-petalled flowers on a plant covered in visible stiff hairs', 'dcc-wildlife' ),
			],
			'brazilianpepper' => [
				'emoji' => '🌿',
				'name'  => __( 'Brazilian Pepper', 'dcc-wildlife' ),
				'sci'   => 'Schinus terebinthifolia',
				'group' => 'safety',
				'flags' => [ 'danger', 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'Florida’s most successful plant invader — brought in as an ornamental before 1900 and now holding something over 750,000 acres — and a relative of poison ivy that gets far less warning. Same family, same kind of oil, same rash in people who react to it, and the smoke from burning it is worse. The red berries at Christmas are why people used to call it Florida holly.', 'dcc-wildlife' ),
				'safe'  => __( 'Treat it like poison ivy: don’t handle it, and never burn it. Wash with soap and cool water if you brush against it.', 'dcc-wildlife' ),
				'best'  => __( 'year-round; berries red from late autumn', 'dcc-wildlife' ),
				'where' => __( 'thickets along disturbed edges, ditches and fence lines', 'dcc-wildlife' ),
				'mark'  => __( 'compound leaves with a winged midrib, crushed leaves smelling of turpentine, and dense clusters of red berries', 'dcc-wildlife' ),
			],
			'velvetant'       => [
				'emoji' => '🐜',
				'name'  => __( 'Eastern Velvet Ant', 'dcc-wildlife' ),
				'sci'   => 'Dasymutilla occidentalis',
				'group' => 'safety',
				'flags' => [ 'danger' ],
				'odds'  => 'occasional',
				'fact'  => __( 'Not an ant at all but a wingless female wasp, covered in bright red-orange velvet and walking fast across open sand. Its other name is the cow killer, which is an exaggeration, but only about the cow: the sting is widely rated the most painful of any insect in the Southeast. It has no nest to defend and no interest in you, so the stings happen to bare feet.', 'dcc-wildlife' ),
				'safe'  => __( 'Do not pick it up, and do not walk sandy ground barefoot. That is genuinely the whole of it.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in the middle of the day', 'dcc-wildlife' ),
				'where' => __( 'open sand and bare ground, moving at speed', 'dcc-wildlife' ),
				'mark'  => __( 'a big, fast, wingless “ant” in vivid red-orange velvet — no real ant here looks like it', 'dcc-wildlife' ),
			],
			// ---- CRITTERS ----------------------------------------------
			'alligator'  => [
				'emoji' => '🐊',
				'name'  => __( 'Alligator', 'dcc-wildlife' ),
				'sci'   => 'Alligator mississippiensis',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'certain',
				'flags' => [ 'danger' ],
				'safe'  => __( 'Never feed one — a fed gator loses its fear of people and has to be destroyed. Keep pets and small children back from the water’s edge, and give any gator on the bank a wide berth.', 'dcc-wildlife' ),
				'fact'  => __( 'Florida’s state reptile, and in spring the loudest thing on the canal. A bull bellows partly below the pitch a human ear can reach, and the sound is strong enough to throw the water off his own back in a fine dancing spray — you feel the note before you hear it.', 'dcc-wildlife' ),
				'best'  => __( 'warm, sunny middays', 'dcc-wildlife' ),
				'where' => __( 'basking on sunny banks, or holding log-still mid-canal', 'dcc-wildlife' ),
				'sound' => __( 'Warm spring nights, when the bulls answer each other across the water; courtship runs April into May. Hatchlings chirp from inside the egg to tell their mother to dig them out.', 'dcc-wildlife' ),
			],
			'manatee'    => [
				'emoji' => '🦭',
				'name'  => __( 'Manatee', 'dcc-wildlife' ),
				'sci'   => 'Trichechus manatus latirostris',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'rare',
				'flags' => [ 'protected' ],
				'safe'  => __( 'Protected under federal law: never touch, feed, chase or crowd one, and keep the boat at idle when one is near.', 'dcc-wildlife' ),
				'fact'  => __( 'The first manatee ever recorded in Lake County arrived in 2015, and was named Leesburg for the city where she was first seen. She had a calf in the summer of 2017 — Sunset. In December 2019 a boat struck her, and she died of the injuries on 9 January 2020, carrying a near-full-term calf. A few have wandered up the chain since, most often in the warm months. They are kin to elephants, not to seals.', 'dcc-wildlife' ),
				'best'  => __( 'calm, sunny days', 'dcc-wildlife' ),
				'where' => __( 'slow water mid-canal — watch for a swirl and a round snout surfacing', 'dcc-wildlife' ),
			],
			'otter'      => [
				'emoji' => '🦦',
				'name'  => __( 'River Otter', 'dcc-wildlife' ),
				'sci'   => 'Lontra canadensis',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'occasional',
				'fact'  => __( 'Built for the water and plainly enjoying it — and able to stay under for as long as eight minutes when it wants to. A family keeps regular “latrine” spots along the bank, worn bare and left scented: less a mess than a noticeboard, read by every otter that passes.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'along the banks near fallen trees and root tangles', 'dcc-wildlife' ),
				'sound' => __( 'High, sharp chirps traded back and forth while they splash — more bird than mammal until you spot the wake.', 'dcc-wildlife' ),
			],
			// ---- THE TURTLES (1.33.0) -------------------------------------
			// One entry became twelve, by the owner's decision. The composite
			// "Turtles" named three species and showed one photograph, which
			// is no use at a basking log holding four kinds at once.
			//
			// The look-alike groups are the ones a guest ACTUALLY confuses, not
			// "all turtles". One `turtles` group put eleven other species in
			// every sheet — including a land tortoise underneath a basking
			// cooter — which is a wall of text, not an identification. Four
			// groups instead, each of things seen side by side: the basking
			// log, the small dark mud and musk turtles, the two big bottom
			// dwellers, and the two that walk on dry land.
			//
			// The gopher tortoise is here too, and is NOT a canal animal: the
			// 1.11.0 pass removed it from the composite for exactly that reason.
			// As its own entry it can say plainly that it lives on dry sand and
			// never swims, which is more useful than leaving it out.
			'peninsulacooter' => [
				'emoji' => '🐢',
				'name'  => __( 'Peninsula Cooter', 'dcc-wildlife' ),
				'sci'   => 'Pseudemys peninsularis',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'baskers',
				'odds'  => 'certain',
				'fact'  => __( 'The turtle on the log, and usually most of the other turtles on the log as well. Look at its head: two pale stripes double back on themselves like hairpins, which nothing else here does. Dozens more yellow lines run down the shell, the legs and the tail, so a basking cooter is effectively pin-striped from end to end.', 'dcc-wildlife' ),
				'best'  => __( 'mid-morning to mid-afternoon, once the sun is on the logs', 'dcc-wildlife' ),
				'where' => __( 'half-sunken logs and snags across from the dock, usually several at once', 'dcc-wildlife' ),
				'mark'  => __( 'hairpin-shaped pale stripes on the head, and a yellow — not red — belly', 'dcc-wildlife' ),
			],
			'redbelliedcooter' => [
				'emoji' => '🐢',
				'name'  => __( 'Florida Red-bellied Cooter', 'dcc-wildlife' ),
				'sci'   => 'Pseudemys nelsoni',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'baskers',
				'odds'  => 'likely',
				'fact'  => __( 'She sometimes buries her eggs inside a living alligator’s nest mound — the warmest, best-guarded nursery in Florida, kept by a guard who would happily eat her. Raccoons dig up ordinary turtle nests; almost nothing digs up an alligator’s. Look for her among the peninsula cooters on the basking logs, the one with red in her shell.', 'dcc-wildlife' ),
				'best'  => __( 'mid-morning, once the sun is on the logs', 'dcc-wildlife' ),
				'where' => __( 'basking logs at the canal’s edge, usually shoulder to shoulder with the peninsula cooters', 'dcc-wildlife' ),
				'mark'  => __( 'a yellow head-stripe running between the eyes to a point like an arrowhead, two small cusps notching the upper jaw, and a belly that is red, not yellow', 'dcc-wildlife' ),
			],
			'redearedslider'  => [
				'emoji' => '🐢',
				'name'  => __( 'Red-eared Slider', 'dcc-wildlife' ),
				'sci'   => 'Trachemys scripta elegans',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'baskers',
				'odds'  => 'likely',
				'flags' => [ 'invasive' ],
				'fact'  => __( 'The world’s most traded pet turtle, and the reason it is here: bought small, outgrown, and let go. It is native to the Mississippi drainage, not Florida, and releasing one has been against state rule for years — but the ones already out are breeding, and interbreeding with the native sliders. The red ear-patch is the giveaway.', 'dcc-wildlife' ),
				'best'  => __( 'sunny afternoons on the logs', 'dcc-wildlife' ),
				'where' => __( 'basking among the cooters, and around any bank people feed from', 'dcc-wildlife' ),
				'mark'  => __( 'a broad red or orange patch behind the eye — no native turtle here has one', 'dcc-wildlife' ),
			],
			'softshell'       => [
				'emoji' => '🐢',
				'name'  => __( 'Florida Softshell Turtle', 'dcc-wildlife' ),
				'sci'   => 'Apalone ferox',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'bigwater',
				'odds'  => 'certain',
				'fact'  => __( 'The largest softshell turtle in North America, and it does not look like a turtle at all: flat as a dropped pancake, leathery instead of hard, with a nose drawn out into a snorkel. It lies buried in the bottom with only that nose at the surface, waiting. When it does come out to bask it does so on the bank, alone, never on the log with the cooters.', 'dcc-wildlife' ),
				'best'  => __( 'warm mornings, on open bank rather than logs', 'dcc-wildlife' ),
				'where' => __( 'buried in soft bottom in the shallows, or hauled out flat on a muddy bank', 'dcc-wildlife' ),
				'mark'  => __( 'a soft, leathery, pancake-flat shell and a long tubular snout; no scutes and no hard rim', 'dcc-wildlife' ),
			],
			'snappingturtle'  => [
				'emoji' => '🐢',
				'name'  => __( 'Common Snapping Turtle', 'dcc-wildlife' ),
				'sci'   => 'Chelydra serpentina',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'bigwater',
				'odds'  => 'occasional',
				'fact'  => __( 'The one that is nearly always there and nearly never seen. It spends its life on the bottom, buried and waiting for something to swim within reach, and it almost never climbs out to bask — when it does float, only the ridged back breaks the surface. In the water it would far rather leave than fight. Out of it, cornered on a road, it has no shell to hide in and defends itself the only way it can.', 'dcc-wildlife' ),
				'best'  => __( 'any month; most often seen crossing land in late spring', 'dcc-wildlife' ),
				'where' => __( 'the canal bottom, and crossing open ground in nesting season', 'dcc-wildlife' ),
				'mark'  => __( 'a big ridged shell, a long saw-toothed tail and a head too large to pull in', 'dcc-wildlife' ),
			],
			'gophertortoise'  => [
				'emoji' => '🐢',
				'name'  => __( 'Gopher Tortoise', 'dcc-wildlife' ),
				'sci'   => 'Gopherus polyphemus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'landturtles',
				'odds'  => 'occasional',
				'flags' => [ 'protected' ],
				'fact'  => __( 'A landlord. Its burrow runs up to forty feet back into the sand and holds a steady temperature all year, and more than 350 other animals have been recorded sheltering in one — including the eastern indigo snake, which depends on them. Dig up a tortoise and you evict a neighbourhood. That is why they are protected, and why the burrows are too.', 'dcc-wildlife' ),
				'best'  => __( 'warm mornings, grazing near the burrow mouth', 'dcc-wildlife' ),
				'where' => __( 'dry sandy uplands and roadside scrub — never at the water', 'dcc-wildlife' ),
				'mark'  => __( 'stumpy elephantine hind feet, flattened shovel-like forelegs, and a domed brown shell; it walks on land and does not swim', 'dcc-wildlife' ),
			],
			'boxturtle'       => [
				'emoji' => '🐢',
				'name'  => __( 'Florida Box Turtle', 'dcc-wildlife' ),
				'sci'   => 'Terrapene bauri',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'landturtles',
				'odds'  => 'occasional',
				'fact'  => __( 'A land turtle that can shut itself away completely. A hinge across the underside lets the front and back of the plastron fold up against the shell like a drawbridge, sealing it in behind bone — no other turtle here can do it. The shell is high-domed and marked with radiating yellow lines on dark brown, like light through a cracked door.', 'dcc-wildlife' ),
				'best'  => __( 'mornings after rain, when they move about', 'dcc-wildlife' ),
				'where' => __( 'damp leaf litter at the wood’s edge, lawns and shaded yards', 'dcc-wildlife' ),
				'mark'  => __( 'a high domed shell with radiating yellow lines, and a hinged underside that closes flat', 'dcc-wildlife' ),
			],
			'muskturtle'      => [
				'emoji' => '🐢',
				'name'  => __( 'Eastern Musk Turtle', 'dcc-wildlife' ),
				'sci'   => 'Sternotherus odoratus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'mudmusk',
				'odds'  => 'likely',
				'fact'  => __( 'The stinkpot, and it earns the name: four glands under the shell rim release a drop each when it is handled, and the smell is memorable. You will rarely see it swim. It walks the bottom instead, bumping along in the shallows looking for something to eat, and it climbs — people find them sunning several feet up in a streamside bush.', 'dcc-wildlife' ),
				'best'  => __( 'warm evenings, or by torchlight off the dock', 'dcc-wildlife' ),
				'where' => __( 'walking the canal bottom in the shallows, and sometimes up in bankside branches', 'dcc-wildlife' ),
				'mark'  => __( 'small and dark, with two pale stripes on the side of the head and barbels under the chin', 'dcc-wildlife' ),
			],
			'loggerheadmusk'  => [
				'emoji' => '🐢',
				'name'  => __( 'Loggerhead Musk Turtle', 'dcc-wildlife' ),
				'sci'   => 'Sternotherus minor',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'mudmusk',
				'odds'  => 'occasional',
				'fact'  => __( 'A small turtle with a head built far too big for it — and the head is the point: the jaws are a nutcracker, and it lives on snails and freshwater mussels, crushing the shells outright. It wants clear water over limestone, so the spring runs are where to look for it rather than the canal.', 'dcc-wildlife' ),
				'best'  => __( 'bright middays in the spring runs', 'dcc-wildlife' ),
				'where' => __( 'clear limestone spring runs — Alexander Springs and Wekiwa rather than the canal', 'dcc-wildlife' ),
				'mark'  => __( 'an outsized head with a pale, dark-spotted throat, and a shell with three low keels when young', 'dcc-wildlife' ),
			],
			'stripedmudturtle' => [
				'emoji' => '🐢',
				'name'  => __( 'Striped Mud Turtle', 'dcc-wildlife' ),
				'sci'   => 'Kinosternon baurii',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'mudmusk',
				'odds'  => 'likely',
				'fact'  => __( 'A palm-sized turtle of ditches and shallow wet edges, and the one mud turtle here you can name at a glance. Three pale stripes run the length of the brown shell and two more run along each side of the face. It spends the dry spells buried and waits.', 'dcc-wildlife' ),
				'best'  => __( 'after rain, when the shallow places refill', 'dcc-wildlife' ),
				'where' => __( 'ditches, marshy edges and temporary pools rather than open water', 'dcc-wildlife' ),
				'mark'  => __( 'three pale stripes down the shell and two yellow stripes on each side of the head', 'dcc-wildlife' ),
			],
			'floridamudturtle' => [
				'emoji' => '🐢',
				'name'  => __( 'Florida Mud Turtle', 'dcc-wildlife' ),
				'sci'   => 'Kinosternon steindachneri',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'mudmusk',
				'odds'  => 'occasional',
				'fact'  => __( 'Found in Florida and nowhere else on Earth, and easy to walk past: a small, plain, dark turtle with nothing much written on it. That blankness is the identification — our other small turtle of the same places, the striped mud turtle, is striped three times over on the shell and twice more on the face. This one is not.', 'dcc-wildlife' ),
				'best'  => __( 'after rain, in the shallow wet places', 'dcc-wildlife' ),
				'where' => __( 'ditches, ponds and marshy shallows; it will cross open ground between them', 'dcc-wildlife' ),
				'mark'  => __( 'small, dark and unmarked — no shell stripes and no bold face stripes', 'dcc-wildlife' ),
			],
			'chickenturtle'   => [
				'emoji' => '🐢',
				'name'  => __( 'Florida Chicken Turtle', 'dcc-wildlife' ),
				'sci'   => 'Deirochelys reticularia chrysea',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'baskers',
				'odds'  => 'occasional',
				'fact'  => __( 'Built round a neck. Stretched out it is nearly as long as the shell, which is a strange thing to watch on a basking log, and the shell itself carries a fine net of yellow lines. The Florida form lives in the peninsula and nowhere else, and it prefers a quiet weedy pond or ditch to open water — it will walk overland when one dries up.', 'dcc-wildlife' ),
				'best'  => __( 'spring mornings, on logs in the quieter ponds', 'dcc-wildlife' ),
				'where' => __( 'weedy ponds, ditches and marsh edges away from the main channel', 'dcc-wildlife' ),
				'mark'  => __( 'an extraordinarily long neck, a net of fine yellow lines on the shell, and vertically striped hind legs', 'dcc-wildlife' ),
			],
			// ---- BATCH 11 (1.33.0): raptors, owls and night birds ------------
			// Twenty-one, and the look-alike groups were CUT DOWN after they were
			// first written. Putting all eleven raptors in one `raptor` group
			// rendered ten look-alikes in every sheet, which is the same wall
			// the turtles produced in batch 6 — and "a distant soaring bird is
			// the case where you want the whole field at once" was a rationalisation
			// for it, not a reason. Three groups instead, each a real question:
			//   raptor  — bald eagle and osprey, the two big ones over water
			//   buteos  — red-shouldered, red-tailed, short-tailed: what is circling
			//   falcons — kestrel, merlin, peregrine AND the Cooper's hawk, which
			//             is an accipiter and belongs here precisely because the
			//             question is "small fast raptor, which one" and its
			//             rounded tail is the answer
			// The swallow-tailed kite and the harrier carry no group: a forked
			// tail and a low V-winged quartering flight are unmistakable, and
			// their own marks say so.
			//
			// Vultures, owls and nightjars get their own groups. Nobody confuses
			// a vulture with a falcon.
			//
			// The red-tailed hawk closes the bald eagle's myth-correction from
			// the other end: that entry has said since 1.14.0 that the movie
			// eagle scream is a dubbed red-tailed hawk, and the hawk it names now
			// exists and says so itself.
			//
			// THREE PROTECTED SPECIES, AND THE STATUS IS CHECKED, NOT ASSUMED.
			// The red-cockaded woodpecker is THREATENED, not endangered: USFWS
			// downlisted it on 25 October 2024, effective 25 November. That is
			// the wood stork lesson applied before it could become a correction.
			// The kestrel's flag is for FLORIDA's resident subspecies, which is
			// state-listed; the wintering northern birds are not.
			'swallowtailedkite' => [
				'emoji' => '🦅',
				'name'  => __( 'Swallow-tailed Kite', 'dcc-wildlife' ),
				'sci'   => 'Elanoides forficatus',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'The most beautiful bird that flies over this canal, and it barely touches down: it takes insects and lizards on the wing, and drinks by skimming a mouthful off the surface without stopping. Black and white, with a long forked tail it steers with. In late summer the whole population leaves for southern Brazil — five thousand miles.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer, soaring on warm afternoons', 'dcc-wildlife' ),
				'where' => __( 'high over the cypress and the open water, circling and never flapping much', 'dcc-wildlife' ),
				'mark'  => __( 'a deep FORKED tail and clean white body with black wings — nothing else here has the shape', 'dcc-wildlife' ),
			],
			'redshoulderedhawk' => [
				'emoji' => '🦅',
				'name'  => __( 'Red-shouldered Hawk', 'dcc-wildlife' ),
				'sci'   => 'Buteo lineatus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'buteos',
				'odds'  => 'certain',
				'fact'  => __( 'The hawk you hear over the canal. It is the common woodland hawk of Florida, it perches low and calls constantly, and its call is copied so exactly by blue jays that half of them are a lie. Rusty shoulders and breast, and a black-and-white chequered pattern along the wings that shows even from below.', 'dcc-wildlife' ),
				'sound' => __( 'A loud, ringing kee-ah kee-ah, repeated. Blue jays imitate it almost perfectly, so half the ones you hear are jays.', 'dcc-wildlife' ),
				'best'  => __( 'any month, perched low or circling', 'dcc-wildlife' ),
				'where' => __( 'low branches, posts and wires at the wood’s edge, near water', 'dcc-wildlife' ),
				'mark'  => __( 'rusty barred underparts, and narrow white bands across a black tail', 'dcc-wildlife' ),
			],
			'redtailedhawk'     => [
				'emoji' => '🦅',
				'name'  => __( 'Red-tailed Hawk', 'dcc-wildlife' ),
				'sci'   => 'Buteo jamaicensis',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'buteos',
				'odds'  => 'likely',
				'fact'  => __( 'Bigger and heavier than the red-shouldered, and a bird of open ground rather than wood: it sits on a pole over a field and waits. From below, the brick-red upper tail catches the light when it banks, which is the only mark most people ever need. Its voice has been borrowed by Hollywood for every eagle ever filmed.', 'dcc-wildlife' ),
				'sound' => __( 'The scream every film uses for a bald eagle. It is this bird, dubbed over almost every raptor on screen.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on poles and soaring over open ground', 'dcc-wildlife' ),
				'where' => __( 'roadside poles, pasture edges and open sky — less often over the canal itself', 'dcc-wildlife' ),
				'mark'  => __( 'a brick-RED upper tail on an adult, and a dark belly band across pale underparts', 'dcc-wildlife' ),
			],
			'kestrel'           => [
				'emoji' => '🦅',
				'name'  => __( 'American Kestrel', 'dcc-wildlife' ),
				'sci'   => 'Falco sparverius',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'falcons',
				'flags' => [ 'protected' ],
				'odds'  => 'likely',
				'safe'  => __( 'Florida’s resident subspecies is state-listed as Threatened: do not disturb a nest cavity or a nest box in use.', 'dcc-wildlife' ),
				'fact'  => __( 'North America’s smallest falcon, and no bigger than a dove: rusty back, blue-grey wings on the male, and two black stripes down a white face. It hunts from a wire, and hovers on fast wingbeats when there is nowhere to perch. Florida has its own resident subspecies, which does not migrate and is in trouble.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on wires and posts', 'dcc-wildlife' ),
				'where' => __( 'roadside wires, fence posts and dead snags over open ground', 'dcc-wildlife' ),
				'mark'  => __( 'tiny, with TWO black stripes down each side of the face and a rusty back', 'dcc-wildlife' ),
			],
			'coopershawk'       => [
				'emoji' => '🦅',
				'name'  => __( 'Cooper’s Hawk', 'dcc-wildlife' ),
				'sci'   => 'Accipiter cooperii',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'falcons',
				'odds'  => 'likely',
				'fact'  => __( 'A bird-hunter built for it: short rounded wings and a long rudder of a tail, for threading through trees at speed after something smaller. If a feeder suddenly empties and the songbirds go silent, look up — this is usually why. Adults have a slate back, a rusty-barred breast and a hard red eye.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in wooded edges and gardens', 'dcc-wildlife' ),
				'where' => __( 'oak canopy and wooded edges, and around anywhere birds gather', 'dcc-wildlife' ),
				'mark'  => __( 'a long rounded-tipped tail and short wings; adult with a red eye and rusty barring', 'dcc-wildlife' ),
			],
			'harrier'           => [
				'emoji' => '🦅',
				'name'  => __( 'Northern Harrier', 'dcc-wildlife' ),
				'sci'   => 'Circus hudsonius',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'occasional',
				'fact'  => __( 'A hawk that hunts like an owl. It has a real facial disc — the same dish of stiff feathers that lets an owl find prey by ear — and it uses it, quartering low and slow over open marsh with its wings held in a shallow V. The white rump patch is the classic mark, but it sits on the BACK, so a bird overhead will not show it.', 'dcc-wildlife' ),
				'best'  => __( 'winter, low over open marsh', 'dcc-wildlife' ),
				'where' => __( 'gliding low and unhurried over marsh and wet pasture, rarely far above the grass', 'dcc-wildlife' ),
				'mark'  => __( 'a shallow V to the wings, a long tail and an owlish face; a white rump seen only from above or behind', 'dcc-wildlife' ),
			],
			'shorttailedhawk'   => [
				'emoji' => '🦅',
				'name'  => __( 'Short-tailed Hawk', 'dcc-wildlife' ),
				'sci'   => 'Buteo brachyurus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'buteos',
				'odds'  => 'occasional',
				'fact'  => __( 'A Florida speciality, and almost never seen perched — it hangs very high and hunts by dropping on birds from above, which means the only view you get is a silhouette against the sky. It comes in two colour forms and the DARK one is the commoner here: blackish, with silvery flight feathers.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, very high overhead', 'dcc-wildlife' ),
				'where' => __( 'circling high over woodland edges and marsh — always look up, never along', 'dcc-wildlife' ),
				'mark'  => __( 'small and compact, soaring high; either dark with silvery flight feathers, or white-bellied with a dark hood', 'dcc-wildlife' ),
			],
			'merlin'            => [
				'emoji' => '🦅',
				'name'  => __( 'Merlin', 'dcc-wildlife' ),
				'sci'   => 'Falco columbarius',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'falcons',
				'odds'  => 'occasional',
				'fact'  => __( 'A small falcon with no interest in subtlety: it hunts small birds by flying them down in the open, fast and level, rather than stooping from height. Dark, heavily streaked underneath, with only a faint moustache where a peregrine has a bold one. It builds nothing — it takes over an old crow’s nest.', 'dcc-wildlife' ),
				'best'  => __( 'winter, on bare perches over open ground', 'dcc-wildlife' ),
				'where' => __( 'the tops of dead branches and poles with a clear view, near open ground or water', 'dcc-wildlife' ),
				'mark'  => __( 'heavily streaked below with only a FAINT moustache stripe; the peregrine’s is a bold black helmet', 'dcc-wildlife' ),
			],
			'peregrine'         => [
				'emoji' => '🦅',
				'name'  => __( 'Peregrine Falcon', 'dcc-wildlife' ),
				'sci'   => 'Falco peregrinus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'falcons',
				'odds'  => 'occasional',
				'fact'  => __( 'The fastest animal alive. In a hunting stoop from height it passes two hundred miles an hour and kills the bird it hits with the impact. On a perch it is a heavy, broad-shouldered falcon with a black helmet down over the cheek and a finely barred chest, and it looks entirely capable of it.', 'dcc-wildlife' ),
				'best'  => __( 'winter, usually high or on a tall structure', 'dcc-wildlife' ),
				'where' => __( 'over open water and high structures; a passing bird more than a resident one', 'dcc-wildlife' ),
				'mark'  => __( 'a bold black “helmet” down the cheek, and pointed wings held stiff', 'dcc-wildlife' ),
			],
			'blackvulture'      => [
				'emoji' => '🦅',
				'name'  => __( 'Black Vulture', 'dcc-wildlife' ),
				'sci'   => 'Coragyps atratus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'vultures',
				'odds'  => 'certain',
				'fact'  => __( 'It cannot smell, so it watches the turkey vultures and follows them down. Short-tailed, with a grey wrinkled head and white patches at the very tips of the wings, and it flaps far more than its neighbour. It is also the one that strips the rubber off cars — the Park Service hands out tarps in the Everglades because of it, and nobody knows why they do it.', 'dcc-wildlife' ),
				'best'  => __( 'any month, all day', 'dcc-wildlife' ),
				'where' => __( 'circling over open ground, and perched in numbers on poles and roofs', 'dcc-wildlife' ),
				'mark'  => __( 'a GREY wrinkled head, a short tail, and white only at the wingtips; it flaps in short bursts', 'dcc-wildlife' ),
			],
			'turkeyvulture'     => [
				'emoji' => '🦅',
				'name'  => __( 'Turkey Vulture', 'dcc-wildlife' ),
				'sci'   => 'Cathartes aura',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'vultures',
				'odds'  => 'certain',
				'fact'  => __( 'One of very few birds with a real sense of smell, and an extraordinary one — it can find a carcass hidden under a closed forest canopy from the air. It rides thermals with its wings in a shallow V, rocking and tilting, and almost never flaps. The bald red head is for reaching inside things without carrying them away on its feathers.', 'dcc-wildlife' ),
				'best'  => __( 'any month, soaring from mid-morning', 'dcc-wildlife' ),
				'where' => __( 'riding thermals over the canal and the open country beyond', 'dcc-wildlife' ),
				'mark'  => __( 'a RED bald head, a longer tail, and silvery flight feathers along the whole rear edge of the wing; it rocks as it glides', 'dcc-wildlife' ),
			],
			'barredowl'         => [
				'emoji' => '🦅',
				'name'  => __( 'Barred Owl', 'dcc-wildlife' ),
				'sci'   => 'Strix varia',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'owls',
				'odds'  => 'certain',
				'fact'  => __( 'The owl of this canal, and the one you are most likely to hear from the dock at dusk. Big, round-headed, with no ear tufts and dark brown eyes where most owls have yellow. Barred across the chest, streaked down the belly. It will call in daylight, and it will answer a decent imitation.', 'dcc-wildlife' ),
				'sound' => __( 'Who cooks for you? Who cooks for you-aaall? — eight or nine hooted notes, and often a pair answering each other across the water.', 'dcc-wildlife' ),
				'best'  => __( 'dusk and after dark; often awake by day', 'dcc-wildlife' ),
				'where' => __( 'cypress and oak along the water, roosting on a shaded branch', 'dcc-wildlife' ),
				'mark'  => __( 'round head with NO ear tufts, and DARK brown eyes; barred chest over a streaked belly', 'dcc-wildlife' ),
			],
			'greathornedowl'    => [
				'emoji' => '🦅',
				'name'  => __( 'Great Horned Owl', 'dcc-wildlife' ),
				'sci'   => 'Bubo virginianus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'owls',
				'odds'  => 'likely',
				'fact'  => __( 'The heavyweight. Ear tufts, a white throat and huge yellow eyes, and a grip strong enough to take a skunk or another owl. It builds nothing of its own: it takes over a hawk’s or a crow’s old nest, usually in a live oak hung with Spanish moss, and it does it in the middle of winter — owlets here are often out before anything else has started nesting.', 'dcc-wildlife' ),
				'sound' => __( 'A series of deep, soft hoots — hoo, hoo-hoo, hoo, hoo — carrying a long way on a still night.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, and calling from midwinter', 'dcc-wildlife' ),
				'where' => __( 'tall pines and live oaks, and old hawk nests in the crowns', 'dcc-wildlife' ),
				'mark'  => __( 'prominent EAR TUFTS, a white throat patch and yellow eyes — the barred owl has none of the three', 'dcc-wildlife' ),
			],
			'screechowl'        => [
				'emoji' => '🦅',
				'name'  => __( 'Eastern Screech-Owl', 'dcc-wildlife' ),
				'sci'   => 'Megascops asio',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'owls',
				'odds'  => 'likely',
				'fact'  => __( 'A cat-sized owl that fits in a mailbox, and comes in two colours — grey and rust-red, both found here, sometimes in the same brood. It roosts jammed into a tree hollow with its eyes half shut and its bark-pattern plumage doing the rest, and people live beside one for years without knowing.', 'dcc-wildlife' ),
				'sound' => __( 'Not a screech at all: a soft descending whinny like a small horse, or a long even trill on one note.', 'dcc-wildlife' ),
				'best'  => __( 'after dark; roosting in holes by day', 'dcc-wildlife' ),
				'where' => __( 'tree cavities, nest boxes and dense foliage in gardens and oak hammock', 'dcc-wildlife' ),
				'mark'  => __( 'small with EAR TUFTS and yellow eyes, grey or rusty red; a great horned owl is four times the size', 'dcc-wildlife' ),
			],
			'barnowl'           => [
				'emoji' => '🦅',
				'name'  => __( 'Barn Owl', 'dcc-wildlife' ),
				'sci'   => 'Tyto alba',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'owls',
				'odds'  => 'occasional',
				'fact'  => __( 'A white heart on a face, and the hearing to go with it: its ear openings are set at different heights on the skull, so a sound reaches one fractionally before the other and the owl can place it in three dimensions. It can catch a mouse in complete darkness, by ear alone, with its eyes shut.', 'dcc-wildlife' ),
				'sound' => __( 'A long, harsh, rasping shriek in the dark — no hooting at all, and genuinely unnerving the first time.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, over open ground', 'dcc-wildlife' ),
				'where' => __( 'barns, silos, culverts and structures near open fields; it hunts low over grass', 'dcc-wildlife' ),
				'mark'  => __( 'a white HEART-SHAPED face, dark eyes, and pale unmarked underparts; it looks ghostly in headlights', 'dcc-wildlife' ),
			],
			'chuckwillswidow'   => [
				'emoji' => '🦅',
				'name'  => __( 'Chuck-will’s-widow', 'dcc-wildlife' ),
				'sci'   => 'Antrostomus carolinensis',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'nightbirds',
				'odds'  => 'likely',
				'fact'  => __( 'The largest nightjar in North America, and you will hear it all spring without once seeing it: by day it lies lengthways along a branch and disappears into the bark. The gape is startling for the size of the bird, and it hunts moths on the wing at dusk. Ours breed here; the whip-poor-will only winters.', 'dcc-wildlife' ),
				'sound' => __( 'It says its own name, slowly — chuck-will’s-WID-ow — over and over from the dark woods on a spring night.', 'dcc-wildlife' ),
				'best'  => __( 'after dark from spring into summer', 'dcc-wildlife' ),
				'where' => __( 'dry woodland near the water; roosting along branches by day', 'dcc-wildlife' ),
				'mark'  => __( 'larger and browner than the whip-poor-will, and it names itself in four slow syllables', 'dcc-wildlife' ),
			],
			'whippoorwill'      => [
				'emoji' => '🦅',
				'name'  => __( 'Eastern Whip-poor-will', 'dcc-wildlife' ),
				'sci'   => 'Antrostomus vociferus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'nightbirds',
				'odds'  => 'occasional',
				'fact'  => __( 'Heard far more than seen, and here it is barely heard either — Central Florida gets this bird in winter, when it is mostly silent, so the song belongs to somewhere else. The way most people meet one is in headlights: a pair of red eyeshine on a dark road, and a moth-like bird lifting off.', 'dcc-wildlife' ),
				'sound' => __( 'WHIP-poor-WILL, faster and higher than the chuck-will’s-widow, and repeated tirelessly.', 'dcc-wildlife' ),
				'best'  => __( 'winter nights, and mostly silent then', 'dcc-wildlife' ),
				'where' => __( 'open woodland floor and quiet roads after dark', 'dcc-wildlife' ),
				'mark'  => __( 'smaller and greyer than the chuck-will’s-widow, with a shorter, faster three-note song', 'dcc-wildlife' ),
			],
			'nighthawk'         => [
				'emoji' => '🦅',
				'name'  => __( 'Common Nighthawk', 'dcc-wildlife' ),
				'sci'   => 'Chordeiles minor',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'nightbirds',
				'odds'  => 'likely',
				'fact'  => __( 'Neither a hawk nor strictly nocturnal, which leaves the name nothing to stand on. It hunts insects at dusk on long thin wings, each one crossed by a clean white bar, flying with an erratic bat-like flicker. The booming you hear at the bottom of its display dive is the wind through its own feathers.', 'dcc-wildlife' ),
				'sound' => __( 'A nasal PEENT over and over at dusk, and in display a hollow BOOM as the male pulls out of a dive — made by air through the wing feathers, not by its voice.', 'dcc-wildlife' ),
				'best'  => __( 'dusk in the warm months, over open sky', 'dcc-wildlife' ),
				'where' => __( 'over the lake, lawns and any lit open space at last light', 'dcc-wildlife' ),
				'mark'  => __( 'long pointed wings with a white BAR across each, and a bounding, erratic flight', 'dcc-wildlife' ),
			],
			'wildturkey'        => [
				'emoji' => '🦅',
				'name'  => __( 'Osceola Wild Turkey', 'dcc-wildlife' ),
				'sci'   => 'Meleagris gallopavo osceola',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'Florida has its own turkey and it lives nowhere else on Earth — the Osceola, found only on the peninsula. It is smaller and darker than the turkey of the rest of the country, with far less white barring in the wing. A gobbler in spring is iridescent bronze and green with a bare red and blue head.', 'dcc-wildlife' ),
				'sound' => __( 'The gobble carries half a mile on a still spring morning.', 'dcc-wildlife' ),
				'best'  => __( 'early mornings, spring especially', 'dcc-wildlife' ),
				'where' => __( 'oak hammock, pasture edges and pine flatwoods; often a small group walking', 'dcc-wildlife' ),
				'mark'  => __( 'very dark wings with little white barring — the mark of the Florida subspecies', 'dcc-wildlife' ),
			],
			'scrubjay'          => [
				'emoji' => '🦅',
				'name'  => __( 'Florida Scrub-Jay', 'dcc-wildlife' ),
				'sci'   => 'Aphelocoma coerulescens',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'jays',
				'flags' => [ 'protected' ],
				'odds'  => 'rare',
				'safe'  => __( 'Federally threatened, and tame enough to land on you. Do not feed one — jays fed peanuts and birdseed nest weeks too early, before the caterpillars their chicks need have hatched.', 'dcc-wildlife' ),
				'fact'  => __( 'The only bird species on Earth found nowhere but Florida, and it is fussy about where: dry scrub kept open by fire, which is exactly the land people build on. Blue and grey with no crest, and famously unbothered by people. Young birds stay on to help their parents raise the next brood instead of leaving.', 'dcc-wildlife' ),
				'sound' => __( 'A harsh, rasping call, quite unlike a blue jay’s clear whistle.', 'dcc-wildlife' ),
				'best'  => __( 'mornings, in open scrub', 'dcc-wildlife' ),
				'where' => __( 'dry sand scrub with low oaks — not the canal; a trip to the Ocala scrub', 'dcc-wildlife' ),
				'mark'  => __( 'blue and grey with NO crest and no black necklace; a blue jay has both, plus white wing spots', 'dcc-wildlife' ),
			],
			'redcockaded'       => [
				'emoji' => '🦅',
				'name'  => __( 'Red-cockaded Woodpecker', 'dcc-wildlife' ),
				'sci'   => 'Dryobates borealis',
				'group' => 'birds',
				'browse' => 'birds',
				'flags' => [ 'protected' ],
				'odds'  => 'rare',
				'safe'  => __( 'Federally threatened since 2024, when it was downlisted from endangered. Keep well back from a cavity tree; the white resin bands mark one in use.', 'dcc-wildlife' ),
				'fact'  => __( 'The only woodpecker that carves its nest into a LIVING pine — everything else uses dead wood — and it takes years to do. It then drills small wells around the hole so resin runs down the trunk, which stops rat snakes climbing to the eggs. The red cockade the name promises is a few feathers on the male, effectively invisible.', 'dcc-wildlife' ),
				'sound' => __( 'A raspy, nasal sklit repeated as a family moves through the pines.', 'dcc-wildlife' ),
				'best'  => __( 'mornings, in old open pine', 'dcc-wildlife' ),
				'where' => __( 'mature longleaf and slash pine with an open floor; not the canal', 'dcc-wildlife' ),
				'mark'  => __( 'a big white cheek patch and a barred back; the red cockade is not a field mark at any distance', 'dcc-wildlife' ),
			],
			// ---- BATCH 10 (1.33.0): water birds and shorebirds --------------
			// Twenty-three, and most of them are WINTER birds — which is the
			// point of the batch. The guide's water birds were the residents; a
			// guest here in January was looking at rafts of ducks and gulls the
			// guide could not name at all.
			//
			// Look-alike groups, cut by how a guest actually asks the question
			// rather than by taxonomy — and cut DOWN after a first pass put all
			// ten waterfowl in one group and rendered nine look-alikes a sheet:
			//   divingducks — ring-necked vs scaup vs hooded merganser
			//   dabblers    — teal, shoveler, wigeon
			//   duck        — the mallard JOINS the existing native group, because
			//                 hen mallard against mottled duck is the pair that
			//                 matters and the guide already flagged it
			//   ferals      — Muscovy and Egyptian goose: the two big odd birds
			//                 on a lawn, confusable with each other and nothing wild
			//   gulls       — three birds told apart mostly by LEG COLOUR
			//   terns, shorebirds
			// The loon carries no group; its nearest confusion is a cormorant,
			// which lives in `dark`, so its own mark line names the cormorant.
			//
			// The mallard is a cross-link back to the Florida mottled duck: that
			// entry already said hybridising with released farmyard mallards is
			// the single biggest threat to the native bird, and now the other
			// half of the sentence exists and carries the hen-vs-hen field mark.
			'muscovy'           => [
				'emoji' => '🐦',
				'name'  => __( 'Muscovy Duck', 'dcc-wildlife' ),
				'sci'   => 'Cairina moschata',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'ferals',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'The big black-and-white duck with the red warty face, and it is not a wild bird: the ones here descend from escaped domestic stock. A true wild Muscovy is a shy tropical forest duck from Mexico southwards. These are a park duck, tame to the point of rudeness, and they hybridise with anything that will have them.', 'dcc-wildlife' ),
				'best'  => __( 'any month, all day', 'dcc-wildlife' ),
				'where' => __( 'lawns, boat ramps and anywhere people feed ducks', 'dcc-wildlife' ),
				'mark'  => __( 'red, warty, bare skin round the face and bill; nothing native here has it', 'dcc-wildlife' ),
			],
			'ringneckedduck'    => [
				'emoji' => '🐦',
				'name'  => __( 'Ring-necked Duck', 'dcc-wildlife' ),
				'sci'   => 'Aythya collaris',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'divingducks',
				'odds'  => 'likely',
				'fact'  => __( 'Named for a mark almost nobody has ever seen. The drake does carry a chestnut ring round the neck, and it is invisible at any normal distance — what you actually see is a bold WHITE ring round the bill, which the bird is not named after. Peaked head, black back, pale flanks. Winter only.', 'dcc-wildlife' ),
				'best'  => __( 'winter, on open water', 'dcc-wildlife' ),
				'where' => __( 'the open middle of the lakes and the canal mouth, in small rafts', 'dcc-wildlife' ),
				'mark'  => __( 'a peaked, angular head and a white ring round the BILL; scaup have a rounded head and a grey back', 'dcc-wildlife' ),
			],
			'lesserscaup'       => [
				'emoji' => '🐦',
				'name'  => __( 'Lesser Scaup', 'dcc-wildlife' ),
				'sci'   => 'Aythya affinis',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'divingducks',
				'odds'  => 'likely',
				'fact'  => __( 'The drake is a study in three tones: black at both ends, pale grey in the middle, with a head that glosses purple in good light. It dives for its food and spends the winter out on the open water in rafts. The hen is plain brown with a white patch at the base of the bill.', 'dcc-wildlife' ),
				'best'  => __( 'winter, out on the lakes', 'dcc-wildlife' ),
				'where' => __( 'open water well off the bank, diving and resurfacing', 'dcc-wildlife' ),
				'mark'  => __( 'a ROUNDED head and a pale grey back; the ring-necked duck is peaked-headed with a black back', 'dcc-wildlife' ),
			],
			'hoodedmerganser'   => [
				'emoji' => '🐦',
				'name'  => __( 'Hooded Merganser', 'dcc-wildlife' ),
				'sci'   => 'Lophodytes cucullatus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'divingducks',
				'odds'  => 'likely',
				'fact'  => __( 'The drake raises and lowers a fan of a crest like a hand of cards — white bordered black when it is up, a flat dark lump when it is down, and it changes between one look at him and the next. It is a sawbill: the thin serrated beak is for gripping fish, which it chases underwater.', 'dcc-wildlife' ),
				'best'  => __( 'winter mornings on quiet water', 'dcc-wildlife' ),
				'where' => __( 'sheltered backwaters and canal edges rather than the open lake', 'dcc-wildlife' ),
				'mark'  => __( 'a thin dark serrated bill, and a crest that goes up and down; no other duck here has either', 'dcc-wildlife' ),
			],
			'bluewingedteal'    => [
				'emoji' => '🐦',
				'name'  => __( 'Blue-winged Teal', 'dcc-wildlife' ),
				'sci'   => 'Spatula discors',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'dabblers',
				'odds'  => 'likely',
				'fact'  => __( 'A small, fast, early duck: it is among the first to arrive in autumn and the first to leave. The drake wears a bold white crescent across the front of a slate-grey face, which is the mark to look for, and both sexes flash a chalky powder-blue panel on the forewing when they go up.', 'dcc-wildlife' ),
				'best'  => __( 'autumn and winter, in the shallows', 'dcc-wildlife' ),
				'where' => __( 'shallow weedy margins and marsh ponds, in tight fast flocks', 'dcc-wildlife' ),
				'mark'  => __( 'a white crescent on the drake’s face; a pale blue forewing patch on both sexes in flight', 'dcc-wildlife' ),
			],
			'mallard'           => [
				'emoji' => '🐦',
				'name'  => __( 'Mallard', 'dcc-wildlife' ),
				'sci'   => 'Anas platyrhynchos',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'duck',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'Everyone knows the drake — bottle-green head, white collar, yellow bill. The problem is the hen, and it is a serious one here: released farmyard mallards interbreed with Florida’s own mottled duck, and a hen mallard and a mottled duck look nearly the same. State biologists call that the single biggest threat to the native bird.', 'dcc-wildlife' ),
				'best'  => __( 'winter, and year-round where birds are fed', 'dcc-wildlife' ),
				'where' => __( 'park ponds and anywhere ducks are fed; less often on wild water', 'dcc-wildlife' ),
				'mark'  => __( 'a hen mallard has a WHITE-edged tail and a dark streak through a pale face; a mottled duck has neither, and an unstreaked buff throat', 'dcc-wildlife' ),
			],
			'shoveler'          => [
				'emoji' => '🐦',
				'name'  => __( 'Northern Shoveler', 'dcc-wildlife' ),
				'sci'   => 'Spatula clypeata',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'dabblers',
				'odds'  => 'likely',
				'fact'  => __( 'The bill is the whole bird: a great spatula lined inside with hundreds of comb-like plates, so the duck can swim head-down with its beak in the water and strain out the plankton. Flocks sometimes spin in a circle together to pull food up from below. The drake is green-headed, white-chested and chestnut-flanked.', 'dcc-wildlife' ),
				'best'  => __( 'winter, in the shallows', 'dcc-wildlife' ),
				'where' => __( 'shallow weedy water, swimming with the bill down and the head swinging', 'dcc-wildlife' ),
				'mark'  => __( 'an oversized spoon-shaped bill, held low in the water; nothing else here comes close', 'dcc-wildlife' ),
			],
			'wigeon'            => [
				'emoji' => '🐦',
				'name'  => __( 'American Wigeon', 'dcc-wildlife' ),
				'sci'   => 'Mareca americana',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'dabblers',
				'odds'  => 'likely',
				'fact'  => __( 'An outlaw among ducks. It cannot dive, so it waits beside the ones that can — coots especially — and takes the weed off them as they surface. The drake has a broad green stripe back from the eye and a cream crown so pale it earned the old name baldpate. It also grazes on land like a small goose.', 'dcc-wildlife' ),
				'best'  => __( 'winter, on the open lakes and the banks', 'dcc-wildlife' ),
				'where' => __( 'open water beside rafts of coots, and grazing on grassy edges', 'dcc-wildlife' ),
				'mark'  => __( 'a green eye-stripe and a whitish crown on the drake, and a small blue-grey bill with a black tip', 'dcc-wildlife' ),
			],
			'egyptiangoose'     => [
				'emoji' => '🐦',
				'name'  => __( 'Egyptian Goose', 'dcc-wildlife' ),
				'sci'   => 'Alopochen aegyptiaca',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'ferals',
				'flags' => [ 'invasive' ],
				'odds'  => 'occasional',
				'fact'  => __( 'An African bird that is not really a goose — it is a shelduck — and it is not supposed to be here at all. Escaped ornamental stock has bred its way across Florida over the last few decades, and it is still spreading into the centre. Look for the dark chocolate patch round each eye, like smudged eyeliner.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on open lawns and banks', 'dcc-wildlife' ),
				'where' => __( 'mown grass beside water, golf courses and retention ponds', 'dcc-wildlife' ),
				'mark'  => __( 'a dark chocolate patch around each eye, a pink bill and legs, and a big white wing flash in flight', 'dcc-wildlife' ),
			],
			'loon'              => [
				'emoji' => '🐦',
				'name'  => __( 'Common Loon', 'dcc-wildlife' ),
				'sci'   => 'Gavia immer',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'occasional',
				'fact'  => __( 'You will not see the black-and-white chequerboard bird from the postcards: loons spend the winter here in plain grey and white, and the tremolo call belongs to northern lakes in summer. Its bones are solid rather than hollow, which is what lets it sink and chase fish — and why it needs a long taxiing run to get airborne.', 'dcc-wildlife' ),
				'best'  => __( 'winter, well out on the big lakes', 'dcc-wildlife' ),
				'where' => __( 'the open water of the bigger lakes, diving for long periods', 'dcc-wildlife' ),
				'mark'  => __( 'a heavy dagger bill held LEVEL on a low-riding body — a cormorant rides just as low but holds its hooked bill tilted up', 'dcc-wildlife' ),
			],
			'laughinggull'      => [
				'emoji' => '🐦',
				'name'  => __( 'Laughing Gull', 'dcc-wildlife' ),
				'sci'   => 'Leucophaeus atricilla',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'gulls',
				'odds'  => 'likely',
				'fact'  => __( 'The gull that sounds like it is enjoying itself — a long descending cackle that carries right across a parking lot. In summer the head is jet black with white crescents round the eye; in winter that goes, leaving a smudged grey wash behind the ear. It is a coastal bird that comes inland in numbers.', 'dcc-wildlife' ),
				'sound' => __( 'A rolling, descending laugh, ha-ha-ha-haah, falling away at the end.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, all day', 'dcc-wildlife' ),
				'where' => __( 'open lakes, shorelines, car parks and anywhere with food', 'dcc-wildlife' ),
				'mark'  => __( 'a black hood in summer, a dark grey back, and dark red-black legs and bill', 'dcc-wildlife' ),
			],
			'ringbilledgull'    => [
				'emoji' => '🐦',
				'name'  => __( 'Ring-billed Gull', 'dcc-wildlife' ),
				'sci'   => 'Larus delawarensis',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'gulls',
				'odds'  => 'likely',
				'fact'  => __( 'The commonest gull inland in winter, and the easiest to name: a clean black band right round the yellow bill, as though somebody had drawn on it. Pale grey back, white head, and YELLOW legs. It is the gull of car parks and lakeshores rather than the open sea.', 'dcc-wildlife' ),
				'best'  => __( 'winter, all day', 'dcc-wildlife' ),
				'where' => __( 'open lakeshores, boat ramps and car parks', 'dcc-wildlife' ),
				'mark'  => __( 'a crisp black ring round a yellow bill, and yellow legs — the herring gull has a red spot and PINK legs', 'dcc-wildlife' ),
			],
			'herringgull'       => [
				'emoji' => '🐦',
				'name'  => __( 'Herring Gull', 'dcc-wildlife' ),
				'sci'   => 'Larus argentatus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'gulls',
				'odds'  => 'occasional',
				'fact'  => __( 'The big one. Half again the size of a ring-billed gull, with a heavy bill carrying a red spot near the tip instead of a black ring, and pink legs rather than yellow. It takes four years to grow into that adult plumage, which is why so many big gulls here are a confusing mottled brown.', 'dcc-wildlife' ),
				'best'  => __( 'winter, on the bigger open water', 'dcc-wildlife' ),
				'where' => __( 'the larger lakes and their shorelines, often with other gulls', 'dcc-wildlife' ),
				'mark'  => __( 'PINK legs and a red spot on a heavy bill — the ring-billed gull has yellow legs and a black bill ring', 'dcc-wildlife' ),
			],
			'bonapartesgull'    => [
				'emoji' => '🐦',
				'name'  => __( 'Bonaparte’s Gull', 'dcc-wildlife' ),
				'sci'   => 'Chroicocephalus philadelphia',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'gulls',
				'odds'  => 'occasional',
				'fact'  => __( 'Small, buoyant and tern-like, it flies more like a marsh tern than a gull and feeds by picking off the surface. It is also the only gull in the world that habitually nests in trees — in spruce, up north, which is about as un-gull-like as a gull gets. In winter it shows a neat dark spot behind the eye.', 'dcc-wildlife' ),
				'best'  => __( 'winter, on open water', 'dcc-wildlife' ),
				'where' => __( 'open lakes, picking at the surface in loose flocks', 'dcc-wildlife' ),
				'mark'  => __( 'small and delicate with a thin black bill, and a single dark ear-spot in winter', 'dcc-wildlife' ),
			],
			'forsterstern'      => [
				'emoji' => '🐦',
				'name'  => __( 'Forster’s Tern', 'dcc-wildlife' ),
				'sci'   => 'Sterna forsteri',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'terns',
				'odds'  => 'likely',
				'fact'  => __( 'A slim, pale, buoyant tern that hunts by hovering and dropping. Here it is almost always in winter dress, and that changes it completely: instead of a black cap it wears a black BANDIT MASK through the eye on an otherwise white head, which is the single most useful thing to know about terns on these lakes.', 'dcc-wildlife' ),
				'best'  => __( 'autumn through spring, over open water', 'dcc-wildlife' ),
				'where' => __( 'hovering over the open lakes and the canal mouth, then dropping', 'dcc-wildlife' ),
				'mark'  => __( 'in winter, a BLACK EYE PATCH on a white head — not a black cap; slim orange-black bill', 'dcc-wildlife' ),
			],
			'caspiantern'       => [
				'emoji' => '🐦',
				'name'  => __( 'Caspian Tern', 'dcc-wildlife' ),
				'sci'   => 'Hydroprogne caspia',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'terns',
				'odds'  => 'likely',
				'fact'  => __( 'The largest tern in the world, and it looks it: gull-sized, heavy, with a great carrot of a bill you can see from a long way off. It flies with a slight downward tilt to the bill, hunting, and calls with a harsh grating croak that sounds much more like a heron than a tern.', 'dcc-wildlife' ),
				'sound' => __( 'A harsh, low, grating croak — nothing like the light calls of the smaller terns.', 'dcc-wildlife' ),
				'best'  => __( 'any month, over the open lakes', 'dcc-wildlife' ),
				'where' => __( 'over the bigger lakes and the canal mouth, often alone', 'dcc-wildlife' ),
				'mark'  => __( 'gull-sized, with a very thick BRIGHT RED bill — Forster’s tern is half the size with a slim bill', 'dcc-wildlife' ),
			],
			'blackskimmer'      => [
				'emoji' => '🐦',
				'name'  => __( 'Black Skimmer', 'dcc-wildlife' ),
				'sci'   => 'Rynchops niger',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'terns',
				'odds'  => 'occasional',
				'fact'  => __( 'Built round one trick, and no other bird in the hemisphere shares it: the lower half of the bill is markedly longer than the upper, and the bird flies with it slicing the water, snapping shut on whatever it touches. Skimmers are also the only birds in the world whose pupils close to vertical slits, like a cat’s.', 'dcc-wildlife' ),
				'best'  => __( 'calm evenings, low over still water', 'dcc-wildlife' ),
				'where' => __( 'skimming the surface of calm open water, usually near dusk', 'dcc-wildlife' ),
				'mark'  => __( 'a long lower mandible, black above and white below, with a red-and-black bill', 'dcc-wildlife' ),
			],
			'killdeer'          => [
				'emoji' => '🐦',
				'name'  => __( 'Killdeer', 'dcc-wildlife' ),
				'sci'   => 'Charadrius vociferus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'shorebirds',
				'odds'  => 'certain',
				'fact'  => __( 'A shorebird that has given up on shores. It nests on gravel, car parks and flat roofs, and when you walk near the nest the adult staggers off dragging an apparently broken wing until you have followed it far enough away — then flies off perfectly well. Two black bands across the chest, and it says its own name.', 'dcc-wildlife' ),
				'sound' => __( 'A loud, insistent kill-DEER, kill-DEER, repeated — often the first thing you hear, day or night.', 'dcc-wildlife' ),
				'best'  => __( 'any month, day or night', 'dcc-wildlife' ),
				'where' => __( 'gravel, short grass, lawn edges and bare open ground away from water', 'dcc-wildlife' ),
				'mark'  => __( 'TWO black breast bands and a red eye-ring; most small plovers have only one band', 'dcc-wildlife' ),
			],
			'spottedsandpiper'  => [
				'emoji' => '🐦',
				'name'  => __( 'Spotted Sandpiper', 'dcc-wildlife' ),
				'sci'   => 'Actitis macularius',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'shorebirds',
				'odds'  => 'likely',
				'fact'  => __( 'It teeters. Constantly, the whole rear half of the body bobbing up and down as it walks, which names it from a hundred yards. The spots it is named for are breeding dress and you will not see them here — our birds are plain brown and white. The females are the ones that compete for mates, and the males do most of the sitting.', 'dcc-wildlife' ),
				'best'  => __( 'autumn through spring, at the water’s edge', 'dcc-wildlife' ),
				'where' => __( 'walking the very edge of the bank, alone, bobbing as it goes', 'dcc-wildlife' ),
				'mark'  => __( 'the constant teetering, and a white shoulder-wedge in front of the folded wing; no spots in winter', 'dcc-wildlife' ),
			],
			'greateryellowlegs' => [
				'emoji' => '🐦',
				'name'  => __( 'Greater Yellowlegs', 'dcc-wildlife' ),
				'sci'   => 'Tringa melanoleuca',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'shorebirds',
				'odds'  => 'likely',
				'fact'  => __( 'Long, elegant and loud. The legs really are that yellow, and the bird is usually heard before it is seen — a ringing three- or four-note alarm as it lifts off, which is why marsh birders call it the telltale. It strides through shallow water rather than picking at the edge.', 'dcc-wildlife' ),
				'sound' => __( 'A ringing, urgent tew-tew-tew as it flushes, three or four notes falling away.', 'dcc-wildlife' ),
				'best'  => __( 'autumn through spring, in the shallows', 'dcc-wildlife' ),
				'where' => __( 'wading the open shallows and flooded margins, alone or in twos', 'dcc-wildlife' ),
				'mark'  => __( 'bright yellow legs and a long, slightly upturned bill longer than the head', 'dcc-wildlife' ),
			],
			'blackneckedstilt'  => [
				'emoji' => '🐦',
				'name'  => __( 'Black-necked Stilt', 'dcc-wildlife' ),
				'sci'   => 'Himantopus mexicanus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'shorebirds',
				'odds'  => 'likely',
				'fact'  => __( 'Absurd, and deliberately so: relative to its body it has the longest legs of any bird on Earth except the flamingo, and they are bright coral pink. Black above, white below, with a needle of a bill. It wades deeper than anything else its size and complains loudly about everything.', 'dcc-wildlife' ),
				'best'  => __( 'spring through autumn, in shallow open water', 'dcc-wildlife' ),
				'where' => __( 'flooded margins, shallow ponds and marsh edges', 'dcc-wildlife' ),
				'mark'  => __( 'impossibly long PINK legs, a needle-thin black bill, and clean black-and-white plumage', 'dcc-wildlife' ),
			],
			'wilsonssnipe'      => [
				'emoji' => '🐦',
				'name'  => __( 'Wilson’s Snipe', 'dcc-wildlife' ),
				'sci'   => 'Gallinago delicata',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'shorebirds',
				'odds'  => 'occasional',
				'fact'  => __( 'A bird you almost always meet by accident: it sits tight in wet grass until you are a step away, then explodes upward in a zigzag with a rasping call. The bill is absurdly long and flexible at the tip, for feeling out worms in mud. In display it dives, and the sound it makes is its tail feathers, not its voice.', 'dcc-wildlife' ),
				'sound' => __( 'A rasping scaip as it flushes. The winnowing hu-hu-hu of display flight is made by air over the outer TAIL feathers.', 'dcc-wildlife' ),
				'best'  => __( 'winter, in wet grass', 'dcc-wildlife' ),
				'where' => __( 'flooded grass, ditch margins and soggy ground — seen when flushed', 'dcc-wildlife' ),
				'mark'  => __( 'a very long straight bill and bold cream head-stripes; it flushes in a zigzag', 'dcc-wildlife' ),
			],
			'leastsandpiper'    => [
				'emoji' => '🐦',
				'name'  => __( 'Least Sandpiper', 'dcc-wildlife' ),
				'sci'   => 'Calidris minutilla',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'shorebirds',
				'odds'  => 'likely',
				'fact'  => __( 'The smallest shorebird in the world — an ounce of bird, five inches long — and it is on the mud right in front of you, creeping along hunched over. Among the little brown sandpipers people lump together as peeps, this is the one with YELLOW-GREEN legs; the others have black ones.', 'dcc-wildlife' ),
				'best'  => __( 'autumn through spring, on mud and shallow edges', 'dcc-wildlife' ),
				'where' => __( 'exposed mud and shallow margins, creeping in small loose flocks', 'dcc-wildlife' ),
				'mark'  => __( 'tiny, brown, and crouched, with YELLOW-GREEN legs — the other peeps have black legs', 'dcc-wildlife' ),
			],
			// ---- BATCH 12 (1.33.0): songbirds, doves and woodpeckers, part 1 --
			// Twenty-eight, and this is where the guide finally covers what a
			// guest actually hears. FIFTY-THREE of the sixty across batches 12
			// and 13 carry a `sound` line, and that is the 1.14.0 rule holding
			// rather than bending: a sound line goes in where a distinctive,
			// guest-recognisable voice could be VERIFIED, and for songbirds that
			// is nearly always. It is the same case the frogs made in batch 9.
			//
			// Look-alike groups, cut small from the start this time — the wall
			// was built twice in batches 10 and 11 and the lesson is taken:
			//   redheads (2)          which woodpecker actually has a red head
			//   blackwhitepeckers (3) downy vs hairy vs sapsucker, all pied on a trunk
			//   mimics (3)            mockingbird, catbird, thrasher
			//   doves (5) blackbirds (5) swallows (4) littlegreys (4)
			//   winterlittle (4)      a small olive-yellow bird in winter, which one
			//   sparrows (3) redbirds (3) flycatchers (3)
			//   wrens (2) chickadees (2) bluebirds (2) parulas (2) jays (2)
			//
			// THREE OF THOSE HOLD A SPECIES THAT DOES NOT BELONG THERE BY
			// TAXONOMY, and each is deliberate, on the batch-8 racerunner rule
			// (confusion, not taxonomy): the GOLDFINCH sits with three warblers
			// in `winterlittle` because its Florida plumage is olive-tan and that
			// is exactly the bird a guest is trying to name; the CHIMNEY SWIFT
			// sits with the swallows because "what is that flying over the water"
			// is the question; the HOUSE SPARROW sits with two native sparrows
			// because a guest does not know it is not one.
			//
			// TWO CROSS-LINKS CLOSED FROM THE OTHER END. The blue jay's hawk
			// mimicry was asserted by the red-shouldered hawk in batch 11 and is
			// now stated by the jay itself; and `jays` finally gives the Florida
			// scrub-jay the comparison its own mark line has named since batch 11.
			// The northern parula nests INSIDE Spanish moss, which has been in
			// this guide as a plant since 1.19.0 — the bird now says so.
			'prothonotary'     => [
				'emoji' => '🐦',
				'name'  => __( 'Prothonotary Warbler', 'dcc-wildlife' ),
				'sci'   => 'Protonotaria citrea',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'A blazing golden bird in a dark swamp, and the only warbler in the east that nests in a HOLE — an old woodpecker cavity or a hollow stump standing in water, which is exactly why a place like this one suits it. The name comes from the yellow robes of papal clerks.', 'dcc-wildlife' ),
				'sound' => __( 'A loud, ringing sweet-sweet-sweet-sweet on one pitch, carrying right across the water.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer, low over shaded water', 'dcc-wildlife' ),
				'where' => __( 'shaded backwaters and cypress edges, low down over standing water', 'dcc-wildlife' ),
				'mark'  => __( 'solid GOLDEN head and breast against blue-grey wings, with no wing bars', 'dcc-wildlife' ),
			],
			'parula'           => [
				'emoji' => '🐦',
				'name'  => __( 'Northern Parula', 'dcc-wildlife' ),
				'sci'   => 'Setophaga americana',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'parulas',
				'odds'  => 'likely',
				'fact'  => __( 'A tiny blue-grey warbler with a yellow throat, and in Florida it builds its nest INSIDE a hanging clump of Spanish moss — which is why the mossy oaks along this canal suit it so well. The male wears a smudged rusty band across the yellow. It sings from high in the canopy.', 'dcc-wildlife' ),
				'sound' => __( 'A buzzy trill that climbs the scale and trips over its own end — zeeeeee-up.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer, high in mossy oaks', 'dcc-wildlife' ),
				'where' => __( 'high in live oaks and cypress hung with Spanish moss', 'dcc-wildlife' ),
				'mark'  => __( 'blue-grey above with a YELLOW THROAT and a dark chest band, and two white wing bars', 'dcc-wildlife' ),
			],
			'palmwarbler'      => [
				'emoji' => '🐦',
				'name'  => __( 'Palm Warbler', 'dcc-wildlife' ),
				'sci'   => 'Setophaga palmarum',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'winterlittle',
				'odds'  => 'certain',
				'fact'  => __( 'The commonest winter warbler here, and it identifies itself by a habit rather than a colour: it wags its tail up and down constantly, on every lawn and path edge from October to April. Drab olive-brown with a yellow undertail, and it feeds on the ground far more than a warbler ought to.', 'dcc-wildlife' ),
				'best'  => __( 'winter, on open ground', 'dcc-wildlife' ),
				'where' => __( 'lawns, path edges and low scrub — usually on the ground, not up in trees', 'dcc-wildlife' ),
				'mark'  => __( 'the constant TAIL-WAGGING, and a yellow undertail on an otherwise drab brown bird', 'dcc-wildlife' ),
			],
			'yellowrumped'     => [
				'emoji' => '🐦',
				'name'  => __( 'Yellow-rumped Warbler', 'dcc-wildlife' ),
				'sci'   => 'Setophaga coronata',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'winterlittle',
				'odds'  => 'certain',
				'fact'  => __( 'Birders call it the butter-butt, and that yellow rump patch really is the whole identification. It can digest the wax in bayberry and wax myrtle fruit, which almost no other warbler manages, and that one trick is why it winters this far north in flocks while the rest have gone to the tropics.', 'dcc-wildlife' ),
				'sound' => __( 'A sharp, flat CHEK repeated from inside a flock — you hear it long before you pick out a bird.', 'dcc-wildlife' ),
				'best'  => __( 'winter, in restless flocks', 'dcc-wildlife' ),
				'where' => __( 'wax myrtle, oak edges and open scrub, in loose flocks', 'dcc-wildlife' ),
				'mark'  => __( 'a bright YELLOW RUMP patch, with yellow side patches; drab grey-brown everywhere else in winter', 'dcc-wildlife' ),
			],
			'paintedbunting'   => [
				'emoji' => '🐦',
				'name'  => __( 'Painted Bunting', 'dcc-wildlife' ),
				'sci'   => 'Passerina ciris',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'occasional',
				'fact'  => __( 'The most improbably coloured bird in North America: a blue head, a green back and a red underside, all on one small finch-like body. The female is a plain soft green and nothing else here is that colour either. Numbers have fallen enough that people are careful about saying where they have seen one.', 'dcc-wildlife' ),
				'best'  => __( 'winter, at feeders and in low brush', 'dcc-wildlife' ),
				'where' => __( 'dense low brush and feeders, usually glimpsed briefly before it drops out of sight', 'dcc-wildlife' ),
				'mark'  => __( 'the male is unmistakable; the female is the only solid GREEN songbird here', 'dcc-wildlife' ),
			],
			'pileated'         => [
				'emoji' => '🐦',
				'name'  => __( 'Pileated Woodpecker', 'dcc-wildlife' ),
				'sci'   => 'Dryocopus pileatus',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'Crow-sized, with a flaming red crest, and the bird Woody Woodpecker was drawn from. It chisels RECTANGULAR holes — sometimes a foot long and deep into the heartwood — following the tunnels of carpenter ants. Once you know the shape of that hole you start finding them all along this canal.', 'dcc-wildlife' ),
				'sound' => __( 'A loud, ringing, uneven laugh that carries through the woods — wuk-wuk-wuk-wuk-wuk.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in big timber', 'dcc-wildlife' ),
				'where' => __( 'large cypress and oak, and dead standing timber along the water', 'dcc-wildlife' ),
				'mark'  => __( 'CROW-SIZED and black with a tall red crest — nothing else here is remotely as big', 'dcc-wildlife' ),
			],
			'redbellied'       => [
				'emoji' => '🐦',
				'name'  => __( 'Red-bellied Woodpecker', 'dcc-wildlife' ),
				'sci'   => 'Melanerpes carolinus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'redheads',
				'odds'  => 'certain',
				'fact'  => __( 'The commonest woodpecker here and the worst-named bird in Florida: the red belly is a faint wash almost nobody has ever seen in the field. What you actually see is a red cap running back over the nape, and a black-and-white ladder up the back. It calls all day long.', 'dcc-wildlife' ),
				'sound' => __( 'A rolling, throaty CHURR, and a softer cha-cha-cha — the background sound of an oak hammock.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on trunks and at feeders', 'dcc-wildlife' ),
				'where' => __( 'oak and cypress trunks, dead limbs and feeders', 'dcc-wildlife' ),
				'mark'  => __( 'a red CAP AND NAPE over a zebra-barred back — the red is the top of the head only, never the face', 'dcc-wildlife' ),
			],
			'downy'            => [
				'emoji' => '🐦',
				'name'  => __( 'Downy Woodpecker', 'dcc-wildlife' ),
				'sci'   => 'Dryobates pubescens',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'blackwhitepeckers',
				'odds'  => 'likely',
				'fact'  => __( 'The smallest woodpecker in North America, and it works the thin outer twigs a heavier bird cannot reach — down to the dry stems of weeds. Black and white, with a red patch on the back of the male’s head. Telling it from the hairy woodpecker comes down to one thing: the bill.', 'dcc-wildlife' ),
				'sound' => __( 'A descending whinny that falls away in pitch; the hairy woodpecker’s rattle stays level.', 'dcc-wildlife' ),
				'best'  => __( 'any month, out on thin branches', 'dcc-wildlife' ),
				'where' => __( 'outer twigs, small branches and weed stems, often travelling with chickadees', 'dcc-wildlife' ),
				'mark'  => __( 'a TINY bill, far shorter than the head is wide; the hairy’s is as long as its head', 'dcc-wildlife' ),
			],
			'flicker'          => [
				'emoji' => '🐦',
				'name'  => __( 'Northern Flicker', 'dcc-wildlife' ),
				'sci'   => 'Colaptes auratus',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'A woodpecker that feeds on the ground, which no other one here does: it eats more ants than any bird in North America and digs in the dirt to get them. Brown and barred, with a black bib, a spotted belly, and a flash of yellow under the wings when it goes up.', 'dcc-wildlife' ),
				'sound' => __( 'A loud ringing KEE-yer, and a long rolling wick-a-wick-a-wick-a in spring.', 'dcc-wildlife' ),
				'best'  => __( 'any month, as often on the ground as on a tree', 'dcc-wildlife' ),
				'where' => __( 'open ground and lawn edges, and dead snags', 'dcc-wildlife' ),
				'mark'  => __( 'a brown BARRED woodpecker on the GROUND, with a black chest crescent and a white rump in flight', 'dcc-wildlife' ),
			],
			'greatcrested'     => [
				'emoji' => '🐦',
				'name'  => __( 'Great Crested Flycatcher', 'dcc-wildlife' ),
				'sci'   => 'Myiarchus crinitus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'flycatchers',
				'odds'  => 'likely',
				'fact'  => __( 'A big flycatcher of the canopy — grey-breasted, lemon-bellied, rusty-tailed — and you will hear it long before you find it. It nests in a hole, and it habitually weaves a SHED SNAKESKIN into the lining; cavity nesters that do this lose fewer eggs to predators.', 'dcc-wildlife' ),
				'sound' => __( 'A loud, rising WHEEP! thrown down from the canopy, over and over.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer, high in the trees', 'dcc-wildlife' ),
				'where' => __( 'the canopy of oaks and cypress, on a high bare perch', 'dcc-wildlife' ),
				'mark'  => __( 'a grey throat and breast against a LEMON belly, with a rusty tail', 'dcc-wildlife' ),
			],
			'bluebird'         => [
				'emoji' => '🐦',
				'name'  => __( 'Eastern Bluebird', 'dcc-wildlife' ),
				'sci'   => 'Sialia sialis',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'bluebirds',
				'odds'  => 'likely',
				'fact'  => __( 'A deep blue back over a rusty breast, hunting by dropping onto insects from a low perch rather than chasing them down. It cannot excavate its own hole, so it depends on old woodpecker cavities and on nest boxes — which is the whole reason it recovered from a bad twentieth century.', 'dcc-wildlife' ),
				'sound' => __( 'A soft, musical chur-lee, chur-lee — easy to walk straight past.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on wires and posts over grass', 'dcc-wildlife' ),
				'where' => __( 'fence wires and low posts over mown grass and pasture', 'dcc-wildlife' ),
				'mark'  => __( 'DEEP BLUE above and rusty below with a white belly; an indigo bunting is blue all over', 'dcc-wildlife' ),
			],
			'shrike'           => [
				'emoji' => '🐦',
				'name'  => __( 'Loggerhead Shrike', 'dcc-wildlife' ),
				'sci'   => 'Lanius ludovicianus',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'A songbird that hunts like a hawk without a hawk’s feet. Its legs are too weak to hold prey down, so it IMPALES what it catches on a thorn or a barb of wire and feeds from there, leaving larger kills hanging in a larder. It has declined by about eighty per cent since the 1960s.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on wires over open ground', 'dcc-wildlife' ),
				'where' => __( 'roadside wires, fence posts and barbed wire over open country', 'dcc-wildlife' ),
				'mark'  => __( 'a black robber’s MASK and a hooked bill — a mockingbird has neither, and a thin straight bill', 'dcc-wildlife' ),
			],
			'mockingbird'      => [
				'emoji' => '🐦',
				'name'  => __( 'Northern Mockingbird', 'dcc-wildlife' ),
				'sci'   => 'Mimus polyglottos',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'mimics',
				'odds'  => 'certain',
				'fact'  => __( 'It sings other birds’ songs, repeating each phrase three or four times before moving on, and an unpaired male will keep it up all night under a streetlight. Grey, with big white wing patches that flash open in flight. It will take on a cat, a dog or a person near its nest, and usually wins.', 'dcc-wildlife' ),
				'sound' => __( 'Phrase after phrase, each repeated three or four times — other birds, car alarms, anything. Often after dark.', 'dcc-wildlife' ),
				'best'  => __( 'any month, from a high open perch', 'dcc-wildlife' ),
				'where' => __( 'rooftops, wires, hedge tops and anywhere with an open song perch', 'dcc-wildlife' ),
				'mark'  => __( 'plain grey with bold WHITE WING PATCHES flashing in flight, and a long tail', 'dcc-wildlife' ),
			],
			'cardinal'         => [
				'emoji' => '🐦',
				'name'  => __( 'Northern Cardinal', 'dcc-wildlife' ),
				'sci'   => 'Cardinalis cardinalis',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'redbirds',
				'odds'  => 'certain',
				'fact'  => __( 'Everyone knows the red male with the crest and the black face. Fewer know that the FEMALE SINGS — a full song as elaborate as his, which very few North American songbirds do, and she often sings from the nest. She is a warm buff-brown with red in the crest, wings and tail.', 'dcc-wildlife' ),
				'sound' => __( 'A loud clear slurred whistle — birdy-birdy-birdy, or what-cheer-cheer-cheer — plus a sharp metallic chip.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in dense cover', 'dcc-wildlife' ),
				'where' => __( 'hedges, thickets and shrubby edges, rarely far from cover', 'dcc-wildlife' ),
				'mark'  => __( 'a pointed CREST and a heavy triangular red bill; a summer tanager has neither', 'dcc-wildlife' ),
			],
			'bluejay'          => [
				'emoji' => '🐦',
				'name'  => __( 'Blue Jay', 'dcc-wildlife' ),
				'sci'   => 'Cyanocitta cristata',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'jays',
				'odds'  => 'certain',
				'fact'  => __( 'Loud, blue, crested — and a serious planter of oak trees. Jays carry acorns off and bury them one at a time, and the ones they never come back for become trees; fifty jays were once recorded caching 150,000 acorns in a month. They also imitate a red-shouldered hawk well enough to clear a feeder.', 'dcc-wildlife' ),
				'sound' => __( 'A harsh ringing JAY! JAY! — and a near-perfect red-shouldered hawk scream, which empties a feeder at once.', 'dcc-wildlife' ),
				'best'  => __( 'any month, and noisily', 'dcc-wildlife' ),
				'where' => __( 'oaks and wooded edges, gardens and feeders', 'dcc-wildlife' ),
				'mark'  => __( 'a blue CREST, a black necklace and white wing spots; a Florida scrub-jay has none of the three', 'dcc-wildlife' ),
			],
			'carolinawren'     => [
				'emoji' => '🐦',
				'name'  => __( 'Carolina Wren', 'dcc-wildlife' ),
				'sci'   => 'Thryothorus ludovicianus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'wrens',
				'odds'  => 'certain',
				'fact'  => __( 'A small rusty bird with a white eyebrow and a cocked tail, carrying a voice out of all proportion to it — one of the loudest songs per ounce of any bird here. Pairs hold one territory together all year, and it will nest in a boot, a mailbox or a hanging basket without hesitating.', 'dcc-wildlife' ),
				'sound' => __( 'A ringing TEAKETTLE-teakettle-teakettle, astonishingly loud for the size of the bird.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in low tangles', 'dcc-wildlife' ),
				'where' => __( 'brush piles, porches, low tangles and outbuildings', 'dcc-wildlife' ),
				'mark'  => __( 'a bold WHITE EYEBROW on a rusty bird holding its tail cocked up', 'dcc-wildlife' ),
			],
			'titmouse'         => [
				'emoji' => '🐦',
				'name'  => __( 'Tufted Titmouse', 'dcc-wildlife' ),
				'sci'   => 'Baeolophus bicolor',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'chickadees',
				'odds'  => 'likely',
				'fact'  => __( 'A small grey bird with a pointed crest, a black patch above the bill and a peach wash down the flanks. It travels in the mixed winter parties that drift through the oaks with chickadees and a kinglet or two, and it will pull hair from a living animal to line its nest.', 'dcc-wildlife' ),
				'sound' => __( 'A clear whistled PETER-peter-peter, repeated from the canopy.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in oak canopy', 'dcc-wildlife' ),
				'where' => __( 'oak and mixed canopy, usually in a small restless party', 'dcc-wildlife' ),
				'mark'  => __( 'a grey CREST and a black patch over the bill; a chickadee has a black cap and bib and no crest', 'dcc-wildlife' ),
			],
			'boattailedgrackle' => [
				'emoji' => '🐦',
				'name'  => __( 'Boat-tailed Grackle', 'dcc-wildlife' ),
				'sci'   => 'Quiscalus major',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'blackbirds',
				'odds'  => 'certain',
				'fact'  => __( 'The big glossy blackbird of Florida car parks and boat ramps, and the male’s tail is the mark: very long, and folded down the middle into a deep keel like the hull of a boat. He is iridescent blue-black and struts; she is a plain warm brown and much smaller, which catches people out every time.', 'dcc-wildlife' ),
				'sound' => __( 'An unmusical racket of jeers, rattles and rising whistles from the top of a post.', 'dcc-wildlife' ),
				'best'  => __( 'any month, near water and people', 'dcc-wildlife' ),
				'where' => __( 'boat ramps, car parks, lake edges and anywhere food gets dropped', 'dcc-wildlife' ),
				'mark'  => __( 'a very long tail folded into a deep V-shaped KEEL; a common grackle’s is shorter and flatter', 'dcc-wildlife' ),
			],
			'redwinged'        => [
				'emoji' => '🐦',
				'name'  => __( 'Red-winged Blackbird', 'dcc-wildlife' ),
				'sci'   => 'Agelaius phoeniceus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'blackbirds',
				'odds'  => 'certain',
				'fact'  => __( 'The male is jet black with a scarlet shoulder he can cover or flare at will — hidden while he feeds quietly, blazing when he sings from a cattail. The female is not black at all: heavily streaked dark brown, and people take her for an outsized sparrow every single time.', 'dcc-wildlife' ),
				'sound' => __( 'A harsh rising CONK-la-REE from the top of a cattail — the sound of a marsh in spring.', 'dcc-wildlife' ),
				'best'  => __( 'any month, over marsh', 'dcc-wildlife' ),
				'where' => __( 'cattails, marsh edges and wet pasture; flocks on open ground in winter', 'dcc-wildlife' ),
				'mark'  => __( 'a scarlet-and-yellow SHOULDER on the male; the female is streaky brown, not black at all', 'dcc-wildlife' ),
			],
			'hummingbird'      => [
				'emoji' => '🐦',
				'name'  => __( 'Ruby-throated Hummingbird', 'dcc-wildlife' ),
				'sci'   => 'Archilochus colubris',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'The only hummingbird that breeds in the eastern United States, and it crosses the Gulf of Mexico in a single non-stop flight, roughly doubling its body weight in fat before setting off. Only the MALE carries the ruby throat; the female’s is plain white, and she is the one you will usually be looking at.', 'dcc-wildlife' ),
				'sound' => __( 'A dry chittering, and the hum of the wings — which is how most people notice one at all.', 'dcc-wildlife' ),
				'best'  => __( 'spring through autumn, at red flowers', 'dcc-wildlife' ),
				'where' => __( 'coral bean, firebush, coral honeysuckle and any deep red tubular flower', 'dcc-wildlife' ),
				'mark'  => __( 'tiny and green-backed; the ruby throat is the MALE only — females and young show plain white', 'dcc-wildlife' ),
			],
			'purplemartin'     => [
				'emoji' => '🐦',
				'name'  => __( 'Purple Martin', 'dcc-wildlife' ),
				'sci'   => 'Progne subis',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'swallows',
				'odds'  => 'likely',
				'fact'  => __( 'The largest swallow in North America, and east of the Rockies it now nests almost entirely in housing people put up for it — a dependence that began with hollowed gourds hung out by Choctaw and Chickasaw people long before Europeans arrived. The male is glossy blue-black all over.', 'dcc-wildlife' ),
				'sound' => __( 'A rich liquid gurgling and chirruping from around the housing.', 'dcc-wildlife' ),
				'best'  => __( 'spring and early summer, around martin houses', 'dcc-wildlife' ),
				'where' => __( 'over open water and pasture, and around martin houses and gourd racks', 'dcc-wildlife' ),
				'mark'  => __( 'large for a swallow, and the male is dark ALL OVER — every other swallow here is pale below', 'dcc-wildlife' ),
			],
			'barnswallow'      => [
				'emoji' => '🐦',
				'name'  => __( 'Barn Swallow', 'dcc-wildlife' ),
				'sci'   => 'Hirundo rustica',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'swallows',
				'odds'  => 'likely',
				'fact'  => __( 'The swallow with the long forked tail streamers — steel-blue above, rusty below — hunting insects low and fast over water and grass. It builds a mud cup on a beam or under a bridge, and it has nested on human structures for so long that a natural site is now the unusual thing.', 'dcc-wildlife' ),
				'best'  => __( 'spring through autumn, low over water', 'dcc-wildlife' ),
				'where' => __( 'low and fast over the canal, lawns and pasture; nesting under docks and bridges', 'dcc-wildlife' ),
				'mark'  => __( 'a deeply FORKED tail with streamers, and a rusty throat; a tree swallow’s tail has only a shallow notch', 'dcc-wildlife' ),
			],
			'cedarwaxwing'     => [
				'emoji' => '🐦',
				'name'  => __( 'Cedar Waxwing', 'dcc-wildlife' ),
				'sci'   => 'Bombycilla cedrorum',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'A sleek fawn-grey bird with a crest, a black mask and a yellow-tipped tail, named for the red waxy droplets on its wing feathers. It lives on fruit, arrives in tight flocks that strip a tree and vanish, and it can get genuinely drunk on berries that have fermented on the branch.', 'dcc-wildlife' ),
				'sound' => __( 'A very high, thin, sibilant whistle from a whole flock at once — easy to miss, unmistakable once known.', 'dcc-wildlife' ),
				'best'  => __( 'winter and spring, in fruiting trees', 'dcc-wildlife' ),
				'where' => __( 'fruiting trees and shrubs — holly, palm, camphor — in tight flocks', 'dcc-wildlife' ),
				'mark'  => __( 'a pointed crest, a black mask and a YELLOW TIP to the tail, with red wax spots on the wing', 'dcc-wildlife' ),
			],
			'mourningdove'     => [
				'emoji' => '🐦',
				'name'  => __( 'Mourning Dove', 'dcc-wildlife' ),
				'sci'   => 'Zenaida macroura',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'doves',
				'odds'  => 'certain',
				'fact'  => __( 'The soft mournful cooing people hear at first light and take for an owl is this bird, not an owl. Slim and fawn-coloured with black spots on the wing and a long pointed tail — and when it leaves in a hurry the wings WHISTLE, a sharp fluttering whine that warns every dove nearby.', 'dcc-wildlife' ),
				'sound' => __( 'A slow, sad coo-OO-oo, oo, oo — mistaken for an owl more often than any other sound here.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on wires and open ground', 'dcc-wildlife' ),
				'where' => __( 'wires, gravel, lawns and feeders, often in pairs', 'dcc-wildlife' ),
				'mark'  => __( 'a long POINTED tail edged with white, and black spots across the wing', 'dcc-wildlife' ),
			],
			'grounddove'       => [
				'emoji' => '🐦',
				'name'  => __( 'Common Ground-Dove', 'dcc-wildlife' ),
				'sci'   => 'Columbina passerina',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'doves',
				'odds'  => 'likely',
				'fact'  => __( 'North America’s smallest dove, barely bigger than a sparrow, and it walks rather than perches — a small scaly-breasted bird shuffling along a sandy path, easy to step past entirely. When it finally flushes it shows a burst of rufous in the wings and drops down again a few yards on.', 'dcc-wildlife' ),
				'sound' => __( 'A soft, monotonous, rising woot… woot… woot, repeated for minutes on end.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on bare sandy ground', 'dcc-wildlife' ),
				'where' => __( 'sandy paths, road edges and open bare ground, on foot', 'dcc-wildlife' ),
				'mark'  => __( 'SPARROW-SIZED, with a scaly breast and rufous flashing in the wing when it flies', 'dcc-wildlife' ),
			],
			'chickadee'        => [
				'emoji' => '🐦',
				'name'  => __( 'Carolina Chickadee', 'dcc-wildlife' ),
				'sci'   => 'Poecile carolinensis',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'chickadees',
				'odds'  => 'likely',
				'fact'  => __( 'A tiny bird with a black cap and bib and clean white cheeks, and it leads the mixed foraging flocks that drift through the oaks in winter — titmice, a kinglet, a warbler or two, all following the chickadees. It caches seeds one at a time and remembers where it put them.', 'dcc-wildlife' ),
				'sound' => __( 'A fast husky CHICK-a-dee-dee-dee — the more dee notes, the more alarmed the bird.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in the canopy', 'dcc-wildlife' ),
				'where' => __( 'oak and mixed woodland canopy, in small restless flocks', 'dcc-wildlife' ),
				'mark'  => __( 'a black CAP AND BIB with clean white cheeks, and no crest at all', 'dcc-wildlife' ),
			],
			'treeswallow'      => [
				'emoji' => '🐦',
				'name'  => __( 'Tree Swallow', 'dcc-wildlife' ),
				'sci'   => 'Tachycineta bicolor',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'swallows',
				'odds'  => 'likely',
				'fact'  => __( 'Steel-blue-green above and clean white below, and in winter it gathers over Florida in numbers no other swallow here approaches — thousands wheeling over open water at dusk before pouring down into a marsh roost. It is the one swallow that can live on waxy bayberry fruit when the insects stop.', 'dcc-wildlife' ),
				'best'  => __( 'winter, wheeling over open water', 'dcc-wildlife' ),
				'where' => __( 'over the lakes and marsh in large swirling flocks, especially at dusk', 'dcc-wildlife' ),
				'mark'  => __( 'clean WHITE underparts with no rusty throat, and only a shallow notch in the tail', 'dcc-wildlife' ),
			],
			'collareddove'     => [
				'emoji' => '🐦',
				'name'  => __( 'Eurasian Collared-Dove', 'dcc-wildlife' ),
				'sci'   => 'Streptopelia decaocto',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'doves',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'It is on every wire in Florida now, and it arrived by accident: birds escaped from a pet shop in the Bahamas in the 1970s, crossed to the Keys under their own power, and their descendants have since reached the Pacific. Pale sandy-grey, bigger than a mourning dove, with a thin black half-collar.', 'dcc-wildlife' ),
				'sound' => __( 'A monotonous three-note koo-KOO-kook, over and over from a wire or a roof ridge.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on wires and roofs', 'dcc-wildlife' ),
				'where' => __( 'utility wires, roofs and car parks — almost always near buildings', 'dcc-wildlife' ),
				'mark'  => __( 'a thin black HALF-COLLAR on the hindneck, and a square-ended tail', 'dcc-wildlife' ),
			],
			// ---- BATCH 13 (1.33.0): songbirds, doves and woodpeckers, part 2 --
			// Thirty-two more, completing the songbird packs. The groups opened
			// in batch 12 are filled here; none of them grew past five.
			//
			// FOUR NON-NATIVES carry the `invasive` flag and no more: the
			// Eurasian collared-dove, the rock pigeon, the house sparrow and the
			// European starling. The HOUSE FINCH does NOT, although it reached
			// Florida from a 1940 cage-bird release, because it is native to this
			// continent and no authority here treats it as invasive — the kestrel
			// lesson from batch 11 applied to a flag rather than a status: a mark
			// that over-claims teaches a guest to ignore marks.
			//
			// The eastern towhee's eye colour is a FIELD MARK FOR RESIDENCY, not
			// just for identity: peninsular Florida's birds are pale-eyed, so a
			// red-eyed towhee here is a northern bird wintering. One source found
			// during the check put the pale-eyed form in the panhandle instead;
			// it is wrong, and the range accounts agree against it.
			'gnatcatcher'      => [
				'emoji' => '🐦',
				'name'  => __( 'Blue-gray Gnatcatcher', 'dcc-wildlife' ),
				'sci'   => 'Polioptila caerulea',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'littlegreys',
				'odds'  => 'likely',
				'fact'  => __( 'A scrap of a bird, blue-grey and endlessly busy, flicking a long white-edged tail from side to side as it works the outer leaves. Its nest is a tiny cup bound to a branch with SPIDER SILK and shingled over with lichen, so it reads as a knot on the limb rather than a nest.', 'dcc-wildlife' ),
				'sound' => __( 'A thin, wheezy, complaining spee… spee, given constantly as it moves.', 'dcc-wildlife' ),
				'best'  => __( 'any month, out in the leaves', 'dcc-wildlife' ),
				'where' => __( 'the outer twigs and leaves of oaks and cypress, never still', 'dcc-wildlife' ),
				'mark'  => __( 'blue-grey with a white EYE RING and a long black tail edged white', 'dcc-wildlife' ),
			],
			'whiteeyedvireo'   => [
				'emoji' => '🐦',
				'name'  => __( 'White-eyed Vireo', 'dcc-wildlife' ),
				'sci'   => 'Vireo griseus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'littlegreys',
				'odds'  => 'likely',
				'fact'  => __( 'You will hear this one far more often than you see it: it stays down inside dense tangles and throws out a short, explosive, faintly bad-tempered song. Olive-green with two white wing bars and bright YELLOW SPECTACLES round a pale eye — and the eye that names it takes a good look to see.', 'dcc-wildlife' ),
				'sound' => __( 'An abrupt, explosive jumble that opens and closes with a sharp chick — chick-per-weeoo-chick.', 'dcc-wildlife' ),
				'best'  => __( 'any month, inside dense tangles', 'dcc-wildlife' ),
				'where' => __( 'dense low thickets, vine tangles and scrubby edges', 'dcc-wildlife' ),
				'mark'  => __( 'yellow SPECTACLES round a pale white eye, over two white wing bars', 'dcc-wildlife' ),
			],
			'redeyedvireo'     => [
				'emoji' => '🐦',
				'name'  => __( 'Red-eyed Vireo', 'dcc-wildlife' ),
				'sci'   => 'Vireo olivaceus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'littlegreys',
				'odds'  => 'occasional',
				'fact'  => __( 'The bird that sings all day when everything else has given up — short burred phrases with a pause between each, as though asking a question and then answering it, on through the heat of the afternoon. Olive above, white below, with a grey cap and a bold white eyebrow under a dark line.', 'dcc-wildlife' ),
				'sound' => __( 'Short burred phrases with a pause between each, repeated all day — up, then down, question and answer.', 'dcc-wildlife' ),
				'best'  => __( 'spring and autumn, high in the canopy', 'dcc-wildlife' ),
				'where' => __( 'high in the leaves of oaks and hardwoods, moving deliberately', 'dcc-wildlife' ),
				'mark'  => __( 'a GREY CAP with a white eyebrow under a black line, and no wing bars', 'dcc-wildlife' ),
			],
			'phoebe'           => [
				'emoji' => '🐦',
				'name'  => __( 'Eastern Phoebe', 'dcc-wildlife' ),
				'sci'   => 'Sayornis phoebe',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'flycatchers',
				'odds'  => 'likely',
				'fact'  => __( 'A plain grey-brown flycatcher that sits on a low perch and pumps its tail down and up, over and over — that movement names it before any plumage does. It was also the first bird ever marked by a person: Audubon tied silver thread to one’s leg in 1804 to see whether it would return. It did.', 'dcc-wildlife' ),
				'sound' => __( 'A rasping two-note FEE-bee. It says its own name, and not musically.', 'dcc-wildlife' ),
				'best'  => __( 'winter, on low perches near water', 'dcc-wildlife' ),
				'where' => __( 'low twigs, fence wire and dock rails over water, sallying out and back', 'dcc-wildlife' ),
				'mark'  => __( 'the constant TAIL-PUMPING, a dark head, and no wing bars or eye ring', 'dcc-wildlife' ),
			],
			'housewren'        => [
				'emoji' => '🐦',
				'name'  => __( 'House Wren', 'dcc-wildlife' ),
				'sci'   => 'Troglodytes aedon',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'wrens',
				'odds'  => 'likely',
				'fact'  => __( 'Small, brown, plain and furious. It winters here in low tangles, usually alone, scolding anything that comes near from somewhere inside a brush pile. Nowhere near as loud as a Carolina wren and a good deal plainer — barely an eyebrow to speak of — though it cocks its tail in exactly the same way.', 'dcc-wildlife' ),
				'sound' => __( 'A dry scolding chatter and a hard churr from deep inside a brush pile.', 'dcc-wildlife' ),
				'best'  => __( 'winter, in brush piles', 'dcc-wildlife' ),
				'where' => __( 'brush piles, hedge bottoms and dense low tangles', 'dcc-wildlife' ),
				'mark'  => __( 'plain brown with only a FAINT pale eyebrow; a Carolina wren’s is bold white and the bird is rustier', 'dcc-wildlife' ),
			],
			'catbird'          => [
				'emoji' => '🐦',
				'name'  => __( 'Gray Catbird', 'dcc-wildlife' ),
				'sci'   => 'Dumetella carolinensis',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'mimics',
				'odds'  => 'likely',
				'fact'  => __( 'Slate grey all over with a black cap and a chestnut patch under the tail that nobody ever sees. It does mew — a flat, complaining cat’s mew from somewhere inside a thicket, which is how most people meet it. It mimics like its relatives, but strings the phrases together without repeating them.', 'dcc-wildlife' ),
				'sound' => __( 'A flat nasal MEW, exactly like a cat, from inside dense cover.', 'dcc-wildlife' ),
				'best'  => __( 'winter, in thickets', 'dcc-wildlife' ),
				'where' => __( 'dense thickets, hedges and berry tangles, usually out of sight', 'dcc-wildlife' ),
				'mark'  => __( 'uniform SLATE GREY under a neat black cap; a mockingbird is paler with white wing patches', 'dcc-wildlife' ),
			],
			'brownthrasher'    => [
				'emoji' => '🐦',
				'name'  => __( 'Brown Thrasher', 'dcc-wildlife' ),
				'sci'   => 'Toxostoma rufum',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'mimics',
				'odds'  => 'likely',
				'fact'  => __( 'Rusty above and heavily streaked below, with a long tail and a hard yellow eye, and it thrashes through leaf litter with its bill — which is the name. It has one of the largest song repertoires of any North American bird, well over a thousand song types, delivered in phrases sung twice each.', 'dcc-wildlife' ),
				'sound' => __( 'Rich musical phrases, each sung TWICE — a mockingbird repeats three or four times, a catbird not at all.', 'dcc-wildlife' ),
				'best'  => __( 'any month, low in cover', 'dcc-wildlife' ),
				'where' => __( 'leaf litter under dense shrubs, and a high bare twig when it sings', 'dcc-wildlife' ),
				'mark'  => __( 'RUSTY above with bold dark streaks below, and a yellow eye', 'dcc-wildlife' ),
			],
			'robin'            => [
				'emoji' => '🐦',
				'name'  => __( 'American Robin', 'dcc-wildlife' ),
				'sci'   => 'Turdus migratorius',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'In Florida this is a winter bird and a flocking one — not the solitary lawn robin of northern gardens but a horde that drops into a fruiting tree, strips it and moves on. Grey-backed with a brick-red breast and a broken white eye ring. They can arrive in hundreds and be gone the same day.', 'dcc-wildlife' ),
				'sound' => __( 'A caroling cheerily, cheer-up, cheerio, and a hard tut-tut-tut when alarmed.', 'dcc-wildlife' ),
				'best'  => __( 'winter, in flocks on lawns and fruiting trees', 'dcc-wildlife' ),
				'where' => __( 'open lawns, pasture and fruiting trees, usually in numbers', 'dcc-wildlife' ),
				'mark'  => __( 'a brick-RED breast on a grey-backed bird, with a broken white eye ring', 'dcc-wildlife' ),
			],
			'towhee'           => [
				'emoji' => '🐦',
				'name'  => __( 'Eastern Towhee', 'dcc-wildlife' ),
				'sci'   => 'Pipilo erythrophthalmus',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'A big long-tailed bird that feeds by kicking backwards with both feet at once in the leaf litter, making a noise out of all proportion to itself. Black hood, rusty flanks, white belly. Florida’s resident birds have a PALE eye; a red-eyed towhee here is a northerner down for the winter.', 'dcc-wildlife' ),
				'sound' => __( 'A ringing DRINK-your-TEEEEA, the last note a trill, and a sharp rising chewink.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in scrub and leaf litter', 'dcc-wildlife' ),
				'where' => __( 'dense scrub, palmetto edges and the leaf litter underneath', 'dcc-wildlife' ),
				'mark'  => __( 'a black hood over rusty flanks; a PALE eye means a Florida resident, a red eye a winter visitor', 'dcc-wildlife' ),
			],
			'commongrackle'    => [
				'emoji' => '🐦',
				'name'  => __( 'Common Grackle', 'dcc-wildlife' ),
				'sci'   => 'Quiscalus quiscula',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'blackbirds',
				'odds'  => 'likely',
				'fact'  => __( 'Smaller and slimmer than the boat-tailed grackle, with a bronze-and-purple gloss and a hard pale yellow eye. It walks across open grass with the stiff-shouldered look of a bird in a bad mood, and it sings — if that is the word for it — like a rusty gate being forced open.', 'dcc-wildlife' ),
				'sound' => __( 'A short, harsh, ascending squeak like a rusty hinge, finishing in a metallic shriek.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on open grass', 'dcc-wildlife' ),
				'where' => __( 'lawns, pasture and car parks, walking in loose flocks', 'dcc-wildlife' ),
				'mark'  => __( 'a bronze-glossed body and a shorter, flatter tail; a boat-tailed grackle is bigger with a deep keeled tail', 'dcc-wildlife' ),
			],
			'cowbird'          => [
				'emoji' => '🐦',
				'name'  => __( 'Brown-headed Cowbird', 'dcc-wildlife' ),
				'sci'   => 'Molothrus ater',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'blackbirds',
				'odds'  => 'likely',
				'fact'  => __( 'It builds no nest at all. The female lays her eggs in other birds’ nests — over two hundred species have been recorded raising one — and the hosts do the work while their own young go short. A glossy black bird with a dull brown head, following cattle for the insects they put up.', 'dcc-wildlife' ),
				'sound' => __( 'A liquid bubbling glug-glug-GLEEE, oddly sweet for the bird making it.', 'dcc-wildlife' ),
				'best'  => __( 'any month, with livestock and at feeders', 'dcc-wildlife' ),
				'where' => __( 'pasture with cattle, open lawns and feeders', 'dcc-wildlife' ),
				'mark'  => __( 'a dull BROWN HEAD on a glossy black body, with a short conical finch-like bill', 'dcc-wildlife' ),
			],
			'goldfinch'        => [
				'emoji' => '🐦',
				'name'  => __( 'American Goldfinch', 'dcc-wildlife' ),
				'sci'   => 'Spinus tristis',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'winterlittle',
				'odds'  => 'occasional',
				'fact'  => __( 'Nobody here sees the canary-yellow bird. It moults its body feathers twice a year, and the plumage it wears in Florida is the drab one — olive-tan with black wings and pale bars. It is a strict vegetarian too: a cowbird chick laid in a goldfinch nest starves on the all-seed diet.', 'dcc-wildlife' ),
				'sound' => __( 'A bouncing po-ta-to-CHIP, given in time with the dips of its undulating flight.', 'dcc-wildlife' ),
				'best'  => __( 'winter, at feeders and in flocks', 'dcc-wildlife' ),
				'where' => __( 'feeders, weedy edges and sweetgum trees, in small twittering flocks', 'dcc-wildlife' ),
				'mark'  => __( 'a stubby CONICAL bill and a notched tail; olive-tan here, not yellow', 'dcc-wildlife' ),
			],
			'pinewarbler'      => [
				'emoji' => '🐦',
				'name'  => __( 'Pine Warbler', 'dcc-wildlife' ),
				'sci'   => 'Setophaga pinus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'winterlittle',
				'odds'  => 'likely',
				'fact'  => __( 'The one warbler that will come to a feeder: it eats seeds regularly, which almost no other warbler does, and that is what brings it in among the cardinals during a cold snap. Yellow-breasted with white wing bars, and it lives in pines all year — for once the name is honest.', 'dcc-wildlife' ),
				'sound' => __( 'A soft musical trill on one pitch — slower and sweeter than a chipping sparrow’s dry rattle.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in pines', 'dcc-wildlife' ),
				'where' => __( 'pine canopy and trunks, and feeders in cold weather', 'dcc-wildlife' ),
				'mark'  => __( 'an unstreaked yellow breast with TWO white wing bars over a plain olive back', 'dcc-wildlife' ),
			],
			'yellowthroat'     => [
				'emoji' => '🐦',
				'name'  => __( 'Common Yellowthroat', 'dcc-wildlife' ),
				'sci'   => 'Geothlypis trichas',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'A small skulking warbler of wet edges, and the male wears a broad black BANDIT MASK across a brilliant yellow throat — nothing else here looks remotely like it. He sings from a reed stem and then drops out of sight. The female has the yellow throat and no mask, which is harder work.', 'dcc-wildlife' ),
				'sound' => __( 'A rolling WITCHETY-witchety-witchety from somewhere inside the reeds.', 'dcc-wildlife' ),
				'best'  => __( 'any month, along marsh edges', 'dcc-wildlife' ),
				'where' => __( 'cattails, pickerelweed and dense wet edges, always low down', 'dcc-wildlife' ),
				'mark'  => __( 'a broad black MASK over a yellow throat on the male; the female is plain with a yellow throat', 'dcc-wildlife' ),
			],
			'blackandwhite'    => [
				'emoji' => '🐦',
				'name'  => __( 'Black-and-white Warbler', 'dcc-wildlife' ),
				'sci'   => 'Mniotilta varia',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'Striped black and white from bill to tail, and it behaves like nothing else in its family: it creeps up and around trunks and heavy limbs, head-first and head-down, working the bark crevices the way a nuthatch does. Every other warbler here stays out among the leaves.', 'dcc-wildlife' ),
				'sound' => __( 'A thin, high, two-note weesee-weesee-weesee, like a small wheel that wants oiling.', 'dcc-wildlife' ),
				'best'  => __( 'autumn through spring, on trunks', 'dcc-wildlife' ),
				'where' => __( 'tree trunks and heavy limbs, creeping — not out in the foliage', 'dcc-wildlife' ),
				'mark'  => __( 'black-and-white STRIPES including a striped crown, and a trunk-creeping habit no other warbler has', 'dcc-wildlife' ),
			],
			'yellowthroated'   => [
				'emoji' => '🐦',
				'name'  => __( 'Yellow-throated Warbler', 'dcc-wildlife' ),
				'sci'   => 'Setophaga dominica',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'parulas',
				'odds'  => 'likely',
				'fact'  => __( 'A crisp black-and-white face with a brilliant yellow throat dropped into the middle of it. It works high in the cypress and the pines, often creeping along a limb rather than flitting between them, and it is here all year — which for a warbler is unusual. It likes Spanish moss.', 'dcc-wildlife' ),
				'sound' => __( 'A series of clear whistled notes running down the scale and lifting again at the very end.', 'dcc-wildlife' ),
				'best'  => __( 'any month, high in cypress and pine', 'dcc-wildlife' ),
				'where' => __( 'high in cypress, pine and mossy limbs, creeping along branches', 'dcc-wildlife' ),
				'mark'  => __( 'a bright YELLOW THROAT set in a black-and-white face, with a white neck patch', 'dcc-wildlife' ),
			],
			'chippingsparrow'  => [
				'emoji' => '🐦',
				'name'  => __( 'Chipping Sparrow', 'dcc-wildlife' ),
				'sci'   => 'Spizella passerina',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'sparrows',
				'odds'  => 'likely',
				'fact'  => __( 'A small clean sparrow with a bright rusty cap, a white eyebrow and a black line through the eye, feeding on the ground in loose winter flocks. It famously lined its nest with horsehair back when horses were everywhere; now it makes do with whatever fine fibre it can find.', 'dcc-wildlife' ),
				'sound' => __( 'A long dry mechanical trill on one pitch, like a sewing machine running.', 'dcc-wildlife' ),
				'best'  => __( 'winter, on open ground', 'dcc-wildlife' ),
				'where' => __( 'short grass, path edges and under feeders, in loose flocks', 'dcc-wildlife' ),
				'mark'  => __( 'a clean RUSTY CAP with a white eyebrow and a black eye-line, over an unstreaked grey breast', 'dcc-wildlife' ),
			],
			'savannahsparrow'  => [
				'emoji' => '🐦',
				'name'  => __( 'Savannah Sparrow', 'dcc-wildlife' ),
				'sci'   => 'Passerculus sandwichensis',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'sparrows',
				'odds'  => 'occasional',
				'fact'  => __( 'A streaky brown sparrow of open grass that runs mouse-like through the stems instead of flying, and flushes only at the last possible moment. The mark worth learning is a small YELLOW patch just in front of the eye — subtle, but nothing else out on that grass has one.', 'dcc-wildlife' ),
				'sound' => __( 'A thin, insect-like tsip-tsip-tseeee-tsaaay, easily lost in the wind.', 'dcc-wildlife' ),
				'best'  => __( 'winter, in rough grass', 'dcc-wildlife' ),
				'where' => __( 'rough open grass, weedy field edges and pasture', 'dcc-wildlife' ),
				'mark'  => __( 'a streaked breast and a YELLOW LORE in front of the eye, with pink legs', 'dcc-wildlife' ),
			],
			'meadowlark'       => [
				'emoji' => '🐦',
				'name'  => __( 'Eastern Meadowlark', 'dcc-wildlife' ),
				'sci'   => 'Sturnella magna',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'Not a lark at all — it is a blackbird, related to the grackles and the cowbird. From behind it is a streaky brown bird in the grass; the instant it turns it is a brilliant yellow breast with a black V laid across it. It sings from a fence post over open pasture.', 'dcc-wildlife' ),
				'sound' => __( 'Two or three clear slurred whistles sliding down the scale — pure, carrying, unhurried.', 'dcc-wildlife' ),
				'best'  => __( 'any month, over open pasture', 'dcc-wildlife' ),
				'where' => __( 'fence posts and wires over open pasture and rough grass', 'dcc-wildlife' ),
				'mark'  => __( 'a brilliant YELLOW breast crossed by a black V, and white outer tail feathers flashing in flight', 'dcc-wildlife' ),
			],
			'housefinch'       => [
				'emoji' => '🐦',
				'name'  => __( 'House Finch', 'dcc-wildlife' ),
				'sci'   => 'Haemorhous mexicanus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'redbirds',
				'odds'  => 'likely',
				'fact'  => __( 'Every house finch east of the Rockies descends from a few caged birds let go on Long Island in 1940 — sold illegally as "Hollywood finches" and released when the sellers risked prosecution. The male has a red head and breast over a brown, heavily streaked body, and the streaking is the mark.', 'dcc-wildlife' ),
				'sound' => __( 'A long rambling cheerful warble that finishes on a harsh rising buzz.', 'dcc-wildlife' ),
				'best'  => __( 'any month, around buildings and feeders', 'dcc-wildlife' ),
				'where' => __( 'feeders, gutters, eaves and shrubbery around houses', 'dcc-wildlife' ),
				'mark'  => __( 'red on the head and breast only, over a STREAKED brown body; a cardinal is all red, with a crest', 'dcc-wildlife' ),
			],
			'chimneyswift'     => [
				'emoji' => '🐦',
				'name'  => __( 'Chimney Swift', 'dcc-wildlife' ),
				'sci'   => 'Chaetura pelagica',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'swallows',
				'odds'  => 'likely',
				'fact'  => __( 'A cigar with wings, and it cannot perch at all — its feet only cling, so it spends the whole day airborne and the night clamped to a vertical wall inside a chimney or a hollow tree. It glues its nest to that wall with its own saliva. Numbers have fallen hard as chimneys were capped.', 'dcc-wildlife' ),
				'sound' => __( 'A hard, dry, mechanical chittering overhead — usually heard before the bird is found.', 'dcc-wildlife' ),
				'best'  => __( 'spring through autumn, high overhead', 'dcc-wildlife' ),
				'where' => __( 'high over rooftops and open water, never perched', 'dcc-wildlife' ),
				'mark'  => __( 'a stiff flickering CIGAR shape with no tail to speak of; swallows glide, and this bird does not', 'dcc-wildlife' ),
			],
			'kingbird'         => [
				'emoji' => '🐦',
				'name'  => __( 'Eastern Kingbird', 'dcc-wildlife' ),
				'sci'   => 'Tyrannus tyrannus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'flycatchers',
				'odds'  => 'occasional',
				'fact'  => __( 'Tyrannus tyrannus, and it earns the name twice over: a bird smaller than a robin that will fly straight up at a crow, a hawk or even an eagle crossing its territory, get above it, and hammer down on its back until it leaves. Black above, white below, with a clean white band across the tail tip.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer, on exposed perches', 'dcc-wildlife' ),
				'where' => __( 'wires, fence posts and bare outer twigs over open ground and water', 'dcc-wildlife' ),
				'mark'  => __( 'a crisp WHITE BAND across the tip of a black tail', 'dcc-wildlife' ),
			],
			'summertanager'    => [
				'emoji' => '🐦',
				'name'  => __( 'Summer Tanager', 'dcc-wildlife' ),
				'sci'   => 'Piranga rubra',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'redbirds',
				'odds'  => 'occasional',
				'fact'  => __( 'The only entirely red bird in North America, and unlike a cardinal it has no crest and a pale, heavy bill. It is a specialist on bees and wasps: it takes them in flight, beats them dead against a branch and wipes the sting out before swallowing. It will tear a wasp nest open for the grubs.', 'dcc-wildlife' ),
				'sound' => __( 'A dry chuckling pik-i-tuck-i-tuck, quite unlike its rich robin-like song.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer, high in the canopy', 'dcc-wildlife' ),
				'where' => __( 'the canopy of oaks and pines, often sitting still for long spells', 'dcc-wildlife' ),
				'mark'  => __( 'solid red with NO CREST and a pale stout bill; a cardinal has a crest and a black face', 'dcc-wildlife' ),
			],
			'indigobunting'    => [
				'emoji' => '🐦',
				'name'  => __( 'Indigo Bunting', 'dcc-wildlife' ),
				'sci'   => 'Passerina cyanea',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'bluebirds',
				'odds'  => 'occasional',
				'fact'  => __( 'There is no blue pigment anywhere in the bird. The colour comes from microscopic structure in the feathers bending the light, so in poor light the male simply looks black. It migrates at night, and young birds learn the pattern of the stars — proved by putting captive buntings under a planetarium sky.', 'dcc-wildlife' ),
				'sound' => __( 'Bright paired notes — sweet-sweet, chew-chew, seet-seet — each phrase given twice over.', 'dcc-wildlife' ),
				'best'  => __( 'spring and autumn, on weedy edges', 'dcc-wildlife' ),
				'where' => __( 'weedy field edges, brushy roadsides and thickets', 'dcc-wildlife' ),
				'mark'  => __( 'blue ALL OVER with no rusty breast; an eastern bluebird is blue above and rusty below', 'dcc-wildlife' ),
			],
			'kinglet'          => [
				'emoji' => '🐦',
				'name'  => __( 'Ruby-crowned Kinglet', 'dcc-wildlife' ),
				'sci'   => 'Corthylio calendula',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'littlegreys',
				'odds'  => 'likely',
				'fact'  => __( 'A tiny olive bird that never stops moving and flicks its wings constantly, which names it from across a clearing. The ruby crown of the name belongs to the male and is normally hidden under grey feathers — it goes up only when he is excited or cross, and most people never see it at all.', 'dcc-wildlife' ),
				'sound' => __( 'A song astonishingly loud for the size — high notes running down into a rich tumbling warble.', 'dcc-wildlife' ),
				'best'  => __( 'winter, in restless flocks', 'dcc-wildlife' ),
				'where' => __( 'oak and mixed canopy and low scrub, flicking its wings, never still', 'dcc-wildlife' ),
				'mark'  => __( 'a broken white EYE RING and constant WING-FLICKING; the red crown is usually hidden', 'dcc-wildlife' ),
			],
			'redheaded'        => [
				'emoji' => '🐦',
				'name'  => __( 'Red-headed Woodpecker', 'dcc-wildlife' ),
				'sci'   => 'Melanerpes erythrocephalus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'redheads',
				'odds'  => 'occasional',
				'fact'  => __( 'The one that really does have a red head — the whole head and neck, a solid crimson hood over a white body and black wings with big white patches. It stores food in bark crevices for the winter, and it is the only woodpecker known to COVER its caches so that nothing else finds them.', 'dcc-wildlife' ),
				'sound' => __( 'A harsh rolling TCHUR, lower and rougher than the red-bellied woodpecker’s churr.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in open pine and dead timber', 'dcc-wildlife' ),
				'where' => __( 'open pine, dead standing timber and burnt edges; not a dense-canopy bird', 'dcc-wildlife' ),
				'mark'  => __( 'the ENTIRE head crimson, over a clean white belly and big white wing patches', 'dcc-wildlife' ),
			],
			'sapsucker'        => [
				'emoji' => '🐦',
				'name'  => __( 'Yellow-bellied Sapsucker', 'dcc-wildlife' ),
				'sci'   => 'Sphyrapicus varius',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'blackwhitepeckers',
				'odds'  => 'likely',
				'fact'  => __( 'It drills neat rows of shallow holes round a trunk and comes back to drink the sap that wells up, and the insects caught in it. Those wells feed other animals too — other birds, squirrels and insects work the same rows. Look for the tidy horizontal lines of holes long after the bird has moved on.', 'dcc-wildlife' ),
				'sound' => __( 'A slow, irregular, stuttering drum — never the steady rattle of the other woodpeckers — and a cat-like mew.', 'dcc-wildlife' ),
				'best'  => __( 'winter, on trunks', 'dcc-wildlife' ),
				'where' => __( 'trunks of hardwoods and pines, and the rows of holes it leaves behind', 'dcc-wildlife' ),
				'mark'  => __( 'a long WHITE WING STRIPE down the folded wing, and a red forehead', 'dcc-wildlife' ),
			],
			'hairy'            => [
				'emoji' => '🐦',
				'name'  => __( 'Hairy Woodpecker', 'dcc-wildlife' ),
				'sci'   => 'Dryobates villosus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'blackwhitepeckers',
				'odds'  => 'occasional',
				'fact'  => __( 'The downy woodpecker’s bigger double, and separating them is almost entirely a matter of proportion: this one’s bill is as long as its head is wide, where the downy’s is a stub. It is also markedly scarcer here, works heavier trunks and limbs, and is far shyer of a feeder.', 'dcc-wildlife' ),
				'sound' => __( 'A sharp emphatic PEEK, and a rattle that holds its pitch — a downy’s whinny falls away.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on heavy trunks', 'dcc-wildlife' ),
				'where' => __( 'trunks and big limbs in mature woodland, less often at feeders', 'dcc-wildlife' ),
				'mark'  => __( 'a bill as LONG as the head is wide, and clean white outer tail feathers without spots', 'dcc-wildlife' ),
			],
			'whitewingeddove'  => [
				'emoji' => '🐦',
				'name'  => __( 'White-winged Dove', 'dcc-wildlife' ),
				'sci'   => 'Zenaida asiatica',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'doves',
				'odds'  => 'occasional',
				'fact'  => __( 'A stocky grey dove with a hard-edged white stripe along the closed wing that opens into a broad white flash in flight. It has spread east across Florida over the last few decades. Its song is a four-note cooing phrase that sounds uncannily like a barred owl asking who cooks for you.', 'dcc-wildlife' ),
				'sound' => __( 'A hooting who-cooks-for-YOU — genuinely owl-like, and the reason people report owls in broad daylight.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on wires and at feeders', 'dcc-wildlife' ),
				'where' => __( 'wires, feeders and suburban trees, often alongside mourning doves', 'dcc-wildlife' ),
				'mark'  => __( 'a hard-edged WHITE STRIPE along the folded wing, a square tail and a blue eye-ring', 'dcc-wildlife' ),
			],
			'rockpigeon'       => [
				'emoji' => '🐦',
				'name'  => __( 'Rock Pigeon', 'dcc-wildlife' ),
				'sci'   => 'Columba livia',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'doves',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'The city pigeon, descended from a Mediterranean cliff bird and brought over by settlers — which is why it nests perfectly happily on a bridge girder or a warehouse ledge, since those are cliffs as far as it is concerned. Centuries of domestication left the flock every colour from white to near-black.', 'dcc-wildlife' ),
				'best'  => __( 'any month, around structures', 'dcc-wildlife' ),
				'where' => __( 'bridges, buildings, car parks and boat ramps — rarely far from a structure', 'dcc-wildlife' ),
				'mark'  => __( 'chunky, with a white rump and usually two dark WING BARS; plumage otherwise varies wildly', 'dcc-wildlife' ),
			],
			'housesparrow'     => [
				'emoji' => '🐦',
				'name'  => __( 'House Sparrow', 'dcc-wildlife' ),
				'sci'   => 'Passer domesticus',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'sparrows',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'Not a sparrow in the American sense at all — it belongs to an Old World family and is no relation to the native sparrows it feeds beside. Brought over deliberately in the 1850s, it now lives wherever people do, and it will evict a bluebird or a martin from its nest box.', 'dcc-wildlife' ),
				'sound' => __( 'A monotonous, cheerful CHEEP… CHEEP… CHEEP from a gutter or a hedge, all day long.', 'dcc-wildlife' ),
				'best'  => __( 'any month, around buildings', 'dcc-wildlife' ),
				'where' => __( 'supermarket lots, gutters, eaves and hedges beside buildings', 'dcc-wildlife' ),
				'mark'  => __( 'the male has a black BIB and a grey crown; no native sparrow here has either', 'dcc-wildlife' ),
			],
			'starling'         => [
				'emoji' => '🐦',
				'name'  => __( 'European Starling', 'dcc-wildlife' ),
				'sci'   => 'Sturnus vulgaris',
				'group' => 'birds',
				'browse' => 'birds',
				'idgroup' => 'blackbirds',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'Every starling in North America descends from about eighty birds released in Central Park in 1890. In winter it is spangled all over with pale spots and carries a dark bill; by spring the spots have worn away and the bill has turned yellow. It mimics — other birds, car alarms, a ringing phone.', 'dcc-wildlife' ),
				'sound' => __( 'A jumble of whistles, clicks and rattles with other species’ calls and mechanical noises mixed through it.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on lawns and wires', 'dcc-wildlife' ),
				'where' => __( 'lawns, wires, car parks and roofs, walking rather than hopping', 'dcc-wildlife' ),
				'mark'  => __( 'SPANGLED with pale spots in winter, a short square tail, and a pointed bill that yellows in spring', 'dcc-wildlife' ),
			],
			// ---- BATCHES 20-23 (1.33.0): the plants ---------------------------
			// Sixty-eight, in four packs: 24 trees, 25 wildflowers and shrubs,
			// 19 water plants. NO plant carries a `sound` line and none ever
			// should -- that is the 1.14.0 rule holding, not an omission.
			//
			// ROB'S EPIPHYTE RULE (CLAUDE.md section 11) DECIDES TWO OF THESE.
			// BALL MOSS goes under TREES, beside Spanish moss and the
			// resurrection fern, because a guest meets it looking UP AT AN OAK.
			// REINDEER LICHEN does not: it grows on bare sand, so it sits under
			// Wildflowers & shrubs. The chip is a place to look, not a rank.
			//
			// TWO PLANTS ARE FLAGGED `danger`, and both are CONTACT injuries,
			// which is the bar the three existing hazard plants already set
			// (poison ivy, tread-softly, Brazilian pepper -- all contact, none
			// merely toxic-if-eaten). SAWGRASS cuts bare skin and a guest wades
			// where it grows; PRICKLY PEAR sheds glochids that work into skin
			// and itch for weeks. Both carry a `safe` line, so the contract in
			// test-narration.php covers them.
			//
			// DELIBERATELY NOT FLAGGED, though all three are poisonous to EAT:
			// coontie, coral bean and lantana. Their entries say so in the text.
			// Widening `danger` to "toxic if swallowed" would move a dozen
			// ordinary plants into Safety and teach guests to skim it.
			//
			// FOUR SCIENTIFIC NAMES WERE DECIDED FROM EVIDENCE rather than taken
			// from the pack (workings in WATER-SOURCES.md). Three follow the
			// Atlas of Florida Plants against iNaturalist's newer taxonomy --
			// red bay Persea borbonia, camphor Cinnamomum camphora, sawgrass
			// Cladium jamaicense. THE FOURTH GOES THE OTHER WAY: the prickly
			// pear is Opuntia austrina, because there the master list's
			// O. humifusa is the outdated name and iNaturalist is right. Do not
			// apply a blanket rule to this -- it would have been wrong once in
			// four, whichever way it was pointed.
			'liveoak'          => [
				'emoji' => '🌿',
				'name'  => __( 'Live Oak', 'dcc-wildlife' ),
				'sci'   => 'Quercus virginiana',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'oaks',
				'odds'  => 'certain',
				'fact'  => __( 'The tree that makes this canal look the way it does: a short massive trunk throwing limbs sideways as far as it throws them up, hung with Spanish moss. The wood is so dense and interlocked that the US Navy framed its first frigates from it — cannon balls bounced off the Constitution.', 'dcc-wildlife' ),
				'best'  => __( 'any month; evergreen, and it drops old leaves in spring', 'dcc-wildlife' ),
				'where' => __( 'along the bank and through the hammock, spreading wider than it is tall', 'dcc-wildlife' ),
				'mark'  => __( 'huge horizontal limbs and small leathery UNLOBED leaves, dark above and pale beneath', 'dcc-wildlife' ),
			],
			'laureloak'        => [
				'emoji' => '🌿',
				'name'  => __( 'Laurel Oak', 'dcc-wildlife' ),
				'sci'   => 'Quercus laurifolia',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'oaks',
				'odds'  => 'likely',
				'fact'  => __( 'The fast oak, and the short-lived one: it shoots up in a few decades, hollows out from the heart, and comes down in a storm around eighty years old. That is why so many are standing dead or half-gone. Straighter and far less spreading than a live oak, with willow-shaped leaves.', 'dcc-wildlife' ),
				'best'  => __( 'any month; nearly evergreen, dropping leaves late winter', 'dcc-wildlife' ),
				'where' => __( 'wet hammock edges and low ground near the canal', 'dcc-wildlife' ),
				'mark'  => __( 'narrow, smooth-edged leaves widest near the MIDDLE, on a tall straight trunk', 'dcc-wildlife' ),
			],
			'wateroak'         => [
				'emoji' => '🌿',
				'name'  => __( 'Water Oak', 'dcc-wildlife' ),
				'sci'   => 'Quercus nigra',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'oaks',
				'odds'  => 'likely',
				'fact'  => __( 'Look for a leaf shaped like a tiny spatula — narrow at the stem and flaring into three shallow lobes at the tip, like a duck’s foot. It is the commonest oak on wet ground here and, like the laurel oak, it rots early and falls young, which is good news for woodpeckers and bad for parked cars.', 'dcc-wildlife' ),
				'best'  => __( 'any month; leaves drop late and briefly', 'dcc-wildlife' ),
				'where' => __( 'wet flats, ditch edges and disturbed ground near water', 'dcc-wildlife' ),
				'mark'  => __( 'a small SPATULA-shaped leaf, flaring into three shallow lobes at the wide tip', 'dcc-wildlife' ),
			],
			'turkeyoak'        => [
				'emoji' => '🌿',
				'name'  => __( 'Turkey Oak', 'dcc-wildlife' ),
				'sci'   => 'Quercus laevis',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'oaks',
				'odds'  => 'occasional',
				'fact'  => __( 'A small crooked oak of deep dry sand, and its leaf is the name: three long pointed lobes splayed like a turkey’s footprint. It turns the leaves edge-on to the midday sun to save water, so a stand of them looks oddly thin and vertical. Where you find it, the sand is very dry.', 'dcc-wildlife' ),
				'best'  => __( 'any month; leaves turn red and drop in winter', 'dcc-wildlife' ),
				'where' => __( 'deep dry sandhill and scrub — not the canal bank', 'dcc-wildlife' ),
				'mark'  => __( 'a leaf like a TURKEY’S FOOT: three long pointed lobes, held edge-on to the sun', 'dcc-wildlife' ),
			],
			'sabalpalm'        => [
				'emoji' => '🌿',
				'name'  => __( 'Sabal Palm', 'dcc-wildlife' ),
				'sci'   => 'Sabal palmetto',
				'group' => 'plants',
				'browse' => 'trees',
				'odds'  => 'certain',
				'fact'  => __( 'Florida’s state tree since 1953, and the cabbage palm of every old photograph. The fan leaf has a stalk running part-way into the blade, which no other palm here does. Old leaf bases can stay on the trunk as criss-crossed "bootjacks", and ferns and air plants set up in them.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'the bank, the hammock and every roadside — everywhere', 'dcc-wildlife' ),
				'mark'  => __( 'a fan leaf with the stalk continuing INTO the blade, and a curved fringe of threads', 'dcc-wildlife' ),
			],
			'magnolia'         => [
				'emoji' => '🌿',
				'name'  => __( 'Southern Magnolia', 'dcc-wildlife' ),
				'sci'   => 'Magnolia grandiflora',
				'group' => 'plants',
				'browse' => 'trees',
				'odds'  => 'likely',
				'fact'  => __( 'Thick glossy leaves, rusty-felted underneath, and a flower the size of a dinner plate that smells of lemon. The family is ancient enough that the flowers predate bees — they are built for beetles, with tough parts that will survive being chewed on by a clumsy pollinator.', 'dcc-wildlife' ),
				'best'  => __( 'flowers May through June; the tree any month', 'dcc-wildlife' ),
				'where' => __( 'moist hammock and old plantings, usually a big dark evergreen dome', 'dcc-wildlife' ),
				'mark'  => __( 'huge leathery leaves with a RUSTY felt underside, and a cream flower the size of a plate', 'dcc-wildlife' ),
			],
			'redmaple'         => [
				'emoji' => '🌿',
				'name'  => __( 'Red Maple', 'dcc-wildlife' ),
				'sci'   => 'Acer rubrum',
				'group' => 'plants',
				'browse' => 'trees',
				'odds'  => 'certain',
				'fact'  => __( 'The first tree to do anything each year: it flowers in January, before any leaf, and the swamps go faintly red weeks ahead of spring. Then the winged seeds spin down in February. Three-lobed leaves, red stalks, and a second show in autumn, which Florida hardly gets from anything else.', 'dcc-wildlife' ),
				'best'  => __( 'flowers Jan–Feb; the tree any month', 'dcc-wildlife' ),
				'where' => __( 'wet swamp, canal margins and low woods', 'dcc-wildlife' ),
				'mark'  => __( 'a three-lobed leaf with a RED stalk; red flowers and winged seeds in midwinter', 'dcc-wildlife' ),
			],
			'sweetgum'         => [
				'emoji' => '🌿',
				'name'  => __( 'Sweetgum', 'dcc-wildlife' ),
				'sci'   => 'Liquidambar styraciflua',
				'group' => 'plants',
				'browse' => 'trees',
				'odds'  => 'likely',
				'fact'  => __( 'A star-shaped leaf that smells sharp and resinous when you crush it, and the reason nobody plants one by a path: the fruit is a hard spiked ball that drops in hundreds and rolls underfoot. It is one of the few trees here that colours properly in autumn, going red and purple.', 'dcc-wildlife' ),
				'best'  => __( 'autumn colour Nov–Dec; the tree any month', 'dcc-wildlife' ),
				'where' => __( 'moist woods and old fields near water', 'dcc-wildlife' ),
				'mark'  => __( 'a five-pointed STAR-shaped leaf, and hard spiky seed balls all over the ground', 'dcc-wildlife' ),
			],
			'pondcypress'      => [
				'emoji' => '🌿',
				'name'  => __( 'Pond Cypress', 'dcc-wildlife' ),
				'sci'   => 'Taxodium ascendens',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'cypresses',
				'odds'  => 'likely',
				'fact'  => __( 'The bald cypress’s smaller cousin, and the way to separate them is to look at how the needles are held: pond cypress presses them close to the twig and points them UPWARD, so the branchlets look like green cords. It takes the stiller, poorer water — ponds and domes rather than flowing channels.', 'dcc-wildlife' ),
				'best'  => __( 'any month; needles turn rusty and drop in winter', 'dcc-wildlife' ),
				'where' => __( 'still ponds, cypress domes and poor wet flats rather than the moving canal', 'dcc-wildlife' ),
				'mark'  => __( 'needles pressed UP against the twig like a cord; bald cypress spreads them flat in two rows', 'dcc-wildlife' ),
			],
			'slashpine'        => [
				'emoji' => '🌿',
				'name'  => __( 'Slash Pine', 'dcc-wildlife' ),
				'sci'   => 'Pinus elliottii',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'pines',
				'odds'  => 'certain',
				'fact'  => __( 'The pine you are most likely to be standing under here. Needles in bundles of two and three, seven to ten inches long, and a trunk plated with big flaky orange-brown scales. It was the backbone of the turpentine industry — old trunks still carry the catface scars where the bark was cut.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'wet flatwoods, planted rows and low ground everywhere', 'dcc-wildlife' ),
				'mark'  => __( 'needles in bundles of TWO AND THREE mixed, and glossy red-brown cones', 'dcc-wildlife' ),
			],
			'longleafpine'     => [
				'emoji' => '🌿',
				'name'  => __( 'Longleaf Pine', 'dcc-wildlife' ),
				'sci'   => 'Pinus palustris',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'pines',
				'odds'  => 'occasional',
				'fact'  => __( 'It spends its first five to twelve years as a tuft of grass with a taproot below, which is what lets fire run straight over it. Then it bolts. Needles up to eighteen inches in bundles of three, and a white candle of a bud at the tip. Around three per cent of the original forest is left.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'old open pine on drier ground — worth a trip, not a canal tree', 'dcc-wildlife' ),
				'mark'  => __( 'needles up to 18 inches in threes, and a silvery WHITE BUD at the branch tip', 'dcc-wildlife' ),
			],
			'sandpine'         => [
				'emoji' => '🌿',
				'name'  => __( 'Sand Pine', 'dcc-wildlife' ),
				'sci'   => 'Pinus clausa',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'pines',
				'odds'  => 'occasional',
				'fact'  => __( 'A scrubby, crooked little pine of pure white sand, and the Ocala forest is the largest stand of it on Earth. Short needles in twos, and cones that in the Ocala race stay shut on the branch for years — they need the heat of a fire to open, which is how the scrub regenerates all at once.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'deep dry white sand scrub; the Ocala forest', 'dcc-wildlife' ),
				'mark'  => __( 'SHORT needles in twos on a crooked small tree, with old closed cones still on the branches', 'dcc-wildlife' ),
			],
			'redcedar'         => [
				'emoji' => '🌿',
				'name'  => __( 'Southern Red Cedar', 'dcc-wildlife' ),
				'sci'   => 'Juniperus virginiana',
				'group' => 'plants',
				'browse' => 'trees',
				'odds'  => 'likely',
				'fact'  => __( 'Not a cedar at all but a juniper, and the blue "berries" are tiny cones with a waxy bloom — the flavouring in gin. The heartwood is the red, sweet-smelling stuff of old closets and pencils, and it resists rot so well that fence posts cut a century ago are still standing.', 'dcc-wildlife' ),
				'best'  => __( 'any month; berries blue in autumn', 'dcc-wildlife' ),
				'where' => __( 'shell mounds, bank edges and old fence lines, often leaning over water', 'dcc-wildlife' ),
				'mark'  => __( 'scale-like dark green foliage and small BLUE waxy berries; the crushed foliage smells of pencil', 'dcc-wildlife' ),
			],
			'dahoon'           => [
				'emoji' => '🌿',
				'name'  => __( 'Dahoon Holly', 'dcc-wildlife' ),
				'sci'   => 'Ilex cassine',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'hollies',
				'odds'  => 'likely',
				'fact'  => __( 'A wetland holly with smooth-edged leaves — no spines at all, which surprises people — and a heavy crop of red berries the robins and waxwings strip in late winter. Only the female tree fruits. Its leaves carry caffeine too, though far less than its cousin the yaupon.', 'dcc-wildlife' ),
				'best'  => __( 'berries Nov–Feb; the tree any month', 'dcc-wildlife' ),
				'where' => __( 'swamp edges, wet hammock and canal margins', 'dcc-wildlife' ),
				'mark'  => __( 'SMOOTH-EDGED leaves with no spines, and dense red berries on the female tree', 'dcc-wildlife' ),
			],
			'redbay'           => [
				'emoji' => '🌿',
				'name'  => __( 'Red Bay', 'dcc-wildlife' ),
				'sci'   => 'Persea borbonia',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'bays',
				'odds'  => 'likely',
				'fact'  => __( 'Crush a leaf and it smells of bay leaf — this is the tree the seasoning comes from in the South. It is also in serious trouble: laurel wilt, a fungus carried by an imported ambrosia beetle since 2002, has killed most of the large red bays in Florida and reached all sixty-seven counties by 2011.', 'dcc-wildlife' ),
				'best'  => __( 'any month; evergreen', 'dcc-wildlife' ),
				'where' => __( 'hammock and swamp edges — look for standing dead trunks too', 'dcc-wildlife' ),
				'mark'  => __( 'a leaf that smells of BAY when crushed, often with raised galls, over a dark trunk', 'dcc-wildlife' ),
			],
			'sweetbay'         => [
				'emoji' => '🌿',
				'name'  => __( 'Sweetbay Magnolia', 'dcc-wildlife' ),
				'sci'   => 'Magnolia virginiana',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'bays',
				'odds'  => 'likely',
				'fact'  => __( 'A slender magnolia of wet ground, and the giveaway is the leaf: dark green above and chalky SILVER-WHITE beneath, so the whole tree flickers pale when the wind turns it. The flower is a small cream cup that smells of lemon, and it opens over a long season rather than all at once.', 'dcc-wildlife' ),
				'best'  => __( 'flowers May through July; the tree any month', 'dcc-wildlife' ),
				'where' => __( 'swamp edges, bayheads and wet woods', 'dcc-wildlife' ),
				'mark'  => __( 'a leaf that is chalky SILVER underneath, and a small cream cup of a flower', 'dcc-wildlife' ),
			],
			'loblollybay'      => [
				'emoji' => '🌿',
				'name'  => __( 'Loblolly Bay', 'dcc-wildlife' ),
				'sci'   => 'Gordonia lasianthus',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'bays',
				'odds'  => 'occasional',
				'fact'  => __( 'Neither a bay nor a magnolia but a relative of the tea plant, and in summer it hangs white camellia flowers with a boss of gold stamens all through the canopy. Glossy leaves with finely toothed edges. It likes acid, boggy ground and grows with the other two bays in dense bayheads.', 'dcc-wildlife' ),
				'best'  => __( 'flowers Jun–Aug; the tree any month', 'dcc-wildlife' ),
				'where' => __( 'acid bogs, bayheads and wet flatwoods edges', 'dcc-wildlife' ),
				'mark'  => __( 'white CAMELLIA-like flowers with gold centres, and glossy finely TOOTHED leaves', 'dcc-wildlife' ),
			],
			'swamptupelo'      => [
				'emoji' => '🌿',
				'name'  => __( 'Swamp Tupelo', 'dcc-wildlife' ),
				'sci'   => 'Nyssa biflora',
				'group' => 'plants',
				'browse' => 'trees',
				'odds'  => 'likely',
				'fact'  => __( 'A swamp tree with a swollen, fluted base that stands in water most of the year, and the source of tupelo honey — a honey that does not granulate, because of the sugars in the nectar. The leaves go scarlet early, often in September, before anything else has thought about autumn.', 'dcc-wildlife' ),
				'best'  => __( 'flowers in spring; leaves turn early, Sept–Oct', 'dcc-wildlife' ),
				'where' => __( 'standing water in swamp and along the canal, often with cypress', 'dcc-wildlife' ),
				'mark'  => __( 'a swollen fluted BASE in standing water, and leaves that turn scarlet very early', 'dcc-wildlife' ),
			],
			'popash'           => [
				'emoji' => '🌿',
				'name'  => __( 'Pop Ash', 'dcc-wildlife' ),
				'sci'   => 'Fraxinus caroliniana',
				'group' => 'plants',
				'browse' => 'trees',
				'odds'  => 'likely',
				'fact'  => __( 'The little ash of standing water, often leaning out over it on a crooked trunk. Leaves are compound — five to seven leaflets on one stalk, which no other tree here does quite like this — and the seeds are flat papery paddles that spin down onto the surface and drift.', 'dcc-wildlife' ),
				'best'  => __( 'seeds spring and summer; the tree any month', 'dcc-wildlife' ),
				'where' => __( 'standing water and swamp edge, frequently leaning over the channel', 'dcc-wildlife' ),
				'mark'  => __( 'COMPOUND leaves of 5–7 leaflets, and flat papery winged seeds on the water', 'dcc-wildlife' ),
			],
			'persimmon'        => [
				'emoji' => '🌿',
				'name'  => __( 'Common Persimmon', 'dcc-wildlife' ),
				'sci'   => 'Diospyros virginiana',
				'group' => 'plants',
				'browse' => 'trees',
				'odds'  => 'occasional',
				'fact'  => __( 'The fruit is famously inedible until it is properly ripe — an unripe one dries your whole mouth out in seconds and you will not try a second. Left alone until it goes soft and orange in late autumn it is excellent, and every raccoon, possum and fox in the county knows it.', 'dcc-wildlife' ),
				'best'  => __( 'fruit ripe Oct–Dec', 'dcc-wildlife' ),
				'where' => __( 'old fields, fence lines and dry woodland edges', 'dcc-wildlife' ),
				'mark'  => __( 'thick blocky bark cracked into SQUARES like alligator hide, and orange fruit in autumn', 'dcc-wildlife' ),
			],
			'chickasawplum'    => [
				'emoji' => '🌿',
				'name'  => __( 'Chickasaw Plum', 'dcc-wildlife' ),
				'sci'   => 'Prunus angustifolia',
				'group' => 'plants',
				'browse' => 'trees',
				'odds'  => 'occasional',
				'fact'  => __( 'A thicket-forming small plum that flowers before it leafs out, so in February a roadside turns into a wall of white and hums with the first bees of the year. The fruit that follows in May is small, red and tart, and the thicket it makes is prime cover for quail and rabbits.', 'dcc-wildlife' ),
				'best'  => __( 'flowers Feb–Mar; fruit May', 'dcc-wildlife' ),
				'where' => __( 'old fields, fence lines and roadside thickets', 'dcc-wildlife' ),
				'mark'  => __( 'a THICKET of thorny twigs covered in white flowers before any leaves appear', 'dcc-wildlife' ),
			],
			'camphor'          => [
				'emoji' => '🌿',
				'name'  => __( 'Camphor Tree', 'dcc-wildlife' ),
				'sci'   => 'Cinnamomum camphora',
				'group' => 'plants',
				'browse' => 'trees',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'Crush a leaf and there is no mistaking it — pure camphor, the smell of mothballs and old liniment. It was planted for shade and for the oil, and it has walked out of gardens across Florida ever since: birds take the black berries and drop them in every hammock.', 'dcc-wildlife' ),
				'best'  => __( 'any month; evergreen', 'dcc-wildlife' ),
				'where' => __( 'old plantings, hammock edges and anywhere birds have perched', 'dcc-wildlife' ),
				'mark'  => __( 'leaves that smell strongly of CAMPHOR when crushed, on a broad pale-barked tree', 'dcc-wildlife' ),
			],
			'chinesetallow'    => [
				'emoji' => '🌿',
				'name'  => __( 'Chinese Tallow', 'dcc-wildlife' ),
				'sci'   => 'Triadica sebifera',
				'group' => 'plants',
				'browse' => 'trees',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'The popcorn tree, named for the white waxy seeds that split open in autumn, and one of the worst invaders in the Southeast. Heart-shaped leaves on a long stalk that tremble like an aspen, and genuinely good red autumn colour — which is exactly why people kept planting it.', 'dcc-wildlife' ),
				'best'  => __( 'autumn colour and white seed Oct–Dec', 'dcc-wildlife' ),
				'where' => __( 'disturbed wet ground, ditch banks and old yards', 'dcc-wildlife' ),
				'mark'  => __( 'a HEART-shaped leaf on a long trembling stalk, and clusters of white popcorn seeds', 'dcc-wildlife' ),
			],
			'ballmoss'         => [
				'emoji' => '🌿',
				'name'  => __( 'Ball Moss', 'dcc-wildlife' ),
				'sci'   => 'Tillandsia recurvata',
				'group' => 'plants',
				'browse' => 'trees',
				'idgroup' => 'airplants',
				'odds'  => 'likely',
				'fact'  => __( 'A grey-green ball the size of a fist wedged into a branch fork, and it is not a moss and not a parasite — it is a bromeliad, a relative of the pineapple, taking everything it needs from rain and dust through its own leaves. The tree is a perch, nothing more.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'wedged in branch forks of oaks and cypress, often in numbers on a dead limb', 'dcc-wildlife' ),
				'mark'  => __( 'a tight grey-green BALL on a branch, with stiff curling leaves — not a hanging drape', 'dcc-wildlife' ),
			],
			'coontie'          => [
				'emoji' => '🌿',
				'name'  => __( 'Coontie', 'dcc-wildlife' ),
				'sci'   => 'Zamia integrifolia',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'odds'  => 'occasional',
				'fact'  => __( 'Florida’s only native cycad — a line of plants far older than flowers — and it looks like a stiff little fern with a cone in the middle. It is also the sole food of the atala butterfly’s caterpillars, and when coontie was dug up wholesale for its starch the butterfly nearly went with it.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'dry hammock and sandy shade, often planted around buildings', 'dcc-wildlife' ),
				'mark'  => __( 'stiff glossy fern-like fronds from a squat underground stem, with a cone at the centre', 'dcc-wildlife' ),
			],
			'beautyberry'      => [
				'emoji' => '🌿',
				'name'  => __( 'American Beautyberry', 'dcc-wildlife' ),
				'sci'   => 'Callicarpa americana',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'odds'  => 'likely',
				'fact'  => __( 'In autumn it carries tight clusters of magenta berries clasped right against the stem, a purple nothing else here comes close to. The crushed leaves were an old country mosquito repellent, and when the USDA went looking they found three genuinely repellent compounds in them and patented one.', 'dcc-wildlife' ),
				'best'  => __( 'berries Aug–Nov', 'dcc-wildlife' ),
				'where' => __( 'woodland edges, fence lines and light shade', 'dcc-wildlife' ),
				'mark'  => __( 'bright MAGENTA berries in tight clusters pressed against the stem', 'dcc-wildlife' ),
			],
			'coralbean'        => [
				'emoji' => '🌿',
				'name'  => __( 'Coral Bean', 'dcc-wildlife' ),
				'sci'   => 'Erythrina herbacea',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'odds'  => 'likely',
				'fact'  => __( 'Spikes of narrow scarlet tubes on a prickly stem in spring, built for a hummingbird’s bill and worked hard by them. In autumn the pods split to show hard scarlet seeds, which are handsome and poisonous — the alkaloids in them are related to curare, so admire and leave.', 'dcc-wildlife' ),
				'best'  => __( 'flowers Mar–Jun; scarlet seeds in autumn', 'dcc-wildlife' ),
				'where' => __( 'dry sandy edges, hammock margins and old fields', 'dcc-wildlife' ),
				'mark'  => __( 'spikes of narrow SCARLET TUBES on a prickly stem; bright red seeds in a black pod later', 'dcc-wildlife' ),
			],
			'elderberry'       => [
				'emoji' => '🌿',
				'name'  => __( 'Elderberry', 'dcc-wildlife' ),
				'sci'   => 'Sambucus canadensis',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'idgroup' => 'wetshrubs',
				'odds'  => 'certain',
				'fact'  => __( 'Flat white plates of tiny flowers on a soft-stemmed shrub in every wet ditch, followed by heavy bunches of small purple-black berries that birds clear in days. The flowers and ripe cooked fruit have been used for centuries; the stems, leaves and raw fruit are another matter entirely.', 'dcc-wildlife' ),
				'best'  => __( 'flowers and fruit much of the year; heaviest in summer', 'dcc-wildlife' ),
				'where' => __( 'wet ditches, canal banks and any damp disturbed ground', 'dcc-wildlife' ),
				'mark'  => __( 'a FLAT-TOPPED plate of tiny white flowers on a hollow-stemmed shrub', 'dcc-wildlife' ),
			],
			'waxmyrtle'        => [
				'emoji' => '🌿',
				'name'  => __( 'Wax Myrtle', 'dcc-wildlife' ),
				'sci'   => 'Morella cerifera',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'odds'  => 'certain',
				'fact'  => __( 'Rub a leaf and it smells of bay rum. The pale blue-grey berries are coated in a true wax, which colonists boiled off to make bayberry candles — and which the yellow-rumped warbler and the tree swallow can actually digest, the trick that lets them both winter here in numbers.', 'dcc-wildlife' ),
				'best'  => __( 'any month; berries in winter', 'dcc-wildlife' ),
				'where' => __( 'wet edges, ditch banks and hammock margins, usually in thickets', 'dcc-wildlife' ),
				'mark'  => __( 'narrow aromatic leaves with a few teeth near the tip, and waxy pale BLUE-GREY berries', 'dcc-wildlife' ),
			],
			'tickseed'         => [
				'emoji' => '🌿',
				'name'  => __( 'Tickseed', 'dcc-wildlife' ),
				'sci'   => 'Coreopsis floridana',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'idgroup' => 'daisies',
				'odds'  => 'likely',
				'fact'  => __( 'Florida made the whole genus its state wildflower in 1991, which is why so many roadsides are sheeted in yellow — the highway plantings are mostly coreopsis. This is the Florida species: a lone yellow daisy on a long bare stalk over wet flatwoods, flowering into the autumn.', 'dcc-wildlife' ),
				'best'  => __( 'flowers late summer into autumn', 'dcc-wildlife' ),
				'where' => __( 'wet flatwoods, ditch edges and damp roadsides', 'dcc-wildlife' ),
				'mark'  => __( 'a single YELLOW daisy on a long leafless stalk, the centre also yellow-brown', 'dcc-wildlife' ),
			],
			'blanketflower'    => [
				'emoji' => '🌿',
				'name'  => __( 'Blanket Flower', 'dcc-wildlife' ),
				'sci'   => 'Gaillardia pulchella',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'idgroup' => 'daisies',
				'odds'  => 'likely',
				'fact'  => __( 'A daisy that looks like it has been dipped: deep red at the centre running out to yellow at the tips of the petals. It grows on pure sand and shrugs off salt and drought, so it holds dune and roadside alike. Whether it is truly native to Florida is still argued over.', 'dcc-wildlife' ),
				'best'  => __( 'flowers spring through autumn', 'dcc-wildlife' ),
				'where' => __( 'sandy roadsides, dunes and dry open ground', 'dcc-wildlife' ),
				'mark'  => __( 'a daisy banded RED at the centre and YELLOW at the petal tips, on grey hairy stems', 'dcc-wildlife' ),
			],
			'spanishneedles'   => [
				'emoji' => '🌿',
				'name'  => __( 'Spanish Needles', 'dcc-wildlife' ),
				'sci'   => 'Bidens alba',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'idgroup' => 'daisies',
				'odds'  => 'certain',
				'fact'  => __( 'The small white daisy with a yellow eye that grows on every verge and in every gap, flowering all year round. It is a nuisance in one specific way — the black barbed seeds ride off on socks and dogs — and a serious asset in another: it is among the top nectar sources for Florida’s honeybees.', 'dcc-wildlife' ),
				'best'  => __( 'any month — it never really stops', 'dcc-wildlife' ),
				'where' => __( 'verges, waste ground, lawn edges and every disturbed gap', 'dcc-wildlife' ),
				'mark'  => __( 'a small WHITE daisy with a yellow centre, and black barbed seeds that stick to clothes', 'dcc-wildlife' ),
			],
			'spiderwort'       => [
				'emoji' => '🌿',
				'name'  => __( 'Spiderwort', 'dcc-wildlife' ),
				'sci'   => 'Tradescantia ohiensis',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'odds'  => 'likely',
				'fact'  => __( 'Three blue petals on a grassy stalk, open at dawn and gone by lunchtime — each flower lasts one morning and dissolves into a drop of fluid. The stamen hairs are a single file of cells, which made this plant a standard classroom microscope subject and, for a while, a biological radiation monitor.', 'dcc-wildlife' ),
				'best'  => __( 'flowers spring, and again after rain', 'dcc-wildlife' ),
				'where' => __( 'roadsides, open sand and disturbed edges, in the morning', 'dcc-wildlife' ),
				'mark'  => __( 'THREE blue-violet petals over grass-like leaves, wilting to a jelly by midday', 'dcc-wildlife' ),
			],
			'maypop'           => [
				'emoji' => '🌿',
				'name'  => __( 'Maypop Passionflower', 'dcc-wildlife' ),
				'sci'   => 'Passiflora incarnata',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'idgroup' => 'vines',
				'odds'  => 'likely',
				'fact'  => __( 'The most complicated flower in this guide: a fringed purple corona over five stamens and three stigmas, which Spanish missionaries read as the instruments of the Passion. The name is the fruit — a hollow green egg that pops underfoot. It is the caterpillar food of the gulf fritillary butterfly.', 'dcc-wildlife' ),
				'best'  => __( 'flowers and fruit summer into autumn', 'dcc-wildlife' ),
				'where' => __( 'fence lines, field edges and roadside tangles', 'dcc-wildlife' ),
				'mark'  => __( 'a purple FRINGED flower like no other, and a hollow green egg of a fruit', 'dcc-wildlife' ),
			],
			'coralhoneysuckle'  => [
				'emoji' => '🌿',
				'name'  => __( 'Coral Honeysuckle', 'dcc-wildlife' ),
				'sci'   => 'Lonicera sempervirens',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'idgroup' => 'vines',
				'odds'  => 'likely',
				'fact'  => __( 'The native honeysuckle, and the well-behaved one: whorls of narrow coral-red trumpets, yellow inside, on a vine that climbs without strangling anything. There is no scent, because it is not courting moths — it is courting hummingbirds, and it flowers almost all year here for them.', 'dcc-wildlife' ),
				'best'  => __( 'flowers spring, and on and off all year', 'dcc-wildlife' ),
				'where' => __( 'fence lines, shrub edges and low trees, climbing', 'dcc-wildlife' ),
				'mark'  => __( 'whorls of narrow CORAL-RED trumpets with no scent, and paired leaves fused under the flowers', 'dcc-wildlife' ),
			],
			'firebush'         => [
				'emoji' => '🌿',
				'name'  => __( 'Firebush', 'dcc-wildlife' ),
				'sci'   => 'Hamelia patens',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'odds'  => 'likely',
				'fact'  => __( 'Clusters of slim orange-red tubes from spring until the first cold, and one of the few plants that reliably brings in hummingbirds, zebra longwings and gulf fritillaries at the same time. The leaves and stems flush red in sun. Frost knocks it down and it comes straight back from the root.', 'dcc-wildlife' ),
				'best'  => __( 'flowers spring through autumn, until frost', 'dcc-wildlife' ),
				'where' => __( 'sunny edges and plantings near buildings', 'dcc-wildlife' ),
				'mark'  => __( 'clusters of slim ORANGE-RED tubes at the branch tips, with reddish leaf stalks', 'dcc-wildlife' ),
			],
			'muscadine'        => [
				'emoji' => '🌿',
				'name'  => __( 'Muscadine Grape', 'dcc-wildlife' ),
				'sci'   => 'Vitis rotundifolia',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'idgroup' => 'vines',
				'odds'  => 'certain',
				'fact'  => __( 'The native grape of the South, thick-skinned and musky, hanging in small loose bunches rather than tight ones. Bronze-fruited forms are the scuppernong. Its tendrils are unbranched, which separates it from every other grape here, and the bark does not shred off in strips as theirs does.', 'dcc-wildlife' ),
				'best'  => __( 'fruit Aug–Sep; the vine any month', 'dcc-wildlife' ),
				'where' => __( 'climbing through hammock trees and along fence lines', 'dcc-wildlife' ),
				'mark'  => __( 'UNBRANCHED tendrils and tight bark that does not peel; small loose bunches of thick-skinned fruit', 'dcc-wildlife' ),
			],
			'virginiacreeper'  => [
				'emoji' => '🌿',
				'name'  => __( 'Virginia Creeper', 'dcc-wildlife' ),
				'sci'   => 'Parthenocissus quinquefolia',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'idgroup' => 'vines',
				'odds'  => 'certain',
				'fact'  => __( 'The vine everybody mistakes for poison ivy, and the difference is simple enough to count: FIVE leaflets here, three on poison ivy. It climbs on adhesive pads rather than rootlets, turns a good scarlet in autumn, and its blue berries are a serious bird food and seriously poisonous to people.', 'dcc-wildlife' ),
				'best'  => __( 'any month; scarlet in autumn', 'dcc-wildlife' ),
				'where' => __( 'climbing trunks, fences and walls, and sprawling over the ground', 'dcc-wildlife' ),
				'mark'  => __( 'FIVE leaflets from one point — poison ivy has three; climbs on sticky pads, not hairy roots', 'dcc-wildlife' ),
			],
			'lantana'          => [
				'emoji' => '🌿',
				'name'  => __( 'Lantana', 'dcc-wildlife' ),
				'sci'   => 'Lantana camara',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'Flat heads of little flowers that change colour as they age, so one head is yellow, orange and pink at once — and butterflies work it all day. It is also a listed invasive that hybridises with Florida’s own rarer native lantana, and its green berries are the part that poisons livestock and children.', 'dcc-wildlife' ),
				'best'  => __( 'any month, flowering almost continuously', 'dcc-wildlife' ),
				'where' => __( 'roadsides, old plantings and disturbed sunny ground', 'dcc-wildlife' ),
				'mark'  => __( 'a flat head of tiny flowers in TWO OR THREE colours at once, over rough aromatic leaves', 'dcc-wildlife' ),
			],
			'dogfennel'        => [
				'emoji' => '🌿',
				'name'  => __( 'Dog Fennel', 'dcc-wildlife' ),
				'sci'   => 'Eupatorium capillifolium',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'odds'  => 'certain',
				'fact'  => __( 'The tall feathery plume that takes over any Florida field left alone for a season — native, not introduced, and thoroughly weedy about it. The foliage is finely divided and smells sharp and medicinal when crushed. Cattle avoid it, which is a large part of why there is so much of it.', 'dcc-wildlife' ),
				'best'  => __( 'tallest and flowering late summer into autumn', 'dcc-wildlife' ),
				'where' => __( 'old fields, ditch banks and any ground left alone', 'dcc-wildlife' ),
				'mark'  => __( 'a tall FEATHERY plume of thread-fine leaves, aromatic when crushed', 'dcc-wildlife' ),
			],
			'butterflyweed'    => [
				'emoji' => '🌿',
				'name'  => __( 'Butterfly Weed', 'dcc-wildlife' ),
				'sci'   => 'Asclepias tuberosa',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'odds'  => 'occasional',
				'fact'  => __( 'The orange milkweed, and the odd one out in its family: break a stem and the sap runs clear, not milky. Monarch and queen caterpillars eat it and take up its toxins for their own defence. It sends a deep taproot down into dry sand, which is why it hates being moved.', 'dcc-wildlife' ),
				'best'  => __( 'flowers late spring through summer', 'dcc-wildlife' ),
				'where' => __( 'dry sandy roadsides, open pine and old fields', 'dcc-wildlife' ),
				'mark'  => __( 'flat heads of BRIGHT ORANGE flowers, and CLEAR sap where a milkweed should run white', 'dcc-wildlife' ),
			],
			'buttonbush'       => [
				'emoji' => '🌿',
				'name'  => __( 'Buttonbush', 'dcc-wildlife' ),
				'sci'   => 'Cephalanthus occidentalis',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'idgroup' => 'wetshrubs',
				'odds'  => 'likely',
				'fact'  => __( 'A shrub that stands in the water and hangs it with white pincushions — perfect spheres of tiny flowers, each one with a long style sticking out, so the whole head looks like a pinned ball. It is heavily worked by bees and butterflies, and the seed heads feed ducks all winter.', 'dcc-wildlife' ),
				'best'  => __( 'flowers Jun–Sep', 'dcc-wildlife' ),
				'where' => __( 'standing in shallow water at the canal and pond edges', 'dcc-wildlife' ),
				'mark'  => __( 'perfect white SPHERES of flowers like pincushions, on a shrub standing in water', 'dcc-wildlife' ),
			],
			'yaupon'           => [
				'emoji' => '🌿',
				'name'  => __( 'Yaupon Holly', 'dcc-wildlife' ),
				'sci'   => 'Ilex vomitoria',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'idgroup' => 'hollies',
				'odds'  => 'likely',
				'fact'  => __( 'One of only two plants native to North America that make caffeine — and the other, dahoon holly, is also in this guide. Southeastern nations brewed its roasted leaves as the ceremonial "black drink". The species name accuses it of causing vomiting, which the tea does not do; the ceremony did.', 'dcc-wildlife' ),
				'best'  => __( 'berries autumn and winter; the shrub any month', 'dcc-wildlife' ),
				'where' => __( 'hammock edges, fence lines and old plantings, often a dense thicket', 'dcc-wildlife' ),
				'mark'  => __( 'small leaves with rounded TEETH and translucent red berries; the dahoon’s leaves are smooth-edged', 'dcc-wildlife' ),
			],
			'floridarosemary'  => [
				'emoji' => '🌿',
				'name'  => __( 'Florida Rosemary', 'dcc-wildlife' ),
				'sci'   => 'Ceratiola ericoides',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'odds'  => 'rare',
				'fact'  => __( 'A grey-green dome on white sand that is not a rosemary at all, though it smells like one. It poisons the ground around itself: a compound washed off its leaves stops other seeds germinating, which is why each bush sits in its own bare sand ring with nothing but lichen in it.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'deep white sand scrub on the ridges — a trip, not the canal', 'dcc-wildlife' ),
				'mark'  => __( 'a rounded grey-green aromatic shrub sitting in its own BARE SAND ring', 'dcc-wildlife' ),
			],
			'adamsneedle'      => [
				'emoji' => '🌿',
				'name'  => __( 'Adam’s Needle', 'dcc-wildlife' ),
				'sci'   => 'Yucca filamentosa',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'odds'  => 'occasional',
				'fact'  => __( 'A rosette of stiff swords with curling threads peeling off the leaf edges, and a tall spike of cream bells in spring. It has exactly one pollinator: a small white moth that deliberately packs pollen into the flower and then lays eggs in it, so each needs the other to exist at all.', 'dcc-wildlife' ),
				'best'  => __( 'flowers Apr–Jun', 'dcc-wildlife' ),
				'where' => __( 'dry sandy ground, old yards and roadside banks', 'dcc-wildlife' ),
				'mark'  => __( 'stiff sword leaves with white THREADS curling off their edges, and a tall spike of cream bells', 'dcc-wildlife' ),
			],
			'pricklypear'      => [
				'emoji' => '🌿',
				'name'  => __( 'Prickly Pear Cactus', 'dcc-wildlife' ),
				'sci'   => 'Opuntia austrina',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'flags' => [ 'danger' ],
				'odds'  => 'likely',
				'safe'  => __( 'Do not brush against it or pick the fruit bare-handed. The tiny barbed hairs come off at a touch, work into skin and can itch for weeks; lift them with tweezers, not fingers.', 'dcc-wildlife' ),
				'fact'  => __( 'Florida has a native cactus, and this is it: flat green pads, big waxy yellow flowers in spring, and dark red fruit. The long spines are the obvious hazard and the smaller one is worse — clusters of tiny barbed hairs called glochids that come off at a touch and are very hard to get out.', 'dcc-wildlife' ),
				'best'  => __( 'flowers Apr–Jun; red fruit in summer', 'dcc-wildlife' ),
				'where' => __( 'dry sand, scrub and open sandy roadsides', 'dcc-wildlife' ),
				'mark'  => __( 'flat green PADS with tufts of bristles, and a waxy yellow flower the size of a fist', 'dcc-wildlife' ),
			],
			'reindeerlichen'   => [
				'emoji' => '🌿',
				'name'  => __( 'Reindeer Lichen', 'dcc-wildlife' ),
				'sci'   => 'Cladonia evansii',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'odds'  => 'occasional',
				'fact'  => __( 'The pale grey-white crunch underfoot in dry scrub, often called deer moss, and it is neither moss nor a single organism — a fungus and an alga living as one. It grows a few millimetres a year, so a patch the size of a dinner plate has been there for decades. Dry, it shatters; wet, it springs back.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'open white sand in scrub and dry pine, between the shrubs', 'dcc-wildlife' ),
				'mark'  => __( 'a pale GREY-WHITE springy mat of fine branching stalks on bare sand', 'dcc-wildlife' ),
			],
			'airpotato'        => [
				'emoji' => '🌿',
				'name'  => __( 'Air Potato', 'dcc-wildlife' ),
				'sci'   => 'Dioscorea bulbifera',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'idgroup' => 'vines',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'A vine that can put on eight inches in a day and reach seventy feet, smothering whole trees under heart-shaped leaves. It spreads by the potato-like bulbils hanging along the stems, not by seed. Since 2012 a leaf beetle released as a control has been eating it back, and it works.', 'dcc-wildlife' ),
				'best'  => __( 'growing and dropping bulbils summer into autumn', 'dcc-wildlife' ),
				'where' => __( 'smothering trees and fences on disturbed ground near water', 'dcc-wildlife' ),
				'mark'  => __( 'HEART-shaped leaves with curved veins, and brown warty POTATOES hanging on the vine', 'dcc-wildlife' ),
			],
			'cogongrass'       => [
				'emoji' => '🌿',
				'name'  => __( 'Cogongrass', 'dcc-wildlife' ),
				'sci'   => 'Imperata cylindrica',
				'group' => 'plants',
				'browse' => 'wildflowers',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'Listed among the worst weeds in the world, and it wins by burning: it builds dense dry fuel and carries fire hotter than native ground cover, killing what it cannot outgrow. A silvery cylindrical flower plume in spring, and a leaf with an off-centre pale midrib — that off-centre rib is the tell.', 'dcc-wildlife' ),
				'best'  => __( 'silver plumes Mar–May; the grass any month', 'dcc-wildlife' ),
				'where' => __( 'roadsides, firebreaks and disturbed edges, in expanding circular patches', 'dcc-wildlife' ),
				'mark'  => __( 'a pale midrib set OFF-CENTRE in the leaf, and a silky silver-white flower plume', 'dcc-wildlife' ),
			],
			'pickerelweed'     => [
				'emoji' => '🌿',
				'name'  => __( 'Pickerelweed', 'dcc-wildlife' ),
				'sci'   => 'Pontederia cordata',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'paddleleaves',
				'odds'  => 'certain',
				'fact'  => __( 'The blue spikes along the canal edge all summer, over glossy heart-shaped leaves standing clear of the water. Bees work it constantly, and the seeds are eaten by ducks. It holds the bank together, and the shallow tangle of its stems is where small fish and young alligators hide.', 'dcc-wildlife' ),
				'best'  => __( 'flowers spring through autumn', 'dcc-wildlife' ),
				'where' => __( 'shallow edges of the canal and the lakes, standing in water', 'dcc-wildlife' ),
				'mark'  => __( 'a spike of soft BLUE flowers over a glossy heart-shaped leaf held above the water', 'dcc-wildlife' ),
			],
			'alligatorflag'    => [
				'emoji' => '🌿',
				'name'  => __( 'Alligator Flag', 'dcc-wildlife' ),
				'sci'   => 'Thalia geniculata',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'paddleleaves',
				'odds'  => 'likely',
				'fact'  => __( 'The tallest thing growing in the marsh — huge paddle leaves on stalks well over head height, with the flowers dangling on a zigzag stem above them. The name is a warning that works: clumps of it mark the open water alligators keep clear around their holes, so a stand of flag often means a gator.', 'dcc-wildlife' ),
				'best'  => __( 'flowers summer into autumn', 'dcc-wildlife' ),
				'where' => __( 'deeper marsh and pond edges, standing above everything else', 'dcc-wildlife' ),
				'mark'  => __( 'enormous PADDLE leaves head-high or more, with flowers hanging from a zigzag stalk', 'dcc-wildlife' ),
			],
			'cattail'          => [
				'emoji' => '🌿',
				'name'  => __( 'Cattail', 'dcc-wildlife' ),
				'sci'   => 'Typha domingensis',
				'group' => 'plants',
				'browse' => 'waterplants',
				'odds'  => 'certain',
				'fact'  => __( 'The brown sausage on a stick everyone knows, and it is not a flower but thousands of them packed tight — the fluffy seed head that follows can hold a quarter of a million seeds. It spreads hard through disturbed and nutrient-rich water, which on this chain usually means somewhere fertiliser is running in.', 'dcc-wildlife' ),
				'best'  => __( 'brown heads summer into winter', 'dcc-wildlife' ),
				'where' => __( 'shallow standing water, ditches and marsh, often in dense stands', 'dcc-wildlife' ),
				'mark'  => __( 'a dense brown SAUSAGE on a tall round stem, over flat strap leaves', 'dcc-wildlife' ),
			],
			'sawgrass'         => [
				'emoji' => '🌿',
				'name'  => __( 'Sawgrass', 'dcc-wildlife' ),
				'sci'   => 'Cladium jamaicense',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'grasses',
				'flags' => [ 'danger' ],
				'odds'  => 'likely',
				'safe'  => __( 'Do not push through a stand of it, and never grab a blade to steady yourself. The saw-toothed edges cut bare skin, arms and legs badly; go round it, and wear long sleeves if you must wade near it.', 'dcc-wildlife' ),
				'fact'  => __( 'The plant the Everglades is made of — the "river of grass" is this, for miles. It is a sedge rather than a grass, and the edges of every leaf and the underside of the midrib carry fine backward-pointing teeth that will open your skin like a paper cut, only longer and deeper.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'shallow marsh and wet prairie edges, in dense tall stands', 'dcc-wildlife' ),
				'mark'  => __( 'a tall stiff blade with SERRATED edges you can feel with a fingertip — carefully', 'dcc-wildlife' ),
			],
			'spatterdock'      => [
				'emoji' => '🌿',
				'name'  => __( 'Spatterdock', 'dcc-wildlife' ),
				'sci'   => 'Nuphar advena',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'lilypads',
				'odds'  => 'certain',
				'fact'  => __( 'The yellow one. A half-open globe of thick waxy sepals that never really opens flat, sitting on a stem above big arrowhead-shaped leaves that stand up out of the water as often as they float. Bass and bream hold in its shade all summer, and it is the first pad growth up each spring.', 'dcc-wildlife' ),
				'best'  => __( 'flowers spring through autumn', 'dcc-wildlife' ),
				'where' => __( 'slow shallow water along the canal and lake edges', 'dcc-wildlife' ),
				'mark'  => __( 'a YELLOW half-open globe, and leaves that stand UP out of the water as well as float', 'dcc-wildlife' ),
			],
			'lotus'            => [
				'emoji' => '🌿',
				'name'  => __( 'American Lotus', 'dcc-wildlife' ),
				'sci'   => 'Nelumbo lutea',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'lilypads',
				'odds'  => 'occasional',
				'fact'  => __( 'Unmistakable and enormous: round leaves up to two feet across held high above the water on a central stalk, with no slit in them at all. Water beads and rolls straight off the surface. The pale yellow flower gives way to a woody showerhead of a seed pod that everybody recognises from dried arrangements.', 'dcc-wildlife' ),
				'best'  => __( 'flowers Jun–Sep', 'dcc-wildlife' ),
				'where' => __( 'quiet backwaters and protected shallows, in large colonies', 'dcc-wildlife' ),
				'mark'  => __( 'a huge ROUND leaf with NO slit, held high above the water; a woody showerhead seed pod', 'dcc-wildlife' ),
			],
			'arrowhead'        => [
				'emoji' => '🌿',
				'name'  => __( 'Arrowhead', 'dcc-wildlife' ),
				'sci'   => 'Sagittaria lancifolia',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'paddleleaves',
				'odds'  => 'certain',
				'fact'  => __( 'Also called duck potato, for the starchy tubers on the roots that ducks and muskrats dig out. Three round white petals with a yellow centre, in whorls up a stalk. The Florida species carries a long lance-shaped leaf rather than the sharp arrow of its northern relatives, which catches people out.', 'dcc-wildlife' ),
				'best'  => __( 'flowers spring through autumn', 'dcc-wildlife' ),
				'where' => __( 'shallow edges, wet ditches and marsh', 'dcc-wildlife' ),
				'mark'  => __( 'THREE rounded white petals in whorls up the stalk, over lance-shaped upright leaves', 'dcc-wildlife' ),
			],
			'stringlily'       => [
				'emoji' => '🌿',
				'name'  => __( 'String Lily', 'dcc-wildlife' ),
				'sci'   => 'Crinum americanum',
				'group' => 'plants',
				'browse' => 'waterplants',
				'odds'  => 'likely',
				'fact'  => __( 'A true swamp lily: a cluster of long white straps of petals on a thick stalk, standing in the water and scenting the air at dusk for the sphinx moths that pollinate it. The bulb is large and deep, and poisonous. It flowers on and off through the warm months rather than all at once.', 'dcc-wildlife' ),
				'best'  => __( 'flowers spring through autumn, and after rain', 'dcc-wildlife' ),
				'where' => __( 'standing in shallow water at swamp and canal margins', 'dcc-wildlife' ),
				'mark'  => __( 'narrow WHITE STRAPS of petals curling back from a cluster, on a thick fleshy stalk', 'dcc-wildlife' ),
			],
			'blueflag'         => [
				'emoji' => '🌿',
				'name'  => __( 'Blue Flag Iris', 'dcc-wildlife' ),
				'sci'   => 'Iris virginica',
				'group' => 'plants',
				'browse' => 'waterplants',
				'odds'  => 'likely',
				'fact'  => __( 'The native iris of the marsh, flowering violet-blue in spring with a yellow blaze guiding insects down the throat of each fall. It grows from a creeping rhizome in shallow water — and that rhizome is toxic, which is worth knowing because it looks very like the edible sweet flag it grows beside.', 'dcc-wildlife' ),
				'best'  => __( 'flowers Mar–May', 'dcc-wildlife' ),
				'where' => __( 'shallow marsh, wet ditches and canal edges', 'dcc-wildlife' ),
				'mark'  => __( 'a violet-blue IRIS with a YELLOW blaze on each drooping petal, from flat fans of leaves', 'dcc-wildlife' ),
			],
			'bladderwort'      => [
				'emoji' => '🌿',
				'name'  => __( 'Bladderwort', 'dcc-wildlife' ),
				'sci'   => 'Utricularia juncea',
				'group' => 'plants',
				'browse' => 'waterplants',
				'odds'  => 'occasional',
				'fact'  => __( 'A carnivorous plant, and the fastest mover in the whole plant kingdom. The tiny bladders on its submerged stems pump themselves empty, and when a water flea touches a trigger hair the door snaps in under a millisecond and the animal is sucked in at 600 g. Above water it is just a small yellow flower.', 'dcc-wildlife' ),
				'best'  => __( 'flowers warm months', 'dcc-wildlife' ),
				'where' => __( 'still shallow water, ditches and marsh pools, mostly submerged', 'dcc-wildlife' ),
				'mark'  => __( 'small YELLOW snapdragon-like flowers on a bare stalk, with a hair-fine tangle below the surface', 'dcc-wildlife' ),
			],
			'eelgrass'         => [
				'emoji' => '🌿',
				'name'  => __( 'Eelgrass', 'dcc-wildlife' ),
				'sci'   => 'Vallisneria americana',
				'group' => 'plants',
				'browse' => 'waterplants',
				'odds'  => 'likely',
				'fact'  => __( 'Long green ribbons streaming with the current, rooted on the bottom — and the single most important plant on this chain for manatees, which graze the beds. The female flower rides up to the surface on a coiled stalk, is pollinated there, then the coil winds back down to ripen the seed underwater.', 'dcc-wildlife' ),
				'best'  => __( 'any month; growing hardest in the warm months', 'dcc-wildlife' ),
				'where' => __( 'rooted on the bottom in clear shallow water, streaming with the current', 'dcc-wildlife' ),
				'mark'  => __( 'flat green RIBBONS up to several feet long, all rooted in one place on the bottom', 'dcc-wildlife' ),
			],
			'maidencane'       => [
				'emoji' => '🌿',
				'name'  => __( 'Maidencane', 'dcc-wildlife' ),
				'sci'   => 'Panicum hemitomon',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'grasses',
				'odds'  => 'likely',
				'fact'  => __( 'The native grass that makes the floating tussock edges on these lakes — a dense stand of it will hold together as a mat you could nearly stand on, and that mat is where bass spawn and where young fish hide. It stands a few feet out of shallow water on a creeping underwater stem.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'shallow lake and canal margins, in dense standing beds', 'dcc-wildlife' ),
				'mark'  => __( 'an upright grass standing in water in a dense even bed, leaves held stiffly out from the stem', 'dcc-wildlife' ),
			],
			'torpedograss'     => [
				'emoji' => '🌿',
				'name'  => __( 'Torpedo Grass', 'dcc-wildlife' ),
				'sci'   => 'Panicum repens',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'grasses',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'Brought in as cattle forage and now one of the most expensive weeds in Florida to fight. It drives sharp pointed rhizomes through mud and shoreline — the torpedoes of the name — and takes over the shallow edge from maidencane and everything else, leaving a monoculture fish do not use.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'shallow shorelines, ditch edges and disturbed bank, forming solid stands', 'dcc-wildlife' ),
				'mark'  => __( 'a stiff blue-green grass spreading from sharp POINTED white rhizomes in the mud', 'dcc-wildlife' ),
			],
			'waterhyacinth'    => [
				'emoji' => '🌿',
				'name'  => __( 'Water Hyacinth', 'dcc-wildlife' ),
				'sci'   => 'Pontederia crassipes',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'floaters',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'A beautiful catastrophe. Given away as souvenirs at the 1884 New Orleans cotton exposition and tipped into the St Johns a few years later, it went on to blanket a hundred thousand acres of Florida water. A mat can double in under a fortnight. The float is a swollen, spongy, air-filled leaf stalk.', 'dcc-wildlife' ),
				'best'  => __( 'any month; worst in the warm season', 'dcc-wildlife' ),
				'where' => __( 'drifting mats on open water and against banks and booms', 'dcc-wildlife' ),
				'mark'  => __( 'a SWOLLEN spongy bulb in the leaf stalk holding it up, and a lavender flower spike', 'dcc-wildlife' ),
			],
			'waterlettuce'     => [
				'emoji' => '🌿',
				'name'  => __( 'Water Lettuce', 'dcc-wildlife' ),
				'sci'   => 'Pistia stratiotes',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'floaters',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'A floating rosette exactly like an open head of lettuce, pale green and deeply ribbed, with a beard of fine roots hanging below. It travels on the wind, forms mats that shut out light and oxygen, and reproduces by throwing off daughter plants on runners — one becomes a raft very quickly.', 'dcc-wildlife' ),
				'best'  => __( 'any month; worst in the warm season', 'dcc-wildlife' ),
				'where' => __( 'drifting on still water, in coves and against banks', 'dcc-wildlife' ),
				'mark'  => __( 'a floating rosette like a pale open LETTUCE, velvety and ribbed, with roots trailing below', 'dcc-wildlife' ),
			],
			'hydrilla'         => [
				'emoji' => '🌿',
				'name'  => __( 'Hydrilla', 'dcc-wildlife' ),
				'sci'   => 'Hydrilla verticillata',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'floaters',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'Florida’s worst submerged weed, released from the aquarium trade in the 1950s and now in most of the chain. It grows up from the bottom and mats at the surface, and it can regrow from a fragment the size of a fingernail — which is why boat trailers are washed down. Whorls of toothed leaves.', 'dcc-wildlife' ),
				'best'  => __( 'any month; densest late summer', 'dcc-wildlife' ),
				'where' => __( 'below the surface in most of the chain, matting on top in calm water', 'dcc-wildlife' ),
				'mark'  => __( 'WHORLS of four to eight small leaves with visibly TOOTHED edges, rough to the touch', 'dcc-wildlife' ),
			],
			'duckweed'         => [
				'emoji' => '🌿',
				'name'  => __( 'Duckweed', 'dcc-wildlife' ),
				'sci'   => 'Lemna minor',
				'group' => 'plants',
				'browse' => 'waterplants',
				'idgroup' => 'floaters',
				'odds'  => 'certain',
				'fact'  => __( 'The green film on still water that people take for algae or spilled paint. It is a flowering plant, and among the smallest there are: each grain is a whole individual, a few millimetres of leaf with one root hanging down. It reproduces by budding, and it can double in about two days.', 'dcc-wildlife' ),
				'best'  => __( 'any month; thickest in warm still weather', 'dcc-wildlife' ),
				'where' => __( 'still sheltered water, coves, ditches and under overhanging banks', 'dcc-wildlife' ),
				'mark'  => __( 'a carpet of separate tiny GREEN GRAINS, each with a single root — not slime and not algae', 'dcc-wildlife' ),
			],
			'primrosewillow'   => [
				'emoji' => '🌿',
				'name'  => __( 'Primrose-willow', 'dcc-wildlife' ),
				'sci'   => 'Ludwigia peruviana',
				'group' => 'plants',
				'browse' => 'waterplants',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'Big bright yellow four-petalled flowers on a tall soft shrub standing in the water, and it looks like something you would plant on purpose. It is a listed invasive from South America that crowds out the native marsh edge, seeds heavily, and comes straight back from the stump when it is cut.', 'dcc-wildlife' ),
				'best'  => __( 'flowers most of the year, heaviest in summer', 'dcc-wildlife' ),
				'where' => __( 'wet ditches, canal banks and marsh edges, in tall stands', 'dcc-wildlife' ),
				'mark'  => __( 'large FOUR-petalled yellow flowers on a tall soft-wooded shrub standing in water', 'dcc-wildlife' ),
			],
			'alligatorweed'    => [
				'emoji' => '🌿',
				'name'  => __( 'Alligator Weed', 'dcc-wildlife' ),
				'sci'   => 'Alternanthera philoxeroides',
				'group' => 'plants',
				'browse' => 'waterplants',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'Hollow stems that mat out over the water from the bank, with small papery white clover-like heads. It was the first aquatic weed anywhere to be fought with imported insects, back in the 1960s, and the flea beetle they released still keeps it down in the warmer parts of Florida.', 'dcc-wildlife' ),
				'best'  => __( 'flowers spring through autumn', 'dcc-wildlife' ),
				'where' => __( 'matting out from banks over shallow water, and in wet ditches', 'dcc-wildlife' ),
				'mark'  => __( 'a HOLLOW jointed stem and small papery WHITE clover-like heads on a stalk', 'dcc-wildlife' ),
			],
			// ---- BATCHES 14-19 (1.33.0): mammals, fish, small things, reptiles --
			// A hundred and eighteen, in seven packs, and the last of the animals:
			// 23 mammals, 31 fish, 11 dragonflies and damselflies, 27 butterflies
			// and moths, 17 other small things, 9 reptiles the earlier reptile
			// packs had missed.
			//
			// ONE SPECIES WAS DROPPED ON THE EVIDENCE, NOT WIRED IN. The blue-faced
			// meadowhawk (Sympetrum ambiguum) came with a photograph and with the
			// pack's own evidence against it: iNaturalist holds five Florida
			// records, every one in the panhandle, none in Lake County or anywhere
			// in Central Florida -- and the published range for the species stops
			// at "the Gulf Coast and the panhandle of north Florida". A guide entry
			// asserts "this is on this canal", and that assertion would be false.
			// Its photograph is NOT in assets/photos and it has no registry row, so
			// nobody can quietly wire it in later without first finding out why.
			// Same treatment as the least bittern held in batch 3.
			//
			// THE ROUND-TAILED MUSKRAT HAS NO PHOTOGRAPH, BY THE OWNER'S OWN
			// DECISION -- the only openly licensed image of a live one is an
			// unidentifiable dark shape. It renders on the group glyph, which is
			// what the three-tier art rule exists for. DO NOT SOURCE ONE. It is the
			// only species of 402 without a photograph, and that is deliberate.
			//
			// TWO NEW HAZARDS, both CONTACT injuries, both carrying a `safe` line
			// and rows in the narration contract:
			//   walkingstick - sprays a terpene irritant over a foot, aimed at
			//                  eyes; causes intense pain and temporary blindness
			//   rhesus       - flagged `danger` AS WELL AS `invasive`: the risk is
			//                  a bite or scratch, and some of the Silver Springs
			//                  population carries herpes B. They have reached Lake
			//                  County; one has been photographed in Mount Dora.
			// The armadillo is NOT flagged although it can carry leprosy, because
			// that needs handling the animal -- a deliberate act, like eating a
			// coontie seed. Its entry says "look and do not handle" in the text.
			'blackbear'          => [
				'emoji' => '🐾',
				'name'  => __( 'Florida Black Bear', 'dcc-wildlife' ),
				'sci'   => 'Ursus americanus floridanus',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'rare',
				'fact'  => __( 'Florida’s own subspecies, and the largest land animal in the state — a big male runs to four hundred pounds. It came off the state threatened list in 2012 after a long recovery. It is overwhelmingly a vegetarian opportunist: acorns, saw palmetto berries, insects, and whatever anybody left on a porch.', 'dcc-wildlife' ),
				'best'  => __( 'dusk and dawn, spring and autumn', 'dcc-wildlife' ),
				'where' => __( 'oak hammock and scrub away from the water; occasionally a suburban edge at night', 'dcc-wildlife' ),
				'mark'  => __( 'solid black with a brown muzzle, no shoulder hump, and a rump higher than the shoulders', 'dcc-wildlife' ),
			],
			'raccoon'            => [
				'emoji' => '🐾',
				'name'  => __( 'Raccoon', 'dcc-wildlife' ),
				'sci'   => 'Procyon lotor',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'certain',
				'fact'  => __( 'The most dexterous hands of any animal here — the forepaws carry about four times the touch receptors of the hind feet, and a raccoon reads an object by feeling it, often underwater. That is what the "washing" is. The black mask cuts glare and the tail rings break up its outline at night.', 'dcc-wildlife' ),
				'sound' => __( 'A chittering, churring conversation, and a high tremolo from kits in a den tree.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'the bank, the dock, bins, and the shallows feeling for crayfish', 'dcc-wildlife' ),
				'mark'  => __( 'a black BANDIT MASK and a heavily RINGED tail', 'dcc-wildlife' ),
			],
			'opossum'            => [
				'emoji' => '🐾',
				'name'  => __( 'Virginia Opossum', 'dcc-wildlife' ),
				'sci'   => 'Didelphis virginiana',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'certain',
				'fact'  => __( 'North America’s only marsupial, and far better company than it looks. Its blood carries a protein that neutralises snake venom, it eats ticks by the thousand, and it almost never carries rabies — its body temperature sits near 94°F, too cool for the virus. Playing dead is involuntary, a faint rather than a trick.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'the bank, the bins, and along fence lines at night', 'dcc-wildlife' ),
				'mark'  => __( 'a pointed white face, a naked RAT-LIKE tail and fifty teeth — more than any other land mammal here', 'dcc-wildlife' ),
			],
			'armadillo'          => [
				'emoji' => '🐾',
				'name'  => __( 'Nine-banded Armadillo', 'dcc-wildlife' ),
				'sci'   => 'Dasypus novemcinctus',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'certain',
				'fact'  => __( 'It walked into Florida from Texas within living memory and it is now everywhere, rooting through leaf litter for grubs with its nose down and almost no idea you are there. Every litter is four IDENTICAL young from a single egg. It can carry the leprosy bacterium, so look and do not handle.', 'dcc-wildlife' ),
				'best'  => __( 'dusk and after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'leaf litter, lawn edges and roadsides, digging noisily', 'dcc-wildlife' ),
				'mark'  => __( 'a leathery banded SHELL and a long ringed tail; it bolts straight upward when startled', 'dcc-wildlife' ),
			],
			'deer'               => [
				'emoji' => '🐾',
				'name'  => __( 'White-tailed Deer', 'dcc-wildlife' ),
				'sci'   => 'Odocoileus virginianus',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'likely',
				'fact'  => __( 'Florida’s deer are noticeably smaller than northern ones — an adaptation to heat, and the Key deer at the far end of the state are smaller still. The tail is the signal: raised and flared white, it is an alarm to every other deer in sight, which is why you usually see it going away.', 'dcc-wildlife' ),
				'best'  => __( 'dawn and dusk, most months', 'dcc-wildlife' ),
				'where' => __( 'hammock edges, pasture margins and the quiet end of the canal at first light', 'dcc-wildlife' ),
				'mark'  => __( 'a broad WHITE tail flag raised in flight; Florida animals are small for the species', 'dcc-wildlife' ),
			],
			'wildhog'            => [
				'emoji' => '🐾',
				'name'  => __( 'Wild Hog', 'dcc-wildlife' ),
				'sci'   => 'Sus scrofa',
				'group' => 'critters',
				'browse' => 'mammals',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'Brought by Spanish expeditions in the 1500s, so they have been here longer than almost anything else introduced — and they do more damage than all the rest put together. A sounder roots up ground like a rotavator, wrecking wetland edge and native plants. A big boar carries tusks and a bad temper.', 'dcc-wildlife' ),
				'best'  => __( 'dusk and after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'rooted ground and wallows along wet edges; the damage is easier to find than the animal', 'dcc-wildlife' ),
				'mark'  => __( 'ROOTED earth turned over in strips, and a blocky dark animal with a straight tail', 'dcc-wildlife' ),
			],
			'greysquirrel'       => [
				'emoji' => '🐾',
				'name'  => __( 'Eastern Grey Squirrel', 'dcc-wildlife' ),
				'sci'   => 'Sciurus carolinensis',
				'group' => 'critters',
				'browse' => 'mammals',
				'idgroup' => 'squirrels',
				'odds'  => 'certain',
				'fact'  => __( 'It buries nuts one at a time and remembers a great many of them, and it will dig a decoy hole and mime burying nothing if it thinks it is being watched. It can turn its hind feet right round to climb down a trunk head-first, which nothing else in the tree can do.', 'dcc-wildlife' ),
				'sound' => __( 'A scolding, rasping chatter with tail flicks — usually aimed at a cat, a hawk or you.', 'dcc-wildlife' ),
				'best'  => __( 'any month, all day', 'dcc-wildlife' ),
				'where' => __( 'oak canopy, lawns and every feeder', 'dcc-wildlife' ),
				'mark'  => __( 'grey with a fluffy pale-edged tail; the fox squirrel is twice the size and far darker', 'dcc-wildlife' ),
			],
			'foxsquirrel'        => [
				'emoji' => '🐾',
				'name'  => __( 'Sherman’s Fox Squirrel', 'dcc-wildlife' ),
				'sci'   => 'Sciurus niger shermani',
				'group' => 'critters',
				'browse' => 'mammals',
				'idgroup' => 'squirrels',
				'odds'  => 'occasional',
				'fact'  => __( 'Twice the size of a grey squirrel and much stranger to look at: a black face with a white nose and ears, over a body that can be anything from pale buff to charcoal. It spends far more time on the ground, in open pine and oak, and it moves at a lope rather than a scurry.', 'dcc-wildlife' ),
				'best'  => __( 'mornings, any month', 'dcc-wildlife' ),
				'where' => __( 'open pine and sandhill with big spaced trees — not dense canopy', 'dcc-wildlife' ),
				'mark'  => __( 'a BLACK face with a white nose and ears, on a squirrel twice the size of a grey', 'dcc-wildlife' ),
			],
			'flyingsquirrel'     => [
				'emoji' => '🐾',
				'name'  => __( 'Southern Flying Squirrel', 'dcc-wildlife' ),
				'sci'   => 'Glaucomys volans',
				'group' => 'critters',
				'browse' => 'mammals',
				'idgroup' => 'squirrels',
				'odds'  => 'occasional',
				'fact'  => __( 'It is probably the commonest squirrel in these woods and almost nobody sees one, because it is strictly nocturnal. It does not fly but glides on a membrane stretched between wrist and ankle, steering with its flattened tail, and can cover well over a hundred feet from a good launch.', 'dcc-wildlife' ),
				'sound' => __( 'A high, sharp, birdlike chirp from the canopy after dark — easily taken for a bird.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'oak and hickory canopy at night; listen at dusk near cavity trees', 'dcc-wildlife' ),
				'mark'  => __( 'huge black EYES, a flattened tail and a loose fold of skin along the flank', 'dcc-wildlife' ),
			],
			'marshrabbit'        => [
				'emoji' => '🐾',
				'name'  => __( 'Marsh Rabbit', 'dcc-wildlife' ),
				'sci'   => 'Sylvilagus palustris',
				'group' => 'critters',
				'browse' => 'mammals',
				'idgroup' => 'rabbits',
				'odds'  => 'likely',
				'fact'  => __( 'A rabbit that swims, and does it well — it will take to open water to escape, paddling with just eyes and nose showing, and it feeds in the shallows. Darker and more compact than a cottontail, with short rounded ears and, crucially, no white on the tail at all.', 'dcc-wildlife' ),
				'best'  => __( 'dusk and after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'marshy edges, wet grass and the bank itself, often close to water', 'dcc-wildlife' ),
				'mark'  => __( 'NO white under the tail, and brownish rather than grey — a cottontail flashes white', 'dcc-wildlife' ),
			],
			'cottontail'         => [
				'emoji' => '🐾',
				'name'  => __( 'Eastern Cottontail', 'dcc-wildlife' ),
				'sci'   => 'Sylvilagus floridanus',
				'group' => 'critters',
				'browse' => 'mammals',
				'idgroup' => 'rabbits',
				'odds'  => 'likely',
				'fact'  => __( 'The rabbit of dry ground and mown edges, and the one that shows a bright white powder-puff of a tail as it goes. Greyer and longer-eared than the marsh rabbit, with a rusty nape. It freezes first and runs late, which is why you nearly step on one before it moves.', 'dcc-wildlife' ),
				'best'  => __( 'dawn and dusk, any month', 'dcc-wildlife' ),
				'where' => __( 'lawn edges, old fields and dry roadside verges', 'dcc-wildlife' ),
				'mark'  => __( 'a bright WHITE cottontail flashing as it runs, and a rusty patch on the nape', 'dcc-wildlife' ),
			],
			'greyfox'            => [
				'emoji' => '🐾',
				'name'  => __( 'Grey Fox', 'dcc-wildlife' ),
				'sci'   => 'Urocyon cinereoargenteus',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'occasional',
				'fact'  => __( 'The only dog in the Americas that climbs trees — it has semi-retractable claws and rotating forearms, and will go up a trunk to hunt or to escape, sometimes denning in a hollow well off the ground. Grizzled grey with rusty flanks and a black stripe down the tail.', 'dcc-wildlife' ),
				'best'  => __( 'dusk and after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'hammock and brushy edges; look up as well as along', 'dcc-wildlife' ),
				'mark'  => __( 'a BLACK STRIPE down the top of the tail to a black tip; a red fox has a white tip', 'dcc-wildlife' ),
			],
			'bobcat'             => [
				'emoji' => '🐾',
				'name'  => __( 'Bobcat', 'dcc-wildlife' ),
				'sci'   => 'Lynx rufus',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'occasional',
				'fact'  => __( 'Twice the size of a house cat and built differently — long legs, a short black-tipped tail, and ear tufts. It is here far more often than it is seen: a bobcat will watch a person walk past from ten yards away without moving. Marsh rabbit is its staple on this canal.', 'dcc-wildlife' ),
				'best'  => __( 'dawn and dusk, any month', 'dcc-wildlife' ),
				'where' => __( 'hammock edges, palmetto and dense cover near open ground', 'dcc-wildlife' ),
				'mark'  => __( 'a SHORT black-tipped tail, ear tufts and spotted flanks', 'dcc-wildlife' ),
			],
			'coyote'             => [
				'emoji' => '🐾',
				'name'  => __( 'Coyote', 'dcc-wildlife' ),
				'sci'   => 'Canis latrans',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'occasional',
				'fact'  => __( 'Not native here, and not introduced either — it walked in on its own, reaching every Florida county by the 1990s after the red wolf was removed from the picture. Trying to kill them out makes them breed harder, so they are now permanent. Most of what it eats is rodents, fruit and carrion.', 'dcc-wildlife' ),
				'sound' => __( 'A group of yips and rising howls after dark that sounds like far more animals than it is.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'open edges, pasture and roadsides at night', 'dcc-wildlife' ),
				'mark'  => __( 'narrow muzzle, tall ears and a bushy tail carried DOWN when running', 'dcc-wildlife' ),
			],
			'skunk'              => [
				'emoji' => '🐾',
				'name'  => __( 'Striped Skunk', 'dcc-wildlife' ),
				'sci'   => 'Mephitis mephitis',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'occasional',
				'fact'  => __( 'The warning display comes long before the spray: it stamps its front feet, hisses, and turns to raise the tail, and an animal that has to spray has usually been ignored twice already. It can hit a target five yards off. The great horned owl eats them anyway, having almost no sense of smell.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'field edges, roadsides and gardens at night', 'dcc-wildlife' ),
				'mark'  => __( 'black with a WHITE V from the crown down the back, and a plumed tail', 'dcc-wildlife' ),
			],
			'cottonrat'          => [
				'emoji' => '🐾',
				'name'  => __( 'Hispid Cotton Rat', 'dcc-wildlife' ),
				'sci'   => 'Sigmodon hispidus',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'likely',
				'fact'  => __( 'The animal half the predators in this guide are actually living on — hawk, owl, bobcat and snake alike. It cuts little runways through dense grass, which is the easiest way to know it is there, and it breeds at a rate that keeps up with being eaten from every direction.', 'dcc-wildlife' ),
				'best'  => __( 'any month; mostly by its runways', 'dcc-wildlife' ),
				'where' => __( 'dense grass and weedy edges — look for tunnels at ground level', 'dcc-wildlife' ),
				'mark'  => __( 'a coarse grizzled grey-brown rat with a blunt face and a tail SHORTER than its body', 'dcc-wildlife' ),
			],
			'freetailedbat'      => [
				'emoji' => '🐾',
				'name'  => __( 'Brazilian Free-tailed Bat', 'dcc-wildlife' ),
				'sci'   => 'Tadarida brasiliensis',
				'group' => 'critters',
				'browse' => 'mammals',
				'idgroup' => 'bats',
				'odds'  => 'likely',
				'fact'  => __( 'The fastest bat in level flight anywhere — over ninety miles an hour has been recorded — and it hunts high, well above the trees, where most bats do not go. The tail sticks out past the membrane, which is the name. A colony under a bridge or in a roof can run to thousands.', 'dcc-wildlife' ),
				'best'  => __( 'dusk, warm months especially', 'dcc-wildlife' ),
				'where' => __( 'high over open water and lit spaces at dusk; roosts in structures', 'dcc-wildlife' ),
				'mark'  => __( 'a TAIL projecting well beyond the membrane, and long narrow wings', 'dcc-wildlife' ),
			],
			'eveningbat'         => [
				'emoji' => '🐾',
				'name'  => __( 'Evening Bat', 'dcc-wildlife' ),
				'sci'   => 'Nycticeius humeralis',
				'group' => 'critters',
				'browse' => 'mammals',
				'idgroup' => 'bats',
				'odds'  => 'likely',
				'fact'  => __( 'A small brown bat that comes out early — often before the light has properly gone, which is when most people see their first one. It roosts in tree cavities and under loose bark rather than in caves, and mothers will nurse pups that are not their own, which is rare in bats.', 'dcc-wildlife' ),
				'best'  => __( 'early dusk, warm months', 'dcc-wildlife' ),
				'where' => __( 'over the canal and lawn edges at first dusk, low and fluttering', 'dcc-wildlife' ),
				'mark'  => __( 'small and dark brown with a blunt face and short rounded ears; it flies EARLY', 'dcc-wildlife' ),
			],
			'seminolebat'        => [
				'emoji' => '🐾',
				'name'  => __( 'Seminole Bat', 'dcc-wildlife' ),
				'sci'   => 'Lasiurus seminolus',
				'group' => 'critters',
				'browse' => 'mammals',
				'idgroup' => 'bats',
				'odds'  => 'occasional',
				'fact'  => __( 'A rich mahogany-red bat that roosts in Spanish moss — it hangs in a clump looking exactly like a dead leaf, which is the whole strategy. It does not use caves or buildings at all. When cold weather comes it simply tucks deeper into the moss rather than going anywhere.', 'dcc-wildlife' ),
				'best'  => __( 'dusk, any month', 'dcc-wildlife' ),
				'where' => __( 'hanging in Spanish moss by day; over clearings and water at dusk', 'dcc-wildlife' ),
				'mark'  => __( 'deep MAHOGANY-RED fur, frosted at the tips, on a solitary bat in moss', 'dcc-wildlife' ),
			],
			'rhesus'             => [
				'emoji' => '🐾',
				'name'  => __( 'Rhesus Macaque', 'dcc-wildlife' ),
				'sci'   => 'Macaca mulatta',
				'group' => 'critters',
				'browse' => 'mammals',
				'flags' => [ 'invasive', 'danger' ],
				'odds'  => 'rare',
				'safe'  => __( 'Do not approach, feed or corner one. A bite or scratch is the real risk: some of this population carries herpes B, which is dangerous to people. Back away and give it room.', 'dcc-wildlife' ),
				'fact'  => __( 'Florida has wild monkeys because of a 1930s boat operator at Silver Springs who put six on an island to draw tourists and did not know they could swim. The troop is now in the hundreds and has spread down the Ocklawaha into Lake County — one has been photographed in Mount Dora.', 'dcc-wildlife' ),
				'best'  => __( 'daylight, any month', 'dcc-wildlife' ),
				'where' => __( 'river and hammock edges; most likely as a surprise, not a search', 'dcc-wildlife' ),
				'mark'  => __( 'a stocky brown monkey with a pink face and a short tail, on the ground or low in trees', 'dcc-wildlife' ),
			],
			'pocketgopher'       => [
				'emoji' => '🐾',
				'name'  => __( 'Southeastern Pocket Gopher', 'dcc-wildlife' ),
				'sci'   => 'Geomys pinetis',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'likely',
				'fact'  => __( 'You will see the work and not the animal. It lives its whole life underground in dry sand, pushing up neat fans of loose soil every few yards — "salamanders", in the old Florida name, from sand-mounder. The fur-lined cheek pouches it is named for turn inside out to be emptied.', 'dcc-wildlife' ),
				'best'  => __( 'any month; by its mounds, not by sight', 'dcc-wildlife' ),
				'where' => __( 'dry sandhill and open sandy ground — look for fresh fans of loose sand', 'dcc-wildlife' ),
				'mark'  => __( 'fresh FANS of loose sand pushed up in a line; the animal itself is almost never above ground', 'dcc-wildlife' ),
			],
			'floridamouse'       => [
				'emoji' => '🐾',
				'name'  => __( 'Florida Mouse', 'dcc-wildlife' ),
				'sci'   => 'Podomys floridanus',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'rare',
				'fact'  => __( 'The only mammal species found nowhere on Earth but Florida, and it lives in somebody else’s house: it digs its own side chamber off a gopher tortoise burrow and depends on them. Lose the tortoise and you lose this mouse. Large ears, big eyes, and a distinctly rusty wash along the flanks.', 'dcc-wildlife' ),
				'best'  => __( 'after dark; rarely seen at all', 'dcc-wildlife' ),
				'where' => __( 'scrub and sandhill, in and around gopher tortoise burrows — not the canal', 'dcc-wildlife' ),
				'mark'  => __( 'large ears and ORANGE-RUSTY flanks; it has five foot-pads where other mice here have six', 'dcc-wildlife' ),
			],
			'muskrat'            => [
				'emoji' => '🐾',
				'name'  => __( 'Round-tailed Muskrat', 'dcc-wildlife' ),
				'sci'   => 'Neofiber alleni',
				'group' => 'critters',
				'browse' => 'mammals',
				'odds'  => 'rare',
				'fact'  => __( 'Florida’s own muskrat, found almost nowhere else, and it builds a dome of woven grass the size of a football out in the marsh with the entrance underwater. The tail is round in cross-section rather than flattened, which is the name and the difference from its northern cousin.', 'dcc-wildlife' ),
				'best'  => __( 'any month; by its houses, not by sight', 'dcc-wildlife' ),
				'where' => __( 'dense marsh grass — look for a grass dome in standing water', 'dcc-wildlife' ),
				'mark'  => __( 'a football-sized DOME of woven grass in the marsh; the animal is small, dark and rarely seen', 'dcc-wildlife' ),
			],
			'scarletking'        => [
				'emoji' => '🦎',
				'name'  => __( 'Scarlet Kingsnake', 'dcc-wildlife' ),
				'sci'   => 'Lampropeltis elapsoides',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'coralmimics',
				'odds'  => 'occasional',
				'fact'  => __( 'A harmless snake that has spent a long time pretending to be a coral snake, and it is good at it — red, black and yellow rings and a small size. The order of the rings is the whole difference, and the rhyme is worth knowing before you need it: on this one, red touches BLACK.', 'dcc-wildlife' ),
				'best'  => __( 'after rain and at night, spring through autumn', 'dcc-wildlife' ),
				'where' => __( 'under bark and logs in pine and hammock; rarely out in the open by day', 'dcc-wildlife' ),
				'mark'  => __( 'red bands touching BLACK, and a RED snout; a coral snake has red touching yellow and a black snout', 'dcc-wildlife' ),
			],
			'hognose'            => [
				'emoji' => '🦎',
				'name'  => __( 'Eastern Hognose Snake', 'dcc-wildlife' ),
				'sci'   => 'Heterodon platirhinos',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'occasional',
				'fact'  => __( 'The best actor in these woods. Cornered, it flattens its neck like a cobra, hisses and strikes with its mouth shut; if that fails it writhes, voids, rolls belly-up and plays dead with its tongue out — and will right itself and flop over again if you turn it back. Harmless throughout.', 'dcc-wildlife' ),
				'best'  => __( 'daytime, spring and autumn', 'dcc-wildlife' ),
				'where' => __( 'dry sandy ground and open pine, hunting toads', 'dcc-wildlife' ),
				'mark'  => __( 'an upturned SHOVEL of a snout, and a neck flattened into a hood when alarmed', 'dcc-wildlife' ),
			],
			'coachwhip'          => [
				'emoji' => '🦎',
				'name'  => __( 'Eastern Coachwhip', 'dcc-wildlife' ),
				'sci'   => 'Masticophis flagellum flagellum',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'occasional',
				'fact'  => __( 'The fastest snake here, and built like the whip it is named for: a dark head shading back to a pale braided-looking tail. It hunts by sight with its head held up off the ground, which almost nothing else does. It does not chase or whip people — that is an old story with nothing behind it.', 'dcc-wildlife' ),
				'best'  => __( 'hot days, spring through autumn', 'dcc-wildlife' ),
				'where' => __( 'dry sandhill, scrub and open sandy edges, moving fast', 'dcc-wildlife' ),
				'mark'  => __( 'a DARK head fading to a pale tail that looks like plaited leather', 'dcc-wildlife' ),
			],
			'crayfishsnake'      => [
				'emoji' => '🦎',
				'name'  => __( 'Striped Crayfish Snake', 'dcc-wildlife' ),
				'sci'   => 'Liodytes alleni',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'occasional',
				'fact'  => __( 'A glossy brown snake that eats almost nothing but freshly moulted crayfish, and has the teeth and jaw muscles for exactly that. It lives down in dense water weed and is far more often found than seen — usually under debris at the edge. Harmless, and it rarely even tries to bite.', 'dcc-wildlife' ),
				'best'  => __( 'after dark and after rain, warm months', 'dcc-wildlife' ),
				'where' => __( 'dense water weed, water hyacinth mats and marshy edges', 'dcc-wildlife' ),
				'mark'  => __( 'a glossy dark brown snake with three faint dark STRIPES and a yellowish belly', 'dcc-wildlife' ),
			],
			'sandskink'          => [
				'emoji' => '🦎',
				'name'  => __( 'Sand Skink', 'dcc-wildlife' ),
				'sci'   => 'Plestiodon reynoldsi',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'skinks',
				'odds'  => 'rare',
				'fact'  => __( 'It has all but given up being a lizard. The legs are vestigial — two tiny toes in front, one behind — and it "swims" through loose sand below the surface, hunting by feeling vibration. Its tracks are a wavy line on the sand with nothing that made them in sight. Federally threatened.', 'dcc-wildlife' ),
				'best'  => __( 'any month; by its tracks', 'dcc-wildlife' ),
				'where' => __( 'ancient dry sand ridges in scrub — a trip, and never the canal bank', 'dcc-wildlife' ),
				'mark'  => __( 'a wavy S-shaped TRACK on bare sand; the animal is pale, nearly limbless and underground', 'dcc-wildlife' ),
			],
			'wormlizard'         => [
				'emoji' => '🦎',
				'name'  => __( 'Florida Worm Lizard', 'dcc-wildlife' ),
				'sci'   => 'Rhineura floridana',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'rare',
				'fact'  => __( 'Neither a worm nor a lizard: an amphisbaenian, a separate lineage altogether, and this is the only one in the United States. Pink, ringed, eyeless and legless, it tunnels head-first through sandy soil. People meet it in a flowerbed after heavy rain and file it firmly under earthworm.', 'dcc-wildlife' ),
				'best'  => __( 'after heavy rain, any month', 'dcc-wildlife' ),
				'where' => __( 'sandy soil and gardens; it surfaces when the ground floods', 'dcc-wildlife' ),
				'mark'  => __( 'PINK and ringed like an earthworm, but with a hard shovel-shaped head and scales', 'dcc-wildlife' ),
			],
			'scrublizard'        => [
				'emoji' => '🦎',
				'name'  => __( 'Florida Scrub Lizard', 'dcc-wildlife' ),
				'sci'   => 'Sceloporus woodi',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'rare',
				'fact'  => __( 'Found nowhere on Earth but Florida’s dry sand ridges, and it will not cross a patch of dense vegetation — which is why a road or a housing lot cuts a population in half permanently. A brown lizard with a dark stripe down each side, doing press-ups on an open patch of white sand.', 'dcc-wildlife' ),
				'best'  => __( 'sunny days, spring through autumn', 'dcc-wildlife' ),
				'where' => __( 'open white sand in scrub, on the ground or a low stump', 'dcc-wildlife' ),
				'mark'  => __( 'a brown lizard with a dark BROWN STRIPE along each side, on bare sand', 'dcc-wildlife' ),
			],
			'tropicalgecko'      => [
				'emoji' => '🦎',
				'name'  => __( 'Tropical House Gecko', 'dcc-wildlife' ),
				'sci'   => 'Hemidactylus mabouia',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'geckos',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'The gecko on the porch light, and it is not from here: an African species that reached Florida through the Caribbean and now owns most lit walls in the state. It has displaced the earlier introduced geckos almost everywhere, and it eats what the light brings in.', 'dcc-wildlife' ),
				'sound' => __( 'A soft repeated chirp or clicking from a wall after dark.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'walls, porch lights and outbuildings after dark', 'dcc-wildlife' ),
				'mark'  => __( 'mottled grey-brown with faint chevrons and a bumpy tail; large eyes with no eyelids', 'dcc-wildlife' ),
			],
			'indopacificgecko'   => [
				'emoji' => '🦎',
				'name'  => __( 'Indo-Pacific Gecko', 'dcc-wildlife' ),
				'sci'   => 'Hemidactylus garnotii',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'geckos',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'Every one of these is female. The species reproduces by parthenogenesis — clones, no males anywhere — so a single animal arriving in a shipment can found a whole population, which is exactly how it got here. Dark grey-brown by day, almost translucent pale at night, with an orange belly.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'walls, porch lights and buildings after dark, often beside the tropical gecko', 'dcc-wildlife' ),
				'mark'  => __( 'an ORANGE-YELLOW belly, and a flattened tail with a fine serrated edge', 'dcc-wildlife' ),
			],
			'bluegill'           => [
				'emoji' => '🐟',
				'name'  => __( 'Bluegill', 'dcc-wildlife' ),
				'sci'   => 'Lepomis macrochirus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'breams',
				'odds'  => 'certain',
				'fact'  => __( 'The fish every child on this dock catches first, and the one most of the bass are eating. In late spring the males sweep out saucer-shaped nests in the shallows, dozens side by side in a colony, and guard them fiercely — a bed of them is visible from the bank as pale circles on the bottom.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer, in the shallows', 'dcc-wildlife' ),
				'where' => __( 'shallow weedy edges, dock pilings and around structure', 'dcc-wildlife' ),
				'mark'  => __( 'a solid BLACK ear-flap with no red or pale edge, and a dark blotch on the rear dorsal fin', 'dcc-wildlife' ),
			],
			'redear'             => [
				'emoji' => '🐟',
				'name'  => __( 'Redear Sunfish', 'dcc-wildlife' ),
				'sci'   => 'Lepomis microlophus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'breams',
				'odds'  => 'likely',
				'fact'  => __( 'The shellcracker, and the name is literal — it has crushing plates in its throat and lives largely on snails and small clams, which is why it grows fat where other sunfish do not. It beds earlier than the bluegill, often around the first full moon of spring, and runs noticeably bigger.', 'dcc-wildlife' ),
				'best'  => __( 'spring, on the beds', 'dcc-wildlife' ),
				'where' => __( 'sandy shallows over shell and snail beds, deeper than bluegill', 'dcc-wildlife' ),
				'mark'  => __( 'a bright RED or orange edge to the black ear-flap; the bluegill’s flap is plain black', 'dcc-wildlife' ),
			],
			'spottedsunfish'     => [
				'emoji' => '🐟',
				'name'  => __( 'Spotted Sunfish', 'dcc-wildlife' ),
				'sci'   => 'Lepomis punctatus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'smallsunfish',
				'odds'  => 'likely',
				'fact'  => __( 'The stumpknocker, and that is exactly how it feeds — working along submerged logs and cypress knees, picking insects off the wood. Small, tough and everywhere along this canal. Rows of black or red spots run along the flanks, one on every scale, which nothing else here has.', 'dcc-wildlife' ),
				'best'  => __( 'any month, along wood', 'dcc-wildlife' ),
				'where' => __( 'submerged logs, cypress knees and undercut banks', 'dcc-wildlife' ),
				'mark'  => __( 'rows of small dark SPOTS along the flank, one per scale', 'dcc-wildlife' ),
			],
			'warmouth'           => [
				'emoji' => '🐟',
				'name'  => __( 'Warmouth', 'dcc-wildlife' ),
				'sci'   => 'Lepomis gulosus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'breams',
				'odds'  => 'likely',
				'fact'  => __( 'A sunfish that behaves like a small bass: a huge mouth, an ambush habit, and a bad temper. Mottled brown and olive, with red eyes and three or four dark streaks radiating back from them across the cheek. It holds in the thickest cover it can find and does not travel far.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in heavy cover', 'dcc-wildlife' ),
				'where' => __( 'stumps, weed beds and undercut banks with deep cover', 'dcc-wildlife' ),
				'mark'  => __( 'RED eyes with dark streaks radiating back across the cheek, and a very large mouth', 'dcc-wildlife' ),
			],
			'redbreast'          => [
				'emoji' => '🐟',
				'name'  => __( 'Redbreast Sunfish', 'dcc-wildlife' ),
				'sci'   => 'Lepomis auritus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'breams',
				'odds'  => 'likely',
				'fact'  => __( 'The river sunfish, and the one with the ridiculous ear-flap — long, narrow, entirely black, and on a big male it can be longer than his eye is wide. The belly is a deep orange-red. It prefers moving water, so the canal itself suits it better than the open lakes do.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer, in moving water', 'dcc-wildlife' ),
				'where' => __( 'flowing stretches, undercut banks and around current', 'dcc-wildlife' ),
				'mark'  => __( 'a very LONG narrow all-black ear-flap, longer than it is deep', 'dcc-wildlife' ),
			],
			'bluespotted'        => [
				'emoji' => '🐟',
				'name'  => __( 'Bluespotted Sunfish', 'dcc-wildlife' ),
				'sci'   => 'Enneacanthus gloriosus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'smallsunfish',
				'odds'  => 'occasional',
				'fact'  => __( 'A sunfish that stays the size of a large coin, scattered with iridescent blue spangles that catch the light like sequins. It lives deep in weed in quiet backwaters and acid water, and it is almost never caught on a hook — you find it with a dip net or not at all.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in dense weed', 'dcc-wildlife' ),
				'where' => __( 'quiet tannic backwaters and dense weed, away from open water', 'dcc-wildlife' ),
				'mark'  => __( 'tiny, dark, and spangled with iridescent BLUE spots', 'dcc-wildlife' ),
			],
			'dollarsunfish'      => [
				'emoji' => '🐟',
				'name'  => __( 'Dollar Sunfish', 'dcc-wildlife' ),
				'sci'   => 'Lepomis marginatus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'smallsunfish',
				'odds'  => 'occasional',
				'fact'  => __( 'Small, round and about the size of a silver dollar, which is the name. Wavy blue-green lines run across the cheek and gill cover, and the breeding male carries orange spotting over a dark body. It likes slow tannic water with a soft bottom and plenty of overhead cover.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in slow tannic water', 'dcc-wildlife' ),
				'where' => __( 'slow shaded backwaters with soft bottom and cover', 'dcc-wildlife' ),
				'mark'  => __( 'a small round sunfish with WAVY blue lines across the cheek and a short rounded ear-flap', 'dcc-wildlife' ),
			],
			'crappie'            => [
				'emoji' => '🐟',
				'name'  => __( 'Black Crappie', 'dcc-wildlife' ),
				'sci'   => 'Pomoxis nigromaculatus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'breams',
				'odds'  => 'certain',
				'fact'  => __( 'Speckled perch — specks — and the winter fish of this chain. When the water cools they school up and move shallow to spawn, and half the boats on Lake Dora in January are after them. A paper-thin mouth that tears easily, which is why so many come off at the side of the boat.', 'dcc-wildlife' ),
				'best'  => __( 'winter and early spring', 'dcc-wildlife' ),
				'where' => __( 'brush piles, dock pilings and open water in schools', 'dcc-wildlife' ),
				'mark'  => __( 'irregular black SPECKLING all over a silvery slab-sided fish, with seven or eight dorsal spines', 'dcc-wildlife' ),
			],
			'sunshinebass'       => [
				'emoji' => '🐟',
				'name'  => __( 'Sunshine Bass', 'dcc-wildlife' ),
				'sci'   => 'Morone chrysops × Morone saxatilis',
				'group' => 'critters',
				'browse' => 'fish',
				'odds'  => 'occasional',
				'fact'  => __( 'A hatchery cross between a white bass and a striped bass, stocked into Florida water because it grows fast and fights hard and cannot establish itself. It chases schools of shad in open water — when gulls start diving over a boil in the middle of the lake, this is usually what is underneath.', 'dcc-wildlife' ),
				'best'  => __( 'cooler months, in open water', 'dcc-wildlife' ),
				'where' => __( 'open water over the lake basin, chasing shad schools', 'dcc-wildlife' ),
				'mark'  => __( 'silvery with broken dark STRIPES along the side, and a deep body — the stripes stagger, not run straight', 'dcc-wildlife' ),
			],
			'floridagar'         => [
				'emoji' => '🐟',
				'name'  => __( 'Florida Gar', 'dcc-wildlife' ),
				'sci'   => 'Lepisosteus platyrhinus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'longfish',
				'odds'  => 'certain',
				'fact'  => __( 'A long torpedo of a fish hanging motionless just under the surface, armoured in interlocking diamond scales so hard that early settlers used them as arrowheads. It gulps air from a lung-like swim bladder, which is how it survives water with no oxygen in it at all. The eggs are toxic.', 'dcc-wildlife' ),
				'best'  => __( 'any month, near the surface', 'dcc-wildlife' ),
				'where' => __( 'hanging still just under the surface in weedy shallows', 'dcc-wildlife' ),
				'mark'  => __( 'dark ROUND SPOTS over the whole body, head included, and a snout shorter than a longnose gar’s', 'dcc-wildlife' ),
			],
			'longnosegar'        => [
				'emoji' => '🐟',
				'name'  => __( 'Longnose Gar', 'dcc-wildlife' ),
				'sci'   => 'Lepisosteus osseus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'longfish',
				'odds'  => 'occasional',
				'fact'  => __( 'The same ancient armoured design with a beak on the front — the snout is long, narrow and twice the length of the head, lined with needle teeth. It takes fish sideways with a slash of that snout and turns them to swallow head-first. It has been doing this essentially unchanged for a very long time.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, near the surface', 'dcc-wildlife' ),
				'where' => __( 'open water and channel edges, often near the surface', 'dcc-wildlife' ),
				'mark'  => __( 'a very LONG narrow beak, twice the length of the head; the Florida gar’s is short and broad', 'dcc-wildlife' ),
			],
			'bowfin'             => [
				'emoji' => '🐟',
				'name'  => __( 'Bowfin', 'dcc-wildlife' ),
				'sci'   => 'Amia ocellata',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'longfish',
				'odds'  => 'likely',
				'fact'  => __( 'The mudfish, and a genuine living fossil — the last survivor of a lineage that goes back well past the dinosaurs. It breathes air, survives water nothing else can, and fights harder than anything its size. The male guards the young in a dense black ball that moves as one.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in thick cover', 'dcc-wildlife' ),
				'where' => __( 'weed beds, backwaters and stagnant shallows', 'dcc-wildlife' ),
				'mark'  => __( 'a long undulating DORSAL FIN running most of the back, and a black eyespot at the tail base on the male', 'dcc-wildlife' ),
			],
			'channelcatfish'     => [
				'emoji' => '🐟',
				'name'  => __( 'Channel Catfish', 'dcc-wildlife' ),
				'sci'   => 'Ictalurus punctatus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'catfish',
				'odds'  => 'likely',
				'fact'  => __( 'The whiskers are the point: a catfish is covered in taste buds — well over a hundred thousand of them, over the whole body, not just the barbels — so it is effectively swimming through a sense of taste. It finds food in water too dark and muddy for any eye to work in.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, warm months', 'dcc-wildlife' ),
				'where' => __( 'deeper channels and holes, feeding at night', 'dcc-wildlife' ),
				'mark'  => __( 'a deeply FORKED tail and scattered dark spots on a slender silvery body', 'dcc-wildlife' ),
			],
			'whitecatfish'       => [
				'emoji' => '🐟',
				'name'  => __( 'White Catfish', 'dcc-wildlife' ),
				'sci'   => 'Ameiurus catus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'catfish',
				'odds'  => 'occasional',
				'fact'  => __( 'The middle catfish of this chain — bigger than a bullhead, smaller than a channel cat, and the one that takes a bait fished on the bottom off a dock more often than either. A broad head, a moderately forked tail, and chin barbels that are white rather than dark.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, on the bottom', 'dcc-wildlife' ),
				'where' => __( 'deeper edges and channel bottoms near structure', 'dcc-wildlife' ),
				'mark'  => __( 'a MODERATELY forked tail with a broad head, and WHITE chin barbels', 'dcc-wildlife' ),
			],
			'brownbullhead'      => [
				'emoji' => '🐟',
				'name'  => __( 'Brown Bullhead', 'dcc-wildlife' ),
				'sci'   => 'Ameiurus nebulosus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'catfish',
				'odds'  => 'likely',
				'fact'  => __( 'A small dark catfish of soft muddy bottoms, mottled brown and built like a tadpole. The barbels under the chin are dark, which separates it from the yellow bullhead beside it. It tolerates low oxygen and warm stagnant water that would kill most things, and it will eat nearly anything.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, any month', 'dcc-wildlife' ),
				'where' => __( 'soft mud bottoms in backwaters and canal edges', 'dcc-wildlife' ),
				'mark'  => __( 'a SQUARE-ended tail and DARK chin barbels on a mottled brown fish', 'dcc-wildlife' ),
			],
			'yellowbullhead'     => [
				'emoji' => '🐟',
				'name'  => __( 'Yellow Bullhead', 'dcc-wildlife' ),
				'sci'   => 'Ameiurus natalis',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'catfish',
				'odds'  => 'likely',
				'fact'  => __( 'The bullhead that will take a bait in broad daylight when nothing else is moving, and the one children catch off a dock at midday. Yellowish-brown, unmottled, with a rounded tail — and the chin barbels are unmistakably WHITE, which settles it against the brown bullhead every time.', 'dcc-wildlife' ),
				'best'  => __( 'any month, day or night', 'dcc-wildlife' ),
				'where' => __( 'shallow weedy edges, docks and soft bottoms', 'dcc-wildlife' ),
				'mark'  => __( 'WHITE chin barbels and a rounded tail on a plain yellow-brown fish', 'dcc-wildlife' ),
			],
			'pickerel'           => [
				'emoji' => '🐟',
				'name'  => __( 'Chain Pickerel', 'dcc-wildlife' ),
				'sci'   => 'Esox niger',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'longfish',
				'odds'  => 'occasional',
				'fact'  => __( 'A small pike, and it looks like one: a duckbill snout full of teeth and a green flank overlaid with a dark chain-link pattern. It sits absolutely still in the weed and takes something passing with a lunge nobody sees coming. In cool water it feeds when nothing else will.', 'dcc-wildlife' ),
				'best'  => __( 'cooler months, in weed edges', 'dcc-wildlife' ),
				'where' => __( 'weed edges and lily pads in clear shallow water', 'dcc-wildlife' ),
				'mark'  => __( 'a dark CHAIN-LINK pattern over green flanks, and a duckbill snout', 'dcc-wildlife' ),
			],
			'goldenshiner'       => [
				'emoji' => '🐟',
				'name'  => __( 'Golden Shiner', 'dcc-wildlife' ),
				'sci'   => 'Notemigonus crysoleucas',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'minnows',
				'odds'  => 'certain',
				'fact'  => __( 'The big native minnow of this chain, and the classic Florida bass bait — wild-caught shiners fished under a float account for most of the biggest bass taken here. Deep-bodied, brassy gold, with a sharp keel along the belly behind the pelvic fins that no other minnow here has.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in the shallows', 'dcc-wildlife' ),
				'where' => __( 'weedy shallows and lake edges in loose schools', 'dcc-wildlife' ),
				'mark'  => __( 'a brassy GOLD deep body and a fleshy KEEL along the belly; the lateral line dips sharply', 'dcc-wildlife' ),
			],
			'brooksilverside'    => [
				'emoji' => '🐟',
				'name'  => __( 'Brook Silverside', 'dcc-wildlife' ),
				'sci'   => 'Labidesthes sicculus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'minnows',
				'odds'  => 'likely',
				'fact'  => __( 'A sliver of glass at the very surface, so transparent you see it by the bright silver stripe along its side and nothing else. It skips clear of the water to escape, and lives barely a year — almost the whole population dies off after spawning and is replaced.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, at the surface', 'dcc-wildlife' ),
				'where' => __( 'the top inch of open water, in loose schools on calm evenings', 'dcc-wildlife' ),
				'mark'  => __( 'nearly TRANSPARENT with a bright silver side-stripe, and a long beak-like snout', 'dcc-wildlife' ),
			],
			'threadfinshad'      => [
				'emoji' => '🐟',
				'name'  => __( 'Threadfin Shad', 'dcc-wildlife' ),
				'sci'   => 'Dorosoma petenense',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'shads',
				'odds'  => 'certain',
				'fact'  => __( 'The fuel of this chain. Vast schools of them feed every bass, crappie and osprey on the water, and a cold snap can kill them off by the acre — a winter shad kill washing up on a bank is normal, not a pollution event. The last dorsal ray draws out into a long thread.', 'dcc-wildlife' ),
				'best'  => __( 'any month; kills after cold snaps', 'dcc-wildlife' ),
				'where' => __( 'open water in dense schools, often dimpling the surface', 'dcc-wildlife' ),
				'mark'  => __( 'a long THREAD trailing from the last dorsal ray, and a yellowish tail', 'dcc-wildlife' ),
			],
			'gizzardshad'        => [
				'emoji' => '🐟',
				'name'  => __( 'Gizzard Shad', 'dcc-wildlife' ),
				'sci'   => 'Dorosoma cepedianum',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'shads',
				'odds'  => 'likely',
				'fact'  => __( 'The same shape grown large — big enough that only an adult bass, a gar or an osprey can handle one. It filters plankton through fine gill rakers and grinds it in a muscular gizzard-like stomach, which is the name. The blunt snout overhangs a small mouth set right underneath.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in open water', 'dcc-wildlife' ),
				'where' => __( 'open water and the lake basin, in schools', 'dcc-wildlife' ),
				'mark'  => __( 'a BLUNT overhanging snout with the mouth underneath, and a dark shoulder spot', 'dcc-wildlife' ),
			],
			'seminolekillifish'  => [
				'emoji' => '🐟',
				'name'  => __( 'Seminole Killifish', 'dcc-wildlife' ),
				'sci'   => 'Fundulus seminolis',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'topminnows',
				'odds'  => 'likely',
				'fact'  => __( 'A stout killifish found only in Florida, hanging in small groups over clean sand in the shallows. The male carries rows of dark dashes along the flank; the female is plainer and barred. It is a common live bait here, and one of the fish a wading heron is actually stabbing at.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, over clean sand', 'dcc-wildlife' ),
				'where' => __( 'sandy shallows and shorelines, in small groups near the surface', 'dcc-wildlife' ),
				'mark'  => __( 'rows of dark DASHES along a stout pale flank, on a blunt-headed surface fish', 'dcc-wildlife' ),
			],
			'goldentopminnow'    => [
				'emoji' => '🐟',
				'name'  => __( 'Golden Topminnow', 'dcc-wildlife' ),
				'sci'   => 'Fundulus chrysotus',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'topminnows',
				'odds'  => 'occasional',
				'fact'  => __( 'A small fish that lives in the top inch of still water, with an upturned mouth built to take insects off the surface film. The male is scattered with glittering gold flecks and crimson spots when he is in condition. It never goes deep, so a dip net at the edge is how you meet it.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, at the surface', 'dcc-wildlife' ),
				'where' => __( 'still weedy margins and backwaters, right at the surface', 'dcc-wildlife' ),
				'mark'  => __( 'a flattened head with an UPTURNED mouth, and gold flecking over the flank', 'dcc-wildlife' ),
			],
			'leastkillifish'     => [
				'emoji' => '🐟',
				'name'  => __( 'Least Killifish', 'dcc-wildlife' ),
				'sci'   => 'Heterandria formosa',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'topminnows',
				'odds'  => 'likely',
				'fact'  => __( 'Among the smallest fish in North America — a mature female is about the size of a fingernail and a male smaller still. It bears live young rather than laying eggs, and does it a few at a time over weeks rather than all at once, which almost nothing else does.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in dense weed', 'dcc-wildlife' ),
				'where' => __( 'dense weed and vegetation right at the edge, in still shallow water', 'dcc-wildlife' ),
				'mark'  => __( 'FINGERNAIL-sized, olive, with a dark side-stripe and a dark spot on the dorsal fin', 'dcc-wildlife' ),
			],
			'mosquitofish'       => [
				'emoji' => '🐟',
				'name'  => __( 'Eastern Mosquitofish', 'dcc-wildlife' ),
				'sci'   => 'Gambusia holbrooki',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'topminnows',
				'odds'  => 'certain',
				'fact'  => __( 'The small fish in every ditch, puddle and pond edge in Florida, bearing live young and eating mosquito larvae — which got it shipped around the world as a control measure, where it has generally become a pest instead. The female is much larger than the male and carries a dark belly patch.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in shallow edges', 'dcc-wildlife' ),
				'where' => __( 'every shallow edge, ditch and puddle — the commonest fish here', 'dcc-wildlife' ),
				'mark'  => __( 'a small pale fish with an UPTURNED mouth; the female has a dark pregnancy patch', 'dcc-wildlife' ),
			],
			'sailfinmolly'       => [
				'emoji' => '🐟',
				'name'  => __( 'Sailfin Molly', 'dcc-wildlife' ),
				'sci'   => 'Poecilia latipinna',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'topminnows',
				'odds'  => 'likely',
				'fact'  => __( 'The male carries a dorsal fin like a raised sail, far out of proportion to him, and displays it side-on to females and rivals. It grazes algae off surfaces and can live in water from fresh to fully salt. In poor oxygen it skims the very top film, where the water meets the air.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in shallow edges', 'dcc-wildlife' ),
				'where' => __( 'shallow weedy edges and brackish reaches, grazing surfaces', 'dcc-wildlife' ),
				'mark'  => __( 'a huge SAIL of a dorsal fin on the male; rows of spots along a stout olive body', 'dcc-wildlife' ),
			],
			'chubsucker'         => [
				'emoji' => '🐟',
				'name'  => __( 'Lake Chubsucker', 'dcc-wildlife' ),
				'sci'   => 'Erimyzon sucetta',
				'group' => 'critters',
				'browse' => 'fish',
				'odds'  => 'occasional',
				'fact'  => __( 'A quiet bottom fish with a small downturned sucker mouth, working over soft sediment for tiny invertebrates. Young ones carry a bold black stripe from snout to tail that fades with age into a pattern of dark blotches. It needs clear vegetated water and drops out where that goes.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, over soft bottom', 'dcc-wildlife' ),
				'where' => __( 'clear weedy shallows with soft bottom, near the bed', 'dcc-wildlife' ),
				'mark'  => __( 'a small DOWNTURNED sucker mouth; young fish carry a bold dark side-stripe', 'dcc-wildlife' ),
			],
			'eel'                => [
				'emoji' => '🐟',
				'name'  => __( 'American Eel', 'dcc-wildlife' ),
				'sci'   => 'Anguilla rostrata',
				'group' => 'critters',
				'browse' => 'fish',
				'odds'  => 'occasional',
				'fact'  => __( 'Every eel in this canal was born in the Sargasso Sea, drifted here as a transparent leaf-shaped larva, and will go back there once to spawn and die. Nobody has ever seen them spawn. They can cross wet grass overland between waters, which is how they turn up in ponds with no inlet.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, warm months', 'dcc-wildlife' ),
				'where' => __( 'under banks, in debris and mud; moving at night', 'dcc-wildlife' ),
				'mark'  => __( 'a long snake-like body with a continuous fin around the tail, and a small lower jaw jutting forward', 'dcc-wildlife' ),
			],
			'bluetilapia'        => [
				'emoji' => '🐟',
				'name'  => __( 'Blue Tilapia', 'dcc-wildlife' ),
				'sci'   => 'Oreochromis aureus',
				'group' => 'critters',
				'browse' => 'fish',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'An African cichlid, in Florida since the 1960s, and now in most of this chain. It digs crater-shaped nests in the shallows and defends them, and the female broods the eggs in her mouth. Great mats of them spawning in spring make the bottom look pitted with craters.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer, on the nests', 'dcc-wildlife' ),
				'where' => __( 'shallow sandy flats — look for a field of round craters on the bottom', 'dcc-wildlife' ),
				'mark'  => __( 'round CRATER nests dug in the shallows; a deep-bodied grey fish with a red-edged tail', 'dcc-wildlife' ),
			],
			'armoredcatfish'     => [
				'emoji' => '🐟',
				'name'  => __( 'Suckermouth Armored Catfish', 'dcc-wildlife' ),
				'sci'   => 'Pterygoplichthys spp.',
				'group' => 'critters',
				'browse' => 'fish',
				'idgroup' => 'catfish',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'The aquarium plec, released and thriving — armour-plated, with a rasping sucker mouth for grazing algae off anything hard. It tunnels nest burrows into the bank, which collapses them, and it is the animal behind a lot of undercut shoreline on this chain. Almost nothing native will eat it.', 'dcc-wildlife' ),
				'best'  => __( 'any month; burrows visible in the bank', 'dcc-wildlife' ),
				'where' => __( 'grazing hard surfaces; nest burrows drilled into soft banks', 'dcc-wildlife' ),
				'mark'  => __( 'bony ARMOUR plates over the whole body and a flat rasping sucker mouth underneath', 'dcc-wildlife' ),
			],
			'grasscarp'          => [
				'emoji' => '🐟',
				'name'  => __( 'Grass Carp', 'dcc-wildlife' ),
				'sci'   => 'Ctenopharyngodon idella',
				'group' => 'critters',
				'browse' => 'fish',
				'odds'  => 'occasional',
				'fact'  => __( 'A large Asian carp stocked on purpose to eat hydrilla, and every one released in Florida is a sterile triploid — checked individually before stocking, so they cannot breed. A big one browses weed like a cow. Where they have been stocked heavily the submerged plants can vanish altogether.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, browsing weed beds', 'dcc-wildlife' ),
				'where' => __( 'over submerged weed beds in the lakes; permitted stockings only', 'dcc-wildlife' ),
				'mark'  => __( 'a very large torpedo-shaped carp with BIG scales and no barbels at all', 'dcc-wildlife' ),
			],
			'greendarner'        => [
				'emoji' => '🐛',
				'name'  => __( 'Common Green Darner', 'dcc-wildlife' ),
				'sci'   => 'Anax junius',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'darners',
				'odds'  => 'certain',
				'fact'  => __( 'One of the few dragonflies that migrates, and it does it in generations — the ones that leave in autumn are not the ones that come back. A green thorax, a blue abdomen on the male, and a bullseye mark on the forehead. It hawks insects on the wing and can take them out of the air behind it.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, over open water', 'dcc-wildlife' ),
				'where' => __( 'patrolling back and forth over the canal and lawn edges', 'dcc-wildlife' ),
				'mark'  => __( 'a green thorax over a BLUE abdomen, with a dark bullseye on the forehead', 'dcc-wildlife' ),
			],
			'bluedasher'         => [
				'emoji' => '🐛',
				'name'  => __( 'Blue Dasher', 'dcc-wildlife' ),
				'sci'   => 'Pachydiplax longipennis',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'blueskimmers',
				'odds'  => 'certain',
				'fact'  => __( 'The commonest dragonfly on this dock, and the one that lets you get closest — it perches on a stem with its wings angled down and forward and simply watches you. The male dusts over powder blue with age; the face is metallic green and the eyes turquoise. It obelisks in heat, pointing its abdomen at the sun.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, all day', 'dcc-wildlife' ),
				'where' => __( 'perched on stems and rails at the water’s edge, returning to the same spot', 'dcc-wildlife' ),
				'mark'  => __( 'a powder-BLUE abdomen with a metallic green face, and dark patches at the wing bases', 'dcc-wildlife' ),
			],
			'pondhawk'           => [
				'emoji' => '🐛',
				'name'  => __( 'Eastern Pondhawk', 'dcc-wildlife' ),
				'sci'   => 'Erythemis simplicicollis',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'blueskimmers',
				'odds'  => 'certain',
				'fact'  => __( 'A dragonfly that eats other dragonflies, including its own kind, and will take prey nearly its own size. The female and young male are bright grass green with black bands; the mature male turns entirely chalky blue, so the two look like different species sitting side by side.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, all day', 'dcc-wildlife' ),
				'where' => __( 'perched flat on the ground, docks and bare surfaces near water', 'dcc-wildlife' ),
				'mark'  => __( 'female bright GRASS GREEN with black bands; mature male entirely chalky blue', 'dcc-wildlife' ),
			],
			'halloweenpennant'   => [
				'emoji' => '🐛',
				'name'  => __( 'Halloween Pennant', 'dcc-wildlife' ),
				'sci'   => 'Celithemis eponina',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'wingpatterns',
				'odds'  => 'likely',
				'fact'  => __( 'Amber wings banded in brown, and it perches at the very tip of a grass stem and flaps in the wind like a flag — which is the name. In a breeze it flutters rather than flies, more like a butterfly than a dragonfly, and it hunts well away from water in open grass.', 'dcc-wildlife' ),
				'best'  => __( 'summer, in open grass', 'dcc-wildlife' ),
				'where' => __( 'the tips of tall grass stems in open ground, flapping in the wind', 'dcc-wildlife' ),
				'mark'  => __( 'AMBER wings crossed by brown bands, held out flat while it swings on a stem tip', 'dcc-wildlife' ),
			],
			'greatblueskimmer'   => [
				'emoji' => '🐛',
				'name'  => __( 'Great Blue Skimmer', 'dcc-wildlife' ),
				'sci'   => 'Libellula vibrans',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'blueskimmers',
				'odds'  => 'likely',
				'fact'  => __( 'The largest skimmer in North America, and it likes shade — a wooded seep or a shaded ditch rather than open water, which is unusual. The mature male is a soft powdery blue with a white face and startling blue-grey eyes. It perches horizontally on a twig and returns to it.', 'dcc-wildlife' ),
				'best'  => __( 'summer, in shaded water', 'dcc-wildlife' ),
				'where' => __( 'shaded seeps, wooded ditches and canal edges under cover', 'dcc-wildlife' ),
				'mark'  => __( 'very large and powdery blue with a WHITE face and blue-grey eyes', 'dcc-wildlife' ),
			],
			'fourspotted'        => [
				'emoji' => '🐛',
				'name'  => __( 'Four-spotted Pennant', 'dcc-wildlife' ),
				'sci'   => 'Brachymesia gravida',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'wingpatterns',
				'odds'  => 'likely',
				'fact'  => __( 'Black-bodied, with a single conspicuous white spot on the leading edge of each of the four wings — four spots, and they are what you see from a distance as it hangs on a stem tip over open water. The male darkens to near-black with age and the wingtips smoke over.', 'dcc-wildlife' ),
				'best'  => __( 'summer, over open water', 'dcc-wildlife' ),
				'where' => __( 'stem tips and bare twigs over open water, often in numbers', 'dcc-wildlife' ),
				'mark'  => __( 'FOUR white spots, one on the front edge of each wing, on a dark body', 'dcc-wildlife' ),
			],
			'needhams'           => [
				'emoji' => '🐛',
				'name'  => __( 'Needham’s Skimmer', 'dcc-wildlife' ),
				'sci'   => 'Libellula needhami',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'wingpatterns',
				'odds'  => 'likely',
				'fact'  => __( 'A warm orange dragonfly of marsh edges, with amber running along the leading edge of each wing and a thin dark line down the top of the abdomen. It is close enough to the golden-winged skimmer that the two are regularly confused; this is the one on this kind of still, weedy water.', 'dcc-wildlife' ),
				'best'  => __( 'summer, at marsh edges', 'dcc-wildlife' ),
				'where' => __( 'weedy still water and marsh edges, perched on emergent stems', 'dcc-wildlife' ),
				'mark'  => __( 'ORANGE body and legs with amber along the front edge of the wings', 'dcc-wildlife' ),
			],
			'saddlebags'         => [
				'emoji' => '🐛',
				'name'  => __( 'Carolina Saddlebags', 'dcc-wildlife' ),
				'sci'   => 'Tramea carolina',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'darners',
				'odds'  => 'likely',
				'fact'  => __( 'It glides more than it flaps, and the dark patches at the base of the hindwings look exactly like a pair of saddlebags on a bird seen from below. The body is deep red. It can stay airborne for long stretches without a wingbeat, riding warm air over open ground.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, gliding overhead', 'dcc-wildlife' ),
				'where' => __( 'gliding over open water, lawns and clearings, rarely perching', 'dcc-wildlife' ),
				'mark'  => __( 'dark SADDLEBAG patches at the base of the hindwings, on a red-bodied glider', 'dcc-wildlife' ),
			],
			'amberwing'          => [
				'emoji' => '🐛',
				'name'  => __( 'Eastern Amberwing', 'dcc-wildlife' ),
				'sci'   => 'Perithemis tenera',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'wingpatterns',
				'odds'  => 'certain',
				'fact'  => __( 'One of the smallest dragonflies in North America, barely an inch long, with wings of solid amber. It mimics a wasp — it pumps its abdomen up and down and waggles it while perched, which is what a wasp does and what a dragonfly does not, and predators leave it alone.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, at the water’s edge', 'dcc-wildlife' ),
				'where' => __( 'low stems and twigs right at the water’s edge', 'dcc-wildlife' ),
				'mark'  => __( 'TINY, with entirely amber wings, and it waggles its abdomen like a wasp', 'dcc-wildlife' ),
			],
			'rambursforktail'    => [
				'emoji' => '🐛',
				'name'  => __( 'Rambur’s Forktail', 'dcc-wildlife' ),
				'sci'   => 'Ischnura ramburii',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'damselflies',
				'odds'  => 'certain',
				'fact'  => __( 'A damselfly so slender it reads as a flying needle, holding its wings closed above its back where a dragonfly holds them out flat. The male has a green thorax and a blue tail-light at the tip. Some females mimic the male’s colours exactly, apparently to be left alone by them.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, low in vegetation', 'dcc-wildlife' ),
				'where' => __( 'low in weed and grass at the water’s edge, flying weakly', 'dcc-wildlife' ),
				'mark'  => __( 'wings held CLOSED over the back, a needle-thin body, and a blue tip to the tail', 'dcc-wildlife' ),
			],
			'citrineforktail'    => [
				'emoji' => '🐛',
				'name'  => __( 'Citrine Forktail', 'dcc-wildlife' ),
				'sci'   => 'Ischnura hastata',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'damselflies',
				'odds'  => 'likely',
				'fact'  => __( 'The smallest damselfly in North America, and orange-yellow rather than blue — unusual for a forktail. It is also the only dragonfly or damselfly known to reproduce without males anywhere: the population in the Azores is entirely female and clonal, though the Florida ones do it the ordinary way.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in short vegetation', 'dcc-wildlife' ),
				'where' => __( 'short grass and low weed near water, very low down', 'dcc-wildlife' ),
				'mark'  => __( 'TINY and orange-yellow, with the wing stigma set back from the wingtip', 'dcc-wildlife' ),
			],
			'zebralongwing'      => [
				'emoji' => '🐛',
				'name'  => __( 'Zebra Longwing', 'dcc-wildlife' ),
				'sci'   => 'Heliconius charithonia',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'longwings',
				'odds'  => 'certain',
				'fact'  => __( 'Florida’s state butterfly since 1996, and the only butterfly known to eat pollen as well as nectar — which is why it lives about six months instead of a few weeks. Dozens roost together on the same twig every night and return to it. The flight is slow, floating and unmistakable.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in shaded edges', 'dcc-wildlife' ),
				'where' => __( 'shaded hammock edges and passionvine tangles, flying slowly', 'dcc-wildlife' ),
				'mark'  => __( 'long narrow black wings striped in pale YELLOW, on a slow floating flight', 'dcc-wildlife' ),
			],
			'gulffritillary'     => [
				'emoji' => '🐛',
				'name'  => __( 'Gulf Fritillary', 'dcc-wildlife' ),
				'sci'   => 'Dione vanillae',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'longwings',
				'odds'  => 'certain',
				'fact'  => __( 'Bright orange above and, underneath, a row of long silver streaks like spilled mercury that you only see when it closes its wings. Its caterpillars eat passionvine and nothing else. It migrates in numbers down the Florida peninsula in autumn, sometimes in a steady stream.', 'dcc-wildlife' ),
				'best'  => __( 'any month; heaviest in autumn', 'dcc-wildlife' ),
				'where' => __( 'open sunny ground, passionvine and flower beds', 'dcc-wildlife' ),
				'mark'  => __( 'elongated SILVER streaks on the underside of the hindwing, over bright orange above', 'dcc-wildlife' ),
			],
			'monarch'            => [
				'emoji' => '🐛',
				'name'  => __( 'Monarch', 'dcc-wildlife' ),
				'sci'   => 'Danaus plexippus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'danaids',
				'odds'  => 'likely',
				'fact'  => __( 'The famous migration is only half the story here: Florida also holds monarchs that never migrate at all and breed through the winter, which is why you can see one in January. The caterpillar takes up milkweed toxins and the adult keeps them, and its colours advertise the fact.', 'dcc-wildlife' ),
				'best'  => __( 'any month; heaviest in autumn', 'dcc-wildlife' ),
				'where' => __( 'milkweed, open sunny ground and flower beds', 'dcc-wildlife' ),
				'mark'  => __( 'ORANGE with heavy black veins and a black border with two rows of white dots', 'dcc-wildlife' ),
			],
			'queen'              => [
				'emoji' => '🐛',
				'name'  => __( 'Queen', 'dcc-wildlife' ),
				'sci'   => 'Danaus gilippus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'danaids',
				'odds'  => 'likely',
				'fact'  => __( 'The monarch’s darker cousin, and in Florida it is often the commoner of the two. Deep chestnut-brown rather than orange, with white dots scattered across the forewing and much finer black veining. It uses the same milkweeds and carries the same defence.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, on milkweed and flowers', 'dcc-wildlife' ),
				'where' => __( 'milkweed patches, open sunny ground and roadsides', 'dcc-wildlife' ),
				'mark'  => __( 'deep CHESTNUT-brown with white dots on the forewing and faint veins — not heavy black ones', 'dcc-wildlife' ),
			],
			'viceroy'            => [
				'emoji' => '🐛',
				'name'  => __( 'Viceroy', 'dcc-wildlife' ),
				'sci'   => 'Limenitis archippus floridensis',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'danaids',
				'odds'  => 'likely',
				'fact'  => __( 'For a century this was taught as the textbook harmless copycat of the monarch. It is not: the viceroy is unpalatable in its own right, so the two are honest partners in the same warning signal rather than one cheating. The Florida form is dark, and copies the queen rather than the monarch.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, near willows', 'dcc-wildlife' ),
				'where' => __( 'willow and wet edges — closer to water than a monarch usually is', 'dcc-wildlife' ),
				'mark'  => __( 'a black line crossing the hindwing veins, which no monarch or queen has', 'dcc-wildlife' ),
			],
			'tigerswallowtail'   => [
				'emoji' => '🐛',
				'name'  => __( 'Eastern Tiger Swallowtail', 'dcc-wildlife' ),
				'sci'   => 'Papilio glaucus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'swallowtails',
				'odds'  => 'likely',
				'fact'  => __( 'A big yellow butterfly striped like a tiger, sailing along the treeline. The females come in two forms: one yellow like the male, one entirely black, and the black one is a copy of the poisonous pipevine swallowtail. Both forms can come out of the same brood.', 'dcc-wildlife' ),
				'best'  => __( 'spring through autumn, along treelines', 'dcc-wildlife' ),
				'where' => __( 'treelines, flower beds and damp patches on paths', 'dcc-wildlife' ),
				'mark'  => __( 'YELLOW with four black tiger stripes down the forewing; the dark female shows them as shadows', 'dcc-wildlife' ),
			],
			'giantswallowtail'   => [
				'emoji' => '🐛',
				'name'  => __( 'Giant Swallowtail', 'dcc-wildlife' ),
				'sci'   => 'Heraclides cresphontes',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'swallowtails',
				'odds'  => 'likely',
				'fact'  => __( 'The largest butterfly in North America, and its caterpillar is a masterpiece — it looks exactly like a fresh bird dropping, and when prodded it everts a forked orange gland that smells strongly of citrus. It lives on citrus leaves, which is why growers call it the orange dog.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in citrus and open ground', 'dcc-wildlife' ),
				'where' => __( 'citrus, hammock edges and open sunny ground', 'dcc-wildlife' ),
				'mark'  => __( 'dark brown crossed by a broad band of YELLOW spots forming an X on the forewing', 'dcc-wildlife' ),
			],
			'palamedes'          => [
				'emoji' => '🐛',
				'name'  => __( 'Palamedes Swallowtail', 'dcc-wildlife' ),
				'sci'   => 'Papilio palamedes',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'swallowtails',
				'odds'  => 'likely',
				'fact'  => __( 'The swamp swallowtail, and it is tied to red bay and sweetbay — which puts it in trouble, because laurel wilt has been killing red bays across Florida since 2002. Where the bays go, this butterfly follows. Black with a broad yellow band and a yellow stripe under the hindwing.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in swamp and bayhead', 'dcc-wildlife' ),
				'where' => __( 'swamp, bayhead and shaded wet woods with bay trees', 'dcc-wildlife' ),
				'mark'  => __( 'a single unbroken YELLOW stripe along the underside of the hindwing', 'dcc-wildlife' ),
			],
			'blackswallowtail'   => [
				'emoji' => '🐛',
				'name'  => __( 'Black Swallowtail', 'dcc-wildlife' ),
				'sci'   => 'Papilio polyxenes asterius',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'swallowtails',
				'odds'  => 'likely',
				'fact'  => __( 'The one that eats the parsley, dill and fennel in a garden, and the caterpillar is worth finding: green, banded black and yellow, and it throws out a forked orange horn behind its head that smells sharply of rancid herbs when you disturb it. The male carries a broad yellow band.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in gardens and open ground', 'dcc-wildlife' ),
				'where' => __( 'carrot-family plants, gardens, fennel and open sunny ground', 'dcc-wildlife' ),
				'mark'  => __( 'black with a band of yellow spots and an ORANGE eyespot with a black pupil at the hindwing corner', 'dcc-wildlife' ),
			],
			'zebraswallowtail'   => [
				'emoji' => '🐛',
				'name'  => __( 'Zebra Swallowtail', 'dcc-wildlife' ),
				'sci'   => 'Eurytides marcellus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'swallowtails',
				'odds'  => 'occasional',
				'fact'  => __( 'Striped black and white with the longest tails of any swallowtail here, trailing behind it like streamers. Its caterpillars eat pawpaw and nothing else, so you find it where pawpaw grows. Spring-brood adults are smaller and paler than the summer ones, which throws people.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer, near pawpaw', 'dcc-wildlife' ),
				'where' => __( 'pawpaw thickets and open woodland edges, flying fast and low', 'dcc-wildlife' ),
				'mark'  => __( 'triangular wings striped BLACK AND WHITE, with very long trailing tails', 'dcc-wildlife' ),
			],
			'spicebush'          => [
				'emoji' => '🐛',
				'name'  => __( 'Spicebush Swallowtail', 'dcc-wildlife' ),
				'sci'   => 'Papilio troilus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'swallowtails',
				'odds'  => 'occasional',
				'fact'  => __( 'The caterpillar is the reason to look: it has two huge false eyespots on a swollen front end and it rests in a folded leaf, so what looks out at you is a small green snake. The adult is black with a blue-green wash across the hindwing and a double row of pale spots.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in shaded woods', 'dcc-wildlife' ),
				'where' => __( 'shaded woodland with red bay and sassafras', 'dcc-wildlife' ),
				'mark'  => __( 'a blue-green WASH across the hindwing, and an extra orange spot where the black swallowtail has none', 'dcc-wildlife' ),
			],
			'cloudlesssulphur'   => [
				'emoji' => '🐛',
				'name'  => __( 'Cloudless Sulphur', 'dcc-wildlife' ),
				'sci'   => 'Phoebis sennae',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'sulphurs',
				'odds'  => 'certain',
				'fact'  => __( 'A big plain lemon-yellow butterfly that never seems to stop — it flies fast, high and straight, and in autumn streams of them move south down the peninsula. It almost never opens its wings at rest, so the underside with its faint pink-rimmed spots is what you get to see.', 'dcc-wildlife' ),
				'best'  => __( 'any month; heaviest in autumn', 'dcc-wildlife' ),
				'where' => __( 'open sunny ground, hedges and flower beds, flying fast and straight', 'dcc-wildlife' ),
				'mark'  => __( 'plain LEMON yellow with no black margin, and a fast direct flight', 'dcc-wildlife' ),
			],
			'sleepyorange'       => [
				'emoji' => '🐛',
				'name'  => __( 'Sleepy Orange', 'dcc-wildlife' ),
				'sci'   => 'Eurema nicippe',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'sulphurs',
				'odds'  => 'likely',
				'fact'  => __( 'Deep orange above with a ragged black border, and a dull brick-red underside that turns much darker in the winter brood — so the same species looks different in January. The name comes from a small dark dash on the forewing that somebody once decided looked like a closed eye.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on open ground', 'dcc-wildlife' ),
				'where' => __( 'open sunny ground, roadsides and sennas', 'dcc-wildlife' ),
				'mark'  => __( 'deep ORANGE above with a ragged black border; the winter form is much darker beneath', 'dcc-wildlife' ),
			],
			'barredyellow'       => [
				'emoji' => '🐛',
				'name'  => __( 'Barred Yellow', 'dcc-wildlife' ),
				'sci'   => 'Eurema daira',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'sulphurs',
				'odds'  => 'likely',
				'fact'  => __( 'A small yellow butterfly that flies low and weakly over open grass, and the seasonal difference is the striking thing: summer adults are pale beneath, winter ones are a deep rusty brick. The male carries a black bar along the inner edge of the forewing, which is the name.', 'dcc-wildlife' ),
				'best'  => __( 'any month, low over grass', 'dcc-wildlife' ),
				'where' => __( 'short grass, roadsides and open sandy ground, flying low', 'dcc-wildlife' ),
				'mark'  => __( 'small and yellow, with a black BAR along the inner edge of the male’s forewing', 'dcc-wildlife' ),
			],
			'southernwhite'      => [
				'emoji' => '🐛',
				'name'  => __( 'Great Southern White', 'dcc-wildlife' ),
				'sci'   => 'Ascia monuste',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'sulphurs',
				'odds'  => 'likely',
				'fact'  => __( 'A white butterfly with turquoise-tipped antennae — an oddly beautiful detail on an otherwise plain insect, and the quickest way to name it. It migrates along the coast in large numbers, and the females come in two forms, one white and one smoky grey-brown.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in open ground', 'dcc-wildlife' ),
				'where' => __( 'open sunny ground, coastal edges and gardens', 'dcc-wildlife' ),
				'mark'  => __( 'TURQUOISE tips to the antennae on a white butterfly with a dark zigzag wing edge', 'dcc-wildlife' ),
			],
			'whitepeacock'       => [
				'emoji' => '🐛',
				'name'  => __( 'White Peacock', 'dcc-wildlife' ),
				'sci'   => 'Anartia jatrophae',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'brushfoots',
				'odds'  => 'certain',
				'fact'  => __( 'A pale butterfly of wet open ground, patterned in faint tan and grey with two dark eyespots on each wing and a scalloped orange edge. It holds a small territory on a damp path and returns to the same patch after chasing something off. Very much a Florida insect.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on damp open ground', 'dcc-wildlife' ),
				'where' => __( 'damp paths, ditch edges and wet open ground', 'dcc-wildlife' ),
				'mark'  => __( 'PALE whitish-grey with dark eyespots and a scalloped orange-brown border', 'dcc-wildlife' ),
			],
			'buckeye'            => [
				'emoji' => '🐛',
				'name'  => __( 'Common Buckeye', 'dcc-wildlife' ),
				'sci'   => 'Junonia coenia',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'brushfoots',
				'odds'  => 'certain',
				'fact'  => __( 'Six eyespots, two of them big enough to startle a small bird into hesitating, which is the entire point — a bird that pecks at a wing mark leaves the butterfly alive. It basks flat on bare ground with its wings spread and flies low and fast when disturbed.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on bare open ground', 'dcc-wildlife' ),
				'where' => __( 'bare paths, roadsides and open sandy ground, basking flat', 'dcc-wildlife' ),
				'mark'  => __( 'two large EYESPOTS on each forewing over a white bar and two orange bars', 'dcc-wildlife' ),
			],
			'redadmiral'         => [
				'emoji' => '🐛',
				'name'  => __( 'Red Admiral', 'dcc-wildlife' ),
				'sci'   => 'Vanessa atalanta',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'brushfoots',
				'odds'  => 'likely',
				'fact'  => __( 'Dark wings crossed by a single bold orange band, and a butterfly with a reputation for boldness — it will land on a person, and males hold a sunny patch in the afternoon and fly at anything that enters it, including birds. Its caterpillars live on nettles, folded into a leaf tent.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in sunny clearings', 'dcc-wildlife' ),
				'where' => __( 'sunny clearings, paths and nettle patches; often on the ground', 'dcc-wildlife' ),
				'mark'  => __( 'a bold ORANGE-RED band slashing across a dark forewing, and white spots at the tip', 'dcc-wildlife' ),
			],
			'phaoncrescent'      => [
				'emoji' => '🐛',
				'name'  => __( 'Phaon Crescent', 'dcc-wildlife' ),
				'sci'   => 'Phyciodes phaon',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'brushfoots',
				'odds'  => 'likely',
				'fact'  => __( 'A small orange-and-black butterfly of damp open ground, and the mark that names it is a pale CREAM band across the middle of the forewing where its close relatives have orange. Its caterpillars eat fogfruit, a low creeping plant of lawn edges and damp paths.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on damp ground', 'dcc-wildlife' ),
				'where' => __( 'damp lawn edges, paths and ditch margins, flying low', 'dcc-wildlife' ),
				'mark'  => __( 'a pale CREAM band across the middle of the forewing, not orange', 'dcc-wildlife' ),
			],
			'ceraunusblue'       => [
				'emoji' => '🐛',
				'name'  => __( 'Ceraunus Blue', 'dcc-wildlife' ),
				'sci'   => 'Hemiargus ceraunus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'gossamer',
				'odds'  => 'likely',
				'fact'  => __( 'A butterfly the size of a thumbnail, powder blue above on the male and grey-brown beneath, with a black eyespot at the corner of the hindwing. It flies a few inches off the ground over open sand and legumes, and shuts its wings the instant it lands.', 'dcc-wildlife' ),
				'best'  => __( 'any month, low over open ground', 'dcc-wildlife' ),
				'where' => __( 'open sandy ground, roadsides and low legumes', 'dcc-wildlife' ),
				'mark'  => __( 'THUMBNAIL-sized; grey beneath with a black spot at the hindwing corner, powder blue above', 'dcc-wildlife' ),
			],
			'grayhairstreak'     => [
				'emoji' => '🐛',
				'name'  => __( 'Gray Hairstreak', 'dcc-wildlife' ),
				'sci'   => 'Strymon melinus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'gossamer',
				'odds'  => 'likely',
				'fact'  => __( 'At rest it rubs its hindwings together so the little tails and the orange eyespot beside them wave about — a false head, and birds peck at the wrong end. Plenty of them carry a neat bite out of that corner, which is the trick having worked exactly as intended.', 'dcc-wildlife' ),
				'best'  => __( 'any month, on flowers', 'dcc-wildlife' ),
				'where' => __( 'flower heads, open ground and roadsides', 'dcc-wildlife' ),
				'mark'  => __( 'slate GREY beneath with a white-edged black line, an orange spot and thread-thin tails', 'dcc-wildlife' ),
			],
			'longtailedskipper'  => [
				'emoji' => '🐛',
				'name'  => __( 'Long-tailed Skipper', 'dcc-wildlife' ),
				'sci'   => 'Urbanus proteus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'skippers',
				'odds'  => 'certain',
				'fact'  => __( 'A skipper with long tails and an iridescent blue-green body and wing bases — much more striking than a skipper has any right to be. The caterpillar is the bean leafroller, which folds a bean leaf into a tube and lives inside it, and gardeners here know it well.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in gardens and edges', 'dcc-wildlife' ),
				'where' => __( 'beans, legumes, gardens and sunny edges', 'dcc-wildlife' ),
				'mark'  => __( 'iridescent BLUE-GREEN on the body and wing bases, with long tails', 'dcc-wildlife' ),
			],
			'fieryskipper'       => [
				'emoji' => '🐛',
				'name'  => __( 'Fiery Skipper', 'dcc-wildlife' ),
				'sci'   => 'Hylephila phyleus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'skippers',
				'odds'  => 'certain',
				'fact'  => __( 'The small orange skipper bouncing over every lawn in Florida, and the one whose caterpillars eat the grass — it is a minor turf pest and a major nectar visitor at the same time. It perches with the forewings and hindwings at different angles, which skippers do and butterflies do not.', 'dcc-wildlife' ),
				'best'  => __( 'any month, over lawns', 'dcc-wildlife' ),
				'where' => __( 'lawns, flower beds and grassy edges, flying in bursts', 'dcc-wildlife' ),
				'mark'  => __( 'small and ORANGE with scattered dark spots beneath, and very short antennae with hooked tips', 'dcc-wildlife' ),
			],
			'luna'               => [
				'emoji' => '🐛',
				'name'  => __( 'Luna Moth', 'dcc-wildlife' ),
				'sci'   => 'Actias luna',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'moths',
				'odds'  => 'occasional',
				'fact'  => __( 'A pale green moth the size of a hand with long twisted tails, and it has no mouth at all — the adult cannot eat, lives about a week, and spends it doing nothing but finding a mate. The tails spin as it flies and scramble a bat’s echolocation, which is what they are for.', 'dcc-wildlife' ),
				'best'  => __( 'spring and summer nights', 'dcc-wildlife' ),
				'where' => __( 'around lights at night near hardwood; sweetgum and hickory', 'dcc-wildlife' ),
				'mark'  => __( 'huge and pale GREEN with long twisted tails and a transparent eyespot on each wing', 'dcc-wildlife' ),
			],
			'imperialmoth'       => [
				'emoji' => '🐛',
				'name'  => __( 'Imperial Moth', 'dcc-wildlife' ),
				'sci'   => 'Eacles imperialis',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'moths',
				'odds'  => 'occasional',
				'fact'  => __( 'A big yellow moth blotched with purple-brown, and the amount of blotching varies so much that two on the same porch light can look unrelated. Like the luna it does not feed as an adult. The caterpillar is enormous, hairy and comes in green or brown, and feeds on pine and hardwood.', 'dcc-wildlife' ),
				'best'  => __( 'summer nights', 'dcc-wildlife' ),
				'where' => __( 'around lights at night near pine and hardwood', 'dcc-wildlife' ),
				'mark'  => __( 'large and YELLOW blotched with purple-brown, with a stout furry body', 'dcc-wildlife' ),
			],
			'tersasphinx'        => [
				'emoji' => '🐛',
				'name'  => __( 'Tersa Sphinx', 'dcc-wildlife' ),
				'sci'   => 'Xylophanes tersa',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'moths',
				'odds'  => 'occasional',
				'fact'  => __( 'Built like a fighter jet — a sharply pointed abdomen and narrow swept wings — and it hovers at flowers after dark like a hummingbird, feeding on the wing with a long tongue. At rest by day on a trunk it is a streamlined wedge of pale brown and almost invisible.', 'dcc-wildlife' ),
				'best'  => __( 'warm nights, at flowers', 'dcc-wildlife' ),
				'where' => __( 'hovering at tubular flowers after dark; resting on trunks by day', 'dcc-wildlife' ),
				'mark'  => __( 'a sharply POINTED abdomen and narrow swept-back wings, hovering at flowers', 'dcc-wildlife' ),
			],
			'waspmoth'           => [
				'emoji' => '🐛',
				'name'  => __( 'Oleander Moth', 'dcc-wildlife' ),
				'sci'   => 'Syntomeida epilais',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'moths',
				'odds'  => 'likely',
				'fact'  => __( 'A day-flying moth pretending to be a wasp: iridescent blue-black spotted with white, with a bright red tip to the abdomen, drifting slowly around oleander in full sunlight. Its orange caterpillars strip oleander bushes, and both stages carry the plant’s toxins.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, by day around oleander', 'dcc-wildlife' ),
				'where' => __( 'oleander bushes and plantings, flying slowly in daylight', 'dcc-wildlife' ),
				'mark'  => __( 'iridescent BLUE-BLACK with white spots and a RED tip to the abdomen, flying by day', 'dcc-wildlife' ),
			],
			'islandapplesnail'   => [
				'emoji' => '🐛',
				'name'  => __( 'Island Apple Snail', 'dcc-wildlife' ),
				'sci'   => 'Pomacea maculata',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'snails',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'The big introduced apple snail, and the pink egg clusters above the waterline on stems and walls are its signature — the native snail lays pale, and far fewer. It grows too large for a young limpkin or snail kite to handle, so it both feeds and starves them depending on size.', 'dcc-wildlife' ),
				'best'  => __( 'any month; eggs in the warm months', 'dcc-wildlife' ),
				'where' => __( 'stems, dock pilings and walls just above the waterline', 'dcc-wildlife' ),
				'mark'  => __( 'a bright PINK cluster of eggs above the water; the native apple snail’s are pale and larger-grained', 'dcc-wildlife' ),
			],
			'asianclam'          => [
				'emoji' => '🐛',
				'name'  => __( 'Asian Clam', 'dcc-wildlife' ),
				'sci'   => 'Corbicula fluminea',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'snails',
				'flags' => [ 'invasive' ],
				'odds'  => 'likely',
				'fact'  => __( 'Small, pale and ridged, and in some stretches the bottom is paved with them. It arrived in North America in the 1930s, spreads as microscopic juveniles in moving water, and blocks intake pipes in numbers that cost utilities a fortune. Empty shells make up most of the "sand" on some banks.', 'dcc-wildlife' ),
				'best'  => __( 'any month', 'dcc-wildlife' ),
				'where' => __( 'shallow sandy bottoms and the shell drift along banks', 'dcc-wildlife' ),
				'mark'  => __( 'a small pale triangular shell with strong evenly spaced RIDGES, often in drifts', 'dcc-wildlife' ),
			],
			'crayfish'           => [
				'emoji' => '🐛',
				'name'  => __( 'Everglades Crayfish', 'dcc-wildlife' ),
				'sci'   => 'Procambarus alleni',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'crustaceans',
				'odds'  => 'certain',
				'fact'  => __( 'The blue crayfish of Florida, and a proper blue in mature males rather than a hint of one. It burrows down to the water table in the dry season and plugs the hole with a chimney of mud pellets, waiting for rain. Half the herons, limpkins and watersnakes here are eating them.', 'dcc-wildlife' ),
				'best'  => __( 'any month; burrows in dry spells', 'dcc-wildlife' ),
				'where' => __( 'shallow weedy water, and mud chimneys on the bank in dry spells', 'dcc-wildlife' ),
				'mark'  => __( 'a vivid BLUE crayfish in mature males, and mud-pellet chimneys where it has burrowed', 'dcc-wildlife' ),
			],
			'grassshrimp'        => [
				'emoji' => '🐛',
				'name'  => __( 'Grass Shrimp', 'dcc-wildlife' ),
				'sci'   => 'Palaemon paludosus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'crustaceans',
				'odds'  => 'likely',
				'fact'  => __( 'A transparent freshwater shrimp barely more than an inch long, and so clear you see its gut and its black eyes and little else. Thousands live in the weed beds, and they are what a great many small fish are actually eating. Sweep a net through pickerelweed and you will have some.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in weed beds', 'dcc-wildlife' ),
				'where' => __( 'dense submerged weed and the roots of floating plants', 'dcc-wildlife' ),
				'mark'  => __( 'a fully TRANSPARENT shrimp with visible black eyes, about an inch long', 'dcc-wildlife' ),
			],
			'goldensilk'         => [
				'emoji' => '🐛',
				'name'  => __( 'Golden Silk Orbweaver', 'dcc-wildlife' ),
				'sci'   => 'Trichonephila clavipes',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'spiders',
				'odds'  => 'certain',
				'fact'  => __( 'The banana spider, and the web across the trail in September is hers — a metre or more across, spun in silk that really is gold in the light and strong enough to have been woven into cloth. The male beside her is a fraction of her size. She is not dangerous.', 'dcc-wildlife' ),
				'best'  => __( 'late summer and autumn', 'dcc-wildlife' ),
				'where' => __( 'across trails and gaps between trees, at head height', 'dcc-wildlife' ),
				'mark'  => __( 'a large yellow-and-silver spider with TUFTS of black hair on the legs, in a golden web', 'dcc-wildlife' ),
			],
			'spinyorbweaver'     => [
				'emoji' => '🐛',
				'name'  => __( 'Spiny Orbweaver', 'dcc-wildlife' ),
				'sci'   => 'Gasteracantha cancriformis',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'spiders',
				'odds'  => 'certain',
				'fact'  => __( 'The crab-like spider in a small web by the porch: a hard white or yellow shell studded with six red spines, looking more like a piece of costume jewellery than an animal. It adds tufts of silk along the web anchor lines, apparently so birds see the web and do not fly through it.', 'dcc-wildlife' ),
				'best'  => __( 'autumn especially; any month', 'dcc-wildlife' ),
				'where' => __( 'small webs between shrubs, eaves and porch corners', 'dcc-wildlife' ),
				'mark'  => __( 'a hard flattened WHITE or yellow shell with six red SPINES around the edge', 'dcc-wildlife' ),
			],
			'greenlynx'          => [
				'emoji' => '🐛',
				'name'  => __( 'Green Lynx Spider', 'dcc-wildlife' ),
				'sci'   => 'Peucetia viridans',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'spiders',
				'odds'  => 'likely',
				'fact'  => __( 'A bright green spider that hunts on flowers rather than building a web, leaping on whatever lands. She guards her egg sac fiercely and can SPIT venom several inches at a face that gets too close — which is unusual, and not dangerous, but startling when it happens.', 'dcc-wildlife' ),
				'best'  => __( 'late summer and autumn', 'dcc-wildlife' ),
				'where' => __( 'on flower heads and shrub tips, motionless and waiting', 'dcc-wildlife' ),
				'mark'  => __( 'BRIGHT GREEN with long spiny translucent legs, sitting openly on a flower', 'dcc-wildlife' ),
			],
			'regaljumper'        => [
				'emoji' => '🐛',
				'name'  => __( 'Regal Jumping Spider', 'dcc-wildlife' ),
				'sci'   => 'Phidippus regius',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'spiders',
				'odds'  => 'likely',
				'fact'  => __( 'The largest jumping spider in eastern North America, and the one that turns to look at you — jumping spiders have genuinely good eyesight and will track a moving finger. The male is black with white markings; the female is grey or orange. It stalks like a cat and pounces.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, in daylight', 'dcc-wildlife' ),
				'where' => __( 'walls, fences, palmetto and sunny surfaces, hunting actively', 'dcc-wildlife' ),
				'mark'  => __( 'a stocky spider with two huge forward-facing EYES that follows your movement', 'dcc-wildlife' ),
			],
			'carolinamantis'     => [
				'emoji' => '🐛',
				'name'  => __( 'Carolina Mantis', 'dcc-wildlife' ),
				'sci'   => 'Stagmomantis carolina',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'hunters',
				'odds'  => 'likely',
				'fact'  => __( 'The native mantis here, smaller and stockier than the introduced Chinese one, with wings that stop short of the end of the female’s abdomen. It is the only insect that can turn its head to look behind it, and it has a single ear in the middle of its chest, tuned to bat calls.', 'dcc-wildlife' ),
				'best'  => __( 'late summer and autumn', 'dcc-wildlife' ),
				'where' => __( 'on shrubs, flower heads and grass stems, motionless', 'dcc-wildlife' ),
				'mark'  => __( 'a mantis whose wings reach only about two-thirds down the female’s abdomen', 'dcc-wildlife' ),
			],
			'walkingstick'       => [
				'emoji' => '🐛',
				'name'  => __( 'Two-striped Walkingstick', 'dcc-wildlife' ),
				'sci'   => 'Anisomorpha buprestoides',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'hunters',
				'flags' => [ 'danger' ],
				'odds'  => 'likely',
				'safe'  => __( 'Do not pick one up or bring your face near it. It sprays an irritant chemical over a foot, aimed at eyes, and a hit causes intense pain and temporary blindness. If it reaches an eye, flush with water at once and get medical help.', 'dcc-wildlife' ),
				'fact'  => __( 'Usually seen as a pair, the small male riding on the much larger female for days on end. It is the one insect here that can genuinely hurt you: a pair of glands behind the head fire a terpene spray a foot or more, accurately, at a face — and in an eye it is severe.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, on low vegetation', 'dcc-wildlife' ),
				'where' => __( 'low vegetation, palmetto and tree trunks, often in pairs', 'dcc-wildlife' ),
				'mark'  => __( 'a brown stick insect with two pale STRIPES down the back, almost always in a mated pair', 'dcc-wildlife' ),
			],
			'lubber'             => [
				'emoji' => '🐛',
				'name'  => __( 'Eastern Lubber Grasshopper', 'dcc-wildlife' ),
				'sci'   => 'Romalea microptera',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'hunters',
				'odds'  => 'certain',
				'fact'  => __( 'Enormous, slow and completely unbothered, because it does not need to hurry — it is toxic, advertises the fact in yellow and red, and hisses and froths a foul foam when handled. Birds that eat one are sick and remember. The young are jet black with a red stripe and look like a different insect.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, on the ground and low plants', 'dcc-wildlife' ),
				'where' => __( 'open ground, lawn edges and low plants, walking rather than flying', 'dcc-wildlife' ),
				'mark'  => __( 'very large and slow, YELLOW and black with short red wings that cannot carry it', 'dcc-wildlife' ),
			],
			'hercules'           => [
				'emoji' => '🐛',
				'name'  => __( 'Eastern Hercules Beetle', 'dcc-wildlife' ),
				'sci'   => 'Dynastes tityus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'beetles',
				'odds'  => 'occasional',
				'fact'  => __( 'The heaviest beetle in the United States, and the male carries a pair of horns half his own length which he uses to lever rival males off a branch. The wing covers are pale olive flecked with black, and they darken if the beetle gets damp — the same animal changes colour with humidity.', 'dcc-wildlife' ),
				'best'  => __( 'summer nights', 'dcc-wildlife' ),
				'where' => __( 'around lights at night; larvae in rotting hardwood', 'dcc-wildlife' ),
				'mark'  => __( 'huge, pale olive flecked black, with a long pincer-like HORN on the male’s thorax', 'dcc-wildlife' ),
			],
			'tortoisebeetle'     => [
				'emoji' => '🐛',
				'name'  => __( 'Palmetto Tortoise Beetle', 'dcc-wildlife' ),
				'sci'   => 'Hemisphaerota cyanea',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'beetles',
				'odds'  => 'likely',
				'fact'  => __( 'A small domed metallic-blue beetle on saw palmetto, and its defence is extraordinary: each foot carries around ten thousand fine bristles, each wetted with oil, and it clamps down so hard that a predator would need to pull with about sixty times the beetle’s own weight to shift it.', 'dcc-wildlife' ),
				'best'  => __( 'warm months, on saw palmetto', 'dcc-wildlife' ),
				'where' => __( 'saw palmetto fronds — almost nowhere else', 'dcc-wildlife' ),
				'mark'  => __( 'a small domed metallic BLUE beetle sitting on a palmetto frond', 'dcc-wildlife' ),
			],
			'carpenterant'       => [
				'emoji' => '🐛',
				'name'  => __( 'Florida Carpenter Ant', 'dcc-wildlife' ),
				'sci'   => 'Camponotus floridanus',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'ants',
				'odds'  => 'certain',
				'fact'  => __( 'The big red-and-black ant running along a rail at dusk. It does not eat wood — it hollows galleries in wood that is already soft and damp, which is why finding one indoors means finding a leak. It has no sting, but it bites and then sprays formic acid into the wound.', 'dcc-wildlife' ),
				'best'  => __( 'any month, mostly at dusk and after dark', 'dcc-wildlife' ),
				'where' => __( 'rails, trunks and walls after dark; galleries in damp softwood', 'dcc-wildlife' ),
				'mark'  => __( 'a large ant with a RUSTY-ORANGE front half and a black abdomen, running in the open', 'dcc-wildlife' ),
			],
			'cockroach'          => [
				'emoji' => '🐛',
				'name'  => __( 'Palmetto Bug', 'dcc-wildlife' ),
				'sci'   => 'Periplaneta americana',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'ants',
				'odds'  => 'certain',
				'fact'  => __( 'The big brown one that flies at the porch light, and Floridians call it a palmetto bug because that sounds better. It is not really a house insect here — it lives outdoors in palmetto, mulch and tree holes, and comes in by accident. It can run at about fifty body lengths a second.', 'dcc-wildlife' ),
				'best'  => __( 'any month; worst in warm damp weather', 'dcc-wildlife' ),
				'where' => __( 'mulch, palmetto boots, tree holes and drains; porch lights at night', 'dcc-wildlife' ),
				'mark'  => __( 'large reddish-brown with a pale yellowish ring around the shield behind the head', 'dcc-wildlife' ),
			],
			'firefly'            => [
				'emoji' => '🐛',
				'name'  => __( 'Firefly', 'dcc-wildlife' ),
				'sci'   => 'Photuris fairchildi',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'beetles',
				'odds'  => 'likely',
				'fact'  => __( 'The flashes over the grass on a June evening are a conversation, and some of it is a lie. The female of this genus copies the answering flash of a different firefly species to lure in its males and eat them — and by eating them she takes on the toxins she cannot make herself.', 'dcc-wildlife' ),
				'best'  => __( 'late spring and summer evenings', 'dcc-wildlife' ),
				'where' => __( 'over damp grass and along wood edges at dusk and after dark', 'dcc-wildlife' ),
				'mark'  => __( 'a slim soft beetle with a shield over its head and a pale glowing tail segment', 'dcc-wildlife' ),
			],
			'cicadas'            => [
				'emoji' => '🐛',
				'name'  => __( 'Lyric Cicada', 'dcc-wildlife' ),
				'sci'   => 'Neotibicen lyricen',
				'group' => 'critters',
				'browse' => 'insects',
				'idgroup' => 'ants',
				'odds'  => 'certain',
				'fact'  => __( 'The sound of a Florida afternoon in August, coming from high in a tree you will never find it in. Florida’s cicadas are annual ones, not the famous thirteen-year broods, so there is a chorus every summer. The song is made by buckling a pair of ribbed plates thousands of times a second.', 'dcc-wildlife' ),
				'best'  => __( 'summer afternoons, by ear', 'dcc-wildlife' ),
				'where' => __( 'high in the canopy of oaks and pines — heard far more than seen', 'dcc-wildlife' ),
				'mark'  => __( 'heard, not seen: a long even buzzing drone that swells and fades from the canopy', 'dcc-wildlife' ),
			],
			// ---- BATCH 9 (1.33.0): the amphibians ---------------------------
			// Nineteen, and the reason the Animals chip says "Reptiles &
			// amphibians" with a straight face. The cane toad flipped that label
			// in batch 7 by being the only amphibian in the registry; this is the
			// batch that makes it TRUE rather than merely correct.
			//
			// EVERY ONE CARRIES A `sound` LINE but the newt, which is the point of
			// this group: a guest on the dock after dark hears far more amphibians
			// than they will ever see, and the call is the identification. The
			// 1.14.0 rule still holds — a sound line only where a distinctive,
			// guest-recognisable voice could be verified — and frogs are simply
			// the case where that is true almost every time. The peninsula newt
			// has none because newts do not call.
			//
			// Three cross-links this batch closes, each written from both ends:
			//   gopher frog  <-> gopher tortoise (batch 6) — it lives in the burrow
			//   amphiuma     <-> eastern mud snake (batch 8) — which eats it
			//   southern toad <-> cane toad (batch 7) — the safety comparison, and
			//                   the reason the southern toad's mark leads on the
			//                   ridges and knobs between the eyes
			'greentreefrog'   => [
				'emoji' => '🐸',
				'name'  => __( 'Green Tree Frog', 'dcc-wildlife' ),
				'sci'   => 'Hyla cinerea',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'treefrogs',
				'odds'  => 'certain',
				'fact'  => __( 'The frog on the window at night, drawn there by the insects the light brings. Bright leaf-green with a crisp white stripe down each side, long-legged and about two inches of it. It is also called the rain frog, because it starts calling when it feels a shower coming — often hours before anything falls.', 'dcc-wildlife' ),
				'sound' => __( 'A loud nasal “queenk, queenk, queenk” repeated all evening, hundreds at once from the marsh edge.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, especially warm humid nights', 'dcc-wildlife' ),
				'where' => __( 'window screens, porch walls, lily pads and reed stems', 'dcc-wildlife' ),
				'mark'  => __( 'bright green with a clean white stripe along each side; the squirrel treefrog has no stripe, or a broken one', 'dcc-wildlife' ),
			],
			'squirreltreefrog' => [
				'emoji' => '🐸',
				'name'  => __( 'Squirrel Tree Frog', 'dcc-wildlife' ),
				'sci'   => 'Hyla squirella',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'treefrogs',
				'odds'  => 'certain',
				'fact'  => __( 'The chameleon of the porch: it shifts from bright green to yellow-brown to plain brown within minutes, which is why nobody can agree what colour it is. Small, smooth and entirely unremarkable in markings, and that blankness is how you name it.', 'dcc-wildlife' ),
				'sound' => __( 'A scolding, raspy chatter that really does sound like a squirrel telling you off — given away from water, usually just before rain.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, and before rain at any hour', 'dcc-wildlife' ),
				'where' => __( 'porch walls, plant pots, gutters and low foliage', 'dcc-wildlife' ),
				'mark'  => __( 'small and plain — no clean white side-stripe and no crisp markings; and it changes colour', 'dcc-wildlife' ),
			],
			'barkingtreefrog' => [
				'emoji' => '🐸',
				'name'  => __( 'Barking Treefrog', 'dcc-wildlife' ),
				'sci'   => 'Hyla gratiosa',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'treefrogs',
				'odds'  => 'likely',
				'fact'  => __( 'The largest treefrog native to the United States, and built like one: stout, granular-skinned, and marked with dark round spots on green. It calls from high in a tree or while floating in the water, and the name is the noise — a hollow, doglike bark carrying across a pond at night.', 'dcc-wildlife' ),
				'sound' => __( 'A single deep “doonk” repeated, or a harsher barking from up a tree; carried a long way on a still night.', 'dcc-wildlife' ),
				'best'  => __( 'warm nights in the breeding season', 'dcc-wildlife' ),
				'where' => __( 'high in trees near ponds, and floating in the shallows when calling', 'dcc-wildlife' ),
				'mark'  => __( 'big and stout with dark round spots on a green back, and noticeably bumpy skin', 'dcc-wildlife' ),
			],
			'pinewoodstreefrog' => [
				'emoji' => '🐸',
				'name'  => __( 'Pinewoods Treefrog', 'dcc-wildlife' ),
				'sci'   => 'Hyla femoralis',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'treefrogs',
				'odds'  => 'likely',
				'fact'  => __( 'Grey-brown and easy to overlook, and then it opens its mouth and gives itself away completely: the call is a dry irregular rattle that everyone who has heard it describes the same way, as Morse code being tapped out from the pines. Its own field mark is hidden — orange-yellow spots on the hidden surface of the thigh.', 'dcc-wildlife' ),
				'sound' => __( 'A dry, uneven series of clicks — dots and dashes, tapped out from the pine canopy after rain.', 'dcc-wildlife' ),
				'best'  => __( 'warm wet nights, from the pines', 'dcc-wildlife' ),
				'where' => __( 'pine flatwoods and trees near temporary ponds', 'dcc-wildlife' ),
				'mark'  => __( 'grey-brown and blotched, with hidden orange-yellow spots on the back of the thigh', 'dcc-wildlife' ),
			],
			'cubantreefrog'   => [
				'emoji' => '🐸',
				'name'  => __( 'Cuban Tree Frog', 'dcc-wildlife' ),
				'sci'   => 'Osteopilus septentrionalis',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'treefrogs',
				'flags' => [ 'invasive', 'danger' ],
				'odds'  => 'certain',
				'safe'  => __( 'Don’t pick one up bare-handed — the skin secretion burns and itches for up to an hour, and it is worse in eyes or a mouth. Handled one by accident? Wash your hands before touching your face, and keep pets off it.', 'dcc-wildlife' ),
				'fact'  => __( 'Much the biggest treefrog you will see here, warty-skinned, with toe pads the size of its eyes — and it should not be here at all. It eats at least five of Florida’s native treefrogs, its tadpoles crowd theirs out, and it gets into plumbing and electrical boxes. Where it settles, the green and squirrel treefrogs thin out.', 'dcc-wildlife' ),
				'sound' => __( 'A grating, squelching squawk — less musical than any native, often from a downpipe or a wall.', 'dcc-wildlife' ),
				'best'  => __( 'warm nights, on lit walls', 'dcc-wildlife' ),
				'where' => __( 'walls, downpipes, birdbaths and anywhere damp near a building', 'dcc-wildlife' ),
				'mark'  => __( 'very large for a treefrog, warty, with huge toe pads and skin that looks loose over the head', 'dcc-wildlife' ),
			],
			'pigfrog'         => [
				'emoji' => '🐸',
				'name'  => __( 'Pig Frog', 'dcc-wildlife' ),
				'sci'   => 'Lithobates grylio',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'truefrogs',
				'odds'  => 'certain',
				'fact'  => __( 'The grunt you hear across the water at night is almost certainly this, not a bullfrog. It is a big green-grey frog with a sharply pointed nose and fully webbed hind feet — the webbing runs right to the tip of the longest toe, which the bullfrog’s does not. Florida’s frog-leg frog, and much the commoner of the two here.', 'dcc-wildlife' ),
				'sound' => __( 'A deep, grunting croak exactly like a pig, given from among the lily pads after dark.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, from spring into autumn', 'dcc-wildlife' ),
				'where' => __( 'floating among lilies and duckweed with just the head showing', 'dcc-wildlife' ),
				'mark'  => __( 'pointed snout, huge eardrum, and webbing reaching the tip of the longest hind toe', 'dcc-wildlife' ),
			],
			'bullfrog'        => [
				'emoji' => '🐸',
				'name'  => __( 'American Bullfrog', 'dcc-wildlife' ),
				'sci'   => 'Lithobates catesbeianus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'truefrogs',
				'odds'  => 'occasional',
				'fact'  => __( 'The largest frog in North America, and here it is at the very edge of its range — its native limit runs through central Florida, so Lake County is about as far south as it gets. Which matters for a simple reason: the deep voice across the canal at night is far more likely to be a pig frog. If you do meet one, the webbing stops short of the longest toe.', 'dcc-wildlife' ),
				'sound' => __( 'A low “jug-o-rum” that carries a long way — but hear a grunt rather than a bellow and you have a pig frog.', 'dcc-wildlife' ),
				'best'  => __( 'warm nights, in the quieter backwaters', 'dcc-wildlife' ),
				'where' => __( 'weedy shallows and pond edges rather than open canal', 'dcc-wildlife' ),
				'mark'  => __( 'no ridges down the back, and hind webbing that stops short of the longest toe — the pig frog’s reaches the tip', 'dcc-wildlife' ),
			],
			'leopardfrog'     => [
				'emoji' => '🐸',
				'name'  => __( 'Southern Leopard Frog', 'dcc-wildlife' ),
				'sci'   => 'Lithobates sphenocephalus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'truefrogs',
				'odds'  => 'certain',
				'fact'  => __( 'Slim, long-legged and scattered with dark spots on green or brown, with a pale ridge running down each side of the back. It is the frog that leaps out from underfoot at the water’s edge and lands three feet away, and it is out in cooler weather than most of the others.', 'dcc-wildlife' ),
				'sound' => __( 'A low chuckling trill, widely described as the sound of rubbing a wet hand on an inflated balloon.', 'dcc-wildlife' ),
				'best'  => __( 'evenings and mild nights, much of the year', 'dcc-wildlife' ),
				'where' => __( 'wet grass and the margins of ditches, ponds and the canal', 'dcc-wildlife' ),
				'mark'  => __( 'dark spots on a pale ridge-lined back, a pointed snout, and a pale spot in the centre of the eardrum', 'dcc-wildlife' ),
			],
			'gopherfrog'      => [
				'emoji' => '🐸',
				'name'  => __( 'Gopher Frog', 'dcc-wildlife' ),
				'sci'   => 'Lithobates capito',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'truefrogs',
				'odds'  => 'rare',
				'fact'  => __( 'A stocky, warty, heavily spotted frog that lives underground in somebody else’s house: it shelters in gopher tortoise burrows, which is where the name comes from and why its fortunes follow the tortoise’s. Both are in decline for the same reason, and losing the burrows takes the frog with them.', 'dcc-wildlife' ),
				'sound' => __( 'A deep snore, like someone asleep in the next room, from a temporary pond on a rainy night.', 'dcc-wildlife' ),
				'best'  => __( 'rainy nights in the breeding season', 'dcc-wildlife' ),
				'where' => __( 'gopher tortoise burrows in dry sandhills, and the temporary ponds nearby', 'dcc-wildlife' ),
				'mark'  => __( 'stocky and warty with heavy dark spotting and prominent ridges down the back; it sits low and looks squat', 'dcc-wildlife' ),
			],
			'southerntoad'    => [
				'emoji' => '🐸',
				'name'  => __( 'Southern Toad', 'dcc-wildlife' ),
				'sci'   => 'Anaxyrus terrestris',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'toads',
				'odds'  => 'certain',
				'fact'  => __( 'The toad under the porch light, and the one to be able to name, because the other toad here is dangerous. Look between the eyes: this one has two raised ridges running back to a pair of pronounced knobs. The cane toad has neither — the space between its eyes is smooth, and its poison gland is a big triangle rather than a small oval.', 'dcc-wildlife' ),
				'sound' => __( 'A high, musical trill lasting several seconds, from puddles and ditches after rain.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, under any outside light', 'dcc-wildlife' ),
				'where' => __( 'lawns, paths and porches, anywhere a light draws insects', 'dcc-wildlife' ),
				'mark'  => __( 'two ridges between the eyes ending in raised KNOBS, and a small oval gland behind the eye', 'dcc-wildlife' ),
			],
			'oaktoad'         => [
				'emoji' => '🐸',
				'name'  => __( 'Oak Toad', 'dcc-wildlife' ),
				'sci'   => 'Anaxyrus quercicus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'toads',
				'odds'  => 'likely',
				'fact'  => __( 'The smallest toad in North America — an adult sits comfortably on a thumbnail, at most an inch and a bit — with a pale stripe down the middle of the back. It is active in the day as well as at night, which no other toad here really is, and a chorus of them sounds nothing like toads at all.', 'dcc-wildlife' ),
				'sound' => __( 'A high, piping “peep” repeated over and over — a pondful sounds like a box of day-old chicks.', 'dcc-wildlife' ),
				'best'  => __( 'warm days and nights after summer rain', 'dcc-wildlife' ),
				'where' => __( 'sandy pine and oak ground, and the puddles in it', 'dcc-wildlife' ),
				'mark'  => __( 'tiny, with a clear pale stripe down the spine — nothing else here is this small and striped', 'dcc-wildlife' ),
			],
			'narrowmouthtoad' => [
				'emoji' => '🐸',
				'name'  => __( 'Eastern Narrow-mouthed Toad', 'dcc-wildlife' ),
				'sci'   => 'Gastrophryne carolinensis',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'toads',
				'odds'  => 'likely',
				'fact'  => __( 'Not really a toad, and shaped like nothing else here: a smooth plump teardrop with a tiny pointed head and a fold of loose skin across the back of it. The head is narrow because it eats ants, and the fold is a wiper — it draws it forward over the eyes to clear off the ones that fight back.', 'dcc-wildlife' ),
				'sound' => __( 'A flat, nasal bleat like a lamb, or a buzzer held down for a second or two, from wet grass after rain.', 'dcc-wildlife' ),
				'best'  => __( 'after heavy rain, usually at night', 'dcc-wildlife' ),
				'where' => __( 'under boards, leaf litter and wet grass near shallow water', 'dcc-wildlife' ),
				'mark'  => __( 'a smooth pointed teardrop with a fold of skin behind the head, and no visible eardrum', 'dcc-wildlife' ),
			],
			'spadefoot'       => [
				'emoji' => '🐸',
				'name'  => __( 'Eastern Spadefoot', 'dcc-wildlife' ),
				'sci'   => 'Scaphiopus holbrookii',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'toads',
				'odds'  => 'occasional',
				'fact'  => __( 'Most of the year it is underground and there is nothing to see. Each hind foot carries a hard black sickle — the spade — and it digs backwards out of sight and waits, sometimes for months. Then a heavy summer storm brings the whole population up at once, and the ditches fill overnight with a frog nobody knew was there.', 'dcc-wildlife' ),
				'sound' => __( 'A low grating groan, like a young crow, in an explosive chorus the night a big storm breaks.', 'dcc-wildlife' ),
				'best'  => __( 'the night of a heavy summer downpour, and seldom otherwise', 'dcc-wildlife' ),
				'where' => __( 'sandy ground; the temporary pools that appear after a storm', 'dcc-wildlife' ),
				'mark'  => __( 'vertical cat-like pupils, a hard black spade on each hind foot, and smoother skin than a true toad', 'dcc-wildlife' ),
			],
			'cricketfrog'     => [
				'emoji' => '🐸',
				'name'  => __( 'Florida Cricket Frog', 'dcc-wildlife' ),
				'sci'   => 'Acris gryllus dorsalis',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'tinyfrogs',
				'odds'  => 'certain',
				'fact'  => __( 'Barely an inch long, warty, and impossible to catch: disturb one at the edge and it goes across the water in a series of skipping jumps and vanishes. The sound is the giveaway and it is everywhere along the canal, all year — once you can place it you will realise you have been hearing it the whole time.', 'dcc-wildlife' ),
				'sound' => __( 'A dry metallic “click-click-click” exactly like two pebbles tapped together, speeding up as it goes.', 'dcc-wildlife' ),
				'best'  => __( 'all day and all year, at the water’s edge', 'dcc-wildlife' ),
				'where' => __( 'mud and matted vegetation right at the waterline', 'dcc-wildlife' ),
				'mark'  => __( 'tiny and warty with a dark triangle between the eyes, and a stripe down the back in our Florida form', 'dcc-wildlife' ),
			],
			'littlegrassfrog' => [
				'emoji' => '🐸',
				'name'  => __( 'Little Grass Frog', 'dcc-wildlife' ),
				'sci'   => 'Pseudacris ocularis',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'tinyfrogs',
				'odds'  => 'likely',
				'fact'  => __( 'The smallest frog in North America. A big one is eighteen millimetres, which is two-thirds of an inch, and it is a slender pinkish-tan thing with a dark stripe running through the eye and along the side. You will hear it long before you ever see one, and most people never do.', 'dcc-wildlife' ),
				'sound' => __( 'A thin, insect-like “tink” repeated quickly — so high that many adults cannot hear it at all.', 'dcc-wildlife' ),
				'best'  => __( 'day and night, most of the year', 'dcc-wildlife' ),
				'where' => __( 'damp grass and sedge at the edges of shallow water', 'dcc-wildlife' ),
				'mark'  => __( 'minute and slender, with a dark line through the eye continuing down the flank', 'dcc-wildlife' ),
			],
			'greenhousefrog'  => [
				'emoji' => '🐸',
				'name'  => __( 'Greenhouse Frog', 'dcc-wildlife' ),
				'sci'   => 'Eleutherodactylus planirostris',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'tinyfrogs',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'A small brown frog from Cuba and the Bahamas that arrived in potted plants and now lives in every flowerbed in Florida. It has given up water entirely: there is no tadpole, no pond, no chorus at the edge — the eggs are laid in damp leaf litter and tiny fully formed froglets hatch straight out of them.', 'dcc-wildlife' ),
				'sound' => __( 'A soft, birdlike chirping from the flowerbed after dark or after rain — easily mistaken for an insect.', 'dcc-wildlife' ),
				'best'  => __( 'after dark and after rain', 'dcc-wildlife' ),
				'where' => __( 'leaf litter, mulch, flowerbeds and under pots', 'dcc-wildlife' ),
				'mark'  => __( 'small, brown, and either mottled or with two pale back stripes; found in dry leaf litter well away from water', 'dcc-wildlife' ),
			],
			'greatersiren'    => [
				'emoji' => '🦎',
				'name'  => __( 'Greater Siren', 'dcc-wildlife' ),
				'sci'   => 'Siren lacertina',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'eels',
				'odds'  => 'occasional',
				'fact'  => __( 'An eel that is a salamander. It reaches three feet, keeps feathery external gills its whole life, has two small front legs and NO back ones at all, and lives in the mud of the canal. When the water goes, it burrows down and seals itself in a cocoon of its own dried skin — and can wait there, years if it has to, for the rain.', 'dcc-wildlife' ),
				'sound' => __( 'Mostly silent; a surprising yelp or a clicking if one is handled.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, in shallow weedy water', 'dcc-wildlife' ),
				'where' => __( 'the mud and weed of the canal bottom — genuinely there, rarely seen', 'dcc-wildlife' ),
				'mark'  => __( 'eel-shaped with feathery gills behind the head, two tiny front legs and no hind legs whatsoever', 'dcc-wildlife' ),
			],
			'amphiuma'        => [
				'emoji' => '🦎',
				'name'  => __( 'Two-toed Amphiuma', 'dcc-wildlife' ),
				'sci'   => 'Amphiuma means',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'idgroup' => 'eels',
				'odds'  => 'occasional',
				'fact'  => __( 'A salamander three feet long with four legs so reduced you have to look for them — each is about a centimetre, with two toes on the end. It hunts the canal mud at night, and it is the eastern mud snake’s whole reason for living: that snake specialises in eating this animal. Left alone it wants nothing to do with you; handled, it bites hard and the wound goes bad.', 'dcc-wildlife' ),
				'sound' => __( 'Generally silent; a faint whistle or click when disturbed.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, in the shallows', 'dcc-wildlife' ),
				'where' => __( 'soft mud and weed beds; sometimes crossing wet ground on a rainy night', 'dcc-wildlife' ),
				'mark'  => __( 'eel-like and slate grey-brown with NO gills showing, and four minute legs with two toes each', 'dcc-wildlife' ),
			],
			'peninsulanewt'   => [
				'emoji' => '🐸',
				'name'  => __( 'Peninsula Newt', 'dcc-wildlife' ),
				'sci'   => 'Notophthalmus viridescens piaropicola',
				'group' => 'critters',
				'browse' => 'reptiles',
				'class' => 'amphibian',
				'odds'  => 'likely',
				'fact'  => __( 'Florida’s own dark newt, and a departure from its northern relatives: where those wear bright red spots, this one has none at all — greenish-brown to nearly black, heavily peppered with fine black speckles over a deep orange belly. It swims in weedy ponds and ditches with a flattened tail, and it does not hurry.', 'dcc-wildlife' ),
				'best'  => __( 'any month, in still weedy water', 'dcc-wildlife' ),
				'where' => __( 'weedy ponds, ditches and quiet backwaters among the plants', 'dcc-wildlife' ),
				'mark'  => __( 'a small dark speckled newt with a flattened swimming tail and a deep orange underside; no red spots', 'dcc-wildlife' ),
			],
			// ---- BATCH 8 (1.33.0): the snakes and lizards on dry land -------
			// Nine snakes and eight lizards. The guide had four venomous snakes
			// and three watersnakes and nothing else that crawls, so a guest who
			// met a black racer on the lawn — which is the snake they are most
			// likely to meet — had nothing to look it up in.
			//
			// LOOK-ALIKE GROUPS ARE SMALL AND SPECIFIC, for the same reason
			// the turtles' are: one "land snakes" group of nine put eight
			// other species in every sheet, which is a wall rather than an
			// identification. Five groups, each answering one real question:
			//   blacksnakes   — big glossy dark ones (racer, indigo, mud)
			//   stripedsnakes — garter vs ribbon, the classic pair
			//   climbers      — the two Pantherophis found in outbuildings
			//   anoles, skinks — the pairs guests actually stand over
			//
			// Four carry NO group on purpose. The ringneck, the glass lizard
			// and the house gecko are unmistakable once seen, and the glass
			// lizard's confusion is with SNAKES in general, which its own
			// "Tell it apart" line answers better than a list would.
			//
			// The ROUGH GREEN SNAKE is the fourth, and it is a real trade-off
			// rather than a gap. It is genuinely confused with the Florida
			// green watersnake — the names are one word apart — but a species
			// can hold only one look-alike group, and the watersnake's is
			// `snakes`, where it answers "is this the venomous one". That
			// question outranks this one, so the green watersnake stays put
			// and the rough green snake's own "Tell it apart" line names it
			// instead. Do not move the watersnake out of `snakes` to tidy
			// this up: it would take one of the three harmless watersnakes
			// out of the cottonmouth comparison.
			//
			// The watersnakes keep `snakes` with the cottonmouth. That set
			// answers "is this the venomous one", and it is not this question.
			'blackracer'      => [
				'emoji' => '🐍',
				'name'  => __( 'Black Racer', 'dcc-wildlife' ),
				'sci'   => 'Coluber constrictor priapus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'blacksnakes',
				'odds'  => 'certain',
				'fact'  => __( 'The snake you are most likely to meet away from the water, and it will be leaving. Slate-black above, pale grey beneath, with a white chin and a bright, watchful eye — it hunts by sight rather than smell, which is why it holds its head up off the ground. Fast, nervous and completely harmless.', 'dcc-wildlife' ),
				'best'  => __( 'warm mornings and afternoons', 'dcc-wildlife' ),
				'where' => __( 'lawn edges, mulch beds and the base of hedges — usually a black streak going away from you', 'dcc-wildlife' ),
				'mark'  => __( 'glossy black with a white chin and a round pupil; it flees rather than coils', 'dcc-wildlife' ),
			],
			'yellowratsnake'  => [
				'emoji' => '🐍',
				'name'  => __( 'Yellow Rat Snake', 'dcc-wildlife' ),
				'sci'   => 'Pantherophis quadrivittatus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'climbers',
				'odds'  => 'certain',
				'fact'  => __( 'Mustard-yellow with four thin dark stripes running the length of it, and much more likely to be met vertically than horizontally: the belly scales are angled at the edges, which turns a tree trunk into a staircase. It is the snake in the rafters, the one that eats the rats, and it is harmless.', 'dcc-wildlife' ),
				'best'  => __( 'warm days, and after dark in high summer', 'dcc-wildlife' ),
				'where' => __( 'up oak trunks, in outbuildings, along rafters and fence lines', 'dcc-wildlife' ),
				'mark'  => __( 'yellow to olive with four thin dark stripes head to tail, and a habit of climbing', 'dcc-wildlife' ),
			],
			'cornsnake'       => [
				'emoji' => '🐍',
				'name'  => __( 'Corn Snake', 'dcc-wildlife' ),
				'sci'   => 'Pantherophis guttatus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'climbers',
				'odds'  => 'likely',
				'fact'  => __( 'Orange and rust, with big red-brown saddles outlined in black and a spearhead pointing forward between the eyes. It is among the most placid snakes in Florida and one of the most useful — a rodent specialist that hunts barns and woodpiles. People keep them as pets the world over; here it simply lives in the yard.', 'dcc-wildlife' ),
				'best'  => __( 'warm evenings and nights', 'dcc-wildlife' ),
				'where' => __( 'woodpiles, outbuildings and mulch, mostly after dark', 'dcc-wildlife' ),
				'mark'  => __( 'orange with black-edged red saddles, and a spear-point mark on top of the head', 'dcc-wildlife' ),
			],
			'gartersnake'     => [
				'emoji' => '🐍',
				'name'  => __( 'Eastern Garter Snake', 'dcc-wildlife' ),
				'sci'   => 'Thamnophis sirtalis',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'stripedsnakes',
				'odds'  => 'likely',
				'fact'  => __( 'Three pale stripes down a dark body, and a life lived in the damp — lawn edges, ditch banks, anywhere frogs and earthworms are. Florida’s are often washed with blue between the stripes. It is harmless, though it will flatten and smell terrible if you pick it up, which is its whole argument.', 'dcc-wildlife' ),
				'best'  => __( 'mornings, especially after rain', 'dcc-wildlife' ),
				'where' => __( 'damp lawn edges, ditches and the margins of wet ground', 'dcc-wildlife' ),
				'mark'  => __( 'three pale stripes on a stout dark body, and black lips — the ribbon snake is slimmer, with white lips and a white spot before the eye', 'dcc-wildlife' ),
			],
			'ribbonsnake'     => [
				'emoji' => '🐍',
				'name'  => __( 'Peninsula Ribbon Snake', 'dcc-wildlife' ),
				'sci'   => 'Thamnophis sauritus sackenii',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'stripedsnakes',
				'odds'  => 'likely',
				'fact'  => __( 'A garter snake drawn thin. It is built long and narrow with a tail that is a third of it, and it lives right at the water’s edge, hunting frogs and small fish and swimming when it has to. Quick, nervous, and quite harmless.', 'dcc-wildlife' ),
				'best'  => __( 'warm mornings at the water’s edge', 'dcc-wildlife' ),
				'where' => __( 'marshy margins, wet grass and the reedy edges of the canal', 'dcc-wildlife' ),
				'mark'  => __( 'much slimmer than a garter snake, with white lips and a white spot just in front of the eye', 'dcc-wildlife' ),
			],
			'ringnecksnake'   => [
				'emoji' => '🐍',
				'name'  => __( 'Southern Ringneck Snake', 'dcc-wildlife' ),
				'sci'   => 'Diadophis punctatus punctatus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'likely',
				'fact'  => __( 'A pencil of a snake, slate-grey above with a narrow pale collar, and it carries a secret underneath: the belly is orange-yellow, and when something frightens it, it coils the tail into a tight upright spiral to flash that colour. It is a warning flag borrowed from snakes that can back it up. This one cannot, and is harmless.', 'dcc-wildlife' ),
				'best'  => __( 'after rain; mostly under things at other times', 'dcc-wildlife' ),
				'where' => __( 'under boards, logs, mulch and pots — found by lifting rather than looking', 'dcc-wildlife' ),
				'mark'  => __( 'tiny and slate-grey with a pale neck ring, and an orange belly it shows by curling its tail', 'dcc-wildlife' ),
			],
			'roughgreensnake' => [
				'emoji' => '🐍',
				'name'  => __( 'Rough Green Snake', 'dcc-wildlife' ),
				'sci'   => 'Opheodrys aestivus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'likely',
				'fact'  => __( 'Bright leaf-green above and cream below, and almost impossible to see: it hunts in the middle of a shrub, moving slowly through the twigs and picking off caterpillars and spiders. It is one of very few snakes that eats mostly insects, and it is so gentle it is easier to lift off a branch than to make it bite.', 'dcc-wildlife' ),
				'best'  => __( 'warm days, in the green', 'dcc-wildlife' ),
				'where' => __( 'low in shrubs and vines over the bank, usually motionless', 'dcc-wildlife' ),
				'mark'  => __( 'slender and bright leaf-green, up in foliage rather than on the ground — the Florida green watersnake is far heavier, olive rather than green, and stays in the water', 'dcc-wildlife' ),
			],
			'mudsnake'        => [
				'emoji' => '🐍',
				'name'  => __( 'Eastern Mud Snake', 'dcc-wildlife' ),
				'sci'   => 'Farancia abacura',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'blacksnakes',
				'odds'  => 'occasional',
				'fact'  => __( 'Glossy blue-black on top and barred red and black underneath, and it spends its life in the mud after one very specific meal: the amphiuma, an eel-shaped salamander two or three feet long that lives in the same swamps. Cornered, a mud snake rolls over to flash the red belly and presses its pointed tail-tip against you — harmlessly, whatever the old stories say.', 'dcc-wildlife' ),
				'best'  => __( 'warm wet nights', 'dcc-wildlife' ),
				'where' => __( 'mucky shallows, swamp edges and the wet ground between them', 'dcc-wildlife' ),
				'mark'  => __( 'glossy black above with bold red-and-black bars across the belly, and a hard pointed tail tip', 'dcc-wildlife' ),
			],
			'indigosnake'     => [
				'emoji' => '🐍',
				'name'  => __( 'Eastern Indigo Snake', 'dcc-wildlife' ),
				'sci'   => 'Drymarchon couperi',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'blacksnakes',
				'flags' => [ 'protected' ],
				'odds'  => 'rare',
				'safe'  => __( 'Federally threatened: watch, do not approach, and never disturb a tortoise burrow — it is this snake’s winter shelter.', 'dcc-wildlife' ),
				'fact'  => __( 'The longest native snake in the United States — well past eight feet — and one of the calmest. It is glossy blue-black all over, hunts in daylight, and eats other snakes, rattlesnakes included, being unbothered by their venom. In winter it shelters in gopher tortoise burrows, which is why saving the tortoise is how you save this.', 'dcc-wildlife' ),
				'best'  => __( 'bright winter and spring days', 'dcc-wildlife' ),
				'where' => __( 'dry sandhills near tortoise burrows — a genuinely rare sighting here', 'dcc-wildlife' ),
				'mark'  => __( 'enormous, uniformly glossy blue-black, often with a red-orange chin; it moves in the open by day', 'dcc-wildlife' ),
			],
			'greenanole'      => [
				'emoji' => '🦎',
				'name'  => __( 'Green Anole', 'dcc-wildlife' ),
				'sci'   => 'Anolis carolinensis',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'anoles',
				'odds'  => 'certain',
				'fact'  => __( 'Our only native anole, and it has been pushed upwards. The male signals by flaring a pink throat fan and doing press-ups; he can also shift from green to brown, which is mood and temperature rather than camouflage. Since the brown anole arrived, green anoles have moved up into the branches — and in fifteen years their toe pads measurably grew to grip the thinner twigs.', 'dcc-wildlife' ),
				'best'  => __( 'warm days, on anything vertical', 'dcc-wildlife' ),
				'where' => __( 'higher up — shrubs, tree trunks, railings and screens', 'dcc-wildlife' ),
				'mark'  => __( 'green (or brown) with a long thin tail and a PINK throat fan; the brown anole’s is orange-red with a pale stripe', 'dcc-wildlife' ),
			],
			'brownanole'      => [
				'emoji' => '🦎',
				'name'  => __( 'Brown Anole', 'dcc-wildlife' ),
				'sci'   => 'Anolis sagrei',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'anoles',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'From Cuba and the Bahamas by way of the Florida Keys in 1887, and now in very nearly every county in the state. It keeps low — ground, kerbs, the bottom of walls — and it eats young green anoles, which is why the natives went up the trees. The throat fan is orange-red with a pale border, and it is out constantly.', 'dcc-wildlife' ),
				'best'  => __( 'any warm day, all day', 'dcc-wildlife' ),
				'where' => __( 'low down: paths, kerbs, wall bases, pot rims', 'dcc-wildlife' ),
				'mark'  => __( 'brown with a ridged back and pale diamond or stripe pattern, and an ORANGE-red throat fan; it stays low', 'dcc-wildlife' ),
			],
			'fivelinedskink'  => [
				'emoji' => '🦎',
				'name'  => __( 'Southeastern Five-lined Skink', 'dcc-wildlife' ),
				'sci'   => 'Plestiodon inexpectatus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'skinks',
				'odds'  => 'likely',
				'fact'  => __( 'A glossy brown lizard with five pale stripes from nose to tail, and a tail that starts out electric blue and fades as it grows. The blue is a decoy: a predator grabs the bright end, the tail comes away, and the skink walks off. It is the skink you will meet on a woodpile.', 'dcc-wildlife' ),
				'best'  => __( 'warm mornings, on sun-warmed wood', 'dcc-wildlife' ),
				'where' => __( 'woodpiles, fallen logs and the sunny side of sheds', 'dcc-wildlife' ),
				'mark'  => __( 'five pale stripes on a glossy body, about eight inches; the broad-headed skink is far bigger and an adult male has an orange head', 'dcc-wildlife' ),
			],
			'broadheadskink'  => [
				'emoji' => '🦎',
				'name'  => __( 'Broad-headed Skink', 'dcc-wildlife' ),
				'sci'   => 'Plestiodon laticeps',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'skinks',
				'odds'  => 'likely',
				'fact'  => __( 'Florida’s largest skink, and the big males are unmistakable in spring: olive-brown and thirteen inches long, with the whole head swollen and flushed bright orange. They are tree lizards more than ground ones — look up the trunk of a big oak rather than down at the leaf litter.', 'dcc-wildlife' ),
				'best'  => __( 'spring mornings, when the males are in colour', 'dcc-wildlife' ),
				'where' => __( 'up oak trunks and on big fallen limbs', 'dcc-wildlife' ),
				'mark'  => __( 'large and heavy, an adult male with a wide, bright orange head; the five-lined skink is half the size and striped', 'dcc-wildlife' ),
			],
			'groundskink'     => [
				'emoji' => '🦎',
				'name'  => __( 'Ground Skink', 'dcc-wildlife' ),
				'sci'   => 'Scincella lateralis',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'skinks',
				'odds'  => 'likely',
				'fact'  => __( 'The smallest lizard you will see here, three to five inches of polished brown with a dark line down each side, and it does not climb anything. It swims through leaf litter instead, with a rustle you hear more often than you see it, and it has a clear window in its lower eyelid so it can keep watch with its eyes shut.', 'dcc-wildlife' ),
				'best'  => __( 'warm days, in the shade', 'dcc-wildlife' ),
				'where' => __( 'leaf litter and mulch at the wood’s edge — heard as a rustle, seen as a flick', 'dcc-wildlife' ),
				'mark'  => __( 'tiny, smooth and coppery-brown with a dark stripe along each side, and short legs it barely uses', 'dcc-wildlife' ),
			],
			'racerunner'      => [
				'emoji' => '🦎',
				'name'  => __( 'Six-lined Racerunner', 'dcc-wildlife' ),
				'sci'   => 'Aspidoscelis sexlineata',
				'group' => 'critters',
				'browse' => 'reptiles',
				'idgroup' => 'skinks',
				'odds'  => 'likely',
				'fact'  => __( 'Six pale lines down a dark brown back, and a lizard that has decided the answer to everything is speed — clocked at eighteen miles an hour, which on open sand is a blur rather than an animal. It hunts in the full heat of the day when everything else is in the shade, and it never stops moving.', 'dcc-wildlife' ),
				'best'  => __( 'hot middays, on open sand', 'dcc-wildlife' ),
				'where' => __( 'dry sandy ground, path edges and scrub in full sun', 'dcc-wildlife' ),
				'mark'  => __( 'six crisp pale lines on dark brown, a whip tail, and continuous fast movement', 'dcc-wildlife' ),
			],
			'glasslizard'     => [
				'emoji' => '🦎',
				'name'  => __( 'Eastern Glass Lizard', 'dcc-wildlife' ),
				'sci'   => 'Ophisaurus ventralis',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'occasional',
				'fact'  => __( 'A lizard that looks exactly like a snake and is not one. It has no legs, but it has eyelids that blink and ear openings behind the jaw, which no snake has. The name is the other half: seized, it thrashes and the tail shatters off in pieces, leaving the predator with the wrong end. More than half of a whole one is tail.', 'dcc-wildlife' ),
				'best'  => __( 'warm mornings, and after rain', 'dcc-wildlife' ),
				'where' => __( 'grassy edges and sandy open ground; often found by mowing', 'dcc-wildlife' ),
				'mark'  => __( 'legless but with blinking EYELIDS and visible ear holes, a stiff body and a groove along each side', 'dcc-wildlife' ),
			],
			'housegecko'      => [
				'emoji' => '🦎',
				'name'  => __( 'Mediterranean House Gecko', 'dcc-wildlife' ),
				'sci'   => 'Hemidactylus turcicus',
				'group' => 'critters',
				'browse' => 'reptiles',
				'flags' => [ 'invasive' ],
				'odds'  => 'certain',
				'fact'  => __( 'The pale, bug-eyed, soft-looking gecko on the porch wall after dark, mottled with dark spots and translucent enough to be faintly pink. It is not native to anywhere near here — it came from around the Mediterranean — and it has worked out the one thing that matters: a lit wall is a conveyor belt of moths.', 'dcc-wildlife' ),
				'best'  => __( 'after dark, wherever a light is on', 'dcc-wildlife' ),
				'where' => __( 'porch walls, window screens and around outside lights', 'dcc-wildlife' ),
				'mark'  => __( 'pale pinkish-grey with dark mottling and bumpy skin, vertical pupils, and toes that hold onto glass', 'dcc-wildlife' ),
			],
			// The snake split (1.19.0). The generic "Water Snake" hid the one
			// distinction that carries risk; the cottonmouth lives in the
			// safety group above, and these are the harmless lookalikes.
			'bandedwater' => [
				'emoji' => '🐍',
				'name'  => __( 'Florida Banded Watersnake', 'dcc-wildlife' ),
				'sci'   => 'Nerodia fasciata pictiventris',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'certain',
				'fact'  => __( 'The snake you will actually see. Dark crossbands on a reddish-brown or grey body, a dark line from eye to jaw. Cornered it flattens, hisses and may bite — and has no venom to bite you with. Three things separate it from the cottonmouth: a round pupil, a head barely wider than the neck, no pit between eye and nostril.', 'dcc-wildlife' ),
				'best'  => __( 'warm afternoons', 'dcc-wildlife' ),
				'where' => __( 'dock pilings and sunny shoreline brush, or swimming with just its head up', 'dcc-wildlife' ),
				'idgroup' => 'snakes',
				'mark'  => __( 'a round pupil, a narrow head and no facial pit — and it slips into the water rather than standing its ground', 'dcc-wildlife' ),
			],
			'brownwater'  => [
				'emoji' => '🐍',
				'name'  => __( 'Brown Watersnake', 'dcc-wildlife' ),
				'sci'   => 'Nerodia taxispilota',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'certain',
				'fact'  => __( 'A heavy brown snake with square dark blotches and a head wider than its neck — which is why it is mistaken for a cottonmouth, and killed for the resemblance. It basks on branches out over the water and drops in with a splash as a boat goes under. Harmless, and a serious fish-eater.', 'dcc-wildlife' ),
				'best'  => __( 'sunny middays', 'dcc-wildlife' ),
				'where' => __( 'on branches and snags overhanging the water', 'dcc-wildlife' ),
				'idgroup' => 'snakes',
				'mark'  => __( 'square blotches, a round pupil, and the drop-and-vanish exit — a cottonmouth swims with its head high and its whole body on the surface', 'dcc-wildlife' ),
			],
			'greenwater'  => [
				'emoji' => '🐍',
				'name'  => __( 'Florida Green Watersnake', 'dcc-wildlife' ),
				'sci'   => 'Nerodia floridana',
				'group' => 'critters',
				'browse' => 'reptiles',
				'odds'  => 'likely',
				'fact'  => __( 'The largest watersnake in North America — the record is over six feet — and one of the hardest to get a look at. Plain olive-green with no bands at all, it keeps to weedy shallows and marsh edges and is gone into the vegetation before you have finished deciding what it was. Harmless.', 'dcc-wildlife' ),
				'best'  => __( 'warm mornings', 'dcc-wildlife' ),
				'where' => __( 'weedy shallows and marsh edges among the lilies', 'dcc-wildlife' ),
				'idgroup' => 'snakes',
				'mark'  => __( 'plain olive-green with no bands or blotches, a round pupil and a narrow head', 'dcc-wildlife' ),
			],
			'fish'       => [
				'emoji' => '🐟',
				'name'  => __( 'Largemouth Bass', 'dcc-wildlife' ),
				'sci'   => 'Micropterus salmoides',
				'group' => 'critters',
				'browse' => 'fish',
				'odds'  => 'likely',
				'fact'  => __( 'The Harris Chain is trophy-bass water, and Lake Dora by name: it is one of the two lakes where state biologists surgically tagged largemouth over eight pounds to follow where the big ones actually go. Bluegill and black crappie school in the clear shallows around them.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'clear shallows off the dock, and along the deep hydrilla edges', 'dcc-wildlife' ),
			],
			'applesnail' => [
				'emoji' => '🐌',
				'name'  => __( 'Apple Snail', 'dcc-wildlife' ),
				'sci'   => 'Pomacea paludosa',
				'group' => 'critters',
				'browse' => 'insects',
				'odds'  => 'likely',
				'fact'  => __( 'A golf-ball of a snail that the canal quietly turns on: it is the main food of the limpkin and of the endangered snail kite, and neither bird has much of a fallback. She lays her eggs above the waterline, in pale pink clusters stuck to a stem — out of reach of every fish that would eat them.', 'dcc-wildlife' ),
				'best'  => __( 'warm months', 'dcc-wildlife' ),
				'where' => __( 'on emergent stems and bulrush right at the water’s edge', 'dcc-wildlife' ),
			],

			// ---- BIRDS -------------------------------------------------
			// ---- BIRDS ---------------------------------------------------
			// Ordered as a field guide reads (1.20.0): the sets a guest actually
			// has to tell apart sit together, and each one's `idgroup` lists the
			// others with the mark that settles it.
			// raptors
			'eagle'      => [
				'emoji' => '🦅',
				'name'  => __( 'Bald Eagle', 'dcc-wildlife' ),
				'sci'   => 'Haliaeetus leucocephalus',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'flags' => [ 'protected' ],
				'safe'  => __( 'Protected under federal law: keep well back from a nest tree and never disturb a roosting or nesting bird.', 'dcc-wildlife' ),
				'fact'  => __( 'Bald eagles build the largest nests of any bird on Earth, and the record is Florida’s: a pair near St Petersburg raised one nine feet across and twenty deep, reckoned at over two tons when it was measured in 1963. Ours nest through the cool season, back to front from their northern cousins.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'tall pines and bare snags above the treeline', 'dcc-wildlife' ),
				'idgroup' => 'raptor',
				'mark' => __( 'a white head and white tail on a dark body, with broad wings held almost flat', 'dcc-wildlife' ),
				'sound' => __( 'Not the piercing scream from the movies — that is a red-tailed hawk, dubbed over very nearly every hawk and eagle on screen. A real bald eagle gives surprisingly weak, high piping whistles.', 'dcc-wildlife' ),
			],
			'osprey'     => [
				'emoji' => '🐦',
				'name'  => __( 'Osprey', 'dcc-wildlife' ),
				'sci'   => 'Pandion haliaetus',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'certain',
				'fact'  => __( 'The only bird of prey that goes right into the water after a fish, sometimes vanishing under it altogether. Its outer toe swivels backwards to take hold of something built not to be held, and it turns the catch head-first in the air — a fish carried nose-on cuts the drag the whole way home.', 'dcc-wildlife' ),
				'best'  => __( 'mid-morning', 'dcc-wildlife' ),
				'where' => __( 'circling high over open water, then a sudden plunge', 'dcc-wildlife' ),
				'sound' => __( 'A rising and falling series of sharp whistles — the Cornell Lab likens it to a kettle taken quickly off the stove. This, not the eagle, is the loud whistler over the water.', 'dcc-wildlife' ),
				'idgroup' => 'raptor',
				'mark' => __( 'white underneath with a bold dark stripe through the eye; the wings kink into an M seen from below', 'dcc-wildlife' ),
			],
			// white waders
			'greategret' => [
				'emoji' => '🐦',
				'name' => __( 'Great Egret', 'dcc-wildlife' ),
				'sci' => __( 'Ardea alba', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'certain',
				'fact' => __( 'The bird on the National Audubon Society’s own emblem, and there for a reason: the plume hunters very nearly finished it, and stopping them is how the society began. It hunts by standing still, then stalking slower than anything else in the shallows — and grows the very plumes it was hunted for, down its back, to breed.', 'dcc-wildlife' ),
				'best' => __( 'mornings and late afternoon', 'dcc-wildlife' ),
				'where' => __( 'stalking the open shallows, slower than anything else out there', 'dcc-wildlife' ),
				'idgroup' => 'white',
				'mark' => __( 'the largest white wader here, with a heavy yellow bill and all-black legs and feet', 'dcc-wildlife' ),
				'sound' => __( 'A low, dry croak of complaint when something puts it up off the bank.', 'dcc-wildlife' ),
			],
			'egret'      => [
				'emoji' => '🐦',
				'name'  => __( 'Snowy Egret', 'dcc-wildlife' ),
				'sci'   => 'Egretta thula',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'certain',
				'fact'  => __( 'Golden slippers on black legs, and they are working equipment: it shuffles those bright yellow feet through the mud to panic prey into moving, then takes it. Its lacy plumes were nearly hunted out for ladies’ hats a century ago; the fight to stop that helped launch the Audubon movement.', 'dcc-wildlife' ),
				'best'  => __( 'early mornings', 'dcc-wildlife' ),
				'where' => __( 'wading the muddy edges where the bank meets the water', 'dcc-wildlife' ),
				'idgroup' => 'white',
				'mark' => __( 'much smaller, with a slim black bill and black legs — and bright golden-yellow feet', 'dcc-wildlife' ),
			],
			'cattleegret' => [
				'emoji' => '🐦',
				'name' => __( 'Cattle Egret', 'dcc-wildlife' ),
				'sci' => __( 'Bubulcus ibis', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'certain',
				'fact' => __( 'The white egret that is never at the water. Its ancestors crossed the Atlantic from Africa on their own wings, reaching South America about 1877; the species turned up in Florida in 1941, nested here by 1953, and went on to take the continent, following livestock and mowers for the insects they stir up.', 'dcc-wildlife' ),
				'best' => __( 'mid-morning, behind the mowers', 'dcc-wildlife' ),
				'where' => __( 'pastures, roadsides and freshly cut lawns — rarely at the canal', 'dcc-wildlife' ),
				'idgroup' => 'white',
				'mark' => __( 'short, stocky and hunch-necked, with a yellow bill and dark legs — and it feeds on dry ground, away from water', 'dcc-wildlife' ),
			],
			'littleblue' => [
				'emoji' => '🐦',
				'name'  => __( 'Little Blue Heron', 'dcc-wildlife' ),
				'sci'   => 'Egretta caerulea',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'certain',
				'flags' => [ 'protected' ],
				'safe'  => __( 'State-designated Threatened in Florida: watch from a distance and never disturb a nesting colony.', 'dcc-wildlife' ),
				'fact'  => __( 'The only heron here that changes colour with age — white as a youngster, slate-blue as an adult, a patchy “calico” in between. The white year seems to work as a passport: snowy egrets chase off adult little blues but let the white youngsters feed among them, and a youngster catches more fish in that company than alone.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'quiet, vegetated edges, hunting slow and deliberate', 'dcc-wildlife' ),
				'idgroup' => 'white',
				'mark' => __( 'young birds are white with greenish-yellow legs and a pale blue-grey bill tipped black; adults are slate-blue', 'dcc-wildlife' ),
			],
			'woodstork'  => [
				'emoji' => '🐦',
				'name'  => __( 'Wood Stork', 'dcc-wildlife' ),
				'sci'   => 'Mycteria americana',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'flags' => [ 'protected' ],
				'safe'  => __( 'Off the federal list since March 2026 — that is the good news — and still protected under Florida law while the state reviews where it now belongs: give feeding birds their space and let them work the shallows.', 'dcc-wildlife' ),
				'fact'  => __( 'Florida’s only native stork fishes entirely by touch: it wades with its bill held open underwater and snaps it shut the instant a fish brushes the inside. Listed as endangered in 1984 with the population down by three quarters, it came off the federal list altogether in March 2026 — recovered.', 'dcc-wildlife' ),
				'best'  => __( 'dry-season shallows', 'dcc-wildlife' ),
				'where' => __( 'wading shrinking pools where falling water traps the fish', 'dcc-wildlife' ),
				'idgroup' => 'white',
				'mark' => __( 'much bigger and heavier, with a bald dark scaly head and a thick drooping bill', 'dcc-wildlife' ),
				'sound' => __( 'Almost nothing. Adults are voiceless — capable only of a hiss — and “talk” by clattering those big bills like castanets. Only the nestlings make a racket.', 'dcc-wildlife' ),
			],
			// the ibises
			'ibis'       => [
				'emoji' => '🐦',
				'name'  => __( 'White Ibis', 'dcc-wildlife' ),
				'sci'   => 'Eudocimus albus',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'certain',
				'fact'  => __( 'A flock works the mud entirely by feel, the curved red bill closing on a crayfish it never sees. All white on the ground — the jet-black wingtips stay hidden until the whole flock goes up at once.', 'dcc-wildlife' ),
				'best'  => __( 'all day', 'dcc-wildlife' ),
				'where' => __( 'flocks working the shallows, the shoreline grass and the open lawns', 'dcc-wildlife' ),
				'sound' => __( 'An unmusical, harsh, nasal honk, usually from a flock passing overhead.', 'dcc-wildlife' ),
				'idgroup' => 'ibis',
				'mark' => __( 'a long, down-curved red bill and red legs; black wingtips flash in flight', 'dcc-wildlife' ),
			],
			'glossyibis' => [
				'emoji' => '🐦',
				'name' => __( 'Glossy Ibis', 'dcc-wildlife' ),
				'sci' => __( 'Plegadis falcinellus', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'likely',
				'fact' => __( 'A shadow at a distance; catch it in good light and it turns to bronze, copper and green. It probes the flooded margins in small flocks, with the same down-curved bill as the white ibis. Another self-made immigrant — it crossed from the Old World under its own power, and was here by 1817.', 'dcc-wildlife' ),
				'best' => __( 'mornings, in good light', 'dcc-wildlife' ),
				'where' => __( 'flooded margins and wet grass, usually in small flocks', 'dcc-wildlife' ),
				'idgroup' => 'ibis',
				'mark' => __( 'the same down-curved bill as the white ibis, but dark — iridescent bronze and green in good light', 'dcc-wildlife' ),
			],
			// the tall dark ones
			'heron'      => [
				'emoji' => '🐦',
				'name'  => __( 'Great Blue Heron', 'dcc-wildlife' ),
				'sci'   => 'Ardea herodias',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'certain',
				'fact'  => __( 'A hinge in the sixth bone of the neck lets it fold the whole neck into a spring and fire the bill forward from it. Its eyes carry enough rods to hunt in the dark, so daylight is only half of its working day.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'standing statue-still in the shallows along the bank', 'dcc-wildlife' ),
				'idgroup' => 'dark',
				'mark' => __( 'the biggest of them — grey-blue, a heavy yellowish bill, a black plume over the eye, and it flies with its neck folded back', 'dcc-wildlife' ),
				'sound' => __( 'A hoarse, prehistoric “frawnk” of complaint as it lifts off the bank — Cornell times the call at about twenty seconds, and it can feel longer.', 'dcc-wildlife' ),
			],
			'tricolored' => [
				'emoji' => '🐦',
				'name'  => __( 'Tricolored Heron', 'dcc-wildlife' ),
				'sci'   => 'Egretta tricolor',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'flags' => [ 'protected' ],
				'safe'  => __( 'State-designated Threatened in Florida: watch from a distance and never disturb a nesting colony.', 'dcc-wildlife' ),
				'fact'  => __( 'A restless, acrobatic hunter that dashes, pirouettes, and rakes the bottom with one foot to panic the minnows into moving. Fish are ninety per cent and more of everything it eats — there is no fallback.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'dancing through the shallow edges after small fish', 'dcc-wildlife' ),
				'sound' => __( 'Usually quiet; a short guttural bark when something flushes it off the bank.', 'dcc-wildlife' ),
				'idgroup' => 'dark',
				'mark' => __( 'the only dark heron here with a clean white belly, and a white stripe down the neck', 'dcc-wildlife' ),
			],
			'sandhill' => [
				'emoji' => '🐦',
				'name' => __( 'Florida Sandhill Crane', 'dcc-wildlife' ),
				'sci' => __( 'Antigone canadensis pratensis', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'certain',
				'flags' => [ 'protected' ],
				'safe' => __( 'Never feed them — it is against Florida law, and a fed crane learns to walk up to strangers and into roads. Give a pair with a colt plenty of room; they will defend it.', 'dcc-wildlife' ),
				'fact' => __( 'Florida has its own crane: a subspecies that never migrates. A pair holds the same ground for years and walks the lawns as though they own them, which they rather do — and in late winter, migrants down from the north swell the numbers. The chicks are called colts, and walk with their parents from the first day.', 'dcc-wildlife' ),
				'best' => __( 'mornings and evenings', 'dcc-wildlife' ),
				'where' => __( 'open lawns, pasture and marsh edges — usually a pair, often with a colt', 'dcc-wildlife' ),
				'idgroup' => 'dark',
				'mark' => __( 'grey with a red crown, and it flies with its neck straight out — a heron folds its neck back into an S', 'dcc-wildlife' ),
				'sound' => __( 'A rolling, rattling bugle that carries better than a mile, resonated by a windpipe coiled into the breastbone.', 'dcc-wildlife' ),
			],
			// night herons and the bittern
			'bcnightheron' => [
				'emoji' => '🐦',
				'name' => __( 'Black-crowned Night Heron', 'dcc-wildlife' ),
				'sci' => __( 'Nycticorax nycticorax', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'likely',
				'fact' => __( 'It spends the day hunched and silent in a shady tree, looking like a bird with nowhere to be, and comes down to the water at dusk to do its fishing. Its scientific name means “night raven”, and that is exactly what it sounds like going over in the dark.', 'dcc-wildlife' ),
				'best' => __( 'dusk and after dark', 'dcc-wildlife' ),
				'where' => __( 'roosting in cypress and willow by day, at the water’s edge after sundown', 'dcc-wildlife' ),
				'idgroup' => 'night',
				'mark' => __( 'a black crown and back over pale grey, a short thick bill, and a red eye', 'dcc-wildlife' ),
				'sound' => __( 'A flat, barking “quok” from overhead after dark — usually the only sign it is there at all.', 'dcc-wildlife' ),
			],
			'ycnightheron' => [
				'emoji' => '🐦',
				'name' => __( 'Yellow-crowned Night Heron', 'dcc-wildlife' ),
				'sci' => __( 'Nyctanassa violacea', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'likely',
				'fact' => __( 'A crayfish specialist, and the bill is the proof: short, deep and heavy enough to crack a shell open. Grey overall, with a boldly striped black-and-white face under the pale crown it is named for. Rather more willing to work in daylight than its cousin.', 'dcc-wildlife' ),
				'best' => __( 'dusk, and often through the day', 'dcc-wildlife' ),
				'where' => __( 'the wooded margins and roadside ditches, hunting crayfish', 'dcc-wildlife' ),
				'idgroup' => 'night',
				'mark' => __( 'a striped black-and-white face under a pale crown, and longer legs than the black-crowned', 'dcc-wildlife' ),
				'sound' => __( 'A short “quawk”, higher and less harsh than the black-crowned’s.', 'dcc-wildlife' ),
			],
			'greenheron' => [
				'emoji' => '🐦',
				'name'  => __( 'Green Heron', 'dcc-wildlife' ),
				'sci'   => 'Butorides virescens',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'One of the very few birds on Earth that fishes with bait. It drops a twig, a feather or an insect onto the water and waits for the fish that comes to look — and it does not just find the twig, it trims it to length first, which makes it a tool-maker, not only a tool-user.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'crouched low on a branch or root over shady water', 'dcc-wildlife' ),
				'sound' => __( 'A single explosive “skeow” as it bursts off the bank — unmistakable once you have heard it.', 'dcc-wildlife' ),
				'idgroup' => 'night',
				'mark' => __( 'small and crouched, with a dark green back and a rich chestnut neck', 'dcc-wildlife' ),
			],
			'leastbittern' => [
				'emoji' => '🐦',
				'name' => __( 'Least Bittern', 'dcc-wildlife' ),
				'sci' => __( 'Ixobrychus exilis', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'occasional',
				'fact' => __( 'The smallest heron in the Americas, and it has stopped bothering to wade: it straddles two cattail stems and climbs through the reeds instead, which lets it fish water far too deep for its legs. Alarmed, it points its bill straight up and becomes one more vertical stem. Present far more often than seen.', 'dcc-wildlife' ),
				'best' => __( 'dawn and dusk in the growing season', 'dcc-wildlife' ),
				'where' => __( 'deep in the cattails and reed beds — listen rather than look', 'dcc-wildlife' ),
				'idgroup' => 'night',
				'mark' => __( 'tiny and buff with big pale wing patches, and it clings to reed stems instead of standing in the water', 'dcc-wildlife' ),
				'sound' => __( 'A soft, low, dovelike “coo-coo-coo” from somewhere inside the reeds.', 'dcc-wildlife' ),
			],
			// swimmers
			'anhinga'    => [
				'emoji' => '🐦',
				'name'  => __( 'Anhinga', 'dcc-wildlife' ),
				'sci'   => 'Anhinga anhinga',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'certain',
				'fact'  => __( 'The “snakebird”, swimming with nothing but its neck above water. Its feathers are not waterproof, and that is the point — soaked, it stops floating and can hunt underwater — but it pays for the trick afterwards, perched with its wings held open until it has dried out.', 'dcc-wildlife' ),
				'best'  => __( 'sunny middays', 'dcc-wildlife' ),
				'where' => __( 'perched wings-out on snags and dock rails, drying off', 'dcc-wildlife' ),
				'idgroup' => 'dark',
				'mark' => __( 'a straight dagger bill and a long fanned tail; it swims with only the snaky neck showing, and perches with wings spread to dry', 'dcc-wildlife' ),
				'sound' => __( 'A loud clicking near the nest that the Cornell Lab likens to a treadle sewing machine, or a croaking frog with a sore throat.', 'dcc-wildlife' ),
			],
			'cormorant' => [
				'emoji' => '🐦',
				'name' => __( 'Double-crested Cormorant', 'dcc-wildlife' ),
				'sci' => __( 'Nannopterum auritum', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'certain',
				'fact' => __( 'The anhinga’s double, and the reason half the “anhingas” people point at are not. It swims low with its back awash, chases fish down with its feet, and dries off in the same wings-open pose — but the bill ends in a hook where the anhinga’s ends in a dagger.', 'dcc-wildlife' ),
				'best' => __( 'all day', 'dcc-wildlife' ),
				'where' => __( 'swimming low in the channel, or perched on pilings with its wings half open', 'dcc-wildlife' ),
				'idgroup' => 'dark',
				'mark' => __( 'a hooked orange bill and a short tail; it floats with its back showing, where an anhinga shows only the neck', 'dcc-wildlife' ),
				'sound' => __( 'Mostly silent away from a colony; a low, pig-like grunt at close range.', 'dcc-wildlife' ),
			],
			'commongallinule' => [
				'emoji' => '🐦',
				'name' => __( 'Common Gallinule', 'dcc-wildlife' ),
				'sci' => __( 'Gallinula galeata', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'certain',
				'fact' => __( 'The chicken of the marsh: a red shield up the forehead, a candy-corn bill, and feet big enough to walk on lily pads. It swims with a constant forward jerk of the head, as though the water needed encouraging, and scolds anything that comes near.', 'dcc-wildlife' ),
				'best' => __( 'all day', 'dcc-wildlife' ),
				'where' => __( 'out on the lily pads and along the reedy edges, walking on the vegetation', 'dcc-wildlife' ),
				'idgroup' => 'swimmer',
				'mark' => __( 'a bright red bill and forehead shield tipped yellow, and a white stripe along the flank', 'dcc-wildlife' ),
				'sound' => __( 'A loud, laughing run of clucks and whinnies from inside the reeds.', 'dcc-wildlife' ),
			],
			'purplegallinule' => [
				'emoji' => '🐦',
				'name' => __( 'Purple Gallinule', 'dcc-wildlife' ),
				'sci' => __( 'Porphyrio martinica', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'likely',
				'fact' => __( 'Absurd in the best way: purple-blue in front, bronze-green behind, a pale blue shield on the forehead, a candy-red bill, and enormous yellow feet that carry it clean across the lily pads. It climbs the pickerelweed to pick seeds, and looks, honestly, painted.', 'dcc-wildlife' ),
				'best' => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'walking the lily pads and pickerelweed in the quiet backwaters', 'dcc-wildlife' ),
				'idgroup' => 'swimmer',
				'mark' => __( 'unmistakable — purple and green with a pale blue shield and long yellow legs', 'dcc-wildlife' ),
			],
			'coot' => [
				'emoji' => '🐦',
				'name' => __( 'American Coot', 'dcc-wildlife' ),
				'sci' => __( 'Fulica americana', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'certain',
				'fact' => __( 'Not a duck at all — a rail that took to open water, with each toe lobed rather than the whole foot webbed. It bobs its head as it swims, and it cannot simply lift off: it has to run flapping across the surface first. Winter brings big rafts of them onto the lakes.', 'dcc-wildlife' ),
				'best' => __( 'winter, all day', 'dcc-wildlife' ),
				'where' => __( 'rafts on the open lake and out at the canal mouth', 'dcc-wildlife' ),
				'idgroup' => 'swimmer',
				'mark' => __( 'sooty black all over with a clean white bill and forehead — no red anywhere', 'dcc-wildlife' ),
			],
			'grebe' => [
				'emoji' => '🐦',
				'name' => __( 'Pied-billed Grebe', 'dcc-wildlife' ),
				'sci' => __( 'Podilymbus podiceps', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'likely',
				'fact' => __( 'Small, brown, and able to do something a duck cannot: it squeezes the air out of its feathers and sinks, straight down, without a dive or a splash — and surfaces somewhere you are not looking. A black band rings the pale bill in the breeding season.', 'dcc-wildlife' ),
				'best' => __( 'calm mornings', 'dcc-wildlife' ),
				'where' => __( 'alone on quiet open water — and then not there', 'dcc-wildlife' ),
				'idgroup' => 'swimmer',
				'mark' => __( 'small and brown with a short, thick pale bill; it sinks out of sight rather than diving', 'dcc-wildlife' ),
			],
			// ducks
			'woodduck' => [
				'emoji' => '🦆',
				'name' => __( 'Wood Duck', 'dcc-wildlife' ),
				'sci' => __( 'Aix sponsa', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'certain',
				'fact' => __( 'The drake has a fair claim to being the most ornate duck in North America — an iridescent green and purple head, a white-striped face, a chestnut breast, a red eye. They nest in tree holes over the swamp, and the day after hatching the ducklings climb to the entrance and jump — fifty feet if that is the drop — and walk away from it.', 'dcc-wildlife' ),
				'best' => __( 'dawn and dusk', 'dcc-wildlife' ),
				'where' => __( 'shaded cypress backwaters — they flush with a rising squeal', 'dcc-wildlife' ),
				'idgroup' => 'duck',
				'mark' => __( 'a crested head and a long square tail; the hen is plain grey-brown with a white teardrop around the eye', 'dcc-wildlife' ),
				'sound' => __( 'The hen’s rising “oo-eek” squeal as she comes up off the water.', 'dcc-wildlife' ),
			],
			'mottledduck' => [
				'emoji' => '🦆',
				'name' => __( 'Florida Mottled Duck', 'dcc-wildlife' ),
				'sci' => __( 'Anas fulvigula fulvigula', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'certain',
				'fact' => __( 'Florida’s own duck: it does not migrate, and the peninsula’s birds are found nowhere else on Earth. Both sexes look like a dark female mallard. The threat to it is not hunting but romance — released farmyard mallards interbreed with it, and state biologists call that the single biggest danger to the species.', 'dcc-wildlife' ),
				'best' => __( 'dawn and dusk', 'dcc-wildlife' ),
				'where' => __( 'paired up in the quiet shallows and the marsh ponds', 'dcc-wildlife' ),
				'idgroup' => 'duck',
				'mark' => __( 'like a dark female mallard, but with a plain unstreaked buff throat and no white edging on the tail', 'dcc-wildlife' ),
			],
			'whistlingduck' => [
				'emoji' => '🦆',
				'name' => __( 'Black-bellied Whistling Duck', 'dcc-wildlife' ),
				'sci' => __( 'Dendrocygna autumnalis', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'certain',
				'fact' => __( 'A long-legged, goose-shaped duck that perches in trees, nests in holes, and announces itself with a whistle. Bright pink bill, grey face, chestnut body, a broad white wing stripe in flight. In 1981 there was one flock of them in Florida, at Sarasota; they now hold very nearly the whole peninsula.', 'dcc-wildlife' ),
				'best' => __( 'dusk, and overhead at any hour', 'dcc-wildlife' ),
				'where' => __( 'perched on branches and lawns, or whistling over in a tight flock', 'dcc-wildlife' ),
				'idgroup' => 'duck',
				'mark' => __( 'a bright pink bill and long pink legs — and it whistles as it flies', 'dcc-wildlife' ),
				'sound' => __( 'A clear, high, four-note whistle from overhead; you hear the flock well before you see it.', 'dcc-wildlife' ),
			],
			// and the rest
			'pelican' => [
				'emoji' => '🐦',
				'name' => __( 'American White Pelican', 'dcc-wildlife' ),
				'sci' => __( 'Pelecanus erythrorhynchos', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'likely',
				'fact' => __( 'Nine feet of wingspan, and here only for the winter. It never dives from the air the way the coastal brown pelican does — instead a flock forms a line, swims at the shallows beating its wings, drives the fish ahead of it and dips together. In spring they leave for prairie lakes a thousand miles north.', 'dcc-wildlife' ),
				'best' => __( 'winter, mid-morning', 'dcc-wildlife' ),
				'where' => __( 'in flocks on the open lakes — seldom in the canal itself', 'dcc-wildlife' ),
				'mark' => __( 'its sheer size — nine feet of white with black wingtips and a yellow-orange bill — and by the fact that it swims to feed and never plunges', 'dcc-wildlife' ),
			],
			'kingfisher' => [
				'emoji' => '🐦',
				'name'  => __( 'Belted Kingfisher', 'dcc-wildlife' ),
				'sci'   => 'Megaceryle alcyon',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'It hangs on beating wings over the water, then goes in headfirst. The female is the brighter of the pair, with a rusty band across the belly the male simply does not have — which is the wrong way round for most birds, and nobody is quite sure why. Mostly a winter visitor here.', 'dcc-wildlife' ),
				'best'  => __( 'all day', 'dcc-wildlife' ),
				'where' => __( 'low perches and wires over the water — listen for the dry rattle', 'dcc-wildlife' ),
				'sound' => __( 'A hard, dry, mechanical rattle thrown back over its shoulder as it flies off ahead of you; it answers the slightest disturbance.', 'dcc-wildlife' ),
			],
			'limpkin'    => [
				'emoji' => '🐦',
				'name'  => __( 'Limpkin', 'dcc-wildlife' ),
				'sci'   => 'Aramus guarauna',
				'group' => 'birds',
				'browse' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'A bird that has bet everything on one snail. Apple snails are nearly its whole diet, and the bill is the tool: it never quite closes, so the tip grips like tweezers, and it bends slightly right to follow the shell’s own spiral. Find a neat pile of empty shells on the bank and you have found a limpkin’s table.', 'dcc-wildlife' ),
				'best'  => __( 'dawn, dusk, and long after dark', 'dcc-wildlife' ),
				'where' => __( 'stalking the reedy shallows — you will usually hear it long before you see it', 'dcc-wildlife' ),
				'sound' => __( 'A long, grating, high-pitched scream, mostly after dark, made with a looped windpipe. Cornell supplied one to Hollywood — it is the voice of the hippogriff in Harry Potter and the Prisoner of Azkaban.', 'dcc-wildlife' ),
			],
			'fishcrow' => [
				'emoji' => '🐦',
				'name' => __( 'Fish Crow', 'dcc-wildlife' ),
				'sci' => __( 'Corvus ossifragus', 'dcc-wildlife' ),
				'group' => 'birds',
				'browse' => 'birds',
				'odds' => 'certain',
				'fact' => __( 'Identical to an American crow until it opens its mouth. The nasal two-note call is the whole identification — it sounds like a crow that has been asked a question and is denying everything. It patrols the water’s edge for anything edible, other birds’ eggs included.', 'dcc-wildlife' ),
				'best' => __( 'all day', 'dcc-wildlife' ),
				'where' => __( 'everywhere — the dock, the trees, the lawn', 'dcc-wildlife' ),
				'mark' => __( 'its voice alone — a short, nasal “uh-uh”, never the clean caw of an American crow', 'dcc-wildlife' ),
				'sound' => __( 'A nasal, two-note “uh-uh” — the one reliable way to separate it from an American crow, though a young American crow can sound nasal too.', 'dcc-wildlife' ),
			],

			// ---- PLANTS ------------------------------------------------
			'cypress'    => [
				'browse' => 'trees',
				'emoji' => '🌲',
				'name'  => __( 'Bald Cypress', 'dcc-wildlife' ),
				'sci'   => 'Taxodium distichum',
				'group' => 'plants',
				'idgroup' => 'cypresses',
				'odds'  => 'certain',
				'fact'  => __( 'The cathedral tree of the canal, and older than the canal itself: this was the Elfin River until 1882, when crews widened it for the steamboats, and the cypress were already old men by then. The species can pass 2,000 years. What the woody “knees” along the bank are actually for still genuinely puzzles botanists after two centuries of argument.', 'dcc-wildlife' ),
				'best'  => __( 'golden hour', 'dcc-wildlife' ),
				'where' => __( 'lining both banks — the knees poke up along the waterline', 'dcc-wildlife' ),
			],
			'moss'       => [
				'browse' => 'trees',
				'emoji' => '🌿',
				'name'  => __( 'Spanish Moss', 'dcc-wildlife' ),
				'sci'   => 'Tillandsia usneoides',
				'group' => 'plants',
				'idgroup' => 'airplants',
				'odds'  => 'certain',
				'fact'  => __( 'Not a moss, and not a parasite: it is an air plant in the pineapple family, and the tree is a perch and nothing more. It has no roots at all. Every drop it drinks comes in through the tiny silvery scales that sheathe each strand and give the whole thing its grey.', 'dcc-wildlife' ),
				'best'  => __( 'any time', 'dcc-wildlife' ),
				'where' => __( 'draped from the cypress and oak canopy overhead', 'dcc-wildlife' ),
			],
			'fern'       => [
				'browse' => 'trees',
				'emoji' => '🌱',
				'name'  => __( 'Resurrection Fern', 'dcc-wildlife' ),
				'sci'   => 'Pleopeltis michauxiana',
				'group' => 'plants',
				'odds'  => 'certain',
				'fact'  => __( 'In a dry spell it curls up grey and to all appearances dead, having let go of more than 95% of its water. Then it rains, and within about half a day it is photosynthesising again as though nothing had happened. It only rides on the bark; it takes nothing from the tree.', 'dcc-wildlife' ),
				'best'  => __( 'right after rain', 'dcc-wildlife' ),
				'where' => __( 'carpeting the tops of the big oak and cypress limbs', 'dcc-wildlife' ),
			],
			'lily'       => [
				'browse' => 'waterplants',
				'emoji' => '🌸',
				'name'  => __( 'White Waterlily', 'dcc-wildlife' ),
				'sci'   => 'Nymphaea odorata',
				'group' => 'plants',
				'idgroup' => 'lilypads',
				'odds'  => 'certain',
				'fact'  => __( 'The fragrant white blooms keep office hours: open in the early morning, shut again by around noon. The pads below them are the busiest real estate on the canal — shade and cover for the fish underneath, a dry platform for the frogs and dragonflies on top.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'quiet coves and canal edges', 'dcc-wildlife' ),
			],
			'palmetto'   => [
				'browse' => 'wildflowers',
				'emoji' => '🌴',
				'name'  => __( 'Saw Palmetto', 'dcc-wildlife' ),
				'sci'   => 'Serenoa repens',
				'group' => 'plants',
				'odds'  => 'certain',
				'fact'  => __( 'Ancient, and built to outlive a fire: the stem that matters runs along underground, so the plant simply sends up new fans once the burn has passed. The spring flowers are a serious nectar source, and the berries feed black bears, foxes and better than a hundred kinds of bird.', 'dcc-wildlife' ),
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
		/*
		 * MEMOISED FOR THE REQUEST (1.41.1).
		 *
		 * This literal is 402 entries and the filter runs over all of them.
		 * Measured: one hub render rebuilt it TWELVE times — Render alone
		 * calls dataset() at five points, and dataset() calls this. The page
		 * is heavily cached, so a guest rarely pays it; a cache miss, an
		 * Elementor preview, a REST detail call and every crawler hit do.
		 *
		 * Per-REQUEST only: a static, not a transient. Filters are registered
		 * at plugin load, long before anything renders, so a filter added
		 * after the first call would be one added mid-render — which nothing
		 * here does. `flush_cache()` exists for the suites, which add filters
		 * between renders on purpose.
		 */
		if ( null === self::$registry_cache ) {
			self::$registry_cache = apply_filters( 'dcc_wl_species', $species );
		}
		return self::$registry_cache;
	}

	/** @var array<string,mixed>|null */
	private static $registry_cache = null;

	/** @var array<int,array<string,mixed>>|null */
	private static $dataset_cache = null;

	/**
	 * Drop the per-request caches.
	 *
	 * For the test harness, which adds and removes `dcc_wl_species` and
	 * `dcc_wl_calendar` filters between renders inside one PHP process —
	 * something no web request does.
	 */
	public static function flush_cache(): void {
		self::$registry_cache = null;
		self::$dataset_cache  = null;
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
			// Know before you go (1.19.0) — seasonality notes in WATER-SOURCES.md
			'cottonmouth' => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Active Mar–Oct, out on warm winter days too.
			'diamondback' => [ 1, 1, 2, 3, 3, 2, 2, 2, 3, 3, 2, 1 ], // Most encounters spring and the Sep–Oct mating season.
			'pygmy'       => [ 1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 2, 1 ], // Warm months; young born Jul–Sep.
			'coralsnake'  => [ 0, 1, 2, 3, 3, 2, 2, 2, 3, 3, 1, 0 ], // Surface activity peaks spring and autumn.
			'fireant'     => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ], // Year-round; mounds most visible spring–autumn after rain.
			'poisonivy'   => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 1 ], // In leaf Mar–Nov; the bare vine still carries the oil.
			'mosquito'    => [ 1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 2, 1 ], // Wet season; no-see-ums spring and autumn.
			'lovebug'     => [ 0, 0, 0, 2, 3, 1, 0, 2, 3, 1, 0, 0 ], // Two flights: late Apr–May, late Aug–Sep (UF/IFAS).
			// Critters
			'noseeums'        => [ 1, 1, 2, 3, 3, 2, 2, 2, 3, 3, 2, 1 ], // Dawn/dusk, Apr–Nov; worst in the shoulder months (UF/IFAS).
			'canetoad'        => [ 1, 1, 2, 2, 3, 3, 3, 3, 3, 2, 1, 1 ], // Out on warm wet nights; quiet in the cool season.
			'blackwidow'      => [ 1, 1, 2, 2, 2, 3, 3, 3, 3, 2, 2, 1 ], // Present all year, found most often in summer.
			'brownwidow'      => [ 1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2 ], // Now the commoner widow round buildings; year-round.
			'pusscaterpillar' => [ 0, 0, 0, 1, 1, 2, 2, 3, 3, 3, 2, 1 ], // Larvae late summer into autumn.
			'saddleback'      => [ 0, 0, 0, 1, 1, 2, 2, 3, 3, 3, 2, 1 ], // As the puss caterpillar — late summer into autumn.
			'paperwasps'      => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1 ], // Nests founded in spring, biggest by late summer.
			'yellowjacket'    => [ 1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 2, 1 ], // Southern colonies can overwinter, so nests get very large.
			'lonestartick'    => [ 1, 2, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1 ], // Peak spring into early summer.
			'chiggers'        => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Warm months, in long grass.
			'yellowfly'       => [ 0, 0, 1, 2, 3, 3, 2, 1, 1, 1, 0, 0 ], // A short fierce season, late spring into early summer.
			'treadsoftly'     => [ 1, 2, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1 ], // Flowers spring into summer; the hairs are there all year.
			'brazilianpepper' => [ 3, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3 ], // Evergreen; berries red late autumn into winter.
			'velvetant'       => [ 0, 1, 2, 2, 3, 3, 3, 3, 3, 2, 1, 0 ], // Females walk open sand on warm days.
			'blackracer'      => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1 ], // Active whenever it is warm; least in midwinter.
			'yellowratsnake'  => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1 ], // Climbing and hunting through the warm months.
			'cornsnake'       => [ 1, 1, 2, 2, 3, 3, 3, 3, 3, 2, 1, 1 ], // Nocturnal in high summer, so seen most then.
			'gartersnake'     => [ 1, 2, 3, 3, 3, 2, 2, 2, 3, 3, 2, 1 ], // Out after rain; quieter in the hottest weeks.
			'ribbonsnake'     => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1 ], // At the water’s edge through the warm months.
			'ringnecksnake'   => [ 1, 2, 3, 3, 3, 2, 2, 2, 3, 3, 2, 1 ], // Found after rain, spring and autumn.
			'roughgreensnake' => [ 0, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 0 ], // In leaf, when it is hidden by being green.
			'mudsnake'        => [ 0, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1, 0 ], // Warm wet nights in summer.
			'indigosnake'     => [ 2, 3, 3, 2, 2, 1, 1, 1, 1, 2, 2, 2 ], // Diurnal, and most often seen in the cool season.
			'greenanole'      => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1 ], // Out on any warm day, all year in practice.
			'brownanole'      => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ], // The commonest lizard here, out constantly.
			'fivelinedskink'  => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Basking on wood through the warm months.
			'broadheadskink'  => [ 1, 1, 2, 3, 3, 3, 2, 2, 2, 2, 1, 1 ], // Males in breeding colour in spring.
			'groundskink'     => [ 1, 2, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1 ], // In the litter whenever it is warm.
			'racerunner'      => [ 0, 1, 2, 3, 3, 3, 3, 3, 2, 2, 1, 0 ], // A hot-weather lizard; out in full midday sun.
			'glasslizard'     => [ 1, 1, 2, 3, 3, 3, 2, 2, 2, 2, 1, 1 ], // Most often found in spring, and after rain.
			'housegecko'      => [ 1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 1 ], // On lit walls every warm night.
			'greentreefrog'   => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1 ], // Calling from spring into autumn; quiet in the cool months.
			'squirreltreefrog' => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1 ], // As the green treefrog; rain calls extend the window.
			'barkingtreefrog' => [ 0, 1, 2, 3, 3, 3, 3, 3, 2, 2, 1, 0 ], // Breeding chorus spring into summer.
			'pinewoodstreefrog' => [ 0, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1, 0 ], // Calls after rain, late spring into summer.
			'cubantreefrog'   => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ], // Active nearly year-round on warm walls.
			'pigfrog'         => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1 ], // Grunting from the lilies through the warm months.
			'bullfrog'        => [ 0, 1, 2, 2, 3, 3, 3, 2, 2, 1, 1, 0 ], // At its southern range edge here; a summer voice at best.
			'leopardfrog'     => [ 2, 3, 3, 3, 3, 2, 2, 2, 3, 3, 3, 2 ], // Active in cooler weather than most — a spring and autumn frog.
			'gopherfrog'      => [ 1, 2, 3, 2, 2, 2, 3, 3, 2, 1, 1, 1 ], // Breeds after heavy rain; otherwise underground.
			'southerntoad'    => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1 ], // Under lights every warm night.
			'oaktoad'         => [ 0, 1, 2, 2, 3, 3, 3, 3, 3, 2, 1, 0 ], // Summer rains bring the choruses.
			'narrowmouthtoad' => [ 0, 1, 2, 2, 3, 3, 3, 3, 3, 2, 1, 0 ], // Calls after heavy rain, late spring into autumn.
			'spadefoot'       => [ 0, 0, 1, 1, 2, 3, 3, 3, 3, 2, 1, 0 ], // Only after a big storm — unpredictable, and summer-weighted.
			'cricketfrog'     => [ 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2 ], // Clicking at the waterline all year.
			'littlegrassfrog' => [ 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ], // Calls nearly year-round in the peninsula.
			'greenhousefrog'  => [ 1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 1 ], // Chirping from flowerbeds whenever it is warm and damp.
			'greatersiren'    => [ 1, 2, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1 ], // In the mud all year; most active in warm water.
			'amphiuma'        => [ 1, 2, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1 ], // As the siren — nocturnal, warm months.
			'peninsulanewt'   => [ 2, 3, 3, 3, 3, 2, 2, 2, 3, 3, 3, 2 ], // In weedy water all year; easiest to see in cool clear months.
			'muscovy'           => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Feral and resident; present every month.
			'ringneckedduck'    => [ 3, 3, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3 ], // Winter duck: Nov–Mar.
			'lesserscaup'       => [ 3, 3, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3 ], // Winter, on open water.
			'hoodedmerganser'   => [ 3, 3, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3 ], // Winter only.
			'bluewingedteal'    => [ 3, 3, 2, 1, 0, 0, 0, 1, 3, 3, 3, 3 ], // Earliest duck in and out — autumn and winter.
			'mallard'           => [ 3, 3, 2, 2, 1, 1, 1, 1, 1, 2, 2, 3 ], // Feral birds year-round; wild birds in winter.
			'shoveler'          => [ 3, 3, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3 ], // Winter.
			'wigeon'            => [ 3, 3, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3 ], // Winter.
			'egyptiangoose'     => [ 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2 ], // Resident where established; most obvious in spring.
			'loon'              => [ 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 1, 2 ], // Winter, in drab plumage, on the bigger lakes.
			'laughinggull'      => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ], // Commonest inland in the warm months.
			'ringbilledgull'    => [ 3, 3, 3, 2, 1, 1, 1, 1, 2, 2, 3, 3 ], // The common winter gull inland.
			'herringgull'       => [ 3, 3, 2, 1, 0, 0, 0, 0, 1, 1, 2, 3 ], // Winter, and fewer than the ring-billed.
			'bonapartesgull'    => [ 3, 3, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3 ], // Winter, and never in numbers here.
			'forsterstern'      => [ 3, 3, 3, 2, 1, 1, 1, 2, 3, 3, 3, 3 ], // Mostly autumn through spring, in winter plumage.
			'caspiantern'       => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ], // Present much of the year; commonest in the warm months.
			'blackskimmer'      => [ 1, 1, 2, 2, 3, 3, 3, 3, 3, 2, 2, 1 ], // Inland mostly in the warm months, and never reliably.
			'killdeer'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident and vocal every month.
			'spottedsandpiper'  => [ 3, 3, 3, 2, 1, 0, 1, 2, 3, 3, 3, 3 ], // Here Aug–May, in plain winter dress.
			'greateryellowlegs' => [ 3, 3, 3, 2, 1, 0, 1, 2, 3, 3, 3, 3 ], // Autumn through spring.
			'blackneckedstilt'  => [ 1, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1, 1 ], // Breeds here — a spring and summer bird.
			'wilsonssnipe'      => [ 3, 3, 3, 2, 1, 0, 0, 0, 1, 2, 3, 3 ], // Winter, in wet grass.
			'leastsandpiper'    => [ 3, 3, 3, 2, 1, 0, 1, 3, 3, 3, 3, 3 ], // Autumn through spring; a long window either side of summer.
			'swallowtailedkite' => [ 0, 1, 3, 3, 3, 3, 3, 3, 2, 0, 0, 0 ], // Here Mar–Aug, then gone to Brazil.
			'redshoulderedhawk' => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident and vocal all year.
			'redtailedhawk'     => [ 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3, 3 ], // Resident; more obvious in winter.
			'kestrel'           => [ 3, 3, 3, 2, 1, 1, 1, 1, 2, 3, 3, 3 ], // Residents all year, swelled by winter migrants.
			'coopershawk'       => [ 3, 3, 3, 2, 2, 2, 2, 2, 3, 3, 3, 3 ], // Resident; more visible in the cool months.
			'harrier'           => [ 3, 3, 2, 1, 0, 0, 0, 0, 1, 2, 3, 3 ], // Winter only, over open marsh.
			'shorttailedhawk'   => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2 ], // Present much of the year; most often seen soaring in warm weather.
			'merlin'            => [ 3, 3, 2, 1, 0, 0, 0, 0, 1, 2, 3, 3 ], // Winter.
			'peregrine'         => [ 3, 3, 2, 1, 0, 0, 0, 0, 2, 3, 3, 3 ], // Passage and winter.
			'blackvulture'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident everywhere, every month.
			'turkeyvulture'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident; numbers rise in winter.
			'barredowl'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident and calling all year.
			'greathornedowl'    => [ 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3, 3 ], // Calls and nests from midwinter.
			'screechowl'        => [ 3, 3, 3, 3, 3, 2, 2, 2, 3, 3, 3, 3 ], // Resident; most vocal late winter into spring.
			'barnowl'           => [ 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2 ], // Resident but local; nests early in the year.
			'chuckwillswidow'   => [ 0, 0, 3, 3, 3, 3, 3, 2, 1, 0, 0, 0 ], // Breeds here Mar–Aug; the spring voice of the woods.
			'whippoorwill'      => [ 3, 3, 2, 1, 0, 0, 0, 0, 1, 2, 3, 3 ], // Winter only here, and mostly silent.
			'nighthawk'         => [ 0, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 0 ], // Spring through autumn, over open sky at dusk.
			'wildturkey'        => [ 2, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2 ], // Resident; gobblers loudest in spring.
			'scrubjay'          => [ 2, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2 ], // Resident in the scrub — a trip, not a canal bird.
			'redcockaded'       => [ 2, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2 ], // Resident in old pine; nesting Mar–Jul.
			// Batch 12 (1.33.0): songbirds, doves and woodpeckers, part 1.
			'prothonotary'      => [ 0, 0, 1, 3, 3, 3, 3, 2, 1, 0, 0, 0 ], // Breeds here Apr-Aug.
			'parula'            => [ 2, 2, 3, 3, 3, 3, 3, 2, 2, 1, 1, 1 ], // Breeds here; some winter.
			'palmwarbler'       => [ 3, 3, 3, 2, 1, 0, 0, 0, 1, 3, 3, 3 ], // Winter, on every lawn Oct-Apr.
			'yellowrumped'      => [ 3, 3, 3, 2, 1, 0, 0, 0, 1, 2, 3, 3 ], // Winter, in flocks.
			'paintedbunting'    => [ 3, 3, 2, 1, 0, 0, 0, 0, 1, 2, 3, 3 ], // Winter only.
			'pileated'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'redbellied'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident and vocal all year.
			'downy'             => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'flicker'           => [ 3, 3, 3, 3, 2, 2, 2, 2, 2, 3, 3, 3 ], // Resident; more obvious in the cool months.
			'greatcrested'      => [ 1, 1, 3, 3, 3, 3, 3, 3, 2, 1, 1, 1 ], // Breeds here Mar-Aug; a loud spring arrival.
			'bluebird'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'shrike'            => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident on open country.
			'mockingbird'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident; the state bird, and everywhere.
			'cardinal'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'bluejay'           => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'carolinawren'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident and loud all year.
			'titmouse'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'boattailedgrackle' => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'redwinged'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'hummingbird'       => [ 1, 1, 3, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Mar-Oct; gone over midwinter.
			'purplemartin'      => [ 1, 3, 3, 3, 3, 3, 2, 1, 0, 0, 0, 0 ], // Feb-Jul, then away early.
			'barnswallow'       => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Spring through autumn.
			'cedarwaxwing'      => [ 3, 3, 3, 3, 2, 0, 0, 0, 0, 1, 2, 3 ], // Winter and spring, in fruiting trees.
			'mourningdove'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'grounddove'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'chickadee'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'treeswallow'       => [ 3, 3, 3, 2, 1, 0, 0, 0, 1, 2, 3, 3 ], // Winter, in big flocks over the lakes.
			'collareddove'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident and spreading.
			// Batch 13 (1.33.0): songbirds, doves and woodpeckers, part 2.
			'gnatcatcher'       => [ 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ], // Resident; quieter midwinter.
			'whiteeyedvireo'    => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident here.
			'redeyedvireo'      => [ 0, 1, 3, 3, 2, 2, 2, 2, 3, 3, 1, 0 ], // Passage, spring and autumn.
			'phoebe'            => [ 3, 3, 3, 2, 1, 0, 0, 0, 1, 2, 3, 3 ], // Winter only.
			'housewren'         => [ 3, 3, 2, 1, 0, 0, 0, 0, 1, 2, 3, 3 ], // Winter only.
			'catbird'           => [ 3, 3, 3, 2, 1, 0, 0, 0, 1, 3, 3, 3 ], // Winter; mewing from the thickets Oct-Apr.
			'brownthrasher'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'robin'             => [ 3, 3, 3, 1, 0, 0, 0, 0, 0, 1, 2, 3 ], // Winter flocks, Dec-Mar.
			'towhee'            => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'commongrackle'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'cowbird'           => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'goldfinch'         => [ 3, 3, 3, 2, 1, 0, 0, 0, 0, 1, 2, 3 ], // Winter, and never in numbers here.
			'pinewarbler'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident in pines.
			'yellowthroat'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident on wet edges.
			'blackandwhite'     => [ 3, 3, 3, 2, 1, 0, 1, 2, 3, 3, 3, 3 ], // Autumn through spring.
			'yellowthroated'    => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident - unusual for a warbler.
			'chippingsparrow'   => [ 3, 3, 3, 2, 1, 0, 0, 0, 1, 2, 3, 3 ], // Winter.
			'savannahsparrow'   => [ 3, 3, 2, 1, 0, 0, 0, 0, 0, 2, 3, 3 ], // Winter, in rough grass.
			'meadowlark'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident.
			'housefinch'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident around buildings.
			'chimneyswift'      => [ 0, 0, 2, 3, 3, 3, 3, 3, 3, 2, 0, 0 ], // Mar-Oct, always overhead.
			'kingbird'          => [ 0, 0, 1, 3, 3, 3, 3, 3, 2, 1, 0, 0 ], // Breeds here Apr-Aug.
			'summertanager'     => [ 0, 1, 3, 3, 3, 3, 3, 3, 2, 1, 0, 0 ], // Breeds here Mar-Aug.
			'indigobunting'     => [ 1, 1, 3, 3, 2, 1, 1, 1, 2, 3, 2, 1 ], // Passage mainly; a few winter.
			'kinglet'           => [ 3, 3, 3, 2, 1, 0, 0, 0, 0, 2, 3, 3 ], // Winter only.
			'redheaded'         => [ 2, 2, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2 ], // Resident but local, in open pine.
			'sapsucker'         => [ 3, 3, 2, 1, 0, 0, 0, 0, 0, 2, 3, 3 ], // Winter only.
			'hairy'             => [ 3, 3, 3, 3, 2, 2, 2, 2, 2, 3, 3, 3 ], // Resident, and scarcer than the downy.
			'whitewingeddove'   => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2 ], // Resident and spreading.
			'rockpigeon'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident around structures.
			'housesparrow'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident around buildings.
			'starling'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Resident; flocks in winter.
			// Batches 20-23 (1.33.0): the plants.
			'liveoak'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'laureloak'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'wateroak'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'turkeyoak'        => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2 ],
			'sabalpalm'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'magnolia'         => [ 2, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2 ],
			'redmaple'         => [ 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3 ],
			'sweetgum'         => [ 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3 ],
			'pondcypress'      => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'slashpine'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'longleafpine'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'sandpine'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'redcedar'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'dahoon'           => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'redbay'           => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'sweetbay'         => [ 2, 2, 2, 3, 3, 3, 3, 3, 2, 2, 2, 2 ],
			'loblollybay'      => [ 2, 2, 2, 2, 2, 3, 3, 3, 2, 2, 2, 2 ],
			'swamptupelo'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'popash'           => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'persimmon'        => [ 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3 ],
			'chickasawplum'    => [ 2, 3, 3, 2, 3, 2, 2, 2, 2, 2, 2, 2 ],
			'camphor'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'chinesetallow'    => [ 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3 ],
			'ballmoss'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'coontie'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'beautyberry'      => [ 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 2, 1 ],
			'coralbean'        => [ 1, 1, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1 ],
			'elderberry'       => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2 ],
			'waxmyrtle'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'tickseed'         => [ 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 2, 1 ],
			'blanketflower'    => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1 ],
			'spanishneedles'   => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'spiderwort'       => [ 1, 2, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1 ],
			'maypop'           => [ 0, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 0 ],
			'coralhoneysuckle'  => [ 2, 2, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2 ],
			'firebush'         => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 1 ],
			'muscadine'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'virginiacreeper'  => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'lantana'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'dogfennel'        => [ 1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 2, 1 ],
			'butterflyweed'    => [ 0, 1, 2, 3, 3, 3, 3, 3, 2, 1, 0, 0 ],
			'buttonbush'       => [ 1, 1, 2, 2, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'yaupon'           => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'floridarosemary'  => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'adamsneedle'      => [ 2, 2, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2 ],
			'pricklypear'      => [ 2, 2, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2 ],
			'reindeerlichen'   => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'airpotato'        => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 1 ],
			'cogongrass'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'pickerelweed'     => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'alligatorflag'    => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'cattail'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'sawgrass'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'spatterdock'      => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'lotus'            => [ 1, 1, 2, 2, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'arrowhead'        => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'stringlily'       => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1 ],
			'blueflag'         => [ 1, 2, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1 ],
			'bladderwort'      => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'eelgrass'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'maidencane'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'torpedograss'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'waterhyacinth'    => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'waterlettuce'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'hydrilla'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'duckweed'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'primrosewillow'   => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'alligatorweed'    => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			// Batches 14-19 (1.33.0): mammals, fish, small things, reptiles.
			'blackbear'          => [ 2, 2, 3, 3, 3, 3, 2, 2, 3, 3, 3, 2 ],
			'raccoon'            => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'opossum'            => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'armadillo'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'deer'               => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'wildhog'            => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'greysquirrel'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'foxsquirrel'        => [ 3, 3, 3, 3, 2, 2, 2, 2, 2, 3, 3, 3 ],
			'flyingsquirrel'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'marshrabbit'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'cottontail'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'greyfox'            => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'bobcat'             => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'coyote'             => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'skunk'              => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'cottonrat'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'freetailedbat'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'eveningbat'         => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'seminolebat'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'rhesus'             => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'pocketgopher'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'floridamouse'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'muskrat'            => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'scarletking'        => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'hognose'            => [ 1, 2, 3, 3, 3, 2, 2, 2, 3, 3, 2, 1 ],
			'coachwhip'          => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'crayfishsnake'      => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'sandskink'          => [ 2, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2 ],
			'wormlizard'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'scrublizard'        => [ 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'tropicalgecko'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'indopacificgecko'   => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'bluegill'           => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'redear'             => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'spottedsunfish'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'warmouth'           => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'redbreast'          => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'bluespotted'        => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'dollarsunfish'      => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'crappie'            => [ 3, 3, 3, 2, 1, 1, 1, 1, 1, 2, 3, 3 ],
			'sunshinebass'       => [ 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3, 3 ],
			'floridagar'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'longnosegar'        => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'bowfin'             => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'channelcatfish'     => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'whitecatfish'       => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'brownbullhead'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'yellowbullhead'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'pickerel'           => [ 3, 3, 3, 3, 2, 1, 1, 1, 2, 2, 3, 3 ],
			'goldenshiner'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'brooksilverside'    => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'threadfinshad'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'gizzardshad'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'seminolekillifish'  => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'goldentopminnow'    => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'leastkillifish'     => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'mosquitofish'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'sailfinmolly'       => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'chubsucker'         => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'eel'                => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'bluetilapia'        => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'armoredcatfish'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'grasscarp'          => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'greendarner'        => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'bluedasher'         => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'pondhawk'           => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'halloweenpennant'   => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'greatblueskimmer'   => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'fourspotted'        => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'needhams'           => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'saddlebags'         => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'amberwing'          => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'rambursforktail'    => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'citrineforktail'    => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'zebralongwing'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'gulffritillary'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'monarch'            => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'queen'              => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'viceroy'            => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'tigerswallowtail'   => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'giantswallowtail'   => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'palamedes'          => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'blackswallowtail'   => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'zebraswallowtail'   => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'spicebush'          => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'cloudlesssulphur'   => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'sleepyorange'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'barredyellow'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'southernwhite'      => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'whitepeacock'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'buckeye'            => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'redadmiral'         => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'phaoncrescent'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'ceraunusblue'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'grayhairstreak'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'longtailedskipper'  => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'fieryskipper'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'luna'               => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'imperialmoth'       => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'tersasphinx'        => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'waspmoth'           => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'islandapplesnail'   => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'asianclam'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'crayfish'           => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'grassshrimp'        => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'goldensilk'         => [ 1, 1, 1, 2, 2, 3, 3, 3, 3, 3, 2, 1 ],
			'spinyorbweaver'     => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'greenlynx'          => [ 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 2, 1 ],
			'regaljumper'        => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'carolinamantis'     => [ 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 2, 1 ],
			'walkingstick'       => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'lubber'             => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'hercules'           => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ],
			'tortoisebeetle'     => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2 ],
			'carpenterant'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'cockroach'          => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ],
			'firefly'            => [ 0, 0, 1, 2, 3, 3, 3, 2, 1, 0, 0, 0 ],
			'cicadas'            => [ 0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0 ],
			'alligator'  => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Most conspicuous Apr–Sep; spring courtship & bellowing.
			'manatee'    => [ 0, 0, 0, 1, 1, 1, 3, 3, 1, 1, 0, 0 ], // RARE, and warm-months-only — never a winter regular here.
			'otter'      => [ 3, 3, 3, 3, 1, 1, 1, 1, 1, 3, 3, 3 ], // Year-round; dawn & dusk.
			'peninsulacooter' => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1 ], // Baskers: out whenever the sun is on the logs, peak Mar–Oct.
			'redbelliedcooter' => [ 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1 ], // With the peninsula cooters, same window.
			'redearedslider'  => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Basks with the cooters; fewer of them, so a narrower peak.
			'softshell'       => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Warm months; hauls out on bank rather than logs.
			'snappingturtle'  => [ 1, 1, 2, 2, 3, 3, 2, 2, 2, 1, 1, 1 ], // Seen when it crosses land to nest, May–Jun.
			'gophertortoise'  => [ 1, 2, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1 ], // Grazes near the burrow on warm mornings; least active midwinter.
			'boxturtle'       => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // On the move after rain through the warm months.
			'muskturtle'      => [ 1, 1, 2, 2, 3, 3, 3, 3, 3, 2, 1, 1 ], // Bottom-walker; found on warm nights in summer.
			'loggerheadmusk'  => [ 1, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1, 1 ], // Spring runs, clearest and busiest in summer.
			'stripedmudturtle' => [ 1, 2, 3, 3, 3, 2, 2, 2, 3, 3, 2, 1 ], // Moves when the shallow places hold water — spring and autumn rains.
			'floridamudturtle' => [ 1, 2, 3, 3, 3, 2, 2, 2, 3, 3, 2, 1 ], // As the striped mud turtle; rarer everywhere.
			'chickenturtle'   => [ 1, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 1 ], // Most active and most seen in spring.
			'bandedwater' => [ 0, 0, 1, 3, 3, 3, 3, 3, 3, 1, 0, 0 ], // Out on warm days (the old generic 'snake' row).
			'brownwater' => [ 0, 0, 1, 3, 3, 3, 3, 3, 2, 1, 0, 0 ], // Basks over water spring–summer; FWC/Florida Museum.
			'greenwater' => [ 0, 0, 1, 2, 3, 3, 3, 3, 2, 1, 0, 0 ], // Warm-season, marsh edges.
			'fish'       => [ 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3 ], // Trophy bass peak: winter–spring spawn, plus a fall feed-up.
			'applesnail' => [ 1, 1, 1, 2, 2, 3, 3, 3, 2, 1, 1, 1 ], // Egg clutches spring–summer.
			// Birds
			'eagle'      => [ 3, 3, 3, 2, 1, 0, 0, 0, 1, 2, 3, 3 ], // FL nesting is the cool season (Oct–May).
			'osprey'     => [ 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3 ], // Year-round; nesting Dec–Apr.
			'anhinga'    => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Year-round resident.
			'heron'      => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Abundant year-round resident.
			'egret'      => [ 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2 ], // Year-round; plumes peak in spring.
			'kingfisher' => [ 3, 3, 2, 1, 0, 0, 0, 1, 2, 3, 3, 3 ], // Winter visitor; breeds far north in summer.
			'limpkin'    => [ 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2 ], // Year-round; loudest in spring breeding.
			'ibis'       => [ 3, 3, 3, 3, 2, 2, 2, 2, 3, 3, 3, 3 ], // Abundant year-round.
			'woodstork'  => [ 3, 3, 3, 2, 1, 1, 1, 1, 1, 2, 3, 3 ], // Concentrates at shrinking dry-season pools.
			'littleblue' => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Year-round resident.
			'tricolored' => [ 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1 ], // Regular inland, densest on the coast.
			'greenheron' => [ 1, 1, 2, 2, 3, 3, 3, 3, 2, 2, 1, 1 ], // More numerous & vocal in the warm breeding season.
			'greategret'  => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Abundant year-round resident.
			'cattleegret' => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2 ], // Year-round; numbers swell in the breeding season.
			'bcnightheron' => [ 2, 2, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2 ], // Year-round; most conspicuous in the breeding season.
			'ycnightheron' => [ 1, 1, 2, 3, 3, 3, 3, 3, 2, 2, 1, 1 ], // Warm-season breeder; many withdraw south in winter.
			'leastbittern' => [ 1, 1, 1, 2, 3, 3, 3, 3, 2, 1, 1, 1 ], // Summer breeder in central FL; calls Apr–Aug.
			'glossyibis'  => [ 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2 ], // Year-round; more numerous in the wet season.
			'sandhill'    => [ 3, 3, 3, 3, 2, 2, 2, 2, 2, 3, 3, 3 ], // Resident pairs all year; migrants swell Nov–Feb.
			'cormorant'   => [ 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3, 3 ], // Year-round; northern birds add to winter numbers.
			'commongallinule' => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Abundant year-round resident.
			'purplegallinule' => [ 1, 1, 2, 3, 3, 3, 3, 3, 2, 2, 1, 1 ], // Warm season; scarce inland in midwinter.
			'coot'        => [ 3, 3, 3, 2, 1, 0, 0, 0, 1, 2, 3, 3 ], // Winter abundant; nearly absent in summer.
			'grebe'       => [ 3, 3, 3, 2, 1, 1, 1, 1, 1, 2, 3, 3 ], // Resident, but far more numerous in winter.
			'woodduck'    => [ 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3 ], // Resident; most visible in the cool season.
			'mottledduck' => [ 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3 ], // Resident; pairs are conspicuous in winter–spring.
			'whistlingduck' => [ 2, 2, 2, 3, 3, 3, 3, 3, 3, 2, 2, 2 ], // Resident and expanding; most numerous in the warm months.
			'pelican'     => [ 3, 3, 3, 2, 1, 0, 0, 0, 0, 1, 2, 3 ], // Winter visitor only (Nov–Apr).
			'fishcrow'    => [ 2, 2, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2 ], // Year-round; noisiest in the spring breeding season.
			// Plants
			'cypress'    => [ 2, 2, 3, 3, 3, 3, 3, 3, 2, 3, 3, 2 ], // Spring green-up; rust-orange in fall.
			'moss'       => [ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 ], // Evergreen year-round.
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
	 * detail sheet and, since 1.19.0, as the tile image (a 320px 4:3 thumb —
	 * photo-first; a species without one shows its group glyph). Only
	 * species with an accurate, vetted photo appear here; the rest fall back to
	 * their drawn scene + sprite, so a wrong-species stock photo can never
	 * undercut the guide's accuracy. Filterable via `dcc_wl_photos`.
	 *
	 * @return array<string,string>
	 */
	/**
	 * Pixel width of each original photo — the srcset descriptor for the
	 * full-size file (1.17.0). Measured once here rather than getimagesize()
	 * on every render. Update if a photo is replaced.
	 */
	private const PHOTO_W = [
		// Batch 1 of the Phase 2 photo run (1.23.1), Adobe Stock free tier.
		'greategret' => 1100, 'cattleegret' => 1100, 'glossyibis' => 1100,
		'sandhill' => 1100, 'bcnightheron' => 1100, 'cormorant' => 1100,
		// Batch 2 (1.24.0), Wikimedia Commons. The coot's original is
		// portrait (1100x1216) and the grebe's landscape; PHOTO_W is the
		// srcset width descriptor, so only the width is recorded either way.
		'ycnightheron' => 1100, 'purplegallinule' => 1100, 'commongallinule' => 1100,
		'grebe' => 1100, 'woodduck' => 1100, 'coot' => 1100,
		// Batch 3 (1.25.0), Wikimedia Commons.
		'mottledduck' => 1100, 'whistlingduck' => 1100, 'pelican' => 1100,
		'fishcrow' => 1100,
		// Batch 4 (1.26.0). The pygmy rattlesnake and the fire ant mound are
		// portrait and square respectively; PHOTO_W is the srcset width
		// descriptor, so only the width is recorded.
		'cottonmouth' => 1100, 'diamondback' => 1100, 'pygmy' => 1100,
		'coralsnake' => 1100, 'brownwater' => 1100, 'greenwater' => 1100,
		'fireant' => 1100, 'poisonivy' => 1100, 'mosquito' => 1100,
		'lovebug' => 1100, 'leastbittern' => 1100,
		// Batch 5 (1.28.0).
		'bandedwater' => 1100, 'applesnail' => 1100, 'littleblue' => 1100,
		'tricolored' => 1100, 'woodstork' => 1100, 'ibis' => 1100, 'fern' => 1100,
		'alligator' => 1100, 'anhinga' => 1100, 'cypress' => 950, 'eagle' => 1100,
		'egret' => 950, 'fish' => 1100, 'greenheron' => 1100, 'heron' => 1100,
		'kingfisher' => 1100, 'lily' => 733, 'limpkin' => 1100, 'manatee' => 1100,
		'moss' => 950, 'osprey' => 1100, 'otter' => 733, 'palmetto' => 950,
		// Batch 7 (1.33.0). The yellowjacket's source is only 1024 wide,
		// so its full rendition is 1024 and not 1100.
		'noseeums' => 1100, 'canetoad' => 1100, 'blackwidow' => 1100, 'brownwidow' => 1100, 'pusscaterpillar' => 1100, 'saddleback' => 1100, 'paperwasps' => 1100, 'yellowjacket' => 1024, 'lonestartick' => 1100, 'chiggers' => 1100, 'yellowfly' => 1100, 'treadsoftly' => 1100, 'brazilianpepper' => 1100, 'velvetant' => 1100,
		// Batch 8 (1.33.0).
		'blackracer' => 1100, 'yellowratsnake' => 1100, 'cornsnake' => 1100, 'gartersnake' => 1100, 'ribbonsnake' => 1100, 'ringnecksnake' => 1100, 'roughgreensnake' => 1100, 'mudsnake' => 1100, 'indigosnake' => 1100, 'greenanole' => 1100, 'brownanole' => 1100, 'fivelinedskink' => 1100, 'broadheadskink' => 1100, 'groundskink' => 1100, 'racerunner' => 1100, 'glasslizard' => 1100, 'housegecko' => 1100,
		// Batch 9 (1.33.0). MEASURED, not taken from the manifest: the pack
		// note says the greater siren's original is 1170, and the file that
		// arrived is 1100. The srcset descriptor has to match the FILE.
		'greentreefrog' => 1100, 'squirreltreefrog' => 1100, 'barkingtreefrog' => 1100, 'pinewoodstreefrog' => 1100, 'cubantreefrog' => 1100, 'pigfrog' => 1100, 'bullfrog' => 1100, 'leopardfrog' => 1100, 'gopherfrog' => 1100, 'southerntoad' => 1100, 'oaktoad' => 1100, 'narrowmouthtoad' => 1100, 'spadefoot' => 1100, 'cricketfrog' => 1100, 'littlegrassfrog' => 1100, 'greenhousefrog' => 1024, 'greatersiren' => 1100, 'amphiuma' => 1100, 'peninsulanewt' => 1100,
		// Batch 10 (1.33.0) — measured on the landed files; all 1100 wide.
		'muscovy' => 1100, 'ringneckedduck' => 1100, 'lesserscaup' => 1100, 'hoodedmerganser' => 1100, 'bluewingedteal' => 1100, 'mallard' => 1100, 'shoveler' => 1100, 'wigeon' => 1100, 'egyptiangoose' => 1100, 'loon' => 1100, 'laughinggull' => 1100, 'ringbilledgull' => 1100, 'herringgull' => 1100, 'bonapartesgull' => 1100, 'forsterstern' => 1100, 'caspiantern' => 1100, 'blackskimmer' => 1100, 'killdeer' => 1100, 'spottedsandpiper' => 1100, 'greateryellowlegs' => 1100, 'blackneckedstilt' => 1100, 'wilsonssnipe' => 1100, 'leastsandpiper' => 1100,
		// Batch 11 (1.33.0) — measured on the landed files; all 1100 wide.
		'swallowtailedkite' => 1100, 'redshoulderedhawk' => 1100, 'redtailedhawk' => 1100, 'kestrel' => 1100, 'coopershawk' => 1100, 'harrier' => 1100, 'shorttailedhawk' => 1100, 'merlin' => 1100, 'peregrine' => 1100, 'blackvulture' => 1100, 'turkeyvulture' => 1100, 'barredowl' => 1100, 'greathornedowl' => 1100, 'screechowl' => 1100, 'barnowl' => 1100, 'chuckwillswidow' => 1100, 'whippoorwill' => 1100, 'nighthawk' => 1100, 'wildturkey' => 1100, 'scrubjay' => 1100, 'redcockaded' => 1100,
		// Batches 12 and 13 (1.33.0) - measured on the landed files; all 1100 wide.
		'prothonotary' => 1100, 'parula' => 1100, 'palmwarbler' => 1100, 'yellowrumped' => 1100, 'paintedbunting' => 1100, 'pileated' => 1100, 'redbellied' => 1100, 'downy' => 1100, 'flicker' => 1100, 'greatcrested' => 1100, 'bluebird' => 1100, 'shrike' => 1100, 'mockingbird' => 1100, 'cardinal' => 1100, 'bluejay' => 1100, 'carolinawren' => 1100, 'titmouse' => 1100, 'boattailedgrackle' => 1100, 'redwinged' => 1100, 'hummingbird' => 1100, 'purplemartin' => 1100, 'barnswallow' => 1100, 'cedarwaxwing' => 1100, 'mourningdove' => 1100, 'grounddove' => 1100, 'chickadee' => 1100, 'treeswallow' => 1100, 'collareddove' => 1100, 'gnatcatcher' => 1100, 'whiteeyedvireo' => 1100, 'redeyedvireo' => 1100, 'phoebe' => 1100, 'housewren' => 1100, 'catbird' => 1100, 'brownthrasher' => 1100, 'robin' => 1100, 'towhee' => 1100, 'commongrackle' => 1100, 'cowbird' => 1100, 'goldfinch' => 1100, 'pinewarbler' => 1100, 'yellowthroat' => 1100, 'blackandwhite' => 1100, 'yellowthroated' => 1100, 'chippingsparrow' => 1100, 'savannahsparrow' => 1100, 'meadowlark' => 1100, 'housefinch' => 1100, 'chimneyswift' => 1100, 'kingbird' => 1100, 'summertanager' => 1100, 'indigobunting' => 1100, 'kinglet' => 1100, 'redheaded' => 1100, 'sapsucker' => 1100, 'hairy' => 1100, 'whitewingeddove' => 1100, 'rockpigeon' => 1100, 'housesparrow' => 1100, 'starling' => 1100,
		// Batches 20-23 (1.33.0) - measured on the landed files; all 1100 wide.
		'ballmoss' => 1100, 'liveoak' => 1100, 'sabalpalm' => 1100, 'magnolia' => 1100, 'redmaple' => 1100, 'sweetgum' => 1100, 'coontie' => 1100, 'pickerelweed' => 1100, 'alligatorflag' => 1100, 'cattail' => 1100, 'beautyberry' => 1100, 'coralbean' => 1100, 'elderberry' => 1100, 'waxmyrtle' => 1100, 'waterhyacinth' => 1100, 'hydrilla' => 1100, 'waterlettuce' => 1100, 'duckweed' => 1100, 'pondcypress' => 1100, 'laureloak' => 1100, 'wateroak' => 1100, 'turkeyoak' => 1100, 'slashpine' => 1100, 'longleafpine' => 1100, 'sandpine' => 1100, 'redcedar' => 1100, 'dahoon' => 1100, 'redbay' => 1100, 'sweetbay' => 1100, 'loblollybay' => 1100, 'swamptupelo' => 1100, 'popash' => 1100, 'persimmon' => 1100, 'chickasawplum' => 1100, 'camphor' => 1100, 'chinesetallow' => 1100, 'tickseed' => 1100, 'blanketflower' => 1100, 'spanishneedles' => 1100, 'spiderwort' => 1100, 'maypop' => 1100, 'coralhoneysuckle' => 1100, 'firebush' => 1100, 'muscadine' => 1100, 'virginiacreeper' => 1100, 'lantana' => 1100, 'dogfennel' => 1100, 'butterflyweed' => 1100, 'buttonbush' => 1100, 'yaupon' => 1100, 'floridarosemary' => 1100, 'pricklypear' => 1100, 'adamsneedle' => 1100, 'reindeerlichen' => 1100, 'airpotato' => 1100, 'cogongrass' => 1100, 'spatterdock' => 1100, 'lotus' => 1100, 'arrowhead' => 1100, 'stringlily' => 1100, 'blueflag' => 1100, 'bladderwort' => 1100, 'eelgrass' => 1100, 'maidencane' => 1100, 'sawgrass' => 1100, 'primrosewillow' => 1100, 'alligatorweed' => 1100, 'torpedograss' => 1100,
		// Batches 14-19 (1.33.0) - measured on the landed files. All 1100 wide
		// EXCEPT the black bear: the FWC source is only 800 px, which the pack
		// declared and the files confirm. PHOTO_W is a srcset descriptor, so it
		// records the FILE, never the batch's usual size.
		'blackbear' => 800, 'raccoon' => 1100, 'opossum' => 1100, 'armadillo' => 1100, 'deer' => 1100, 'wildhog' => 1100, 'greysquirrel' => 1100, 'foxsquirrel' => 1100, 'marshrabbit' => 1100, 'cottontail' => 1100, 'greyfox' => 1100, 'bobcat' => 1100, 'coyote' => 1100, 'freetailedbat' => 1100, 'rhesus' => 1100, 'eveningbat' => 1100, 'seminolebat' => 1100, 'flyingsquirrel' => 1100, 'cottonrat' => 1100, 'skunk' => 1100, 'pocketgopher' => 1100, 'floridamouse' => 1100, 'sunshinebass' => 1100, 'bluegill' => 1100, 'redear' => 1100, 'spottedsunfish' => 1100, 'warmouth' => 1100, 'crappie' => 1100, 'floridagar' => 1100, 'bowfin' => 1100, 'channelcatfish' => 1100, 'brownbullhead' => 1100, 'pickerel' => 1100, 'goldenshiner' => 1100, 'bluetilapia' => 1100, 'armoredcatfish' => 1100, 'mosquitofish' => 1100, 'threadfinshad' => 1100, 'gizzardshad' => 1100, 'seminolekillifish' => 1100, 'redbreast' => 1100, 'bluespotted' => 1100, 'dollarsunfish' => 1100, 'chubsucker' => 1100, 'whitecatfish' => 1100, 'yellowbullhead' => 1100, 'longnosegar' => 1100, 'leastkillifish' => 1100, 'goldentopminnow' => 1100, 'sailfinmolly' => 1100, 'brooksilverside' => 1100, 'grasscarp' => 1100, 'eel' => 1100, 'greendarner' => 1100, 'bluedasher' => 1100, 'pondhawk' => 1100, 'halloweenpennant' => 1100, 'greatblueskimmer' => 1100, 'fourspotted' => 1100, 'needhams' => 1100, 'saddlebags' => 1100, 'amberwing' => 1100, 'rambursforktail' => 1100, 'citrineforktail' => 1100, 'zebralongwing' => 1100, 'gulffritillary' => 1100, 'monarch' => 1100, 'tigerswallowtail' => 1100, 'giantswallowtail' => 1100, 'palamedes' => 1100, 'cloudlesssulphur' => 1100, 'queen' => 1100, 'whitepeacock' => 1100, 'viceroy' => 1100, 'blackswallowtail' => 1100, 'zebraswallowtail' => 1100, 'spicebush' => 1100, 'redadmiral' => 1100, 'buckeye' => 1100, 'ceraunusblue' => 1100, 'grayhairstreak' => 1100, 'southernwhite' => 1100, 'sleepyorange' => 1100, 'barredyellow' => 1100, 'phaoncrescent' => 1100, 'longtailedskipper' => 1100, 'fieryskipper' => 1100, 'luna' => 1100, 'waspmoth' => 1100, 'imperialmoth' => 1100, 'tersasphinx' => 1100, 'islandapplesnail' => 1100, 'crayfish' => 1100, 'goldensilk' => 1100, 'lubber' => 1100, 'firefly' => 1100, 'cicadas' => 1100, 'spinyorbweaver' => 1100, 'greenlynx' => 1100, 'regaljumper' => 1100, 'carolinamantis' => 1100, 'walkingstick' => 1100, 'hercules' => 1100, 'tortoisebeetle' => 1100, 'carpenterant' => 1100, 'cockroach' => 1100, 'asianclam' => 1100, 'grassshrimp' => 1100, 'scarletking' => 1100, 'hognose' => 1100, 'coachwhip' => 1100, 'crayfishsnake' => 1100, 'sandskink' => 1100, 'wormlizard' => 1100, 'scrublizard' => 1100, 'indopacificgecko' => 1100, 'tropicalgecko' => 1100,
		// Batch 6 (1.33.0) — every turtle rendition is 1100 wide.
		'peninsulacooter' => 1100, 'redbelliedcooter' => 1100, 'redearedslider' => 1100, 'softshell' => 1100, 'snappingturtle' => 1100, 'gophertortoise' => 1100, 'boxturtle' => 1100, 'muskturtle' => 1100, 'loggerheadmusk' => 1100, 'stripedmudturtle' => 1100, 'floridamudturtle' => 1100, 'chickenturtle' => 1100,
	];

	public static function photo_width( string $id ): int {
		return self::PHOTO_W[ $id ] ?? 0;
	}

	/**
	 * Where each photo actually came from: species id => [ credit, licence,
	 * source URL ] (1.24.0).
	 *
	 * Until 1.23.1 every photo was free-tier Adobe Stock and the credit line
	 * was one hard-coded string. Batch 2 broke that assumption: Adobe's free
	 * pool is thin for North American species (no pied-billed grebe at all),
	 * so those came from Wikimedia Commons, and three of the six are CC BY —
	 * a licence that REQUIRES the photographer, the licence and, properly,
	 * the source. So attribution is per-photo data now, and arbitrary: any
	 * source with any licence can be added by writing its row here.
	 *
	 * A species with a photo but no row falls back to the Adobe line, which
	 * is what the original seventeen and batch 1 rely on. CC0 and
	 * public-domain images legally need nothing, but they get a row anyway —
	 * it costs nothing and the photographer did the work.
	 *
	 * FUTURE MANIFESTS: one row per photo, exactly these three fields, in
	 * this order — (1) the credit as it should read, photographer first
	 * ("lwolfartist / CC BY 2.0", "USFWS Pacific (public domain)"); (2) the
	 * licence in full ("Creative Commons Attribution 2.0 Generic"); (3) the
	 * source page URL, or '' when there is none. Nothing is derived and
	 * nothing is guessed: a missing URL renders no link rather than a made-up
	 * one.
	 */
	private const PHOTO_SOURCES = [
		// Batches 10 and 11 (1.33.0): water birds, shorebirds, raptors, owls
		// and night birds. Six CC0 photographs are credited to their observers
		// anyway; four of those give only a handle, which is credited as such.
		'muscovy'             => [
			'Eridan Xharahi / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/15334402',
		],
		// Batches 14-19 (1.33.0): mammals, fish, small things and the last
		// reptiles. One row is PUBLIC DOMAIN rather than Creative Commons --
		// the black bear is an FWC camera-trap photograph, a work of the
		// Florida state government. It still carries its credit, because a
		// credit is how a reader checks provenance, not only how a licence
		// is satisfied.
		'blackbear'         => [
			'Florida Fish and Wildlife Conservation Commission (public domain)',
			'Public domain (work of the Florida state government)',
			'https://commons.wikimedia.org/wiki/File:A_Florida_Black_Bear.jpg',
		],
		'raccoon'           => [
			'Kai Squires / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/37201197',
		],
		'opossum'           => [
			'Mike Ostrowski / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/46903516',
		],
		'armadillo'         => [
			'Melissa Meadows / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/312668266',
		],
		'deer'              => [
			'Andrew Cannizzaro / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:White-tailed_Deer_(Odocoileus_virginianus)_(36436629275).jpg',
		],
		'wildhog'           => [
			'Russell Parsons / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/262643977',
		],
		'greysquirrel'      => [
			'Josiah Londerée / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/107228115',
		],
		'foxsquirrel'       => [
			'LMDawson (Wikimedia Commons) / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Fox_Squirrel_in_Central_Florida_.jpg',
		],
		'marshrabbit'       => [
			'Liv (iNaturalist: oes888) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/212226224',
		],
		'cottontail'        => [
			'Laura Gaudette / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/100106114',
		],
		'greyfox'           => [
			'John William Bailly / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/50395534',
		],
		'bobcat'            => [
			'Elix Hernandez / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/393104957',
		],
		'coyote'            => [
			'Mila C. / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/339559689',
		],
		'freetailedbat'     => [
			'Michael Reynolds (iNaturalist: michaelreyul) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/85273270',
		],
		'rhesus'            => [
			'David Garza / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/130974006',
		],
		'eveningbat'        => [
			'Michael Reynolds (iNaturalist: michaelreyul) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/83926347',
		],
		'seminolebat'       => [
			'Tom Kennedy / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/105782252',
		],
		'flyingsquirrel'    => [
			'Lyn Roueche / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/145930928',
		],
		'cottonrat'         => [
			'Mike Ostrowski / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/74439300',
		],
		'skunk'             => [
			'Kevin Bowman / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Striped_skunk_Florida.jpg',
		],
		'pocketgopher'      => [
			'Alison Northup / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/19387156',
		],
		'floridamouse'      => [
			'Scott Ward / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/33426969',
		],
		'sunshinebass'      => [
			'James LaFontaine / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/261726245',
		],
		'bluegill'          => [
			'Thefishingnomad (Wikimedia Commons) / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Bluegill_sunfish_weston_florida_may_24_2024_(cropped_2).jpg',
		],
		'redear'            => [
			'FVL_MULTISPECIES (iNaturalist) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/234256370',
		],
		'spottedsunfish'    => [
			'FVL_MULTISPECIES (iNaturalist) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/300559797',
		],
		'warmouth'          => [
			'David Emmanuel / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/248789716',
		],
		'crappie'           => [
			'Daniel Estabrooks / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/361851592',
		],
		'floridagar'        => [
			'Jerzy Strzelecki / CC BY 4.0',
			'Creative Commons Attribution 3.0 Unported',
			'https://commons.wikimedia.org/wiki/File:Everglades43(js)-Florida_gar.jpg',
		],
		'bowfin'            => [
			'James LaFontaine / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/345226630',
		],
		'channelcatfish'    => [
			'Sam Stukel, U.S. Fish and Wildlife Service (public domain)',
			'Public domain (work of the Florida state government)',
			'https://commons.wikimedia.org/wiki/File:Channel_Catfish_(Ictalurus_punctatus).jpg',
		],
		'brownbullhead'     => [
			'Mikael Nyman / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Ameiurus_nebulosus_150659845.jpg',
		],
		'pickerel'          => [
			'Ken Hammond, U.S. Department of Agriculture (public domain)',
			'Public domain (work of the Florida state government)',
			'https://commons.wikimedia.org/wiki/File:94cs3899_(1)_(49699971023).jpg',
		],
		'goldenshiner'      => [
			'Dmitry Podobreev / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/371447339',
		],
		'bluetilapia'       => [
			'Daniel Estabrooks / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/365591695',
		],
		'armoredcatfish'    => [
			'Ben Machado / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/102142098',
		],
		'mosquitofish'      => [
			'Zakqary Roy / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/122039568',
		],
		'threadfinshad'     => [
			'Daniel Estabrooks / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/361851776',
		],
		'gizzardshad'       => [
			'Josiah Londerée / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/88881578',
		],
		'seminolekillifish' => [
			'Zakqary Roy / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/122198279',
		],
		'redbreast'         => [
			'Josiah Londerée / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/110445609',
		],
		'bluespotted'       => [
			'geosesarma (iNaturalist) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/333221754',
		],
		'dollarsunfish'     => [
			'geosesarma (iNaturalist) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/195427411',
		],
		'chubsucker'        => [
			'anoleinwoods (iNaturalist) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/388660772',
		],
		'whitecatfish'      => [
			'James LaFontaine / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/312397033',
		],
		'yellowbullhead'    => [
			'Nick Tobler (Cowturtle) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/254554532',
		],
		'longnosegar'       => [
			'anoleinwoods (iNaturalist) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/390367447',
		],
		'leastkillifish'    => [
			'Nick Tobler (Cowturtle) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/171226576',
		],
		'goldentopminnow'   => [
			'geosesarma (iNaturalist) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/333221781',
		],
		'sailfinmolly'      => [
			'Nick Tobler (Cowturtle) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/203769648',
		],
		'brooksilverside'   => [
			'Madison Harman / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/270719190',
		],
		'grasscarp'         => [
			'kcthetc1 (iNaturalist) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/200121131',
		],
		'eel'               => [
			'Sam Stukel, U.S. Fish and Wildlife Service (public domain)',
			'Public domain (work of the Florida state government)',
			'https://commons.wikimedia.org/wiki/File:American_Eel_(Anguilla_rostrata).jpg',
		],
		'greendarner'       => [
			'iNaturalist user dburger88 / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/182345929',
		],
		'bluedasher'        => [
			'Laura Gaudette / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/8321836',
		],
		'pondhawk'          => [
			'Laura Gaudette / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/14120984',
		],
		'halloweenpennant'  => [
			'Andy Wilson / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/18434193',
		],
		'greatblueskimmer'  => [
			'Tom Kennedy / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/103148997',
		],
		'fourspotted'       => [
			'Jonathan Layman / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/123865714',
		],
		'needhams'          => [
			'Pål A. Olsvik / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/126616029',
		],
		'saddlebags'        => [
			'Claire Herzog / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/170449607',
		],
		'amberwing'         => [
			'Laura Gaudette / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/7467677',
		],
		'rambursforktail'   => [
			'Judy Gallagher / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/24736611',
		],
		'citrineforktail'   => [
			'Judy Gallagher / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/19341358',
		],
		'zebralongwing'     => [
			'iNaturalist user gpete / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/103057088',
		],
		'gulffritillary'    => [
			'Kai Squires / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/197615840',
		],
		'monarch'           => [
			'Austin Smith / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/237761388',
		],
		'tigerswallowtail'  => [
			'Michael W Belitz / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/97821237',
		],
		'giantswallowtail'  => [
			'Larry Jensen / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/341233586',
		],
		'palamedes'         => [
			'Viktor / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/203965833',
		],
		'cloudlesssulphur'  => [
			'Richard Stovall / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/12761657',
		],
		'queen'             => [
			'Dan Vickers / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/333680077',
		],
		'whitepeacock'      => [
			'Lauren McLaurin / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/63156412',
		],
		'viceroy'           => [
			'Richard Stovall / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/30390907',
		],
		'blackswallowtail'  => [
			'Sara Piotter / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/38090222',
		],
		'zebraswallowtail'  => [
			'Richard Stovall / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/183090401',
		],
		'spicebush'         => [
			'Richard Stovall / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/52427400',
		],
		'redadmiral'        => [
			'Pam Kleinsasser / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/13295495',
		],
		'buckeye'           => [
			'Connie Nagele / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/229669693',
		],
		'ceraunusblue'      => [
			'Tedd Greenwald / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/64473078',
		],
		'grayhairstreak'    => [
			'kcthetc1 (iNaturalist) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/152847888',
		],
		'southernwhite'     => [
			'iNaturalist user naturedom12 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/208285579',
		],
		'sleepyorange'      => [
			'Laura Gaudette / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/243711359',
		],
		'barredyellow'      => [
			'Dmitry Podobreev / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/232013406',
		],
		'phaoncrescent'     => [
			'kcthetc1 (iNaturalist) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/203637686',
		],
		'longtailedskipper' => [
			'Judy Gallagher / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/22384787',
		],
		'fieryskipper'      => [
			'Nash Turley / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/64001293',
		],
		'luna'              => [
			'Laura Gaudette / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/50244750',
		],
		'waspmoth'          => [
			'Laura Gaudette / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/16815077',
		],
		'imperialmoth'      => [
			'Laura Gaudette / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/14559812',
		],
		'tersasphinx'       => [
			'Jade Fortnash / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/257930057',
		],
		'islandapplesnail'  => [
			'Ingolf Askevold / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/281586941',
		],
		'crayfish'          => [
			'Nick Block / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/4978992',
		],
		'goldensilk'        => [
			'William J. Deml / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/133466474',
		],
		'lubber'            => [
			'Sue Ann Kendall / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/394998366',
		],
		'firefly'           => [
			'Bex Goreham / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/121523362',
		],
		'cicadas'           => [
			'kcthetc1 (iNaturalist) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/221224101',
		],
		'spinyorbweaver'    => [
			'Blake Ross / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/337052252',
		],
		'greenlynx'         => [
			'kcthetc1 (iNaturalist) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/186731001',
		],
		'regaljumper'       => [
			'Kai Squires / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/74449931',
		],
		'carolinamantis'    => [
			'Eridan Xharahi / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/71915166',
		],
		'walkingstick'      => [
			'RL7836 / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/254816799',
		],
		'hercules'          => [
			'Alan Jeon / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/248365659',
		],
		'tortoisebeetle'    => [
			'Brighton Lee / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/257771014',
		],
		'carpenterant'      => [
			'Richard Stovall / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/29827661',
		],
		'cockroach'         => [
			'mikoikoi (iNaturalist) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/208733906',
		],
		'asianclam'         => [
			'Kyle Van Houtan / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/130677377',
		],
		'grassshrimp'       => [
			'iNaturalist user geosesarma / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/236839768',
		],
		'scarletking'       => [
			'kcthetc1 (iNaturalist) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/143367523',
		],
		'hognose'           => [
			'Court Harding / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/67584540',
		],
		'coachwhip'         => [
			'kclarksdnhmorg (iNaturalist) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/8238168',
		],
		'crayfishsnake'     => [
			'Jeremiah Degenhardt / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/197149844',
		],
		'sandskink'         => [
			'Andrew Durso / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/139049542',
		],
		'wormlizard'        => [
			'Alexis Zora / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/38124392',
		],
		'scrublizard'       => [
			'Bailey Duncan / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/283991256',
		],
		'indopacificgecko'  => [
			'Dan Vickers / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/333678172',
		],
		'tropicalgecko'     => [
			'natalie (iNaturalist: nat_t) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/99642535',
		],
		// Batches 20-23 (1.33.0): the plants. Every one a Florida photograph,
		// on a wild or roadside plant rather than a garden specimen unless the
		// pack said otherwise. CC0 rows are credited to their observer anyway.
		'ballmoss'         => [
			'Scott Allen Davis / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/142509945',
		],
		'liveoak'          => [
			'Lauren Gillett / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/38255577',
		],
		'sabalpalm'        => [
			'Jonathan Layman / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/106254866',
		],
		'magnolia'         => [
			'iNaturalist user mfeaver / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/251109986',
		],
		'redmaple'         => [
			'Brandon Corder / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/103860899',
		],
		'sweetgum'         => [
			'iNaturalist user mfeaver / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/356292590',
		],
		'coontie'          => [
			'Josiah Londerée / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/147569419',
		],
		'pickerelweed'     => [
			'Cyndy Sims (Parr) / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/63435538',
		],
		'alligatorflag'    => [
			'Melissa Meadows / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/378926884',
		],
		'cattail'          => [
			'Josiah Londerée / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/150764351',
		],
		'beautyberry'      => [
			'Alex Abair / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/132487016',
		],
		'coralbean'        => [
			'Jay Horn / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/207003957',
		],
		'elderberry'       => [
			'Darren Oh / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/23819493',
		],
		'waxmyrtle'        => [
			'Alan Weakley / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/3820652',
		],
		'waterhyacinth'    => [
			'Guy Babineau / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/142088740',
		],
		'hydrilla'         => [
			'Josiah Londerée / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/89142974',
		],
		'waterlettuce'     => [
			'Patrick Hanly / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/150689258',
		],
		'duckweed'         => [
			'Daniel Estabrooks / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/168737069',
		],
		'pondcypress'      => [
			'Scott Allen Davis / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/182405709',
		],
		'laureloak'        => [
			'Alan Weakley / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/78038651',
		],
		'wateroak'         => [
			'Daniel Estabrooks / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/14481934',
		],
		'turkeyoak'        => [
			'Scott Allen Davis / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/194162599',
		],
		'slashpine'        => [
			'iNaturalist user er-birds / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/103449378',
		],
		'longleafpine'     => [
			'Brandon Corder / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/69573182',
		],
		'sandpine'         => [
			'Jay Horn / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/25970575',
		],
		'redcedar'         => [
			'Erin Lalime / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/218353447',
		],
		'dahoon'           => [
			'iNaturalist user mfeaver / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/194477423',
		],
		'redbay'           => [
			'Siddarth Machado / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/96716832',
		],
		'sweetbay'         => [
			'alicia penney / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/12563643',
		],
		'loblollybay'      => [
			'Mark Connolly / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/215714676',
		],
		'swamptupelo'      => [
			'Jay Horn / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/164885329',
		],
		'popash'           => [
			'iNaturalist user mfeaver / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/358671533',
		],
		'persimmon'        => [
			'iNaturalist user aispinsects / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/35961379',
		],
		'chickasawplum'    => [
			'Robert Guralnick / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/70278018',
		],
		'camphor'          => [
			'Eric Knight / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/307954004',
		],
		'chinesetallow'    => [
			'Lauren Gillett / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/117448059',
		],
		'tickseed'         => [
			'Jay Horn / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/66156243',
		],
		'blanketflower'    => [
			'iNaturalist user natalie / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/71423789',
		],
		'spanishneedles'   => [
			'Even Dankowicz / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/14029498',
		],
		'spiderwort'       => [
			'iNaturalist user natalie / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/40587444',
		],
		'maypop'           => [
			'Jay Horn / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/120413415',
		],
		'coralhoneysuckle' => [
			'Lauren Gillett / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/72199730',
		],
		'firebush'         => [
			'iNaturalist user carbenoid / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/145223422',
		],
		'muscadine'        => [
			'mikoikoi (iNaturalist) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/128200415',
		],
		'virginiacreeper'  => [
			'Yann Kemper / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/191045106',
		],
		'lantana'          => [
			'Daniel Washburn / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/103764455',
		],
		'dogfennel'        => [
			'Adrienne Lewis / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/46505216',
		],
		'butterflyweed'    => [
			'Stephanie C / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/133679486',
		],
		'buttonbush'       => [
			'i like lizards / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/218388466',
		],
		'yaupon'           => [
			'Alex Abair / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/105146304',
		],
		'floridarosemary'  => [
			'iNaturalist user naturedom12 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/298988516',
		],
		'pricklypear'      => [
			'Tyler Radtke / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/355384467',
		],
		'adamsneedle'      => [
			'Michael W Belitz / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/70971850',
		],
		'reindeerlichen'   => [
			'P Holroyd / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/31533047',
		],
		'airpotato'        => [
			'Austin Smith / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/155782041',
		],
		'cogongrass'       => [
			'Peter Burka / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/269559944',
		],
		'spatterdock'      => [
			'Donna Fernstrom / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/9018101',
		],
		'lotus'            => [
			'iNaturalist user mfeaver / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/361325339',
		],
		'arrowhead'        => [
			'Karen Guin / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/263807756',
		],
		'stringlily'       => [
			'Turner Brockman / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/258596723',
		],
		'blueflag'         => [
			'kcthetc1 (iNaturalist) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/202578952',
		],
		'bladderwort'      => [
			'Jay Horn / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/58540553',
		],
		'eelgrass'         => [
			'iNaturalist user mfeaver / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/39949537',
		],
		'maidencane'       => [
			'Sterling Herron / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/297763259',
		],
		'sawgrass'         => [
			'iNaturalist user mfeaver / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/18319572',
		],
		'primrosewillow'   => [
			'Dmitry Podobreev / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/214469511',
		],
		'alligatorweed'    => [
			'iNaturalist user mfeaver / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/350169640',
		],
		'torpedograss'     => [
			'bat (Maria Vorontsova) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/324174150',
		],
		'ringneckedduck'      => [
			'Philip Schaeffer / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/38363256',
		],
		'lesserscaup'         => [
			'Pete Grannis / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/335514864',
		],
		'hoodedmerganser'     => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/196924092',
		],
		'bluewingedteal'      => [
			'Court Harding / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/67623238',
		],
		'mallard'             => [
			'Michel Rathwell / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Duck_(27479065157).jpg',
		],
		'shoveler'            => [
			'iNaturalist user Zygy / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/69079988',
		],
		'wigeon'              => [
			'iNaturalist user sudomir / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/105596480',
		],
		'egyptiangoose'       => [
			'Jeffrey Gammon / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Egyptian_Goose_JG.jpg',
		],
		'loon'                => [
			'iNaturalist user datadan / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/341579092',
		],
		'laughinggull'        => [
			'Kent P. McFarland / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/36870452',
		],
		'ringbilledgull'      => [
			'Lyndsey / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/39594250',
		],
		'herringgull'         => [
			'Tom Kennedy / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/106263549',
		],
		'bonapartesgull'      => [
			'lwolfartist / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Bonaparte%27s_gull_merritt_island_nwr_1.22.24_DSC_2830-topaz-denoiseraw-sharpen.jpg',
		],
		'forsterstern'        => [
			'VJAnderson / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Forster%27s_Tern_non-breeding_plumage.jpg',
		],
		'caspiantern'         => [
			'Pål A. Olsvik / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/125824023',
		],
		'blackskimmer'        => [
			'Tom Kennedy / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/163405797',
		],
		'killdeer'            => [
			'Andrea Westmoreland / CC BY-SA 2.0',
			'Creative Commons Attribution-ShareAlike 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Kildeer_at_Lake_Woodruff_-_Flickr_-_Andrea_Westmoreland.jpg',
		],
		'spottedsandpiper'    => [
			'Dick Daniels / CC BY-SA 3.0',
			'Creative Commons Attribution-ShareAlike 3.0 Unported',
			'https://commons.wikimedia.org/wiki/File:Spotted_Sandpiper_RWD2.jpg',
		],
		'greateryellowlegs'   => [
			'Jeffrey Gammon / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Greater_Yellowlegs_JG.jpg',
		],
		'blackneckedstilt'    => [
			'Philip Schaeffer / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/33543377',
		],
		'wilsonssnipe'        => [
			'iNaturalist user mefisher / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/198862367',
		],
		'leastsandpiper'      => [
			'Jean-Lou Justine / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Least_Sandpiper_(Calidris_minutilla)_-_Sanibel_Island,_FL,_USA_01.png',
		],
		'swallowtailedkite'   => [
			'Andy Morffew / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Swallow-tailed_Kite_(34163638494).jpg',
		],
		'redshoulderedhawk'   => [
			'Kevin Brix / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/192456680',
		],
		'redtailedhawk'       => [
			'Owen Strickland / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/17669518',
		],
		'kestrel'             => [
			'Josiah Londerée / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/142634218',
		],
		'blackvulture'        => [
			'Cricket Raspet / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/194868533',
		],
		'turkeyvulture'       => [
			'Sam Kieschnick / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/20212389',
		],
		'barredowl'           => [
			'iNaturalist user Zygy / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/67118062',
		],
		'greathornedowl'      => [
			'Shirley Zundell / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/263161059',
		],
		'screechowl'          => [
			'joiseyshowaa / CC BY-SA 2.0',
			'Creative Commons Attribution-ShareAlike 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Owlie_McOwlface_(33283806874).jpg',
		],
		'coopershawk'         => [
			'Curtis (iNaturalist tampabirdman) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/315105553',
		],
		'harrier'             => [
			'Dan Vickers / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/334791760',
		],
		'shorttailedhawk'     => [
			'Matt Schenck / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/107035261',
		],
		'merlin'              => [
			'Philip Schaeffer / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/38263095',
		],
		'peregrine'           => [
			'iNaturalist user Eddie / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/265205432',
		],
		'barnowl'             => [
			'Mike Brady / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/72330578',
		],
		'chuckwillswidow'     => [
			'Isaac Sanchez / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Antrostomus_carolinensis,_Dry_Tortugas_NP,_Florida_1.jpg',
		],
		'nighthawk'           => [
			'Ryan Watson / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/120762058',
		],
		'whippoorwill'        => [
			'Alina Martin / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/197039089',
		],
		'wildturkey'          => [
			'Matt Felperin / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/102951289',
		],
		'scrubjay'            => [
			'lwolfartist / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Florida_scrub_jay_helen_and_allen_cruickshank_preserve_1.22.24_DSC_0245-topaz-denoiseraw-sharpen.jpg',
		],
		'redcockaded'         => [
			'Richard Stovall / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/280586990',
		],
		// Batches 12 and 13 (1.33.0): songbirds, doves and woodpeckers.
		// Seventeen CC0 photographs are credited to their observers anyway;
		// most of those give only an iNaturalist handle, credited as such.
		// kcthetc1 alone supplied sixteen of the sixty — one Jacksonville
		// observer who releases everything CC0.
		'prothonotary'      => [
			'Tom Kennedy / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/104950029',
		],
		'parula'            => [
			'Matt Felperin / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/204884839',
		],
		'palmwarbler'       => [
			'Eridan Xharahi / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/104007926',
		],
		'yellowrumped'      => [
			'Peter Chen 2.0 / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/263422643',
		],
		'paintedbunting'    => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/267396397',
		],
		'pileated'          => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/199594995',
		],
		'redbellied'        => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/253758355',
		],
		'downy'             => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/258277440',
		],
		'flicker'           => [
			'Josiah Londerée / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/117995576',
		],
		'greatcrested'      => [
			'Kevin Brix / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/193635153',
		],
		'bluebird'          => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/260918144',
		],
		'shrike'            => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/219152646',
		],
		'mockingbird'       => [
			'Bailey Duncan / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/267254632',
		],
		'cardinal'          => [
			'Mike Brady / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/255814279',
		],
		'bluejay'           => [
			'Jade Fortnash / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/10023566',
		],
		'carolinawren'      => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/253648152',
		],
		'titmouse'          => [
			'Tom Kennedy / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/106250226',
		],
		'boattailedgrackle' => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/212001039',
		],
		'redwinged'         => [
			'Kai Squires / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/49845812',
		],
		'hummingbird'       => [
			'Edwin Wilke / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/187158136',
		],
		'purplemartin'      => [
			'Judy Gallagher / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/19133839',
		],
		'barnswallow'       => [
			'Dan Vickers / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/333775615',
		],
		'cedarwaxwing'      => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/257240008',
		],
		'mourningdove'      => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/288089167',
		],
		'grounddove'        => [
			'Paul (iNaturalist paulgraham) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/206623596',
		],
		'chickadee'         => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/252953706',
		],
		'treeswallow'       => [
			'Josiah Londerée / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/255516612',
		],
		'collareddove'      => [
			'Rhododendrites / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Eurasian_collared_dove_(05014).jpg',
		],
		'gnatcatcher'       => [
			'Matt Felperin / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/204885455',
		],
		'whiteeyedvireo'    => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/248782201',
		],
		'redeyedvireo'      => [
			'Kevin Brix / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/193648271',
		],
		'phoebe'            => [
			'Laura Liedtke / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/203107259',
		],
		'housewren'         => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/261129876',
		],
		'catbird'           => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/258384574',
		],
		'brownthrasher'     => [
			'Jody Shugart / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/49755183',
		],
		'robin'             => [
			'Eridan Xharahi / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/146839778',
		],
		'towhee'            => [
			'Court Harding / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/67588713',
		],
		'commongrackle'     => [
			'Mike Brady / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/150611145',
		],
		'cowbird'           => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/325031896',
		],
		'goldfinch'         => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/257240016',
		],
		'pinewarbler'       => [
			'Mike Brady / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/264739773',
		],
		'yellowthroat'      => [
			'Daniel Levitis / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/258684347',
		],
		'blackandwhite'     => [
			'Melissa McMasters / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/5219605',
		],
		'yellowthroated'    => [
			'Dan Vickers / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/256165267',
		],
		'chippingsparrow'   => [
			'Tom Kennedy / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/106263574',
		],
		'savannahsparrow'   => [
			'Elizabeth Green / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/264018190',
		],
		'meadowlark'        => [
			'Ryan F. Mandelbaum / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/320076208',
		],
		'housefinch'        => [
			'iNaturalist user kcthetc1 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/288900018',
		],
		'chimneyswift'      => [
			'Ryan Watson / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/120762048',
		],
		'kingbird'          => [
			'iNaturalist user alicia penney / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/12491172',
		],
		'summertanager'     => [
			'Michael W Belitz / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/47310870',
		],
		'indigobunting'     => [
			'Robert Webster / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/75508213',
		],
		'kinglet'           => [
			'Tom Kennedy / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/106100839',
		],
		'redheaded'         => [
			'Tyler Bishop / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/190417879',
		],
		'sapsucker'         => [
			'iNaturalist user datadan / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/338502295',
		],
		'hairy'             => [
			'Dan Vickers / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/334971558',
		],
		'whitewingeddove'   => [
			'Eridan Xharahi / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/62829436',
		],
		'rockpigeon'        => [
			'Josiah Londerée / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/111775993',
		],
		'housesparrow'      => [
			'iNaturalist user gpete / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/146841143',
		],
		'starling'          => [
			'Rajan Rao / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/166970685',
		],
		// Batch 9 (1.33.0): the amphibians. Four CC0 photographs are credited
		// to their observers anyway — CC0 waives the requirement, not the
		// courtesy. One of those observers gives no name, so the login is
		// credited, which is the most the source offers.
		'greentreefrog'       => [
			'Judy Gallagher / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Eastern_Green_Tree_Frog_-_Hyla_cineria,_Julie_Metz_Wetlands,_Woodbridge,_Virginia_-_8129389441.jpg',
		],
		'squirreltreefrog'    => [
			'Judy Gallagher / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Squirrel_Tree_Frog_-_Hyla_squirella,_Okaloacoochee_Slough_Wildlife_Management_Area,_Immokalee,_Florida_-_8262962608.jpg',
		],
		'pigfrog'             => [
			'Anthony Batista / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/251596501',
		],
		'leopardfrog'         => [
			'Judy Gallagher / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Southern_Leopard_Frog_-_Lithobates_sphenocephalus,_Occoquan_Bay_National_Wildlife_Refuge,_Woodbridge,_Virginia_(39430233694).jpg',
		],
		'bullfrog'            => [
			'Donald Hobern / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Lithobates_catesbeianus_(30201807087).jpg',
		],
		'southerntoad'        => [
			'Alex Abair / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Anaxyrus_terrestris_270405587.jpg',
		],
		'oaktoad'             => [
			'Valerie Anderson / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/31050567',
		],
		'cubantreefrog'       => [
			'Thomas Brown / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Cuban_Tree_Frog_(Osteopilus_septentrionalis)_(6161208727).jpg',
		],
		'greatersiren'        => [
			'Nick Tobler / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/281882723',
		],
		'amphiuma'            => [
			'Daniel Estabrooks / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/13556194',
		],
		'barkingtreefrog'     => [
			'David Cox / U.S. Fish and Wildlife Service',
			'Public domain (work of the U.S. Fish and Wildlife Service)',
			'https://commons.wikimedia.org/wiki/File:Barking_Tree_Frog.jpg',
		],
		'pinewoodstreefrog'   => [
			'Étienne Léveillé-Bourret / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/124195911',
		],
		'cricketfrog'         => [
			'Laura Gaudette / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/21195943',
		],
		'littlegrassfrog'     => [
			'Lyn Roueche / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/78431604',
		],
		'narrowmouthtoad'     => [
			'iNaturalist user lightbed / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/121363668',
		],
		'spadefoot'           => [
			'iNaturalist user lukexl / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/73071406',
		],
		'greenhousefrog'      => [
			'Thomas Brown / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Greenhouse_Frog_(Eleutherodactylus_planirostris)_(8572426524).jpg',
		],
		'gopherfrog'          => [
			'Lyn Roueche / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/99151758',
		],
		'peninsulanewt'       => [
			'Melissa Meadows / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/335133683',
		],
		// Batch 7 (1.33.0): the rest of Know before you go.
		'noseeums'          => [
			'CSIRO / CC BY 3.0',
			'Creative Commons Attribution 3.0 Unported',
			'https://commons.wikimedia.org/wiki/File:CSIRO_ScienceImage_11052_Biting_midge_on_human_skin.jpg',
		],
		'canetoad'          => [
			'Under the same moon… / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Cane_Toad_(Bufo_marinus_or_Rhinella_marina)_(21047979601).jpg',
		],
		'blackwidow'        => [
			'James Gathany / CDC',
			'Public domain (work of the U.S. Centers for Disease Control and Prevention)',
			'https://commons.wikimedia.org/wiki/File:Black_widow_spider_9854_lores.jpg',
		],
		'brownwidow'        => [
			'Ashwin Srinivasan / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/311574147',
		],
		'pusscaterpillar'   => [
			'Judy Gallagher / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Southern_Flannel_Moth_caterpillar_-_Megalopyge_opercularis,_Merrimac_Farm_Wildlife_Management_Area,_Aden,_Virginia.jpg',
		],
		'saddleback'        => [
			'Christina Butler / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Saddleback_Caterpillar_Moth_-_Acharia_stimulea_(47508058041).jpg',
		],
		'paperwasps'        => [
			'Judy Gallagher / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Guinea_Paper_Wasp_-_Polistes_exclamans,_Occoquan_Bay_National_Wildlife_Refuge,_Woodbridge,_Virginia,_September_29,_2023_(53563479836).jpg',
		],
		'yellowjacket'      => [
			'Bob Peterson / CC BY-SA 2.0',
			'Creative Commons Attribution-ShareAlike 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Southern_Yellowjacket_(Vespula_squamosa)_(7225863346).jpg',
		],
		'lonestartick'      => [
			'Scott Allen Davis / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/277908459',
		],
		'chiggers'          => [
			'Thomas Shahan / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Trombiculid_Mite_-_Oklahoma_-_Flickr_-_Thomas_Shahan_3.jpg',
		],
		'yellowfly'         => [
			'Judy Gallagher / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Yellow_Fly_of_the_Dismal_Swamp_-_Diachloris_ferrugatus,_Myakka_River_State_Park,_Sarasota,_Florida.jpg',
		],
		'treadsoftly'       => [
			'Hans Hillewaert / CC BY-SA 3.0',
			'Creative Commons Attribution-ShareAlike 3.0 Unported',
			'https://commons.wikimedia.org/wiki/File:Cnidoscolus_urens_var._stimulosus.jpg',
		],
		'brazilianpepper'   => [
			'Forest & Kim Starr / CC BY 3.0',
			'Creative Commons Attribution 3.0 Unported',
			'https://commons.wikimedia.org/wiki/File:Starr_031108-0096_Schinus_terebinthifolius.jpg',
		],
		'velvetant'         => [
			'Judy Gallagher / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Dasymutilla_occidentalis_(female).jpg',
		],
		// Batch 6 (1.33.0): the twelve turtles.
		'softshell'         => [
			'Alan Schmierer / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://commons.wikimedia.org/wiki/File:Florida-Weichschildkr%C3%B6te_(Apalone_ferox,_Syn._Trionyx_ferox)_in_einem_Feuchtgebiet.jpg',
		],
		'peninsulacooter'   => [
			'Andrea Westmoreland / CC BY-SA 2.0',
			'Creative Commons Attribution-ShareAlike 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Florida_Cooter_turtle_at_Gemini_Springs_-_Flickr_-_Andrea_Westmoreland.jpg',
		],
		'redbelliedcooter'  => [
			'David Adam Kess / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Pseudemys_nelsoni_Florida_USA1.jpg',
		],
		'snappingturtle'    => [
			'Courtney Celley / U.S. Fish and Wildlife Service',
			'Public domain (work of the U.S. Fish and Wildlife Service)',
			'https://commons.wikimedia.org/wiki/File:Common_snapping_turtle_(53831942257).jpg',
		],
		'gophertortoise'    => [
			'Rstanton13 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://commons.wikimedia.org/wiki/File:Gopherus_polyphemus_Stanton_2.jpg',
		],
		'boxturtle'         => [
			'Distinguished Reflections / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Florida_Box_Turtle_(Terrapene_carolina_bauri)_(22280675099).jpg',
		],
		'muskturtle'        => [
			'Peter Paplanus / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Gew%C3%B6hnliche_Moschusschildkr%C3%B6te_(Sternotherus_odoratus),_Seitenansicht.jpg',
		],
		'stripedmudturtle'  => [
			'Peter Paplanus / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Striped_Mud_Turtle_(Kinosternon_baurii).jpg',
		],
		'redearedslider'    => [
			'Ferran Pestaña / CC BY-SA 2.0',
			'Creative Commons Attribution-ShareAlike 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Trachemys_scripta_elegans_Galapago_de_florida_(306860876).jpg',
		],
		'chickenturtle'     => [
			'Melissa McMasters / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Florida_chicken_turtle.jpg',
		],
		'floridamudturtle'  => [
			'Mark Groeneveld / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/60847369',
		],
		'loggerheadmusk'    => [
			'Josiah Londerée / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/110524182',
		],
		// Batch 8 (1.33.0): nine snakes and eight lizards. The species entries
		// land with the item-6 expansion; the CREDITS land with the FILES, so a
		// photograph can never reach the page ahead of its attribution.
		//
		// Two CC0 photographs are credited to their observers anyway. CC0 waives
		// the requirement, not the courtesy, and the guide does not take the one
		// thing a photographer gave away for free.
		'blackracer'        => [
			'Bobyellow / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Coluber_constrictor_ssp._priapus_(Southern_Black_Racer).jpg',
		],
		'yellowratsnake'    => [
			'Ben Machado / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/21591228',
		],
		'cornsnake'         => [
			'U.S. National Park Service',
			'Public domain (work of the U.S. National Park Service)',
			'https://commons.wikimedia.org/wiki/File:A_close_up_of_a_coiled_up_Corn_snake_on_the_grass._(00f0e1dc-b4b7-4ab6-b124-bcddd284a68e).jpg',
		],
		'gartersnake'       => [
			'Athena Philips / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/287189719',
		],
		'indigosnake'       => [
			'Dirk Stevenson / Fort Stewart, U.S. Army',
			'Public domain',
			'https://commons.wikimedia.org/wiki/File:Eastern_Indigo_Snake.jpg',
		],
		'roughgreensnake'   => [
			'Geoff Gallice / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Opheodrys_aestivus_1.jpg',
		],
		'ribbonsnake'       => [
			'Daniel Estabrooks / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/13538018',
		],
		'ringnecksnake'     => [
			'inaturalistamy / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International',
			'https://www.inaturalist.org/observations/359394913',
		],
		'mudsnake'          => [
			'Court Harding / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/67619474',
		],
		'greenanole'        => [
			'Walter / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Green_Anole_-_Florida_Botanical_Gardens.jpg',
		],
		'brownanole'        => [
			'Judy Gallagher / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Brown_Anole_-_Anolis_sagrei,_Fairchild_Tropical_Gardens,_Coral_Gables,_Florida.jpg',
		],
		'fivelinedskink'    => [
			'Kai Squires / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/42618507',
		],
		'broadheadskink'    => [
			'Kai Squires / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/71386239',
		],
		'racerunner'        => [
			'natalie (nat_t) / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://www.inaturalist.org/observations/108739452',
		],
		'glasslizard'       => [
			'Kristof Zyskowski / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/35216052',
		],
		'housegecko'        => [
			'Rita Clare / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/4112403',
		],
		'groundskink'       => [
			'Tedd Greenwald / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/202828226',
		],
		// Batch 2 (1.24.0), Wikimedia Commons. URLs are the file pages, which
		// is where the licence and the photographer are actually stated.
		'ycnightheron'    => [
			'lwolfartist / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Estero_llano_sp_4.8.23_estero_llano_4.8.23_DSC_9189-topaz-denoiseraw-sharpen.jpg',
		],
		'purplegallinule' => [
			'JeffreyGammon / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Gallinule_Purple_JG.jpg',
		],
		'commongallinule' => [
			'Wildreturn / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Common_Gallinule_-_26918569238.jpg',
		],
		'grebe'           => [
			'ALAN SCHMIERER / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://commons.wikimedia.org/wiki/File:096_-_PIED-BILLED_GREBE_(3-25-09)_SLOCO,_CA_(8722115638).jpg',
		],
		'woodduck'        => [
			'Jusotil_1943 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://commons.wikimedia.org/wiki/File:C180518_(42165614602).jpg',
		],
		'coot'            => [
			'USFWS Pacific (public domain)',
			'Public domain (US Fish and Wildlife Service)',
			'https://commons.wikimedia.org/wiki/File:American_Coot_(52760260350).jpg',
		],
		// Batch 3 (1.25.0), Wikimedia Commons.
		'mottledduck'     => [
			'DuckQuacker9 / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://commons.wikimedia.org/wiki/File:Mottled_Duck,_drake,_Florida_1.jpg',
		],
		'whistlingduck'   => [
			'Alan Schmierer / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://commons.wikimedia.org/wiki/File:003_-_BLACK-BELLIED_WHISTLING-DUCK_(10-27-2015)_estero_llano_grande_s_p,_hidalgo_co,_tx_-01_(22433393000).jpg',
		],
		'pelican'         => [
			'Wildreturn / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:American_White_Pelican_at_Riverlands_-_51985223838.jpg',
		],
		'fishcrow'        => [
			'lwolfartist / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Crow_JN_Ding_Darling_NWR_4.20.19_DSC_0085.jpg',
		],
		// ---- Batch 4 (1.26.0), the last one ------------------------------
		// The cottonmouth is the only ShareAlike file in the guide. Because
		// our three renditions are crops and resizes of it, they are
		// adaptations and must themselves be offered under the same licence,
		// which the licence field below states outright. It does not reach
		// the plugin's own code: an image shipped alongside code is an
		// aggregation, not a derivative of it.
		'cottonmouth'     => [
			'Rstanton13 / CC BY-SA 4.0',
			'Creative Commons Attribution-ShareAlike 4.0 International — these renditions are offered under the same licence',
			'https://commons.wikimedia.org/wiki/File:Agkistrodon_conanti_Stanton_1.jpg',
		],
		'diamondback'     => [
			'Peter Paplanus / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Eastern_Diamondback_Rattlesnake_(Crotalus_adamanteus)_(25055449725).jpg',
		],
		'pygmy'           => [
			'Jana Miller / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://commons.wikimedia.org/wiki/File:Sistrurus_miliarius_barbouri_46949362.jpg',
		],
		'coralsnake'      => [
			'daniel_e / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://commons.wikimedia.org/wiki/File:Micrurus_fulvius,_Polk_County,_FL,_USA_imported_from_iNaturalist_photo_286627672.jpg',
		],
		'brownwater'      => [
			'U.S. Fish and Wildlife Service (public domain)',
			'Public domain (US Fish and Wildlife Service)',
			'https://commons.wikimedia.org/wiki/File:Brown_watersnake_reptile_nerodia_taxispilota.jpg',
		],
		'greenwater'      => [
			'Alex Abair / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://commons.wikimedia.org/wiki/File:Nerodia_floridana_371403343.jpg',
		],
		// Not a Creative Commons licence: the Commons {{attribution}}
		// template, which permits any use provided the holder is credited.
		// Worded as prose because there is no CC name to give.
		'fireant'         => [
			'© James G. Howes, 2021',
			'Attribution required; free to use with credit (Wikimedia Commons attribution licence)',
			'https://commons.wikimedia.org/wiki/File:Fire_Ant_mound.jpg',
		],
		'poisonivy'       => [
			'Scott Crawford / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://commons.wikimedia.org/wiki/File:Poison_Ivy_02.jpg',
		],
		'mosquito'        => [
			'James Gathany, Centers for Disease Control and Prevention (public domain)',
			'Public domain (work of the US federal government)',
			'https://commons.wikimedia.org/wiki/File:Culexquinquefasciatus.png',
		],
		'lovebug'         => [
			'Judy Gallagher / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Love_Bug_-_Plecia_nearctica,_Okaloacoochee_Slough_State_Forest,_Felda,_Florida.jpg',
		],
		// Held back in 1.25.0 because the frame's "(c) Steve Arena 2013 -
		// USFWS Volunteer" notice did not sit with the public-domain claim
		// it arrived under. Resolved: the Commons file carries TWO tags, and
		// the verified one is CC-BY-2.0 (FlickreviewR checked it against the
		// Flickr source in 2016). The PD-USGov-FWS tag is the uploader's own
		// unchecked assertion, and a USFWS volunteer is not a federal
		// employee. So we rely on CC BY 2.0 — the verified tag and the more
		// restrictive one — and the PD question never has to be answered. A
		// (c) notice and a CC licence sit together normally: a CC licence is
		// a grant BY the holder. Credit is the photographer, not the agency
		// whose Flickr stream hosted it.
		'leastbittern'    => [
			'Steve Arena / U.S. Fish and Wildlife Service / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Least_Bittern_(Ixobrychus_exilis)_-_male_(8723031747).jpg',
		],
		// ---- Batch 5 (1.28.0), the last seven -----------------------------
		// Six from Wikimedia Commons; the applesnail from iNaturalist, which
		// is the first non-Commons source in the guide. Four of the seven
		// carry a real attribution obligation.
		'bandedwater'     => [
			'Judy Gallagher / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Florida_Banded_Water_Snake_-_Nerodia_fasciata_pictiventris,_Highland_Hammock_State_Park,_Sebring,_Florida.jpg',
		],
		'applesnail'      => [
			'John G. Phillips / CC BY 4.0',
			'Creative Commons Attribution 4.0 International',
			'https://www.inaturalist.org/observations/279237196',
		],
		'littleblue'      => [
			'Russ / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:Blue_heron_strolling_on_bunche_beach.jpg',
		],
		'tricolored'      => [
			'lwolfartist / CC BY 2.0',
			'Creative Commons Attribution 2.0 Generic',
			'https://commons.wikimedia.org/wiki/File:South_padre_island_birding_and_nature_center_4.3.23_NOT_green_island_4.3.23_DSC_9779-topaz-denoiseraw.jpg',
		],
		'woodstork'       => [
			'Steve Hillibrand, U.S. Fish and Wildlife Service (public domain)',
			'Public domain (work of the US federal government)',
			'https://commons.wikimedia.org/wiki/File:Mycteria_americana_foraging.jpg',
		],
		'ibis'            => [
			'National Park Service (public domain)',
			'Public domain (work of the US federal government)',
			'https://commons.wikimedia.org/wiki/File:A_white_ibis_seen_within_Cape_Hatteras_National_Seashore._(c8a31394-1dd8-b71c-073e-3137f49397ad).jpg',
		],
		'fern'            => [
			'JamesDeMers / CC0',
			'CC0 1.0 Universal public domain dedication',
			'https://commons.wikimedia.org/wiki/File:Pleopeltis_polypodioides-440348.jpg',
		],
	];

	/**
	 * What a photograph's identification actually rests on, species id =>
	 * one short line (1.25.0). Shown under the photo in the detail sheet.
	 *
	 * Almost every photo in this guide was identified by eye from features
	 * visible in the frame, and needs no note. This is for the exceptions —
	 * and the fish crow is the honest case for it. Fish and American crows
	 * are NOT separable by sight; the accepted field mark is voice. So a
	 * fish crow photograph cannot be verified the way the other thirty-two
	 * were, and shipping one silently would be the guide asserting something
	 * nobody checked. The species entry already tells the reader that the
	 * call is the whole identification; this line says the same thing about
	 * the photograph in front of them, and says where it was taken, so the
	 * claim they see is one the evidence supports.
	 *
	 * This is the fact gate applied to photographs: where the basis is
	 * weaker than "you can see it", say so on the page rather than in a
	 * commit message. Expect the four venomous snakes to need rows here too
	 * — though for those the bar is higher, because a wrong snake on a
	 * safety page can get somebody hurt: a note explains an identification,
	 * it never rescues a doubtful one.
	 */
	private const PHOTO_NOTES = [
		// Batches 10 and 11 (1.33.0). Eight notes, in three shapes. FIVE are the
		// test case for this whole mechanism — the frame does not show the mark
		// the entry names, or does not show the bird in the dress a reader has in
		// mind: spotted sandpiper, Forster's tern, harrier, herring gull,
		// ring-necked duck. TWO say the photograph is one of two colour forms that
		// both occur here, so colour is not the identification: short-tailed hawk,
		// screech-owl. ONE is a photograph taken outside Florida, of the sex that
		// is NOT the confusing one, and says why that was still the right choice:
		// the mallard.
		'spottedsandpiper' => 'Photographed on Sanibel Island in WINTER plumage, which has no spots — and that is deliberate. September to May this is how the bird looks here; the spots it is named for belong to the breeding season further north. The constant teetering, not the spots, is what names it on this canal.',
		'forsterstern' => 'Photographed at Daytona Beach in NON-BREEDING plumage, again on purpose: the black bandit mask through the eye is the winter head, and the black cap most tern pictures show is what these birds wear somewhere else. This is the one you will see over the lakes.',
		'harrier' => 'A female in flight from below, photographed at Gainesville. The white rump patch that identifies a harrier gliding away over a marsh is on the UPPER side and is not visible in this view — what this frame shows instead is the owl-like face and the barred underwing.',
		'herringgull' => 'Photographed in Wakulla County — the only research-grade adult available; most open-licence Florida images are brown juveniles. Its legs are under water, so the pink-legs-versus-yellow-legs test against the ring-billed gull has to be taken from the text rather than from this frame.',
		'ringneckedduck' => 'A drake at Boyd Hill, St Petersburg. The chestnut neck ring the bird is named for is barely visible on a living bird and is not the mark to use; the white ring round the bill, which is plain in this frame, is.',
		'mallard' => 'A drake, photographed outside Florida — the photographer is based in Ontario and the file states no location. A drake was chosen deliberately: the only open-licence Florida images were hens, and a hen mallard against a mottled duck is precisely the confusion this entry exists to settle.',
		'screechowl' => 'A GREY-morph bird in Hillsborough County. Both the grey and the rust-red morph occur here, sometimes in the same brood, so colour is not the identification — the size and the ear tufts are.',
		// Batches 12 and 13 (1.33.0). THREE notes out of sixty photographs, and
		// the drop from eight in the last batch is the point: these are perched
		// songbirds photographed showing their marks, where batches 10 and 11 were
		// distant birds in flight. All three here are the same failure — the frame
		// shows a bird in a plumage or a sex that does not match the name.
		'goldfinch' => 'WINTER plumage, photographed in Jacksonville: olive-tan with black wings, and not a trace of the canary yellow the name promises. This is the only plumage the bird wears in Florida, so the picture is right and the expectation is wrong — the conical bill and the notched tail are what name it here.',
		'kinglet' => 'The ruby crown is RAISED in this frame, which is unusual: the male shows it only when excited or cross, and it is hidden under grey feathers the rest of the time. Do not expect to see it. The broken white eye ring and the constant wing-flicking are the marks that work.',
		'hummingbird' => 'A FEMALE hovering at Fort Myers, and her throat is plain white. Only the male carries the ruby gorget the bird is named for, so this is what a guest is most likely to be looking at — and why the entry says so rather than leading on the throat.',
		// Batch 9 (1.33.0). Four photographs are the right species photographed
		// outside Florida, which the rule says to declare. Two of the four are
		// invasives shown in their NATIVE range, which is worth saying plainly
		// rather than leaving a reader to wonder why a Cuban treefrog was
		// photographed in the Bahamas.
		'greentreefrog' => 'Photographed in Virginia, not Florida. The same species, chosen for the clearest view of the white side-stripe that names it — the Florida images available were either a blue colour variant or a frog behind mesh.',
		'leopardfrog' => 'Photographed in Virginia, not Florida. The same species; the Florida images available were frogs in birdbaths and fountains rather than at a wild water’s edge.',
		'cubantreefrog' => 'Photographed in the Bahamas, inside this frog’s NATIVE range — it is an invader here, not there. Chosen for the close view of the oversized toe pads and warty skin; the Florida images available were night shots on walls.',
		'greenhousefrog' => 'Photographed in its native Caribbean range rather than Florida, where it is an introduction. It is in leaf litter, which is the habit that matters: this frog has no tadpole stage and is found well away from water.',
		// Batch 7 (1.33.0).
		'pusscaterpillar' => 'Photographed in Virginia, not Florida — most open-licence images of this species show the adult moth or the cocoon, and the caterpillar is the stage that stings. The same species lives here.',
		'paperwasps' => 'A Guinea paper wasp on its nest, photographed in Virginia. The species occurs in Florida, and the open umbrella of comb covered in wasps is the thing to recognise whichever Polistes built it.',
		'chiggers' => 'An adult trombiculid mite, photographed in Oklahoma. The stage that bites is the larva, which is a fraction of this size and effectively invisible — there is no photograph that would help you spot one, which is rather the point of the entry.',
		// Batch 6 (1.33.0). The only open-licence photograph of this species
		// that could be found anywhere — iNaturalist holds three in total and
		// Commons a smaller copy of this same one. It is a head-in-shell frame,
		// so the two marks the entry names (no shell stripes, no face stripes)
		// are only half visible in it, and saying so is the rule.
		'floridamudturtle' => 'The only open-licence photograph of a Florida mud turtle that could be found. It is a close-up with the head drawn in, so the plainness that identifies this turtle — an unmarked shell and an unstriped face — is easier to check against the striped mud turtle’s photograph than in this frame alone.',
		// Batch 8 (1.33.0). The photographer's own source page is a U.S. Army
		// Fort Stewart page in GEORGIA, and no location is stated on the file.
		// The guide's rule is that a photograph identified by what is ABSENT
		// from it needs saying out loud; so does one whose PLACE is absent,
		// when every other reptile photograph here is a Florida animal.
		'indigosnake' => 'The clearest view found of this protected snake, and the only one showing no handling. The file states no location, and its source is a U.S. Army page in Georgia, so this is very likely not a Florida animal — the same species, photographed elsewhere in its range.',
		// Not wrapped in __() here: a const cannot hold a function call. The
		// read path below translates it, so Loco still sees one string.
		'fishcrow' => 'Photographed at J.N. “Ding” Darling National Wildlife Refuge, Sanibel Island, Florida. Fish and American crows cannot be told apart by sight — this is a crow at a place where both occur, and the call is what settles it.',
		// Batch 4 (1.26.0). Four more, each for a different reason.
		// The gape is diagnostic on its own — no harmless watersnake does
		// it — but the frame is head-on, so two of the marks this entry
		// names, the vertical pupil and the facial pit, are not in it.
		'cottonmouth' => 'Photographed in Everglades National Park. The open white mouth is the display this snake gives when cornered, and no harmless watersnake does it. The head is face-on here, so the vertical pupil and the facial pit are not visible in this frame.',
		// An absence is the identification here, which is worth saying out
		// loud: a plain back is only diagnostic once you know the others are
		// not plain.
		'greenwater' => 'Photographed near Gainesville, Florida. The plain, unpatterned back is the identification — our other watersnakes are blotched or banded.',
		// The tile names a species; the photograph shows a mound, and
		// Wikimedia Commons files it only as an unidentified Solenopsis. The
		// recognition lesson is what the entry is for, and it holds either
		// way, but the species is not what this frame establishes.
		'fireant' => 'A mound in a Central Florida lawn, about sixteen inches across — the shape to look for before you put a chair, a towel or a bare foot down. The mound was not identified to species by the photographer.',
		// The tile covers two very different animals and shows one of them.
		'mosquito' => 'A southern house mosquito, Culex quinquefasciatus, the common biter here at dusk.',
		// Batch 5 (1.28.0). Deliberately the DARK morph: this is the animal
		// people mistake for a cottonmouth and kill, and a brightly banded
		// juvenile would be prettier and useless, because nobody mistakes
		// those. The narrow head reads clearly; the round pupil this entry
		// also names is not crisply resolvable at this angle, so the note
		// says what the frame does show rather than implying both.
		'bandedwater' => 'A dark adult, the form most often mistaken for a cottonmouth. The head is barely wider than the neck — a cottonmouth’s is blocky, with a dark stripe through the eye.',
	];

	/** The provenance line for a species photo, or '' where none is needed. */
	public static function photo_note( string $id ): string {
		$notes = (array) apply_filters( 'dcc_wl_photo_notes', self::PHOTO_NOTES );
		$note  = (string) ( $notes[ $id ] ?? '' );
		// A note describes a photograph. Without one there is nothing to say.
		if ( '' === (string) ( self::photos()[ $id ] ?? '' ) || '' === $note ) {
			return '';
		}
		// phpcs:ignore WordPress.WP.I18n.NonSingularStringLiteralText
		return __( $note, 'dcc-wildlife' );
	}

	/**
	 * Photo credits, species id => [ credit, licence, source URL ] (1.19.0,
	 * per-photo since 1.24.0). Rendered in the "Photo credits" <details> at
	 * the foot of the guide — crawlable, no JS, so the attribution is there
	 * whether or not anybody opens a species.
	 *
	 * @return array<string,array{0:string,1:string,2:string}>
	 */
	public static function photo_credits(): array {
		$adobe   = [ 'Adobe Stock', __( 'Adobe Stock standard licence', 'dcc-wildlife' ), '' ];
		$credits = [];
		foreach ( array_keys( self::photos() ) as $id ) {
			$credits[ $id ] = self::PHOTO_SOURCES[ $id ] ?? $adobe;
		}
		return (array) apply_filters( 'dcc_wl_photo_credits', $credits );
	}

	/**
	 * The one-line credit shown under the photo in the detail sheet, e.g.
	 * "Photo: lwolfartist / CC BY 2.0" (1.24.0). The sheet is where the image
	 * is actually displayed at size, so this is the line that discharges the
	 * CC BY obligation; the credits panel carries the same facts in full.
	 *
	 * Returns '' for a species with no photo.
	 */
	public static function photo_credit_line( string $id ): string {
		$credits = self::photo_credits();
		if ( ! isset( $credits[ $id ] ) ) {
			return '';
		}
		/* translators: %s: photographer or rights holder, with the licence. */
		return sprintf( __( 'Photo: %s', 'dcc-wildlife' ), (string) $credits[ $id ][0] );
	}

	/** The default credit line, used when a species carries no row of its own. */
	public static function default_credit_line(): string {
		/* translators: %s: photographer or rights holder, with the licence. */
		return sprintf( __( 'Photo: %s', 'dcc-wildlife' ), 'Adobe Stock' );
	}

	/** The 4:3 tile thumbnail beside each photo: <id>-320.jpg (1.19.0). */
	public static function photo_thumb( string $photo ): string {
		return '' === $photo ? '' : (string) preg_replace( '/\.jpg$/', '-320.jpg', $photo );
	}

	public static function photos(): array {
		$ids = [
			// Batch 11 (1.33.0): raptors, owls and night birds.
			'swallowtailedkite', 'redshoulderedhawk', 'redtailedhawk', 'kestrel',
			'coopershawk', 'harrier', 'shorttailedhawk', 'merlin', 'peregrine',
			'blackvulture', 'turkeyvulture',
			'barredowl', 'greathornedowl', 'screechowl', 'barnowl',
			'chuckwillswidow', 'whippoorwill', 'nighthawk',
			'wildturkey', 'scrubjay', 'redcockaded',
			// Batch 10 (1.33.0): water birds and shorebirds.
			'muscovy', 'ringneckedduck', 'lesserscaup', 'hoodedmerganser',
			'bluewingedteal', 'mallard', 'shoveler', 'wigeon', 'egyptiangoose', 'loon',
			'laughinggull', 'ringbilledgull', 'herringgull', 'bonapartesgull',
			'forsterstern', 'caspiantern', 'blackskimmer',
			'killdeer', 'spottedsandpiper', 'greateryellowlegs', 'blackneckedstilt',
			'wilsonssnipe', 'leastsandpiper',
			// Batch 12 (1.33.0): songbirds, doves and woodpeckers, part 1.
			'prothonotary', 'parula', 'palmwarbler', 'yellowrumped', 'paintedbunting',
			'pileated', 'redbellied', 'downy', 'flicker', 'greatcrested', 'bluebird',
			'shrike', 'mockingbird', 'cardinal', 'bluejay', 'carolinawren',
			'titmouse', 'boattailedgrackle', 'redwinged', 'hummingbird',
			'purplemartin', 'barnswallow', 'cedarwaxwing', 'mourningdove',
			'grounddove', 'chickadee', 'treeswallow', 'collareddove',
			// Batch 13 (1.33.0): songbirds, doves and woodpeckers, part 2.
			'gnatcatcher', 'whiteeyedvireo', 'redeyedvireo', 'phoebe', 'housewren',
			'catbird', 'brownthrasher', 'robin', 'towhee', 'commongrackle', 'cowbird',
			'goldfinch', 'pinewarbler', 'yellowthroat', 'blackandwhite',
			'yellowthroated', 'chippingsparrow', 'savannahsparrow', 'meadowlark',
			'housefinch', 'chimneyswift', 'kingbird', 'summertanager',
			'indigobunting', 'kinglet', 'redheaded', 'sapsucker', 'hairy',
			'whitewingeddove', 'rockpigeon', 'housesparrow', 'starling',
			// Batch 20 (1.33.0): plants, part 1.
			'ballmoss', 'liveoak', 'sabalpalm', 'magnolia', 'redmaple', 'sweetgum',
			'coontie', 'pickerelweed', 'alligatorflag', 'cattail', 'beautyberry',
			'coralbean', 'elderberry', 'waxmyrtle', 'waterhyacinth', 'hydrilla',
			'waterlettuce', 'duckweed',
			// Batch 21 (1.33.0): trees.
			'pondcypress', 'laureloak', 'wateroak', 'turkeyoak', 'slashpine',
			'longleafpine', 'sandpine', 'redcedar', 'dahoon', 'redbay', 'sweetbay',
			'loblollybay', 'swamptupelo', 'popash', 'persimmon', 'chickasawplum',
			'camphor', 'chinesetallow',
			// Batch 22 (1.33.0): wildflowers, shrubs, vines and lichen.
			'tickseed', 'blanketflower', 'spanishneedles', 'spiderwort', 'maypop',
			'coralhoneysuckle', 'firebush', 'muscadine', 'virginiacreeper', 'lantana',
			'dogfennel', 'butterflyweed', 'buttonbush', 'yaupon', 'floridarosemary',
			'pricklypear', 'adamsneedle', 'reindeerlichen', 'airpotato', 'cogongrass',
			// Batch 23 (1.33.0): water plants.
			'spatterdock', 'lotus', 'arrowhead', 'stringlily', 'blueflag',
			'bladderwort', 'eelgrass', 'maidencane', 'sawgrass', 'primrosewillow',
			'alligatorweed', 'torpedograss',
			// Batch 14 (1.33.0): mammals.
			'blackbear', 'raccoon', 'opossum', 'armadillo', 'deer', 'wildhog',
			'greysquirrel', 'foxsquirrel', 'marshrabbit', 'cottontail', 'greyfox',
			'bobcat', 'coyote', 'freetailedbat', 'rhesus', 'eveningbat',
			'seminolebat', 'flyingsquirrel', 'cottonrat', 'skunk',
			// Batch 14b (1.33.0): mammal supplement.
			'pocketgopher', 'floridamouse',
			// Batch 15 (1.33.0): fish.
			'sunshinebass', 'bluegill', 'redear', 'spottedsunfish', 'warmouth',
			'crappie', 'floridagar', 'bowfin', 'channelcatfish', 'brownbullhead',
			'pickerel', 'goldenshiner', 'bluetilapia', 'armoredcatfish',
			'mosquitofish', 'threadfinshad', 'gizzardshad', 'seminolekillifish',
			'redbreast', 'bluespotted', 'dollarsunfish', 'chubsucker', 'whitecatfish',
			'yellowbullhead', 'longnosegar', 'leastkillifish', 'goldentopminnow',
			'sailfinmolly', 'brooksilverside', 'grasscarp', 'eel',
			// Batch 16 (1.33.0): dragonflies and damselflies.
			'greendarner', 'bluedasher', 'pondhawk', 'halloweenpennant',
			'greatblueskimmer', 'fourspotted', 'needhams', 'saddlebags', 'amberwing',
			'rambursforktail', 'citrineforktail',
			// Batch 17 (1.33.0): butterflies and moths.
			'zebralongwing', 'gulffritillary', 'monarch', 'tigerswallowtail',
			'giantswallowtail', 'palamedes', 'cloudlesssulphur', 'queen',
			'whitepeacock', 'viceroy', 'blackswallowtail', 'zebraswallowtail',
			'spicebush', 'redadmiral', 'buckeye', 'ceraunusblue', 'grayhairstreak',
			'southernwhite', 'sleepyorange', 'barredyellow', 'phaoncrescent',
			'longtailedskipper', 'fieryskipper', 'luna', 'waspmoth', 'imperialmoth',
			'tersasphinx',
			// Batch 18 (1.33.0): other small things.
			'islandapplesnail', 'crayfish', 'goldensilk', 'lubber', 'firefly',
			'cicadas', 'spinyorbweaver', 'greenlynx', 'regaljumper', 'carolinamantis',
			'walkingstick', 'hercules', 'tortoisebeetle', 'carpenterant', 'cockroach',
			'asianclam', 'grassshrimp',
			// Batch 19 (1.33.0): the last reptiles.
			'scarletking', 'hognose', 'coachwhip', 'crayfishsnake', 'sandskink',
			'wormlizard', 'scrublizard', 'indopacificgecko', 'tropicalgecko',
			// The round-tailed muskrat is deliberately absent: the owner decided it
			// ships with no photograph, on the group glyph. Do not add one.
			// Batch 9 (1.33.0): the amphibians.
			'greentreefrog', 'squirreltreefrog', 'barkingtreefrog', 'pinewoodstreefrog',
			'cubantreefrog', 'pigfrog', 'bullfrog', 'leopardfrog', 'gopherfrog',
			'southerntoad', 'oaktoad', 'narrowmouthtoad', 'spadefoot',
			'cricketfrog', 'littlegrassfrog', 'greenhousefrog',
			'greatersiren', 'amphiuma', 'peninsulanewt',
			// Batch 8 (1.33.0): the snakes and lizards on dry land.
			'blackracer', 'yellowratsnake', 'cornsnake', 'gartersnake', 'ribbonsnake',
			'ringnecksnake', 'roughgreensnake', 'mudsnake', 'indigosnake',
			'greenanole', 'brownanole', 'fivelinedskink', 'broadheadskink',
			'groundskink', 'racerunner', 'glasslizard', 'housegecko',
			// Batch 7 (1.33.0): the rest of Know before you go.
			'noseeums', 'canetoad', 'blackwidow', 'brownwidow', 'pusscaterpillar',
			'saddleback', 'paperwasps', 'yellowjacket', 'lonestartick', 'chiggers',
			'yellowfly', 'treadsoftly', 'brazilianpepper', 'velvetant',
			// Batch 6 (1.33.0): the twelve turtles the composite entry used
			// to stand in for.
			'peninsulacooter', 'redbelliedcooter', 'redearedslider', 'softshell',
			'snappingturtle', 'gophertortoise', 'boxturtle', 'muskturtle',
			'loggerheadmusk', 'stripedmudturtle', 'floridamudturtle', 'chickenturtle',
			'alligator', 'manatee', 'otter', 'fish', 'eagle', 'osprey',
			'anhinga', 'heron', 'egret', 'kingfisher', 'limpkin', 'greenheron',
			'cypress', 'moss', 'lily', 'palmetto',
			// Batch 1 of the Phase 2 photo run (1.23.1). Each was checked
			// against the species by eye before it was licensed AND again
			// here — the cormorant in particular, because the classic bad
			// substitution for it is an anhinga, which this guide also
			// carries. photo_credits() picks these up automatically.
			'greategret', 'cattleegret', 'glossyibis', 'sandhill',
			'bcnightheron', 'cormorant',
			// Batch 2 (1.24.0) — Wikimedia Commons, not Adobe Stock, whose
			// free pool is thin for North American species. Commons files
			// are filed by taxonomic category rather than a seller's
			// caption, and each was still identified by eye here. Three of
			// the six carry a CC BY obligation, so PHOTO_SOURCES below has
			// a real row for every one of them.
			'ycnightheron', 'purplegallinule', 'commongallinule',
			'grebe', 'woodduck', 'coot',
			// Batch 3 (1.25.0), Wikimedia Commons. Four of the five shipped:
			// the least bittern is held back because its frame carries a
			// "(c) Steve Arena 2013 - USFWS Volunteer" notice that its
			// public-domain claim does not account for. The crow ships with
			// a PHOTO_NOTES line rather than a bare claim, because fish and
			// American crows cannot be told apart by sight at all.
			'mottledduck', 'whistlingduck', 'pelican', 'fishcrow',
			// Batch 4 (1.26.0), the last one. This closes the programme:
			// after these eleven no species falls through to a group glyph.
			// The six snakes were each checked against the mark and fact
			// fields this registry already claims for them — see the notes
			// in PHOTO_SOURCES and PHOTO_NOTES.
			'cottonmouth', 'diamondback', 'pygmy', 'coralsnake',
			'brownwater', 'greenwater', 'fireant', 'poisonivy',
			'mosquito', 'lovebug', 'leastbittern',
			// Batch 5 (1.28.0) — the last seven, and the end of the photo
			// programme: every species in the guide has a photograph now and
			// the group-glyph tier and the species sprites both render for
			// nobody. Neither is deleted; see CLAUDE.md.
			'bandedwater', 'applesnail', 'littleblue', 'tricolored',
			'woodstork', 'ibis', 'fern',
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
	 * Verified encyclopedia entities, species id => list of sameAs URLs.
	 *
	 * Used ONLY for the JSON-LD `sameAs` on the field guide (1.16.0) — this is
	 * how a machine learns that our "Limpkin" is the same thing the rest of the
	 * web calls Aramus guarauna. Deliberately NOT part of dataset(): it never
	 * reaches the browser, so it costs the client payload nothing. Nothing here
	 * is a guess; how each row was confirmed is noted beside it.
	 *
	 * @return array<string,string[]>
	 */
	public static function entities(): array {
		$W = 'https://www.wikidata.org/wiki/';
		$entities = [
			// Each row is the list of VERIFIED sameAs targets for that species.
			// Rows through 1.19.0 carry a Wikipedia article and its Wikidata
			// item, both resolved by querying the MediaWiki API with the
			// scientific name and confirming the article is that taxon
			// (2026-09-02). Two judgement calls, both deliberate:
			//
			// - 'manatee' — our subspecies (T. m. latirostris) has no
			//   standalone article; "Florida manatee" redirects to the species.
			// - 'turtle' — absent ON PURPOSE. That entry covers Pseudemys spp.
			//   AND Apalone ferox; no single entity is true, so it gets none.
			//   Same rule as the water module's Fact gate: no verified source,
			//   no claim.
			'alligator'   => [ 'https://en.wikipedia.org/wiki/American_alligator', $W . 'Q193327' ],
			'manatee'     => [ 'https://en.wikipedia.org/wiki/West_Indian_manatee', $W . 'Q40261' ],
			'otter'       => [ 'https://en.wikipedia.org/wiki/North_American_river_otter', $W . 'Q327028' ],
			'fish'        => [ 'https://en.wikipedia.org/wiki/Largemouth_bass', $W . 'Q755105' ],
			'applesnail'  => [ 'https://en.wikipedia.org/wiki/Pomacea_paludosa', $W . 'Q3142468' ],
			'eagle'       => [ 'https://en.wikipedia.org/wiki/Bald_eagle', $W . 'Q127216' ],
			'osprey'      => [ 'https://en.wikipedia.org/wiki/Osprey', $W . 'Q25332' ],
			'anhinga'     => [ 'https://en.wikipedia.org/wiki/Anhinga', $W . 'Q469940' ],
			'heron'       => [ 'https://en.wikipedia.org/wiki/Great_blue_heron', $W . 'Q333796' ],
			'egret'       => [ 'https://en.wikipedia.org/wiki/Snowy_egret', $W . 'Q59785' ],
			'kingfisher'  => [ 'https://en.wikipedia.org/wiki/Belted_kingfisher', $W . 'Q736052' ],
			'limpkin'     => [ 'https://en.wikipedia.org/wiki/Limpkin', $W . 'Q725276' ],
			'ibis'        => [ 'https://en.wikipedia.org/wiki/American_white_ibis', $W . 'Q589171' ],
			'woodstork'   => [ 'https://en.wikipedia.org/wiki/Wood_stork', $W . 'Q990175' ],
			'littleblue'  => [ 'https://en.wikipedia.org/wiki/Little_blue_heron', $W . 'Q371028' ],
			'tricolored'  => [ 'https://en.wikipedia.org/wiki/Tricolored_heron', $W . 'Q392139' ],
			'greenheron'  => [ 'https://en.wikipedia.org/wiki/Green_heron', $W . 'Q498228' ],
			'cypress'     => [ 'https://en.wikipedia.org/wiki/Taxodium_distichum', $W . 'Q148950' ],
			'moss'        => [ 'https://en.wikipedia.org/wiki/Spanish_moss', $W . 'Q311524' ],
			'fern'        => [ 'https://en.wikipedia.org/wiki/Pleopeltis_michauxiana', $W . 'Q56761285' ],
			'lily'        => [ 'https://en.wikipedia.org/wiki/Nymphaea_odorata', $W . 'Q635853' ],
			'palmetto'    => [ 'https://en.wikipedia.org/wiki/Serenoa', $W . 'Q927607' ],

			// Batch 1 (1.19.1). Every Q-id below was confirmed against the
			// item's taxon name (P225) from a networked machine on 2026-09-08;
			// the audit record is tools/entities-batch1.csv. WIKIDATA ONLY on
			// purpose: the Wikipedia slugs were never verified, and a guessed
			// article URL is the same class of error as a guessed Q-id.
			'bandedwater' => [ 'https://en.wikipedia.org/wiki/Florida_banded_water_snake', $W . 'Q6996593' ], // subspecies; species-level is Q2065834
			'cottonmouth' => [ $W . 'Q4692725' ],
			'diamondback' => [ $W . 'Q744532' ],
			'pygmy'       => [ $W . 'Q7531461' ],  // subspecies, like the manatee row
			'coralsnake'  => [ $W . 'Q1513945' ],
			'fireant'     => [ $W . 'Q1194382' ],
			'poisonivy'   => [ $W . 'Q7218532' ],
			'lovebug'     => [ $W . 'Q1763509' ],
			// One tile, two real taxa — the family and the genus — so it names
			// both rather than pretending to be one species. This is also why
			// no @type carries a taxonRank anywhere in the graph.
			'mosquito'    => [ $W . 'Q7367', $W . 'Q2324817' ],
			'brownwater'  => [ $W . 'Q900792' ],
			'greenwater'  => [ $W . 'Q2708567' ],

			// Batch 2 (1.21.0). Confirmed against P225 from a networked machine
			// on 2026-09-09; audit record in tools/entities-batch2.csv. Wikidata
			// only, for the same reason as batch 1 — the enwiki sitelinks exist
			// on most of these entities but were not read out, and reading them
			// from the entity is the only way they may be added.
			'greategret'      => [ $W . 'Q130730' ],
			'cattleegret'     => [ $W . 'Q132669' ],   // no enwiki sitelink since the 2023 split
			'glossyibis'      => [ $W . 'Q178811' ],
			'sandhill'        => [ $W . 'Q62576305' ], // subspecies; species-level is Q503804
			'bcnightheron'    => [ $W . 'Q126216' ],
			'ycnightheron'    => [ $W . 'Q764282' ],
			'leastbittern'    => [ $W . 'Q469586' ],
			// Q725289 (Phalacrocorax auritus) is a stale duplicate with no
			// sitelink. This is the live entity — do not "fix" it back.
			'cormorant'       => [ $W . 'Q117254648' ],
			'commongallinule' => [ $W . 'Q1263469' ],
			'purplegallinule' => [ $W . 'Q27074644' ],
			'coot'            => [ $W . 'Q470016' ],
			'grebe'           => [ $W . 'Q579718' ],
			'woodduck'        => [ $W . 'Q322159' ],
			'mottledduck'     => [ $W . 'Q27601055' ], // subspecies; species-level is Q1002123
			'whistlingduck'   => [ $W . 'Q752461' ],
			'pelican'         => [ $W . 'Q735190' ],
			'fishcrow'        => [ $W . 'Q1420315' ],
		];

		/**
		 * Filter the verified entity map (species id => list of sameAs URLs).
		 *
		 * A species added via dcc_wl_species with no row here simply gets no
		 * sameAs — an unverified guess is worse than silence. The legacy
		 * [ Wikipedia URL, 'Q123' ] pair shape is still accepted; see
		 * entity_links().
		 *
		 * @param array<string,string[]> $entities
		 */
		return (array) apply_filters( 'dcc_wl_entities', $entities );
	}

	/**
	 * The sameAs URLs for one species, or [] if none is verified.
	 *
	 * Normalizes the pre-1.19.1 row shape, where the second element was a bare
	 * Q-id rather than a URL, so a site filtering `dcc_wl_entities` with the
	 * old pair keeps working.
	 *
	 * @return string[]
	 */
	public static function entity_links( string $id ): array {
		$row = self::entities()[ $id ] ?? [];
		$out = [];
		foreach ( (array) $row as $v ) {
			$v = (string) $v;
			if ( 1 === preg_match( '/^Q\d+$/', $v ) ) {
				$v = 'https://www.wikidata.org/wiki/' . $v;
			}
			if ( '' !== $v ) {
				$out[] = $v;
			}
		}

		return array_values( array_unique( $out ) );
	}

	/**
	 * Registry + calendar merged into a JS-friendly ordered list, with the
	 * filtered values normalized (12 months per species, each clamped 0–3).
	 *
	 * @return array<int,array<string,mixed>>
	 */
	/**
	 * THE WIRE SPLIT (1.33.0) — what the FIRST VIEW needs, and nothing else.
	 *
	 * Through 1.32.1 every field of every species was inlined into the page.
	 * At fifty-one species that was 16 KB gzipped and nobody noticed. Measured
	 * against a synthetic four-hundred-species registry with the longer prose
	 * this release calls for, it becomes 103 KB gzipped — on every page view,
	 * for a guest who may never open a single sheet.
	 *
	 * These are the fields the client reads BEFORE a sheet opens, arrived at
	 * by reading the scripts rather than by guessing:
	 *   months, haz        the counts, the spotlight, Peak Now, the strip
	 *   name, sci, mark    the search haystack — all three, exactly as today
	 *   flags, group       the tile marks and the glyph fallback
	 *   src, sprite, id    the tile face and the hub's preview art
	 * `mark` and `name` are also what a look-alike row shows, so the ID helper
	 * still works from the index alone.
	 *
	 * Everything else — the fact, the what-to-do line, where and when, the
	 * sound, the place, the look-alike GROUPING, the photo credit and its note
	 * — is sheet-only and travels on demand. Measured at four hundred species:
	 * 8.9 KB inline, 78 KB fetched once by a guest who opens a sheet.
	 *
	 * FOUR FIELDS LEFT THE WIRE ENTIRELY, because no line of client code has
	 * ever read them: `thumb`, `photoW`, `odds` and `emoji`. `odds` stopped
	 * being rendered in 1.27.0 and `emoji` when the sprites arrived; both kept
	 * riding along.
	 */
	public const WIRE_INDEX = [
		'id', 'name', 'sci', 'mark', 'months', 'flags', 'haz', 'group', 'src', 'sprite',
	];

	/** Fields that never reach the browser at all. */
	public const WIRE_NEVER = [ 'thumb', 'photoW', 'odds', 'emoji' ];

	/**
	 * Split one dataset row into [ index, detail ].
	 *
	 * @param array<string,mixed> $sp
	 * @return array{0:array<string,mixed>,1:array<string,mixed>}
	 */
	public static function wire_split( array $sp ): array {
		$index  = [];
		$detail = [];
		foreach ( $sp as $k => $v ) {
			if ( in_array( $k, self::WIRE_NEVER, true ) ) {
				continue;
			}
			if ( in_array( $k, self::WIRE_INDEX, true ) ) {
				$index[ $k ] = $v;
			} else {
				$detail[ $k ] = $v;
			}
		}
		return [ $index, $detail ];
	}

	/**
	 * The sheet-only half of every species, keyed by id.
	 *
	 * @return array<string,array<string,mixed>>
	 */
	public static function wire_detail(): array {
		$out = [];
		foreach ( self::dataset() as $sp ) {
			$sp['sprite']          = Sprites::has( (string) $sp['id'] );
			[ , $detail ]          = self::wire_split( $sp );
			$out[ (string) $sp['id'] ] = $detail;
		}
		return $out;
	}

	public static function dataset(): array {
		/* Memoised with the registry it derives from, and for the same
		 * measured reason: twelve builds per hub render, ~86ms each. */
		if ( null !== self::$dataset_cache ) {
			return self::$dataset_cache;
		}
		$calendar = self::calendar();
		$photos   = self::photos();
		$credits  = self::photo_credits();
		$default  = self::default_credit_line();
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
				// Optional: only species with a verified, distinctive sound
				// carry one. Absent is normal and renders nothing.
				'sound'     => (string) ( $sp['sound'] ?? '' ),
				// Look-alike grouping: which confusable set this species belongs
				// to, and the field mark that settles it. Both optional.
				'idgroup'   => (string) ( $sp['idgroup'] ?? '' ),
				'mark'      => (string) ( $sp['mark'] ?? '' ),
				// Which chip inside the Animals section jumps to this species.
				// Empty for plants and for the safety list, which are their own
				// destinations and short enough not to need sub-navigation.
				'browse'    => (string) ( $sp['browse'] ?? '' ),
				// The filenames stay in the payload: they say a species HAS a
				// photograph, and the importer finds files by them. They are no
				// longer used to build a URL — see `src` below.
				'photo'     => (string) ( $photos[ $id ] ?? '' ),
				'photoW'    => self::photo_width( $id ),
				'thumb'     => self::photo_thumb( (string) ( $photos[ $id ] ?? '' ) ),
				/*
				 * REAL URLs, resolved per rendition (1.29.0). Media library
				 * first, a bundled file second, '' when neither has it — and
				 * '' is how the client knows to fall through to the drawing
				 * and then the glyph. The widths come from the attachment
				 * metadata where there is one, so the srcset descriptor cannot
				 * drift from the file the way a hand-kept table can.
				 */
				'src'       => '' === (string) ( $photos[ $id ] ?? '' ) ? null : [
					'thumb' => Photo_Library::url( (string) $id, 'thumb' ),
					'mid'   => Photo_Library::url( (string) $id, 'mid' ),
					'full'  => Photo_Library::url( (string) $id, 'full' ),
					'w'     => Photo_Library::width( (string) $id, 'full' ),
					'midW'  => Photo_Library::width( (string) $id, 'mid' ),
				],
				// Per-photo attribution for the detail sheet (1.24.0). Sent
				// only when it differs from the default Adobe line, which the
				// browser already holds as an i18n string — so the twenty-three
				// Adobe photos still cost the payload nothing and only a photo
				// with its own credit carries one. photo_credit_line() is
				// always complete; this is transport, not the data model.
				'credit'    => isset( $credits[ $id ] ) && self::photo_credit_line( $id ) !== $default
					? self::photo_credit_line( $id )
					: '',
				'creditUrl' => (string) ( $credits[ $id ][2] ?? '' ),
				// Where a photograph's identification rests on something
				// other than what is visible in it (1.25.0). Empty for all
				// but the fish crow today.
				'photoNote' => self::photo_note( (string) $id ),
				'group'     => (string) ( $sp['group'] ?? 'critters' ),
				/*
				 * Hazard, decided server-side (1.33.0). The client used to ask
				 * `group !== 'safety'`, which is not the same question — it
				 * missed the alligator, whose group is `critters`. Both JS
				 * files now read this one flag, so widget.js's Peak Now tab
				 * and canal.js's hub tile cannot disagree about which species
				 * a count includes.
				 */
				'haz'       => self::is_hazard( $sp ) ? 1 : 0,
				// 1.19.0 data model: flags the legend encodes, how likely a
				// meeting is, where to drive for it (empty = here), and the
				// plain what-to-do line for anything flagged.
				'flags'     => array_values( array_intersect( (array) ( $sp['flags'] ?? [] ), array_keys( self::flags() ) ) ),
				'odds'      => isset( self::odds()[ $sp['odds'] ?? '' ] ) ? (string) $sp['odds'] : '',
				'place'     => (string) ( $sp['place'] ?? '' ),
				'safe'      => (string) ( $sp['safe'] ?? '' ),
				'fact'      => (string) ( $sp['fact'] ?? '' ),
				'best'      => (string) ( $sp['best'] ?? '' ),
				'where'     => (string) ( $sp['where'] ?? '' ),
				'months'    => $months,
				'bestLabel' => self::best_months_label( $months ),
			];
		}

		self::$dataset_cache = $dataset;

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
