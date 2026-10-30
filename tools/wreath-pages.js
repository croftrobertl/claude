'use strict';
/**
 * DCC Seasons — 4.14.2: where the wreath goes on pages OTHER than the home
 * page, two options for Rob, one image each. On the home page it is his B
 * (under the tagline); on other pages the 4.14.1 corner sat on the menu bar
 * and button, and a top-right place below the bar meets the team's crossing
 * (it flies at the moon's height, under the bar), so both options keep the
 * upper sky free:
 *   A  the picture's bottom-right corner, 8 px in;
 *   B  centred under the page title, as the home page's is under its tagline.
 * Drawn by the real engine (CFG.wrPage, debug builds only) on the real theme
 * with the home page's title and tagline taken off (another page), the
 * sleigh caught mid-crossing on the mocked clock.
 *
 *   node tools/wreath-pages.js -> build/Seasons - 4.14.2 wreath other pages <A|B>.png
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { config, open, ROOT } = require('./harness');
const rt = require('./real-theme');
const OUT = path.join(ROOT, 'build');
const S = '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad';

async function shot(w, opt) {
  const cfg = config(['--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.date = '2026-12-15'; cfg.forceHour = 12; cfg.wrPage = opt.toLowerCase();
  cfg.vigOnly = 'sleighmoon'; cfg.vigFirst = 4000; cfg.vigGap = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
  const html = rt.page({ config: cfg }).replace(/<body([^>]*) class="home /, '<body$1 class="').replace(/<p class="byline"[\s\S]*?<\/p>/, '').replace('itemprop="headline">DORA CANAL COURT<', 'itemprop="headline">Contact Us<');
  const ses = await open(html, { viewport: { width: w, height: w < 768 ? 844 : 900 }, dsf: 2, ...rt.opts(w),
    init: 'Math.random = (() => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();' });
  const pg = ses.page;
  try {
    await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} #dcc-seasons-diag,.dcc-seasons-diag{display:none!important}' });
    await pg.waitForFunction(() => { const s = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state; return s && s.wreath.stat.placed > 0 && s.vig === 'sleighmoon'; }, null, { timeout: 40000, polling: 200 });
    const info = await pg.evaluate(() => {
      const s = window.DCCSeasonsEngine._state; s.manual(true);
      for (let i = 0; i < 600 && s.vig === 'sleighmoon'; i++) { s.tick(1000 / 30, 1); const st = s.vigSt; if (st && st.x != null && Math.abs(st.x - s.sky.w * 0.45) < 30) { break; } }
      return { wr: s.wreath.box, mode: s.wreath.stat.mode, moon: s.sleigh.scene && [s.sleigh.scene.mx, s.sleigh.scene.my, s.sleigh.scene.MR] };
    });
    await pg.waitForTimeout(300); await pg.evaluate(() => window.DCCSeasonsEngine._state.tick(1, 1)); await pg.waitForTimeout(150);
    const b64 = (await pg.screenshot({ clip: { x: 0, y: 0, width: w, height: 420 } })).toString('base64');
    return { b64, info };
  } finally { await ses.close(); }
}

(async () => {
  const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1500, height: 900 } });
  const TXT = {
    A: ['Option A: The Bottom-Right Corner', 'On every page but the home page, the wreath sits in the header picture\'s bottom-right corner, 8 px in, at 96 px where it fits. The top of the picture stays free for Santa\'s team, which crosses the whole width at the moon\'s height. It scrolls away with the picture.'],
    B: ['Option B: Centered Under the Page Title', 'On every page but the home page, the wreath is centered under the page title, halfway between the title and the foot of the picture, as on the home page it is under the tagline. 96 px where it fits, smaller where the title runs to two lines. The top of the picture stays free for Santa\'s team. It scrolls away with the picture.'],
  };
  for (const opt of ['A', 'B']) {
    const s = {};
    for (const w of [390, 768, 1440]) { s[w] = await shot(w, opt); console.log(opt, w, JSON.stringify(s[w].info)); }
    const img = (w, px) => `<figure><img src="data:image/png;base64,${s[w].b64}" style="width:${px}px"><figcaption>${w} px · the wreath ${Math.round(s[w].info.wr[2] - s[w].info.wr[0])} px wide</figcaption></figure>`;
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#FBF6EC;font:14px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:20px 24px}
      h1{font-size:22px;text-align:center;margin:0 0 6px} p{text-align:center;max-width:980px;margin:0 auto 14px;color:#555}
      .row{display:flex;gap:18px;justify-content:center;align-items:flex-start;flex-wrap:wrap;margin-top:10px} figure{margin:0;text-align:center}
      figcaption{color:#666;font-size:12px;margin-top:4px} img{display:block;border:1px solid #D9CDB6;border-radius:3px}</style>
      <h1>Seasons 4.14.2 — The Wreath on Other Pages: ${TXT[opt][0]}</h1><p>${TXT[opt][1]}</p>
      <p>The home page keeps Rob's B, under "Family Owned &amp; Run Since 1971". Shown on the real theme with the page title, Santa's team caught mid-crossing.</p>
      <div class="row">${img(390, 300)}${img(768, 560)}</div><div class="row">${img(1440, 1100)}</div>`;
    const f = path.join(S, `wp-${opt}.html`); fs.writeFileSync(f, html);
    await pg.goto('file://' + f); await pg.waitForTimeout(500);
    await pg.screenshot({ path: path.join(OUT, `Seasons - 4.14.2 wreath other pages ${opt}.png`), fullPage: true });
  }
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
