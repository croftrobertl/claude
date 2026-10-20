<?php
/**
 * Server-rendered output, and the inline config the client reads.
 *
 * Asserts on real rendered markup, never on "the function was called". The
 * inline config matters as much as the HTML: it is where dead keys accumulate
 * unnoticed, because nothing visibly breaks when one is wrong.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();

use DCC_WL\Render;
use DCC_WL\Canal_Render;
use DCC_WL\Species;

/** Render a shortcode and hand back both the HTML and the inline config JSON. */
function dcc_render( string $which ): array {
	dccwl_test_reset();
	ob_start();
	$html = 'canal' === $which ? Canal_Render::shortcode( [] ) : Render::shortcode( [] );
	$echoed = (string) ob_get_clean();
	// EVERY inline script, unfiltered. An earlier version of this helper only
	// kept blocks matching a substring, and quietly dropped the hub's config
	// when that substring happened not to appear in it.
	$config = '';
	foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
		$config .= (string) $data . "\n";
	}
	return [ 'html' => $echoed . $html, 'config' => $config ];
}

/** Render again WITHOUT resetting, to observe the once-per-page guards. */
function dcc_render_again( string $which ): array {
	$before = count( $GLOBALS['dccwl_test']['inline'] );
	ob_start();
	$html   = 'canal' === $which ? Canal_Render::shortcode( [] ) : Render::shortcode( [] );
	$echoed = (string) ob_get_clean();
	$config = '';
	foreach ( array_slice( $GLOBALS['dccwl_test']['inline'], $before ) as [ $handle, $data ] ) {
		$config .= (string) $data;
	}
	return [ 'html' => $echoed . $html, 'config' => $config ];
}

dcc_section( 'the month widget renders' );

$m = dcc_render( 'month' );
check( strlen( $m['html'] ) > 5000, 'it produces substantial markup', strlen( $m['html'] ) . ' bytes' );
check_contains( $m['html'], 'dccwl-root', 'the root class is present' );
check_contains( $m['html'], 'data-dccwl-group', 'the category tabs are server-rendered' );
check_same( 6, substr_count( $m['html'], 'data-dccwl-group="' ), 'six group-bearing nodes: three tabs and three grids' );
/*
 * THE PEAK NOW TAB IS GONE (1.44.0) and so is `Render::PEAK_TAB`. It became
 * "This Month" in the Month menu, so what used to be a fourth tab slug is
 * now one option in a listbox — asserted here by its data attribute rather
 * than by a constant, because there is no constant to agree with any more.
 */
check_contains( $m['html'], 'data-dccwl-month="now"', 'the Month menu offers "This Month" (what Peak Now became)' );
check_contains( $m['html'], 'data-dccwl-month="any"', 'the Month menu offers "Any Month", the default' );
check_same( 14, substr_count( $m['html'], 'data-dccwl-month="' ), 'fourteen options: Any, This Month and twelve months' );
check_contains( $m['html'], 'role="tablist"', 'the section tabs are a real tablist' );
check_same( 3, substr_count( $m['html'], 'role="tabpanel"' ), 'each grid is the tabpanel its tab controls' );
check_contains( $m['html'], 'data-dccwl-badges', 'the badge key is behind the chip row\'s info chip' );
check_contains( $m['html'], 'id="dccwl-badgekey"', 'and the key it controls is server-rendered, not built by script' );

dcc_section( 'the canal hub renders and composes' );

$c = dcc_render( 'canal' );
check( strlen( $c['html'] ) > 5000, 'the hub produces substantial markup', strlen( $c['html'] ) . ' bytes' );
check_contains( $c['html'], 'data-dccwl-group', 'the hub carries the same tab contract' );
// The footnote row belongs to the month widget's guide, which the hub
// composes rather than duplicates — so it is asserted on the month output.
check_contains( $m['html'], 'dccwl-footnotes', 'the footnote row renders with the guide' );
check_lacks( $c['html'], 'dccwl-footnotes', 'the hub does not render a second footnote row of its own' );

dcc_section( 'no month or clock is baked into server HTML' );

