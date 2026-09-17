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
- **The Elementor widget category is `claude-code`** ("Claude Code"). It's registered in `Plugin::register_category()`. Don't change the slug — existing widgets reference it.
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

## DCC Custom Checkout — release artifacts

- **Naming of files handed to the owner** (owner preference, corrected
  2026-09-13). Two rules, and the distinction matters:
  - **Plugin zips take NO dash**: `Custom Checkout <version>.zip` (e.g.
    `Custom Checkout 0.34.0.zip`), matching the version in the plugin header.
  - **Everything else takes the dash**: `Custom Checkout - <name>.<ext>` —
    images, markdown, JS, reports, audits, exports, anything that is not the
    plugin zip.

  The folder *inside* the zip stays `dcc-custom-checkout/` — that is the
  WordPress plugin slug and must not change.
- Build zips are gitignored (pattern `Custom Checkout *.zip`); never commit them.
- **The "Rate:" row is removed from the price breakdown unconditionally**
  (owner decision, v0.6.1). Every rate on this site is named after its cottage,
  so the row only ever restated the accommodation title above it. The
  consequence: **a rate named anything else — "Winter Special", say — will not
  appear on the checkout breakdown either.** If a differently-named rate is
  ever created and its name needs to be visible, `dropRateRows()` in
  `assets/checkout.js` has to become conditional (drop it only when the label
  after "Rate:" matches the accommodation title).
- **The native "Choose Additional Services" section is hidden on the checkout**
  (owner decision, v0.7.0). Both fees this site charges are driven by controls
  the guest already used — the pet fee by "Traveling with a dog?", the
  extra-guest fee by "Number of Guests" — so the native section was a second
  control for a decision already made. The consequence: **any service added in
  MotoPress in future that is NOT driven by one of this plugin's own controls
  will be uncheckable, because a guest never sees it.** Whoever adds one must
  either wire a control for it in `checkout.js` or narrow
  `hideNativeServices()` to skip that service's row.
- Hiding there is display-based on purpose: a hidden-but-checked input still
  submits and MotoPress still prices it. Never switch it to `disabled`,
  `remove()`, or anything that stops the input submitting — that would silently
  stop charging the $50 extra-guest fee.
- **Buttons follow the site button spec** (owner decision, v0.8.0): the "Send
  Message" button at /contact/ — Raleway 20px/500, line-height 50px,
  letter-spacing 0.5px, text-transform none, #fff on #006BCF, no border,
  radius 30px. Every DCC plugin declares it rather than inheriting from the
  theme. It is asserted **without `!important`**: Bravada forces
  `text-transform: uppercase` (0,0,1) and the Elementor kit forces
  18px/900/1.5px/capitalize (0,1,1), and the doubled `form.mphb_sc_checkout-form`
  class reaches (0,3,1)-(0,3,2), which wins outright. Keep it that way — a
  later deliberate override should still be able to win.
- **Blue buttons hover to coral** `#F08080` with `#FFFFFF` text (site standard,
  v0.8.1) — not the older `--dcc-blue-hover`, which is kept only because other
  rules use it. White on `#F08080` is 2.59:1, below WCAG AA; the owner has
  chosen it knowingly, so the focus treatment must stay an outline and never
  depend on the fill. Any hover selector must be **the resting selector with
  `:hover` appended** — a hover rule that loses to its own resting rule fails
  silently and still looks right in the file.
- Button appearance is measured in real Chromium at `tests/button/`
  (`npm install && npm test`). It renders the button in isolation, because
  `/submit-booking/` only exists with a live reservation. Run it after touching
  any button rule.
- **Fixtures must come from real /submit-booking/ markup.** Three defects
  survived several releases with a green suite because the fixtures were
  plausible rather than real (v0.9.0). Two traps worth knowing:
  `.mphb_sc_checkout-service` is on the CHECKBOX, not its row, and
  `Element.closest()` matches the element itself — so resolving a row from a
  service input needs an explicit "a form control is never a row" guard. And
  the "Rate:" line is a `<div class="mphb-price-breakdown-rate">` inside a
  `<td>`, not a row.
