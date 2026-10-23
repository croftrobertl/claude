<?php
/**
 * American spelling, and Title Case on the labels Rob has ruled on.
 *
 * WHY THIS EXISTS. doracanalcourt.com is an American site and Rob's standing
 * rule (2026-10-21) is that every guest-facing string reads American: "Sweep
 * every guest-facing string in the plugin for British spellings and make them
 * American […] Leave species names, scientific names, quoted source names and
 * official agency titles exactly as published." 1.44.4 rewrote 152 strings to
 * match. Without a gate, the next batch of species or the next water string
 * reintroduces one and nobody notices until he reads it on his phone.
 *
 * WHAT IT READS, AND WHY IT IS TOKENISED. Guest-facing text in PHP is exactly
 * the literal inside a translation call — __(), esc_html__(), _x(), _n() and
 * their echoing twins. Nothing else qualifies: a British spelling in a CODE
 * COMMENT, a variable name (`$colourBtn`), a CSS class or an internal array
 * key is invisible to a guest, and a regex over whole files would flag all of
 * them and bury the real finding. So the extractor runs PHP's own lexer and
 * pulls the first string argument of each i18n call, which is also the only
 * way to know a `'Colour'` inside a comment is a comment — the 1.33.1 lesson,
 * where a regex comment-stripper mangled every https:// and found nothing.
 *
 * THE JAVASCRIPT HALF IS THE FALLBACK LITERALS. water-map.js and its siblings
 * read `i18n.someKey || 'Some Text'`, so that literal is what a guest sees if
 * the key is ever missing from the payload — it is a second copy of the PHP
 * string and has to say the same thing. 1.44.2's `dropLabel()` and 1.39.1's
 * `dateText()` are both reached that way. Internal identifiers around them
 * (`colourBtn`, `setColour`, `colourWord`) are NOT swept: they are this
 * codebase's own names, nobody reads them, and renaming them would be churn.
 *
 * THE ALLOWLIST IS FOR PUBLISHED NAMES, AND IT IS EXACT-MATCH. "Cloudless
 * Sulphur" is the North American Butterfly Association's own name for
 * *Phoebis sennae* and a guide that "corrects" a published common name is
 * wrong in a way no spelling rule fixes — the same gate as the scientific
 * names decided from evidence in batch 20 (1.33.0, section 15), where a
 * blanket rule would have been wrong once in four. Matching the whole literal
 * rather than the word means an allowlisted name cannot excuse a British
 * spelling anywhere else in the same sentence.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
$root = dcc_boot_plugin();

/*
 * THE WORD LIST IS EXPLICIT, NOT A SUFFIX RULE.
 *
 * A `\w+is(e|ed|ing|ation)` pattern looks like it covers -ise/-ize in one
 * line and then flags "wise", "promise", "rise", "raised" and "precise" — a
 * probe that fires on correct text teaches a reader to ignore it, which is
 * worse than no probe. Likewise `\w*metre` would flag "parameter". Every
 * entry below is a word this plugin could plausibly print, with the American
 * form it must take, so a failure reads as an instruction.
 */
