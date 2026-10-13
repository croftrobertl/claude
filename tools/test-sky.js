'use strict';
/**
 * DCC Seasons — the sky belongs to the header picture (4.10.7, Rob: "The
 * witch/moon appear whenever I scroll down the page, too, but I only wanted
 * it in the hero area"). His picks: the sky scenes and the sky flyers are
 * clipped to the header picture and scroll with it; they wait until it is
 * in view; a page without one has none of them; the falling sprites, the
 * water-line scenes, the bass, the manatee and the rainbow stay full-page;
 * the heron does not land in the header.
 *
 * At 320, 390 and 1280 px (2x):
 *   - before, during and after a scroll, nothing the scene draws is on
 *     screen outside the picture's box (a screenshot with everything but
 *     the engine's canvases hidden), the scene keeps running while the
 *     picture is scrolled away, and shows again on the way back;
 *   - the scene and the flyer wait when the page loads scrolled down;
 *   - no sky scene or flyer on a page without a header picture, while a
 *     water-line scene and the bass still play there;
 *   - the falling sprites still use the whole page;
 *   - the scene is laid out in the picture, and a short picture shrinks it
 *     to fit; the heron flies across without landing.
 *
 *   node tools/test-sky.js
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const QUIET = '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}';
/* everything hidden but the engine's canvases, on black: a screenshot then
 * shows exactly what the engine put on screen, and where */
const ONLY_CANVAS = 'html,body{background:#000!important} *{visibility:hidden!important;background:transparent!important;box-shadow:none!important;text-shadow:none!important;border-color:transparent!important} canvas.dcc-seasons-canvas,canvas.dcc-seasons-sky{visibility:visible!important}';

