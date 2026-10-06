<?php
/**
 * The reading, its qualifier, and the unit a guest actually reads (1.39.0).
 *
 * Three claims are asserted against the REAL parsers, driven by stubbed Atlas
 * payloads rather than by hand-built Facts:
 *
 *  1. A Fact states its own SHORT reading and its qualifier. The Map tile
 *     prints them on two lines, and the browser must never have to split a
 *     composed sentence to get them — that is the mistake the wind parts
 *     avoided in 1.35.0, in a new place.
 *  2. The map payload carries clarity in FEET. The Atlas reports some of the
 *     chain in metres and some in feet; a popup reading "1.1 m" beside a tile
 *     reading "3.6 ft" is the same lake twice in two languages.
 *  3. An unrecognised unit is NOT converted. A guessed unit is a wrong number
 *     with a confident label, which is the one thing this module refuses.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();

use DCC_WL\Water_Data;
use DCC_WL\Water_Fact;
use DCC_WL\Water_Live;

/** The water module on, with the live layer and the map. */
function dcc_parts_enable(): void {
	$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = array_merge(
		Water_Data::defaults(),
		[ 'live_enabled' => 1, 'map_enabled' => 1 ]
	);
}

/**
 * An Atlas response holding a Secchi reading and a water level, in the units
 * given. Shaped like the real one: the wrapper carries the name, the payload
 * carries the data (the 1.6.0 envelope lesson).
 */
function dcc_parts_atlas( float $secchi, string $units, float $median, float $level, float $norm ): void {
	$GLOBALS['dccwl_test']['http']['wateratlas'] = [
		'code' => 200,
		'body' => wp_json_encode(
			[
				'payload' => [
					[
						'displayName' => 'Secchi Depth',
						'value'       => $secchi,
						'units'       => $units,
						'precision'   => 2,
						'sampleDate'  => gmdate( 'Y-m-d', time() - 86400 * 5 ),
						'stationId'   => 'TEST-1',
						/* Coordinates, because a station without them is
						 * DELIBERATELY not pinned — a marker in the wrong place
						 * is worse than no marker. Without these the station
						 * assertion below would be testing the fixture. */
						'latitude'    => 28.8003,
						'longitude'   => -81.6706,
						'historic'    => [ 'medValue' => $median, 'numSamples' => 120 ],
					],
					[
						'displayName' => 'Water Levels',
						'value'       => $level,
						'units'       => 'ft',
						'precision'   => 2,
						'sampleDate'  => gmdate( 'Y-m-d', time() - 86400 ),
						'stationId'   => 'TEST-2',
						'verticalDatum' => 'NAVD88',
						'latitude'    => 28.7992,
						'longitude'   => -81.6689,
						'historicAverageForMonth' => [ 'norm' => $norm ],
					],
				],
			]
		),
	];
}

/** The facts the /conditions route would serve, keyed by their machine name. */
function dcc_parts_facts(): array {
	$out = [];
	$res = Water_Live::conditions();
	foreach ( (array) ( $res['facts'] ?? [] ) as $f ) {
		$row = $f instanceof Water_Fact ? $f->to_array() : (array) $f;
		if ( '' !== (string) ( $row['key'] ?? '' ) ) {
			$out[ $row['key'] ] = $row;
		}
	}
	return $out;
}

/* ---------------------------------------------------------------- 1 ---- */
dcc_section( 'a Fact states its short reading and its qualifier' );

dccwl_test_reset();
dcc_parts_enable();
/* A level a quarter of a foot below its monthly norm: 3 inches. And a Secchi
 * reading well clear of its median, so the comparison the small line carries
 * is actually said — at 1.10 against 1.00 the module stays SILENT, which is
 * its own rule (only speak when it matters) and would make this assertion
 * about the fixture rather than the code. */
dcc_parts_atlas( 1.60, 'm', 1.00, 61.00, 61.25 );

$facts = dcc_parts_facts();

