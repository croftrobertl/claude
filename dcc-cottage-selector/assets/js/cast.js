/**
 * The cast: a fishing rod flicks a line over the "Cottage Wizard" heading, a lure
 * lands past the last word, the word bobs, and on the first cast of a visit a fish
 * takes it. Pure decoration.
 *
 * It exists because the drawn heading marks did not work (see the note at the top
 * of class-heading-marks.php). A 38px pictogram cannot carry three ideas; motion
 * reads at any size. The rod is a FISHING rod rather than a wand on purpose — the
 * whimsy on this site is of the place (the seaplane, the heron, the canal 404),
 * not generic fantasy.
 *
 * RULES THIS FILE MUST KEEP
 *  - Zero layout shift. The overlay is absolutely positioned over the heading
 *    block and reserves nothing. The heading's own box must not move by a pixel,
 *    before, during or after. On /cottages/ the first cast fires DURING page load,
 *    so a shift here is a CLS regression on a page that has already been tuned.
 *  - Nothing tappable, nothing announced: pointer-events:none and aria-hidden.
 *    This is not tidiness. The Seasons easter egg counts taps on the masthead and
 *    the hero seaplane had to be made deliberately unclickable for the same
 *    reason; a second competitor for taps is a bug.
 *  - prefers-reduced-motion: reduce renders NOTHING — not a slower cast, no DOM
 *    at all. attach() returns null before building anything.
 *  - Transform and opacity for everything that moves. The one exception is
 *    stroke-dashoffset, used to unspool the line: it is a paint-only property
 *    with no layout cost, and there is no transform that draws a line.
 *  - The fish is on the FIRST cast, not the last. Most visitors see exactly one
 *    cast and scroll on, so the one nearly everyone sees has to be the good one.
 */
