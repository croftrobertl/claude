=== Dora Canal Cottage Selector ===
Contributors: doracanalcourt
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.22.2
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A fast, friendly, mobile-first selector that helps guests choose among the eight
Dora Canal Court cottages by focusing only on their real differences.

== Description ==

Every cottage has a queen bed; six also sleep up to 4 with a pull-out couch
(the two studios stay cozy at 2). Beyond that the cottages share most
amenities, so guests face needless choice overload. This plugin adds a short,
elegant decision tool:

* **Quick finder (default)** — a step-through wizard, one tappable question per
  screen (how many guests? desk? pullout couch? studio or 1-bedroom? table for
  2 or 4? pet-friendly? ground floor? screened porch?), then straight to the
  top matches.
  An optional "Review your answers" step can be switched on in the editor.
* **Weigh priorities** (in the mode menu) — a step-by-step wizard that asks how
  much each thing matters (Low / Medium / High); no sliders, no drag-and-drop.
* **Compare** (mode menu, or tick cottages on the results) — choose from a
  checkbox list, then tap **Compare** to open a side-by-side table in a pop-up you
  page through with arrows.

Results show the top three matches with friendly badges, a "why this fits your
trip" snippet, and a direct link to each cottage page.

The whole experience is client-side over a tiny bundled dataset
(`data/cottages.json`) — no MotoPress dependency, no AJAX, no external requests.

= Provided widgets / shortcode =

* **Cottage Selector** (Elementor) — the full wizard finder (plus Weigh
  priorities / Compare in the header mode menu).
* **Cottage Selector — Mini Entry** (Elementor) — a compact cross-sell prompt for
  individual cottage pages. Its pop-up can **mirror a Cottage Selector's design**
  (see below) so you style everything in one place.
* `[dcc_selector_entry current="22" url="/cottage-selector/"]` — the same mini
  entry as a shortcode. Omit `url` to open the selector in an on-page pop-up.

= Mirror a Cottage Selector's design into Mini Entries =

Style and word your **Cottage Selector** once, then have every Mini Entry pop-up
match it automatically:

1. On the Cottage Selector, open **Content → Design source**, turn on **Share this
   design**, give it a **Design name** (e.g. "Main"), and save the page.
2. On each Mini Entry, set **Mini Entry → Mirror design from** to that name. The
   Mini Entry's own design/text controls hide, and its pop-up adopts the Selector's
   colors, typography, spacing, icons, and every text string.
3. Edit the Selector later and the mirrored pop-ups update automatically — no need
   to touch the Mini Entries.

The mirror styles the **pop-up** (the small entry-prompt button keeps its own
look). The pop-up's colors and spacing are applied inline, so they show correctly
even with SpeedyCache's "remove unused CSS" enabled. Finer details (typography,
borders) may briefly settle in on first interaction under aggressive unused-CSS
removal; if you want those instant too, exclude the selector page from unused-CSS
removal.

= Copy a Selector's design into a Mini Entry (one-time) =

Prefer to copy the Selector once and then tweak the Mini Entry independently
(instead of the always-in-sync mirror above)? Do it in two quick steps — it works
even when the widgets live on different pages:

1. **The look:** right-click the **Cottage Selector** in the Elementor editor and
   choose **Copy**. Open the page with your **Mini Entry**, right-click it, and
   choose **Paste Style**. Every color, font, size, and spacing setting copies into
   the Mini Entry's own controls (still fully editable).
2. **The wording:** on the Cottage Selector open **Content → Design source** and
   click **Copy text code**. On the Mini Entry open **Mini Entry → Import text**,
   paste the code, click **Apply text**, and **Save**. The Selector's headings,
   labels, buttons, questions, and badges land in the Mini Entry's own text fields.

Unlike the mirror, this is a one-time snapshot — editing the Selector afterward does
NOT change the copied Mini Entry, so you're free to adjust it per page.

= Site preset for new widgets (ON) =

