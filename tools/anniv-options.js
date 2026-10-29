'use strict';
/**
 * DCC Seasons — the Anniversary's open choices (4.13.5), rendered for Rob
 * from the real engine on the real home page (tests/real-theme) at 390,
 * his live density (16), the mocked clock and a seeded field, so every
 * option shows the same moment:
 *   1 the mix (how many of each piece) · 2 how they fall · 3 the
 *   background layer · 4 the egg's colours, glyphs and finale.
 * His picks already made (the pieces' looks, the sizes, the pair and where
 * it dances) are not reopened: every option uses them.
 *
 *   node tools/anniv-options.js     (writes build/Seasons - 4.13.5 anniversary choices*.png + clips)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { config, open } = require('./harness');
const rt = require('./real-theme');

const B = path.join(__dirname, '..', 'build');
const TMP = '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/anopt';
fs.mkdirSync(TMP, { recursive: true });
const W = 390;
const SEED = 'Math.random = (() => { let a = 11; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();';

/* the sizes are Rob's picked heights (theme row); only shares and motion vary */
const SZ = { anheart: [22, 30], anrings: [30, 38], ancrystal: [18, 22], antoast: [24, 30], andate: [58, 66], anyear: [28, 32], anpct1: [58, 66], anpct2: [58, 66] };
const ONE = ['andate', 'anyear', 'anpct1', 'anpct2'];
/* the date, the year and the two figures fall UPRIGHT in every option
 * (b 'wobble', as the ghost: no spin), so they can be read, which is why
 * Rob made them half as big again; the motion row decides the rest */
function parts(w, motion) {
  return Object.keys(SZ).map(s => { const p = { s, b: ONE.includes(s) ? 'wobble' : motion(s), sz: SZ[s] }; if (ONE.includes(s)) { p.n = 1; } else if (w[s] > 1) { p.w = w[s]; } return p; });
}
const FALL = () => 'fall';
const MIX = [
  ['A', 'Hearts Lead', 'Hearts the most, then the rings and the crystal, one toast; the date, the year and the two figures one each.', { anheart: 3, anrings: 2, ancrystal: 2, antoast: 1 }, null],
  ['B', 'An Even Mix', 'Every piece as often as every other; the date, the year and the figures still one each.', { anheart: 1, anrings: 1, ancrystal: 1, antoast: 1 }, null],
  ['C', 'A Quieter Field', 'A, but at most 9 on screen at 1280 (as Christmas): fewer pieces, more sky.', { anheart: 3, anrings: 2, ancrystal: 2, antoast: 1 }, 9],
];
const MOTION = [
  ['A', 'They Fall', 'The hearts, rings, crystal and toast fall turning gently, as Halloween’s pieces do.', FALL],
  ['B', 'They Drift', 'They drift slowly down and rock, as Thanksgiving’s leaves do.', () => 'leaf'],
  ['C', 'Hearts Drift, the Rest Fall', 'The hearts drift and rock; the rings, crystal and toast fall turning gently.', s => (s === 'anheart' ? 'leaf' : 'fall')],
];
const BACK = [
  ['A', 'None', 'Nothing behind the pieces, as Thanksgiving.', ''],
  ['B', 'Gold and White Light', 'The soft gold-and-white lights behind the pieces (MLK Day’s layer).', 'goldlight'],
  ['C', 'Blush Hearts', 'Small soft hearts drifting behind the pieces (Valentine’s layer).', 'hearts'],
];
const EGG = [
  ['A', 'Gold and Blush, a Ring', 'Gold and blush rain with hearts among the letters; it ends on a ring.', { colors: ['#E2C25A', '#E8838F'], glyphs: ['♥', 'ﾊ', 'ｷ', '1', '1', '0'], finale: '💍' }],
  ['B', 'Gold and White, a Toast', 'Gold and white rain with stars among the letters; it ends on two glasses.', { colors: ['#E2C25A', '#F4F1E8'], glyphs: ['✦', 'ﾊ', 'ｷ', '1', '1', '0'], finale: '🥂' }],
];