function scene(extra) {
  const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--noparticles', '--subtle=off', '--diag']);
  cfg.vigOnly = 'witchmoon'; cfg.vigFirst = 300; cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; cfg.forceHour = 12;
  return Object.assign(cfg, extra || {});
}
const boot = async (cfg, w, opts) => {
  const ses = await open(fixture(Object.assign({ kind: 'bravada', config: cfg, banner: true }, opts || {})), { viewport: { width: w, height: w < 768 ? 640 : 800 }, dsf: 2 });
  await ses.page.addStyleTag({ content: QUIET });
  await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
  return ses;
};
/* lit pixels in a screenshot, inside and outside a viewport box */
async function litOutside(pg, box) {
  const buf = await pg.screenshot({ type: 'png' });
  return pg.evaluate(async ([b64, box]) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const k = im.width / innerWidth, d = g.getImageData(0, 0, c.width, c.height).data;
    let inside = 0, outside = 0, where = null;
    for (let y = 0; y < c.height; y += 2) {
      for (let x = 0; x < c.width; x += 2) {
        const i = (y * c.width + x) * 4;
        if (d[i] + d[i + 1] + d[i + 2] < 24) { continue; }
        const vx = x / k, vy = y / k, inBox = box && vx >= box[0] - 1 && vx <= box[2] + 1 && vy >= box[1] - 1 && vy <= box[3] + 1;
        if (inBox) { inside++; } else { outside++; if (!where) { where = [Math.round(vx), Math.round(vy)]; } }
      }
    }
    return { inside, outside, where };
  }, [buf.toString('base64'), box]);
}
const picBox = pg => pg.evaluate(() => { const r = document.getElementById('header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
const tick = (pg, n) => pg.evaluate(n => { const s = window.DCCSeasonsEngine._state; for (let i = 0; i < n; i++) { s.tick(1000 / 30, 1); } return !!s.vig; }, n);

(async () => {
  for (const w of [320, 390, 1280]) {
    console.log(`\n  --- ${w}px: the moon and the witch in the header picture, scrolling ---`);
    const ses = await boot(scene(), w);
    const pg = ses.page;
    try {
      const st = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        for (let i = 0; i < 900 && !(s.vig && s.vigSt && s.vigSt.moonA >= 0.99); i++) { s.tick(1000 / 30, 1); }
        const v = s.vigSt, k = s.sky, pc = document.querySelector('canvas.dcc-seasons-canvas'), g = pc.getContext('2d');
        const d = g.getImageData(0, 0, pc.width, pc.height).data; let lit = 0; for (let i = 3; i < d.length; i += 4) { if (d[i]) { lit++; } }
        const c = document.querySelector('canvas.dcc-seasons-sky');
        return { on: s.vig, sky: k, mx: v.mx, my: v.my, MR: v.MR, pageLit: lit, inPic: !!(c && c.parentElement && c.parentElement.id === 'header-image-main-inside'),
          ov: getComputedStyle(document.getElementById('header-image-main-inside')).overflow };
      });
      ok(st.on === 'witchmoon' && st.sky.vigSky, `${w}px: the scene plays on the header picture's canvas`, JSON.stringify(st.sky));
      ok(st.inPic && st.ov === 'hidden', `${w}px: that canvas is inside the picture, which clips it`, JSON.stringify(st));
      ok(st.pageLit === 0, `${w}px: nothing of the scene on the page's canvas (${st.pageLit} lit px)`, String(st.pageLit));
      ok(st.mx > 0 && st.mx < st.sky.w && st.my - st.MR >= 0 && st.my + st.MR <= st.sky.h, `${w}px: the moon is laid out inside the ${st.sky.w}x${st.sky.h} picture (at ${st.mx.toFixed(0)},${st.my.toFixed(0)}, r ${st.MR})`, JSON.stringify(st));
      await pg.addStyleTag({ content: ONLY_CANVAS });
      /* before, during (three offsets, the picture partly then wholly gone),
       * and after the scroll back */
      const H = await pg.evaluate(() => document.documentElement.scrollHeight);
      for (const y of [0, 150, 330, 900, 0]) {
        await pg.evaluate(y => window.scrollTo(0, y), Math.min(y, H));
        await pg.waitForTimeout(60);
        const running = await tick(pg, 3);
        const box = await picBox(pg), vis = box[3] > 0 && box[1] < (w < 768 ? 640 : 800);
        const lit = await litOutside(pg, vis ? box : null);
        ok(lit.outside === 0, `${w}px, scrolled ${y}: nothing drawn outside the picture's box (${lit.outside} px outside${lit.where ? ' e.g. at ' + lit.where : ''}, ${lit.inside} inside)`, JSON.stringify(lit));
        if (y === 900) { ok(running && lit.inside === 0, `${w}px: scrolled past it, nothing shows and the scene runs on`, JSON.stringify({ running, lit })); }
        else if (y < 300) { ok(lit.inside > 200, `${w}px, scrolled ${y}: the scene shows in the picture (${lit.inside} px)`, JSON.stringify(lit)); }
      }
    } finally { await ses.close(); }
  }

  console.log('\n  --- the scene and the flyer wait for the picture when the page loads scrolled down ---');
  for (const w of [390, 1280]) {
    {
      const ses = await boot(scene({ vigFirst: 2000 }), w);
      const pg = ses.page;
      try {
        await pg.evaluate(() => { window.DCCSeasonsEngine._state.manual(true); window.scrollTo(0, 1200); });
        await pg.waitForTimeout(250);
        const held = await pg.evaluate(() => { const s = window.DCCSeasonsEngine._state; for (let i = 0; i < 30 * 8; i++) { s.tick(1000 / 30, 1); } return { vig: s.vig, inView: s.sky.inView, log: s.vigLog.length }; });
        ok(!held.vig && !held.log && !held.inView, `${w}px: loaded scrolled down, the scene waits (8 s past its time, nothing started)`, JSON.stringify(held));
        await pg.evaluate(() => window.scrollTo(0, 0));
        await pg.waitForTimeout(250);
        const went = await pg.evaluate(() => { const s = window.DCCSeasonsEngine._state; for (let i = 0; i < 10 && !s.vig; i++) { s.tick(1000 / 30, 1); } return { vig: s.vig, inView: s.sky.inView }; });
        ok(went.vig === 'witchmoon', `${w}px: back at the top, it plays at once`, JSON.stringify(went));
      } finally { await ses.close(); }
    }
    {
      const cfg = config(['--theme=classic', '--placement=content', '--layering=front', '--density=16', '--noparticles', '--subtle=off', '--diag']);
      cfg.heroOnly = 'heron'; cfg.heroFirst = [2, 2.1]; cfg.heroEvery = [9999, 10000]; cfg.vigFirst = 1e9; cfg.forceHour = 12;
      const ses = await boot(cfg, w);
      const pg = ses.page;
      try {
        await pg.evaluate(() => { window.DCCSeasonsEngine._state.manual(true); window.scrollTo(0, 1200); });
        await pg.waitForTimeout(250);
        const held = await pg.evaluate(() => { const s = window.DCCSeasonsEngine._state; for (let i = 0; i < 30 * 8; i++) { s.tick(1000 / 30, 1); } return { hero: s.hero, log: s.heroLog.length }; });
        ok(!held.hero && !held.log, `${w}px: the flyer waits too`, JSON.stringify(held));
        await pg.evaluate(() => window.scrollTo(0, 0));
        await pg.waitForTimeout(250);
        const went = await pg.evaluate(() => { const s = window.DCCSeasonsEngine._state; for (let i = 0; i < 10 && !s.hero; i++) { s.tick(1000 / 30, 1); } return { hero: s.hero, sky: s.sky.heroSky }; });
        ok(went.hero === 'heron' && went.sky, `${w}px: back at the top, the heron crosses the picture`, JSON.stringify(went));
      } finally { await ses.close(); }
    }
  }

  console.log('\n  --- a page without a header picture ---');
  for (const w of [320, 390, 1280]) {
    /* Halloween as shipped: its scene and both its flyers are sky ones */
    const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.vigFirst = 300; cfg.heroFirst = [0.5, 0.6]; cfg.vigGap = 500; cfg.heroEvery = [0.5, 0.6]; cfg.forceHour = 12;
    const ses = await boot(cfg, w, { headerPic: false });
    const pg = ses.page;
    try {
      const r = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        for (let i = 0; i < 30 * 90; i++) { s.tick(1000 / 30, 1); }
        return { sky: s.sky, vigs: s.vigLog.length, heroes: s.heroLog.length, canvas: !!document.querySelector('canvas.dcc-seasons-sky') };
      });
      ok(!r.sky.pic && !r.sky.vigs.length && !r.sky.heroes.length, `${w}px: no header picture, so no sky scene and no sky flyer in the rotation`, JSON.stringify(r.sky));
      ok(r.vigs === 0 && r.heroes === 0 && !r.canvas, `${w}px: 90 s on, none played and no sky canvas was made`, JSON.stringify(r));
    } finally { await ses.close(); }
  }
  {
    /* a water-line scene and the bass still play there (summer: gator,
     * float, mullet; fall fishing: the bass) */
    for (const [theme, hero] of [['summer_canal', ''], ['fall_fishing', 'bass']]) {
      const cfg = config([`--theme=${theme}`, '--placement=content', '--layering=front', '--density=16', '--diag']);
      cfg.vigFirst = 300; cfg.vigGap = 500; cfg.heroFirst = [0.5, 0.6]; cfg.heroEvery = [0.5, 0.6]; cfg.forceHour = 12;
      if (hero) { cfg.heroOnly = hero; cfg.vigFirst = 1e9; }
      const ses = await boot(cfg, 390, { headerPic: false });
      const pg = ses.page;
      try {
        await pg.waitForTimeout(800);
        const r = await pg.evaluate(() => {
          const s = window.DCCSeasonsEngine._state; s.manual(true);
          for (let i = 0; i < 30 * 40; i++) { s.tick(1000 / 30, 1); }
          return { vigs: s.vigLog.map(v => v.name), heroes: s.heroLog.map(h => h.kind) };
        });
        if (hero) { ok(r.heroes.includes('bass'), `no header picture: the bass still leaps (${r.heroes.length} leaps)`, JSON.stringify(r)); }
        else { ok(r.vigs.length > 0, `no header picture: the water-line scenes still play (${r.vigs.join(', ')})`, JSON.stringify(r)); }
      } finally { await ses.close(); }
    }
  }

  console.log('\n  --- the falling sprites still use the whole page ---');
  for (const w of [390, 1280]) {
    const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--subtle=off', '--diag']);
    cfg.vigOnly = 'witchmoon'; cfg.vigFirst = 300; cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; cfg.forceHour = 12;
    const ses = await boot(cfg, w);
    const pg = ses.page;
    try {
      await pg.waitForTimeout(800);
      /* scrolled well past the picture: the sprites are still all over
       * the screen, while the scene (still playing) is out of sight */
      await pg.evaluate(() => window.scrollTo(0, 900));
      await pg.waitForTimeout(100);
      const r = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        for (let i = 0; i < 30 * 3; i++) { s.tick(1000 / 30, 1); }
        const pic = document.getElementById('header-image-main-inside').getBoundingClientRect();
        const live = s.parts.filter(p => !p.dormant && p.alpha > 0.2 && p.y > 0 && p.y < innerHeight);
        const pc = document.querySelector('canvas.dcc-seasons-canvas'), g = pc.getContext('2d'), d = g.getImageData(0, 0, pc.width, pc.height).data;
        let lit = 0; for (let i = 3; i < d.length; i += 4) { if (d[i] > 30) { lit++; } }
        return { live: live.length, lit, picBottom: pic.bottom, vig: s.vig };
      });
      ok(r.live >= 3 && r.lit > 100 && r.picBottom < 0 && r.vig, `${w}px: scrolled past the picture, ${r.live} sprites still on screen while the scene plays out of sight`, JSON.stringify(r));
    } finally { await ses.close(); }
  }

  console.log('\n  --- the heron crosses the picture without landing; a short picture shrinks the scene ---');
  for (const w of [390, 1280]) {
    {
      const cfg = config(['--theme=classic', '--placement=content', '--layering=front', '--density=16', '--noparticles', '--subtle=off', '--diag']);
      cfg.heroOnly = 'heron'; cfg.heroFirst = [0.3, 0.31]; cfg.heroEvery = [0.3, 0.4]; cfg.vigFirst = 1e9; cfg.heronLand = 1; cfg.forceHour = 12;
      const ses = await boot(cfg, w);
      const pg = ses.page;
      try {
        const r = await pg.evaluate(() => {
          const s = window.DCCSeasonsEngine._state; s.manual(true);
          let n = 0, landed = 0, maxY = -1e9, minY = 1e9, sky = 0;
          for (let i = 0; i < 30 * 60; i++) {
            s.tick(1000 / 30, 1);
            const p = s.heroXY; if (!p) { continue; }
            n++; if (s.sky.heroSky) { sky++; }
            if (s.heron.st > 0) { landed++; }
            maxY = Math.max(maxY, p[1]); minY = Math.min(minY, p[1]);
          }
          return { n, sky, landed, minY, maxY, h: s.sky.h, crossings: s.heroLog.length };
        });
        ok(r.crossings >= 2 && r.sky === r.n && r.landed === 0, `${w}px: ${r.crossings} heron crossings in the picture, landing forced on, none landed`, JSON.stringify(r));
        ok(r.minY > 0 && r.maxY < r.h, `${w}px: it flies inside the picture's height (${r.minY.toFixed(0)}-${r.maxY.toFixed(0)} of ${r.h})`, JSON.stringify(r));
      } finally { await ses.close(); }
    }
    {
      const ses = await boot(scene(), w);
      const pg = ses.page;
      try {
        await pg.addStyleTag({ content: '#header-image-main-inside{height:220px!important}' });
        const r = await pg.evaluate(() => {
          const s = window.DCCSeasonsEngine._state; s.manual(true);
          for (let i = 0; i < 600 && !s.vig; i++) { s.tick(1000 / 30, 1); }
          let top = 1e9, bot = -1e9, MR = 0, my = 0, W = 0, h = s.sky.h;
          for (let i = 0; i < 30 * 12 && s.vig; i++) {
            s.tick(1000 / 30, 1);
            const v = s.vigSt; if (!v) { break; } MR = v.MR; my = v.my; W = v.W;
            if (v.wx != null && v.wx > 0 && v.wx < s.sky.w) { top = Math.min(top, v.wy - 0.5 * v.W); bot = Math.max(bot, v.wy + 0.3 * v.W); }
          }
          h = s.sky.h;
          return { h, MR, my, W, top, bot };
        });
        ok(r.h === 220 && r.my - r.MR >= 0 && r.my + r.MR <= r.h, `${w}px, a 220 px picture: the moon fits (r ${r.MR}, centre ${r.my.toFixed(0)})`, JSON.stringify(r));
        ok(r.top >= -4 && r.bot <= r.h + 4, `${w}px, a 220 px picture: so does the witch's swoop (${r.top.toFixed(0)}-${r.bot.toFixed(0)}, witch ${r.W} px)`, JSON.stringify(r));
      } finally { await ses.close(); }
    }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
