<?php
/**
 * The stylesheet source lint (1.45.0).
 *
 * WHY THIS EXISTS. Four of the findings in the Website Director's 2026-10-22
 * audit were single declarations sitting in plain sight in a stylesheet: a
 * 0.62rem label, a literal 9px wind letter, an 11px map credit, a `vh` sheet
 * height with no `dvh` fallback, and a serif font-family in a plugin that
 * promises never to name a face. Every one of them survived release after
 * release of this module being READ ON LIVE, and the reason is the same in
 * each case: the deployment root is `html { font-size: 20px }`, so 0.7rem
 * renders 14px there and a floor measured in CSS pixels is invisible to
 * anyone looking at the site. A number that can only be checked by reading
 * the source is what a source lint is for.
 *
 * WHAT IT DOES NOT DO. It never renders anything and never resolves the
 * cascade, so it cannot say what a guest's browser computes — ui-mobile.mjs
 * and ui-theme.mjs do that, on the hostile 20px root. This suite answers the
 * narrower question the audit actually asked: does any DECLARATION in this
 * plugin's own CSS state a value the rules forbid.
 *
 * EVERY GATE BELOW NAMES ITS OWN EXCEPTIONS, EXACTLY. An allowlist of
 * patterns would quietly grow to cover the next defect; a list of exact
 * strings has to be edited deliberately, and the edit is the decision.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';

$css_dir = dirname( __DIR__, 2 ) . '/dcc-wildlife/assets/css';
if ( ! is_dir( $css_dir ) ) {
	$css_dir = dirname( __DIR__ ) . '/../assets/css';
}
$files = glob( $css_dir . '/*.css' );
sort( $files );
check( count( $files ) >= 4, 'the plugin stylesheets were found', $css_dir . ' -> ' . count( $files ) . ' files' );

/**
 * Strip comments, then split into [ selector, body ] blocks.
 *
 * Comments go first and they go for a reason beyond tidiness: the rules this
 * suite enforces are DOCUMENTED in comments beside the declarations they
 * govern, which quote the forbidden values verbatim ("was 0.62rem", "a
 * literal 9px"). A lint that read its own documentation would fail on a
 * correctly fixed file -- the same trap as the contrast grep in CLAUDE.md,
 * which has to strip comments before searching for the patterns it describes.
 */
function dcc_css_blocks( string $css ): array {
	$css    = preg_replace( '{/\*.*?\*/}s', '', $css );
	$blocks = [];
	$depth  = 0;
	$sel    = '';
	$body   = '';
	$len    = strlen( $css );
	for ( $i = 0; $i < $len; $i++ ) {
		$c = $css[ $i ];
		if ( '{' === $c ) {
			++$depth;
			if ( 1 === $depth ) {
				continue;
			}
			// An at-rule's inner blocks: keep collecting into the body, which
			// is then parsed recursively by the caller.
		}
		if ( '}' === $c ) {
			--$depth;
			if ( 0 === $depth ) {
				$blocks[] = [ trim( $sel ), $body ];
				$sel      = '';
				$body     = '';
				continue;
			}
		}
		if ( 0 === $depth ) {
			$sel .= $c;
		} else {
			$body .= $c;
		}
	}
	// Flatten one level of at-rules (@media, @supports) so their declarations
	// are linted too: `vh` inside a @media block is the same defect as one
	// outside it, and 1.44.0's tablet rules live in exactly such a block.
	$out = [];
	foreach ( $blocks as [ $s, $b ] ) {
		if ( '' !== $s && '@' === $s[0] && false !== strpos( $b, '{' ) ) {
			foreach ( dcc_css_blocks( $s . '{' . $b . '}' === $s . '{' . $b . '}' ? $b . '}' : $b ) as $inner ) {
				$out[] = [ $inner[0], $inner[1] ];
			}
			continue;
		}
		$out[] = [ $s, $b ];
	}
	return $out;
}

