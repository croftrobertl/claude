'use strict';
/**
 * DCC Seasons — what is ON SCREEN, per theme, at 390 / 768 / 1280px.
 *
 * Rob's counts are stated at full width (density 16) and "phones in
 * proportion". This suite:
 *   1. models the expected count of every sprite, BEFORE (the 4.1.3 theme
 *      definitions, read from git, under 4.1.3's rules: no phone scaling)
 *      and AFTER (the shipped definitions under the 4.2.0 rules: phone
 *      scaling, theme caps, per-sprite limits, the accent exclusion);
 *   2. MEASURES the live engine at each width (sampling its own live set
 *      over time) and requires the measurement to agree with the model,
 *      so the table in the report is the engine's behaviour, not a sum;
 *   3. checks every one of Rob's targets within ±1.
 * Writes build/Seasons - counts 4.2.0.md.
 *
 * Usage: node tools/test-counts.js [theme ...]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const { page: fixture } = require('./fixture');

const WIDTHS = [390, 768, 1280];
const BEFORE_REV = process.env.BEFORE_REV || '6515970';
const TOUCHED = process.argv.slice(2).length ? process.argv.slice(2) : [
  'labor_day', 'patriot_day', 'fall_fishing', 'thanksgiving', 'christmas', 'new_years', 'mlk',
  'valentines', 'strawberry', 'st_patricks', 'spring_canal', 'four_twenty', 'memorial_day',
  'mothers_day', 'veterans_day', 'summer_canal', 'earth_day', 'florida_keys'];
/* Rob's targets at full width. total = whole-theme cap; others per sprite. */
const TARGETS = {
  patriot_day: { total: 5 }, memorial_day: { total: 7 }, christmas: { total: 9, phoneMin: 5 },
  st_patricks: { clover: 5 }, mlk: { dove: 3 }, labor_day: { burger: 1, pontoon: 1 },
  earth_day: { globe: 0 }, valentines: { 'heart/pulse': 3 },
};
const ACCENTED = ['halloween', 'thanksgiving', 'snowbird', 'earth_day', 'summer_canal', 'florida_keys'];

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}

function oldThemes() {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dcc-old-'));
  fs.writeFileSync(path.join(tmp, 'themes.php'), execFileSync('git', ['show', `${BEFORE_REV}:dcc-seasons/includes/class-themes.php`], { cwd: ROOT }));
  const out = execFileSync('php', ['-r', `define('ABSPATH',1);function __($s,$d=null){return $s;}function apply_filters($t,$v){return $v;}
    require '${ROOT}/dcc-seasons/includes/class-schedule.php'; require '${tmp}/themes.php'; echo json_encode(\\DCC_Seasons\\Themes::themes());`], { encoding: 'utf8' });
  return JSON.parse(out);
}
/* A spec's label in the table: its sprite key(s), or the primitive. Two
 * specs drawing the same sprite (Spring's dragonfly skims AND darts) share a
 * label, because the live count cannot tell them apart. */
function label(p) { return p.s ? (Array.isArray(p.s) ? p.s.join('|') : p.s) : p.c; }
function keysOf(p) { return p.s ? (Array.isArray(p.s) ? p.s : [p.s]) : [p.c]; }

/* The model. `after` switches the 4.2.0 rules on. */
function model(theme, width, after, accentShown) {
  const A = theme.ambient; const reserve = A.water ? 3 : 0; const total = 16 - reserve;
  let n, sc = 1;
  if (!after) { n = Math.min(total, A.max || 99); }
  else {
    sc = Math.min(1, Math.max(0.45, width / 1280));
    n = Math.round(total * sc);
    if (A.max) { n = Math.min(n, A.max <= 1 ? A.max : Math.max(3, Math.round(A.max * sc))); }
    if (A.phoneMin && width < 768) { n = Math.max(n, A.phoneMin); }
    n = Math.max(1, Math.min(n, total));
  }
  let specs = A.particles.filter(p => !(after && p.xa && accentShown));
  const out = {}; let rem = n; let live = specs.slice();
  const lim = p => (after && p.n) ? Math.max(1, Math.round(p.n * sc)) : Infinity;
  for (;;) {
    const W = live.reduce((a, p) => a + (p.w || 1), 0);
    const capped = live.filter(p => (p.w || 1) / W * rem > lim(p));
    if (!capped.length) { live.forEach(p => { out['#' + specs.indexOf(p)] = (p.w || 1) / W * rem; }); break; }
    capped.forEach(p => { out['#' + specs.indexOf(p)] = lim(p); rem -= lim(p); });
    live = live.filter(p => !capped.includes(p));
    if (!live.length) { break; }
  }
  /* merge specs that share a label */
  const byLabel = {};
  specs.forEach(p => { byLabel[label(p)] = (byLabel[label(p)] || 0) + (out['#' + specs.indexOf(p)] || 0); });
  return { n, per: byLabel };
}

async function measure(cfg, key, width) {
  const ses = await open(fixture({ kind: 'bravada', config: cfg }), { viewport: { width, height: 844 } });
  try {
    await ses.page.addStyleTag({ content: '.dcc-wx-banner{display:none!important}' });
    await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
    await ses.page.waitForTimeout(1500);
    const acc = {}; let samples = 0; let minLive = 99; let maxParts = 0; let accents = 0;
    for (let i = 0; i < 18; i++) {
      const st = await ses.page.evaluate(() => { const s = window.DCCSeasonsEngine._state; return { sp: s.sprites, live: s.live, max: s.maxParts, acc: s.accents }; });
      samples++; minLive = Math.min(minLive, st.live); maxParts = st.max; accents = st.acc;
      for (const [k, v] of Object.entries(st.sp)) { acc[k] = (acc[k] || 0) + v; }
      await ses.page.waitForTimeout(400);
    }
    for (const k of Object.keys(acc)) { acc[k] /= samples; }
    return { per: acc, minLive, maxParts, accents };
  } finally { await ses.close(); }
}

