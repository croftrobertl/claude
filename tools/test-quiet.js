'use strict';
/**
 * DCC Seasons — the quiet pages, with Thanksgiving live (4.13.2):
 *  - under prefers-reduced-motion the engine is never fetched: no canvas,
 *    no cornucopia, no tom, no worker;
 *  - /submit-booking/ makes ZERO Seasons requests in every scope, served
 *    exactly as the site would serve it (the real should_load() verdict,
 *    tools/scope-decide.php), and the check key cannot open it
 *    (tools/test-check-key.php proves that half in PHP).
 *
 *   node tools/test-quiet.js
 */
const { execFileSync } = require('child_process');
const { config, open, ROOT } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}

(async () => {
  console.log('\n  --- reduced motion: nothing animates, nothing is fetched ---');
  for (const w of [390, 1440]) {
    const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--min']);
    const reqs = [], workers = [];
    const ses = await open(fixture({ kind: 'bravada', config: cfg, banner: true }), { viewport: { width: w, height: 844 }, dsf: 2, reducedMotion: 'reduce' });
    try {
      ses.page.on('request', r => reqs.push(r.url()));
      ses.page.on('worker', wk => workers.push(wk.url()));
      await ses.page.mouse.wheel(0, 300);
      await ses.page.waitForTimeout(12000);   /* past the loader's 10 s net */
      const r = await ses.page.evaluate(() => ({ eng: !!window.DCCSeasonsEngine, cv: document.querySelectorAll('canvas.dcc-seasons-canvas, canvas.dcc-seasons-sky').length, acc: document.querySelectorAll('.dcc-seasons-accent').length }));
      ok(!r.eng && !r.cv && !r.acc && !workers.length && !reqs.some(u => /engine/.test(u)),
        `${w}px: the engine is never fetched — no canvas, no cornucopia, no tom, no worker`, JSON.stringify(r) + ' ' + reqs.join(',') + ' ' + workers.join(','));
    } finally { await ses.close(); }
  }

  console.log('\n  --- /submit-booking/: zero Seasons requests, counted ---');
  for (const scope of ['all', 'no_cottages', 'not_home', 'home']) {
    const verdict = execFileSync('php', [`${ROOT}/tools/scope-decide.php`, `--scope=${scope}`, '--kind=submitbooking'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const cfg = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--min']);
    let html = fixture({ kind: 'bravada', config: cfg, banner: 'page' });
    /* served exactly as the site would: SKIP means the plugin printed nothing */
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

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