- **Never match on text this plugin has written into the page.** The tax
  asterisk is appended to the Taxes cell, so a second pass read that row as
  "Taxes*" and the whole footnote control died. Injected elements carry
  `data-dcc-injected` and `rowLabel()` skips them. Anything that reads a label
  and might run twice must do the same.
- **Guest photo IDs are deleted on request only** — no schedule (owner
  decision, v0.10.0). The button is on the booking screen; the file also goes
  when a booking is PERMANENTLY deleted, but not when it is trashed. The image
  is never rendered in the admin, only its filename.
- **`Id_Files::contain()` is the only thing between post meta and `unlink()`.**
  It is a pure static function for exactly that reason, and it is tested
  directly at `tests/id-files/` (`php tests/id-files/run.php`) against
  symlinks, encoded traversal and prefix-colliding sibling directories. If you
  add any code path that deletes a file, route it through `contain()` — never
  build a path from meta and unlink it.
- **Deletion notes go into MotoPress's own booking log** (v0.10.1):
  `\MPHB\Entities\Booking::addLog()` via
  `MPHB()->getBookingRepository()->findById()`. Logs are `wp_comments` rows
  with `comment_type` `mphb_booking_log`. The write is verified by counting
  those rows before and after — `addLog()` returns nothing, so a silent no-op
  would otherwise pass for success. If the count does not rise, the plugin's
  own history panel renders instead; it is a fallback, never a second copy.
- The protected store's `index.php` and `.htaccess` are self-healing (on
  activation, after a checkout upload, hourly in admin) because /privacy/
  promises IDs are blocked and a host migration can drop dotfiles. Whether the
  server honours them is checked live by **DCC → Custom Checkout → Guest ID
  storage → "Check public access now"**, which probes over real HTTP; no local
  test can answer that.
- **The fields here are the site standard** for the Guest Guide Support Report
  form and the Availability Calendar — those two only, not site-wide (owner
  decision, v0.11.0). Each of those repos keeps its OWN copy of the values;
  exported as `Custom Checkout - Field Standard.css`. Not a shared mu-plugin
  layer: mu-plugins cannot be installed from the WP Admin upload screen, which
  is how these are deployed, and it would be a single point of failure across
  three plugins. Tokens read an optional `--dcc-site-*` first and fall back to
  the literal, so a shared layer can still be added later without anything
  depending on it.
- **The typed-value and `::placeholder` colours are declared, not inherited.**
  They had no rules until v0.11.0 and inherited black and a UA grey. That is
  invisible on the checkout and wrong in any other cascade — do not delete them
  as redundant.
- **Every hover rule on the checkout lives inside
  `@media (hover: hover) and (pointer: fine)`.** On iOS the first tap applies
  `:hover` and it sticks until the next tap elsewhere, so a hover-styled
  control eats a tap and will not revert. Focus rules stay OUTSIDE that query.
  Touch behaviour is asserted in `tests/button/` with an emulated coarse-pointer
  context — that proves the rules are gated, not that iOS behaves.
- **Tap diagnostic**: `?dcc_tap_debug=1` on the checkout, administrators only
  (v0.12.0). Records pointer/touch/mouse/click with defaultPrevented and the
  real topmost element at the touch coordinates. Listener-only — it must never
  gain a preventDefault or a stopPropagation, or it stops being a measurement.
  Gated on capability AND the URL flag, so nothing persists and there is no
  default to get wrong.
