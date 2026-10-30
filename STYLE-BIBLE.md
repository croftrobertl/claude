<h1 align="center">Seasons Style Bible</h1>

<p align="center">Drawn from the three approved pieces: the heron (4.9.0), the witch (4.10.x) and the tom (4.13.2).<br>
Every value below is read from their painters' code. New and redrawn art is checked against this page.</p>

<h2 align="center">The House Look in One Line</h2>

A field-guide painting, small: real anatomy, one soft light from above and to
the left, form made by value and overlap, not by outline, and color kept a
step quieter than life so it sits in the photograph instead of on top of it.

<h2 align="center">1. Light Direction</h2>

- **One key light, from the upper left**, about 45° above the horizon,
  for every subject and every pose. The tom's code says it in words ("all lit
  from ONE side (upper left)"). The witch's body gradients run from her upper
  left (light) to her lower right (dark). The heron's body runs light at the
  back to dark at the belly.
- **Back and top are lit; belly and underside are in shadow.** Draw the body
  as a vertical gradient, three stops:
  - top: the lit color (heron back `#7F95AE`);
  - about 55-60%: the mid tone (`#62788F`);
  - bottom: the shadow tone (belly `#5D6B7C`).
- **Far parts are the same form, darker, never a different color.** The far
  wing is the near wing's colors × 0.72 (`HN.farTint`). The witch's far leg is
  her near-black `#0E0C12`.
- **The light does not move when the animal does.** A mirrored bird keeps its
  pre-drawn light (the Anniversary crane: Rob accepted the flipped light), but
  a new piece is drawn lit from the upper left in its main facing.
- **Night scenes:** the moon is the key light, and the figure goes to
  silhouette while it crosses the disc. A colored rim keeps it readable
  (see 3).

<h2 align="center">2. Outline Policy</h2>

- **No outline around the whole figure.** None of the three is stroked round
  its silhouette. The shape is made by the fill and by the value change
  against the background.
