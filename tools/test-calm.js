'use strict';
/**
 * DCC Seasons — Calmer Seasons (4.15.0, Rob's picks 2026-11-03; 4.15.2,
 * occlusion alone and fewer feeding stops), on the real-theme fixture with
 * the two plugins' own files (tools/calm-pages.js):
 *
 *  1. OCCLUDERS: on /contact/ and on the Cottage Selector, 120 frames on the
 *     mocked clock, the canvas carries NO ink inside any occluder on screen
 *     (fields, buttons, labels, links, headings, text lines) while pieces
 *     still draw around them — and with the clip off (calm:false) the same
 *     frames DO put ink there, so the check can see an overlap. The header
 *     photo is not an occluder. The tom and poults (walkers) are NEVER cut:
 *     they cross text in front of it (4.15.2, Rob).
 *  2. NO PAUSE (4.15.2, Rob: occlusion alone): a focused, typed-into field,
 *     a .dccs-modal, [data-dcc-seasons-busy] and the quiz all leave the
 *     pieces drawing as before.
 *  3. WALKERS (Thanksgiving's tom, 390 and 1440): enters from an edge, turns
 *     about a third of the way in, through a squeeze (never a flip-cut),
 *     standing still with his poults, walks back off the side he came from
 *     and stays gone; a .dccs-modal does not hold him off or send him back.
 *     Feeding stops: few (at most one per 15 s of walking, after the first)
 *     and never the same feed twice running, read from the jabs he DRAWS.
 *     Time on screen reported.
 *
 *   node tools/test-calm.js [--only=occ|pause|walk]
 *   DCC_CALM_MUT=text|controls|noclip|walkclip|slide|cross|order|two (a copy of the engine, one line broken)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const ONLY = arg('only', '');
const MUT = process.env.DCC_CALM_MUT || '';
let pass = 0, fail = 0; const problems = [];
const ok = (c, l, d) => { if (c) { pass++; console.log('    PASS  ' + l); } else { fail++; problems.push(l + ' — ' + d); console.log('    FAIL  ' + l + ' — ' + d); } };
const SEED = n => `Math.random = (() => { let a = ${n}; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();`;
const QUIET = '<style>.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}</style>';

/* a mutation: a copy of the js folder with one line broken */
if (MUT) {
  const JS = path.join(ROOT, 'dcc-seasons', 'assets', 'js'), d = fs.mkdtempSync(path.join(os.tmpdir(), 'dcc-calm-'));
  for (const f of fs.readdirSync(JS)) { fs.copyFileSync(path.join(JS, f), path.join(d, f)); }
  let e = fs.readFileSync(path.join(d, 'engine.js'), 'utf8');
  const M = {
    text: ["var OCC_SEL = 'button, input:not([type=\"hidden\"]), textarea, select, a, [data-dcc-seasons-occlude]';", "var OCC_SEL = 'button, input:not([type=\"hidden\"]), textarea, select, a, p, h1, h2, h3, li, label, [data-dcc-seasons-occlude]';"],
    controls: ["var OCC_SEL = 'button, input:not([type=\"hidden\"]), textarea, select, a, [data-dcc-seasons-occlude]';", "var OCC_SEL = '[data-dcc-seasons-occlude]';"],
    noclip: ["if (b !== 'forage' && occVis.length && !(DEBUG && CFG.occClip === false)) { occClip(p,", 'if (0) { occClip(p,'],
    slide: ["p.alpha = mn(1, p.alpha + dt / 1.2);", "p.alpha = mn(1, p.alpha + dt / 1.2); p.x -= 2 * dt;"],
    cross: ["hi: [p.x - tw / 2 - G - E, p.x + tw / 2 + G + E + R]", "hi: [p.x - tw / 2 - G - E + R + tw * 0.5, p.x + tw / 2 + G + E + R]"],
    order: ["var L = [[0, -1], [g.kg[0], 0], [g.kg[1], 1]].sort(function (a, b) { return a[0] - b[0]; });", "var L = [[g.kg[0], 0], [0, -1], [g.kg[1], 1]];"],
    two: ["else { p.fs = 1; p.fv = tkNextV(p.fv);", "else { p.sv = 0; p.fs = 1; p.fv = tkNextV(p.fv);"],
    walkclip: ["if (b !== 'forage' && occVis.length && !(DEBUG && CFG.occClip === false)) { occClip(p, p.size * (p.sc || 1) * layerS * 1.7 + 6); }", "if (occVis.length && !(DEBUG && CFG.occClip === false)) { occClip(p, b === 'forage' ? p.size * 7 : p.size * (p.sc || 1) * layerS * 1.7 + 6); }"],
  }[MUT];
  if (!M || !e.includes(M[0])) { throw new Error('mutation does not apply: ' + MUT); }
  fs.writeFileSync(path.join(d, 'engine.js'), e.replace(M[0], M[1]));
  process.env.DCC_ASSETS = d;
  console.log('  MUTATION: ' + MUT);
}
/* loaded AFTER the mutation's folder is set: the harness reads DCC_ASSETS once */
const { config, open } = require('./harness');
const rt = require('./real-theme');
const cp = require('./calm-pages');

