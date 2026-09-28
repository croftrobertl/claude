<?php
/**
 * The wire split (1.33.0): what the page carries, and what it fetches.
 *
 * The guide is going from fifty-one species to a few hundred. Measured
 * against a synthetic four-hundred-species registry with this release's
 * longer prose, inlining everything costs 103 KB GZIPPED on every page view,
 * for every guest, whether or not they ever open a species. The index alone
 * is 8.9 KB.
 *
 * What this suite protects is the property that makes the split safe: THE
 * INDEX MUST CARRY EVERYTHING THE FIRST VIEW READS. If a field slips out of
 * it, nothing errors — the tiles just quietly stop counting, or the search
 * stops finding, in a way only a guest would notice.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();
dccwl_test_reset();

use DCC_WL\Species;
use DCC_WL\Guide_Rest;

dcc_section( 'the index is exactly what the client reads before a sheet opens' );

/*
 * Derived from the SCRIPTS, not from a wish list. Every field named here was
 * found by reading what widget.js and canal.js touch outside the sheet
 * builder; if the scripts start reading another one, this list and
 * Species::WIRE_INDEX must both grow, and the mismatch is what fails first.
 */
$needed_by_first_view = [
	'id',      // tiles, the deck, the hub art
	'name',    // the search haystack, the look-alike rows
	'sci',     // the search haystack
	'mark',    // the search haystack, the look-alike rows
	'months',  // every count, the spotlight, Peak Now, the strip
	'flags',   // the tile marks
	'haz',     // hazards out of the counts and out of Peak Now
	'group',   // the group-glyph fallback
	'src',     // the tile face and the hub art
	'sprite',  // the middle rung of the art fallback
];
sort( $needed_by_first_view );
$declared = Species::WIRE_INDEX;
sort( $declared );
check_same( $needed_by_first_view, $declared, 'WIRE_INDEX is exactly the first view\'s field list' );

dcc_section( 'every species splits cleanly, and nothing is lost' );

$dataset = Species::dataset();
$detail  = Species::wire_detail();
check_same( count( $dataset ), count( $detail ), 'the detail map has a row per species' );

$lost = [];
$leaked = [];
foreach ( $dataset as $sp ) {
	$sp['sprite'] = true;
	[ $index, $det ] = Species::wire_split( $sp );
	foreach ( $sp as $k => $v ) {
		if ( in_array( $k, Species::WIRE_NEVER, true ) ) {
			if ( isset( $index[ $k ] ) || isset( $det[ $k ] ) ) {
				$leaked[] = $sp['id'] . '.' . $k;
			}
			continue;
		}
		if ( ! array_key_exists( $k, $index ) && ! array_key_exists( $k, $det ) ) {
			$lost[] = $sp['id'] . '.' . $k;
		}
	}
}
check_same( [], $lost, 'no field falls between the two halves', implode( ', ', array_slice( $lost, 0, 8 ) ) );
check_same( [], $leaked, 'and the four dead fields reach neither half', implode( ', ', array_slice( $leaked, 0, 8 ) ) );

dcc_section( 'the four dead fields really are dead' );

/*
 * `odds` stopped being rendered in 1.27.0 and `emoji` when the sprites
 * arrived; both kept riding along on every page view. A source lint, because
 * the cheapest way for one to come back is for someone to start reading it
 * again without noticing it is no longer sent.
 */
$root = dirname( __DIR__, 2 );
foreach ( [ 'assets/js/widget.js', 'assets/js/canal.js' ] as $file ) {
	$src = (string) file_get_contents( $root . '/' . $file );
	foreach ( Species::WIRE_NEVER as $dead ) {
		check_matches(
			$src,
			'/^(?!.*\b(?:sp|s|o)\.' . preg_quote( $dead, '/' ) . '\b).*$/s',
			sprintf( '%s reads no sp.%s — it is not on the wire', basename( $file ), $dead )
		);
	}
}

dcc_section( 'the page carries the index, and a URL for the rest' );

