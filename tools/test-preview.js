'use strict';
/**
 * DCC Seasons — 4.14.3: the Preview tab (Rob's Step 0). The REAL rendered
 * admin page (tools/render-settings.php --tab=preview) with the REAL home
 * page (tests/real-theme) in its frame, served from one origin as on the
 * site, the frame's config built from its own query string the way
 * Plugin::config() builds it for an administrator:
 *
 *  - the tab: the theme chosen (today's by default), a width control, one
 *    play button per scene and per flyer the engine lists, the easter egg,
 *    and that theme's guide card alone below;
 *  - "Falling Pieces and Background": every variant of a piece takes its
 *    turn (all three Christmas glass balls on screen);
 *  - a scene button plays that scene and no other, a flyer button that
 *    flyer and no scene; the width control resizes the frame;
 *  - the egg button opens the egg by tapping the title, as a guest does;
 *  - and nothing of it reaches a guest: without the preview the balls are
 *    picked at random and dcc_play is not in the config
 *    (tools/test-check-key.php proves the server-side gate).
 *
 *   node tools/test-preview.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const rt = require('./real-theme');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const OPT = { enabled: 1, ambient: 1, egg: 1, subtle: 1, density: 16, opacity: 1, layering: 'front', placement: 'content', richness: 'full', fx_vignettes: 1 };

function admin(theme) {
  const of = path.join(require('os').tmpdir(), 'dcc-pv-opt.json');
  fs.writeFileSync(of, JSON.stringify(OPT));
  let html = execFileSync('php', [path.join(__dirname, 'render-settings.php'), '--tab=preview', `--opt=${of}`, ...(theme ? [`--theme=${theme}`] : [])], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  html = html.replace(/file:\/\/[^"']*\/assets\/js\/([a-z.-]+\.js)/g, 'http://dcc.test/$1').replace(/file:\/\/[^"']*\/assets\/css\/([a-z.-]+\.css)/g, 'http://dcc.test/css/$1');
  return html.replace(/https:\/\/doracanalcourt\.com\/\?/g, 'http://dcc.test/home/?');
}
/* the front page the frame asks for, as Plugin::config() answers an administrator */
function front(url) {
  const q = url.searchParams, theme = q.get('dcc_season');
  const cfg = config(['--theme=' + theme, '--placement=content', '--layering=front', '--density=16', '--diag']);
  cfg.forceHour = 12;
  if (q.get('dcc_play') && /^[vh]:[a-z0-9_]{1,40}$/.test(q.get('dcc_play'))) { cfg.play = q.get('dcc_play'); }
  if (q.has('dcc_variants')) { cfg.variants = true; }
  /* the diagnostics panel (--diag, for the suite's own reads) is hidden: the site never shows it */
  return rt.page({ config: cfg, extraHead: '<style>div[style*="2147482000"]{display:none!important}</style>' });
}

