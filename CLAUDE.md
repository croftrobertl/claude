# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Standards

**Set by the Website Director, 2026-10-29. This is the standard for every task
on this plugin from now on, not advice for one release. Read it before the
site context, because it decides what "done" means.**

### Who you are

The world's best hotel general manager and head concierge: the person who runs
a small five-star property where guests feel known before they arrive. The
Forbes Five-Star service standards, the Ritz-Carlton Gold Standards and Danny
Meyer's "enlightened hospitality" are the FLOOR, not the aim. Also a
hospitality copywriter who writes in the family's own warm, plain voice —
never corporate.

### The bar

A guest arriving in the dark at 10 pm, tired, one hand on a suitcase, finds
what they need on their phone in ONE TAP. They never have to call to ask
something the guide could have answered. Anticipate the question before it is
asked.

### How to work, in this order

1. **The guest's journey.** Before arrival, arrival night, during the stay,
   checkout, after. For each moment: what does the guest need, on a phone,
   maybe with poor signal?
2. **Most-asked first.** Wi-Fi, check-in and check-out, parking, the dock,
   trash, who to call. Nothing important is buried.
3. **True or cut.** Every fact has a source and a date or it does not ship
   (the dcc-truth-check standard). Never invent local detail, and never
   attribute an observation to Rob or staff unless they actually said it.
4. **Service recovery.** When something goes wrong, the Front Desk report
   reaches staff fast, and the guest is told plainly what happens next.
5. **Polish.** Warm words, clear hierarchy, large tap targets, nothing to
   pinch-zoom.

### The rules that never bend

- Secrets stay secret. The Wi-Fi password is never visible logged out or in
  public pages. Guest and staff views are kept strictly apart.
- Guest data is sacred. GET-only on live.
- Policy lives in ONE place: link to /cancellation-refund-policy/, never
  summarize it.
- Error messages appear only after the guest makes the mistake, never on load.
- WCAG 2.2 AA: 44 px tap targets, real contrast, screen-reader labels.

### The definition of done — check before Rob sees anything

Report ONE LINE PER CHECK, every release:

- **The arrival test:** walk the guide as a first-time guest at 390 with real
  taps. Every top question is answered within one tap.
- **Every fact traced** to its source.
- **Secrets:** nothing secret appears logged out, in page source, or in a
  cached copy.
- **Emails** render in Gmail and Apple Mail.
- **768 and 1440** checked too.
- **Untouched:** nothing outside the change moved.

Titles centered, Title Case, American spelling.

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

## DCC Guest Guide — public (prospect-facing) mode

Since v0.10.0 the guide renders in two modes from ONE definition.

- Each section carries `section_audience`: `guest` (default) / `public` / `both`.
- `guide_mode` (`full` / `public`) selects the render path.
- `Widget::apply_public_mode(array &$s)` is the single choke point. It runs at
  the top of `render()`, BEFORE anything reads the settings, because every
  consumer draws from `$s`: menu tiles, detail popups, `render_item()`'s
  per-item report button, `render_more_menu()`, the review prompt, and
  `build_search_index()` — whose output is inlined verbatim into `data-config`.
  Filter the source, not each render site.
- **Fail-safe is load-bearing:** a section is kept only on an explicit `public`
  or `both`. Anything else — `guest`, empty, missing key, legacy section, typo
  — is dropped. Guest content must never become public by omission. Do not
  invert this test.
- Public mode force-disables `enable_problem_report`, `enable_per_item_report`
  and `enable_checkout_review` by writing the settings off, so a render path
  added later inherits the exclusion instead of quietly reintroducing it.
- `Widget::mode_for_audience()` maps the shortcode attribute to a mode and is
  deliberately asymmetric: only an explicit `full`/`guest` returns the guest
  guide; every other value (typo, wrong case, empty, non-scalar) returns
  `public`. Do not "simplify" it to `=== 'public' ? public : full` — that is
  what it was, and `audience="Public"` published the Wi-Fi passwords.
- Two front doors, ONE render path: the `Widget_Public` widget
  (`class-widget-public.php`) and the shortcode both call
  `Plugin::render_source_guide()`. Add behaviour there, not in either caller.
  `Widget_Public` hard-codes mode `public` — it has no input that could select
  the guest guide.
- `render_source_guide()` also enqueues the SOURCE post's Elementor stylesheet.
  Without it the guide renders with plugin defaults, because the host's style
  controls compile into the source page's own CSS file.
- The shortcode `[dcc_guest_guide audience="public" source="POST_ID"]` reads the
  source page's Elementor element data and re-renders that same element with the
  mode overridden. There is no second copy of the guide — do not "fix" this by
  duplicating sections into options or a CPT.

