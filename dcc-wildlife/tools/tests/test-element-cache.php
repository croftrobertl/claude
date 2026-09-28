<?php
/**
 * Element Caching insurance (1.33.0).
 *
 * Elementor's Element Caching is ACTIVE on live: `elementor_element_cache_ttl`
 * is 12. Elementor's own default for a third-party widget is already
 * "dynamic", so none of these declarations changes behaviour today. They are
 * here so that a change to that default — or a hosting plugin that flips it —
 * cannot serve a guest a twelve-hour-old river level, or a hub whose "32d"
 * chip is wrong by half a day, without something failing first.
 *
 * The suite also proves the SIGNATURE is the one Elementor declares: the stub
 * base class declares `protected function is_dynamic_content(): bool`, so a
 * widget that narrowed the visibility or changed the return type fatals here
 * rather than on the site.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();
dccwl_test_reset();

/*
 * Every Elementor widget this plugin registers, and WHY each one's output
 * moves. A widget added later without a row here fails the completeness check
 * at the bottom — the list cannot rot.
 */
$widgets = [
	'DCC_WL\Widget'           => [ 'dccwl_month',     'emits the shared inline config, the prose guide and the JSON-LD under once-per-page guards, so a cached copy can leave the page without them' ],
	'DCC_WL\Canal_Widget'     => [ 'dccwl_canal',     'bakes a measured age ("32d") into its HTML, and carries the live water facts' ],
	'DCC_WL\Water_Widget'     => [ 'dccwl_water',     'renders live USGS and NWS readings and the age of each' ],
	'DCC_WL\Countdown_Widget' => [ 'dccwl_countdown', 'is a number of days from today' ],
];

dcc_section( 'every widget declares itself dynamic, and says why' );

foreach ( $widgets as $class => [ $name, $why ] ) {
	if ( ! class_exists( $class ) ) {
		check( false, "$class exists" );
		continue;
	}
	$w = new $class();
	check_same( $name, $w->get_name(), "$class is the $name widget" );
	check_same(
		true,
		$w->dcc_test_is_dynamic_content(),
		"$name is NEVER cached — it $why"
	);
}

dcc_section( 'the declaration is the plugin\'s own, not the base class\'s' );

/*
 * Inheriting the right answer is not the same as declaring it. The whole point
 * of this round is that the answer survives a change to Elementor's default,
 * which only an OWN declaration does.
 */
foreach ( $widgets as $class => [ $name, ] ) {
	if ( ! class_exists( $class ) ) {
		continue;
	}
	$m = new \ReflectionMethod( $class, 'is_dynamic_content' );
	check_same(
		$class,
		$m->getDeclaringClass()->getName(),
		"$name declares is_dynamic_content() itself rather than inheriting it"
	);
	check( $m->isProtected(), "$name keeps Elementor's `protected` visibility" );
	$rt = $m->getReturnType();
	check_same( 'bool', $rt ? $rt->getName() : '', "$name returns bool, as Elementor declares" );
}

dcc_section( 'the list is complete — no widget escapes it' );

/*
 * Discovered, not hand-kept. A hand-kept list is how 1.31.0's guard-reset bug
 * got in: the list said one thing and the code did another, and the list is
 * the part nobody re-reads.
 */
$found = [];
foreach ( get_declared_classes() as $c ) {
	if ( 0 !== strpos( $c, 'DCC_WL\\' ) ) {
		continue;
	}
	if ( is_subclass_of( $c, 'Elementor\\Widget_Base' ) ) {
		$found[] = $c;
	}
}
sort( $found );
$expected = array_keys( $widgets );
sort( $expected );
check_same( $expected, $found, 'the suite covers every Elementor widget the plugin declares' );
check( count( $found ) > 0, 'and it found some, so the check is not vacuous' );

dcc_done();
