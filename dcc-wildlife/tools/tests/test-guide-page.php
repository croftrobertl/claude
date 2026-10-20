<?php
/**
 * THE WILDLIFE GUIDE PAGE (1.43.0) — /wildlife-guide/.
 *
 * What this suite exists to hold, and each line of it maps to a mutation the
 * Director asked for:
 *
 *  - EVERY DESCRIPTION IS IN THE HTML. This is the whole reason the page
 *    exists. Rob chose "move it to its own page" over "build it on demand"
 *    precisely so the prose stays crawlable, so a description that stops
 *    appearing is the defect this release was built to avoid.
 *  - AND IT IS GONE FROM /explore/. The two halves are one claim: the weight
 *    left the app page AND the words survived. Asserting only the first would
 *    pass for a release that simply deleted the guide.
 *  - THE ANCHORS ARE THE REGISTRY'S OWN IDS. Other pages will link to
 *    /wildlife-guide/#alligator. An anchor invented by the renderer — a
 *    slugged name, an index — would break every such link silently the first
 *    time a name changed.
 *  - NOTHING IS HIDDEN. No `hidden`, no `<details>` around the prose, no
 *    fetch. The 1.16.0 rule did not get weaker by moving house.
 *  - THE CREDITS FOLLOW THE PHOTOGRAPHS. Four carry a real CC BY obligation
 *    plus the modification notice; a page showing 402 photographs without
 *    them is a licence breach, not a missing nicety.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();

use DCC_WL\Canal_Render;
use DCC_WL\Guide_Page;
use DCC_WL\Species;

/** Render one surface, capturing anything echoed as well as what is returned. */
function dcc_page( string $which ): string {
	dccwl_test_reset();
	ob_start();
	$out = 'guide' === $which ? Guide_Page::shortcode( [] ) : Canal_Render::shortcode( [] );
	return (string) ob_get_clean() . $out;
}

$guide   = dcc_page( 'guide' );
$explore = dcc_page( 'explore' );
$dataset = Species::dataset();

check( count( $dataset ) > 300, 'the dataset is the real registry', (string) count( $dataset ) );
check( strlen( $guide ) > 100000, 'the guide page rendered something substantial', number_format( strlen( $guide ) ) . ' bytes' );

dcc_section( 'every species description is in the guide page HTML' );

$missing_fact   = [];
$missing_name   = [];
$missing_anchor = [];
foreach ( $dataset as $sp ) {
	$id = (string) $sp['id'];
	if ( '' !== (string) $sp['fact'] && false === strpos( $guide, esc_html( (string) $sp['fact'] ) ) ) {
		$missing_fact[] = $id;
	}
	if ( false === strpos( $guide, esc_html( (string) $sp['name'] ) ) ) {
		$missing_name[] = $id;
	}
	// THE ANCHOR IS THE REGISTRY ID, verbatim.
	if ( false === strpos( $guide, 'id="' . $id . '"' ) ) {
		$missing_anchor[] = $id;
	}
}
check_same( [], $missing_fact, 'no species description is missing' );
check_same( [], $missing_name, 'no species name is missing' );
check_same( [], $missing_anchor, 'every species has an anchor matching its own id' );

dcc_section( 'and it is gone from /explore/' );

$left_behind = 0;
foreach ( $dataset as $sp ) {
	if ( '' !== (string) $sp['fact'] && false !== strpos( $explore, esc_html( (string) $sp['fact'] ) ) ) {
		$left_behind++;
	}
}
check_same( 0, $left_behind, 'no species description is still rendered into /explore/' );
check(
	false !== strpos( $explore, 'dccwl-footnote-guide' ),
	'/explore/ links to the guide page instead'
);
check(
	false !== strpos( $explore, esc_url( Guide_Page::url() ) ),
	'and the link points at the guide page URL',
	Guide_Page::url()
);

dcc_section( 'nothing on the guide page is hidden from a crawler' );

/*
 * The prose must be in normal flow. A <details> would make it a fold again
 * and `hidden` would make it the guidelines problem the 1.16.0 rule names.
 * Checked against the PROSE region only — the credits panel below it is
 * legitimately a fold, as it is on /explore/.
 */
/*
 * Structural, not a substring hunt. The FIRST <details> on this page is the
 * credits panel — the prose region is everything before it — and the test's
 * own first version cut the page at the class attribute INSIDE that tag,
 * which left "<details" in the region it was checking and failed against a
 * page that was correct. The boundary is the tag, so find the tag.
 */