### A `template` item's content is NOT this plugin's

Each item has `content_source` (class-widget.php:1117), a SELECT of exactly two
values: `wysiwyg` (the default, `item_content`) and `template` (`item_template`).
A template item renders through `render_template()` — whatever Elementor
produces for the linked template, echoed verbatim.

For such an item the plugin owns the CHROME only: the title, the checkbox, the
read-aloud button, the per-item report button and the utils row. It owns
nothing inside the template. Sizing, aspect ratio, embeds and third-party
widgets in there are Elementor questions, not plugin questions, and no control
in `class-widget.php` reaches them.

Worth knowing because the symptom does not say so. A "the video is broken"
report was chased through `normalize_video_url()` and the `.dccgg-media` ratio
rules in v0.20.0 before the item (`_id 094bd49`, "Tour Video") turned out to be
`content_source: "template"` — its item_content was unrelated text, and the
video was a Facebook widget inside the linked template. The per-video ratio
control built for it is correct and worth keeping for real dccgg videos, but it
could never have touched that one. So when an item misbehaves in a way the
plugin's own controls cannot explain, check `content_source` FIRST.

`Plugin::handle_search_index()` is anonymous (`wp_ajax_nopriv`) and returns a
guide's full index, so it verifies post visibility before answering — without
that check it is a way to read a private or password-protected guide. Keep that
guard if you touch the endpoint.

`Plugin::handle_ai_query()` (Gemini, anonymous) builds its guide context on
the SERVER with `Widget::build_ai_context()` from post_id + widget_id, behind
the same visibility test, the AI switch and public mode. It must never read
a `context` from the request: until v0.23.5 it did, and that made it an open
proxy to the Gemini key. `tests/ai-query.test.php` and
`tests/ai-query.mutations.py` guard this.

`Widget::render_more_menu()` emits ONE of two things from the same face: with
exactly one resolved slot a real `<button class="dccgg-more … dccgg-more--direct">`
that carries the item's own action class and `data-report-section`, so the
existing delegated handlers drive it with no per-instance listener; with two or
three, the `<details>` popover as before. `.dccgg-more--direct` is the
behavioural marker the JS scopes on, `.dccgg-more--fd` is the round face — keep
them separate, or the legacy `pill` shape loses its styling. The face's reset
is (0,4,0) by doubling the class, because the theme's
`.site .content .entry button` is (0,3,1) and reaches the hub (the popup header
is portaled out of it). Accessible name = the visible label; `aria-label` is
emitted only when there is no label. `tests/front-desk.test.php`,
`tests/front-desk.ui.js` and `tests/front-desk.mutations.py` guard this.

`Icons` (class-icons.php) bundles eight section glyphs and emits them as ONE
inline `<symbol>` sprite per page, after the tiles, because the used set is only
known once they have rendered; `<use>` resolves by id after parsing, so order
does not matter, and the sprite stays in the page rather than the stage, which
is portaled to `<body>`. `Icons::render()` prints NOTHING for an unknown value
from our own library — never an empty `<svg>` or a dangling `<use>`. Glyph data
is generated by `tools/build-icons.py`; edit `tools/icon-glyphs.json` and the
template, never `class-icons.php` directly. The sticker colour is written by
`Widget::sticker_style()` from section_key onto BOTH the hub tile and that
section's popup mini tile — one source, so they cannot drift.
`tests/stickers.test.php`, `tests/stickers.ui.js` and
`tests/stickers.mutations.py` guard this.

Test harnesses must honour `DCCGG_PLUGIN_DIR`, including any file they READ:
`_render-guide.php` and both PHP suites' `plugin_file()` do. Twice now a
mutation run reported healthy survivors only because the harness was loading
the real plugin instead of the mutant.

The tile's tap colour comes from the HOST THEME, not this plugin and nothing
stored: a tile is a `<button>`, and `.elementor-kit-331 button:hover,:focus,:active`
(0,2,1) outranks `.dccgg-tile{background:…}` (0,1,0). v0.24.2 neutralises all
three states and supplies the colour itself through `.is-tap`, applied by
`wireTileTap()` on touchEND — not touchstart, because a finger that rests then
scrolls cannot be told from a tap while it is still down. `--dccgg-sticker`
colliding with the tap colour is marked server-side by `Widget::sticker_flags()`
(by value, not by naming Review Us). `background` must stay OUT of the
`.dccgg-tile` transition or the colour fades. The pop-up header is STICKY, so
space under the Back row has to be its own padding, not a margin: content
scrolls under a margin. And the title heading must never carry `overflow:hidden`
— it clips the mini tile's shadow into a grey square; the ellipsis belongs on
`.dccgg-detail-title-text`. `tests/phone-fixes.ui.js` and
`tests/phone-fixes.mutations.py` guard all of this.

