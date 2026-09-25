<?php
/**
 * Admin surface: where the page lands, and who is allowed to do what.
 *
 * The menu assertions exist because the `dcc` parent is shared by several
 * plugins and a priority collision makes a page vanish. The security
 * assertions exist because a capability check on render without one on save
 * is not a check at all.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();

use DCC_WL\Water_Admin;
use DCC_WL\Water_Data;

dcc_section( 'menu registration' );

dccwl_test_reset();
Water_Admin::register_hooks();
$menu_hooks = array_values( array_filter( $GLOBALS['dccwl_test']['actions'], static fn( array $a ): bool => 'admin_menu' === $a[0] ) );
check_same( 1, count( $menu_hooks ), 'exactly one admin_menu hook is registered' );
check_same( 63, $menu_hooks[0][2], 'it runs at priority 63, the slot this plugin owns' );

// The shared parent is registered by a site-side mu-plugin. This plugin must
// never register it: two registrations of one slug lose a page.
$parent_calls = array_filter(
	$GLOBALS['dccwl_test']['actions'],
	static fn( array $a ): bool => is_array( $a[1] ) && 'add_parent' === ( $a[1][1] ?? '' )
);
check_same( [], $parent_calls, 'the plugin registers no admin parent of its own' );

dcc_section( 'the page lands under the shared DCC parent' );

dccwl_test_reset();
$GLOBALS['admin_page_hooks'] = [ Water_Admin::PARENT => 'dcc' ];
Water_Admin::add_page();
check_same( 1, count( $GLOBALS['dccwl_test']['menu'] ), 'one page is registered, not two' );
$entry = $GLOBALS['dccwl_test']['menu'][0];
check_same( 'submenu', $entry['type'], 'it is a submenu entry' );
check_same( 'dcc', $entry['parent'], 'its parent is the shared dcc menu' );
check_same( 'manage_options', $entry['cap'], 'it requires manage_options to appear' );

dcc_section( 'a taken slug is not claimed twice' );

dccwl_test_reset();
$GLOBALS['admin_page_hooks'] = [ Water_Admin::PARENT => 'dcc' ];
$GLOBALS['submenu']         = [ Water_Admin::PARENT => [ [ 'Wildlife', 'manage_options', Water_Admin::SLUG ] ] ];
Water_Admin::add_page();
check_same(
	Water_Admin::SLUG_ALT,
	$GLOBALS['dccwl_test']['menu'][0]['slug'],
	'when the preferred slug is already present the alternate is used'
);
unset( $GLOBALS['submenu'] );

dcc_section( 'rendering is capability-gated' );

dccwl_test_reset();
$GLOBALS['dccwl_test']['caps'] = false;
$died = false;
try {
	ob_start();
	Water_Admin::render_page();
	ob_end_clean();
} catch ( \RuntimeException $e ) {
	ob_end_clean();
	$died = str_contains( $e->getMessage(), 'wp_die' );
}
check( $died, 'render_page() calls wp_die for a visitor without manage_options' );

dccwl_test_reset();
ob_start();
Water_Admin::render_page();
$page = (string) ob_get_clean();
check( strlen( $page ) > 500, 'an administrator gets a real page', strlen( $page ) . ' bytes' );
check_contains( $page, 'option_page', 'the settings form carries its nonce fields' );
check_contains( $page, '_wpnonce', 'a nonce field is emitted' );

dcc_section( 'saving is capability-gated AND nonce-checked' );

dccwl_test_reset();
$GLOBALS['dccwl_test']['caps'] = false;
$blocked = false;
try {
	Water_Admin::handle_photo_import();
} catch ( \Throwable $e ) {
	$blocked = true;
}
check( $blocked, 'the photo import refuses a visitor without manage_options' );

dccwl_test_reset();
$GLOBALS['dccwl_test']['nonce_ok'] = false;
$blocked = false;
try {
	Water_Admin::handle_photo_import();
} catch ( \Throwable $e ) {
	$blocked = str_contains( $e->getMessage(), 'nonce' );
}
check( $blocked, 'the photo import refuses a request with a bad nonce' );

dcc_section( 'stored values are escaped on the way out' );

// A stored option is not trustworthy: it may have been written by an older
// version, a migration, or a different plugin.
dccwl_test_reset();
$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = array_merge(
	Water_Data::defaults(),
	[
		'atlas_base'     => '"><script>alert(1)</script>',
		'map_sat_attrib' => '"><img src=x onerror=alert(1)>',
		'primary_water'  => '"><b>x</b>',
	]
);
ob_start();
Water_Admin::render_page();
$page = (string) ob_get_clean();
check_lacks( $page, '<script>alert(1)', 'a script tag in a stored option never reaches the page unescaped' );
// What matters is that the value cannot BREAK OUT of its attribute. The
// characters that would do it are entity-encoded, so the payload survives as
// inert text — which is correct, because the owner still has to be able to
// see and edit whatever is stored.
check_lacks( $page, '"><img', 'a stored value cannot close its attribute and open a tag' );
check_lacks( $page, '"><script', 'nor open a script tag' );
check_contains( $page, '&lt;script&gt;', 'it appears entity-encoded instead, so the value stays editable' );
check_contains( $page, '&quot;&gt;&lt;img', 'the img payload is encoded in place rather than stripped' );

dcc_section( 'REST permissions' );

dccwl_test_reset();
\DCC_WL\Water_Rest::register_routes();
$routes = $GLOBALS['dccwl_test']['routes'];
check( count( $routes ) >= 5, 'every route is registered', count( $routes ) . ' routes' );

$public = [];
$gated  = [];
foreach ( $routes as $r ) {
	$cb = $r['args']['permission_callback'] ?? null;
	$name = (string) $r['route'];
	if ( '__return_true' === $cb ) { $public[] = $name; } else { $gated[] = $name; }
}
sort( $public );
sort( $gated );
check_same( [ '/conditions', '/map' ], $public, 'exactly two routes are public, and they are the two a guest needs' );
check_same(
	[ '/discover-gauges', '/discover-waters', '/test-atlas' ],
	$gated,
	'every discovery and diagnostic route is gated'
);

// A gated route must gate on a capability, not merely on being logged in.
foreach ( $routes as $r ) {
	$cb = $r['args']['permission_callback'] ?? null;
	if ( '__return_true' === $cb ) { continue; }
	$allows = is_callable( $cb ) ? (bool) $cb() : false;
	$GLOBALS['dccwl_test']['caps'] = false;
	$denies = is_callable( $cb ) ? ! $cb() : false;
	$GLOBALS['dccwl_test']['caps'] = true;
	check( $allows && $denies, "the {$r['route']} route allows an administrator and refuses everyone else" );
}

dcc_done();
