<?php
/**
 * 1.48.1 — CREDITS BEHIND ⓘ: what the server renders.
 *
 * The browser half is ui-1481.mjs (taps, keys, Esc, the pills' timing). This
 * half pins the markup every server-rendered ⓘ shares with the one info.js
 * builds, and that no credit or source line is printed inline any more —
 * each check written so a mutation recorded in CLAUDE.md §50 turns it red.
 */

// phpcs:disable

require __DIR__ . '/lib.php';
$root = dcc_boot_plugin();

use DCC_WL\Guide_Page;
use DCC_WL\Render;
use DCC_WL\Water_Data;
use DCC_WL\Water_Render;

$GLOBALS['dccwl_test']['options'][ Water_Data::OPTION ] = array_merge(
	Water_Data::defaults(),
	[ 'live_enabled' => 1, 'map_enabled' => 1, 'fishing_enabled' => 1 ]
);
dcc_reset_once_guards();
$water = Water_Render::shortcode( [] );
dcc_reset_once_guards();
$guide = Guide_Page::shortcode( [] );

/* ====================================================================== */
dcc_section( 'one ⓘ pattern: Render::info()' );

$one = Render::info( 'Source of <Level> & "Things"', Render::info_line( esc_html( 'USGS' ), 'dccwl-water-src' ) );
check_matches( $one, '/^<span class="dccwl-info"><button type="button" class="dccwl-info-btn" popovertarget="(dccwl-info-p\d+)" aria-label="[^"]*"><svg[^>]*aria-hidden="true"[^>]*>.*<\/svg><\/button><span class="dccwl-info-pop" id="\1" popover="auto">/s',
	'a real <button> naming its own popover="auto" panel, side by side' );
check_contains( $one, 'aria-label="Source of &lt;Level&gt; &amp; &quot;Things&quot;"', 'the accessible name is escaped' );
check_contains( $one, '<span class="dccwl-info-line dccwl-water-src">USGS</span>', 'and each line carries its role' );
check_lacks( $one, 'tabindex', 'nothing takes the ⓘ out of the tab order' );
$two = Render::info( 'x', '' );
preg_match_all( '/id="(dccwl-info-p\d+)"/', $one . $two, $ids );
check( 2 === count( array_unique( $ids[1] ) ), 'two ⓘ never share an id', implode( ',', $ids[1] ) );

$js = (string) file_get_contents( $root . '/assets/js/info.js' );
check_contains( $js, "btn.type = 'button';", 'info.js builds the same button' );
check_contains( $js, "btn.setAttribute('popovertarget', id);", 'paired the same way' );
check_contains( $js, "pop.setAttribute('popover', 'auto');", 'with the same light-dismiss panel' );
check_contains( $js, "'dccwl:escape'", 'and claims Esc inside a sheet by the 1.33.0 contract' );

/* ====================================================================== */
dcc_section( 'no credit or source is printed inline' );

foreach ( [ 'water' => $water, 'guide' => $guide ] as $name => $html ) {
	foreach ( [ 'dccwl-water-attr', 'dccwl-fishing-src', 'dccwl-card-chip', 'dccwl-card-srcname', 'dccwl-gp-spot-sub', 'dccwl-gp-credit', 'dccwl-photo-credit"' ] as $cls ) {
		check_lacks( $html, $cls, "$name: no `$cls`" );
	}
	preg_match_all( '/popovertarget="([^"]+)"/', $html, $t );
	$unpaired = array_filter( $t[1], static fn( $id ) => false === strpos( $html, 'id="' . $id . '" popover="auto"' ) );
	check( [] === $unpaired, "$name: every ⓘ has its panel", implode( ',', $unpaired ) );
}

/* Every almanac card ends its head with an ⓘ holding source and date. */
preg_match_all( '/<li class="dccwl-card dccwl-water-fact[^"]*">\s*<div class="dccwl-card-head">(.*?)<\/div>/s', $water, $cards );
check( count( $cards[1] ) >= 1, 'there are server-rendered reading cards', (string) count( $cards[1] ) );
foreach ( $cards[1] as $head ) {
	check_matches( $head, '/<span class="dccwl-card-label">[^<]+<\/span><span class="dccwl-info">.*<\/span>\s*$/s', 'a card head is its label, then its ⓘ — last' );
	check_contains( $head, 'dccwl-water-src', 'and the panel names the source' );
}

/* The Fishing heading ends with its ⓘ; the FWC action stays outside it. */
check_matches( $water, '/<h3[^>]*>Fishing the Harris Chain<span class="dccwl-info">.*?<\/span><\/span><\/h3>/s', 'the Fishing heading ends with its ⓘ' );
check_matches( $water, '/aria-label="Sources for the fishing guide"/', 'named for what it holds' );
$fwc_at = strpos( $water, 'dccwl-fishing-limits-link' );
$pop_at = strrpos( substr( $water, 0, (int) $fwc_at ), 'dccwl-info-pop' );
$pop_end = false === $pop_at ? false : strpos( $water, '</span></span>', $pop_at );
check( false !== $fwc_at && ( false === $pop_end || $pop_end < $fwc_at ), '"Current Limits on FWC ↗" is not inside any ⓘ' );

/* The guide's three: the spotlight's "as of", a record's iNaturalist link,
 * and a Protected line's listing. */
check_contains( $guide, 'aria-label="Where these counts come from"', 'the spotlight\'s ⓘ' );
check_contains( $guide, 'aria-label="Source of this record"', 'a local record\'s ⓘ' );
check_contains( $guide, 'aria-label="Source of the listing"', 'a protected listing\'s ⓘ' );

/* ====================================================================== */
dcc_section( 'a browser without popovers still shows every credit' );

$app = (string) file_get_contents( $root . '/assets/css/app.css' );
check_matches( $app, '/\n\.dccwl-info-pop \{[^}]*display: block;/', 'the panel\'s own rule shows it' );
$outside = (string) preg_replace( '/@supports selector\(:popover-open\)\s*\{.*?\n\}/s', '', $app );
check_lacks( $outside, ':not(:popover-open) { display: none', 'and it is folded ONLY where the browser has popovers, so without them it prints inline' );
check_matches( $app, '/@supports not selector\(:popover-open\)\s*\{[^@]*\.dccwl-info-btn\s*\{\s*display:\s*none/s', 'and the useless button steps aside' );

/* ====================================================================== */
dcc_section( 'the licence surfaces stay visible' );

check_contains( $guide, '<details class="dccwl-fullguide dccwl-photo-credits" id="credits">', 'the Photo Credits panel is still on the page' );
check_lacks( (string) preg_replace( '#.*<details class="dccwl-fullguide dccwl-photo-credits"#s', '', $guide ), 'class="dccwl-info', 'and nothing in it is folded behind an ⓘ' );
$map = (string) file_get_contents( $root . '/assets/js/water-map.js' );
check_lacks( $map, 'attributionControl: false', 'the map keeps Leaflet\'s attribution control' );

dcc_done();
