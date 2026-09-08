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
	 * Shorter labels for the segmented switch, where four words do not fit
	 * beside three other groups on a phone. Falls back to groups().
	 *
	 * @return array<string,string>
	 */
	public static function tab_labels(): array {
		return [ 'safety' => __( 'Before you go', 'dcc-wildlife' ) ] + self::groups();
	}

	/**
	 * Flag slugs => [ label, one-line meaning ], in legend order (1.19.0).
	 * These are what the colour legend encodes; a mark that cannot earn a
	 * line here must not appear on a tile.
	 *
	 * @return array<string,array{0:string,1:string}>
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
				'fact'  => __( 'Florida’s venomous water snake, and the one to learn. Heavy-bodied, with a blocky head, a dark mask through the eye and a pale stripe along the upper lip; the young have a bright yellow tail tip. Cornered, it stands its ground, coils, and gapes the white lining of the mouth that gives it its name. It does not chase people.', 'dcc-wildlife' ),
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
				'fact'  => __( 'The largest venomous snake in North America, and a dry-ground animal — palmetto scrub, sandhill and pine flatwoods, not the canal edge. Bold diamonds down the back, and a rattle it will usually sound before you get close. Uncommon here, and getting scarcer.', 'dcc-wildlife' ),
				'safe'  => __( 'If you hear the buzz, stop, find it, and walk the other way. It will not follow.', 'dcc-wildlife' ),
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
				'fact'  => __( 'Florida’s most commonly met rattlesnake, and the easiest to step near: a foot or two long, grey with dark blotches and a rusty stripe down the back, with a rattle so small it sounds like an insect. It lies still in leaf litter at trail and lawn edges. Painful, rarely fatal, never worth testing.', 'dcc-wildlife' ),
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
				'fact'  => __( 'Slender and secretive, with red, yellow and black bands right round the body and a black snout. The old rhyme holds here — red touches yellow, it is the coral snake; red touches black, it is a harmless scarlet kingsnake or scarlet snake. It spends most of its life under leaf litter and logs and almost never bites unless it is handled.', 'dcc-wildlife' ),
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
				'fact'  => __( 'A South American ant that arrived through the port of Mobile in the 1930s and now owns most Florida lawns. The mounds are loose domes of soft soil with no visible entrance; stand on one and the workers pour out and sting in numbers, leaving small white pustules that itch for days.', 'dcc-wildlife' ),
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
				'fact'  => __( 'Leaves of three, let it be. It climbs the oaks and cypress as a hairy vine and runs along the ground at the woods’ edge; the three glossy leaflets may be toothed or smooth, reddish in spring and again in autumn. The oil in every part of the plant — leaves, stem, root, even the bare winter vine — raises an itching rash a day or two after contact.', 'dcc-wildlife' ),
				'safe'  => __( 'Don’t touch the hairy vines on the trees. If you brush it, wash with soap and cool water within the hour.', 'dcc-wildlife' ),
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
				'fact'  => __( 'Dusk on the water belongs to them. Mosquitoes rise after the summer rains; the no-see-ums — biting midges small enough to pass through a screen — come with still, humid air at dawn and dusk, spring and autumn. Neither will spoil a stay. Both will spoil a sunset.', 'dcc-wildlife' ),
				'safe'  => __( 'Bring repellent — we mean it — and long sleeves for the last hour of light.', 'dcc-wildlife' ),
				'best'  => __( 'dusk and dawn, on still humid evenings', 'dcc-wildlife' ),
				'where' => __( 'anywhere along the water’s edge at last light', 'dcc-wildlife' ),
			],
			'lovebug'     => [
				'emoji' => '🪰',
				'name'  => __( 'Lovebugs', 'dcc-wildlife' ),
				'sci'   => 'Plecia nearctica',
				'group' => 'safety',
				'flags' => [ 'nuisance' ],
				'odds'  => 'certain',
				'fact'  => __( 'Twice a year — a few weeks in late April and May, and again in late August and September — the air fills with small black flies joined in pairs, drifting over the road and the lawn. They neither bite nor sting; they are march flies whose larvae feed on decaying grass. The only thing they harm is car paint.', 'dcc-wildlife' ),
				'safe'  => __( 'Nothing to do but wash the windshield the same day.', 'dcc-wildlife' ),
				'best'  => __( 'mid-morning to late afternoon, in the two flights', 'dcc-wildlife' ),
				'where' => __( 'everywhere — over the lawn, the road and the dock', 'dcc-wildlife' ),
			],
			// ---- CRITTERS ----------------------------------------------
			'alligator'  => [
				'emoji' => '🐊',
				'name'  => __( 'Alligator', 'dcc-wildlife' ),
				'sci'   => 'Alligator mississippiensis',
				'group' => 'critters',
				'odds'  => 'certain',
				'flags' => [ 'danger' ],
				'safe'  => __( 'Never feed one — a fed gator loses its fear of people and has to be destroyed. Keep pets and small children back from the water’s edge, and give any gator on the bank a wide berth.', 'dcc-wildlife' ),
				'fact'  => __( 'Florida’s state reptile. In spring the big bulls bellow at a pitch you feel as much as hear — hard enough to tremble the water into a fine spray off their backs.', 'dcc-wildlife' ),
				'best'  => __( 'warm, sunny middays', 'dcc-wildlife' ),
				'where' => __( 'basking on sunny banks, or holding log-still mid-canal', 'dcc-wildlife' ),
				'sound' => __( 'Warm spring nights, when the bulls answer each other across the water — courtship runs April into May. The hatchlings even call to their mother from inside the egg.', 'dcc-wildlife' ),
			],
			'manatee'    => [
				'emoji' => '🦭',
				'name'  => __( 'Manatee', 'dcc-wildlife' ),
				'sci'   => 'Trichechus manatus latirostris',
				'group' => 'critters',
				'odds'  => 'rare',
				'flags' => [ 'protected' ],
				'safe'  => __( 'Protected under federal law: never touch, feed, chase or crowd one, and keep the boat at idle when one is near.', 'dcc-wildlife' ),
				'fact'  => __( 'A rare and special visitor: the first manatee ever recorded in the Harris Chain arrived in 2015, and one has wandered up into the canal only a handful of times since — most likely in the warmer months. They’re kin to elephants, not seals.', 'dcc-wildlife' ),
				'best'  => __( 'calm, sunny days', 'dcc-wildlife' ),
				'where' => __( 'slow water mid-canal — watch for a swirl and a round snout surfacing', 'dcc-wildlife' ),
			],
			'otter'      => [
				'emoji' => '🦦',
				'name'  => __( 'River Otter', 'dcc-wildlife' ),
				'sci'   => 'Lontra canadensis',
				'group' => 'critters',
				'odds'  => 'occasional',
				'fact'  => __( 'Playful and semi-aquatic, it can hold its breath up to eight minutes when it needs to. Look for the well-worn “latrine” spots where a family checks in along the bank.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'along the banks near fallen trees and root tangles', 'dcc-wildlife' ),
				'sound' => __( 'High, sharp chirps traded back and forth while they splash — more bird than mammal until you spot the wake.', 'dcc-wildlife' ),
			],
			'turtle'     => [
				'emoji' => '🐢',
				'name'  => __( 'Turtles', 'dcc-wildlife' ),
				'sci'   => 'Pseudemys spp. & Apalone ferox',
				'group' => 'critters',
				'odds'  => 'certain',
				'fact'  => __( 'Peninsula and red-bellied cooters and yellow-bellied sliders line the logs to bask. The flat, leathery Florida softshell is the odd one out — it snorkels at the surface with its body buried in the mud.', 'dcc-wildlife' ),
				'best'  => __( 'sunny afternoons', 'dcc-wildlife' ),
				'where' => __( 'lined up on half-sunken logs across from the dock', 'dcc-wildlife' ),
			],
			// The snake split (1.19.0). The generic "Water Snake" hid the one
			// distinction that carries risk; the cottonmouth lives in the
			// safety group above, and these are the harmless lookalikes.
			'bandedwater' => [
				'emoji' => '🐍',
				'name'  => __( 'Florida Banded Watersnake', 'dcc-wildlife' ),
				'sci'   => 'Nerodia fasciata pictiventris',
				'group' => 'critters',
				'odds'  => 'certain',
				'fact'  => __( 'The snake you will actually see: nearly every snake over the water here is this harmless one. Dark crossbands on a reddish-brown to grey body, and a dark line from the eye to the corner of the jaw. Cornered, it flattens and hisses and may bite, but it has no venom. Tell it from the cottonmouth by its round pupil, a narrow head barely wider than the neck, and no facial pit between eye and nostril.', 'dcc-wildlife' ),
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
				'odds'  => 'certain',
				'fact'  => __( 'A big, heavy brown watersnake with square dark blotches down the back and a head noticeably wider than the neck — which is why it is so often mistaken for a cottonmouth, and killed for it. It loves to bask on branches overhanging the water and drops in with a splash when a boat passes. Harmless, and a great fish-eater.', 'dcc-wildlife' ),
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
				'odds'  => 'likely',
				'fact'  => __( 'The largest of the watersnakes — olive-green, plain or faintly speckled, without the bands of its cousin — and the one that prefers quiet, weedy shallows and marsh edges over open bank. Shy, quick to disappear into the vegetation, and harmless.', 'dcc-wildlife' ),
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
				'odds'  => 'likely',
				'fact'  => __( 'The Harris Chain is a nationally known trophy-bass water — Lake Dora has given up largemouth over twelve pounds. Bluegill and black crappie school in the clear shallows around them.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'clear shallows off the dock, and along the deep hydrilla edges', 'dcc-wildlife' ),
			],
			'applesnail' => [
				'emoji' => '🐌',
				'name'  => __( 'Apple Snail', 'dcc-wildlife' ),
				'sci'   => 'Pomacea paludosa',
				'group' => 'critters',
				'odds'  => 'likely',
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
				'odds'  => 'likely',
				'flags' => [ 'protected' ],
				'safe'  => __( 'Protected under federal law: keep well back from a nest tree and never disturb a roosting or nesting bird.', 'dcc-wildlife' ),
				'fact'  => __( 'Bald eagles build the largest nests of any North American bird — one Florida nest weighed over two tons after years of reuse. Ours nest through the cool season, opposite their northern cousins.', 'dcc-wildlife' ),
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
				'odds'  => 'certain',
				'fact'  => __( 'The only raptor that plunges feet-first — sometimes fully underwater — to catch fish. A reversible outer toe lets it grip a slippery catch and line it up head-first in flight to cut the drag.', 'dcc-wildlife' ),
				'best'  => __( 'mid-morning', 'dcc-wildlife' ),
				'where' => __( 'circling high over open water, then a sudden plunge', 'dcc-wildlife' ),
				'sound' => __( 'A rising and falling series of sharp whistles — the Cornell Lab likens it to a kettle taken quickly off the stove. This, not the eagle, is the loud whistler over the water.', 'dcc-wildlife' ),
				'idgroup' => 'raptor',
				'mark' => __( 'white underneath with a bold dark stripe through the eye; the wings kink into an M seen from below', 'dcc-wildlife' ),
			],
			'anhinga'    => [
				'emoji' => '🐦',
				'name'  => __( 'Anhinga', 'dcc-wildlife' ),
				'sci'   => 'Anhinga anhinga',
				'group' => 'birds',
				'odds'  => 'certain',
				'fact'  => __( 'The “snakebird” swims with only its sinuous neck above the surface. Its feathers aren’t waterproof — a feature, not a flaw, since it sinks to hunt — so it must perch with wings spread wide to dry.', 'dcc-wildlife' ),
				'best'  => __( 'sunny middays', 'dcc-wildlife' ),
				'where' => __( 'perched wings-out on snags and dock rails, drying off', 'dcc-wildlife' ),
				'idgroup' => 'dark',
				'mark' => __( 'not a heron at all — a snaky neck, a long fanned tail, and it perches with wings spread to dry', 'dcc-wildlife' ),
				'sound' => __( 'A loud clicking near the nest that the Cornell Lab likens to a treadle sewing machine, or a croaking frog with a sore throat.', 'dcc-wildlife' ),
			],
			'heron'      => [
				'emoji' => '🐦',
				'name'  => __( 'Great Blue Heron', 'dcc-wildlife' ),
				'sci'   => 'Ardea herodias',
				'group' => 'birds',
				'odds'  => 'certain',
				'fact'  => __( 'A special hinge in the sixth neck bone lets the great blue coil and fire its bill forward like a loosed spring. With rod-rich eyes, it can hunt by day or night.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'standing statue-still in the shallows along the bank', 'dcc-wildlife' ),
				'idgroup' => 'dark',
				'mark' => __( 'the biggest of them — grey-blue, a heavy yellowish bill, and a black plume over the eye', 'dcc-wildlife' ),
				'sound' => __( 'A hoarse, prehistoric “frawnk” of complaint as it lifts off the bank — it can run on for the better part of twenty seconds.', 'dcc-wildlife' ),
			],
			'egret'      => [
				'emoji' => '🐦',
				'name'  => __( 'Snowy Egret', 'dcc-wildlife' ),
				'sci'   => 'Egretta thula',
				'group' => 'birds',
				'odds'  => 'certain',
				'fact'  => __( 'It shuffles its golden-yellow feet to spook prey from the mud. Its lacy plumes were nearly hunted out for ladies’ hats a century ago — the fight to stop that helped launch the Audubon movement.', 'dcc-wildlife' ),
				'best'  => __( 'early mornings', 'dcc-wildlife' ),
				'where' => __( 'wading the muddy edges where the bank meets the water', 'dcc-wildlife' ),
				'idgroup' => 'white',
				'mark' => __( 'a slim black bill and black legs — but bright golden-yellow feet', 'dcc-wildlife' ),
			],
			'kingfisher' => [
				'emoji' => '🐦',
				'name'  => __( 'Belted Kingfisher', 'dcc-wildlife' ),
				'sci'   => 'Megaceryle alcyon',
				'group' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'It hovers on beating wings, then dives headfirst after small fish. The female is the brighter of the pair — an extra rusty band across the belly — which is unusual among our birds. Mostly a winter visitor here.', 'dcc-wildlife' ),
				'best'  => __( 'all day', 'dcc-wildlife' ),
				'where' => __( 'low perches and wires over the water — listen for the dry rattle', 'dcc-wildlife' ),
				'sound' => __( 'A hard, dry, mechanical rattle thrown back over its shoulder as it flies off ahead of you; it answers the slightest disturbance.', 'dcc-wildlife' ),
			],
			'limpkin'    => [
				'emoji' => '🐦',
				'name'  => __( 'Limpkin', 'dcc-wildlife' ),
				'sci'   => 'Aramus guarauna',
				'group' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'An apple-snail specialist, and superbly built for it: the closed bill has a gap near the tip that works like tweezers, and the tip curves slightly to the right to follow the shell’s own spiral. Look for its piles of empty shells along the bank. Florida’s limpkins have boomed since the 2000s.', 'dcc-wildlife' ),
				'best'  => __( 'dawn, dusk & after dark', 'dcc-wildlife' ),
				'where' => __( 'stalking the reedy shallows — you’ll often hear it long before you see it', 'dcc-wildlife' ),
				'sound' => __( 'A long, grating, high-pitched scream, mostly after dark, made with a looped windpipe. Cornell supplied one to Hollywood — it is the voice of the hippogriff in Harry Potter and the Prisoner of Azkaban.', 'dcc-wildlife' ),
			],
			'ibis'       => [
				'emoji' => '🐦',
				'name'  => __( 'White Ibis', 'dcc-wildlife' ),
				'sci'   => 'Eudocimus albus',
				'group' => 'birds',
				'odds'  => 'certain',
				'fact'  => __( 'Flocks probe the mud by feel, snapping that curved red bill shut on crayfish they never see. All white, with jet-black wingtips that only flash when they take to the air.', 'dcc-wildlife' ),
				'best'  => __( 'all day', 'dcc-wildlife' ),
				'where' => __( 'flocks working the shallows and the shoreline grass', 'dcc-wildlife' ),
				'sound' => __( 'An unmusical, harsh, nasal honk, usually from a flock passing overhead.', 'dcc-wildlife' ),
				'idgroup' => 'white',
				'mark' => __( 'a long, down-curved red bill and red legs; black wingtips flash in flight', 'dcc-wildlife' ),
			],
			'woodstork'  => [
				'emoji' => '🐦',
				'name'  => __( 'Wood Stork', 'dcc-wildlife' ),
				'sci'   => 'Mycteria americana',
				'group' => 'birds',
				'odds'  => 'likely',
				'flags' => [ 'protected' ],
				'safe'  => __( 'Federally threatened: give feeding birds their space and let them work the shallows.', 'dcc-wildlife' ),
				'fact'  => __( 'Florida’s only native stork feeds entirely by touch — it wades with its bill open underwater and snaps shut the instant a fish brushes it. Once federally endangered, it recovered so well it left the Endangered list in 2026.', 'dcc-wildlife' ),
				'best'  => __( 'dry-season shallows', 'dcc-wildlife' ),
				'where' => __( 'wading shrinking pools where falling water traps the fish', 'dcc-wildlife' ),
				'idgroup' => 'white',
				'mark' => __( 'much bigger and heavier, with a bald dark scaly head and a thick drooping bill', 'dcc-wildlife' ),
				'sound' => __( 'Almost nothing. Adults are voiceless — capable only of a hiss — and “talk” by clattering those big bills like castanets. Only the nestlings make a racket.', 'dcc-wildlife' ),
			],
			'littleblue' => [
				'emoji' => '🐦',
				'name'  => __( 'Little Blue Heron', 'dcc-wildlife' ),
				'sci'   => 'Egretta caerulea',
				'group' => 'birds',
				'odds'  => 'certain',
				'fact'  => __( 'The only heron that changes color with age — snow-white as a youngster, deep slate-blue as an adult, and a patchy “calico” in between. The white youngsters even hunt alongside snowy egrets.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'quiet, vegetated edges, hunting slow and deliberate', 'dcc-wildlife' ),
				'idgroup' => 'white',
				'mark' => __( 'young birds are white with greenish-yellow legs and a pale blue-grey bill tipped black; adults are slate-blue', 'dcc-wildlife' ),
			],
			'tricolored' => [
				'emoji' => '🐦',
				'name'  => __( 'Tricolored Heron', 'dcc-wildlife' ),
				'sci'   => 'Egretta tricolor',
				'group' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'A restless, acrobatic hunter — it dashes, pirouettes, and even stirs the bottom with a foot to flush minnows, which make up almost its entire diet.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'dancing through the shallow edges after small fish', 'dcc-wildlife' ),
				'sound' => __( 'Usually quiet; a short guttural bark when something flushes it off the bank.', 'dcc-wildlife' ),
				'idgroup' => 'dark',
				'mark' => __( 'the only dark heron here with a clean white belly, and a white stripe down the neck', 'dcc-wildlife' ),
			],
			'greenheron' => [
				'emoji' => '🐦',
				'name'  => __( 'Green Heron', 'dcc-wildlife' ),
				'sci'   => 'Butorides virescens',
				'group' => 'birds',
				'odds'  => 'likely',
				'fact'  => __( 'One of the very few tool-using birds on Earth: it drops a twig, feather, or insect onto the water as bait, then snatches the curious fish that rises to it.', 'dcc-wildlife' ),
				'best'  => __( 'dawn & dusk', 'dcc-wildlife' ),
				'where' => __( 'crouched low on a branch or root over shady water', 'dcc-wildlife' ),
				'sound' => __( 'A single explosive “skeow” as it bursts off the bank — unmistakable once you have heard it.', 'dcc-wildlife' ),
				'idgroup' => 'dark',
				'mark' => __( 'small and crouched, with a dark green back and a rich chestnut neck', 'dcc-wildlife' ),
			],

			// ---- PLANTS ------------------------------------------------
			'cypress'    => [
				'emoji' => '🌲',
				'name'  => __( 'Bald Cypress', 'dcc-wildlife' ),
				'sci'   => 'Taxodium distichum',
				'group' => 'plants',
				'odds'  => 'certain',
				'fact'  => __( 'The cathedral tree of the canal, spared by the loggers of the 1800s. It can live past 2,000 years — and the purpose of its woody “knees” still genuinely puzzles botanists after two centuries of study.', 'dcc-wildlife' ),
				'best'  => __( 'golden hour', 'dcc-wildlife' ),
				'where' => __( 'lining both banks — the knees poke up along the waterline', 'dcc-wildlife' ),
			],
			'moss'       => [
				'emoji' => '🌿',
				'name'  => __( 'Spanish Moss', 'dcc-wildlife' ),
				'sci'   => 'Tillandsia usneoides',
				'group' => 'plants',
				'odds'  => 'certain',
				'fact'  => __( 'Not a moss at all but an air plant in the pineapple family — and no parasite. It takes nothing from its tree, drinking rain, fog, and dust through tiny silvery scales along each strand.', 'dcc-wildlife' ),
				'best'  => __( 'any time', 'dcc-wildlife' ),
				'where' => __( 'draped from the cypress and oak canopy overhead', 'dcc-wildlife' ),
			],
			'fern'       => [
				'emoji' => '🌱',
				'name'  => __( 'Resurrection Fern', 'dcc-wildlife' ),
				'sci'   => 'Pleopeltis michauxiana',
				'group' => 'plants',
				'odds'  => 'certain',
				'fact'  => __( 'In a dry spell it curls up gray and “dead,” shedding up to 97% of its water — then greens fully back to life within about a day of rain. It only rides on the tree’s bark; it takes nothing from it.', 'dcc-wildlife' ),
				'best'  => __( 'right after rain', 'dcc-wildlife' ),
				'where' => __( 'carpeting the tops of the big oak and cypress limbs', 'dcc-wildlife' ),
			],
			'lily'       => [
				'emoji' => '🌸',
				'name'  => __( 'White Waterlily', 'dcc-wildlife' ),
				'sci'   => 'Nymphaea odorata',
				'group' => 'plants',
				'odds'  => 'certain',
				'fact'  => __( 'Its fragrant white blooms open each morning and close by afternoon. The floating pads shade and shelter the fish below and give frogs and dragonflies a place to rest — prime habitat in the canal.', 'dcc-wildlife' ),
				'best'  => __( 'mornings', 'dcc-wildlife' ),
				'where' => __( 'quiet coves and canal edges', 'dcc-wildlife' ),
			],
			'palmetto'   => [
				'emoji' => '🌴',
				'name'  => __( 'Saw Palmetto', 'dcc-wildlife' ),
				'sci'   => 'Serenoa repens',
				'group' => 'plants',
				'odds'  => 'certain',
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
			'alligator'  => [ 1, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 1 ], // Most conspicuous Apr–Sep; spring courtship & bellowing.
			'manatee'    => [ 0, 0, 0, 1, 1, 1, 3, 3, 1, 1, 0, 0 ], // RARE, and warm-months-only — never a winter regular here.
			'otter'      => [ 3, 3, 3, 3, 1, 1, 1, 1, 1, 3, 3, 3 ], // Year-round; dawn & dusk.
			'turtle'     => [ 1, 1, 2, 3, 3, 3, 3, 3, 2, 2, 1, 1 ], // Baskers most visible spring–summer.
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
		'alligator' => 1100, 'anhinga' => 1100, 'cypress' => 950, 'eagle' => 1100,
		'egret' => 950, 'fish' => 1100, 'greenheron' => 1100, 'heron' => 1100,
		'kingfisher' => 1100, 'lily' => 733, 'limpkin' => 1100, 'manatee' => 1100,
		'moss' => 950, 'osprey' => 1100, 'otter' => 733, 'palmetto' => 950, 'turtle' => 950,
	];

	public static function photo_width( string $id ): int {
		return self::PHOTO_W[ $id ] ?? 0;
	}

	/**
	 * Photo credits, species id => [ photographer/holder, licence, source URL ]
	 * (1.19.0). Every image that is not public domain is listed here and
	 * rendered in the "Photo credits" <details> at the foot of the guide.
	 * Public-domain US-government images need no line and carry none.
	 *
	 * @return array<string,array{0:string,1:string,2:string}>
	 */
	public static function photo_credits(): array {
		$credits = [];
		foreach ( array_keys( self::photos() ) as $id ) {
			$credits[ $id ] = [ 'Adobe Stock', __( 'Adobe Stock standard licence', 'dcc-wildlife' ), '' ];
		}
		return (array) apply_filters( 'dcc_wl_photo_credits', $credits );
	}

	/** The 4:3 tile thumbnail beside each photo: <id>-320.jpg (1.19.0). */
	public static function photo_thumb( string $photo ): string {
		return '' === $photo ? '' : (string) preg_replace( '/\.jpg$/', '-320.jpg', $photo );
	}

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
	 * Verified encyclopedia entities, species id => [ Wikipedia URL, Wikidata Q-id ].
	 *
	 * Used ONLY for the JSON-LD `sameAs` on the field guide (1.16.0) — this is
	 * how a machine learns that our "Limpkin" is the same thing the rest of the
	 * web calls Aramus guarauna. Deliberately NOT part of dataset(): it never
	 * reaches the browser, so it costs the client payload nothing.
	 *
	 * Every row was resolved by querying the MediaWiki API with the scientific
	 * name from registry() above, following redirects, and confirming the
	 * resulting article really is that taxon (2026-09-02). Two judgement calls,
	 * both deliberate:
	 *
	 * - 'manatee' — our subspecies (T. m. latirostris) has no standalone
	 *   article; "Florida manatee" redirects to the species. The species
	 *   article is therefore the correct entity, not a loose match.
	 * - 'turtle' — absent ON PURPOSE. That entry covers Pseudemys spp. AND
	 *   Apalone ferox; no single entity is true, so it gets none. Same rule as
	 *   the water module's Fact gate: no verified source, no claim.
	 *
	 * @return array<string,array{0:string,1:string}>
	 */
	public static function entities(): array {
		$entities = [
			'alligator' => [ 'https://en.wikipedia.org/wiki/American_alligator', 'Q193327' ],
			'manatee'   => [ 'https://en.wikipedia.org/wiki/West_Indian_manatee', 'Q40261' ],
			'otter'     => [ 'https://en.wikipedia.org/wiki/North_American_river_otter', 'Q327028' ],
			// 1.19.0: the same verified row the old generic 'snake' entry carried
			// (that entry WAS N. fasciata pictiventris). The eleven other batch-1
			// species have NO row yet: their Q-ids are drafted in
			// tools/entities-batch1.csv for verification from a machine with
			// network, and land here only as CONFIRMED. A wrong Q-id is worse
			// than none.
			'bandedwater' => [ 'https://en.wikipedia.org/wiki/Florida_banded_water_snake', 'Q6996593' ],
			'fish'      => [ 'https://en.wikipedia.org/wiki/Largemouth_bass', 'Q755105' ],
			'applesnail' => [ 'https://en.wikipedia.org/wiki/Pomacea_paludosa', 'Q3142468' ],
			'eagle'     => [ 'https://en.wikipedia.org/wiki/Bald_eagle', 'Q127216' ],
			'osprey'    => [ 'https://en.wikipedia.org/wiki/Osprey', 'Q25332' ],
			'anhinga'   => [ 'https://en.wikipedia.org/wiki/Anhinga', 'Q469940' ],
			'heron'     => [ 'https://en.wikipedia.org/wiki/Great_blue_heron', 'Q333796' ],
			'egret'     => [ 'https://en.wikipedia.org/wiki/Snowy_egret', 'Q59785' ],
			'kingfisher' => [ 'https://en.wikipedia.org/wiki/Belted_kingfisher', 'Q736052' ],
			'limpkin'   => [ 'https://en.wikipedia.org/wiki/Limpkin', 'Q725276' ],
			'ibis'      => [ 'https://en.wikipedia.org/wiki/American_white_ibis', 'Q589171' ],
			'woodstork' => [ 'https://en.wikipedia.org/wiki/Wood_stork', 'Q990175' ],
			'littleblue' => [ 'https://en.wikipedia.org/wiki/Little_blue_heron', 'Q371028' ],
			'tricolored' => [ 'https://en.wikipedia.org/wiki/Tricolored_heron', 'Q392139' ],
			'greenheron' => [ 'https://en.wikipedia.org/wiki/Green_heron', 'Q498228' ],
			'cypress'   => [ 'https://en.wikipedia.org/wiki/Taxodium_distichum', 'Q148950' ],
			'moss'      => [ 'https://en.wikipedia.org/wiki/Spanish_moss', 'Q311524' ],
			'fern'      => [ 'https://en.wikipedia.org/wiki/Pleopeltis_michauxiana', 'Q56761285' ],
			'lily'      => [ 'https://en.wikipedia.org/wiki/Nymphaea_odorata', 'Q635853' ],
			'palmetto'  => [ 'https://en.wikipedia.org/wiki/Serenoa', 'Q927607' ],
		];

		/**
		 * Filter the verified entity map (species id => [ Wikipedia URL, Wikidata id ]).
		 *
		 * A species added via dcc_wl_species with no row here simply gets no
		 * sameAs — an unverified guess is worse than silence.
		 *
		 * @param array<string,array{0:string,1:string}> $entities
		 */
		return (array) apply_filters( 'dcc_wl_entities', $entities );
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
				// Optional: only species with a verified, distinctive sound
				// carry one. Absent is normal and renders nothing.
				'sound'     => (string) ( $sp['sound'] ?? '' ),
				// Look-alike grouping: which confusable set this species belongs
				// to, and the field mark that settles it. Both optional.
				'idgroup'   => (string) ( $sp['idgroup'] ?? '' ),
				'mark'      => (string) ( $sp['mark'] ?? '' ),
				'photo'     => (string) ( $photos[ $id ] ?? '' ),
				'photoW'    => self::photo_width( $id ),
				'thumb'     => self::photo_thumb( (string) ( $photos[ $id ] ?? '' ) ),
				'group'     => (string) ( $sp['group'] ?? 'critters' ),
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