- **Field width is TWO rules, and both are required** (owner decision, v0.14.0:
  "match the Availability Calendar's date pills"). The calendar's field is
  `width: 100%; max-width: 100%; min-width: 0` — it fills its track, and the
  TRACK is what makes it narrow. So the checkout keeps `width: 100%` on the
  field and caps the WRAPPER (`.dcc_checkout-field-row`, put on by
  `markFieldRows()`, with `p.mphb-text-control` as the no-JS fallback) at
  `--dcc-field-max`. Capping the field alone reintroduces the dead strip that
  v0.13.0 removed, and it looks correct in the stylesheet while doing it.
  **360px is chosen so the cap is inert on a phone** — at 390px the section's
  content box is ~358px — so anything below ~358 trades phone tap area for
  desktop proportions. Asserted at both widths in `tests/fields/`.
- **`input[type="date"]` needs `appearance: none`.** iOS Safari will not shrink
  a native date control below its intrinsic content width; it ignores the width
  its container granted and overflows. Chromium shrinks it without complaint,
  so **no Chromium harness can catch this** — it is the calendar's measured
  iPhone overlap bug (a ~215px control in a ~172px track at 393px). The
  checkout renders its dates as hidden inputs today, so the rule is a guard.
- **The tax footnote must never contribute to the widget's intrinsic width**
  (v0.14.0). It is a `<p>` beside the breakdown table, and the container is
  content-sized: opening it took the widget from 210px to 769px and every field
  grew with it. `width: 0` + `min-width: 100%` is the pair that fixes it —
  `width: 100%` alone looks identical in the file and reintroduces the defect.
  Asserted in `tests/footnote/`.
- **Breakdown matchers must know BOTH spellings of every label** (v0.14.0).
  `Assets::string_overrides()` renames Services→Extras, Service→Item and
  Services Total→Extras Total via a gettext filter on the checkout — but the
  owner's live screenshots still show MotoPress's original words, so that
  filter may not be firing. `Assets::label_aliases()` feeds both spellings to
  the JS (`CFG.labelAliases`, used by `labelIs()`), so a matcher works either
  way. Never match one spelling only; that is how the services section survived
  three releases looking right and matching nothing.
- **The extra-guest row is relabelled for DISPLAY, never renamed** (item 14,
  v0.14.0). MotoPress service 18063 keeps its post_title, which is what admin
  screens and guest emails show. `Config::guest_service_titles()` reads that
  title BY ID so a rename in the MotoPress admin moves the match with it. The
  guest count in the details cell comes from the `[adults]` select this plugin
  sets itself — a number it wrote, not prose it parsed — and the cell is left
  alone when that cannot be read. Verified service terms: $50, per_night,
  per_adult, min 1, max 2, attached to 1065/1067/1069/1071/1740/1742 (all
  capacity 4); Cottages 33 (1604) and 34 (1607) are capacity 2 with no
  extra-guest service, so the row cannot appear there.
- **`Config::couch_note_text()` is the single copy of the pull-out-couch
  sentence** (v0.14.0). The checkout, the admin preview and the Cottage
  Selector all read it, because the owner requires the two plugins to match
  character for character. It is a LITERAL, not a template, for that reason —
  and so it assumes 2 included / 4 capacity / queen + pull-out couch, which
  holds for the six cottages that can show it. The caller's `max <= included`
  guard is what keeps it off Cottages 33 and 34.
  **v0.19.0 literal, pinned:** sha256
  `8a638fb2e266a645cbf93b300dec44113c0989a9531dbb5abb00bb55a420783f`, 138
  bytes, asserted in `tests/copy/run.php` (`php tests/copy/run.php`). The
  Cottage Selector pins the same hash. **Change one, change both, change both
  pins.** The owner's line break between the two sentences is applied at
  render (`\n` after the first full stop + `white-space: pre-line`), never in
  the literal — the literal must hash identical.
- **The upload hints share the tax footnote's rule** (v0.20.0). MotoPress's
  `mphb-checkout-fields` renders `.mphb-max-upload-file` and
  `.mphp-accepted-upload-types` (sic — misspelt in its source, target it as
  written); they are styled, never re-marked-up. One rule with
  `.dcc_checkout-tax-footnote` so the three cannot drift, and **no
  `font-weight` on any of them**: the footnote's is inherited from the site's
  `html{font-weight:700}`, and the hints must match its computed weight, not a
  number from the standard. The preceding `<br>`s are hidden with `:has()`.
  Asserted in `tests/fields/` against `html{font-weight:700}`.
