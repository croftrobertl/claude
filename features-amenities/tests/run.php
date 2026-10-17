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
// Release guards for the 1.11.1 audit findings.
//
// These are SOURCE assertions, not runtime tests: WordPress and a browser are
// both unavailable here, so they prove the code says the right thing, not that
// a served page behaves. Where that distinction matters it is named inline and
// in the release notes.
// =========================================================================
$root    = dirname( __DIR__ );
$widget  = file_get_contents( $root . '/includes/class-widget.php' );
$plugin  = file_get_contents( $root . '/includes/class-plugin.php' );
$css     = file_get_contents( $root . '/assets/css/widget.css' );

echo "\n[5] Packaged default list carries no pet ban\n";
// Cottage 34 accepts a small dog; a newly dropped widget must not contradict
// the live copy fixed on 2026-10-17.
ok(
	'no "or pets" in the default list',
	stripos( $widget, 'or pets' ) === false,
	'found a pet ban in the packaged defaults'
);
ok(
	'no "pets are allowed" phrasing anywhere',
	stripos( $widget, 'pets are allowed' ) === false
);
ok(
	'the Rules row still bans smoking',
	strpos( $widget, 'No smoking inside the cottage.' ) !== false
);

echo "\n[6] Assets cannot load on a page without the widget\n";
// Runtime proof needs WordPress. What is provable here: the plugin never
// enqueues the front-end handle itself, so the only path onto a page is
// Elementor resolving the widget's depends when the widget renders.
$front = preg_replace( '/public function enqueue_editor_assets.*$/s', '', $plugin );
// Match the CALL, not the prefix: the hook name 'wp_enqueue_scripts' contains
// the string 'wp_enqueue_script'.
ok(
	'no wp_enqueue_style() call outside the editor-only method',
	strpos( $front, 'wp_enqueue_style(' ) === false
);
ok(
	'no wp_enqueue_script() call outside the editor-only method',
	strpos( $front, 'wp_enqueue_script(' ) === false
);
ok(
	'registration is register-only',
	strpos( $plugin, 'wp_register_style' ) !== false && strpos( $plugin, 'wp_register_script' ) !== false
);
ok(
	'registration is idempotent (guarded)',
	strpos( $plugin, "wp_script_is( 'features-amenities', 'registered' )" ) !== false
);

echo "\n[7] Assets are reachable on a page that does have the widget\n";
ok( 'widget declares get_style_depends',  strpos( $widget, 'function get_style_depends' ) !== false );
ok( 'widget declares get_script_depends', strpos( $widget, 'function get_script_depends' ) !== false );
ok(
	'both depend on the registered handle',
	substr_count( $widget, "return [ 'features-amenities' ];" ) === 2
);
ok(
	'handle registered on Elementor\'s own hooks too',
	strpos( $plugin, 'elementor/frontend/after_register_styles' ) !== false
	&& strpos( $plugin, 'elementor/frontend/after_register_scripts' ) !== false
);

echo "\n[8] No dark-mode override\n";
// The site has no dark theme. With Inherit Theme Styles on, cards go
// transparent, so a #f0f0f0 text colour landed near-white on white.
ok( 'no prefers-color-scheme block', stripos( $css, 'prefers-color-scheme' ) === false );
ok( 'no #f0f0f0 text colour', stripos( $css, '#f0f0f0' ) === false );

echo "\n[9] Latent buttons cannot keep a tapped-on background\n";
// The kit rule .elementor-kit-331 button:hover,:focus{background-color:#F08080}
// is (0,2,1). Prefixing with .fal-container makes ours (0,3,0), which wins;
// gating hover keeps iOS from latching it after a tap.
preg_match_all( '/@media \( *hover: *hover *\) and \( *pointer: *fine *\) *\{(.*?)\n\}/s', $css, $m );
$hover_blocks = implode( "\n", $m[1] ?? [] );
$outside      = preg_replace( '/@media \( *hover: *hover *\) and \( *pointer: *fine *\) *\{.*?\n\}/s', '', $css );

