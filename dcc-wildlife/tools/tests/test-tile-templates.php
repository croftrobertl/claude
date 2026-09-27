<?php
/**
 * The chain map's tile templates, and the stub that hid their bug.
 *
 * THE DEFECT. Both templates went through esc_url_raw(), whose allow-list in
 * wp-includes/formatting.php excludes `{` and `}`. So
 *
 *     https://tile.openstreetmap.org/{z}/{x}/{y}.png
 *
 * was STORED as https://tile.openstreetmap.org/z/x/y.png. Leaflet hands the
 * string to L.tileLayer verbatim, so every tile in the grid asked for that one
 * literal URL; the provider answered with one image of the whole world and it
 * repeated in every slot. The 1.31.0 fit was working perfectly the whole time.
 *
 * WHY THE HARNESS MISSED IT, which matters more than the bug. `esc_url_raw` was
 * stubbed as `return (string) $u;`. A stub more permissive than the real thing
 * is not a simplification — it is a test that agrees with you. wp-stubs.php now
 * carries WordPress's actual character class, and the first assertion below is
 * that the stub still strips braces, because the moment it stops doing that
 * every other assertion here becomes worthless.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();

use DCC_WL\Water_Admin;
use DCC_WL\Water_Data;
use DCC_WL\Water_Render;

const TILE_DEFAULT = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const SAT_DEFAULT  = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

dcc_section( 'the stub is faithful, or nothing below means anything' );

check_same(
	'https://tile.openstreetmap.org/z/x/y.png',
	esc_url_raw( TILE_DEFAULT ),
	'esc_url_raw still strips Leaflet placeholders, exactly as WordPress does'
);
check_lacks( esc_url_raw( TILE_DEFAULT ), '{', 'no brace survives it' );
// And it must still behave like a URL escaper in the ordinary case, or it has
// been broken in the other direction.
check_same( 'https://example.com/a?b=1&c=2', esc_url_raw( 'https://example.com/a?b=1&c=2' ), 'an ordinary URL passes through unharmed' );
check_same( 'https://example.com/a%20b', esc_url_raw( 'https://example.com/a b' ), 'a space still becomes %20' );
check_lacks( esc_url_raw( 'https://example.com/"><script>' ), '<', 'and a tag is still stripped' );

dcc_section( 'saving the defaults keeps the placeholders' );

dccwl_test_reset();
$out = Water_Admin::sanitize( [ 'map_tile_url' => TILE_DEFAULT, 'map_sat_url' => SAT_DEFAULT ] );
check_same( TILE_DEFAULT, $out['map_tile_url'], 'the tile template survives a save byte for byte' );
check_same( SAT_DEFAULT, $out['map_sat_url'], 'so does the satellite template' );
foreach ( [ '{z}', '{x}', '{y}' ] as $ph ) {
	check_contains( $out['map_tile_url'], $ph, "the $ph placeholder is still there" );
}

// The real URL fields must STILL be escaped — the fix is narrow on purpose.
$urls = Water_Admin::sanitize(
	[
		'map_leaflet_js'  => 'https://example.com/leaflet.js?v={x}',
		'map_leaflet_css' => 'https://example.com/"><script>alert(1)</script>',
	]
);
check_lacks( $urls['map_leaflet_js'], '{', 'a Leaflet asset URL is still brace-stripped — it is a URL, not a template' );
check_lacks( $urls['map_leaflet_css'], '<', 'and still tag-stripped' );

dcc_section( 'a template is validated, never half-repaired' );

$cases = [
	'http://tile.example.com/{z}/{x}/{y}.png'        => [ '', 'plain http is refused' ],
	'//tile.example.com/{z}/{x}/{y}.png'             => [ '', 'a scheme-relative URL is refused' ],
	'javascript:alert(1)'                            => [ '', 'a javascript: URL is refused' ],
	'https://t.example.com/{z}/{x}/{y}.png?k=a-b_c'  => [ 'https://t.example.com/{z}/{x}/{y}.png?k=a-b_c', 'a query string is allowed' ],
	'https://{s}.tile.example.com/{z}/{x}/{y}.png'   => [ 'https://{s}.tile.example.com/{z}/{x}/{y}.png', 'the subdomain placeholder is allowed' ],
	'https://t.example.com/{z}/{x}/{y}@2x.png'       => [ 'https://t.example.com/{z}/{x}/{y}@2x.png', 'a retina suffix is allowed' ],
	'https://t.example.com/<script>/{z}.png'         => [ '', 'anything with a tag character is refused WHOLE, not cleaned' ],
	'https://t.example.com/{z}/{x}/{y}.png"'         => [ '', 'a stray quote rejects the value rather than being trimmed out' ],
	''                                               => [ '', 'empty stays empty' ],
	'   ' . TILE_DEFAULT . '   '                     => [ TILE_DEFAULT, 'surrounding whitespace is trimmed' ],
];
foreach ( $cases as $in => [ $want, $why ] ) {
	$got = Water_Admin::sanitize( [ 'map_tile_url' => $in ] )['map_tile_url'];
	check_same( $want, $got, $why );
}

dcc_section( 'a row already damaged is repaired on upgrade' );

/** Run the water upgrade over one stored row and hand back what it became. */
function dcc_upgrade_row( array $row ): array {
	dccwl_test_reset();
	$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = $row;
	Water_Data::upgrade();
	$after = get_option( Water_Data::OPTION );
	return is_array( $after ) ? $after : [];
}

