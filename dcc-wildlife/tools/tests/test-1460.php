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
dcc_section( 'at most one chip per row, by the Director\'s exact rules' );

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
check_same( 21, count( $chips['danger'] ), '"Keep Away" is the 21 species in the Safety group' );
check_same( 6, count( $chips['protected'] ), '"Protected" is exactly six species' );
check_same(
	[ 'eagle', 'kestrel', 'littleblue', 'manatee', 'tricolored', 'woodstork' ],
	( static function ( array $k ): array { sort( $k ); return $k; } )( $chips['protected'] ),
	'and they are the six the Director listed, by key'
);
check_same( Guide_Page::PROTECTED_KEYS, [ 'manatee', 'eagle', 'kestrel', 'littleblue', 'tricolored', 'woodstork' ], 'the list is written out, not derived from a flag' );

/*
 * "Lake County" IS ON EVERY NEAR SPECIES THAT DOES NOT ALREADY WEAR A
 * HIGHER CHIP — 46 of the 49, the other three being Safety-group snakes and
 * a caterpillar, which show "Keep Away".
 *
 * COUNTED, AND THE ARITHMETIC IS STATED, because the first version of this
 * section collected the near chips and never asserted them: the mutation
 * "a NEAR species shown without its chip" passed against it. A list this
 * suite gathers and does not check is a hole with a variable name on it.
 */
$near_total  = 0;
$near_safety = 0;
foreach ( $dataset as $sp ) {
	if ( 'NEAR' !== Local::class_of( (string) $sp['id'] ) ) {
		continue;
	}
	$near_total++;
	if ( 'safety' === $sp['group'] ) {
		$near_safety++;
	}
}
check_same( 49, $near_total, 'there are 49 NEAR species' );
check_same(
	$near_total - $near_safety,
	count( $chips['near'] ),
	'and every one of them carries the Lake County chip unless Keep Away outranks it',
	count( $chips['near'] ) . ' chips for ' . $near_total . ' NEAR minus ' . $near_safety . ' in Safety'
);
check_same( 46, count( $chips['near'] ), 'which is 46' );

/*
 * THE PRECEDENCE IS SAFETY FIRST, and the diamondback is the species that
 * proves it: it is in the Safety group AND classified NEAR, so it could
 * take either chip. "Keep Away" is the one a guest needs first.
 */
$dia = null;
foreach ( $dataset as $sp ) {
	if ( 'diamondback' === $sp['id'] ) { $dia = $sp; }
}
check( null !== $dia, 'the diamondback is in the dataset' );
check_same( 'NEAR', Local::class_of( 'diamondback' ), 'and it is classified NEAR' );
check_same( 'danger', Guide_Page::chip_of( $dia )[0] ?? '', 'yet its chip is Keep Away, not Lake County' );

/*
 * A HAZARD OUTSIDE THE SAFETY GROUP GETS NO "Keep Away" CHIP, and this is
 * REPORTED rather than quietly decided: seven species carry the `danger`
 * flag while living under Animals or Plants — the alligator among them —
 * and the Director's rule names the Safety GROUP and its count of 21. The
 * warning is not lost: every one of them still prints its own "Take Care"
 * and "What To Do" lines in its entry, which this asserts.
 */
$hazard_outside = [];
foreach ( $dataset as $sp ) {
	if ( in_array( 'danger', (array) ( $sp['flags'] ?? [] ), true ) && 'safety' !== $sp['group'] ) {
		$hazard_outside[] = (string) $sp['id'];
	}
}
sort( $hazard_outside );
check_same(
	[ 'alligator', 'canetoad', 'cubantreefrog', 'pricklypear', 'rhesus', 'sawgrass', 'walkingstick' ],
	$hazard_outside,
	'the seven hazards that live outside the Safety group are known by name'
);
$no_warning = [];
foreach ( $hazard_outside as $id ) {
	if ( preg_match( '#id="dccwl-fl-' . preg_quote( $id, '#' ) . '".*?</li>#s', $guide, $m )
		&& false === strpos( $m[0], 'Take Care' ) ) {
		$no_warning[] = $id;
	}
}
check_same( [], $no_warning, 'and every one of them still carries its Take Care line', implode( ', ', $no_warning ) );

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
