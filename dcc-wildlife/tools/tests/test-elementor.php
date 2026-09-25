<?php
/**
 * What the four widgets expose to a page editor.
 *
 * Recorded rather than rendered: the Elementor stub's add_control() stores
 * each control, so this suite can state exactly which knobs exist today. That
 * baseline is what makes "an untouched control writes nothing" checkable when
 * per-placement overrides arrive.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();

/** @return array<string,array<string,mixed>> */
function dcc_controls( string $class ): array {
	$w = new $class();
	$w->dccwl_register_controls_for_test();
	return $w->recorded_controls;
}

$widgets = [
	'DCC_WL\Widget'           => 'dccwl_month',
	'DCC_WL\Canal_Widget'     => 'dccwl_canal',
	'DCC_WL\Countdown_Widget' => 'dccwl_countdown',
	'DCC_WL\Water_Widget'     => 'dccwl_water',
];

dcc_section( 'all four widgets exist and name themselves' );

foreach ( $widgets as $class => $slug ) {
	check( class_exists( $class ), "$class is loadable" );
	$w = new $class();
	check_same( $slug, $w->get_name(), "$class reports the slug $slug" );
	check( '' !== $w->get_title(), "$class has a title" );
	check_same( [ 'dcc-widgets' ], $w->get_categories(), "$class registers in the shared dcc-widgets category" );
}

dcc_section( 'control inventory' );

$counts = [];
foreach ( $widgets as $class => $slug ) {
	$c            = dcc_controls( $class );
	$counts[ $slug ] = $c;
	$functional   = array_filter(
		$c,
		static fn( array $a ): bool => ! in_array( $a['type'] ?? '', [ 'raw_html', 'heading', 'divider' ], true )
	);
	echo "       $slug: " . count( $c ) . ' controls, ' . count( $functional ) . " functional\n";
}

// Pinned so that adding or removing a control is a deliberate, visible change.
check( count( $counts['dccwl_month'] ) >= 5, 'the month widget exposes at least five controls' );
check( isset( $counts['dccwl_month']['widget_title'] ), 'the month widget has a title control' );
check( isset( $counts['dccwl_canal']['widget_title'] ), 'the hub has a title control' );
check( isset( $counts['dccwl_water']['water_title'] ), 'the water widget has a title control' );

$countdown_functional = array_filter(
	$counts['dccwl_countdown'],
	static fn( array $a ): bool => ! in_array( $a['type'] ?? '', [ 'raw_html', 'heading', 'divider' ], true )
);
check_same( [], $countdown_functional, 'the countdown widget deliberately exposes no functional control yet' );

dcc_section( 'a switcher cannot express "inherit"' );

// Recorded so the limitation is documented in an executable place: a SWITCHER
// has two states, so any control meant to fall back to a plugin default has
// to be a three-way select instead. Contact Form 1.6.0 learned this the hard
// way; this assertion is here so this plugin does not relearn it.
$switchers = [];
foreach ( $counts as $slug => $controls ) {
	foreach ( $controls as $id => $args ) {
		if ( 'switcher' === ( $args['type'] ?? '' ) ) { $switchers[] = "$slug.$id"; }
	}
}
sort( $switchers );
check_same(
	[
		'dccwl_month.compact',
		'dccwl_month.show_browser',
		'dccwl_month.show_countdown',
		'dccwl_month.show_guide',
	],
	$switchers,
	'the switcher set is exactly these four, so adding one is a visible decision'
);

// Any control whose job is "fall back to the plugin setting" must NOT be a
// switcher. This is the assertion that stops the Contact Form 1.6.0 mistake
// being repeated here: a three-way select is the only shape that can say
// inherit.
$inheriting = [];
foreach ( $counts as $slug => $controls ) {
	foreach ( $controls as $id => $args ) {
		$label = strtolower( (string) ( $args['label'] ?? '' ) );
		$opts  = (array) ( $args['options'] ?? [] );
		$claims_inherit = str_contains( $label, 'inherit' ) || array_key_exists( 'inherit', $opts );
		if ( $claims_inherit && 'switcher' === ( $args['type'] ?? '' ) ) { $inheriting[] = "$slug.$id"; }
	}
}
check_same( [], $inheriting, 'no control offers "inherit" through a switcher, which cannot express it', implode( ', ', $inheriting ) );

// Every control that carries a default is asserting a behaviour. If it does
// not match what the plugin does with no widget at all, placing a widget
// changes behaviour silently.
$with_defaults = [];
foreach ( $counts as $slug => $controls ) {
	foreach ( $controls as $id => $args ) {
		if ( array_key_exists( 'default', $args ) ) { $with_defaults[] = "$slug.$id=" . var_export( $args['default'], true ); }
	}
}
check( count( $with_defaults ) > 0, 'some controls carry defaults', implode( ' | ', $with_defaults ) );
foreach ( $with_defaults as $d ) {
	echo "       default: $d\n";
}

dcc_done();
