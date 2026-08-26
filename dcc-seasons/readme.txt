=== DCC Seasons ===
Contributors: doracanalcourt
Tags: seasonal, particles, easter egg, matrix, canvas
Requires at least: 6.3
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 3.6.1
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Date-scheduled seasonal ambient particles plus a tap-the-logo Matrix-style
easter egg, built cache-safe and performance-first for doracanalcourt.com.

== Description ==

Two layers, both vanilla JS + 2D canvas (no libraries, no WebGL, no image
assets — every ambient particle is a bespoke inline-SVG sprite or a canvas
primitive drawn in code; emoji survive only as tofu fallbacks and as the
Matrix rain's deliberate glyph aesthetic):

1. **Ambient mode** — a sparse, slow, low-opacity drift of themed particles
   over the page during each scheduled date range. Capped at 16 particles,
   requestAnimationFrame-driven, paused when the tab is hidden, drawn on a
   `position:fixed`, `pointer-events:none`, `aria-hidden` canvas (zero CLS,
   never intercepts a click).
2. **Easter egg** — tapping/clicking the site logo (`#branding`, fallback
   `#site-title`) 5 times within a rolling 3-second window launches a
   full-screen Matrix-style glyph rain recolored and re-glyphed for the
   current theme (orange pumpkin rain in October, pastel egg rain at Easter…).
   Outside every range it falls back to the classic green Matrix rain. Exit
   via the ✕ button, Escape, or tapping the overlay. The rain engine
   (`matrix.js`) is a separate file lazy-loaded only on the launching tap.

= Cache-safe by design =

SpeedyCache (and HostGator's Endurance cache) serve cached HTML, so PHP never
bakes in "today's theme". The whole schedule ships to the client as a small
JSON config and the visitor's browser picks the active theme from its LOCAL
date at runtime. The markup is identical on every request. No AJAX, no
cookies, no localStorage.

= Every theme runs full =

As of 3.2.0 there are no "quiet" themes: Patriot Day and MLK Day get the same
particle counts, vignettes, parallax, pointer play, accents and working easter
egg as every other theme, in their own palettes. Use the density and opacity
sliders (or Visual richness) to tone any of it down.

= Accessibility & performance =

* `prefers-reduced-motion: reduce` → ambient layer disabled; the egg shows a
  static themed banner instead of animation (and follows live preference
  changes).
* Ambient loader is a single deferred script; the Matrix engine never loads
  unless someone finds the egg.
* Egg columns are capped at 60; both layers pause on `visibilitychange`.
* Excluded pages: the MotoPress checkout (`/submit-booking/`, detected via
  `MPHB()->settings()->pages()->getCheckoutPageId()` when MotoPress is
  active) and the Elementor editor/preview. Filterable.

= Logo tap behavior =

When the logo links to the page the visitor is already on (the usual case:
the home-page logo on the home page), the click's default reload is cancelled
so tap counting can survive five rapid taps. Logo links to *other* pages
still navigate normally — on those pages the first tap goes home, and the
egg is found there.

= Settings =

WP-Admin → DCC → Seasons: master enable, ambient on/off, egg on/off, where
effects appear, tap target selector, tap count, ambient density/opacity
sliders, and a fully editable schedule table ({start, end, theme, label}
rows, pre-seeded for 2026–27) — future years need no rebuild.

= Where effects appear =

Four nested tiers, default "All pages and posts" (today's behaviour):

* **Homepage only** — the front page and nothing else.
* **All pages except cottage pages** — every WordPress page, but not the
  MotoPress accommodation singles, so the booking screens stay calm.
* **All pages** — pages including cottage pages.
* **All pages and posts** — everything: posts, other post types, archives,
  categories, search and 404 as well.

Cottage pages are matched by MotoPress POST TYPE (`mphb_room_type`), never by
URL or slug — the live slugs don't correspond to cottage numbers
(`/accommodation/cottage-34/` serves room type 1607).

A page outside the scope loads none of the plugin: no script, no inline
config, no inline layering CSS. The scope decision is made server-side, which
is cache-safe because it depends only on which URL is being rendered, not on
the date — the season schedule still ships to the client and is still picked
from the visitor's local clock. Saving the settings purges the page cache so
already-cached URLs pick up the change; if no cache plugin can be purged
automatically, the settings page says so and asks you to purge by hand.

Scope covers the ambient particles AND the tap easter egg together, so with
"Homepage only" the egg does not fire on interior pages. Admin theme previews
(`?dcc_season=`) ignore the scope entirely, so you can always preview
anywhere.

= Theme preview (admins only) =

Append `?dcc_season=<theme_key>` to any front-end URL to force that theme for
the page view — ambient runs in it and the egg uses its Matrix palette.
`?dcc_season=off` forces no theme (no ambient, classic green egg). The
capability check (`manage_options`) happens server-side and only then is the
preview flag placed in the JS config, so visitors typing the parameter get
the normal date-driven behavior. The settings page lists every valid key.

= Filters =

* `dcc_seasons_options` — the effective option array.
* `dcc_seasons_schedule` — schedule rows sent to the client.
* `dcc_seasons_themes` — every theme definition (particles, palettes, glyphs).
* `dcc_seasons_config` — the final JS config object.
* `dcc_seasons_excluded_page_ids` — page IDs that never get effects.
* `dcc_seasons_is_excluded` — final say on excluding the current request.
* `dcc_seasons_in_scope` — final say on the "Where effects appear" gate
  (applied after the exclusions, so it can't re-enable the checkout).
* `dcc_seasons_cottage_post_types` — post types treated as cottage pages.
* `dcc_seasons_layering_selectors` — widgets raised above the canvas.
* `dcc_seasons_backdrop_host` — CSS selector for the element the canvas is
  mounted inside in "behind" mode (empty = auto-detect).
* `dcc_seasons_purged_cache` (action) — fires after a settings save purge.

== Installation ==

1. WP Admin → Plugins → Add New → Upload Plugin → `dcc-seasons.zip`.
2. Activate. Defaults are live immediately (schedule pre-seeded for 2026–27).
3. Optional: adjust under DCC → Seasons.

== Manual smoke-test checklist ==

* On a date inside a range: sparse particles drift; on any other date: none.
* 5 quick taps on the logo → themed rain; ✕, Escape, and overlay tap all exit.
* Outside every range: 5 taps → classic green rain.
* On 09/08–09/11 or 01/18 (adjust a row to today to simulate): Patriot Day
  and MLK Day run full, egg included.
* `/submit-booking/`: no script tag, no effects.
* OS reduced-motion on: no ambient; egg shows the static banner.
* No console errors, no PHP notices, no layout shift, booking flow untouched.

== Changelog ==

= 3.6.1 =
* FIXED (the real cause): "Behind interactive widgets" never worked on this
  site, and 3.6.0's widget fix — correct in itself — could not have fixed it.
  The theme's content column (Bravada/cryout: main.main) is position:relative
  with z-index:9 AND an opaque white background. It therefore establishes a
  stacking context that paints over any body-level canvas below z-index 9,
  and anything above 9 is simply "front" mode. No body-level z-index lands
  between that white background and the text on top of it, so the widget-level
  z-index:10 from 3.6.0 was never consulted — the occlusion happens a level up.
* The canvas is now mounted INSIDE that element at z-index:-1. A
  negative-z-index positioned descendant paints after its stacking context's
  background but before its in-flow content: above the white, below every
  piece of text, image and widget. It needs no cooperation from individual
  widgets at all.
* Measured on a reproduction of the live DOM stack, as the share of the white
  content column the canvas can paint on: desktop 0.0% -> 60.0%, mobile
  (375px) 0.0% -> 50.4%, with 0 of 90,438 (desktop) and 0 of 63,076 (mobile)
  inked pixels covered — no particle over any text, image, button, card or
  calendar cell. Coloured page margins stay fully reachable.
* The host is found by walking up from the page's content anchor to the
  nearest ancestor that both establishes a stacking context and paints an
  opaque background — never hardcoded to one theme's markup. Override it with
  the new `dcc_seasons_backdrop_host` filter.
* A candidate that turns out to be the containing block for fixed descendants
  (transform/filter/perspective) would clip the canvas; the mount is measured
  and such a host is rejected in favour of the next one up. If nothing usable
  is found the canvas returns to the pre-3.6.1 body mount AND logs a console
  warning naming the filter — it is never left invisible.
* "In front of everything" is byte-for-byte unchanged: body, z-index 99990.
* A plugin install or upgrade now purges the page cache. Uploading a zip
  changes nothing a full-page cache can see, so cached HTML kept the old
  inline config and the old `?ver=` asset URL — after the 3.6.0 upload the
  site went on serving engine.min.js?ver=3.5.0 until someone purged by hand.
  A stored version is compared against the plugin's, so FTP uploads and
  auto-updates are caught too, not just the upgrader.
* Art: `cork` replaced by `popper` (a party popper). Two redraws of a
  champagne cork read as a bucket and then a mushroom; the concept does not
  survive 28px, so the replacement licence was spent instead of a third try.
  Same New Year's scene, same beat.

= 3.6.0 =
* FIXED: "Behind interactive widgets" was far too aggressive. The rule also
  painted `background: #fff` on the Elementor widget WRAPPER — the whole
  bounding rectangle, not the controls — so the particles were hidden behind
  a pair of large opaque blocks rather than passing behind the widgets. A
  browser hit-test (canvas filled solid, screenshot, count the pixels it can
  reach inside each wrapper) measured 0.0% of the wrapper reachable, on
  desktop and at 375px alike. The rule now sets stacking only. Same
  measurement after: 22.0% desktop / 24.8% mobile reachable on a widget
  whose own root is transparent — its padding, gaps and rounded corners —
  while painted cards, cells and text still measure 0.0%. Widgets that paint
  their own background keep it and look identical.
* The widget list is matched by attribute prefix (`elementor-widget-dcc*`,
  `elementor-widget-mphbac*`) instead of three exact class names, and is
  filterable via `dcc_seasons_layering_selectors`, so a DCC widget rename no
  longer needs a release here.
* "In front of everything" is unchanged, and still emits no style tag at all
  — which is what makes a stale cached page detectable.
* Art: 16 sprites redrawn for accuracy — sleigh (the Christmas hero; read as
  a flying chicken drumstick), cornucopia, all three remaining autumn leaves
  (leafm/leafc/leafs — the primary particle in two themes), cork, lure,
  lilypad, petal, manatee, swan, hands, peel, stilts and pontoon.
* The April Fool's chattering teeth (`teeth0`/`teeth1`) are replaced by a
  whoopee cushion (`cushion0`/`cushion1`): the concept could not be read at
  particle size. Same two-frame chatter animation, same theme slot.
* Every one of the 278 path elements in the sprite registry passes the
  path-arity validator, and all 20 theme previews render with zero
  "<path> attribute d" console warnings.

= 3.5.0 =
* New "Where effects appear" setting (`scope`), directly beneath the
  ambient/egg toggles: Homepage only · All pages except cottage pages · All
  pages · All pages and posts. Default is "All pages and posts", including
  for existing installs whose stored options have no `scope` key, so
  upgrading changes nothing until you choose otherwise.
* Cottage pages are detected by MotoPress post type (`mphb_room_type`, asked
  of MotoPress's own API first), never by URL or slug.
* A page outside the scope now loads NOTHING — no loader script, no inline
  config, no inline layering CSS. Out-of-scope pages cost zero bytes.
* The scope gate runs alongside, never instead of, the hard exclusions: the
  MotoPress checkout and the Elementor editor stay clean under every scope
  value, and the new `dcc_seasons_in_scope` filter cannot re-enable them.
* Admin theme previews (`?dcc_season=`) bypass the scope gate, so previewing
  works on pages the current scope excludes.
* Saving the settings purges the page cache (SpeedyCache first, then other
  common caches, all guarded by function/class checks). The settings page
  reports what was purged — or warns you to purge manually if nothing could
  be reached.
* New filters: `dcc_seasons_in_scope`, `dcc_seasons_cottage_post_types`, and
  the `dcc_seasons_purged_cache` action.
* Note: scope governs the ambient effects and the easter egg together, so
  with "Homepage only" the egg does not fire on interior pages.
* No art, sprite, theme, schedule, engine, glyph or animation changes.

= 3.4.0 =
* The settings page moved from Settings → DCC Seasons to the shared
  **DCC → Seasons** top-level menu, alongside the other Dora Canal Court
  plugins' screens. The page slug is unchanged, so the old
  `options-general.php?page=dcc-seasons` URL redirects to the new
  `admin.php?page=dcc-seasons` and existing bookmarks still resolve.
* The shared parent menu is registered idempotently: whichever DCC plugin
  loads first creates it, and each one removes WordPress's auto-generated
  duplicate first item, so deactivating any sibling never orphans the page
  and never produces a second "DCC" menu.
* Internal: the admin screen ID changed with the parent
  (settings_page_dcc-seasons → dcc_page_dcc-seasons). The conditional admin
  asset enqueue and the preview-buttons panel now compare against the hook
  suffix add_submenu_page() returns rather than a hard-coded string, and the
  Plugins-row "Settings" link resolves through menu_page_url().
* No art, theme, schedule, engine, glyph, or option changes.

= 3.3.1 =
* Three more sprites were still shipping malformed path data from the
  3.2.0 precision-trim regex. The browser silently drops a bad path, so
  each rendered with a part missing while only whispering "<path>
  attribute d: Expected number" to the console: flamingo had lost its
  BEAK (the black-tipped bill is its field mark), hook had lost its BARB,
  and clover had one of four LEAVES malformed. All three are reconstructed
  from intent and rewritten with explicit spacing so no number pair can be
  ambiguous again.
* A path validator now ships in tools/validate-paths.js and runs in the
  test suite. The 3.3.0 registry scan searched for the regex's INPUT
  pattern (compact runs like "8.2.4"), but the corrupted OUTPUT ("12.2")
  is an ordinary-looking number that no text search can find — it is only
  detectable by parsing. The validator tokenises every `d` attribute and
  checks each command's argument count (M/L/T multiples of 2, H/V of 1,
  C of 6, S/Q of 4, A of 7, Z of 0). It found exactly these three and
  would have caught bat the day the regex ran. A companion browser check
  now fails the build on any "<path> attribute d" console warning across
  all 20 theme previews.
* Craft defects — a third class, distinct from "can you see it" (3.2.1)
  and "is it the right object" (3.3.0): is it BUILT correctly?
  - spider: 6 legs, asymmetric — the left three started at the body's edge
    and the right three at its CENTRE, so they emerged from under the body
    and read shorter. Now 8 legs, 4 per side, mirrored structurally by a
    <use> flip so symmetry cannot drift.
  - dragonfly: 2 same-angled wings on a rect body read as a paper dart.
    Now 4 wings in two pairs, a long segmented abdomen trailing well
    behind them, and a head with a compound eye.
  - web: radiating lines that read as scratches. Now 5 spokes plus 4
    concentric rings — the rings are what make it a web.
  - frog: no legs at all. Two bent hind legs added.
  - ladybug: 3 spots scattered across the elytra seam and no antennae.
    Now 4 spots mirrored about the seam, plus antennae.
* Anatomy sweep across every sprite with countable or symmetric parts came
  back clean. One deviation noted and deliberately kept: the strawberry's
  calyx has 4 sepals where real fruit has 5–7 — a stylisation that reads
  correctly at 28px.
* engine.min.js 65,736 raw / 23,105 gzipped, inside the 66KB / 23KB
  ceiling (3.3.0 was 64,803 / 22,823). No sprite had to be simplified to
  pay for the extra legs, wings and web rings.
* Art repair only: no theme, behaviour, settings, schedule or glyph
  changes, and all stored options survive untouched.

= 3.3.0 =
* The accuracy release. The criterion was not detail but whether a sprite
  depicts the object it is supposed to depict: if a viewer confidently
  names it as something else, it fails, because it silently misrepresents
  the theme. Every item below was that class of defect, judged at ~28px.
* Critical false reads fixed: joint (read as a PENCIL/cigarette — the tan
  wedge at the mouth end is exactly where a pencil's wood or a cigarette's
  filter sits, so it is gone; the cone is now strongly tapered and the lit
  end glows instead of being a hard orange bead); fleur (read as a CROWN
  or trophy — the side petals now sweep out and hook DOWNWARD, the
  decisive field mark, over a tapering foot rather than a blunt block);
  berry (read as a TOMATO — now a cone/heart silhouette pointed at the
  bottom with a pointed calyx crown on the shoulders and brighter seeds);
  horseshoe (read as a MAGNET — the branches now curve back in so the
  mouth is narrower than the widest point, which magnets never do, plus
  six high-contrast nail holes).
* silly retired. It read as ANGRY (an arc above two dots is a furrowed
  brow), and it was the last sprite still imitating a flat platform emoji.
  April Fool's leans on the existing jester instead, which also saves
  bytes.
* Softer misreads fixed: swan (read as a DUCK — now a long thin S-curve
  neck, small head, and the mute swan's black knob at the orange bill);
  bunny and bunnycarry (read as a BLOB with ears — now a crouched rabbit
  with a defined haunch, a muzzle rather than a sphere, and the tail as a
  tuft on the outline; bunnycarry holds the egg in front with its paws).
* bat was rendering brown rather than black because its wing path had been
  CORRUPTED by the precision-trim regex shipped in 3.2.0, which collapsed
  compact SVG number pairs such as "8.2.4" (two numbers) into one. The bat
  is redrawn, the trim is rewritten to only touch unambiguously delimited
  numbers, and the whole registry is checked for the same damage.
* Matrix rain: matrix.js can now paint DRAWN glyphs (a '@name' entry is
  rendered with canvas paths instead of fillText), so 4/20 rains a real
  cannabis leaf instead of 🍃, which is a wind-blown tree leaf — the very
  error the ambient sprite had before 3.2.0. Colour object-emoji are gone
  from twelve themes' glyph sets, replaced by typographic and katakana
  glyphs that render identically on every platform; ★ ✦ ▮ ❄ ♥ ☠ ⚜ ☘ ✿ and
  the katakana stay, and the eight already-clean themes were not touched.
* New Year's now reads as a celebration. Fireworks were built from stolen
  ambient particles — 13 dots on a 1200px canvas, which also emptied the
  theme while they flew. They are now a dedicated short-lived system: 26
  radiating streaks with trails, a flash at the burst point, and a cadence
  of 1.4–2.8s so any given moment shows one. The year is 46px bold with a
  dark outline (it was barely legible on a light page) and holds longer,
  the countdown numerals are outlined to match, and confetti and bubbles
  are large enough to register.
* engine.min.js 64,803 raw / 22,823 gzipped and matrix.min.js 5,959 raw /
  2,660 gzipped. The ceiling was raised to 66KB/23KB for this release but
  the engine landed under the OLD 64KB/22.5KB ceiling instead.
* No settings, schedule or behaviour changes; all stored options survive.

= 3.2.1 =
* Sprite contrast on light pages. The 3.2.0 audit judged every sprite
  against a single background; the live site renders particles over both a
  deep navy hero and large white content sections, and the pale sprites
  that survived on navy washed out on white. Root cause is stroke weight
  relative to viewBox width — a 1-unit outline on a 46-wide viewBox is
  about 0.6px at particle size, i.e. sub-pixel. Rule adopted: any sprite
  with a near-white body needs an outline of at least ~6% of its viewBox
  width, in a tone dark enough to read on white rather than a tint of the
  fill. Applied to dove (the worst case, and MLK Day's primary particle),
  swan, bunny, bunnycarry, ghost (kept deliberately soft — ethereal, but
  now visible), blossom, quill, joint and flutes (whose outline was wide
  enough but far too pale to count). Silhouettes and palettes unchanged.
* recycle redrawn. Three solid rotated wedges read unmistakably as a green
  fir tree at particle size — actively confusing on Earth Day, which
  already has plant particles. It is now the real Möbius symbol: three
  chasing ribbon arms with visible arrowheads and an open centre.
* fleur redrawn. The rounded lobes read as a chess piece or trophy; the
  petals are now lance-tipped over a banded waist, so the Mardi Gras
  reference lands at 26–34px.
* The audit grid is now the acceptance test: every sprite is rendered
  three ways — 120px on white, 30px on white, 30px on the site's navy —
  and passes only if identifiable in all three. That grid ships with the
  release. It also caught two the report had not listed: bunnycarry (as
  faint on white as bunny) and the Halloween web accent.
* engine.min.js 63,015 bytes raw / 22,228 gzipped, inside the 64KB /
  22.5KB ceiling (3.2.0 was 62,712 / 22,120) — outlines are cheap, so no
  art had to be thinned to pay for them.
* Art only: no theme, behaviour, settings, schedule, engine or layout
  changes, and all stored options survive untouched.

= 3.2.0 =
* 4/20 art fixed (the owner's direct complaint). The cannabis sprite was a
  smooth six-petal shape that read as a generic tree leaf; it is redrawn
  with the real field marks — 7 narrow lance-shaped leaflets radiating
  from one point, serrated edges, longest in the centre, smallest at the
  bottom. The grey curl-noise "wisp" particles (which read as noodles) are
  gone entirely, replaced by a drawn joint: tapered rolled cone, twisted
  paper tip, warm ember, and its own smoke curling up from the lit end.
  The peace emoji is now a drawn V-sign hand.
* No more "gentle" themes. Patriot Day and MLK Day run at full richness
  like every other theme — real particle counts, parallax, vignettes,
  pointer play, accents and a working easter egg. Patriot Day: waving flag
  cloths, red/white/blue stars, the eagle hero, a three-flag formation
  vignette, and a red/white/blue egg with star glyphs. MLK Day: doves in
  flight, olive sprigs and gold hearts on a gold/white palette, a
  dove-formation vignette, and a matching egg. The engine's `solemn`
  special-case is deleted; no theme ships `egg => false` any more. Preview
  labels are plain "Patriot Day" and "MLK Day".
* Full art audit — the ambient layer is now 100% drawn. All 24 remaining
  raw platform emoji (which rendered differently on every device and
  clashed with the drawn sprites beside them) are replaced by 18 new
  house-style sprites — snowflake, sparkle, fleur-de-lis, clover, orange,
  banana, burger, olive sprig, tree, flamingo, bat, champagne flutes,
  upside-down face, beach umbrella, recycle, fishing hook, joint, peace
  hand — plus a recolourable heart primitive and reuse of the existing
  bass, flagcloth and kayak art. Ambiguous silhouettes were re-cut after
  judging every sprite at its real 28px particle size: the pie was
  redrawn as a dish with a domed lattice crust, and the dove, swan and
  blossom (previously white-on-white and nearly invisible on a light page)
  gained outlines and shading.
* engine.min.js 62,712 bytes raw / 22,120 gzipped — within the raised
  64KB / 22KB ceiling (was 56,764 / 20,353).
* No settings, schedule, behaviour or performance-guardrail changes; all
  stored options survive untouched.

= 3.1.0 =
* New "Layering" setting (Settings → DCC Seasons, next to the layer
  toggles). "Behind interactive widgets" (the default, including for
  upgrades with no stored value) puts the ambient canvas at z-index 5 and
  raises the DCC cottage-selector and availability-calendar Elementor
  wrappers above it on a white backing — replacing the site-side
  mu-plugin rule (dcc-ui-tweaks item 3) byte-for-byte so it can be
  retired. "In front of everything" restores the pre-3.1 canvas
  z-index 99990 and outputs no widget CSS at all. The choice rides the
  existing config pipeline (a one-key `layer` flag the engine reads when
  creating its canvas); the Matrix easter-egg overlay is untouched in
  both modes and still covers everything. No other setting, theme, or
  behavior changed; existing stored options survive unchanged.

= 3.0.0 =
* The "wow" visual overhaul, designed around the Dora Canal identity.
* Bespoke illustrated sprite set (~75 inline SVGs, one consistent hand):
  species-accurate fall leaves (maple/oak/cypress/sweetgum), three
  jack-o'-lantern faces with flicker glow, turkey 2.0 leading chicks,
  glinting ornaments, state license plates (NY/OH/MI), rose petals, opening
  love letter, quill with ink trail, decorated-egg upgrades, pontoon 2.0
  with stern flag, kayak, swans, stilt walker, and more. Emoji remain only
  as tofu-checked fallbacks.
* Depth layers: FAR parallax layer (60% scale / 50% speed / 60% opacity)
  behind the NEAR layer.
* Waterline reflections: actors just above the water draw a flipped,
  squashed 25% mirror; floaters get a broken shimmer line. Off on mobile.
* Pointer awareness (observation only): particles ease away from the
  cursor and spring back; a click landing on a particle pops it without
  consuming the click.
* Vignette director — rare 5–12s choreographed scenes, one at a time,
  ≥90s apart: the pontoon flotilla, the FULL CAST fishing story (lure →
  bobber → circling shadow → bass strike), dragonfly-lands-on-the-bobber,
  witch across the moon, sleigh gift-drop (+ evening sleigh-past-moon),
  cork pop, flamingo arrival on the waterline, stilt walker, doubloon
  shower, the two swans forming a heart, berry-in-the-basket, the Easter
  egg hunt and the hatch, the banana slip, mama duck parade, the kayaker.
* THE real New Year's countdown: within the final 10 seconds of Dec 31 by
  the visitor's clock, numerals count down to a triple mega-burst with the
  year in gold.
* Evening tint (7pm–6am local): −10% brightness, +30% glow, night
  variants (fireflies on the canal, pontoon deck lights, sleigh-past-moon).
* Christmas snow accumulation: a ≤6px snow line builds along the
  waterline from settled flakes (per-session).
* Egg finale formations: ~18s into the Matrix rain the glyphs organize
  into the theme's shape (jack-o'-lantern, turkey, tree, year numerals,
  fleur-de-lis, heart, shamrock, egg, globe), hold, and dissolve.
* Heroes upgraded: 3-frame heron wingbeat with an occasional full landing
  sequence on the waterline (the classic no-theme day's signature);
  manatee mom-with-calf; upgraded rainbow moment (leprechaun hat, coin
  arcs, clover strip); the inverted heron on April Fool's only.
* Auto-degrade ladder (~8ms rolling frame budget): sheds reflections →
  far parallax → vignettes, silently. New settings: Visual richness
  (Full/Classic/Minimal) + Advanced visuals toggles (reflections,
  vignettes, pointer awareness, evening tint, snow).
* Patriot Day and MLK Day are exempt from all of it beyond sprite polish —
  quiet and dignified, nothing falls on Patriot Day, egg stays off.
* engine.min.js: 56.7KB raw / 20.3KB gzipped (budget ≤60KB / ≤20KiB).

= 2.2.0 =
* Preview tooling baked in (the "DCC Seasons Preview Links" companion
  mu-plugin can now be deleted): the settings page gets a panel of
  one-click preview buttons — one per theme plus a red-outlined "Off
  (force none)" — each opening the homepage with ?dcc_season=<key> in a
  new tab, with a note that reads the live saved tap count; and any
  front-end page loaded by an administrator with ?dcc_season= present
  shows a fixed bottom-right chip ("Previewing:" + a theme dropdown that
  swaps the param in place, preserving path and other query params, and a
  ✕ that removes it). Admin-gated inline output only — nothing is
  enqueued for visitors and non-admins get no markup at all. Themes added
  via the dcc_seasons_themes filter appear in both automatically. No
  engine, loader, schedule, or visitor-facing changes.

= 2.1.0 =
* Directional facing: particle specs can declare `face:'L'` (native art
  faces left) and the engine mirrors the glyph when travelling rightward —
  boats, fish, birds, turkey, flamingo Vs, dove, bunny and chick now face
  their direction of travel. Flags, symmetric glyphs, and canvas primitives
  are never flipped; jump-arc rotation stays correct when mirrored. The
  emoji heroes (eagle, witch) and the duckling line flip too.
* FIX: the big-bass hero never rendered (jump physics ran but there was no
  draw branch — visitors saw two unexplained ripples). It now draws a 🐟
  (🐠 fallback) at 40px, rotated along its arc and facing its travel.
* FIX: procedural Easter eggs could pick identical base/decoration colors
  and look plain; the decoration color now always contrasts, and the eggs
  are ~15% larger (sz 20–30) with a heavier spawn weight.
* New `cruise` behavior: rides AT the waterline with a gentle bob while
  steadily crossing, dropping a wake ripple every 2–4 s. Labor Day's
  speedboat is replaced by a new pontoon-boat SVG sprite that cruises the
  water (boats no longer fly mid-air); Spring on the Canal's canoe cruises
  too. Labor Day gains the waterline and plants its beach umbrellas at the
  bottom (grow) instead of raining them; Christmas trees likewise grow up
  from the bottom edge instead of falling.
* Easter Matrix rain: removed '🥚' (renders as a plain chicken egg);
  glyphs are now 🐣 🐰 ✿ with the pastel palette unchanged.

= 2.0.0 =
* FIX (critical): the tap target now accepts a comma-separated selector list
  and binds every VISIBLE match (Bravada renders #branding at 0px on this
  site). Zero-size elements are skipped; #masthead is the last resort. New
  default: `#branding, .header-image .entry-title, .entry-title, #site-title`.
* FIX: canvas sizing hardened for Chrome zoom / wide monitors — one width
  source (canvas rect × devicePixelRatio), re-applied on window.resize AND
  visualViewport resize with a particle re-seed (ambient and egg).
* Particle overhaul: THE WATERLINE (settle+ripples, floaters, jumping bass,
  submerged manatee along the bottom ~8%); 20+ motion personalities (sway,
  flutter, dangle, hang, toss, hop, waddle, dart, twinkle, chatter, grow,
  vee formations, orbit-pair, burst…); hybrid rendering (emoji + recolorable
  canvas primitives + ~19 inline SVG sprites, tofu-checked fallbacks).
* BRAND HERO: the great blue heron glides across every 2–3 minutes in every
  theme AND on no-theme days. Per-theme heroes: eagle, witch flyby, Santa
  sleigh, manatee, big bass jump, ducklings, St. Patrick's rainbow moment.
* Patriot Day rebuilt: NOTHING falls (twinkle + slow glide only), ribbon
  accent, eagle hero, egg still disabled. MLK Day: dove/olive/heart, gentle.
* New Year's fireworks now flash the auto-computed year at the burst point.
* The ambient engine is its own lazy file (engine.js) loaded after idle;
  the deferred loader stays tiny. All caps unchanged (≤16 particles
  including ripples, ≤60 egg columns, visibilitychange pause).

= 1.1.0 =
* Theme preview: `?dcc_season=<theme_key>` forces a theme for the page view
  (`off` forces none) — restricted server-side to logged-in users with
  `manage_options`. Valid keys listed on the settings page.

= 1.0.0 =
* Initial release: ambient particle layer, lazy-loaded themed Matrix egg,
  pre-seeded 2026–27 schedule, settings page, cache-safe client-side date
  logic, checkout/Elementor exclusions, reduced-motion support.