- **Site-level CSS that is not in this repo.** doracanalcourt.com carries
  ~1.3KB of Customizer "Additional CSS" on every page: it hides
  `.mphb-guest-name-wrapper`, forces `.mphb_sc_search-form` to `display: block`
  (a Safari flexbox workaround), puts `.ui-datepicker` and `.pac-container` at
  `z-index: 99999`, and fully restyles the Google Places dropdown. None of it
  sets an input width. The `pac-container` note matters to the tap diagnostic:
  if a log ever shows it "present/VISIBLE", that z-index is why it would be on
  top of everything.
- **A service row can never be the form.** `serviceRowWrapper()` walks up from
  a service checkbox and its last fallback is `input.parentNode`; until v0.15.0
  nothing stopped that resolving to the `<form>`, which then got the hide class
  and took the whole checkout with it — blank page, no explanation, no booking.
  `tooBigToBeAServiceRow()` is the ceiling: nothing containing the price
  breakdown, the customer details, another service's checkbox, or the form
  itself. **Any future widening of that walk must keep the ceiling.**
- **ONE error ink.** `--dcc-required` is *defined as* `--dcc-error`, not a copy
  of its value, so the asterisks, the validation banner and MotoPress's own
  messages cannot drift apart (they had: #611a15 text, #c62828 border, #bc003e
  asterisks). The banner's ground is WHITE (owner decision, v0.21.0; it was
  #fdecea at 6.29:1, white is 6.55:1). The fields are white with a gold border,
  so the banner's 2px red border is what keeps it distinct — never drop it.
- **Error timing is presentational and never hooks MotoPress's validator**
  (item 1, v0.15.0). The form carries `.dcc_checkout-preflight` from load until
  the first submit attempt (a `submit` event OR a click on a submit control —
  MotoPress submits over REST, so a submit event is not guaranteed), and CSS
  hides error elements that were not in the markup at load. **Everything
  present at load is tagged `data-dcc-preexisting` and left visible**, because
  it may be a real server-rendered error and hiding that strands the guest. An
  admin-only note reports the count. Never replace this with a hook into
  MotoPress's validation.
- **The Services→Extras rename fires on MotoPress's AJAX/REST too** (v0.15.0).
  `is_checkout_page()` returns false for AJAX/REST by design — it also gates
  enqueueing — but MotoPress re-renders the price breakdown over AJAX/REST
  whenever the guest count or dates change, so the first paint said "Extras"
  and every re-render said "Services". `should_rename_strings()` is the widened
  gate, for the string substitution only, and still excludes requests refered
  from wp-admin. `gettext_with_context_` and `ngettext_` are registered
  alongside `gettext_` because `_x()` and `_n()` never fire the plain one.
  DCC-VERIFY: the REST re-render path is reasoned, not observed.
- **Tap targets declare `touch-action: manipulation`** (item 6, v0.15.0), and
  the breakdown expander also carries `-webkit-touch-callout: none`,
  `user-select: none` and `draggable="false"`. Evidence: in the owner's round-3
  log `a.mphb-price-breakdown-expand` failed at 76ms and 77ms while
  `button.dcc_checkout-tax-asterisk` succeeded at 79ms — no single timing
  threshold produces that, but an element-specific gesture recogniser does, and
  iOS arms link-drag and the press-and-hold callout on `<a>` and not on
  `<button>`. The served bundle had zero occurrences of either property, so the
  anchor ran on iOS defaults. **This is a prediction:** anchor presses of
  80-110ms should now click. If they do not, the hypothesis is wrong — and the
  next step is replacing the anchor with a real `<button>`, which is the one
  control in that log that never failed.
