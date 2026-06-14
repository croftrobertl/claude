/**
 * Two-phase scoring pipeline for the Dora Canal cottage selector.
 *
 * Pure, side-effect-free functions operating ONLY on data keys — no display
 * strings live here. Exposed on the global DCCS namespace so labels.js and
 * selector.js can use them without a build step.
 *
 * Phase 1 — Binary Exclusion (hard filters): pet → only #34; ground-floor-only
 *   → drop #23; table-for-4 → only #22. If ≤3 cottages survive, return them and
 *   bypass Phase 2 to avoid artificial score distortion.
 * Phase 2 — Relative Weighted Scoring of the survivors.
 */
(function (window) {
  'use strict';

  var DCCS = window.DCCS = window.DCCS || {};

  function isGround(c) {
    return String(c.floorLevel || '').toLowerCase().indexOf('ground') === 0;
  }

  /** Phase 1: apply hard filters, collecting an exclusion ledger with reasons. */
  function phase1(cottages, crit) {
    var pool = cottages.slice();
    var excluded = [];

    function drop(reasonKey, keepFn) {
      pool = pool.filter(function (c) {
        if (keepFn(c)) { return true; }
        excluded.push({ id: c.id, reasonKey: reasonKey });
        return false;
      });
    }

    if (crit.hardPet) { drop('ex_pet', function (c) { return c.petAllowed === true; }); }
    if (crit.hardGround) { drop('ex_upstairs', function (c) { return isGround(c); }); }
    if (crit.hardDining4) { drop('ex_dining', function (c) { return Number(c.diningSeats) >= 4; }); }

    return { pool: pool, excluded: excluded };
  }

  /** Phase 2: weighted score for one cottage. Higher is better. */
  function scoreOne(c, crit) {
    var s = 0;
    var sqft = Number(c.squareFeet) || 0;

    if (crit.wantLargest) { s += sqft / 100; }
    s += (sqft / 100) * (crit.wSpace || 0) * 0.5;
    s += (c.desk ? 1 : 0) * (crit.wDesk || 0);
    s += (c.pulloutCouch ? 1 : 0) * (crit.wPullout || 0);
    s += (c.layoutType === 'Studio' ? 1 : 0) * (crit.wStudio || 0);
    s += (c.layoutType !== 'Studio' ? 1 : 0) * (crit.wOneBed || 0);
    s += (Number(c.diningSeats) >= 4 ? 1 : 0) * (crit.wDining || 0);
    s += (c.petAllowed ? 1 : 0) * (crit.wPet || 0);
    s += (isGround(c) ? 1 : 0) * (crit.wFewerStairs || 0);

    return s;
  }

  /** Stable signature of the 7 meaningful differences. */
  function signature(c, diffFields) {
    return diffFields.map(function (f) { return f + ':' + c[f]; }).join('|');
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
    isGround: isGround
  };
})(window);
