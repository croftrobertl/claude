=== Dora Canal Cottage Selector ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.4.1
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A fast, friendly, mobile-first selector that helps guests choose among the eight
Dora Canal Court cottages by focusing only on their real differences.

== Description ==

The eight cottages all sleep two on a queen bed and share the same amenities, so
guests face needless choice overload. This plugin adds a short, elegant decision
tool:

* **Quick finder (default)** — a step-through wizard, one tappable question per
  screen (desk? pullout couch? studio or 1-bedroom? table for 2 or 4?
  pet-friendly? ground floor? largest?), then a review screen and the top matches.
* **Weigh priorities** (a tap away in the mode toggle) — set how much each thing
  matters with a tap (Low / Medium / High); no sliders, no drag-and-drop.
* **Compare** (mode toggle, or tick cottages on the results) — a tight
  side-by-side matrix of 2–4 cottages over the seven meaningful differences only.

Results show the top three matches with friendly badges, a "why this fits your
trip" snippet, and a direct link to each cottage page.

The whole experience is client-side over a tiny bundled dataset
(`data/cottages.json`) — no MotoPress dependency, no AJAX, no external requests.

= Provided widgets / shortcode =

* **Cottage Selector** (Elementor) — the full wizard finder (plus Weigh
  priorities / Compare in the header mode toggle).
* **Cottage Selector — Mini Entry** (Elementor) — a compact cross-sell prompt for
  individual cottage pages.
* `[dcc_selector_entry current="22" url="/cottage-selector/"]` — the same mini
  entry as a shortcode. Omit `url` to open the selector in an on-page pop-up.

= The seven meaningful differences =

Square footage · pullout couch · desk/workspace · floor level · studio vs.
1-bedroom · dining table for 2 vs. 4 · pet policy.

= How it works =

Everything runs in the browser from a small dataset inlined into the page — no
server round-trips.

The default experience is a **step-through wizard**: one question per screen so a
guest never scrolls to find their results. Each step shows a clickable progress
stepper ("Step 3 of 7") and a live "N cottages match" count; nothing is
pre-selected — the guest taps an answer (including "No preference") and presses
**Next**, so a mis-tap never skips ahead. A low-key **Back** link and the stepper
both edit earlier answers, and an **"I'm flexible — just show matches"** shortcut
skips the rest. After the last question a **Review** screen lists all answers
(each editable) before "See my matches" reveals the **Top 3**, with a tappable
recap of what was searched.

Scoring is a strict two-phase engine: Phase 1 applies the hard filters
(pet-friendly, ground-floor-only, table-for-4); Phase 2 ranks whatever survives
by softer preferences. If a hard filter leaves three or fewer cottages they are
returned directly. If a combination is impossible (e.g. pet-friendly AND a table
for four), the closest matches are shown, each **tagged with the must-have it
misses** ("Upstairs", "No table for 4").

A header **mode toggle** switches between the Quick finder, **Weigh priorities**
(score by Low/Medium/High importance) and **Compare**. On the results, ticking two
or more cottages reveals a **"Compare N cottages"** button that opens the
side-by-side matrix in a pop-up.

Cottages are labelled with their number ("Cottage 32: Flamingo Bungalow").
Identical-layout cottages (e.g. two of the suites) are flagged so guests
understand why both appear. Preferences are kept in the URL (shareable) and the
browser (remembered for return visits); a deep link such as ?pet=true opens
straight to results. Every visible string and the full look (colors, typography,
spacing, borders, alignment, buttons) is configurable in the Elementor editor.

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

* Editor: the widget renders in the Elementor editor preview (not stuck on
  "Loading…") — clear SpeedyCache and Elementor → Tools → Regenerate Files & Data
  after updating.
* Wizard: each step shows one question with nothing pre-selected; **Next** is
  disabled until an answer is tapped and never advances on its own. The clickable
  stepper and a low-key Back link jump to earlier answers.
* "I'm flexible — just show matches" on step 1 skips straight to results.
* The Review screen lists all 7 answers with Edit links; "See my matches" shows
  the top 3 with full names ("Cottage 34: Coconut Cottage") and a tappable recap.
