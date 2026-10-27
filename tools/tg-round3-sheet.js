'use strict';
/**
 * DCC Seasons — Thanksgiving round 3 (4.13.2): the short sheet for Rob.
 * The strutting tom and his poults (each over its ONE photograph at 50%,
 * alone, on the real header at guest size, enlarged 5x, and their walk and
 * feeding frames), the pie retraced from "Pumpkin Pie" (USDA ARS), the
 * bald cypress two ways at guest size, the tom at three widths, and the
 * size report. Every drawing is the engine's OWN painter.
 *
 *   node tools/tg-round3-sheet.js   -> build/Seasons - 4.13.2 thanksgiving round 3.png
 */
const fs = require('fs');
const path = require('path');
const { open, ROOT } = require('./harness');
const { block } = require('./tg-tom');
const SCR = '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad';
const jpg = f => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
const png = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

/* the TG_GEN generators (pie, cypress) from the working engine */
const src = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
const gen = new Function('SVGS', src.slice(src.indexOf('/* TG_GEN_START'), src.indexOf('/* TG_GEN_END */')) + '\nreturn { tgCypress: tgCypress, tgPie: tgPie };')({});
const svgU = r => { const c = r.indexOf('|'); const [w, h] = r.slice(0, c).split(' ').map(Number); return { w, h, u: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${r.slice(c + 1)}</svg>`) }; };
const LIVE = require('child_process').execSync('git show 64340a4:dcc-seasons/assets/js/engine.js', { cwd: ROOT, maxBuffer: 1 << 26 }).toString();
const livePie = (() => { const PAL = JSON.parse(LIVE.match(/var PAL = (\{[\s\S]*?\});/)[1]); const m = LIVE.match(/\n\t\tpie: '([^']*)'/)[1]; return m.replace(/%([a-x])/g, (q, k) => PAL[k] || '#f0f'); })();
const scene = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', '.tg-scene.json'), 'utf8'));

const data = {
  tom: jpg(path.join(SCR, 'tom', 't2big.jpg')), poult: jpg(path.join(SCR, 'tom', 'big-f1.jpg')), pie: jpg(path.join(SCR, 'tref', 'pp.jpg')),
  hdr: 'data:image/png;base64,' + scene.shots[390].clean,
  pieNew: svgU(gen.tgPie()), pieLive: svgU(livePie), cyA: svgU(gen.tgCypress(false)), cyB: svgU(gen.tgCypress(true)),
  widths: [390, 768, 1440].map(w => { const f = path.join(ROOT, 'build', '.tomw-' + w + '.png'); return fs.existsSync(f) ? { w, u: png(f) } : null; }).filter(Boolean)
};
const minNow = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.min.js'));
const gzNow = +require('child_process').execSync('gzip -c "' + path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.min.js') + '" | wc -c').toString().trim();   /* the baseline's own measure (gzip -c), not zlib's */

const CSS = `body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
h1{font-size:19px;margin:0 0 4px;text-align:center} h2{font-size:15px;margin:0 0 4px;text-align:center}
.sub,.note{color:#555;margin:0 auto 10px;max-width:1080px} section{border-top:1px solid #E3D9C6;padding:14px 0 8px}
.row{display:flex;gap:10px;justify-content:center;align-items:flex-end;flex-wrap:wrap} figure{margin:0;text-align:center} figcaption{color:#666;margin-top:3px;font-size:12px}
canvas,img.shot{display:block;border:1px solid #D9CDB6;border-radius:3px} table{border-collapse:collapse;margin:8px auto} td,th{border-bottom:1px solid #E3D9C6;padding:4px 10px;text-align:left} th{text-align:center}`;

const RUN = `${block()}
window.run = async (D) => {
  const load = async u => { const i = new Image(); i.src = u; await i.decode(); return i; };
  const hdr = await load(D.hdr), W = document.getElementById('w');
  const cv = (w, h, bg) => { const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; c.style.width = w + 'px'; c.style.height = h + 'px'; const g = c.getContext('2d'); g.scale(2, 2); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } return [c, g]; };
  const fig = (el, cap) => { const f = document.createElement('figure'); f.appendChild(el); const c = document.createElement('figcaption'); c.textContent = cap; f.appendChild(c); return f; };
  const sec = (title, note) => { const s = document.createElement('section'); s.innerHTML = '<h2>' + title + '</h2><p class="note">' + note + '</p>'; const r = document.createElement('div'); r.className = 'row'; s.appendChild(r); W.appendChild(s); return r; };
  const strip = (title) => { const r = document.createElement('div'); r.className = 'row'; r.style.marginTop = '8px'; W.lastChild.appendChild(r); return r; };
  /* the header's canal bank at 390, the strip the walkers cross */
  const bank = (w, h) => { const [c, g] = cv(w, h); g.drawImage(hdr, 0, 300 * 2, w * 2, h * 2, 0, 0, w, h); return [c, g]; };
  /* the engine's own layout (drawGlyph + tomPoults), mirrored to face left */
  const TK_H = 1.55, KP_K = 0.4, GUEST = 29 * 1.3 * 1.05 * TK_H;
  /* cx = the centre of his box, as the engine's particle; poults at its gx */
  function tomAt(g, cx, feet, H, ph, d, j, kph, gap, feed) {
    const u = H / (TK_BOX[3] - TK_BOX[1]), tw = (TK_BOX[2] - TK_BOX[0]) * u, ph2 = H * KP_K, pu = ph2 / (KP_BOX[3] - KP_BOX[1]);
    const poult = (c, far) => poultOnly(g, cx + tw * (0.22 + (c === 1 ? 0.34 : 0.62) * gap), feet + (far ? -H * 0.03 : H * 0.02), ph2, feed ? -1 : kph + c * 0.37, feed && c === 1 ? 1 : 0);
    poult(2, true);
    tomOnly(g, cx, feet, H, ph, d, j);
    poult(1, false);
  }
  const tomOnly = (g, x, feet, H, ph, d, j) => { const u = H / (TK_BOX[3] - TK_BOX[1]); g.save(); g.translate(x + (TK_BOX[0] + TK_BOX[2]) / 2 * u, feet - TK_GROUND * u); g.scale(-u, u); tkPaint(g, ph, d, j); g.restore(); };
  const poultOnly = (g, x, feet, H, ph, d) => { const u = H / (KP_BOX[3] - KP_BOX[1]); g.save(); g.translate(x + (KP_BOX[0] + KP_BOX[2]) / 2 * u, feet - KP_GROUND * u); g.scale(-u, u); kpPaint(g, ph, d); g.restore(); };

  /* 1. the tom */
  { const tom = await load(D.tom);
    const r = sec('The Strutting Tom', 'Traced whole from ONE photograph, “Strutting Turkey at Gavins Point NFH” (U.S. Fish and Wildlife Service, Sam Stukel, public domain): the full fan with its barred feathers, black band and chestnut-buff tips; three rows of coverts; the puffed body’s pointed feathers catching silver, copper and bronze-green light; the dropped wing’s barred feathers on the ground; the white crown, blue face, red caruncled wattle and snood; the beard; the stepping leg. Drawn in code like the heron, so the walk is real legs, not a sliding cut-out. The photographed bird has whiter wing bars and tips than Florida’s Osceola; the drawing takes the Osceola’s darker wing and chestnut-buff tips.');
    const S = 0.36;
    for (let k = 0; k < 3; k++) { const [c, g] = cv(1200 * S, 1100 * S, k === 2 ? '#F6F1E7' : 0);
      if (k < 2) { g.drawImage(tom, 320, 1040, 1200, 1100, 0, 0, 1200 * S, 1100 * S); }
      if (k > 0) { g.save(); g.globalAlpha = k === 1 ? 0.5 : 1; g.scale(S * 10, S * 10); g.translate(5, 4.5); tkPaint(g, 0.12, 0, 0); g.restore(); }
      r.appendChild(fig(c, ['the photograph', 'the drawing over it at 50%', 'the drawing'][k])); }
    { const [c, g] = bank(170, 110); tomOnly(g, 85, 98, GUEST, 0.12, 0, 0); r.appendChild(fig(c, 'on the header, guest size')); }
    { const [c, g] = cv(GUEST * 5 * 126 / 107, GUEST * 5, '#F3E6C8'); tomOnly(g, GUEST * 5 * 126 / 107 / 2, GUEST * 5 * 104 / 107, GUEST * 5, 0.12, 0, 0); r.appendChild(fig(c, 'enlarged 5x')); }
    const s1 = strip(); for (let k = 0; k < 8; k++) { const [c, g] = cv(130, 122, '#F6F1E7'); tomOnly(g, 65, 118, 112, k / 8, 0, 0); s1.appendChild(fig(c, 'walk ' + (k + 1) + '/8')); }
    const s2 = strip(); [['p1', 0.25, 0], ['p2', 0.5, 0], ['p3', 0.75, 0], ['p4', 1, 0], ['pj', 1, 1]].forEach(([k, d, j]) => { const [c, g] = cv(150, 122, '#F6F1E7'); tomOnly(g, 70, 118, 112, 0, d, j); s2.appendChild(fig(c, j ? 'the peck' : 'feeding, head ' + Math.round(d * 100) + '% down')); });
  }
  /* 2. the poults */
  { const pl = await load(D.poult);
    const r = sec('The Poults', 'Traced from ONE photograph, “Wild turkeys” (National Park Service, Shenandoah, Luca Pfeiffer, public domain), its front poult: a round head with a big dark eye, a thin pale downy neck, dark feathers edged buff in rows over the back, the folded wing’s long pale-edged feathers, fluffy down along the belly, and pinkish legs that bend at the joint as the photo’s do. The same photo gave the walk: a foot swings forward with its toes curled down, then plants and stays put. On screen a poult stands 0.4 of the tom’s height, as a summer poult beside an adult.');
    const S = 0.6;
    for (let k = 0; k < 3; k++) { const [c, g] = cv(760 * S, 850 * S, k === 2 ? '#F6F1E7' : 0);
      if (k < 2) { g.drawImage(pl, 1750, 1450, 760, 850, 0, 0, 760 * S, 850 * S); }
      if (k > 0) { g.save(); g.globalAlpha = k === 1 ? 0.5 : 1; g.scale(S * 10, S * 10); g.translate(10, 10); kpPaint(g, 0.25, 0); g.restore(); }
      r.appendChild(fig(c, ['the photograph', 'the drawing over it at 50%', 'the drawing'][k])); }
    { const [c, g] = bank(110, 110); poultOnly(g, 55, 98, GUEST * KP_K, 0.25, 0); r.appendChild(fig(c, 'on the header, guest size')); }
    { const H5 = GUEST * KP_K * 5, [c, g] = cv(H5 * 72 / 72 + 20, H5 + 10, '#F3E6C8'); poultOnly(g, (H5 + 20) / 2, H5 * 65 / 72 + 5, H5, 0.25, 0); r.appendChild(fig(c, 'enlarged 5x')); }
    const s1 = strip(); for (let k = 0; k < 8; k++) { const [c, g] = cv(110, 100, '#F6F1E7'); poultOnly(g, 55, 96, 90, k / 8, 0); s1.appendChild(fig(c, 'walk ' + (k + 1) + '/8')); }
    { const [c, g] = cv(110, 100, '#F6F1E7'); poultOnly(g, 50, 96, 90, -1, 1); s1.appendChild(fig(c, 'feeding')); }
  }
  /* 3. together */
  { const r = sec('The Tom and His Poults Together, at Guest Size', 'On the header’s canal bank at 390, as the engine lays them out: the poults follow behind his fan, each stepping on its own beat. When he stops, both of his feet are down first; he lowers his head to feed with the fan held up and pecks twice, and the poults close up and feed too. The 10-second clip shows it moving.');
    [['walking', 0.12, 0, 0, 0.3, 1, false], ['he feeds, fan up', 0, 1, 0, 0, 0.55, true], ['the peck', 0, 1, 1, 0, 0.55, true]].forEach(([n, ph, d, j, kp, gap, feed]) => { const [c, g] = bank(300, 120); tomAt(g, 120, 108, GUEST, ph, d, j, kp, gap, feed); r.appendChild(fig(c, n)); });
  }
  /* 4. the pie */
  { const pp = await load(D.pie), nw = await load(D.pieNew.u), lv = await load(D.pieLive.u);
    const r = sec('The Pie, Retraced From a Real Pumpkin Pie', 'Over “Pumpkin Pie” (USDA Agricultural Research Service, image d260-1, Peggy Greb; its file page tags it PD-USGov-USDA-ARS, checked): the crust’s rim and the open filling are the photo’s two ellipses, seen from its height; the crimp is fluted and browned at the tips; the filling is matte orange, deeper toward the edge, with the small pores the photo shows; the foil pan shows as a sliver below. Drawn whole (the photo’s cut slice filled in), with no steam.');
    const S = 0.2, cx0 = 760, cy0 = 470, cw = 1680, ch = 950;
    for (let k = 0; k < 3; k++) { const [c, g] = cv(cw * S, ch * S); g.drawImage(pp, cx0, cy0, cw, ch, 0, 0, cw * S, ch * S);
      if (k > 0) { const im = k === 1 ? lv : nw; g.globalAlpha = 0.5; if (k === 2) { const K = 753 / 244; g.drawImage(nw, (826.5 - cx0) * S, (543 - cy0) * S, 500 * K * S, 262 * K * S); } else { g.drawImage(lv, (850 - cx0) * S, (560 - cy0) * S, 1500 * S, 1500 * 22 / 32 * S); } g.globalAlpha = 1; }
      r.appendChild(fig(c, ['the photograph', '4.13.1’s pie over it at 50%', 'the retraced pie over it at 50%'][k])); }
    { const [c, g] = bank(120, 90); const w = 26 * 1.3 * 500 / 262 * 0.62, h = w * 262 / 500; g.drawImage(nw, 60 - w / 2, 45 - h / 2, w, h); r.appendChild(fig(c, 'on the header, guest size')); }
    { const [c, g] = cv(26 * 1.3 * 500 / 262 * 0.62 * 5, 26 * 1.3 * 0.62 * 5, '#F3E6C8'); g.drawImage(nw, 0, 0, 26 * 1.3 * 500 / 262 * 0.62 * 5, 26 * 1.3 * 0.62 * 5); r.appendChild(fig(c, 'enlarged 5x')); }
  }
  /* 5. the cypress, two ways */
  { const a = await load(D.cyA.u), b = await load(D.cyB.u);
    const r = sec('The Bald Cypress: As Shown, or Bolder?', 'Your note: at guest size the branchlet is a thin faint streak on the canal. B keeps it accurate (one fallen branchlet of flat needles in two rows) with a deeper rust, needles spread wider from the stem and a darker outline, so it reads as a branchlet at guest size. One picture per option, on the header at guest size, then enlarged 5x.');
    for (const [n, im] of [['A · as shown', a], ['B · bolder rust, wider spread', b]]) {
      const [c, g] = bank(150, 100); const w = 34, h = w * im.naturalHeight / im.naturalWidth; g.save(); g.translate(75, 50); g.rotate(-0.35); g.drawImage(im, -w / 2, -h / 2, w, h); g.restore(); r.appendChild(fig(c, n + ', guest size'));
    }
    for (const [n, im] of [['A · as shown', a], ['B · bolder', b]]) {
      const [c, g] = cv(150, 100, '#FFFFFF'); const w = 34, h = w * im.naturalHeight / im.naturalWidth; g.save(); g.translate(75, 50); g.rotate(-0.35); g.drawImage(im, -w / 2, -h / 2, w, h); g.restore(); r.appendChild(fig(c, n + ', guest size, white page'));
    }
    for (const [n, im] of [['A', a], ['B', b]]) { const [c, g] = cv(170, 170 * 228 / 320, '#F3E6C8'); g.drawImage(im, 0, 0, 170, 170 * im.naturalHeight / im.naturalWidth); r.appendChild(fig(c, n + ', enlarged 5x')); }
  }
  /* 6. three widths */
  if (D.widths.length) { const r = sec('Where He Walks, at Three Widths', 'The real home page at 390, 768 and 1440 with the tom crossing. He walks along the bottom of the screen, far below the title, the tagline, the menu and the dial, so none of them is crossed at any width.');
    for (const s of D.widths) { const i = await load(s.u); i.className = 'shot'; i.style.width = (s.w === 390 ? 220 : s.w === 768 ? 330 : 520) + 'px'; r.appendChild(fig(i, s.w + ' px')); } }
  document.title = 'done';
};`;

(async () => {
  const room = 82225 - gzNow;
  const html = `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
    <h1>Seasons — Thanksgiving, Round 3: the Strutting Tom</h1>
    <p class="sub">Rob’s round 3. The bird is now a strutting wild tom, the big fanned tail up, with his poults following; each is drawn in code from ONE photograph and walks on real stepping legs, the head bobbing with each step. The pie is retraced from a real pumpkin pie, with no steam. The cypress comes two ways at guest size. A 10-second clip at 390 of him and the poults walking and feeding comes with this sheet. Nothing here is live: once Rob says yes, 4.13.2 is built from exactly these drawings.</p>
    <div id="w"></div>
    <section><h2>How Much Room the Engine Has Left</h2>
      <table><tr><th></th><th>Gzipped bytes</th></tr><tr><td>4.13.1, live</td><td>72,362</td></tr><tr><td>4.13.2 with this round, as measured</td><td>${gzNow.toLocaleString('en-US')}</td></tr><tr><td>The ceiling</td><td>82,225</td></tr><tr><td>Room left</td><td><b>${room.toLocaleString('en-US')}</b></td></tr></table>
      <p class="note">The tom and the poults are drawn by code: their two painters cost about 6.0KB gzipped, about what the round-2 hen and poult drawings they replace cost (5.8KB), and those are gone. The rest of round 2 (the redrawn leaves, cypress, cornucopia and pie, and the new falling motion) makes up the difference from 4.13.1. The squash is out entirely. <b>That leaves under 1KB.</b> A crookneck drawing needs about 0.6KB, so it fits, but only just. If it needs more, drawing the acorn by rule instead of as stored points would free about 1KB.</p></section>`;
  const ses = await open(`${html}<script>${RUN}</script>`, { viewport: { width: 1240, height: 900 }, dsf: 2 });
  await ses.page.evaluate(d => window.run(d), data);
  await ses.page.waitForFunction(() => document.title === 'done');
  await ses.page.setViewportSize({ width: 1240, height: await ses.page.evaluate(() => document.body.scrollHeight) });
  await ses.page.screenshot({ path: path.join(ROOT, 'build', 'Seasons - 4.13.2 thanksgiving round 3.png') });
  await ses.close();
  console.log('ok', gzNow, room);
})().catch(e => { console.error(e); process.exit(1); });
