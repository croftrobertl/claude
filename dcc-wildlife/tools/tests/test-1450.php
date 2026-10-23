<?php
/**
 * 1.45.0 — the Director's audit of 2026-10-22, the parts that live in PHP.
 *
 * Items covered here, each because the defect it fixes was INVISIBLE to the
 * existing suites: they all asked whether a reading renders correctly, and
 * every one of these is about what happens when a reading is MISSING, OLD or
 * NOT YET FETCHED.
 *
 *   1  the Now tab came up blank, and the blank was sent with a cache header
 *   2  how old a reading may be and still read as current
 *   3  the species index is not inlined where nothing shows it
 *  10  the Leaflet ?ver names Leaflet, and a stale backup option is dropped
 *  11  the sheet's link into the prose guide
 *
 * WHAT IS NOT HERE. The browser halves — the shimmer skeleton, the grey
 * stale card, the polite announcements, the chip that is not drawn for an
 * empty layer — are in ui-live.mjs and ui-mapbar.mjs, because a rendered
 * result is the only honest evidence for any of them.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
$root = dcc_boot_plugin();

use DCC_WL\Canal_Render;
use DCC_WL\Guide_Data;
use DCC_WL\Guide_Rest;
use DCC_WL\Render;
use DCC_WL\Species;
use DCC_WL\Water_Data;
use DCC_WL\Water_Live;
use DCC_WL\Water_Rest;

/** The water module on, with the live layer. */
function dcc_1450_enable( array $extra = [] ): void {
	$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = array_merge(
		Water_Data::defaults(),
		array_merge( [ 'live_enabled' => 1, 'map_enabled' => 1 ], $extra )
	);
}

/**
 * An Atlas response with a level, a Secchi and a dissolved-oxygen reading,
 * each dated $age days back. Built from the real envelope shape — wrapper
 * carries the name, payload carries the data (the 1.6.0 lesson) — because a
 * hand-written payload can only confirm what its author believed.
 */
function dcc_1450_atlas( int $age = 1 ): void {
	$when = gmdate( 'Y-m-d', time() - 86400 * $age );
	$GLOBALS['dccwl_test']['http']['wateratlas'] = [
		'code' => 200,
		'body' => wp_json_encode(
			[
				'payload' => [
					[
						'displayName' => 'Water Levels',
						'value'       => 61.0,
						'units'       => 'ft',
						'precision'   => 2,
						'sampleDate'  => $when,
						'stationId'   => 'TEST-LEVEL',
						'verticalDatum' => 'NAVD88',
						'latitude'    => 28.7992,
						'longitude'   => -81.6689,
						'historicAverageForMonth' => [ 'norm' => 61.5 ],
					],
					[
						'displayName' => 'Secchi Depth',
						'value'       => 1.10,
						'units'       => 'm',
						'precision'   => 2,
						'sampleDate'  => $when,
						'stationId'   => 'TEST-SECCHI',
						'latitude'    => 28.8003,
						'longitude'   => -81.6706,
						'historic'    => [ 'medValue' => 1.0, 'numSamples' => 120 ],
					],
					[
						'displayName' => 'Dissolved Oxygen',
						'value'       => 6.4,
						'units'       => 'mg/L',
						'precision'   => 1,
						'sampleDate'  => $when,
						'stationId'   => 'TEST-DO',
						'latitude'    => 28.8003,
						'longitude'   => -81.6706,
					],
				],
			]
		),
	];
}

/* ================================================================= 1 ====
 * THE NOW TAB MUST NOT COME UP BLANK.
 *
 * The live defect: `conditions()` returned an empty set whenever the
 * 15-minute transient had expired AND either the 30-second refresh lock or
 * the 5-minute failure marker was set. A guest arriving in that window got
 * no readings at all — and `Water_Rest` sent that emptiness with
 * `Cache-Control: max-age=120`, so the one visitor who hit the race was the
 * one guaranteed to keep seeing nothing.
 * ======================================================================= */
dcc_section( 'the conditions call keeps a last-good copy (item 1)' );

