<?php
/**
 * 1.48.0 — THE IRWIN AUDIT FIX RELEASE: what the server renders.
 *
 * The browser half is ui-1480.mjs. This half pins the markup and the rules
 * that make it work, each written so the mutation recorded in CLAUDE.md §49
 * turns it red.
 */

// phpcs:disable

require __DIR__ . '/lib.php';
$root = dcc_boot_plugin();

use DCC_WL\Guide_Page;
use DCC_WL\Render;
use DCC_WL\Water_Data;
use DCC_WL\Water_Fact;
use DCC_WL\Water_Live;
use DCC_WL\Water_Render;

$css = [];
foreach ( [ 'app', 'widget', 'water', 'canal', 'guide' ] as $f ) {
	$css[ $f ] = (string) file_get_contents( $root . "/assets/css/$f.css" );
}

/* ====================================================================== */
dcc_section( '6. the Fishing tab links FWC\'s limits once and restates none' );

$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = array_merge(
	Water_Data::defaults(),
	[ 'live_enabled' => 1, 'map_enabled' => 1, 'fishing_enabled' => 1 ]
);
dcc_reset_once_guards();
$water = Water_Render::shortcode( [] );
$fish  = Water_Data::default_fishing();

check_lacks( $water, 'dccwl-fishing-reglist', 'the keep-limits table is gone' );
check_lacks( $water, 'per day', 'and no bag limit is restated anywhere in the panel' );
check( ! isset( $fish['regs'] ) && ! isset( $fish['regs_verified'] ), 'nor kept in the data, where it could go stale unseen' );
check_same( 1, substr_count( $water, 'href="' . $fish['regs_url'] . '"' ), 'FWC\'s current limits are linked exactly once' );
check_matches( $water, '/<a class="dccwl-fishing-limits-link"[^>]*>Current Limits on FWC <span aria-hidden="true">&#8599;<\/span><\/a>/',
	'as "Current Limits on FWC ↗", the arrow hidden from screen readers' );
check_lacks( strtolower( $water ), 'veteran', 'no "veteran-guide reports" credit — no published source could be named' );
check_lacks( strtolower( (string) $fish['source'] ), 'veteran', 'and none in the data either' );
check_contains( (string) $fish['source'], 'Season lines marked (FWC) are from FWC', 'FWC is credited only for the lines that say (FWC)' );
check_contains( $water, 'FWC Licenses', 'the license line and its link stay' );

/* ====================================================================== */
dcc_section( '7. text rules: balance travels with centring; prose is left' );

$bad_center = [];
$bad_left   = [];
foreach ( $css as $f => $src ) {
	$plain = (string) preg_replace( '#/\*.*?\*/#s', '', $src );
	preg_match_all( '/([^{}]+)\{([^{}]*)\}/', $plain, $m, PREG_SET_ORDER );
	foreach ( $m as $rule ) {
		$sel  = trim( preg_replace( '/\s+/', ' ', $rule[1] ) );
		$body = $rule[2];
		if ( preg_match( '/text-align:\s*center\s*;/', $body ) && ! preg_match( '/text-wrap:\s*balance/', $body ) ) {
			$bad_center[] = "$f: $sel";
		}
		if ( preg_match( '/text-align:\s*(left|start)\s*;/', $body ) && ! preg_match( '/text-wrap:\s*wrap/', $body ) ) {
			$bad_left[] = "$f: $sel";
		}
	}
}
check_same( [], $bad_center, 'every rule that centres text also balances it' );
check_same( [], $bad_left, 'every rule that aligns text left also wraps it as ordinary text' );
check_matches( $css['app'], '/\.dccwl-app \.dccwl-prose\.dccwl-prose,\s*\.dccwl-sheet \.dccwl-prose\.dccwl-prose \{\s*text-align: left;\s*text-wrap: wrap;/',
	'the multi-sentence exception is left-aligned and wraps normally' );

check( ! Render::is_prose( 'One sentence only.' ), 'one sentence is not prose' );
check( ! Render::is_prose( 'Waning Crescent · 22%' ), 'nor is a label' );
check( Render::is_prose( 'Two sentences. Here is the second.' ), 'two sentences are' );
check( Render::is_prose( 'It said “stop.” Then it went.' ), 'a sentence ending inside a closing quote still counts' );
check_contains( $water, 'class="dccwl-fishing-intro dccwl-prose"', 'the two-sentence fishing intro is marked prose' );
check_matches( $water, '/<p class="dccwl-fishing-season-name">/', 'a season name is not' );

