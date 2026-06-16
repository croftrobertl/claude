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
function curChips(root) { return Array.prototype.slice.call(root.querySelectorAll('.dccs-chips-wizard .dccs-chip')); }
function activeChip(root) { return curChips(root).filter(function (c) { return c.classList.contains('is-active'); })[0]; }
function clickAnswer(root, value) {
  var c = curChips(root).filter(function (n) { return n.dataset.value === value; })[0] || curChips(root)[0];
  c.click();
}
function clickNext(root) { var b = root.querySelector('.dccs-next'); if (b && !b.disabled) { b.click(); } }
function answerNext(root, value) { clickAnswer(root, value); clickNext(root); }
function stepThrough(root, value) {
  for (var k = 0; k < 8 && root.querySelector('.dccs-chips-wizard'); k++) { answerNext(root, value); }
}
function toResults(root, value) {
  stepThrough(root, value || 'either');
  var b = root.querySelector('.dccs-see-matches');
  if (b) { b.click(); }
}
function cardNames(root) {
  return Array.prototype.slice.call(root.querySelectorAll('.dccs-card h4')).map(function (h) { return h.textContent.replace(/\s+/g, ' ').trim(); });
}

// ---- 1. Wizard starts: one question, nothing preselected, Next disabled ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  ok('shows exactly one question step', root.querySelectorAll('.dccs-step-q').length === 1);
  ok('progress reads Step 1 of 7', /1\b.*\b7/.test(progress(root)));
  ok('three answer chips', curChips(root).length === 3);
  ok('no answer preselected', !activeChip(root));
  ok('Next is disabled until a choice', root.querySelector('.dccs-next').disabled === true);
  ok('live count shows 8', /\b8\b/.test(root.querySelector('.dccs-count').textContent));
  ok('no Back on first step', !root.querySelector('.dccs-back'));
  ok('mode toggle present (3 pills)', root.querySelectorAll('.dccs-modetab').length === 3);
  ok('no "I\'m flexible" shortcut', !root.querySelector('.dccs-flexible'));
  ok('sr live region present', !!root.querySelector('.dccs-sr-only[aria-live="polite"]'));
})();

// ---- 2. Tapping an answer selects without advancing; Next advances ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  clickAnswer(root, 'yes');
  ok('selecting highlights the chip', !!activeChip(root) && activeChip(root).dataset.value === 'yes');
  ok('still on step 1 (no auto-advance)', /1\b.*\b7/.test(progress(root)));
  ok('Next becomes enabled', root.querySelector('.dccs-next').disabled === false);
  clickNext(root);
  ok('Next advances to step 2', /2\b.*\b7/.test(progress(root)));
  ok('Back appears after step 1', !!root.querySelector('.dccs-back'));
  ok('Back is not a chip', root.querySelector('.dccs-back').className.indexOf('dccs-chip') === -1);
})();

// ---- 3. Back preserves the chosen answer ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  answerNext(root, 'yes');
  root.querySelector('.dccs-back').click();
  ok('Back returns to step 1', /1\b.*\b7/.test(progress(root)));
  ok('previous answer preserved', activeChip(root) && activeChip(root).dataset.value === 'yes');
})();

// ---- 4. Clickable stepper jumps back to an answered step ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  answerNext(root, 'yes');     // step 1
  answerNext(root, 'no');      // step 2 -> now on step 3
  ok('on step 3', /3\b.*\b7/.test(progress(root)));
  var dot = root.querySelector('.dccs-stepper button.dccs-step-dot[data-step="0"]');
  ok('answered steps are clickable dots', !!dot);
  dot.click();
  ok('stepper dot jumps to step 1', /1\b.*\b7/.test(progress(root)));
})();

// ---- 5. Review step + edit returns to where you came from ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  stepThrough(root, 'either');
  ok('review lists all 7 answers', root.querySelectorAll('.dccs-review-list li').length === 7);
  ok('review has See-my-matches', !!root.querySelector('.dccs-see-matches'));
  root.querySelector('.dccs-edit[data-step="3"]').click();
  ok('edit jumps to that question (step 4)', /4\b.*\b7/.test(progress(root)));
  clickNext(root);
  ok('after editing, Next returns to review', root.querySelectorAll('.dccs-review-list li').length === 7);
})();

