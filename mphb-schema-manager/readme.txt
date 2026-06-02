=== MPHB Schema Manager ===
Contributors: doracanalcourt
Tags: schema, structured-data, json-ld, motopress, elementor, seo
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Per-page Schema.org (JSON-LD) structured-data manager for MotoPress Hotel Booking sites built with Elementor.

== Description ==

Manage the structured data that Google rich results and AI answer engines read, edited per page/post/cottage right inside the Elementor Settings tab. Settings are organized one section per schema type, in three inheritance layers:

* **Site-wide defaults** — Organization/LodgingBusiness and WebSite + SearchAction (WP Admin → MPHB Schema → Defaults → Site-wide).
* **Accommodation-type template default** — the VacationRental + Offer shape every cottage inherits, token-driven (Cottage-defaults tab).
* **Per-page / per-cottage override** — in each document's Elementor Settings tab. Cottages use an inherit / override / disable selector; document types use an enable switch.

Precedence is per-page override → accommodation-type template default → site default.

Other features:

* **Live MotoPress data** — VacationRental Offers can auto-fill the nightly price and InStock/OutOfStock availability via dynamic tokens (`{{mphb_price}}`, `{{mphb_availability}}`, `{{cottage_name}}`, …), read directly from MotoPress's database. Never stale.
* **Connected @graph** — all nodes are linked with @id references (publisher, offeredBy, containedInPlace, isPartOf), which Google and AI extractors prefer over scattered blocks.
* **Import** — MPHB Schema → Import & Detect finds JSON-LD hand-placed inside Elementor "Custom HTML" widgets and one-click-imports it into the structured editor.
* **Health** — MPHB Schema → Health parses each page's live HTML to show exactly which schema types are emitted, flags duplicate types, and links out to validator.schema.org and Google's Rich Results Test. (Neither external tester exposes a public API, so detection is done by parsing the rendered page.)
* **Validator** — built-in linting of each type against its required/recommended properties.
* Independent of the MPHB Availability Calendar plugin; ships its own MotoPress read layer. All strings translatable (text domain `mphb-schema-manager`). All "today" math in US/Eastern.

== Installation ==

1. Zip the `mphb-schema-manager` folder.
2. In WordPress: Plugins → Add New → Upload Plugin → choose the zip → Install Now → Activate.
3. Configure under WP Admin → MPHB Schema.

Requires Elementor (free) and MotoPress Hotel Booking to be active.

== Changelog ==

= 1.0.0 =
* Initial release. Split out from MPHB Availability Calendar 0.8.0 into a standalone plugin: per-page Schema.org JSON-LD manager with site / accommodation-type / per-document layers, live MotoPress price+availability tokens, connected @graph, Custom HTML import, Health detection, and built-in validation. Storage keys are prefixed `mphbsch_`; if you had configured schema under the calendar plugin's 0.8.0 build, re-enter the settings here.
