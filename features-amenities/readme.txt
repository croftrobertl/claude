=== Features & Amenities Widget ===
Contributors: doracanalcourt
Tags: elementor, amenities, features, list, accordion
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Adds a single Elementor widget that renders a sectioned, searchable, optionally-accordion list of features and amenities.

== Description ==

Provides an Elementor widget under the "Claude Code" category that displays a list of Section Headers and Amenity/Feature items. Originally derived from an Angie Code snippet and rebuilt as a standalone plugin so it can be installed once and reused across pages.

Features:

* Sectioned list (Section Header + Amenity items underneath)
* FontAwesome icons per row (custom or default fallback)
* Optional search bar with live highlighting
* Optional desktop accordion (mobile is always accordion)
* Auto-fold long descriptions ("Read More")
* Compact / Cozy / Comfy density modes
* Grid or list layout
* Glassmorphism toggle, dark-mode aware, primary brand color
* Editor-side Export / Import for the list contents
* Optional MotoPress template passthrough for advanced layouts

The default list ships with the six Dora Canal Court sections (Location Highlights, Kitchen & Dining, Bedroom & Bathroom, Comfort & Entertainment, Community Amenities, Accessibility & Safety) so the widget renders immediately with relevant content.

== Installation ==

1. Zip the `features-amenities` folder.
2. Upload it via WP Admin → Plugins → Add New → Upload Plugin.
3. Activate. The widget appears in Elementor under "Claude Code" → "Features & Amenities".

== Changelog ==

= 1.0.0 =
* Initial release. Ported from Angie Code snippet `features_and_amenities_list_3f0db7b3`.
* Defaults seeded from the Dora Canal Court Elementor template (6 sections, 16 amenities).
* Primary color defaults to #0E9AAF to match the source template.
* Default amenity icon switched to `fa-anchor` (replaces the inline ⚓︎ character used in the source).
* Fixed a backslash double-escape bug in the search regex.
