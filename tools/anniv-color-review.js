'use strict';
/**
 * DCC Seasons — the Anniversary color round's review (for 4.14.6): every
 * candidate color for the date band and the two figures (tools/anniv-
 * colors.js), its WCAG contrast measured against its own band and against
 * the header photo (five patches where the pieces fall, the worst taken), a
 * white page and the navy footer; the ones that clear every bar shown at
 * guest size and 3x on all three grounds, like round 1's images.
 *
 *   node tools/anniv-color-review.js --out=<dir> [--date=k,k,k,k] [--pct=k,k,k,k]
 *   (writes <dir>/img/*.png and <dir>/scores.json)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const C = require('./anniv-colors');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.join(__dirname, '..');
const OUT = arg('out', path.join(ROOT, 'build', 'Seasons - 4.14.6 color review'));
const DATE_K = arg('date', 'coralNavy,navyCream,blueCream,creamBlue').split(',');
const PCT_K = arg('pct', 'coralDeep,oneEach,blueDeep,coralLit').split(',');
const PHOTO = 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'tests', 'real-theme', 'assets', '858760dd76a9.webp')).toString('base64');
/* where the pieces fall over the picture: five patches, as background-position */
const PATCHES = [[0.38, 0.62], [0.38, 0.2], [0.8, 0.4], [0.1, 0.8], [0.6, 0.9]];
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });

const url = s => { const c = s.indexOf('|'); const [w, h] = s.slice(0, c).split(' ').map(Number); return { w, h, u: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${s.slice(c + 1)}</svg>`) }; };
const tile = (bg, s, w) => {
  const style = bg === 'photo' ? `background:url(${PHOTO}) 38% 62%/auto 520px` : bg === 'white' ? 'background:#FFFFFF' : 'background:#0A3D62';
  const pad = Math.max(10, w * 0.25);
  return `<div class="t" style="${style};width:${w + 2 * pad}px;height:${w * s.h / s.w + 2 * pad}px"><img src="${s.u}" style="width:${w}px"></div>`;
};
const CSS = 'body{margin:0;padding:14px;background:#FBF6EC;font:13px/1.4 system-ui,sans-serif;color:#2b2b2b;display:inline-block}' +
  '.lab{font-weight:700;text-align:center;margin-bottom:6px}.r{margin:6px 0}.c{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.c p{margin:0 0 0 6px;color:#666}' +
  '.t{display:flex;align-items:center;justify-content:center;border-radius:4px;border:1px solid #E3D9C6}';
const block = (sprites, w, title) => `<div class="lab">${title}</div>` +
  `<div class="r"><div class="c">${['photo', 'white', 'navy'].map(b => sprites.map(s => tile(b, s, w)).join('')).join('<span style="width:8px"></span>')}<p>guest size (${w} px wide)</p></div></div>` +
  `<div class="r"><div class="c">${['photo', 'white', 'navy'].map(b => tile(b, sprites[0], w * 3)).join('')}<p>3x close-up</p></div></div>`;

(async () => {
  const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1400, height: 400 }, deviceScaleFactor: 3 });
  /* the photo's luminance in each patch, at each piece's guest tile size */
  const photoL = await pg.evaluate(async ({ u, P }) => {
    const im = new Image(); im.src = u; await im.decode();
    const H = 520, W = im.width * H / im.height, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, W, H);
    const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    return P.map(([px, py]) => { const tw = 93, th = 58, x = (W - tw) * px, y = (H - th) * py, d = g.getImageData(x, y, tw, th).data; let s = 0;
      for (let i = 0; i < d.length; i += 4) { s += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); } return s / (d.length / 4); });
  }, { u: PHOTO, P: PATCHES });
  const bg = { white: C.lum('#FFFFFF'), navy: C.lum('#0A3D62'), photo: photoL };
  const scores = { bars: C.BAR, photoPatches: photoL.map(v => +v.toFixed(4)), date: {}, pct: {} };
  for (const k in C.DATE) { scores.date[k] = Object.assign({ label: C.DATE[k].label }, C.scoreDate(C.DATE[k], bg)); }
  for (const k in C.PCT) { scores.pct[k] = Object.assign({ label: C.PCT[k].label }, C.scorePct(C.PCT[k], bg)); }
  const shot = async (html, f) => { await pg.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${html}`); await pg.waitForTimeout(250); await pg.locator('body').screenshot({ path: path.join(OUT, 'img', f) }); };
  /* 4.14.5 as approved, for reference */
  const W0 = {}; new Function('window', fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'art-anniversary.js'), 'utf8'))(W0);
  const S0 = W0.DCCSeasonsArt.anniversary.svgs;
  await shot(block([url(S0.andate)], 62, 'Now (4.14.5): gold'), 'date 0 gold now.png');
  await shot(block([url(S0.anpct1()), url(S0.anpct2())], 62, 'Now (4.14.5): gold'), 'figures 0 gold now.png');
  /* --dl= / --pl= letter the options as a round named them (4.15.1: D and B), --tag= heads each title */
  const DL = arg('dl', 'ABCD'), PL = arg('pl', 'ABCD'), TAG = arg('tag', '');
  for (let i = 0; i < DATE_K.length; i++) {
    const k = DATE_K[i]; if (!scores.date[k].pass) { throw new Error('date ' + k + ' does not pass'); }
    await shot(block([url(C.dateSprite(C.DATE[k], 'dccAnD1'))], 62, `${TAG}${DL[i]} · ${C.DATE[k].label}`), `date ${DL[i]} ${k}.png`);
  }
  for (let i = 0; i < PCT_K.length; i++) {
    const k = PCT_K[i]; if (!scores.pct[k].pass) { throw new Error('figures ' + k + ' does not pass'); }
    await shot(block([url(C.pctSprite(C.PCT[k], '40%', 'dccAnP1', 1)), url(C.pctSprite(C.PCT[k], '37%', 'dccAnP2', 2))], 62, `${TAG}${PL[i]} · ${C.PCT[k].label}`), `figures ${PL[i]} ${k}.png`);
  }
  fs.writeFileSync(path.join(OUT, 'scores.json'), JSON.stringify(scores, null, 1));
  await br.close();
  console.log('photo patches', scores.photoPatches.join(' '), '->', OUT);
})().catch(e => { console.error(e); process.exit(1); });