/* ====================================================================== */
dcc_section( '7. one search wording, in Title Case, on both pages' );

dcc_reset_once_guards();
$month = Render::shortcode( [] );
dcc_reset_once_guards();
$guide = Guide_Page::shortcode( [] );
check_matches( $month, '/placeholder="Search \d+ Species"/', '/explore/: "Search N Species"' );
check_matches( $guide, '/placeholder="Search \d+ Species"/', 'the guide page: the same words' );
check_lacks( $guide, 'Species Seen Here', 'not "Search N Species Seen Here"' );

/* ====================================================================== */
dcc_section( '3, 9. the guide page markup' );

check_contains( $guide, 'data-dccwl-gp-list data-gp-scope="here" data-gp-group="all"', 'the list says which view is on' );
check_matches( $guide, '/<style id="dccwl-gp-filter">[^<]*\[data-gp-group="birds"\]>\.dccwl-gp-item:not\(\[data-group="birds"\]\)/',
	'and a rule per pill hides the rest, so a pill is one write' );
check_contains( $css['guide'], '.dccwl-gp .dccwl-gp-list[data-gp-scope="here"] > .dccwl-gp-item[data-scope="wider"] { display: none; }',
	'Seen Here hides Wider Florida by the list\'s own attribute' );
check_same( 0, preg_match_all( '/<li class="dccwl-gp-item[^>]*\shidden[\s>]/', $guide ), 'no row ships `hidden` any more' );

preg_match_all( '/<img\b[^>]*>/', $guide, $imgs );
$no_lazy = array_filter( $imgs[0], static fn( $t ) => false !== strpos( $t, 'data-no-lazy="1"' ) );
check_same( count( $imgs[0] ), count( $no_lazy ), 'every <img> the guide page prints carries data-no-lazy="1" (' . count( $imgs[0] ) . ')' );
preg_match_all( '/<img class="dccwl-gp-thumb"[^>]*>/', $guide, $thumbs );
check_same( count( $thumbs[0] ), count( array_filter( $thumbs[0], static fn( $t ) => false !== strpos( $t, 'width="168" height="168"' ) ) ),
	'every 56px thumbnail asks for 168 x 168, its size on a 3x screen' );
check_matches( $css['guide'], '/\.dccwl-gp \.dccwl-gp-thumb \{[^}]*height: 56px;[^}]*width: 56px;/', 'and is still drawn at 56px' );

/* ====================================================================== */
dcc_section( '1, 2. the map reservation and the widget width' );

check_matches( $css['water'], '/\.dccwl-map-inline:empty,\s*\.dccwl-map-inline\[data-dccwl-map-wait\] \{ min-height: var\(--dccwl-map-reserve\); \}/',
	'the map host keeps its reservation while it waits, not only while empty' );
check_matches( $css['water'], '/--dccwl-map-reserve: calc\(var\(--dccwl-map-h\) \+ var\(--dccwl-map-chrome\)\)/', 'and the reservation is the canvas PLUS its bar, legend and chips' );
foreach ( [ 'dccwl_canal', 'dccwl_month', 'dccwl_water', 'dccwl_countdown' ] as $w ) {
	check_contains( $css['app'], ".elementor-widget-$w", "the $w widget takes its column's width" );
}

/* ====================================================================== */
dcc_section( '8. wording: Issued, the depth map in About, the tense age, Title Case chips' );

check_same( 30, Water_Render::TENSE_DAYS, 'the tense age is 30 days' );
$f = Water_Fact::make( [
	'label' => 'Water Clarity (Secchi Depth)', 'value' => '1.6 m — clearer than usual here',
	'value_past' => '1.6 m — was clearer than usual here', 'tier' => Water_Fact::TIER_PUBLISHED,
	'source_name' => 'Lake County Water Atlas', 'date' => '2026-07-01',
] );
check_same( '1.6 m — was clearer than usual here', $f ? $f->to_array()['valuePast'] : null, 'a fact carries its past-tense value to the browser' );
check( null === Water_Fact::make( [ 'label' => 'X', 'value' => 'Y', 'value_past' => 'Z', 'tier' => Water_Fact::TIER_PUBLISHED, 'date' => '2026-07-01' ] ),
	'and value_past is metadata, never a way past the gate (no source, no fact)' );

