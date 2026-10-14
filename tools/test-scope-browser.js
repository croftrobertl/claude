'use strict';
/**
 * DCC Seasons — what a VISITOR gets under "All pages except for homepage"
 * (4.11.0, Rob: Seasons on the homepage, the Hero Effects everywhere else,
 * never both on one page).
 *
 * Scope is decided in PHP, so a browser test that invents its own answer
 * proves nothing. For each kind of page this asks the real should_load()
 * (tools/scope-decide.php) and then serves the page the way the site would:
 * with the config and the loader when it says LOAD, with neither when it
 * says SKIP. Then it looks at the page a guest would see — a canvas, a
 * fetched engine, and the tap easter egg, which rides the same gate.
 *
 *   node tools/test-scope-browser.js
 */
const { execFileSync } = require('child_process');
const path = require('path');
const { config, open, settle, ROOT } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const decide = (scope, kind) => execFileSync('php', [path.join(__dirname, 'scope-decide.php'), `--scope=${scope}`, `--kind=${kind}`], { cwd: ROOT, encoding: 'utf8' }).trim();

/* The page a guest gets. When PHP says SKIP the plugin prints NOTHING: no
 * config, no script tag, no styles — so the fixture is served with the
 * config stripped out, which is what "costs nothing" means. */
function html(load, kind) {
  const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--diag']);
  const page = fixture({ kind: 'bravada', config: cfg, banner: kind === 'front' ? true : 'page', home: kind === 'front' });
  if (load) { return page; }
  return page
    .replace(/<script>window\.DCC_SEASONS = [\s\S]*?<\/script>/, '')
    .replace(/<script src="\/[a-z.]+\.js"><\/script>/, '');
}

const KINDS = [
  ['front', 'the homepage'],
  ['page', 'an ordinary page (/contact/)'],
  ['cottage', 'a cottage page'],
  ['checkout', 'the checkout'],
];

(async () => {
  for (const scope of ['not_home', 'all']) {
    console.log(`\n  --- scope = ${scope} ---`);
    for (const [kind, name] of KINDS) {
      const verdict = decide(scope, kind), load = verdict === 'LOAD';
      const ses = await open(html(load, kind), { viewport: { width: 1280, height: 800 } });
      const pg = ses.page;
      try {
        const fetched = [];
        pg.on('request', r => { if (/\.js(\?|$)/.test(r.url())) { fetched.push(path.basename(new URL(r.url()).pathname)); } });
        if (load) { await settle(pg); } else { await pg.waitForTimeout(1800); }
        const seen = await pg.evaluate(() => ({
          config: !!window.DCC_SEASONS,
          engine: !!window.DCCSeasonsEngine,
          canvas: !!document.querySelector('canvas.dcc-seasons-canvas, canvas.dcc-seasons-sky'),
          scripts: [...document.querySelectorAll('script[src]')].map(s => s.src.split('/').pop()),
          styles: [...document.querySelectorAll('link[rel=stylesheet], style')].filter(e => /dcc-seasons/.test(e.href || e.textContent || '')).length,
        }));
        /* the egg rides the same gate: real taps on the configured target
         * (the homepage banner title, Rob's 4.7.0 pick) */
        let egg = 'no target';
        if (await pg.$('#header-page-title .entry-title')) {
          /* stop as soon as it opens: its overlay covers the title, so a
           * further click would be intercepted and time out */
          for (let i = 0; i < 6; i++) {
            if (await pg.evaluate(() => !!window.DCCSeasonsMatrix)) { break; }
            await pg.click('#header-page-title .entry-title', { delay: 20 });
            await pg.waitForTimeout(90);
          }
          await pg.waitForTimeout(1200);
          egg = await pg.evaluate(() => (window.DCCSeasonsMatrix ? 'opened' : 'closed'));
        }
        if (load) {
          ok(seen.config && seen.canvas, `${name}: decorated (${verdict}) — config and canvas present`, JSON.stringify(seen));
          /* Rob's 4.7.0 pick: the egg's target is the HOMEPAGE banner
           * title, so a decorated inner page has no egg either. */
          ok(kind === 'front' ? egg === 'opened' : egg !== 'opened', `${name}: the egg ${kind === 'front' ? 'opens' : 'does not open'} there (${egg})`, egg);
        } else {
          ok(!seen.config && !seen.engine && !seen.canvas && !seen.styles, `${name}: left alone (${verdict}) — no config, no engine, no canvas, no styles`, JSON.stringify(seen));
          ok(!fetched.some(f => /engine|ambient|matrix/.test(f)), `${name}: and no plugin script was fetched`, fetched.join(', ') || 'none');
          ok(egg !== 'opened', `${name}: the egg cannot open there`, egg);
        }
      } finally { await ses.close(); }
    }
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
