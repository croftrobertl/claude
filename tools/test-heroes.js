'use strict';
/**
 * DCC Seasons — heroes: when they come, what they draw, what they share
 * the screen with. On a MOCKED CLOCK: the engine's visible-time clock runs
 * faster under the debug-only CFG.vtScale, so "the first hero waits 70s"
 * is proven in a few real seconds.
 *
 *   first-hero timing  — absent/'none' → 3-5s; busy → done → 2s later;
 *                        busy forever → the 70s cap; the second page of a
 *                        visit → 120-180s; storage blocked → 120-180s;
 *                        no hero STARTS while DCCHeroFx says busy
 *   exclusion          — no scene starts while a hero crosses, no hero
 *                        while a scene runs
 *   no emoji           — every canvas fillText while each theme's own hero
 *                        crosses; only the rainbow's ☘ is allowed
 *   phones             — Christmas never below 5 sprites (4 in a scene);
 *                        a scene borrows at most 1 sprite on a phone
 *
 * Usage: node tools/test-heroes.js
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const S = () => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
function cfgFor(theme, extra = []) {
  const cfg = config([`--theme=${theme}`, '--placement=content', '--layering=front', '--density=16', '--diag', ...extra]);
  cfg.vigFirst = 1e9; cfg.vigGap = 1e9; cfg.heroEvery = [120, 180]; cfg.forceHour = 12;
  return cfg;
}
async function boot(cfg, { width = 390, init } = {}) {
  const ses = await open(fixture({ kind: 'bravada', config: cfg }), { viewport: { width, height: 844 } });
  return ses;
}
/* open() navigates before we can add an init script, so for the cases that
 * need one we build the page ourselves through the same harness helpers. */
async function bootWith(cfg, initScript, width = 390) {
  const { playwright } = require('./harness');
  const fs = require('fs'), path = require('path');
  const { chromium } = playwright();
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
    .catch(() => chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }));
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await ctx.newPage();
  if (initScript) { await page.addInitScript(initScript); }
  const html = fixture({ kind: 'bravada', config: cfg });
  const ASSETS = require('./harness').ASSETS;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'dcc.test' && url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    const f = path.join(ASSETS, path.basename(url.pathname));
    if (/^[a-z.]+\.js$/.test(path.basename(url.pathname)) && fs.existsSync(f)) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(f, 'utf8') });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://dcc.test/', { waitUntil: 'load' });
  await page.waitForFunction(S, null, { timeout: 15000 });
  return { page, browser, close: () => browser.close() };
}
async function waitVt(page, v, maxMs = 60000) {
  await page.waitForFunction(v2 => window.DCCSeasonsEngine._state.vt >= v2, v, { timeout: maxMs, polling: 50 });
}

