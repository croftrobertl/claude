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
const CLOTH = [255, 122, 0], ROPE = [0, 0, 204];
const PLANE = [224, 16, 42], WING = [181, 18, 27], REED = [11, 93, 30], GATOR = [46, 94, 31], FISH = [42, 157, 143];
const near = (p, c, tol) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < (tol || 40);
/* the moon is grey (its dark seas included, ~100-120); the sky and the
 * water behind it are strongly coloured, so low saturation tells them apart */
const moonish = p => (p[0] + p[1] + p[2]) / 3 > 80 && Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) < 40;

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
      await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important} #masthead h1{visibility:hidden} .dcc-seasons-accent{display:none!important} .dcc-hl-banner .cloth{--hl-banner-bg:#ff7a00;color:#ff7a00;border-color:#ff7a00} .dcc-hl-banner .rope{background:#0000cc;box-shadow:0 .6px 0 #0000cc}' });
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
      await pose('plane', { x: g.mx + 145, y: g.my + 5, angle: 0, flip: false, svgBanner: true });
      await tick(1);
      const bP = (await userPts(pg, '.dcc-hl-body .banner rect', [[-104, 15], [-100, 30], [-40, 16], [-36, 30]])).filter(p => Math.hypot(p[0] - g.mx, p[1] - g.my) < g.MR - 3);
      const bnq = await pixels(pg, bP);
      ok(bP.length >= 1 && bnq.every(p => near(p, [255, 212, 0], 50)), `an svg's drawing outside its own box is in front of the moon (${bP.length} points)`, JSON.stringify(bnq));

      /* 4.10.5: the live banner is CSS: a rope div and a cloth div, each
       * marked data-dcc-fore-box, the cloth skewed (paused mid-skew), and
       * the whole thing flipped when the plane heads west. Coloured here so
       * the shape can be told from the moon (live they are near-white). */
      for (const west of [false, true]) {
        const sgn = west ? -1 : 1, lab = west ? 'heading west (flipped)' : 'heading east';
        /* the cloth's centre on the moon */
        await pose('plane', { x: g.mx + sgn * 179, y: g.my + 1, angle: 0, flip: west, banner: true });
        await tick(1);
        const cl = await pg.evaluate(() => { const r = document.querySelector('.dcc-hl-banner .cloth').getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
        const clP = [[0, 0], [-25, -6], [25, 6], [-30, 5], [30, -5]].map(d => [cl.x + d[0], cl.y + d[1]]).filter(p => Math.hypot(p[0] - g.mx, p[1] - g.my) < g.MR - 3);
        const clq = await pixels(pg, clP);
        ok(clP.length >= 2 && clq.every(p => near(p, CLOTH, 50)), `${lab}: the banner's cloth (CSS, skewed) is in front of the moon (${clP.length} points)`, JSON.stringify(clq));
        /* the rope's middle on the moon; the moon just above and below it */
        await pose('plane', { x: g.mx + sgn * 104, y: g.my + 1.25, angle: 0, flip: west, banner: true });
        await tick(1);
        const rp = await pg.evaluate(() => { const r = document.querySelector('.dcc-hl-banner .rope').getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, l: r.left, r: r.right }; });
        const onR = [-12, 0, 12].map(d => [rp.x + d, rp.y]).filter(p => Math.hypot(p[0] - g.mx, p[1] - g.my) < g.MR - 3);
        const offR = [[-8, -5], [8, -5], [-8, 6], [8, 6]].map(d => [rp.x + d[0], rp.y + d[1]]).filter(p => Math.hypot(p[0] - g.mx, p[1] - g.my) < g.MR - 3);
        const rq = await pixels(pg, onR.concat(offR));
        ok(onR.length >= 2 && rq.slice(0, onR.length).every(p => near(p, ROPE, 60)), `${lab}: the rope (a 1.5px CSS line) is in front of the moon (${onR.length} points)`, JSON.stringify(rq.slice(0, onR.length)));
        ok(offR.length >= 2 && rq.slice(onR.length).every(moonish), `${lab}: the moon still shows just above and below the rope (${offR.length} points)`, JSON.stringify(rq.slice(onR.length)));
      }
      /* banked 10° with the banner out: the cloth turns with the plane, so
       * its cut must follow the turn, not its upright box */
      {
        const ang = 10 * Math.PI / 180;
        /* the cloth centre sits at (-179, -1) from the plane's centre, turned */
        const dx = -179, dy = -1, px = g.mx - (dx * Math.cos(ang) - dy * Math.sin(ang)), py = g.my - (dx * Math.sin(ang) + dy * Math.cos(ang));
        await pose('plane', { x: px, y: py, angle: 10, flip: false, banner: true });
        await tick(1);
        const cl = await pg.evaluate(() => { const r = document.querySelector('.dcc-hl-banner .cloth').getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
        const along = [-30, -15, 15, 30].map(d => [cl.x + d * Math.cos(ang), cl.y + d * Math.sin(ang)]).filter(p => Math.hypot(p[0] - g.mx, p[1] - g.my) < g.MR - 3);
        /* off the cloth across its width, where an upright box would reach */
        const off = [-22, 22].map(d => [cl.x + d * Math.cos(ang) + Math.sin(ang) * (d > 0 ? 17 : -17), cl.y + d * Math.sin(ang) - Math.cos(ang) * (d > 0 ? 17 : -17)]).filter(p => Math.hypot(p[0] - g.mx, p[1] - g.my) < g.MR - 3);
        const bq2 = await pixels(pg, along.concat(off));
        ok(along.length >= 2 && bq2.slice(0, along.length).every(p => near(p, CLOTH, 50)), `banked 10°: the cloth is in front of the moon along its turned length (${along.length} points)`, JSON.stringify(bq2.slice(0, along.length)));
        ok(off.length >= 1 && bq2.slice(along.length).every(moonish), `banked 10°: just off the turned cloth the moon shows (${off.length} points)`, JSON.stringify(bq2.slice(along.length)));
      }
      await pose('plane', { x: -500, y: -500 });

      /* the taxi wake (CSS lines, opted in) is cut; the soft glints (CSS,
       * not opted in) never are */
      await pose('wake', { x: g.mx, y: g.my });
      await pose('glint', { x: g.mx, y: g.my - g.MR * 0.5 });
      await tick(1);
      const wk = await pg.evaluate(([mx, my, MR]) => {
        const s = window.DCCSeasonsEngine._state, c = s.witch.canvas, cg = c.getContext('2d'), k = c.width / innerWidth;
        const a = (x, y) => cg.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[3];
        const sp = [...document.querySelectorAll('.dcc-hl-wake span')].map(e => e.getBoundingClientRect());
        const gl = document.querySelector('.dcc-hl-glint').getBoundingClientRect();
        return { onLine: a(mx, sp[0].top + 1), between: a(mx + 10, (sp[0].bottom + sp[1].top) / 2), glint: a((gl.left + gl.right) / 2, (gl.top + gl.bottom) / 2), glint2: a(gl.left + 12, (gl.top + gl.bottom) / 2) };
      }, [g.mx, g.my, g.MR]);
      ok(wk.onLine < 20, `the taxi wake's lines are cut from the moon (canvas alpha ${wk.onLine} on a line)`, JSON.stringify(wk));
      ok(wk.between > 240, `between the wake's lines the moon is whole (alpha ${wk.between})`, JSON.stringify(wk));
      ok(wk.glint > 240 && wk.glint2 > 240, `the water glints cut nothing (alpha ${wk.glint} and ${wk.glint2} under one)`, JSON.stringify(wk));
      for (const k of ['wake', 'glint']) { await pose(k, { x: -500, y: -500 }); }
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
        await pose('plane', Object.assign({ x: g.mx + 20, y: g.my - 10, svgBanner: true }, o));
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
      /* each part once: the default selector matches the wrap AND the
       * marked parts inside it; a part found twice would be cut twice, and
       * at the banner's golden-hour opacity (.82) the moon would show
       * through at 3% instead of 18% */
      ok(st.svgs === 3 && st.media === 1 && st.boxes === 4, `each foreground part is cut once (${st.svgs} svgs, ${st.media} canvas, ${st.boxes} CSS boxes)`, JSON.stringify(st));
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

  /* 4.10.5 (Rob: the flyer witch too, and any other sky flyer): a hero
   * crossing the header picture goes behind its foreground. */
  for (const kind of ['witch', 'heron']) {
    console.log(`\n  --- the ${kind} flyer behind the plane ---`);
    for (const w of [390, 1280]) {
      /* 'classic' has no scene, so flyer follows flyer (heroOnly picks
       * which), crossing after crossing, each at its own random height,
       * until enough of them pass through the header picture */
      const cfg = config(['--theme=classic', '--placement=content', '--layering=front', '--density=16', '--noparticles', '--subtle=off', '--diag']);
      cfg.heroOnly = kind; cfg.heroFirst = [0.3, 0.31]; cfg.heroEvery = [0.3, 0.4]; cfg.vigFirst = 1e9; cfg.heronLand = 0; cfg.forceHour = 12;
      const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true, heroFx: true }), { viewport: { width: w, height: w < 768 ? 640 : 800 }, dsf: 2 });
      const pg = ses.page;
      try {
        await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important} #masthead h1{visibility:hidden} .dcc-seasons-accent{display:none!important}' });
        await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
        await pg.waitForTimeout(800); /* the flyer's sprite decodes */
        await pg.evaluate(() => { ['plane', 'catch', 'reeds', 'gator', 'wake', 'glint'].forEach(k => window.dccPose(k, { x: -900, y: -900 })); window.DCCSeasonsEngine._state.manual(true); });
        const pose = (k, o) => pg.evaluate(([k, o]) => window.dccPose(k, o), [k, o]);
        const host = await pg.evaluate(() => { const r = document.getElementById('header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
        let checked = 0, met = 0;
        for (let i = 0; i < 60 && checked < 4; i++) {
          /* run on (in the page) until the flyer is inside the picture */
          const xy = await pg.evaluate(([w, host]) => {
            const s = window.DCCSeasonsEngine._state;
            for (let k = 0; k < 3000; k++) {
              s.tick(1000 / 30, 1);
              const p = s.heroXY;
              if (p && k % 7 === 0 && p[0] > 80 && p[0] < w - 80 && p[1] > host[1] + 20 && p[1] < host[3] - 20) { return p; }
            }
            return null;
          }, [w, host]);
          if (!xy) { break; }
          /* where the flyer is drawn, before the plane is put there */
          const cand = await pg.evaluate(([x, y]) => {
            const s = window.DCCSeasonsEngine._state, c = s.witch.canvas, cg = c.getContext('2d'), k = c.width / innerWidth, out = [];
            for (let dy = -6; dy <= 6; dy += 3) { for (let dx = -40; dx <= 40; dx += 4) { const a = cg.getImageData(Math.round((x + dx) * k), Math.round((y + dy) * k), 1, 1).data[3]; if (a > 200) { out.push([dx, dy]); } } }
            return out;
          }, xy);
          if (cand.length < 3) { continue; }
          met++;
          await pose('plane', { x: xy[0], y: xy[1] - 1, angle: 0, flip: false, banner: false });
          await pg.evaluate(() => window.DCCSeasonsEngine._state.tick(1, 1));
          /* fuselage points that the flyer covered a moment ago */
          const fz = await pg.evaluate(([x, y, cand]) => {
            const el = document.querySelector('.dcc-hl-body .fuse');
            return cand.map(d => [x + d[0], y + d[1]]).filter(p => { const e = document.elementFromPoint(p[0], p[1]); return false || (el && (() => { const r = el.getBoundingClientRect(); return p[0] > r.left + 4 && p[0] < r.right - 20 && p[1] > r.top + 4 && p[1] < r.bottom - 4; })()); });
          }, [xy[0], xy[1], cand]);
          const inF = [];
          for (const p of fz) {
            const isFuse = await pg.evaluate(([px, py]) => { const el = document.querySelector('.dcc-hl-body .fuse'); const m = el.getScreenCTM().inverse(); const q = new DOMPoint(px, py).matrixTransform(m); return el.isPointInFill(new DOMPoint(q.x, q.y)) && !(q.x > 56 && q.x < 82); }, p);
            if (isFuse) { inF.push(p); }
          }
          if (!inF.length) { await pose('plane', { x: -900, y: -900 }); continue; }
          const q = await pixels(pg, inF.slice(0, 6));
          ok(q.every(c => near(c, PLANE)), `${w}px: the ${kind} flyer is behind the plane (${Math.min(6, inF.length)} points where she was drawn)`, JSON.stringify(q));
          checked++;
          await pose('plane', { x: -900, y: -900 });
        }
        ok(checked >= 2, `${w}px: checked the ${kind} behind the plane ${checked} times`, `met ${met}`);
      } finally { await ses.close(); }
    }
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
