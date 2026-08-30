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

function injectScript(window, file) {
  const s = window.document.createElement('script');
  s.textContent = fs.readFileSync(path.join(JS, file), 'utf8');
  window.document.body.appendChild(s);
}

function freshDom(url) {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', {
    url: url || 'https://example.com/', pretendToBeVisual: true, runScripts: 'dangerously'
  });
  ['score.js', 'labels.js', 'selector.js'].forEach(function (f) { injectScript(dom.window, f); });
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
  ok('matrix shows Sleeps (max) 4 for Cottage 22 and the constant Bed value',
    rowValue('Sleeps (max)') === '4' && rowValue('Bed') === 'Queen');
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
  ok('mode dropdown is a listbox trigger', !!root.querySelector('.dccs-modeselect-trigger[aria-haspopup="listbox"]') &&
    root.querySelectorAll('.dccs-modetab[role="option"]').length === 3 &&
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
  ok('wizard-nav is set to nowrap', /\.dccs-wizard-nav\s*\{[^}]*flex-wrap:\s*nowrap/.test(css));
  ok('Back/Next are equal-flex (1 1 0)', /\.dccs-back[\s\S]*?\.dccs-next[\s\S]*?flex:\s*1 1 0/.test(css));
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
  ok('primary button reads --dccs-btn-bg with an action fallback',
    /\.dccs-primary\s*\{[\s\S]*?var\(--dccs-btn-bg,\s*var\(--dccs-action\)\)/.test(css));
  ok('dropdown items read --dccs-item-bg / --dccs-item-text',
    /var\(--dccs-item-bg,\s*transparent\)/.test(css) && /var\(--dccs-item-text,\s*var\(--dccs-text\)\)/.test(css));
  ok('button hover honours --dccs-btn-bg-hover', /var\(--dccs-btn-bg-hover,/.test(css));
})();

// ---- 30. Distinct action-button color + smaller tail buttons ----
(function () {
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  const sel = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'includes', 'class-selector-widget.php'), 'utf8');
  ok('a distinct --dccs-action green is defined', /--dccs-action:\s*#/.test(css));
  ok('tail buttons fall back to --dccs-action (distinct from accent answers)',
    /\.dccs-edit-answers,[\s\S]*?\.dccs-reset\s*\{[\s\S]*?var\(--dccs-btn-bg,\s*var\(--dccs-action\)\)/.test(css));
  // Still visually secondary to .dccs-primary (48px / 1rem), but never below the
  // 44px minimum tap target — the lighter weight now comes from the font size alone.
  ok('tail buttons are secondary but still a 44px tap target',
    /\.dccs-reset\s*\{[\s\S]*?min-height:\s*44px[\s\S]*?font-size:\s*0\.9rem/.test(css));
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
  DCCS.score.dedupe(cfg.cottages.filter(c => c.id === '31' || c.id === '32'), cfg.diffFields);
  ok('dedupe marks the twin pair', cfg.cottages.find(c => c.id === '31').duplicateOf === '32');
  DCCS.score.run(cfg.cottages, { hard: [] });
  ok('run() clears stale duplicateOf flags', !cfg.cottages.some(c => c.duplicateOf));

  // (3) answering "table for two" no longer excludes the 4-seat Boathouse.
  enter(root, 'quick');
  answerNext(root, 'either'); answerNext(root, 'either');
  answerNext(root, 'either'); answerNext(root, 'either'); // party/desk/pullout/layout
  answerNext(root, '2');                                  // dining: two
  answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either'); // pet/ground/porch
  const sm = root.querySelector('.dccs-see-matches'); if (sm) { sm.click(); }
  ok('dining=two keeps The Boathouse in the matches',
    cardNames(root).some(n => /Cottage 22/.test(n)));
  ok('dining2 hard filter fully removed', !('dining2' in DCCS.score.FEATURES));

  // (4+5) tap-target sizes baked into the stylesheet.
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  ok('card compare toggle has a 44px tap area', /\.dccs-cmp-toggle\s*\{[\s\S]*?min-height:\s*44px/.test(css));
  ok('review Edit buttons are 44px', /\.dccs-edit\s*\{[\s\S]*?min-height:\s*44px/.test(css));
  ok('compare CTA is 48px like the primary buttons', /\.dccs-open-compare\s*\{[\s\S]*?min-height:\s*48px/.test(css));
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
    /guests 3 and 4[\s\S]*pullout couch/.test(note.textContent));
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