check( isset( $facts['level'] ), 'the level fact is built', implode( ', ', array_keys( $facts ) ) );
if ( isset( $facts['level'] ) ) {
	$lv = $facts['level'];
	echo "       level: short=\"{$lv['short']}\" detail=\"{$lv['detail']}\" value=\"{$lv['value']}\"\n";
	check_same( '3 in. below normal', $lv['short'], 'the large line is the reading alone' );
	check( (bool) preg_match( '/^for [A-Z][a-z]+$/', $lv['detail'] ),
		'the small line is the month it is normal FOR', $lv['detail'] );
	/* The Now card is untouched: it still prints the whole sentence, which is
	 * what "change nothing else" means here. */
	check( false !== strpos( $lv['value'], 'below normal for' ),
		'and the sentence the Now card shows is unchanged', $lv['value'] );
	check( false === strpos( $lv['short'], 'About' ),
		'the large line drops "About" — the tile has no room for a hedge' );
}

check( isset( $facts['clarity'] ), 'the clarity fact is built' );
if ( isset( $facts['clarity'] ) ) {
	$cl = $facts['clarity'];
	echo "       clarity: short=\"{$cl['short']}\" detail=\"{$cl['detail']}\" value=\"{$cl['value']}\"\n";
	check( '' !== $cl['short'] && false === strpos( $cl['short'], 'than usual' ),
		'the large line is the measure alone', $cl['short'] );
	check( false !== strpos( $cl['detail'], 'than usual' ),
		'the small line is the comparison', $cl['detail'] );
	check( 0 === strpos( $cl['value'], $cl['short'] ),
		'and the whole sentence still begins with that measure', $cl['value'] );
}

/* A fact with NO parts is as valid as one with them — the gate is unchanged. */
$plain = Water_Fact::make( [
	'label' => 'Surface area', 'value' => '4,475 acres', 'tier' => Water_Fact::TIER_PUBLISHED,
	'source_name' => 'Water Atlas', 'date' => '2026-01-01',
] );
check( null !== $plain, 'a Fact with no short/detail is still a Fact' );
check_same( '', $plain->to_array()['short'], 'and carries an empty short' );
check_same( '', $plain->to_array()['detail'], 'and an empty detail' );

$ungated = Water_Fact::make( [
	'label' => 'Something', 'value' => '1', 'tier' => Water_Fact::TIER_LIVE,
	'source_name' => '', 'date' => '2026-01-01', 'short' => 'x', 'detail' => 'y',
] );
check_same( null, $ungated, 'and parts can NEVER admit an unsourced fact — the gate is untouched' );

/* ---------------------------------------------------------------- 2 ---- */
dcc_section( 'the map payload carries clarity in feet' );

dccwl_test_reset();
dcc_parts_enable();
dcc_parts_atlas( 1.10, 'm', 1.00, 61.00, 61.25 );

$map = Water_Live::map_data();
$w   = $map['waters'][0] ?? [];
$cl  = $w['clarity'] ?? [];
echo '       clarity: ' . wp_json_encode( $cl ) . "\n";

check( isset( $cl['ft'] ), 'the reading carries a feet value' );
check_same( 3.61, $cl['ft'], '1.10 m is 3.61 ft' );
check_same( 3.28, $cl['medianFt'], 'and its median converts with it' );
check_same( 1.10, $cl['value'], 'the source\'s own number is still there, unconverted' );
check_same( 'm', $cl['units'], 'with the unit it was published in' );

/* A station pin shows the same reading, so it must carry the same feet. */
$st = $map['stations'][0] ?? [];
check( isset( $st['reading']['ft'] ), 'a station pin carries the feet reading too',
	wp_json_encode( $st['reading'] ?? null ) );

/* Already in feet: passed through to two decimals, NOT re-rounded. The tile
 * prints the Atlas's own "2.95 ft" and a popup saying "3 ft" beside it is the
 * mismatch this release exists to remove. */
dccwl_test_reset();
dcc_parts_enable();
dcc_parts_atlas( 2.95, 'ft', 3.30, 61.00, 61.25 );
$map2 = Water_Live::map_data();
$cl2  = $map2['waters'][0]['clarity'] ?? [];
check_same( 2.95, $cl2['ft'], 'a reading already in feet comes through unchanged' );
check_same( 3.30, $cl2['medianFt'], 'and so does its median' );

