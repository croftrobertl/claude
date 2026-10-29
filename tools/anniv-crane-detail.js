'use strict';
/**
 * DCC Seasons — the Anniversary's row 8 detail pass (the Director,
 * 2026-10-30), the sheet Rob sees BEFORE anything is built:
 *  1. each pose of the new bird three ways (the photograph · the drawing
 *     over it at 50% · the drawing), from the same three PD photographs;
 *  2. the pair at guest size on the real home page at 390, in Rob's row 10
 *     placement (under the tagline, centered): A the sprite the engine has
 *     today, B the new bird, with close-ups;
 *  3. row 9, the Florida Keys water-line scene as it is today and with the
 *     new bird, at 390 and 1440 (tools/anniv-keys-cranes.js);
 *  4. the year-count crystal at its size and half as big again.
 *
 * Run first: node tools/anniv-scene.js; node tools/anniv-keys-cranes.js
 * --width=390 and --width=1440. Then: node tools/anniv-crane-detail.js
 */
const fs = require('fs');
const path = require('path');
const { open } = require('./harness');
const rt = require('./real-theme');
const { DC_SRC, POSES } = require('./anniv-crane');
const { P: PIECES } = require('./anniv-pieces');

const REF = process.env.DCC_REFS || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/aref';
const B = path.join(__dirname, '..', 'build');
const OUT = path.join(B, 'Seasons - 4.13.4 anniversary crane detail.png');
const scene = JSON.parse(fs.readFileSync(path.join(B, '.anniv-scene.json'), 'utf8'));
const keys = { 390: JSON.parse(fs.readFileSync(path.join(B, '.anniv-keys-390.json'), 'utf8')), 1440: JSON.parse(fs.readFileSync(path.join(B, '.anniv-keys-1440.json'), 'utf8')) };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
const svgUrl = raw => { const c = raw.indexOf('|'), [w, h] = raw.slice(0, c).split(' ').map(Number); return { w, h, u: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${raw.slice(c + 1)}</svg>`) }; };
const OLD = { crane: svgUrl(SRC.match(/\bcrane: '([^']*)'/)[1]), cranedance: svgUrl(SRC.match(/cranedance: '([^']*)'/)[1]) };
const YEARS = 2026 - 2011;
const YEAR = svgUrl(`20 28|${PIECES.crystalA.slice(PIECES.crystalA.indexOf('|') + 1).replace(/dccAnC1/g, 'dccAnY1')}<text x="10" y="21" font-family="Georgia,serif" font-size="8.4" font-weight="700" fill="#2F5F7C" text-anchor="middle">${YEARS}</text>`);
const SRCS = { 'cr5.jpg': '“Sandhill Cranes Dancing, Dunes in Background,” Wikimedia Commons, public domain', 'cr6.jpg': '“Sandhill Cranes Kissing — Courtship Ritual,” Wikimedia Commons, public domain' };
const TITLES = { stand: 'Standing, Facing Its Mate', call: 'Calling, Wings Half Open', leap: 'The Leap, Both Wings Thrown Open' };
const png = b => 'data:image/png;base64,' + b;

(async () => {
  /* the page behind the year crystal: the real home page at 390, over the
   * page text, no Seasons */
  const s0 = await open(rt.page({}), { extra: rt.route, viewport: { width: 390, height: 844 }, dsf: 2, ...rt.opts(390) });
  await s0.page.evaluate(() => window.scrollTo(0, 560)); await s0.page.waitForTimeout(300);
  const textBand = (await s0.page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 220 } })).toString('base64');
  await s0.close();

  const items = Object.entries(POSES).map(([k, v]) => ({ k, ref: v.ref, P: v.P, img: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(REF, v.ref.f)).toString('base64') }));
  const r390 = scene.report[390].A, H = r390.H;
  const keyRow = (w, disp) => ['today', 'new'].map(m => `<h3>${m === 'today' ? 'Today: the sprite the Keys scene has now' : 'With the new bird: the same scene, the same timing, positions and size'}</h3>
    <div class="row">${keys[w].runs[m].map(s => `<figure><img class="sh" src="${png(s.close)}" style="width:${disp}px"><figcaption>${s.name}</figcaption></figure>`).join('')}</div>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#FBF6EC;font:14px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px;width:1360px}
    h1{font-size:24px;margin:4px 0 6px;text-align:center} h2{font-size:19px;margin:0 0 4px;text-align:center} h3{font-size:15px;margin:14px 0 6px;text-align:center;color:#444}
    .sub,.note{color:#555;margin:0 auto 10px;max-width:1000px;text-align:center}
    section{border-top:1px solid #E3D9C6;padding:16px 0 10px} .row{display:flex;gap:12px;justify-content:center;align-items:flex-end;flex-wrap:wrap} figure{margin:0;text-align:center} figcaption{color:#666;margin-top:4px}
    canvas,img.sh{display:block;border:1px solid #D9CDB6;border-radius:3px} ul{max-width:1000px;margin:6px auto;color:#444}</style>
    <h1>The Anniversary: The Dancing Crane, Detail Pass</h1>
    <p class="sub">Row 8, before anything is built. The new bird now carries what the three photographs show: the white cheek below the red crown, rusty ochre staining on the body and wing coverts, feathers in loose overlapping rows (never a pattern), the drooping tertial bustle as separate feathers, separate primaries darkening to their tips, separate secondaries, long dark legs with the backward-bending heel, and one light: the low sun on the breast and neck, the back in cool shadow.</p>
    <ul><li><b>One bird, one light.</b> It is the same bird in every pose, so all three are lit the way the first photograph is (front-lit, cream breast, slate back). The leap's photograph is backlit and grayer; the drawing keeps the first light so the bird does not change color as it dances.</li>
    <li><b>Fitted at 50%.</b> Every pose is drawn in the photograph's own pixels and fixed where the overlay showed a fault: this round moved the calling bird's wing up onto the photo's wing and the leaping bird's near wing onto its primaries.</li></ul>
    <div id="fits"></div>
    <section><h2>Both Birds at Guest Size, on the Real Home Page at 390</h2>
      <p class="note">Rob's row 10 A: under the tagline, centered, ${H} px tall, 8 px clear of the tagline. The same three moments for both. A is the sprite the Keys scene draws today; B is the new bird.</p>
      <div id="guest"></div></section>
    <section><h2>Florida Keys: Its Water-Line Scene With the New Bird (Row 9)</h2>
      <p class="note">The scene runs unchanged in the engine, on the mocked clock and the same seed. Only the two crane pictures are swapped, in the same box, so its timing, positions and size are exactly today's. Nothing else in Florida Keys changes; the build proves that pixel for pixel, with only this crane exempt.</p>
      <h3 style="font-size:17px;color:#2b2b2b">390</h3>${keyRow(390, 300)}
      <h3 style="font-size:17px;color:#2b2b2b">1440</h3>${keyRow(1440, 300)}
      <h3>The whole screen at 1440, dancing</h3><div class="row">${['today', 'new'].map(m => `<figure><img class="sh" src="${png(keys[1440].runs[m][2].whole)}" style="width:640px"><figcaption>${m === 'today' ? 'Today' : 'With the new bird'}</figcaption></figure>`).join('')}</div></section>
    <section><h2>The Year Count's Crystal: Its Size, or Half as Big Again</h2>
      <p class="note">You asked for 1.5× to match the date. I agree: at its own size the "${YEARS}" is 8 px type, which is hard to read on a phone. Over the page text at 390:</p>
      <div class="row">${[[28, 'Its size (28 px)'], [42, 'Half as big again (42 px), recommended']].map(([h, c]) => `<figure><div style="position:relative;width:390px;height:220px;overflow:hidden;border:1px solid #D9CDB6;border-radius:3px"><img src="${png(textBand)}" style="width:390px;position:absolute;left:0;top:0"><img src="${YEAR.u}" style="position:absolute;left:90px;top:60px;height:${h}px;transform:rotate(-8deg)"><img src="${YEAR.u}" style="position:absolute;left:270px;top:120px;height:${h}px;transform:rotate(6deg)"></div><figcaption>${c}</figcaption></figure>`).join('')}</div></section>
    <script>${DC_SRC}
    window.run = async (items, SRCS, TITLES, scene, OLD, H) => {
      const host = document.getElementById('fits');
      for (const it of items) { const im = new Image(); im.src = it.img; await im.decode();
        const [cx, cy, cw, ch] = it.ref.crop, S = Math.min(1.5, 420 / ch);
        const sec = document.createElement('section'); sec.innerHTML = '<h2>' + TITLES[it.k] + '</h2><p class="note">Photograph: ' + SRCS[it.ref.f] + '.</p>';
        const row = document.createElement('div'); row.className = 'row'; sec.appendChild(row);
        ['the photograph', 'the drawing over it at 50%', 'the drawing'].forEach(function (cap, i) {
          const c = document.createElement('canvas'); c.width = cw * S * 2; c.height = ch * S * 2; c.style.width = cw * S + 'px'; c.style.height = ch * S + 'px';
          const g = c.getContext('2d'); g.scale(2, 2);
          if (i < 2) { g.drawImage(im, cx, cy, cw, ch, 0, 0, cw * S, ch * S); } else { g.fillStyle = '#E8D4A8'; g.fillRect(0, 0, cw * S, ch * S); }
          if (i) { g.save(); g.globalAlpha = i === 1 ? 0.5 : 1; g.scale(S, S); g.translate(it.ref.x0 - cx, it.ref.y0 - cy); g.scale(it.ref.H * it.ref.face, it.ref.H); dcPaint(g, it.P); g.restore(); }
          const f = document.createElement('figure'); f.appendChild(c); const fc = document.createElement('figcaption'); fc.textContent = cap; f.appendChild(fc); row.appendChild(f);
        });
        host.appendChild(sec);
      }
      /* the guest-size pair: B is anniv-scene.js's own frames (the new
       * painter at Rob's placement); A draws the sprite in the same boxes */
      const g2 = document.getElementById('guest');
      const bg = new Image(); bg.src = 'data:image/png;base64,' + scene.shots[390].clean; await bg.decode();
      const old = {}; for (const k in OLD) { old[k] = new Image(); old[k].src = OLD[k].u; await old[k].decode(); }
      for (const ab of ['A', 'B']) {
        const h3 = document.createElement('h3'); h3.textContent = ab === 'A' ? 'A: the sprite the engine has today' : 'B: the new bird'; g2.appendChild(h3);
        const row = document.createElement('div'); row.className = 'row'; g2.appendChild(row);
        for (let mi = 0; mi < scene.MOMENTS.length; mi++) {
          const c = document.createElement('canvas'); const W = bg.naturalWidth / 2, Hh = bg.naturalHeight / 2;
          c.width = W * 2; c.height = Hh * 2; c.style.width = W + 'px';
          const g = c.getContext('2d');
          if (ab === 'B') { const im = new Image(); im.src = 'data:image/png;base64,' + scene.shots[390].A[mi]; await im.decode(); g.drawImage(im, 0, 0); }
          else {
            g.drawImage(bg, 0, 0); g.scale(2, 2);
            const fr = scene.MOMENTS[mi], floorY = Hh - 10, xa = W / 2 - 0.55 * H, xb = W / 2 + 0.55 * H;
            [[fr.a, xa, 1], [fr.b, xb, -1]].forEach(function (q) {
              const k = q[0][0] === 'leap' ? 'cranedance' : 'crane', o = OLD[k], hh = H * (k === 'crane' ? 1 : 1.05), ww = hh * o.w / o.h;
              g.save(); g.translate(q[1], floorY - q[0][1] * H); g.scale(q[2] > 0 ? -1 : 1, 1); g.drawImage(old[k], -ww / 2, -hh, ww, hh); g.restore();
            });
          }
          const f = document.createElement('figure'); f.appendChild(c); const fc = document.createElement('figcaption'); fc.textContent = scene.MOMENTS[mi].name; f.appendChild(fc); row.appendChild(f);
        }
        /* a close-up of the middle moment, 3x */
        const last = row.children[1].firstChild, z = document.createElement('canvas'), zw = 200, zh = 120;
        z.width = zw * 6; z.height = zh * 6; z.style.width = zw * 3 + 'px';
        const zg = z.getContext('2d'); zg.imageSmoothingQuality = 'high';
        zg.drawImage(last, (last.width / 2 - zw), last.height - zh * 2, zw * 2, zh * 2, 0, 0, z.width, z.height);
        const f = document.createElement('figure'); f.appendChild(z); const fc = document.createElement('figcaption'); fc.textContent = 'close up, 3×: what a guest sees, magnified'; f.appendChild(fc); row.appendChild(f);
      }
    };</script>`;
  const ses = await open(html, { viewport: { width: 1400, height: 900 }, dsf: 1 });
  await ses.page.evaluate(a => window.run(...a), [items, SRCS, TITLES, { shots: { 390: scene.shots[390] }, MOMENTS: scene.MOMENTS }, OLD, H]);
  await ses.page.waitForTimeout(500);
  const h = await ses.page.evaluate(() => document.documentElement.scrollHeight);
  await ses.page.screenshot({ path: OUT, fullPage: true });
  await ses.close();
  console.log(OUT, h + 'px tall');
})().catch(e => { console.error(e); process.exit(1); });