(async () => {
  const OLD = oldThemes();
  const rows = [];
  for (const key of TOUCHED) {
    console.log(`\n  --- ${key} ---`);
    for (const width of WIDTHS) {
      const cfg = config([`--theme=${key}`, '--placement=content', '--layering=front', '--density=16', '--opacity=1', '--diag']);
      cfg.heroEvery = [9999, 10000]; cfg.vigFirst = 1e9; cfg.forceHour = 12;
      const theme = cfg.themes[key];
      const accentShown = ACCENTED.includes(key);
      const before = model(OLD[key], width, false, accentShown);
      const after = model(theme, width, true, accentShown);
      const m = await measure(cfg, key, width);
      /* measured per spec: sum the live sprite keys that spec draws */
      const meas = {};
      for (const p of theme.ambient.particles) {
        if (p.xa && accentShown) { continue; }
        if (meas[label(p)] != null) { continue; }   // a shared label is counted once
        meas[label(p)] = 0;
        for (const k of keysOf(p)) { if (m.per[k] != null) { meas[label(p)] += m.per[k]; } }
      }
      /* primitives are keyed by primitive name in the live count; specs that
       * share one (Valentine's has only the pulse heart left) are unambiguous. */
      ok(m.maxParts === after.n, `${key} @${width}: engine total ${m.maxParts} = model ${after.n}`, `engine ${m.maxParts}`);
      for (const [lab, v] of Object.entries(after.per)) {
        ok(Math.abs((meas[lab] || 0) - v) <= 1, `${key} @${width}: ${lab} measured ${(meas[lab] || 0).toFixed(1)} ≈ model ${v.toFixed(1)}`, 'off by more than 1');
      }
      rows.push({ key, width, before, after, meas, minLive: m.minLive, accents: m.accents });
      /* Rob's targets */
      const T = TARGETS[key] || {};
      const sc = Math.min(1, Math.max(0.45, width / 1280));
      for (const [what, tgt] of Object.entries(T)) {
        if (what === 'phoneMin') { if (width < 768) { ok(m.minLive >= tgt, `${key} @${width}: never fewer than ${tgt} on a phone`, `min live ${m.minLive}`); } continue; }
        if (what === 'total') {
          const want = width < 768 && T.phoneMin ? Math.max(T.phoneMin, Math.max(3, Math.round(tgt * sc))) : Math.max(3, Math.round(tgt * sc));
          ok(Math.abs(m.maxParts - want) <= 1, `${key} @${width}: total ${m.maxParts} within ±1 of ${want}`, `got ${m.maxParts}`);
          continue;
        }
        const spec = theme.ambient.particles.find(p => label(p) === what || keysOf(p).includes(what) || `${p.c}/${p.b}` === what);
        /* 'heart/pulse' names the pulsing heart; its live count is the primitive's */
        const got = spec ? (meas[label(spec)] || 0) : 0;
        const want = tgt * sc;
        ok(Math.abs(got - want) <= 1, `${key} @${width}: ${what} ${got.toFixed(1)} within ±1 of ${want.toFixed(1)}`, `got ${got.toFixed(1)}`);
      }
      if (key === 'florida_keys') {
        ok(m.accents === 1, `florida_keys @${width}: one corner accent (the sun)`, `accents ${m.accents}`);
        ok(!m.per.sun && !m.per.pelican && !m.per.skiff && !m.per.flamingo, `florida_keys @${width}: no sun sprite, pelican, skiff or flamingo`, JSON.stringify(m.per));
      }
      if (key === 'earth_day') { ok(!m.per.globe, `earth_day @${width}: no globe while the hands accent shows`, `globe ${m.per.globe}`); }
    }
  }
  /* the report table */
  let md = '# DCC Seasons 4.2.0 — sprites on screen, BEFORE (4.1.3) and AFTER\n\n';
  md += 'Density 16 (Rob\'s setting), live settings. BEFORE is 4.1.3: no phone scaling, so a phone got the full count. AFTER is the model of the 4.2.0 rules; **measured** is the live engine averaged over 18 samples — the suite requires it within ±1 of the model. Counts are the live set (a few may be entering or leaving the edge).\n\n';
  for (const key of TOUCHED) {
    md += `## ${key}\n\n| sprite | before (all widths) | after 390 | after 768 | after 1280 | measured 390 / 768 / 1280 |\n|---|---|---|---|---|---|\n`;
    const rs = rows.filter(r => r.key === key);
    const labs = new Set(); rs.forEach(r => { Object.keys(r.before.per).forEach(l => labs.add(l)); Object.keys(r.after.per).forEach(l => labs.add(l)); });
    const f = v => v == null ? '—' : v.toFixed(1);
    for (const l of labs) {
      md += `| ${l} | ${f(rs[0].before.per[l])} | ${rs.map(r => f(r.after.per[l])).join(' | ')} | ${rs.map(r => f(r.meas[l])).join(' / ')} |\n`;
    }
    md += `| **total** | **${rs[0].before.n}** | ${rs.map(r => '**' + r.after.n + '**').join(' | ')} | |\n\n`;
  }
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build', 'Seasons - counts 4.2.0.md'), md);
  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { problems.forEach(p => console.log('  - ' + p)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
