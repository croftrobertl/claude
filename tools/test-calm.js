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
 *  3. THE TOM (4.17.0, Rob: on the header photo's bottom edge, alone): his
 *     size (2x from 1024, phones as 4.16.0), sharp, fully opaque, one place,
 *     his toes on the picture's foot (0 device px) with the toolbar out and
 *     in, scrolling away with the picture, nothing drawn but him (no poult),
 *     8 px or more clear of the header's words at his largest size, and
 *     Rob's A: a word put next to him makes him smaller, just enough.
 *
 *   node tools/test-calm.js [--only=occ|pause|walk]
 *   DCC_CALM_MUT=mask|click|onex|phone|inherit|early|slide|two|gap|screen|collide|poult (a copy of the engine, one line broken)
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
    two: ["else { p.fs = 1; p.fv = tkNextV(p.fv);", "else { p.sv = 0; p.fs = 1; p.fv = tkNextV(p.fv);"],
    /* 4.17.0 */
    gap: ["cx.drawImage(tf.c, -tf.w * ts / 2, -tf.h * ts * TK_SOLEF, tf.w * ts, tf.h * ts);", "cx.drawImage(tf.c, -tf.w * ts / 2, -tf.h * ts * TK_SOLEF - 3, tf.w * ts, tf.h * ts);"],
    screen: ["c.style.cssText = 'position:absolute;right:0;bottom:0;width:1px;height:1px;", "c.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;"],
    collide: ["if (!N || !hits(1)) { return 1; }", "return 1;"],
    poult: ["cx.drawImage(tf.c, -tf.w * ts / 2, -tf.h * ts * TK_SOLEF, tf.w * ts, tf.h * ts);", "cx.drawImage(tf.c, -tf.w * ts / 2, -tf.h * ts * TK_SOLEF, tf.w * ts, tf.h * ts); cx.drawImage(tf.c, -tf.w * ts * 1.4, -tf.h * ts * 0.4 * TK_SOLEF, tf.w * ts * 0.4, tf.h * ts * 0.4);"],
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
        const cvs = [document.querySelector('canvas.dcc-seasons-canvas')], P = CanvasRenderingContext2D.prototype;
        const mine = c => { if (cvs.length < 2) { const gc = document.querySelector('canvas.dcc-seasons-ground'); if (gc) { cvs.push(gc); } } return cvs.indexOf(c) >= 0; };
        const o = { save: P.save, restore: P.restore, clip: P.clip, di: P.drawImage };
        let stack = [], cur = false; const st = { walkerDraws: 0, walkerClipped: 0, pieceDraws: 0, pieceClipped: 0 };
        P.save = function () { if (mine(this.canvas)) { stack.push(cur); } return o.save.apply(this, arguments); };
        P.restore = function () { if (mine(this.canvas)) { cur = stack.length ? stack.pop() : false; } return o.restore.apply(this, arguments); };
        P.clip = function () { if (mine(this.canvas)) { cur = true; } return o.clip.apply(this, arguments); };
        P.drawImage = function (src, x, y, ww, hh) {
          if (mine(this.canvas) && ww !== undefined) { if (key.get(src)) { st.walkerDraws++; if (cur) { st.walkerClipped++; } } else { st.pieceDraws++; if (cur) { st.pieceClipped++; } } }
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
    console.log('\n  --- 3. (4.17.0, Rob) the tom alone, on the header photo\'s bottom edge ---');
    for (const w of [320, 390, 1023, 1440, 1920]) {
      const H = w < 768 ? 844 : 900;
      const ses = await boot(o => rt.page(o), w, 'thanksgiving', { opacity: 0.7, gate: false }, 14), pg = ses.page;   /* live's sprite opacity */
      await pg.waitForFunction(() => window.DCCSeasonsEngine._state.tom.done && window.DCCSeasonsEngine._state.calm.tom[0].hl, null, { timeout: 40000, polling: 200 });
      /* every draw on his canvas, in the picture's px; the pieces' opacity on the page canvas */
      const run = (n, opt) => pg.evaluate(({ n, opt }) => {
        const S = window.DCCSeasonsEngine._state; S.manual(true);
        const key = new Map(); const C = S.tom.cache; for (const k in C) { key.set(C[k].c, k); }
        const gc = document.querySelector('canvas.dcc-seasons-ground'), cv = document.querySelector('canvas.dcc-seasons-canvas'), P = CanvasRenderingContext2D.prototype, di = P.drawImage;
        let draws = [], other = 0; const pieceA = [];
        P.drawImage = function (src, x, y, ww, hh) {
          if (this.canvas === gc && ww !== undefined) {
            const k = key.get(src), m = this.getTransform(), z = gc.width / gc.getBoundingClientRect().width;
            const xs = [x, x + ww].map(a => (m.a * a + m.e) / z), ys = [y, y + hh].map(a => (m.d * a + m.f) / z);
            draws.push({ k, L: Math.min(...xs), R: Math.max(...xs), T: Math.min(...ys), B: Math.max(...ys), a: this.globalAlpha });
          } else if (this.canvas === cv && ww !== undefined && src instanceof HTMLImageElement) { pieceA.push(this.globalAlpha); }
          return di.apply(this, arguments);
        };
        const fr = [];
        for (let f = 0; f < n; f++) {
          draws = []; S.tick(1000 / 30, 1);
          const t = S.calm.tom[0]; if (!t || !t.hl) { continue; }
          let low = -1;
          if (opt.ink && (f % 15 === 0 || f === n - 1)) { const d = gc.getContext('2d').getImageData(0, 0, gc.width, gc.height).data; for (let y = gc.height - 1; y >= 0 && low < 0; y--) { for (let x = 0; x < gc.width; x++) { if (d[(y * gc.width + x) * 4 + 3] > 8) { low = y; break; } } } }
          fr.push({ x: t.x, fk: t.fk, sv: t.sv, fs: t.fs, g: t.geo, size: t.size, sc: t.sc, d: draws.slice(), gap: low >= 0 ? gc.height - 1 - low : null });
        }
        P.drawImage = di;
        const pic = document.querySelector('#header-image-main-inside').getBoundingClientRect(), cr = gc.getBoundingClientRect();
        return { fr, pieceA: pieceA.slice(0, 400), cacheH: S.tom.cache.w0.c.height, dpr: Math.min(devicePixelRatio || 1, 2), picB: pic.bottom, picR: pic.right, cB: cr.bottom, cR: cr.right, cL: cr.left, cT: cr.top, fixed: getComputedStyle(gc).position };
      }, { n, opt: opt || {} });
      const rr = await run(30 * 60, { ink: 1 }), r = rr.fr, g = r[0].g;
      /* his size: twice on a desktop-wide window, exactly 4.16.0 below 1024 (fk 1: nothing near him here) */
      const K = w >= 1024 ? 2 : 1, th1 = (107 + 16) * r[0].size * 1.3 * 1.55 * r[0].sc / 107, last = r[r.length - 1].d[0], dh = last ? last.B - last.T : 0;
      ok(r[0].fk === 1 && Math.abs(g.th - K * th1) < 0.01 && Math.abs(dh - g.th) < 1, `${w}: he is drawn ${K === 2 ? 'TWICE' : 'exactly'} the 4.16.0 size (${dh.toFixed(1)} px tall; 4.16.0: ${th1.toFixed(1)}; fit ${r[0].fk})`, JSON.stringify({ th: g.th, th1, dh, fk: r[0].fk }));
      ok(rr.cacheH >= dh * rr.dpr - 1, `${w}: sharp: his poses are drawn at ${rr.cacheH} px for ${(dh * rr.dpr).toFixed(0)} device px on screen (never scaled up)`, JSON.stringify({ cacheH: rr.cacheH, need: dh * rr.dpr }));
      const wa = [...new Set(r.slice(40).flatMap(e => e.d.map(q => +q.a.toFixed(3))))];
      ok(wa.length === 1 && wa[0] === 1 && rr.pieceA.length && rr.pieceA.every(a => a < 1), `${w}: the tom is fully opaque (${wa.join(', ')}); the pieces stay see-through (${Math.max(...rr.pieceA).toFixed(2)} at most)`, JSON.stringify({ wa, pa: rr.pieceA.slice(0, 5) }));
      ok(r.length > 1500 && r.every(e => e.d.length === 1 && e.d[0].k), `${w}: only the tom is drawn, once a frame: no poult (${Math.max(...r.map(e => e.d.length))} draw a frame at most)`, JSON.stringify(r.find(e => e.d.length !== 1) || {}).slice(0, 200));
      const tL = new Set(r.map(e => e.d[0] && e.d[0].L.toFixed(2)));
      ok(tL.size === 1, `${w}: the tom never moves sideways: one left edge in ${r.length} draws (${[...tL].slice(0, 6).join(', ')})`, '');
      /* his feet on the picture's foot: the canvas's foot IS the picture's, and his toes are its last row */
      const gaps = r.map(e => e.gap).filter(v => v != null);
      ok(rr.fixed === 'absolute' && Math.abs(rr.cB - rr.picB) < 0.5 && gaps.length > 50 && Math.max(...gaps) === 0, `${w}: his toes on the header photo's bottom edge: 0 device px of gap in ${gaps.length} samples, every pose (canvas foot ${rr.cB.toFixed(2)}, photo ${rr.picB.toFixed(2)})`, JSON.stringify({ max: Math.max(...gaps), cB: rr.cB, picB: rr.picB, pos: rr.fixed }));
      ok(Math.abs(rr.cL + last.R - (rr.picR - 8)) < 1, `${w}: his box 8 px in from the photo's right edge (${(rr.picR - rr.cL - last.R).toFixed(1)} px)`, JSON.stringify({ cL: rr.cL, R: last.R, picR: rr.picR }));
      ok(r.every(e => !(e.sv >= 0 && e.fs === 1)), `${w}: never two idle motions at once`, '');
      /* the mobile toolbar: the window taller and shorter, mid-visit; and a scroll: he moves with the photo */
      const at0 = await pg.evaluate(() => { const c = document.querySelector('canvas.dcc-seasons-ground').getBoundingClientRect(), p = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [c.bottom - p.bottom, c.right - p.right, p.bottom]; });
      const moves = [];
      for (const [hh, sy] of [[H + 88, 0], [H, 120], [H + 88, 260], [H - 60, 60]]) {
        await pg.setViewportSize({ width: w, height: hh });
        await pg.evaluate(sy => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo({ top: sy, behavior: 'instant' }); }, sy);
        await pg.waitForTimeout(120);
        const q = await run(12, { ink: 1 });
        const e = q.fr[q.fr.length - 1];
        moves.push({ hh, sy, foot: +(q.cB - q.picB).toFixed(2), gap: e.gap, photoMoved: +(at0[2] - q.picB).toFixed(1) });
      }
      ok(moves.every(m => Math.abs(m.foot) < 0.5 && m.gap === 0 && Math.abs(m.photoMoved - m.sy) < 1), `${w}: with the toolbar out and in and scrolled, still on the photo's foot and moving with it (${moves.map(m => `${m.hh}px/${m.sy}: ${m.foot}, gap ${m.gap}`).join(' · ')})`, JSON.stringify(moves));
      await pg.setViewportSize({ width: w, height: H }); await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(150);
      /* clear of the header's words at his LARGEST size, and Rob's A when something is near him */
      const kc = await rt.keepClear(pg);
      const clr = await pg.evaluate(async ({ kc, w }) => {
        const S = window.DCCSeasonsEngine._state, p = S.parts.find(q => q.b === 'forage');
        const measure = R => { let worst = 1e9; for (let f = 0; f < 30 * 40; f++) { S.tick(1000 / 30, 1); if (f < 45 || f % 15) { continue; }
            const c = document.querySelector('canvas.dcc-seasons-ground'), cr = c.getBoundingClientRect(), k = c.width / cr.width, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            for (let y = 0; y < c.height; y++) { for (let x = 0; x < c.width; x++) { if (d[(y * c.width + x) * 4 + 3] < 24) { continue; } const vx = cr.left + x / k, vy = cr.top + y / k;
              for (const b of R) { const dd = Math.max(b[0] - vx, 0, vx - b[2], b[1] - vy, vy - b[3]); if (dd < worst) { worst = dd; } } } } }
          return worst; };
        const big = async () => { p.size = 32; p.sc = 1.4; p.hl = 0; p.fk = null; p.fkT = null; S.tick(33, 1); await new Promise(r => setTimeout(r, 400)); };
        await big();
        const words = measure(Object.values(kc).flat()), fk1 = p.fk;
        /* a line of the header's text put right where his fan stands */
        const pic = document.querySelector('#header-image-main-inside'), pr = pic.getBoundingClientRect(), t = document.createElement('p');
        t.setAttribute('data-dcc-keep-clear-text', ''); t.textContent = 'Book a cottage';
        t.style.cssText = `position:absolute;margin:0;right:${Math.round(w * 0.06)}px;bottom:${Math.round(p.size * 1.4 * (w >= 1024 ? 2 : 1) * 1.3 * 1.55 * 1.15 * 0.6)}px;font:600 18px sans-serif;color:#fff;z-index:2`;
        pic.appendChild(t);
        await big();
        const tr = [...(() => { const rg = document.createRange(); rg.selectNodeContents(t.firstChild); return rg.getClientRects(); })()].map(r => [r.left, r.top, r.right, r.bottom]);
        const near = measure(tr), fk2 = p.fk;
        t.remove();
        return { words: Math.round(words), fk1, near: Math.round(near), fk2: +fk2.toFixed(3) };
      }, { kc, w });
      ok(clr.fk1 === 1 && clr.words >= 8, `${w}: at his largest size, ${clr.words} px clear of the header's words (bar 8), full size`, JSON.stringify(clr));
      ok(clr.fk2 < 1 && clr.fk2 >= 0.4 && clr.near >= 8, `${w}: Rob's A: a line of text put where his fan stands makes him ${Math.round((1 - clr.fk2) * 100)}% smaller, just enough: ${clr.near} px clear`, JSON.stringify(clr));
      await ses.close();
    }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