**Status: on, since 0.19.6.** It was switched off in 0.19.2 on the theory that it
caused the Elementor editor crash. It did not — 0.19.5 traced that crash to the
design-mirroring save hook and fixed it there — so the preset is back on. If you ever
want it off without reinstalling, add this to your theme's functions.php:

    add_filter('dccs_preset_defaults_enabled', '__return_false');

Turning it off (or on) only affects widgets you add **afterward**: Elementor stores a
widget's settings on the page and stored values always beat control defaults, so
widgets already placed keep exactly the look they have.

A freshly dropped Cottage Selector or Mini Entry already matches the site: the
heading and intro, every question and answer label, the priority names, button
labels, Font Awesome icons, the palette (accent, backgrounds, borders, drop-down
item colors), the per-element colors (mode switcher, chips, compare button, matrix
header, progress) and the enabled modes are all preset. Everything stays fully
editable per widget — the preset is only the starting point.

The preset is defined in one place, `includes/class-preset-defaults.php`, so it can
be re-captured from a live widget later without touching ~90 control definitions.

Three things are deliberately NOT preset, because they identify one specific
instance rather than describing a look:

* **Share this design / Design name** — presetting these would make every new
  Selector publish itself as the shared design source and overwrite the registry
  entry the Mini Entries mirror.
* **Mirror design from** — points at one specific named design.
* **This cottage / Selector page URL** — identify a particular cottage or page.

Note that preset values are literal text, so a new widget starts in the wording
captured from the site rather than the translated defaults. Translations still apply
to anything the preset does not cover, and Loco Translate can still localize
everything a widget has not overridden.

= The meaningful differences =

Sleeps 2 vs. up to 4 · square footage · pullout couch · desk/workspace · floor
level · studio vs. 1-bedroom · dining table for 2 vs. 4 · pet policy ·
screened-in porch.

= How it works =

Everything runs in the browser from a small dataset inlined into the page — no
server round-trips.

The widget opens on a **start screen** with the heading, a short intro, and a
choice of Quick finder, Weigh priorities, or Compare; picking one enters that mode.
The default Quick finder is a **step-through wizard**: one question per screen so a
guest never scrolls to find their results. Each step shows a clickable progress
stepper ("Step 3 of 8") and a live "N cottages match" count; nothing is
pre-selected — the guest taps an answer (including "No preference") and presses
**Next**, so a mis-tap never skips ahead. A low-key **Back** link and the stepper
both edit earlier answers. After the last question the guest goes straight to the
**Top 3** (an optional **Review your answers** step can be enabled in the editor to
add a confirm-first screen). The **Edit answers** button on the results always opens
that review screen on demand, so answers can be changed even when the forced step is
off. Answers are never remembered — every page load starts fresh.

Scoring is a strict two-phase engine: Phase 1 applies the hard filters
(party of 3–4, pet-friendly, ground-floor-only, table-for-4); Phase 2 ranks
whatever survives
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
   Both widgets live under the **Dora Canal Court** category in the widget panel.

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
  the top 3 with full names ("Cottage 34: Coconut Cottage"); the **Edit answers**
  button returns to the answers to change them.
* Answering **Pet-friendly = Yes** returns only Cottage 34: Coconut Cottage.
* Impossible combo (pet + table-for-4) shows the next-best cottage tagged
  "No table for 4". (There is no "why excluded" panel.)
* When #31 & #32 (or #35 & #36) both appear, the lower-numbered one shows an
  "identical layout and features" note.
* Count is singular at one result ("1 cottage matches"); no-match shows the "No
  Perfect Matches" screen with the closest cottages tagged with what they miss.
* Mode menu → Weigh priorities: a step-by-step wizard; setting **Workspace** to
  High floats #22/#23.
* Compare: pick from the checkbox dropdown (or tick cottages on the results) → the
  table pins the attribute column and pages cottages with ‹ › arrows in a pop-up.
* On a phone, the pop-up and its Next button stay within the viewport; the close
  "×" sits inside the box with no colour bleed.
