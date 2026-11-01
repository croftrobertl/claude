'use strict';
/**
 * DCC Seasons — the holiday release's review sheets (4.14.4): per theme, the
 * fixes before and after (guest size and 3x), every falling piece and
 * variant at guest size on the header photo, a white page and the navy
 * footer, the corner accent, and the numbered options with a still from
 * each option's clip. Before = 4.14.3 as live (git ebab72e); after = the
 * working packs. Clips come from tools/holiday-clip.js.
 *
 *   node tools/holiday-sheet.js   -> build/Seasons - 4.14.4 <theme> sheet.png
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), B = path.join(ROOT, 'build'), BASE = 'ebab72e';
const J = n => path.join(ROOT, 'dcc-seasons/assets/js', n);
const OLD = n => execFileSync('git', ['show', `${BASE}:dcc-seasons/assets/js/${n}`], { cwd: ROOT, encoding: 'utf8' });
const png = f => 'data:image/png;base64,' + fs.readFileSync(path.join(B, f)).toString('base64');
const SCR = process.env.DCC_SCRATCH || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad';

const CSS = `body{margin:0;background:#FBF6EC;font:15px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:22px 26px;width:1500px}
h1{font-size:26px;text-align:center;margin:0 0 4px} h2{font-size:20px;text-align:center;margin:26px 0 6px;border-top:1px solid #e2d8c6;padding-top:16px}
p.sub,p.n{text-align:center;max-width:1180px;margin:0 auto 12px;color:#555} .row{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;align-items:flex-start}
.card{background:#fff;border-radius:6px;padding:10px 12px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.08)} .card b{display:block;margin-bottom:6px}
.pair{display:flex;gap:10px;align-items:flex-end;justify-content:center} .pair div{display:flex;flex-direction:column;align-items:center;font-size:12px;color:#666}
.ph{background-size:cover;background-position:center;padding:10px} .nv{background:#1B2B45} .wh{background:#fff} .lt{background:#F3EDE2}
.opt{background:#fff;border-radius:6px;padding:10px;width:300px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.08)} .opt img{width:280px;border-radius:4px}
.opt .num{display:inline-block;background:#0f6dbf;color:#fff;border-radius:12px;padding:1px 10px;font-weight:700;margin-bottom:4px} .opt small{display:block;color:#666;font-size:12px;margin-top:4px}
table.g td{padding:8px 10px;text-align:center;vertical-align:bottom;font-size:12px;color:#555} table.g{margin:0 auto}`;

async function sprites(pg, srcs) {
  return pg.evaluate(srcs => {
    const out = {};
    for (const [tag, list] of Object.entries(srcs)) {
      const W = {}; for (const s of list) { new Function('window', s)(W); }
      const S = Object.assign({}, ...Object.values(W.DCCSeasonsArt).map(p => p.svgs || {}));
      out[tag] = {};
      for (const k of Object.keys(S)) { let v = S[k]; if (typeof v === 'function') { try { v = v(); } catch (e) { continue; } } if (typeof v !== 'string') { continue; }
        const c = v.indexOf('|'), [w, h] = v.slice(0, c).split(' ');
        out[tag][k] = { u: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${v.slice(c + 1)}</svg>`), r: h / w }; }
    }
    return out;
  }, srcs);
}
async function shoot(pg, html, out) {
  const f = path.join(SCR, 'hol', 'sheet.html'); fs.writeFileSync(f, `<!doctype html><meta charset="utf-8"><style>${CSS}</style>${html}`);
  await pg.goto('file://' + f); await pg.waitForTimeout(700);
  await pg.screenshot({ path: path.join(B, out), fullPage: true }); console.log(out);
}
(async () => {
  const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1552, height: 900 }, deviceScaleFactor: 2 });
  await pg.goto('about:blank');
  const SP = await sprites(pg, { old: [OLD('art-thanksgiving.js'), OLD('art-christmas.js')], neu: [fs.readFileSync(J('art-thanksgiving.js'), 'utf8'), fs.readFileSync(J('art-christmas.js'), 'utf8')] });
  const img = (tag, k, h) => `<img src="${SP[tag][k].u}" style="height:${h}px">`;
  require('child_process').spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(B, 'Seasons - 4.14.4 option A1 A2 the tom.png'), '-vf', 'crop=780:220:0:612', path.join(B, '.hdr-390.png')]);
  const photo = png('.hdr-390.png');
  const ba = (k, h, label, note) => `<div class="card"><b>${label}</b><div class="pair">
      <div class="lt" style="padding:8px">${img('old', k, h * 3)}before, 3×</div><div class="lt" style="padding:8px">${img('neu', k, h * 3)}after, 3×</div>
      <div class="ph" style="background-image:url(${photo})">${img('old', k, h)}<br><span style="color:#fff">before</span></div><div class="ph" style="background-image:url(${photo})">${img('neu', k, h)}<br><span style="color:#fff">after</span></div></div>
      <p class="n" style="font-size:13px;max-width:560px">${note}</p></div>`;
  const field = (keys, h) => `<table class="g"><tr>${keys.map(k => `<td>${k[1]}</td>`).join('')}</tr>
      ${[['ph', ''], ['wh', ''], ['nv', '']].map(([c]) => `<tr>${keys.map(k => `<td class="${c}" ${c === 'ph' ? `style="background-image:url(${photo})"` : ''}>${img('neu', k[0], k[2] || h)}</td>`).join('')}</tr>`).join('')}</table>`;
  const opt = (num, title, still, clip, note) => `<div class="opt"><span class="num">${num}</span><b>${title}</b>${still ? `<img src="${png(still)}">` : ''}<small>${note}</small><small><i>${clip}</i></small></div>`;

  /* ---------------- Thanksgiving ---------------- */
  let h = `<h1>Seasons 4.14.4 — Thanksgiving</h1>
  <p class="sub">Rob's Thanksgiving corrections. The three fixes are drawn and shown before and after; the scene and the background layer are options for Rob to pick, numbered. Every clip is the real engine on the real home page at 390, 6 seconds.</p>
  <h2>The Fixes</h2><div class="row">
  ${ba('leafm', 30, 'Red Maple Leaf', 'The stem was far too long. Now it is the short stub the photographed red maple leaf shows (about a tenth of the leaf\'s width), a little thicker at the base.')}
  ${ba('leafm2', 30, 'The Turning Maple Leaf', 'The same leaf mid-turn, so it takes the same short stem.')}
  ${ba('corn', 32, 'Indian Corn', 'Multicolored maize: the kernels in the calico colors of the Indian corn plate in Ward\'s Encyclopedia of Food (1911, public domain), cream, gold, orange, red, maroon, slate blue and purple, laid in the same straight rows. The cornucopia\'s ear changes with it.')}
  ${ba('cornucopia', 56, 'Cornucopia (Corner Accent)', 'The horn was a long, thin cone. Now it is a real basket\'s shape: full in the body, curling to a point. The produce is unchanged. If Rob meant one of the gourds spilling out of it rather than the horn itself, he can say which.')}
  </div>
  <h2>Every Falling Piece, at Guest Size</h2><p class="n">On the header photo, a white page and the navy footer. The tom walks with his two poults along the bottom of the screen.</p>
  ${field([['leafm', 'Red maple'], ['leafm2', 'Turning maple'], ['leafs', 'Sweetgum'], ['leafo', 'Live oak'], ['leafc', 'Cypress'], ['gourd1', 'Pumpkin'], ['gourd3', 'Green gourd'], ['corn', 'Indian corn'], ['cranberry', 'Cranberries'], ['acorn', 'Acorn'], ['pie', 'Pie'], ['cornucopia', 'Cornucopia (accent)', 48]], 30)}
  <h2>Option A — The Scene</h2><p class="n">Rob: the scene should be the strutting tom and his poults, not the cranes across the full moon, and the cranes were far too fast. Pick one.</p><div class="row">
  ${opt('A1', 'The Tom, Always Walking', 'Seasons - 4.14.4 option A1 A2 the tom.png', 'Seasons - 4.14.4 option A1 A2 the tom.mp4', 'The tom and poults walk along the bottom of the screen on every page, as now, and nothing plays in the header picture. The cranes and the moon leave Thanksgiving (they stay the Anniversary\'s).')}
  ${opt('A2', 'The Tom as the Scene', '', 'Same clip as A1', 'The tom and poults come in at the scene\'s moment (6-10 seconds after the page opens, then every 60-90 seconds), walk across, stop to feed and walk off. Between visits he is not on screen. The cranes leave Thanksgiving.')}
  ${opt('A3', 'A1, and the Cranes at Half Speed', 'Seasons - 4.14.4 option A3 cranes half speed.png', 'Seasons - 4.14.4 option A3 cranes half speed.mp4', 'The tom as A1, and the cranes still cross the full moon in the header picture, now at half the speed (about 7 seconds across a phone instead of 3.4).')}
  </div>
  <h2>Option B — The Background Layer</h2><p class="n">Rob: autumn leaves gently falling. Both use the theme's own drawn leaves (red maple, turning maple, sweetgum, live oak), behind every piece, slow and few.</p><div class="row">
  ${opt('B1', 'Small and Clear', 'Seasons - 4.14.4 option B1 background leaves.png', 'Seasons - 4.14.4 option B1 background leaves.mp4', 'Small leaves (12-16 px), faint, as if far off.')}
  ${opt('B2', 'Larger and Soft', 'Seasons - 4.14.4 option B2 background leaves.png', 'Seasons - 4.14.4 option B2 background leaves.mp4', 'Larger leaves (22-30 px), out of focus, as if close to the eye.')}
  </div>`;
  await shoot(pg, h, 'Seasons - 4.14.4 thanksgiving sheet.png');

  /* ---------------- Christmas ---------------- */
  h = `<h1>Seasons 4.14.4 — Christmas</h1>
  <p class="sub">Rob's Christmas corrections. The gift drop and the falling gift's paper are options, numbered; the ornament colors are a fix. Every clip is the real engine on the real home page at 390, 6 seconds.</p>
  <h2>The Fix — Every Ornament Color</h2><p class="n">The Preview tab shows red, gold and blue in turn since 4.14.3. On a guest's page each new ornament now takes the color least on screen, so red, gold and blue all appear whenever three or more hang (a phone shows one or two at a time).</p>
  <div class="row"><div class="card"><b>Red, Gold and Blue</b>${img('neu', 'ballred', 84)} ${img('neu', 'ballgold', 84)} ${img('neu', 'ballblue', 84)}</div></div>
  <h2>Option C — The Gift Drop</h2><p class="n">Rob: drop more than one gift, so it is the showpiece. In both, the old cut-out sleigh is replaced by Rob's approved Santa and four reindeer (one Santa, as everywhere else), flying under the menu and over the title; each present opens a parachute, drifts down clear of the wreath and settles at the foot of the picture, then fades. No ripple (Rob's standing rule). The presents are red, blue and green paper with gold ribbon.</p><div class="row">
  ${opt('C1', 'Three Presents', 'Seasons - 4.14.4 option C1 gift drop 3.png', 'Seasons - 4.14.4 option C1 gift drop 3.mp4', 'One of each paper.')}
  ${opt('C2', 'Five Presents', 'Seasons - 4.14.4 option C2 gift drop 5.png', 'Seasons - 4.14.4 option C2 gift drop 5.mp4', 'A fuller drop across the picture.')}
  </div><div class="row" style="margin-top:10px"><div class="card"><b>The Dropped Presents</b>${img('neu', 'giftred', 60)} ${img('neu', 'gift', 60)} ${img('neu', 'giftgreen', 60)}</div></div>
  <h2>Option D — The Falling Gift's Paper</h2><p class="n">Rob: a different wrapping paper from the dropped presents, so the pieces are not bland. Shown at 3× and at guest size (26 px) on the header photo.</p><div class="row">
  ${['giftf1', 'giftf2', 'giftf3'].map((k, i) => `<div class="opt"><span class="num">D${i + 1}</span><b>${['Candy Stripe, Green Ribbon', 'Gold with Dots, Red Ribbon', 'Holiday Plaid, Gold Ribbon'][i]}</b><div class="lt" style="padding:8px">${img('neu', k, 90)}</div><div class="ph" style="background-image:url(${photo})">${img('neu', k, 26)}</div></div>`).join('')}
  </div>
  <h2>Every Falling Piece, at Guest Size</h2><p class="n">With D1 in the gift's place for the picture; the corner accent is the wreath under the tagline, unchanged. No background layer (Rob's pick).</p>
  ${field([['ballred', 'Red ball'], ['ballgold', 'Gold ball'], ['ballblue', 'Blue ball'], ['holly', 'Holly'], ['candycane', 'Candy cane'], ['giftf1', 'Gift (D1)'], ['pine', 'Pine', 36], ['palmxmas', 'Palm', 38], ['flamingoxmas', 'Flamingo', 42], ['wreath', 'Wreath (accent)', 60]], 28)}`;
  await shoot(pg, h, 'Seasons - 4.14.4 christmas sheet.png');
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
