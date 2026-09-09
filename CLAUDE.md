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

Two WordPress plugins for doracanalcourt.com:

- **MPHB Availability Calendar** (`mphb-availability-calendar/`) — one Elementor
  widget displaying multi-property availability for MotoPress Hotel Booking
  accommodations. No build step. Most of this file describes this plugin.
- **DCC Seasons** (`dcc-seasons/`) — date-scheduled seasonal ambient particles
  plus a tap-the-logo Matrix easter egg. See the section at the end of this file.

Both share the `dcc` admin menu and the `claude-code` Elementor category.

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

- Active branch: `claude/dcc-seasons-plugin-2tqkxt`. Develop and push there. Don't open a PR unless the user asks.
- Root holds two plugin folders (`mphb-availability-calendar/`, `dcc-seasons/`),
  the `tools/` dev scripts, the tracked `dcc-seasons.zip` build artifact, and the
  site context docs.

## Delivering DCC Seasons zips

When sending the user an installable zip for a new **DCC Seasons** version, name
the file **`Seasons <version>.zip`** — e.g. `Seasons 3.7.0.zip`. Build it from
the `dcc-seasons/` folder as usual (the folder inside the zip keeps its own
name, which is what WordPress installs); only the delivered filename changes.

The repo keeps one tracked build artifact at `dcc-seasons.zip` so a version-named
copy isn't accumulated per release; rebuild it in the same commit as the version
bump so the tracked zip never lags the source.

## DCC Seasons — things that bite

- **Minified assets have a recorded build command.** Regenerate with exactly
  `npx terser assets/js/<name>.js -c passes=3 -m --safari10 -d __DCC_DEBUG__=false
  -o assets/js/<name>.min.js` for ambient/engine/matrix. Before 3.6.0 the engine's
  flags were unrecorded, which made one release's binary unreproducible and its
  size incomparable to the next.
- **The engine's size baseline is 95,220 raw / 33,372 gzipped (3.16.0;
  3.15.0 was 93,845 / 32,920, verified live). Cite that, not the 66KB/23KB
  ceiling.** That ceiling was
  real at 3.3.1 (65,736 / 23,191) and has been stale since 3.6.0, when the
  backdrop machinery landed: 3.6.0 70,945 / 24,580 · 3.7.0 79,866 / 27,382 ·
  3.8.0 87,865 / 29,863 · 3.10.0 90,137 / 30,849 · 3.13.0 92,296 / 31,724 ·
  3.14.0 92,990 / 32,123 · 3.15.0 93,845 / 32,920 · 3.16.0 95,220 / 33,372. Nine releases shipped over
  it, so a brief that budgets against 66KB/23KB is budgeting against a number
  that has not been true for months — measure the current build and quote
  that. Retiring four sprites in 3.15.0 bought back roughly 2.9KB raw, which
  is the scale a sprite cull returns.
- **Never run a numeric-precision regex over the sprite path data.** A trim regex
  in 3.2.0 fused compact SVG number pairs (`8.2.4` is two numbers, not one),
  silently corrupting four sprites; the corrupted output is an ordinary-looking
  number no text search can find. Run `node tools/validate-paths.js` after any
  change to `assets/js/engine.js` — it parses every `d` and exits 1 on a bad one.
