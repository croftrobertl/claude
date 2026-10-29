'use strict';
/**
 * DCC Seasons — the crane's VALUE against its photographs (4.13.5 fix 1:
 * "the bodies read almost white"). Renders each key pose at the photo's own
 * crop size over a key color, then compares the luminance of the drawn bird
 * with the photo bird's inside its GrabCut mask (tools/data/anniv-crane-
 * mask-<pose>.png): whole bird, and the BODY alone (the bird less the wings:
 * the drawing's wings drawn in the key color, the photo's rows where its
 * body lies, from the trace's body outline).
 *
 *   node tools/anniv-crane-value.js     (needs python3.11 with cv2)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { DC3_SRC } = require('./anniv-crane3');
const { RIG0: RIG } = require('./anniv-crane-rig');   /* over the photographs: the poses as traced */
const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'anniv-crane-trace.json'), 'utf8'));
const REF = process.env.DCC_REFS || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/aref';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dccval-'));

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.setContent(`<script>${DC3_SRC}; window.RIG = ${JSON.stringify(RIG)}; window.TR = ${JSON.stringify(Object.fromEntries(['stand', 'call', 'leap'].map(k => [k, T[k].ref])))};
    window.draw = (k, wings) => { const R = TR[k], [cx, cy, cw, ch] = R.crop, c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const g = c.getContext('2d'); g.fillStyle = '#00FF00'; g.fillRect(0, 0, cw, ch); g.translate(-cx, -cy); g.translate(R.ground[0], R.ground[1]); g.scale(R.H * R.face, R.H);
      const U = Object.assign({}, RIG[k]); if (!wings) { U.hideWings = 1; }
      dc3Paint(g, U, 0.3 * R.face, -0.954); return c.toDataURL('image/png'); };</script>`);
  for (const k of ['stand', 'call', 'leap']) {
    for (const w of [1, 0]) { const d = await pg.evaluate(([k, w]) => window.draw(k, w), [k, w]); fs.writeFileSync(path.join(TMP, `${k}-${w}.png`), Buffer.from(d.split(',')[1], 'base64')); }
  }
  await b.close();
  const py = `
import sys, json, cv2, numpy as np
T = json.load(open(sys.argv[1])); tmp, refs, data = sys.argv[2], sys.argv[3], sys.argv[4]
def L(px): return 0.2126 * px[:, 2] + 0.7152 * px[:, 1] + 0.0722 * px[:, 0]
def st(v): return '%3d/%3d/%3d' % tuple(np.percentile(v, [25, 50, 75]))
for k in ('stand', 'call', 'leap'):
    R = T[k]['ref']; cx, cy, cw, ch = R['crop']
    ph = cv2.imread(refs + '/' + R['f'])[cy:cy + ch, cx:cx + cw].reshape(-1, 3).astype(float)
    m = cv2.imread(data + '/anniv-crane-mask-' + k + '.png', 0).reshape(-1) > 0
    dw = cv2.imread(tmp + '/' + k + '-1.png').reshape(-1, 3).astype(float)
    db = cv2.imread(tmp + '/' + k + '-0.png').reshape(-1, 3).astype(float)
    key = lambda a: ~((a[:, 1] > 240) & (a[:, 0] < 15) & (a[:, 2] < 15))
    body = key(db) & key(dw)
    # the photo's body: the mask where the drawing's wingless body lies
    print('%-5s L p25/p50/p75  photo bird %s · drawing bird %s · photo body %s · drawing body %s' % (k, st(L(ph[m])), st(L(dw[key(dw)])), st(L(ph[m & body])), st(L(db[body]))))
`;
  fs.writeFileSync(path.join(TMP, 'v.py'), py);
  process.stdout.write(execFileSync('python3.11', ['-I', path.join(TMP, 'v.py'), path.join(__dirname, 'data', 'anniv-crane-trace.json'), TMP, REF, path.join(__dirname, 'data')]).toString());
})().catch(e => { console.error(e); process.exit(1); });