* Deep link: loading `?pet=true` opens straight to results.
* Mini Entry: with a selector URL it links there pre-filled; without one it opens
  an on-page pop-up showing how the current cottage ranks. From any scroll position
  the pop-up centers in the viewport, scrolls internally, and the "×" stays reachable.
* Disable JavaScript: all eight cottages still render as links.

== Changelog ==

= 0.22.2 =
* Copy revisions to the party-size question (owner-approved wording). The
  question now reads "How many guests will there be?", the answers are "1-2"
  and "3-4", and the capacity note says what guests 3 and 4 actually sleep on:
  "The 2 guests are included in the nightly rate and will have a queen bed. For
  guests 3 and 4, a nightly fee will apply and they will have a pullout couch."
* Wording only — nothing about matching changed. "3-4" still hides exactly
  Cottages 33 and 34, "1-2" still shows all eight, and shared links using
  ?party=2 / ?party=3-4 resolve exactly as they did before (the answers are
  matched on their stored values, never on the label text).

= 0.22.1 =
* Results pages (Matching Quiz and Weigh Priorities): the per-card "Compare"
  checkbox/text now renders only when 2 or more results share the page. A lone
  result has nothing to be compared with, so its card shows just the
  View-cottage button. The rule also covers the no-match fallback list and
  counts the extra highlighted card a Mini Entry adds. With 2+ results,
  everything works exactly as before, and the Compare mode in the menu is
  unchanged.

= 0.22.0 =
Sleeps-4 update: capacity data, party-size filter, per-cottage highlights.

* **Six cottages now sleep up to 4** (22/23/31/32/35/36 — the pull-out couch adds
  two; extra sheets on request). The two studios, 33 and 34, stay at 2. The data
  file carries the real per-cottage capacity and everything reads from it.
* **New first question: "How many of you?"** (2 of us / 3–4 of us / No
  preference). "3–4 of us" is a hard filter on the data's sleeps-max — it removes
  exactly the two studios; "2 of us" and skipping keep all 8. Weigh priorities
  gains a matching "Room for 3–4 guests" row (High = must-have), and the new
  `?party=` and `?w_party=` deep-link parameters are additive — every existing
  deep link resolves exactly as before.
* **Data corrections:** Cottage 35 is "Blue Heron Hideaway" (making the live
  site's hot-patched rename permanent so the next install can't regress it);
  Cottage 23's dining seats 4 (owner-confirmed). Verified and kept: 35/36 are
  1-bedrooms, 33/34 have no pull-out couch, pets in 34 only, screened porch on
  22 only.
* **Compare matrix:** the capacity row is captioned "Sleeps (max)" and now shows
  the real spread (4/4/4/4/2/2/4/4 in cottage order).
