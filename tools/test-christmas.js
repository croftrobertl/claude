'use strict';
/**
 * DCC Seasons — Christmas (4.14.0, rebuilt on 4.13.5 as 4.14.1, its art in
 * art-christmas.js): that what Rob approved is what ships.
 *
 * Every assertion is a pick of his (four rounds of stills), so a mutation
 * that quietly swaps one has something to fail against. The set is pinned
 * EXACTLY: an unapproved piece reaching the build is as much a defect as a
 * missing one. The scene's two picks — the silhouette cut exactly at the
 * moon's disc (A) and the red nose whose glow survives the dark (A) — are
 * checked on the canvas's own pixels, on the mocked clock.
 *
 *   node tools/test-christmas.js
 */
const fs = require('fs');
const { execFileSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const { page: fixture } = require('./fixture');
const { engineSource } = require('./engine-src');
/* the release this build follows: 4.14.1, live (2026-10-31) */
const BASE = 'e8db5eb';   /* 4.14.1, live */

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const QUIET = '.dcc-wx-banner{display:none!important} div[style*="2147482000"]{display:none!important}';
const APPROVED = ['ballred', 'ballgold', 'ballblue', 'holly', 'candycane', 'gift', 'pine', 'palmxmas', 'flamingoxmas'];
const php = code => JSON.parse(execFileSync('php', ['-r', `define('ABSPATH',1);
  function __($s,$d=null){return $s;} function esc_html__($s,$d=null){return $s;}
  function apply_filters($t,$v){return $v;}
  require '${ROOT}/dcc-seasons/includes/class-schedule.php';
  require '${ROOT}/dcc-seasons/includes/class-themes.php';
  ${code}`], { cwd: ROOT, encoding: 'utf8' }));

(async () => {
  /* the engine with its art packs spliced back in: the pieces and the
   * painters are art-christmas.js's since 4.14.1 */
  const src = engineSource(`${ROOT}/dcc-seasons/assets/js/engine.js`);
  const spr = k => (src.match(new RegExp(`\\n\\t\\t${k}: '([^']*)'`)) || [])[1] || '';

  console.log('\n  --- the approved pieces, and nothing else ---');
  {
    const t = php(`echo json_encode(\\DCC_Seasons\\Themes::themes()['christmas']['ambient']);`);
    const keys = []; t.particles.forEach(p => [].concat(p.s).forEach(k => keys.push(k)));
    ok(!keys.filter(k => !APPROVED.includes(k)).length, `no unapproved piece reaches the build (${keys.length} kinds)`, keys.join(','));
    ok(!APPROVED.filter(k => !keys.includes(k)).length, 'every approved piece is there', keys.join(','));
    const balls = t.particles.find(p => [].concat(p.s).includes('ballred'));
    ok(balls && [].concat(balls.s).join() === 'ballred,ballgold,ballblue', 'the glass balls are ONE kind in three colors (Rob\'s A)', JSON.stringify(balls));
    ok(!('hero' in t), 'no flyer: the static sleigh is gone, Santa is the scene (one Santa)', String(t.hero));
    ok(t.max === 9 && t.phoneMin === 5 && t.water === true, 'the count rules are unchanged: cap 9, phone floor 5, the water reserve', JSON.stringify([t.max, t.phoneMin, t.water]));
    ok(!keys.includes('sabalpalm') && !keys.includes('flamingo'), 'the shared Keys palm and Snowbird flamingo are not touched', keys.join(','));
    const sub = php(`echo json_encode(\\DCC_Seasons\\Themes::subtle_defaults()['christmas']);`);
    ok(sub === '', 'the bokeh is off (Rob\'s B) in the plugin\'s defaults', JSON.stringify(sub));
    ok(/christmas: ''/.test(src.slice(src.indexOf('SUBTLE_FALLBACK'), src.indexOf('SUBTLE_FALLBACK') + 800)), 'and in the engine\'s fallback', 'SUBTLE_FALLBACK');
    const keys2 = php(`echo json_encode(array_keys(\\DCC_Seasons\\Themes::themes()['florida_keys']['ambient']['particles'][0]));`);
    ok(Array.isArray(keys2), 'the Keys theme still loads', JSON.stringify(keys2));
  }

  console.log('\n  --- the drawings are the approved ones ---');
  {
    const cane = spr('candycane');
    ok(cane.includes('#2F9E44') && cane.includes('<pattern'), "the candy cane is B: green in the stripes, painted on the stroke", cane.slice(0, 80));
    ok(!cane.includes('#B8252A'), 'with no shading line along it (A\'s faint pink line)', cane.slice(0, 80));
    const holly = spr('holly');
    ok((holly.match(/url\(#l[123]\)/g) || []).length === 3, 'the holly is a closed sprig: three leaves, the third behind the berries', holly.slice(0, 60));
    const fl = spr('flamingoxmas');
    ok(fl.includes('M12.6 25.4 C9 29.8 5.2 30.2 4.8 25.6'), 'the flamingo\'s neck dips below the breast before it rises (Rob, round 4)', fl.slice(0, 40));
    ok(fl.includes('M0.4 9.6 L0.8 14.2'), 'its beak tip hangs at x 0.4-2.1, in front of the neck (x 4.8+): clear space', 'beak');
    ok(fl.includes('M15.8 46.2 L12.4 48.8'), 'the folded leg has its webbed foot', 'foot');
    ok(/17 9 C14.6 6.2/.test(fl) && fl.includes('cx="17.1" cy="9.8"'), 'the hat\'s cone falls to one side to its pom', 'hat');
    const rd = src.slice(src.indexOf('function rdLeg'), src.indexOf('function rdPaint'));
    ok(!/arc\(J\[2\]/.test(rd) && /quadraticCurveTo/.test(rd), 'the reindeer legs are one tapered shape, no joint knobs (Rob, round 3)', 'rdLeg');
    const sn = src.slice(src.indexOf('function snSanta'), src.indexOf('function snSanta') + 9000);
    ok(/the mustache/.test(sn) && /the blush/.test(sn) && /sleeve\(/.test(sn), 'Santa has the mustache, the blush on the cheekbone and the red sleeves', 'snSanta');
    ok(/var SKY_HERO = \{ heron: 1, eagle: 1, witch: 1, osprey: 1 \}/.test(src) && !/kind === 'sleigh'/.test(src), 'the sleigh flyer is gone from the engine', 'SKY_HERO');
    ok(/christmas: \['sleighmoon', 'giftdrop'\]/.test(src) && /var EVENING_VIGS = \{\};/.test(src), 'sleighmoon plays by day as well as by night; giftdrop stays', 'VIGS');
    ok(/christmas: \['wreath', 'right:8px;top:8px;width:96px;opacity:\.5;'\]/.test(src), 'the wreath is the corner accent, in the web\'s size class', 'ACCENTS');
  }

  console.log('\n  --- 4.14.2: the style test\'s colors (Rob) ---');
  {
    const W = {}; new Function('window', fs.readFileSync(`${ROOT}/dcc-seasons/assets/js/art-christmas.js`, 'utf8'))(W);
    const P = W.DCCSeasonsArt.christmas, sv = k => (typeof P.svgs[k] === 'function' ? P.svgs[k]() : P.svgs[k]);
    const all = Object.keys(P.svgs).map(sv).join('');
    ok(!/#000\b|#000000|"black"/i.test(all), 'no black anywhere in the pieces', (all.match(/.{30}#000\b.{10}/) || [''])[0]);
    ok(/fill="#0E3A2A" opacity="\.08"/.test(sv('pine')) && /fill="#0E3A2A" opacity="\.16"/.test(sv('pine')), "the pine's shading is its own dark cool green", 'pine');
    ok(/fill="#F6F4EE"/.test(sv('candycane')) && !/#FFFFFF/i.test(sv('candycane')), "the candy cane's white stripes are #F6F4EE", 'candycane');
    ok(/stroke="#F6F4EE" stroke-width="2"/.test(sv('flamingoxmas')), "the flamingo's hat brim is #F6F4EE", 'flamingoxmas');
    for (const [b, c] of [['ballred', '#7A0F0F'], ['ballgold', '#8C6410'], ['ballblue', '#0F3F7A']]) {
      ok(new RegExp(`stroke="${c}" stroke-width="\\.6"`).test(sv(b)), `the ${b.slice(4)} ball's rim is its own darkest shade (${c})`, b);
    }
    const ps = fs.readFileSync(`${ROOT}/dcc-seasons/assets/js/art-christmas.js`, 'utf8');
    ok(/beard: '#F6F4EE'/.test(ps) && !/rgba\(0,\s*0,\s*0/.test(ps), "Santa's beard is #F6F4EE; his hat and the sleigh band shade with the red's own tone, never black", 'santa');
  }

  console.log('\n  --- every other theme exactly as 4.14.1 shipped it (the pixels: test-untouched.js) ---');
  {
    const prev = execFileSync('git', ['show', `${BASE}:dcc-seasons/includes/class-themes.php`], { cwd: ROOT, encoding: 'utf8' });
    const tmp = `${require('os').tmpdir()}/dcc-themes-base.php`;
    fs.writeFileSync(tmp, prev.replace('namespace DCC_Seasons;', 'namespace DCC_Seasons_Base;'));
    const both = JSON.parse(execFileSync('php', ['-r', `define('ABSPATH',1);
      function __($s,$d=null){return $s;} function esc_html__($s,$d=null){return $s;}
      function apply_filters($t,$v){return $v;}
      require '${ROOT}/dcc-seasons/includes/class-schedule.php';
      require '${ROOT}/dcc-seasons/includes/class-themes.php';
      require '${tmp}';
      echo json_encode([\\DCC_Seasons\\Themes::themes(), \\DCC_Seasons_Base\\Themes::themes(), \\DCC_Seasons\\Themes::subtle_defaults(), \\DCC_Seasons_Base\\Themes::subtle_defaults()]);`],
      { cwd: ROOT, encoding: 'utf8' }));
    const changed = Object.keys(both[1]).filter(k => k !== 'christmas' && JSON.stringify(both[0][k]) !== JSON.stringify(both[1][k]));
    ok(!changed.length && Object.keys(both[0]).length === Object.keys(both[1]).length,
      `Halloween, Thanksgiving and the other ${Object.keys(both[1]).length - 1} themes are byte-identical to 4.14.1`, changed.join(','));
    const subCh = Object.keys(both[3]).filter(k => k !== 'christmas' && both[2][k] !== both[3][k]);
    ok(!subCh.length, 'and so are their background layers', subCh.join(','));
    const gs = f => execFileSync('git', ['show', `${BASE}:dcc-seasons/assets/js/${f}`], { cwd: ROOT, encoding: 'utf8' });
    const prevEng = ['engine.js', 'art-crane.js', 'art-thanksgiving.js', 'art-anniversary.js'].map(gs).join('\n');
    const body = (t, name) => { const i = t.indexOf(`\t\t\t${name}: { actors`); return i < 0 ? '' : t.slice(i, t.indexOf('\n\t\t\t} },', i)); };
    for (const sc of ['witchmoon', 'cranemoon', 'giftdrop']) {
      ok(body(src, sc) && body(src, sc) === body(prevEng, sc), `the ${sc} scene is unchanged from 4.14.1`, sc);
    }
    const fnBody = (t, name) => { const i = t.indexOf(`function ${name}(`); return i < 0 ? '' : t.slice(i, t.indexOf('\n\t}\n', i)); };
    for (const f of ['witchBody', 'crPaint', 'moonPaint', 'hnFly']) {
      ok(fnBody(src, f) && fnBody(src, f) === fnBody(prevEng, f), `${f} is unchanged from 4.14.1`, f);
    }
  }

  console.log('\n  --- reduced motion: nothing animates, nothing is fetched ---');
  {
    const cfg = config(['--theme=christmas', '--placement=content', '--layering=front', '--density=16', '--min']);
    const reqs = [];
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: 390, height: 844 }, dsf: 2, reducedMotion: 'reduce' });
    try {
      ses.page.on('request', r => reqs.push(r.url()));
      await ses.page.mouse.wheel(0, 300);
      await ses.page.waitForTimeout(12000);   /* past the loader's 10 s net */
      const r = await ses.page.evaluate(() => ({ eng: !!window.DCCSeasonsEngine, cv: document.querySelectorAll('canvas.dcc-seasons-canvas, canvas.dcc-seasons-sky').length, acc: document.querySelectorAll('.dcc-seasons-accent').length }));
      ok(!r.eng && !r.cv && !r.acc && !reqs.some(u => /engine/.test(u)), 'under prefers-reduced-motion the engine is never fetched: no canvas, no wreath, no scene', JSON.stringify(r) + ' ' + reqs.join(','));
    } finally { await ses.close(); }
  }

  console.log('\n  --- /submit-booking/: zero Seasons assets, counted ---');
  {
    const decide = scope => execFileSync('php', [`${ROOT}/tools/scope-decide.php`, `--scope=${scope}`, '--kind=submitbooking'], { cwd: ROOT, encoding: 'utf8' }).trim();
    for (const scope of ['all', 'no_cottages', 'not_home']) {
      const verdict = decide(scope);
      /* served exactly as the site would: SKIP means the plugin printed nothing */
      const cfg = config(['--theme=christmas', '--placement=content', '--layering=front', '--density=16', '--min']);
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
        const seasons = reqs.filter(u => /ambient|engine|matrix|dcc-seasons/.test(u));
        ok(verdict === 'SKIP' && seasons.length === 0 && !g.cfg && !g.eng && !g.el,
          `scope ${scope}: should_load() says ${verdict}; ${seasons.length} Seasons requests, no config, no element (${reqs.length} requests in all)`, JSON.stringify({ seasons, g }));
      } finally { await ses.close(); }
    }
  }

  for (const w of [390, 1280]) {
    console.log(`\n  --- the scene, ${w}px ---`);
    const cfg = config(['--theme=christmas', '--placement=content', '--layering=front', '--density=16', '--diag']);
    cfg.vigOnly = 'sleighmoon'; cfg.vigFirst = 5000; cfg.vigGap = 1e9;
    /* at 390 flyers are invited early (a sleigh flyer WOULD come, if there
     * were one); at 1280 none come, so nothing but the idle pre-draw can
     * have measured the header's letters before the scene starts */
    const flyers = w < 768;
    cfg.heroFirst = flyers ? [3, 4] : [1e9, 1e9 + 1]; cfg.heroEvery = flyers ? [3, 4] : [1e9, 1e9 + 1]; cfg.forceHour = 12;
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), {
      viewport: { width: w, height: w < 768 ? 700 : 800 }, dsf: 2,
    });
    const pg = ses.page;
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    try {
      await pg.addStyleTag({ content: QUIET });
      await pg.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 20000 });
      await pg.waitForFunction(() => window.DCCSeasonsEngine._state.sleigh.sprites >= 76 && window.DCCSeasonsEngine._state.witch.hdr, null, { timeout: 30000 });
      const hb = await pg.evaluate(() => window.DCCSeasonsEngine._state.witch.hdr && window.DCCSeasonsEngine._state.vig !== 'sleighmoon');
      await pg.waitForFunction(() => window.DCCSeasonsEngine._state.vig === 'sleighmoon', null, { timeout: 30000 });
      await pg.waitForTimeout(400);
      const r = await pg.evaluate(HB => {
        const s = window.DCCSeasonsEngine._state, sl = s.sleigh;
        const acc = document.querySelector('.dcc-seasons-accent');
        const ar = acc && acc.getBoundingClientRect(), cs = acc && getComputedStyle(acc);
        return { hdrPre: HB, sky: s.sky.vigSky, pic: s.sky.pic, sl: { stats: sl.stats, sprites: sl.sprites, moon: sl.moon, scene: sl.scene },
          obs: sl.obstacles(), w: s.sky.w, heroes: s.heroLog.map(h => h.kind || h.k || h.hero || JSON.stringify(h)), subtle: s.subtle,
          acc: acc ? { w: Math.round(ar.width), op: cs.opacity, pe: cs.pointerEvents, svg: !!acc.querySelector('svg'), pic: acc.parentNode.id, mode: s.wreath.stat.mode } : null };
      }, hb);
      ok(r.sky === true && r.pic === true, 'it plays in the header picture, on the sky canvas', JSON.stringify([r.sky, r.pic]));
      if (!flyers) { ok(r.hdrPre === true, 'the header\'s letters were measured in idle time before the scene, not in its first frame', JSON.stringify(r.hdrPre)); }
      ok(r.sl.sprites === 76 && r.sl.moon, `every pose pre-drawn lit, far and dark, plus the sleigh's four flick heights (${r.sl.sprites})`, String(r.sl.sprites));
      ok(r.sl.stats.live === 0, `all of it in idle time: nothing drawn outside it (${r.sl.stats.live})`, JSON.stringify(r.sl.stats));
      const MB = r.sl.stats.bytes / 1048576;
      /* drawn at the RENDERED size: the team is 1.3x larger from ~507px up */
      ok(MB < (w < 768 ? 9 : 14), `sprite memory ${MB.toFixed(2)} MB at min(DPR, 2), 24 poses (planned 7.6 MB at 390)`, String(MB));
      if (flyers) { ok(!r.heroes.some(h => /sleigh|santa/i.test(String(h))), `no sleigh flyer, though flyers were invited early (the heron, every theme's, may come: ${r.heroes.join(',') || 'none'})`, r.heroes.join(',')); }
      ok(r.subtle && r.subtle.on === false, 'no background layer (the bokeh is off)', JSON.stringify(r.subtle && r.subtle.key));
      /* 4.14.2: in the header picture, under the tagline or the title (Rob's
       * B; where exactly, on the real theme: tools/test-wreath.js) */
      ok(r.acc && r.acc.w <= 96 && r.acc.w >= 40 && r.acc.op === '0.5' && r.acc.pe === 'none' && r.acc.svg && r.acc.pic === 'header-image-main-inside' && /home|title/.test(r.acc.mode),
        `the wreath: in the header picture (${r.acc && r.acc.mode}), ${r.acc && r.acc.w}px, half opacity, never takes a click`, JSON.stringify(r.acc));
      const sc = r.sl.scene, pad = 0;
      const hit = r.obs.filter(o => sc.mx + sc.MR > o[0] - pad && sc.mx - sc.MR < o[2] + pad && sc.my + sc.MR > o[1] - pad && sc.my - sc.MR < o[3] + pad);
      ok(sc.clear === 1 && !hit.length, `the moon (${sc.mx},${sc.my} r${sc.MR}) is clear of the title's letters${w >= 768 ? ' and the dial\'s corner' : ''}`, JSON.stringify(hit));

      /* the cut, the nose and Santa, on the mocked clock */
      const px = await pg.evaluate(async () => {
        const s = window.DCCSeasonsEngine._state; s.manual(true);
        const c = s.witch.canvas, g = c.getContext('2d'), dp = Math.min(devicePixelRatio || 1, 2);
        const out = { darkIn: 0, darkOut: 0, glowIn: 0, coatIn: 0, steps: 0 };
        for (let k = 0; k < 400; k++) {
          s.tick(1000 / 30, 1);
          const st = s.sleigh.scene; if (!st || st.x == null) { continue; }
          if (s.vig !== 'sleighmoon') { break; }
          const R = st.MR, m = R + 40, x0 = Math.max(0, Math.round((st.mx - m) * dp)), y0 = Math.max(0, Math.round((st.my - m) * dp));
          const W2 = Math.min(c.width - x0, Math.round(2 * m * dp)), H2 = Math.min(c.height - y0, Math.round(2 * m * dp));
          if (W2 <= 0 || H2 <= 0) { continue; }
          const d = g.getImageData(x0, y0, W2, H2).data;
          let dIn = 0, dOut = 0, gIn = 0, cIn = 0;
          for (let y = 0; y < H2; y++) {
            for (let x = 0; x < W2; x++) {
              const i = (y * W2 + x) * 4, a = d[i + 3]; if (a < 230) { continue; }
              const r = d[i], gg = d[i + 1], b = d[i + 2];
              const dist = Math.hypot((x0 + x) / dp - st.mx, (y0 + y) / dp - st.my);
              const dark = Math.abs(r - 27) < 6 && Math.abs(gg - 19) < 6 && Math.abs(b - 13) < 6;
              if (dark && dist < R - 3) { dIn++; }
              if (dark && dist > R + 3) { dOut++; }
              if (dist < R - 3 && Math.abs(r - 232) < 8 && Math.abs(gg - 57) < 8 && Math.abs(b - 43) < 8) { gIn++; }   /* the nose's own red, #E8392B — no other red in the scene is it */
              if (dist < R - 3 && r > 160 && r < 240 && gg < 60 && b < 60) { cIn++; }
            }
          }
          out.darkIn = Math.max(out.darkIn, dIn); out.darkOut = Math.max(out.darkOut, dOut);
          out.glowIn = Math.max(out.glowIn, gIn); out.coatIn = Math.max(out.coatIn, cIn); out.steps++;
        }
        return out;
      });
      ok(px.darkIn > 800, `the team goes dark over the disc (${px.darkIn} dark samples inside)`, JSON.stringify(px));
      ok(px.darkOut < 40, `and ONLY inside it — Rob's A, cut exactly at the rim (${px.darkOut} dark samples outside)`, JSON.stringify(px));
      ok(px.glowIn >= 3, `the red nose's glow shows while the lead is dark on the moon (${px.glowIn})`, JSON.stringify(px));
      ok(px.coatIn > 320, `Santa and the sleigh stay lit over the disc: red coat and sleigh inside it (${px.coatIn})`, JSON.stringify(px));
      ok(!errs.length, 'no page errors', errs.join(' | '));
    } finally { await ses.close(); }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
