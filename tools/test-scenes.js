'use strict';
/**
 * DCC Seasons — every new scene plays through, on a MOCKED CLOCK.
 *
 * The engine's debug-only manual mode stops the rAF loop and this suite
 * advances it in exact 1/60s ticks, so each scene runs identically every
 * time: it must start, reach its end on its own, within a sane time, and
 * never on a phone borrow more than one sprite. Frames are captured as it
 * goes (a close-up that follows the action at 390px, 3x) and a strip of its
 * story beats — one per phase, topped up evenly — is written to
 * build/Seasons - scene strips 4.2.0.png for the report.
 *
 * Usage: node tools/test-scenes.js [scene ...]
 */
const fs = require('fs');
const path = require('path');
const { config, open, ROOT, playwright } = require('./harness');
const { page: fixture } = require('./fixture');

const SCENES = [
  ['gatorglide', 'summer_canal', 'S1 — a gator glides along the canal, stops, and sinks out of sight'],
  ['floatdrift', 'summer_canal', 'S2 — an inflatable flamingo pool float drifts by, a lost flip-flop in tow'],
  ['mulletskip', 'summer_canal', 'S3 — a mullet skips three times, then another answers'],
  ['anhinga', 'florida_keys', 'KA — an anhinga swims in, climbs onto a snag and spreads its wings to dry'],
  ['ospreycatch', 'florida_keys', 'KB — an osprey circles, stoops feet-first and climbs away with a fish'],
  ['cranes', 'florida_keys', 'KC — a sandhill crane pair walks in, bows, and dances'],
  ['limpkinsnail', 'florida_keys', 'KD — a limpkin wades to the reeds, probes, and pulls up an apple snail'],
  ['hibfloat', 'florida_keys', 'K3 — a hibiscus bloom drops, floats, and a fish nibbles it'],
];
const ONLY = process.argv.slice(2);
const OUT = path.join(ROOT, 'build');
const TICK = 1000 / 60;

let pass = 0, fail = 0; const problems = [];
function ok(c, label, detail) {
  if (c) { pass++; console.log(`    PASS  ${label}`); }
  else { fail++; problems.push(`${label} — ${detail}`); console.log(`    FAIL  ${label} — ${detail}`); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const strips = [];
  for (const [name, theme, story] of SCENES) {
    if (ONLY.length && !ONLY.includes(name)) { continue; }
    console.log(`\n  --- ${name} (${theme}) ---`);
    const cfg = config([`--theme=${theme}`, '--placement=content', '--layering=front', '--density=16', '--opacity=1', '--diag']);
    cfg.vigOnly = name; cfg.vigFirst = 400; cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; cfg.forceHour = 12;
    const ses = await open(fixture({ kind: 'bravada', config: cfg }), { viewport: { width: 390, height: 844 }, dsf: 3 });
    try {
      const page = ses.page;
      await page.addStyleTag({ content: '.dcc-wx-banner{display:none!important} body>div[style*="2147482000"]{display:none!important}' });
      await page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
      await page.waitForTimeout(600);
      await page.evaluate(() => window.DCCSeasonsEngine._state.manual(true));
      /* run to the start */
      let started = false;
      for (let i = 0; i < 200 && !started; i++) {
        await page.evaluate(t => window.DCCSeasonsEngine._state.tick(t, 10), TICK);
        started = await page.evaluate(n => window.DCCSeasonsEngine._state.vigLog.some(v => v.name === n), name);
      }
      ok(started, `${name} starts`, 'never started');
      if (!started) { continue; }
      /* play it through, half a second of scene time per step */
      const frames = [];
      let ended = false, simT = 0;
      while (!ended && simT < 40) {
        const st = await page.evaluate(() => {
          const s = window.DCCSeasonsEngine._state, v = s.vigSt;
          return { v: v ? { p: v.p || 0, x: v.sx != null && v.p >= 2 ? v.sx : (v.x != null ? v.x : v.gx), y: v.y, tx: v.tx } : null, wy: s.waterY, log: s.vigLog };
        });
        const last = st.log[st.log.length - 1];
        if (last && last.end >= 0) { ended = true; break; }
        if (st.v && st.v.x != null) {
          const w = name === 'ospreycatch' ? 250 : 230, h = name === 'ospreycatch' ? 300 : 180;
          const cy = name === 'ospreycatch' ? st.wy - 125 : ((st.v.y != null && st.v.y < st.wy - 100) ? st.v.y + 55 : st.wy - 62);
          const clip = { x: Math.max(0, Math.min(390 - w, st.v.x - w / 2)), y: Math.max(0, Math.min(844 - h, cy - h / 2)), width: w, height: h };
          const f = path.join(OUT, `scene-${name}-${frames.length}.png`);
          await page.screenshot({ path: f, clip });
          frames.push({ f, p: st.v.p, t: simT });
        }
        await page.evaluate(t => window.DCCSeasonsEngine._state.tick(t, 30), TICK);
        simT += 0.5;
      }
      const log = await page.evaluate(() => window.DCCSeasonsEngine._state.vigLog);
      const me = log.find(v => v.name === name);
      ok(ended, `${name} plays through to its end`, `still running after ${simT}s`);
      ok(me && me.end - me.start < 30, `${name} runs ${me ? (me.end - me.start).toFixed(1) : '?'}s of scene time`, 'too long');
      ok(me && me.borrowed <= 1, `${name} borrows ${me && me.borrowed} sprite(s) on a phone (at most 1)`, 'borrowed more');
      /* the strip: the middle frame of each phase, topped up evenly to six */
      const byPhase = {};
      frames.forEach((fr, i) => { (byPhase[fr.p] = byPhase[fr.p] || []).push(i); });
      const pick = new Set(Object.values(byPhase).map(ix => ix[Math.floor(ix.length / 2)]));
      for (let k = 0; pick.size < 6 && k < 12; k++) { pick.add(Math.min(frames.length - 1, Math.round(k * (frames.length - 1) / 11))); }
      strips.push({ name, story, frames: [...pick].sort((a, b) => a - b).slice(0, 6).map(i => frames[i]) });
    } finally { await ses.close(); }
  }
  /* composite */
  if (strips.length) {
    const { chromium } = playwright();
    const b = await chromium.launch({ args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }));
    const p = await b.newPage({ viewport: { width: 1900, height: 800 } });
    const img = f => `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}">`;
    await p.setContent(`<meta charset=utf-8><style>body{margin:0;padding:18px;background:#eef1f4;font:15px system-ui;color:#123}
      h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:16px 0 6px}.r{display:flex;gap:6px}.b{width:300px}.b img{width:300px;display:block;border:1px solid #bcc}.b span{font-size:12px;color:#456}</style>
      <h1>DCC Seasons 4.2.0 — the eight new scenes, played through on a mocked clock</h1>
      <div>390px phone, Rob's live settings, the theme's own sprites running. Each close-up follows the action (magnified); one frame per story phase.</div>
      ${strips.map(s => `<h2>${s.story}</h2><div class=r>${s.frames.map(fr => `<div class=b>${img(fr.f)}<span>t = ${fr.t.toFixed(1)}s</span></div>`).join('')}</div>`).join('')}`);
    await p.screenshot({ path: path.join(OUT, 'Seasons - scene strips 4.2.0.png'), fullPage: true });
    await b.close();
    for (const s of strips) for (const fr of s.frames) { /* keep */ }
  }
  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { problems.forEach(pr => console.log('  - ' + pr)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
