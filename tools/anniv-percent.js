'use strict';
/**
 * DCC Seasons — the Anniversary's two percentages, for Rob to pick how they
 * float (2026-10-30). The figures are COMPUTED, never typed (Rob): on the
 * day, years married / each one's age, from the dates recorded in CLAUDE.md
 * (wedding 11 Nov 2011, births 26 Mar 1989 and 25 Mar 1986), rounded to the
 * nearest whole number. No names anywhere: the figures float, nothing says
 * whose they are.
 *
 * Three looks (A gold numerals alone · B on a gold band, like the date ·
 * C on a blush heart) at three sizes, on the real home page at 390 — over
 * the header photograph, the page text and the navy footer — plus each one
 * close up, and the figures for the coming years.
 *
 *   node tools/anniv-percent.js [--out=file.png]
 */
const fs = require('fs');
const path = require('path');
const { open } = require('./harness');
const rt = require('./real-theme');
const { HEART } = require('./anniv-pieces');

const OUT = (process.argv.find(a => a.startsWith('--out=')) || '').slice(6) || path.join(__dirname, '..', 'build', 'Seasons - 4.13.4 anniversary percentages.png');
const D = (y, m, d) => Date.UTC(y, m - 1, d), YR = 365.2425 * 864e5;
function figures(year) {
  const on = D(year, 11, 11), wed = (on - D(2011, 11, 11)) / YR;
  return [Math.round(100 * wed / ((on - D(1989, 3, 26)) / YR)), Math.round(100 * wed / ((on - D(1986, 3, 25)) / YR))];
}
const GOLD = (id, dir) => `<linearGradient id="${id}" ${dir || 'x2="0" y2="1"'}><stop stop-color="#7C5C16"/><stop offset=".22" stop-color="#C9A227"/><stop offset=".42" stop-color="#F6E3A0"/><stop offset=".55" stop-color="#E2C25A"/><stop offset=".8" stop-color="#A9831F"/><stop offset="1" stop-color="#6E5013"/></linearGradient>`;
/* the three looks, each a sprite in the engine's 'w h|<svg>' format */
function looks(n, id) {
  const t = n + '%';
  return {
    A: `34 20|<defs>${GOLD(id + 'a')}</defs><text x="17" y="16" font-family="Georgia,serif" font-size="16" font-weight="700" fill="#5A410C" text-anchor="middle" stroke="#5A410C" stroke-width="1.6" stroke-linejoin="round">${t}</text><text x="17" y="15.4" font-family="Georgia,serif" font-size="16" font-weight="700" fill="url(#${id}a)" text-anchor="middle">${t}</text>`,
    B: `40 18|<defs>${GOLD(id + 'b')}</defs><rect x="1.2" y="2.4" width="37.6" height="13.2" rx="6.6" fill="url(#${id}b)" stroke="#7C5C16" stroke-width=".6"/><rect x="3" y="4" width="34" height="10" rx="5" fill="none" stroke="#FBEFC4" stroke-width=".5" opacity=".8"/><text x="20" y="12.4" font-family="Georgia,serif" font-size="8.6" font-weight="700" fill="#5A410C" text-anchor="middle">${t}</text><text x="20" y="11.9" font-family="Georgia,serif" font-size="8.6" font-weight="700" fill="#FFF8DD" text-anchor="middle">${t}</text>`,
    C: `24 23|<defs><radialGradient id="${id}c" cx=".35" cy=".3" r=".8"><stop stop-color="#F7B9C2"/><stop offset=".55" stop-color="#E8838F"/><stop offset="1" stop-color="#C85A6B"/></radialGradient>${GOLD(id + 'g')}</defs><path d="${HEART}" fill="url(#${id}c)" stroke="#B9505F" stroke-width=".5"/><path d="M6.2 6.4 Q4.8 8 5.6 10.6" stroke="#FFE3E7" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".9"/><text x="12" y="13.6" font-family="Georgia,serif" font-size="7.2" font-weight="700" fill="#7A2A36" text-anchor="middle">${t}</text><text x="12" y="13.1" font-family="Georgia,serif" font-size="7.2" font-weight="700" fill="#FFF6F7" text-anchor="middle">${t}</text>`,
  };
}
const url = r => { const c = r.indexOf('|'); const [w, h] = r.slice(0, c).split(' ').map(Number); return { w, h, u: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${r.slice(c + 1)}</svg>`) }; };

(async () => {
  const [a, b] = figures(2026);
  const L1 = looks(a, 'dccAnP1'), L2 = looks(b, 'dccAnP2');
  /* the real home page at 390, without Seasons: three bands a guest sees */
  const ses = await open(rt.page({}), { viewport: { width: 390, height: 844 }, dsf: 2, ...rt.opts(390) });
  const shot = async y => { await ses.page.evaluate(v => window.scrollTo(0, v), y); await ses.page.waitForTimeout(250); return 'data:image/png;base64,' + (await ses.page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 390, height: 300 } })).toString('base64'); };
  const bands = [['over the header photograph', await shot(60)], ['over the page text', await shot(560)],
    ['over the footer', await (async () => { const h = await ses.page.evaluate(() => document.documentElement.scrollHeight); return shot(h - 300); })()]];
  await ses.close();
  /* guest size: the other pieces fall about 24-30 px tall */
  const SIZE = [['the same size as the other pieces', 24], ['half as big again', 36], ['twice the size', 48]];
  const POS = [[70, 70], [255, 150], [150, 225]];   /* two figures + one again, scattered like falling pieces */
  const guest = (k, h) => bands.map(([lab, bg], bi) => `<div class="band"><img class="bg" src="${bg}">${[L1, L2, L1].map((L, i) => { const s = url(L[k]); return `<img class="pc" src="${s.u}" style="left:${POS[i][0]}px;top:${POS[(i + bi) % 3][1]}px;height:${h}px;transform:rotate(${[-8, 6, -3][i]}deg)">`; }).join('')}<div class="lab">${lab}</div></div>`).join('');
  const NAMES = { A: 'A · Gold Numerals', B: 'B · On a Gold Band, Like the Date', C: 'C · On a Blush Heart' };
  const NOTE = { A: 'The figure alone, in shaded gold with a dark edge so it holds on the photograph and on white.', B: 'The same band as the date piece (step 1, row 5 A), so the three text pieces match.', C: 'The heart from step 1 (row 1 A), the figure in white on it.' };
  const close = k => `<div class="close">${[L1, L2].map(L => `<img src="${url(L[k]).u}" style="height:120px">`).join('')}</div>`;
  const years = [2026, 2027, 2028, 2029, 2030].map(y => { const f = figures(y); return `<td>${y}</td><td>${y - 2011}</td><td>${f[0]}%</td><td>${f[1]}%</td>`; });
  const html = `<!doctype html><meta charset=utf-8><style>
    body{margin:0;background:#f6f3ee;font:14px/1.45 -apple-system,Segoe UI,sans-serif;color:#222;padding:0 0 30px}
    h1,h2,h3{text-align:center;margin:0} h1{font-size:26px;padding:24px 0 4px} h2{font-size:21px;margin:34px 0 4px} h3{font-size:15px;margin:14px 0 6px;color:#444}
    p.sub,p.note{text-align:center;max-width:900px;margin:4px auto;color:#555}
    .grid{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
    .band{position:relative;width:390px;height:300px;overflow:hidden;border:1px solid #bbb}
    .band .bg{position:absolute;left:0;top:0;width:390px;height:300px}
    .band .pc{position:absolute}
    .band .lab{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);color:#fff;text-align:center;font-size:12px;padding:3px}
    .close{display:flex;gap:40px;justify-content:center;align-items:center;margin:10px 0}
    table{margin:8px auto;border-collapse:collapse} td,th{border:1px solid #ccc;padding:4px 14px;text-align:center}
  </style><body>
  <h1>The Anniversary: How the Percentages Float</h1>
  <p class="sub">11 November. Two figures drift down with the other pieces, worked out on the day from the dates, rounded to the nearest whole number. Nothing says whose they are. This year they read <b>${a}%</b> and <b>${b}%</b>. Shown at a guest's size on the real home page at 390, then close up. Rob picks one look (A, B or C) and one size.</p>
  ${['A', 'B', 'C'].map(k => `<h2>${NAMES[k]}</h2><p class="note">${NOTE[k]}</p>${close(k)}${SIZE.map(([lab, h]) => `<h3>${lab}</h3><div class="grid">${guest(k, h)}</div>`).join('')}`).join('')}
  <h2>The Figures, Year by Year</h2><p class="note">Computed on each 11 November; nobody touches the code.</p>
  <table><tr><th>11 Nov</th><th>Years married</th><th>First figure</th><th>Second figure</th></tr>${years.map(r => `<tr>${r}</tr>`).join('')}</table>
  </body>`;
  const s2 = await open(html, { viewport: { width: 1240, height: 1000 }, dsf: 1 });
  await s2.page.waitForTimeout(500);
  await s2.page.screenshot({ path: OUT, fullPage: true });
  const h = await s2.page.evaluate(() => document.documentElement.scrollHeight);
  await s2.close();
  console.log(OUT, h + 'px tall');
})().catch(e => { console.error(e); process.exit(1); });
