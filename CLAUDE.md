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

- Active branch: **`claude/dcc-checkout-customizations-zx1jrx`**. Develop and push
  there. Don't open a PR unless the user asks.
  (This line read `claude/review-shared-chat-bExtl` until 2026-09-20 — that is the
  **Availability Calendar's** branch, not this plugin's. It was corrected outright
  rather than annotated: a stale branch name inside the section about not pushing
  into the wrong history is the trap itself, and a parenthetical leaves the wrong
  name readable.)
- The repo has only the plugin folder at root — no other deliverables.

### VERIFY AGAINST THE REMOTE, NOT AGAINST LOCAL REFS (standing rule, 2026-09-19)

**Before the first commit of a session, query the remote live** and confirm the
local branch descends from what it returns:

```bash
git ls-remote origin <branch>                       # a LIVE query
git merge-base --is-ancestor <remote-sha> HEAD      # must succeed
```

**`origin/...` is a local cache, not the remote.** A remote-tracking ref can be
written without the remote ever being contacted — one was, on 2026-09-19, and it
held **a different plugin's history**. Anything that trusts `origin/...`,
`git status`'s ahead/behind count, or a `git fetch` that may not have run is
reading that cache and can be confidently wrong.

**NEVER force-push these branches.** If a push is rejected as non-fast-forward,
**STOP and report it** — do not diagnose it into a fix. A rejected push is
information, not an obstacle.

**The reason first recorded here was WRONG, and the truth is more dangerous.**
This file used to say `--force-with-lease` would match the bogus tracking ref,
succeed, and destroy the remote. It does not. Measured in a throwaway repo with
the tracking ref poisoned exactly as these containers do it (2026-09-20, owner's
result reproduced independently here rather than taken on trust):

| state | command | result | remote |
|---|---|---|---|
| poisoned cache | `git push` | `! [rejected] (non-fast-forward)` | unchanged |
| poisoned cache | `git push --force-with-lease` | `! [rejected] (stale info)` | **unchanged** |
| **after `git fetch`** | `git push --force-with-lease` | `+ 00e90d8...313473d (forced update)` | **HISTORY REPLACED** |

So **the lease does protect you while the cache is stale.** What removes the
protection is the FETCH — the very thing you do to repair the disagreement.
**THE DANGEROUS SEQUENCE IS "FETCH, THEN FORCE", and it is the sequence a
careful person reaches for.** The conclusion is unchanged; the mechanism was
not, and **a rule with a wrong mechanism is the thing this whole exercise exists
to prevent.**

**AGREEING WITH WHOEVER GAVE YOU THE RULE IS NOT VERIFICATION.** This entry
carried the wrong mechanism because it was written down as received, without
being tested. A sibling session that worked out the lease would be rejected in
its own case, and said so plainly against what it had been told, was right to.

### WHAT IS ACTUALLY WRONG (don't re-diagnose it from scratch)

One repository, **a branch per plugin, and every plugin's history is intact on
its own remote branch. There is NO collision on the remote.** Containers are
being provisioned carrying the **Availability Calendar's** workspace —
`f25db77` shows up as local HEAD in unrelated plugins — and a branch named for
the incoming session is created at that HEAD, with
`refs/remotes/origin/<branch>` written **without contacting the server**. That
is exactly why `git status` looks clean: it compares HEAD against a cache that
agrees with it. **Four of eight checkouts came back wrong**, so re-run the live
check at the START OF EVERY SESSION — a container that was clean yesterday
proves nothing about the one you are in now.

### RECOVERY, if the live `ls-remote` disagrees with local HEAD

**First establish that nothing local is worth keeping, and verify it yourself.**
In every case seen so far the local commits belong to ANOTHER plugin and are
already safe on that plugin's own remote branch (`f25db77` is the tip of
`claude/review-shared-chat-bExtl`), so discarding them locally loses nothing.
Confirm the working tree is clean and that **every local commit is reachable
from some branch in `git ls-remote origin`** — do not take that from anyone.

Then, and only then:

```bash
git fetch origin <your-branch>
git reset --hard origin/<your-branch>    # or `git merge --ff-only` if merely behind
```

That touches nothing on the server; it is local-only and it is the whole repair.

**AFTER THAT FETCH YOU ARE IN THE DANGEROUS STATE IN THE TABLE ABOVE.** Your
next push must be an ordinary fast-forward. **If it is rejected, STOP AND REPORT
IT** — do not force, do not `--force-with-lease`, do not "reconcile" it. A
rejection after a repair means something is still wrong, and the repair is not
yours to improvise.

## DCC Custom Checkout — release artifacts

- **Live MotoPress Hotel Booking is 6.3.0** (Director, the plugin header,
  2026-10-07). Earlier entries here — and `SITE-CONTEXT.md`, which this
  plugin does not edit — say 6.1.0; that was wrong. Facts marked "live 6.3.0"
  were read from the live files.

- **Naming of files handed to the owner** (owner preference, corrected
  2026-09-13). Two rules, and the distinction matters:
  - **Plugin zips take NO dash**: `Custom Checkout <version>.zip` (e.g.
    `Custom Checkout 0.34.0.zip`), matching the version in the plugin header.
  - **Everything else takes the dash**: `Custom Checkout - <name>.<ext>` —
    images, markdown, JS, reports, audits, exports, logs, anything that is not
    the plugin zip. **EVERY file handed over, with no exceptions**, however
    obvious its contents look from the name.

  **WHY, and this is the part not to tidy away** (owner, 2026-10-20): the
  owner passes these files on to the **DCC - Admin** session, often several at
  once from different plugins, and the prefix is how that session tells which
  plugin each one belongs to. A name like `Check List 0.34.2.md` or
  `screenshot.png` is not merely untidy there — it is unattributable, and the
  wrong plugin's instructions can be read against it. The zip is the one
  exception because its own name already carries the plugin.

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
  bytes, asserted in `tests/copy/run.php` (`php tests/copy/run.php`).
  **THE SENTENCES ARE IDENTICAL AND THE SELECTOR'S PIN IS NOT A HASH** (verified
  2026-10-23 on its 0.54.0, `a1cbe9d`): its `capacity_note` hashes to the same
  sha256 at the same 138 bytes, but it is pinned as a LITERAL in
  `tests/test-design-snapshot.php` (`$CAPACITY`), not by hash. The protection is
  equivalent — a string comparison is as strong as a digest — but this file used
  to say they pinned the hash, which is the kind of wrong mechanism the git
  section above exists to warn about. **Change one, change both, change both
  pins — ours the hash, theirs the literal.** The owner's line break between the two sentences is applied at
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
  **The submit path is confirmed, not assumed** (2026-09-18): MotoPress does
  not walk inputs — `parseFormToJSON()` in `assets/js/public/mphb.js` is
  `return this.element.serializeJSON();`, and `serializeJSON` is built on
  jQuery's `serializeArray`, which applies the HTML "successful controls" rule
  — the same rule `FormData` applies. So the `FormData` assertion in
  `tests/breakdown` measures the real mechanism even though MotoPress submits
  over REST. Separately, `_buildFormData()` skips empty custom fields outright
  (`} else if (value !== '') { formData.append("customer_fields[...]", value); }`),
  so an unanswered dog question would send nothing even without `disabled`.
  **That second fact is a belt, not the braces** — it is MotoPress's internal
  and can change in any update, whereas `disabled` is the spec. Do not drop
  `setDisabled()` on the strength of it.
- **`mphb_cf_options` IS PHP-SERIALISED ON THIS SITE, NOT JSON.** Checkout
  Fields store their option lists that way, so `json_decode()` returns null and
  a careless write silently changes nothing — no error, no effect. **Always
  `maybe_unserialize()` first and write back in the shape you found.** It cost
  a round to discover; nothing in this repo reads those options today, and
  anything that starts to must obey this.