const BRITISH = [
	// -our → -or
	'colour'      => 'color',
	'behaviour'   => 'behavior',
	'favour'      => 'favor',
	'flavour'     => 'flavor',
	'harbour'     => 'harbor',
	'honour'      => 'honor',
	'humour'      => 'humor',
	'labour'      => 'labor',
	'neighbour'   => 'neighbor',
	'odour'       => 'odor',
	'rumour'      => 'rumor',
	'savour'      => 'savor',
	'vapour'      => 'vapor',
	'vigour'      => 'vigor',
	'armour'      => 'armor',
	'endeavour'   => 'endeavor',
	// -re → -er
	'centre'      => 'center',
	'metre'       => 'meter',
	'centimetre'  => 'centimeter',
	'millimetre'  => 'millimeter',
	'kilometre'   => 'kilometer',
	'litre'       => 'liter',
	'fibre'       => 'fiber',
	'theatre'     => 'theater',
	'calibre'     => 'caliber',
	'sabre'       => 'saber',
	'sombre'      => 'somber',
	'spectre'     => 'specter',
	// -ce → -se
	'licence'     => 'license',
	'defence'     => 'defense',
	'offence'     => 'offense',
	'pretence'    => 'pretense',
	'practise'    => 'practice',
	// -ise/-yse → -ize/-yze (listed, never derived)
	'recognise'   => 'recognize',
	'organise'    => 'organize',
	'realise'     => 'realize',
	'specialise'  => 'specialize',
	'emphasise'   => 'emphasize',
	'apologise'   => 'apologize',
	'minimise'    => 'minimize',
	'maximise'    => 'maximize',
	'summarise'   => 'summarize',
	'stabilise'   => 'stabilize',
	'colonise'    => 'colonize',
	'camouflagise' => 'camouflage', // never right in either dialect; a typo trap
	'analyse'     => 'analyze',
	'paralyse'    => 'paralyze',
	'catalyse'    => 'catalyze',
	// doubled consonants
	'travelled'   => 'traveled',
	'travelling'  => 'traveling',
	'traveller'   => 'traveler',
	'labelled'    => 'labeled',
	'labelling'   => 'labeling',
	'modelled'    => 'modeled',
	'cancelled'   => 'canceled',
	'fuelled'     => 'fueled',
	'marvellous'  => 'marvelous',
	'jewellery'   => 'jewelry',
	// one-offs this plugin's subject matter can reach
	'grey'        => 'gray',
	'sulphur'     => 'sulfur',
	'mould'       => 'mold',
	'moult'       => 'molt',
	'smoulder'    => 'smolder',
	'plough'      => 'plow',
	'aluminium'   => 'aluminum',
	'tyre'        => 'tire',
	'storey'      => 'story',
	'draught'     => 'draft',
	'kerb'        => 'curb',
	'manoeuvre'   => 'maneuver',
	'oesophagus'  => 'esophagus',
	'foetus'      => 'fetus',
	'programme'   => 'program',
	'cheque'      => 'check',
	'aeroplane'   => 'airplane',
];

/*
 * PUBLISHED NAMES, EXACT LITERALS, EACH WITH ITS AUTHORITY.
 *
 * Add a row only for a name the publishing body spells this way. "It reads
 * better" is not a reason, and neither is "it is a proper noun" — Rob's own
 * ruling already corrected two species names to their published American
 * forms (Eastern Gray Squirrel, Gray Fox), so being a name is not cover.
 */
const SPELLING_ALLOW = [
	// NABA / Butterflies and Moths of North America both publish "Sulphur"
	// for the Phoebis and Colias sulphurs. Our own Gray Hairstreak and Gray
	// Catbird were already American, which is why only this one is listed.
	'Cloudless Sulphur' => 'NABA published common name',
];

/* Build one case-insensitive pattern per British word, whole-word. */
$patterns = [];
foreach ( BRITISH as $bad => $good ) {
	$patterns[ $bad ] = '/\b' . preg_quote( $bad, '/' ) . '(s|es|ed|ing)?\b/i';
}

/**
 * Every translatable literal in a PHP file, with its line number.
 *
 * Tokenised, because PHP's lexer is the only thing that reliably knows a
 * string from a comment. Only the FIRST string argument of each call is
 * taken: the trailing arguments are the text domain and the gettext context,
 * which are identifiers rather than guest-facing prose.
 *
 * @return array<int,array{0:string,1:int}>
 */
