=== DCC Guest Guide ===
Contributors: doracanalcourt
Tags: elementor, guest, guide, hotel, hospitality, faq, info
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.9.7.21
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A flexible Elementor widget for guest-facing info guides — Wi-Fi, hot tub,
local tips, checkout instructions. Grid / list / masonry / carousel / split-pane
layouts. Stage-swap / accordion / flip-card reveal modes. Theme presets with
auto dark mode. Cmd-K search. Per-item QR code, share links, copy buttons.

== Description ==

This plugin adds a single Elementor widget under the **Dora Canal Court** category:
**DCC Guest Guide**. It lets you build a sectioned guest guide with a menu hub
of tiles that open into detailed content cards.

It is a side-by-side alternative to a Guest Guide widget generated via
Elementor's Angie Code. Same feature surface plus:

* Section dropdown (no typo-prone free-text keys)
* Defensive defaults — no PHP 8 warnings on untouched toggles
* FAB modal with `role="dialog"`, focus trap, ESC-to-close, focus return
* Specificity defense (doubled `.dccgg-root.dccgg-root` selector) that
  outranks Bravada / aggressive theme resets
* Full i18n via `dcc-guest-guide` text domain (works with Loco Translate)
* Print stylesheet scoped to the widget container, not global
* Editor-preview enqueue so flip cards and stage transitions render in
  Elementor's editor iframe
* Video URL normalizer supporting youtube.com/watch, youtu.be short links,
  YouTube Shorts, embed URLs, Vimeo (both vimeo.com/ID and player.vimeo.com),
  and self-hosted MP4 / WebM / MOV / OGG
* Five layout options beyond grid/list: masonry/bento, carousel (mobile),
  split-pane (desktop)
* Two extra reveal modes: accordion, 3D flip-card
* Six theme presets + automatic dark mode following `prefers-color-scheme`
  with a user override remembered in `localStorage`
