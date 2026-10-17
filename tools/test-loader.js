'use strict';
/**
 * DCC Seasons — WHEN the engine is fetched, and what the config carries
 * (4.12.1).
 *
 * The audit of live 4.12.0 found the engine's request going out ~1.9 s into
 * an iPhone page load, while the hero photograph and the booking widget were
 * still coming down: the loader asked requestIdleCallback with a 3 s
 * timeout, and fell back to a flat setTimeout(1500) where that does not
 * exist. Both can fire BEFORE the window load event. The fix gates
 * everything on load, then takes whichever comes first of a short breath and
 * the visitor's first scroll or tap.
 *
 * This suite watches the real loader across the load event. The page carries
 * a deliberately slow header image (served by opts.extra), so there is a
 * long, observable window in which the page is interactive and load has not
 * fired yet — exactly the phone case.
 *
 * It proves:
 *   - nothing is fetched before load, and no canvas exists yet;
 *   - after load, with NO interaction at all, the engine arrives and renders
 *     within a few seconds;
 *   - a first scroll, and a first tap, each start it sooner than the breath;
 *   - with the themes trimmed to the shipped window, a visitor still gets
 *     the theme their own clock resolves to;
 *   - an admin preview of a theme OUTSIDE that window still renders it.
 *
 *   node tools/test-loader.js
 */
const { execFileSync } = require('child_process');
const path = require('path');
const { config, open, ROOT } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const QUIET = '.dcc-wx-banner{display:none!important}';
/* a 1x1 gif, served late */
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/** The theme today's date resolves to, from the REAL PHP resolver. */
function themeToday() {
  const out = execFileSync('php', ['-r', `
    define('ABSPATH',1);
    function __($s,$d=null){return $s;} function esc_html__($s,$d=null){return $s;}
    function apply_filters($t,$v){return $v;}
    require 'dcc-seasons/includes/class-schedule.php';
    $r = DCC_Seasons\\Schedule::active(DCC_Seasons\\Schedule::defaults(), date('Y-m-d'));
    echo is_array($r) && !empty($r['theme']) ? $r['theme'] : DCC_Seasons\\Schedule::BASE_THEME;
  `], { cwd: ROOT, encoding: 'utf8' });
  return out.trim();
}

/* Instrumentation, first thing in the head: when load fired, and when the
 * engine's own request started (resource timing, not a guess). */
const PROBE = `<script>
  window.__loadT = null;
  addEventListener('load', function () { window.__loadT = performance.now(); });
  window.__engineT = function () {
    var e = performance.getEntriesByType('resource').filter(function (r) { return /engine(\\.min)?\\.js/.test(r.name); });
    return e.length ? e[0].startTime : null;
  };
</script>`;

/* Variants that poke the page the moment load has been handled. setTimeout 0
 * inside the load handler runs AFTER every load listener, so the loader has
 * armed its own listeners by then — a synchronous dispatch would be fired
 * into the void and prove nothing. */
const POKE = kind => `<script>
  addEventListener('load', function () { setTimeout(function () {
    ${kind === 'scroll' ? "dispatchEvent(new Event('scroll'));"
      : "window.dispatchEvent(new Event('pointerdown'));"}
  }, 0); });
</script>`;

/** Open the fixture with a slow header image and the probe in the head. */
async function slowPage(cfg, delay, extraHead, viewport) {
  let html = fixture({ kind: 'bravada', config: cfg, banner: true });
  html = html.replace('<head>', '<head>' + PROBE + (extraHead || ''));
  html = html.replace('<div id="header-image-main-inside">',
    '<div id="header-image-main-inside"><img id="slow-hero" src="/slow-hero.gif" width="40" height="40" alt="">');
  return open(html, {
    viewport: viewport || { width: 390, height: 700 }, dsf: 3, waitUntil: 'commit',
    extra: (route, url) => {
      if (url.pathname !== '/slow-hero.gif') { return false; }
      setTimeout(() => { route.fulfill({ contentType: 'image/gif', body: GIF }).catch(() => {}); }, delay);
      return true;
    },
  });
}

const cfgFor = args => config(['--placement=content', '--layering=front', '--density=16', '--diag', ...args]);

