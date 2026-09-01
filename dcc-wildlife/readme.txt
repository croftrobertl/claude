=== DCC Wildlife ===
Contributors: doracanalcourt
Tags: wildlife, fishing, elementor, shortcode, nature
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.10.2
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

"On the Canal This Month" wildlife guide, plus a source-gated fishing & water-conditions module, for Dora Canal Court.

== Description ==

DCC Wildlife shows guests what they can spot on the Dora Canal right now:

* **Spotlight band** — a compact scrollable row of species tiles for the current month, with a headline like "August on the canal — 6 species at their peak". The month is chosen in the visitor's browser, so aggressive page caching never shows a stale month.
* **Bespoke species art** — every species is drawn as a flat two-tone inline-SVG sprite in the site's deep-teal illustration language (no platform emoji, so the art is identical on every device). Sprites ship once per page as a hidden symbol sheet.
* **Detail sheet** — tapping any species opens a sliding drawer: the sprite staged in a drawn SVG scene medallion, the fact, where to look, best time and a 12-month likelihood strip. Escape, the back button, an outside tap and the browser back button all close it; focus is trapped while it is open.
* **Field guide** — all species in three tabbed tile grids (Critters, Birds, Plants); same tap-for-details behaviour.
* **Month timeline** — a scrollable month strip with the current month anchored, plus prev/next arrows, entirely client-side.
* **Season countdown** — a hero stat leading the widget ("Fish season — 31 days away"), computed in the browser in canal time.

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

* **Recommended (v1.10.0):** add the **DCC Canal — Wildlife & Water** widget (category "Dora Canal Court"), or `[dcc_canal title=""]`. It is the whole app — countdown, wildlife and water — so place it *instead of* the separate Wildlife and Water widgets rather than alongside them.
* Elementor: add the **DCC Wildlife — On the Canal** widget (category "Dora Canal Court"). Controls: title override, show/hide field guide, show/hide month browser, compact mode (spotlight band only).
* Anywhere else: `[dcc_wildlife title="" guide="yes" browser="yes" compact="no"]`.
* Fishing & water: the **DCC Water — Fishing & Conditions** Elementor widget, or `[dcc_water title=""]`. Content is managed under DCC → Wildlife (Field guide / Water / Map). It renders nowhere until placed — nothing is auto-injected.
* Season countdown: on by default under the wildlife widget (its "Show season countdown" toggle controls the append per placement), or place the **DCC Wildlife — Season Countdown** widget / `[dcc_wildlife_countdown]` anywhere on its own. One line per page whichever combination is used; the sitewide switch lives in DCC → Wildlife.

Developers can filter the species registry with `dcc_wl_species`, the monthly likelihood table with `dcc_wl_calendar`, and almanac rows with `dcc_wl_water_almanac` (rows added through that filter are subject to the same attribution gate).

== Changelog ==

= 1.10.2 =
* **The month strip no longer slices labels mid-word — and the fix reached the real cause.** 1.10.1 removed the edge fade on phones to stop it dimming the selected month, which left labels hard-clipped to "ul" and "No". The underlying bug was in the centring: it measured each pill from its offsetParent rather than from the scrolling track, a constant error that was invisible on a wide desktop strip and left the selected month 6px from the edge on a 320px phone. With that corrected the selected pill sits 65px clear at 320px, so the fade is back at every width. And because no amount of fading turns "ul" into July, a month that does not fit the strip entirely is now not drawn at all: at 320, 375 and 414 the strip shows three whole labels — Jul, **Aug**, Sep — with the selection solid and no fragment anywhere. The arrows still reach every month, and the month picker still offers all twelve at once.
* **A richer hub.** The two tiles are taller, and each now carries what it is actually talking about: Wildlife shows the species behind its count, Water shows each reading's source and age as the same provenance chip the cards use. Both still come only from data the page already had, the Water tile still shows its name alone when nothing is sourced, and it still disappears entirely when the module auto-hides — the lone Wildlife tile stays a tile rather than stretching across the page.
* **Sticky hover on touch.** The February "selection" in the 1.10.1 screenshots was a capture artifact — the automated pointer sat over that tile after the panel swap — but it pointed at something real: a phone leaves `:hover` on whatever was last tapped, so a month could sit there looking chosen. Hover treatments that could be mistaken for a selected state are now switched off on touch devices, and the screenshot tooling parks the pointer before every capture.
* All three now have permanent coverage in the mobile suite.