* Cmd-K search filters across all sections and items with `<mark>` highlights
* Per-item QR code dialog (great for quickly sharing Wi-Fi / door codes /
  map URLs to a guest's own phone)
* Per-item share link button copies a URL with `?guide=KEY` so guests can
  re-open the guide on a specific section

== Manual smoke-test checklist ==

After upload + activation:

1. Drag the **DCC Guest Guide** widget into an Elementor page.
2. Add at least 3 sections (give each a `section_key`, e.g. `wifi`, `tub`,
   `local`) and save.
3. Reopen the items repeater — the section dropdown should now list them.
4. Add at least 6 items, mixing WYSIWYG and Elementor-template content sources.
5. Cycle each **Menu layout** (grid / list / masonry / carousel / split-pane)
   and each **Reveal mode** (stage / accordion / flip). Confirm the editor
   preview renders for every combination.
6. Confirm the flip mode automatically falls back to stage when paired with
   list / carousel / split-pane.
7. On the front-end: test Cmd-K (⌘K on Mac, Ctrl-K elsewhere), copy buttons,
   share buttons (URL → clipboard, look for `?guide=...`), QR dialog, Map
   Directions link, FAB open/overlay-close/ESC-close.
8. Toggle **Theme preset** through Coastal / Hotel / Bohemian / Minimal /
   Dark. Toggle the light/dark switch button at the top — preference should
   persist on reload (localStorage).
9. Print preview should show only the guide content (no toolbar, search,
   tiles, FAB, etc).

== Changelog ==

= 0.9.7.33 =

**Fix: the detail popup rendered too small on desktop (regression from
v0.9.7.30).**

Making the section title match the item title in v0.9.7.30 sized both in
`rem`, which locked them to the browser's 16px root instead of letting
them scale with the widget's own content font. On a guide inheriting a
larger font, every title in the popup shrank by roughly 20% — measured
23px before, 18.4px after. Both are back on `em`, so they scale with the
content again while still matching each other, in normal and scrolled
states alike.

Also restores the compact item title (flip-back / accordion), which the
v0.9.7.30 rule was overriding to full size.

Note: versions 0.9.7.31 and 0.9.7.32 were withdrawn. This release is
v0.9.7.30 plus the fix above; the numbering skips ahead so the withdrawn
builds cannot collide with this one in any cache.

Regression suite now asserts the titles scale with the surrounding
content font, not just that they match each other; 35 assertions, all
passing.

= 0.9.7.30 =

**Popup header and button polish (four host requests).**

1. **Buttons render as authored, not ALL CAPS.** "Back", "Copy password"
   and friends no longer shout. The plugin never set uppercase on
   buttons — the site theme did — so the fix overrides the theme at the
   same specificity the plugin already uses to defend inputs and
   buttons. Wide letter-spacing (which themes pair with uppercase) is
   reset too. Badges, section labels, wizard counters and tile counts
   keep their intentional uppercase.

2. **The section title now matches the item-title size.** It also no
   longer shrinks while scrolling. Both titles are sized from the widget
   root at the same defended specificity, so a theme's independent
   h2/h3 rules can no longer size them differently.

3. **Section title and support (⋯) button moved to the top row**, above
   Back and the prev/next arrows. Markup order matches the new visual
   order, so tab order and screen-reader order stay correct and the
   heading precedes the controls acting on it.

4. **Report dialog × moved into the top-right corner.** It was a flex
   sibling of the heading, so a heading wrapping to two lines pushed it
   to the vertical middle and the row padding held it inside the corner.
   It is now pinned to the corner regardless of how the heading wraps.

Regression suite extended with a scenario that renders the popup inside
a deliberately hostile theme (uppercase buttons, independent h2/h3
sizing) and asserts all four; 33 assertions, all passing.

= 0.9.7.29 =

**Branding cleanup.** The Elementor panel category the widget appears
under is now **Dora Canal Court** (slug `dcc-widgets`). The category
slug only groups widgets in the editor
panel — page data stores the widget type — so widgets already placed on
pages are unaffected and need no re-save. Developer-tooling references
were also removed from this readme.

Note: the MPHB Availability Calendar plugin registers the same shared
category and needs the identical rename to keep both widgets grouped
under one panel heading.

= 0.9.7.28 =

**Detail-popup alignment polish (two host requests).**

1. **Guide-item titles are now absolutely centered, emoji/icon left-
   aligned.** Each item title is a 3-column grid (equal side columns
   flanking an auto-width center), so the emoji sits at the left edge and
   the title stays dead-centered no matter the icon width or how many
   trailing controls (speaker, badge, report) are present.

2. **In-popup Guide-Items sidebar (TOC) removed** — on the narrow popup
   it crowded the content and skewed the title centering. (The print
   table of contents is separate and unchanged; re-enable per-site with
   the `dccgg_show_detail_toc` filter.) With it gone, the section title
   and the item titles line up centered.

3. **"More button text" now expands horizontally.** The ⋯ menu button was
   locked to a fixed 44×44 circle, which wrapped multi-glyph button text
   (e.g. two emoji) onto two stacked rows. A text summary now sizes to its
   content and stays on one row.

Regression suite (`tests/popup.test.js`) extended with assertions for
item-title centering and the single-row more-button; 26 assertions, all
passing.

= 0.9.7.27 =

**Code audit — automated regression tests + two fixes.**

* **New: automated popup regression suite** (`tests/` at the repo root,
  not shipped in the plugin zip). Drives the real `widget.js` +
  `widget.css` in headless Chromium at phone and desktop viewports and
  asserts every failure mode that shipped between v0.9.7.17 and
  v0.9.7.26: popup fully on-screen and near the top, internal scroll
  without the frame jumping, opaque flush header, always-visible
  scrollrail, transformed-Elementor-ancestor cases, FAB-hub dialog
  cases, and zero JS errors. Run `node tests/popup.test.js` before
  every release. 21 assertions, all passing on this build.
* **Fix (found by the new suite on its first run): a section detail
  opened from inside the FAB hub was invisible.** Chrome treats a modal
  `<dialog>` as the containing block for fixed-position descendants
  (contrary to the v0.9.7.23 assumption), and the hub's
  `overflow-y: auto` paint-clipped the detail card into the collapsed
  hub strip. While a detail is open inside the hub, the hub's overflow
  is now visible (the card's geometry was already viewport-correct) and
  the dim overlay is stretched to keep covering the full screen.
* **Fix: the AI "daily" usage cap is now a true calendar-day cap.** The
  counter's fixed 24-hour expiry was re-stamped on every question,
  making it a sliding window that steady usage could extend
  indefinitely. It now expires at the site's local midnight.

Audit result otherwise: no high-severity findings — endpoints are nonce-
protected and rate-limited, output is escaped, AI answers render as
plain text, assets load only on pages using the widget, and external
API calls are transient-cached.

= 0.9.7.26 =

**Detail popup chrome polish (five host-requested refinements).**

1. **Popup opens near the top.** On phones the bottom sheet now rises to
   just below the status bar / notch (an ~8px gap) instead of stopping at
   90% height, giving much more reading room. Still a static, bottom-
   anchored `svh` cap, so it keeps the v0.9.7.25 guarantee that it can't
   overflow the top or grow when the iOS toolbar hides.

2. **Header/navigation is now fully opaque.** Content no longer shows
   through behind the sticky Back/nav/title bar while scrolling. The inner
   detail card is flattened in the open popup so the sheet is a single
   opaque frame, and the header carries a solid background.

3. **No more gap above the header.** The header is now full-bleed
   (edge-to-edge) and sits flush at the very top of the popup with a
   rounded top that merges into the frame, so there's no transparent strip
   above it where scrolling items used to peek through. The mobile grab-
   handle pill moved onto the header so it rides the opaque bar.

4. **Always-visible scrollbar.** The popup draws its own slim scrollbar
   that is always visible (native scrollbars auto-hide, and iOS Safari
   force-hides them). It shows both that there's more to scroll and how far
   down you are. Sits under the opaque header so it spans just the content.

5. **Reading progress bar removed.** With the always-visible scrollbar now
   showing scroll position, the separate top progress bar was redundant.

Positioning/sizing mirrors the DCC Availability Calendar (v0.11.0) cottage
info popup.

= 0.9.7.25 =

**The detail popup no longer overflows the top of the mobile viewport —
rebuilt on the proven DCC Availability Calendar popup pattern.** Earlier
releases (0.9.7.17 through 0.9.7.24) kept adjusting the popup's geometry
and the overflow kept returning, most visibly as: the popup opens
correctly sized, then the instant you tap/scroll it grows, its top goes
above the screen, it stops scrolling, and — because it now fills the
viewport — you can't tap outside to dismiss it.

Root cause (two compounding mechanisms):

1. The popup pinned its top AND bottom and centered with `margin: auto`,
   with its height capped by the DYNAMIC `dvh` unit. When the iOS toolbar
   hides on first scroll, `dvh` grows, so the box grew too.
2. v0.9.7.23 added JavaScript that re-wrote the popup's top position on
   every visual-viewport movement (`--dccgg-vv-top`). Tapping/scrolling
   moves the visual viewport, which re-ran that code and shoved the top
   off-screen.

Fix — the popup is now positioned entirely in CSS, matching the
Availability Calendar sheet that already works on the same devices:

* **Mobile: a bottom-anchored sheet.** Anchored only to the bottom (no
  `top`), capped at a STATIC `90svh` (`svh` = small-viewport-height, the
  viewport at its *smallest*, so it never grows when the toolbar hides),
  with internal scroll. With the top edge never pinned and the height
  cap static, the popup physically cannot overflow the top or jump.
* **Desktop: a centered card** via `translate(-50%,-50%)`, capped at
  `85svh` — no more `margin:auto` four-inset centering.
* **All viewport-tracking JavaScript removed** — no `--dccgg-vv-top`
  stamping, no `visualViewport` / resize listeners re-positioning the
  popup. Nothing recomputes position on scroll, so nothing can jump.
* `bottom: env(safe-area-inset-bottom)` + `viewport-fit=cover` (added to
  the page's viewport meta on boot, idempotent) lift the sheet clear of
  the iOS home indicator / floating toolbar. `overscroll-behavior:
  contain` keeps inner scrolling from chaining to the page.

The same treatment is applied to the FAB menu-hub popup, which shared
the identical layout. Front-end and editor behavior are otherwise
unchanged.

= 0.9.7.24 =

**Editor fix: clicking a Menu Hub section now shows its guide items in
the Elementor editor preview.** In stage-swap reveal mode the detail
card opens as a `position: fixed` modal portaled to the page `<body>`.
That works on the live site, but inside the Elementor editing canvas
(an iframe with its own transformed/overflow-managed surface) the modal
rendered where the host couldn't see it — so clicking a section
appeared to do nothing and there was nothing to edit.

Now, when running inside the editor preview only, the widget reveals
the clicked section's detail **inline** in the canvas flow (the same
treatment split-pane layout already uses) instead of as a fixed
overlay. The section's guide items appear right in place; the Back
button returns to the hub. Front-end visitors are unaffected — they
still get the animated popup. Also hardens the editor against FAB mode:
the hub `<dialog>` (which is `display:none` until opened) is forced
visible and in-flow in the editor so its content is always editable.

= 0.9.7.23 =

**Definitive fix for the recurring "popup overflows the top of the
screen" bug.** Four releases (0.9.7.17/.19/.21/.22) adjusted the
popups' CSS geometry and the overflow kept coming back, because two
mechanisms outside the CSS were corrupting the coordinate system the
CSS was written against:

1. **The FAB hub was never viewport-anchored.** The hub wrapper stayed
   nested inside the Elementor section DOM. Any ancestor with a
   `transform`, `filter`, `will-change`, or `contain` (Elementor motion
   effects, entrance animations, sticky wrappers) silently becomes the
   containing block for `position: fixed` — so "top: just below the
   header" was measured from that ancestor, not from the screen, and
   the popup could open with its top far above the visible viewport.
   The detail modal dodged this via its v0.9.5 portal-to-body; the hub
   never got the equivalent.
2. **iOS Safari auto-zoom.** Focusing any form field with a font size
   under 16px makes iOS zoom the page — and the zoom persists after
   the keyboard closes. Fixed and top-layer boxes anchor to the LAYOUT
   viewport, so once zoomed/panned, the popup's top edge can sit above
   the VISIBLE viewport no matter how correct the CSS is.

Fixes, layered:

* **FAB hub is now a native `<dialog>` opened with `showModal()`** —
  it renders in the browser's top layer, which the spec positions
  against the real viewport regardless of ancestor transforms. The
  element keeps its DOM position, so every existing selector and
  Elementor style control still applies. Backdrop dimming moves to
  `::backdrop`; ESC routes through the animated close via the
  `cancel` event; clicks on the backdrop still close the hub. Browsers
  without `<dialog>` (pre-iOS 15.4) fall back to the previous flow.
* **Detail popups opened from inside the hub no longer portal to
  `<body>`** (a body child would paint BEHIND the top layer). They
  stay inside the hub dialog; `position: fixed` still resolves against
  the viewport because the open hub now settles on `transform: none`
  (any non-none transform would have made the hub the containing block
  and let its internal scroll clip the detail card). Non-FAB embeds
  keep the portal.
* **All form fields inside the widget are forced to ≥16px on phones**,
  which prevents iOS auto-zoom from ever triggering.
* **Both popups now track `visualViewport.offsetTop`** (stamped as
  `--dccgg-vv-top`, updated on visual-viewport resize/scroll while
  open) so even an already-zoomed/panned page keeps the popup's top
  edge — and its close button — inside the visible screen.
* QR dialog, themed copy effects, and toasts re-parent into the open
  hub dialog so they keep painting above it (body children can't
  out-z-index the top layer).
* Print stylesheet forces `display: block` on the wrapper so a closed
  hub dialog still prints the full guide.

= 0.9.7.22 =

**Mobile popup overflow regression fix.** The v0.9.7.21 desktop centered-
card pattern added `margin: auto`, `height: fit-content`, and a `dvh`-
based `max-height` to both popups (the detail modal `.dccgg-stage` and
the FAB menu hub `.dccgg-fab--yes .dccgg-wrapper`). The existing
`@media (max-width: 600px)` bottom-sheet overrides only reset
`max-height: none` on the detail modal and reset nothing on the FAB
wrapper, so on phones the desktop centering kept applying:

* Detail modal: the sheet shrank to its content and re-centered
  vertically inside the `top:8+offset → bottom:0` rectangle, leaving
  awkward backdrop above and below instead of the intended full
  bottom-sheet coverage.
* FAB hub: capped at `dvh - offset - 32` AND auto-centered, so on iOS
  Safari with no detected sticky theme header the wrapper rendered
  near the top of the viewport, the close-X sat under the URL bar, and
  the popup read as a regular page rather than a popup.

Fix: explicitly reset `margin: 0; height: auto;` in both mobile rules
and `max-height: none;` in the FAB wrapper mobile rule (the stage
already had `max-height: none`). True bottom-sheet behavior restored,
internal scroll handles overflow, slide-up animation plays correctly,
desktop centered-card behavior is unchanged.

= 0.9.7.21 =

Three changes from live host feedback.

**1. "Ask anything about the cottage" button now works (and got
smarter).** Root cause: the search input's `blur` handler unconditionally
wiped the dropdown's contents 200 ms after focus left, which raced the
AI button's click and destroyed the prompt before the AJAX response
could render. `wireSearch` now leaves the dropdown alone while focus is
inside the results list AND while an AI answer is on-screen, so the
guest can read the answer without it disappearing under them.

The empty state is also rebuilt as a three-tier flow:

* **Tier 1 — Did you mean:** when the full multi-word query fails, we
  re-search each token individually and surface up to three suggestion
  chips (e.g. "Wi-Fi · Hot Tub · Checkout") so guests who just
  misspelled or mistyped one word can recover with a single tap.
* **Tier 2 — Ask anything:** the existing AI button, fixed.
* **Tier 3 — Still stuck:** when Report-a-Problem is enabled, a small
  "Still stuck? Tell the host →" CTA at the bottom opens the Report
  dialog with the failed query pre-filled (`[Search miss] "..."`). Turns
  every dead-end into actionable host feedback, no extra config.

The 3-tier render replaces the v0.7 MutationObserver approach — no more
race window between the search render and the AI prompt appearing.

**2. Detail popup is now centered vertically with internal scroll.**
Replaces the v0.9.7.17 top+bottom-pinned layout. Popup is now
`fixed; top: var(--dccgg-detail-top-offset, 0px); left: 0; right: 0;
bottom: 0; margin: auto; height: fit-content; max-height: calc(100dvh
- offset - 32px); overflow-y: auto`. Short content sits centered in the
visible viewport; tall content caps at the available height and scrolls
inside the popup. Physically cannot overflow the viewport in either
direction. Same centering pattern applied to the FAB wrapper for
consistency with v0.9.7.19. Mobile bottom-sheet layout
(`max-width: 600px`) unchanged.

**3. New editor controls for previously-hardcoded strings + AI button
styling.**

* Content → Search: two new TEXT controls — *"Did you mean" label* and
  *"Still stuck?" CTA label*.
* Content → Engagement → AI fallback search: two new controls — *AI
  "Thinking…" placeholder* (TEXT) and *AI error text* (TEXTAREA). Both
  were hardcoded English fallbacks before; now host-customizable and
  picked up by Loco Translate / WPML.
* Style → Ask Anything Button: dedicated section matching the existing
  Buttons / Back Button / Reset Checklist Button pattern — Typography,
  Border, Border radius, Padding, plus Normal and Hover tabs with text
  and background color. Scoped to `.dccgg-ai-button` so per-button
  overrides don't bleed into other buttons in the widget.

= 0.9.7.20 =

Code-health cleanup pass. One real bug fix, four orphan-code deletions
left over from earlier feature removals. No new features, no behaviour
changes for live guests beyond the gallery fix.

**Bug fix — Photo gallery thumbs work again once any section has been
opened.** The Gallery / hotspots feature shipped in v0.7 used
`root.addEventListener('click', …)` for thumb-tap → lightbox delegation.
When v0.9.5 portaled `.dccgg-stage` (containing every detail card)
to `<body>` on first detail open, the click bubble path stopped passing
through `.dccgg-root`, so every gallery thumb silently no-op'd from the
second detail open onward — no console error, no visible signal. Same
bug pattern v0.9.7.5 fixed for `wireChecklists` and `wireSectionNav`;
finally caught for galleries. `wireGalleryStrip` now delegates from
`document` with a `stage.__dccggRoot` back-pointer so each widget still
only handles its own thumbs.

**Cleanup — drop orphan code from earlier removals.**

* Per-section More menu — Theme + Share button handlers
  (`wireMoreMenu`) attached click listeners to `.dccgg-more-theme` and
  `.dccgg-more-share`, which haven't been rendered since v0.9.5
  removed the visitor-facing dark-mode toggle and per-section Share
  link. ~50 lines of unreachable JS deleted, including the only
  remaining `navigator.share` call site in the file.
* `.dccgg-theme-toggle` CSS rules (~30 lines across light, dark, focus
  and print blocks) deleted — the element hasn't been rendered since
  v0.9.5. `wireDarkMode` simplified to apply mode + follow-OS without
  the dead toggle-click branch. `STORAGE_KEY`, `readStored()`,
  `writeStored()` deleted in the same pass.
* `wireShare()` (~80 lines) deleted — queried `.dccgg-item-share`,
  which v0.9.4 removed from `render_item()`. Function ran every init
  and no-op'd because the selector never matched. The matching
  `.dccgg-item-share` CSS rules across three blocks deleted in the
  same pass.
* Orphan strings: the `str_share`, `str_share_copied`, and
  `str_theme_toggle` Elementor string controls registered in
  `register_strings_controls()` deleted — every consumer was one of
  the deleted JS handlers above.
* `data-config.strings.readMore` / `readLess` keys deleted — never
  consumed by JS (the live Read-More button reads its text from
  per-item `data-more` / `data-less` attributes set inline by
  `render_item()`). The `str_read_more` / `str_read_less` Elementor
  controls stay; they still feed the inline attributes.
* `data-config.searchIndex` no longer emitted when search is disabled.
  Previously serialised as `"searchIndex":[]` even when `wireSearch`
  was gated off — small per-page payload waste on guides that ship
  search turned off.

Net effect: smaller bundle, fewer dead-code traps for the next
debugging session, and one real broken-feature fix.

= 0.9.7.19 =

**FAB wrapper no longer overflows the top of the viewport.** The
v0.9.7.17 sticky-header fix targeted the detail modal
(`.dccgg-stage`), but the popup the host was actually seeing
overflow was the FAB wrapper (`.dccgg-fab--yes .dccgg-wrapper`)
— the floating-action-button modal that opens when guests tap
the wrench icon. Different DOM node, different CSS, never got
the offset treatment.

Root cause: the FAB wrapper used `position: fixed; top: 50%;
transform: translate(-50%, -50%); max-height: 90vh;` to center
itself in the viewport. On any site with a sticky theme header
the `top: 50%` anchor was measured against the full visual
viewport, so when the wrapper grew to `90vh` its top edge — and
the close `×` button — landed above the sticky nav and were
unreachable on mobile.

Fix mirrors the v0.9.7.17 detail-modal pattern: replace the
center+max-height approach with `top: calc(var(
--dccgg-detail-top-offset, 0px) + 16px); bottom: 16px;` so the
wrapper is physically constrained between the sticky header and
the viewport bottom. `wireFab.open()` now calls the existing
`detectStickyTopOffset()` helper to stamp the offset onto
`.dccgg-wrapper` before opening, with a debounced re-measure on
window resize. On phones (`max-width: 600px`) the wrapper
becomes a full-width bottom sheet with the same offset
treatment, matching the detail-modal bottom-sheet pattern.

Verification: install, hard-refresh, tap the wrench on the
guide page. The wrapper now opens with its top edge clearly
below the site's sticky nav and the close X always reachable —
both mobile and desktop. If you still see the old behavior,
purge SpeedyCache from the admin bar; it has been serving stale
assets across these releases.

= 0.9.7.18 =

Tier-1 audit-bundle release. Six high-confidence, low-risk fixes
across PHP, JS, and CSS — no behavior changes for normal use.

**Security — gate `?debug=1` behind admin capability.** The
`dccgg_weather` and `dccgg_usgs` AJAX endpoints are registered for
both logged-in and anonymous visitors (so the conditions card
works for guests). Appending `?debug=1` previously caused those
endpoints to return the upstream URL and a 400-char excerpt of
the upstream response body in their JSON error payload — useful
for the host, but visible to any anonymous visitor who knew the
flag. Both handlers now only honor `debug=1` when
`current_user_can('manage_options')` is true.

**Security — strip newlines from the email `From:` display
name.** `wp_mail` builds the `From:` header by concatenating the
admin-configured `problem_report_from_name` setting with the
admin-configured email address. `is_email()` already rejects
newlines in the email itself, so the address half was safe, but
the display-name half had no equivalent guard. A compromised
admin or a future Elementor-panel injection could splice `\r\n`
into the name to add a `Bcc:`. Strips `\r`, `\n`, and `\0` from
the name before building the header.

**iOS Safari — lightbox now uses `100dvh`.** The image lightbox
used `height: 100vh; max-height: 100vh;` which on iOS Safari
includes the address-bar height. Tall portrait photos were
clipping at the bottom of the viewport whenever the URL bar was
showing. Adds `100dvh` (dynamic viewport height) with `100vh` as
the fallback line for older browsers.

**Perf — cache the sticky-header offset between modal opens.**
v0.9.7.17's `detectStickyTopOffset()` fallback walks every body
descendant to depth 4 and calls `getComputedStyle` on each. On a
typical Bravada + Elementor page that's 500-1500 calls every
time a guest opens a section, plus another full run on every
80 ms-debounced resize event. The result is now memoized and
only re-scanned when the viewport width changes (rotation,
tablet split-screen, devtools open / close). The
`?dccgg-debug-popup=1` flag still re-scans on every open so
diagnosis isn't cached.

**Debugging — conditions card weather fetch now logs failures.**
The `wireConditions()` weather chain ended with
`.catch(() => {})` — completely silent on failure. The NOAA and
USGS chains in the same function already used
`console.warn('[DCCGG conditions] ...')`. Brought the weather
chain into line so an Open-Meteo outage shows up in DevTools
instead of just leaving the row blank with no signal.

**Editor preview — toast now visible in mobile preview.** The
v0.9.7.17 `editorPreviewToast` was pinned to `top: 12px`. In
Elementor's mobile preview iframe the top 60-80 px is the
device-frame chrome, so the toast landed behind it. On viewports
narrower than 500 px the toast now pins to `bottom: 12px`
instead. Also caps height at `60vh` with `overflow: auto` so a
long stack trace scrolls inside the toast rather than overflowing
the iframe.

= 0.9.7.17 =

Two-issue release.

**A. Detail-card popup overflowed the top of the viewport on the
live site**, hiding the site's sticky header (DCC logo + hamburger
menu) and clipping the top of the popup itself. Affected both
mobile and desktop, both logged-in and anonymous visitors.

Root cause: `detectStickyTopOffset()` in `widget.js` measured the
height of any sticky/fixed theme header so the popup could sit
flush below it (via the `--dccgg-detail-top-offset` CSS variable).
But the function only scanned a curated selector list (`header`,
`nav`, `[role="banner"]`, `.elementor-sticky--active`, etc.) and
doracanalcourt.com's sticky nav doesn't match any of them. The
detector returned 0 and the popup painted at `top: 8 px`, directly
under the site header.

Fix: two-tier detector. The fast path (the existing curated list)
runs first; if it returns 0, a depth-bounded scan of every body
descendant in the first 4 levels runs. The fallback applies the
same position / visibility / bounds filters as the fast path PLUS
a 70 %-viewport-width threshold to reject floating chat widgets,
scroll-to-top FABs and ad sidebars. Catches generic sticky themes
without theme-specific knowledge.

**B. Clicking a tile in the Elementor editor preview iframe threw
a console error and didn't open the detail card**, blocking the
host from previewing detail edits before publishing. Long-standing
issue, finally addressed.

Fix: defensive guards + a visible error toast inside the editor
preview. `openDetail()` is now wrapped in a try/catch that
surfaces any exception as an orange toast at the top of the
preview iframe (auto-dismisses after 12 s; click-to-copy includes
the full stack so the host can paste it for a follow-up release).
The two specific silent bail-outs in `showDetailModal()` —
`.dccgg-stage` missing, `.dccgg-detail-overlay` missing — now both
log to the console AND show a toast naming the missing element
and the most likely cause (usually Reveal Mode set to something
other than "stage"). Likewise the `openDetail()` "no matching
.dccgg-detail" bail-out, which previously fired silently when the
section's detail markup wasn't in the DOM.

The toast is no-op outside the editor preview, so live visitors
never see it.

**Bonus diagnostic: `?dccgg-debug-popup=1`** URL flag mirrors the
existing `?dccgg-debug-conditions=1` / `?dccgg-debug-search=1`
flags. Logs the sticky-header detector's chosen element and offset
to the browser console so future "popup position is wrong"
reports can be diagnosed without screenshots.

= 0.9.7.16 =

Hotfix: live search returned "Whoops! No matches" for every query —
even trivial words like "the" that appear in nearly every section.

Root cause: the v0.9.7.14 lazy-AJAX search index introduced for
payload-size savings was fragile in production. When SpeedyCache
served HTML that predated v0.9.7.14 (or any render context where
`get_the_ID()` didn't resolve), the new `post_id` / `widget_id`
config fields were missing, the `dccgg_search_index` AJAX call
returned an empty array, and the JS rendered "No matches" for
every search query.

Fix: re-inline the search index on `data-config`, restoring the
v0.9.7.13 and earlier behavior. The ~30-50 KB inlined-payload
savings wasn't worth the reliability cost — search is one of the
two highest-traffic features and it needs to be bulletproof.

* `Widget::render()` now calls `Widget::build_search_index($s)` and
  re-emits the result on the data-config `searchIndex` key.
* `wireSearch()` in `widget.js` uses the inline payload directly
  when present; the `dccgg_search_index` AJAX endpoint stays
  registered as a defensive fallback for any browser still running
  cached v0.9.7.14/15 JS against a v0.9.7.16 page.
* New diagnostic flag: append `?dccgg-debug-search=1` to the page
  URL to log which code path fired (inline vs AJAX) and the index
  size into the browser console. Mirrors the existing
  `?dccgg-debug-conditions=1` pattern.

= 0.9.7.15 =

Hotfix: Report-a-Problem (and every other AJAX feature — search, AI
fallback, conditions card, NOAA banner) returned HTTP 403 in the
host's regular Chrome session while working in incognito Chrome,
Edge and Safari.

Root cause: SpeedyCache (active on this site) serves the full-page-
cached HTML to every visitor, regardless of login state. The cached
HTML carries the WordPress nonce that was minted for the anonymous
visitor who originally populated the cache entry (user ID 0). When
the logged-in admin then loads that page and submits a form, the
plugin's `check_ajax_referer('dccgg_nonce', 'nonce')` validates the
nonce against the AJAX request's session — which belongs to the
logged-in admin's user ID, not 0. WordPress nonces are bound to
(user ID + action), so the comparison fails, `check_ajax_referer`
dies with `-1`, and the response comes back as HTTP 403. Guests
never hit this — their cached anonymous nonce matches their
anonymous session.

Fix: lazy nonce refresh, retried at most once per session.

* New AJAX action `dccgg_refresh_nonce` returns a fresh nonce bound
  to the current session. No referer / nonce check on the endpoint
  itself — the session cookie authenticates the requester, and the
  returned nonce is locked to that session so it can't be used to
  escalate privileges.
* New JS helpers `dccggFetch(config, body)` and
  `dccggFetchGet(config, action, params)` wrap fetch() so the first
  HTTP 403 of the page life triggers a single
  `dccgg_refresh_nonce` round-trip, updates `config.nonce` in
  place, and retries the original request. A flag on the config
  object (`__nonceRetried`) prevents the retry path from looping
  if the second response is also 403 (which means real failure, not
  stale nonce).
* All visitor-side AJAX call sites converted to the helpers:
  Report-a-Problem submit, lazy search-index fetch, AI search
  query, conditions-card weather / NOAA-alerts / USGS triple, and
  the SOS-button NOAA banner.

Transparent to anonymous guests — their first response is 200, so
the refresh path never fires. Logged-in users see exactly one
extra round-trip on the first AJAX call after a page load, then
zero overhead on every subsequent call in the same page lifetime.

Editor-side Export / Import are unaffected — the Elementor editor
isn't full-page cached, so its nonces (`dccgg_export`,
`dccgg_import`) are always fresh.

= 0.9.7.14 =

Audit-driven cleanup pass: security, i18n, mobile ergonomics, payload
size, dark-mode polish. No new features. Eleven items, grouped by area.

**Security (3).**

* **Sensitive data no longer round-trips through page source.** The
  recipient email list, From identity and subject / body templates for
  Report-a-Problem used to be inlined into the widget's `data-config`
  JSON, where View-Source revealed the host's contact emails. They now
  resolve server-side from the widget's saved Elementor settings at
  submit time (keyed by `post_id` + `widget_id`). View-Source on a
  published guide page no longer leaks any of those values.
* **AI search has rate limits.** Per-IP burst limit (5 questions / 15
  minutes) plus a site-wide daily cap (default 500 / day, override via
  the `dccgg_ai_daily_cap` filter) so a scraper can't drain the 1500
  free-tier Gemini requests / day.
* The report-a-problem PHP handler now refuses unknown widget IDs
  rather than honoring any recipient list the client supplies — closes
  the matching abuse vector.

**Mobile / accessibility (3).**

* **44 px touch targets.** Six tap controls were below the
  WCAG 2.5.5 recommended size: `.dccgg-more > summary` (36→44),
  `.dccgg-item-share` (28→44), `.dccgg-quick-action` (32→44), the
  flip-card close (28→44), the QR-dialog close (32→44), and the
  detail-header section-nav arrows (36→44). Icons stay the same; the
  hit area grows around them.
* **Hover state no longer sticks after tap on touch devices.** Every
  `:hover` rule in `widget.css` is now wrapped in
  `@media (hover: hover)` so phones don't paint the hover style and
  then leave it stuck until the next tap somewhere else.
* **300 ms tap delay killed** on Android browsers that still
  implement it — `touch-action: manipulation` on all primary tap
  controls.

**i18n (1).**

* **Conditions card takeaways are translatable.** Every English
  string baked into `widget.js` for the conditions card — the
  18-entry weather-code label map, the 9-entry Lake-Dora leeward-shore
  tips, the pressure-trend takeaways ("bass more active" / "bite
  often slow…"), the UV band labels and reapply prompt, the heat-index
  hydration nudge, and the lake-surface-temp takeaways — is now
  routed through `__()` server-side and read by the JS from the
  `conditionsStrings` config block. Loco Translate / WPML pick all
  ~50 strings up automatically.

**Performance (3).**

* **Minified JS + CSS bundles** ship alongside the unminified
  sources. The plugin enqueues `widget.min.js` (~81 KB) and
  `widget.min.css` (~71 KB) when present, falling back to the full
  files for editor preview and source-map diffing. ~55 % size cut on
  JS, ~32 % on CSS over the wire.
* **Search index is lazy-loaded.** On a 50-item guide the index used
  to be inlined into every page's `data-config` JSON (~30-50 KB). The
  index now fetches via a new `dccgg_search_index` AJAX action on the
  first search-input focus, with a 1-hour transient cached against
  the widget settings' content hash so it only rebuilds when the host
  re-saves the guide.
* The render path no longer recomputes `section_meta` /
  `extract_search_text` when the index isn't being inlined — that
  work moved into the new `Widget::build_search_index()` static
  helper, shared by `render()` and the AJAX endpoint.

**Polish (1).**

* **Checklist progress bar actually animates.** Previous CSS tried
  to `transition: --p`, which is a no-op without `@property`
  registration. The fill is now a child element whose `width`
  transitions, so ticking an item slides the bar over 0.3 s rather
  than snapping.

**Dark-mode coverage.**

* `.dccgg-conditions` no longer near-invisible on the Twitter-dim
  base (the `color-mix() 8 %` background went transparent against a
  dark surface — bumped to 18 % + a translucent fallback).
* Parallax-header titles get a `0 0 6 px / 0 1 px 0` text-shadow pair
  in dark mode so they stay legible over photographs that the
  default light-mode `rgba(0,0,0,0.6)` shadow couldn't carry.
* `<mark>` highlights in search results and inside the detail switch
  to a higher-contrast `55 % primary` background + white text on dark
  backgrounds (was 30 % which faded to invisible).

**Internal notes.**

* New AJAX action: `dccgg_search_index`. Same nonce as every other
  endpoint (`dccgg_nonce`).
* New filter: `dccgg_ai_daily_cap` (int, default 500).
* New helper: `Widget::build_search_index(array $settings): array` —
  shared by render and AJAX so the lazy payload is identical to what
  the page used to inline.
* New helper: `Plugin::find_widget_settings(int $post_id, string
  $widget_id): array` — used by both the report and search-index
  handlers to safely look up widget settings from `_elementor_data`.
* Build script: `build-min.sh` at the repo root regenerates the
  `.min` bundles. Run before each release zip; not used at runtime.

= 0.9.7.13 =

* **Conditions card reliability fixes.** The v0.9.7.12 extended rows
  were silently degrading because the Open-Meteo proxy was sending
  two unsupported parameters — `past_hours=6` and
  `pressure_unit=inhg`. The proxy now uses Open-Meteo's documented
  `past_days=1` for historical hours and returns pressure in hPa;
  the JS converts hPa to inHg client-side (×0.02953). The pressure
  trend row now reads as a sane ~30 inHg instead of misclassifying
  a "1019" hPa value as "rising — bass more active." The trend
  arrow falls back to "steady" when no historical pressure is
  available, instead of computing against zero.
* **USGS fallback chain.** If the closest Harris Chain gauge (Lake
  Dora) returns no usable gauge height or surface temperature, the
  proxy now walks down to Lake Eustis and then Lake Harris before
  giving up. Whichever lake first satisfies the lookup is reported
  by name on the card. The 30-min transient cache is now keyed by
  cottage lat/lng (was per-site), so the fallback is sticky across
  visitors.
* **Conditions debug mode.** Append `?dccgg-debug-conditions=1` to
  any guide page URL to render a `<pre>` block beneath every visible
  conditions card showing the raw weather / NWS / USGS payloads, AND
  emit `[DCCGG conditions]` console.log lines. Both AJAX endpoints
  honor `&debug=1` and include upstream HTTP status, tried-URL list,
  and a body excerpt on failure. Hidden in normal use.
* **Conditions card position toggle.** New General-tab setting
  *Conditions card position* — *First — above the items* (default,
  the v0.9.7.12 behavior) or *Last — after the items*. Source-order
  change only; the float behavior stays as today.
* **Conditions card title is editable.** New string control
  *Conditions card heading* under Strings — defaults to "At the
  cottage today" if blank.
* **Extra review platforms as a repeater.** The three named slots
  (Airbnb / Vrbo / Google) stay exactly as they were — your existing
  URLs are untouched. A new repeater *Additional review platforms*
  underneath them lets you add any number of extras with a Platform
  label, Review URL, and Icon (Elementor's Font Awesome picker).
  Each populated extra renders as another platform button on the
  checkout review prompt, sharing the same copy-and-open behavior.

= 0.9.7.12 =

* **Seven new rows on the Conditions side-card** — toggle with the new
  *Show extended conditions rows* switch in the General settings
  (default on). Every new row hides itself if its data source returns
  nothing, so the card stays clean when an upstream is down or
  rate-limited.
  * **NWS alert banner** — red callout at the top of the card whenever
    the National Weather Service has an active alert for the cottage
    lat/lng (Heat Advisory, Severe Thunderstorm Warning, Hurricane
    Watch, etc). Hidden otherwise. Reuses the existing alerts proxy
    (30-min cache); add `?dccgg-fake-alert=1` to any page URL to
    preview the styling without waiting for live weather.
  * **Harris Chain lake water level + surface temp** — pulls the
    nearest USGS NWIS gauge (Lake Dora / Lake Eustis / Lake Harris
    keyed off cottage coords) and shows e.g. *Lake Dora · 62.4′ ·
    surface 78°F* with a plain-English takeaway tuned to the surface
    temp band ("prime water temp — bass active shallow"). New
    `dccgg_usgs` AJAX action with 30-min `dccgg_usgs_<md5>` transient.
  * **Barometric pressure trend** — current pressure plus a trend
    arrow vs. the reading 3 hours ago, with a one-line bite
    implication ("bass more active" when rising > 0.04 in/3hr,
    "bite often slow, then picks up before storms" when falling). One
    extra Open-Meteo parameter, no new endpoint.
  * **Wind + leeward-shore tip** — direction · speed · gusts (only
    shown when gusts exceed steady wind by 5 mph), plus a 16-direction
    lookup table that names the actual sheltered shore on Lake Dora
    ("north shore of Lake Dora — try the lily-pad line off Wooton
    Park" when the wind is from the south).
  * **UV index + reapply window** — today's max UV with a band label
    (low / moderate / high / very high / extreme); above "high" adds
    a reapply-by clock time (now + 2 hr). Hidden at night.
  * **Heat index / feels-like + hydration nudge** — hidden below 90°F;
    at 90–102°F adds "drink water every 30 min"; at 103°F and above
    flips the row red and switches to "dangerous heat — limit time
    outdoors, drink water every 20 min".
  * **Solunar feeding windows** — today's two major windows
    (±45 min around lunar transit and lunar underfoot), computed
    entirely server-side from the existing moon math — no network
    call. Renders only when at least one window falls in the next 18
    hours.
* **Existing Open-Meteo call expanded.** The conditions weather proxy
  now requests apparent temperature, surface pressure (current and
  6 hours of history for the trend calculation), wind direction,
  wind gusts, and daily UV max — all on the same upstream call. No
  net change in upstream API count.

= 0.9.7.11 =

* **Reset checklist button now matches the Back button.** The Reset
  button inside the sticky popup header was rendered with a transparent
  background and faded-gray text, which blended into the white sticky
  header. It now uses the same `--dccgg-btn-bg` / `--dccgg-btn-txt`
  palette as the Back button (primary blue background, white text by
  default).
* **New Style sections in the Elementor editor.**
  *Popup Header — Reset Checklist Button* — typography, border, radius,
  padding, plus Normal and Hover text + background colors.
  *Popup Header — More Button (⋯)* — same set of controls for the
  more-menu trigger when it's docked inside the popup header
  (`enable_popup_more_menu = yes`). Scoped to `.dccgg-detail-header` so
  it doesn't bleed into the hub-toolbar More menu.
* **Copy-button effects no longer hide behind the popup.** The themed
  effect pieces (`.dccgg-fx`) were at `z-index: 9999` while the open
  detail modal sits at `10010` and the overlay at `10009` — so the
  splash droplets, rising bubbles, concentric ripples, palm fronds,
  sun-rays burst, and seaplane flyby were all painting behind the
  popup whenever the guest tapped Copy from inside it. `.dccgg-fx`
  and `.dccgg-confetti-piece` are now both at `z-index: 100000` so
  every effect paints over the popup on desktop and mobile.
* **Themed effects rebuilt for confetti-level punch.** Every spawner
  was sparse and visually thin compared to the 32-piece confetti
  burst. Each one now:
  * spawns 22–28 main particles (was 3–14),
  * uses brighter, more saturated palettes,
  * adds a "kicker" sub-element so the user gets a clear visual
    anchor — splash gets an expanding crown ring, bubbles each pop
    into a tiny burst ring when they reach the top, sun-rays get a
    glowing sun disc that pops at center and two ray layers (long +
    short) for a denser fan, palm fronds fan upward with falling
    coconut orbs, ripples now use six alternating blue/white rings
    with golden sparkle dots riding the wavefronts,
  * the seaplane now takes off from the button itself at a 20° climb
    (instead of crossing edge-to-edge from off-screen), trails a
    contrail back to the launch point, kicks up water-spray dots,
    and flips direction automatically if the button is on the
    right half of the viewport so the plane stays on-screen.

= 0.9.7.10 =

* **Checklist counter inside the sticky header.** The progress bar +
  N/M label + Reset button now live as a third row inside the popup's
  sticky header (under the section title) instead of as a sibling
  below it, so guests can see their checklist progress while scrolling
  long checklists. The counter also tightens its padding when the
  header is in shrunk mode so it doesn't dominate vertical space.
* **Report-a-Problem errors now show up in Chrome.** The dialog opens
  via `dialog.showModal()`, which puts it in Chrome's top layer above
  body content. Error feedback was being routed through a body-level
  toast that paints *behind* that top layer, so when the submit
  failed in Chrome the user saw the button revert with no visible
  reason. Errors now render inside an inline `.dccgg-report-error`
  region within the dialog itself, the response's HTTP status is
  captured before JSON parsing so 4xx/5xx don't disappear into a
  generic catch, and console.error logs the full server response for
  DevTools diagnosis. Success path (`dialog.close()` + body toast)
  is unchanged.

= 0.9.7.9 =

* **More-menu button: optional text label.** New General-tab field
  "More button text" lets the host replace the ⋯ icon with a text
  label like "Options" or "More". Empty keeps the icon-only look.
* **Optional ⋯ menu inside section popups.** New toggle "Also show
  ⋯ menu in popup header" adds the same menu to each section
  popup's title row, right-aligned next to the title. When a guest
  opens "Report a problem" from a popup, the active section title
  auto-fills into the report dialog. Title stays perfectly centered
  via an invisible left-side spacer.
* **Reorderable menu slots.** Three new SELECT controls let the
  host pick which item goes in slot 1 / 2 / 3, choosing from Print,
  Save as PDF, Report a problem, and None. Duplicate picks render
  only once so the host can't accidentally double an item.
* **Click routing fix for the new popup ⋯ menu.** `wireSavePdf`
  and `wireReportProblem` now use document-level delegation with a
  stage back-pointer (same pattern as `wireChecklists`), so the
  popup-side Save-PDF and Report items fire correctly after
  `.dccgg-stage` is portaled to `<body>`. Per-item Report buttons
  also get the same routing fix.

= 0.9.7.8 =

* **Menu Hub tiles no longer show the "N items" line.** Section tiles
  now render icon → title → optional description and stop there. The
  count line was removed from `render_tile_inner()` for all three
  layout modes (grid / list / carousel) in one shot.
* **Seven new Florida-themed Copy-button effects.** General tab gets a
  new "Copy-button effect" SELECT control letting the host pick from
  None / Confetti (default) / Splash droplets / Rising bubbles / Sun
  rays burst / Palm fronds / Seaplane flyby / Concentric ripples /
  Fish school. Themed to Tavares lakes, Central Florida sunshine,
  boating, fishing, and leisure. Each effect spawns from the tapped
  Copy button, finishes in under ~1.5s, uses only DOM + CSS + rAF
  (no canvas, no images), and is automatically skipped for visitors
  with the OS Reduce-Motion preference. Confetti remains the default
  so saved widgets behave exactly as before this update.

= 0.9.7.7 =

Fixes a transparent-sticky-header bug visible on the live page and adds
the host control to customize that background.

* **Sticky popup header was transparent.** Scrolling inside a section
  detail popup let guide-item content show THROUGH the sticky header
  at the top of the popup. Root cause: the rule at widget.css:2176
  set `background: var(--dccgg-detail-bg);` with no fallback, and the
  variable isn't always set by the active theme/preset context, so
  the background resolved to transparent. Extended the rule to
  `background: var(--dccgg-popup-header-bg, var(--dccgg-detail-bg,
  #ffffff));` — defensive solid white at the end of the chain so the
  bug can't reappear under any theme context.
* **New Style control: Popup Header — Background.** Pick a custom
  color for the sticky popup-header background per widget. Empty
  field falls back to the popup body color (or solid white if neither
  is set).
* **Portal-aware CSS variables.** When the modal opens, the
  `.dccgg-stage` is moved (portaled) to `<body>` so position:fixed
  works inside transformed Elementor ancestors. Custom-property
  cascade stops at the new parent, so any `--dccgg-*` variable set
  on `.dccgg-root` by a Style control silently stopped reaching the
  stage's children after portal. `showDetailModal()` now snapshots
  all `--dccgg-*` properties from root onto `stage.style` at portal
  time, so variable-based overrides keep applying after the move.
  Lays groundwork for future variable-based Style controls.

= 0.9.7.6 =

New editor setting: **Override printable PDF** (General tab). Assign a
PDF from the WordPress Media Library and the toolbar "Print guide"
button + the ⋯ menu's "Save as PDF" both route through that file
instead of the auto-generated print stylesheet. Save opens the PDF in
a new tab; Print loads it in a hidden iframe and auto-fires the
browser's print dialog. Leave the field empty to keep the current
auto-generated behavior. The toolbar Print button's inline
`onclick="window.print()"` is removed so the JS handler can intercept
cleanly; behavior with no override set is unchanged.

= 0.9.7.5 =

Two pre-existing bugs surfaced from live use, both rooted in the v0.9.5
detail-modal portal:

* **Section prev/next arrows in the popup did nothing.** `openDetail()`
  looked up `.dccgg-detail` from `root`, but the stage and its details
  were moved to `<body>` on first open, so the lookup returned empty
  and the function bailed silently. Walk to the portaled stage when
  it's present.
* **Checklist checkboxes wouldn't toggle.** `wireChecklists()`
  delegated click handling on `root`, but after the portal the click
  bubble path no longer passes through `root`. Bind the handlers to
  `document` with a back-pointer (`stage.__dccggRoot`) so each widget
  still only handles its own clicks.

= 0.9.7.4 =

Two improvements to the section detail popup's top navigation bar:

* **Two-row nav bar.** The bar used to cram Back, the section
  icon+title, and the prev/next arrows into one row, with the title
  truncating to an ellipsis the moment anything got tight. It now
  splits into two rows: Back (left) and the prev/next arrows (right)
  stay together on row 1; the section icon and title sit centered on
  row 2 and the title soft-wraps onto multiple lines instead of
  ellipsis-truncating. Single-section guides (no nav arrows) keep
  Back anchored at the left via a hidden spacer.
* **Four new Style-tab sections** scoped to the popup nav bar so the
  host can tune each piece independently of the generic button /
  color controls:
  - **Popup Header — Back Button**: typography, border, radius,
    padding, Normal/Hover text + background colors.
  - **Popup Header — Section Nav**: arrow button size, border,
    radius, gap between arrows, Normal/Hover icon + background
    colors, disabled-state opacity.
  - **Popup Header — Section Title**: typography, color, alignment,
    icon ↔ text gap.
  - **Popup Header — Section Icon**: icon color, icon size, plus
    optional background color / padding / border-radius to build a
    chip behind the icon.

  None of the new controls carry defaults — set one and it overrides
  the baked-in look; leave it blank and the v0.9.7.3 appearance
  stays. The generic Buttons style controls keep working unchanged
  for every other button in the widget (Send Report, hub actions,
  etc.).

= 0.9.7.3 =

Same-day hotfix on top of 0.9.7.2:

* Tapping a section tile now opens the modal in Chrome/Edge. Regression
  since 0.9.7 (masked by the 0.9.7.1 hotfix): `openDetail()` resolved
  the matched detail inside a `withViewTransition` callback, which
  Chrome's View Transitions API queues to the next rendering
  opportunity rather than running synchronously. The function then
  read the not-yet-set match flag, bailed early, and never reached
  `showDetailModal()`. The menu's `is-detail` class still got added
  when the deferred callback eventually fired — so the menu disappeared
  but no modal ever opened. Firefox/Safari (no View Transitions API)
  and visitors with `prefers-reduced-motion` were unaffected because
  both code paths run the callback synchronously. Fix: resolve the
  match synchronously up front; keep only the visible DOM mutations
  inside the view-transition callback.

= 0.9.7.2 =

* Hub-toolbar ⋯ Settings menu: the hover/focus highlight on Print /
  Save as PDF / Report a Problem no longer overflows the dropdown
  box. The item is `box-sizing: border-box` now, so its 100% width
  is inclusive of its 8/10px padding instead of adding on top.
* Report a Problem popup gains an optional **Phone** field between
  Cottage and Email, with `type="tel"` + `inputmode="tel"` so phones
  open the dial-pad keyboard. The default email body template
  includes a `Phone:` line under Reply-to, and host-customized
  subject / body templates can use the new `{reporter_phone}`
  smart-tag the same way as `{reporter_name}` and friends.

= 0.9.7.1 =

Same-day hotfix on top of 0.9.7:

* Section popup wasn't appearing when tiles were tapped on the live
  page. The 0.9.7 modal CSS had `inset: auto` after the explicit
  `top` / `bottom` / `left` declarations, which reset all four to
  auto. With `transform: translateX(-50%)` still applying, the modal
  rendered ~360px to the LEFT of viewport origin — off-screen and
  invisible. Removed the `inset: auto` line and made `right: auto`
  explicit so the base `.dccgg-stage { inset: 0 }` rule doesn't
  conflict with the modal's width.
* Report-a-Problem "What's the issue?" dropdown no longer pre-selects
  the first category. It now opens on a blank placeholder option and
  the guest must pick one before Send is enabled — clicking Send
  with no category surfaces the native browser validation bubble.

= 0.9.7 =

Seven UX/Editor fixes from live use of 0.9.6:

* Detail popup fills the visible viewport: anchored just below the sticky
  theme header (auto-detected at open time) and just above the viewport
  bottom, with internal scroll for long content. Fixes the v0.9.5
  CSS-scoping bug where portaling the stage to `<body>` silently dropped
  the modal layout rules.
* Detail header is now a centered grid: title centered horizontally,
  matches the Back button's font size, and sits 6px lower so it doesn't
  wrap onto two lines on narrow viewports.
* Four new editor settings:
  - Style → Tile / Card → **Section icon color** + **Section icon background**.
  - Style → Detail Card → **Guide Item icon color**.
  - Style → Layout & Interaction → **Grid columns — mobile (portrait)**
    so phones can show 2/3/4 section tiles per row instead of stacking
    1-up.
  - Content → Engagement → **Report a Problem** email customization:
    custom From email + From name (with safe Reply-To fallback for
    shared hosts without SPF/DKIM), subject template, WYSIWYG body
    template, both with smart-tag placeholders ({site_name},
    {section_title}, {item_title}, {category}, {report_text},
    {reporter_name}, {reporter_cottage}, {reporter_email}, {timestamp},
    {user_agent}). The visitor-facing report popup also gains
    **Name** and **Cottage** input fields.
* Checklist counter moved out of the detail header into its own
  centered row below `[Back] [Title]`, styled as a rounded pill.
* Desktop search-result click now opens the section popup at the
  correct centered position with the matched item highlighted —
  previously the popup landed off-screen to the left because the
  highlight call ran against a now-stale DOM reference.
* The ⋯ Settings menu (Print / Save as PDF / Report a Problem) moved
  from the per-section detail header to the main hub toolbar, so
  visitors can reach Print / PDF / Report without opening a section.
* Send Report button is now visible on a white background — the
  previous `var(--dccgg-primary)` lookup found no fallback because the
  `<dialog>` portals to `<body>` outside `.dccgg-root`, painting it
  transparent.

= 0.9.6 =
* Forgiving guide search: now matches across punctuation, spaces, and accents
  ("wi-fi" finds "WiFi", "checkin" finds "Check-in", "cafe" finds "Café"),
  supports multi-word queries in any order ("qr wifi"), and tolerates small
  typos ("wfi" still finds Wi-Fi). Highlighting in the opened detail uses
  the actual word that matched, not the typed query.

= 0.9.5 =

Live-page polish from 0.9.4 use:

* **Section detail opens as a centered modal popup**, ported from the MPHB
  Availability Calendar pattern. Stage-reveal mode now portals the detail
  to `<body>`, locks page scroll, dims the background, traps focus on the
  Back button, and closes on ESC / backdrop tap / Back. Bottom-sheet
  variant on phones (≤600 px) slides up from the bottom with a drag
  handle. Visitors no longer have to hunt for the items below the fold
  when the widget sits low on the page. Accordion / flip-card / split-pane
  reveal modes are unchanged.
* **Visitor-facing Toggle Dark Mode removed.** The toolbar moon/sun
  button and the "Toggle dark mode" entry in the per-section More menu
  are gone — the dark theme had contrast gaps that we'd rather not ship
  to guests. The editor controls (`Dark mode` and `Show Toggle`) stay
  intact, so a host can still ship a guide as `always`-dark or
  `auto`-following-OS; the visitor just can't flip it at runtime.
* **Per-section Share link removed.** It paired with the per-item Share
  button removed in 0.9.4 and was the last surface using `navigator.share`
  from the More menu. Print, Save as PDF, and (if enabled) Report a
  Problem remain.

= 0.9.4 =

Live-page UX fixes and editor cleanup from real-use feedback on 0.9.3.

Fixes:
* **Empty space above opened section eliminated.** The menu hub used to
  reserve its full layout height while invisible; switched to display:none
  in detail mode so detail content sits right under the search box.
* **Viewport now scrolls to opened section.** Previously only scrolled
  when the visitor was already below the widget; now always brings the
  detail's title into view.
* **Items in a section detail center by default**, matching the menu
  tiles. Procedure (numbered-list) mode keeps left alignment.
* **Search placeholder centered.** "(⌘K)" removed from the default
  placeholder.

New:
* **Items per row in section detail** — responsive Elementor SELECT
  control (1 / 2 / 3 / 4 columns). Phones always collapse to 1 column.
* **WiFi-format QR for credentials items** — new per-item "WiFi
  credentials mode" toggle. Adds SSID, security (WPA / WEP / open) and
  hidden-network fields; reuses the existing "Value to copy" as the
  password. Renders a "Show WiFi QR" button next to Copy that opens a
  scannable QR encoding the WIFI:T:WPA;S:...;P:...;; format every modern
  phone camera recognizes for one-tap join.

Removed:
* Generic QR button next to Copy on items (replaced by WiFi-specific QR
  above; copy still works the same).
* Per-item chain/share button next to each item title (section-level
  Share in the More menu still works).

Editor:
* **Export Guide (JSON) and Import Guide (JSON) work again on
  Elementor 4.x.** Rewrote both as server-side admin-ajax endpoints
  that read/write _elementor_data postmeta directly instead of the
  editor panel JS API (which changed in 4.x). Export now triggers a
  guest-guide-export.json file download. Import accepts the same JSON
  pasted into a prompt and writes it back to the page. Clear error
  messages if the page has zero or multiple DCC Guest Guide widgets.

= 0.9.0 =

New features:
* **Emergency / hurricane mode** — mark any section with role =
  Emergency in its repeater row. That section's tile is auto-painted
  red, pinned to the top (or bottom) of the menu, and given a
  triangle-exclamation icon. The detail view starts with a quick-
  call strip: an auto-added 911 chip plus any host-configured
  contacts (each with label, tel: link, optional map URL, emoji).
  Hurricane prep + shutoff diagrams reuse the existing checklist
  mode and gallery + hotspots features — no new content type.
* **Floating SOS button** — optional. A small red triangle that
  appears in the corner whenever a section detail is open, jumping
  straight to the emergency section from anywhere in the guide.
* **NOAA active-alert banner** — optional. When the National
  Weather Service has an active alert for the cottage location
  (uses the lat/lng configured in the General panel), a red banner
  renders at the top of the guide with the alert headline and a
  link to the full details. Cached server-side for 30 minutes;
  silent when there's no active alert.
* **One-tap review prompt at checkout** — mark any section with
  role = Checkout. A panel appears at the bottom: 👍 Loved it /
  👎 Something was off. 👍 reveals an editable suggested review
  (with `{guest_name}` and `{stay_key}` placeholders parsed from
  `?stay=`) plus per-platform "Copy & open" buttons for Airbnb,
  Vrbo, and Google — only the buttons whose URL the host has
  configured appear. 👎 routes into the Report-a-Problem dialog
  with the section pre-tagged as checkout feedback. The prompt
  collapses to a "Thanks for the feedback!" line on subsequent
  visits (scoped per stay via `?stay=`).

Admin controls added:
* Sections repeater → new "Section role" SELECT (Normal /
  Emergency / Checkout).
* New "Emergency mode" panel: emergency contacts repeater (label /
  phone / map / emoji), enable floating SOS button, tile position
  (top / bottom), enable NOAA active-alert banner.
* New "Checkout review prompt" panel: enable toggle, suggested
  review template (textarea, supports placeholders), Airbnb / Vrbo
  / Google URL fields.
* New strings on the Labels & Strings panel for every visible
  emergency + review string.

Implementation notes:
* New AJAX endpoint `dccgg_noaa_alerts` proxies
  `api.weather.gov/alerts/active?point=lat,lng` with a 30-min
  transient cache and a polite User-Agent (`DCC Guest Guide / WP
  plugin / contact: {admin_email}`). Append
  `?dccgg-fake-alert=1` to the page URL to render a simulated
  alert for testing.
* Append `?dccgg-reset-review=1` to re-enable the review prompt
  after a guest has acted on it.
* The emergency tile uses CSS `order: -1` (or `order: 999` when
  "bottom" is picked) to pin its position regardless of where the
  host placed the row in the Sections repeater.
* Emergency accent is forced to `#d54040` via the existing
  `accent_override_styles()` path unless the host manually sets a
  `section_accent` color on the row.
* All new elements are hidden in `@media print` so the PDF
  booklet stays clean.

Smoke checklist additions:
1. Set a section's role to Emergency, add 2–3 emergency contacts.
   Confirm the tile is pinned, red, and that the detail view's
   contacts strip renders with 911 + your chips, each tappable.
2. Toggle "Floating SOS button" → open any other section detail →
   the red triangle appears in the corner → tap → emergency
   section opens.
3. Toggle "NOAA banner" → visit the page with
   `?dccgg-fake-alert=1` → a red banner appears at the top with
   "Hurricane Warning (TEST)".
4. Set a section's role to Checkout, configure
   `review_template_text` + one or more review URLs. Visit the page
   with `?stay=jane-2026-06` → open the checkout section → tap 👍 →
   suggested review appears with "Jane" interpolated → tap a
   platform button → toast confirms copy, the review site opens in
   a new tab. Reload → prompt is collapsed; append
   `?dccgg-reset-review=1` → prompt reappears. Tap 👎 instead →
   Report-a-Problem dialog opens with "[checkout feedback]" prefix.

= 0.8.0 =

New features:
* **Save as PDF (magazine-quality)** — new More-menu item below Print.
  The print stylesheet was fully rebuilt: a branded cover page, a
  contents page with leader dots and section numbers, a fresh sheet
  per section, items kept whole across page breaks, serif body type
  at 11pt for paper readability, and a running header that reads
  "Doracanal Court Guest Guide · X / Y" on every page. Gallery
  scrollers collapse to the first image, videos become a "view
  online" caption, and all on-screen chrome (toolbar, search, FAB,
  conditions card, AI panel, parallax background, checklist progress,
  theme toggle) is hidden. Output is a genuine vector PDF generated
  by the browser, no extra JS dependency.
* **Report a Problem (email)** — opt-in per widget. Adds a "Report a
  problem" item to the section detail's More menu (and, optionally,
  a small Report button on each item card). Tapping opens a vanilla
  <dialog> with a category dropdown (host-configurable), a
  description textarea, and an optional reply-to email. Submissions
  are sent via wp_mail() to one or more host addresses listed in the
  widget settings (falls back to the WordPress admin email when
  empty). Reports include the page URL, the section / item context,
  and the ?stay= key, with the guest's email wired to Reply-To when
  provided. Server-side per-IP rate limit (3 reports / 15 minutes).
* **Voice-first concierge** — when AI fallback search is enabled and
  the browser supports Web Speech Recognition (Chrome, Safari, Edge),
  a microphone button appears next to the "Ask anything" button.
  Tapping it records the guest's spoken question, fills the prompt,
  fires the existing AI flow, then reads the answer back aloud via
  Web Speech Synthesis. A small 🔊 button next to the answer cancels
  playback. Voice is processed entirely on-device; only the
  transcribed text travels the same admin-ajax → Gemini path that
  v0.7 text search uses.

= 0.7.0 =

New features:
* **Checklist mode** — per-section "Checklist mode" toggle makes every
  item in that section a checkbox guests can tick off; an alternative
  per-item "Make this item a checkbox" toggle lets a single item be
  checkable. State persists in localStorage scoped to `?stay=…` so
  each booking can reset cleanly. A sticky progress bar with `X / N`
  count + Reset button shows at the top of the detail; confetti
  fires when all items are checked.
* **Conditions side-card** — per-section "Show conditions side-card"
  toggle renders a small card with sunrise / sunset / moon phase
  (server-side, instant, no API) plus today's weather + tomorrow's
  forecast via Open-Meteo (free, no API key, 30-min transient cache
  shared across visitors). Cottage latitude / longitude configured
  once in Layout & Interaction; defaults to Mt. Dora, FL.
* **Photo gallery with hotspots** — new "Gallery" media type accepts
  multiple images. Each item can include an annotation textarea
  with one pin per line: `IMAGE_INDEX X% Y% | Label | Description`.
  Gallery renders as a horizontal scroll strip; tapping opens a
  lightbox with prev/next, image counter, and numbered hotspot pins
  overlaid on annotated images. Tap a pin to read its label and
  description. Ideal for hot-tub control panels, breaker boxes, etc.
* **Per-section parallax background image** — new MEDIA control per
  section + overlay opacity slider. Renders a hero image behind the
  detail header with scroll-linked parallax (rAF-throttled, transforms
  only). Respects prefers-reduced-motion. Detail header gets a
  glass treatment over the image so back / share / nav buttons stay
  legible.
* **AI fallback search** — opt-in per widget. When a guest's search
  returns no matches, the widget surfaces an "Ask anything about
  the cottage" button that POSTs the question + the entire guide
  content to Google Gemini via a server-side admin-ajax proxy.
  Free tier: 1,500 questions per day site-wide, no charge. Configure
  the Gemini API key under Settings → DCC Guest Guide (admin-only,
  stored in wp_options, never sent to the browser). Per-widget
  controls for the button label and a privacy notice.

= 0.6.0 =

Bug fixes:
* `.is-shrunk` no longer persists on hidden details — `openDetail`
  and `wireBack` strip the class so a previously-scrolled section
  doesn't flash a shrunk header on reopen.
* Preset swatch script guards against re-initialization. v0.5
  attached a fresh delegated click listener every time the editor
  panel re-rendered (selection change / undo / tab toggle); v0.6
  uses a `window.__dccggPresetWired` flag.
* Section search-haystack capped to 200 chars. v0.5 appended
  section_title + emoji + desc to each item's haystack *after* the
  per-item cap, so a long section description × many items bloated
  the inlined JSON. The meta string is now truncated and empty
  pieces are skipped.
* More-menu Theme row hidden when `dark_mode = off`. v0.5 showed
  the Theme toggle in the popover even when the admin disabled
  dark mode, which let guests turn on a dark palette the admin
  hadn't configured.

New features:
* **Auto-fold long detail content** — new "Auto-fold items over N
  words" setting in Display. When > 0, items whose WYSIWYG content
  exceeds the threshold get Read More / Read Less automatically.
  Per-item toggle still wins when explicitly on.
* **JSON export / import** — new Export Guide / Import Guide
  buttons in the Sections panel. Export copies a JSON of all
  sections + items to the clipboard. Import accepts a JSON paste
  and inserts (or replaces, via the adjacent checkbox) the
  current widget's content. Backs up + transfers a guide between
  sites. Schema is `{ dccgg_schema: 1, sections: [...], items: [...] }`.
* **Auto-thumbnail for video items** — YouTube and Vimeo items
  now show a poster image first; clicking loads the player with
  autoplay. YouTube uses the static thumbnail URL; Vimeo posters
  are fetched via the public API and cached for 7 days in a
  transient. Saves the network cost of every video iframe on the
  first paint. New "Show video poster thumbnails" switch (default
  on).
* **Per-tile color override** — new "Tile accent color" picker per
  section. When set, that section's icon, quick-action chip, and
  hover state use the chosen color instead of the global primary.
  Inline `<style>` block emits one set of rules per overridden
  section.
* **Density modes** — new "Density" SELECT in Layout & Interaction:
  Compact / Cozy (default) / Comfy. Applies a coordinated
  padding / gap / font-size scale across the widget. Other style
  controls still take precedence when set explicitly.

= 0.5.0 =

Bug fixes:
* `highlightQuery` TreeWalker no longer skips some matches. v0.4 used a
  single `/.../gi` regex for both the walker gate and the replacement
  pass, so `test()` would carry `lastIndex` between text nodes and
  silently reject nodes whose match position was below the current
  index. Now uses a non-global `/.../i` probe for the gate and the
  global regex only for replacement.
* `_hitClearTimer` cross-widget interference resolved. Each detail's
  auto-clear timer now lives in a `WeakMap` so widget B's
  search-result-click can't cancel widget A's pending clear.
* Section titles, emojis, and descriptions are now part of the search
  haystack. Typing "Wi-Fi" surfaces the Wi-Fi tile even when no item
  contains that string.
* `ensureLightbox` only sets the close-button aria-label on first
  creation (was redundantly re-set on every widget init).

New features:
* **URL deep-link to search term** — `?guide=wifi&q=password` opens the
  Wi-Fi detail AND auto-runs `highlightQuery("password")` once the
  detail is visible. Optional `&item=slug` picks a specific item to
  search within.
* **Customizable tile aspect ratio** — new "Tile aspect ratio" SELECT
  in the Tile / Card panel: auto / 1 : 1 / 4 : 3 / 16 : 9 / golden.
  Driven by `prefix_class` so every menu layout (grid, masonry, etc.)
  picks up the same fixed ratio for a visually consistent grid.
* **Swipe to advance section on mobile** — horizontal swipe (≥ 50 px,
  vertical drift < 30 px) on the detail stage cycles prev/next.
  Wizard-mode sections route to wizard Back/Next instead. Falls back
  to the existing arrow handler for accessibility.
* **Floating ⋯ "more" menu in detail** — new opt-in toggle in General.
  Adds a small disclosure button to the detail header with Print,
  Theme toggle, and Share-this-section actions; useful on small
  screens where the header gets crowded.
* **`dccgg:section-opened` custom DOM event** — bubbles from the
  widget root every time a detail opens. Detail payload:
  `{ key, widget, sectionTitle }`. Wire other Elementor widgets
  with `document.addEventListener('dccgg:section-opened', fn)`.
* **Sticky shrinking detail header on scroll** — header pins to the
  top of the detail card and shrinks once you scroll past it,
  keeping the section title and prev/next arrows always visible.
  Respects `prefers-reduced-motion`.
* **Theme preset preview swatches in admin** — six mini-cards above
  the preset SELECT show the actual colors of each preset. Clicking
  a card sets the SELECT.

== Hooks for other widgets ==

This widget dispatches a `dccgg:section-opened` event on its root
element every time a detail becomes visible. Listen for it from any
Elementor widget or external script:

    document.addEventListener('dccgg:section-opened', function (e) {
        var key   = e.detail.key;          // e.g. "wifi"
        var title = e.detail.sectionTitle; // e.g. "Wi-Fi"
        var root  = e.detail.widget;       // the .dccgg-root element
        // … react however you like
    });

URL parameters supported on the page where the widget is embedded:

* `?guide=KEY` — opens the named section on load
* `?guide=KEY&q=PHRASE` — opens the section AND highlights occurrences
  of PHRASE inside the content
* `?guide=KEY&item=SLUG&q=PHRASE` — same, but scoped to the item whose
  slugified title matches SLUG

= 0.4.0 =

Bug fixes:
* Reading progress bar no longer shows stale percentage on section
  switch. `openDetail` now zeroes the bar of the newly visible detail
  and clears any leftover search highlights from a prior visit.
* Wizard ↔ section-nav arrow-key conflict resolved. A single
  document-level keyboard router checks the visible detail's
  `data-wizard` attribute first; wizard sections own ←/→, others
  route to section nav.
* `extract_search_text` request-scoped static memo when "Include
  Elementor-template content in search" is on. Each referenced
  template renders at most once per pageload (was N renders per
  template per item).
* Lightbox close button reads `str_lightbox_close` from the strings
  panel (was hardcoded English "Close").
* `wireSectionNav`'s per-widget document keydown listener replaced
  with a single global router (no more N listeners on multi-widget
  pages).
* `navigator.share` only falls back to clipboard for real errors;
  user dismissal (`AbortError`) is now silent.
* Section-nav arrows have explicit `:active` styles so touch taps
  don't flash an inconsistent state.

New features:
* **Search-result deep highlight** — clicking a Cmd-K result opens the
  detail, scrolls the matched term into view, wraps every occurrence
  in `<mark class="dccgg-hit">`, and pulses the surrounding card for
  1.5 s. Wizard sections jump to the matching step first. Highlights
  auto-clear after 8 s or on detail close.
* **Inline emoji icons** — new "Emoji (overrides icon)" text field on
  sections and items. Paste an emoji like 🛁 and it replaces the
  Font Awesome icon at render. Zero JS, no FA dependency, works
  offline.
* **Animated icon hover** — new "Icon hover animation" SELECT in
  Layout & Interaction (pulse / bounce / rotate / wiggle / shake)
  plus an optional per-section override on the Sections panel. Only
  the framed icon moves on hover, not the surrounding tile. Respects
  `prefers-reduced-motion`.

= 0.3.0 =

Bug fixes:
* Welcome Pack button now actually works. v0.2 enqueued the script only
  into the preview iframe but the button lived in the editor panel, so
  the delegated click handler never fired. Script is now also enqueued
  on `elementor/editor/after_enqueue_scripts`.
* Auto-link re-tokenizes between patterns so the phone regex can no
  longer accidentally match digits inside an `<a href="mailto:...">`
  anchor that the email pattern just created.
* `wireGlobalCmdK` no longer probes the non-existent `document.dataset`;
  uses `document.documentElement.dataset` so the one-shot guard works.
* `.dccgg-sheet-backdrop` now `display: none` on desktop (v0.2 left it as
  a default `<div>`, which would render a full-screen layer over
  the wrapper outside the mobile media query).
* Long-press peek only fires on touch via `pointerdown`. Right-click on
  desktop is exclusively the `contextmenu` path, so the peek no longer
  opens twice.
* Sheet drag skips `pointerdown` on `button` / `a` / `input` targets so
  tapping the back arrow, section-nav arrows, or wizard buttons in the
  drag-handle zone no longer initiates a phantom drag.
* Welcome Pack rows now ship with a `_id` UUID per row so Elementor's
  repeater panel renders them with working drag handles and delete
  buttons.
* Image lightbox `<dialog>` hoisted to a single global instance shared
  across widgets, rather than one per widget.
* `enqueue_for_preview` now explicitly enqueues Font Awesome instead of
  relying on it being registered at probe time.
* `themePresets` dropped from `data-config` (dead bytes since v0.2 moved
  presets to static CSS).

New features:
* **Wizard mode** — per-section toggle that renders items one at a time
  with Next / Back buttons and a progress-dot strip. Pressing Done on
  the last step fires a confetti burst and resets to step 1. Replaces
  procedure mode for the section when both are toggled on.
* **Section prev / next arrows** — buttons in the detail header cycle
  between sections without bouncing back to the menu. Also bound to
  the keyboard ← / → arrow keys when a detail is visible and focus
  isn't in an input.
* **Haptic feedback** — opt-in switcher in the General panel. On
  supported devices, vibrates briefly on tile tap and a triple-pulse on
  successful copy. Uses `navigator.vibrate`; silently no-ops elsewhere.

= 0.2.0 =

Bug fixes (all from a v0.1 audit):
* Dark mode now correctly overrides the active theme preset (presets moved
  from JS-injected inline styles to static CSS classes).
* Print button bound via JS (CSP-safe; replaces inline `onclick`).
* Tile backdrop control replaced with a proper overlay color + opacity pair
  (v0.1 exposed only the opacity slider with no image upload).
* Multi-widget Cmd-K conflict resolved — a single document-level binding
  routes focus to the largest visible widget.
* `?guide=KEY` URL anchor now validates the key exists in the receiving
  widget before opening, so unrelated widgets on the same page don't react.
* Font Awesome enqueued as an explicit style dependency so hardcoded
  `<i class="fas …">` icons no longer rely on a side-effect of
  `Icons_Manager::render_icon`.
* `prefers-reduced-motion` respected — transitions / flip / shimmer
  shortcut to instant; entry stagger skipped.
* Clipboard fallback via `document.execCommand('copy')` for non-HTTPS
  contexts where `navigator.clipboard` is undefined.
* Accordion tile and panel linked via `aria-controls` / `aria-labelledby`
  using stable per-widget IDs.
* Baseline interactive elements (`.dccgg-tile`, `.dccgg-btn`,
  `.dccgg-search-input`, etc.) use the doubled-class specificity defense
  so theme resets like Bravada's `(0,3,1)` rules lose.

Performance:
* Search index only built when search is enabled.
* Tilt `mousemove` rAF-throttled (one DOM write per frame max).
* `@supports not (backdrop-filter)` fallback to solid background for
  glassmorphism; `prefers-reduced-data` disables backdrop blur entirely.
* Explicit `'return_value' => 'yes'` on every switcher control.

Polish:
* Platform-aware kbd hint (`⌘K` on Mac, `Ctrl K` elsewhere) and hidden on
  touch-only devices via `@media (hover: none)`.
* Visible `:focus-visible` outlines on every focusable element.
* Editor-only RAW_HTML notice listing items that point at deleted
  sections; second notice explains the save-and-reopen flow for the
  Section dropdown.
* Optional "Include Elementor-template content in search" toggle (off by
  default; opt-in because it costs an extra render per template).

New features:
* **Mobile bottom-sheet** — on phones, the detail opens as a drag-to-
  dismiss sheet with a top drag-handle. Falls back to the existing stage
  swap on desktop.
* **Read aloud (Web Speech Synthesis)** — per-item play/pause button that
  reads the title + body. Picks a same-language voice when available.
* **Speech-to-search** — mic button injected into the search bar on Chrome
  / Safari for hands-free queries via Web Speech Recognition.
* **Image lightbox + long-press peek** — item images open in a fullscreen
  HTML5 `<dialog>` with pinch-zoom; touch-and-hold a tile (or right-click)
  shows a preview tooltip with the first item's body.
* **Welcome Pack** — admin-side "Insert hospitality starter pack" button
  in the Sections panel adds 6 typical sections (Wi-Fi / Hot Tub / Trash /
  Checkout / Local Eats / Emergency) and ~12 items in one click. Uses
  Elementor's editor model API; degrades to a console warning if that
  API is unavailable.
* **Auto-numbered procedure mode** — per-section toggle renders items as
  `Step 1, 2, 3` with a vertical progress line between them.
* **Estimated read time** — auto-computed from word count (200 wpm) and
  shown as a chip on each tile / item header.
* **Sticky in-section TOC** — for sections with 4 + items, a sticky table-
  of-contents appears in the detail view (desktop only) with current-item
  highlighting via IntersectionObserver.
* **Auto-link content** — phone numbers, emails, and decimal coordinate
  pairs in WYSIWYG items become `tel:`, `mailto:`, and Google-Maps links
  automatically. Server-side; skips text inside `<a>`, `<code>`, `<pre>`,
  `<kbd>`.
* **Confetti on copy** — successful Copy interactions trigger a multi-
  color, gravity-aware confetti burst (respects `prefers-reduced-motion`).
* **Reading progress bar** — sticky 3px bar across the top of the detail
  view tracks scroll progress through long items.

Note on the Welcome Pack: tested against Elementor 3.5+ editor model API.
If the panel button reports "could not resolve active widget model" in the
browser console, your Elementor version may have shifted the model paths —
file an issue and the plugin will be updated to match.

= 0.1.0 =
* Initial release.
