# Project notes

Developer guidance for working with the code in this repository.

## Site context

**Read `SITE-CONTEXT.md` at the start of every session.** (Note the naming: `SITE-CONTEXT.md` with a hyphen is the dated DB-snapshot inventory; `SITE_CONTEXT.md` with an underscore is the evergreen lessons-learned doc — both are real, they are different files.) It contains the full
doracanalcourt.com site architecture: installed plugins + versions, MotoPress data
model (cottage IDs, room type IDs, booking counts), iCal OTA feeds, cache stack,
security findings, and gotchas that affect every plugin in this repo.

Key facts from that document that affect this plugin:
- DB table prefix: `portal_` (not `wp_`)
- Room type IDs: 1065/1067/1069/1071/1604/1607/1740/1742 (8 cottages)
- Checkout page ID: 1399
- Three active cache layers (SpeedyCache Pro + HostGator Endurance + advanced-cache.php)

## Repository purpose

A single WordPress plugin — **DCC Availability Calendar** — that adds **two** Elementor widgets for MotoPress Hotel Booking accommodations on doracanalcourt.com. The plugin lives at `mphb-availability-calendar/`. The repo has no build step.

| Widget | Slug | Use |
|---|---|---|
| DCC Availability Calendar | `mphbac_calendar` | The full multi-cottage grid (homepage / availability page) |
| DCC Availability — Single Cottage | `dccac_single` | One cottage's strip, for the individual `/accommodation/<slug>/` templates |
| DCC Staff Calendar | `dccac_staff` | Gated staff booking calendar for /staff/ (also `[mphb_staff_calendar]`) |

`Widget_Single extends Widget` — it is a variant, not a copy. Both share one
`render()`, one data pipeline, one cache layer, and one `widget.js`. The
variant differs only via three overridable hooks, so a change to the calendar
automatically applies to both:

- `resolve_selected_ids()` — the multi widget honours the `cottages` SELECT2
  (empty = every type); the single widget returns exactly its one validated
  `single_cottage` pick, or `[]` if it was never set or has since been
  unpublished (it never falls back to "all").
- `single_mode()` — adds the `mphbac-single` root class and `config.singleMode`,
  which make `widget.js` omit the row-label cells entirely (not hide them) and
  make the day columns span the full width.
- `month_mode($settings)` — per-instance (the variant's `layout` control,
  default `month`). Emits `config.monthMode` + `config.calendar` (localized
  weekday/month names and `start_of_week` from `Widget::calendar_locale()`),
  adds the `mphbac-month` root class, and makes `render()` embed the DISPLAYED
  MONTH so first paint stays request-free. Client-side it switches
  `applyDefaultWindow`/`shiftMonth`/`updateRange`/`scheduleAdjacentPrefetch` to
  calendar-month arithmetic and routes `renderGrid()` into `buildMonthGrid()`.
  **Month grid is layout only** — day cells reuse the strip's exact classes
  (`.mphbac-cell-status is-*`, `.mphbac-cell-tip`) so every Elementor style
  control and CSS custom property keeps driving them; do not add visual tokens
  there. The multi-cottage widget always returns false (a month grid cannot
  represent 8 cottages).
- `show_availability_hint()` — base Widget true; the single variant returns
  false, emitted as `config.availabilityHint` and checked FIRST inside
  `buildAvailabilityHint()`. "All cottages booked through …" is unknowable
  from one room type and misleads guests on a cottage page. Deliberately a
  named flag, not an empty `strings.allBooked`, so repopulating strings can't
  resurrect it; the check is strict `=== false` so pre-0.20.1 cached HTML
  (no key) keeps its old behavior until purged. NOTE: `bookedThrough` stays
  in the payload — the AJAX endpoint can't tell which widget asked, so
  dropping it server-side would desync the embed and AJAX `dataSig` values
  and force a re-render on every load.
- `show_filters($settings)` — base Widget always true (multi widget renders
  its filter bar unconditionally, no control). The single variant's "Show
  date filters" switcher defaults OFF via the missing-key `?? ''` pattern, and
  the skip is server-side: `.mphbac-filters` is not emitted at all. widget.js
  guards every filter-input selector, so no console errors with the bar absent.
- Month mode is MULTI-month (0.19.0): per-device `months_shown` (3/2/1
  defaults, 1–4, condition layout=month) → `config.monthsDesktop/Tablet/Mobile`.
  The window is monthStart(anchor)..`monthWindowEnd(from, N)`; prev/next SLIDE
  by one month; render() embeds the LARGEST per-device span. renderGrid splits
  the window into `.mphbac-monthbox`es inside `.mphbac-months`
  (auto-fit minmax(min(280px,100%),1fr) — wraps instead of crushing).
  Breakpoint changes re-window (N differs per device) keeping the first month
  anchored. `top_spacing` (default 40px) renders margin-top on {{WRAPPER}},
  with a baked `.elementor-widget-dccac_single{margin-top:40px}` fallback in
  widget.css because Elementor's cached per-post CSS doesn't regenerate on a
  plugin update.
- No-op `register_*_controls()` overrides drop panel sections that are
  meaningless without a label column or an info popup (cottage-info repeater,
  custom labels, name-column styling, view-cottage button, popup titles).