foreach ( [ 'fal-search-clear', 'fal-read-more' ] as $btn ) {
	ok(
		"$btn :hover exists only inside a (hover:hover) block",
		strpos( $outside, ".$btn:hover" ) === false,
		"an ungated :hover rule for .$btn would stick on iOS"
	);
	ok(
		"$btn :hover is present in a gated block",
		strpos( $hover_blocks, ".$btn:hover" ) !== false
	);
	ok(
		"$btn styles are prefixed with .fal-container",
		preg_match( '/(?<!-)\.fal-container \.' . preg_quote( $btn, '/' ) . '\b/', $css ) === 1
	);
	ok(
		"$btn forces a transparent background",
		preg_match( '/\.fal-container \.' . preg_quote( $btn, '/' ) . '[^{]*\{[^}]*background: *transparent/s', $css ) === 1
	);
}

echo "\n[10] Clear button has a 44px tap area\n";
preg_match( '/\.fal-container \.fal-search-clear \{(.*?)\}/s', $css, $cm );
$clear = $cm[1] ?? '';
ok( 'min-width: 44px',  strpos( $clear, 'min-width: 44px' ) !== false );
ok( 'min-height: 44px', strpos( $clear, 'min-height: 44px' ) !== false );
ok(
	'the hit area is not shrunk by a transform',
	strpos( $clear, 'scale(' ) === false,
	'a scale() on the button would shrink the 44px target'
);
ok(
	'the icon keeps the scale animation instead',
	preg_match( '/\.fal-search-clear-icon \{[^}]*transform: *scale\(/s', $css ) === 1
);

echo "\n[12] Assets are reachable in the Elementor editor preview\n";
// The editor preview renders through Elementor's frontend, so registration
// must not be gated behind an is_admin() check. Only the settings page is.
preg_match( '/public function boot\(\): void \{(.*?)\n\t\}/s', $plugin, $bm );
$boot = $bm[1] ?? '';
ok( 'boot() was parsed', $boot !== '' );
preg_match( '/if \( is_admin\(\) \) \{(.*?)\}/s', $boot, $am );
$admin_only = $am[1] ?? '';
ok(
	'asset registration is NOT inside the is_admin() branch',
	strpos( $admin_only, 'register_assets' ) === false
);
ok(
	'only the settings page is admin-gated',
	strpos( $admin_only, 'Settings' ) !== false
);
ok(
	'registration hooks fire for frontend and preview alike',
	substr_count( $boot, "[ \$this, 'register_assets' ]" ) === 3
);

echo "\n[13] The kit rule's :focus half is covered, not just :focus-visible\n";
// A tap sets :focus WITHOUT :focus-visible. Covering only :focus-visible left
// the kit's `button:focus{background-color:#F08080}` winning — caught by the
// browser run, guarded here so it cannot come back.
foreach ( [ 'fal-search-clear', 'fal-read-more' ] as $btn ) {
	ok(
		"$btn has an explicit :focus background rule",
		preg_match(
			'/\.fal-container \.' . preg_quote( $btn, '/' ) . ':focus(?!-visible)[^{]*\{[^}]*background: *transparent/s',
			$css
		) === 1,
		'without this a tap leaves the coral kit background'
	);
}

echo "\n[14] The input reserves space for the enlarged tap area\n";
preg_match( '/\.fal-search-input \{(.*?)\}/s', $css, $im );
$inp = $im[1] ?? '';
ok(
	'padding-right is at least the 44px tap width',
	preg_match( '/padding: *\d+px +(\d+)px/', $inp, $pm ) === 1 && (int) $pm[1] >= 44,
	'a smaller reserve puts the tap area over the input text'
);

echo "\n[11] Editor guidance steers facts into the description\n";
ok( 'title label names a short label', strpos( $widget, 'Short label (e.g. Dining Area)' ) !== false );
ok( 'description label is "The details"', strpos( $widget, "'The details'" ) !== false );

// =========================================================================
echo "\n" . str_repeat( '-', 56 ) . "\n";
echo sprintf( "%d passed, %d failed\n", $pass, $fail );
exit( $fail > 0 ? 1 : 0 );