* **Capacity + pet notes:** the party-size step carries a neutral capacity
  sentence ("First 2 guests are included in the nightly rate; a per-night fee
  applies for guests 3 and 4."), the pet step notes Cottage 34 only, by
  pre-approval. Both are Elementor-editable. Each can end with an optional
  "Fee details" link via a new URL control — DEFAULT EMPTY, so no link renders
  until one is set. Fee amounts never appear in this plugin.
* **Per-cottage highlights:** owner-supplied facts render as short lines on each
  result card (e.g. Cottage 22: closest to the canal, private screened porch,
  largest bedroom…). Straight from `data/cottages.json` — nothing invented.
* Still pure static data, fully client-rendered: no MotoPress dependency, no new
  HTTP requests; both widgets and the shortcode share all of the above.

= 0.21.2 =
* Compare tab: the subheader and the "scroll the list" cue now read as **one
  paragraph** ("Select 2+ cottages to compare side by side. Scroll the list to see
  all 8 cottages.") instead of two separate lines. Both texts remain separate,
  individually editable controls (Compare subheader / Compare "scroll to see all"
  cue), and the `.dccs-cmp-count` class stays on the cue as a styling hook. No
  other Compare behavior changes.

= 0.21.1 =
* Both widgets move to the **`dcc-widgets`** Elementor category — the "Dora Canal
  Court" section every other live DCC plugin (Guest Guide, Contact Form,
  Availability Calendar) registers — and this plugin no longer contributes a
  "Claude Code" section. 0.19.4 had moved the slug to `claude-code` based on this
  repo's calendar code, which turned out to be stale relative to the live install;
  the live family slug, now verified in the running site, is `dcc-widgets`.
* Categories only group the editor's widget panel — Elementor stores the widget
  type on the page, not the category — so every placed instance renders and edits
  exactly as before. No other behavior, markup, styles, controls, or strings
  changed.

= 0.21.0 =
* The Compare tab's bottom "pick 2" tip is now **hidden by default** — it duplicated
  the subheader already shown above the checkbox list. A new switch, **Content →
  Text & labels → Show “pick 2” tip** (off by default), brings it back; when on, the
  behavior is exactly as before: the tip appears only while fewer than 2 cottages
  are checked, worded by the "Compare “pick 2” tip" text control.
* Instances already placed on pages have no stored value for the new switch, so they
  hide the tip automatically — no editing needed. Nothing else about Compare
  changes: the subheader, the scroll cue, the checkbox logic, and the Compare
  button's enable-at-2 behavior are untouched, and the `.dccs-compare-note` class
  keeps its name.

= 0.20.0 =
Eight corrections from a full-project review pass.

* **Editing no longer publishes half-typed designs.** With "Share this design" on,
  the Elementor preview re-renders server-side on every keystroke, and the render
  path published each intermediate state: junk registry entries for every partial
  design name as it was typed ("M", "Ma", "Mai"…), and — worse — the live published
  design briefly overwritten with half-typed text while Mini Entries mirrored it.
  Publishing is now skipped entirely in the editor/preview; saving the page (which
  was always the authoritative publisher) is what publishes.
* **Escape in the stacked compare pop-up no longer closes everything.** Opening the
  comparison table from inside the Mini Entry pop-up stacks two overlays; one Escape
  used to tear down both, dumping the guest back on the page with their answers
  gone. Escape (and the Tab focus trap) now applies only to the topmost overlay:
  first Escape closes the table, second closes the pop-up.
* **Stale shared designs clean themselves up.** Deleting a shared Selector, turning
  "Share this design" off, or renaming the design now removes the old entry from
  the registry on save, so dead names stop haunting every Mini Entry's "Mirror
  design from" dropdown. Designs published from other pages are never touched.
* **The pop-up close button ("×") is now a 44px tap target** (was 36px), matching
  the minimum used everywhere else in the widget.
* **A broken widget now degrades to cottage links instead of eternal "Loading…".**
  If the config can't be parsed or the scripts never finish loading, the widget
  reveals the plain list of links to all eight cottage pages.
* **Screen readers now hear the Compare selection count** ("Compare 2 cottages" /
  the pick-2-or-more prompt) instead of silence, and keyboard focus stays on a
  compare checkbox after ticking it instead of dropping to the top of the page.
* Cleanup: removed an unreachable compare-paging branch and its vestigial state,
  dropped a meaningless argument on the "Selector page URL" control, and stopped
  doubling the root class token in markup (the specificity doubling lives in the
  CSS selectors, where it belongs; markup needs the class once).
* Test coverage grows to 68 PHP + 208 JS assertions, and the headless-Chromium
  audit now also drives the stacked-pop-up flow at 320/360/768px (0 findings).

= 0.19.6 =
* **The site preset is back on.** Every preset setting and style captured in 0.19.0 —
  the heading and intro, all questions and answer labels, priority names, button
  labels, the eight Font Awesome icons, the full palette, the per-element colors
  (mode switcher, chips, compare button, matrix header, progress) and the enabled
  modes — is applied again to newly added widgets. 0.19.2 had switched it off on the
  theory that it caused the Elementor editor crash; 0.19.5 proved otherwise by finding
  and fixing the real cause in the design-mirroring save hook.
* Widgets already on your pages are unaffected, as always: Elementor stores each
  widget's settings on the page and stored values beat control defaults. The preset
  only decides where a NEWLY dropped Selector or Mini Entry starts.
* New guards so a hand-captured preset can't quietly break a control: the test suite
  now checks every preset value against the type of the control it feeds (a color
  string can't land on a slider, a slider array can't land on a color picker) and
  confirms every preset drop-down value is one of that drop-down's own options. All
  86 preset values pass.

= 0.19.5 =
* **Critical fix — the Elementor editor crash is solved.** Opening a page that had
  **no containers or widgets on it yet** in the Elementor editor produced "There has
  been a critical error on this website". Pages that already had content opened fine,
  and the live site was never affected.
* Cause: the design-mirroring hook (`elementor/document/after_save`) asked the
  document for its elements. In the editor, Elementor's `get_elements_data()` reacts
  to an empty document by calling `convert_to_elementor()`, which begins by calling
  `save([])`, which fires `after_save` — straight back into the handler. That save
  carries no elements, so the document stays empty and the loop never ends; PHP ran
  out of stack and died. The handler now reads the elements from the payload
  Elementor already hands it and never calls back into the document.
* This bug shipped in **0.11.0** and was present in every release since, including
  0.18.0. It was only ever reachable by opening an empty page in the editor, which is
  why 0.19.2 mis-attributed it to the site preset.
* Design mirroring is otherwise unchanged, with two small improvements: autosaves no
  longer publish a half-typed design over the saved one, and a malformed hook payload
  from another plugin is ignored instead of raising a type error.
* The site preset remains off so this fix ships on its own; it was not the cause and
  can be re-enabled with `add_filter('dccs_preset_defaults_enabled', '__return_true');`

= 0.19.4 =
* Fixes the **duplicate "Dora Canal Court" category** in the Elementor widget panel.
  The Cottage Selector and Mini Entry sat in a second section with the same name as
  the one holding DCC Availability Calendar, DCC Guest Guide, and Features &
  Amenities. Elementor groups the panel by category *slug*, not by the displayed
  title, and 0.17.1 had changed this plugin's slug to a prettier `dora-canal-court`
  while the sibling plugins kept `claude-code` — identical titles, two sections.
  Both widgets are back on the shared `claude-code` slug, so all five now appear
  under one "Dora Canal Court" heading. The displayed title is unchanged.
* Category slugs only drive grouping in the editor panel, so widgets already placed
  on pages are unaffected — nothing needs to be re-added or restyled.

= 0.19.3 =
* The "Edit Answers" and "Restart" buttons under the results list were 40px tall —
  under the 44px minimum comfortable tap target on a phone. They are now 44px, matching
  every other button in the widget. "See Matches" on the review step shares the same
  rule and grows with them.

= 0.19.2 =
* Fixes a fatal error that broke the **Elementor editor** on pages containing the
  widget (the front end was unaffected). The site preset introduced in 0.19.0 is the
  only difference from 0.18.0, so applying it is switched off until the cause is
  identified; control registration is now byte-for-byte what 0.18.0 did, which is the
  last version whose editor was known good. Everything else from 0.18–0.19 is intact,
  and saved widgets were never affected either way.
* The captured preset itself is kept in `includes/class-preset-defaults.php` so it can
  be switched back on once diagnosed:
  `add_filter('dccs_preset_defaults_enabled', '__return_true');`

= 0.19.1 =
* **Critical fix.** 0.19.0 crashed the front end with "There has been a critical error
  on this website" on any page containing the Selector or Mini Entry. The site preset
  was applied by overriding Elementor's add_responsive_control() and
  add_group_control(), which Elementor declares `final` — overriding them is a fatal
  PHP error the moment the widget class loads. WP Admin was unaffected because those
  pages never load the widget class. The preset now runs through the plugin's own
  wrapper methods and touches no Elementor API. Nothing else changed: new widgets still
  start from the site preset and saved widgets still render exactly as before.

= 0.19.0 =
* New widgets now start from the site's own configuration instead of the generic
  factory look: headings, questions, answer wording, button labels, icons, palette,
  per-element colors and the enabled modes are preset from the live design. See
  "Site preset for new widgets" above.
* Existing widgets are untouched — Elementor stores a widget's own settings and those
  always win over control defaults, so anything already on a page keeps rendering
  exactly as before.

= 0.18.0 =
* New: **Style → Compare button** styles the "Compare N cottages" button — background,
  text, hover background and hover text, plus typography, border, corner radius and
  padding. It is one button rendered in two places (the Compare-mode call to action and
  the one that appears under your quiz results), so these controls govern both.
* **Style → Mode switcher** gained the missing trigger colors: a Normal background and a
  new Hover tab with hover text + hover background. Previously only the trigger's text
  color was editable and its background came from the global Colors section.

= 0.17.2 =
* Fixed: the [dcc_selector_entry] shortcode's pop-up still showed the "Review your
  answers" step even though it is off by default (the Elementor widget already skipped
  it). Both the widget and the shortcode now follow the same default.

