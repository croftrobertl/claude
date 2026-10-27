'use strict';
/**
 * DCC Seasons — Thanksgiving round 2 (4.13.2): the sheet for Rob. Each piece
 * in his format: the photograph, the live 4.13.1 drawing over it at 50%,
 * the redraw over it at 50%, the redraw on the real header photo at guest
 * size, and enlarged 5x; then the hen with her poults, the cornucopia's
 * two strengths, the whole set on the header, a white page and the navy
 * footer, and the size report.
 *
 *   node tools/tg-round2-sheet.js   -> build/Seasons - 4.13.2 thanksgiving round 2.png
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { open, ROOT } = require('./harness');
const { PIECES, liveSvgs } = require('./tg-pieces');
const REF = process.env.DCC_REFS || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/tref';
const ROUND2 = ['leafm', 'leafm2', 'leafc', 'gourd2', 'pie', 'pieS', 'turkey', 'turkeyS', 'turkeypeck', 'poult', 'poultpeck', 'cornucopia'];
const SET = ['leafo', 'leafc', 'leafm', 'leafm2', 'leafs', 'gourd1', 'gourd2', 'gourd3', 'corn', 'cranberry', 'acorn', 'pie'];
const live = liveSvgs();
const url = r => { const c = r.indexOf('|'); const [w, h] = r.slice(0, c).split(' ').map(Number); return { w, h, u: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${r.slice(c + 1)}</svg>`) }; };
const scene = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', '.tg-scene.json'), 'utf8'));
const HDR = 'data:image/png;base64,' + scene.shots[390].clean;
const piece = k => PIECES.find(p => p.key === k && !p.old);
const items = ROUND2.map(k => { const p = piece(k); const img = p.ref ? 'data:image/' + (p.ref.endsWith('png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(path.join(REF, p.ref)).toString('base64') : null;
  return { ...p, newU: url(p.redraw), liveU: url(live[p.liveKey || p.key] || live.turkey), img }; });
const setU = SET.map(k => ({ k, u: url(piece(k).redraw) }));
const henU = url(piece('turkey').redraw), poultU = url(piece('poult').redraw), cornU = url(piece('cornucopia').redraw);

/* the size report, from the built files */
const minNow = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.min.js'));
const gzNow = zlib.gzipSync(minNow).length;

const CSS = `body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
h1{font-size:19px;margin:0 0 4px;text-align:center} h2{font-size:15px;margin:0 0 4px;text-align:center} h3{font-size:13px;margin:10px 0 4px;text-align:center}
.sub,.note{color:#555;margin:0 auto 10px;max-width:1040px} section{border-top:1px solid #E3D9C6;padding:14px 0 8px}
.row{display:flex;gap:10px;justify-content:center;align-items:flex-end;flex-wrap:wrap} figure{margin:0;text-align:center} figcaption{color:#666;margin-top:3px;font-size:12px}
canvas{display:block;border:1px solid #D9CDB6;border-radius:3px} .pill{display:inline-flex;align-items:center;justify-content:center;border-radius:5px;padding:6px}
table{border-collapse:collapse;margin:8px auto} td,th{border-bottom:1px solid #E3D9C6;padding:4px 10px;text-align:left} th{text-align:center}`;

