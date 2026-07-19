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
    add('pullout', crit.wPullout > 0, c.pulloutCouch);
    var hard = crit.hard || [];
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