dccwl_test_reset();
dcc_reset_once_guards();
ob_start();
\DCC_WL\Render::shortcode( [] );
ob_end_clean();
$config = '';
foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
	$config .= (string) $data;
}
check_contains( $config, '"detailUrl"', 'the config names where the rest lives' );
check_matches( $config, '/dcc-wildlife\\\\\/v1\\\\\/species\?v=/', 'and the URL is version-stamped' );

// A field from each half, to prove the split reached the wire.
check_matches( $config, '/"months":\[/', 'the index carries the month calendar' );
check_matches( $config, '/"mark":/', 'and the field mark, which search needs' );
/*
 * Asked of the SPECIES ARRAY, not of the whole config: the i18n table has a
 * key called "safe" (the "What to do" heading), and a naive substring search
 * over the config finds it and calls the split broken.
 */
preg_match( '/window\.DCC_WL_CFG = (\{.*\});/s', $config, $m );
$cfg_obj  = json_decode( $m[1] ?? '{}', true );
$wire_row = $cfg_obj['species'][0] ?? [];
check( ! empty( $wire_row ), 'the config parses and carries species' );
$wire_keys = array_keys( $wire_row );
sort( $wire_keys );
$expect = Species::WIRE_INDEX;
sort( $expect );
check_same( $expect, $wire_keys, 'a wire row has the index fields and only those' );
foreach ( [ 'fact', 'safe', 'bestLabel', 'photoNote', 'where', 'best', 'sound', 'idgroup' ] as $sheet_only ) {
	check(
		! array_key_exists( $sheet_only, $wire_row ),
		sprintf( '%s does NOT travel inline', $sheet_only )
	);
}

dcc_section( 'the split actually pays, measured' );

$gz = static fn( string $s ): int => strlen( gzencode( $s, 9 ) );
$full = [];
foreach ( $dataset as $sp ) {
	$sp['sprite'] = true;
	foreach ( Species::WIRE_NEVER as $k ) { unset( $sp[ $k ] ); }
	$full[] = $sp;
}
$full_gz  = $gz( (string) wp_json_encode( $full ) );
$index_gz = $gz( $config );
printf( "       whole dataset inline: %d gz | the page's config now: %d gz\n", $full_gz, $index_gz );
check(
	$index_gz < $full_gz / 2,
	'the page carries less than half what inlining everything would cost',
	sprintf( 'index %d vs full %d', $index_gz, $full_gz )
);

dcc_section( 'the route is cacheable for a year, because its URL says which release' );

check( class_exists( 'DCC_WL\Guide_Rest' ), 'Guide_Rest exists' );
$url = Guide_Rest::url();
check_contains( $url, 'dcc-wildlife/v1/species', 'the route is /species' );
check_contains( $url, 'v=' . DCC_WL_VERSION, 'and carries this release' );

dccwl_test_reset();
Guide_Rest::register_routes();
$found = null;
foreach ( $GLOBALS['dccwl_test']['routes'] as $r ) {
	if ( false !== strpos( (string) ( $r['route'] ?? '' ), 'species' ) ) { $found = $r; }
}
check( null !== $found, 'the route is registered' );
if ( $found ) {
	check_same( Guide_Rest::NS, $found['ns'], 'in the plugin namespace' );
	$args = $found['args'];
	check_same( 'GET', $args['methods'] ?? '', 'GET only' );
	check_same( '__return_true', $args['permission_callback'] ?? '', 'public: it serves a constant, not a secret' );
}

$resp = Guide_Rest::species();
$data = $resp->get_data();
check_same( DCC_WL_VERSION, $data['version'] ?? '', 'the payload names its release' );
check_same( count( $dataset ), count( $data['species'] ?? [] ), 'and carries every species' );
$cc = (string) ( $resp->headers['Cache-Control'] ?? '' );
check_contains( $cc, 'immutable', 'and is immutable' );
check_contains( $cc, 'max-age=31536000', 'for a year' );
check_contains( $cc, 'public', 'and publicly cacheable, which is the point' );

dcc_done();
