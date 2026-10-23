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
use DCC_WL\Guide_Page;
use DCC_WL\Canal_Render;
use DCC_WL\Water_Render;
use DCC_WL\Plugin;

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
		/* 1.38.0: the sideways chip row and the "Jump to a species…" list are
		 * both gone. What `show_subnav` gates now is the ONE picker pill, and
		 * the jump row is deleted rather than relaxed — the setting behind it
		 * is retired, so a page containing it would be a regression. */
		'the category picker'      => 'data-dccwl-pick',
		/* 'the compact toggle' => 'data-dccwl-view' RETIRED IN 1.44.0 with
		 * the switch itself. It is not replaced by a lenient version: there
		 * is one species list now, so there is no second view whose default
		 * could be reproduced. The chip row's own three controls are
		 * asserted in the display-gates section below. */
		'the badge key'            => 'data-dccwl-badges',
		'the month menu'           => 'data-dccwl-monthpick',
		/*
		 * 'the structured-data block' => 'application/ld+json' MOVED, not
		 * dropped (1.45.0, item 3). It is the GUIDE PAGE's now — 53 KB of
		 * ItemList that rode every /explore/ page view, on the page whose
		 * prose moved to /wildlife-guide/ in 1.43.0. The pair of assertions
		 * below says where it is and where it is not, which is a stronger
		 * statement than its old presence here was.
		 */
	] as $what => $needle
) {
	check_contains( $base['html'], $needle, "with nothing stored, $what still renders" );
}

/*
 * WHERE THE STRUCTURED DATA LIVES (1.45.0, item 3). Both halves, because
 * either one alone passes against a block that was simply deleted.
 */
check_lacks( $base['html'], 'application/ld+json',
	'the species JSON-LD is NOT on a widget page any more' );

dccwl_test_reset();
dcc_reset_once_guards();
$guide_page = Guide_Page::shortcode( [] );
check_contains( $guide_page, 'application/ld+json',
	'and IS on the guide page, which is the canonical page for these entities' );
check_contains( $guide_page, '"@type":"Taxon"',
	'as the same ItemList of Taxon nodes, not a new shape' );

/* The setting still governs it, where it now renders. */
dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Guide_Data::OPTION ] = [ 'show_jsonld' => 0 ];
dcc_reset_once_guards();
check_lacks( Guide_Page::shortcode( [] ), 'application/ld+json',
	'switching show_jsonld off removes it from the guide page too' );
dccwl_test_reset();
dcc_reset_once_guards();

// And the numbers the scripts read are the ones that used to be hard-coded.
preg_match( '/"set":\{(.*?)\}/', $base['config'], $m );
$set = json_decode( '{' . ( $m[1] ?? '' ) . '}', true );
check( is_array( $set ), 'the config carries the tunables' );
check_same( 2, $set['spotlightMin'] ?? null, 'spotlightMin defaults to the 2 that was hard-coded' );
check_same( 3, $set['peakScore'] ?? null, 'peakScore defaults to the 3 that was hard-coded' );
check_same( 3, $set['searchSquash'] ?? null, 'searchSquash defaults to the 3 that was hard-coded' );
check_same( 3, $set['deckRows'] ?? null, 'deckRows defaults to the 3 that was hard-coded' );
/* `defaultView` left the config with the Compact switch (1.44.0). Asserted
 * as an ABSENCE instead, because a key still being sent would mean something
 * is still reading it — which is the shape of defect this file exists to
 * catch (1.32.1: two settings that were carried and not wired). */
check_same( null, $set['defaultView'] ?? null, 'defaultView is no longer sent — nothing reads it' );

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
	'show_subnav'    => 'data-dccwl-pick',
	/*
	 * `show_jsonld` left this table in 1.45.0: it no longer gates anything
	 * Render::render() emits, so asserting it here would be asserting that
	 * removing a block that is not there removes nothing. It is checked
	 * above, on the page that does emit it.
	 */
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

