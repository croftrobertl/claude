'use strict';
/**
 * DCC Seasons — the home page's wreath, two placements for Rob (the
 * Director, 2026-10-25). Stills only; nothing is built until Rob picks.
 *
 *   A. Hung on the "T": the T at the end of "DORA CANAL COURT" passes
 *      loosely through the middle of the ring, as on a hook. The ring hangs
 *      at rest — its centre straight below the hook, as a hung wreath does
 *      (the public-domain St. Joseph Abbey photograph) — and its top arc
 *      passes BEHIND the letter: one copy of the wreath sits under the
 *      title text clipped to that arc, the other over it with the arc cut
 *      away, so the T's own pixels hide the ring where it goes behind.
 *   B. Centred like a front door: centred across the picture, and between
 *      the bottom of the tagline and the bottom of the picture.
 *
 * Both are real DOM inside the header picture (#header-image-main-inside),
 * so they scroll with it. The wreath is the engine's own approved drawing
 * (the guide export's svgs.wreath), never redrawn here.
 *
 *   node tools/wreath-lab.js -> build/Seasons - 4.14.1 wreath options.png + .json
 */
const fs = require('fs');
const path = require('path');
const { open } = require('./harness');
const rt = require('./real-theme');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build');
const ENG = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
const REFDIR = process.env.DCC_REF || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/ref';
const PLACE = JSON.parse(fs.readFileSync(path.join(OUT, 'Seasons - 4.14.1 christmas placement.json'), 'utf8'));
const M = 8;

/* in the page: place a wreath and return its geometry */
const PLACE_JS = String.raw`
window.__wreath = function (opt) {
  var E = DCCSeasonsEngine.guide, raw = E.svgs.wreath(), svg = E.svgDoc(raw);
  var pic = document.getElementById('header-image-main-inside'), pr = pic.getBoundingClientRect();
  var title = document.querySelector('#header-page-title .entry-title');
  document.querySelectorAll('.rt-wreath').forEach(function (e) { e.remove(); });
  /* the T: the LAST letter of the title, its crossbar's top-right corner
   * from the font's own metrics (a range box is the line box, not the glyph) */
  var tw = document.createTreeWalker(title, NodeFilter.SHOW_TEXT), n, last = null;
  while ((n = tw.nextNode())) { if (/\S/.test(n.nodeValue)) { last = n; } }
  var i = last.nodeValue.replace(/\s+$/, '').length - 1;
  var rg = document.createRange(); rg.setStart(last, i); rg.setEnd(last, i + 1);
  var tr = rg.getClientRects()[0], cs = getComputedStyle(title);
  var c = document.createElement('canvas').getContext('2d');
  c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
  var m = c.measureText('T'), lh = parseFloat(cs.lineHeight) || tr.height;
  var asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
  var base = tr.top + (tr.height - (asc + desc)) / 2 + asc;
  var cap = m.actualBoundingBoxAscent;
  var T = { left: tr.left + (-m.actualBoundingBoxLeft), right: tr.left + m.actualBoundingBoxRight, top: base - cap, base: base, cap: cap, size: parseFloat(cs.fontSize) };
  var vbW = 44, vbH = 52, ringR = 14, ringW = 7, inner = ringR - ringW / 2;   /* the approved drawing's ring, in its own units */
  var s, left, top, hook = null;
  if (opt.which === 'A') {
    /* sized to the letter: the ring's outer diameter is 1.35 cap heights,
     * so the wreath reads as hung ON the letter and the crossbar fits
     * through the hole with room to spare */
    s = (1.35 * cap) / (2 * (ringR + ringW / 2));
    /* the hook: the crossbar's top-right corner, inset a hair so the ring
     * visibly sits ON it; at rest the ring's centre hangs straight below
     * it, its inner edge resting on the hook */
    hook = { x: T.right - 0.06 * cap, y: T.top + 0.06 * cap };
    var cx = hook.x, cy = hook.y + inner * s;
    left = cx - 22 * s; top = cy - 22 * s;
  } else {
    var tag = document.querySelector('#header-page-title p.byline').getBoundingClientRect();
    var avail = pr.bottom - tag.bottom;
    s = Math.min(96 / vbW, (avail - 2 * opt.M) / vbH);
    /* centred vertically on the WHOLE drawing, ring and bow */
    left = pr.left + pr.width / 2 - vbW * s / 2; top = tag.bottom + (avail - vbH * s) / 2;
  }
  function el(clip) {
    /* a SPAN, not a div: the site forces every div directly inside the
     * picture to its full height (#header-image-main-inside > div:not(...)
     * {height:100% !important}), which stretched the first try to 420px */
    var d = document.createElement('span');
    d.className = 'rt-wreath';
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'display:block;position:absolute;pointer-events:none;opacity:' + (opt.op == null ? 0.5 : opt.op) + ';left:' + (left - pr.left) + 'px;top:' + (top - pr.top) + 'px;width:' + (vbW * s) + 'px;height:' + (vbH * s) + 'px;' + (clip || '');
    d.innerHTML = svg;
    d.firstChild.setAttribute('width', '100%'); d.firstChild.setAttribute('height', '100%');
    return d;
  }
  if (opt.which === 'A') {
    /* the top arc, from the ring's top to just below the hook, BEHIND the
     * title text; everything else in front of it */
    var cut = (hook.y - top + 0.55 * ringW * s);
    var titleBox = document.getElementById('header-page-title');
    var zt = +getComputedStyle(titleBox).zIndex || 5;
    var back = el('z-index:' + (zt - 1) + ';clip-path:inset(0 0 calc(100% - ' + cut + 'px) 0);');
    var front = el('z-index:' + (zt + 1) + ';clip-path:inset(' + cut + 'px 0 0 0);');
    pic.appendChild(back); pic.appendChild(front);
  } else {
    var one = el('z-index:6;'); pic.appendChild(one);
  }
  return { which: opt.which, s: s, px: vbW * s, box: [left, top, left + vbW * s, top + vbH * s], ring: [left + (22 - ringR - ringW / 2) * s, top + (22 - ringR - ringW / 2) * s, left + (22 + ringR + ringW / 2) * s, top + (22 + ringR + ringW / 2) * s], T: T, hook: hook, pic: [pr.left, pr.top, pr.right, pr.bottom] };
};`;

