=== MPHB Availability Calendar ===
Contributors: doracanalcourt
Tags: elementor, motopress, hotel-booking, availability, calendar
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.10.1
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

= 0.10.1 =
* Display-name rename only. The plugin row in WP-Admin → Plugins → Installed Plugins and the draggable widget tile in Elementor's editor panel now both read "DCC Availability Calendar." No functional change — every internal identifier stays the same (folder name, main file, text domain `mphb-availability-calendar`, widget slug `mphbac_calendar`, PHP namespace `MPHBAC\`, CSS class prefix `mphbac-`, transient prefix `mphbac_`, AJAX action `mphbac_query`, Elementor category slug `claude-code`, all constants), so existing Elementor pages, saved widget configs, translations, and CSS overrides keep working without any migration step.

= 0.10.0 =
* Desktop and tablet now honor the "Number only" row-label setting — only the `#N` shows, centered with tabular figures, while the column stays the same width as today's two-line layout (use the existing Cottage column width control to narrow it if desired). Previously the abbrev still rendered above the `#N` on desktop/tablet, ignoring the toggle. Mobile behavior is unchanged. The full cottage name remains in the cell's accessible name (tooltip + screen reader) and tapping any cottage cell still opens its info popup with the full record.
* The cottage info popup's close X is now a frosted-blur pill that stays cleanly visible against any image, color, or text that scrolls underneath. Previously a solid `#888` X could disappear into gray photos when content scrolled past. z-index bumped above Elementor image-carousel stacking contexts, a proper `:focus-visible` outline added for keyboard users, and a `@supports not (backdrop-filter)` fallback gives a near-opaque dark fill on browsers without backdrop blur.
* The single "Cell size" slider under Style → Calendar Cells is now two: "Cottage row height" (data rows only — keeps the old `cell_min_height` control id, so saved values continue to apply) and "Header row height" (top day-of-week / date row only, new `header_min_height` control). Previously the lone slider visibly resized the header row instead of the cottage rows — the header content was tighter, so `min-height` bound there first. Existing widgets that had cranked the old slider up specifically to enlarge the header will see the header revert to the default until the new slider is set; that revert was the bug.
* On mobile (≤600 px) the Check-in / Check-out date filters and the action button(s) now sit on a single row — dates fill the left ⅔ side-by-side, button(s) fill the right ⅓. Previously each filter element stacked on its own full-width row, wasting vertical space and often pushing the calendar below the fold on phones. Each filter keeps its own label-above-input column layout — only the parent's stacking direction changes. `min-width: 0` lets native date pickers shrink instead of horizontally overflowing on the narrowest 320 px screens.

= 0.9.9 =
* Mobile (≤600px) cottage column polish, building on v0.9.8: the `#22` / `#23` IDs are now centered in the column with tabular numerals, so every digit lines up character-for-character down the page regardless of which cottages are shown. Adds a hair of letter-spacing so `#36` doesn't read as `#86` at small sizes. Reads as an intentional ID column rather than a collapsed remnant of the old two-line layout. Tablet, desktop, the navy header corner ("COTTAGE"), and cottages whose post title doesn't match the `Cottage NN:` pattern are all unchanged.

= 0.9.8 =
* Mobile (≤600px): the cottage column now shows just the cottage number (e.g. `#22`) instead of stacking a truncated cottage name above it. The truncated name was forcing rows ~30% taller than necessary, which made every day cell on the same row taller and narrower. Rows now collapse to a single line; day cells become roughly square; the whole calendar reads more compactly on phones. Tap any cottage number to open the existing cottage info popup with the full name and details — that's what it's there for.
* Tablet, desktop, and the header row are unchanged. Cottages whose post title doesn't follow the `Cottage NN:` naming pattern (no parsed number) keep their abbreviated name visible — never blank cells. Per-cottage custom-label overrides (`cottage_labels` repeater) also continue to display the configured label on mobile, since explicit overrides should win over the default rule.

= 0.9.7 =
* Cleanup: removed an orphan "Tooltip prefix" string control that was registered in the Strings panel but never consumed by any markup or script.
* Cleanup: removed an unused `.mphbac-label-number` CSS rule (the parent class was never applied; the nested `.mphbac-label-abbrev` / `.mphbac-label-num` selectors used elsewhere are unaffected).
* Cleanup: dropped an unused `use DateTimeImmutable;` import from the widget class.
* A11y: the cottage info popup now has the same keyboard focus-trap as the Book Now popup — Tab cycles inside the dialog and wraps at both ends, initial focus lands on the close button on open, and Escape still closes and returns focus to the triggering cottage name. `role="dialog"` / `aria-modal="true"` were already present; this completes the parity.

