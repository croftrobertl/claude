'use strict';
/**
 * DCC Seasons — the settings page, Admin UI round 1 (4.18.0, Rob's picks).
 *
 * Renders the REAL page (tools/render-settings.php) and, for comparison,
 * the 4.17.0 page from git (BASE), and checks:
 *   1. the year ribbon's dates equal the old "Resolved dates" table for
 *      both years, every row, on the default schedule and a hard one
 *      (wrap-around, one-off year, Feb 29, offsets, Easter anchors);
 *   2. save -> reload round-trips every setting byte for byte: what the new
 *      page posts sanitizes to exactly what is stored, a second save is a
 *      fixed point, and the OLD page posts the same bytes for the same
 *      option (tools/admin-post.php = Settings::sanitize);
 *   3. the sticky save bar: count, Discard, the leave warning, no layout
 *      jump, the purge notice as a toast;
 *   4. drag (fixed date and holiday offset) and keyboard editing, the side
 *      sheet (edit, delete, add, Escape, focus return);
 *   5. chips <-> stored page IDs, group toggles, search, locked pages;
 *   6. tabs, old URLs and anchors;
 *   7. every word of every old explanation is still on the page;
 *   8. 390 px: no sideways scroll; AA contrast on bands; focus visible;
 *      reduced motion; Raleway bundled; no external request.
 *
 * Mutations (each must fail): DCC_ADMIN_MUT=offbyone (the ribbon's
 * resolver ends a day late) | droprow (the save drops a row).
 *
 * Usage: node tools/test-admin.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { playwright } = require('./harness');

const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.DCC_ADMIN_BASE || '560a0cb';   /* 4.17.0 */
const MUT = process.env.DCC_ADMIN_MUT || '';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-admin-'));
const YEAR = '2026';
let pass = 0, fail = 0; const problems = [];
function ok(c, name, detail) {
  if (c) { pass++; console.log('  ok   ' + name); }
  else { fail++; problems.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

/* the 4.17.0 plugin from git, for the old page */
const OLD = path.join(TMP, 'old', 'dcc-seasons');
fs.mkdirSync(path.join(OLD, 'includes'), { recursive: true });
for (const f of execFileSync('git', ['ls-tree', '--name-only', BASE, 'dcc-seasons/includes/'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')) {
  fs.writeFileSync(path.join(OLD, 'includes', path.basename(f)), execFileSync('git', ['show', BASE + ':' + f], { cwd: ROOT, maxBuffer: 16 << 20 }));
}
fs.writeFileSync(path.join(OLD, 'dcc-seasons.php'), execFileSync('git', ['show', BASE + ':dcc-seasons/dcc-seasons.php'], { cwd: ROOT }));

/* admin.js, patched for a mutation */
let ADMIN_JS = path.join(ROOT, 'dcc-seasons/assets/js/admin.js');
if (MUT) {
  let src = fs.readFileSync(ADMIN_JS, 'utf8'), before = src;
  if (MUT === 'offbyone') { src = src.replace("if (e < s) { e = resolve(r.end, y + 1); }\n\t\treturn [s, e];", "if (e < s) { e = resolve(r.end, y + 1); }\n\t\treturn [s, fromDn(dn(e) + 1)];"); }
  if (MUT === 'droprow') { src = src.replace('submitting = true;', 'submitting = true; var _r = rowEls(); if (_r.length) { _r[_r.length - 1].remove(); }'); }
  if (src === before) { console.error('mutation ' + MUT + ' did not apply'); process.exit(2); }
  ADMIN_JS = path.join(TMP, 'admin-mut.js');
  fs.writeFileSync(ADMIN_JS, src);
  console.log('MUTATION ' + MUT);
}

let nRender = 0;
function render(opt, { tab = '', old = false, env = {} } = {}) {
  const of = path.join(TMP, `opt-${++nRender}.json`);
  fs.writeFileSync(of, JSON.stringify(opt));
  const e = Object.assign({}, process.env, { DCC_YEAR: YEAR }, env);
  if (old) { e.DCC_ROOT = OLD; } else { delete e.DCC_ROOT; }
  let html = execFileSync('php', [path.join(__dirname, 'render-settings.php'), '--tab=' + tab, '--opt=' + of], { cwd: ROOT, encoding: 'utf8', env: e, maxBuffer: 64 << 20 });
  if (!old) { html = html.replace(/src="file:\/\/[^"]*\/assets\/js\/admin\.js"/, 'src="file://' + ADMIN_JS + '"'); }
  const f = path.join(TMP, `page-${nRender}.html`);
  fs.writeFileSync(f, html);
  return f;
}
function sanitize(body) {
  const bf = path.join(TMP, `body-${Date.now()}-${Math.random()}.txt`);
  fs.writeFileSync(bf, body);
  return execFileSync('php', [path.join(__dirname, 'admin-post.php'), bf], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { DCC_YEAR: YEAR }) });
}
function sanitizeJson(body) {
  const bf = path.join(TMP, `body-${Date.now()}-${Math.random()}.txt`);
  fs.writeFileSync(bf, body);
  return JSON.parse(execFileSync('php', [path.join(__dirname, 'admin-post.php'), bf, '--json'], { cwd: ROOT, encoding: 'utf8' }));
}

/* the posted body, exactly as the browser would build it after every submit handler ran */
async function post(p) {
  return p.evaluate(() => new Promise(res => {
    const f = document.getElementById('dcc-seasons-form') || document.querySelector('form[action="options.php"]');
    const h = e => { e.preventDefault(); f.removeEventListener('submit', h); res(new URLSearchParams(new FormData(f)).toString()); };
    f.addEventListener('submit', h);
    f.requestSubmit();
  }));
}

/* the 2026 live settings (stored), and a hard one that changes everything */
const LIVE = { enabled: 1, ambient: 1, egg: 1, layering: 'front', front_z: 999, opacity: 0.7, density: 16, placement: 'content', richness: 'full', subtle: 1, subtle_intensity: 0.6, subtle_map: [], exclude_booking: 1, guide_effects: 0, exclude_paths: 'staff', exclude_ids: '18119', fx_reflections: 1, fx_vignettes: 1, fx_pointer: 1, fx_evening: 1, scope: 'no_cottages' };
const fx = (m, d, off = 0) => ({ on: 'fixed', m, d, off });
const at = (on, off = 0) => ({ on, off });
const row = (start, end, theme, label, year = 0) => ({ start, end, theme, label, year });
const HARD = {
  enabled: 0, ambient: 0, egg: 0, layering: 'behind', front_z: 1234, opacity: 0.45, density: 3, placement: 'footer', richness: 'classic',
  subtle: 0, subtle_intensity: 0.25, subtle_map: { halloween: '', christmas: 'leaves', snowbird: 'bokeh' }, exclude_booking: 0, guide_effects: 1,
  exclude_paths: 'staff\nfoo/bar', exclude_ids: '18119, 22', fx_reflections: 0, fx_vignettes: 1, fx_pointer: 0, fx_evening: 1, scope: 'pages',
  tap_selector: '#site-title, .entry-title', tap_count: 7, show_on: ['home', 3002, 1399, 1607],
  schedule: [
    row(fx(12, 20), fx(1, 6), 'new_years', 'New Year\'s "Big" <one> & more'),
    row(fx(2, 29), fx(3, 2), 'strawberry', 'Leap day'),
    row(at('easter', -12), at('easter', 3), 'easter', ''),
    row(at('mardi_gras', -8), at('mardi_gras'), 'mardi_gras', 'Mardi Gras'),
    row(fx(7, 1, 2), fx(7, 4, -1), 'july4', 'Offsets on fixed'),
    row(at('thanksgiving', -20), at('thanksgiving', 3), 'thanksgiving', 'One-off', 2027),
    row(fx(11, 1), at('thanksgiving'), 'thanksgiving', 'Thanksgiving'),
    row(at('anniversary'), at('anniversary'), 'anniversary', ''),
    row(at('memorial_day', 1), fx(7, 31), 'summer_canal', 'Summer'),
    row(fx(10, 1), at('halloween'), 'halloween', 'Halloween', 2026),
    row(at('christmas', -40), at('new_year', 2), 'christmas', 'Wraps by anchors'),
    row(fx(1, 1), fx(12, 31), 'florida_keys', 'Base'),
  ],
};

(async () => {
  const { chromium } = playwright();
  let b;
  try { b = await chromium.launch({ args: ['--no-sandbox'] }); }
  catch (e) { b = await chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  const ext = [];
  async function open(f, w = 1440, opts = {}) {
    const p = await b.newPage(Object.assign({ viewport: { width: w, height: 900 } }, opts));
    p._errs = [];
    p.on('pageerror', e => p._errs.push(e.message));
    p.on('request', r => { if (r.frame() === p.mainFrame() && !/^(file|data|blob):/.test(r.url())) { ext.push(r.url()); } });   /* the Preview tab's frame loads the site by design */
    await p.goto('file://' + f + (opts.hash || ''), { waitUntil: 'load' });
    await p.waitForTimeout(150);
    return p;
  }

  /* the stored option each fixture becomes after one save on the new page */
  const STORED = {};
  for (const [name, opt] of [['live', LIVE], ['hard', HARD]]) {
    console.log(`\n  --- ${name}: the ribbon against the old Resolved dates table ---`);
    const pNew0 = await open(render(opt));
    STORED[name] = sanitize(await post(pNew0));
    await pNew0.close();
    const S = sanitizeJson(await (async () => { const p = await open(render(opt)); const x = await post(p); await p.close(); return x; })());

    const pOld = await open(render(S, { old: true }));
    const oldTable = await pOld.evaluate(() => [...document.querySelectorAll('table.dcc-seasons-resolved tbody tr')].map(tr => [...tr.cells].map(td => td.textContent.trim())));
    const oldHead = await pOld.evaluate(() => [...document.querySelectorAll('table.dcc-seasons-resolved thead th')].map(th => th.textContent.trim()));
    const oldBody = await post(pOld);
    const oldDesc = await pOld.evaluate(() => [...document.querySelectorAll('.description')].map(d => d.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
    await pOld.close();

    const p = await open(render(S));
    ok(!p._errs.length, `${name}: no page errors`, p._errs.join(' | '));
    const years = oldHead.slice(2).map(Number);
    let bad = [];
    const nRows = await p.evaluate(() => document.querySelectorAll('#dcc-rows .dcc-row').length);
    ok(nRows === oldTable.length && nRows === S.schedule.length, `${name}: one row each (${nRows} rows, old table ${oldTable.length})`, '');
    for (let yi = 0; yi < years.length; yi++) {
      const Y = years[yi];
      await p.click(`.dcc-year[data-year="${Y}"]`);
      const got = await p.evaluate(Y => {
        const out = {};
        document.querySelectorAll('.dcc-band').forEach(b => { if (+b.dataset.yy === Y) { out[b.dataset.row] = b.dataset.range; } });
        return out;
      }, Y);
      const geom = await p.evaluate(Y => {
        /* every band's place on the track is the day it says */
        const N = (Date.UTC(Y + 1, 0, 1) - Date.UTC(Y, 0, 1)) / 864e5, bad = [];
        document.querySelectorAll('.dcc-band:not(.is-pill)').forEach(b => {
          const want = +b.dataset.s / N * 100, have = parseFloat(b.style.left);
          const ww = (+b.dataset.e - +b.dataset.s + 1) / N * 100, hw = parseFloat(b.style.width);
          if (Math.abs(want - have) > 1e-3 || Math.abs(ww - hw) > 1e-3) { bad.push(b.dataset.key); }
        });
        return bad;
      }, Y);
      ok(!geom.length, `${name} ${Y}: every band sits on its own days`, geom.join(' '));
      oldTable.forEach((cells, i) => {
        const want = cells[2 + yi], have = got[String(i)] || '—';
        if (want !== have) { bad.push(`row ${i} ${cells[0]} ${Y}: table "${want}" ribbon "${have}"`); }
      });
      /* the ribbon's own dates, read back from the resolver, against the band */
      const segs = await p.evaluate(Y => {
        const N = (Date.UTC(Y + 1, 0, 1) - Date.UTC(Y, 0, 1)) / 864e5, base = Date.UTC(Y, 0, 1) / 864e5, out = [];
        DCCSeasonsUI.rows().forEach(r => [Y - 1, Y].forEach(yy => {
          const rr = DCCSeasonsUI.resolveRow(r, yy); if (!rr) { return; }
          const dn = s => { const q = s.split('-'); return Date.UTC(+q[0], +q[1] - 1, +q[2]) / 864e5 - base; };
          const s = dn(rr[0]), e = dn(rr[1]);
          if (e < 0 || s > N - 1) { return; }
          const b = document.querySelector(`.dcc-band[data-row="${r.key}"][data-yy="${yy}"]`);
          out.push({ k: r.key + ':' + yy, ok: !!b && +b.dataset.s === Math.max(0, s) && +b.dataset.e === Math.min(N - 1, e) });
        }));
        return out;
      }, Y);
      ok(segs.every(s => s.ok), `${name} ${Y}: every row instance in the year has its band (${segs.length}), wrap-arounds drawn in both halves`, segs.filter(s => !s.ok).map(s => s.k).join(' '));
    }
    ok(!bad.length, `${name}: ribbon dates = the old table for ${years.join(' and ')}, all ${oldTable.length} rows`, bad.slice(0, 6).join('; '));

    console.log(`\n  --- ${name}: save -> reload, byte for byte ---`);
    const newBody = await post(p);
    const sNew = sanitize(newBody), sOld = sanitize(oldBody);
    const want = execFileSync('php', ['-r', 'echo serialize(json_decode(file_get_contents("php://stdin"), true));'], { input: JSON.stringify(S), encoding: 'utf8' });
    ok(sNew === STORED[name], `${name}: saving again stores the same bytes (fixed point, ${sNew.length} bytes)`, '');
    ok(sNew === sOld, `${name}: the new page posts what the 4.17.0 page posts for the same option`, diffHint(sNew, sOld));
    ok(sNew === want, `${name}: the stored option round-trips unchanged`, diffHint(sNew, want));
    const fd1 = await p.evaluate(() => [...new FormData(document.getElementById('dcc-seasons-form'))].map(x => x.join('=')));
    const p2 = await open(render(sanitizeJson(newBody)));
    const fd2 = await p2.evaluate(() => [...new FormData(document.getElementById('dcc-seasons-form'))].map(x => x.join('=')));
    ok(JSON.stringify(fd1) === JSON.stringify(fd2), `${name}: after reload the form holds every field as before (${fd1.length} fields)`, '');
    await p2.close();

    if (name === 'live') {
      console.log('\n  --- every word of the old explanations ---');
      const pv = await open(render(S, { tab: 'preview' }));
      const all = (await p.evaluate(() => document.body.textContent) + ' ' + await pv.evaluate(() => document.body.textContent)).replace(/\s+/g, ' ');
      await pv.close();
      const lost = oldDesc.filter(d => all.indexOf(d) < 0);
      ok(!lost.length, `all ${oldDesc.length} old explanations are on the new pages word for word`, lost.map(x => x.slice(0, 60)).join(' | '));
    }
    await p.close();
  }
  function diffHint(a, b) { if (a === b) { return ''; } let i = 0; while (a[i] === b[i]) { i++; } return `first difference at byte ${i}: …${a.slice(Math.max(0, i - 40), i + 40)}… vs …${b.slice(Math.max(0, i - 40), i + 40)}…`; }

  const SL = sanitizeJson(await (async () => { const p = await open(render(LIVE)); const x = await post(p); await p.close(); return x; })());
  const rowOf = theme => SL.schedule.findIndex(r => r.theme === theme);

  console.log('\n  --- the sticky save bar ---');
  {
    const p = await open(render(SL));
    const st = () => p.evaluate(() => ({ hidden: document.getElementById('dcc-savebar').hidden, text: document.querySelector('.dcc-sb-count').textContent }));
    ok((await st()).hidden, 'hidden while nothing has changed', '');
    const top0 = await p.evaluate(() => [document.querySelector('.dcc-card').getBoundingClientRect().top, document.documentElement.scrollHeight]);
    await p.click('#dcc-tab-look');
    await p.click('label.dcc-switch:has(#dcc-seasons-egg)');
    let s = await st();
    ok(!s.hidden && s.text === '1 Unsaved Change', 'one change: "1 Unsaved Change"', s.text);
    const top1 = await p.evaluate(() => [document.querySelector('.dcc-panel:not([hidden]) .dcc-card').getBoundingClientRect().top, document.documentElement.scrollHeight]);
    await p.$eval('#dcc-seasons-density', el => { el.value = '9'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    ok(await p.$eval('#dcc-seasons-density-out', o => o.textContent) === '9', 'the slider shows its live value', '');
    await p.click('#dcc-tab-where');
    await p.click('label[for="dcc-chip-3002"]');
    s = await st();
    ok(s.text === '3 Unsaved Changes', 'three changes on three tabs: "3 Unsaved Changes"', s.text);
    await p.click('#dcc-tab-look');
    const top2 = await p.evaluate(() => [document.querySelector('.dcc-panel:not([hidden]) .dcc-card').getBoundingClientRect().top, document.documentElement.scrollHeight]);
    ok(top1[0] === top2[0] && top1[1] === top2[1], 'the bar appearing moves nothing on the page', `${top1} vs ${top2} (first ${top0})`);
    /* the leave warning */
    let dialog = null;
    p.once('dialog', d => { dialog = d.type(); d.dismiss(); });
    await p.evaluate(() => { location.href = 'about:blank'; }).catch(() => {});
    await p.waitForTimeout(400);
    ok(dialog === 'beforeunload', 'leaving with unsaved changes asks first', String(dialog));
    await p.click('#dcc-discard');
    s = await st();
    const back = await p.evaluate(() => DCCSeasonsUI.count());
    ok(s.hidden && back === 0, 'Discard puts every field back and hides the bar', `${s.text} count ${back}`);
    ok(await p.$eval('#dcc-seasons-density-out', o => o.textContent) === '16' && await p.$eval('#dcc-chip-3002', c => !c.checked) && await p.$eval('#dcc-seasons-egg', c => c.checked), 'the slider, the chip and the switch are back', '');
    dialog = null;
    p.once('dialog', d => { dialog = d.type(); d.dismiss(); });
    await p.evaluate(() => { location.href = 'about:blank#x'; }).catch(() => {});
    await p.waitForTimeout(400);
    ok(dialog === null, 'nothing unsaved: leaving is not stopped', String(dialog));
    await p.close();
    /* saving does not warn */
    const p3 = await open(render(SL));
    await p3.click('#dcc-tab-egg');
    await p3.click('.dcc-step[data-step="1"][aria-controls="dcc-seasons-tap-count"]');
    ok(await p3.$eval('#dcc-seasons-tap-count', i => i.value) === '5' && await p3.$eval('.dcc-sb-count', e => e.textContent) === '1 Unsaved Change', 'the + stepper changes the tap count and counts', '');
    let d3 = null; p3.on('dialog', d => { d3 = d.type(); d.dismiss(); });
    await p3.evaluate(() => { document.getElementById('dcc-seasons-form').action = 'about:blank'; });
    await p3.click('#dcc-save');
    await p3.waitForTimeout(500);
    ok(d3 === null, 'Save leaves without a warning', String(d3));
    await p3.close();
    /* the purge notice as a toast */
    const p4 = await open(render(SL, { env: { DCC_TRANSIENT: JSON.stringify(['SpeedyCache', 'Server cache']) } }));
    const t = await p4.evaluate(() => ({ toast: [...document.querySelectorAll('.dcc-toast p')].map(x => x.textContent), notice: document.querySelectorAll('.dcc-admin-notices .notice-success').length }));
    ok(t.toast.includes('Settings saved and page cache purged: SpeedyCache, Server cache.') && !t.notice, 'the purge notice shows as a toast', JSON.stringify(t));
    await p4.close();
    const p5 = await open(render(SL, { env: { DCC_TRANSIENT: JSON.stringify(['none']) } }));
    const t5 = await p5.evaluate(() => [...document.querySelectorAll('.dcc-toast-warn p')].map(x => x.textContent).join(''));
    await p5.waitForTimeout(100);
    ok(/no page cache could be purged automatically/.test(t5), 'nothing purged: the warning stays as a toast', t5);
    await p5.close();
  }

  console.log('\n  --- drag and keyboard editing ---');
  {
    const p = await open(render(SL));
    const hi = rowOf('halloween'), tg = rowOf('thanksgiving'), xm = rowOf('christmas');
    async function dragTo(sel, day) {
      const h = await p.$(sel); const bb = await h.boundingBox();
      const track = await p.$eval(sel, el => { const r = el.parentNode.getBoundingClientRect(); return { x: r.x, w: r.width }; });
      const N = 365, x = track.x + (day + 0.5) / N * track.w;
      await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await p.mouse.down();
      await p.mouse.move((bb.x + x) / 2, bb.y + bb.height / 2, { steps: 4 });
      await p.mouse.move(x, bb.y + bb.height / 2, { steps: 4 });
      const tip = await p.$eval('.dcc-tip', t => t.textContent).catch(() => '');
      await p.mouse.up();
      return tip;
    }
    const doy = (m, d) => (Date.UTC(2026, m - 1, d) - Date.UTC(2026, 0, 1)) / 864e5;
    /* a fixed start: Oct 1 -> Oct 6 */
    let tip = await dragTo(`.dcc-hdl[data-row="${hi}"][data-yy="2026"][data-which="start"]`, doy(10, 6));
    const hv = await p.evaluate(i => { const r = document.querySelector(`.dcc-row[data-row="${i}"] .dcc-rule-fs[data-end="start"]`); return [r.querySelector('.dcc-m').value, r.querySelector('.dcc-d').value]; }, hi);
    ok(hv[0] === '10' && hv[1] === '6' && tip === 'Oct 6', 'dragging Halloween\'s start moves its fixed date to Oct 6', `${hv} tip "${tip}"`);
    ok(await p.$eval(`.dcc-band[data-row="${hi}"][data-yy="2026"]`, b => b.dataset.range) === 'Oct 6 – Oct 31, 2026', 'its band now reads Oct 6 – Oct 31, 2026', '');
    /* a holiday end: Thanksgiving (Nov 26, 2026) -> 4 days earlier */
    tip = await dragTo(`.dcc-hdl[data-row="${tg}"][data-yy="2026"][data-which="end"]`, doy(11, 22));
    const off = await p.evaluate(i => document.querySelector(`.dcc-row[data-row="${i}"] .dcc-rule-fs[data-end="end"] .dcc-seasons-off`).value, tg);
    const on = await p.evaluate(i => document.querySelector(`.dcc-row[data-row="${i}"] .dcc-rule-fs[data-end="end"] .dcc-seasons-on`).value, tg);
    ok(on === 'thanksgiving' && off === '-4' && tip === 'Thanksgiving −4 d · Nov 22', 'dragging Thanksgiving\'s end keeps the holiday and sets −4 days ("Thanksgiving −4 d")', `${on} ${off} tip "${tip}"`);
    const vt = await p.$eval(`.dcc-hdl[data-row="${tg}"][data-yy="2026"][data-which="end"]`, h => h.getAttribute('aria-valuetext'));
    ok(vt === 'Thanksgiving −4 d · Nov 22', 'the handle announces it the same way', vt);
    /* keyboard: Christmas's start (Thanksgiving +1) two days earlier, then a week later */
    await p.focus(`.dcc-band[tabindex="0"]`);
    for (let k = 0; k < 60; k++) {
      const cur = await p.evaluate(() => document.activeElement.dataset.row);
      if (cur === String(xm) && await p.evaluate(() => document.activeElement.dataset.yy) === '2026') { break; }
      await p.keyboard.press('ArrowRight');
    }
    ok(await p.evaluate(() => document.activeElement.dataset.key) === `b:${xm}:2026`, 'arrow keys walk the bands to Christmas', '');
    await p.keyboard.press('Tab');
    ok(await p.evaluate(() => document.activeElement.dataset.which) === 'start', 'Tab from a band reaches its start handle', '');
    await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
    let xo = await p.evaluate(i => document.querySelector(`.dcc-row[data-row="${i}"] .dcc-rule-fs[data-end="start"] .dcc-seasons-off`).value, xm);
    ok(xo === '-1', 'ArrowLeft twice: Christmas starts Thanksgiving −1', xo);
    await p.keyboard.press('Shift+ArrowRight');
    xo = await p.evaluate(i => document.querySelector(`.dcc-row[data-row="${i}"] .dcc-rule-fs[data-end="start"] .dcc-seasons-off`).value, xm);
    ok(xo === '6' && await p.evaluate(() => document.activeElement.dataset.which) === 'start', 'Shift+ArrowRight: a week later (+6), focus stays on the handle', xo);
    const body = await post(p);
    const saved = sanitizeJson(body);
    const sv = i => saved.schedule[i] || { start: {}, end: {} };
    ok(saved.schedule.length === SL.schedule.length && sv(hi).start.m === 10 && sv(hi).start.d === 6 && sv(tg).end.off === -4 && sv(xm).start.off === 6,
      'the save stores all three edits and every row', JSON.stringify([sv(hi).start, sv(tg).end, sv(xm).start, saved.schedule.length]));
    const others = saved.schedule.every((r, i) => [hi, tg, xm].includes(i) || JSON.stringify(r) === JSON.stringify(SL.schedule[i]));
    ok(others, 'no other row changed', '');
    ok(await p.$eval('.dcc-sb-count', e => e.textContent) === '3 Unsaved Changes', 'three edited rows count as 3 changes', '');
    await p.close();
  }

  console.log('\n  --- the side sheet ---');
  {
    const p = await open(render(SL));
    const hi = rowOf('halloween');
    await p.click(`.dcc-band[data-row="${hi}"][data-yy="2026"]`);
    ok(await p.$eval('#dcc-sheet', s => !s.hidden && !!s.querySelector('.dcc-row')), 'tapping a band opens its row in the sheet', '');
    ok(await p.evaluate(() => document.activeElement.classList.contains('dcc-r-theme')), 'focus moves into the sheet', '');
    ok(/2026: Oct 1 – Oct 31, 2026 · 2027: Oct 1 – Oct 31, 2027/.test(await p.$eval('#dcc-sheet-dates', e => e.textContent)), 'the sheet shows both years\' dates', '');
    await p.fill('#dcc-sheet .dcc-r-label', 'Spooky Month');
    ok(await p.$eval(`.dcc-band[data-row="${hi}"][data-yy="2026"] .dcc-band-t`, t => t.textContent) === 'Spooky Month', 'the band follows the label as it is typed', '');
    await p.keyboard.press('Escape');
    ok(await p.$eval('#dcc-sheet', s => s.hidden) && await p.evaluate(() => document.activeElement.dataset.key) === `b:${hi}:2026`, 'Escape closes it and focus returns to the band', '');
    const order = await p.evaluate(() => [...document.querySelectorAll('#dcc-rows .dcc-row')].map(r => r.dataset.row).join(','));
    ok(order === SL.schedule.map((r, i) => i).join(','), 'the row goes back to its place (the save keeps the order)', order);
    /* delete, then add */
    await p.keyboard.press('Enter');
    ok(await p.$eval('#dcc-sheet', s => !s.hidden), 'Enter on a band opens the sheet', '');
    await p.click('#dcc-sheet-delete');
    await p.click('#dcc-seasons-add-row');
    await p.selectOption('#dcc-sheet .dcc-r-theme', 'patriot_day');
    await p.selectOption('#dcc-sheet .dcc-rule-fs[data-end="start"] .dcc-m', '9');
    await p.selectOption('#dcc-sheet .dcc-rule-fs[data-end="start"] .dcc-d', '11');
    await p.selectOption('#dcc-sheet .dcc-rule-fs[data-end="end"] .dcc-seasons-on', 'patriot_day');
    await p.click('#dcc-sheet-done');
    ok(await p.$$eval('.dcc-band', bs => bs.some(b => b.dataset.range === 'Sep 11 – Sep 11, 2026')), 'the new row shows on the ribbon as Sep 11', '');
    const saved = sanitizeJson(await post(p));
    const want = SL.schedule.filter((r, i) => i !== hi);
    ok(saved.schedule.length === SL.schedule.length && JSON.stringify(saved.schedule.slice(0, -1)) === JSON.stringify(want) && saved.schedule[saved.schedule.length - 1].theme === 'patriot_day'
      && JSON.stringify(saved.schedule[saved.schedule.length - 1].end) === '{"on":"patriot_day","off":0}', 'the save drops the deleted row and appends the new one, the rest untouched', JSON.stringify(saved.schedule[saved.schedule.length - 1]));
    await p.click('#dcc-discard');
    const back = sanitizeJson(await post(p));
    ok(JSON.stringify(back.schedule) === JSON.stringify(SL.schedule), 'Discard brings the deleted row back and drops the new one', '');
    await p.close();
  }

  console.log('\n  --- chips <-> stored page IDs ---');
  {
    const p = await open(render(SL));
    await p.click('#dcc-tab-where');
    const list = async () => sanitizeJson(await post(p)).show_on;
    ok((await list()) === undefined, 'untouched: the default list is not stored (tracked default)', '');
    await p.click('label[for="dcc-chip-3002"]');
    ok(JSON.stringify(await list()) === JSON.stringify(['home', 22, 1005, 3002]), 'tapping Wildlife Guide adds 3002', JSON.stringify(await list()));
    await p.click('.dcc-group-t[data-group="cottage"]');
    ok(JSON.stringify(await list()) === JSON.stringify(['home', 22, 1005, 1069, 1071, 1607, 3002]) && await p.$eval('.dcc-group-t[data-group="cottage"]', b => b.getAttribute('aria-pressed')) === 'true', 'All Cottage Pages ticks every cottage', JSON.stringify(await list()));
    await p.click('.dcc-group-t[data-group="cottage"]');
    ok(JSON.stringify(await list()) === JSON.stringify(['home', 22, 1005, 3002]), 'and again unticks them', '');
    await p.click('.dcc-group-t[data-group="policy"]');
    const pol = await list();
    ok([3007, 3008, 3010].every(n => pol.includes(n)) && pol.length === 7, 'Policy Pages ticks Privacy, Terms and Accessibility', JSON.stringify(pol));
    await p.click('.dcc-group-t[data-group="policy"]');
    /* locks */
    const lk = await p.evaluate(() => ['1399', '4645', '18102', '18119', '22'].map(id => document.querySelector(`.dcc-chip-w[data-id="${id}"]`).classList.contains('is-locked')));
    ok(JSON.stringify(lk) === '[true,true,true,true,false]', 'Submit Booking, Guest Guide, Staff and Explore are locked; Contact is not', JSON.stringify(lk));
    await p.click('.dcc-chip-w[data-id="1399"] .dcc-i-lock');
    const why = await p.$eval('#dcc-pop-lock-1399', e => !e.hidden && e.textContent);
    ok(/booking flow/.test(why || ''), 'its ⓘ says why: the booking flow', String(why));
    await p.keyboard.press('Escape');
    await p.click('label[for="dcc-chip-1399"]', { force: true });
    ok(!(await list()).includes(1399), 'tapping a locked chip changes nothing', '');
    await p.click('label.dcc-switch:has(#dcc-seasons-exclude-booking)');
    ok(!(await p.$eval('.dcc-chip-w[data-id="1399"]', w => w.classList.contains('is-locked'))), 'switching the booking exclusion off unlocks it at once', '');
    await p.click('label[for="dcc-chip-1399"]');
    ok((await list()).includes(1399), 'and then it can be ticked', '');
    await p.fill('#dcc-seasons-exclude-ids', '18119, 22');
    ok(await p.$eval('.dcc-chip-w[data-id="22"]', w => w.classList.contains('is-locked')), 'adding 22 to the excluded IDs locks Contact Us', '');
    await p.fill('#dcc-chip-search', 'cott');
    const vis = await p.$$eval('.dcc-chip-w', ws => ws.filter(w => !w.hidden).map(w => w.dataset.id));
    ok(JSON.stringify(vis) === JSON.stringify(['1005', '1071', '1069', '1607']), 'search "cott" shows the Cottages page and the cottages', JSON.stringify(vis));
    await p.close();
    /* a stored list renders as the same chips */
    const p2 = await open(render(Object.assign({}, SL, { show_on: ['home', 3002, 1399, 1607] })));
    const on = await p2.$$eval('.dcc-chip-in:checked', cs => cs.map(c => c.value));
    ok(JSON.stringify(on) === JSON.stringify(['home', '1399', '3002', '1607']), 'a stored list shows as exactly those chips, filled', JSON.stringify(on));
    await p2.close();
  }

  console.log('\n  --- tabs, old URLs and anchors ---');
  {
    const tabsOf = async p => p.$$eval('.dcc-tab', as => as.map(a => a.textContent));
    let p = await open(render(SL));
    ok(JSON.stringify(await tabsOf(p)) === JSON.stringify(['Schedule', 'Where', 'Look', 'Easter Egg', 'Theme Guide', 'Preview']), 'six tabs: Schedule, Where, Look, Easter Egg, Theme Guide, Preview', '');
    ok(await p.$eval('#dcc-panel-schedule', x => !x.hidden), 'the old settings URL (no tab) opens on Schedule', '');
    await p.evaluate(() => { window.__same = 1; });
    await p.click('#dcc-tab-where');
    const st = await p.evaluate(() => ({ same: window.__same, where: !document.getElementById('dcc-panel-where').hidden, url: location.search, ref: document.querySelector('[name="_wp_http_referer"]') ? document.querySelector('[name="_wp_http_referer"]').value : 'n/a' }));
    ok(st.same === 1 && st.where && /tab=where/.test(st.url) && /tab=where/.test(st.ref), 'a tab switches in place (no reload); the address and the save\'s return address follow', JSON.stringify(st));
    await p.close();
    for (const [hash, panel] of [['#dcc-seasons-front-z', 'look'], ['#dcc-seasons-placement', 'where'], ['#dcc-seasons-tap-count', 'egg'], ['#dcc-seasons-schedule', 'schedule'], ['#dcc-seasons-subtle-halloween', 'look'], ['#dcc-seasons-add-row', 'schedule'], ['#dcc-seasons-exclude-paths', 'where']]) {
      p = await open(render(SL), 1440, { hash });
      const v = await p.evaluate(() => [...document.querySelectorAll('.dcc-panel')].filter(x => !x.hidden).map(x => x.dataset.panel).join());
      ok(v === panel, `old anchor ${hash} lands on ${panel}`, v);
      await p.close();
    }
    p = await open(render(SL, { tab: 'look' }));
    ok(await p.$eval('#dcc-panel-look', x => !x.hidden) && await p.$eval('#dcc-tab-look', a => a.getAttribute('aria-current')) === 'page', '?tab=look opens Look', '');
    await p.close();
    p = await open(render(SL, { tab: 'preview' }));
    ok(await p.$$eval('a[href*="dcc_season=halloween"]', a => a.length) > 0 && /dcc_key=/.test(await p.evaluate(() => document.body.textContent)), 'the preview links and the check link are on the Preview tab', '');
    await p.close();
  }

  console.log('\n  --- 390 px, accessibility, no external requests ---');
  {
    for (const tab of ['schedule', 'where', 'look', 'egg']) {
      const p = await open(render(SL, { tab }), 390);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      ok(sw <= 390, `${tab} at 390: no sideways scroll`, String(sw));
      if (tab === 'schedule') {
        ok(await p.$$eval('.dcc-rb.is-phone .dcc-rb-month', m => m.length) === 12, 'the ribbon becomes a list of 12 months', '');
        await p.click('.dcc-band >> nth=3');
        const sh = await p.evaluate(() => { const r = document.getElementById('dcc-sheet').getBoundingClientRect(); return [r.left, r.right, document.documentElement.scrollWidth]; });
        ok(sh[0] >= 0 && sh[1] <= 390 && sh[2] <= 390, 'the sheet fits the phone', JSON.stringify(sh));
        await p.keyboard.press('Escape');
        await p.click('.dcc-sched-tools .dcc-i');
        const pr = await p.$eval('#dcc-pop-schedule', e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
        ok(pr[0] >= 0 && pr[1] <= 390, 'an ⓘ popover stays on screen', JSON.stringify(pr));
      }
      await p.close();
    }
    const p = await open(render(SL));
    const cr = await p.$$eval('.dcc-band', bs => {
      const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
      const out = {};
      bs.forEach(b => { const c = b.style.getPropertyValue('--c').trim(); out[c] = (1.05) / (lum(c) + 0.05); });
      return out;
    });
    const low = Object.entries(cr).filter(([, v]) => v < 4.5);
    ok(!low.length, `white band text passes AA on every band colour (lowest ${Math.min(...Object.values(cr)).toFixed(2)}:1)`, JSON.stringify(low));
    const all = await p.evaluate(() => { const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }; return Object.values(DCCSeasonsAdmin.themes).map(t => 1.05 / (lum(t.color) + 0.05)); });
    ok(all.every(v => v >= 4.5), 'and on every theme\'s colour, scheduled or not', '');
    await p.focus('.dcc-band[tabindex="0"]');
    await p.keyboard.press('ArrowRight');
    const fo = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    ok(fo !== 'none', 'a focused band shows a visible focus ring', fo);
    ok(await p.evaluate(() => document.fonts.check('16px Raleway')), 'Raleway is loaded from the plugin', '');
    await p.close();
    const pr = await open(render(SL, { tab: 'look' }), 1440, { reducedMotion: 'reduce' });
    ok(await pr.$eval('.dcc-switch-ui', e => getComputedStyle(e).transitionDuration) === '0s', 'reduced motion: no transitions', '');
    await pr.close();
    ok(!ext.length, 'no request leaves the page (fonts and scripts are the plugin\'s own)', ext.slice(0, 3).join(' '));
  }

  await b.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${pass} passed · ${fail} failed${MUT ? ' (mutation ' + MUT + ')' : ''}`);
  if (fail) { console.log(problems.map(x => '  - ' + x).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