WebKit is NOT installed here and cannot be fetched (the egress proxy refuses
cdn.playwright.dev and the Microsoft mirror). Touch work is therefore verified
in Chromium with touch emulation only; say so rather than implying Safari
coverage. One mutant — removing `.dccgg-tile:active` — is unreachable in
Chromium because a pointer press always sets `:hover` too; it is listed in the
runner's UNREACHABLE block with that reason instead of being dropped.

`handle_report_problem()` carries four guards added in v0.24.3: a hidden trap
field, a 3s dwell floor (both answer SUCCESS, so a script learns nothing), a
site-wide `dccgg_report_daily` cap that tells a real guest to phone instead of
failing silently, and the same post-visibility test the reveal and search-index
endpoints make. Every tag value is esc_html'd into the HTML body except
{report_text} (nl2br+esc_html) and {page_url} (esc_url); the subject is
stripped of markup and newlines and capped. Do not add a tag to that array
without checking the loop still escapes it.

Opening a section focuses INSIDE it: the panel is revealed inside
withViewTransition() and the stage is laid out only once the modal is up, so
the first attempt finds nothing visible — hence the rAF + timeout retry. Before
v0.24.3 focus ended on <body> for EVERY section, not just the first. Two guards
do this (scoping to the open panel, and a getClientRects visibility test);
either alone is enough, which is why the mutation runner lists them as
equivalent rather than pretending to kill them.

Where that focus LANDS depends on how the section was opened, and v0.24.4
changed it: a pointer or touch open focuses the section's own `<h2>`, which
carries `tabindex="-1"` — a focus target that is not a Tab stop, so a screen
reader reads the title and nothing is painted. A keyboard open still focuses
Back, with its ring. The two are told apart by ONE capture-phase document
click listener (`wireOpenIntent`): `e.isTrusted && e.detail === 0` is a key,
anything else is a finger. isTrusted is load-bearing — a scripted
`element.click()` also reports detail 0, and that is why the 0.24.1 audit
reported a ringed, coral Back button that a real finger never produces. Drive
these cases with page.tap()/page.click()/keyboard, never an in-page .click().
Because the heading is inside the stage but absent from the Tab trap's
focusables list, the trap has an `onHeading` branch; without it Shift+Tab from
the heading walked out of the modal, since the heading is the panel's first
element.

The host kit's `button:hover,:focus,:active{background-color:#F08080}` (0,2,1)
reaches far fewer plugin buttons than it looks: the .dccgg-btn family is
already (0,4,0) and the item-row controls were covered in v0.16.0. Measured by
forcing each state on every button the guide really renders, exactly eight were
still exposed and are fixed in v0.24.4: .dccgg-more-item, .dccgg-sos-fab,
.dccgg-search-result, .dccgg-search-still-stuck, .dccgg-search-dym-chip,
.dccgg-btn-text, .dccgg-gallery-thumb, .dccgg-video-poster. Each is re-asserted
STATELESS at (0,4,0), which retires all three kit states at once, with its own
hover put back inside (hover:hover) and (pointer:fine). Two constraints shape
those selectors: the audience split in build-min.sh moves any selector matching
.dccgg-(report|review|ai-|sos|more|btn-send|btn-cancel) to the guest bundle and
counts `:is(a, b)` as ONE selector, so a guest-only class may never share an
:is() with a public one and .dccgg-report-dialog may never host one; and
`color` on the two image buttons is `inherit`, since their captions set their
own. `tests/focus-colour.ui.js` enumerates the DOM rather than a kept list, and
`tests/focus-colour.mutations.py` guards it. Review Us's sticker IS this same
coral by Rob's palette — exclude stickers from any "nothing is coral" test
rather than treating it as a defect.

The guide's primary is the SITE's blue, `#006BCF`, since v0.24.5 — it used to
be `#0f6dbf`, a shade apart from everything else on doracanalcourt.com. One
token does not cover it: there are `var(--dccgg-primary, …)` fallbacks, a
`@media print` block that no token reaches, the coastal preset in BOTH
`widget.css` and `Widget::theme_presets()`, the manifest `theme_color` and the
`<meta name="theme-color">` in `class-plugin.php`, and the confetti palette in
`widget.js`. `tests/site-blue.test.php` checks every one of those by meaning
rather than by line number. Three blues are deliberately NOT this one and must
survive: the coral hover `#f08080`, dark mode's `#5fa8e8` and the minimal
preset's `#0066ff`. No Elementor control defaults to a blue, so nothing is
pinned into a page's own stylesheet — but a control the host SET still wins,
which is a live question, not a packaged one.

