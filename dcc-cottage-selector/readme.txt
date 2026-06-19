=== Dora Canal Cottage Selector ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.7.0
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
* **Weigh priorities** (in the mode menu) — a step-by-step wizard that asks how
  much each thing matters (Low / Medium / High); no sliders, no drag-and-drop.
* **Compare** (mode menu, or tick cottages on the results) — choose from a
  checkbox list and read a side-by-side table you page through with arrows.

Results show the top three matches with friendly badges, a "why this fits your
trip" snippet, and a direct link to each cottage page.

The whole experience is client-side over a tiny bundled dataset
(`data/cottages.json`) — no MotoPress dependency, no AJAX, no external requests.

= Provided widgets / shortcode =

* **Cottage Selector** (Elementor) — the full wizard finder (plus Weigh
  priorities / Compare in the header mode menu).
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

The widget opens on a **start screen** with the heading, a short intro, and a
choice of Quick finder, Weigh priorities, or Compare; picking one enters that mode.
The default Quick finder is a **step-through wizard**: one question per screen so a
guest never scrolls to find their results. Each step shows a clickable progress
stepper ("Step 3 of 7") and a live "N cottages match" count; nothing is
pre-selected — the guest taps an answer (including "No preference") and presses
**Next**, so a mis-tap never skips ahead. A low-key **Back** link and the stepper
both edit earlier answers. After the last question a **Review** screen lists all
answers (each editable) before "See my matches" reveals the **Top 3**, with a
tappable recap of what was searched. Answers are never remembered — every page
load starts fresh.

Scoring is a strict two-phase engine: Phase 1 applies the hard filters
(pet-friendly, ground-floor-only, table-for-4); Phase 2 ranks whatever survives
by softer preferences. If a hard filter leaves three or fewer cottages they are
returned directly. If a combination is impossible (e.g. pet-friendly AND a table
for four), the closest matches are shown, each **tagged with the must-have it
misses** ("Upstairs", "No table for 4").

A header **mode menu** (dropdown) switches between the Quick finder, **Weigh
priorities** (a parallel step-by-step wizard that ranks by Low/Medium/High
importance) and **Compare**. On the results, ticking two or more cottages reveals a
**"Compare N cottages"** button that opens the side-by-side table in a pop-up, with
a pinned attribute column and ‹ › arrows to page through the cottages.

Cottages are labelled with their number ("Cottage 32: Flamingo Bungalow").
Identical-layout cottages (e.g. two of the suites) are flagged so guests
understand why both appear. Answers are not remembered between visits — every page
load starts fresh — but genuine inbound deep links still work: a link such as
?pet=true opens straight to results, and the Mini-Entry opens pre-filled. Every
visible string and the full look (colors, typography, spacing, borders, alignment,
buttons) is configurable in the Elementor editor.

== Installation ==

1. Upload the plugin zip via WP Admin → Plugins → Add New → Upload.
2. Activate it.
3. Drop the **Cottage Selector** widget on a page (Elementor), or place the
   **Mini Entry** widget / `[dcc_selector_entry]` shortcode on each cottage page.

== Caching (SpeedyCache / HostGator) ==

The front end loads three small scripts that must keep their order:
`dccs-score` and `dccs-labels` before `dccs-selector` (the selector reads the data
layer the other two define). WordPress and Elementor enqueue them in the right
order automatically.

If you turn on JavaScript "combine"/"merge" or "defer" in SpeedyCache (or any
optimizer) and the widget ever shows "Loading…" too long, exclude the plugin's
scripts — match `dcc-cottage-selector/assets/js/` (or the handles `dccs-score`,
`dccs-labels`, `dccs-selector`) in the optimizer's JS-exclusion list. The selector
also has a built-in self-healing retry, so most setups need no change. After
updating the plugin, clear SpeedyCache and run Elementor → Tools → Regenerate Files
& Data so the new CSS/JS is served.

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
* The Review screen lists all 7 answers with Edit links; "See my matches" shows
  the top 3 with full names ("Cottage 34: Coconut Cottage") and a tappable recap.
* Answering **Pet-friendly = Yes** returns only Cottage 34: Coconut Cottage.
* Impossible combo (pet + table-for-4) shows the next-best cottage tagged
  "No table for 4". (There is no "why excluded" panel.)
* When #31 & #32 (or #35 & #36) both appear, the lower-numbered one shows an
  "identical layout and features" note.
* Count is singular at one result ("1 cottage matches"); no-match shows the "No
  Perfect Matches" screen with the blocking choices in red.
* Mode menu → Weigh priorities: a step-by-step wizard; setting **Workspace** to
  High floats #22/#23.
* Compare: pick from the checkbox dropdown (or tick cottages on the results) → the
  table pins the attribute column and pages cottages with ‹ › arrows in a pop-up.
* On a phone, the pop-up and its Next button stay within the viewport; the close
  "×" sits inside the box with no colour bleed.
