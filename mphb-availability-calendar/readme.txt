=== MPHB Availability Calendar ===
Contributors: doracanalcourt
Tags: elementor, motopress, hotel-booking, availability, calendar
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.6.5
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A mobile-friendly Elementor widget that shows multi-property availability for MotoPress Hotel Booking accommodations.

== Description ==

This plugin adds a single Elementor widget — **MPHB Availability Calendar** — under a new "Claude Code" category. It displays a compact, responsive availability grid for any subset of the MotoPress Hotel Booking accommodation types on your site:

* Reads MotoPress's already-synced bookings directly from the database. No extra iCal HTTP fetches, no new cron jobs.
* Caches each grid render as a WordPress transient (15-minute TTL by default).
* Auto-registers its AJAX endpoint as a SpeedyCache Pro exclusion on activation.
* Per-device day counts — set how many days show on desktop, tablet, and mobile; swipe to page on touch devices.
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

= 0.6.5 =
* Full-viewport cottage-info popup now anchors its top edge to the top of the calendar widget instead of the top of the screen. When you open a cottage popup, the popup appears to grow out of the calendar — the area above the calendar (page header, hero, breadcrumbs, etc.) stays visible. JS reads the widget's getBoundingClientRect().top at open time, so the popup always lines up wherever the calendar happens to be on screen.

= 0.6.4 =
* Fixed: in the full-viewport popup mode introduced in 0.6.3, the popup's own padding extended its visible width past the viewport so the right side of the content was clipped off-screen. The popup now uses border-box sizing so width:100vw includes the padding.
* Fixed: the MotoPress accommodation popup source rendered nothing because MotoPress's the_content callbacks also check is_main_query() (which compares against $wp_the_query), not just is_singular(). Both queries are now swapped during render so the gallery, attributes, rates table, and services blocks all appear. Also logs a notice and falls back to skipping the cottage if the render produces nothing, so a misconfigured cottage never shows a blank popup.

= 0.6.3 =
* Added a "Full viewport width" toggle in Display settings (on by default). When on, the cottage-info popup fills the entire viewport instead of opening as a centered modal — recommended whenever the popup content is the MotoPress accommodation page, so the gallery/rates table/attributes render at their natural width. When off, the popup remains a centered modal capped by the Max width setting below the toggle.

= 0.6.2 =
* Added a third "Content source" option to each Cottage Info Popup row: "MotoPress accommodation page (auto)". Renders the cottage's full MotoPress single-accommodation page (gallery + description + attributes + services + rates) inside the popup, with no extra setup — the cottage is taken from the row's existing Cottage field. Useful when you'd rather show MotoPress's built-in cottage page than maintain a parallel Elementor template.

= 0.6.1 =
* Reverted the v0.6.0 lazy AJAX template loading. Elementor never enqueues a template's per-widget CSS file on the parent page when the template is rendered over AJAX, which broke multi-column widgets (their accordion/switcher styles were missing, all sections showed at once, and event handlers bound to stale DOM on re-open). Templates are once again server-rendered into hidden divs on the page so their CSS is enqueued normally.
* Kept from v0.6.0: the "Info popup max width" Display control (default 800px), the defensive CSS for image/video/iframe scaling, and the single-line button rule.
* Fixed: third-party widget overlays (e.g. carousel pagination, lightboxes) appended to the page body when the popup was open now get torn down when the popup closes — the popup body is cleared after the close transition.

= 0.6.0 =
* Cottage-info popups are now optimized for image-rich Elementor templates.
* Added an "Info popup max width (px)" Display control (default 800px, was 440px) so multi-column galleries, hero photos, and pricing tables have room to breathe.
* Elementor templates referenced by a cottage-info row are now lazy-loaded over AJAX on first popup-open (cached for 15 min server-side and for the rest of the session client-side). The calendar page itself no longer pre-renders every template, so initial page weight drops sharply when several cottages have photo-heavy templates configured.
* Added CSS guards so arbitrary template content can never blow out the popup width: images/videos/iframes cap at 100% width and preserve aspect ratio; button labels stay on one line.
* Two new translatable strings: the popup's "Loading…" and "Could not load…" messages.

= 0.5.7 =
* The cottage-info popup's close (X) button is now pinned to the top-right corner of the popup as a small floating circle, so it stays visible while you scroll long info content.
* Fixed: editing the widget in the Elementor editor collapsed the per-device "Days to show" setting so every device showed the desktop count. Empty tablet/mobile slots now apply the declared defaults (14 / 7) instead of cascading to the desktop value.

= 0.5.6 =
* Fixed: the calendar reverted to a permanent "Loading availability…" message a day or two after SpeedyCache rebuilt its page cache. Cause: the AJAX request carried a WordPress nonce embedded in the cached HTML; the nonce expired ~24h later, the request returned 403/-1, and the JS left the spinner in place. The endpoint no longer requires a nonce (it serves public, read-only availability data and performs no state-changing actions, so there is no CSRF surface). The JS also now clears the loading placeholder on any failed response so a stale-data state can never linger silently.

= 0.5.5 =
* Fixed: interactive Elementor widgets inside cottage-info popups (e.g. a pricing-table billing-period switcher) sat inert because cloning markup via innerHTML doesn't re-trigger Elementor's widget handlers. The popup now re-dispatches Elementor's `frontend/element_ready` action for every widget it shows, so each widget's handler (including third-party Angie Code snippets) wires up against the popup copy.

= 0.5.4 =
* Removed the temporary `[mphbac]` diagnostic Console logging shipped in 0.5.2 / 0.5.3. The editor-preview fix from 0.5.3 stays.

= 0.5.3 =
* Fixed: the calendar was stuck on "Loading availability…" inside the Elementor editor preview because Elementor's editor injects widget markup after DOMContentLoaded without firing the frontend/element_ready action. A MutationObserver now catches the widget the moment it appears in the DOM (and re-inits it after Elementor rebuilds the widget on every setting change).

= 0.5.2 =
* Diagnostic build: the widget now logs labeled `[mphbac]` entries to the browser Console at every step (script load, init, AJAX request, fetch result, grid render). Used to trace why the Elementor editor preview can show "Loading availability…" indefinitely. No behavior change for end visitors.

= 0.5.1 =
* Fixed: the calendar stayed on "Loading availability…" inside the Elementor editor preview — its script is now force-loaded into the preview iframe.

= 0.5.0 =
* Replaced the broken "auto" visible-days option with a per-device day count (desktop / tablet / mobile). The calendar is now drawn client-side so each device shows the right number of days.
* Added a per-device day-of-week format setting (one-letter vs three-letter abbreviation).
* Added separate typography controls for the day-of-week and date-of-month header text.
* The filter fields, buttons, legend, and heading are now centered.

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
