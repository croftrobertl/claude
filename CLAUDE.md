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

The Availability Calendar has no automated tests — runtime behavior can only be verified by installing the zip on a staging WordPress site. (DCC Seasons has a suite under `tools/`; see its section.) See `readme.txt` and the plan in `/root/.claude/plans/` for the manual smoke-test checklist.

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

## Verify the checkout against the REMOTE, every session

**Before the first commit of EVERY session**, run a live query — not a look at
a local ref:

```bash
git ls-remote origin refs/heads/claude/dcc-seasons-plugin-2tqkxt
git rev-parse HEAD
```

and confirm HEAD descends from what `ls-remote` returns. A container that was
clean yesterday proves nothing about the one you are in now: four of eight
checkouts came back wrong on 2026-09-19/20.

**Why `git status` cannot catch this.** `refs/remotes/origin/*` is a local
cache. Containers are being provisioned carrying *another* plugin's workspace —
`f25db77`, the tip of `claude/review-shared-chat-bExtl` (Availability
Calendar), turns up as local HEAD in unrelated plugins — and a branch named for
the incoming session is created at that HEAD with
`refs/remotes/origin/<branch>` written **without ever contacting the server**.
`git status` then compares HEAD against a cache that agrees with it and reports
a clean, up-to-date branch. Nothing is wrong on the server: this is one repo
with a branch per plugin, every plugin's history intact on its own branch, and
no collision between them.

### Recovery, if the live `ls-remote` disagrees with local HEAD

First establish that nothing local is worth keeping — **verify it, do not
assume it**:

```bash
git status --porcelain                                       # must be empty
git rev-list --count --branches --not <sha-from-ls-remote>   # local-only commits
```

Use `--branches` (i.e. `refs/heads/*`), **not `--all`**. `--all` includes
`refs/remotes/*`, so it counts commits that are on the server by definition and
reports a large number that means nothing. In every case seen so far the local
commits belong to another plugin and are already safe on that plugin's own
remote branch, so discarding them locally loses nothing — but confirm each one
is reachable from some branch in the live `ls-remote` output before you do.

Then, and only then:

```bash
git fetch origin <branch>
git merge --ff-only origin/<branch>    # when merely behind (nothing local-only)
git reset --hard origin/<branch>       # when local has junk commits to drop
```

Both are local-only and touch nothing on the server. `--ff-only` cannot discard
anything — if it could, it refuses — so a "destructive" warning on it is a
false positive worth stating plainly when asking for approval.

### Never force-push these branches

The conclusion stands. **The mechanism is the opposite of what it looks like**,
and the reasoning first given for this rule had it backwards — tested in a
throwaway repo on 2026-09-20 with the tracking ref poisoned exactly as these
containers poison it:

| state | command | result |
|---|---|---|
| poisoned tracking ref | `git push` | rejected (non-fast-forward) — remote unchanged |
| poisoned tracking ref | `git push --force-with-lease` | **rejected (stale info)** — remote unchanged |
| **after `git fetch`** | `git push --force-with-lease` | **forced update — history replaced** |

So the lease *does* protect you while the cache is stale. What removes the
protection is the fetch — the very thing the repair above requires. **The
dangerous sequence is "fetch, then force", and it is the sequence a careful
person reaches for.**

After a repair you are in exactly that state. The next push must be an ordinary
fast-forward push. **If it is rejected, STOP AND REPORT IT.** Do not force, do
not `--force-with-lease`, do not "reconcile" — a rejection after a repair means
something is still wrong, and the repair is not yours to improvise.

A rule carrying a wrong mechanism is the thing this section exists to prevent.
Reproducing a claim because the person who gave it to you is the one who gave
it to you is not verification: test it, or say plainly that you have not.

## Delivering DCC Seasons files

Two naming rules, and they differ — the plugin zip is the exception:

- **Plugin zips: `Seasons <version>.zip`**, no dash. e.g. `Seasons 3.18.1.zip`.
- **Everything else: prefix `Seasons - `.** Images, markdown, JS, logs,
  anything. e.g. `Seasons - footer 1280.png`, `Seasons - schedule cards 374.png`.

(Set 2026-09-13 by the owner, correcting a same-day instruction that had put
the dash on the zips too. Deliveries earlier in the history carry whichever
name was current then. Restated 2026-10-20 with the REASON, which is what
makes it non-negotiable: Rob hands several plugins' files to the
'DCC - Admin' session at once, and the prefix is how that session tells
which file belongs to which plugin. A file delivered without it is not
merely untidy — it is ambiguous to the session that receives it. The zips
stay the exception because WordPress shows that name in the plugins list.)

**Attach every new version in the chat** (Rob, 2026-10-10: "Always give me
the new versions in this chat so that I can save them in Google Drive").
Every release's `Seasons <version>.zip`, and its checklist, goes to him as
a file in the conversation — not just a path in `build/` — with a one-line
caption saying whether it is ready to install.

Build the zip from the `dcc-seasons/` folder as usual — the folder INSIDE the
zip keeps its own name, which is what WordPress installs; only the delivered
filename changes.

The repo keeps one tracked build artifact at `dcc-seasons.zip` so a version-named
copy isn't accumulated per release; rebuild it in the same commit as the version
bump so the tracked zip never lags the source.

## DCC Seasons — the standard (PROJECT-NOTES.md)

**Read `PROJECT-NOTES.md` before drawing anything that moves.** Rob made
the 4.9.0 heron the gold standard for every sprite, scene and hero
(2026-10-12): drawn in code with real anatomy, a many-frame cycle
pre-drawn at load, a measured cost no higher than what it replaces,
believable physics, and frame strips plus a video for Rob before it ships.

## DCC Seasons — Rob designs it by choosing, never by default

Every design decision in DCC Seasons is Rob's, made by multiple choice from
rendered options. Recorded 2026-09-28 at his instruction.

- **Any design choice not already decided — stop, render the options, ask.**
  Which sprite, which colour, which effect, which layer, how many on screen,
  which story a scene tells: render 2–3 options (390px phone, his live
  settings, guest view + close-up — the sheet format of the 4.1.3 snow
  proposal) and send them. Do not pick one and ship it, and do not ship a
  "sensible default" to be corrected later. Pure engineering choices (code
  structure, tests, tooling) stay with the developer.
- **His picks live in the plugin's CODE DEFAULTS, never in stored settings.**
  `Themes::themes()`, `Themes::subtle_defaults()` and the engine's
  `SUBTLE_FALLBACK` carry them, kept in step. Live stores `subtle_map = []`,
  so defaults reach guests. Never write a pick into his options row, and never
  rewrite his stored schedule or settings to deliver one — calendar behaviour
  goes in the RESOLVER (`Schedule::active()` and `activeRow()` in ambient.js,
  changed identically), not in edited default rows.
- **His stored density (16) is his.** Scaling for phones happens in the
  engine; the setting is never changed.

### Rob's recorded picks (for 4.2.0, chosen 2026-09-27/28)

Each was picked by Rob from rendered options. Do not revisit one without a new
render round and his say.

- **No snow anywhere.** Christmas keeps bokeh and gets the lit sabal palm
  (weight 1, cap 9); Snowbird → warm winter-sun bokeh; MLK → gold & white
  light; Mardi Gras → purple/green/gold confetti; Presidents → orange blossom.
  Each colour variant is its own named choice in the dropdown. The Christmas
  Matrix egg swaps '❄' for H and O ("HO HO HO").
- **4/20:** the picnic basket goes; the hippie van (no badge) takes its
  "grows up and stands" role.
- **Christmas AFTER:** palm lights string by string, ornaments and holly on
  longer threads lower down the page, the gift drop lands on the water line
  with a ripple. On a phone (`mobile`, width < 768) Christmas shows AT LEAST 5
  sprites, and never fewer than 4 while a scene has borrowed one — this floor
  overrides the scaled cap for Christmas only.
- **Scenes on a phone, all themes:** a scene borrows AT MOST 1 sprite from the
  running set, so no scene empties the screen. Desktop keeps today's borrowing.
- **Heroes:** eagle = two-frame wingbeat (July 4 and Patriot Day only; Memorial
  and Veterans Day get the heron); witch = silhouette with her cat on the broom
  tail; bass = the new largemouth drawn mid-leap. The unused `ducks` hero is
  removed.
- **No hero draws an emoji — with ONE exception Rob chose explicitly: the St.
  Patrick's rainbow keeps the ☘ character in its clover strip.** Do not
  "fix" it to the clover sprite; that option was rendered and declined.
- **Summer on the Canal scenes:** all three — gator glide, flamingo pool float
  with the flip-flop, mullet skip — rotating at the usual cadence.
- **Florida Keys:** keeps its Keys feel (sun, palms, hibiscus, colours, name)
  but its animals and plants are CENTRAL Florida, never sea life. Snowbird's
  flamingo V and arrival scene, and Summer's inflatable flamingo, are NOT
  affected by the Keys swaps. Picked 2026-09-29:
  - Scenes, all five on the normal cadence, rotating like Spring on the
    Canal's three: KA anhinga drying its wings on a snag, KB osprey catch,
    KC sandhill crane pair dance, KD limpkin and the apple snail, K3 hibiscus
    bloom (drops, floats, a fish nibbles). The pelican dive and sea turtle
    were declined.
  - Hero: the osprey carrying a fish, two-frame wingbeat — replaces the
    brown pelican.
  - Boat: the aluminium jon boat with a small outboard — replaces the flats
    skiff.
  - Bird: the white ibis — replaces the flamingo. The roseate spoonbill was
    declined: not a Lake County bird (Rob cut it from the Wildlife guide on
    that basis). Do not offer it again.
  - The osprey hero AND the osprey scene (and their fish) are both kept, with
    the clash list in front of Rob. Do not flag it again: a scene never runs
    while a hero crosses, so the osprey is never on screen twice at once.
  - The Keys sun is a corner accent only — never a sprite, never two on
    screen.
### Rob's recorded picks (for 4.3.0, chosen 2026-10-01)

- **`sunshades` comes off Florida Keys and Summer on the Canal** (a second
  sun). Not replaced. Snowbird keeps it as its corner ACCENT.
- **Earth Day, option A:** the hands accent and the globe take 45 s turns
  of visible time, hands first, crossfading over 1.5 s, never both — the
  engine's `stepTurns()` for any `xa` sprite. (B, swap on each heron, and
  C, page by page, were declined.)
- **Scenes:** W-A witchmoon = the hero's `witchsil` (72px) over the
  unchanged drawn moon; F-A arrival = `flamup`/`flamdown` wingbeat (60px)
  landing as Snowbird's `flamingo` (24px); D-A duckparade = `duckhen`
  (40px) + four `duckling` (17px), mottled duck, facing travel. W-B colour
  witch, F-B glide/one-leg and D-B storybook ducks were declined.

### Rob's recorded picks (for 4.7.0, chosen 2026-10-10)

- **The egg opens from the homepage banner title, 4 taps.** Defaults
  `tap_selector` = `.home #header-page-title .entry-title` (exactly one
  element on the homepage) and `tap_count` = 4. Both are
  `Settings::TRACKED_DEFAULTS`: stored only when they differ, cleared on
  upgrade when they equal the default.
- **The egg is HOMEPAGE ONLY** (Rob chose "Homepage banner title" over
  "Banner title, every page"). 4.7.1 removed the `#masthead` fallback: a
  page without the configured target has no egg. Do not reintroduce a
  fallback tier.

### Rob's recorded picks (for 4.8.0, chosen 2026-10-11)

- **The witch over the moon flies edge to edge** (`witchmoon`): the moon
  fades in, she enters off one side, dips, makes ONE loop around the moon
  while it glows, leaves off the far side, then the moon fades. Kept: the
  `witchsil` sprite (72px) and the drawn moon. The pass is a polyline
  walked by arc length (`witchPath`/`witchAt`); loop radius
  clamp(vw*0.2, 80, 100) clears the moon's halo plus half the witch, and
  the moon is placed so the loop stays on screen from 320px up. 8.0 s at
  390, 9.0 s at 1280. How she rides the loop: see 4.9.0 (upright).
  (The loop is gone since 4.10.2: see "one swoop, no loop" below.)
- **Timing (all themes):** ONE appearance every 60-90 s counted from the
  end of the last, hero and scene alternating (a theme with only one kind
  repeats it). `Plugin::EVERY` = [60, 90] replaced HERO_EVERY; nothing
  stored overrides it. The OPENING order was changed by Rob in 4.9.0.
- **The heron (Great Blue, drawn in code)**: three candidate styles were
  rendered from `tools/heron-lab.js` (A field guide, B painted, C
  silhouette+). Rob picked A in 4.9.0.

### Rob's recorded picks (for 4.9.0, chosen 2026-10-11)

- **Heron: style A · Field guide**, in the engine (`hnFly`/`hnStand`/
  `hnLegs`, the HN_ block above `start()`). It is PRE-DRAWN after load in
  idle time (`hnCache`: 24 beat poses, 6 glide blends, the flare, the
  standing bird; each on its own tight canvas at min(DPR, 2)) so a
  crossing is one drawImage a frame; the legs alone are drawn live so
  they can swing down. Pose keys are computed (`'b' + n`), so a literal
  key in engine.js reads as a dangling sprite to `validate-paths.js` —
  keep them computed. The landing is glide in (legs lowering), flare,
  stand 2.5 s, take off on hard beats with legs hanging; crossfades
  flying <-> standing. Debug knob `heronLand` (0/1) forces it. The
  heron0/1/2/heronstand sprites are gone; the Theme guide paints the bird
  with `ART_DRAW.heron` (was HERO_DRAW; renamed in 4.10.0 when the witch
  scene got `ART_DRAW.witch`). `tools/heron-poses.js` renders the shipped
  poses; `tools/measure-heron.js` measures a crossing against an older
  build (`DCC_ASSETS=`).
