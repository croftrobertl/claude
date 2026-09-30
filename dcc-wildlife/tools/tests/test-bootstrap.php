<?php
/**
 * THE SUITE THAT SHOULD HAVE EXISTED BEFORE 1.33.0.
 *
 * 1.33.0 shipped and could not be activated: `dcc-wildlife.php` never
 * require_once'd `includes/class-guide-rest.php`, and `Plugin::register_hooks()`
 * calls `Guide_Rest::register_hooks()` on line 62. WordPress fataled on
 * activation with "Class DCC_WL\Guide_Rest not found".
 *
 * TWENTY-THREE SUITES WERE GREEN THE WHOLE TIME, AND THIS IS WHY: every other
 * suite reaches the code through `dcc_boot_plugin()`, which loads what a TEST
 * needs. WordPress loads what the PLUGIN FILE SAYS. Those are two different
 * graphs, and only one of them ships. A suite that gets its classes any way of
 * its own can never see a missing require — it has already worked around it.
 *
 * So this file deliberately loads NOTHING. It reads the plugin as text, walks
 * the require graph the way PHP would, and answers one question: would every
 * file in includes/ actually be in memory after WordPress loaded the plugin?
 *
 * DO NOT "improve" this by booting the plugin and using class_exists() or
 * get_included_files(). That reintroduces the exact blind spot it exists to
 * close.
 */

declare( strict_types=1 );

require_once __DIR__ . '/lib.php';

$plugin_dir  = dirname( __DIR__, 2 );
$entry       = 'dcc-wildlife.php';

/**
 * Every path this file requires via the DCC_WL_DIR constant.
 *
 * Returns [ resolved paths, unresolved require statements ]. An unresolved
 * require is NOT ignored: it is reported and fails the suite, because a
 * require this parser cannot follow is a hole of exactly the shape the bug
 * came through.
 */
function dcc_requires_in( string $file ): array {
	/*
	 * Tokenised, not regexed. An earlier draft stripped comments with a regex
	 * and mangled every `https://` in the file, which silently produced an
	 * EMPTY require list -- a parser that finds nothing and reports no problem
	 * is the same failure mode as the bug this suite exists to catch. PHP's own
	 * lexer knows what is a comment, what is a string and what is code.
	 */
	$tokens = token_get_all( (string) file_get_contents( $file ) );
	$resolved   = [];
	$unresolved = [];
	$n = count( $tokens );
	for ( $i = 0; $i < $n; $i++ ) {
		$t = $tokens[ $i ];
		if ( ! is_array( $t ) ) {
			continue;
		}
		if ( ! in_array( $t[0], [ T_REQUIRE, T_REQUIRE_ONCE, T_INCLUDE, T_INCLUDE_ONCE ], true ) ) {
			continue;
		}
		// Collect the expression up to the statement terminator.
		$parts = [];
		for ( $j = $i + 1; $j < $n; $j++ ) {
			$u = $tokens[ $j ];
			if ( ! is_array( $u ) ) {
				if ( ';' === $u ) {
					break;
				}
				if ( '(' === $u || ')' === $u ) {
					continue;
				}
				$parts[] = $u;
				continue;
			}
			if ( T_WHITESPACE === $u[0] || T_COMMENT === $u[0] || T_DOC_COMMENT === $u[0] ) {
				continue;
			}
			$parts[] = $u[1];
		}
		$expr = implode( ' ', $parts );
		if ( preg_match( "/^DCC_WL_DIR \\. '([^']+)'$/", $expr, $m ) ) {
			$resolved[] = $m[1];
		} elseif ( preg_match( "/^__DIR__ \\. '\\/?([^']+)'$/", $expr, $m ) ) {
			$resolved[] = $m[1];
		} elseif ( preg_match( "/^ABSPATH \\. '/", $expr ) ) {
			/*
			 * WordPress core, pulled in on demand (wp-admin/includes/image.php
			 * and friends, which are not loaded on a front-end request). Not
			 * this plugin's file, so it is not followed -- but it IS classified,
			 * which is the point: only a require this parser cannot recognise
			 * at all is treated as a hole.
			 */
			continue;
		} else {
			$unresolved[] = $expr;
		}
		$i = $j;
	}
	return [ $resolved, $unresolved ];
}

/**
 * Class names used in a `Name::` static call, read from tokens.
 *
 * A leading backslash or a namespace separator means the name is not ours to
 * resolve, and `self`/`static`/`parent` are not class names at all.
 */
function dcc_static_calls( string $file ): array {
	$tokens = token_get_all( (string) file_get_contents( $file ) );
	$out    = [];
	$n      = count( $tokens );
	for ( $i = 0; $i < $n; $i++ ) {
		$t = $tokens[ $i ];
		if ( ! is_array( $t ) || T_DOUBLE_COLON !== $t[0] ) {
			continue;
		}
		// Walk back over whitespace to the name.
		for ( $j = $i - 1; $j >= 0; $j-- ) {
			$u = $tokens[ $j ];
			if ( is_array( $u ) && T_WHITESPACE === $u[0] ) {
				continue;
			}
			break;
		}
		$u = $tokens[ $j ] ?? null;
		if ( ! is_array( $u ) ) {
			continue;
		}
		$name = (string) $u[1];
		// A qualified name arrives as one token containing a backslash.
		if ( str_contains( $name, '\\' ) ) {
			continue;
		}
		if ( in_array( strtolower( $name ), [ 'self', 'static', 'parent' ], true ) ) {
			continue;
		}
		if ( ! preg_match( '/^[A-Z]/', $name ) ) {
			continue;
		}
		$out[ $name ] = true;
	}
	return array_keys( $out );
}