$all_blocks = [];
$sources    = [];
foreach ( $files as $f ) {
	$name = basename( $f );
	foreach ( dcc_css_blocks( (string) file_get_contents( $f ) ) as [ $sel, $body ] ) {
		$all_blocks[] = [ $name, $sel, $body ];
	}
	$sources[ $name ] = preg_replace( '{/\*.*?\*/}s', '', (string) file_get_contents( $f ) );
}
check( count( $all_blocks ) > 200, 'the stylesheets parsed into rule blocks', count( $all_blocks ) . ' blocks' );

/* ======================================================================
 * 1. THE 12px FLOOR (the Director's wording: "Floor is 12px everywhere").
 *
 * Measured on a DEFAULT 16px root, which is the hostile case: the site's
 * 20px root makes every rem value 25% larger, so a size that passes on
 * live can still be 11px for a visitor whose browser is at defaults.
 * 0.75rem is exactly 12px there.
 *
 * `em` is deliberately NOT swept here. An em value is relative to its own
 * parent's computed size, which this suite cannot know -- the three in the
 * plugin are all caret and (i) GLYPHS inside a label, sized to that label
 * rather than stating a text size, and sizing a glyph is a design choice
 * that belongs to Rob under the standing rule, not to a lint.
 * ====================================================================== */
dcc_section( 'the 12px floor, on a default 16px root' );

/** px font-sizes that are deliberate platform workarounds, not type choices. */
const PX_EXEMPT = [
	'16px', // the search input: iOS zooms the page on any smaller focused field.
	'20px', // the hub chevron and the map (i) -- glyph boxes, not copy.
	'22px',
	'15px',
];

$too_small = [];
foreach ( $all_blocks as [ $file, $sel, $body ] ) {
	if ( ! preg_match_all( '/font-size\s*:\s*([^;}]+)/', $body, $m ) ) {
		continue;
	}
	foreach ( $m[1] as $raw ) {
		$val = trim( $raw );
		if ( preg_match( '/^([0-9.]+)px$/', $val, $px ) ) {
			if ( (float) $px[1] < 12 && ! in_array( $val, PX_EXEMPT, true ) ) {
				$too_small[] = "$file: $sel { font-size: $val }";
			}
		} elseif ( preg_match( '/^([0-9.]*\.?[0-9]+)rem$/', $val, $re ) ) {
			if ( (float) $re[1] * 16 < 12 ) {
				$too_small[] = "$file: $sel { font-size: $val }";
			}
		}
	}
}
check( [] === $too_small, 'no declaration states a font-size below 12px at a 16px root', implode( "\n         ", $too_small ) );

/* The TOKENS are the other half: a floor on the declarations means nothing
 * while --dccwl-fs-seg itself is 0.7rem. */
/*
 * THE ONE EXEMPT TOKEN, AND ITS REASON IS A COLLISION, NOT A DISPENSATION.
 *
 * --dccwl-fs-seg is 0.7rem = 14px on the deployment root, which is the
 * Availability Calendar's measured segment type; Rob asked the Calendar
 * switch to be matched exactly (1.44.2) and ui-theme.mjs pins that 14px on
 * the kit's own root. The same token is 11.2px on a default 16px root, which
 * the floor forbids, and no value satisfies both -- 0.75rem clears the floor
 * and renders 15px live, which breaks the match. Raising it would overrule
 * one of Rob's decisions with another, so it is named here and put to him.
 *
 * It is listed as an exact string: the day the token's value changes, this
 * exemption stops applying and the gate speaks up again.
 */
const TOKEN_EXEMPT = [ '--dccwl-fs-seg: 0.7rem' ];

