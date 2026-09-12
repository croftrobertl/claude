/*
 * DCC Cottage Selector 0.33.0 — generated bundle. DO NOT EDIT.
 *
 * Built by tools/build-bundle.php from, in order:
 *   assets/js/score.js
 *   assets/js/labels.js
 *   assets/js/availability.js
 *   assets/js/cast.js
 *   assets/js/selector.js
 *
 * Edit those files, then run `php tools/build-bundle.php`. `npm test`
 * fails if this file and the sources have drifted apart.
 */

/* ---- assets/js/score.js ---- */
/**
 * Two-phase scoring pipeline for the Dora Canal cottage selector.
 *
 * Functions operate ONLY on data keys — no display strings live here. The single
 * side effect is the per-render duplicateOf display flag (set by dedupe, cleared
 * by run). Exposed on the global DCCS namespace so labels.js and selector.js can
 * use them without a build step.
 *
 * Phase 1 — Binary Exclusion (hard filters): pet → only #34; ground-floor-only
 *   → drop #23; table-for-4 → only #22/#23; party of 3–4 → drop the two studios
 *   (#33/#34, the only cottages without a pull-out couch). If ≤3 cottages
 *   survive, return them and bypass Phase 2 to avoid artificial score
 *   distortion.
 * Phase 2 — Relative Weighted Scoring of the survivors.
 */
(function (window) {
  'use strict';

  var DCCS = window.DCCS = window.DCCS || {};

  function isGround(c) {
    return String(c.floorLevel || '').toLowerCase().indexOf('ground') === 0;
  }

  /**
   * Hard-requirement features. Each key maps a binary cottage trait to its test
   * and the no-match tag shown when a fallback cottage fails it. Quick Match
   * "must-haves" and Weigh-Priorities "High" answers both resolve to these keys.
   */
  var FEATURES = {
    pet:      { test: function (c) { return c.petAllowed === true; }, tag: 'tag_pet' },
    ground:   { test: function (c) { return isGround(c); }, tag: 'tag_upstairs' },
    dining4:  { test: function (c) { return Number(c.diningSeats) >= 4; }, tag: 'tag_dining' },
    porch:    { test: function (c) { return c.screenedPorch === true; }, tag: 'tag_porch' },
    desk:     { test: function (c) { return c.desk === true; }, tag: 'tag_desk' },
    pullout:  { test: function (c) { return c.pulloutCouch === true; }, tag: 'tag_pullout' },
    studio:   { test: function (c) { return c.layoutType === 'Studio'; }, tag: 'tag_studio' },
    onebed:   { test: function (c) { return c.layoutType !== 'Studio'; }, tag: 'tag_onebed' },
    moreroom: { test: function (c) { return Number(c.squareFeet) >= 336; }, tag: 'tag_moreroom' },
    party34:  { test: function (c) { return Number(c.guests) >= 3; }, tag: 'tag_party' }
  };

  /** Phase 1: apply hard filters (crit.hard = feature keys), collecting a reason ledger. */
  function phase1(cottages, crit) {
    var pool = cottages.slice();
    var excluded = [];
    var hard = (crit && crit.hard) || [];

    hard.forEach(function (key) {
      var f = FEATURES[key];
      if (!f) { return; }
      pool = pool.filter(function (c) {
        if (f.test(c)) { return true; }
        excluded.push({ id: c.id, reasonKey: 'ex_' + key });
        return false;
      });
    });

    return { pool: pool, excluded: excluded };
  }

  /** Phase 2: weighted score for one cottage. Higher is better. */
  function scoreOne(c, crit) {
    var s = 0;
    var sqft = Number(c.squareFeet) || 0;

    s += (sqft / 100) * (crit.wSpace || 0) * 0.5;
    s += (c.desk ? 1 : 0) * (crit.wDesk || 0);
    s += (c.pulloutCouch ? 1 : 0) * (crit.wPullout || 0);
    s += (c.layoutType === 'Studio' ? 1 : 0) * (crit.wStudio || 0);
    s += (c.layoutType !== 'Studio' ? 1 : 0) * (crit.wOneBed || 0);
    s += (Number(c.diningSeats) >= 4 ? 1 : 0) * (crit.wDining || 0);
    s += (c.petAllowed ? 1 : 0) * (crit.wPet || 0);
    s += (isGround(c) ? 1 : 0) * (crit.wFewerStairs || 0);
    s += (c.screenedPorch ? 1 : 0) * (crit.wScreenedPorch || 0);
    s += (Number(c.guests) >= 3 ? 1 : 0) * (crit.wParty || 0);

    return s;
  }

  /**
   * Stable identity signature: the comparison-matrix fields PLUS the per-cottage
   * highlights.
   *
   * Highlights are guest-visible facts printed on the result card, so two
   * cottages listing different ones are not interchangeable — telling a guest
   * that 31 is "identical" to 32 while 31's card advertises a paved sun area 32
   * genuinely lacks (owner-confirmed) is simply false. Sorted before joining so
   * a reordering in cottages.json can never invent a difference, and joined with
   * a separator that cannot occur inside a highlight line.
   */
  function signature(c, diffFields) {
    var spec = diffFields.map(function (f) { return f + ':' + c[f]; }).join('|');
    var hl = (c.highlights || []).slice().sort().join('\u241F');
    return spec + '||highlights:' + hl;
  }

  /**
   * Annotate identical-signature cottages within a displayed list. The
   * lower-id member of each duplicate group gets duplicateOf = the other id, so
   * the UI can explain why both appear.
   */
  function dedupe(list, diffFields) {
    var groups = {};
    list.forEach(function (c) {
      var sig = signature(c, diffFields);
      (groups[sig] = groups[sig] || []).push(c);
    });
    Object.keys(groups).forEach(function (sig) {
      var g = groups[sig];
      if (g.length < 2) { return; }
      g.sort(function (a, b) { return Number(a.id) - Number(b.id); });
      // Lower-id option references the next one in the group.
      g[0].duplicateOf = g[1].id;
    });
    return list;
  }

  /**
   * Run the full pipeline.
   * @returns {{results: Array, excluded: Array, bypassed: boolean, empty: boolean}}
   */
  function run(cottages, crit) {
    // dedupe() marks duplicateOf on the shared cottage objects for the CURRENT
    // display list. Clear all marks at the start of every run so a pair flagged in
    // one render can't leak a stale "identical to Cottage X" note into a later
    // render where X isn't on screen.
    cottages.forEach(function (c) { delete c.duplicateOf; });
    var p1 = phase1(cottages, crit);
    var pool = p1.pool;

    if (pool.length === 0) {
      return { results: [], excluded: p1.excluded, bypassed: false, empty: true };
    }

    // Tie-break: a ROTATED data order rather than "lowest ID first". With no
    // preferences every cottage scores 0, and an ID tie-break meant 22/23/31 were
    // the top three for every guest, every day, while 33-36 never surfaced
    // (owner decision, 0.23.0). crit.rotation is an integer offset chosen once per
    // page load (selector.js derives it from the calendar day, so a visit is
    // stable and every cottage leads in turn); absent, order falls back to the
    // data file, which is ascending by ID.
    var n = cottages.length;
    var rot = (crit && typeof crit.rotation === 'number' && n) ? ((crit.rotation % n) + n) % n : 0;
    var rank = {};
    cottages.forEach(function (c, i) { rank[c.id] = ((i - rot) % n + n) % n; });   // rotation r: index r leads
    function tieBreak(a, b) { return (rank[a.id] || 0) - (rank[b.id] || 0); }

    if (pool.length <= 3) {
      var direct = pool.slice().sort(tieBreak);
      return { results: direct, excluded: p1.excluded, bypassed: true, empty: false };
    }

    var scored = pool.map(function (c) { return { c: c, s: scoreOne(c, crit) }; });
    scored.sort(function (a, b) {
      if (b.s !== a.s) { return b.s - a.s; }
      return tieBreak(a.c, b.c);
    });

    return {
      results: scored.map(function (x) { return x.c; }),
      excluded: p1.excluded,
      bypassed: false,
      empty: false
    };
  }

  DCCS.score = {
    run: run,
    dedupe: dedupe,
    signature: signature,
    isGround: isGround,
    FEATURES: FEATURES
  };
})(window);
;

/* ---- assets/js/labels.js ---- */
/**
 * Badge + "why this fits" allocation. Pure data → key arrays; selector.js maps
 * the returned keys to translatable copy from config.strings. No display strings
 * live here, satisfying the data-driven requirement.
 */
(function (window) {
  'use strict';

  var DCCS = window.DCCS = window.DCCS || {};

  function inSet(id, ids) { return ids.indexOf(String(id)) !== -1; }

  /** Creative result badges per the spec's data signatures. Returns badge keys. */
  function badges(c) {
    var out = [];
    var id = String(c.id);

    if (inSet(id, ['22', '23'])) { out.push('spacious'); }
    if (c.screenedPorch) { out.push('porch'); }             // 22
    if (c.desk) { out.push('work'); }                       // 22, 23
    if (c.layoutType === 'Studio') { out.push('compact'); } // 33, 34
    if (c.petAllowed) { out.push('pet'); }                  // 34
    if (DCCS.score.isGround(c)) { out.push('ground'); }     // any except 23
    if (!DCCS.score.isGround(c)) { out.push('upstairs'); }  // 23
    if (inSet(id, ['31', '32', '35', '36'])) { out.push('suite'); }

    return out;
  }

  /**
   * Ordered reason keys for the "Why this fits your trip" snippet. Reasons the
   * guest asked for come first, then other notable features, capped at three.
   */
  function whyFits(c, crit) {
    var ranked = [];
    function add(key, wanted, present) {
      if (present) { ranked.push({ key: key, wanted: !!wanted }); }
    }

    add('desk', crit.wDesk > 0, c.desk);
    // 'space' renders "the most square footage of the bunch", so only the actual
    // largest cottages (400 sq ft) may claim it — NOT the ≥336 "more room" tier,
    // which would show a false superlative on six of the eight cottages.
    add('space', crit.wSpace > 0, Number(c.squareFeet) >= 400);
    add('pet', crit.wPet > 0, c.petAllowed);
    add('ground', crit.wFewerStairs > 0, DCCS.score.isGround(c));
    add('studio', crit.wStudio > 0, c.layoutType === 'Studio');
    add('onebed', crit.wOneBed > 0, c.layoutType !== 'Studio');
    add('dining', crit.wDining > 0, Number(c.diningSeats) >= 4);
    var hard = crit.hard || [];
    // The capacity reason already says "the extra two on a pull-out couch", so
    // when it is going to show, the standalone pull-out reason is redundant
    // (owner decision, 0.23.0): a guest asking for 3-4 guests AND a pull-out
    // couch reads the couch once, not twice.
    var partyOn = ((crit.wParty > 0) || hard.indexOf('party34') !== -1) && Number(c.guests) >= 3;
    add('pullout', crit.wPullout > 0, c.pulloutCouch && !partyOn);
    add('party', (crit.wParty > 0) || hard.indexOf('party34') !== -1, Number(c.guests) >= 3);
    add('porch', (crit.wScreenedPorch > 0) || hard.indexOf('porch') !== -1, c.screenedPorch);

    // Wanted reasons first (stable), then the rest; keep up to three.
    var wanted = ranked.filter(function (r) { return r.wanted; });
    var rest = ranked.filter(function (r) { return !r.wanted; });
    return wanted.concat(rest).slice(0, 3).map(function (r) { return r.key; });
  }

  DCCS.labels = {
    badges: badges,
    whyFits: whyFits
  };
})(window);
;

