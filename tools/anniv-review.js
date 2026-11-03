'use strict';
/**
 * DCC Seasons — the Anniversary's round-1 review images (4.14.5): every
 * falling piece BEFORE (DCC_BEFORE, a copy of the 4.14.4 art-anniversary.js)
 * and AFTER (the pack in the tree), each at guest size and at 3x, on the
 * home page's header photograph, a white page and the navy footer, drawn
 * by the browser from the packs' own sprite strings at DPR 3.
 *
 *   DCC_BEFORE=<old art-anniversary.js> node tools/anniv-review.js --out=<dir>
 *   (writes <dir>/img/<n> <key> before|after.png)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.join(__dirname, '..');
const OUT = arg('out', path.join(ROOT, 'build', 'Seasons - 4.14.5 review'));
const AFTER = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'art-anniversary.js'), 'utf8');
const BEFORE = process.env.DCC_BEFORE ? fs.readFileSync(process.env.DCC_BEFORE, 'utf8') : null;
const PHOTO = 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'tests', 'real-theme', 'assets', '858760dd76a9.webp')).toString('base64');
/* each piece's guest WIDTH: the middle of its theme row's 'sz' (class-themes.php) */
const PIECES = [['anheart', 26], ['anrings', 34], ['ancrystal', 20], ['antoast', 27], ['andate', 62], ['anyear', 30], ['anpct1', 62], ['anpct2', 62]];
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });

const sprites = src => { const W = {}; new Function('window', src)(W); const S = W.DCCSeasonsArt.anniversary.svgs, o = {};
  for (const k in S) { let v = S[k]; if (typeof v === 'function') { v = v(); } const c = v.indexOf('|'); const [w, h] = v.slice(0, c).split(' ').map(Number);
    o[k] = { w, h, u: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${v.slice(c + 1)}</svg>`) }; }
  return o; };
const A = sprites(AFTER), B = BEFORE ? sprites(BEFORE) : null;

/* the photo crop: the sky-and-water band under the tagline, where the pieces
 * fall over the picture at 390 */
const tile = (bg, s, w) => {
  const style = bg === 'photo' ? `background:url(${PHOTO}) 38% 62%/auto 520px` : bg === 'white' ? 'background:#FFFFFF' : 'background:rgb(10,61,98)';
  const pad = Math.max(10, w * 0.25);
  return `<div class="t" style="${style};width:${w + 2 * pad}px;height:${w * s.h / s.w + 2 * pad}px"><img src="${s.u}" style="width:${w}px"></div>`;
};
const sheet = (set, k, w, tag) => `<div class="s"><div class="lab">${tag}</div>
  <div class="r"><div class="c">${['photo', 'white', 'navy'].map(b => tile(b, set[k], w)).join('')}<p>guest size (${w} px wide)</p></div></div>
  <div class="r"><div class="c">${['photo', 'white', 'navy'].map(b => tile(b, set[k], w * 3)).join('')}<p>3x close-up</p></div></div></div>`;
const CSS = 'body{margin:0;padding:14px;background:#FBF6EC;font:13px/1.4 system-ui,sans-serif;color:#2b2b2b;display:inline-block}' +
  '.lab{font-weight:700;text-align:center;margin-bottom:6px}.r{margin:6px 0}.c{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.c p{margin:0 0 0 6px;color:#666}' +
  '.t{display:flex;align-items:center;justify-content:center;border-radius:4px;border:1px solid #E3D9C6}';

(async () => {
  const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1200, height: 400 }, deviceScaleFactor: 3 });
  let n = 0;
  for (const [k, w] of PIECES) {
    n++;
    for (const [tag, set] of [['before', B], ['after', A]]) {
      if (!set) { continue; }
      await pg.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${sheet(set, k, w, tag === 'before' ? 'Before (4.14.4, live)' : 'After')}`);
      await pg.waitForTimeout(250);
      await pg.locator('body').screenshot({ path: path.join(OUT, 'img', `${n} ${k} ${tag}.png`) });
    }
  }
  await br.close();
  console.log('review images:', n, 'pieces ->', path.join(OUT, 'img'));
})().catch(e => { console.error(e); process.exit(1); });