dccwl_test_reset();
dcc_1450_enable();
dcc_1450_atlas( 1 );

$fresh = Water_Live::conditions();
check( ! empty( $fresh['facts'] ), 'a first call fetches and returns readings', count( (array) $fresh['facts'] ) . ' facts' );
check( empty( $fresh['stale'] ), 'and they are not marked stale' );
check(
	is_array( $GLOBALS['dccwl_test']['options']['dcc_wl_water_cond_last'] ?? null ),
	'the payload is kept beyond the transient, in an option'
);

/* Now reproduce the live window exactly: the transient gone, the lock held
 * by another request. */
$GLOBALS['dccwl_test']['transients'] = [ 'dcc_wl_water_lock' => 1 ];
$locked = Water_Live::conditions();
check( ! empty( $locked['facts'] ), 'with the refresh lock held, the last good readings are served anyway',
	count( (array) $locked['facts'] ) . ' facts' );
check( ! empty( $locked['stale'] ), 'and they are MARKED stale, so nothing downstream has to guess' );
check_same(
	(string) $fresh['fetched'],
	(string) $locked['fetched'],
	'with the ORIGINAL fetch time, never rewritten to now'
);

/* And the same in the five-minute failure window. */
$GLOBALS['dccwl_test']['transients'] = [ 'dcc_wl_water_fail' => 1 ];
$failed = Water_Live::conditions();
check( ! empty( $failed['facts'] ), 'and in the failure window too' );
check( ! empty( $failed['stale'] ), 'also marked stale' );

/* A source that comes back with nothing must not overwrite the good copy. */
$GLOBALS['dccwl_test']['transients'] = [];
$GLOBALS['dccwl_test']['http']       = [];   // every fetch now fails
$dead = Water_Live::conditions();
check( ! empty( $dead['facts'] ), 'a failed refresh falls back to the copy rather than returning nothing' );
check(
	is_array( $GLOBALS['dccwl_test']['options']['dcc_wl_water_cond_last'] ?? null )
		&& ! empty( $GLOBALS['dccwl_test']['options']['dcc_wl_water_cond_last']['facts'] ),
	'and the copy still holds the readings — a bad pass never overwrites a good one'
);

/* With NO copy ever stored, the honest answer is still nothing. */
dccwl_test_reset();
dcc_1450_enable();
$GLOBALS['dccwl_test']['transients'] = [ 'dcc_wl_water_fail' => 1 ];
$never = Water_Live::conditions();
check_same( [], (array) $never['facts'], 'with nothing ever fetched, the answer is honestly empty' );
check( empty( $never['stale'] ), 'and not labelled stale, because there is nothing to label' );

dcc_section( 'and the cache header follows the answer (item 1)' );

dccwl_test_reset();
dcc_1450_enable();
dcc_1450_atlas( 1 );
$ok = Water_Rest::conditions();
check_same( 'public, max-age=120', $ok->headers['Cache-Control'] ?? '', 'real readings keep the two-minute window' );

$GLOBALS['dccwl_test']['transients'] = [ 'dcc_wl_water_lock' => 1 ];
$stale_res = Water_Rest::conditions();
check_same( 'public, max-age=30', $stale_res->headers['Cache-Control'] ?? '', 'the last-good copy gets thirty seconds' );
check( ! empty( $stale_res->get_data()['stale'] ), 'and says so in the payload' );

dccwl_test_reset();
dcc_1450_enable();
$GLOBALS['dccwl_test']['transients'] = [ 'dcc_wl_water_fail' => 1 ];
$empty_res = Water_Rest::conditions();
check_same( [], (array) ( $empty_res->get_data()['facts'] ?? [] ), 'nothing to send' );
check_same(
	'no-store, max-age=0',
	$empty_res->headers['Cache-Control'] ?? '',
	'AND AN EMPTY SET IS NEVER CACHED — the defect that made one guest keep seeing a blank'
);

dcc_section( 'the hourly warm job takes the conditions too (item 1)' );