async function boot(make, w, theme, knobs, seed) {
  const cfg = config(['--theme=' + theme, '--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.forceHour = 12; cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
  Object.assign(cfg, knobs || {});
  const ses = await open(make({ config: cfg, extraHead: QUIET + '<style>.dcc-seasons-diag{display:none!important}</style>' }), { ...rt.opts(w), viewport: { width: w, height: w < 768 ? 844 : 900 }, dsf: 2, init: SEED(seed || 7) });
  await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000, polling: 200 });
  return ses;
}

/* ink inside / outside the occluders, over n frames of the mocked clock */
async function inkRun(pg, n) {
  return pg.evaluate(n => {
    const S = window.DCCSeasonsEngine._state; S.manual(true); S.occBuild();
    /* the falling pieces only: walkers are never cut (1b), and since 4.16.0 the tom stands in the corner */
    S.parts.forEach(q => { if (q.b === 'forage') { q.alpha = -1e9; } });
    const cv = document.querySelector('canvas.dcc-seasons-canvas'), g = cv.getContext('2d'), k = cv.width / cv.getBoundingClientRect().width;
    let inside = 0, outside = 0, frames = 0, rects = 0;
    for (let f = 0; f < n; f++) {
      S.tick(1000 / 30, 1);
      const vis = S.calm.vis; rects = Math.max(rects, vis.length);
      const d = g.getImageData(0, 0, cv.width, cv.height).data, W = cv.width;
      const inR = new Uint8Array(cv.width * cv.height);
      for (const o of vis) {
        const x0 = Math.ceil((o[0] + 1) * k), x1 = Math.floor((o[2] - 1) * k), y0 = Math.ceil((o[1] + 1) * k), y1 = Math.floor((o[3] - 1) * k);
        for (let y = Math.max(0, y0); y < Math.min(cv.height, y1); y++) { for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) { inR[y * W + x] = 1; } }
      }
      for (let i = 0, j = 3; i < inR.length; i += 3, j += 12) { if (d[j] > 8) { if (inR[i]) { inside++; } else { outside++; } } }
      frames++;
    }
    return { inside, outside, frames, rects };
  }, n);
}

