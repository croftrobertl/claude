=== Dora Canal Cottage Selector ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.1.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A fast, friendly, mobile-first selector that helps guests choose among the eight
Dora Canal Court cottages by focusing only on their real differences.

== Description ==

The eight cottages all sleep two on a queen bed and share the same amenities, so
guests face needless choice overload. This plugin adds a short, elegant decision
tool with three modes:

* **Quick Pick** — a handful of large tappable questions (desk? pullout couch?
  studio or 1-bedroom? table for 2 or 4? pet-friendly? ground floor? largest?).
* **What Matters Most** — set how much each thing matters with a tap (Low /
  Medium / High); no sliders, no drag-and-drop.
* **Compare** — a tight side-by-side matrix of 2–4 cottages over the seven
  meaningful differences only.

Results show the top three matches with friendly badges, a "why this fits your
trip" snippet, and a direct link to each cottage page.

The whole experience is client-side over a tiny bundled dataset
(`data/cottages.json`) — no MotoPress dependency, no AJAX, no external requests.

= Provided widgets / shortcode =

* **Cottage Selector** (Elementor) — the full three-mode tool.
* **Cottage Selector — Mini Entry** (Elementor) — a compact cross-sell prompt for
  individual cottage pages.
* `[dcc_selector_entry current="22" url="/cottage-selector/"]` — the same mini
  entry as a shortcode. Omit `url` to open the selector in an on-page pop-up.

= The seven meaningful differences =

Square footage · pullout couch · desk/workspace · floor level · studio vs.
1-bedroom · dining table for 2 vs. 4 · pet policy.

== Installation ==

1. Upload the plugin zip via WP Admin → Plugins → Add New → Upload.
2. Activate it.
3. Drop the **Cottage Selector** widget on a page (Elementor), or place the
   **Mini Entry** widget / `[dcc_selector_entry]` shortcode on each cottage page.

== Editing the cottage data ==

Cottage attributes live in `data/cottages.json`. Edit that file to change sizes,
names, or features. Visitor-facing copy is translatable with Loco Translate
(text domain: `dcc-cottage-selector`).

== Manual smoke test ==

* Quick Pick: choosing **Pet-friendly = Yes** returns only Coconut Cottage (#34).
* **Ground floor only = Yes** never shows The Lighthouse (#23); the "Why aren’t
  the others shown?" panel explains it is upstairs.
* **Table for 4** isolates The Boathouse (#22).
* Any hard filter leaving ≤3 cottages returns them directly (no re-ranking).
* When #31 & #32 (or #35 & #36) both appear, the lower-numbered one shows an
  "identical layout and features" note.
* What Matters Most: raising **Workspace** to High floats #22/#23 to the top.
* Compare: pick 2–4 cottages; differing cells are highlighted.
* Deep link: loading `?pet=true&mode=quick` initializes the tool directly.
* Mini Entry: with a selector URL it links there pre-filled; without one it opens
  an on-page pop-up in Compare mode highlighting the current cottage.
* Disable JavaScript: all eight cottages still render as links.

== Changelog ==

= 0.1.0 =
* Initial release: three-mode selector, two-phase scoring engine, badges,
  compare matrix, mini-entry widget + shortcode, deeplinks, localStorage recall,
  and "why excluded" transparency.