(async () => {
  console.log('\n  --- the Preview tab, Christmas, on the real home page ---');
  const html = admin('christmas');
  const ses = await open(html, { viewport: { width: 1280, height: 1000 }, extra: (route, url) => {
    if (url.hostname === 'dcc.test' && url.pathname === '/home/') { route.fulfill({ contentType: 'text/html; charset=utf-8', body: front(url) }); return true; }
    if (url.hostname === 'dcc.test' && url.pathname.startsWith('/css/')) {
      const f = path.join(ROOT, 'dcc-seasons/assets/css', path.basename(url.pathname));
      route.fulfill({ status: fs.existsSync(f) ? 200 : 404, contentType: 'text/css', body: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '' }); return true;
    }
    return rt.route(route, url);
  } });
  const pg = ses.page, errs = [];
  /* the captured live page carries SpeedyCache's inline script, whose
   * helper the fixture does not load: the site's noise, not ours */
  pg.on('pageerror', e => { if (!/speedycache/i.test(e.message)) { errs.push(e.message); } });
  /* read the LIVE frame through the parent (same origin): the frame's own
   * window runs the function */
  const frameState = async fn => pg.evaluate(src => { const w = document.querySelector('.dcc-pv-frame').contentWindow; return w.eval('(' + src + ')()'); }, String(fn));
  try {
    await pg.waitForSelector('.dcc-pv-play button', { timeout: 20000 });
    const ui = await pg.evaluate(() => ({
      title: document.querySelector('.dcc-pv-title').textContent, ta: getComputedStyle(document.querySelector('.dcc-pv-title')).textAlign,
      sel: document.querySelector('#dcc-pv-theme').value, opts: document.querySelectorAll('#dcc-pv-theme option').length,
      buttons: [...document.querySelectorAll('.dcc-pv-play button')].map(b => b.getAttribute('data-kind') + '|' + b.textContent),
      widths: [...document.querySelectorAll('.dcc-pv-seg button')].map(b => b.textContent),
      cards: [...document.querySelectorAll('.dcc-guide-card')].map(c => c.id),
      tabs: [...document.querySelectorAll('.dcc-seasons-tabs a')].map(a => a.textContent + (a.classList.contains('nav-tab-active') ? '*' : '')),
    }));
    ok(ui.title === 'Preview a Whole Theme' && ui.ta === 'center', 'the tab is titled, centered, in Title Case', JSON.stringify([ui.title, ui.ta]));
    ok(ui.tabs.join() === 'Settings,Theme guide,Preview*', 'a third tab, Preview, beside Settings and the Theme guide', ui.tabs.join());
    ok(ui.sel === 'christmas' && ui.opts >= 28, `the theme picker: every theme (${ui.opts}), Christmas chosen`, JSON.stringify([ui.sel, ui.opts]));
    ok(ui.widths.join() === '390 px,768 px,1440 px', 'the three widths', ui.widths.join());
    const kinds = ui.buttons.map(b => b.split('|')[0]);
    ok(kinds[0] === 'pieces' && kinds.filter(k => k === 'scene').length === 2 && kinds.includes('hero') && kinds.includes('egg'),
      `a button for the pieces, each scene, each flyer and the egg (${ui.buttons.map(b => b.split('|')[1]).join(' · ')})`, ui.buttons.join(' / '));
    ok(ui.cards.length === 1 && ui.cards[0] === 'dcc-guide-christmas', 'the Christmas guide card alone below the frame', ui.cards.join());

    /* the pieces, every variant */
    await pg.waitForFunction(() => { const f = document.querySelector('.dcc-pv-frame'); return f && f.contentWindow && f.contentWindow.DCCSeasonsEngine && f.contentWindow.DCCSeasonsEngine._state; }, null, { timeout: 30000 });
    /* which ball pictures are DRAWN over 10 s: each ball's own lightest
     * color is in its picture's source (#FF8A8A red, #FFF0B0 gold, #9ED0FF blue) */
    await frameState(() => { window.__drawn = new Set(); const o = CanvasRenderingContext2D.prototype.drawImage; CanvasRenderingContext2D.prototype.drawImage = function (img) { if (img && img.src) { window.__drawn.add(img.src.slice(0, 600)); } return o.apply(this, arguments); }; return 1; });
    await pg.waitForTimeout(10000);
    const vk = await frameState(() => { const s = window.DCCSeasonsEngine._state, d = [...window.__drawn].join(' '); return { cfg: !!window.DCC_SEASONS.variants, parts: s.parts.filter(p => !p.dormant).map(p => p.sKey), red: /FF8A8A/i.test(d), gold: /FFF0B0/i.test(d), blue: /9ED0FF/i.test(d) }; });
    ok(vk.cfg && vk.red && vk.gold && vk.blue, `every variant takes its turn: red, gold and blue all drawn (${vk.parts.join(', ')} on screen)`, JSON.stringify(vk));

    /* the stills for the Director: the tab with the frame at 390 */
    const OUT = path.join(ROOT, 'build');
    await pg.screenshot({ path: path.join(OUT, 'Seasons - 4.14.3 preview tab 390.png'), fullPage: true });
    /* a scene alone */
    await pg.click('.dcc-pv-play button[data-kind="scene"]:nth-of-type(2)').catch(() => {});
    const which = await pg.evaluate(() => document.querySelector('.dcc-pv-play button[aria-pressed="true"]').textContent);
    await pg.waitForFunction(() => { const f = document.querySelector('.dcc-pv-frame'); return /dcc_play=v/.test(f.contentWindow.location.href) && f.contentWindow.DCCSeasonsEngine && f.contentWindow.DCCSeasonsEngine._state; }, null, { timeout: 30000 });
    const want = await pg.evaluate(() => decodeURIComponent(document.querySelector('.dcc-pv-frame').src.split('dcc_play=v%3A')[1] || document.querySelector('.dcc-pv-frame').src.split('dcc_play=v:')[1] || ''));
    await pg.waitForFunction(w => { const s = document.querySelector('.dcc-pv-frame').contentWindow.DCCSeasonsEngine._state; return s.vig === w; }, want, { timeout: 30000 }).catch(() => {});
    const sc = await frameState(() => { const s = window.DCCSeasonsEngine._state; return { vig: s.vig, log: s.vigLog.map(v => v.name || v.vig || v), heroes: s.heroLog.length }; });
    ok(sc && sc.vig === want && sc.log.every(v => String(v).indexOf(want) >= 0 || typeof v === 'object'), `"${which}": that scene plays, about a second in (${want})`, JSON.stringify(sc));

    /* a flyer alone */
    await pg.click('.dcc-pv-play button[data-kind="hero"]');
    await pg.waitForFunction(() => { const f = document.querySelector('.dcc-pv-frame'); return /dcc_play=h/.test(f.contentWindow.location.href) && f.contentWindow.DCCSeasonsEngine && f.contentWindow.DCCSeasonsEngine._state; }, null, { timeout: 30000 });
    await pg.waitForFunction(() => document.querySelector('.dcc-pv-frame').contentWindow.DCCSeasonsEngine._state.heroLog.length > 0, null, { timeout: 30000 }).catch(() => {});
    const hr = await frameState(() => { const s = window.DCCSeasonsEngine._state; return { heroes: s.heroLog.map(h => h.kind), vigs: s.vigLog.length }; });
    ok(hr && hr.heroes[0] === 'heron' && hr.vigs === 0, `the flyer button plays the flyer (${hr && hr.heroes.join()}) and no scene`, JSON.stringify(hr));

    /* the width */
    await pg.click('.dcc-pv-seg button:nth-child(2)');
    const fw = await pg.evaluate(() => document.querySelector('.dcc-pv-frame').style.width);
    ok(fw === '768px', 'the width control sets the frame to 768 px', fw);

    /* the frame at 1440, the scene playing */
    await pg.click('.dcc-pv-seg button:nth-child(3)');
    await pg.click('.dcc-pv-play button[data-kind="scene"]');
    await pg.waitForFunction(() => { const f = document.querySelector('.dcc-pv-frame'); return /dcc_play=v/.test(f.contentWindow.location.href) && f.contentWindow.DCCSeasonsEngine && f.contentWindow.DCCSeasonsEngine._state && f.contentWindow.DCCSeasonsEngine._state.vig; }, null, { timeout: 30000 }).catch(() => {});
    await pg.waitForTimeout(2500);
    await pg.screenshot({ path: path.join(OUT, 'Seasons - 4.14.3 preview tab 1440.png'), fullPage: false });
    /* the egg, tapped as a guest taps it */
    await pg.click('.dcc-pv-play button[data-kind="pieces"]');
    await pg.waitForFunction(() => { const f = document.querySelector('.dcc-pv-frame'); return !/dcc_play/.test(f.contentWindow.location.href) && f.contentWindow.document.readyState === 'complete' && f.contentWindow.document.querySelector('#header-page-title .entry-title'); }, null, { timeout: 30000 });
    await pg.waitForTimeout(800);
    await pg.click('.dcc-pv-play button[data-kind="egg"]');
    await pg.waitForTimeout(2500);
    const egg = await frameState(() => !!window.DCCSeasonsMatrix && [...document.querySelectorAll('div')].some(d => d.style.zIndex === '2147483000'));
    ok(egg === true, 'the egg button opens the easter egg by tapping the title', String(egg));
    ok(!errs.length, 'no page errors', errs.join(' | '));
  } finally { await ses.close(); }

  console.log('\n  --- a guest gets none of it ---');
  {
    const cfg = config(['--theme=christmas', '--placement=content', '--layering=front', '--density=16', '--diag']);
    const s2 = await open(rt.page({ config: cfg }), { viewport: { width: 1280, height: 900 }, ...rt.opts(1280) });
    try {
      await s2.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 30000 });
      await s2.page.waitForTimeout(3000);
      const g = await s2.page.evaluate(() => ({ play: window.DCC_SEASONS.play, variants: window.DCC_SEASONS.variants }));
      ok(!g.play && !g.variants, 'without the preview, no play and no variant rotation in the config', JSON.stringify(g));
    } finally { await s2.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
