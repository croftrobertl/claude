=== DCC Wildlife ===
Contributors: doracanalcourt
Tags: wildlife, fishing, elementor, shortcode, nature
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.8.1
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

"On the Canal This Month" wildlife guide, plus a source-gated fishing & water-conditions module, for Dora Canal Court.

== Description ==

DCC Wildlife shows guests what they can spot on the Dora Canal right now:

* **Spotlight band** — a compact scrollable strip of species chips for the current month, with a headline like "August on the canal — 6 species at their peak". The month is chosen in the visitor's browser, so aggressive page caching never shows a stale month.
* **Bespoke species art** — every species is drawn as a flat two-tone inline-SVG sprite in the site's deep-teal illustration language (no platform emoji, so the art is identical on every device). Sprites ship once per page as a hidden symbol sheet.
* **Detail panel** — tapping any chip expands one shared panel below it: the species sprite staged in a drawn SVG scene medallion, the fact, best-time pill, where-to-look line and derived peak-months range.
* **Field guide** — all species in three compact tabs (Critters, Birds, Plants); same tap-for-details chips.
* **Month browser** — prev/next arrows plus 12 mini buttons to peek at any month, entirely client-side.

**Fishing & water conditions** (v1.4.0) is a second, separately-placed module:

* Every fact carries a source and a date, enforced structurally — a value with no source cannot be constructed, so it cannot be rendered. Unknown fields are omitted entirely rather than shown as "unknown".
* Three confidence tiers: `live` (a gauge reading fetched now), `published` (an official dataset) and `general` (angling guidance, rendered in a visibly separate voice). Anything else is dropped.
* An optional, **off-by-default** live layer fetches public USGS gauge data and the NWS forecast server-side into a transient, exposed through a REST route so page caching can never serve a stale reading. Each row shows the measurement time, not the fetch time.
* **Renders nothing at all** until it holds a sourced condition or a live reading — so it can be placed before it is populated and lights up as it fills.
* Live water level is expressed as a deviation ("about 5 inches below normal for August"), never as the raw gauge elevation, which a guest would read as water depth.
* Water clarity, dissolved oxygen, TSI and a bathymetric depth map come from the Lake County Water Atlas, each with its own units, precision, sample date and station read from the payload.
* Lines stay silent when they have nothing to say — a level near its monthly norm, or a dry couple of days, prints nothing rather than noise.
* Chain-wide: every water compared against its OWN long-run median, with per-water staleness so an eighteen-year-old reading can never render as current.
* An optional chain map — boat ramps, waters and monitoring stations — that loads nothing external until a guest opens it.
* See WATER-SOURCES.md for the full audit trail, what was left out and why.

The wildlife guide and the water almanac are 100% WordPress-native: no external services, no API keys, no CDN scripts, no webfonts, no image files (inline SVG only). Assets load only on pages that use a widget or shortcode. The optional live layer is the single, clearly-flagged exception and requires no keys or accounts.

== Usage ==

* Elementor: add the **DCC Wildlife — On the Canal** widget (category "Dora Canal Court"). Controls: title override, show/hide field guide, show/hide month browser, compact mode (spotlight band only).
* Anywhere else: `[dcc_wildlife title="" guide="yes" browser="yes" compact="no"]`.
* Fishing & water: the **DCC Water — Fishing & Conditions** Elementor widget, or `[dcc_water title=""]`. Content is managed under DCC → Wildlife (Field guide / Water / Map). It renders nowhere until placed — nothing is auto-injected.
* Season countdown: on by default under the wildlife widget (its "Show season countdown" toggle controls the append per placement), or place the **DCC Wildlife — Season Countdown** widget / `[dcc_wildlife_countdown]` anywhere on its own. One line per page whichever combination is used; the sitewide switch lives in DCC → Wildlife.

Developers can filter the species registry with `dcc_wl_species`, the monthly likelihood table with `dcc_wl_calendar`, and almanac rows with `dcc_wl_water_almanac` (rows added through that filter are subject to the same attribution gate).

== Changelog ==

