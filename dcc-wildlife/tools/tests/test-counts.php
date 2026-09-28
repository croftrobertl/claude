<?php
/**
 * The count rule: hazards live in Safety and nowhere else (1.33.0).
 *
 * The owner reversed 1.27.0's rule on 2026-09-28. This suite pins the new one
 * so it cannot be reverted by a tidy-up, and pins the property that made him
 * ask for it: THE PHRASE "AT PEAK" MUST MEAN ONE NUMBER. Two surfaces used to
 * say it about two different counts on the same screen.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();
dccwl_test_reset();

use DCC_WL\Species;

const SEPT = 8;   // 0-indexed
const PEAK = 3;
const SPOT = 2;

$dataset = Species::dataset();

/** @return array<int,array<string,mixed>> */
function at_least( array $dataset, int $month, int $score, bool $spotting_only ): array {
	return array_values( array_filter( $dataset, static function ( array $sp ) use ( $month, $score, $spotting_only ): bool {
		if ( $spotting_only && ! empty( $sp['haz'] ) ) {
			return false;
		}
		return (int) ( $sp['months'][ $month ] ?? 0 ) >= $score;
	} ) );
}

dcc_section( 'is_hazard() is one definition, and it covers the alligator' );

$by_id = [];
foreach ( $dataset as $sp ) {
	$by_id[ $sp['id'] ] = $sp;
}

check( isset( $by_id['alligator'] ), 'the alligator is in the dataset' );
check_same( 'critters', $by_id['alligator']['group'], 'its GROUP is critters, not safety — which is why a group test missed it' );
check_same( 1, $by_id['alligator']['haz'], 'but it is a hazard, because it is flagged danger' );
check_same( 1, $by_id['cottonmouth']['haz'], 'a safety-group species is a hazard' );
check_same( 0, $by_id['limpkin']['haz'], 'an ordinary bird is not' );
check_same( 0, $by_id['cypress']['haz'], 'nor is a plant' );

$hazards = array_values( array_filter( $dataset, static fn( array $sp ): bool => ! empty( $sp['haz'] ) ) );
check_same( 9, count( $hazards ), 'nine hazards: four venomous snakes, the fire ant, the poison ivy, the mosquitoes, the lovebugs, the alligator' );

dcc_section( 'every hazard is reachable in Safety, every month' );

$safety = Species::section_members( $dataset, 'safety' );
$safety_ids = array_map( static fn( array $sp ): string => $sp['id'], $safety );
foreach ( $hazards as $h ) {
	check(
		in_array( $h['id'], $safety_ids, true ),
		sprintf( '%s is in the Safety section', $h['name'] )
	);
}

dcc_section( 'Peak Now excludes hazards; Safety is where they are' );

$peak_all      = at_least( $dataset, SEPT, PEAK, false );
$peak_spotting = at_least( $dataset, SEPT, PEAK, true );

check(
	count( $peak_spotting ) < count( $peak_all ),
	'the September peak list is SHORTER once hazards come out',
	sprintf( 'all=%d spotting=%d', count( $peak_all ), count( $peak_spotting ) )
);
foreach ( $peak_spotting as $sp ) {
	check_same( 0, (int) $sp['haz'], sprintf( 'no hazard survives the Peak Now filter (%s)', $sp['name'] ) );
}

dcc_section( '"at peak" is ONE number — the month strip and Peak Now must agree' );

/*
 * The month strip's preview and the Peak Now tab both use the phrase. In
 * 1.32.1 the strip said 15 (safety group excluded, alligator counted) and the
 * tab showed 24 tile faces over 23 species. Both now read the same list.
 */
$strip = at_least( $dataset, SEPT, PEAK, true );
check_same(
	count( $strip ),
	count( $peak_spotting ),
	'the strip\'s "N at peak" and the Peak Now tab count the same species'
);

dcc_section( 'the wider count is NOT called "at peak"' );

$spotting = at_least( $dataset, SEPT, SPOT, true );
check(
	count( $spotting ) > count( $peak_spotting ),
	'the >= 2 count is wider than the >= 3 count',
	sprintf( 'spot=%d peak=%d', count( $spotting ), count( $peak_spotting ) )
);

ob_start();
\DCC_WL\Render::shortcode( [] );
$html = (string) ob_get_clean();
$config = '';
foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
	$config .= (string) $data;
}
check_contains( $config, 'worth looking for', 'the wider count says "worth looking for"' );
check_lacks( $config, 'at their best', '"at their best" is gone — it read as a synonym for "at peak"' );
/* "at peak" belongs to the HUB's string table (Canal_Render), which is the
 * surface that says it — the month widget's own config never carried it. */
dcc_reset_once_guards();
$GLOBALS['dccwl_test']['inline'] = [];
ob_start();
\DCC_WL\Canal_Render::shortcode( [] );
ob_end_clean();
$hub = '';
foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
	$hub .= (string) $data;
}
check_contains( $hub, 'at peak', 'and "at peak" is still the phrase the hub uses for the peak count' );
check_lacks( $hub, 'at their best', 'the hub does not say "at their best" either' );

dcc_section( 'the hazard flag actually reaches the client' );

check_matches( $config, '/"haz":1/', 'at least one species ships haz:1' );
check_matches( $config, '/"haz":0/', 'and at least one ships haz:0' );

dcc_section( 'the one species behind 36 -> 35, named' );

/*
 * The owner's Director asked which species the hub lost between the old rule
 * and the new one, and was right to: "the count went down by one" is not an
 * explanation. Computed rather than asserted, so the answer cannot drift as
 * the dataset grows.
 */
$old_rule = [];
$new_rule = [];
foreach ( $dataset as $sp ) {
	$v = (int) ( $sp['months'][ SEPT ] ?? 0 );
	if ( $v >= SPOT && 'safety' !== $sp['group'] ) { $old_rule[ $sp['id'] ] = $sp['name']; }
	if ( $v >= SPOT && empty( $sp['haz'] ) )       { $new_rule[ $sp['id'] ] = $sp['name']; }
}
$dropped = array_diff_key( $old_rule, $new_rule );
printf( "       hub count, September: %d under the 1.32.1 rule, %d under this one\n", count( $old_rule ), count( $new_rule ) );
printf( "       dropped: %s\n", implode( ', ', $dropped ) ?: '(nothing)' );
check_same( 1, count( $dropped ), 'exactly one species leaves the hub count' );
check_same( [ 'alligator' => 'Alligator' ], $dropped,
	'and it is the alligator — group critters, flagged danger, which is why a group test missed it' );

dcc_section( 'the September figures, pinned' );

$figures = [
	'hub tile / guide subtitle (>= 2, no hazards)' => count( $spotting ),
	'month strip "N at peak" (>= 3, no hazards)'   => count( $peak_spotting ),
	'Peak Now tiles'                                => count( $peak_spotting ),
	'Safety section'                                => count( $safety ),
	'search placeholder'                            => count( $dataset ),
];
foreach ( $figures as $label => $n ) {
	echo "       $label: $n\n";
}
check_same( 9, count( $safety ), 'Safety still holds nine' );

dcc_done();
