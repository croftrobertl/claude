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
		} elseif ( 'DCC_WL_DIR . $map [ $class ]' === $expr ) {
			/*
			 * THE AUTOLOADER'S OWN REQUIRE (1.45.0). Classified, not followed,
			 * for a reason this suite CHECKS rather than assumes: its target is
			 * never a literal path, it is whatever $map holds -- and that map is
			 * parsed out of the same plugin file in its own section below, where
			 * every entry is proved to exist, to live in includes/, and to really
			 * define the class it claims. So the files this line can reach are
			 * already on the loaded list by a STRONGER route than following a
			 * string would give.
			 *
			 * MATCHED EXACTLY, never by a pattern over variable requires.
			 * `DCC_WL_DIR . $anything` in general is a hole of precisely the
			 * shape 1.33.0's fatal came through, and must keep failing; only
			 * this one line, whose map is independently verified, is recognised.
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

dcc_section( 'the autoload map resolves, and it is read from the plugin (1.45.0)' );

/*
 * 1.45.0 MOVED ONE FILE OFF THE REQUIRE GRAPH AND ONTO AN AUTOLOADER:
 * class-species.php is 559 KB and was parsed on every request, including
 * admin screens, cron and wp-login, none of which read a species.
 *
 * This suite failed the moment that landed — correctly, and that is the
 * point of it. The rule it enforces has not changed (a class the plugin
 * CALLS must be loadable when WordPress runs it); only the mechanism has.
 * So the map is READ FROM THE PLUGIN FILE, as text, exactly as the requires
 * are, and each entry is proved three ways: the file exists, it is in
 * includes/, and it really defines the class the map claims.
 *
 * DO NOT "simplify" this by calling class_exists() or by registering the
 * autoloader here. That is the blind spot test-bootstrap.php exists to
 * close — a suite that loads a class by its own route can never see that
 * production could not.
 */
$entry_txt = (string) file_get_contents( $plugin_dir . '/' . $entry );
$autoload  = [];
if ( preg_match( '/spl_autoload_register\s*\(.*?\);/s', $entry_txt, $block ) ) {
	if ( preg_match_all( "/'([A-Za-z_\\\\]+)'\s*=>\s*'([^']+\.php)'/", $block[0], $m, PREG_SET_ORDER ) ) {
		foreach ( $m as $row ) {
			$autoload[ $row[1] ] = $row[2];
		}
	}
}
check( count( $autoload ) > 0, 'the plugin registers an autoload map and it parses', json_encode( $autoload ) );

$auto_files = [];
foreach ( $autoload as $fqcn => $rel ) {
	$abs = $plugin_dir . '/' . $rel;
	check( is_file( $abs ), "the autoloaded file exists: $rel" );
	check( 0 === strpos( $rel, 'includes/' ), "and it lives in includes/: $rel" );
	$short = substr( (string) strrchr( str_replace( '\\\\', '\\', $fqcn ), '\\' ), 1 );
	if ( '' === $short ) {
		$short = $fqcn;
	}
	$txt = is_file( $abs ) ? (string) file_get_contents( $abs ) : '';
	check(
		(bool) preg_match( '/^\s*(?:final\s+|abstract\s+)?class\s+' . preg_quote( $short, '/' ) . '\b/mi', $txt ),
		"and it really defines class $short"
	);
	$auto_files[] = $rel;
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
/*
 * An AUTOLOADED file is loadable too (1.45.0) — WordPress reaches it the
 * moment the class is named — so it belongs on this list beside the
 * required ones. It is added from the map parsed out of the plugin file
 * above, never from a guess about what might be autoloadable: a file nobody
 * requires AND nobody maps is still an orphan and still fails.
 */
$loaded  = array_values( array_unique( array_merge( $loaded, $auto_files ) ) );
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
