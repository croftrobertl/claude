<?php
/**
 * Guide settings: every one changes something, and only its own thing.
 *
 * The promise this suite holds to account is "defaults reproduce 1.31.0
 * exactly". A settings page that quietly alters behaviour on upgrade is worse
 * than no settings page, because the change arrives without anyone asking for
 * it. So the first section renders with nothing stored and checks the output
 * still carries everything it used to.
 *
 * The second promise is that a per-placement override changes ITS widget and no
 * other. That one is checked by rendering two widgets and diffing.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();

use DCC_WL\Guide_Data;
use DCC_WL\Water_Data;
use DCC_WL\Render;
use DCC_WL\Canal_Render;
use DCC_WL\Water_Render;
use DCC_WL\Plugin;

/**
 * Clear every once-per-page guard on the renderers.
 *
 * Discovered by reflection rather than listed by hand: a hand-kept list is how
 * this suite first reported that switching the search off also removed the
 * structured-data block. It had not — the JSON-LD guard simply had not been
 * reset between renders, and the list did not know about it.
 */
function dcc_reset_once_guards(): void {
	foreach ( [ Render::class, Canal_Render::class ] as $class ) {
		foreach ( ( new \ReflectionClass( $class ) )->getProperties( \ReflectionProperty::IS_STATIC ) as $prop ) {
			$prop->setAccessible( true );
			if ( is_bool( $prop->getValue() ) ) {
				$prop->setValue( null, false );
			}
		}
	}
}

/** Render the month widget fresh, returning HTML plus the inline config. */
function dcc_month( array $opts = [], array $stored = [] ): array {
	dccwl_test_reset();
	if ( $stored ) {
		$GLOBALS['dccwl_test']['options'][ Guide_Data::OPTION ] = $stored;
	}
	dcc_reset_once_guards();
	ob_start();
	$html   = Render::render( $opts );
	$echoed = (string) ob_get_clean();
	$config = '';
	foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
		$config .= (string) $data . "\n";
	}
	return [ 'html' => $echoed . $html, 'config' => $config ];
}

dcc_section( 'nothing stored reproduces the old behaviour' );

$base = dcc_month();

// Everything 1.31.0 rendered by default must still be here.
foreach (
	[
		'the spotlight band'       => 'dccwl-spotlight-tiles',
		'the search row'           => 'data-dccwl-search ',
		'the flag key'             => 'dccwl-legend',
		'the footnote row'         => 'dccwl-footnotes',
		'the sub-group chips'      => 'data-dccwl-subchips',
		'the jump select'          => 'data-dccwl-jump',
		'the compact toggle'       => 'data-dccwl-view',
		'the structured-data block' => 'application/ld+json',
	] as $what => $needle
) {
	check_contains( $base['html'], $needle, "with nothing stored, $what still renders" );
}

// And the numbers the scripts read are the ones that used to be hard-coded.
preg_match( '/"set":\{(.*?)\}/', $base['config'], $m );
$set = json_decode( '{' . ( $m[1] ?? '' ) . '}', true );
check( is_array( $set ), 'the config carries the tunables' );
check_same( 2, $set['spotlightMin'] ?? null, 'spotlightMin defaults to the 2 that was hard-coded' );
check_same( 3, $set['peakScore'] ?? null, 'peakScore defaults to the 3 that was hard-coded' );
check_same( 3, $set['searchSquash'] ?? null, 'searchSquash defaults to the 3 that was hard-coded' );
check_same( 3, $set['deckRows'] ?? null, 'deckRows defaults to the 3 that was hard-coded' );
check_same( 'deck', $set['defaultView'] ?? null, 'the list still opens on the photo cards' );

// An untouched widget must put NOTHING per-placement on its root.
check_lacks( $base['html'], '&quot;set&quot;', 'an untouched widget writes no per-placement values onto its root' );

// The hub's per-placement channel, with nothing in it. Measured against
// 1.31.0's output, this five-byte attribute is the ONLY non-whitespace change
// the whole settings round makes to a default page — worth pinning, so a future
// change that starts writing values here is a visible decision.
dccwl_test_reset();
dcc_reset_once_guards();
$hub = Canal_Render::shortcode( [] );
check_contains( $hub, 'data-dccwl-canal="{}"', 'an untouched hub carries an EMPTY per-placement object' );
check_lacks( $hub, 'data-dccwl-canal="[]"', 'encoded as an object, not an array — the script reads named keys off it' );

dcc_section( 'every display setting actually changes the output' );

