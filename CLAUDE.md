# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Site context

**Read `SITE-CONTEXT.md` at the start of every session.** It contains the full
doracanalcourt.com site architecture: installed plugins + versions, MotoPress data
model (cottage IDs, room type IDs, booking counts), iCal OTA feeds, cache stack,
security findings, and gotchas that affect every plugin built for this site.
(`SITE_CONTEXT.md`, with an underscore, is an older general-purpose developer
reference kept for its lessons-learned sections; where the two disagree,
`SITE-CONTEXT.md` is newer.)

Key facts from that document that affect this plugin:
- DB table prefix: `portal_` (not `wp_`)
- The eight cottages are 22, 23, 31, 32, 33, 34, 35, 36
- Site runs WP 6.9.x / PHP 8.3.x on HostGator with SpeedyCache Pro

## Repository purpose

A single WordPress plugin — **DCC Cottage Selector** — a mobile-first decision tool
that helps guests choose among the eight Dora Canal Court cottages by focusing only
on their real differences. It lives at `dcc-cottage-selector/` and provides two
Elementor widgets (the full Selector and a compact Mini Entry) plus a
`[dcc_selector_entry]` shortcode. Static data, fully client-rendered. The repo has
no build step.

**One runtime request, and only when asked for.** Since 0.24.0 the widget can
check availability for guest-supplied dates. It is OFF by default; when a widget
turns it on it POSTs to the MPHB Availability Calendar plugin's public read-only
endpoint (`admin-ajax.php`, `action=mphbac_query`, no nonce by design so
full-page caches cannot serve a stale one). With the switch off the plugin still
makes no requests whatsoever.

The request/response contract was recovered from this repo's git history (the
0.9.x calendar, before deletion) and then **verified against the live calendar
0.23.3 (2026-09)** — unchanged. Request: POST `from`, `to`, `room_type_ids[]`.
Response: `{success:true, data:{rooms, availability:{"<roomTypeId>":{"Y-m-d":
"available"|"booked"}}, from, to, bookedThrough}}`. dom-smoke test 67 pins the
request shape, so if the calendar ever changes it, that test fails first.

**The MPHB Availability Calendar is no longer in this repo.** It is maintained in a
separate session (live 0.23.3); the copy that used to sit at
`mphb-availability-calendar/` was stale 0.9.x and was deleted so nobody could ship a
regressive install from it. It remains in git history if you ever need it:
`git log --oneline -- mphb-availability-calendar` then
`git checkout <sha> -- mphb-availability-calendar`. Do not resurrect it as the
authoritative source — that lives elsewhere.

## Target environment

- WordPress 6.0+ (deployment site is on 6.9.x)
- PHP 8.0+ (deployment site is on 8.3.x; codebase uses 8.0-compatible syntax)
- Elementor (free, 3.5+)
- Hosted on HostGator shared hosting alongside SpeedyCache Pro

## Common commands

```bash
# Syntax-check every PHP file
find dcc-cottage-selector -name '*.php' -print0 | xargs -0 -n1 php -l

# Tests (see "Testing" below) — both must be green before shipping
php tests/test-design-snapshot.php     # PHP: snapshot/mirror core, preset, controls
node tests/dom-smoke.test.js           # jsdom: the real controller against real config
npm test                               # runs both

# Regenerate the translation template after ANY visible-string change
php tools/makepot.php

# Rebuild the front-end bundle after ANY change to a JS source. `npm test` runs
# `--check` first and fails loudly if the committed bundle has gone stale.
php tools/build-bundle.php

# Build the deliverable zip. Read the version from the plugin header first.
( cd $(git rev-parse --show-toplevel) && zip -rq "Cottage Selector 0.34.0.zip" dcc-cottage-selector -x '*.DS_Store' )
```

## Naming files handed to the user

Two different conventions, and the difference is deliberate:

- **Plugin zips: `Cottage Selector <version>.zip`** — no dash. Example:
  `Cottage Selector 0.34.0.zip`. This is the long-standing format and the one the
  user's installed-build history is named in; a dash here breaks that run.
- **Everything else: `Cottage Selector - <what it is>`** — screenshots, frame
  strips, markdown, exported JS, anything that is not the build. The user collects
  these outside the repo alongside deliverables from the other DCC plugins, and the
  prefix is what keeps them sorted and identifiable without opening them.

