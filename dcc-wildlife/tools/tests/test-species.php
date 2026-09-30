<?php
/**
 * Registry integrity.
 *
 * The registry is hand-curated data, and a typo in it is invisible until a
 * guest reads it. These assertions are the fact gate in executable form:
 * every species has the fields the renderers dereference, every slug is
 * usable in a URL and a CSS class, and the photo coverage claim is checked
 * against the files on disk rather than taken on trust.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
$root = dcc_boot_plugin();

use DCC_WL\Species;

$reg = Species::registry();

dcc_section( 'shape' );

/*
 * COUNTS ARE DERIVED, NOT TYPED (1.33.0).
 *
 * Through 1.32.x this suite said 51, 38, 9, 5, 52. Every one of those broke
 * the moment a batch landed, and a suite that goes red on purpose every time
 * work happens stops being read. What actually needs pinning is not the size
 * of the registry but that the parts agree with the whole: sections between
 * them reach everyone, sub-groups between them reach every animal, photos()
 * names a file for each, the alligator is the one double membership.
 *
 * One number is still typed, on purpose: the SPECIES TOTAL, so that a batch
 * landing is a deliberate one-line edit here rather than a silent drift. Any
 * other count is computed from the registry.
 */
const TOTAL = 402;  // 51 at the start of 1.33.0, then batches 6-23. One species (the muskrat) has no photo, by the owner.

check_same( TOTAL, count( $reg ), 'the registry holds the number of species this release claims' );

$groups = [];
foreach ( $reg as $id => $sp ) {
	$groups[ $sp['group'] ] = ( $groups[ $sp['group'] ] ?? 0 ) + 1;
}
ksort( $groups );
check_same(
	[ 'birds', 'critters', 'plants', 'safety' ],
	array_keys( $groups ),
	'four data groups, and no fifth has crept in'
);
check_same( count( $reg ), array_sum( $groups ), 'and between them they hold every species' );

$declared = array_keys( Species::groups() );
$used     = array_keys( $groups );
sort( $declared );
sort( $used );
check_same( $declared, $used, 'every group used by a species is a declared group' );

dcc_section( 'every row is complete' );

// Measured, not assumed. flags/safe/mark/sound/idgroup are OPTIONAL — only
// a species that has them carries them — so a renderer must never
// dereference those without a guard. These eight are on every row.
$required = [ 'emoji', 'name', 'sci', 'group', 'odds', 'fact', 'best', 'where' ];
$optional = [ 'flags', 'safe', 'mark', 'sound', 'idgroup' ];
$missing  = [];
$badslug  = [];
$empty    = [];
foreach ( $reg as $id => $sp ) {
	foreach ( $required as $k ) {
		if ( ! array_key_exists( $k, $sp ) ) { $missing[] = "$id.$k"; }
	}
	if ( 1 !== preg_match( '/^[a-z][a-z0-9]*$/', (string) $id ) ) { $badslug[] = $id; }
	foreach ( [ 'name', 'fact' ] as $k ) {
		if ( '' === trim( (string) ( $sp[ $k ] ?? '' ) ) ) { $empty[] = "$id.$k"; }
	}
}
check_same( [], $missing, 'no row is missing a required field', implode( ', ', $missing ) );
check_same( [], $badslug, 'every slug is lowercase alphanumeric, safe in a URL and a class', implode( ', ', $badslug ) );
check_same( [], $empty, 'no row has an empty name or fact', implode( ', ', $empty ) );

dcc_section( 'odds and months' );

$odds_ok  = array_keys( Species::odds() );
$bad_odds = [];
$bad_mon  = [];
foreach ( $reg as $id => $sp ) {
	if ( ! in_array( (string) $sp['odds'], $odds_ok, true ) ) { $bad_odds[] = "$id={$sp['odds']}"; }
	// `best` on a registry row is PROSE ("warm afternoons, and warm nights
	// after rain"). The twelve month scores are derived and appear as
	// `months` on a dataset row, which is what the client filters on.
	if ( '' === trim( (string) $sp['best'] ) ) { $bad_mon[] = "$id has an empty best-time phrase"; }
}