(async () => {
  /* ---------- 1. nothing before load; then without a finger lifted ------- */
  console.log('\n  --- the engine waits for the load event (390px) ---');
  {
    const ses = await slowPage(cfgFor([]), 2500, '', { width: 390, height: 700 });
    const pg = ses.page;
    const js = [];
    pg.on('request', r => { if (/\.js(\?|$)/.test(r.url())) { js.push(path.basename(new URL(r.url()).pathname)); } });
    try {
      await pg.addStyleTag({ content: QUIET }).catch(() => {});
      /* the loader itself has run (it is deferred, so it runs before load) */
      await pg.waitForFunction(() => !!window.DCC_SEASONS, null, { timeout: 10000 });
      await pg.waitForTimeout(1600);     /* past the OLD 1500 ms fallback */
      const before = await pg.evaluate(() => ({
        loaded: window.__loadT !== null,
        engine: window.__engineT(),
        hasEngine: !!window.DCCSeasonsEngine,
        canvas: !!document.querySelector('canvas.dcc-seasons-canvas, canvas.dcc-seasons-sky'),
      }));
      ok(!before.loaded, 'at 1.6 s the load event has not fired yet (the slow hero image)', JSON.stringify(before));
      ok(before.engine === null && !before.hasEngine, 'and the engine has NOT been requested', JSON.stringify(before));
      ok(!before.canvas, 'and there is no canvas', JSON.stringify(before));
      ok(!js.some(f => /engine/.test(f)), `only the loader was fetched so far (${js.join(', ') || 'none'})`, js.join(', '));
      /* now let load happen, and touch nothing */
      await pg.waitForFunction(() => window.__loadT !== null, null, { timeout: 15000 });
      await pg.waitForFunction(() => !!document.querySelector('canvas.dcc-seasons-canvas, canvas.dcc-seasons-sky'),
        null, { timeout: 8000 });
      const after = await pg.evaluate(() => ({ load: window.__loadT, engine: window.__engineT(), theme: window.DCCSeasonsEngine._state.theme }));
      ok(after.engine >= after.load, `the request started after load (+${(after.engine - after.load).toFixed(0)} ms)`, JSON.stringify(after));
      ok(after.engine - after.load < 3000, 'and within 3 s of it, with no interaction at all', String(after.engine - after.load));
      ok(!!after.theme, `the engine started and rendered (theme ${after.theme})`, JSON.stringify(after));
    } finally { await ses.close(); }
  }

  /* ---------- 2. a first scroll, and a first tap, start it sooner -------- */
  for (const kind of ['scroll', 'pointerdown']) {
    console.log(`\n  --- a first ${kind} starts it sooner than the breath ---`);
    const ses = await slowPage(cfgFor([]), 900, POKE(kind), { width: 390, height: 700 });
    const pg = ses.page;
    try {
      await pg.addStyleTag({ content: QUIET }).catch(() => {});
      await pg.waitForFunction(() => window.__engineT() !== null, null, { timeout: 15000 });
      const r = await pg.evaluate(() => ({ load: window.__loadT, engine: window.__engineT() }));
      const gap = r.engine - r.load;
      ok(gap >= 0, `still not before load (+${gap.toFixed(0)} ms)`, JSON.stringify(r));
      /* the breath is 400 ms; the event path must beat it clearly */
      ok(gap < 300, `the ${kind} started the fetch at +${gap.toFixed(0)} ms, inside the 400 ms breath`, String(gap));
      await pg.waitForFunction(() => !!document.querySelector('canvas.dcc-seasons-canvas, canvas.dcc-seasons-sky'), null, { timeout: 8000 });
      ok(true, 'and it rendered');
    } finally { await ses.close(); }
  }

  /* ---------- 3. a trimmed config still serves the visitor's theme ------- */
  console.log('\n  --- only the reachable themes are shipped ---');
  {
    const want = themeToday();
    const cfg = cfgFor(['--window']);
    const keys = Object.keys(cfg.themes);
    ok(keys.length < 27, `the config carries ${keys.length} themes, not 27`, keys.join(','));
    ok(keys.includes(want), `today's theme (${want}) is among them`, keys.join(','));
    ok(keys.includes('florida_keys') && keys.includes('classic'), 'so are the base theme and classic', keys.join(','));
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: 390, height: 700 }, dsf: 3 });
    const pg = ses.page;
    try {
      await pg.addStyleTag({ content: QUIET }).catch(() => {});
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      const got = await pg.evaluate(() => ({ theme: window.DCCSeasonsEngine._state.theme, canvas: !!document.querySelector('canvas.dcc-seasons-canvas, canvas.dcc-seasons-sky') }));
      ok(got.theme === want, `the visitor's own clock resolved to ${want} and the engine got it (${got.theme})`, JSON.stringify(got));
      ok(got.canvas, 'and it rendered', JSON.stringify(got));
    } finally { await ses.close(); }
  }

  /* ---------- 4. a preview of a theme outside the window ----------------- */
  console.log('\n  --- an admin preview of a theme outside the window ---');
  {
    /* March: labor_day is months away, so the window cannot contain it */
    const base = cfgFor(['--window', '--today=2027-03-25']);
    ok(!base.themes.labor_day, 'labor_day is NOT in a 25 March config', Object.keys(base.themes).join(','));
    const cfg = cfgFor(['--window', '--today=2027-03-25', '--theme=labor_day']);
    ok(!!cfg.themes.labor_day, 'but a preview of it carries its definition', Object.keys(cfg.themes).join(','));
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: 1280, height: 800 } });
    const pg = ses.page;
    try {
      await pg.addStyleTag({ content: QUIET }).catch(() => {});
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      const got = await pg.evaluate(() => ({ theme: window.DCCSeasonsEngine._state.theme, sprites: window.DCCSeasonsEngine._state.parts.length }));
      ok(got.theme === 'labor_day', `and the engine renders it (${got.theme})`, JSON.stringify(got));
      ok(got.sprites > 0, `with its own sprites (${got.sprites})`, JSON.stringify(got));
    } finally { await ses.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
