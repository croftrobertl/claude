'use strict';
/**
 * DCC Seasons — 4.14.4, Rob's Thanksgiving and Christmas corrections (his
 * picks A1, B1, C1, D2). Replaces test-thanksgiving-scene.js, whose crane
 * scene is gone; its reduced-motion and /submit-booking/ checks live here.
 *
 *  - Thanksgiving (A1): no scene at all (the cranes and their moon left the
 *    engine), the tom still walks; the background layer is the theme's own
 *    drawn leaves, small (B1). The fixes: the short maple stem, the
 *    multicolored corn generated in code (pinned to the approved drawing),
 *    the fuller horn.
 *  - Christmas (C1, D2): the gift drop flies the drawn team (no cut-out
 *    sleigh sprite left anywhere) under the menu, the dial and the menu
 *    button, drops three presents — red, blue, green — that land clear of
 *    the wreath, with no ripple, every frame, at 390/768/1440 and both
 *    directions on the REAL home page; the falling gift is gold with dots
 *    and a red ribbon; three hanging balls are red, gold and blue.
 *  - Reduced motion and /submit-booking/: nothing fetched.
 *
 *   node tools/test-holidays.js   (DCC_ASSETS=<a broken copy> for the mutation run)
 */
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const { page: fixture } = require('./fixture');
const rt = require('./real-theme');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const JS = process.env.DCC_ASSETS || `${ROOT}/dcc-seasons/assets/js`;
const QUIET = '.dcc-wx-banner{display:none!important}';
const KEEP_BOX = '#site-header-main, .site-header-bottom-fixed, .dcc-sun-dial, .menu-burger';
/* the corn Rob approved on the 4.14.4 sheet, as drawn then (a literal tile) */
const CORN_MD5 = '4cf919dccc2acadb752b4b0cef6f4cc6';
const pack = f => { const W = {}; new Function('window', fs.readFileSync(`${JS}/${f}`, 'utf8'))(W); return W.DCCSeasonsArt; };
const inter = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

