=== DCC Wildlife ===
Contributors: doracanalcourt
Tags: wildlife, elementor, shortcode, nature
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.3.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

"On the Canal This Month" — wildlife spotlight and field guide for Dora Canal Court.

== Description ==

DCC Wildlife shows guests what they can spot on the Dora Canal right now:

* **Spotlight band** — a compact scrollable strip of species chips for the current month, with a headline like "August on the canal — 6 species at their peak". The month is chosen in the visitor's browser, so aggressive page caching never shows a stale month.
* **Bespoke species art** — every species is drawn as a flat two-tone inline-SVG sprite in the site's deep-teal illustration language (no platform emoji, so the art is identical on every device). Sprites ship once per page as a hidden symbol sheet.
* **Detail panel** — tapping any chip expands one shared panel below it: the species sprite staged in a drawn SVG scene medallion, the fact, best-time pill, where-to-look line and derived peak-months range.
* **Field guide** — all species in three compact tabs (Critters, Birds, Plants); same tap-for-details chips.
* **Month browser** — prev/next arrows plus 12 mini buttons to peek at any month, entirely client-side.

100% WordPress-native: no external services, no API keys, no CDN scripts, no webfonts, no image files (inline SVG only). One small CSS file and one vanilla-JS file, enqueued only on pages that use the widget or shortcode. No AJAX, no forms, no data collection.

== Usage ==

* Elementor: add the **DCC Wildlife — On the Canal** widget (category "Dora Canal Court"). Controls: title override, show/hide field guide, show/hide month browser, compact mode (spotlight band only).
* Anywhere else: `[dcc_wildlife title="" guide="yes" browser="yes" compact="no"]`.

Developers can filter the species registry with `dcc_wl_species` and the monthly likelihood table with `dcc_wl_calendar`.

== Changelog ==

= 1.3.0 =
* Bespoke species sprites: all 17 species now render as hand-drawn, single-style inline-SVG silhouettes (deep teals + per-species accent colors) instead of platform emoji, in both the chips and the scene medallions. The sprites ship once per page as a hidden <symbol> sheet referenced via <use> (~12.5KB minified / ~3.4KB gzipped for the whole set). The critters medallion vignette was lightened so dark waterline silhouettes read against it. Emoji remain only as a fallback for filter-added species without a sprite. No layout, interaction or data changes.

= 1.2.0 =
* Removed the guest sightings module entirely (form, moderation CPT, AJAX endpoints, settings page) — too little use to keep. The widget is now fully read-only with zero AJAX. Already-saved sighting posts remain in the database, just without an admin UI; restore the module from git history (v1.1.0) if it is ever wanted again.

= 1.1.0 =
* UI overhaul: compact chip-based spotlight band with a month headline, one shared expanding detail panel with drawn SVG scene medallions, tabbed field guide, arrow + mini-button month nav. Default render is a fraction of the old height; everything else is behind a tap.
* Elementor category corrected to the shared "Dora Canal Court" (`dcc-widgets`) category.

= 1.0.0 =
* Initial release.
