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

    if (pool.length <= 3) {
      var direct = pool.slice().sort(function (a, b) { return Number(a.id) - Number(b.id); });
      return { results: direct, excluded: p1.excluded, bypassed: true, empty: false };
    }

    var scored = pool.map(function (c) { return { c: c, s: scoreOne(c, crit) }; });
    scored.sort(function (a, b) {
      if (b.s !== a.s) { return b.s - a.s; }
      return Number(a.c.id) - Number(b.c.id);
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