(async () => {
  console.log('\n  --- first-hero timing (mocked clock) ---');
  for (const [name, init] of [['DCCHeroFx absent', null], ["DCCHeroFx 'none'", () => { window.DCCHeroFx = { state: 'none' }; }]]) {
    const cfg = cfgFor('patriot_day'); cfg.vtScale = 4;
    const s = await bootWith(cfg, init);
    try {
      await waitVt(s.page, 8);
      const st = await s.page.evaluate(() => { const x = window.DCCSeasonsEngine._state; return { first: x.firstPage, log: x.heroLog }; });
      const t0 = st.log[0] && st.log[0].start;
      ok(st.first === true && t0 >= 3 && t0 <= 5.3, `${name}: the first page's first hero crosses 3-5s in`, `first=${st.first} start=${t0}`);
    } finally { await s.close(); }
  }
  {
    const cfg = cfgFor('patriot_day'); cfg.vtScale = 8;
    const s = await bootWith(cfg, () => { window.DCCHeroFx = { state: 'busy' }; });
    try {
      await waitVt(s.page, 47);
      const before = await s.page.evaluate(() => window.DCCSeasonsEngine._state.heroLog.length);
      ok(before === 0, 'busy: no hero starts while the hero-image show runs', `${before} heroes by 47s`);
      await s.page.evaluate(() => { window.DCCHeroFx.state = 'done'; document.dispatchEvent(new CustomEvent('dcc:herofx', { detail: { state: 'done' } })); });
      const doneAt = await s.page.evaluate(() => window.DCCSeasonsEngine._state.vt);
      await waitVt(s.page, doneAt + 4);
      const log = await s.page.evaluate(() => window.DCCSeasonsEngine._state.heroLog);
      const d = log[0] ? log[0].start - doneAt : null;
      ok(d !== null && d >= 1.9 && d <= 2.6, "busy → 'done': the first hero crosses 2s after done", `crossed ${d == null ? 'never' : d.toFixed(2) + 's'} after done`);
    } finally { await s.close(); }
  }
  {
    const cfg = cfgFor('patriot_day'); cfg.vtScale = 10;
    const s = await bootWith(cfg, () => { window.DCCHeroFx = { state: 'busy' }; });
    try {
      await waitVt(s.page, 69);
      const early = await s.page.evaluate(() => window.DCCSeasonsEngine._state.heroLog.length);
      await waitVt(s.page, 73);
      const log = await s.page.evaluate(() => window.DCCSeasonsEngine._state.heroLog);
      ok(early === 0 && log[0] && log[0].start >= 70 && log[0].start <= 71, "'done' never arrives: the hero crosses at the 70s cap", `early=${early} start=${log[0] && log[0].start}`);
    } finally { await s.close(); }
  }
  {
    const cfg = cfgFor('patriot_day'); cfg.vtScale = 4;
    const s = await bootWith(cfg, null);
    try {
      await s.page.reload({ waitUntil: 'load' });   // the same tab: the second page of the visit
      await s.page.waitForFunction(S, null, { timeout: 15000 });
      const st = await s.page.evaluate(() => { const x = window.DCCSeasonsEngine._state; return { first: x.firstPage, at: x.heroAt }; });
      ok(st.first === false && st.at >= 120 && st.at <= 180, 'second page of the visit: the first hero waits 120-180s', JSON.stringify(st));
    } finally { await s.close(); }
  }
  {
    const cfg = cfgFor('patriot_day'); cfg.vtScale = 4;
    const s = await bootWith(cfg, () => {
      Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } });
    });
    try {
      const st = await s.page.evaluate(() => { const x = window.DCCSeasonsEngine._state; return { first: x.firstPage, at: x.heroAt }; });
      ok(st.first === null && st.at >= 120 && st.at <= 180, 'storage blocked: today\'s 120-180s timing', JSON.stringify(st));
    } finally { await s.close(); }
  }

  console.log('\n  --- a scene never shares the screen with a hero ---');
  for (const theme of ['florida_keys', 'summer_canal']) {
    const cfg = cfgFor(theme); cfg.vtScale = 1; cfg.heroEvery = [2, 3]; cfg.vigFirst = 800; cfg.vigGap = 6000;
    const s = await bootWith(cfg, null, 1280);
    try {
      // The mocked clock, not wall time: 60s of wall time on a loaded machine
      // runs too few frames to see three of each (the Keys and Summer scenes
      // are long), which failed this check with zero overlaps. 360 simulated
      // seconds of 33ms frames is deterministic and machine-independent.
      await s.page.evaluate(() => window.DCCSeasonsEngine._state.manual(true));
      for (let i = 0; i < 360; i++) { await s.page.evaluate(() => window.DCCSeasonsEngine._state.tick(33, 30)); }
      const st = await s.page.evaluate(() => { const x = window.DCCSeasonsEngine._state; return { h: x.heroLog, v: x.vigLog, vt: x.vt }; });
      const end = e => (e.end < 0 ? st.vt : e.end);
      let overlaps = 0;
      for (const h of st.h) for (const v of st.v) { if (h.start < end(v) && v.start < end(h)) { overlaps++; } }
      ok(st.h.length >= 3 && st.v.length >= 3 && overlaps === 0, `${theme}: ${st.h.length} heroes and ${st.v.length} scenes, never together`, `overlaps ${overlaps}`);
      const names = [...new Set(st.v.map(v => v.name))];
      console.log(`      scenes seen: ${names.join(', ')}`);
    } finally { await s.close(); }
  }

  console.log('\n  --- no hero draws an emoji (the rainbow\'s ☘ strip is Rob\'s one exception) ---');
  const HEROES = { patriot_day: 'eagle', july4: 'eagle', halloween: 'witch', fall_fishing: 'bass', florida_keys: 'osprey',
    christmas: 'sleigh', snowbird: 'manatee', st_patricks: 'rainbow', memorial_day: 'heron' };
  const EMOJI = /\p{Extended_Pictographic}/u;
  for (const [theme, kind] of Object.entries(HEROES)) {
    const cfg = cfgFor(theme, ['--noparticles', '--subtle=off']); cfg.vtScale = 1; cfg.heroEvery = [1, 1.5]; cfg.heroOnly = kind;
    if (theme === 'july4') { cfg.themes.july4.ambient.mode = 'drift'; }   // the fireworks draw the year as text
    const s = await bootWith(cfg, () => {
      window.__txt = [];
      const f = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) {
        const st = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
        window.__txt.push({ t: String(t), hero: st ? st.hero : null });
        return f.apply(this, arguments);
      };
    });
    try {
      let seen = false;
      for (let i = 0; i < 60 && !seen; i++) {
        await s.page.waitForTimeout(500);
        seen = await s.page.evaluate(k => window.DCCSeasonsEngine._state.heroLog.some(h => h.kind === k), kind);
      }
      await s.page.waitForTimeout(1500);
      const txt = await s.page.evaluate(() => window.__txt);
      const drawn = [...new Set(txt.filter(x => x.hero).map(x => x.t))];
      const emoji = drawn.filter(t => EMOJI.test(t) && !(kind === 'rainbow' && t === '☘'));
      ok(seen && !emoji.length, `${theme}: the ${kind} hero crossed and drew no emoji`, `seen=${seen} emoji=${emoji.join(' ')}`);
      if (kind === 'rainbow') { ok(drawn.includes('☘'), 'st_patricks: the rainbow keeps its ☘ strip (Rob\'s exception)', drawn.join(' ')); }
    } finally { await s.close(); }
  }

  console.log('\n  --- phones: Christmas stays full, scenes borrow at most one ---');
  {
    const cfg = cfgFor('christmas'); cfg.vigFirst = 1500; cfg.vigGap = 1e9;
    const s = await bootWith(cfg, null, 390);
    try {
      let minIdle = 99, minScene = 99;
      for (let i = 0; i < 40; i++) {
        const st = await s.page.evaluate(() => { const x = window.DCCSeasonsEngine._state; return { live: x.live, vig: x.vig }; });
        if (st.vig) { minScene = Math.min(minScene, st.live); } else { minIdle = Math.min(minIdle, st.live); }
        await s.page.waitForTimeout(400);
      }
      const v = await s.page.evaluate(() => window.DCCSeasonsEngine._state.vigLog);
      ok(minIdle >= 5, 'christmas @390: at least 5 sprites', `min ${minIdle}`);
      ok(v.length && minScene >= 4, 'christmas @390: at least 4 while the gift-drop scene runs', `min ${minScene}, scenes ${v.length}`);
    } finally { await s.close(); }
  }
  for (const theme of ['florida_keys', 'summer_canal', 'labor_day', 'fall_fishing']) {
    const cfg = cfgFor(theme); cfg.vigFirst = 800; cfg.vigGap = 1500;
    const s = await bootWith(cfg, null, 390);
    try {
      await s.page.waitForTimeout(25000);
      const v = await s.page.evaluate(() => window.DCCSeasonsEngine._state.vigLog);
      const worst = Math.max(...v.map(x => x.borrowed));
      ok(v.length >= 1 && worst <= 1, `${theme} @390: ${v.length} scene(s), each borrowed at most 1 sprite`, `borrowed ${v.map(x => x.name + ':' + x.borrowed).join(' ')}`);
    } finally { await s.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { problems.forEach(p => console.log('  - ' + p)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