$bad_scores = [];
foreach ( Species::dataset() as $row ) {
	$id     = (string) ( $row['id'] ?? '?' );
	$months = $row['months'] ?? null;
	if ( ! is_array( $months ) || 12 !== count( $months ) ) {
		$bad_scores[] = "$id has " . ( is_array( $months ) ? count( $months ) . ' months' : gettype( $months ) );
		continue;
	}
	foreach ( $months as $score ) {
		if ( ! is_int( $score ) || $score < 0 || $score > 3 ) { $bad_scores[] = "$id score " . var_export( $score, true ); }
	}
}
check_same( [], $bad_odds, 'every odds value is one of the declared bands', implode( ', ', $bad_odds ) );
check_same( [], $bad_mon, 'every species has a best-time phrase', implode( ', ', array_slice( $bad_mon, 0, 5 ) ) );
check_same( [], $bad_scores, 'every dataset row scores all twelve months in the range 0-3', implode( ', ', array_slice( $bad_scores, 0, 5 ) ) );

// The peak and spotlight thresholds only mean something if some species
// actually reach them in some month; otherwise Peak Now is permanently empty.
$peaks = 0;
foreach ( Species::dataset() as $row ) {
	if ( in_array( Species::LIKELY_PEAK, (array) ( $row['months'] ?? [] ), true ) ) { ++$peaks; }
}
check( $peaks > 0, 'at least one species reaches the peak score, so Peak Now is reachable', "species at peak in some month: $peaks" );

// THE CALENDAR AND THE REGISTRY MUST NAME THE SAME SPECIES.
//
// Added in batch 12 because it caught a real defect that every other suite
// waved through: a generator wrote the calendar keys with the id padded INSIDE
// the quotes ( 'goldfinch    ' ), so 59 of 216 species had no calendar row at
// all. Nothing above notices, because `dataset()` substitutes twelve zeros for
// a missing row — twelve valid scores, in range, the right length. The species
// simply never reaches Peak Now, never enters the spotlight, and renders a
// blank "Through the year" strip. On a phone that reads as a quiet month, not
// as a bug, which is exactly why it needs a test rather than an eye.
$cal     = Species::calendar();
$no_row  = array_diff( array_keys( $reg ), array_keys( $cal ) );
$orphan  = array_diff( array_keys( $cal ), array_keys( $reg ) );
check_same( [], array_values( $no_row ), 'every species in the registry has a calendar row of its own', implode( ', ', array_slice( array_values( $no_row ), 0, 6 ) ) );
check_same( [], array_values( $orphan ), 'and the calendar carries no row for a species that does not exist', implode( ', ', array_slice( array_values( $orphan ), 0, 6 ) ) );

// EVERY SPECIES REACHES 3 IN SOME MONTH. This is the 1.17.0 data doctrine --
// a species' best window IS its peak -- and it was documented as enforced here
// when in fact only the global "somebody peaks" check above existed. A species
// that tops out at 2 has a `bestLabel` naming months the UI never features.
$never_peak = [];
foreach ( Species::dataset() as $row ) {
	if ( ! in_array( Species::LIKELY_PEAK, (array) ( $row['months'] ?? [] ), true ) ) {
		$never_peak[] = (string) $row['id'];
	}
}
check_same( [], $never_peak, 'and every single species reaches its peak score in some month', implode( ', ', array_slice( $never_peak, 0, 6 ) ) );

dcc_section( 'flags' );

$flags_ok = array_keys( Species::flags() );
$bad      = [];
foreach ( $reg as $id => $sp ) {
	foreach ( (array) $sp['flags'] as $f ) {
		if ( ! in_array( (string) $f, $flags_ok, true ) ) { $bad[] = "$id=$f"; }
	}
}
check_same( [], $bad, 'every flag on every species is a declared flag', implode( ', ', $bad ) );

