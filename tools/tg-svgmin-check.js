'use strict';
/**
 * DCC Seasons — prove a sprite rewrite changed no pixel: rasterise every
 * named sprite from two engine.js files at 32, 96 and 256 px wide (and the
 * Thanksgiving generators' output) and compare the pixels exactly.
 *
 *   node tools/tg-svgmin-check.js <old engine.js> [new engine.js] key ...
 */
const fs = require('fs');
const path = require('path');
const { open } = require('./harness');
const [, , OLD, NEW0, ...rest] = process.argv;
const NEW = NEW0 && NEW0.endsWith('.js') ? NEW0 : path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js', 'engine.js');
const keys = (NEW0 && NEW0.endsWith('.js') ? rest : [NEW0, ...rest]).filter(Boolean);
function sprites(file) {
  const s = fs.readFileSync(file, 'utf8');
  const blk = s.slice(s.indexOf('/* TG_GEN_START'), s.indexOf('/* TG_GEN_END */'));
  const out = {};
  const SV = {};
  for (const k of keys) { const m = s.match(new RegExp("\\n\\t\\t" + k + ": '([^']*)'")); if (m) { SV[k] = m[1]; } }
  const gen = new Function('SVGS', blk + '\nreturn { leafc: tgCypress(true), pie: tgPie(), cornucopia: tgHorn() };')(SV);
  /* leafm2 is the maple RECOLOURED by text replacement: a rewrite of leafm
   * that its search strings no longer match would draw it plain red */
  const m2 = s.match(/\n\t\tleafm2: (function \(\) \{[^\n]*?\}),/);
  if (m2 && SV.leafm) { gen.leafm2 = new Function('SVGS', 'return (' + m2[1] + ')();')(SV); }
  return Object.assign(out, SV, gen);
}
(async () => {
  const A = sprites(OLD), B = sprites(NEW);
  const ses = await open('<!doctype html><body></body>', { viewport: { width: 400, height: 400 } });
  const r = await ses.page.evaluate(async ([A, B]) => {
    const doc = v => { const c = v.indexOf('|'), wh = v.slice(0, c).split(' '); return { w: +wh[0], h: +wh[1], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + wh[0] + ' ' + wh[1] + '" width="' + wh[0] + '" height="' + wh[1] + '">' + v.slice(c + 1) + '</svg>' }; };
    const px = async (v, W) => { const d = doc(v), im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.svg); await im.decode();
      const c = document.createElement('canvas'); c.width = W; c.height = Math.round(W * d.h / d.w); const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height); return g.getImageData(0, 0, c.width, c.height).data; };
    const out = {};
    for (const k of Object.keys(A)) {
      let diff = 0, n = 0;
      for (const W of [32, 96, 256]) { const a = await px(A[k], W), b = await px(B[k], W); n += a.length / 4; for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) { diff++; } } }
      out[k] = { same: A[k] === B[k], diff, n, bytes: [A[k].length, B[k].length] };
    }
    return out;
  }, [A, B]);
  await ses.close();
  let bad = 0;
  for (const [k, v] of Object.entries(r)) { console.log(k.padEnd(11), v.same ? 'text identical' : `${v.bytes[0]} -> ${v.bytes[1]} bytes`, `· ${v.diff} differing channel values over ${v.n} pixels`); if (v.diff) { bad++; } }
  console.log(bad ? `${bad} sprite(s) CHANGED` : 'every pixel identical');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