Because the label button IS the info-popup trigger, omitting it removes the
cottage-details popup structurally — there is no separate "disable popup"
flag to keep in sync. The Book Now popup is retained and still governed by the
inherited `enable_popup` switch.

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

# Build the installable zip the user uploads via WP Admin → Plugins → Add New → Upload.
# Deliverable filename convention: "Availability Calendar <version>.zip".
# The version is DERIVED from MPHBAC_VERSION rather than typed, so the filename
# can never disagree with the build inside it.
# NOTE: the folder INSIDE the zip must stay `mphb-availability-calendar/` —
# WordPress identifies the plugin by that folder, not by the zip's filename, so
# renaming the zip is safe but renaming the folder would orphan the install.
cd $(git rev-parse --show-toplevel)
V=$(grep -oE "MPHBAC_VERSION', '[0-9.]+" mphb-availability-calendar/mphb-availability-calendar.php | grep -oE "[0-9.]+$")
zip -rq "Availability Calendar $V.zip" mphb-availability-calendar
```

There are no automated tests — runtime behavior can only be verified by installing the zip on a staging WordPress site. See `readme.txt` for the manual smoke-test checklist.

## Architecture

Single-folder plugin, PSR-4-ish layout under a `MPHBAC\` namespace. Bootstrap → Plugin singleton → six collaborators.

```
mphb-availability-calendar.php       # Headers + constants + require()s + activation hook
includes/class-plugin.php            # Singleton orchestrator; registers all WP hooks
includes/class-widget.php            # Elementor_Widget_Base subclass; ~all Elementor controls live here
includes/class-widget-single.php     # Single-cottage variant (extends Widget; overrides 3 hooks + drops panel sections)
includes/class-data-provider.php     # Read layer over MotoPress (PHP API + SQL fallback)
includes/class-cache.php             # Thin transient wrapper (prefix mphbac_)
includes/class-cache-integration.php # SpeedyCache exclusion on activate + admin notice
includes/class-ajax.php              # Public admin-ajax.php endpoints (mphbac_query availability + mphbac_price estimate) — deliberately nonce-free; see Invariants
includes/class-staff.php             # /staff/ AUTHORIZATION GATE + gated PII endpoints (month/booking/photo) — read the Staff section before touching
includes/class-staff-data.php        # Staff month query (1 query + cache prime) + MPHB entity adapter + OTA-honesty rule
includes/class-staff-widget.php      # Shared staff shell + [mphb_staff_calendar] — deliberately contains NO PII
includes/class-staff-elementor.php   # "DCC Staff Calendar" Elementor widget — THIN wrapper over Staff_Widget::render()
assets/css/widget.css                # CSS custom-property–driven
assets/js/widget.js                  # Vanilla JS, no jQuery dep; reads data-config from root element
```

Request flow when a visitor loads a page containing the widget:

1. `Widget::render()` outputs only the shell — heading, filters, legend, nav, a `.mphbac-grid-wrap` holding the `.mphbac-skeleton` shimmer rows, the popups, and hidden `.mphbac-info-content` divs. It does NOT render the grid.
2. The full settings + cottage IDs (incl. per-device `daysDesktop/daysTablet/daysMobile`) are serialized into a `data-config` JSON attribute on `.mphbac-root`.
3. `render()` also embeds the default window's availability (`config.initial`, sized to the largest per-device day count) so `widget.js` can **paint the grid instantly** on load — it slices the device's window from the embed, corrects "past" days locally (stale full-page cache), then fires a *silent* AJAX revalidate that re-renders only if the payload signature changed. If the embed is missing/too stale, it falls back to skeleton-then-AJAX.
4. All network is lazy: `widget.js` defers any admin-ajax call behind an IntersectionObserver (`whenVisible`, 300px rootMargin) and skips the revalidate entirely when the embed passes `embedIsFresh()` — a normal page view can make zero calls. When it does fetch, it picks the day count for the current device, POSTs to `admin-ajax.php?action=mphbac_query`, and **renders the grid client-side**, re-rendering on filter/nav/swipe and breakpoint changes. After a render it idle-prefetches the adjacent nav windows into a client cache (5-min TTL) — but only once measured endpoint latency is under 800ms (`lastLatencyMs`); slow hosting never pays for speculation.
5. `Data_Provider::get_availability()` (transient-cached, IDs sorted for canonical keys) backs the AJAX endpoint — the transient layer hits on repeats. The AJAX endpoint clamps dates to today−400d…today+730d and validates room-type IDs against real accommodation types (options-table flood protection). The grid is intentionally client-rendered so each device shows its own day count. **Signature parity invariant:** the embedded payload and the AJAX response for the same window must serialize identically (same ID sort, same day order, same `bookedThrough` gating) — that's what lets the silent revalidate skip the re-render.

## Staff calendar (/staff/) — 0.21.0, rebuilt 0.23.0

`[mphb_staff_calendar]` / `dccac_staff`. Four files: `class-staff.php` (gate +
endpoints), `class-staff-data.php` (queries + MPHB adapter),
`class-staff-widget.php` (the shell), `class-staff-elementor.php` (thin widget
wrapper). This is the ONLY part of the plugin that handles guest PII.

**UI (0.23.0).** `staff.js` renders ONE month payload two ways:
- **Chart** — a tape chart: CSS grid, rows = cottages, columns = days, with
  TWO half-day tracks per day so a check-out and a check-in share a cell. A
  bar spans "second half of check-in day" to "first half of check-out day".
  Bars clamped to the month edge get `is-cont-left/right` (square edge, no
  cap). Overlapping bookings in one cottage get lanes (greedy interval
  colouring; the row spans N lanes). Geometry is FIXED by custom properties
  (`--staff-day-w` 44, `--staff-row-h` 46, `--staff-label-w` 96) so every
  month is identical. Cottage column, date row and the corner are
  `position: sticky` inside `.mphbac-staff-grid`, which is the scroll box.
- **Agenda** — one day's Arriving / Departing / In house lists, computed
  client-side from the same payload (a day near a month edge loads that
  month; the request is de-duplicated by the cache). Default on
  `(max-width: 700px)`; the toggle persists in localStorage under
  `mphbacStaffView` and, once set, overrides the breakpoint.
- State hues are custom properties used ONCE each (`--staff-in/out/stay`),
  shared by legend swatches, bar segments (classes `is-in/is-stay/is-out`)
  and list group headers, so they cannot disagree. White text on all three
  is ≥ 7:1.
- The detail dialog is PORTALED to `<body>` on open (marker comments put it
  back on close) and every dialog rule is class-doubled
  (`.mphbac-staff-sheet.mphbac-staff-sheet`). Without the portal, a
  transformed Elementor ancestor becomes the containing block for
  `position: fixed` and the dialog opens "high" and clips its heading — the
  0.21–0.22 bug. `html/body.mphbac-staff-open` locks page scroll.
- CLASS NAMES: the top nav bar is `.mphbac-staff-topbar`, booking bars are
  `.mphbac-staff-bar`. They collided in the first 0.23.0 draft (bar rules
  painted the nav bar; the generic `.mphbac-staff button { color: inherit }`
  reset outranked the bar colour). The button reset is now font-only and
  every button class sets its own colour — keep it that way.

**Text contract (0.23.0).** The client renders EVERY value with textContent
and uses no HTML-injection API (the browser harness greps for it). The
server therefore sends PLAIN TEXT: `Staff_Data::money()` strips
`mphb_format_price()`'s markup and decodes `&#036;`, and `str_or_dash()` /
`plain()` do the same for every row value (MPHB log entries carry links).
Never "fix" a literal `<span>` in the dialog by switching to innerHTML.

