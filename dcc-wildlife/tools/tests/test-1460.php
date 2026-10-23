<?php
/**
 * 1.46.0 — PART C (local-first) and the server half of PART B.
 *
 * The browser halves — the switch, the search, the pills, the sheet, the
 * deep links, the first view's element count — are in ui-guide.mjs, because
 * every one of those is a claim about what a guest SEES. What is here is
 * the data underneath them, and the rules that decide what a row says.
 *
 * THE FIRST SECTION IS THE IMPORTANT ONE. The classification is 402 rows of
 * somebody else's evidence: record counts, dates and observation URLs from
 * an iNaturalist pull. The generated PHP must say exactly what the CSV
 * says, and the CSV is in tools/data as the provenance record — so this
 * suite reads BOTH and compares them, rather than trusting the generator
 * that wrote one from the other.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
$root = dcc_boot_plugin();

use DCC_WL\Guide_Page;
use DCC_WL\Local;
use DCC_WL\Species;

/* ================================================================= C ====
 * THE GENERATED TABLE SAYS WHAT THE CSV SAYS.
 * ======================================================================= */
dcc_section( 'the local-first table matches the pull it was generated from' );

$csv_path = dirname( __DIR__ ) . '/data/local-first-2026-10-22.csv';
check( is_file( $csv_path ), 'the CSV is kept in the repository as the provenance record' );

$csv = [];
if ( is_file( $csv_path ) ) {
	$fh   = fopen( $csv_path, 'r' );
	$head = fgetcsv( $fh );
	while ( ( $r = fgetcsv( $fh ) ) !== false ) {
		if ( ! $r || '' === trim( (string) $r[0] ) ) {
			continue;
		}
		$row                   = array_combine( $head, array_pad( $r, count( $head ), '' ) );
		$csv[ $row['key'] ]    = $row;
	}
	fclose( $fh );
}

check_same( 402, count( $csv ), 'it holds a row per species' );
check_same( count( $csv ), count( Local::RECORDS ), 'and the generated table holds the same number' );

$drift = [];
foreach ( $csv as $key => $row ) {
	$have = Local::row( (string) $key );
	if ( ! $have ) {
		$drift[] = "$key: missing";
		continue;
	}
	if ( $have['class'] !== $row['class']
		|| $have['n'] !== trim( (string) $row['n_15km'] )
		|| $have['date'] !== trim( (string) $row['latest_date'] )
		|| $have['url'] !== trim( (string) $row['example_url'] ) ) {
		$drift[] = $key;
	}
}
check_same( [], $drift, 'every field of every row is the CSV\'s, verbatim', implode( ', ', array_slice( $drift, 0, 8 ) ) );

/* The three counts the Director will check on live. */
$by = array_count_values( array_column( Local::RECORDS, 'class' ) );
check_same( 346, $by['HERE'] ?? 0, 'HERE: 346' );
check_same( 49, $by['NEAR'] ?? 0, 'NEAR: 49' );
check_same( 7, $by['WIDER'] ?? 0, 'WIDER: 7' );

$ids = array_map( static fn( array $sp ): string => (string) $sp['id'], Species::dataset() );
$tally = Local::tally( $ids );
check_same( 395, $tally['here'], '"Seen Here" is 395 — the 346 plus the 49 Rob asked to keep in it' );
check_same( 7, $tally['wider'], 'and "Wider Florida" is 7' );

/* Every key in the table is a species, and every species is in the table. */
$registry = array_keys( Species::registry() );
check_same( [], array_diff( $registry, array_keys( Local::RECORDS ) ), 'no species is missing from the table' );
check_same( [], array_diff( array_keys( Local::RECORDS ), $registry ), 'and the table invents none' );

dcc_section( 'the manatee is the owners\' own sighting, not a database row' );

$man = Local::row( 'manatee' );
check_same( 'HERE', $man['class'] ?? '', 'classified HERE' );
check_same( 'owner', $man['n'] ?? '', 'on an OWNER OBSERVATION — Rob, Erica and Rick' );
check_same( '', $man['url'] ?? 'x', 'with no iNaturalist link, because it is not iNaturalist\'s claim' );

$guide = dccwl_test_reset() ?? '';
dcc_reset_once_guards();
$guide = Guide_Page::shortcode( [] );