Editor-only code lives in `assets/js/widget-editor.js` since v0.24.5 (Welcome
Pack, Export / Import, the editor toast), registered as `dccgg-widget-editor`
and enqueued ONLY by `enqueue_for_editor()` and `enqueue_for_preview()`. Core
keeps two things on purpose: `isElementorEditorPreview()`, because
`shouldUseDetailModal()` needs it on the front end (v0.9.7.24 — a portaled
fixed modal is invisible in the editor canvas, so the guide falls back to an
inline reveal), and a no-op `editorPreviewToast()` that forwards to
`window.__dccggEditorToast` once the editor bundle installs the real one. That
hook is the whole contract between the two files; core must never reach into
the editor bundle any other way.

The Front Desk form lands on its own `<h3>` (tabindex="-1"), not on a field:
focusing a text input opened the iPhone keyboard over the form and skipped the
first question. Same shape as a section pop-up since v0.24.4. Tab from there
goes to the Close button, then the first question — that is source order, not
a bug. The Voice Search mic is in the v0.21.0 44x44 `::after` pass but
deliberately NOT in its `position: relative` rule: the mic is already
`position: absolute` inside the search bar at (0,1,0), and relative at (0,2,0)
would win and drop it out of the field. `tests/site-blue.test.php`,
`tests/front-desk-form.ui.js` and `tests/site-blue.mutations.py` guard all of
the above.

The front end is FOUR kinds of file since v0.25.0, and a test harness that
inlines only `widget.js` gets a guide whose Front Desk button does nothing —
which looks exactly like a regression and is not one. `tests/_bundles.js` is
the one place that knows the layout; browser suites go through it.

  `widget.js`          core, always.
  `widget-guest.js`    the Front Desk form, the review prompt, the voice
                       concierge and the AI answer — the four things
                       apply_public_mode() switches off, so only the FULL
                       guide loads it. Enqueued on the NOT-public branch of
                       render(), beside enqueue_guest_css().
  `widget-editor.js`   editor only (v0.24.5).
  `widget-<name>.js`   conditions / gallery / wizard / video, fetched by core
                       at init and ONLY when the page holds the element in
                       `CHUNKS`. Not registered with WordPress at all — no
                       enqueue hook can see markup that does not exist yet —
                       so the server only localizes `dccggChunks` with the
                       base URL.

`enqueue_guest_js()` deliberately does NOT consult `split_guest_css`. That
setting chooses one stylesheet or two, and with it off `widget.css` still
contains every guest rule, so nothing is lost. The script split is structural:
the code physically left `widget.js`, and a full guide that skipped the file
would render a dead Front Desk button.

THE CONTRACT, and it is the only way across: core publishes `window.DCCGG_CORE`
(eight helpers for the guest bundle, four more for the chunks) and the guest
bundle publishes `window.DCCGG_GUEST` with exactly five entry points, each
called behind a `window.DCCGG_GUEST &&` test. Neither file may reach the other
by name; `tests/bundle-split.test.php` fails if one does. Load order is NOT
assumable — SpeedyCache combines and defers scripts on this host — so the guest
bundle boots immediately when core is already there and otherwise leaves
`window.__dccggGuestBoot` for core to call. `applyGuest()` refuses a root it
has wired, because wiring twice makes one press send two reports.

Chunks load at INIT, never on a tap. v0.9.7 fetched on first use and the host
had to tap three times before anything happened — the first tap started the
download and was swallowed. `applyChunks()` also uses a chunk that is already
registered rather than fetching it, since a combiner may have folded them in.
The service worker precaches the guest script and all four chunks: it cannot
know which a guide needs, and an offline guest would otherwise find the Front
Desk form, the gallery and the video inert.