// This site's exact case: the stripped defaults.
$fixed = dcc_upgrade_row(
	[
		'map_tile_url' => 'https://tile.openstreetmap.org/z/x/y.png',
		'map_sat_url'  => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/z/y/x',
	]
);
check_same( TILE_DEFAULT, $fixed['map_tile_url'], 'the stripped tile default is restored' );
check_same( SAT_DEFAULT, $fixed['map_sat_url'], 'and the stripped satellite default, which uses z/y/x order' );

// A custom provider, re-braced generically.
$custom = dcc_upgrade_row( [ 'map_tile_url' => 'https://tiles.example.com/dark/z/x/y.png' ] );
check_same( 'https://tiles.example.com/dark/{z}/{x}/{y}.png', $custom['map_tile_url'], "a custom provider's trailing z/x/y is re-braced" );

$custom2 = dcc_upgrade_row( [ 'map_sat_url' => 'https://img.example.com/svc/MapServer/tile/z/y/x' ] );
check_same( 'https://img.example.com/svc/MapServer/tile/{z}/{y}/{x}', $custom2['map_sat_url'], 'as is a trailing z/y/x' );

// Healthy values must not be touched.
$healthy = dcc_upgrade_row( [ 'map_tile_url' => TILE_DEFAULT, 'map_sat_url' => SAT_DEFAULT ] );
check_same( TILE_DEFAULT, $healthy['map_tile_url'], 'a healthy template is left exactly alone' );
check_same( SAT_DEFAULT, $healthy['map_sat_url'], 'both of them' );

// And a value we cannot recognise is left alone rather than guessed at.
$odd = dcc_upgrade_row( [ 'map_tile_url' => 'https://weird.example.com/tiles?a=1' ] );
check_same( 'https://weird.example.com/tiles?a=1', $odd['map_tile_url'], 'an unrecognisable value is left for the owner to retype' );

// A path that merely CONTAINS z/x/y mid-URL must not be mangled.
$midpath = dcc_upgrade_row( [ 'map_tile_url' => 'https://example.com/z/x/y/extra/path' ] );
check_same( 'https://example.com/z/x/y/extra/path', $midpath['map_tile_url'], 'z/x/y that is not at the end is not a placeholder run' );

dcc_section( 'the SERVED config carries the placeholders' );

/** The water module's inline config, as the browser would receive it. */
function dcc_served_map_cfg( array $stored ): array {
	dccwl_test_reset();
	// Water_Render emits its config ONCE per page. Without this the second call
	// in a suite returns nothing and reads as a missing tile URL.
	dcc_reset_once_guards();
	$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = array_merge( Water_Data::defaults(), $stored );
	ob_start();
	Water_Render::render( [] );
	ob_end_clean();
	$cfg = '';
	foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
		$cfg .= (string) $data;
	}
	preg_match( '/DCC_WL_WATER\s*=\s*(\{.*\})\s*;/s', $cfg, $m );
	$json = json_decode( $m[1] ?? '{}', true );
	return is_array( $json['map'] ?? null ) ? $json['map'] : [];
}

$enabled = [ 'live_enabled' => 1, 'map_enabled' => 1 ];

// After a save of the default value.
$saved = Water_Admin::sanitize( array_merge( Water_Data::defaults(), [ 'map_tile_url' => TILE_DEFAULT, 'map_sat_url' => SAT_DEFAULT ] ) );
// $enabled LAST: $saved carries the defaults' map_enabled => 0, and the earlier
// order let it win, so the map block was absent and every assertion below was
// checking an empty string. A passing-looking failure either way.
$map   = dcc_served_map_cfg( array_merge( $saved, $enabled ) );
check_contains( (string) ( $map['tileUrl'] ?? '' ), '{z}', 'after a save, the served tileUrl carries {z}' );
check_contains( (string) ( $map['tileUrl'] ?? '' ), '{x}', 'and {x}' );
check_contains( (string) ( $map['tileUrl'] ?? '' ), '{y}', 'and {y}' );
check_contains( (string) ( $map['satUrl'] ?? '' ), '{z}', 'and the served satUrl carries {z}' );
check_contains( (string) ( $map['satUrl'] ?? '' ), '{y}', 'and {y}' );
check_contains( (string) ( $map['satUrl'] ?? '' ), '{x}', 'and {x}' );

// And after an upgrade from a row holding the stripped strings.
dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = array_merge(
	Water_Data::defaults(),
	$enabled,
	[
		'map_tile_url' => 'https://tile.openstreetmap.org/z/x/y.png',
		'map_sat_url'  => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/z/y/x',
	]
);
Water_Data::upgrade();
$repaired = get_option( Water_Data::OPTION );
$map2     = dcc_served_map_cfg( $repaired );
check_same( TILE_DEFAULT, $map2['tileUrl'] ?? '', 'after the upgrade the served tileUrl is whole again' );
check_same( SAT_DEFAULT, $map2['satUrl'] ?? '', 'and so is the served satUrl' );

// The failure signature itself: the same URL for every tile.
check_lacks( (string) ( $map2['tileUrl'] ?? '' ), '/z/x/y', 'the stripped form is gone from what is served' );

dcc_section( 'persist_merged cannot undo the repair' );

// persist_merged() runs on every upgrade and re-writes the row. It must carry
// the repaired value forward, not the default-shaped one it started from.
dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = [ 'map_tile_url' => 'https://tile.openstreetmap.org/z/x/y.png' ];
Water_Data::upgrade();
Water_Data::persist_merged();
check_same(
	TILE_DEFAULT,
	get_option( Water_Data::OPTION )['map_tile_url'],
	'the repaired value survives the merge that used to re-persist the damage'
);

dcc_done();