= 1.10.1 =
Mobile parity audit and refinements for the canal hub — mobile is how most guests will see this, and 1.10.0 shipped with desktop measurements only. Every level was measured at 320, 360, 375, 390, 414 portrait and 740×360 landscape. The layout held: **zero horizontal overflow at every width**, the hub stacks to one column, the month picker keeps three columns with no wrapped or clipped names even at 320px, and the species sheet fits the viewport. Four defects the measurements found are fixed:

* **Touch targets under 44px.** The timeline's month pills and the Official-information link pills both measured 40px, as did the chain map's own colour-by and layer controls. All now meet the 44px minimum the rest of the plugin holds to.
* **The spotlight's scroll cue vanished on small phones.** At 320px the row landed exactly two tiles wide, so a partially-visible third tile — the thing that says "scroll me" — was 2px. Tiles are now a fraction of the row width capped at their desktop size, giving a 52px peek at 320px and more above it.
* **The month strip's edge fade dimmed the selected month.** On a narrow track the centred pill sits inside the fade and came out looking half-greyed. The fade is smaller everywhere and off entirely below 600px, where the prev/next arrows already carry that affordance.
* The audit is now a permanent suite rather than a one-off, so any of these regressing fails the tests.

= 1.10.0 =
* **One app instead of two stacked widgets.** A new **DCC Canal — Wildlife & Water** Elementor widget (`dccwl_canal`, shortcode `[dcc_canal]`) restructures the front end into hub → section → detail: the season countdown leads the hub with zero taps, below it two centred tiles, Wildlife and Water.
* **Live tile previews, under the same truth discipline as everything else.** Wildlife always shows one ("6 species at their peak in August") because the species calendar ships with the page. Water shows one only when the existing `/conditions` call returns sourced facts; a failed fetch, stale-gated readings or nothing sourced leaves the tile showing its name alone. When the water module would render nothing at all, the hub drops the Water tile entirely.
* **Wildlife is month-first:** hub → a grid of twelve month tiles, each with its own count, the canal's current month ringed and chipped "now" so today is one tap → the species screen (headline, spotlight, the field-guide tabs and full grids, and the timeline kept as a secondary switcher) → the species sheet. Inside the hub the guide tiles pick up a chip for the chosen month.
* **Water lands directly on its full screen** — Right now, the chain comparison, the almanac bodies, the chain map (still a sheet), About the water, both link lists and the FWC disclaimer, in today's order. Nothing moved out and nothing was dropped.
* **Browser back walks up one level.** A back press with a species sheet open closes the sheet first and leaves the level alone; the next walks up. Navigation reads its level from the history state rather than stepping, which is what makes that ordering hold — including when Escape closes the sheet and the sheet returns its own history entry.
* The chosen month survives species ↔ sheet ↔ month-picker; focus moves to each new panel and returns to the tile that opened it; every non-hub level has a centred back control.
* Text centres throughout — tiles, previews, headings, sublines, species names, water card labels and values, chips, link lists, credit and disclaimer. The one exception is the multi-line citation block under each water card, which stays left-aligned inside a centred column because centring turned one attribution into three ragged fragments.
* **Composition, not a fork:** the species and water panels call the existing renderers unchanged, so `dccwl_month`, `dccwl_water`, `dccwl_countdown` and their shortcodes keep working exactly as before when placed on their own. No data source, REST route, fetch rule, countdown maths or any part of the Water_Fact gate was touched.

= 1.9.2 =
* **Removed the unused mascot marker.** The Great Blue Heron tile carried a small coral flag that read as nothing in particular, and Dora Canal Court has no mascot — so the concept is gone rather than renamed: the registry flag, the tile marker and its screen-reader label, the "Our mascot" badge in the detail sheet, the i18n string and the dead CSS rule.
* One knock-on worth knowing: the flag also let the heron jump ahead of equally-likely species in the spotlight strip. With it gone, ties fall back to registry order, so the strip may now lead with a different species (in August, the Alligator).

