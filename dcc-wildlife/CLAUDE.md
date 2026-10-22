# CLAUDE.md — DCC Wildlife

Guidance for Claude Code sessions working on the **DCC Wildlife** plugin
("On the Canal This Month") for doracanalcourt.com. Read the repo-root
`CLAUDE.md` and `SITE-CONTEXT.md` first for whole-site context (cache stack,
theme, table prefix).

## Purpose

Two Elementor (free) widgets + shortcodes: `dccwl_month` / `[dcc_wildlife]`
showing what wildlife to expect on the Dora Canal, and (v1.4.0)
`dccwl_water` / `[dcc_water]` showing fishing & water conditions. This replaces an earlier
failed Firebase/Google-Maps/weather-API build that leaked credentials.

**Removed feature:** v1.0.0–1.1.0 shipped a moderated guest sightings log
(CPT `dcc_wl_sighting`, nonce-free AJAX endpoints, Settings → DCC Wildlife
toggle). The owner had it removed in v1.2.0 for lack of use — the widget is
now fully read-only with zero AJAX. If it is ever wanted back, restore from
git history at the v1.1.0 commit; any old sighting posts and the
`dcc_wl_settings` option may still exist in the DB, harmlessly orphaned.

## Hard rules (do not "fix" these)

- **No API keys, no accounts, no CDN scripts, no webfonts.** The wildlife
  guide and the water almanac make ZERO network calls. v1.4.0 added one
  deliberate, negotiated exception: the water module's **optional,
  off-by-default** live layer calls two keyless public-domain APIs (USGS,
  NWS) server-side. It was resolved in the open — the plugin header was
  rewritten to describe what actually happens rather than keep claiming
  "no external services". Do not re-broaden that promise, and do not add a
  third remote source without the same conversation.
- **Image files: allowed since v1.11.0 for VETTED species photos only
  (owner-authorised 2026-09-01).** The "no image files, ever" rule was
  relaxed on purpose. As of 1.24.0, 29 species carry a real licensed photo
  in `assets/photos/<id>.jpg` — the hero of the detail sheet, and since
  1.19.0 the tile face too, at `-320`. Each is visually vetted for the
  correct species and optimised; they load `loading="lazy"`, so a guest who
  never scrolls to a species pays nothing for it. Species with no accurate
  free photo DELIBERATELY keep their drawn scene or their group glyph —
  never swap in a wrong-species photo to fill the gap. `Species::photos()`
  is the map. DO NOT delete `assets/photos/` as a "no image files"
  cleanup — it is now sanctioned. Still no webfonts, no CDN, no
  non-species images.
- **THE PHOTOGRAPHS LIVE IN THE MEDIA LIBRARY. 1.30.0 SHIPS NONE.** `assets/photos` was 11MB of a 12MB plugin and every
  update carried all of it, uploaded from a phone. `Photo_Library` owns this.
  Two things it exists to prevent, both invisible in production:
  1. **NOTHING COMPOSES A URL.** The old client built the srcset by replacing
     ".jpg" with "-600.jpg" on a base URL. WordPress dedupes filenames on
     upload: one pre-existing fern.jpg makes ours fern-1.jpg and the replace
     asks for fern-1-600.jpg — a 404, silent, visible only on a retina screen,
     and `fern`, `heron`, `lily`, `moss` and `turtle` are all plausible
     collisions. Every rendition is its own attachment, found by its own meta
     (`_dcc_wl_species`, `_dcc_wl_rendition`), and the URL comes from
     `wp_get_attachment_url()` — which is also what Jetpack Photon rewrites.
     NEVER reintroduce a base-plus-filename scheme.
  2. **WORDPRESS MUST NOT RE-CROP THEM.** The -320 faces are hand-cropped onto
     the animal; a centre crop of the white pelican in a big sky is a speck.
     The import suppresses `intermediate_image_sizes_advanced` and
     `big_image_size_threshold` for its duration, in a `finally`.
- **The credits do NOT move.** `Species::PHOTO_SOURCES` stays in code. Four
  photographs carry a real CC BY obligation and a licence living in a database
  row is one accidental media edit away from a breach. The attachment caption
  is a convenience copy for anyone browsing Media; the credits panel never
  reads it.
- **One import function, two callers**: `wp dcc-wildlife import-photos` and a
  button on the Wildlife admin screen. The owner works from a phone and must
  never need a shell, or anyone else, to rebuild after a reinstall. It is
  idempotent — a rendition already carrying our meta is skipped — so a second
  run creates nothing rather than 306 attachments.
- **UNINSTALL NEVER DELETES THEM.** They are the owner's media now and may be
  used elsewhere. `uninstall.php` says so; do not add a sweep of attachments
  carrying our meta, not even behind `delete_on_uninstall`.
- **WHERE A FRESH INSTALL GETS THEM.** `assets/photos` stays in the REPOSITORY
  as the provenance record and is excluded from the plugin zip. The build
  recipe produces a second artifact, `Wildlife - Photo Pack <version>.zip`,
  which is unzipped into `wp-content/uploads/dcc-wildlife-photos/`. The
  importer reads that folder as well as the bundled directory, and `url()`
  reads the SAME source list — so a dropped pack serves immediately, before
  the import has even run. A plugin zip alone can no longer rebuild a site's
  tiles; ship the pack beside it.
- **The fallback chain is unchanged and must stay graceful**: media library,
  then any source folder that has the file, then the species' own drawing,
  then the group glyph. An empty URL is never an error and must never become
  an `<img>` with an empty src.
- **ATTRIBUTION IS PER-PHOTO DATA, AND IT IS A LICENCE OBLIGATION, NOT
  DECORATION (1.24.0).** Through 1.23.1 every photo was free-tier Adobe
  Stock and one hard-coded string ("Photo: Adobe Stock") served the lot.
  Photo batch 2 broke that: Adobe's free pool is thin for North American
  species — no pied-billed grebe at all — so six came from **Wikimedia
  Commons**, and three of those are **CC BY**, which REQUIRES the
  photographer and the licence wherever the image is shown. So:
  `Species::PHOTO_SOURCES` is `id => [ credit, licence, source URL ]`;
  `photo_credits()` reads it and falls back to the Adobe row for anything
  with no row of its own; `photo_credit_line()` composes the one-liner the
  sheet shows. Both the sheet (JS) and the crawlable credits panel (PHP)
  must show it — the sheet is where the photo is displayed at size, so a
  sheet printing the wrong credit is a licence breach, not a typo. On the
  wire, `dataset()` sends `credit` only when it differs from the default;
  that is transport economy, not the data model, and `photo_credit_line()`
  is always complete server-side. Never invent a source URL: no URL renders
  no link.
- **A PHOTOGRAPH IS A CLAIM, AND THE FACT GATE APPLIES TO IT (1.25.0).**
  Putting a photo on a tile asserts "this is that species". Almost every
  photo here is identified from features visible in the frame and needs
  nothing more. Where the identification rests on something else,
  `Species::PHOTO_NOTES` carries one line saying what — rendered under the
  credit in the detail sheet, never in the credits panel, because it is
  provenance and not attribution. The fish crow is the case that built it:
  fish and American crows are NOT separable by sight (voice is the field
  mark, which the entry has always said), so its photo says where it was
  taken and that the call is what settles it. A note EXPLAINS an
  identification; it never RESCUES a doubtful one — for the four venomous
  snakes the bar stays "the diagnostic features are visible in the frame",
  because a wrong snake on the safety page can get somebody hurt and no
  caption undoes that. Five photos carry a note as of 1.26.0: the fish crow
  (not separable by sight at all), the cottonmouth (the gape identifies it,
  but the frame is head-on so the vertical pupil and facial pit it also
  claims are absent), the green watersnake (identified by an ABSENCE of
  pattern, which is only diagnostic once you know the others have one), the
  fire ant (the tile names a species; the photograph is a mound Commons files
  as unidentified Solenopsis), and the mosquito (the tile promises
  "Mosquitoes and No-see-ums" and shows one Culex). Each is a different way a
  photograph can fall short of the claim its tile makes — that is the test
  for whether a note is needed.
- **Indicating modification is part of attribution (1.26.0).** Every photo
  is cropped and resized into three renditions, which makes each an adapted
  work, and CC BY 4.0 / CC BY-SA 4.0 both require that modification be
  indicated. One sentence at the head of the credits panel covers all of
  them; do not remove it, and do not "tidy" it into the per-photo lines.
- **The one ShareAlike photo is the cottonmouth**, CC BY-SA 4.0. Because our
  renditions are adaptations they are offered under the same licence, which
  its licence field states outright. That does not reach the plugin's code:
  an image shipped beside code is an aggregation, not a derivative. A CC BY
  4.0 alternate exists on the Commons file page if that obligation ever
  becomes unwanted — swapping it is a PHOTO_SOURCES row and three files.
- **A photo whose licence does not add up does not ship.** Batch 3's least
  bittern was held: the frame carries a "© Steve Arena 2013 - USFWS
  Volunteer" notice, and "work of the US federal government" does not cover
  a volunteer's copyright assertion. It is not registered AND its files are
  not in `assets/photos/`, so nobody wires it in later without learning
  why it was held. Check every frame for a burned-in credit or watermark:
  it is evidence about the licence, and it contradicted the manifest here.
- **The shape a photo-batch manifest must arrive in.** One row per photo
  with exactly three fields, in this order: (1) the credit as it should
  read, photographer first — `lwolfartist / CC BY 2.0`,
  `USFWS Pacific (public domain)`; (2) the licence in full —
  `Creative Commons Attribution 2.0 Generic`; (3) the source page URL, or
  empty. Slug, species name and the three renditions alongside. That maps
  one-to-one onto a `PHOTO_SOURCES` row with no interpretation.