function dccwl_i18n_literals( string $file ): array {
	$calls = [
		'__', '_e', '_x', '_ex', '_n', '_nx', 'esc_html__', 'esc_html_e',
		'esc_html_x', 'esc_attr__', 'esc_attr_e', 'esc_attr_x',
	];
	$tokens = token_get_all( (string) file_get_contents( $file ) );
	$out    = [];
	$n      = count( $tokens );
	for ( $i = 0; $i < $n; $i++ ) {
		$t = $tokens[ $i ];
		if ( ! is_array( $t ) || T_STRING !== $t[0] || ! in_array( $t[1], $calls, true ) ) {
			continue;
		}
		// Skip a method or a definition: ->__(, ::__(, function __(.
		$prev = $tokens[ $i - 1 ] ?? null;
		if ( is_array( $prev ) && in_array( $prev[0], [ T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_FUNCTION ], true ) ) {
			continue;
		}
		// The next meaningful token must be '(' and the one after a string.
		$j = $i + 1;
		while ( isset( $tokens[ $j ] ) && is_array( $tokens[ $j ] ) && T_WHITESPACE === $tokens[ $j ][0] ) {
			$j++;
		}
		if ( '(' !== ( $tokens[ $j ] ?? null ) ) {
			continue;
		}
		$j++;
		while ( isset( $tokens[ $j ] ) && is_array( $tokens[ $j ] )
			&& in_array( $tokens[ $j ][0], [ T_WHITESPACE, T_COMMENT, T_DOC_COMMENT ], true ) ) {
			$j++;
		}
		$tok = $tokens[ $j ] ?? null;
		if ( ! is_array( $tok ) || T_CONSTANT_ENCAPSED_STRING !== $tok[0] ) {
			continue;
		}
		$raw  = $tok[1];
		$text = substr( $raw, 1, -1 );
		if ( "'" === $raw[0] ) {
			$text = str_replace( [ "\\'", '\\\\' ], [ "'", '\\' ], $text );
		}
		$out[] = [ $text, (int) $tok[2] ];
	}
	return $out;
}

/**
 * Every `i18n.key || 'literal'` fallback in a JS file, with its line.
 *
 * @return array<int,array{0:string,1:int}>
 */
function dccwl_js_fallbacks( string $file ): array {
	$src   = (string) file_get_contents( $file );
	$lines = explode( "\n", $src );
	$out   = [];
	foreach ( $lines as $i => $line ) {
		if ( preg_match_all( "/\|\|\s*'((?:[^'\\\\]|\\\\.)*)'/", $line, $m ) ) {
			foreach ( $m[1] as $lit ) {
				$out[] = [ stripcslashes( $lit ), $i + 1 ];
			}
		}
	}
	return $out;
}

/* ---------------------------------------------------------------- */

dcc_section( 'the extractor finds strings, and knows a comment is not one' );

/*
 * THE FIRST ASSERTION IS ABOUT THE PROBE, because a sweep that finds nothing
 * reports no problem — this harness's oldest prohibition (a probe that can
 * only pass) and the exact shape of the 1.33.1 parser that returned an empty
 * require list. If the counts below ever collapse, every assertion after
 * them is worthless.
 */
$php_files = glob( $root . '/includes/*.php' );
$php_files[] = $root . '/dcc-wildlife.php';
$strings   = [];
foreach ( $php_files as $f ) {
	foreach ( dccwl_i18n_literals( $f ) as $hit ) {
		$strings[] = [ $hit[0], basename( $f ), $hit[1] ];
	}
}
check( count( $php_files ) > 10, 'the plugin\'s PHP files were found', count( $php_files ) . ' files' );
check( count( $strings ) > 2000, 'the extractor pulled the plugin\'s translatable strings', count( $strings ) . ' literals' );

$js_files = glob( $root . '/assets/js/*.js' );
$js       = [];
foreach ( $js_files as $f ) {
	foreach ( dccwl_js_fallbacks( $f ) as $hit ) {
		$js[] = [ $hit[0], basename( $f ), $hit[1] ];
	}
}
check( count( $js_files ) > 3, 'the front-end scripts were found', count( $js_files ) . ' files' );
check( count( $js ) > 20, 'the i18n fallback literals were found', count( $js ) . ' fallbacks' );

/*
 * And the probe must be able to tell the two apart. class-water-render.php's
 * own comments quote "Colour by:" verbatim — they are the release record of
 * why it changed — so an extractor that read comments would fail on this
 * file's documentation, which is this repository's oldest trap (a naive scan
 * matching the content it exists to protect).
 */
