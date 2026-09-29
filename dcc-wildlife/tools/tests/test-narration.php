<?php
/**
 * The narration rewrite, and the one rule the owner attached to it (1.33.0).
 *
 * The opening paragraph of every entry was rewritten into the approved "trim"
 * voice. On the Know-before-you-go entries that rewrite is the dangerous kind:
 * a shorter paragraph is exactly where an actionable fact quietly goes missing,
 * and one already had. The owner's ruling, 2026-09-28:
 *
 *   "Nothing safety-relevant may be lost in trimming. On EVERY Know-before-
 *   you-go entry, keep every fact a guest acts on that today's text has."
 *
 * So SAFETY_FACTS below is not a description of the prose — it is the contract
 * the prose has to satisfy. Each row is a fact a guest DOES something with:
 * stands still, steps wide, washes, looks before sitting down. Rewording an
 * entry is fine; dropping one of these is a failure, and it fails here rather
 * than on the dock.
 *
 * Two of the rows are corrections rather than preservations, found while
 * re-verifying the text against sources and recorded in WATER-SOURCES.md:
 *
 *  - the diamondback used to promise "a rattle it will usually sound before
 *    you get close". It does not always rattle, and a guest who reads silence
 *    as an all-clear is worse off than one who never read the entry. The row
 *    below pins the correction, not the original.
 *  - poison ivy used to give an hour to wash. The oil binds to skin in about
 *    fifteen minutes; the row pins the real number.
 *
 * @package DCC_Wildlife
 */

// phpcs:disable

require __DIR__ . '/lib.php';
dcc_boot_plugin();
dccwl_test_reset();

use DCC_WL\Species;

/**
 * species id => [ short name of the fact => substring that must survive ].
 *
 * The substrings are deliberately the SHORTEST distinctive fragment that
 * carries the fact, so ordinary rewording does not trip the suite but deleting
 * the fact always does.
 */
const SAFETY_FACTS = [
	'cottonmouth' => [
		'it does not chase people'      => 'does not chase people',
		'it gapes white when cornered'  => 'gapes',
		'give it room, do not handle'   => 'never try to move or kill it',
	],
	'diamondback' => [
		'silence is not an all-clear'   => 'Do not count on hearing it',
		'it is a dry-ground animal'     => 'dry ground',
		'walk away, it will not follow' => 'it will not follow',
	],
	'pygmy' => [
		'the rattle is easy to miss'    => 'passes for an insect',
		'it lies still in leaf litter'  => 'leaf litter',
		'watch hands and feet'          => 'feet and hands',
	],
	'coralsnake' => [
		'the black snout is the tell'   => 'snout is black',
		'it bites when handled'         => 'picked up',
		'so do not handle it'           => 'handle it',
	],
	'fireant' => [
		'the mound has no hole on top'  => 'no hole in the top',
		'look before you sit or stand'  => 'Look before you set down',
		'watch anyone allergic'         => 'allergic',
	],
	'poisonivy' => [
		'leaves of three'               => 'Leaves of three',
		'the bare winter vine too'      => 'winter vine',
		'wash inside fifteen minutes'   => 'fifteen minutes',
	],
	'mosquito' => [
		'they get through screens'      => 'window screen',
		'bring repellent'               => 'repellent',
	],
	'lovebug' => [
		'they do not bite or sting'     => 'neither bite nor sting',
		'wash the car the same day'     => 'same day',
	],
];

$registry = Species::registry();

dcc_section( 'every Know-before-you-go entry still carries its actionable facts' );

foreach ( SAFETY_FACTS as $id => $facts ) {
	if ( ! check( isset( $registry[ $id ] ), "$id is still in the registry" ) ) {
		continue;
	}
	$sp   = $registry[ $id ];
	$prose = implode( ' ', [
		(string) ( $sp['fact'] ?? '' ),
		(string) ( $sp['safe'] ?? '' ),
		(string) ( $sp['mark'] ?? '' ),
		(string) ( $sp['best'] ?? '' ),
		(string) ( $sp['where'] ?? '' ),
	] );
	foreach ( $facts as $what => $needle ) {
		check(
			false !== mb_stripos( $prose, $needle ),
			"$id — $what",
			"nothing in the entry contains: $needle"
		);
	}
}

dcc_section( 'the safety group is exactly the entries this suite covers' );

$in_group = [];
foreach ( $registry as $id => $sp ) {
	if ( 'safety' === (string) ( $sp['group'] ?? '' ) ) {
		$in_group[] = $id;
	}
}
sort( $in_group );
$covered = array_keys( SAFETY_FACTS );
sort( $covered );
check_same(
	$covered,
	$in_group,
	'a new safety species cannot be added without giving it rows here'
);

dcc_section( 'every safety entry tells the guest what to do' );

foreach ( $in_group as $id ) {
	$safe = trim( (string) ( $registry[ $id ]['safe'] ?? '' ) );
	check( '' !== $safe, "$id has a what-to-do line" );
}

dcc_section( 'the diamondback no longer promises a warning' );

$dia = (string) $registry['diamondback']['fact'] . ' ' . (string) $registry['diamondback']['safe'];
check(
	false === mb_stripos( $dia, 'will usually sound' ),
	'the "it will usually rattle first" claim is gone',
	'it teaches a guest that silence means safety, which is false'
);

dcc_section( 'the trim did not turn any opening paragraph into a stub' );

foreach ( $registry as $id => $sp ) {
	$words = str_word_count( (string) ( $sp['fact'] ?? '' ) );
	check( $words >= 20, "$id — the opening paragraph is still a paragraph ($words words)" );
}

dcc_done();
