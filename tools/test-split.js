'use strict';
/**
 * DCC Seasons — 4.13.4, the per-season split: Thanksgiving's art is its own
 * file (assets/js/art-thanksgiving.js), fetched only on Thanksgiving's days.
 * What a guest's browser asks for, on the SHIPPED (minified) build:
 *  - a Thanksgiving day: the loader, the art file, the engine — and the
 *    art has run before the engine (its sprites and the tom's painter are
 *    in the engine), even when the art arrives LATER than the engine;
 *  - any other day (Halloween, Christmas, Florida Keys, New Year's): the
 *    loader and the engine, nothing else;
 *  - a preview of Thanksgiving on another day: the art file too;
 *  - the art file failing (404): the engine still runs, no page error;
 *  - reduced motion: no engine and no art.
 * Mutation-checked with DCC_SPLIT_MUT=every (the loader fetches art for every
 * day) and DCC_SPLIT_MUT=async (art not ordered before the engine).
 *
 *   node tools/test-split.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const JS = path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js');
/* a mutated loader, served in place of the real one */
const MUT = process.env.DCC_SPLIT_MUT || '';
let ambient = fs.readFileSync(path.join(JS, 'ambient.min.js'), 'utf8');
if (MUT === 'every') { const src = fs.readFileSync(path.join(JS, 'ambient.js'), 'utf8').replace('var art = CFG.art && themeKey ? CFG.art[themeKey] : null;', 'var art = CFG.art ? CFG.art.thanksgiving : null;'); ambient = src; }
if (MUT === 'async') { const src = fs.readFileSync(path.join(JS, 'ambient.js'), 'utf8').replace('sc.async = !ordered;', 'sc.async = true;'); ambient = src; }

const dateInit = (y, m, d) => `(() => { const T0 = Date.UTC(${y}, ${m - 1}, ${d}, 16, 0, 0), RD = Date; function D(...x) { return x.length ? new RD(...x) : new RD(T0); } D.now = () => T0; D.UTC = RD.UTC; D.parse = RD.parse; D.prototype = RD.prototype; window.Date = D; })();`;

async function visit(label, { date, preview, reduced, artDelay = 0, art404 = false }) {
  const cfg = config(['--placement=content', '--layering=front', '--density=16', '--min'].concat(preview ? ['--theme=' + preview] : []));
  const reqs = [], errs = [];
  const ses = await open(fixture({ kind: 'bravada', config: cfg }), {
    viewport: { width: 390, height: 844 }, init: date ? dateInit(...date) : undefined, reducedMotion: reduced ? 'reduce' : undefined,
    extra: (route, url) => {
      const n = path.basename(url.pathname);
      if (/\.js$/.test(n)) { reqs.push(n); }
      if (n === 'ambient.min.js') { route.fulfill({ contentType: 'application/javascript', body: ambient }); return true; }
      if (n.startsWith('art-')) {
        if (art404) { route.fulfill({ status: 404, body: '' }); return true; }
        if (artDelay) { setTimeout(() => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(JS, n), 'utf8') }), artDelay); return true; }
      }
      return false;
    },
  });
  const pg = ses.page;
  pg.on('pageerror', e => errs.push(e.message));
  try {
    await pg.waitForTimeout(3500);
    const st = await pg.evaluate(() => { const E = window.DCCSeasonsEngine; return E ? { engine: 1, tk: (E.guide.tk || []).length, cornucopia: !!E.guide.svgs.cornucopia, canvas: !!document.querySelector('canvas.dcc-seasons-canvas') } : { engine: 0 }; });
    return { label, reqs: [...new Set(reqs)], errs, st };
  } finally { await ses.close(); }
}

(async () => {
  console.log(`\n  --- what each visit fetches${MUT ? ' (MUTATION: ' + MUT + ')' : ''} ---`);
  const tg = await visit('Thanksgiving day (20 Nov)', { date: [2026, 11, 20] });
  ok(tg.reqs.includes('art-thanksgiving.min.js') && tg.reqs.includes('engine.min.js'), `${tg.label}: the loader, Thanksgiving's art and the engine`, tg.reqs.join(' '));
  ok(tg.st.tk === 9 && tg.st.cornucopia, `${tg.label}: the art ran before the engine (the tom's painter and the cornucopia are in it)`, JSON.stringify(tg.st));
  ok(!tg.errs.length, `${tg.label}: no page errors`, tg.errs.join(' | '));
  const late = await visit('Thanksgiving, the art arriving 600 ms after the engine', { date: [2026, 11, 20], artDelay: 600 });
  ok(late.st.tk === 9 && late.st.cornucopia, `${late.label}: still run first`, JSON.stringify(late.st));
  for (const [lbl, d] of [['Halloween (25 Oct)', [2026, 10, 25]], ['Christmas (15 Dec)', [2026, 12, 15]], ['Florida Keys (12 May)', [2027, 5, 12]], ['New Year\'s (1 Jan)', [2027, 1, 1]]]) {
    const v = await visit(lbl, { date: d });
    ok(v.reqs.includes('engine.min.js') && !v.reqs.some(r => r.startsWith('art-')), `${lbl}: the loader and the engine, nothing else`, v.reqs.join(' '));
    ok(v.st.engine && !v.st.tk && !v.errs.length, `${lbl}: the engine runs without Thanksgiving's art, no page errors`, JSON.stringify(v.st) + ' ' + v.errs.join('|'));
  }
  const pv = await visit('a preview of Thanksgiving on 25 Oct', { date: [2026, 10, 25], preview: 'thanksgiving' });
  ok(pv.reqs.includes('art-thanksgiving.min.js') && pv.st.tk === 9, `${pv.label}: fetches its art`, pv.reqs.join(' ') + ' ' + JSON.stringify(pv.st));
  const nf = await visit('Thanksgiving with its art file missing (404)', { date: [2026, 11, 20], art404: true });
  ok(nf.st.engine && nf.st.canvas && !nf.errs.length, `${nf.label}: the engine still runs, no page errors`, JSON.stringify(nf.st) + ' ' + nf.errs.join('|'));
  const rm = await visit('Thanksgiving under reduced motion', { date: [2026, 11, 20], reduced: true });
  ok(!rm.reqs.includes('engine.min.js') && !rm.reqs.some(r => r.startsWith('art-')), `${rm.label}: no engine, no art`, rm.reqs.join(' '));

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