* Deep link: loading `?pet=true` opens straight to results.
* Mini Entry: with a selector URL it links there pre-filled; without one it opens
  an on-page pop-up showing how the current cottage ranks.
* Disable JavaScript: all eight cottages still render as links.

== Changelog ==

= 0.7.0 =
* New **start screen**: the widget now opens on a landing screen showing the
  heading, intro, and a choice of Quick finder / Weigh priorities / Compare. The
  heading and intro now appear only there — once a mode is chosen they step aside so
  the questions/results get the full space. The in-flow mode dropdown still lets you
  switch modes, and Restart returns to the start screen. Deep links and the
  Mini-Entry pop-up still open straight to results.
* Much more is now editable in the Elementor editor:
  * Editable text for every wizard question, priority, and answer option (empty
    fields keep your Loco translations).
  * Optional icons/SVGs for each question and answer, the Edit-answers button, and
    the Compare picker button (plus the landing choices).
  * Dedicated style sections for the **Edit answers** button and the **View cottage**
    button (typography, colours, background, border, radius, padding, alignment,
    hover), and a question alignment + background control.
* Compare: the "Select cottages to compare" button is now only as wide as its label
  and centred, with the checklist sized to its items (checkboxes stay aligned).

= 0.6.4 =
* Mobile: compare-table cells use tighter padding on small phones (still scrolls
  sideways for wide comparisons); the mode menu now caps its height and scrolls so
  it can never open off the bottom of a short screen; compare checkboxes are a full
  44px tap target.
* Accessibility: a clear keyboard focus ring on every interactive control (buttons,
  answer chips, dropdowns, compare paging, the pop-up close).
* Hardening: the Mini-Entry link is sanitised with esc_url_raw() and the embedded
  config always serialises to valid JSON.
* (Internal note for a future pass: scope the global MutationObserver and tidy a
  per-widget document listener — deferred to avoid behavioural risk now.)

= 0.6.3 =
* Editor: the mode-switcher dropdown and the Compare cottage-picker dropdown now
  have full Shape controls (trigger / panel / item corner radius, item padding,
  trigger border) and Effects controls (panel shadow, item hover text + background,
  and a hover transition-speed slider). The Compare picker also gained its own
  typography / background / text-colour controls to match the mode switcher.
* Both dropdown menus now have a subtle default hover state.

= 0.6.2 =
* Compare table: cottage column headers are now smaller and stack the cottage
  number above the name (e.g. "Cottage 22:" / "The Boathouse"), so the columns
  take less width and fit better on phones.

= 0.6.1 =
* Compare: you can now pick any number of cottages (2 up to all of them), not just
  2–4. The side-by-side table already pages through them two at a time with the
  ‹ › arrows, so larger comparisons just add more pages.

= 0.6.0 =
* Review screen: the two buttons are now "Restart" (left) and "Submit" (right),
  styled identically.
* Results recap: "What you're looking for" is now a centred, bold section header
  that separates the recap from the cottages above it.
* Fixed (for real this time) on small screens: completed wizard step dots stay the
  same thin bars as upcoming ones; the pop-up close "×" sits inside the card; and
  the results pop-up fits the viewport and scrolls internally.
* Dropdown menu options and wizard answers are now centred by default, with new
  alignment controls in the Elementor editor.
* First-pass icon support: optional Font Awesome / SVG icons for the Submit,
  Restart, Next, Back, View-cottage and Compare buttons (emoji still work in
  labels). Plus smooth hover transitions, an answer-alignment control, and badge
  typography / radius controls. (Further styling controls to follow.)

= 0.5.0 =
* Mode switcher is now a dropdown menu (cleaner than three stacked buttons on mobile).
* "Weigh priorities" is now a step-by-step wizard (one priority per step, with a
  review screen) like the Quick finder.
* Compare: the cottage picker is a scrollable checkbox dropdown; the results table
  pins the attribute column and pages through cottages with ‹ › arrows.
* Pop-ups now fit within the mobile viewport (internal scroll); the close "×" is
  fixed (no theme colour bleed, centred, inside the box).
* Wizard: Back is now a primary button beside Next; the step dots stay a uniform
  size (colour-only change); "1 cottage matches" is singular.
* No-match results: heading is "No Perfect Matches", a clearer subheading, and the
  blocking must-haves in the recap are highlighted red.
* The "What you're looking for" recap is smaller and no longer ALL-CAPS; the
  Edit-answers / Start-over buttons match the cottage CTA and share one row.

= 0.4.2 =
* Removed the "I'm flexible — just show matches" shortcut from the wizard.
* Removed answer memory: the tool no longer remembers previous answers (dropped
  the browser-storage recall and the URL answer-sync), so every page refresh
  starts over at question 1. Inbound deep links and the Mini-Entry pre-fill still
  work.

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