function cfgFor(o) {
  const c = config(['--placement=content', '--layering=front', '--density=16', '--diag', '--theme=anniversary']);
  const t = c.themes.anniversary;
  if (o.particles) { t.ambient.particles = o.particles; }
  if (o.max) { t.ambient.max = o.max; } else { delete t.ambient.max; }
  if (o.egg) { t.egg = Object.assign({ finaleAt: 4000 }, o.egg); }   /* the finale early, for the sheet (18 s on the site) */
  c.subtle.map.anniversary = o.subtle || '';
  c.vigFirst = 1e9; c.heroFirst = [9999, 10000];   /* the field alone: the pair was picked already */
  c.forceHour = 12;
  return c;
}
async function boot(o) {
  const ses = await open(rt.page({ config: cfgFor(o) }), { extra: rt.route, viewport: { width: W, height: 844 }, dsf: 2, init: SEED, ...rt.opts(W) });
  await ses.page.addStyleTag({ content: '.dcc-wx-banner{display:none!important} #dcc-seasons-diag,.dcc-seasons-diag{display:none!important}' });
  await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
  await ses.page.waitForTimeout(2500);
  await ses.page.evaluate(() => window.DCCSeasonsEngine._state.manual(true));
  return ses;
}
const tick = (pg, s) => pg.evaluate(s => { const st = window.DCCSeasonsEngine._state; for (let i = 0; i < s * 30; i++) { st.tick(1000 / 30, 1); } }, s);
const b64 = buf => 'data:image/png;base64,' + buf.toString('base64');

