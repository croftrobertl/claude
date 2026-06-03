=== DCC Guest Guide ===
Contributors: doracanalcourt
Tags: elementor, guest, guide, hotel, hospitality, faq, info
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.1.0
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

= 0.1.0 =
* Initial release.