$wr = $root . '/includes/class-water-render.php';
check_contains( (string) file_get_contents( $wr ), 'Colour by:', 'the release note still quotes the old wording' );
$wr_lits = implode( "\n", array_column( dccwl_i18n_literals( $wr ), 0 ) );
check_lacks( $wr_lits, 'Colour by:', 'but the extractor does not see it, because it is a comment' );

dcc_section( 'no British spelling in a guest-facing string' );

$found = [];
foreach ( [ [ $strings, 'PHP' ], [ $js, 'JS fallback' ] ] as [ $set, $kind ] ) {
	foreach ( $set as [ $text, $file, $line ] ) {
		if ( isset( SPELLING_ALLOW[ trim( $text ) ] ) ) {
			continue;
		}
		foreach ( $patterns as $bad => $re ) {
			if ( preg_match( $re, $text, $m ) ) {
				$found[] = sprintf(
					'%s %s:%d — "%s" (use "%s") in: %s',
					$kind, $file, $line, $m[0], BRITISH[ $bad ],
					mb_strimwidth( $text, 0, 90, '…' )
				);
			}
		}
	}
}
check( [] === $found, 'every guest-facing string is American', implode( "\n    ", $found ) );

dcc_section( 'every SPECIES string, not only the translatable ones (1.45.0)' );

/*
 * THE EXTRACTOR ABOVE READS i18n CALLS, AND THAT IS HOW FIFTEEN BRITISH
 * SPELLINGS SURVIVED 1.44.4 IN PLAIN SIGHT.
 *
 * `Species::PHOTO_NOTES` and `PHOTO_SOURCES` are bare `'...'` literals, not
 * `__()` calls — so the tokenised sweep could not see them, and the
 * Director's audit found `colour`, `grey` ×3, `licence` ×4 and `recognise`
 * in the notes a guest reads under a photograph in the detail sheet. They
 * reach the browser through `/species`, which is as guest-facing as text
 * gets.
 *
 * So this half asks the DATASET rather than the source: every string field
 * of every species row, which is the shape the client actually receives —
 * the 1.33.1 rule that a suite must exercise the path production takes. It
 * catches a note, a credit, a fact, a mark and a safety line alike, and a
 * future field is swept the day it is added rather than the day somebody
 * remembers to list it.
 *
 * NOT a replacement for the i18n sweep: that one covers every renderer and
 * every string outside this registry. The two halves overlap on purpose.
 */
DCC_WL\Species::flush_cache();
$rows = DCC_WL\Species::dataset();
check( count( $rows ) > 100, 'the dataset built for the sweep', (string) count( $rows ) );

/* Fields that are an identifier or a machine value, not prose a guest reads. */
$NOT_PROSE = [ 'id', 'group', 'browse', 'idgroup', 'odds', 'photo', 'thumb', 'emoji', 'sci', 'creditUrl' ];
$species_bad  = [];
$species_seen = 0;
foreach ( $rows as $sid => $row ) {
	foreach ( (array) $row as $field => $val ) {
		if ( ! is_string( $val ) || '' === $val || in_array( $field, $NOT_PROSE, true ) ) {
			continue;
		}
		if ( isset( SPELLING_ALLOW[ trim( $val ) ] ) ) {
			continue;
		}
		$species_seen++;
		foreach ( $patterns as $bad => $re ) {
			if ( preg_match( $re, $val, $m ) ) {
				$species_bad[] = sprintf(
					'%s [%s] — "%s" (use "%s"): %s',
					$sid, $field, $m[0], BRITISH[ $bad ], mb_strimwidth( $val, 0, 70, '…' )
				);
			}
		}
	}
}
/* A sweep that inspected nothing reports no problem. */
check( $species_seen > 1500, 'the species sweep had strings to read', (string) $species_seen );
check( [] === $species_bad, 'every species string a guest reads is American',
	implode( "\n    ", array_slice( $species_bad, 0, 12 ) ) );