## Releasing

- **Any change that reaches a zip requires a version bump**, even patch-level. The
  site has no other way to distinguish builds, and two different builds sharing a
  version number has burned us before. Bump the plugin header `Version:`, the
  `DCCS_VERSION` constant, and the readme `Stable tag:` together, and add a
  changelog entry in `readme.txt`.
- Repo-only changes (docs, `.gitignore`, tests) do NOT need a bump — nothing that
  ships changed.
- The repo has **no git tags**, so "what shipped last" is reconstructed from commit
  messages. Tagging releases would make that a one-line `git describe`.

## Architecture

Single-folder plugin, PSR-4-ish layout under a `DCCS\` namespace. Bootstrap →
lazy autoloader → Plugin singleton.

```
dcc-cottage-selector.php             # Headers + constants + lazy autoloader + boot
includes/class-plugin.php            # Singleton; registers category, widgets, assets, hooks
includes/class-selector-widget.php   # The main Elementor widget; ~all controls live here
includes/class-mini-entry-widget.php # Subclasses Selector_Widget; also the shortcode
includes/class-config.php            # ALL user-facing strings + the data-config builder
includes/class-data.php              # Read layer over data/cottages.json
includes/class-preset-defaults.php   # Site preset: control defaults a NEW widget starts from
includes/class-control-design-io.php # Custom Elementor control for the text export/import
data/cottages.json                   # SINGLE SOURCE OF TRUTH for cottage attributes
assets/js/dccs.js                    # GENERATED bundle (the only script that ships)
assets/js/availability.js            # The only runtime request: date-range availability
assets/js/score.js                   # Two-phase scoring engine (hard filters, then weights)
assets/js/labels.js                  # Badge + "why this fits" key allocation
assets/js/selector.js                # Front-end controller; renders every mode
assets/js/editor-io.js               # Editor-only: the dccs_design_io control view
assets/css/selector.css              # CSS custom-property driven
```

Request flow: `Selector_Widget::render()` emits only a shell with the full config
(cottages + every string + icons + CSS vars) serialized into a `data-config` JSON
attribute; `selector.js` renders all three modes client-side. Nothing is fetched at
runtime.

## Invariants that must hold

Deliberate decisions. Don't "fix" them without checking with the user.

- **`data/cottages.json` is the single source of truth.** Filters compare data
  fields (`c.guests >= 3`, `c.petAllowed`), never hard-coded cottage-ID lists.
- **The JS holds zero display strings.** The engine works in data keys; every
  visible string comes from `Config::strings()` via `data-config`. A key the engine
  emits with no string behind it fails *silently* (`.filter(Boolean)` drops it) —
  this shipped a missing "why" reason for five releases. Test 47 in the dom-smoke
  suite derives the emittable keys from the live engine and guards this.
- **Every visible string must be translatable.** Text domain `dcc-cottage-selector`;
  the site uses Loco Translate. Never echo a raw user-facing string.
- **No fee amounts anywhere in this plugin.** The capacity and pet notes describe
  that a fee applies, never how much; amounts have one source of truth elsewhere on
  the site. There is a grep check for `$` in the test suite.
- **Per-cottage `highlights` are owner-supplied facts only.** Never invent
  amenities. No canal views, boat slips, or dock access — none is confirmed.
  Distance to the canal is an ordering ("closest", "second-closest"), never
  "waterfront vs not".
- **Two cottages are "identical" only when the CARD shows the same thing** —
  `signature()` folds the highlights in alongside the comparison-matrix fields
  (0.22.6), because 31 lists a paved sun area that 32 genuinely lacks. Editing a
  cottage's `highlights` can therefore make a pair stop or start being twins.
- **The identical-layout note is a fact about the GROUP, not a remark from one
  tile.** `dedupe()` sets `duplicateGroup` — every member's id, ascending — on
  EVERY member, so the same sentence renders on every tile in the group and a
  group of three names all three. Until 0.36.0 it set `duplicateOf` on the
  lowest-id member only, pointing at one sibling: the other twin showed nothing,
  and a trio would have named one partner and silently dropped the other. A group
  of one is not a duplicate and is left unmarked. The note is built from the
  CURRENT display list, so it never names a cottage that is not on screen.
- **The Elementor widget category is `dcc-widgets`** ("Dora Canal Court") — the slug
  every live DCC plugin registers. Elementor groups the panel by *slug*, so any
  other value creates a duplicate "Dora Canal Court" section (the 0.17.1 incident).
  Surviving `claude-code` mentions are historical: a warning comment and past
  changelog entries recording what those releases did. Leave them.
- **Never publish a shared design from the editor.** No control sets `render_type`,
  so the Elementor preview re-renders server-side on every keystroke;
  `Selector_Widget::render()` skips publishing when `in_editor()` is true. The
  `elementor/document/after_save` hook is the only publisher, and it must never call
  `$document->get_elements_data()` — that recurses into Elementor's empty-document
  conversion and takes down the editor (the 0.19.5 fatal).
- **Availability never removes a cottage.** It re-orders and annotates. Free
  matches lead; a cottage that would have been a top match but is booked is still
  listed, marked, with a calendar link. Any failure fails OPEN — rank as if no
  dates were given, show a note, never blank the results.
- **A settled availability status is final for that date range, including an
  error.** The lookup's resolve handler calls `rerender()`, which calls back into
  the lookup; retrying on error loops forever and hammers the endpoint exactly
  when it is already failing (caught pre-release in 0.24.0). Only a new date
  range starts a fresh attempt.
- **Async tests must be registered with `defer()`** in `tests/dom-smoke.test.js`,
  not run as bare `(async () => {})()`. The summary prints synchronously, so a
  bare async block's assertions are silently uncounted — ~26 of the 0.24.0
  availability assertions vanished that way before this was fixed.
- **Score ties break on a daily rotation, never on cottage ID** (`crit.rotation`,
  chosen once per page load in `defaultState()`). Tests that read result ORDER must
  either pass an explicit `rotation` to `score.run()` or assert on the engine's
  full result set — two assertions passed vacuously for releases because an ID
  tie-break happened to put 22/23/31 first.
- **Switching modes resets everything except the highlight** (`resetForMode()`):
  answers, weights, compare picks, navigation. The modes are independent tools.
  `resetForMode()` clears LIVE state only and must never touch the remembered
  compare picks: its two callers mean different things. Entering a mode from the
  landing is the first entry of a visit and RESTORES the picks; choosing a different
  mode from the dropdown is a switch and clears them. Conflating the two wiped the
  picks on the way in and made the feature impossible (caught in 0.33.0).
- **Compare picks persist for the visit; nothing else does.** `sessionStorage`,
  keyed per widget instance off Elementor's `data-id` (index fallback, `:modal`
  suffix for the pop-up), so the homepage and /cottages/ keep separate lists. An
  explicit `?compare=` deep link still wins — a link someone was sent beats what
  this browser happened to tick. Every storage call is wrapped: private mode and
  disabled storage must degrade to "does not persist", never throw. Quiz answers
  are still never persisted.
- **Weigh Priorities is disabled on the live widget** (preset `enabled_modes` is
  quick + compare) and the owner considers it redundant with the quiz. Keep it
  working and tested, but don't invest in it without asking.
- **The heading is plain type. `class-heading-marks.php` is PARKED — nothing may
  render it.** The drawn marks were retired in 0.29.0 after four rounds, for a
  structural reason worth remembering: a 38px pictogram cannot carry "cottage" and
  "wizard" and "canal" at once, and at that size it reads as a puzzle rather than a
  thing. The file stays for its notes on what survives at 22px (why the brim not the
  cone carries the hat; the three ways a beard failed) — read them before drawing
  anything for this widget at heading size. A PHP test tokenises the plugin and
  fails if any CODE references the class again; the comment in `Config::build()`
  recording how to bring it back is deliberate and must survive that check.
  Its own header still points at `assets/js/cast.js` as where the character went.
  That file left in 0.34.0 and the animation now lives in a site mu-plugin; the
  parked file was left untouched on instruction, so treat that line as history.
  **The heading renders as bare text** — the `.dccs-heading-t` / `.dccs-heading-w`
  wrappers existed only for the marks and the cast's word-bob and went with them.
  Verified byte-identical geometry at 375px and 1280px across the removal.
- **Animations, if any are ever added back, are transform and opacity only.**
  0.32.0 widened this to "and a path's `d` recomputed per frame", purely so the
  cast's fishing line could be drawn, and recorded it as a deliberate carve-out
  rather than absorbing it. The cast moved to a site mu-plugin in 0.34.0 and the
  carve-out went with it: nothing in this plugin writes path data, uses
  `stroke-dashoffset`, or declares a keyframe any more (checked, not assumed). The
  narrow rule is the one in force — a future animation does not inherit permission
  the cast earned. Never animate a layout property.
- **The dates step is governed by the `avail_enable` control, not by code.** It is a
  switcher defaulting to off and deliberately absent from the preset, so a widget
  that never stored it shows no check-in/check-out question at all. There is no
  second switch — adding one would create exactly the two-copies-must-agree hazard
  the preset notes warn about. A widget that HAS saved `avail_enable=yes` can only
  be turned off in its own Elementor panel.
- **Colours come from the site's existing palette.** The owner keeps a list of the
  hexes already in use and prefers an existing one over a new one, so the site stays
  visually consistent. It is a starting guide, not a permitted-colours list: if a
  design genuinely needs a value that is not on it, propose the hex explicitly and
  say why rather than introducing it quietly. 0.34.0 replaced `#8E1838` — asked for
  in an earlier round, then not recognised, and not a site colour — with `#bc003e`,
  the sticky-menu link red.
