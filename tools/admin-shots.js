'use strict';
/**
 * DCC Seasons — full-page screenshots of every settings tab at 1440 and 390
 * (Admin UI round 1, 4.18.0). Renders the REAL page with
 * tools/render-settings.php, so DCC_ROOT=<another build> shoots "before".
 *
 *   node tools/admin-shots.js --out=<dir> [--prefix="Seasons - before"]
 *        [--tabs=settings,guide,preview] [--opt=file.json] [--root=<build>]
 *        [--widths=1440,390]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { playwright } = require('./harness');

const A = {};
for (const a of process.argv.slice(2)) { const m = /^--([a-z]+)=(.*)$/.exec(a); if (m) { A[m[1]] = m[2]; } }
const OUT = path.resolve(A.out || 'build');
const PREFIX = A.prefix || 'Seasons - admin';
const TABS = (A.tabs || 'schedule,where,look,egg,guide,preview').split(',');
const WIDTHS = (A.widths || '1440,390').split(',').map(Number);
fs.mkdirSync(OUT, { recursive: true });

function render(tab) {
  const env = Object.assign({}, process.env);
  if (A.root) { env.DCC_ROOT = path.resolve(A.root, 'dcc-seasons'); }
  const args = [path.join(__dirname, 'render-settings.php'), '--tab=' + (tab === 'settings' ? '' : tab)];
  if (A.opt) { args.push('--opt=' + path.resolve(A.opt)); }
  const html = execFileSync('php', args, { encoding: 'utf8', env, maxBuffer: 64 << 20 });
  const f = path.join(OUT, '.render-' + tab + '.html');
  fs.writeFileSync(f, html);
  return f;
}

(async () => {
  const { chromium } = playwright();
  let b;
  try { b = await chromium.launch({ args: ['--no-sandbox'] }); }
  catch (e) { b = await chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  for (const tab of TABS) {
    const f = render(tab);
    for (const w of WIDTHS) {
      const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto('file://' + f, { waitUntil: 'load' });
      await p.waitForTimeout(tab === 'guide' || tab === 'preview' ? 1500 : 500);
      const out = path.join(OUT, `${PREFIX} ${tab} ${w}.png`);
      await p.screenshot({ path: out, fullPage: true });
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      console.log(`${tab} ${w}: ${path.basename(out)}${sw > w ? ' (scrolls sideways: ' + sw + ')' : ''}${errs.length ? ' ERR ' + errs.join(' | ') : ''}`);
      await p.close();
    }
    fs.unlinkSync(f);
  }
  await b.close();
})();
