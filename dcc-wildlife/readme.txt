=== DCC Wildlife ===
Contributors: doracanalcourt
Tags: wildlife, elementor, shortcode, nature, sightings
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.1.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

"On the Canal This Month" — wildlife spotlight, field guide and moderated guest sightings log for Dora Canal Court.

== Description ==

DCC Wildlife shows guests what they can spot on the Dora Canal right now:

* **Spotlight band** — a compact scrollable strip of species chips for the current month, with a headline like "August on the canal — 6 species at their peak". The month is chosen in the visitor's browser, so aggressive page caching never shows a stale month.
* **Detail panel** — tapping any chip expands one shared panel below it: the species emoji staged in a drawn SVG scene medallion, the fact, best-time pill, where-to-look line and derived peak-months range.
* **Field guide** — all species in three compact tabs (Critters, Birds, Plants); same tap-for-details chips.
* **Month browser** — prev/next arrows plus 12 mini buttons to peek at any month, entirely client-side.
* **Guest sightings log** (optional, on by default) — a slim "Latest sighting" bar expanding to a list and a small form that files sightings as *pending* posts for owner moderation. Protected by a honeypot, a time-trap, a per-IP rate limit and hard length caps. Can be switched off under Settings → DCC Wildlife.

100% WordPress-native: no external services, no API keys, no CDN scripts, no webfonts, no images (emoji only). One small CSS file and one vanilla-JS file, enqueued only on pages that use the widget or shortcode.

== Usage ==

* Elementor: add the **DCC Wildlife — On the Canal** widget (category "Dora Canal Court"). Controls: title override, show/hide field guide, show/hide month browser, compact mode (spotlight band only).
* Anywhere else: `[dcc_wildlife title="" guide="yes" browser="yes" compact="no"]`.

Developers can filter the species registry with `dcc_wl_species` and the monthly likelihood table with `dcc_wl_calendar`.

== Changelog ==

= 1.1.0 =
* UI overhaul: compact chip-based spotlight band with a month headline, one shared expanding detail panel with drawn SVG scene medallions, tabbed field guide, arrow + mini-button month nav, and a slim expandable sightings bar. Default render is a fraction of the old height; everything else is behind a tap.
* Elementor category corrected to the shared "Dora Canal Court" (`dcc-widgets`) category.
* Data layer, cache-safe month logic, settings and sightings backend unchanged.

= 1.0.0 =
* Initial release.
