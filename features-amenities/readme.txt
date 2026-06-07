=== Features & Amenities Widget ===
Contributors: doracanalcourt
Tags: elementor, amenities, features, list, accordion
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.2.2
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

= 1.2.2 =
* Fixed (real cause): accordion section would expand and then immediately collapse on a single tap/click in mobile view and in desktop accordion mode. The CSS rule that reveals .fal-section-content when .is-open is present was making the element computed-visible the instant the class was added, and slideToggle then saw it as "already visible" and slid it back closed. The handler now picks the open/close direction explicitly from the pre-click state, calls .stop(true, false) to clear any in-flight animation, forces inline display:none before sliding down so jQuery sees the right starting state, and removes the .is-open class only after slideUp completes. Bug had been carried over from the original Angie Code snippet and only manifested on mobile or with the desktop accordion toggle on.
* The double-binding guards from 1.2.1 are retained as defense-in-depth.

= 1.2.1 =
* Fixed: accordion section would expand and then immediately collapse on a single tap/click on cached/optimized pages. The widget's click handler was being bound twice when Elementor's `element_ready` event fired more than once for the same widget (a known interaction with cache plugins that defer or concatenate JS). Added a dataset guard on the widget root plus a registration-level guard so the click handler can only attach once per element regardless of how many times the script loads or initializes.

= 1.2.0 =
* Section Header titles and Amenity Card titles + descriptions now default to centered text. In grid layout, the amenity icon is also centered above the text for visual balance. List layout keeps the icon to the left of the text as before.
* New "Text Alignment" responsive control in both the Section Headers and Amenity Cards style sections. Choose left / center / right / justify per device. Defaults to center.

= 1.1.0 =
* New "Inherit Theme Styles" switcher (default ON). The widget now adopts the active WordPress theme's colors, fonts, and backgrounds out of the box. Toggle off to restore the original v1.0.0 baked-in palette. Per-element style controls still override either way.
* Removed the hardcoded #0E9AAF default on the Primary Brand Color control so the theme cascade isn't pre-empted. The CSS stylesheet still falls back to #0E9AAF when the toggle is off and no color is picked.
* Accessibility: hover transforms and accordion slide animations are now disabled when the user has `prefers-reduced-motion: reduce` set in their OS preferences.
* Theme hardening: every style-control selector now uses doubled-class specificity so aggressive theme resets (e.g. Bravada) can't override the controls. A universal `box-sizing: border-box` reset inside the widget root defends against themes that flip it elsewhere.
* Code organization: `register_controls()` split into seven per-section methods (data source, list, search, layout, colors, section headers, amenity cards). The bootstrap now uses a tiny PSR-4-ish autoloader instead of manual `require_once` calls. Internal refactor only; no output or control-name changes.

= 1.0.0 =
* Initial release. Ported from Angie Code snippet `features_and_amenities_list_3f0db7b3`.
* Defaults seeded from the Dora Canal Court Elementor template (6 sections, 16 amenities).
* Primary color defaults to #0E9AAF to match the source template.
* Default amenity icon switched to `fa-anchor` (replaces the inline ⚓︎ character used in the source).
* Fixed a backslash double-escape bug in the search regex.
