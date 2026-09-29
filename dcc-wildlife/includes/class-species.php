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
				'odds'  => 'certain',
				'fact'  => __( 'The cathedral tree of the canal, and older than the canal itself: this was the Elfin River until 1882, when crews widened it for the steamboats, and the cypress were already old men by then. The species can pass 2,000 years. What the woody “knees” along the bank are actually for still genuinely puzzles botanists after two centuries of argument.', 'dcc-wildlife' ),
				'best'  => __( 'golden hour', 'dcc-wildlife' ),
				'where' => __( 'lining both banks — the knees poke up along the waterline', 'dcc-wildlife' ),
			],
			'moss'       => [
				'browse' => 'wildflowers',
				'emoji' => '🌿',
				'name'  => __( 'Spanish Moss', 'dcc-wildlife' ),
				'sci'   => 'Tillandsia usneoides',
				'group' => 'plants',
				'odds'  => 'certain',
				'fact'  => __( 'Not a moss, and not a parasite: it is an air plant in the pineapple family, and the tree is a perch and nothing more. It has no roots at all. Every drop it drinks comes in through the tiny silvery scales that sheathe each strand and give the whole thing its grey.', 'dcc-wildlife' ),
				'best'  => __( 'any time', 'dcc-wildlife' ),
				'where' => __( 'draped from the cypress and oak canopy overhead', 'dcc-wildlife' ),
			],
			'fern'       => [
				'browse' => 'wildflowers',
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