$GLOBALS['dccwl_test']['http']['wateratlas'] = [
	'code' => 200,
	'body' => wp_json_encode( [ 'payload' => [ [
		'displayName' => 'Secchi Depth', 'value' => 1.60, 'units' => 'm', 'precision' => 2,
		'sampleDate' => gmdate( 'Y-m-d', time() - 86400 * 90 ), 'stationId' => 'T', 'latitude' => 28.8, 'longitude' => -81.67,
		'historic' => [ 'medValue' => 1.0, 'numSamples' => 120 ],
	] ] ] ),
];
$GLOBALS['dccwl_test']['transients'] = [];
$cond    = Water_Live::conditions();
$clarity = null;
foreach ( (array) ( $cond['facts'] ?? [] ) as $row ) {
	if ( 'clarity' === ( $row['key'] ?? '' ) ) { $clarity = $row; }
}
check( null !== $clarity, 'the clarity reading arrives' );
check_matches( (string) ( $clarity['value'] ?? '' ), '/clearer than usual here$/', 'its present-tense sentence' );
check_matches( (string) ( $clarity['valuePast'] ?? '' ), '/ — was clearer than usual here$/', 'and its past-tense one, written by the same builder' );

$src = (string) file_get_contents( $root . '/includes/class-water-live.php' );
foreach ( [ "'SJRWMD Station'", "'USGS Rain Gauge (Site %s)'", "'National Weather Service Forecast'", "'NWS Forecast'", "'%s — Open the Depth Map (PDF)'", "'%1\$s, Station %2\$s — via the Lake County Water Atlas'" ] as $s ) {
	check_contains( $src, $s, "source chip in Title Case: $s" );
}
check_contains( $src, "'key'            => 'depth'", 'the depth map is keyed, so the browser can put it in About' );
check_contains( $src, "__( 'was clearer than usual for this water', 'dcc-wildlife' )", 'the chain lakes\' clarity rows have a past tense too' );
check_matches( $src, "/'value_past'  => sprintf\(\s*\/\* translators: 1: current reading, 2: verdict, 3: this water's median. \*\/\s*__\( '%1\\\$s — %2\\\$s \(its median is %3\\\$s\)'/", 'built from the same format string as the present tense' );
check_matches( $water, '/<div class="dccwl-water-about" data-dccwl-about-block[^>]*>.*?<ul class="dccwl-cards dccwl-water-facts" data-dccwl-about-live hidden><\/ul>/s',
	'and About has a list waiting for it' );

/* The seeded Surface Area row's source chip, on a site that stored it. */
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = array_merge( Water_Data::defaults(), [
	'almanac' => [ array_merge( Water_Data::default_almanac()[0], [ 'source_name' => 'Lake County Water Atlas — Lake Dora (WBID 2831B), retrieved' ] ),
		[ 'waterbody' => 'Lake Yale', 'label' => 'Depth', 'value' => '1', 'tier' => 'published', 'source_name' => 'Somebody, retrieved', 'date' => '2026-01-01', 'section' => 'about' ] ],
] );
Water_Data::upgrade();
$up = get_option( Water_Data::OPTION );
check_same( 'Lake County Water Atlas — Lake Dora (WBID 2831B), Retrieved', $up['almanac'][0]['source_name'] ?? null, 'the stored seeded row\'s source is repaired to Title Case on upgrade' );
check_same( 'Somebody, retrieved', $up['almanac'][1]['source_name'] ?? null, 'and a row the owner wrote is left exactly as he wrote it' );

$wjs = (string) file_get_contents( $root . '/assets/js/water.js' );
check_contains( $wjs, "i18n.issuedToday || 'Issued Today'", 'forecasts read "Issued", not "Measured"' );

$widget_js = (string) file_get_contents( $root . '/assets/js/widget.js' );
check_contains( $widget_js, "'\\u00a0\\u2192'", '"See The Full Entry" gets a real (no-break) space before its arrow' );

dcc_done();
