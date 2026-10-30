'use strict';
/**
 * DCC Seasons — 4.13.4, the per-season split: Thanksgiving's art is its own
 * file (assets/js/art-thanksgiving.js), fetched only on Thanksgiving's days.
 * What a guest's browser asks for, on the SHIPPED (minified) build:
 *  - a Thanksgiving day: the loader, the art file, the engine — and the
 *    art has run before the engine (its sprites and the tom's painter are
 *    in the engine), even when the art arrives LATER than the engine;
 *  - 4.13.5: the Anniversary (11 Nov): the shared crane and its pieces,
 *    both run first; Florida Keys: the crane alone; 12 Nov: Thanksgiving's;
 *  - any other day (Halloween, Christmas, New Year's): the loader and the
 *    engine, nothing else;
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
if (MUT === 'every') { const src = fs.readFileSync(path.join(JS, 'ambient.js'), 'utf8').replace('var art = CFG.art && themeKey ? CFG.art[themeKey] : null, ai;', 'var art = CFG.art ? CFG.art.thanksgiving : null, ai;'); ambient = src; }
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
    const st = await pg.evaluate(() => { const E = window.DCCSeasonsEngine; return E ? { engine: 1, tk: (E.guide.tk || []).length, cornucopia: !!E.guide.svgs.cornucopia, crane: !!E.guide.crane, anheart: !!E.guide.svgs.anheart, xmas: !!E.guide.svgs.palmxmas, canvas: !!document.querySelector('canvas.dcc-seasons-canvas') } : { engine: 0 }; });
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
  /* 4.13.5: the Anniversary fetches the shared crane, then its own pieces,
   * both before the engine; Florida Keys fetches the crane alone */
  const an = await visit('the Anniversary (11 Nov)', { date: [2026, 11, 11] });
  ok(an.reqs.includes('art-crane.min.js') && an.reqs.includes('art-anniversary.min.js') && an.reqs.includes('engine.min.js') && !an.reqs.includes('art-thanksgiving.min.js'), `${an.label}: the loader, the crane, its pieces and the engine — not Thanksgiving's`, an.reqs.join(' '));
  ok(an.st.crane && an.st.anheart && !an.errs.length, `${an.label}: both ran before the engine, no page errors`, JSON.stringify(an.st) + ' ' + an.errs.join('|'));
  const late2 = await visit('the Anniversary, its art arriving 600 ms after the engine', { date: [2026, 11, 11], artDelay: 600 });
  ok(late2.st.crane && late2.st.anheart, `${late2.label}: still run first`, JSON.stringify(late2.st));
  const fk = await visit('Florida Keys (12 May)', { date: [2027, 5, 12] });
  ok(fk.reqs.includes('art-crane.min.js') && fk.reqs.filter(r => r.startsWith('art-')).length === 1, `${fk.label}: the loader, the crane and the engine, nothing else`, fk.reqs.join(' '));
  ok(fk.st.engine && fk.st.crane && !fk.errs.length, `${fk.label}: the crane ran before the engine, no page errors`, JSON.stringify(fk.st) + ' ' + fk.errs.join('|'));
  /* 4.14.1: Christmas fetches its own art (the pieces and Santa's painters) */
  const xm = await visit('Christmas (15 Dec)', { date: [2026, 12, 15] });
  ok(xm.reqs.includes('art-christmas.min.js') && xm.reqs.includes('engine.min.js') && xm.reqs.filter(r => r.startsWith('art-')).length === 1, `${xm.label}: the loader, Christmas's art and the engine, nothing else`, xm.reqs.join(' '));
  ok(xm.st.xmas && !xm.errs.length, `${xm.label}: the art ran before the engine, no page errors`, JSON.stringify(xm.st) + ' ' + xm.errs.join('|'));
  const late3 = await visit('Christmas, its art arriving 600 ms after the engine', { date: [2026, 12, 15], artDelay: 600 });
  ok(late3.st.xmas, `${late3.label}: still run first`, JSON.stringify(late3.st));
  const nf2 = await visit('Christmas with its art file missing (404)', { date: [2026, 12, 15], art404: true });
  ok(nf2.st.engine && nf2.st.canvas && !nf2.st.xmas && !nf2.errs.length, `${nf2.label}: the engine still runs (no Santa, no pieces), no page errors`, JSON.stringify(nf2.st) + ' ' + nf2.errs.join('|'));
  for (const [lbl, d] of [['Halloween (25 Oct)', [2026, 10, 25]], ['New Year\'s (1 Jan)', [2027, 1, 1]], ['Thanksgiving\'s 12 Nov (the day after)', [2026, 11, 12]]]) {
    const v = await visit(lbl, { date: d });
    if (/Thanksgiving/.test(lbl)) {
      ok(v.reqs.includes('art-thanksgiving.min.js') && !v.reqs.includes('art-anniversary.min.js') && !v.reqs.includes('art-crane.min.js'), `${lbl}: Thanksgiving's art again, not the Anniversary's`, v.reqs.join(' '));
      continue;
    }
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
