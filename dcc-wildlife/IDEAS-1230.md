# Proposals from the 1.23.0 round — written, not built

Rob asked for better alternatives as proposals. These are not in the release.

## 1. Your idea: the map AS the navigation on the water side

**Agree, with one change.** It is the right shape: the water side is a set of
places, and a list of cards is a worse index of places than a map is. Tapping a
pin opens that station's card, and swiping moves to the next pin.

The change: **swipe should follow DISTANCE from the cottages, not the payload's
order.** `miles_from_property()` already computes it for every pin, so "next"
means the next place along, which is the only ordering a guest can predict from
a map. Payload order is Atlas order, which is arbitrary and would feel random.

What it costs: the deck built in 1.23.0 already does the swiping, so this is
mostly wiring — bind the deck's index to the marker set and open the popup for
whatever the deck lands on. The real work is deciding what happens to the
fishing almanac and the moon card, which are not places and have no pin. My
suggestion: they stay below the map as they are. A map is a good index of
places and a bad index of everything else.

Worth doing after Rob has seen 1.23.0, because the deck is the piece it builds
on and he has not used one yet.

## 2. Your idea: a "seen it" checklist

**Agree it is the strongest idea on the list, and disagree about the storage.**

It is the only proposal here that gives the guide a reason to be opened on the
third day of a stay rather than the first. Everything else is a better version
of a thing you read once.

But `localStorage` is per-device, and a couple on holiday has two phones. Two
half-finished lists and no way to compare them is worse than no list. The
honest options, cheapest first:

1. **Per-device, and say so.** "Kept on this phone." One line of code, no
   accounts, no privacy surface. A good first version.
2. **A share code.** The list is a short string in the URL, so one phone can
   text it to the other. Still no server, still no accounts.
3. **Per-booking, server-side.** Correct, and a real project: identity,
   storage, retention, and a privacy note. Not worth it until Rob knows
   whether anybody ticks anything.

Recommendation: build (1) with the wording that makes the limit obvious, watch
whether it gets used, and only then consider (2).

## 3. Mine: the cap has stopped paying for itself

The 12-tile cap and its "Show all" button exist to stop a long group running
for screens. The deck now holds a group's tiles at a **constant height** — the
birds tab is the same height at 12 tiles as at 29 — so the cap no longer saves
a single pixel. Measured this release: expanding it changes page height by
under 120px, and `search121.js` asserts that.

So the cap is now a rule that hides seventeen birds for no benefit, and "Show
all 29" is a button that does not need to exist. **Proposal: remove both**, and
let the deck hold the whole group.

I did not remove it, because Rob asked for it in 1.21.0 and has not yet seen it
on the phone. It is his to drop.

## 4. Mine: the group glyph is the weakest thing on the screen

27 of 52 tiles show a group glyph, and in the birds tab that means rows of
identical feathers. The species-sprite tier added this release fixes seven of
them. The remaining 27 have neither photo nor drawing.

Three ways forward, and photos are not the only one:

1. **Photos** — what Rob is already sourcing. Best answer, slowest.
2. **Draw the missing 27 sprites.** They are the same hand-drawn SVG as the
   existing 24, about 30–60 minutes each to do properly, and they never need
   licensing or a credit line. A batch of 27 is a release of its own.
3. **Say what it is instead of drawing it.** A tile with no image could carry
   the species' silhouette *category* — "a small heron", "a duck" — as text in
   the media band. Honest, zero artwork, and much more informative than a
   feather. Ugly, though, and I would want to see it before recommending it.

My recommendation is (2) for the birds specifically, because the birds tab is
where the repetition is most visible, and it is the tab a guest opens most.