// The pill off means no container at all — an empty one would hold a margin
// open for nothing. It was three parts until 1.38.0 and two until 1.44.0,
// when the Compact switch went; the pill is the whole of it now.
$none = dcc_month( [], [ 'show_subnav' => 0 ] );
check_lacks( $none['html'], 'data-dccwl-subnav', 'with the pill off the sub-navigation container is gone too' );
/* AND THE CHIP ROW SURVIVES IT. The row holds Month and the badge key as
 * well, and both are governed by other things — so switching the category
 * pill off must not take the month filter with it. This is the 1.38.1 shape
 * (a count beside a category is a promise) applied to a container: a row
 * that vanished would silently remove two controls nobody turned off. */
check_contains( $none['html'], 'data-dccwl-chiprow', 'the chip row itself stays' );
check_contains( $none['html'], 'data-dccwl-monthpick', 'and keeps the Month menu' );
check_contains( $none['html'], 'data-dccwl-badges', 'and the badge key' );

dcc_section( 'numeric settings reach the scripts' );

$tuned = dcc_month( [], [ 'spotlight_min' => 1, 'peak_score' => 2, 'search_squash_min' => 5, 'deck_rows' => 2 ] );
preg_match( '/"set":\{(.*?)\}/', $tuned['config'], $m2 );
$set2 = json_decode( '{' . ( $m2[1] ?? '' ) . '}', true );
check_same( 1, $set2['spotlightMin'] ?? null, 'a changed spotlight threshold is sent' );
check_same( 2, $set2['peakScore'] ?? null, 'a changed peak score is sent' );
check_same( 5, $set2['searchSquash'] ?? null, 'a changed loose-match minimum is sent' );
check_same( 2, $set2['deckRows'] ?? null, 'a changed row count is sent' );

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
check_lacks( $a, 'data-dccwl-pick', 'the widget that overrode loses its picker' );
check_contains( $b, 'data-dccwl-pick', 'the widget beside it keeps it' );

// Per-root numbers land on the root element, not in the shared config.
/* `view_override` went with the Compact switch, so the row count is the one
 * per-placement number the month widget still has. The CLAIM is unchanged
 * and is the whole reason this pattern exists: a per-placement value rides
 * the ROOT element, never the shared config, because DCC_WL_CFG is emitted
 * once per page and a value in it could not differ between two widgets. */
$root_ov = dcc_month( [ 'rows_override' => 2 ] );
check_contains( $root_ov['html'], 'deckRows', 'a per-placement row count rides the root element' );
preg_match( '/"set":\{(.*?)\}/', $root_ov['config'], $m3 );
$shared = json_decode( '{' . ( $m3[1] ?? '' ) . '}', true );
check_same( 3, $shared['deckRows'] ?? null, 'and the SHARED config still carries the site-wide value' );
check_same( 2, json_decode( (string) ( preg_match( '/data-dccwl="([^"]*)"/', $root_ov['html'], $m4 ) ? html_entity_decode( $m4[1] ) : '{}' ), true )['set']['deckRows'] ?? null,
	'which is what lets two placements differ on one page' );

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
/* ZERO IS A REAL VALUE, NOT AN ABSENCE, and it needs a key whose schema
 * minimum IS zero to prove it. That used to be `hub_preview_max` ("name none
 * of them" was a real choice); it is retired with the hub, so the assertion
 * moved to `sticky_offset`, where 0 means "work it out from the page" — also
 * a real choice, and the same distinction. The resolver is what is under
 * test, not the key. (`resolve_enum` went with `default_view`; the header
 * comment on Guide_Data says why, and why the sanitiser's enum arm stayed.) */
check_same( 0, Guide_Data::resolve_num( 0, 'sticky_offset' ), 'zero is a real value, not an absence' );

dcc_section( 'the thresholds are wired, not merely carried' );

/*
 * 1.32.0 sent spotlight_min and peak_score to the browser and then left the
 * literals in place, so the settings page described behaviour the code did not
 * have. A source lint is the right shape of test for that: the numbers are
 * compared against a threshold in several places, and any ONE of them left
 * behind reintroduces the contradiction.
 */
