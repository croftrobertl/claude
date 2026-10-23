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
  /** THE match count: how many cottages pass every hard filter. The quiz pill, the
      results pill, its ticker and the live region all read THIS — never a second
      count (0.54.0, Rob: "never build a second count"). */
  function matchN(res) { return res.empty ? 0 : res.results.length; }
  /** "8 -> 3", hidden from assistive tech (the pill already says it). The new number
      animates in (transform/opacity only; reduced motion turns it off in CSS). */
  function ticker(from, to) {
    return '<span class="dccs-tick" aria-hidden="true"><span class="dccs-tick-from">' + esc(from) + '</span>' +
      ' \u2192 <span class="dccs-tick-to">' + esc(to) + '</span></span>';
  }

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

  /** The CTA carries BOTH labels and the stylesheet shows one, keyed to viewport
      width. Doing it in CSS rather than JS keeps the markup identical for every
      device, so a full-page cache cannot serve one width's label to another. The
      <a> has an explicit aria-label built from the long form, so the accessible
      name is the full "View this cottage: <name>" at every width regardless of
      which span is painted, and the visible word is contained in it (WCAG 2.5.3).
      A display:none span is not exposed, so nothing is announced twice. */
  function viewLabel(S) {
    return '<span class="dccs-view-long">' + esc(S.view_cottage) + '</span>' +
      '<span class="dccs-view-short">' + esc(S.view_cottage_short || S.view_cottage) + '</span>';
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
    var quick = { party: '', desk: '', pullout: '', layout: '', pet: '', ground: '', screenedporch: '' };
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
    // ?dining= is deliberately NOT read (0.53.0): the dining question is gone, and a
    // link shared before then must not filter on an answer the guest cannot see.
    if (p.has('party')) {
      var pv = String(p.get('party'));
      state.quick.party = /^(1|2|1-2|12)$/.test(pv) ? '2' : (/^3|^4/.test(pv) ? '34' : 'either');
    }
    if (p.has('compare')) { state.compareIds = p.get('compare').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
    // Dates: ?in=YYYY-MM-DD&out=YYYY-MM-DD, or ?dates=skip for an explicit skip.
    if (p.get('dates') === 'skip') { state.dates = { from: '', to: '', mode: 'skip' }; }
    if (p.has('in') && p.has('out')) {
      var din = String(p.get('in')), dout = String(p.get('out'));
      // Same cap the dates step uses (config.availability.maxNights); 95 is the
      // pre-0.44.0 literal, kept as the fallback for a cached data-config.
      var maxN = cfgNum(config.availability || {}, 'maxNights', 95);
      if (DCCS.availability && DCCS.availability.validRange(din, dout, maxN)) {
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
  /** The site-wide 3-4 guest switch (WP option dcc_guest34_enabled, surfaced by
      Config::build). ABSENT or truthy means ON, so a config that predates the
      switch — or one built without WP — behaves exactly as it did before; only an
      explicit false turns it off. When OFF the party-size question leaves the
      wizard entirely and the "Room for 3-4 guests" priority leaves Weigh
      priorities, because a question whose only real answers are "2" and "No
      preference" asks nothing, and a priority that cannot separate any two
      cottages is not a priority. */
  function guest34On(config) {
    return !config || config.guest34 !== false;
  }

  /** A positive integer from the config, or the pre-0.44.0 hard-coded fallback.
      THE FALLBACK IS LOAD-BEARING: a full-page cache can serve HTML whose
      data-config was written before these keys existed, and that page must behave
      exactly as it did rather than render zero cottages. */
  function cfgNum(config, key, fallback) {
    var n = config && Number(config[key]);
    return (n && isFinite(n) && n > 0) ? Math.floor(n) : fallback;
  }

  var WEIGHT_HARD = {
    party: 'party34', workspace: 'desk', moreroom: 'moreroom', fewerstairs: 'ground', pet: 'pet',
    studio: 'studio', onebed: 'onebed', dining: 'dining4', pullout: 'pullout', screenedporch: 'porch'
  };

  function criteriaFromState(state) {
    // With the switch off, party must not reach the engine by ANY route — not a
    // stale answer, not a shared ?party=34 / ?w_party=3 link, not state left over
    // from before the flip. Neutralising it here, where both wizards turn into
    // criteria, is what makes that true once rather than in each caller. It is
    // also what stops the match reasons firing: labels.js derives partyOn from
    // crit.wParty and crit.hard, so with neither able to carry party the party
    // reason cannot show AND the pull-out reason stops being suppressed by it
    // (the 0.23.0 "read the couch once, not twice" rule has nothing to suppress
    // when nobody can ask for 3-4). labels.js needs no switch of its own.
    var on34 = guest34On(state.config);
    if (state.mode === 'weights') {
      var w = state.weights;
      // High priorities become must-haves (they narrow the count + results);
      // Medium/Low stay soft ranking weights.
      var whard = [];
      Object.keys(WEIGHT_HARD).forEach(function (g) {
        if (g === 'party' && !on34) { return; }
        if (Number(w[g]) === 3) { whard.push(WEIGHT_HARD[g]); }
      });
      return {
        hard: whard, rotation: state.rotation,
        wDesk: w.workspace, wSpace: w.moreroom, wFewerStairs: w.fewerstairs, wPet: w.pet,
        wStudio: w.studio, wOneBed: w.onebed, wDining: w.dining, wPullout: w.pullout,
        wScreenedPorch: w.screenedporch, wParty: on34 ? w.party : 0
      };
    }
    // Quick finder: every SPECIFIC want narrows the count + results. Each positive /
    // specific answer becomes a hard filter; 'No', 'No preference' ('either') and unset
    // ('') impose no constraint. The wX weights still rank the survivors.
    var q = state.quick;
    var hard = [];
    if (on34 && String(q.party) === '34') { hard.push('party34'); }
    if (q.desk === 'yes') { hard.push('desk'); }
    if (q.pullout === 'yes') { hard.push('pullout'); }
    if (q.layout === 'studio') { hard.push('studio'); }
    if (q.layout === 'onebed') { hard.push('onebed'); }
    // No dining filter (0.53.0): the question was removed, and any dining answer
    // still sitting in state (an old link, a stale object) is ignored HERE, at the
    // boundary the engine sees, not just hidden from the wizard.
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
      // on34 gates the RANKING weight as well as the hard filter above: a stale
      // ?party=34 link sets both, and leaving this one live kept the party match
      // reason firing with the switch off (caught by intercepting the criteria
      // reaching the engine — the result list alone looked unchanged).
      wParty: (on34 && String(q.party) === '34') ? 2 : 0
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

  // The wizard's questions (party size + the meaningful differences), in natural
  // order. Each option is [stringKey, value]; the last is always 'either', shown as
  // "Skip" since 0.53.0 and still meaning no preference: it imposes no filter.
  // THE RENDERED COUNT IS NOT FIXED — two entries are conditional, so don't
  // reason from the length of this array. Nine entries live here: the dates step
  // renders only when a widget enables availability, and the party step only
  // while the site-wide 3-4 guest switch is on. Seven render by default; six
  // with that switch off. wizardTrack() is the only thing that knows. (The dining
  // question left in 0.53.0: only two cottages seat four, and not roomily.)
  var YND = [['opt_yes', 'yes'], ['opt_no', 'no'], ['opt_either', 'either']];
  var WIZARD_QUESTIONS = [
    // kind:'dates' renders two date inputs instead of chips (see renderDatesStep).
    // Only present when the widget enables availability.
    { group: 'dates', kind: 'dates', qKey: 'q_dates', shortKey: 'dates_short', opts: [] },
    { group: 'party', qKey: 'q_party', shortKey: 'party_short', opts: [['opt_party2', '2'], ['opt_party34', '34'], ['opt_either', 'either']] },
    { group: 'desk', qKey: 'q_desk', shortKey: 'diff_desk', opts: YND },
    { group: 'pullout', qKey: 'q_pullout', shortKey: 'diff_pulloutCouch', opts: YND },
    { group: 'layout', qKey: 'q_layout', shortKey: 'diff_layoutType', opts: [['opt_studio', 'studio'], ['opt_onebed', 'onebed'], ['opt_either', 'either']] },
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
        questions: WEIGHT_QUESTIONS.filter(function (q) {
          return q.group !== 'party' || guest34On(state.config);
        }),
        get: function (q) { return state.weights[q.group]; },
        set: function (q, v) { state.weights[q.group] = Number(v); },
        isAnswered: function (q) { return Number(state.weights[q.group]) > 0; },
        qLabel: function (q) { return fmt(S.w_question, S[q.shortKey]); },
        shortLabel: function (q) { return S[q.shortKey]; },
        valueLabel: function (q, v) { return wLevelLabel(v, S); }
      };
    }
    return {
      // Two steps are conditional. The dates step only exists when the widget
      // turns availability on; the party step only while the site-wide 3-4 guest
      // switch is on. Dropping the party step here takes its capacity note and
      // its review row with it, and a party answer stored before the switch
      // flipped simply stops being rendered rather than breaking anything.
      questions: WIZARD_QUESTIONS.filter(function (q) {
        if (q.kind === 'dates') { return availOn(state.config); }
        if (q.group === 'party') { return guest34On(state.config); }
        return true;
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
  /** Presentation only: a note that is EXACTLY two sentences renders each on its
      own line. The capacity sentence pair collided mid-line at every width
      measured (320/375/768/1280), so the two ran together as one block of prose.
      The STRING is never touched — no newline goes into the literal, and it stays
      a single Config value so it can match the same sentence in the checkout
      plugin character for character.

      Guarded to exactly two parts. A translation with no ". " (Japanese, say) or
      one whose abbreviation yields three or more parts falls through to a single
      block, which is precisely the behaviour before this existed. A literal space
      sits between the two spans so textContent still reads as the original
      sentence for assistive tech and for copy-paste; whitespace between two
      block-level boxes is collapsed and never painted. */
  function noteSentences(text) {
    var parts = text.split('. ');
    return parts.length === 2 ? [parts[0] + '.', parts[1]] : null;
  }

  /** A paragraph of copy. Rob's alignment rule (0.54.0): titles centre, and only a
      MULTI-sentence paragraph is left-aligned — so it is classed here, from its
      text, rather than by which string it happens to be. */
  function isMulti(text) { return /[.!?]["\u201D']?\s+\S/.test(String(text == null ? '' : text)); }
  function para(cls, text) {
    var c = (cls ? cls + ' ' : '') + (isMulti(text) ? 'dccs-multi' : '');
    return '<p' + (c.trim() ? ' class="' + c.trim() + '"' : '') + '>' + esc(text) + '</p>';
  }

  function questionNote(config, group) {
    var S = config.strings;
    var text = '', url = '';
    if (group === 'party') { text = S.capacity_note || ''; url = config.capacityFeeUrl || ''; }
    if (group === 'pet') { text = S.pet_note || ''; url = config.petFeeUrl || ''; }
    if (!text) { return ''; }
    var link = url ? ' <a class="dccs-q-note-link" href="' + esc(safeUrl(url)) + '">' + esc(S.fee_link) + '</a>' : '';
    var two = noteSentences(text);
    if (two) {
      // The optional fee link stays with the closing sentence, where it was.
      return '<p class="dccs-q-note dccs-multi">' +
        '<span class="dccs-q-note-s">' + esc(two[0]) + '</span> ' +
        '<span class="dccs-q-note-s">' + esc(two[1]) + link + '</span>' +
        '</p>';
    }
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
    var n = matchN(res);
    // The ticker shows only when the last answer changed the count, so it plays as
    // answers narrow the field and is gone on the next step.
    var tick = (typeof state.lastN === 'number' && state.lastN !== n) ? ticker(state.lastN, n) : '';
    state.lastN = n;

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
    html += '<span class="dccs-count">' + esc(matchCount(S, n)) + tick + '</span></div>';
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
      case 'petAllowed': return c.petAllowed ? (S.val_pet_yes || S.val_yes) : S.val_no;
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
    // 0.54.0 (Rob, pick 3): each cottage is a compact photo card, and the WHOLE card
    // is the label of its (visually hidden) checkbox — tap anywhere to choose it.
    // The selected look (2px ring, ✓ badge) follows input:checked in CSS, so it is
    // right the instant the box changes, before any re-render.
    var list = config.cottages.map(function (c) { return miniCard(c, config, st, { select: true }); }).join('');

    // The "Compare N Cottages" button exists only once 2+ are ticked (0.53.0, Rob's
    // pick): a button that cannot do anything yet is noise. It sits BELOW the list,
    // so appearing pushes later content down but never moves the list. The live
    // region announces it (see announce()). It reuses .dccs-open-compare so the
    // existing click handler opens the shared popup. The Matching Quiz's own
    // compare button (compareButton) is separate and unchanged.
    var canCompare = n >= 2;
    // The "pick 2" tip is opt-in (it duplicates the subheader above the list).
    // Strict === true so a missing key — old placed instances, mirrored snapshots
    // published before the switch existed — reads as off.
    var note = (canCompare || config.showCompareTip !== true)
      ? '' : '<p class="dccs-compare-note">' + esc(S.compare_need_two) + '</p>';
    var btn = (canCompare || note) ? '<div class="dccs-compare-actions">' +
      (canCompare ? '<button type="button" class="dccs-open-compare">' + esc(fmt(S.compare_btn, n)) + '</button>' : '') +
      note + '</div>' : '';

    // The subheader is ONE sentence since 0.53.0 (Rob): the "scroll the list to see
    // all N cottages" cue that used to continue it was dropped, string and all.
    // The list scrolls internally; an always-visible custom scrollbar (.dccs-cmp-bar,
    // positioned by wireCmpScrollbar) sits on its right edge so guests can see there's
    // more to scroll — reliable even on iOS, where native scrollbars auto-hide.
    var scroller = '<div class="dccs-cmp-scroller">' +
      '<div class="dccs-cmp-list dccs-cmp-static" role="group" aria-label="' + esc(S.compare_prompt) + '">' + list + '</div>' +
      '<div class="dccs-cmp-bar" aria-hidden="true"><div class="dccs-cmp-bar-thumb"></div></div></div>';
    return '<div class="dccs-compare">' + para('dccs-hint', S.compare_prompt) +
      scroller + btn + '</div>';
  }

  /** The "Compare N cottages" button, shown once 2+ cards are ticked. */
  function compareButton(config, st) {
    var n = st.compareIds.length;
    if (n < 2) { return ''; }
    return '<button type="button" class="dccs-open-compare">' + esc(fmt(config.strings.compare_btn, n)) + '</button>';
  }

  /** "Cottage 22:" over "The Boathouse": the name format split at its first colon,
      the same split the compare table's column headers use. */
  function nameParts(config, c) {
    var title = cname(config, c);
    var ci = title.indexOf(':');
    return ci === -1 ? ['', title] : [title.slice(0, ci), title.slice(ci + 1).trim()];
  }

  /** Chips on a compact card, from the cottage's own data in the badge wording:
      Sleeps N; Ground Floor or Upstairs; Studio or 1-Bedroom; and Pet-Friendly on
      the cottage that allows pets. */
  function cardChips(c, S) {
    var out = [];
    if (c.guests) { out.push(fmt(S.chip_sleeps, c.guests)); }
    out.push(DCCS.score.isGround(c) ? S.badge_ground : S.badge_upstairs);
    out.push(c.layoutType === 'Studio' ? S.opt_studio : S.opt_onebed);
    if (c.petAllowed) { out.push(S.badge_pet); }
    return out.filter(Boolean);
  }

  /** The cottage's View link. Opens in a new tab and says so only to assistive tech
      (0.51.0); used by the big cards AND the compact ones so the two cannot drift. */
  function viewLink(c, config, cls, inner) {
    var S = config.strings;
    return '<a class="' + cls + '" href="' + esc(safeUrl(c.pageUrl)) + '" target="_blank" rel="noopener"' +
      ' aria-label="' + esc(S.view_cottage + ': ' + cname(config, c) + ' ' + S.opens_new_tab) + '">' + inner + '</a>';
  }

  /**
   * The compact photo card (0.54.0): photo, centred number and name, chips, View
   * Cottage. `opt.select` makes the WHOLE card a <label> for a visually hidden real
   * checkbox (Compare Mode): a tap anywhere on it toggles, and the View link — an
   * interactive child — navigates without toggling (a label never activates its
   * control for a click on a link inside it). `opt.other` fades a non-match.
   */
  function miniCard(c, config, st, opt) {
    var S = config.strings;
    opt = opt || {};
    var np = nameParts(config, c);
    var photo = c.photo && c.photo.src
      ? '<img class="dccs-mcard-img" src="' + esc(c.photo.src) + '"' +
        (c.photo.srcset ? ' srcset="' + esc(c.photo.srcset) + '" sizes="(min-width: 900px) 170px, 72vw"' : '') +
        (c.photo.w && c.photo.h ? ' width="' + esc(c.photo.w) + '" height="' + esc(c.photo.h) + '"' : '') +
        ' alt="" loading="lazy" decoding="async">'
      : '<span class="dccs-mcard-img dccs-mcard-noimg" aria-hidden="true">' + esc(c.id) + '</span>';
    var body = '<span class="dccs-mcard-photo">' + photo +
        (opt.select ? '<span class="dccs-mcard-check" aria-hidden="true"></span>' : '') + '</span>' +
      '<span class="dccs-mcard-title">' +
        (np[0] ? '<span class="dccs-mcard-num">' + esc(np[0]) + '</span>' : '') +
        '<span class="dccs-mcard-name">' + esc(np[1]) + '</span></span>' +
      '<span class="dccs-mcard-chips">' + cardChips(c, S).map(function (t) {
        return '<span class="dccs-mcard-chip">' + esc(t) + '</span>';
      }).join('') + '</span>' +
      viewLink(c, config, 'dccs-mcard-view', esc(S.view_cottage));
    var cls = 'dccs-mcard' + (opt.other ? ' is-other' : '') + (opt.select ? ' is-select' : '') +
      (st.highlight && String(st.highlight) === String(c.id) ? ' is-highlight' : '');
    if (opt.select) {
      var on = st.compareIds.indexOf(String(c.id)) !== -1;
      return '<label class="' + cls + '" data-id="' + esc(c.id) + '">' +
        '<input type="checkbox" class="dccs-mcard-input" data-cmp="' + esc(c.id) + '"' + (on ? ' checked' : '') +
        ' aria-label="' + esc(cname(config, c)) + '">' +
        '<span class="dccs-mcard-body">' + body + '</span></label>';
    }
    return '<div class="' + cls + '" data-id="' + esc(c.id) + '"><span class="dccs-mcard-body">' + body + '</span></div>';
  }

  /** The swipe row: every cottage, matches first in rank order, the rest after them
      (faded), so no cottage is ever out of reach. Snaps as it scrolls; from 900px it
      shows four and the 44px ‹ › page four at a time (trackpads still swipe). */
  function swipeRow(config, st, first, firstAreMatches) {
    var S = config.strings;
    var seen = {};
    var items = [];
    first.forEach(function (c) { seen[c.id] = 1; items.push(miniCard(c, config, st, { other: !firstAreMatches })); });
    config.cottages.forEach(function (c) { if (!seen[c.id]) { items.push(miniCard(c, config, st, { other: true })); } });
    return '<div class="dccs-swipe">' +
      '<button type="button" class="dccs-swipe-prev" aria-label="' + esc(S.cmp_prev) + '" disabled>‹</button>' +
      '<div class="dccs-swipe-track" role="list">' +
        items.map(function (h) { return '<div class="dccs-swipe-item" role="listitem">' + h + '</div>'; }).join('') +
      '</div>' +
      '<button type="button" class="dccs-swipe-next" aria-label="' + esc(S.cmp_next) + '">›</button></div>';
  }

  /** "N Cottages Match" (navy) + the "8 -> N" ticker, from the ONE count. */
  function matchPill(config, n) {
    var total = config.cottages.length;
    return '<p class="dccs-match-pill"><span class="dccs-match-pill-n">' + esc(matchCount(config.strings, n)) + '</span>' +
      (n < total ? ticker(total, n) : '') + '</p>';
  }

  /** "See All": today's full cards, below the row, behind a disclosure button. */
  function seeAll(config, st, inner) {
    var id = (st.uid || 'dccs') + '-all';
    var open = !!st.seeAll;
    return '<button type="button" class="dccs-see-all" aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="' + esc(id) + '">' +
      esc(config.strings.see_all) + '<span class="dccs-caret" aria-hidden="true">▾</span></button>' +
      '<div class="dccs-all" id="' + esc(id) + '"' + (open ? '' : ' hidden') + '>' + inner + '</div>';
  }

  function renderResults(config, st, ctx) {
    var S = config.strings;
    var crit = ctx && ctx.crit ? ctx.crit : criteriaFromState(st);
    var res = ctx && ctx.res ? ctx.res : DCCS.score.run(config.cottages, crit);
    var n = matchN(res);
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
      var fb = fallback ? DCCS.score.dedupe(fallback.results.slice(0, cfgNum(config, 'resultsCount', 3)), config.diffFields) : [];
      html += '<div class="dccs-empty"><h3 class="dccs-step-q" tabindex="-1">' + esc(S.empty_heading) + '</h3>' +
        para('', fb.length === 1 ? S.empty_sub_one : S.empty_sub) + '</div>';
      html += matchPill(config, 0);
      // Nothing matches, so every card is faded — the closest options lead.
      html += swipeRow(config, st, fallback ? fallback.results : [], false);
      var fbCards = '';
      fb.forEach(function (c) { fbCards += buildCard(c, config, st, crit, '', missTags(c, crit, S), fb.length >= 2); });
      html += seeAll(config, st, fbCards);
      html += wizardResultsTail(config, st, true);
      html += '</div>';
      return html;
    }

    var ranked = res.results;
    var top, order;
    if (st.avail.status === 'ok') {
      // Availability re-orders but NEVER removes. Free matches fill the top three;
      // then any cottage that WOULD have made the top three on merit but is booked
      // is appended, clearly marked, so a guest can still see the one they'd have
      // loved and change dates for it. Sinking it out of view would be exactly the
      // silent dead end this feature exists to prevent.
      var byId = st.avail.byId;
      var isBooked = function (c) { return byId[c.id] === 'booked'; };
      var nTop = cfgNum(config, 'resultsCount', 3);
      var free = ranked.filter(function (c) { return !isBooked(c); }).slice(0, nTop);
      var missed = ranked.slice(0, nTop).filter(function (c) {
        return isBooked(c) && free.indexOf(c) === -1;
      });
      top = free.concat(missed);
      // The row: free matches first, booked ones after, nothing dropped.
      order = ranked.filter(function (c) { return !isBooked(c); }).concat(ranked.filter(isBooked));
    } else {
      top = ranked.slice(0, cfgNum(config, 'resultsCount', 3));
      order = ranked;
    }
    html += '<div class="dccs-results-head"><h3 class="dccs-results-h" tabindex="-1">' + esc(S.results_heading) + '</h3></div>';
    html += matchPill(config, n);
    html += availNote(config, st, top);
    html += swipeRow(config, st, order, true);

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

    // Dedupe over the DISPLAYED set, not the scored one (0.40.0). The note
    // describes what is on screen, so the highlighted card has to be part of the
    // comparison: with it left out, a guest deep-linked to one twin could see
    // both twins — one in the top three, the other as the ranked extra — and
    // neither would say they were identical. Which twin landed where depends on
    // the daily tie-break rotation, so the note appeared or vanished by the day.
    // dedupe() only annotates and never reorders, so passing the union here does
    // not disturb the order the cards are rendered in below.
    DCCS.score.dedupe(extra ? top.concat([extra.c]) : top, config.diffFields);

    var showCmp = (top.length + (extra ? 1 : 0)) >= 2;

    var big = '';
    top.forEach(function (c) { big += buildCard(c, config, st, crit, '', null, showCmp); });

    // Always surface the highlighted cottage even if it didn't make the top
    // three — showing its rank makes its positioning clear.
    if (extra) {
      big += buildCard(extra.c, config, st, crit, fmt(S.rank_label, extra.rank), null, showCmp);
    }
    // Today's big cards are the "See All" view (0.54.0, Rob).
    html += seeAll(config, st, big);

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
      html += '<div class="dccs-badges">' + badges.slice(0, cfgNum(config, 'badgesMax', 3)).map(function (b) {
        return '<span class="dccs-badge">' + esc(b) + '</span>';
      }).join('') + '</div>';
    }

    var reasons = DCCS.labels.whyFits(c, crit, cfgNum(config, 'reasonsMax', 3))
      .map(function (k) { return S['why_' + k]; }).filter(Boolean);
    if (reasons.length) {
      // No heading since 0.36.0: the paragraph carries itself.
      html += '<p class="dccs-why">' + esc(S.why_lead) + ' ' +
        esc(joinList(reasons)) + '.</p>';
    }

    // Owner-supplied per-cottage facts (data/cottages.json "highlights") — short
    // lines, rendered verbatim; the data file is the only permitted source.
    if (c.highlights && c.highlights.length) {
      html += '<ul class="dccs-highlights">' + c.highlights.map(function (h) {
        return '<li>' + esc(h) + '</li>';
      }).join('') + '</ul>';
    }

    // One note per group, identical on every tile in it, naming every member by
    // NUMBER. joinList gives "35 & 36" and "31, 32 & 35". dedupe only marks
    // groups of two or more, so there is no one-member case to render.
    if (c.duplicateGroup && c.duplicateGroup.length > 1) {
      html += '<p class="dccs-dup">' + esc(fmt(S.dup_note, joinList(c.duplicateGroup))) + '</p>';
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
      // Opens in a new tab (0.51.0) so the guest keeps their results. The notice
      // lives in the aria-label because an explicit aria-label replaces the link's
      // content as its accessible name; the visible label is unchanged.
      viewLink(c, config, 'dccs-view', withIcon(config, 'view', 'view', viewLabel(S))) +
      cmpToggle +
      '</div></div>';
    return html;
  }

  /** Update the screen-reader live region with the current step / match summary. */
  function announce(live, config, state, res) {
    var S = config.strings;
    res = res || DCCS.score.run(config.cottages, criteriaFromState(state));
    var n = matchN(res);
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
      head = '<div class="dccs-head"><h2 class="dccs-heading">' + esc(S.heading) + '</h2>' +
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
      Hidden when only one mode is enabled. The button shows the CURRENT mode; the
      menu lists ONLY the other modes (0.53.0, Rob) — offering the mode you are
      already in is a choice that does nothing. So the items are plain menuitems,
      not a radio set: there is no "checked" one to announce. */
  function modeSelect(config, state, S) {
    var modes = config.enabledModes || ['quick', 'weights', 'compare'];
    if (!modes || modes.length <= 1) { return ''; }
    var current = S[MODE_LABEL[state.mode]] || state.mode;
    var opts = modes.filter(function (m) { return m !== state.mode; }).map(function (m) {
      return '<button type="button" role="menuitem" class="dccs-modetab" data-mode="' + esc(m) + '">' +
        esc(S[MODE_LABEL[m]] || m) + '</button>';
    }).join('');
    // The accessible name says it is the current mode and contains the visible
    // label word for word (WCAG 2.5.3); aria-haspopup/expanded say it opens a menu.
    var name = S.mode_current ? fmt(S.mode_current, current) : current;
    // The open/close state lives on the DOM (is-open class), not in app state, so
    // re-renders triggered by other actions don't fight the toggle.
    return '<div class="dccs-modeselect">' +
      '<button type="button" class="dccs-modeselect-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="' + esc(name) + '">' +
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
    state.uid = root.dataset.dccsUid;   // ids for aria-controls

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
      // A re-render rebuilds the scrollers; keep where the guest had scrolled them
      // (ticking a card in Compare Mode re-renders, and must not jump the list).
      var keepScroll = ['.dccs-cmp-list', '.dccs-swipe-track'].map(function (sel) {
        var sc = root.querySelector(sel); return sc ? [sel, sc.scrollTop, sc.scrollLeft] : null;
      }).filter(Boolean);
      renderSelector(root, config, state, { crit: crit, res: res });
      keepScroll.forEach(function (k) {
        var sc = root.querySelector(k[0]); if (sc) { sc.scrollTop = k[1]; sc.scrollLeft = k[2]; }
      });
      root.appendChild(live);
      announce(live, config, state, res);
      wireCmpScrollbar(root);
      wireSwipe(root);
      if (key) { var keep = root.querySelector(key); if (keep && keep.focus) { keep.focus(); } }
    }

    // The swipe row's ‹ › (shown from 900px): enabled only when there is somewhere
    // to go. Writes happen on scroll, never inside a touch, and only when the value
    // actually changes (idempotent), so a re-render cannot fight a swipe.
    function wireSwipe(r) {
      var track = r.querySelector('.dccs-swipe-track');
      if (!track) { return; }
      var prev = r.querySelector('.dccs-swipe-prev'), next = r.querySelector('.dccs-swipe-next');
      function sync() {
        var max = track.scrollWidth - track.clientWidth;
        var p = track.scrollLeft <= 1, q = track.scrollLeft >= max - 1;
        if (prev && prev.disabled !== p) { prev.disabled = p; }
        if (next && next.disabled !== q) { next.disabled = q; }
      }
      track.addEventListener('scroll', sync, { passive: true });
      sync();
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
        // 44px minimum (0.54.0): the thumb is something guests drag.
        var th = Math.max(44, Math.round(trackH * ratio));
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
    rerender();

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
      st.seeAll = false; st.lastN = undefined;
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
      // --- swipe row paging (from 900px): four cards at a time ---
      if (cl.contains('dccs-swipe-prev') || cl.contains('dccs-swipe-next')) {
        var trk = root.querySelector('.dccs-swipe-track');
        if (!trk || t.disabled) { return; }
        var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var by = (cl.contains('dccs-swipe-next') ? 1 : -1) * trk.clientWidth;
        if (trk.scrollBy) { trk.scrollBy({ left: by, behavior: still ? 'auto' : 'smooth' }); } else { trk.scrollLeft += by; }
        return;
      }
      // --- "See All": today's big cards, as a disclosure (no re-render needed) ---
      if (cl.contains('dccs-see-all')) {
        state.seeAll = !state.seeAll;
        var panel = root.querySelector('.dccs-all');
        if (panel) { panel.hidden = !state.seeAll; }
        t.setAttribute('aria-expanded', state.seeAll ? 'true' : 'false');
        return;
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
        state.config = config; state.uid = root.dataset.dccsUid;
        cmpSave(root, []);
        rerender(); focusStep(); return;
      }
    });

    // Close either dropdown when pressing outside it (a press fires before any
    // click-driven re-render, so the live target can be inspected safely).
    // POINTERDOWN, not mousedown (0.53.3): iOS Safari sends the compatibility
    // mouse events only for elements it treats as clickable, so a tap on blank
    // page left the menu open. Pointer events fire for every touch. mousedown
    // remains only as the fallback for a browser with no PointerEvent.
    // Self-removing: initSelector runs on every Mini-Entry pop-up open, so a
    // permanent document listener per init would accumulate; once this widget's
    // root leaves the DOM (pop-up closed), the handler unhooks itself.
    var downEvt = window.PointerEvent ? 'pointerdown' : 'mousedown';
    document.addEventListener(downEvt, function onDocDown(e) {
      if (!document.documentElement.contains(root)) {
        document.removeEventListener(downEvt, onDocDown);
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
  /**
   * @param {string} label   accessible name for the dialog
   * @param {string} [title] optional VISIBLE title, rendered in the header row
   *
   * The close button lives in a real header row above the scroll area, not
   * absolutely positioned over it (0.35.0). It used to be pinned 8px from the
   * modal BOX's right edge — but the element that scrolls is .dccs-modal-content,
   * a child filling that box, so a classic scrollbar takes the outer ~15px of the
   * same edge and the button landed on top of it. Measured: the button's right
   * edge at 1012 inside a band running 1005-1020. Invisible on overlay scrollbars,
   * which is why it shipped. A header row removes the overlap by construction
   * instead of by arithmetic, and keeps the title from scrolling out of view.
   */
  function buildOverlay(trigger, label, mount, title) {
    var head = '<div class="dccs-modal-head">' +
      (title ? '<h2 class="dccs-modal-title">' + esc(title) + '</h2>' : '<span></span>') +
      '<button type="button" class="dccs-modal-close" aria-label="Close">' +
      // An SVG cross, not the × character: font-family is inherit here, so the
      // glyph's size depended on whichever face the theme happened to serve. The
      // × measured 19x13 of ink in a 44px button — 43% wide but only 29.5% tall,
      // which is what read as a small mark in a big circle. Two lines on a 24
      // viewBox at 19px render square and ~43% of the button in both directions.
      '<svg class="dccs-modal-x" viewBox="0 0 24 24" width="19" height="19" ' +
      'aria-hidden="true" focusable="false">' +
      '<path d="M5 5 L19 19 M19 5 L5 19" fill="none" stroke="currentColor" ' +
      'stroke-width="2.6" stroke-linecap="round"/></svg>' +
      '</button></div>';
    var overlay = el('<div class="dccs-modal" role="dialog" aria-modal="true" aria-label="' + esc(label || '') + '"><div class="dccs-modal-box">' +
      head + '<div class="dccs-modal-content"></div></div></div>');
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
      // An Escape the widget already handled (closing the open mode menu calls
      // preventDefault) is not also a request to close the pop-up: until 0.53.0
      // one press closed the menu AND the whole pop-up.
      if (e.key === 'Escape') { if (!e.defaultPrevented) { close(); } return; }
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
    var title = config.strings.compare_title || config.strings.mode_compare;
    var o = buildOverlay(trigger, title, null, title);
    var start = 0;
    function paint() {
      // Wrap in a ready-marked .dccs-root so the scoped styles + CSS vars apply
      // (data-dccs-ready stops bootAll from trying to initialize this shell).
      o.content.innerHTML = '<div class="dccs-root dccs-in-modal" data-dccs-ready="1">' +
        '<div class="dccs-compare dccs-compare-modal">' +
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