function sep(a, b) { const dx = Math.max(a[0] - b[2], b[0] - a[2]), dy = Math.max(a[1] - b[3], b[1] - a[3]); return dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy); }

/* the sheet for Rob */
async function sheet(report, shots) {
  const img = (k, w) => `<img src="data:image/png;base64,${shots[k]}" style="width:${w}px;display:block;border:1px solid #D9CDB6;border-radius:3px">`;
  const ref = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(REFDIR, 'wr2.jpg')).toString('base64');
  const wr = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(await (async () => {
    const ses = await open('<!doctype html><script>' + ENG + '</script>', { viewport: { width: 200, height: 200 } });
    const sv = await ses.page.evaluate(() => DCCSeasonsEngine.guide.svgDoc(DCCSeasonsEngine.guide.svgs.wreath()));
    await ses.close(); return sv;
  })());
  const row = (o, W) => {
    const r = report[W][o];
    const g = (k, v) => `<td>${k}</td><td style="text-align:right">${v < 0 ? '<b>over by ' + (-v) + 'px</b>' : v + 'px clear'}</td>`;
    return `<tr><td>${W}</td><td>${r.px}px</td>${['title', 'tagline', 'menuButton'].map(k => g(k === 'menuButton' ? 'menu button' : k, r.vs[k])).join('')}` +
      `<td>${Object.entries(r.path).map(([k, v]) => `scene ${k}: moon ${v.moon < 0 ? '<b>over by ' + (-v.moon) + '</b>' : v.moon}, team ${v.team < 0 ? '<b>over by ' + (-v.team) + '</b>' : v.team}`).join('<br>')}</td></tr>`;
  };
  const css = `body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
    h1{font-size:19px;margin:0 0 4px;text-align:center} h2{font-size:15px;margin:0 0 6px;text-align:center} h3{font-size:13px;margin:10px 0 4px;text-align:center}
    .sub,.note{color:#555;margin:0 auto 12px;max-width:980px} section{border-top:1px solid #E3D9C6;padding:14px 0 10px}
    .row{display:flex;gap:16px;justify-content:center;align-items:flex-start;flex-wrap:wrap} figure{margin:0;text-align:center} figcaption{color:#666;margin-top:4px}
    table{border-collapse:collapse;margin:8px auto;font-size:12px} td,th{border-bottom:1px solid #E3D9C6;padding:3px 8px;vertical-align:top} th{text-align:center}`;
  const html = `<!doctype html><meta charset="utf-8"><style>${css}</style>
  <h1>Seasons — The Home Page Wreath: Two Placements</h1>
  <p class="sub">On every page but the home page the wreath stays where it is, fixed in the top-right corner. On the home page it gets a placement of its own, and Rob picks it from these stills. Each is drawn on the real home page (captured from the live site on October 25) at 390, 768 and 1440, at half opacity, with Rob's drawing unchanged. Both live inside the header picture, so they scroll away with it: once the picture leaves the screen, the home page shows no wreath until it returns. Nothing there is pinned to the window.</p>
  <section><h2>A — Hung on the "T"</h2>
    <p class="note">The wreath hangs from the top-right corner of the last "T" in "DORA CANAL COURT", the corner passing loosely through the middle of the ring. At rest its center hangs straight below the hook and its top arc passes behind the letter, so the T looks like the peg it hangs on. At 390 the title wraps and the hook is the T of "COURT" on the second line. The wreath is sized to the letter: its ring is 1.35 times the height of a capital, so 54px at 390, 64px at 768 and 97px at 1440 (the corner wreath is 96px).</p>
    <div class="row"><figure>${img('390A', 300)}<figcaption>390</figcaption></figure><figure>${img('768A', 520)}<figcaption>768</figcaption></figure></div>
    <div class="row" style="margin-top:10px"><figure>${img('1440A', 1040)}<figcaption>1440</figcaption></figure></div>
    <h3>The Hang, Close Up — at Half Opacity as Approved, and at Full Strength</h3>
    <p class="note">At half opacity the letter shows faintly through the front of the ring, and on this busy photograph the whole wreath is faint at guest size (the three frames above). At full strength the ring reads as solid and the hook is clearer. Rob's choice: half opacity, as in the corner, or full strength on the home page.</p>
    <div class="row"><figure>${img('1440Az', 260)}<figcaption>1440, half opacity</figcaption></figure><figure>${img('1440Az1', 260)}<figcaption>1440, full strength</figcaption></figure><figure>${img('390Az', 240)}<figcaption>390, half</figcaption></figure><figure>${img('390Az1', 240)}<figcaption>390, full</figcaption></figure></div>
    <table><tr><th>width</th><th>size</th><th colspan="6">its box against the keep-clear set</th><th>against each Christmas scene option's path</th></tr>${[390, 768, 1440].map(W => row('A', W)).join('')}</table>
    <p class="note">"Over the title" is the point of A: it hangs on the T. At 768 it lands where scene options B and C put their moon (over by 18px), so A with B or C at 768 would move that moon to the left side.</p>
  </section>
  <section><h2>B — Centered Like a Front Door</h2>
    <p class="note">Centered across the picture, and centered vertically (the whole drawing, ring and bow) between the bottom of "Family Owned &amp; Run Since 1971" and the bottom of the picture. It keeps the corner wreath's 96px where there is room (768), and shrinks to fit the 130px under the tagline elsewhere: 86px at 390, 91px at 1440. It hangs over the canal's reflection, as seasonal art over the photograph, which itself is untouched.</p>
    <div class="row"><figure>${img('390B', 300)}<figcaption>390</figcaption></figure><figure>${img('768B', 520)}<figcaption>768</figcaption></figure></div>
    <div class="row" style="margin-top:10px"><figure>${img('1440B', 1040)}<figcaption>1440</figcaption></figure></div>
    <table><tr><th>width</th><th>size</th><th colspan="6">its box against the keep-clear set</th><th>against each Christmas scene option's path</th></tr>${[390, 768, 1440].map(W => row('B', W)).join('')}</table>
    <p class="note">B sits in the band scene option C flies through (the team low over the canal), so B and C cannot both be picked; with A or B it is clear by well over 100px.</p>
  </section>
  <section><h2>Drawn From a Real Hung Wreath</h2>
    <p class="note">Our wreath at 50% over one hanging at rest (the right-hand door): the ring hangs straight below its support, bow at the bottom, the ribbon's tails falling straight down, and both placements hang it that way. The overlay shows one difference, left alone: the real tails are longer (about 0.8 of the ring's width against our 0.4) and the bow narrower. Lengthening them is a small change if Rob wants it; nothing changed without his say.</p>
    <div class="row"><figure><div style="position:relative;width:320px;height:340px;overflow:hidden;border-radius:4px;border:1px solid #D9CDB6">
      <img src="${ref}" style="position:absolute;left:-662px;top:-645px;width:1200px">
      <img src="${wr}" style="position:absolute;left:66px;top:84px;width:208px;opacity:.5"></div>
      <figcaption style="max-width:320px">"Christmas Day 2025 — wreaths on door, St Joseph Abbey, Louisiana" — public domain (Wikimedia Commons)</figcaption></figure></div>
  </section>`;
  const ses = await open(html, { viewport: { width: 1200, height: 900 }, dsf: 2 });
  await ses.page.waitForTimeout(600);
  await ses.page.setViewportSize({ width: 1200, height: await ses.page.evaluate(() => document.body.scrollHeight) });
  await ses.page.screenshot({ path: path.join(OUT, 'Seasons - 4.14.1 wreath options.png') });
  await ses.close();
}

