<?php
/**
 * Self-contained test runner for the Features & Amenities settings layer.
 *
 *   php tests/run.php
 *
 * No PHPUnit dependency: WordPress is not loadable here, so the handful of WP
 * functions the settings layer touches are stubbed below. Only the pure parts
 * of Settings (schema/defaults/merge_defaults/sanitize) are exercised — the WP
 * wiring (menu registration, options.php round trip) cannot be tested without
 * a real WordPress and is called out as unverified in the report.
 */

define( 'ABSPATH', __DIR__ );

// ---- WP stubs ------------------------------------------------------------
function __( $s, $d = null ) { return $s; }
function esc_html__( $s, $d = null ) { return $s; }
function sanitize_text_field( $s ) { return trim( strip_tags( (string) $s ) ); }
function sanitize_hex_color( $s ) {
	$s = (string) $s;
	return preg_match( '/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/', $s ) ? $s : null;
}

require_once __DIR__ . '/../includes/class-settings.php';

use FeaturesAmenities\Settings;

// ---- tiny harness --------------------------------------------------------
$pass = 0;
$fail = 0;
function ok( string $name, bool $cond, string $detail = '' ): void {
	global $pass, $fail;
	if ( $cond ) {
		$pass++;
		echo "  PASS  $name\n";
	} else {
		$fail++;
		echo "  FAIL  $name" . ( $detail ? "  -- $detail" : '' ) . "\n";
	}
}
function eq( string $name, $expected, $actual ): void {
	ok(
		$name,
		$expected === $actual,
		'expected ' . var_export( $expected, true ) . ', got ' . var_export( $actual, true )
	);
}

// =========================================================================
echo "\n[1] Defaults reproduce 1.10.2 behaviour exactly\n";
// Every value here is the hardcoded Elementor control default as it stood in
// 1.10.2. If one of these changes, an untouched widget changes appearance.
$expected_1_10_2 = [
	'default_amenity_icon'  => 'fas fa-anchor',
	'enable_search'         => '0',      // 1.7.3 flipped the search bar OFF
	'search_placeholder'    => 'Search amenities...',
	'desktop_accordion'     => '0',
	'exclusive_accordion'   => '0',
	'auto_fold_words'       => 0,
	'density'               => 'cozy',
	'menu_layout'           => 'list',
	'inherit_theme'         => '1',
	'glassmorphism'         => '1',
	'primary_color'         => '#0E9AAF',
	'header_text_align'     => 'center',
	'amenity_text_align'    => 'center',
	'header_hover'          => 'lift',
	'amenity_hover'         => 'scale',
	'header_icon_edge_gap'  => 5,        // added 1.8.0
	'header_arrow_edge_gap' => 5,        // added 1.9.0
	'amenity_grid_min_col'  => 200,      // matches the baked CSS minmax(200px,...)
];
$defaults = Settings::defaults();
foreach ( $expected_1_10_2 as $k => $v ) {
	eq( "default[$k]", $v, $defaults[$k] ?? null );
}
// The one intentional visual change in 1.11.0, kept explicit so it can't drift
// back in silently.
eq( 'default[primary_text_color] (AA fix, new in 1.11.0)', '#0B7C8C', $defaults['primary_text_color'] ?? null );

// Nothing in the schema may be missing a default.
$missing = array_keys( array_filter( Settings::schema(), fn( $f ) => ! array_key_exists( 'default', $f ) ) );
eq( 'every schema key carries a default', [], $missing );

// =========================================================================
echo "\n[2] Upgrade merges newly added keys into an already-stored row\n";
// Simulate a row stored by an older version that predates several keys.
$old_row = [
	'density'         => 'comfy',   // user had customised this
	'enable_search'   => '1',
	'_schema_version' => 0,
];
$merged = Settings::merge_defaults( $old_row );