/* ---- assets/js/availability.js ---- */
/**
 * Availability lookup for the Dora Canal Cottage Selector.
 *
 * The ONLY runtime request this plugin makes, and only when a widget turns the
 * feature on AND the guest supplies dates. It asks the MPHB Availability
 * Calendar plugin's public read-only endpoint rather than querying MotoPress
 * again, so there is one implementation of "is this cottage booked".
 *
 * ENDPOINT CONTRACT (mphb-availability-calendar, includes/class-ajax.php):
 *   POST <ajaxUrl>            application/x-www-form-urlencoded
 *     action=mphbac_query
 *     room_type_ids[]=<int>   (repeated; omit for "all")
 *     from=YYYY-MM-DD         check-in
 *     to=YYYY-MM-DD           check-out
 *   No nonce, deliberately: the data is public and read-only, and embedding a
 *   nonce in cached HTML makes full-page caches serve expired ones.
 *   ->  { success: true, data: { rooms: [...],
 *         availability: { "<roomTypeId>": { "YYYY-MM-DD": "available|booked|past" } },
 *         from, to, bookedThrough } }
 *
 * A cottage counts as free only if EVERY night from check-in up to (not
 * including) check-out is "available" — a stay spans the nights between the
 * two dates, so the check-out day itself is never occupied by this guest.
 *
 * Everything here fails open: any error, timeout, missing plugin or changed
 * response shape resolves to "unknown", and the caller ranks as it did before
 * while showing a visible note. Availability must never blank the results.
 */
(function (window) {
  'use strict';

  var DCCS = window.DCCS = window.DCCS || {};

  var ST_AVAILABLE = 'available';
  var TIMEOUT_MS = 8000;

  /** Cache keyed by "from|to" so editing an answer never refetches. */
  var cache = {};

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** Local calendar date as YYYY-MM-DD (never UTC — a stay is a local-date range). */
  function ymd(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Parse YYYY-MM-DD into a local Date, or null. Rejects impossible dates. */
  function parseYmd(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) { return null; }
    var p = String(s).split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (d.getFullYear() !== Number(p[0]) || d.getMonth() !== Number(p[1]) - 1 || d.getDate() !== Number(p[2])) {
      return null;
    }
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** The nights a stay occupies: check-in up to but excluding check-out. */
  function nightsBetween(from, to) {
    var out = [];
    var a = parseYmd(from), b = parseYmd(to);
    if (!a || !b || b <= a) { return out; }
    for (var d = new Date(a); d < b; d.setDate(d.getDate() + 1)) { out.push(ymd(d)); }
    return out;
  }

  /** Valid range? (both parseable, check-out after check-in, within maxNights) */
  function validRange(from, to, maxNights) {
    var nights = nightsBetween(from, to);
    return nights.length > 0 && nights.length <= (maxNights || 95);
  }

  /**
   * Fold the endpoint's per-day map into one verdict per cottage id.
   * @returns {Object} cottageId -> 'free' | 'booked' | 'unknown'
   */
  function verdicts(cottages, payload, nights) {
    var byType = (payload && payload.availability) || {};
    var out = {};
    cottages.forEach(function (c) {
      var days = byType[String(c.roomTypeId)];
      if (!days || !nights.length) { out[c.id] = 'unknown'; return; }
      var free = nights.every(function (n) { return days[n] === ST_AVAILABLE; });
      // A night the endpoint didn't report is not evidence of availability.
      var complete = nights.every(function (n) { return typeof days[n] === 'string'; });
      out[c.id] = free ? 'free' : (complete ? 'booked' : 'unknown');
    });
    return out;
  }

  /**
   * Look up availability for a date range.
   * ALWAYS resolves — never rejects. { status, byId } where status is
   * 'ok' | 'skipped' | 'error' and byId maps cottage id -> verdict.
   */
  function lookup(config, from, to) {
    var av = (config && config.availability) || {};
    var cottages = (config && config.cottages) || [];
    var nights = nightsBetween(from, to);
    var none = { status: 'skipped', byId: {} };

    if (!av.enabled || !av.ajaxUrl || !nights.length) { return Promise.resolve(none); }
    if (!validRange(from, to, av.maxNights)) { return Promise.resolve(none); }

    var key = from + '|' + to;
    if (cache[key]) { return cache[key]; }

    var body = ['action=' + encodeURIComponent(av.action || 'mphbac_query'),
      'from=' + encodeURIComponent(from), 'to=' + encodeURIComponent(to)];
    cottages.forEach(function (c) {
      if (c.roomTypeId) { body.push('room_type_ids%5B%5D=' + encodeURIComponent(c.roomTypeId)); }
    });

    var ctrl = (typeof window.AbortController === 'function') ? new window.AbortController() : null;
    var timer = window.setTimeout(function () { if (ctrl) { ctrl.abort(); } }, TIMEOUT_MS);

    var p = window.fetch(av.ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.join('&'),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.json();
    }).then(function (json) {
      if (!json || json.success !== true || !json.data) { throw new Error('unexpected payload'); }
      return { status: 'ok', byId: verdicts(cottages, json.data, nights) };
    }).catch(function () {
      // Fail OPEN: a failed check must never hide cottages or blank the page.
      // Not cached, so a later attempt (e.g. after Edit answers) can succeed.
      delete cache[key];
      return { status: 'error', byId: {} };
    }).then(function (res) {
      window.clearTimeout(timer);
      return res;
    });

    cache[key] = p;
    return p;
  }

  DCCS.availability = {
    lookup: lookup,
    nightsBetween: nightsBetween,
    validRange: validRange,
    verdicts: verdicts,
    parseYmd: parseYmd,
    ymd: ymd,
    _cache: cache,
    _reset: function () { Object.keys(cache).forEach(function (k) { delete cache[k]; }); }
  };
})(window);
;

/* ---- assets/js/cast.js ---- */
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
      // Declined. WHY it was declined decides whether to set a timer at all.
      //
      // Until 0.33.0 this rescheduled unconditionally, and schedule() has a 200ms
      // floor — so a widget two screens down woke five times a second for the whole
      // life of the page and never cast. On the homepage, where the heading sits at
      // 1696px, that was the common case.
      //
      // Being off-screen or in a hidden tab is an EVENT-driven wait: the
      // IntersectionObserver and visibilitychange both call tick(), so there is
      // nothing to poll for. Only a wait on the clock — the cast is not due yet, or
      // the scroll has not settled — needs a timer.
      if (document.hidden || !visibleEnough()) { return; }
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
;

/* ---- assets/js/selector.js ---- */
/**
 * Dora Canal Cottage Selector — front-end controller.
 *
 * Boots every .dccs-root (full selector) and .dccs-entry (cross-sell mini-entry)
 * on the page. Manages state, deeplink parsing, the three modes (Quick finder
 * wizard / Weigh priorities / Compare), live results, and same-page overlays.
 * All copy comes from config.strings; this file holds no display strings.
 */
