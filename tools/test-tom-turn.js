'use strict';
/**
 * DCC Seasons — 4.13.3, Rob's picks for the tom:
 *  1. B, one tom on every page: every visit at every width, never two —
 *     measured on the REAL home page (tools/real-theme.js), 20 visits at
 *     each of 390, 768 and 1440, as the Director asked;
 *  2. he and both poults turn round BEFORE the corner accent (the
 *     cornucopia) and walk back, so no tom or poult PIXEL BOX ever meets
 *     the accent's real box (.dcc-seasons-accent), feeding stops included,
 *     at 390, 768 and 1440, on the fixture and on the real page;
 *  3. at a turn the poults stay where they stand (no jump across him) and
 *     fall in behind him again once he has passed.
 * Every draw of a tom or poult canvas is caught (drawImage) and mapped to
 * page px through the context's own transform, so this measures what is
 * painted, not what the engine thinks it painted.
 *
 *   node tools/test-tom-turn.js [--visits=20]
 *   DCC_TOM_A=1 … (A's row), DCC_ASSETS=<dir> … (a mutated engine)
 */
const { config, open } = require('./harness');
const { page: fixture } = require('./fixture');
const rt = require('./real-theme');

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}
const VISITS = +((process.argv.find(a => a.startsWith('--visits=')) || '--visits=20').slice(9));
/* DCC_TOM_A=1 puts his theme row back to 4.13.2's A (weight 1, no limit):
 * the mutation for B, and the real-page numbers under A */
const cfgOf = () => { const c = config(['--theme=thanksgiving', '--placement=content', '--layering=front', '--density=16', '--diag']); c.forceHour = 12; c.vigFirst = 1e9;
  if (process.env.DCC_TOM_A) { const tk = c.themes.thanksgiving.ambient.particles.find(p => p.s === 'turkey'); tk.w = 1; delete tk.n; }
  return c; };
const seedInit = n => `(() => { let a = ${n}; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();`;

/* in the page: play `secs` on the mocked clock, catching every tom/poult draw */
function watch(secs) {
  const s = window.DCCSeasonsEngine._state, cache = s.tom.cache, tomC = new Set(), kC = new Set();
  for (const k in cache) { (k.charAt(0) === 'k' ? kC : tomC).add(cache[k].c); }
  const acc = document.querySelector('.dcc-seasons-accent'), ar = acc && acc.getBoundingClientRect();
  const cv = document.querySelector('canvas.dcc-seasons-canvas');
  const P = CanvasRenderingContext2D.prototype, di = P.drawImage;
  let frame = [], worst = -1e9, near = 1e9, hits = 0, draws = 0;
  P.drawImage = function (src, x, y, w, h) {
    const isT = tomC.has(src), isK = kC.has(src);
    if ((isT || isK) && this.canvas === cv && w !== undefined) {
      const m = this.getTransform(), cr = cv.getBoundingClientRect(), k = cv.width / cr.width;
      const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([a, b]) => [(m.a * a + m.c * b + m.e) / k + cr.left, (m.b * a + m.d * b + m.f) / k + cr.top]);
      const L = Math.min(...pts.map(p => p[0])), R = Math.max(...pts.map(p => p[0])), T = Math.min(...pts.map(p => p[1])), B = Math.max(...pts.map(p => p[1]));
      draws++;
      if (ar) {
        const ox = Math.min(R, ar.right) - Math.max(L, ar.left), oy = Math.min(B, ar.bottom) - Math.max(T, ar.top);
        if (ox > 0 && oy > 0) { hits++; }
        const gap = Math.max(ar.left - R, L - ar.right);   /* horizontal clearance */
        if (B > ar.top && T < ar.bottom) { near = Math.min(near, gap); }
      }
      if (isK) { frame.push((L + R) / 2); }
    }
    return di.apply(this, arguments);
  };
  let jump = 0, turns = 0, pd = 0, waitSeen = 0, maxToms = 0, onScreen = 0;
  let prevK = null;
  for (let i = 0; i < secs * 30; i++) {
    frame = [];
    s.tick(1000 / 30, 1);
    const toms = s.parts.filter(q => !q.dormant && q.b === 'forage');
    maxToms = Math.max(maxToms, toms.length);
    const t = toms[0];
    if (t && t.x > -20 && t.x < s.vw + 20) { onScreen++; }
    if (t) {
      if (pd && t.dir !== pd && Math.abs(t.x) < s.vw + 20 && t.x > -20) { turns++; }
      pd = t.dir;
      if (t.pw < 1e8 && t.pw < 400) { waitSeen++; }
    }
    const ks = frame.slice().sort((a, b) => a - b);
    /* on screen only: a re-seed moves them between two off-screen spots */
    const inV = v => v > 0 && v < s.vw;
    if (prevK && ks.length === prevK.length && ks.length === 2 && ks.concat(prevK).every(inV)) { jump = Math.max(jump, ...ks.map((v, j) => Math.abs(v - prevK[j]))); }
    prevK = ks.length ? ks : null;
  }
  P.drawImage = di;
  return { ar: ar && [ar.left, ar.right, ar.top, ar.bottom].map(Math.round), hits, near: near === 1e9 ? null : +near.toFixed(1), draws, jump: +jump.toFixed(2), turns, waitSeen, maxToms, onScreen, frames: secs * 30 };
}