**Paid amount (0.23.0).** The MPHB Booking entity has no paid-amount getter
on the live install (Total worked, Paid/Balance showed "—"). `payment_info()`
resolves in tiers: entity getter → `MPHB()->getPaymentRepository()
->findAll(['booking_id' => id])` summing `mphb-p-completed` → SQL over
`mphb_payment` posts linked by `_mphb_booking_id` (both key spellings
accepted, `MAX()` aggregates so ONLY_FULL_GROUP_BY is happy). `paid` is
null ONLY when no payment record exists or the read failed — then the row
says "No payment recorded" and Balance due is "—", never "$0.00".
**Unverified against MPHB source** (motopress.github.io and plugins.trac
are both blocked from this environment): the repository method/argument
and the payment meta keys are best knowledge, hedged. If Paid still reads
"No payment recorded" on a booking that definitely has a payment, check
the payment post's meta keys in wp-admin and extend the `PAYMENT_*_KEYS`
constants.

**Harnesses.** `staff-ui/ui-test.js` (Chromium via playwright-core) renders
the REAL shell (`gen-shell.php` → `shell.html`) + real CSS/JS with a stubbed
`fetch`, inside a transformed ancestor, at 1280×500 and 375×700, and
asserts every item of the 0.23.0 brief plus the no-PII shell and the
no-innerHTML rule. `staff-payment-test.php` covers the plain-text contract
and the three paid tiers with an MPHB stub present. `staff-gate-test.php`
must be run with `-d error_log=<file>` (it asserts the fail-closed log
line); `parity-test.js` takes the widget.js path as its argument.

**Security gate — the whole design rests on this.**
- `Staff::is_authorized()` is the single control. Two ways in: a valid
  `wp-postpass_*` cookie for the staff page (re-hashed server-side by
  `post_password_required()` on EVERY request), or `current_user_can()` on the
  `edit_mphb_bookings` cap. Page ID (default 18102) and cap are filterable.
- **Fail-closed hardening:** `post_password_required()` returns FALSE for a
  post with NO password, so a naive `!post_password_required($id)` gate swings
  wide open the moment someone clears the page password. `is_authorized()`
  therefore verifies the page still HAS a password (and is published) before
  trusting the cookie path, logs it if not, and falls back to the cap alone.
  Do not "simplify" that check away.
- TWO placements share ONE implementation: the `[mphb_staff_calendar]`
  shortcode and the `dccac_staff` Elementor widget. `Staff_Elementor::render()`
  calls `Staff_Widget::render()` and echoes the result verbatim — it holds no
  gate, no markup and no data access of its own. Keep it that way: a second
  render path is a second place for the gate to drift. Note it extends
  `Widget_Base` directly, NOT `Widget`/`Widget_Single`, so the public
  calendar's controls and render path stay out of a PII page.
  `staff.js` also hooks `frontend/element_ready/dccac_staff.default`, without
  which the widget is a dead shell in the Elementor editor (widgets mount
  after DOMContentLoaded).