- **The Elementor kit styles `input:focus` and will beat a rule that has no focus
  variant.** It sets `accent-color: #F4DA62` at (0,4,1); the plugin's checkbox rules
  were (0,3,1) with no `:focus`, so both compare checkboxes turned gold for exactly
  as long as they held focus. The fix is (0,5,1) — root×2 + wrapper + `[type]` +
  `:focus` — which WINS rather than tying and depending on load order. Anything the
  kit styles on a state the plugin only styles at rest is the same trap.
  The boxes also carry a real 2px focus ring, offset clear of the control: that gold
  had accidentally been their only focus signal, and removing a colour that was
  doing an accessibility job without replacing it would have been a regression.
- **A result tile's body copy declares its own weight and its own list geometry.**
  Neither `.dccs-why` nor `.dccs-highlights` declared `font-weight` before 0.36.0,
  so both inherited the page's — bold, on the live site — and nothing in this
  repo looked wrong. An inherited value loses to any rule matching the element
  itself, so a plain (0,3,0) declaration settles it wherever the widget is
  dropped; that is why the fix needed no specificity games. The bullets use
  `list-style-position: inside` because the page centres the text: with the
  default `outside` the markers stay at a fixed x while each line centres
  independently, stranding every marker a different distance from its own text
  (measured: 105-146px at 375px). `inside` puts the marker in the line box so it
  travels with the text. **The page's `text-align` is not this plugin's to set** —
  nothing here centres the card, and the fix deliberately preserves whatever the
  page inherits rather than left-aligning to dodge the problem.