(async () => {
  const report = {}, shots = {};
  for (const W of [390, 768, 1440]) {
    const ses = await open(rt.page({ extraHead: `<script>${ENG}</script>` }), { viewport: { width: W, height: W < 768 ? 844 : 900 }, extra: rt.route, dsf: 2 });
    const pg = ses.page;
    await pg.waitForTimeout(800);
    await pg.addScriptTag({ content: PLACE_JS });
    const keep = await rt.keepClear(pg);
    report[W] = {};
    for (const which of ['A', 'B']) {
      const g = await pg.evaluate(o => window.__wreath(o), { which, M });
      /* against the keep-clear set and each scene option's path (from the
       * placement lab: every box the team and the moon paint, unioned) */
      const vs = {};
      for (const [k, boxes] of Object.entries(keep)) {
        if (!boxes.length) { continue; }
        vs[k] = Math.round(Math.min(...boxes.map(b => sep(g.box, b))));
      }
      const pathVs = {};
      const P = PLACE[W] || PLACE[String(W)];
      if (P) {
        for (const opt of ['A', 'B', 'C']) {
          const o = P.opts[opt];
          if (!o || o.none) { continue; }
          const mo = o.mo, mb = [mo.x - mo.r + g.pic[0], mo.y - mo.r + g.pic[1], mo.x + mo.r + g.pic[0], mo.y + mo.r + g.pic[1]];
          /* the team's band across the picture: its top and bottom over the crossing */
          const L = o.L, ay = (o.ay != null ? o.ay : mo.y) + g.pic[1];
          const band = [g.pic[0], ay - 0.74 * L, g.pic[2], ay + 0.42 * L];
          pathVs[opt] = { moon: Math.round(sep(g.box, mb)), team: Math.round(sep(g.box, band)) };
        }
      }
      report[W][which] = { px: Math.round(g.px), box: g.box.map(Math.round), vs, path: pathVs, T: g.T && { right: Math.round(g.T.right), top: Math.round(g.T.top), cap: Math.round(g.T.cap), size: g.T.size } };
      const pb = g.pic;
      shots[W + which] = (await pg.screenshot({ clip: { x: 0, y: 0, width: W, height: Math.round(pb[3] - pb[1]) } })).toString('base64');
      if (which === 'A') {
        const zx = Math.max(0, g.box[0] - 60), zy = Math.max(0, g.box[1] - 50);
        const clip = { x: zx, y: zy, width: Math.min(W - zx, g.box[2] - g.box[0] + 120), height: g.box[3] - g.box[1] + 100 };
        shots[W + 'Az'] = (await pg.screenshot({ clip })).toString('base64');
        await pg.evaluate(o => window.__wreath(o), { which, M, op: 1 });
        shots[W + 'Az1'] = (await pg.screenshot({ clip })).toString('base64');
        await pg.evaluate(o => window.__wreath(o), { which, M });
      }
    }
    await ses.close();
  }
  fs.writeFileSync(path.join(OUT, 'Seasons - 4.14.1 wreath options.json'), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(OUT, '.wreath-shots.json'), JSON.stringify(shots));
  await sheet(report, shots);
  for (const W of Object.keys(report)) {
    for (const w of ['A', 'B']) {
      const r = report[W][w];
      console.log(`${W} ${w}: ${r.px}px wide at ${JSON.stringify(r.box)} · gaps (negative = over): ${Object.entries(r.vs).map(([k, v]) => k + ' ' + v).join(', ')} · scene paths: ${Object.entries(r.path).map(([k, v]) => k + ' moon ' + v.moon + '/team ' + v.team).join('; ')}${r.T ? ' · T top-right ' + r.T.right + ',' + r.T.top + ' cap ' + r.T.cap : ''}`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