- **"Behind" is only correct if NOTHING PAINTS OVER the canvas — verify it,
  never assume it.** The canvas is mounted inside the element that actually
  paints the page, at `z-index:-1` (a negative-z child paints ABOVE its
  stacking-context host's own background and BELOW that host's content, which
  is exactly what "behind" means — it does NOT paint behind the host's
  background; measured, 3.10.0). Choosing the host right is not enough: the
  live column was correct and the article inside it still covered everything.
  So after mounting, `coverage()` hit-tests a 6×6 grid inside the canvas's own
  box and asks what paints there; a painter that is a DESCENDANT of the host
  is above the canvas and hiding it. While covered, the engine either descends
  into the covering element or moves that element's background colour onto the
  canvas (`transferBg` + `drawBgFills`, repainted every frame over that
  element's rect). Four passes, then it reports. `?dcc_debug=1` prints the
  result as `CANVAS REACH: N%`. Four things make the mount work, and each was
  a separate bug:
  1. A candidate must paint something AND have non-zero area — Elementor
     breaks out of the theme wrappers, collapsing `#content` / `.entry-content`
     to 0px.
  2. `article#post-620` carries a `translateZ(-0.001px)` hack, making it the
     containing block for `position:fixed` descendants. A fixed canvas there is
     silently reduced to an article-sized scrolling box, so the mount switches
     to `position:sticky` (with `display:block`, or it adds baseline space).
     A sticky canvas is fitted to `min(100vh, host height)` and kept fitted by
     a ResizeObserver — 100vh in a short column overflows and lengthens the
     page. Accents go `position:absolute` in that subtree for the same reason.
  3. `z-index:-1` resolves in the nearest ANCESTOR stacking context, so a host
     that is not one gets `isolation:isolate` — otherwise the canvas lands
     behind that host's own background.
  4. Hit-test, don't pixel-sample: `elementFromPoint` is layout, so it works in
     a headless browser whose `visibilityState` pauses rAF. Canvas pixel
     sampling there is meaningless and has wasted a round already. For real
     ground truth paint the canvas from a STYLESHEET, never inline:
     `style.textContent = 'canvas.dcc-seasons-canvas{background-color:magenta
     !important}'`. A background on the canvas ELEMENT paints in the canvas's
     exact stacking position, cannot be cleared by the engine and needs no
     rAF — but an INLINE one lies twice: it is lost when the element is
     re-created, and detaching the canvas (which any remove-and-measure
     layout test does) trips the re-mount below and swaps the element for a
     fresh one. That combination once photographed a working backdrop as
     completely broken. The rule matches whatever canvas exists at the time.
  5. Only the ON-SCREEN part of the canvas can be sampled, and a canvas fitted
     to a column that is briefly a few pixels tall has no measurable box.
     Unmeasurable is not covered: `coverage()` returns `measurable:false` and
     nothing is warned. The check runs at mount AND again at 1200ms, and only
     the settled run may complain — the panel is printed from it too.
  6. `height` + a matching negative margin cancel the sticky canvas's own flow
     height, but inserting a first child also un-collapses the NEXT element's
     top margin — 50px of real page height on this theme. `stickyBalance()`
     measures the document with and without the canvas and corrects the
     margin. Assert page height with `documentElement.scrollHeight`, not
     `body.scrollHeight`, on a fixture whose first child has a collapsing
     top margin (padding on it hides the bug). Toggle `display:none` ONCE per
     page load and compare later rounds against that one baseline: repeated
     toggling leaves ~36px of residue on the live page and reads as a
     regression that is not there. The same insertion also changes the HOST's
     height, so the sticky mount check asks whether the canvas got the
     geometry it was given, never whether it matches the host afterwards.
  7. The canvas can be removed at ANY time — a slider, an accordion, a script
     rewriting the host's innerHTML takes it with it, permanently. Liveness
     rides on the frame loop (`ensureMounted`, one `body.contains` per frame,
     nothing to disconnect or leak), rate-limited to once a second and capped
     at 20, and re-runs `fixCoverage` afterwards because the re-render may
     have changed what paints over it.
  Override the host with the `dcc_seasons_backdrop_host` filter.
- **REACH IS NOT THE SAME AS BEING SEEN, and a host too short is worse than
  a host partly painted over.** `coverage()` answers "what fraction of the
  CANVAS does nothing paint over", so a 300px canvas nobody can see scores
  100% and the panel says "behind is working". For three releases the descend
  step traded the whole page for that number: an opaque 300px section inside
  the article won the descend, the canvas was refitted to 300px, and sprites
  could only ever appear in that band — the owner's "they begin after the hero
  image and stop above the text row". `worth(el, reach)` = the host's own
  height (a sticky canvas slides through its host) x the reach it would end up
  with, and `fixCoverage()` refuses a descend into a host shorter than the
  screen, or one that gives up more than 40% of the paintable page. Cost
  STAYING honestly too: `canTransfer()` says whether the covering element's
  background can move onto the canvas, in which case staying is worth full
  reach over the whole host. Keep 3.10.0's ordinary descend into the opaque
  article working — `scratchpad/test-mount.js` asserts it — and check
  `SCREEN REACH` in `?dcc_debug=1`, not just `CANVAS REACH`, before believing
  the backdrop is fine. `scratchpad/test-host.js` holds the whole trade.
- **A new theme does NOT reach an edited schedule by itself.** `migrate()`
  only replaces a stored schedule outright when it recognises it as the
  unmodified pre-3.7.0 default; anything the owner touched is converted row
  for row, so the six themes 3.7.0 added had no rows and displayed on zero
  days for a whole release cycle, silently. Every release that adds a theme
  with a default row MUST add it to `Schedule::new_theme_rows()`
  (`version => [theme keys]`); `apply_new_themes()` appends the rows for
  versions being upgraded THROUGH only. Never widen that to "any theme with
  no row" — a row the owner deleted (summer_canal, on this site) would come
  back on the next upgrade. `Settings::unscheduled_themes()` reports the rest
  passively on the settings page.
- **`florida_keys` is the year-round BASE theme, and it is a full-year schedule
  row, not a code path.** `Schedule::defaults()` ends with a Jan 1 - Dec 31
  row; because `active()` takes the NARROWEST containing range, the widest
  possible row loses to everything and wins only days nothing else claims.
  Beware: 3.7.0's season rows already tile the year, so on the SHIPPED
  defaults the base row wins zero days — it earns its keep on edited
  schedules (on the live site it holds 87 summer days, because the owner
  deleted summer_canal). `ambient.js` mirrors the key in `BASE_THEME` and
  falls back to it when no row matches.
- **`enabled = 0` means NOTHING is printed — check it first.** `should_load()`
  returns at the master switch, so there is no config, no script tag and no
  canvas; through 3.8.0 `?dcc_debug=1` also rendered nothing, because the
  panel was drawn by the engine that never loaded. Three rounds of "behind
  layering is broken" were that. `Plugin::print_diag_stub()` now prints a
  PHP-side panel naming the blocking gate, and the settings page and plugins
  list both flag the off state.
- **Verify schedule coverage by walking real days, not against
  `Schedule::defaults()`.** The defaults always contain every theme, so a
  defaults-based test cannot see a stored schedule that is missing one.
  `scratchpad/test-upgrade.php` walks 365 days, resolves every row for year-1
  and year, takes the narrowest containing range and asserts per-theme day
  counts.
- **The schedule is rules, not dates** (`includes/class-schedule.php`). Rows are
  `{start:{on,off,m?,d?}, end:{…}, theme, label, year}`; `on` is `fixed` or a
  named anchor (`easter`, `thanksgiving`, `memorial_day`…). The SAME resolver
  exists in PHP (admin table) and in `ambient.js` (the visitor, from their local
  date — cache-safe). `scratchpad/test-schedule.js` cross-checks them for every
  anchor 2024–2035; keep both in step. Narrowest overlapping range wins its day.
  Pre-3.7.0 dated rows are migrated on read (`Schedule::migrate`).
- **Tap counting is delegated** (one document listener, `closest()` against the
  selector tiers: configured → `tapFallback` → `#masthead`, first tier with a
  VISIBLE match). Binding per element double-counted nested targets — the egg
  opened on half the configured taps until 3.7.0.
- **A resize is DESTRUCTIVE and must be earned.** Writing `cv.width` clears
  the canvas, and `applySize()` used to re-seed every particle and kill any
  hero or vignette with it. On iOS the URL bar collapsing fires a
  visualViewport `resize` on nearly every scroll, so the whole scene restarted
  on every gesture — the owner's "the graphics reset whenever I tap". Three
  rules now: `applySize()` returns immediately unless width, height or DPR
  actually changed; the sticky canvas is fitted to `100svh` (measured once by
  a probe, re-measured on orientationchange) and NEVER `innerHeight`, which
  moves with the URL bar; and a genuine resize RESCALES every actor's
  coordinates instead of re-seeding, restarting only when the box has more
  than doubled or halved. The host ResizeObserver goes through `queueSize`,
  not `applySize` directly.
- **Seeding evenly over the CANVAS is not seeding evenly over what anyone
  can SEE.** On a phone most of the content column paints over the backdrop:
  the live homepage at 375px is 99-100% open from the article top to the
  cottage selector and then a wall of full-bleed cards whose open remainder is
  gutters — 57% open by area, almost none of it usable, which is why sprites
  "only showed up in one band". `buildOpenMap()` samples the canvas's
  on-screen box on 48px cells with the same painterAt question the mount asks,
  and `spreadPlace()` draws its candidates from the open cells AND computes
  its even share over them. Rebuild it on scroll-settle, on the resize path
  and after the settled mount pass only — never per frame, never oftener than
  MAP_MIN. Cells below the fold are UNKNOWN: they stay in the candidate pool
  (nothing is known to paint there) but are excluded from the open fraction,
  or a page whose visible part is solid reports itself open and the <10%
  fallback never fires. Keep the build under 2ms: it is 136 hit tests on a
  phone and `getComputedStyle` dominates, so each build stamps its verdict on
  the element (`_dccPb`/`_dccPo`) and every ancestor answers once.
  The live homepage, measured: 99-100% open in the band between the hero and
  the Cottage Selector, then 8-69% open per 300px band below it. There is
  genuinely little else to seed into on a phone, so if clustering is still
  reported the next lever is DENSITY, not placement. Note the interaction:
  `SPREAD_TRIES`/`SEP_K` step up at `maxParts <= 12`, and `maxParts` is
  `density - 3` on a water theme — so the owner's density 16 on
  `florida_keys` gives 13 and just misses the tighter tuning. Dropping to 15
  removes one sprite AND switches it on.
- **Even spacing is a SEED-TIME rule, and it must stay one.** Uniform random
  placement bunches: measured over 200 fields of 16 particles at 390x844, the
  pre-3.14.0 engine put six or more into the same ninth of the canvas in 27 of
  them (worst 8). `spreadPlace()` in `engine.js` throws up to
  `SPREAD_TRIES` candidates and takes the first in a ninth still under its
  even share and no closer than the spacing target to a live particle, else
  the best it saw. Never turn this into a per-frame repulsion — it would fight
  the motion and undo 3.13.0's rescale-on-resize. Behaviours that place
  themselves (`float`/`cruise`/`frogger` on the water line, `grow`/
  `berrycycle` below the fold, `fly`/`vee`/`toss`/`hop`/`waddle`/`chatter`
  entering off-screen) and the hero are exempt BY NOT BEING ROUTED THROUGH IT;
  `scratchpad/test-spread.js` asserts their staging is still exact, so a new
  behaviour that wants deliberate placement must set its own x/y after the
  generic call, as they all do. Pass `y1 <= y0` for a fixed y and the pass
  spreads across x alone, against column totals — and note that pass counts
  OFF-SCREEN particles, which the ninth pass must not: without that, a field
  respawning together sees an empty grid and the guardrail does nothing.
  Seeding is only half of it: free-air motion re-bunches a field within a
  minute, so `deClump()` adds a soft pairwise separation for the free-air
  behaviours ONLY (`FREEAIR`, space-delimited so a bare indexOf cannot match
  'fly' inside 'firefly'), fading to nothing at the shared spacing target and
  clamped inside the box so a nudge can never push a sprite over an edge and
  restart it. It shares `sepRun` with the seeding pass so the two cannot pull
  against each other. Never make it a hard constraint or a per-frame
  re-placement.
- **A theme naming a retired sprite draws NOTHING and says nothing.** There
  are five ways a sprite key is named — `'s' => 'key'`, an array of keys, a
  `$variable` of keys, a computed `'prefix' + n`, and the accent map — plus
  hero `kind`s that are not sprites at all. `tools/validate-paths.js` resolves
  all of them and fails the build on a dangling reference; run it after
  touching `SVGS` or any theme. Sprite entries can be strings OR functions
  (`jack1`, `plateny`), so key extraction must match both.
- **`test-v21.js`'s bass-hero check is load-sensitive, not flaky-by-design.**
  It polls canvas pixels for 30s of WALL time waiting for a hero jump, so a
  machine busy with other Chromium instances runs too few animation frames in
  that window and it fails. Measured: 2 failures in 9 runs under concurrent
  load, 0 in 6 when alternated against the previous build on an idle machine
  (which was also 0/5). Re-run it alone before treating it as a regression.
- **No weather coupling.** Weather-driven rain/fog has been proposed and
  explicitly declined by the owner. Do not offer it again.
- **`?dcc_debug=1` as an administrator** prints an on-page diagnostics panel with
  the backdrop-host decision and the content column's ancestor chain. Ask the
  owner for that text before theorising about the live layering.
- **Uploading a new zip does not purge the page cache.** The client config and the
  `?ver=` asset URL are both baked into cached HTML, so the site keeps serving the
  previous build. The plugin purges itself on a version change, but verify after
  any manual/FTP deploy.
