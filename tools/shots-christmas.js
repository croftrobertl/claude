'use strict';
/**
 * DCC Seasons — the three-width check, a standing rule since 4.14.0 (the
 * Director): the season's preview at 390, 768 and 1440, the scene caught
 * mid-crossing and the corner accent in place, and at each width a report
 * of: the moon's box against the page title's letters and the dial's box
 * (no overlap); no sideways page scroll; every piece visible on the cream
 * page and on the navy footer.
 *
 *   node tools/shots-christmas.js   -> build/Seasons - 4.14.0 christmas <w>.png + the report on stdout
 *
 * The fixture has no Sun-on-the-Canal dial, so a LABELED stand-in is put
 * where it sits on a computer (the picture's top right, 92px across). It
 * carries no data-dcc-keep-clear: the moon must clear it by itself.
 */
const fs = require('fs');
const path = require('path');
const { config, open, ROOT } = require('./harness');
const { page: fixture } = require('./fixture');

const OUT = path.join(ROOT, 'build');
const PIECES = [['ornament', 28, '4.13.0'], ['sabalpalm', 36, '4.13.0'], ['ballred', 28], ['ballgold', 28], ['ballblue', 28], ['holly', 30], ['candycane', 30], ['gift', 26], ['pine', 34], ['palmxmas', 36], ['flamingoxmas', 40]];
const CREAM = '#FBF6EC', NAVY = '#16314A';
/* the 4.13.0 drawings, for comparison, from the commit that shipped them */
const OLDENG = require('child_process').execFileSync('git', ['show', '66faa59:dcc-seasons/assets/js/engine.js'], { cwd: ROOT, encoding: 'utf8' });
const OLD = {}; ['ornament', 'sabalpalm'].forEach(k => { OLD[k] = (OLDENG.match(new RegExp(`\\n\\t\\t${k}: '([^']*)'`)) || [])[1]; });

