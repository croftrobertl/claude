<?php
/**
 * Export bespoke sprites from class-sprites.php as standalone SVG files in
 * assets/sprites/, so a SIBLING PLUGIN can reference the real artwork instead
 * of redrawing it. (The Cottage Selector drew its own fish because it could
 * not read this repo; that is the problem this solves.)
 *
 * Generated, never hand-edited: class-sprites.php stays the single source of
 * truth, and test-sprites.php fails if an exported file drifts from it.
 *
 *   php dcc-wildlife/tools/export-sprites.php
 */
declare(strict_types=1);

$root = dirname( __DIR__ );
// The class guards on ABSPATH, as every plugin file must; this is a CLI tool,
// so stand in for it rather than loading WordPress.
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', $root . '/' );
}
require_once $root . '/includes/class-sprites.php';

/** Which sprites sibling plugins have asked for. Add ids here, then re-run. */
const EXPORT = [ 'fish', 'heron', 'egret' ];

$registry = DCC_WL\Sprites::registry();
$out      = $root . '/assets/sprites/';
$written  = [];

foreach ( EXPORT as $id ) {
	if ( ! isset( $registry[ $id ] ) ) {
		fwrite( STDERR, "MISSING sprite: $id\n" );
		exit( 1 );
	}
	$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" role="img" aria-label="' . htmlspecialchars( ucfirst( $id ), ENT_QUOTES ) . '">'
		. $registry[ $id ]
		. '</svg>' . "\n";
	file_put_contents( $out . $id . '.svg', $svg );
	$written[ $id ] = strlen( $svg );
}

foreach ( $written as $id => $bytes ) {
	printf( "%-8s %5d B  assets/sprites/%s.svg\n", $id, $bytes, $id );
}
echo count( $written ) . " sprites exported\n";
