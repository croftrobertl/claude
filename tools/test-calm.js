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
 *   DCC_CALM_MUT=noclip|walkclip|noturn|flip|repeat|often|edge|hold (a copy of the engine, one line broken)
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
    noclip: ["if (b !== 'forage' && occVis.length && !(DEBUG && CFG.occClip === false)) { occClip(p,", 'if (0) { occClip(p,'],
    walkclip: ["if (b !== 'forage' && occVis.length && !(DEBUG && CFG.occClip === false)) { occClip(p, p.size * (p.sc || 1) * layerS * 1.7 + 6); }", "if (occVis.length && !(DEBUG && CFG.occClip === false)) { occClip(p, b === 'forage' ? p.size * 7 : p.size * (p.sc || 1) * layerS * 1.7 + 6); }"],
    noturn: ["if (p.leg === 0 && !p.tn && p.fs !== 1 && (p.dir > 0 ? p.x >= vw / 3 : p.x <= vw - vw / 3)) { p.tn = 1; }", ''],
    repeat: ['return v < 0 ? MT.floor(rand() * 3) % 3 : (v + 1 + MT.floor(rand() * 2)) % 3;', 'return v < 0 ? MT.floor(rand() * 3) % 3 : v;'],
    often: ["return k === 1 ? rnd(7, 11) : k === 2 ? 6 : rnd(15, 22);", 'return rnd(1.6, 3.0);'],
    edge: ['if (!CALM || (p.x > p.size * 1.5 && p.x < vw - p.size * 1.5)) { p.ft -= dt; }', 'p.ft -= dt;'],
    hold: ['if (p.leg === 3) { p.alpha = 0; break; }', "if (p.leg === 3) { p.alpha = 0; break; } if (p.leg === 0 && D.querySelector('.dccs-modal') && (p.dir > 0 ? p.x < 0 : p.x > vw)) { break; }"],
    flip: ['var sq = p.leg === 1 ? 0.3 + 0.7 * abs(cos(MT.PI * p.tq)) : 1;', 'var sq = 1;'],
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
    console.log('\n  --- 1b. walkers are never occluded: the tom and poults cross text in front of it ---');
    for (const w of [390, 1440]) {
      const ses = await boot(o => rt.page(o), w, 'thanksgiving', {}, 14), pg = ses.page;
      await pg.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
      const r = await pg.evaluate(() => {
        const S = window.DCCSeasonsEngine._state; S.manual(true);
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
      ok(r.overText > 30, `${w}: the tom or a poult is drawn over an occluder's rect in ${r.overText} draws (the check has something to see)`, JSON.stringify(r));
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
    console.log('\n  --- 3. the tom: a third of the way in, a real turn, back the way he came ---');
    for (const w of [390, 1440]) {
      const ses = await boot(o => rt.page(o), w, 'thanksgiving', {}, 14), pg = ses.page;
      await pg.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
      const r = await pg.evaluate(w => {
        const S = window.DCCSeasonsEngine._state; S.manual(true);
        /* 4.15.2: a modal open the whole time at 390 changes nothing */
        if (w < 768) { const m = document.createElement('div'); m.className = 'dccs-modal'; document.body.appendChild(m); }
        const feeds = []; let walkS = 0, prevFs = 0;
        const key = new Map(); const C = S.tom.cache; for (const k in C) { key.set(C[k].c, k); }
        const P = CanvasRenderingContext2D.prototype, di = P.drawImage; let boxes = [];
        P.drawImage = function (src, x, y, ww, hh) {
          const k = key.get(src);
          if (k && ww !== undefined) {
            const m = this.getTransform(), cv = this.canvas, z = cv.width / cv.getBoundingClientRect().width; const xs = [x, x + ww].map(a => (m.a * a + m.e) / z);
            /* the tom is tracked by his feet (the pivot: 0.404 of his drawing from its left edge, in the cache's mirrored frame), a poult by its centre */
            const fx = /^k/.test(k) ? 0.5 : (134 - 78.667) / 137, cxm = (m.a * (x + fx * ww) + m.e) / z;
            boxes.push({ k, cx: cxm, L: Math.min(...xs), R: Math.max(...xs) });
          }
          return di.apply(this, arguments);
        };
        const log = []; let f = 0, onFrames = 0, firstOn = -1, lastOn = -1, prevVis = false, goneVis = null;
        for (; f < 30 * 400; f++) {
          boxes = []; S.tick(1000 / 30, 1);
          const t = S.calm.tom[0]; if (!t) { break; }
          if (t.leg !== 3 && t.leg !== 1 && t.fs !== 1) { walkS += 1 / 30; }
          if (t.fs === 1 && prevFs !== 1) { const tb = boxes.find(b => !/^k/.test(b.k)); feeds.push({ f, fv: t.fv, jabs: 0, inJab: false, walkS, inView: !!tb && tb.L >= 0 && tb.R <= w }); }
          if (t.fs === 1 && feeds.length) { const F = feeds[feeds.length - 1], j = boxes.some(b => b.k === 'pj'); if (j && !F.inJab) { F.jabs++; } F.inJab = j; }
          prevFs = t.fs;
          const vis = boxes.some(b => b.R > 0 && b.L < w);
          if (vis) { onFrames++; if (firstOn < 0) { firstOn = f; } lastOn = f; }
          log.push({ f, leg: t.leg, x: t.x, dir: t.dir, tq: t.tq, alpha: t.alpha, boxes: boxes.map(b => [b.k, Math.round(b.cx * 10) / 10, Math.round((b.R - b.L) * 10) / 10]) });
          if (t.leg === 3 && goneVis == null) { goneVis = prevVis; }
          prevVis = vis;
          if (t.leg === 3 && f - lastOn > 60) { break; }
        }
        return { feeds, walkS, goneVis, log: log.filter((e, i) => e.leg === 1 || i % 15 === 0 || (log[i - 1] && log[i - 1].leg !== e.leg)), onFrames, firstOn, lastOn, end: log[log.length - 1], first: log[0] };
      }, w);
      const legs = r.log.map(e => e.leg), d0 = r.first.dir;
      const startX = r.first.x, turn = r.log.filter(e => e.leg === 1), turnX = turn.length ? turn[0].x : NaN;
      const inward = d0 > 0 ? turnX : w - turnX;
      ok(d0 > 0 ? startX < 0 : startX > w, `${w}: he enters from the ${d0 > 0 ? 'left' : 'right'} edge (x ${Math.round(startX)})`, startX);
      ok(turn.length > 0 && inward >= w / 3 - 2 && inward <= w / 3 + 60, `${w}: he turns ${Math.round(inward)} px in (a third is ${Math.round(w / 3)})`, inward);
      /* during the turn he and his poults stand still: no sliding */
      let slide = 0, minW = 1e9, maxW = 0, tomW0 = 0;
      for (let i = 1; i < turn.length; i++) {
        for (const b of turn[i].boxes) {
          const same = turn[i - 1].boxes.filter(q => (q[0].charAt(0) === 'k') === (b[0].charAt(0) === 'k'));
          if (same.length) { slide = Math.max(slide, Math.min(...same.map(q => Math.abs(q[1] - b[1])))); }
        }
        const tb = turn[i].boxes.find(b => !/^k/.test(b[0])); if (tb) { minW = Math.min(minW, tb[2]); maxW = Math.max(maxW, tb[2]); }
      }
      const tom0 = r.log.find(e => e.leg === 0 && e.boxes.some(b => !/^k/.test(b[0])));
      tomW0 = tom0 ? tom0.boxes.find(b => !/^k/.test(b[0]))[2] : 0;
      if (process.env.DCC_CALM_DUMP) { console.log(JSON.stringify(turn.map(e => [e.tq, e.dir, e.boxes]))); }
      ok(turn.length >= 20 && slide < 1.5, `${w}: the turn takes ${(turn.length / 30).toFixed(2)} s and nobody slides: his feet and the poults stay put (largest step ${slide.toFixed(2)} px)`, JSON.stringify({ n: turn.length, slide }));
      ok(minW >= 0.29 * tomW0 && minW < 0.5 * tomW0, `${w}: a squeeze through the narrow side, never thinner than 30% (${Math.round(100 * minW / tomW0)}%), never a flip-cut`, JSON.stringify({ minW, tomW0 }));
      const exitSide = r.end.x < 0 ? -1 : 1;
      ok(r.end.leg === 3 && exitSide === (d0 > 0 ? -1 : 1), `${w}: he walks back off the side he came from, and stays gone`, JSON.stringify(r.end));
      ok(r.goneVis === false, `${w}: he and both poults are off screen before he is gone (nothing vanishes in view)`, String(r.goneVis));
      ok(legs.every(l => l !== undefined), `${w}: on screen ${((r.lastOn - r.firstOn + 1) / 30).toFixed(1)} s`, '');
      /* the feeds: few, and never the same twice running (read from the drawn jabs) */
      const J = r.feeds.map(x => x.jabs), maxN = 1 + Math.floor(Math.max(0, r.walkS - 7) / 15);
      ok(r.feeds.length >= 1 && r.feeds.length <= maxN, `${w}: ${r.feeds.length} feeding stop(s) in ${r.walkS.toFixed(1)} s of walking (at most ${maxN}; 4.15.0 stopped every 1.6-3 s)`, JSON.stringify(r.feeds));
      ok(J.every(j => j >= 1 && j <= 3) && J.every((j, i) => i === 0 || j !== J[i - 1]), `${w}: jabs per feed ${J.join(', ') || '-'}: never the same feed twice running`, JSON.stringify(r.feeds));
      ok(r.feeds.every(x => x.inView), `${w}: every stop with him wholly on screen (never half off the edge)`, JSON.stringify(r.feeds.map(x => x.inView)));
      ok(r.feeds.every((x, i) => i === 0 || x.walkS - r.feeds[i - 1].walkS >= 14.9), `${w}: at least 15 s of walking between stops`, JSON.stringify(r.feeds.map(x => x.walkS.toFixed(1))));
      console.log(`      ${w}: on screen ${((r.lastOn - r.firstOn + 1) / 30).toFixed(1)} s (${r.onFrames} frames with any of the three drawn)`);
      await ses.close();
    }
    /* the feeds' sequence over many walks: never the same twice running */
    {
      const ses = await boot(o => rt.page(o), 1440, 'thanksgiving', {}, 14), pg = ses.page;
      await pg.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
      const seq = await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.manual(true); const out = []; let pf = 0;
        for (let f = 0; f < 30 * 600; f++) { S.tick(1000 / 30, 1); const t = S.calm.tom[0]; if (!t) { break; } if (t.fs === 1 && pf !== 1) { out.push(t.fv); } pf = t.fs; if (t.leg === 3) { break; } }
        return out; });
      ok(seq.length >= 2 && seq.every((v, i) => i === 0 || v !== seq[i - 1]), `1440, a whole walk: feeds ${seq.join(' ')}: no repeat`, JSON.stringify(seq));
      await ses.close();
    }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
