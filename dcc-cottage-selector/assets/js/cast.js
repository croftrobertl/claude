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
  var DUR = 3000;             // must match --dccs-cast-dur in selector.css

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
    // The mouth sits near the TOP of the band: the fish hangs below it, so this is
    // what keeps the whole body inside the water strip.
    var lure = { x: Math.max(wl + 6, wr - 13), y: Math.round(bandTop + 4) };
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
    // The drawing is ~9 units from dorsal to belly, so k is derived from that.
    var fishH = Math.min(11, bandH - 5);
    var k = Math.min(1.15, fishH / 9);

    // THE EXIT. The fish is hauled up and away, but "up" is where the words are,
    // so it may only rise once it is horizontally clear of them. `run` is how far
    // right it travels; `rise` is 0 unless it gets clear early enough that the
    // lift happens entirely past the last glyph. On a heading wide enough to leave
    // no margin there is nowhere to rise to, and the fish simply runs and fades.
    // How far right of the lure the fish starts its approach.
    var swimIn = Math.min(38, Math.max(18, roomRight));
    var fishLeftAtRest = lure.x - 19.2 * k;
    var clearBy = Math.max(0, glyphRight - fishLeftAtRest) + 6;
    var run = Math.min(76, Math.max(34, W - lure.x + 22));
    var rise = (run * 0.85 >= clearBy) ? -Math.min(22, bandTop + 10) : 0;
    return { W: W, H: H, wl: wl, wr: wr, guard: guard, glyphRight: glyphRight,
             bandTop: bandTop, bandBottom: bandBottom, bandH: bandH, fishH: fishH,
             k: k, run: run, rise: rise, swimIn: swimIn,
             lowRod: !highRod, lure: lure,
             rodTip: rodTip, rodButt: rodButt, c1: c1, c2: c2 };
  }

  // ---- easing + segment helpers -------------------------------------------
  function clamp01(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }
  /** Progress through [a,b] of the overall clock, clamped. */
  function seg(ms, a, b) { return clamp01((ms - a) / (b - a)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeIn(t) { return t * t; }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function pt(a, b, t) { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }

  // ---- the timeline, in ms ------------------------------------------------
  // The approach was shortened to pay for the ending: it is the least interesting
  // part, and the fight and the haul are where the whole thing earns its keep.
  var T = {
    rodIn:   [0, 240],
    flickBk: [240, 480],
    flickFw: [480, 760],
    line:    [480, 880],     // the cast unspools
    lureIn:  [760, 900],
    ripple1: [860, 1520],
    ripple2: [980, 1760],
    bob:     [860, 1460],
    fishIn:  [1060, 1520],   // swims in from the right
    take:    [1520, 1680],
    fight:   [1680, 2200],   // thrashing on the hook
    haul:    [2200, 2780],   // accelerating away
    splash:  [2300, 2680],
    rodOut:  [2780, 3000]    // the rod leaves LAST
  };

  /**
   * THE RIG. One function, one source of truth: the fish's MOUTH.
   *
   * Everything that has to stay attached is derived from `mouth` — the line's far
   * endpoint, the lure, the ripple centre, the splash. 0.31.0 animated the fish,
   * the lure and the line as three CSS keyframe timelines with three different
   * easings (ease-in-out, ease-out, ease-in), the fish rotating about its own
   * CENTRE so its mouth swung away from wherever the lure was, and the taut line's
   * geometry fixed so nothing moved its far end. They could not stay together: the
   * lure floated free, then ended up stuck to the tail of a fish 30px from the end
   * of the line, and the ripple stayed where the lure first landed.
   *
   * That is the same failure as measuring the glyph guard two different ways. Two
   * independent answers to "where is the fish" is one too many.
   *
   * @return {object} the complete state of one frame
   */
  function rig(g, ms) {
    var st = {};

    // --- where the mouth is, and nothing else decides this --------------------
    var restMouth = { x: g.lure.x, y: g.lure.y };
    var mouth = { x: restMouth.x, y: restMouth.y };
    var fishOn = ms >= T.fishIn[0] && ms < T.haul[1];
    var thrash = 0;

    if (ms < T.fishIn[0]) {
      st.fishAlpha = 0;
    } else if (ms < T.take[1]) {
      // Swims in from the right, decelerating onto the lure.
      var tin = easeOut(seg(ms, T.fishIn[0], T.fishIn[1]));
      mouth.x = lerp(restMouth.x + g.swimIn, restMouth.x, tin);
      mouth.y = lerp(restMouth.y + 2.5, restMouth.y, tin);
      st.fishAlpha = clamp01(seg(ms, T.fishIn[0], T.fishIn[0] + 160));
    } else if (ms < T.haul[0]) {
      // The fight. The mouth barely moves — the motion is all in the BODY, which
      // is what separates a fighting fish from a sprite being slid sideways.
      var tf = seg(ms, T.fight[0], T.fight[1]);
      thrash = Math.sin(tf * Math.PI * 5.2) * (1 - tf * 0.35);
      mouth.x = restMouth.x + thrash * 1.4;
      mouth.y = restMouth.y + Math.sin(tf * Math.PI * 7.1) * 0.9;
      st.fishAlpha = 1;
    } else {
      // Hauled. Accelerating, not linear — a fish on a line does not leave at a
      // constant speed. It runs horizontally until it is clear of the last glyph,
      // and only then lifts; g.rise is 0 when a wide heading means it never is.
      var th = seg(ms, T.haul[0], T.haul[1]);
      // Accelerating, but not from a standstill: a pure easeIn puts nearly all the
      // travel in the last 100ms and the fish appeared to sit still and then
      // vanish. This keeps a visible run under it while still building speed.
      var run = 0.42 * th + 0.58 * th * th;
      mouth.x = restMouth.x + g.run * run;
      mouth.y = restMouth.y + g.rise * clamp01((run - 0.55) / 0.45);
      thrash = Math.sin(th * Math.PI * 3) * (1 - th) * 0.8;
      st.fishAlpha = 1 - easeIn(clamp01((th - 0.72) / 0.28));
    }
    st.mouth = mouth;
    st.fishOn = fishOn;

    // Heading: the fish points the way it is travelling.
    var headAngle = 0;
    if (ms >= T.haul[0]) {
      var dx = mouth.x - restMouth.x, dy = mouth.y - restMouth.y;
      headAngle = Math.atan2(dy, Math.max(6, dx)) * 180 / Math.PI;
    }
    st.fishAngle = headAngle + thrash * 4;
    // A travelling wave down the spine: the tail sweeps further and later than the
    // middle, which is what reads as a body arcing rather than a rigid sprite.
    // A travelling wave down the spine: the tail sweeps further and later than the
    // middle. Amplitudes are deliberately modest — the whole fish lives in a ~17px
    // band and a bigger sweep puts the tail over the heading's glyphs.
    st.bend1 = thrash * 9;
    st.bend2 = Math.sin((ms / 1000) * Math.PI * 5.2 - 0.9) *
               (ms >= T.take[1] && ms < T.haul[1] ? 11 : 3);

    // --- the lure rides the mouth, by construction ---------------------------
    // It is a child of the fish group with cx/cy at the group's own origin, so it
    // cannot drift: there is no second transform that could disagree.
    st.lureAlpha = ms < T.lureIn[0] ? 0
      : (ms < T.take[0] ? clamp01(seg(ms, T.lureIn[0], T.lureIn[1]))
      : st.fishAlpha);
    st.lureHooked = ms >= T.take[0];
    st.lurePop = ms < T.take[0]
      ? lerp(0.5, 1, easeOut(seg(ms, T.lureIn[0], T.lureIn[1]))) : 1;

    // --- the line ends ON the mouth ------------------------------------------
    var end = (ms >= T.take[0] && st.fishAlpha > 0) ? mouth : restMouth;
    // Tension straightens it. It can never go fully straight: a straight rod-tip
    // to-lure line cuts the bottom-right corner of the last word, because the lure
    // sits under that word. The bow is both physically right and what keeps it off
    // the type — the constraint and the look want the same thing.
    // Tension is capped by CLEARANCE, not just elapsed time. While the mouth is
    // still under the last word, straightening the line walks it into the corner of
    // that word — measured at 1px over. Once the fish is out past the glyphs the
    // line may go as straight as it likes, because there is nothing left to hit.
    var clearance = clamp01((end.x - (g.glyphRight - 6)) / 30);
    var maxTension = lerp(0.42, 0.9, clearance);
    var tension = ms < T.take[0] ? 0
      : Math.min(lerp(0.45, 0.88, easeInOut(seg(ms, T.take[0], T.haul[1]))), maxTension);
    var s1 = pt(g.rodTip, end, 0.34), s2 = pt(g.rodTip, end, 0.68);
    var c1 = pt(g.c1, s1, tension), c2 = pt(g.c2, s2, tension);
    st.lineD = 'M' + g.rodTip.x + ' ' + g.rodTip.y +
      ' C' + c1.x.toFixed(1) + ' ' + c1.y.toFixed(1) +
      ' ' + c2.x.toFixed(1) + ' ' + c2.y.toFixed(1) +
      ' ' + end.x.toFixed(1) + ' ' + end.y.toFixed(1);
    st.lineAlpha = ms < T.line[0] ? 0
      : (ms < T.haul[1] ? 1 : 1 - clamp01(seg(ms, T.haul[1], T.haul[1] + 120)));
    st.lineDraw = easeOut(seg(ms, T.line[0], T.line[1]));   // unspools

    // --- the rod ------------------------------------------------------------
    var angle, slide;
    if (ms < T.rodIn[1]) {
      slide = lerp(62, 0, easeOut(seg(ms, T.rodIn[0], T.rodIn[1]))); angle = 11;
    } else if (ms < T.flickBk[1]) {
      slide = 0; angle = lerp(9, 17, easeInOut(seg(ms, T.flickBk[0], T.flickBk[1])));
    } else if (ms < T.flickFw[1]) {
      slide = 0; angle = lerp(17, -4, easeInOut(seg(ms, T.flickFw[0], T.flickFw[1])));
    } else if (ms < T.take[0]) {
      slide = 0; angle = lerp(-4, 2, easeOut(seg(ms, T.flickFw[1], T.take[0])));
    } else if (ms < T.rodOut[0]) {
      // LOADED while the fish is on: the tip bends under the weight, and the bend
      // eases off as the fish is brought in. This is what sells the weight of it.
      var load = ms < T.haul[0] ? 1 : 1 - easeIn(seg(ms, T.haul[0], T.haul[1]));
      angle = lerp(2, -11, load) + thrash * 1.6;
      slide = 0;
    } else {
      // Springs straight the instant the fish is off, THEN withdraws.
      var to = seg(ms, T.rodOut[0], T.rodOut[1]);
      angle = lerp(3, 8, to); slide = easeIn(to) * 62;
    }
    st.rodAngle = angle;
    st.rodSlide = slide;
    st.rodBend = ms >= T.take[0] && ms < T.haul[1] ? 1 : 0;
    st.rodAlpha = ms < T.rodIn[0] ? 0
      : (ms < 90 ? ms / 90 : 1 - easeIn(seg(ms, T.rodOut[0] + 90, T.rodOut[1])));

    // --- water: the ripple follows the FISH once it is on the surface --------
    st.ring1 = { t: seg(ms, T.ripple1[0], T.ripple1[1]) };
    st.ring2 = { t: seg(ms, T.ripple2[0], T.ripple2[1]) };
    // Before the take the rings sit where the lure landed; after it they track the
    // fish, because that is where the water is being disturbed.
    st.ringAt = ms < T.take[0] ? restMouth : mouth;
    // Gated on clearance as well as time: the splash marks the fish breaking out,
    // which only happens once it is past the last glyph. Over the words there is
    // neither room for it nor a reason.
    var clearOfWords = mouth.x > g.glyphRight + 4;
    st.splash = (ms < T.splash[0] || !clearOfWords)
      ? 0 : 1 - clamp01(seg(ms, T.splash[0], T.splash[1]));
    st.splashAt = mouth;
    return st;
  }

  /**
   * Build the overlay. The fish is drawn with its MOUTH AT ITS OWN ORIGIN and its
   * body running out along -x, so positioning the group with an SVG transform puts
   * the mouth exactly on the rig's mouth point and rotation pivots there too. The
   * lure is a child at (0,0) — the same point — so it is attached by construction
   * rather than by two animations agreeing.
   */
  function buildOverlay(g) {
    var box = document.createElement('div');
    box.className = 'dccs-cast';
    box.setAttribute('aria-hidden', 'true');   // decoration: never announced

    var svg = svgEl('svg', {
      'class': 'dccs-cast-svg', viewBox: '0 0 ' + g.W + ' ' + g.H,
      width: g.W, height: g.H, focusable: 'false', 'aria-hidden': 'true'
    });

    var line = svgEl('path', {
      'class': 'dccs-cast-line', fill: 'none', stroke: 'currentColor',
      'stroke-width': '1.5', 'stroke-linecap': 'round'
    });

    var rod = svgEl('g', { 'class': 'dccs-cast-rod' });
    var rodPath = svgEl('path', {
      'class': 'dccs-cast-rod-path', fill: 'none', stroke: 'currentColor',
      'stroke-width': '2.6', 'stroke-linecap': 'round'
    });
    rod.appendChild(rodPath);

    var ripple = svgEl('g', { 'class': 'dccs-cast-ripple' });
    var ry = Math.max(1.3, Math.min(2.4, (g.bandH - 4) / 7));
    ripple.appendChild(svgEl('ellipse', {
      'class': 'dccs-cast-ring dccs-cast-ring-1', cx: 0, cy: 0, rx: 8, ry: ry,
      fill: 'none', stroke: 'currentColor', 'stroke-width': '1.1'
    }));
    ripple.appendChild(svgEl('ellipse', {
      'class': 'dccs-cast-ring dccs-cast-ring-2', cx: 0, cy: 0, rx: 8, ry: ry,
      fill: 'none', stroke: 'currentColor', 'stroke-width': '1'
    }));

    // A splash as it breaks clear: three short strokes. They throw SIDEWAYS more
    // than up — droplets 11 units above the mouth reached over the heading's
    // glyphs, and the rig only has a ~17px band to play in.
    var splash = svgEl('g', { 'class': 'dccs-cast-splash' });
    [[-5, 0, -10, -3.4], [-1, -1.6, -2, -5], [5, 0, 10, -3.4]].forEach(function (p) {
      splash.appendChild(svgEl('path', {
        fill: 'none', stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-linecap': 'round',
        d: 'M' + p[0] + ' ' + p[1] + ' L' + p[2] + ' ' + p[3]
      }));
    });

    // ---- the fish -----------------------------------------------------------
    // Drawn with its MOUTH AT THE LOCAL ORIGIN and the body hanging DOWN and to
    // the -x side. That is how a fish rising to a surface lure actually sits, and
    // it is also what makes the geometry work: the band between the heading's
    // glyphs and the intro's is only ~17px, and a body centred on the mouth put
    // its dorsal edge and its tail sweep over the guard every time it bent. With
    // the spine below the mouth, almost nothing of the fish is above the lure.
    // Taken from the Wildlife plugin's bass: palette and character only — deep
    // body, blunt jaw, one dark lateral stripe. Its spines, gill plate and eye
    // highlight all turn to mush at this size.
    var k = g.k;
    var U = function (n) { return +(n * k).toFixed(2); };
    var fish = svgEl('g', { 'class': 'dccs-cast-fish' });

    var headG = svgEl('g', { 'class': 'dccs-fish-head' });
    headG.appendChild(svgEl('path', {
      fill: '#3a6b52',
      d: 'M0 0 C' + U(-1.6) + ' ' + U(-1.4) + ' ' + U(-4) + ' ' + U(-1.7) + ' ' + U(-6) + ' ' + U(-1.5) +
         ' L' + U(-6) + ' ' + U(6.6) + ' C' + U(-3.6) + ' ' + U(6.2) + ' ' + U(-1.2) + ' ' + U(3.2) + ' 0 0 Z'
    }));
    headG.appendChild(svgEl('path', {            // dorsal ridge, darker
      fill: '#2e5d46',
      d: 'M' + U(-2.2) + ' ' + U(-0.9) + ' C' + U(-3.6) + ' ' + U(-1.6) + ' ' + U(-4.8) + ' ' + U(-1.8) +
         ' ' + U(-6) + ' ' + U(-1.5) + ' L' + U(-6) + ' ' + U(0.3) + ' Z'
    }));
    headG.appendChild(svgEl('circle', {          // eye: one dark dot, no highlight
      cx: U(-2.4), cy: U(1.2), r: Math.max(0.55, U(0.85)), fill: '#17333c'
    }));

    var midG = svgEl('g', { 'class': 'dccs-fish-mid' });
    midG.appendChild(svgEl('path', {
      fill: '#3a6b52',
      d: 'M0 ' + U(-1.5) + ' C' + U(-2.4) + ' ' + U(-1.6) + ' ' + U(-4.6) + ' ' + U(-0.8) + ' ' + U(-6) + ' ' + U(0.6) +
         ' L' + U(-6) + ' ' + U(5.2) + ' C' + U(-4.6) + ' ' + U(6.4) + ' ' + U(-2.4) + ' ' + U(6.8) + ' 0 ' + U(6.6) + ' Z'
    }));
    midG.appendChild(svgEl('path', {             // pale belly along the underside
      fill: '#c9d8cf',
      d: 'M0 ' + U(4.6) + ' C' + U(-2.4) + ' ' + U(4.9) + ' ' + U(-4.4) + ' ' + U(4.4) + ' ' + U(-5.6) + ' ' + U(3.6) +
         ' L' + U(-6) + ' ' + U(5.2) + ' C' + U(-4.6) + ' ' + U(6.4) + ' ' + U(-2.4) + ' ' + U(6.8) + ' 0 ' + U(6.6) + ' Z'
    }));
    midG.appendChild(svgEl('path', {             // the one dark lateral stripe
      fill: 'none', stroke: '#17333c', 'stroke-width': Math.max(0.85, U(1.4)), 'stroke-linecap': 'round',
      d: 'M0 ' + U(2.4) + ' L' + U(-5.6) + ' ' + U(2.7)
    }));

    var tailG = svgEl('g', { 'class': 'dccs-fish-tail' });
    tailG.appendChild(svgEl('path', {            // peduncle
      fill: '#3a6b52',
      d: 'M0 ' + U(0.6) + ' L' + U(-2.8) + ' ' + U(1.9) + ' L' + U(-2.8) + ' ' + U(4.2) + ' L0 ' + U(5.2) + ' Z'
    }));
    tailG.appendChild(svgEl('path', {            // caudal fin
      fill: '#2e5d46',
      d: 'M' + U(-2.8) + ' ' + U(1.9) + ' L' + U(-7) + ' ' + U(-0.9) +
         ' L' + U(-5.4) + ' ' + U(3.05) + ' L' + U(-7) + ' ' + U(7) + ' L' + U(-2.8) + ' ' + U(4.2) + ' Z'
    }));

    midG.appendChild(tailG);
    fish.appendChild(midG);
    fish.appendChild(headG);
    // The lure sits at the fish group's own origin — the mouth. There is no second
    // transform for it to disagree with, which is the whole fix.
    fish.appendChild(svgEl('circle', {
      'class': 'dccs-cast-lure', cx: 0, cy: 0, r: Math.max(1.8, U(2.2)), fill: '#FFA000'
    }));

    svg.appendChild(line);
    svg.appendChild(rod);
    svg.appendChild(ripple);
    svg.appendChild(splash);
    svg.appendChild(fish);
    box.appendChild(svg);

    box._parts = {
      svg: svg, line: line, rod: rod, rodPath: rodPath, ripple: ripple,
      ring1: ripple.children[0], ring2: ripple.children[1],
      splash: splash, fish: fish, head: headG, mid: midG, tail: tailG,
      lure: fish.querySelector('.dccs-cast-lure')
    };
    return box;
  }

  /** Write one frame. Transforms, opacity, and the line's path data only. */
  function paint(box, g, ms) {
    var p = box._parts;
    if (!p) { return; }
    var st = rig(g, ms);
    var k = g.k;

    // Rod. Bends under load by bowing its own path, not by scaling anything.
    var bend = st.rodBend * 5;
    p.rodPath.setAttribute('d',
      'M' + g.rodButt.x + ' ' + g.rodButt.y +
      ' Q' + ((g.rodButt.x + g.rodTip.x) / 2).toFixed(1) + ' ' +
      ((g.rodButt.y + g.rodTip.y) / 2 + bend).toFixed(1) +
      ' ' + g.rodTip.x + ' ' + g.rodTip.y);
    p.rod.setAttribute('transform',
      'translate(' + st.rodSlide.toFixed(1) + ' 0) ' +
      'rotate(' + st.rodAngle.toFixed(2) + ' ' + g.rodButt.x + ' ' + g.rodButt.y + ')');
    p.rod.style.opacity = st.rodAlpha.toFixed(3);

    // Line: one path, endpoint taken straight from the rig's mouth.
    p.line.setAttribute('d', st.lineD);
    p.line.style.opacity = st.lineAlpha.toFixed(3);
    try {
      var len = p.line.getTotalLength ? p.line.getTotalLength() : 0;
      if (len) {
        p.line.style.strokeDasharray = len;
        p.line.style.strokeDashoffset = (len * (1 - st.lineDraw)).toFixed(1);
      }
    } catch (e) { /* no layout yet */ }

    // Fish + lure, one transform, pivoting on the mouth.
    p.fish.setAttribute('transform',
      'translate(' + st.mouth.x.toFixed(2) + ' ' + st.mouth.y.toFixed(2) + ') ' +
      'rotate(' + st.fishAngle.toFixed(2) + ')');
    p.fish.style.opacity = st.fishAlpha.toFixed(3);
    p.mid.setAttribute('transform',
      'translate(' + (-6 * k).toFixed(2) + ' 0) rotate(' + st.bend1.toFixed(2) + ')');
    p.tail.setAttribute('transform',
      'translate(' + (-6 * k).toFixed(2) + ' 0) rotate(' + st.bend2.toFixed(2) + ')');
    p.lure.style.opacity = st.lureAlpha.toFixed(3);
    p.lure.setAttribute('transform', 'scale(' + st.lurePop.toFixed(3) + ')');

    // Water, at the fish once it is on the surface.
    p.ripple.setAttribute('transform',
      'translate(' + st.ringAt.x.toFixed(2) + ' ' + (st.ringAt.y + 1).toFixed(2) + ')');
    var r1 = st.ring1.t, r2 = st.ring2.t;
    p.ring1.setAttribute('transform', 'scale(' + (0.25 + r1 * 2.15).toFixed(3) + ')');
    p.ring1.style.opacity = (r1 <= 0 || r1 >= 1 ? 0 : 0.8 * (1 - r1)).toFixed(3);
    p.ring2.setAttribute('transform', 'scale(' + (0.25 + r2 * 2.75).toFixed(3) + ')');
    p.ring2.style.opacity = (r2 <= 0 || r2 >= 1 ? 0 : 0.45 * (1 - r2)).toFixed(3);

    p.splash.setAttribute('transform',
      'translate(' + st.splashAt.x.toFixed(2) + ' ' + st.splashAt.y.toFixed(2) + ')');
    p.splash.style.opacity = st.splash.toFixed(3);
    return st;
  }

  /**
   * Arm the cast on one Selector root. Returns null — building nothing at all —
   * when motion is reduced or there is no heading to cast over.
   */
  function attach(root) {
    if (!root || reducedMotion()) { return null; }

    var stopped = false, casts = 0, running = false;
    var overlay = null, head = null, word = null, geo = null, raf = null;
    var nextDueAt = 0, wake = null, settleTimer = null, armed = false;
    var lastScroll = 0;

    function clearOverlay() {
      if (raf) { window.cancelAnimationFrame(raf); raf = null; }
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
      geo = g;
      paint(overlay, g, 0);
      if (word) { word.classList.add('dccs-bob'); }

      casts += 1;
      // One rAF timeline drives the whole rig. It replaced six CSS keyframe
      // animations: the fish, the lure and the line each had their own timeline
      // and their own easing, so the moment their curves diverged they came apart.
      // A single clock and a single mouth point is what keeps them together.
      var started = null;
      var step = function (now) {
        if (!running || stopped || !overlay) { return; }
        if (started === null) { started = now; }
        var ms = now - started;
        if (ms >= DUR) {
          running = false;
          raf = null;
          clearOverlay();
          if (stopped || casts >= MAX_CASTS) { stop(); return; }
          nextDueAt = Date.now() + GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
          schedule();
          return;
        }
        paint(overlay, g, ms);
        raf = window.requestAnimationFrame(step);
      };
      raf = window.requestAnimationFrame(step);
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
      /** Test hook: hold the timeline still and paint one exact frame. The rAF
          clock cannot be stepped from outside the way CSS animations could be
          seeked with getAnimations(), and sampling by wall clock drifts. */
      seek: function (ms) {
        if (!overlay || !geo) { return null; }
        if (raf) { window.cancelAnimationFrame(raf); raf = null; }
        running = true;
        return paint(overlay, geo, ms);
      },
      /** Test hook: the rig's own state for a given time, with no DOM at all. */
      rigAt: function (ms) { return geo ? rig(geo, ms) : null; },
      timeline: T,
      duration: DUR,
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
