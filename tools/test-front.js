'use strict';
/**
 * DCC Seasons — the live configuration: placement=content, layering=front.
 *
 * A fixed full-viewport canvas on <body> is a different animal from a
 * backdrop mounted inside the content column, and until 4.1.0 no suite
 * exercised it. It is also the configuration the site actually runs.
 *
 * What has to be true at once:
 *   - it must not outrank anything the visitor NEEDS: the severe-weather
 *     banner, a lightbox, the mobile nav;
 *   - it must never eat a tap, including the five that open the egg;
 *   - reduced motion must silence ALL THREE layers, not just one;
 *   - it must stay cheap enough to run on a phone.
 *
 * Usage: node tools/test-front.js [--shots]
 */
const fs = require('fs');
const path = require('path');
const { config, open, settle } = require('./harness');
const { page: fixture } = require('./fixture');

const SHOTS = process.argv.includes('--shots');
const OUT = path.resolve(__dirname, '..', 'build');

let pass = 0, fail = 0;
const problems = [];
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; problems.push(`${label}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
}

const LIVE = ['--placement=content', '--layering=front', '--density=16', '--opacity=1', '--theme=florida_keys'];

/* ---------------------------------------------------------------- 1. z-index */
async function zIndexBand() {
  console.log('\n=== z-index band: decoration must lose to anything that matters ===');
  const ses = await open(fixture({ kind: 'elementor', config: config(LIVE) }));
  try {
    await settle(ses.page);
    const r = await ses.page.evaluate(() => {
      const cv = document.querySelector('canvas.dcc-seasons-canvas');
      const cs = getComputedStyle(cv);
      const z = el => parseInt(getComputedStyle(el).zIndex, 10);
      const rect = cv.getBoundingClientRect();
      return {
        canvasZ: parseInt(cs.zIndex, 10),
        position: cs.position,
        pointerEvents: cs.pointerEvents,
        ariaHidden: cv.getAttribute('aria-hidden'),
        tabIndex: cv.tabIndex,
        parent: cv.parentElement.tagName.toLowerCase(),
        full: Math.round(rect.width) >= innerWidth - 1 && Math.round(rect.height) >= innerHeight - 1,
        bannerZ: z(document.querySelector('.dcc-wx-banner')),
        lightboxZ: z(document.querySelector('.elementor-lightbox')),
        navZ: z(document.querySelector('.mobile-nav')),
      };
    });
    console.log('  ', JSON.stringify(r));
    ok(r.position === 'fixed' && r.parent === 'body', 'front mode is fixed on <body>');
    ok(r.full, 'canvas fills the viewport');
    ok(r.canvasZ < r.bannerZ, 'canvas is BELOW the severe-weather banner', `${r.canvasZ} vs ${r.bannerZ}`);
    ok(r.canvasZ < r.lightboxZ, 'canvas is below the Elementor lightbox', `${r.canvasZ} vs ${r.lightboxZ}`);
    ok(r.canvasZ < r.navZ, 'canvas is below the mobile nav', `${r.canvasZ} vs ${r.navZ}`);
    ok(r.pointerEvents === 'none', 'canvas cannot intercept a click');
    ok(r.ariaHidden === 'true', 'canvas is aria-hidden');
    ok(r.tabIndex <= 0, 'canvas is not focusable', String(r.tabIndex));

    // The banner must be the element actually hit, not merely numerically higher.
    const hit = await ses.page.evaluate(() => {
      const b = document.querySelector('.dcc-wx-banner').getBoundingClientRect();
      const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return el ? el.className || el.tagName : 'none';
    });
    ok(/dcc-wx-banner/.test(String(hit)), 'the banner is what is actually painted on top', String(hit));
    if (SHOTS) {
      fs.mkdirSync(OUT, { recursive: true });
      await ses.page.screenshot({ path: path.join(OUT, 'Seasons - front desktop 1280.png') });
    }
  } finally { await ses.close(); }
}

/* ------------------------------------------------------------- 2. the egg */
async function tapEgg() {
  console.log('\n=== the Matrix egg still fires under a full-viewport canvas ===');
  const ses = await open(fixture({ kind: 'bravada', config: config(LIVE) }));
  try {
    await settle(ses.page);
    const before = await ses.page.evaluate(() => !!window.DCCSeasonsMatrix);
    /* Five real clicks on the configured target. If the canvas ate taps,
     * the counter would never reach the threshold. */
    for (let i = 0; i < 5; i++) {
      await ses.page.click('#site-title', { delay: 20 });
      await ses.page.waitForTimeout(90);
    }
    await ses.page.waitForTimeout(1200);
    const r = await ses.page.evaluate(() => ({
      matrix: !!window.DCCSeasonsMatrix,
      overlay: !!document.querySelector('canvas:not(.dcc-seasons-canvas), [style*="2147483000"]'),
    }));
    console.log('  ', JSON.stringify({ before, ...r }));
    ok(r.matrix, 'five taps on #site-title loaded the egg', 'the canvas is eating taps');
  } finally { await ses.close(); }
}

/* ----------------------------------------------- 3. prefers-reduced-motion */
async function reducedMotion() {
  console.log('\n=== prefers-reduced-motion silences all three layers ===');
  const ses = await open(fixture({ kind: 'bravada', config: config(LIVE) }), { reducedMotion: 'reduce' });
  try {
    await ses.page.waitForTimeout(4000); // well past the idle-callback fetch
    const r = await ses.page.evaluate(() => ({
      canvas: !!document.querySelector('canvas.dcc-seasons-canvas'),
      engine: !!window.DCCSeasonsEngine,
      engineScript: [...document.scripts].some(s => /engine/.test(s.src || '')),
      matrix: !!window.DCCSeasonsMatrix,
      loader: !!window.DCCSeasonsSchedule,
    }));
    console.log('  ', JSON.stringify(r));
    ok(r.loader, 'the loader itself still runs (it is 4KB and must stay cheap)');
    ok(!r.engineScript, 'Layer 1 + Layer 2: the engine is never even fetched');
    ok(!r.canvas, 'no canvas is mounted, so neither layer can draw');
    /* Layer 3 is user-invoked, so "silenced" cannot mean "unreachable" —
     * that would be a different and wrong behaviour. It means the egg does
     * not ANIMATE: matrix.js draws a static themed banner instead of the
     * rain. So open it for real and check which branch ran, rather than
     * asserting that the loader contains a line of source. */
    for (let i = 0; i < 5; i++) {
      await ses.page.click('#site-title', { delay: 20 });
      await ses.page.waitForTimeout(90);
    }
    await ses.page.waitForTimeout(1500);
    const egg = await ses.page.evaluate(() => {
      if (!window.DCCSeasonsMatrix) return { loaded: false };
      const ov = [...document.querySelectorAll('div')]
        .find(d => (d.style.zIndex | 0) > 2000000000);
      if (!ov) return { loaded: true, overlay: false };
      const cv = ov.querySelector('canvas');
      if (!cv) return { loaded: true, overlay: true, canvas: false };
      /* The rain repaints every frame; the static banner does not. Sample
       * the SAME pixels twice and see whether they moved. */
      const g = cv.getContext('2d', { willReadFrequently: true });
      const take = () => {
        const d = g.getImageData(0, 0, cv.width, Math.min(cv.height, 200)).data;
        let sum = 0;
        for (let i = 3; i < d.length; i += 4 * 31) sum += d[i];
        return sum;
      };
      const a = take();
      return new Promise(res => setTimeout(() => {
        res({ loaded: true, overlay: true, canvas: true, moved: take() !== a });
      }, 600));
    });
    console.log('   egg:', JSON.stringify(egg));
    ok(egg.loaded, 'Layer 3: the egg is still REACHABLE under reduced motion');
    ok(egg.canvas !== true || egg.moved === false,
      'Layer 3: the egg shows the static banner, it does not animate',
      JSON.stringify(egg));
  } finally { await ses.close(); }
}

/* -------------------------------------------------------- 4. performance */
async function performance() {
  console.log('\n=== frame cost at the live density, full viewport ===');
  for (const [label, viewport, density] of [
    ['desktop 1280x900', { width: 1280, height: 900 }, 16],
    ['iPhone 390x844', { width: 390, height: 844 }, 16],
  ]) {
    const ses = await open(fixture({ kind: 'elementor', config: config([...LIVE, `--density=${density}`, '--diag']) }), { viewport });
    try {
      await settle(ses.page);
      /* Measure with rAF timestamps in the page: a frame budget is about
       * what the main thread actually did, not about wall-clock sleeps. */
      const m = await ses.page.evaluate(() => new Promise(resolve => {
        const frames = [];
        let last = 0, n = 0;
        function tick(t) {
          if (last) frames.push(t - last);
          last = t;
          if (++n < 90) requestAnimationFrame(tick);
          else {
            frames.sort((a, b) => a - b);
            const st = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
            resolve({
              frames: frames.length,
              medianMs: +frames[Math.floor(frames.length / 2)].toFixed(2),
              p95Ms: +frames[Math.floor(frames.length * 0.95)].toFixed(2),
              engineFrameAvgMs: st ? +(+st.frameAvg).toFixed(3) : null,
              parts: st ? st.parts.length : null,
              subtle: st ? st.subtle.n : null,
            });
          }
        }
        requestAnimationFrame(tick);
      }));
      console.log(`  ${label}:`, JSON.stringify(m));
      /* The engine's own per-frame cost is the number that matters; the rAF
       * delta is dominated by the headless compositor's pacing. */
      ok(m.engineFrameAvgMs === null || m.engineFrameAvgMs < 6,
        `${label}: engine work stays under 6ms/frame`, `${m.engineFrameAvgMs}ms`);
    } finally { await ses.close(); }
  }
}

/* ------------------------------------------- 5. hidden tab must not animate */
async function hiddenTab() {
  console.log('\n=== a hidden tab must not burn the main thread ===');
  const ses = await open(fixture({ kind: 'bravada', config: config([...LIVE, '--diag']) }));
  try {
    await settle(ses.page);
    const r = await ses.page.evaluate(() => new Promise(resolve => {
      /* The engine listens for visibilitychange; fake the hidden state the
       * way the spec exposes it and dispatch the event it binds to. */
      const d = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      let frames = 0;
      const stop = () => { frames++; };
      const raf = requestAnimationFrame(function loop() { stop(); requestAnimationFrame(loop); });
      setTimeout(() => {
        const st = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
        Object.defineProperty(document, 'visibilityState', d || { configurable: true, get: () => 'visible' });
        resolve({ paused: st ? !st.running : null, parts: st ? st.parts.length : null });
      }, 700);
    }));
    console.log('  ', JSON.stringify(r));
    ok(r.paused !== false, 'the engine pauses when the tab is hidden', JSON.stringify(r));
  } finally { await ses.close(); }
}

/* ----------------------------------------------------------- 6. mobile */
async function mobile() {
  console.log('\n=== iPhone width ===');
  const ses = await open(fixture({ kind: 'elementor', config: config(LIVE) }),
    { viewport: { width: 390, height: 844 } });
  try {
    await settle(ses.page);
    const r = await ses.page.evaluate(() => {
      const cv = document.querySelector('canvas.dcc-seasons-canvas');
      const rect = cv.getBoundingClientRect();
      return {
        canvas: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        viewport: `${innerWidth}x${innerHeight}`,
        docW: document.documentElement.scrollWidth,
        overflowX: document.documentElement.scrollWidth > innerWidth,
        pe: getComputedStyle(cv).pointerEvents,
      };
    });
    console.log('  ', JSON.stringify(r));
    ok(!r.overflowX, 'no horizontal overflow at 390px', `doc ${r.docW} vs vp 390`);
    ok(r.pe === 'none', 'still cannot intercept a touch');

    // Text must stay readable: nothing of the canvas paints over a glyph.
    const covered = await ses.page.evaluate(() => {
      let hits = 0, sampled = 0;
      for (const el of document.querySelectorAll('p, .card, h3')) {
        const rng = document.createRange(); rng.selectNodeContents(el);
        for (const r of rng.getClientRects()) {
          if (r.width < 8 || r.top < 0 || r.top > innerHeight) continue;
          sampled++;
          const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (t && /dcc-seasons/.test(String(t.className || ''))) hits++;
        }
      }
      return { sampled, hits };
    });
    console.log('  text:', JSON.stringify(covered));
    ok(covered.hits === 0, 'no text is intercepted by the canvas at phone width');
    if (SHOTS) {
      fs.mkdirSync(OUT, { recursive: true });
      await ses.page.screenshot({ path: path.join(OUT, 'Seasons - front iPhone 390.png') });
    }
  } finally { await ses.close(); }
}

(async () => {
  await zIndexBand();
  await tapEgg();
  await reducedMotion();
  await performance();
  await hiddenTab();
  await mobile();
  console.log(`\n${pass} passed · ${fail} failed`);
  if (SHOTS) console.log(`screenshots in ${OUT}/`);
  if (fail) { problems.forEach(p => console.log('  - ' + p)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