- **Intake rule for a photo batch (Phase 2 ships about five of them).**
  The supplied slugs are guesses and the captions are not evidence: rename
  to this plugin's ids, and OPEN EVERY IMAGE AND IDENTIFY THE SPECIES BY
  EYE before registering it — filenames lie, and the classic bad
  substitution here is an anhinga sold as a cormorant. For the four
  venomous snakes in the "Before you go" group (Florida cottonmouth,
  eastern diamondback, dusky pygmy rattlesnake, eastern coral snake) a
  wrong photo could get somebody hurt, so those are checked personally and
  never taken on trust — cottonmouth against the three watersnakes we
  already draw, and coral snake against its harmless mimic. Register in
  `photos()` and `PHOTO_W`; credits follow automatically. The harness loop
  in `test-batch1.php` then gates the renditions for you: original +
  `-600` + `-320` on disk, the thumb exactly 320×240, the `-600` exactly
  600 wide, and `PHOTO_W` equal to the original's real width. An original
  may be portrait (the coot's is 1100×1216) — `PHOTO_W` is the srcset
  width descriptor, so only the width is ever recorded. Check the `-320`
  too, not just the full frame: it is the tile face, and a correctly
  identified bird can still crop to mostly water.
- **TYPE IS OURS, NOT THE THEME'S (1.27.0).** The deployment theme serves
  `html { font-family: Raleway; font-size: 20px; font-weight: 700;
  line-height: 1.8 }`. About 68 of 77 text elements declared no weight of
  their own and inherited 700, so every paragraph in the guide rendered bold
  on live while every test passed on a neutral fixture. Two layers fix it and
  both must stay: `.dccwl-app` declares the normal case, and a block of
  element rules (`.dccwl-app p`, `li`, `span`, …) beats a theme that styles
  bare tags, because inheritance loses to any rule naming the element. A
  source lint in test-1270.php fails any rule that sets a text property
  without a weight; ui127.js measures the rest ON theme-page.html, a fixture
  that reproduces the hostile root. NEVER assert typography on the neutral
  page — it passes while the site stays bold, which is the whole history of
  this defect.
- **THE SIZES ARE rem AND MUST STAY rem.** `--dccwl-fs-*` are relative on
  purpose: the "older clientele" comment on `--dccwl-fs-base` means a
  visitor's own text-size setting has to work. The 20px root makes everything
  render 25% larger than the 16px design, and that is not a bug to "fix" with
  px. The one px font-size in the plugin is the 16px floor on the search
  input, which stops iOS zooming the page on focus; the lint allows exactly
  that one and fails any other.
- **Weights are named, not numeric**: `--dccwl-fw-body` 400,
  `--dccwl-fw-label` 600, `--dccwl-fw-strong` 700. A rule answers "is this
  body or a label", not "is this 400 or 600".
- **Alignment is by ROLE.** Titles and section headers centre
  (`.dccwl-title`, `.dccwl-sheet-title`, `.dccwl-detail-h`, `.dccwl-fg-group`,
  `.dccwl-water-sub`, `.dccwl-water-title`, `.dccwl-sci`); body text starts.
  The heading floor in app.css sets WEIGHT ONLY — adding `text-align` there
  made `.dccwl-app h3` (0,1,1) out-specify `.dccwl-sheet-title` (0,1,0) and
  the sheet title would never centre.
- **NAVIGATION IS BY SECTION, NOT BY GROUP (1.27.0).** `Species::groups()`
  is still the DATA taxonomy — it keys the group glyph a species falls back
  to, and a bird glyph is not a critter glyph. `Species::sections()` is what
  the guide is navigated by: Animals (critters + birds, 38), Plants (5),
  Safety (8, plus the alligator, which is flagged `danger` and appears in
  both). `section_members()` carries that dual membership, and
  `$include_flagged = false` switches it off for the PROSE guide, which must
  describe each species exactly once — a tile shown twice is a convenience,
  a species written out twice is duplicated content for a crawler.
- **SAFETY IS ITS OWN DESTINATION. DO NOT MERGE IT.** The owner asked to
  delete it, was shown that it holds the four venomous snakes plus the fire
  ant, mosquitoes, lovebugs and poison ivy, and chose to keep it under the
  plain name — the objection was the wording. It is no longer FIRST (the row
  is Animals | Plants | Safety | Peak Now), which reverses the 1.19.0
  "safety renders first everywhere" rule on his instruction. What did not
  change: it is its own section, it holds all four snakes, and it is never
  month-filtered. test-1270.php asserts the snakes by name.
- **A CATEGORY TAB SHOWS EVERYTHING IN IT (1.28.0).** Animals, Plants and
  Safety are not month-filtered by default. They were, silently, and nothing
  on screen said so: in September that made SEVEN species unreachable from
  any tab — the manatee, bald eagle, river otter, white pelican, wood stork,
  American coot and pied-billed grebe, every one a winter species. A guest
  could not find the manatee by browsing.
  The filter now runs only when `state.monthPicked` is true, which `setMonth`
  sets when a PERSON chose the month: a timeline button, an arrow, a month
  tile, or a month named in the URL. The canal-time month the page opens on
  is not a choice. Peak Now is where seasonality belongs — it says so in its
  own name. test-1280.php asserts those seven by name, in every month.
- **THERE IS NO TILE CAP (1.28.0).** A twelve-tile cap with a "Show all"
  control used to sit under each section. It saved no vertical space — the
  deck lays a section out sideways, so 38 tiles cost the same height as 12,
  which the old suite asserted itself — and it hid 19 of 31 animals. Its
  tests were RETIRED, not inverted: unlike the season countdown there is no
  feature here that could come back. Do not reintroduce one without the
  owner.
- **Peak Now is a FILTER, not a section.** It renders no grid: the month it
  means is the visitor's, so widget.js fills it in canal time exactly as the
  spotlight does, and a cached page can never carry a stale one. It crosses
  all three sections including Safety — a venomous snake at its most active
  is what a guest should be shown — and it is NEVER capped, because
  "everything at peak" means everything.
- **The footnote row must fit ONE line at 360px**, not 361. It wrapped on
  live at 393px after passing the harness at 361px, because this sandbox has
  no Raleway and fell back to a narrower face — "By month" measured 66px here
  and 80px on the site. ui128.js therefore asserts the row at 360px AND
  requires 12% headroom, so a wider face still fits. Labels are short for the
  same reason ("Credits", not "Photo credits"); the full phrasing is the
  accessible name.
- **The season countdown is RETIRED (1.27.0)**, at one gate:
  `Render::countdown_possible()` returns false. That closes the widget, the
  hub, the standalone Elementor widget and the shortcode at once while
  leaving their registrations in place, so an existing Elementor placement
  renders nothing instead of erroring. `fillCountdown()` and the cd* strings
  went with it; restoring the feature means restoring all three.
- **No odds labels, ever.** `Species::odds()` survives as data and still
  ranks species, but `oddsNames` is not sent to the browser and nothing
  renders a label. "You will see one" is a guarantee the canal cannot make.
  Note there were FIVE tiers, not the three usually named; the one that
  carried information rather than probability was `daytrip`, and the `place`
  field already says that in its own "Where to go" section.
- **The footnote row is one row of links**, not sections: the prose guide,
  the photo credits and the month picker. Visible labels are short so three
  fit at 393px; the full phrasing is the accessible name. THE PHOTO CREDITS
  CONTENT IS A LICENCE SURFACE — every credit plus the modification notice —
  and only the entry point shrank. The month link is the ONLY door to the
  month picker (`go('month')` appears nowhere else) and ships hidden because
  a standalone widget has no panel to open; canal.js unhides it.
- **PHP must never bake "the current month" into HTML.** The site is
  aggressively page-cached (SpeedyCache + Endurance + advanced-cache.php).
  The full 12-month dataset ships to the client in the inline `DCC_WL_CFG`
  JSON and `assets/js/widget.js` picks the month from the visitor's local
  date. The month headline, spotlight strip, month nav and detail panel are
  client-rendered; only the month-independent field-guide grids are
  server-rendered.
- **Never insert dynamic text as HTML.** PHP escapes everything on output;
  the JS inserts all dynamic text via `textContent` only. The SOLE innerHTML
  exception: the static, trusted SVG constants in `widget.js` (scene
  medallions, icons) — never anything derived from data or input.
- **Prefixes:** PHP `dcc_wl_` / `DCC_WL_` (namespace `DCC_WL`), CSS
  `.dccwl-`, filters `dcc_wl_species` / `dcc_wl_calendar`.
- **Elementor category is `dcc-widgets`** (title "Dora Canal Court") —
  the slug shared by ALL DCC-built widgets on the live site. Registered
  idempotently in `Plugin::register_category()` so activation order never
  matters. (v1.0.0 briefly used `claude-code` from stale repo docs — that
  slug is wrong; do not reintroduce it.)
- Every visible string is translatable, text domain `dcc-wildlife` (the site
  uses Loco Translate).

## Architecture

```
dcc-wildlife.php              # Headers + constants + require()s
includes/class-plugin.php     # Singleton; registers hooks, assets, Elementor bits
includes/class-species.php    # Species registry + monthly likelihood table (PHP data,
                              #   filterable); dataset()/best_months_label() helpers
includes/class-sprites.php    # Bespoke species sprite registry (48×48 SVG path data)
                              #   + symbol-sheet/<use> emitters (v1.3.0)
includes/class-render.php     # Shared renderer for widget AND shortcode (identical
                              #   output); prints DCC_WL_CFG inline JSON once;
                              #   owns the season countdown since 1.8.0 — ONE
                              #   renderer behind three entry points (month
                              #   widget toggle, dccwl_countdown widget,
                              #   [dcc_wildlife_countdown]), shell emitted ONCE
                              #   per page; widget.js computes the day count
                              #   client-side in canal time
includes/class-countdown-widget.php # Elementor widget dccwl_countdown (1.8.1):
                              #   thin wrapper over the same countdown renderer;
                              #   editor shows a why-empty note instead of nothing
includes/class-widget.php     # Elementor widget (free APIs only); thin Render wrapper
includes/class-canal-render.php # THE HUB (1.10.0): hub -> month -> species and
                              #   hub -> water, as stage panels. COMPOSES
                              #   Render::render() and Water_Render::render()
                              #   unchanged — never forks their markup
includes/class-canal-widget.php # Elementor widget dccwl_canal + [dcc_canal]
includes/class-water-fact.php   # THE GATE: private ctor + make(); no source => no Fact
includes/class-water-data.php   # Stored settings + almanac (one seeded verified row)
includes/class-water-live.php   # Water Atlas (level/Secchi/DO/TSI/bathymetry) + USGS
                                #   rainfall + NWS; deviation wording, silence rules,
                                #   staleness guards, gauge discovery + atlas probe
includes/class-water-rest.php   # Public: /conditions, /map (both serve cache).
                                #   Admin (manage_options): /test-atlas,
                                #   /discover-waters, /discover-gauges
includes/class-water-render.php # Water widget/shortcode renderer; static server-side, live client-side
includes/class-water-admin.php  # ONE page: DCC -> Wildlife (falls back to
                                #   dcc-wildlife-water while the countdown
                                #   mu-plugin still owns that slug), prio 63
includes/class-water-widget.php # Elementor widget dccwl_water
assets/css/app.css            # THE TOKEN LAYER (1.9.0; Guide's measured values
                              #   since 1.9.1): every colour/radius/gap/duration
                              #   + density and glass modifiers (NO dark — see
                              #   the always-light rule), plus the shared
                              #   primitives (tiles, sheet, chips, buttons).
                              #   Dependency of both widget stylesheets —
                              #   re-theming happens HERE only
assets/js/canal.js            # Hub navigation (1.10.0): stage swapping, the
                              #   month grid, hub previews, history + focus.
                              #   Drives widget.js via window.DCCWL_Widget
                              #   rather than duplicating month logic
assets/css/canal.css          # Hub layout + the centring rules
assets/js/sheet.js            # THE SHARED OVERLAY (1.9.0): one sliding sheet for
                              #   the species detail AND the chain map; focus
                              #   trap, Escape/back/scrim/history close,
                              #   scroll-lock. Dependency of both widget scripts
tools/extract-guest-guide-tokens.js # Console snippet run on /guest/ to (re)capture
                              #   the Guest Guide's token values
assets/css/widget.css         # Month widget; all colour via app.css tokens
assets/js/widget.js           # One vanilla-JS file, no jQuery, no AJAX
assets/css/water.css          # Water module styles (loaded only where placed)
assets/js/water.js            # Fills the live strip from the REST route
assets/js/admin-water.js      # Repeatable rows + USGS gauge discovery (admin only)
assets/js/water-map.js        # The chain map — fetched on demand, never enqueued
```

Data model: the registry (id, emoji, name, group, fact, best, where) and the
calendar (12 ints per species, 0=rare 1=possible 2=good 3=peak) live in
`class-species.php`. Spotlight = value ≥ 2 for the shown month, ordered
value desc and by registry order among ties; value-3 tiles get a "Peak"
label and the detail sheet a "Peak season" badge. (There is no mascot: the
flag, its tile marker and the tie-break it won were removed in 1.9.2 — the
site has no mascot, so do not reintroduce the concept.) The "Best: Nov–Mar"
ranges are derived in PHP (`best_months_label`, value-3 months falling back to the
row max, wrapping across the year end) and shipped per species as
`bestLabel` in the config JSON.

## Information architecture (since v1.10.0)

The front end is ONE app with four levels, placed by the `dccwl_canal`
widget / `[dcc_canal]`:

```
L1 hub      countdown hero (zero taps) + two tiles: Wildlife, Water
L2a month   twelve month tiles, the canal's month ringed + "now" chipped
L3a species headline, spotlight, tabs + full guide grids, timeline switcher
L4a sheet   the species detail (assets/js/sheet.js) — unchanged
L2b water   the whole water module, section order unchanged; map = a sheet
```

Rules that hold this together — break any of them and the app misleads:

- **Composition, never a fork.** The species and water panels are the output
  of `Render::render()` and `Water_Render::render()` verbatim. Content
  parity with the legacy widgets is therefore structural, not something to
  re-audit each release. The legacy widgets and shortcodes still render
  flat when placed alone; they are live-safe during the transition.
- **Previews obey the same truth rules as their sources.** The Wildlife
  preview is computed from the bundled calendar (always available). The
  Water preview is built ONLY from facts the existing `/conditions` call
  returned — water.js announces them on a `dccwl:water-facts` event and
  canal.js buffers the last one, so ordering between the two scripts cannot
  matter (during development the fetch resolved one millisecond before the
  canal initialised). No facts → the tile shows its name alone. The module
  auto-hiding entirely → no Water tile at all.
- **HISTORY IS STATE-DRIVEN, NOT "STEP UP".** sheet.js pushes its own entry
  on open and pops it on close and must not be touched, so canal.js reads
  the level out of `popstate`'s state object instead of stepping. That is
  what makes every ordering work: back with a sheet open closes the sheet
  and leaves the level; Escape (which makes sheet.js call history.back()
  itself) likewise; back with no sheet walks up one. A "step up on any pop"
  design passes the first test and fails the second.
- **The chosen month is session UI state, not history state.** It persists
  across species ↔ sheet ↔ picker and is never rewound by a back press.
  Each fresh page load starts at the hub on the canal's current month.
- **Month logic is never re-implemented.** canal.js calls
  `window.DCCWL_Widget.setMonth(root, m)`; widget.js still owns the
  headline, spotlight, timeline and guide chips. The timeline also needs
  `recenter()` after its panel is un-hidden — `offsetLeft` is 0 while
  hidden.
- **The guide month chips render only inside the hub.** On the flat legacy
  widget they add ~41px of height on a phone, over the budget that surface
  has kept since 1.1.0; in the hub they sit on a screen that IS a month.
- Nothing month-dependent or time-sensitive is server-rendered — not the
  month tiles' labels, not either preview. Same doctrine as the spotlight.

## UI architecture (the app language, since v1.9.0)

v1.9.0 rebuilt the UI to speak the DCC Guest Guide's visual language so
/guest/ and the wildlife pages read as one app. **It changed chrome and
interaction only** — no data source, REST route, fetch rule, countdown
maths or any part of the Water_Fact gate was touched, and that separation
is worth preserving in any future re-skin.

**The token values ARE the Guest Guide's, measured from the live site
(1.9.1).** 1.9.0's placeholder palette is gone. `app.css` now carries the
Guide's own primary #0f6dbf, accent #f08080, text #111111, muted #5d7891,
near-opaque white tiles and 15%-blue borders, its cozy 5px/10px gaps, its
120–140px tile-min, 10px glass blur, and its 300ms
`cubic-bezier(.34, 1.56, .64, 1)` overshoot. Values the Guide did not
expose (a faint tint, hover states, shadows) are DERIVED and marked so
inline — those lines are the only judgement calls in the palette. The live
config being matched is: custom preset, density cozy, glass ON, dark OFF,
which is what `app_classes()` emits (filterable via `dcc_wl_app_classes`).
`tools/extract-guest-guide-tokens.js` remains, for re-measuring if the
Guide is ever re-themed.

**ALWAYS LIGHT — never recolour (Rob's decision, 1.9.1).** There is no OS
dark-mode rule anywhere in this plugin, and there must not be one. 1.9.0
shipped an auto-dark palette and then had to paint its own dark ground to
stop a dark-OS visitor seeing light-on-light text, because Bravada has no
dark mode. The Guide solves it the other way: its surfaces are near-opaque
WHITE, so the host and OS themes cannot reach the content. Every surface
this widget owns must therefore stay opaque and light — making one
transparent is what would let a dark page show through and bring the bug
back. A test greps for `prefers-color-scheme` and also renders the module
under both OS schemes asserting the screenshots are PIXEL-IDENTICAL, so
any reintroduction fails loudly whatever form it takes.

Height budgets. The honest figures, re-measured 2026-09-09 — the numbers that
stood here from 1.9.1 (≤ 560px desktop / ≤ 760px mobile) had drifted to less
than half of reality and were quietly ignored for four releases, so they are
replaced rather than restated. **Default render: ≤ 1100px desktop /
≤ 1800px mobile** (measured 1053 / 1737). The growth is all deliberate and
each step was asked for: the five-row colour key (1.18.0), photo-first tiles
at 4:3 (1.19.0), a fourth group, the photo-credits card, and the search row
(1.21.0).

**The number that matters from here is not that one.** At 51 species — and
much more so at 169 — what threatens the page is the LONGEST GROUP, and since
1.21.0 the cap holds that constant: no group ever puts more than
`GUIDE_CAP` (12) tiles on screen, so the birds tab measures ~1530px whether it
holds 29 species or 90. `search121.js` asserts both halves — never more than
the cap on screen, and the capped height against what it would otherwise be
(2000px+ of work at 29 birds). Adding species to a group must not move it.

- **Hero**: JS sets "{Month} on the canal" + "N species at their peak"
  from the calendar data (with a custom title, the month moves into the
  subline). Both lines have reserved min-heights — no layout shift.
- **Spotlight band**: one horizontally scrollable row of TILES
  (scroll-snap, a right-edge mask that drops at the end, ~40ms staggered
  fade-in on month change, capped). **It must stay a single row** — a
  wrapping grid of a dozen species measured 721px and blew the height
  budget. The guide grids below DO wrap, because they sit behind tabs.
- **ONE sliding sheet per page**, shared by the species detail and the
  chain map (`assets/js/sheet.js`, body-level, `role="dialog"`
  `aria-modal`). It moves focus in, traps it, and returns it to whatever
  opened it; Escape, the back affordance, a scrim tap and the browser or
  Android back button all close it; `<html>` is scroll-locked while it is
  open. Detail content is therefore styled under `.dccwl-sheet`, NOT
  `.dccwl-root` — root-scoped rules can never reach it.
- **Hero stat**: the season countdown leads the widget (it trailed it in
  1.8.x). Empty, hidden shell server-side; filled client-side in canal time.
- **Scene medallions**: three drawn SVG vignettes (critters / birds /
  plants) shared across all 17 species, stored as static JS constants; the
  circle crop is CSS `border-radius` + `overflow:hidden` — deliberately no
  SVG clipPath/gradient defs, whose ids would collide across instances.
  The critters vignette uses lightened water tones (#2b5a66/#234b56) so
  dark sprite silhouettes read against it.
- **Species sprites (v1.3.0)**: every species is a hand-drawn flat
  two-tone SVG in `class-sprites.php` — 48×48 canvas, deep-teal
  silhouettes + per-species accents, no stroke thinner than 1.2, legible
  at both 22px (chip) and 76px (medallion). The whole set ships ONCE per
  page as a hidden `<symbol>` sheet (printed by Render before the first
  root, ~12.5KB min / ~3.4KB gz); chips and medallions reference it with
  `<use>` (PHP `Sprites::use_svg()`, JS `spriteUse()` via createElementNS —
  never innerHTML, since species ids pass through the filterable config).
  `symbol_sheet()` minifies on output and strips `fill="none"` /
  `stroke-linecap="round"`; the CSS rule setting those on
  `.dccwl-chip-sprite`/`.dccwl-medallion-sprite` is LOAD-BEARING (they
  inherit into the <use> shadow content). Species emoji remain in the
  registry only as a fallback for filter-added species without a sprite.
  Watch two specificity traps: the medallion sprite selector must out-rank
  `.dccwl-medallion svg`, and the navy expanded chip gives dark sprites a
  light backing disc.
- **Field guide**: three tab chips + server-rendered chip grids (they are
  month-independent, so cache-safe). NOTE: grids get `display:flex`, which
  defeats the UA `[hidden]` rule — the explicit
  `.dccwl-guide-grid[hidden]{display:none}` rule is load-bearing.
- **Motion**: CSS transitions only, all ≤ 250ms, everything inert under
  `prefers-reduced-motion` (the sheet still opens — it just does not
  travel). The tile hover-lift is also dropped there: with no transition to
  carry it, a 2px jump under the cursor is worse than no lift.
- **Motion follows the Guide's signature overshoot** for transforms
  (`--dccwl-ease`, 300ms) and a plain curve for colour
  (`--dccwl-ease-color`) — an overshoot on a colour sends it past its own
  value and back, which reads as a flicker.
- **Sprites need no dark handling since 1.9.1.** The icon wells are always
  a light tint, so the deep-teal silhouettes keep contrast unaided. The
  1.3.0 trap (dark sprite on a dark ground) can only return if someone
  darkens a tile — which the always-light rule already forbids.

## The water module (v1.4.0) — read before touching it

The owner's hard rule governs this module: *"I'd rather exclude false
information and have missing informational pieces than tell people something
that's not true."* It is enforced structurally, not editorially.

- **`Water_Fact` is the safety mechanism.** Private constructor; the only
  way to obtain one is `Water_Fact::make()`, which returns `null` unless the
  input has a valid tier (`live`/`published`/`general`), a non-empty source
  name and a parseable date. The renderer accepts Facts only. **Never add a
  public constructor, a `::raw()` escape hatch, or a "trust me" flag** — that
  is the single guarantee this module makes.
- **An unknown field is omitted, never rendered as "unknown".** An empty
  almanac renders as an absent section. That is correct behaviour, not a bug
  to be "fixed" with plausible placeholder numbers.
- **The almanac ships nearly empty, on purpose.** v1.4.0 had no network and
  seeded nothing. In v1.5.0 the owner verified sources on 2026-08-27, so the
  defaults carry his checked values only: the property coordinates, five
  active Lake County gauge IDs, and ONE published row (Lake Dora's area).
  Everything else still enters via the admin form, the
  `dcc_wl_water_almanac` filter, or the live layer — all three gated.
- **Water temperature is permanently absent. Do not add it.** No `00010`
  series exists on this water; the nearest are springs at a constant ~72 °F
  while the canal swings 50s–90s, so a reading would be wrong in exactly the
  direction that drives fishing. `class-water-live.php` carries the full
  reasoning in a header comment — read it before "improving" anything there.
- **Never print a raw gauge elevation as a headline.** Every level source
  reports height above a datum (the atlas station reads ~61.2 ft NAVD88); a
  guest reads that as depth. Show a deviation in inches; keep the raw reading
  and its datum in the attribution line.
- **THE PAYLOAD ENVELOPE.** Atlas readings arrive as
  `{ name, payloadType, payload: {...} }` — the wrapper carries the name,
  the payload carries the data. `find_component()` unwraps an associative
  payload; a LIST payload (Bathymetry) keeps the wrapper. Returning the
  wrapper shipped in 1.6.0 and silently dropped every reading while the
  probe reported both endpoints healthy. Do not "simplify" that unwrap.
- **NWS sends `updateTime`, not `properties.updated`.** Requiring `updated`
  dropped forecast and wind every time in 1.6.0. Order is
  `updated ?? updateTime ?? generatedAt`; `updateTime` is the ISSUANCE time
  and `generatedAt` is only when the JSON was rendered.
- **`array_is_list()` is PHP 8.1+ and this plugin supports 8.0** — it is
  behind a `function_exists()` guard with a fallback. Keep it that way.
- **Staleness is PER-WATER, never global.** Griffin's level is from 2008 and
  Yale's from 2025; both are flagged stale and excluded from any deviation.
- **Each water compares against its OWN median/norm.** Chain medians run
  1.21–2.80 ft, so a chain-wide average would be meaningless.
- **Adding chain waters is DISCOVERY, never invention.** `closest` caps at
  `len=20`, so `discover_waters()` sweeps from the property and from each
  configured water and unions the results (sweep points capped at 8, cached
  a day). Candidates are listed for the owner to pick — the endpoint returns
  ponds and unrelated water. Never hardcode an Atlas id that has not come
  back from the live API.
- **Dates: precision is DECLARED, not guessed.** Facts carry
  `date_precision` ('day'|'minute'). Everything except the NWS forecast is
  dated to the day — a lab sample arrives as a midnight instant, and
  rendering "sampled May 28, 12:00 AM" claims precision the source lacks.
  `water.js` has an inference fallback for owner-entered rows.
- **Date-only values are read in the SOURCE's frame, never converted.**
  `new Date('2026-08-22')` is midnight UTC, so a naive render showed the
  previous day to every guest west of UTC. `dateOnlyParts()` reduces such a
  value to y/m/d and rebuilds it locally; a timezone sweep test covers it.
- **Atlas placeholders: `UNKNOWN` is a VALUE, not an absence.** Most of the
  chain's depth maps carry `method: UNKNOWN`. `is_placeholder()` catches
  that and similar; never print one.
- **Depth-map choice is newest-first, method only as a tie-break.** The
  waters publish same-date pairs (one UNKNOWN, one DGPS-SONAR) that are
  different exports of one survey. Preferring the labelled method outright
  gives Lake Harris a 2001 map instead of its 2014 one — do not "improve"
  this into a method preference.
- **A bigger chain warms progressively.** ATLAS_FETCH_BUDGET bounds each
  background pass; MAP_FETCH_CEILING bounds an explicit map open. Waters
  with nothing cached yet are absent, never shown empty.
- **The map loads NOTHING external until opened** — no Leaflet, no tiles, no
  data. It is a button, not an embed, and a test asserts zero external
  requests before the click.
- **TWO base layers, satellite default** (owner's decision, 1.7.1). MIND THE
  COORDINATE ORDER: Esri is `{z}/{y}/{x}`, OSM is `{z}/{x}/{y}`. Swapping them
  renders perfectly and shows the wrong place — tests pin both. Each layer
  carries its OWN `attribution` so Leaflet swaps the credit with the layer;
  never hardcode one line for both. Both URLs and attributions are settings,
  because a provider swap must be a paste, not a release.
- **Tile failure degrades honestly:** 5 misses tolerated, sustained failure
  switches layers (and the Base map radio follows), both failing drops the
  imagery for markers on a plain background. Never leave grey squares.
- **Water Atlas gotchas, resolved live 2026-08-27 — do not re-derive these:**
  the base has **no `/api/` prefix**; `s` is an **integer** Site Id (`s=lake`
  returns 400, omitting it 404s); the API key is the Water Atlas **waterbody
  id** (Lake Dora = `7972`), **NOT** the FDEP WBID `2831B`; and Secchi lives
  in **WaterQuality**, not `WaterClarity` (an annual colour/chlorophyll/
  turbidity report with no Secchi at all).
- **Read `units` and `precision` from each payload; never assume them.**
- **Per-parameter trust in the atlas `historic` blocks.** Secchi's is sound
  and is used for the long-run median. The Water Levels component's is NOT —
  `minValue` 0 is impossible for a lake at 61 ft NAVD88 and `medValue` is
  null. Level uses `historicAverageForMonth.norm` and nothing else.
- **`find_component()` is breadth-first on purpose:** the shallowest match is
  the component itself, so a nested `historic` sub-block carrying the same
  parameter name can never impersonate the current reading.
- **Only speak when it matters.** A level within `LEVEL_SILENT_INCHES` of its
  monthly norm, or a rainfall total that rounds to zero, renders NOTHING.
  Printing "about normal" daily teaches guests to stop reading the section.
- **The label must match the statistic.** "Normal for this week" requires 3+
  distinct years in the daily-values record; otherwise the fallback is a
  trailing 30-day mean and must say "the last 30 days", never "normal".
  Rainfall is calendar-day sums and is labelled as such, not "last 48 hours".
- **Staleness guards are load-bearing.** USGS keeps publishing dead sensors
  (02238000's flow has been offline since 2026-03-03). Instantaneous readings
  older than 6h are dropped; clarity over 45 days is relabelled "most recent
  known reading" and over a year is dropped.
- **Auto-hide:** the module emits nothing unless it has static content or a
  live layer that could return something; live-only renders a hidden shell
  the JS reveals only on real readings. An empty section is worse than none.
- **Almanac rows carry a `section`: `conditions` or `about`.** Only
  `conditions` rows count toward the render decision. Surface area and
  similar reference facts are `about`: a heading promising fishing conditions
  must never appear on the strength of an acreage figure.
- **The live layer never states a number this codebase chose.** Value, source
  and measurement time all arrive together from the API. Show the
  **measurement** time, never the fetch time.
- **Cache safety, same doctrine as the month logic:** fetch server-side into
  a transient, expose via the `dcc-wildlife/v1/conditions` REST route, let
  the browser fill the shell. PHP must never render a live reading into
  SpeedyCache-served HTML.
- **Never surface an upstream failure to guests** — no spinner, no error. A
  failed fetch is an absent strip; the almanac stands alone. A failure marker
  backs off so a broken upstream is not hammered.
- **Anecdote is never ingested.** Fishing-report blogs, charter sites and app
  check-ins are link-only, by policy — copyright *and* because one angler's
  Tuesday is not a fact about a guest's Saturday.
- **Admin is ONE page**, registered on `admin_menu` at priority 63 (after the
  mu-plugins that build the `dcc` top-level menu), with a fallback to
  Settings if that parent is absent. It claims the `dcc-wildlife` slug only
  when free (`slug_taken()`), falling back to `dcc-wildlife-water` while the
  mu-plugin `dcc-wildlife-countdown.php` still owns `dcc-wildlife` — taking
  an owned slug would make one of the two pages vanish.
- **The season countdown is native since 1.8.0, with a stand-down guard.**
  While `dcc-wildlife-countdown.php` exists (`function_exists(
  'dcc_wl_countdown_html')`), that file wraps `[dcc_wildlife]` and renders
  the line itself — Render emits no shell, `DCC_WL_CFG.countdown` is false,
  and the `[dcc_wildlife_countdown]` tag is left to the mu-plugin. Once the
  owner deletes the file, this plugin renders it end-to-end: same option
  (`dcc_wl_countdown_enabled`, default 1), same markup/styling, day count
  computed by widget.js in America/New_York (a season is a fact about
  Florida), never baked into cached HTML. Handover step for the owner:
  verify live, THEN delete
  `wp-content/mu-plugins/dcc-wildlife-countdown.php`.
- **Countdown entry points (1.8.1): three, one renderer, ONE shell per
  page.** (a) the `dccwl_month` widget's "Show season countdown" toggle
  (default mirrors the sitewide option; widgets saved pre-1.8.1 behave as
  1.8.0, i.e. append); (b) the standalone `dccwl_countdown` Elementor
  widget; (c) the legacy `[dcc_wildlife_countdown]` shortcode.
  `Render::countdown_shell()` has a static first-caller-wins guard so any
  combination yields exactly one line and the JS ships once via
  wp_enqueue_script. The sitewide `dcc_wl_countdown_enabled` switch
  overrides all three. The live site builds pages from the Elementor
  widgets, not shortcodes — that is WHY the widgets exist; do not retire
  them back to shortcode-only delivery.
- **Settings-merge armour (1.8.0).** `Water_Data::all()` merges stored
  settings over defaults with `wp_parse_args`, which is KEY-level: an
  array-typed setting a site already stored (chain_waters, almanac, links)
  completely shadows its default forever — re-saving does not heal it,
  because the form round-trips the stored rows. This silently discarded the
  1.7.1 seeded chain coordinates on any site that saved settings under
  1.7.0. So: any change to seeded values inside an array-typed default MUST
  ship with a step in `Water_Data::upgrade()`, which `Plugin::maybe_upgrade()`
  runs once per version change (stored version in `dcc_wl_version`).
  `chain_waters()` also backfills empty coordinates from `default_chain()`
  at read time as belt-and-braces — owner-typed values always win.
- **Uninstall is opt-in** (`uninstall.php`, 1.8.0): transients always
  removed; options and old sighting posts only when the owner checked
  "Delete all plugin data" (default off — this site reinstalls zips
  routinely). `dcc_wl_countdown_enabled` is never deleted while the
  mu-plugin file still exists.
- **USGS API gotcha:** `stateCd` and `countyCd` together return HTTP 400.
  Only one major filter is allowed; discovery uses a bounding box.
- **The Water Atlas clarity path is configurable, not hardcoded.** Only the
  API root and category name were ever confirmed, so the endpoint is a
  `{wbid}` template with a shape-tolerant parser and an admin Test button
  that probes the live API. Do not hardcode a guessed path.
- `WATER-SOURCES.md` is the audit trail — every fact that can reach the page,
  what was deliberately omitted, and the owner questions. Keep it in step
  with the code.

## Front-end conventions

- Assets are **registered** on `wp_enqueue_scripts` and **enqueued only at
  render time**, so they load only on pages using the widget/shortcode.
- Older clientele: base font 1.0625rem, tap targets ≥ 44px, generous
  spacing, no flashy motion. Inherit the theme's body font — never load
  fonts.
- **Bravada specificity gotcha:** the theme's Elementor kit resets
  inputs/buttons at `(0,3,1)`. Every button rule doubles its classes
  (`.dccwl-root.dccwl-root .dccwl-chip.dccwl-chip` = `(0,4,0)`) to win
  without `!important`. Keep this pattern for any new interactive element.
- With JS disabled only the server-rendered guide chips show (inert), plus
  a noscript note — nothing broken.

## Common commands

```bash
# Syntax-check every PHP file
find dcc-wildlife -name '*.php' -print0 | xargs -0 -n1 php -l

# Build the installable zip (upload via WP Admin → Plugins → Add New → Upload).
# NAMING CONVENTION (owner's request): "Wildlife <version>.zip", e.g.
# "Wildlife 1.5.0.zip". The version is read from the plugin header rather
# than typed, so the filename can never drift from what is inside the zip.
#
# DEV FILES ARE NOT DISTRIBUTED: every *.md in this folder (CLAUDE.md,
# WATER-SOURCES.md) and the whole tools/ directory are developer-only. They
# stay in git; they do not ship. The other DCC plugins already exclude their
# docs and this one was the last still shipping them (*.md dropped in 1.16.1,
# tools/ in 1.16.2). readme.txt is NOT excluded — WordPress reads it for the
# plugin listing, so keep it .txt and keep it in the zip.
#
# PHOTOGRAPHS (1.30.0): assets/photos/ is EXCLUDED from the zip and KEPT in
# the repository. The repo is the provenance record — 153 files, every one
# checked by eye against the species, with its credit in PHOTO_SOURCES. The
# zip carries none of them: the plugin went from 12MB to about 1MB, and the
# owner uploads it from a phone.
#
# A FRESH INSTALL GETS THEM FROM THE PHOTO PACK, built by the second command
# below and dropped into wp-content/uploads/dcc-wildlife-photos/ once, then
# imported from Wildlife admin or `wp dcc-wildlife import-photos`. Build the
# pack whenever the photographs change and keep it beside the plugin zip;
# a plugin zip on its own can no longer rebuild a site's tiles.
(
  cd "$(git rev-parse --show-toplevel)" &&
  V=$(sed -n 's/^ \* Version: *//p' dcc-wildlife/dcc-wildlife.php | head -1 | tr -d '[:space:]') &&
  zip -r "Wildlife $V.zip" dcc-wildlife -x '*.DS_Store' '*.md' 'dcc-wildlife/tools/*' 'dcc-wildlife/assets/photos/*'
)

# The photo pack — the files themselves, flat, named exactly as the importer
# looks for them. Not a plugin; it is unzipped into the uploads drop folder.
(
  cd "$(git rev-parse --show-toplevel)/dcc-wildlife/assets/photos" &&
  V=$(sed -n 's/^ \* Version: *//p' ../../dcc-wildlife.php | head -1 | tr -d '[:space:]') &&
  zip -q "$(git rev-parse --show-toplevel)/Wildlife - Photo Pack $V.zip" *.jpg
)

# Verify the build before handing it over: no dev files, readme.txt present,
# and (1.17.0) the bundled Leaflet actually in the archive — the map's default
# URLs point at it, so a zip without it ships a broken map.
unzip -l "Wildlife $V.zip" | grep -E '\.md$'  && echo 'FAIL: a dev doc shipped'
unzip -l "Wildlife $V.zip" | grep -E 'tools/' && echo 'FAIL: dev tools shipped'
unzip -l "Wildlife $V.zip" | grep -q 'dcc-wildlife/readme.txt' || echo 'FAIL: readme.txt missing'
for f in leaflet.js leaflet.css; do
  unzip -l "Wildlife $V.zip" | grep -q "dcc-wildlife/assets/vendor/leaflet/$f" || echo "FAIL: vendor/leaflet/$f missing"
done
```

Deliver that file to the owner for the Plugins → Add New → Upload route.

**Naming of anything handed to the owner** (his rule, corrected 2026-09-13):

- **The plugin zip keeps its long-standing name: `Wildlife <version>.zip`.**
  No prefix, no dash. He installs these by hand and the old shape is the one
  he recognises.
- **Every OTHER delivered file is copied to `Wildlife - <Title>.<ext>` before
  sending** — images, markdown, JS, anything. Repo filenames themselves do not
  change; a checked-in doc keeps its repo-conventional name and only the
  outgoing copy is renamed.
`Wildlife *.zip` is gitignored, so build artifacts never get committed.

Note: a few code comments point at CLAUDE.md / WATER-SOURCES.md for context
(render-budget notes in widget.css, provenance notes in class-species.php and
class-water-data.php). Those are signposts for anyone reading the source in
git, where the files do exist; nothing loads a .md at runtime, so excluding
them cannot change behaviour.

## Manual smoke-test checklist (staging)

- Widget renders with defaults; `[dcc_wildlife]` renders identically; the
  widget appears under "Dora Canal Court" in the Elementor panel (and no
  "Claude Code" category is created by this plugin).
- Default render ≤ 600px desktop / ≤ 720px at 375px width; zero horizontal
  overflow at 375px.
- View source: no month-specific markup server-side; change the OS clock →
  headline/spotlight change; arrows + all 12 mini buttons work; the
  "N species at their peak" count matches the calendar table.
- Tile → sheet opens by mouse, touch and keyboard; Escape, the back button,
  an outside tap and the browser back button all close it; focus is trapped
  while open and returns to the tile; reduced-motion OS setting → no
  animation anywhere but the sheet still opens.
- Side by side with /guest/: same blue (#0f6dbf) and coral (#f08080), same
  near-white glass tiles, same cozy spacing, same springy 300ms drawer.
- Toggle the OS to dark: NOTHING changes — both widgets render exactly as
  they do in light mode, like /guest/ does.
- The chain map opens as a full sheet; Leaflet, tiles, ramps, popups and the
  colour-by legend all work; reopening does not refetch.
- Sprites render identically on Apple/Android/Windows (no emoji anywhere in
  species art); the five field-mark litmus tests hold: eagle's white
  head+tail, egret's yellow feet, anhinga's spread wings, gator's waterline
  pose, heron's crown plume.
- No Sightings menu in wp-admin and no Settings → DCC Wildlife page.
- Tap targets ≥ 40px throughout; no console errors; assets absent on pages
  without the widget/shortcode.
- Water module: with the live layer OFF, confirm zero network calls and that
  the almanac/dock/links still render. With it ON but sources unreachable,
  confirm the almanac still renders and no error or spinner reaches guests.
- Admin: exactly ONE settings page. With the mu-plugin still installed it is
  DCC → Water (plus the mu-plugin's DCC → Wildlife); after deleting the
  mu-plugin it moves to DCC → Wildlife and both old pages are gone.
- Countdown (1.8.0/1.8.1): with the toggle on and the mu-plugin DELETED, the
  "…season starts in N days" line renders below the widget, identical to the
  mu-plugin's line; with the mu-plugin still present, exactly ONE line
  renders (the mu-plugin's). The standalone "DCC Wildlife — Season
  Countdown" widget renders the line on its own; the month widget's "Show
  season countdown" toggle adds/removes the append; BOTH on one page yield
  exactly ONE shell and one copy of the JS; `[dcc_wildlife_countdown]`
  still works; the sitewide toggle off renders nothing by any path; the
  Elementor editor never fatals and an empty countdown widget explains why.
- Field guide shows the single attribution line ("local knowledge from your
  hosts"); map popups show no English when a translation is loaded; each map
  colour-by mode shows its legend row and grey is explained.

## "Tonight on the Canal" — the moon & sun (v1.12.0)

A card at the top of the water module, filled entirely client-side by
`assets/js/water.js` (`initMoon`). It is **pure astronomy with ZERO network
calls** — it does not touch the live layer's REST route or any API:

- **Moon phase** — Meeus' phase-angle formula (`computeMoon`): illumination good
  to ~0.1%, phase name, and nights-to/-since full. Verified against the real
  Aug–Sep 2026 sky. The disk is drawn geometrically (`moonDisk`, createElementNS,
  no innerHTML, no gradient/clipPath ids — the same collision rule as the scene
  medallions). Lit region is a two-arc path; the sweep flags are load-bearing.
- **Golden hour** — the standard sunrise equation (`sunTimes`) for the property's
  own lat/lon (shipped as `DCC_WL_WATER.coords`), rendered in canal time. Dawn
  and dusk are the canal's most active wildlife hours; the west-longitude sign in
  the solar-noon term is load-bearing (get it wrong and sunrise/sunset swap).
- **Cache doctrine, unchanged** — a phase/suntime is time-sensitive, so PHP emits
  only an empty `[data-dccwl-moon]` shell and the JS fills it at load time. Every
  string comes from `DCC_WL_WATER.i18n.moon` and is inserted with textContent.
- On an actual full-moon night the card gets `.dccwl-moon-full` (a soft warm halo,
  no motion). The line ties tonight's sky to the FWC full-moon fishing facts.

**Scene medallions redrawn (v1.12.0).** The three shared SCENES in `widget.js`
(critters/birds/plants) were redrawn into lusher Florida-canal vignettes — the
seven photo-less species render on these as deliberate naturalist plates. Still
flat, still no gradient/clipPath ids, still a light-enough centre so the deep-teal
sprites read.

**Mobile photo hero.** `.dccwl-sheet .dccwl-medallion.dccwl-medallion-photo` is
DOUBLE-classed on purpose — it must out-rank the base medallion's own mobile
height rule (same specificity, later in source) or the photo shrinks to 140px.

## "The canal year" — the month picker as a planning view (v1.13.0)

L2a is no longer twelve numbers. Each month tile also renders the species that
actually peak in it (`window.DCCWL_Widget.peakFor(m)`, capped at 3, `.dccwl-month-art`
/ `.dccwl-month-sprite`), so the year reads as a rhythm and a guest can pick when to
visit. The art is `aria-hidden` — the "N at peak" count above it carries the meaning.

Above the grid, `fillYearNote()` computes the fullest month(s) from the same bundled
calendar and prints one line ("April and May are the canal's fullest months — 10
species at their peak"). Rules that keep it honest:

- **Computed client-side, never server-rendered.** Same doctrine as the spotlight and
  the countdown: a cached page must not be able to name a stale month.
- **It stays silent** when there are no peaks at all, or when more than three months
  tie — "fullest" would then mean nothing. Silence beats noise, as everywhere else here.
- `.dccwl-year-note:empty { display: none }` so the unfilled shell costs no space.
- `.dccwl-month-sprite` repeats the LOAD-BEARING `fill:none; stroke-linecap:round` pair
  — the symbol sheet strips them on output and they inherit into the `<use>` shadow
  content. Drop them and every month tile fills solid black.

## "Right now on the canal" — the living line (v1.14.0)

One line under the heritage hero on L1, filled by `fillNowLine()` in canal.js.

- **The maths lives in ONE place.** water.js owns the astronomy and exposes
  `window.DCCWL_Sky = { moon, phase, sun, time }`. canal.js reads the sun through
  that handle rather than carrying a second copy. Consequence worth knowing: the
  sky only exists where the water module runs, so with water off the hub line
  simply stays empty (`.dccwl-now-line:empty { display:none }`) — it must NEVER
  fall back to a guessed hour.
- **Phase from the real sun**, in canal minutes (`canalMinutes()`, America/New_York,
  same rule as `canalMonth()`): night / first light / morning / midday / afternoon /
  golden / dusk, bracketed off actual sunrise & sunset rather than fixed clock hours.
- **The species are derived, not authored.** Candidates are this month's species at
  value >= 2 (the spotlight threshold, so the after-dark line still has something to
  say in a month when the limpkin is merely likely), sorted peaks-first, then matched
  on keywords against the species' own `best` string (NOW_KEYS). Change a `best`
  value and this line follows automatically — that is the point. Cap 2 names.
- Never server-rendered. Same cache doctrine as the spotlight, countdown and moon.

### Hub order (changed in 1.14.0)

L1 now reads, top to bottom: **heritage hero → "right now" line → countdown hero →
tiles**. The countdown used to be emitted before the stage (it led the hub); that
buried the canal's name and its quote under a species banner once the heritage hero
and the living line existed. It is now echoed inside the hub panel after the now-line.

Two consequences to keep:
- `canal.css` styles it with a DESCENDANT rule (`.dccwl-canal .dccwl-hero-stat`), not
  the old direct-child one — moving it back out without fixing that selector silently
  drops its centring and top border.
- The 1.8.1 first-caller-wins guard in `Render::countdown_shell()` is untouched, so it
  is still exactly ONE shell per page however the widgets are combined. Verified.
- Measured after the change: hub is 696px at 375px wide — inside the ≤760px mobile
  budget, with no horizontal overflow.

## "Listen for" — the sound layer (v1.14.0)

An optional `sound` string per species in `class-species.php`, threaded through
`dataset()` and rendered by `buildDetail()` between "Where to look" and "Best time".

- **Only 12 of 24 carry one**, and that asymmetry is the point: a species gets a sound
  line ONLY where a distinctive, guest-recognisable voice could be verified (Cornell Lab,
  FWC, NPS, UF/IFAS). The other twelve render nothing — an absent `sound` is normal, not
  a gap to fill with something evocative-but-unsourced. Do not "complete the set."
- Currently: alligator, river otter, bald eagle, osprey, anhinga, great blue heron,
  belted kingfisher, limpkin, white ibis, wood stork, tricolored heron, green heron.
- **Deliberately WITHOUT a sound**, on advice: snowy egret (effectively silent away from
  a breeding colony) and little blue heron (usually silent; its interest is visual). Also
  every plant, both fish and reptiles, and the apple snail — the turtle "plop" off a log
  and a bass's surface strike are splashes, not species sounds, and no authority
  characterises them. Do not add them.
- **Three sourcing rules learned the hard way here:**
  1. The limpkin-in-the-movies fact is the HIPPOGRIFF in *Harry Potter and the Prisoner
     of Azkaban*, documented by Cornell's own newsroom. The widely-repeated "used as a
     jungle sound in Tarzan" version is NOT traceable to any primary source — do not
     reinstate it.
  2. For the wood stork print the BEHAVIOUR (voiceless, hisses, bill-clatters, noisy
     nestlings — FWC + Cornell) and NOT the anatomy ("lacks a functional syrinx"), which
     traces only to Britannica and a paywalled account.
  3. For the alligator print the OBSERVATION (water sprays off a bellowing male's back)
     and not the fluid-dynamics mechanism, which is secondary reporting.
- Two are deliberate myth-correctors and should not be softened: the movie eagle scream
  is a dubbed red-tailed hawk, and adult wood storks are voiceless (they bill-clatter).
- The gator's and otter's `fact` strings were trimmed when this landed so the sheet does
  not say the same thing twice — if you re-add sound lines elsewhere, check the fact first.

## "Easily confused with" — the ID helper (v1.15.0)

Two optional fields per species in `class-species.php`: `idgroup` (a look-alike set)
and `mark` (the ONE field mark that settles this species). Rendered by `buildDetail()`
after "Listen for": the species' own mark as a lead line, then every other member of
its group with theirs, each behind its sprite.

- Groups today: `white` (snowy egret, white ibis, wood stork, little blue heron —
  juveniles are white, which is the whole confusion), `dark` (great blue heron,
  tricolored, green heron, anhinga), `raptor` (bald eagle, osprey).
- **Marks are verified field marks, not vibes** (Cornell Lab / All About Birds). The
  tricolored's white belly, the osprey's M-kinked wings and eye-stripe, the snowy's
  golden feet, the little blue juvenile's black-tipped pale bill — all sourced.
- **The rows are deliberately NOT tappable.** Opening another species from inside an
  open sheet would push a second sheet history entry and break the carefully-ordered
  back/Escape contract in sheet.js. Informational rows keep that contract intact; do
  not "improve" them into navigation without solving the history problem first.
- A species with no `idgroup` renders nothing. Fourteen of the twenty-four have none,
  and that is correct — only add a group where guests genuinely confuse two species.

## Accessibility rules learned in the 1.15.1 audit

- **`--dccwl-text-faint` is DECORATION ONLY.** Measured 2.7:1 on this plugin's white
  card surfaces — fails WCAG AA at every size used here. Any text a guest is meant to
  read uses `--dccwl-text-muted` (4.6:1). It currently survives on exactly one glyph,
  the `·` separator in `.dccwl-card-dot`. Do not reintroduce it for text.
- **`--dccwl-text-muted` PASSES (4.6:1) — on white.** Measure against the surface the
  text actually sits on, not a mock background: an early pass in this audit "found" a
  systemic failure that was really an artefact of a grey preview ground the live site
  does not use. Verify on doracanalcourt.com, not a local harness.
- **An `aria-label` on a button REPLACES its text for screen readers.** The month tiles
  had `aria-label="Wildlife in January"`, which silently hid the visible "7 at peak".
  If a control has meaningful text inside it, either omit the label or include that
  text in it.
- **Two adjacent block spans still concatenate for a screen reader.** The look-alike
  name and mark read as "White Ibisa long, down-curved…" until a `.dccwl-sr` separator
  was added between them. Visual line breaks are not textual separators.
- **Do not test focus rings with `element.focus()`.** This plugin styles `:focus-visible`,
  which deliberately does not match programmatic focus — a scripted audit will report
  every control as unfocused. Check the CSS for the rules instead (all eleven controls
  are covered).
- **Payload, measured 2026-09-02:** app/widget/canal/water CSS ≈ 22 KB gz, sheet/widget/
  canal/water JS ≈ 29 KB gz, sprite sheet ≈ 18 KB raw inline. Photos are lazy and only
  on species open. That is fine — do not "optimise" it without a new measurement.

## Crawlable content & structured data (v1.16.0)

**The problem this solved.** Everything worth reading in this guide — scientific
names, facts, calls, field marks — shipped only inside `window.DCC_WL_CFG`, i.e.
inside a `<script>` tag. Measured on the live page: species *names* were readable
as page text, but `Ardea herodias` occurred once in the HTML and **zero times**
in the text a crawler reads. The rendering was excellent and invisible.

**The fix, and its rules.**

- `Render::render_guide_text()` renders every species as server-side prose in a
  native `<details>`. **This must stay genuinely user-openable.** It is not an
  SEO trick: it needs no JS, any visitor can open it, and it is the same text
  the sheet shows. It is also the no-JS and one-bar-of-signal fallback. If you
  ever find yourself hiding it with CSS or `hidden`, stop — that turns a legit
  accordion into hidden text, which is a guidelines violation.
- **The hub must render the prose at its OWN top level, never inside a panel.**
  The hub's field guide sits inside `.dccwl-panel-species`, which is `hidden`
  (`display:none`) until a visitor taps three levels in. Prose rendered there is
  content a crawler meets hidden and discounts — the exact failure this feature
  exists to fix. So `Canal_Render` calls `Render::render()` with
  `guide_prose => false` and emits `Render::guide_prose_for_canal()` itself,
  after `.dccwl-stage` closes, in normal flow. This mirrors what the hub already
  does with the countdown. **Do not "simplify" by moving the prose back into the
  panel** — it re-hides it. The `$fullguide_printed` guard keeps it once-per-page
  whichever entry point fires first. (The standalone `[dcc_wildlife]` widget's
  guide section is visible, so its own `guide_prose => true` default is correct
  there — only the hub relocates.) Verify with: render `[dcc_canal]` server-side,
  find `dccwl-fullguide`, and confirm its offset is AFTER the last `</section>`.
- **Only month-independent fields may appear there.** `bestLabel` is a static
  range ("Nov–Mar"); `best` is a time of day. Nothing that knows what month or
  hour it is may be server-rendered — the cache doctrine at the top of this file
  is unchanged and this section is not an exception to it.
- `Render::render_species_jsonld()` emits one `ItemList` of `Taxon` nodes.
  `sameAs` points at the Wikipedia article **and** the Wikidata item from
  `Species::entities()`. Two hardening rules baked in and easy to undo by
  accident: (1) the block is encoded **without** `JSON_UNESCAPED_SLASHES` — the
  escaped `https:\/\/` is what stops a future `</script>` in a filtered species
  name from breaking out of the tag; don't add that flag back "for readability".
  (2) It carries **no `taxonRank`**: our set mixes ranks (species, the manatee
  and water-snake subspecies, and "Turtles" = two genera), so a blanket
  `'species'` was wrong for several — an unverifiable rank is worse than none,
  same rule as the water Fact gate. Only add `taxonRank` per-species if you have
  each one's real rank.

**How `Species::entities()` was built, and how to extend it.** Every row was
resolved by querying the MediaWiki API with the scientific name from
`registry()`, following redirects, and confirming the resulting article really
is that taxon. Do the same for any species you add. Two standing decisions:

- `manatee` links the **species** article — our subspecies has no standalone
  page and "Florida manatee" redirects there. A correct broader entity beats a
  wrong precise one.
- `turtle` has **no** entity on purpose. It covers *Pseudemys* spp. *and*
  *Apalone ferox*; no single entity is true. Same gate as the water module's
  `Water_Fact`: no verified source, no claim. Never fill this in to make the
  map look complete.

**Honest scope, so nobody oversells it later.** Google publishes no rich result
for a species: this earns no snippet and no carousel. The win is that a machine
can tell our "Limpkin" is *Aramus guarauna* — entity clarity for search and AI
retrieval. The JSON-LD deliberately carries **no** `description`; the prose above
already holds the facts, and repeating them would inflate every cached page for
nothing. It is emitted separately from AIOSEO's graph (WebPage / Organization /
LocalBusiness) and must neither touch nor duplicate it.

**Both blocks are once-per-page, first-caller-wins**, like the countdown shell —
a page carrying the hub *and* a standalone `[dcc_wildlife]` prints one prose
guide and one JSON-LD block. Total cost to the cached page: ~6.6 KB gzipped, no
new requests.

**Verifying it.** Staging is login-gated, so fetching the staging URL returns the
login page, not the guide — render the shortcode server-side instead:

```bash
ssh dcc 'cd ~/public_html/staging && wp eval "echo do_shortcode( \"[dcc_canal]\" );"'
```

Then strip `<script>` blocks before asserting anything is "on the page": text
inside a script tag is not content. That distinction is the entire bug this
section exists to prevent.

## Contrast tokens — the coral rule (v1.16.1) and the amber rule (v1.16.2)

The 1.15.1 audit measured the greys and missed the coral. **`--dccwl-accent`
(`#f08080`) is 2.59:1 against white in both directions** — it fails AA as text
on white, as white text on it, and even the 3:1 large-text bar. No lightness of
hue 0 passes AA while still reading as coral. Therefore:

- **`--dccwl-accent` is fill and border only.** Never `color: var(--dccwl-accent)`.
  `grep -rn "color: *var(--dccwl-accent)" assets/css/` must return nothing.
- **`--dccwl-accent-text` (`#bf4040`)** is for coral text under 24px (or under
  18.66px bold). Chosen because it passes on *every* surface it is used on —
  white 5.22, card 5.18, **coral wash 4.54** — where `#cc3333` misses the wash
  at 4.47. The peak badge sits on that wash, so the wash is the binding case.
- **`--dccwl-accent-display` (`#eb5656`)** is for ONE thing: `.dccwl-hero-num`,
  28–40px at weight 800, which WCAG treats as large text (3:1). 3.50 white /
  3.04 wash. Do not use it under 24px; do not use it for anything else.
- The `.dccwl-month-now` badge keeps its coral **fill** and uses `--dccwl-text`
  ink (7.29:1). Don't put white back on it "because badges are white".
- **`--dccwl-text-muted` is `#546d85`, not the Guide's `#5d7891`.** The Guide's
  value is 4.60 on plain white and under AA on every tinted surface here (blue
  tile 4.11, coral wash 4.00, page-bg 4.28). `#546d85` passes on all four
  (5.38 / 4.81 / 4.68 / 5.00). If someone re-syncs the palette from /guest/,
  keep this override.

### The amber rule (v1.16.2)

The 1.16.1 pass fixed the coral but did not re-check the amber, which had never
been measured. Same shape of problem, same shape of fix:

- **`--dccwl-warn` (`#b07d3a`) is fill and border only.** As text it is 3.60:1
  on white and 3.21:1 on the blue tile. Its one legitimate use is the
  `border-left` on `.dccwl-water-tier-general`.
- **`--dccwl-warn-text` (`#8e652f`)** — same hue, darker — carries the single
  amber text use, the water panel's "GENERAL GUIDANCE" head at 0.78rem bold
  (small text, so the 4.5 bar applies). 5.18 white / 5.14 card / 4.63 blue
  tile / 4.82 page-bg / 4.51 coral wash: it passes on every surface.

**Both invariants, together — neither hue may ever be a text colour:**

```bash
# Must both return nothing. Strip comments first: the doc lines above quote
# these very patterns, and a naive grep matches its own documentation.
for t in accent warn; do
  for f in assets/css/*.css; do
    perl -0pe 's{/\*.*?\*/}{}gs' "$f" |
      grep -nE "(^|[;{[:space:]])color[[:space:]]*:[[:space:]]*var\(--dccwl-$t\)" |
      sed "s|^|$f:$t: |"
  done
done
```

**Measure text on the surface it actually sits on, not on white.** The
tinted-tile and wash failures were invisible to a white-background check. The
surfaces in play: card `#fefeff`, current-month tile `#ecf3fa` (primary-soft
over white), coral wash `#fdebeb` (accent-soft over white), page-bg `#f4f7fa`.

With the amber closed, **every text token in the plugin has been measured on
every surface it can sit on.** Any new text colour must be measured the same
way before it ships.

## Data doctrine — a species' best window IS its peak (v1.17.0)

Everything peak-driven keys on likelihood **3**: the sheet badge
(`widget.js` `>= 3`), the "N at peak" counts, `peakFor()`, the countdown
(`nextRise` looks for a rise *to* 3) and the "fullest months" line. Through
1.16.2 seven species topped out at 2, so their sheets said "Best: Jul–Aug"
while nothing in the UI ever featured them. **Every species now has at least
one month at 3, and its `bestLabel` spans exactly its run(s) of 3s.** The
integrity check in the harness (`test-species.php`) enforces both. Year-round
residents at 3 all twelve months (great blue heron, anhinga, little blue
heron, Spanish moss) are deliberately skipped by the countdown — a resident
is not a season.

## Countdown continuity (v1.17.0)

The hero shows the season that is ON — the most recent riser still at peak —
for its whole run ("Osprey season · through April"), with the next rise
underneath ("Next up: Snowy Egret season, 59 days away"). Only when nothing is
mid-run does it fall back to a bare count-down. `peakRun()` finds the current
run; `nextRise()` the next. Both are in canal time and computed client-side,
never baked into cached HTML.

## Leaflet is self-hosted (v1.17.0)

`assets/vendor/leaflet/` carries Leaflet 1.9.4 (`leaflet.js`, `leaflet.css`;
no marker PNGs — the map draws `circleMarker`s only). The defaults in
`Water_Data::defaults()` point there, and `Water_Data::all()` drops a saved
`https://unpkg.com/leaflet@…` value so a settings form saved under 1.16.x
migrates without a re-save. `map_asset()` accepts `http://` only so a local
dev site can load the bundled copy. The tile layers are the map's only
external requests, and only after a guest opens it. Do not point the defaults
back at a CDN.

## The hierarchy rule (v1.18.0)

The owner's review of 1.17.0, from his phone: navigation was indistinguishable
from content — month pills, category pills and species tiles were all white
rounded boxes at the same weight. The rule now:

- **Tiles are the only cards.** White ground, hairline, shadow. Nothing else
  may use that treatment.
- **Controls sit on a tinted ground** (`--dccwl-primary-soft` over white): the
  level bar, the month strip's band, the segmented category switch. Selected
  state is solid `--dccwl-btn-bg` with `--dccwl-btn-txt` (5.30:1). Measured
  on that ground: primary text 4.74:1, muted 4.81:1 — both AA.
- **Depth is visible.** Every panel below the hub opens with
  `Canal_Render::level_bar()` — Back + breadcrumb, sticky at
  `--dccwl-sticky-offset` (0 by default; the theme may set it to its sticky
  header's height). The species crumb's month segment is filled by canal.js
  (`data-dccwl-crumb="month"`), never server-side.
- **Every colour that means something has a key next to where it is used**
  (`.dccwl-legend`, `.dccwl-like-key`). A colour that cannot earn a key entry
  must not carry meaning.
- **One grid on the month screen.** `Render::render()` takes `spotlight`
  (default true; the hub passes false) and `annotateGuide()` hides tiles with
  likelihood < 2 for the chosen month inside the hub only. The standalone
  widget is unchanged.
- **The hub is: countdown + two doors.** The heritage hero and the "right now"
  line were removed at the owner's request (1.18.0); the hub's `<h2>` is
  visually hidden but present, so the panel keeps its heading.
- **The prose guide is still a native `<details>` in the HTML.** Restyle its
  summary and body freely; never JS-gate, lazy-load or fetch it.

## Small rules added in 1.17.0

- **Keep-limits carry `regs_verified`** (`Water_Data::defaults()`), rendered
  as "Limits as verified with FWC in August 2026". Update the date whenever
  the limits are re-checked; it is a fixed setting, so it is cache-safe.
- **Photos ship a `-600.jpg` variant** beside each original; `srcset` uses
  `Species::PHOTO_W` for the full-size descriptor. Regenerate the variant
  (GD, quality 80, 600px wide) whenever an original is replaced, and update
  `PHOTO_W`.
- **Safe area:** `.dccwl-sheet-body` pads its bottom with
  `env(safe-area-inset-bottom)`. The sheet pins to `bottom: 0`.
- **The prose guide's `<summary>` holds an H2** so the guide owns a section
  in the outline; `.dccwl-fullguide-h` resets it to look like the summary.
- **The hub emits its own `<noscript>`** — `Render`'s lives inside a panel
  the hub keeps hidden.
- **The standalone widget seeds its month with `canalToday()`**, like the hub.

## 1.18.1 — what the phone review of 1.18.0 taught (keep these)

- **The site's Elementor kit styles every `<button>`** (capitalize + letter-spacing).
  Tiles, doors and month cells are buttons. `font: inherit` undoes neither
  property, so `app.css` resets both at `.dccwl-app.dccwl-app button` (0,2,1).
  Never put deliberate caps on a button; use a span or paragraph.
- **Grids on phones use `minmax(0, 1fr)`**, never bare `1fr` (its floor is the
  content's min-width, which is how "September" pushed the month grid off
  screen). `review118.js` checks page and grid width at 393 and 320.
- **The level bar finds the sticky header itself** (`canal.js`, `coveringHeight`):
  it probes the top edge of the viewport, walks down through stacked fixed or
  sticky bars, and writes `--dccwl-sticky-offset` inline on the root. It only
  runs while the token is 0 — a theme that sets the token keeps its value.
- **Mutation tests restore from a copy, never with `git checkout -- <file>`.**
  That command reverts the file to the last COMMIT, and on 6 Sep it silently
  discarded the uncommitted 1.18.0 widget.js seconds before the commit. Use
  `cp file file.bak` … `mv file.bak file`, and re-run the whole harness AFTER
  the restore and BEFORE the commit — never trust a run that preceded it.
- **Atlas data-set codes** (`SJRWMD_HYDRO`) are reduced to their agency by
  `Water_Live::humanize_dataset()`; readable names pass through.

## Phase 2 (169 species) — batch 1 shipped in 1.19.0; the rules it set

- **Data model** (`Species::registry()` rows): `group` (four for now; `safety` =
  "Know before you go" and it is FIRST everywhere groups are listed), `flags`
  (`danger` / `invasive` / `protected` / `nuisance` — exactly the set
  `Species::flags()` names, because the legend must explain every mark),
  `odds` (`Species::odds()` keys), `place` (empty until day-trip entries),
  `safe` (the plain what-to-do line — required on anything flagged danger or
  protected). `dataset()` emits all of them plus `thumb`.
- **The safety list is a warning list, not a spotting list.** It never drives
  the countdown, the "N at peak" counts, the spotlight strip or the month art
  (`isSpotting()` in widget.js, the `group === 'safety'` guard in canal.js),
  and its grid is never month-filtered. The alligator stays a critter and
  appears on the safety list through `Species::group_members()` (home group
  ∪ DANGER-flagged). Do not "simplify" that into a second group value.
- **Photo-first tiles.** The tile face is `Render::tile_media()` /
  `tileMedia()` in JS — keep them in step. Vetted photo → `<id>-320.jpg`
  (4:3, built by `tools/make-photo-variants.php`, which also rebuilds the
  `-600`); no photo → `Sprites::glyphs()[group]`, a neutral group glyph.
  Never an emoji, never a sprite of a possibly wrong animal. The photo rule
  in class-species.php (photo only when vetted) is unchanged.
- **Flag marks** are `Sprites::marks()` symbols on `--dccwl-flag-*` fills
  (white glyph, every fill ≥ 5.2:1). Fill-only tokens, like the accent.
- **Every non-public-domain image** is a row in `Species::photo_credits()` and
  renders in the "Photo credits" `<details>` after the prose guide.
- **Q-ids ship only as CONFIRMED.** New species get a row in
  `tools/entities-batch<N>.csv`; `tools/verify-wikidata.py` (needs network)
  marks each OK / PROPOSED / SYNONYM / MISMATCH. Only OK rows move into
  `Species::entities()`. Batch 1's twelve were confirmed on 2026-09-08.
- **`Species::entities()` is a LIST of verified sameAs URLs per species**, not
  a fixed [Wikipedia, Q-id] pair (1.19.1). A row carries a Wikipedia article
  only where the ARTICLE was checked too — a guessed slug is the same class of
  error as a guessed Q-id — and may carry two items where one tile honestly
  covers two taxa (mosquitoes/no-see-ums = Culicidae + Culicoides). Read it
  through `Species::entity_links()`, which also normalizes the pre-1.19.1 pair
  shape for anyone filtering `dcc_wl_entities`. Still no `taxonRank` anywhere:
  the set mixes species, subspecies, a genus and a family.
- **Seasonality** for new species is argued row by row in WATER-SOURCES.md
  ("Phase 2 — batch 1"); every row keeps a month at 3.
- **Look-alike sets (`idgroup` + `mark`) are re-cut whenever a batch adds a
  member.** A set answers one real question — *which of these am I looking
  at?* — so membership follows what a guest actually confuses, not taxonomy:
  `white` (the five confusable white waders), `ibis`, `dark` (the tall ones,
  incl. anhinga/cormorant and the crane-vs-heron problem), `night`, `swimmer`,
  `duck`, `raptor`, `snakes`. Every `mark` must read after "Tell this one by
  …", and a mark now renders in the sheet even when the species has no
  look-alikes.
- **Species order inside a group is field-guide order**, not the order they
  were added: the birds a guest must separate sit together.
- **The cap and the search (1.21.0) are what make more species safe to add.**
  One function, `refreshGuide()`, decides every tile's visibility, in this
  order: the open group (or, while searching, every group) → the month (hub
  only; the safety grid is never month-filtered) → the cap. Do not add a
  fourth filter elsewhere; put it in that pass.
  - The cap keeps the LIKELIEST twelve, not the first twelve. Hiding by
    document order buried the coot and the white pelican in January — the two
    birds January is actually about — behind twelve year-round residents.
    Ties keep document order, so what survives still reads in field-guide
    order.
  - Search covers name, scientific name and the field mark, over the bundled
    dataset: no request, nothing month-dependent, safe in cached HTML. It
    OVERRIDES the month filter — a guest looking for a species out of season
    must still find it — and it adds no text to the crawlable prose block.
  - Matching is substring, all-words-in-any-order, and punctuation-insensitive
    ("blackcrowned"). There is deliberately NO letters-in-order fallback: it
    made "coot" return the cottonmouth and the cormorant. A guest typing four
    letters of a bird and getting a pit viper has been failed by the search,
    however forgiving it was trying to be.
  - The field is 16px or iOS zooms the page on focus, and the row it sits in
    is a control on the tinted ground, not another card.
- **Sprites for sibling plugins are EXPORTS, never copies.**
  `tools/export-sprites.php` writes `assets/sprites/<id>.svg` straight from
  `Sprites::registry()`, and `test-sprites.php` fails if a file drifts from
  it — a stale export means another DCC surface ships the wrong animal and
  nobody notices. Add an id to the tool's EXPORT list and re-run; never
  hand-edit a file in `assets/sprites/`. The palette note beside them is
  checked against the colours the files actually use.
- **There is no month step (1.23.0).** The Wildlife door opens the species
  list for the canal's current month; the month is a CHIP in the level bar
  carrying the month AND its peak count, and the picker hangs off it. Two
  rules that are easy to break:
  - Choosing a month leaves the picker by the door it came in (`back()`), not
    by pushing a second species entry. Otherwise Back from the species list
    reopens the picker you just finished with.
  - `#canal-month=` / `?canal-month=` is READ on init and never written. The
    level navigation already owns history; a second writer fights the Back
    button. Read client-side only — the page is cached, so PHP must never see
    a month.
- **The tile deck (`assets/js/deck.js`) is one implementation for both the
  species tiles and the water cards.** It adds no tiles: the same `<li>`s,
  laid out in columns, scrolled natively. That is what makes it accessible
  for free — the accessibility tree, Tab order and focus-scrolling are the
  browser's, not ours. Three things must stay true, and each has a test:
  Previous/Next are real buttons (swipe is never the only way through), arrow
  keys move FOCUS rather than just the viewport, and `prefers-reduced-motion`
  makes it jump instead of glide. Its layout lives in `app.css` scoped to
  `.dccwl-deck.dccwl-deck` — NOT to `.dccwl-tiles`, or the water cards
  silently get none of it, and doubled because `.dccwl-tiles`/`.dccwl-cards`
  set their own columns later in the same file.
  A deck must also pack from the START: a centred grid that overflows spills
  out of both ends, and the water deck opened on its ninth card because of it.
- **The tile face has three tiers (1.23.0):** a vetted photo, else the
  species' own sprite where one exists, else the neutral group glyph. Since
  1.28.0 that is 51 / 0 / 0 species (52 / 0 / 0 tile faces — the alligator
  appears in both Animals and Safety): the photo programme is FINISHED and
  BOTH lower tiers render for nobody. DO NOT DELETE EITHER. A species added
  tomorrow arrives without artwork and still needs a face; test-1260.php
  asserts the four group glyphs remain defined and test-1280.php asserts the
  species sprites are still in the codebase, precisely so an empty tier is not
  mistaken for a dead one. Never invent artwork to
  fill the third tier. Those three counts are asserted in build-page.php,
  test-1230.php and test-batch1.php; a photo batch has to move all of them.
- **`hidden` must actually hide.** `.dccwl-app [hidden] { display: none
  !important; }` in app.css. The attribute's UA rule has specificity 0 and
  loses to any class of ours that sets `display` — which is how a hidden,
  empty "Show all" button occupied 44px on every render. Every JS-toggled
  affordance here uses the attribute.
- Batches 3–7 are listed in the Phase 2 brief; each ships alone, Rob reviews
  on /explore/ from the phone before the next. The three cut species
  (roseate spoonbill, snail kite, crested caracara) are never re-added.

## 1.31.0 — the harness is in the repo now, and what else this round settled

**THE TEST HARNESS LIVES IN `tools/tests/`. IT IS NOT OPTIONAL SCAFFOLDING.**
For several releases this file cited `test-species.php` and friends as though
they were checked in. They were not: every session rebuilt them in its
scratchpad, and when a container was reprovisioned the whole suite went with it,
so "68/68" was never reproducible by anyone but the session holding it. Run it:

```bash
bash tools/tests/run-all.sh            # everything; exit code IS the result
bash tools/tests/run-all.sh species    # only suites matching "species"
cd tools/tests && npm install          # once per container, for the ui-* suites
```

`tools/` is already excluded from the zip, so none of it ships. Read
`tools/tests/README.md` before trusting a green run — it names the two traps
that have produced false results here.

- **NEVER grep the output for `FAIL`.** A suite that crashes exits 255 and
  prints no FAIL line. The runner reads exit codes and nothing else, and that
  is why.
- **A suite that asserts nothing FAILS** (exit 2). So does an unclassified file
  in `tools/tests/`, which is how a suite that was never wired up gets noticed.
- **The browser suites SKIP with exit 77** when playwright-core or Chromium is
  missing. They must never pass by default: a green tick from a suite that never
  opened a browser is worse than no suite at all.
- **Measure, then assert.** Three assertions written from assumption were wrong
  and the harness is why we know: `best` on a registry row is PROSE (the twelve
  month scores are `months` on a DATASET row); `flags`, `safe`, `mark`, `sound`
  and `idgroup` are OPTIONAL (36 rows have no `flags`, so anything dereferencing
  one needs a guard); and the alligator is deliberately in TWO sections, so the
  sections hold 52 memberships over 51 species and `include_flagged = false`
  drops it from SAFETY, not from animals.
- **This sandbox has no Raleway, so text measures NARROWER here than on the
  site** — the standing trap, unchanged. Anything asserting that a row FITS must
  leave headroom or inflate the font to stand in for the real face. The tab-row
  suite does the latter: 125% covers Raleway's roughly 21% and is required; 150%
  is carried as a margin probe and is explicitly not a requirement.

**THE MAP MUST BE FITTED AFTER LAYOUT, NEVER INSIDE `build()`.** `sheet.js`
calls its build callback while the host is still `hidden` — deliberately, so the
transform transition runs — and a hidden element has no layout. Fitting bounds
to a 0x0 canvas does not fail, it succeeds nonsensically: Leaflet clamps to
maxZoom at an arbitrary centre and every marker lands off screen, which is
exactly what shipped. `fitView()` refuses a zero-sized canvas and
`fitWhenLaid()` waits for the first non-zero size via ResizeObserver, fits ONCE,
then stops observing — a later resize must not yank the view away from someone
who has panned. Test the RESULTING zoom and bounds; "fitBounds was called" was
true throughout the bug.

**THE MAP PAYLOAD IS CACHED WHOLE, AND WARMED ON CRON.** `map_data()` is fourteen
sequential Atlas calls on a ten-water chain and a guest measured 14.6s waiting
for it. `Water_Live::map_payload()` is the cached accessor the route uses;
`map_data()` stays the generator and is untouched. Three hours, deliberately
INSIDE `TTL_ATLAS` (6h) so an ordinary rebuild reads warm per-report transients.
A build lock stops a stampede: one builds, the others get `stale: true` rather
than a half-drawn map. `map_ttl()` gives an OUTAGE the five-minute failure TTL —
the waters list comes from the owner's stored rows so it is never empty, which
makes "no waters" the wrong test; "no readings and no ramps" is the right one.
The cron event exists only while the map is enabled, and deactivation and
uninstall both clear it.

**BROWSE SUB-GROUPS ARE NAVIGATION, NEVER A FILTER.** The 38 animals carry a
`browse` field and the Animals section shows chips for it. Choosing one JUMPS the
deck and relabels the position line; it hides nothing. That is the 1.28.0 lesson
applied: an invisible filter made seven winter species unreachable, and a
sub-group hiding five sixths of the section would be the same mistake smaller.

- **`browse` is NOT `idgroup`.** `idgroup` is a look-alike confusion set for
  identification and 22 species have none. Different question, different field.
- **`Species::browse_order()` orders the DECK ONLY**, so each sub-group is one
  contiguous run and "Reptiles · 1/1" is true. It is STABLE, so order within a
  run is registry order and the confusable birds stay together. The prose guide,
  the JSON-LD and the dataset all read the registry directly and are unaffected.
- **Labels do not overstate.** "Reptiles" — the registry has no amphibians.
  "Waterfowl & swimmers" — only three of the ten are ducks. Widen a label when
  the data widens, not before.
- **A chip records a CHOICE, not a position.** A scroll handler that moved the
  pressed chip to the group at the deck's left edge was wrong by exactly one
  group every time, because a jump aligns the COLUMN holding the target and that
  column's first tile usually belongs to the previous group. Do not add it back.
  When the deck is swiped clear of the chosen group, `contextFor()` returns null
  and the line falls back to the deck's own count.
- **The last sub-group cannot reach the left edge** — there is not enough scroll
  behind it. That is not a failure, and the suite allows it when the deck is at
  maximum scroll.

**A `<select>` NEEDS AT LEAST 16px OR iOS ZOOMS THE PAGE.** The jump select uses
`font-size: 1rem`, not a px value: it keeps the "sizes stay relative" rule, and
the 20px deployment root makes it 20px there and exactly 16px on a default root.
The search input's literal 16px remains the one px font-size in the plugin.

**LEAFLET'S OWN CONTROLS NEED A DOUBLED CLASS TO OVERRIDE.**
`.leaflet-touch .leaflet-bar a` is (0,2,1) and sets 30px, and `leaflet.css` is
injected into `<head>` at runtime AFTER `water.css` — so an equal-specificity
override loses on source order. `.dccwl-map-canvas.dccwl-map-canvas` reaches
(0,3,1) and wins, the same trick the Bravada button rules use.

**THE MAP SHEET SCROLLS.** It was `overflow: hidden` around a canvas with a hard
240px floor above a bar and legend that both WRAP, which pushed the legend 141px
past the bottom edge on a 320x568 phone with no way to reach it. The canvas floor
is now `min(240px, 40dvh)` and the body scrolls. Dragging the map still pans it
rather than scrolling the sheet — tested with real browser input, because
dispatched PointerEvents do not satisfy Leaflet's drag handler and a test that
"passed" on nothing moving would be worthless.

**DECK ROWS ARE `auto`, SO ONE LONG NAME INFLATES A ROW EVERYWHERE.** A row is as
tall as the tallest tile anywhere in it, across every page. The card now fills
its slot (as the spotlight strip always has) and the name is clamped to two
lines, which caps the row height at source. The full name stays in the DOM and
in the accessible name.

**A CONTROL THAT CANNOT WORK IS NOT OFFERED.** The map's Fullscreen button is
feature-detected on the element it would actually ask, because iPhone Safari
implements `requestFullscreen` for `<video>` only — it rendered and did nothing.
The same rule retired the month widget's "Show season countdown" switcher, which
had been inert since the countdown was retired in 1.27.0.

**`maybe_upgrade()` USES version_compare, AND PERSISTS THE MERGED ROW.** String
equality also fired on a DOWNGRADE, re-running every step against older code.
And `Water_Data::persist_merged()` writes the merged option back so the stored
row DESCRIBES behaviour instead of waiting for a manual save. That merge is per
ROW, never per LIST: every array setting here is a list the owner edits, and
unioning it with the seeded one would resurrect rows they deleted. A stored list
wins wholesale; each row merely gains any keys the shape has grown, empty.

**Page weight is measured in gzip -9 bytes, not raw.** 1.31.0 costs a species
page about 6.2KB gzipped over 1.30.0: +1167 on the cached page (HTML and inline
config) and +5180 in assets, which are cached across pages after the first.
water-map.js grew 948 bytes gz and is still fully deferred to the map opening.
NOTE: the wire bytes the site actually serves are NOT measurable from this
container — no live egress — so re-measure against doracanalcourt.com before
treating any of it as what a phone pays.

## 1.32.0 — settings, and the rules that shaped which ones exist

**EVERY SETTING CHANGES SOMETHING, OR IT IS NOT A SETTING.** A control that
invites a decision and then ignores it is worse than a missing one. This round
removed two that had become exactly that: the sitewide "Season countdown"
checkbox and the countdown widget's note, both of which still described a
feature `countdown_possible()` has hard-refused since 1.27.0. The month widget's
version went in 1.31.0 for the same reason. `dcc_wl_countdown_enabled` is NOT
deleted — it records a preference the owner expressed, and reviving the card
should restore his choice rather than guess.

**`Guide_Data` (`dcc_wl_guide`) IS A SECOND OPTION ON PURPOSE.** `dcc_wl_water`
is 24 keys with its own sanitiser and a per-row merge for the chain, the almanac
and the link lists. Putting display settings in it would mean one sanitiser
reasoning about two unrelated shapes, where a mistake in the guide half could
reach the water module's stored rows. They share the settings PAGE and the
settings GROUP — one form, one Save — and only the storage is separate.

**WHAT IS DELIBERATELY NOT SETTABLE.** "Everything plausibly tunable" is not
"everything", and Guide_Data's header carries the list. The ones worth
remembering:

- **The photo credits panel and the modification notice.** Licence obligations;
  four photographs carry a real CC BY requirement.
- **The footnote row.** It CONTAINS the prose guide and the credits, so a switch
  on it is a switch on both under another name — and it is the hub's only door
  to the month picker.
- **The flag key.** The 1.18.0 rule is that a colour carrying meaning has a key
  beside it, so the key cannot be hidden while the marks remain; the reverse
  would take the danger mark off four venomous snakes.
- **The crawlable prose guide.** Hiding content that exists for crawlers is a
  guidelines problem, not a preference.
- **The Atlas fetch budget and the map fetch ceiling.** Too low does not fail —
  it draws a map with waters silently missing.
- **The photo drop folder.** Changing it orphans an import that already ran.

**AN UNCHECKED CHECKBOX POSTS NOTHING.** `Guide_Data::sanitize()` therefore
walks the SCHEMA, not the input: an absent boolean becomes 0, never its old
value. Iterating the input's keys instead would make a box impossible to untick —
it would save as "unchanged" every time. An empty NUMBER field, by contrast,
falls back to the default rather than to zero, because zero is a real value for
several of these caps.

**A PER-PLACEMENT OVERRIDE IS A SELECT, NEVER A SWITCHER.** A switcher has two
states and no third, so it cannot say "leave this to the settings page": every
placement would be forced to assert a value, and a widget saved today would
freeze today's default for ever. `Guide_Data::three_way()` is the one definition
of that control and it lives beside `resolve()`, which consumes it, so the
option keys and the resolver cannot drift.

**DISPLAY MAY BE OVERRIDDEN EITHER WAY; CAPABILITY MAY ONLY BE HIDDEN.** A
setting that is off for taste can be turned back on for one placement. A section
gated by CAPABILITY — the live layer, the chain map, the fishing almanac, all of
which govern network calls or data that may not exist — gets
`resolve_hide()` and a two-option control with no "Show", because a widget that
could force one on would promise a section the site has nothing to fill.

**PER-PLACEMENT VALUES RIDE THE ROOT ELEMENT, NOT THE SHARED CONFIG.**
`DCC_WL_CFG` and `DCC_WL_CANAL` are emitted ONCE PER PAGE — the static guard
that stops two widgets shipping 54KB of identical JSON twice — so anything in
them cannot differ between placements. Overrides therefore go in `data-dccwl`
(the month root, which widget.js already parses per root) and
`data-dccwl-canal` (cast to an object so an empty result is `{}`, not `[]`).
An untouched widget emits an empty object and the script falls back to the
site-wide value: that is what "an untouched control writes nothing" means once
it reaches the browser.

**THREE THINGS ARE SITE-WIDE ONLY, AND THAT IS NOT AN OVERSIGHT.** The spotlight
threshold, the peak score and the loose-match minimum are read by MODULE-LEVEL
helpers (`peakFor`, `nextRise`, the search matcher) that every root on the page
shares by design — `peakFor` is public API that canal.js calls. Making them
per-root would mean threading state through that API or duplicating the config,
both worse than the setting being site-wide.

**DEFAULTS REPRODUCE 1.31.0, MEASURED.** Rendered against 1.31.0 with nothing
stored, the ONLY non-whitespace change to any of the three renderers' HTML is
five bytes: `data-dccwl-canal` gaining `="{}"`. The configs differ only by the
added `set` objects — which carry exactly the numbers that were hard-coded — and
by the version string. test-guide-settings.php pins the empty `{}` so a future
change that starts writing into it is a visible decision.

**TEST GUARDS BY REFLECTION, NOT BY LIST.** `dcc_reset_once_guards()` clears
every static bool on the renderers. A hand-kept list is why this suite first
claimed that switching the search off also removed the structured-data block: it
had not, the JSON-LD guard simply had not been reset, and the list did not know
that guard existed.

**THE WATER MODULE, AGAIN UNDISTURBED.** This round removed exactly TWO lines
from class-water-live.php, both `return self::TTL_MAP;`, replaced by a settable
`map_ttl_seconds()` that returns the same constant when nothing is stored. No
parser was touched, and test-map-cache.php asserts a stubbed Atlas reading still
arrives parsed with a custom cache life in play.

## 1.32.1 — the stub that hid a live bug, and two settings that lied

**A TEST STUB MORE PERMISSIVE THAN THE REAL THING IS A TEST THAT AGREES WITH
YOU.** `esc_url_raw` was stubbed as `return (string) $u;` from the harness's
first commit. WordPress's real `esc_url()` strips every character outside an
allow-list in wp-includes/formatting.php, and `{` and `}` are not in it — so the
chain map's tile templates were stored with their placeholders removed:

    https://tile.openstreetmap.org/{z}/{x}/{y}.png
    -> https://tile.openstreetmap.org/z/x/y.png

Leaflet passes the string to `L.tileLayer` verbatim, so every tile in the grid
requested that one literal URL, the provider answered with one image of the
whole world, and it repeated in every slot. The 1.31.0 `fitBounds` fix was
working correctly throughout — zoom 8, every marker in view, over a basemap that
was one tile. Fourteen suites passed the whole time.

`wp-stubs.php` now carries WordPress's actual character class, and
test-tile-templates.php asserts FIRST that the stub still strips braces, because
the moment it stops every other assertion in that file becomes worthless. When
you add a stub here, copy the real behaviour or leave the function out.

**A TILE TEMPLATE IS NOT A URL.** `Water_Admin::sanitize_tile_template()`
validates against the RFC 3986 character set plus braces and returns the value
untouched or rejects it whole. It does not repair: a half-cleaned template is a
map that draws wrongly, which is harder to notice than a map that does not draw.
`map_leaflet_js` and `map_leaflet_css` are real URLs and keep `esc_url_raw`.

**FIXING A SANITISER DOES NOTHING FOR THE ROW ALREADY STORED.** Every site that
had ever saved the form held a damaged value, and `persist_merged()` re-wrote it
on every upgrade. `Water_Data::upgrade()` now repairs it: exact match against the
brace-stripped default restores the default, otherwise a trailing `/z/x/y` or
`/z/y/x` is re-braced, and anything else is LEFT ALONE. Guessing at a custom
endpoint would replace a broken map with a differently broken one.

**A SETTING THAT DESCRIBES BEHAVIOUR IT DOES NOT HAVE IS THE SAME DEFECT AS A
CONTROL THAT DOES NOTHING.** 1.32.0 sent `spotlight_min` and `peak_score` to the
browser and then left six literal `3`s and a literal `2` in place. `PEAK_SCORE`
reached only `nextRise()` and `peakRun()`, both belonging to the retired
countdown, and canal.js hard-coded its own `2`, so the hub tile and the panel
header it opens would have disagreed the moment anyone changed the threshold.
Both are wired everywhere now, canal.js reads the GUIDE's config for them
(`window.DCC_WL_CFG.set`, not the hub's) so those two surfaces cannot diverge,
and a source lint fails any comparison against a bare 2 or 3.

**DO NOT REGISTER A SETTING THE PAGE NO LONGER EDITS.** wp-admin/options.php
walks every option registered to the group and calls `update_option($name, null)`
for any absent from POST. `dcc_wl_countdown_enabled` stayed registered after its
field was removed, so every Save ran null through `empty($v) ? 0 : 1` and wrote
0 — destroying the preference the page promises to keep. The registration is
gone; `countdown_enabled()` still reads the option, defaulting to 1.

**THE SEPTEMBER COUNTS ARE THREE DEFINITIONS, NOT A BUG.** Reproduced from the
dataset and from real screenshots at 390px: hub tile 36 (`>= 2`, wildlife only),
month strip 15 (`>= 3`, wildlife only), Peak Now 24 tiles (`>= 3`, safety
included, the alligator drawn twice — 23 distinct species), search 51, deck 52.
Rob has not chosen a rule, so NOTHING here was changed. Note for whoever picks
one up: the hub's `subSpot` string reads "%d at their best in %s" for the `>= 2`
count while the month strip says "at peak" for `>= 3`, and those two phrases read
as synonyms — the wording is part of the problem, not just the arithmetic.

## 1.33.0 — the decisions Rob made himself, dated. Do not undo these.

Every item in this section was chosen by the owner by multiple choice on
**2026-09-28**, not proposed by a session. Where one reverses an earlier
decision, that is said outright, with the date, so nobody restores the old rule
as a "fix". Two of them do.

**EVERYTHING HERE IS A PLUGIN DEFAULT.** Rob's standing rule: site choices live
in the plugin's own CSS/JS/PHP defaults, never in per-widget Elementor overrides
and never in a stored setting. The Wildlife widget on /explore/ (post 18119,
`dccwl_canal`) was checked live on 2026-09-28 and stores NO settings, so a new
default reaches guests. If a change needs a new Elementor control, the control's
DEFAULT must be Rob's decision — a placement that has never been touched must
render his answer.

**THE STANDING RULE FOR UNSETTLED CHOICES.** A design choice this document does
not settle — layout, wording, which card goes in which tab, a colour, a size, a
new group chip — is not a session's to make. Render the options at phone width
and ask. Engineering choices (structure, tests, how data loads) stay the
session's, as they always were.

### 1. Hazards belong in Safety, and nowhere else (REVERSES 1.27.0)

From 1.27.0 to 1.32.1 the rule was "at peak means at peak, in every section
including safety — a venomous snake at its most active is exactly what a guest
should be shown, not spared". **Rob's ruling is the opposite.** Peak Now is a
list of things worth going out to look for, and nobody goes looking for a
cottonmouth. The Safety section is a destination a guest chooses, and every
hazard still lives there, every month.

- `Species::is_hazard()` is the ONE definition: group `safety`, **or** flagged
  `danger`. That second clause is the alligator, whose group is `critters`.
- It rides the wire as `haz`, so `widget.js` and `canal.js` cannot drift. The
  client used to ask `group !== 'safety'`, which is a different question and
  missed the alligator — that was the double count.
- **"At peak" now means ONE number on every surface that says it.** In
  September: the month strip and the Peak Now tab both read 14. Before, the
  strip said 15 and Peak Now showed 24 tile faces over 23 species.
- The hub tile and the guide subtitle keep the wider `>= 2` count but no longer
  call it "at their best": the string is **"%1$d worth looking for in %2$s"**.
  36 → 35 in September, the difference being the alligator.

### 2. September, measured, before and after (51 species)

| surface | 1.32.1 | 1.33.0 |
|---|---|---|
| hub tile / guide subtitle | 36 "at their best" | 35 "worth looking for" |
| month strip | 15 "at peak" | 14 "at peak" |
| Peak Now tab | 23 species / 24 tile faces | 14 |
| Safety section | 9 | 9 |
| search placeholder | 51 | 51 |
| deck, Animals | 38 | 38 |

The nine hazards dropped from Peak Now are the four venomous snakes, the fire
ant, the poison ivy, the mosquitoes, the lovebugs and the alligator. All nine
are still in Safety, and the alligator is still browsable under Animals.

### 3. Rob's answers to the style sheet (2026-09-28). Also his, also dated.

1. **The gold selected-ring is fine as it is.** No options wanted.
2. **CORAL HOVER STAYS AT 2.59:1.** White on `#F08080` measures **2.59:1**,
   which does not meet WCAG AA at any size. Rob chose it anyway, for one
   reason: it is what the kit's buttons, the Guest Guide's `.dccgg-btn` and
   the Selector already do, and three plugins on one site disagreeing about
   hover is worse than the number. **If contrast is ever raised it changes
   SITE-WIDE, in one place, never in Wildlife alone.** Do not "fix" this here.
3. **The deck's blank cells stay.** Each browse group starts its own column;
   the gap at the foot of the previous group's last column is the price of
   "press Mammals, see a mammal" and Rob accepts it.
4. **A DISABLED NAVIGATION CONTROL IS HIDDEN, NOT FADED, AND KEEPS ITS SPACE.**
   No pale-blue and no grey disabled look anywhere in Wildlife. It is out of
   the tab order and out of the accessibility tree while hidden.
   `visibility: hidden` does all three in one property — `display: none`
   collapses the row, `opacity: 0` leaves a focusable ghost. Applies to every
   such control: the deck's Previous/Next, the month-strip arrows, any sheet
   Previous/Next.
   **The one distinction, and it is deliberate:** this is for a control that
   cannot be used because there is nowhere to go. A control disabled because
   it is BUSY — the map button, which reads "Loading…" while Leaflet arrives
   — stays visible. Hiding it mid-tap would look like it vanished and would
   take its own progress message with it.
5. **These light-blue surfaces are WHITE now**: the tile's art well
   (`.dccwl-tile-media`), the three toggle-row grounds (`.dccwl-tabs`,
   `.dccwl-timeline`, `.dccwl-subchips`), the "What to do" panel
   (`.dccwl-safe`, which keeps its coloured left rule), the look-alike icon
   wells (`.dccwl-lookalike-icon`), and the base badge pill (`.dccwl-badge`),
   which takes a 1px border in its own text colour so a white pill on a white
   sheet still has a shape.
   **Untouched, because they are meaning colours, and Rob said so:** the solid
   red Danger badge, and the "Peak season" badge's coral text and the coral
   wash it sits on. That wash was never one of the light-blue surfaces.
6. **The hub's round chevron (`.dccwl-hub-go`) is a button like every other**:
   a solid `#006BCF` disc with a white chevron, coral on hover.
7. Four uses of `--dccwl-primary-soft` as a BACKGROUND remain, and **none of
   them may change without asking Rob**: the hub's sticky level bar
   (`.dccwl-canal .dccwl-levelbar`), the current-month tile's wash
   (`.dccwl-month-tile-on`), the fishing keep-limits block
   (`.dccwl-fishing-regs`), and the Field guide / Credits panel summary bar
   (`.dccwl-fullguide-summary`).

### 4. Two bugs his Director found in the 1.33.0 screenshots

**PAW PRINTS ON SNAKES, and it was live.** `speciesArt()` — which draws the
icons in "Easily confused with" and the hub's preview art — went straight
from a species' own drawing to the GROUP GLYPH and never looked at the
photograph. Twenty-seven of fifty-one species have a photograph and no
drawing, seventeen of them in a look-alike group, so the ID helper showed a
paw print beside the Brown Watersnake and the Florida Green Watersnake —
next to the one field mark that is supposed to tell them apart. The function
now follows the same three rungs the tile face always has: **vetted
photograph → the species' own drawing → the group glyph.** `ui-theme.mjs`
asserts both halves: that every species HAS something of its own, and that
no look-alike renders the glyph.

**AND THE HARNESS COULD NEVER HAVE CAUGHT IT, because it defined the wrong
constant.** `dcc_boot_plugin()` defined `DCC_WL_PATH`; no line of the plugin
has ever read that name. The plugin defines `DCC_WL_DIR`, and
`Photo_Library::sources()` gates the bundled photo directory on it — so with
it undefined **NO PHOTOGRAPH RESOLVED IN ANY SUITE, EVER**. Every fixture
fell through to the drawing or the glyph, every screenshot showed a page the
site does not serve, and the documented fallback chain was untestable below
its first rung. One line; a whole subsystem.

### 5. The narration voice, decided 2026-09-28. Rob's words, not a summary.

He was shown three entries in two lengths ("full" and "trim") and picked one.
The decision has four parts, and the fourth is the one that costs real work.

**a. Length: TRIM, for every entry, existing and new.** The approved samples run
52, 56 and 58 words. That is the target, not today's 43-word mean — the trim
voice is *denser*, not shorter. Do not "tidy" an entry down to two sentences;
that is a different voice, and it was rejected.

**b. Only the opening paragraph narrates.** In his words: *"Sections: 'Where to
look', 'Listen for', 'Best time', 'Tell it apart' and the rest STAY SHORT,
PLAIN, SCANNABLE LINES, like labels on a field card. Only the opening paragraph
carries the narrated voice. Light wording polish in the sections is fine; don't
narrate them."* In the 1.33.0 pass this held: across 51 entries only ten section
lines changed, every one a correction, and `mark` did not change at all.

**c. Nothing safety-relevant may be lost in trimming.** This is an invariant
now, not a one-off instruction, and it is **enforced by
`tools/tests/test-narration.php`**. That suite holds a table of the facts a
guest *acts on*, per Know-before-you-go species, and fails if one stops
appearing. It also fails when a species is added to the safety group without
declaring its facts — so the item-6 expansion cannot quietly add a hazard with
no contract. Five mutations were verified red against it.

The fact that prompted the rule: a trim sample dropped *"It does not chase
people"* from the cottonmouth. Rob caught it. It is back, verified, and pinned.

**d. Sources for EVERYTHING that stays, not only what is new.** In his words:
*"every sentence kept 'unchanged' in any entry: re-verify it, or it goes."*

This is the expensive one and it is not optional. It is why the guide lost two
claims in 1.33.0 (a twelve-pound Lake Dora bass; bald cypress "spared by the
loggers") and gained six corrections, one of them dangerous in the old wording
— the diamondback no longer promises it will rattle first. The full claim-by-
claim record is in `WATER-SOURCES.md` under "the 1.33.0 narration pass".

**Applies to the item-6 expansion too.** A new entry needs its sources before it
is written, on the same terms. "It is in the master list" is not a source.

### 6. Page weight, measured with the trim narration (not estimated)

Rob asked for the /explore/ figure at 403 species *after* the trim, because the
earlier 82 KB number assumed prose 35% longer than it turned out to be. Measured
by rendering the real hub with a synthesised 403-species registry
(`tools/` has no copy — the script lives in the session scratchpad; recreate it
by cloning `dcc_wl_species` up to N, which is all it does):

| | raw | gzip |
|---|---|---|
| /explore/ today, 51 species | 191 KB | **34.6 KB** |
| /explore/ at 403 species, trim narration | 973 KB | **118.3 KB** |
| — of which the inline species index | 120 KB | 9.6 KB |
| — of which the server-rendered field guide HTML | 853 KB | 108.4 KB |
| detail payload, fetched once on opening a sheet | 264 KB | 79.0 KB |

**The number that matters: the page weight is the crawlable field guide, not the
data.** The inline index is 9.6 KB gzip at 403 species — the wire split did its
job. 108 of the 118 KB is the `<details>` markup Rob explicitly decided to KEEP
on /explore/ for crawlability. If that ever needs to come down, the lever is the
field guide's markup or its presence, not the narration and not the JSON.

For comparison, the same page with the old +35% prose assumption: 122.7 KB gzip.
So the trim decision saves about 4.4 KB gzip on the page and 6.7 KB on the
fetched detail — real, but not the thing that decides the page's size.

### 7. The map control bar: one bar, two shapes, chosen by measurement (1.33.0)

Rob's decision, after being shown options A, B and C at 320/390/1280:

> "Where the full six-control bar fits on one row (desktop, e.g. 1280px), keep
> TODAY'S bar exactly […] That segmented control is the pattern from Rob's
> Croatia template. […] Where it doesn't fit on one row (phones), show your
> option C: two menus, 'Colour ▾' and 'Layers ▾', with Fullscreen inside the
> Layers menu. […] Switch by measurement (does the full bar fit on one row?),
> not a hard-coded width."

**There is no breakpoint for the switch, and there must never be one.** `fit()`
in `water-map.js` pins the bar AND the segmented control to `flex-wrap: nowrap`
for one frame, asks whether `scrollWidth` exceeded `clientWidth`, restores both,
and picks a shape. A `ResizeObserver` on the bar re-asks whenever its width
changes — which catches the case `window.resize` cannot: the map sheet changing
size while the window does not. `ui-mapbar.mjs` pins this with a NEGATIVE test:
it squeezes the bar to 300px inside a 1280px window and requires it to collapse.
Hard-coding the switch to `window.innerWidth` fails that test.

Two traps, both of which cost a cycle here:

- **Pinning only the bar to nowrap measures nothing.** `.dccwl-seg` has its own
  `flex-wrap`, so the three colour buttons wrapped *inside* it, the bar grew a
  second row, and `scrollWidth` never exceeded `clientWidth`. Both levels have
  to be pinned or the question asked is "does it fit in any number of rows",
  whose answer is always yes.
- **`apply()` must be idempotent.** `fit()` flips to the full shape to measure
  and flips back, so `apply()` is routinely called twice with the same argument.
  An early return on "no change" left the bar showing the shape that was only
  ever meant to be measured.

**The only width-keyed rule the bar has** is a `max-width: 380px` block that
tightens padding and gap by 16px. That is cosmetic headroom, not the switch.

**One piece of state.** `setColour()` is the only path that changes the
colouring; it updates the segmented buttons, the radio rows and the menu
button's label together. Switching shape mid-session can therefore never show
two different answers, which the suite checks by choosing Level on the full bar
and then squeezing it.

**The Colour menu uses radio rows** under a heading, because the Layers menu
already shows its base-map choice that way and Rob asked for no new marking
style. The button reads "Colour by: Clarity ▾" so the state is legible without
opening anything.

### 8. Escape belongs to the innermost thing that is open (1.33.0)

`sheet.js` listens for Escape on `document` in the CAPTURE phase and calls
`stopPropagation()`. Right for a modal — nothing behind it should see the key —
but it also meant **nothing inside the sheet ever saw it**. Pressing Escape to
dismiss the map's Layers menu tore down the entire map sheet.

The fix is a small, explicit contract. Before closing, the sheet dispatches a
cancelable `dccwl:escape` event at the focused element inside it (or at the
sheet body). Anything with something open listens for it and calls
`preventDefault()` to say *that one was mine*; only if nobody claims it does the
sheet close. A second press then closes the sheet, because by then the menu is
shut and nobody claims it.

**If you add another layer that opens inside a sheet — a popover, a submenu, a
picker — it claims Escape the same way.** Do not add a second document-level
listener, and do not weaken the sheet's `stopPropagation()`.

Testing note: a synthetic `keydown` dispatched on a button proves nothing here,
because the capture listener stops it before it reaches anything. The suite uses
`page.keyboard.press('Escape')` so the real path runs. The first version of the
test did the synthetic thing and passed against code that was broken.

### 9. The map bar sits above Leaflet's own controls (1.33.0)

`.dccwl-map-bar` is `z-index: 1100`. It was 500. Leaflet puts its control panes
at 1000 and its controls at 800, and the attribution line runs along the bottom
of the canvas — exactly where a menu opening *upwards* from the bar lands. The
last row of an open menu was painted over by "Leaflet | © OpenStreetMap
contributors", and `elementFromPoint` returned the attribution there, so the row
could not be tapped either.

This affected the **Layers** menu from the day it shipped. The Colour menu added
in 1.33.0 only made it easy to see. `ui-mapbar.mjs` probes three points inside
each open panel with `elementFromPoint` and requires the panel to own all of
them — "is it visible" is the wrong question; "what would the tap hit" is the
right one.

### 10. Item 6, batches 6–8 (1.33.0): 51 species became 93

Three photo packs landed and their species were written to match. What the
batches settled, beyond the entries themselves:

**LOOK-ALIKE GROUPS ARE SMALL, AND "ALL THE TURTLES" IS NOT A GROUP.** The
first cut put all twelve turtles in one `turtles` group, which put eleven other
species in every sheet — including a land tortoise underneath a basking cooter.
A look-alike section answers ONE question, *which of these am I looking at*, and
a guest standing over a cooter is not also wondering about a gopher tortoise.
Four turtle groups (`baskers`, `mudmusk`, `bigwater`, `landturtles`) and five
for batch 8 (`blacksnakes`, `stripedsnakes`, `climbers`, `anoles`, `skinks`).
Sheets went from 11 look-alikes to 1–3. **Four species carry no group at all**,
which is correct and not an oversight — the ringneck snake, the glass lizard and
the house gecko are unmistakable, and the rough green snake is a deliberate
trade-off recorded in the registry beside it.

**A SPECIES HOLDS ONE LOOK-ALIKE GROUP, SO OVERLAPS ARE A CHOICE.** The Florida
green watersnake is confused with the cottonmouth *and* with the rough green
snake. It stays in `snakes`, because "is this the venomous one" outranks "which
green snake is this", and the rough green snake's own "Tell it apart" line names
the watersnake instead. Do not move it to tidy this up: it would take one of the
three harmless watersnakes out of the cottonmouth comparison.

**THE SKINKS GROUP HOLDS A LIZARD THAT IS NOT A SKINK.** The six-lined
racerunner is in it because a striped brown lizard running across sand is what a
guest compares to a five-lined skink. Confusion, not taxonomy — the same rule
that put the anhinga in `dark` with the herons.

**COUNTS IN THE HARNESS ARE DERIVED.** See the batch-6 commit. One number is
typed — `TOTAL` in test-species.php — so a batch is a deliberate one-line edit.
Everything else is computed, and the suites assert that the parts agree with the
whole. If a batch makes you edit more than `TOTAL`, something has genuinely
changed shape and is worth reading twice.

**AN ANIMAL THAT IS ALSO A HAZARD APPEARS TWICE, BY DESIGN.** The alligator has
since 1.19.0; the cane toad joined it in 1.33.0. `test-narration.php` therefore
asks who is in the safety list AS A GUEST SEES IT (safety group ∪ danger-flagged)
rather than who is in the safety group — otherwise a hazard could be added as an
animal and skip the no-safety-fact-lost contract entirely.

**Weight at 93 species, measured:** inline index 7.8 KB gzip, fetched detail
23.3 KB gzip. Scaling the real 93 to 403 projects 33.9 KB inline and 101 KB
fetched — close to the 9.6 KB / 79 KB the synthetic 403-species run gave,
because gzip does better on a bigger, more repetitive set than linear scaling
predicts. Trust the synthetic figure over the scaled one.

**Still to come:** amphibians next, then the remaining packs. No release zip
until every pack is in — the owner's instruction, and the reason nothing has
been built yet.

### 11. Two placement rules Rob set on 2026-09-29

**EPIPHYTES GO UNDER THE "TREES" CHIP.** Spanish moss and the resurrection fern
— and ball moss when it lands — are neither trees nor wildflowers, and 1.33.0
first filed them in the Wildflowers & shrubs catch-all because that is where the
owner's own master list puts a lichen. **He overruled it, and his reason is the
better one: a guest meets these looking UP AT AN OAK OR A CYPRESS**, so that is
the chip they reach for. The chip is a place to look, not a botanical rank. Any
future epiphyte, air plant or lichen growing on a tree goes here for the same
reason; one growing on the ground does not.

**A LABEL THAT CAN CHANGE ITSELF NEEDS ASKING FIRST.** The derived
"Reptiles & amphibians" chip was accepted, but only because it lands on the
label Rob had already chosen — the mechanism made his decision true rather than
substituting for it. That is the whole of the licence. **Any OTHER piece of
wording that would rewrite itself from content — a heading, a count phrase, a
button, a section name — is a design choice under the standing rule: render the
options and ask.** Do not generalise `has_amphibian()` into a pattern.

### 12. Batch 9 (1.33.0): the amphibians, and the contract catching a real miss

Nineteen species, and the batch that makes "Reptiles & amphibians" true rather
than merely correct — the cane toad flipped that label in batch 7 by being the
only amphibian in the registry.

**EIGHTEEN OF THE NINETEEN CARRY A `sound` LINE**, and that is the point of this
group rather than a relaxation of the 1.14.0 rule. That rule is *a sound line
only where a distinctive, guest-recognisable voice could be verified*, and frogs
are simply the case where that is true nearly every time: a guest on the dock
after dark hears far more amphibians than they will ever see. The peninsula newt
has none because newts do not call. The cane toad gained one with this batch, so
the southern-toad comparison works by ear as well as by eye — its trill is low
and tractor-like where the native's is high and musical.

**THE SAFETY CONTRACT CAUGHT A REAL MISS, WHICH IS WHY IT EXISTS.** The Cuban
treefrog is flagged `danger` — its skin secretion burns and itches for up to an
hour and is worse in eyes or a mouth — and it went in without a what-to-do line.
`test-narration.php` failed on it immediately, because a `danger` flag puts a
species in the safety list whatever its group. It is now the third animal to
reach Safety that way, after the alligator and the cane toad.

**THREE CROSS-LINKS CLOSED, EACH WRITTEN FROM BOTH ENDS.** The gopher frog lives
in the gopher tortoise's burrow (batch 6); the amphiuma is what the eastern mud
snake specialises in eating (batch 8); the southern toad is the toad a guest
must be able to tell from the cane toad (batch 7), so its `mark` leads on the
ridges and knobs between the eyes. When a batch lands, check whether it answers
a question an earlier batch left open — these three were all already half-told.

**MEASURE THE FILES, DO NOT TRUST THE MANIFEST'S WIDTHS.** The pack note said
the greater siren's rendition is 1170 px; the file that arrived is 1100.
`PHOTO_W` is a srcset width descriptor, so a value that disagrees with the image
makes a browser pick the wrong rendition on a retina screen, silently and
invisibly to every test that does not open the file. Widths come from
`getimagesize()` on the landed files, every batch.

**Weight at 112 species:** inline index 9.4 KB gzip, fetched detail 28.0 KB.

### 13. Batches 10 and 11 (1.33.0): 112 species became 156, and the wall re-cut twice more

Forty-four birds — 23 water birds and shorebirds, 21 raptors, owls and night
birds — and this is the batch where the guide stops being a summer guide. Most
of batch 10 is WINTER: a guest here in January was looking at rafts of ducks,
gulls and terns the guide could not name at all.

**THE LOOK-ALIKE WALL, AGAIN, AND IT WAS MINE BOTH TIMES.** The first pass put
all eleven raptors in one `raptor` group and all ten waterfowl in one `ducks`
group, rendering ten and nine look-alikes per sheet. That is exactly the wall
the turtles produced in batch 6 and the land snakes in batch 8 — my own rule,
broken twice in one batch. Worse, I had written a comment *rationalising* the
eleven-member group ("a distant soaring bird is the case where you want the
whole field at once"); it was replaced with the honest version, which calls it
a rationalisation and not a reason. **The rule is unchanged and it is not
negotiable: a look-alike group answers ONE question a guest actually asks.**
After the re-cut the largest group in the whole registry is six (`shorebirds`).

The groups that came out of it, each a real question:

- `raptor` (2) — bald eagle, osprey: the two big ones over water
- `buteos` (3) — red-shouldered, red-tailed, short-tailed: *what is circling*
- `falcons` (4) — kestrel, merlin, peregrine **and the Cooper's hawk**, which is
  an accipiter and belongs here precisely because the question is "small fast
  raptor, which one" and its rounded tail is the answer
- `divingducks` (3), `dabblers` (3), `ferals` (2), `gulls` (3), `terns` (3)
- `duck` (4) — **the mallard JOINS the existing native group**, because hen
  mallard against mottled duck is the pair that matters
- No group at all for the swallow-tailed kite, the harrier and the loon: a
  forked tail, a low V-winged quartering flight and a level dagger bill are
  each unmistakable, and their own `mark` lines say so. **A species with no
  confusable neighbour gets no group — an empty "Tell it apart" is honest.**

**STATUS IS CHECKED, NOT ASSUMED — the wood stork lesson, applied in advance.**
Two traps in this batch, both avoided before they became corrections:

- The **red-cockaded woodpecker is THREATENED, not endangered.** USFWS
  downlisted it on 25 October 2024. Every source older than that says
  endangered, and the badge has to match the text.
- The **kestrel's `protected` flag is for Florida's RESIDENT subspecies**
  (*Falco sparverius paulus*), which is state-designated Threatened and does not
  migrate. The northern birds wintering here are not listed. The `safe` line
  says so, because a badge that over-claims teaches a guest to ignore badges.

**A CONSERVATION INSTRUCTION NEEDS ITS MECHANISM, NOT JUST ITS CONCLUSION.** The
scrub-jay's "do not feed" line first read *"fed jays breed earlier and their
young survive less well"* — and the experimental supplementation literature says
the opposite for wildland birds. The claim is true of SUBURBAN fed jays, for a
specific reason, so the line now carries that reason: *"jays fed peanuts and
birdseed nest weeks too early, before the caterpillars their chicks need have
hatched."* A guest who looks it up must find the guide supported, not
contradicted. Full audit in `WATER-SOURCES.md`.

**EIGHT PHOTO NOTES, THE MOST OF ANY BATCH, AND THAT IS THE MECHANISM WORKING.**
Birds are identified by marks, and a photograph very often fails to show the
mark its entry names. Five notes say exactly that (spotted sandpiper: no winter
spots; Forster's tern: eye mask not cap; harrier: the white rump is on the far
side; herring gull: legs under water; ring-necked duck: the ring it is named
for). Two say the frame is one of two colour morphs that both occur here
(short-tailed hawk — and it is the LESS common one in Florida; screech-owl).
One says the bird is not a Florida animal and is the non-confusing sex, with the
reason that was still right (mallard). Rob asked for the first three by name.

**Weight at 156 species:** inline index 13.1 KB gzip, fetched detail 38.4 KB.
Projected at 403: 33.9 KB inline / 99.1 KB detail.

### 14. Batches 12 and 13 (1.33.0): 156 species became 216 — and a defect the harness waved through

Sixty songbirds, doves and woodpeckers, in two packs. **Every one of the 216
species in the registry now carries a vetted photograph**, and the three-tier
art rule still renders for nobody — which is why both lower tiers stay
(test-1260.php and test-1280.php exist precisely so an empty tier is not
mistaken for a dead one).

**THE HARNESS PASSED GREEN WITH FIFTY-NINE SPECIES HAVING NO CALENDAR AT ALL.**
This is the most important thing in this batch and it was mine. A generator
wrote the calendar keys with the id padded INSIDE the quotes —
`'goldfinch    ' => [ … ]` — so 59 of the 60 new species had no calendar row
that any lookup could find. **All 23 suites passed.** They passed because
`dataset()` substitutes twelve zeros for a missing row, and twelve zeros are
twelve valid scores, in range, of the right length. What a guest would have got:
a blank "Through the year" strip, no "Best:" badge, never in Peak Now, never in
the spotlight — which on a phone reads as a quiet month, not as a bug.

It was caught by *looking at a rendered sheet*, not by a test. Three assertions
now close it, in `test-species.php`, and all three were verified red by mutation:

- every registry species has a calendar row of its own;
- the calendar carries no row for a species that does not exist;
- **every single species reaches its peak score in some month.** This last one
  was DOCUMENTED as enforced since 1.17.0 and was not: only a global "at least
  one species somewhere peaks" check existed, which 215 healthy species satisfy
  on behalf of the broken one.

The general lesson, and it generalises past this bug: **a defect that makes data
ABSENT is invisible to a suite that only validates the shape of what is
present.** When a batch adds rows to two structures that must agree, assert that
they agree — do not assert each one separately and call it covered.

**GROUPS WERE CUT SMALL FROM THE START THIS TIME.** No wall was built and none
had to be re-cut; after sixty additions the largest look-alike group in the
whole registry is still six (`shorebirds`). Sixteen groups, none over five.

**THREE GROUPS DELIBERATELY HOLD A SPECIES THAT DOES NOT BELONG BY TAXONOMY**,
on the batch-8 racerunner rule — confusion, not taxonomy:

- the **goldfinch** sits with three warblers in `winterlittle`, because its
  Florida plumage is olive-tan and that is the bird a guest is trying to name;
- the **chimney swift** sits with the swallows, because "what is that over the
  water" is the question, and it is not a swallow;
- the **house sparrow** sits with two native sparrows, because a guest does not
  know it is not one — which is also the entry's opening line.

**FIFTY-THREE OF THE SIXTY CARRY A `sound` LINE**, taking the registry to 111.
This is the 1.14.0 rule holding, not bending: a sound line goes in where a
distinctive, guest-recognisable voice could be VERIFIED. Songbirds are simply
the case — as frogs were in batch 9 — where that is nearly always true. The
mnemonics printed (teakettle, peter-peter, drink-your-tea, witchety, fee-bee,
po-ta-to-chip, conk-la-ree) were each checked against a source, not recalled.

**THREE CROSS-LINKS CLOSED FROM THE OTHER END.** The blue jay's hawk mimicry was
asserted by the red-shouldered hawk in batch 11 and is now stated by the jay
itself; `jays` finally gives the Florida scrub-jay the comparison its own mark
line has named since batch 11; and the northern parula nests INSIDE Spanish
moss, which has been in this guide as a plant since 1.19.0. Keep doing this —
check on every batch whether it answers a question an earlier one left open.

**A PHOTO NOTE CAN BE RETIRED, AND THIS ONE WAS.** Batch 11's short-tailed hawk
was a light morph and carried a note saying it showed the less likely of
Florida's two forms. The Director sent a dark-morph replacement under the same
slug; the three files were overwritten, the credit changed, and **the note was
DELETED rather than rewritten.** A note exists to record a shortfall in a
frame. When the frame stops falling short the note is noise, and leaving it in
would teach a reader to distrust a photograph that is now correct.

**Weight at 216 species:** inline index 17.5 KB gzip, fetched detail 50.5 KB.
Projected at 403: 32.7 KB inline / 94.2 KB detail — slightly *better* than the
projection from 156, because gzip does more with a larger, more repetitive set.

### 15. Batches 20–23 (1.33.0): the plants — 216 species became 284

Sixty-eight plants in four packs: 24 trees, 25 wildflowers and shrubs, 19 water
plants. **No plant carries a `sound` line and none should** — that is the 1.14.0
rule holding, not an omission.

**ROB'S EPIPHYTE RULE DECIDED TWO OF THESE, AND IT CUTS BOTH WAYS.** Section 11
says an epiphyte, air plant or lichen growing ON A TREE goes under the Trees
chip, and one growing on the ground does not. **Ball moss** is a *Tillandsia* in
a branch fork, so it goes under Trees with Spanish moss and the resurrection
fern — and joins them in a new `airplants` look-alike group. **Reindeer lichen**
grows on bare sand, so it sits under Wildflowers & shrubs. The chip is a place
to look, not a botanical rank, and applying the rule mechanically to "lichen"
would have got the second one wrong.

**FOUR SCIENTIFIC NAMES WERE DECIDED FROM EVIDENCE, AND A BLANKET RULE WOULD
HAVE BEEN WRONG ONCE IN FOUR.** Every one of the four name-notes said the same
thing — iNaturalist's taxon differs from the master list's name. Three resolve
toward the Atlas of Florida Plants (red bay *Persea borbonia*, camphor
*Cinnamomum camphora*, sawgrass *Cladium jamaicense*). **The prickly pear goes
the other way**: *Opuntia austrina* is the accepted name for the Florida plant
and the master list's *O. humifusa* is its synonym. A fifth unflagged case (water
hyacinth, *Pontederia* vs *Eichhornia*) is recorded in `WATER-SOURCES.md`.
**Never settle one of these by policy. Look it up per plant.**

**THE FIRST PLANTS TO CARRY `danger`, AND WHAT THAT BROKE.** Sawgrass and the
prickly pear are flagged, on the bar the three existing hazard plants set: all
of those are CONTACT injuries, not merely toxic-if-eaten. Coontie, coral bean and
lantana are poisonous to swallow, say so in their own text, and are NOT flagged —
widening `danger` that far would move a dozen ordinary plants into Safety and
teach guests to skim it.

Three suites failed on this, and **two of them were wrong rather than the code**:

- `test-species.php` and `test-counts.php` both derived dual section membership
  from *"a species in `critters` or `birds` flagged `danger`"* — i.e. they
  assumed **a hazard is always an ANIMAL**. That was true when they were
  written and is not any more. Both now ask the question
  `Species::is_hazard()` actually asks — flagged `danger` while living outside
  the safety group — and no longer care what kingdom the species is in.
- `test-narration.php` was **right**, and it is the gate doing its job for the
  fourth time: two new species reached Safety without rows in the safety
  contract, and it refused them until they had. Sawgrass and prickly pear now
  pin their actionable facts there.

The general shape, worth remembering: when a batch fails a suite, decide whether
the suite encoded an assumption that has expired or a rule that still holds.
Here both kinds turned up in one run.

**THREE EXISTING PLANTS GAINED A LOOK-ALIKE GROUP** for the first time, because
until now there was nothing to compare them with: bald cypress joins pond cypress
(`cypresses`), Spanish moss joins ball moss (`airplants`), and the white
waterlily joins spatterdock and American lotus (`lilypads`). Bald cypress against
pond cypress is the classic Florida confusion and the guide could not answer it
before this batch.

**Weight at 284 species:** inline index 23.2 KB gzip, fetched detail 62.7 KB.
Projected at 403: 32.9 KB inline / 88.9 KB detail.

**NO RELEASE ZIP WAS BUILT.** Batches 14–19 — the mammals, fish, dragonflies,
butterflies and other small things, 59 species including the round-tailed muskrat
and the blue-faced meadowhawk — **did not arrive in this container**. Only packs
20–23 did. The owner's standing instruction is that nothing ships until every
pack is in, and a zip cut here would ship a guide that is missing 59 species he
believes are in it. See the report for exactly what is outstanding.

### 16. Batches 14–19 (1.33.0): the last animals — 284 species became 402, and the guide is complete

Seven packs: 23 mammals, 31 fish, 11 dragonflies and damselflies, 27 butterflies
and moths, 17 other small things, 9 reptiles the earlier packs had missed.
**Item 6 is finished.** 402 species, 401 photographs, 116 sound lines, 92
look-alike groups, largest still six.

**A SPECIES WAS DROPPED ON THE EVIDENCE, AND THAT IS THE PRECEDENT WORTH
KEEPING.** The blue-faced meadowhawk arrived with a photograph and with the
Director's own evidence against it: five Florida records on iNaturalist, all
panhandle, none in Central Florida — and the published range stops at the
panhandle. A guide entry asserts *this is on this canal*, so the entry was not
written and **the photograph was not registered**, its files kept out of
`assets/photos/` exactly as the least bittern was in batch 3.

**Do not confuse this with the standing rule that Rob's sightings outrank range
maps.** That rule protects a species the OWNER HAS TICKED HIMSELF. This one
carried a Check flag precisely because nobody had confirmed it, and the check
came back negative. The two cases look similar and resolve opposite ways.

**THE THIRD ART TIER RENDERED FOR THE FIRST TIME.** The round-tailed muskrat
ships with no photograph by Rob's decision, so it falls to the group glyph —
the fallback that has been documented, defended and never once used since
1.23.0. `ui-theme.mjs` used to assert "no species falls to the glyph"; it now
asserts "only the muskrat does", which makes it the first live proof the
documented chain actually works. `test-species.php` pins the same exception by
name in a `PHOTOLESS` constant. **A second species losing its photograph still
fails both**, which is the standing rule — *no species ships without a photo
unless the owner decided that species himself* — expressed as a list of his
decisions rather than as a blanket count.

**TWO MORE SUITES ENCODED AN ASSUMPTION THAT EXPIRED**, the same shape as the
plant batch: both asserted every species has a photograph, which was true at
284/284 and is now deliberately false for exactly one. As before, the fix was to
pin the intended state, never to loosen the check. `test-narration.php` was
right again — the walkingstick and the macaque reached Safety without contract
rows and it refused them. That gate has now caught something real five times.

**TWO NEW HAZARDS, and one deliberate non-hazard.** The walkingstick sprays an
irritant at eyes and causes temporary blindness; the rhesus macaque is flagged
`danger` AS WELL AS `invasive`, because the risk is a bite and some of that
population carries herpes B — and they have reached Lake County, with one
photographed in Mount Dora. **The armadillo is not flagged** despite carrying
leprosy: that needs handling the animal, a deliberate act, and the bar has been
contact injury since the plants. Twenty-eight species now reach Safety.

**WALLS WERE CAUGHT IN DRAFT THIS TIME, NOT AFTER RENDERING.** Three groups
formed at 7, 10 and 7 members — sunfish, baitfish and skimmers — and each was
re-cut before a line of PHP was generated, by asking what question a guest is
actually holding: *which bream is this* is not *which little fish is at the
surface*, and *which blue dragonfly* is not *which one has patterned wings*.

**Weight at 402 species, measured — this is the real number the projections were
approximating:** inline index **32.2 KB gzip**, fetched detail **82.9 KB**. The
synthetic 403-species run in section 6 predicted 9.6 KB inline, and it was
wrong: it cloned one species 403 times, which gzip compresses far better than
402 genuinely different ones. **Trust a measurement of the real registry over
any projection, including the ones recorded earlier in this file.**

### 17. 1.33.1 — the release that could not activate, and the blind spot that let it

**1.33.0 fataled on activation.** `dcc-wildlife.php` never `require_once`'d
`includes/class-guide-rest.php`, and `Plugin::register_hooks()` calls
`Guide_Rest::register_hooks()` at line 62. WordPress died with
*"Class DCC_WL\Guide_Rest not found"*. The Website Director patched live by
adding the one missing line; 1.33.1 is that line, committed.

**TWENTY-THREE SUITES WERE GREEN THROUGHOUT, AND THE REASON IS THE LESSON.**
Every suite in this harness reaches the code through `dcc_boot_plugin()`, which
loads what a TEST needs. WordPress loads what THE PLUGIN FILE SAYS. Those are
two different graphs and only one of them ships. **A suite that obtains its
classes by any route of its own can never see a missing `require` — it has
already routed around the defect.** No amount of coverage in that style would
ever have caught this.

`test-bootstrap.php` closes it, and it works by **deliberately loading
nothing**. It reads the plugin as text, walks the require graph the way PHP
would, and asks whether every file in `includes/` would actually be in memory
after WordPress loaded the plugin. It also checks, from source, that every
class called as `Name::` is defined by a file on that graph — the assertion
that reproduces the live fatal directly rather than by proxy.

**DO NOT "IMPROVE" IT BY BOOTING THE PLUGIN** and using `class_exists()` or
`get_included_files()`. That reintroduces the exact blind spot it exists to
close. Three mutations are verified red: deleting the guide-rest require (the
real bug, caught three ways), adding a new file to `includes/` and not
requiring it, and calling a class under a name nothing defines.

**Two parser lessons worth keeping, both from getting it wrong first:**

- **It is tokenised, not regexed.** An early draft stripped comments with a
  regex, mangled every `https://` in the files, and produced an EMPTY require
  list — a parser that finds nothing and reports no problem is the *same*
  failure mode as the bug it was written to catch. PHP's own lexer knows what
  is code and what is not; use it.
- **An unrecognised require FAILS the suite** rather than being skipped. A
  require the parser cannot follow is a hole of exactly the shape the bug came
  through. WordPress core's `ABSPATH . 'wp-admin/includes/…'` requires are
  *classified* and not followed, which is different from being ignored.

The `check( count( $on_disk ) > 0, … )` guard earned its place immediately: the
first run had a wrong `$plugin_dir` and found zero files, which without that
guard would have passed silently.

**The general rule this adds to the harness doctrine:** *a suite must exercise
the path PRODUCTION takes, not a convenient one.* The existing rules already say
a suite that asserts nothing fails, and that a stub more permissive than the
real thing is a test that agrees with you. This is the third of that family —
and the most expensive, because it reached the owner's live site.

### 18. 1.34.0 — the /explore/ review: Rob's five picks and fifteen fixes

Seventeen items from Rob's own phone review of /explore/ on 1.33.1, plus one his
Website Director found. **Five were design choices, so they were rendered as
labelled options at 390px and 1280px and put to him; he answered 2C · 3B · 8B ·
10A · 14C on 2026-10-01.** Nothing in this section was a session's choice, and
every one is a plugin DEFAULT — /explore/ (post 18119, `dccwl_canal`) stores no
settings, so a default is what a guest gets.

**THE WATER PANEL IS MAP-FIRST NOW (items 1 and 3, pick B).** The chain map was
a button at the foot of the Fishing tab; Rob called it "an incredibly cool
feature" that was buried. The tabs are **Map · Now · Fishing**, in that order,
and the order IS the mechanism: water.js selects the first button in the bar, so
nothing names a default tab. Two rules held while moving it:

- **Nothing map-related loads until a guest opens the map** (the 1.31.0 rule).
  The Map tab therefore shows the map's front door — three stat tiles and the
  open button — never a canvas.
- **The stat tiles double as "Colour by"**, which is what pick B asked for.
  Level and Clarity open the map already coloured by that reading; **Wind opens
  it plain, because the map has no wind colouring** and inventing one would be
  a claim the data cannot support.
- The tiles are filled by water.js from the SAME gated `/conditions` facts the
  Now tab renders, with the source named under each number. A tile with no fact
  stays hidden — an absent reading is absent, never "unknown".

**A FACT NOW CARRIES AN OPTIONAL `key`, AND IT IS METADATA, NOT A GATE.** The
client needed to pick the level, clarity and wind readings out of the list
without matching a TRANSLATED label. `Water_Fact::make()` takes `key`,
restricted to `[a-z_]`; a Fact without one is as valid as a Fact with one, and a
key can neither admit an unsourced fact nor change how one renders. The gate
(tier + source name + parseable date) is untouched. Three live readings declare
one: level, clarity, wind.

**"About" IS NO LONGER A TAB (item 4).** Its content — the almanac, About the
water, the official links — is the fourth link in the hub's bottom row beside
Field Guide, Credits and By Month. Rob asked for it to look and behave exactly
like those three, so it IS one of them: the same
`<details class="dccwl-fullguide">`, rendered by `Water_Render::about_fold()`
and called from `Render`'s footnote row behind `method_exists`, because that
renderer must keep working when the water module is not loaded. It prints
nothing when there is no almanac, no reference facts and no links.

**THE SEASON PICKER IS RENDERED HIDDEN, AND THE MONTHS ARE READ OUT OF THE
LABEL (item 10, pick A).** Fishing was one run of text in which the four
seasons and the three species looked alike. It is now a season picker over one
labelled block per species. Two things keep it honest:

- **Hidden, with every season visible**, exactly as the water tab bar is: with
  no JavaScript a guest reads the whole year in one scroll rather than meeting
  four dead buttons. water.js unhides it and opens the current season.
- **The current season is worked out in CANAL TIME, client-side**, never
  server-side — the page is cached. Which months a season covers is derived
  from the row's OWN label by `Water_Render::season_months()`, looking for this
  locale's month names, **never from the row's position**: the seasons are
  owner-editable rows, and indexing them would mislabel every one the moment
  somebody reorders them or keeps five. A row whose label holds no month name
  simply never wins, and the first season opens.

**THE READINGS FOLD BEHIND "All readings", AND THE TIER KEY FOLDS WITH THEM**
(items 3 and 8, picks B and B). The tier colour is now a full 2px border on all
four sides, and the one-line key is what makes it mean anything — so the key
sits INSIDE the fold, beside the colour it decodes, not above a fold where the
cards are not visible.

**THE CATEGORIES BAR GETS THE MONTHS BAR'S ARROWS (items 13 and 14, pick C).**
Same element and same class (`.dccwl-timeline-arrow`), so the near-black arrow
colour and the 1.33.0 rule that *a control with nowhere to go hides and keeps
its space* both come from ONE implementation. The difference is what a step
means: months wrap, because a year does; categories end, so at either end the
arrow disables — which that rule renders as `visibility: hidden`. `min-width: 0`
on the chip row inside the new flex wrapper is load-bearing, the 1.18.1 lesson
in its flex form: a flex item's floor is its content's min-width, and seven
category chips end to end would otherwise push the page wider than the phone.

**THE SELECTED BUTTON IS CORAL, WITH `--dccwl-text` INK (item 12).** Not white:
white on coral measures 2.59:1, and the 1.16.1 rule is that `--dccwl-accent` is
fill and border only. The month-now badge set the precedent — coral fill, dark
ink (7.29:1) — and the selected tab, category chip and water tab follow it.

**Wording, all three Title Case by his instruction (items 5 and 17):**
"Fishing & Water Conditions", "Tonight on the Canal", and the bottom row reading
**Field Guide · Credits · By Month · About**. The fishing licences block is now
"Licences & keep-limits" and carries a ruled break above it, so it reads as its
own thing rather than more fishing advice.

### 19. 1.35.0 — the wind badge, and the 0.9px that was a font-size

**THE WIND BADGE (Rob's option C, chosen 2026-10-01).** He was shown three ways
to draw wind on the chain map and picked the badge pinned to the canvas corner.
What governs it is what the DATA is, and the rules below are the reason the
other two options lost:

- **ONE FORECAST FOR THE WHOLE CHAIN.** It is a single National Weather Service
  reading for the property's grid square. **Nothing wind-related may be drawn on
  the water** — a field of arrows over the lakes is the convention for data that
  varies across space, and this does not vary; it would be the same number drawn
  six times. `ui-wind.mjs` asserts the negative directly: no wind marks among the
  Leaflet panes.
- **THE SPEED STRING IS PRINTED WHOLE.** NWS issues "5 to 10 mph" as often as
  "10 mph". Reducing a range to one number invents precision, so the badge
  prints what the forecast says, verbatim.
- **THE ARROW IS A 16-POINT SECTOR AND NOTHING FINER**, because that is all
  `windDirection` carries. Rotation is the bearing **plus 180** — a wind
  direction says where the wind comes FROM and an arrow shows where it goes —
  wrapped to 0–359 so the value can be read at a glance.
- **AN UNRECOGNISED DIRECTION DRAWS NO ARROW.** The speed still shows. Same
  rule as everywhere else here: an absent field is absent, never guessed at.
- **THE SOURCE IS VISIBLE ON THE BADGE.** Every other reading in this module
  names its source beside it; a number without provenance is the one thing this
  module does not ship. It is the longest line on the badge and the one piece of
  this that was a judgement call — flagged to Rob rather than decided silently.

**THE PARTS ARE CAPTURED AT THE SOURCE, NEVER PARSED BACK OUT.**
`Water_Live::$wind_parts` is filled in `fetch_nws()` where the API hands over
`windDirection` and `windSpeed` separately, and rides the cached conditions
payload out through `/conditions`. "NE 5 to 10 mph" is a sentence this codebase
wrote; reading a direction back out of it would be guessing at our own
formatting. A payload cached before 1.35.0 has no wind block, so the badge
simply does not draw until that cache turns over — `?? null` all the way down.

**NOTHING LOADS ANY EARLIER.** The badge is drawn from a reading the page is
already holding (it is what fills the Map tab's Wind tile), so the map costs no
extra request and the 1.31.0 rule is untouched.

**IT TAKES NO POINTER EVENTS** — a guest panning from the corner must pan the
map — and it is anchored to `.dccwl-sheet-body-map`, which gained
`position: relative` for the purpose. Without that it resolved against the whole
sheet and landed **in the header, over the title**: "pinned to the map corner"
is a claim about the canvas, and the suite checks it against the canvas's own
rectangle.

### The "By Month" baseline: it was a font-size, two levels up

Rob measured 0.9px on live with real Raleway (1643.6 against 1644.5) and asked
for the cause rather than a nudge. **It is not padding, line-height,
vertical-align or the button's appearance** — the four the hint named, and all
four were ruled out by diffing every computed property along both label chains:

**The LABEL is identical in both places** — same family, size, weight,
line-height — which is why every test asserting label typography passed while
the baselines differed. What differs is the WRAPPER it sits in:
`.dccwl-fullguide-text` inherits **17.5px inside a `<summary>` and 15.6px inside
the `<button>`**, because the two elements carry different font sizes of their
own. The wrapper is the flex item being centred in the 44px box, so its line box
— 21px against 18.72px — is what positions the label. **(21 − 18.72) / 2 = 1.14,
and the sandbox measured 1.5 with its fallback face; Rob measured 0.9 with
Raleway. Same cause, different metrics.**

Pinning `line-height` could never have fixed it: **1.2 of two different font
sizes is two different line boxes.** The wrapper now declares
`--dccwl-fs-xs`, the size the row's own labels already use, and the spread is
**0.00 at 320, 360, 375, 390 and 1280px**, one line at every one.

Three wrong turns before the diff, each worth remembering:

- **Aligning the row to baseline** — already tried and rejected in 1.28.0,
  where it put the 44px button 2px low. The note saying so was in the stylesheet.
- **Sizing the chevron** — wrong and briefly harmful: this row hides the chevron
  on purpose, so the rule un-hid it and wrapped the row onto two lines at 320px
  and 360px. A fix aimed at one pixel cost a wrapped row.
- **Using `--dccwl-fs-base` for the wrapper** — equalises the baselines just as
  well and put "About" on a second line at three widths, because it is larger
  than the labels. The right size was the one the labels themselves declare.

**The method is the lesson: diff the computed styles of the two things that
disagree, rather than reasoning about which property it ought to be.** Four
attempts guessed; the first diff found it in one pass.

### 1.35.1 — the badge's source line, shortened

Rob's call on the 1.35.0 badge: the visible source reads **"NWS forecast"**, and
the full **"National Weather Service forecast"** stays as the screen-reader
label. The badge went from 59% of the map's width on a phone to **34%**.

**THE SHORT FORM TRAVELS WITH THE READING, it is not an abbreviation the client
invents.** `Water_Live::$wind_parts` carries `sourceShort` beside `source`, both
set where the NWS branch builds them. A client that shortened "National Weather
Service forecast" itself would hand the next source — whatever that turned out
to be — a name nobody chose for it. The badge prints `sourceShort || source`, so
a payload cached by 1.35.0 shows the long name rather than nothing, and
`ui-wind.mjs` pins that fallback by name.

The aria-label gained the source as a third placeholder, so the full attribution
is what a screen reader hears whatever the badge shows.

### 20. 1.36.0 — the blur comes out, and eight fixes from Rob's 2026-10-02 list

**THE BLUR IS GONE FROM EVERY WILDLIFE ELEMENT, AND IT MUST NOT COME BACK.**
/explore/ carried **451 elements with `backdrop-filter: blur(10px)`** — 409 of
them species tiles — and Rob's Windows PC re-composited every one on every
scrolled frame. On a near-white surface over a white page **the blur was
invisible**: it cost frames and bought nothing.

- Every `backdrop-filter` declaration is deleted from all four stylesheets.
- `--dccwl-glass-blur` is **deleted as a token**, deliberately: a token that
  still existed would be an invitation to set it again.
- `.dccwl-glass-yes` is gone from `Render::app_classes()`. It carried one
  declaration — the blur — and a class that now selects nothing is a setting
  that does nothing, which this plugin does not keep.
- **The surfaces are solid, and the pixels did not move.**
  `rgba(255,255,255,.92)` composited over the page ground `#f4f7fa` *is*
  `#fefeff`; `.98` is `#ffffff`. Those are the values now. Keep them opaque —
  the always-light rule depends on these surfaces not letting a host or OS
  theme through.

**MEASURED AS A CONTROLLED A/B, NOT AS TWO RUNS.** One page, the blur
re-applied at runtime to recreate 1.35.1 exactly, three interleaved reps per
condition, CPU throttled 4×, scrolling 120 frames of 90px:

| width | with blur | without | change |
|---|---|---|---|
| 1680px | 2356 ms, 21 frames over 20ms | 2070 ms, 5 over 20ms | −12.1% |
| 390px | 2293 ms, 18 over 20ms | 2159 ms, 10 over 20ms | −5.8% |

**This sandbox composites in SOFTWARE and the real gain is probably larger**,
because backdrop-filter is exactly what a GPU pipeline handles differently.
Say so when quoting these numbers; the honest hard figure is 308 → 0
re-composited elements per frame in the fixture.

**WHAT ELSE COSTS FRAMES, named but not touched.** The species page is
**159,305px tall with 9,361 nodes** at 402 species — that is now the dominant
cost, and it is the crawlable prose guide Rob chose to keep. 308 tiles
transition `box-shadow`, `border-color` and `background` on HOVER, which is
repaint-heavy but never fires while scrolling. 413 images, all lazy.

**AND ONE FALSE ALARM WORTH REMEMBERING:** a first pass found "7,395 elements
with `transition-property: all`" and nearly reported it. `all` is that
property's INITIAL VALUE; with `transition-duration: 0s` it costs nothing. The
number that means something is the duration, and by that measure 648 elements
animate anything at all. **Measure the property that does the work, not the
one with the alarming name.**

### The Back bar overlap was a 1.34.0 regression, and the mechanism is the lesson

Rob photographed the level bar covering half the months row at 1680px. The
cause: the rule added in 1.34.0 to give the absolutely-centred crumb a
containing block declared `.dccwl-canal .dccwl-levelbar { position: relative }`
— **same specificity as the bar's own block and later in the file, so it
replaced `position: sticky`** — while the bar kept
`top: var(--dccwl-sticky-offset)`. On a theme with a sticky header that token
is 60–80px, and **`top` on a RELATIVE element shifts it down without reserving
the space**, so it landed on whatever followed.

A sticky element is already a containing block for its absolute children, so
the crumb never needed that rule. `position` now lives in exactly one place.
`ui-chrome.mjs` pins it **with a non-zero `--dccwl-sticky-offset`**, because
with the token at 0 the bug is invisible — the test that would have caught this
is the one that sets the offset first.

### The rest of his list

- **The season bar is centred**, and it was off by 490px at 1280px because it
  stayed `inline-flex` (its `display: flex` lost to `.dccwl-app .dccwl-tabs
  .dccwl-tabs` at (0,3,0)) and its parent computes `text-align: left`. A
  block-level flex that centres its own children does not care what the
  parent's alignment is.
- **A map popup closes on a tap anywhere outside it.** Leaflet's
  `closePopupOnClick` only hears clicks on the MAP, so the control bar, the
  legend, the sheet and the page behind it all left it open. The document-level
  listener skips `.leaflet-interactive` (or it would close the popup on the
  click that opened it) and removes itself once its canvas is gone, because the
  sheet empties its body on close.
- **SELECTED IS CORAL WITH WHITE TEXT (REVERSES 1.34.0's dark ink), and the
  month pill joins it.** Rob chose white knowing it measures 2.59:1 — below AA
  at every size — and ruled that **the coral must not be deepened**. Same call,
  same reason, as coral hover in 1.33.0 answer 2: three plugins disagreeing
  about a pressed button is worse to him than the number. If contrast is ever
  raised it happens SITE-WIDE, never in Wildlife alone.
- **The search placeholder clears on focus**, by colour rather than by
  emptying `content`, so nothing reflows.
- **The species photo shows whole.** It was a 240px box with `object-fit:
  cover`, which on a 2:3 frame showed a band of the bottom. Now `height: auto`,
  `object-fit: contain`, capped at 70vh (60vh on a phone) so a portrait cannot
  push the text off screen.
- **The sheet's content clears its edges**: 20px sides (already
  `--dccwl-detail-pad-x`) and **24px at the foot**, the Availability Calendar's
  1.25em / 1.5em. The photo stays INSET like everything else rather than
  full-bleed — the status quo, and it satisfies "nothing touches the edges"
  without introducing a treatment Rob has not seen.
- **The sheet has an × at the top right** — 46px circle, `#E7EEF7`, a `#0A50B2`
  cross drawn at 30px with stroke-width 2.75, **no shadow and no transition**
  (both are part of the Availability Calendar's spec, not oversights), a
  `:focus-visible` ring, and the accessible name **"Close"** — its own label,
  not the caller's "Close details", because the × does one thing whatever the
  sheet is showing. The ‹ on the left is unchanged.

### 21. 1.37.0 — eleven from Rob's iPhone review (2026-10-03)

**THE SUB-GROUP COLUMN BREAK IS GONE, AND ITS COST IS RECORDED.** From 1.33.0
a browse group's first tile carried `grid-row: 1`, which makes the sparse
auto-placement algorithm skip to the next free column so the group began
top-left of its own. The documented price was "a blank cell or two". **Measured
at 390px it was worse**: browsing Animals left 4 short columns, and a search of
the Safety list produced columns of `[3,1,1,1,3,…]` — single tiles stranded
mid-list with two empty cells under each, which is what Rob photographed.

His instruction is unconditional — the tiles fill the columns in order — so the
rule is deleted. **What that costs:** a chip's first tile is no longer
guaranteed to be top-left. "Press Mammals, see a mammal" still holds, because
`jumpTo()` aligns the column CONTAINING the target, but the target may be the
second or third tile in it. That trade is the owner's, made with the numbers.
After the change a sweep of 13 grid states (every chip, three searches) reports
**zero short columns and ≤2px of deck slack**.

**The Director's "blank area several screens tall" did not reproduce here**, at
390px, in any of those 13 states. The empty cells the column break produced are
the most plausible cause and they are gone; say so plainly rather than claiming
the blank is fixed, and have it re-checked on his phone.

**ITEM 4 — THE MAP CREDIT IS AN ⓘ, AND EACH PROVIDER'S RULE IS KEPT.**

- **Leaflet still renders the credit.** Its attribution control holds each
  provider's markup and links; this plugin never builds that string, never
  inserts it as HTML, and so cannot drop a link a licence requires. Only its
  visibility changed. `setPrefix(false)` drops Leaflet's own logo and flag,
  which are optional and are nobody's credit.
- **Esri** (satellite, the default) allows a credit behind a button **if** it
  is discoverable and never covered — hence the ⓘ, bottom-right, at z-index
  1200, and the popup above it at 1300. Its terms also require the words
  **"Powered by Esri"**, which the default string now carries; a site that
  stored the old string is repaired in `Water_Data::upgrade()`, **exact match
  only**, so an owner's own wording is never overwritten.
- **OpenStreetMap** (chosen, or the automatic fallback) allows a collapsed
  credit only if it **shows first and then collapses** on the first pan, zoom
  or tap, or after five seconds. `openForOsm()` does that on every arrival at
  that layer, including the fallback.
- `buildBaseLayers`'s `onChange` became a **list of listeners**: it was a
  single slot, and the credit rule would have silently replaced the Layers
  radio rows' callback.

**ITEM 3 — A POPUP OUTRANKS EVERYTHING IN THE SHEET.** Leaflet's popup pane is
700 inside the map's own stacking context; the bar and the wind badge are ours
at 1100, so ours won. The pane is now 1300. The suite does not read z-index —
it asks `elementFromPoint` at three points down an open popup, because the
question is what a tap would hit.

**ITEM 6 — the search text centres on the BAR.** The magnifier and the clear
button were flex items, so the input's box started after the icon and ended
before the button; `text-align: center` then centred the placeholder inside
that box. Both controls are positioned now, the input carries equal 40px
padding, and the field's own padding went from `0 4px 0 14px` to `0 4px` —
**measured off-centre by 5px until that last change**.

**ITEM 7 — a fade means "there is more this way".** The chip row carried a
permanent right-hand mask and dropped it at the end: it faded the right even
when everything fitted and never faded the left. It now uses the months bar's
own `attachEdgeFades`, so each edge is cued only when something is behind it.

**ITEM 8 — the selected state is white in EVERY state.** On a phone a button
keeps `:focus` after a tap and a focus rule was repainting the label dark until
the guest touched something else. Hover, focus, focus-visible and active are
all listed now.

**Also:** tab labels are semibold (weight only — the size is Rob's "stays as it
is"); the Map stat tiles are one per row on a phone and three across from
700px, with the reading at tile-name size, the source at 0.65rem, and
`word-break: normal` so "September" cannot split again; Enter/Go applies the
query and **blurs the field**, which is the only handle on the browser's
suggestion list and the keyboard; the photo credit centres; and the pager
counter reads at body size.

**Every weight in these rules is declared.** The site serves
`html{font-weight:700}`, so an undeclared weight inherits bold — the 1.27.0
lesson, still the trap.

### 22. 1.37.1 — a deck's rows follow its matches

**THE DIRECTOR WAS RIGHT AND THE CAUSE WAS A POLICY, NOT A BUG.** 1.37.0
removed the sub-group column break and that was not the whole of item 9. On a
fresh load at 390px, a search for "snake" shows TWO decks: the guide deck (15
matches) and the Safety deck (3 — Eastern Diamondback, Dusky Pygmy
Rattlesnake, Eastern Coral Snake). The Safety deck had three rows and three
matches, so it filled one column and left the other empty. **Three items in
three rows IS one column**; the grid did exactly what it was told. What was
wrong is that the row count never looked at how many matches there were.

`fitRows()` in deck.js now sets `--dccwl-deck-rows` to
`ceil(visible / columns that fit)`, capped at the stylesheet's own count and
never below one. Three matches across two columns is two rows — `[2, 1]` —
and the right column is in use. **Rob's ruling stands and is recorded: NO
GAPS. A tapped chip's first tile only has to be on screen, not top-left.**

**THE FIRST VERSION OF THIS CACHED THE BASE ROW COUNT AND WAS WRONG TWICE.**
The first refresh can run while the panel is still hidden, where the grid
reports whatever it likes — the main deck came back with a base of 2 where the
stylesheet says 3, and quietly lost a row. A cached number would also survive a
breakpoint change that was meant to alter it. The count is now re-read on every
call **with our own override removed first**, and nothing is cached: explicit
tracks are reported even when empty, so that reading is the stylesheet's own
answer. The width guards are what keep it from reading an unlaid element.

**DESKTOP IS UNCHANGED AND THAT IS NOT AN OVERSIGHT.** At ≥700px
`grid-template-rows: repeat(2, auto)` is a literal in the media query, not the
variable, so three matches read as 2 + 1 there whatever the phone does. Left
alone deliberately — "change nothing else" — and put to Rob with the options.

**The repro is a test now** (`ui-chrome.mjs`): fresh load, 390px, Wildlife,
type "snake". It asserts both decks appear, that any deck with ≥2 tiles on a
viewport fitting ≥2 columns uses ≥2 columns, and that the Safety deck is
specifically `[2, 1]` holding the three snakes he photographed.

**Two choices went to Rob rather than being made here:** how a few-match deck
should read (rows-follow-matches, wrap-like-a-grid, or one sideways row — the
shipped one fills downwards, so three matches read left-to-right as
Diamondback, Coral, Dusky), and whether the Safety deck should carry a heading
during a search, where today it has none.

### 23. 1.37.2 — a deck with nothing to scroll is an ordinary grid (Rob's pick B)

**His answer to the question 1.37.1 left open, chosen 2026-10-03.** When every
match already fits on screen, the deck stops being a deck: the tiles wrap as a
plain grid in **reading order — left to right, top to bottom** — and the
sideways scroll, the snap and the pager stand down with it. When the matches do
not fit, nothing changes: it is the swipe deck it has always been, with the
1.37.1 rule that its rows follow its matches so no column is left empty.

This settles the oddity option A carried. Three snakes now read **Eastern
Diamondback, Dusky Pygmy Rattlesnake, Eastern Coral Snake** — the order of the
list — where the column-major deck read Diamondback, Coral, Dusky.

- **The switch is a measurement, not a width**: `items.length <= fits * base`,
  where `fits` is the columns that fit and `base` the stylesheet's row count.
  No breakpoint is involved, so it holds at 320, 390, 768 and 1280 alike, and a
  longer species name that changes how many fit changes the answer with it.
- **The pager needed no special case.** `refresh()` already hides the nav when
  the list does not overflow, and a wrapped grid never does.
- **`--dccwl-deck-cols` is set to `fits`, not to a literal 2.** On a phone that
  IS two, which is what Rob asked for; on a desktop it keeps the tile size the
  deck already had instead of stretching four tiles across six columns' worth
  of room.
- **Both overrides come off before measuring**, the 1.37.1 lesson: read the
  stylesheet's own answer, never your own from last time.

**The Safety deck gets NO label during a search (L0, his pick).** The red
danger mark on each tile is what says these are hazards. Do not add a heading
there without asking him again.

### 24. 1.38.0 — three live failures, and the picker that replaces the chip row

**WHY THIS RELEASE EXISTS, IN ROB'S WORDS: "in 1.37.x your suites passed but
items 2, 3 and 8 failed on live."** Two of the three causes were mine, one was
a misunderstanding of how stacking contexts work, and all three had a green
suite standing over them. The harness doctrine gains its fourth rule, and the
new suite is the enforcement:

- a suite that asserts nothing fails;
- a stub more permissive than the real thing agrees with you;
- a suite must exercise the path production takes;
- **and now: a state that only exists after a real tap must be tested with a
  real tap, on the real stylesheets, at the real width.**

**`tools/tests/ui-live.mjs` IS THAT SUITE, AND ITS THREE CONDITIONS ARE THE
POINT.** Every assertion in it runs on the rendered page with the host kit's
20px/700 root, at **390px with `hasTouch`/`isMobile` and `page.tap()`** and at
**1280px with the touch emulation OFF**. `buildPage` gained a `touch` option
for the second of those: every page this harness had ever built was a touch
page at every width, so no suite could tell a phone from a desktop, and the
state item 8 failed in — a button that keeps `:hover` and `:focus` after a tap —
was not reachable from here at all. The default stays touch, so nothing written
before this release changed behaviour.

A plain statement about the stand-in, because it matters when reading a green
run: `sitekit.css` is **this repo's reproduction** of the deployment theme's
resets and root, not a copy of the live file. It carries the traps that have
actually bitten us. It is not the live theme, and a green run here is evidence,
not proof — which is why the Director still checks on the phone.

**ITEM 2's CAUSE WAS A WRITE THAT NEVER HAPPENED.** The 1.37.0 edit script made
three replacements in `water.css`, asserted on the third, aborted before
writing anything, and only the failed replacement was re-run — so the
one-tile-per-row rule and the reading's font size were never in the file that
shipped, while the third edit was. **An edit script that asserts after writing
is a different thing from one that asserts before**, and a partially applied
batch is invisible afterwards: the file is syntactically fine and the release
notes describe work that is not there. Re-applied, with the breakpoint at the
768px Rob named, and now measured on the rendered panel at 390/767/768/1280
including a per-word check that nothing breaks mid-word.

**ITEM 3's CAUSE WAS A STACKING CONTEXT, AND RAISING THE POPUP COULD NOT WORK.**
`.leaflet-popup-pane` lives inside Leaflet's map pane at `z-index: 400`, which
creates a stacking context, so **a child cannot climb past its parent relative
to the parent's outside siblings whatever number it carries.** 1.37.0 set the
pane to 1300 and the suite agreed with it; our chrome at 1100 still won,
because the comparison was 400 against 1100. The fix lowers OUR chrome while a
popup is open (`.dccwl-popup-open` on the canvas and on the map sheet body,
dropping the credit button, the wind badge, the map bar and Leaflet's own
control corners to 1), and restores it on close. **Never "fix" a z-index
without finding out which stacking context each number is measured in.**

The popup is also kept inside the map with ≥12px margins (`autoPan`,
`autoPanPadding`, `keepInView`) and capped so it scrolls internally rather than
growing past the canvas. 1.36.0's outside-tap close is unchanged. Everything
here is asserted with `elementFromPoint` at the popup's title row, its centre
and its last line — "what would a tap hit", never "is it visible".

**ITEM 8's CAUSE WAS A RULE 1.36.0 DID NOT FINISH.** The resting selected rule
became white in 1.36.0; the `:hover/:focus/:focus-visible/:active` block kept
`color: var(--dccwl-text)`. With a mouse that is invisible — the pointer leaves
and the label repaints. **On a phone a tapped button keeps `:hover` AND
`:focus` until the guest touches something else**, so the label stayed dark
exactly where Rob was looking. Every selected control is now white in every
state, and the suite taps each one and reads it WITHOUT moving away: the
section tabs, the month pills, the water tab bar, the Compact switch and the
picker's chosen option.

### The picker: one pill that FILTERS (Rob's C, 2026-10-04)

The sideways-scrolling category row, its ‹ › arrows and its edge fades are
gone, replaced by **"Show: All ▾"** — a button opening a list beneath it,
modelled on the Layers ▾ control in his own Croatia map.

- **IT FILTERS. THAT REVERSES THE 1.31.0 RULE** that a browse sub-group is
  navigation and never a filter — reversed by the owner, who asked for exactly
  this after living with the chips. The 1.28.0 lesson behind the old rule still
  stands and is answered differently: **a filter must never be invisible**, and
  this one says what it is doing in its own label, every time.
- Choosing a category restarts the pager at its first page; the 1.37.1 rows-
  follow-matches and 1.37.2 wrap-when-everything-fits rules are untouched.
- **Switching section resets to All**, and **a search sets the filter aside and
  restores it when the search is cleared** — while searching, the pill reads
  "Show: All" so it never claims to be filtering when it is not.
- Counts are per tab and are rendered in the HTML, not built by script, so they
  are in the page for a crawler and for a guest whose JavaScript has not
  arrived. ui-deck.mjs asserts that each printed count matches what choosing it
  actually shows, and that the categories between them account for every animal.
- Accessible as a listbox: `aria-expanded`, `aria-haspopup`, `aria-selected`,
  arrow/Home/End keys, Escape and an outside tap close it, and focus returns to
  the pill. Every row is a 44px target.
- **The month bar keeps its arrows and its edge fades.** Only the category row
  lost them.

**"Jump to a species…" IS REMOVED, AND SO IS ITS SETTING.** Gone: the `<select>`
and its markup, `show_jump` from the Guide_Data schema and the admin page (the
key is left in the defaults with a RETIRED comment, because deleting it would
change a stored row), the `ov_jump` override on BOTH Elementor widgets, and
every `'jump' =>` gate in the renderers. The search box reaches every species by
common or scientific name, which is what the list was for.

**DEAD CSS WAS DELETED WITH IT, AND THAT IS WHERE THE LAST BUG CAME FROM.** The
`.dccwl-subchips`, `.dccwl-subchip`, `.dccwl-jump*` and `.dccwl-subchips-nav`
rules went, along with the stale `.dccwl-subnav { flex-direction: column }`
block — **and that block is why the pill and the Compact switch stacked instead
of sharing a row at every width.** A later rule of the same specificity
overrides only the properties it NAMES, so the new row's `display`,
`flex-wrap`, `gap` and `justify-content` all applied while the old column
direction survived underneath them. The row now states `flex-direction: row`
explicitly, with that reason written beside it. Same family as the live
failures: the rule was there, it just was not what was in force.

**AND ONE MORE LOST 1.37.0 EDIT, FOUND BY MEASURING RATHER THAN READING.**
`.dccwl-deck-status` carried a comment promising item 11's "body size" over a
declaration setting `--dccwl-fs-sm` (17.5px on the deployment root, where body
is 21.25px), plus a duplicated `font-weight`. Corrected to `--dccwl-fs-base`,
because the comment is Rob's instruction and the declaration was not.

**THREE SUITES ENCODED CONTROLS THAT NO LONGER EXIST**, and as with the plant
batch the fix was to pin the intended state, never to loosen the check:
test-elementor.php's override list drops `ov_jump`, test-guide-settings.php's
marker table swaps the chip row for `data-dccwl-pick` and drops the jump row,
ui-deck.mjs's two chip/jump sections are REPLACED by picker sections keeping
what those sections really guarded (every category points at a real run; the
runs account for the whole section), and ui-theme.mjs stops asking a drop-down
row to look like a chip and checks the pill and its options on their own terms.
What is deliberately NOT carried over: "a chip records a choice, not a
position", and "the deck scrolls as far toward the group as it can". The picker
hides the rest of the section instead of scrolling past it, so there is nothing
to scroll toward.

**The screenshot script is `tools/shots-1380.mjs`, and it lives OUTSIDE
`tools/tests/` on purpose** — it asserts nothing, and anything matching
`ui-*.mjs` in that directory is run as a suite and would fail (correctly) for
asserting nothing.

### 25. 1.38.1 — three things the full specification caught that 1.38.0 had wrong

1.38.0 was built from a summary of Rob's brief; the brief itself arrived
complete afterwards, and reading the two side by side found three
disagreements. All three are recorded because each is a different way to be
wrong.

**THE PAGER COUNTER IS 17.5px, AND 1.38.0 "CORRECTED" IT TO 21.25px.**
`.dccwl-deck-status` carried `--dccwl-fs-sm` under a comment saying "body
size", and 1.38.0 changed the declaration to match the comment. His
specification says, in his own figures, **"11 pager counter 17.5px"**, and
lists it among the items that are WORKING on live and must not regress. The
comment was a paraphrase; the declaration was the instruction. **Measure
against what was asked, never against a previous summary of it** — the summary
is the thing most likely to have drifted. The real defect in that rule, a
duplicated `font-weight`, is still gone.

**PEAK NOW HAD NO TOOLBAR ROW AT ALL, UNDER A COMMENT SAYING IT DID.** The
brief: *"Peak Now has no categories, so no pill (the Compact switch sits alone
on that row)."* The code read `sub.hidden = peaking || …` — the row was hidden
on that tab — while the comment above it described exactly the behaviour Rob
asked for. A comment is not a test, and this one had been true of an intention
rather than of the code since it was written.

Peak Now spans every section and shows two or three decks at once, so:
- the row shown is the one belonging to the **first section still on screen**,
  decided per refresh because which sections have anything at peak changes
  with the month;
- the pill is hidden on it (`nav.dccwlPeakMode`), since there are no categories
  to offer across a filter that crosses sections;
- **the switch applies to every visible deck** (`nav.dccwlApplyView`, published
  for this). One switch governing one of three decks would leave the others in
  photo cards under a control reading "Photos" — a control disagreeing with
  itself.

**THE SAFETY TAB OFFERED "All 49" OVER A LIST OF 28.** The counts loop used
`''` as both the key for the total and the key for a species with no browse
slug, so every slug-less species was counted twice. Animals and Plants were
right by accident — every one of their members has a slug — and Safety has 21
that do not. **A count beside a category is a promise about what choosing it
shows**, so the total is tallied separately now, and `ui-live.mjs` asserts per
tab that "All" equals the tiles the tab actually renders.

**WHAT THE LIVE SUITE GAINED WITH THEM** (270 assertions now, still at 390px
with real taps and 1280px with a mouse): the per-tab category lists asserted
against Rob's own strings and order, Peak Now's row shape and its cross-deck
switch, search by **scientific name** (`Ardea hero` → Great Blue Heron,
`guarauna` → Limpkin) standing in for the Jump list that was removed, the
water tab bar's weight, the ⓘ credit (its "Map credits" name, Esri's required
wording, the OpenStreetMap show-then-collapse rule proved with a real tap), and
**the Director's sweep: every tab crossed with every one of its categories at
390px**, asserting no deck leaves a column empty — the state 1.37.1's and
1.37.2's rules now have to hold in, since a category is a filter.

**TWO FIXTURE LESSONS, BOTH OF WHICH FIRST LOOKED LIKE BUGS IN THE PLUGIN:**

- **Serve what the code actually requests.** Esri's tile URL ends `/{z}/{y}/{x}`
  with no extension, so a route matching only PNG names left every satellite
  tile failing — and this plugin degrades honestly, switching to OpenStreetMap
  after five misses. The suite then "found" that a map it believed was Esri
  credited OpenStreetMap. The fixture was wrong, not the map.
- **An open menu over the attribution is the rule working, not a breach.** The
  tap that closes a popup lands on the control bar, and at 390px that bar is
  the two-menu shape, so it can OPEN a menu — which is meant to paint over the
  attribution (1.33.0, item 9). The suite now closes anything open before
  asking what covers the credit.

And one more of the repository's oldest traps, hit again while writing that
first lesson: **a block comment containing a glob with a star-slash in it ends
the comment early.** Reworded, as in 1.26.0.

### 26. 1.39.0 — feet, two-line tiles, and a rule in the wrong stylesheet

**EVERY MAP POPUP READS IN FEET, CONVERTED ON THE SERVER.** A popup said
"1.1 m (median 1)" for the lake whose Map tile said "3.6 ft" — the same water,
twice, in two languages. The Atlas publishes Secchi in whatever unit the
station uses, so:

- `Water_Live::to_feet()` is the ONE conversion, beside the rest of this
  module's arithmetic (the level deviation has always been computed in PHP).
  The map payload carries `ft` and `medianFt` alongside the source's own
  `value` and `units`, which are left exactly as published.
- **An unrecognised unit converts to nothing.** `to_feet()` knows metres and
  feet — the two the Atlas has ever returned — and returns null for anything
  else; the client then prints the reading as the source gave it. A guessed
  unit is a wrong number with a confident label, which is the one thing this
  module refuses.
- **A reading already in feet comes through unchanged**, to two decimals. The
  tile prints the Atlas's own "2.95 ft", and a popup rounding that to "3 ft"
  beside it would be the same mismatch in a smaller font.
- A payload cached before this release has no `ft`, so the popup falls back to
  the published value and unit rather than going blank — the fallback
  `sourceShort` has kept since 1.35.1.
- The median is NAMED now ("usual: 3.3 ft"), not labelled "median", and the
  row labels are capitalised ("Sampled:"). The date format is untouched.

**A FACT STATES ITS OWN SHORT READING AND QUALIFIER.** The Map tile prints the
reading large and the qualifier small: "3 in. below normal" over "for
September". `Water_Fact` gained optional `short` and `detail`, set by the
builder that COMPOSES the sentence — presentation metadata exactly like `key`,
never a gate, and unable to admit an unsourced fact (the suite asserts that
directly). **The browser never splits a composed sentence**: that would be the
client guessing at this codebase's own wording, which is what the wind parts
avoided in 1.35.0. A fact with no parts — an owner-entered almanac row — falls
back to the whole value, which is what the tile always showed.

The Now card is untouched and still prints the full sentence. `:empty` on the
qualifier line matters: the wind forecast has no qualifier and must not hold a
blank line open.

**THE DIRECTOR'S QUESTION, ANSWERED BY DRIVING THE CASE HE COULD NOT.** His
browser is headless, where Leaflet's autoPan never runs, so "does a popup near
an edge pan fully into view?" was untested. `ui-live.mjs` now pans the map
until a water sits 30px below the canvas top, taps its marker, **waits for the
pan to stop moving** rather than guessing a duration, and then measures.
Result at both widths: **12px clear on the top and left, title on screen and
tappable** — the autoPanPadding doing exactly what it was set to do.

**THE DOUBLE DISCLOSURE MARKER WAS A RULE IN THE WRONG STYLESHEET.** The
standalone water widget's "About the water…" fold showed the browser's ▶ AND
our ⌄. The suppression (`list-style: none`, `::-webkit-details-marker`,
`::marker`) lived in **widget.css**, which that widget does not enqueue — it
loads app.css and water.css. **A rule in the wrong stylesheet is invisible on
the surface that loads the other one**, and this is the second defect of that
exact shape (the first was the deck layout scoped to `.dccwl-tiles` in
1.23.0). It lives in app.css now, the layer both stylesheets depend on, scoped
to `.dccwl-fullguide-summary` rather than to `summary` so a fold the THEME
renders keeps its own marker.

**`tools/tests/test-water-parts.php` IS THE NEW SUITE**, and it drives the REAL
parsers from stubbed Atlas payloads rather than hand-built Facts — the 1.33.1
rule that a suite must exercise the path production takes. Two fixture notes
worth keeping: a station component with **no coordinates is deliberately not
pinned**, so a station assertion needs them or it is testing the fixture; and
a Secchi reading within its median's silent band produces **no** comparison,
because "only speak when it matters" is a rule of this module — a fixture at
1.10 against 1.00 would have asserted that the qualifier was missing.

### 27. 1.39.1 — the timestamp shape no fixture had, and the rule it reinstates

**MAP POPUPS PRINTED RAW TIMESTAMPS ON LIVE FOR THREE RELEASES.** The Director
photographed `Sampled: 2026-07-27T04:00:00.0000000Z` and
`Level: 3 in below its monthly norm — 2026-09-22T04:00:00.0000000Z`. The live
`/map` payload carries ISO 8601 with a **seven-digit fraction and a Z**, thirty
of them on the day it was found, and **every fixture in this repository used
plain `2026-08-01` dates** — so the one shape that breaks was the one shape
never tested. That is the whole lesson: *a hand-written fixture can only
confirm what its author already believed.*

**`Water_Live::us_date()` IS THE FORMATTER, AND EACH OF ITS BRANCHES IS A TRAP
THAT WAS CHECKED AGAINST PHP RATHER THAN ASSUMED:**

- **The seven-digit fraction parses.** PHP's own parser accepts it; no
  truncation is needed. What it throws on is garbage, and that prints nothing.
- **A timestamp is converted; a DATE is not.** The source writes local midnight
  as `T04:00Z` in summer and `T05:00Z` in winter, so a timestamp must be read
  in `America/New_York` or it prints the previous day. But run a date-only
  `2026-08-01` through the same conversion and it becomes **07/31/2026** —
  the 1.7.x rule ("date-only values are read in the SOURCE's frame, never
  converted") broken in a new place. The two take different paths.
- **An empty string is not "today".** `new DateTimeImmutable('')` returns the
  current time, so an absent date would have rendered as this morning,
  confidently. It is rejected before parsing.
- A bare year or year-month is left alone: readable already, no day in it.
- The pass is **idempotent**, because it runs over payloads that may have been
  through it.

**IT IS APPLIED AT THE OUTPUT GATE, NOT IN THE GENERATOR, AND THAT IS THE
UPGRADE STORY.** A site moving to 1.39.1 holds a payload cached by 1.39.0,
full of raw timestamps, which may live another three hours. `map_payload()`
formats what it reads from the cache as well as what it builds, so **no guest
can see one whatever the cache's age** — no flush, no upgrade step, nothing to
get wrong. `map_data()` stays the generator, untouched, and the `age` fields
stay raw-derived because the map's greying reads them.

**AND A LAST GUARD IN THE CLIENT.** `dateText()` in water-map.js refuses any
string still carrying the ISO shape and prints nothing. The server already
formats; this is what stops the defect coming back quietly through a route
that bypasses the gate. The suite proves it by feeding the client exactly what
1.39.0 served and asserting the popup renders without the timestamp.

**THE FIXTURE IS BUILT BY PHP NOW, NOT BY HAND.** `render-fixture.php map`
stubs an Atlas response carrying the live timestamps — a summer `T04:00Z` and
a winter `T05:00Z` — runs it through `Water_Live::map_payload()`, and serves
it **the way `Water_Rest::map()` does, with `enabled` set**. (Without that flag
the client draws nothing and the suite tests an empty sheet; that cost a cycle
here.) `ui-live.mjs` then asserts the RENDERED popup text at 390 and 1280:
`07/27/2026` in summer, `01/15/2026` in winter, no `T`, no `0000000Z`, and
never the previous day.

### Raw dates elsewhere — REPORTED, NOT CHANGED (Rob's instruction)

Two places could print machine text, neither of them reachable with today's
data. Left exactly as they are:

1. **`Water_Render`'s server-rendered fact card** prints `$f['date']`
   verbatim after its label. The facts that reach it are the owner's almanac
   rows, which carry plain dates — but `Water_Fact::valid_date()` accepts a
   full ISO timestamp, so one typed into the admin form would render raw.
2. **`water.js readingTime()`** falls back to `String(iso)` when a date will
   not parse, and to `d.toISOString()` if `toLocaleString` throws. Every live
   date parses today, so the Now tab shows "Jul 27, 2026" as intended.

**The tiles' "sampled September 2026" wording is deliberate and untouched.**

### 28. 1.40.0 — one date format, and a rule written for the wrong parent (again)

**ONE FORMAT FOR THE WHOLE WATER MODULE (Rob, 2026-10-06).** Every date a
guest sees reads **07/27/2026**: the map popups (1.39.1), the Now tab's
reading times, and the almanac and fact cards. The tiles' "sampled September
2026" stays — it is a MONTH, not a date, and he said so explicitly.

The two guards 1.39.1 reported are closed, and both by the same move:
**compute the text once, on the server, and send it.**

- `Water_Live::us_datetime()` builds on `us_date()` and adds the clock only
  where `date_precision` is `minute` — a forecast issued at 4am and a lab
  sample taken on a day are different claims, and that field is how this
  module has always said which it holds. A declared minute with no time in the
  value invents none.
- `Water_Fact::to_array()` carries `dateText` beside the raw `date`. The raw
  instant stays because the **age chip is a duration** and has to measure from
  the real moment.
- `Water_Render`'s server-rendered card prints `dateText`, and prints **no
  date line at all** when it is empty, rather than a label with nothing after
  it. That closes guard (a): an ISO timestamp pasted into the admin form —
  which `valid_date()` accepts — can no longer reach a guest.
- **`readingTime()` in water.js is DELETED**, not left unused. It formatted in
  the VISITOR's locale and timezone ("Jul 27, 2026" for one guest, "27 juil.
  2026" for another) and fell back to the raw ISO string and then to
  `toISOString()`. That was guard (b). `hasRealTime()` and `dateOnlyParts()`
  stay: `ageWords()` needs both, because a date-only value must be read in the
  source's own frame to measure an age from it.

**THE WIND BADGE RULE HAD NEVER MATCHED ANYTHING.** The 1.39.1 screenshot
showed the badge painted over a popup's top-right **after** autoPan lifted it;
the Director's check **before** a pan found the popup on top. The suspected
cause — a move handler restoring the chrome — was wrong. The real one:
`.dccwl-map-canvas.dccwl-popup-open .dccwl-wind-badge`, written in 1.38.0,
selects nothing, because **`windBadge()` appends to the SHELL**, not the
canvas — 1.35.0 anchored it to `.dccwl-sheet-body-map` after it resolved
against the whole sheet and landed in the header. So the badge kept its 1100
and won wherever a popup reached it, which is only after a pan.

Same family as 1.39.0's double disclosure marker and 1.23.0's deck layout
scoped to `.dccwl-tiles`: **a rule written for the wrong parent is invisible,
and the thing it was meant to govern keeps doing what it always did.** When a
rule covers chrome, check which element each piece is actually appended to.

**THE SUITE NOW PROVES IT WHERE LEAFLET REALLY PANS.** `ui-live.mjs` puts a
marker near the TOP RIGHT — the badge's own corner — opens its popup with
animation on, waits for **Leaflet's own `moveend`** rather than a guessed
delay, and then asks `elementFromPoint` at the popup's **four corners** and at
the centre of its overlap with each piece of chrome. Two things that keep it
honest:

- **An assertion that passes because nothing overlapped proves nothing.** Each
  piece reports whether it overlaps at all; at 390px the badge does, at 1280px
  the popup lands clear of it, and the suite says so instead of counting it as
  evidence. The z-index check covers the desktop case.
- **Ask the element the stylesheet lowers.** Leaflet's zoom buttons keep their
  own `z-index: 800` inside `.leaflet-top`; lowering the CORNER is what puts
  the group under the popup. Probing the button for a 1 asks the wrong element
  and calls a working rule broken — which the first version of this check did.

**FIXTURES CARRY THE SHAPES THAT OCCUR.** `render-fixture.php facts` runs four
rows through `Water_Fact`'s own gate and formatter — a live instant with a
seven-digit fraction, a winter `T05:00Z`, a date-only value, and a date the
gate accepts but the formatter refuses — and `ui-live.mjs` asserts the
rendered cards at 390px. One more test-only trap recorded: **`document.body
.textContent` includes every `<script>`**, so the "no ISO anywhere on the page"
check first found its own injected fixture. It walks text nodes and skips
script and style now.

### 29. 1.40.1 — the cue 1.39.0 took away, and a date inside a sentence

**"ALL READINGS" HAD NO OPEN/CLOSE CUE, AND 1.39.0 IS HALF THE REASON.** That
release hid the browser's own triangle on every `.dccwl-fullguide-summary` —
correctly, because the other folds draw their own chevron. This one never had
one, so between the two it rendered as a plain heading with no way to tell it
opened. It now carries the same chevron, the same 180° rotation and the same
text wrapper as the About fold, copied rather than reinvented.

**AND THE FOLD COMPONENT MOVED TO app.css**, where it should have been all
along. `.dccwl-fullguide*` lived in **widget.css**, which the water module
never loads — so the standalone widget's About fold drew a bare chevron with
none of its styling. That is the THIRD defect of this exact shape (1.23.0's
deck layout scoped to `.dccwl-tiles`, 1.39.0's disclosure marker, this), and
the rule now has a name: **a shared component lives in the shared layer; if
two widgets render it, neither widget's stylesheet may own it.**

**`aria-expanded` IS SET IN JAVASCRIPT, NOT IN THE MARKUP, AND THAT IS
DELIBERATE.** `<details>`/`<summary>` already reports its state to a screen
reader. A static `aria-expanded="false"` in the HTML would CONTRADICT the
native state the moment a guest opened the fold, and with no JavaScript it
could never be corrected. `syncFolds()` sets it and keeps it in step on
`toggle`. It lives in **sheet.js** because that file is a dependency of both
widget.js and water.js — the same lesson as app.css, in its JavaScript form.

**THE FOOTNOTE ROW KEEPS ITS CHEVRONS HIDDEN, AND THE SWEEP ASSERTS THAT
RATHER THAN SKIPPING IT.** Field Guide, Credits and About are folds too, but
in that row the chevron is hidden on purpose since 1.35.0. Re-measured for
this release: showing them takes the row from **50px to 99px — two lines at
320, 360 AND 390px**. The suite pins the exception so that if the row ever
starts drawing them, something says so. **This contradicts the brief's premise
that those three "carry your chevron"; it was reported rather than quietly
resolved either way.**

**A DATE WRITTEN INTO A SENTENCE IS INVISIBLE TO A FORMATTER THAT FORMATS
FIELDS.** The rainfall note read "calendar-day totals for 2026-10-03 and
2026-10-04" on live. 1.40.0 formats each Fact's own `date`; this date was
inside `note`, composed by the builder. **The rule is about what a guest
reads, not about which field it travels in.**

The sweep that followed is a runtime one, not a code read:
`test-water-parts.php` drives `Water_Live::refresh()` with stubs for the
Atlas, USGS daily values and NWS, then checks **every string of every fact a
builder produced** — label, value, short, detail, note, sourceName, dateLabel,
dateText — for an ISO date. `date` itself is exempt BY NAME and must stay raw:
it is the instant the age chip measures from. Nothing else in the module
carries an embedded date today, and a future sentence that does will fail that
check.

### 30. 1.41.0 — the bottom row's own cue, built to live measurements

**ROB'S PICK, 2026-10-06: option B with a shorter first label.** The row reads
**"Guide ▾ · Credits ▾ · By Month › · About ▾"** at every width.

**TWO MARKS, BECAUSE THERE ARE TWO BEHAVIOURS.** A caret that flips means
*this expands here*; "By Month" is a BUTTON that opens another view, so it
carries a fixed `›` — the mark the hub's round go button uses — and it never
changes. Giving it a caret would misdescribe it, which is why that question
went to Rob rather than being settled here.

**THE CIRCLED CHEVRON STAYS HIDDEN IN THIS ROW.** 1.40.1 measured what showing
it costs: 50px to 99px, two lines at 320, 360 and 390. The caret is an
`::after` on the label instead — inside the same underline, same colour, no
extra box, and the label's own text baseline is untouched (the ::after is not
in the text node a Range measures, which is how the 0.00 spread survives).

**BUILT TO THE DIRECTOR'S LIVE NUMBERS, NOT TO THIS SANDBOX.** There is no
Raleway here, so the widths here are not the site's. He measured the real face
(Raleway 15.6/600) and the arithmetic was checked against his figures before
anything was written:

| | 320 | 360 | 390 |
|---|---|---|---|
| spare today | −11 | +29 | +59 |
| three carets " ▾" (13.8 each) | +41.4 | | |
| one " ›" | +9.4 | | |
| "Field Guide" → "Guide" | −40.6 | | |
| **spare after (net +10.2)** | **−21** | **+19** | **+49** |

320 already wrapped and still does; 360 and 390 stay on one line. **When the
sandbox cannot answer the question, build to the measurement that can and say
which is which** — the suite records its own geometry as the sandbox's, not as
the site's.

**SIZE AND WEIGHT ARE PINNED** (`.95em` / `1.05em`, `font-weight: inherit`,
`line-height: 1`) because Raleway may not carry ▾ ▴ ›: a fallback face must
not render them bigger, bolder or taller than what Rob approved.

**THE VISIBLE WORD AND THE ACCESSIBLE NAME.** The row label is "Guide"; the
summary's accessible name is **"Field Guide"**, which CONTAINS it — WCAG 2.5.3
label-in-name, so a guest saying "tap Guide" to a voice assistant is
understood. (It was "The whole field guide", which also contained it; naming
the control what it is beats describing it.)

**ONE ELEMENT, TWO JOBS — REPORTED, NOT WORKED AROUND.** That span is also the
heading of the panel when it opens, so the open panel now reads "Guide" too.
Splitting it would put a second copy of the label in the markup for a crawler
to meet, which is worse than the rename it avoids.

`ui-theme.mjs` pinned the four labels by name and was updated to the new list
rather than loosened — the claim is still that the row holds exactly these
four, in this order.

### 31. 1.41.1 — the species data is built once per request (found by audit)

**MEASURED, AND THE NUMBER IS THE WHOLE STORY.** One hub render rebuilt the
402-entry registry **twelve times**: `Render` calls `Species::dataset()` at
five points, `Canal_Render` and the others add more, and every `dataset()`
call rebuilds the registry, the calendar lookup, the photo map and the
credits. At ~86ms a build:

| | before | after |
|---|---|---|
| hub render (`Canal_Render::shortcode`) | **606 ms** | **111 ms** |
| registry builds per render | 12 | **1** |
| peak memory | 12.0 MB | 10.0 MB |
| rendered HTML | 892,445 raw / 139,100 gz | **identical, byte for byte** |

The output not moving is the point: this is the same page, built with less
work. The page is heavily cached, so a guest rarely pays a render — **a cache
miss, an Elementor preview, a REST detail call and every crawler hit do.**

**PER-REQUEST, NOT A TRANSIENT.** A static memo on `Species::registry()` and
`Species::dataset()`. Filters are registered at plugin load, long before
anything renders, so the only way to add one after the cache is warm is to
add it mid-render, which nothing does. **`Species::flush_cache()` exists for
the harness**, which is many "requests" in one PHP process and adds filters
between them on purpose — it is called from both `dccwl_test_reset()` and
`dcc_reset_once_guards()`, and without it the filter tests would have passed
against stale data.

**THE GUARD ASSERTS BOTH WAYS A CACHE CAN BE WRONG** (test-species.php): that
one render builds the registry exactly once, and that a filter added after a
reset still reaches both the registry and the dataset. A cache that never
invalidates passes the first assertion on its own.

### What else the audit measured and did NOT change

- **Scroll, at 4× CPU throttling, 120 frames:** 0 frames over 20ms at 390 and
  1280 with the folds closed; with the prose guide OPEN (a 285,698px page at
  390px) 7 of 120 frames over 20ms, worst 28ms. Acceptable, unchanged.
- **`content-visibility: auto` on the prose body was tried and REJECTED on the
  measurement**: 7→4 slow frames at 390, and 2→7 at 1280. Noise, not a win.
  Recorded so nobody re-proposes it from theory.
- **No console errors, no page errors, no PHP notices under E_ALL** on hub,
  month and water renders; no duplicate ids; no horizontal overflow at 320,
  360, 390, 768, 1280 or 1680.
- **413 images, all `loading="lazy"`, all with `alt` and explicit dimensions.**
- **The 379 "small tap targets" are inline links inside the crawlable prose**,
  which WCAG's inline exception covers. Checked, not a finding.
- **Six CSS classes select nothing**: `.dccwl-flash`, `.dccwl-btn-quiet`,
  `.dccwl-sheet-nav`, `.dccwl-tabs-wrap`, `.dccwl-fishing-fish`,
  `.dccwl-legend-badge`. `.dccwl-sheet-nav` is deliberate — 1.33.0 answer 4
  names it as part of the one hidden-disabled rule. The other five are
  leftovers, ~40 lines in total; left alone because deleting styling is a
  visible-surface decision and they cost under 1KB gzipped.
- **60% of the shipped CSS and JS is comments** — 123.3 KB gz today, 48.9 KB
  with comments stripped. The comments are this repo's documentation and must
  stay in the SOURCE; the saving is a build-step question (strip on the way
  into the zip), which is Rob's to decide, not something to take silently.

### 32. 1.42.0 — two defects from a self-audit, and four rules about auditing

Two real defects shipped here. Both were found by a read-only audit, and both
were found in the SECOND and THIRD passes over that audit rather than the
first — so the rules the passes produced are recorded with them, because the
audit was wrong in more interesting ways than the plugin was.

**REDUCED MOTION NEVER REACHED THE HUB OR THE STANDALONE WATER WIDGET.**
widget.css has carried a blanket *nothing in here animates* rule since 1.21.0,
scoped to `.dccwl-root`. The hub's own chrome is not inside one —
`Canal_Render` wraps it in `.dccwl-canal` — so with the OS setting on, the
twelve month tiles and the two hub doors kept
`transition: transform .3s cubic-bezier(.34,1.56,.64,1)`. Measured with the
query genuinely applied: **865 elements animate normally on the hub and 14
still did**; the standalone water section went 13 → 0.

The rule now lives in **app.css**, scoped to `.dccwl-app`, which
`Render::app_classes()` puts on the month root, the hub wrapper, the water
section and the sheet host. That is the 1.40.1 rule — *a shared component
lives in the shared layer* — in its fourth instance. widget.css's
`.dccwl-root` block is now a subset and is left alone: removing it changes
nothing and risks something.

**AND KILLING THE TRANSITION ALONE WOULD HAVE MADE THE HOVER WORSE.**
widget.css also drops the hover LIFT under the same query, with the reason
written beside it since 1.21.0: with no transition to carry it, a 2px lift is
an instant jump under the cursor. That rule names `.dccwl-tile`, and the hub's
tiles are `.dccwl-hub-tile` / `.dccwl-month-tile`, so it never reached them.
The drop lives at the **end of canal.css** on purpose — the lift is declared
at (0,4,0), a media query adds no specificity, and the reduced-motion block
near the top of that file would silently lose.

**THE TILE PHOTO HAD NO `srcset`, SO EVERY SCREEN GOT THE SMALLEST FILE.** The
detail sheet has built a correct one since 1.29.0; the tile face never did.
Measured on the hub (the shape /explore/ renders): the tile is 133 CSS px at
320, 168 at 390, 190 at 1280, 257 at 1680, **404 at 2560** — all drawn from a
320px file.

`Render::tile_srcset()` and the JS twin in `tileMedia()` now offer both
renditions. Three rules carried over from the sheet, each load-bearing:
**nothing composes a URL** (both are resolved attachments — the class header
says why), **either may be missing** (assets/photos is excluded from the zip,
so a fresh install may hold a thumb and no mid, and that tile renders exactly
as before), and **the width descriptors come from `Photo_Library::width()`**,
never literals, which is the 1.33.0 `PHOTO_W` lesson.

**`TILE_SIZES` IS TUNED, AND THE TUNING IS THE INTERESTING PART.** An honest
45vw phone stop made a DPR-2 phone fetch the 600 rendition for a **four pixel**
shortfall — 324 device pixels wanted against a 320 file — at 43 KB instead of
18 KB per visible tile (measured averages over all 402). At **40vw** a DPR-2
phone keeps exactly the file and the bytes it had in 1.41.1, while a DPR-3
phone needs 504 device pixels and gets the 600. So **no phone pays more than
it did, and every screen that was under-served stops being.** The honest fix
for the DPR-2 phone is a rendition between 320 and 600 — 402 photographs and a
new photo pack, which is the owner's call. `lib.mjs` gained a `dpr` option for
this; it had been fixed at 2 since the harness was written, which hid the only
case that justifies the change.

### The four rules about auditing, each paid for in this round

1. **RUN THE HARNESS. AN AUDIT THAT DOES NOT IS STANDING ON NOTHING.** The
   first pass declared the plugin "in good shape — no errors" without running
   a single suite. `test-bootstrap.php` exists *because* 1.33.0 fataled on
   activation with 23 suites green; the suites are the cheapest evidence in
   the repository and they were the one thing not consulted. 28/28, exit 0,
   nothing skipped, is now the first line of any audit.
2. **RE-READING THE CODE IS NOT RE-MEASURING.** The second pass re-verified
   every finding against source and carried forward every NUMBER from the
   first — latencies, heap, element counts — from scripts it never reopened.
   That is 1.38.1's lesson (*measure against what was asked, never against a
   previous summary of it*) in a new place. Re-reading confirms a defect
   exists; it says nothing about the figure attached to it.
3. **CHECK THE VENDORED SOURCE BEFORE ASSERTING A MECHANISM ABOUT IT.** The
   second pass claimed a blanket `transition: none` would strand Leaflet's
   zoom, and recommended the narrower scope on that basis. One grep disproved
   it: Leaflet 1.9.4 reaches `_onZoomTransitionEnd` three independent ways —
   the proxy's `transitionend`, an immediate call in its own `zoomanim`
   handler for when the transform value did NOT change, and an unconditional
   `setTimeout(…, 250)`. A plausible mechanism argued me out of the correct
   fix. Same family as *find out which stacking context each number is
   measured in*.
4. **MEASURE THE SURFACE YOU ARE TALKING ABOUT.** The first pass reported tile
   widths "164 → 420px" and the second asserted "~170 CSS px at 390". The hub
   deck and the standalone widget do not agree: the standalone caps at
   **122 CSS px at every width from 390 up**, while the hub reaches 404 at
   2560. One number quoted for "the tile" was two different surfaces, and the
   `sizes` list is fitted to the hub for that reason, with the cost to the
   legacy widget written down beside it.

**WHAT THE AUDIT COULD NOT SEE, AND WHY THAT MATTERS MORE THAN ITS FINDINGS.**
No live egress, no media library, no Raleway, no SpeedyCache. So every
layout-fits and no-overflow result is sandbox-only — the standing trap, and
the footnote row is the precedent: it passed at 361px here and wrapped at
393px on live. The defensible sentence is *"I found no defects in the narrow
set of things measurable in this container"*, and a limitations note at the
foot of a report does not repair a verdict at its head.

### 33. 1.43.0 — the speed half of the Director's brief, and the page the prose moved to

Rob's words on 1.41.0: *"/explore/ has so much lag, way more than any other page
on the website with any of the other plugins."* The Director measured it on
live (390px, logged out, 4× CPU): 1.40 MB of HTML, 910 KB of it markup, 10,356
DOM nodes, 182 images fetched before any interaction, 8.4 s of total blocking
time, and taps that took 2–4.5 s to paint.

**THE BRIEF WAS ORDERED "speed first, then navigation and styling", AND IT WAS
SPLIT ON THAT LINE.** PART A shipped as 1.43.0; PART B — the dropdown
navigation, open-on-Water, the trimmed controls, the restyle — is 1.44.0, to be
started only once 1.43.0 is verified live, so the two cannot overlap. That split
was proposed with the numbers and approved on 2026-10-20.

| | live 1.41.0 | 1.43.0 |
|---|---|---|
| /explore/ markup | 910 KB | **104,018 B** (20,884 gz) |
| DOM nodes after load | 10,356 | **1,913** |
| tiles server-rendered | 426 | **0** |
| images before interaction | 182 (2.4 MB) | **0** |
| tap: Wildlife | ~2,500 ms | **206 ms** |
| tap: a section tab | ~2,200 ms | **251 ms** |
| tap: Now | 4,514 ms | **46 ms** |

#### The profiled cause, because it was not what it looked like

The taps were not slow because of work the plugin did on the tap. A CPU profile
at 4× throttling named it: **419 ms inside `centerMonth()` and 515 ms of
browser style/layout on one tap.** `centerMonth` takes six layout reads
(`scrollWidth`, `clientWidth`, two `getBoundingClientRect()`, `scrollLeft`,
`offsetWidth`) interleaved with class writes across 409 tiles, so every read
forced a synchronous layout of a 9,000-node tree. Node count did not change on
the tap, which is what ruled out DOM building.

**So the cost was not building the tiles, it was LIVING with them** — and
PART B's Month ▾ chip retires `centerMonth`, `buildTimeline`, the arrows and
the edge fades outright. The navigation redesign is itself the rest of this fix,
which is why it is a release and not a footnote.

#### /wildlife-guide/ — and the 1.16.0 rule moved house rather than weakening

Three options went to Rob: build the prose on demand, move it to its own page,
or leave a lightweight list behind. **He chose the page (pick B, 2026-10-19).**
It is the only one that removes the weight AND keeps every word crawlable —
building on demand would have taken 402 descriptions out of the HTML entirely,
and the JSON-LD does not replace them because it deliberately carries no
`description` (1.16.0).

So the rule that forbids HIDING crawlable content is intact. Nothing on that
page is hidden, folded, lazy-loaded or fetched. What changed is the URL.

- `Guide_Page` renders it; `dccwl_guide_page` (Elementor) and
  `[dcc_wildlife_guide]` are the two doors. **The widget is the recommended
  placement** — it declares its own style dependency, so the editor preview
  matches live.
- **It loads NO JavaScript at all.** Styles only. 402 descriptions and two
  links need none.
- **`Render::species_prose()` is ONE copy, extracted and not rewritten.** Two
  surfaces could render it and two slightly different renderings of 402 entries
  is duplicated content with a drift problem attached.
- **Anchors are the registry's own ids, verbatim** (`/wildlife-guide/#alligator`).
  Nothing is slugged or indexed, so a renamed species cannot silently break an
  inbound link.
- **No JSON-LD there, and that is an answer rather than an omission.** The
  ItemList stays on /explore/. The same ItemList at a second URL invites a
  search engine to pick a canonical between two pages making one claim, and
  this page's value is the prose, which is already text.
- **The standalone `[dcc_wildlife]` widget lost its inline prose too**
  (confirmed by the Director): one behaviour, one code path, and no second copy
  of the guide at another URL.

#### The tiles are built in the browser, and VISIBILITY is the trigger

PHP ships the grids empty with `data-dccwl-lazy`; `widget.js` fills them from
`CFG.order` — the ids in the order `Species::browse_order()` put them — plus the
dataset it already holds. The ORDER ships because that function lives in PHP and
a JS re-implementation would drift from the counts rendered beside the category
pill.

- **While the guide is hidden, nothing is built.** /explore/ opens on Water
  (1.44.0) and already keeps the guide in a `display: none` panel, and a hidden
  element has no `offsetParent` — which is also why an IntersectionObserver
  alone could not start this. That is how the page meets its DOM budget.
- On open, the first 24 go in synchronously; idle time finishes the rest.
- **A search, a category or Peak Now forces completion first.** A half-built
  grid would make those answers LIE — a guest searching "manatee" told it is
  not there because its tile had not been built. That is the 1.28.0 defect (an
  invisible filter putting seven winter species out of reach) in a new disguise.
- **THERE IS NO SCROLL SENTINEL, and it is the one departure from the brief.**
  A sentinel `<li>` is still a grid item: it occupies a track and leaves exactly
  the empty cell Rob ruled out in 1.37.0 and again in 1.37.1. Outside the `<ul>`
  it never enters the deck's own scroller. Idle completion does the same job in
  a few frames and cannot leave a hole.
- **`browse` joined `WIRE_INDEX`** so the category filter still has it with no
  markup to read it from — one copy of the species data, about 5 KB raw against
  299,662 bytes of tile markup removed.
- **`Render::tile_media()` and `tile_srcset()` are DELETED.** No surface
  server-renders a tile any more, and unreachable code is not kept here.
  `TILE_SIZES` stays as the declared source of the `sizes` string, test-render
  still lints the client against it, and ui-theme's three-DPR check of which
  FILE is fetched is the stronger replacement for the markup assertions.

#### MEASURE BEFORE MOVING: the two weight items were worth very different amounts

With the prose and tiles gone, what was left split as credits panel **108,284
bytes**, water section **9,673** (Fishing 8,854, Now 196), everything else
94,088. So:

- **The credits panel moved**, and as a LINK to `/wildlife-guide/#credits`
  rather than a fetch — the stronger answer for a licence surface, because the
  attributions now sit at a permanent crawlable URL instead of inside a fold
  that only exists while a script is working. No new route, nothing to fail,
  and a guest with no JavaScript reaches them as easily as one with it.
  The Director's condition is met twice: "Credits" stays in /explore/'s
  footnote row, and every species sheet gained a **"Photo Credits"** link
  *under* its own per-photo credit line — in addition, never instead (1.24.0:
  the sheet is where a photograph is shown at size).
- **The water views did NOT move, on the measurement.** 9 KB of 212 KB, and
  Fishing is static owner-edited data that would have to travel in the config
  instead — the same bytes in a different place, for real regression risk in
  the module with the strictest rules in the plugin. Reported with the numbers
  rather than done mechanically, and accepted.

#### Two defects of my own, both caught by the harness in the run they were written

- **The idle chain started only from the observer**, and a `display: none`
  element never intersects — 24 ui-deck assertions failed against empty grids.
- **`buildTile()` was written for the spotlight, which never holds a hazard**,
  so passing the month's value put a coral "Peak" flag on three venomous snakes
  in a search. `refreshGuide()` is the one authority on a guide tile's label, as
  it was for the server-rendered ones; tiles are built bare.
- And one from the first increment: **the new Guide `<a>` inherited
  `min-height: 44px` from a rule written for a `<button>` and a `<summary>`**,
  and min-height does nothing to an inline box — a 23px tap target, then 40×44,
  because an inline-flex box shrinks to its label and "Guide" is the shortest
  label in the row. Fixed with a 44px floor in both directions, scoped to the
  anchor alone so the button's line box (measured to 0.00px across five widths
  in 1.35.0) is undisturbed. **The house pattern again: the rule was there, it
  just was not in force.**

#### Marks follow BEHAVIOUR, not row position

1.41.0 settled that a caret means *this expands here* and `›` means *this opens
another view*. Guide and Credits now open another PAGE, so both moved from `▾`
to `›`. The footnote row is one fold (About) and three links. Their accessible
names name the destination and still open with the approved string, so WCAG
2.5.3 label-in-name holds.

#### Harness: 30 suites, exit 0, nothing skipped

- `test-guide-page.php` is new: every description present, every name, every
  anchor equal to its registry id, none left on /explore/, the prose outside
  any `<details>` and carrying no `hidden` ATTRIBUTE, no dangling jump-list
  target, the credits and the modification notice present, and no
  `dcc-wildlife` script enqueued.
- **The photo-source-link assertion MOVED with the panel** rather than being
  dropped. It is a licence surface, so the assertion follows the surface.
- `test-element-cache.php` gained a second category for the one widget that is
  deliberately **cacheable**, with its reason — so the completeness check still
  catches a widget that declares nothing either way.
- `lib.mjs` gained `settleGrids()`: a BOUNDED wait for the grids to converge
  (a stall still fails every tile count) that treats a hidden guide as settled,
  which is what kept a full run under ten minutes.
- Mutations verified red: a description dropped from the guide page, anchors
  prefixed so they stop matching ids, and the prose rendered back onto
  /explore/.
- Two test-only traps recorded: a boundary that cut inside the tag it was
  looking for, and a `" hidden"` substring scan that matched the pine warbler's
  *"spots on the hidden surface of the thigh"* — this repository's oldest trap,
  a naive scan matching the content it exists to protect.

### What 1.44.0 inherits, including the one conflict Rob resolved

PART B is briefed and unstarted: the Cottage-Selector-style dropdown replacing
the Back bar and the section title, opening straight into **Water › Map** with
no hub and no hub tiles, the map loaded on scroll-into-view, Map · Now · Fishing
as real tabs, the trimmed Wildlife control row (Month ▾ replacing the 12-month
strip AND Peak Now, Show: All ▾, an ⓘ Badges popover, no Compact switch), plain
centred footer links, centring everywhere except multi-sentence paragraphs,
Title Case throughout, and every existing deep link still landing correctly.

**ITEM 3 CONFLICTED WITH 1.35.0 AND ROB RESOLVED IT (2026-10-20).** The brief
asked the Now place picker to show "level, clarity, oxygen, trophic state, rain,
wind, forecast" for the chosen place. Checked against the feed: per PLACE the
payload carries **level and clarity, and nothing else**. Wind and forecast are
ONE National Weather Service reading for the property's grid square — 1.35.0,
Rob's own option C, says nothing wind-related may be drawn on the water because
a per-place wind value is the same number drawn six times. Rain is a
calendar-day sum from named USGS gauges. Oxygen and trophic state would need new
per-water Atlas fetches against the budgets that exist so a bigger chain warms
progressively.

His ruling: **the place picker shows level and clarity for the chosen place,
with "No Recent Reading" where a lake has none. Wind, forecast and rain stay as
ONE small row labelled as covering the whole chain** (e.g. "Whole Chain · NWS
Forecast"), shown once beneath the place cards and never repeated per lake.
1.35.0 stands, and **no new per-water Atlas fetches.**

Also carried forward: the browse labels go Title Case with PART B 4, so the
picker and this page's headings move together (`Insects & Small Things`,
`Reptiles & Amphibians`).

### 34. 1.44.0 — PART B: the hub is gone, and what replaced each piece of it

Rob's navigation and styling brief, built on top of 1.43.0's speed work. Every
item here is his decision or the Director's; the two places a choice was left
open are named as questions, not answered.

**THE SHAPE OF THE APP CHANGED, SO READ THIS BEFORE EDITING `canal.js`.** From
1.10.0 the front end was four stacked LEVELS — hub → month → species, and hub →
water — each with a Back bar and a history entry per drill-down. It is now TWO
SIBLING VIEWS switched by one dropdown, and **a tab does not push history**. So
`go()` pushes nothing, `parentOf()` and the popstate nav handler are DELETED
rather than left inert, and Back leaves /explore/ instead of walking up to a hub
that does not exist. The Director signed that off: "it follows from Rob's 'no
hub' pick."

**sheet.js's own contract is untouched** — push on open, pop on close — which is
why Escape, the scrim, the back affordance and the Android back button all still
close a sheet and leave the view where it was. If levels ever return, restore the
state-driven popstate READER (1.10.0), not a "step up on any pop" design: that
passes the first case and fails the second.

#### The Month menu retired the single slowest thing on the page

`centerMonth()`, `trimPartialMonths()`, `trimSoon()` and `buildTimeline()` are
all deleted, and that is the release's largest performance fix rather than a
tidy-up. Between them they took **six layout reads** — `scrollWidth`,
`clientWidth`, two `getBoundingClientRect()`, `scrollLeft`, `offsetWidth` —
interleaved with class writes across 409 tiles, so every read forced a
synchronous layout of a 9,000-node tree. A CPU profile at 4× throttling put
**419 ms of one tap inside `centerMonth` alone**. A menu has nothing to centre
and no edge to cue, so the reads do not exist to be forced. `attachEdgeFades()`
and `recenter()` went with them.

**Peak Now was never a section.** It cut across all three and meant "at its best
in the visitor's month", which is a MONTH question — so it is "This Month" in the
Month menu. What that changed, and it is not nothing: **the filter no longer
crosses sections**, so `peakRow`, `dccwlPeakMode` and the cross-deck
`dccwlApplyView` are deleted. What did NOT change: canal time in the browser,
hazards excluded (1.33.0 — nobody goes looking for a cottonmouth), and the
Safety list never month-filtered (1.28.0).

**The `isCanal` gate on the month filter is GONE, and that is a deliberate
change to the legacy widget.** The filter used to run in the hub only, which was
coherent while the control was a strip that drove the standalone widget's
headline and spotlight instead. A chip directly above the tiles it governs
cannot read "January" over 308 unfiltered animals: **a control that lies about
what it is doing is worse than an absent one.** `state.monthPicked` still gates
it, so the 1.28.0 defect cannot return — the page opens on "Any Month" and
nothing filters until a guest chooses. The harness caught the need for this on
the standalone fixture.

#### Four settings retired, each with its control

`show_compact` (the Compact switch and its whole compact-list stylesheet),
`default_view` (one list, one answer), and `hub_preview_max` / `now_names_max` /
`month_art_max` (they sized the hub tile's preview line, the "right now" line
and a month tile's sprite art). Keys stay in the defaults so **no stored row
changes**; all are out of the schema so a Save cannot write them back, out of the
admin page, and out of both widgets' override lists.

`resolve_enum()` went with `default_view` — nothing called it and no suite could
exercise it without inventing a key. **The `enum` ARM of `sanitize()` stayed**,
and the distinction matters: it is an arm of a dispatcher over `schema()`, which
is the documented extension point, and removing it would make a future
`'type' => 'enum'` key fall through the switch silently.

#### Dead code is DELETED, not shipped — and the answer was delete, not reuse

The Director's explicit ask. The month-tile builder drew twelve tiles with peak
counts and three sprites each; the hub-preview builders composed two sentences
and two chip rows. A dropdown of month NAMES needs none of it, and reusing them
would put sprite art inside a listbox row. So `buildMonths()`, `fillYearNote()`,
`fillWildlifePreview()`, `fillWaterPreview()`, `ageWords()`, the water-facts
buffer, `cap()`, `el()` and `fmt()` are gone from canal.js (**707 → 382 lines**),
with about **530 lines of CSS**: the level bar, the crumbs, the panel title, the
hub doors, the month tiles, the year note, the legend swatches, the twelve-month
strip, its arrows, its edge fades, the view toggle and the compact list.

**Deleted rather than left unmatched, for the reason this repository has learned
five times: a rule that matches nothing is invisible, and a file full of them is
how the next reader loses track of which rules carry weight.**

**The hub's i18n strings went with the builders that composed them** —
`monthAria`, `atPeak`, `monthChipAria`, `toSpot`, `quiet`, `and`, `yearBestOne`,
`yearBest`, `now`, and the four age words. A comment added earlier in this
release claimed the age words had to stay "because the sheet's water cards still
read them"; **that was wrong** — water.js and water-map.js read
`DCC_WL_WATER.i18n`, which Water_Render emits and this release did not touch.
Corrected after the suite failed on it. Dropping a string with its only reader is
what stops a translator being asked for a sentence nothing can print.

#### THE SHARED-CLASS TRAP, caught before it shipped

`.dccwl-tab` is shared with the water module's two bars. Those are `role="group"`
holding toggle buttons and correctly report **`aria-pressed`**; the wildlife tabs
became a real tablist and report **`aria-selected`**. app.css's coral
selected-state rules keyed on `aria-pressed` alone, so converting the tabs would
have silently stopped painting one of the two bars. **Both attributes are
listed, and each bar reports the state its role actually has.**

**The full list of classes the water and wildlife panels share** (the Director's
ask, so his live checks can scope correctly): `.dccwl-app`, `.dccwl-tab`,
`.dccwl-tabs`, `.dccwl-metachip`, and the eight fold classes —
`.dccwl-fullguide`, `-summary`, `-h`, `-text`, `-body`, `-meta`, `-chev`. Scope
any `.dccwl-tab` selector to `[data-dccwl-panel="species"]` or to
`.dccwl-water-tabs` / `.dccwl-fish-seasons`; **Water is FIRST in the DOM now**,
so an unscoped query returns a water tab.

#### Item 5 — plain text footer links, which REVERSES 1.41.0's marks

Rob's words: "plain text links … centred, in the site blue, Raleway 600. No
underline-and-arrow look; underline only on hover/focus." So the `▾ ▴ ›` marks
and the permanent underline are gone. **1.41.0's rule about what each mark MEANS
is untouched** and still governs every other control; it is this row's permanent
cue he removed. It also returns the +41.4px the Director measured the carets
costing at 320px.

**"By Month" left the row, and this one needs a ruling.** It was a `<button>`
opening the month-picker PANEL and the only door to it ("`go('month')` appears
nowhere else", 1.27.0). The hub and its panels are gone, so it led nowhere, and
Month ▾ beside the tiles replaced it. Item 5 lists it and says "keep what each
one opens" — but item 2 removes the hub, and the deep-link rule says a month link
opens WILDLIFE with the filter applied, which only works if a month is a filter
rather than a view. **Implemented that way and raised rather than resolved
silently.** The row is Guide · Credits · About: two links and one fold, and with
the `<button>` gone there is one element type and one line box, which was the
0.9px baseline Rob measured in 1.35.0.

#### Items 6 and 7 — centring, and what is deliberately NOT centred

The fishing block is centred now, where it was left-aligned wholesale on a
session's judgement from 1.4.0. **What stays left, and why, each noted in place:**

- the fishing intro and each season's advice line — multi-sentence prose, which
  is Rob's own 2026-10-19 exception; both held to 46ch and centred as BLOCKS;
- `.dccwl-water-attr`, the citation stack — the 1.10.0 exception, never
  overruled: centred, its ragged edges read as unrelated fragments;
- the moon card's text column — a flex row beside a drawn disk, not a block of
  prose;
- listbox option rows (`.dccwl-pick-opt`, `.dccwl-chipmenu-opt`,
  `.dccwl-drop-action`) — controls in a popup, with the name and the count at
  opposite ends; a list of fourteen months needs a scannable left edge;
- the About fold's body, and the /wildlife-guide/ prose lines — Rob's own rule
  for that page.

`text-wrap: balance` is on every heading, in the app.css **floor**. Safe there
where `text-align` is not, and the note says why: alignment is part of a
heading's role and the floor would out-specify the rule that sets it, but no
heading in this plugin wants its lines unbalanced.

#### Item 3 — "Pick A Place", and Rob's ruling about what the feed actually has

The Now tab held "All readings" and "Across the Harris Chain". Rob: "they
overlap". They did — Lake Dora was in both. One chip answers it.

**The brief asked for more than the feed carries**, and he ruled on it
(2026-10-20): per PLACE the payload has **level and clarity and nothing else**.
Oxygen and trophic state would need new per-water Atlas fetches against the
budgets that let a bigger chain warm progressively — no. Wind, rain and the
forecast cover the whole chain and sit in ONE row headed "Whole Chain · NWS
Forecast", never repeated per lake. **That is 1.35.0 holding: nothing that does
not vary across the water may be drawn as though it does.**

- **The options are server-rendered and the readings are not.** A water's name is
  an owner-edited setting and cache-safe; a reading is time-sensitive and must
  never reach SpeedyCache-served HTML. ui-place.mjs proves both halves — it loads
  the page with NO scripts and requires all ten waters as readable text, and
  requires that not one reading is in the markup beside them.
- **`key` gained `rain` and `forecast`; `Water_Fact` gained `place`.** All
  presentation metadata, never a gate: the gate (tier, source name, parseable
  date) is untouched, and a Fact without any of them is as valid as one with
  them. `place` is the waterbody id, because **matching on a name is what `key`
  exists to prevent** — a name can be renamed out from under the match.
- **"No Recent Reading" is built in the client, not passed through
  `Water_Fact`.** A Fact is a claim about a measurement; this is a statement that
  no measurement exists, and running it through the gate would mean inventing a
  source name to satisfy the gate.
- **It appears for a chosen LAKE and not for our own canal.** His words are
  "where a lake has none", in a sentence about the other chain lakes. Our canal
  is the pane a guest lands on without asking, and this module's oldest rule
  governs it: an unknown field is omitted, never rendered as "unknown". **The
  harness found this** — ui-water-tabs' fixture has a level reading with no
  `key`, so the broad version printed an absence over a reading that was there.
  Flagged for the Director, because the brief could be read either way.
- **Changing place costs ZERO fetches.** The picker is handed a REPLAY function
  rather than the facts, so a later /conditions refresh cannot leave it
  re-rendering the readings it was built with.

#### Item 2 — the map is inline, and the 1.31.0 rule finally has its test

Rob: the section "opens on Water › Map, with the map already showing (no 'Open
the chain map' button), loaded when the section scrolls into view".

**CLAUDE.md has claimed since 1.31.0 that "a test asserts zero external requests
before the click". THERE WAS NO SUCH TEST.** There is now: ui-map.mjs builds the
page with a 2,400px spacer above the host, counts requests with
`page.on('request')`, and requires not one of Leaflet, its stylesheet,
water-map.js or the /map payload before the host is scrolled to — then requires
them after, **in that order**, because the payload must still come last.

- **Visibility-gated as well as intersection-gated.** A `display: none` element
  never intersects anything — the 1.43.0 trap — and the Map pane is hidden
  whenever Now or Fishing is selected. So the host is observed AND the water tab
  bar dispatches `dccwl:water-pane-shown`.
- **Two defects of mine, both caught by the suites in the run they were
  written.** (1) The host clipped its own control bar and legend: `min-height`
  plus `overflow: hidden` on the host reserved the space and then hid two
  siblings of the canvas. In the sheet that could not happen because the body
  scrolled; inline, clipped means gone. The host grows to its content and only an
  EMPTY host holds the space open. (2) The loader would not load: it needs the
  host LAID OUT, and a `width: 100%` div with no content has zero height, so the
  check said "not on screen" for an element in the middle of the viewport. It
  asks about WIDTH now — **a check that fails closed on a styling change is
  worse than one that fails open.**
- **And a rule written for the wrong parent, for the FIFTH time.**
  `.dccwl-sheet-body-map.dccwl-popup-open` lowers our chrome while a Leaflet
  popup is open (1.38.0 — raising the popup cannot work, its pane is inside a
  stacking context at 400). The shell is `.dccwl-map-inline` now, so the rule
  stopped matching. Both parents are listed. **The same mistake was in the
  SUITE**, which asked only about the sheet body — a working map reported broken.
- **The layer chips are the 1.33.0 pattern again:** one piece of state, two
  shapes. `setOverlay()` is the only path that adds or removes a layer and it
  updates the chip and the Layers menu's checkbox together. Built beside the
  layer groups, never rendered by PHP — **a chip that toggles a layer the map
  does not draw would look perfectly fine.** Whether the menu rows should now go
  is flagged for the Director.
- **A second Escape now does nothing, and that is asserted rather than
  deleted.** There is no sheet behind the menu. If some future layer starts
  listening at the document, the symptom would be a map that vanishes on a double
  press.
- **The map's HEIGHT is the one design choice here and it is not a session's to
  make.** It lives in `--dccwl-map-h`; three options were rendered at 390 and
  1280 for Rob. Shipping until he answers: `min(60vh, 520px)`, where 60vh is the
  cap the species photo has carried since 1.36.0 for the same reason. **`dvh` is
  deliberately NOT used**, unlike the sheet canvas: in a sheet it keeps the
  canvas inside a collapsing mobile toolbar, but in page flow it makes the map
  resize as that toolbar hides and shows.

#### Deep links, and a feature the brief named that does not exist

`#canal-month=` and `?canal-month=` now open **WILDLIFE**, not the default Water
view, and still never write back. ui-deeplink.mjs is new: the hash form, the
query form, a month NAME, a three-letter abbreviation, four unusable values that
must leave the default alone, and the 1.23.0 read-never-write rule.

**It needed one change to lib.mjs to be testable at all.** Every page here is
built with `setContent`, which lands on about:blank — no hash to read, and
`history.replaceState` not reliably allowed. `buildPage({ url })` serves the
fixture over a routed https URL and navigates to it. **Opt-in**, because
changing how thirty suites load their page to serve one is not a trade this
harness makes. One trap recorded with it: a route pattern is a glob matched
against the WHOLE url, so a pattern built from the path missed every variant
carrying a query and the navigation failed on DNS — it matches by predicate now.

**`#dccwl-fl-danger` AND ITS THREE SIBLINGS ARE NOT DEEP LINKS.** The brief
lists them among the links that must keep working. They are SVG `<symbol>` ids
in the sprite sheet — the targets of the `<use>` elements that draw a tile's flag
mark. A `<symbol>` is never rendered and has no layout, so the fragment scrolls
nowhere; **there is no flag FILTER in the plugin for one to apply.** Reported
rather than invented, and asserted as what they actually are so the next reader
of the brief does not go looking.

#### Two assertions that could not fail, removed

`test-counts.php` compared `at_least($dataset, SEPT, PEAK, true)` to the same
call with the same arguments — **one list against itself, green since 1.33.0.**
And a comment in `class-guide-data.php` described `show_jump`'s retirement while
sitting above `show_compact`, which was still in the schema and still gated a
live control. **A suite that asserts an identity is asserting nothing with extra
steps**, which is this harness's oldest prohibition in a new disguise.

#### Measured, at 390px with the CPU throttled 4×

| | 1.43.0 (live) | 1.44.0 |
|---|---|---|
| DOM nodes at load, Water showing | 2,162 | **848** |
| Images before interaction | 9 | **6** |
| Longest task when the map loads | 100–370 ms | **none** |
| Tap Wildlife | 86 ms | 134 ms worst task |
| Tap a section tab | — | 111 ms worst task |
| Month → This Month | — | 131 ms worst task |
| Tap Water · Tap Now | 117 / 101 ms | **no long task** |
| Pick another place | — | 74 ms worst task |
| Nodes after every view visited | — | 3,455 |

**The Director's exit test for item 2 — "after Water opens, no task over 200 ms
apart from the map's own tile downloads" — is met with no long task at all when
the map loads.** The sandbox has no Raleway, no SpeedyCache and no live egress,
so these are sandbox figures: evidence, not proof, which is why he re-measures on
live.

#### Harness: 33 suites

New: `ui-place.mjs` (76), `ui-deeplink.mjs` (27), `ui-guidepage.mjs` (10).
`ui-map`, `ui-mapbar`, `ui-wind` and `ui-live` all opened the map by its button
and now drive the real path through one helper, `openInlineMap`, **which presses
nothing a guest cannot**. Mutations verified red: a deep link landing on Water,
a fourth Peak Now tab, the tab row losing `role="tablist"`, the whole-chain keys
emptied so wind repeats per lake, and the guide column's dead selector restored.
Every run is AFTER the restores, never before.

### 35. 1.44.1 — the Director's live pass on 1.44.0, and two defects it exposed

Ten items from Rob's answers and his Website Director's own check of /explore/
on live (390px, logged out, real Raleway). Everything here is their decision;
where two items of the brief could not both be satisfied, the measurement
decided and the conflict is in the release notes rather than settled quietly.

**THE MAP IS THE FIRST THING UNDER THE Map · Now · Fishing SWITCH.** He
measured it starting about 585px down a 390px screen with only half of it
visible, because the three stat tiles (Level · Clarity · Wind) and an intro
line sat above it. **The tiles are REMOVED, NOT MOVED**, and his own
suggestion — put them in Now — is what proves it: the READING is already a
full card there for the place a guest chose, with its source and date, so a
tile beside it would be the same number twice; the COLOURING is already
"Colour by ▾" on the map's control bar, which acts on the map in front of you
rather than one you are about to open; and **wind never had a colouring at
all** (1.34.0 said so), so its tile was only ever a reading.

- **Wind, counted.** Rob's ruling is that wind appears ONCE, as the Whole
  Chain row. With the tile gone it does, and `ui-live.mjs` counts it on the
  whole panel rather than reading one element — the duplication was the point.
  **The map's corner BADGE stays and does not break that rule**: 1.35.0 is his
  own option C, and what it forbids is drawing wind ON THE WATER, because one
  forecast for one grid square does not vary across it. The badge is what he
  chose instead, and the suite still asserts no wind marks among the layers.
- `fillStats()`, `STAT_KEYS`, the tile markup and about 100 lines of CSS went
  with them, including one of the uppercase rules item 4 would have had to
  unpick.

**THE OPENING VIEW IS FITTED TO THE CHAIN WATERS AND THE COTTAGES — NOTHING
ELSE.** It opened on the whole county because every marker went into the box,
and the two sets that reach furthest are the ones that are not the chain: a
USGS gauge down a river leg and a public ramp on another lake. Both are still
drawn and still reachable by panning; only what is MEASURED changed. The
waters are the same list the place menu shows, which is the owner's own stored
rows, so nothing was added and nothing guessed.

**AND THE FIXTURE COULD NOT SHOW THE DEFECT UNTIL IT WAS MADE TO.** Every
station and ramp in `ui-map.mjs` sat inside the waters' own box, so fitting to
"every marker" and fitting to "the chain" gave the same view in the harness
while live opened on the county — *a hand-written fixture can only confirm
what its author already believed* (1.39.1), in its purest form. Two outliers
were added, one north and one south, and the assertions are now a PAIR, asked
of Leaflet itself with `getBoundsZoom` and the real padding: the zoom is
exactly what the chain box allows, AND it is tighter than every-marker would
give. Without the second, a change that quietly widened the box again would
still pass the first.

**THE CHIPS ARE THE LAYERS' ONLY CONTROL, and the menu that is left is "Base
Map ▾".** Rob: "chips only. Remove the 'Layers ▾' menu; the chips are the one
control. 'Colour by ▾' stays." So the checkboxes and `overlayBoxes` are gone
and `setOverlay()` is one path to one control. **But the menu also held two
things that are not layers, and both are earlier decisions of his**, so
neither was deleted on a session's judgement and both are flagged in the
notes: the base-map radios (two base layers, satellite default — 1.7.1) and
Fullscreen, which lives in that menu in the compact shape and only where the
browser can actually do it (1.31.0). The menu is not put on the bar at all if
it would be empty. The sheet map, which had the menu as its only layer
control, has had no door since 1.44.0 made the map inline.

**`text-transform: uppercase` NO LONGER APPEARS ANYWHERE IN THIS PLUGIN** (11
declarations, 8 in water.css and 3 in widget.css; the full list is at the head
of water.css). The Director: "drop the text-transform. Rob's rule is Title
Case everywhere, so the screen should show what the source says." **The
letter-spacing stays** — it predates the transform and does the same job on
mixed case. The strings behind them were Title Cased to match. **What was
deliberately not re-cased, each for the same reason — the text is not ours:**
an owner-edited almanac label, fishing season name or fishing species name;
the seeded "Surface area" row, which is one of those and would need a
`Water_Data::upgrade()` step to reach a site that has saved the form (1.8.0);
and the ramp marker's "CLOSED", which is a warning rather than a heading, is
capitals in the SOURCE, and is described that way on the admin page. Reported,
not changed.

**"October On The Canal"**, from his own example — note that this capitalises
"On The" where the water module's "Tonight on the canal" card does not.
That is his wording for this heading quoted exactly, and the moon card is a
string already approved on live; neither was changed to match the other.

### The chip is one component now, and it is the Cottage Selector's

`.dccwl-chip` lived TWICE — in widget.css for the guide's chips and in
water.css for the place chip and the map's layer chips. 1.44.0 flagged that
and left it. Item 10 forced it: "bring ALL of them to the Selector's chip"
cannot mean two descriptions of one control. It is declared once in **app.css**,
the layer both stylesheets depend on — the 1.40.1 rule in its fifth
application — and both copies are gone, keeping only their menu positioning.

The values are read from `.dccs-chip` on branch
`origin/claude/dora-canal-cottage-selector-qy12qf`, not from a screenshot:
white ground, 1px #F4DA62, radius 30px, black ink, weight 600; `is-active` is
#002E7A on white text with a #0f6dbf edge. Literal hex, like the view
dropdown's, because these are another plugin's colours matched on purpose and
a token would invite drift.

**WHAT IS NOT TAKEN FROM THE SELECTOR, AND IT IS A REPORTED CONFLICT: its
20px type and 24px side padding.** Item 9 of the same brief requires the three
guide chips on ONE row at 390px with real Raleway metrics. Measured in the
harness with the row's font inflated 25% to stand in for Raleway, which runs
about 21% wider than the face this sandbox falls back to:

| | three chips | + gaps | row at 390px |
|---|---|---|---|
| as shipped (fs-xs, 12px padding) | 330px | 340px | 374px — fits |
| Selector's 24px padding, our type | 402px | 412px | 374px — **two lines** |
| Selector's 24px padding and 20px type (extrapolated) | ~474px | ~484px | 374px |

So the chip takes the Selector's LOOK and keeps a size that fits the row. The
24px variant is one of the verified mutations, so the table above is a
measurement rather than an argument.

**ON/OFF IS THE SELECTOR'S SELECTED STATE, and only for things that are on or
off.** `aria-pressed` is the map's layer chips; `aria-expanded` without
`aria-haspopup` is the Badges chip, whose key is showing or not. The menu
chips (Month, Show, Pick A Place) never take it — what they say is their own
label.

### Two defects that were invisible because they looked almost right

**A LABEL SPAN INSIDE A 600 BUTTON WAS RENDERING AT 400.** The Director
measured `.dccwl-viewselect-trigger` at 700 and its `.dccwl-viewselect-label`
at 400. The cause is `.dccwl-app span` in app.css's type floor (0,1,1), which
has set 400 since 1.27.0 to stop a 700 root making the whole guide bold — it
NAMES the element, so it beats anything the button merely passes down. Which
is why the Badges chip looked right all along: **its label is a bare text node
with no span to catch.** Every label span is `font-weight: inherit` now, not a
number, so a change to a control's own weight cannot leave its label behind —
and the suite reads the SPAN. *A test that read the button passed throughout.*

**EVERY SELECTED SPECIES TAB CARRIED A FOCUS RING AT REST.** Measured on a tab
nobody had touched: `inset gold 2px, rgba(0,107,207,.38) 0 0 0 3px`. Three
blocks in app.css were written as

    A[aria-selected="true"],
    A[aria-pressed="true"]:hover { … }

and **a comma-separated list does not share a trailing pseudo-class**, so the
bare selected selector applied unconditionally. The water bar was unaffected
because its tabs report `aria-pressed`, which is the selector the pseudo-class
happened to be attached to. This is what the Director suspected when he asked
us to confirm the selected segment was "not a hover state left on" — it was a
FOCUS state left on. Both bars now read `inset gold 2px` and nothing else.

**"Exactly the Calendar's selected segment" could NOT be verified here**, and
is reported rather than claimed: this repo's `mphb-availability-calendar` has
no segmented switch, and the W1 switch the brief refers to is not in any
branch in this container. What is verified is that Map and Animals are now
identical to each other, and the exact values are in the notes for comparison
on live.

### A 1.16px misalignment, found the 1.35.0 way

Two of the three chips sit inside a wrapper div carrying their menu's
`position: relative`. As BLOCKS containing an inline-flex button those
wrappers built a line box — about 46.3px around a 44px chip — so the row
centred the WRAPPER and dropped those two 1.16px below the Badges chip, which
has no wrapper (`.dccwl-subnav`, the category pill's, has been flex since
1.38.0, which is why only two of three were out). `display: flex` on
`.dccwl-monthpick` and `.dccwl-pick` builds no line box and all three share a
top. **Measured, not reasoned about: 245.94 against 244.78 at 390px** — the
same method that found the 0.9px baseline in 1.35.0, and it has its own
assertion rather than being swallowed by the row-count tolerance.

### Harness: still 33 suites, and one probe that was measuring the wrong thing

- **The mid-word-break probe counted RECTS, not LINES.** Chromium returns
  several client rects for a Range inside a flex item even when the word sits
  on one line, so re-pointing it at the reading cards reported every word in
  the source line as broken. It groups by rounded `top` now, and a forced
  `word-break: break-all` proves it still catches a real split — a probe that
  can only pass is the oldest prohibition in this harness.
- **Two assertions that encoded a superseded look were updated, never
  loosened:** ui-theme's "the pill is solid #006BCF" is now the Selector's
  white chip with its gold edge, radius and weight; ui-mapbar's "two controls,
  one state" section is replaced by the absence it became — no checkbox
  anywhere in the bar — plus what still has to be true, that a chip really
  adds and removes a layer.
- **A note that asserted nothing was replaced by an assertion.** The dates
  section read `.dccwl-water-stat-sub` — a deleted element — and printed it.
  It reads the cards' source lines now and requires none of them to carry a
  machine date, which is what the "a source name may carry a MONTH" exception
  actually needs.
- Eight mutations verified red, each restored with `cp`/`mv` and the whole
  harness re-run AFTER the restores: a line above the map host; the label span
  back at 400; the Selector's 24px padding; the Layers checkboxes back; a
  blue-filled chip; the fit widened to every marker; a legend string reverted;
  and a forced mid-word break.

### 36. 1.44.2 — the Calendar's segmented switch, and two rules that never applied

Rob's two answers and three things the Director found on live after 1.44.1.
**The Base Map ▾ menu stays as 1.44.1 built it** (satellite/streets plus
phone Fullscreen) — his answer to the question that release raised.

**THE SEGMENTED SWITCH IS THE AVAILABILITY CALENDAR'S, COPIED FROM ITS OWN
SOURCE.** 1.44.1 reported that "exactly the Calendar's selected segment"
could not be verified here; the Director sent the file instead of a
description — `mphb-availability-calendar/assets/css/staff.css` on branch
`origin/claude/review-shared-chat-bExtl`, lines ~1874–1933 and ~2361, which
is what live serves. So the whole switch is built from it: a 999px white
group 44px tall with a 2px #0A50B2 outline drawn by `::after`, transparent
segments with #0A50B2 text at 600, a 2px inset rule between them, the first
and last rounded on their outer edges, and the selected one solid #0A50B2
with white text.

**THIS REVERSES THE CORAL SELECTED STATE** (1.34.0 item 12, white ink in
1.36.0), which this file has carried in capitals for four releases. Said
outright so nobody restores it as a fix. Coral is now **hover only**, inside
`(hover: hover) and (pointer: fine)` — which is the Calendar's own guard and
also 1.38.0's: on a phone a tapped control keeps `:hover` until something
else is touched. 1.33.0's reason for the coral is untouched; what changed is
which state wears it.

**SEMANTICS STAY OURS.** The Calendar uses `role="radio"`/`aria-checked`;
the wildlife tabs are a real tablist with `aria-selected` (Rob's ask, 1.44.0)
and the water bars are `role="group"` toggles with `aria-pressed`. Every
state rule lists both attributes — matching one silently stops painting the
other bar, this file's oldest defect.

**THE SIZE IS A TOKEN, NOT THE CALENDAR'S LITERAL 14px.** `--dccwl-fs-seg:
0.7rem` IS 14px on the 20px deployment root, so live renders the Calendar's
exact size while a visitor who scales their text still gets a switch that
scales — this plugin's oldest typography rule, which a px value would break
and which `test-1270.php` lints for. It is a token rather than a literal in
the rule for a second reason: **the harness stands in for Raleway by
inflating a size token**, and a literal would have left that check measuring
the sandbox's narrower fallback face and passing while live wrapped. That is
the 1.32.1 defect exactly.

**"Does Fishing fit at 360px?" — measured, with the stand-in** (0.7rem × 1.21,
on the site kit, with the bar un-hidden because it ships hidden for the
no-JavaScript reader): **"Fishing" is 60px of a 172px segment at 360px**, and
60 of 152 at 320px. The tightest label in either bar is **"Summer" at 68px of
76px at 320px**, 89% of its segment. 14px with 12px of padding fits
everywhere, so no value was changed. The suite now measures SPILL as well as
wrapping — a nowrap label that does not fit overflows its segment and still
counts as one line — and fails on a segment narrower than 20px, because the
water bar measured 0px wide on the first run and every assertion passed
against nothing.

### Two rules that had never applied to anything

**`margin-inline: auto` ON A FLEX ITEM, which is why Month and Show sat at
opposite edges.** The Director measured the live container at 334px, not the
374px the harness had assumed, and found the two menu chips pushed apart with
the ⓘ on a second line. The cause was not width: `.dccwl-subnav` was in a
list of BLOCKS that centre themselves in the page, and it stopped being one
in 1.38.0 when the category pill moved into the chip row. **An auto margin on
a flex item absorbs its line's entire slack** — measured at 51.72px on each
side of the pill — and that is also what forced the wrap. Same family as the
`.dccwl-subnav { flex-direction: column }` leftover deleted in 1.38.0: a rule
written for a row that no longer exists, still in force.

**AND THE CHECK THAT SHOULD HAVE CAUGHT IT COULD NOT.** "Each line of the
group is centred" passes with auto margins, because the line still spans the
row and its midpoint is still the row's. The assertion that catches it looks
BETWEEN the chips: every neighbouring pair must sit exactly the row's own
`column-gap` apart. Verified red at `[32,32]`, `[17,17]` and `[245,245]`.

**THE MAP BAR'S DOUBLED CLASSES WERE NEVER ENOUGH.** The Director measured
"Colour by: Clarity ▾" and "Base Map ▾" at font-weight 400 while every
neighbour is 600 or 700. water.css declared `font-weight: 600` under a
comment reading *"Doubled classes to beat Bravada's (0,3,1) button reset"* —
and `.dccwl-drop-btn.dccwl-drop-btn` is **(0,2,0)**, which does not beat three
classes and an element. **The declaration had never applied, on any surface,
since it was written**, and nor had the bar's hover, its focus ring or the
colour control's PRESSED state: four rules, one wrong specificity. The bar's
coral hover on live was the KIT's, by coincidence.

Tripled with the section's own class they reach (0,4,0), which is what every
other control here uses. **The weight is 500**, read from
`--dccs-btn-weight` on the Cottage Selector's branch — the site button spec
it measured from "Send Message" on /contact/. Its answer CHIPS are 600, but
that is recorded there as a deliberate exception Rob asked for, and these are
buttons wearing the action-button look. Both numbers went to him in the
release notes.

**A MENU BUTTON'S LABEL IS ITS OWN SPAN NOW**, because the Director asked for
the weight asserted on the label and there was no label to assert on — the
text was a bare node. `dropLabel()` in water-map.js owns it, and water.css
gives it `font-weight: inherit`: app.css's type floor sets `.dccwl-app span`
to 400 and NAMES the element, so a new span would have rendered lighter than
its own button. That is the 1.44.1 defect, in a new place, by the same
mechanism — and it is why the span is `inherit` rather than a number.

### "Badges" is a round ⓘ, and that is what makes the row fit

Rob: "the same chip (white, 1px #F4DA62), a 44px circle, `aria-label="Badges"`
and the same popover". `.dccwl-chip-round` is the one difference — a fixed
44×44 with no padding and `flex: none`, because the base chip sizes to its
label and a one-glyph label would make a narrow oval.

**THE NAME MOVES TO `aria-label`, and that is the part to get right.** An
aria-label REPLACES a control's text for a screen reader (1.15.1), so with the
word gone it has to be the label or the button is announced as nothing. The
ⓘ is `aria-hidden`: it is the picture of the name, not the name. WCAG 2.5.3
label-in-name does not apply, because there is no visible text for the
accessible name to contain.

With it the three chips measure **270px of chips plus 10px of gaps in a 334px
container** at 390px, and the same in 304px at 360px — one centred line at
both, where the Director measured 328px of chips that could not share a line.
The harness now squeezes the row's parent to his figures rather than the
viewport's, and at the 25% Raleway stand-in it lands within a pixel of his
live widths (118/108/104 here against his 118/107/103).

### Harness: 33 suites, and three assertions that had stopped meaning anything

- **ui-motion's negative control was a flat `>= 10` for every surface** and
  the Calendar's `transition: none` took the hub to 2 and the water section
  to 7 — the tabs were most of what animated there. It is per-surface now,
  with the measured number and the reason beside each one, so a drop to zero
  still fails and the figures are a visible decision rather than a threshold
  quietly met.
- **ui-theme's hover check ran on a TOUCH page**, where the Calendar's
  `(hover: hover)` guard correctly does not apply — it read the resting
  colour and called the rule broken. It hovers on a mouse page now, and
  asserts the negative half too: the touch page must not match the query.
- **The Raleway stand-in inflated `--dccwl-fs-xs`**, which the new switch does
  not use. Re-pointed at `--dccwl-fs-seg`, and extended to the water bar
  because "Fishing" is the label that was asked about.
- Five mutations verified red, restored with `cp`/`mv`, whole harness re-run
  after: the selected segment coral at rest; the Colour by label at 400; a
  Badges chip with its word back; the same with the round class removed, so
  the row wraps at a 334px container; and `margin-inline: auto` back on the
  pill.

### 37. 1.44.3 — a segment is as wide as its label, and a probe that measured in whole pixels

Two small things from the Director's live pass on 1.44.2.

**EACH SEGMENT IS SIZED TO ITS OWN LABEL, which is the Calendar's
`width: auto`.** 1.44.2 copied the Calendar's look but kept `flex: 1 1 0` on
the segment, so every segment was an equal share of the row and **the longest
label got the least room on either side of it**: at 1280px he measured 59px
segments giving "Fishing" 6px of padding where "Map" and "Now" had 15.
Measured here before the change, at the Raleway stand-in: "Fishing" 7px
against "Now" 17px, "Animals" 7.9px against "Plants" 14.1px, and the season
bar stretched to **1264px** with 130px of padding around "Summer".

- `flex: 0 1 auto` and the group at `width: fit-content` with auto side
  margins. It may still SHRINK if a group ever outgrows its line — that is
  what `min-width: 0` is for (1.18.1) — but it never grows past its content.
- **`display: flex`, not `inline-flex`.** An inline box centres only if its
  parent says so, and these parents compute `text-align: left`; a block-level
  flex with `width: fit-content` and `margin-inline: auto` centres whatever
  the parent does. That is the 1.36.0 lesson, which cost a 490px offset once.
- **The `width: 100%` phone rules are gone from all three stylesheets** —
  app.css's two media blocks, water.css's tab bar and its 481px twin, and
  widget.css's 481px rule. One answer in one place; a narrow phone tightens
  the padding (the Calendar's own `0 8px` under 390px) instead of stretching
  the segments.

After: **exactly 12px each side at 390px and wider, 8px under 390px, on every
segment of every bar**, and the season bar is 264px instead of 1264.

**THE PADDING IS ASSERTED FROM THE TEXT, NOT FROM `padding-left`.** The
declaration is not the question — where the glyphs land is. The sweep also
asserts the other half, that no segment is WIDER than its label needs, which
is what would catch the equal-width layout coming back. **1280px is in the
sweep now**: the defect was invisible at phone widths, where every segment
had room to spare, and a phone-only check could never have seen it.

**AND A PROBE THAT MEASURED IN WHOLE PIXELS REPORTED A SPILL THAT DID NOT
EXIST.** `ui-mobile.mjs` compared a fractional text width against
`el.clientWidth`, which is an INTEGER: a 78.3px segment reports 78, so a
54.5px label inside 12px padding "spilled" 0.5px. It never showed while every
segment was far wider than its text, and it failed the moment they were sized
to their labels. Both sides are fractional now — `getBoundingClientRect()`
minus the computed padding and borders. **A measurement that rounds one side
of a comparison is not a measurement**, and the failure it produced looked
exactly like a real clip.

**"Data Age" (item 2), and the sweep is a record rather than a claim.** The
other labels on that bar were already Title Case and are now asserted with it
— Clarity, Level, Base Map, Satellite, Streets, Fullscreen — by opening both
menus so the check sees every label the bar can show. **`colorBy` ("Colour
by:") is deliberately exempt**: it introduces the segmented control and is
composed into the menu button's own text, and the Director has written it
that way in three briefs including the one asking for the sweep. Two labels
on OTHER surfaces are still sentence case and were reported rather than
changed, because the ask was the bar: **"Station page" and "Depth map (PDF)"**,
both in map popups.

Mutations verified red, restored with `cp`/`mv`, harness re-run after:
`flex: 1 1 0` back (3px of padding on "Animals", 10.5px on "Plants" — both
halves of the check firing), and "Data age" back.

### 38. 1.44.4 — American English, and Title Case where Rob's rule reaches

Rob's two rulings of 2026-10-21, then generalised on his instruction: **the
site is American, so every guest-facing string is American**, and the Title
Case sweep carries on past the map bar. 177 translatable strings changed.

**HE OVERRULED 1.44.3'S ONE EXEMPTION, AND HIS READING IS THE BETTER ONE.**
That release left `colorBy` as "Colour by:" and flagged it, arguing that it
introduces the segmented control and is composed into the menu button's own
text. His answer: *"'Colour by:' becomes 'Color By:', with American spelling
(the site is American) and Title Case. So the button reads 'Color By: Clarity
▾'."* Being composed into a button's label is what makes it **a button's
label** — exactly what his standing Title Case rule covers. The comment block
recording the exemption was rewritten rather than deleted, so the next reader
meets the ruling and not the superseded reasoning.

**THE TWO SEEDED STRINGS NEEDED AN `upgrade()` STEP, AND THAT IS THE 1.8.0
RULE, NOT AN EXTRA.** `default_links()`'s FWC label and the `fishing` block's
`license` sentence live INSIDE array-typed defaults, which `wp_parse_args`
shadows at key level — so on any site that has ever pressed Save, changing the
default does nothing for ever. `Water_Data::upgrade()` repairs both by
**exact match only**, on the 1.32.1 tile-template and 1.37.0 Esri-credit
precedent: an owner who retyped either line keeps their own wording, and
anything unrecognised is LEFT ALONE. The suite drives the real upgrade over a
stored row carrying all three cases — two seeded, one owner-typed — and
asserts the third is untouched.

**TWO SPECIES WERE RENAMED, AND ONE WAS DELIBERATELY NOT.** *Sciurus
carolinensis* and *Urocyon cinereoargenteus* are published as **Eastern Gray
Squirrel** and **Gray Fox** in American field guides, so they moved. The
**Cloudless Sulphur** did not: "Sulphur" is NABA's own published common name
for the *Phoebis* and *Colias* sulphurs, and a guide that "corrects" a
published common name is wrong in a way no spelling rule fixes. It is the
single row in the suite's allowlist, which is EXACT-MATCH on the whole literal
so an allowlisted name cannot excuse a British spelling elsewhere in the same
sentence. Same gate as the four scientific names decided from evidence in
batch 20 — never settle one of these by policy.

### `tools/tests/test-spelling.php`, and why it is tokenised

It reads the **first string argument of every i18n call**, through PHP's own
lexer, plus every `i18n.key || 'literal'` fallback in `assets/js/`. Nothing
else qualifies: a British spelling in a code comment, a variable name
(`$colourBtn`, `setColour`), a CSS class or an internal array key is invisible
to a guest, and a regex over whole files would flag all of them and bury the
real finding. Three things keep it honest:

- **Its first assertions are about the probe.** A sweep that finds nothing
  reports no problem — the 1.33.1 parser that returned an empty require list,
  and this harness's oldest prohibition. It pins the file count, the literal
  count, and that `class-water-render.php`'s own comments still quote "Colour
  by:" **while the extractor does not see it**. That last pair is also this
  repository's oldest trap in its newest form: the release record of a string
  is the thing most likely to match a naive scan for it.
- **The word list is explicit, never a suffix rule.** `\w+is(e|ed|ing)` looks
  like it covers -ise/-ize in one line and then fires on "wise", "promise",
  "rise" and "precise"; `\w*metre` fires on "parameter". A probe that fires on
  correct text teaches a reader to ignore it.
- **The Title Case half is scoped to the guest-facing renderers; the spelling
  half is not.** The admin page's `<h2>`s are the owner's editor screen, and
  one of them names the same block the front end heads — reported, not
  re-cased. Spelling has no such exemption.

**AND IT CAUGHT SIX THE REWRITER MISSED, IN THE RUN IT WAS WRITTEN.** The
americanise pass carried a 36-word map and changed 152 species strings; the
suite then found **moults, moulted, realise, specialises and kerbs ×2**, and
after `centimetre`/`millimetre` were added to the list, six more. A hand-built
word map can only catch the words its author thought of, which is the 1.39.1
lesson about fixtures wearing a different hat.

### The `&amp;` that rendered as `&amp;` on live for four releases

The fishing block's heading shipped from 1.44.0 as
`esc_html_e( 'Licences &amp; Keep-Limits — Florida FWC' )`. `esc_html_e()`
escapes the ampersand **again**, so live printed the entity itself. It was
invisible in the source because an entity inside an HTML file looks right,
and invisible to every suite because none of them read that string.

**It was found by looking at a screenshot.** Rob's own instruction writes the
name with one character — *"'Licences & Keep-Limits' → 'Licenses &
Keep-Limits'"* — which is the fix: a translatable string is TEXT, and the
escaper is what turns it into markup. `test-spelling.php` now fails on any
HTML entity in any translatable string.

### What was deliberately NOT changed, and reported instead

- **Accessible names.** An `aria-label` is spoken, never shown, and Title
  Casing a spoken phrase changes nothing for anyone who hears it. "Canal field
  guide", "Field guide sections", "Search the field guide", "Clear search",
  "Badge key", "Photo credits", "Close details", "Species details", "Previous
  species"/"Next species" and "What to show" all stay.
- **The screen-reader likelihood words** ("rarely seen", "possible", "good
  chance", "peak season"), which are read one per month inside a strip.
- **The lowercase date prefixes in the attribution stack** — "sampled
  07/27/2026", "reading", "surveyed". They are prose, not a label row, and the
  map popup's capitalised "Sampled:" is a different register documented since
  1.39.0. The two sitting on one page is a wording question for Rob.
- **Every Elementor PANEL label.** Only the owner sees those, in the editor.
- **The admin page's own headings**, for the same reason.
- **`i18n.median` has no reader at all** — `water-map.js` prints `usual:` and
  `water.js` never asks for it. By this plugin's own rule a string with no
  reader goes with its reader, but deleting one was outside "change nothing
  else"; flagged for the next round.

Mutations verified red, each restored with `cp`/`mv` and the whole harness
re-run AFTER the restores: "Colour by:" back, "Station page" back in both the
PHP and its JS fallback, "Eastern Grey Squirrel" back, and the `upgrade()`
repair step deleted.

### 39. 1.44.5 — the About panel was 583px inside a 390px phone, and the rule has a name for the sixth time

**THE CAUSE IS THE SAME ONE THIS FILE HAS RECORDED FIVE TIMES: A RULE
WRITTEN FOR THE WRONG PARENT IS INVISIBLE.** Every component rule in
water.css — the cards grid, the card ground, the label, the value, the source
chip's width cap, the headings, the link lists, the tier left-rules — was
scoped to `.dccwl-water`, the module's own `<section>`. But
`Water_Render::about_fold()` is called from `Render`'s FOOTNOTE ROW (1.34.0,
Rob's item 4), **outside that section**, so on /explore/ the About panel
rendered all of that markup with none of those rules in force. Measured here
at 390px: a content box from x = −96.5 to 486.5, **583px wide, clipped on
both sides**. The Director measured 520px on live at the same width. Same
defect, different metrics — this sandbox has no Raleway.

The same fold rendered INSIDE the standalone water widget is styled
correctly, which is why it never looked broken anywhere a session happened to
check.

**THE SCOPE IS A CLASS BOTH RENDERERS PUT ON.** The section carries
`dccwl-water dccwl-water-scope`; the About fold's `<details>` carries
`dccwl-water-scope`. All fifty descendant rules moved to it. `.dccwl-water`
keeps exactly the three rules that are genuinely about the section — its
font, its centring and its `> * + *` spacing — because those describe a block
in page flow and a `<details>` is not one; putting the section class on the
fold would have given its summary and body a `gap-lg` they never had.

**AND A FLOOR UNDER THE FIX, because the scope is the cause and not the
guarantee.** `minmax(min(230px, 100%), 1fr)` on the cards grid — a bare
`230px` track floor is a MINIMUM the grid must honour, so in any container
narrower than that the row grows past its parent rather than shrinking, with
no breakpoint able to help. And `overflow-wrap: anywhere` on the value, the
label, the attribution and the link lists: a source name, a URL or an
owner-typed almanac value is text this plugin did not write. `anywhere`
rather than `break-word` because only `anywhere` also shrinks the box's
min-content width, which is what a grid or flex track actually measures.

The source-name CHIP is deliberately excluded from that: it truncates with an
ellipsis and now carries the whole name in a `title` (the Director's own ask
— the full attribution was always printed in the stack below, so nothing was
lost, but a truncated name a pointer cannot resolve is needless). Wrapping a
sixty-character name inside a 44px chip is a different control.

### `tools/tests/ui-overflow.mjs`, and the check that could not have caught this

**A `scrollWidth` CHECK CANNOT SEE CLIPPED CONTENT.** Every suite here has
asked `scrollWidth - clientWidth` since 1.18.1 and it passed throughout: the
panel was clipped, so the document never grew and nothing could scroll to it.
*"The page does not scroll sideways"* and *"everything is on the screen"* are
two different claims, and only the second is the one a guest cares about.

So the new suite asks **each box**, not the document: every rendered element
with text of its own, measured against the viewport, at 360, 390 and 1280 —
across the Water views (Map, Now with every place chosen in turn, Fishing
with every season), the About fold open, every Wildlife section, a search,
a sample of species sheets, and /wildlife-guide/ with its credits panel open.
384 assertions.

**A HORIZONTAL SCROLLER IS ALLOWED TO HOLD CONTENT OFF SCREEN, AND THE FIRST
VERSION OF THE PROBE DID NOT KNOW THAT.** It reported 88 deck tiles as
defects — "Eastern Tiger Swallowtail" at x = 1285 in a 1280px window is the
deck's second page, reachable by swiping. A probe that fires on correct
behaviour teaches a reader to ignore it, which is the same prohibition the
spelling suite's explicit word list exists for. So inside a scroller the
question becomes *can the scroller reach it* — the box must lie within that
scroller's own scrollable extent — and the scrollers themselves are measured
against the viewport separately, because a deck may hold content past its own
right edge but may not itself hang off the screen.

Two guards keep it from passing on nothing: a sweep that inspects fewer boxes
than a floor fails, and a state it was told to reach but did not open fails.

**The sheet sample is BOUNDED and says so.** The Director wrote "each species
sheet"; there are 402, and three widths of 402 sheets is not a run anybody
waits for. The sample is chosen **from the live dataset, not named in the
file** — the longest common name, the longest scientific name, the longest
field mark — plus a hazard, whose sheet carries the extra "What To Do" panel.
A batch adding a longer name changes what the sweep opens with no edit here.
A sheet that overflows for a reason none of those capture would be missed;
the suite prints which it opened so the gap is visible rather than implied.

### The footer row reads the same open or shut (the Director's item 2)

His ruling is a claim about LAYOUT as well as wording, and three separate
things had to change for it to be true. Only the first was the one he
described; the other two were found by measuring the row he pointed at.

**1. "About" LEFT THE ROW WHENEVER IT OPENED.** `.dccwl-footnotes >
.dccwl-fullguide[open]` read `flex: 1 0 100%`, so the open `<details>` took
the whole row and its label dropped onto a line of its own beneath Guide ·
Credits. `display: contents` is what makes one `<details>` do both jobs: the
details' own box goes away, so its SUMMARY becomes a flex item of the row
beside the two links and its BODY becomes another with `flex: 1 0 100%`,
which in a wrapping flex container starts a new line. The panel is still full
width, which is what the old rule was for. It applies only while `[open]`, so
the closed row is the layout it has always had, and **the disclosure
semantics do not ride on the details' box**: the summary is still the click
and keyboard target, and sheet.js has set `aria-expanded` on it explicitly
since 1.40.1 — which exists precisely so the state is never inferred from
something a stylesheet can remove. Toggling by tap and by Enter is measured
at all three widths.

**2. "About" WAS PERMANENTLY UNDERLINED AND ITS NEIGHBOURS WERE NOT.** Rob's
item 5 of 1.44.0 — "no underline-and-arrow look; underline only on
hover/focus" — reached the two anchors through a (0,4,0) rule added when
1.43.0 made them links, and stopped at the `<summary>`, which kept
canal.css's (0,2,0) `text-decoration: underline`. The house pattern again:
the ruling was applied, just not everywhere it had to be.

**3. AND A 1px PANEL-BAR BORDER WAS COSTING HALF A PIXEL OF ALIGNMENT.**
app.css's `.dccwl-fullguide[open] > .dccwl-fullguide-summary` draws the rule
under a PANEL's title bar. There is no title bar in this row, and with
`box-sizing: border-box` and `min-height: 44px` that pixel came out of the
content box — so the label sat at 2130.55 where its neighbours sat at
2131.05. **The 1.35.0 family, found the 1.35.0 way**: diff the computed
styles of the two things that disagree rather than reasoning about which
property it ought to be. Four properties were ruled out by measurement
(font-size, line-height, padding, alignment) and the fifth was a border
nobody had thought to read. After: 0.00px across all three labels.

**One difference was measured and deliberately NOT changed.** The two
wrapper font-sizes in this row still differ — 15.6px on the anchors, 17.5px
on the summary — and it is INERT, because canal.css pins
`.dccwl-fullguide-text` and `-h` to `--dccwl-fs-xs` at (0,3,0) in both
places, which is 1.35.0's own fix still doing its job. A rule equalising it
was written, measured to change nothing, and deleted: **a rule that changes
nothing measurable is a rule the next reader has to re-derive.** It is
recorded in widget.css beside the two that did matter.

**4. AND THE META LINE HE DESCRIBED.** Opening the About fold revealed a
second underlined line beneath the row —
"the water, and where these readings come from" — and then the panel said it
again as "About the Water". His ruling: the row is **Guide · Credits ·
About** in every state, and the panel says what it is once, as a heading.

The meta span is gone from that summary, and the two `.dccwl-footnotes`
rules that revealed it went with it — **deleted, not left unmatched**, since
that fold was the only `<details>` left in the row after 1.43.0 turned Guide
and Credits into links. The sentence is not lost: it is still the summary's
`aria-label`, which is what a screen reader announces.
`.dccwl-fullguide-meta` itself stays in app.css — the photo-credits panel on
/wildlife-guide/ still uses it, inside a panel rather than a row.

### The Director's three rulings on 1.44.4's open items

- **aria-labels stay** (spoken, not shown), and so do the likelihood words
  and the lowercase `sampled` / `reading` / `surveyed` prefixes in the Now
  attribution — those are prose. The map popup's `Sampled:` keeps its Title
  Case because it is a label. **Two registers for two kinds of text is fine**,
  and that settles a question 1.44.4 raised.
- **The admin headings go Title Case.** His words: "Rob sees the admin too,
  and his rule is Title Case everywhere." He named one; all seven that were
  sentence case moved, because eight headings beside one is how a rule reads
  as a mistake — the same argument that Title Cased the map legend's level
  and freshness rows in 1.44.1.
- **`i18n.median` is deleted.** Nothing read it: the map popups print
  `usual:` (1.39.0, where the statistic was renamed in plain words) and
  water.js never asked for it. A string with no reader is a sentence a
  translator is asked for and nothing can print.

Mutations verified red AGAINST THE FINAL TREE, each restored with `cp`/`mv`
and the whole harness re-run after: the About fold's scope class removed
(589px in 360px — the live defect exactly), the source name back to `nowrap`
with no cap and no wrap, `flex: 1 0 100%` back on the open fold (labels at
`[942, 942, 991]` — About off the line), the panel-bar border back under the
open summary, and the meta line back in the row. **Re-running them after the
later edits mattered:** the first three were first verified against an
earlier state of this release, and a mutation that was red an hour ago is
evidence about that hour, not about what ships.

### 40. 1.44.6 — the last sentence-case card label, and a rhythm 1.44.5 left behind

Two things the Director measured in the open About panel on live.

**"Surface area" WAS THE LAST SENTENCE-CASE CARD LABEL IN THE PLUGIN, AND IT
SURVIVED TWO SWEEPS BECAUSE IT IS DATA.** The nine live labels went Title
Case in 1.44.1 — Water Level, Water Clarity (Secchi Depth), Dissolved Oxygen,
Trophic State Index (TSI), Depth Map, Recent Rain, Wind and the two Forecast
forms. This one is a seeded row in `Water_Data::default_almanac()`, so a
reader sweeping the RENDERERS never meets it, and 1.44.1 explicitly set it
aside as "an owner-edited label" — which it is not: it is **our** default,
and the owner's own rows are the ones beside it.

It also needed an `upgrade()` step (the 1.8.0 rule, for the fourth time in
this release series), and that step matches on **the label AND the waterbody
together**. A label is not unique: "Surface area" for Lake Harris is somebody
else's row, and the suite proves the repair leaves it alone.

**TWO SUITES NOW ASSERT THE RULE RATHER THAN THE STRING**, so a tenth builder
or a second seeded row cannot be missed the same way:

- `test-spelling.php` walks `default_almanac()` and requires every word of
  every card label to start upper case, small words excepted.
- `test-water-parts.php` does the same over the facts the REAL builders
  produce — the 1.33.1 rule that a suite must exercise the path production
  takes. Two exemptions, both because the text is not ours: everything after
  an em dash (NWS supplies "This Afternoon"; the owner supplies a waterbody
  name), and the small words. It also counts what it inspected, because a
  sweep that saw nothing reports no problem.

### The `> * + *` rhythm was right about the `<details>` and wrong about its body

1.44.5 moved fifty rules from `.dccwl-water` to `.dccwl-water-scope` and
deliberately left three behind, this among them, on the reasoning that they
"describe a block in page flow and a `<details>` is not one". **That was
right about the `<details>` and wrong about its BODY**, which is exactly such
a block and holds the same almanac / About-the-Water / links children the
section holds. So "Official Information" sat **0px** below the Surface Area
card inside the fold while the section spaced the same blocks by
`--dccwl-gap-lg`. Measured at 390px and 1280px here; the Director measured it
on live at 1280px.

The rule now names both — the section and
`.dccwl-water-aboutfold > .dccwl-fullguide-body` — rather than putting the
scope class on the `<details>`, which would have given its summary and body a
gap they have never had. That distinction is the one 1.44.5 drew, kept.

**THE GUARD READS THE REQUIRED GAP FROM THE SECTION, NOT FROM A LITERAL.**
The claim is "the same spacing as the section", so a release that changes the
token has to move both or fail; a typed `10` would make it a check on a
number nobody chose twice.

**AND RESOLVING THAT TOKEN IS NOT PARSING IT.** `--dccwl-gap-lg` computes to
the string `calc(10px * 1)`, and `parseFloat` of that is `NaN` — which the
first version turned into `0` and then cheerfully asserted that every gap was
"at least 0px apart". **The `want > 0` guard caught it in the run it was
written**, which is the only reason it is not still there. The browser
resolves the token on a throwaway element now: a measurement, not a reading
of its text. Same family as every other probe-first assertion in this
harness.

One more fixture lesson, from the same run: `test-spelling.php`'s idempotency
check compared the option against a snapshot taken **before** the new almanac
step wrote to it, and failed. It reads its own baseline now. *A fixture that
compares against something captured before the state it is testing is not
comparing anything.*

**Live, reported and not changed:** the Director counted five Official
Information links where the defaults seed six. Rob's stored option has no
Haynes Creek row, so that is his setting and not a regression — and the
1.8.0 merge rule is why it stays his.

Mutations verified red against the final tree, each restored with `cp`/`mv`
and the whole harness re-run after: the old label back, the almanac repair
step deleted, and the fold's spacing removed (`[{"gap":0}]` at all three
widths).