// The cache doctrine: three cache layers mean a month baked at render time
// would be served into the following month. The client computes it in canal
// time instead, so the current month name must not appear in the markup.
$month_now = gmdate( 'F' );
foreach ( [ 'month' => $m, 'canal' => $c ] as $name => $out ) {
	check_lacks( $out['html'], '"' . $month_now . '"', "the $name markup does not bake the current month as a value" );
	check( 1 !== preg_match( '/data-dccwl-(now|today|current-month)=/', $out['html'] ), "the $name markup carries no server-stamped now" );
}

dcc_section( 'the countdown is retired, and says so consistently' );

$possible = ( new ReflectionMethod( Render::class, 'countdown_possible' ) )->invoke( null );
check_same( false, $possible, 'countdown_possible() is hard-false — the feature is retired' );
check_lacks( $m['html'], 'dccwl-countdown', 'no countdown markup reaches the page' );

dcc_section( 'the inline config' );

check( '' !== $m['config'], 'the month widget emits an inline config' );
check_contains( $m['config'], '"i18n"', 'the config carries the i18n table the scripts read' );

// Every key the scripts actually read must exist, or a fallback English
// literal ships instead of the translated string.
$json = null;
if ( preg_match( '/=\s*(\{.*\})\s*;?\s*$/s', $m['config'], $mm ) ) {
	$json = json_decode( $mm[1], true );
}
check( is_array( $json ), 'the inline config is valid JSON' );
if ( is_array( $json ) ) {
	check( isset( $json['i18n'] ) && is_array( $json['i18n'] ), 'i18n is an object' );
	check( count( $json['i18n'] ) > 20, 'the i18n table is populated', 'keys: ' . count( $json['i18n'] ?? [] ) );
	// Some i18n entries are nested tables (month names, for instance), so
	// only the scalar leaves are checked for emptiness.
	$blank = [];
	array_walk_recursive(
		$json['i18n'],
		static function ( $v, $k ) use ( &$blank ): void {
			if ( is_scalar( $v ) && '' === trim( (string) $v ) ) { $blank[] = (string) $k; }
		}
	);
	check_same( [], $blank, 'no i18n string is blank', implode( ', ', $blank ) );
}

dcc_section( 'no dead keys in the config' );

// photoBase advertised .../assets/photos/, which 1.30.0 stopped shipping. It
// was a 404 in every page's config, and a dead path invites someone to use it.
check_lacks( $m['config'], 'photoBase', 'the dead photoBase path is gone from the month config' );
check_lacks( $c['config'], 'photoBase', 'and from the hub config' );

// The config is emitted ONCE PER PAGE, guarded by a static. That is what keeps
// two widgets on one page from shipping 54KB of identical JSON twice — and it
// is why this suite reuses the first render of each widget rather than
// rendering again. A second render legitimately emits nothing, and a test that
// re-rendered would silently assert against an empty string.
$again = dcc_render_again( 'canal' );
check_same( '', $again['config'], 'a second render on the same page emits no second config' );
check( strlen( $again['html'] ) > 1000, 'though it still renders its markup' );

dcc_section( 'the hub carries its own age words' );

// These used to live ONLY in the water module's config. On a hub page with the
// water section off or auto-hidden, canal.js fell back to hardcoded English
// that LocoTranslate never sees.
$hub = null;
// Greedy to the LAST closing brace: the hub's config is the final assignment
// in the block, and a non-greedy match stops at the first nested object.
if ( preg_match( '/DCC_WL_CANAL\s*=\s*(\{.*\})\s*;/s', $c['config'], $mm ) ) {
	$hub = json_decode( $mm[1], true );
}
check( is_array( $hub ), 'the hub config parses' );

/*
 * THE AGE WORDS LEFT THE HUB'S TABLE IN 1.44.0, AND THIS IS ASSERTED AS AN
 * ABSENCE RATHER THAN DELETED.
 *
 * 1.33.0 put them there because canal.js formatted a reading's age for the
 * Water preview tile, the words lived ONLY in the water module's config, and
 * on a page with the water section off or auto-hidden canal.js fell through
 * to hardcoded 'today' / 'd' / 'mo' / 'y' — strings LocoTranslate never sees
 * and so cannot translate at all.
 *
 * Rob removed the hub, so `ageWords()` went with the preview it served. The
 * words are NOT a second copy waiting to be wired back in: water.js and
 * water-map.js read `DCC_WL_WATER.i18n`, which Water_Render still emits and
 * which this release did not touch. Asserting the absence is what keeps the
 * two tables from quietly becoming two sources again — and the untranslated
 * literal, which is the defect that mattered, is asserted directly below.
 */
