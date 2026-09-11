<?php
namespace DCCS;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * PARKED — NOT RENDERED ANYWHERE SINCE 0.29.0. Nothing calls this class.
 *
 * The two hand-drawn marks that flanked the heading: a canal cottage and a heron
 * in a wizard's hat. They replaced the 🏠 / 🧙‍♂️ emoji in 0.26.0 and were retired
 * in 0.29.0 after four rounds of revision.
 *
 * WHY THEY WERE RETIRED, so nobody re-litigates it as a craft problem: it was
 * structural. A 38px pictogram was being asked to say "cottage" and "wizard" and
 * "canal" simultaneously, and at that size it always resolved as a puzzle to be
 * worked out rather than a thing to be recognised. No amount of redrawing fixes
 * a mark that is carrying three ideas. The character moved into motion instead
 * (assets/js/cast.js) — an animation reads at any size, where a 38px drawing does
 * not.
 *
 * The file is kept, unreferenced, for the size notes below. They are the durable
 * part: they were learned by rendering at 22px and looking, four times over, and
 * anyone who later draws ANYTHING for this widget at heading size will otherwise
 * rediscover them the same slow way. To bring the marks back, merge
 * Heading_Marks::all() into the icons map in Config::build() and render them in
 * selector.js renderLanding() — that is all 0.26.0 did.
 *
 * WHY CUSTOM SVG AND NOT EMOJI
 * Emoji render differently on iOS, Android and Windows — the owner cannot see
 * what a guest sees — and 🏠 is a generic suburban house that says nothing about
 * eight waterfront cottages on the Dora Canal. These are drawn in the site
 * palette and share their vocabulary with the DCC Wildlife sprites, so the
 * plugins read as one family.
 *
 * NOTES FOR THE NEXT PERSON TO TOUCH THESE AT HEADING SIZE
 * The shipping size is ~22px tall on a phone (1.4rem heading) and ~27px from
 * 640px up. That is the constraint everything below bends to:
 *
 *  - Nothing thinner than ~1.7 units of a 24-unit viewBox survives. Every stroke
 *    here is 2.0-2.6. Scale-accurate line weights disappear.
 *  - THE BRIM CARRIES THE HAT, NOT THE CONE. At 22px the hat is about 6px tall,
 *    and a cone that size reads as a smudge on the bird's head. The brim is the
 *    widest horizontal in the whole mark and it is what the eye resolves, so it
 *    overhangs the skull on both sides well past anything realistic. Narrow the
 *    brim to make it look "right" enlarged and the mark stops reading at size.
 *  - The cone must sit centred on the SKULL, not on the mark. An earlier pass
 *    centred the tip instead of the base and the hat looked to be sliding off.
 *  - The beak stays below the brim. Drawn any longer it collides with the brim
 *    and the two merge into one spiky blob.
 *  - THERE IS NO BEARD ON ANY WIZARD MARK, and three attempts are why: filled
 *    with the accent it read as a bib; knocked out to the page background it is
 *    a downward triangle, so the dark around it always resolved into two peaks
 *    like an open beak, no matter how narrow it was cut; narrowed far enough
 *    that the silhouette survived, it was too small to read as anything at all.
 *
 * The marks are decorative: the heading's accessible name comes from its text,
 * so each SVG is aria-hidden and unfocusable. Sizing is in em (see selector.css)
 * so they track the heading type instead of being pinned to a pixel size, and
 * fills are currentColor so they follow whatever colour the heading is set to.
 * The single accent — the lit window and the hat band — is themable through
 * --dccs-mark-accent without touching this file.
 */
final class Heading_Marks
{
    /**
     * Trusted, plugin-authored HTML for the front-end config's `icons` map. It
     * travels the same channel as the Elementor icon-manager icons — server
     * rendered, injected raw by selector.js — because the heading string itself
     * is escaped and inline SVG cannot be interpolated into it.
     *
     * @return array<string,string>
     */
    public static function all(): array
    {
        return [
            'heading_cottage' => self::cottage(),
            'heading_wizard'  => self::wizard(),
        ];
    }

    /** Gable roof, chimney, lit window, dock, and the canal running beneath. */
    private static function cottage(): string
    {
        return '<svg class="dccs-mark" viewBox="0 0 28 24" aria-hidden="true" focusable="false">'
            . '<rect x="6.2" y="2.4" width="2.7" height="5.2" rx="0.5" fill="currentColor"/>'
            // Chimney is drawn first so the roof laps over its foot, and sits on
            // the slope where it clears the roofline instead of hiding behind it.
            . '<path d="M14 1.1 L27 10.4 L23.6 10.4 L14 3.6 L4.4 10.4 L1 10.4 Z" fill="currentColor"/>'
            . '<rect x="5.6" y="9.8" width="16.8" height="7.4" fill="currentColor"/>'
            . '<rect x="10.6" y="11.6" width="6.8" height="4.4" rx="0.7"'
            . ' fill="var(--dccs-mark-accent, #FFA000)"/>'
            . '<rect x="0.9" y="17" width="26.2" height="2.1" rx="1" fill="currentColor"/>'
            . '<rect x="4.4" y="18.7" width="2.2" height="2.7" fill="currentColor"/>'
            . '<rect x="21.4" y="18.7" width="2.2" height="2.7" fill="currentColor"/>'
            . '<path d="M0.9 22.4 q3.4 -2.1 6.8 0 t6.8 0 t6.8 0 t6.8 0" fill="none"'
            . ' stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
            . '</svg>';
    }

    /** Heron standing in the canal, wearing a wizard's hat. */
    private static function wizard(): string
    {
        return '<svg class="dccs-mark" viewBox="0 0 26 24" aria-hidden="true" focusable="false">'
            // Bent cone, centred over the skull. The lean is what separates a
            // wizard's hat from a party hat.
            . '<path d="M19.4 0.8 C19.4 2.8 19.8 4.9 20.4 6.5 L12.2 6.5 C13.2 4.1 16.1 1.5 19.4 0.8 Z"'
            . ' fill="currentColor"/>'
            // Hat band: the one detail that still reads when it is a pixel tall.
            . '<path d="M12.8 5 L19.6 5 L20.4 6.5 L12.2 6.5 Z"'
            . ' fill="var(--dccs-mark-accent, #FFA000)"/>'
            . '<path d="M10.2 7.3 Q16.5 5.1 22.8 7.3 Q16.5 9.4 10.2 7.3 Z" fill="currentColor"/>'
            . '<circle cx="16.4" cy="10.4" r="2.5" fill="currentColor"/>'
            . '<path d="M18.4 9.7 L24.4 10.6 L18.4 11.6 Z" fill="currentColor"/>'
            // The long S-curve neck that makes a heron a heron.
            . '<path d="M15.2 12.4 C12.4 13.4 13.2 15.6 10.6 16.4" fill="none"'
            . ' stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
            . '<path d="M0.9 15.2 L5.4 13.9 C8.2 13.1 10.9 13.7 12.1 14.9 C13.5 16.3 13 18.4 11.1 19.3'
            . ' C9 20.2 6.2 19.9 4.4 18.9 C2.9 18.1 1.8 16.6 0.9 15.2 Z" fill="currentColor"/>'
            . '<path d="M6.6 19.2 L5.9 21.8 M9.4 19.4 L10.3 21.8" fill="none"'
            . ' stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
            . '<path d="M0.9 22.5 q2.9 -2.1 5.8 0 t5.8 0 t5.8 0 t5.8 0" fill="none"'
            . ' stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
            . '</svg>';
    }
}
