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
check( ! isset( $counts['dccwl_month']['show_countdown'] ), 'the dead countdown switcher is still gone' );
check( isset( $counts['dccwl_month']['widget_title'] ), 'the month widget has a title control' );
check( isset( $counts['dccwl_canal']['widget_title'] ), 'the hub has a title control' );
check( isset( $counts['dccwl_water']['water_title'] ), 'the water widget has a title control' );

$countdown_functional = array_filter(
	$counts['dccwl_countdown'],
	static fn( array $a ): bool => ! in_array( $a['type'] ?? '', [ 'raw_html', 'heading', 'divider' ], true )
);
check_same(
	[],
	$countdown_functional,
	'the countdown widget exposes NO control, because it renders nothing while the countdown is retired'
);
$note = $counts['dccwl_countdown']['countdown_note']['raw'] ?? '';
check_contains( (string) $note, 'retired', 'it says so in the editor instead, rather than offering settings for nothing' );

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

dcc_section( 'per-placement overrides (1.32.0)' );

// Every override must be a SELECT with an empty default. That is the whole
// mechanism: '' means "use the setting", so an untouched control keeps
// following the settings page instead of freezing today's value.
$expected_overrides = [
	'dccwl_month'  => [ 'ov_spotlight', 'ov_search', 'ov_subnav', 'ov_jump', 'ov_compact_btn', 'ov_view', 'ov_deck_rows' ],
	'dccwl_canal'  => [ 'ov_search', 'ov_subnav', 'ov_jump', 'ov_compact_btn', 'ov_view', 'ov_deck_rows', 'ov_hub_preview_max', 'ov_now_names_max', 'ov_month_art_max', 'ov_sticky_offset' ],
	'dccwl_water'  => [ 'ov_moon', 'ov_fishing', 'ov_map_button' ],
];

foreach ( $expected_overrides as $slug => $ids ) {
	$have = array_values(
		array_filter(
			array_keys( $counts[ $slug ] ),
			static fn( string $id ): bool => 0 === strpos( $id, 'ov_' ) && 'ov_note' !== $id
		)
	);
	sort( $have );
	$want = $ids;
	sort( $want );
	check_same( $want, $have, "$slug exposes exactly the overrides it should", implode( ', ', $have ) );
}

check(
	! array_key_exists( 'dccwl_countdown', $expected_overrides ),
	'the countdown widget is deliberately absent from the override list'
);
$cd_ov = array_filter( array_keys( $counts['dccwl_countdown'] ), static fn( string $id ): bool => 0 === strpos( $id, 'ov_' ) );
check_same( [], array_values( $cd_ov ), 'and really has none' );

dcc_section( 'the shape of every override control' );

$bad_type = [];
$bad_default = [];
$bad_options = [];
foreach ( $counts as $slug => $controls ) {
	foreach ( $controls as $id => $args ) {
		if ( 0 !== strpos( $id, 'ov_' ) || 'ov_note' === $id ) {
			continue;
		}
		$type = (string) ( $args['type'] ?? '' );
		if ( ! in_array( $type, [ 'select', 'number' ], true ) ) { $bad_type[] = "$slug.$id=$type"; }
		if ( '' !== ( $args['default'] ?? 'MISSING' ) ) { $bad_default[] = "$slug.$id"; }
		if ( 'select' === $type ) {
			$opts = (array) ( $args['options'] ?? [] );
			if ( ! array_key_exists( '', $opts ) ) { $bad_options[] = "$slug.$id has no inherit option"; }
		}
	}
}
check_same( [], $bad_type, 'no override is a switcher — only select or number', implode( ', ', $bad_type ) );
check_same( [], $bad_default, 'every override defaults to empty, so untouched means inherit', implode( ', ', $bad_default ) );
check_same( [], $bad_options, 'every select override offers the inherit choice', implode( ', ', $bad_options ) );

// The hide-only pair must NOT offer "Show": both depend on data that may not
// exist, so a placement forcing them on would promise an empty section.
$water = $counts['dccwl_water'];
foreach ( [ 'ov_fishing', 'ov_map_button' ] as $id ) {
	$opts = array_keys( (array) ( $water[ $id ]['options'] ?? [] ) );
	sort( $opts );
	check_same( [ '', 'off' ], $opts, "$id can only inherit or hide, never force a section on" );
}
$moon = array_keys( (array) ( $water['ov_moon']['options'] ?? [] ) );
sort( $moon );
check_same( [ '', 'off', 'on' ], $moon, 'the moon card, which costs nothing, can be switched either way' );

// Number overrides must carry the same bounds the settings page enforces, or
// the panel would accept a value the sanitiser then silently changes.
$schema = \DCC_WL\Guide_Data::schema();
$pairs = [
	'dccwl_month.ov_deck_rows'        => 'deck_rows',
	'dccwl_canal.ov_deck_rows'        => 'deck_rows',
	'dccwl_canal.ov_hub_preview_max'  => 'hub_preview_max',
	'dccwl_canal.ov_now_names_max'    => 'now_names_max',
	'dccwl_canal.ov_month_art_max'    => 'month_art_max',
	'dccwl_canal.ov_sticky_offset'    => 'sticky_offset',
];
foreach ( $pairs as $path => $key ) {
	[ $slug, $id ] = explode( '.', $path );
	$c = $counts[ $slug ][ $id ] ?? [];
	check_same( (int) $schema[ $key ]['min'], (int) ( $c['min'] ?? -1 ), "$path carries the schema's minimum" );
	check_same( (int) $schema[ $key ]['max'], (int) ( $c['max'] ?? -1 ), "$path carries the schema's maximum" );
}

dcc_done();
