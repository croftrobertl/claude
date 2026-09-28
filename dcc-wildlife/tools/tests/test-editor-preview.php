<?php
/**
 * The Elementor editor preview must look exactly like live (1.33.0).
 *
 * On /explore/ (post 18119) it did not: the editor showed the hub as a
 * bulleted list of unstyled buttons in the host kit's button face — the right
 * markup with none of the plugin's CSS or JS. The markup was never the
 * problem; the assets were.
 *
 * Registering only on `wp_enqueue_scripts` is not enough. Elementor asks a
 * widget for its handles from its own pass, and re-renders a widget over AJAX
 * when you edit it, where `wp_enqueue_scripts` never fires at all — and
 * wp_enqueue_style() on an unregistered handle is a SILENT no-op, which is
 * exactly the failure mode that let this ship.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
$root = dcc_boot_plugin();
dccwl_test_reset();

$widgets = [
	'DCC_WL\Widget'           => [ 'dccwl_month',     'dcc-wildlife' ],
	'DCC_WL\Canal_Widget'     => [ 'dccwl_canal',     'dcc-wildlife-canal' ],
	'DCC_WL\Water_Widget'     => [ 'dccwl_water',     'dcc-wildlife-water' ],
	'DCC_WL\Countdown_Widget' => [ 'dccwl_countdown', 'dcc-wildlife' ],
];

dcc_section( 'every widget names its assets, which is what Elementor reads' );

foreach ( $widgets as $class => [ $name, $handle ] ) {
	if ( ! class_exists( $class ) ) {
		check( false, "$class exists" );
		continue;
	}
	$w = new $class();
	check(
		method_exists( $w, 'get_style_depends' ),
		"$name declares get_style_depends()"
	);
	check(
		method_exists( $w, 'get_script_depends' ),
		"$name declares get_script_depends()"
	);
	check_same( [ $handle ], $w->get_style_depends(), "$name names its stylesheet" );
	check_same( [ $handle ], $w->get_script_depends(), "$name names its script" );
	$m = new \ReflectionMethod( $class, 'get_style_depends' );
	check_same( $class, $m->getDeclaringClass()->getName(), "$name declares it itself" );
}

dcc_section( 'and those handles are really registered' );

/*
 * The whole bug in one assertion. A handle a widget names but nothing
 * registers enqueues NOTHING, without an error, in every context.
 */
( \DCC_WL\Plugin::instance() )->register_assets();

$registered_styles  = array_keys( $GLOBALS['dccwl_test']['reg_styles'] );
$registered_scripts = array_keys( $GLOBALS['dccwl_test']['reg_scripts'] );

foreach ( $widgets as $class => [ $name, $handle ] ) {
	check(
		in_array( $handle, $registered_styles, true ),
		"the stylesheet $name asks for is registered ($handle)",
		'registered: ' . implode( ', ', $registered_styles )
	);
	check(
		in_array( $handle, $registered_scripts, true ),
		"the script $name asks for is registered ($handle)",
		'registered: ' . implode( ', ', $registered_scripts )
	);
}

dcc_section( 'registering twice is harmless, which is what makes three hooks safe' );

$before = count( $GLOBALS['dccwl_test']['reg_styles'] ) + count( $GLOBALS['dccwl_test']['reg_scripts'] );
( \DCC_WL\Plugin::instance() )->register_assets();
( \DCC_WL\Plugin::instance() )->register_assets();
$after = count( $GLOBALS['dccwl_test']['reg_styles'] ) + count( $GLOBALS['dccwl_test']['reg_scripts'] );
check_same( $before, $after, 'a second and third registration pass add nothing' );

dcc_section( 'nothing the renderers ask for goes to an unregistered handle' );

/*
 * The bug, stated as an assertion. In WordPress, enqueuing a handle nobody
 * registered does NOTHING, silently, and that is how the editor preview came
 * to have the right markup and no CSS at all.
 */
dcc_reset_once_guards();
$GLOBALS['dccwl_test']['unregistered'] = [];
ob_start();
\DCC_WL\Render::shortcode( [] );
\DCC_WL\Canal_Render::shortcode( [] );
\DCC_WL\Water_Render::shortcode( [] );
ob_end_clean();
check_same(
	[],
	$GLOBALS['dccwl_test']['unregistered'],
	'every handle the three renderers enqueue is one register_assets() created'
);
check(
	count( $GLOBALS['dccwl_test']['served'] ) > 0,
	'and they enqueued something, so the check is not vacuous',
	'served: ' . implode( ', ', array_unique( $GLOBALS['dccwl_test']['served'] ) )
);

dcc_section( 'registration reaches the editor, not just the front end' );

/*
 * Three hooks, on purpose. `wp_enqueue_scripts` covers the front end; the two
 * Elementor hooks fire inside the editor preview and inside its AJAX
 * re-render, where the first one does not. Registration is idempotent, so
 * hooking it three times costs nothing.
 */
$hooks = [];
foreach ( $GLOBALS['dccwl_test']['actions'] as [ $hook, $cb, $prio ] ) {
	if ( is_array( $cb ) && isset( $cb[1] ) && 'register_assets' === $cb[1] ) {
		$hooks[] = $hook;
	}
}
sort( $hooks );
check_same(
	[ 'elementor/frontend/after_register_scripts', 'elementor/frontend/after_register_styles', 'wp_enqueue_scripts' ],
	$hooks,
	'register_assets() runs on the front end AND in both Elementor passes'
);

dcc_section( 'the scripts re-initialise when Elementor re-renders a widget' );

/*
 * Elementor's editor replaces a widget's markup after page load, long after
 * DOMContentLoaded. Each script must hook its own widget's element_ready, or
 * an edited widget sits inert until the page is reloaded — which is how the
 * water panel behaved before 1.33.0.
 */
$scripts = [
	'assets/js/widget.js' => 'dccwl_month',
	'assets/js/canal.js'  => 'dccwl_canal',
	'assets/js/water.js'  => 'dccwl_water',
];
foreach ( $scripts as $file => $widget ) {
	$src = (string) file_get_contents( $root . '/' . $file );
	check_contains( $src, 'elementor/frontend/init', "$file listens for Elementor's frontend init" );
	check_contains(
		$src,
		"frontend/element_ready/$widget.default",
		"$file re-initialises when $widget is re-rendered"
	);
}

dcc_section( 'a re-render cannot double-bind the map button' );

/*
 * water.js's boot() queries the whole DOCUMENT, not the re-rendered scope, so
 * re-running it over an untouched page would add a second click listener to
 * every map button: two sheets, two REST calls. The guard is per node.
 */
$water = (string) file_get_contents( $root . '/assets/js/water.js' );
check_contains( $water, "data-dccwl-map-init", 'the map button carries a one-listener guard' );
check_matches(
	$water,
	'/getAttribute\(\s*.data-dccwl-map-init.\s*\)\s*\)\s*\{\s*return;/',
	'and the guard RETURNS rather than just marking'
);

dcc_done();