/*
 * And `photoNote` BY NAME, because it is the field the audit found and the
 * one a future photo batch is most likely to write in a hurry. Named
 * separately so that if the loop above is ever narrowed, this does not go
 * quietly with it.
 */
$notes = 0;
foreach ( $rows as $row ) {
	if ( '' !== (string) ( $row['photoNote'] ?? '' ) ) {
		$notes++;
	}
}
check( $notes > 5, 'photo notes are present in the dataset and were swept', (string) $notes );

dcc_section( 'the allowlist is exact, and it is still needed' );

/*
 * An allowlist nothing uses is dead weight that the next reader trusts, and
 * an allowlist that stopped matching would silently stop excusing the name it
 * exists for. So: the name must still be in the registry, and it must still
 * be the only thing the sweep would have flagged.
 */
$all = array_column( $strings, 0 );
foreach ( SPELLING_ALLOW as $name => $why ) {
	check( in_array( $name, $all, true ), "the allowlisted name is still a string in the plugin: $name", $why );
	check( (bool) preg_match( $patterns['sulphur'] ?? '/\bsulphur\b/i', $name )
		|| (bool) count( array_filter( $patterns, fn( $re ) => (bool) preg_match( $re, $name ) ) ),
		"and the sweep really would flag it without the allowlist: $name" );
}
/* Nothing may be allowlisted that is not actually in use. */
check_same(
	1,
	count( SPELLING_ALLOW ),
	'the allowlist holds exactly the one published name that needs it'
);

dcc_section( "Rob's Title Case rulings (2026-10-21), pinned by string" );

/*
 * THE TITLE CASE HALF IS SCOPED TO THE GUEST-FACING RENDERERS, and the
 * British half deliberately is not.
 *
 * Rob's Title Case rule is about what the SITE shows a guest. The admin
 * page's own `<h2>`s are the owner's editor screen, and one of them —
 * "Local reports & charters" — names the same block the front end heads,
 * which is why an unscoped check fails on it. It was reported rather than
 * re-cased: a settings screen is not a guest surface, and one line from him
 * changes it. Spelling has no such exemption — the admin text is in American
 * English too, and the sweep above covers every file in the plugin.
 */
$guest_files = [
	'class-render.php', 'class-water-render.php', 'class-canal-render.php',
	'class-guide-page.php', 'class-species.php', 'class-water-data.php',
	'class-water-live.php', 'class-water-fact.php', 'class-sprites.php',
];
$guest = [];
foreach ( $strings as [ $text, $file, $line ] ) {
	if ( in_array( $file, $guest_files, true ) ) {
		$guest[] = $text;
	}
}
check( count( $guest ) > 2000, 'the guest-facing renderers were identified', count( $guest ) . ' strings' );

/*
 * The three strings he ruled on by name, plus the ramp popup's own title,
 * which is the same register. Pinned as EXACT expected values rather than as
 * a "first letter is upper" rule: a case rule would accept "Color by:" with
 * a capital C, which is the thing that was wrong.
 */
