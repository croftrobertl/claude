=== DCC Wildlife ===
Contributors: doracanalcourt
Tags: wildlife, elementor, shortcode, nature, sightings
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

"On the Canal This Month" — wildlife spotlight, field guide and moderated guest sightings log for Dora Canal Court.

== Description ==

DCC Wildlife shows guests what they can spot on the Dora Canal right now:

* **Spotlight strip** — the current month's top species as cards (emoji, fact, best time of day, where to look). The month is chosen in the visitor's browser, so aggressive page caching never shows a stale month.
* **Field guide** — all species in three groups (Critters, Birds, Plants) with peak-months pills derived from the built-in monthly likelihood table.
* **Month browser** — 12 buttons to peek at any month, entirely client-side.
* **Guest sightings log** (optional, on by default) — a small form that files sightings as *pending* posts for owner moderation; approved sightings appear in a "Recent sightings" list. Protected by a honeypot, a time-trap, a per-IP rate limit and hard length caps. Can be switched off under Settings → DCC Wildlife.

100% WordPress-native: no external services, no API keys, no CDN scripts, no webfonts, no images (emoji only). One small CSS file and one vanilla-JS file, enqueued only on pages that use the widget or shortcode.

== Usage ==

* Elementor: add the **DCC Wildlife — On the Canal** widget (category "Claude Code"). Controls: title override, show/hide field guide, show/hide month browser, compact mode.
* Anywhere else: `[dcc_wildlife title="" guide="yes" browser="yes" compact="no"]`.

Developers can filter the species registry with `dcc_wl_species` and the monthly likelihood table with `dcc_wl_calendar`.

== Changelog ==

= 1.0.0 =
* Initial release.