eq( 'stored value survives the merge (density)', 'comfy', $merged['density'] );
eq( 'stored value survives the merge (enable_search)', '1', $merged['enable_search'] );
eq( 'missing key gains its default (primary_text_color)', '#0B7C8C', $merged['primary_text_color'] );
eq( 'missing key gains its default (amenity_grid_min_col)', 200, $merged['amenity_grid_min_col'] );
ok(
	'no schema key is absent after merge',
	count( array_diff( array_keys( Settings::defaults() ), array_keys( $merged ) ) ) === 0
);
// The Seasons 4.0.0 trap: a new feature must not read as switched off just
// because the stored row predates its key.
ok(
	'new keys are not silently falsy after upgrade',
	$merged['inherit_theme'] === '1' && $merged['glassmorphism'] === '1'
);
// Unknown keys from a hand-edited row are dropped rather than carried forward.
$with_junk = Settings::merge_defaults( [ 'density' => 'cozy', 'bogus_key' => 'x' ] );
ok( 'unknown keys are dropped', ! array_key_exists( 'bogus_key', $with_junk ) );

// =========================================================================
echo "\n[3] Sanitisation rejects bad input\n";
$dirty = Settings::sanitize( [
	'density'              => 'ENORMOUS',            // not in choices
	'menu_layout'          => '<script>x</script>',  // not in choices
	'auto_fold_words'      => '-40',                 // below min
	'header_icon_edge_gap' => '9999',                // above max
	'amenity_grid_min_col' => 'not-a-number',
	'primary_color'        => 'javascript:alert(1)', // not a hex colour
	'primary_text_color'   => '#ZZZZZZ',             // malformed hex
	'search_placeholder'   => '  <b>Find</b> stuff ',
	'default_amenity_icon' => '<img src=x onerror=1>fas fa-star',
] );

eq( 'invalid select falls back to default', 'cozy', $dirty['density'] );
eq( 'script in select falls back to default', 'list', $dirty['menu_layout'] );
eq( 'below-min number falls back to default', 0, $dirty['auto_fold_words'] );
eq( 'above-max number falls back to default', 5, $dirty['header_icon_edge_gap'] );
eq( 'non-numeric falls back to default', 200, $dirty['amenity_grid_min_col'] );
eq( 'non-hex colour falls back to default', '#0E9AAF', $dirty['primary_color'] );
eq( 'malformed hex falls back to default', '#0B7C8C', $dirty['primary_text_color'] );
eq( 'text is stripped and trimmed', 'Find stuff', $dirty['search_placeholder'] );
ok( 'tags stripped from text field', strpos( $dirty['default_amenity_icon'], '<' ) === false );
ok( 'schema version is stamped on save', ( $dirty['_schema_version'] ?? null ) === Settings::SCHEMA_VERSION );

// Valid input must survive untouched.
$clean = Settings::sanitize( [
	'density'       => 'compact',
	'primary_color' => '#ABCDEF',
	'auto_fold_words' => '25',
] );
eq( 'valid select is kept', 'compact', $clean['density'] );
eq( 'valid hex is kept', '#ABCDEF', $clean['primary_color'] );
eq( 'valid number is cast to int', 25, $clean['auto_fold_words'] );

// =========================================================================
echo "\n[4] Checkbox trap: unticking must persist, not revert to default\n";
// Contact Form's bug: rebuilding from defaults and copying only POSTed keys
// silently re-ticks every checkbox whose default is on. An absent checkbox in
// the POST means the user unticked it.
$unticked = Settings::sanitize( [
	// inherit_theme and glassmorphism default to '1' and are ABSENT here,
	// exactly as a browser submits an unchecked box.
	'density' => 'cozy',
] );
eq( 'unticked on-by-default checkbox stores 0 (inherit_theme)', '0', $unticked['inherit_theme'] );
eq( 'unticked on-by-default checkbox stores 0 (glassmorphism)', '0', $unticked['glassmorphism'] );
eq( 'unticked off-by-default checkbox stays 0 (enable_search)', '0', $unticked['enable_search'] );

$ticked = Settings::sanitize( [ 'inherit_theme' => '1', 'enable_search' => '1' ] );
eq( 'ticked checkbox stores 1', '1', $ticked['inherit_theme'] );
eq( 'ticked checkbox stores 1 (enable_search)', '1', $ticked['enable_search'] );
eq( 'absent checkbox stores 0 even when others are ticked', '0', $ticked['glassmorphism'] );

// =========================================================================
echo "\n" . str_repeat( '-', 56 ) . "\n";
echo sprintf( "%d passed, %d failed\n", $pass, $fail );
exit( $fail > 0 ? 1 : 0 );