- **The breakdown expander is a real `<button>`** (v0.17.0). `hardenTapTargets()`
  replaces the `<a>` node, carrying every class over — MotoPress's handler is
  delegated on `.mphb-price-breakdown-expand` (`mphb.js:1446`) — with
  `type="button"` so it can never submit. **Do not re-add a keyboard handler:**
  a native button activates on Enter and Space, and the one v0.16.0 needed for
  a hrefless `<a>` would toggle twice. Evidence: the tax asterisk (a button) is
  4 of 4 across four tap logs at 64-96ms; the expander failed 15 of 18 clean
  taps as an `<a>` and as an `<a>` without href.
- **A `<button>` does not inherit link colour** (v0.22.0). When v0.17.0 swapped
  the expander's `<a>` for a `<button>`, the bare-control reset's
  `color: inherit` took the table's black and the control stopped reading as
  tappable — for five releases, because nothing asserted the colour. It is now
  `var(--dcc-blue)` (#006bcf) on a DOUBLED class, (0,4,1), because the reset is
  (0,3,1) and would tie and win on source order. **Its hover and focus rules
  were `a.mphb-price-breakdown-expand` and silently stopped matching at the
  same moment** — key on the class alone, never the element, for anything this
  plugin may re-tag. Asserted in `tests/fields/`.
  **`tests/button/` asserted that colour throughout and never caught it**, because
  its fixture was still the `<a>` MotoPress renders. It now carries BOTH forms —
  the `<a>` and the swapped `<button>` — and asserts both. **When this plugin
  replaces an element, every fixture holding the old one is stale**; that is the
  v0.9.0 lesson in a new shape.
- **`setDisabled()` refuses to disable anything that carries money** (v0.22.0).
  The dog Checkout Fields are disabled when the pet question is off, because a
  hidden control still submits — they were posting "10-20 lbs" and
  "short-haired" on no-dog bookings. But the SERVICES rule above still stands
  absolutely: a hidden-but-checked service input must keep submitting or the
  fee stops being charged, silently, with the page looking normal. So the
  helper hard-refuses any control named `[services]` or classed
  `mphb_sc_checkout-service`. **Never route a service control through it**, and
  keep the test that asserts the service checkbox stays enabled and submits.
- **The admin guest-count control writes `_mphb_adults` on the reserved room**
  (v0.22.0, `Admin_Guests`). MotoPress fills that meta with the ROOM TYPE'S
  CAPACITY when an import supplies no count (#18433: 4 for a 2-guest
  Booking.com reservation), so a number there is not necessarily anyone's
  answer. **"Not provided" DELETES the meta — it must never store 0**, or
  /staff/ loses the difference between "nobody told us" and a real count.
  Capacity that cannot be read widens the range rather than capping it, and the
  screen says so. Tested at `tests/admin-guests/` (`php tests/admin-guests/run.php`):
  nonce, capability, range, delete-not-zero, cross-booking isolation, and the
  marker contract below.
  **CONFIRMED on live (2026-09-17):** `_mphb_adults` is present on all 417
  reserved rooms (261 twos, 145 ones, seven fours, four threes), and the chain
  booking → `post_parent` → `_mphb_room_id` → room's `mphb_room_type_id` is the
  one the calendar's SQL already uses. No DCC-VERIFY outstanding.
- **`_mphb_adults_confirmed = 1` IS THE CONTRACT WITH THE AVAILABILITY
  CALENDAR** (v0.23.0), on the same reserved room, written whenever the owner
  submits a count and deleted with the count on "Not provided". Present means
  `_mphb_adults` is a real count whatever its value; absent means the
  Calendar's own capacity-plus-iCal heuristic applies. **It is written even when
  the submitted count equals the stored one** — v0.22.0 returned early there,
  which would have broken the only case the control exists for (confirming
  MotoPress's defaulted 4 as a genuine 4 changes no digit, so nothing was
  written and /staff/ kept saying "not provided"). **Never reinstate an
  unchanged-value early return in front of the marker**, and never let the
  marker outlive the number. The seven speculative booking-meta key names the
  Calendar used to search for do not exist on any booking — that search is gone
  rather than kept as apparent coverage.
- **The "Show all booking fields" checkbox is OURS** (`admin-booking.js`), not
  MotoPress's. It names how many fields it is hiding and hides itself when it
  is hiding none (v0.22.0). If it looks inert on a real booking that is rule 2
  working as designed: on an EXISTING booking every field holding a value stays
  visible whatever the accommodation, so there is often nothing left to reveal.
- **Bare controls carry `.dcc_checkout-bare-button`** (v0.17.0). The site button
  spec matches a plain `button` at (0,3,1), so the swapped expander rendered as
  a full-width blue pill inside the price breakdown — measured at
  `rgb(0, 107, 207)`, 30px radius, before it shipped. The class is what the
  spec excludes; the tax asterisk carries it too, replacing an
  exclusion-by-name repeated in three selectors. **Add the class, never another
  `:not()`.** Asserted in `tests/fields/`.
- **EVERY DOM write in `checkout.js` is idempotent** (v0.18.0): `addClass`,
  `removeClass`, `setClass`, `setAttr`, `setText`, and "decide the set first,
  then write only the difference" for anything that used to strip a class from
  every row and add it back. Never call `classList.add/remove/toggle`,
  `setAttribute` or `textContent =` directly on an existing node — a no-op
  `classList.add` still queues a MutationRecord per spec. Why it matters: the
  pipeline's no-op re-run produced 42 records on the fixture (35 changed
  nothing) and ~100 on the live page, mid-tap, in every tap-log round, on
  inputs and on the expander alike; iOS decides click-vs-hover by watching for
  content changes around a tap. **A no-op re-run now records ZERO mutations and
  `tests/breakdown` fails on one.** That test is the guard; keep it.
