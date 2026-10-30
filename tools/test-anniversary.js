'use strict';
/**
 * DCC Seasons — the Anniversary (4.13.5), on the REAL home page
 * (tests/real-theme):
 *  - the figures: the year count and the two percentages computed on the
 *    day (the recorded table, 2026-2030), from the check link's forced
 *    date when there is one;
 *  - the calendar through the loader: 11 Nov is the Anniversary, the 10th
 *    and the 12th Thanksgiving;
 *  - the pair at 390, 768 and 1440: as big as fits and never bigger than
 *    Rob's approved sizes (60 / 76 / 65), centred, every box of the whole
 *    dance at least 8 px clear of the keep-clear set (measured HERE, from
 *    the page, not taken from the engine) and inside the picture; the
 *    frames pre-drawn in a worker, at min(DPR, 2), one facing; both birds
 *    drawn on every frame of the 11 s scene;
 *  - Florida Keys' cranes scene draws the new bird in the sprites' places;
 *  - a missing pack: no crane, no error, the pieces still fall (and the
 *    Keys scene keeps its old sprites).
 *
 *   node tools/test-anniversary.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { config, open } = require('./harness');
const rt = require('./real-theme');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const JS = path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js');
const MUT = process.env.DCC_ANNIV_MUT || '';

/* the engine and packs as served, with an optional one-line break */
function serve(n) {
  let src = fs.readFileSync(path.join(JS, n), 'utf8');
  if (MUT === 'nocap' && n === 'engine.js') { src = src.replace('H = MT.floor(mn(adCap(W.innerWidth || vw), (floorY - (tg + AD_M)) / -b[1]))', 'H = MT.floor((floorY - (tg + AD_M)) / -b[1])'); }
  if (MUT === 'noclear' && n === 'engine.js') { src = src.replace('if (mx2(r[0] - bx[i][2], bx[i][0] - r[2], r[1] - bx[i][3], bx[i][1] - r[3]) < AD_M) { ok = 0; }', ''); }
  if (MUT === 'onebird' && n === 'engine.js') { src = src.replace('for (i = 0; i < 2; i++) {\n\t\t\t\t\tcx.save(); cx.translate(birds[i][0]', 'for (i = 0; i < 1; i++) {\n\t\t\t\t\tcx.save(); cx.translate(birds[i][0]'); }
  if (MUT === 'nokeys' && n === 'engine.js') { src = src.replace('if (st.nb == null) { st.nb = !!(adK && adK.done); }', 'if (st.nb == null) { st.nb = false; }'); }
  if (MUT === 'fig' && n === 'art-anniversary.js') { src = src.replace('Math.round(100 * wed / ((on - Date.UTC(1986, 2, 25)) / YR))', 'Math.round(100 * wed / ((on - Date.UTC(1989, 2, 26)) / YR))'); }
  return src;
}

