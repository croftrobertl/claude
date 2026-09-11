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
  var DUR_FISH = 2600;        // must match the longest animation in selector.css
  var DUR_PLAIN = 1900;

  function reducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
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
   * The heading string is editable, so the geometry has to survive both extremes.
   * The first build placed the rod at lure.x + 26 with no upper clamp: with a
   * heading long enough to fill the width, the whole rod sat outside the overlay's
   * clip and NOTHING was drawn. Clamping the rod inside the block is what fixes
   * that — lifting the overlay above the block was the wrong answer, and put the
   * rod outside the card.
   */
  function geometry(head, word) {
    var hb = head.getBoundingClientRect();
    var W = Math.round(hb.width), H = Math.round(hb.height);
    if (!W || !H) { return null; }

    // Where the lure lands: just past the end of the last word, on its baseline.
    var lure = { x: W - 16, y: Math.round(H * 0.4) };
    if (word) {
      var wb = word.getBoundingClientRect();
      if (wb.width) {
        lure.x = Math.min(W - 9, Math.round(wb.right - hb.left) + 11);
        lure.y = Math.round(wb.bottom - hb.top) - Math.max(2, Math.round(wb.height * 0.2));
      }
    }
    // Only the last third of a rod — no hand, no angler, no boat. It enters from
    // the right edge angled down and to the left: the butt is off-frame right and
    // HIGHER than the tip. Both ends are clamped inside the block.
    var rodTip = { x: Math.min(W - 22, lure.x + 22), y: Math.max(6, lure.y - 26) };
    var rodButt = { x: W + 18, y: Math.max(0, rodTip.y - 26) };
    // The arc lives in the margin to the RIGHT of the last word, not across it. An
    // earlier pass put the control point left of the lure and at the top of the
    // block: with a heading line only ~34px tall there is no room above the glyphs,
    // and the "arc over the words" drew a line straight through them — it read as a
    // strikethrough. The cast still sweeps; it just sweeps where there is space.
    var ctrl = { x: Math.round((rodTip.x + lure.x) / 2) + 4, y: Math.max(2, rodTip.y - 13) };
    return { W: W, H: H, lure: lure, rodTip: rodTip, rodButt: rodButt, ctrl: ctrl };
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
         ' Q' + g.ctrl.x + ' ' + g.ctrl.y + ' ' + g.lure.x + ' ' + g.lure.y
    });

    var rod = svgEl('g', { 'class': 'dccs-cast-rod' });
    rod.appendChild(svgEl('path', {
      fill: 'none', stroke: 'currentColor', 'stroke-width': '2.6', 'stroke-linecap': 'round',
      d: 'M' + g.rodButt.x + ' ' + g.rodButt.y + ' L' + g.rodTip.x + ' ' + g.rodTip.y
    }));

    var ripple = svgEl('ellipse', {
      'class': 'dccs-cast-ripple', cx: g.lure.x, cy: g.lure.y, rx: '9', ry: '3',
      fill: 'none', stroke: 'currentColor', 'stroke-width': '1.3'
    });

    var lure = svgEl('circle', {
      'class': 'dccs-cast-lure', cx: g.lure.x, cy: g.lure.y, r: '2.6', fill: '#FFA000'
    });

    // The fish: a silhouette in the same vocabulary as the rest of the site's
    // wildlife marks — solid body, swept tail, no interior detail at this size.
    var fish = svgEl('g', { 'class': 'dccs-cast-fish' });
    fish.appendChild(svgEl('path', {
      fill: 'currentColor',
      d: 'M' + (g.lure.x - 15) + ' ' + (g.lure.y + 4) +
         ' c4.4 -4.6 11.6 -4.6 15.4 0 c-3.8 4.6 -11 4.6 -15.4 0 Z'
    }));
    fish.appendChild(svgEl('path', {
      fill: 'currentColor',
      d: 'M' + (g.lure.x - 16.6) + ' ' + (g.lure.y + 1.2) +
         ' l-4.6 -3.6 l0 7.2 Z'
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
      var withFish = casts === 0;      // the first cast of a visit is the good one
      overlay = buildOverlay(g);
      overlay.classList.add(withFish ? 'is-fishing' : 'is-plain');
      head.appendChild(overlay);
      // Force a style resolve so the animations start from their 0% frame even
      // when the node was appended in the same frame.
      void overlay.offsetWidth;
      overlay.classList.add('is-running');
      if (word) { word.classList.add('dccs-bob'); }

      casts += 1;
      var dur = withFish ? DUR_FISH : DUR_PLAIN;
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