= 1.9.1 =
* **The Guest Guide's real palette, measured from the live site.** 1.9.0 shipped Wildlife's own navy/coral as an openly-flagged placeholder because the Guide could not be read from the build environment. Those values are gone: primary is now #0f6dbf, accent #f08080, text #111111, muted #5d7891, tiles the Guide's near-opaque white (rgba 255,255,255,.92) over a 15%-blue border, detail surfaces #ffffff, buttons the Guide's blue on white. The token names did not change — only their values — so this was the one-block swap 1.9.0 was built for.
* **The Guide's cozy density and springy motion.** Gaps drop to the Guide's tight 5px/10px, tiles to a 120–140px minimum (from a roomier default), glass blur to 10px, and every transform — the sheet sliding in, tiles lifting, the spotlight fading — now runs 300ms on the Guide's overshoot curve `cubic-bezier(.34, 1.56, .64, 1)`, so the two pages move identically. Colour changes deliberately keep a plain curve: overshooting a colour sends it past its own value and back.
* **Always light, matching the Guide (Rob's decision).** The auto-dark palette added in 1.9.0 is removed entirely — no OS dark-mode rule remains anywhere in the plugin's CSS or JS. The dark-OS readability problem it existed to solve is now handled the Guide's way instead: every surface the widget owns — tiles, the sliding sheet, condition cards, the hero stat, the map sheet — always paints an opaque light ground, so the host and OS themes are irrelevant. A test renders the module under a light OS and a dark one and asserts the two are **pixel-identical**.
* The dark-mode sprite backing added in 1.9.0 is gone with it: on an always-light tile the deep-teal silhouettes keep their contrast unaided, which was verified rather than assumed.
* The month timeline's edge fades are masked rather than painted with a page-coloured gradient, so the scroll cue no longer assumes what colour the page behind it is.
* Render budget: 533px desktop / 745px mobile. Desktop is back inside its original ≤560px budget — the Guide's tighter spacing more than paid for the hero stat. Mobile moves to ≤760px, because the Guide's tile-min resolves to two columns on a phone and matching it there matters more than the old figure.

= 1.9.0 =
**The widgets are rebuilt in the DCC Guest Guide's visual language**, so /guest/ and the wildlife pages read as one app. This release is chrome and interaction only: no data source, no REST route, no fetch discipline, no countdown maths and above all no part of the Water_Fact truth gate was touched.

Element by element:

* **Species chips → TILES that open a sliding detail SHEET.** Tapping a species opens a drawer carrying its scene medallion, the fact, *where to look*, *best time* and a new 12-month likelihood strip — the same registry and calendar data as before, finally all in one place. The strip's bars are decoration; each month also reads out as "March: peak season" for screen readers.
* **Month nav → a segmented TIMELINE.** A scrollable month strip with the current month anchored and highlighted. The month logic is untouched; only the control around it changed.
* **Water readings → DATA CARDS with a source + age chip.** Every reading now shows its provenance at a glance ("Lake County Water Atlas · 40d"), with the age computed from the measurement date in the source's own frame. The chip summarises the attribution line — it never replaces it, so the full source, the measurement date and the note still print beneath every value. A reading with no valid source still renders nothing at all.
* **Season countdown → a HERO STAT** at the top of the widget: the species, the number, and one line of reason ("Peak sightings begin in October"). Still computed in the browser in canal time, still one shell per page, still governed by the sitewide toggle.
* **Chain map → a full sliding SHEET** with the same mechanics as the species detail. Leaflet, the tiles, the ramps, the popups and the colour-by legend are unchanged; the map simply gets the room it needs and dismisses like every other detail. It still loads nothing external until a guest opens it, and reopening no longer refetches.
* **One shared overlay** (`assets/js/sheet.js`) drives both sheets: focus moves in and returns to whatever opened it, focus is trapped while open, and Escape, the back affordance, an outside tap and the browser/Android back button all close it. The page behind is scroll-locked. Under `prefers-reduced-motion` the sheet still opens — it just does not travel.
* **A token layer** (`assets/css/app.css`) holds every colour, radius, gap and duration in one block, with density and glass modifiers. (1.9.0 also shipped auto dark mode; 1.9.1 removed it — see above.)
* Render budget: the widget measures 562px desktop / 699px mobile. Mobile still fits its original ≤720px budget; the desktop budget moves from 560px to 600px to hold the hero stat, which is new content the old figure never accounted for.

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
