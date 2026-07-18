=== Features & Amenities Widget ===
Contributors: doracanalcourt
Tags: elementor, amenities, features, list, accordion
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.9.0
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

= 1.9.0 =
* Fixed: the accordion arrow (▼) rendered black on the live site even when the header appeared correct in the Elementor editor. The arrow is a CSS pseudo-element that previously had no color binding, so it inherited the live theme's dark text color. It now follows the "Icon Color" control (Style → Section Headers), so setting that color (e.g. white) applies to the arrow on the live page too. Baked default matches the section icon color.
* New "Accordion Arrow Edge Spacing" control (Style → Section Headers) sets the horizontal gap between the accordion arrow (▼) and the right edge of the header. Defaults to 5px, added on top of the header padding, responsive per device — mirroring the "Icon Edge Spacing" control on the left icon.

= 1.8.0 =
* New "Icon Edge Spacing" control (Style → Section Headers) sets the horizontal gap between a section header's icon and the left edge of the header. Defaults to 5px, added on top of the header's existing padding, and is responsive (separate desktop/tablet/mobile values). The section icon stays left-aligned and the title stays centered. Existing widget instances pick up the 5px default automatically.

= 1.7.3 =
* Default state of the "Enable Search Bar" toggle (Content → Search) flipped from ON to OFF. Freshly-dropped widget instances now start with the search bar hidden; flip the toggle on to reveal it. Existing widget instances already placed on pages are unaffected — they keep whatever value they had saved (almost always ON, since that was the previous default).

= 1.7.2 =
* Renamed the human-readable plugin name to "DCC Features and Amenities" in the Installed Plugins list (WP Admin → Plugins) and in the Elementor editor's Widget Selection panel. Folder name, PHP namespace, text domain, CSS class prefix, and the widget machine name `features_and_amenities` are all unchanged, so existing widget instances on pages continue to work and translations are unaffected.

= 1.7.1 =
* Removed the mobile-only enlargement of the search-clear (X) button. v1.7.0 bumped it to 36×36 with a 16px icon on viewports below 768px; the button now uses the same 32×32 (14px icon) sizing on every device. Everything else from v1.7.0 — inline SVG icon, fade animation, Esc-to-clear, live match-count status line — is unchanged.

= 1.7.0 =
* Fixed: the X (clear) button in the search field never appeared because the icon was rendered with FontAwesome's `fa-times` class, which FontAwesome 6 renamed to `fa-xmark`. The button is now drawn with an inline SVG that has no dependency on any icon font, so it renders identically whether your site loads FA 4, 5, 6, or none.
* The X now fades and scales in when there's text in the search field (and fades out when it's cleared) instead of popping into place.
* Bigger mobile tap target on the X (36×36px on mobile, 32×32px on desktop) so it's easy to hit on touch screens.
* Pressing Escape inside the search field now clears it (same as clicking the X).
* New live status line under the search bar shows the result count (e.g. "3 matches") while you type, and "No matches" when the query has zero hits. Aria-live for screen readers. Translatable through the `features-amenities` text domain (Loco Translate).

= 1.6.1 =
* Fixed: "Import failed: Cannot read properties of undefined (reading 'id')" when uploading an Elementor template JSON. The generated repeater items were missing a _id field; Elementor's repeater Backbone model uses idAttribute '_id', so the panel's per-row lookup crashed after reset. The importer now stamps each generated section/amenity with a fresh unique _id (via elementorCommon.helpers.getUniqueId() when available, falling back to a 7-char random string).

= 1.6.0 =
* Import is now a file picker, not a paste dialog. Clicking "Import from Elementor Template File…" in the editor panel opens a native file chooser that accepts a .json file exported from an Elementor container template. The importer walks the template, finds every Icon List widget, treats each one as a section (first item = section header with its icon; remaining items = amenities under that header), strips HTML tags and leading anchor characters (⚓︎) from the text, and replaces the widget's list with the result. Reports how many sections and amenities were imported.
* The Import button has a short caption below it describing the expected file format so it's obvious what to upload.

= 1.5.0 =
* Search input text and placeholder are now centered. Removes the visual crowding of the "Search amenities..." placeholder against the magnifying glass on narrow viewports.
* Pressing Enter (or Return) in the search box now smoothly scrolls the viewport to the first matched amenity card and opens any accordion sections that contain matches. Sections without matches stay hidden entirely. No-op when the input is empty or matches nothing.
* Typing no longer auto-opens accordion sections. Real-time filtering (highlighting matches, hiding non-matching amenities, hiding empty sections) is unchanged; the "open the matched sections" step now only happens on Enter, so the UI no longer jumps around mid-type.
* Clearing the search (X button or manual delete) now closes exactly the sections that the Enter handler had opened and restores the widget's initial accordion state. Previously the .is-open class lingered, leaving sections open after the search was cleared.

= 1.4.0 =
* Fixed: "Import List from JSON" button did nothing when clicked. The Export/Import buttons live in the Elementor editor panel (outer frame), not inside the widget itself, so the frontend handler could never find them. They are now wired up by a new editor-only script (assets/js/editor.js) that binds at the document level and writes the imported items into the widget's repeater collection via Elementor's editor API. Import now reports how many items were brought in.
* New "Hover Effect" control in the Section Headers style section: "Lift up (default)" or "None". When set to None, the lift-on-hover transform and shadow change are suppressed.
* New "Hover Effect" control in the Amenity Cards style section: "Scale up (default)" or "None". When set to None, the scale-on-hover transform and shadow change are suppressed.
* Renamed the "Icon → Text Gap" control to "Icon → Heading Spacing" to match how users describe it. Same control under the hood — saved values carry through.

= 1.3.0 =
* Amenity icon now always appears above the title and description text — in both Grid and List layouts. List mode previously placed the icon to the left of the text; that side-by-side arrangement is removed.
* The "Icon → Content Gap (List)" control is renamed "Icon → Text Gap" and now controls the vertical space between the icon and the text in every layout (responsive: desktop / tablet / mobile). Baked-in CSS default is 10px when the control is unset.
* Removed the implicit 10px `margin-bottom` on the icon wrapper. Spacing is now driven entirely by the flex `gap` on the amenity card, which the new control overrides cleanly.

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
