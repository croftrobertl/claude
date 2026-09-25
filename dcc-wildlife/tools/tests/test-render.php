<?php
/**
 * Server-rendered output, and the inline config the client reads.
 *
 * Asserts on real rendered markup, never on "the function was called". The
 * inline config matters as much as the HTML: it is where dead keys accumulate
 * unnoticed, because nothing visibly breaks when one is wrong.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();

use DCC_WL\Render;
use DCC_WL\Canal_Render;
use DCC_WL\Species;

/** Render a shortcode and hand back both the HTML and the inline config JSON. */
function dcc_render( string $which ): array {
	dccwl_test_reset();
	ob_start();
	$html = 'canal' === $which ? Canal_Render::shortcode( [] ) : Render::shortcode( [] );
	$echoed = (string) ob_get_clean();
	$config = '';
	foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
		if ( str_contains( (string) $data, 'DCC_WL_CFG' ) || str_contains( (string) $data, 'dccwl' ) ) {
			$config .= (string) $data;
		}
	}
	return [ 'html' => $echoed . $html, 'config' => $config ];
}

dcc_section( 'the month widget renders' );

$m = dcc_render( 'month' );
check( strlen( $m['html'] ) > 5000, 'it produces substantial markup', strlen( $m['html'] ) . ' bytes' );
check_contains( $m['html'], 'dccwl-root', 'the root class is present' );
check_contains( $m['html'], 'data-dccwl-group', 'the category tabs are server-rendered' );
check_same( 7, substr_count( $m['html'], 'data-dccwl-group="' ), 'seven group-bearing nodes: four tabs and three grids' );
check_contains( $m['html'], Render::PEAK_TAB, 'the Peak Now tab is present' );

dcc_section( 'the canal hub renders and composes' );

$c = dcc_render( 'canal' );
check( strlen( $c['html'] ) > 5000, 'the hub produces substantial markup', strlen( $c['html'] ) . ' bytes' );
check_contains( $c['html'], 'data-dccwl-group', 'the hub carries the same tab contract' );
// The footnote row belongs to the month widget's guide, which the hub
// composes rather than duplicates — so it is asserted on the month output.
check_contains( $m['html'], 'dccwl-footnotes', 'the footnote row renders with the guide' );
check_lacks( $c['html'], 'dccwl-footnotes', 'the hub does not render a second footnote row of its own' );

dcc_section( 'no month or clock is baked into server HTML' );

// The cache doctrine: three cache layers mean a month baked at render time
// would be served into the following month. The client computes it in canal
// time instead, so the current month name must not appear in the markup.
$month_now = gmdate( 'F' );
foreach ( [ 'month' => $m, 'canal' => $c ] as $name => $out ) {
	check_lacks( $out['html'], '"' . $month_now . '"', "the $name markup does not bake the current month as a value" );
	check( 1 !== preg_match( '/data-dccwl-(now|today|current-month)=/', $out['html'] ), "the $name markup carries no server-stamped now" );
}

dcc_section( 'the countdown is retired, and says so consistently' );

$possible = ( new ReflectionMethod( Render::class, 'countdown_possible' ) )->invoke( null );
check_same( false, $possible, 'countdown_possible() is hard-false — the feature is retired' );
check_lacks( $m['html'], 'dccwl-countdown', 'no countdown markup reaches the page' );

dcc_section( 'the inline config' );

check( '' !== $m['config'], 'the month widget emits an inline config' );
check_contains( $m['config'], '"i18n"', 'the config carries the i18n table the scripts read' );

// Every key the scripts actually read must exist, or a fallback English
// literal ships instead of the translated string.
$json = null;
if ( preg_match( '/=\s*(\{.*\})\s*;?\s*$/s', $m['config'], $mm ) ) {
	$json = json_decode( $mm[1], true );
}
check( is_array( $json ), 'the inline config is valid JSON' );
if ( is_array( $json ) ) {
	check( isset( $json['i18n'] ) && is_array( $json['i18n'] ), 'i18n is an object' );
	check( count( $json['i18n'] ) > 20, 'the i18n table is populated', 'keys: ' . count( $json['i18n'] ?? [] ) );
	// Some i18n entries are nested tables (month names, for instance), so
	// only the scalar leaves are checked for emptiness.
	$blank = [];
	array_walk_recursive(
		$json['i18n'],
		static function ( $v, $k ) use ( &$blank ): void {
			if ( is_scalar( $v ) && '' === trim( (string) $v ) ) { $blank[] = (string) $k; }
		}
	);
	check_same( [], $blank, 'no i18n string is blank', implode( ', ', $blank ) );
}

dcc_section( 'assets are enqueued only when something renders' );

dccwl_test_reset();
check_same( [], $GLOBALS['dccwl_test']['enqueued'], 'nothing is enqueued before a widget renders' );
dcc_render( 'month' );
check( in_array( 'dcc-wildlife', $GLOBALS['dccwl_test']['enqueued'], true ), 'rendering enqueues the widget bundle' );

dcc_section( 'escaping' );

// A stored title must not be able to open a tag. This is the one place a
// person-supplied string reaches server HTML.
dccwl_test_reset();
ob_start();
$evil = Render::shortcode( [ 'title' => '"><script>alert(1)</script>' ] );
$evil = (string) ob_get_clean() . $evil;
check_lacks( $evil, '<script>alert(1)', 'a script injected through a shortcode attribute is escaped' );

dcc_done();
