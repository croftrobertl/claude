=== MPHB Availability Calendar ===
Contributors: doracanalcourt
Tags: elementor, motopress, hotel-booking, availability, calendar
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.4.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A mobile-friendly Elementor widget that shows multi-property availability for MotoPress Hotel Booking accommodations.

== Description ==

This plugin adds a single Elementor widget — **MPHB Availability Calendar** — under a new "Claude Code" category. It displays a compact, responsive availability grid for any subset of the MotoPress Hotel Booking accommodation types on your site:

* Reads MotoPress's already-synced bookings directly from the database. No extra iCal HTTP fetches, no new cron jobs.
* Caches each grid render as a WordPress transient (15-minute TTL by default).
* Auto-registers its AJAX endpoint as a SpeedyCache Pro exclusion on activation.
* Responsive: 7 days on mobile (swipe left/right by week), 14 on tablet, 31 on desktop.
* Tap a cottage name to open an info popup (Elementor template or custom text per cottage).
* Tap an available day to open a booking popup that sends the guest to MotoPress checkout with the dates pre-filled.
* Date-range filter (two date inputs that support snowbird-length ranges).
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

MotoPress already syncs its iCal feeds every 15 minutes into its own database. Re-fetching them would waste bandwidth, add new cron jobs, and risk conflicts with MotoPress's sync schedule. Reading MotoPress's stored bookings directly is faster, more stable, and stays in sync automatically.

= How do I clear the cache? =

Deactivating the plugin flushes all of its transients. To clear them manually without deactivation, run `wp transient delete --all` via WP-CLI, or trigger a MotoPress iCal sync (this plugin listens for that event).

= Does it work without Elementor Pro? =

Yes. It only requires free Elementor core.

= How do I turn the booking popup on or off? =

It is on by default. Toggle it with the "Enable Book Now popup" switch in the widget's Display settings.

== Changelog ==

= 0.4.1 =
* Booking and cottage-info popups restyled to match the calendar palette (blue title, divider, palette-coloured close button and error message).

= 0.4.0 =
* Tapping a cottage name now opens an info popup (per-cottage Elementor template or custom text), set up in the new "Cottage Info Popups" section.
* Day-of-week headers now show three-letter abbreviations.
* Calendar cells show an Available/Booked hover tooltip; removed the cell hover zoom and the nav-arrow hover zoom.
* Booking popup no longer overflows narrow mobile screens.
* The filter check-out date now defaults to two nights after the chosen check-in.
* Filters and legend restyled to match the calendar; new style defaults applied.

= 0.3.0 =
* Restyled the calendar grid, cottage-name column, top row, and navigation arrows to a navy data-table design.
* Added a "Show navigation arrows" toggle and a Custom Cottage Labels repeater (override any cottage's displayed name).
* Added Elementor style controls for the calendar header row, cottage-name column, and navigation.

= 0.2.2 =
* Added a "Minimum nights" setting (default 2). The booking popup now defaults the check-out date that many nights after the chosen check-in.
* Bookings shorter than the minimum are rejected in the popup with a clear message instead of sending the guest to an empty Submit Booking page.

= 0.2.1 =
* Fixed: clicking Apply left the calendar unable to open the booking popup until Reset was clicked (AJAX re-render dropped the clickable cells and per-row Book buttons).
* Removed the "Show only available" filter toggle.
* Default past-days window reduced from 3 days to 1 day.

= 0.2.0 =
* Availability now reads MotoPress bookings directly from the database (mphb_booking / mphb_reserved_room), fixing calendars that showed every day as available.
* Added Elementor style controls for the heading, filter fields, buttons, and calendar cells (typography, border, colors, spacing).
* Fixed collapsed date inputs under the Bravada theme, the clipped "today" outline, and the "Book this cottage" button label.

= 0.1.0 =
* Initial release.