$i18n_expect = [
	'Color By:'        => 'the map bar\'s colour control reads "Color By: Clarity ▾"',
	'Station Page'     => 'the station popup\'s link',
	'Depth Map (PDF)'  => 'the water popup\'s depth-map link',
	'Boat Ramp'        => 'the ramp popup\'s fallback title',
	/*
	 * The rest of 1.44.4's Title Case sweep. Each is text a guest SEES — a
	 * heading, a link label or a card's own name — which is the register
	 * Rob's rule covers. What is deliberately NOT in this list, and is
	 * recorded in the release notes rather than changed: accessible names
	 * (an aria-label is spoken, never shown, and Title Casing a spoken
	 * phrase changes nothing for anyone), the screen-reader likelihood
	 * words, the lowercase date prefixes in the attribution stack
	 * ("sampled 07/27/2026", which is prose rather than a label row), the
	 * documented mid-sentence strings, and every Elementor PANEL label,
	 * which only the owner sees in the editor.
	 */
	'On The Canal'                   => 'the month widget\'s default heading',
	'Peak Season'                    => 'the detail sheet\'s badge',
	'Local Reports & Charters'       => 'a water-module links heading',
	'Official Information'           => 'a water-module links heading',
	'FWC Licenses'                   => 'the fishing block\'s license link',
	'New Moon'                       => 'a moon-phase name on the Tonight card',
	'Waxing Crescent'                => 'a moon-phase name',
	'First Quarter'                  => 'a moon-phase name',
	'Waxing Gibbous'                 => 'a moon-phase name',
	'Full Moon'                      => 'a moon-phase name',
	'Waning Gibbous'                 => 'a moon-phase name',
	'Last Quarter'                   => 'a moon-phase name',
	'Waning Crescent'                => 'a moon-phase name',
];
foreach ( $i18n_expect as $want => $why ) {
	check( in_array( $want, $guest, true ), "\"$want\" is a translatable string — $why" );
}
/* And the superseded forms are gone from both halves. */
$js_all = array_column( $js, 0 );
$superseded = [
	'Colour by:', 'Color by:', 'Station page', 'Depth map (PDF)', 'Boat ramp',
	'On the canal', 'Peak season', 'Local reports & charters',
	'Official information', 'FWC licenses', 'New moon', 'Waxing crescent',
	'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous',
	'Last quarter', 'Waning crescent',
];
foreach ( $superseded as $gone ) {
	check( ! in_array( $gone, $guest, true ), "\"$gone\" is no longer a guest-facing PHP string" );
	check( ! in_array( $gone, $js_all, true ), "\"$gone\" is no longer a JS fallback" );
}
/*
 * The JS fallback is a SECOND COPY of the PHP string and must not drift from
 * it — that is the whole reason it is swept. Assert the pairing, not just the
 * absence of the old form.
 */
foreach ( [ 'Color By:', 'Station Page', 'Depth Map (PDF)', 'Boat Ramp' ] as $want ) {
	check( in_array( $want, $js_all, true ), "\"$want\" is also the JS fallback, so the two cannot disagree" );
}

dcc_section( 'no HTML entity reaches a translator, or a guest' );

/*
 * FOUND BY LOOKING AT A SCREENSHOT, not by reading the source — an entity
 * inside an HTML file looks perfectly correct there. The fishing block's
 * heading was `'Licences &amp; Keep-Limits'` passed through esc_html_e(),
 * which escapes the ampersand again, so live printed the entity itself for
 * four releases. A translatable string is TEXT; the escaper is what turns it
 * into markup.
 */
$entity = [];
foreach ( $strings as [ $text, $file, $line ] ) {
	if ( preg_match( '/&(amp|lt|gt|quot|#\d+|nbsp|mdash|ndash|hellip|rsquo|lsquo|ldquo|rdquo);/', $text, $m ) ) {
		$entity[] = "$file:$line — {$m[0]} in: " . mb_strimwidth( $text, 0, 70, '…' );
	}
}
check( [] === $entity, 'no translatable string carries an HTML entity', implode( "\n    ", $entity ) );
check( in_array( 'Licenses & Keep-Limits — Florida FWC', $guest, true ), 'the fishing heading is one plain ampersand' );

dcc_section( 'every DEFAULT card label is Title Case (1.44.6)' );

/*
 * A CARD LABEL IS A LABEL, so Rob's Title Case rule covers it — and the
 * seeded almanac row was the last sentence-case one in the plugin ("Surface
 * area"). It survived 1.44.1's sweep because it is DATA in a defaults array
 * rather than a string in a renderer, which is exactly the kind of place a
 * reader of the renderers never looks.
 *
 * Checked here as a RULE rather than as one string: every word of every
 * default card label must start upper case, except the small words Title
 * Case itself leaves alone and anything parenthesised or unit-like. A new
 * seeded row cannot be missed the way this one was.
 */
