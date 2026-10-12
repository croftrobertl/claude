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
 * build/Seasons - scene strips 4.3.0.png for the report.
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
  /* 4.3.0: the three scenes that were emoji, now Rob's drawn picks */
  ['witchmoon', 'halloween', 'The witch and her cat swoop across the full moon and loop it (4.10.0)'],
  ['arrival', 'snowbird', 'F-A — three flamingos flap down, land, and flap away'],
  ['duckparade', 'spring_canal', 'D-A — a mottled duck hen leads four ducklings along the water'],
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
          /* witchmoon keeps its place as mx/my; arrival as a list of birds */
          const bs = v && v.birds ? v.birds.filter(b => b.x > -30 && b.x < 420) : null;
          const fx = v && (v.mx != null ? v.mx : bs && bs.length ? bs.reduce((a, b) => a + b.x, 0) / bs.length : null);
          const fy = v && (v.my != null ? v.my : bs && bs.length ? bs.reduce((a, b) => a + b.y, 0) / bs.length : null);
          return { v: v ? { p: v.p || v.st2 || 0, x: fx != null ? fx : v.sx != null && v.p >= 2 ? v.sx : (v.x != null ? v.x : v.gx), y: fy != null ? fy : v.y, tx: v.tx } : null, wy: s.waterY, log: s.vigLog };
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
  /* 4.8.0 (Rob): the witch flies EDGE TO EDGE with one loop around the
   * moon — never vanishing mid-screen, the loop on screen from 320px up,
   * the moon up before she arrives and fading after she has gone. */
  if (!ONLY.length || ONLY.includes('witchmoon')) {
    console.log('\n  --- witchmoon: the swoop across the moon, one loop, at 320 / 390 / 1280 ---');
    for (const w of [320, 390, 1280]) {
      const cfg = config(['--theme=halloween', '--placement=content', '--layering=front', '--density=16', '--diag']);
      cfg.vigOnly = 'witchmoon'; cfg.vigFirst = 300; cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; cfg.forceHour = 12;
      const ses = await open(fixture({ kind: 'bravada', config: cfg }), { viewport: { width: w, height: w < 768 ? 640 : 800 } });
      try {
        await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
        const r = await ses.page.evaluate(() => {
          const s = window.DCCSeasonsEngine._state; s.manual(true);
          for (let i = 0; i < 600 && !s.vig; i++) { s.tick(1000 / 30, 1); }
          const out = []; let geo = null;
          for (let i = 0; i < 30 * 15 && s.vig; i++) {
            const v = s.vigSt;
            if (v && v.R && !geo) { geo = { R: v.R, MR: v.MR, W: v.W, mx: v.mx, my: v.my, vw: s.vw, vh: s.vh, l0: v.loop0, l1: v.loop1 }; }
            const tail = v && v.cape && v.wx != null ? v.cape[0][v.cape[0].length - 1] : null;
            out.push(v ? { x: v.wx, y: v.wy, a: v.moonA, t: v.t2, rot: v.rot, wi: v.wi, onMoon: !!(v.wx != null && v.onMoon), vx: v.vx, vy: v.vy,
              tx: tail && tail.x, ty: tail && tail.y } : null);
            s.tick(1000 / 30, 1);
          }
          return { out, geo, ended: !s.vig, pre: s.witch };
        });
        const g = r.geo, seen = r.out.map(o => o && o.x != null);
        const i0 = seen.indexOf(true), i1 = seen.lastIndexOf(true);
        const gaps = seen.slice(i0, i1 + 1).filter(x => !x).length;
        const xs = r.out.filter(o => o && o.x != null);
        const first = xs[0], last = xs[xs.length - 1];
        ok(r.ended && gaps === 0, `${w}px: she is drawn continuously from entry to exit (${xs.length} frames)`, `gaps ${gaps}`);
        ok((first.x < 0 && last.x > g.vw) || (first.x > g.vw && last.x < 0), `${w}px: she enters off one side and leaves off the other`, `${first.x.toFixed(0)} → ${last.x.toFixed(0)} (vw ${g.vw})`);
        const loop = xs.filter(o => o.wi >= g.l0 && o.wi < g.l1);
        ok(loop.every(o => Math.abs(Math.hypot(o.x - g.mx, o.y - g.my) - g.R) < 2), `${w}px: the loop is a circle of radius ${g.R} round the moon`, '');
        const half = g.W / 2;
        const out = loop.filter(o => o.x < half || o.x > g.vw - half || o.y < half || o.y > g.vh - half);
        ok(loop.length > 20 && !out.length, `${w}px: the loop (${loop.length} frames, radius ${g.R}) stays inside the screen with her whole width`, JSON.stringify(out[0]));
        const ang = loop.map(o => Math.atan2(o.y - g.my, o.x - g.mx));
        let turn = 0; for (let k = 1; k < ang.length; k++) { let d = ang[k] - ang[k - 1]; while (d > Math.PI) { d -= 2 * Math.PI; } while (d < -Math.PI) { d += 2 * Math.PI; } turn += d; }
        ok(Math.abs(turn) > 5.5 && Math.abs(turn) < 7.2, `${w}px: one full loop around the moon (${(turn * 180 / Math.PI).toFixed(0)}°)`, `${turn}`);
        /* 4.10.0 (Rob: "Swoop + banked loop") */
        const near = (o, a) => { const d = Math.atan2(o.y - g.my, o.x - g.mx); return Math.abs(Math.atan2(Math.sin(d - a), Math.cos(d - a))) < 0.35; };
        const spd = o => Math.hypot(o.vx, o.vy);
        const topV = loop.filter(o => near(o, -Math.PI / 2)).map(spd), botV = loop.filter(o => near(o, Math.PI / 2)).map(spd);
        const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
        ok(topV.length && botV.length && avg(topV) < 0.62 * avg(botV), `${w}px: she slows over the top of the loop and speeds up at the bottom (${avg(topV).toFixed(0)} vs ${avg(botV).toFixed(0)} px/s)`, `${topV.length}/${botV.length}`);
        const crossing = xs.filter(o => o.onMoon && Math.hypot(o.x - g.mx, o.y - g.my) < g.MR);
        ok(crossing.length >= 3, `${w}px: she dives across the moon's face, silhouetted (${crossing.length} frames)`, String(crossing.length));
        const maxRot = Math.max(...xs.map(o => Math.abs(o.rot)));
        const leanIn = loop.filter(o => near(o, 0) || near(o, Math.PI)).filter(o => Math.sign(o.rot) === Math.sign(g.mx - o.x)).length;
        ok(maxRot <= 0.6 + 1e-9, `${w}px: she stays upright, never tilted past 0.6 rad (max ${maxRot.toFixed(2)})`, String(maxRot));
        ok(leanIn >= 4, `${w}px: on the sides of the loop she leans INTO the turn (${leanIn} frames)`, String(leanIn));
        const trail = xs.filter(o => o.tx != null && spd(o) > 60).map(o => ((o.tx - o.x) * o.vx + (o.ty - o.y) * o.vy) / spd(o));
        /* behind her, or swung out to the side in a turn (which a real cape
         * does): never streaming FORWARD, i.e. never more than half its
         * length ahead of her along her flight */
        const capeLen = 8 * 4.6 * g.W / 100;
        const behind = trail.filter(d => d < 0).length / Math.max(1, trail.length), worst = Math.max(...trail);
        ok(trail.length > 20 && behind >= 0.8 && worst < capeLen / 2, `${w}px: her cape trails her (behind ${(100 * behind).toFixed(0)}% of frames, otherwise swung out; never more than ${worst.toFixed(0)} px ahead)`, `${behind} ${worst}`);
        ok(r.pre && r.pre.frames === 12 && r.pre.moon, `${w}px: the moon and her 12 riding frames were pre-drawn`, JSON.stringify(r.pre));
        const total = r.out.length / 30;
        ok(total >= 7 && total <= 9.5, `${w}px: the whole pass takes ${total.toFixed(1)} s (7-9.5)`, `${total}`);
        const onAt = r.out.find(o => o && o.x != null && o.x > 0 && o.x < g.vw);
        ok(onAt && onAt.a >= 0.99, `${w}px: the moon is fully up before she comes on screen`, JSON.stringify(onAt));
        const after = r.out.slice(i1 + 1).filter(Boolean);
        ok(after.length >= 20 && after[after.length - 1].a < 0.1 && after.every((o, k) => k === 0 || o.a <= after[k - 1].a + 1e-9), `${w}px: the moon fades out after she has gone (${(after.length / 30).toFixed(1)} s)`, JSON.stringify(after.slice(-1)));
      } finally { await ses.close(); }
    }
  }

  /* composite */
  if (strips.length) {
    const { chromium } = playwright();
    const b = await chromium.launch({ args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }));
    const p = await b.newPage({ viewport: { width: 1900, height: 800 } });
    const img = f => `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}">`;
    await p.setContent(`<meta charset=utf-8><style>body{margin:0;padding:18px;background:#eef1f4;font:15px system-ui;color:#123}
      h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:16px 0 6px}.r{display:flex;gap:6px}.b{width:300px}.b img{width:300px;display:block;border:1px solid #bcc}.b span{font-size:12px;color:#456}</style>
      <h1>DCC Seasons 4.3.0 — the drawn scenes, played through on a mocked clock</h1>
      <div>390px phone, Rob's live settings, the theme's own sprites running. Each close-up follows the action (magnified); one frame per story phase.</div>
      ${strips.map(s => `<h2>${s.story}</h2><div class=r>${s.frames.map(fr => `<div class=b>${img(fr.f)}<span>t = ${fr.t.toFixed(1)}s</span></div>`).join('')}</div>`).join('')}`);
    await p.screenshot({ path: path.join(OUT, 'Seasons - scene strips 4.3.0.png'), fullPage: true });
    await b.close();
    for (const s of strips) for (const fr of s.frames) { /* keep */ }
  }
  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { problems.forEach(pr => console.log('  - ' + pr)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
