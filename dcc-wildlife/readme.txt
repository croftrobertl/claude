=== DCC Wildlife ===
Contributors: doracanalcourt
Tags: wildlife, fishing, elementor, shortcode, nature
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.4.0
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
* "From the dock" — owner-written first-hand notes, visually distinct from published data.
* The almanac ships **empty on purpose**; see WATER-SOURCES.md for the full audit trail, what was left out and why.

The wildlife guide and the water almanac are 100% WordPress-native: no external services, no API keys, no CDN scripts, no webfonts, no image files (inline SVG only). Assets load only on pages that use a widget or shortcode. The optional live layer is the single, clearly-flagged exception and requires no keys or accounts.

== Usage ==

* Elementor: add the **DCC Wildlife — On the Canal** widget (category "Dora Canal Court"). Controls: title override, show/hide field guide, show/hide month browser, compact mode (spotlight band only).
* Anywhere else: `[dcc_wildlife title="" guide="yes" browser="yes" compact="no"]`.
* Fishing & water: the **DCC Water — Fishing & Conditions** Elementor widget, or `[dcc_water title=""]`. Content is managed under Settings → DCC Water. It renders nowhere until placed — nothing is auto-injected.

Developers can filter the species registry with `dcc_wl_species`, the monthly likelihood table with `dcc_wl_calendar`, and almanac rows with `dcc_wl_water_almanac` (rows added through that filter are subject to the same attribution gate).

== Changelog ==

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