- **Witch: B · Upright in the loop.** She stays seated, tilts with the
  climb (clamped to ±0.35 rad) and turns round to face the way she flies.
  Banking (A) was rendered and declined; `WITCH_LOOP` is gone. (4.10.2
  removed the loop: she still rides upright, and since she now flies one
  way across she never turns round, so the turn-round squeeze is gone.)
- **Timing: SCENE FIRST, FLYER SECOND.** Every page opens with the
  season's scene at 6-10 s. On a visit's first page the hero follows 2 s
  (`TIMING.breath`) after that scene ends, never on top of it
  (`heroAfterScene`). Later pages: unchanged, the scene at 6-10 s then
  turns. A theme with no scene (or none at this hour) sends its hero at
  6-10 s on any page. Evening-only scenes keep their condition. Because
  the first-page hero now waits for a scene, a suite that pushes scenes
  away (`vigFirst = 1e9`) and still wants a hero must set `heroFirst`.

### Rob's recorded picks (for 4.10.0, chosen 2026-10-12)

- **Witch flight: "Swoop + banked loop".** `witchmoon` comes in high,
  DIVES across the moon's face (the one moment she is silhouetted against
  it), pulls out underneath, makes ONE wide loop round the moon and climbs
  off the far edge. Her speed follows height (v² = vB² − 2g·climb: 45% of
  the bottom speed over the top, never below 42% on the climb out), and
  the whole flight is scaled to `st.T`. She stays UPRIGHT (the 4.9.0
  pick): she leans along the felt gravity (path acceleration + g), the
  total tilt clamped to ±0.6 rad, and turns round through a quick squeeze
  (never thinner than 30%) instead of flipping. The dive is monotone in x
  so she never turns round in it. Sizes and the path were reworked in
  4.10.1 (one size factor, tangent joins) — see below. **The loop and the
  turn-round were removed in 4.10.2** (Rob: one swoop, no loop); her
  drawing, upright riding and the moon stand.
- **Her drawing:** hat with a purple band and buckle, long dark hair,
  profile, bodice and bell sleeve, a skirt that flutters, purple-and-black
  stockings, pointed boots, an ash broom with a twine collar and 16
  separate straw bristles, and the black cat (his 4.2.0 pick) on the
  handle with a purple rim. `witchBody(g, phase)` is ONE phase; 12 are
  pre-drawn. The cape (a two-chain strip with diagonals so it stays a
  sheet) and three hair strands are Verlet chains under gravity and drag,
  drawn live OVER her back (under it they were invisible). (The cape and
  the silhouette were reworked in 4.10.1 — see below; a scratch canvas
  every frame cost ~45% more, so it is used only while she is dark.)
- **The moon: "Real full moon, clear sky".** `moonPaint(g, r)`: the
  maria from their real selenographic centres and sizes (`MARIA`),
  projected orthographically north up with east to the right, painted on
  a small canvas and scaled up for soft edges (no `ctx.filter`: Safari),
  Tycho/Copernicus/Kepler/Proclus rays, Aristarchus bright, Plato and
  Grimaldi dark, fine highland speckle (never dots), gentle limb shading,
  a faint glow to 1.3 r. No clouds. Pre-rendered once per radius
  (`moonGet`, r = 41k since 4.10.1) and drawn on WHOLE device
  pixels — at a fractional position the browser resamples every pixel,
  every frame (measured: ~85 ms/s on the slowed phone).
- **Christmas's evening `sleighmoon` keeps the old `moonDraw`** — the
  brief kept every other theme exactly as 4.9.0. The Halloween HERO witch
  (`witchsil`) is also unchanged.
- **Cost (PROJECT-NOTES.md):** about 10% MORE than 4.9.0's witch, over
  the heron's "no more" bar and reported as such: phone (390, 3x, 4x CPU)
  mean 474 vs 429 ms/s over four alternating 5-run sets (single sets
  ranged 387-555 vs 351-526 with machine load), desktop 72 vs 64, 60 fps
  all. The extra is the live cape/hair and the silhouette pass. Pre-draw
  ~48 ms, 1.3 MB on a phone.

### Rob's review of 4.10.0 on staging (for 4.10.1, 2026-10-12)

"It looks great." The moon and her riding cycle are approved. Fixed:

- **Behind the header text.** In front layering the scene cuts the
  header's letters out of what it drew (`hdrBuild`/`hdrCut`): every
  visible character inside `CFG.headerSel` (Plugin::config,
  filter `dcc_seasons_header_text`, default `#masthead, header.site-header,
  header[role="banner"], .elementor-location-header`), measured with a
  Range per character, drawn in its computed font and text-shadow on a
  mask built on WHOLE device pixels and erased 1:1 with
  'destination-out' — the page's own letters show through, the header
  picture stays covered. A mask stretched by a fraction of a pixel blurred
  serif hairlines and the moon showed through them. Range rects include
  letter-spacing on the right: take it off before centring the glyph.
  Behind layering and footer placement cut nothing. No second canvas.
- **The path, as 4.10.1 shipped it (replaced in 4.10.2, below)**: a
  level glide in, the dive across the
  moon's centre, a pull-out that is ONE continuous turn joining the loop
  tangentially at −15° (above level, right side, heading up), a 335° loop
  leaving at +10°, and a climb that levels out at the top. A curve that
  starts at a circle's centre meets it tangentially only by bending ~180°:
  joining lower (70°, 10°) gave S-bends of 0.9 and 0.4 rad in one frame.
  Every handle that could lift the path above the hat line is clamped.
  `tools/test-scenes.js` asserts: heading ≤ 0.3 rad and speed ≤ 12% per
  1/30 s frame, tilt ≤ 2.2 rad/s, no turn-round or squeeze in the dive,
  hat on screen.
- **One size factor** `k = clamp(vw/390, 0.82, 1.3)`: moon 41k, witch 84k,
  path scale R = MR + 0.6W + 6 (4.10.1's loop radius, kept in 4.10.2 so
  the glide and dive are unchanged), so desktop is the phone's picture
  made bigger. Speed is 3.3 R/s one R below the moon's centre; far from
  the moon a cruise floor rises smoothly (2–5.5 R since 4.10.2; 2–4.5 R
  slowed by up to 7.2% a frame on desktop) so long desktop glides do not
  crawl.
- **The cape is cloth**: a fan of four Verlet strands pinned across the
  shoulders, SOFT spacing that widens to the hem (no diagonals — they made
  it a rigid board), a travelling flutter, a drape spring toward hanging
  down her back (firm at the shoulders, loose at the hem) and a loose cap
  at hat height. A hard limit at the shoulder line pressed it into a
  straight bar in the dive. Drawn as shaded panels between strands with
  curved folds and a scalloped hem showing the lining.
- **Silhouette**: while ANY of her painted pixels (`wcPts`, sampled once
  from frame 0 — her body box has empty corners that reached the moon from
  beside it) or cape/hair point overlaps the moon, her WHOLE figure fades to
  black over 150 ms: the same picture on a scratch canvas, 'source-in'
  black, on whole device pixels, so the outline is exact.
- **Her tilt never snaps**: at most 2.2 rad/s; acceleration smoothed 0.18 s.
- **The moon is fully opaque once up**: at 96% a spider's thread showed
  through it.
- **Cost** (Rob kept the cape and hair at full rate): about 10% more than
  4.9.0's witch, as in 4.10.0 — measured on a container about twice as
  slow as before, so use only same-machine pairs: phone 2× CPU 621 vs 566
  ms/s, desktop 218 vs 196, 60 fps; at 4× both saturate (47–48 vs 51–52
  fps). Saturation hides cost in ms/s: if both builds read the same busy
  time, drop the throttle until neither is pinned.

### Rob's pick on staging (for 4.10.2, 2026-10-13): one swoop, no loop

Rob approved the title in front and the moon arrival; "The turn-round at
the beginning and end of the loop bother me." From three options that
avoid any turn-round he picked **"One swoop, no loop"**:

- **The path** (`witchPath`): 4.10.1's level glide in and dive across the
  moon's centre, unchanged (`st.cross` marks the centre), then ONE cubic
  swoop out: handle 1.0 R on the dive heading, pulling out about R/3
  below the centre, climbing to R/10 above it and arriving LEVEL at the
  far edge (`E = [vw, …]`, handle 0.3 of the way), then a level run to
  vw + W. Every control point is further along x than the last, so x is
  monotone by construction: she never reverses, `st.fs` is `st.dir` for
  the whole flight, and the turn-round squeeze code is gone. Over the
  moon's middle she is dark exactly once.
- **Measured** (`tools/test-scenes.js`, random moon position and
  direction, 13 runs at 320/390/1280): heading ≤ 0.19 rad and speed ≤ 5.7%
  per 1/30 s frame (limits 0.23 and 7%); in her last frame before the edge
  she climbs 1–13°, against 8–31° at the steepest of the climb. The scene is about 4.2 s on a phone (flight 2.9 s) and 6.3 s
  at 1280 (flight 5.1 s: the arrival's long desktop glide is 4.10.1's).
  The moon comes up in 0.5 s (she starts 0.45 s in, off screen) and fades
  over 0.8 s after she has gone.
- **The cruise floor's band widened from 2–4.5 R to 2–5.5 R**: 4.10.1's
  desktop arrival slowed by up to 7.2% in one frame near the moon, over
  the new 7% limit. The path's shape is unchanged; the desktop glide is
  0.05–0.15 s longer.
- **Cost** (`measure-heron.js --scene=witchmoon`, two alternating
  5-run sets, same machine): phone 2× CPU 663 ms/s vs 4.10.1's 646 and
  4.9.0's 622; desktop 240 vs 240 and 224; 60 fps. The same per second as
  4.10.1, ~7% over 4.9.0, for half the scene length. Desktop is measured
  at `--dsf=1 --throttle=1`: the tool's defaults are the phone's (3×, 4×)
  and saturate at 1280 (20 fps), which reads as nothing.
- **Mutation-checked**: twelve one-line breaks of the path (exit on the
  entry side, a doubled-back handle, a sharp pull-out, a steep exit, a
  climbing run-out, an abrupt floor, facing backwards, a late moon, dark
  off the moon, dark twice, tilt unclamped, no hat clamp) each fail the
  test written for them. `tools/scene-reel.js --exit=N` renders the swoop
  out at the far edge; `--arrival=N` no longer needs the loop.
- **`test-heroes.js` "first hero 2s after done" was racy**: it sent the
  `dcc:herofx` event and read `vt` in two round-trips, so under load a
  frame of the sped-up clock slipped in between (1.87 s on 4.10.1 and
  4.10.2 alike, passing alone). It now reads `vt` in the same call as the
  dispatch; the engine's listener runs inside `dispatchEvent`.

### Rob's pick (for 4.10.3, 2026-10-13): the Halloween web is medium

4.10.2 is live ("It looks good"). Rob: "Right now it's small so make it
medium" — he chose **96px** (1.5× the old 64px) for `ACCENTS.halloween`.
Opacity .5, the corner and `pointer-events:none` unchanged. The web is
an inline SVG on a 40-unit viewBox with a 1-unit stroke, so its lines
scale with it (1.6px → 2.4px) and stay vector-sharp: nothing to retune.
`tools/test-accents.js` proves at 320/390/1280, front and behind
layering: the drawing is 96×96 (measure the SVG, not the div — an inline
SVG leaves a ~7.6px baseline gap below it in its div), the line width,
the opacity, and that a button right under it (z 8000, above the page
header) still gets the click. The fixture's test weather banner
(`.dcc-wx-banner`, z 10000) spans the top and must be hidden there, or
it is what the tap finds. The Theme guide shows accents at its own
picture size, so it had nothing to change.

### Rob (for 4.10.4, 2026-10-13): the seaplane flies in front of the moon and the witch

"The seaplane flyover goes behind the moon, which is an impossibility in
real life ... the witch/moon would be higher in the sky than the
seaplane." The plane, the fishing catch (dcc-hero-life, `.dcc-hl-wrap`)
and the golden-hour reeds/gator/heron (dcc-sun-canal, `.dcc-gh-fore`) are
the Director's mu-plugins, DOM inside `#header-image-main-inside`; our
front canvas (fixed, FRONT_Z) painted over all of it.

- **Option (b), no visible change beyond the fix**: a SCENE goes behind
  the header picture's foreground in its exact painted shape. Option (a),
  drawing the scene inside the hero, would make it scroll with the page
  and clip to the picture: Rob's call, not taken.
- **How** (`foreBegin`/`foreEnd`, around `stepVig` in the frame loop):
  where a foreground part meets the scene (its box ∩ the scene's own
  `st.fgB` rects from last frame, padded 60px) — the overlap box O, on
  whole device px — the scene draws through `fgTee` (a Proxy forwarding
  every call) into BOTH the page canvas, clipped `evenodd` to everything
  but O, and a scratch canvas of exactly O's size. The foreground's shape
  is cut from the scratch with `destination-out`, and the scratch is drawn
  back into O. The two halves fit exactly, so no pixel is lost; sprites
  never pass through it, so they stay in front.
- **Never read the page canvas**: `drawImage(cv, …)` measured 3.7 ms a
  frame (it flushes). And size the scratch EXACTLY to O: the browser
  uploads the whole scratch when it is drawn back (0.26 ms at 273 px
  square, 3.3 ms at 600). Both measured; the first two designs paid them.
- **The shape**: every SVG shape (path/rect/circle/ellipse/line/poly*/
  text/image) at its fill, stroke, dashes and full opacity chain; img,
  canvas, video by their box; clipped by every ancestor that clips; an
  svg's box includes what it draws outside itself (`getBBox`, the towed
  banner). Paint props are cached per half second (`fgStyle`); position
  and opacity are read per frame. Not cut: CSS-only paint (backgrounds,
  borders), `<use>`, SVG filters/masks — tell the Director if one is used.
