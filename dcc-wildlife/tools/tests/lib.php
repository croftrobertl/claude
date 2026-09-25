<?php
/**
 * Assertions for the PHP suites.
 *
 * Rules learned the hard way and enforced here:
 *  - A test that asserts nothing FAILS. `check()` counts, and dcc_done()
 *    refuses to report success on zero assertions, so a suite that silently
 *    stopped early can never look green.
 *  - Every helper takes a description. An anonymous assertion is unreadable
 *    at the moment it breaks.
 *  - The process exit code is the result. Never grep the output for "FAIL".
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

$GLOBALS['dcc_pass'] = 0;
$GLOBALS['dcc_fail'] = 0;
$GLOBALS['dcc_skip'] = 0;

function check( bool $ok, string $what, string $detail = '' ): bool {
	if ( $ok ) {
		++$GLOBALS['dcc_pass'];
		echo "  ok   $what\n";
		return true;
	}
	++$GLOBALS['dcc_fail'];
	echo "  FAIL $what";
	echo '' !== $detail ? "\n         $detail\n" : "\n";
	return false;
}

function check_same( $expected, $actual, string $what ): bool {
	return check(
		$expected === $actual,
		$what,
		'expected ' . var_export( $expected, true ) . ', got ' . var_export( $actual, true )
	);
}

function check_contains( string $haystack, string $needle, string $what ): bool {
	return check( false !== strpos( $haystack, $needle ), $what, "not found: $needle" );
}

function check_lacks( string $haystack, string $needle, string $what ): bool {
	return check( false === strpos( $haystack, $needle ), $what, "unexpectedly present: $needle" );
}

function check_matches( string $haystack, string $re, string $what ): bool {
	return check( 1 === preg_match( $re, $haystack ), $what, "no match for $re" );
}

function dcc_skip( string $what, string $why ): void {
	++$GLOBALS['dcc_skip'];
	echo "  skip $what — $why\n";
}

function dcc_section( string $title ): void {
	echo "\n-- $title\n";
}

/** Exit code IS the result. Zero assertions is a failure, not a pass. */
function dcc_done(): void {
	$p = $GLOBALS['dcc_pass'];
	$f = $GLOBALS['dcc_fail'];
	$s = $GLOBALS['dcc_skip'];
	echo "\n$p passed, $f failed, $s skipped\n";
	if ( 0 === $p + $f ) {
		echo "FAIL: the suite asserted nothing\n";
		exit( 2 );
	}
	exit( $f > 0 ? 1 : 0 );
}

/** Load the stubs, then the plugin's classes, without running the bootstrap. */
function dcc_boot_plugin(): string {
	$root = dirname( __DIR__, 2 );
	require_once __DIR__ . '/wp-stubs.php';
	require_once __DIR__ . '/elementor-stubs.php';
	if ( ! defined( 'DCC_WL_VERSION' ) ) {
		$header = (string) file_get_contents( $root . '/dcc-wildlife.php' );
		preg_match( "/define\(\s*'DCC_WL_VERSION',\s*'([^']+)'/", $header, $m );
		define( 'DCC_WL_VERSION', $m[1] ?? '0' );
		define( 'DCC_WL_PATH', $root . '/' );
		define( 'DCC_WL_URL', 'https://example.test/wp-content/plugins/dcc-wildlife/' );
		define( 'DCC_WL_FILE', $root . '/dcc-wildlife.php' );
	}
	foreach ( glob( $root . '/includes/class-*.php' ) as $f ) {
		require_once $f;
	}
	return $root;
}

/** The version in the plugin header — the single source of truth. */
function dcc_header_version(): string {
	$root = dirname( __DIR__, 2 );
	$src  = (string) file_get_contents( $root . '/dcc-wildlife.php' );
	preg_match( '/^\s*\*\s*Version:\s*(\S+)/m', $src, $m );
	return $m[1] ?? '';
}