= 0.17.1 =
* Renamed the Elementor widget category to "Dora Canal Court". Both the Cottage Selector
  and the Mini Entry appear under that heading in the Elementor widget panel. Widgets
  already placed on your pages are unaffected — only the panel grouping changes.

= 0.17.0 =
* Fixed a false claim on result cards: "the most square footage of the bunch" showed on
  336–340 sq ft cottages (in 4,256 of the 21,870 possible answer combinations). Only the
  two 400 sq ft cottages now earn that line.
* Fixed a stale "identical to Cottage X" note that could stick to a cottage's card in
  later searches even when its twin wasn't on screen.
* Answering "Table for two" no longer eliminates The Boathouse (the only 4-seat
  cottage) — a 4-top serves two guests fine, so "two" now behaves like "No preference".
  This also matches the documented scoring design and reduces "No Perfect Matches"
  outcomes. (Answering "four" still filters, as before.)
* Bigger tap targets: the "Compare" checkbox on result cards grew from a 19px strip to a
  44px area with a larger checkbox; review-screen "Edit" buttons 36→44px; the "Compare N
  cottages" button 40→48px (matching the main wizard buttons).
* Clear SpeedyCache + Elementor → Regenerate Files & Data after updating.

= 0.16.0 =
* Review step is now OFF by default — the quiz goes straight to the matches after the
  last question. The "Show 'Review your answers' step" toggle (Content) still turns it
  back on. The results "Edit answers" button stays and opens the review screen on
  demand, so answers can still be changed without the forced step.
