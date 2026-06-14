/**
 * DOM smoke test for the Dora Canal Cottage Selector front-end (wizard flow).
 *
 * Mounts the widget in jsdom with the REAL data-config (tests/dump-config.php),
 * then drives the actual controller — stepping through the wizard, review/edit,
 * results, deep links, no-match tagging, More-options modes, localStorage, and
 * the mini-entry modal — asserting on the resulting DOM.
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

function freshDom(url, html) {
  const dom = new JSDOM(html || '<!DOCTYPE html><body></body>', {
    url: url || 'https://example.com/',
    pretendToBeVisual: true,
    runScripts: 'dangerously'
  });
  const { window } = dom;
  ['score.js', 'labels.js', 'selector.js'].forEach(function (f) {
    const s = window.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(JS, f), 'utf8');
    window.document.body.appendChild(s);
  });
  return window;
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
function clickAnswer(root, value) {
  var c = curChips(root).filter(function (n) { return n.dataset.value === value; })[0] || curChips(root)[0];
  c.click();
}
function cardNames(root) {
  return Array.prototype.slice.call(root.querySelectorAll('.dccs-card h4')).map(function (h) { return h.textContent.trim(); });
}
function stepThrough(root, value) {
  // Click `value` (or the first chip) on each question until we leave stage 'q'.
  for (var k = 0; k < 8 && root.querySelector('.dccs-chips-wizard'); k++) { clickAnswer(root, value); }
}

// ---- 1. Wizard starts at one question ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  ok('no tabs (wizard, not tabbed)', root.querySelectorAll('.dccs-tab').length === 0);
  ok('shows exactly one question step', root.querySelectorAll('.dccs-step-q').length === 1);
  ok('progress reads Step 1 of 7', /1\b.*\b7/.test(progress(root)));
  ok('three answer chips', curChips(root).length === 3);
  ok('live count shows 8', /\b8\b/.test(root.querySelector('.dccs-count').textContent));
  ok('no Back on first step', !root.querySelector('.dccs-back'));
  ok('More options row present', !!root.querySelector('.dccs-to-mode[data-mode="compare"]'));
  ok('sr live region present', !!root.querySelector('.dccs-sr-only[aria-live="polite"]'));
})();

// ---- 2. Auto-advance + Back preserves the answer ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  clickAnswer(root, 'yes');                 // answer Q1
  ok('auto-advanced to step 2', /2\b.*\b7/.test(progress(root)));
  ok('Back appears after step 1', !!root.querySelector('.dccs-back'));
  root.querySelector('.dccs-back').click(); // go back to Q1
  ok('Back returns to step 1', /1\b.*\b7/.test(progress(root)));
  var active = curChips(root).filter(function (c) { return c.classList.contains('is-active'); })[0];
  ok('previous answer preserved', active && active.dataset.value === 'yes');
})();

// ---- 3. Reaching the Review step, then Edit jumps back ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  stepThrough(root, 'either');
  ok('review step lists all 7 answers', root.querySelectorAll('.dccs-review-list li').length === 7);
  ok('review has a See-my-matches button', !!root.querySelector('.dccs-see-matches'));
  root.querySelector('.dccs-edit[data-step="4"]').click();
  ok('Edit jumps to that question (step 5)', /5\b.*\b7/.test(progress(root)));
})();

// ---- 4. See my matches -> results with recap ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  // Answer with a real preference so the recap has content.
  clickAnswer(root, 'yes');                 // desk = yes
  stepThrough(root, 'either');              // rest = doesn't matter
  root.querySelector('.dccs-see-matches').click();
  ok('results region shown', !!root.querySelector('.dccs-results'));
  ok('results recap present', !!root.querySelector('.dccs-recap'));
  ok('edit-answers control present', !!root.querySelector('.dccs-edit-answers'));
})();

// ---- 5. Deep link jumps straight to results ----
(function () {
  const w = freshDom('https://example.com/?pet=true');
  const root = mountSelector(w);
  ok('deeplink skips the questionnaire', !root.querySelector('.dccs-chips-wizard'));
  ok('deeplink pet=true -> Coconut Cottage only', cardNames(root).length === 1 && cardNames(root)[0] === 'Coconut Cottage');
})();

// ---- 6. No-match combo shows tagged fallback ----
(function () {
  const w = freshDom('https://example.com/?pet=true&dining=4');
  const root = mountSelector(w);
  ok('impossible combo shows empty heading', !!root.querySelector('.dccs-empty'));
  ok('fallback cards present', root.querySelectorAll('.dccs-card').length >= 1);
  ok('fallback card tagged with what it misses', !!root.querySelector('.dccs-miss'));
})();

// ---- 7. "Doesn't matter" leaves hard filters off ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  stepThrough(root, 'either');              // all "Doesn't matter"
  root.querySelector('.dccs-see-matches').click();
  ok('no constraints -> several cottages match', root.querySelectorAll('.dccs-card').length > 1);
  ok('no recap when nothing chosen', !root.querySelector('.dccs-recap'));
})();

// ---- 8. More options: Compare + back to finder ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  root.querySelector('.dccs-to-mode[data-mode="compare"]').click();
  ok('compare mode shows 8 pickers', root.querySelectorAll('.dccs-pick').length === 8);
  root.querySelector('.dccs-pick[data-cmp="22"]').click();
  root.querySelector('.dccs-pick[data-cmp="23"]').click();
  ok('compare matrix appears', !!root.querySelector('.dccs-matrix'));
  ok('matrix highlights differing cells', !!root.querySelector('.dccs-matrix td.is-diff'));
  root.querySelector('.dccs-to-finder').click();
  ok('back to finder returns to wizard', !!root.querySelector('.dccs-chips-wizard'));
})();

// ---- 9. Reset returns to the first question ----
(function () {
  const w = freshDom('https://example.com/?pet=true');
  const root = mountSelector(w);
  root.querySelector('.dccs-reset').click();
  ok('reset returns to step 1 of the wizard', /1\b.*\b7/.test(progress(root)));
})();

// ---- 10. localStorage recall (no step/stage/highlight persisted) ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  clickAnswer(root, 'yes');
  const saved = JSON.parse(w.localStorage.getItem('dccs_prefs_v1') || '{}');
  ok('preferences saved', saved && saved.quick && saved.quick.desk === 'yes');
  ok('step/stage/highlight not persisted', saved.step === undefined && saved.stage === undefined && saved.highlight === undefined);
})();

// ---- 11. Mini-entry modal opens at results, highlights cottage, traps focus ----
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
  ok('modal focus on close button', w.document.activeElement === modal.querySelector('.dccs-modal-close'));
  ok('body scroll locked', w.document.body.style.overflow === 'hidden');
  const hc = modal.querySelector('.dccs-card.is-highlight');
  ok('highlighted cottage (#31) surfaced', !!hc && hc.querySelector('h4').textContent.indexOf('Hibiscus Hut') !== -1);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Esc closes modal', !w.document.querySelector('.dccs-modal'));
  ok('body scroll restored', w.document.body.style.overflow === '');
})();

// ---- 12. Result links point to real cottage pages ----
(function () {
  const w = freshDom('https://example.com/?pet=true');
  const root = mountSelector(w);
  const href = root.querySelector('.dccs-view').getAttribute('href');
  ok('view link points to /accommodation/', /^\/accommodation\/cottage-\d+\/$/.test(href));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