foreach ( [ 'ageToday', 'ageDays', 'ageMonths', 'ageYears' ] as $k ) {
	check(
		! isset( $hub['i18n'][ $k ] ),
		"the hub config no longer carries i18n.$k — canal.js formats no ages"
	);
}

$canal_js = (string) file_get_contents( dirname( __DIR__, 2 ) . '/assets/js/canal.js' );
check_lacks( $canal_js, "|| 'today'", 'and canal.js carries no English age literal of its own' );
check_lacks( $canal_js, 'ageWords', 'the formatter itself is gone, not merely unused' );

/* The water module keeps its own table, which is the single source now. */
$water_i18n = '';
foreach ( $GLOBALS['dccwl_test']['inline'] as [ $handle, $data ] ) {
	if ( false !== strpos( (string) $data, 'DCC_WL_WATER' ) ) { $water_i18n .= (string) $data; }
}
if ( '' !== $water_i18n ) {
	check_contains( $water_i18n, 'ageToday', 'the water module still ships the age words it reads' );
}

dcc_section( 'the credits panel is no longer on this page (1.43.0)' );

/*
 * It was 108,284 bytes — more than half of what was left of /explore/'s
 * markup once the prose and the tiles had gone. The Director allowed it to
 * move provided the Credits entry stays visible and one tap away here and on
 * every species sheet, and it does: a link, in the footnote row, to the panel
 * that /wildlife-guide/ renders permanently.
 *
 * THE PER-PHOTO SOURCE LINKS MOVED WITH IT and are asserted where they now
 * live, in test-guide-page.php. They are a licence surface; the assertion
 * followed the surface rather than being deleted with it.
 */
check_lacks( $m['html'], 'dccwl-photo-credits-list', 'the credits list is not inlined here' );
check_matches( $m['html'], '/dccwl-footnote-credits/', 'but the Credits entry is still in the row' );
preg_match_all( '/<a\s[^>]*>source<\/a>/', $m['html'], $links );
check_same( 0, count( $links[0] ), 'and no per-photo source link is left behind' );
$unlabelled = array_values( array_filter( $links[0], static fn( string $a ): bool => ! str_contains( $a, 'aria-label=' ) ) );
check_same( [], $unlabelled, 'every one of them carries an aria-label', implode( ' | ', array_slice( $unlabelled, 0, 2 ) ) );

preg_match_all( '/<a\s[^>]*aria-label="([^"]*)"[^>]*>source<\/a>/', $m['html'], $labels );
$unique = array_unique( $labels[1] );
check_same( count( $labels[1] ), count( $unique ), 'and every label is distinct, naming its own species' );

dcc_section( 'assets are enqueued only when something renders' );

dccwl_test_reset();
check_same( [], $GLOBALS['dccwl_test']['enqueued'], 'nothing is enqueued before a widget renders' );
dcc_render( 'month' );
check( in_array( 'dcc-wildlife', $GLOBALS['dccwl_test']['enqueued'], true ), 'rendering enqueues the widget bundle' );

dcc_section( 'the hub preview cards are gone with the hub (1.44.0)' );

/*
 * RETIRED WITH THE THING THEY GUARDED. 1.33.0 item 3 made the hub's Water
 * door say "Checking the canal…" server-side, so a card waiting on a fetch
 * read as thinking rather than as empty. Rob removed the hub in 1.44.0:
 * /explore/ opens straight into Water, so there is no door, no preview line
 * and nothing to wait behind.
 *
 * Pinned as a NEGATIVE rather than deleted, because this also closes a nit
 * reported during the 1.42.0 audit and left alone then: with no JavaScript,
 * "Checking the canal…" never resolved. It cannot now, because it is not
 * rendered at all.
 */
