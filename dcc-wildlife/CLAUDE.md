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
                              #   output); prints DCC_WL_CFG inline JSON once
includes/class-widget.php     # Elementor widget (free APIs only); thin Render wrapper
includes/class-water-fact.php   # THE GATE: private ctor + make(); no source => no Fact
includes/class-water-data.php   # Stored settings + almanac (ships empty, filterable)
includes/class-water-live.php   # USGS + NWS clients, transients, backoff, gauge discovery
includes/class-water-rest.php   # /conditions (public, serves cache) + /discover-gauges (admin)
includes/class-water-render.php # Water widget/shortcode renderer; static server-side, live client-side
includes/class-water-admin.php  # Settings -> DCC Water (slug dcc-wildlife-water)
includes/class-water-widget.php # Elementor widget dccwl_water
assets/css/widget.css         # One CSS file; palette navy #0a3d62 / coral #e8604f
assets/js/widget.js           # One vanilla-JS file, no jQuery, no AJAX
assets/css/water.css          # Water module styles (loaded only where placed)
assets/js/water.js            # Fills the live strip from the REST route
assets/js/admin-water.js      # Repeatable rows + USGS gauge discovery (admin only)
```

Data model: the registry (id, emoji, name, group, fact, best, where, mascot)
and the calendar (12 ints per species, 0=rare 1=possible 2=good 3=peak) live
in `class-species.php`. Spotlight = value ≥ 2 for the shown month, ordered
value desc with the heron (mascot) first among ties; value-3 chips get a
peak tick and the panel a "Peak season" badge. The "Best: Nov–Mar" ranges
are derived in PHP (`best_months_label`, value-3 months falling back to the
row max, wrapping across the year end) and shipped per species as
`bestLabel` in the config JSON.

## UI architecture (compact + interactive, since v1.1.0)

Height budget for the default render: **≤ 560px desktop / ≤ 720px mobile**
(measured ~310px / ~410px). Everything else lives behind interaction:

- **Hero**: JS sets "{Month} on the canal" + "N species at their peak"
  from the calendar data (with a custom title, the month moves into the
  subline). Both lines have reserved min-heights — no layout shift.
- **Spotlight band**: one horizontally scrollable row of chips
  (scroll-snap, JS-toggled edge fades, ~40ms staggered fade-in on month
  change, capped).
- **One shared detail panel per widget instance**: a single `.dccwl-panel`
  moved by JS between the slot under the spotlight and the slot under the
  guide. Chips are buttons with `aria-expanded` + `aria-controls`; Escape
  or the ✕ closes and restores focus; tapping another chip crossfades the
  body in place. Slots animate `grid-template-rows: 0fr ↔ 1fr` (the
  no-jump technique — do NOT switch to max-height hacks).
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
  `prefers-reduced-motion` (panels still open — they just snap).

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
- **The almanac ships empty on purpose.** It was built with no outbound
  network access, so no depth, clarity reading, gauge ID or species list
  could be verified — so none was written. Facts enter only via the admin
  form, the `dcc_wl_water_almanac` filter, or the live layer; all three pass
  through the same gate.
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
- **Admin slug is `dcc-wildlife-water`, NOT `dcc-wildlife`.** The site
  mu-plugin `dcc-wildlife-countdown.php` owns `dcc-wildlife`; taking it would
  make one of the two pages vanish.
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

# Build the installable zip (upload via WP Admin → Plugins → Add New → Upload)
( cd $(git rev-parse --show-toplevel) && zip -r dcc-wildlife.zip dcc-wildlife )
```

## Manual smoke-test checklist (staging)

- Widget renders with defaults; `[dcc_wildlife]` renders identically; the
  widget appears under "Dora Canal Court" in the Elementor panel (and no
  "Claude Code" category is created by this plugin).
- Default render ≤ 560px desktop / ≤ 720px at 375px width; zero horizontal
  overflow at 375px.
- View source: no month-specific markup server-side; change the OS clock →
  headline/spotlight change; arrows + all 12 mini buttons work; the
  "N species at their peak" count matches the calendar table.
- Chip → panel open/swap/close by mouse, touch and keyboard; Escape closes
  and restores focus; reduced-motion OS setting → no animation anywhere but
  the panel still opens.
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
- Water module: confirm Settings → DCC Water and the mu-plugin's
  DCC → Wildlife page BOTH still appear in wp-admin.