$first_details = strpos( $guide, '<details' );
check( false !== $first_details, 'the credits fold is present to mark the end of the prose' );
$prose = false === $first_details ? $guide : substr( $guide, 0, $first_details );

$last_article = strrpos( $guide, '<article class="dccwl-fg"' );
check( false !== $last_article, 'the prose rendered articles' );
check(
	false !== $last_article && false !== $first_details && $last_article < $first_details,
	'every species article sits BEFORE the first fold — none is inside one'
);
check( false === strpos( $prose, '<details' ), 'the prose region holds no <details>' );
/*
 * MATCHED INSIDE A TAG ONLY. The first version searched for the string
 * " hidden" and found the pine warbler, whose field mark is "orange-yellow
 * spots on the hidden surface of the thigh" — a naive scan matching the
 * content it was meant to protect, which is this repository's oldest test
 * trap (1.16.1's grep matching its own documentation).
 */
check(
	0 === preg_match( '#<[^>]*\shidden[\s>=]#i', $prose ),
	'and nothing in it carries the hidden ATTRIBUTE'
);
check( false === strpos( $prose, 'loading="eager"' ), 'no image on it is eager-loaded' );

dcc_section( 'the page carries its own chrome' );

check( false !== strpos( $guide, 'dccwl-guidepage-intro' ), 'a centred intro' );
check_same( 2, substr_count( $guide, 'dccwl-guidepage-backlink' ), 'a Back To Explore link at the head and the foot' );
check( false !== strpos( $guide, 'Back To Explore' ), 'in Title Case, as the Director asked' );
check( false !== strpos( $guide, 'dccwl-guidepage-toc' ), 'and a jump list' );

/*
 * THE JUMP LIST MUST POINT AT HEADINGS THAT EXIST. A list entry for a group
 * that rendered nothing is the same defect as a category count promising more
 * than it shows (1.38.1).
 */
preg_match_all( '#<a href="\#(group-[^"]+|section-[^"]+)"#', $guide, $m );
$dangling = [];
foreach ( array_unique( $m[1] ) as $target ) {
	if ( false === strpos( $guide, 'id="' . $target . '"' ) ) {
		$dangling[] = $target;
	}
}
check( count( $m[1] ) > 3, 'the jump list has entries to check', (string) count( $m[1] ) );
check_same( [], $dangling, 'every jump-list entry points at a heading that exists' );

dcc_section( 'the credits follow the photographs (a licence obligation)' );

check( false !== strpos( $guide, 'dccwl-photo-credits' ), 'the credits panel renders on the guide page' );
// The modification notice covers all 402 renditions and may not be dropped.
check(
	false !== stripos( $guide, 'crop' ) || false !== stripos( $guide, 'resiz' ),
	'and the modification notice is with it'
);

dcc_section( 'every photo-source link says what it is a source for' );

/*
 * MOVED HERE WITH THE PANEL (1.43.0), from test-render.php. 28 links all
 * reading "source" gave a screen-reader user 28 identical destinations with
 * nothing to tell them apart, and that fix is a licence surface — so the
 * assertion followed the surface rather than being dropped when the panel
 * left /explore/.
 */
preg_match_all( '/<a\s[^>]*>source<\/a>/', $guide, $links );
check( count( $links[0] ) > 20, 'the credits list has its per-photo source links', 'found ' . count( $links[0] ) );
check( false !== strpos( $guide, 'dccwl-photo-credits-list' ), 'and the list itself is here' );
check( false !== strpos( $guide, 'id="credits"' ), 'under the anchor /explore/ and the sheet link to' );

dcc_section( 'the guide page loads no JavaScript' );

/*
 * "Nothing heavy runs on load" — the Director's instruction. The page is 402
 * descriptions and two links; it needs no script to be either. Asserted
 * against the ENQUEUED handles, not the markup, because a script registered
 * as a dependency would not appear in this string.
 */
global $wp_scripts;
$enqueued = isset( $wp_scripts->queue ) ? (array) $wp_scripts->queue : [];
$ours     = array_values( array_filter( $enqueued, static fn( $h ): bool => 0 === strpos( (string) $h, 'dcc-wildlife' ) ) );
check_same( [], $ours, 'no dcc-wildlife script is enqueued by the guide page', implode( ', ', $ours ) );

dcc_done();