v0.25.1, and the lesson under all five of its items: MEASURE THE ELEMENT THE
HOST MEASURED. Four of the five reported faults were not what they looked like.

  The checkbox "24x29" and read-aloud "28x28" are the inner visual boxes —
  .dccgg-item-check-box is 24px with 2px borders, and the read-aloud icon is
  28px. Both buttons already had a 44x44 ::after from v0.21.0 and both pass a
  hit-test 20px off centre. What v0.25.1 actually adds is the whole title ROW
  as a tick target, and a per-item name on each read-aloud button.

  The checklist memory was reported missing and was never missing. It writes
  `dccgg:check:<widgetId>:<stayKey>` to localStorage and reads it back on
  load — section B of `tests/sheet-polish.ui.js` ticks through the CHECKBOX
  rather than the new row target precisely so it passes on 0.25.0 too, which
  is what proves the point. It had no expiry in v0.25.1 — a 48-hour cap was
  discussed and NOT added then, because nothing was broken. v0.25.2 added
  expiry as its own release, on Rob's instruction, with the two-branch rule
  described further down.

  The "⌘K on every platform" was already platform-aware (widget.js swaps in
  "Ctrl K" off a Mac) and already hidden under `@media (hover: none)`. Only
  the tests were missing.

  The bold body copy was real, and its cause is the PORTAL. The v0.21.0 rule
  anchored on `.dccgg-root` alone, and `.dccgg-stage` is moved to <body> when
  a section opens — so the rule was inert in the one place the copy is read.
  Measured: closed 400, open 700. Fixed by adding the stage and dialog hosts
  AND by declaring `--dccgg-fw-body: 400` on all three hosts, because
  font-weight inherits and the theme sets `html { font-weight: 700 }`.
  Specificity is NOT what decides this: a rule matching the element at any
  specificity beats an inherited value, which is why one class is enough.
  400 is the Wildlife Guide's `--dccwl-fw-body`, for consistency.

Two things in the v0.25.1 row handler are worth not re-deriving. Read-aloud
calls `e.stopPropagation()` in its own handler, so it never reaches the
document-level row listener at all — the exclusion list is there for the
PER-ITEM REPORT flag, which does not. And the `checkable !== '1'` test is
redundant against the `!btn` guard below it; both are kept, and the mutation
runner lists the pair as equivalent rather than pretending to kill them.

The tile grid is `repeat(4, minmax(0, 1fr))` from 600px up since v0.25.1,
replacing an auto-fit that gave a different count at every width (2 at 600,
3 at 768 — the 3,3,2 the host reported — 4 at 1024, 5 at 1440). Two measured
consequences, both accepted: desktop drops from five tiles a row to four, and
at exactly 600px tiles are 127px with the longest label on two lines. The
mobile portrait rule had to become `max-width: 599.98px`, because at exactly
600 both rules matched and the later one won — "four columns from 600px up"
silently showed two until that overlap was removed. `minmax(0, 1fr)`, not the
tile-min: a grid item's automatic minimum is its content, so a 200px floor
overflows the row instead of letting tiles shrink.

`tests/sheet-polish.ui.js` and `tests/sheet-polish.mutations.py` guard all of
the above. Its kit block includes a width for `.dccgg-item-report .fas`,
because Font Awesome is absent here and without it that button measures 12x8
and cannot be tapped — a property of the harness, not of the guide.

Checklist ticks EXPIRE since v0.25.2, by two rules, because one window cannot
fit both cases: a flat 48 hours erases a seven-night guest's ticks on their
third morning, and no expiry at all leaves a departed guest's ticks waiting for
the next one.

  a checkout date is known  -> end of the day AFTER checkout, PROPERTY time
  anything else             -> 48 hours after the LAST tick in the set

"After the last tick", not after each: ticking keeps the whole list alive,
which is what someone working through a checklist expects. An entry is
`{ t: <ms> }`; unticking DELETES it rather than storing false, because a false
entry keeps its timestamp and would go on holding the set alive. A pre-v0.25.2
bare `true` is stamped with now rather than discarded, so upgrading mid-stay
costs nobody their ticks. Pruning happens when the sheet READS the store —
there is no background sweep.

WHERE THE CHECKOUT DATE COMES FROM, and this needed checking rather than
assuming: `stay` is opaque to this plugin. Its only documented shape is the
`jane-2026-06` the review template parses a first name out of, which carries a
MONTH and no day — so a stay alone is NOT a checkout date. The sources, in
order, are `?out=YYYY-MM-DD` and then a full date found inside `?stay=`.
`out` is separate on purpose: the storage key contains the stay, so changing
the stay format to carry a date would change the key and silently discard every
tick the guest had already made.

The property clock is Eastern whatever the phone is set to — the cottages are
in Florida and checkout is a time there. `endOfPropertyDay()` resolves the UTC
offset TWICE: the offset depends on the instant, and on a DST boundary the
first guess lands in the wrong one. 1 November 2026 is a 25-hour Eastern day
and is in the suite for that reason. `tests/check-expiry.ui.js` stubs Date
before any script runs and sets the DEVICE timezone to somewhere that is never
Eastern, so a case cannot pass by the two happening to agree;
`tests/check-expiry.mutations.py` guards it.

v0.26.0 is the APP SHELL ("A1 · Postcard Hero"), and it is OPT-IN. One
SELECT value — Menu layout → App shell — turns on the hero, the Front Desk
pill, the two-up tiles with their summary line, the "Tavares Now" strip, the
bottom tab bar and the sheet polish. A guide on any other layout renders not
one byte of it, which `tests/app-shell.test.php` section A checks class by
class. /guest/ is on `grid`; /test/ is where this is built.