= 1.8.1 =
* **The season countdown is now placeable like everything else — through Elementor.** 1.8.0 delivered it via shortcodes only, but the live guest pages are built from the native Elementor widgets, so it had no way onto a real page. Two additions, one shared renderer:
* **"Show season countdown" toggle on the On the Canal widget** (default on, mirroring the sitewide switch) — the line appends under the guide wherever that widget already sits. Widgets saved before 1.8.1 keep the 1.8.0 auto-append behaviour unchanged.
* **A standalone "DCC Wildlife — Season Countdown" widget** (`dccwl_countdown`, in the Dora Canal Court category) for placing the line on its own. In the editor an empty render explains itself instead of looking broken.
* **Exactly one line per page**, whichever combination is placed: the shell is emitted once (first entry point wins) and the JS ships once. The `[dcc_wildlife_countdown]` shortcode still works as a third entry point.
* The sitewide toggle in DCC → Wildlife still overrides everything: off means no path renders anything.

= 1.8.0 =
Implements the 1.7.3 self-audit findings, numbered below as in that report.

* **Season countdown absorbed from the mu-plugin** (audit decision 1). The "Manatee season starts in N days" line is now rendered natively: appended to the wildlife widget when the toggle is on (same markup, same styling, same option `dcc_wl_countdown_enabled`), plus a `[dcc_wildlife_countdown]` shortcode for manual placement. The day count is computed in the browser in canal time, never baked into cached HTML. While `dcc-wildlife-countdown.php` still exists it keeps rendering and this plugin stands down, so the handover is safe in either order — **after verifying this version on the live site, delete `wp-content/mu-plugins/dcc-wildlife-countdown.php`**; the settings page then moves to DCC → Wildlife on its own.
* **Settings migration + merge hardening** (finding 1). A stored `chain_waters` array saved by 1.7.0 silently shadowed the coordinates seeded in 1.7.1, and no amount of re-saving healed it. A one-time upgrade routine now backfills empty coordinates for known Atlas ids into the stored option, `chain_waters()` does the same at read time as belt-and-braces, and a version-keyed migration runner exists so every future array-typed default ships with its own step instead of relying on `wp_parse_args`.
* **Map popups fully translatable** (finding 2). Every popup label, the level wording, the FWC source line and the compact age units now flow through the i18n bridge; the dead `lanes` key is gone.
* **Map legend added** (finding 3). Each colour-by mode shows its own decoder row under the control bar — grey explicitly means "no current reading", so the honesty machinery is finally visible.
* **Wildlife guide attribution line** (audit decision 2): one quiet sentence — "Wildlife notes are local knowledge from your hosts — sightings vary."
* **Uninstall support with an opt-in** (finding 10, audit decision 3). `uninstall.php` always removes cached transients; settings, the countdown toggle and any old sighting posts are removed only when "Delete all plugin data when the plugin is uninstalled" is checked (default off), and the countdown option is never touched while the mu-plugin file still exists.
* **Rainfall wording** (finding 8, audit decision 4): "over the two most recent reporting days" — the last reported day can be today's partial total, and the note already names both dates.
* The chain map is reachable even when the conditions strip is empty (finding 6) — the map is served independently of the strip, so a live-only section no longer hides the Open button behind a quiet day.
* Latent number-formatting bug fixed in the map (finding 5): trailing-zero trimming could have turned 60 into 6 at zero decimal places.
* Map "data age" colouring aligned to the 45-day staleness cutoff used everywhere else (finding 7).
* Dead `usgs_sites` setting removed (finding 9) — nothing had read it since 1.6.0; gauge discovery now fills the rain-gauge field, the one USGS site in use. The stored key is dropped by the migration.

= 1.7.3 =
* **Sample dates no longer print a midnight that never happened.** Lab samples, daily-value levels, rainfall totals and bathymetric surveys are dated to the day, so they now render as "sampled May 28, 2026" rather than "sampled May 28, 12:00 AM". Only the NWS forecast, which carries a real issuance time, still shows a clock. The producing code declares the precision rather than the renderer guessing, with an inference fallback for owner-entered rows.
* **Fixes a timezone off-by-one found while testing the above:** a bare date parses as midnight UTC, so any guest west of UTC was shown the previous day. Date-only values are now read in the source's own frame and render as the same calendar date in every timezone.
* **Depth map label fixed.** `UNKNOWN` is the literal method the Atlas returns for most of the chain's surveys; it is now treated as absent, and the label leads with the survey year — "Bathymetric survey, 2013 (DGPS-SONAR)", or just "Bathymetric survey, 2014" when no real method is given.
* **Depth map selection: newest survey wins.** Waters usually publish a same-date pair (one UNKNOWN, one DGPS-SONAR) that are different exports of one survey, so date decides first and method only breaks a tie. Preferring the labelled method outright would have handed Lake Harris a 2001 map in place of its 2014 one. Waters with no bathymetry at all simply omit the row.