const RUN = `window.run = async (items, HDR, setU, henU, poultU, cornU) => {
  const load = async u => { const i = new Image(); i.src = u; await i.decode(); return i; };
  const hdr = await load(HDR);
  const W = document.getElementById('w');
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; c.style.width = w + 'px'; c.style.height = h + 'px'; const g = c.getContext('2d'); g.scale(2, 2); return [c, g]; };
  const fig = (el, cap) => { const f = document.createElement('figure'); f.appendChild(el); const c = document.createElement('figcaption'); c.textContent = cap; f.appendChild(c); return f; };
  /* the guest-size piece on the header's canal, at the size the engine draws it */
  const onHeader = (im, gh, gw) => { const [c, g] = cv(160, 110); g.drawImage(hdr, 40 * 2, 305 * 2, 160 * 2, 110 * 2, 0, 0, 160, 110);
    const h = gh || gw * im.naturalHeight / im.naturalWidth, w = gw || gh * im.naturalWidth / im.naturalHeight; g.drawImage(im, 80 - w / 2, 55 - h / 2, w, h); return c; };
  for (const p of items) {
    const sec = document.createElement('section');
    sec.innerHTML = '<h2>' + p.name + '</h2><p class="note">' + p.note + (p.src ? ' Reference: ' + p.src + '.' : '') + '</p>';
    const row = document.createElement('div'); row.className = 'row'; sec.appendChild(row);
    const nw = await load(p.newU.u), lv = await load(p.liveU.u), im = p.img ? await load(p.img) : null;
    if (im) {
      const [cx0, cy0, cw, ch] = p.crop, S = Math.min(1.4, 250 / Math.max(cw, ch));
      for (let i = 0; i < (p.fit ? 3 : 1); i++) {
        const [c, g] = cv(Math.round(cw * S), Math.round(ch * S));
        g.drawImage(im, cx0, cy0, cw, ch, 0, 0, cw * S, ch * S);
        g.save(); g.scale(S, S); g.translate(-cx0, -cy0);
        if (i === 1) { const f = p.fit, ax = f.tip[0] - f.base[0], ay = f.tip[1] - f.base[1], len = Math.hypot(ax, ay), k = len / (f.span || lv.naturalHeight);
          g.globalAlpha = 0.5; g.translate(f.base[0], f.base[1]); g.rotate(Math.atan2(ay, ax) + Math.PI / 2); g.scale(k, k); g.drawImage(lv, -lv.naturalWidth / 2, -lv.naturalHeight, lv.naturalWidth, lv.naturalHeight); }
        if (i === 2) { g.globalAlpha = 0.5;
          if (p.fitNew) { const f = p.fitNew, ax = f.tip[0] - f.base[0], ay = f.tip[1] - f.base[1], len = Math.hypot(ax, ay), k = len / (f.span || nw.naturalHeight); g.translate(f.base[0], f.base[1]); g.rotate(Math.atan2(ay, ax) + Math.PI / 2); g.scale(k, k); g.drawImage(nw, -nw.naturalWidth / 2 + (f.dx || 0), -nw.naturalHeight + (f.dy || 0), nw.naturalWidth, nw.naturalHeight); }
          else { const k2 = p.atScale || 1; if (p.mirror) { g.translate(p.at[0] * 2 + p.newU.w * k2, 0); g.scale(-1, 1); } g.drawImage(nw, p.at[0], p.at[1], p.newU.w * k2, p.newU.h * k2); } }
        g.restore();
        row.appendChild(fig(c, ['the photograph', 'the live drawing over it at 50%', 'the redraw over it at 50%'][i]));
      }
    }
    const gh = p.accent ? 0 : (p.guest || 26), gw = p.accent ? 56 : 0;
    row.appendChild(fig(onHeader(nw, gh, gw), 'on the header, guest size'));
    const big = document.createElement('div'); big.className = 'pill'; big.style.background = '#F3E6C8';
    const bi = new Image(); bi.src = p.newU.u; const bh = (gh || gw * nw.naturalHeight / nw.naturalWidth) * 5; bi.style.height = Math.min(220, bh) + 'px'; big.appendChild(bi);
    row.appendChild(fig(big, 'enlarged 5x' + (bh > 220 ? ' (shown at ' + Math.round(220 / bh * 5 * 10) / 10 + 'x)' : '')));
    W.appendChild(sec);
  }
  /* the hen and her poults together, at guest size: walking, and feeding */
  { const sec = document.createElement('section'); sec.innerHTML = '<h2>The Hen and Her Poults Together</h2><p class="note">At guest size on the header’s canal bank, as the engine places them: the poults are the same size on screen as 4.13.1’s chicks and sit just behind her tail. While she feeds they close up and dip their heads too.</p>';
    const row = document.createElement('div'); row.className = 'row'; sec.appendChild(row);
    const hen = await load(henU.u), pl = await load(poultU.u);
    for (const [name, gap] of [['walking', 1], ['feeding: the poults catch up', 0.55]]) {
      const [c, g] = cv(260, 110); g.drawImage(hdr, 40 * 2, 305 * 2, 260 * 2, 110 * 2, 0, 0, 260, 110);
      const w = 29 * 1.3 * 1.62, h = w * hen.naturalHeight / hen.naturalWidth, x = 100, y = 70; g.drawImage(hen, x - w / 2, y - h / 2, w, h);
      const ph = 29 * 1.3 * 0.42, pw = ph * pl.naturalWidth / pl.naturalHeight;
      for (let i = 1; i <= 2; i++) { const gx = x + w * 0.5 - pw * 0.15 + (i - 0.5) * pw * 0.95 * gap; g.drawImage(pl, gx - pw / 2, y + h * 0.47 - ph * 0.77, pw, ph); }
      row.appendChild(fig(c, name));
    }
    W.appendChild(sec); }
  /* the whole set */
  { const sec = document.createElement('section'); sec.innerHTML = '<h2>The Whole Set, at Guest Size</h2><p class="note">Every falling piece of Thanksgiving with the round-2 redraws, the hen with her poults, and the cornucopia in its corner, on the canal header photo, a white page and the navy footer.</p>';
    const row = document.createElement('div'); row.className = 'row'; sec.appendChild(row);
    const ims = []; for (const s of setU) { ims.push(await load(s.u.u)); }
    const hen = await load(henU.u), pl = await load(poultU.u), cn = await load(cornU.u);
    for (const [name, bg] of [['the canal header', 'hdr'], ['a white page', '#FFFFFF'], ['the navy footer', '#16314A']]) {
      const [c, g] = cv(390, 230);
      if (bg === 'hdr') { g.drawImage(hdr, 0, 190 * 2, 390 * 2, 230 * 2, 0, 0, 390, 230); } else { g.fillStyle = bg; g.fillRect(0, 0, 390, 230); }
      ims.forEach((im, i) => { const h = 30, w = h * im.naturalWidth / im.naturalHeight, x = 30 + (i % 6) * 60, y = 30 + Math.floor(i / 6) * 62; g.save(); g.translate(x, y); g.rotate(((i * 37) % 9 - 4) * 0.08); g.drawImage(im, -Math.min(w, 46) / 2, -h / 2 * Math.min(1, 46 / w), Math.min(w, 46), h * Math.min(1, 46 / w)); g.restore(); });
      const w = 29 * 1.3 * 1.62, h = w * hen.naturalHeight / hen.naturalWidth; g.drawImage(hen, 220 - w / 2, 190 - h / 2, w, h);
      const ph = 29 * 1.3 * 0.42, pw = ph * pl.naturalWidth / pl.naturalHeight; for (let i = 1; i <= 2; i++) { g.drawImage(pl, 220 + w * 0.5 - pw * 0.15 + (i - 0.5) * pw * 0.95 - pw / 2, 190 + h * 0.47 - ph * 0.77, pw, ph); }
      g.globalAlpha = 0.85; g.drawImage(cn, 10, 230 - 10 - 56 * cn.naturalHeight / cn.naturalWidth, 56, 56 * cn.naturalHeight / cn.naturalWidth); g.globalAlpha = 1;
      row.appendChild(fig(c, name));
    }
    W.appendChild(sec); }
  /* the cornucopia's two strengths */
  { const sec = document.createElement('section'); sec.innerHTML = '<h2>The Cornucopia: Keep 0.55, or Stronger?</h2><p class="note">Bottom-left, 56px wide, as today. At 0.55 the weave and the produce go faint, most of all over the navy footer; at 0.85 they read. One picture per option, on the page and on the footer.</p>';
    const row = document.createElement('div'); row.className = 'row'; sec.appendChild(row);
    const cn = await load(cornU.u);
    for (const op of [0.55, 0.85]) for (const bg of ['#FFFFFF', '#16314A']) {
      const [c, g] = cv(140, 90); g.fillStyle = bg; g.fillRect(0, 0, 140, 90); g.globalAlpha = op; const h = 56 * cn.naturalHeight / cn.naturalWidth; g.drawImage(cn, 10, 90 - 10 - h, 56, h);
      row.appendChild(fig(c, 'opacity ' + op + (bg === '#FFFFFF' ? ', page' : ', footer')));
    }
    W.appendChild(sec); }
  document.title = 'done';
};`;

