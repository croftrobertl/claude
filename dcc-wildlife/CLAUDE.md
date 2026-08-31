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

- **No API keys, no accounts, no CDN scripts, no webfonts, no image files,
  ever.** The wildlife guide and the water almanac make ZERO network calls.
  v1.4.0 added one deliberate, negotiated exception: the water module's
  **optional, off-by-default** live layer calls two keyless public-domain
  APIs (USGS, NWS) server-side. It was resolved in the open — the plugin
  header was rewritten to describe what actually happens rather than keep
  claiming "no external services". Do not re-broaden that promise, and do
  not add a third remote source without the same conversation.
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
assets/css/app.css            # THE TOKEN LAYER (1.9.0): every colour/radius/gap
                              #   /duration + density, glass and dark modifiers,
                              #   plus the shared primitives (tiles, sheet,
                              #   chips, buttons). Dependency of both widget
                              #   stylesheets — re-theming happens HERE only
assets/js/sheet.js            # THE SHARED OVERLAY (1.9.0): one sliding sheet for
                              #   the species detail AND the chain map; focus
                              #   trap, Escape/back/scrim/history close,
                              #   scroll-lock. Dependency of both widget scripts
tools/extract-guest-guide-tokens.js # Console snippet the owner runs on /guest/
                              #   to capture the real Guest Guide token values
assets/css/widget.css         # Month widget; palette navy #0a3d62 / coral #e8604f
assets/js/widget.js           # One vanilla-JS file, no jQuery, no AJAX
assets/css/water.css          # Water module styles (loaded only where placed)
assets/js/water.js            # Fills the live strip from the REST route
assets/js/admin-water.js      # Repeatable rows + USGS gauge discovery (admin only)
assets/js/water-map.js        # The chain map — fetched on demand, never enqueued
```

Data model: the registry (id, emoji, name, group, fact, best, where, mascot)
and the calendar (12 ints per species, 0=rare 1=possible 2=good 3=peak) live
in `class-species.php`. Spotlight = value ≥ 2 for the shown month, ordered
value desc with the heron (mascot) first among ties; value-3 chips get a
peak tick and the panel a "Peak season" badge. The "Best: Nov–Mar" ranges
are derived in PHP (`best_months_label`, value-3 months falling back to the
row max, wrapping across the year end) and shipped per species as
`bestLabel` in the config JSON.

## UI architecture (the app language, since v1.9.0)

v1.9.0 rebuilt the UI to speak the DCC Guest Guide's visual language so
/guest/ and the wildlife pages read as one app. **It changed chrome and
interaction only** — no data source, REST route, fetch rule, countdown
maths or any part of the Water_Fact gate was touched, and that separation
is worth preserving in any future re-skin.

**THE TOKEN VALUES ARE NOT MEASURED FROM THE GUEST GUIDE.** That plugin was
not readable from the build environment (not in this repo; the live site is
unreachable from it), so `app.css` carries Wildlife's own verified palette
arranged in the Guest Guide's token STRUCTURE, with each name mapped to its
`--dccgg-` counterpart in a comment. Matching the two apps for real is a
swap of that one block — run `tools/extract-guest-guide-tokens.js` in the
browser console on /guest/ and paste what it prints. Do not invent
`--dccgg-` values; that is the same failure this project has guarded
against everywhere else. The density/dark defaults (`dccwl-density-cozy`,
`dccwl-dark-auto`) are a best guess from the brief's own class names and
are filterable via `dcc_wl_app_classes`.

Height budget for the default render: **≤ 600px desktop / ≤ 720px mobile**
(measured 562px / 699px). The desktop figure was 560px through 1.8.x; it
moved in 1.9.0 to hold the hero stat, which is ~113px of new content the
old budget never accounted for. Mobile still fits its original figure — the
guide grid goes three tiles across on a phone specifically so it does.
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
- **Dark mode** is auto via `prefers-color-scheme`, and every colour is
  defined on the base selector first — the dark block only REDEFINES
  tokens, so no surface can come out unstyled. A test asserts that
  property statically. Two dark-mode rules are load-bearing: the widget
  paints its OWN background (Bravada has no dark mode, so otherwise a
  dark-OS visitor gets light-on-light text), and the sprite icon holders
  keep a LIGHT ground (the deep-teal silhouettes vanish on a dark tile —
  the same trap 1.3.0 hit with the navy expanded chip).

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
(
  cd "$(git rev-parse --show-toplevel)" &&
  V=$(sed -n 's/^ \* Version: *//p' dcc-wildlife/dcc-wildlife.php | head -1 | tr -d '[:space:]') &&
  zip -r "Wildlife $V.zip" dcc-wildlife -x '*.DS_Store'
)
```

Deliver that file to the owner for the Plugins → Add New → Upload route.
`Wildlife *.zip` is gitignored, so build artifacts never get committed.

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
- Side by side with /guest/: same tiles, same drawer motion, same buttons,
  same density, same dark-mode behaviour. (Until the Guest Guide's real
  token values are pasted into app.css this will match in STRUCTURE but not
  in exact hue — see the UI architecture section.)
- Toggle the OS to dark: every surface and string stays legible on both
  widgets, and the species sprites keep their light backing.
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