- **The site button spec lives in `--dccs-btn-*` tokens** at the top of
  `selector.css` (20px / 500 / 50px line-height / 0.5px / no transform, white on
  `#006BCF`, 30px radius). State the spec once there; don't restate numbers in
  per-button rules. **There are exactly two agreed exceptions, both asked for by the
  owner and both documented in place.** (1) The answer chips are `font-weight: 600`
  rather than the spec's 500 (0.32.0) — weight only, every other property still from
  the tokens. (2) The Compare /
  Compare N button is `--dccs-compare-red` (#bc003e, 6.55:1 on white), pairing it
  with the compare checkbox label that wears the same red. It stays inside the
  shared skin rule so only its BACKGROUND differs — it hovers to
  `--dccs-btn-blue-hover` (#F08080) like every other button. The hover harness knows
  about the exception rather than being silenced. `font-family` is `inherit`, not a named stack, so it survives a
  theme font change — that is deliberate, don't "fix" it.
- **Count specificity per selector, not per file.** `.dccs-root.dccs-root button` is
  **(0,2,1)** — two classes plus an element. That beats an Elementor kit's
  `.elementor-kit-N button` (0,1,1), which is all it has to do, but it does NOT beat
  this stylesheet's own class rules (`.dccs-root.dccs-root .dccs-chip` is (0,3,0)).
  0.26.0 recorded it as (0,4,1), which was wrong. Because of this, the button rules
  were REFACTORED onto the spec rather than overridden by a blanket rule — a blanket
  rule at (0,2,1) would have been silently inert wherever a class rule already set
  the property.
- **Hover selectors are DERIVED from the resting rule's selector list**, each with
  `:hover` and `:focus-visible` appended — never written as a parallel list. A
  pseudo-class adds exactly one class point, so a derived hover always out-qualifies
  its own resting rule; a hand-written one can lose, and then nothing applies and
  nothing in the CSS looks wrong. dom-smoke test 71 fails if the two lists drift.
  Hover is `--dccs-btn-blue-hover` (#F08080 on #FFFFFF). That is 2.59:1, chosen
  deliberately site-wide — do NOT darken it to satisfy a contrast checker, and do
  not add `opacity` to the hover, which would lighten it further. Keyboard focus
  keeps a 2px outline so focus is never signalled by fill alone.
- **Removing an Elementor control neutralises its saved values.** Elementor only
  generates CSS for controls a widget still registers, so dropping a control is
  sufficient — the stored values stay in the database and nothing reads them. This
  is why 0.27.0 removing `style_comparebtn_*` fixed the live widget with no panel
  edit (confirmed on live, 0.28.0).
- **Per-button Style sections outrank the spec.** They emit
  `{{WRAPPER}} .dccs-root.dccs-root .<class>` = (0,4,0). Anything preset there pins
  that button off the spec while everything else appears to comply — which is what
  `style_comparebtn_*` was doing to the Compare button before 0.27.0 removed it from
  the preset. A SAVED value on a live widget still wins and only the panel can clear it.
- **The modal's close button belongs in the header row, never floating over the
  scroll area.** `.dccs-modal-content` is the element that scrolls, and it fills
  `.dccs-modal-box` — so anything positioned against the BOX's right edge lands on
  the content's scrollbar wherever scrollbars take layout space. Pinned at
  `right: 8px` it overlapped a 15px band by 7px (0.35.0). The header row is a flex
  sibling above the content: the overlap cannot recur, the title stays on screen
  while the table scrolls, and the `padding-top: 54px` that existed only to clear
  the floating button is gone. **This class of fault is invisible on overlay
  scrollbars** — test it with `scrollbar-gutter: stable`, because headless Chromium
  ignores both `--disable-features=OverlayScrollbar` and `::-webkit-scrollbar`
  styling (both probed).
- **Anything outside `.dccs-root` gets neither the button rule nor the tokens.** The
  modal close button is pinned to the modal box, a sibling of the root, so
  `var(--dccs-text)` there resolves to nothing and the property falls back to its
  initial value. Every `var()` in a rule outside the root needs a literal fallback.
- **Elementor stores saved widget settings on the page, and stored values beat every
  plugin default.** A string edited in the panel before a release is frozen there; no
  plugin update can change it. Say so plainly rather than shipping a "fix" that
  cannot take effect.

## The shipped bundle

The front end loads ONE script, `assets/js/dccs.js`, generated by
`tools/build-bundle.php` from score / labels / availability / selector in that
order. **The sources are the source of truth; the bundle is generated and must
never be hand-edited.** Rebuild after touching any source — `npm test` runs
`php tools/build-bundle.php --check` first and fails if they have drifted, because
a stale bundle is worse than none: the repo and the site disagree while every other
test passes. The old per-file handles (`dccs-score` and friends) were removed rather
than aliased, so a stray enqueue cannot load a second copy of the same code.

## The site preset

`class-preset-defaults.php` holds control defaults a NEW widget starts from, captured
from the live site. Elementor merges saved settings over defaults, so changing a
preset value never affects an already-placed widget. Preset values are literal text
and bypass Loco, so **only add a key that was genuinely captured from a live widget** —
duplicating a `Config::strings()` default there just creates a two-copies-must-agree
drift hazard (it bit us in 0.22.2; the notes were removed from the preset in 0.22.3).

## Testing

There is no WordPress in this environment, so the suites stub what they need:

- `tests/test-design-snapshot.php` — the design snapshot/mirror core, registry
  pruning, preset↔control agreement. Its Elementor stub mirrors the real class
  signatures **including `final`**, so re-introducing the 0.19.0 "cannot override
  final method" fatal fails here instead of on the live site.
- `tests/dom-smoke.test.js` — boots the real JS against the real `data-config`
  (via `tests/dump-config.php`) in jsdom and drives every mode.
- A headless-Chromium accessibility/behaviour audit lives in the session scratchpad
  (not committed): overflow, 44px tap targets, WCAG contrast, focus management and
  nested-modal Escape at 320/360/768.

When a test asserts old behaviour that a deliberate change supersedes, update the
assertion — but check first that the premise still holds; several briefs in this
repo's history rested on premises the code had already moved past.

### Two standing rules for assertions

Four vacuous assertions have been found on this project in four releases. Both
rules below exist because of specific ones, and the failures were identical in
shape: a green result that could not have been red.

1. **Never trust a negative until the detector has produced a positive.** If an
   assertion says "X never happens", something in the same run must prove the
   check can SEE an X. The 0.29.0 harness asserted "no overlay ever entered the
   DOM" against a MutationObserver that `setContent`'s `document.open()` had
   detached — it was watching a dead node and would have passed however the code
   behaved. `glyphcheck.mjs` now parks a probe element on a glyph and asserts the
   detector reports it, and every sweep asserts it found the glyphs and the
   overlay elements before trusting a zero.
2. **Never match on text you wrote.** An assertion that greps for a comment, a
   class name or a string that the same change introduced tests nothing but your
   own typing. Assert on computed values, measured geometry or parsed structure.
   The corollary bit twice: a `/<selector>\s*\{[\s\S]*?<decl>/` regex whose lazy
   run crossed rule boundaries kept passing after the rule lost the declaration,
   and a keyframe/selector-list check anchored on the FIRST match found the
   reduced-motion block instead of the rule it meant. Bound the match, and anchor
   on the declaration rather than the first selector.

### Never undo a mutation with `git checkout`

Mutation-testing a new assertion means breaking the code on purpose and checking
the assertion goes red. Undo that with a **file snapshot** (`cp` the sources aside
first, `cp` them back after), never `git checkout -- <path>`: the release changes
are uncommitted at that point, so checkout reverts them too and every later
mutation then runs against the PREVIOUS release. It happened twice in 0.36.0 and
the second time it silently discarded a whole test suite's worth of new
assertions. The first symptom is a mutation that fails assertions it does not
touch — if that appears, stop and check `git status` before believing any of it.
Better still: commit the work as a checkpoint before starting the mutation round.

## Stylesheet structure

`php tools/css-lint.php` runs first in `npm test` and fails on any shipped
stylesheet with unbalanced braces or a declaration outside a rule block. It exists
because 0.31.0 shipped a stray `cursor: pointer; }` — left behind when a regex
removed the selector line above it — and **a CSS parser does not read an orphaned
declaration at the top level as a declaration**. It reads it as the start of a
selector prelude, which a semicolon does not terminate, so it consumed the stray
brace, a comment and the NEXT rule's selector before finding a `{`, then discarded
that rule as invalid. `.dccs-wizard-nav` lost `display:flex` and `gap:10px`, five
spacing complaints followed, and every test stayed green: the declarations were
still in the file, they were just never applied. Removing CSS by regex is how this
happened — prefer an exact block match, and the lint is the backstop.

## Visual design

`assets/css/selector.css` is custom-property driven on `.dccs-root`. Style controls
are override-only — the baked-in look lives in the stylesheet. Bravada's Elementor
kit resets inputs/buttons at `(0,3,1)`, so style-control selectors use the doubled
`.dccs-root.dccs-root` prefix to reach `(0,4,0)` and win. Markup carries each class
token once; the doubling belongs in the CSS selector, not the HTML.

## Git workflow

- Active branch: `claude/dora-canal-cottage-selector-qy12qf`. All Cottage Selector
  history lives here — **not** on `main`, which predates the plugin. Develop and push
  here; don't open a PR unless asked.