$token_bad = [];
foreach ( $sources as $file => $src ) {
	if ( ! preg_match_all( '/--dccwl-fs-[a-z-]+\s*:\s*([^;]+);/', $src, $m, PREG_SET_ORDER ) ) {
		continue;
	}
	foreach ( $m as $hit ) {
		if ( in_array( rtrim( trim( $hit[0] ), ';' ), TOKEN_EXEMPT, true ) ) {
			continue;
		}
		if ( preg_match( '/^([0-9.]*\.?[0-9]+)rem$/', trim( $hit[1] ), $re ) && (float) $re[1] * 16 < 12 ) {
			$token_bad[] = "$file: " . trim( $hit[0] );
		}
	}
}
check( [] === $token_bad, 'no --dccwl-fs-* token is below 12px at a 16px root', implode( "\n         ", $token_bad ) );
check(
	false !== strpos( $sources['app.css'], TOKEN_EXEMPT[0] . ';' ),
	'the one exempt token is still the value the exemption names',
	TOKEN_EXEMPT[0]
);

/* ======================================================================
 * 2. A REMOVED OUTLINE IS REPLACED, NEVER JUST REMOVED.
 *
 * `outline: none` on a focusable control is how a keyboard user loses the
 * page. Every one of the seven in this plugin is legitimate -- six draw
 * `box-shadow: var(--dccwl-ring)` in the same block, and the seventh is the
 * search INPUT, whose ring is drawn one level out by
 * `.dccwl-search-field:focus-within` so the pill gets one ring rather than
 * two (1.34.0, item 16). That seventh is allowlisted BY SELECTOR and the
 * rule it depends on is asserted to exist: an allowlist whose justification
 * is not itself checked is just a hole with a comment on it.
 * ====================================================================== */
dcc_section( 'every removed outline has a visible replacement' );

$ring_exempt = [
	'.dccwl-root .dccwl-search-input.dccwl-search-input.dccwl-search-input:focus',
	'.dccwl-root .dccwl-search-input.dccwl-search-input.dccwl-search-input:focus-visible',
	/*
	 * The hub's stage panels. They are `tabindex="-1"` -- focused only by
	 * canal.js after a navigation, so a reader lands at the top of the panel
	 * they just opened -- and a tabindex of -1 is NOT TABBABLE, so no
	 * keyboard user can ever reach one by key and lose a ring they would
	 * otherwise have had. Suppressing the ring on that programmatic focus is
	 * the point; drawing it would flash a box around half the page every time
	 * someone tapped a tile. The tabindex is asserted below, from the
	 * renderer, so this exemption cannot outlive its reason.
	 */
	'.dccwl-panel',
];

$no_ring = [];
$seen_outline_none = 0;
foreach ( $all_blocks as [ $file, $sel, $body ] ) {
	if ( ! preg_match( '/outline\s*:\s*none|outline\s*:\s*0\b/', $body ) ) {
		continue;
	}
	++$seen_outline_none;
	$parts  = array_map( 'trim', explode( ',', $sel ) );
	$exempt = $parts && ! array_diff( $parts, $ring_exempt );
	if ( $exempt ) {
		continue;
	}
	$focus = $parts && ! array_filter(
		$parts,
		static fn( string $p ): bool => false === strpos( $p, ':focus' )
	);
	$ring = (bool) preg_match( '/box-shadow\s*:\s*[^;}]*(--dccwl-ring|inset var\( *--dccwl-ring)/', $body );
	if ( ! $focus || ! $ring ) {
		$no_ring[] = "$file: $sel";
	}
}
check( $seen_outline_none >= 5, 'the outline sweep found the declarations to judge', $seen_outline_none . ' blocks' );
check( [] === $no_ring, 'every outline-removing rule is a :focus rule that draws the ring', implode( "\n         ", $no_ring ) );
check(
	false !== strpos( $sources['widget.css'], '.dccwl-search-field:focus-within { box-shadow: var(--dccwl-ring); }' ),
	'the search pill really does draw the ring the input defers to'
);

/*
 * The panel exemption's justification, read from the renderer rather than
 * assumed: every stage panel really is tabindex="-1". If one ever becomes
 * tabbable, suppressing its focus ring stops being invisible and starts
 * being a keyboard user losing their place.
 */