check_contains( $guide, 'By your hosts, in the canal and on the Chain.', 'and the page credits them in those words' );
/* The sourced history, in the Director's wording, with no claim about where. */
check_contains( $guide, 'Manatees were first documented in the Harris Chain in 2015', 'the sourced history line is on the page' );
check_contains( $guide, 'nicknamed Leesburg, became a local regular', 'including how she is named' );
check( false === strpos( $guide, 'sighted at Leesburg' ), 'and it does not say she was sighted AT Leesburg' );

dcc_section( 'what the page says about where a species has been recorded' );

check_same(
	345,
	substr_count( $guide, 'Recorded Near Here' ),
	'every HERE species but the manatee carries the iNaturalist citation'
);
check_same(
	34,
	substr_count( $guide, 'Recorded In Lake County' ),
	'and every NEAR species that HAS an example observation is worded for Lake County'
);
/*
 * A WIDER SPECIES SAYS NOTHING ABOUT RECORDS. "No record within 40 km" is
 * not a statement a guide may make about an animal: iNaturalist is
 * presence-only and this area is undersampled — the summary's own example
 * is the white-tailed deer, with one usable record within 15 km and 447
 * within 40.
 */
$wider_keys = [];
foreach ( Local::RECORDS as $key => $row ) {
	if ( 'WIDER' === $row['class'] ) {
		$wider_keys[] = $key;
	}
}
$spoke = [];
foreach ( $wider_keys as $key ) {
	if ( preg_match( '#id="dccwl-fl-' . preg_quote( $key, '#' ) . '".*?</li>#s', $guide, $m )
		&& false !== strpos( $m[0], 'dccwl-gp-local' ) ) {
		$spoke[] = $key;
	}
}
check_same( [], $spoke, 'no Wider Florida species claims anything about records', implode( ', ', $spoke ) );

/*
 * And every link that IS printed goes to the observation the CSV names.
 *
 * SCOPED TO THE CITATION LINES, not to the page. Some PHOTOGRAPHS are
 * sourced from iNaturalist observations too, and their links live in the
 * credits panel — a page-wide sweep put thirty of those in the universe
 * and failed against a page that was correct, which is the "a probe that
 * fires on correct behaviour" trap in its usual disguise.
 */
preg_match_all( '#<p class="dccwl-gp-local".*?</p>#s', $guide, $local_lines );
$local_html = implode( '', $local_lines[0] );
preg_match_all( '#href="(https://www\.inaturalist\.org/observations/\d+)"#', $local_html, $links );
$known = array_filter( array_column( Local::RECORDS, 'url' ) );
check( count( $links[1] ) > 300, 'the page carries the observation links', (string) count( $links[1] ) );
check_same( [], array_diff( array_unique( $links[1] ), $known ), 'and every one of them is a URL from the pull' );

/* ================================================================= B ====
 * THE ROW RULES.
 * ======================================================================= */
dcc_section( 'the row marks (1.46.1): a stripe for hazards, a chip for the official lists' );

$dataset = Species::dataset();
$chips   = [ 'danger' => [], 'protected' => [], 'near' => [], 'none' => 0 ];
foreach ( $dataset as $sp ) {
	$chip = Guide_Page::chip_of( $sp );
	if ( ! $chip ) {
		$chips['none']++;
		continue;
	}
	$chips[ $chip[0] ][] = (string) $sp['id'];
}
/*
 * "KEEP AWAY" IS A STRIPE, NOT A CHIP (Rob's pick, 2026-10-23). 1.46.0 put
 * it in the chip slot on the 21 Safety-group species and that left the
 * alligator unmarked; the stripe follows is_hazard() and covers all 28,
 * and the chip slot is free for what else is true of the species.
 */
