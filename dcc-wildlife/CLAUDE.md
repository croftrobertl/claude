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