// An optional key that exists must still hold the right kind of value; the
// danger with an optional field is a typo'd name that silently never reads.
$wrong = [];
foreach ( $reg as $id => $sp ) {
	foreach ( $optional as $k ) {
		if ( ! array_key_exists( $k, $sp ) ) { continue; }
		$v = $sp[ $k ];
		$ok = 'flags' === $k ? is_array( $v ) : is_string( $v );
		if ( ! $ok || ( is_string( $v ) && '' === trim( $v ) ) ) { $wrong[] = "$id.$k"; }
	}
}
check_same( [], $wrong, 'an optional field, where present, is never empty or the wrong type', implode( ', ', $wrong ) );
check( count( array_filter( $reg, static fn( $sp ): bool => isset( $sp['flags'] ) ) ) > 0, 'some species do carry flags, so the flag path is exercised' );

dcc_section( 'photo coverage is checked against the files, not asserted' );

$photos = Species::photos();

/*
 * THE PHOTO PROGRAMME IS COMPLETE BAR ONE, AND THE ONE IS A DECISION.
 *
 * Through 1.33.0 this read `count( $reg ) === count( $photos )` -- every
 * species has a photograph. Batch 14 ended that on purpose: the owner decided
 * the ROUND-TAILED MUSKRAT ships with no photograph, because the only openly
 * licensed image of a live one is an unidentifiable dark shape, and a wrong or
 * useless picture is worse than the group glyph the art rule falls back to.
 *
 * So the exception is PINNED BY NAME rather than the rule relaxed. A second
 * species quietly losing its photograph still fails here, which is the whole
 * point -- "no species ships without a photo unless the owner decided that
 * species himself" is the standing rule, and this is the list of his decisions.
 */
const PHOTOLESS = [ 'muskrat' ];
$missing = array_values( array_diff( array_keys( $reg ), array_keys( $photos ) ) );
$extra   = array_values( array_diff( array_keys( $photos ), array_keys( $reg ) ) );
check_same( PHOTOLESS, $missing, 'exactly the species the owner decided may ship without a photograph', implode( ', ', $missing ) );
check_same( [], $extra, 'and photos() names no file for a species that does not exist', implode( ', ', $extra ) );
check_same( count( $reg ) - count( PHOTOLESS ), count( $photos ), 'every other species has one' );

$on_disk = glob( $root . '/assets/photos/*.jpg' );
$base    = array_values( array_filter( $on_disk, static fn( $p ): bool => 1 !== preg_match( '/-(320|600)\.jpg$/', $p ) ) );

/*
 * THE INVARIANT IS "NO BROKEN SET", NOT "NO SPARE PHOTOGRAPH" (1.33.0).
 *
 * This used to assert that the directory held EXACTLY one base photo per
 * registered species, and it went red the moment photo batch 6 landed —
 * twelve turtles whose entries had not been written yet. A pack arriving
 * before its entries is the normal middle of a multi-batch expansion, not a
 * defect, and a suite that fails on it just trains people to ignore it.
 *
 * What IS a defect is a HALF-COPIED pack: a base photo whose -600 or -320
 * never arrived. That shows up as an empty well or a 404 on a retina screen
 * and nowhere else, so it is the thing worth asserting. The pair of checks
 * below cover both directions — every species has its files (further down),
 * and every file on disk is a complete set.
 */
$incomplete = [];
foreach ( $base as $p ) {
	$stem = preg_replace( '/\.jpg$/', '', $p );
	foreach ( [ '-600.jpg', '-320.jpg' ] as $suffix ) {
		if ( ! is_file( $stem . $suffix ) ) {
			$incomplete[] = basename( $stem ) . $suffix;
		}
	}
}
check_same( [], $incomplete, 'every base photograph has all three renditions', implode( ', ', $incomplete ) );

