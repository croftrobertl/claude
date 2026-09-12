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

# Build the deliverable zip. Filename MUST state the version (user convention),
# so a downloaded build is identifiable without opening it. Read the version
# from the plugin header first.
( cd $(git rev-parse --show-toplevel) && zip -rq "Cottage Selector 0.24.0.zip" dcc-cottage-selector -x '*.DS_Store' )
```

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
  (0.22.6), because 31 lists a paved sun area that 32 genuinely lacks.
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
- **The cast must not poll while it cannot cast.** Off screen or in a hidden tab is
  an event-driven wait — the IntersectionObserver and `visibilitychange` call
  `tick()` — so `tick()` returns without setting a timer. Before 0.33.0 it
  rescheduled unconditionally against a 200ms floor and woke five times a second
  for the life of the page; measured at 14 timers in 2.5s and climbing.
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
- **The cast (`assets/js/cast.js`) is decoration and must stay that way.**
  `aria-hidden`, `pointer-events: none`, absolutely positioned over the heading
  block reserving nothing, transform/opacity only (`stroke-dashoffset` for the line
  is the one allowed exception — paint-only, no layout). Under
  `prefers-reduced-motion: reduce` `attach()` returns null and builds NO DOM. The
  overlay must never be tappable: the Seasons easter egg counts taps on the
  masthead and the hero seaplane was made unclickable for the same reason.
  The fish is on EVERY cast (0.31.0 — three per page view is cap enough).
  Three casts per page view, then never; interaction stops it permanently.
  **The cast is RIGGED, not keyframed (0.32.0), and everything derives from the
  fish's MOUTH.** One rAF clock paints every frame; the line's endpoint, the lure,
  the ripple and the splash are all computed from that one point, and the lure is a
  CHILD of the fish group at its origin so it cannot drift. 0.31.0 ran the fish, the
  lure and the line as three CSS animations with three different easings and the
  fish rotating about its own centre: they came apart, the lure ended up on the
  fish's tail, and the ripple stayed where the lure first landed. Two independent
  answers to "where is the fish" is one too many — the same failure as measuring the
  glyph guard two ways. `rigcheck.mjs` asserts the line and lure sit on the mouth at
  every sampled frame, with a positive control that detaches the lure by hand.
  **The ORDER of the ending is load-bearing**: the ROD WITHDRAWS LAST, because it
  holds everything else up. dom-smoke test 73 samples the rig and fails if the rod
  stops outlasting the fish, the line and the lure.
  Two things the rig must keep clamping, both measured: the fish hangs BELOW its
  mouth (a body centred on the mouth put its dorsal edge and tail sweep over the
  glyphs), and the line's tension is capped by CLEARANCE — straightening it while
  the mouth is still under the last word walks it into that word's corner.
  The heading string is EDITABLE, so the geometry must survive both a short and a
  width-filling heading: the rod is clamped inside the heading block (an early
  build placed it past the right edge and with a long heading nothing drew at all).
- **The cast is measured against the GLYPHS, never the heading's block box.** The
  block is 322px wide while the words are ~150px, which is exactly how a fish came
  to sit on the "d" of "Wizard" while every check passed. `cast.js` measures the
  guard with a Range over the heading's text nodes — the same method
  `glyphcheck.mjs` uses, deliberately, so the two agree by construction. A canvas
  font-metrics version was consistently ~6px higher and let the lure inside the
  rect. The cast lives in a **water band** between the heading's glyph bottom and
  the INTRO's glyph top: about 17px on the live widgets, which is why the fish
  swims in horizontally instead of rising. Nothing may leave that band **at any
  frame, including on the way in and out** — three separate bugs were an entry or
  exit excursion, invisible to anything that only checked resting positions.
  `.dccs-heading` margin-bottom is 16px to create that band; do not take more
  without asking, this is a conversion widget.
- **The dates step is governed by the `avail_enable` control, not by code.** It is a
  switcher defaulting to off and deliberately absent from the preset, so a widget
  that never stored it shows no check-in/check-out question at all. There is no
  second switch — adding one would create exactly the two-copies-must-agree hazard
  the preset notes warn about. A widget that HAS saved `avail_enable=yes` can only
  be turned off in its own Elementor panel.
- **The site button spec lives in `--dccs-btn-*` tokens** at the top of
  `selector.css` (20px / 500 / 50px line-height / 0.5px / no transform, white on
  `#006BCF`, 30px radius). State the spec once there; don't restate numbers in
  per-button rules. **There are exactly two agreed exceptions, both asked for by the
  owner and both documented in place.** (1) The answer chips are `font-weight: 600`
  rather than the spec's 500 (0.32.0) — weight only, every other property still from
  the tokens. (2) The Compare /
  Compare N button is `--dccs-compare-red` (#8E1838, 8.98:1 on white) and hovers to
  `--dccs-compare-red-hover` (#6E1029, 11.87:1), pairing it with the compare
  checkbox label that wears the same red. It stays inside the shared skin rule so
  only its background differs; the hover harness knows about the exception rather
  than being silenced. `font-family` is `inherit`, not a named stack, so it survives a
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
`tools/build-bundle.php` from score / labels / availability / cast / selector in
that order. **The sources are the source of truth; the bundle is generated and must
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
