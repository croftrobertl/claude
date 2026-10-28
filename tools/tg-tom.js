'use strict';
/**
 * DCC Seasons — the 4.13.2 strutting tom and his poults: the fit check.
 * Runs the engine's OWN painters (the TK_START…TK_END block of engine.js)
 * in a page and draws them over their photographs at 50%, plus a frame
 * strip of the walk and the peck.
 *
 *   node tools/tg-tom.js [--out=file.png] [--frames]
 *   DCC_TOM=<tom photo> DCC_POULT=<poult photo>
 */
const fs = require('fs');
const path = require('path');
const { open, ROOT } = require('./harness');

const ENGINE = path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js');
const SCR = '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad';
const TOM = process.env.DCC_TOM || path.join(SCR, 'tom', 't2big.jpg');
const POULT = process.env.DCC_POULT || path.join(SCR, 'tom', 'big-f1.jpg');
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').slice(k.length + 3);

function block() {
  const s = fs.readFileSync(process.env.DCC_TK || ENGINE, 'utf8');
  const a = s.indexOf('/* TK_START'), b = s.indexOf('/* TK_END */');
  if (a < 0 || b < 0) { throw new Error('no TK block in ' + ENGINE); }
  return s.slice(a, b);
}
module.exports = { block };

if (require.main === module) {
  (async () => {
    const out = arg('out') || path.join(SCR, 'tom', 'fit.png');
    const jpg = 'data:image/jpeg;base64,' + fs.readFileSync(TOM).toString('base64');
    /* the photo's pixels: unit = 10 px, origin (370, 1085) */
    const html = `<!doctype html><body style="margin:0;background:#fff"><canvas id=c></canvas><script>${block()}
      window.go = async (jpg, frames) => {
        const im = new Image(); im.src = jpg; await im.decode();
        const S = 0.5, W = 1200 * S, H = 1100 * S, cols = frames ? 4 : 3;
        const c = document.getElementById('c'); c.width = W * cols; c.height = frames ? H * 2 + 20 : H;
        const g = c.getContext('2d');
        for (let k = 0; k < cols; k++) {
          g.save(); g.translate(W * k, 0);
          g.drawImage(im, 320, 1040, 1200, 1100, 0, 0, W, H);
          if (k > 0) { g.globalAlpha = k === 1 ? 0.5 : 1; if (k === 2) { g.fillStyle = '#F6F1E7'; g.fillRect(0, 0, W, H); } g.scale(S * 10, S * 10); g.translate((370 - 320) / 10, (1085 - 1040) / 10); tkPaint(g, k === 3 ? 0.3 : 0.12, 0, 0); }
          g.restore();
        }
        if (frames) {
          for (let k = 0; k < 8; k++) { g.save(); g.translate(k * 150 * 2, H + 20); g.scale(2.6, 2.6); tkPaint(g, k / 8, 0, 0); g.restore(); }
        }
        document.title = 'done';
      };</script>`;
    if (process.argv.includes('--poult')) {
      const pj = 'data:image/jpeg;base64,' + fs.readFileSync(POULT).toString('base64');
      const ph = `<!doctype html><body style="margin:0;background:#fff"><canvas id=c></canvas><script>${block()}
      window.go = async (jpg) => { const im = new Image(); im.src = jpg; await im.decode();
        const W = 760 * 0.75, H = 850 * 0.75, c = document.getElementById('c'); c.width = W * 4; c.height = H + 260; const g = c.getContext('2d');
        for (let k = 0; k < 3; k++) { g.save(); g.translate(W * k, 0); g.drawImage(im, 1750, 1450, 760, 850, 0, 0, W, H);
          if (k > 0) { g.globalAlpha = k === 1 ? 0.5 : 1; if (k === 2) { g.fillStyle = '#F6F1E7'; g.fillRect(0, 0, W, H); } g.scale(7.5, 7.5); g.translate(10, 10); kpPaint(g, 0.2, 0); } g.restore(); }
        g.save(); g.translate(W * 3, 0); g.fillStyle = '#F6F1E7'; g.fillRect(0, 0, W, H); g.scale(7.5, 7.5); g.translate(10, 10); kpPaint(g, -1, 1); g.restore();
        for (let k = 0; k < 8; k++) { g.save(); g.translate(k * 290 + 20, H + 20); g.scale(3, 3); kpPaint(g, k / 8, 0); g.restore(); }
        document.title = 'done'; };</script>`;
      const ses = await open(ph, { viewport: { width: 2400, height: 1200 }, dsf: 1 });
      await ses.page.evaluate(a => window.go(a), pj); await ses.page.waitForFunction(() => document.title === 'done');
      await (await ses.page.$('#c')).screenshot({ path: out }); await ses.close(); console.log(out); return;
    }
    const ses = await open(html, { viewport: { width: 2400, height: 1200 }, dsf: 1 });
    await ses.page.evaluate(a => window.go(...a), [jpg, process.argv.includes('--frames')]);
    await ses.page.waitForFunction(() => document.title === 'done');
    const el = await ses.page.$('#c');
    await el.screenshot({ path: out });
    await ses.close();
    console.log(out);
  })().catch(e => { console.error(e); process.exit(1); });
}