* Compare picker: removed the small, hard-to-see down-arrow and added an always-visible
  high-contrast scrollbar beside the cottage checklist, plus a "scroll to see all N
  cottages" line — so guests always know there are more cottages to pick. The list now
  shows ~5 cottages and scrolls; drag the bar or swipe to see the rest.
* Fixed the Match-Quiz Back/Next buttons growing taller on a single step (they could
  wrap onto two lines at a narrow width) — they're now a consistent height on every step.
* Clear SpeedyCache + Elementor → Regenerate Files & Data after updating.

= 0.15.0 =
* Distinct button colors: the navigation & action buttons (Next, Back, Edit answers,
  Restart, See matches) now default to a green that reads differently from the accent-blue
  answer selections, so guests can tell “pick an answer” apart from “move on”. A new
  “Action button color” control (Style → Buttons) lets you change that green.
* New toggle (Content): “Show ‘Review your answers’ step”. When off, the quiz jumps
  straight to the matches after the last question (the results “Edit answers” button is
  hidden with it).
* Clearer badge labels by default: Layout: Studio, Layout: 1-Bedroom, 1-Bedroom Suite,
  Work Desk, Pet-Friendly, Ground Floor, Upstairs, Screened Porch. Each is still editable
  under Content → Badge labels.
* Compare mode is easier to use: the cottage picker is now an always-visible checklist
  (no tap-to-open menu that hid the “Compare” button), with larger rows/checkboxes and a
  “pick at least 2” tip. Your compare selections now reset whenever you switch modes.