(async () => {
  console.log('\n  --- he and his poults never meet the cornucopia (180 s each) ---');
  for (const real of [false, true]) {
    for (const w of [390, 768, 1440]) {
      for (const seed of [3, 11]) {
        const html = real ? rt.page({ config: cfgOf() }) : fixture({ kind: 'bravada', config: cfgOf(), banner: true });
        const ses = await open(html, { viewport: { width: w, height: w < 768 ? 844 : 900 }, init: seedInit(seed), ...(real ? rt.opts(w) : {}) });
        try {
          await ses.page.addStyleTag({ content: '.dcc-wx-banner{display:none!important}' });
          await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 30000 });
          await ses.page.evaluate(() => window.DCCSeasonsEngine._state.manual(true));
          const r = await ses.page.evaluate(watch, 180);
          const tag = `${real ? 'real page' : 'fixture'} ${w}px seed ${seed}`;
          ok(r.ar && r.hits === 0 && r.draws > 1000, `${tag}: no tom or poult box meets the accent box (${r.draws} draws, closest ${r.near} px, ${r.turns} turns)`, JSON.stringify(r));
          ok(r.maxToms === 1, `${tag}: one tom, never two`, JSON.stringify(r));
          if (r.turns) { ok(r.jump < 3 && r.waitSeen > 0, `${tag}: at the turn the poults stay put and wait (largest poult step ${r.jump} px)`, JSON.stringify(r)); }
        } finally { await ses.close(); }
      }
    }
  }

  console.log(`\n  --- B on the real home page: ${VISITS} visits at each width ---`);
  const freq = {};
  for (const w of [390, 768, 1440]) {
    let seen = 0, two = 0, cover = 0;
    for (let v = 1; v <= VISITS; v++) {
      const ses = await open(rt.page({ config: cfgOf() }), { viewport: { width: w, height: w < 768 ? 844 : 900 }, init: seedInit(v * 7919), ...rt.opts(w) });
      try {
        await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state && window.DCCSeasonsEngine._state.tom.done, null, { timeout: 30000 });
        const r = await ses.page.evaluate(() => { const s = window.DCCSeasonsEngine._state; s.manual(true); let on = 0, mx = 0;
          for (let i = 0; i < 120; i++) { s.tick(500, 1); const t = s.parts.filter(q => !q.dormant && q.b === 'forage'); mx = Math.max(mx, t.length); if (t[0] && t[0].x > -20 && t[0].x < s.vw + 20) { on++; } } return { on: on / 120, mx }; });
        if (r.on > 0) { seen++; } if (r.mx > 1) { two++; } cover += r.on;
      } finally { await ses.close(); }
    }
    freq[w] = { seen, two, cover: Math.round(100 * cover / VISITS) };
    ok(seen === VISITS && two === 0, `${w}px: he is seen in the first minute on ${seen} of ${VISITS} visits, never two (on screen ${freq[w].cover}% of the minute)`, JSON.stringify(freq[w]));
  }

  console.log(`\n${pass} passed · ${fail} failed`);
  problems.forEach(p => console.log('  - ' + p));
  console.log('FREQ ' + JSON.stringify(freq));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