dcc_section( 'the plugin file loads every file in includes/' );

$on_disk = [];
foreach ( (array) glob( $plugin_dir . '/includes/*.php' ) as $path ) {
	$on_disk[] = 'includes/' . basename( (string) $path );
}
sort( $on_disk );
check( count( $on_disk ) > 0, 'there are files in includes/ to check', count( $on_disk ) . ' files' );

// Walk the graph exactly as PHP would, starting at the plugin's entry file.
$seen       = [];
$unresolved = [];
$queue      = [ $entry ];
while ( $queue ) {
	$rel = array_shift( $queue );
	if ( isset( $seen[ $rel ] ) ) {
		continue;
	}
	$seen[ $rel ] = true;
	$abs = $plugin_dir . '/' . $rel;
	if ( ! is_file( $abs ) ) {
		continue;
	}
	[ $reqs, $bad ] = dcc_requires_in( $abs );
	foreach ( $bad as $b ) {
		$unresolved[] = "$rel: $b";
	}
	foreach ( $reqs as $r ) {
		$queue[] = $r;
	}
}

check_same(
	[],
	$unresolved,
	'every require in the plugin is one this parser can follow',
	implode( ' | ', $unresolved )
);

$loaded  = array_values( array_filter( array_keys( $seen ), static fn( string $f ): bool => str_starts_with( $f, 'includes/' ) ) );
sort( $loaded );
$orphans = array_values( array_diff( $on_disk, $loaded ) );
$ghosts  = array_values( array_diff( $loaded, $on_disk ) );

check_same(
	[],
	$orphans,
	'no file in includes/ is missing from the require chain',
	$orphans ? implode( ', ', $orphans ) . ' — present on disk, never loaded by the plugin' : ''
);
check_same(
	[],
	$ghosts,
	'and the plugin requires no file that is not there',
	implode( ', ', $ghosts )
);
check_same( count( $on_disk ), count( $loaded ), 'the two lists are the same size' );

dcc_section( 'every class the plugin calls is defined by a file it loads' );

/*
 * The assertion that maps onto the actual fatal. The file check above would
 * have caught 1.33.0, but it would NOT catch a class that is called under one
 * name and defined under another. This reads both from source.
 */
$defined = [];
foreach ( $loaded as $rel ) {
	$txt = (string) file_get_contents( $plugin_dir . '/' . $rel );
	if ( preg_match_all( '/^\s*(?:final\s+|abstract\s+)?class\s+(\w+)/mi', $txt, $m ) ) {
		foreach ( $m[1] as $c ) {
			$defined[ $c ] = $rel;
		}
	}
	if ( preg_match_all( '/^\s*interface\s+(\w+)/mi', $txt, $m ) ) {
		foreach ( $m[1] as $c ) {
			$defined[ $c ] = $rel;
		}
	}
	if ( preg_match_all( '/^\s*trait\s+(\w+)/mi', $txt, $m ) ) {
		foreach ( $m[1] as $c ) {
			$defined[ $c ] = $rel;
		}
	}
}
check( count( $defined ) > 0, 'the loaded files define classes', count( $defined ) . ' defined' );

/*
 * Names that are NOT this plugin's own: PHP built-ins, WordPress, Elementor and
 * anything under a leading backslash or another namespace. Only bare
 * PascalCase_Names in our own files are ours to resolve.
 */
const FOREIGN = [
	'WP_Error', 'WP_Query', 'WP_Post', 'WP_REST_Request', 'WP_REST_Response',
	'WP_REST_Server', 'WP_Widget', 'WP_CLI', 'WP_Filesystem_Base',
	'Exception', 'Throwable', 'DateTime', 'DateTimeZone', 'DateTimeImmutable',
	'DateInterval', 'ArrayObject', 'Closure', 'stdClass', 'Elementor',
	'Widget_Base', 'Controls_Manager', 'Plugin_Base',
];

$unknown = [];
foreach ( $loaded as $rel ) {
	// Static calls, read from TOKENS so a class name inside a string or a
	// comment is never mistaken for a call site.
	$m = [ 1 => dcc_static_calls( $plugin_dir . '/' . $rel ) ];
	if ( $m[1] ) {
		foreach ( $m[1] as $c ) {
			if ( ! isset( $defined[ $c ] ) && ! in_array( $c, FOREIGN, true ) && 'self' !== $c && 'static' !== $c && 'parent' !== $c ) {
				$unknown[ "$c (called in $rel)" ] = true;
			}
		}
	}
}
$unknown = array_keys( $unknown );
sort( $unknown );
check_same(
	[],
	$unknown,
	'no loaded file calls a class the loaded files never define',
	implode( ', ', array_slice( $unknown, 0, 8 ) )
);

dcc_done();