- **The dog-field contamination is CLEANED AND FIXED AT SOURCE** (2026-09-17,
  by the owner's team, not by this plugin). Checkout fields 17727 (`dog_size`)
  and 17728 (`dog_hair`) now carry a blank first option, so "no answer" is
  representable at all — that is what stops it recurring. The phantom values
  were cleared from #17457, #17459, #18098, #18159 and #18433, backed up in the
  option `dcc_bak_dogmeta_20260917`. **#17730 and #17795 were deliberately
  KEPT** — both `dog_type = "Poodle"`, and #17795 carries non-default size and
  hair: real pet bookings, not contamination.
  **The pet gate still tests the pet fee or `dog_type`, never emptiness** — and
  that is now the principled test rather than a historical workaround: a guest
  with a real dog who accepts the first option is indistinguishable from a
  default by value alone, however clean the data is. The blank option and
  v0.22.0's `disabled` both reduce how often that arises; neither makes
  emptiness a sound test.
- **The admin guest-count control writes `_mphb_adults` on the reserved room**
  (v0.22.0, `Admin_Guests`). MotoPress fills that meta with the ROOM TYPE'S
  CAPACITY when an import supplies no count (#18433: 4 for a 2-guest
  Booking.com reservation), so a number there is not necessarily anyone's
  answer. **"Not provided" DELETES the meta — it must never store 0**, or
  /staff/ loses the difference between "nobody told us" and a real count.
  Capacity that cannot be read widens the range rather than capping it, and the
  screen says so — but `MAX_OPTIONS` (20) bounds it absolutely, because `max`
  drives both the `<option>` loop and the accepted range and comes from the
  database: a corrupted `mphb_adults_capacity` of 9999 would otherwise render
  9999 options and wedge the booking screen. Tested at `tests/admin-guests/` (`php tests/admin-guests/run.php`):
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
  **BOTH PLUGINS TEST THE MARKER AS "non-empty AND not `0`"** (aligned v0.23.2).
  They had drifted: the Calendar used the strict test, this half tested only
  `!== ''`, so a stored `"0"` would have read as CONFIRMED here and UNCONFIRMED
  there. No divergence existed on live — the one marker in the database is `'1'`
  — and **nothing anywhere would have failed if it had**, which is the reason it
  is pinned rather than left. `Admin_Guests::is_confirmed()` is the single test,
  used by both the save path and the screen; the Calendar keeps its own copy and
  each names the other. The strict reading is the right one because of the
  direction it fails in: `"0"` read loosely asserts that a human confirmed
  nobody is staying, a claim about a real booking that no human made. It also
  self-heals — with the strict test `$had_mark` is false for `"0"`, so the next
  save rewrites the marker as `1`, where the loose test left the bad value in
  place through every subsequent save. Asserted in `tests/admin-guests/`, and
  the assertions were checked to FAIL against the loose test before shipping.
- **`dcc_guest34_enabled` IS A CROSS-PLUGIN SWITCH AND NEITHER PLUGIN OWNS IT**
  (v0.24.0). One toggle for the whole Guest 3 / Guest 4 concept, rendered at
  **DCC → Custom Checkout → "Guests 3 and 4"** because that is where the owner
  will look for it, but **stored as a STANDALONE WP option, deliberately not a
  key inside `dcc_checkout_settings`** — the DCC Cottage Selector reads it for
  its matching quiz and **must keep working when this plugin is deactivated**.
  THE CONTRACT, and both sides implement it independently:
  - **ABSENT MEANS ON.** A site that has never seen the setting behaves exactly
    as it did before the setting existed.
  - `'1'` or `1` → ON. **Anything else → OFF.** This plugin WRITES `'1'` for on
    and `''` for off. Read leniently, write strictly; a present-but-unrecognised
    value reads as OFF because that is the direction that does not charge a guest
    for an offering whose switch state cannot be read.
  - `Config::guest34_enabled()` is the whole implementation and is deliberately
    four lines, so the Selector's copy CAN match it character for character.
    **IT NOW DOES — VERIFIED 2026-10-23, read-only, on the Selector's branch at
    `a1cbe9d` (its 0.54.0).** Both readers are
    `($raw === null) || ($raw === '1') || ($raw === 1)` and neither carries a
    filter. The Selector's own comment says it must agree with Checkout's
    character for character and names 0.43.0-0.49.0's `(bool)` as the bug. Its
    only extra is a `function_exists('get_option')` guard returning true, for
    when WordPress is not loaded — unreachable in a request and harmless.
    *The paragraph that follows is kept because it is why the check exists.*
    **IT DID NOT, and this line used to say it did** (measured 2026-09-27 on the
    Selector's branch at `a2ac0e6`, read-only). The Selector read
    `$v === null ? true : (bool) $v` and applied no filter, so `'no'`, `'off'`
    and `'false'` read ON there and OFF here, and a `dcc_guest34_enabled` filter
    reached only this half. **Its CLAUDE.md also records the WRITER wrongly** —
    "integer 1 or 0, like `guest_fee_enabled`" — and calls `''` out of contract,
    when `''` is exactly what `sanitize_guest34()` stores for OFF.
    **No live divergence**: the only values ever written, `'1'` and `''`, read
    the same on both sides. It is the `_mphb_adults_confirmed` shape again
    (0.23.2) — two readers of one value, agreeing only on what happens to be
    stored. **Reported to the owner, NOT fixed from here**: the fix belongs in
    the Selector (adopt the strict reader, correct its recorded writer). Until
    it lands, "change one, change both" is a goal, not a fact.
    **Owner's answer (2026-09-27): the Selector adopts THIS plugin's reading and
    corrects its notes in its 0.50.0.** It shipped, and the comparison was made
    rather than taken on trust (above). Re-run it the same way after any Selector
    release that touches that file — "they said they would" is not "they match",
    and neither is "they did once".
  - **NO FILTER ON THE SWITCH — DONE IN 0.26.0** (owner decision 2026-09-27,
    folded into the next release as he asked; confirmed for 0.26.0 by the
    courier on 2026-10-06, asked because that brief said "change nothing else"). `Config::guest34_enabled()`
    reads the option and nothing else; the "Guests 3 and 4" row is its own
    method, `Settings::render_guest34_row()`, so the rendered checkbox is
    asserted directly — and a filter can no longer make the box disagree with
    storage, so a save cannot persist an override. Asserted both ways round in
    `tests/guest34/` (a filter cannot turn a stored ON off, nor a stored OFF
    on) and on the rendered box in `tests/settings/`; mutation
    `cfg-guest34-filter-readded` puts the hook back and must go red. The
    Selector adopts this reader in its 0.50.0 — compare the two then.
  - **No `default` is registered** with `register_setting()`. Registering one
    would make `get_option()` return it on a site that never saved the setting,
    and "absent" is a meaningful third state.
  - The checkbox is paired with a **hidden field of the same name**. An unchecked
    box posts nothing and the Settings API only saves keys it finds in the POST,
    so without it switching OFF would appear to work and change nothing.
- **THE FEE IS MOTOPRESS'S, SO SUPPRESSING IT IS ACTIVE WORK AND MUST FAIL
  CLOSED** (v0.24.0). Service 18063 is linked in **MotoPress's own
  `mphb_services` meta on room types 1065/1067/1069/1071**, and MotoPress renders
  and prices it without asking this plugin. So "don't attach the fee when the
  switch is off" is not something achieved by not doing something — there was
  nothing being done. The switch reaches `Config::guest_fee_enabled()`, which
  makes `guest_fee_active()` false, and `Extra_Guest_Service::find_violation()`'s
  existing inactive branch then **refuses both** an attached extra-guest service
  and any room over `included_guests()`. That covers the 302 path and the REST
  path, because `Rest_Guard` calls the same `find_violation()`. **The UI half
  alone would be a cosmetic lie.** Asserted by posting the fee with the switch
  off, in `tests/guest34/`.
  **DO NOT TOUCH `mphb_services`.** That meta is the owner's MotoPress
  configuration across his room types; rewriting it from here would be a silent
  bulk edit of live config and would strand him if he ever deactivated the plugin
  — the fee would stay gone with nothing to explain it. Suppress at render and at
  submit; leave his configuration exactly as he set it.
  **THE CHECKOUT IS THE ONLY GUEST-FACING SURFACE THE SERVICE APPEARS ON**
  (measured 2026-09-19, not inferred). I had flagged that MotoPress's own
  accommodation pages might still show the service outside the checkout.
  `/accommodation/cottage-22/` and `/accommodation/cottage-32/` were fetched —
  both 400KB+ — and neither contains any `mphb` service markup, any reference to
  service 18063, or the string "Extra Guest Fee". **The accommodation templates on
  this site do not render a services list at all**, so the guest path is fully
  covered by the checkout gate.
  **Scope of that check, stated honestly:** guest-facing PAGES were verified.
  **Confirmation emails and the MPHB admin were NOT** — a booking cannot be
  submitted to test them. So if the switch is ever off and a stale confirmation
  email still mentions the fee, look at the email templater, not at this gate.
- **THE SWITCH GOVERNS COLLECTION, NOT HISTORY — AND THAT SPLIT IS TWO PAIRS OF
  METHODS** (v0.24.0, owner decision: existing bookings keep their data).
  - `collected_guest_field_groups()` honours the switch → the checkout JS
    sections and the server required-fields backstop.
  - `guest_field_groups()` ignores it → **Admin_Fields / `admin-booking.js`**, so
    a booking that already carries Guest 3 details still shows them, and
    **Settings**, so the owner can still edit the section titles while it is off.
  - `offered_guest_fee_steps()` honours the switch → every label on the checkout.
  - `guest_fee_steps()` ignores it → **Admin_Fields**, so wp-admin can still
    price a fee an existing booking really carries.
  - **The settings page's "What the guest sees" preview is a GUEST-SIDE reader**
    even though it renders in wp-admin (v0.25.2). It read `guest_fee_steps(4)`
    and `couch_note_text()` — the ungated pair — so with the switch off, or
    `included_guests` not 2, it showed the owner labels and a note no guest
    would see. It now reads `guest_fee_active()`, `offered_guest_fee_steps()` and
    `offered_couch_note()`, the same gates `class-assets.php` hands the checkout.
    **Classify a reader by whose view it models, not by which screen it is on.**
    Asserted in `tests/settings/` with the render-when-it-should guard first.
  - **The switch-off checkout path clears any extra-guest service box**
    (`uncheckGuestServices()`, v0.25.2). The server's inactive branch refuses ANY
    attached one, and the services section is hidden, so a box arriving ticked
    was a refusal the guest could not fix. The fee-on path's `apply()` always
    unticked unwanted buckets; the fee-off path returned before doing the same.
    Unticked, never `disabled`. Init-only, and `checked` is a property, so it
    records no mutation — **the tap path is untouched**. Whether MotoPress ever
    renders the box pre-ticked on a fresh checkout is NOT observed; the fixture
    presets it, and the fix is correct either way because nothing it clears can
    be charged while this path runs. `capAdultsSelects()`, the other half of
    switch-off, had **no test at all** until the same round.
  **Getting either pair the wrong way round strips data off past bookings.** The
  first version of this change gated `guest_fee_steps()` itself and would have
  removed the price label from historical bookings in wp-admin; caught by
  checking who called it, not by the suite. Both directions are asserted now.
  Scope limits, all deliberate: **Guest 2 is not affected** (the cottages sleep
  two as standard; the filter is `min <= 2`), the staff-side guest-count selector
  is not affected, and **nothing about MotoPress capacity changes** — a guest can
  still pick 4 in MPHB's own control; the switch governs what this plugin
  collects and what fee it permits. **The Availability Calendar needs nothing**:
  `Staff_Data::push()` already returns early when the value is blank, so the
  Guest3/Guest4 rows only render when the booking has the data. There is no
  cross-plugin contract to build for decision 1 and none was built.
- **THE ADMIN CUSTOMER INFORMATION BOX IS ORDERED IN THE BROWSER** (owner's
  picks 2026-10-06, v0.26.0; `customerLayout()` in `admin-booking.js`, groups
  from `Admin_Fields::customer_layout()`). Rob's "full tidy order" — Guest 1
  (First, Last, Phone, Email), Address (Address, Apartment/Unit #, City,
  State / County, Postcode, Country), Guest 2, Guest 3, Guest 4, Dog (Type,
  Size, Hair), Note — with a quiet heading over each. It cannot be done with
  `menu_order`: MotoPress renders its built-in fields first regardless, and
  `menu_order` would also move the GUEST checkout form, which he does not want.
  **WP-Admin only**; checkout, emails and invoices are untouched. Labels are
  untouched ("State / County", "Postcode" stay — his choice). The rules:
  - **Rows are MOVED, never re-created**, so names, values, saving and
    validation are untouched. Proven by the form's successful controls being
    identical with and without the script, before and after the toggle and a
    cottage change.
  - **"The same box" = the known fields' rows are `<tr>`s sharing one
    parent**, and at least two of them. Anything else and it stands down: the
    box stays exactly as MotoPress drew it, with a console note naming the
    reason (never a value). That rule is also what decides the add-booking
    step: the same table is ordered, a different form is left alone.
  - A missing field is skipped; a group with no rows gets no heading. A field
    it does not know stays visible after the known groups under an **"Other"**
    heading (owner's pick), which exists only while such a row does.
  - **A heading hides when every row under it is hidden by the gating**, and
    comes back when the guest count, the Pet Fee choice or a filled value
    shows a row again (since 0.28.0; it used to follow the "Show all" toggle,
    which is gone).
  - **Idempotent**: an already-ordered box is not touched, so the gating's
    MutationObserver, which now calls it, cannot feed itself. Asserted (zero
    childList records after a provoked re-run).
  - **THE FIXTURE IS A PATTERN, NOT A CAPTURE.** The edit screen needs a login
    and the session's network policy blocks wordpress.org and GitHub, so no
    real admin markup was read. `tests/admin-layout/` carries the 21 rows in the
    exact order and labels the Director read on booking 19615, in core's
    `form-table` shape with a REPRODUCTION of core's 782px rule, and the input
    names follow the `mphb_` pattern (built-ins are tried as `mphb_<name>` then
    `<name>`). Whether live matches is the Director's label-order check; if it
    does not, the stand-down means the screen is unchanged, not broken. **When
    real markup becomes available, replace the fixture with it** — the v0.9.0
    rule exists because plausible fixtures hid three defects.
  - The config the suite uses is NOT a copy: `tests/admin-layout/config.php`
    calls the shipped `Admin_Fields::script_config()`.
  - Harness note, measured: `addInitScript` does not reach a `setContent`
    page; the suite's first draft ran with no config at all and timed out
    rather than passing. The config is now printed inline, as
    `wp_localize_script` does.
  - **0.26.0 VERIFIED ON LIVE** (Director, 2026-10-06, booking 19615, labels
    and structure only): the layout applied with no fallback, exact order,
    headings rendered, labels unchanged; `checkout.js`/`checkout.css`
    byte-identical to 0.25.2; the Guests 3 and 4 box ticked with no stored
    row (absent = ON) and no `apply_filters` left for it. **The pattern's
    SHAPE matched — but live had a row the fixture lacked** (Upload Photo ID,
    below), which 0.26.0 put under "Other". That is the v0.9.0 lesson again:
    a plausible fixture is missing exactly what nobody thought to put in it.
  - **UPLOAD PHOTO ID ENDS GUEST 1** (owner's pick, v0.27.0; matcher FIXED
    in v0.27.1). The row has NO named input and takes TWO shapes on live
    (Director, 2026-10-06, attributes only):
    - file stored (19615): `tr.mphb-link-button-row` > `th` > `label[for="mphb-mphb_upload_id"]`;
      `td` > `div.mphb-ctrl-wrapper.mphb-ctrl.mphb-ctrl-link-button` > `a.button` "View file";
    - no file (19600, 18462 — most bookings; only 19 hold a photo):
      `tr.mphb-placeholder-row`, same `th` label and `for`; `td` > `div…mphb-ctrl-placeholder` >
      `label` "File is not uploaded".
    **The match is the label's `for="mphb-mphb_upload_id"`** (prefix doubled:
    MotoPress's `mphb-` + the field name), which both shapes carry; the value is
    built from `Id_Files::META_KEY`, never retyped. **0.27.0 matched on
    `mphb-link-button-row` and so missed every booking without a photo** — the
    class changes with the row's STATE, and `mphb-placeholder-row` is generic
    MotoPress. So: never a row class alone, never the label text, and no match
    leaves the row under "Other", visible. The fixture carries both live shapes,
    a class-only row (must not match) and an unrelated placeholder row (must not
    be taken). Mutation `js-photo-nofile-missed` reproduces 0.27.0's defect and
    the no-file fixture kills it. **Lesson: a fixture holding one STATE of a row
    tests that state** — the v0.9.0 rule needs "every state the live markup
    takes", not only "real markup".
  - **EXISTING BOOKINGS ARE GATED BY THEIR OWN COTTAGE** (owner's pick,
    v0.27.0; **RETIRED in 0.28.0** — kept for the record. Nothing on the edit
    screen is gated by cottage any more: Guest 3/4 follow the count and Dog
    follows the pet fee. The 0.28.0 mutation run proved it — the two mutations
    on this path SURVIVED because the value fed only the fee's couch test, and
    the edit screen has no service boxes — so `booking_room_types()` and
    `CFG.statedRoomTypes` were removed rather than kept as apparent coverage.) The edit screen carries no accommodation control (the only
    room-ish input is `mphb_rooms-hide`), so the gating read nothing and showed
    everything. `Admin_Fields::booking_room_types()` reads the reserved rooms
    by the live-confirmed chain (post_parent → `_mphb_room_id` →
    `mphb_room_type_id`) and states them as `CFG.statedRoomTypes`, which the
    script treats exactly like the add-booking step's marker. **All or
    nothing**: one unreadable room states nothing, and the screen shows
    everything as before — a partial answer could hide a group the unreadable
    room needs. **SUPERSEDED IN 0.28.0 for Guest 3/4:** they now follow the
    saved guest count (see the 0.28.0 entry below). 0.27.0 hid them unless
    stored or "Show all" and read no count; Rob then chose the count, used AS
    STORED — so an import whose `_mphb_adults` MotoPress filled with the
    capacity (4) now shows Guest 3 and 4 headings over empty rows. That is
    his informed pick, not an oversight.
  - **"Show all booking fields" and its hint are GONE** (owner's pick,
    0.28.0: "Remove it; dropdown everywhere"). With it went the full-width
    `tr.dcc_admin-showall-row` (0.27.0), the fail-open `hatch.update()` path
    (0.27.0), `NEED_SHOW_ALL` and the "Guest %s details are hidden…" hint —
    those strings no longer exist, so LocoTranslate will list their
    translations as obsolete.
- **0.28.0 — THE BOOKING SCREENS ARE DRIVEN BY FACTS, NOT BY A TOGGLE** (Rob's
  picks from his Add New recordings, 2026-10-06/07; `admin-booking.js`
  rewritten). Three rules in order: **fail open** (anything unreadable shows),
  **a filled field always stays visible** (with a note when the facts say it
  would otherwise be hidden — nothing is ever cleared), **facts decide**.
  - **Guest count drives Guest 3/4** — and Guest 2 since 0.29.0 (below), so
    `guestGroups` now carries EVERY group and "Guests included" no longer
    moves which are gated (it still moves the fee). A group shows when the
    count is ≥ its `min` from `guestGroups` (never a literal). The count is the SAME one the fee sync reads: MotoPress's
    `[adults]` selects, else the Guests box (`dcc_adults[...]`), else
    `CFG.statedGuests`. Several rooms → the maximum; any blank → null → show.
    Lowering the count re-hides an empty group; a filled one stays with the
    note "More guest names than guests." (`dcc_admin-group-note`).
  - **`Admin_Fields::booking_guest_count()`** states the saved count on the
    edit screen: max `_mphb_adults` over the reserved rooms, used AS STORED
    (Rob's pick — see the capacity-fill caveat in the 0.27.0 entry above).
    One room unreadable or < 1 → null → show everything.
  - **The Extra Guest Fee row is NEVER shown on wp-admin**
    (`.dcc_admin-fee-row`, `!important`), not even before the count is read.
    Number of Guests is its only control: `syncExtraGuestFee()` ticks it above
    the included guests and **always writes the multiplier**, unticking too —
    MotoPress prices a ticked box × its "for N" select, and a stale N was a
    wrong charge waiting for the next tick. No waive or override (Rob). If
    every service row on the screen is ours, the "Additional Services"
    heading hides with it.
  - **The read-only fee line** `p.dcc_admin-feeline` under Number of Guests:
    "Extra guest fee: 1 guest × $50/night" / "%1$d guests × …". Nothing at or
    below the included guests. Add New only — the edit screen has no services
    UI.
  - **"Pet Fee:" Yes/No dropdown** (Rob's own design, replacing a checkbox he
    called "floating mislabeled"), placed after Number of Guests on Add New.
    Yes ticks the stay-length bucket and shows Dog; No unticks it and hides
    Dog. **The bucket is chosen by PHP**: `wizard_pet_service()` →
    `Config::service_id_for_nights()`, printed as `data-dcc-pet-service` on
    the room-context marker — the JS never re-derives it. With no stated
    bucket the room's ONLY pet box is used; with several and none stated the
    native rows stay visible with "Choose the pet fee under Additional
    Services." — never a guess between prices. **SUPERSEDED IN 0.29.0:** it
    was offered on every cottage, saying "This cottage has no pet fee, so
    nothing is charged." on the others; it now appears on a pet-fee cottage
    only (below). The dropdown has NO `name`, so it never submits. The native
    pet rows are hidden; the boxes still submit (display-only hiding, as on
    the checkout). The search step (no `[adults]` chooser) gets no dropdown.
    VERIFIED (live 6.3.0): Booking has `getCheckInDate()`/`getCheckOutDate()`
    (booking.php:487/495); Rob's 0.29.0 phone test added the pet fee on 34.
  - **Edit screen: a read-only "Pet fee: Yes/No" line** at the end of the
    Guests box (`Admin_Guests::render()`), and Dog follows it.
    **`Admin_Fields::booking_pet_fee()`** reads `_mphb_services` on the
    reserved rooms in the three shapes the Calendar's `has_pet_service`
    accepts (list of ids, map id⇒qty, list of arrays with `id`) against
    `Config::pet_service_id_list()`. Absent/empty → no fee; any other
    unreadable shape → null → "could not be read, so the dog details are
    shown." **Read correctly on live** (Director, 2026-10-07, 0.28.0): the line
    said "Yes" on 17730 and "No" on 19615, 19600 and 18462 — the PHP reading
    works. It was the trip to the browser that lost it (0.29.0 entry).
  - **Add New customer step gets the order and headings** (C). That step is
    MotoPress's FRONT-END form (`<p>` rows in `section#mphb-customer-details`),
    so `customerLayout()` has a FLOW mode beside TABLE mode: headings are
    `div.dcc_admin-group-heading`, control-less elements before the first
    known row stay first, control-less ones after a known row travel with it
    (hints, `<br>`s). It **stands down** — a console note, the step left as
    drawn — if the box also holds an adults select or services, because then
    it is not the customer box. Labels untouched.
  - **THE ADD NEW FIXTURE IS A STAND-IN BUILT FROM ROB'S RECORDINGS** (Cottage
    36, Nov 20–21 2026), not markup: that step needs a login and a Reserve
    press. **It MATCHED on live** (Rob's phone, 0.28.0, Cottage 22, Oct 23–24
    2026): headings Guest 1 / Address / Guest 2 drawn, MotoPress's labels
    unchanged, and Total Price / Status / "Submit Booking" sit after the
    fields with NO "Other" heading — so they do not share the customer
    container. The live step has **no Customer Note field**, so "Note" never
    appears there. Still a reconstruction: **when real markup is available,
    replace it** (v0.9.0, again).
  - **Price Breakdown "proof" is of the INPUTS**: the suite's stand-in prices
    $175 + $50 × multiplier per ticked fee + $35 pet, and asserts 1/2/3/4/2/1
    guests read $194.25 / $194.25 / $244.25 / $294.25 / … and the pet total.
    It proves what MotoPress is GIVEN (which boxes, which N), not MotoPress's
    arithmetic.
  - **Fixed in passing: the Guests box was being decorated as a fee chooser**
    since 0.27.0 — `dcc_adults[...]` matched the `select[name*="adults"]`
    fallback and got "(+$50/night)" option suffixes on couch cottages.
    `adultsSelects()` now excludes `dcc_` names and anything under
    `[services]`. **That exclusion is now a BELT, not the guard**: once
    `statedRoomTypes` was retired (below), the edit screen has no cottage
    stated and no accommodation control, so `couch` is false there and nothing
    is decorated either way. Mutation `js-adults-includes-dcc` was therefore an
    equivalent mutant — it SURVIVED the second 0.28.0 run — and was retired
    rather than kept as apparent coverage. The outcome assertion ("the Guests
    box options carry NO fee label") stays in `tests/admin-layout/`.
  - **Phone width (F), admin only**: at ≤ 782px a service label stacks — tick
    + name, price (`<em>`), the "for N" picker — via
    `label:has(input[name*="[services]"][name$="[id]"])`. Unchanged at 1280.
    **The public checkout cannot have this overflow**: it hides the native
    services section outright (v0.7.0), so there is nothing to report there.
  - Unchanged: stored data, field names, save logic; `checkout.js` /
    `checkout.css` untouched.
- **0.29.0 — A BOOLEAN DOES NOT SURVIVE `wp_localize_script`** (Director's
  live check of 0.28.0, 2026-10-07). `WP_Scripts::localize()` casts every
  TOP-LEVEL scalar with `(string)` (WordPress 6.6.2,
  `class-wp-scripts.php:589-597`, read from source): `true` → `"1"`,
  `false` → `""`, ints → strings; `null` and arrays pass untouched. 0.28.0
  sent `statedPetFee` as `true/false/null` and the script tested
  `=== true / === false`, so Yes and No both read as unknown and Dog showed
  on every booking. **It shipped green because the suite printed PHP's
  `json_encode()` straight into the page** — the step that does the damage
  was never in the harness. Now:
  - `statedPetFee` is ONE WORD from `Admin_Fields::booking_pet_state()`:
    `yes` / `no` (pet-fee cottage, fee carried or not), `none` (not a pet-fee
    cottage), `unknown` (cottage or services unreadable → Dog shows).
  - `tests/admin-layout/config.php` runs WordPress's localize loop, copied
    verbatim, before printing, so every suite case sees what a browser sees,
    and asserts `typeof statedPetFee === 'string'`. Mutations
    `php-stated-pet-boolean` and `js-pet-state-reads-boolean` put the 0.28.0
    defect back and must go red.
  - **Audit, done**: every other top-level value either is already a string,
    is numeric and read with `parseInt`/`Number` (`statedGuests`,
    `includedGuests`), or is an array. The PUBLIC checkout localizes three
    booleans (`petFeeEnabled`, `guestFeeEnabled`, `isAdmin`) and reads each by
    truthiness, which `"1"`/`""` preserve — no defect there, nothing changed.
  - **Rule: never localize a three-state as a boolean, and never test a
    localized top-level value with `===` against `true`/`false`.** Use a word,
    or nest it in an array, or `wp_add_inline_script` with `wp_json_encode`.
- **0.29.0 — THE PET FEE BELONGS TO A PET-FEE COTTAGE** (owner: "Keep 34 as the
  only pet fee cottage" / "No Pet Fee on others"; [Director] defaults marked).
  A pet-fee cottage is one whose MotoPress services include a pet service —
  read, never listed: `Config::room_type_has_pet_services()` via the admin
  `roomTypes` map and `Admin_Fields::booking_pet_cottage()`. **Not**
  `Config::pet_accommodations()`, which was deliberately not touched.
  - Add New: the Pet Fee dropdown only there. Any other cottage: no dropdown,
    no Dog, no message (Dog still shows if a dog value is present). Cottage
    unreadable [Director], or a pet-fee cottage with no pet service on screen:
    no dropdown (nothing it could be sure of charging) and Dog SHOWS.
  - Edit screen: the "Pet fee: Yes/No" line only there [Director]; elsewhere,
    and on an unreadable cottage, no line. Dog: hidden on other cottages unless
    dog values are saved; shown when anything is unknown.
  - **AN EMPTY SERVICES LIST IS A DEFINITE "NONE"** (Director). Cottage 33
    (1604) has one, and `room_type_service_ids()` turned every empty result
    into `null`, so the map called it `unknown`. It now returns `[]` for a
    list READ AS EMPTY; a list with entries none of which parse is still
    `null`. Mutation `cfg-empty-services-unknown`. Only the admin calls it.
  - MotoPress services, the public checkout and `checkout.js`/`checkout.css`
    are unchanged (byte-identical to 0.27.1/0.28.0).
  - **The search step is now guarded three times** — the `[adults]$` name
    test, the pet-fee-cottage test and "a pet service on screen" (the search
    step has none). So mutation `js-pet-on-search-step`, which removed the
    first, became an equivalent mutant and SURVIVED 0.29.0's first full run;
    it was retired, and the search-step fixture now carries the recordings'
    Accommodation Type select set to Cottage 34 — the worst case for it.
- **0.29.0 — GUEST 2 FOLLOWS THE COUNT** (owner: "responsive to the number of
  guests selected … just like Guest3, Guest4"). Same rules: shown from 2,
  hidden at 1 unless a value is typed or saved (then it stays with the note),
  never cleared; an unknown count ("Not provided") shows it [Director]. Done
  by sending every group in `guestGroups` (mins 2, 3, 4) — the filter on
  `min > included_guests` is gone, so **"Guests included" no longer changes
  which fields are gated**; it still moves the fee and the fee line.
  Mutation `php-guest2-not-gated`.
- **0.29.0 — FULL GUEST NAME FILLS FROM GUEST 1 ON ADD NEW** (owner's pick).
  `fillGuestNames()` in `admin-booking.js`: First + Last, joined by a space,
  into every room's box as they are typed. A box that holds anything other
  than what the script last wrote — prefilled, or edited by hand — is the
  admin's and is never written again. It sets `.value` (a property, no DOM
  mutation, so the observer and the three-tap rules are untouched) and only
  reaches the server if the admin submits. Found by MotoPress's own markup —
  `mphb_room_details[N][guest_name]` or the input in
  `.mphb-guest-name-wrapper` (that class is confirmed: the site's Customizer
  CSS hides it on the public checkout). **VERIFIED** (live 6.3.0,
  checkout-view.php:290–294): `<p class="mphb-guest-name-wrapper"><label
  for="{idPrefix}-guest-name">…<input type="text" name="{namePrefix}[guest_name]">`,
  preset via `mphb_sc_checkout_preset_guest_name`; Rob's phone test: it
  fills. When neither selector matches it does nothing. Add New only.
- **0.30.0 — THE ACCEPTANCE BOX AND THE ACCEPTANCE RECORD** (Rob's picks
  2026-10-07: "One box, both links" / "Yes, record it"; `Policies` and
  `Policy_Record`; suites `tests/policy/run.php` and `tests/policy/browser.js`).
  - **ROB'S STANDING RULE: THE POLICY'S TERMS LIVE ONLY ON THE POLICY PAGE.**
    This plugin, its settings defaults and its notes LINK to it and never
    restate it — no time limits, amounts or conditions of any kind. If the
    policy changes, nothing here can be left saying the old thing.
    `tests/policy/run.php` scans the feature's PHP, the readme and THIS FILE
    for such wording and goes red on a hit.
  - **Label**: "I've read and accept the Terms & Conditions and the
    Cancellation & Refund Policy." — two links, new tab (`target=_blank`,
    `rel=noopener`). Terms URL from MotoPress's `mphb_terms_and_conditions_page`
    (2515); the policy page BY ID from the settings picker
    (`refund_page_id`, default 2394 — "Checkout policies" on the settings
    page). Either page missing/unpublished, or none chosen → MotoPress's
    original label exactly [Director].
  - **How it is swapped**: a `gettext_with_context` filter added at
    `mphb_sc_checkout_form` priority 59 and removed at 61, around MotoPress's
    `renderTermsAndConditions` at 60. It matches
    the exact msgid + context the Director read, and returns the full label
    with every `%` doubled, because MotoPress feeds it to `printf()` with its
    own link as the one argument (ignored — ours has no placeholder; PHP 8
    throws on an unknown specifier, so an unescaped `%` in a URL would crash
    the checkout render). Scoped, so any OTHER use of that msgid keeps
    MotoPress's wording. **VERIFIED in live MotoPress 6.3.0** (Director,
    2026-10-07): `checkout-view.php:498` prints the label UNESCAPED (phpcs:ignore),
    the box's only caller is `step-checkout.php:79`, the sentence appears
    nowhere else in MotoPress's PHP or JS, and Add New Booking has no terms
    box. The label is rendered only when `mphb_open_terms_in_new_window` is on
    or terms text is set (live: on). Its `<label>` has NO `for` — it wraps the
    input; the test render is now that markup verbatim.
  - **THE TICK DOES REACH THE SERVER — inside `customer_fields`** (Director,
    live 6.3.0 source, 2026-10-07; the "probably not" this entry first carried
    came from an old staging trace and was WRONG). `mphb.js`
    `_parseBookingDetails()` puts every unknown `mphb…` form field into
    custom_fields, and `_buildFormData()` sends it as
    `customer_fields[mphb_accept_terms]=1` (multipart, so `$_POST` is filled
    too); an unticked box is not sent at all. `ParseUtils::parseCustomer()`
    then keeps only REGISTERED customer fields, so the BOOKING never carries
    it. The record therefore reads the REQUEST (captured at
    `rest_request_before_callbacks`), never booking data, and "received" means
    exactly the string `'1'`. Lesson: a payload "trace" of the keys that
    survive is not a trace of what was SENT.
  - **The record** (`_dcc_policy_acceptance` on the booking, written once at
    `mphb_create_booking_by_user`, `add_post_meta(..., unique)`, never over an
    existing row and never to an existing booking): `at_gmt`, `tick`
    (`received`/`not_received`), `label` (plain text as shown), and per page
    `role`, `id`, `sha256`, `modified_gmt`, `saved`. **Nothing about the
    guest.** `not_received` is never displayed as "accepted" ("Booked online:
    …. The acceptance tick did not reach the server …").
  - **A VERSION IS ITS CONTENT, NOT ITS DATE.** The fingerprint is SHA-256 of
    `{page_id, title, post_content, _elementor_data}` — the Director found
    CLI edits to `_elementor_data` that never bump `post_modified`, which is
    kept only as a hint. One copy per distinct fingerprint, in the private
    post type `dcc_policy_version` (meta `_dcc_pv_bundle` + `_dcc_pv_sha256`).
    **Stored in META, slashed**: post_content passes kses for an anonymous
    guest's request, and `add_post_meta()` UNSLASHES — Elementor's JSON is
    full of backslashes, so an unslashed write comes back altered. The copy is
    read back and re-hashed; one that does not match is not reported saved,
    and the viewer says so. Mutation `pol-version-unslashed` pins it.
  - **Who made the booking** (display order): a record → it; an import
    (`mphb_ical_prodid` non-empty on the booking — live: on 143 of 413
    bookings, on no reserved room; the reserved-room fallback is kept from the
    Availability Calendar's reader) → "Imported booking — not accepted on this
    site" (Rob's pick "Distinguish imports"); a staff mark → "Entered by staff —
    not accepted online"; otherwise "No online acceptance on record".
  - **STAFF IS DECIDED BY MOTOPRESS'S OWN SIGNALS, NOT A REFERRER** (0.30.1).
    0.30.0 used the wp-admin referrer and was wrong in the way that matters:
    Add New Booking's "Submit Booking" POSTs to `/mphb/v1/checkout/admin`
    (`SubmitAdminCheckoutController extends SubmitCheckoutController`), whose
    parent FIRES `mphb_create_booking_by_user` — so a staff booking would have
    been recorded "online" whenever no referrer came through. Now staff = any
    of: `mphb_is_current_request_for_admin_ui` true (the admin controller adds
    `__return_true` around its parent call), the
    `mphb_admin_checkout_rest_before_start` action, or the admin route itself
    — each tested ALONE, with a mutation each. An online record needs the
    exact public route `/mphb/v1/checkout`. The `$_POST` fallback and the
    `wp_insert_post` staff marker were REMOVED: no live path was shown to use
    them, and the owner's rule is to act only on what is proven.
  - **STAFF ADD NEW BOOKINGS SKIP THE REST BACKSTOPS** (Rob: "Skip for staff",
    0.30.1). Found in 0.30.0: `Rest_Guard::route_matches()` is a SUBSTRING
    test on `/mphb/v1/checkout`, which `/mphb/v1/checkout/admin` contains, so
    the Guest 2/3/4, pet and extra-guest backstops validated every Add New
    submission although the wp_loaded backstops deliberately exempt wp-admin.
    Now `intercept()` returns untouched for the EXACT admin route
    (`Rest_Guard::is_admin_route()`, trailing slash tolerated, look-alikes still
    checked). Safe because MotoPress's `SubmitAdminCheckoutController::
    is_request_allowed()` requires `checkPostPermissions(booking, 'create')`
    (Director, live 6.3.0). **`route_matches()` was deliberately NOT narrowed**:
    `defer_to_rest()` shares it and must keep the wp_loaded backstops standing
    down on BOTH routes. **The brief asked for `mphb_is_current_request_for_
    admin_ui` to back this — it cannot**: the guard runs at
    `rest_request_before_callbacks`, and MotoPress adds that filter inside the
    admin controller's callback, AFTER it; code testing it there would always
    read false, so none was added. Tested by sending one violating payload to
    both routes (`tests/backstops/`): refused on the public route (the
    guard-on-the-guard), passed on the admin route; mutations
    `guard-admin-checked`, `guard-admin-prefix`, `guard-exempt-all`.
  - **Viewer**: `admin-post.php?action=dcc_policy_version&sha=…`, `edit_posts`,
    read only, the derived text through `wp_kses_post` plus the exact stored
    data escaped. No enforcement anywhere: a booking is never refused over
    the tick (owner's instruction).
  - `checkout.js` / `checkout.css` UNCHANGED. The browser suite places the
    PHP-rendered box in a form styled by the shipped `checkout.css` at 390
    and 1280: wording, both links, a real new tab, still `required` (the
    form will not submit unticked), no overflow, and the fallback.
  - **The runner's "WIRED UP BUT NOT ON DISK" was itself wrong for any suite
    not named `run.*`** — it tested membership of a `run.*` glob, not
    existence, so `tests/policy/browser.js` read as missing while it ran.
    Fixed to test existence; proved both ways (moved away → flagged).
- **0.30.1 — ADD NEW BOOKING'S RESULTS TABLE SAYS WHAT ITS NUMBERS ARE**
  (Rob's picks 2026-10-07; `Results_Labels`, suites `tests/results/run.php`
  and `tests/results/browser.js`). Rob searched 2 adults and read "Capacity:
  Adults: 4 Children: 0" as a wrong count (it is the cottage's MAXIMUM), and
  "Base price" is the WHOLE STAY's total before fees and taxes (live: $700
  for 4 nights). Now "Capacity" → **"Sleeps up to"**, cell =
  `RoomType::calcTotalCapacity()` (total capacity if set, else adults +
  children — verified 6.3.0), plus " · up to N child/children" ONLY when the
  children capacity is > 0 (none live: 1065/1067/1069/1071/1740/1742 = 4/0/4,
  1604/1607 = 2/0/2); "Base price" → **"Stay total before fees & taxes"**
  (Rob corrected an earlier "Nightly rates…": the amount is per stay). The
  search form, including Children, is untouched.
  - **Scope, by MotoPress's own hooks**: the template
    `templates/create-booking/results/reserve-rooms.php` (read VERBATIM by the
    Director on live 6.3.0; the test renders a copy of it) fires
    `mphb_cb_reserve_rooms_form_before_start` and `…_after_end` around the
    form. Only between them, only on `page=mphb_add_new_booking&step=2` in
    wp-admin, is the output buffered and rewritten. **No gettext filter of any
    kind** — 'Capacity' is MotoPress's word in Google Hotels data, the
    room-type editor and the accommodation list; asserted.
  - **All or nothing**: every table must have exactly MotoPress's four
    headings, every row must match (checkbox naming its room type, the
    "Adults:&nbsp;N Children:&nbsp;M" cell AGREEING with that room type's own
    capacities), or the whole form is printed exactly as drawn. Matched on
    MotoPress's strings AS TRANSLATED, so a translated site still matches.
    Constructed: unreadable room type, disagreeing cell, total 0, a fifth
    column, one changed table beside a normal one, one odd row beside a
    normal one, a foreign table — each leaves the form byte-identical.
    Mutation `res-head-unmatched` SURVIVED at first: every "changed heading"
    case changed EVERY table, where skipping one and refusing all look the
    same; the mixed case (one changed, one normal) is what tells them apart.
  - **0.30.2 — HEADINGS IN ROB'S WORDS** (2026-10-07, after 0.30.1 passed
    live): the capacity column is headed **"Capacity"** again — MotoPress's
    OWN heading, left byte-for-byte as it prints it (not re-printed under
    `dcc-checkout`), so a translated site keeps MotoPress's translation — and
    the price column reads **"Total (minus taxes/fees)"**. "Sleeps up to" and
    "Stay total before fees & taxes" are gone (LocoTranslate will list them
    obsolete). Cells unchanged. **Consequence: the Capacity heading no longer
    distinguishes "relabelled" from "left as drawn"** — the CELLS do (no
    "Adults:" in a recognised table) plus the price heading. Recognition
    still requires all four of MotoPress's headings. Asserted on the cells;
    mutation `res-cells-not-rewritten` (recognise, count, but leave the cell)
    must go red.
  - **0.30.3 — EVERY ROW IS COUNTED, HOWEVER ITS TAG IS WRITTEN** (self-audit,
    2026-10-09; reproduced before fixing). The row total counted bare `<tr>`
    only, and the row pattern matches bare `<tr>` only, so a row written
    `<tr class="…">` was neither matched NOR counted: the table passed the
    all-or-nothing check and was relabelled around one row left in MotoPress's
    wording. Now `<tr\b` (any case) is counted, so such a row refuses the whole
    table. Latent — the live template (Director's verbatim read) uses bare
    `<tr>` — but a MotoPress update or a theme template override could change
    that, and **only SSH can say whether the theme overrides
    `create-booking/results/reserve-rooms.php`**. Mutation
    `res-row-count-bare-tr`.
  - The rendered markup (Director, K) has `&nbsp;` in the cell and the price
    as `<span class="mphb-price">`; the price cell is never touched. The
    browser suite REPRODUCES only WordPress's `.widefat`/`table.fixed` rules
    (core admin CSS is not available here) — the Director's read-only look at
    step 2 is the real check.
- **0.31.0 — THE BOAT / TRAILER CHECKOUT FIELD** (owner's picks A–D,
  2026-10-10; `Boat_Field`, suite `tests/boat/run.php`). A NATIVE Checkout
  Fields field this plugin creates ONCE; MotoPress renders and saves it on the
  checkout, Add New and the edit screen. **The Availability Calendar depends
  on the contract**: post_title "Bringing a boat or trailer?", `mphb_cf_name`
  `boat`, type `select`, options blank / No / Yes, required 0, enabled 1;
  MotoPress stores the answer as booking meta `mphb_boat`
  (getCustomFields()['boat']). Every value is copied from the Director's RAW
  read of Dog Size (17727) on live: the full `mphb_cf_*` key set, and
  `mphb_cf_options` as a PHP array of `['value','label']` rows — the add-on
  1.2.3 reads it with `get_post_meta(…, true)` and uses it only `if
  (is_array())`, so JSON would be an EMPTY dropdown with no error (the brief
  first showed it as JSON; the CLAUDE.md entry above was right). Label = the
  post_title (`mapPostToEntity()`); no definition cache in the add-on.
  - **Created once, never recreated** (C): on an administrator's admin page
    load (never AJAX), with the add-on active. A marker option
    `dcc_checkout_boat_field` records the run, and while it exists nothing
    runs — no query at all. A field named `boat` in ANY status, trash
    included, is ADOPTED untouched. The claim is `add_option()` of the marker
    BEFORE anything is written; a failed insert releases it. **A request that
    dies after the claim and before the record leaves `state => creating`
    for good** — then nothing more happens; the Director can read the option.
  - **Position** (A, which overrides the brief's "never renumber"): live had
    upload_id 14 and dog_type 15, no gap, and the add-on's order for TIES is
    unknown, so renumbering is the only proven way. Only in the creating
    request, and only if Photo ID is still directly before Dog Type with
    nothing between: boat takes 15 and every field at 15+ moves down one
    (dog_type…guest4_last_name → 16–23), each move recorded `{id,name,from,to}`
    in the marker. A gap → boat takes it, nothing moves. Anything else (Rob
    reordered, a field missing) → boat goes LAST, nothing moves. Positions are
    written with `$wpdb->update` on menu_order + `clean_post_cache`, never
    `wp_update_post()` (that fires every save_post handler); meta is written
    AFTER `wp_insert_post()` so a save_post handler cannot override it.
  - **Where it renders on the checkout** (measured in `tests/breakdown`):
    `checkout.js` moves the dog rows into the "Pet Information" section placed
    straight after the customer details, and the guest 3/4 rows into their own
    sections, and `note` is disabled on live — so boat is the LAST field in the
    customer details, after Photo ID, with Pet Information (Cottage 34)
    directly below. `checkout.js` knows nothing of it and was not changed.
  - **WP-Admin**: group `boat`, "Boat / trailer", after Dog, before Note in
    `customer_layout()`. Nothing in the gating governs it, so it shows on every
    booking — asserted with Guest 2 and Dog both hidden around it.
  - **NOT verifiable here**: that MotoPress saves the answer on an imported
    booking's edit screen, and that getCustomFields()['boat'] returns it — both
    are MotoPress's code. Rob checks both on staging (D).
- **0.32.0 — "EXTRA DETAILS/OPTIONS", IMPORTS, THE IMPORT DEFAULT, AND THE
  CONFIRM-ON-EVERY-SAVE FIX** (Rob's picks A–D + the Director's E,
  2026-10-10; `Extra_Details`, `Ical_Defaults`, `Edit_Flow_Markers`; suite
  `tests/extras/run.php`, plus `tests/admin-guests/` and `tests/admin-layout/`).
  - **A — the box**: `dcc-checkout-extras`, side/default, registered NEXT after
    `Admin_Guests` in `Plugin::boot()` so WordPress draws it directly under
    "Guest count" (asserted from the boot order). PHP draws only what this
    plugin owns — the pet part and an empty `tbody#dcc_extras_rows`;
    `admin-booking.js` `extras()` MOVES MotoPress's Dog and boat rows into it
    (never re-creates: same form, same submitted fields — asserted), BEFORE the
    Customer Information layout so they are never "Other", and again on every
    observed re-render. `customer_layout()` no longer has `dog`/`boat` groups.
    Add New: a `div.dcc_admin-extras` block right after the room's Number of
    Guests, opened by the Pet Fee dropdown (Rob's pick 6). No script → the
    rows stay in Customer Information, still working.
  - **B — NOT BUILT AS ONE TAP; THE FALLBACK SHIPPED.** The brief: prove room
    ids and `_mphb_adults_confirmed` unchanged AND the total equal to
    MotoPress's own flow, or fall back. The total cannot be proven without
    MotoPress, and the one-tap code needs calls never read here (ReservedRoom
    getters, `ReservedService::create()` args, `updateReservedRooms()`
    signature). So a direct pet-fee booking's box shows "Pet fee: Yes/No" and
    a COPY of MotoPress's own `a[href*="page=mphb_edit_booking"]` (only the
    slug is proven; no link is built when MotoPress shows none — it does not
    on imports). **`Edit_Flow_Markers`** carries the marker across that flow,
    which DELETES and recreates every reserved room (Director, live 6.3.0):
    `before_delete_post` remembers a confirmed room's physical room + count,
    `mphb_booking_edited` writes the marker back on the new room with the SAME
    physical room AND count. Fails safe: nothing remembered → nothing written.
    **VERIFIED from live 6.3.0 source (Director, 2026-10-11):**
    `AbstractPostRepository::delete()` → `ReservedRoomPersistence` (extends
    `CPTPersistence`, no override) → `CPTPersistence::delete()`
    (persistences/cpt-persistence.php ~194) fires
    `mphb_reserved_room_persistence_before_delete_post` then `wp_delete_post()`
    — so `before_delete_post` fires and the carry holds.
  - **C — imports record, never charge** (Rob: "all extra fees have to be
    added in the OTA"). Import = `mphb_ical_prodid` (`Policies::is_imported`).
    Pet part on an import: "Bringing a dog?" → booking meta **`_dcc_dog` =
    `yes`/`no`, absent = not asked — THE CONTRACT WITH THE CALENDAR** (its
    Pets rule: dog_type OR pet fee OR `_dcc_dog = yes`), written only by
    `Extra_Details::save()` (nonce, `edit_post`, import AND pet-fee cottage,
    yes/no only). `booking_pet_state()` reads it for imports; the live select
    drives Dog in the browser. `syncExtraGuestFee()` returns at once for an
    import (`CFG.isImported`, a word) — constructed with the fee's row, a
    4-guest chooser and a couch cottage on the page, which on a direct booking
    DOES tick (the guard-on-the-guard).
  - **D — imports start at 2.** On `mphb_create_booking_via_ical($booking)`
    (rooms already saved, read fresh by `post_parent`): `_mphb_adults` →
    min(2, importer's value); never raised, never on a confirmed room, never
    marked confirmed. Children NOT written: the key IS `_mphb_children`
    (ReservedRoomRepository::mapEntityToPostData ~187, Director 2026-10-11),
    but every live cottage's children capacity is 0, so the importer already
    writes 0 and writing it again would change nothing. Nothing hooks `mphb_update_booking_via_ical`, and
    `updateBooking()` never writes adults (Director), so syncs keep the 2. No
    migration: the Director changes #18098/#19600/#19639/#19670 by hand.
  - **E — confirm only on a choice.** EVERY Update submits the Guest count
    select, so 0.23.0's "submitting IS the human act" confirmed the importer's
    default on any save (found on staging: 18433, 19600). Now an UNCONFIRMED
    count renders a first option `keep` = "N (not confirmed)", selected, with
    no number pre-selected; `keep` writes nothing; choosing any number — the
    same one included — confirms; a confirmed count resubmitting itself writes
    nothing; "Not provided" unchanged. The JS reads `keep` as the stored number
    (`data-dcc-stored`) — tested with a stored 2, because an unreadable count
    would fail open and show Guest 3 anyway. The save-side `keep` guard is a
    BELT (`(int) 'keep'` is 0, refused by the range check), so it carries no
    mutation of its own. Existing markers left alone.
  - Two vacuous checks found while writing these, both fixed: the admin-guests
    stand-in had no booking repository, so every "no log line" assertion read
    an array nothing ever wrote; and an `inBox` helper read `<label>` text, so
    "no pet part" could not fail on the label-less "Pet fee:" line.
- **0.32.1 — ROB'S 0.32.0 REVIEW, ITEMS 1–4** (2026-10-11; `admin-booking.js`,
  `Extra_Details::wanted()`, `Admin_Guests::boat_home_html()`,
  `Admin_Fields::boat_field()` / `is_edit_accommodations_flow()`).
  - **THE iPHONE "SELECT FLASHES AND CLOSES" WAS A SELF-FEEDING LOOP IN
    `extras()`** (bug 1, reproduced before fixing). 0.32.0 re-appended a moved
    row whenever it was not the container's LAST child — with several rows,
    always — so each run moved every row, the MutationObserver saw it, and ran
    again 200ms later, forever. It needed ONE stray DOM change to start (the
    probe: zero moves with none, 28 node removals in 1.5s with one, and the
    focused boat select lost focus); WordPress's admin scripts supply those.
    A detached-and-reattached `<select>` drops iOS's picker, which is why the
    MOVED boat / Dog Size / Dog Hair failed and our own "Bringing a dog?"
    (never moved) opened. **The 0.26.0 idempotence test missed it because it
    observed only the Customer Information tbody**; the new assertion
    observes `document.body` after a constructed stray change, on the edit
    screen and Add New. Fix: `place()` writes only when the rows are not
    already the container's last rows in order (mutation `js-extras-loop-0320`).
  - **NOTHING IS MOVED WHILE IT HOLDS FOCUS** — `holdsFocus()` / `afterBlur()`,
    for `extras()` AND `customerLayout().arrange()` (which re-appends every node
    of its box, so a focused field anywhere in it would be detached). A move
    that finds focus inside waits for `focusout`, then runs. Asserted with a
    row put out of place and focused (mutations `js-extras-moves-focused`,
    `js-layout-moves-focused`), and per select with touch emulation: tapped,
    still focused 1.2s later, never detached. **A headless browser cannot open
    a native picker**; focus and detachment are what close it, and those are
    what is measured. The iPhone is the real check.
  - **The boat question lives in "Guest count", under the count** (item 4,
    Rob's change): `Admin_Guests::boat_home_html()` (`tbody#dcc_boat_row`),
    printed in both the rooms and no-rooms branches. "Extra Details/Options"
    holds the pet part and Dog only, and **is not registered at all** unless
    `Extra_Details::wanted()`: a pet-fee cottage, an unreadable cottage (fail
    open), or a booking with a dog answer saved (a filled field keeps a home).
    That needs `add_meta_boxes`' SECOND argument — registered `10, 2`; the
    extras suite's `do_action` stub now passes only the registered argument
    count, as WordPress does, so `ed-box-one-arg` is observable. Add New:
    Number of Guests → (fee line) → `div.dcc_admin-boat` → `div.dcc_admin-extras`,
    whose heading hides when nothing in it is visible. Checkout unchanged.
  - **EDIT ACCOMMODATIONS IS LEFT AS MOTOPRESS DRAWS IT** (item 3). The admin
    script loads on every screen id containing `mphb`, so 0.32.0 drew the Pet
    Fee dropdown in that flow, where no tier is stated: "Pet Fee: Yes" over
    three unticked boxes. PHP now sends `flow = 'edit-accommodations'` (a WORD)
    on `page=mphb_edit_booking` — the slug of MotoPress's own button, the only
    part proven — and the script draws no Pet Fee and moves nothing there.
    MotoPress's pet rows stay visible: that flow is the manual fallback.
    Full Guest Name there is unchanged (Rob). **VERIFIED for every step**
    (Director, live 6.3.0, 2026-10-11): every step's form posts to
    `EditBookingMenuPage::getUrl()` = `admin.php?page=mphb_edit_booking&booking_id=N`
    (+ `&lang=`), steps told apart only by `$_POST['step']` (edit → summary →
    checkout → booking, `detectStep()` ~97–108); the button opens the same URL.
  - **BUG 2 (a confirmed 1 came back 2) IS NOT FIXED, BECAUSE ITS SOURCE IS NOT
    PROVEN.** Proven: the script never writes Number of Guests — a matrix of
    confirmed 1 and 2 on a 2-sleeper and a 4-sleeper, each in the flow AND as
    0.32.0 ran there, through a pet tick, a guest-name edit and a stray change;
    `js-writes-count` plants a write and must go red. Proven by reading: no
    PHP here writes `_mphb_adults` in that flow (Admin_Guests needs its nonce;
    Ical_Defaults is iCal-only; Edit_Flow_Markers writes the marker only).
    **The carry rule is unchanged** (same physical room AND same count):
    carrying across a changed count would confirm a number nobody chose
    (Director agrees: keep it).
    **MOTOPRESS DOES NOT DEFAULT IT EITHER** (Director, live 6.3.0 source,
    2026-10-11): the final step's `ParseUtils::parseRooms()` (~295/328) takes
    `mphb_room_details[i][adults]` through `validateInt()` — empty or
    non-numeric stops the save with "Adults number is not valid", missing
    gives 0, no default. The checkout step's select
    (`CheckoutView::renderGuestsChooser`, ~207–260; first option empty
    "— Select —", then 1..capacity) is preset via
    `mphb_sc_checkout_preset_adults` ← `CheckoutControl::presetAdults()` ←
    `BookingDetailsUtil::addPresets()` = the EXISTING room's `getAdults()`.
    And **0.32.0's loop never moved that select**: measured on the 0.32.0 file
    (flow stand-in, tapped at 390px, one stray change): 21 other nodes went
    round in 1.5s, Number of Guests was never detached, kept focus, stayed 1 —
    now a standing assertion. So nothing in the code path turns 1 into 2; the
    remaining explanation is a pick in the flow. The label Rob saw, "Number of
    Guests" where MotoPress says "Guests", is NOT this plugin's (no string or
    gettext override here produces it) — it is MotoPress's own site
    translation, `wp-content/languages/plugins/motopress-hotel-booking-en_US.po`
    / `.l10n.php` ("Guests" → "Number of Guests"; Director, 2026-10-11). So
    the Number of Guests label on Add New and in the flow is MotoPress's
    "Guests" chooser. Rob's one-run check on 19674 decides the rest.
- **0.33.0 — FEES FOLLOW THE UPDATE BUTTON** (Rob: "Both follow Update";
  `Fee_Sync`, suite `tests/fees/run.php`). On a DIRECT booking that is not
  cancelled or abandoned, Update brings the reserved rooms' fee services into
  line with the booking screen: the "Pet fee" Yes/No control (Extra
  Details/Options, a pet-fee cottage with exactly ONE such room) adds or
  removes the pet service for the stay's length (`service_id_for_nights()`),
  and a CHANGED guest count adds, adjusts or removes the Extra Guest Fee on a
  cottage that carries it (`guest_service_id_for_nights()`, `count -
  included_guests()`, only while `guest_fee_active()`). ~~Then MotoPress's own
  sequence: `findById($id, true)`, rebuilt rooms, `setRooms()`,
  `updateTotal()`, `save()`, `updateReservedRooms()`~~ — **SUPERSEDED IN
  0.33.1: that repriced the whole stay (entry below).** `addLog()` — one line
  per Update, e.g. "Pet fee added; total $200 → $250", and the same text as a
  one-time admin notice. Imports and cancelled/abandoned bookings: never.
  - **ONLY ON A CHANGE MADE IN THAT UPDATE** (Rob's decision, 2026-10-11:
    "Leave it alone"). A
    booking whose stored fee disagrees with its count — an old booking, a fee
    the owner waived — is left alone when saved for any other reason. The
    count's "change" is the stored `_mphb_adults` snapshotted at
    `save_post_mphb_booking` priority 5, BEFORE Admin_Guests writes it at 10;
    the FIRST snapshot wins, because MotoPress's own save fires that hook
    again after the write (mutation `fs-snapshot-last-wins`). The pet
    control opens on the stored answer, so "changed" is "differs from what is
    stored".
  - **IT RUNS ON `redirect_post_location`, NOT ON save_post** (departs from the
    Director's "save_post at 20", deliberately). MotoPress's Update
    (save_post at 10) saves with `BookingRepository::save()` → `wp_update_post()`,
    so save_post fires AGAIN inside MotoPress's save, before that save returns.
    A save_post handler therefore runs nested, and if MotoPress writes its
    reloaded total after `wp_update_post()` returns, the new total is
    overwritten — services say Yes, total says No. **VERIFIED that it does**
    (Director, live 6.3.0): `CPTPersistence::update()` (~172) calls
    `wp_update_post()` FIRST and only then `updatePostRelatedData()`, which
    writes the meta including `mphb_total_price` — so ANY save_post handler,
    at any priority, would be overwritten; the Director withdrew "priority 20".
    The suite models exactly that order and shows both outcomes (the
    save_post-at-20 variant loses the total; the redirect does not). save_post
    only records that a rebuild is due, after nonce (`dcc_fee_sync`, printed
    in "Guest count"), `edit_post`, the form's `post_ID`, not autosave or
    revision. **Consequence: only the classic edit form's Update changes
    fees** — a REST or block-editor save would not reach the redirect, and
    changes no fee (fails safe).
  - **A ROOM IS REBUILT IN PLACE, CHECKED BEFORE THE FIRST WRITE.** Its own
    id, room, rate, adults, children, guest name, status and **uid** (omitted,
    MotoPress makes a new one and the iCal tie breaks — mutation
    `fs-uid-dropped`). Its services are rebuilt from `_mphb_services` rows via
    `ReservedService::create()`; every row must build, every room in the plan
    must be on the booking, every method must exist — or NOTHING is written
    and staff get "Fees were not changed … Use Edit Accommodations." A
    services shape other than MotoPress's row list (a list of bare ids, a map)
    is never rewritten (`read_services()` → null; mutation
    `fs-read-services-lenient`). Rooms not in the plan are passed as loaded.
  - **The screen**: Extra Details/Options shows the control only when
    `Fee_Sync::pet_control()` says 'select'; otherwise the read-only line
    (cancelled/abandoned say "Fees aren't changed on a cancelled or abandoned
    booking." and get no Edit Accommodations link). Guest count shows each
    room's STORED fee ("Extra guest fee: N guests × $50/night", the admin JS's
    own msgids) and a hint. Dog follows the control live (`admin-booking.js`).
    Edit Accommodations stays as the manual fallback.
  - **The stand-in is a model, not MotoPress.** `tests/fees/` models the
    repository and entities from the Director's reads, with its own prices;
    it proves what MotoPress is GIVEN and that it is asked to reprice, never
    the total. **VERIFIED (Director, live 6.3.0 source and data, 2026-10-11):**
    `\MPHB\Entities\ReservedRoom` (entities/reserved-room.php) and
    `\MPHB\Entities\ReservedService extends Service` with `public static
    create()` (~34); statuses exactly `cancelled` / `abandoned` (statuses.php
    ~9–15; live: 153 cancelled, 16 abandoned); service 18063 is per_night,
    `mphb_price_quantity` **per_adult**, min/max quantity 1/2, and its stored
    row for one extra guest is
    `a:1:{i:0;a:3:{s:2:"id";i:18063;s:6:"adults";i:1;s:8:"quantity";i:1;}}`
    — so `adults` = guests beyond 2, `quantity` = 1 matches MotoPress's own;
    the `mphb_booking` CPT has `'supports' => false` and no `show_in_rest`, so
    the edit screen IS the classic post.php form. **Proof of the money**:
    the staging comparison — the same change by Update and by Edit
    Accommodations on two identical bookings, `mphb_total_price` and
    `_mphb_booking_price_breakdown` compared, and no new email-log entry.
- **0.33.1 — ONLY THE FEE MOVES; THE STAY IS NEVER REPRICED** (Rob's
  decision after the Director's 0.33.0 staging run, 2026-10-11; `Fee_Sync`,
  suite `tests/fees/run.php`). 0.33.0's `updateTotal()` / `calcPrice()`
  recalculates the WHOLE stay at TODAY's rates — measured: #10212, booked at
  $555, read $766 with the pet fee and $666 without; #10198 went $333 →
  $488.50 — and MotoPress's Edit Accommodations does exactly the same, which
  is why 0.33.0's "identical to Edit Accommodations" check passed. Now:
  - **Nothing of MotoPress's is re-run.** No `updateTotal()`, no `setRooms()`,
    no repository `save()`, no `updateReservedRooms()`, no ReservedRoom rebuilt.
    A fee line is built from public calls only, exactly as
    `PriceBreakdownHelper::getServicesBreakdown()` (~326–380) builds one:
    title = the service repository's `findById(apply_filters(
    '_mphb_translate_post_id', id, null))->getTitle()`, falling back to the
    reserved service's own; details = `toString('price', $booking->
    getNightsCount())`; total = `calcPrice(checkIn, checkOut)`.
  - **Written by exactly the fee's amount, in whole cents**: the room's
    `_mphb_services` rows (rows it does not change are written back AS STORED),
    and in `_mphb_booking_price_breakdown` that room's `services.list`,
    `services.total` / `discount_total`, the room's `total` / `discount_total`,
    and the booking `total`; then `mphb_total_price`. A changed count also sets
    the breakdown's `room.adults`. Every other key and value is untouched — the
    suite compares the DECODED breakdown path by path, type-strict.
  - **Stored as MotoPress stores it** (Director, booking-repository.php
    ~328–329): decoded to OBJECTS (so `{}` stays `{}`), `json_encode` with
    DEFAULT flags (`<\/span>`), then `wp_slash()` — `update_post_meta()`
    unslashes. Numbers are written back as ints when whole, else floats, as
    MotoPress's are; the server's own `json_encode` decides the digits, the same
    one MotoPress uses. (The Director's #8798 shows `1021.2000000000000454…` —
    the exact double of 1021.2 — so live prints floats at more than the
    default precision; the stand-in here prints `1021.2`. Same number.)
  - **A line is found by POSITION, never by title** (titles are booking-time:
    #17730 says "Pet Fee &#8211; Daily", the service is now "…Daily Rate").
    MotoPress builds the list in `_mphb_services` order and SKIPS a row whose
    `create()` is null, so a line is removed or replaced only when the list is
    exactly as long as the rows AND that line's total equals `calcPrice()` of
    its row to the cent. Added lines are appended (rows and list alike).
  - **FAILS SAFE — nothing written, staff told to use Edit Accommodations**:
    `mphb_coupon_id` non-empty; `mphb_service_taxes` non-empty (`[]` on live);
    a non-zero `services.discount`; a non-empty `taxes.services`; a breakdown
    not in MotoPress's shape (one room; room / services / fees / taxes objects;
    numeric totals); `mphb_total_price` ≠ the breakdown total; list ≠ rows; a
    line that is not its row's price; more than one accommodation when a fee
    must change; MotoPress unable to build the line. A count-only change
    (Cottages 33/34, or no fee change) just sets `room.adults` — no money moves,
    so no money checks — and is skipped on a multi-room booking.
  - **PROBLEM 2 (a count reverted on a second Update in one process) is gone
    with the rebuild**: nothing in the fee path reads or writes `_mphb_adults`
    any more. Also fixed in passing: the first-call-wins snapshot was never
    cleared, so a SECOND Update in the same process compared against the FIRST
    one's counts (2→3 then 3→2 would have kept the fee). `on_redirect()` now
    consumes it. Both are asserted in one process (mutation
    `fs-snapshot-reused`).
  - **The dead re-entry guard went with it**: `$running` was set only around
    the repository save, which 0.33.1 no longer makes, and `update_post_meta()`
    / `addLog()` fire no save_post.
  - **The screen**: "The room price is not changed." on both Update hints, and
    beside the Edit Accommodations button (eligible bookings only):
    "Edit Accommodations recalculates the whole stay at today's rates."
  - **Fixtures are the Director's raw values**: #17730's breakdown byte for
    byte (it re-encodes to itself — asserted), its `_mphb_services` row, and
    #19656's line. The four expected totals (#10212 $555→$655, #8798
    $1,021.20→$1,181.20, #10198 $333→$433→$533→$333, #10222 →$327.50) are
    reproduced on breakdowns BUILT in MotoPress's shape from the site's three
    room taxes (4% / 1% / 6%, which reproduce both raw breakdowns to the cent);
    nights and tiers there are the stand-in's. The Director's rerun on the
    real bookings is the proof.
  - **VERIFIED (Director, live, 2026-10-12)**: a room with no services
    stores `_mphb_services` as `a:0:{}` (416 of 419 reserved rooms; never
    absent), so 0.33.1's empty array is MotoPress's own shape. On live, the details string is
    MotoPress's own `toString()`, so the stand-in's price formatting decides
    nothing there.
- **0.34.0 — ROB'S PET POLICY (11 October): FLAT FEE, OLD FEES RECOGNISED,
  DOG SIZES KEPT** (Director, 2026-10-12; `Config`, `Settings`, `Dog_Sizes`,
  suites `tests/petpolicy/run.php`, `tests/pricing/`, `tests/fees/`,
  `tests/admin-layout/`). Cottage 34 only, ONE dog up to 20 lbs, a flat $50
  per night whatever the stay length. The Director had already changed DATA
  on live and staging (no code): service #19692 "Pet Fee (per night)"
  (per_night, quantity once, 1/1, untaxed); 17712 / 17711 / 14926 kept
  published, prices unchanged, DETACHED from 1607 (whose `mphb_services` is
  now ["19692"]); `dcc_checkout_settings` tier keys all 19692; Dog Size
  (17727) options "— Select —" + "Up to 20 lbs".
  - **THE MODE**: `pet_fee_mode` 'flat' | 'tiers' (anything else reads flat),
    `service_flat` (19692) and the three tier ids are ALL stored whatever the
    mode, so switching back is a radio button. Defaults: flat, 19692,
    17712/17711/14926, thresholds 2/7/30. **UPGRADE at READ time**
    (`Config::upgrade()`, like the array_merge): no mode key + all three tier
    slots ONE id → flat on that id with the BAKED tiers (19692 never left in a
    tier slot); no mode key + three distinct ids → 'tiers' unchanged; no tier
    keys → the defaults. Nothing is written until the settings page is saved.
  - **ACTIVE vs RECOGNISED — name the set you mean.**
    - ACTIVE (what the current mode charges): `Config::service_id_for_nights()`,
      `pet_service_ids()` (per bucket — all three = the flat id in flat mode,
      so checkout.js's `serviceForNights()` follows the mode with no second
      path; the pricing mirror runs both modes), `active_pet_service_ids()`.
      Readers: Pet_Service's expected id; Fee_Sync's ADD (and its "offered"
      check); Admin_Fields::wizard_pet_service() (Add New "Pet Fee: Yes");
      checkout.js `serviceIds` → the box ticked; Settings' attachment warning
      and the accommodations field's "services not enabled" flag.
    - RECOGNISED (flat + the three tiers, whatever the mode):
      `recognised_pet_service_ids()` (and `pet_service_id_list()`, kept as an
      alias for outside callers). Readers: Pet_Service's
      any-pet-service-present and the "any other pet service → refused" loop;
      Fee_Sync's has_any / remove-by-index; Admin_Fields::booking_pet_fee()
      (→ booking_pet_state, the edit screen's Yes/No) and `petServiceIds`
      (admin-booking.js finds/hides/unticks); checkout.js `serviceIdList`
      (finds/hides/unticks); `Config::room_type_has_pet_services()` (what a pet
      cottage IS).
    - The guest-fee `guestServiceIds` lookup in checkout.js is untouched.
  - **An old tier fee on a booking is a pet fee.** Update with Yes adds no
    second line; No removes it by index with 0.33.1's calcPrice check (the old
    services' prices are unchanged, so it holds); a later Yes adds the ACTIVE
    flat fee. Asserted on #17730's raw breakdown under flat mode.
  - **admin-booking.js ticks the ACTIVE service only.** With PHP stating the
    service (`data-dcc-pet-service`), a page showing only an old tier box no
    longer falls back to "the room's only pet box" — nothing is ticked and the
    rows stay with "Choose the pet fee under Additional Services." The
    only-box fallback remains for a stay whose dates could not be read.
  - **Settings**: "Pet fee mode" (radio) + flat id + the three tiers + the
    thresholds, and a red warning per pet cottage for each ACTIVE service
    MotoPress has not attached (`Config::room_type_service_ids()`, silent when
    unreadable). Switching back to tiers needs 17712/17711/14926 re-attached
    to 1607 — a MotoPress data change the Director makes when Rob asks.
  - **DOG SIZES** (`dog_sizes`: rows {label, active}; baked: "Up to 20 lbs"
    on; 10-20 / 20-30 / 30-40 lbs off; value = label). The settings page keeps
    every size and flips "Offered"; a save offering NONE is refused (the size
    is required on a dog booking, so it would refuse every one) and says so.
    **Served, not written**: `Dog_Sizes` answers `get_post_metadata` for the
    Dog Size field's `mphb_cf_options` (the add-on reads them with
    get_post_meta(…, true) — 0.31.0) — the guest checkout, front-end AJAX and
    Add New get the offered sizes; every other wp-admin screen (the edit
    screen) gets ALL sizes. Why: the edit screen's core SelectField selects
    only a key in the CURRENT options and its sanitize() keeps only such keys
    (Director, live 6.3.0), so an offered-only list would show #17795's
    "30-40 lbs" as "— Select —" and ERASE it on Update. Modelled and asserted
    in tests/petpolicy (with the guard that the guest list WOULD erase it).
    Consequence: while this plugin is active, the options typed on field
    17727 in MotoPress are replaced by the setting; nothing in MotoPress's
    data is changed. **Rob's decision (2026-10-12): keep it as built** —
    every size on the edit screen, offered sizes only for guests and Add New.
  - **0.34.0 STAGING, Director's sections PASSED (2026-10-12)**: the upgrade
    read (flat 19692, tiers 17712/17711/14926, active [19692], recognised all
    four, no warning); a save through `Settings::sanitize()`; the mode round
    trip (three warnings on tiers, none back on flat, nothing retyped); a
    nothing-offered list refused; #17730 (old 17712 fee, made confirmed for
    the test and restored) Yes → no change, No → $383 → $333, Yes → $333 →
    $433 with "Pet Fee (per night) | $50 × 2 nights | 100"; #10222 $277.50 →
    $377.50 → back and #8798 $1,021.20 → $1,421.20 → back, byte-identical;
    `Dog_Sizes::violation()` and the served options on each screen as built;
    17727's stored meta unchanged. Rob's sections 3, 5 and 6 are with him;
    live after his sign-off.
  - **The size is checked on the server** (`Dog_Sizes::violation()`, called
    from `Pet_Service::find_violation()`, so the wp_loaded path AND Rest_Guard):
    MotoPress does not check a posted select against its options
    (parse-utils.php parseCustomer → sanitize_text_field only). On a DOG
    booking a size not offered is refused, and so is NO size while the field
    is published + `mphb_cf_enabled` = '1' (MotoPress sends nothing for an
    empty select, so empty arrives as absent). Code 'dogsize', message
    "Please choose your dog's size from the list." (Rest_Guard + the banner).
    No dog → nothing about the size is required.
  - **Wording, mode-aware** (A4): Extra_Details::pet_update_hint() (flat:
    "the pet fee ($50 per night)…", the amount from the flat Service's own
    price via `Config::flat_pet_fee_text()`, never a literal; none named if
    unreadable); Fee_Sync's not-attached refusal; the settings page's mode
    section, its bottom reminder and the Dog size help; Admin_Fields' and
    admin-booking.js's doc comments. Checked and NOT changed: checkout.js
    `petFeeNote` ("A per-night pet fee will be added to your total." — true in
    both modes), the email tag's description, admin-booking.js's strings.
- **0.34.0 — "PRICE FOR 2 MEANWHILE" AND ERRORS ONLY AFTER THE MISTAKE**
  (Rob's live report and pick; the Director's read of live MotoPress 6.3.0;
  `checkout.js` armRecalcCount() / markProvisional() / armPreflight(),
  `checkout.css`; suite `tests/recalc/run.js`, real Chromium, 390 + 1280).
  - **The cause** (Director): MotoPress re-prices over admin-ajax
    (`mphb_update_checkout_info`, GET, formValues = the serialised form) at
    load (mphb.js ~1239) and on guest-chooser / rate / service changes
    (~1413–1423); update-checkout-info.php (~86–95) throws when a room's
    adults < 1, which Loco turns into "Please select the number of guests.";
    showError() fills the `p.mphb-errors-wrapper.mphb-hide` printed EMPTY at
    load (checkout-view.php ~912); on failure the breakdown keeps its old
    content — so Yes to the dog added no pet line until a count was chosen.
  - **B1, in the browser** (my choice; the Director left it open): an
    XMLHttpRequest wrapper, installed at SCRIPT EXECUTION (before MotoPress's
    ready-time init), rewrites ONLY requests whose `action` is
    `mphb_update_checkout_info` or `mphb_update_rate_prices` (URL query or a
    urlencoded string body): an EMPTY parameter whose name ENDS WITH an
    unchosen chooser's field name (`formValues[mphb_room_details][0][adults]`
    ↔ `mphb_room_details[0][adults]`), or with one room any `[adults]`
    outside a `[services]` branch, becomes min(included_guests, that
    chooser's highest option). Why browser: it needs only what the page
    shows, and nothing of how MotoPress's server parses formValues, which
    nobody has read. The booking (REST /mphb/v1/checkout, FormData) never
    matches, so the guest's real choice — including none — is what is
    submitted, and MotoPress still refuses a booking without a count. A
    request it cannot read goes as it was (MotoPress's behaviour); admins get
    a console note. **SHAPE CONFIRMED with the site's real libraries**
    (Director, staging, 2026-10-12): MotoPress's vendored
    jquery.serializejson + jQuery 3.7.1, on a chooser
    `mphb_room_details[0][adults]` left on "", produce
    `formValues%5Bmphb_room_details%5D%5B0%5D%5Badults%5D=` in the GET query;
    a service's own count encodes as `…[services][0][adults]=1`, which the
    `services` exclusion skips. **CAPTURED from a real page load** (Director,
    staging, 2026-10-12, section 3): `formValues[mphb_room_details][0][adults]=2`
    with the menu on "— Select —", response 200. Moved to `guest-count.js` in
    0.34.1 (entry below).
  - **The Guests row** (`tr.mphb-price-breakdown-guests`, booking-view.php
    ~100–111) is hidden while any chooser is unchosen, by a CLASS ON THE FORM
    (`dcc_checkout-guests-provisional`) + CSS, so a re-rendered table is
    covered the moment it lands — no flash, no per-row writes, idempotent.
  - **B2**: armPreflight() now tags as pre-existing only an error box that
    SHOWS something at load — text, and neither it nor an ancestor hidden
    (`hidden`, `mphb-hide`, computed display:none / visibility:hidden).
    0.15.0 tagged MotoPress's EMPTY wrapper, so everything MotoPress put in it
    went straight past the hold-back. A server-rendered error with text at
    load still shows (the safety catch, asserted).
  - **Tap rules kept**: markProvisional() is one idempotent setClass on a
    change event; nothing is scheduled during a touch.
- **0.34.1 — ADD NEW BOOKING GETS B1/B2, AND THE CHOOSER SPEAKS THE SITE'S
  WORDS** (Director's staging run of Rob's sections 3/5/6, 2026-10-12, all
  passed; Rob: "Yes, in 0.34.1"; `assets/guest-count.js`,
  `Guest_Count_Script`, `admin-booking.js` addNewGuestCount(); suite
  `tests/recalc/` — run.js + enqueue.php + config.php).
  - **SECTION 3'S PROOF (live capture, Director):** a real page load's
    `mphb_update_checkout_info` carried
    `formValues[mphb_room_details][0][adults]=2` with the menu on
    "— Select —", 200; Yes to the dog added $50 × nights at once; Cottage 31
    3 guests +$100, 4 +$200 (2 nights). Section 5: #17730 / #17795 kept
    "10-20 lbs" / "30-40 lbs" through Update. Section 6: Pet Fee Yes on Add
    New ticks 19692, +$50 × nights; No unticks it.
  - **THE REWRITE MOVED, UNCHANGED, INTO `guest-count.js`**, which the guest
    checkout (footer, as `checkout.js`'s dependency — the timing the live
    capture proved) and Add New (`page=mphb_add_new_booking`, HEAD) both
    load: ONE copy, so the screens cannot drift. `checkout.js` keeps only
    its own half (markProvisional, armPreflight). NOT loaded on Edit
    Accommodations or the edit screen (0.32.1: that flow is MotoPress's).
    The chooser lookup is the first four of `roomAdultsSelects()`' tries —
    never the widest `select[name*="adults"]`, which matches Add New's
    SEARCH step.
  - **ADD NEW: WHICH SCRIPT AND REQUEST PRICE IT IS INFERRED, NOT CAPTURED.**
    `checkout.js` is not loaded there (`is_checkout_page()` is false in
    wp-admin), so 0.34.0 never touched it. That MotoPress's own script prices
    step 3 with the same `mphb_update_checkout_info` rests on what the
    Director saw: the same chooser name, the same `.mphb-errors-wrapper`, the
    same message, and a recalc that fails until a count is chosen. If the
    request differs, the rewrite does nothing (MotoPress's own behaviour) —
    the Director's network-tab read on staging settles it.
  - **Add New's own half** (`addNewGuestCount()`, `flow = 'add-new'` — a
    WORD): the chooser's FORM (found from the chooser, no class assumed)
    gets `dcc_admin-guests-provisional` (Guests row hidden) and
    `dcc_admin-preflight` (`.mphb-errors-wrapper` held until Submit Booking
    — a click on a submit control or a submit event). A box SHOWING text at
    load is tagged and stays visible. Narrower than the checkout's
    `[class*="error"]` on purpose: an admin screen, and that box is the one
    proven to carry the message there. WordPress's own notices are outside
    the form and untouched (asserted).
  - **ITEM 2, the browser's message:** live, the guest chooser is
    `required` (Director), so the BROWSER stops the form with "Please select
    an item in the list." and MotoPress's message never appears. Kept as a
    check; its WORDS become `Guest_Count_Script`'s "Please select the number
    of guests." (`dcc-checkout` domain) via `setCustomValidity()`:
    - set on a click on a submit control — BEFORE the browser validates
      (Enter in a field clicks the default button too) — and on `invalid` as
      a belt (requestSubmit, no click); asserted separately: the press sets
      it before the browser starts checking, the belt alone after;
    - cleared the moment a count is chosen; picking "— Select —" again sets
      nothing until the next attempt; never set at load;
    - **never on a select that is not `required`** — that would ADD a check
      MotoPress does not make; asserted (it submits and MotoPress refuses).
    - A property write: no DOM mutation (asserted: zero on the chooser) and
      no timer, so the tap rules hold. Same on Add New.
    - A headless browser shows no bubble; what is measured is the chooser's
      `validationMessage` when the browser reports it (an `invalid` listener
      on the element), and that the form was not sent.
    - **On the GUEST checkout the bubble never shows any more**: the site's
      own dropdown list (entry below) hides the select and puts this same
      `validationMessage` under the field. The message's words still come from
      here; the bubble path is Add New's, where select-list.js is not loaded.
  - `tests/admin-layout/` now requests its Add New fixtures as
    `page=mphb_add_new_booking`, as live does, so the layout and
    zero-mutation assertions run with the new half live (guard asserted).
- **0.34.1 — THE SITE'S OWN DROPDOWN LIST ON THE GUEST CHECKOUT** (Rob's
  pick via the Director, 2026-10-12; `assets/select-list.js`, CSS at the end
  of `checkout.css`; suite `tests/selectlist/`; THE SPEC IS IN
  `PROJECT-NOTES.md` at the repo root, shared with the Availability
  Calendar's staff board — change it there first, then in both).
  - Why: the OPENED list of a native select is the OS's (left-aligned on
    iPhone, off-centre on desktop) and no CSS reaches it. Every visible
    select on /submit-booking/ — guest count, Country, Dog Size, Dog Hair,
    any other — becomes a button in the field's style opening a list drawn
    at the end of `<body>` (outside the form `checkout.js` observes). Never
    the services' own "for N" select (never shown; `checkout.js` sets it
    without an event), never multi-selects. Guest checkout ONLY: not loaded
    on Add New (asserted in `tests/recalc/enqueue.php`).
  - **THE SELECT IS THE SOURCE OF TRUTH**: kept in the form, hidden VISUALLY
    (1px clip + opacity 0), `tabindex=-1`, `aria-hidden`; a choice sets it and
    fires its real `input` + `change`; a MutationObserver per select keeps the
    field and list in step (options, text, disabled, class); a replaced select
    is picked up by an observer on the form. Submitted data is identical to
    the page without the script (asserted, FormData).
  - **THE CLOSED FIELD DOES NOT CHANGE** — asserted against the same page
    WITHOUT the script at 375 and 1280, with the theme's traps reproduced
    (html{font-weight:700}, Pavanam + uppercase on button, an Elementor-kit
    900/1.5px/capitalize button rule): position, size, every border, radius,
    padding, caret, colours and typography identical. Typography is COPIED
    from the select's computed style onto the button at enhancement, because
    the theme's button rules would otherwise reach it.
  - **TWO `checkout.js` READERS HAD TO LEARN THE FIELD** — both found by the
    "closed field" comparison, not by reading:
    `matchFileFieldWidth()` measured the Country SELECT (now 1px → the upload
    field would be 1px), and `guestChooserVisible()` counts `opacity: 0` as
    hidden, so it decided the guest chooser was lost and UN-HID THE NATIVE
    SERVICES SECTION (80px of "Choose Additional Services" back on the page).
    Both now read `shownFieldFor(sel)`. Anything that measures or judges a
    select's visibility must do the same.
  - **Validation**: `invalid` (only a submit attempt fires it; the form's
    `dcc_checkout-preflight` gates a script's `checkValidity()`) → message
    under the field (`.dcc_checkout-field-error`, the error ink), the field
    `aria-invalid` + described by it, `preventDefault()` so the browser never
    tries to bubble at a hidden control. An ATTEMPT is a submit-control press
    (`attemptAt`); the first invalid control of it takes focus, and when that
    is one of these fields a LATER native control's report is held back —
    measured: otherwise Chromium jumped focus to Dog Type and bubbled there.
    Rounds by time alone were tried first and FAILED: a `checkValidity()` at
    load within 250ms of the press joined the press's round.
  - Tap rules kept: opens on `click`; the only write on
    touchstart/pointerdown is closing an OPEN list; type-ahead uses
    timestamps; zero mutations on a tap while closed (asserted).
  - NOT verifiable here: iOS Safari and VoiceOver. Chromium proves the roles,
    names, keys and geometry; the phone is Rob's check list.
- **0.34.2 — THE DIRECTOR'S READ-ONLY AUDIT OF LIVE 0.34.1** (2026-10-17; five
  fixes, nothing critical found — the ID store returns 403, prices are
  server-side, and `Rest_Guard` covers `/mphb/v1/checkout`). Suites
  `tests/upload-access/`, `tests/audit/`, `tests/minify/`, plus the new
  `selectlist-min`; `tests/backstops/` grew the dog-fee case.
  - **1. A DOG COULD BE BOOKED WITHOUT THE FEE** (`Pet_Service::find_violation`).
    "Has dog" was read ONLY from the attached pet service, and the three dog
    Checkout Fields are `req=false` in MotoPress with nothing but the browser
    disabling them — so a tampered request, or a JS failure after a MotoPress
    update, saved a Cottage 34 booking listing a dog at $0. Now, in the branch
    where NO pet service is attached, any dog field with something in it is the
    declaration of a dog and the booking is refused with the existing `pet`
    message. Sound because MotoPress omits an empty custom field from the
    payload entirely (`_buildFormData`) and this plugin disables them on a
    no-dog booking: a value there is never an unanswered question.
    **"Pet cottage" here is this file's existing `$is_pet`** — a room type in
    `Config::pet_accommodations()`, or a pet service attached (false in this
    branch by construction) — NOT `room_type_has_pet_services()`. That is the
    Director's instruction ("off pet cottages, ignore dog fields as today") and
    it keeps the gate the rest of this backstop already uses: a cottage outside
    the list is not evaluated at all, as before.
  - **2. THE ID VIEWER ACCEPTED ANY POSTMETA ROW** (`Upload_Access`, new). The
    add-on's `?upload_id=` took a meta_id and checked it against neither the
    booking nor the photo-ID key (FileUploadField.php ~245-271 — MotoPress's
    code, NOT patched). The add-on's own
    `mphb_cf_upload_link_has_access` filter is used instead. The rule, and it
    only ever NARROWS: a decision already "no" is returned untouched; a request
    with no `upload_id` is left alone (the hole is specific to that parameter);
    otherwise the row is read from postmeta by meta_id and must exist, must
    carry `Id_Files::META_KEY`, and must belong to an
    `Id_Files::BOOKING_POST_TYPE` post — and to the booking named by the
    request or by the add-on's own arguments when one is named. Anything
    unreadable refuses.
    **NOT VERIFIABLE HERE: the add-on's source is not in this repo or on the
    machine**, so the filter's NAME and arguments come from the Director's read
    of live. The callback is variadic, so any argument count is correct; a name
    that did not match would simply never fire, leaving 0.34.1's behaviour. The
    staging check list asks for a mismatched row to be refused for real.
    `Id_Files::BOOKING_POST_TYPE` became public rather than retyping
    'mphb_booking' in a second file.
    Note `meta_row()`'s `catch (\Throwable)` turns ANY error into a refusal —
    the right direction, and it bit in testing: an undefined `ARRAY_A` in the
    harness read as "row unreadable" rather than crashing.
  - **3. THE GUEST ASSETS SHIP BUILT** (`tools/build-assets.php`,
    `Assets::asset_url()`). checkout.js and checkout.css went to every guest as
    written. Measured: 127 KB + 57 KB + 24 KB + 12 KB raw (64 KB gzipped) →
    50 + 21 + 14 + 5 KB (23 KB gzipped), **64% off the wire**.
    **THE BUILDER REMOVES COMMENTS AND INDENTATION AND NOTHING ELSE.** It does
    not rename and **does not join lines** — joining means taking on automatic
    semicolon insertion, and renaming means scope analysis, either of which can
    change behaviour invisibly in a file a guest runs while booking. The
    comment-heavy style of this repo is why a strip alone wins 60%. Strings,
    template literals and regex literals are tracked, so a `//` in a string and
    a `/*` in a regex survive.
    Served unless `SCRIPT_DEBUG`, filterable with
    `dcc_checkout_use_minified_assets`, and **a missing built file serves the
    source** — a plugin folder copied without the build output still works.
    **Rebuild after touching any guest asset**: `php
    dcc-custom-checkout/tools/build-assets.php`, and `--check` (run by
    `tests/minify/`) goes red when the two disagree. Admin assets and the
    flag-gated `tap-debug.js` are deliberately not built; `tests/minify/`
    asserts that list, so a new guest asset enqueued around `asset_url()` is
    caught.
    **The structural checks read a FRESH build into a temp directory
    (`--out=`), not the committed files**: evidence about the builder rather
    than about what was last committed. The behavioural proof is the separate
    suite **`selectlist-min`** — all 80 assertions of `tests/selectlist` in a
    real browser against the built bundle.
  - **4. THE GETTEXT MAP WAS REBUILT ON EVERY GETTEXT CALL**
    (`Assets::string_overrides()`). `apply_override()` reads it on every call
    of MotoPress's text domain on every page, so the array, its eight `__()`
    lookups and the filter ran thousands of times a request for an answer that
    cannot change within one. Cached in a static **keyed by locale** — not a
    bare flag, so a request that renders something in another locale is not
    served the first one's words. `flush_string_overrides()` for tests.
  - **5. THE STORE SELF-TEST VERIFIES THE CERTIFICATE**
    (`Id_Files::probe_public_access()`, `sslverify => true`). That probe is
    what /privacy/'s promise rests on, and it used to accept the answer from
    whatever replied. Only a TLS failure — matched on the message, so a refused
    connection or a timeout is reported as itself — is retried unverified, and
    then the note says so out loud. A shared host that cannot verify its own
    loopback certificate still gets an answer rather than a false "publicly
    readable".
  - **NOT DONE, and not ours**: IDs kept on cancelled bookings (13 of 27) is
    Rob's call, and the existing button already deletes them.
- **0.35.0 — ROB'S NEW LAYOUT FOR /submit-booking/, BEHIND A PREVIEW LINK**
  (his 11 items, 2026-10-22; LIVE 2026-10-23 with the switch OFF; `Layout`,
  `Hero`, `Layout_Script`, `Restore`, `assets/layout.js`,
  `assets/checkout-layout.css`, `assets/restore.js`; suites `tests/layout/`,
  `tests/hero/`, `tests/restore/`, `tests/layout-fields/`).
  - **THE SWITCH IS THE WHOLE SAFETY OF IT.** `Layout::active()` is the one
    gate every part reads: the owner's `layout_enabled` (off by default), or a
    SESSION cookie set by `/submit-booking/?dcc_layout=<key>` against
    `layout_preview_key`, compared with `hash_equals`. `?dcc_layout=off` ends a
    preview; it cannot turn the layout off for a site whose switch is on. The
    key is never printed, logged or redirected into a Referer. **Fails closed
    everywhere** — the cost of a wrong `false` is today's checkout, which
    works; the cost of a wrong `true` is a guest mid-booking on an unreviewed
    page.
  - **ITEM 10 IS DELIBERATELY NOT GATED** (Rob: "this card shows for everyone,
    even before the layout is switched on, because the error page is a dead end
    today"). `restore.js` keeps the guest's answers in **sessionStorage only —
    never localStorage, never a cookie** (it holds a name, a phone and an
    address, so it must die with the tab), and offers "Continue Your Booking"
    where MotoPress drew no form. **Never stored: the photo ID, the coupon, the
    acceptance tick** — the first because it is identity documents, the other
    two because a decision restored without the guest making it again is a
    decision nobody made.
  - **ONE PHOTO, NOT TWO.** The cottage's photo REPLACES the canal banner
    through Bravada's own `bravada_header_image_url`, rather than being stacked
    under it. The lip is `#header-image-main-inside::after` and must stay a
    pseudo-element: the Director's mu-plugin `dcc-hero-frame.php` forces every
    child div of that box to `height: 100% !important`, so a `<div>` lip would
    paint the whole photo white. **NOTHING ELSE GOES ON THE PHOTO** (Rob): the
    cottage name, the dates pill and the lip, and no more.
  - **The size is chosen by MEASURED WIDTH, never by name**: `large` is a
    1024x1024 BOUNDING BOX, so portrait Cottage 36 comes back 768 wide from it
    and needs `1536x1536`. Narrowest candidate at or above 1024, else the
    widest there is (Cottage 22's original is 960).
  - Four code defects in the build, **none found by reading**: the segmented
    select's full-width box (the field standard's `!important` outranked the
    hide), the `<h1>` rendering black (the overlay colour rule was `p`-only),
    **every new border absent** (`--dcc-field-border` is a WIDTH token and was
    used as a colour, so `border: 2px solid 2px` — invalid, no border at all;
    found by looking at a screenshot), and locking the submit controls on
    `click` **cancelling its own submit** (it has to be deferred by a task).
  - **The viewport meta is load-bearing in every browser fixture.** Without
    it Chromium in mobile emulation lays out at 980px, so `@media (min-width:
    900px)` matches at 360 and 390 and every "phone" measurement is really the
    desktop branch. `tests/hero/`, `tests/button/` and `tests/footnote/` all
    lacked it.
  - **Confirmed by the Director on live (2026-10-23)**: with the switch off a
    Cottage 34 render is identical to 0.34.2's but for the version string and
    the new `DCC_RESTORE` block; through the preview link at 390 and 1280 on
    Cottages 22, 34 and 36 — photo, lip, centred `<h1>`, dates pill, bar
    outside `article.hentry`, "Next: Number of Guests ↓", the bar total equal
    to MotoPress's ($499.50 for 34, Jan 11-14), the desktop card sticky at
    x=676/w=340, no Seasons or Hero Life assets, no new PHP warnings.
    **AutoFill is not checked** — it needs a real iPhone.
  - **Two decisions confirmed rather than assumed**: Enter never submits (the
    Submit control is the only way to send), and selects stay out of the Next
    chain until the segmented buttons land.
- **0.35.1 — THE DIRECTOR'S READ OF LIVE 0.35.0: SIX FIXES** (2026-10-23;
  `Rendered_Stay` is new, plus `Hero`, `Restore`, `restore.js`,
  `Layout_Script`, `checkout.css`). Every one of them was found ON LIVE, and
  four were green in the suite the whole time.
  - **1. A RELOAD LOST THE HERO, because "what was posted" is not "what this
    page is rendering".** A plain GET after a POST still shows a working
    checkout — MotoPress rebuilds the form from its own `mphb_check_in_date` /
    `mphb_check_out_date` cookies (step.php's fallback, Director) — but nothing
    was posted, so the hero stood down and the page came back with the canal
    banner and "Submit Booking" over it, bar and sheet and all.
    **`Rendered_Stay` IS A SEPARATE CLASS AND THAT IS THE POINT.**
    `Checkout_Request` is what every server-side backstop reads to decide
    whether to REFUSE a booking, and **a cookie is not a submission**: letting
    one supply the dates for a submission that posted none would widen what
    those guards evaluate, on the one path where being wrong charges or refuses
    a real guest. The fallback is read only by display code, and the boundary
    is structural rather than a comment. Mutation
    `cr-cookie-widens-backstops`.
    **THE ROOM TYPE'S COOKIE NAME IS NOT PROVEN AND THE CODE DOES NOT DEPEND
    ON ONE.** The Director's answer named the two date cookies and said "room
    type plus the cookie dates"; the room cookie itself was not read. So any
    `mphb…room…` cookie is scanned, every 3-or-more-digit run is pulled out of
    its value **as TEXT — never `unserialize()`, which on an attacker-
    controlled cookie is object injection** — and a candidate is accepted only
    once WordPress confirms a **published `mphb_room_type`. **Two distinct
    cottages named means NO hero**: a hero for the wrong cottage is worse than
    the banner, because it looks deliberate. Date cookies are excluded by name
    so a four-digit year cannot be read as a post id. **Asked of the Director
    rather than guessed; until he answers, a canal banner on reload means the
    room type is not in a "room"-named cookie.**
  - **2. "ALREADY BOOKED" IS NOT "WE LOST YOUR DATES".** Cottage 36, Jan 11-14
    2027 is booked; MotoPress printed "Accommodation is already booked." and
    0.35.0's card said "We do not have your dates any more." Now
    `Restore::offer()` returns a WORD — `taken` when THIS REQUEST posted a
    complete stay that is still bookable in principle (check-out after
    check-in, check-in today or later **in US/Eastern**, like every other
    "today" here), else `lost` — and the browser supplies the half PHP cannot:
    MotoPress drew no form. **Never MotoPress's words**, which are translated
    on this site. Rob's copy: "Those Dates Are Taken" / "Someone just booked %s
    for those nights. Choose new dates and we'll bring you straight back." /
    "Pick New Dates", a LINK and never a re-POST of a stay just refused.
    **Stated rather than hidden: any other refusal of a complete, future-dated
    stay lands here too** (a minimum-nights rule, say); availability is the
    only cause seen, and the recovery offered is right for every member of that
    set even where the sentence is not. Narrowing further would mean matching
    MotoPress's message.
    **AND THE HIDE IS STRUCTURAL, BECAUSE THAT MESSAGE'S MARKUP HAS NOT BEEN
    READ.** The Director quoted the sentence, not the element. So when the
    card's host is MotoPress's **own** `.mphb_sc_checkout-wrapper`, every
    direct child of it that is not ours goes out of view — which covers the
    pinned `p.mphb-data-incorrect` dead end as well. **It is confined to that
    wrapper and must stay so**: the host list also holds `.entry-content`,
    `main` and `body`, and sweeping one of those would blank the page.
    Mutation `js-sweep-unconfined`.
  - **3. THE CANAL BANNER WAS STILL BEING FETCHED TWICE** — SpeedyCache Pro
    preloads the PAGE'S FEATURED IMAGE at high priority (227 KB) and the theme
    prints the article's featured `<picture>`, hidden, through i0.wp.com. 0.35.0
    replaced the HEADER IMAGE's url, which is a different thing. Now the
    checkout page has **no featured image for that request**
    (`_thumbnail_id` absent, `has_post_thumbnail` false), so neither has
    anything to emit. Not CSS — **a hidden download is a download.**
    **SCOPED TO THE CHECKOUT PAGE'S OWN ID**, through the extracted
    `Assets::checkout_page_id()` (ONE resolution, filter and all, shared with
    the gate): the hero and the Continue card read `_thumbnail_id` on the ROOM
    TYPE, and an unscoped filter would blank the cottage photo and leave the
    page with no picture at all.
    **THIS ENTRY USED TO SAY "Inside the no-photo gate too, because without a
    cottage photo the banner IS the header…" — IT IS THE OTHER WAY ROUND**
    (corrected 2026-10-26 by reading `Hero::maybe_hook()`, not this file).
    `suppress_page_featured_image()` is called AFTER
    `if ($this->photo_url() === '') { return; }`, so it does NOT run when there
    is no cottage photo — and the reason the old sentence gave is exactly the
    reason the code declines to: with no cottage photo the canal banner IS the
    header, the header image on this theme comes from the same attachment, and
    suppressing `_thumbnail_id` could blank the header outright. The code is
    right; the note was the opposite of it, which is the wrong-mechanism
    failure the git section above exists to warn about.
    **CONSEQUENCE, MEASURED ON LIVE 0.36.1 (2026-10-26, plain GET, nothing
    swapped): the canal banner is still fetched twice on the switch-off
    checkout** — the un-resized original at **227,470 bytes** (the header
    image, which Bravada prints as both a background div and an `<img>`) plus a
    Photon `?fit=` copy at 40.5 KB (390) / 59.4 KB (1440), the article's hidden
    featured `<picture>`. 268 KB at 390, 287 KB at 1440. The suppression cannot
    reach it: `maybe_hook()` returns unless `Layout::active()` AND a cottage
    photo exists, and the switch is off on live. The Director's 0.35.2
    verification was measured through the PREVIEW LINK, where both gates pass;
    it was true there and still is.
    **ROB'S DECISION (via the Director, 2026-10-26): LEAVE IT. Do not change
    `Hero::maybe_hook()`.** The canal photo is 1214x911 and the 420px band
    stretches it across 1440px — and to ~1,260 device pixels tall on a phone —
    so the original is already smaller than what screens draw and a smaller
    copy would only blur it. WordPress's 1024 copy is 278 KB against the
    original's 289 KB, saving almost nothing. **This is not an open defect; it
    is a closed decision**, recorded so it is not re-raised.
    **AND THE SHAPE OF A META FILTER'S ANSWER MATTERS**: core does
    `if ($single && is_array($check)) return $check[0];`, and
    `get_post_thumbnail_id()` asks with `$single = true` — so returning `[]`
    is an undefined-offset WARNING on every checkout render. It returns `''`
    for a single read and `[]` for a list. Found by reading core, not by a
    test; `tests/hero/` now models core's indexing step and turns PHP notices
    into failures (mutation `hero-thumb-list-shape`).
  - **4. THE WEBP TWIN LOOKUP WAS DEAD CODE ON LIVE, AND THE FIXTURE IS WHY IT
    LOOKED ALIVE.** Jetpack's Site Accelerator filters `image_downsize`, so
    `wp_get_attachment_image_src()` returns
    `https://i0.wp.com/…/Cottage-34-Photos-17.jpg?fit=1024,768` — the ORIGINAL
    file's name, on another host, with the size in a QUERY STRING — and
    `/\.(jpe?g|png)$/` cannot match that. 0.35.0's fixture returned a tidy
    local `-1024x768.jpg`, so every twin assertion passed while Photon served
    its own re-encode (76 KB against the twin's 53 KB; Cottage 36 124 against
    86). **The v0.9.0 rule in a new shape: a plausible fixture is missing
    exactly what nobody thought to put in it** — the fixture now returns the
    i0.wp.com URL live returns.
    `Hero::local_sized()` builds the URL from the attachment's **own
    metadata** — `sizes[<size>]['file']` for the real sized filename and its
    real pixel dimensions, the uploads base URL plus the original's
    subdirectory for the rest — so nothing passes through `image_downsize` and
    **there is nothing for Photon to rewrite and nothing to opt out of**. Two
    deliberate behaviours: **a missing twin falls back to whatever the site
    normally serves**, because Photon's re-encode is smaller than the local
    JPEG and returning the JPEG would be a step backwards; and **a size the
    metadata says does not exist returns null rather than reaching that
    fallback** (WordPress never generated a `large` for 960-wide Cottage 22, and
    letting that reach the fallback would hand it a Photon URL and lose its
    40 KB twin). The dimensions are always the metadata's true pixels, which is
    what the width floor needs.
  - **5. ONE `<h1>` IN THE HTML, NOT ONE VISIBLE.** 0.35.0 removed the
    HEADER-IMAGE title; the article's own
    `<h1 class="entry-title singular-title">Submit Booking</h1>` is a different
    heading in a different place and was merely hidden by CSS. **A hidden
    heading is still a heading** — the page had two h1s, the wrong one first.
    Removed using core's own rule: `the_title($before, $after)` returns BEFORE
    printing anything when the title is empty, so emptying the title takes the
    whole element. **Scoped three ways** because `the_title` is the most-read
    filter in WordPress: that page's id, `in_the_loop()` (the document
    `<title>`, menus and breadcrumbs are all outside it), and never in admin or
    a feed.
    **KNOWN LIMIT, ASSERTED RATHER THAN ASSUMED:** a template that writes the
    tags by hand keeps an EMPTY `<h1>`, which this cannot remove. Both shapes
    are in `tests/hero/`, so which one live is in is a reading; the Director
    was asked for the file and line if the empty one appears.
    **And 0.35.0's fixture carried NEITHER heading, "as the served page will
    not" — a statement of intent, not a reading, and both were on the live
    page.** The fixture is now parameterised and asserts both directions, so
    "exactly one `<h1>`" is a measurement rather than a property of the
    fixture. It does NOT assert that the theme title and the overlay collide:
    that needs Bravada's own CSS, which is not on this machine, and a first
    draft asserted an overlap and measured none.
  - **6. ROB'S CASING RULE, TWICE.** "Show Me ↑ 1 **of** 2" — a preposition
    stays down inside Title Case — and "Welcome **back. We kept your
    answers.** Please add your photo ID again.", three sentences, so sentence
    case. **Both old checks were substrings that survived either casing**
    (`photo ID again`), which is how 0.35.0 shipped them green; they are
    exact-sentence assertions now. The browser fixture's copy of the bar's
    strings is compared against the PHP that really sends them, in
    `tests/layout-fields/run.php`, so the two cannot drift again.
    **ALIGNMENT (Rob's standing rule): titles centred, only multi-sentence
    paragraphs left-aligned.** Applied to the Continue / Taken / Restart card
    (centred, with `.dcc_checkout-continue__lead` the one opt-out) and the
    welcome note. Measured in Chromium, not read off the stylesheet.
  - **A TEST BUG WORTH REMEMBERING: PHP reads `modify('+-5 day')` as PLUS five
    days.** The first draft of the "in the past" helper built
    `"+$days_ahead day"`, so every past-date case was a FUTURE stay and three
    assertions passed by not being tested. `sprintf('%+d day', …)`.
  - **A suite listed on a mutation must be able to KILL it.** The `-min`
    suites read the BUILT bundle, which the runner does not rebuild, so they
    can never see a source mutation; and a browser fixture carries its own
    copy of the localized strings, so it cannot see a PHP string change
    either. Listing one is apparent coverage.
- **0.35.2 — TWO CHANGES AFTER THE DIRECTOR'S CHECK OF LIVE 0.35.1**
  (2026-10-23; `Restore`, `restore.js`, `Rendered_Stay`). 0.35.1 went live the
  same day, switch still OFF, verified at 375px: the reload keeps the hero, no
  canal request and no i0.wp.com copy, the local twin
  `Cottage-34-Photos-17-1024x768.webp` preloaded and painted at one URL and the
  only image downloaded, one `<h1>` with nothing empty left behind, the plain
  dead end still correct. **The 227 KB preload had a SECOND source** — a
  site-wide SpeedyCache "Preload Resource" entry, which Rob has deleted; the
  featured-image suppression stays, because it is what removed the hidden theme
  `<picture>`.
  - **1. THE CARD'S WORDS ARE NOW TRUE OF EVERY CASE THAT REACHES IT** (Rob's
    pick). 0.35.1 shipped "Someone just booked %s for those nights." and this
    file recorded, as a known limit, that ANY refusal of a complete
    future-dated stay lands in that state. **The Director then named a real
    one: this site sets a TWO-NIGHT MINIMUM** (`mphb_min_stay_length` = 2), so
    a one-night request is refused with no form and nobody has booked
    anything — and that guest was being told a booking had happened. Now:
    "Those Dates Aren't Available" / "%s isn't available for those nights.
    Choose new dates and we'll bring you straight back." / "Pick New Dates"
    unchanged. **The STATE was not narrowed — the sentence was made honest**,
    because narrowing it would mean reading MotoPress's message. Mutations
    `res-taken-says-booked`, `res-taken-title-old`, and an assertion that no
    string anywhere matches `/just booked|someone/i`.
    **A limit recorded in prose is a defect waiting for someone to name a
    case.** It was written down honestly in 0.35.1 and shipped anyway; the fix
    was one sentence. When a "known limit" says the words may be false, change
    the words.
  - **2. MOTOPRESS'S MESSAGE IS A BARE TEXT NODE** (Director, live, Cottage 36
    Jan 11-14 2027). The wrapper's children are
    `[SECTION.dcc_checkout-continue, TEXT "Accommodation is already booked."]`
    — **a text node directly inside `.mphb_sc_checkout-wrapper`**. 0.35.1's
    structural sweep walked `host.children`, which is elements only, so there
    was nothing to put a class on and the sentence stayed under the card. A
    text node cannot carry a class, so each non-empty one is **wrapped in
    `<span class="dcc_checkout-hidden" data-dcc-injected="1">`** — the only way
    to hide one by stylesheet. The text is MOVED into the span, never re-typed
    (`innerHTML` would re-parse MotoPress's words); whitespace-only nodes are
    left alone; `childNodes` is snapshotted because wrapping replaces nodes as
    it goes. Still confined to MotoPress's own wrapper, still once at init,
    never from an observer and never in a touch path. Mutations
    `js-bare-text-left`, `js-bare-text-elements-only`, `js-bare-text-retyped`,
    `js-bare-text-whitespace`.
    **The lesson is the sweep's shape, not the class name.** "Every direct
    child that is not ours" sounded exhaustive and was not — `children` and
    `childNodes` differ by exactly the thing that was left visible. A sweep
    described as structural must say which node types it covers.
  - **THE ROOM COOKIE IS PINNED BY NAME**: `mphb_rooms_details` (the
    Director's read of live's three cookies), keeping the published-room-type
    check, the 3-digit floor, the text-only digit extraction and the ambiguity
    rule. The `mphb…room…` scan is gone, and with it the need to exclude the
    date cookies by name — a scan could read a four-digit year as a post id.
    The test that pins this makes post **2026 a published room type**, so a
    scan WOULD find it beside the real 1607 and show no hero; mutation
    `rs-room-cookie-unpinned`. A renamed cookie now means no hero, which is
    0.35.0's behaviour and harms nothing.
  - **ONE CARD, EVER** (found by the suite, not by live). Running the whole
    script twice over a finished page drew a SECOND card: `withoutForm()` had
    no guard. It cannot happen from this plugin's own flow — it runs once at
    init — but **SpeedyCache rewrites and concatenates assets on this site and
    has served a doubled or stale bundle before**, and two cards would be this
    plugin's bug however it happened. `withoutForm()` now returns if a
    `.dcc_checkout-continue` is already on the page. Mutation
    `js-second-card-drawn`.
  - **A fixture detail that mattered**: the booked wrapper is emitted TIGHT in
    `tests/restore/browser.js`, because live's text node is the sentence and
    nothing else. Padding the inner onto its own indented line made it
    `"\n  Accommodation…\n"`, and the "moved character for character"
    assertion would have passed for the wrong reason. The whitespace case is a
    page of its own.
  - **Rob's answer on `og:image`: leave it blank** — the checkout is not
    shared. Nothing to do; recorded so it is not re-raised.
  - **SWITCH-ON CRITERIA** (Director, for the record): 0.35.2 verified on live,
    Rob has tried the preview on his phone (AutoFill, and the photo's tint),
    and Rob says yes. He will then compare checkout-to-booking completion in
    Google Analytics for two weeks either side. **Nothing for this repo to
    build** — do not invent an analytics hook for it.
  - **THE FULL RUN AT 0.35.2: 286 + 286, and the second half earned its
    keep.** The first half was 286/286. The second was 278 killed, 1 SURVIVED
    and 7 STALE — the survivor being the unreachable-branch finding and the
    stale ones being 0.35.x's own rewrites. Both halves left the tree clean.
    **The targeted run of 0.35.2's eight was 7 killed + 1 SURVIVED**, and that
    survivor was a test of mine that could not fail: `js-bare-text-retyped`
    swaps the text node's move for `innerHTML = node.nodeValue`, and on plain
    prose that produces an identical single text node, so reading the span's
    text and its child's node type could not tell the two apart. The condition
    the claim names is text HTML would RE-PARSE, so the fixture's text node now
    carries `&` and angle brackets — realistic, since MotoPress's strings hold
    ampersands and its translations hold entities. **Rule, again: a claim about
    a MECHANISM needs an input on which the two mechanisms differ.**
  - **0.35.2 VERIFIED ON LIVE** (Director, 2026-10-23, 375px, switch still
    OFF): Cottage 36 Jan 11-14 2027 showed "Those Dates Aren't Available" /
    "Sunshine Suite isn't available for those nights…" / "Pick New Dates" →
    /cottages/, exactly ONE card; **a ONE-NIGHT request (Cottage 36, Mar 2-3
    2027) showed the same card and wording with no form** — the case the
    rewording exists for, now observed rather than reasoned; the wrapper's
    children read `[SECTION.dcc_checkout-continue, SPAN.dcc_checkout-hidden]`
    with the sentence inside the span and nowhere in the visible text; the
    plain dead end still "Pick Your Dates Again" with
    `p.mphb-data-incorrect` hidden; and the reload kept the hero, the pill and
    one `<h1>` on Cottages 22, 34 and 36, no sideways scroll.
  - **/submit-booking/ WAS BEING PAGE-CACHED, AND THAT IS WHY A RELOAD COULD
    LOOK WRONG** (Director, found and fixed on live 2026-10-23; no code
    change). SpeedyCache's exclusion was written `/submit-booking/`, but
    **SpeedyCache compares against the URI with its slashes trimmed**, so the
    rule never matched. Any cookieless GET cached the dead-end page, the
    pre-gzip rule then served that cached dead end **even to a GET carrying
    MotoPress's date cookies** — exactly the reload case — and a host nginx
    proxy cache in front held a copy too. The rule now reads `submit-booking`,
    the stale copies are deleted, both caches purged, and a GET with the date
    cookies renders the form. **Discount any earlier odd reload result on
    live.**
    **THE LASTING RULE, which is this plugin's to know: EVERY PHP-SIDE VALUE
    THIS PLUGIN PUTS IN THE CHECKOUT'S HTML IS PER-REQUEST, so a page cache
    freezes the FIRST visitor's answer for everyone.** That is `DCC_RESTORE`'s
    `stay` and `offer`, the hero's photo, name and dates pill, the featured-image
    suppression and the `dcc_layout` body class. None of it is private — the
    payload carries a room type, two dates, a cottage name, a photo URL and a
    `roomsDetails` pair, and **the guest's own answers never enter the HTML at
    all** (sessionStorage only, by design) — so a cached page is WRONG, not a
    leak. Checked, not assumed.
    **AND IT BEARS ON THE SWITCH.** `Layout::active()` reads a per-browser
    preview cookie, so if /submit-booking/ is ever page-cached again without
    the cache varying on that cookie, **a cached preview page could be served
    to a real guest** — the one thing the preview gate exists to prevent — or a
    cached today's-checkout could hide the layout from Rob. The gate fails
    closed per request and cannot fail closed against a cache in front of it.
    **Raised with the Director rather than coded around**: a belt
    (`DONOTCACHEPAGE`, a `Cache-Control: no-store` on the checkout) is possible
    but it is NOT PROVEN that SpeedyCache or the host's nginx honour either,
    and shipping an unverified header as a safeguard is the kind of line that
    looks like a fallback and is not. The exclusion is the fix; keeping it
    correct is the requirement.
  - **A RUN STOPPED MID-MUTATION LEAVES THAT FILE MUTATED, AND IT HAPPENED
    AGAIN.** 0.35.1's first full half was started with `nohup … &`, was killed
    at mutation 77 of 282 when the session's background slot ended, and left
    `checkout.js` one line short (`uncheckGuestServices(root)` deleted).
    Restored from git. **Start a full run as a tracked background command with
    an explicit timeout, not `nohup`, and `git status` after any run that does
    not print its own tally.**
- **0.35.3 — THE CHECKOUT PAGE IS NEVER PAGE-CACHED, AND THE UNREACHABLE
  BRANCH IS GONE** (Director's instruction after verifying the stack on live,
  2026-10-23; `Page_Cache` is new, plus `restore.js`, `Plugin::boot()`; suite
  `tests/pagecache/`).
  - **WHAT THE STACK HONOURS — PROVEN, WHICH IS WHY THIS CONSTANT AND NOT
    ANOTHER** (Director, live 2026-10-23). `DONOTCACHEPAGE` is read by
    SpeedyCache at **`speedycache/main/cache.php:190`** —
    `if(defined('DONOTCACHEPAGE') && DONOTCACHEPAGE) return false;` — inside
    the output-buffer callback that decides whether to WRITE the cache file,
    after the page is built, so defining it anywhere in the request works
    provided it is before output ends. **THE NGINX HALF IS AN OBSERVATION, NOT A
    RULE** (the Director's correction, 2026-10-24): he wrote that the host's
    nginx proxy cache "stores no response that sets a cookie" as though it were
    nginx's behaviour, and what he had was two consecutive plain GETs both
    coming back `x-proxy-cache: MISS`, with the only HIT ever seen there being
    nginx serving SpeedyCache's static `.gz`, which no written file removes.
    MotoPress does set `WP_SESSION_COOKIE` and its `mphb_*` cookies on every
    checkout response and that is the likely reason, but it was not
    established. **The belt rests entirely on the SpeedyCache code read**, so
    nothing changes — and the distinction is worth the words, because a rule
    invites you to reason from it and an observation of two requests does not.
    **`Cache-Control: no-store` IS NOT SHIPPED** — neither layer was shown to
    honour it, and an unverified header presented as the safeguard is the kind
    of line that looks like a fallback and is not. I had proposed it as one of
    two options and asked rather than guessing; that is why only one shipped.
  - **THE GATE IS `Assets::is_checkout_page()`, NOT `Layout::active()`, and
    that is the whole point.** `restore.js` is not behind the preview gate
    (0.35.0, Rob's instruction) and its `stay` / `offer` are per-request, so a
    cached checkout is wrong for every guest whether the layout is on or off —
    a belt gated on the layout would have left live-today exactly as exposed.
    Asserted with the switch OFF.
  - **THERE IS DELIBERATELY NO FILTER.** A page whose HTML carries per-request
    values cannot be safely page-cached, so "cache the checkout anyway" is not
    a preference to offer; a filter here would be a switch for re-opening the
    defect.
  - `template_redirect` at priority 1: the earliest point at which the main
    query is resolved (the gate calls `is_page()`), and long before output
    ends. Mutation `pc-wrong-hook` moves it to `init`, where the gate cannot
    answer.
  - **THE `defined()` GUARD IS NOT TIDINESS.** `define()` cannot redefine a
    constant — it raises a PHP **warning** and returns false — so without the
    guard a second render in one process, or another plugin having defined it,
    would put a warning on a guest's checkout. Every case in
    `tests/pagecache/` runs with notices turned into failures, and mutation
    `pc-no-defined-guard` removes the guard and must go red. **The suite's
    cases are ORDERED because a constant cannot be undefined**: every
    must-not-define case runs first, behind a guard asserting the constant
    really is absent, or they would pass by having nothing to say.
  - **TWO LIMITS, STATED RATHER THAN IMPLIED.** (1) This stops a file being
    WRITTEN; it does not delete one already on disk, and
    `advanced-cache.php` can serve such a file before WordPress loads — so a
    stale copy still has to be purged, which the Director has done. (2) If
    anything else has already defined `DONOTCACHEPAGE` as FALSE, the guard
    leaves it false; nothing on this site is known to set it.
  - **THE CORRECTED SPEEDYCACHE EXCLUSION STAYS THE FIRST LINE OF DEFENCE**
    (Director). The rule must read `submit-booking` — **SpeedyCache compares
    the URI with its slashes trimmed**, so `/submit-booking/` never matched,
    which is what let a cookieless GET cache the dead-end page and the pre-gzip
    rule then serve that dead end to a GET carrying MotoPress's date cookies.
    Keeping that rule correct is a requirement, not a nicety.
  - **REMOVING FOUR LINES LEFT FOUR ANCHORS STALE, AND THE RUNNER COULD ONLY
    FIND THEM LATE AND IN PART.** Dedenting `hideDeadEnd()`'s body broke the
    find-strings of `js-sweep-unconfined`, `js-booked-line-shown`,
    `js-bare-text-elements-only` and `js-bare-text-left`. The targeted run
    happened to include two of them and reported "2 STALE", **which read like
    the whole answer**; a full run would have discovered the others up to two
    hours in, one at a time, and only those it reached.
    **So the preflight now checks every anchor before any suite runs**
    (`stale_anchors()`), which costs milliseconds against 612 string counts,
    and it is reachable on its own as `python3 tests/mutate/run.py --anchors`
    — **a check only callable behind thirty-six suites is a check nobody can
    prove fires.** It was proved to FAIL on all three stale shapes (a find
    that cannot match, a declared count that cannot hold, a file not on disk),
    exits non-zero, and the baseline is not green while any anchor is stale.
    **Run `--anchors` after any edit that moves code**, which is cheaper than
    learning it from a run.
  - **THE UNREACHABLE PINNED-SELECTOR BRANCH IS REMOVED** (queued at 0.35.2,
    done here as the Director asked). `hideDeadEnd()` now returns unless the
    host IS MotoPress's wrapper. The live markup it used to query
    (`p.mphb-data-incorrect` inside `.mphb_sc_checkout-wrapper`) is kept in the
    comment, as the record of what live serves — only the dead query went. A
    strict no-op: the mutation runner is what found it, and
    `res-dead-end-selector-guessed` was retired with it.
- **0.36.0 — THE DESKTOP, AND A WAY FORWARD OUT OF BOTH DEAD ENDS** (Rob: the
  checkout "looks terrible" on a desktop, and "the whole point of revamping the
  Custom Checkout this time around was for it to be prettier and better UI";
  the Director's measurements at 1440 and 390, 2026-10-24). **EVERY CHECK LIST
  AND EVERY VERIFICATION FROM 0.35.0 TO 0.35.3 WAS AT 375px ONLY** — that is
  the root cause of all of it, and from here every check list covers **390, 768
  AND 1440**. Suites: `tests/cards/` (new), plus `tests/restore/`,
  `tests/layout-fields/` and `tests/hero/`.
  - **NOT THIS REPO'S, BUT LOAD-BEARING:** the checkout page (1399) carried an
    Elementor page background of `#0A50B2`, which is what drew the two blue
    132px bands down the sides at 1440. The Director removed it on staging and
    live (backups `~/mu-backups/elementor-pagesettings-1399-*-pre-bg-*.json`).
    **THIS ENTRY USED TO END "the page now shows the theme's grey
    rgb(206,206,206). Do not style around the blue; it is gone." THAT IS WRONG
    AND WAS CORRECTED ON 2026-10-26, BY MEASURING** rather than by reading it
    here: `body` on live computes `rgb(10, 80, 178)` at 390, 768 and 1440, and
    `18-post-1399.css` in `tests/real-theme/` still carries
    `body.elementor-page-1399 … {background-color:#0A50B2}`. Whether it was
    re-added or the removal did not take is not known and does not matter — the
    blue is what 0.36.2's "Blue All the Way" floats the card on, so a reader
    who trusted the old sentence would have built the feature on a colour that
    is not there. **The two side bands at 1440 are gone either way**, which is
    what that fix was for; the page background is not.
  - **THE TWO CARDS ARE ONE CENTRED COLUMN AT EVERY WIDTH, 560px AT MOST.**
    They were a `240px 1fr` grid built for the Continue card's photo, so on the
    two cards that have no photo the heading and the button were squeezed into
    the 240px column — and this plugin's own 50px line box then wrapped "Pick
    Your Dates Again" into a 240x100 pill — while the lead floated alone in the
    690px column. The grid is gone; the phone's shape is now the desktop's.
    The button is `white-space: nowrap` with real padding and a 1.2 line
    height, so its width comes from its words.
  - **THE CARD SITS ON THE HEADER PHOTO, IN THOSE TWO STATES ONLY.** At 1440 it
    began at y=466 under a 420px band; it now lands at 260 at all three widths,
    which is Rob's "at or above 300" with 40px of slack. **THE PULL IS
    MEASURED, NOT A CONSTANT** (`fitCardToHero`): the distance to close
    includes Bravada's own padding above the content, so a tuned negative
    margin would be right at the two widths it was tuned at and wrong at the
    third. Three things had to go with it, and each was found the hard way:
    - **THE THEME'S CLIPPING HAD TO BE REMOVED or the pull is invisible.**
      `main.main` and `div.one-column` are `overflow: hidden`, so the card
      moves and is then cut off — and **every geometry assertion passes either
      way**, because `getBoundingClientRect` reports the box, not the paint.
      The test is a hit-test (`elementFromPoint` 10px inside the card's top);
      mutation `css-card-clipped`. Removed for this page and these two states
      only, at every width.
    - **THE SOFTENING OVER THE PHOTO MUST CARRY NO `z-index`.** `article.hentry`
      has a matrix3d transform, which makes a stacking context, so the card's
      own `z-index: 3` is scoped inside it and cannot outrank a root-level one:
      a `z-index: 2` on the scrim painted the wash OVER the card — heading,
      lead and the top of the button all grey. **FOUND BY LOOKING AT THE
      SCREENSHOT**, which is how 0.35.0's missing borders were found too.
      Mutation `css-scrim-over-card`.
    - **THE HERO OVERLAY IS REMOVED, NOT HIDDEN** (`dropHeroOverlay`). It is an
      `<h1>`, the card supersedes it (the card names the cottage and the dates),
      and the card is pulled up over where it sat. Safe because it is this
      plugin's own element — Hero prints it and nothing reads it.
  - **THE CARD'S HEADING IS AN `h1` WHEN THE PAGE HAS NO OTHER, AN `h2` WHEN IT
    HAS**, and it is EXISTENCE that decides, not visibility. With the switch ON
    there is no other h1 and the card's is the page's, visible. With the switch
    OFF — live today — the theme's 0x0 "Submit Booking" title is still in the
    HTML (Hero only empties it behind the switch), so the card's heading steps
    down and that 0x0 title stays the page's only h1. Keying on visibility
    would make two h1s in the HTML, which 0.35.1's item 5 forbids; deleting the
    theme's heading was rejected because a 0x0 heading is still read aloud and
    "invisible" is not "unwanted". Mutation `js-card-h1-by-visibility`. **The
    styling is keyed on the CLASS** (`.dcc_checkout-continue__title`) — and so
    are the tests, after four of them broke by reading `h2`; that is v0.22.0's
    lesson in a third shape.
  - **"THOSE DATES AREN'T AVAILABLE" OFFERS THE NEXT THREE OPEN STAYS**, from
    the Availability Calendar's public `admin-ajax.php?action=mphbac_query`
    (POST, no nonce — that plugin's own documented decision, because a nonce in
    cached HTML expires; no guest data, writes nothing). **THE RESPONSE'S
    CONTRACT WAS READ, NOT GUESSED**: the Calendar's own
    `Booking_Rules::encode` on its branch `claude/review-shared-chat-bExtl`
    (its 0.47.5) — `in`/`out` are one character a day aligned with `[from,to]`
    (`'1'` allowed; `w` MotoPress allows no arrival/departure, `a` too soon,
    `f` too far), `min`/`max` are ONE number when every day agrees and one per
    day otherwise, `min` is ABSENT when MotoPress has no minimum-stay rule, and
    `max` 0 means no limit. `rules` itself is optional — without it
    availability alone decides, which is the Calendar's own documented
    degradation.
    - **A CHIP IS MOTOPRESS'S OWN BOOK NOW SUBMISSION AND BOOKS NOTHING**: a
      POST of the five fields a cottage page sends (`mphb_room_type_id`,
      `mphb_check_in_date`, `mphb_check_out_date`,
      `mphb_rooms_details[<type>]`, `mphb_is_direct_booking`), which RENDERS
      THE FORM for those dates. MotoPress re-checks availability and prices it;
      the GUEST submits. That is the mechanism the Director asked me to name,
      and it is the one `continueCard()` has used since 0.35.0 — now extracted
      to `stayForm()` so there is one copy of the field list.
    - Nights = what the guest asked for, raised to the minimum. The one-night
      case is real: the site's two-night minimum is why that request got no
      form at all, so offering more one-night stays would walk the guest into
      the same wall. `Restore::min_nights()` (filterable, 2) is only the floor
      used when `rules` is absent; `rules.min` is preferred because it is
      MotoPress's own answer.
    - Chips do not overlap — the scan jumps to each stay's check-out — so three
      chips are three choices rather than the same week shifted by a day.
    - **IT FAILS QUIETLY**: fails, times out at 3s, or finds nothing → the card
      is exactly 0.35.2's, with no spinner and no error line. All four cases
      are constructed in `tests/cards/`.
    - **THE PERMISSIVE FIXTURE TESTED NONE OF THE RULES.** The first version
      had `in`/`out` all `'1'` and a scalar `min`, so every rule branch agreed
      with it by construction. There are now four constructed cases —
      forbidden arrival/departure days, a per-day `min` ARRAY, a `max` shorter
      than the request (nothing is offered), and no `rules` at all.
  - **"PICK YOUR DATES AGAIN" SHOWS ALL EIGHT COTTAGES**, lazily, two rows of
    four at 1440 and a sideways-scrolling row at 390 — the LIST scrolls, never
    the page. No new uploads: each cottage's own featured image at the smallest
    registered size, through Hero's WebP preference.
  - **EACH HALF IS SENT ONLY TO THE STATE THAT CAN USE IT** (Rob's "zero new
    requests on the normal form path"): `avail` only when `offer === 'taken'`,
    `cottageList` only when `'lost'`. **AND THE STRIP IS CACHED FOR HALF A
    DAY**, because a cookie-rebuilt checkout IS the lost state (0.35.1, item 1)
    and renders a working form — without the transient that query would run on
    a normal render. Constructed in `tests/restore/`: the taken config is
    asserted to have made no query at all.
  - **THE DESKTOP IS TWO PANES AT >=1000px**: the Your Stay card on the LEFT,
    sticky, with the cottage photo in it; the form on the RIGHT in one
    left-aligned 560px column with the fields filling it. **The panes are
    assigned by `grid-column`, so the card paints left while staying second in
    the DOM** — deliberately: it holds the acceptance tick, and the tab order
    stays "fill the form, then accept". Page height at 1440: **3,202px →
    1,603px**.
    - **THE CARD'S PHOTO IS THE HERO'S OWN URL**, not a smaller size. The
      header already paints that file as a CSS background and the preload has
      asked for it, so the `<img>` is a cache hit; a smaller registered size
      would be fewer bytes in the abstract and a whole second download in
      practice. Its real pixels go with it so the card reserves the box.
    - **THE 29-OF-30 CENTRED LABELS WERE THIS PLUGIN'S OWN.** `checkout.css`
      centres `.mphb_sc_checkout-form label` and four siblings with
      `!important` — the field standard's choice for the phone — and underlines
      the section titles at 25px the same way. Inheritance cannot touch a
      direct `!important` rule, so the desktop override names the same elements
      at (0,3,1) and is `!important` itself. **The phone keeps both**; Rob
      reviewed the phone and likes it.
    - **THE SMART NEXT BAR HAS THREE HOMES NOW**: body (pinned) below 900, the
      card at 900-999, and the SHEET at 1000+ — because the card has moved to
      the left pane and the bar belongs under the form being filled, not under
      the price. It is moved, never rebuilt.
    - **TABLET, 768-999: one column, 640 at most, centred.** The bar's own band
      stays 900, so at 768 it is still the phone's pinned bar. **The 360px
      field cap is still in force there** — measured, and worth a decision if
      Rob wants it wider: a 360px field in a 640px column is 56% of it.
  - **THE SHEET'S ROUNDED TOP AND GRAB LINE ARE A PHONE'S.** At 1440 they
    stretched the full 1425px and read as a panel somebody left there; there is
    nothing to swipe on a desktop. The lip rule is wrapped in
    `@media (max-width: 899px)`, and `tests/hero/browser.js` asserts it is
    drawn below 900 and `content: none` at and above — at 360, 390, 768 and
    1440, having run at 360/390/1280 before.
  - **A FIXTURE HAD THE 360px FIELD CAP SWITCHED OFF WITHOUT ANYONE NOTICING.**
    `tests/layout-fields/`'s field rows were bare `<p>`s, carrying neither
    `.dcc_checkout-field-row` nor MotoPress's own `p.mphb-text-control`, so the
    cap was never in force and "the fields fill the column" passed while
    measuring nothing. They carry the real wrapper now and BOTH directions are
    asserted: capped at 360 at 390 and 768, filling 560 in the pane.
- **0.36.1 — THE CARD MOVES INTO THE HEADER, AND THE FIXTURE IS NOW THE REAL
  PAGE** (the Director's staging read of 0.36.0, then the live-swap capture,
  2026-10-26; `Restore`, `restore.js` `cardHome()`, `checkout.css`,
  `checkout-layout.css`; the new standing fixture `tests/real-theme/` and its
  suite, plus `tests/cards/`, `tests/layout-fields/`).
  **0.36.0 IS STAGING-ONLY AND MUST NOT GO LIVE.** On the real theme the top
  half of the card was painted over by the header, at 390, 768 AND 1440, with
  the switch off and on: the heading, the lead sentence and the dead end's
  title were invisible and the guest saw only the dates, the button and the
  chips.
  - **ATTACHMENTS NEVER REACHED THE CONTAINER — three tries — SO THE FACTS
    WERE READ OFF LIVE.** The live-swap method, now the standard: GET the real
    page in Chromium through the container's proxy (never a submission, never
    a POST of any kind — the availability endpoint is stubbed locally), serve
    the build in place of the plugin's own JS/CSS responses, rewrite the
    `DCC_RESTORE` payload in the document, and add the `dcc_layout` body class
    and `checkout-layout.css` for the switch-on state. **A reproduction built
    from prose is what this release exists to correct**; nothing below was
    guessed.
  - **IT WAS A STACKING PROBLEM AND NO z-index ON THE CARD COULD HAVE FIXED
    IT.** Measured in Chromium on live:
    ```
    header#masthead            position: relative  z-index: 999
      #site-header-main        position: absolute  z-index: 251   (the menu)
        .site-header-bottom-fixed, once pinned     z-index: 9999
      #header-image-main       position: relative  z-index: auto  overflow: HIDDEN
        #header-image-main-inside                  z-index: auto  overflow: HIDDEN
          #header-page-title   position: absolute  z-index: 11
    #content
      #container.one-column
        main#main              position: relative  z-index: 9     overflow: hidden
          article.hentry       matrix3d(...)  -> its own stacking context
    ```
    `#masthead` (999) and `main` (9) are siblings in the ROOT stacking context,
    so everything in the header paints above everything in the content; the
    article's matrix3d then scopes the card's own z-index inside `main`'s 9,
    which is why 0.36.0's `z-index: 3` did nothing. `#main`'s 9 is
    `#container:not(.bravada-landing-page) .main` in Bravada's style.css.
  - **SO THE CARD IS A CHILD OF `#masthead`** (`cardHome()`), inserted after
    `#header-image-main`, with `z-index: 12` — above the theme's page title
    (11) and below the menu (251) and the pinned bar (9999), all four in the
    same context. **The Director's baseline is kept BY CONSTRUCTION, not by
    tuning**: the Browse Cottages dropdown cannot stop opening over the card.
    The pull is still `fitCardToHero()`'s measured negative margin, unchanged,
    and the card lands at y=260 at all three widths.
  - **A SIBLING OF THE PHOTO BAND, NOT A CHILD OF IT — and that departs from
    the brief's preference, deliberately.** `#header-image-main` AND
    `#header-image-main-inside` are BOTH `overflow: hidden` (Bravada
    style.css, one rule, all three widths), and that clip is what crops the
    cottage photo to the 420px band. A card inside them is cut at 420 — its
    button and, on the taken card, its chips — and unclipping them to make
    room would release the photo. Immediately after the band the stacking is
    identical and the theme's crop is untouched. **Checked rather than
    assumed: the theme has exactly TWO rules reaching arbitrary descendants of
    `#masthead`, and both name `.header-image`** (across all thirty of the
    page's stylesheets), so the move restyles nothing. The card carries its own
    side gutter there (`width: calc(100% - 36px)`), because in the content it
    was inheriting `article.hentry`'s 18px padding — 354 at 390, 560 above.
  - **THREE TOP PROBES CANNOT SEE A CLIPPED CARD.** The card's top three
    depths (260/340/410) are all inside the 420px band, so a card put inside
    it passes every one of them while the button below 420 is cut off — and
    `getBoundingClientRect()` reports the full box of a clipped element, so
    geometry cannot see it either. The suite probes the card's BOTTOM and its
    primary control as well. Mutation `js-card-inside-band`.
  - **`tests/real-theme/` IS THE STANDING FIXTURE** (captured 2026-10-26):
    the live page, its THIRTY stylesheets downloaded **in document order**
    (`css/01-` .. `30-`, order in the filename — Seasons found that reordering
    them broke the cascade), its EIGHTEEN inline `<style>` blocks left exactly
    where they were (the Elementor kit is inline on this site, so a fixture
    that drops them is missing most of the button and field rules), its
    twenty-seven scripts, and the fonts localised so text metrics are the
    site's own. 225 assertions, at 390/768/1440 x {taken,lost} x {switch off,
    on}. **Source assets by default, built under `DCC_MIN`** — a suite that
    only reads the built bundle cannot see a source mutation and the runner
    does not rebuild, which is apparent coverage; both are registered.
    **REFRESH IT AFTER ANY BRAVADA OR ELEMENTOR UPDATE** (and any Customizer
    change touching the header): `php tests/real-theme/refresh.php` prints the
    steps and **deliberately does not fetch** — the one thing that must never
    happen on that page is a write, and a fetcher is a script someone later
    extends to "just log in first". The capture's date is asserted, so a stale
    fixture is visible rather than silent.
  - **THE MENU PROOFS MOVED OUT OF `tests/cards/` AND WERE NOT UPDATED
    THERE.** Eighteen green assertions built from the Director's prose — the
    dropdown's eight links over the card, the bar pinned at >=1024, the band
    scrolling away below. They were a reproduction of the exact rules this
    release got wrong, and the same fixture's stacking reproduction passed its
    hit-test while live was broken, so a green menu proof built the same way
    says nothing either. Measured against the real stylesheets instead, where
    the bar turned out to be **`position: absolute; top: -75px` below 1024 and
    `fixed; top: 0` at and above it** — and **pinned only after a scroll UP**:
    a single jump to 600 catches it mid-transition at `top: -45px`, which is
    neither state and would make any assertion about it a race. Down then up
    is the real gesture and it settles. The Director's own numbers hold: at
    768 the band is at **-665** after a 600px scroll, exactly as he measured.
    No mutation was lost — nothing in `mutations.json` ever named those
    assertions. `tests/cards/` keeps everything that is the card's own, now
    measured with the real header's stacking above it.
  - **THE TWO HEADINGS THE FIX TARGETED HAD NO ELEMENT IN ANY FIXTURE.**
    0.36.1 removed the underline from `.mphb-booking-details-title`
    ("Reservation Details") and `.mphb-room-number` ("Accommodation Details"),
    the two the Director found still underlined on staging — and **no fixture
    in this repo contained either selector**, so the rule was unverified prose
    with a mutation that could not fail. Both blocks are now in
    `tests/layout-fields/`. Found by grepping the fixtures for the selectors
    the new rule names, which is worth doing for every new rule.
  - **FOUND WHILE CAPTURING, NOT CHANGED** (reported, not acted on):
    **MotoPress is 6.4.0 on live**, not the 6.3.0 recorded throughout this
    file — every "VERIFIED live 6.3.0" above was read against the previous
    release. And **SpeedyCache is not combining the stylesheets on this page**:
    all thirty are served individually, and this plugin's `checkout.min.css` is
    loaded BEFORE Bravada's `style.css`, so a theme rule at equal specificity
    wins on source order.
  - **TWO FIXTURE FAULTS THE NEW SUITE'S OWN GUARDS CAUGHT**, both of which
    would have read as a passing feature: Playwright matches the
    **most recently registered** route, so registering the catch-all abort
    last killed the stubbed availability endpoint and the chips read 0; and
    the real page in these two states is only 844-1064px tall, so it **cannot
    scroll 600 at all** and the pinning never triggered. The spacer that fixes
    the second is the ONLY thing added to the real page, it goes inside
    `#content` below everything measured, and it is labelled as such.
  - **THE HEADING FIX WAS NOT A FIX UNTIL THE FIXTURE HELD THE ELEMENTS.**
    0.36.0's desktop block put `.mphb-room-number` in its LEFT-ALIGNED list,
    as a label-ish element, before anyone had read what it renders — it is
    MotoPress's H3 **"Accommodation Details"**, a title. So that rule and
    0.36.1's centred-headings rule named the same element and disagreed, and
    the left one WON, being `!important` at (0,4,1) against (0,3,1): the
    heading stayed left at >=1000px while reading centred at every other
    width. **That is the "inconsistently aligned" the Director reported, and
    removing the underline alone would not have touched it.** Under Rob's
    standing rule a title is centred and only a multi-sentence paragraph reads
    left, so the selector came out of the left list. Mutations
    `css-room-number-left-again` and `css-headings-four-of-five`.
  - **A/B ON THE DESKTOP HEIGHT: ANSWERED, WITH ONE FACT MISSING, AND IT IS
    THE ONE THAT DECIDES SAFETY.** Stills and heights were measured on the
    real theme at 1440 (`Custom Checkout - 0.36.1 desktop A/B 1440.png`). But
    the block B folds away, `.mphb-booking-details`, held **two form
    controls** in the stand-in — the Number of Guests chooser among them —
    and that chooser is what drives the extra-guest fee, the guest panels and
    MotoPress's own "Please select the number of guests". **Whether the real
    block contains it is NOT KNOWN**: nothing in this plugin references
    `.mphb-booking-details`, the preview form needs a live reservation, and
    the stand-in's nesting is a guess. If it does, B hides a required control
    and must not ship in that form; if it is summary text only, B is safe.
    **Asked for one reading rather than guessed.** Separately, the arithmetic
    on the Director's own live numbers says **B alone does not reach the
    2,000px target**: 3,240 − 590 ≈ 2,650.
- **0.36.1 IS LIVE (2026-10-26, md5 `cff1bb2859a0bef8c82b3a8ab0a8b68a`)**, Rob
  approved after the Director's staging pass. His measurements: staging switch
  ON at 390 — card a child of `#masthead` right after `#header-image-main`, top
  260, 354 wide, z-index 12, hit-tests at 10/30/near-bottom all the card, one
  visible h1, no sideways scroll; staging 1440 — top 260, 560 wide, and after
  scrolling down and back to 600 the bar's bottom is at 63 with the card's top
  at 127 and a hit at the card's top returning the card; **live, switch off,
  768, fresh visitor** — parent `#masthead`, top 260, 560x574, hits at 10/30/
  bottom all the card, button plus eight cottage links, one h1, no sideways
  scroll. **He did not check the taken card with a real taken stay, nor the 768
  dropdown over the card on live** — the 12-combination live-swap run covered
  both, and he looks at them next release.
  **`.mphb-booking-details` HOLDS THE GUEST CHOOSER, SO OPTION B CANNOT SHIP**
  (his read, staging form, Cottage 36, Dec 7-10, layout on). The block is
  `h3.mphb-booking-details-title`, the two date lines, then
  `div.mphb-reserve-rooms-details > div.mphb-room-details` containing
  `input[room_type_id]`, `h3.mphb-room-number`, `p.mphb-room-type-title`,
  **`p.mphb-adults-chooser` (the native select AND `fieldset.dcc_layout-segment`)**,
  the three `section.dcc_checkout-guest-section`s, the guest note,
  `input[children]`, `p.mphb-guest-name-wrapper`, `input[rate_id]` and
  `section#mphb-services-details-0`. So folding that block away on desktop
  would hide the control that drives the extra-guest fee, the guest panels and
  MotoPress's own "please select the number of guests" — exactly the risk the
  stand-in flagged. **Only the title, the two date lines, the room number and
  the room-type title are safe to compact**, and that is Rob's call from stills
  at 390/768/1440; nothing is built for it yet.
- **0.36.2 — "BLUE ALL THE WAY"** (Rob's pick from a mockup on the live page,
  via the Director 2026-10-26; `checkout.css` only, plus `tests/real-theme/`).
  With the card moved into the header, `main#main` was left empty and still
  painted a WHITE BAND under it — measured on live 0.36.1: 108px at 390, 114 at
  768, 175 at 1440, holding nothing a guest can see. The band goes; the card
  floats on the site's blue down to the footer.
  - **FOUR WINNING RULES WERE READ WITH CDP, AND THE NAIVE READ FOUND NONE OF
    THEM.** My first enumeration walked `document.styleSheets` and split each
    `selectorText` on commas — which **breaks `:not(a, b)`**, so `matches()`
    threw on the fragments and the script reported *no background rule at all*
    for an element computing `#FFFFFF`. `CSS.getMatchedStylesForNode` gave the
    real answer:
    - background: `article.hentry, body:not(.blog):not(.page-template-template-blog):not(.archive):not(.search) #container:not(.bravada-landing-page) .main, …` → **(1,6,1)**
    - padding: `.cryout #container[class*="one-"] … .main` → **(1,3,1)**
    - margin: the same rule, `1.5em` → (1,3,1)
    - the article's own branch and its `2em` margin → **(0,1,1)** each
    **`body.dcc_checkout-cardover main.main` is (0,2,1) and loses to all three
    of main's**, so the obvious rule would have looked right in the file and
    done nothing. `main` therefore carries `!important` on background, both
    paddings and the margin; **the article deliberately does not** — (0,2,1)
    beats (0,1,1) outright, and keeping it weak leaves a later deliberate
    override able to win. They are separate blocks with a comment saying so, so
    a tidy-up cannot merge them and leave `main` correct by accident of order.
  - **THE BLUE BELOW THE CARD IS ONE NUMBER, OWNED BY THE CARD.** With `main`
    collapsed the gap would be whatever the theme's margin happened to be —
    measured **27px at 390, 28.5 at 768 and 0 at 1440**, three different
    answers to "about 38px". So `main`'s margin goes to 0 and the card's own
    `margin-bottom` is the gap: **38px at every width**, one place to change.
  - **NOTHING IS HIDDEN OR REMOVED** (the Director's instruction): only
    background, padding and margin move.
    **THE SCHEMA COUNT RECONCILES THREE WAYS, AND THE FIRST ASSERTION ON IT WAS
    VACUOUS** (his correction, 2026-10-26, then measured here). Same markup,
    counted differently: **13** is `.schema-image, [itemprop]` document-wide
    (what this entry used to quote), **11** is that selector inside `main#main`,
    and **10** is `[itemprop], [itemscope]` inside `main` (his earlier note).
    Nothing was lost. But the assertion was `document.querySelectorAll(...)
    .length > 0`, and **two of the thirteen — `#site-title` and
    `#site-description` — are in the HEADER**, so it would have read 2 > 0 and
    passed with every schema node inside `main` stripped, which is the one
    thing the claim is about. Now scoped to `main` and pinned at 11.
    **AND A COUNT STILL CANNOT CATCH THE FORBIDDEN APPROACH**, which is worth
    saying rather than leaving as a pinned number that looks sufficient: 0.36.2
    is CSS-only, CSS cannot remove a node, and `querySelectorAll` finds
    `display: none` elements too — so no mutation of this stylesheet could ever
    turn that count red. What the instruction rules out is HIDING, which a
    stylesheet CAN do, so `main`'s and the article's computed `display` and
    `visibility` are asserted directly. Mutation
    `css-main-hidden-not-transparent` puts `display: none` on `main` and goes
    red; the count is kept for removal, which nothing here can cause today.
  - **THE PIXEL CHECK DOES NOT READ THE FLAT BLUE, AND ASSERTING THAT IT DID
    WOULD HAVE BEEN ASSERTING A BUG.** The brief said "pixel colour 20px under
    the card is the blue"; it reads **rgb(9, 76, 170)**. The column rises
    smoothly from rgb(8, 69, 155) at the card's edge to rgb(9, 79, 177) by
    37px — that is **the card's OWN `box-shadow`** (`0 10px 30px
    rgba(0,0,0,.18)`, 0.36.0) seen against the blue. A control page painting
    `#0A50B2` screenshots as exactly rgb(10, 80, 178), so the pipeline is
    faithful and the tint is ours. What is asserted instead is what the release
    promises: **not one near-white pixel** in that column, every pixel a blue,
    and the far end of the gap the body's own `#0A50B2` within one unit. The
    column is decoded by Chromium itself, so there is no image library to trust
    — and a pixel catches a pseudo-element or a gradient, which the
    computed-style checks cannot.
  - **THE FORM PAGE IS UNTOUCHED, AND THE BRANCH IS NOW ACTUALLY TAKEN.**
    `body.dcc_checkout-cardover` exists only in the two no-form states, so
    nothing here can reach a working checkout — but that is a claim about a
    branch. **My first version of this check measured a cookieless GET of live,
    which IS the dead end: it reported `form=false, cardover=true` and proved
    nothing.** `tests/real-theme/` now builds a third state with a form in
    MotoPress's wrapper, so `restore.js` takes `withForm()`, and asserts no
    class, no card, and the theme's white content area and padding exactly as
    live draws them.
  - Mutations: `css-white-band-back`, **`css-white-band-no-important`** (the
    specificity claim — without it the theme's (1,6,1) wins and the white
    returns), `css-main-padding-kept`, `css-article-white-left`,
    `css-blue-gap-from-theme`.
- **THE THEME'S MENU BAR NOW HAS A SHARED CONTRACT — `dcc-topbar.php`**
  (mu-plugin, live 2026-10-26, the Director). Below 1024 the bar slides in on
  every scroll up, which is what `tests/real-theme/` measured as `position:
  absolute; top: -75px` below 1024 against `fixed; top: 0` at and above it.
  The mu-plugin publishes **`var(--dcc-topbar)`** (0px or 63px, following the
  slide), **`window.DCCTopbar.get()`** and a **`dcc:topbar`** event on change.
  **If anything of this plugin's is ever sticky at the TOP, read that rather
  than measuring the bar.** Nothing is today — the Smart Next bar is pinned at
  the bottom, and `tests/real-theme/` asserts nothing of ours is `fixed` or
  `sticky` after a scroll — so nothing was wired up: a reader that nothing
  reads is the "setting that never reaches its consumer" failure in another
  shape. **1.0.1 (2026-10-26) also follows the theme's 1s DESKTOP slide-in**
  as well as the phone slide; still nothing to do here for the same reason.

- **ONE-TAP PET FEE (B) — THE VERIFIED MOTOPRESS SURFACE, for 0.33.0**
  (Director, live 6.3.0 source, 2026-10-11; to be built AFTER Rob's review of
  0.32.0, folding in his findings — not before).
  - `ReservedRoom` getters: `getId()`, `getRoomId()`, `getRateId()`,
    `getBookingId()`, `getRoomTypeId()`, `getAdults()`, `getChildren()`,
    `getReservedServices()` (ReservedService[]), `getReservedServiceIds()`,
    `getGuestName()`, `getStatus()`, `getUid()`. Constructor atts: `id`,
    `room_id`, `booking_id`, `rate_id`, `adults`, `children`,
    `reserved_services`, `guest_name`, `status` (default publish), `uid`.
    **`uid` is read with array_key_exists — omit it and the constructor
    GENERATES A NEW UID, which breaks the room's tie to the iCal feeds. Always
    pass the room's own `getUid()`.**
  - `ReservedService::create($atts)` (entities/reserved-service.php ~34):
    needs `id` and `adults` (null otherwise, or for an unknown id); a
    flexible-pay service (`periodicity == 'flexible'`) also needs `quantity`.
    The three pet services (17712/17711/14926) are `per_night`, NOT flexible.
    Stored `_mphb_services` rows are `['id' => ORIGINAL id, 'adults' => int,
    'quantity' => int]`; live rows MotoPress wrote for a ticked pet box:
    `a:1:{i:0;a:3:{s:2:"id";i:17712;s:6:"adults";i:1;s:8:"quantity";i:1;}}` —
    write adults 1 / quantity 1 to price exactly like a ticked box.
  - `BookingRepository::updateReservedRooms(int $bookingId)`
    (repositories/booking-repository.php ~360) acts on the rooms `save()` took
    from `$entity->getReservedRooms()`: a room whose `getId()` is listed is
    saved IN PLACE (`CPTPersistence::createOrUpdate()`), any other existing
    room of the booking is DELETED. So rebuilding each room with its existing
    id, rate, adults, children, guest name, uid and other services keeps the
    posts and their `_mphb_adults_confirmed`.
  - MotoPress's own sequence (BookingControl::setup()): clone the booking,
    (setDates — skip), `setRooms($rooms)`, `updateTotal()` (calcPrice →
    getPriceBreakdown → PriceBreakdownHelper, coupons included), 
    `BookingRepository::save($booking)` (writes `mphb_total_price` and
    `_mphb_booking_price_breakdown`), `updateReservedRooms($id)`, `addLog()`.
    No status change → no status emails (prove on staging: no new email-log
    entry). Proof of the total: two identical staging bookings, one through
    one-tap and one through Edit Accommodations, totals and breakdowns
    compared by the Director.
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
  lifts, on a 500ms debounce (was 150ms). Evidence: every press in tap-log
  rounds 3 and 4 that carried the pipeline's ~100-attribute burst mid-tap
  failed, 6 of 6. **Any new work scheduled off that observer must respect the
  same gate** — `touchSettling()`.
  **The guarantee is recovery on the next touch-up, NOT a wall-clock ceiling**
  (corrected by audit, 2026-09-18). This entry used to claim a 3s ceiling made
  starvation impossible; it did not. The ceiling is only read inside `run()`,
  and `run()` only fires from a timer — exactly what is not installed while a
  finger is down. Measured: with a touch-up that never arrived, deferred work
  sat unrun for five seconds and counting. Every pending form now registers a
  checker in `touchUpChecks`, asked on each touch-up by name rather than
  through one shared slot the last deferral happened to own. That is
  sufficient — the pipeline always runs once directly at init, so a stranded
  deferral only leaves the most recent MotoPress re-render in MotoPress's own
  shape. **Do not "restore" a ceiling by installing a timer during a touch**;
  that is the thing v0.18.0 removed.
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
- **A TEST WRITTEN FROM THE SAME BELIEF AS THE CODE CANNOT DISAGREE WITH IT.**
  Named as its own rule (owner, 2026-09-18) because it is the failure the seven
  suites here are structurally blind to: they were all green through every
  defect listed below. The shape is always the same — a guarantee stated in
  prose, code that does not provide it, and a test that asserts the INTENT
  rather than constructing the CONDITION the prose names.
  **The check: for every "never", "always", "cannot", "at most" or ceiling in
  a comment or in this file, find the test that creates that case. If the only
  test is the happy path, the claim is unverified prose, however many
  assertions surround it.** "Cannot be starved" is only tested by constructing
  starvation; "bounded" is only tested by an absurd input.
  Worked examples from this repo, each of which shipped green:
  - The 3s ceiling (v0.23.1) is the sharpest. The reason it could never fire —
    `run()` only enters from a timer, and the `fingerDown` branch deliberately
    installs none — is visible in four lines and went unread for six versions,
    because the test asserted that deferred work runs after a touch-up, which
    is the case the ceiling does not cover. Measured once written the right
    way round: five seconds and counting, unrun.
  - The option range (v0.23.1): asserted at capacity 4, never at a corrupt
    9999 from the database.
  - The expander's colour (v0.22.0): asserted throughout, against a fixture
    still holding the `<a>` the code had stopped producing.
  - The field standard (v0.13.0): the export was diffed against nothing, and
    drifted from its source for several releases.
  A fixture copied from the code's own assumptions is the same error one level
  down — hence the v0.9.0 rule that fixtures come from real markup.
- **AN EXIT CODE IS NOT A TEST RESULT** (rule named by the owner, 2026-09-19;
  full write-up in `tests/mutate/README.md`). **Any runner that infers "the
  assertion failed" from "the process failed" reports a broken harness as proof
  that it works** — a crash, a syntax error, a missing dependency and a real
  failure all exit non-zero. Same family as the rule above: a signal that cannot
  tell success from absence of measurement.
  This runner had exactly that fault (`p.returncode == 0`) and it cost real
  coverage. Measured: with `tests/footnote/node_modules` moved aside a mutation
  was reported KILLED by a suite that ran zero assertions; and
  `js-form-ceiling-ALL` left `checkout.js` with **unbalanced braces**, so every
  suite crashed on parse and it was reported KILLED **for five days** — meaning
  *"a service row can never be the form"*, the defect that once blanked the whole
  checkout, had no evidence behind it. **The same fault had been seen here four
  days earlier** (two Chromium suites crashing on `require('playwright')`) and
  only its trigger was fixed, not the mechanism.
  **On the fixed runner the count did NOT hold: 49 killed, 1 HARNESS.** It holds
  at 50/50 only after re-targeting that one mutation
  (`js-form-ceiling-none`, which kills honestly). Say it that way round.
- **THE MUTATION RUNNER IS THE INSTRUMENT FOR THE RULE ABOVE.**
  `python3 tests/mutate/run.py [suite|id]`, `--preflight` for the baseline
  alone, or **`--anchors` for the find-strings alone** (milliseconds; run it
  after any edit that moves code — see 0.35.3). It applies one textual mutation, runs the suites that claim to cover it,
  and reports KILLED / SURVIVED / **STALE** / **HARNESS** / **INVALID**. **612
  mutations, 612 killed in ONE pass** — two halves of 306, each 306/306, with
  `Anchors: all live` ahead of both and the tree clean after both (v0.36.0,
  **38 suites** — `cards` and `cards-min` added; `layout`, `hero`,
  `hero-browser`, `restore`, `restore-browser`, `restore-min`,
  `layout-fields`, `layout-fields-browser`, `layout-fields-min` and
  `pagecache` across 0.35.x). **That is a single-run tally and may be said as
  one.**
  **0.36.0's targeted run of its own 36 was 33 killed + 3 SURVIVED, and all
  three were gaps in the TEST**, closed before the full run: the slow-answer
  case stopped waiting before the slow answer arrived, so a 60-second timeout
  passed it; the `avail` gate had no case where a stay EXISTS but is not
  bookable, which is the only state where the gate decides anything; and
  nothing asserted that the summary card's photo is the hero's own file.
  **That last one carried a second fault worth naming: the mutation listed a
  suite that could not see the assertion.** A mutation pointed at the wrong
  suite reports SURVIVED however good the test is — apparent coverage of a
  kind `--anchors` cannot catch, because the anchor is live and the claim is
  simply never evaluated. When a survivor makes no sense, check which suites
  it names before rewriting the code.
  At v0.35.3 it was 576 in two halves of 288.
  **AT 0.35.2 IT COULD NOT BE, and the distinction is the point** — a count in
  prose is a claim that goes stale silently, including this one. That run was
  over a 572-mutation set in halves of 286: 286 killed, then 278 killed +
  1 SURVIVED + 7 STALE. The survivor was retired (572 → 571) and the seven
  were re-anchored and killed on their own, so it was **564 killed in the
  halves plus 7 killed individually** — the whole of the then-571, but not 571
  in one pass. Its eight non-kills were all consequences of 0.35.x's own
  rewrites:
  - the seven STALE were anchored on lines 0.35.1/0.35.2 replaced — the photo
    chooser's fallback, the twin lookup (three), `hideDeadEnd`'s call and its
    wrapper branch, and the stored-stay completeness test. Re-anchored with
    their intent unchanged and re-run.
  - **`res-dead-end-selector-guessed` SURVIVED because 0.35.2's structural
    sweep made the pinned selector unreachable**, and that is a finding about
    the CODE, not the mutation. `withoutForm()` picks its host from a
    preference list with `.mphb_sc_checkout-wrapper` FIRST, so if a wrapper
    exists anywhere it IS the host and `hideDeadEnd`'s `if (wrapper)` branch
    runs; the `else` branch then queries
    `.mphb_sc_checkout-wrapper > .mphb-data-incorrect` on a document that has
    no wrapper, and can never match. The only thing it could ever have covered
    is a page with TWO wrappers, which is not proven to exist. The mutation is
    retired as an equivalent mutant. **The branch is unreachable code and
    should go** — `restore.js`'s own comment says "a guessed selector that
    matches nothing is not a fallback, it is a line that looks like one", and
    a pinned one that cannot match is the same line. It was NOT removed in
    0.35.2: the change is a strict no-op and the 0.35.2 zip was already handed
    over, so re-cutting an artifact with the same version and a different md5
    would have been the bigger hazard. Remove it in the next release that
    touches the file.
  Earlier: 396 mutations, 396 killed (v0.34.2, twenty-six suites —
  `upload-access`, `audit`, `minify` and `selectlist-min` added; run in two
  halves, as below). Its targeted run of the 22 new mutations was 21 killed
  + 1 SURVIVED: `ua-any-post-type`, masked because every "not a booking" case
  ALSO named a different booking, so the booking check refused it first — the
  real case, a row on a non-booking post with NO booking named, is now
  constructed. **The full run then found a second, more interesting
  survivor: `pet-present-active`, which had killed at 0.34.1 and stopped
  killing because of 0.34.2's OWN fix.** Every "a wrong pet service is
  refused" case in `tests/petpolicy` carried the dog's details, so once a
  filled dog field with no pet service became a violation in its own right,
  the mutant reached the same verdict by the other road and the assertion
  could no longer fail. The case that separates them — a wrong service with
  NO dog details — is now constructed in both modes. **A new rule can make
  an old test vacuous without touching it**, and only a full re-run says so;
  a targeted run of the new mutations would never have looked. At v0.34.1, 374
  mutations, 374 killed, 0 of everything else (with the
  dropdown list: twenty-two suites — `selectlist` added — run in TWO HALVES
  of 187 because one full run now outlasts the session's 2-hour background
  limit; 186 + 1 STALE, then 187. The STALE was `css-field-width`: the new
  button rule repeated its `width: 100% !important;` line, so the find
  matched twice; re-anchored with its intent unchanged and killed alone.
  The targeted select-list run found one SURVIVOR, `css-sl-error-ink`: an
  equivalent mutant, because the form's shared `[class*="error"]` rule sets the
  ink with !important, so the colour line it mutated never applied. The line was
  removed and the mutation retired. That run's FIRST pass was 37 HARNESS +
  1 STALE: the session's copy of the runner had no `selectlist` suite, and
  the real runner said so rather than passing them.
  Earlier in 0.34.1, before the list: 337 killed, in TWO runs: the
  full run hit the session's 2-hour limit at 290 killed + 1 STALE —
  `af-flow-word-dropped`, aimed at the `flow` line 0.34.1 rewrote,
  re-anchored with its intent unchanged — and the 47 it never reached, that
  one included, were run on their own; the baseline was green in all
  twenty-one suites. A run stopped mid-mutation LEAVES THAT FILE MUTATED —
  `class-dog-sizes.php` was, and was restored from git; check `git status`
  after any interrupted run. At v0.34.0, 316 in ONE run;
  its first full run was 313 + 3 STALE — `cfg-merge-direction-reversed`,
  `cfg-no-default-merge` and `js-pet-guess-bucket`, aimed at lines 0.34.0
  rewrote; re-anchored with their intent unchanged, each killed alone, then
  the whole set re-run; twenty-one suites — `petpolicy` and
  `recalc` added; 0.34.0's targeted run was 42 killed + 2 SURVIVED:
  `js-recalc-chosen-overwritten`, equivalent (a parameter is only rewritten
  when its own value is empty, so a chosen count never reaches that line) and
  retired, and `js-preflight-empty-preexisting`, a real gap — MotoPress's
  empty wrapper is also hidden, so the hidden check masked the empty one;
  an empty VISIBLE box is now constructed. At v0.33.1, 273 in ONE run;
  nineteen suites; 0.33.1's targeted run was 40 killed + 1 SURVIVED —
  `fs-cents-truncates`: no fixture total fell just below a whole cent, now
  constructed with $266.40. At v0.33.0, 254 in ONE run;
  nineteen suites — `fees` added). 0.33.0's targeted run was 22 killed + 2
  SURVIVED: the notice-escaping mutation (no notice the suite built contained
  a character escaping changes) and the extra-guest cottage-list check (on a
  2-sleeper the count cannot exceed 2, so the list never decided anything —
  the real case is a 4-sleeper the owner takes OFF the list in settings, now
  constructed). At v0.32.1, 230 in eighteen. 0.32.1's targeted run was 16 killed + 1 HARNESS:
  `ed-dog-answer-ignored` removed the box, and the browser suite CRASHED on
  `null.includes` instead of failing — fixed to fail, then the whole set run.
  Two anchors (`js-layout-not-idempotent`, `boat-admin-group-missing`) were
  re-anchored, intent unchanged, onto lines 0.32.1 rewrote. At v0.32.0, 215.
  0.32.0's first full run was 212 + 3 STALE: three
  mutations aimed at the pet-fee line and the boat layout group, which 0.32.0
  MOVED (to Extra_Details / extras_fields()); re-anchored with their intent
  unchanged, each killed alone, then the whole set re-run. At v0.31.0, 189; at v0.30.3, 175; at v0.30.2, 174; at v0.30.1, 173.
  0.31.0's first boat-only run was 10 killed + 2 SURVIVED + 1 HARNESS: the
  marker check and the creation claim each covered the other, so neither was
  isolated until a "no query after the run" test and a constructed race were
  added; the HARNESS was the suite missing a `wp_json_encode` stand-in. At v0.30.0, 156 in fourteen; at v0.29.0, 134 in twelve. 0.29.0's first full run was 134 + 1 SURVIVED: the
  search-step guard became an equivalent mutant (0.29.0 pet-fee entry) and was
  retired. Before that, at v0.28.0, it was 120. 0.28.0's first full run was 121 + 2 SURVIVED: both
  on the retired cottage-gating path above, which was dead code, so the code
  went and the two mutations with it. Its second was 120 + 1 SURVIVED:
  removing that code made `js-adults-includes-dcc` an equivalent mutant (see
  the 0.28.0 entry), so it was retired too, and the third run is the count. It read 50 here through three rounds that took it to
  75 — a count in prose is a claim that goes stale silently. 0.26.0's first full
  run was 88 + 4 STALE: four `g34-*` mutations aimed at the line the hook
  removal rewrote. Re-anchored with their intent unchanged, then re-run whole.
  A suite's outcome is read from what it PRINTED: `FAIL` lines kill, no
  PASS-or-FAIL line is `NO RUN`, a missing script is `NO SUITE`, and both of
  those become **HARNESS** — not red, and they fail the exit code. A mutated file
  is syntax-checked (`node --check` / `php -l`) before any suite runs; a file
  that does not parse is **INVALID**, which is what now catches the brace bug
  automatically. A **baseline preflight** runs every suite unmutated first and
  stops the run if one is not green, because after that every mutation looks
  killed — and it prints the suite files on disk beside the suites executed, so a
  suite that exists but was never wired up is visible.
  **STALE IS NOT A PASS** and is printed as loudly as SURVIVED: it means the
  find-string did not match, or matched a different number of times than
  declared, so the mutation never landed and proves nothing. Half the first
  run's apparent "gaps" were bad mutations, not gaps — a mutation aimed at a
  fallback branch the fixture never reaches (`setAttr(el,'type','button')` at
  checkout.js:2544 rather than the real `btn.type` at 2518), and two defeated by
  a second guard downstream (the FORM name-check is backed by the
  contains-breakdown check; `rowLabel()`'s injected-node skip is backed by the
  asterisk retirement pass). **Check the mutation before believing the verdict.**
  Two STALE results were themselves findings: "pattern found 2x" is how the
  four-copies-of-the-bucket-logic discovery below was made.
- **THE BUCKET LOGIC SHIPS IN FOUR COPIES, TWO LANGUAGES** (found 2026-09-19).
  `Config::service_id_for_nights()` ↔ `serviceForNights()` for the pet fee, and
  `Config::guest_service_id_for_nights()` ↔ `guestServiceForNights()` for the
  $50 extra-guest fee. Each pair carries its own "Mirrors … — keep the two in
  step" comment and **nothing enforced it.** `tests/pricing/` now does:
  `mirror.js` EXTRACTS both functions from the shipped `checkout.js` and runs
  them against a table PHP produced, so a copy is never made (a copy would be a
  fifth implementation to keep in step). A renamed function FAILS the extraction
  rather than skipping it — asserted. Thresholds are localized
  (`class-assets.php:303`), so the JS fallback `{2,7,30}` can only bite if
  localization fails, and it matches PHP's own fallback; checked, sound.
- **THE EXTRA-GUEST SERVICE IDS DEFAULT TO 0**, and that made the first draft of
  `tests/pricing/` eight green tautologies (0 == 0 at every night count) — the
  exact failure this file's rule names, committed by the sweep that was looking
  for it, and caught only because the mutation runner killed nothing. The suite
  now SEEDS distinct ids (901/902/903) so a wrong bucket is visible in the value.
  **The defaults are a test-harness trap, NOT the live configuration.** My sweep
  report claimed the extra-guest service IDs "sit at their shipped 0" — **that
  was never true of live**, at any point; all three buckets have pointed at 18063
  throughout. Corrected from live 2026-09-19. Measured in
  `dcc_checkout_settings`:
  - `guest_service_daily` / `weekly` / `monthly` are **all 18063**, and 18063 is
    "Extra Guest Fee (per guest beyond 2)", published, `mphb_price = 50`. **The
    fee attaches and does charge $50.** The stored settings override the shipped
    defaults, so the defaults never come into it.
  - `guest_accommodations` = `[1071,1069,1067,1065,1740,1742]` — the six
    capacity-4 cottages, as expected.
  - `guest_fee_amount` was **0.0 and is now 50** — changed on live 2026-09-19
    with the owner's approval, backup option
    `dcc_bak_checkout_settings_20260919`. **So `guest_fee_steps()` returns steps
    for the first time, `guestFeeAmountText` is "$50", and the two-line
    "$50/night / x N guests" detail built to the v0.19.0 spec renders for the
    first time.** It had never rendered before, which is worth knowing when
    reading any earlier screenshot.
  While the amount was 0 this was a gap and not a defect, because
  `guest_fee_steps()` returns `[]` when the amount is unknown — the guest was
  told **nothing** rather than "$0.00", which is the right direction to fail.
  The `$expected`-is-0 consequence no longer arises for the amount, but the
  shape is worth keeping in mind: `Extra_Guest_Service`'s backstop *fails open*
  when `$expected` is 0 (`$can_expect = $nights > 0 && $expected > 0`), so a
  configuration that stopped resolving a service would go unnoticed rather than
  blocking a booking.
- **"NEVER REDIRECT DURING AN AJAX SUBMISSION" IS TESTED NOW, IN ALL FOUR FILES
  THAT CLAIM IT** (`tests/backstops/`, added 2026-09-19). The sentence appears
  in `class-pet-service.php:54`, `class-guest-fields.php:35`,
  `class-extra-guest-service.php:43` and `class-checkout-request.php:307`; a 302
  mid-AJAX loses the guest's booking with no message, and **nothing tested any
  of them.** They are separate code paths, not shared, so one test would have
  left three sentences unbacked. `wp_safe_redirect` is shimmed to throw, which
  makes the attempt observable and survives `exit`, so the assertions really
  distinguish "redirected" from "stood down". The REST stand-down
  (`defer_to_rest()`) had no test at all and now covers all three URL forms —
  plus the inverse, that an ordinary checkout URL is NOT mistaken for the REST
  route, because over-matching would silently disable every backstop.
  **Every stand-down suite needs its guard-on-the-guards**: the assertion that
  the payload really is a violation. Without it, "no redirect" passes because
  nothing was ever going to redirect — and `php-violation-detector-dead` in the
  mutation set is what keeps that honest.
- **`--dcc-required` IS DEAD FOR `.dcc_checkout-req`** (found 2026-09-19; no
  behaviour change, so deliberately not "fixed"). Two `!important` rules at the
  same (0,2,0) specificity both match it — `checkout.css:609` via
  `var(--dcc-required)` and `:639` via `var(--dcc-error)` — and the later one
  wins on source order. Measured: setting `--dcc-required` to `#c62828` leaves
  the marker at `rgb(188,0,62)`. The outcome is right today because both tokens
  resolve to the same literal, but **the token indirection does nothing for
  this element**, and a future editor changing `:609` would move MotoPress's own
  `.required` markers and not the plugin's. `tests/fields/` now measures an
  `abbr.required` too, which is the only element `--dcc-required` really paints,
  so the "one ink cannot drift" claim is under test at last.
- **A FIXTURE THAT CARRIES ONLY THE FALLBACK SELECTOR TESTS THE FALLBACK.**
  Every field wrapper in `tests/fields/fields.html` carried MotoPress's
  `p.mphb-text-control` — the no-JS fallback — and none carried
  `.dcc_checkout-field-row`, the class `markFieldRows()` actually applies on the
  live page. So the selector the live site depends on had no test, and a rename
  on either side would be masked by the fallback until MotoPress changed its own
  class, at which point nothing would hold the cap. The fixture now carries a
  wrapper with the JS class and NOT the fallback.
- **THE JSDOM `visible()` PROXY IS NOW PINNED IN A REAL BROWSER.**
  `tests/breakdown/` has no layout, so it reads hide-class NAMES as a stand-in
  for `display:none`. Nothing checked the stand-in was true: rename a class on
  either side and the jsdom suite would go on reporting things hidden that a
  guest can see. `tests/fields/` now asserts all three compute to `display:none`.
  The helper was also missing `dcc_checkout-option-hidden` — the third class the
  code emits — so a hidden `<option>` would have been reported VISIBLE.
- **`setDisabled()`'s money guard is tested directly now**, because the outcome
  assertion could not fail: `setDisabled()` has exactly ONE caller
  (`checkout.js:1489`, the dog fields) and it never passes a service control, so
  "the SERVICE checkbox is never disabled" held with the guard deleted. Measured:
  `return false` in `isMoneyControl()` left the suite green. Both functions are
  extracted from the shipped file and driven directly — including that a money
  control can still be RE-ENABLED, since a guard that trapped one in `disabled`
  would stop the fee submitting, which is the thing it exists to prevent.
- **THE TWO FEES ARE NOT THE SAME SHAPE, AND THAT IS WHY BUCKET EXCLUSIVITY IS
  LATENT** (measured from live, 2026-09-19). The PET fee uses **three DISTINCT
  services** — `service_daily` 17712 / `weekly` 17711 / `monthly` 14926 —
  because the rate genuinely varies by length of stay (the owner confirmed it
  does on Cottage 34). The EXTRA-GUEST fee points all three buckets at the
  single service 18063. So a pet bucket bug is observable in the ID and an
  extra-guest one is invisible by construction.
  **Do NOT "fix" the extra-guest buckets to match the pet pattern.** A flat $50
  regardless of stay length may be exactly what the owner wants; he is being
  asked, and until he answers the single-service config is to be treated as
  deliberate. `tests/pricing/` is correspondingly stronger for the pet fee than
  for the extra-guest fee, and the seeded 901/902/903 ids exist so the
  extra-guest boundaries are testable at all.
- **Known gaps, named rather than papered over** (2026-09-19). Each is a
  behavioural guarantee in a comment with no test that constructs its condition:
  `checkout.js` — "at most ONE bucket checked per room" (:1510, money; latent
  because all three extra-guest buckets are the same service, per the entry
  above, so a double-charge cannot currently arise); "a re-render can never stack suffixes"
  (:1637); "idempotent per (select, kind) so re-asserts never stack duplicates"
  (:2042); "a height-only resize can never change the answer" (:1867, and that
  one is mobile-behaviour-adjacent, so it matters more than it looks).
  **Closed 2026-09-27:** "we only DISABLE existing options — never inject any"
  (`capAdultsSelects()`) is now constructed in `tests/breakdown/` — option count
  pinned, mutation `js-feeoff-cap-injects`. `class-settings.php` is no longer
  suite-less: `tests/settings/` covers the sanitiser and the guest preview; the
  rest of the page's rendering is still untested.
  Whole files with no suite at all: `class-assets.php` (418), `tap-debug.js`
  (450). (`admin-booking.js` and `class-admin-fields.php` gained
  `tests/admin-layout/` in 0.26.0 — the layout and, through it, the gating's
  hide/show per cottage and sticky values; 0.28.0 added the guest-count and
  pet gating, and the Extra Guest Fee slaving in `syncExtraGuestFee()` —
  tick, multiplier, fee line — is now tested against a stand-in breakdown.) The fail-open family — `class-config.php:493-495`
  ("callers MUST treat null as unknown and fail open"),
  `class-admin-fields.php:30-31`, `admin-booking.js:302/357` — is untested
  everywhere it is claimed.
- Pet-fee and extra-guest bucket selection, in PHP and in the JS mirror, are at
  `tests/pricing/` (`php tests/pricing/run.php`; it shells to node for the
  mirror and FAILS rather than skipping if node is absent).
- The server-side backstops' stand-down rules are at `tests/backstops/`
  (`php tests/backstops/run.php`).
- The Guest 3/4 switch is at `tests/guest34/` (`php tests/guest34/run.php`). It
  **posts the fee with the switch off and requires a refusal** — the never-claim
  needs the case constructed, and a test that only checked the field was absent
  from the rendered form would be the happy path. Mutations run in **both
  directions**: "off does nothing" and "on does nothing" are different bugs and
  one assertion catches neither.
- Field geometry (tap targets) is asserted in real Chromium at 390x844 with
  touch emulation, and the width cap at 1280, at `tests/fields/`
  (`npm install && npm test`). Run it after touching any field rule.
- The tax footnote's width behaviour is asserted at `tests/footnote/`
  (`npm install && npm test`).
- Price-breakdown and services behaviour are covered by jsdom fixtures at `tests/breakdown/`
  (`npm install && npm test` there). Run them after touching
  `restructureBreakdown()` or anything else that moves a figure on the
  checkout — that code decides what a guest is told they owe.
- **THE DOCUMENTED "UPGRADE DEFAULTS DON'T MERGE" TRAP DOES NOT APPLY TO THIS
  PLUGIN** (established 2026-09-24, not assumed). The trap — a new version's
  defaults not reaching an already-stored option row, so new features look
  switched off — is real elsewhere (Seasons 4.0.0 hit it). Here
  `Config::settings()` is `array_merge(self::defaults(), $saved)` **at READ
  time, on every call**, so a row stored by any older version picks new keys up
  immediately. `tests/settings/` constructs a pre-0.25.0 row containing none of
  the new keys and asserts they read as defaults; a mutation reversing the merge
  direction, and another removing it, both go red. **Direction matters**: saved
  values must win over defaults, including a stored `0`, or every read would
  silently undo the owner's settings.
- **THE ADVANCED SETTINGS ARE CLAMPED, AND ONE CEILING IS NOT CONFIGURABLE**
  (v0.25.0). Four literals became settings — `included_guests` (2),
  `guest_fee_steps_max` (8), `admin_guest_fallback` (8), `admin_guest_max` (20)
  — each defaulting to the value the code already used, asserted BY VALUE
  because a silent behaviour change on a checkout is a lost booking.
  `Admin_Guests` clamps `admin_guest_max` with its own `MAX_OPTIONS` constant
  (`min(setting, 20)`), so **a setting can only ever shrink that range**: it
  drives an `<option>` loop partly fed from `mphb_adults_capacity`. Bad input on
  any of the four falls back to its DEFAULT, never to 0 and never to the posted
  value. A mutation removing the clamp SURVIVED at first — the guarantee was
  only exercised at the default setting, where it makes no difference — so the
  suite now seeds the setting ABOVE the ceiling, which is the only way the clamp
  is observable.
- **`included_guests` FLOORS AT 1; ZERO IS A BOOKING OUTAGE, NOT A
  CONFIGURATION** (v0.25.1, found by self-audit of v0.25.0 before it was
  installed). v0.25.0 exposed the value and its sanitiser accepted 0 as
  "coherent" — with a test asserting exactly that. It is not: at 0,
  `Extra_Guest_Service`'s inactive branch refuses every room with
  `adults > included` (every booking, while the Guest 3/4 switch is off), and
  the non-guest-accommodation cap refuses every booking on Cottages 33/34
  regardless; `checkout.js` meanwhile treats 0 as "unset" and uses 2, so PHP
  and JS would disagree about who is charged. The floor is in BOTH the
  sanitiser and `Config::included_guests()` (`max(1, …)`), because a filter
  bypasses the sanitiser. `tests/guest34/` constructs the outage — drives the
  accessor to 0 through its filter and asserts a one-guest booking still passes
  on both paths. **The wrong test was the tell**: it encoded the belief rather
  than the condition, and the rule at the top of this list would have caught it
  if it had been run against the new code before shipping. Run it against your
  own additions, not only the existing ones.
  **The couch note is gated on `included_guests === 2`**
  (`Config::offered_couch_note()`, which `Assets` reads). `couch_note_text()`
  is a hash-pinned literal that says "Guests 1-2 are included" and cannot
  follow the setting; now that the setting is on the admin page, any other value
  would put a falsehood in front of a paying guest. Empty means the JS renders
  nothing (it already tests `!I18N.couchNote`). The hash pin stays on the
  literal; the gate is a separate method precisely so it can be tested.
  **Render check, done properly**: 26 default keys, 23 rendered by a `*_row(`
  call, 2 (`pet_accommodations`, `guest_accommodations`) rendered as dynamically
  named checkbox sets, 1 (`min_daily`) **deliberately dormant** since 0.3.5 —
  "no longer consulted", so exposing it would mislead. The "22 of 23" in the
  v0.25.0 report came from a single-line regex that could not see multi-line
  `*_row(__(...), 'key'` calls; it was wrong in both numbers.
- **A SETTING MUST REACH ITS CONSUMER — STANDING RULE ACROSS ALL DCC PLUGINS**
  (named by the owner's courier 2026-09-26, after three other plugins were
  found the same week with settings nothing reads). A knob that is registered,
  rendered, sanitised and stored, but never read on the path that matters, is
  worse than no knob: it looks wired up. Two instances caught in this plugin
  before shipping, both by following the call chain rather than the diff:
  `offered_guest_fee_steps()` hardcoding `8` (the CHECKOUT path) while
  `guest_fee_steps()` honoured the setting, and the `admin_guest_max` clamp
  that only made a difference at a value the default never reached. **The
  check, for every new setting:** name each reader, confirm the value on the
  guest-facing path is the one the setting produced, and add a mutation that
  makes the setting inert — it must go red. Mutations
  `cfg-offered-ignores-setting` and `ag-ceiling-raisable` are the two pins.
  **v0.25.2 is installed and verified on live (2026-09-27)** — version, checkout
  loads, no console errors; a booking cannot be placed to test further. Both
  fixes accepted.
  **v0.25.1 is installed and accepted on live (2026-09-26)**: the floor of 1
  in both the sanitiser and `Config::included_guests()`, and the couch-note
  gate. Keep `min_daily` unexposed. First-tap behaviour on the owner's iPhone
  remains his to verify, not this repo's.
- **TWO KNOBS WERE DELIBERATELY NOT EXPOSED**, against a general "expose
  everything tunable" instruction (v0.25.0, stated in the report rather than
  silently omitted):
  - **The tap-handling timings** in `checkout.js` (500ms debounce, 400ms touch
    settle, 450ms schedule). These ARE the v0.18.0 three-tap fix. Exposing them
    would mean editing that path and handing an admin screen the ability to
    reintroduce a bug that took six diagnostic rounds to close.
  - **User-facing strings** beyond the section titles already exposed. They are
    translatable and LocoTranslate is hand-tuned here; turning a translated
    string into a setting takes it out of the translation layer.
- **`Config::offered_guest_fee_steps()` MUST NOT HARDCODE THE LADDER LENGTH.**
  It is the CHECKOUT path. Its `$max_extra` default is `null`, meaning "use the
  setting"; leaving it at `8` made `guest_fee_steps_max` inert exactly where it
  matters while looking wired up. Mutation `cfg-offered-ignores-setting` pins it.
- **Bravada's button-font trap is verified for the BARE controls too**
  (2026-09-24). The theme sets Pavanam on `<button>` at (0,0,1) while the site
  face is Raleway. `tests/button/` already reproduced that and asserted the
  submit button beats it — but the breakdown expander and the tax asterisk carry
  no font of their own and rely on `font: inherit` in the bare-control reset, and
  no fixture reproduced the trap for them. `tests/fields/` now sets Pavanam on
  `button` and asserts both bare controls compute the inherited face; a mutation
  weakening the reset to `font-size: inherit` goes red. The
  `html{font-weight:700}` trap was already covered by the upload-hint assertions.
- Bump the version in all three places whenever behaviour changes:
  the `Version:` header, `DCC_CHECKOUT_VERSION`, and readme `Stable tag`.
- **And rebuild the guest assets after touching any of them** (v0.34.2):
  `php dcc-custom-checkout/tools/build-assets.php`. The built `.min.` files are
  COMMITTED — WordPress installs a plugin folder, it does not build one — and
  `tests/minify/` goes red when they disagree with the sources.