check_same( [], $chips['danger'], 'no row carries a Keep Away CHIP any more' );
$striped = [];
foreach ( $dataset as $sp ) {
	if ( Species::is_hazard( $sp ) ) {
		$striped[] = (string) $sp['id'];
	}
}
check_same( 28, count( $striped ), 'is_hazard() names 28 species' );
check_same( 28, substr_count( $guide, 'dccwl-gp-item-hazard' ), 'and the stripe is on exactly those 28 rows' );
check_same( 28, substr_count( $guide, ', Keep Away</span>' ), 'each with ", Keep Away" in its accessible name' );
check_same( 28, substr_count( $guide, 'class="dccwl-gp-keepaway"' ), 'and "Keep Away" at the head of its entry, for the sheet' );
foreach ( [ 'alligator', 'canetoad', 'cottonmouth' ] as $id ) {
	preg_match( '#<li class="dccwl-gp-item[^"]*" id="dccwl-fl-' . $id . '"#', $guide, $m );
	check( isset( $m[0] ) && false !== strpos( $m[0], 'dccwl-gp-item-hazard' ), "the $id row is striped" );
}
$non = [ 'heron', 'manatee', 'bluegill' ];
foreach ( $non as $id ) {
	preg_match( '#<li class="dccwl-gp-item[^"]*" id="dccwl-fl-' . $id . '"#', $guide, $m );
	check( isset( $m[0] ) && false === strpos( $m[0], 'dccwl-gp-item-hazard' ), "and the $id row is not" );
}

/*
 * "PROTECTED" FOLLOWS THE OFFICIAL LIST (Rob's pick): Florida's Endangered
 * and Threatened Species List, Fla. Admin. Code R. 68A-27.003, effective
 * 2025-04-03, plus the eagle under its own federal Act. Thirteen keys,
 * written out, never derived from the registry's `protected` flag. Twelve
 * in 1.46.1; the red-cockaded woodpecker was the Director's own omission
 * (1.46.2) — federally Threatened since the 2024 downlisting, and on the
 * rule's federally-designated list.
 */
check_same( 13, count( $chips['protected'] ), '"Protected" is exactly thirteen species' );
check_same(
	[ 'blackskimmer', 'eagle', 'gophertortoise', 'indigosnake', 'kestrel', 'littleblue', 'manatee', 'redcockaded', 'sandhill', 'sandskink', 'scrubjay', 'tricolored', 'woodstork' ],
	( static function ( array $k ): array { sort( $k ); return $k; } )( $chips['protected'] ),
	'and they are the thirteen the Director listed, by key'
);
check_same( array_keys( Guide_Page::PROTECTED ), Guide_Page::PROTECTED_KEYS, 'the two spellings of the list agree' );
check_same( '2025-04-03', Guide_Page::PROTECTED_SOURCE['effective'], 'the source carries its effective date' );
check_same( 'Fla. Admin. Code R. 68A-27.003', Guide_Page::PROTECTED_SOURCE['rule'], 'and the rule it is' );
check( ! isset( Guide_Page::PROTECTED['alligator'] ), 'THE ALLIGATOR IS NOT ON IT — listed only for similarity of appearance to the crocodile' );
check_same( 'federal', Guide_Page::PROTECTED['redcockaded'] ?? '', 'the red-cockaded woodpecker IS on it (1.46.2), as federally designated' );
check_same( 13, substr_count( $guide, 'class="dccwl-fg-line dccwl-gp-protected"' ), 'each of the thirteen carries one sourced line under Take Care' );
check_same( 13, substr_count( $guide, 'Fla. Admin. Code R. 68A-27.003' ), 'citing the rule, with a link' );
check_contains( Guide_Page::protected_line( 'redcockaded' ), 'Federally Threatened (Florida', 'the woodpecker\'s line is the federal wording, Threatened not Endangered' );

/*
 * THE REGISTRY FLAG AND THE LIST ARE ONE SET (1.46.2). 1.46.1 wrote the
 * list by hand and left the registry's `protected` flag where it had been,
 * and the audit found three disagreements: the woodpecker flagged but not
 * listed, the sand skink and the black skimmer listed but not flagged.
 * /explore/'s sheet badges read the flag; the guide's chips read the list.
 * Equal, with NO deliberate differences, so a drift fails here by key.
 */
$flagged = [];
foreach ( $dataset as $sp ) {
	if ( in_array( 'protected', (array) ( $sp['flags'] ?? [] ), true ) ) {
		$flagged[] = (string) $sp['id'];
	}
}
sort( $flagged );
$listed = array_keys( Guide_Page::PROTECTED );
sort( $listed );
check_same( $listed, $flagged, 'the registry `protected` flag set equals Guide_Page::PROTECTED — no deliberate differences' );
check_same( 13, count( $flagged ), 'and that set is thirteen' );
check_contains( $guide, 'The Southeastern American kestrel that nests here is State-designated Threatened', 'the kestrel line names the resident subspecies' );
check_contains( $guide, 'winter visitors from the north are not.', 'and says the winter birds are not' );
check_contains( $guide, 'Not on Florida&#039;s Threatened list since 2007, but protected by the federal Bald and Golden Eagle Protection Act', 'the eagle has its own Act, not the list' );