= 1.7.2 =
* **"Find more chain waters"** — a discovery sweep in DCC → Wildlife that asks the Water Atlas what lies nearest, from the property *and* from every water already listed, so the far ends of the chain turn up despite the API's 20-result cap. Candidates come back with real ids, coordinates and distance for one-click adding; nothing is added automatically, because the endpoint returns ponds and unrelated water too.
* Request budgets raised and sweep points capped so a chain of twenty-odd waters warms up progressively rather than bursting at an academic API. A water with nothing cached yet simply does not appear until it does.

= 1.7.1 =
* **Satellite base layer added** alongside streets, defaulting to satellite — structure, grass lines and shoreline read far better from imagery. Each layer carries its own required attribution (Esri and OpenStreetMap respectively), swapped by Leaflet with the layer.
* Both tile URLs and both attribution strings are **settings**, so swapping providers is a paste rather than a release.
* **Honest failure:** sustained tile errors fall back to the other layer, and if both fail the imagery is dropped in favour of markers on a plain background with a one-line explanation — never a grid of grey squares.
* **Fixes the countdown option key.** The mu-plugin uses `dcc_wl_countdown_enabled` with a default of 1, not the `dcc_wildlife_countdown` inferred in 1.7.0, which would have shown the toggle as off the first time.
* **Waterbody coordinates seeded** for all ten chain waters from the Atlas's own centroids, so the chain is drawn on the map rather than only listed.

= 1.7.0 =
* **Fixes two bugs that shipped in 1.6.0** and returned one live reading out of seven. The Water Atlas wraps every reading in a `{name, payloadType, payload}` envelope and the component finder was returning the wrapper rather than the payload, so every reading failed its age check and was silently dropped. Separately, NWS forecasts do not carry `properties.updated` — they carry `updateTime` — so forecast and wind were dropped every time. Both now have regression tests; both were invisible to an offline build.
* **"From the dock" and the rain note removed entirely** at the owner's request, along with an unattributed claim about the canal that had propagated into the documentation as though it were his observation. The module now speaks at Harris Chain scale from sourced data instead.
* **Chain-wide.** Ten Harris Chain waters, ids verified live, each compared against its OWN long-run median — a chain-wide average would be meaningless when the medians run from 1.21 to 2.80 ft. Staleness is per-water: Lake Griffin's 2008 level and Lake Yale's 2025 level are flagged and excluded rather than shown as current.
* **One settings page.** The season-countdown toggle moves in from the site mu-plugin, so DCC → Wildlife and DCC → Water become a single page with Field guide / Water / Map sections. The toggle keeps its own option so the existing value survives, and the page only claims the `dcc-wildlife` slug once the mu-plugin releases it.
* **New chain map** (optional, off by default): boat ramps from FWC's public inventory with `Status` honoured, chain waters, monitoring stations and the cottages. Colour by clarity, level or data age. Nothing external — Leaflet, tiles, map data — loads until a guest presses Open. Satellite imagery is deliberately absent: its licensing for a commercial site could not be verified, so the map ships with OpenStreetMap only.
* Straight-line distances from the cottages, labelled as such — never drive time.

= 1.6.0 =
* Lake County Water Atlas fully wired after the endpoints were resolved live. Two earlier assumptions were wrong and are corrected: the API key is the Water Atlas waterbody id (Lake Dora = 7972), not the FDEP WBID (2831B); and Secchi lives in the WaterQuality report, not the WaterClarity report (which is an annual colour/chlorophyll/turbidity summary carrying no Secchi at all). Also recorded: no /api/ path prefix, and `s` is an integer Site Id.
* **Water level reinstated** from SJRWMD station 30013010, which is on Lake Dora itself — unlike the USGS gauges, which are now dropped entirely. Shown as a deviation from the API's own monthly norm ("about 5 inches below normal for August"), with the raw reading, datum and 1994–2026 record in the small print.
* **Water clarity** now uses the API's own period-of-record statistics: "3.61 ft — clearer than usual here; the long-run median is 1.50 ft across 1,246 samples since 1978". The current-versus-stale label is gone — the sample date is stated plainly instead, because monthly sampling made the old rule read as permanently broken.
* **Dissolved oxygen and TSI** added, each with a one-line plain-English gloss. Turbidity deliberately excluded.
* **Bathymetric depth map** linked (LCWA, DGPS-SONAR, surveyed 2013) — answering the "how deep is the water" question that had been open since 1.4.0 because no single depth figure could be sourced.
* Units and precision are read from each payload and never assumed.
* Lines stay silent when they have nothing to say: a level within 2 inches of its monthly norm, or a dry two days of rainfall, renders nothing.
* Render bar raised: almanac rows carry a section, and "About the water" rows such as surface area no longer make the section appear on their own — they render in their own block below the conditions.