= 0.9.6 =
* Fix (iOS Safari): bottom of the cottage info popup and Book Now popup were hidden behind the floating Safari toolbar. The v0.9.0 svh fix capped popup HEIGHT correctly but the popup was still anchored with `bottom: 0`, which on iOS puts the popup's bottom edge at the vh-bottom — BEHIND the toolbar that overlays the viewport. Switched the anchor to `bottom: env(safe-area-inset-bottom, 0px)` so the popup lifts above the toolbar, and added a JS-side `viewport-fit=cover` injection so `env()` returns a real value even when the theme's viewport meta omits it.

= 0.9.5 =
* Fix: calendar failed to (re-)load inside the Elementor editor preview after v0.9.4. The observer gate checked `body.elementor-editor-active` — that class lives on the TOP-LEVEL editor body, not inside the preview iframe where the widget actually renders. Detection now uses the `elementor-preview=` URL parameter (set on the preview iframe URL, available before elementor-frontend.js boots) plus `body.elementor-edit-mode` and `body.elementor-editor-active` as backups. Live-frontend perf win from v0.9.4 is preserved — no observer on public pages.

= 0.9.4 =
* Render flicker — the skeleton placeholder now matches the rendered grid one-for-one: same gap variable (`--mphbac-gap`, the one the Elementor cell-gap control writes to — the skeleton previously read a separate `--mphbac-cell-gap` that no control updated), no outer padding mismatch, and a header stripe that mirrors the rendered grid's top row so the swap doesn't shift the grid down by a row.
* Frontend perf — the `MutationObserver` that watches for late-injected widget markup is now gated to the Elementor editor preview (where it's actually needed); on the live frontend it's skipped entirely. Frees up the per-mutation callback cost on every Elementor page. Late-mounted instances on the frontend are still caught by Elementor's `frontend/element_ready` hook.
* Frontend perf — jQuery UI Datepicker is no longer a hard JS dependency. ~70 KB of JS + CSS no longer loads on every page that contains the widget. The fallback code stays in place and quietly re-engages on browsers that lack `<input type="date">` IF jQuery UI happens to be loaded by the theme or another plugin; modern browsers within the support floor (Safari 16+ / iOS 16+ / evergreen Chrome and Firefox) use the native picker either way.
* Stability — added a 15-second timeout to the calendar's availability fetch. A hung MotoPress / SpeedyCache misconfig used to leave the spinner running indefinitely; now the empty-state appears and the visitor can retry. Timeout is distinguished from "newer request superseded this one" via a TimeoutError-named DOMException so the silent-abort path still works for rapid month-nav.
* Tidy — removed `reinitElementorWidgets`, a ~36-line dead function from before v0.8.9 switched the info popup to MOVE (rather than clone) the cottage's content node. `refreshSwipers()` already handles the only post-v0.8.9 reinit need.

= 0.9.3 =
* "All cottages booked through {date}" hint now reports the REAL through-date — when every visible day is booked, the AJAX endpoint scans up to a year forward and returns the day before the next true availability. Previously the hint could only point to the last visible day in the current window, which understated the cutoff whenever the booked stretch extended beyond what was on screen.

= 0.9.2 =
* Today indicator — removed the yellow tint and bottom border from body cells in today's column. The header (date/day row) keeps its underline, which is enough orientation when past days aren't shown. Reverts an over-eager addition from 0.9.0.

= 0.9.1 =
* Book Now popup — cottage name now wraps to a second row at the colon, matching the cottage info popup ("Book Cottage 32:" on row 1, "Flamingo Bungalow" on row 2). Applies to all eight cottages via the shared `renderSplitTitle` helper.

= 0.9.0 =
* Accessibility — calendar day cells are now actually keyboard-operable: Enter or Space on a focused available cell opens the booking popup (previously cells were `tabindex="0"` with no key handler, a dead end for keyboard users). The booking-popup focus trap now re-collects focusables on every Tab, so nested Elementor widgets (carousel arrows, accordion toggles) cycle correctly inside the trap instead of leaking out. Loading state is announced to screen readers on every fetch (previously the sr-only span was wiped by the first render and never re-announced).
* Stability — in-flight AJAX is now aborted via `AbortController` when a newer request supersedes it, so rapid month-nav clicks no longer pile up wasted network traffic or race to render stale data. The booking popup's open-focus timer is cancelled on close and uses a double `requestAnimationFrame` instead of a 50ms `setTimeout`, eliminating the race where rapid open-close-open could land focus on a closed or stale element. SpeedyCache settings recursion now has an 8-level depth guard against pathological/cyclic option arrays.
* Mobile reliability — booking + cottage info popups now use `max-height: 90svh` (with `90dvh` and `90vh` fallbacks) so the popup never extends behind the iOS on-screen keyboard. Nav arrows are now 44×44 minimum to meet iOS HIG / WCAG 2.5.5 AAA touch-target guidance. When the check-in date moves and the existing check-out becomes invalid, the forced-shift now briefly highlights the check-out input and announces the change to screen readers instead of silently changing the value.
* Multisite-safe uninstall — `uninstall.php` now iterates every subsite via `switch_to_blog()` and clears each one's `mphbac_` transients individually, so a network uninstall doesn't orphan subsite transients in the database.
* Swipe-to-close on info & booking popups — drag the top of the sheet down to dismiss (matches iOS/Android sheet conventions). Only engages on touch devices, only from the sheet's top 80px, and only when the sheet body is scrolled to the top, so internal scroll is never hijacked.
* Today indicator on the date cell itself — every body cell in today's column now mirrors the header's underline (inset bottom border in the today-outline color), so "today" is scannable mid-grid without scanning back up to the header.
* Polish — back-to-today nav button has a tooltip + aria-label ("Jump back to today's availability"). The "all booked through" hint banner fades in instead of popping in. The grid breathes its opacity slightly during in-flight fetches so the visitor sees motion instead of a frozen dim state. All new motion respects `prefers-reduced-motion: reduce`.
* Tidy — stripped three unused fields (`labelStyle`, `inheritTheme`, `tooltipPrefix`) from the `data-config` JSON payload that's serialized to every widget on every page (≈250 bytes/page saved).

= 0.8.18 =
* Changed: cottage info popup header — the cottage name now splits across two rows at the first colon, e.g. "Cottage 31:" on row 1 and "Hibiscus Hut" on row 2. Same typography on both rows; applies on every viewport. Implemented via a small DOM split (text node + `<br>` + text node) inside the title element, preserving the link wrapper when a per-cottage title URL is set so clicking either row still navigates to the cottage page. Titles without a colon fall through unchanged.

= 0.8.17 =
* Changed: cottage info popup close ("X") button — swapped background and text colors so the X now reads as near-white on a gray circle instead of gray on near-white. The previous near-white-on-white had insufficient contrast against the popup's white background.

= 0.8.16 =
* Fixed (follow-up to 0.8.15): the v0.8.15 chevron rendered perfectly on the right arrow and stayed visible, but the LEFT button itself disappeared 0.3s after each slide settled. Cause: v0.8.15 dropped the `display` declaration (it had been there in v0.8.14 for flex centering, removed when switching to background-image), so any rule that sets `display: none` on the prev button — Elementor's mobile-hide rule, Bravada's reset, or Swiper's `.swiper-button-disabled` state — was now able to hide the button entirely. v0.8.16 pins `display: flex !important` on both arrow buttons so the layout slot stays regardless of state-class changes, and also covers Elementor's long-form `-previous` class name as a defensive measure in case the deployed Elementor version uses that variant. Mobile-only; desktop is unchanged.

= 0.8.15 =
* Fixed (follow-up to 0.8.14): the v0.8.14 CSS chevron rendered as a thin sliver in the top-left corner of the arrow button instead of centered. Cause: Elementor's CSS pins the `::before` pseudo-element absolutely at top-left of the button for its own icon rendering, and v0.8.14 set chevron geometry on `::before` without overriding `position`/`top`/`left`. v0.8.15 abandons the pseudo-element entirely and paints the chevron directly on the button as an inline-SVG `background-image`. Background images are part of the button's own painting — no pseudo positioning to fight, no descendant rules to worry about, and `background-position: center` guarantees centering. Mobile-only; desktop is unchanged.

= 0.8.14 =
* Fixed (follow-up to 0.8.13): on mobile, the cottage info popup's image-carousel arrow icon still disappeared after each slide settled — `!important` on opacity + visibility for the original Elementor icon was not enough to keep it visible. The hiding mechanism is something the override didn't intercept (likely a Swiper inline style, a pseudo-element rule, or icon-font rendering tied to a class that comes off post-transition). Switched approach: on mobile only, the plugin now hides the original icon and draws its own CSS chevron (border-based, white on a translucent dark circle) inside the arrow button via a `::before` pseudo-element. The chevron belongs to the plugin and cannot be hidden by Elementor/Bravada rules. Desktop is unchanged (the original Elementor icon renders correctly there). Scoped to the cottage info popup so carousels elsewhere on the site keep their default arrows.

= 0.8.13 =
* Fixed: image-carousel inside cottage info popup — navigation arrow icons no longer disappear after each slide settles on mobile. Elementor's image-carousel (or Bravada's kit) was zeroing icon opacity once the slide-transition class came off. Plugin now pins opacity + visibility on the arrow buttons and their inner icons whenever the popup is open. Scoped to the cottage info popup so carousels elsewhere on the site keep their default behavior.