- **The observer never installs a timer during a touch** (v0.18.0). WebKit
  tracks DOM timers installed while handling a touch and watches what they do.
  While `fingerDown`, the MutationObserver callback only sets `onTouchUp`; the
  touch-up handler schedules the run 450ms later. Asserted.
- **The restructure pipeline never runs while a finger is down** (v0.17.0).
  `observeReRenders()` holds while a touch is live and for 400ms after it
  lifts, on a 500ms debounce (was 150ms), with a 3s ceiling so it cannot be
  starved. Evidence: every press in tap-log rounds 3 and 4 that carried the
  pipeline's ~100-attribute burst mid-tap failed, 6 of 6. **Any new work
  scheduled off that observer must respect the same gate** — `touchSettling()`.
- **(v0.16.0, superseded but still in force) The expander is not a hyperlink.**
  `hardenTapTargets()` removes its `href` (kept in `data-dcc-href`) and gives
  back `role="button"`, `tabindex="0"` and Enter/Space activation. iOS arms its
  link recognisers on the HREF, not on the tag. MotoPress's handler is
  delegated on the class (`mphb.js:1446`) so it still fires, and its own
  `preventDefault()` shows the href was never navigated. **Do not "restore" the
  href as tidy-up**, and if the expander is ever rebuilt, keep the re-run from
  the MutationObserver — a rebuilt anchor comes back as a link.