$small = [ 'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'at', 'by', 'with', 'from', '&' ];
$bad_labels = [];
foreach ( DCC_WL\Water_Data::default_almanac() as $row ) {
	$label = trim( (string) ( $row['label'] ?? '' ) );
	if ( '' === $label ) {
		continue;
	}
	foreach ( preg_split( '/\s+/', $label ) as $i => $word ) {
		$w = trim( $word, "(),:;—·…\"'" );
		if ( '' === $w || ! preg_match( '/^[a-z]/', $w ) ) {
			continue;
		}
		if ( $i > 0 && in_array( strtolower( $w ), $small, true ) ) {
			continue;
		}
		$bad_labels[] = "\"$label\" — \"$w\"";
	}
}
check( [] === $bad_labels, 'every default almanac card label is Title Case', implode( '; ', $bad_labels ) );
check(
	in_array( 'Surface Area', array_column( DCC_WL\Water_Data::default_almanac(), 'label' ), true ),
	'the seeded row reads "Surface Area"'
);

dcc_section( 'the two seeded settings strings, and their upgrade step' );

/*
 * These two live inside ARRAY-TYPED defaults, which wp_parse_args shadows at
 * key level — so on any site that ever pressed Save the stored row keeps
 * whatever it was seeded with (the 1.8.0 settings-merge rule). Changing the
 * default is half the work; the other half is Water_Data::upgrade(), and it
 * is asserted here by driving the real upgrade over a stored row carrying
 * the British text.
 */
dccwl_test_reset();
$stored = DCC_WL\Water_Data::defaults();
$stored['links'][0]['label'] = 'Florida FWC — fishing licences & regulations';
$stored['fishing']['license'] = 'Anglers 16 and older need a Florida freshwater fishing licence (some exemptions — under-16, resident seniors 65+, free-fishing days).';
$stored['links'][1]['label'] = 'A label the owner typed about licences himself';
update_option( DCC_WL\Water_Data::OPTION, $stored );
DCC_WL\Water_Data::upgrade();
$after = get_option( DCC_WL\Water_Data::OPTION );
check_contains( (string) $after['links'][0]['label'], 'licenses', 'the seeded FWC link label is repaired' );
check_contains( (string) $after['fishing']['license'], 'license (some exemptions', 'the seeded licence sentence is repaired' );
check_contains( (string) $after['links'][1]['label'], 'licences', "and the owner's own wording is LEFT ALONE — exact match only" );

/*
 * AND THE SEEDED LABEL (1.44.6), by the same exact-match rule. The third row
 * is the owner's own: same label, DIFFERENT waterbody, so the match must
 * leave it alone — a label is not unique on its own and "Surface area" for
 * another lake is somebody else's row.
 */
dccwl_test_reset();
$stored2 = DCC_WL\Water_Data::defaults();
$stored2['almanac'][0]['label'] = 'Surface area';
$stored2['almanac'][] = [
	'waterbody'   => 'Lake Harris',
	'label'       => 'Surface area',
	'value'       => '13,788 acres',
	'tier'        => DCC_WL\Water_Fact::TIER_PUBLISHED,
	'source_name' => 'Owner',
	'source_url'  => '',
	'date'        => '2026-01-01',
	'note'        => '',
	'section'     => 'about',
];
update_option( DCC_WL\Water_Data::OPTION, $stored2 );
DCC_WL\Water_Data::upgrade();
$after2 = get_option( DCC_WL\Water_Data::OPTION );
check_same( 'Surface Area', $after2['almanac'][0]['label'], 'the seeded almanac label is repaired' );
check_same( 'Surface area', $after2['almanac'][1]['label'], "and a row for another waterbody is LEFT ALONE" );

/*
 * Idempotent: a second pass must not touch a row it already repaired.
 *
 * The baseline is read HERE, not carried from the first block — the
 * almanac block above writes the option between them, and the first
 * version of this check compared a stale snapshot and failed in the run
 * the almanac step was added. A fixture that compares against something
 * written before the state it is testing is not comparing anything.
 */
$twice = get_option( DCC_WL\Water_Data::OPTION );
DCC_WL\Water_Data::upgrade();
check_same( $twice, get_option( DCC_WL\Water_Data::OPTION ), 'running the upgrade twice changes nothing further' );

dcc_done();
