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
  ok('recap shows the chosen criterion', !!root.querySelector('.dccs-recap-chip'));
  ok('recap has a centered section header', !!root.querySelector('.dccs-recap .dccs-recap-h'));
  ok('recap chips live in their own row', !!root.querySelector('.dccs-recap .dccs-recap-chips .dccs-recap-chip'));
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

// ---- 9. No-match: new heading/subhead + blocking recap chips in red ----
(function () {
  const w = freshDom('https://example.com/?pet=true&dining=4');
  const root = mountSelector(w);
  ok('empty heading reads "No Perfect Matches"', /No Perfect Matches/.test(root.querySelector('.dccs-empty h3').textContent));
  ok('fallback card tagged with what it misses', !!root.querySelector('.dccs-miss'));
  ok('blocking must-haves are flagged red', root.querySelectorAll('.dccs-recap-chip.is-blocking').length >= 1);
  ok('a soft pref would not be flagged', !root.querySelector('.dccs-recap-chip.is-blocking[data-step="0"]'));
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

// ---- 12. Tappable recap chip edits one answer ----
(function () {
  const w = freshDom('https://example.com/?pet=true');
  const root = mountSelector(w);
  var chip = root.querySelector('.dccs-recap-chip');
  ok('recap chip present for an active criterion', !!chip);
  chip.click();
  ok('recap chip jumps back into the wizard', !!root.querySelector('.dccs-chips-wizard'));
})();

// ---- 14. Mini-entry modal opens at results with the cottage highlighted ----
(function () {
  const w = freshDom();
  const cfg = JSON.parse(CONFIG);
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
  ok('modal opens straight to results', !!modal.querySelector('.dccs-results') && !modal.querySelector('.dccs-chips-wizard'));
  ok('body scroll locked', w.document.body.style.overflow === 'hidden');
  const hc = modal.querySelector('.dccs-card.is-highlight');
  ok('highlighted cottage #31 surfaced with full name', !!hc && hc.querySelector('h4').textContent.indexOf('Cottage 31: Hibiscus Hut') !== -1);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Esc closes modal', !w.document.querySelector('.dccs-modal'));
  ok('body scroll restored', w.document.body.style.overflow === '');
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
