=== DCC Seasons ===
Contributors: doracanalcourt
Tags: seasonal, particles, easter egg, matrix, canvas
Requires at least: 6.3
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.1.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Date-scheduled seasonal ambient particles plus a tap-the-logo Matrix-style
easter egg, built cache-safe and performance-first for doracanalcourt.com.

== Description ==

Two layers, both vanilla JS + 2D canvas (no libraries, no WebGL, no image
assets — particles and glyphs are emoji/text rendered to canvas):

1. **Ambient mode** — a sparse, slow, low-opacity drift of themed particles
   over the page during each scheduled date range. Capped at 16 particles,
   requestAnimationFrame-driven, paused when the tab is hidden, drawn on a
   `position:fixed`, `pointer-events:none`, `aria-hidden` canvas (zero CLS,
   never intercepts a click).
2. **Easter egg** — tapping/clicking the site logo (`#branding`, fallback
   `#site-title`) 5 times within a rolling 3-second window launches a
   full-screen Matrix-style glyph rain recolored and re-glyphed for the
   current theme (orange pumpkin rain in October, pastel egg rain at Easter…).
   Outside every range it falls back to the classic green Matrix rain. Exit
   via the ✕ button, Escape, or tapping the overlay. The rain engine
   (`matrix.js`) is a separate file lazy-loaded only on the launching tap.

= Cache-safe by design =

SpeedyCache (and HostGator's Endurance cache) serve cached HTML, so PHP never
bakes in "today's theme". The whole schedule ships to the client as a small
JSON config and the visitor's browser picks the active theme from its LOCAL
date at runtime. The markup is identical on every request. No AJAX, no
cookies, no localStorage.

= Quiet days =

Patriot Day (09/08–09/11) and MLK Day (01/18) are "subtle only": no particles
— just a small static corner accent (flag ribbon / gold-purple dove) — and
the easter egg is disabled entirely.

= Accessibility & performance =

* `prefers-reduced-motion: reduce` → ambient layer disabled; the egg shows a
  static themed banner instead of animation (and follows live preference
  changes).
* Ambient loader is a single deferred script; the Matrix engine never loads
  unless someone finds the egg.
* Egg columns are capped at 60; both layers pause on `visibilitychange`.
* Excluded pages: the MotoPress checkout (`/submit-booking/`, detected via
  `MPHB()->settings()->pages()->getCheckoutPageId()` when MotoPress is
  active) and the Elementor editor/preview. Filterable.

= Logo tap behavior =

When the logo links to the page the visitor is already on (the usual case:
the home-page logo on the home page), the click's default reload is cancelled
so tap counting can survive five rapid taps. Logo links to *other* pages
still navigate normally — on those pages the first tap goes home, and the
egg is found there.

= Settings =

WP-Admin → Settings → DCC Seasons: master enable, ambient on/off, egg on/off,
tap target selector, tap count, ambient density/opacity sliders, and a fully
editable schedule table ({start, end, theme, label} rows, pre-seeded for
2026–27) — future years need no rebuild.

= Theme preview (admins only) =

Append `?dcc_season=<theme_key>` to any front-end URL to force that theme for
the page view — ambient runs in it and the egg uses its Matrix palette.
`?dcc_season=off` forces no theme (no ambient, classic green egg). The
capability check (`manage_options`) happens server-side and only then is the
preview flag placed in the JS config, so visitors typing the parameter get
the normal date-driven behavior. The settings page lists every valid key.

= Filters =

* `dcc_seasons_options` — the effective option array.
* `dcc_seasons_schedule` — schedule rows sent to the client.
* `dcc_seasons_themes` — every theme definition (particles, palettes, glyphs).
* `dcc_seasons_config` — the final JS config object.
* `dcc_seasons_excluded_page_ids` — page IDs that never get effects.
* `dcc_seasons_is_excluded` — final say on excluding the current request.

== Installation ==

1. WP Admin → Plugins → Add New → Upload Plugin → `dcc-seasons.zip`.
2. Activate. Defaults are live immediately (schedule pre-seeded for 2026–27).
3. Optional: adjust under Settings → DCC Seasons.

== Manual smoke-test checklist ==

* On a date inside a range: sparse particles drift; on any other date: none.
* 5 quick taps on the logo → themed rain; ✕, Escape, and overlay tap all exit.
* Outside every range: 5 taps → classic green rain.
* On 09/08–09/11 or 01/18 (adjust a row to today to simulate): corner accent
  only, egg does nothing.
* `/submit-booking/`: no script tag, no effects.
* OS reduced-motion on: no ambient; egg shows the static banner.
* No console errors, no PHP notices, no layout shift, booking flow untouched.

== Changelog ==

= 1.1.0 =
* Theme preview: `?dcc_season=<theme_key>` forces a theme for the page view
  (`off` forces none) — restricted server-side to logged-in users with
  `manage_options`. Valid keys listed on the settings page.

= 1.0.0 =
* Initial release: ambient particle layer, lazy-loaded themed Matrix egg,
  pre-seeded 2026–27 schedule, settings page, cache-safe client-side date
  logic, checkout/Elementor exclusions, reduced-motion support.
