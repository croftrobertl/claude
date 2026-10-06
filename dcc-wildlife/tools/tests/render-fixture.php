<?php
/**
 * Emit the plugin's REAL server output as JSON, for the browser suites.
 *
 * Generated fresh on every run rather than checked in, so a UI suite can never
 * pass against a stale snapshot of markup the plugin no longer produces.
 *
 *   php render-fixture.php month|canal|water
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();

$which = $argv[1] ?? 'month';
$flags  = array_slice( $argv, 2 );

dccwl_test_reset();

// The water module ships OFF: switching it on makes network calls, so that
// stays a deliberate act by the owner. A suite that needs the map has to say
// so explicitly, which is what --enable is for.
/*
 * --guide key=value, repeatable. Lets a browser suite render the SAME page with
 * one setting changed, which is the only way to prove a setting reaches the
 * thing it claims to control.
 */
$guide = [];
foreach ( $flags as $flag ) {
	if ( 0 !== strpos( $flag, 'guide:' ) ) {
		continue;
	}
	[ $k, $v ] = array_pad( explode( '=', substr( $flag, 6 ), 2 ), 2, '' );
	$guide[ $k ] = is_numeric( $v ) ? (int) $v : $v;
}
if ( $guide ) {
	$GLOBALS['dccwl_test']['options'][ \DCC_WL\Guide_Data::OPTION ] = array_merge(
		\DCC_WL\Guide_Data::defaults(),
		$guide
	);
}

if ( in_array( '--enable', $flags, true ) ) {
	$GLOBALS['dccwl_test']['options'][ \DCC_WL\Water_Data::OPTION ] = array_merge(
		\DCC_WL\Water_Data::defaults(),
		[
			'live_enabled'    => 1,
			'map_enabled'     => 1,
			'fishing_enabled' => 1,
			'map_ramps'       => 1,
		]
	);
}
/*
 * The sheet-only half, as the REST route serves it. The browser suites route
 * the plugin's detailUrl to this, so a fixture exercises the SAME sheet a
 * guest sees. Without it every suite would be testing the degraded sheet —
 * which is worth testing, but not instead of the real one.
 */
if ( 'detail' === $which ) {
	echo wp_json_encode(
		[
			'version' => DCC_WL_VERSION,
			'species' => \DCC_WL\Species::wire_detail(),
		]
	);
	exit;
}

/*
 * THE MAP PAYLOAD, BUILT BY THE REAL PARSERS FROM THE REAL TIMESTAMP SHAPE.
 *
 * The live /map route carries ISO 8601 with a SEVEN-digit fraction and a Z
 * ("2026-07-27T04:00:00.0000000Z"); every fixture in this repository used
 * plain dates, which is exactly why no suite saw raw timestamps reaching the
 * popups. A browser suite asking "what does the popup SAY" has to be fed a
 * payload that went through Water_Live, not a hand-written one — a hand-built
 * fixture can only ever confirm what its author already believed.
 *
 * Two timestamps, on purpose: a SUMMER one written as T04:00Z (EDT) and a
 * WINTER one as T05:00Z (EST). Both are local midnight at the source, and
 * both must print their own day, not the one before.
 */
if ( 'map' === $which ) {
	$GLOBALS['dccwl_test']['options'][ \DCC_WL\Water_Data::OPTION ] = array_merge(
		\DCC_WL\Water_Data::defaults(),
		[ 'live_enabled' => 1, 'map_enabled' => 1, 'map_ramps' => 0 ]
	);
	$GLOBALS['dccwl_test']['http']['wateratlas'] = [
		'code' => 200,
		'body' => wp_json_encode(
			[
				'payload' => [
					[
						'displayName' => 'Secchi Depth',
						'value'       => 1.10,
						'units'       => 'm',
						'precision'   => 2,
						'sampleDate'  => in_array( '--winter', $flags, true )
							? '2026-01-15T05:00:00.0000000Z'
							: '2026-07-27T04:00:00.0000000Z',
						'stationId'   => 'TEST-1',
						'latitude'    => 28.8003,
						'longitude'   => -81.6706,
						'historic'    => [ 'medValue' => 1.00, 'numSamples' => 120 ],
					],
					[
						'displayName' => 'Water Levels',
						'value'       => 61.00,
						'units'       => 'ft',
						'precision'   => 2,
						'sampleDate'  => in_array( '--winter', $flags, true )
							? '2026-01-12T05:00:00.0000000Z'
							: '2026-09-22T04:00:00.0000000Z',
						'stationId'   => 'TEST-2',
						'latitude'    => 28.7992,
						'longitude'   => -81.6689,
						'verticalDatum' => 'NAVD88',
						'historicAverageForMonth' => [ 'norm' => 61.25 ],
					],
				],
			]
		),
	];
	/* SERVED THE WAY THE ROUTE SERVES IT. Water_Rest::map() sets `enabled`
	 * on the payload, and the client draws nothing without it — a fixture
	 * missing that flag opens an empty sheet and tests nothing. */
	$payload            = \DCC_WL\Water_Live::map_payload();
	$payload['enabled'] = true;
	echo wp_json_encode( $payload );
	exit;
}

