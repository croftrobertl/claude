# DCC Seasons — project notes

## The standard for every sprite, scene and hero (set 2026-10-12)

Rob, on 4.9.0: "the heron looks amazing! … Use the heron effect as the
gold-standard for future Seasons and hero effects."

The **4.9.0 Great Blue Heron** is the bar. Anything new that moves on the
page — a sprite, a scene, a hero — meets all of this before it ships:

1. **Drawn in code, with real anatomy.** Not a three-frame SVG, not a
   generic shape: the field marks a person who knows the subject would
   check (the heron: neck folded in an S, legs trailing past the tail,
   dark flight feathers, white face and black plumes, a dagger bill). A
   real object is drawn from its real layout (the 4.10.0 moon: the maria
   placed from their selenographic coordinates).
2. **A many-frame motion cycle, pre-drawn once at load.** The heron's
   24-pose wingbeat and the witch's 12-frame riding cycle are built in
   idle time after the page loads (`requestIdleCallback`), each pose on
   its own tight canvas at min(devicePixelRatio, 2), so the running cost
   is one `drawImage` a frame. Only what must react to the moment (the
   heron's legs, the witch's cape and hair) is drawn live, and kept to a
   few strokes.
3. **It costs no more than what it replaces — measured, not assumed.**
   `node tools/measure-heron.js` (a hero) or `--scene=<name>` (a scene),
   against the previous build with `DCC_ASSETS=<old assets/js>`: main
   thread busy time during the effect, 390 px at 3× density and 4× slowed
   CPU, and 1280 px. Alternate old and new runs (the headless numbers move
   ±10% with machine load) and report both, with the frame rate.
4. **Believable physics.** Eased, never constant speed: the heron's
   downstroke is longer than its upstroke and it glides between bouts;
   the witch's speed follows her height through the dive and the swoop
   out (fast at the bottom, slower high up) and she leans along the felt
   gravity; cloth and hair are simulated chains under gravity and drag.
5. **Rob sees it before it ships.** Frame strips (a close-up of the
   motion, and the subject large on a light and a dark ground) plus a
   short video of the whole thing at phone and desktop width, from the
   REAL engine on the mocked clock: `tools/scene-reel.js` (`--closeup`,
   `--follow`), `tools/heron-poses.js`, `tools/witch-poses.js`. Staging
   first; live only after he signs off.

What it is NOT: a licence to choose. Every design choice is still Rob's,
made from rendered options (CLAUDE.md, "Rob designs it by choosing").

## Releases measured against the standard

| Release | Effect | Phone 390 px, 4× CPU | Desktop 1280 px | Pre-draw |
|---|---|---|---|---|
| 4.9.0 | Great Blue Heron crossing | 537 ms/s (old heron 570) | 100 (106) | 32 poses, 92 ms, 3.3 MB |
| 4.10.0 | Witch over the full moon | mean 474 ms/s over four alternating 5-run sets (4.9.0's witch: 429) — **about 10% more** | 72 (64) | moon + 12 frames, ~48 ms, 1.3 MB |
| 4.10.1 | Witch over the moon, smoothed, cloth cape, behind the title | a slower machine: at 2× CPU 621 ms/s vs 4.9.0's witch 566 (two alternating 5-run sets) — **about 10% more**; at 4× both saturate, 47–48 fps vs 51–52 | 218 (196) | moon + 12 frames, 42–56 ms, 1.3 MB |
| 4.10.2 | Witch over the moon, one swoop, no loop | another machine: at 2× CPU mean 663 ms/s vs 4.10.1's 646 and 4.9.0's 622 (two alternating 5-run sets each) — **the same per second as 4.10.1, about 7% over 4.9.0**, for a scene half as long (4.3 s vs 8.2 s), so about half the work per scene | 240 (4.10.1 240, 4.9.0 224); 6.3 s vs 10.1 s | moon + 12 frames, ~48 ms, 1.3 MB |

All at 60 fps unless stated. Absolute numbers depend on the machine the
run is on (the 4.10.1 container was about twice as slow): compare only
builds measured side by side on the same machine. Most of an effect's cost is the canvas repainting at full
rate while anything moves, which every hero and scene pays.

**4.10.0 is over the bar by about 10%, and that was reported, not
rounded away.** The extra is what cannot be pre-drawn: the live cape and
hair chains and the silhouette pass while she crosses the moon. Getting
there took three measured cuts (draw her straight onto the page canvas
instead of a scratch canvas every frame; put the moon on whole device
pixels; fewer physics substeps). If Rob wants parity, the next lever is
drawing the cape and hair at 30 fps — his call, rendered first.