(async () => {
  console.log('\n  --- Thanksgiving: the picks and the fixes, in the source ---');
  {
    const eng = fs.readFileSync(`${JS}/engine.js`, 'utf8');
    ok(/\n\t\tthanksgiving: \[\],/.test(eng), "Thanksgiving has no scene (Rob's A1)", 'VIGS');
    ok(!/cranemoon|crPaint|crPlanFor|fullMoonGet|crGet\(/.test(eng), 'the crane scene, its painter, its plan and its moon are gone from the engine', 'cranemoon');
    ok(/halloween: 'embers', thanksgiving: 'leafbg',/.test(eng) && /\n\t\t\tleafbg: \{/.test(eng), "the background is the drawn leaves (Rob's B1), in the engine's fallback too", 'SUBTLE_FALLBACK');
    const sub = JSON.parse(execFileSync('php', ['-r', `define('ABSPATH',1); function __($s,$d=null){return $s;} function esc_html__($s,$d=null){return $s;} function apply_filters($t,$v){return $v;}
      require '${ROOT}/dcc-seasons/includes/class-schedule.php'; require '${ROOT}/dcc-seasons/includes/class-themes.php'; require '${ROOT}/dcc-seasons/includes/class-settings.php';
      echo json_encode([\\DCC_Seasons\\Themes::subtle_defaults()['thanksgiving'], array_key_exists('leafbg', \\DCC_Seasons\\Settings::subtle_effects())]);`], { cwd: ROOT, encoding: 'utf8' }));
    ok(sub[0] === 'leafbg' && sub[1] === true, 'and in Themes::subtle_defaults(), with a name in the settings list', JSON.stringify(sub));
    const T = pack('art-thanksgiving.js').thanksgiving.svgs;
    ok(T.leafm.includes('<path d="M6.7 19.8q-1.2.3-2.4 1" stroke="#7A2A1E" stroke-width=".5"') && !T.leafm.includes('q-2.9.6-6.1 2.6'), 'the red maple has the short stem', 'leafm');
    const m2 = T.leafm2();
    ok(m2.includes('q-1.2.3-2.4 1') && m2.includes('#F2C14E'), 'and the turning maple has it too, still orange-gold', 'leafm2');
    const corn = T.corn(), md5 = crypto.createHash('md5').update(corn).digest('hex');
        const kern = (corn.match(/rx="\.4" fill="#/g) || []).length;
    ok(md5 === CORN_MD5, `the corn, generated in code, is the approved drawing byte for byte (md5 ${md5.slice(0, 8)})`, md5);
    ok(kern === 75 && /dccTgC3/.test(corn), `75 kernels in the tile (${kern}) in eight calico colors`, String(kern));
    const horn = T.cornucopia();
    ok(/^130 88\|/.test(horn) && (horn.match(/stroke="#E6CFA0"|stroke="#C99A5E"/g) || []).length === 33, 'the cornucopia is the fuller horn (33 weave rows)', horn.slice(0, 20));
    ok(horn.includes('dccTgC3n'), "and its ear is the multicolored corn", 'nest');
  }

  console.log('\n  --- Christmas: the picks, in the source ---');
  {
    const eng = fs.readFileSync(`${JS}/engine.js`, 'utf8');
    const X = pack('art-christmas.js').christmas.svgs;
    ok(!/\n\t\tsleigh: '/.test(eng), 'the cut-out sleigh sprite is gone (one Santa)', 'sleigh');
    ok(/var GD_KINDS = \['giftred', 'giftblue', 'giftgreen'\]/.test(eng), 'the drop carries red, blue and green', 'GD_KINDS');
    ok(['giftred', 'giftblue', 'giftgreen'].every(k => typeof X[k] === 'function' && X[k]().includes('#F1C40F')), 'each with the gold ribbon', 'ribbon');
    const g = X.gift();
    ok(g.includes('#E2B23E') && g.includes('#D23A3A') && /<pattern id="pp"[^>]*><circle/.test(g), "the falling gift is gold paper with dots and a red ribbon (Rob's D2)", g.slice(0, 80));
    ok(!X.giftf1 && !X.giftf3, 'and the options not picked are gone', 'giftf1/3');
    const th = execFileSync('php', ['-r', `define('ABSPATH',1); function __($s,$d=null){return $s;} function esc_html__($s,$d=null){return $s;} function apply_filters($t,$v){return $v;}
      require '${ROOT}/dcc-seasons/includes/class-schedule.php'; require '${ROOT}/dcc-seasons/includes/class-themes.php';
      echo json_encode(\\DCC_Seasons\\Themes::themes()['christmas']['ambient']['particles'][0]);`], { cwd: ROOT, encoding: 'utf8' });
    ok(/"ev":1/.test(th) && /ballred/.test(th), 'the balls are marked for the even pick', th);
  }

  console.log('\n  --- reduced motion: nothing animates, nothing is fetched ---');
  for (const theme of ['thanksgiving', 'christmas']) {
    const cfg = config([`--theme=${theme}`, '--placement=content', '--layering=front', '--density=16', '--min']);
    const reqs = [];
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: 390, height: 844 }, dsf: 2, reducedMotion: 'reduce' });
    try {
      ses.page.on('request', r => reqs.push(r.url()));
      await ses.page.mouse.wheel(0, 300);
      await ses.page.waitForTimeout(12000);   /* past the loader's 10 s net */
      const r = await ses.page.evaluate(() => ({ eng: !!window.DCCSeasonsEngine, cv: document.querySelectorAll('canvas.dcc-seasons-canvas, canvas.dcc-seasons-sky').length, acc: document.querySelectorAll('.dcc-seasons-accent').length }));
      ok(!r.eng && !r.cv && !r.acc && !reqs.some(u => /engine|art-/.test(u)), `${theme}: under prefers-reduced-motion nothing is fetched, no canvas, no accent`, JSON.stringify(r) + ' ' + reqs.join(','));
    } finally { await ses.close(); }
  }

  console.log('\n  --- /submit-booking/: zero Seasons assets, counted ---');
  for (const theme of ['thanksgiving', 'christmas']) {
    const verdict = execFileSync('php', [`${ROOT}/tools/scope-decide.php`, '--scope=all', '--kind=submitbooking'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const cfg = config([`--theme=${theme}`, '--placement=content', '--layering=front', '--density=16', '--min']);
    let html = fixture({ kind: 'bravada', config: cfg, banner: 'page' });
    if (verdict === 'SKIP') { html = html.replace(/<script>window\.DCC_SEASONS = [\s\S]*?<\/script>/, '').replace(/<script src="\/[a-z.]+\.js"><\/script>/g, ''); }
    const reqs = [];
    const ses = await open(html, { viewport: { width: 390, height: 844 }, waitUntil: 'commit' });
    try {
      ses.page.on('request', r => { const u = new URL(r.url()); if (u.pathname !== '/') { reqs.push(u.pathname); } });
      await ses.page.reload({ waitUntil: 'load' });
      await ses.page.mouse.wheel(0, 200);
      await ses.page.waitForTimeout(11000);
      const g = await ses.page.evaluate(() => ({ cfg: !!window.DCC_SEASONS, eng: !!window.DCCSeasonsEngine, el: document.querySelectorAll('[class*="dcc-seasons"]').length }));
      const seasons = reqs.filter(u => /ambient|engine|matrix|art-|dcc-seasons/.test(u));
      ok(verdict === 'SKIP' && !seasons.length && !g.cfg && !g.eng && !g.el, `${theme}: should_load() says ${verdict}; ${seasons.length} Seasons requests, no element`, JSON.stringify({ seasons, g }));
    } finally { await ses.close(); }
  }

  console.log('\n  --- Thanksgiving on the real home page: no scene, the drawn leaves behind ---');
  for (const w of [390, 1440]) {
    const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.vigFirst = 600; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
    const ses = await open(rt.page({ config: cfg, extraHead: `<style>${QUIET}</style>` }), { ...rt.opts(w), viewport: { width: w, height: w < 768 ? 844 : 900 }, dsf: 2 });
    const pg = ses.page, errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    try {
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      await pg.waitForTimeout(1500);
      const r = await pg.evaluate(() => {
        const S = window.DCCSeasonsEngine._state; S.manual(true);
        const a = S.subtle; S.tick(1000 / 30, 900); const b = S.subtle;
        return { a, b, vigs: S.vigLog, turkey: S.parts.some(p => p.sKey === 'turkey') };
      });
      ok(!r.vigs.length, `${w}: no scene in 30 s (${r.vigs.length})`, JSON.stringify(r.vigs));
      ok(r.b.key === 'leafbg' && r.b.on && r.b.n >= 3, `${w}: the background is the drawn leaves, ${r.b.n} of them`, JSON.stringify({ key: r.b.key, n: r.b.n }));
      ok(r.b.pos.every(p => p.r >= 12 && p.r <= 16), `${w}: small, 12–16 px`, JSON.stringify(r.b.pos.map(p => p.r)));
      ok(JSON.stringify(r.a.pos) !== JSON.stringify(r.b.pos), `${w}: and falling`, 'pos');
      ok(r.turkey, `${w}: the tom still walks`, 'turkey');
      ok(!errs.length, `${w}: no page errors`, errs.join(' | '));
    } finally { await ses.close(); }
  }

  console.log('\n  --- the gift drop on the real home page, every frame ---');
  for (const w of [390, 768, 1440]) {
    for (const dir of [1, -1]) {
      const cfg = config(['--theme=christmas', '--placement=content', '--layering=front', '--density=16', '--diag']);
      cfg.vigOnly = 'giftdrop'; cfg.vigFirst = 2500; cfg.vigGap = 1e9; cfg.vigDir = dir;
      cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
      const ses = await open(rt.page({ config: cfg, extraHead: `<style>${QUIET}</style>` }), { ...rt.opts(w), viewport: { width: w, height: w < 768 ? 844 : 900 }, dsf: 2 });
      const pg = ses.page, errs = [];
      pg.on('pageerror', e => errs.push(e.message));
      try {
        await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
        await pg.waitForFunction(() => window.DCCSeasonsEngine._state.vig === 'giftdrop', null, { timeout: 30000, polling: 100 });
        const r = await pg.evaluate(({ KEEP_BOX }) => {
          const S = window.DCCSeasonsEngine._state; S.manual(true);
          const sky = S.sky, keep = [...document.querySelectorAll(KEEP_BOX)].filter(e => getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect())
            .filter(b => b.width > 0 && b.height > 0).map(b => [b.left - sky.left, b.top - sky.top, b.right - sky.left, b.bottom - sky.top]);
          const wr = S.wreath.box, out = { frames: 0, rigHit: [], landHit: [], kinds: new Set(), landed: 0, ripples: 0, n: 0, foot: 0, h: sky.h, ended: false };
          for (let f = 0; f < 30 * 16 && S.vig === 'giftdrop'; f++) {
            S.tick(1000 / 30, 1);
            const st = S.vigSt; if (!st) { break; }
            out.frames++; out.ripples = Math.max(out.ripples, S.ripples);
            if (st.t2 < st.T && st.fgB && st.fgB[0]) {
              const c = st.fgB[0], rb = [c[0], c[1], c[0] + c[2], c[1] + c[3]];
              keep.forEach(k => { if (inter(rb, k) && rb[2] > 0 && rb[0] < sky.w) { out.rigHit.push(f); } });
            }
            out.n = st.g.length;
            st.g.forEach(g => { out.kinds.add(g.s); if (g.land) { out.landed = Math.max(out.landed, st.g.filter(q => q.land).length); out.foot = g.y;
              const gb = [g.x - 9, g.y - 9, g.x + 9, g.y + 9]; if (wr && inter(gb, wr)) { out.landHit.push(g.s); } } });
          }
          out.ended = S.vig !== 'giftdrop'; out.kinds = [...out.kinds];
          return out;
          function inter(a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
        }, { KEEP_BOX });
        const tag = `${w}, ${dir > 0 ? 'right' : 'left'}`;
        ok(!r.rigHit.length, `${tag}: the team never meets the menu bar, the dial or the menu button (${r.frames} frames)`, JSON.stringify(r.rigHit.slice(0, 5)));
        ok(r.n === 3 && ['giftred', 'giftblue', 'giftgreen'].every(k => r.kinds.includes(k)), `${tag}: three presents, red, blue and green`, JSON.stringify(r.kinds));
        ok(r.landed === 3 && Math.abs(r.foot - (r.h - 14)) < 1, `${tag}: all three land at the picture's foot`, JSON.stringify({ landed: r.landed, foot: r.foot, h: r.h }));
        ok(!r.landHit.length, `${tag}: clear of the wreath`, JSON.stringify(r.landHit));
        ok(r.ripples === 0, `${tag}: no ripple`, String(r.ripples));
        ok(r.ended, `${tag}: and the scene ends`, String(r.frames));
        ok(!errs.length, `${tag}: no page errors`, errs.join(' | '));
      } finally { await ses.close(); }
    }
  }

  console.log('\n  --- every ornament color appears ---');
  for (const seed of [3, 7, 11, 19, 23]) {
    const cfg = config(['--theme=christmas', '--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.vigFirst = 1e9; cfg.heroFirst = [1e9, 1e9 + 1]; cfg.heroEvery = [1e9, 1e9 + 1];
    const ses = await open(rt.page({ config: cfg, extraHead: `<style>${QUIET}</style>` }), { ...rt.opts(1440), viewport: { width: 1440, height: 900 }, dsf: 1,
      init: `Math.random = (() => { let a = ${seed}; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();` });
    try {
      await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.parts.length > 4, null, { timeout: 20000 });
      const r = await ses.page.evaluate(() => { const S = window.DCCSeasonsEngine._state; S.manual(true); S.tick(1000 / 30, 600);
        return S.parts.filter(p => /^ball/.test(p.sKey || '') && !p.dormant).map(p => p.sKey); });
      const n = { ballred: 0, ballgold: 0, ballblue: 0 }; r.forEach(k => n[k]++);
      const spread = Math.max(...Object.values(n)) - Math.min(...Object.values(n));
      ok(r.length < 3 || (spread <= 1), `seed ${seed}: ${r.length} balls on screen, colors within one of each other (${JSON.stringify(n)})`, JSON.stringify(n));
    } finally { await ses.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
