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
 *   DCC_CALM_MUT=mask|click|onex|phone|inherit|early|slide|cross|order|two (a copy of the engine, one line broken)
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
    mask: ["			var layerS = p.far ? 0.6 : 1;\n			cx.save();", "			var layerS = p.far ? 0.6 : 1;\n			cx.save(); if (b !== 'forage') { cx.beginPath(); cx.rect(-2, -2, vw + 4, vh + 4); cx.rect(0, vh * 0.3, vw, vh * 0.4); cx.clip('evenodd'); }"],
    click: ["cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:' + z + ';';", "cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:auto;z-index:' + z + ';';"],
    onex: ["function tkK() { return (W.innerWidth || vw) >= 1024 ? 2 : 1; }", "function tkK() { return 1; }"],
    phone: ["function tkK() { return (W.innerWidth || vw) >= 1024 ? 2 : 1; }", "function tkK() { return (W.innerWidth || vw) >= 320 ? 2 : 1; }"],
    inherit: ["cx.globalAlpha = b === 'forage' ? clamp(p.alpha, 0, 1) :", "cx.globalAlpha = b === 'forage' ? alphaBase * clamp(p.alpha, 0, 1) :"],
    early: ["if (gtN >= 8 || t - gt0 > 5000) { gtOpen = t; }", "if (gtN >= 0 || t - gt0 > 5000) { gtOpen = t; }"],
    slide: ["p.alpha = mn(1, p.alpha + dt / 1.2);", "p.alpha = mn(1, p.alpha + dt / 1.2); p.x -= 2 * dt;"],
    cross: ["hi: [p.x - tw / 2 - G - E, p.x + tw / 2 + G + E + R]", "hi: [p.x - tw / 2 - G - E + R + tw * 0.5, p.x + tw / 2 + G + E + R]"],
    order: ["var L = [[0, -1], [g.kg[0], 0], [g.kg[1], 1]].sort(function (a, b) { return a[0] - b[0]; });", "var L = [[g.kg[0], 0], [0, -1], [g.kg[1], 1]];"],
    two: ["else { p.fs = 1; p.fv = tkNextV(p.fv);", "else { p.sv = 0; p.fs = 1; p.fv = tkNextV(p.fv);"],
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
    console.log('\n  --- 1. (4.16.1, Rob) ONE layer in front of everything: nothing masked, nothing blocked ---');
    for (const [name, make, prep] of [
      ['/contact/', cp.contact, pg => pg.evaluate(() => document.querySelector('.dcc-contact-form').scrollIntoView({ block: 'center' }))],
      ['the Cottage Selector (landing)', cp.cottages, pg => pg.evaluate(() => document.querySelector('.dccs-root').scrollIntoView({ block: 'center' }))],
    ]) for (const w of [390, 1440]) {
      const tag = `${name} ${w}`;
      const ses = await boot(make, w, 'halloween', {}, 11), pg = ses.page;
      await prep(pg); await pg.waitForTimeout(1500);
      const r = await pg.evaluate(() => {
        const S = window.DCCSeasonsEngine._state; S.manual(true);
        const cv = document.querySelector('canvas.dcc-seasons-canvas'), g = cv.getContext('2d'), cb = cv.getBoundingClientRect(), k = cv.width / cb.width;
        const P = CanvasRenderingContext2D.prototype, clip = P.clip; let clips = 0;
        P.clip = function () { if (this.canvas === cv) { clips++; } return clip.apply(this, arguments); };
        const CTRL = 'button, input:not([type="hidden"]), textarea, select, a';
        const on = b => b.width > 2 && b.height > 2 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth;
        const boxes = [...document.querySelectorAll(CTRL)].filter(e => !e.closest('#masthead')).map(e => e.getBoundingClientRect()).filter(on);
        let ink = 0;
        for (let f = 0; f < 150; f++) {
          S.tick(1000 / 30, 1);
          if (f % 5) { continue; }
          const d = g.getImageData(0, 0, cv.width, cv.height).data, W = cv.width;
          for (const b of boxes) {
            for (let y = Math.ceil((b.top - cb.top) * k); y < Math.floor((b.bottom - cb.top) * k); y += 3) { for (let x = Math.ceil((b.left - cb.left) * k); x < Math.floor((b.right - cb.left) * k); x += 3) { if (x >= 0 && y >= 0 && x < W && y < cv.height && d[(y * W + x) * 4 + 3] > 8) { ink++; } } }
          }
        }
        P.clip = clip;
        /* the canvas is never what a tap finds */
        let hitCanvas = 0;
        for (let i = 0; i < 200; i++) { const el = document.elementFromPoint(((i * 37) % 100) / 100 * innerWidth, ((i * 61) % 100) / 100 * innerHeight); if (el && el.tagName === 'CANVAS' && /dcc-seasons/.test(el.className)) { hitCanvas++; } }
        return { clips, ink, boxes: boxes.length, hitCanvas, pe: getComputedStyle(cv).pointerEvents };
      });
      ok(r.clips === 0, `${tag}: no piece is masked: 0 clips on the canvas in 150 frames`, r.clips);
      ok(r.boxes > 0 && r.ink > 0, `${tag}: the pieces fall in front of the ${r.boxes} controls and links on screen (${r.ink} inked samples over them)`, JSON.stringify(r));
      ok(r.pe === 'none' && r.hitCanvas === 0, `${tag}: the canvas takes no pointer: 200 hit tests, none on it`, JSON.stringify(r));
      /* a real click, typing and a scroll, with the pieces running */
      await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.manual(false); window.__clicked = 0; document.addEventListener('click', e => { if (e.target.closest('button, a, input, textarea, select')) { window.__clicked++; e.preventDefault(); } }, true); });
      const ctl = await pg.evaluate(() => { const e = [...document.querySelectorAll('input[type=text], input[type=email], textarea, button')].find(x => { const b = x.getBoundingClientRect(); return b.top > 60 && b.bottom < innerHeight - 20 && b.width > 10; }); if (!e) { return null; } const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, tag: e.tagName }; });
      if (ctl) {
        await pg.mouse.click(ctl.x, ctl.y);
        const typed = /INPUT|TEXTAREA/.test(ctl.tag) ? (await pg.keyboard.type('canal'), await pg.evaluate(() => document.activeElement && document.activeElement.value)) : 'n/a';
        const clicked = await pg.evaluate(() => window.__clicked);
        ok(clicked >= 1 && (typed === 'n/a' || /canal/.test(typed)), `${tag}: a click on a ${ctl.tag.toLowerCase()} under the pieces reaches it${typed !== 'n/a' ? ', and typing goes into it' : ''}`, JSON.stringify({ clicked, typed }));
      }
      const y0 = await pg.evaluate(() => scrollY); await pg.mouse.move(w / 2, 300); await pg.mouse.wheel(0, 300); await pg.waitForTimeout(400);
      const y1 = await pg.evaluate(() => scrollY);
      ok(y1 > y0, `${tag}: a wheel scroll over the pieces scrolls the page (${y0} → ${y1})`, `${y0} ${y1}`);
      await ses.close();
    }
  }

  if (!ONLY || ONLY === 'occ') {
    console.log('\n  --- 1b. nothing is ever clipped: not the walkers, not the pieces, with a bar of buttons under them ---');
    for (const w of [390, 1440]) {
      const ses = await boot(o => rt.page(o), w, 'thanksgiving', {}, 14), pg = ses.page;
      await pg.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
      const r = await pg.evaluate(() => {
        const S = window.DCCSeasonsEngine._state; S.manual(true);
        const bar = document.createElement('div'); bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:90px;display:flex;z-index:5';
        for (let i = 0; i < 6; i++) { const b = document.createElement('button'); b.textContent = 'Book'; b.style.cssText = 'flex:1;margin:4px'; bar.appendChild(b); }
        document.body.appendChild(bar);
        const key = new Map(); const C = S.tom.cache; for (const k in C) { key.set(C[k].c, k); }
        const cv = document.querySelector('canvas.dcc-seasons-canvas'), P = CanvasRenderingContext2D.prototype;
        const o = { save: P.save, restore: P.restore, clip: P.clip, di: P.drawImage };
        let stack = [], cur = false; const st = { walkerDraws: 0, walkerClipped: 0, pieceDraws: 0, pieceClipped: 0 };
        P.save = function () { if (this.canvas === cv) { stack.push(cur); } return o.save.apply(this, arguments); };
        P.restore = function () { if (this.canvas === cv) { cur = stack.length ? stack.pop() : false; } return o.restore.apply(this, arguments); };
        P.clip = function () { if (this.canvas === cv) { cur = true; } return o.clip.apply(this, arguments); };
        P.drawImage = function (src, x, y, ww, hh) {
          if (this.canvas === cv && ww !== undefined) { if (key.get(src)) { st.walkerDraws++; if (cur) { st.walkerClipped++; } } else { st.pieceDraws++; if (cur) { st.pieceClipped++; } } }
          return o.di.apply(this, arguments);
        };
        for (let f = 0; f < 30 * 60; f++) { S.tick(1000 / 30, 1); }
        Object.assign(P, { save: o.save, restore: o.restore, clip: o.clip, drawImage: o.di });
        return st;
      });
      ok(r.walkerDraws > 100 && r.walkerClipped === 0, `${w}: ${r.walkerDraws} walker draws, none clipped: no notch at any moment`, JSON.stringify(r));
      ok(r.pieceDraws > 100 && r.pieceClipped === 0, `${w}: ${r.pieceDraws} piece draws, none clipped: no boxy, incomplete falling`, JSON.stringify(r));
      await ses.close();
    }
  }

  if (!ONLY || ONLY === 'gate') {
    console.log('\n  --- 4. (4.16.1) the start-up gate: nothing is seen until frames are steady, on every device; no delay without a stall ---');
    for (const w of [1440, 1920, 390]) {
      /* the real frame loop (not the mocked clock): the main thread is blocked
       * for 1.5 s just after the engine's first frame, as the GPU stall did;
       * the canvas must stay unseen through it */
      const ses = await boot(o => rt.page(o), w, 'halloween', {}, 11), pg = ses.page;
      const r = await pg.evaluate(() => new Promise(done => {
        const S = window.DCCSeasonsEngine._state, cv = document.querySelector('canvas.dcc-seasons-canvas'), log = [];
        let blockEnd = 0, t0 = performance.now();
        const raf = requestAnimationFrame.bind(window);
        (function rec() { log.push([performance.now() - t0, cv.style.opacity, S.gate.a]); if (performance.now() - t0 < 4500) { raf(rec); } else { done({ log, blockEnd: blockEnd - t0, gate: S.gate }); } })();
        setTimeout(() => { const a = performance.now(); while (performance.now() - a < 1500) { /* blocked */ } blockEnd = performance.now(); }, 60);
      }));
      const seenBefore = r.log.filter(e => e[0] <= r.blockEnd + 150 && e[1] !== '0').length;
      const openAt = (r.log.find(e => e[1] === '' && e[0] > r.blockEnd) || [null])[0];
      ok(r.gate.on && seenBefore === 0, `${w}: unseen until the 1.5 s stall is over (no visible frame before ${Math.round(r.blockEnd)} ms)`, JSON.stringify(r.log.slice(0, 8)));
      ok(openAt !== null && openAt - r.blockEnd < 1200, `${w}: and fully in ${openAt === null ? '-' : Math.round(openAt - r.blockEnd)} ms after it (8 steady frames, then a 0.4 s fade)`, JSON.stringify(r.log.slice(-4)));
      ok(r.log.filter(e => e[0] > r.blockEnd).every((e, i, a) => i === 0 || parseFloat(e[1] || '1') >= parseFloat(a[i - 1][1] || '1') - 1e-6), `${w}: it only ever fades in, never out again`, '');
      await ses.close();
    }
    /* no stall: the gate must not hold the effects back (the Director: no more than ~0.3 s) */
    for (const w of [390, 1440]) {
      const ses = await open(rt.page({ config: (() => { const c = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--diag']); c.forceHour = 12; return c; })(), extraHead: QUIET }), { ...rt.opts(w), viewport: { width: w, height: w < 768 ? 844 : 900 }, dsf: 2 });
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.gate.open, null, { timeout: 30000, polling: 50 });
      const g = await ses.page.evaluate(() => window.DCCSeasonsEngine._state.gate);
      const held = g.open - g.t0;
      ok(held <= 300, `${w}, no stall: the effects show ${Math.round(held)} ms after the engine's first frame (bar 300 ms), then fade in over 0.4 s`, JSON.stringify(g));
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
    for (const w of [390, 1023, 1440, 1920]) {
      const ses = await boot(o => rt.page(o), w, 'thanksgiving', { opacity: 0.7 }, 14), pg = ses.page;   /* live's sprite opacity */
      await pg.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done, null, { timeout: 40000, polling: 200 });
      let r = await pg.evaluate(w => {
        const S = window.DCCSeasonsEngine._state; S.manual(true);
        const key = new Map(); const C = S.tom.cache; for (const k in C) { key.set(C[k].c, k); }
        const cv = document.querySelector('canvas.dcc-seasons-canvas'), P = CanvasRenderingContext2D.prototype, di = P.drawImage;
        let draws = []; const pieceA = [];
        P.drawImage = function (src, x, y, ww, hh) {
          const k = key.get(src);
          if (k && this.canvas === cv && ww !== undefined) {
            const m = this.getTransform(), z = cv.width / cv.getBoundingClientRect().width;
            const xs = [x, x + ww].map(a => (m.a * a + m.e) / z), ys = [y, y + hh].map(a => (m.d * a + m.f) / z);
            draws.push({ k, L: Math.min(...xs), R: Math.max(...xs), T: Math.min(...ys), B: Math.max(...ys), o: m.e / z, a: this.globalAlpha });
          } else if (this.canvas === cv && ww !== undefined && !k && src instanceof HTMLImageElement) { pieceA.push(this.globalAlpha);   /* a falling piece: an SVG sprite */
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
        const out = fr.map(e => ({ x: e.t.x, y: e.t.y, sv: e.t.sv, fs: e.t.fs, kx: e.t.kx, ks: e.t.ks, kd: e.t.kd, g: e.t.geo, d: e.d, size: e.t.size, sc: e.t.sc }));
        out.pieceA = pieceA.slice(0, 400); out.cacheH = S.tom.cache.w0.c.height; out.dpr = Math.min(devicePixelRatio || 1, 2);
        return { out, pieceA: out.pieceA, cacheH: out.cacheH, dpr: out.dpr };
      }, w);
      const rr = r; r = rr.out;
      const g = r[0].g;
      /* 4.16.1: his size — twice on a desktop-wide window, exactly 4.16.0 below 1024 */
      const K = w >= 1024 ? 2 : 1, th1 = (107 + 16) * r[0].size * 1.3 * 1.55 * r[0].sc / 107;
      const tomDraw = r.map(e => e.d.find(q => !/^k/.test(q.k))).filter(Boolean);
      const dh = tomDraw.length ? tomDraw[tomDraw.length - 1].B - tomDraw[tomDraw.length - 1].T : 0;
      ok(Math.abs(g.th - K * th1) < 0.01 && Math.abs(dh - g.th) < 1, `${w}: he is drawn ${K === 2 ? 'TWICE' : 'exactly'} the 4.16.0 size (${dh.toFixed(1)} px tall; 4.16.0: ${th1.toFixed(1)})`, JSON.stringify({ th: g.th, th1, dh }));
      ok(rr.cacheH >= dh * rr.dpr - 1, `${w}: sharp: his poses are drawn at ${rr.cacheH} px for ${(dh * rr.dpr).toFixed(0)} device px on screen (never scaled up)`, JSON.stringify({ cacheH: rr.cacheH, need: dh * rr.dpr }));
      /* 4.16.1: fully opaque once faded in (the falling pieces keep their opacity) */
      const wa = [...new Set(r.slice(40).flatMap(e => e.d.map(q => +q.a.toFixed(3))))];
      ok(wa.length === 1 && wa[0] === 1 && rr.pieceA.length && rr.pieceA.every(a => a < 1), `${w}: the tom and both poults are fully opaque (${wa.join(', ')}); the pieces stay see-through (${Math.max(...rr.pieceA).toFixed(2)} at most)`, JSON.stringify({ wa, pa: rr.pieceA.slice(0, 5) }));
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