THE STAY CARD NEVER GUESSES, and `?stay=` is not what proves a booking. It is
free text (CLAUDE.md above: `jane-2026-06`, a month with no day) and anyone
can type it, so it stays what it has always been — the checklist's storage
key — and feeds the hero nothing. What proves a booking is `?t=<id>.<hmac20>`,
signed with `dccgg_stay_secret` (generated on first MINT, never on activation)
and resolved by `DCCGG\Stay` against the `mphb_booking` post. The reply holds
the cottage label and the two dates and nothing else — no name, no email, no
price — and a booking that is not `confirmed` resolves to nothing, because a
cancelled stay must not greet anyone. Links are minted at Settings → DCC Guest
Guide → Guest Links, which prints the `?t=…` SUFFIX rather than a whole URL:
the guide lives on a page this plugin does not own.

THE GREETING AND THE DATES ARE WRITTEN BY THE BROWSER, and that is forced, not
stylistic: /guest/ is page-cached, so a server-rendered "Good morning" would
still say so at ten at night — to the very guest the brief is about. The HTML
carries the plain welcome, which is always true, and the rest arrives after.
Every instant is formatted in `America/New_York`: check-out is 11:00 AM in
Florida whatever the phone is set to. `tests/app-shell.ui.js` sets the DEVICE
timezone to Tokyo or Honolulu so no case can pass by the two agreeing.

FOUR OF THE BRIEF'S SHEET BULLETS, AND ONLY TWO WERE MISSING. Swipe-down has
been in core since v0.12.5 (`wireSheetDrag` in widget.js: under 600px, within
60px of the sheet top, 140px or a flick over 0.5px/ms, with the pointercancel
and Safari-touchmove cases already handled) and the focus trap since
v0.24.3/.4. v0.26.0 adds the GRAB HANDLE, so the grip is visible, and the BACK
BUTTON, via a MutationObserver on `html.dccgg-detail-open` that pushes one
history entry per open and rewinds it on close. A second drag handler on the
same stage would have fought the first; widget-app.js says so where one would
otherwise be written.

THE TAB BAR IS FIXED, AND STICKY WAS TRIED FIRST. Sticky only sticks inside
its own scrolling box and the bar is the widget's last child, so it never
lifted off the end of the page — measured at 390, it sat at y=833 of an 844
viewport only because the page happened to be that long. Fixed, with
`padding-bottom` reserved on the root, and `display:none` while a sheet is
open because the sheet is portaled to <body> and owns the screen. Labels are
14px FIXED, not em: a theme that scales text down must not be able to take
them under the floor the brief sets.

TILE SUMMARIES ARE SOURCED, not generated. `Widget::app_tile_summary()` takes
the host's authored line; failing that it counts the section's real items and
names them with the host's noun ("3 networks", "7 steps"); failing that it
says nothing — an empty tile is honest and "0 items" is noise. The checkout
tile leads with MotoPress's own check-out time, and drops it when MotoPress
reports none.

A PRE-EXISTING 25px OVERFLOW AT 390, found while measuring this and NOT caused
by it: the hub's round ⋯ Front Desk button overflows the harness viewport by
25px on the GRID layout too, on 0.25.2. The suite therefore pins "the app
shell adds no overflow of its own" by measuring both layouts, rather than an
absolute number that would be measuring an older bug. Worth checking on live
before anyone calls it a regression — the harness gives body a 16px gutter the
real theme may not.

`tests/popup.test.js` has ONE failing assertion that is also not this release:
"the checklist Reset is 71x40" measures 69x40, on 0.25.2 as well as 0.26.0
(verified by running the suite against a pristine archive of HEAD). Pixel
drift in the harness, not a guide change.

Rob's alignment rule (titles centred; only a MULTI-sentence paragraph
left-aligned) is implemented the way the Cottage Selector implements it —
`isMulti()` tests the paragraph's own TEXT and adds a class, so a host who
rewrites a note gets the right alignment without anyone editing CSS. See
`dcc-cottage-selector/assets/js/selector.js` (0.54.0) for the original.

Every string the form shows is an Elementor control with a `'default'`, which
Elementor writes into `_elementor_data` the moment a page is saved. So changing
a packaged default does NOT change a page that already exists — page 4645
carries its own stored copies. The same trap as `reveal_memory_hours`. Change
the default AND tell the host which stored values to update.

