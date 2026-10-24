'use strict';
/**
 * DCC Seasons — 4.14.0 Christmas: the FINAL palm and flamingo, for Rob's
 * last approval of the drawings.
 *
 * Reads both drawings out of the REAL engine (engine.js, its guide
 * export), so the sheet shows exactly what ships. Each is shown large, at
 * guest size on cream and on the navy footer, beside its round-4 drawing
 * (tools/xmas-redraw.js), and laid at 50% over the CC0 photograph it was
 * checked against, named under it.
 *
 *   node tools/xmas-final.js      -> build/Seasons - 4.14.0 final palm and flamingo.png
 *
 * The photographs are fetched from Wikimedia Commons into DCC_REF (default:
 * this session's scratchpad); they are not tracked.
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./harness');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'Seasons - 4.14.0 final palm and flamingo.png');
const REFDIR = process.env.DCC_REF || '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/ref';
const ENGINE = fs.readFileSync(path.join(ROOT, 'dcc-seasons', 'assets', 'js', 'engine.js'), 'utf8');
const ref = f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(REFDIR, f)).toString('base64');

/* the round-4 drawings, from the lab that rendered them */
const lab = fs.readFileSync(path.join(__dirname, 'xmas-redraw.js'), 'utf8');
const NEW = new Function(lab.slice(lab.indexOf('const NEW = {'), lab.indexOf('/* ---- the pages')).replace('const NEW', 'var NEW') + ';return NEW;')();

const CSS = `
  body{margin:0;background:#FBF6EC;font:13px/1.5 system-ui,sans-serif;color:#2b2b2b;padding:18px 20px}
  h1{font-size:19px;margin:0 0 2px;text-align:center} h2{font-size:15px;margin:0 0 6px;text-align:center}
  .sub{color:#6b6b6b;margin:0 auto 14px;max-width:960px}
  section{border-top:1px solid #E3D9C6;padding:14px 0 10px}
  .note{margin:0 auto 10px;color:#6b6b6b;max-width:960px}
  .row{display:flex;gap:26px;justify-content:center;align-items:flex-end;flex-wrap:wrap}
  figure{margin:0;text-align:center} figcaption{margin-top:6px;color:#555;max-width:300px;margin-left:auto;margin-right:auto}
  .big{height:330px;display:flex;align-items:flex-end;justify-content:center}
  .guest{display:flex;gap:8px;justify-content:center;margin-top:8px}
  .sq{width:62px;height:62px;border-radius:5px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px;box-sizing:border-box}
  .light{background:#FDFBF6;border:1px solid #E3D9C6} .dark{background:#16314A}
  .ov{position:relative;overflow:hidden;border-radius:4px;border:1px solid #D9CDB6}
  .ov img{position:absolute}
  .was{color:#8a8a8a}
`;

