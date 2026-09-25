<?php
/**
 * The chain map's payload cache, and the cron that keeps it warm.
 *
 * A guest tapping "Chain map" waited 14.6 seconds in the browser while the
 * payload was assembled from fourteen sequential Atlas calls. This suite
 * asserts the cache in front of that assembly behaves: it caches, it does not
 * let two requests build at once, it does NOT cache an outage for hours, and
 * the cron event only exists while the map is switched on.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();

use DCC_WL\Water_Data;
use DCC_WL\Water_Live;
use DCC_WL\Water_Rest;
use DCC_WL\Plugin;

const MAP_KEY  = 'dcc_wl_water_map';
const MAP_LOCK = 'dcc_wl_water_map_lock';

/** Switch the water module on, the way an owner would. */
function dcc_enable_map(): void {
	$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = array_merge(
		Water_Data::defaults(),
		[ 'live_enabled' => 1, 'map_enabled' => 1, 'map_ramps' => 1 ]
	);
}

/** An Atlas response carrying a real reading, so a payload counts as healthy. */
function dcc_stub_atlas(): void {
	$GLOBALS['dccwl_test']['http']['wateratlas'] = [
		'code' => 200,
		'body' => wp_json_encode(
			[
				'payload' => [
					[
						'displayName' => 'Secchi Depth',
						'value'       => 1.2,
						'units'       => 'm',
						'sampleDate'  => gmdate( 'Y-m-d', time() - 86400 * 10 ),
						'stationId'   => 'TEST-1',
						'historic'    => [ 'medValue' => 1.0 ],
					],
				],
			]
		),
	];
}

dcc_section( 'a cold call caches the payload' );

dccwl_test_reset();
dcc_enable_map();
dcc_stub_atlas();

check_same( false, get_transient( MAP_KEY ), 'nothing is cached to begin with' );
$first = Water_Live::map_payload();
check( is_array( $first ), 'the payload comes back as an array' );
check( is_array( get_transient( MAP_KEY ) ), 'the assembled payload is now cached' );
check( ! array_key_exists( 'stale', $first ), 'a freshly built payload is not marked stale' );

// THE PARSERS ARE UNTOUCHED BY THIS CHANGE, and this is the assertion that
// says so: a stubbed Atlas response with a real Secchi reading has to arrive
// as a parsed clarity value on the far side of the new cache. If the cache had
// disturbed the parse path, this is where it would show.
$parsed = null;
foreach ( (array) $first['waters'] as $w ) {
	if ( ! empty( $w['clarity'] ) ) { $parsed = $w['clarity']; break; }
}
check( is_array( $parsed ), 'a stubbed Atlas reading still parses into a clarity value through the cache' );
check_same( 1.2, $parsed['value'] ?? null, 'the value survives intact' );
check_same( 'm', $parsed['units'] ?? null, 'so do the units' );
check_same( 1.0, $parsed['median'] ?? null, 'and the historic median it is compared against' );
check( is_numeric( $parsed['ratio'] ?? null ) && abs( (float) $parsed['ratio'] - 1.2 ) < 0.001, 'the clarity ratio is computed from them' );

dcc_section( 'a warm call does not rebuild' );

// Break the source. A second call that still succeeds can only be reading the
// cache, because rebuilding would now fail.
$GLOBALS['dccwl_test']['http'] = [];
$second = Water_Live::map_payload();
check_same( $first, $second, 'the second call returns the identical cached payload' );

dcc_section( 'a healthy payload is cached for hours, an outage for minutes' );

dccwl_test_reset();
dcc_enable_map();
dcc_stub_atlas();
Water_Live::map_payload();
$healthy_ttl = $GLOBALS['dccwl_test']['ttl'][ MAP_KEY ] ?? 0;
check_same( 10800, $healthy_ttl, 'a payload with readings is cached for three hours' );
check(
	$healthy_ttl < 21600,
	'and that sits inside the six-hour per-report TTL, so a rebuild reads warm sub-caches'
);

// No HTTP stub at all: every source unreachable. The waters list is still
// populated from the owner's stored chain rows, so "no waters" would be the
// wrong test — what matters is that there are no readings.
dccwl_test_reset();
dcc_enable_map();
$outage = Water_Live::map_payload();
check( ! empty( $outage['waters'] ), 'an outage still returns the chain pins, from stored settings' );
$readings = 0;
foreach ( (array) $outage['waters'] as $w ) {
	if ( ! empty( $w['clarity'] ) || ! empty( $w['level'] ) ) { ++$readings; }
}
check_same( 0, $readings, 'but none of them carries a reading' );
check_same(
	Water_Data::TTL_FAIL,
	$GLOBALS['dccwl_test']['ttl'][ MAP_KEY ] ?? 0,
	'so it is cached for five minutes, not three hours'
);

