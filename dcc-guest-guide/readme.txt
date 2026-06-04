=== DCC Guest Guide ===
Contributors: doracanalcourt
Tags: elementor, guest, guide, hotel, hospitality, faq, info
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.8.0
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

= 0.8.0 =

New features:
* **Save as PDF (magazine-quality)** — new More-menu item below Print.
  The print stylesheet was fully rebuilt: a branded cover page, a
  contents page with leader dots and section numbers, a fresh sheet
  per section, items kept whole across page breaks, serif body type
  at 11pt for paper readability, and a running header that reads
  "Doracanal Court Guest Guide · X / Y" on every page. Gallery
  scrollers collapse to the first image, videos become a "view
  online" caption, and all on-screen chrome (toolbar, search, FAB,
  conditions card, AI panel, parallax background, checklist progress,
  theme toggle) is hidden. Output is a genuine vector PDF generated
  by the browser, no extra JS dependency.
* **Report a Problem (email)** — opt-in per widget. Adds a "Report a
  problem" item to the section detail's More menu (and, optionally,
  a small Report button on each item card). Tapping opens a vanilla
  <dialog> with a category dropdown (host-configurable), a
  description textarea, and an optional reply-to email. Submissions
  are sent via wp_mail() to one or more host addresses listed in the
  widget settings (falls back to the WordPress admin email when
  empty). Reports include the page URL, the section / item context,
  and the ?stay= key, with the guest's email wired to Reply-To when
  provided. Server-side per-IP rate limit (3 reports / 15 minutes).
* **Voice-first concierge** — when AI fallback search is enabled and
  the browser supports Web Speech Recognition (Chrome, Safari, Edge),
  a microphone button appears next to the "Ask anything" button.
  Tapping it records the guest's spoken question, fills the prompt,
  fires the existing AI flow, then reads the answer back aloud via
  Web Speech Synthesis. A small 🔊 button next to the answer cancels
  playback. Voice is processed entirely on-device; only the
  transcribed text travels the same admin-ajax → Gemini path that
  v0.7 text search uses.

= 0.7.0 =

New features:
* **Checklist mode** — per-section "Checklist mode" toggle makes every
  item in that section a checkbox guests can tick off; an alternative
  per-item "Make this item a checkbox" toggle lets a single item be
  checkable. State persists in localStorage scoped to `?stay=…` so
  each booking can reset cleanly. A sticky progress bar with `X / N`
  count + Reset button shows at the top of the detail; confetti
  fires when all items are checked.
* **Conditions side-card** — per-section "Show conditions side-card"
  toggle renders a small card with sunrise / sunset / moon phase
  (server-side, instant, no API) plus today's weather + tomorrow's
  forecast via Open-Meteo (free, no API key, 30-min transient cache
  shared across visitors). Cottage latitude / longitude configured
  once in Layout & Interaction; defaults to Mt. Dora, FL.
* **Photo gallery with hotspots** — new "Gallery" media type accepts
  multiple images. Each item can include an annotation textarea
  with one pin per line: `IMAGE_INDEX X% Y% | Label | Description`.
  Gallery renders as a horizontal scroll strip; tapping opens a
  lightbox with prev/next, image counter, and numbered hotspot pins
  overlaid on annotated images. Tap a pin to read its label and
  description. Ideal for hot-tub control panels, breaker boxes, etc.
* **Per-section parallax background image** — new MEDIA control per
  section + overlay opacity slider. Renders a hero image behind the
  detail header with scroll-linked parallax (rAF-throttled, transforms
  only). Respects prefers-reduced-motion. Detail header gets a
  glass treatment over the image so back / share / nav buttons stay
  legible.
* **AI fallback search** — opt-in per widget. When a guest's search
  returns no matches, the widget surfaces an "Ask anything about
  the cottage" button that POSTs the question + the entire guide
  content to Google Gemini via a server-side admin-ajax proxy.
  Free tier: 1,500 questions per day site-wide, no charge. Configure
  the Gemini API key under Settings → DCC Guest Guide (admin-only,
  stored in wp_options, never sent to the browser). Per-widget
  controls for the button label and a privacy notice.

= 0.6.0 =

Bug fixes:
* `.is-shrunk` no longer persists on hidden details — `openDetail`
  and `wireBack` strip the class so a previously-scrolled section
  doesn't flash a shrunk header on reopen.
* Preset swatch script guards against re-initialization. v0.5
  attached a fresh delegated click listener every time the editor
  panel re-rendered (selection change / undo / tab toggle); v0.6
  uses a `window.__dccggPresetWired` flag.