(async () => {
  console.log('\n  --- the figures, computed on the day ---');
  {
    const W = { DCC_SEASONS: {} }, ctx = { window: W, Date, Math }; vm.createContext(ctx);
    vm.runInContext(serve('art-anniversary.js'), ctx);
    const A = W.DCCSeasonsArt.anniversary, want = { 2026: [15, 40, 37], 2027: [16, 41, 38], 2028: [17, 43, 40], 2029: [18, 44, 41], 2030: [19, 46, 43] };
    for (const y of Object.keys(want)) {
      W.DCC_SEASONS.date = `${y}-11-11`;
      const f = A.annivFigs();
      ok(f.join() === want[y].join(), `11 Nov ${y}: ${f[0]} years, ${f[1]}% and ${f[2]}% (the recorded table)`, `got ${f.join()} want ${want[y].join()}`);
    }
    W.DCC_SEASONS.date = '2026-11-11';
    const yr = A.svgs.anyear(), p1 = A.svgs.anpct1(), p2 = A.svgs.anpct2();
    ok(/>15<\/text>/.test(yr) && />40%<\/text>/.test(p1) && />37%<\/text>/.test(p2), 'the sprites carry them: the crystal reads 15, the figures 40% and 37%', [yr.slice(-60), p1.slice(-60), p2.slice(-60)].join(' / '));
    for (const f of ['art-anniversary.js', 'art-anniversary.min.js']) {
      const t = fs.readFileSync(path.join(JS, f), 'utf8'), m = t.match(/\b(Erica|Rob|Robert|Croft)\b/);
      ok(!m, `no names in ${f}, the file that holds the dates`, m && t.slice(Math.max(0, m.index - 40), m.index + 40));
    }
  }

  /* a page of the real site on a given day, the scene forced and played on
   * the mocked clock */
  async function page(width, { date = '2026-11-11', vig = 'annivdance', theme, block = [], head = '', tweak } = {}) {
    const cfg = config(['--placement=content', '--layering=front', '--density=16', '--diag'].concat(theme ? ['--theme=' + theme] : []));
    cfg.date = date; cfg.forceHour = 12; cfg.vigOnly = vig; cfg.vigFirst = 4000; cfg.heroFirst = [9999, 10000];
    if (tweak) { tweak(cfg); }
    const reqs = [], errs = [];
    const ses = await open(rt.page({ config: cfg, extraHead: head }), {
      viewport: { width, height: width < 768 ? 844 : 900 }, dsf: 3, ...rt.opts(width),   /* (its extra is replaced below, and called from it) */
      init: 'Math.random = (() => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();',
      extra: (route, url) => {
        const n = path.basename(url.pathname);
        if (/\.js$/.test(n)) { reqs.push(n); }
        if (block.includes(n)) { route.fulfill({ status: 404, body: '' }); return true; }
        if (/^(engine|art-[a-z]+)\.js$/.test(n)) { route.fulfill({ contentType: 'application/javascript', body: serve(n) }); return true; }
        return rt.route(route, url);
      },
    });
    ses.page.on('pageerror', e => errs.push(e.message));
    await ses.page.addStyleTag({ content: '.dcc-wx-banner{display:none!important}' });
    await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
    return { ses, pg: ses.page, reqs, errs };
  }

  console.log('\n  --- the calendar, through the loader ---');
  for (const [d, want] of [['2026-11-10', 'thanksgiving'], ['2026-11-11', 'anniversary'], ['2026-11-12', 'thanksgiving'], ['2027-11-11', 'anniversary']]) {
    const P = await page(390, { date: d, vig: null });
    try {
      const k = await P.pg.evaluate(() => window.DCCSeasonsEngine._state.theme);
      ok(k === want, `${d}: ${k}`, `want ${want}`);
    } finally { await P.ses.close(); }
  }

  console.log('\n  --- the pair on the real home page ---');
  /* the three widths, then two tight cases where the 8 px rule must do the
   * work (4.13.5, the Director: taking it out must fail a test). With a
   * short picture alone the pair's starting size already allows for the
   * tagline, so a keep-clear element BESIDE the pair is the case that
   * needs the rule. */
  const TIGHT = {
    short: '<style>#header-image-main-inside{height:330px!important}</style>',
    beside: '<script>document.addEventListener("DOMContentLoaded",function(){var p=document.querySelector("#header-image-main-inside"),d=document.createElement("div");d.setAttribute("data-dcc-keep-clear","");d.style.cssText="position:absolute;left:calc(50% - 95px);bottom:14px;width:30px;height:70px;z-index:5";p.appendChild(d);});</script>',
  };
  for (let [width, tight] of [[390], [768], [1440], [390, 'short'], [390, 'beside'], [1440, 'beside']]) {
    const P = await page(width, { head: tight ? TIGHT[tight] : '' }), pg = P.pg;
    const width0 = width;
    if (tight) { width = `${width0} (${tight === 'short' ? 'a short 330 px header picture' : 'a keep-clear box beside the pair'})`; }
    try {
      /* the plan and the pre-draw are idle-time work: let them finish */
      await pg.waitForFunction(() => { const a = window.DCCSeasonsEngine._state.anniv; return a.done && a.plan && !a.plan.none; }, null, { timeout: 30000, polling: 200 });
      const a = await pg.evaluate(() => { const A = window.DCCSeasonsEngine._state.anniv; return { plan: A.plan, done: A.done, worker: A.worker, bytes: A.bytes, frames: A.frames, H: A.H, cap: A.cap(innerWidth) }; });
      const pic = await pg.evaluate(() => { const r = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
      const P0 = a.plan;
      ok(a.H <= Math.round(a.cap) && a.H >= 24, `${width}: the pair stands ${a.H} px (approved cap ${Math.round(a.cap)})`, JSON.stringify({ H: a.H, cap: a.cap }));
      const cap = { 390: 60, 768: 76, 1440: 65 }[width0];
      ok(Math.abs(a.cap - cap) < 0.5, `${width}: the cap is Rob's approved size here (${cap})`, a.cap);
      if (tight) { ok(a.H < cap, `${width}: the pair is made smaller to stay clear (${a.H} px)`, a.H); }
      ok(Math.abs((P0.xa + P0.xb) / 2 - pic[2] / 2) < 0.5, `${width}: centred in the picture`, JSON.stringify([P0.xa, P0.xb, pic[2]]));
      /* the keep-clear set, measured here: the title's and tagline's
       * letters (a Range per text node) and the boxes */
      const keep = await pg.evaluate(() => {
        const out = [];
        document.querySelectorAll('#header-page-title').forEach(el => { const tw = document.createTreeWalker(el, 4); let n; while ((n = tw.nextNode())) { if (!/\S/.test(n.nodeValue)) continue; const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) if (q.width && q.height) out.push([q.left, q.top, q.right, q.bottom, 'text']); } });
        document.querySelectorAll('#site-header-main, .site-header-bottom-fixed, .dcc-sun-dial, .menu-burger, [data-dcc-keep-clear]').forEach(el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return; const q = el.getBoundingClientRect(); if (q.width && q.height) out.push([q.left, q.top, q.right, q.bottom, el.className || el.id]); });
        return out;
      });
      let worst = 1e9, who = '';
      for (const b of P0.boxes) {
        const v = [b[0] + pic[0], b[1] + pic[1], b[2] + pic[0], b[3] + pic[1]];
        for (const k of keep) { const s = Math.max(k[0] - v[2], v[0] - k[2], k[1] - v[3], v[1] - k[3]); if (s < worst) { worst = s; who = k[4]; } }
      }
      ok(worst >= 8, `${width}: the whole dance is ${worst.toFixed(1)} px clear of the keep-clear set (nearest: ${who})`, JSON.stringify(P0.boxes));
      ok(P0.boxes.every(b => b[0] >= 0 && b[2] <= pic[2] && b[1] >= 0 && b[3] <= pic[3]), `${width}: inside the picture`, JSON.stringify(P0.boxes));
      ok(a.worker && a.frames === 35, `${width}: 35 frames pre-drawn in a worker`, JSON.stringify({ worker: a.worker, frames: a.frames }));
      const mb = a.bytes / 1048576, k = a.H * 2;
      ok(mb < 3, `${width}: ${mb.toFixed(2)} MB at DPR 3 (under 3 MB), drawn at min(DPR, 2) (${k} px per standing height), one facing`, mb);
      /* the scene: both birds on every frame, 11 s */
      const r = await pg.evaluate(() => {
        const E = window.DCCSeasonsEngine, s = E._state, C = window.DCCSeasonsArt.crane.crane, d0 = C.dance;
        let n = 0, frames = 0, both = 0, t = 0, ran = 0;
        C.dance = function () { const v = d0.apply(this, arguments); if (v) { n++; } return v; };
        s.manual(true);
        /* a frame the scene drew in (its own first call starts it) */
        for (let i = 0; i < 30 * 30; i++) { const was = n; s.tick(1000 / 30, 1); if (s.vig === 'annivdance') { ran = 1; if (n > was || frames) { frames++; t += 1 / 30; if (n - was === 2) { both++; } } } else if (ran) { break; } }
        C.dance = d0;
        return { frames, both, t };
      });
      ok(r.frames > 300 && r.both === r.frames, `${width}: both birds drawn on every frame of the scene (${r.both}/${r.frames})`, JSON.stringify(r));
      ok(Math.abs(r.t - 11) < 0.2, `${width}: the scene lasts ${r.t.toFixed(2)} s`, r.t);
      ok(!P.errs.length, `${width}: no page errors`, P.errs.join(' | '));
      ok(P.reqs.includes('art-crane.js') && P.reqs.includes('art-anniversary.js') && !P.reqs.includes('art-thanksgiving.js'), `${width}: the crane and the Anniversary's pieces fetched, not Thanksgiving's`, P.reqs.join(' '));
    } finally { await P.ses.close(); }
  }

  console.log('\n  --- the egg ends on a heart that fits the screen (Rob, 2026-10-30) ---');
  for (const width of [390, 768, 1440]) {
    const P = await page(width, { vig: null, tweak: c => { c.vigFirst = 1e9; c.themes.anniversary.egg.finaleAt = 2000; } }), pg = P.pg;
    try {
      const egg = await pg.evaluate(() => window.DCC_SEASONS.themes.anniversary.egg);
      ok(egg.finale === '♥' && egg.finaleFit && egg.colors.join() === '#E2C25A,#E8838F', `${width}: the gold-and-blush rain, ending on a heart`, JSON.stringify(egg));
      for (let i = 0; i < 4; i++) { await pg.click('#header-page-title .entry-title', { delay: 20 }); await pg.waitForTimeout(90); }
      await pg.waitForFunction(() => window.DCCSeasonsMatrix && window.DCCSeasonsMatrix._finBox, null, { timeout: 15000, polling: 100 });
      await pg.waitForTimeout(1500);   /* fully formed (0.8 s fade-in) */
      const b = await pg.evaluate(() => window.DCCSeasonsMatrix._finBox), vw = b[4], vh = b[5];
      const m = [b[0], vw - b[2], b[1], vh - b[3]], mw = Math.min(m[0], m[1]) / vw, mh = Math.min(m[2], m[3]) / vh;
      ok(mw >= 0.12 && mh >= 0.12, `${width}: the heart sits inside the screen with ${Math.round(mw * 100)}% / ${Math.round(mh * 100)}% margin (left-right / top-bottom; at least 12%)`, JSON.stringify(b));
      ok(Math.abs((m[0] - m[1]) / vw) < 0.06 && Math.abs((m[2] - m[3]) / vh) < 0.06, `${width}: centered`, JSON.stringify(m));
      const big = Math.max((b[2] - b[0]) / vw, (b[3] - b[1]) / vh);
      ok(big >= 0.5, `${width}: and big enough to read the moment it forms (${Math.round(big * 100)}% of the screen's ${(b[2] - b[0]) / vw > (b[3] - b[1]) / vh ? 'width' : 'height'})`, JSON.stringify(b));
      if (process.env.DCC_EGG_SHOTS) { await pg.screenshot({ path: path.join(process.env.DCC_EGG_SHOTS, `egg-${width}.png`) }); }
    } finally { await P.ses.close(); }
  }

  console.log('\n  --- Florida Keys takes the same bird ---');
  for (const block of [[], ['art-crane.js']]) {
    const P = await page(390, { date: '2027-05-12', vig: 'cranes', theme: 'florida_keys', block }), pg = P.pg;
    try {
      if (!block.length) { await pg.waitForFunction(() => { const a = window.DCCSeasonsEngine._state.anniv; return a.keys && a.keys.done; }, null, { timeout: 20000, polling: 200 }); }
      else { await pg.waitForTimeout(2500); }
      const r = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        let nb = null, n = 0, old = 0;
        const cx = s.canvas && s.canvas.getContext ? s.canvas.getContext('2d') : document.querySelector('canvas.dcc-seasons-canvas').getContext('2d');
        const di = cx.drawImage;
        cx.drawImage = function (im) { if (im && im.src && /svg/.test(im.src) && (decodeURIComponent(im.src).includes('cranedance') || arguments[3] === 40)) { old++; } return di.apply(this, arguments); };
        for (let i = 0; i < 30 * 20 && !s.vigSt; i++) { s.tick(1000 / 30, 1); }
        for (let i = 0; i < 30 * 8 && s.vigSt; i++) { s.tick(1000 / 30, 1); if (s.vigSt && s.vigSt.nb != null) { nb = s.vigSt.nb; } n++; }
        cx.drawImage = di;
        return { nb, n, keys: s.anniv.keys };
      });
      if (!block.length) { ok(r.nb === true && r.keys.n === 4, '390: the cranes scene draws the new bird (its two poses, both facings)', JSON.stringify(r)); }
      else { ok(r.nb === false && r.n > 30, '390, the crane pack missing: the scene plays with the old sprites', JSON.stringify(r)); }
      ok(!P.errs.length, `no page errors${block.length ? ' with the pack missing' : ''}`, P.errs.join(' | '));
    } finally { await P.ses.close(); }
  }

  console.log('\n  --- the Anniversary with the crane pack missing ---');
  {
    const P = await page(390, { block: ['art-crane.js'] }), pg = P.pg;
    try {
      await pg.waitForTimeout(3000);
      const r = await pg.evaluate(() => { const s = window.DCCSeasonsEngine._state; s.manual(true); let ran = 0; for (let i = 0; i < 30 * 20; i++) { s.tick(1000 / 30, 1); if (s.vig === 'annivdance') { ran++; } } return { ran, live: s.live, anniv: s.anniv }; });
      ok(r.ran <= 1 && r.live > 0, `no pair (it declines), and ${r.live} pieces still fall`, JSON.stringify(r));
      ok(!P.errs.length, 'no page errors', P.errs.join(' | '));
    } finally { await P.ses.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed${MUT ? ' (MUTATION: ' + MUT + ')' : ''}`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
