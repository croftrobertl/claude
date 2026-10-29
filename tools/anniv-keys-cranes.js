'use strict';
/**
 * DCC Seasons — the Florida Keys water-line scene `cranes` (Keys KC, the
 * sandhill pair dance) as it is today and with the Anniversary's new bird
 * (tools/anniv-crane3.js, the 4.13.5 polished painter), on the REAL home page at a width (Rob's row 9,
 * the Director 2026-10-30). The engine runs unchanged on the mocked clock;
 * for the "new bird" run, every draw of the `crane` / `cranedance` sprite
 * is replaced in the same box by the new painter's pose (stand while it
 * walks and bows, leap while it dances), so the scene's timing, positions
 * and sizes are exactly the shipped scene's.
 *
 *   node tools/anniv-keys-cranes.js --width=390 [--out=file.json]
 *   (writes the walk, bow and dance moments, whole viewport and close up)
 */
const fs = require('fs');
const path = require('path');
const { config, open } = require('./harness');
const rt = require('./real-theme');
const { DC3_SRC } = require('./anniv-crane3');
const { RIG } = require('./anniv-crane-rig');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const WIDTH = +arg('width', 390);
const OUT = arg('out', path.join(__dirname, '..', 'build', `.anniv-keys-${WIDTH}.json`));

/* in the page: swap the two crane sprites for the new painter, same box */
const SWAP = `${DC3_SRC}
window.__swapCranes = function () {
  var E = window.DCCSeasonsEngine.guide, R = ${JSON.stringify({ stand: RIG.stand, leap: RIG.leap })};
  function key(n) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(E.svgDoc(E.svgs[n])); }
  var kc = key('crane'), kd = key('cranedance');
  /* one canvas per pose, drawn once: the bird facing left as the sprite does,
   * feet on the box's bottom, centred; H is the standing height in box px;
   * the light from the hero (above, a little from the right) */
  function pose(name, bw, bh, H, gy) {
    var S = 4, c = document.createElement('canvas'); c.width = bw * S; c.height = bh * S;
    var g = c.getContext('2d'); g.scale(S, S); g.translate(bw / 2, gy); g.scale(-H, H); dc3Paint(g, R[name], -0.3, -0.954); return c;
  }
  var cs = pose('stand', 44, 70, 66, 69), cd = pose('leap', 64, 70, 46, 69.5);
  var di = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (im) {
    if (im && im.src && arguments.length === 5) {
      if (im.src === kc) { arguments[0] = cs; window.__swapped = (window.__swapped || 0) + 1; }
      else if (im.src === kd) { arguments[0] = cd; window.__swapped = (window.__swapped || 0) + 1; }
    }
    return di.apply(this, arguments);
  };
};`;

(async () => {
  const out = { width: WIDTH, runs: {} };
  for (const mode of ['today', 'new']) {
    const cfg = config(['--placement=content', '--layering=front', '--density=16', '--ambient=0', '--diag', '--theme=florida_keys']);
    cfg.forceHour = 12; cfg.vigOnly = 'cranes'; cfg.vigFirst = 300; cfg.heroFirst = [9999, 10000];
    const ses = await open(rt.page({ config: cfg, extraHead: `<script>${SWAP}</script>` }), { extra: rt.route, viewport: { width: WIDTH, height: WIDTH < 768 ? 844 : 900 }, dsf: 2, init: 'Math.random = (() => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();', ...rt.opts(WIDTH) });
    const pg = ses.page;
    try {
      await pg.addStyleTag({ content: '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}' });
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      await pg.waitForTimeout(900);
      if (mode === 'new') { await pg.evaluate(() => window.__swapCranes()); }
      await pg.evaluate(() => window.DCCSeasonsEngine._state.manual(true));
      await pg.evaluate(() => { const s = window.DCCSeasonsEngine._state; for (let i = 0; i < 900 && !s.vigSt; i++) { s.tick(1000 / 30, 1); } });
      const shots = [];
      /* walk (p1, half way), bow (p2), dance (p3 at two beats) */
      const WANT = [['walking in', s => s.p === 1 && s.t2 > 1.0], ['the bow', s => s.p === 2 && s.t2 > 0.3], ['dancing, one leaps', s => s.p === 3 && s.t2 > 0.95], ['dancing, the other leaps', s => s.p === 3 && s.t2 > 1.4]];
      for (const [name, f] of WANT) {
        const src = f.toString();
        const st = await pg.evaluate(src => { const s = window.DCCSeasonsEngine._state, ok = eval(src); for (let i = 0; i < 900; i++) { const v = s.vigSt; if (!v) { return null; } if (ok(v)) { break; } s.tick(1000 / 30, 1); } const v = s.vigSt; return v && { x: v.x, dir: v.dir, p: v.p, wy: s.waterY, vw: s.vw }; }, src);
        if (!st) { break; }
        /* a sprite first named in this frame decodes asynchronously: give it
         * time, then repaint the same moment with a 1 ms tick */
        await pg.waitForTimeout(400);
        await pg.evaluate(() => window.DCCSeasonsEngine._state.tick(1, 1));
        await pg.waitForTimeout(60);
        const cv = await pg.evaluate(() => { const r = document.querySelector('canvas.dcc-seasons-canvas').getBoundingClientRect(); return [r.left, r.top]; });
        const vx = cv[0] + st.x, vy = cv[1] + st.wy;
        const whole = (await pg.screenshot({ type: 'png' })).toString('base64');
        const cw = 200, ch = 120, clip = { x: Math.max(0, Math.min(WIDTH - cw, vx - st.dir * 22 - cw / 2)), y: Math.max(0, vy - 96), width: cw, height: ch };
        const close = (await pg.screenshot({ type: 'png', clip })).toString('base64');
        shots.push({ name, st, whole, close, clip });
      }
      out.runs[mode] = shots; out[mode + 'Swapped'] = await pg.evaluate(() => window.__swapped || 0);
      console.log(WIDTH, mode, shots.map(s => s.name + '@' + Math.round(s.st.x) + ',' + Math.round(s.st.wy)).join(' · '));
    } finally { await ses.close(); }
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(OUT);
})().catch(e => { console.error(e); process.exit(1); });