* Answering **Pet-friendly = Yes** returns only Cottage 34: Coconut Cottage.
* Impossible combo (pet + table-for-4) shows the next-best cottage tagged
  "No table for 4". (There is no "why excluded" panel.)
* When #31 & #32 (or #35 & #36) both appear, the lower-numbered one shows an
  "identical layout and features" note.
* Mode toggle → Weigh priorities: raising **Workspace** to High floats #22/#23.
* Compare: tick two cottages on the results to reveal "Compare 2 cottages" → the
  matrix opens in a pop-up; or use the Compare mode and pick 2–4.
* Deep link: loading `?pet=true` opens straight to results.
* Mini Entry: with a selector URL it links there pre-filled; without one it opens
  an on-page pop-up showing how the current cottage ranks.
* Disable JavaScript: all eight cottages still render as links.

== Changelog ==

= 0.4.1 =
* Performance: the boot MutationObserver now ignores unrelated page mutations and
  our own re-renders (acts only when a widget is added, coalesced per frame); the
  match score is computed once per render instead of 2–4 times.
* Accessibility: dialogs are labelled for screen readers; the mode toggle uses an
  honest button group (aria-pressed) instead of a faux tablist; the current step
  has aria-current; the disabled Next button explains itself; and the answer
  radiogroup is keyboard-reachable when nothing is selected yet.
* Fix: enabling "Match site theme colors" no longer leaves the Accent / Secondary
  / Text pickers visible-but-dead — they're hidden while inheriting.
* Mobile: small-screen fixes for the modal close button, the results header +
  Compare button, and the compare table width.
* Removed dead CSS left over from earlier versions.

= 0.4.0 =
* Fix: the widget no longer hangs on "Loading…" in the Elementor editor preview —
  boot now waits for the data layer and the preview enqueues it in order.
* Wizard: a Next button replaces auto-advance (no more accidental skips); no
  answer is pre-selected; the Back control is a low-key link, not an answer; a
  clickable progress stepper and an "I'm flexible" shortcut were added.
* The secondary modes moved into a header mode toggle (Quick finder / Weigh
  priorities / Compare).
* Compare is now self-explanatory: tick 2+ cottages on the results to reveal a
  "Compare N cottages" button that opens the matrix in a pop-up.
* Cottages are labelled with their number ("Cottage 32: Flamingo Bungalow").
* Removed the low-value "Why aren't the others shown?" panel; centered the
  heading/intro.
* Comprehensive Elementor style controls (typography, colors, spacing, borders,
  alignment, Normal/Hover/Selected button + answer styling, cards, compare table).
* DOM smoke test expanded to 57 assertions.

= 0.3.0 =
* Redesigned the default flow as a one-question-per-step wizard so guests never
  scroll to reach results: per-step progress + live match count, auto-advance,
  Back/edit, a "Doesn't matter" option on every step, and a Review screen before
  results with a recap of what was searched.
* No-match results now tag each next-best cottage with the must-have it misses.
* "What Matters Most" and "Compare" moved behind a "More options" link.
* DOM smoke test expanded to 40 assertions covering the full wizard.

= 0.2.1 =
* Fix: guard the MutationObserver against a missing document.body and wrap
  per-widget init in try/catch, so the script can never break the Elementor
  editor preview if it loads before <body> or a single widget errors.

= 0.2.0 =
* Real cottage names pulled from the live site.
* Mini-entry opens Quick Pick pre-filled and highlights the current cottage's rank.
* Live "N cottages match" count; sticky "See my matches" CTA on mobile.
* Empty-result combos now show the closest fallback matches.
* "Match site theme colors" toggle; persistent screen-reader live region.
* Full ARIA tab/radio keyboard navigation, modal focus trap + background scroll-lock.
* Weights serialized to the URL; per-visit highlight no longer remembered.
* Translatable floor/layout values; bundled translation template (.pot).
* Added a jsdom DOM smoke-test suite (34 assertions).

= 0.1.0 =
* Initial release: three-mode selector, two-phase scoring engine, badges,
  compare matrix, mini-entry widget + shortcode, deeplinks, localStorage recall,
  and "why excluded" transparency.
