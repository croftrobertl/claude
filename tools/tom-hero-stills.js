'use strict';
/**
 * DCC Seasons 4.17.0: stills of the tom group on the header picture's foot
 * at a chosen size (size 32 x sc), on the real-theme fixture (home, or a
 * page title), with the gap to the nearest word measured from the drawn
 * ink. For Rob's size options when the largest draw reaches the words.
 *
 *   node tools/tom-hero-stills.js --cases='[["home",320,1.4],["Contact Us",1024,1.2]]' --dir=<out dir> [--tag=now]
 */
const fs = require('fs');
const path = require('path');
const { config, open } = require('./harness');
const rt = require('./real-theme');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const CASES = JSON.parse(arg('cases')), DIR = arg('dir'), TAG = arg('tag', 'still');
(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const out = [];
  for (const [title, w, sc] of CASES) {
    const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.forceHour = 12; cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.gate = false; cfg.opacity = 0.7;
    let html = rt.page({ config: cfg, extraHead: '<style>.dcc-wx-banner,div[style*="2147482000"]{display:none!important}</style>' });
    if (title !== 'home') { html = html.replace(/<body([^>]*) class="home /, '<body$1 class="').replace(/<p class="byline"[\s\S]*?<\/p>/, '').replace('itemprop="headline">DORA CANAL COURT<', 'itemprop="headline">' + title + '<'); }
    const ses = await open(html, { ...rt.opts(w), viewport: { width: w, height: w < 768 ? 844 : 900 }, dsf: 2, init: 'Math.random=(()=>{let a=14;return()=>{a=(a*16807)%2147483647;return a/2147483647}})();' });
    const pg = ses.page;
    await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 90000, polling: 200 });
    const kc = await rt.keepClear(pg);
    const gap = await pg.evaluate(({ kc, sc }) => {
      const S = window.DCCSeasonsEngine._state; S.manual(true);
      const p = S.parts.find(q => q.b === 'forage'); p.size = 32; p.sc = sc; p.hl = 0;
      for (let i = 0; i < 30 * 4; i++) { S.tick(1000 / 30, 1); }
      document.querySelectorAll('canvas').forEach(c => { c.style.opacity = ''; });
      const R = Object.values(kc).flat(), c = document.querySelector('canvas.dcc-seasons-ground'), cr = c.getBoundingClientRect(), k = c.width / cr.width, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let worst = 1e9;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { if (d[(y * c.width + x) * 4 + 3] < 24) continue; const vx = cr.left + x / k, vy = cr.top + y / k;
        for (const b of R) { const dd = Math.max(b[0] - vx, 0, vx - b[2], b[1] - vy, vy - b[3]); if (dd < worst) worst = dd; } }
      return Math.round(worst); }, { kc, sc });
    const pic = await pg.evaluate(() => { const r = document.querySelector('#header-image-main-inside').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
    const cw = w < 768 ? w : Math.min(w, 820), clip = { x: pic[2] - cw, y: w < 768 ? 240 : 120, width: cw, height: pic[3] - (w < 768 ? 240 : 120) + 12 };
    const file = path.join(DIR, `${TAG}_${title.replace(/\W+/g, '')}_${w}.jpg`);
    await pg.screenshot({ path: file, clip, type: 'jpeg', quality: 86 });
    out.push({ title, w, sc, gap, file: path.basename(file) }); console.log(JSON.stringify(out[out.length - 1]));
    await ses.close();
  }
  fs.writeFileSync(path.join(DIR, TAG + '.json'), JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
