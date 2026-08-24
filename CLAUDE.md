# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Site context

**Read `SITE-CONTEXT.md` at the start of every session.** It contains the full
doracanalcourt.com site architecture: installed plugins + versions, MotoPress data
model (cottage IDs, room type IDs, booking counts), iCal OTA feeds, cache stack,
security findings, and gotchas that affect every plugin in this repo.

Key facts from that document that affect this plugin:
- DB table prefix: `portal_` (not `wp_`)
- Room type IDs: 1065/1067/1069/1071/1604/1607/1740/1742 (8 cottages)
- Checkout page ID: 1399
- Three active cache layers (SpeedyCache Pro + HostGator Endurance + advanced-cache.php)

## Repository purpose

A single WordPress plugin — **MPHB Availability Calendar** — that adds one Elementor widget displaying multi-property availability for MotoPress Hotel Booking accommodations on doracanalcourt.com. The plugin lives at `mphb-availability-calendar/`. The repo has no build step.

## Target environment

- WordPress 6.0+ (deployment site is on 6.9.x)
- PHP 8.0+ (deployment site is on 8.3.x; codebase uses 8.0-compatible syntax)
- Elementor (free, 3.5+)
- MotoPress Hotel Booking plugin must be active
- Hosted on HostGator shared hosting alongside SpeedyCache Pro

## Common commands

```bash
# Syntax-check every PHP file in the plugin
find mphb-availability-calendar -name '*.php' -print0 | xargs -0 -n1 php -l

# Build the installable zip the user uploads via WP Admin → Plugins → Add New → Upload
( cd $(git rev-parse --show-toplevel) && zip -r mphb-availability-calendar.zip mphb-availability-calendar )
```

There are no automated tests — runtime behavior can only be verified by installing the zip on a staging WordPress site. See `readme.txt` and the plan in `/root/.claude/plans/` for the manual smoke-test checklist.

## Architecture