/* ---------------------------------------------------------------- 3 ---- */
dcc_section( 'an unrecognised unit is not converted' );

dccwl_test_reset();
dcc_parts_enable();
dcc_parts_atlas( 42.0, 'cubits', 40.0, 61.00, 61.25 );
$map3 = Water_Live::map_data();
$cl3  = $map3['waters'][0]['clarity'] ?? [];
echo '       clarity: ' . wp_json_encode( $cl3 ) . "\n";
check_same( null, $cl3['ft'], 'no feet value is invented for a unit we do not know' );
check_same( null, $cl3['medianFt'], 'nor for its median' );
check_same( 42.0, $cl3['value'], 'the reading itself is still carried, as published' );

/* ---------------------------------------------------------------- 4 ---- */
dcc_section( 'a date a guest reads: 07/27/2026, from the shape the live payload really carries' );

/*
 * THE SHAPE THAT BROKE IT. The live /map payload carries ISO 8601 with a
 * SEVEN-digit fraction and a Z, and popups printed it verbatim for three
 * releases because every fixture here used plain dates. Each row below is a
 * case that was checked against PHP rather than assumed.
 */
$cases = [
	// the live shape, summer: local midnight written as T04:00Z (EDT)
	[ '2026-07-27T04:00:00.0000000Z', '07/27/2026', 'the summer timestamp keeps its own day' ],
	// and winter: T05:00Z (EST)
	[ '2026-01-15T05:00:00.0000000Z', '01/15/2026', 'so does the winter one' ],
	[ '2026-09-22T04:00:00.0000000Z', '09/22/2026', 'the level reading the Director photographed' ],
	[ '2026-12-31T05:00:00.0000000Z', '12/31/2026', 'and a year end, which a UTC read would roll over' ],
	// a DATE is not a timestamp: converting it would print the day before
	[ '2026-08-01', '08/01/2026', 'a date-only value is NOT shifted into the canal zone' ],
	// already formatted: the output pass runs over payloads it has seen
	[ '07/27/2026', '07/27/2026', 'and formatting is idempotent' ],
	// readable as they stand, with no day to print
	[ '2019-07', '2019-07', 'a year-month is left alone' ],
	[ '2019', '2019', 'so is a bare year' ],
	// an empty string parses as NOW in PHP; it must not become today
	[ '', '', 'an empty date is empty, never today' ],
	[ '   ', '', 'and so is whitespace' ],
	[ 'not a date', '', 'unparseable text prints NOTHING, never itself' ],
	[ '2026-13-45T99:99Z', '', 'and so does a timestamp that cannot exist' ],
];
foreach ( $cases as [ $raw, $want, $what ] ) {
	check_same( $want, Water_Live::us_date( $raw ), $what, var_export( $raw, true ) );
}

/* ---------------------------------------------------------------- 5 ---- */
dcc_section( 'a payload cached by 1.39.0 is formatted on its way out' );

/*
 * The upgrade path, which is the half a guest would have seen: a site moving
 * to 1.39.1 holds a payload built by 1.39.0, full of raw timestamps, and it
 * may live for another three hours. map_payload() formats what it reads from
 * the cache, so the cache's age cannot reach a popup.
 */
dccwl_test_reset();
dcc_parts_enable();
$raw_cached = [
	'waters' => [
		[
			'id' => '1', 'name' => 'Lake Dora', 'lat' => 28.8, 'lon' => -81.67,
			'clarity' => [ 'value' => 1.1, 'units' => 'm', 'ft' => 3.61, 'medianFt' => 3.28,
				'date' => '2026-07-27T04:00:00.0000000Z', 'age' => 71 ],
			'level'   => [ 'inches' => -3.0, 'date' => '2026-09-22T04:00:00.0000000Z', 'stale' => false ],
			'depthMap'=> null, 'ageDays' => 71,
		],
	],
	'stations' => [
		[ 'id' => 'TEST-1', 'kind' => 'clarity', 'water' => 'Lake Dora', 'lat' => 28.8, 'lon' => -81.67,
			'reading' => [ 'value' => 1.1, 'units' => 'm', 'date' => '2026-07-27T04:00:00.0000000Z' ] ],
	],
	'ramps' => [], 'property' => null,
];
set_transient( 'dcc_wl_water_map', $raw_cached, 3600 );