= 1.5.0 =
* Sources verified: USGS gauge IDs, NWS grid and the Lake County Water Atlas were confirmed live, and the module is now seeded with those checked values (property coordinates, five active Lake County gauges, Lake Dora's area as the first published almanac row).
* **Auto-hide:** the module renders nothing at all unless it has a sourced fact, the owner's own words, or a live layer that could return something. Previously an unpopulated module emitted 1,289 bytes of heading and national-homepage links; it now emits 0.
* **Water temperature removed entirely, deliberately and permanently.** The nearest `00010` gauges are springs (~72 °F year round) while the canal swings from the fifties to near ninety — a reading that would be wrong in exactly the direction that matters. The C→F conversion path is deleted and a comment records why.
* **Water level is shown as a deviation, never raw elevation.** "About 4 inches above normal for this week", with the gauge reading and comparison basis in the small print. "Normal for this week" is only said when the record supports it (3+ distinct years); otherwise it falls back to a trailing 30-day mean and says so.
* New live figures: two-day rainfall totals (labelled as calendar days, not a rolling 48 hours) and Water Atlas Secchi clarity with staleness handling — readings over 45 days are labelled "most recent known reading", over a year are dropped.
* The owner's note about what rain does to the canal renders directly beneath the measured rainfall, in his voice, never blended into it.
* Staleness guard: instantaneous readings older than 6 hours are dropped, so a dead series (like 02238000's flow, offline since March) cannot render as current.
* Settings moved from Settings → DCC Water to the consolidated **DCC → Water** menu, with a fallback to Settings if the DCC parent is absent. Slug stays `dcc-wildlife-water` so the countdown mu-plugin's page is untouched.
* Authority links deep-linked where a deep link was verified (Lake Dora waterbody page, per-gauge USGS monitoring locations).

= 1.4.0 =
* New "Fishing & water conditions" module: Elementor widget `dccwl_water` + `[dcc_water]` shortcode, placed manually and rendering nowhere until placed.
* Source gating is structural: `Water_Fact` has a private constructor and a single factory that returns null unless the input carries a valid tier, a source name and a date, so no code path can display an unattributed claim.
* Optional off-by-default live layer (USGS + NWS), fetched server-side into a transient and served via the `dcc-wildlife/v1/conditions` REST route; the cached HTML holds only a shell. Failures render as an absent strip, never an error or a spinner.
* Admin gauge discovery queries the USGS site service from the live server so site IDs come from USGS rather than from memory.
* Settings → DCC Water, at slug `dcc-wildlife-water` — deliberately NOT the mu-plugin's `dcc-wildlife` slug, so neither page disappears.
* Plugin header updated to describe what actually happens instead of claiming "no external services" while making network calls.
* Almanac ships empty; WATER-SOURCES.md documents every fact that can reach the page, what was omitted and why, and the questions only the owner can answer.

= 1.3.0 =
* Bespoke species sprites: all 17 species now render as hand-drawn, single-style inline-SVG silhouettes (deep teals + per-species accent colors) instead of platform emoji, in both the chips and the scene medallions. The sprites ship once per page as a hidden <symbol> sheet referenced via <use> (~12.5KB minified / ~3.4KB gzipped for the whole set). The critters medallion vignette was lightened so dark waterline silhouettes read against it. Emoji remain only as a fallback for filter-added species without a sprite. No layout, interaction or data changes.

= 1.2.0 =
* Removed the guest sightings module entirely (form, moderation CPT, AJAX endpoints, settings page) — too little use to keep. The widget is now fully read-only with zero AJAX. Already-saved sighting posts remain in the database, just without an admin UI; restore the module from git history (v1.1.0) if it is ever wanted again.

= 1.1.0 =
* UI overhaul: compact chip-based spotlight band with a month headline, one shared expanding detail panel with drawn SVG scene medallions, tabbed field guide, arrow + mini-button month nav. Default render is a fraction of the old height; everything else is behind a tap.
* Elementor category corrected to the shared "Dora Canal Court" (`dcc-widgets`) category.

= 1.0.0 =
* Initial release.