$named   = array_map( static fn( string $f ): string => basename( $f, '.jpg' ), array_values( $photos ) );
$pending = array_values( array_diff( array_map( static fn( $p ): string => basename( $p, '.jpg' ), $base ), $named ) );
sort( $pending );
echo '       base photographs on disk: ' . count( $base ) . ', wired to a species: ' . count( $photos ) . "\n";
if ( $pending ) {
	echo '       waiting for their entries (' . count( $pending ) . '): ' . implode( ', ', $pending ) . "\n";
}
check( count( $base ) >= count( $photos ), 'there is a photograph on disk for every species that claims one' );

$absent = [];
foreach ( $photos as $id => $file ) {
	if ( ! is_file( $root . '/assets/photos/' . $file ) ) { $absent[] = "$id -> $file"; }
}
check_same( [], $absent, 'every filename photos() returns exists on disk', implode( ', ', $absent ) );

$uncredited = [];
foreach ( array_keys( $photos ) as $id ) {
	if ( '' === trim( Species::photo_credit_line( $id ) ) ) { $uncredited[] = $id; }
}
check_same( [], $uncredited, 'every photographed species carries a credit line', implode( ', ', $uncredited ) );

$orphan = array_diff( array_keys( $photos ), array_keys( $reg ) );
check_same( [], array_values( $orphan ), 'no photo names a species the registry does not have', implode( ', ', $orphan ) );

dcc_section( 'sections are display navigation over the data groups' );

$sections = Species::sections();
check_same( [ 'animals', 'plants', 'safety' ], array_keys( $sections ), 'three display sections, safety its own destination' );

$ds     = Species::dataset();
$counts = [];
foreach ( array_keys( $sections ) as $s ) {
	$counts[ $s ] = count( Species::section_members( $ds, $s ) );
}
$by_group = [];
foreach ( $reg as $sp ) {
	$by_group[ (string) $sp['group'] ] = ( $by_group[ (string) $sp['group'] ] ?? 0 ) + 1;
}
check_same(
	( $by_group['critters'] ?? 0 ) + ( $by_group['birds'] ?? 0 ),
	$counts['animals'],
	'the animals section is exactly the critters plus the birds'
);
check_same( $by_group['plants'] ?? 0, $counts['plants'], 'the plants section is exactly the plants' );
/*
 * A species that is ALSO a hazard appears twice, by design. The alligator has
 * done so since 1.19.0; the cane toad joined it in 1.33.0, because a guest
 * wants to read about it and a dog owner has to be warned about it. So the
 * count is derived from the flags rather than from a hard-coded "+1".
 *
 * WIDENED in batches 20-23: this used to ask for a species in `critters` or
 * `birds` flagged `danger` -- i.e. it assumed a hazard was always an ANIMAL.
 * Sawgrass and the prickly pear are the first PLANTS to be flagged, and they
 * are dual members for exactly the same reason: a guest wants to identify the
 * plant and also needs warning about it. The right question is the one
 * Species::is_hazard() actually asks -- flagged `danger` while living
 * somewhere other than the safety group -- so it is asked that way now,
 * and it no longer cares what kingdom the species belongs to.
 */
$double = [];
foreach ( $reg as $id => $sp ) {
	$elsewhere = 'safety' !== (string) $sp['group'];
	if ( $elsewhere && in_array( 'danger', (array) ( $sp['flags'] ?? [] ), true ) ) {
		$double[] = $id;
	}
}
sort( $double );
check_same(
	( $by_group['safety'] ?? 0 ) + count( $double ),
	$counts['safety'],
	'the safety section is the hazards plus every species flagged dangerous'
);
check_same( count( $reg ) + count( $double ), array_sum( $counts ), 'one extra membership for each of those' );

