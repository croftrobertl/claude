=== DCC Guest Guide ===
Contributors: doracanalcourt
Tags: elementor, guest, guide, hotel, hospitality, faq, info
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A flexible Elementor widget for guest-facing info guides — Wi-Fi, hot tub,
local tips, checkout instructions. Grid / list / masonry / carousel / split-pane
layouts. Stage-swap / accordion / flip-card reveal modes. Theme presets with
auto dark mode. Cmd-K search. Per-item QR code, share links, copy buttons.

== Description ==

This plugin adds a single Elementor widget under the **Claude Code** category:
**DCC Guest Guide**. It lets you build a sectioned guest guide with a menu hub
of tiles that open into detailed content cards.

It is a side-by-side alternative to a Guest Guide widget generated via
Elementor's Angie Code. Same feature surface plus:

* Section dropdown (no typo-prone free-text keys)
* Defensive defaults — no PHP 8 warnings on untouched toggles
* FAB modal with `role="dialog"`, focus trap, ESC-to-close, focus return
* Specificity defense (doubled `.dccgg-root.dccgg-root` selector) that
  outranks Bravada / aggressive theme resets
* Full i18n via `dcc-guest-guide` text domain (works with Loco Translate)
* Print stylesheet scoped to the widget container, not global
* Editor-preview enqueue so flip cards and stage transitions render in
  Elementor's editor iframe
* Video URL normalizer supporting youtube.com/watch, youtu.be short links,
  YouTube Shorts, embed URLs, Vimeo (both vimeo.com/ID and player.vimeo.com),
  and self-hosted MP4 / WebM / MOV / OGG
* Five layout options beyond grid/list: masonry/bento, carousel (mobile),
  split-pane (desktop)
* Two extra reveal modes: accordion, 3D flip-card
* Six theme presets + automatic dark mode following `prefers-color-scheme`
  with a user override remembered in `localStorage`