* The bottom Match-Quiz buttons (Edit answers, Restart, See matches) are slightly smaller
  to match the other buttons.
* Clear SpeedyCache + Elementor → Regenerate Files & Data after updating.

= 0.14.0 =
* Colors panel: the single "Card background" control is split into clearer, purpose-named
  controls. Style → Colors now has "Results background" (result cards), "Button background"
  + hover (every button and the two drop-down trigger bars/panels), and "Drop-down menu
  items" (background + text, normal + hover). The leftover neutral fill is renamed
  "Other surfaces (chips, table & pop-ups)".
* Consolidated the duplicate Background pickers that used to live in the Result cards,
  Buttons, Mode switcher and Compare picker sections — each background now has one home
  in Colors. Those sections keep their typography, borders, spacing and text colors.
* Note: if you had previously set a card, button or menu background in one of those
  sections, re-pick it once in the new Colors controls after updating. With nothing set
  the widget looks exactly as before.
* Clear SpeedyCache + Elementor → Regenerate Files & Data after updating.

= 0.13.0 =
* Quick finder: removed the "Want the largest space available?" question — it was
  redundant with the studio-vs-1-bedroom question. The wizard is now 7 questions.
  Square footage still ranks cottages under Weigh Priorities ("More room") and appears
  in the Compare table, so nothing is lost — guests just aren't asked about it twice.
* Clear SpeedyCache + Elementor → Regenerate Files & Data after updating.

= 0.12.1 =
* Review pass (fixes only, no new features):
* Uninstalling the plugin now removes the design-mirror registry it stores, leaving
  nothing behind in the database.
* A shared Selector rendered through a global template/shortcode can no longer register
  its design under the wrong page (which could quietly drop the mirrored pop-up's
  typography/border styling).
* Plugged a small memory leak where each Mini Entry pop-up open left a stale page-level
  event listener behind.
* Cleanup: removed one unused translatable string; readme corrected to the current 8
  quick-finder questions / 8 meaningful differences.

= 0.12.0 =
* New: one-time copy of a Cottage Selector's design into a Mini Entry that stays editable
  afterward (separate from the always-in-sync mirror). Use Elementor's right-click Copy →
  Paste Style for the look, plus a new "Export text" (Selector) / "Import text" (Mini Entry)
  code for the wording. Works across pages.
* Clear SpeedyCache + Elementor → Regenerate Files & Data after updating.

= 0.11.2 =
* Display name only: the plugin now shows as "DCC Cottage Selector" in the Plugins list
  and the Elementor widget panel (both widgets carry the "DCC" prefix). No functional
  change — same folder, settings, and placed widgets.

= 0.11.1 =
* Mirror hardening: a mirrored Mini Entry pop-up now applies the Selector's colors and
  spacing inline, so they render correctly even with SpeedyCache's "remove unused CSS"
  turned on (no wrong-color flash). Finer typography/borders still load with the rest of
  the page's CSS.
* Clear SpeedyCache + Elementor → Regenerate Files & Data after updating.

= 0.11.0 =
* New: a Mini Entry can **mirror a Cottage Selector's full design and text**. Turn on
  "Share this design" + a name on the Selector, then pick it under "Mirror design from"
  on the Mini Entry. The pop-up matches the Selector's styles/copy and updates
  automatically whenever you edit the Selector; the Mini Entry's own controls hide while
  mirroring.
* Note: the mirror styles the pop-up. If "remove unused CSS" is enabled in SpeedyCache,
  exclude the selector page so the pop-up keeps the Selector's styles.
* Clear SpeedyCache + Elementor → Regenerate Files & Data after updating.

= 0.10.5 =
* Results: removed the "What you're looking for" recap (your answers are already on the
  Review screen, and the Edit answers button lets you change them).
* Results: moved the "Compare N cottages" button below the cottage cards (where the recap
  was), above Edit/Restart.
