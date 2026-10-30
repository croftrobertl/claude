'use strict';
/**
 * DCC Seasons — the 4.13.5 review sheet for Rob's fixes (2026-10-30), from
 * the shipped art:
 *  1 the rings, linked (before / after, large, at guest size on the header
 *    photograph and the navy footer);
 *  2 the hearts, sharper (before / after, large; the squint test at 390
 *    beside a plain circle of the same size, sharp and blurred);
 *  3 the egg's heart at 390, 768 and 1440 (tools/test-anniversary.js
 *    writes the shots with DCC_EGG_SHOTS);
 *  4 the leap's near wing beside its photograph;
 *  5 the Anniversary on the real home page at 390, 768 and 1440, mid-dance.
 *
 *   node tools/anniv-fixes-sheet.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { config, open } = require('./harness');
const rt = require('./real-theme');
const { rings } = require('./anniv-rings');
const { P } = require('./anniv-pieces');

const B = path.join(__dirname, '..', 'build');
const S = '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad';
const OLD_HEART = 'M12 21.6 C9 19 2.2 14 2.2 8 C2.2 4.4 4.8 2.2 7.6 2.2 C9.6 2.2 11.1 3.4 12 5 C12.9 3.4 14.4 2.2 16.4 2.2 C19.2 2.2 21.8 4.4 21.8 8 C21.8 14 15 19 12 21.6 Z';
const OLD_RINGS = require('child_process').execFileSync('git', ['show', 'b76051f:tools/anniv-pieces.js'], { encoding: 'utf8' });
const u = r => { const c = r.indexOf('|'); const [w, h] = r.slice(0, c).split(' '); return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${r.slice(c + 1)}</svg>`); };
const png = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

(async () => {
  /* the old rings and heart, from the 4.13.4 sources */
  const oldMod = { exports: {} };
  new Function('module', 'require', OLD_RINGS.replace(/if \(require\.main === module\)[\s\S]*$/, ''))(oldMod, require);
  const oldP = oldMod.exports.P;
  const newHeart = P.heartA, oldHeart = oldP.heartA, newRings = rings('dccAnR'), oldRings = oldP.ringB;
  const circle = '24 23|<circle cx="12" cy="11.6" r="10" fill="#E8838F" stroke="#B9505F" stroke-width=".5"/>';

  /* 5: the real home page, the Anniversary, mid-dance */
  const wide = {};
  for (const w of [390, 768, 1440]) {
    const cfg = config(['--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.date = '2026-11-11'; cfg.forceHour = 12; cfg.vigOnly = 'annivdance'; cfg.vigFirst = 3000; cfg.heroFirst = [9999, 10000];
    const ses = await open(rt.page({ config: cfg }), { viewport: { width: w, height: w < 768 ? 844 : 900 }, dsf: 2, ...rt.opts(w), init: 'Math.random = (() => { let a = 5; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();' });
    const pg = ses.page;
    try {
      await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} #dcc-seasons-diag,.dcc-seasons-diag{display:none!important}' });
      await pg.waitForFunction(() => { const s = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state; return s && s.anniv.done && s.anniv.plan && !s.anniv.plan.none; }, null, { timeout: 40000, polling: 200 });
      await pg.evaluate(() => { const s = window.DCCSeasonsEngine._state; s.manual(true); for (let i = 0; i < 900 && s.vig !== 'annivdance'; i++) { s.tick(1000 / 30, 1); } for (let i = 0; i < 30 * 3.1; i++) { s.tick(1000 / 30, 1); } });
      await pg.waitForTimeout(500); await pg.evaluate(() => window.DCCSeasonsEngine._state.tick(1, 1)); await pg.waitForTimeout(100);
      wide[w] = 'data:image/png;base64,' + (await pg.screenshot({ clip: { x: 0, y: 0, width: w, height: w < 768 ? 640 : 560 } })).toString('base64');
      /* and the pair close up: the plan's boxes, in the picture's px */
      const bx = await pg.evaluate(() => { const p = window.DCCSeasonsEngine._state.anniv.plan.boxes, r = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [Math.min(p[0][0], p[1][0]) + r.left, Math.min(p[0][1], p[1][1]) + r.top, Math.max(p[0][2], p[1][2]) + r.left, Math.max(p[0][3], p[1][3]) + r.top]; });
      const pad = 10;
      wide[w + 'c'] = 'data:image/png;base64,' + (await pg.screenshot({ clip: { x: bx[0] - pad, y: bx[1] - pad, width: bx[2] - bx[0] + 2 * pad, height: bx[3] - bx[1] + 2 * pad } })).toString('base64');
      wide[w + 'cw'] = (bx[2] - bx[0] + 2 * pad) * 3;
    } finally { await ses.close(); }
  }

  const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1400, height: 900 } });
  /* the squint: the hearts and the circle at guest size, then blurred */
  const squint = (b, blur) => `<span class="sq" style="${blur ? 'filter:blur(1.4px)' : ''}"><img src="${u(b)}" height="24"></span>`;
  const head = (t, sub) => `<h2>${t}</h2><p class="sub">${sub}</p>`;
  const egg = [390, 768, 1440].map(w => `<figure><img src="${png(path.join(S, 'egg', `egg-${w}.png`))}" height="420"><figcaption>${w} px</figcaption></figure>`).join('');
  const html = `<!doctype html><meta charset=utf-8><style>
    body{margin:0;background:#f6f3ee;font:14px/1.45 -apple-system,Segoe UI,sans-serif;color:#222;padding:0 20px 30px}
    h1,h2{text-align:center;margin:0} h1{font-size:26px;padding:24px 0 4px} h2{font-size:21px;margin:30px 0 4px}
    p.sub{text-align:center;max-width:980px;margin:4px auto 10px;color:#555}
    .row{display:flex;gap:24px;justify-content:center;align-items:flex-end;flex-wrap:wrap}
    figure{margin:0;text-align:center} figcaption{color:#666;font-size:12px;margin-top:4px}
    .guest{display:inline-flex;gap:14px;align-items:center;padding:16px 22px;border-radius:4px}
    .photo{background:#3d4a39} .navy{background:#0f2440} .sq{display:inline-block;background:#3d4a39;padding:10px 14px}
    img{display:block;margin:0 auto}</style><body>
    <h1>The Anniversary: Rob's Fixes</h1>
    <p class="sub">The pieces as they ship in 4.13.5, beside how they were.</p>
    ${head('1 · The Rings, Linked', 'One band lies tilted toward you; the other stands up through its opening. It passes in front of the lying band’s far rim and behind its near rim, so each ring goes through the other’s opening, and at each crossing you can see which is in front.')}
    <div class="row"><figure><img src="${u(oldRings)}" height="180"><figcaption>before: side by side, through each other’s walls</figcaption></figure>
      <figure><img src="${u(newRings)}" height="200"><figcaption>after: linked</figcaption></figure>
      <figure><span class="guest photo"><img src="${u(newRings)}" height="27"></span><figcaption>guest size, over the header photograph</figcaption></figure>
      <figure><span class="guest navy"><img src="${u(newRings)}" height="27"></span><figcaption>over the navy footer</figcaption></figure></div>
    ${head('2 · The Hearts, Sharper', 'A deeper cleft between the lobes and a sharp point at the bottom. The squint test at 390: each at the size it falls (24 px), sharp and then blurred, beside a plain circle of the same size.')}
    <div class="row"><figure><img src="${u(oldHeart)}" height="180"><figcaption>before</figcaption></figure><figure><img src="${u(newHeart)}" height="180"><figcaption>after</figcaption></figure>
      <figure><div class="row" style="gap:6px">${squint(oldHeart)}${squint(newHeart)}${squint(circle)}</div><div class="row" style="gap:6px;margin-top:6px">${squint(oldHeart, 1)}${squint(newHeart, 1)}${squint(circle, 1)}</div><figcaption>before · after · a circle; sharp, then squinted</figcaption></figure></div>
    ${head('3 · The Egg Ends on a Heart', 'Gold and blush rain gathers into a heart, centered, with clear margin all round, at every width. Measured: 20% / 34% margin at 390, 21% / 22% at 768, 32% / 16% at 1440 (left-right / top-bottom).')}
    <div class="row">${egg}</div>
    ${head('4 · The Leap’s Near Wing', 'The primaries taper to dark points and separate into fingers; the coverts are soft and irregular, with no outline round each feather, the pale leading edge and the rust kept.')}
    <div class="row"><figure><img src="${png(path.join(B, 'Seasons - 4.13.5 crane wing close-up.png'))}" width="1100"><figcaption>the photograph · the drawing · the calling bird's wing below</figcaption></figure></div>
    ${head('5 · On the Home Page', 'The Anniversary at 390, 768 and 1440: the pieces falling, the pair dancing under the tagline.')}
    <div class="row">${[390, 768, 1440].map(w => `<figure><img src="${wide[w]}" width="${w === 1440 ? 760 : w === 768 ? 420 : 300}"><figcaption>${w} px</figcaption></figure>`).join('')}</div>
    <div class="row" style="margin-top:14px">${[390, 768, 1440].map(w => `<figure><img src="${wide[w + 'c']}" width="${Math.round(wide[w + 'cw'])}"><figcaption>the pair at ${w} px, 3× close-up</figcaption></figure>`).join('')}</div>
    </body>`;
  const f = path.join(S, 'fixes.html'); fs.writeFileSync(f, html);
  await pg.goto('file://' + f); await pg.waitForTimeout(800);
  const out = path.join(B, 'Seasons - 4.13.5 anniversary fixes.png');
  await pg.screenshot({ path: out, fullPage: true });
  await br.close();
  console.log(out);
})().catch(e => { console.error(e); process.exit(1); });