= 0.8.12 =
* Fixed: Book Now popup's check-in / check-out date fields rendered as a thin horizontal slice with the top and bottom of the date text cut off on desktop. Same `line-height: 1px` regression v0.2.0 fixed for the calendar filter row, surfacing on the popup inputs for the first time. Root cause: v0.8.6 portaled the booking popup out to `document.body`, but the `.mphbac-root .mphbac-input` rule that carries the `line-height: 1.4 !important` override still required `.mphbac-root` as an ancestor — which fails on the portaled popup. v0.8.7 fixed the popup centering with the same class-doubled selector pattern but didn't apply it to the input rule. Switched `.mphbac-root .mphbac-input` to `.mphbac-input.mphbac-input` so the rule matches whether the input lives inside the widget tree (filter row) or has been portaled out (booking popup). Also restores correct padding, border, and background on the popup inputs as a side benefit.

= 0.8.11 =
* Fixed: image carousel inside the cottage info popup — navigation arrows and the Elementor lightbox now work on first open. v0.8.10's `swiper.update()` rescue couldn't recover the missing nav-arrow click bindings or the lightbox click handler, because both are wired once during Elementor's image-carousel init and not redone by update. Root cause: the `.mphbac-info-content` source div was `display: none` at page-load, so Elementor's `image-carousel.default` handler ran against a 0×0 container and didn't fully bind. The source div is now rendered offscreen with real width (`position: fixed; transform: translateY(-200vh); width: var(--mphbac-info-prerender-width, 720px)`) so Elementor's handler initializes Swiper, navigation, and lightbox correctly at page-load. v0.8.10's `refreshSwipers()` continues to backstop the post-move re-measure when runtime width differs from the prerender width.