(function () {
  'use strict';

  var DCCS = window.DCCS = window.DCCS || {};

  var SETTLE_MS = 600;        // scroll must be still this long before a cast
  var VISIBLE = 0.5;          // and the widget at least this visible
  var MAX_CASTS = 3;          // per page view, then never again
  var GAP_MIN = 45000;        // jittered so it never feels metronomic
  var GAP_MAX = 75000;
  var DUR = 2600;             // must match the animations in selector.css

  function reducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  /**
   * The rendered glyph bounds of the heading, as the union of Range rects over its
   * text nodes, in the heading block's coordinates. Returns the bottom of the
   * lowest line and the right edge of the widest.
   *
   * This is measured EXACTLY the way the acceptance check measures it, on purpose.
   * 0.29.0 placed the cast against the heading's block box — 322px wide while the
   * words are ~150px — so the fish sat on the "d" of "Wizard" and every check
   * passed. An earlier attempt at this guard used canvas font metrics, which put
   * it at the baseline while the Range rect runs to the font's descender line:
   * close, consistently wrong by ~6px, and the lure landed inside the rect. Two
   * different measurements of "where the letters are" is one too many.
   */
  function textRects(el) {
    var out = [];
    if (!el) { return out; }
    try {
      var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      for (var n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent || !n.textContent.trim()) { continue; }
        var rg = document.createRange();
        rg.selectNodeContents(n);
        var rects = rg.getClientRects();
        for (var i = 0; i < rects.length; i++) {
          if (rects[i].width > 0.5) { out.push(rects[i]); }
        }
      }
    } catch (e) { return []; }
    return out;
  }

  function glyphBounds(heading, intro, hb) {
    var hr = textRects(heading);
    if (!hr.length) { return null; }
    var bottom = null, right = null, i;
    for (i = 0; i < hr.length; i++) {
      var b = hr[i].bottom - hb.top, r = hr[i].right - hb.left;
      if (bottom === null || b > bottom) { bottom = b; }
      if (right === null || r > right) { right = r; }
    }
    // The intro's first line is the floor of the water band. It is only ~17px
    // below the heading's glyphs, so it has to be measured, not assumed: the fish
    // was landing squarely on "queen bed" while passing every heading check.
    var ir = textRects(intro), top = null;
    for (i = 0; i < ir.length; i++) {
      var t = ir[i].top - hb.top;
      if (top === null || t < top) { top = t; }
    }
    return { bottom: Math.ceil(bottom), right: Math.ceil(right), introTop: top };
  }

  function svgEl(name, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (var k in attrs) { if (attrs.hasOwnProperty(k)) { n.setAttribute(k, attrs[k]); } }
    return n;
  }

  /**
   * Geometry for one cast, in the heading block's own pixel space. Recomputed per
   * cast so it follows reflow, breakpoint changes, a heading that wraps, and an
   * edited heading string.
   *
   * THE RULE EVERYTHING HERE SERVES: no part of the cast may touch the heading's
   * GLYPHS. 0.29.0 kept the gesture inside the heading BLOCK, which is 322px wide
   * while the words are far narrower — so the fish sat on the "d" of "Wizard" and
   * every check passed. `guard` is the glyph bottom; the lure, ripple and fish all
   * live below it, and the rod and line stay to the right of the last word until
   * they are below it.
   *
   * The heading string is editable, so this also has to survive a heading wide
   * enough to leave no margin at all: when there is no room to the right of the
   * last word the rod comes in low, at the water, instead of up in the corner.
   */
  function geometry(head, word) {
    var hb = head.getBoundingClientRect();
    var W = Math.round(hb.width), H = Math.round(hb.height);
    if (!W || !H) { return null; }
    if (!word) { return null; }
    var wb = word.getBoundingClientRect();
    if (!wb.width) { return null; }

    var heading = head.querySelector('.dccs-heading') || word;
    var gb = glyphBounds(heading, head.querySelector('.dccs-intro'), hb);
    if (!gb) { return null; }
    var wl = Math.round(wb.left - hb.left);
    var wr = Math.round(wb.right - hb.left);
    var wt = Math.round(wb.top - hb.top);
    // Everything below the words clears the LOWEST line; everything beside them
    // clears the WIDEST. A wrapped heading has both, and they are not the same line.
    var guard = gb.bottom;
    var glyphRight = gb.right;
    // The strip of water the cast gets: below the heading's glyphs, above the
    // intro's. On the live widgets this is about 17px, which is why the fish swims
    // in from the side rather than rising through it — vertical travel it does not
    // have. Every moving part is sized and clamped to this band.
    var bandTop = guard + 2;
    var bandBottom = (gb.introTop !== null ? gb.introTop : H) - 2;
    var bandH = Math.max(9, bandBottom - bandTop);

    // d. The lure drops UNDER the tail of the last word, not past it.
    var lure = { x: Math.max(wl + 6, wr - 13), y: Math.round(bandTop + bandH * 0.42) };
    // Everything that follows the lure lives in the space below the glyphs.
    var roomRight = W - glyphRight;
    var highRod = roomRight >= 52;

    var rodTip, rodButt, c1, c2;
    if (highRod) {
      // b. Enters top right, angled down and to the left. Longer and with more
      // travel than 0.29.0 — this beat announces the whole effect and was easy to
      // miss. Both ends stay right of the last word.
      rodTip = { x: Math.min(W - 26, glyphRight + 22), y: Math.max(4, wt + 3) };
      rodButt = { x: W + 44, y: Math.max(0, rodTip.y - 26) };
      // c. Down the right-hand side, then in under the words to the lure. Three of
      // the four control points sit right of the word and the fourth is below the
      // guard, so the curve has nowhere to cross a letter.
      c1 = { x: rodTip.x + 14, y: guard + 4 };
      c2 = { x: glyphRight + 10, y: guard + 14 };
    } else {
      // No margin beside the words: bring the rod in low, at the water. It sits
      // further below the guard than the high variant needs to, because the flick
      // rotates about the butt end and a 5 degree swing on a 130px rod still lifts
      // the tip by ~11px. The low variant also gets a shallower flick (is-lowrod).
      rodTip = { x: Math.max(30, W - 110), y: guard + 20 };
      rodButt = { x: W + 40, y: guard + 12 };
      c1 = { x: rodTip.x - 12, y: guard + 26 };
      c2 = { x: lure.x + 26, y: guard + 22 };
    }
    // The fish is drawn to fit the band rather than at a fixed size.
    var fishH = Math.min(12, bandH - 3);
    return { W: W, H: H, wl: wl, wr: wr, guard: guard, glyphRight: glyphRight,
             bandTop: bandTop, bandBottom: bandBottom, bandH: bandH, fishH: fishH,
             lowRod: !highRod, lure: lure,
             rodTip: rodTip, rodButt: rodButt, c1: c1, c2: c2 };
  }

  function buildOverlay(g) {
    var box = document.createElement('div');
    box.className = 'dccs-cast';
    // Decoration: never announced, never tappable. Both are load-bearing.
    box.setAttribute('aria-hidden', 'true');

    var svg = svgEl('svg', {
      'class': 'dccs-cast-svg', viewBox: '0 0 ' + g.W + ' ' + g.H,
      width: g.W, height: g.H, focusable: 'false', 'aria-hidden': 'true'
    });

    var line = svgEl('path', {
      'class': 'dccs-cast-line', fill: 'none', stroke: 'currentColor',
      'stroke-width': '1.4', 'stroke-linecap': 'round',
      d: 'M' + g.rodTip.x + ' ' + g.rodTip.y +
         ' C' + g.c1.x + ' ' + g.c1.y + ' ' + g.c2.x + ' ' + g.c2.y +
         ' ' + g.lure.x + ' ' + g.lure.y
    });

    var rod = svgEl('g', { 'class': 'dccs-cast-rod' });
    rod.appendChild(svgEl('path', {
      fill: 'none', stroke: 'currentColor', 'stroke-width': '2.6', 'stroke-linecap': 'round',
      d: 'M' + g.rodButt.x + ' ' + g.rodButt.y + ' L' + g.rodTip.x + ' ' + g.rodTip.y
    }));

    // A ripple is an EDGE, not a fill: two open rings expanding and fading. The
    // single filled-looking ellipse this replaces read as a grey smudge.
    var ripple = svgEl('g', { 'class': 'dccs-cast-ripple' });
    ripple.appendChild(svgEl('ellipse', {
      'class': 'dccs-cast-ring dccs-cast-ring-1', cx: g.lure.x, cy: g.lure.y + 1,
      rx: 8, ry: Math.max(1.4, Math.min(2.6, (g.bandH - 4) / 6)),
      fill: 'none', stroke: 'currentColor', 'stroke-width': '1.1'
    }));
    ripple.appendChild(svgEl('ellipse', {
      'class': 'dccs-cast-ring dccs-cast-ring-2', cx: g.lure.x, cy: g.lure.y + 1,
      rx: 8, ry: Math.max(1.2, Math.min(2.2, (g.bandH - 4) / 7)),
      fill: 'none', stroke: 'currentColor', 'stroke-width': '1'
    }));

    var lure = svgEl('circle', {
      'class': 'dccs-cast-lure', cx: g.lure.x, cy: g.lure.y, r: '2.6', fill: '#FFA000'
    });

    // The fish. Purpose-drawn and scaled to the measured band, not a copy of the
    // Wildlife plugin's 48px bass: its dorsal spines, gill plate and eye highlight
    // all turn to mush at this size, which is the same failure that killed the
    // heading marks. What carries over is the PALETTE and the character — deep
    // body, big jaw, one dark lateral stripe.
    var k = g.fishH / 12;                       // 12 is the size the path is drawn at
    var fx = g.lure.x, fy = Math.round(g.bandTop + g.fishH / 2) + 1;
    var X = function (d) { return (fx + d * k).toFixed(1); };
    var Y = function (d) { return (fy + d * k).toFixed(1); };
    var fish = svgEl('g', { 'class': 'dccs-cast-fish' });
    fish.appendChild(svgEl('path', {           // tail
      fill: '#2e5d46',
      d: 'M' + X(-15.5) + ' ' + Y(0) + ' L' + X(-20.5) + ' ' + Y(-4.2) +
         ' L' + X(-20.5) + ' ' + Y(4.2) + ' Z'
    }));
    fish.appendChild(svgEl('path', {           // body: deep, with a blunt jaw
      fill: '#3a6b52',
      d: 'M' + X(-16) + ' ' + Y(0) +
         ' C' + X(-13.4) + ' ' + Y(-4.6) + ' ' + X(-8.6) + ' ' + Y(-6.6) + ' ' + X(-4.6) + ' ' + Y(-6.6) +
         ' C' + X(-1) + ' ' + Y(-6.6) + ' ' + X(1.2) + ' ' + Y(-4.2) + ' ' + X(1.2) + ' ' + Y(-2) +
         ' C' + X(1.2) + ' ' + Y(0.6) + ' ' + X(-1.2) + ' ' + Y(3) + ' ' + X(-5) + ' ' + Y(3.6) +
         ' C' + X(-9.4) + ' ' + Y(4.3) + ' ' + X(-13.8) + ' ' + Y(3) + ' ' + X(-16) + ' ' + Y(0) + ' Z'
    }));
    fish.appendChild(svgEl('path', {           // pale belly
      fill: '#c9d8cf',
      d: 'M' + X(-13.6) + ' ' + Y(1.8) +
         ' C' + X(-11.2) + ' ' + Y(4.2) + ' ' + X(-7) + ' ' + Y(5) + ' ' + X(-3.4) + ' ' + Y(4.4) +
         ' C' + X(-5.6) + ' ' + Y(6.2) + ' ' + X(-11.4) + ' ' + Y(6.4) + ' ' + X(-13.6) + ' ' + Y(1.8) + ' Z'
    }));
    fish.appendChild(svgEl('path', {           // the one dark lateral stripe
      fill: 'none', stroke: '#17333c', 'stroke-width': Math.max(1, 1.6 * k),
      'stroke-linecap': 'round',
      d: 'M' + X(-13.2) + ' ' + Y(-0.6) + ' L' + X(-2.6) + ' ' + Y(-1.2)
    }));

    svg.appendChild(line);
    svg.appendChild(rod);
    svg.appendChild(ripple);
    svg.appendChild(fish);
    svg.appendChild(lure);
    box.appendChild(svg);
    return box;
  }

  /**
   * Arm the cast on one Selector root. Returns null — building nothing at all —
   * when motion is reduced or there is no heading to cast over.
   */
  function attach(root) {
    if (!root || reducedMotion()) { return null; }

    var stopped = false, casts = 0, running = false;
    var overlay = null, head = null, word = null;
    var nextDueAt = 0, wake = null, settleTimer = null, armed = false;
    var lastScroll = 0;

    function clearOverlay() {
      if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      overlay = null;
      if (word) { word.classList.remove('dccs-bob'); }
    }

    /** Permanent: someone using the widget does not need to be invited to use it. */
    function stop() {
      if (stopped) { return; }
      stopped = true;
      clearOverlay();
      if (wake) { clearTimeout(wake); wake = null; }
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    }

    function visibleEnough() {
      if (!head) { return false; }
      var r = head.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (!r.height || !vh) { return false; }
      var shown = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      return (shown / r.height) >= VISIBLE;
    }

    function canCast() {
      return !stopped && !running && armed && casts < MAX_CASTS &&
        !document.hidden && visibleEnough() &&
        (Date.now() - lastScroll) >= SETTLE_MS && Date.now() >= nextDueAt;
    }

    function cast(force) {
      if (!force && !canCast()) { return false; }
      if (running || stopped) { return false; }
      head = root.querySelector('.dccs-head');
      word = root.querySelector('.dccs-heading-w');
      if (!head) { return false; }
      var g = geometry(head, word);
      if (!g) { return false; }

      clearOverlay();
      running = true;
      // The fish is on EVERY cast. An earlier build made later casts quieter, which
      // worked against the point of having it: with a three-cast cap there is no
      // risk of it wearing out, and a guest who lingers should see it again.
      overlay = buildOverlay(g);
      if (g.lowRod) { overlay.classList.add('is-lowrod'); }
      head.appendChild(overlay);
      // Force a style resolve so the animations start from their 0% frame even
      // when the node was appended in the same frame.
      void overlay.offsetWidth;
      overlay.classList.add('is-running');
      if (word) { word.classList.add('dccs-bob'); }

      casts += 1;
      var dur = DUR;
      setTimeout(function () {
        running = false;
        clearOverlay();
        if (stopped || casts >= MAX_CASTS) { stop(); return; }
        nextDueAt = Date.now() + GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
        schedule();
      }, dur + 60);
      return true;
    }

    function schedule() {
      if (wake) { clearTimeout(wake); }
      if (stopped) { return; }
      wake = setTimeout(tick, Math.max(200, nextDueAt - Date.now()));
    }

    function tick() {
      if (stopped) { return; }
      if (canCast()) { cast(false); return; }
      // Declined (hidden tab, scrolled away, still scrolling). Re-check later
      // rather than dropping the cast: scrolling back must re-arm it.
      schedule();
    }

    function onScroll() {
      lastScroll = Date.now();
      if (settleTimer) { clearTimeout(settleTimer); }
      settleTimer = setTimeout(tick, SETTLE_MS + 20);
    }

    var io = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function () { tick(); }, { threshold: [0, VISIBLE, 1] });
    }

    /** Re-attach after a rerender rebuilt the root, and keep the observer on the
        live node. Casting that has already stopped stays stopped. */
    function sync() {
      if (stopped) { return; }
      var h = root.querySelector('.dccs-head');
      if (h === head) { return; }
      if (io && head) { io.unobserve(head); }
      head = h;
      word = root.querySelector('.dccs-heading-w');
      overlay = null;
      if (!head) { return; }      // left the landing screen; nothing to cast over
      if (io) { io.observe(head); }
    }

    // Interaction ends it, permanently and for every kind of input.
    ['pointerdown', 'keydown', 'change'].forEach(function (ev) {
      root.addEventListener(ev, stop, { passive: true });
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', tick);

    // Do not compete with page load. On /cottages/ the heading is on screen at
    // load and this fires without any scrolling, so it must wait for the widget's
    // own init AND for first paint to settle before arming.
    function arm() {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (stopped) { return; }
          armed = true;
          sync();
          nextDueAt = Date.now();
          schedule();
        });
      });
    }
    if (document.readyState === 'complete') { arm(); }
    else { window.addEventListener('load', arm, { once: true }); }

    return {
      sync: sync,
      stop: stop,
      cast: cast,
      // Read-only view for tests and the audit harness.
      state: function () {
        return { stopped: stopped, running: running, casts: casts, armed: armed,
                 hasOverlay: !!overlay, nextDueAt: nextDueAt };
      }
    };
  }

  DCCS.cast = {
    attach: attach,
    MAX_CASTS: MAX_CASTS,
    SETTLE_MS: SETTLE_MS,
    VISIBLE: VISIBLE,
    reducedMotion: reducedMotion
  };
})();