* Cmd-K search filters across all sections and items with `<mark>` highlights
* Per-item QR code dialog (great for quickly sharing Wi-Fi / door codes /
  map URLs to a guest's own phone)
* Per-item share link button copies a URL with `?guide=KEY` so guests can
  re-open the guide on a specific section

== Manual smoke-test checklist ==

After upload + activation:

1. Drag the **DCC Guest Guide** widget into an Elementor page.
2. Add at least 3 sections (give each a `section_key`, e.g. `wifi`, `tub`,
   `local`) and save.
3. Reopen the items repeater — the section dropdown should now list them.
4. Add at least 6 items, mixing WYSIWYG and Elementor-template content sources.
5. Cycle each **Menu layout** (grid / list / masonry / carousel / split-pane)
   and each **Reveal mode** (stage / accordion / flip). Confirm the editor
   preview renders for every combination.
6. Confirm the flip mode automatically falls back to stage when paired with
   list / carousel / split-pane.
7. On the front-end: test Cmd-K (⌘K on Mac, Ctrl-K elsewhere), copy buttons,
   share buttons (URL → clipboard, look for `?guide=...`), QR dialog, Map
   Directions link, FAB open/overlay-close/ESC-close.
8. Toggle **Theme preset** through Coastal / Hotel / Bohemian / Minimal /
   Dark. Toggle the light/dark switch button at the top — preference should
   persist on reload (localStorage).
9. Print preview should show only the guide content (no toolbar, search,
   tiles, FAB, etc).

== Changelog ==

= 0.2.0 =

Bug fixes (all from a v0.1 audit):
* Dark mode now correctly overrides the active theme preset (presets moved
  from JS-injected inline styles to static CSS classes).
* Print button bound via JS (CSP-safe; replaces inline `onclick`).
* Tile backdrop control replaced with a proper overlay color + opacity pair
  (v0.1 exposed only the opacity slider with no image upload).
* Multi-widget Cmd-K conflict resolved — a single document-level binding
  routes focus to the largest visible widget.
* `?guide=KEY` URL anchor now validates the key exists in the receiving
  widget before opening, so unrelated widgets on the same page don't react.
* Font Awesome enqueued as an explicit style dependency so hardcoded
  `<i class="fas …">` icons no longer rely on a side-effect of
  `Icons_Manager::render_icon`.
* `prefers-reduced-motion` respected — transitions / flip / shimmer
  shortcut to instant; entry stagger skipped.
* Clipboard fallback via `document.execCommand('copy')` for non-HTTPS
  contexts where `navigator.clipboard` is undefined.
* Accordion tile and panel linked via `aria-controls` / `aria-labelledby`
  using stable per-widget IDs.
* Baseline interactive elements (`.dccgg-tile`, `.dccgg-btn`,
  `.dccgg-search-input`, etc.) use the doubled-class specificity defense
  so theme resets like Bravada's `(0,3,1)` rules lose.

Performance:
* Search index only built when search is enabled.
* Tilt `mousemove` rAF-throttled (one DOM write per frame max).
* `@supports not (backdrop-filter)` fallback to solid background for
  glassmorphism; `prefers-reduced-data` disables backdrop blur entirely.
* Explicit `'return_value' => 'yes'` on every switcher control.

Polish:
* Platform-aware kbd hint (`⌘K` on Mac, `Ctrl K` elsewhere) and hidden on
  touch-only devices via `@media (hover: none)`.
* Visible `:focus-visible` outlines on every focusable element.
* Editor-only RAW_HTML notice listing items that point at deleted
  sections; second notice explains the save-and-reopen flow for the
  Section dropdown.
* Optional "Include Elementor-template content in search" toggle (off by
  default; opt-in because it costs an extra render per template).

New features:
* **Mobile bottom-sheet** — on phones, the detail opens as a drag-to-
  dismiss sheet with a top drag-handle. Falls back to the existing stage
  swap on desktop.
* **Read aloud (Web Speech Synthesis)** — per-item play/pause button that
  reads the title + body. Picks a same-language voice when available.
* **Speech-to-search** — mic button injected into the search bar on Chrome
  / Safari for hands-free queries via Web Speech Recognition.
* **Image lightbox + long-press peek** — item images open in a fullscreen
  HTML5 `<dialog>` with pinch-zoom; touch-and-hold a tile (or right-click)
  shows a preview tooltip with the first item's body.
* **Welcome Pack** — admin-side "Insert hospitality starter pack" button
  in the Sections panel adds 6 typical sections (Wi-Fi / Hot Tub / Trash /
  Checkout / Local Eats / Emergency) and ~12 items in one click. Uses
  Elementor's editor model API; degrades to a console warning if that
  API is unavailable.
* **Auto-numbered procedure mode** — per-section toggle renders items as
  `Step 1, 2, 3` with a vertical progress line between them.
* **Estimated read time** — auto-computed from word count (200 wpm) and
  shown as a chip on each tile / item header.
* **Sticky in-section TOC** — for sections with 4 + items, a sticky table-
  of-contents appears in the detail view (desktop only) with current-item
  highlighting via IntersectionObserver.
* **Auto-link content** — phone numbers, emails, and decimal coordinate
  pairs in WYSIWYG items become `tel:`, `mailto:`, and Google-Maps links
  automatically. Server-side; skips text inside `<a>`, `<code>`, `<pre>`,
  `<kbd>`.
* **Confetti on copy** — successful Copy interactions trigger a multi-
  color, gravity-aware confetti burst (respects `prefers-reduced-motion`).
* **Reading progress bar** — sticky 3px bar across the top of the detail
  view tracks scroll progress through long items.

Note on the Welcome Pack: tested against Elementor 3.5+ editor model API.
If the panel button reports "could not resolve active widget model" in the
browser console, your Elementor version may have shifted the model paths —
file an issue and Claude will adapt.

= 0.1.0 =
* Initial release.