// The alligator is deliberately in two sections: it is an animal you want to
// read about and a hazard you must be warned about. That double membership is
// the reason the prose guide takes an exclude flag at all.
$seen = [];
foreach ( array_keys( $sections ) as $s ) {
	foreach ( Species::section_members( $ds, $s ) as $m ) {
		$seen[ is_array( $m ) ? (string) ( $m['id'] ?? '' ) : (string) $m ][] = $s;
	}
}
check_same( count( $reg ), count( $seen ), 'the sections between them reach every species' );
$twice = array_keys( array_filter( $seen, static fn( array $ss ): bool => count( $ss ) > 1 ) );
sort( $twice );
check_same( $double, $twice, 'the species in two sections are exactly the flagged hazards', implode( ', ', $twice ) );
check( in_array( 'alligator', $twice, true ), 'and the alligator is still one of them' );

// The prose guide passes false so the alligator is not described twice. It is
// SAFETY that drops it, not animals — the animal entry is the one to keep.
check_same( $counts['animals'], count( Species::section_members( $ds, 'animals', false ) ), 'excluding flagged members leaves animals untouched' );
check_same( $counts['safety'] - count( $double ), count( Species::section_members( $ds, 'safety', false ) ), 'excluding flagged members drops them from safety, not from animals' );

dcc_section( 'browse sub-groups for the Animals section' );

$browse = Species::browse_groups();
check_same(
	[ 'reptiles', 'birds', 'mammals', 'fish', 'insects', 'trees', 'wildflowers', 'waterplants' ],
	array_keys( $browse ),
	'the owner\'s option C for Animals, then the Plants row, in chip order'
);

/*
 * A LABEL IS A CLAIM — the rule survives the rename (1.33.0).
 *
 * The owner chose "Reptiles & amphibians". The guide's older rule is that a
 * chip may not offer what the registry does not hold. Both hold at once
 * because the label is DERIVED: has_amphibian() decides it. So this suite does
 * not assert one string or the other — it asserts that the label and the
 * contents agree, which is the thing that actually matters and which stays
 * true through the amphibian batch landing.
 */
$has_amph = Species::has_amphibian();
check_same(
	$has_amph,
	false !== strpos( $browse['reptiles'], 'amphibian' ),
	'the reptiles chip mentions amphibians exactly when there are some'
);
check_lacks( implode( ' | ', $browse ), 'Wading birds', 'the retired bird chips are gone' );
check_lacks( implode( ' | ', $browse ), 'Raptors', 'including "Raptors & others"' );
check_lacks( implode( ' | ', $browse ), 'snails', 'and "Fish & snails" — snails moved to the small things' );

$animals = Species::section_members( $ds, 'animals' );
$sizes   = [];
foreach ( array_keys( $browse ) as $slug ) {
	$sizes[ $slug ] = count( Species::browse_members( $animals, $slug ) );
}
check_same(
	[ 'trees' => 0, 'wildflowers' => 0, 'waterplants' => 0 ],
	array_intersect_key( $sizes, array_flip( [ 'trees', 'wildflowers', 'waterplants' ] ) ),
	'no animal carries a plant chip'
);
check_same( $counts['animals'], array_sum( $sizes ), 'the Animals chips between them account for every animal' );
check( min( array_intersect_key( $sizes, array_flip( [ 'reptiles', 'birds', 'mammals', 'fish', 'insects' ] ) ) ) > 0,
	'and none of the five Animals chips is empty', wp_json_encode( $sizes ) );

/*
 * Every species in a chipped section carries a slug FROM THAT SECTION'S ROW,
 * and nothing else carries one at all.
 *
 * Plants gained a chip row in 1.33.0, so "nothing outside Animals may carry a
 * slug" is no longer the rule — but a plant carrying an ANIMAL slug (or the
 * reverse) would put a chip in the wrong row and silently hide a species from
 * its own section, so the pairing is what gets pinned now. The safety list is
 * still its own destination and takes no chips.
 */
$ANIMAL_SLUGS = [ 'reptiles', 'birds', 'mammals', 'fish', 'insects' ];
$PLANT_SLUGS  = [ 'trees', 'wildflowers', 'waterplants' ];

