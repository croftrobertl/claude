'use strict';
/**
 * DCC Seasons — turn the Thanksgiving redraws (tools/tg-pieces.js, drawn in
 * their photographs' pixels) into engine sprites: each rescaled to a
 * viewBox whose long side is SIDE units, every SHAPE coordinate scaled and
 * rounded to 0.1, gradient fractions and angles left alone. Paths are
 * tokenized, never regex-trimmed (CLAUDE.md: a trim regex once fused
 * '8.2.4'), and written with a space between every number.
 *
 *   node tools/tg-build.js          (prints  key: '<w h|body>'  lines)
 *   node tools/tg-build.js --write  (splices them into engine.js)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PIECES } = require('./tg-pieces');
const SIDE = 32;
const ENGINE = path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js', 'engine.js');

const PAGE = `window.compact = function (raw, side) {
  var cut = raw.indexOf('|'), wh = raw.slice(0, cut).split(' ').map(Number), f = side / Math.max(wh[0], wh[1]);
  var doc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + raw.slice(cut + 1) + '</svg>', 'image/svg+xml');
  if (doc.querySelector('parsererror')) { throw new Error('parse'); }
  var P = 10;
  function n(v) { var r = Math.round(v * f * P) / P; return String(r === 0 ? 0 : r); }
  function d(s) {
    var t = s.match(/[a-zA-Z]|-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?/g), out = [];
    t.forEach(function (x) { if (/[aA]/.test(x)) { throw new Error('arc'); } out.push(/[a-zA-Z]/.test(x) ? x : n(+x)); });
    return out.join(' ').replace(/ ?([a-zA-Z]) ?/g, '$1');
  }
  var SC = ['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'stroke-width'];
  doc.documentElement.querySelectorAll('*').forEach(function (el) {
    var tag = el.tagName;
    if (tag === 'linearGradient' || tag === 'radialGradient' || tag === 'stop') { return; }
    if (el.closest('linearGradient,radialGradient')) { return; }
    P = el.closest('pattern') ? 100 : 10;
    SC.forEach(function (a) { if (el.hasAttribute(a)) { el.setAttribute(a, n(+el.getAttribute(a))); } });
    if (el.hasAttribute('d')) { el.setAttribute('d', d(el.getAttribute('d'))); }
    if (el.hasAttribute('stroke-dasharray')) { el.setAttribute('stroke-dasharray', el.getAttribute('stroke-dasharray').split(/[ ,]+/).map(function (v) { return n(+v); }).join(' ')); }
    if (el.hasAttribute('transform')) {
      el.setAttribute('transform', el.getAttribute('transform').replace(/(translate|rotate)\\(([^)]*)\\)/g, function (m, fn, args) {
        var a = args.split(/[ ,]+/).map(Number);
        return fn + '(' + (fn === 'rotate' ? [a[0]].concat(a.slice(1).map(n)) : a.map(n)).join(' ') + ')'; }));
    }
  });
  var body = new XMLSerializer().serializeToString(doc.documentElement).replace(/^<svg[^>]*>/, '').replace(/<\\/svg>$/, '').replace(/ xmlns="[^"]*"/g, '');
  return n(wh[0]) + ' ' + n(wh[1]) + '|' + body.replace(/\\n\\s*/g, '');
};
window.diff = async function (a, b) {
  function img(raw) { return new Promise(function (res) { var c = raw.indexOf('|'), i = new Image();
    i.onload = function () { res(i); }; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + raw.slice(0, c) + '">' + raw.slice(c + 1) + '</svg>'); }); }
  var A = await img(a), B = await img(b), W = 200, out = [];
  [A, B].forEach(function (im) { var c = document.createElement('canvas'); c.width = c.height = W; var g = c.getContext('2d'); g.drawImage(im, 0, 0, W, W); out.push(g.getImageData(0, 0, W, W).data); });
  var s = 0; for (var i = 0; i < out[0].length; i++) { s += Math.abs(out[0][i] - out[1][i]); } return s / out[0].length;
};`;

(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<script>' + PAGE + '</script>');
  const res = [];
  for (const pc of PIECES) {
    const c = await p.evaluate(([r, s]) => window.compact(r, s), [pc.redraw, SIDE]);
    const df = await p.evaluate(([a, b2]) => window.diff(a, b2), [pc.redraw, c]);
    if (df > 2) { throw new Error(pc.key + ' changed by ' + df.toFixed(2) + ' per channel when compacted'); }
    if (c.indexOf("'") >= 0) { throw new Error(pc.key + ' has a quote'); }
    res.push([pc.key, c]); console.error(pc.key, c.length, 'bytes, diff', df.toFixed(2));
  }
  await b.close();
  if (process.argv.includes('--write')) {
    let src = fs.readFileSync(ENGINE, 'utf8');
    for (const [k, v] of res) {
      const re = new RegExp('(\\n\\t\\t' + k + ": )'[^'\\n]*'");
      if (!re.test(src)) { throw new Error('no sprite ' + k); }
      src = src.replace(re, (m, a) => a + "'" + v + "'");
    }
    fs.writeFileSync(ENGINE, src); console.error('engine.js updated');
  } else { for (const [k, v] of res) { console.log(k + ": '" + v + "',"); } }
})().catch(e => { console.error(e); process.exit(1); });