$served = Water_Live::map_payload();
echo '       served: ' . wp_json_encode( $served['waters'][0]['clarity']['date'] ) . ' / '
	. wp_json_encode( $served['waters'][0]['level']['date'] ) . ' / '
	. wp_json_encode( $served['stations'][0]['reading']['date'] ) . "\n";
check_same( '07/27/2026', $served['waters'][0]['clarity']['date'], 'the cached clarity date is formatted on output' );
check_same( '09/22/2026', $served['waters'][0]['level']['date'], 'so is the cached level date' );
check_same( '07/27/2026', $served['stations'][0]['reading']['date'], 'and the station pin reading' );
check_same( 71, $served['waters'][0]['clarity']['age'], 'the AGE is untouched — the map greys by it' );
check_same( 3.61, $served['waters'][0]['clarity']['ft'], 'and so is everything else in the payload' );

/* ---------------------------------------------------------------- 6 ---- */
dcc_section( 'one date format for the whole water module' );

/*
 * 1.39.1 closed the map popups and REPORTED two places that could still print
 * machine text. Both are closed here, by computing the text once on the
 * server: a Fact carries `dateText`, and nothing downstream parses a
 * timestamp or falls back to printing one.
 */
$dt = [
	// the live shape, with a declared minute: date AND clock, in canal time
	[ '2026-07-27T04:00:00.0000000Z', 'minute', '07/27/2026, 12:00 AM', 'a forecast instant keeps its time, read in canal time' ],
	[ '2026-01-15T05:00:00.0000000Z', 'minute', '01/15/2026, 12:00 AM', 'and so does a winter one' ],
	// a lab sample is dated to the day: no clock invented for it
	[ '2026-07-27T04:00:00.0000000Z', 'day', '07/27/2026', 'a day-precision reading prints the date alone' ],
	[ '2026-08-01', 'day', '08/01/2026', 'a date-only value is not shifted' ],
	[ '2026-08-01', 'minute', '08/01/2026', 'and a declared minute with no time in the value invents none' ],
	[ '2019-07', '', '2019-07', 'a year-month stays as it is' ],
	[ '', 'minute', '', 'an empty date prints nothing' ],
	[ 'not a date', 'minute', '', 'and so does an unparseable one — never the raw string' ],
];
foreach ( $dt as [ $raw, $prec, $want, $what ] ) {
	check_same( $want, Water_Live::us_datetime( $raw, $prec ), $what, var_export( $raw, true ) );
}

/* The Fact carries it, beside the raw date the age chip needs. */
$f = Water_Fact::make( [
	'label' => 'Wind', 'value' => 'ESE 0 to 5 mph', 'tier' => Water_Fact::TIER_LIVE,
	'source_name' => 'NWS forecast', 'date' => '2026-07-27T04:00:00.0000000Z',
	'date_precision' => 'minute',
] );
$row = $f->to_array();
echo '       fact: date=' . $row['date'] . ' dateText=' . $row['dateText'] . "\n";
check_same( '07/27/2026, 12:00 AM', $row['dateText'], 'a Fact carries the text a guest reads' );
check_same( '2026-07-27T04:00:00.0000000Z', $row['date'], 'and the raw instant, which the age chip measures from' );

/* GUARD (a) FROM 1.39.1, CLOSED: an ISO timestamp typed into the admin form
 * can no longer reach a guest through the server-rendered card. */
$bad = Water_Fact::make( [
	'label' => 'Surface area', 'value' => '4,475 acres', 'tier' => Water_Fact::TIER_PUBLISHED,
	'source_name' => 'Water Atlas', 'date' => '2026-07-27T04:00:00.0000000Z',
] );
check_same( '07/27/2026', $bad->to_array()['dateText'],
	'an owner-typed timestamp renders as a date, not as itself' );

dcc_done();