$stray = [];
foreach ( $reg as $id => $sp ) {
	$b = (string) ( $sp['browse'] ?? '' );
	$g = (string) $sp['group'];
	$in_animals = in_array( $g, [ 'critters', 'birds' ], true );
	$in_plants  = 'plants' === $g;

	if ( '' !== $b && ! isset( $browse[ $b ] ) ) { $stray[] = "$id -> unknown $b"; continue; }
	if ( $in_animals ) {
		if ( '' === $b ) { $stray[] = "$id (animal, missing)"; }
		elseif ( ! in_array( $b, $ANIMAL_SLUGS, true ) ) { $stray[] = "$id (animal with plant slug $b)"; }
	} elseif ( $in_plants ) {
		if ( '' === $b ) { $stray[] = "$id (plant, missing)"; }
		elseif ( ! in_array( $b, $PLANT_SLUGS, true ) ) { $stray[] = "$id (plant with animal slug $b)"; }
	} elseif ( '' !== $b ) {
		$stray[] = "$id (safety, should carry no chip)";
	}
}
check_same( [], $stray, 'no species carries a sub-group it should not, or lacks one it should', implode( ', ', $stray ) );

dcc_section( 'the deck order makes each sub-group contiguous' );

// A chip that claims to jump to "Reptiles" has to land on a RUN of reptiles,
// and "Reptiles · 1/1" has to be true. Registry order interleaves them, so the
// deck is ordered separately — and stably, or the confusable birds drift apart.
$ordered = Species::browse_order( $animals );
check_same( count( $animals ), count( $ordered ), 'ordering loses nobody' );

$runs = [];
foreach ( $ordered as $sp ) {
	$b = (string) $sp['browse'];
	if ( ! $runs || end( $runs )[0] !== $b ) {
		$runs[] = [ $b, 1 ];
	} else {
		$runs[ count( $runs ) - 1 ][1] += 1;
	}
}
$run_slugs = array_column( $runs, 0 );
check_same( count( $run_slugs ), count( array_unique( $run_slugs ) ), 'each sub-group appears as ONE contiguous run', implode( ' ', $run_slugs ) );
check_same( $ANIMAL_SLUGS, $run_slugs, 'and the runs come in the same order as the Animals chips' );

dcc_section( 'the Plants section has a chip row of its own (1.33.0)' );

$plants = Species::section_members( $ds, 'plants' );
$psizes = [];
foreach ( $PLANT_SLUGS as $slug ) {
	$psizes[ $slug ] = count( Species::browse_members( $plants, $slug ) );
}
check_same( count( $plants ), array_sum( $psizes ), 'every plant falls in exactly one of the three' );
check( $psizes['trees'] > 0 && $psizes['wildflowers'] > 0 && $psizes['waterplants'] > 0,
	'and none of the three chips is empty', wp_json_encode( $psizes ) );

$pordered = Species::browse_order( $plants );
$pruns    = [];
foreach ( $pordered as $sp ) {
	$b = (string) $sp['browse'];
	if ( ! $pruns || end( $pruns ) !== $b ) { $pruns[] = $b; }
}
check_same( count( $pruns ), count( array_unique( $pruns ) ), 'each plant chip is one contiguous run', implode( ' ', $pruns ) );
check_same( $PLANT_SLUGS, $pruns, 'in the order the chips show them' );

// Stability: within a run, registry order survives. The confusable white waders
// sitting together is the whole reason registry order is what it is.
$reg_pos = array_flip( array_keys( $reg ) );
$unstable = [];
foreach ( array_keys( $browse ) as $slug ) {
	$ids  = array_column( Species::browse_members( $ordered, $slug ), 'id' );
	$pos  = array_map( static fn( string $id ): int => $reg_pos[ $id ], $ids );
	$sorted = $pos;
	sort( $sorted );
	if ( $pos !== $sorted ) { $unstable[] = $slug; }
}
check_same( [], $unstable, 'order within every sub-group is still registry order', implode( ', ', $unstable ) );

dcc_done();