$gates = [
	'show_spotlight' => 'dccwl-spotlight-tiles',
	'show_search'    => 'data-dccwl-search ',
	'show_subnav'    => 'data-dccwl-subchips',
	'show_jump'      => 'data-dccwl-jump',
	'show_compact'   => 'data-dccwl-view',
	'show_jsonld'    => 'application/ld+json',
];
foreach ( $gates as $key => $needle ) {
	$off = dcc_month( [], [ $key => 0 ] );
	check_lacks( $off['html'], $needle, "switching $key off removes it from the page" );
	// And removes NOTHING else: the other markers must all survive.
	$collateral = [];
	foreach ( $gates as $other => $other_needle ) {
		if ( $other === $key ) { continue; }
		if ( ! str_contains( $off['html'], $other_needle ) ) { $collateral[] = $other; }
	}
	check_same( [], $collateral, "switching $key off leaves everything else alone", implode( ', ', $collateral ) );
}

// All three sub-navigation parts off means no container at all — an empty one
// would hold a margin open for nothing.
$none = dcc_month( [], [ 'show_subnav' => 0, 'show_jump' => 0, 'show_compact' => 0 ] );
check_lacks( $none['html'], 'data-dccwl-subnav', 'with all three off the sub-navigation container is gone too' );

dcc_section( 'numeric settings reach the scripts' );

$tuned = dcc_month( [], [ 'spotlight_min' => 1, 'peak_score' => 2, 'search_squash_min' => 5, 'deck_rows' => 2, 'default_view' => 'compact' ] );
preg_match( '/"set":\{(.*?)\}/', $tuned['config'], $m2 );
$set2 = json_decode( '{' . ( $m2[1] ?? '' ) . '}', true );
check_same( 1, $set2['spotlightMin'] ?? null, 'a changed spotlight threshold is sent' );
check_same( 2, $set2['peakScore'] ?? null, 'a changed peak score is sent' );
check_same( 5, $set2['searchSquash'] ?? null, 'a changed loose-match minimum is sent' );
check_same( 2, $set2['deckRows'] ?? null, 'a changed row count is sent' );
check_same( 'compact', $set2['defaultView'] ?? null, 'a changed opening view is sent' );

dcc_section( 'a per-placement override beats the setting, and only for that placement' );

// The setting says show; this placement says hide.
$one = dcc_month( [ 'search' => false ] );
check_lacks( $one['html'], 'data-dccwl-search ', 'a placement can hide something the setting shows' );

// The setting says hide; this placement says show.
$two = dcc_month( [ 'search' => true ], [ 'show_search' => 0 ] );
check_contains( $two['html'], 'data-dccwl-search ', 'and can show something the setting hides' );

// Two widgets, one page: the override must not leak.
dccwl_test_reset();
dcc_reset_once_guards();
ob_start();
$a = Render::render( [ 'subnav' => 'off' ] );
$b = Render::render( [] );
ob_end_clean();
check_lacks( $a, 'data-dccwl-subchips', 'the widget that overrode loses its chips' );
check_contains( $b, 'data-dccwl-subchips', 'the widget beside it keeps them' );

// Per-root numbers land on the root element, not in the shared config.
$root_ov = dcc_month( [ 'rows_override' => 2, 'view_override' => 'compact' ] );
check_contains( $root_ov['html'], 'deckRows', 'a per-placement row count rides the root element' );
check_contains( $root_ov['html'], 'compact', 'so does a per-placement opening view' );
preg_match( '/"set":\{(.*?)\}/', $root_ov['config'], $m3 );
$shared = json_decode( '{' . ( $m3[1] ?? '' ) . '}', true );
check_same( 3, $shared['deckRows'] ?? null, 'and the SHARED config still carries the site-wide value' );
check_same( 'deck', $shared['defaultView'] ?? null, 'which is what lets two placements differ on one page' );

dcc_section( 'the resolver' );

dccwl_test_reset();
check_same( true, Guide_Data::resolve( '', 'show_search' ), 'empty inherits a setting that is on' );
check_same( true, Guide_Data::resolve( null, 'show_search' ), 'so does null' );
check_same( false, Guide_Data::resolve( 'off', 'show_search' ), '"off" hides regardless' );
$GLOBALS['dccwl_test']['options'][ Guide_Data::OPTION ] = [ 'show_search' => 0 ];
check_same( false, Guide_Data::resolve( '', 'show_search' ), 'empty inherits a setting that is off' );
check_same( true, Guide_Data::resolve( 'on', 'show_search' ), '"on" shows regardless' );

dccwl_test_reset();
check_same( true, Guide_Data::resolve_hide( '', true ), 'a hide-only override left alone keeps the capability answer' );
check_same( false, Guide_Data::resolve_hide( '', false ), 'including when that answer is no' );
check_same( false, Guide_Data::resolve_hide( 'off', true ), 'and "off" hides a capable section' );
check_same( false, Guide_Data::resolve_hide( 'on', false ), '"on" CANNOT force an incapable section on' );

