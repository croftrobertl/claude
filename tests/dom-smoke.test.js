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
  div.className = 'dccs-root dccs-root';
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
  answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either'); // to the pet step (index 4)
  clickAnswer(root, 'yes'); // pet=yes -> only Coconut
  ok('singular count reads "1 cottage matches"', /\b1 cottage matches\b/.test(root.querySelector('.dccs-count').textContent));
})();

// ---- 2. Tapping an answer selects without advancing; Next advances ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  clickAnswer(root, 'yes');
  ok('selecting highlights the chip', !!activeChip(root) && activeChip(root).dataset.value === 'yes');
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
  answerNext(root, 'yes');
  root.querySelector('.dccs-back').click();
  ok('Back returns to step 1', /1\b.*\b8/.test(progress(root)));
  ok('previous answer preserved', activeChip(root) && activeChip(root).dataset.value === 'yes');
})();

// ---- 4. Clickable stepper jumps back to an answered step ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  answerNext(root, 'yes');     // step 1
  answerNext(root, 'no');      // step 2 -> now on step 3
  ok('on step 3', /3\b.*\b8/.test(progress(root)));
  var dot = root.querySelector('.dccs-stepper button.dccs-step-dot[data-step="0"]');
  ok('answered steps are clickable dots', !!dot);
  dot.click();
  ok('stepper dot jumps to step 1', /1\b.*\b8/.test(progress(root)));
})();

// ---- 5. Review step + edit returns to where you came from ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
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
  root.querySelector('.dccs-see-matches').click();
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
  const root = mountSelector(w, JSON.stringify(cfg));
  enter(root, 'quick');
  stepThrough(root, 'either');
  ok('Submit button carries its icon', !!root.querySelector('.dccs-see-matches .dccs-ico .dccs-test-ico'));
  root.querySelector('.dccs-see-matches').click();
  ok('View-cottage links carry their icon', !!root.querySelector('.dccs-view .dccs-ico .dccs-test-ico'));
})();

// ---- 6c. Question + answer icons inject from config.icons ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
  cfg.icons = { q_desk: '<i class="dccs-test-qico"></i>', ans_yes: '<i class="dccs-test-aico"></i>' };
  const root = mountSelector(w, JSON.stringify(cfg));
  enter(root, 'quick');
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

// ---- 8c. Screened-porch question appears as the 8th Quick-Match step ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either');
  answerNext(root, 'either'); answerNext(root, 'either'); answerNext(root, 'either'); // through ground (step 6)
  ok('step 7 of 8 is the screened-porch question', /7\b.*\b8/.test(progress(root)) &&
    /porch/i.test(root.querySelector('.dccs-step-q').textContent));
  clickAnswer(root, 'yes'); clickNext(root);
  stepThrough(root, 'either');                                  // answer the last step (largest)
  root.querySelector('.dccs-see-matches').click();
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
  ok('compare shows a multiselect dropdown', !!root.querySelector('.dccs-cmp-trigger') && root.querySelectorAll('.dccs-cmp-option').length === 8);
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
  const root = mountSelector(w);
  enter(root, 'weights');
  ok('weights starts at Step 1 of 9', /1\b.*\b9/.test(progress(root)));
  ok('nothing preselected, Next disabled', !activeChip(root) && root.querySelector('.dccs-next').disabled === true);
  stepThrough(root, '2');                                   // medium for all 9
  ok('weights review lists all 9 priorities', root.querySelectorAll('.dccs-review-list li').length === 9);
  root.querySelector('.dccs-see-matches').click();
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
  ok('matrix has Guests + Bed + Screened-porch rows',
    rowValue('Guests') !== null && rowValue('Bed') !== null && rowValue('Screened porch') !== null);
  ok('matrix shows the constant Guests/Bed values', rowValue('Guests') === '2' && rowValue('Bed') === 'Queen');
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
  node.className = 'dccs-entry dccs-entry';
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
  modalRoot.querySelector('.dccs-see-matches').click();
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
  node.className = 'dccs-entry dccs-entry';
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
  const entry = { current: '31', selectorUrl: '', modalConfig: cfg, scope: { page: 'elementor-42', el: 'elementor-element-srcXYZ' } };
  // Put the entry inside a DIFFERENT widget scope to prove the source scope wins.
  const widget = w.document.createElement('div');
  widget.className = 'elementor-element elementor-element-mini999';
  const node = w.document.createElement('div');
  node.className = 'dccs-entry dccs-entry';
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
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('closing the mirror pop-up removes its host', !w.document.querySelector('.dccs-modal-host'));
})();

// ---- 17. Live "X cottages match" narrows on a Quick must-have ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  answerNext(root, 'either'); answerNext(root, 'either');
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
  answerNext(root, '1'); answerNext(root, '1'); answerNext(root, '1');  // Low: workspace/moreroom/fewerstairs
  ok('Low priorities do not narrow the count', /\b8\b/.test(countText(root)));
  clickAnswer(root, '3');                                          // pet priority = High
  ok('marking pet High drops the count to 1', /\b1\b/.test(countText(root)));
  clickNext(root);
  stepThrough(root, '1');
  root.querySelector('.dccs-see-matches').click();
  ok('a High priority filters results to the matching cottage',
    cardNames(root).length === 1 && cardNames(root)[0] === 'Cottage 34: Coconut Cottage');
})();

// ---- 19. Compare picker closes on an outside click ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'compare');
  root.querySelector('.dccs-cmp-trigger').click();
  ok('compare dropdown opens on the trigger', !!root.querySelector('.dccs-cmp-select.is-open'));
  w.document.body.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
  ok('compare dropdown closes on an outside click', !root.querySelector('.dccs-cmp-select.is-open'));
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
  div.className = 'dccs-root dccs-root';
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
  // desk/pullout/layout/dining → no preference; pet step = yes; ground = no pref; porch step = yes.
  answerNext(r, 'either'); answerNext(r, 'either'); answerNext(r, 'either'); answerNext(r, 'either');
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
})();

// ---- 25. "Largest = Yes" ranks big cottages first but does NOT filter the count ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  enter(root, 'quick');
  for (var i = 0; i < 7; i++) { answerNext(root, 'either'); }   // advance to the "largest" step
  ok('count is all 8 before answering largest', /\b8\b/.test(countText(root)));
  clickAnswer(root, 'yes');                                     // largest = Yes (comparative)
  ok('answering largest=Yes does NOT narrow the count', /\b8\b/.test(countText(root)));
  clickNext(root);                                              // last step -> review
  root.querySelector('.dccs-see-matches').click();              // -> results
  ok('largest cottages (#22/#23) rank first', /Cottage 2[23]:/.test(cardNames(root)[0]));
})();

// ---- 26. Compare checklist has a scroll-more cue (fade/chevron + JS toggle) ----
(function () {
  const css = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'css', 'selector.css'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'dcc-cottage-selector', 'assets', 'js', 'selector.js'), 'utf8');
  // jsdom has no layout (scrollHeight/clientHeight are 0), so assert the wiring exists.
  ok('checklist has a sticky scroll-more cue pseudo-element',
    /\.dccs-cmp-list::after\s*\{[\s\S]*?position:\s*sticky/.test(css));
  ok('cue is hidden at the end via .is-atend', /\.dccs-cmp-list\.is-atend::after\s*\{[^}]*opacity:\s*0/.test(css));
  ok('JS toggles .is-atend on scroll/overflow', /is-atend/.test(js) && /addEventListener\('scroll'/.test(js));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