* Section search-haystack capped to 200 chars. v0.5 appended
  section_title + emoji + desc to each item's haystack *after* the
  per-item cap, so a long section description × many items bloated
  the inlined JSON. The meta string is now truncated and empty
  pieces are skipped.
* More-menu Theme row hidden when `dark_mode = off`. v0.5 showed
  the Theme toggle in the popover even when the admin disabled
  dark mode, which let guests turn on a dark palette the admin
  hadn't configured.

New features:
* **Auto-fold long detail content** — new "Auto-fold items over N
  words" setting in Display. When > 0, items whose WYSIWYG content
  exceeds the threshold get Read More / Read Less automatically.
  Per-item toggle still wins when explicitly on.
* **JSON export / import** — new Export Guide / Import Guide
  buttons in the Sections panel. Export copies a JSON of all
  sections + items to the clipboard. Import accepts a JSON paste
  and inserts (or replaces, via the adjacent checkbox) the
  current widget's content. Backs up + transfers a guide between
  sites. Schema is `{ dccgg_schema: 1, sections: [...], items: [...] }`.
* **Auto-thumbnail for video items** — YouTube and Vimeo items
  now show a poster image first; clicking loads the player with
  autoplay. YouTube uses the static thumbnail URL; Vimeo posters
  are fetched via the public API and cached for 7 days in a
  transient. Saves the network cost of every video iframe on the
  first paint. New "Show video poster thumbnails" switch (default
  on).
* **Per-tile color override** — new "Tile accent color" picker per
  section. When set, that section's icon, quick-action chip, and
  hover state use the chosen color instead of the global primary.
  Inline `<style>` block emits one set of rules per overridden
  section.
* **Density modes** — new "Density" SELECT in Layout & Interaction:
  Compact / Cozy (default) / Comfy. Applies a coordinated
  padding / gap / font-size scale across the widget. Other style
  controls still take precedence when set explicitly.

= 0.5.0 =

Bug fixes:
* `highlightQuery` TreeWalker no longer skips some matches. v0.4 used a
  single `/.../gi` regex for both the walker gate and the replacement
  pass, so `test()` would carry `lastIndex` between text nodes and
  silently reject nodes whose match position was below the current
  index. Now uses a non-global `/.../i` probe for the gate and the
  global regex only for replacement.
* `_hitClearTimer` cross-widget interference resolved. Each detail's
  auto-clear timer now lives in a `WeakMap` so widget B's
  search-result-click can't cancel widget A's pending clear.
* Section titles, emojis, and descriptions are now part of the search
  haystack. Typing "Wi-Fi" surfaces the Wi-Fi tile even when no item
  contains that string.
* `ensureLightbox` only sets the close-button aria-label on first
  creation (was redundantly re-set on every widget init).

New features:
* **URL deep-link to search term** — `?guide=wifi&q=password` opens the
  Wi-Fi detail AND auto-runs `highlightQuery("password")` once the
  detail is visible. Optional `&item=slug` picks a specific item to
  search within.
* **Customizable tile aspect ratio** — new "Tile aspect ratio" SELECT
  in the Tile / Card panel: auto / 1 : 1 / 4 : 3 / 16 : 9 / golden.
  Driven by `prefix_class` so every menu layout (grid, masonry, etc.)
  picks up the same fixed ratio for a visually consistent grid.
* **Swipe to advance section on mobile** — horizontal swipe (≥ 50 px,
  vertical drift < 30 px) on the detail stage cycles prev/next.
  Wizard-mode sections route to wizard Back/Next instead. Falls back
  to the existing arrow handler for accessibility.
* **Floating ⋯ "more" menu in detail** — new opt-in toggle in General.
  Adds a small disclosure button to the detail header with Print,
  Theme toggle, and Share-this-section actions; useful on small
  screens where the header gets crowded.
* **`dccgg:section-opened` custom DOM event** — bubbles from the
  widget root every time a detail opens. Detail payload:
  `{ key, widget, sectionTitle }`. Wire other Elementor widgets
  with `document.addEventListener('dccgg:section-opened', fn)`.
* **Sticky shrinking detail header on scroll** — header pins to the
  top of the detail card and shrinks once you scroll past it,
  keeping the section title and prev/next arrows always visible.
  Respects `prefers-reduced-motion`.
* **Theme preset preview swatches in admin** — six mini-cards above
  the preset SELECT show the actual colors of each preset. Clicking
  a card sets the SELECT.

== Hooks for other widgets ==

This widget dispatches a `dccgg:section-opened` event on its root
element every time a detail becomes visible. Listen for it from any
Elementor widget or external script:

    document.addEventListener('dccgg:section-opened', function (e) {
        var key   = e.detail.key;          // e.g. "wifi"
        var title = e.detail.sectionTitle; // e.g. "Wi-Fi"
        var root  = e.detail.widget;       // the .dccgg-root element
        // … react however you like
    });