* Mini Entry pop-up: fixed a bug where it could open partly off-screen and lock all
  scrolling depending on how far down the page you'd scrolled. The pop-up now always
  centers in the viewport, scrolls internally, and stays closable — while still picking up
  the widget's own styling.
* Clear SpeedyCache + Elementor → Regenerate Files & Data after updating.

= 0.10.4 =
* Compare checklist now shows a soft fade and a down-chevron at the bottom when there
  are more cottages to scroll to, so it's obvious the list continues past the first
  few. The cue disappears once you reach the end.
* Clear SpeedyCache + Elementor → Regenerate Files & Data after updating.

= 0.10.3 =
* Review/cleanup pass: removed unused internal code, and the "Want the largest space
  available?" answer now ranks bigger cottages to the top instead of filtering others
  out (so it never zeroes your results).
* Polish: the pop-up close button now follows your color settings; the compare table
  and in-pop-up checklist read better on small phones; minor accessibility fixes.
* Clear SpeedyCache + Elementor → Regenerate Files & Data after updating.

= 0.10.2 =
* Fixed the cottage-picker checklist (and mode dropdown) being cut off inside the
  on-page pop-up on mobile — the dropdowns now sit inside the pop-up's scroll area,
  so all cottages are reachable. Clear SpeedyCache + Elementor → Regenerate Files
  & Data after updating.

= 0.10.1 =
* Removed the first-screen ("Start over") button entirely. Version bumped so cached
  CSS/JS is replaced — clear SpeedyCache and run Elementor → Tools → Regenerate Files
  & Data after updating to drop the leftover blue button.

= 0.10.0 =
* **Mini Entry** now mirrors the main Cottage Selector: it has the full set of text +
  style controls, its pop-up opens on the landing screen, and it reflects your own
  heading/subheader/button/colour settings (no more stale defaults).
* **Quick Finder** live "X cottages match" count now narrows on every specific answer
  (e.g. Desk: Yes, Studio, Table for 2/4), not just the must-haves; "No preference"
  never narrows. When a combination rules everything out it shows "0" with a note that
  the closest options appear at the end. Weigh Priorities is unchanged (High = required).
* Paired button rows (Back/Next, Reset/Submit, Edit-Answers/Reset, first-screen + mode
  menu) now stay on one line on narrow phones, splitting the width evenly.

= 0.9.0 =
* The live "X cottages match" counter now narrows as you answer. In Quick Match it
  drops on must-have answers; in Weigh Priorities, marking a priority **High** treats
  it as required, so the count (and the final results) shrink accordingly.
* Compare picker dropdown now closes when you click/tap anywhere outside it.
* Compare subheader is now editable and reads "Select 2 or more cottages to compare
  side by side." by default.
* The wizard **review heading** and all eight **feature-badge labels** (Spacious
  Retreat, Work-Friendly Hideaway, etc.) are now editable in the Elementor panel.

= 0.8.0 =
* New distinguishing feature: a **private screened-in porch** (The Boathouse only).
  Quick Match now asks about it as a must-have filter, Weigh Priorities offers it as
  a Low/Med/High priority, and it appears as a row in the comparison table.
* Comparison table now lists **Guests** and **Bed** (2 / Queen) as core specs.
* New per-element control for whether an icon sits to the **left or right** of its
  label (Edit-answers button, View-cottage button, wizard questions & answers, and
  the Compare picker).
* A chosen **Next/Back icon now replaces** the default arrow instead of sitting
  beside it.

= 0.7.2 =
* Compare pop-up: the ‹ › paging buttons are now smaller, filled the same blue as
  the other buttons, with the arrows centred, and the "Showing X of Y" label stays
  on one line.

= 0.7.1 =
* Compare mode now opens the side-by-side table in a **pop-up** (the same one used
  when comparing cottages from the wizard results) instead of showing it inline
  under the checklist. Pick your cottages, then tap the **Compare** button — it is
  disabled until two are selected and then reads "Compare N cottages".

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
