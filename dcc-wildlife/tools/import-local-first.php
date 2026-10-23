<?php
/**
 * Generate includes/class-local.php from the Director's classification CSV.
 *
 *   php tools/import-local-first.php tools/data/local-first-2026-10-22.csv
 *
 * WHY THIS IS A SCRIPT AND NOT A PASTE. The table is 402 rows of record
 * counts, dates and observation URLs — evidence, not prose — and the one way
 * a hand-copied table goes wrong is silently, in one row nobody re-reads.
 * The CSV stays in tools/data as the provenance record (tools/ is excluded
 * from the plugin zip), the generated PHP is what ships, and re-running this
 * on the same CSV must produce an identical file.
 *
 * WHAT IT REFUSES TO DO:
 *   - invent a row for a species the CSV does not carry, or keep one for a
 *     species the registry does not have. Both are a hard stop: a guide that
 *     claims a record for the wrong species is the failure this whole module
 *     is built to prevent.
 *   - normalise, round or re-word anything. The class, the count, the date
 *     and the URL are copied; the notes column is NOT shipped (it is
 *     provenance for the Director, not guest-facing data).
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/tests/lib.php';
dcc_boot_plugin();

$csv = $argv[1] ?? ( __DIR__ . '/data/local-first-2026-10-22.csv' );
if ( ! is_file( $csv ) ) {
	fwrite( STDERR, "no such CSV: $csv\n" );
	exit( 2 );
}

$fh = fopen( $csv, 'r' );
if ( ! $fh ) {
	fwrite( STDERR, "cannot read $csv\n" );
	exit( 2 );
}
$head = fgetcsv( $fh );
$want = [ 'key', 'common', 'scientific', 'group', 'class', 'n_15km', 'latest_date', 'example_url', 'notes' ];
if ( $head !== $want ) {
	fwrite( STDERR, "unexpected columns: " . implode( ',', (array) $head ) . "\n" );
	exit( 2 );
}

$rows = [];
while ( ( $r = fgetcsv( $fh ) ) !== false ) {
	if ( ! $r || '' === trim( (string) $r[0] ) ) {
		continue;
	}
	$row = array_combine( $want, array_pad( $r, count( $want ), '' ) );
	$rows[ $row['key'] ] = $row;
}
fclose( $fh );

$registry = \DCC_WL\Species::registry();
$missing  = array_diff( array_keys( $registry ), array_keys( $rows ) );
$extra    = array_diff( array_keys( $rows ), array_keys( $registry ) );
if ( $missing || $extra ) {
	fwrite( STDERR, "registry/CSV mismatch\n  missing: " . implode( ', ', $missing ) . "\n  extra: " . implode( ', ', $extra ) . "\n" );
	exit( 1 );
}

/*
 * The CLASS is the only field with a closed vocabulary, so it is the only
 * one validated: anything else would be this script second-guessing the
 * pull. An unknown class is a stop, not a default — "assume WIDER" would
 * quietly move a species out of the guest's own list.
 */
$allowed = [ 'HERE', 'NEAR', 'WIDER' ];
$out     = [];
foreach ( $registry as $key => $_sp ) {
	$row = $rows[ $key ];
	if ( ! in_array( $row['class'], $allowed, true ) ) {
		fwrite( STDERR, "unknown class for $key: {$row['class']}\n" );
		exit( 1 );
	}
	$url = trim( (string) $row['example_url'] );
	if ( '' !== $url && ! preg_match( '#^https://www\.inaturalist\.org/observations/\d+$#', $url ) ) {
		fwrite( STDERR, "unexpected observation URL for $key: $url\n" );
		exit( 1 );
	}
	/*
	 * `n_15km` is "owner" for the manatee and an integer everywhere else.
	 * It is kept as the STRING the CSV holds rather than cast, because
	 * "owner" is not a number and casting it would write 0 — which would
	 * read as "no records" for the one species Rob has seen himself.
	 */
	$out[ $key ] = [
		'class' => $row['class'],
		'n'     => trim( (string) $row['n_15km'] ),
		'date'  => trim( (string) $row['latest_date'] ),
		'url'   => $url,
	];
}

$counts = array_count_values( array_column( $out, 'class' ) );
$php    = "<?php\n";
$php   .= "/**\n";
$php   .= " * WHERE EACH SPECIES HAS ACTUALLY BEEN RECORDED — generated, never typed.\n";
$php   .= " *\n";
$php   .= " * Source: the Website Director's iNaturalist pull of 2026-10-22, research\n";
$php   .= " * grade, wild only, usable (unobscured, better than 5 km) coordinates, from\n";
$php   .= " * 28.80,-81.73. HERE = a record within 15 km. NEAR = none within 15 km but\n";
$php   .= " * at least one within 40 km, roughly Lake County. WIDER = neither.\n";
$php   .= " *\n";
$php   .= " * NEAR AND WIDER MEAN \"NOT VERIFIED HERE\", NEVER \"ABSENT\". iNaturalist is a\n";
$php   .= " * presence-only source and the area around Tavares is undersampled — the\n";
$php   .= " * white-tailed deer has one usable record within 15 km and 447 within 40.\n";
$php   .= " * Nothing in this file may be rendered as a claim that a species is not here.\n";
$php   .= " *\n";
$php   .= " * DO NOT EDIT. Re-run tools/import-local-first.php against the CSV in\n";
$php   .= " * tools/data/, which is the provenance record this was built from.\n";
$php   .= " *\n";
$php   .= " * @package DCC_Wildlife\n";
$php   .= " */\n\n";
$php   .= "namespace DCC_WL;\n\n";
$php   .= "if ( ! defined( 'ABSPATH' ) ) {\n\texit;\n}\n\n";
$php   .= "final class Local {\n\n";
$php   .= "\t/** The pull this file was generated from. */\n";
$php   .= "\tpublic const PULLED = '2026-10-22';\n\n";
$php   .= "\t/** HERE: " . ( $counts['HERE'] ?? 0 ) . " · NEAR: " . ( $counts['NEAR'] ?? 0 ) . " · WIDER: " . ( $counts['WIDER'] ?? 0 ) . " */\n";
$php   .= "\tpublic const RECORDS = [\n";
foreach ( $out as $key => $row ) {
	$php .= sprintf(
		"\t\t%-22s => [ 'class' => %-8s 'n' => %-8s 'date' => %-14s 'url' => %s ],\n",
		var_export( (string) $key, true ),
		var_export( $row['class'], true ) . ',',
		var_export( $row['n'], true ) . ',',
		var_export( $row['date'], true ) . ',',
		var_export( $row['url'], true )
	);
}
$php .= "\t];\n}\n";

$target = dirname( __DIR__ ) . '/includes/class-local.php';
file_put_contents( $target, $php );
printf( "wrote %s: %d species (HERE %d · NEAR %d · WIDER %d)\n", $target, count( $out ), $counts['HERE'] ?? 0, $counts['NEAR'] ?? 0, $counts['WIDER'] ?? 0 );