- The shortcode shell contains NO PII — only a nonce and endpoint URLs. All
  guest data (including the calendar's guest names) is fetched through the
  gated endpoints, so there is ONE enforcement point and the page HTML is
  worthless if cached or leaked. Keep it that way: never inline booking data.
- Photo IDs stream through `handle_photo()`, which re-derives the file path
  from the BOOKING (never client input), rejects anything outside the uploads
  dir via realpath containment, and sends nosniff + a restrictive CSP. The
  `/uploads/` URL is never emitted — that is how the /guest/ Wi-Fi passwords
  leaked.
- Nonce required on every endpoint. Consequence: if the staff page is ever
  full-page cached, the baked nonce goes stale and staff get 403 — fail-closed,
  and the client says "reload the page". The staff page and all three staff
  endpoints are in the SpeedyCache exclusion list for this reason.

**OTA honesty rule.** iCal-imported bookings carry no real occupancy — MPHB
defaults adults to the cottage's MAX capacity (~74 of 149 imported rooms).
Any booking with `mphb_ical_prodid` (checked on the booking AND its reserved
rooms) is marked imported, and `section_rooms()` returns `adults`/`children`
as `null` with `provided: false` plus a "not provided by <OTA>" note. The UI
renders that greyed and italic. **Never surface an imported guest count as a
number.** Direct bookings return real counts.

**No `?object` parameter hints in the MPHB adapter (0.23.1).** MPHB getters
return arrays as well as objects (`getInternalNotes()` is a list of
`{note,date,user}`, `getLogs()` a list of arrays/objects, `getCustomer()`
sometimes an array), and `scalar()` re-feeds whatever it got into
`first_of()`. Under PHP 8 a `?object $obj` hint throws a TypeError BEFORE the
`is_object()` guard runs — that fatal broke the popup for two-thirds of live
bookings in 0.23.0. Every helper that can be handed a getter's return value
is now untyped and guarded by `is_object()`; `staff-notes-test.php` greps
the file for `?object $` and fails if one comes back. Notes and log entries
go through `entry_rows()`/`note_entry()` (any shape → rows, newest first,
date via `date_i18n`, author via `get_userdata()`), never through `scalar()`.
Harness lesson from the same fix: a top-level `$logs = …` in a harness IS
`$GLOBALS['logs']` — prefix fixture globals (`fx_*`).

**Reading MPHB.** MPHB's source is not vendored and getter names vary across
6.x, so every entity read goes through `first_of()`/`scalar()`, which try a
list of candidate getters and fall back to post meta only as a last resort
(same shape as `Data_Provider::query_room_types()`). A field whose real getter
isn't in the candidate list degrades to "—" — visibly empty, never fatal,
never silently wrong. Candidate lists need confirming against the live install.

**Performance.** `month_view()` is ONE query for the range plus a single
`_prime_post_caches()`. Two N+1s were found and fixed by audit, both invisible
to unit tests — guard against reintroducing them:
- `source_for()` must be passed the reserved-room ids `month_view()` already
  has; without them it does a `get_posts()` per booking.
- `guest_name()` is META-ONLY on purpose. Constructing an MPHB booking entity
  there is a repository call per booking (12 bookings = 12 lookups, each
  potentially loading customer + reserved rooms). If chips render "#id" on a
  real install, extend `name_from_meta()`'s key list — do NOT reach for the
  entity. The detail sheet may use entities: it is one booking, loaded lazily.

`staff-monthview-test.php` and `staff-nplus1-test.php` assert the query count,
the `get_posts()` count, and the MPHB repository-call count. The second exists
because the first had no `MPHB()` stub, so `function_exists()` was false and
the entity N+1 went unseen — any new staff harness must stub MPHB.

## Theme button typography (0.23.2)

`<button>` does NOT inherit `font-family`, and this site carries a global
button-typography rule at (0,1,1) (an Elementor kit selector). A single class
therefore LOSES — including the long-standing `font: inherit` on
`.mphbac-btn`. Measured on live: nav/Today computed Pavanam while the range
label beside them computed the theme's Raleway. Every button the plugin
renders needs an explicit family rule at (0,2,0):

```css
.mphbac-nav-btn.mphbac-nav-btn,
.mphbac-btn.mphbac-btn,
.mphbac-sheet-close.mphbac-sheet-close,
.mphbac-info-close--floating.mphbac-info-close--floating { font-family: inherit; }
```

- CLASS-DOUBLED, not `.mphbac-root .x`. Both reach (0,2,0), but the sheet and
  its buttons are portaled to `<body>` on open, where no `.mphbac-root`
  ancestor exists — same reason `.mphbac-input` and `.mphbac-sheet` are
  doubled. The harness asserts the face survives the portal.
- family ONLY. `font: inherit` at (0,2,0) would also pull size/weight in and
  change how these buttons look today.
- NOT `!important`: an inline style was verified to beat the theme rule, so
  the theme rule is not `!important` either.
- The STAFF widget's buttons have the same latent problem and were
  deliberately left alone (not requested).
- Verifying this: a CSSOM sweep for the offending rule returns NOTHING. One
  stylesheet on the page is cross-origin (`cssRules` throws) and some
  Elementor selectors make `element.matches(selectorText)` throw, so a
  try/catch silently drops rules that do match. Inject a candidate rule and
  read `getComputedStyle` instead.

## Nav row layout (0.23.2)

`.mphbac-nav` is `justify-content: center; gap: 10px`. It was `space-between`,
which on a ~1000px page put ~235px of air between four controls totalling
~330px. The print block's `justify-content: center` override is now redundant
and was removed.

Centring makes the range label's width move BOTH arrows by half its own
change (~13px month to month), so `.mphbac-nav-range` reserves it:

```css
min-width: min(19ch, calc(100% - 200px));
```

`ch` tracks whatever face the theme supplies; 19ch covers the widest
day-range label (measured 17.4ch). The `min()` clamp is what makes it safe:
a bare `19ch` overflows any row narrower than ~370px, which includes the
single-cottage placement (~363px) and every phone, and month-mode labels
("December 2026 – February 2027") exceed the reservation anyway. Subtracting
the row's fixed content (two 44px arrows + Today + three 10px gaps ≈ 180px;
200px allows a longer translated "Today") means the reservation applies only
where slack genuinely exists. Negative results clamp to 0.