$js_files = [ 'widget.js', 'canal.js' ];
$literals = [];
foreach ( $js_files as $file ) {
	$src = (string) file_get_contents( dirname( __DIR__, 2 ) . '/assets/js/' . $file );
	foreach ( explode( "\n", $src ) as $n => $line ) {
		// A bare comparison against 2 or 3 in a likelihood context. `length >=`
		// is the search's own minimum and is a different number entirely.
		if ( 1 === preg_match( '/>=\s*[23]\b/', $line ) && 1 !== preg_match( '/length\s*>=/', $line ) ) {
			$literals[] = $file . ':' . ( $n + 1 ) . ' ' . trim( $line );
		}
	}
}
check_same( [], $literals, 'no script compares a likelihood against a hard-coded 2 or 3', implode( ' | ', array_slice( $literals, 0, 4 ) ) );

// And the constants are actually consulted where the counting happens.
$widget = (string) file_get_contents( dirname( __DIR__, 2 ) . '/assets/js/widget.js' );
check( substr_count( $widget, 'PEAK_SCORE' ) >= 6, 'PEAK_SCORE is read in at least six places', 'found ' . substr_count( $widget, 'PEAK_SCORE' ) );
check( substr_count( $widget, 'SPOTLIGHT_MIN' ) >= 2, 'SPOTLIGHT_MIN is read where the spotlight is chosen' );

/*
 * THE HUB NO LONGER COUNTS ANYTHING, so the two assertions that used to be
 * here are retired rather than re-pointed.
 *
 * They guarded the 1.32.1 defect: canal.js hard-coded its own 2 and 3 for
 * the hub tile's "N worth looking for" line while widget.js read the
 * settings, so the tile and the panel header it opened would have disagreed
 * the moment anyone changed either threshold. Rob removed the hub tiles and
 * the month tiles, `monthCounts()` went with them, and canal.js now reads no
 * threshold at all — there is no second counter left to diverge.
 *
 * The claim that still matters is the one above, which is stronger anyway:
 * NO script anywhere compares a likelihood against a hard-coded 2 or 3, and
 * widget.js — the one remaining counter — reads PEAK_SCORE in at least six
 * places and SPOTLIGHT_MIN where the spotlight is chosen.
 */
$canal = (string) file_get_contents( dirname( __DIR__, 2 ) . '/assets/js/canal.js' );
check_lacks( $canal, 'spotlightMin', 'canal.js reads no threshold — it counts nothing now' );
check_lacks( $canal, 'peakScore', 'nor the peak score, so no second counter can diverge' );

dcc_section( 'the retired countdown preference is not destroyed on save' );

/*
 * wp-admin/options.php walks every option REGISTERED to the group and calls
 * update_option($name, null) for any absent from POST. 1.32.0 still registered
 * dcc_wl_countdown_enabled after removing its field, so every Save ran null
 * through a sanitiser that returns 0 for empty — zeroing the very preference
 * the page promises to keep. This simulates that walk.
 */
dccwl_test_reset();
\DCC_WL\Water_Admin::register();
$registered = [];
foreach ( $GLOBALS['dccwl_test']['settings'] as [ $group, $name, $args ] ) {
	$registered[ $name ] = $args;
}
check( ! isset( $registered['dcc_wl_countdown_enabled'] ), 'the countdown option is no longer registered to the settings group' );
check_same( [ 'dcc_wl_guide', 'dcc_wl_water' ], array_values( array_diff( array_keys( $registered ), [] ) ), 'exactly two options are registered, and both have a field on the page' );

// Now the walk itself, over whatever IS registered, with an empty POST.
$GLOBALS['dccwl_test']['options']['dcc_wl_countdown_enabled'] = 1;
foreach ( $registered as $name => $args ) {
	$cb    = $args['sanitize_callback'] ?? null;
	$value = is_callable( $cb ) ? $cb( null ) : null;
	update_option( $name, $value );
}
check_same( 1, get_option( 'dcc_wl_countdown_enabled' ), 'a Save with nothing posted leaves the stored preference at 1' );

// Belt and braces: had it still been registered, this is what would have happened.
$doomed = static fn( $v ): int => empty( $v ) ? 0 : 1;
check_same( 0, $doomed( null ), 'because the old sanitiser really did turn an absent value into 0' );

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
