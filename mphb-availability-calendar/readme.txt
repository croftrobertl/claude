=== MPHB Availability Calendar ===
Contributors: doracanalcourt
Tags: elementor, motopress, hotel-booking, availability, calendar
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A mobile-friendly Elementor widget that shows multi-property availability for MotoPress Hotel Booking accommodations.

== Description ==

This plugin adds a single Elementor widget — **MPHB Availability Calendar** — under a new "Claude Code" category. It displays a compact, responsive availability grid for any subset of the MotoPress Hotel Booking accommodation types on your site:

* Reads MotoPress's already-synced data via its internal PHP API. No extra iCal HTTP fetches, no new cron jobs.
* Caches each grid render as a WordPress transient (15-minute TTL by default).
* Auto-registers its AJAX endpoint as a SpeedyCache Pro exclusion on activation.
* Responsive: 7 days on mobile (swipe left/right by week), 14 on tablet, 31 on desktop.
* Tap or click any cottage row to expand a larger per-cottage availability strip.
* Date-range filter (two date inputs that support snowbird-length ranges).
* "Show only available" toggle hides any cottage with a blocker in the selected range.
* Optional color legend above the grid (Available / Booked / Past), with per-state color pickers.
* Every visible string is editable from the Elementor panel and translation-ready (text domain `mphb-availability-calendar`).
* All "today" calculations use US Eastern Time so cutoffs match the physical property's clock.

== Installation ==

1. Zip the `mphb-availability-calendar` folder.
2. In WordPress: Plugins → Add New → Upload Plugin → choose the zip → Install Now → Activate.
3. Edit any page or template with Elementor. Find the **MPHB Availability Calendar** widget under the "Claude Code" category and drag it onto a full-width section.

Requires Elementor and MotoPress Hotel Booking to be active.

== Frequently Asked Questions ==

= Why doesn't it re-fetch the iCal URLs? =

MotoPress already syncs its iCal feeds every 15 minutes into its own database. Re-fetching them would waste bandwidth, add new cron jobs, and risk conflicts with MotoPress's sync schedule. Reading from MotoPress's internal PHP API is faster, more stable, and stays in sync automatically.

= How do I clear the cache? =

Deactivating the plugin flushes all of its transients. To clear them manually without deactivation, run `wp transient delete --all` via WP-CLI, or trigger a MotoPress iCal sync (this plugin listens for that event).

= Does it work without Elementor Pro? =

Yes. It only requires free Elementor core.

= How do I add a "Book Now" popup? =

The widget includes a built-in Book Now popup, enabled by default. It can be disabled globally via the **Enable Popup** toggle in the Elementor panel under the Content tab.

== Changelog ==

= 0.1.0 =
* Initial release.