= 0.8.10 =
* Fixed: image carousel inside the cottage info popup now responds to taps/clicks. Symptom was the classic Swiper-init-in-a-hidden-container pattern — the carousel briefly drew its first slide and nav arrows, then Swiper's resize observer fired, recomputed against the stale zero-width measurements cached at page-load (when the .mphbac-info-content source div was display:none), decided "everything fits, no nav needed", added `.swiper-button-disabled` to both arrows and they vanished. v0.8.9's `window.dispatchEvent('resize')` nudge updated Swiper's size but didn't re-evaluate navigation arrow state or kick the lazy-load queue. New `refreshSwipers()` helper walks every `.swiper` / `.swiper-container` inside the moved popup body and calls `swiper.update()` + `swiper.navigation.update()` + `swiper.pagination.update()` + `swiper.lazy.load()` explicitly. Reproduced on every mobile cottage and on the desktop cottage 22 popup; fixed for both.

= 0.8.9 =
* Fixed: Features & Amenities accordion finally responds to taps inside the cottage info popup. v0.8.4's clone-via-innerHTML approach (and v0.8.8's hardened reinit) couldn't keep third-party widget bindings alive after a clone, because their JS caches state against the original DOM node identity. New approach: instead of cloning, MOVE the original hidden `.mphbac-info-content` node into the popup body on open, and move it back to its hidden slot on close. Same DOM identity = the bindings Elementor's frontend init already attached at page-load stay alive — accordion clicks, Swiper carousel, pricing-table switcher all just work. Replaces the `data-id` uniquification / `removeData()` / `runReadyTrigger()` dance with a one-line `appendChild`.
* New: cottage info popup now mirrors the Book Now popup's mobile feel — centered vertically + horizontally, 12px gutters each side, 12px rounded corners all around, body scrolls internally up to 85% of the viewport. Drops the slide-up-from-bottom bottom-sheet pattern entirely. Same mental model across both popups.
* Improved: tablet (601–1024px) info popup uses 32px gutters, up to 720px wide. Desktop (≥1025px) default max-width lowered to 900px (was 1200px) so the layout doesn't feel sparse on wide monitors — the "Info popup max width" Elementor responsive control still overrides per-device when set.