- **Never trust getScreenCTM across the HTML boundary.** WebKit's ignores
  CSS rotation/scale/flip on HTML ancestors ("FIXME: This doesn't work
  correctly with CSS transforms"), and the plane is flipped and banked by
  CSS. `fgSvgM()` builds the svg box's matrix itself (the linear part from
  every ancestor's computed `transform`/`rotate`/`scale`, the translation
  solved from `getBoundingClientRect`) and uses getScreenCTM only
  RELATIVE to the svg (both halves cancel). `test-foreground.js` asserts
  it equals Chromium's getScreenCTM to < 0.5px, flipped and banked.
- **Which scenes**: those that say where they draw (`st.fgB`):
  `witchmoon` (the moon and witch rects it already cut the title from)
  and `sleighmoon` (moon + sleigh track). Others draw as before. Heroes
  are unchanged (a question for Rob: the Halloween hero witch is "the
  witch" too, but heroes are held back while the show runs).
- **How Rob saw them together**: `DCCHeroFx` busy holds back HEROES only
  (`stepHero`). Scenes were never held, and since 4.9.0 every page opens
  with its scene at 6–10 s, so on the homepage the witch and moon play
  while the hero show (plane, then catch) is still running — any visit,
  first page or later, any plane mode. `test-foreground.js` records it.
  The fix holds regardless; holding scenes too is a timing change (Rob's).
- **Cost** (headless, only while foreground and scene overlap): ~+1 ms a
  frame at 390 (0.5 → 1.5–1.9), ~+6–10 ms at 4× CPU, +1 ms at 1280;
  nothing when they do not meet (a box test per frame while a bounded
  scene plays). Mutation-checked: ten breaks (no cut, rectangular hole,
  Safari-style matrix, page canvas unclipped, scene not teed, scratch not
  drawn back, no strokes, no img/canvas, svg overflow ignored, media
  opacity ignored) each fail the test written for them.
- **Tools**: `tools/fixture.js` `heroFx: true` (the live markup and
  stacking, stand-in art, `window.dccPose()`); `tools/test-foreground.js`;
  `tools/fore-reel.js` (plane crossing the moon, before/after strip and
  video). Config `foreSel` (filter `dcc_seasons_foreground`, default
  `.dcc-hl-wrap, .dcc-gh-fore, [data-dcc-fore]`; `[data-dcc-fore-box]`
  added in 4.10.5).

### Rob's answers on 4.10.4 (for 4.10.5, 2026-10-13)

- **Timing: "Share the sky."** Scenes are NOT held until `DCCHeroFx` is
  done; the plane passes in front when they meet. Do not add a hold.
- **Sky flyers go behind the foreground too** (the witch flyer: "the
  witch/moon would be higher in the sky than the seaplane"): `SKY_HERO` =
  heron, eagle, witch, sleigh, osprey are drawn through `foreBegin(
  heroBounds(hero))`/`foreEnd` around `drawHero`. Bass and manatee (water)
  and the rainbow (a corner) are unchanged. Sprites stay in front.
- **The Director's answers**: the plane, the catch (inside `.dcc-hl-wrap`),
  reeds, gator and heron are SVG. CSS-painted: the towed banner (`.rope`
  1.5px div with a .6px shadow; `.cloth` bordered, rounded, live text,
  skewY ±.8deg, flipped west via `.dcc-hl-face.is-west`, opacity .82 at
  golden hour), the taxi wake spans, and the water glints (soft radial
  gradients, screen-blended — never to be cut).
- **`data-dcc-fore-box`** (the Director adds it to `.dcc-hl-banner .rope`,
  `.dcc-hl-banner .cloth` and `.dcc-hl-wake span` in his file): cut by the
  element's TRANSFORMED border box (`fgBox`: skew, scale, flip, rotation
  from it and every ancestor), border-radius per corner, plus each outer
  box-shadow's offset + spread (blur not cut) — `fgBoxCut`. Nothing
  CSS-painted is cut without the attribute (the glints). The default
  `foreSel` gained `[data-dcc-fore-box]`, and roots are de-duplicated to
  the outermost match: a part found twice would be cut twice, and at .82
  opacity the moon would show at 3% instead of 18%.
- **Tests** (`test-foreground.js`, 136): the CSS banner east and west,
  mid-skew and banked 10°, the moon above/below the rope, the wake cut and
  the glints not, each part counted once, the witch and heron flyers
  behind the plane (on `classic`, which has no scene, so flyer follows
  flyer until enough cross the picture; wait ~800ms for the flyer's
  sprite to decode first). Mutation-checked: box parts ignored, every CSS
  div cut, box transform ignored (caught only by the banked case — flip
  and ±.8deg skew are near-symmetric), flyers in front, witch not a sky
  flyer, roots cut twice. `fore-reel.js --mode=moon|banner|flyer`.

### Rob on staging (for 4.10.6, 2026-10-13): smooth motion on a Retina Mac

4.10.5 "looks good except that their motion moving forward is slightly
glitchy" (the plane and the witch; 2x MacBook, Chrome; the scene ran at a
flat 30 fps in the Director's recording). Nothing visible changes.

- **This container cannot see GPU cost in frame times.** It rasterises
  and composites on the CPU, so rAF runs at 60 whatever a GPU would pay;
  every build reads ~100% of frames within 17 ms. `measure-pacing.js
  --gpu=1` launches Chromium with its GPU canvas on SwiftShader
  (`--use-angle=swiftshader --enable-unsafe-swiftshader
  --ignore-gpu-blocklist --enable-gpu-rasterization
  --enable-accelerated-2d-canvas`): there the GPU holds frames back as on
  a Mac, ~20x slower, so read it build against build, never as fps.
  `DCC_CHROME_ARGS` passes extra launch flags through `harness.js`.
- **Never partial-clear the canvas** (see the pacing note): on a GPU
  canvas the background-only window went 18 → 34 page fps with the live
  plane, 23 → 46 with the plane's own repaint taken out.
- **The cut's still shapes are one picture** (`fgSvgPlan`/`fgSvgCut`):
  a shape whose key (style `sig`, own attributes `fgGeo`, opacity, matrix
  relative to its svg) changed in the last 30 frames is cut live, shape by
  shape; the rest are drawn once in the svg's frame WITHOUT its position
  (keyed on dp and the svg's linear part) and drawn moved, bilinear, as the
  compositor moves the plane's own layer. Each shape as its own fill cost
  the GPU more than the scene (11 → 15 fps over the moon, emulated).
- **Reads once a frame, before drawing** (`fgMm()`, keyed on `fgFrame`,
  bumped once per frame before the scene's `foreBegin`): `fgLin` per
  element (ancestors shared), `fgSvgM`, `fgClip`, opacity, the svg plan;
  `foreEnd` only draws. A debug helper that reads outside a frame must
  reset `fgMemo` (`_state.foreM` does). An svg clearly far from the scene
  (its box plus how far it drew outside it when last measured, < 0.5 s
  ago, plus 40 px) is skipped without `getBBox`. Script 131 → 101 ms/s
  at 1280 2x (4.10.2: 47).
- **Not done, measured**: redirecting the whole scene into a scratch (no
  tee, no evenodd clip) was ~10% faster emulated, but trusts every scene's
  and hero's declared bounds and changes what `hdrCut` erases; bucketed
  scratch sizes, dirty clears at full rate (much slower: a partial clear
  is the copy) and no draw-back gained nothing.
- **The Director's plane is the largest single cost**: `.dcc-hl-body`'s
  `filter: drop-shadow` re-filters the whole plane on every propeller
  frame. Plane alone, emulated GPU: as is 49 fps (81% within 17 ms);
  without the filter 57 (98%); without the spin 59 (99%). Recommended to
  him (his file): the propeller in its own composited element outside the
  filtered body.
- **Tests**: `tools/test-frame-pacing.js` (19: 1280/1440 at 2x, 390 at 3x;
  ≥95% within 17 ms in the scene and over the moon, sprites on, the flyer
  witch, background window at 30 repaints; every clear full; still shapes
  from ≤4 pictures a crossing). Mutation-checked: a partial clear and the
  picture disabled each fail their checks. `tools/crossing-reel.js`: the
  crossing at 60 fps at 2x, seeded `Math.random`, the live plane's
  animations seeked to the mocked clock.

### Rob's picks (for 4.10.7, 2026-10-13): the sky belongs to the header picture

Rob: "The witch/moon appear whenever I scroll down the page, too, but I
only wanted it in the hero area." Picked: "Scroll away with header",
"Wait for the header", "Yes, header only"; then (A) embers and falling
bits in FRONT of the header sky, (A) the heron never lands there, (A)
only the SKY scenes move, flyers wait too. The Director's probe of live
(homepage, /contact/, a cottage; 1265 and 390 wide): the picture is
`div#header-image-main-inside` (relative, overflow hidden, 420 px tall
everywhere) inside `#header-image-main`, inside `header#masthead` (z 999,
the stacking context, below our frontZ 9000).

- **The sky canvas** (`skyEnsure`/`inSky`, `canvas.dcc-seasons-sky`):
  made on first use INSIDE the first `CFG.skySel` match (Plugin::config,
  filter `dcc_seasons_sky`, default `#header-image-main-inside`; '' = no
  sky anywhere), absolute, z FRONT_Z inside the header's stacking
  context, so above the plane, reeds and title, which the SAME cut-outs
  (`hdrCut`, `foreBegin`/`foreEnd`) keep in front. It scrolls with the
  picture on the compositor: nothing listens to scroll, nothing is read
  or written per scroll. A ResizeObserver marks a size change. `inSky(fn)`
  swaps cv, cx, vw, vh, waterY, ground, lastDpr to the sky canvas, so every
  scene and flyer runs unchanged in the picture's own px.
- **Sky actors**: `SKY_VIG` = witchmoon, sleighmoon, doveflight, flagfly,
  corkpop; `SKY_HERO` = heron, eagle, witch, sleigh, osprey (`vig.sky`,
  `hero.sky`). Water-line scenes, bass, manatee and the rainbow stay on the
  page canvas, unchanged. No picture → both lists are filtered at start,
  so a theme left with nothing in a list simply has nothing there
  (`canHero()` checks the pool).
- **Waiting**: the chosen scene (`vigNext`) or flyer (`heroNext`) is held
  until at least HALF the picture is on screen (IntersectionObserver;
  `skyInView`). Once running it never pauses: scrolled away it runs on
  out of sight and shows again on the way back.
- **Whole device pixels**: the picture sits at a fractional page offset on
  the site (115.19 px at 1x in the fixture). The canvas is placed at
  `-frac` and drawn with that offset (`sky.ox/oy`, `cvUX/cvUY`), so its
  pixel grid is the page's and the title mask lands 1:1 — at the raw
  fraction 25% of letter samples showed moon through them. `cvOX/cvOY` is
  the picture's origin in the viewport for `hdrCut`; `foreBegin` adds
  `cvUX/cvUY` wherever it converts between the viewport and the canvas.
- **Pacing**: `pace()` is now the PAGE canvas's pace (sky actors excluded)
  and `skyBusy()` keeps the loop at full rate while the sky moves; the
  page canvas is redrawn only when its own pace is due (`pageDue`, its own
  `pdt`), so on live (ambient off) the embers stay at 30 fps during a sky
  scene and the page canvas is not re-produced in between.
- **The heron's 4.9.0 landing is unreachable since 4.10.7** (the heron is
  a sky flyer, never lands in the header, and does not appear on a page
  without one). The code is kept; `test-heroes.js` now proves it never
  lands with `heronLand = 1`.
- **Short pictures**: `witchK()` = min(width factor, (vh − 28) / 277): the
  swoop needs ~277k + 28 px; 420 px never triggers it, 220 px shrinks the
  moon to r 28 and the swoop to 12–149 px (`test-sky.js`).
- **The fixture** (`tools/fixture.js`) now has the live header on every
  page: `#masthead` z 999 > `#header-image-main` > `#header-image-main-
  inside` (420 px) with the banner title over it; `headerPic: false` is a
  page without one. `test-subtle.js` uses `headerPic: false`: with the
  taller page the behind mount stays on `<main>` and moves the article's
  white onto the canvas (its documented trade), which a whole-canvas ink
  read would count. dcc-hero-life 3.12.0's propeller is in the fixture:
  two `svg.dcc-hl-prop-svg` (`.p2`) siblings over `.dcc-hl-plane-inner`,
  a compositor scaleY (`dccHlProp`), the drop-shadow on
  `.dcc-hl-plane-inner` and `.dcc-hl-banner`; the cut finds 5 svgs.
- **Debug**: `_state.sky` = { pic, inView, ratio, w, h, left/top (the
  picture's origin in the viewport), ox/oy, heroSky, vigSky, vigs, heroes };
  `heroXY` and `vigSt` of a sky actor are in the picture's px — add
  left/top for the viewport. `_state.witch.canvas` is the sky canvas.
- **Tests**: `tools/test-sky.js` (65: at 320/390/1280 a screenshot with
  everything but the two canvases hidden shows nothing outside the
  picture before, during and after a scroll; the scene and the flyer wait
  when loaded scrolled down; no sky on a page without a picture while the
  gator scenes and the bass still play; sprites still full-page; the heron
  never lands; the 220 px fit). `test-frame-pacing.js` scrolls past the
  picture and back during the scene at 1280/1440 2x and 390 3x: ≥95%
  within 17 ms and no more layouts or style recalcs a second than with
  Seasons off. `tools/scroll-reel.js` renders the scroll at 60 fps.
- **Cost**: in this container (CPU canvases) main thread at 1280 2x during
  the scene is ~670 ms/s against 4.10.6's ~490-510: each canvas a frame is
  copied whole in software (the sky canvas is 2560×841 at 2x). On the GPU
  canvas (SwiftShader) the two builds read the same (scene 14-16 fps
  both, within noise).

### The release line from 2026-10-26 (the Director): 4.13.1 → 4.13.2 → 4.14.1

`dcc-seasons/` on the branch carries the release line, NOT the newest
experiment. 4.14.0 (Christmas, commit `ad0e834`) was built from 4.13.0 and
reached staging only; the folder was set back to 4.13.0 (`66faa59`) and:

- **4.13.1 = Thanksgiving** (Rob, 2026-10-26), from 4.13.0. Step A: eight
  pieces redrawn over public-domain/CC0 photographs at 50% (leafo, leafs,
  gourd1, gourd3, corn, acorn, cranberry, turkey — now a wild turkey HEN,
  since only hens lead poults); `tools/tg-pieces.js` draws them in the
  photos' pixels, `tools/tg-build.js --write` scales them into the engine
  (paths tokenized, never regex-trimmed). The maples, cypress, crookneck
  and pie are unchanged. Step B: scene A "high and small" with a PALE full
  moon (see below).
- **4.13.2 and 4.13.3 = Thanksgiving round 2** (the Anniversary moved to 4.13.4, the split to 4.13.5; see below).
- **4.14.1 = Christmas**, 4.14.0 rebuilt ON TOP of 4.13.2 once Rob confirms
  Santa; diff it against 4.13.2 and show Thanksgiving and the Anniversary
  survive. `tools/test-christmas.js` belongs to that build and fails on
  4.13.x by design.

**4.13.1 is LIVE (2026-10-26, md5 44bff49b…).** Thanksgiving continues
until Rob says it is done: round 2 is **4.13.2** (from 4.13.1, live before
1 Nov), any further round 4.13.3 and so on. The Anniversary waits until
Thanksgiving is done and takes the NEXT number, built on the last
Thanksgiving release; Christmas is rebuilt on whatever is last before it.

**The Anniversary, Rob's own instruction (2026-10-27), for when that round
comes:** floating "40%" and "37.5%" text — he has been married to Erica 40%
of his life, and she to him 37.5% of hers. (Names stay OFF the site, as
before: the figures float, nothing says whose they are. Ask Rob whether
the percentages are fixed text or should be COMPUTED from his date, like
the year count — they change every year.)

**Rob's picks on the round-2 sheet (for 4.13.2, 2026-10-27).** Plan A only,
live before Sunday 1 Nov; a slipped date is reported THE SAME DAY.
- **The bird is a strutting wild TOM** (replaces the hen; Rob asked for the
  fanned tail "numerous times"): full upright fan, puffed body, wings
  dropped, bare red-and-blue head with wattle and snood, chest beard. Traced
  WHOLE from ONE real CC0/PD photograph — never a body from one and a fan
  from another — at witch/heron quality (barred fan feathers, chestnut/buff
  tip band, coverts, bronze-green iridescence, real shading). Body at least
  as big as 4.13.1's turkey; the fan adds height; re-check the keep-clear set
  at 390/768/1440.
- **Poults stay, redrawn from a real poult photo** (mottled buff/brown,
  fluffy, real poult-to-adult proportions; never "a spotted egg on stilts").
  They follow the tom (Rob knows hens lead poults; he wants both).
- **No sliding cutouts**: a real walk cycle (legs alternate, head bobs
  forward/back per step) for the tom and the poults. The stop-and-peck stays
  only at that standard, and his fan stays UP while he feeds.
- **Pie**: retraced from Commons "File:Pumpkin_Pie.jpg" (PD), whole, NO steam.
- **Cornucopia: 0.85** (Rob saw it over page text at 390 and chose it).
- **No squash in 4.13.2 anywhere**: not the sheet's yellow squash, not the
  old `gourd2`, not the squash in the cornucopia's spill (filled with the
  other produce). A TRUE crookneck joins a later build once there is a
  source (seed-catalog engravings pre-1931 are fair; else Rob photographs
  one).
- Maple, cypress, cornucopia approved; the cypress is a small pick: as shown
  vs bolder rust and wider needle spread, at guest size.
- **Declined (do not offer again):** a feather rattle, a poult catching up,
  a cornucopia that fills through November, more pies on Thanksgiving Day.
  The cornucopia stays full all month. Halloween is the guide: one
  signature scene and a few pieces that belong together.
- **Christmas starts 27 Nov**; if it only fits with the per-season split,
  the split must be live before then. Not started yet: Thanksgiving, then the
  Anniversary, come first. The 4.13.2 build carries a split size/effort
  estimate.

**Rob on the round-3 sheet (for 4.13.2, 2026-10-28).** The tom is approved
after fixes; Erica's instinct was a simple cartoon tom, Rob keeps realism.
- **No kaleidoscope**: no rachis spokes in the fan; separate broad rounded
  tail feathers that vary a little in width, angle and tip, barring across
  each feather along its own curve, then the black band and the
  chestnut-buff tip; coverts in LOOSE overlapping rows, never perfect rings.
  The body: fewer, larger shingled feathers in rows flowing neck to tail,
  dark centre with a bronze/copper edge, one light direction, iridescence as
  a soft sheen across a row, never scattered specks. Rows must line up with
  the photo's rows at 50%. The dropped wing is approved as drawn.
- **The feeding neck unfolds the strut S** from under the head (never a tube
  out of the chest: "like ET or a horse penis"), thickness and colour
  continuous (bronze feathered base thinning into bare skin), head upright,
  bill down, wattle and snood hanging with gravity; traced from real PD
  reference. Fan stays up.
- Poults redrawn to the tom's standard; walk cycle stays.
- **Pie: a pan.** Foil/metal tin side wall below the crust, sloping to the
  base, soft shadow, the photo's angle.
- **Cypress: B** (bolder). **Crookneck: dropped by Rob** (not "later").
- **He walks along the bottom of the screen**, over page text on a phone
  while scrolling: Rob saw it and chose it.

**Rob on the round-4 sheet (for 4.13.2, 2026-10-29).**
- **APPROVED, do not change:** the feeding neck and pose; the fan.
- **Pie: approved; the tin a little larger** (its visible side wall and rim
  only, so it reads at guest size). The pie itself unchanged, no steam.
- **Tom's BODY, one more pass:** not pale crescent "fish scales". The
  photo's body is near-black and glossy: long pointed overlapping feathers,
  only the tips show, each tip a NARROW bronze/copper edge, bright where the
  light hits (upper breast, shoulder), nearly invisible on the shadow side;
  size and angle varied so no two rows repeat; fitted at 50% to the photo's
  bright and dark areas. Test: at guest size a dark glossy bird with a
  bronze sheen, not a patterned one.
- **Poults, one more pass:** downy, finely streaked, slightly ragged neck and
  head (thicker neck at the body, pale eye ring, bill, dark crown
  speckles); separate overlapping pale-edged wing feathers with shading,
  never ruled stripes; scaly grey-pink legs, a clear joint, slimmer below,
  toes with small claws; a fluffy irregular belly outline. At 50% the legs
  must sit on the photo's legs. The walk cycle and feeding pose stay.

**Rob approves round 5, all of it (2026-10-30): 4.13.2 is built.** Final,
nothing more to change: the tom (fan, dark glossy body, dropped wing, head,
walk, feeding neck), the round-5 poults, the pie in the larger tin with no
steam, red maple (both), cypress B, live oak, sweetgum, acorn, corn,
cranberry, the two gourds, the cornucopia at 0.85 with no squash, the
motion (leaves rock, heavy pieces drop and tumble, he walks along the
bottom). How 4.13.2 carries it:
- **The pre-draw is in a WORKER** (`tkMod` wraps the TK block so its own
  source, `'' + tkMod`, is the worker's; `tkDraw` paints one pose into a
  canvas or an OffscreenCanvas). One pose is ~35 ms at 4x CPU (≈730
  gradients and 1,080 fills), longer than any idle moment while the page
  animates, so on the page's thread it cost frames — the first build drew
  poses in frames (50-100 ms each) and an idle-sliced one stalled. The
  bitmaps come back transferred; their first draws measure ~0 ms. No
  OffscreenCanvas (iOS before 16.4), no Worker, or a worker error → the
  fallback: one pose per scroll-quiet idle moment, 300 ms apart, on the
  page's thread (14-39 ms each at 4x, for ~10 s). Both wait for 300 ms
  with no scroll/touch/wheel before their last step, and the worker itself
  is started in idle time, never in a frame.
- **He is never built in a frame** (`tkGet` returns null on a miss). Until
  his 37 poses are ready (`tkDone`) he waits just off the edge (`size *
  1.4`), then walks in — no popping.
- **The check link** (the Director's ask): `?dcc_key=<key>` opens the
  admin-only preview (`?dcc_season=`) and `?dcc_scene=now` (`CFG.sceneNow`:
  the scene at 1 s of visible time, then 3 s after each one ends, outside
  the moments queue, which then skips us via `momReady`) to a browser that
  is not logged in. The key is `DCC_SEASONS_CHECK_KEY` (wp-config) or the
  `dcc_seasons_check_key` option, created by the SETTINGS PAGE only (shown
  there as "Check link"), never on the front end; under 12 characters opens
  nothing; compared with `hash_equals`. A page with a valid key is sent
  `nocache_headers()` + `DONOTCACHEPAGE` (`no_cache_for_checks`, on
  template_redirect). The exclusions still win (`/submit-booking/` stays
  silent). `tools/test-check-key.php`.
- **The Untouched test** (`tools/test-untouched.js`, against 4.13.1 =
  `64340a4`): Themes byte-identical but Thanksgiving; engine.js identical
  line for line after taking out ONLY Thanksgiving's named code and the
  check link's two lines; ambient.js and matrix.js byte-identical; and all
  26 other themes draw the SAME PIXELS on the mocked clock with a seeded
  Math.random and pinned Date (`tools/untouched-hash.js`, 7 moments over
  24 s, through each first scene and flyer). Mutation-checked eight ways.
  Use it for every release on this line: change `BASE` to the live commit.
- **Measuring**: `tools/measure-tom.js` (shipped build, 390, DPR 3, 4x CPU,
  a guest's first scroll at 300 ms, NO warm-up excluded; seed 14 puts the
  tom on screen; `--noworker`/`--nooffscreen` force the fallback). This
  container stalls a single drawImage of a long-drawn image for 10-21 ms
  now and then, in 4.13.1 exactly as in 4.13.2: compare builds in
  alternating pairs, never one run.

**Rob's answers on 4.13.2 (the Director, 2026-10-29), shipped as 4.13.3**
(a NEW number so no cache can serve the 4.13.2 engine; the Anniversary is
now **4.13.5**, on top of the split, **4.13.4**; reversed 2026-10-29, see below):
- **How often the tom appears: B** — `'w' => 3, 'n' => 1` on his theme
  row: every visit at every width, never two; on a phone he takes one
  falling piece's place. Measured on the REAL page (`tools/test-tom-turn.js`,
  20 visits a width), never only the fixture: the Director saw A at about
  half his visits at 1440 on staging, against the fixture's 20/20.
- **He turns before the cornucopia** (Rob): he and both poults never
  overlap the accent's real box (`.dcc-seasons-accent`, read against the
  canvas every 250 ms, `tkBlock`), feeding stops included, at every width.
  When the box stands in his band he enters from the far side; a stride
  plus 8px out he finishes his step and turns (`p.tn`); the poults stay
  where they stand, pecking (`'kp4'`), while he walks back past them
  (`p.pw`, ground walked since the turn, mirrors their offset), then fall
  in behind. `test-tom-turn.js` catches every tom/poult drawImage through
  the context's transform: zero overlaps, on the fixture and the real page;
  mutation-checked (no turn, poults snapping behind him, A's row).
- **The Theme guide label:** `gourd3` is "Green Gourd" (no squash anywhere).
- **The crane crossing's cost goes on the split round's list**: on Rob's
  Mac with `&dcc_scene=now` repeating it, p95 doubles (9.2-10.7 ms, 59-102
  callbacks over 8 ms in 20 s). Unchanged since 4.13.1; once a visit.
- **Size, made without changing a pixel** (82,221 gz, 4 under): the TG
  sprite markup minified losslessly (`tools/tg-svgmin.js`: separators the
  grammar does not need, attributes at their SVG default, `0.N` → `.N`;
  every number keeps its own text) and the generators' literals the same;
  `tools/tg-svgmin-check.js` rasterises every piece old vs new at 32/96/256
  px — 0 differing values. `leafm2` RECOLOURS `leafm` by text replacement,
  so its search string had to follow the minify (it would have drawn plain
  red); `test-thanksgiving.js` now RUNS it. `tkMod` returns an array (its
  names minify; the worker reads `M[1]`), and the guide's tom picture is
  drawn by `theme-guide.js` from `E.tk` (= the tkMod array).
- **The Anniversary (4.13.5): COMPUTED from the dates** (Rob), so the
  40% / 37.5% stay true every Nov 11, like the year count. Dates in code or
  config only, no names public; ask the Director for any date not in hand.
  **The dates (Rob, 2026-10-29):** wedding 11 Nov 2011 (the year count's
  `year - 2011`), births 26 Mar 1989 (his) and 25 Mar 1986 (hers).
  **Rounding: to the nearest whole number, no decimals** (Rob). Computed on
  11 Nov from day counts (365.2425 days a year): 2026 → 40% and 37% (not
  37.5: his figure was before rounding; reported to him), 2027 → 41 / 38,
  2028 → 43 / 40, 2029 → 44 / 41, 2030 → 46 / 43. The figures float with
  nothing saying whose they are.

**Rob's Anniversary picks, all 12 rows (relayed by the Director, 2026-10-29).**
The Anniversary does not fit in one engine, so the order is: **4.13.4 = the
per-season split** (no visible change), **4.13.5 = the Anniversary** on top of
it, live by 9 Nov; Christmas (4.14.1) is rebuilt on 4.13.5, live before 27 Nov.
1. Hearts: **A, blush only**. 2. Gold rings: **B, two bands linked**.
3. Crystal: **A, the cut drop**. 4. The toast: **A, flutes clinking**.
5. The date: **A, the gold band (11·11·11)**. 6. The year count: **A, a
crystal numeral of its own** (15 in 2026, computed). 7. The date falls
**half as big again**; the Director wants the year crystal 1.5× too (agreed:
at 1× its numeral is 8px type). 8. The dancing bird: **B, the new bird**
(`tools/anniv-crane.js`), after a DETAIL PASS Rob sees first
(`tools/anniv-crane-detail.js`: white cheek, ochre staining, loose feather
rows, the tertial bustle as separate feathers, separate primaries dark at the
tips, separate secondaries, dark legs with the heel, one light — the cr5
photo's, cream breast and slate back, in every pose so the bird does not
change colour as it dances). 9. **Florida Keys' `cranes` scene takes the same
new bird** in the same boxes (`tools/anniv-keys-cranes.js` swaps the two
sprites at draw time to show it); the Untouched test exempts ONLY that crane
and proves the rest of Florida Keys pixel-identical. 10. The pair dances
**A, under the tagline, centered, at every width** (`tools/anniv-scene.js`).
11. The percentages: **A, gold numerals alone**. 12. They fall **half as big
again**. Build checks: Untouched (mutation-checked), the 8 ms frame bar,
reduced motion, `/submit-booking/` zero requests, three widths on the real
page, and a key-gated check link that forces 11 Nov on staging.

**The moon is true (Rob's standing rule).** November's full moon is NOT the
harvest moon (that is the full moon nearest the autumn equinox, late
September). Call it the full moon, or November's Beaver Moon, in code,
notes and guest text. High in the sky it is PALE CREAM — the same real face
as Halloween's moon; orange belongs near the horizon only. USNO: full moon
24 Nov 2026 14:53 UT (Thanksgiving week), 24 Dec 2026 01:28 UT.

**Real-theme runs use a real scrollbar from 768 up** (`rt.opts(w)` →
harness `scrollbar: true`). Headless Chromium hides it, which made the page
15px wider and moved every centred box 7-8px against the Director's live
measurements. With it, 1440 matches live exactly (title 314,129→1111,222;
tagline letters 561,266→864,290). Keep-clear text is measured by its
LETTERS, never the `p.byline` element box.

**The keep-clear set** (Rob, every scene): title letters, tagline letters,
the menu bar `#site-header-main` (and `.site-header-bottom-fixed` from
1024), the dial `.dcc-sun-dial`, the menu button `.menu-burger`, at 8px.
No moon on the water; nothing painted into the photograph. The live
`dcc-topbar.php` mu-plugin publishes `--dcc-topbar` (0/63px) and
`window.DCCTopbar.get()` for anything that must clear the sliding bar.

### Rob's picks (for 4.14.0, 2026-10-23/24): Christmas

Four rounds of stills (`tools/xmas-redraw.js`, `tools/xmas-final.js`).
Round 1's drawings were rejected as "dumpy", "tube-shaped", "like South
Park kids walking"; the standard is the witch and the heron, and every
animal is now laid at 50% over a public-domain or CC0 photograph BEFORE
Rob sees it (the overlay rows; sources named on the sheets).

- **The scene `sleighmoon`**, by day as well as by night (it moved from
  `EVENING_VIGS`, now empty, into `VIGS.christmas`; `giftdrop` stays):
  the engine's own moon, ungraded, then Santa's sleigh and FOUR reindeer
  in two pairs. Painters at module scope (`rdPaint`/`rdLeg`/`rdPose`/
  `rdGlow`, `snSanta`/`snSleigh`/`snSack`/`snReins`), approved as drawn:
  - Reindeer: Rangifer from reference, body ~0.4 as deep as long, legs one
    tapered shape each with no joint knobs, a broad blunt muzzle, the neck
    and body ONE outline. A transverse gallop from Muybridge, keyframed
    joint angles (Catmull-Rom), footfalls LH 0, RH .10, LF .45, RF .56,
    each leg down a quarter stride. The team staggered a quarter stride
    apart, the far animal of each pair behind, above, 90% and darker.
  - The lead has the RED NOSE (Rob's A): `rdGlow`, drawn AFTER the moon's
    cut so it glows while the animal is dark.
  - The silhouette is CUT AT THE DISC (Rob's A): each reindeer pose is
    pre-drawn lit, far-lit and dark (`sdGet`, 24 poses, min(DPR, 2)); per
    frame the lit sprite, then the dark one clipped to the moon's circle.
    Santa and the sleigh are NEVER dark (Rob).
  - Santa: a two-lobe mustache over a full rounded beard, the blush on the
    cheekbone, white hair in front of the ear into the beard, red sleeves
    with fur cuffs, the classic hat as one shape. He flicks the reins every
    2.4-3.8 s; the snap travels to the lead pair in 0.9 s.
- **The moon keeps clear** of the page title (measured by its LETTERS, a
  Range per text node) and of anything `[data-dcc-keep-clear]`, plus the
  picture's top-right 230x190 from 768px up, where the dial sits
  (`sledMoon`; config `clearSel`, filter `dcc_seasons_keep_clear`).
- **Cost bars (the Director's): worst frame after warm-up < 8 ms** at 390,
  DPR 3, 4x CPU over 10 s, measured on the SHIPPED build
  (`tools/measure-sleigh.js`). The header's letters are measured in IDLE
  time ahead of the scene and every sprite is warmed once: measuring them
  in the scene's first frame cost ~11 ms and the first drawImage of each
  sprite ~8 ms. The cranes' scene still measures its letters in-frame (it
  reads ~22 ms at 4x CPU on that one frame) — unchanged, as Thanksgiving
  is finished; tell the Director before touching it.
- **The pieces**: the three glass balls as ONE kind (`ballred`/`ballgold`/
  `ballblue`, Rob's A), `candycane` (Rob's B: green in the stripes, a
  pattern painted on the stroke so it wraps the hook), `flamingoxmas`
  (Rob's C, one leg folded across the other with its webbed foot, the S
  neck dipping below the breast, the beak clear in front of it),
  `palmxmas` (petioles first, fans opening along them, more up than down,
  no symmetry), and holly (closed sprig), gift and pine redrawn. The Keys
  `sabalpalm` and Snowbird `flamingo` are NOT changed. Cap 9 / phone 5
  unchanged. Three of these are FUNCTIONS (`xBall`, `xPalm`, `xWreath`) so
  the engine carries the geometry, not kilobytes of path data;
  `tools/gen-xmas-art.js` mirrors the palm and flamingo for the labs.
- **The wreath** is the corner accent, Rob's A, in the web's size class
  (96px, .5, top right, 8px in). Its gradient ids are prefixed (`dccWr…`):
  an accent is inlined into the page, where ids are global.
- **No bokeh** (Rob's B), in `subtle_defaults()` and `SUBTLE_FALLBACK`.
- **One Santa**: the static `sleigh` HERO is removed (`SKY_HERO`, the hero
  code, `HERO_ART`). The `sleigh` SPRITE stays: `giftdrop` draws it.
- `tools/test-christmas.js` pins all of it, checks the cut, the nose and
  Santa on the canvas's pixels, the other 26 themes and the witch/crane/
  gift scenes byte-identical to 4.13.0, reduced motion and
  `/submit-booking/` (zero requests, via `scope-decide.php
  --kind=submitbooking`). `tools/shots-christmas.js` is the THREE-WIDTH
  check, a standing rule for every release (390, 768, 1440).

- **Calendar far future:** the tie rule (the UPCOMING holiday wins an exact
  distance tie) decides nothing in 2027–2036. Same-day clashes decades out
  (Fat Tuesday = Valentine's 2040/2051, Easter = Earth Day 2057/2068) need no
  question to Rob — any sane, deterministic behaviour is fine.
- **Calendar rules (both resolvers, identically):** a holiday's own day is
  never given away; Easter beats April Fool's on 1 Apr 2029; a lone day of a
  long theme goes to the theme that starts next, EXCEPT that a one-day holiday
  (MLK, Presidents, April Fool's, 4/20) is never lengthened — then the lone day
  stays with its own theme (so 15 Feb 2032 and 19 Apr 2033 stay put); where
  two holiday lead-up windows overlap, the NEARER holiday's own day wins the
  day (this replaced "the shorter window wins").

## DCC Seasons — things that bite

- **Minified assets have a recorded build command.** Regenerate with exactly
  `npx terser assets/js/<name>.js -c passes=3 -m --safari10 -d __DCC_DEBUG__=false
  -o assets/js/<name>.min.js` for ambient/engine/matrix. Before 3.6.0 the engine's
  flags were unrecorded, which made one release's binary unreproducible and its
  size incomparable to the next.
- **The engine's size baseline is 231,262 raw / 82,218 gzipped (4.13.2, `gzip -c` with the file name, as always — 7 bytes under the Director's 82,225 ceiling, so Christmas needs the per-season split; Thanksgiving's own art and code are 16.1KB gz of it (82,218 → 66,107 with them taken out); the tom, poults, pie tin, cypress B, cornucopia and the worker pre-draw are +24.9KB raw / +9.9KB gz over 4.13.1's 206,300 / 72,362. Earlier: 206,300 raw / 72,362 gzipped (4.13.1; the eight redrawn Thanksgiving pieces are +14.8KB raw / +4.6KB gz and the keep-clear crane plan +1.6KB raw / +0.6KB gz over 4.13.0's 189,931 / 67,225. 4.14.0, off the release line: 221,478 raw / 77,396 gzipped; the Christmas scene, its painters and the redrawn pieces are +31.5KB raw / +10.2KB gz over 4.13.0's 189,931 / 67,225, against the Director's ceiling of 82,225 gz. Earlier: 181,684 raw / 64,661 gzipped (4.12.2; the 30 fps sprite cap and the carried pacing anchor are +58 raw / +44 gz over 4.12.0/4.12.1's 181,626 / 64,617 — 4.12.1 changed the loader, not the engine; the moments queue and the heron yield are +1.7KB raw / +0.7KB gz over 4.10.7's 179,951 / 63,939; the header-picture sky canvas is +3.2KB raw / +1.3KB gz over 4.10.6's 176,708 / 62,678; the cut's shape picture and the per-frame read memo are +3.0KB raw / +1.4KB gz over 4.10.5's 173,735 / 61,323; the box cut and sky flyers are +2.1KB raw / +0.8KB gz over 4.10.4's 171,669 / 60,512; the header picture's foreground cut is +9.5KB raw / +3.7KB gz over 4.10.2/4.10.3's 162,169 / 56,792; removing the loop and the turn-round squeeze is −585 raw / −264 gz against 4.10.1's 162,754 / 57,056; the header-letter cut-out, the cloth cape and the smoothed path are +4.7KB over 4.10.0's 158,072 / 54,984; the drawn witch and the real moon were +17KB raw over 4.9.0's 140,774 / 48,875; the drawn heron was +8.7KB over 4.8.0's 132,038 / 45,032). Earlier: 129,444 raw / 43,746 gzipped (4.4.0; +1.5KB for the Theme guide exports); 4.3.0 was 127,906 / 43,207; 4.2.0 was 124,372 / 42,179 ( 4.1.3 measured the same way was 105,954 / 36,395 — the +18.4KB raw is 22 new sprites and 8 new scenes, roughly 0.8KB raw per sprite and 0.7KB per scene). Earlier: 105,948 / 36,385 (4.1.1; 4.1.0 was 106,593 / 36,558; 4.0.0 was 105,079 / 36,124; 3.18.0
  was 97,933 / 34,373, 3.16.0 was 95,220 / 33,372, both verified live). Layer 1
  cost ~7.2KB raw. Cite the 4.0.0 number, not the 66KB/23KB ceiling.** That
  ceiling was real at 3.3.1 (65,736 / 23,191) and has been stale since 3.6.0, when the
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
  article working — `tools/test-layering.js` covers the mount (the scratchpad mount suite did not survive) — and check
  `SCREEN REACH` in `?dcc_debug=1`, not just `CANVAS REACH`, before believing
  the backdrop is fine. The scratchpad host suite did not survive; `tools/test-layering.js` holds the reach half of the trade.
- **A new theme does NOT reach an edited schedule by itself.** `migrate()`
  only replaces a stored schedule outright when it recognises it as the
  unmodified pre-3.7.0 default; anything the owner touched is converted row
  for row, so the six themes 3.7.0 added had no rows and displayed on zero
  days for a whole release cycle, silently. Every release that adds a theme
  with a default row MUST add it to `Schedule::new_theme_rows()`
  (`version => [theme keys]`); `apply_new_themes()` appends the rows for
  versions being upgraded THROUGH only. Never widen that to "any theme with
  no row" — a row the owner deliberately deleted would come back on the
  next upgrade. (This used to cite summer_canal "on this site" as such a
  deleted row. That was an inference, never the owner's word, and wrong:
  the live schedule was reset to the defaults on 2026-09-26 and INCLUDES
  summer_canal; Rob confirmed Summer on the Canal for Jun–Jul on
  2026-09-27.) `Settings::unscheduled_themes()` reports the rest
  passively on the settings page.
- **`florida_keys` is the year-round BASE theme, and it is a full-year schedule
  row, not a code path.** `Schedule::defaults()` ends with a Jan 1 - Dec 31
  row; because `active()` takes the NARROWEST containing range, the widest
  possible row loses to everything and wins only days nothing else claims.
  Until 4.0.0 the shipped rows tiled the year and the base row won ZERO
  days; since 4.0.0 the DEFAULTS end spring_canal at 30 April and
  summer_canal at 31 July, handing the base May and August (49-59 days a
  year, `tools/test-schedule.js`). A stored schedule keeps its own bounds —
  `apply_new_themes()` only appends rows for absent themes and `migrate()`
  only converts legacy Y-m-d rows, so nothing rewrites an existing row's
  ends. On THIS site that did not matter, and the 4.1.3 note claiming the
  base "wins zero days" was wrong: live held 25 rows with no summer_canal,
  so the base won 87 days of 2026. On 2026-09-26 the owner reset the
  schedule to the defaults (backup `dcc_seasons_options_bak_20260926`);
  live now resolves exactly as the defaults do (2027: Florida Keys 59,
  Summer on the Canal 53). `ambient.js` mirrors the key in `BASE_THEME`
  and falls back to it when no row matches.
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
  `tools/test-schedule.js` walks every day of 2024-2035, resolves every row for year-1
  and year, takes the narrowest containing range and asserts per-theme day
  counts.
- **The schedule is rules, not dates** (`includes/class-schedule.php`). Rows are
  `{start:{on,off,m?,d?}, end:{…}, theme, label, year}`; `on` is `fixed` or a
  named anchor (`easter`, `thanksgiving`, `memorial_day`…). The SAME resolver
  exists in PHP (admin table) and in `ambient.js` (the visitor, from their local
  date — cache-safe). `tools/test-schedule.js` cross-checks them for every
  day of 2027–2036; keep both in step. Since 4.2.0 the winner of a day is
  Rob's four rules (see `Schedule`'s class docblock): a holiday's own day is
  never given away (`CLASH_WINS` settles same-day clashes); overlapping
  holiday lead-ups go to the NEARER holiday (exact tie: the upcoming one);
  otherwise the narrowest range; a long theme's lone day goes to the theme
  that starts next unless that is a one-day holiday. `HOLIDAY_ANCHOR` and
  `CLASH_WINS` are shipped in the client config, never hand-copied into
  ambient.js. Pre-3.7.0 dated rows are migrated on read (`Schedule::migrate`).
- **Tap counting is delegated** (one document listener, `closest()` against
  the configured selectors only, counting VISIBLE matches). Binding per
  element double-counted nested targets — the egg opened on half the
  configured taps until 3.7.0. Until 4.7.1 there were fallback tiers
  (`tapFallback` → `#masthead`); on this site the banner title sits INSIDE
  `#masthead`, so the fallback opened the egg from every page's title
  (live /contact/, 2026-10-10). A fixture must put the title inside the
  header too, or the regression test passes on the broken build — the
  first 4.7.1 fixture did exactly that.
- **The tap target must be something this theme actually SHOWS.** Bravada's
  generated CSS hides `#site-text`, so `#site-title` is 0x0 on every page;
  `#branding` is 0 wide; `.header-image` does not exist; and a bare
  `.entry-title` matches every cottage card title on the homepage. Until
  4.7.0 the egg was unreachable for guests on live and nobody noticed for
  weeks. `test-front.js` (`banner: true` fixture) proves the default hits
  exactly the banner title and that card titles and the header do not
  count there; `banner: 'page'` (no body.home, title "Contact Us") proves
  another page has no egg. And anything that TELLS people how to open the egg must come
  from `Settings::egg_howto()`, never a hard-coded "tap the logo five times".
- **Some keys are stored ONLY as overrides (`Settings::TRACKED_DEFAULTS`).**
  `sanitize()` drops a tracked value equal to its default, the upgrade
  clears a stored one equal to it, and the upgrade's "persist missing
  default keys" step SKIPS them — without that skip the same upgrade would
  write the default straight back and freeze it. Rob's rule: his site
  choices live in plugin defaults, so a later default change reaches the
  site. Add a key here when a Rob pick is delivered as a setting default.
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
  the scratchpad spread suite asserted their staging and did not survive — rebuild it under `tools/` before touching `spreadPlace()`, so a new
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
- **The Schedule settings UI has two layouts and one markup.** Above 782px it
  is the six-column table the owner approved in 3.16.1 — treat that rendering
  as frozen and prove it with a pixel diff of the 1280px screenshot
  (the scratchpad render/shot pair did not survive; rebuild under `tools/` first) before shipping
  any change to `class-settings.php` or `admin.css`. At 782px and below the
  same rows become cards, driven entirely by CSS plus the `data-dcc-label`
  attribute each cell carries (its own column heading, inert on the table).
  Two traps: `td:nth-child(n)` column widths are MORE specific than a
  `tbody td` reset, so the card rules must name them to undo them; and the
  offset/unit and month/day pairs are nowrap spans on purpose — the original
  complaint was "days" wrapping below the box it labels. Keep the 66 `name=`
  attributes byte-identical; that diff is what guarantees no saved schedule
  data moves.
- **Decorations live in the FOOTER by default, and never on a word.** The
  owner's "it only appears over my About Us text, which blocks exactly the
  stuff I want guests to read" is settled by `placement` (Settings: footer |
  content, default footer) — a different question from `scope`, which decides
  which PAGES load the plugin; keep them separate. Footer mode mounts the
  canvas inside the footer, `position:absolute;inset:0` — and `width:100%`
  and `height:100%` are NOT redundant there: a canvas is a REPLACED element,
  so an absolutely positioned one with `width:auto` takes its intrinsic
  300x150 and the insets are ignored, which rejects the mount and renders
  nothing. Footer text is protected by clipping every frame to the footer box
  minus `textBoxes`, measured with RANGE rects over text nodes (glyph-tight
  horizontally, line-box tall) plus img/svg — never element block boxes. No
  footer means nothing renders; never fall back into the content, that is the
  one outcome the setting exists to prevent. The scratchpad footer suite did not survive; `tools/gen-config.php` takes
  `--placement=content|footer`, and `tools/test-layering.js` runs both. The footer selector
  lives in ONE place — the PHP config's `footerSel` — because the loader uses
  it to decide whether to fetch the engine at all and the engine uses it to
  mount; two copies could disagree. The loader's skip is suspended when
  `CFG.diag` is set: the panel is drawn by the engine, so skipping the fetch
  would silence `?dcc_debug=1` in the state it exists to explain.
- **A diagnostic must survive the state it exists to explain.** `printDiag()`
  is also called from the one path that gives up before the scene is built
  (footer placement, no footer). `var` hoists declarations, not values, so
  `parts` and `textBoxes` are undefined there — an unguarded `.length` made
  the panel throw in precisely the state the owner needed it. Anything new in
  that function has to tolerate a half-built engine.
- **There is no "out of season", and the enqueue cannot be gated on one.**
  The season rows tile the year and `florida_keys` is the year-round base
  under them: 0 of 365 days in 2026 resolve to nothing. And the row is
  resolved from the VISITOR'S local date on purpose, so the server cannot know
  which season is live without breaking cache-safety. What loads, measured:
  ONE enqueued script, `ambient.min.js` (~4.4KB, footer, defer); the engine
  (182KB raw / 65KB gzipped at 4.12.1 — the "~96KB" this note carried for
  nine releases was stale, as the readme's was) is fetched by it AFTER the
  window `load` event: 400 ms later (then idle time where the browser offers
  it), or on the visitor's first scroll or tap, whichever comes first
  (4.12.1). Nothing is fetched before load. Not at all under reduced motion,
  with the ambient layer off, or (since 3.18.1) under footer placement on a
  page with no footer. Re-measure
  (the scratchpad audit-load script did not survive; rebuild it under `tools/`)
  before accepting any claim about what this
  plugin costs a page.
- **Coverage is NOT a load-time fact, and the stacking contexts are a red
  herring.** `fixCoverage()` runs at mount, at the 1200ms settled pass and on
  re-mount — all at the scroll offset the page loads at. At scroll 0 the only
  thing inside the canvas box is the host's own background, so reach reads
  100%, the corrective loop concludes there is nothing to fix, and it is never
  asked again; everything that actually covers the backdrop on this site is
  BELOW THE FOLD at that moment. Measured on the Elementor fixture before the
  4.0.0 fix, reach by scroll offset: 0→100%, 400→88%, 900→63%, 1400→38%.
  `queueCover()` now re-checks on scroll-settle (rate limited to 500ms) and
  only ever moves a covering background onto the canvas — never re-hosts, as a
  descend mid-scroll moves the backdrop under the reader. When you chase this
  again: a DESCENDANT of the host paints above a `z-index:-1` child of that
  host whether or not it makes a stacking context (negative-z is step 3 of the
  painting order, in-flow descendants step 4). The fixture makes contexts four
  ways — z-index, transform, opacity, filter — and all four behave identically.
  The descendant relationship is the whole mechanism.
- **`classic` is the "None" option, not a theme to tidy away.** It has no
  schedule row BY DESIGN, its label is "None (heron + classic green egg only)",
  `ambient.js` falls back to its egg config, and `unscheduled_themes()`
  excludes it by name. Retiring it breaks the None selection in the schedule
  table, the egg fallback and any saved row set to None. It has been proposed
  for retirement once; the answer is no.
- **20 sprites are named by no theme particle list, and 19 of them are in
  use.** They reach the screen through engine code instead: vignettes
  (`SCENES` + `VIGS`), hero `kind`s, the hardcoded `ACCENTS` map, and the
  `fx: 'letter'` pair. `validate-paths.js` counts a quoted mention as a
  reference for exactly this reason. Before deleting any sprite, grep
  `dspr('`, `sprite('`, `ACCENTS`, `VIGS` and the hero kinds — "not in a theme"
  is not "unused". A theme-level `'accent' => ['svg' => ...]` key, by contrast,
  IS dead: the engine's ACCENTS map is hardcoded by theme key and has never
  read it.
- **The browser suites live in `tools/`, and they must stay there.** Every
  suite this file used to cite lived in a session scratchpad and none survived;
  a later brief then asked to "keep the existing schedule cross-check green"
  when no such test existed. `tools/harness.js` serves the REAL asset files,
  `tools/gen-config.php` emits the client config from the actual Themes and
  Schedule classes, and `tools/fixture.js` holds the Bravada and Elementor page
  shapes. Run: `test-layering.js`, `test-subtle.js`, `test-schedule.js`,
  `test-min.js`, `test-front.js`, `test-orphans.js`, `test-counts.js`,
  `test-heroes.js`, `test-scenes.js`, `php tools/test-settings.php`,
  `php tools/test-rules.php`, `php tools/test-scope.php`,
  `node tools/test-scope-browser.js`, `node tools/test-moments.js`, `node tools/test-moments-browser.js`,
  `node tools/test-loader.js`, `php tools/test-config-themes.php`, `node tools/test-thanksgiving.js`, `node tools/test-thanksgiving-scene.js`, `node tools/test-tom.js`, `node tools/test-tom-turn.js`, `node tools/test-quiet.js`, `node tools/test-untouched.js` (against the live release), `php tools/test-check-key.php`, `node tools/test-christmas.js` (4.14.x only),
  `node tools/test-sprite-rate.js`,
  `php tools/test-upgrade.php`, `node tools/test-guide.js`, `node tools/test-accents.js`, `node tools/test-foreground.js`, `node tools/test-sky.js`, `node tools/test-frame-pacing.js`, `node tools/test-switches.js`, `node tools/test-pacing.js`, `node tools/test-timing.js` (and `--width=1280`), `node tools/validate-paths.js --strict`.
  `tools/scene-reel.js` renders any scene or hero from the real engine on
  the mocked clock to a WebM + frame strip + path trace (Playwright's
  ffmpeg: VP8 only, input `pipe:0` — `-` is not supported and the process
  dies at once); `tools/heron-sheet.js` / `tools/heron-reel.js` render the
  heron candidates.
  `tools/theme-sheet.js themes|heroes` renders the eye-check sheets.
  `tools/witch-poses.js` renders the witch's frames and the moon large;
  `tools/heron-poses.js` the heron's poses; `tools/measure-heron.js`
  (`--scene=<name>` for a scene) measures an effect against an older
  build. `scene-reel.js --closeup=N --follow=N --arrival=N` adds magnified
  strips (`--arrival`: a fixed camera on the moon through the dive), and
  `--banner=home|page` uses the live banner shape (a header picture with
  the page title over it, `tools/fixture.js`).
  **Rebuild the minified files before `test-guide.js`**: the guide page
  loads `engine.min.js`, and a stale one silently draws the old pictures
  (4.10.0's run counted 285 pictures until it was rebuilt).
  `test-schedule.js` walks 2027-2036 through BOTH resolvers and requires
  them to reproduce `tools/fixtures/calendar-2027-2036.json` — the table Rob
  confirmed — exactly.
  Three measurement traps they document, each of which produced a wrong number
  first: `--diag` puts the diagnostics panel on the page and it is counted as a
  blocker; counting the HOST's own background as a blocker understates reach;
  and `--density=0` yields TEN sprites, not none, because the engine reads
  `CFG.density || 10` and 0 is falsy (use `--noparticles`).
- **Layer 1 (the subtle layer) is drawn on the EXISTING canvas**, right after
  `drawBgFills()` and before everything else, which is what "below the sprites"
  means in painting-order terms. Do not give it a second canvas: every layering
  bug this plugin has had lived in the mount, and a second mount doubles that
  surface to buy an ordering this already gives for free. Its theme→effect map
  is `Themes::subtle_defaults()`, mirrored in the engine as `SUBTLE_FALLBACK`
  for cached configs — keep the two in step, as `ambient.js` does for
  `BASE_THEME`. `Settings::subtle_map()` stores OVERRIDES ONLY so an untouched
  theme keeps tracking the plugin.
- **Decoration must never outrank what a visitor NEEDS to see.** 'front'
  placement mounts at `FRONT_Z` (default 9000, a setting, clamped to 9998),
  which is above ordinary content and Elementor sections and BELOW
  lightboxes (9999), the site's severe-weather banner `.dcc-wx-banner`
  (10000) and any consent UI. It was 99990 until 4.1.0, so sprites drew over
  live NWS tornado warnings. The Matrix egg stays at 2.147e9 — it is a modal
  the visitor just invoked and can dismiss. Anything that must sit above the
  canvas only has to clear FRONT_Z. **Measured 2026-10-15 and reported to
  the Director: 9000 is ABOVE the Availability Calendar's own pop-ups
  (overlay 1000, sheet 1001), so in front placement sprites DRAW OVER a
  booking or info pop-up — clicks are unaffected (`pointer-events:none`),
  and Hero Effects' flight layer at 900 is below us as intended. Lowering
  it is a visible change and so Rob's call; 4.12.0 was told not to touch
  it.**
- **The scope tiers are NOT all nested since 4.11.0.** Rob asked for "All
  pages except for homepage" (`not_home`, listed after "All pages") so
  Seasons can run on the homepage while the Director's Hero Effects
  mu-plugin (3.14.0, the same option) runs everywhere else and the two never
  stack. It is "All pages" minus the front page: `page` post types and
  cottage pages, never posts, archives, search or 404. Read
  `Plugin::scope_allows()`'s matrix as a COLUMN per tier, never as an
  order — a wider-looking tier can now lose a context a narrower one had.
  The hard exclusions still run first and are untouched; the tier covers
  the egg too (whose target is the homepage banner title, so `not_home`
  has no egg at all). The packaged default stays `all` and NOTHING writes
  the option — `test-scope.php` scans the plugin, comments stripped, and
  requires exactly one assignment to the key, in `sanitize()`.
  `tools/scope-stubs.php` is the shared fake WordPress; `tools/scope-decide.php`
  prints the real `should_load()` verdict for one page kind, which
  `tools/test-scope-browser.js` uses to serve each page the way the site
  would and then look at what a guest gets (config, canvas, fetched
  scripts, the egg).
- **Scope is not the same question as exclusion, and the booking flow is the
  reason.** Scope says which KINDS of page may be decorated; exclusions say
  which pages never are, in EVERY tier including 'all'. `no_cottages` means
  "front page + every `page` post type", which silently covered Checkout,
  Payment Request, Submit Booking, Cottage Cart, all five booking
  confirmation pages and the internal staff board. `is_booking_flow()` asks
  MotoPress's own predicates FIRST (`mphb_is_checkout_page` and friends),
  then MotoPress's reported page IDs, then slugs, then this site's literal
  IDs — because an ID changes when a page is rebuilt or restored and a stale
  ID fails silently in the worst direction. `tools/test-scope.php` drives the
  real `should_load()` and proves the slug and ID fallbacks independently.
- **A vignette named with no scene behind it is silent, and it spins.**
  `VIGS` maps theme → scene NAMES and `startVig()` looks them up in `SCENES`;
  a miss returns without starting anything, and `vigNext` is only pushed
  forward by `endVig()`, so the engine retried on EVERY FRAME for the life of
  the page. Four names were in this state until 4.1.0 (doveflight, flagfly,
  kayaker, stilts), so MLK and Patriot Day never played a vignette at all.
  `validate-paths.js` now fails the build on a dangling scene name, the same
  way it does for sprites, and the retry clock moves whether or not a scene
  started.
- **"Not referenced" is a HEURISTIC, and it has been wrong.** A sprite does
  not have to be named at its call site: `heron0/1/2` live in an ARRAY
  (`HERON_FRAMES`) indexed at draw time, and `letter1` is picked by a
  TERNARY on the particle's height. A labeller matching only literal
  `sprite('x')` calls reported all four as unused in 4.1.0 and sent a whole
  round chasing a heron flyover that works perfectly. Both `sprite-sheet.js`
  and `validate-paths.js` therefore count ANY quoted occurrence of a known
  key outside the SVGS block. The two directions are not equally decidable,
  so they are treated differently on purpose: a DANGLING reference (theme
  names a sprite that does not exist) fails the build, because that is
  exact; an UNREFERENCED sprite only warns, because it is a guess, and a
  false "unused" costs a working feature while a missed one costs a few
  hundred bytes. `--strict` turns the warning into a failure for a
  deliberate cull. Before deleting any sprite, prove it does not draw —
  `tools/test-orphans.js` shows how: force the thing that draws it and read
  the canvas, never just re-check the table.
- **Judge a sprite on BOTH grounds.** The effects run over a hero
  photograph, white body copy AND the navy footer, so
  `tools/sprite-sheet.js` renders every sprite on a light and a dark panel
  and labels which themes name it. A pale sprite judged only on cream looks
  fine right up until it vanishes into the footer — checked, and swan, dove,
  bobber, snowflake and ghost all survive because they carry outlines.
- **The plugin does NOT own the `dcc` admin parent menu.** Since 4.1.2 the
  site-side mu-plugin `dcc-menu.php` registers it at priority 5 and removes
  WordPress's mirrored duplicate at 999. `class-menu.php` is constants only;
  `Menu::init()` is a deliberate no-op so a sibling that still calls it does
  not fatal. Never re-add `add_menu_page()` or `remove_submenu_page()` here —
  `tools/test-scope.php` scans for both with comments STRIPPED (a grep over
  raw source passes on a file that still calls them and fails on one that
  only explains why it does not). This plugin registers its submenu at
  `Menu::PRIORITY` = 40. Live register, mirrored from dcc-menu.php's header:
  20 contact-form · 30 guest-guide · 35 features-amenities · 40 seasons ·
  45 cottage-selector · 50 custom-checkout · 55 availability-calendar ·
  63 wildlife.
- **The inline config cannot be shrunk by much, and the themes table cannot
  move cheaply.** Measured at 4.1.2: the whole payload is 14,039 raw / 2,997
  gzipped; moving the ambient half into the engine saves 1,494 gz, and
  moving the egg half into matrix.js as well reaches 2,286 gz total. That is
  the entire win, against a second hand-maintained copy of the theme
  definitions in the file where a desync draws nothing and says nothing.
  And it cannot be trimmed to "today's theme": the schedule resolves from
  the VISITOR'S clock so cached HTML stays date-agnostic, so the server does
  not know which theme is live. If this is ever worth doing, generate the
  chunk from the PHP at build time — do not hand-copy it.
- **Counts are QUOTA-picked since 4.2.0 — never go back to independent
  random picks.** Rob's counts are stated per sprite ("~3 doves", "cap 9"),
  and independent weighted picks only hit a mix ON AVERAGE: behaviours that
  never respawn (ornaments `hang` for good, palms stand where they grew) let
  one page draw five ornaments and no gifts. `pickSpec()` water-fills each
  sprite's share of the CURRENT total (`mixShares()`, per-sprite limit `n`
  held, the rest shared out again), then picks from the sprites below their
  exact share weighted by HOW FAR BEHIND they are, then from those below the
  share rounded up. Weighting the strict tier by theme weight instead left
  MLK's one phone dove on screen a third of the time. `tools/test-counts.js`
  models every touched theme and requires the live engine within ±1.
- **Phone scaling reads the VIEWPORT width, not the canvas.** In content
  placement the canvas is only the column, so a 1280px screen would never
  reach the full 16. `partTarget()`: round((16 - reserve) × clamp(innerWidth
  / 1280, 0.45, 1)); a theme `max` scales the same way but never below 3
  (`classic` keeps 1); `phoneMin` (Christmas: 5) overrides on < 768px. The
  ripple reserve is NOT scaled. `fitParts()` re-targets on a real resize,
  never mid-scene (`endVig()` calls it). On a phone a scene borrows at most
  ONE sprite (`startVig`). Rob's density setting is never touched.
- **Nothing of the engine is fetched before the window LOAD event
  (4.12.1).** The Director's audit of live 4.12.0 caught the engine's
  request going out ~1.9 s into an iPhone load, while the hero photograph
  and the booking widget were still coming down: the loader asked
  `requestIdleCallback(go, {timeout: 3000})` and, where that does not exist,
  `setTimeout(go, 1500)` — and BOTH can fire before load. (The brief's
  premise that Safari lacks requestIdleCallback is out of date: Safari 16.4,
  March 2023, shipped it, so current iOS takes the idle path and iOS 16.3
  and older take the timer. The gate is the right fix either way, and it
  removes the difference between them.) `ambient.js` now arms on `load`
  (or at once if `readyState === 'complete'`), and then takes whichever
  comes first of `START_DELAY` = 400 ms (then `requestIdleCallback` with a
  1 s timeout where the browser offers it) and the visitor's first
  `scroll`/`pointerdown`/`touchstart`/`keydown` — capture + passive, removed
  as soon as one fires. `LOAD_NET` = 10 s arms anyway, because a page whose
  last image never resolves never fires `load`; it is a failure mode, not a
  path. Once running, every effect is byte-identical.
- **The inline config carries only the themes a page served TODAY could
  need (4.12.1).** `Themes::reachable()` keeps the themes the schedule
  resolves to from YESTERDAY to today + `Themes::WINDOW_DAYS` (14), plus
  `Schedule::BASE_THEME` and `classic` — the two silent fallbacks in
  `ambient.js` (the resolved key at line ~156, the egg's palette at
  ~317). Yesterday is in because the resolver runs on the VISITOR'S local
  date, which can be a day behind the server's. Measured: 3-6 themes in
  practice, the config 16.0KB raw / 4.0KB gz → ~8.2KB / ~2.4KB.
  **This is the one thing in the plugin a PAGE CACHE can outlive**: HTML
  cached today and served after the window has run out resolves to a theme
  the config no longer carries, and the loader quietly shows BASE_THEME —
  a visible wrong season, which is why the window is 14 days and not "a few
  days". Widen it with `dcc_seasons_theme_days`. An admin preview (and a
  Theme guide `?dcc_season=` link) still receives its theme in full,
  whatever the date: `Plugin::config()` adds it back after the trim. The
  Theme guide builds its own full table (`Theme_Guide::payload()`), so it is
  unaffected. `tools/gen-config.php --window[=N] [--today=Y-m-d]` mirrors
  the trim for the suites; everything older still sees all 27.
- **The engine is 182KB raw / 65KB gzipped, not "96KB" (corrected in
  4.12.1).** That figure was in `readme.txt`, `ambient.js` and
  `class-plugin.php` and had been stale since 3.6.0. Quote the size
  baseline above, and re-measure.
- **The falling sprites paint at 30 fps since 4.12.2 (Rob's pick from the
  4.12.1 side-by-side).** He watched A (60) against B (30) and chose B.
  - **Paced by ELAPSED TIME with the remainder CARRIED, never by counting
    frames.** The gate is `t - lastDraw < pc - 1`; the anchor then advances
    `lastDraw + pc` while it is keeping up and restarts from `t` only when
    more than one period late (a waking tab, a long task), so the carry can
    never become a backlog. Three reasons, all the Director's and all
    tested: frame-skipping gives 60 on a 120 Hz iPhone Pro; the 1 ms
    tolerance is what stops the cap STACKING on Low Power Mode's own ~30 Hz
    rAF throttle and halving it to 15 (a 33.3 ms frame clears a 32.3 ms
    gate); and a display whose interval is not a whole fraction of 33.3 ms
    (75 Hz) would settle on the next whole multiple, 25, without the carry.
  - **Motion is still stepped by REAL elapsed time**, so every speed in
    px/s is unchanged — `lastPageT` was split from `lastPage` for exactly
    this: `lastPage` is the schedule anchor (carried), `lastPageT` is when
    the canvas actually last painted, and `pdt` uses the latter. Proven on
    the mocked clock with a seeded field: three seconds of travel is 463.7
    px in 60 steps and 463.6 px in 30 (0.02%; worst single sprite 0.16%).
    Compare PATH LENGTH, never net displacement — a bat's net displacement
    over 3 s depends on where it is in its wiggle and read 19 px against 36
    between the two cadences, which looks exactly like a speed regression
    and is not one.
  - **Flyers, scenes and the rest keep the full rate, and nothing was added
    to keep them apart.** The separation is the ORDER of the tests in
    `pace()`: hero, scene, burst, ripple, transferred background, footer
    clip and the Earth Day turn are all asked FIRST and return 0, and a SKY
    flyer or scene keeps the rate through `skyBusy()`, which overrides
    `pace()` beside it. Only a frame whose sole moving thing is the sprite
    field reaches the cap. The idle drop and the hidden-tab stop are
    untouched.
  - **Cost, re-measured on the shipped build** (`measure-sprites.js` in the
    scratchpad; mean of three 8 s runs, main-thread task time, same
    machine, 4.12.1 against 4.12.2): see the release checklist. The 4.12.1
    round measured phone (390, 3x, 4x CPU) 901 → 532 ms/s at the top of the
    page and 918 → 498 scrolled to the foot; desktop (1280, 2x) 530 → 273
    and 510 → 282.
  - **Tests**: `tools/test-sprite-rate.js` (23 checks) puts a SHIM in place
    of requestAnimationFrame, driven by a continuous ticker at 60, 120, 30
    and 75 Hz — a timer started per request would hide a build that paced
    itself by asking late — and counts the engine's own clears at 390 and
    1280; plus the flyer at 120 Hz on both canvases, and the travel
    comparison above. `tools/test-pacing.js` gained the sprite-rate,
    flyer-rate and hidden-tab-with-sprites cases, and its
    no-IntersectionObserver case now expects ~30 rather than ~60 because
    ambient is on there. Mutation-checked four ways: the cap removed,
    every-other-frame instead of elapsed time (21 fps at 60 Hz, 15 at 30 —
    the stacking failure itself), the cap applied to flyers, and the idle
    drop lost.
- **The always-60 fps loop was MEASURED for the Director in 4.12.1 and not
  changed in that release (Rob then picked the cap; see 4.12.2 above).** `pace()` returns 0 while any sprite is
  live, so with the ambient layer on the loop runs at full rate for the
  whole visit, scrolled anywhere (the fixed full-page canvas is always "on
  screen" to the IntersectionObserver — that part is by design). Capping the
  sprite layer at 30 fps in a scratch build measured, same machine, mean of
  three 8 s runs, main-thread task time: phone (390, 3x, 4x CPU) 901 → 532
  ms/s at the top and 918 → 498 scrolled to the bottom; desktop (1280, 2x,
  no throttle) 530 → 273 and 510 → 282 scrolled down. Biggest step a sprite
  takes between repaints goes from 2.0-2.2 px to 2.7-3.0 px. ("Scrolled
  4,000 px" is the foot of the page: the fixture stops at 3,149 px on a
  phone and 1,667 px at 1280 — the cost does not depend on the offset,
  which is the Director's point.) Reported with a real-time
  side-by-side recording, from which Rob picked B.
- **Since 4.12.0 the Director's queue owns the timing where it exists.**
  Hero Effects 3.16.2 gives a visit ONE queue per tab (sessionStorage
  `dcc_moments`, Rob's order: the Seasons moment, the seaplane, its heron,
  the fish and rod), because nobody stays on the header long enough to see
  them one after another. We register at SCRIPT RUN — top of engine.js,
  before any image or idle work: push to `window.DCCMomentsPending` AND
  call `DCCMoments.register` when it is already there, which is the
  Director's snippet, so the queue must dedupe by object identity. The
  hooks are installed later by `start()` (`momentHooks`); until then
  ready() is false and play() finishes at once.
  - **The moment** = this page's scene, then a breath (`TIMING.breath`),
    then its flyer, both in the header picture (4.10.7 stands).
    `momPlay`/`momStep` is a four-stage machine driven from the frame loop
    on visible time; `done()` fires exactly once (`fired`), and either half
    may decline without taking the other with it.
  - **Whether the header is in view is asked ONCE**, when play() is called
    (`mom.inView`): the queue only calls while it is in view, and Rob's
    "don't abort if the visitor scrolls away" means a scroll must not cut
    the moment short.
  - **`momentsOn()` parks everything of ours**: `vigAt`/`heroAt` stay INF,
    `nextTurn()` returns at once, `stepVig`/`stepHero` never self-start,
    and the first-page rule is never consulted — which is why `firstPage()`
    is now LAZY: reading it WRITES `dcc_seasons_visit`, and under the queue
    that would spend the visit's first page on a turn we never take.
  - **Our net is 50 s of visible time** (`MOM_CAP`), inside the queue's own
    60. Rob's budget is "about 30 s or less", and `tools/measure-moment.js`
    measured a phone moment at 14-24 s and a 1280 px one at 25-44 (Florida
    Keys, its longest scene and the osprey): the flyer crosses the header
    picture's whole width at the speed Rob chose, so a wide screen takes
    longer. Reported to the Director rather than trimmed, because cutting a
    flyer off mid-flight is the one thing a guest would see.
  - **The heron yields** (`heronOff()`, Rob's pick): where
    `window.DCCHeroFx.heron === true` the Hero Effects heron is on and ours
    stands down — read at every choice (`heroPoolNow()`), never cached, and
    the hnCache idle pre-build is skipped, including when the flag arrives
    late. A theme-less day then has no flyer and NO substitute bird;
    `CFG.heroOnly` (a preview or a debug knob) still forces it.
  - **Tests**: `tools/test-moments.js` (47, a stand-in queue in both load
    orders) and `tools/test-moments-browser.js` (18, both plugins on the
    homepage at 390 and 1280). Mutation-checked nine ways, including the
    self-timer firing under the queue, late registration, done() twice or
    never, aborting on scroll, the flyer dropped, the heron picked with the
    flag on, a substitute bird, and the no-queue path broken.
- **Heroes AND scenes run on VISIBLE time (`vt`), one scheduler, since
  4.8.0.** `heroAt` / `vigAt` are due times (INF = not its turn);
  `nextTurn()` runs when either leaves. First page of a visit
  (sessionStorage key `dcc_seasons_visit`) → scene 6-10 s, hero 2 s after
  it ends (4.9.0); later pages, or storage blocked (`firstPage === null`)
  → scene 6-10 s; no scene → hero 6-10 s.
  Until 4.8.0 scenes ran on wall-clock `t` with their own `vigNext`, so the
  two could not take turns. Debug knobs: `heroFirst` (s, any page),
  `heroEvery` (s, the gap after a hero), `vigFirst`/`vigGap` (ms).
  `tools/test-timing.js` walks every theme, first and later page, and
  Christmas evening, on the mocked clock. `window.DCCHeroFx.state` is the
  home-page hero-image show's contract (dcc-hero-life 3.11.0+: `none |
  busy | done`, plus a `dcc:herofx` event): no hero STARTS while busy;
  busy → done → the first hero 2s later; busy that never ends is ignored
  after 70s of visible time. A hero's departure is recorded in the frame it
  leaves (`heroGone()`); recording it on the next frame's hero step made a
  scene that started in between look like an overlap in the logs.
- **The suites have a mocked clock.** Debug builds only (`--diag`):
  `CFG.vtScale` speeds the hero clock (70s proven in seconds);
  `_state.manual(true)` stops the rAF loop and `_state.tick(ms, n)`
  advances the engine exactly — `tools/test-scenes.js` plays every new
  scene through tick by tick, and `test-heroes.js` proves hero/scene
  exclusion over 360 simulated seconds the same way (it used 60s of WALL
  time first and failed with zero overlaps: a loaded machine ran too few
  frames to see three of each — count events on the mocked clock, never on
  wall time); `CFG.vigOnly` forces one scene; `heroLog` /
  `vigLog` record starts, ends and sprites borrowed. None of this exists in
  the minified build (`__DCC_DEBUG__=false`).
- **Earth Day's globe carries `xa`, and since 4.3.0 that means TURNS.**
  While the accent is mounted the xa spec is held out of the pool
  (`xaSp`) and `stepTurns()` (called after `vt` advances) converts ONE
  live free-air particle into it on the odd 45 s turns, and fades it back
  out on the even ones. Counts never change: it replaces, never adds. It
  restores the accent's OWN inline opacity (`_dccOp`, .55 for the hands) —
  restoring '' left the hands at full opacity, which test-heroes caught.
- **No scene or hero draws an emoji since 4.3.0** except the St. Patrick's
  rainbow's ☘ (Rob's exception) and the fishing worm glyph. witchmoon,
  arrival and duckparade are drawn (Rob's W-A/F-A/D-A).
- **The Theme guide (4.4.0) is GENERATED, and the engine is its source.**
  `Theme_Guide::payload()` sends the theme config, saved settings and each
  theme's days walked through `Schedule::active()`; `theme-guide.js` reads
  everything else from `DCCSeasonsEngine.guide` — SVGS/PRIMS, ACCENTS,
  VIGS + EVENING_VIGS, HERO_ART/SCENE_ART/HERO_GLYPHS, TIMING, and the
  pure counting rules `partTargetFor`/`specLimitAt`/`sharesAt` and
  `subtleKit()`, which 4.4.0 hoisted out of `start()` so the engine and the
  guide call the SAME code. The only hand-written table is
  `Theme_Guide::names()` (translatable names); `tools/test-guide.js` fails
  if anything shown lacks one, and `validate-paths.js` fails if a scene or
  hero has no guide picture. A new scene needs a SCENE_ART entry and a
  name. Inside `subtleKit` the context is `kitG`, never `g`: effects
  declare their own `var g` for gradients, and a shadowed `g` broke bokeh
  on the first try.
- **Each engine layer has its own switch since 4.5.0 (Rob, 2026-10-06).**
  The `ambient` option ("Falling and drifting sprites") empties the sprite
  pool and nothing else (`CFG.ambient === false` in engine.js; boats,
  birds and the xa globe are sprites too, so Earth Day's hands stay up).
  The engine loads on `CFG.engine` = `Settings::engine_needed()`: ambient,
  OR subtle at an intensity above 0, OR richness other than 'minimal'
  (heroes). Accents need richness 'full'; scenes 'full' + fx_vignettes;
  heroes not 'minimal'. `should_load()` uses the same rule, so the loader
  and the server cannot disagree. Until 4.5.0 `ambient` gated the whole
  engine and live showed nothing but the egg for weeks while its
  background layer was "on". Measured cost of the engine with ambient=0,
  subtle=1 (Halloween, `tools/measure-perf.js`, headless, unthrottled):
  ~50 ms/s main thread at 390px and ~115 ms/s at 1280px over the 4.4.0
  baseline (engine not loaded), 60 fps throughout; mostly canvas paint,
  12-16 ms/s script. `tools/test-switches.js` proves every layer's gate.
- **The frame loop is PACED since 4.6.0 (Rob: "lighter, same look").**
  `pace()` picks the next repaint: 0 (full rate) whenever a hero, scene,
  live sprite, ripple, burst, xa turn, transferred bg fill or footer clip
  is on the canvas; `SLOW_MS` (30 fps) when only the subtle layer moves;
  `IDLE_MS` (250 ms, no clear at all) when nothing is drawn. `next()`
  sleeps on a TIMER until a slow repaint is due — a rAF every vsync that
  returns at once still makes the browser produce 60 frames a second, and
  that was most of the remaining cost. **Every repaint clears the WHOLE
  canvas since 4.10.6** — never go back to partial clears: 4.6.0's
  `dirtyBoxes` (clear only the subtle particles' boxes) were cheaper on a
  CPU-drawn canvas, but on a GPU-drawn one (Mac, iPhone, Android) a clear
  that leaves pixels standing makes the browser copy last frame's whole
  canvas first; a full clear lets it discard. Measured with Chromium's GPU
  canvas on SwiftShader, 1280 px at 2x: 23 vs 46 page fps. The CPU-drawn
  case pays +35% main thread for it (116 → 158 ms/s at 1280 2x, 261 → 343
  at 390 3x 4x CPU, background window). Drawing stops off screen
  (IntersectionObserver) and when hidden, EXCEPT while the canvas is out
  of the document AND a re-mount is still possible (behind layering, under
  20 tries) — so `ensureMounted()` can put it back. In front mode nothing
  re-mounts, so a removed canvas stops the loop (4.6.1; it drew into a
  detached canvas for the rest of the visit before). **At the re-mount cap,
  set `running = false` directly — NEVER call `setRunning()` from inside a
  frame:** it calls `play()`, which requests a frame on top of the one
  `next()` requests, and with no IntersectionObserver (onScreen stuck true)
  every frame doubled — 4.6.1 measured 65,536 then 786,432 requests a
  second, a frozen tab. Fixed in 4.6.2; `test-pacing.js` deletes
  IntersectionObserver and proves it. A test of the common browser only is
  how 4.6.1 shipped it. 30 fps is
  "visually identical" on measurement: every effect steps at most 1.54px
  and 4.5deg per repaint. **Rob's decision (2026-10-06): option A, 30 fps
  stays. 20 fps (embers 1.7px, confetti 2.3px; 79 ms/s at 390px x4) was
  rendered side by side for him (artifact MDrM4k7N887m7ST2dMg6kg, kept as
  the record) and DECLINED. Do not build or re-propose it.** He watched
  4.6.0 on his phone and it looks good. (Live Scope is "no_cottages" —
  the Director, 2026-10-10; the 4.6.x checklists' "Homepage only" was
  wrong. Scope is a setting, not a release.) `tools/test-pacing.js` proves no trails,
  the rates and every pause; the mocked clock (`_state.tick`) always does
  full clears, so only the real-rAF suite exercises this path. Measured
  (`tools/measure-perf.js`, Halloween, ambient=0, subtle=1, background-only
  window): 390px at 4x CPU 209 -> 128 ms/s; 1280px 99 -> 55 ms/s.
- **The settings-page preview panel is gone (4.5.0)**; `Preview` keeps
  only the front-end chip. `tools/render-settings.php` now fires the
  plugin's own `admin_notices`, so a render shows what WordPress prints.
- **Screenshots of the settings page:** `php tools/render-settings.php
  [--tab=guide] [--opt=file.json]` renders the REAL page on WP stubs;
  `node tools/shot-settings.js page.html out.png 1280 [selector]` captures
  it. The frozen 1280px schedule table was proven pixel-identical for
  4.4.0 this way (hide `.dcc-seasons-tabs` so it sits at its old offset).
- **The egg's 'YEAR' is a token, in `glyphs` AND as `finale` (4.6.1).**
  `matrix.js` `targetYear()` = this year until June, the next from July,
  from the visitor's clock; `expand()` turns a 'YEAR' glyph into its
  digits. New Year's carried a literal '2','0','2','7' until 4.6.1, which
  would have shown 2027 at New Year's 2028. `theme-guide.js` mirrors the
  rule for its picture. Never type a year into a theme.
- **The suites load the READABLE sources unless the config says `--min`.**
  `tools/fixture.js` picks `ambient.min.js` only for a `--min` config
  (since 4.6.2; before, no suite ever ran the shipped loader), and only
  `test-min.js` and `test-front.js`'s egg check pass `--min`. A change to
  ambient, matrix or engine is not proven in what ships until one of them
  exercises it. And finish the suite on the FINAL code before committing:
  4.6.1 was committed while suites were still running on half-old code.
- **Wall-clock waits in a browser suite are load-sensitive — use the
  mocked clock.** `test-orphans.js`'s letter check sampled 11 s of real
  time and failed under load (4.6.1 audit); it now ticks 90 simulated
  seconds. Same trap as `test-v21.js`'s bass check.
- **No weather coupling.** Weather-driven rain/fog has been proposed and
  explicitly declined by the owner. Do not offer it again.
- **`?dcc_debug=1` as an administrator** prints an on-page diagnostics panel with
  the backdrop-host decision and the content column's ancestor chain. Ask the
  owner for that text before theorising about the live layering.
- **Uploading a new zip does not purge the page cache.** The client config and the
  `?ver=` asset URL are both baked into cached HTML, so the site keeps serving the
  previous build. The plugin purges itself on a version change, but verify after
  any manual/FTP deploy.