check_same( 3, Guide_Data::resolve_num( '', 'deck_rows' ), 'an empty number inherits' );
check_same( 3, Guide_Data::resolve_num( null, 'deck_rows' ), 'so does null' );
check_same( 2, Guide_Data::resolve_num( 2, 'deck_rows' ), 'a number is used' );
check_same( 4, Guide_Data::resolve_num( 99, 'deck_rows' ), 'and clamped to the schema maximum' );
check_same( 1, Guide_Data::resolve_num( -5, 'deck_rows' ), 'and to the minimum' );
check_same( 0, Guide_Data::resolve_num( 0, 'hub_preview_max' ), 'zero is a real value, not an absence' );
check_same( 'deck', Guide_Data::resolve_enum( 'nonsense', 'default_view' ), 'an unknown enum falls back to the setting' );
check_same( 'compact', Guide_Data::resolve_enum( 'compact', 'default_view' ), 'a known one is used' );

dcc_section( 'the water module gates' );

dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = array_merge(
	Water_Data::defaults(),
	[ 'live_enabled' => 1, 'map_enabled' => 1, 'fishing_enabled' => 1 ]
);
$w_on = Water_Render::render( [] );
check_contains( $w_on, 'data-dccwl-moon', 'the moon card renders by default' );

$w_off = Water_Render::render( [ 'moon' => 'off' ] );
check_lacks( $w_off, 'data-dccwl-moon', 'a placement can hide the moon card' );

$GLOBALS['dccwl_test']['options'][ Guide_Data::OPTION ] = [ 'show_moon' => 0 ];
check_lacks( Water_Render::render( [] ), 'data-dccwl-moon', 'and the setting hides it everywhere' );
check_contains( Water_Render::render( [ 'moon' => 'on' ] ), 'data-dccwl-moon', 'while a placement can bring it back' );

dcc_section( 'the upgrade populates a row from an older version' );

dccwl_test_reset();
$plugin = ( new \ReflectionClass( Plugin::class ) )->newInstanceWithoutConstructor();
$GLOBALS['dccwl_test']['options']['dcc_wl_version'] = '1.31.0';
// A row from a version that had only some of these keys.
$GLOBALS['dccwl_test']['options'][ Guide_Data::OPTION ] = [ 'show_search' => 0, 'deck_rows' => 2 ];
$plugin->maybe_upgrade();

$after = get_option( Guide_Data::OPTION );
check( is_array( $after ), 'the row is still an array' );
check_same( count( Guide_Data::defaults() ), count( $after ), 'it now names every key' );
check_same( 0, $after['show_search'], 'a value the owner set is untouched' );
check_same( 2, $after['deck_rows'], 'and so is the other one' );
check_same( 1, $after['show_spotlight'], 'a key they never saw now reads its default from the row itself' );

// A fresh install must not acquire a row it does not need.
dccwl_test_reset();
$plugin->maybe_upgrade();
check_same( false, get_option( Guide_Data::OPTION ), 'a fresh install stores no guide row' );
check( is_array( Guide_Data::all() ), 'and still reads defaults perfectly well' );

dcc_section( 'no new orphan, and no photoBase' );

// Every option this plugin writes must be one uninstall.php removes, or
// 1.32.0 has replaced the orphan it just deleted with another.
$root      = dirname( __DIR__, 2 );
$uninstall = (string) file_get_contents( $root . '/uninstall.php' );
foreach ( [ 'dcc_wl_guide', 'dcc_wl_water', 'dcc_wl_version' ] as $opt ) {
	check_contains( $uninstall, "'" . $opt . "'", "uninstall.php removes $opt" );
}
check_contains( $uninstall, "'dcc_wl_settings'", 'and still removes the 1.2.0 orphan' );

$php = '';
foreach ( glob( $root . '/includes/*.php' ) as $f ) {
	$php .= (string) file_get_contents( $f );
}
preg_match_all( "/update_option\(\s*'([a-z_]+)'/", $php, $writes );
preg_match_all( "/OPTION\s*=\s*'([a-z_]+)'/", $php, $consts );
$written = array_unique( array_merge( $writes[1], $consts[1] ) );
$unremoved = [];
foreach ( $written as $opt ) {
	if ( ! str_contains( $uninstall, "'" . $opt . "'" ) ) { $unremoved[] = $opt; }
}
check_same( [], $unremoved, 'every option the plugin stores is removed on uninstall', implode( ', ', $unremoved ) );

check_lacks( $base['config'], 'photoBase', 'photoBase is gone from the config' );
check_lacks( $base['html'], 'photoBase', 'and from the markup' );
$js = '';
foreach ( glob( $root . '/assets/js/*.js' ) as $f ) {
	$js .= (string) file_get_contents( $f );
}
check_lacks( $js, 'photoBase', 'and no script mentions it either' );

dcc_done();
