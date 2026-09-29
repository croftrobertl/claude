'use strict';
/**
 * DCC Seasons — what each theme looks like on a phone, and each hero in
 * flight, from the REAL engine at Rob's live settings.
 *
 *   node tools/theme-sheet.js themes [key ...]  → build/Seasons - themes 4.2.0 (n).png
 *   node tools/theme-sheet.js heroes            → build/Seasons - heroes 4.2.0.png
 *
 * Themes: two moments of the guest's 390px view per theme, 3s apart.
 * Heroes: a close-up that follows the hero across the 390px phone at its
 * real size and speed (the camera moves, the hero does not change size).
 */
const fs = require('fs');
const path = require('path');
const { config, open, ROOT, playwright } = require('./harness');
const { page: fixture } = require('./fixture');
const OUT = path.join(ROOT, 'build');
const LIVE = ['--placement=content', '--layering=front', '--density=16', '--opacity=1', '--intensity=0.6', '--diag'];
const HIDE = '.dcc-wx-banner{display:none!important} body{padding-top:0!important} body>div[style*="2147482000"]{display:none!important}';
const THEMES = ['labor_day', 'patriot_day', 'fall_fishing', 'thanksgiving', 'christmas', 'new_years', 'snowbird', 'mlk',
  'mardi_gras', 'valentines', 'presidents', 'strawberry', 'st_patricks', 'spring_canal', 'four_twenty', 'memorial_day',
  'mothers_day', 'veterans_day', 'summer_canal', 'earth_day', 'florida_keys'];
const img = f => `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}">`;

async function sheet(html, file) {
  const { chromium } = playwright();
  const b = await chromium.launch({ args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }));
  const p = await b.newPage({ viewport: { width: 1900, height: 800 } });
  await p.setContent(`<meta charset=utf-8><style>body{margin:0;padding:18px;background:#eef1f4;font:15px system-ui;color:#123}h1{font-size:22px;margin:0 0 6px}
    .g{display:flex;flex-wrap:wrap;gap:14px}.c{width:300px}.c h2{font-size:14px;margin:0 0 4px}.c .r{display:flex;gap:4px}.c img{width:148px;display:block;border:1px solid #bcc}
    .h{margin:10px 0 18px}.h h2{font-size:16px;margin:0 0 6px}.h .r{display:flex;gap:6px}.h img{width:220px;border:1px solid #bcc}</style>${html}`);
  await p.screenshot({ path: file, fullPage: true });
  await b.close();
}

async function themes(keys) {
  const cells = [];
  for (const key of keys) {
    const cfg = config([...LIVE, `--theme=${key}`]);
    cfg.heroEvery = [9999, 10000]; cfg.vigFirst = 1e9; cfg.forceHour = 12;
    const ses = await open(fixture({ kind: 'bravada', config: cfg }), { viewport: { width: 390, height: 844 }, dsf: 2 });
    try {
      await ses.page.addStyleTag({ content: HIDE });
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
      await ses.page.waitForTimeout(4500);
      const a = path.join(OUT, `theme-${key}-a.png`), b = path.join(OUT, `theme-${key}-b.png`);
      await ses.page.screenshot({ path: a });
      await ses.page.waitForTimeout(3000);
      await ses.page.screenshot({ path: b });
      const sp = await ses.page.evaluate(() => JSON.stringify(window.DCCSeasonsEngine._state.sprites));
      cells.push({ key, a, b, sp });
      console.log(key, sp);
    } finally { await ses.close(); }
  }
  const per = 12;
  for (let i = 0; i * per < cells.length; i++) {
    const part = cells.slice(i * per, (i + 1) * per);
    await sheet(`<h1>DCC Seasons 4.2.0 — every changed theme on a 390px phone (Rob's live settings, phone scaling on). Two moments, 3s apart.</h1>
      <div class=g>${part.map(c => `<div class=c><h2>${c.key}</h2><div class=r>${img(c.a)}${img(c.b)}</div></div>`).join('')}</div>`,
      path.join(OUT, `Seasons - themes 4.2.0 (${i + 1}).png`));
  }
}

async function heroes() {
  const H = [['eagle', 'patriot_day', 'Eagle — two-frame wingbeat (July 4 and Patriot Day only)'], ['witch', 'halloween', 'Witch — silhouette with her cat on the broom tail'],
    ['bass', 'fall_fishing', 'Jumping bass — the largemouth drawn mid-leap'], ['osprey', 'florida_keys', 'Florida Keys — the osprey carrying a fish']];
  const rows = [];
  for (const [kind, theme, title] of H) {
    let shots = [];
    for (let attempt = 0; attempt < 8 && shots.length < 5; attempt++) {
      const cfg = config([...LIVE, `--theme=${theme}`]);
      cfg.heroEvery = [1, 1.5]; cfg.vigFirst = 1e9; cfg.forceHour = 12; cfg.heroOnly = kind;
      const ses = await open(fixture({ kind: 'bravada', config: cfg }), { viewport: { width: 390, height: 844 }, dsf: 3 });
      try {
        await ses.page.addStyleTag({ content: HIDE });
        await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
        shots = [];
        for (let i = 0; i < 80 && shots.length < 5; i++) {
          const st = await ses.page.evaluate(() => { const s = window.DCCSeasonsEngine._state; return { h: s.hero, xy: s.heroXY }; });
          if (st.h === kind && st.xy && st.xy[0] > -20 && st.xy[0] < 410) {
            const w = 200, hgt = 150;
            const clip = { x: Math.max(0, Math.min(390 - w, st.xy[0] - w / 2)), y: Math.max(0, Math.min(844 - hgt, st.xy[1] - hgt / 2)), width: w, height: hgt };
            const f = path.join(OUT, `hero-${kind}-${shots.length}.png`);
            await ses.page.screenshot({ path: f, clip });
            shots.push(f);
            await ses.page.waitForTimeout(kind === 'bass' ? 120 : 650);
          } else { await ses.page.waitForTimeout(150); }
        }
      } finally { await ses.close(); }
    }
    console.log(kind, shots.length, 'frames');
    rows.push({ title, shots });
  }
  await sheet(`<h1>DCC Seasons 4.2.0 — the redrawn heroes, followed across a 390px phone at real size and speed</h1>
    ${rows.map(r => `<div class=h><h2>${r.title}</h2><div class=r>${r.shots.map(img).join('')}</div></div>`).join('')}`,
    path.join(OUT, 'Seasons - heroes 4.2.0.png'));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const [mode, ...keys] = process.argv.slice(2);
  if (mode === 'heroes') { await heroes(); } else { await themes(keys.length ? keys : THEMES); }
})().catch(e => { console.error(e); process.exit(1); });