- **Round 4 killed the timing hypothesis** (v0.16.0). With 0.15.0's gesture
  hints installed the expander clicked twice at 82ms — in round 3 nothing above
  27ms ever had — but still lost taps at 63ms, 79ms and 81ms. A 63ms failure
  beside an 82ms success rules out any duration threshold. **The live lead is
  now sticky `:hover`**: round 4's two successes were each the SECOND tap of a
  pair. The round-5 diagnostic reads `el.matches(':hover')` at touchstart to
  settle it. If that is the mechanism, the hover rule responsible is NOT one of
  this plugin's (all of ours are gated behind `hover: hover`) — look at the
  theme and at MotoPress's own CSS.
  **Eliminated on the live page (measured 2026-09-17 — do not re-chase):**
  Bravada's document `mousemove` is never bound here (`mousedir()` returns
  unless `<body>` has `.bravada-landing-page`); this plugin's only `mouseenter`
  is on the asterisk and gated by `pointerHasHover()`; the served 474KB bundle
  AND the 17 inline `<style>` blocks (the Elementor kit is inline, not in the
  bundle) contain exactly two ungated hover rules that can match the anchor
  chain — `a:hover{color:#000}` and `a:hover,a:active{outline:0}` — with no
  transition on it; no Elementor hover/motion settings are stored on the
  container or the widget; no focus handlers in `checkout.js` or `mphb.js`; and
  SpeedyCache's instant.page (document-level mouseover + touchstart, treating
  `href="#"` as prefetchable) was switched off site-wide by the owner on
  2026-09-16 and is gone from the served page.
  **Unconfirmed hypothesis, labelled as such:** WebKit's iOS content
  observation — a synthetic mousemove precedes the click, and if content
  changes, a transition starts, or a short DOM timer is installed during it, no
  click is dispatched (webkit.org/blog/5610). It fits the alternation and the
  button's immunity, and v0.17.0's pipeline hold targets it — but it is NOT
  confirmed on this site, and round 4's press 6 (failed, no mutation burst,
  colour-only hover) is not explained by it or by anything else found.
  **SpeedyCache serves a stale bundle after every install.** It handed out
  0.15.0 after 0.16.0 shipped, and did the same a release earlier. Purging is
  part of every install now — a log that disagrees with the source may simply
  be the previous build.
- **Every tap log must identify its own build.** Round 4 arrived with no
  version and could not be attributed without asking, which cost a round. The
  diagnostic now stamps `DCC_CHECKOUT_VERSION` in its header and records, per
  press, whether the touched element is still a link, its `draggable` state and
  its computed `touch-action`. Presses are numbered and the 900ms verdict line
  names its own press — it fires on a later press's clock, which is why round 4
  appeared to say "+5ms NO CLICK".
- **The published standard is the source of truth, and it drifted once.**
  Until v0.13.0 `checkout.css` styled only `select` and the plugin's own
  injected pet fields, while `Custom Checkout - Field Standard.css` — which is
  generated from it and is the standard for the other two plugins — declared
  the full pill for text inputs too. MotoPress's own First Name / Address /
  Apartment fields were therefore sized by the THEME for several releases.
  **After editing either file, diff the two.** Three of those declarations are
  load-bearing, not cosmetic: `width: 100%` (a field narrower than its wrapper
  leaves a dead strip that looks tappable and is not), `min-height: 44px`, and
  `font-size: 16px` — **under 16px iOS Safari zooms the whole page on focus**,
  which moves everything under the finger.
- **Nothing on the checkout may write layout on a bare `resize` event.** On iOS
  `resize` fires when the URL bar collapses during ordinary scrolling.
  `matchFileFieldWidth()` did exactly that on a 150ms debounce, landing just as
  the page settled and the guest tapped. It now ignores height-only resizes and
  skips no-op writes. Any new resize handler must do the same.
- **MOBILE MULTI-TAP: CLOSED (v0.18.0, confirmed on the owner's phone
  2026-09-17).** Round-6 log, build stamped 0.18.0: 8 of 8 stationary presses
  clicked on the first tap — the breakdown expander (which had failed 15 of 18
  across rounds 1–4), three text inputs, empty space, and the asterisk four
  times, at 42–61ms. The only three presses without a click travelled
  100–180px and were correctly cancelled as scrolls. Mutations mid-tap fell
  from ~107 to exactly the diagnostic's own log lines (4 per press; 5 on the
  press that also logged a MISSED line; 3 on one cancelled before touchend) —
  the plugin contributes zero.
  **The two changes that fixed it, and they are both load-bearing:**
  (1) v0.17.0 — the expander is a real `<button>` (bare-control class, no
  keyboard handler); (2) v0.18.0 — every DOM write is idempotent, so a
  pipeline re-run with nothing to do records ZERO mutations, and the observer
  installs no timer while a finger is down. **Neither may be "simplified"
  away; the zero-mutation assertion in `tests/breakdown` is the guard.**
  Mechanism, now supported rather than hypothesised: iOS content observation —
  the page was rewriting ~100 attributes on a 150ms timer after every
  breakdown change, which landed inside the next tap and read to Safari as
  hover-revealed content, so no click was synthesised. That also explains the
  round-4 fail→success alternation (a successful toggle scheduled the burst
  that killed the following tap) and the button's apparent immunity (its own
  handler never re-rendered the breakdown). `ALREADY :HOVER` was logged on
  every press in round 6, including all eight successes, so sticky hover is
  ruled out as the cause.
  The diagnostic (`?dcc_tap_debug=1`) stays — admin-only, flag-gated, zero
  cost — as the instrument for any regression.
  *History follows, kept for the record.*