URL parameters supported on the page where the widget is embedded:

* `?guide=KEY` — opens the named section on load
* `?guide=KEY&q=PHRASE` — opens the section AND highlights occurrences
  of PHRASE inside the content
* `?guide=KEY&item=SLUG&q=PHRASE` — same, but scoped to the item whose
  slugified title matches SLUG

= 0.4.0 =

Bug fixes:
* Reading progress bar no longer shows stale percentage on section
  switch. `openDetail` now zeroes the bar of the newly visible detail
  and clears any leftover search highlights from a prior visit.
* Wizard ↔ section-nav arrow-key conflict resolved. A single
  document-level keyboard router checks the visible detail's
  `data-wizard` attribute first; wizard sections own ←/→, others
  route to section nav.
* `extract_search_text` request-scoped static memo when "Include
  Elementor-template content in search" is on. Each referenced
  template renders at most once per pageload (was N renders per
  template per item).
* Lightbox close button reads `str_lightbox_close` from the strings
  panel (was hardcoded English "Close").
* `wireSectionNav`'s per-widget document keydown listener replaced
  with a single global router (no more N listeners on multi-widget
  pages).
* `navigator.share` only falls back to clipboard for real errors;
  user dismissal (`AbortError`) is now silent.
* Section-nav arrows have explicit `:active` styles so touch taps
  don't flash an inconsistent state.

New features:
* **Search-result deep highlight** — clicking a Cmd-K result opens the
  detail, scrolls the matched term into view, wraps every occurrence
  in `<mark class="dccgg-hit">`, and pulses the surrounding card for
  1.5 s. Wizard sections jump to the matching step first. Highlights
  auto-clear after 8 s or on detail close.
* **Inline emoji icons** — new "Emoji (overrides icon)" text field on
  sections and items. Paste an emoji like 🛁 and it replaces the
  Font Awesome icon at render. Zero JS, no FA dependency, works
  offline.
* **Animated icon hover** — new "Icon hover animation" SELECT in
  Layout & Interaction (pulse / bounce / rotate / wiggle / shake)
  plus an optional per-section override on the Sections panel. Only
  the framed icon moves on hover, not the surrounding tile. Respects
  `prefers-reduced-motion`.

= 0.3.0 =

Bug fixes:
* Welcome Pack button now actually works. v0.2 enqueued the script only
  into the preview iframe but the button lived in the editor panel, so
  the delegated click handler never fired. Script is now also enqueued
  on `elementor/editor/after_enqueue_scripts`.
* Auto-link re-tokenizes between patterns so the phone regex can no
  longer accidentally match digits inside an `<a href="mailto:...">`
  anchor that the email pattern just created.
* `wireGlobalCmdK` no longer probes the non-existent `document.dataset`;
  uses `document.documentElement.dataset` so the one-shot guard works.
* `.dccgg-sheet-backdrop` now `display: none` on desktop (v0.2 left it as
  a default `<div>`, which would render a full-screen layer over
  the wrapper outside the mobile media query).
* Long-press peek only fires on touch via `pointerdown`. Right-click on
  desktop is exclusively the `contextmenu` path, so the peek no longer
  opens twice.
* Sheet drag skips `pointerdown` on `button` / `a` / `input` targets so
  tapping the back arrow, section-nav arrows, or wizard buttons in the
  drag-handle zone no longer initiates a phantom drag.
* Welcome Pack rows now ship with a `_id` UUID per row so Elementor's
  repeater panel renders them with working drag handles and delete
  buttons.
* Image lightbox `<dialog>` hoisted to a single global instance shared
  across widgets, rather than one per widget.
* `enqueue_for_preview` now explicitly enqueues Font Awesome instead of
  relying on it being registered at probe time.
* `themePresets` dropped from `data-config` (dead bytes since v0.2 moved
  presets to static CSS).

New features:
* **Wizard mode** — per-section toggle that renders items one at a time
  with Next / Back buttons and a progress-dot strip. Pressing Done on
  the last step fires a confetti burst and resets to step 1. Replaces
  procedure mode for the section when both are toggled on.
* **Section prev / next arrows** — buttons in the detail header cycle
  between sections without bouncing back to the menu. Also bound to
  the keyboard ← / → arrow keys when a detail is visible and focus
  isn't in an input.
* **Haptic feedback** — opt-in switcher in the General panel. On
  supported devices, vibrates briefly on tile tap and a triple-pulse on
  successful copy. Uses `navigator.vibrate`; silently no-ops elsewhere.

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