- **Lines only where a real edge shows**, thin and colored, never black:
  - feather shafts: 0.35 units, `#56657A` (heron);
  - covert rows: 0.5, a step darker than the coverts;
  - cloth folds: 0.55, `rgba(12,8,18,.5)` (the witch's cape);
  - the pale edge of a turning form: 0.42-0.7, light and part-transparent
    (heron leading edge `rgba(226,232,240,.5)`, tom wing feathers
    `rgba(222,208,186,.6-.9)`).
- **A rim line is allowed only to separate dark from dark.** It is a
  colored, part-transparent stroke on the edge AWAY from the key light. Examples:
  - the witch's purple rims: 0.35-0.9, `#9C36B5`, or `rgba(110,42,134,.55)`
    on the cape;
  - the cat's purple rim against the dark cape.
- **Width scales with the drawing**, as a fraction of the body. It is never a
  fixed screen pixel.

<h2 align="center">3. Shadow and Occlusion Color</h2>

- **Shadows are the object's own color, darker and cooler. Never gray, never
  black.**
  - heron: slate `#7F95AE` → `#5D6B7C`;
  - witch: purple-black `#2A2236` → `#1E1928`;
  - tom: warm brown-black.
- **Ambient occlusion where parts meet** is a soft drop shadow under the part
  on top, offset toward the side away from the light:
  - tom fan: `rgba(12,6,2,.45)`, blur 1.6 u, offset 0.4 u;
  - tom coverts: `rgba(10,6,2,.5)`, blur 1.4 u, offset 0.3 u;
  - tom wing: `rgba(20,14,10,.5)`, blur 0.8 u.

  The color is the subject's darkest tone at 45-50% alpha, not `rgba(0,0,0,…)`.
- **The darkest value is never pure black.**
  - Darkest values in use: `#16110F` (tom body), `#16131D` (witch ink),
    `#1A1D22` (heron cap), `#0E0C12` (the witch's far leg).
  - The one exception is a pupil (`#111`), at a size where it reads as "eye".
- **The lightest value is never pure white.**
  - Lightest values in use: `#F6F4EE` (heron face), `#F1F0F3` (tom crown),
    `#E6CDA4` (fan tips).
- **Contact shadow: required for new art.** None of the three approved pieces
  draws one (the heron's flights never touch the ground; the tom's feet have
  none). They are not reopened. Every new piece that stands on ground or
  water must have one:
  - a soft ellipse under the feet, the ground's color darkened, 35-50% alpha;
  - on water, a short broken reflection in its place.

<h2 align="center">4. Edge Softness</h2>

- **Lost and found.** An edge is sharp where the form turns against the light:
  the lit back, the bill, the hat brim, a feather tip catching the light. It
  is soft or lost where the form turns away: the belly into shadow, the far
  wing, the cape into the night sky.
- **Soft is made by the gradient and by alpha, not by blur.** No `ctx.filter`
  (Safari). The witch's moon was painted small and scaled up for soft edges.
- **Sheen and iridescence are a radial wash at ~10% alpha, never specks.**
  - tom shoulder: `rgba(150,140,90,.1)`;
  - tom breast: `rgba(180,120,70,.1)`;
  - each washes over 20 units, clipped to the body.
- **Feathers overlap, and only their tips show.** Rows are laid far to near,
  each slightly varied in size, angle and spacing (deterministic jitter
  `tkJ`), so no two rows repeat and nothing looks like a pattern or a ring.

<h2 align="center">5. Palette Range</h2>

- **Natural subjects are sampled from photographs, then muted a step.**
  Saturation stays below life:
  - heron slate: `#7F95AE` `#62788F` `#86A0BA`;
  - heron rust: `#8E4A2A` `#A75C36`;
  - tom bronze and copper edges: `#8E6440` `#86603E`;
  - tom fan: `#5E4331` with buff tips `#A9744A` → `#E6CDA4`.
- **Bright color only where the animal really has it, and small:**
  - heron bill and eye: `#E2B23E` / `#F2C230`;
  - tom wattle and face: `#D52B3D` / `#4F72D2`;
  - the witch's purple band and gold buckle: `#9C36B5` / `#E2B23E`.

  These are accents, a few percent of the figure's area.
- **Temperature follows value.** Lit areas warm (cream, buff, gold); shadows
  cool (slate, purple-black). In a warm scene light (golden hour, the
  Anniversary dance) the whole figure takes the scene's grade:
  - the crane is graded `rgba(38,44,34,.42)` to the hero's dim light;
  - nothing is left at studio brightness.
- **Shared gold.** `#E2B23E` is the house gold. It is the heron's bill, the
  witch's buckle and the moon-lit details. Reuse it before inventing another.

<h2 align="center">6. How Detail Scales With Size</h2>

| Size on screen | What is drawn | Example |
|---|---|---|
| **Guest size (24-110 px)** | The silhouette, the light-to-shadow gradient, the 2-4 color accents a field guide would name, and the large feather groups. | The heron at 96 px: body, two wings, seven primaries, two covert rows, the head stripe and the bill. |
| **The 3× close-up** | Individual feathers in rows, shafts, barring, the rim and sheen. Everything here must still sit inside what reads at guest size, and add no new shapes. | The tom's fan barring, the witch's 16 straw bristles, the cape's folds. |
| **Below ~20 px** | The silhouette, the gradient and one accent color only. | Small falling pieces: the acorn, the cranberry. |

- **Detail costs pre-render time, never frame time.**
  - Draw every pose once, at size × min(DPR, 2), in a worker or in idle time.
  - Draw a frame as one `drawImage`.
  - The heron has 24 beats; the witch has 12 phases; the tom has 37 poses
    (in a worker).
  - Only parts that must move freely are drawn live: the heron's legs, the
    witch's cape and hair.
- **Squint test.** At guest size the piece must read as the animal and as a
  solid form in grayscale. If a detail makes the squint muddier, remove it.

<h2 align="center">Using This Page</h2>

The Art Standards' **style test** checks new art against sections 1-6 and
against the three pieces side by side, at the same scale. Report a pass or a
fail per section, one line each. The test passes only if all six pass and
the piece looks like the same artist drew all three.