async function stills(o) {
  const ses = await boot(o), pg = ses.page;
  try {
    await tick(pg, 14); await pg.waitForTimeout(500); await tick(pg, 0.1);
    const top = b64(await pg.screenshot({ clip: { x: 0, y: 0, width: W, height: 600 } }));
    /* the close-up: round a figure, the date or the rings, wherever one is */
    const at = await pg.evaluate(() => {
      const s = window.DCCSeasonsEngine._state, want = ['anpct1', 'andate', 'anpct2', 'anyear', 'anrings', 'antoast', 'anheart'];
      /* over the header photograph first (a pale crystal on the white page
       * reads as nothing in a close-up), else the biggest piece in view */
      const hb = document.querySelector('#header-image-main-inside').getBoundingClientRect().bottom;
      const inView = s.parts.filter(p => !p.dormant && p.y > 40 && p.y < 560 && p.x > 30 && p.x < 360 && p.sp && want.includes(p.sp.s));
      const over = inView.filter(p => p.y < hb - 20);
      for (const k of want) { const p = over.find(q => q.sp.s === k); if (p) { return [p.x, p.y]; } }
      const big = inView.sort((a, b) => b.size - a.size)[0];
      return big ? [big.x, big.y] : [195, 300];
    });
    const close = b64(await pg.screenshot({ clip: { x: Math.max(0, Math.min(W - 130, at[0] - 65)), y: Math.max(0, at[1] - 48), width: 130, height: 96 } }));
    await pg.evaluate(() => window.scrollTo(0, 1100)); await tick(pg, 4); await pg.waitForTimeout(400); await tick(pg, 0.1);
    const text = b64(await pg.screenshot({ clip: { x: 0, y: 0, width: W, height: 600 } }));
    const n = await pg.evaluate(() => window.DCCSeasonsEngine._state.live);
    return { top, close, text, n };
  } finally { await ses.close(); }
}
async function clip(o, name) {
  const ses = await boot(o), pg = ses.page, dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  try {
    await tick(pg, 10);
    for (let i = 0; i < 240; i++) { await tick(pg, 1 / 30); fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.png'), await pg.screenshot({ clip: { x: 0, y: 0, width: W, height: 640 } })); }
  } finally { await ses.close(); }
  const out = path.join(B, `Seasons - 4.13.5 anniversary motion ${name}.mp4`);
  const ff = spawnSync('/usr/bin/ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, '%04d.png'), '-vf', 'scale=780:-2:flags=lanczos', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out]);
  if (ff.status) { throw new Error(String(ff.stderr)); }
  return out;
}
async function egg(o) {
  const ses = await boot(o), pg = ses.page;
  try {
    await pg.evaluate(() => window.DCCSeasonsEngine._state.manual(false));
    for (let i = 0; i < 4; i++) { await pg.click('#header-page-title .entry-title', { delay: 20 }); await pg.waitForTimeout(90); }
    await pg.waitForTimeout(2600);
    const rain = b64(await pg.screenshot({ clip: { x: 0, y: 0, width: W, height: 700 } }));
    await pg.waitForTimeout(2600);
    const fin = b64(await pg.screenshot({ clip: { x: 0, y: 0, width: W, height: 700 } }));
    return { rain, fin };
  } finally { await ses.close(); }
}

(async () => {
  const CACHE = path.join(TMP, 'R.json');
  let R = process.argv.includes('--sheet') && fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : null;
  if (!R) { R = await capture(); fs.writeFileSync(CACHE, JSON.stringify(R)); }
  await sheet(R);
})().catch(e => { console.error(e); process.exit(1); });

async function capture() {
  const R = { mix: [], motion: [], back: [], egg: [], clips: [] };
  for (const [k, name, note, w, max] of MIX) { R.mix.push({ k, name, note, ...(await stills({ particles: parts(w, FALL), max })) }); console.log('mix', k); }
  const Aw = MIX[0][3];
  for (const [k, name, note, m] of MOTION) { R.motion.push({ k, name, note, ...(await stills({ particles: parts(Aw, m) })) }); R.clips.push(await clip({ particles: parts(Aw, m) }, k)); console.log('motion', k); }
  for (const [k, name, note, fx] of BACK) { R.back.push({ k, name, note, ...(await stills({ particles: parts(Aw, FALL), subtle: fx })) }); console.log('back', k); }
  for (const [k, name, note, e] of EGG) { R.egg.push({ k, name, note, ...(await egg({ particles: parts(Aw, FALL), egg: e })) }); console.log('egg', k); }
  return R;
}

async function sheet(R) {

  const card = o => `<div class="opt"><h3>${o.k} · ${o.name}</h3><p>${o.note}</p><div class="pair"><figure><img src="${o.top}" width="300"><figcaption>over the header photograph</figcaption></figure><figure><img src="${o.text}" width="300"><figcaption>over the page text</figcaption></figure></div><figure><img src="${o.close}" width="390"><figcaption>3× close-up</figcaption></figure>${o.n != null ? `<p class="n">${o.n} pieces on screen at 390</p>` : ''}</div>`;
  const eggCard = o => `<div class="opt"><h3>${o.k} · ${o.name}</h3><p>${o.note}</p><div class="pair"><figure><img src="${o.rain}" width="300"><figcaption>2.6 s after the fourth tap</figcaption></figure><figure><img src="${o.fin}" width="300"><figcaption>the finale: the rain gathers into the shape (at 4 s here; 18 s on the site)</figcaption></figure></div></div>`;
  const sec = (t, sub, cards) => `<section><h2>${t}</h2><p class="sub">${sub}</p><div class="row">${cards}</div></section>`;
  const head = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#f6f3ee;font:14px/1.45 -apple-system,Segoe UI,sans-serif;color:#222;padding:0 20px 30px}
    h1,h2,h3{text-align:center;margin:0} h1{font-size:26px;padding:24px 0 4px} h2{font-size:21px;margin:30px 0 4px} h3{font-size:16px;margin:6px 0}
    p{text-align:center;margin:3px auto;max-width:640px;color:#555} p.sub{max-width:980px} p.n{font-weight:600;color:#333}
    .row{display:flex;gap:22px;justify-content:center;flex-wrap:wrap;align-items:flex-start} .opt{background:#fff;border:1px solid #ddd;border-radius:6px;padding:10px 12px;width:640px}
    .pair{display:flex;gap:10px;justify-content:center} figure{margin:6px 0;text-align:center} figcaption{color:#777;font-size:12px} img{border:1px solid #ccc;border-radius:3px}</style><body>`;
  const p1 = `${head}<h1>The Anniversary: The Choices Still Open</h1>
    <p class="sub">Everything Rob picked is already in: the pieces’ looks, their sizes, the pair and where it dances. What is left is how the field behaves. Every option is the real engine on the real home page at 390, at his live density (16), at the same moment of the same seeded field.</p>
    ${sec('1 · The Mix', 'How many of each piece. In every option the date, the year and the two figures drift down UPRIGHT, so they can be read; row 2 decides how the others fall. Nothing behind them here (row 3).', R.mix.map(card).join(''))}
    ${sec('2 · How They Fall', 'With mix A. Each has a 8-second clip: Seasons - 4.13.5 anniversary motion A / B / C.mp4.', R.motion.map(card).join(''))}</body>`;
  const p2 = `${head}<h1>The Anniversary: The Choices Still Open (2 of 2)</h1>
    ${sec('3 · Behind the Pieces', 'The background layer, under the falling pieces. With mix A, falling.', R.back.map(card).join(''))}
    ${sec('4 · The Easter Egg', 'Four taps on the homepage title, as every theme. Its colours, the glyphs among the letters, and what it ends on.', R.egg.map(eggCard).join(''))}
    <section><h2>5 · A Corner Accent</h2><p class="sub">Halloween has its web, Thanksgiving its cornucopia, Christmas its wreath. The Anniversary has none: nothing is drawn for one yet. Rob: none, or should one be drawn (and of what)?</p></section></body>`;
  /* a plain page (the harness routes every request, so file:// never loads there) */
  const { chromium } = require('playwright');
  const br = await chromium.launch(), files = [];
  for (const [i, html] of [p1, p2].entries()) {
    const f = path.join(TMP, `sheet${i + 1}.html`); fs.writeFileSync(f, html);
    const pg = await br.newPage({ viewport: { width: 1400, height: 900 } });
    await pg.goto('file://' + f); await pg.waitForTimeout(600);
    const out = path.join(B, `Seasons - 4.13.5 anniversary choices ${i + 1} of 2.png`);
    await pg.screenshot({ path: out, fullPage: true }); await pg.close();
    files.push(out);
  }
  await br.close();
  console.log(files.concat(R.clips).join('\n'));
}
