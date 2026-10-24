<?php
/**
 * 1.47.0 — Rob's two picks from the desktop stills: C, "Most Recorded
 * Here" in the pane before a species is opened, and Y, the photo credits
 * folded. The server half; the browser half is ui-1470.mjs.
 *
 * Every number here is DERIVED from the data and compared to what the
 * page printed. Where a literal appears, it pins today's snapshot so that
 * a change in the data shows up as a reviewed diff, never silently.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
$root = dcc_boot_plugin();

use DCC_WL\Guide_Page;
use DCC_WL\Local;
use DCC_WL\Species;

$dataset = Species::dataset();
$guide   = Guide_Page::shortcode( [] );

/* =====================================================================
 * THE FOUR ARE THE TOP FOUR BY `n`, computed here independently of
 * Guide_Page::most_recorded() — straight from the generated table.
 * ===================================================================== */
dcc_section( 'the four are the top four by n' );

$photo_of = [];
foreach ( $dataset as $sp ) {
	$src = is_array( $sp['src'] ?? null ) ? $sp['src'] : [];
	$photo_of[ (string) $sp['id'] ] = (string) ( $src['mid'] ?? ( $src['full'] ?? '' ) );
}
$ranked = [];
foreach ( Local::RECORDS as $id => $r ) {
	if ( 'HERE' !== $r['class'] || ! ctype_digit( (string) $r['n'] ) ) { continue; }
	if ( '' === ( $photo_of[ $id ] ?? '' ) ) { continue; }
	$ranked[ $id ] = (int) $r['n'];
}
uksort( $ranked, static fn( $a, $b ) => ( $ranked[ $b ] <=> $ranked[ $a ] ) ?: strcmp( (string) $a, (string) $b ) );
$expected = array_slice( array_keys( $ranked ), 0, 4 );
$got      = array_map( static fn( array $sp ): string => (string) $sp['id'], Guide_Page::most_recorded( $dataset ) );

check_same( 4, Guide_Page::SPOTLIGHT_COUNT, 'four cards, as the subtitle says' );
check_same( $expected, $got, 'most_recorded() is the top four of the table by n, most first' );
check_same( [ 'alligator', 'anhinga', 'commongallinule', 'heron' ], $got,
	'and today that is the alligator, the anhinga, the gallinule and the great blue heron (the 2026-10-22 pull)' );
check( ! in_array( 'manatee', $got, true ), 'the manatee\'s "owner" count is not an iNaturalist count, and is never ranked' );
check( $ranked[ $expected[3] ] > ( array_values( $ranked )[4] ?? -1 ), 'and the fourth strictly beats the fifth, so no tie decides the set today' );
check_same( [], Guide_Page::most_recorded( [] ), 'an empty dataset ranks nothing' );

/* The page prints those four, in that order, as cards. */
preg_match_all( '/data-dccwl-gp-spot-key="([^"]+)"/', $guide, $cards );
check_same( $expected, $cards[1], 'the pane carries the same four cards, in the same order' );

dcc_section( 'the cards: links, no numbers, the Keep Away rule' );

$a_from = (int) strpos( $guide, '<aside class="dccwl-gp-pane"' );
$aside  = (string) substr( $guide, $a_from, (int) strpos( $guide, '</aside>', $a_from ) - $a_from );
check( strlen( $aside ) > 500, 'the pane was found in the page', (string) strlen( $aside ) );
foreach ( $expected as $id ) {
	check_contains( $aside, 'href="#' . Guide_Page::ANCHOR_PREFIX . $id . '"', "the $id card is a real link to its anchor" );
	check_contains( $guide, 'id="' . Guide_Page::ANCHOR_PREFIX . $id . '"', "and that anchor exists on the page ($id)" );
}
foreach ( $expected as $id ) {
	check_lacks( $aside, (string) Local::row( $id )['n'], "the $id card prints no count — a count is a snapshot that goes stale" );
}
check_lacks( $aside, 'records', 'and nothing says "records"' );
check_same( 1, substr_count( $aside, ', Keep Away</span>' ), 'exactly one card is a hazard, with ", Keep Away" after the name for a screen reader' );
check_contains( $aside, 'Alligator<span aria-hidden="true"> · Keep Away</span><span class="dccwl-sr">, Keep Away</span>',
	'and it is the alligator: "Alligator · Keep Away" on screen, "Alligator, Keep Away" as its name' );
