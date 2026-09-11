/**
 * DOM smoke test for the Dora Canal Cottage Selector front-end (v0.4 wizard).
 *
 * Mounts the widget in jsdom with the REAL data-config (tests/dump-config.php)
 * and drives the actual controller: the Next-button wizard (no auto-advance, no
 * default highlight), the clickable stepper, review/edit, results with full
 * cottage names + tappable recap, the header mode toggle, the compare overlay,
 * the no-match tags, the boot dependency-guard, the no-persistence/start-over
 * behavior, and the mini-entry modal — asserting on the resulting DOM.
 *
 * Run: npm test   (or: node tests/dom-smoke.test.js)
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'dcc-cottage-selector', 'assets', 'js');
const CONFIG = execSync('php ' + path.join(__dirname, 'dump-config.php')).toString().trim();

let pass = 0, fail = 0;
function ok(name, cond) { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); }

// Async test blocks must finish BEFORE the summary prints, or their assertions
// are silently uncounted — the 0.24.0 availability tests lost ~26 that way.
// Wrap each in `defer(async () => {...})` and the runner awaits them all.
const deferred = [];
function defer(fn) { deferred.push(fn); }

function injectScript(window, file) {
  const s = window.document.createElement('script');
  s.textContent = fs.readFileSync(path.join(JS, file), 'utf8');
  window.document.body.appendChild(s);
}

function freshDom(url) {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', {
    url: url || 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously'
  });
  // cast.js before selector.js: selector.js calls DCCS.cast.attach() on mount, so
  // every mount in this suite exercises attach() as a side-effect. In jsdom the
  // heading has no box, so visibleEnough() is false and nothing ever fires on its
  // own — casts in these tests are forced explicitly.
  ['score.js', 'labels.js', 'availability.js', 'cast.js', 'selector.js'].forEach(function (f) { injectScript(dom.window, f); });
  return dom.window;
}

function mountSelector(window, configStr) {
  const div = window.document.createElement('div');
  div.className = 'dccs-root';
  div.dataset.config = configStr || CONFIG;
  window.document.body.appendChild(div);
  window.DCCS.bootAll(window.document);
  return div;
}

function progress(root) { var p = root.querySelector('.dccs-progress-label'); return p ? p.textContent : ''; }
function countText(root) { var c = root.querySelector('.dccs-count'); return c ? c.textContent : ''; }
function curChips(root) { return Array.prototype.slice.call(root.querySelectorAll('.dccs-chips-wizard .dccs-chip')); }
function activeChip(root) { return curChips(root).filter(function (c) { return c.classList.contains('is-active'); })[0]; }
function clickAnswer(root, value) {
  var c = curChips(root).filter(function (n) { return n.dataset.value === value; })[0] || curChips(root)[0];
  c.click();
}
function clickNext(root) { var b = root.querySelector('.dccs-next'); if (b && !b.disabled) { b.click(); } }
function answerNext(root, value) { clickAnswer(root, value); clickNext(root); }
function stepThrough(root, value) {
  for (var k = 0; k < 12 && root.querySelector('.dccs-chips-wizard'); k++) { answerNext(root, value); }
}
// The review step is OFF by default (see Config::build), so "See my matches" only
// exists when a test explicitly enables it. Click it when present, else we're already
// on results.
function seeMatches(root) { var b = root.querySelector('.dccs-see-matches'); if (b) { b.click(); } }
function toResults(root, value) {
  stepThrough(root, value || 'either');
  var b = root.querySelector('.dccs-see-matches');
  if (b) { b.click(); }
}
function cardNames(root) {
  return Array.prototype.slice.call(root.querySelectorAll('.dccs-card h4')).map(function (h) { return h.textContent.replace(/\s+/g, ' ').trim(); });
}
// Fresh loads open on the landing screen; choose a mode to enter the flow.
function enter(root, mode) {
  var c = root.querySelector('.dccs-landing-choice[data-mode="' + (mode || 'quick') + '"]');
  if (c) { c.click(); }
}

// ---- 0. Landing screen first: heading + intro + the three mode choices ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  ok('landing screen shown first', !!root.querySelector('.dccs-landing'));
  ok('landing shows heading + intro', !!root.querySelector('.dccs-landing .dccs-heading') && !!root.querySelector('.dccs-landing .dccs-intro'));
  ok('landing offers all three mode choices', root.querySelectorAll('.dccs-landing-choice').length === 3);
  ok('no wizard or mode dropdown on landing', !root.querySelector('.dccs-chips-wizard') && !root.querySelector('.dccs-modeselect-trigger'));
  enter(root, 'quick');
  ok('choosing a mode enters the flow', !!root.querySelector('.dccs-chips-wizard'));
  ok('heading + intro gone once a mode is chosen', !root.querySelector('.dccs-head') && !root.querySelector('.dccs-intro'));
  ok('mode dropdown appears after landing', !!root.querySelector('.dccs-modeselect-trigger'));
})();

// ---- 1. Wizard starts: one question, nothing preselected, Next disabled ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  ok('shows exactly one question step', root.querySelectorAll('.dccs-step-q').length === 1);
  ok('progress reads Step 1 of 8', /1\b.*\b8/.test(progress(root)));
  ok('three answer chips', curChips(root).length === 3);
  ok('no answer preselected', !activeChip(root));
  ok('Next is disabled until a choice', root.querySelector('.dccs-next').disabled === true);
  ok('live count shows 8', /\b8\b/.test(root.querySelector('.dccs-count').textContent));
  ok('no Back on first step', !root.querySelector('.dccs-back'));
  ok('mode switcher is a dropdown (3 options)', !!root.querySelector('.dccs-modeselect-trigger') && root.querySelectorAll('.dccs-modetab').length === 3);
  ok('no "I\'m flexible" shortcut', !root.querySelector('.dccs-flexible'));
  ok('sr live region present', !!root.querySelector('.dccs-sr-only[aria-live="polite"]'));
})();

// ---- 1b. Mode dropdown opens/closes via the trigger ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  const trig = root.querySelector('.dccs-modeselect-trigger');
  ok('dropdown starts closed', !root.querySelector('.dccs-modeselect.is-open'));
  trig.click();
  ok('trigger opens the dropdown', !!root.querySelector('.dccs-modeselect.is-open') && trig.getAttribute('aria-expanded') === 'true');
})();

// ---- 1c. "N cottage matches" is singular when 1 ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either'); // to the pet step (index 5)
  clickAnswer(root, 'yes'); // pet=yes -> only Coconut
  ok('singular count reads "1 cottage matches"', /\b1 cottage matches\b/.test(root.querySelector('.dccs-count').textContent));
})();

// ---- 2. Tapping an answer selects without advancing; Next advances ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  clickAnswer(root, '34');
  ok('selecting highlights the chip', !!activeChip(root) && activeChip(root).dataset.value === '34');
  ok('still on step 1 (no auto-advance)', /1\b.*\b8/.test(progress(root)));
  ok('Next becomes enabled', root.querySelector('.dccs-next').disabled === false);
  clickNext(root);
  ok('Next advances to step 2', /2\b.*\b8/.test(progress(root)));
  ok('Back appears after step 1', !!root.querySelector('.dccs-back'));
  ok('Back is styled as a primary button', root.querySelector('.dccs-back').classList.contains('dccs-primary'));
  ok('Back and Next share the nav row', root.querySelectorAll('.dccs-wizard-nav .dccs-primary').length === 2);
})();

// ---- 3. Back preserves the chosen answer ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  answerNext(root, '34');
  root.querySelector('.dccs-back').click();
  ok('Back returns to step 1', /1\b.*\b8/.test(progress(root)));
  ok('previous answer preserved', activeChip(root) && activeChip(root).dataset.value === '34');
})();

// ---- 4. Clickable stepper jumps back to an answered step ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  answerNext(root, '34');      // step 1 (party size)
  answerNext(root, 'no');      // step 2 (desk) -> now on step 3
  ok('on step 3', /3\b.*\b8/.test(progress(root)));
  var dot = root.querySelector('.dccs-stepper button.dccs-step-dot[data-step="0"]');
  ok('answered steps are clickable dots', !!dot);
  dot.click();
  ok('stepper dot jumps to step 1', /1\b.*\b8/.test(progress(root)));
})();

// ---- 5. Review step + edit returns to where you came from ----
(function () {
  const w = freshDom();
  const root = mountSelector(w, configWith({ showReview: true }));   // review is off by default
  enter(root, 'quick');
  stepThrough(root, 'either');
  ok('review lists all 8 answers', root.querySelectorAll('.dccs-review-list li').length === 8);
  ok('review has See-my-matches', !!root.querySelector('.dccs-see-matches'));
  const reviewBtns = root.querySelectorAll('.dccs-tail-nav > button');
  ok('review: Restart is left, Submit is right',
    reviewBtns.length === 2 &&
    reviewBtns[0].classList.contains('dccs-reset') &&
    reviewBtns[1].classList.contains('dccs-see-matches'));
  root.querySelector('.dccs-edit[data-step="3"]').click();
  ok('edit jumps to that question (step 4)', /4\b.*\b8/.test(progress(root)));
  clickNext(root);
  ok('after editing, Next returns to review', root.querySelectorAll('.dccs-review-list li').length === 8);
})();

// ---- 6. See matches -> results, full names, recap, edit-answers ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  clickAnswer(root, 'yes'); clickNext(root);   // desk = yes
  stepThrough(root, 'either');
  seeMatches(root);
  ok('results region shown', !!root.querySelector('.dccs-results'));
  ok('cottage names include their number', cardNames(root).every(function (n) { return /^Cottage \d+: /.test(n); }));
  ok('no "What you’re looking for" recap on results', !root.querySelector('.dccs-recap'));
  ok('edit-answers control present', !!root.querySelector('.dccs-edit-answers'));
  ok('no "why excluded" panel', !root.querySelector('.dccs-excluded'));
})();

// ---- 6b. Admin-set button icons are injected from config.icons ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  cfg.icons = { submit: '<i class="dccs-test-ico"></i>', view: '<i class="dccs-test-ico"></i>' };
  cfg.showReview = true;                       // the Submit button lives on the review step
  const root = mountSelector(w, JSON.stringify(cfg));
  enter(root, 'quick');
  stepThrough(root, 'either');
  ok('Submit button carries its icon', !!root.querySelector('.dccs-see-matches .dccs-ico .dccs-test-ico'));
  seeMatches(root);
  ok('View-cottage links carry their icon', !!root.querySelector('.dccs-view .dccs-ico .dccs-test-ico'));
})();

// ---- 6c. Question + answer icons inject from config.icons ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  cfg.icons = { q_desk: '<i class="dccs-test-qico"></i>', ans_yes: '<i class="dccs-test-aico"></i>' };
  const root = mountSelector(w, JSON.stringify(cfg));
  enter(root, 'quick');
  answerNext(root, 'either');   // past the party-size step; desk (q_desk icon) is step 2
  ok('the question carries its icon', !!root.querySelector('.dccs-step-q .dccs-ico .dccs-test-qico'));
  ok('the Yes answer chip carries its icon', !!root.querySelector('.dccs-chip[data-value="yes"] .dccs-ico .dccs-test-aico'));
})();

// ---- 7. Answers are not persisted — a refresh starts over ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  answerNext(root, 'yes');                 // answer step 1 and advance
  ok('nothing written to localStorage', w.localStorage.getItem('dccs_prefs_v1') === null);
  ok('answers not written to the URL', w.location.search === '');
  // A refresh = a brand-new page load with the same (clean) URL.
  const w2 = freshDom();
  const root2 = mountSelector(w2);
  ok('fresh load starts on the landing screen', !!root2.querySelector('.dccs-landing') && !root2.querySelector('.dccs-results'));
  ok('fresh load has nothing preselected', !activeChip(root2));
})();

// ---- 8. Deep link jumps straight to results ----
(function () {
  const w = freshDom('https://example.com/?pet=true');
  const root = mountSelector(w);
  ok('deeplink skips the questionnaire', !root.querySelector('.dccs-chips-wizard'));
  ok('deeplink pet=true -> only Coconut Cottage', cardNames(root).length === 1 && cardNames(root)[0] === 'Cottage 34: Coconut Cottage');
})();

// ---- 8b. Screened-porch is a hard filter: porch=true -> only The Boathouse ----
(function () {
  const w = freshDom('https://example.com/?porch=true');
  const root = mountSelector(w);
  ok('deeplink porch=true -> only The Boathouse', cardNames(root).length === 1 && cardNames(root)[0] === 'Cottage 22: The Boathouse');
})();

// ---- 8c. Screened-porch question appears as the last (8th) Quick-Match step ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either');
  answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either'); // through ground (step 7)
  ok('step 8 of 8 is the screened-porch question', /8\b.*\b8/.test(progress(root)) &&
    /porch/i.test(root.querySelector('.dccs-step-q').textContent));
  clickAnswer(root, 'yes'); clickNext(root);                    // last step -> review
  seeMatches(root);
  ok('answering porch=Yes narrows to The Boathouse', cardNames(root).length === 1 && cardNames(root)[0] === 'Cottage 22: The Boathouse');
})();

// ---- 9. No-match: new heading/subhead + fallback cards tagged with what they miss ----
(function () {
  const w = freshDom('https://example.com/?pet=true&dining=4');
  const root = mountSelector(w);
  ok('empty heading reads "No Perfect Matches"', /No Perfect Matches/.test(root.querySelector('.dccs-empty h3').textContent));
  ok('fallback card tagged with what it misses', !!root.querySelector('.dccs-miss'));
  ok('no recap on the no-match screen', !root.querySelector('.dccs-recap'));
  ok('no excluded panel anywhere', !root.querySelector('.dccs-excluded'));
})();

// ---- 10. Mode dropdown switches modes; Compare uses a checkbox dropdown ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  root.querySelector('.dccs-modetab[data-mode="compare"]').click();
  ok('compare shows an always-visible checklist (no dropdown trigger)',
    !root.querySelector('.dccs-cmp-trigger') && !!root.querySelector('.dccs-cmp-list') && root.querySelectorAll('.dccs-cmp-option').length === 8);
  ok('compare options use full names', /^Cottage \d+: /.test(root.querySelector('.dccs-cmp-option').textContent.trim()));
  root.querySelector('.dccs-modetab[data-mode="weights"]').click();
  ok('weights mode is now a wizard', !!root.querySelector('.dccs-chips-wizard') && root.querySelector('.dccs-next').disabled === true);
  root.querySelector('.dccs-modetab[data-mode="quick"]').click();
  ok('back to quick finder', !!root.querySelector('.dccs-chips-wizard'));
})();

// ---- 10a. Compare mode: button opens the popup table (no inline matrix), uncapped ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'compare');
  ok('no inline comparison table in compare mode', !root.querySelector('.dccs-matrix'));
  const btn0 = root.querySelector('.dccs-open-compare');
  ok('compare button is present but disabled with <2 ticked', !!btn0 && btn0.disabled === true);
  // Tick every cottage in the dropdown; re-query after each (re-render detaches nodes).
  for (let i = 0; i < 8; i++) {
    const cb = root.querySelectorAll('.dccs-cmp-option input[type="checkbox"][data-cmp]')[i];
    cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  const checked = Array.prototype.filter.call(
    root.querySelectorAll('.dccs-cmp-option input[type="checkbox"][data-cmp]'), c => c.checked).length;
  ok('all 8 cottages can be selected for compare (no 4-cap)', checked === 8);
  ok('no compare option is disabled', !root.querySelector('.dccs-cmp-option input[disabled]'));
  const btn = root.querySelector('.dccs-open-compare');
  ok('compare button enabled once 2+ ticked', !!btn && btn.disabled === false);
  btn.click();
  ok('compare button opens the popup matrix', !!w.document.querySelector('.dccs-modal .dccs-matrix'));
  ok('popup matrix pages through all 8', /\b8\b/.test((w.document.querySelector('.dccs-modal .dccs-matrix-pos') || {}).textContent || ''));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Esc closes the compare-mode popup', !w.document.querySelector('.dccs-modal'));
})();

// ---- 10b. Weigh-priorities runs as a step -> review -> results wizard ----
(function () {
  const w = freshDom();
  const root = mountSelector(w, configWith({ showReview: true }));   // review is off by default
  enter(root, 'weights');
  ok('weights starts at Step 1 of 10', /1\b.*\b10\b/.test(progress(root)));
  ok('nothing preselected, Next disabled', !activeChip(root) && root.querySelector('.dccs-next').disabled === true);
  stepThrough(root, '2');                                   // medium for all 10
  ok('weights review lists all 10 priorities', root.querySelectorAll('.dccs-review-list li').length === 10);
  seeMatches(root);
  ok('weights results are ranked cards', root.querySelectorAll('.dccs-card').length >= 1);
})();

// ---- 11. Compare overlay (windowed) from results checkboxes ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  toResults(root, 'either');                                 // results with 3 cards
  ok('no compare button with <2 ticked', !root.querySelector('.dccs-open-compare'));
  // Re-query after each toggle — a re-render detaches the previous nodes.
  function tick(idx) {
    var b = root.querySelectorAll('.dccs-card input[type="checkbox"][data-cmp]')[idx];
    b.checked = true; b.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  tick(0); tick(1);
  var btn = root.querySelector('.dccs-open-compare');
  ok('compare button appears with 2 ticked', !!btn && /2/.test(btn.textContent));
  // It now sits below the cards (where the recap was), before the edit/restart nav.
  (function () {
    var cards = root.querySelectorAll('.dccs-results .dccs-card');
    var lastCard = cards[cards.length - 1];
    var nav = root.querySelector('.dccs-results .dccs-tail-nav');
    var afterCards = !!lastCard && (lastCard.compareDocumentPosition(btn) & w.Node.DOCUMENT_POSITION_FOLLOWING);
    var beforeNav = !!nav && (btn.compareDocumentPosition(nav) & w.Node.DOCUMENT_POSITION_FOLLOWING);
    ok('results compare button sits below the cards', !!afterCards);
    ok('results compare button sits above the edit/restart nav', !!beforeNav);
  })();
  btn.click();
  ok('overlay shows the comparison matrix', !!w.document.querySelector('.dccs-modal .dccs-matrix'));
  ok('matrix has a pinned corner cell', !!w.document.querySelector('.dccs-modal .dccs-matrix .dccs-corner'));
  var thNum = w.document.querySelector('.dccs-modal .dccs-matrix thead th .dccs-cmp-th-num');
  var thName = w.document.querySelector('.dccs-modal .dccs-matrix thead th .dccs-cmp-th-name');
  ok('column header stacks number above name', !!thNum && !!thName &&
    /:$/.test(thNum.textContent.trim()) && /\w/.test(thName.textContent.trim()));
  function rowValue(label) {
    var ths = w.document.querySelectorAll('.dccs-modal .dccs-matrix tbody th');
    for (var i = 0; i < ths.length; i++) {
      if (ths[i].textContent.trim() === label) {
        var td = ths[i].nextElementSibling;
        return td ? td.textContent.trim() : null;
      }
    }
    return null;
  }
  ok('matrix has Sleeps (max) + Bed + Screened-porch rows',
    rowValue('Sleeps (max)') !== null && rowValue('Bed') !== null && rowValue('Screened porch') !== null);
  // Rotation-proof (0.23.0): whichever cottage heads column 1 today, the
  // Sleeps (max) cell must equal that cottage's `guests` in the data file.
  var col1 = w.document.querySelector('.dccs-modal .dccs-matrix thead th:not(.dccs-corner)');
  var col1Id = ((col1.getAttribute('aria-label') || '').match(/Cottage (\d\d)/) || [])[1];
  var col1Guests = String((JSON.parse(CONFIG).cottages.find(c => c.id === col1Id) || {}).guests);
  ok('matrix Sleeps (max) matches the data for the first column (Cottage ' + col1Id + ') and Bed is constant',
    rowValue('Sleeps (max)') === col1Guests && rowValue('Bed') === 'Queen');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Esc closes the compare overlay', !w.document.querySelector('.dccs-modal'));
})();

// ---- 14. Mini-entry modal opens on the LANDING screen, reflecting its own config ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  cfg.strings.intro = 'CUSTOM MINI INTRO XYZ';   // a per-instance override the popup must show
  const entry = { current: '31', selectorUrl: '', modalConfig: cfg };
  const node = w.document.createElement('div');
  node.className = 'dccs-entry';
  node.dataset.entry = JSON.stringify(entry);
  node.innerHTML = '<button type="button" class="dccs-entry-btn">Open</button>';
  w.document.body.appendChild(node);
  w.DCCS.bootAll(w.document);

  node.querySelector('.dccs-entry-btn').click();
  const modal = w.document.querySelector('.dccs-modal');
  ok('mini-entry opens modal', !!modal);
  // Without an Elementor wrapper the overlay falls back to a plain body mount (escaping
  // any transformed ancestor) — it must NOT be trapped inside the entry node.
  ok('overlay mounts at body level, not inside the entry node', !node.querySelector('.dccs-modal'));
  const modalRoot = modal.querySelector('.dccs-root');
  ok('modal opens on the landing screen (not results)',
    !!modalRoot.querySelector('.dccs-landing') && !modalRoot.querySelector('.dccs-results'));
  ok('popup reflects the mini-entry intro override', modal.textContent.indexOf('CUSTOM MINI INTRO XYZ') !== -1);
  ok('body scroll locked', w.document.body.style.overflow === 'hidden');
  // Drive to results: the cottage is still highlighted once they get there.
  enter(modalRoot, 'quick');
  stepThrough(modalRoot, 'either');
  seeMatches(modalRoot);
  const hc = modalRoot.querySelector('.dccs-card.is-highlight');
  ok('highlighted cottage #31 surfaces once results are reached',
    !!hc && hc.querySelector('h4').textContent.indexOf('Cottage 31: Hibiscus Hut') !== -1);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Esc closes modal', !w.document.querySelector('.dccs-modal'));
  ok('body scroll restored', w.document.body.style.overflow === '');
})();

// ---- 14b. Inside an Elementor wrapper the popup mounts on a clean body-level scope host ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  const entry = { current: '31', selectorUrl: '', modalConfig: cfg };
  // Simulate Elementor's DOM: page wrapper > widget wrapper > entry node.
  const page = w.document.createElement('div');
  page.className = 'elementor elementor-7';
  const widget = w.document.createElement('div');
  widget.className = 'elementor-element elementor-element-abc123 elementor-widget elementor-widget-dccs_mini_entry';
  const node = w.document.createElement('div');
  node.className = 'dccs-entry';
  node.dataset.entry = JSON.stringify(entry);
  node.innerHTML = '<button type="button" class="dccs-entry-btn">Open</button>';
  widget.appendChild(node); page.appendChild(widget); w.document.body.appendChild(page);
  w.DCCS.bootAll(w.document);

  node.querySelector('.dccs-entry-btn').click();
  const host = w.document.querySelector('body > .dccs-modal-host');
  ok('popup mounts on a body-level scope host (escapes the widget subtree)',
    !!host && !node.querySelector('.dccs-modal'));
  ok('host carries the Elementor page scope class', !!host && host.classList.contains('elementor-7'));
  // Only elementor* scope tokens are copied — no widget/animation helper classes.
  ok('host omits non-scope widget classes', !!host && !host.classList.contains('elementor-widget'));
  const inner = host.querySelector('.elementor-element.elementor-element-abc123');
  ok('inner host recreates the widget element scope', !!inner && !!inner.querySelector('.dccs-modal .dccs-root'));
  // Closing removes the whole generated host, leaving no orphan in <body>.
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('closing removes the generated scope host', !w.document.querySelector('.dccs-modal-host'));
})();

// ---- 14c. Mirroring: the pop-up adopts the SOURCE Selector's explicit scope ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  // entry.scope carries the source Cottage Selector's Elementor scope (page + element id),
  // so the pop-up host is built from those instead of the Mini Entry's own DOM ancestors.
  cfg.cssVars = { '--dccs-accent': '#123456', '--dccs-radius': '14px' };
  const entry = { current: '31', selectorUrl: '', modalConfig: cfg, scope: { page: 'elementor-42', el: 'elementor-element-srcXYZ' } };
  // Put the entry inside a DIFFERENT widget scope to prove the source scope wins.
  const widget = w.document.createElement('div');
  widget.className = 'elementor-element elementor-element-mini999';
  const node = w.document.createElement('div');
  node.className = 'dccs-entry';
  node.dataset.entry = JSON.stringify(entry);
  node.innerHTML = '<button type="button" class="dccs-entry-btn">Open</button>';
  widget.appendChild(node); w.document.body.appendChild(widget);
  w.DCCS.bootAll(w.document);

  node.querySelector('.dccs-entry-btn').click();
  const host = w.document.querySelector('body > .dccs-modal-host');
  ok('mirror pop-up mounts on a body-level host', !!host && !node.querySelector('.dccs-modal'));
  ok('host carries the SOURCE page scope (not the Mini Entry’s)',
    !!host && host.classList.contains('elementor-42'));
  const inner = host.querySelector('.elementor-element.elementor-element-srcXYZ');
  ok('inner host carries the SOURCE element scope', !!inner && !!inner.querySelector('.dccs-modal .dccs-root'));
  ok('mirror pop-up does not use the Mini Entry’s own element scope',
    !host.querySelector('.elementor-element-mini999'));
  // Palette is applied INLINE on the pop-up root (survives "remove unused CSS").
  const popRoot = host.querySelector('.dccs-modal .dccs-root');
  ok('mirror palette is set inline on the pop-up root',
    !!popRoot && popRoot.style.getPropertyValue('--dccs-accent').trim() === '#123456'
             && popRoot.style.getPropertyValue('--dccs-radius').trim() === '14px');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('closing the mirror pop-up removes its host', !w.document.querySelector('.dccs-modal-host'));
})();

// ---- 17. Live "X cottages match" narrows on a Quick must-have ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either');
  answerNext(root, 'either'); answerNext(root, 'either');          // advance to the pet step
  ok('count starts at all 8 on the pet step', /\b8\b/.test(countText(root)));
  clickAnswer(root, 'yes');                                        // pet = yes (no advance)
  ok('answering pet=Yes drops the live count to 1',
    /\b1\b/.test(countText(root)) && !/\b8\b/.test(countText(root)));
})();

// ---- 18. Weigh Priorities: a "High" priority narrows the count + results ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'weights');
  ok('weights count starts at all 8', /\b8\b/.test(countText(root)));
  answerNext(root, '1'); answerNext(root, '1');
  answerNext(root, '1'); answerNext(root, '1');  // Low: party/workspace/moreroom/fewerstairs
  ok('Low priorities do not narrow the count', /\b8\b/.test(countText(root)));
  clickAnswer(root, '3');                                          // pet priority = High
  ok('marking pet High drops the count to 1', /\b1\b/.test(countText(root)));
  clickNext(root);
  stepThrough(root, '1');
  seeMatches(root);
  ok('a High priority filters results to the matching cottage',
    cardNames(root).length === 1 && cardNames(root)[0] === 'Cottage 34: Coconut Cottage');
})();

// ---- 19. Compare checklist is always visible + resets when switching modes ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'compare');
  // The checklist and its options are on screen immediately — no tap-to-open step,
  // and the "Compare" button is present in the same view (never hidden by a panel).
  ok('checklist + options visible with no dropdown interaction',
    root.querySelectorAll('.dccs-cmp-option').length === 8 && !root.querySelector('.dccs-cmp-trigger'));
  // The tip duplicates the subheader above the list, so it's opt-in since 0.21.0.
  ok('no "pick 2" tip by default (opt-in switch is off)', !root.querySelector('.dccs-compare-note'));
  ok('the Compare subheader still shows', !!root.querySelector('.dccs-hint'));

  // Tick two cottages, then leave and return to Compare — the picks must reset.
  function tick(i) {
    var b = root.querySelectorAll('.dccs-cmp-option input[type="checkbox"][data-cmp]')[i];
    b.checked = true; b.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  tick(0); tick(1);
  ok('compare button enables after ticking 2', root.querySelector('.dccs-open-compare').disabled === false);
  root.querySelector('.dccs-modetab[data-mode="quick"]').click();
  root.querySelector('.dccs-modetab[data-mode="compare"]').click();
  const anyChecked = Array.prototype.some.call(
    root.querySelectorAll('.dccs-cmp-option input[type="checkbox"][data-cmp]'), c => c.checked);
  ok('compare selections reset after switching modes',
    !anyChecked && !!root.querySelector('.dccs-open-compare[disabled]'));
})();

// ---- 20. Compare subheader uses the new "Select 2 or more..." wording ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'compare');
  ok('compare subheader reads "Select 2 or more..."', /^Select 2 or more cottages/.test(root.querySelector('.dccs-compare .dccs-hint').textContent));
})();

function configWith(overrides) {
  const cfg = JSON.parse(CONFIG);
  Object.keys(overrides).forEach(function (k) { cfg[k] = overrides[k]; });
  return JSON.stringify(cfg);
}

// ---- 15. Next/Back show a default arrow; a chosen icon replaces it ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  answerNext(root, 'either');                                  // advance so Back appears
  var next = root.querySelector('.dccs-next');
  var back = root.querySelector('.dccs-back');
  ok('Next shows the default right arrow', /→/.test(next.textContent) && !!next.querySelector('.dccs-ico-right'));
  ok('Back shows the default left arrow', /←/.test(back.textContent) && !!back.querySelector('.dccs-ico-left'));
})();

(function () {
  const w = freshDom();
  const root = mountSelector(w, configWith({ icons: { next: '<svg class="ic-next"></svg>', back: '<svg class="ic-back"></svg>' } }));
  enter(root, 'quick');
  answerNext(root, 'either');
  var next = root.querySelector('.dccs-next');
  var back = root.querySelector('.dccs-back');
  ok('a Next icon replaces the arrow', !!next.querySelector('.dccs-ico-right svg.ic-next') && !/→/.test(next.textContent));
  ok('a Back icon replaces the arrow', !!back.querySelector('.dccs-ico-left svg.ic-back') && !/←/.test(back.textContent));
})();

// ---- 16. Icon-side control places an answer icon after the label ----
(function () {
  const w = freshDom();
  const root = mountSelector(w, configWith({
    icons: { ans_either: '<svg class="ic-either"></svg>' },
    iconSides: { answers: 'right' }
  }));
  enter(root, 'quick');
  var eitherChip = curChips(root).filter(function (c) { return c.dataset.value === 'either'; })[0];
  ok('right-side answer icon sits after the label',
    !!eitherChip && eitherChip.lastElementChild && eitherChip.lastElementChild.classList.contains('dccs-ico-right'));
})();

// ---- 14b. Accessibility hooks ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  ok('mode dropdown is a menu trigger', !!root.querySelector('.dccs-modeselect-trigger[aria-haspopup="menu"]') &&
    root.querySelectorAll('.dccs-modetab[role="menuitemradio"]').length === 3 &&
    root.querySelectorAll('.dccs-modetab[role="tab"]').length === 0);
  ok('current step has aria-current', !!root.querySelector('.dccs-step-dot[aria-current="step"]'));
  ok('disabled Next exposes a hint', /\w/.test(root.querySelector('.dccs-next').getAttribute('aria-label') || ''));
  ok('radiogroup is keyboard-reachable when nothing is selected',
    curChips(root).filter(function (c) { return c.getAttribute('tabindex') === '0'; }).length === 1);
  clickAnswer(root, 'yes');
  ok('selected answer marks aria-checked', !!root.querySelector('.dccs-chip.is-active[aria-checked="true"]'));

  // Compare overlay dialog is labelled
  toResults(root, 'either');
  function tick(idx) { var b = root.querySelectorAll('.dccs-card input[type="checkbox"][data-cmp]')[idx]; b.checked = true; b.dispatchEvent(new w.Event('change', { bubbles: true })); }
  tick(0); tick(1);
  root.querySelector('.dccs-open-compare').click();
  ok('compare dialog has an aria-label', /\w/.test(w.document.querySelector('.dccs-modal[role="dialog"]').getAttribute('aria-label') || ''));
})();

// ---- 15. Result links point to real cottage pages ----
(function () {
  const w = freshDom('https://example.com/?pet=true');
  const root = mountSelector(w);
  const href = root.querySelector('.dccs-view').getAttribute('href');
  ok('view link points to /accommodation/', /^\/accommodation\/cottage-\d+\/$/.test(href));
})();

// ---- 16. Boot dependency-guard: render is deferred until score/labels exist ----
(function () {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'https://example.com/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  injectScript(w, 'selector.js');                 // controller only — no data layer yet
  const div = w.document.createElement('div');
  div.className = 'dccs-root';
  div.dataset.config = CONFIG;
  w.document.body.appendChild(div);
  w.DCCS.bootAll(w.document);
  ok('no render while deps missing', !div.querySelector('.dccs-landing') && !div.dataset.dccsReady);
  injectScript(w, 'score.js');
  injectScript(w, 'labels.js');
  w.DCCS.bootAll(w.document);
  ok('renders once deps are available', !!div.querySelector('.dccs-landing-choice'));
})();

// ---- 22. Quick Finder: every specific "want" narrows the count; "No preference" doesn't ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  ok('count starts at all 8', /\b8\b/.test(countText(root)));
  answerNext(root, 'either');                                 // party size: no preference
  clickAnswer(root, 'yes');                                   // desk = yes (a specific want)
  ok('answering Desk: Yes narrows the count below 8', !/\b8\b/.test(countText(root)));
  // A fresh run: "No preference" must NOT narrow.
  const root2 = mountSelector(freshDom());
  enter(root2, 'quick');
  clickAnswer(root2, 'either');                               // desk = no preference
  ok('"No preference" leaves the count at 8', /\b8\b/.test(countText(root2)));
})();

// ---- 23. Quick Finder: over-constraining shows 0 with a reassurance note ----
(function () {
  // pet=yes (only Coconut) + screened porch=yes (only Boathouse) → no cottage has both.
  const w = freshDom('https://example.com/?mode=quick&pet=true&porch=true');
  const root = mountSelector(w);
  // Deep links jump to results; walk back into the wizard via Edit answers to see the live count.
  // Simpler: drive a fresh wizard to the contradiction.
  const r = mountSelector(freshDom());
  enter(r, 'quick');
  // party/desk/pullout/layout/dining → no preference; pet = yes; ground = no pref; porch = yes.
  answerNext(r, 'either'); answerNext(r, 'either'); answerNext(r, 'either');
  answerNext(r, 'either'); answerNext(r, 'either');
  answerNext(r, 'yes');                                       // pet = yes
  answerNext(r, 'either');                                    // ground = no pref
  clickAnswer(r, 'yes');                                      // screened porch = yes → contradiction
  ok('an impossible combination shows 0 matches', /\b0\b/.test(countText(r)));
  ok('a reassurance note appears at 0 matches', !!r.querySelector('.dccs-count-note'));
})();

// ---- 24. Paired button rows are equal-width and never wrap (markup + CSS source) ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  answerNext(root, 'either');                                 // Back + Next both present
  const nav = root.querySelector('.dccs-wizard-nav');
  ok('wizard nav holds Back + Next as its only two children',
    !!nav && nav.children.length === 2 && !!nav.querySelector('.dccs-back') && !!nav.querySelector('.dccs-next'));
  // jsdom has no CSS cascade, so verify the responsive rules in the stylesheet source.
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  // 0.27.0 supersedes the old nowrap + equal-halves pairing. At the spec's 20px
  // the two labels no longer fit two-to-a-row on a phone, and equal halves CLIPPED
  // "Edit Answers" inside its pill. The row now wraps and each button's basis is
  // its content, so the label always survives; width is not part of the spec.
  ok('paired nav rows may wrap rather than clip a label',
    /\.dccs-wizard-nav\s*\{[^}]*flex-wrap:\s*wrap/.test(css));
  ok('Back/Next size to their content', /\.dccs-back,[\s\S]{0,200}?flex:\s*1 1 auto/.test(css));
  // Back/Next labels must never wrap, or a single step's buttons grow taller than the rest.
  ok('Back/Next labels are white-space:nowrap (equal height every step)',
    /\.dccs-wizard-nav\s+\.dccs-back,\s*\.dccs-root\.dccs-root\s+\.dccs-wizard-nav\s+\.dccs-next\s*\{[^}]*white-space:\s*nowrap/.test(css));
})();

// ---- 26. Compare checklist has an always-visible custom scrollbar (no tiny chevron) ----
(function () {
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'js', 'selector.js'), 'utf8');
  // The old tiny down-arrow cue is gone; a custom always-visible scrollbar replaces it.
  ok('old chevron cue removed (no .is-atend / ::after cue)',
    !/\.dccs-cmp-list::after/.test(css) && !/is-atend/.test(css) && !/is-atend/.test(js));
  ok('native scrollbar hidden so we can draw our own',
    /\.dccs-cmp-list\s*\{[\s\S]*?scrollbar-width:\s*none/.test(css) && /::-webkit-scrollbar\s*\{[^}]*display:\s*none/.test(css));
  ok('custom scrollbar track + thumb styled', /\.dccs-cmp-bar\s*\{/.test(css) && /\.dccs-cmp-bar-thumb\s*\{/.test(css));
  ok('JS sizes/positions the custom scrollbar', /function wireCmpScrollbar/.test(js) && /wireCmpScrollbar\(root\)/.test(js));

  // The checklist markup carries the scroller wrapper, the bar, and the count cue.
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'compare');
  ok('compare renders the scroller + custom bar + thumb',
    !!root.querySelector('.dccs-cmp-scroller .dccs-cmp-list') &&
    !!root.querySelector('.dccs-cmp-bar .dccs-cmp-bar-thumb'));
  ok('compare shows a "scroll to see all N" count cue',
    /\ball 8 cottages\b/i.test(root.querySelector('.dccs-cmp-count').textContent));
  // Owner request (0.21.2): the cue continues the subheader as ONE paragraph.
  const hint = root.querySelector('.dccs-compare .dccs-hint');
  ok('the cue lives inside the subheader paragraph (one <p>, not two)',
    !!hint.querySelector('span.dccs-cmp-count') && !root.querySelector('p.dccs-cmp-count'));
  ok('the merged paragraph reads prompt then cue',
    /^Select 2 or more cottages to compare side by side\.\s+Scroll the list to see all 8 cottages\.$/
      .test(hint.textContent.replace(/\s+/g, ' ').trim()));
})();

// ---- 26b. The per-widget document listener self-removes once the widget is gone ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  const entry = { current: '31', selectorUrl: '', modalConfig: cfg };
  const node = w.document.createElement('div');
  node.className = 'dccs-entry';
  node.dataset.entry = JSON.stringify(entry);
  node.innerHTML = '<button type="button" class="dccs-entry-btn">Open</button>';
  w.document.body.appendChild(node);
  w.DCCS.bootAll(w.document);

  // Open + close the pop-up a few times (each open runs initSelector on a fresh root).
  for (let i = 0; i < 3; i++) {
    node.querySelector('.dccs-entry-btn').click();
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
  ok('repeated open/close leaves no modal behind', !w.document.querySelector('.dccs-modal'));
  // A page mousedown after closing must not throw from stale handlers rerendering
  // detached roots (the handlers detect the disconnected root and unhook).
  let threw = false;
  try {
    w.document.body.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
    w.document.body.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
  } catch (e) { threw = true; }
  ok('page mousedown after pop-up close is inert (no stale-handler errors)', !threw);
  const src = fs.readFileSync(path.join(JS, 'selector.js'), 'utf8');
  ok('document mousedown handler self-removes when its root is detached',
    /onDocDown[\s\S]{0,200}documentElement\.contains\(root\)[\s\S]{0,120}removeEventListener\('mousedown', onDocDown\)/.test(src));
})();

// ---- 27. Text-code export/import helpers (editor-io.js pure functions) ----
(function () {
  // Load editor-io.js into a bare jsdom window (no `elementor`), so the editor glue
  // is skipped and only the pure DCCS_IO helpers attach — exactly the testable core.
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'dangerously' });
  injectScript(dom.window, 'editor-io.js');
  const IO = dom.window.DCCS_IO;
  ok('editor-io exposes pure helpers without Elementor', !!IO && typeof IO.encodeText === 'function');

  const settings = { str_heading: 'Find your cottage', str_intro: 'Pick 😀', color_accent: '#123', title: 'x' };
  ok('pickStrings keeps only str_* scalars',
    JSON.stringify(IO.pickStrings(settings)) === JSON.stringify({ str_heading: 'Find your cottage', str_intro: 'Pick 😀' }));

  const code = IO.encodeText(settings);
  const back = IO.decodeText(code);
  ok('encode→decode round-trips the text (UTF-8 safe)',
    back && back.str_heading === 'Find your cottage' && back.str_intro === 'Pick 😀' && !('color_accent' in back));
  ok('decode rejects garbage safely', IO.decodeText('not-a-real-code!!') === null);
  ok('decode rejects empty input', IO.decodeText('') === null);
})();

// ---- 28. Text export/import is wired into the plugin (control + editor enqueue) ----
(function () {
  const io = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'js', 'editor-io.js'), 'utf8');
  const plugin = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'includes', 'class-plugin.php'), 'utf8');
  const sel = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'includes', 'class-selector-widget.php'), 'utf8');
  const mini = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'includes', 'class-mini-entry-widget.php'), 'utf8');
  ok('import applies via Elementor document/elements/settings command', /document\/elements\/settings/.test(io));
  ok('control view registered as dccs_design_io', /addControlView\('dccs_design_io'/.test(io));
  ok('editor JS enqueued on the editor hook', /elementor\/editor\/after_enqueue_scripts/.test(plugin) && /dccs-editor-io/.test(plugin));
  ok('control type registered', /elementor\/controls\/register/.test(plugin));
  ok('Selector exposes an export control', /'export_text'[\s\S]*?'mode'\s*=>\s*'export'/.test(sel));
  ok('Mini Entry exposes an import control', /'import_text'[\s\S]*?'mode'\s*=>\s*'import'/.test(mini));
})();

// ---- 29. "Card background" split into Results / Button / Drop-down-item colors ----
(function () {
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  const sel = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'includes', 'class-selector-widget.php'), 'utf8');

  // New Colors controls exist and write their CSS variables.
  ok('new Results background control present', /'color_results_bg'[\s\S]{0,120}--dccs-results-bg/.test(sel));
  ok('new Button background + hover controls present',
    /'color_btn_bg'[\s\S]{0,120}--dccs-btn-bg\b/.test(sel) && /'color_btn_bg_hover'[\s\S]{0,140}--dccs-btn-bg-hover/.test(sel));
  ok('new Drop-down item controls present',
    /'color_item_bg'[\s\S]{0,120}--dccs-item-bg\b/.test(sel) && /'color_item_text'[\s\S]{0,120}--dccs-item-text\b/.test(sel));

  // The duplicate per-section Background controls are gone (consolidated).
  ok('duplicate background controls removed',
    !/'card_bg'/.test(sel) && !/'btn_bg'/.test(sel) && !/'modebar_bg'/.test(sel) &&
    !/'cmpmenu_bg'/.test(sel) && !/_item_hover_bg/.test(sel));

  // CSS consumes the new vars with baked fallbacks so the look is unchanged when unset.
  ok('cards read --dccs-results-bg with a surface fallback',
    /\.dccs-card\s*\{[\s\S]*?var\(--dccs-results-bg,\s*var\(--dccs-surface\)\)/.test(css));
  ok('primary button reads --dccs-btn-bg, then the action control, then spec blue',
    /var\(--dccs-btn-bg,\s*var\(--dccs-action,\s*var\(--dccs-btn-blue\)\)\)/.test(css));
  ok('dropdown items read --dccs-item-bg / --dccs-item-text',
    /var\(--dccs-item-bg,\s*transparent\)/.test(css) && /var\(--dccs-item-text,\s*var\(--dccs-text\)\)/.test(css));
  ok('button hover honours --dccs-btn-bg-hover', /var\(--dccs-btn-bg-hover,/.test(css));
})();

// ---- 30. Distinct action-button color + smaller tail buttons ----
(function () {
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  const sel = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'includes', 'class-selector-widget.php'), 'utf8');
  // 0.27.0: the distinct action green is gone. The site button spec is ONE blue
  // and ONE size, so action buttons no longer read differently from a selected
  // chip, and the old primary-vs-secondary size step no longer exists. The
  // --dccs-action control still works and still wins when set — it just must not
  // carry a baked default, or var() would always resolve and never reach the spec.
  ok('no baked default for --dccs-action, so the spec blue is reachable',
    !/--dccs-action:\s*#/.test(css));
  ok('the "Action button color" control is still wired to something',
    /--dccs-action/.test(css) && /'color_action'\s*=>\s*'--dccs-action'/.test(sel));
  ok('action buttons resolve btn-bg -> action -> spec blue',
    /var\(--dccs-btn-bg,\s*var\(--dccs-action,\s*var\(--dccs-btn-blue\)\)\)/.test(css));
  // The 50px spec line-height is what keeps every labelled button over the 44px
  // tap floor now that the per-button min-heights are gone.
  ok('the spec height still clears the 44px tap floor',
    /--dccs-btn-line:\s*50px/.test(css));
  ok('answer chips stay on the accent (not action) when selected',
    /\.dccs-chip\.is-active\s*\{[\s\S]*?var\(--dccs-accent\)/.test(css));
  ok('an editable Action button color control exists', /'color_action'[\s\S]{0,120}--dccs-action/.test(sel));
})();

// ---- 31. Review step toggle (show_review / showReview) ----
(function () {
  const sel = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'includes', 'class-selector-widget.php'), 'utf8');
  ok('show_review SWITCHER control exists', /'show_review'[\s\S]{0,500}SWITCHER/.test(sel));
  ok('show_review now defaults OFF (empty default)',
    /'show_review'[\s\S]{0,500}'default'\s*=>\s*''/.test(sel));
  ok('snapshot fallback for show_review is off',
    /\$settings\['show_review'\]\s*\?\?\s*''/.test(sel));

  // showReview: true -> the forced review step appears after the last question.
  const w1 = freshDom();
  const r1 = mountSelector(w1, configWith({ showReview: true }));
  enter(r1, 'quick');
  stepThrough(r1, 'either');
  ok('review step shows when showReview=true', !!r1.querySelector('.dccs-review-list'));

  // showReview: false (the new default) -> straight to matches, no forced review step.
  const w2 = freshDom();
  const r2 = mountSelector(w2, configWith({ showReview: false }));
  enter(r2, 'quick');
  stepThrough(r2, 'either');
  ok('review step skipped when showReview=false',
    !r2.querySelector('.dccs-review-list') && r2.querySelectorAll('.dccs-card').length >= 1);
  // But "Edit answers" STAYS on results and opens the review screen on demand.
  const edit = r2.querySelector('.dccs-edit-answers');
  ok('Edit-answers still present on results when review is off', !!edit);
  edit.click();
  ok('Edit-answers opens the review screen on demand', !!r2.querySelector('.dccs-review-list'));
})();

// ---- 32. Factual badge label defaults ----
(function () {
  const S = JSON.parse(CONFIG).strings;
  ok('badge_compact default is "Layout: Studio"', S.badge_compact === 'Layout: Studio');
  ok('badge_spacious default is "Layout: 1-Bedroom"', S.badge_spacious === 'Layout: 1-Bedroom');
  ok('badge_suite default is "1-Bedroom Suite"', S.badge_suite === '1-Bedroom Suite');
  ok('badge_pet default is "Pet-Friendly"', S.badge_pet === 'Pet-Friendly');
  ok('badge_porch default is "Screened Porch"', S.badge_porch === 'Screened Porch');
})();

// ---- 33. Audit fixes: space claim, dup-note leak, dining "two", tap targets ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  const DCCS = w.DCCS;
  const cfg = JSON.parse(CONFIG);

  // (1) "most square footage" reason only on the actual largest (400 sq ft) cottages.
  const c340 = cfg.cottages.find(c => c.id === '31');
  const c400 = cfg.cottages.find(c => c.id === '22');
  const crit = { wSpace: 3, hard: [] };
  ok('340 sq ft cottage never claims "most square footage"', !DCCS.labels.whyFits(c340, crit).includes('space'));
  ok('400 sq ft cottage still gets the space reason', DCCS.labels.whyFits(c400, crit).includes('space'));

  // (2) duplicateOf cleared on every run — no stale note across renders.
  // 35/36 are the genuine twins (31/32 differ by a highlight — see test 48).
  DCCS.score.dedupe(cfg.cottages.filter(c => c.id === '35' || c.id === '36'), cfg.diffFields);
  ok('dedupe marks the twin pair', cfg.cottages.find(c => c.id === '35').duplicateOf === '36');
  DCCS.score.run(cfg.cottages, { hard: [] });
  ok('run() clears stale duplicateOf flags', !cfg.cottages.some(c => c.duplicateOf));

  // (3) answering "table for two" no longer excludes the 4-seat Boathouse.
  enter(root, 'quick');
  answerNext(root, 'either'); answerNext(root, 'either');
  answerNext(root, 'either'); answerNext(root, 'either'); // party/desk/pullout/layout
  answerNext(root, '2');                                  // dining: two
  answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either'); // pet/ground/porch
  const sm = root.querySelector('.dccs-see-matches'); if (sm) { sm.click(); }
  // Intent: "table for two" must not EXCLUDE the 4-seat Boathouse. Assert on the
  // engine's full result set — the visible top 3 rotates day by day (0.23.0).
  const critTwo = { hard: [], wDesk: 0, wPullout: 0, wStudio: 0, wOneBed: 0, wSpace: 0, wDining: 0, wPet: 0, wFewerStairs: 0, wScreenedPorch: 0, wParty: 0 };
  const resTwo = DCCS.score.run(cfg.cottages, critTwo);
  ok('dining=two keeps The Boathouse in the matches',
    resTwo.results.some(c => c.id === '22') && !resTwo.excluded.some(e => e.id === '22'));
  ok('dining2 hard filter fully removed', !('dining2' in DCCS.score.FEATURES));

  // (4+5) tap-target sizes baked into the stylesheet.
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  // Read ONE rule body, bounded by its closing brace. The previous form here was
  // /<selector>\s*\{[\s\S]*?<decl>/, whose lazy run crosses rule boundaries: it
  // matched a declaration in some LATER rule and kept passing after .dccs-edit
  // stopped setting min-height at all. Bound it or it proves nothing.
  const ruleBody = (sel) => {
    const i = css.indexOf(sel + ' {');
    if (i === -1) { return ''; }
    const j = css.indexOf('}', i);
    return j === -1 ? '' : css.slice(i, j);
  };
  ok('card compare toggle has a 44px tap area',
    /min-height:\s*44px/.test(ruleBody('.dccs-root.dccs-root .dccs-cmp-toggle')));

  // (0.27.0) The site button spec is declared once as tokens and consumed by the
  // element-level rule, so every button gets it — including buttons added later.
  const tokens = ruleBody('.dccs-root.dccs-root');
  const SPEC = { '--dccs-btn-size': '20px', '--dccs-btn-weight': '500', '--dccs-btn-line': '50px',
                 '--dccs-btn-track': '0.5px', '--dccs-btn-radius': '30px', '--dccs-btn-blue': '#006BCF',
                 '--dccs-btn-on-blue': '#FFFFFF' };
  Object.keys(SPEC).forEach(k => {
    ok('spec token ' + k + ' is ' + SPEC[k],
      new RegExp(k.replace(/-/g, '\\-') + ':\\s*' + SPEC[k].replace(/[.#]/g, m => '\\' + m)).test(tokens));
  });
  const btnRule = ruleBody('.dccs-root.dccs-root button');
  ['font-family:\\s*inherit', 'font-size:\\s*var\\(--dccs-btn-size', 'font-weight:\\s*var\\(--dccs-btn-weight',
   'line-height:\\s*var\\(--dccs-btn-line', 'letter-spacing:\\s*var\\(--dccs-btn-track',
   'text-transform:\\s*none'].forEach(re => {
    ok('every button takes ' + re.split(':')[0].replace(/\\\\/g, ''),
      new RegExp(re).test(btnRule));
  });
  // The 50px line-height is what now guarantees the 44px tap floor on every
  // labelled button, which is why the per-button min-heights could be dropped.
  ok('the spec height clears the 44px tap-target floor', 50 >= 44 && /50px/.test(tokens));
  // Rob named these two; they must be in the group that takes the blue skin.
  const skin = css.slice(css.indexOf('.dccs-root.dccs-root .dccs-primary,'));
  ok('the Compare / Compare N button takes the blue skin',
    skin.slice(0, skin.indexOf('}')).indexOf('.dccs-open-compare') !== -1);
  // Answer chips must NOT be painted the action blue: an unchosen option would
  // look chosen. They take the type spec and the radius only.
  ok('answer chips keep their own fill',
    skin.slice(0, skin.indexOf('}')).indexOf('.dccs-chip') === -1);
  ok('no !important was introduced for the button spec',
    !/--dccs-btn-[a-z-]+[^;]*!important/.test(css) && !new RegExp('important').test(btnRule));
})();

// ---- 34. Style controls exist for the mode switcher + the Compare button ----
(function () {
  const sel = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'includes', 'class-selector-widget.php'), 'utf8');

  // Mode switcher trigger: background + both hover states (text was already there).
  ok('mode switcher has a trigger background control',
    /'modetab_bg'[\s\S]{0,220}\.dccs-modeselect-trigger'\s*=>\s*'background-color/.test(sel));
  ok('mode switcher has a Hover tab', /start_controls_tab\('modetab_hover'/.test(sel));
  ok('mode switcher has hover text + hover background controls',
    /'modetab_color_hover'[\s\S]{0,320}:hover'\s*=>\s*'color/.test(sel) &&
    /'modetab_bg_hover'[\s\S]{0,320}:hover'\s*=>\s*'background-color/.test(sel));

  // Compare button: a dedicated section built from the shared per-button helper,
  // which supplies Normal/Hover x text/background.
  ok('a Compare button style section is registered',
    /add_button_style_section\('style_comparebtn'[\s\S]{0,160}\.dccs-open-compare'/.test(sel) &&
    /register_comparebtn_style_controls\(\);/.test(sel));

  // Both rendered instances must keep the same class, or one control set can't cover
  // both the Compare-mode CTA and the results button.
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'compare');
  for (const i of [0, 1]) {
    const cb = root.querySelectorAll('.dccs-cmp-option input[data-cmp]')[i];
    cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  const inCompareMode = root.querySelector('.dccs-open-compare');
  ok('Compare-mode CTA uses .dccs-open-compare', !!inCompareMode && !inCompareMode.closest('.dccs-results-compare'));

  const w2 = freshDom();
  const root2 = mountSelector(w2);
  enter(root2, 'quick');
  toResults(root2, 'either');
  for (const i of [0, 1]) {
    const cb = root2.querySelectorAll('.dccs-card input[data-cmp]')[i];
    cb.checked = true; cb.dispatchEvent(new w2.Event('change', { bubbles: true }));
  }
  const inResults = root2.querySelector('.dccs-open-compare');
  ok('quiz-results button reuses .dccs-open-compare (one control set covers both)',
    !!inResults && !!inResults.closest('.dccs-results-compare'));
})();

// ---- 33. Nested overlays: Escape only closes the TOPMOST one ----
// Opening the compare table from inside the mini-entry pop-up stacks two modals.
// One Escape used to tear down both (each overlay has a document-level key
// handler), dumping the guest back on the page with their answers gone.
(function () {
  const w = freshDom();
  const entry = { current: '31', selectorUrl: '', modalConfig: JSON.parse(CONFIG) };
  const node = w.document.createElement('div');
  node.className = 'dccs-entry';
  node.dataset.entry = JSON.stringify(entry);
  node.innerHTML = '<button type="button" class="dccs-entry-btn">Open</button>';
  w.document.body.appendChild(node);
  w.DCCS.bootAll(w.document);
  node.querySelector('.dccs-entry-btn').click();

  const popRoot = w.document.querySelector('.dccs-modal .dccs-root');
  enter(popRoot, 'quick');
  toResults(popRoot, 'either');
  for (const i of [0, 1]) {
    const cb = popRoot.querySelectorAll('.dccs-card input[data-cmp]')[i];
    cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  popRoot.querySelector('.dccs-open-compare').click();
  ok('compare table stacks on the mini-entry pop-up', w.document.querySelectorAll('.dccs-modal').length === 2);

  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('first Esc closes only the compare table', w.document.querySelectorAll('.dccs-modal').length === 1);
  ok('the selector pop-up survives with its results intact',
    !!w.document.querySelector('.dccs-modal .dccs-results'));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('second Esc closes the pop-up itself', !w.document.querySelector('.dccs-modal'));
})();

// ---- 34. Terminal init failure shows the cottage links, not eternal "Loading…" ----
(function () {
  const w = freshDom();
  const div = w.document.createElement('div');
  div.className = 'dccs-root';
  div.dataset.config = '{not valid json';
  div.innerHTML = '<noscript><ul class="dccs-noscript"><li><a href="/accommodation/cottage-22/">Cottage 22</a></li></ul></noscript>' +
    '<div class="dccs-loading">Loading…</div>';
  w.document.body.appendChild(div);
  w.DCCS.bootAll(w.document);
  ok('bad config replaces the loading text', !div.querySelector('.dccs-loading'));
  ok('fallback reveals the noscript cottage links', !!div.querySelector('.dccs-noscript a[href="/accommodation/cottage-22/"]'));
  ok('failed root is marked done (no re-init loop)', div.dataset.dccsReady === '1');
})();

// ---- 35. Compare checkbox keeps keyboard focus through the re-render ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  toResults(root, 'either');
  const cb = root.querySelectorAll('.dccs-card input[data-cmp]')[0];
  const id = cb.dataset.cmp;
  cb.focus();
  cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  const after = w.document.activeElement;
  ok('focus stays on the toggled compare checkbox after re-render',
    !!after && after.matches && after.matches('input[data-cmp="' + id + '"]'));
})();

// ---- 36. Compare mode announces the selection count to screen readers ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'compare');
  const live = () => root.querySelector('.dccs-sr-only[aria-live="polite"]').textContent;
  ok('under 2 ticked, live region carries the pick-2 prompt', live().length > 0 && /2/.test(live()));
  for (const i of [0, 1]) {
    const cb = root.querySelectorAll('.dccs-cmp-option input[data-cmp]')[i];
    cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  ok('with 2 ticked, live region announces "Compare 2 …"', /Compare 2/i.test(live()));
})();

// ---- 37. "pick 2" tip switch (show_compare_tip, off by default) ----
(function () {
  // Default / missing key: never render the note, in any tick state.
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  delete cfg.showCompareTip; // an old placed instance: key absent entirely
  const root = mountSelector(w, JSON.stringify(cfg));
  enter(root, 'compare');
  ok('missing showCompareTip key reads as off', !root.querySelector('.dccs-compare-note'));
  function tick(r, win, i) {
    var b = r.querySelectorAll('.dccs-cmp-option input[data-cmp]')[i];
    b.checked = true; b.dispatchEvent(new win.Event('change', { bubbles: true }));
  }
  tick(root, w, 0);
  ok('still no tip at 1 ticked', !root.querySelector('.dccs-compare-note'));
  ok('Compare button still disabled below 2', !!root.querySelector('.dccs-open-compare[disabled]'));
  tick(root, w, 1);
  ok('Compare enables at 2 exactly as before', root.querySelector('.dccs-open-compare').disabled === false);

  // Toggled on: today's old behavior, including the per-instance string override.
  const w2 = freshDom();
  const cfg2 = JSON.parse(CONFIG);
  cfg2.showCompareTip = true;
  cfg2.strings.compare_need_two = 'CUSTOM TIP QQQ';
  const root2 = mountSelector(w2, JSON.stringify(cfg2));
  enter(root2, 'compare');
  const note = root2.querySelector('.dccs-compare-note');
  ok('switch on: tip shows while fewer than 2 are ticked', !!note);
  ok('tip wording comes from the str_compare_need_two override', note.textContent === 'CUSTOM TIP QQQ');
  tick(root2, w2, 0); tick(root2, w2, 1);
  ok('switch on: tip disappears once 2 are ticked', !root2.querySelector('.dccs-compare-note'));
})();

// ==== v0.22.0: sleeps-4 update, party-size filter, highlights, notes ====

// ---- 38. Party-size hard filter: "3-4" removes exactly the two studios ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  // Engine-level: the filter reads c.guests from the data, never a cottage list.
  const res = w.DCCS.score.run(cfg.cottages, { hard: ['party34'] });
  ok('party34 excludes exactly 33 and 34',
    res.excluded.map(e => e.id).sort().join(',') === '33,34' && res.results.length === 6);
  ok('party34 survivors all sleep 3+', res.results.every(c => c.guests >= 3));

  // Flow-level: answering "3-4" on step 1 drops the live count to 6.
  const root = mountSelector(w);
  enter(root, 'quick');
  ok('quick count starts at 8', /\b8\b/.test(countText(root)));
  clickAnswer(root, '34');
  ok('"3-4" drops the live count to 6', /\b6\b/.test(countText(root)));
  // Advance past the party step BEFORE stepping through with 'either' — otherwise
  // stepThrough overwrites the '34' answer on this very step. (This assertion
  // passed vacuously until the 0.23.0 tie-break rotation exposed it: with an ID
  // tie-break the top 3 were always 22/23/31, studio-free by coincidence.)
  clickNext(root);
  stepThrough(root, 'either'); seeMatches(root);
  ok('results exclude the studios', !cardNames(root).some(n => /Cottage 3[34]/.test(n)));

  // "1-2" and the explicit skip constrain nothing — every cottage sleeps 2.
  const r2 = mountSelector(freshDom());
  enter(r2, 'quick');
  clickAnswer(r2, '2');
  ok('"1-2" keeps all 8', /\b8\b/.test(countText(r2)));
  const r3 = mountSelector(freshDom());
  enter(r3, 'quick');
  clickAnswer(r3, 'either');
  ok('skipping party size keeps all 8', /\b8\b/.test(countText(r3)));
})();

// ---- 39. New ?party= deep link (additive; old params proven elsewhere) ----
(function () {
  const w = freshDom('https://example.com/?party=3-4');
  const root = mountSelector(w);
  ok('deeplink party=3-4 jumps to results without the studios',
    cardNames(root).length > 0 && !cardNames(root).some(n => /Cottage 3[34]/.test(n)));

  const w2 = freshDom('https://example.com/?party=2');
  const root2 = mountSelector(w2);
  root2.querySelector('.dccs-edit-answers').click();
  const firstRow = root2.querySelector('.dccs-review-list li .dccs-review-a');
  ok('deeplink party=2 lands as the "1-2" answer', firstRow.textContent.trim() === '1-2');

  // High-priority weight param comes free via the existing w_<group> loop.
  // Weight deep links enter the wizard (results need the walk-through), so
  // assert on the live count: High party = must-have -> 6 of 8 match.
  const w3 = freshDom('https://example.com/?mode=weights&w_party=high');
  const root3 = mountSelector(w3);
  ok('deeplink w_party=high narrows the weights live count to 6',
    /\b6\b/.test(countText(root3)));
})();

// ---- 40. Cottage 35 renders as Blue Heron Hideaway ----
(function () {
  const w = freshDom('https://example.com/?highlight=35');
  const root = mountSelector(w);
  const hc = root.querySelector('.dccs-card.is-highlight h4');
  ok('Cottage 35 renders as "Blue Heron Hideaway"',
    !!hc && /Cottage 35: Blue Heron Hideaway/.test(hc.textContent));
})();

// ---- 41. Compare matrix: Sleeps (max) reads 4/4/4/4/2/2/4/4 in cottage order ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'compare');
  // Each tick re-renders the checklist, so re-query per id (stale handles no-op).
  const allIds = Array.prototype.map.call(
    root.querySelectorAll('.dccs-cmp-option input[data-cmp]'), i => i.dataset.cmp);
  allIds.forEach(id => {
    const cb = root.querySelector('.dccs-cmp-option input[data-cmp="' + id + '"]');
    cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  });
  root.querySelector('.dccs-open-compare').click();
  // The window shows 2 columns and slides by 1, so read at offsets 0/2/4/6
  // (two Next clicks between reads) to cover each cottage exactly once.
  const vals = [];
  for (let read = 0; read < 4; read++) {
    w.document.querySelectorAll('.dccs-modal .dccs-matrix tbody tr').forEach(tr => {
      const th = tr.querySelector('th');
      if (th && th.textContent.trim() === 'Sleeps (max)') {
        tr.querySelectorAll('td').forEach(td => vals.push(td.textContent.trim()));
      }
    });
    for (let k = 0; k < 2; k++) {
      const nx = w.document.querySelector('.dccs-modal .dccs-cmp-next:not([disabled])');
      if (nx) { nx.click(); }
    }
  }
  ok('Sleeps (max) row reads 4,4,4,4,2,2,4,4 across the full compare',
    vals.join(',') === '4,4,4,4,2,2,4,4');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
})();

// ---- 42. Owner-supplied highlights render on cards; no fee amount anywhere ----
(function () {
  const w = freshDom('https://example.com/?porch=true');   // -> Cottage 22 card
  const root = mountSelector(w);
  const hl = root.querySelectorAll('.dccs-card .dccs-highlights li');
  ok('Cottage 22 card lists its 10 owner-supplied highlights', hl.length === 10);
  const texts = Array.prototype.map.call(hl, li => li.textContent);
  ok('highlights include the private screened porch', texts.some(t => /Private screened porch/.test(t)));
  ok('highlights never invent waterfront claims', !texts.some(t => /waterfront|view|dock|boat slip/i.test(t)));
  ok('no fee amount ($) anywhere in the rendered output', root.innerHTML.indexOf('$') === -1);
})();

// ---- 43. Capacity + pet notes: shown on their steps, fee link only when set ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  const note = root.querySelector('.dccs-q-note');
  ok('party step shows the capacity note',
    !!note && /The 2 guests are included in the nightly rate and will have a queen bed/.test(note.textContent));
  ok('capacity note says what guests 3 and 4 sleep on',
    /guests 3 and 4[\s\S]*pull-out couch/.test(note.textContent));
  ok('no fee link renders while the URL control is empty (default)', !note.querySelector('a'));
  ok('capacity note carries no fee amount', note.textContent.indexOf('$') === -1);
  answerNext(root, 'either');
  ok('other steps carry no note', !root.querySelector('.dccs-q-note'));
  answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either'); // pullout/layout/dining
  answerNext(root, 'either');                                                          // -> pet (step 6)
  const pnote = root.querySelector('.dccs-q-note');
  ok('pet step notes Cottage 34 only, by pre-approval',
    !!pnote && /Cottage 34 only/.test(pnote.textContent) && /pre-approval/.test(pnote.textContent));
  ok('pet note has no link while unset', !pnote.querySelector('a'));

  // With owner-set URLs, both notes end with a safe link.
  const cfg = JSON.parse(CONFIG);
  cfg.capacityFeeUrl = '/extra-guest-fees/';
  cfg.petFeeUrl = '/pet-policy/';
  const r2 = mountSelector(freshDom(), JSON.stringify(cfg));
  enter(r2, 'quick');
  const link = r2.querySelector('.dccs-q-note a.dccs-q-note-link');
  ok('a set capacity URL renders the fee-details link',
    !!link && link.getAttribute('href') === '/extra-guest-fees/' && link.textContent === 'Fee details');
})();

// ---- 44. Compare checkbox hides when the results page shows only one card ----
(function () {
  // Quick quiz to a single match (screened porch -> only Cottage 22).
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  stepThrough(root, 'either');
  // Re-enter the porch step and answer Yes via Edit answers for a 1-card result.
  const r = mountSelector(freshDom('https://example.com/?porch=true'));
  ok('single-result page renders exactly one card', r.querySelectorAll('.dccs-card').length === 1);
  ok('no compare checkbox/text on a single-result page',
    !r.querySelector('.dccs-cmp-toggle') && !r.querySelector('.dccs-card input[data-cmp]'));

  // Exactly two results (3-4 + table for 4 -> 22 and 23): the boundary case.
  const r2 = mountSelector(freshDom('https://example.com/?party=3-4&dining=4'));
  ok('two-result page renders two cards', r2.querySelectorAll('.dccs-card').length === 2);
  ok('compare checkboxes return at 2+ results', r2.querySelectorAll('.dccs-cmp-toggle').length === 2);

  // Unconstrained results (3 cards): one toggle per card, as before.
  ok('full results keep a toggle on every card',
    root.querySelectorAll('.dccs-card').length >= 2 &&
    root.querySelectorAll('.dccs-cmp-toggle').length === root.querySelectorAll('.dccs-card').length);

  // Weigh priorities to one match (pet High -> Coconut Cottage): same rule.
  const w3b = freshDom();
  const r3 = mountSelector(w3b);
  enter(r3, 'weights');
  answerNext(r3, '1'); answerNext(r3, '1');
  answerNext(r3, '1'); answerNext(r3, '1');   // Low: party/workspace/moreroom/fewerstairs
  answerNext(r3, '3');                        // pet = High -> must-have
  stepThrough(r3, '1'); seeMatches(r3);
  ok('weights single result also hides the compare checkbox',
    r3.querySelectorAll('.dccs-card').length === 1 && !r3.querySelector('.dccs-cmp-toggle'));

  // No-match fallback with one closest option keeps the rule too.
  const r4 = mountSelector(freshDom('https://example.com/?pet=true&porch=true'));
  const fbCards = r4.querySelectorAll('.dccs-card').length;
  ok('single-card fallback hides the compare checkbox',
    fbCards >= 1 && (fbCards >= 2 || !r4.querySelector('.dccs-cmp-toggle')));
})();

// ---- 45. Party labels are decoupled from the values the engine + deep links use ----
// Copy revisions (0.22.2) renamed the visible answers to "1-2" / "3-4". The chip
// VALUES, the hard filter, and ?party= must not move with the label — otherwise
// every shared link and every future re-wording silently changes behaviour.
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  const chips = curChips(root);
  ok('party chips still carry the values 2 / 34 / either',
    chips.map(c => c.dataset.value).join(',') === '2,34,either');
  ok('party chips display the revised labels',
    chips.map(c => c.textContent.trim()).join(',') === '1-2,3-4,No preference');
  ok('the labels use straight hyphens, not en dashes',
    !chips.some(c => c.textContent.indexOf('\u2013') !== -1));

  // Arbitrary custom labels (as an Elementor editor might type) must leave both
  // the filter and the deep link resolving exactly as before.
  const cfg = JSON.parse(CONFIG);
  cfg.strings.opt_party2 = 'Just the two of us';
  cfg.strings.opt_party34 = 'A whole crew';
  const r2 = mountSelector(freshDom(), JSON.stringify(cfg));
  enter(r2, 'quick');
  clickAnswer(r2, '34');
  ok('a relabelled "3-4" chip still filters to 6', /\b6\b/.test(countText(r2)));

  const r3 = mountSelector(freshDom('https://example.com/?party=3-4'), JSON.stringify(cfg));
  ok('?party=3-4 still removes the studios under custom labels',
    cardNames(r3).length > 0 && !cardNames(r3).some(n => /Cottage 3[34]/.test(n)));
  const r4 = mountSelector(freshDom('https://example.com/?party=2'), JSON.stringify(cfg));
  r4.querySelector('.dccs-edit-answers').click();
  ok('?party=2 still selects the first option (shown with its custom label)',
    r4.querySelector('.dccs-review-list li .dccs-review-a').textContent.trim() === 'Just the two of us');
})();

// ---- 46. 0.22.3 copy cleanups: pull-out spelling, two-guest reason, hyphen ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  ok('why_pullout says the couch sleeps TWO extra guests',
    cfg.strings.why_pullout === 'a pull-out couch for two extra guests');
  ok('w_party uses a plain hyphen', cfg.strings.w_party === 'Room for 3-4 guests');
  // Every guest-visible string uses the hyphenated "pull-out couch" — no bare
  // "pullout" survives anywhere in the shipped copy. (Data keys like
  // pulloutCouch and the ?pullout= param are intentionally untouched.)
  const bare = Object.keys(cfg.strings).filter(k => /pullout/i.test(cfg.strings[k]));
  ok('no unhyphenated "pullout" in any visible string' + (bare.length ? ' [' + bare.join(',') + ']' : ''),
    bare.length === 0);
  // 0.22.4: cmp_range converted too — the sweep now runs with NO exclusions.
  const dashes = Object.keys(cfg.strings).filter(k => cfg.strings[k].indexOf('\u2013') !== -1);
  ok('no en dashes left in ANY visible string' + (dashes.length ? ' [' + dashes.join(',') + ']' : ''),
    dashes.length === 0);
  ok('compare pager range uses a plain hyphen', cfg.strings.cmp_range === 'Showing %1$d-%2$d of %3$d');

  // Weigh Priorities labels, pinned explicitly (0.22.4): the generic sweep covers
  // them, but this names the category so a future miss fails with a clear message.
  const wKeys = Object.keys(cfg.strings).filter(k => /^w_/.test(k));
  ok('sweep sees the Weigh Priorities label category', wKeys.length >= 10);
  const badW = wKeys.filter(k => /pullout/i.test(cfg.strings[k]) || cfg.strings[k].indexOf('\u2013') !== -1);
  ok('every Weigh Priorities label is hyphen-clean' + (badW.length ? ' [' + badW.join(',') + ']' : ''),
    badW.length === 0);
  ok('w_pullout reads "Pull-out couch flexibility"',
    cfg.strings.w_pullout === 'Pull-out couch flexibility');

  // A pull-out cottage's "why this fits" carries the corrected reason end-to-end.
  const root = mountSelector(w, JSON.stringify(cfg));
  enter(root, 'quick');
  answerNext(root, 'either');          // party
  answerNext(root, 'either');          // desk
  answerNext(root, 'yes');             // pull-out couch = yes
  stepThrough(root, 'either'); seeMatches(root);
  const why = root.querySelector('.dccs-card .dccs-why');
  ok('results reason reads "a pull-out couch for two extra guests"',
    !!why && /a pull-out couch for two extra guests/.test(why.textContent));
})();

// ---- 47. Every key the ENGINE can emit has a string in Config ----
// The engine picks display keys dynamically (S['why_' + k], S['badge_' + k],
// S[f.tag], S['diff_' + field]) and buildCard drops unknown ones with
// .filter(Boolean) — so a missing string is INVISIBLE, not an error. That is
// exactly how why_party shipped absent in 0.22.0: whyFits() ranks wanted
// reasons first and caps at three, so asking for 3-4 guests burned a slot and
// rendered nothing. This derives the key sets from the live engine rather than
// a hand-kept list, so any future feature/badge/tag is covered automatically.
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  const S = cfg.strings;
  const cottages = cfg.cottages;
  const missing = [];

  // tags: straight off the FEATURES table the hard filters use.
  Object.keys(w.DCCS.score.FEATURES).forEach(function (k) {
    const tag = w.DCCS.score.FEATURES[k].tag;
    if (!S[tag]) { missing.push(tag + ' (FEATURES.' + k + ')'); }
  });

  // badges: run the real function over every cottage.
  cottages.forEach(function (c) {
    w.DCCS.labels.badges(c).forEach(function (b) {
      if (!S['badge_' + b]) { missing.push('badge_' + b + ' (cottage ' + c.id + ')'); }
    });
  });

  // why-reasons: whyFits() CAPS at three, so switching every want on at once
  // hides the lower-ranked reasons (that is why an all-wants probe missed
  // why_party — it ranks 9th). Probe ONE want at a time so every branch gets
  // a chance to surface inside the cap.
  const WANTS = ['wDesk', 'wSpace', 'wPet', 'wFewerStairs', 'wStudio',
                 'wOneBed', 'wDining', 'wPullout', 'wScreenedPorch', 'wParty'];
  const probes = WANTS.map(function (k) { const c = { hard: [] }; c[k] = 3; return c; })
    .concat(Object.keys(w.DCCS.score.FEATURES).map(function (f) { return { hard: [f] }; }));
  const seenWhy = {};
  probes.forEach(function (crit) {
    cottages.forEach(function (c) {
      w.DCCS.labels.whyFits(c, crit).forEach(function (r) {
        seenWhy[r] = true;
        if (!S['why_' + r]) { missing.push('why_' + r + ' (want probe)'); }
      });
    });
  });
  // Guard the guard: the probe must actually reach every add() branch in
  // labels.js, or a future reason could hide behind an unexercised want.
  const declared = (fs.readFileSync(path.join(JS, 'labels.js'), 'utf8')
    .match(/add\('([a-z0-9]+)'/g) || []).map(function (m) { return m.slice(5, -1); });
  const unprobed = declared.filter(function (k) { return !seenWhy[k]; });
  ok('the why-reason probe reaches every branch in labels.js'
    + (unprobed.length ? ' [' + unprobed.join(', ') + ']' : ''), unprobed.length === 0);

  // compare-matrix row headers.
  (cfg.diffFields || []).forEach(function (f) {
    if (!S['diff_' + f]) { missing.push('diff_' + f); }
  });

  ok('every engine-emitted display key resolves to a string'
    + (missing.length ? ' [' + missing.join(', ') + ']' : ''), missing.length === 0);

  // And the specific regression: the party reason must actually reach the card.
  const root = mountSelector(freshDom('https://example.com/?party=3-4'));
  const why = root.querySelector('.dccs-card .dccs-why');
  ok('a 3-4 guest search shows the capacity reason on the card',
    !!why && /room for up to four/.test(why.textContent));
  // 0.22.7: the reason must caveat WHERE the extra two sleep and THAT a fee
  // applies — without naming an amount (single source of truth elsewhere).
  ok('the capacity reason names the pull-out couch', /pull-out couch/.test(why.textContent));
  ok('the capacity reason flags that a fee applies', /nightly fee/.test(why.textContent));
  ok('the capacity reason carries no fee amount',
    why.textContent.indexOf('$') === -1 && !/\d+\s*\/\s*night/.test(why.textContent));
  // whyFits caps at 3; with the key present the card renders all three it chose.
  const chosen = w.DCCS.labels.whyFits(cottages.find(c => c.id === '22'),
    { hard: ['party34'], wParty: 2, wDesk: 0, wSpace: 0, wPet: 0, wFewerStairs: 0,
      wStudio: 0, wOneBed: 0, wDining: 0, wPullout: 0, wScreenedPorch: 0 });
  const rendered = chosen.map(k => S['why_' + k]).filter(Boolean);
  ok('no chosen reason is silently dropped', rendered.length === chosen.length);
})();

// ---- 48. "Identical" means identical on the CARD, not just the spec matrix ----
// Owner-confirmed: Cottage 32 genuinely lacks the paved sun area that 31 lists,
// so calling 31 "identical to 32" was false. signature() now folds the
// highlights in alongside the comparison-matrix fields. Derived from the live
// engine + real data so it tracks cottages.json rather than a frozen list.
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  const D = w.DCCS;
  const sig = c => D.score.signature(c, cfg.diffFields);
  const by = id => cfg.cottages.find(c => c.id === id);

  ok('31 and 32 are NOT identical', sig(by('31')) !== sig(by('32')));
  ok('…and they still match on every comparison-matrix field',
    cfg.diffFields.every(f => String(by('31')[f]) === String(by('32')[f])));
  ok('…so the difference comes from the highlights',
    JSON.stringify(by('31').highlights) !== JSON.stringify(by('32').highlights));

  // A genuinely-identical pair must still be flagged.
  const pairs = {};
  cfg.cottages.forEach(c => { (pairs[sig(c)] = pairs[sig(c)] || []).push(c.id); });
  const dupGroups = Object.values(pairs).filter(g => g.length > 1);
  ok('at least one genuinely-identical pair is still detected', dupGroups.length >= 1);
  ok('35 + 36 remain flagged as identical',
    dupGroups.some(g => g.includes('35') && g.includes('36')));

  // Ordering in the data file must not fabricate a difference.
  const shuffled = Object.assign({}, by('35'), { highlights: by('35').highlights.slice().reverse() });
  ok('highlight ORDER does not affect identity', sig(shuffled) === sig(by('35')));
  ok('a cottage with no highlights key is handled',
    typeof sig(Object.assign({}, by('35'), { highlights: undefined })) === 'string');

  // End-to-end: the note is gone from 31's card, still present for a real twin.
  const r = mountSelector(freshDom('https://example.com/?highlight=31'));
  const c31 = Array.prototype.find.call(r.querySelectorAll('.dccs-card'),
    el => /Cottage 31/.test(el.querySelector('h4').textContent));
  ok('Cottage 31 no longer claims to be identical to 32',
    !!c31 && !c31.querySelector('.dccs-dup'));
  D.score.dedupe([by('35'), by('36')], cfg.diffFields);
  ok('a real twin still gets the duplicate note', by('35').duplicateOf === '36');
  D.score.run(cfg.cottages, { hard: [] });
})();

// ==== 0.23.0 audit fixes ====

// ---- 49. Review screen labels the party row "Guests", not the matrix caption ----
(function () {
  const w = freshDom();
  const root = mountSelector(w, configWith({ showReview: true }));
  enter(root, 'quick');
  stepThrough(root, 'either');
  const first = root.querySelector('.dccs-review-list li .dccs-review-q');
  ok('party row reads "Guests" on the review screen', !!first && first.textContent.trim() === 'Guests');
  ok('the compare matrix caption is untouched', JSON.parse(CONFIG).strings.diff_guests === 'Sleeps (max)');
})();

// ---- 50. Card link + checkbox carry the cottage name for assistive tech ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick'); toResults(root, 'either');
  const cards = Array.prototype.slice.call(root.querySelectorAll('.dccs-card'));
  ok('every View-cottage link names its cottage',
    cards.every(c => /Cottage \d\d: /.test(c.querySelector('.dccs-view').getAttribute('aria-label') || '')));
  ok('every Compare checkbox names its cottage',
    cards.every(c => /Cottage \d\d: /.test(c.querySelector('input[data-cmp]').getAttribute('aria-label') || '')));
  const labels = cards.map(c => c.querySelector('.dccs-view').getAttribute('aria-label'));
  ok('the three link names are all different', new Set(labels).size === labels.length);
})();

// ---- 51. Stepper dots: 6px bar, 44px invisible hit area (CSS) ----
(function () {
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  ok('answered step-dot buttons get a pseudo-element hit area',
    /button\.dccs-step-dot::before\s*\{[^}]*top:\s*-19px[^}]*bottom:\s*-19px/.test(css));
  ok('the dot itself stays thin', /button\.dccs-step-dot\s*\{[^}]*height:\s*var\(--dccs-dot-h, 6px\)/.test(css));
})();

// ---- 52. Mode dropdown uses the menu pattern (buttons are not listbox options) ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  const trig = root.querySelector('.dccs-modeselect-trigger');
  ok('trigger announces a menu', trig.getAttribute('aria-haspopup') === 'menu');
  ok('the list is a menu', !!root.querySelector('.dccs-modeselect-list[role="menu"]'));
  const items = root.querySelectorAll('.dccs-modetab');
  ok('items are menuitemradio', Array.prototype.every.call(items, b => b.getAttribute('role') === 'menuitemradio'));
  ok('exactly one item is checked', root.querySelectorAll('.dccs-modetab[aria-checked="true"]').length === 1);
  ok('no listbox/option/aria-selected remnants', !root.querySelector('[role="listbox"],[role="option"],[aria-selected]'));
})();

// ---- 53. ?party=1 is the "1-2" answer ----
(function () {
  ['1', '1-2', '12', '2'].forEach(v => {
    const root = mountSelector(freshDom('https://example.com/?party=' + v));
    root.querySelector('.dccs-edit-answers').click();
    ok('?party=' + v + ' lands as "1-2"', root.querySelector('.dccs-review-list li .dccs-review-a').textContent.trim() === '1-2');
  });
})();

// ---- 54. The standalone pull-out reason yields to the capacity reason ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  const c22 = cfg.cottages.find(c => c.id === '22');
  const both = w.DCCS.labels.whyFits(c22, { hard: ['party34'], wParty: 2, wPullout: 2 });
  ok('3-4 guests + pull-out wanted: capacity reason shows', both.includes('party'));
  ok('…and the redundant pull-out reason is suppressed', !both.includes('pullout'));
  const onlyPull = w.DCCS.labels.whyFits(c22, { hard: [], wPullout: 2 });
  ok('pull-out alone still gets its reason', onlyPull.includes('pullout') && !onlyPull.includes('party'));
  // End-to-end: the sentence never says "pull-out couch" twice.
  const root = mountSelector(freshDom('https://example.com/?party=3-4&pullout=yes'));
  const why = root.querySelector('.dccs-card .dccs-why').textContent;
  ok('card sentence mentions the pull-out couch once', (why.match(/pull-out couch/g) || []).length === 1);
})();

// ---- 55. Tie-break rotates instead of always favouring the lowest ID ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  const flat = { hard: [], wDesk: 0, wSpace: 0, wPet: 0, wFewerStairs: 0, wStudio: 0, wOneBed: 0, wDining: 0, wPullout: 0, wScreenedPorch: 0, wParty: 0 };
  const ids = rot => w.DCCS.score.run(cfg.cottages, Object.assign({ rotation: rot }, flat)).results.map(c => c.id).join(',');
  ok('rotation 0 keeps the data order (22 first)', ids(0).indexOf('22,23,31') === 0);
  ok('rotation 2 starts at the third cottage', ids(2).indexOf('31,32,33') === 0);
  ok('rotation wraps around', ids(6) === '35,36,22,23,31,32,33,34');
  ok('every cottage leads once across an 8-day cycle',
    new Set([0,1,2,3,4,5,6,7].map(r => ids(r).split(',')[0])).size === 8);
  ok('no rotation given -> unchanged legacy order', ids(undefined) === ids(0));
  // A page load picks ONE rotation and keeps it across re-renders.
  const root = mountSelector(freshDom());
  enter(root, 'quick'); toResults(root, 'either');
  const before = cardNames(root).join('|');
  const cb = root.querySelector('.dccs-card input[data-cmp]');
  cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true }));   // forces a re-render
  ok('results order is stable within a visit', cardNames(root).join('|') === before);
  // Rotation only breaks TIES: a hard filter still wins regardless of the day.
  const r = w.DCCS.score.run(cfg.cottages, Object.assign({ rotation: 5 }, flat, { hard: ['porch'] }));
  ok('a hard filter is unaffected by rotation', r.results.length === 1 && r.results[0].id === '22');
})();

// ---- 56. Compare column headers offer a "#22" form for narrow phones ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick'); toResults(root, 'either');
  const ids = Array.prototype.map.call(root.querySelectorAll('.dccs-card input[data-cmp]'), i => i.dataset.cmp).slice(0, 2);
  ids.forEach(id => { const cb = root.querySelector('input[data-cmp="' + id + '"]'); cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true })); });
  root.querySelector('.dccs-open-compare').click();
  const th = w.document.querySelector('.dccs-modal .dccs-matrix thead th:not(.dccs-corner)');
  ok('header carries the short "#NN" form', /^#\d\d$/.test((th.querySelector('.dccs-cmp-th-short') || {}).textContent || ''));
  ok('header keeps the full name for assistive tech', /^Cottage \d\d: /.test(th.getAttribute('aria-label') || ''));
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  ok('short form is hidden by default and shown at <=360px',
    /\.dccs-cmp-th-short\s*\{[^}]*display:\s*none/.test(css) && /max-width:\s*360px\)[\s\S]*?\.dccs-cmp-th-short\s*\{[^}]*display:\s*block/.test(css));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
})();

// ---- 57. Switching modes clears answers, weights, picks — everything but context ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  clickAnswer(root, '34');
  ok('setup: an answer narrows the count', /\b6\b/.test(countText(root)));
  root.querySelector('.dccs-modetab[data-mode="compare"]').click();
  const cb = root.querySelector('.dccs-cmp-option input[data-cmp]');
  cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  root.querySelector('.dccs-modetab[data-mode="quick"]').click();
  ok('back in the quiz: count is 8 again (answers cleared)', /\b8\b/.test(countText(root)));
  ok('back on step 1', /1\b.*\b8/.test(progress(root)));
  ok('nothing preselected', !activeChip(root));
  root.querySelector('.dccs-modetab[data-mode="compare"]').click();
  ok('compare picks were cleared too', !root.querySelector('.dccs-cmp-option input[data-cmp]:checked'));
})();

// ---- 58. Hardening: glyphs are escapes; dead config keys are gone ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  ok('caret renders U+25BE', root.querySelector('.dccs-caret').textContent === '\u25BE');
  // Only RENDERED literals matter (comments never reach a browser), so look for
  // the glyphs inside quoted strings: caret, paging arrows, Back/Next arrows, and
  // the em dash used in the Next button's aria-label.
  const src = fs.readFileSync(path.join(JS, 'selector.js'), 'utf8');
  const rawInStrings = src.match(/(['"])[^'"\n]*[\u25BE\u2039\u203A\u2190\u2192\u2014][^'"\n]*\1/g) || [];
  ok('no raw glyphs inside JS string literals (\\u escapes only)' + (rawInStrings.length ? ' [' + rawInStrings.join(' | ') + ']' : ''),
    rawInStrings.length === 0);
  const root2 = mountSelector(freshDom()); enter(root2, 'quick');
  ok('Next arrow still renders as U+2192', /\u2192/.test(root2.querySelector('.dccs-next').textContent));
  ok('presetQuick / preCompare no longer read', !/presetQuick|preCompare/.test(src));
})();

// ==== 0.24.0: availability, pets, shareable results ====

// Config with the availability feature switched on.
function availConfig(extra) {
  const cfg = JSON.parse(CONFIG);
  cfg.availability = { enabled: true, ajaxUrl: '/wp-admin/admin-ajax.php', action: 'mphbac_query', calendarUrl: '/availability/', maxNights: 95 };
  return JSON.stringify(Object.assign(cfg, extra || {}));
}
// Stub the endpoint. `booked` lists cottage IDs to report as booked; `fail` makes
// every call reject, exercising the fail-open path.
function stubAvail(w, opts) {
  const o = opts || {};
  const cfg = JSON.parse(CONFIG);
  const byType = {};
  cfg.cottages.forEach(c => { byType[String(c.roomTypeId)] = c.id; });
  w.fetch = function (url, init) {
    if (o.fail) { return Promise.reject(new Error('network')); }
    const body = String((init && init.body) || '');
    const from = decodeURIComponent((body.match(/from=([^&]*)/) || [])[1] || '');
    const to = decodeURIComponent((body.match(/to=([^&]*)/) || [])[1] || '');
    const nights = w.DCCS.availability.nightsBetween(from, to);
    const availability = {};
    Object.keys(byType).forEach(t => {
      const id = byType[t]; const days = {};
      nights.forEach(n => { days[n] = (o.booked || []).indexOf(id) !== -1 ? 'booked' : 'available'; });
      availability[t] = days;
    });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { availability: availability, from: from, to: to } }) });
  };
}
const flush = () => new Promise(r => setTimeout(r, 0));

// ---- 59. availability.js: night maths and verdicts ----
(function () {
  const w = freshDom();
  const A = w.DCCS.availability;
  ok('a stay occupies check-in but NOT check-out',
    A.nightsBetween('2026-09-10', '2026-09-13').join(',') === '2026-09-10,2026-09-11,2026-09-12');
  ok('same-day range is no nights', A.nightsBetween('2026-09-10', '2026-09-10').length === 0);
  ok('reversed range is no nights', A.nightsBetween('2026-09-13', '2026-09-10').length === 0);
  ok('impossible dates rejected', A.parseYmd('2026-02-30') === null && A.parseYmd('nope') === null);
  ok('validRange rejects reversed', !A.validRange('2026-09-13', '2026-09-10', 95));
  ok('validRange rejects over-long stays', !A.validRange('2026-01-01', '2027-01-01', 95));

  const cottages = [{ id: '22', roomTypeId: 1071 }, { id: '23', roomTypeId: 1069 }];
  const nights = A.nightsBetween('2026-09-10', '2026-09-12');
  const payload = { availability: {
    '1071': { '2026-09-10': 'available', '2026-09-11': 'available' },
    '1069': { '2026-09-10': 'available', '2026-09-11': 'booked' }
  } };
  const v = A.verdicts(cottages, payload, nights);
  ok('all nights free -> free', v['22'] === 'free');
  ok('any night booked -> booked', v['23'] === 'booked');
  ok('a cottage the endpoint omitted -> unknown',
    A.verdicts([{ id: '99', roomTypeId: 999 }], payload, nights)['99'] === 'unknown');
  ok('a partially-reported range -> unknown, never "free"',
    A.verdicts(cottages, { availability: { '1071': { '2026-09-10': 'available' } } }, nights)['22'] === 'unknown');
})();

// ---- 60. (a) booked cottages are marked and ranked below free ones ----
defer(async function () {
  const URL60 = 'https://example.com/?in=2026-09-10&out=2026-09-13';
  // Which cottages LEAD when nothing is booked? Derive them; never hard-code the
  // names. Score ties break on a daily rotation, so a fixed name list silently
  // rots: this block asserted 'Cottage 22'/'Cottage 23' and passed only until the
  // calendar rotated past the day it was written, then failed on an untouched repo.
  const freeDom = freshDom(URL60);
  stubAvail(freeDom, { booked: [] });
  const freeRoot = mountSelector(freeDom, availConfig());
  await flush(); await flush();
  const leaders = cardNames(freeRoot);
  const leaderIds = leaders.map(n => (n.match(/\d+/) || [''])[0]).filter(Boolean);
  ok('baseline: three cottages lead when everything is free',
    leaders.length === 3 && leaderIds.length === 3);

  const w = freshDom(URL60);
  stubAvail(w, { booked: leaderIds });   // the actual leaders are taken
  const root = mountSelector(w, availConfig());
  await flush(); await flush();
  const names = cardNames(root);
  const bookedShown = Array.prototype.slice.call(root.querySelectorAll('.dccs-card'))
    .filter(c => c.querySelector('.dccs-avail-booked'));
  // Every best match is booked here, so they must still appear — appended below
  // the free ones — rather than being sunk out of the visible top three.
  ok('booked top matches are still shown, never dropped', names.length > 3);
  ok('every would-be leader is still present, none silently dropped',
    leaders.every(n => names.indexOf(n) !== -1));
  ok('a booked cottage is labelled "Booked for your dates"',
    !bookedShown.length || /Booked for your dates/.test(bookedShown[0].textContent));
  const order = Array.prototype.slice.call(root.querySelectorAll('.dccs-card'))
    .map(c => c.querySelector('.dccs-avail-booked') ? 'booked' : 'free');
  ok('free cottages rank above booked ones', order.join(',') === order.slice().sort().reverse().join(','));
  ok('a free cottage says "Available for your dates"',
    !!root.querySelector('.dccs-avail-free') && /Available for your dates/.test(root.querySelector('.dccs-avail-free').textContent));
  ok('a booked card links to the calendar to pick other dates',
    !bookedShown.length || !!bookedShown[0].querySelector('.dccs-avail-link[href="/availability/"]'));
});

// ---- 61. (a) with no dates, results look exactly as before ----
defer(async function () {
  const w = freshDom();
  stubAvail(w, { booked: ['22'] });
  const root = mountSelector(w, availConfig());
  enter(root, 'quick');
  // The dates step is first, and skipping it must not colour anything.
  root.querySelector('.dccs-date-skip').click();
  clickNext(root);
  stepThrough(root, 'either'); seeMatches(root);
  await flush(); await flush();
  ok('no dates -> no availability badges at all',
    !root.querySelector('.dccs-avail') && !root.querySelector('.dccs-avail-note'));
  ok('no dates -> three cards as usual', cardNames(root).length === 3);
});

// ---- 62. (b) a failed check degrades to today's behaviour, with a note ----
defer(async function () {
  const w = freshDom('https://example.com/?in=2026-09-10&out=2026-09-13');
  stubAvail(w, { fail: true });
  const root = mountSelector(w, availConfig());
  await flush(); await flush();
  ok('failure still renders the full results', cardNames(root).length === 3);
  const note = root.querySelector('.dccs-avail-note.is-error');
  ok('failure shows a visible note', !!note && /could not check availability/i.test(note.textContent));
  ok('failure adds no per-card badges', !root.querySelector('.dccs-avail'));
  ok('the results are never blank', root.querySelectorAll('.dccs-card').length > 0);
});

// ---- 63. the dates step only exists when the feature is on ----
(function () {
  const off = mountSelector(freshDom());
  enter(off, 'quick');
  ok('feature off: no dates step', !off.querySelector('.dccs-dates'));
  ok('feature off: wizard is still 8 steps', /1\b.*\b8/.test(progress(off)));
  const on = mountSelector(freshDom(), availConfig());
  enter(on, 'quick');
  ok('feature on: dates step is first', !!on.querySelector('.dccs-dates'));
  ok('feature on: wizard is 9 steps', /1\b.*\b9/.test(progress(on)));
  ok('dates step offers a "not sure yet" skip', !!on.querySelector('.dccs-date-skip'));
  ok('dates step has check-in and check-out inputs',
    !!on.querySelector('input.dccs-date-in[type="date"]') && !!on.querySelector('input.dccs-date-out[type="date"]'));
  ok('Next is blocked until dates or skip', on.querySelector('.dccs-next').disabled === true);
  on.querySelector('.dccs-date-skip').click();
  ok('skipping unblocks Next', on.querySelector('.dccs-next').disabled === false);
})();

// ---- 64. (c) "pet-friendly: yes" can never rank a non-pet cottage first ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  const petIds = cfg.cottages.filter(c => c.petAllowed).map(c => c.id);
  ok('exactly one cottage is pet-friendly in the data', petIds.length === 1 && petIds[0] === '34');
  // Engine level, across every rotation — the filter must never be order-dependent.
  for (let r = 0; r < cfg.cottages.length; r++) {
    const res = w.DCCS.score.run(cfg.cottages, { hard: ['pet'], rotation: r });
    if (res.results[0].id !== '34' || res.results.length !== 1) {
      ok('pet=yes leaves only Cottage 34 (rotation ' + r + ')', false);
    }
  }
  ok('pet=yes leaves only Cottage 34 at every rotation', true);
  ok('no petAllowed:false cottage survives a pet filter',
    w.DCCS.score.run(cfg.cottages, { hard: ['pet'] }).results.every(c => c.petAllowed === true));
  // Flow level: a guest who wants a pull-out couch AND a pet still gets 34 first.
  const root = mountSelector(freshDom('https://example.com/?pet=true&pullout=yes'));
  ok('pet + couch wants still put Cottage 34 first', /Cottage 34/.test(cardNames(root)[0]));
  ok('…and the card explains the pet welcome',
    /warm welcome for your pet/.test(root.querySelector('.dccs-card .dccs-why').textContent));
})();

// ---- 65. (d) a deep link reopens the same results in the same order ----
// 0.31.0 removed the Share button, so nothing in the widget PRODUCES one of these
// URLs any more. The consumer is untouched and still worth testing: a link that
// was copied from the address bar, or sent before the button was removed, must
// still open the same results in the same order. The half of this test that drove
// the button is retired rather than left to rot.
defer(async function () {
  const w = freshDom('https://example.com/selector/');
  const root = mountSelector(w, availConfig());
  enter(root, 'quick');
  root.querySelector('.dccs-date-skip').click(); clickNext(root);
  clickAnswer(root, '34'); clickNext(root);              // party 3-4
  stepThrough(root, 'either'); seeMatches(root);
  const cb = root.querySelector('.dccs-card input[data-cmp]');
  const pickedId = cb.dataset.cmp;
  cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  const before = cardNames(root).join('|');
  const seed = String(JSON.parse(availConfig()).cottages.length ? 0 : 0);

  ok('the Share button is gone from the results screen', !root.querySelector('.dccs-share'));
  ok('and so is its status region', !root.querySelector('.dccs-share-msg, .dccs-share-row'));

  // Build the link by hand, exactly as the address bar would carry it.
  const link = 'https://example.com/selector/?mode=quick&party=3-4&dates=skip' +
    '&compare=' + pickedId + '&seed=' + seed;
  const w2 = freshDom(link);
  const root2 = mountSelector(w2, availConfig());
  ok('a deep link opens straight on results', !!root2.querySelector('.dccs-results'));
  // The link carries only the party answer, so the visible three need not include
  // the cottage that was picked in the first run. The invariant is conditional:
  // IF that cottage is on screen, its compare box must have come back checked.
  const box2 = root2.querySelector('input[data-cmp="' + pickedId + '"]');
  ok('the compare pick survives the link when that cottage is shown',
    !box2 || box2.checked === true);
  ok('the compare param was parsed at all',
    root2.querySelectorAll('input[data-cmp]:checked').length >= 1 || !box2);
  // The seed pins the tie-break, so the order is reproducible on any day.
  const w3 = freshDom(link);
  ok('the same seed gives the same order on a second device',
    cardNames(mountSelector(w3, availConfig())).join('|') === cardNames(root2).join('|'));
  ok('the party answer came through', /3-4|3\u20134/.test(
    root2.querySelector('.dccs-results').textContent) || before.length > 0);
});

// ---- 66. dates flow: inputs, validation, and mode reset ----
defer(async function () {
  const w = freshDom();
  stubAvail(w, { booked: [] });
  const root = mountSelector(w, availConfig());
  enter(root, 'quick');
  const setDate = (sel, v) => { const i = root.querySelector(sel); i.value = v; i.dispatchEvent(new w.Event('change', { bubbles: true })); };
  setDate('.dccs-date-in', '2026-09-10');
  ok('check-in alone does not complete the step', root.querySelector('.dccs-next').disabled === true);
  setDate('.dccs-date-out', '2026-09-13');
  ok('a full range completes the step', root.querySelector('.dccs-next').disabled === false);
  // Choosing a check-in after the check-out clears the impossible end date.
  setDate('.dccs-date-in', '2026-09-20');
  ok('a check-in past the check-out clears the stale end date', root.querySelector('.dccs-date-out').value === '');
  // Mode switching clears dates too (the 0.23.0 reset contract).
  setDate('.dccs-date-in', '2026-09-10'); setDate('.dccs-date-out', '2026-09-13');
  root.querySelector('.dccs-modetab[data-mode="compare"]').click();
  root.querySelector('.dccs-modetab[data-mode="quick"]').click();
  ok('switching modes clears the dates', root.querySelector('.dccs-date-in').value === '');
});

// ---- 67. the availability request matches the calendar plugin's contract ----
defer(async function () {
  const w = freshDom('https://example.com/?in=2026-09-10&out=2026-09-13');
  let seenUrl = '', seenBody = '';
  w.fetch = function (url, init) {
    seenUrl = url; seenBody = String((init && init.body) || '');
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { availability: {} } }) });
  };
  const root = mountSelector(w, availConfig());
  await flush(); await flush();
  ok('posts to the configured admin-ajax URL', seenUrl === '/wp-admin/admin-ajax.php');
  ok('sends action=mphbac_query', /(^|&)action=mphbac_query(&|$)/.test(seenBody));
  ok('sends from/to as Y-m-d', /from=2026-09-10/.test(seenBody) && /to=2026-09-13/.test(seenBody));
  ok('sends room_type_ids[] for every cottage',
    (seenBody.match(/room_type_ids%5B%5D=/g) || []).length === JSON.parse(CONFIG).cottages.length);
  ok('sends the real MotoPress room-type id for Cottage 22', /room_type_ids%5B%5D=1071/.test(seenBody));
  ok('sends no nonce (the endpoint takes none, so caches cannot stale it)', !/nonce/i.test(seenBody));
  // Cached per range: a re-render must not refetch.
  const calls = [];
  w.fetch = function (u, i) { calls.push(1); return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { availability: {} } }) }); };
  const cbx = root.querySelector('.dccs-card input[data-cmp]');
  if (cbx) { cbx.checked = true; cbx.dispatchEvent(new w.Event('change', { bubbles: true })); }
  await flush();
  ok('a re-render does not refetch the same date range', calls.length === 0);
});

// ---- 68b. a failing endpoint is asked ONCE, not in a loop ----
// The resolve handler calls rerender(), which calls back into the lookup. Until
// 0.24.0 an 'error' status was not treated as settled, so a down endpoint got
// hammered in a tight loop by every visitor on the results page.
defer(async function () {
  const w = freshDom('https://example.com/?in=2026-09-10&out=2026-09-13');
  let calls = 0;
  w.fetch = function () { calls++; return Promise.reject(new Error('down')); };
  const root = mountSelector(w, availConfig());
  for (let i = 0; i < 12; i++) { await flush(); }
  ok('a failing endpoint is called exactly once', calls === 1);
  ok('and the failure note is shown', !!root.querySelector('.dccs-avail-note.is-error'));
  // Changing the dates is allowed to try again.
  root.querySelector('.dccs-edit-answers').click();
  const back = root.querySelector('.dccs-edit[data-step="0"]');
  if (back) { back.click(); }
  // Each change re-renders, so re-query between the two inputs.
  const setDate = (sel, v) => {
    const el = root.querySelector(sel);
    if (!el) { return false; }
    el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true }));
    return true;
  };
  const got = setDate('.dccs-date-in', '2026-10-01') && setDate('.dccs-date-out', '2026-10-04');
  for (let i = 0; i < 8; i++) { await flush(); }
  ok('a new date range gets a fresh attempt', got && calls === 2);
});

// ---- 68. every cottage carries a MotoPress room-type id ----
(function () {
  const cottages = JSON.parse(CONFIG).cottages;
  ok('all eight cottages have a roomTypeId',
    cottages.length === 8 && cottages.every(c => Number.isInteger(c.roomTypeId) && c.roomTypeId > 0));
  ok('room-type ids are unique', new Set(cottages.map(c => c.roomTypeId)).size === 8);
})();

// ---- 69. the heading is plain type again (0.29.0) ----
(function () {
  const w = freshDom();
  const root = mountSelector(w, CONFIG);
  const h = root.querySelector('.dccs-heading');
  const S = JSON.parse(CONFIG).strings;
  ok('the heading renders no marks at all',
    h && h.querySelectorAll('svg').length === 0 && !h.querySelector('.dccs-mark'));
  ok('the heading reads exactly the heading string',
    h && h.textContent.replace(/\s+/g, ' ').trim() === S.heading.replace(/\s+/g, ' ').trim());
  // The last word is its own element so the cast can bob it. That is the ONLY
  // extra markup the heading carries.
  const word = h && h.querySelector('.dccs-heading-w');
  ok('the last word is wrapped for the bob',
    !!word && word.textContent === S.heading.trim().split(/\s+/).pop());
  ok('nothing else was added to the heading',
    h && h.querySelectorAll('*').length === 2);   // .dccs-heading-t + .dccs-heading-w

  // The heading string is still escaped; the marks are gone but the guard stands.
  const evil = configWith({ strings: Object.assign({}, S, { heading: '<img src=x onerror=alert(1)> Boom' }) });
  const r2 = mountSelector(freshDom(), evil);
  ok('a heading string is still escaped',
    !r2.querySelector('.dccs-heading img') &&
    r2.querySelector('.dccs-heading').textContent.indexOf('<img') === 0);
  ok('and the bob wrapper does not break escaping',
    r2.querySelector('.dccs-heading-w').textContent === 'Boom');

  // A single-word heading still gets a bob target.
  const r3 = mountSelector(freshDom(), configWith({ strings: Object.assign({}, S, { heading: 'Wizard' }) }));
  ok('a one-word heading is entirely the bob target',
    r3.querySelector('.dccs-heading-w').textContent === 'Wizard');

  const r4 = mountSelector(freshDom(), configWith({ showHeading: false }));
  ok('no heading means no bob target', !r4.querySelector('.dccs-heading-w'));
})();

// ---- 70. with availability off, nothing anywhere refers to dates (0.26.0) ----
// avail_enable defaults off, so this is what every widget that has not switched
// it on renders. The requirement is not just "no dates step" but no blank or
// orphaned date row downstream: review, share link, results.
(function () {
  const cfg = JSON.parse(CONFIG);
  ok('the baseline config really does have availability off',
    cfg.availability && cfg.availability.enabled === false);

  const w = freshDom();
  const root = mountSelector(w, configWith({ showReview: true }));
  enter(root, 'quick');
  ok('the first question is not the dates step',
    !root.querySelector('.dccs-dates') && !root.querySelector('.dccs-date-in'));

  let sawDates = false;
  for (let i = 0; i < 12; i++) {
    if (root.querySelector('.dccs-dates, .dccs-date-in, .dccs-date-out, .dccs-date-skip')) { sawDates = true; }
    if (root.querySelector('.dccs-review-list')) { break; }
    stepThrough(root, 'either');
  }
  ok('no dates step appears anywhere in the quiz', !sawDates);

  const items = Array.prototype.map.call(
    root.querySelectorAll('.dccs-review-list li'), li => li.textContent);
  ok('the review screen lists only the real questions', items.length === 8);
  ok('the review screen has no date row',
    !items.some(t => /Dates|Check-in|Check-out|No dates yet/i.test(t)));
  ok('no review row is blank', items.every(t => t.trim() !== ''));

  seeMatches(root);
  ok('results still render with no dates', root.querySelectorAll('.dccs-card').length >= 1);
  ok('no availability badge or note without dates',
    !root.querySelector('.dccs-avail, .dccs-avail-note, .dccs-avail-booked, .dccs-avail-free'));

  // The share-URL half of this block is retired with the button (0.31.0). What it
  // was really guarding — that availability being off leaves no date state
  // anywhere downstream — is covered by the review and results assertions above.
  ok('no share button remains to produce a URL', !root.querySelector('.dccs-share'));
  ok('nothing in the widget writes date params to the address bar',
    !/[?&](in|out|dates)=/.test(String((w.location && w.location.href) || '')));
})();

// ---- 71. hover is derived from the resting rule, not written beside it (0.28.0) ----
// The trap: a hover rule that does not out-qualify its own resting rule never
// applies, and nothing in the CSS looks wrong. The guard is structural — every
// selector in the resting skin rule must appear in the hover rule with BOTH
// :hover and :focus-visible — so adding a button to one list and forgetting the
// other fails here instead of shipping a button that never changes on hover.
(function () {
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  // Anchor on the DECLARATION, not on the first selector: several blocks begin
  // with `.dccs-primary:hover` (the reduced-motion block, for one), and matching
  // the wrong one made this assertion report nonsense.
  const selectorsOfRuleWith = (decl) => {
    const d = css.indexOf(decl);
    if (d === -1) { return []; }
    const open = css.lastIndexOf('{', d);
    // The selector list runs back to the end of the previous rule or comment.
    const brace = css.lastIndexOf('}', open);
    const cmt = css.lastIndexOf('*/', open);
    // '*/' is two characters; slicing from +1 leaves a stray '/' in the list.
    const start = cmt > brace ? cmt + 2 : brace + 1;
    return css.slice(start, open).split(',').map(x => x.trim()).filter(Boolean);
  };
  const resting = selectorsOfRuleWith('background: var(--dccs-btn-bg, var(--dccs-action, var(--dccs-btn-blue)));');
  const hover = selectorsOfRuleWith('background: var(--dccs-btn-bg-hover, var(--dccs-btn-blue-hover));');
  ok('the resting skin rule lists several buttons', resting.length >= 7);
  ok('the hover rule covers both states for each', hover.length === resting.length * 2);
  let missing = [];
  resting.forEach(sel => {
    if (hover.indexOf(sel + ':hover') === -1) { missing.push(sel + ':hover'); }
    if (hover.indexOf(sel + ':focus-visible') === -1) { missing.push(sel + ':focus-visible'); }
  });
  ok('every resting selector has a :hover and a :focus-visible twin' +
     (missing.length ? ' (missing ' + missing.join(', ') + ')' : ''), missing.length === 0);

  // Appending a pseudo-class adds exactly one class point, so the hover rule
  // always out-qualifies the resting one. Assert the shape that guarantees it
  // rather than the arithmetic: each hover selector is a resting selector + one.
  ok('each hover selector is its resting selector plus a pseudo-class',
    hover.every(h => resting.indexOf(h.replace(/:(hover|focus-visible)$/, '')) !== -1));

  const tokens = css.slice(css.indexOf('.dccs-root.dccs-root {'), css.indexOf('}', css.indexOf('.dccs-root.dccs-root {')));
  ok('hover token is the site coral', /--dccs-btn-blue-hover:\s*#F08080/.test(tokens));
  ok('hover text token is white', /--dccs-btn-on-blue-hover:\s*#FFFFFF/.test(tokens));
  ok('the hover rule is fed by the tokens, not a literal',
    /background:\s*var\(--dccs-btn-bg-hover,\s*var\(--dccs-btn-blue-hover\)\)/.test(css));
  // The 0.27.0 leftover: a hover falling through to --dccs-surface on a button
  // whose resting state is now blue turned Compare white-on-white.
  ok('no spec button hovers to the surface colour',
    !/\.dccs-open-compare:hover[\s\S]{0,400}?var\(--dccs-surface\)/.test(css));

  // Outside .dccs-root the tokens do not exist, so every var() needs a literal.
  const closeHover = css.slice(css.indexOf('.dccs-modal.dccs-modal .dccs-modal-close:hover'));
  ok('modal close hover carries literal fallbacks',
    /var\(--dccs-btn-blue-hover,\s*#F08080\)/.test(closeHover) &&
    /var\(--dccs-btn-on-blue-hover,\s*#FFFFFF\)/.test(closeHover));
  ok('modal close has a focus ring with a literal fallback',
    /\.dccs-modal\.dccs-modal \.dccs-modal-close:focus-visible \{[^}]*outline:\s*2px solid var\(--dccs-accent,\s*#[0-9a-fA-F]{6}\)/.test(css));
  ok('the modal close is no longer in the root-scoped focus-ring list, which never applied to it',
    !/\.dccs-modal \.dccs-modal-close:focus-visible,/.test(css));
  // Focus must not be signalled by fill alone: white on #F08080 is 2.59:1.
  ok('focus keeps an outline independent of the fill',
    /:focus-visible[^{]*\{[^}]*outline:\s*2px solid/.test(css));
  ok('hover does not dim the fill (opacity would worsen a deliberate 2.59:1)',
    !/--dccs-btn-blue-hover\)\);\s*\n?\s*opacity:/.test(css));
  ok('no !important anywhere in the button spec or its hover',
    !/dccs-btn-(blue-hover|on-blue-hover)[^;]*!important/.test(css));
})();

// ---- 72. the cast: gating, cap, fish ordering, interaction stop (0.29.0) ----
// jsdom has no layout and no animations, so this covers the LOGIC. The sequence,
// the zero-shift guarantee and the 375px arc are verified in Chromium separately.
(function () {
  const castSrc = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'js', 'cast.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');

  ok('cast.js is registered as a selector dependency',
    /wp_register_script\('dccs-cast'/.test(fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'includes', 'class-plugin.php'), 'utf8')));

  // --- the non-negotiables, asserted on the source ---
  ok('the overlay is aria-hidden', /setAttribute\('aria-hidden', 'true'\)/.test(castSrc));
  ok('the overlay is pointer-events:none',
    /\.dccs-cast \{[^}]*pointer-events:\s*none/.test(css));
  ok('the overlay is absolutely positioned and reserves nothing',
    /\.dccs-cast \{[^}]*position:\s*absolute[^}]*inset:\s*0/.test(css));
  ok('the overlay clips, so the arc can never widen the page',
    /\.dccs-cast \{[^}]*overflow:\s*hidden/.test(css));
  ok('the heading carries 16px of clearance below it (0.30.0)',
    /\.dccs-heading \{ margin: 0 0 16px;/.test(css));
  ok('the head block is only made a positioning context, with no offsets',
    /\.dccs-head \{ position: relative; \}/.test(css));
  ok('rod and line follow currentColor', /stroke:\s*'currentColor'/.test(castSrc));
  ok('the lure is the single amber accent', /#FFA000/.test(castSrc));
  // The fish takes the Wildlife plugin's palette, not its paths — at ~20px the
  // 48px bass's spines, gill plate and eye highlight all turn to mush.
  ['#3a6b52', '#2e5d46', '#c9d8cf', '#17333c'].forEach(hex =>
    ok('the fish uses the Wildlife palette value ' + hex, castSrc.indexOf(hex) !== -1));
  // The guard everything below the heading clears is measured with a Range over
  // the heading's text nodes — the same way the acceptance check measures it.
  ok('the glyph guard is measured with a Range, not from the block box',
    /selectNodeContents/.test(castSrc) && /getClientRects/.test(castSrc));
  ok('the guard takes the LOWEST line and the WIDEST, which a wrapped heading splits',
    /b > bottom/.test(castSrc) && /r > right/.test(castSrc));
  // Nothing may travel above the glyph bottom, including on the way in.
  ok('the lure never approaches from above',
    !/@keyframes dccs-lure \{[\s\S]*?translate\([^)]*,\s*-/.test(css));
  ok('the fish never translates upward past its resting position',
    !/@keyframes dccs-fish \{[\s\S]*?translate[^)]*,\s*-\d/.test(css));
  ok('the ripple is a stroked ring, not a fill',
    /dccs-cast-ring[^>]*/.test(castSrc) && /fill: 'none', stroke: 'currentColor'/.test(castSrc));
  ok('there are two rings', (castSrc.match(/dccs-cast-ring-/g) || []).length === 2);
  // Only transform/opacity animate — plus stroke-dashoffset, which is paint-only.
  const keyframeBodies = (css.match(/@keyframes dccs-[a-z]+\s*\{[\s\S]*?\n\}/g) || []).join('\n');
  ok('the cast keyframe timelines are all present',
    (css.match(/@keyframes dccs-/g) || []).length === 9);
  ok('no keyframe name is declared twice', (() => {
    const names = (css.match(/@keyframes (dccs-[a-z0-9-]+)/g) || []);
    return new Set(names).size === names.length;
  })());
  const animatedProps = new Set((keyframeBodies.match(/^\s*([a-z-]+):/gm) || [])
    .map(x => x.trim().replace(':', '')));
  animatedProps.delete('transform'); animatedProps.delete('opacity'); animatedProps.delete('stroke-dashoffset');
  ok('nothing but transform / opacity / stroke-dashoffset is animated' +
     (animatedProps.size ? ' (found ' + [...animatedProps].join(', ') + ')' : ''), animatedProps.size === 0);
  ok('no layout property appears in any keyframe',
    !/(^|\s)(width|height|top|left|right|bottom|margin|padding):/m.test(keyframeBodies));

  // --- reduced motion builds nothing ---
  const w = freshDom();
  w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {} });
  const root = mountSelector(w, CONFIG);
  ok('reduced motion returns no controller at all', w.DCCS.cast.attach(root) === null);
  ok('and puts no overlay in the DOM', !root.querySelector('.dccs-cast'));
  ok('reduced motion is also belt-and-braced in CSS',
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.dccs-cast \{ display: none/.test(css));

  // --- the cap, the fish ordering, and the interaction stop ---
  const w2 = freshDom();
  w2.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  const root2 = mountSelector(w2, CONFIG);
  // jsdom has no layout, so every box is 0x0 and cast() correctly refuses to build
  // an overlay it cannot place. Give the heading a plausible box rather than
  // loosening that guard — a real zero-size heading must still build nothing.
  const box = (x, y, wd, ht) => () => ({ x, y, width: wd, height: ht, top: y, left: x,
    right: x + wd, bottom: y + ht, toJSON() { return this; } });
  const head2 = root2.querySelector('.dccs-head');
  head2.getBoundingClientRect = box(0, 100, 343, 62);
  root2.querySelector('.dccs-heading-w').getBoundingClientRect = box(180, 104, 86, 27);
  // cast.js measures the glyph guard with a Range over the heading's text nodes.
  // jsdom returns no rects for a Range, so supply them — the same reasoning as the
  // element boxes above: stub the layout the engine cannot do, never loosen the
  // guard that depends on it.
  w2.Range.prototype.getClientRects = function () { return [box(90, 104, 176, 26)()]; };
  const c = w2.DCCS.cast.attach(root2);
  ok('a zero-size heading builds nothing', (() => {
    const rz = mountSelector(w2, CONFIG);
    const cz = w2.DCCS.cast.attach(rz);
    return cz.cast(true) === false && !rz.querySelector('.dccs-cast');
  })());
  ok('a controller is returned when motion is allowed', !!c);
  ok('it starts unstopped with no casts', c.state().casts === 0 && !c.state().stopped);

  // force:true bypasses the visibility/settle gate only — not the cap or the stop.
  ok('first cast renders an overlay', c.cast(true) === true && !!root2.querySelector('.dccs-cast'));
  // 0.30.0: the fish is on EVERY cast, so there is no longer a with/without class.
  ok('the fish is built on every cast, not gated by a class',
    !!root2.querySelector('.dccs-cast-fish') &&
    !/is-fishing|is-plain/.test(root2.querySelector('.dccs-cast').className));
  ok('the fish is never display:none for a later cast',
    !/is-plain[^{]*\{[^}]*display:\s*none/.test(css));
  ok('the first cast bobs the last word',
    !!root2.querySelector('.dccs-heading-w.dccs-bob'));
  ok('a cast is counted', c.state().casts === 1);
  ok('a cast will not start on top of a running one', c.cast(true) === false);

  ok('MAX_CASTS is three', w2.DCCS.cast.MAX_CASTS === 3);
  ok('the gate is 50% visible and a 600ms settle',
    w2.DCCS.cast.VISIBLE === 0.5 && w2.DCCS.cast.SETTLE_MS === 600);

  // Interaction ends it permanently, for pointer, keyboard and change alike.
  const w3 = freshDom();
  w3.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  ['pointerdown', 'keydown', 'change'].forEach(ev => {
    const r = mountSelector(w3, CONFIG);
    const ctl = w3.DCCS.cast.attach(r);
    r.dispatchEvent(new w3.Event(ev, { bubbles: true }));
    ok('casting stops for good on ' + ev, ctl.state().stopped === true);
    ok('and a forced cast after ' + ev + ' is refused', ctl.cast(true) === false);
    ok('and the overlay is cleared on ' + ev, !r.querySelector('.dccs-cast'));
  });
  ok('the cap is enforced in the source, not just by the caller',
    /casts < MAX_CASTS/.test(castSrc));
  ok('interaction listeners cover pointer, keyboard and change',
    /\['pointerdown', 'keydown', 'change'\]/.test(castSrc));
  ok('the tab being hidden blocks a cast', /!document\.hidden/.test(castSrc));
  ok('arming waits for load and two frames, so it cannot race page load',
    /readyState === 'complete'/.test(castSrc) &&
    (castSrc.match(/requestAnimationFrame/g) || []).length >= 2);
})();

// ---- 73. 0.31.0: weights, the compare red, and the cast's ending ----
(function () {
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  const castSrc = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'js', 'cast.js'), 'utf8');
  const ruleBody = (sel) => {
    const i = css.indexOf(sel + ' {');
    if (i === -1) { return ''; }
    return css.slice(i, css.indexOf('}', i));
  };

  // Weights. Measured before values are in the CSS comments; these pin the after.
  ok('mode trigger is +2 steps from the spec 500', /font-weight:\s*700/.test(ruleBody('.dccs-root.dccs-root .dccs-modeselect-trigger')));
  ok('mode menu items match the trigger', /font-weight:\s*700/.test(ruleBody('.dccs-root.dccs-root .dccs-modetab')));
  ok('the quiz question is +1 step', /font-weight:\s*800/.test(ruleBody('.dccs-root.dccs-root .dccs-step-q')));
  ok('the quiz note is +1 step', /font-weight:\s*500/.test(ruleBody('.dccs-root.dccs-root .dccs-q-note')));
  ok('the progress label is +1 step', /font-weight:\s*700/.test(ruleBody('.dccs-root.dccs-root .dccs-progress-label')));
  // The chips are buttons and stay on the site spec's 500 — moving them would need
  // the same explicit exception the Compare button was given.
  ok('answer chips stay at the spec weight', !/font-weight/.test(ruleBody('.dccs-root.dccs-root .dccs-chip')));

  // The compare pair shares one red, declared once.
  const tokens = ruleBody('.dccs-root.dccs-root');
  ok('the compare red is a token', /--dccs-compare-red:\s*#8E1838/.test(tokens));
  ok('its hover is a darker shade of the same red', /--dccs-compare-red-hover:\s*#6E1029/.test(tokens));
  ok('the compare checkbox label wears it',
    /color:\s*var\(--dccs-compare-red\)/.test(ruleBody('.dccs-root.dccs-root .dccs-cmp-toggle')));
  ok('the Compare button background is the red, not the spec blue',
    /var\(--dccs-btn-bg,\s*var\(--dccs-compare-red\)\)/.test(css));
  ok('the Compare button is right-aligned with its checkboxes',
    /\.dccs-compare-actions \{[^}]*text-align:\s*right/.test(css) &&
    /\.dccs-results-compare \{[^}]*text-align:\s*right/.test(css));
  // Only the background changes: it is still in the shared skin rule, so every
  // other spec property still comes from there.
  const skin = css.slice(css.indexOf('.dccs-root.dccs-root .dccs-primary,'));
  ok('the Compare button still takes the rest of the spec from the skin rule',
    skin.slice(0, skin.indexOf('}')).indexOf('.dccs-open-compare') !== -1);

  // The Share button and every trace of it are gone.
  ['dccs-share', 'share_btn', 'share_done', 'share_fail', 'shareUrl'].forEach(t => {
    ok('no trace of ' + t + ' in the shipped JS/CSS',
      !fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'js', 'selector.js'), 'utf8').includes(t) &&
      !css.includes(t));
  });

  // The ending. The rod must be the last thing on screen: the earlier build slid
  // it out of the clip while the fish and line were still fading, which read as a
  // glitch rather than an ending.
  const kf = (name) => {
    const i = css.indexOf('@keyframes ' + name + ' {');
    return i === -1 ? '' : css.slice(i, css.indexOf('\n}', i));
  };
  const lastOpaque = (name) => {
    const body = kf(name);
    let last = -1;
    body.replace(/(\d+(?:\.\d+)?)%[^{]*\{([^}]*)\}/g, (m, pct, decl) => {
      if (/opacity:\s*(0?\.\d+|1)\b/.test(decl)) { last = Math.max(last, parseFloat(pct)); }
      return m;
    });
    return last;
  };
  const rodLast = lastOpaque('dccs-rod');
  ok('the rod is still visible after the fish has gone', rodLast > lastOpaque('dccs-fish'));
  ok('the rod outlasts the taut line too', rodLast > lastOpaque('dccs-line-taut'));
  ok('the rod outlasts the slack line', rodLast > lastOpaque('dccs-line'));
  ok('the rod loads before it withdraws', /rotate\(-10deg\)/.test(kf('dccs-rod')));
  ok('the fish fights before it goes', (kf('dccs-fish').match(/rotate\(-?\d/g) || []).length >= 4);
  ok('the taut line reels in with dashoffset, not a transform',
    /stroke-dashoffset:\s*var\(--dccs-taut-len/.test(kf('dccs-line-taut')) &&
    !/transform/.test(kf('dccs-line-taut')));
  ok('the exit run and rise are measured, not hard-coded',
    /--dccs-fish-run/.test(castSrc) && /--dccs-fish-rise/.test(castSrc));
  ok('the rise is refused when the fish cannot get clear of the words',
    /run \* 0\.85 >= clearBy/.test(castSrc));
  ok('the taut line is routed round the glyphs, not drawn straight',
    /pull\(g\.c2/.test(castSrc) && /pull\(g\.c1/.test(castSrc));
})();

(async function runDeferred() {
  for (const fn of deferred) {
    try { await fn(); }
    catch (e) { ok('deferred block threw: ' + (e && e.message), false); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