dccwl_test_reset();
dcc_1450_enable();
dcc_1450_atlas( 1 );
Water_Live::warm_map();
check(
	is_array( get_transient( 'dcc_wl_water_cond' ) ),
	'warm_map() leaves the conditions transient warm, not just the map'
);
check(
	is_array( $GLOBALS['dccwl_test']['options']['dcc_wl_water_cond_last'] ?? null ),
	'and refreshes the last-good copy with it'
);

/* ================================================================= 2 ====
 * HOW OLD A READING MAY BE AND STILL READ AS CURRENT.
 *
 * The age itself is computed in the BROWSER — the payload is cached, so an
 * age worked out when the HTML was built would be wrong by however long the
 * page sat in a cache. What PHP owns is the three limits and the machine
 * names the client keys them on, and those are what this section pins.
 * ======================================================================= */
dcc_section( 'the age limits are settings, and they reach the client (item 2)' );

check_same( 14, Guide_Data::num( 'age_max_level' ), 'the level limit defaults to a fortnight' );
check_same( 120, Guide_Data::num( 'age_max_clarity' ), 'clarity to four months — it is a lab sample' );
check_same( 120, Guide_Data::num( 'age_max_oxygen' ), 'oxygen to the same, sampled on the same rounds' );

$schema = Guide_Data::schema();
foreach ( [ 'age_max_level', 'age_max_clarity', 'age_max_oxygen' ] as $k ) {
	check_same( 'int', $schema[ $k ]['type'] ?? '', "$k is validated as an integer" );
	check_same( 1, $schema[ $k ]['min'] ?? null, "$k cannot be set to zero, which would grey every card" );
}

/* Stored values must actually win — a setting that does nothing is the
 * defect 1.32.1 is named after. */
dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Guide_Data::OPTION ] = [ 'age_max_level' => 3 ];
check_same( 3, Guide_Data::num( 'age_max_level' ), 'a stored limit overrides the default' );

dccwl_test_reset();
dcc_1450_enable();
dcc_1450_atlas( 1 );
dcc_reset_once_guards();
\DCC_WL\Water_Render::render( [] );
$water_cfg = '';
foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
	if ( false !== strpos( (string) $data, 'DCC_WL_WATER' ) ) { $water_cfg = (string) $data; }
}
check( '' !== $water_cfg, 'the water config was printed' );
foreach ( [ '"level":14', '"clarity":120', '"oxygen":120' ] as $needle ) {
	check_contains( $water_cfg, $needle, "ageMax carries $needle" );
}
/* The freshness sentences and the month names, because the client cannot
 * invent either: a month formatted in the browser would be formatted in the
 * VISITOR's locale, which this module has refused since 1.40.0. */
foreach ( [ 'Measured Today', 'Measured %d Days Ago', 'Last Measured In %s', 'September' ] as $needle ) {
	check_contains( $water_cfg, $needle, "the client is given the words for \"$needle\"" );
}
/* ITEM 8's strings ride the same config. */
check_contains( $water_cfg, 'srLoading', 'and the polite announcements (item 8)' );

dcc_section( 'the oxygen card can be found by machine name (item 2)' );

dccwl_test_reset();
dcc_1450_enable();
dcc_1450_atlas( 1 );
$keys = [];
foreach ( (array) Water_Live::conditions()['facts'] as $f ) {
	$k = (string) ( $f['key'] ?? '' );
	if ( '' !== $k ) { $keys[ $k ] = true; }
}
foreach ( [ 'level', 'clarity', 'oxygen' ] as $k ) {
	check( isset( $keys[ $k ] ), "the $k reading carries key=$k, so its limit can find it without matching a translated label" );
}

/* ================================================================= 3 ====
 * THE SPECIES INDEX IS NOT INLINED WHERE NOTHING SHOWS IT.
 * ======================================================================= */
dcc_section( 'the index is deferred where the species panel starts hidden (item 3)' );

/** The inline config a render printed. */
function dcc_1450_cfg(): string {
	$out = '';
	foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
		if ( false !== strpos( (string) $data, 'DCC_WL_CFG' ) ) { $out = (string) $data; }
	}
	return $out;
}