check_same( 4, substr_count( $aside, 'loading="lazy"' ), 'each photo is lazy, so a phone (pane not displayed) fetches none of them' );
check_same( 4, substr_count( $aside, 'alt=""' ), 'and decorative: the name beside it is the text' );

dcc_section( 'the title, the subtitle and its date' );

check_contains( $aside, '<h2 class="dccwl-gp-spot-h" id="dccwl-gp-spot-h">Most Recorded Here</h2>', 'the title' );
check_contains( $aside, 'aria-labelledby="dccwl-gp-spot-h"', 'and the pane is named by it while it holds the spotlight' );

$when = date_i18n( 'F Y', strtotime( Local::PULLED . ' 12:00:00' ) );
check_same( 'October 2026', $when, 'the pull is dated October 2026 (Local::PULLED = ' . Local::PULLED . ')' );
check_contains( $aside, 'The four species recorded most on this canal on iNaturalist, as of ' . $when,
	'the subtitle names the source and the month and year of the pull' );
/* The date is FROM THE DATA: the helper turns any date it is given into
 * its month, so a literal "October 2026" in the code fails here. */
check_same( 'March 2025', Guide_Page::as_of( '2025-03-09' ), 'as_of() formats the date it is given, not a fixed one' );
check_same( 'December 2026', Guide_Page::as_of( '2026-12-31' ), 'including the last day of a year, read at noon so no timezone moves it' );

dcc_section( 'the order, and the box' );

check( $a_from > 0 && $a_from < (int) strpos( $guide, '<ol class="dccwl-gp-list' ),
	'the pane comes BEFORE the list in the source, so Tab from the last row leaves the list' );
check_contains( $guide, '<ol class="dccwl-gp-list dccwl-gp-list-split" data-dccwl-gp-list>', 'the list ships boxed, because the pane is never empty' );
check_lacks( substr( $guide, $a_from, 200 ), ' hidden', 'and the pane ships shown (CSS hides it below 900px)' );

/* =====================================================================
 * Y — THE CREDITS SHIP FOLDED, COUNTED, AND COMPLETE.
 * ===================================================================== */
dcc_section( 'the photo credits are folded, counted, and complete' );

check( 1 === preg_match( '/<details class="dccwl-fullguide dccwl-photo-credits" id="credits">/', $guide ), 'the credits ship CLOSED (no open attribute)' );
$c_from  = (int) strpos( $guide, '<ul class="dccwl-photo-credits-list">' );
$c_list  = (string) substr( $guide, $c_from, (int) strpos( $guide, '</ul>', $c_from ) - $c_from );
$entries = substr_count( $c_list, '<li>' );
$with    = 0;
$credits = Species::photo_credits();
foreach ( $dataset as $sp ) {
	if ( '' !== (string) $sp['photo'] && isset( $credits[ $sp['id'] ] ) ) { $with++; }
}
check_same( $with, $entries, 'every photographed species is still credited in the HTML' );
check_same( 401, $entries, 'which is 401 today' );
check_contains( $guide, 'Photo Credits (' . $entries . ')', 'the summary says "Photo Credits (N)", N counted from the list' );
check_contains( $guide, 'data-dccwl-credits-count="' . $entries . '"', 'and the count is the rows\' count, not a literal' );
check_contains( $guide, 'Who took each photograph, and where it came from', 'with its one line' );

dcc_section( 'one h1' );
check_same( 1, substr_count( $guide, '<h1' ), 'the page has exactly one h1' );
check_same( 1, substr_count( $guide, '<h2 class="dccwl-gp-spot-h"' ), 'and the spotlight\'s title is an h2 under it' );

dcc_done();