/*
 * THE /conditions PAYLOAD, GATED AND FORMATTED BY THE REAL CODE.
 *
 * The browser suites need facts carrying the date shapes that actually occur
 * — a live instant with a seven-digit fraction, a winter one, a date-only
 * value, and a string that cannot be parsed at all. Hand-writing the payload
 * would mean hand-writing `dateText`, which is the very thing under test, so
 * the rows go through Water_Fact: the same gate and the same formatter a
 * guest's reading goes through.
 */
if ( 'facts' === $which ) {
	$rows = [
		[
			'label' => 'Wind', 'key' => 'wind', 'value' => 'ESE 0 to 5 mph',
			'short' => '', 'detail' => '', 'tier' => \DCC_WL\Water_Fact::TIER_LIVE,
			'source_name' => 'NWS forecast', 'date' => '2026-07-27T04:00:00.0000000Z',
			'date_label' => 'forecast', 'date_precision' => 'minute', 'group' => 'primary',
		],
		[
			'label' => 'Water level', 'key' => 'level', 'value' => 'About 3 inches below normal for January',
			'short' => '3 in. below normal', 'detail' => 'for January',
			'tier' => \DCC_WL\Water_Fact::TIER_LIVE, 'source_name' => 'Lake County Water Atlas',
			'date' => '2026-01-15T05:00:00.0000000Z', 'date_label' => 'reading',
			'date_precision' => 'day', 'group' => 'primary',
		],
		[
			'label' => 'Water clarity', 'key' => 'clarity', 'value' => '2.95 ft',
			'short' => '2.95 ft', 'detail' => '', 'tier' => \DCC_WL\Water_Fact::TIER_PUBLISHED,
			'source_name' => 'Water Atlas', 'date' => '2026-08-01',
			'date_label' => 'sampled', 'date_precision' => 'day', 'group' => 'primary',
		],
		/* The gate accepts this date (it is a valid shape) and the formatter
		 * refuses it, which is the pair worth testing: the card renders, with
		 * NO date line, rather than printing the string. */
		[
			'label' => 'Surface area', 'value' => '4,475 acres',
			'tier' => \DCC_WL\Water_Fact::TIER_PUBLISHED, 'source_name' => 'Water Atlas',
			'date' => '2026-13-45T99:99', 'date_label' => 'published', 'group' => 'primary',
		],
	];
	$facts = [];
	foreach ( \DCC_WL\Water_Fact::collect( $rows ) as $f ) {
		$facts[] = $f->to_array();
	}
	echo wp_json_encode( [ 'enabled' => true, 'facts' => $facts, 'fetched' => '' ] );
	exit;
}

ob_start();
switch ( $which ) {
	case 'canal':
		$html = \DCC_WL\Canal_Render::shortcode( [] );
		break;
	case 'water':
		$html = \DCC_WL\Water_Render::shortcode( [] );
		break;
	default:
		$html = \DCC_WL\Render::shortcode( [] );
}
$html = (string) ob_get_clean() . $html;

$config = '';
foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
	$config .= (string) $data . "\n";
}

echo wp_json_encode(
	[
		'which'    => $which,
		'html'     => $html,
		'config'   => $config,
		'enqueued' => $GLOBALS['dccwl_test']['enqueued'],
	]
);