= 0.8.8 =
* Fixed: Features & Amenities accordion (and other third-party Elementor widgets) inside the cottage info popup did not respond to taps/clicks. The naive `frontend/element_ready/<type>` re-fire from v0.8.4 doesn't handle two third-party gotchas: (1) the cloned widget keeps the original's `data-id`, and many widget registries dedupe by id and skip re-init; (2) Elementor's Base handler tracks bound handlers via jQuery `$.data('handlers')`, and re-firing the hook on the same DOM is silently a no-op. The popup's reinit now (a) rewrites `data-id` on every `.elementor-element` in the clone to a unique value, (b) clears any carried-over jQuery data, and (c) prefers `elementorFrontend.elementsHandler.runReadyTrigger()` — Elementor's canonical re-init entry point — over manual hook dispatch. This is also expected to fix the image carousel inside the popup (Swiper-based, same root cause).

= 0.8.7 =
* New: cottage info popup title is now a hyperlink. By default it links to that cottage's MotoPress accommodation page (the post the cottage_info row is assigned to). Each cottage_info row has a new "Title link URL (optional)" field above Content source — set a URL there to override the default. Links open in the same tab. Underlined title styling inherits the existing title typography.
* Fixed: Book Now popup wasn't actually centering to the viewport after v0.8.6. The centering CSS used `.mphbac-root .mphbac-sheet` (descendant selector), but the v0.8.6 portal moves the sheet to `document.body` where `.mphbac-root` is no longer an ancestor — so the rule never matched and the popup fell back to the original bottom-of-viewport mobile rule. Switched to the class-doubled selector `.mphbac-sheet.mphbac-sheet` (same pattern the info-sheet uses) which reaches (0,2,0) specificity without depending on any parent. Popup now centers reliably on desktop, tablet, and mobile portrait every time, not just the first.
* New: Book Now popup's Check-in and Check-out date fields now sit side-by-side on every viewport (mobile, tablet, desktop). Previously they were stacked. The two fields share the row 50/50 with a small gap. Error message wraps below at full width. On viewports too narrow for two date inputs (~< 320px) the fields gracefully stack via flex-wrap.

= 0.8.6 =
* Book Now popup now centers to the visible viewport on every device — desktop, tablet, and mobile — instead of anchoring to the widget's top. Tapping an available date opens the popup right where the visitor's eyes are, no matter where the calendar sits on the page. Previously the popup was tied to the widget's getBoundingClientRect().top, which on tall pages put it well outside the visible area; the auto-scroll fallback that tried to compensate was unreliable on desktop after the first open and never fired on mobile. The popup is now portaled to document.body on open (same pattern the cottage info popup has used since v0.7.2), so position:fixed + top/left 50% with transform:translate(-50%, -50%) gives literal viewport center regardless of any transformed Elementor ancestor in the page stack. Subtle 20px slide-up animation on open preserves the existing motion language.