(async () => {
  const { chromium } = playwright();
  const launch = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  let browser;
  try { browser = await chromium.launch(launch); }
  catch (e) { browser = await chromium.launch({ ...launch, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('  page error:', e.message));
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style><div id="out"></div>
<script>${ENGINE}</script>
<script>
var E = DCCSeasonsEngine.guide, OLD = ${JSON.stringify({ palm: NEW.sabalpalm, flamingo: NEW.flamingo })};
function url(raw) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(E.svgDoc(raw)); }
function dims(raw) { if (typeof raw === 'function') { raw = raw(); } var a = raw.slice(0, raw.indexOf('|')).split(' '); return [+a[0], +a[1]]; }
var P = E.svgs.palmxmas, F = E.svgs.flamingoxmas;
function piece(raw, bigH, guestH, cap, was) {
  var d = dims(raw), u = url(raw), gw = guestH * d[0] / d[1];
  return '<figure><div class="big"><img src="' + u + '" style="height:' + bigH + 'px"></div>' +
    '<div class="guest"><span class="sq light"><img src="' + u + '" style="height:' + guestH + 'px;width:' + gw + 'px"></span>' +
    '<span class="sq dark"><img src="' + u + '" style="height:' + guestH + 'px;width:' + gw + 'px"></span></div>' +
    '<figcaption>' + (was ? '<span class="was">' + cap + '</span>' : '<b>' + cap + '</b>') + '</figcaption></figure>';
}
function overlay(photo, pw, left, top, raw, aw, ax, ay, W, H, cap) {
  return '<figure><div class="ov" style="width:' + W + 'px;height:' + H + 'px"><img src="' + photo + '" style="left:' + left + 'px;top:' + top + 'px;width:' + pw + 'px">' +
    '<img src="' + url(raw) + '" style="left:' + ax + 'px;top:' + ay + 'px;width:' + aw + 'px;opacity:.5"></div><figcaption style="max-width:' + W + 'px">' + cap + '</figcaption></figure>';
}
var html = '<h1>Seasons 4.14.0 — Christmas: The Final Palm and Flamingo</h1>' +
  '<p class="sub">Rob\\'s last approval for the drawings. Both are read out of the engine as it will ship. Each is shown large, then at the size a guest sees it on cream and on the navy footer, beside its round-4 drawing, and laid at 50% over the CC0 photograph it was checked against. Everything else for Christmas is approved and already in the build.</p>' +
  '<section><h2>The Flamingo in a Santa Hat</h2><p class="note">Rob, round 4: the beak "isn\\'t tucked right up against its neck in the real photo", and the neck "is also not so short and dips below going back up". Now the neck is long, with a real S: down from the breast into a dip below it, then a long rise, curving back at the top and over into a small head; the beak, thick and pale at the base, bent sharply down at the middle and black at the tip, hangs in front of the neck with clear space between. Everything else is as approved: the webbed foot on the folded leg crossing the standing one at mid-leg, the hat\\'s cone falling back to its pom, the scarf, the dark flight feathers along the wing.</p><div class="row">' +
  piece(F, 320, 52, 'Final') + piece(OLD.flamingo, 260, 46, 'Round 4, for comparison', true) +
  overlay(${JSON.stringify(ref('fl3.jpg'))}, 768, -284, -44, F, 252, 0, 0, 252, 444, 'The final drawing at 50% over "American flamingo in Galápagos (Phoenicopterus ruber)", E. Bailey — CC0 (Wikimedia Commons). The photograph\\'s bird stands on two legs; the folded leg is ours.') +
  '</div></section>' +
  '<section><h2>The Sabal Palm</h2><p class="note">Rob, round 4: "too symmetrical"; "needs clear branches before the leaves spike out"; "should be more up top"; "the leaf parts starting to sprawl out further along the branch". Now every frond is a visible stalk from the top of the trunk, and its fan opens further along it, the leaflets leaving the midrib past the stalk\\'s end. Angles, lengths and spreads are set by hand and deliberately unequal: no mirror symmetry left-right or top-bottom. Nine fronds rise above the crown point or go out to the sides; two older ones droop below it, in a browner green. The frond boots stay on the trunk. The lights land on it as before.</p><div class="row">' +
  piece(P, 320, 54, 'Final') + piece(OLD.palm, 260, 46, 'Round 4, for comparison', true) +
  overlay(${JSON.stringify(ref('palm2.jpg'))}, 603, -93, -52, P, 440, 0, 0, 440, 330, 'The final crown at 50% over "SabalPalm.jpg", William Bumgarner — CC0 (Wikimedia Commons), seen from below.') +
  '</div></section>';
document.getElementById('out').innerHTML = html;
Promise.all([].map.call(document.images, function (im) { return im.complete ? 1 : new Promise(function (r) { im.onload = im.onerror = r; }); })).then(function () { window.__done = true; });
</script>`);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1240, height: await page.evaluate(() => document.body.scrollHeight) });
  await page.screenshot({ path: OUT });
  await browser.close();
  console.log('final: ok');
})().catch(e => { console.error(e); process.exit(1); });
