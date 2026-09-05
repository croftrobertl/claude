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
`[dcc_selector_entry]` shortcode. Pure static data, fully client-rendered: no
MotoPress dependency, no AJAX, no external requests. The repo has no build step.

**The MPHB Availability Calendar is no longer in this repo.** It is maintained in a
separate session (live 0.21.2); the copy that used to sit at
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

# Build the deliverable zip. Filename MUST state the version (user convention),
# so a downloaded build is identifiable without opening it. Read the version
# from the plugin header first.
( cd $(git rev-parse --show-toplevel) && zip -rq "Cottage Selector 0.23.0.zip" dcc-cottage-selector -x '*.DS_Store' )
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
- **Score ties break on a daily rotation, never on cottage ID** (`crit.rotation`,
  chosen once per page load in `defaultState()`). Tests that read result ORDER must
  either pass an explicit `rotation` to `score.run()` or assert on the engine's
  full result set — two assertions passed vacuously for releases because an ID
  tie-break happened to put 22/23/31 first.
- **Switching modes resets everything except the highlight** (`resetForMode()`):
  answers, weights, compare picks, navigation. The modes are independent tools.
- **Weigh Priorities is disabled on the live widget** (preset `enabled_modes` is
  quick + compare) and the owner considers it redundant with the quiz. Keep it
  working and tested, but don't invest in it without asking.
- **Elementor stores saved widget settings on the page, and stored values beat every
  plugin default.** A string edited in the panel before a release is frozen there; no
  plugin update can change it. Say so plainly rather than shipping a "fix" that
  cannot take effect.

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
