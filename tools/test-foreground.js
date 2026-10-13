'use strict';
/**
 * DCC Seasons — scenes go BEHIND the header picture's foreground (4.10.4).
 *
 * Rob: "Make the seaplane fly in front of the moon and witch since in real
 * life the witch/moon would be higher in the sky than the seaplane." And
 * the same for the rest of the picture's foreground (the reeds, gator and
 * heron; the fishing catch). The fixture carries the live markup and
 * stacking (tools/fixture.js heroFx); this poses each foreground item over
 * the Halloween moon and over the witch, takes a real screenshot and reads
 * the composited pixels: the foreground's colour must win inside its
 * painted shape, and the moon must still be there just outside it (no
 * rectangular hole). Sprites stay in front; the title stays in front.
 * At 320, 390 and 1280, in the poses of each plane mode: flyover (level,
 * banner out), touch-and-go (pitched, facing the other way, no banner),
 * taxi (level, facing the other way). The mu-plugins' own ?dcc_plane modes
 * are not available here: their poses are reproduced instead.
 *
 * Usage: node tools/test-foreground.js
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const PLANE = [224, 16, 42], WING = [181, 18, 27], REED = [11, 93, 30], GATOR = [46, 94, 31], FISH = [42, 157, 143];
const near = (p, c, tol) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < (tol || 40);
const moonish = p => (p[0] + p[1] + p[2]) / 3 > 120 && Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) < 40;

/* screenshot the page and read pixels at client points */
async function pixels(pg, pts) {
  const buf = await pg.screenshot({ type: 'png' });
  return pg.evaluate(async ([b64, pts]) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const k = im.width / window.innerWidth;
    return pts.map(p => [...g.getImageData(Math.round(p[0] * k), Math.round(p[1] * k), 1, 1).data].slice(0, 3));
  }, [buf.toString('base64'), pts]);
}
/* The title's letters (and their shadow) are in front of everything, the
 * plane included (4.10.1): a sample point on a letter reads the letter. */
function glyphBoxes(pg) {
  return pg.evaluate(() => {
    const out = [], rg = document.createRange();
    document.querySelectorAll('#masthead h1').forEach(h => {
      const wk = document.createTreeWalker(h, 4); let n;
      while ((n = wk.nextNode())) { for (let k = 0; k < n.data.length; k++) { rg.setStart(n, k); rg.setEnd(n, k + 1); for (const r of rg.getClientRects()) { out.push([r.left - 9, r.top - 9, r.right + 9, r.bottom + 11]); } } }
    });
    return out;
  });
}
const offText = (boxes, p) => !boxes.some(b => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]);
/* client points of user-space points in an SVG element */
function userPts(pg, sel, pts) {
  return pg.evaluate(([sel, pts]) => {
    const el = document.querySelector(sel), m = el.getScreenCTM();
    return pts.map(p => { const q = new DOMPoint(p[0], p[1]).matrixTransform(m); return [q.x, q.y]; });
  }, [sel, pts]);
}