= 0.8.5 =
* Fixed: on iPhone (and other notched devices) the cottage info popup's title and close-X could render slightly above the visible viewport, hidden under the notch / Dynamic Island / status bar. The full-mode popup's top anchor is now `max(widget-top, env(safe-area-inset-top))`, so the popup never starts above the device's safe area. Falls back to 0 on devices without a safe-area inset (every non-notched device, so no desktop impact).
* Made the "Info popup max width" control responsive — three independent values (Desktop / Tablet / Mobile) via the device-icon buttons next to the label, with bumped defaults: 1200 / 800 / 480 (was a single 800 across all viewports). Existing installs that have an explicit value saved keep it as the desktop value; tablet/mobile fall back to the new defaults until touched. The cap also moved from 1400 → 1600 for ultra-wide monitors.
* Default viewport ceiling for the non-full popup raised from 92vw → 96vw so a desktop popup at the new 1200px default doesn't leave a wide blue gutter on large displays. JS now sets the chosen max-width inline on the popup at open time (using the same per-device pattern as the side-margin control), so toggling the desktop browser between widths reflects on next popup open.

= 0.8.4 =
* Fixed: embedded Elementor widgets inside the cottage info popup (pricing tables, image carousels, multi-column containers) could overflow horizontally past the popup edge — worse in full-viewport mode, where the wider popup gave 100vw-anchored elements more space to scale up. Added defensive max-width: 100% and overflow: hidden containment on common Elementor wrapper classes inside .mphbac-info-body, plus min-width: 0 on the body itself so flex/grid children can shrink properly. Templates designed for the full page width should now fit cleanly inside the popup.
* New: per-cottage popup title override. The cottage_info repeater now has a "Popup title (optional)" text field above the Content source selector. Whatever you enter there shows as the popup header for that cottage. Leave it empty to use the MotoPress cottage name (existing behavior). Useful for marketing-tuned headlines like "Meet Cottage 3: Sunset" instead of the raw cottage post title.

= 0.8.3 =
* Fixed: cottage info popups using an Elementor template source were losing the image-carousel widget at the top and the container template's styling (centering, text colors, etc.). The wp_kses_post() wrap added in v0.8.0 was stripping inline scripts (carousel bootstrap), custom data-* attributes, and some inline style/class attributes that Elementor's container system relies on. Reverted to the raw render — templates are first-party site-owner content so the XSS concern doesn't apply in practice.
* New: weekend vs weekday colors are now fully customizable in the Calendar Header Row style section. The existing "Background color" and "Text color" are now labeled "Weekday background color" and "Weekday text color" (no behavior change for existing installs — same defaults, same selectors), and two new controls — "Weekend background color" and "Weekend text color" — apply to Saturday and Sunday header cells only. Leave a weekend control empty to inherit the weekday color.
* Default change: when the new Weekend background color is left empty, weekend header cells now match weekday header cells exactly (instead of the barely-visible 2.5% black overlay from v0.8.2). Set the weekend color explicitly to differentiate.

= 0.8.2 =
* Polish pass on the existing display experience. Four small visual additions, no new features:
* Weekend column tint — Saturday and Sunday columns get a barely-there warm-grey background so weekenders can spot Fri-Sun runs without scanning header labels.
* Month-boundary divider — when the visible window crosses a month boundary (e.g. Jul 31 → Aug 1), a thin vertical line appears on the first cell of the new month, giving orienting structure to 14- and 31-day grids.
* "Today" quick-jump button — appears in the nav row only when today is OUTSIDE the current visible range. Tapping it resets the calendar to the default device window starting today. New editable string in the Strings tab (`str_today`, default "Today").
* Cell tap scale — available cells briefly scale to 94% on tap, giving tactile feedback the moment a visitor commits to opening the booking popup. Honors prefers-reduced-motion: reduce.

= 0.8.1 =
* Today's column is now visually distinct on the body cells, not just the header row — a subtle yellow column tint plus a bolder header makes it easier to orient yourself in a 14- or 31-day grid.
* Smart all-booked hint. When the visible date range starts with one or more days where every cottage is already booked, a small banner appears above the grid: "All cottages booked through Jul 7. Next opening: Jul 8 (Cottage 1)." Quietly hidden in the normal case where the first visible day already has openings. Two new editable strings in the Elementor "Strings" tab (`str_all_booked` and `str_next_opening`) use `{through}`, `{date}`, and `{cottage}` placeholders so translators can rearrange the phrasing.
* Print stylesheet. Opening the browser's print dialog now produces a clean snapshot — heading, date range, grid (with status colors preserved via print-color-adjust), and cottage column — with filters, nav arrows, popups, and skeleton hidden. Useful for property managers sending availability to corporate clients without needing a third-party PDF export.
* Note: B1a from the v0.8.x plan (lazy-loading cottage info HTML to reduce page weight) was intentionally skipped. The 0.6.0 history confirms it broke Elementor template CSS enqueueing, and a safer migration path needs runtime verification.