$canal = (string) file_get_contents( dirname( __DIR__ ) . '/../includes/class-canal-render.php' );
preg_match_all( '/<section class="dccwl-panel[^>]*>/', $canal, $panels );
check( count( $panels[0] ) >= 2, 'the renderer emits the stage panels this lint exempts', count( $panels[0] ) . ' found' );
$tabbable = array_values( array_filter( $panels[0], static fn( string $tag ): bool => false === strpos( $tag, 'tabindex="-1"' ) ) );
check( [] === $tabbable, 'and every one of them is tabindex="-1", so none is reachable by key', implode( "\n         ", $tabbable ) );

/* ======================================================================
 * 3. A VIEWPORT HEIGHT ON A SHEET NEEDS ITS dvh FALLBACK (item 4).
 *
 * iOS counts the browser chrome in `vh`, so an 88vh sheet is taller than
 * the visible viewport and its last rows sit under the toolbar -- which is
 * what the Director measured on his iPhone. water.css has used the
 * `@supports (height: Ndvh)` pattern since 1.31.0; app.css's sheet rules
 * had not. The gate is: for every `vh` height this plugin sets on the
 * SHEET, a `dvh` block states the same number.
 * ====================================================================== */
dcc_section( 'sheet heights carry a dvh fallback' );

$vh_missing = [];
foreach ( $sources as $file => $src ) {
	if ( ! preg_match_all( '/(?:max-height|height)\s*:\s*([0-9.]+)vh/', $src, $m ) ) {
		continue;
	}
	foreach ( array_unique( $m[1] ) as $n ) {
		if ( false === strpos( $src, $n . 'dvh' ) ) {
			$vh_missing[] = "$file: {$n}vh with no {$n}dvh";
		}
	}
}
check( [] === $vh_missing, 'every vh height has a dvh counterpart in the same file', implode( "\n         ", $vh_missing ) );

/* ======================================================================
 * 4. THE PLUGIN NAMES NO FONT (CLAUDE.md: "no webfonts, ever"; 1.27.0:
 * "TYPE IS OURS, NOT THE THEME'S" -- ours means our SIZES and WEIGHTS,
 * never our faces). Through 1.44.6 the map credit button asked for
 * Georgia, the one font-family in the plugin that was not inherited, so
 * that single control rendered in a serif on a Raleway page.
 * ====================================================================== */
dcc_section( 'no stylesheet names a typeface' );

$named = [];
foreach ( $all_blocks as [ $file, $sel, $body ] ) {
	if ( ! preg_match_all( '/font-family\s*:\s*([^;}]+)/', $body, $m ) ) {
		continue;
	}
	foreach ( $m[1] as $raw ) {
		$val = trim( $raw );
		if ( 'inherit' !== $val && 'var(--dccwl-font)' !== $val ) {
			$named[] = "$file: $sel { font-family: $val }";
		}
	}
}
check( [] === $named, 'every font-family is inherit or var(--dccwl-font)', implode( "\n         ", $named ) );
check(
	false !== strpos( $sources['app.css'], '--dccwl-font: inherit;' ),
	'and that token is itself `inherit`, so nothing is ever fetched'
);

/* ======================================================================
 * 5. STILL NO OS DARK MODE (the always-light rule, 1.9.1).
 *
 * ui-theme.mjs renders under both OS schemes and compares screenshots,
 * which is the real proof. This is the cheap source half, and it runs even
 * when Chromium is absent and that suite skips.
 * ====================================================================== */
dcc_section( 'always light' );
$dark = [];
foreach ( $sources as $file => $src ) {
	if ( false !== strpos( $src, 'prefers-color-scheme' ) ) {
		$dark[] = $file;
	}
}
check( [] === $dark, 'no stylesheet carries a prefers-color-scheme rule', implode( ', ', $dark ) );

dcc_done();