(function (window, document) {
  'use strict';

  var DCCS = window.DCCS = window.DCCS || {};
  var UID = 0;

  /* ---------- small utilities ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function fmt(tpl, val) { return String(tpl).replace('%d', val).replace('%s', val); }
  function fmt2(tpl, a, b) { return String(tpl).replace('%1$d', a).replace('%2$d', b); }
  function fmt3(tpl, a, b, c) { return String(tpl).replace('%1$d', a).replace('%2$d', b).replace('%3$d', c); }
  function fmtName(tpl, a, b) { return String(tpl).replace('%1$s', a).replace('%2$s', b); }

  /** "N cottage matches" (singular) / "N cottages match" (plural). */
  function matchCount(S, n) { return Number(n) === 1 ? fmt(S.match_count_one, n) : fmt(S.match_count, n); }

  /** Display name with its cottage number, e.g. "Cottage 32: Flamingo Bungalow". */
  function cname(config, c) {
    var f = config.strings && config.strings.name_format;
    return f ? fmtName(f, c.id, c.name) : c.name;
  }

  /** Optional admin-set leading icon for a fixed button. config.icons holds trusted
      HTML rendered server-side by Elementor's icon manager (admin-only input). */
  function ico(config, key) {
    var h = config && config.icons && config.icons[key];
    return h ? '<span class="dccs-ico">' + h + '</span>' : '';
  }

  /** The heading, as plain type. 0.29.0 retired the drawn marks: a 38px pictogram
      asked to say "cottage" and "wizard" and "canal" at once always resolved as a
      puzzle, so the character moved into the cast animation (cast.js) instead —
      motion reads at any size. The last word is wrapped so cast.js can bob it;
      inline-block is required because transforms do not apply to inline boxes, and
      on a single word it is layout-identical to the bare text (asserted). */
  function headingHtml(text) {
    var t = String(text == null ? '' : text);
    var i = t.replace(/\s+$/, '').lastIndexOf(' ');
    if (i === -1) {
      return '<span class="dccs-heading-w">' + esc(t) + '</span>';
    }
    return esc(t.slice(0, i + 1)) + '<span class="dccs-heading-w">' + esc(t.slice(i + 1)) + '</span>';
  }

  /** Wrap an admin-set icon in a side-aware span ('left' | 'right'). */
  function icoSpan(html, side) {
    return '<span class="dccs-ico dccs-ico-' + (side === 'right' ? 'right' : 'left') + '">' + html + '</span>';
  }

  /** Place an optional icon before (left) or after (right) some inner HTML. The
      side is read from config.iconSides[sideKey] (set in the Elementor editor). */
  function withIcon(config, iconKey, sideKey, innerHtml) {
    var h = config && config.icons && config.icons[iconKey];
    if (!h) { return innerHtml; }
    var side = (config.iconSides && config.iconSides[sideKey]) || 'left';
    return side === 'right' ? innerHtml + icoSpan(h, 'right') : icoSpan(h, 'left') + innerHtml;
  }

  /** A Next/Back directional affordance: the chosen icon if set, otherwise the
      default arrow glyph — rendered on the button's fixed side so the icon simply
      replaces the arrow in place. */
  function navAffix(config, key, glyph, side) {
    var h = config && config.icons && config.icons[key];
    return h ? icoSpan(h, side) : '<span class="dccs-ico dccs-ico-' + side + '" aria-hidden="true">' + esc(glyph) + '</span>';
  }

  /** Allow only http(s), root-relative, or fragment URLs in hrefs. */
  function safeUrl(u) {
    u = String(u == null ? '' : u);
    return /^(https?:\/\/|\/|#|\.\/|\.\.\/)/i.test(u) ? u : '#';
  }

  /** A stable selector for the focused control, used to restore focus on re-render. */
  function focusKey(a) {
    if (!a || !a.classList) { return null; }
    if (a.classList.contains('dccs-modetab')) { return '.dccs-modetab[data-mode="' + a.dataset.mode + '"]'; }
    if (a.classList.contains('dccs-chip')) { return '.dccs-chip[data-group="' + a.dataset.group + '"][data-value="' + a.dataset.value + '"]'; }
    if (a.classList.contains('dccs-next')) { return '.dccs-next'; }
    if (a.classList.contains('dccs-reset')) { return '.dccs-reset'; }
    // Compare checkboxes re-render on every toggle; without a key, keyboard focus
    // drops to <body> after each tick. (Buttons whose handlers call focusStep()
    // don't need keys — they move focus deliberately.)
    if (a.matches && a.matches('input[data-cmp]')) { return 'input[data-cmp="' + a.dataset.cmp + '"]'; }
    if (a.classList.contains('dccs-date-in')) { return '.dccs-date-in'; }
    if (a.classList.contains('dccs-date-out')) { return '.dccs-date-out'; }
    return null;
  }

  function findCottage(config, id) {
    var list = config.cottages || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) { return list[i]; }
    }
    return null;
  }

  /* ---------- state ---------- */

  function defaultState(config) {
    // Quick answers start UNSET ('') so no option is pre-highlighted; a step is
    // "answered" once the guest taps something ('either' = an explicit skip).
    var quick = { party: '', desk: '', pullout: '', layout: '', dining: '', pet: '', ground: '', screenedporch: '' };
    var n = (config.cottages || []).length;
    // Dates are their own thing, not a quick answer: they don't filter, they
    // annotate and re-rank. '' = not asked yet, 'skip' = "not sure yet".
    return {
      mode: config.startMode || 'quick',
      quick: quick,
      // Tie-break rotation for equal scores (see score.js run()). Derived from the
      // calendar day so a visit is stable across re-renders and every cottage
      // leads in turn over an n-day cycle instead of the lowest ID always winning.
      // Tie-break rotation. A SHARED link seeds it from the encoded answers so both
      // people see the same order on any day/device; otherwise it follows the
      // calendar day so every cottage leads in turn (0.23.0).
      rotation: n ? (config.rotationSeed != null
        ? ((config.rotationSeed % n) + n) % n
        : Math.floor(Date.now() / 864e5) % n) : 0,
      // Priority weights also start UNSET (0) so the Weigh-priorities wizard has
      // nothing pre-selected; 0 simply means "no weight" in the scoring engine.
      weights: { party: 0, workspace: 0, moreroom: 0, fewerstairs: 0, pet: 0, studio: 0, onebed: 0, dining: 0, pullout: 0, screenedporch: 0 },
      compareIds: [],
      dates: { from: '', to: '', mode: '' },
      // Filled asynchronously by the availability lookup; '' until it answers.
      avail: { status: '', byId: {} },
      highlight: config.highlight || '',
      // Navigation: question index + stage ('landing' | 'q' | 'review' | 'results').
      // Fresh loads open on the landing screen; a mode choice moves past it.
      step: 0,
      stage: 'landing',
      editReturn: null
    };
  }

  var LVL = { low: 1, medium: 2, high: 3, '1': 1, '2': 2, '3': 3 };

  /* ---------- compare picks, remembered for the visit (0.33.0) ----------
     A guest who ticks three cottages, opens one to read about it and comes back
     used to find the ticks gone. The picks — and ONLY the picks — survive a page
     change, in sessionStorage, so they last the visit and not a day longer.
     Answers are still never persisted: every page load starts the quiz fresh.

     Keyed per widget instance, because the homepage and /cottages/ each carry one
     and they are different lists. Elementor stamps the wrapper with data-id, which
     is stable for the life of that widget on that page; the index fallback covers
     the shortcode pop-up and any markup Elementor did not place. */
  function cmpKey(root) {
    var scope = root.closest ? root.closest('[data-id]') : null;
    var id = scope && scope.dataset ? scope.dataset.id : '';
    if (!id) {
      var all = document.querySelectorAll('.dccs-root');
      id = 'i' + Math.max(0, Array.prototype.indexOf.call(all, root));
    }
    // The pop-up mirrors a page widget but is a separate list; never share a key.
    return 'dccs:cmp:' + id + (root.classList.contains('dccs-in-modal') ? ':modal' : '');
  }

  function cmpLoad(root) {
    try {
      var raw = window.sessionStorage.getItem(cmpKey(root));
      if (!raw) { return null; }
      var ids = JSON.parse(raw);
      return Array.isArray(ids) ? ids.map(String).filter(Boolean) : null;
    } catch (e) { return null; }   // private mode, disabled storage, bad JSON
  }

  function cmpSave(root, ids) {
    try {
      if (ids && ids.length) {
        window.sessionStorage.setItem(cmpKey(root), JSON.stringify(ids.map(String)));
      } else {
        window.sessionStorage.removeItem(cmpKey(root));
      }
    } catch (e) { /* storage unavailable: the picks simply do not persist */ }
  }

  /** Initialize state: defaults < remembered picks < deeplink (URL). Answers are
      never persisted — every page load starts fresh; only genuine inbound deep
      links pre-fill. */
  function buildState(config, root) {
    var state = defaultState(config);

    // Remembered picks load BEFORE the deep link, so an explicit ?compare= in the
    // URL still wins: a link someone was sent is a stronger signal than what this
    // browser happened to tick earlier.
    if (root) {
      var remembered = cmpLoad(root);
      if (remembered) { state.compareIds = remembered; }
    }
    applyDeeplink(state, config);
    if (config.enabledModes && config.enabledModes.indexOf(state.mode) === -1) {
      state.mode = config.enabledModes[0];
    }

    // If the guest arrived with criteria (an inbound deep link or a mini-entry
    // pre-fill), skip the landing + questionnaire and jump straight to results.
    // An explicit ?mode=/?compare= deep link skips the landing into that mode.
    var hasCriteria = !!state.highlight || state.dates.mode !== '' ||
      Object.keys(state.quick).some(function (k) { return state.quick[k] !== ''; });
    var p = new URLSearchParams(window.location.search);
    // The mini-entry modal opens on the landing screen (matching the main Selector's
    // first section); the highlight still applies once the guest reaches results.
    if (config.openStage === 'landing') { state.stage = 'landing'; }
    else if (hasCriteria) { state.stage = 'results'; }
    else if (p.has('mode') || p.has('compare')) { state.stage = 'q'; }
    state.step = 0;
    state.editReturn = null;
    return state;
  }

  var TRUE = { 'true': 1, '1': 1, 'yes': 1, 'on': 1 };

  function applyDeeplink(state, config) {
    var p = new URLSearchParams(window.location.search);
    if (!p.toString() && !config.highlight) { return; }

    if (p.get('mode')) { state.mode = p.get('mode'); }
    if (p.has('pet')) { state.quick.pet = TRUE[p.get('pet')] ? 'yes' : 'either'; }
    if (p.has('ground')) { state.quick.ground = TRUE[p.get('ground')] ? 'yes' : 'either'; }
    if (p.has('porch')) { state.quick.screenedporch = TRUE[p.get('porch')] ? 'yes' : 'either'; }
    if (p.has('desk')) { state.quick.desk = normYesNoLevel(p.get('desk')); }
    if (p.has('pullout')) { state.quick.pullout = normYesNoLevel(p.get('pullout')); }
    if (p.has('layout')) { state.quick.layout = p.get('layout'); }
    if (p.has('dining')) { state.quick.dining = p.get('dining') === '4' ? 4 : (p.get('dining') === '2' ? 2 : 'either'); }
    if (p.has('party')) {
      var pv = String(p.get('party'));
      state.quick.party = /^(1|2|1-2|12)$/.test(pv) ? '2' : (/^3|^4/.test(pv) ? '34' : 'either');
    }
    if (p.has('compare')) { state.compareIds = p.get('compare').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
    // Dates: ?in=YYYY-MM-DD&out=YYYY-MM-DD, or ?dates=skip for an explicit skip.
    if (p.get('dates') === 'skip') { state.dates = { from: '', to: '', mode: 'skip' }; }
    if (p.has('in') && p.has('out')) {
      var din = String(p.get('in')), dout = String(p.get('out'));
      if (DCCS.availability && DCCS.availability.validRange(din, dout, 95)) {
        state.dates = { from: din, to: dout, mode: 'set' };
      }
    }
    // A shared link pins the tie-break so both devices agree (see defaultState).
    if (p.has('seed')) {
      var seed = parseInt(p.get('seed'), 10);
      var cn = (config.cottages || []).length;
      if (!isNaN(seed) && cn) { state.rotation = ((seed % cn) + cn) % cn; }
    }

    Object.keys(state.weights).forEach(function (k) {
      var v = p.get('w_' + k);
      if (v && LVL[v]) { state.weights[k] = LVL[v]; }
    });

    if (p.get('highlight')) { state.highlight = p.get('highlight'); }
    if (config.highlight) { state.highlight = config.highlight; }
  }

  function normYesNoLevel(v) {
    if (LVL[v]) { return 'yes'; }       // a weight word implies "yes" in quick mode
    return TRUE[v] ? 'yes' : 'either';
  }

  /* ---------- criteria translation ---------- */

  // Weigh-priorities: a "High" (3) answer maps its priority to a hard-required feature.
  var WEIGHT_HARD = {
    party: 'party34', workspace: 'desk', moreroom: 'moreroom', fewerstairs: 'ground', pet: 'pet',
    studio: 'studio', onebed: 'onebed', dining: 'dining4', pullout: 'pullout', screenedporch: 'porch'
  };

  function criteriaFromState(state) {
    if (state.mode === 'weights') {
      var w = state.weights;
      // High priorities become must-haves (they narrow the count + results);
      // Medium/Low stay soft ranking weights.
      var whard = [];
      Object.keys(WEIGHT_HARD).forEach(function (g) {
        if (Number(w[g]) === 3) { whard.push(WEIGHT_HARD[g]); }
      });
      return {
        hard: whard, rotation: state.rotation,
        wDesk: w.workspace, wSpace: w.moreroom, wFewerStairs: w.fewerstairs, wPet: w.pet,
        wStudio: w.studio, wOneBed: w.onebed, wDining: w.dining, wPullout: w.pullout,
        wScreenedPorch: w.screenedporch, wParty: w.party
      };
    }
    // Quick finder: every SPECIFIC want narrows the count + results. Each positive /
    // specific answer becomes a hard filter; 'No', 'No preference' ('either') and unset
    // ('') impose no constraint. The wX weights still rank the survivors.
    var q = state.quick;
    var hard = [];
    if (String(q.party) === '34') { hard.push('party34'); }
    if (q.desk === 'yes') { hard.push('desk'); }
    if (q.pullout === 'yes') { hard.push('pullout'); }
    if (q.layout === 'studio') { hard.push('studio'); }
    if (q.layout === 'onebed') { hard.push('onebed'); }
    if (q.dining === 4 || q.dining === '4') { hard.push('dining4'); }
    // "Table for two" is NOT a constraint: a 4-seat table serves two guests fine, and
    // excluding the only 4-top cottage (#22, the largest) misdirected couples who just
    // meant "we don't need four". Answering "two" now behaves like "No preference".
    if (q.pet === 'yes') { hard.push('pet'); }
    if (q.ground === 'yes') { hard.push('ground'); }
    if (q.screenedporch === 'yes') { hard.push('porch'); }
    return {
      hard: hard, rotation: state.rotation,
      wDesk: q.desk === 'yes' ? 2 : 0,
      wPullout: q.pullout === 'yes' ? 2 : 0,
      wStudio: q.layout === 'studio' ? 2 : 0,
      wOneBed: q.layout === 'onebed' ? 2 : 0,
      wSpace: 0, wDining: 0, wPet: 0, wFewerStairs: 0, wScreenedPorch: 0,
      wParty: String(q.party) === '34' ? 2 : 0
    };
  }

  /* ---------- rendering ---------- */

  function chip(text, value, group, active, tabbable, iconHtml, iconSide) {
    if (tabbable === undefined) { tabbable = active; }
    var inner = esc(text);
    if (iconHtml) {
      inner = iconSide === 'right' ? inner + icoSpan(iconHtml, 'right') : icoSpan(iconHtml, 'left') + inner;
    }
    return '<button type="button" class="dccs-chip' + (active ? ' is-active' : '') +
      '" role="radio" aria-checked="' + (active ? 'true' : 'false') +
      '" tabindex="' + (tabbable ? '0' : '-1') +
      '" data-group="' + esc(group) + '" data-value="' + esc(value) + '">' + inner + '</button>';
  }

  // The wizard's 8 questions (party size + the meaningful differences), in
  // natural order. Each option is [stringKey, value]; the last is always
  // "No preference".
  var YND = [['opt_yes', 'yes'], ['opt_no', 'no'], ['opt_either', 'either']];
  var WIZARD_QUESTIONS = [
    // kind:'dates' renders two date inputs instead of chips (see renderDatesStep).
    // Only present when the widget enables availability.
    { group: 'dates', kind: 'dates', qKey: 'q_dates', shortKey: 'dates_short', opts: [] },
    { group: 'party', qKey: 'q_party', shortKey: 'party_short', opts: [['opt_party2', '2'], ['opt_party34', '34'], ['opt_either', 'either']] },
    { group: 'desk', qKey: 'q_desk', shortKey: 'diff_desk', opts: YND },
    { group: 'pullout', qKey: 'q_pullout', shortKey: 'diff_pulloutCouch', opts: YND },
    { group: 'layout', qKey: 'q_layout', shortKey: 'diff_layoutType', opts: [['opt_studio', 'studio'], ['opt_onebed', 'onebed'], ['opt_either', 'either']] },
    { group: 'dining', qKey: 'q_dining', shortKey: 'diff_diningSeats', opts: [['opt_seats2', '2'], ['opt_seats4', '4'], ['opt_either', 'either']] },
    { group: 'pet', qKey: 'q_pet', shortKey: 'diff_petAllowed', opts: YND },
    { group: 'ground', qKey: 'q_ground', shortKey: 'diff_floorLevel', opts: YND },
    { group: 'screenedporch', qKey: 'q_screenedporch', shortKey: 'diff_screenedPorch', opts: YND }
  ];

  // The Weigh-priorities wizard: one priority per step, answered Low/Med/High.
  var WLEVELS = [['lvl_low', 1], ['lvl_med', 2], ['lvl_high', 3]];
  var WEIGHT_QUESTIONS = [
    { group: 'party', shortKey: 'w_party', opts: WLEVELS },
    { group: 'workspace', shortKey: 'w_workspace', opts: WLEVELS },
    { group: 'moreroom', shortKey: 'w_moreroom', opts: WLEVELS },
    { group: 'fewerstairs', shortKey: 'w_fewerstairs', opts: WLEVELS },
    { group: 'pet', shortKey: 'w_pet', opts: WLEVELS },
    { group: 'studio', shortKey: 'w_studio', opts: WLEVELS },
    { group: 'onebed', shortKey: 'w_onebed', opts: WLEVELS },
    { group: 'dining', shortKey: 'w_dining', opts: WLEVELS },
    { group: 'pullout', shortKey: 'w_pullout', opts: WLEVELS },
    { group: 'screenedporch', shortKey: 'w_screenedporch', opts: WLEVELS }
  ];

  function answerLabel(q, value, S) {
    for (var i = 0; i < q.opts.length; i++) {
      if (String(q.opts[i][1]) === String(value)) { return S[q.opts[i][0]]; }
    }
    return S.opt_either;
  }
  function wLevelLabel(v, S) { return Number(v) === 3 ? S.lvl_high : Number(v) === 2 ? S.lvl_med : Number(v) === 1 ? S.lvl_low : ''; }

  /** Quick finder and Weigh priorities share one wizard renderer via this track. */
  function wizardTrack(state, S) {
    if (state.mode === 'weights') {
      return {
        questions: WEIGHT_QUESTIONS,
        get: function (q) { return state.weights[q.group]; },
        set: function (q, v) { state.weights[q.group] = Number(v); },
        isAnswered: function (q) { return Number(state.weights[q.group]) > 0; },
        qLabel: function (q) { return fmt(S.w_question, S[q.shortKey]); },
        shortLabel: function (q) { return S[q.shortKey]; },
        valueLabel: function (q, v) { return wLevelLabel(v, S); }
      };
    }
    return {
      // The dates step only exists when the widget turns availability on.
      questions: WIZARD_QUESTIONS.filter(function (q) {
        return q.kind !== 'dates' || availOn(state.config);
      }),
      get: function (q) { return q.kind === 'dates' ? state.dates : state.quick[q.group]; },
      set: function (q, v) { state.quick[q.group] = coerce(v); },
      isAnswered: function (q) {
        if (q.kind === 'dates') { return state.dates.mode !== ''; }
        var x = state.quick[q.group]; return x !== '' && x != null;
      },
      qLabel: function (q) { return S[q.qKey]; },
      shortLabel: function (q) { return S[q.shortKey]; },
      valueLabel: function (q, v) {
        if (q.kind === 'dates') {
          return state.dates.mode === 'set' ? state.dates.from + ' \u2192 ' + state.dates.to : S.dates_none;
        }
        return answerLabel(q, v, S);
      }
    };
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /** Is the availability feature switched on for this widget? */
  function availOn(config) {
    return !!(config && config.availability && config.availability.enabled &&
      config.availability.ajaxUrl && window.DCCS && DCCS.availability);
  }

  /** Two date inputs + a "not sure yet" skip, in place of the usual answer chips. */
  function renderDatesStep(config, state) {
    var S = config.strings;
    var d = state.dates;
    var today = DCCS.availability.ymd(new Date());
    var skipOn = d.mode === 'skip';
    var bad = d.mode === 'set' && !DCCS.availability.validRange(d.from, d.to, config.availability.maxNights);
    return '<div class="dccs-dates">' +
      '<div class="dccs-date-row">' +
        '<label class="dccs-date-field"><span>' + esc(S.dates_in) + '</span>' +
        '<input type="date" class="dccs-date-in" min="' + esc(today) + '" value="' + esc(d.from) + '"></label>' +
        '<label class="dccs-date-field"><span>' + esc(S.dates_out) + '</span>' +
        '<input type="date" class="dccs-date-out" min="' + esc(d.from || today) + '" value="' + esc(d.to) + '"></label>' +
      '</div>' +
      (bad ? '<p class="dccs-date-error" role="alert">' + esc(S.dates_invalid) + '</p>' : '') +
      '<button type="button" class="dccs-chip dccs-date-skip' + (skipOn ? ' is-active' : '') +
        '" role="radio" aria-checked="' + (skipOn ? 'true' : 'false') + '" tabindex="0">' + esc(S.dates_skip) + '</button>' +
      '<p class="dccs-q-note">' + esc(S.dates_hint) + '</p>' +
      '</div>';
  }

  /** Small muted note under specific wizard questions: the capacity sentence on
      the party-size step, the pet policy on the pet step. Each may carry an
      optional owner-set link (default empty -> no link). No fee amounts here —
      those live in exactly one place, elsewhere on the site. */
  function questionNote(config, group) {
    var S = config.strings;
    var text = '', url = '';
    if (group === 'party') { text = S.capacity_note || ''; url = config.capacityFeeUrl || ''; }
    if (group === 'pet') { text = S.pet_note || ''; url = config.petFeeUrl || ''; }
    if (!text) { return ''; }
    var link = url ? ' <a class="dccs-q-note-link" href="' + esc(safeUrl(url)) + '">' + esc(S.fee_link) + '</a>' : '';
    return '<p class="dccs-q-note">' + esc(text) + link + '</p>';
  }

  /** Dispatch the wizard by stage: questionnaire → review → results. */
  function renderWizard(config, state, ctx) {
    if (state.stage === 'review') { return renderReview(config, state); }
    if (state.stage === 'results') { return renderResults(config, state, ctx); }
    return renderWizardStep(config, state, ctx);
  }

  function renderWizardStep(config, state, ctx) {
    var S = config.strings;
    var tr = wizardTrack(state, S);
    var qs = tr.questions;
    var i = clamp(state.step | 0, 0, qs.length - 1);
    var q = qs[i];
    var value = tr.get(q);

    var res = ctx && ctx.res ? ctx.res : DCCS.score.run(config.cottages, criteriaFromState(state));
    var n = res.empty ? 0 : res.results.length;

    // When nothing is selected yet, keep the first option keyboard-tabbable so the
    // radiogroup is reachable (ARIA roving-focus pattern needs one tabbable entry).
    var isDates = q.kind === 'dates';
    var anyActive = q.opts.some(function (o) { return String(value) === String(o[1]); });
    var ansSide = (config.iconSides && config.iconSides.answers) || 'left';
    var chips = q.opts.map(function (o, idx) {
      var active = String(value) === String(o[1]);
      // Optional admin-set answer icon, keyed per option value (weights use lvl_*).
      var iconKey = (state.mode === 'weights' ? 'lvl_' : 'ans_') + o[1];
      var iconHtml = (config.icons && config.icons[iconKey]) || '';
      return chip(S[o[0]], o[1], q.group, active, active || (!anyActive && idx === 0), iconHtml, ansSide);
    }).join('');

    // Clickable stepper: answered steps (and the current one) are navigable.
    var dots = qs.map(function (qq, j) {
      var done = tr.isAnswered(qq);
      var cls = 'dccs-step-dot' + (j === i ? ' is-current' : '') + (done ? ' is-done' : '');
      if (done && j !== i) {
        return '<button type="button" class="' + cls + ' dccs-edit" data-step="' + j + '" aria-label="' + esc(fmt2(S.wiz_progress, j + 1, qs.length)) + '"></button>';
      }
      return '<span class="' + cls + '"' + (j === i ? ' aria-current="step"' : ' aria-hidden="true"') + '></span>';
    }).join('');

    var canNext = tr.isAnswered(q);
    var nextAttrs = canNext ? '' : ' disabled title="' + esc(S.next_hint || '') +
      '" aria-label="' + esc((S.wiz_next || '') + ' \u2014 ' + (S.next_hint || '')) + '"';
    var qLabel = tr.qLabel(q);
    // Optional admin-set icon for the question (weights share one w_question icon).
    var qIconKey = state.mode === 'weights' ? 'w_question' : q.qKey;

    var html = '<div class="dccs-wizard" data-stage="q">';
    html += '<div class="dccs-progress-row">';
    html += '<span class="dccs-progress-label">' + esc(fmt2(S.wiz_progress, i + 1, qs.length)) + '</span>';
    html += '<span class="dccs-count">' + esc(matchCount(S, n)) + '</span></div>';
    // When the answers so far rule everything out, reassure that the closest options
    // still surface at the end (the results page falls back to near-matches).
    if (n === 0 && S.count_zero_hint) {
      html += '<p class="dccs-count-note">' + esc(S.count_zero_hint) + '</p>';
    }
    html += '<div class="dccs-stepper" role="presentation">' + dots + '</div>';
    html += '<h3 class="dccs-step-q" tabindex="-1">' + withIcon(config, qIconKey, 'questions', esc(qLabel)) + '</h3>';
    html += isDates
      ? renderDatesStep(config, state)
      : '<div class="dccs-chips dccs-chips-wizard" role="radiogroup" aria-label="' + esc(qLabel) + '">' + chips + '</div>';
    if (!isDates) { html += questionNote(config, q.group); }
    html += '<div class="dccs-wizard-nav">';
    // Back/Next: a chosen icon replaces the default arrow (Back = left, Next = right).
    html += i > 0
      ? '<button type="button" class="dccs-back dccs-primary">' + navAffix(config, 'back', '\u2190', 'left') + esc(S.wiz_back) + '</button>'
      : '<span class="dccs-nav-spacer"></span>';
    html += '<button type="button" class="dccs-next dccs-primary"' + nextAttrs + '>' + esc(S.wiz_next) + navAffix(config, 'next', '\u2192', 'right') + '</button>';
    html += '</div></div>';
    return html;
  }

  function renderReview(config, state) {
    var S = config.strings;
    var tr = wizardTrack(state, S);
    var html = '<div class="dccs-review"><h3 class="dccs-step-q" tabindex="-1">' + esc(S.review_heading) + '</h3><ul class="dccs-review-list">';
    tr.questions.forEach(function (q, i) {
      html += '<li><span class="dccs-review-q">' + esc(tr.shortLabel(q)) + '</span>' +
        '<span class="dccs-review-a">' + esc(tr.valueLabel(q, tr.get(q))) + '</span>' +
        '<button type="button" class="dccs-edit" data-step="' + i + '">' + esc(S.edit) + '</button></li>';
    });
    html += '</ul><div class="dccs-wizard-nav dccs-tail-nav">' +
      '<button type="button" class="dccs-reset">' + ico(config, 'restart') + esc(S.reset) + '</button>' +
      '<button type="button" class="dccs-see-matches">' + ico(config, 'submit') + esc(S.see_matches) + '</button></div></div>';
    return html;
  }

  /** Hard-requirement tags a fallback cottage fails to meet. */
  function missTags(c, crit, S) {
    var t = [];
    (crit.hard || []).forEach(function (key) {
      var f = DCCS.score.FEATURES[key];
      if (f && !f.test(c)) { t.push(S[f.tag]); }
    });
    return t;
  }

  function diffValue(c, field, S) {
    switch (field) {
      case 'guests': return String(c.guests);
      case 'bed': return c.bed === 'Queen' ? S.val_queen : c.bed;
      case 'squareFeet': return fmt(S.val_sqft, c.squareFeet);
      case 'diningSeats': return fmt(S.val_seats, c.diningSeats);
      case 'desk': return c.desk ? S.val_yes : S.val_no;
      case 'pulloutCouch': return c.pulloutCouch ? S.val_yes : S.val_no;
      case 'screenedPorch': return c.screenedPorch ? S.val_yes : S.val_no;
      case 'petAllowed': return c.petAllowed ? S.val_yes : S.val_no;
      case 'floorLevel': return DCCS.score.isGround(c) ? S.floor_ground : S.floor_second;
      case 'layoutType': return c.layoutType === 'Studio' ? S.opt_studio : S.opt_onebed;
      default: return c[field];
    }
  }

  /** Compare-table column header: stack "Cottage NN:" above the name (smaller, narrower
      columns) by splitting the formatted title at the first colon. Falls back to one line
      when a translated name_format carries no colon. */
  function cmpHeader(title, id) {
    title = String(title == null ? '' : title);
    // Below ~360px the CSS swaps the two-line title for this "#22" form so the
    // column stays narrow enough for two cottages side by side.
    var shortForm = '<span class="dccs-cmp-th-short" aria-hidden="true">#' + esc(id) + '</span>';
    var ci = title.indexOf(':');
    if (ci === -1) { return '<span class="dccs-cmp-th-name">' + esc(title) + '</span>' + shortForm; }
    return '<span class="dccs-cmp-th-num">' + esc(title.slice(0, ci + 1)) + '</span>' +
      '<span class="dccs-cmp-th-name">' + esc(title.slice(ci + 1).trim()) + '</span>' + shortForm;
  }

  var CMP_WIN = 2; // cottage columns shown at once in the comparison table

  /** The comparison table: a pinned attribute column + a window of up to CMP_WIN
      cottage columns, paged with ‹ › arrows. `start` is the window offset. */
  function compareMatrixHtml(config, st, start) {
    var S = config.strings;
    var all = st.compareIds.map(function (id) { return findCottage(config, id); }).filter(Boolean);
    if (all.length < 2) { return ''; }
    var total = all.length;
    start = clamp(start | 0, 0, Math.max(0, total - CMP_WIN));
    var sel = all.slice(start, start + CMP_WIN);

    var html = '<div class="dccs-matrix-block">';
    if (total > CMP_WIN) {
      html += '<div class="dccs-matrix-nav">' +
        '<button type="button" class="dccs-cmp-prev"' + (start > 0 ? '' : ' disabled') + ' aria-label="' + esc(S.cmp_prev || 'Previous') + '">\u2039</button>' +
        '<span class="dccs-matrix-pos">' + esc(fmt3(S.cmp_range, start + 1, Math.min(start + CMP_WIN, total), total)) + '</span>' +
        '<button type="button" class="dccs-cmp-next"' + (start + CMP_WIN < total ? '' : ' disabled') + ' aria-label="' + esc(S.cmp_next || 'Next') + '">\u203A</button>' +
        '</div>';
    }
    html += '<div class="dccs-matrix-wrap"><table class="dccs-matrix"><thead><tr><th class="dccs-corner"></th>';
    // aria-label keeps the full name for assistive tech whichever form is visible.
    sel.forEach(function (c) { html += '<th scope="col" aria-label="' + esc(cname(config, c)) + '">' + cmpHeader(cname(config, c), c.id) + '</th>'; });
    html += '</tr></thead><tbody>';
    (config.diffFields || []).forEach(function (field) {
      // Highlight "differs" by comparing across ALL selected, not just the window.
      var allVals = all.map(function (c) { return String(diffValue(c, field, S)); });
      var allSame = allVals.every(function (v) { return v === allVals[0]; });
      html += '<tr><th scope="row">' + esc(S['diff_' + field] || field) + '</th>';
      sel.forEach(function (c) {
        html += '<td class="' + (allSame ? '' : 'is-diff') + '">' + esc(diffValue(c, field, S)) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  /** Compare mode: an always-visible checklist of cottages + a button that opens the
      comparison table in the same popup used from the wizard results. The checklist is
      shown open (no tap-to-expand dropdown) so the "Compare" button below it is never
      hidden — friendlier for guests who aren't comfortable with fiddly menus. */
  function renderCompare(config, st) {
    var S = config.strings;
    var n = st.compareIds.length;
    var list = config.cottages.map(function (c) {
      var on = st.compareIds.indexOf(String(c.id)) !== -1;
      return '<label class="dccs-cmp-option">' +
        '<input type="checkbox" data-cmp="' + esc(c.id) + '"' + (on ? ' checked' : '') + '> ' +
        esc(cname(config, c)) + '</label>';
    }).join('');

    // Always-present "Compare" button (disabled until 2+ are ticked). It reuses the
    // .dccs-open-compare class so the existing click handler opens the shared popup.
    var canCompare = n >= 2;
    var btnLabel = canCompare ? fmt(S.compare_btn, n) : S.mode_compare;
    // The "pick 2" tip is opt-in (it duplicates the subheader above the list).
    // Strict === true so a missing key — old placed instances, mirrored snapshots
    // published before the switch existed — reads as off.
    var note = (canCompare || config.showCompareTip !== true)
      ? '' : '<p class="dccs-compare-note">' + esc(S.compare_need_two) + '</p>';
    var btn = '<div class="dccs-compare-actions">' +
      '<button type="button" class="dccs-open-compare"' + (canCompare ? '' : ' disabled') + '>' +
      esc(btnLabel) + '</button>' + note + '</div>';

    // A plain-language cue that the list holds every cottage and scrolls — reassuring
    // for guests who might not notice the scrollbar. %d = total cottages. Rendered
    // INSIDE the subheader paragraph (owner request: one paragraph, not two); the
    // span keeps the .dccs-cmp-count hook and the string stays separately editable.
    var count = ' <span class="dccs-cmp-count">' + esc(fmt(S.compare_scroll_all, config.cottages.length)) + '</span>';
    // The list scrolls internally; an always-visible custom scrollbar (.dccs-cmp-bar,
    // positioned by wireCmpScrollbar) sits on its right edge so guests can see there's
    // more to scroll — reliable even on iOS, where native scrollbars auto-hide.
    var scroller = '<div class="dccs-cmp-scroller">' +
      '<div class="dccs-cmp-list dccs-cmp-static" role="group" aria-label="' + esc(S.compare_prompt) + '">' + list + '</div>' +
      '<div class="dccs-cmp-bar" aria-hidden="true"><div class="dccs-cmp-bar-thumb"></div></div></div>';
    return '<div class="dccs-compare"><p class="dccs-hint">' + esc(S.compare_prompt) + count + '</p>' +
      scroller + btn + '</div>';
  }

  /** The "Compare N cottages" button, shown once 2+ cards are ticked. */
  function compareButton(config, st) {
    var n = st.compareIds.length;
    if (n < 2) { return ''; }
    return '<button type="button" class="dccs-open-compare">' + esc(fmt(config.strings.compare_btn, n)) + '</button>';
  }

  function renderResults(config, st, ctx) {
    var S = config.strings;
    var crit = ctx && ctx.crit ? ctx.crit : criteriaFromState(st);
    var res = ctx && ctx.res ? ctx.res : DCCS.score.run(config.cottages, crit);
    var html = '<div class="dccs-results">';

    if (res.empty) {
      // Drop the least-essential must-haves (one at a time, in order) until the
      // closest options surface. Style preferences relax before policy ones.
      var relaxOrder = ['moreroom', 'desk', 'pullout', 'studio', 'onebed', 'porch', 'dining4', 'ground', 'pet'];
      var relaxed = (crit.hard || []).slice();
      var fallback = null;
      for (var i = 0; i < relaxOrder.length && relaxed.length; i++) {
        var idx = relaxed.indexOf(relaxOrder[i]);
        if (idx === -1) { continue; }
        relaxed.splice(idx, 1);
        var c2 = {};
        Object.keys(crit).forEach(function (k) { c2[k] = crit[k]; });
        c2.hard = relaxed;
        var r2 = DCCS.score.run(config.cottages, c2);
        if (!r2.empty) { fallback = r2; break; }
      }
      var fb = fallback ? DCCS.score.dedupe(fallback.results.slice(0, 3), config.diffFields) : [];
      html += '<div class="dccs-empty"><h3 class="dccs-step-q" tabindex="-1">' + esc(S.empty_heading) + '</h3>' +
        '<p>' + esc(fb.length === 1 ? S.empty_sub_one : S.empty_sub) + '</p></div>';
      fb.forEach(function (c) { html += buildCard(c, config, st, crit, '', missTags(c, crit, S), fb.length >= 2); });
      html += wizardResultsTail(config, st, true);
      html += '</div>';
      return html;
    }

    var ranked = res.results;
    var top;
    if (st.avail.status === 'ok') {
      // Availability re-orders but NEVER removes. Free matches fill the top three;
      // then any cottage that WOULD have made the top three on merit but is booked
      // is appended, clearly marked, so a guest can still see the one they'd have
      // loved and change dates for it. Sinking it out of view would be exactly the
      // silent dead end this feature exists to prevent.
      var byId = st.avail.byId;
      var isBooked = function (c) { return byId[c.id] === 'booked'; };
      var free = ranked.filter(function (c) { return !isBooked(c); }).slice(0, 3);
      var missed = ranked.slice(0, 3).filter(function (c) {
        return isBooked(c) && free.indexOf(c) === -1;
      });
      top = DCCS.score.dedupe(free.concat(missed), config.diffFields);
    } else {
      top = DCCS.score.dedupe(ranked.slice(0, 3), config.diffFields);
    }
    html += '<div class="dccs-results-head"><h3 class="dccs-results-h" tabindex="-1">' + esc(S.results_heading) + '</h3></div>';
    html += availNote(config, st, top);

    // The extra highlighted card (mini-entry / deep link) counts toward the
    // page's card total, so resolve it BEFORE building any card: the compare
    // checkbox only renders when 2+ cards share the page (one card alone has
    // nothing to be compared with).
    var extra = null;
    if (st.highlight && !top.some(function (c) { return String(c.id) === String(st.highlight); })) {
      var hc = findCottage(config, st.highlight);
      var hIdx = ranked.map(function (c) { return String(c.id); }).indexOf(String(st.highlight));
      if (hc && hIdx !== -1) { extra = { c: hc, rank: hIdx + 1 }; }
    }
    var showCmp = (top.length + (extra ? 1 : 0)) >= 2;

    top.forEach(function (c) { html += buildCard(c, config, st, crit, '', null, showCmp); });

    // Always surface the highlighted cottage even if it didn't make the top
    // three — showing its rank makes its positioning clear.
    if (extra) {
      html += buildCard(extra.c, config, st, crit, fmt(S.rank_label, extra.rank), null, showCmp);
    }

    // The "Compare N cottages" button sits below the cards (where the old recap was),
    // above the edit/restart nav. Only appears once 2+ cards are ticked.
    var cmpBtn = compareButton(config, st);
    if (cmpBtn) { html += '<div class="dccs-compare-actions dccs-results-compare">' + cmpBtn + '</div>'; }
    html += wizardResultsTail(config, st, false);
    html += '</div>';
    return html;
  }

  /** Edit/start-over controls shown under results in either wizard. */
  function wizardResultsTail(config, st, emptyState) {
    if (st.mode !== 'quick' && st.mode !== 'weights') { return ''; }
    var S = config.strings;
    // "Edit answers" always appears on results and opens the review screen on demand —
    // even when the forced review STEP (config.showReview) is turned off. That keeps a
    // full edit path from results without making review a mandatory extra step.
    // The Share button was removed in 0.31.0: no practical use, and it made a third
    // near-identical blue button at the foot of the results. Deep links still WORK —
    // the URL parser that reads ?mode=/?party=/?seed= on load is untouched — there is
    // simply nothing in the widget that produces one any more.
    return '<div class="dccs-wizard-nav dccs-tail-nav">' +
      '<button type="button" class="dccs-edit-answers">' + withIcon(config, 'edit_answers', 'edit_answers', esc(S.edit_answers)) + '</button>' +
      '<button type="button" class="dccs-reset">' + ico(config, 'restart') + esc(S.reset) + '</button></div>';
  }

  /** Status line above the cards: checking / failed / nothing free for those dates. */
  function availNote(config, st, shown) {
    var S = config.strings;
    if (!availOn(config) || st.dates.mode !== 'set') { return ''; }
    if (st.avail.status === 'pending') {
      return '<p class="dccs-avail-note is-pending">' + esc(S.avail_checking) + '</p>';
    }
    if (st.avail.status === 'error') {
      return '<p class="dccs-avail-note is-error" role="status">' + esc(S.avail_error) + '</p>';
    }
    if (st.avail.status === 'ok' && shown.length &&
        shown.every(function (c) { return st.avail.byId[c.id] === 'booked'; })) {
      return '<p class="dccs-avail-note is-none" role="status">' + esc(S.avail_none_free) + '</p>';
    }
    return '';
  }

  /** Per-card availability badge. Renders nothing unless dates produced a verdict. */
  function availBadge(config, st, c) {
    var S = config.strings;
    if (!availOn(config) || st.dates.mode !== 'set' || st.avail.status !== 'ok') { return ''; }
    var v = st.avail.byId[c.id];
    if (v === 'free') {
      return '<p class="dccs-avail dccs-avail-free">' + esc(S.avail_yes) + '</p>';
    }
    if (v === 'booked') {
      var url = (config.availability && config.availability.calendarUrl) || '';
      var link = url
        ? ' <a class="dccs-avail-link" href="' + esc(safeUrl(url)) + '">' + esc(S.avail_calendar) + '</a>'
        : '';
      return '<p class="dccs-avail dccs-avail-booked">' + esc(S.avail_no) + link + '</p>';
    }
    return '';
  }

  function buildCard(c, config, st, crit, rankLabel, miss, showCmp) {
    if (showCmp === undefined) { showCmp = true; }
    var S = config.strings;
    var isHi = st.highlight && String(st.highlight) === String(c.id);
    var html = '<div class="dccs-card' + (isHi ? ' is-highlight' : '') + '">';
    html += '<div class="dccs-card-head"><h4>' + esc(cname(config, c)) +
      (rankLabel ? ' <span class="dccs-rank">' + esc(rankLabel) + '</span>' : '') + '</h4></div>';

    html += availBadge(config, st, c);

    if (miss && miss.length) {
      html += '<div class="dccs-misses">' + miss.map(function (m) {
        return '<span class="dccs-miss">' + esc(m) + '</span>';
      }).join('') + '</div>';
    }

    var badges = DCCS.labels.badges(c).map(function (b) { return S['badge_' + b]; }).filter(Boolean);
    if (badges.length) {
      html += '<div class="dccs-badges">' + badges.slice(0, 3).map(function (b) {
        return '<span class="dccs-badge">' + esc(b) + '</span>';
      }).join('') + '</div>';
    }

    var reasons = DCCS.labels.whyFits(c, crit).map(function (k) { return S['why_' + k]; }).filter(Boolean);
    if (reasons.length) {
      html += '<p class="dccs-why"><strong>' + esc(S.why_heading) + ':</strong> ' +
        esc(S.why_lead) + ' ' + esc(joinList(reasons)) + '.</p>';
    }

    // Owner-supplied per-cottage facts (data/cottages.json "highlights") — short
    // lines, rendered verbatim; the data file is the only permitted source.
    if (c.highlights && c.highlights.length) {
      html += '<ul class="dccs-highlights">' + c.highlights.map(function (h) {
        return '<li>' + esc(h) + '</li>';
      }).join('') + '</ul>';
    }

    if (c.duplicateOf) {
      var other = findCottage(config, c.duplicateOf);
      if (other) { html += '<p class="dccs-dup">' + esc(fmt(S.dup_note, cname(config, other))) + '</p>'; }
    }

    // The per-card Compare checkbox renders only when the page shows 2+ cards —
    // a lone result has nothing to be compared with (Compare mode in the menu
    // still covers cross-cottage curiosity).
    // Three cards each say "View Cottage" / "Compare"; a screen reader needs the
    // cottage name in the accessible name to tell them apart (WCAG 2.4.4).
    var nameLabel = cname(config, c);
    var cmpToggle = showCmp
      ? '<label class="dccs-cmp-toggle"><input type="checkbox" data-cmp="' + esc(c.id) + '"' +
        ' aria-label="' + esc(S.add_compare + ': ' + nameLabel) + '"' +
        (st.compareIds.indexOf(String(c.id)) !== -1 ? ' checked' : '') + '> ' + ico(config, 'compare') + esc(S.add_compare) + '</label>'
      : '';
    html += '<div class="dccs-card-actions">' +
      '<a class="dccs-view" href="' + esc(safeUrl(c.pageUrl)) + '" aria-label="' + esc(S.view_cottage + ': ' + nameLabel) + '">' + withIcon(config, 'view', 'view', esc(S.view_cottage)) + '</a>' +
      cmpToggle +
      '</div></div>';
    return html;
  }

  /** Update the screen-reader live region with the current step / match summary. */
  function announce(live, config, state, res) {
    var S = config.strings;
    res = res || DCCS.score.run(config.cottages, criteriaFromState(state));
    var n = res.empty ? 0 : res.results.length;
    if ((state.mode === 'quick' || state.mode === 'weights') && state.stage === 'q') {
      var tr = wizardTrack(state, S);
      var i = clamp(state.step | 0, 0, tr.questions.length - 1);
      live.textContent = fmt2(S.wiz_progress, i + 1, tr.questions.length) + '. ' +
        tr.qLabel(tr.questions[i]) + '. ' + matchCount(S, n);
      return;
    }
    if (state.mode === 'compare') {
      // Announce the selection count, not silence: "Compare N cottages" once
      // enough are ticked, else the pick-2-or-more prompt.
      var cn = state.compareIds.length;
      live.textContent = cn >= 2 ? fmt(S.compare_btn, cn) : S.compare_prompt;
      return;
    }
    var msg = matchCount(S, n);
    if (!res.empty && res.results[0]) { msg += '. ' + fmt(S.sr_top_match, cname(config, res.results[0])); }
    live.textContent = msg;
  }

  function joinList(arr) {
    if (arr.length <= 1) { return arr.join(''); }
    return arr.slice(0, -1).join(', ') + ' & ' + arr[arr.length - 1];
  }

  /* ---------- selector instance ---------- */

  var MODE_LABEL = { quick: 'mode_quick', weights: 'mode_weights', compare: 'mode_compare' };

  /** Opening screen: heading + intro + a choice of the enabled modes. Picking one
      enters that mode; the heading/intro then disappear for the rest of the flow. */
  function renderLanding(config, state, S) {
    var modes = config.enabledModes || ['quick', 'weights', 'compare'];
    var head = '';
    if (config.showHeading !== false) {
      head = '<div class="dccs-head"><h2 class="dccs-heading">' +
        '<span class="dccs-heading-t">' + headingHtml(S.heading) + '</span>' +
        '</h2>' +
        '<p class="dccs-intro">' + esc(S.intro) + '</p></div>';
    }
    var choices = modes.map(function (m) {
      return '<button type="button" class="dccs-landing-choice" data-mode="' + esc(m) + '">' +
        ico(config, 'mode_' + m) +
        '<span class="dccs-landing-choice-label">' + esc(S[MODE_LABEL[m]] || m) + '</span></button>';
    }).join('');
    return '<div class="dccs-landing">' + head +
      '<div class="dccs-landing-choices" role="group" aria-label="' + esc(S.heading) + '">' + choices + '</div></div>';
  }

  /** Top mode switcher as a dropdown (cleaner than 3 long pills on mobile).
      Hidden when only one mode is enabled. */
  function modeSelect(config, state, S) {
    var modes = config.enabledModes || ['quick', 'weights', 'compare'];
    if (!modes || modes.length <= 1) { return ''; }
    var current = S[MODE_LABEL[state.mode]] || state.mode;
    var opts = modes.map(function (m) {
      var on = state.mode === m;
      return '<button type="button" role="menuitemradio" aria-checked="' + (on ? 'true' : 'false') +
        '" class="dccs-modetab' + (on ? ' is-active' : '') + '" data-mode="' + m + '">' +
        esc(S[MODE_LABEL[m]] || m) + '</button>';
    }).join('');
    // The open/close state lives on the DOM (is-open class), not in app state, so
    // re-renders triggered by other actions don't fight the toggle.
    return '<div class="dccs-modeselect">' +
      '<button type="button" class="dccs-modeselect-trigger" aria-haspopup="menu" aria-expanded="false">' +
      '<span>' + esc(current) + '</span> <span class="dccs-caret" aria-hidden="true">\u25BE</span></button>' +
      '<div class="dccs-modeselect-list" role="menu">' + opts + '</div></div>';
  }

  function renderSelector(root, config, state, ctx) {
    var S = config.strings;
    // The heading + intro live ONLY on the landing screen; once a mode is chosen
    // they disappear for the rest of the flow.
    if (state.stage === 'landing') {
      root.innerHTML = renderLanding(config, state, S);
      return;
    }
    var isWizard = (state.mode === 'quick' || state.mode === 'weights');
    var bar = modeSelect(config, state, S);

    if (isWizard) {
      root.innerHTML = bar + renderWizard(config, state, ctx);
      return;
    }
    root.innerHTML = bar + '<div class="dccs-body">' + renderCompare(config, state) + '</div>';
  }

  // Defer init until the score/labels dependencies have executed (the Elementor
  // editor can inject the widget before those scripts run). Bounded retry.
  var retryScheduled = false, retryCount = 0;
  function scheduleRetry() {
    if (retryScheduled || retryCount > 100) { return; }
    retryScheduled = true; retryCount++;
    setTimeout(function () { retryScheduled = false; bootAll(document); }, 50);
  }
  function depsReady() { return !!(window.DCCS && DCCS.score && DCCS.labels); }

  /** Terminal failure (bad config, missing deps): don't leave "Loading…" up forever.
      Reveal the server-rendered noscript cottage-link list instead — browsers keep
      <noscript> content as inert text, so re-parsing it (site-authored, trusted
      markup) turns the dead widget into a plain list of links to every cottage. */
  function showFallback(root) {
    root.dataset.dccsReady = '1';
    var ns = root.querySelector('noscript');
    var loading = root.querySelector('.dccs-loading');
    if (!ns || !loading || !loading.parentNode) { return; }
    var list = document.createElement('div');
    list.className = 'dccs-noscript';
    list.innerHTML = ns.textContent || '';
    loading.parentNode.replaceChild(list, loading);
  }

  function initSelector(root) {
    if (root.dataset.dccsReady) { return; }
    if (!depsReady()) {
      if (retryCount > 100) { showFallback(root); return; }
      scheduleRetry(); return;
    }
    var config;
    try { config = JSON.parse(root.dataset.config || '{}'); } catch (e) { showFallback(root); return; }
    if (!config.cottages || !config.cottages.length) { showFallback(root); return; }
    root.dataset.dccsReady = '1';
    if (!root.dataset.dccsUid) { root.dataset.dccsUid = 'dccs' + (++UID); }

    var state = buildState(config, root);
    state.config = config;   // wizardTrack needs it to decide on the dates step

    // Persistent screen-reader live region — kept across re-renders (re-appended,
    // not recreated) so aria-live actually announces result changes.
    var live = document.createElement('div');
    live.className = 'dccs-sr-only';
    live.setAttribute('aria-live', 'polite');

    /**
     * Kick off (or reuse) the availability lookup for the current dates. Sets a
     * 'pending' status immediately so the results say what is happening, then
     * re-renders once with the verdicts. Cached per range in availability.js, so
     * editing an unrelated answer never refetches.
     */
    function refreshAvailability() {
      if (!availOn(config) || state.dates.mode !== 'set') {
        state.avail = { status: '', byId: {} };
        return;
      }
      var from = state.dates.from, to = state.dates.to;
      var key = from + '|' + to;
      // Any SETTLED status for this range is final — including 'error'. The
      // resolve handler calls rerender(), which calls back here; retrying on
      // error would loop forever and hammer the endpoint precisely when it is
      // already failing. A new date range gets a fresh attempt.
      if (state.avail.key === key && state.avail.status !== '') { return; }
      state.avail = { status: 'pending', byId: {}, key: key };
      DCCS.availability.lookup(config, from, to).then(function (res) {
        // A later edit may have changed the dates while this was in flight.
        if (state.dates.from !== from || state.dates.to !== to) { return; }
        state.avail = { status: res.status === 'ok' ? 'ok' : res.status, byId: res.byId || {}, key: from + '|' + to };
        rerender();
      });
    }

    function rerender() {
      if (state.stage === 'results') { refreshAvailability(); }
      var key = root.contains(document.activeElement) ? focusKey(document.activeElement) : null;
      // Score once per render and reuse it for the body + the live region.
      var crit = criteriaFromState(state);
      var res = DCCS.score.run(config.cottages, crit);
      renderSelector(root, config, state, { crit: crit, res: res });
      root.appendChild(live);
      announce(live, config, state, res);
      wireCmpScrollbar(root);
      if (key) { var keep = root.querySelector(key); if (keep && keep.focus) { keep.focus(); } }
      // rerender() rebuilds the root, so the cast overlay is destroyed with it.
      // sync() re-binds to the new heading, or stands down once the landing screen
      // is gone. Casting that has already stopped stays stopped.
      if (cast) { cast.sync(); }
    }

    // Size + position the custom always-visible compare scrollbar to mirror the list's
    // scroll state, and let guests drag the thumb. Re-bound each render (the list is
    // rebuilt every time). No-op when there's nothing to scroll.
    function wireCmpScrollbar(r) {
      var list = r.querySelector('.dccs-cmp-list');
      var bar = r.querySelector('.dccs-cmp-bar');
      if (!list || !bar) { return; }
      var thumb = bar.querySelector('.dccs-cmp-bar-thumb');
      function layout() {
        var ratio = list.scrollHeight ? list.clientHeight / list.scrollHeight : 1;
        if (ratio >= 1) { bar.style.display = 'none'; return; }
        bar.style.display = 'block';
        var trackH = bar.clientHeight;
        var th = Math.max(34, Math.round(trackH * ratio));
        var maxTop = trackH - th;
        var range = list.scrollHeight - list.clientHeight;
        thumb.style.height = th + 'px';
        thumb.style.top = (range ? (list.scrollTop / range) * maxTop : 0) + 'px';
      }
      list.addEventListener('scroll', layout, { passive: true });
      var startY = 0, startTop = 0, drag = false;
      thumb.addEventListener('pointerdown', function (e) {
        drag = true; startY = e.clientY; startTop = parseFloat(thumb.style.top) || 0;
        if (thumb.setPointerCapture) { thumb.setPointerCapture(e.pointerId); }
        e.preventDefault();
      });
      thumb.addEventListener('pointermove', function (e) {
        if (!drag) { return; }
        var trackH = bar.clientHeight, th = thumb.offsetHeight, maxTop = trackH - th;
        var top = Math.min(maxTop, Math.max(0, startTop + (e.clientY - startY)));
        list.scrollTop = maxTop ? (top / maxTop) * (list.scrollHeight - list.clientHeight) : 0;
      });
      function end() { drag = false; }
      thumb.addEventListener('pointerup', end);
      thumb.addEventListener('pointercancel', end);
      layout();
    }
    // Decoration over the heading (0.29.0). Returns null under reduced motion, in
    // which case nothing is built and nothing is scheduled.
    var cast = null;
    rerender();
    if (DCCS.cast && DCCS.cast.attach) {
      cast = DCCS.cast.attach(root);
      // Handle for the headless audit, which has to force casts two and three
      // rather than wait 45-75s for them. Reading it changes nothing.
      root._dccsCast = cast;
    }

    // After a wizard navigation, move focus to the new step/results heading.
    function focusStep() {
      var h = root.querySelector('.dccs-step-q, .dccs-results-h');
      if (h && h.focus) { h.focus(); }
    }
    function trackLen() { return wizardTrack(state, config.strings).questions.length; }
    function advance() {
      if (state.editReturn) { state.stage = state.editReturn; state.editReturn = null; }
      // After the last question: show the review step, or (when the owner disabled it)
      // jump straight to the matches.
      else if ((state.step | 0) >= trackLen() - 1) { state.stage = (config.showReview !== false) ? 'review' : 'results'; }
      else { state.step = (state.step | 0) + 1; }
    }
    // Switching to/from any mode starts that mode completely fresh: quiz answers,
    // priority weights, compare picks and navigation all reset (owner decision,
    // 0.23.0 — the modes are independent tools, and Compare is criteria-free).
    // The highlight (mini-entry / deep-link context) and the day's tie-break
    // rotation are the only things that carry across.
    function resetForMode(st) {
      var fresh = defaultState(config);
      st.quick = fresh.quick; st.weights = fresh.weights;
      st.dates = fresh.dates; st.avail = fresh.avail;
      st.compareIds = []; st.step = 0; st.stage = 'q'; st.editReturn = null;
      // NOTE: this deliberately does NOT touch the remembered picks. Its two
      // callers mean different things and only one of them is a mode SWITCH —
      // see the landing-choice and modetab handlers below.
    }

    root.addEventListener('click', function (e) {
      var t = e.target.closest('button, a');
      if (!t || !root.contains(t)) { return; }
      var cl = t.classList;

      // --- dates: the "not sure yet" skip ---
      if (cl.contains('dccs-date-skip')) {
        state.dates = { from: '', to: '', mode: 'skip' };
        state.avail = { status: '', byId: {} };
        rerender(); return;
      }
      // --- share: copy a link that reopens these results ---
      // --- answer chip: select only (no auto-advance) ---
      if (cl.contains('dccs-chip')) {
        if (state.mode === 'weights') { state.weights[t.dataset.group] = Number(t.dataset.value); }
        else { state.quick[t.dataset.group] = coerce(t.dataset.value); }
        rerender(); return;
      }
      // --- Next: advance to the next step / review (or back to edit origin) ---
      if (cl.contains('dccs-next')) {
        if (t.disabled) { return; }
        advance(); rerender(); focusStep(); return;
      }
      // --- wizard navigation ---
      if (cl.contains('dccs-back')) {
        state.stage = 'q'; state.editReturn = null; state.step = Math.max(0, (state.step | 0) - 1);
        rerender(); focusStep(); return;
      }
      if (cl.contains('dccs-edit')) {
        // Remember where we came from so Next returns there after a single edit.
        if (state.stage === 'review' || state.stage === 'results') { state.editReturn = state.stage; }
        state.stage = 'q'; state.step = clamp(Number(t.dataset.step) || 0, 0, trackLen() - 1);
        rerender(); focusStep(); return;
      }
      if (cl.contains('dccs-see-matches')) {
        state.stage = 'results'; rerender(); focusStep(); return;
      }
      if (cl.contains('dccs-edit-answers')) {
        state.stage = 'review'; state.editReturn = null; rerender(); focusStep(); return;
      }
      // --- mode dropdown (open/close toggled directly on the DOM) ---
      if (cl.contains('dccs-modeselect-trigger')) {
        var box = t.closest('.dccs-modeselect');
        if (box) { var nowOpen = box.classList.toggle('is-open'); t.setAttribute('aria-expanded', nowOpen ? 'true' : 'false'); }
        return;
      }
      // --- landing screen: choose a mode and leave the landing ---
      if (cl.contains('dccs-landing-choice')) {
        // Entering a mode from the landing is the FIRST entry of this visit, not a
        // switch between modes, so the guest's remembered compare picks come back
        // here. Without this the feature could never work: every page load starts
        // on the landing, and resetForMode would wipe the picks on the way in.
        state.mode = t.dataset.mode;
        resetForMode(state);
        var kept = cmpLoad(root);
        if (kept && state.mode === 'compare') { state.compareIds = kept; }
        rerender(); focusStep(); return;
      }
      if (cl.contains('dccs-modetab')) {
        // A genuine switch between modes. Re-selecting the mode you are already in
        // is a no-op, so it does not throw away a list you just built.
        if (t.dataset.mode === state.mode) { rerender(); return; }
        state.mode = t.dataset.mode;
        resetForMode(state); // fresh start in the new mode
        cmpSave(root, []);   // the 0.23.0 reset contract: picks go with it
        rerender(); focusStep(); return;
      }
      // --- compare (the ‹ › paging buttons live in the modal, which mounts outside
      //     this root and handles its own clicks — see openCompareModal) ---
      if (cl.contains('dccs-open-compare')) { openCompareModal(config, state, t); return; }
      // --- reset (Start over) ---
      if (cl.contains('dccs-reset')) {
        // Restart clears the remembered picks too — otherwise "start over" would
        // quietly leave the ticks behind, to reappear on the next page.
        state = defaultState(config);
        cmpSave(root, []);
        rerender(); focusStep(); return;
      }
    });

    // Close either dropdown when pressing outside it (mousedown fires before any
    // click-driven re-render, so the live target can be inspected safely).
    // Self-removing: initSelector runs on every Mini-Entry pop-up open, so a
    // permanent document listener per init would accumulate; once this widget's
    // root leaves the DOM (pop-up closed), the handler unhooks itself.
    document.addEventListener('mousedown', function onDocDown(e) {
      if (!document.documentElement.contains(root)) {
        document.removeEventListener('mousedown', onDocDown);
        return;
      }
      var open = root.querySelector('.dccs-modeselect.is-open');
      if (!open) { return; }
      if (!(e.target.closest && e.target.closest('.dccs-modeselect'))) {
        open.classList.remove('is-open');
        var trg = open.querySelector('.dccs-modeselect-trigger');
        if (trg) { trg.setAttribute('aria-expanded', 'false'); }
      }
    });

    // Compare checkboxes inside result cards, and the two date inputs.
    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.matches('input[type="checkbox"][data-cmp]')) {
        toggleCompare(state, t.dataset.cmp); cmpSave(root, state.compareIds); rerender(); return;
      }
      if (t && (t.classList.contains('dccs-date-in') || t.classList.contains('dccs-date-out'))) {
        var into = t.classList.contains('dccs-date-in');
        var from = into ? t.value : state.dates.from;
        var to = into ? state.dates.to : t.value;
        // Picking a check-in after the current check-out clears the stale end date
        // rather than leaving an impossible range on screen.
        if (into && to && DCCS.availability.parseYmd(to) && DCCS.availability.parseYmd(from) &&
            DCCS.availability.parseYmd(to) <= DCCS.availability.parseYmd(from)) { to = ''; }
        state.dates = { from: from, to: to, mode: (from && to) ? 'set' : '' };
        state.avail = { status: '', byId: {} };
        refreshAvailability();
        rerender();
      }
    });

    // Arrow-key navigation for the mode toggle and radio groups (roving focus).
    root.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t || !t.classList) { return; }
      if (e.key === 'Escape') {
        var openSel = root.querySelector('.dccs-modeselect.is-open');
        if (openSel) {
          openSel.classList.remove('is-open');
          var tg = openSel.querySelector('.dccs-modeselect-trigger');
          if (tg) { tg.setAttribute('aria-expanded', 'false'); tg.focus(); }
          e.preventDefault();
        }
        return;
      }
      var isTab = t.classList.contains('dccs-modetab');
      var isRadio = t.getAttribute && t.getAttribute('role') === 'radio';
      if (!isTab && !isRadio) { return; }
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].indexOf(e.key) === -1) { return; }
      e.preventDefault();
      var group;
      if (isTab) {
        group = Array.prototype.slice.call(root.querySelectorAll('.dccs-modetab'));
      } else {
        var rg = t.closest('[role="radiogroup"]');
        group = rg ? Array.prototype.slice.call(rg.querySelectorAll('[role="radio"]')) : [t];
      }
      var idx = group.indexOf(t);
      if (idx === -1) { return; }
      var dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
      // Move focus only — activation is Enter/Space/tap (keeps arrows from
      // switching modes or selecting answers unintentionally).
      group[(idx + dir + group.length) % group.length].focus();
    });

    root.dispatchEvent(new CustomEvent('dccs:ready', { bubbles: true }));
  }

  function coerce(v) {
    if (v === '2') { return 2; }
    if (v === '4') { return 4; }
    return v;
  }

  function toggleCompare(state, id) {
    id = String(id);
    var i = state.compareIds.indexOf(id);
    if (i !== -1) { state.compareIds.splice(i, 1); }
    else { state.compareIds.push(id); }
  }

  /* ---------- overlays (mini-entry modal + compare modal) ---------- */

  /** Shared overlay scaffold: focus-trap, background scroll-lock, Esc/click close.
      `label` names the dialog for screen readers. */
  function buildOverlay(trigger, label, mount) {
    var overlay = el('<div class="dccs-modal" role="dialog" aria-modal="true" aria-label="' + esc(label || '') + '"><div class="dccs-modal-box">' +
      '<button type="button" class="dccs-modal-close" aria-label="Close">&times;</button>' +
      '<div class="dccs-modal-content"></div></div></div>');
    (mount || document.body).appendChild(overlay);

    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    var prevFocus = document.activeElement;
    var closeBtn = overlay.querySelector('.dccs-modal-close');

    function focusables() {
      return Array.prototype.slice.call(overlay.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    }
    function close() {
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      // Remove any generated body-level scope host (see openModal) so it doesn't pile up.
      if (overlay._dccsHost && overlay._dccsHost.parentNode) { overlay._dccsHost.parentNode.removeChild(overlay._dccsHost); }
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (trigger && trigger.focus) { trigger.focus(); }
      else if (prevFocus && prevFocus.focus) { prevFocus.focus(); }
    }
    /** Overlays can nest (the compare table opens over the mini-entry pop-up), and
        each one registers its own document-level key handler. Only the TOPMOST
        overlay may react — otherwise one Escape press closes the whole stack and
        dumps the guest back on the page with their answers gone. Later-opened
        overlays always sit later in document order. */
    function isTopmost() {
      var all = document.querySelectorAll('.dccs-modal');
      return all.length > 0 && all[all.length - 1] === overlay;
    }
    function onKey(e) {
      if (!isTopmost()) { return; }
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') {
        var f = focusables();
        if (!f.length) { return; }
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    overlay.addEventListener('click', function (e) { if (e.target === overlay || e.target.closest('.dccs-modal-close')) { close(); } });
    document.addEventListener('keydown', onKey);

    return {
      overlay: overlay,
      content: overlay.querySelector('.dccs-modal-content'),
      close: close,
      focusClose: function () { if (closeBtn) { closeBtn.focus(); } }
    };
  }

  function openCompareModal(config, state, trigger) {
    if (state.compareIds.length < 2) { return; }
    var o = buildOverlay(trigger, config.strings.mode_compare);
    var start = 0;
    function paint() {
      // Wrap in a ready-marked .dccs-root so the scoped styles + CSS vars apply
      // (data-dccs-ready stops bootAll from trying to initialize this shell).
      o.content.innerHTML = '<div class="dccs-root dccs-in-modal" data-dccs-ready="1">' +
        '<div class="dccs-compare dccs-compare-modal">' +
        '<h3 class="dccs-modal-h">' + esc(config.strings.mode_compare) + '</h3>' +
        compareMatrixHtml(config, state, start) + '</div></div>';
    }
    o.content.addEventListener('click', function (e) {
      var b = e.target.closest('.dccs-cmp-prev, .dccs-cmp-next');
      if (!b || b.disabled) { return; }
      start = clamp(start + (b.classList.contains('dccs-cmp-next') ? 1 : -1), 0, Math.max(0, state.compareIds.length - CMP_WIN));
      paint();
    });
    paint();
    o.focusClose();
  }

  function initEntry(node) {
    if (node.dataset.dccsReady) { return; }
    var entry;
    try { entry = JSON.parse(node.dataset.entry || '{}'); } catch (e) { return; }
    node.dataset.dccsReady = '1';

    var btn = node.querySelector('.dccs-entry-btn');
    if (!btn) { return; }

    btn.addEventListener('click', function () {
      if (entry.selectorUrl) {
        var base = safeUrl(entry.selectorUrl);
        var q = entry.deeplink || ('highlight=' + encodeURIComponent(entry.current || '') + '&mode=quick');
        var sep = base.indexOf('?') === -1 ? '?' : '&';
        window.location.href = base + sep + q;
        return;
      }
      openModal(entry, btn, node);
    });
  }

  /** Recreate a widget's Elementor scope classes on a clean, body-level host so the
      Mini-Entry popup's scoped style controls (`{{WRAPPER}} .dccs-root…`) still match,
      while escaping any transformed/filtered ancestor that would trap the fixed-position
      overlay inside the page (the cause of the off-viewport / scroll-locked popup bug).
      Returns { outer, inner } appended to <body>, or null when there's no Elementor
      wrapper (e.g. the shortcode) — callers then fall back to a plain body mount. */
  function elementorScopeHost(node) {
    var widgetEl = node && node.closest ? node.closest('.elementor-element') : null;
    if (!widgetEl) { return null; }
    function pick(elm, re) {
      return elm ? Array.prototype.filter.call(elm.classList, function (c) { return re.test(c); }).join(' ') : '';
    }
    // Copy ONLY the elementor* scope tokens (page + element id) — never animation or
    // transform helper classes, so the hosts themselves introduce no containing block.
    var outer = el('<div class="' + ('dccs-modal-host ' + pick(node.closest('.elementor'), /^elementor(-\d+)?$/)).trim() + '"></div>');
    var inner = el('<div class="' + pick(widgetEl, /^elementor-element(-[\w]+)?$/) + '"></div>');
    outer.appendChild(inner);
    document.body.appendChild(outer);
    return { outer: outer, inner: inner };
  }

  /** Like elementorScopeHost, but from explicit class names — used when a Mini-Entry
      mirrors another Cottage Selector: the host carries the SOURCE widget's scope
      (`scope.page` = elementor-{POST_ID}, `scope.el` = elementor-element-{ID}) so the
      source's own generated CSS (enqueued server-side) styles the mirrored pop-up. */
  function explicitScopeHost(scope) {
    var outer = el('<div class="' + ('dccs-modal-host ' + (scope.page || '')).trim() + '"></div>');
    var inner = el('<div class="' + ('elementor-element ' + (scope.el || '')).trim() + '"></div>');
    outer.appendChild(inner);
    document.body.appendChild(outer);
    return { outer: outer, inner: inner };
  }

  function openModal(entry, trigger, mount) {
    var config = entry.modalConfig;
    if (!config) { return; }

    // Open on the landing screen — the popup's first section mirrors the main Selector.
    // The cottage stays highlighted once the guest reaches results.
    config.openStage = 'landing';
    config.highlight = String(entry.current);

    // Mount on a clean body-level host (with Elementor scope classes) so the overlay's
    // position:fixed is relative to the viewport — always centered, scrollable, and
    // closable regardless of scroll position — yet still picks up the right styling.
    // When mirroring, use the SOURCE Selector's scope so its CSS styles the pop-up.
    var host = entry.scope ? explicitScopeHost(entry.scope) : elementorScopeHost(mount);
    var o = buildOverlay(trigger, config.strings && config.strings.heading, host ? host.inner : null);
    if (host) { o.overlay._dccsHost = host.outer; }
    var inner = el('<div class="dccs-root dccs-in-modal"></div>');
    // Apply the palette/spacing as INLINE custom properties so the pop-up shows the
    // right colours even when SpeedyCache's "remove unused CSS" defers the stylesheets
    // (inline props win over, and are never stripped with, those sheets).
    if (config.cssVars) {
      Object.keys(config.cssVars).forEach(function (k) {
        try { inner.style.setProperty(k, config.cssVars[k]); } catch (e) { /* ignore bad value */ }
      });
    }
    inner.dataset.config = JSON.stringify(config);
    o.content.appendChild(inner);
    initSelector(inner);
    o.focusClose();
  }

  /* ---------- boot ---------- */

  function bootAll(scope) {
    scope = scope || document;
    if (!scope.querySelectorAll) { return; }
    // Wrap each init so one failing widget can't break the page (or the
    // Elementor editor preview) for the others.
    Array.prototype.forEach.call(scope.querySelectorAll('.dccs-root:not([data-dccs-ready])'), function (n) {
      try { initSelector(n); } catch (e) { if (window.console) { console.warn('DCCS selector init failed', e); } }
    });
    Array.prototype.forEach.call(scope.querySelectorAll('.dccs-entry:not([data-dccs-ready])'), function (n) {
      try { initEntry(n); } catch (e) { if (window.console) { console.warn('DCCS entry init failed', e); } }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bootAll(document); });
  } else {
    bootAll(document);
  }

  // Elementor editor preview.
  if (window.jQuery) {
    window.jQuery(window).on('elementor/frontend/init', function () {
      if (window.elementorFrontend && window.elementorFrontend.hooks) {
        window.elementorFrontend.hooks.addAction('frontend/element_ready/dccs_selector.default', function ($scope) { bootAll($scope[0]); });
        window.elementorFrontend.hooks.addAction('frontend/element_ready/dccs_mini_entry.default', function ($scope) { bootAll($scope[0]); });
      }
    });
  }

  // Catch dynamically inserted widgets (e.g. the Elementor editor preview, which
  // injects markup after load). Guard document.body — if this script ever runs
  // before <body> exists, observe(null) would throw and break the preview.
  // Only react to mutations that actually add a widget (not our own re-renders or
  // unrelated page nodes), and coalesce a burst into a single boot.
  if (window.MutationObserver && document.body) {
    var bootPending = false;
    var scheduleBoot = window.requestAnimationFrame
      ? window.requestAnimationFrame.bind(window)
      : function (f) { setTimeout(f, 16); };
    var addsWidget = function (node) {
      if (!node || node.nodeType !== 1) { return false; }
      return (node.matches && node.matches('.dccs-root, .dccs-entry')) ||
        (node.querySelector && !!node.querySelector('.dccs-root, .dccs-entry'));
    };
    new MutationObserver(function (muts) {
      if (bootPending) { return; }
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes || [];
        for (var j = 0; j < added.length; j++) {
          if (addsWidget(added[j])) {
            bootPending = true;
            scheduleBoot(function () { bootPending = false; bootAll(document); });
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  DCCS.bootAll = bootAll;
})(window, document);
;
