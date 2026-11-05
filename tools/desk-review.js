'use strict';
/**
 * DCC Seasons — 4.16.1's review stills: the foot of the real home page at a
 * width, Thanksgiving on the mocked clock (seed 14, 8 s in), from a build's js
 * folder; then a before/after sheet.
 *
 *   node tools/desk-review.js --before=<js dir> --after=<js dir> --out="<file.png>" [--widths=390,1440,1920]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const WIDTHS = arg('widths', '390,1440,1920').split(',').map(Number), OUT = arg('out', 'Seasons - review.png');
const TMP = path.join(path.dirname(path.resolve(OUT)), '.desk-' + process.pid);
fs.mkdirSync(TMP, { recursive: true });

/* one still, in its own process so each build loads its own js folder */
if (arg('one', '')) {
  const { config, open } = require('./harness'); const rt = require('./real-theme');
  (async () => {
    const w = +arg('one'), H = w < 768 ? 844 : 900, BAND = w < 768 ? 240 : 300;
    const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.forceHour = 12; cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1]; cfg.opacity = 0.7;   /* live's sprite opacity */
    const ses = await open(rt.page({ config: cfg, extraHead: '<style>.dcc-wx-banner,.dcc-seasons-diag,div[style*="2147482000"]{display:none!important}</style>' }), { ...rt.opts(w), viewport: { width: w, height: H }, dsf: 2, init: 'Math.random=(()=>{let a=14;return()=>{a=(a*16807)%2147483647;return a/2147483647}})();' });
    const pg = ses.page;
    await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 90000, polling: 200 });
    const info = await pg.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.manual(true); for (let i = 0; i < 30 * 8; i++) { S.tick(1000 / 30, 1); } const c = document.querySelector('canvas.dcc-seasons-canvas'); c.style.opacity = ''; const t = S.calm.tom[0]; return t && t.geo ? { th: +t.geo.th.toFixed(1), tw: +t.geo.tw.toFixed(1) } : null; });
    /* a desktop row shows the right-hand 700 px, where he stands */
    const cw = w < 768 ? w : 700;
    await pg.screenshot({ path: arg('file'), clip: { x: w - cw, y: H - BAND, width: cw, height: BAND } });
    console.log(JSON.stringify(info));
    await ses.close();
  })().catch(e => { console.error(e); process.exit(1); });
} else {
  const rows = [];
  for (const w of WIDTHS) {
    const row = { w, cells: [] };
    for (const [label, dir] of [['Before (4.16.0)', arg('before')], ['After (4.16.1)', arg('after')]]) {
      const file = path.join(TMP, `${w}-${label[0]}.png`);
      const info = JSON.parse(execFileSync('node', [__filename, '--one=' + w, '--file=' + file], { env: Object.assign({}, process.env, { DCC_ASSETS: dir }), encoding: 'utf8' }).trim().split('\n').pop());
      row.cells.push({ label, file, info });
    }
    rows.push(row);
  }
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#FBF6EC;font:15px system-ui,sans-serif;color:#2b2b2b;width:1500px}h1{text-align:center;font-size:22px;margin:0 0 6px}p.s{text-align:center;margin:0 0 18px;color:#555}h2{font-size:17px;margin:22px 0 8px}.r{display:flex;gap:16px}.c{flex:1}.c img{width:100%;border:1px solid #E3D9C6;border-radius:4px;display:block}.c b{display:block;margin:4px 0}</style>
<h1>Seasons 4.16.1 · The Tom on a Desktop, Before and After</h1><p class="s">The foot of the home page, Thanksgiving, the same visit (seed 14) 8 s in, live's sprite opacity (0.7). After: twice the size from 1024 px up, and fully opaque; the falling pieces keep their opacity.</p>` +
    rows.map(r => `<h2>${r.w} px${r.w < 1024 ? ' (a phone: the size must not change)' : ' (the right-hand 700 px, where he stands)'}</h2><div class="r">${r.cells.map(c => `<div class="c"><b>${c.label}${c.info ? ` · the tom ${c.info.th} px tall` : ''}</b><img src="data:image/png;base64,${fs.readFileSync(c.file).toString('base64')}"></div>`).join('')}</div>`).join('');
  (async () => {
    const br = await require('playwright').chromium.launch(); const p = await br.newPage({ viewport: { width: 1548, height: 900 } });
    await p.setContent(html); await p.waitForTimeout(400); await p.screenshot({ path: OUT, fullPage: true }); await br.close();
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log(JSON.stringify(rows.map(r => ({ w: r.w, before: r.cells[0].info, after: r.cells[1].info }))));
  })().catch(e => { console.error(e); process.exit(1); });
}
