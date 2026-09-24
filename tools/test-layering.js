'use strict';
/**
 * DCC Seasons — layering proof.
 *
 * Answers, by measurement rather than by reading the CSS:
 *   1. Where did each canvas mount, and what stacking context is it in?
 *   2. Does anything the visitor reads get painted OVER by a canvas?
 *   3. Can a canvas intercept a click?
 *
 * Question 2 is answered with elementFromPoint over real text rects, not by
 * comparing z-index numbers: z-index only orders siblings within one
 * stacking context, so two "correct" numbers in different contexts prove
 * nothing. elementFromPoint is layout, so it is also valid in a headless
 * browser whose visibilityState has paused rAF.
 *
 * Usage: node tools/test-layering.js [--keep]
 */
const { config, open, settle } = require('./harness');
const { page: fixture } = require('./fixture');

let pass = 0, fail = 0;
const problems = [];
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; problems.push(`${label}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
}

/** Every canvas the plugin owns, with the facts that decide layering. */
const PROBE = () => {
  const out = [];
  document.querySelectorAll('canvas.dcc-seasons-canvas, canvas[class*="dcc-seasons"]').forEach(cv => {
    const cs = getComputedStyle(cv);
    const path = [];
    for (let n = cv.parentElement; n; n = n.parentElement) {
      path.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') +
        (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : ''));
    }
    // nearest ancestor that establishes a stacking context
    let ctx = null;
    for (let n = cv.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      const makes = (s.position !== 'static' && s.zIndex !== 'auto') ||
        s.transform !== 'none' || s.filter !== 'none' || s.isolation === 'isolate' ||
        (s.opacity !== '' && parseFloat(s.opacity) < 1) || s.willChange === 'transform';
      if (makes) { ctx = { tag: n.tagName.toLowerCase() + (n.id ? '#' + n.id : ''), z: s.zIndex, pos: s.position, transform: s.transform !== 'none', isolation: s.isolation }; break; }
    }
    const r = cv.getBoundingClientRect();
    out.push({
      cls: cv.className, z: cs.zIndex, position: cs.position,
      pointerEvents: cs.pointerEvents, ariaHidden: cv.getAttribute('aria-hidden'),
      w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), left: Math.round(r.left),
      parent: path[path.length - 1] || '(detached)', ctx,
    });
  });
  return out;
};

/* "Behind" has TWO failure modes and they need opposite measurements:
 *   - the canvas painting OVER text          -> COVER below
 *   - the canvas being HIDDEN BY content     -> REACH here
 * A backdrop can pass the first and still be invisible, which is the half
 * of "not showing up behind content correctly" that a coverage number
 * alone never catches. This grids the canvas's own on-screen box and asks
 * what paints at each point. */
const REACH = () => {
  const cv = document.querySelector('canvas.dcc-seasons-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  const vx0 = Math.max(0, r.left), vx1 = Math.min(innerWidth, r.right);
  const vy0 = Math.max(0, r.top), vy1 = Math.min(innerHeight, r.bottom);
  if (vx1 - vx0 < 2 || vy1 - vy0 < 2) {
    return { measurable: false, onScreenH: Math.round(Math.max(0, vy1 - vy0)), screenH: innerHeight };
  }
  let seen = 0, open = 0, hostOpen = 0;
  const blockers = {}, outside = {};
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const x = vx0 + ((i + 0.5) / 8) * (vx1 - vx0);
      const y = vy0 + ((j + 0.5) / 8) * (vy1 - vy0);
      const top = document.elementFromPoint(x, y);
      if (!top) continue;
      seen++;
      if (top === cv || top.tagName === 'HTML' || top.tagName === 'BODY') { open++; hostOpen++; continue; }
      /* The HOST's own background is not a blocker, and neither is any
       * ancestor of it. A negative-z-index child paints AFTER its stacking
       * context's background and border and BEFORE that context's in-flow
       * content, so the canvas is already above the host's own paint.
       * Counting the host understates reach — measured, it cost 8 of 64
       * samples on the Elementor fixture. Only a DESCENDANT of the host can
       * actually hide the canvas. */
      const host = cv.parentElement;
      if (host && (top === host || top.contains(host))) { open++; hostOpen++; continue; }
      const cs = getComputedStyle(top);
      const bg = cs.backgroundColor || '';
      const m = /^rgba?\(([^)]+)\)/.exec(bg);
      const alpha = m ? (m[1].split(',').length < 4 ? 1 : parseFloat(m[1].split(',')[3]) || 0) : 0;
      if (alpha <= 0.05 && cs.backgroundImage === 'none') { open++; hostOpen++; continue; }
      const k = top.tagName.toLowerCase() + (top.id ? '#' + top.id : '') +
        (typeof top.className === 'string' && top.className ? '.' + top.className.trim().split(/\s+/)[0] : '');
      /* Only a DESCENDANT of the host can wrongly hide the backdrop. A
       * separate region scrolling over it — the footer riding up over a
       * sticky content canvas — is ordinary page composition, not a
       * layering defect, and the footer gets its own canvas under footer
       * placement anyway. Counted separately so the two never get
       * confused: a fix aimed at the wrong one would transfer the footer's
       * background onto the content canvas. */
      const h = cv.parentElement;
      if (h && h.contains(top)) { blockers[k] = (blockers[k] || 0) + 1; }
      else { outside[k] = (outside[k] || 0) + 1; hostOpen++; }
    }
  }
  return {
    measurable: true,
    canvasReach: seen ? Math.round((open / seen) * 100) : 0,
    hostReach: seen ? Math.round((hostOpen / seen) * 100) : 0,
    outside,
    screenCovered: Math.round(((Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) / innerHeight) * 100),
    canvasBox: `${Math.round(r.width)}x${Math.round(r.height)} @ top ${Math.round(r.top)}`,
    blockers,
  };
};

/** Sample real text rects and ask what actually paints on top there. */
const COVER = (sel) => {
  const hits = [];
  const els = [...document.querySelectorAll(sel)];
  for (const el of els) {
    const rng = document.createRange();
    rng.selectNodeContents(el);
    for (const r of rng.getClientRects()) {
      if (r.width < 8 || r.height < 6) continue;
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const pts = [[r.left + 3, r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 3, r.top + r.height / 2]];
      for (const [x, y] of pts) {
        const top = document.elementFromPoint(x, y);
        if (!top) continue;
        hits.push({ tag: top.tagName.toLowerCase(), cls: String(top.className || ''), x: Math.round(x), y: Math.round(y) });
      }
    }
  }
  const covered = hits.filter(h => /dcc-seasons/.test(h.cls));
  return { sampled: hits.length, covered: covered.length, examples: covered.slice(0, 4) };
};

async function run(kind, placement, label) {
  console.log(`\n=== ${label} ===`);
  /* NOT --diag: the diagnostics panel is a real DOM overlay (a box with a
   * textarea), so measuring reach with it on reports the panel itself as a
   * blocker. Measured: 12 of 64 grid samples hit the panel. */
  const cfg = config([`--placement=${placement}`, '--theme=florida_keys']);
  const html = fixture({ kind, config: cfg });
  const ses = await open(html, { viewport: { width: 1280, height: 900 } });
  try {
    await settle(ses.page);
    const canvases = await ses.page.evaluate(PROBE);
    const state = await ses.page.evaluate(() => {
      const s = window.DCCSeasonsEngine && window.DCCSeasonsEngine._state;
      return s ? { placement: s.placement, hostPath: s.hostPath, vw: s.vw, vh: s.vh, parts: s.parts ? s.parts.length : 0, textBoxes: s.textBoxes ? s.textBoxes.length : 0 } : null;
    });

    console.log('  engine state:', JSON.stringify(state));
    canvases.forEach(c => console.log('  canvas:', JSON.stringify(c)));

    ok(canvases.length > 0, 'a canvas mounted', `found ${canvases.length}`);
    ok(canvases.every(c => c.pointerEvents === 'none'), 'every canvas is pointer-events:none',
      canvases.map(c => c.pointerEvents).join(','));
    ok(canvases.every(c => c.ariaHidden === 'true'), 'every canvas is aria-hidden');
    ok(canvases.every(c => c.w >= 1 && c.h >= 1), 'every canvas has real area',
      canvases.map(c => `${c.w}x${c.h}`).join(' '));

    // Content text must never be painted over.
    const body = await ses.page.evaluate(COVER, 'p.about, p.z-index, .elementor-section p, .card, #post-620 p');
    console.log('  body text:', JSON.stringify(body));
    ok(body.covered === 0, 'no BODY text is painted over by a canvas',
      body.covered ? JSON.stringify(body.examples) : '');

    // Footer text must never be painted over either.
    const foot = await ses.page.evaluate(COVER, 'footer#colophon p, footer#colophon h3, footer#colophon a');
    console.log('  footer text:', JSON.stringify(foot));
    ok(foot.covered === 0, 'no FOOTER text is painted over by a canvas',
      foot.covered ? JSON.stringify(foot.examples) : '');

    // The other half: is the backdrop actually visible, or hidden by content?
    const reach = await ses.page.evaluate(REACH);
    console.log('  reach:', JSON.stringify(reach));
    if (reach && reach.measurable) {

      ok(reach.hostReach >= 70, 'canvas is not hidden by content inside its own host',
        `only ${reach.hostReach}% clear; blockers ${JSON.stringify(reach.blockers)}`);
    }

    /* Coverage is not a load-time fact: everything that covers the backdrop
     * on this site is below the fold when the settled pass runs. Sweep the
     * scroll range and hold the floor there, because that is where the
     * visitor actually reads. */
    if (placement === 'content') {
      const sweep = [];
      for (const y of [0, 400, 900, 1400]) {
        await ses.page.evaluate(sy => window.scrollTo(0, sy), y);
        await ses.page.waitForTimeout(1100); // > the 500ms re-check rate limit
        sweep.push({ y, ...(await ses.page.evaluate(REACH)) });
      }
      sweep.forEach(s => console.log(`  scrollY=${String(s.y).padStart(4)}  hostReach ${s.hostReach}%  (raw ${s.canvasReach}%)  screen ${s.screenCovered}%  inside ${JSON.stringify(s.blockers || {})}  outside ${JSON.stringify(s.outside || {})}`));
      const worst = Math.min(...sweep.filter(s => s.measurable).map(s => s.hostReach));
      ok(worst >= 70, 'backdrop is not hidden by content inside its own host, at any scroll offset',
        `worst ${worst}% — ` + JSON.stringify(sweep.filter(s => s.hostReach === worst)[0].blockers));
      /* The screen-coverage question is about where the reader IS, not
       * about scroll 0: the content column starts below the hero, so a
       * backdrop mounted in it legitimately covers less than half the
       * viewport before the reader has scrolled to the content at all. */
      const bestScreen = Math.max(...sweep.filter(s => s.measurable).map(s => s.screenCovered));
      ok(bestScreen >= 80, 'backdrop spans the screen once the reader reaches the content',
        `best ${bestScreen}% across the scroll range`);
      await ses.page.evaluate(() => window.scrollTo(0, 0));
    }

    if (ses.logs.length) { console.log('  console:', ses.logs.slice(0, 4).join(' | ')); }
    return { canvases, state, body, foot, reach };
  } finally { await ses.close(); }
}

(async () => {
  await run('bravada', 'content', 'Home page (Bravada chain) — placement: content');
  await run('elementor', 'content', 'Elementor page — placement: content');
  await run('bravada', 'footer', 'Home page (Bravada chain) — placement: footer');
  await run('elementor', 'footer', 'Elementor page — placement: footer');

  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail) { problems.forEach(p => console.log('  - ' + p)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