(async () => {
  for (const w of [320, 390, 1280]) {
    console.log(`\n  --- Halloween moon and witch behind the header picture's foreground, ${w}px ---`);
    /* no sprites and no background layer: what is drawn is the scene alone
     * (the background layer's embers stay in front, like the sprites) */
    const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--noparticles', '--subtle=off', '--diag']);
    cfg.vigOnly = 'witchmoon'; cfg.vigFirst = 300; cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; cfg.forceHour = 12;
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true, heroFx: true }), { viewport: { width: w, height: w < 768 ? 640 : 800 }, dsf: 2 });
    const pg = ses.page;
    try {
      /* the title is in front of everything, the plane included, and is
       * proven by test-scenes.js; hidden here so samples read what is
       * behind it (hidden letters are not cut from the moon). The corner
       * web is in front too, at half opacity: hidden for the same reason. */
      await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important} #masthead h1{visibility:hidden} .dcc-seasons-accent{display:none!important}' });
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
      /* park everything off to the side until it is posed */
      await pg.evaluate(() => { ['plane', 'catch', 'reeds', 'gator'].forEach(k => window.dccPose(k, { x: -500, y: -500 })); });
      /* the moon fully up */
      const g = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        for (let i = 0; i < 900 && !(s.vig && s.vigSt && s.vigSt.moonA >= 0.99); i++) { s.tick(1000 / 30, 1); }
        const v = s.vigSt; return v ? { mx: v.mx, my: v.my, MR: v.MR, W: v.W, on: !!s.vig } : null;
      });
      ok(g && g.on, 'the witch-and-moon scene is playing, the moon fully up', JSON.stringify(g));
      if (!g) { continue; }
      const tick = (ms) => pg.evaluate(ms => window.DCCSeasonsEngine._state.tick(ms, 1), ms);
      const boxes = [];
      const pose = (k, o) => pg.evaluate(([k, o]) => window.dccPose(k, o), [k, o]);

      /* the plane over the moon, in each mode's pose */
      const modes = [['flyover', { angle: 0, flip: false, banner: true }], ['touch-and-go', { angle: -12, flip: true, banner: false }], ['taxi', { angle: 0, flip: true, banner: false }]];
      for (const [mode, o] of modes) {
        await pose('plane', Object.assign({ x: g.mx, y: g.my }, o));
        await tick(1);
        /* inside the fuselage and the wing; and in the plane's box but
         * outside its shape (above the fuselage, behind the wing) */
        const inF = await userPts(pg, '.dcc-hl-body .fuse', [[48, 27], [53, 26], [92, 26], [105, 26]]);
        const inW = await userPts(pg, '.dcc-hl-body .wing', [[62, 10], [76, 40]]);
        const outP = await userPts(pg, '.dcc-hl-body .fuse', [[50, 13], [88, 10], [88, 40], [50, 38], [92, 41]]);
        const inMoon = p => Math.hypot(p[0] - g.mx, p[1] - g.my) < g.MR - 3 && offText(boxes, p);
        const fP = inF.filter(inMoon), wP = inW.filter(inMoon), oP = outP.filter(inMoon);
        const px = await pixels(pg, fP.concat(wP, oP));
        const pf = px.slice(0, fP.length), pw = px.slice(fP.length, fP.length + wP.length), po = px.slice(fP.length + wP.length);
        ok(fP.length >= 1 && pf.every(p => near(p, PLANE)), `${mode}: where the plane crosses the moon, the plane is in front (${fP.length} fuselage points)`, JSON.stringify(pf));
        ok(!wP.length || pw.every(p => near(p, WING)), `${mode}: its wing too (${wP.length} points)`, JSON.stringify(pw));
        ok(oP.length >= 1 && po.every(moonish), `${mode}: just outside its shape the moon is still there, no box cut out (${oP.length} points)`, JSON.stringify(po));
        if (mode === 'flyover') {
          /* the propeller blade, turned 90° by its paused CSS animation */
          const pp = (await userPts(pg, '.dcc-hl-body .prop rect', [[139, 22], [139, 30]])).filter(inMoon);
          if (pp.length) { const q = await pixels(pg, pp); ok(q.every(p => (p[0] + p[1] + p[2]) / 3 < 60), 'flyover: the spinning propeller is in front too (its CSS rotation followed)', JSON.stringify(q)); }
        }
      }
      /* the towed banner, which the plane's svg draws OUTSIDE its own box */
      await pose('plane', { x: g.mx + 145, y: g.my + 5, angle: 0, flip: false, banner: true });
      await tick(1);
      const bP = (await userPts(pg, '.dcc-hl-body .banner rect', [[-104, 15], [-100, 30], [-40, 16], [-36, 30]])).filter(p => Math.hypot(p[0] - g.mx, p[1] - g.my) < g.MR - 3);
      const bnq = await pixels(pg, bP);
      ok(bP.length >= 1 && bnq.every(p => near(p, [255, 212, 0], 50)), `the towed banner (drawn outside the plane's own box) is in front of the moon (${bP.length} points)`, JSON.stringify(bnq));
      await pose('plane', { x: -500, y: -500 });

      /* the reeds, the canvas gator and the fishing catch over the moon */
      await pose('reeds', { x: g.mx - g.MR * 0.3, y: g.my });
      await pose('gator', { x: g.mx, y: g.my + g.MR * 0.55 });
      await pose('catch', { x: g.mx + g.MR * 0.45, y: g.my - g.MR * 0.45 });
      await tick(1);
      const inM = p => Math.hypot(p[0] - g.mx, p[1] - g.my) < g.MR - 3 && offText(boxes, p);
      const reedP = (await userPts(pg, '.dcc-gh-fore .reeds path', [[8.6, 70], [8.4, 50], [7.8, 40], [9, 80], [20.2, 80], [21, 60]])).filter(inM);
      const fishP = (await userPts(pg, '.dcc-catch path', [[20, 15], [26, 15], [30, 15]])).filter(inM);
      const gatorP = [[g.mx + 4, g.my + g.MR * 0.55], [g.mx + 15, g.my + g.MR * 0.55]].filter(inM);
      const q = await pixels(pg, reedP.concat(fishP, gatorP));
      ok(reedP.length >= 1 && q.slice(0, reedP.length).every(p => near(p, REED, 50)), `the reeds are in front of the moon (${reedP.length} points)`, JSON.stringify(q.slice(0, reedP.length)));
      ok(fishP.length >= 1 && q.slice(reedP.length, reedP.length + fishP.length).every(p => near(p, FISH, 50)), `the fishing catch is in front of the moon (${fishP.length} points)`, JSON.stringify(q.slice(reedP.length, reedP.length + fishP.length)));
      const qg = q.slice(reedP.length + fishP.length);
      ok(gatorP.length >= 1 && qg.every(p => near(p, GATOR, 50)), `the gator (a canvas) is in front of the moon (${gatorP.length} points)`, JSON.stringify(qg));
      const betw = (await userPts(pg, '.dcc-gh-fore .reeds path', [[14, 35], [14, 45], [14, 55]])).filter(inM);
      const bq = await pixels(pg, betw);
      ok(betw.length >= 1 && bq.every(moonish), `between the reed stems the moon still shows (${betw.length} points)`, JSON.stringify(bq));
      /* the canvas gator turned 30° by CSS: still cut in its own shape */
      for (const k of ['reeds', 'catch']) { await pose(k, { x: -500, y: -500 }); }
      await pose('gator', { x: g.mx, y: g.my + g.MR * 0.2, angle: 30 });
      await tick(1);
      const gr = await pg.evaluate(() => { const c = document.querySelector('.dcc-gh-fore canvas'), r = c.getBoundingClientRect(); return { cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }; });
      /* along the body's long axis (it is drawn level in the canvas, then turned) */
      const a30 = Math.PI / 6, alongP = [-14, 0, 14].map(d => [gr.cx + d * Math.cos(a30), gr.cy + d * Math.sin(a30)]).filter(inM);
      const offP = [-12, 12].map(d => [gr.cx - d * Math.sin(a30) * 1.2, gr.cy + d * Math.cos(a30) * 1.2]).filter(inM);
      const gq = await pixels(pg, alongP.concat(offP));
      ok(alongP.length >= 2 && gq.slice(0, alongP.length).every(p => near(p, GATOR, 50)), `the gator turned 30° is in front along its body (${alongP.length} points)`, JSON.stringify(gq));
      ok(offP.length >= 1 && gq.slice(alongP.length).every(moonish), `and the moon shows just off its turned body, not in its box (${offP.length} points)`, JSON.stringify(gq.slice(alongP.length)));
      for (const k of ['reeds', 'gator', 'catch']) { await pose(k, { x: -500, y: -500 }); }

      /* The cut does not trust getScreenCTM for the HTML part (Safari's
       * ignores CSS rotation and flips on HTML ancestors). Chromium's is
       * right, so here the two must agree, for every pose. */
      let worst = 0;
      for (const o of [{ angle: 0, flip: false }, { angle: -12, flip: true }, { angle: 17, flip: false }, { angle: 8, flip: true }]) {
        await pose('plane', Object.assign({ x: g.mx + 20, y: g.my - 10, banner: true }, o));
        worst = Math.max(worst, await pg.evaluate(() => {
          let d = 0;
          document.querySelectorAll('.dcc-hl-body svg path, .dcc-hl-body svg rect, .dcc-hl-body svg text').forEach(el => {
            const a = window.DCCSeasonsEngine._state.foreM(el), m = el.getScreenCTM();
            [[0, 0], [100, 0], [0, 40], [140, 50]].forEach(p => {
              const q = new DOMPoint(p[0], p[1]).matrixTransform(m);
              d = Math.max(d, Math.hypot(a[0] * p[0] + a[2] * p[1] + a[4] - q.x, a[1] * p[0] + a[3] * p[1] + a[5] - q.y));
            });
          });
          return d;
        }));
      }
      ok(worst < 0.5, `the cut's own placement matches the browser's, flipped and banked (worst ${worst.toFixed(3)} px)`, String(worst));
      await pose('plane', { x: -500, y: -500 });

      /* the plane over the witch: on the moon (dark) and off it */
      let checked = 0, dark = 0, light = 0;
      for (let i = 0; i < 400 && checked < 6; i++) {
        await tick(1000 / 30);
        const v = await pg.evaluate(() => { const v = window.DCCSeasonsEngine._state.vigSt; return v && v.wx != null ? { x: v.wx, y: v.wy, sil: v.sil || 0, on: v.wx > 40 && v.wx < window.innerWidth - 40 } : null; });
        if (!v || !v.on || i % 4) { continue; }
        await pose('plane', { x: v.x, y: v.y, angle: 0, flip: (i % 8) === 0, banner: false });
        await tick(1);
        const p = (await userPts(pg, '.dcc-hl-body .fuse', [[40, 27], [48, 27], [92, 26], [105, 26]])).filter(q => offText(boxes, q));
        const pxs = await pixels(pg, p);
        ok(p.length >= 1 && pxs.every(c => near(c, PLANE)), `the plane is in front of the witch (${v.sil >= 1 ? 'dark, over the moon' : 'in colour'}, at ${v.x.toFixed(0)},${v.y.toFixed(0)})`, JSON.stringify(pxs));
        checked++; if (v.sil >= 1) { dark++; } else { light++; }
      }
      ok(checked >= 4, `checked the witch behind the plane ${checked} times (${dark} dark, ${light} in colour)`, String(checked));
      await pose('plane', { x: -500, y: -500 });
      const st = await pg.evaluate(() => window.DCCSeasonsEngine._state.fore);
      ok(st && st.stats.cuts > 0, `the cut ran (${st && st.stats.cuts} frames)`, JSON.stringify(st));
    } finally { await ses.close(); }
  }

  /* Sprites stay in FRONT of the foreground: only the scene goes behind. */
  console.log('\n  --- sprites stay in front of the foreground while a scene plays ---');
  {
    const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--noparticles', '--diag']);
    cfg.vigOnly = 'witchmoon'; cfg.vigFirst = 300; cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; cfg.forceHour = 12;
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true, heroFx: true }), { viewport: { width: 390, height: 640 }, dsf: 2 });
    const pg = ses.page;
    try {
      await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}' });
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
      await pg.evaluate(() => { ['catch', 'reeds', 'gator'].forEach(k => window.dccPose(k, { x: -500, y: -500 })); });
      const r = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        for (let i = 0; i < 900 && !(s.vig && s.vigSt && s.vigSt.moonA >= 0.99); i++) { s.tick(1000 / 30, 1); }
        return { mx: s.vigSt.mx, my: s.vigSt.my, MR: s.vigSt.MR };
      });
      /* the plane well clear of the moon; a magenta square drawn on the
       * engine's canvas under it, as a sprite would be (before the scene) */
      const px0 = r.mx > 195 ? 90 : 300, py0 = r.my;
      await pg.evaluate(([x, y]) => {
        window.dccPose('plane', { x, y, angle: 0, flip: false, banner: false });
        const s = window.DCCSeasonsEngine._state;
        s.preScene = (cx) => { cx.fillStyle = '#ff00ff'; cx.fillRect(x - 6, y - 6, 12, 12); };
      }, [px0, py0]);
      const hook = await pg.evaluate(() => typeof window.DCCSeasonsEngine._state.preScene === 'function');
      await pg.evaluate(() => window.DCCSeasonsEngine._state.tick(1, 1));
      const q = await pixels(pg, [[px0, py0]]);
      ok(hook && near(q[0], [255, 0, 255], 30), 'a sprite drawn over the plane stays in front of it while the scene plays', JSON.stringify(q));
    } finally { await ses.close(); }
  }

  /* How Rob saw them together: the hero show (DCCHeroFx busy) holds back
   * the HEROES only. A scene is not held, and since 4.9.0 every page opens
   * with its scene at 6-10 s, so on the homepage the moon and the witch
   * play while the plane is still flying. Recorded here as a fact. */
  console.log('\n  --- the hero show holds back heroes, not scenes ---');
  {
    const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--noparticles', '--diag']);
    cfg.forceHour = 12;
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: 390, height: 640 } });
    try {
      await ses.page.addInitScript(() => { window.DCCHeroFx = { state: 'busy' }; });
      await ses.page.reload();
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
      const r = await ses.page.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        for (let i = 0; i < 30 * 14; i++) { s.tick(1000 / 30, 1); }
        return { fx: window.DCCHeroFx.state, scenes: s.vigLog.map(v => +v.start.toFixed(1)), heroes: s.heroLog.length };
      });
      ok(r.fx === 'busy' && r.scenes.length >= 1 && r.heroes === 0, `with the hero show busy, the scene still starts (at ${r.scenes[0]} s) and no hero does`, JSON.stringify(r));
    } finally { await ses.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { problems.forEach(p => console.log('  - ' + p)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
