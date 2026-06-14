/**
 * DOM smoke test for the Dora Canal Cottage Selector front-end.
 *
 * Mounts the widget in jsdom with the REAL data-config (produced by
 * tests/dump-config.php), then drives the actual controller — rendering all three
 * modes, simulating taps, deep links, localStorage, and the mini-entry modal —
 * asserting on the resulting DOM. This turns "lints clean" into "actually runs".
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
  // runScripts:'dangerously' executes the bundled scripts inside jsdom's own JS
  // context, so bare globals (MutationObserver, document, CustomEvent) resolve
  // exactly as they would in a real browser.
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

function chips(root, group) {
  return Array.prototype.slice.call(root.querySelectorAll('.dccs-chip[data-group="' + group + '"]'));
}
function clickChip(root, group, value) {
  chips(root, group).filter(function (c) { return c.dataset.value === value; })[0].click();
}
function cardNames(root) {
  return Array.prototype.slice.call(root.querySelectorAll('.dccs-card h4')).map(function (h) { return h.textContent.trim(); });
}

// ---- 1. Initial render (Quick Pick) ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  ok('renders 3 tabs', root.querySelectorAll('.dccs-tab').length === 3);
  ok('renders 7 quick questions', root.querySelectorAll('.dccs-q').length === 7);
  ok('panel wired role=tabpanel', !!root.querySelector('.dccs-body[role="tabpanel"][aria-labelledby]'));
  ok('active tab has tabindex 0', root.querySelector('.dccs-tab.is-active').getAttribute('tabindex') === '0');
  ok('renders results region', !!root.querySelector('.dccs-results'));
  ok('renders sticky CTA', !!root.querySelector('.dccs-see-results'));
  ok('live count starts at 8', /\b8\b/.test(root.querySelector('.dccs-count').textContent));
})();

// ---- 1b. Live match count updates as filters narrow ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  clickChip(root, 'pet', 'yes');
  ok('live count drops to 1 after pet filter', /\b1\b/.test(root.querySelector('.dccs-count').textContent));
})();

// ---- 2. Pet filter -> only Coconut Cottage (#34) ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  clickChip(root, 'pet', 'yes');
  const names = cardNames(root);
  ok('pet=yes shows Coconut Cottage', names.indexOf('Coconut Cottage') !== -1);
  ok('pet=yes shows exactly one card', root.querySelectorAll('.dccs-card').length === 1);
})();

// ---- 3. Ground-floor filter excludes The Lighthouse (#23) + why-excluded ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  clickChip(root, 'ground', 'yes');
  ok('ground filter never shows The Lighthouse', cardNames(root).indexOf('The Lighthouse') === -1);
  ok('why-excluded panel present', !!root.querySelector('.dccs-excluded'));
})();

// ---- 4. Empty combo (pet + table-for-4) shows fallback closest matches ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  clickChip(root, 'pet', 'yes');
  clickChip(root, 'dining', '4');
  ok('impossible combo shows empty heading', !!root.querySelector('.dccs-empty'));
  ok('empty state still offers fallback cards', root.querySelectorAll('.dccs-card').length >= 1);
})();

// ---- 5. Tab switching: weights + compare ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  root.querySelector('.dccs-tab[data-mode="weights"]').click();
  ok('weights mode renders 8 priority rows', root.querySelectorAll('.dccs-wrow').length === 8);
  root.querySelector('.dccs-tab[data-mode="compare"]').click();
  ok('compare mode renders 8 pickers', root.querySelectorAll('.dccs-pick').length === 8);
  // Re-query after each click — the widget re-renders, so prior nodes go stale.
  root.querySelector('.dccs-pick[data-cmp="22"]').click();
  root.querySelector('.dccs-pick[data-cmp="23"]').click();
  ok('compare matrix appears with 2 picks', !!root.querySelector('.dccs-matrix'));
  ok('matrix highlights differing cells', !!root.querySelector('.dccs-matrix td.is-diff'));
})();

// ---- 6. Reset returns to defaults ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  clickChip(root, 'pet', 'yes');
  root.querySelector('.dccs-reset').click();
  ok('reset clears pet filter (>1 card again)', root.querySelectorAll('.dccs-card').length > 1);
})();

// ---- 7. Deep link initializes state ----
(function () {
  const w = freshDom('https://example.com/?pet=true&mode=quick');
  const root = mountSelector(w);
  ok('deeplink pet=true -> Coconut Cottage only', cardNames(root).length === 1 && cardNames(root)[0] === 'Coconut Cottage');
})();

// ---- 8. localStorage recall across reload ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  root.querySelector('.dccs-tab[data-mode="weights"]').click();
  const saved = w.localStorage.getItem('dccs_prefs_v1');
  ok('preferences saved to localStorage', !!saved && JSON.parse(saved).mode === 'weights');
  ok('highlight not persisted', JSON.parse(saved).highlight === undefined);
})();

// ---- 9. Mini-entry modal opens in Quick Pick, highlights cottage, traps focus, Esc closes ----
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
  ok('modal selector renders in quick mode', !!modal.querySelector('.dccs-q'));
  ok('modal focus moved to close button', w.document.activeElement === modal.querySelector('.dccs-modal-close'));
  ok('body scroll locked while modal open', w.document.body.style.overflow === 'hidden');
  const hc = modal.querySelector('.dccs-card.is-highlight');
  ok('highlighted cottage (#31) surfaced', !!hc && hc.querySelector('h4').textContent.indexOf('Hibiscus Hut') !== -1);

  const esc = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  w.document.dispatchEvent(esc);
  ok('Esc closes modal', !w.document.querySelector('.dccs-modal'));
  ok('body scroll restored after close', w.document.body.style.overflow === '');
})();

// ---- 10. pageUrl uses safe, real cottage links ----
(function () {
  const w = freshDom();
  const root = mountSelector(w);
  const href = root.querySelector('.dccs-view').getAttribute('href');
  ok('view link points to /accommodation/', /^\/accommodation\/cottage-\d+\/$/.test(href));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