(async () => {
  if (!ONLY || ONLY === 'occ') {
    console.log('\n  --- 1. occluders: pieces pass behind what a guest reads, fills in or taps ---');
    for (const [name0, make, prep] of [
      ['/contact/', cp.contact, pg => pg.evaluate(() => document.querySelector('.dcc-contact-form').scrollIntoView({ block: 'center' }))],
      ['the Cottage Selector (landing)', cp.cottages, pg => pg.evaluate(() => document.querySelector('.dccs-root').scrollIntoView({ block: 'center' }))],
    ]) for (const theme of ['halloween', 'thanksgiving']) {
      const name = name0 + ', ' + theme;
      const r = {};
      for (const calm of [true, false]) {
        const ses = await boot(make, 390, theme, calm ? {} : { occClip: false }, 11);
        await prep(ses.page); await ses.page.waitForTimeout(1500);
        r[calm] = await inkRun(ses.page, 120);
        if (calm) {
          const hdr = await ses.page.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.occBuild(); window.scrollTo(0, 0); S.occBuild(); S.tick(33, 1); const m = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return S.calm.vis.filter(o => o[1] >= m.top - 1 && o[3] <= m.bottom + 1 && o[0] >= m.left - 1 && o[2] <= m.right + 1).length; });
          ok(hdr === 0, `${name}: nothing inside the header photo is an occluder`, hdr + ' rects');
        }
        await ses.close();
      }
      ok(r.true.rects > 4, `${name}: ${r.true.rects} occluder rects on screen`, JSON.stringify(r.true));
      ok(r.true.inside === 0 && r.true.outside > 500, `${name}: 120 frames, no ink inside any occluder, ${r.true.outside} inked px around them`, JSON.stringify(r.true));
      ok(r.false.inside > 0, `${name}: with only the clip off (debug occClip:false) the same frames DO ink them (${r.false.inside} px): the check sees an overlap`, JSON.stringify(r.false));
    }
  }

  if (!ONLY || ONLY === 'occ') {
    console.log('\n  --- 1c. (4.16.0, Rob) pieces fall IN FRONT of text and still pass UNDER controls ---');
    for (const [name, make, prep] of [
      ['/contact/', cp.contact, pg => pg.evaluate(() => document.querySelector('.dcc-contact-form').scrollIntoView({ block: 'center' }))],
      ['/contact/ intro', cp.contact, pg => pg.evaluate(() => document.querySelector('.entry-content h2').scrollIntoView({ block: 'start' }))],
      ['the Cottage Selector (landing)', cp.cottages, pg => pg.evaluate(() => document.querySelector('.dccs-root').scrollIntoView({ block: 'center' }))],
    ]) {
      const ses = await boot(make, 390, 'halloween', {}, 11), pg = ses.page;
      await prep(pg); await pg.waitForTimeout(1500);
      const r = await pg.evaluate(() => {
        const S = window.DCCSeasonsEngine._state; S.manual(true); S.occBuild(); S.tick(33, 1);
        const cv = document.querySelector('canvas.dcc-seasons-canvas'), cb = cv.getBoundingClientRect(), k = cv.width / cb.width, g = cv.getContext('2d');
        const vis = S.calm.vis, inV = (x, y) => vis.some(o => x > o[0] && x < o[2] && y > o[1] && y < o[3]);
        const on = b => b.width > 2 && b.height > 2 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth;
        const CTRL = 'button, input:not([type="hidden"]), textarea, select, a, [data-dcc-seasons-occlude]';
        const ctrls = [...document.querySelectorAll(CTRL)].filter(e => !e.closest('#masthead') && on(e.getBoundingClientRect()));
        const ctrlBoxes = ctrls.map(e => e.getBoundingClientRect());
        /* every control on screen is an occluder (its centre inside a hole) */
        const missed = ctrls.filter((e, i) => { const b = ctrlBoxes[i]; return !inV(b.left + b.width / 2 - cb.left, b.top + b.height / 2 - cb.top); }).map(e => e.tagName + (e.type ? ':' + e.type : '') + ' ' + (e.textContent || '').trim().slice(0, 20));
        /* text lines (p, h1-h6, li, label) away from any control: never a hole */
        const lines = [];
        for (const el of document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, label')) {
          if (el.closest('#masthead') || el.closest('.dcc-seasons-diag')) { continue; }
          const rg = document.createRange(); rg.selectNodeContents(el);
          for (const q of rg.getClientRects()) {
            if (!on(q) || q.width < 8) { continue; }
            const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
            if (ctrlBoxes.some(b => cx >= b.left - 3 && cx <= b.right + 3 && cy >= b.top - 3 && cy <= b.bottom + 3)) { continue; }
            lines.push({ x0: q.left - cb.left, y0: q.top - cb.top, x1: q.right - cb.left, y1: q.bottom - cb.top, tag: el.tagName });
          }
        }
        const holed = lines.filter(l => inV((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2)).map(l => l.tag);
        /* and the pieces DO draw over those lines */
        let ink = 0;
        for (let f = 0; f < 150; f++) {
          S.tick(1000 / 30, 1);
          if (f % 5) { continue; }
          const d = g.getImageData(0, 0, cv.width, cv.height).data, W = cv.width;
          for (const l of lines) {
            for (let y = Math.ceil(l.y0 * k); y < Math.floor(l.y1 * k); y += 3) { for (let x = Math.ceil(l.x0 * k); x < Math.floor(l.x1 * k); x += 3) { if (x >= 0 && y >= 0 && x < W && y < cv.height && d[(y * W + x) * 4 + 3] > 8) { ink++; } } }
          }
        }
        return { ctrls: ctrls.length, missed, lines: lines.length, holed, ink };
      });
      ok(r.ctrls > 0 && r.missed.length === 0, `${name}: all ${r.ctrls} controls and links on screen are occluders (pieces pass under them)`, JSON.stringify(r.missed));
      ok(r.lines > 0 && r.holed.length === 0, `${name}: none of ${r.lines} text lines (headings, paragraphs, list items, labels) is an occluder`, JSON.stringify(r.holed.slice(0, 8)));
      ok(r.ink > 0, `${name}: pieces draw over those text lines (${r.ink} inked samples in 150 frames)`, String(r.ink));
      await ses.close();
    }
  }

  if (!ONLY || ONLY === 'occ') {
    console.log('\n  --- 1b. walkers are never occluded: the tom and poults stand in front of a control laid right under them ---');
    for (const w of [390, 1440]) {
      const ses = await boot(o => rt.page(o), w, 'thanksgiving', {}, 14), pg = ses.page;
      await pg.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
      const r = await pg.evaluate(() => {
        const S = window.DCCSeasonsEngine._state; S.manual(true);
        /* since 4.16.0 no text occludes; a full-width bar of buttons at the foot of the screen does */
        const bar = document.createElement('div'); bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:90px;display:flex;z-index:5';
        for (let i = 0; i < 6; i++) { const b = document.createElement('button'); b.textContent = 'Book'; b.style.cssText = 'flex:1;margin:4px'; bar.appendChild(b); }
        document.body.appendChild(bar); S.occBuild();
        const key = new Map(); const C = S.tom.cache; for (const k in C) { key.set(C[k].c, k); }
        const cv = document.querySelector('canvas.dcc-seasons-canvas'), P = CanvasRenderingContext2D.prototype;
        const o = { save: P.save, restore: P.restore, clip: P.clip, di: P.drawImage };
        /* the clip state of the page canvas, by save depth */
        let stack = [], cur = false; const st = { walkerDraws: 0, walkerClipped: 0, overText: 0, pieceClipped: 0 };
        P.save = function () { if (this.canvas === cv) { stack.push(cur); } return o.save.apply(this, arguments); };
        P.restore = function () { if (this.canvas === cv) { cur = stack.length ? stack.pop() : false; } return o.restore.apply(this, arguments); };
        P.clip = function () { if (this.canvas === cv) { cur = true; } return o.clip.apply(this, arguments); };
        P.drawImage = function (src, x, y, ww, hh) {
          if (this.canvas === cv && ww !== undefined) {
            const k = key.get(src);
            if (k) {
              st.walkerDraws++; if (cur) { st.walkerClipped++; }
              const m = this.getTransform(), z = cv.width / cv.getBoundingClientRect().width;
              const xs = [x, x + ww].map(a => (m.a * a + m.e) / z), ys = [y, y + hh].map(a => (m.d * a + m.f) / z);
              const L = Math.min(...xs), R = Math.max(...xs), T = Math.min(...ys), B = Math.max(...ys);
              if (S.calm.vis.some(v => v[0] < R && v[2] > L && v[1] < B && v[3] > T)) { st.overText++; }
            } else if (cur) { st.pieceClipped++; }
          }
          return o.di.apply(this, arguments);
        };
        for (let f = 0; f < 30 * 150; f++) { S.tick(1000 / 30, 1); const t = S.calm.tom[0]; if (t && t.leg === 3) { break; } }
        Object.assign(P, { save: o.save, restore: o.restore, clip: o.clip, drawImage: o.di });
        return st;
      });
      ok(r.overText > 30, `${w}: the tom or a poult is drawn over a button's rect in ${r.overText} draws (the check has something to see)`, JSON.stringify(r));
      ok(r.walkerDraws > 100 && r.walkerClipped === 0, `${w}: ${r.walkerDraws} walker draws, none clipped: no notch at any moment`, JSON.stringify(r));
      ok(r.pieceClipped > 0, `${w}: the falling pieces ARE still cut (${r.pieceClipped} clipped draws)`, JSON.stringify(r));
      await ses.close();
    }
  }

  if (!ONLY || ONLY === 'pause') {
    console.log('\n  --- 2. no pause (4.15.2): a busy guest still sees the pieces, behind what they read ---');
    /* ink on the canvas over 30 frames of the mocked clock, the field and its
     * occluder rects excluded by the clip anyway */
    const ink = pg => pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.manual(true); let n = 0;
      const cv = document.querySelector('canvas.dcc-seasons-canvas'), g = cv.getContext('2d');
      for (let f = 0; f < 30; f++) { S.tick(1000 / 30, 1); if (f % 10 === 9) { const d = g.getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 16) { if (d[i] > 40) { n++; } } } }
      return n; });
    const ses = await boot(cp.contact, 390, 'thanksgiving', {}, 9), pg = ses.page;
    await pg.evaluate(() => document.querySelector('#dcc-f-message').scrollIntoView({ block: 'center' }));
    await pg.waitForTimeout(800);
    const base = await ink(pg);
    ok(base > 200, `pieces drawing before anything is focused (${base} inked samples)`, base);
    const hasA = await pg.evaluate(() => 'a' in window.DCCSeasonsEngine._state.calm || 'busy' in window.DCCSeasonsEngine._state.calm);
    ok(!hasA, 'the engine carries no busy state any more', hasA);
    await pg.focus('#dcc-f-message'); await pg.keyboard.type('We would love a week in March.');
    let n = await ink(pg); ok(n > 0.4 * base, `a focused, typed-into textarea: pieces still draw (${n})`, n);
    await pg.evaluate(() => { const m = document.createElement('div'); m.className = 'dccs-modal'; document.body.appendChild(m); const b = document.createElement('div'); b.setAttribute('data-dcc-seasons-busy', ''); document.body.appendChild(b); document.body.classList.add('dcc-seasons-busy'); });
    n = await ink(pg); ok(n > 0.4 * base, `.dccs-modal, [data-dcc-seasons-busy] and body.dcc-seasons-busy: pieces still draw (${n})`, n);
    await ses.close();
    const s2 = await boot(cp.cottages, 390, 'thanksgiving', {}, 9), p2 = s2.page;
    await cp.openQuiz(p2); await p2.waitForTimeout(600);
    n = await ink(p2); ok(n > 200, `the quiz open: pieces still draw (${n})`, n);
    await s2.close();
  }

  if (!ONLY || ONLY === 'walk') {
    console.log('\n  --- 3. (4.16.0, Rob) the tom holds his strut; each poult steps and pecks on its own ground line ---');
    for (const w of [390, 1440]) {
      const ses = await boot(o => rt.page(o), w, 'thanksgiving', {}, 14), pg = ses.page;
      await pg.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
      const r = await pg.evaluate(w => {
        const S = window.DCCSeasonsEngine._state; S.manual(true);
        const key = new Map(); const C = S.tom.cache; for (const k in C) { key.set(C[k].c, k); }
        const cv = document.querySelector('canvas.dcc-seasons-canvas'), P = CanvasRenderingContext2D.prototype, di = P.drawImage;
        let draws = [];
        P.drawImage = function (src, x, y, ww, hh) {
          const k = key.get(src);
          if (k && this.canvas === cv && ww !== undefined) {
            const m = this.getTransform(), z = cv.width / cv.getBoundingClientRect().width;
            const xs = [x, x + ww].map(a => (m.a * a + m.e) / z), ys = [y, y + hh].map(a => (m.d * a + m.f) / z);
            draws.push({ k, L: Math.min(...xs), R: Math.max(...xs), T: Math.min(...ys), B: Math.max(...ys), o: m.e / z });
          }
          return di.apply(this, arguments);
        };
        const fr = [];
        for (let f = 0; f < 30 * 90; f++) {
          draws = []; S.tick(1000 / 30, 1);
          const t = S.calm.tom[0]; if (!t || !t.hl) { continue; }
          fr.push({ f, t, d: draws.slice() });
        }
        P.drawImage = di;
        return fr.map(e => ({ x: e.t.x, y: e.t.y, sv: e.t.sv, fs: e.t.fs, kx: e.t.kx, ks: e.t.ks, kd: e.t.kd, g: e.t.geo, d: e.d }));
      }, w);
      const g = r[0].g;
      /* the tom: one place, one image box */
      const tomBoxes = r.map(e => e.d.find(q => !/^k/.test(q.k))).filter(Boolean);
      const tL = new Set(tomBoxes.map(b => b.L.toFixed(2)));
      ok(r.length > 2000 && tL.size === 1, `${w}: the tom never moves sideways: one left edge in ${tomBoxes.length} draws (${[...tL].join(', ')})`, JSON.stringify([...tL].slice(0, 6)));
      /* the poults: never over his box, and on their own ground lines */
      let over = 0, ordBad = 0, groundBad = 0; const feetY = [new Set(), new Set()];
      for (const e of r) {
        const tb = e.d.find(q => !/^k/.test(q.k)), pb = e.d.filter(q => /^k/.test(q.k));
        if (!tb || pb.length !== 2) { continue; }
        for (const b of pb) { if (b.R > tb.L && b.L < tb.R) { over++; } }
        /* draw order: each draw's foot line, which must not go up the screen */
        const order = e.d.map(q => /^k/.test(q.k) ? q.B : tb.B);
        const feet = e.d.map(q => q === tb ? 0 : (q.L + q.R) / 2 < (tb.L + tb.R) / 2 ? g.kg[0] : g.kg[1]);
        for (let i = 1; i < feet.length; i++) { if (feet[i] < feet[i - 1] - 1e-6) { ordBad++; } }
      }
      ok(over === 0, `${w}: neither poult ever overlaps the tom's drawing (they never pass in front of or behind him)`, over);
      ok(ordBad === 0, `${w}: drawn by ground line every frame: the higher poult, then the tom, then the lower poult`, ordBad);
      ok(g.kg[0] > 0.5 && g.kg[1] < -0.5, `${w}: each poult has its own ground line, never his (${g.kg[0].toFixed(1)} px below and ${(-g.kg[1]).toFixed(1)} px above his)`, JSON.stringify(g.kg));
      ok(r.every(e => e.kx[0] <= g.hi[0] + 1e-6 && e.kx[1] >= g.lo[1] - 1e-6 && g.hi[0] < e.x - g.tw / 2 && g.lo[1] > e.x + g.tw / 2), `${w}: each poult keeps to its own spot, on its own side of him`, '');
      /* they step: each moves some, in whole steps, both directions over the visit */
      for (const c of [0, 1]) {
        const xs = r.map(e => e.kx[c]), walked = r.filter(e => e.ks[c] === 1).length, pecked = r.filter(e => e.ks[c] === 2).length, turned = r.filter(e => e.ks[c] === 3).length;
        ok(Math.max(...xs) - Math.min(...xs) > 5 && walked > 30 && pecked > 30, `${w}: poult ${c + 1} steps (${(walked / 30).toFixed(1)} s), pecks (${(pecked / 30).toFixed(1)} s) and turns (${(turned / 30).toFixed(1)} s) on its own spot (moved over ${(Math.max(...xs) - Math.min(...xs)).toFixed(0)} px)`, '');
      }
      /* a poult's feet (its draw's origin) move only by its steps: never a jump, turns included */
      let fj = 0;
      for (let i = 1; i < r.length; i++) {
        const A = r[i - 1].d.filter(q => /^k/.test(q.k)).map(q => q.o).sort((a, b) => a - b), B = r[i].d.filter(q => /^k/.test(q.k)).map(q => q.o).sort((a, b) => a - b);
        if (A.length === 2 && B.length === 2) { fj = Math.max(fj, Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1])); }
      }
      ok(fj <= g.kc * 1.5 / 30 + 0.01, `${w}: a poult's feet never jump, turning included (largest step ${fj.toFixed(2)} px, a stride frame is ${(g.kc * 1.5 / 30).toFixed(2)})`, fj);
      const sameT = r.filter(e => e.ks[0] === 1 && e.ks[1] === 1).length / Math.max(1, r.filter(e => e.ks[0] === 1 || e.ks[1] === 1).length);
      ok(sameT < 0.6, `${w}: each on its own timing (both stepping together ${(sameT * 100).toFixed(0)}% of the stepping time)`, sameT);
      ok(r.every(e => !(e.sv >= 0 && e.fs === 1)), `${w}: the tom: never two idle motions at once`, '');
      await ses.close();
    }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
