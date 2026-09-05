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
  relaxed on purpose: 17 of the 24 species now carry a real licensed photo
  in `assets/photos/<id>.jpg`, shown as the hero of the detail sheet only
  (the small tiles keep the SVG sprite, so the spotlight/guide grids still
  ship no images). Each photo is a free-tier **Adobe Stock** license,
  visually vetted for the correct species, and optimised to ≤ ~210KB; they
  load `loading="lazy"`, one at a time, so a guest who never opens a species
  pays nothing. The 7 species with no accurate free photo (ibis, wood stork,
  little blue / tricolored heron, water snake, apple snail, resurrection
  fern) DELIBERATELY keep their drawn scene — never swap in a wrong-species
  photo to fill the gap. `Species::photos()` is the map; the credit line and
  the `photoCredit` string are load-bearing (the licence expects
  attribution). DO NOT delete `assets/photos/` as a "no image files"
  cleanup — it is now sanctioned. Still no webfonts, no CDN, no per-tile
  images.
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

Height budget for the default render: **≤ 560px desktop / ≤ 760px mobile**
(measured 533px / 745px). Desktop is back at its original 1.1.0 figure —
1.9.0 needed 600px to hold the hero stat, and 1.9.1's tighter cozy spacing
more than paid that back. Mobile moved from 720px because the Guide's
tile-min resolves to TWO columns on a 375px screen; 1.9.0 forced three
across to protect the old number, which made the two apps look different
in exactly the place most guests see them. Matching won.
Everything else lives behind interaction:

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
(
  cd "$(git rev-parse --show-toplevel)" &&
  V=$(sed -n 's/^ \* Version: *//p' dcc-wildlife/dcc-wildlife.php | head -1 | tr -d '[:space:]') &&
  zip -r "Wildlife $V.zip" dcc-wildlife -x '*.DS_Store' '*.md' 'dcc-wildlife/tools/*'
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
