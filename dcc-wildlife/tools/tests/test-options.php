<?php
/**
 * Stored options: defaults, the read-time merge, the upgrade step, sanitising.
 *
 * The point of this suite is the promise "defaults reproduce current behaviour
 * exactly". That promise is only checkable if something asserts what the
 * defaults ARE and what a site with an older stored row ends up reading.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();

use DCC_WL\Water_Data;
use DCC_WL\Water_Admin;
use DCC_WL\Plugin;

dcc_section( 'defaults' );

$d = Water_Data::defaults();
check( count( $d ) >= 24, 'defaults() returns the full key set', 'got ' . count( $d ) );
check_same( 0, $d['live_enabled'], 'live_enabled is OFF by default — it makes network calls' );
check_same( 0, $d['map_enabled'], 'map_enabled is off by default' );
check_same( 0, $d['delete_on_uninstall'], 'uninstall does NOT delete by default' );
check( ! array_key_exists( 'usgs_sites', $d ), 'the 1.8.0 usgs_sites key is gone from defaults' );

// Anything that is an array in defaults() can be shadowed wholesale by a
// stored row, so the set is worth pinning: a new array-typed key needs a
// migration step, not just a default.
$arrays = array_keys( array_filter( $d, 'is_array' ) );
sort( $arrays );
check_same(
	[ 'almanac', 'chain_waters', 'links', 'reports' ],
	$arrays,
	'the array-typed defaults are exactly the four we know need migration care'
);

dcc_section( 'read-time merge' );

dccwl_test_reset();
check_same( $d, Water_Data::all(), 'with nothing stored, all() is exactly defaults()' );

// A stored row from an older version lacks keys added later. Those keys must
// still read their default, or a new feature looks switched off on every
// existing site.
dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = [ 'live_enabled' => 1 ];
$all = Water_Data::all();
check_same( 1, $all['live_enabled'], 'a stored scalar wins over its default' );
check_same( $d['atlas_base'], $all['atlas_base'], 'a key absent from the stored row reads its default' );
check_same( count( $d ), count( $all ), 'the merged result has no missing and no extra keys' );

dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = 'not-an-array';
check_same( $d, Water_Data::all(), 'a corrupt (non-array) stored option falls back to defaults' );

dcc_section( 'the 1.17.0 unpkg escape hatch' );

dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = [
	'map_leaflet_js'  => 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
	'map_leaflet_css' => 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
];
$all = Water_Data::all();
check_same( $d['map_leaflet_js'], $all['map_leaflet_js'], 'a stored unpkg JS URL is treated as unset' );
check_same( $d['map_leaflet_css'], $all['map_leaflet_css'], 'a stored unpkg CSS URL is treated as unset' );
check_lacks( (string) $all['map_leaflet_js'], 'unpkg.com', 'the served Leaflet is never a CDN' );

dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = [ 'map_leaflet_js' => 'https://example.test/my-leaflet.js' ];
check_same(
	'https://example.test/my-leaflet.js',
	Water_Data::all()['map_leaflet_js'],
	'a deliberately custom Leaflet URL is left alone'
);

dcc_section( 'sanitising rejects bad input' );

dccwl_test_reset();
$out = Water_Admin::sanitize(
	[
		'live_enabled'        => 'yes',
		'lat'                 => '<script>28.8</script>',
		'lon'                 => 'not-a-number',
		'atlas_base'          => 'javascript:alert(1)',
		'map_sat_attrib'      => '<b>keep</b><script>drop()</script>',
		'chain_waters'        => [ [ 'id' => '<x>1', 'name' => 'Lake Dora', 'lat' => '28.8', 'lon' => 'abc' ] ],
		'links'               => 'not-an-array',
		'delete_on_uninstall' => '1',
		'unknown_key'         => 'should vanish',
	]
);
check_same( 1, $out['live_enabled'], 'a truthy string becomes integer 1' );
check_same( '', $out['lat'], 'a non-numeric latitude is emptied, not stored' );
check_same( '', $out['lon'], 'a non-numeric longitude is emptied' );
check_same( '', $out['atlas_base'], 'a javascript: URL is rejected outright' );
check_lacks( (string) $out['map_sat_attrib'], '<script', 'a script tag does not survive an attribution field' );
check_contains( (string) $out['map_sat_attrib'], '<b>keep', 'harmless markup does survive it' );
check( ! array_key_exists( 'unknown_key', $out ), 'an unknown key is dropped rather than stored' );
check( is_array( $out['links'] ), 'a scalar posted into an array field becomes an array' );
check_same( '1', $out['chain_waters'][0]['id'], 'a chain id is stripped to its safe characters' );
check_same( '', $out['chain_waters'][0]['lon'], 'a non-numeric chain coordinate is emptied' );
check_same( count( $d ), count( $out ), 'sanitising returns exactly the known key set' );

// Every sanitised value must survive a round trip through the read path
// unchanged, or saving the form would quietly alter settings.
dccwl_test_reset();
$clean = Water_Admin::sanitize( Water_Data::defaults() );
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = $clean;
check_same( $clean, Water_Data::all(), 'saving the defaults unchanged is a no-op through all()' );

dcc_section( 'the version option and the upgrade step' );

check_same( dcc_header_version(), DCC_WL_VERSION, 'the header Version and DCC_WL_VERSION agree' );

dccwl_test_reset();
// Built without the constructor on purpose: this suite is about the upgrade
// step, not about the hooks the bootstrap registers.
$plugin = ( new \ReflectionClass( Plugin::class ) )->newInstanceWithoutConstructor();
$plugin->maybe_upgrade();
check_same(
	DCC_WL_VERSION,
	get_option( 'dcc_wl_version' ),
	'a fresh site records the current version'
);

// The guard must not re-run on every request once recorded.
$GLOBALS['dccwl_test']['options']['dcc_wl_version'] = DCC_WL_VERSION;
$before = $GLOBALS['dccwl_test']['options'];
$plugin->maybe_upgrade();
check_same( $before, $GLOBALS['dccwl_test']['options'], 'a site already on this version is untouched' );

dcc_section( 'the upgrade step persists a merged row' );

// A site carrying a row from an older version: the row lacks keys added since,
// and its chain rows lack fields the row shape has grown.
dccwl_test_reset();
$GLOBALS['dccwl_test']['options']['dcc_wl_version'] = '1.29.0';
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = [
	'live_enabled' => 1,
	'chain_waters' => [ [ 'id' => '99', 'name' => 'Owner Lake' ] ],
];
$plugin->maybe_upgrade();

$after = get_option( Water_Data::OPTION );
check( is_array( $after ), 'the option is still an array afterwards' );
check_same( count( $d ), count( $after ), 'the stored row now names every key, so it describes behaviour' );
check_same( 1, $after['live_enabled'], 'a value the owner set is untouched' );
check_same( $d['atlas_base'], $after['atlas_base'], 'a key they never saw now reads its default from the row itself' );

// The owner's list wins WHOLESALE. Ten lakes are seeded; they kept one.
check_same( 1, count( $after['chain_waters'] ), 'their one chain row is not joined by the ten seeded ones' );
check_same( '99', $after['chain_waters'][0]['id'], 'their row is the one that survived' );
check_same( 'Owner Lake', $after['chain_waters'][0]['name'], 'with its name intact' );
// ...but the row gains the fields the shape has since grown, empty.
check( array_key_exists( 'lat', $after['chain_waters'][0] ), 'the row gains the lat key it was missing' );
check_same( '', $after['chain_waters'][0]['lat'], 'empty, for them to fill in — not guessed' );

dcc_section( 'the orphan option from the removed sightings log' );

dccwl_test_reset();
$GLOBALS['dccwl_test']['options']['dcc_wl_version']  = '1.30.0';
$GLOBALS['dccwl_test']['options']['dcc_wl_settings'] = [ 'left' => 'behind' ];
$plugin->maybe_upgrade();
check_same( false, get_option( 'dcc_wl_settings' ), 'dcc_wl_settings is removed on upgrade' );

// A fresh install has none, and must not acquire one.
dccwl_test_reset();
$plugin->maybe_upgrade();
check_same( false, get_option( 'dcc_wl_settings' ), 'a fresh install does not gain it' );
check_same( false, get_option( Water_Data::OPTION ), 'nor a settings row it does not need' );

dcc_section( 'a downgrade runs no migration' );

dccwl_test_reset();
$GLOBALS['dccwl_test']['options']['dcc_wl_version']  = '99.0.0';
$GLOBALS['dccwl_test']['options']['dcc_wl_settings'] = [ 'still' => 'here' ];
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = [ 'live_enabled' => 1 ];
$plugin->maybe_upgrade();
check_same(
	[ 'live_enabled' => 1 ],
	get_option( Water_Data::OPTION ),
	'moving backwards leaves the stored row exactly as it was'
);
check( is_array( get_option( 'dcc_wl_settings' ) ), 'and runs no removal step' );
check_same( DCC_WL_VERSION, get_option( 'dcc_wl_version' ), 'but it does record where we now are, so it settles' );

dcc_done();
