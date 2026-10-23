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
	/*
	 * THE ANCHOR IS `dccwl-fl-` PLUS THE REGISTRY ID (1.46.0).
	 *
	 * It was the bare id through 1.45.0. The Director's brief names this
	 * form, /explore/'s "See The Full Entry" link now builds it from
	 * Guide_Page::ANCHOR_PREFIX, and the row answers it by OPENING that
	 * species. Still the registry's own id underneath: a slugged name or an
	 * index would break every such link the first time a name changed.
	 */
	if ( false === strpos( $guide, 'id="' . Guide_Page::ANCHOR_PREFIX . $id . '"' ) ) {
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
 * 1.46.0 CHANGED THE SHAPE OF THIS, AND THE RULE IT ENFORCES DID NOT MOVE.
 *
 * Through 1.45.0 every description sat in normal flow and this suite
 * asserted that no <details> was anywhere near the prose. The page is an
 * app-style list now (Rob's pick from three mockups): each entry is inside
 * a native <details> whose <summary> is the species row.
 *
 * That is the 1.16.0 rule holding rather than bending, and the three
 * assertions below are what make the difference checkable:
 *   - the fold is NATIVE and genuinely openable — a <summary> inside every
 *     <details>, so a visitor with no JavaScript can read any entry;
 *   - nothing carries the `hidden` ATTRIBUTE;
 *   - and this plugin's own stylesheets never set `display: none` on an
 *     entry. A CSS rule of ours hiding content a crawler reads is the
 *     guidelines problem the rule names, whatever the markup around it.
 */
$entries = substr_count( $guide, 'class="dccwl-gp-entry"' );
$details = substr_count( $guide, '<details class="dccwl-gp-details"' );
$summary = substr_count( $guide, '<summary class="dccwl-gp-row"' );
check_same( count( $dataset ), $entries, 'every species entry is in the page' );
check_same( $entries, $details, 'each one inside a native <details>' );
check_same( $entries, $summary, 'each of those with a <summary> a visitor can actually open' );

$guide_css = (string) file_get_contents( dirname( __DIR__, 2 ) . '/dcc-wildlife/assets/css/guide.css' );
$guide_css = preg_replace( '{/\*.*?\*/}s', '', $guide_css );
check(
	0 === preg_match( '/\.dccwl-gp-entry[^{]*\{[^}]*display:\s*none/i', $guide_css ),
	'and no stylesheet of ours hides an entry'
);
$prose = $guide;
/*
 * MATCHED INSIDE A TAG ONLY. The first version searched for the string
 * " hidden" and found the pine warbler, whose field mark is "orange-yellow
 * spots on the hidden surface of the thigh" — a naive scan matching the
 * content it was meant to protect, which is this repository's oldest test
 * trap (1.16.1's grep matching its own documentation).
 */
/*
 * NOTHING INSIDE AN ENTRY CARRIES `hidden` — asked of the entries, not of
 * the page. The page has legitimate hidden CHROME now (the search's clear
 * button, the result line, the desktop pane before anything is chosen),
 * and a whole-page scan would fail on controls while saying nothing about
 * the content it exists to protect.
 *
 * MATCHED INSIDE A TAG ONLY, for the reason the 1.43.0 note gives: a scan
 * for the word " hidden" found the pine warbler, whose field mark names
 * "the hidden surface of the thigh".
 */
preg_match_all( '#<div class="dccwl-gp-entry".*?</div>#s', $guide, $entry_html );
$hidden_entries = 0;
foreach ( $entry_html[0] as $block ) {
	if ( preg_match( '#<[^>]*\shidden[\s>=]#i', $block ) ) {
		$hidden_entries++;
	}
}
check( count( $entry_html[0] ) > 300, 'the entries were found to scan', (string) count( $entry_html[0] ) );
check_same( 0, $hidden_entries, 'and nothing inside one carries the hidden ATTRIBUTE' );
check( false === strpos( $prose, 'loading="eager"' ), 'no image on it is eager-loaded' );

dcc_section( 'the page carries its own chrome' );

check_same( 2, substr_count( $guide, 'dccwl-guidepage-backlink' ), 'a Back To Explore link at the head and the foot' );
check( false !== strpos( $guide, 'Back To Explore' ), 'in Title Case, as the Director asked' );

/*
 * THE PINNED CONTROLS (1.46.0), in the Director's Option 1 order. The jump
 * list they replace is RETIRED, not renamed: a list of nine headings on a
 * page that now filters itself would be a second, worse control for the
 * same job.
 */
check( false !== strpos( $guide, 'data-dccwl-gp-top' ), 'the pinned block is rendered' );
check( false !== strpos( $guide, 'data-dccwl-gp-scope="here"' ), 'with the Seen Here switch' );
check( false !== strpos( $guide, 'data-dccwl-gp-scope="wider"' ), 'and its Wider Florida half' );
check( false !== strpos( $guide, 'data-dccwl-gp-search' ), 'a search field' );
check( false !== strpos( $guide, 'data-dccwl-gp-pills' ), 'and the group pills' );

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
 * 1.43.0's rule here was "no dcc-wildlife script is enqueued", and it was
 * right about the page it described: 402 descriptions in normal flow need
 * no script. An app-style list does, so the assertion is now an EXACT LIST
 * rather than an empty one — the point was never zero scripts, it was that
 * nothing arrives on this page without a reason that can be named.
 *
 * `dcc-wildlife-sheet` rides along as guide.js's declared dependency, which
 * is how a species opens in the same drawer as everywhere else; widget.js,
 * deck.js, canal.js and water.js are all still absent, and that is what
 * this list says.
 */
/*
 * READ FROM THE HARNESS'S OWN RECORD of what was enqueued, not from
 * $wp_scripts — which does not exist under these stubs, so the 1.43.0
 * version of this assertion was comparing [] against [] and would have
 * passed for a page that enqueued the whole plugin. A test that can only
 * pass is this harness's oldest prohibition, and this one had been green
 * for three releases.
 */
dccwl_test_reset();
dcc_reset_once_guards();
Guide_Page::shortcode( [] );
$enqueued = (array) $GLOBALS['dccwl_test']['enqueued'];
$ours     = array_values( array_unique( array_filter( $enqueued, static fn( $h ): bool => 0 === strpos( (string) $h, 'dcc-wildlife' ) && false === strpos( (string) $h, 'css' ) ) ) );
sort( $ours );
check_same(
	[ 'dcc-wildlife-guide' ],
	$ours,
	'the guide page enqueues its own stylesheet and script and nothing else',
	implode( ', ', $ours )
);

dcc_done();
