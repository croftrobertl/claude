=== Guest Guide ===
Contributors: doracanalcourt
Tags: elementor, guest, guide, wifi, checkout
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

An interactive, mobile-friendly Elementor widget that presents a Guest Guide — WiFi, house rules, checkout, and more — as a tappable section menu.

== Description ==

This plugin adds a single Elementor widget — **Guest Guide** — under the shared "Claude Code" category. It shows your stay information as a grid of section tiles; tapping a tile drills into that section's items, with a back arrow to return.

* Author everything in the Elementor panel — no code edits, no database, no AJAX. Content is server-rendered once, so it's fast and fully cacheable (SpeedyCache-friendly).
* Two editable repeaters: **Sections** (the menu tiles) and **Items** (the content beneath each section). Add, edit, delete, and reorder freely.
* Each section and item takes an icon from Elementor's icon library.
* Each item supports rich text (WYSIWYG) and an optional tap-to-copy button (e.g. for the WiFi password).
* Choose the open/close animation in the panel: **Slide**, **Flip**, or **Fade**.
* Optional search box filters sections and items as you type.
* Mobile-first responsive tile grid (columns configurable per device); respects `prefers-reduced-motion`.
* Every visible string is editable from the panel and translation-ready (text domain `guest-guide`).

== How sections and items connect ==

Elementor repeaters can't be nested, so items attach to sections by a shared **Key**:

1. Give each **Section** a short Key (e.g. `wifi`).
2. For each **Item**, set its **Section** field to the same Key.

Items group under the matching section, in the order listed. Items whose Section doesn't match any Key are skipped; sections with no items still show their tile.

== Installation ==

1. Zip the `guest-guide` folder.
2. In WordPress: Plugins → Add New → Upload Plugin → choose the zip → Install Now → Activate.
3. Edit a page or template with Elementor. Find the **Guest Guide** widget under the "Claude Code" category and drag it onto a full-width section.

Requires Elementor to be active.

== Smoke-test checklist ==

* Widget appears under the "Claude Code" category.
* Add a few sections (incl. one keyed `wifi`) and items; confirm icons, WYSIWYG, and a WiFi item with a copy button.
* Tile grid renders; tap a tile to open its detail; the back arrow (or Esc) returns to the menu.
* Switch the Transition control between Slide / Flip / Fade and confirm each animates.
* Type in the search box: non-matching tiles hide and the no-results message shows when nothing matches.
* The copy button copies the value and briefly shows "Copied!".
* Check mobile (1 column), tablet, and desktop; confirm style controls update the live preview.

== Changelog ==

= 1.0.0 =
* Initial release.