dccwl_test_reset();
dcc_reset_once_guards();
$standalone = Render::render( [] );   // no water module: this IS the page
$cfg_inline = dcc_1450_cfg();
check_contains( $cfg_inline, '"indexDeferred":false', 'a standalone placement still inlines the index' );
check( strlen( $cfg_inline ) > 100000, 'and it really is in there', (string) strlen( $cfg_inline ) );

dccwl_test_reset();
dcc_1450_enable();
dcc_1450_atlas( 1 );
dcc_reset_once_guards();
$hub        = Canal_Render::shortcode( [] );
$cfg_hub    = dcc_1450_cfg();
check_contains( $cfg_hub, '"indexDeferred":true', 'the canal with a water panel defers it' );
check_contains( $cfg_hub, '"species":[]', 'and sends an EMPTY ARRAY, not an absent key — widget.js returns outright on a non-array' );
check( strlen( $cfg_hub ) < 30000, 'so the inline config is a fraction of its old size', (string) strlen( $cfg_hub ) );
/* The panel it decided from, and the condition are the same one. */
check_contains( $hub, 'data-dccwl-panel="species"', 'the species panel is still rendered' );
check_contains( $hub, 'dccwl-panel-species" data-dccwl-panel="species" tabindex="-1" hidden', 'and it starts hidden, which is why the index may wait' );

/*
 * WITH NO WATER PANEL THERE IS NOTHING HIDDEN, SO NOTHING MAY WAIT.
 *
 * The module has to be emptied, not merely switched off: with the live
 * layer off it still renders its seeded almanac and its links, which is the
 * 1.5.0 auto-hide working correctly. An empty almanac, no links and no
 * fishing block is the only state in which Water_Render returns '' — which
 * is the state this case is actually about.
 */
dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = array_merge(
	Water_Data::defaults(),
	[ 'live_enabled' => 0, 'map_enabled' => 0, 'almanac' => [], 'links' => [], 'reports' => [], 'fishing_enabled' => 0 ]
);
dcc_reset_once_guards();
$hub_dry = Canal_Render::shortcode( [] );
check_lacks( $hub_dry, 'dccwl-panel-water', 'the water panel really is absent in this case' );
check_contains( dcc_1450_cfg(), '"indexDeferred":false', 'with no water panel the species panel IS the page, so the index is inline' );
check( strlen( dcc_1450_cfg() ) > 100000, 'and the index is in the page, not waiting on a fetch nobody will trigger',
	(string) strlen( dcc_1450_cfg() ) );

dcc_section( 'and the deferred index is served whole, beside the detail (item 3)' );

dccwl_test_reset();
$payload = Guide_Rest::species()->get_data();
check( isset( $payload['index'] ) && is_array( $payload['index'] ), '/species carries the index' );
check( isset( $payload['species'] ) && is_array( $payload['species'] ), 'and still carries the detail half' );
check_same(
	count( Species::dataset() ),
	count( (array) $payload['index'] ),
	'every species is in the index it serves'
);
/*
 * THE FETCHED COPY AND THE INLINE COPY ARE THE SAME FUNCTION'S OUTPUT.
 * Asserted as an identity rather than by spot-checking fields: the failure
 * this guards against is the two drifting, and a field-by-field check only
 * ever covers the fields its author thought of.
 */
check_same(
	wp_json_encode( Species::wire_index() ),
	wp_json_encode( $payload['index'] ),
	'and it is the same wire_index() the inline copy is built from'
);
$first = (array) ( $payload['index'][0] ?? [] );
foreach ( [ 'id', 'name', 'months', 'src' ] as $k ) {
	check( array_key_exists( $k, $first ), "an index row still carries $k" );
}
check( ! array_key_exists( 'fact', $first ), 'and still does NOT carry the sheet-only half' );

/* ================================================================ 10 ====
 * THE SMALL ONES THAT ARE STILL REAL.
 * ======================================================================= */
dcc_section( 'the Leaflet asset URL names LEAFLET (item 10)' );