dccwl_test_reset();
dcc_reset_once_guards();
$hub = dcc_render( 'canal' )['html'];
check_lacks( $hub, 'Checking the canal', 'no hub preview line is rendered' );
check_lacks( $hub, 'data-dccwl-preview', 'and no preview slot is left behind' );
check_lacks( $hub, 'dccwl-levelbar', 'nor the level bar the dropdown replaced' );
check_matches( $hub, '/data-dccwl-viewselect/', 'the view dropdown is what titles the section now' );

dcc_section( 'a long body can be closed from its foot (1.33.0, item 4f)' );

/*
 * Rendered HIDDEN. Without JavaScript a <details> answers only to its own
 * <summary>, so an always-visible button here would be a dead control — and
 * this prose exists precisely for the guest with no JavaScript and one bar.
 */
/*
 * NONE ON THIS PAGE SINCE 1.43.0. Both long folds have gone: the prose to
 * /wildlife-guide/ and the credits panel with it. What remains in the row is
 * three links and the water module's short "About" fold, which is not long
 * enough to need a way out of its own foot.
 *
 * Pinned at zero rather than deleted: if a long fold ever returns to this
 * page without a close control, this says so.
 */
check_same(
	0,
	substr_count( $hub, 'data-dccwl-fullguide-close' ),
	'no close control is needed — /explore/ has no long fold left'
);

dcc_section( 'the tile photo\'s srcset is the client\'s now (1.43.0)' );

/*
 * THESE ASSERTIONS MOVED SURFACE, AND THAT IS THE NEWS.
 *
 * 1.42.0 gave the server-rendered tile a srcset and pinned it against the
 * hub's HTML. 1.43.0 ships the grids EMPTY — 409 tiles were 299,662 bytes of
 * markup on a page that opens on Water — so there is no server-rendered tile
 * to inspect, and `Render::tile_media()` / `tile_srcset()` were deleted
 * rather than kept as unreachable code.
 *
 * What replaces them is stronger, not weaker: ui-theme.mjs asserts WHICH FILE
 * a browser actually fetches, on a real render, at 390/DPR2 (the 320),
 * 390/DPR3 (the 600) and 1680/DPR2 (the 600). A markup check could never have
 * told us that.
 *
 * What stays here is the part a browser suite cannot see — that the client's
 * `sizes` string is still the one declared in PHP, so the measurements
 * recorded beside `Render::TILE_SIZES` remain the single source of it.
 */
check_lacks( $hub, '<img class="dccwl-tile-photo"', 'the hub server-renders no tile photo at all' );
check_matches( $hub, '/data-dccwl-lazy="1"/', 'its grids are marked for the client to fill' );

$js = (string) file_get_contents( DCC_WL_DIR . 'assets/js/widget.js' );
check_matches( $js, '/img\.srcset = sp\.src\.thumb \+ . 320w, ./', 'the client builds the srcset' );
check_matches( $js, '/img\.sizes = TILE_SIZES;/', 'and applies the shared sizes string' );
if ( preg_match( "/var TILE_SIZES = '([^']+)'/", $js, $jm ) ) {
	$ref = new \ReflectionClass( Render::class );
	check_same(
		$ref->getConstant( 'TILE_SIZES' ),
		$jm[1],
		'which is still exactly Render::TILE_SIZES'
	);
} else {
	check( false, 'the client declares TILE_SIZES' );
}

/*
 * AND THE GRIDS CARRY NO TILES BUT STILL CARRY THEIR CATEGORY COUNTS. 1.38.0:
 * a count beside a category is a promise about what choosing it shows, so it
 * is server-rendered and in the page for a crawler and for a guest whose
 * JavaScript has not arrived. Emptying the grids must not have taken it.
 */
check_matches( $hub, '/data-dccwl-pick/', 'the category picker is still server-rendered' );

dcc_section( 'escaping' );

// A stored title must not be able to open a tag. This is the one place a
// person-supplied string reaches server HTML.
dccwl_test_reset();
ob_start();
$evil = Render::shortcode( [ 'title' => '"><script>alert(1)</script>' ] );
$evil = (string) ob_get_clean() . $evil;
check_lacks( $evil, '<script>alert(1)', 'a script injected through a shortcode attribute is escaped' );

dcc_done();
