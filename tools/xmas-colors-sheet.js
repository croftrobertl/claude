'use strict';
/**
 * DCC Seasons — 4.14.2: Rob's color fixes from the style test, before and
 * after, at guest size and at 3x. Before is art-christmas.js as 4.14.1
 * shipped it (git), after is the working file; the drawings are the files'
 * own, nothing redrawn here.
 *   the pine's shading: black -> its own dark cool green (#0E3A2A)
 *   the candy cane's white stripes and the flamingo's hat brim: #FFFFFF -> #F6F4EE
 *   Santa's hat cone and the sleigh's lower band: black -> the red's own
 *   darker, cooler tone (rgba(74,14,36))
 *
 *   node tools/xmas-colors-sheet.js -> build/Seasons - 4.14.2 christmas colors.png
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const BASE = process.env.DCC_COLORS_BASE || 'e8db5eb';   /* 4.14.1 as shipped (live) */
const OLD = execFileSync('git', ['show', `${BASE}:dcc-seasons/assets/js/art-christmas.js`], { cwd: ROOT, encoding: 'utf8' });
const NEW = fs.readFileSync(path.join(ROOT, 'dcc-seasons/assets/js/art-christmas.js'), 'utf8');
const S = '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad';

(async () => {
  const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  await pg.setContent('<!doctype html><body>');
  const art = {};
  for (const [k, src] of [['old', OLD], ['new', NEW]]) {
    art[k] = await pg.evaluate(src => {
      const W = {}; new Function('window', src)(W);
      const P = W.DCCSeasonsArt.christmas, X = P.xm, out = {};
      const svg = r => { const c = r.indexOf('|'), [w, h] = r.slice(0, c).split(' '); return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${r.slice(c + 1)}</svg>`); };
      for (const n of ['pine', 'candycane', 'flamingoxmas', 'ballred', 'ballgold', 'ballblue']) { const v = P.svgs[n]; out[n] = svg(typeof v === 'function' ? v() : v); }
      /* Santa in his sleigh, the painters' own drawing, at 2x */
      for (const [n, sc] of [['santa1', 0.8], ['santa3', 2.4]]) {
        const c = document.createElement('canvas'); c.width = 120 * sc * 2; c.height = 110 * sc * 2;
        const g = c.getContext('2d'); g.scale(2 * sc, 2 * sc); g.translate(60, 76); X.sack(g); X.sleigh(g); X.santa(g, 0);
        out[n] = c.toDataURL();
      }
      return out;
    }, src);
  }
  const row = (n, guest, big, label) => `<tr><th>${label}</th>
    <td class="ph"><img src="${art.old[n]}" height="${guest}"></td><td class="ph"><img src="${art.new[n]}" height="${guest}"></td>
    <td class="lt"><img src="${art.old[n]}" height="${big}"></td><td class="lt"><img src="${art.new[n]}" height="${big}"></td></tr>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#FBF6EC;font:14px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:20px 24px}
    h1{font-size:22px;text-align:center;margin:0 0 6px} p{text-align:center;max-width:1000px;margin:0 auto 14px;color:#555}
    table{border-collapse:separate;border-spacing:8px;margin:0 auto} th{font-weight:600;text-align:center;padding:4px 8px}
    td{text-align:center;vertical-align:middle;padding:10px 14px;border-radius:4px} td img{display:block;margin:0 auto}
    td.ph{background:#3d4a39} td.lt{background:#F3EDE2}</style>
    <h1>Seasons 4.14.2 — Christmas Colors, Before and After</h1>
    <p>Rob's fixes from the style test, nothing else in the drawings changed. The pine's shading is its own dark, cool green instead of black; Santa's hat and the sleigh's lower band are shaded with the red's own darker, cooler tone instead of black; the candy cane's white stripes and the flamingo's hat brim are #F6F4EE instead of pure white. And the two the style test missed: each glass ball's rim is its own darkest shade instead of black, and Santa's beard is #F6F4EE.</p>
    <table><tr><th></th><th>before, guest size</th><th>after, guest size</th><th>before, 3×</th><th>after, 3×</th></tr>
    ${row('pine', 38, 114, 'Pine')}${row('ballred', 28, 84, 'Red ball')}${row('ballgold', 28, 84, 'Gold ball')}${row('ballblue', 28, 84, 'Blue ball')}${row('candycane', 30, 90, 'Candy cane')}${row('flamingoxmas', 44, 132, 'Flamingo')}
    <tr><th>Santa and the sleigh</th><td class="ph"><img src="${art.old.santa1}" width="96"></td><td class="ph"><img src="${art.new.santa1}" width="96"></td>
    <td class="lt"><img src="${art.old.santa3}" width="288"></td><td class="lt"><img src="${art.new.santa3}" width="288"></td></tr></table>`;
  const f = path.join(S, 'xc.html'); fs.writeFileSync(f, html);
  await pg.goto('file://' + f); await pg.waitForTimeout(500);
  const out = path.join(ROOT, 'build', 'Seasons - 4.14.2 christmas colors.png');
  await pg.screenshot({ path: out, fullPage: true });
  await br.close(); console.log(out);
})().catch(e => { console.error(e); process.exit(1); });