(async () => {
  const report = [];
  for (const W of [390, 768, 1440]) {
    const cfg = config(['--theme=christmas', '--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.vigOnly = 'sleighmoon'; cfg.vigFirst = 3500; cfg.vigGap = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
    const H = W < 768 ? 844 : 900;
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: W, height: H }, dsf: 2 });
    const pg = ses.page;
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    try {
      await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}' });
      if (W >= 768) {
        await pg.evaluate(() => {
          const p = document.getElementById('header-image-main-inside'), d = document.createElement('div');
          d.className = 'dial-standin';
          d.style.cssText = 'position:absolute;right:44px;top:34px;width:92px;height:92px;border:3px solid rgba(255,255,255,.85);border-radius:50%;z-index:6;color:#fff;font:11px system-ui;display:flex;align-items:center;justify-content:center;text-align:center;box-sizing:border-box';
          d.textContent = 'dial (stand-in)'; p.appendChild(d);
        });
      }
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.vig === 'sleighmoon', null, { timeout: 40000 });
      /* mid-crossing: the lead pair over the moon, on the mocked clock */
      const m = await pg.evaluate(() => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        for (let k = 0; k < 900; k++) {
          s.tick(1000 / 30, 1);
          const st = s.sleigh.scene;
          if (st && st.x != null && st.dir * (st.x - (st.mx - st.dir * 2.0 * s.sleigh.L)) >= 0) { break; }
        }
        const st = s.sleigh.scene, sk = s.sky;
        const moon = [sk.left + st.mx - st.MR, sk.top + st.my - st.MR, sk.left + st.mx + st.MR, sk.top + st.my + st.MR];
        const title = [];
        const tw = document.createTreeWalker(document.getElementById('header-page-title'), 4);
        let n; while ((n = tw.nextNode())) { if (!/\S/.test(n.nodeValue)) { continue; } const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) { title.push([r.left, r.top, r.right, r.bottom]); } }
        const tb = title.reduce((a, r) => [Math.min(a[0], r[0]), Math.min(a[1], r[1]), Math.max(a[2], r[2]), Math.max(a[3], r[3])], [1e9, 1e9, -1e9, -1e9]);
        const dEl = document.querySelector('.dial-standin'), dr = dEl && dEl.getBoundingClientRect();
        const dial = dr ? [dr.left, dr.top, dr.right, dr.bottom] : null;
        const over = (a, b) => !!b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
        const acc = document.querySelector('.dcc-seasons-accent'), ar = acc.getBoundingClientRect();
        return { moon, tb, dial, mT: title.some(r => over(moon, r)), mTB: over(moon, tb), mD: over(moon, dial),
          scroll: document.documentElement.scrollWidth - innerWidth, darkN: st.darkN, x: st.x, mx: st.mx,
          acc: [ar.left, ar.top, ar.width, getComputedStyle(acc).opacity] };
      });
      const top = await pg.screenshot();
      /* the footer, with the field over it */
      await pg.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); });
      await pg.evaluate(() => { const s = window.DCCSeasonsEngine._state; for (let k = 0; k < 60; k++) { s.tick(1000 / 30, 1); } });
      const foot = await pg.screenshot();
      /* every piece at guest size on cream and on the navy footer: the share
       * of its painted pixels that differ clearly from the ground */
      const vis = await pg.evaluate(async ({ PIECES, CREAM, NAVY, OLD }) => {
        const E = window.DCCSeasonsEngine.guide, out = {};
        const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
        for (const [k, size] of PIECES) {
          const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(E.svgDoc(OLD[k] && !E.svgs[k] ? OLD[k] : (OLD[k] && E.svgs[k] && PIECES.find(p => p[0] === k)[2] ? OLD[k] : E.svgs[k])));
          await im.decode();
          const ratio = im.naturalHeight / im.naturalWidth, w = size / Math.max(1, ratio), h = w * ratio;
          out[k] = {};
          for (const [name, bg] of [['cream', CREAM], ['navy', NAVY]]) {
            const c = document.createElement('canvas'); c.width = Math.ceil(w * 2); c.height = Math.ceil(h * 2);
            const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
            const d = g.getImageData(0, 0, c.width, c.height).data, b = hex(bg);
            let painted = 0, clear = 0;
            for (let i = 0; i < d.length; i += 4) {
              const dd = Math.abs(d[i] - b[0]) + Math.abs(d[i + 1] - b[1]) + Math.abs(d[i + 2] - b[2]);
              if (dd > 12) { painted++; if (dd > 90) { clear++; } }
            }
            out[k][name] = painted ? Math.round(100 * clear / painted) : 0;
          }
        }
        return out;
      }, { PIECES, CREAM, NAVY, OLD });
      /* one sheet per width: the header with the scene, the footer, the pieces */
      const sheet = await ses.browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
      const b64 = b => 'data:image/png;base64,' + b.toString('base64');
      const rows = PIECES.map(([k, size, was]) => `<tr><td>${k}${was ? ' <i>(' + was + ', for comparison)</i>' : ''}</td><td>${vis[k].cream}%</td><td>${vis[k].navy}%</td></tr>`).join('');
      const strip = bg => `<div style="background:${bg};padding:10px;display:flex;gap:12px;align-items:flex-end;justify-content:center;border-radius:6px">` +
        PIECES.filter(p => !p[2]).map(([k, size]) => `<img id="p-${k}-${bg.slice(1)}" style="height:${size}px">`).join('') + '</div>';
      const shotW = Math.min(560, W);
      await sheet.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;padding:18px;background:#FBF6EC;font:13px/1.5 system-ui;color:#2b2b2b">
        <h2 style="text-align:center;margin:0 0 4px">Seasons 4.14.0 — Christmas Preview at ${W}px</h2>
        <p style="text-align:center;margin:0 0 12px;color:#666">?dcc_season=christmas · the scene caught mid-crossing · the wreath in its corner · then the navy footer${W >= 768 ? ' · the dial is a labeled stand-in' : ''}</p>
        <div style="display:flex;gap:16px;justify-content:center;align-items:flex-start">
          <figure style="margin:0;text-align:center"><img src="${b64(top)}" style="width:${shotW}px;border:1px solid #ccc"><figcaption>the header picture and the page</figcaption></figure>
          <figure style="margin:0;text-align:center"><img src="${b64(foot)}" style="width:${shotW}px;border:1px solid #ccc"><figcaption>scrolled to the footer</figcaption></figure>
        </div>
        <h3 style="text-align:center;margin:14px 0 6px">Every Piece at Guest Size, on Cream and on the Navy Footer</h3>
        <div style="display:flex;gap:16px;justify-content:center">${strip(CREAM)}${strip(NAVY)}</div>
        <table style="margin:10px auto;border-collapse:collapse" cellpadding="4"><tr><th>piece</th><th>clearly visible on cream</th><th>on navy</th></tr>${rows}</table>
        <script>var E=${JSON.stringify(Object.fromEntries(await pg.evaluate(P => P.filter(p => !p[2]).map(([k]) => [k, (window.DCCSeasonsEngine.guide.svgDoc(window.DCCSeasonsEngine.guide.svgs[k]))]), PIECES)))};
        for (var k in E) { ['FBF6EC','16314A'].forEach(function (c) { var el = document.getElementById('p-' + k + '-' + c); if (el) el.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(E[k]); }); }</script>`);
      await sheet.waitForTimeout(500);
      await sheet.setViewportSize({ width: 1200, height: await sheet.evaluate(() => document.body.scrollHeight + 20) });
      const file = path.join(OUT, `Seasons - 4.14.0 christmas ${W}.png`);
      await sheet.screenshot({ path: file });
      await sheet.close();
      const minVis = Math.min(...PIECES.filter(p => !p[2]).map(([k]) => Math.min(vis[k].cream, vis[k].navy)));
      report.push({ W, moon: m.moon.map(Math.round), title: m.tb.map(Math.round), dial: m.dial && m.dial.map(Math.round),
        moonOverTitle: m.mT, moonOverDial: m.mD, sideScroll: m.scroll, darkOnMoon: m.darkN, wreath: m.acc.map(v => typeof v === 'number' ? Math.round(v) : v), vis, minVis, errs });
      console.log(`${W}px: moon box ${JSON.stringify(m.moon.map(Math.round))} · title letters ${JSON.stringify(m.tb.map(Math.round))} · dial ${m.dial ? JSON.stringify(m.dial.map(Math.round)) : '(none at this width)'}`);
      console.log(`   moon over a title letter: ${m.mT ? 'YES' : 'no'} (over the title's whole box: ${m.mTB ? 'yes' : 'no'}) · over the dial: ${m.mD ? 'YES' : 'no'} · sideways scroll: ${m.scroll}px · wreath at ${JSON.stringify(m.acc)}`);
      console.log(`   pieces clearly visible (worst of 9, cream/navy): ${minVis}% · page errors: ${errs.length}`);
    } finally { await ses.close(); }
  }
  fs.writeFileSync(path.join(OUT, 'Seasons - 4.14.0 three widths.json'), JSON.stringify(report, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