Remembered Wi-Fi reveals carry `t` (when they were kept) as well as `exp`, so
SHORTENING reveal_memory_hours expires older copies on the next visit. A copy
written before v0.24.3 has no `t` and its age is reconstructed from
`exp - 168h`, the window the live site had. reveal_memory_hours lives in the
`dccgg_settings` OPTION, not on page 4645 — a stored value beats the packaged
default, which is 48 from v0.24.3.

`Widget::config_emergency_contacts()` gates the data-config contact list on an
emergency section being present in THIS render; apply_public_mode() drops a
guest-only Emergency section, so the public page gets none. Don't emit that
list unconditionally again — it is the host's personal phone numbers.

`widget.js` registers `frontend/element_ready/{dccgg_guide,dccgg_guide_public}.default`
so the Elementor editor's re-rendered roots get init(); per-root document/window
listeners go through `bindGlobal(root, …)` so `disposeStaleRoots()` can release
them. Use bindGlobal for any new global listener inside a wire*() function.

Guide auto-detect (`discover_guide_source`) must never return the page doing
the asking, and its meta LIKE searches the full token `"widgetType":"dccgg_guide"`
— a bare `dccgg_guide` also matches `dccgg_guide_public`. See
`tests/discovery.test.php`.

Offline support is opt-in per widget (`enable_offline`, forced off in public
mode). The manifest and service worker are served from the site ROOT via
`/?dccgg_sw=1` so the worker can claim a scope like `/guest/`; one served from
the plugin directory could not. The worker never caches wp-admin, wp-json,
admin-ajax, logins or previews, and turning the toggle off unregisters it.
As of 2026-10-23 it is OFF on page 4645 (`enable_offline` empty), so the
precache list — which v0.25.0 grew from two files to six — is not in play on
live today. Worth re-checking before leaning on it.

Run `php tests/public-mode.test.php`, `php tests/discovery.test.php`,
`php tests/ai-query.test.php`, `php tests/front-desk.test.php`,
`php tests/stickers.test.php`, `node tests/phone-fixes.ui.js`, `php tests/report-hardening.test.php`,
`node tests/audit-fixes.ui.js`, `node tests/focus-colour.ui.js`,
`php tests/site-blue.test.php`, `node tests/front-desk-form.ui.js`,
`php tests/bundle-split.test.php`, `node tests/bundle-split.ui.js`,
`node tests/sheet-polish.ui.js`, `node tests/check-expiry.ui.js`,
`php tests/app-shell.test.php`, `node tests/app-shell.ui.js` and `node tests/popup.test.js` after touching any of it. Those tests guard
a security property (one guest-only section holds Wi-Fi passwords and the public
page is indexable), not a cosmetic one.

## DCC Guest Guide — deliverable naming

This branch also carries the **DCC Guest Guide** plugin (`dcc-guest-guide/`).

Two naming rules, and they differ. Corrected 2026-09-13 — the prefix does
NOT go on plugin zips.

**Plugin zips: `Guest Guide <version>.zip`** — no dash, no prefix.

    Guest Guide 0.34.0.zip

**Every other file handed to the owner: prefix `Guest Guide - `** — images,
markdown, JS, reports, exports, anything.

    Guest Guide - user-manuals-open-375.png
    Guest Guide - page-4645-checklist.md

The version in a zip's name was set after an audit found two different
builds sharing one version number; a version-stamped filename makes a stale
download obvious in the Downloads folder.

```bash
# Build the installable zip (run from the repo root)
V=$(grep -m1 "define('DCCGG_VERSION'" dcc-guest-guide/dcc-guest-guide.php | sed "s/.*'\(0[^']*\)'.*/\1/")
rm -f "Guest Guide $V.zip"
zip -rq "Guest Guide $V.zip" dcc-guest-guide -x "*.DS_Store"
```

The **folder inside the zip must stay `dcc-guest-guide/`** — WordPress takes
the plugin slug from it, so renaming it would install a second copy instead
of upgrading. Only the outer filename changes.

Run `node tests/popup.test.js` before building any Guest Guide zip.

## Git workflow

- Active branch: `claude/review-shared-chat-bExtl`. Develop and push there. Don't open a PR unless the user asks.
- The repo has only the plugin folder at root — no other deliverables.

### Verify the checkout against the REMOTE at the START OF EVERY SESSION

```bash
git ls-remote origin <branch>          # a live query — this is the authority
git merge-base --is-ancestor <sha-it-returned> HEAD   # local must descend from it
```

Every session, not once. Four of eight checkouts came back wrong on
2026-09-19, and a container that was clean yesterday says nothing about the
one running now.