= 0.8.0 =
* Hardening pass — no visible feature changes. Closes a latent XSS surface by running Elementor template renders through wp_kses_post() before they're emitted into the page (the same sanitizer WordPress uses for post_content). Adds a deterministic ORDER BY rr.ID to the reservation SQL query for predictable execution and slightly better plan caching on properties with many bookings. Drops one duplicate cached lookup per AJAX request (the room-type list is now resolved once and reused). Adds proper accessibility wiring: the calendar grid gets role="region" + aria-live="polite" so screen readers announce updates, and all buttons / inputs / cottage-name toggles in the widget now have a visible focus-ring for keyboard users. View Transitions are skipped entirely (not just animated to zero) when the visitor has prefers-reduced-motion: reduce set, saving the transition setup cost.

= 0.7.4 =
* Fixed: the cottage info popup could appear at the bottom of the page on Elementor sections whose stack includes a transformed ancestor (the same ancestor that broke clipping in v0.7.2). Root cause was a long-standing latent bug — the info sheet had `display: flex` set for its internal layout, which silently overrode the browser-default `[hidden] { display: none }`. The closed-state `transform: translateY(100%)` normally pushed it off-screen, but the transformed ancestor broke that transform's containing block. Added an explicit `[hidden] { display: none !important }` rule for popup elements so visibility is governed strictly by the attribute now.
* Fixed: the delete-X disappeared on the last remaining cottage info popup row in the Elementor editor, because the only row was force-expanded and the collapsed-row tools (including X) never rendered. Added a `title_field` to the cottage_info repeater (matching the working pattern in the cottage_labels repeater) and an explicit `prevent_empty: false` so the X stays available all the way down to zero rows.

= 0.7.3 =
* New Elementor control: "Info popup side margin" under the Info section, a responsive slider with separate values for Desktop, Tablet, and Mobile (using the device-icon buttons next to the label). Defaults match the v0.7.2 hard-coded values exactly — 32px desktop / 20px tablet / 12px mobile — so installs that don't touch the new control look identical to today. The control only applies when "Full viewport width" is on. JS sets the resulting value as --mphbac-info-side on the sheet at popup-open time (since v0.7.2 portals the popup to document.body, the standard Elementor selector mechanism can't reach it).

= 0.7.2 =
* Cottage info popup fixes for both desktop and mobile. The popup is now portaled to document.body on open so it escapes Elementor and Bravada ancestor containers that were either clipping the right edge (hiding the close button on desktop) or making the right margin appear missing on mobile. Added symmetric horizontal gutters — 12px on mobile, 32px on desktop — so the popup is a proper panel with equal margins on both sides. Body scroll is locked while the popup is open and the popup has overscroll-behavior: contain, so touch-scroll on mobile reaches the bottom of the popup content instead of chaining into the page underneath.

= 0.7.1 =
* Booking popup (the one that opens when you tap an available calendar cell) now anchors its top edge to the top of the calendar widget on every viewport, matching the cottage-info popup behavior. Previously the popup stuck to the bottom of the viewport on mobile and floated centered on desktop, which on a page where the calendar wasn't fully in view meant the popup appeared nowhere near the calendar you'd just tapped. JS reads the widget's getBoundingClientRect().top at open time and sets it as --mphbac-sheet-top; CSS uses that variable instead of bottom: 0 / top: 50%.

= 0.7.0 =
* Perceived-speed bundle. Three changes that together make the calendar feel instant on every device: (1) The "Loading availability…" text on first paint is replaced with a pulsing skeleton grid that mirrors the cottage rows, so visitors see structure immediately instead of a blank box. (2) The cottage info popup pre-fetches its images on hover (desktop) or touchstart (mobile) — by the time the visitor taps to open the popup, the cottage's photos are already in the browser cache. A 60ms hover debounce keeps mouse sweeps from triggering needless fetches. (3) Both popup-open animations and the form-POST to MotoPress checkout are wrapped in the View Transitions API on supported browsers (Chrome 111+, Safari 18+), producing smooth fade-morph transitions; older browsers see today's CSS transitions unchanged. All three pieces honor `prefers-reduced-motion: reduce`.

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