dcc_section( 'two requests do not both build it' );

dccwl_test_reset();
dcc_enable_map();
dcc_stub_atlas();
set_transient( MAP_LOCK, 1, 60 );
$while_locked = Water_Live::map_payload();
check_same( true, $while_locked['stale'] ?? null, 'a request arriving mid-build is told the payload is stale' );
check_same( [], $while_locked['waters'], 'it is not handed a half-built map' );
check_same( false, get_transient( MAP_KEY ), 'and it does not write a cache entry of its own' );

// The lock must always be released, including when assembly throws.
dccwl_test_reset();
dcc_enable_map();
dcc_stub_atlas();
Water_Live::map_payload();
check_same( false, get_transient( MAP_LOCK ), 'the build lock is released afterwards' );

dcc_section( 'the cron warmer' );

dccwl_test_reset();
dcc_enable_map();
dcc_stub_atlas();
Water_Live::warm_map();
check( is_array( get_transient( MAP_KEY ) ), 'the warmer populates the cache with no request involved' );
check_same( 10800, $GLOBALS['dccwl_test']['ttl'][ MAP_KEY ] ?? 0, 'with the same three-hour life' );

// It regenerates deliberately, even over a valid entry — that is the point.
$GLOBALS['dccwl_test']['transients'][ MAP_KEY ] = [ 'waters' => [], 'sentinel' => true ];
Water_Live::warm_map();
$after = get_transient( MAP_KEY );
check( ! isset( $after['sentinel'] ), 'it overwrites a still-valid entry rather than skipping' );

dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = Water_Data::defaults(); // map off
Water_Live::warm_map();
check_same( false, get_transient( MAP_KEY ), 'with the map switched off the warmer does nothing at all' );

dcc_section( 'the schedule follows the setting' );

$plugin = ( new \ReflectionClass( Plugin::class ) )->newInstanceWithoutConstructor();

dccwl_test_reset();
dcc_enable_map();
$plugin->maybe_schedule_warm();
check( false !== wp_next_scheduled( Plugin::WARM_HOOK ), 'the event is scheduled when the map is on' );

$booked = wp_next_scheduled( Plugin::WARM_HOOK );
$plugin->maybe_schedule_warm();
check_same( $booked, wp_next_scheduled( Plugin::WARM_HOOK ), 'calling it again does not add a second event' );

$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = Water_Data::defaults(); // map off
$plugin->maybe_schedule_warm();
check_same( false, wp_next_scheduled( Plugin::WARM_HOOK ), 'switching the map off removes the event' );

dccwl_test_reset();
Plugin::on_deactivate();
check_same( false, wp_next_scheduled( Plugin::WARM_HOOK ), 'deactivating clears it' );

dcc_section( 'flush clears the new cache too' );

dccwl_test_reset();
dcc_enable_map();
dcc_stub_atlas();
Water_Live::map_payload();
check( is_array( get_transient( MAP_KEY ) ), 'there is something to clear' );
Water_Live::flush();
check_same( false, get_transient( MAP_KEY ), 'a settings change clears the map payload' );
check_same( false, get_transient( MAP_LOCK ), 'and its lock' );

dcc_section( 'the REST route serves the cached payload' );

dccwl_test_reset();
dcc_enable_map();
dcc_stub_atlas();
$resp = Water_Rest::map();
check_same( 200, $resp->status, 'the route answers 200' );
check_same( true, $resp->get_data()['enabled'] ?? null, 'and reports the map as enabled' );
check( is_array( get_transient( MAP_KEY ) ), 'the route populated the cache, so it went through map_payload()' );

// Break the source; a second request must still succeed from cache.
$GLOBALS['dccwl_test']['http'] = [];
$resp2 = Water_Rest::map();
check_same(
	$resp->get_data()['waters'],
	$resp2->get_data()['waters'],
	'a second request is served from cache even with every source unreachable'
);

dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = Water_Data::defaults();
$off = Water_Rest::map();
check_same( false, $off->get_data()['enabled'] ?? null, 'with the map off the route says so and builds nothing' );
check_same( false, get_transient( MAP_KEY ), 'and caches nothing' );

dcc_done();