Single-folder plugin, PSR-4-ish layout under a `MPHBAC\` namespace. Bootstrap → Plugin singleton → six collaborators.

```
mphb-availability-calendar.php       # Headers + constants + require()s + activation hook
includes/class-plugin.php            # Singleton orchestrator; registers all WP hooks
includes/class-widget.php            # Elementor_Widget_Base subclass; ~all Elementor controls live here
includes/class-data-provider.php     # Read layer over MotoPress (PHP API + SQL fallback)
includes/class-cache.php             # Thin transient wrapper (prefix mphbac_)
includes/class-cache-integration.php # SpeedyCache exclusion on activate + admin notice
includes/class-ajax.php              # Nonce-protected admin-ajax.php endpoint (action mphbac_query)
assets/css/widget.css                # CSS custom-property–driven
assets/js/widget.js                  # Vanilla JS, no jQuery dep; reads data-config from root element
```

Request flow when a visitor loads a page containing the widget:

1. `Widget::render()` outputs only the shell — heading, filters, legend, nav, an empty `.mphbac-grid-wrap` with a `.mphbac-loading` placeholder, the popups, and hidden `.mphbac-info-content` divs. It does NOT render the grid.
2. The full settings + cottage IDs (incl. per-device `daysDesktop/daysTablet/daysMobile`) are serialized into a `data-config` JSON attribute on `.mphbac-root`.
3. On load, `assets/js/widget.js` picks the day count for the current device, POSTs to `admin-ajax.php?action=mphbac_query`, and **renders the grid client-side**. It re-renders on filter/nav/swipe and when the viewport crosses a device breakpoint.
4. `Data_Provider::get_availability()` (transient-cached) backs the AJAX endpoint — the transient layer hits on repeats. The grid is intentionally client-rendered so each device shows its own day count.

## Invariants that must hold

These are deliberate decisions from the design conversation. Don't "fix" them without checking with the user.

- **All "today" math runs in US/Eastern**, not WP's site timezone. The physical cottages are in Florida and cutoffs must match the property clock regardless of visitor locale. See `Data_Provider::TZ` and `Data_Provider::timezone()`.
- **Never re-fetch iCal URLs.** MotoPress already syncs iCal feeds every 15 minutes; imported reservations land as `mphb_booking` posts (same as direct bookings). Direct iCal HTTP fetches would duplicate work and risk cron conflicts.
- **Availability is read directly from MotoPress's DB, not its PHP API.** `MPHB()->getRoomRepository()->getAvailableRooms()` proved unreliable (ignores the room-type filter in 6.x). `Data_Provider::query_occupied_room_days()` reads the real storage: `mphb_reserved_room` posts (`_mphb_room_id` meta) joined to their parent `mphb_booking` post (which carries `mphb_check_in_date` / `mphb_check_out_date` and a `post_status` in `Data_Provider::BLOCKING_STATUSES`), plus the `{prefix}mphb_blocks` table for manual host blocks. A cottage-day is "booked" only when every physical room of that type is occupied. All SQL is `$wpdb->prepare`'d; the two queries are wrapped in `try/catch (\Throwable)` with `MPHBAC:` error logging.
- **Book Now flow uses a hidden form POST to MotoPress's checkout page** (`MPHB()->settings()->pages()->getCheckoutPageUrl()`, default `/submit-booking/`). The POST body matches MotoPress's own cottage-page form exactly: `mphb_room_type_id`, `mphb_check_in_date`, `mphb_check_out_date`, `mphb_rooms_details[ID]=1`, `mphb_is_direct_booking=1`. No nonce field — MotoPress doesn't CSRF-protect this submission. Don't switch to `MPHB()->reservationRequest()` PHP-side unless you have a specific reason; the form-POST path is documented behavior and identical to what MotoPress's own UI does. Popup can be disabled globally via the `enable_popup` Elementor toggle.
- **Every visible string must be translatable.** Text domain is `mphb-availability-calendar`. The site uses Loco Translate. Use `__()`, `esc_html__()`, `esc_attr__()` etc. — never echo a raw user-facing string.
- **The Elementor widget category on the LIVE site is `dcc-widgets`** ("Dora Canal Court") — the slug every live DCC plugin (Guest Guide, Contact Form, Availability Calendar, Cottage Selector as of 0.21.1) registers. This repo's calendar code still registers the stale `claude-code` slug in `Plugin::register_category()`; if you touch the calendar's category, move it to `dcc-widgets` — never invent a third slug, since Elementor groups the panel by slug and a mismatch creates a duplicate "Dora Canal Court" section.
- **SpeedyCache exclusion is auto-managed.** `Cache_Integration::on_activate()` runs on plugin activation and adds `/wp-admin/admin-ajax.php?action=mphbac_query` to SpeedyCache's exclusion list (filter + option write). The user does not configure this manually.

## Cache layer

- Backed by WP transients, prefix `mphbac_`, default TTL 900 s (15 min — matches MotoPress's iCal sync interval).
- Keys are `sha1(wp_json_encode($parts))` so they're content-addressed and stable.
- `Cache::flush_all()` is called on `mphb_after_sync_ical`, `mphb_ical_sync_finished`, `mphb_after_create_booking`, and `mphb_booking_status_changed`. If MotoPress changes its hook name, transients still expire on TTL, so worst case is a 15-min staleness window.
- Deactivation flushes all transients.

## Adding controls or settings

Every Elementor control is registered inside one of twelve methods in `class-widget.php`, all called from `register_controls()`:

- `register_content_controls()` — heading + cottage selector
- `register_display_controls()` — per-device day count (`visible_days`, responsive), per-device day-of-week format (`dow_format`, responsive), label style, legend/past/nav toggles, font size, popup toggle, minimum nights
- `register_labels_controls()` — the custom-cottage-label repeater (`cottage_labels`)
- `register_info_controls()` — the cottage-info-popup repeater (`cottage_info`: per-cottage Elementor template or WYSIWYG text)
- `register_strings_controls()` — every editable label (incl. `str_property` corner label)
- `register_style_controls()` — theme inheritance + the three state color pickers
- `register_heading_style_controls()` — widget-heading typography + color
- `register_field_style_controls()` — filter-input typography/border/colors
- `register_calheader_style_controls()` — calendar top-row background/text + overall typography + separate day-of-week and date-of-month typography
- `register_namecol_style_controls()` — cottage-name column colors/typography/width
- `register_button_style_controls()` — button typography/border/padding + Normal/Hover colors
- `register_nav_style_controls()` — nav-arrow button + range-label colors
- `register_legend_style_controls()` — legend text color + typography
- `register_cell_style_controls()` — calendar cell radius / min-height / gap

Interactions: tapping a cottage name opens the **info popup** (`.mphbac-info-sheet`) if that cottage has a `cottage_info` row; tapping an available day opens the **booking popup** (`.mphbac-sheet`). The two popups share CSS. Per-cottage info content is server-rendered into hidden `.mphbac-info-content` divs and copied into the popup by `widget.js`.

When adding a setting:
1. Add it in the appropriate method.
2. If it changes server-rendered output, read it in `Widget::render()` and pass through `data-config` (and into `render_grid()`'s `$opts` array if the grid markup needs it).
3. If it only affects styles, use a `selectors` argument so Elementor live-preview works.
4. **Specificity:** Bravada's Elementor kit resets inputs/buttons with `(0,3,1)`-specific selectors. Style-control selectors must outrank that — use the `Widget::SEL` prefix (`{{WRAPPER}} .mphbac-root.mphbac-root `), whose doubled class reaches `(0,4,0)`. Style controls carry no defaults; the baked-in look lives in `widget.css` (controls are override-only).

## Visual design / palette

`assets/css/widget.css` bakes in a design matched to the user's Angie-built reference widget — a data-table look. Most style controls also carry these same values as Elementor-control defaults (user request — they wanted the panel to show the values). Key CSS custom properties on `.mphbac-root`:

- `--mphbac-color-available: #7BDCB5` · `--mphbac-color-booked: #FB6962` · `--mphbac-color-past: #bdc3c7`
- `--mphbac-color-header: #0A50B2` (top row) · `--mphbac-color-nav-bg: #C43A3A` · `--mphbac-color-nav-hover: #078732` (nav buttons are decoupled from the header color)
- `--mphbac-color-namecol: #F8F9FA` · `--mphbac-color-namecol-alt: #F1F3F5` (zebra stripe) · `--mphbac-color-namecol-text: #111111` · `--mphbac-color-frame: #e0e0e0`
- `--mphbac-color-legend-text: #111111` · `--mphbac-color-today-outline: #f4da62` · `--mphbac-label-width: 180px`

Grid columns: the cottage column is a fixed `--mphbac-label-width`; day columns are `minmax(0, 1fr)` so they shrink to fit (no horizontal overflow). `--mphbac-cell-min` is cell **height** only.

Site brand palette (for reference): Primary `#0f6dbf` · Secondary `#f08080`. The whole widget — filters, calendar, legend, popups — is now styled cohesively.

## Git workflow

- Active branch: `claude/review-shared-chat-bExtl`. Develop and push there. Don't open a PR unless the user asks.
- The repo has only the plugin folder at root — no other deliverables.
