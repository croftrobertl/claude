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

check_same( 51, count( $reg ), 'the registry holds 51 species' );

$groups = [];
foreach ( $reg as $id => $sp ) {
	$groups[ $sp['group'] ] = ( $groups[ $sp['group'] ] ?? 0 ) + 1;
}
ksort( $groups );
check_same(
	[ 'birds' => 29, 'critters' => 9, 'plants' => 5, 'safety' => 8 ],
	$groups,
	'the group split is 29 birds, 9 critters, 5 plants, 8 safety'
);

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
check_same( 51, count( $photos ), 'photos() names a file for all 51 species' );

$on_disk = glob( $root . '/assets/photos/*.jpg' );
$base    = array_values( array_filter( $on_disk, static fn( $p ): bool => 1 !== preg_match( '/-(320|600)\.jpg$/', $p ) ) );
check_same( 51, count( $base ), '51 base photographs are present in the provenance directory' );

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
check_same( 38, $counts['animals'], 'the animals section holds 38 species — critters plus birds' );
check_same( 5, $counts['plants'], 'the plants section holds 5' );
check_same( 9, $counts['safety'], 'the safety section holds 9 — the eight hazards plus the alligator' );
check_same( 52, array_sum( $counts ), 'the sections hold 52 memberships, one more than the species count' );

// The alligator is deliberately in two sections: it is an animal you want to
// read about and a hazard you must be warned about. That double membership is
// the reason the prose guide takes an exclude flag at all.
$seen = [];
foreach ( array_keys( $sections ) as $s ) {
	foreach ( Species::section_members( $ds, $s ) as $m ) {
		$seen[ is_array( $m ) ? (string) ( $m['id'] ?? '' ) : (string) $m ][] = $s;
	}
}
check_same( 51, count( $seen ), 'the sections between them reach all 51 species' );
$twice = array_keys( array_filter( $seen, static fn( array $ss ): bool => count( $ss ) > 1 ) );
check_same( [ 'alligator' ], $twice, 'exactly one species sits in two sections, and it is the alligator' );

// The prose guide passes false so the alligator is not described twice. It is
// SAFETY that drops it, not animals — the animal entry is the one to keep.
check_same( 38, count( Species::section_members( $ds, 'animals', false ) ), 'excluding flagged members leaves animals untouched' );
check_same( 8, count( Species::section_members( $ds, 'safety', false ) ), 'excluding flagged members drops the alligator from safety, leaving 8' );

dcc_section( 'browse sub-groups for the Animals section' );

$browse = Species::browse_groups();
check_same(
	[ 'reptiles', 'mammals', 'fishsnails', 'waders', 'waterfowl', 'raptors' ],
	array_keys( $browse ),
	'six sub-groups, in the order the chips show them'
);

// A label is a claim. The registry holds five reptiles and NO amphibians, and
// only three of the ten swimmers are ducks — so neither label may overstate.
check_same( 'Reptiles', $browse['reptiles'], 'the reptiles label does not promise amphibians there are none of' );
check_contains( $browse['waterfowl'], 'swimmers', 'the waterfowl label admits that most of them are not ducks' );

$animals = Species::section_members( $ds, 'animals' );
$sizes   = [];
foreach ( array_keys( $browse ) as $slug ) {
	$sizes[ $slug ] = count( Species::browse_members( $animals, $slug ) );
}
check_same(
	[ 'reptiles' => 5, 'mammals' => 2, 'fishsnails' => 2, 'waders' => 15, 'waterfowl' => 10, 'raptors' => 4 ],
	$sizes,
	'every animal falls in exactly one sub-group and the sizes add up'
);
check_same( 38, array_sum( $sizes ), 'the six sub-groups account for all 38 animals' );

// Nothing outside the Animals section may carry one: Plants and the safety list
// are short and are their own destinations.
$stray = [];
foreach ( $reg as $id => $sp ) {
	$b = (string) ( $sp['browse'] ?? '' );
	$in_animals = in_array( (string) $sp['group'], [ 'critters', 'birds' ], true );
	if ( '' !== $b && ! $in_animals ) { $stray[] = $id; }
	if ( '' === $b && $in_animals ) { $stray[] = "$id (missing)"; }
	if ( '' !== $b && ! isset( $browse[ $b ] ) ) { $stray[] = "$id -> unknown $b"; }
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
check_same( array_keys( $browse ), $run_slugs, 'and the runs come in the same order as the chips' );

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
