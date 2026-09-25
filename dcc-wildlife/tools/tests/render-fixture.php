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