Consequence to know: at ~363px with a SHORT label there WAS slack (measured
28–43px gaps), so those placements now cluster centred rather than spreading.
Only a saturated row is literally unchanged.

Arrows are inline stroked SVG chevrons, not `&larr;`/`&rarr;`. The glyphs
rendered in the theme's button face, so their weight was not ours.
`stroke="currentColor"` keeps them on the "Nav text color" Elementor control;
the accessible name stays on the BUTTON, so the `<svg>` is `aria-hidden` +
`focusable="false"`. Do not shrink the 44x44 hit area.

`nav/nav-test.js` EXTRACTS the nav markup from `class-widget.php` rather than
retyping it (substitute the `esc_*` echoes BEFORE stripping PHP comment
blocks, or the strip eats the `aria-label`s), reproduces the (0,1,1) theme
button rule, and diffs against the previous stylesheet at 1000/375/363/320px.
Two harness gotchas it encodes: `align-items: center` gives same-line items
different `top` values (compare vertical CENTRES for "one line"), and a
programmatic `.focus()` does not set `:focus-visible` in Chromium — press Tab,
then wait out the 0.2s background transition.

## Staff popup field spec (0.23.3)

The popup carries EXACTLY the operator's three sections and field list, in
order, and nothing else — Booking Information, Customer Information, Notes.
The Reserved Accommodations section was removed, and with it Status, the
guest note, the booking log, and Payment method/status as ROWS
(`payment_info()` still resolves method/status; only the rows went).
Everything is built in `Staff_Data`; `strings` now carries section TITLES
only, so a label outside the spec has nowhere to come from.

- `push()` drops a row whose value is empty AFTER formatting; `is_blank()`
  defines empty as '', an em/en dash, '-', 'n/a', 'na', 'none', 'null' or a
  bare '0'. **"$0.00" is deliberately NOT blank** — a paid-in-full Balance Due
  must show. A section with no rows is omitted by the client rather than
  rendered as a bare heading.
- Guest 2-4 and the dog fields are MPHB checkout custom fields matched on a
  NORMALIZED key (`custom_get()`: strip `mphb_`, lowercase, drop
  non-alphanumerics), so `mphb_guest_2_first_name`, `guest2FirstName` and
  `Guest 2 First Name` all resolve. Extend the candidate lists rather than
  hard-coding one spelling.
- Rob confirmed the two ambiguities in the spec: "Guest5 Last Name" was a typo
  for **Guest4 Last Name**, and "Number of Guests" belongs to the **booking
  section only**.
- OTA honesty moved here from the deleted `section_rooms()`: an imported
  booking's "Number of Guests" is the sentence "count not provided by <OTA>"
  with `muted => true`, never MPHB's max-capacity default.
  `staff-ota-test.php` used to assert this against a MIRROR of the production
  logic in a local closure — it now calls the real `section_booking()`.

## Contrast + button treatment (0.23.3)

