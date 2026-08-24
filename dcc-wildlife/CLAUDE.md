# CLAUDE.md — DCC Wildlife

Guidance for Claude Code sessions working on the **DCC Wildlife** plugin
("On the Canal This Month") for doracanalcourt.com. Read the repo-root
`CLAUDE.md` and `SITE-CONTEXT.md` first for whole-site context (cache stack,
theme, table prefix).

## Purpose

One Elementor (free) widget `dccwl_month` + shortcode `[dcc_wildlife]` showing
guests what wildlife to expect on the Dora Canal, plus an optional moderated
guest sightings log. This replaces an earlier failed Firebase/Google-Maps/
weather-API build that leaked credentials.

## Hard rules (do not "fix" these)

- **100% WordPress-native. NO external services, NO API keys, NO CDN scripts,
  NO webfonts, NO images (emoji + inline SVG only), ever.** That constraint is
  the reason this plugin exists.
- **PHP must never bake "the current month" into HTML.** The site is
  aggressively page-cached (SpeedyCache + Endurance + advanced-cache.php).
  The full 12-month dataset ships to the client in the inline `DCC_WL_CFG`
  JSON and `assets/js/widget.js` picks the month from the visitor's local
  date. The spotlight strip and month browser are client-rendered; only the
  month-independent field guide is server-rendered.
- **The sightings AJAX endpoints are nonce-FREE by design.** Nonces baked
  into cached pages expire and 403 — a proven failure mode on this site.
  Abuse is handled by layers instead: honeypot (`dccwl_website`), time-trap
  (`dcc_wl_t` ≥ 3000 ms), per-IP transient rate limit (3/hour, keys
  `dcc_wl_rl_*`), species allowlist, strict date validation, hard length
  caps (note 200 / name 50), `sanitize_text_field` everywhere, and
  moderation: submissions are always `pending` and invisible until the owner
  publishes them.
- **Never echo submitted content unescaped.** PHP escapes everything on
  output; the JS inserts all dynamic text via `textContent` only (never
  innerHTML). Keep it that way.
- **Prefixes:** PHP `dcc_wl_` / `DCC_WL_` (namespace `DCC_WL`), CSS
  `.dccwl-`, CPT `dcc_wl_sighting`, option `dcc_wl_settings`, filters
  `dcc_wl_species` / `dcc_wl_calendar`.
- **Elementor category is `claude-code`** (site convention shared with the
  other DCC widgets). The plugin registers the category itself if absent.
- Every visible string is translatable, text domain `dcc-wildlife` (the site
  uses Loco Translate).

## Architecture

```
dcc-wildlife.php              # Headers + constants + require()s + activation hook
includes/class-plugin.php     # Singleton; registers hooks, assets, Elementor bits
includes/class-species.php    # Species registry + monthly likelihood table (PHP data,
                              #   filterable); dataset()/best_months_label() helpers
includes/class-render.php     # Shared renderer for widget AND shortcode (identical
                              #   output); prints DCC_WL_CFG inline JSON once
includes/class-widget.php     # Elementor widget (free APIs only); thin Render wrapper
includes/class-sightings.php  # CPT, admin columns, nonce-free AJAX submit + recent
includes/class-settings.php   # Settings → DCC Wildlife (module on/off toggle)
assets/css/widget.css         # One CSS file; palette navy #0a3d62 / coral #e8604f
assets/js/widget.js           # One vanilla-JS file, no jQuery
```

Data model: the registry (id, emoji, name, group, fact, best, where, mascot)
and the calendar (12 ints per species, 0=rare 1=possible 2=good 3=peak) live
in `class-species.php`. Spotlight = value ≥ 2 for the shown month, ordered
value desc with the heron (mascot) first among ties; value-3 cards get a
"Peak season" pill. The field guide's "Best: Nov–Mar" pills are derived
server-side from the value-3 months (falling back to the row max), with
ranges wrapping across the year end.

## Front-end conventions

- Assets are **registered** on `wp_enqueue_scripts` and **enqueued only at
  render time**, so they load only on pages using the widget/shortcode.
- Older clientele: base font 1.0625rem, tap targets ≥ 44px, generous
  spacing, no flashy motion. `prefers-reduced-motion` kills all
  transitions/animations. `.dccwl-spotlight-cards` carries a `min-height`
  so the client render causes no layout shift.
- Inherit the theme's body font — never load fonts.
- **Bravada specificity gotcha:** the theme's Elementor kit resets
  inputs/buttons at `(0,3,1)`. Every button/input rule doubles its classes
  (`.dccwl-root.dccwl-root .dccwl-btn.dccwl-btn` = `(0,4,0)`) to win
  without `!important`. Keep this pattern for any new interactive element.
- With JS disabled the sightings section (server-rendered `hidden` shell)
  and month browser simply never appear — never a broken form.

## Common commands

```bash
# Syntax-check every PHP file
find dcc-wildlife -name '*.php' -print0 | xargs -0 -n1 php -l

# Build the installable zip (upload via WP Admin → Plugins → Add New → Upload)
( cd $(git rev-parse --show-toplevel) && zip -r dcc-wildlife.zip dcc-wildlife )
```

## Manual smoke-test checklist (staging)

- Widget renders with defaults; `[dcc_wildlife]` renders identically.
- View source: no month-specific markup server-side; change the OS clock →
  spotlight month changes; all 12 month buttons re-render correctly.
- Reduced-motion OS setting → no animation anywhere.
- Sightings: submit → pending, invisible until approved, visible after;
  honeypot / <3s submit / 4th-in-an-hour each reject individually; Settings →
  DCC Wildlife toggle off removes every trace; disabled JS → no form at all.
- 375px viewport: cards stack, month row wraps, tap targets ≥ 40px.
- No console errors; assets absent on pages without the widget/shortcode.
