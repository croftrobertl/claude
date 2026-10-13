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
  ['witchmoon', 'halloween', 'The witch and her cat swoop once across the full moon (4.10.2)'],
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
  /* 4.10.2 (Rob: "One swoop, no loop"): the witch glides in, dives across
   * the moon and swoops out off the FAR side, moving one way across from
   * entry to exit — never reversing, never turning round — as smoothly as
   * the arrival; the moon up before she arrives and fading after she has
   * gone. */
  if (!ONLY.length || ONLY.includes('witchmoon')) {
    console.log('\n  --- witchmoon: one swoop across the moon, at 320 / 390 / 1280 ---');
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
            if (v && v.R && !geo) { geo = { R: v.R, MR: v.MR, W: v.W, mx: v.mx, my: v.my, vw: s.vw, vh: s.vh, cross: v.cross, dir: v.dir }; }
            const tail = v && v.cape && v.wx != null ? v.cape[0][v.cape[0].length - 1] : null;
            out.push(v ? { x: v.wx, y: v.wy, a: v.moonA, t: v.t2, rot: v.rot, wi: v.wi, onMoon: !!(v.wx != null && v.onMoon), vx: v.vx, vy: v.vy,
              tx: tail && tail.x, ty: tail && tail.y, fs: v.fs, sil: v.sil || 0 } : null);
            s.tick(1000 / 30, 1);
          }
          return { out, geo, ended: !s.vig, pre: s.witch };
        });
        const g = r.geo, seen = r.out.map(o => o && o.x != null);
        const i0 = seen.indexOf(true), i1 = seen.lastIndexOf(true);
        const gaps = seen.slice(i0, i1 + 1).filter(x => !x).length;
        const xs = r.out.filter(o => o && o.x != null);
        const first = xs[0], last = xs[xs.length - 1];
        const spd = o => Math.hypot(o.vx, o.vy);
        ok(r.ended && gaps === 0, `${w}px: she is drawn continuously from entry to exit (${xs.length} frames)`, `gaps ${gaps}`);
        ok((first.x < 0 && last.x > g.vw) || (first.x > g.vw && last.x < 0), `${w}px: she enters off one side and leaves off the FAR side`, `${first.x.toFixed(0)} → ${last.x.toFixed(0)} (vw ${g.vw})`);
        /* one way across: her horizontal velocity never changes sign, and
         * never even comes close to stopping */
        const minVx = Math.min(...xs.slice(1).map(o => o.vx * g.dir));
        ok(minVx > 20, `${w}px: she only ever moves one way across, entry to exit (slowest sideways ${minVx.toFixed(0)} px/s)`, String(minVx));
        const facing = new Set(xs.map(o => o.fs));
        ok(facing.size === 1 && first.fs === g.dir, `${w}px: she faces the way she flies the whole time, never turning round or flipping`, [...facing].join(','));
        const crossing = xs.filter(o => o.onMoon && Math.hypot(o.x - g.mx, o.y - g.my) < g.MR);
        ok(crossing.length >= 3, `${w}px: she dives across the moon's face, silhouetted (${crossing.length} frames)`, String(crossing.length));
        const maxRot = Math.max(...xs.map(o => Math.abs(o.rot)));
        ok(maxRot <= 0.6 + 1e-9, `${w}px: she stays upright, never tilted past 0.6 rad (max ${maxRot.toFixed(2)})`, String(maxRot));
        /* the swoop out ends with her tilt easing back toward level */
        const outFr = xs.filter(o => o.wi >= g.cross && o.x > 0 && o.x < g.vw);
        const outMax = Math.max(...outFr.map(o => Math.abs(o.rot))), exitRot = Math.abs(outFr[outFr.length - 1].rot);
        const climb = o => Math.atan2(-o.vy, Math.abs(o.vx)) * 180 / Math.PI;
        const steep = Math.max(...outFr.map(climb)), atEdge = climb(outFr[outFr.length - 1]);
        ok(outFr.length > 10 && atEdge <= 25 && atEdge < steep - 2, `${w}px: she levels off as she leaves (climbing ${atEdge.toFixed(0)}° at the edge, ${steep.toFixed(0)}° at the steepest)`, `${atEdge} ${steep}`);
        ok(outFr.length > 10 && exitRot < outMax - 0.05, `${w}px: as she leaves her tilt eases back toward level (${exitRot.toFixed(2)} at the edge, ${outMax.toFixed(2)} at most in the swoop out)`, `${exitRot} ${outMax}`);
        const trail = xs.filter(o => o.tx != null && spd(o) > 60).map(o => ((o.tx - o.x) * o.vx + (o.ty - o.y) * o.vy) / spd(o));
        /* behind her, or swung out to the side as she pulls out (which a
         * real cape does): never streaming FORWARD, i.e. never more than
         * half its length ahead of her along her flight */
        const capeLen = 7 * 4.9 * g.W / 100;
        const behind = trail.filter(d => d < 0).length / Math.max(1, trail.length), worst = Math.max(...trail);
        ok(trail.length > 20 && behind >= 0.8 && worst < capeLen / 2, `${w}px: her cape trails her (behind ${(100 * behind).toFixed(0)}% of frames, otherwise swung out; never more than ${worst.toFixed(0)} px ahead)`, `${behind} ${worst}`);
        ok(r.pre && r.pre.frames === 12 && r.pre.moon, `${w}px: the moon and her 12 riding frames were pre-drawn`, JSON.stringify(r.pre));
        let maxTurn = 0, maxJump = 0, maxTilt = 0;
        for (let k = 2; k < xs.length; k++) {
          const a0 = Math.atan2(xs[k - 1].vy, xs[k - 1].vx), a1 = Math.atan2(xs[k].vy, xs[k].vx);
          maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))));
          maxJump = Math.max(maxJump, Math.abs(spd(xs[k]) - spd(xs[k - 1])) / Math.max(1, spd(xs[k - 1])));
          maxTilt = Math.max(maxTilt, Math.abs(xs[k].rot - xs[k - 1].rot));
        }
        ok(maxTurn <= 0.23, `${w}px: her heading changes smoothly, no kink (largest change ${maxTurn.toFixed(3)} rad in a 1/30 s frame, limit 0.23)`, String(maxTurn));
        ok(maxJump <= 0.07, `${w}px: no jump in speed (largest ${(100 * maxJump).toFixed(1)}% in a frame, limit 7%)`, String(maxJump));
        ok(maxTilt <= 2.2 / 30 + 1e-6, `${w}px: her tilt never snaps (largest ${maxTilt.toFixed(3)} rad in a frame, limit ${(2.2 / 30).toFixed(3)})`, String(maxTilt));
        /* the silhouette: her WHOLE figure, exactly once, only over the moon */
        let rises = 0, darkRuns = 0;
        for (let k = 1; k < xs.length; k++) {
          if (xs[k].onMoon && !xs[k - 1].onMoon) { rises++; }
          if (xs[k].sil > 0 && !(xs[k - 1].sil > 0)) { darkRuns++; }
        }
        if (xs[0].sil > 0) { darkRuns++; }
        const fullDark = xs.filter(o => o.sil >= 1).length, fadeIn = xs.filter((o, k) => k && o.sil > 0 && o.sil < 1 && o.sil > xs[k - 1].sil).length;
        const farOn = xs.filter(o => o.onMoon && Math.hypot(o.x - g.mx, o.y - g.my) > g.MR + g.W);
        ok(rises === 1 && darkRuns === 1 && fullDark >= 4, `${w}px: she goes dark exactly once, across the moon (${fullDark} frames fully dark)`, `rises ${rises}, dark runs ${darkRuns}`);
        ok(!farOn.length, `${w}px: she is dark only while she overlaps the moon`, JSON.stringify(farOn[0]));
        ok(fadeIn >= 3 && fadeIn <= 6, `${w}px: the silhouette fades in over about 150 ms (${fadeIn} frames)`, String(fadeIn));
        const top = Math.min(...xs.filter(o => o.x > 0 && o.x < g.vw).map(o => o.y));
        ok(top - 0.56 * g.W >= -2, `${w}px: her hat never leaves the top of the screen (highest point ${top.toFixed(0)}, hat ${(0.56 * g.W).toFixed(0)} above it)`, String(top));
        const total = r.out.length / 30, flight = xs.length / 30;
        ok(total >= 3.5 && total <= 6.8, `${w}px: the whole scene takes ${total.toFixed(1)} s, her flight ${flight.toFixed(1)} s (scene 3.5-6.8)`, `${total}`);
        const onAt = r.out.find(o => o && o.x != null && o.x > -g.W / 2 && o.x < g.vw + g.W / 2);
        ok(onAt && onAt.a >= 0.99, `${w}px: the moon is fully up before any of her comes on screen`, JSON.stringify(onAt));
        const after = r.out.slice(i1 + 1).filter(Boolean);
        ok(after.length >= 15 && after[after.length - 1].a < 0.1 && after.every((o, k) => k === 0 || o.a <= after[k - 1].a + 1e-9), `${w}px: the moon fades out after she has gone (${(after.length / 30).toFixed(1)} s)`, JSON.stringify(after.slice(-1)));
      } finally { await ses.close(); }
    }
  }

  /* 4.10.1 (Rob: "Can the witch and moon appear behind it?"): the header's
   * letters are cut out of the scene, so the page's title shows through.
   * Since 4.10.7 the scene is on the header picture's own canvas, above
   * everything in the header in BOTH layerings, so both cut. Read the canvas's
   * own pixels: inside the moon, where the mask has a letter, the canvas
   * is empty; just beside the letters, the moon is there. */
  if (!ONLY.length || ONLY.includes('witchmoon')) {
    console.log('\n  --- witchmoon behind the header text, on the homepage banner and another page ---');
    for (const [w, banner] of [[390, true], [1280, true], [390, 'page'], [1280, 'page']]) {
      for (const layer of ['front', 'behind']) {
        const cfg = config(['--theme=halloween', '--placement=content', `--layering=${layer}`, '--density=16', '--noparticles', '--diag']);
        cfg.vigOnly = 'witchmoon'; cfg.vigFirst = 300; cfg.vigGap = 1e9; cfg.heroEvery = [9999, 10000]; cfg.forceHour = 12;
        const ses = await open(fixture({ kind: 'bravada', config: cfg, banner }), { viewport: { width: w, height: w < 768 ? 844 : 800 } });
        try {
          await ses.page.waitForFunction(() => window.DCCSeasonsEngine && window.DCCSeasonsEngine._state, null, { timeout: 15000 });
          const r = await ses.page.evaluate(() => {
            const s = window.DCCSeasonsEngine._state; s.manual(true);
            for (let i = 0; i < 600 && !s.vig; i++) { s.tick(1000 / 30, 1); }
            let letter = 0, letterHit = 0, beside = 0, besideHit = 0, frames = 0;
            for (let i = 0; i < 30 * 12 && s.vig; i++) {
              s.tick(1000 / 30, 1);
              const v = s.vigSt, H = s.witch.hdr;
              if (!H || !v || v.moonA < 0.99 || i % 5) { continue; }
              frames++;
              const cv = s.witch.canvas, dpr = cv.width / cv.getBoundingClientRect().width, g = cv.getContext('2d'), o = s.sky;
              const mk = H.c.getContext('2d'), mdc = H.c.width / H.w, sy = window.pageYOffset; /* exact: built on whole device pixels */
              /* sample the moon's disc on a grid */
              for (let yy = -v.MR + 4; yy < v.MR - 4; yy += 3) {
                for (let xx = -v.MR + 4; xx < v.MR - 4; xx += 3) {
                  if (xx * xx + yy * yy > (v.MR - 5) * (v.MR - 5)) { continue; }
                  const px = v.mx + xx, py = v.my + yy;
                  /* keep clear of the witch */
                  if (v.wx != null && Math.hypot(px - v.wx, py - v.wy) < v.W) { continue; }
                  /* px/py are the sky canvas's own; the mask is page px */
                  const mx = Math.round((px + o.left - H.x) * mdc), my = Math.round((py + o.top + sy - H.y) * mdc);
                  if (mx < 0 || my < 0 || mx >= H.c.width || my >= H.c.height) { continue; }
                  const ma = mk.getImageData(mx, my, 1, 1).data[3], ca = g.getImageData(Math.round((px + o.ox) * dpr), Math.round((py + o.oy) * dpr), 1, 1).data[3];
                  if (ma > 250) { letter++; if (ca < 12) { letterHit++; } }
                  else if (ma === 0) {
                    /* "beside": no letter within 3 px either way */
                    const near = mk.getImageData(Math.max(0, mx - 6), Math.max(0, my - 6), 13, 13).data;
                    let clear = true; for (let q = 3; q < near.length; q += 4) { if (near[q]) { clear = false; break; } }
                    if (clear) { beside++; if (ca > 240) { besideHit++; } }
                  }
                }
              }
            }
            return { letter, letterHit, beside, besideHit, frames, hdr: !!s.witch.hdr, cuts: s.witch.cuts };
          });
          const tag = `${w}px ${banner === true ? 'homepage' : 'other page'}, ${layer}`;
          {
            ok(r.hdr && r.letter > 30 && r.letterHit / r.letter > 0.97, `${tag}: where the title's letters cross the moon, the letters show through (${r.letterHit}/${r.letter} letter samples clear)`, JSON.stringify(r));
            ok(r.beside > 30 && r.besideHit / r.beside > 0.97, `${tag}: beside the letters the moon is solid (${r.besideHit}/${r.beside})`, JSON.stringify(r));
          }
        } finally { await ses.close(); }
      }
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