- Month-grid date numbers: `--mphbac-color-day-num` (#1F2937) applied via a
  class-doubled `.mphbac-day-num.mphbac-day-num`. The plugin never set the
  old mid-grey — the numbers INHERITED it from a theme rule at (0,1,1), which
  is why an explicit rule is needed rather than a value change. Measured
  against the COMPOSITED fill (weekend cells lay a 3.5% black gradient over
  it): was 2.61 / 1.49 / 2.41, now 8.91 / 5.10 / 8.24. White is NOT an
  alternative — ~2.9:1 on the coral. Keep the number and fill as separate
  tokens so re-tinting a fill cannot drag the number with it.
- The staff nav uses the same SVG chevrons as the public nav, and
  `.mphbac-staff-nav`/`-view`/`-item`/`-bar`/`-close` carry the same
  class-doubled `font-family: inherit` (see the theme-button-typography note).
- `.mphbac-sheet-close` is a 44x44 circle with a #ECEFF3 ground (glyph
  #4A5260, 7.9:1) and an offset focus ring, so the ring reads on both the
  resting ground and the red hover fill. It stays TOP-RIGHT, where it was.

Harness note: `staff-ui/ui-test.js` now regenerates `shell.html` from the live
PHP on every run — a stale shell silently tested the previous release's
markup. `nav/public-ui-test.js` reproduces the theme's inherited grey and the
(0,1,1) button rule, and extracts the booking sheet from `class-widget.php`.

## Cross-widget style parity (0.23.4)

Both widgets expose the SAME nav control list — `nav_btn_bg`,
`nav_btn_text`, `nav_btn_hover_bg`, `nav_btn_radius`, `nav_label_color` —
so a restyle can be mirrored by hand. Only the DEFAULTS differ:

- `dccac_staff` defaults to the public nav's LIVE values on /cottages/
  (#0A50B2 / #FFFFFF / #FFA000 / 30px), baked into staff.css as
  `--staff-nav-bg/-text/-hover/-radius` as well, because the shortcode has
  no Elementor CSS and Elementor's cached per-post CSS does not regenerate
  on a plugin update.
- The public `nav_btn_radius` has NO default on purpose: an emitted value
  would override whatever already shapes an existing nav.
- `Staff_Elementor::SEL` is `{{WRAPPER}} .mphbac-staff.mphbac-staff `,
  mirroring `Widget::SEL`.

**Font on a <button> comes from the BUTTON, not its spans.** The theme rule
targets `button`, so `font-family: inherit` on a child span faithfully
inherits the theme face from its own parent. `.mphbac-cell-label` therefore
carries the class-doubled `font-family: inherit`; the spans only set size,
weight and colour. Caught by the harness, not by inspection.

Public cottage cells now mirror `.mphbac-staff-rowlabel`: number 16px/700
tabular, short name beneath 11px/600 #5b6470, 2px gap, line-height 1.15, on
the existing `--mphbac-color-namecol` / `-alt` pair. The number is pulled
above the name with `order: -1` rather than by reordering the markup, so the
custom-label override is untouched. Data-row padding is 4px 8px (was 8px
12px) so 16+2+11 at 1.15 fits the 45px row; the header row keeps its own.
The number is now bare ("22", no "#").

**Two things on /cottages/ are page settings, not plugin defaults** — the
plugin cannot and should not override them:
- `label_style` = `number_only` on that widget hides the cottage name at
  every width. The plugin default is `abbrev_number` (two-line), which is
  what item 3 asks for. The mobile-only collapse is a SEPARATE, correctly
  media-scoped `:has()` rule in the 600px block.
- `namecol_bg` is set to #C9C9C9 there; the plugin default has always been
  #F8F9FA. Same for `str_property` ("Cottage" vs the new "Cottages"
  default) and any `namecol_typography` override.

## [hidden] and the label/day-track trade-off (0.23.5)

**`[hidden]` does not hide an element the plugin gives a `display` to.**
`[hidden] { display: none }` lives in the UA stylesheet, so ANY author rule
setting `display` outranks it. `.mphbac-nav-btn { display: inline-flex }`
therefore kept the Back-to-today button on screen from the 44px nav work
until 0.23.5, while widget.js set the attribute correctly the whole time.
staff.css had `.mphbac-staff-today[hidden] { display: none }` from the start,
which is the only reason /staff/ behaved. Any element this plugin both
`display`s and toggles with `hidden` needs an explicit `[hidden]` rule, at
(0,4,0) so a theme button rule at (0,3,1) cannot resurrect it.
**Test the COMPUTED display, never `el.hidden`** — asserting the attribute is
what let this ship, twice.

**The cottage column and the day columns share one row.** `.mphbac-grid` is
`grid-template-columns: <label> repeat(7, 1fr)` inside a wrapper with
`overflow-x: hidden`, so on a 375px phone the label and its seven days split
~344px: every pixel the label takes comes off the day cells (measured 80px
label → 35.7px days, 88px → 34.6px, 96px → 33.4px). 88px is the floor at
which none of the eight live names clips, and the 600px block pins the track
to `max(var(--mphbac-label-width), 88px)` — a floor rather than a new default,
because `namecol_width` is a saved per-instance control and a default only
reaches instances that never set it. Scoped off `.mphbac-label-number`, which
has no name to fit.

**This is why the staff calendar can afford a 96px label on the same phone**
and the public one cannot: the staff grid is
`var(--staff-label-w) repeat(N, calc(var(--staff-day-w) / 2))` with FIXED 44px
days and horizontal scrolling, so its label costs the day columns nothing. Do
not "simplify" one grid into the other.

Two lines cost +8% row height (38px → 41px), not the "~30%" the pre-0.23.5
comment claimed; that comment was justifying a rule that has now been removed.

**Cottage short names** (`Data_Provider::short_name()`): drop a leading
article, then drop TRAILING generic nouns while more than one word remains
(filter: `mphbac_generic_room_words`), then cut on a word boundary at 16
chars. Before 0.23.5 it took the first non-article word and stopped, which
rendered "Blue Heron Hideaway" as "Blue". The single-word guard is what keeps
"The Boathouse" from reducing to nothing. All eight live titles are fixtures
in `abbrev-test.php`.

The cottage label's number/name order is MARKUP order, not CSS `order`: the
0.23.4 `order: -1` did not survive the live page.

## Booking-popup validation (0.23.7)

`.mphbac-sheet-error` is owned by the CURRENT range. Before 0.23.7 only
`openSheet()` and the Book Now click cleared it, so an "unavailable dates"
message from one attempt sat there while the visitor picked a different, free
range — and Book Now stayed live underneath it and submitted. Two rules now:

- `rangeState()` is the single source of truth (client-side facts only:
  both dates present, check-out after check-in, at least `minNights`).
  Availability needs the server round-trip in `verifyAndSubmit()`, so its
  message is shown after that call and cleared by the next EDIT, never by a
  timer.
- `updateSheetValidity(fromEdit)` — `fromEdit: true` means the visitor just
  changed a date, so whatever is on screen no longer describes their
  selection and goes; `false` only re-syncs the button, which is what lets a
  server-side "unavailable" message survive its own round-trip. In-flight
  state is the separate `submitting` flag, so re-enabling after a request
  still respects validity.
- A HALF-FILLED range disables the button but shows NO error: nothing has
  gone wrong, the visitor simply is not finished.

**Test the computed style and whether a navigation actually happened**, never
the `hidden`/`disabled` attribute — the same blind spot that hid the
Today-button bug. `nav/sheet-validate-test.js` drives the REAL `wirePopup()`
lifted out of widget.js against the REAL sheet markup lifted out of
class-widget.php, stubs `HTMLFormElement.prototype.submit`, and reproduces
the bug on the previous build before asserting the fix.

## Marks and alignment (0.23.7)

Close buttons use a stroked SVG cross on the same spec as the nav chevrons
(20x20, stroke 2.25, round caps, `currentColor`) — a text `&times;` rendered
at ~41% of a 44px button and thin in the theme face. Applied to the booking
and info closes; **the staff close deliberately still uses the glyph**,
because that round required /staff/ to stay pixel-identical.

Cottage cells are centred at every width, matching the centred header. The
centring rule used to live only in the 600px block and in the
`.mphbac-label-number` block, so desktop read crooked. Both copies are gone.
When measuring whether something is centred in `.mphbac-cell-label`, note it
has a 2px RIGHT border only — judge against the CONTENT box
(`left + clientLeft + clientWidth / 2`), or everything looks 1px off.

## Availability in the booking popup (0.23.8)

`renderGrid()` publishes its NORMALISED availability map onto `state`
(`state.availability`), which is how the popup can tell a booked night from a
free one. Before 0.23.8 that map was local to `renderGrid`, so `rangeState()`
only ever checked the SHAPE of the dates — the popup quoted a price for
booked nights and refused them at submit. `blockedNight(ci, co)` walks the
nights `[ci, co)`, the same half-open interval `verifyAndSubmit()` uses.

- A night ABSENT from the map is not treated as blocked. Refusing dates on no
  evidence is worse than a late refusal, and the server check in
  `verifyAndSubmit()` is still there as the backstop for anything outside the
  loaded window. This is the deliberate boundary of the local check.
- `fetchEstimate()` gates on `rangeState().ok`, so no price is quoted for a
  range that cannot be sold.
- `defaultCheckout()` clamps the grid-click proposal to the first blocked
  night. When that lands inside the minimum stay the proposal comes out SHORT
  and the minimum-nights message explains it — honest, where "unavailable" on
  a range we chose for them was not.

**Harness trap that hid this for a release:** `sheet-validate-test.js` made
ranges invalid only by their DATES, so it passed while availability was never
consulted. It now drives an availability-invalid range too, and its stubbed
endpoint and client-side map are built from ONE `__BLOCKED` set — they
disagreed once, and the baseline silently submitted a blocked range. There is
also a control asserting a BOOKABLE range still gets its estimate, without
which "no estimate for a blocked range" passes vacuously (the stub had no
price action at all, so no estimate ever rendered).

Baselines that compare against `git show HEAD` go stale the moment the fix
ships. Prefer a durable invariant ("no rendered glyph is left") over a
one-time migration comparison.

## Cottage-info carousel (0.23.8, UNVERIFIED)

`reinitElementorWidgets()` re-runs Elementor's ready trigger for widgets
inside the popup after the sliders settle, once per element for the life of
the page (the handlers are not documented as idempotent and a double binding
would open the lightbox twice). `reinitSwipers()` now rebuilds loop clones
ONLY when the slide on screen is itself a clone — `loopCreate()` makes fresh
nodes via `cloneNode`, which copies markup but not bindings, so rebuilding
unconditionally is a plausible CAUSE of the dead-first-photo symptom it was
added to fix.

**The root cause was never confirmed from inside the popup** — it could not
be opened synthetically here. If the first photos are still dead, the next
lever is turning loop OFF for carousels inside the popup: with no loop there
are no clones at all.

## Invariants that must hold

These are deliberate decisions from the design conversation. Don't "fix" them without checking with the user.

- **The booking-sheet price estimate (0.20.0) is additive and non-blocking.** `mphbac_price` calls `mphb_get_room_type_period_price()` per request (never cached — no-store headers + SpeedyCache exclusion), validates via `Ajax::validate_price_request()` (real dates, no past check-in, ≤95 nights, whitelisted type ID), and returns `priceHtml`/`avgHtml` sanitized by `wp_kses` from `mphb_format_price()` (currency symbol is an HTML entity — that's why it's HTML, injected client-side only into controlled spans via `renderTemplate()`, never concatenated with user input). Client side: 400ms debounce, sequence counter + AbortController for last-write-wins, price ≤ 0 or any failure hides the row; the Confirm flow never waits on it.
- **The availability AJAX endpoint is deliberately nonce-free.** It is public, read-only, and side-effect-free; a nonce embedded in full-page-cached HTML expires after ~24h and turned every cached pageload into a 403. Do not "fix" this by adding one. Input is hardened instead (absint + ID whitelist + date clamp).
- **All "today" math runs in US/Eastern**, not WP's site timezone. The physical cottages are in Florida and cutoffs must match the property clock regardless of visitor locale. See `Data_Provider::TZ` and `Data_Provider::timezone()`.
- **Never re-fetch iCal URLs.** MotoPress already syncs iCal feeds every 15 minutes; imported reservations land as `mphb_booking` posts (same as direct bookings). Direct iCal HTTP fetches would duplicate work and risk cron conflicts.
- **Availability is read directly from MotoPress's DB, not its PHP API.** `MPHB()->getRoomRepository()->getAvailableRooms()` proved unreliable (ignores the room-type filter in 6.x). `Data_Provider::query_occupied_room_days()` reads the real storage: `mphb_reserved_room` posts (`_mphb_room_id` meta) joined to their parent `mphb_booking` post (which carries `mphb_check_in_date` / `mphb_check_out_date` and a `post_status` in `Data_Provider::BLOCKING_STATUSES`), plus the `{prefix}mphb_blocks` table for manual host blocks. A cottage-day is "booked" only when every physical room of that type is occupied. All SQL is `$wpdb->prepare`'d; each read checks `$wpdb->last_error` (wpdb never throws) and a failed read raises `Db_Read_Failed` so the bad result is never cached — the endpoint then returns the safe all-booked direction for that request.
- **Book Now flow uses a hidden form POST to MotoPress's checkout page** (`MPHB()->settings()->pages()->getCheckoutPageUrl()`, default `/submit-booking/`). The POST body matches MotoPress's own cottage-page form exactly: `mphb_room_type_id`, `mphb_check_in_date`, `mphb_check_out_date`, `mphb_rooms_details[ID]=1`, `mphb_is_direct_booking=1`. No nonce field — MotoPress doesn't CSRF-protect this submission. Don't switch to `MPHB()->reservationRequest()` PHP-side unless you have a specific reason; the form-POST path is documented behavior and identical to what MotoPress's own UI does. Popup can be disabled globally via the `enable_popup` Elementor toggle.
- **Every visible string must be translatable.** Text domain is `mphb-availability-calendar`. The site uses Loco Translate. Use `__()`, `esc_html__()`, `esc_attr__()` etc. — never echo a raw user-facing string.
- **The Elementor widget category is `dcc-widgets`** ("Dora Canal Court"). It's registered in `Plugin::register_category()`. Changing the slug is safe for already-placed widgets (Elementor persists `widgetType`, not the category, in saved page data) — the category only controls which panel group the widget appears under while editing. Keep it stable anyway so all site widgets stay grouped together.
- **SpeedyCache exclusion is auto-managed.** `Cache_Integration::on_activate()` runs on plugin activation and adds `/wp-admin/admin-ajax.php?action=mphbac_query` to SpeedyCache's exclusion list (filter + option write). The user does not configure this manually.

## Cache layer

- Backed by WP transients, prefix `mphbac_`, default TTL 900 s (15 min — matches MotoPress's iCal sync interval).
- Keys are `sha1(wp_json_encode($parts))` so they're content-addressed and stable. Availability keys are additionally salted with today's date (ET) because "past" is baked into the stored payload.
- `Cache::get_or_set()` wraps every stored value as `['__v' => value, '__t' => time()]` and exposes `$age` / `$hit` out-params — the client freshness gate (`config.initial.dataAge`) depends on this envelope. Don't "simplify" it back to raw values.
- A producer that throws is NOT cached (`Db_Read_Failed` is how Data_Provider vetoes caching after a failed `$wpdb` read — wpdb never throws on its own, it only sets `last_error`).
- `Cache::flush_all()` is called on `mphb_after_sync_ical`, `mphb_ical_sync_finished`, `mphb_after_create_booking`, and `mphb_booking_status_changed`. If MotoPress changes its hook name, transients still expire on TTL, so worst case is a 15-min staleness window.
- Deactivation flushes all transients.

## Adding controls or settings

Every Elementor control is registered inside one of sixteen methods in `class-widget.php`, all called from `register_controls()`:

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
- `register_view_button_style_controls()` — the "View Cottage Page" button (icon, typography, colors) — VSEL, portal-proof
- `register_popup_title_style_controls()` — the two popup titles (typography/color/margin) — TSEL, portal-proof, all defaults empty

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

- Active branch: `claude/review-shared-chat-bExtl` (existing remote ref; renaming it is optional). Develop and push there. Don't open a PR unless the user asks.
- The repo has only the plugin folder at root — no other deliverables.