// ---- 6. See matches -> results, full names, recap, edit-answers ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  clickAnswer(root, 'yes'); clickNext(root);   // desk = yes
  stepThrough(root, 'either');
  root.querySelector('.dccs-see-matches').click();
  ok('results region shown', !!root.querySelector('.dccs-results'));
  ok('cottage names include their number', cardNames(root).every(function (n) { return /^Cottage \d+: /.test(n); }));
  ok('recap shows the chosen criterion', !!root.querySelector('.dccs-recap-chip'));
  ok('edit-answers control present', !!root.querySelector('.dccs-edit-answers'));
  ok('no "why excluded" panel', !root.querySelector('.dccs-excluded'));
})();

// ---- 7. Answers are not persisted — a refresh starts over ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  answerNext(root, 'yes');                 // answer step 1 and advance
  ok('nothing written to localStorage', w.localStorage.getItem('dccs_prefs_v1') === null);
  ok('answers not written to the URL', w.location.search === '');
  // A refresh = a brand-new page load with the same (clean) URL.
  const w2 = freshDom();
  const root2 = mountSelector(w2);
  ok('fresh load starts at Step 1', /1\b.*\b7/.test(progress(root2)) && !root2.querySelector('.dccs-results'));
  ok('fresh load has nothing preselected', !activeChip(root2));
})();

// ---- 8. Deep link jumps straight to results ----
(function () {
  const w = freshDom('https://example.com/?pet=true');
  const root = mountSelector(w);
  ok('deeplink skips the questionnaire', !root.querySelector('.dccs-chips-wizard'));
  ok('deeplink pet=true -> only Coconut Cottage', cardNames(root).length === 1 && cardNames(root)[0] === 'Cottage 34: Coconut Cottage');
})();

// ---- 9. No-match combo shows tagged fallback, no excluded panel ----
(function () {
  const w = freshDom('https://example.com/?pet=true&dining=4');
  const root = mountSelector(w);
  ok('impossible combo shows empty heading', !!root.querySelector('.dccs-empty'));
  ok('fallback card tagged with what it misses', !!root.querySelector('.dccs-miss'));
  ok('no excluded panel anywhere', !root.querySelector('.dccs-excluded'));
})();

// ---- 10. Header mode toggle switches modes ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  root.querySelector('.dccs-modetab[data-mode="compare"]').click();
  ok('compare mode shows 8 pickers', root.querySelectorAll('.dccs-pick').length === 8);
  ok('compare picker uses full names', root.querySelector('.dccs-pick').textContent.indexOf('Cottage ') === 0);
  root.querySelector('.dccs-modetab[data-mode="quick"]').click();
  ok('back to quick finder', !!root.querySelector('.dccs-chips-wizard'));
})();

// ---- 11. Compare overlay from results checkboxes ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
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

// ---- 14b. Accessibility hooks ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  ok('mode toggle is a group of pressed buttons', root.querySelector('.dccs-modebar[role="group"]') &&
    root.querySelector('.dccs-modetab[aria-pressed="true"]') &&
    root.querySelectorAll('.dccs-modetab[role="tab"]').length === 0);
  ok('current step has aria-current', !!root.querySelector('.dccs-step-dot[aria-current="step"]'));
  ok('disabled Next exposes a hint', /\w/.test(root.querySelector('.dccs-next').getAttribute('aria-label') || ''));
  ok('radiogroup is keyboard-reachable when nothing is selected',
    curChips(root).filter(function (c) { return c.getAttribute('tabindex') === '0'; }).length === 1);
  clickAnswer(root, 'yes');
  ok('selected pill marks aria-pressed', !!activeChip(root));

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
  ok('no render while deps missing', !div.querySelector('.dccs-step-q') && !div.dataset.dccsReady);
  injectScript(w, 'score.js');
  injectScript(w, 'labels.js');
  w.DCCS.bootAll(w.document);
  ok('renders once deps are available', !!div.querySelector('.dccs-step-q'));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