/*
 * THE CANE TOAD IS THE PROOF THE SLOT IS FREE: a hazard AND a NEAR species.
 * Under 1.46.0 it wore "Keep Away" and lost "Lake County"; now it wears the
 * stripe and keeps the chip — the Director's own done-means line.
 */
$toad = null;
foreach ( $dataset as $sp ) {
	if ( 'canetoad' === $sp['id'] ) { $toad = $sp; }
}
check_same( 'near', Guide_Page::chip_of( $toad )[0] ?? '', 'the cane toad\'s chip is Lake County' );
check( Species::is_hazard( $toad ), 'and it is a hazard, so it is striped as well' );

/*
 * "Lake County" IS ON EVERY NEAR SPECIES THAT IS NOT ALSO PROTECTED — 45
 * of the 49 (46 under 1.46.1); the gopher tortoise, the indigo snake, the
 * sand skink and, since 1.46.2, the red-cockaded woodpecker take
 * "Protected", which outranks it. COUNTED, with the arithmetic stated: the
 * 1.46.0 version of this section gathered the near chips and never
 * asserted them, and a mutation walked straight through.
 */
$near_total = 0;
$near_prot  = 0;
foreach ( $dataset as $sp ) {
	if ( 'NEAR' !== Local::class_of( (string) $sp['id'] ) ) { continue; }
	$near_total++;
	if ( isset( Guide_Page::PROTECTED[ (string) $sp['id'] ] ) ) { $near_prot++; }
}
check_same( 49, $near_total, 'there are 49 NEAR species' );
check_same( $near_total - $near_prot, count( $chips['near'] ), 'every one carries Lake County unless Protected outranks it',
	count( $chips['near'] ) . ' chips for ' . $near_total . ' NEAR minus ' . $near_prot . ' protected' );
check_same( 45, count( $chips['near'] ), 'which is 45' );

dcc_section( 'the pills, and the rows they count' );

check_same( 402, substr_count( $guide, 'data-dccwl-gp-item' ), 'one row per species' );
check_same( 395, substr_count( $guide, 'data-scope="here"' ), '395 of them are Seen Here' );
check_same( 7, substr_count( $guide, 'data-scope="wider"' ), 'and 7 are Wider Florida' );

/*
 * EVERY ROW IS IN EXACTLY ONE PILL, and the pill it is in exists. A row
 * whose group has no pill would be unreachable by any filter — the 1.28.0
 * defect (seven winter species no tab could show) in a new shape.
 */
preg_match_all( '#data-group="([^"]+)"#', $guide, $g );
$groups_used = array_unique( $g[1] );
preg_match_all( '#data-dccwl-gp-group="([^"]+)"#', $guide, $p );
$pills = array_diff( array_unique( $p[1] ), [ 'all' ] );
check_same( [], array_diff( $groups_used, $pills ), 'every row\'s group has a pill', implode( ', ', array_diff( $groups_used, $pills ) ) );
check_same( [], array_diff( $pills, $groups_used ), 'and no pill is offered for a group with no rows' );

dcc_section( 'the anchors, and the link from /explore/' );

$missing = [];
foreach ( $dataset as $sp ) {
	if ( false === strpos( $guide, 'id="dccwl-fl-' . $sp['id'] . '"' ) ) {
		$missing[] = (string) $sp['id'];
	}
}
check_same( [], $missing, 'every species has a #dccwl-fl- anchor' );
check_contains( $guide, 'id="dccwl-fl-alligator"', 'including the one the Director will try' );

dccwl_test_reset();
dcc_reset_once_guards();
\DCC_WL\Render::render( [] );
$cfg = '';
foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
	if ( false !== strpos( (string) $data, 'DCC_WL_CFG' ) ) {
		$cfg = (string) $data;
	}
}
check_contains( $cfg, '"guideAnchor":"dccwl-fl-"', '/explore/ is told the prefix rather than repeating it' );
check_same( 'dccwl-fl-', Guide_Page::ANCHOR_PREFIX, 'and both ends read it from one constant' );

dcc_done();