check_same( '1.9.4', Water_Data::LEAFLET_VER, 'the bundled version is stated' );
$defaults = Water_Data::defaults();
foreach ( [ 'map_leaflet_js', 'map_leaflet_css' ] as $k ) {
	check_contains( (string) $defaults[ $k ], '?ver=1.9.4', "$k asks for 1.9.4" );
	check( false === strpos( (string) $defaults[ $k ], DCC_WL_VERSION ), "$k no longer carries the PLUGIN version" );
}

/* The repair, for a site that stored the old form. EXACT PATH ONLY. */
dccwl_test_reset();
$ours = DCC_WL_URL . 'assets/vendor/leaflet/leaflet.js';
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = [
	'map_leaflet_js'  => $ours . '?ver=1.21.0',
	'map_leaflet_css' => 'https://example.org/leaflet.css?ver=1.21.0',
	'map_tile_url'    => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
];
Water_Data::upgrade();
$after = $GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ];
check_same( $ours . '?ver=1.9.4', (string) $after['map_leaflet_js'], 'a stored URL for OUR bundled file is repaired' );
check_same(
	'https://example.org/leaflet.css?ver=1.21.0',
	(string) $after['map_leaflet_css'],
	"and somebody else's URL is left completely alone"
);

dcc_section( 'the hand-made backup option is dropped (item 10)' );

dccwl_test_reset();
$GLOBALS['dccwl_test']['options']['dcc_wl_water_bak_20260903'] = [ 'live_enabled' => 1 ];
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ]        = [ 'live_enabled' => 1 ];
Water_Data::upgrade();
check(
	! array_key_exists( 'dcc_wl_water_bak_20260903', $GLOBALS['dccwl_test']['options'] ),
	'the 3 September copy of the settings row is deleted'
);
check(
	array_key_exists( Water_Data::OPTION, $GLOBALS['dccwl_test']['options'] ),
	'and the real settings row is not'
);

/* It must also run on a site that needs no other repair — the deletion is
 * deliberately outside the `$changed` block, and this is what says so. */
dccwl_test_reset();
$GLOBALS['dccwl_test']['options']['dcc_wl_water_bak_20260903'] = [ 'x' => 1 ];
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ]        = Water_Data::defaults();
Water_Data::upgrade();
check(
	! array_key_exists( 'dcc_wl_water_bak_20260903', $GLOBALS['dccwl_test']['options'] ),
	'including on a site whose settings are already correct'
);

/* ================================================================ 11 ====
 * THE SHEET'S WAY INTO THE PROSE GUIDE.
 * ======================================================================= */
dcc_section( 'the sheet can link to the full entry (item 11)' );

dccwl_test_reset();
dcc_reset_once_guards();
Render::render( [] );
$cfg = dcc_1450_cfg();
check_contains( $cfg, '"guideUrl"', 'the config carries where the prose guide is' );
check_contains( $cfg, '\/wildlife-guide\/', 'which is the page the Director named' );
check_contains( $cfg, 'See The Full Entry', 'and the words for the link, in Title Case' );

/*
 * THE ANCHOR THE LINK USES HAS TO EXIST ON THAT PAGE — 1.46.0's half of a
 * pair that only works if both ends agree. The client builds
 * `guideUrl + guideAnchor + key`; the guide page writes
 * `id="dccwl-fl-<key>"` on each ROW. 1.45.0 had the bare id at both ends
 * and this suite asserted that; both moved together, so the assertion
 * moved rather than being relaxed.
 */
dccwl_test_reset();
dcc_reset_once_guards();
$guide_html = \DCC_WL\Guide_Page::shortcode( [] );
$ids        = array_slice( array_keys( Species::registry() ), 0, 5 );
foreach ( $ids as $id ) {
	check_contains( $guide_html, 'id="dccwl-fl-' . $id . '"', "the guide page carries the anchor #dccwl-fl-$id" );
}
check_contains( $cfg, '"guideAnchor":"dccwl-fl-"', 'and the sheet is told that prefix, rather than repeating it' );

dcc_done();