- **Mobile multi-tap: cause partly identified (v0.13.0).** Gating the hover rules (v0.11.0) fixed
  desktop and did not fix mobile, so sticky hover is not the whole cause. Two
  in-plugin candidates were tested in v0.12.0: a self-feeding MutationObserver
  loop was refuted, and the tax asterisk's 44x44 box was measured overflowing
  its 20px row by 12px each way (real, but its neighbours are static text, so
  not the page-wide cause). The untested lead is Elementor's two delegated
  document-level click handlers bound to `a, [data-elementor-lightbox]`
  (frontend.js:1102 and :1254) — but the owner's own enumeration came back
  NEGATIVE: /submit-booking/ and /cottages/ carry identical document- and
  body-level click handlers, so there is no extra handler on the misbehaving
  page. What his tap log did establish: nothing intercepts clicks (no
  defaultPrevented anywhere, every click that fired reached the document) — the
  browser is not GENERATING the click. The dead-strip defect above explains the
  lost taps that landed on a wrapper; it does NOT explain three stationary taps
  on an input that produced no click. Still open, and the round-2 diagnostic
  measures the remaining candidates directly (page movement, page zoom, node
  replacement mid-press, Places' pac-container).
  **What round 2's log established (v0.14.0).** The page does NOT scroll during
  a press — every press reported `page still`. What moves is the VIEWPORT: the
  iOS URL bar swings it 108px (393x665 / 393x712 / 393x773), and every
  pointercancel press contains one of those resizes. One press measured
  `MISSED input#mphb_first_name ... off by 0px x, 39px y` — dead on
  horizontally, 39px out vertically. Three of six failures in that log are the
  URL-bar resize. The other three are not: two were clean stationary presses
  that produced no click at all, one of them with 90 mutations. Those three are
  what is still unexplained. Baseline measured on the live page: 0 mutations at
  rest and while scrolling, 1 per `resize` (Elementor writing
  `data-elementor-device-mode` on `<body>`).
  **Two reading errors the logger itself introduced, fixed in round 3:** iOS
  splits one tap into a touch block and a synthesised mouse block ~300ms later,
  and round 2 opened a new press for the second half — so the verdict line
  fired hardest on the taps that WORKED. And `<body>` is an ancestor of
  everything, so Elementor's attribute write counted as churn on every touched
  path. Read any round-2 log with both in mind.
- Field geometry (tap targets) is asserted in real Chromium at 390x844 with
  touch emulation, and the width cap at 1280, at `tests/fields/`
  (`npm install && npm test`). Run it after touching any field rule.
- The tax footnote's width behaviour is asserted at `tests/footnote/`
  (`npm install && npm test`).
- Price-breakdown and services behaviour are covered by jsdom fixtures at `tests/breakdown/`
  (`npm install && npm test` there). Run them after touching
  `restructureBreakdown()` or anything else that moves a figure on the
  checkout — that code decides what a guest is told they owe.
- Bump the version in all three places whenever behaviour changes:
  the `Version:` header, `DCC_CHECKOUT_VERSION`, and readme `Stable tag`.