`origin/<branch>` is a LOCAL CACHE. It can be written without ever contacting
the remote, and that is what happens here: containers are provisioned carrying
another plugin's workspace (the Availability Calendar tip, f25db77, turns up as
local HEAD in unrelated plugins), a branch named for the incoming session is
created at that HEAD, and `refs/remotes/origin/<branch>` is written without the
server being asked. `git status` then looks clean because it compares HEAD
against a cache that agrees with it. `git log`, `git status` and anything else
reading `origin/...` are all wrong together, and only `git ls-remote` is not.

There is NO collision on the remote. One repository, a branch per plugin, every
plugin's history intact on its own branch.

### If the live check disagrees: repair locally, never on the server

First prove nothing local is worth keeping — confirm it, do not assume it:
the working tree is clean, and every local commit is reachable from some branch
in `git ls-remote origin` (in every case so far they belong to another plugin
and are already safe on that plugin's branch). Then:

```bash
git fetch origin <branch>
git reset --hard origin/<branch>     # or merge --ff-only if merely behind
```

That is local-only and it is the whole repair. The next push must be an
ordinary fast-forward. If it is rejected, STOP AND REPORT — a rejection after a
repair means something is still wrong, and that is not yours to improvise.

### Never force-push this branch — and know why, because the obvious reason is wrong

A rejected push is a STOP, not a problem to work around. Report it and wait.

The reason is NOT "the lease matches the bogus local ref and succeeds". That
was the original theory and it is false. Tested here in a throwaway repo,
poisoning the tracking ref exactly as these containers do:

```
poisoned cache, plain push          -> ! [rejected] (non-fast-forward)   remote unchanged
poisoned cache, --force-with-lease  -> ! [rejected] (stale info)         remote unchanged
git fetch, THEN --force-with-lease  -> + e156608...6143c42 (forced)      HISTORY REPLACED
```

So the lease DOES protect you while the cache is stale. What removes the
protection is the fetch — the very thing a careful person does to repair the
disagreement. **The dangerous sequence is "fetch, then force."** After the
repair above you are in exactly that state, which is why the next push must be
a plain one.

After the forced update the real commits still existed in the bare repo with NO
ref pointing at them: recoverable only until gc, and only by someone who
already knows the SHA.

A rule with the wrong mechanism is the thing this exercise exists to prevent,
so: the conclusion (never force these branches) stands; the mechanism above is
the tested one.

### Measure assets at the URL the page enqueues, over the wire

A local `gzip -9` of a file on disk is not what a guest downloads, and a file
picked by NAME is not necessarily the file the page requests. Both have
produced a wrong headline on this plugin:

- 2026-09-19: "the live site serves 95.1 KB gzipped where the shipped .min
  pair is 42.1 KB, a 56% saving". Neither number was fetched. Both were
  `gzip -9` of files on disk, and the "served" one was an inference from raw
  byte counts that happened to match the unminified files. Measured properly
  on live, `widget.min.js` IS what both pages enqueue, SpeedyCache folds the
  CSS into a combined minified bundle, and there was no saving at all.
- The same family of error once produced a wrong "-56%" on this plugin by
  measuring `widget.js` rather than the enqueued `widget.min.js`.

So: read the URL out of the page's own markup or its network log, fetch THAT,
and report the transferred size. Server compression is not `gzip -9` — on the
same file it measured 36.1 KB over the wire against 26.5 KB locally, so a
local figure understates transfer and flatters any saving computed from it.

This container cannot reach doracanalcourt.com (the egress proxy 403s it). So
a wire measurement is not something this session can produce: ASK for it, or
hand over a snippet that produces it, and never present a local computation as
a served figure.

CALIBRATION, for when an estimate is all that is available: on this host the
wire figure for JS runs about **1.4x a local `gzip -9`**. The compressor is a
weak one. Two independent measurements, and they agree:

    2026-09-19  one file            26.5 KB local  ->  36.1 KB wire   (1.36x)
    2026-10-23  v0.25.0 core        17,823 local   ->  25,104 wire    (1.41x)
                v0.25.0 guest        4,889 local   ->   5,792 wire    (1.18x)

So a local gzip UNDERSTATES what a guest downloads and flatters any saving
computed from it — v0.25.0 was estimated at -7,447 on /explore/ and came in at
-10,521. Multiply by ~1.4 when estimating, say that is what you did, and still
ask for the real number. HTML pages no longer go through that compressor
(SpeedyCache serves a pre-built .gz), but JS and CSS do.

### Report the commit SHA that git actually printed

`git push … | tail -1` shows only the "set up to track" line, not the
`old..new` line. Read the SHA back from `git rev-parse HEAD` (or let the push
output through) before quoting one. A SHA is something the owner verifies
against; an approximate one is worse than none.