(async () => {
  const sizeRows = `<tr><td>4.13.1, live</td><td>206,300</td><td>72,362</td></tr><tr><td>4.13.2 as on this sheet</td><td>${minNow.length.toLocaleString('en-US')}</td><td>${gzNow.toLocaleString('en-US')}</td></tr><tr><td>The ceiling</td><td></td><td>82,225</td></tr><tr><td>Room left</td><td></td><td><b>${(82225 - gzNow).toLocaleString('en-US')}</b></td></tr>`;
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
    <h1>Seasons — Thanksgiving, Round 2: Every Piece From a Photograph</h1>
    <p class="sub">Rob’s round 2: the five pieces still drawn the old way, redrawn from photographs as the eight were; Florida’s own Osceola turkey hen with her tail (two ways), her feeding pose and real wild turkey poults; the cornucopia as a woven horn pouring out the redrawn produce; and the whole pie, with steam and without. Each is shown over its public-domain or CC0 photograph at 50%, on the real header at guest size, and enlarged 5x. Nothing here is built until Rob picks. Two 10-second clips at 390 come with this sheet: the falling motion, and the hen’s walk with the peck.</p>
    <div id="w"></div>
    <section><h2>How Much Room the Engine Has Left</h2>
      <table><tr><th></th><th>Raw bytes</th><th>Gzipped</th></tr>${sizeRows}</table>
      <p class="note">Round 2 adds about 5.5KB gzipped. Three pieces are built from their rules when the page loads (the cypress’s needles, the pie’s crimps, and the cornucopia, which reuses the falling sprites), which saved about 4.6KB against storing them as drawings. That leaves about 4.4KB under the ceiling. Christmas, as 4.14.0 was built, needs about 10KB, so <b>Christmas will not fit under the ceiling on top of round 2</b>. The fix already planned is loading only the season that’s showing (the per-season split): with it, a Christmas visit would download the shared engine plus Christmas’s own art, well under the ceiling. I recommend that split ships with Christmas.</p></section>`;
  const ses = await open(`${html.replace('<div id="w"></div>', '<div id="w"></div>')}<script>${RUN}</script>`.replace('<style>', '<style>'), { viewport: { width: 1200, height: 900 }, dsf: 2 });
  await ses.page.evaluate(a => window.run(...a), [items, HDR, setU, henU, poultU, cornU]);
  await ses.page.waitForTimeout(500);
  await ses.page.setViewportSize({ width: 1200, height: await ses.page.evaluate(() => document.body.scrollHeight) });
  await ses.page.screenshot({ path: path.join(ROOT, 'build', 'Seasons - 4.13.2 thanksgiving round 2.png') });
  await ses.close();
  console.log('ok', gzNow);
})().catch(e => { console.error(e); process.exit(1); });
