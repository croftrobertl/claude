'use strict';
/**
 * 0.53.0 — PROOF THAT WHAT ROB KEPT IS BYTE-IDENTICAL.
 *
 * Renders /staff/ twice from the same fixture, clock and viewport: once
 * with 0.52.0 exactly as committed (28448c6 — its staff.js minified by its
 * own build, its staff.css, its widget PHP, its strings) and once with the
 * working tree. Then compares, as markup (outerHTML, byte for byte):
 *
 *   - the whole shell outside the Stats output: the calendar, the row under
 *     it, the Stats toggle, the period controls (Timeframe, Month, the
 *     arrows, the date line) — with only data-staff-config set aside (it
 *     carries the strings; their changes are listed key by key in
 *     live-defaults-test.php);
 *   - inside Stats: the six tiles; Nights by Cottage's rows (its header and
 *     tip are changes Rob asked for, compared apart); Stays by Length;
 *     Arrivals & Departures by Day; Upcoming Nights vs Last Year; the heat
 *     map; Nights by Source's and Days Booked Ahead's headings;
 *   - and the computed style of every element of the kept parts, and of an
 *     open tip's dark box.
 * At 390 and 1280, for November 2026 (a comparison) and October 2025
 * (none). Tip ids are a page-wide counter, so after the first render they
 * are compared by order, not number (0.53.0 makes one more tip a render).
 *
 *   node keep-0530-proof.js            (needs git history: 28448c6)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const X = require('./stats-053-fixture.js');
const { check, done } = H.reporter();

const BASE = process.env.KEEP_BASE || '28448c6';
const REPO = path.resolve(__dirname, '../..');
const OLD = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-0530-'));
execSync(`git -C ${REPO} archive ${BASE} | tar -x -C ${OLD}`);
fs.symlinkSync(path.join(REPO, 'tests/browser/node_modules'), path.join(OLD, 'tests/browser/node_modules'));
fs.symlinkSync(path.join(REPO, 'tools/node_modules'), path.join(OLD, 'tools/node_modules'));
const S_NEW = require('./staff-harness.js');
const S_OLD = require(path.join(OLD, 'tests/browser/staff-harness.js'));
const ORIGIN = 'http://staff.test/';
// Which properties differ, element by element (the first few).
const styleDiff = (a, b, all) => { const out = []; if (a.length !== b.length) out.push('count ' + a.length + ' → ' + b.length);
  a.forEach((e, i) => { const f = b[i] || []; e.forEach((kv, j) => { if (kv !== f[j]) out.push(i + ' ' + kv + ' → ' + f[j]); }); }); return all ? out : out.slice(0, 6); };

const KEPT_STATS = ['.mphbac-staff-stats-kpis', '.mphbac-staff-percot > tbody', '.mphbac-staff-stats-block.is-mix', '.mphbac-staff-stats-block.is-weekdays',
  '.mphbac-staff-stats-block.is-pace', '.mphbac-staff-stats-block.is-heat',
  '.mphbac-staff-stats-block.is-percot .mphbac-staff-stats-h', '.mphbac-staff-stats-block.is-source .mphbac-staff-stats-h', '.mphbac-staff-stats-block.is-lead .mphbac-staff-stats-h'];

(async () => {
  const browser = await chromium.launch(S_NEW.CHROMIUM);
  const grab = async (S, w, month, capsVs) => {
    const html = S.boardShell({ today: X.TODAY, cottages: X.COTTAGES, bookings: X.BOOKINGS, bodyStyle: 'padding:0 16px', head: S.raleway() });
    const ctx = await browser.newContext(w < 700 ? { viewport: { width: w, height: 900 }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: 1000 } });
    await ctx.route(ORIGIN + '**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    const p = await ctx.newPage();
    await p.goto(ORIGIN);
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-title').textContent !== '');
    await p.evaluate(() => document.fonts.ready);
    await p.evaluate(() => { document.querySelector('.mphbac-staff-stats').open = true; });
    await p.waitForFunction(() => document.querySelector('.mphbac-staff-percot'));
    if (month) {
      await p.selectOption('.mphbac-staff-stats-month', month);
      await p.waitForFunction(m => document.querySelector('.mphbac-staff-stats-range').textContent.includes(m), month === '2025-10' ? 'Oct' : 'Nov');
      await p.waitForTimeout(200);
    }
    // capsVs: the one word Rob asked for in lower case drawn in capitals
    // again, to show the cottage rows' few-pixel column shift is that word's
    // width and nothing else.
    if (capsVs) await p.addStyleTag({ content: '.mphbac-staff .mphbac-staff-percot .mphbac-staff-percot-h .mphbac-staff-percot-as-typed { text-transform: uppercase !important; }' });
    const r = await p.evaluate(({ KEPT, renumber }) => {
      // The shell's own per-load random ids (mphbac-staff-ly-xxxxxxx,
      // mphbac-staff-preview-xxxxxxx) are set aside: they differ between
      // ANY two loads of the same version.
      const norm = h => (h = h.replace(/(mphbac-staff-(?:ly|preview))-[a-z0-9]{6,8}\b/g, '$1-RANDOM'), renumber ? h.replace(/mphbac-staff-tip-\d+/g, (() => { const seen = {}; let n = 0; return m => seen[m] || (seen[m] = 'mphbac-staff-tip-#' + (++n)); })()) : h);
      const styleOf = root => [root, ...root.querySelectorAll('*')].map(e => { const c = getComputedStyle(e); return [...c].map(k => k + ':' + c.getPropertyValue(k)); });
      const out = document.querySelector('.mphbac-staff-stats-out');
      const shell = document.querySelector('.mphbac-staff').cloneNode(true);
      shell.querySelector('.mphbac-staff-stats-out').textContent = '';
      shell.removeAttribute('data-staff-config');
      const parts = {};
      for (const sel of KEPT) { const e = out.querySelector(sel); parts[sel] = e ? { html: norm(e.outerHTML), style: styleOf(e) } : null; }
      // Every tile's tip opened in turn: its box's own style (the dark box).
      const tipStyles = [...out.querySelectorAll('.mphbac-staff-kpi .mphbac-staff-tip')].map(b => {
        b.click(); const c = getComputedStyle(b._box || document.getElementById(b.getAttribute('aria-controls')));
        const s = ['background-color', 'color', 'font-size', 'font-weight', 'line-height', 'padding', 'border-radius', 'box-shadow', 'max-width', 'width', 'height', 'left', 'top'].map(k => k + ':' + c.getPropertyValue(k)).join(';');
        b.click(); document.body.click(); return s;
      });
      const controls = document.querySelector('.mphbac-staff-stats-body');
      // The controls: every element of the body but the output (the body's
      // own box grows with what Stats now holds, by design).
      const ctl = [...controls.querySelectorAll(':scope > :not(.mphbac-staff-stats-out), :scope > :not(.mphbac-staff-stats-out) *')];
      return { shell: norm(shell.outerHTML), parts, tipStyles, controlsStyle: ctl.map(e => styleOf(e)[0]) };
    }, { KEPT: KEPT_STATS, renumber: !!month });
    await ctx.close();
    return r;
  };

  for (const w of [390, 1280]) {
    for (const month of [null, '2025-10']) {
      const label = w + 'px, ' + (month ? 'October 2025 (no comparison; a second render)' : 'November 2026 (first render)');
      console.log('\n-- ' + label + ' --');
      const a = await grab(S_OLD, w, month), b = await grab(S_NEW, w, month), c = await grab(S_NEW, w, month, true);
      check('the shell outside Stats\' output — calendar, controls, the period row — byte-identical (' + a.shell.length + ' bytes)', a.shell === b.shell,
        a.shell === b.shell ? '' : (() => { let i = 0; while (a.shell[i] === b.shell[i]) i++; return a.shell.slice(i - 80, i + 80) + ' ≠ ' + b.shell.slice(i - 80, i + 80); })());
      check('...the period controls computed style, element for element (' + a.controlsStyle.length + ' elements)', JSON.stringify(a.controlsStyle) === JSON.stringify(b.controlsStyle), styleDiff(a.controlsStyle, b.controlsStyle));
      for (const sel of KEPT_STATS) {
        const x = a.parts[sel], y = (sel === '.mphbac-staff-percot > tbody' ? { html: b.parts[sel].html, style: c.parts[sel].style } : b.parts[sel]);
        if (sel === '.mphbac-staff-percot > tbody') {
          const d = styleDiff(a.parts[sel].style, b.parts[sel].style, true);
          check('...the cottage rows as shipped: only column geometry moves (width / origin), by the lowercase "vs"\'s few pixels (' + d.length + ' values)', d.length && d.every(t => /^\d+ (inline-size|width|perspective-origin|transform-origin):/.test(t)), d);
        }
        check(sel + ': markup byte-identical (' + (x ? x.html.length : 0) + ' bytes) and computed style element for element',
          !!x && !!y && x.html === y.html && JSON.stringify(x.style) === JSON.stringify(y.style),
          !x || !y ? 'missing' : x.html === y.html && JSON.stringify(x.style) === JSON.stringify(y.style) ? '' : x.html !== y.html ? (() => { let i = 0; while (x.html[i] === y.html[i]) i++; return x.html.slice(i - 60, i + 60) + ' ≠ ' + y.html.slice(i - 60, i + 60); })() : styleDiff(x.style, y.style));
      }
      check('every tile\'s open ⓘ: the same dark box (colour, type, padding, radius, shadow, size, place)', a.tipStyles.length === 6 && JSON.stringify(a.tipStyles) === JSON.stringify(b.tipStyles), a.tipStyles.map((s, i) => s === b.tipStyles[i]));
    }
  }
  await browser.close();
  fs.rmSync(OLD, { recursive: true, force: true });
  done();
})().catch(e => { console.error(e); fs.rmSync(OLD, { recursive: true, force: true }); process.exit(1); });
