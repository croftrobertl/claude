/**
 * Dora Canal Cottage Selector — front-end controller.
 *
 * Boots every .dccs-root (full selector) and .dccs-entry (cross-sell mini-entry)
 * on the page. Manages state, deeplink parsing, the three modes (Quick Pick /
 * What Matters Most / Compare), live results, and the same-page modal. All copy
 * comes from config.strings; this file holds no business-logic display strings.
 */
(function (window, document) {
  'use strict';

  var DCCS = window.DCCS = window.DCCS || {};
  var STORE_KEY = 'dccs_prefs_v1';
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

  /** Allow only http(s), root-relative, or fragment URLs in hrefs. */
  function safeUrl(u) {
    u = String(u == null ? '' : u);
    return /^(https?:\/\/|\/|#|\.\/|\.\.\/)/i.test(u) ? u : '#';
  }

  /** A stable selector for the focused control, used to restore focus on re-render. */
  function focusKey(a) {
    if (!a || !a.classList) { return null; }
    if (a.classList.contains('dccs-tab')) { return '.dccs-tab[data-mode="' + a.dataset.mode + '"]'; }
    if (a.classList.contains('dccs-chip')) { return '.dccs-chip[data-group="' + a.dataset.group + '"][data-value="' + a.dataset.value + '"]'; }
    if (a.classList.contains('dccs-seg')) { return '.dccs-seg[data-weight="' + a.dataset.weight + '"][data-value="' + a.dataset.value + '"]'; }
    if (a.classList.contains('dccs-pick')) { return '.dccs-pick[data-cmp="' + a.dataset.cmp + '"]'; }
    if (a.classList.contains('dccs-see-results')) { return '.dccs-see-results'; }
    if (a.classList.contains('dccs-reset')) { return '.dccs-reset'; }
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
    // All quick answers default to 'either' ("Doesn't matter") so nothing is a
    // constraint until the guest deliberately chooses it.
    var quick = { desk: 'either', pullout: 'either', layout: 'either', dining: 'either', pet: 'either', ground: 'either', largest: 'either' };
    if (config.presetQuick) { Object.keys(config.presetQuick).forEach(function (k) { quick[k] = config.presetQuick[k]; }); }
    return {
      mode: config.startMode || 'quick',
      quick: quick,
      weights: { workspace: 1, moreroom: 1, fewerstairs: 1, pet: 1, studio: 1, onebed: 1, dining: 1, pullout: 1 },
      compareIds: (config.preCompare || []).slice(0, 4).map(String),
      highlight: config.highlight || '',
      // Wizard navigation: question index + stage ('q' | 'review' | 'results').
      step: 0,
      stage: 'q'
    };
  }

  /** Soft Quick-Pick preferences that describe a given cottage (no hard filters,
      so every cottage stays rankable and the guest sees full positioning). */
  function derivePresetQuick(c) {
    return {
      desk: c.desk ? 'yes' : 'either',
      pullout: c.pulloutCouch ? 'yes' : 'either',
      layout: c.layoutType === 'Studio' ? 'studio' : 'onebed',
      largest: Number(c.squareFeet) >= 400 ? 'yes' : 'no'
    };
  }

  var LVL = { low: 1, medium: 2, high: 3, '1': 1, '2': 2, '3': 3 };

  /** Initialize state: defaults < saved (localStorage) < deeplink (URL). */
  function buildState(config) {
    var state = defaultState(config);

    if (config.remember) {
      try {
        var saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || 'null');
        if (saved && typeof saved === 'object') { deepMerge(state, saved); }
      } catch (e) { /* ignore */ }
    }

    applyDeeplink(state, config);
    if (config.enabledModes && config.enabledModes.indexOf(state.mode) === -1) {
      state.mode = config.enabledModes[0];
    }

    // If the guest already has criteria (a deep link, a remembered search, or a
    // mini-entry pre-fill), skip the questionnaire and jump straight to results.
    var hasCriteria = !!state.highlight || !!config.presetQuick ||
      Object.keys(state.quick).some(function (k) { return state.quick[k] !== 'either'; });
    if (hasCriteria) { state.stage = 'results'; }
    state.step = 0;
    return state;
  }

  function deepMerge(target, src) {
    Object.keys(src).forEach(function (k) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && target[k]) {
        deepMerge(target[k], src[k]);
      } else {
        target[k] = src[k];
      }
    });
  }

  var TRUE = { 'true': 1, '1': 1, 'yes': 1, 'on': 1 };

  function applyDeeplink(state, config) {
    var p = new URLSearchParams(window.location.search);
    if (!p.toString() && !config.highlight) { return; }

    if (p.get('mode')) { state.mode = p.get('mode'); }
    if (p.has('pet')) { state.quick.pet = TRUE[p.get('pet')] ? 'yes' : 'either'; }
    if (p.has('ground')) { state.quick.ground = TRUE[p.get('ground')] ? 'yes' : 'either'; }
    if (p.has('largest')) { state.quick.largest = TRUE[p.get('largest')] ? 'yes' : 'either'; }
    if (p.has('desk')) { state.quick.desk = normYesNoLevel(p.get('desk')); }
    if (p.has('pullout')) { state.quick.pullout = normYesNoLevel(p.get('pullout')); }
    if (p.has('layout')) { state.quick.layout = p.get('layout'); }
    if (p.has('dining')) { state.quick.dining = p.get('dining') === '4' ? 4 : (p.get('dining') === '2' ? 2 : 'either'); }
    if (p.has('compare')) { state.compareIds = p.get('compare').split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4); }

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

  function persist(config, state) {
    if (config.remember) {
      try {
        // highlight is per-visit context (mini-entry / deep link); never remember it.
        var toSave = { mode: state.mode, quick: state.quick, weights: state.weights, compareIds: state.compareIds };
        window.localStorage.setItem(STORE_KEY, JSON.stringify(toSave));
      } catch (e) { /* ignore */ }
    }
    syncUrl(state);
  }

  var LVL_NAME = { 1: 'low', 2: 'medium', 3: 'high' };

  function syncUrl(state) {
    if (!window.history || !window.history.replaceState) { return; }
    var p = new URLSearchParams();
    p.set('mode', state.mode);
    if (state.mode === 'weights') {
      Object.keys(state.weights).forEach(function (k) {
        if (Number(state.weights[k]) !== 1) { p.set('w_' + k, LVL_NAME[state.weights[k]] || String(state.weights[k])); }
      });
    } else {
      if (state.quick.pet === 'yes') { p.set('pet', 'true'); }
      if (state.quick.ground === 'yes') { p.set('ground', 'true'); }
      if (state.quick.largest === 'yes') { p.set('largest', 'true'); }
      if (state.quick.desk === 'yes') { p.set('desk', 'yes'); }
      if (state.quick.pullout === 'yes') { p.set('pullout', 'yes'); }
      if (state.quick.layout !== 'either') { p.set('layout', state.quick.layout); }
      if (state.quick.dining !== 'either') { p.set('dining', String(state.quick.dining)); }
    }
    if (state.mode === 'compare' && state.compareIds.length) { p.set('compare', state.compareIds.join(',')); }
    if (state.highlight) { p.set('highlight', state.highlight); }
    try { window.history.replaceState(null, '', window.location.pathname + '?' + p.toString()); } catch (e) { /* ignore */ }
  }

  /* ---------- criteria translation ---------- */

  function criteriaFromState(state) {
    if (state.mode === 'weights') {
      var w = state.weights;
      return {
        hardPet: false, hardGround: false, hardDining4: false, wantLargest: false,
        wDesk: w.workspace, wSpace: w.moreroom, wFewerStairs: w.fewerstairs, wPet: w.pet,
        wStudio: w.studio, wOneBed: w.onebed, wDining: w.dining, wPullout: w.pullout
      };
    }
    // Quick Pick: hard filters + medium-weight soft preferences.
    var q = state.quick;
    return {
      hardPet: q.pet === 'yes',
      hardGround: q.ground === 'yes',
      hardDining4: q.dining === 4 || q.dining === '4',
      wantLargest: q.largest === 'yes',
      wDesk: q.desk === 'yes' ? 2 : 0,
      wPullout: q.pullout === 'yes' ? 2 : 0,
      wSpace: q.largest === 'yes' ? 2 : 0,
      wStudio: q.layout === 'studio' ? 2 : 0,
      wOneBed: q.layout === 'onebed' ? 2 : 0,
      wDining: 0, wPet: 0, wFewerStairs: 0
    };
  }

  /* ---------- rendering ---------- */

  function chip(text, value, group, active) {
    return '<button type="button" class="dccs-chip' + (active ? ' is-active' : '') +
      '" role="radio" aria-checked="' + (active ? 'true' : 'false') +
      '" tabindex="' + (active ? '0' : '-1') +
      '" data-group="' + esc(group) + '" data-value="' + esc(value) + '">' + esc(text) + '</button>';
  }

  // The wizard's 7 questions (the spec's seven differences), in natural order.
  // Each option is [stringKey, value]; the last is always "Doesn't matter".
  var YND = [['opt_yes', 'yes'], ['opt_no', 'no'], ['opt_either', 'either']];
  var WIZARD_QUESTIONS = [
    { group: 'desk', qKey: 'q_desk', shortKey: 'diff_desk', opts: YND },
    { group: 'pullout', qKey: 'q_pullout', shortKey: 'diff_pulloutCouch', opts: YND },
    { group: 'layout', qKey: 'q_layout', shortKey: 'diff_layoutType', opts: [['opt_studio', 'studio'], ['opt_onebed', 'onebed'], ['opt_either', 'either']] },
    { group: 'dining', qKey: 'q_dining', shortKey: 'diff_diningSeats', opts: [['opt_seats2', '2'], ['opt_seats4', '4'], ['opt_either', 'either']] },
    { group: 'pet', qKey: 'q_pet', shortKey: 'diff_petAllowed', opts: YND },
    { group: 'ground', qKey: 'q_ground', shortKey: 'diff_floorLevel', opts: YND },
    { group: 'largest', qKey: 'q_largest', shortKey: 'short_largest', opts: YND }
  ];

  function answerLabel(q, value, S) {
    for (var i = 0; i < q.opts.length; i++) {
      if (String(q.opts[i][1]) === String(value)) { return S[q.opts[i][0]]; }
    }
    return S.opt_either;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /** Dispatch the wizard by stage: questionnaire → review → results. */
  function renderWizard(config, state) {
    if (state.stage === 'review') { return renderReview(config, state); }
    if (state.stage === 'results') { return renderResults(config, state); }
    return renderWizardStep(config, state);
  }

  function renderWizardStep(config, state) {
    var S = config.strings;
    var qs = WIZARD_QUESTIONS;
    var i = clamp(state.step | 0, 0, qs.length - 1);
    var q = qs[i];
    var value = state.quick[q.group];

    var res = DCCS.score.run(config.cottages, criteriaFromState(state));
    var n = res.empty ? 0 : res.results.length;
    var pct = Math.round(((i + 1) / qs.length) * 100);

    var chips = q.opts.map(function (o) {
      return chip(S[o[0]], o[1], q.group, String(value) === String(o[1]));
    }).join('');

    var html = '<div class="dccs-wizard" data-stage="q">';
    html += '<div class="dccs-progress-row">' +
      '<span class="dccs-progress-label">' + esc(fmt2(S.wiz_progress, i + 1, qs.length)) + '</span>' +
      '<span class="dccs-count">' + esc(fmt(S.match_count, n)) + '</span></div>';
    html += '<div class="dccs-progress" role="presentation"><span style="width:' + pct + '%"></span></div>';
    html += '<h3 class="dccs-step-q" tabindex="-1">' + esc(S[q.qKey]) + '</h3>';
    html += '<div class="dccs-chips dccs-chips-wizard" role="radiogroup" aria-label="' + esc(S[q.qKey]) + '">' + chips + '</div>';
    html += '<div class="dccs-wizard-nav">';
    if (i > 0) { html += '<button type="button" class="dccs-back">' + esc(S.wiz_back) + '</button>'; }
    html += '</div></div>';
    return html;
  }

  function renderReview(config, state) {
    var S = config.strings;
    var html = '<div class="dccs-review"><h3 class="dccs-step-q" tabindex="-1">' + esc(S.review_heading) + '</h3><ul class="dccs-review-list">';
    WIZARD_QUESTIONS.forEach(function (q, i) {
      html += '<li><span class="dccs-review-q">' + esc(S[q.shortKey]) + '</span>' +
        '<span class="dccs-review-a">' + esc(answerLabel(q, state.quick[q.group], S)) + '</span>' +
        '<button type="button" class="dccs-edit" data-step="' + i + '">' + esc(S.edit) + '</button></li>';
    });
    html += '</ul><div class="dccs-wizard-nav">' +
      '<button type="button" class="dccs-see-matches dccs-primary">' + esc(S.see_matches) + '</button>' +
      '<button type="button" class="dccs-reset">' + esc(S.reset) + '</button></div></div>';
    return html;
  }

  /** Compact recap of the active (non-"Doesn't matter") criteria. */
  function renderRecap(config, state) {
    var S = config.strings;
    var parts = WIZARD_QUESTIONS.filter(function (q) { return state.quick[q.group] !== 'either'; })
      .map(function (q) { return esc(S[q.shortKey]) + ': ' + esc(answerLabel(q, state.quick[q.group], S)); });
    if (!parts.length) { return ''; }
    return '<div class="dccs-recap"><strong>' + esc(S.your_criteria) + ':</strong> ' + parts.join(' · ') + '</div>';
  }

  /** Hard-requirement tags a fallback cottage fails to meet. */
  function missTags(c, crit, S) {
    var t = [];
    if (crit.hardPet && !c.petAllowed) { t.push(S.tag_pet); }
    if (crit.hardGround && !DCCS.score.isGround(c)) { t.push(S.tag_upstairs); }
    if (crit.hardDining4 && Number(c.diningSeats) < 4) { t.push(S.tag_dining); }
    return t;
  }

  function renderWeights(S, st) {
    var rows = [
      ['workspace', S.w_workspace], ['moreroom', S.w_moreroom], ['fewerstairs', S.w_fewerstairs],
      ['pet', S.w_pet], ['studio', S.w_studio], ['onebed', S.w_onebed],
      ['dining', S.w_dining], ['pullout', S.w_pullout]
    ];
    var levels = [[1, S.lvl_low], [2, S.lvl_med], [3, S.lvl_high]];
    var html = '<div class="dccs-weights"><p class="dccs-hint">' + esc(S.w_intro) + '</p>';
    rows.forEach(function (r) {
      var key = r[0], cur = st.weights[key];
      var seg = levels.map(function (l) {
        var on = Number(cur) === l[0];
        return '<button type="button" class="dccs-seg' + (on ? ' is-active' : '') +
          '" role="radio" aria-checked="' + (on ? 'true' : 'false') +
          '" tabindex="' + (on ? '0' : '-1') +
          '" data-weight="' + esc(key) + '" data-value="' + l[0] + '">' + esc(l[1]) + '</button>';
      }).join('');
      html += '<div class="dccs-wrow"><div class="dccs-wlabel">' + esc(r[1]) + '</div>' +
        '<div class="dccs-seg-group" role="radiogroup" aria-label="' + esc(r[1]) + '">' + seg + '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function diffValue(c, field, S) {
    switch (field) {
      case 'squareFeet': return fmt(S.val_sqft, c.squareFeet);
      case 'diningSeats': return fmt(S.val_seats, c.diningSeats);
      case 'desk': return c.desk ? S.val_yes : S.val_no;
      case 'pulloutCouch': return c.pulloutCouch ? S.val_yes : S.val_no;
      case 'petAllowed': return c.petAllowed ? S.val_yes : S.val_no;
      case 'floorLevel': return DCCS.score.isGround(c) ? S.floor_ground : S.floor_second;
      case 'layoutType': return c.layoutType === 'Studio' ? S.opt_studio : S.opt_onebed;
      default: return c[field];
    }
  }

  function renderCompare(config, st) {
    var S = config.strings, cottages = config.cottages;
    var picker = cottages.map(function (c) {
      var on = st.compareIds.indexOf(String(c.id)) !== -1;
      return '<button type="button" class="dccs-pick' + (on ? ' is-active' : '') +
        '" aria-pressed="' + (on ? 'true' : 'false') + '" data-cmp="' + esc(c.id) + '">' + esc(c.name) + '</button>';
    }).join('');

    var html = '<div class="dccs-compare"><p class="dccs-hint">' + esc(S.compare_prompt) + '</p>' +
      '<div class="dccs-picker">' + picker + '</div>';

    var sel = st.compareIds.map(function (id) { return findCottage(config, id); }).filter(Boolean);
    if (sel.length >= 2) {
      html += '<div class="dccs-matrix-wrap"><table class="dccs-matrix"><thead><tr><th></th>';
      sel.forEach(function (c) { html += '<th>' + esc(c.name) + '</th>'; });
      html += '</tr></thead><tbody>';
      (config.diffFields || []).forEach(function (field) {
        var vals = sel.map(function (c) { return String(diffValue(c, field, S)); });
        var allSame = vals.every(function (v) { return v === vals[0]; });
        html += '<tr><th scope="row">' + esc(S['diff_' + field] || field) + '</th>';
        sel.forEach(function (c, i) {
          html += '<td class="' + (allSame ? '' : 'is-diff') + '">' + esc(vals[i]) + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
    return html;
  }

  function renderResults(config, st) {
    var S = config.strings;
    var crit = criteriaFromState(st);
    var res = DCCS.score.run(config.cottages, crit);
    var html = '<div class="dccs-results">';

    if (res.empty) {
      // Find a single hard-filter relaxation that yields matches (relax the
      // least-essential constraint first), and show those closest options.
      var relaxOrder = [['hardDining4', 'diff_diningSeats'], ['hardGround', 'diff_floorLevel'], ['hardPet', 'diff_petAllowed']];
      var fallback = null, relaxedName = '';
      for (var i = 0; i < relaxOrder.length; i++) {
        if (!crit[relaxOrder[i][0]]) { continue; }
        var c2 = {};
        Object.keys(crit).forEach(function (k) { c2[k] = crit[k]; });
        c2[relaxOrder[i][0]] = false;
        var r2 = DCCS.score.run(config.cottages, c2);
        if (!r2.empty) { fallback = r2; relaxedName = S[relaxOrder[i][1]] || ''; break; }
      }
      html += '<div class="dccs-empty"><h3 class="dccs-step-q" tabindex="-1">' + esc(S.empty_heading) + '</h3>' +
        '<p>' + esc(fmt(S.empty_relax, relaxedName)) + '</p></div>';
      if (fallback) {
        var fb = DCCS.score.dedupe(fallback.results.slice(0, 3), config.diffFields);
        fb.forEach(function (c) { html += buildCard(c, config, st, crit, '', missTags(c, crit, S)); });
      }
      html += wizardResultsTail(config, st);
      html += '</div>';
      return html;
    }

    var ranked = res.results;
    var top = DCCS.score.dedupe(ranked.slice(0, 3), config.diffFields);
    html += '<h3 class="dccs-results-h" tabindex="-1">' + esc(S.results_heading) + '</h3>';

    top.forEach(function (c) { html += buildCard(c, config, st, crit, ''); });

    // Always surface the highlighted cottage (mini-entry / deep link), even if it
    // didn't make the top three — showing its rank makes its positioning clear.
    if (st.highlight) {
      var inTop = top.some(function (c) { return String(c.id) === String(st.highlight); });
      if (!inTop) {
        var hc = findCottage(config, st.highlight);
        var idx = ranked.map(function (c) { return String(c.id); }).indexOf(String(st.highlight));
        if (hc && idx !== -1) {
          html += buildCard(hc, config, st, crit, fmt(S.rank_label, idx + 1));
        }
      }
    }

    if (res.excluded.length) {
      html += '<details class="dccs-excluded"><summary>' + esc(S.excluded_toggle) + '</summary><ul>';
      res.excluded.forEach(function (x) {
        var c = findCottage(config, x.id);
        if (c) { html += '<li>' + esc(fmt(S[x.reasonKey] || '%s', c.name)) + '</li>'; }
      });
      html += '</ul></details>';
    }

    html += wizardResultsTail(config, st);
    html += '</div>';
    return html;
  }

  /** Recap + edit/start-over controls shown under results in the wizard flow. */
  function wizardResultsTail(config, st) {
    if (st.mode !== 'quick') { return ''; }
    var S = config.strings;
    return renderRecap(config, st) +
      '<div class="dccs-wizard-nav">' +
      '<button type="button" class="dccs-edit-answers">' + esc(S.edit_answers) + '</button>' +
      '<button type="button" class="dccs-reset">' + esc(S.reset) + '</button></div>';
  }

  function buildCard(c, config, st, crit, rankLabel, miss) {
    var S = config.strings;
    var isHi = st.highlight && String(st.highlight) === String(c.id);
    var html = '<div class="dccs-card' + (isHi ? ' is-highlight' : '') + '">';
    html += '<div class="dccs-card-head"><h4>' + esc(c.name) +
      (rankLabel ? ' <span class="dccs-rank">' + esc(rankLabel) + '</span>' : '') + '</h4></div>';

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

    if (c.duplicateOf) {
      var other = findCottage(config, c.duplicateOf);
      if (other) { html += '<p class="dccs-dup">' + esc(fmt(S.dup_note, other.name)) + '</p>'; }
    }

    html += '<div class="dccs-card-actions">' +
      '<a class="dccs-view" href="' + esc(safeUrl(c.pageUrl)) + '">' + esc(S.view_cottage) + '</a>' +
      '<label class="dccs-cmp-toggle"><input type="checkbox" data-cmp="' + esc(c.id) + '"' +
      (st.compareIds.indexOf(String(c.id)) !== -1 ? ' checked' : '') + '> ' + esc(S.add_compare) + '</label>' +
      '</div></div>';
    return html;
  }

  /** Update the screen-reader live region with the current step / match summary. */
  function announce(live, config, state) {
    var S = config.strings;
    if (state.mode === 'quick' && state.stage === 'q') {
      var qs = WIZARD_QUESTIONS;
      var i = clamp(state.step | 0, 0, qs.length - 1);
      var r = DCCS.score.run(config.cottages, criteriaFromState(state));
      live.textContent = fmt2(S.wiz_progress, i + 1, qs.length) + '. ' + S[qs[i].qKey] + '. ' +
        fmt(S.match_count, r.empty ? 0 : r.results.length);
      return;
    }
    if (state.mode === 'compare') { live.textContent = ''; return; }
    var res = DCCS.score.run(config.cottages, criteriaFromState(state));
    var n = res.empty ? 0 : res.results.length;
    var msg = fmt(S.match_count, n);
    if (!res.empty && res.results[0]) { msg += '. ' + fmt(S.sr_top_match, res.results[0].name); }
    live.textContent = msg;
  }

  function ledgerField(reasonKey) {
    return { ex_pet: 'petAllowed', ex_upstairs: 'floorLevel', ex_dining: 'diningSeats' }[reasonKey] || 'squareFeet';
  }

  function joinList(arr) {
    if (arr.length <= 1) { return arr.join(''); }
    return arr.slice(0, -1).join(', ') + ' & ' + arr[arr.length - 1];
  }

  /* ---------- selector instance ---------- */

  function renderSelector(root, config, state) {
    var S = config.strings;
    var headFull = config.showHeading === false ? '' :
      '<div class="dccs-head"><h2 class="dccs-heading">' + esc(S.heading) + '</h2>' +
      '<p class="dccs-intro">' + esc(S.intro) + '</p></div>';
    var headCompact = config.showHeading === false ? '' :
      '<div class="dccs-head dccs-head-compact"><h2 class="dccs-heading">' + esc(S.heading) + '</h2></div>';

    if (state.mode === 'quick') {
      // On a question step keep the header compact so the step fits the viewport.
      var head = state.stage === 'q' ? headCompact : headFull;
      root.innerHTML = head + renderWizard(config, state) + moreRow(config, S);
      return;
    }

    // Weights / Compare — secondary modes reached via "More options".
    var body = state.mode === 'weights' ? renderWeights(S, state) : renderCompare(config, state);
    var results = state.mode === 'compare' ? '' : renderResults(config, state);
    var back = '<div class="dccs-more"><button type="button" class="dccs-to-finder">' + esc(S.to_finder) + '</button></div>';
    root.innerHTML = headFull + back + '<div class="dccs-body">' + body + '</div>' + results;
  }

  function moreRow(config, S) {
    var modes = config.enabledModes || ['quick', 'weights', 'compare'];
    var links = '';
    if (modes.indexOf('weights') !== -1) { links += '<button type="button" class="dccs-to-mode" data-mode="weights">' + esc(S.opt_weights) + '</button>'; }
    if (modes.indexOf('compare') !== -1) { links += '<button type="button" class="dccs-to-mode" data-mode="compare">' + esc(S.opt_compare) + '</button>'; }
    if (!links) { return ''; }
    return '<div class="dccs-more"><span class="dccs-more-label">' + esc(S.more_options) + '</span>' + links + '</div>';
  }

  function initSelector(root) {
    if (root.dataset.dccsReady) { return; }
    var config;
    try { config = JSON.parse(root.dataset.config || '{}'); } catch (e) { return; }
    if (!config.cottages || !config.cottages.length) { return; }
    root.dataset.dccsReady = '1';
    if (!root.dataset.dccsUid) { root.dataset.dccsUid = 'dccs' + (++UID); }

    var state = buildState(config);

    // Persistent screen-reader live region — kept across re-renders (re-appended,
    // not recreated) so aria-live actually announces result changes.
    var live = document.createElement('div');
    live.className = 'dccs-sr-only';
    live.setAttribute('aria-live', 'polite');

    // Re-render, preserving keyboard focus across the innerHTML swap.
    function rerender() {
      var key = root.contains(document.activeElement) ? focusKey(document.activeElement) : null;
      renderSelector(root, config, state);
      root.appendChild(live);
      announce(live, config, state);
      if (key) { var keep = root.querySelector(key); if (keep && keep.focus) { keep.focus(); } }
    }
    rerender();

    // After a wizard navigation, move focus to the new step/results heading so
    // keyboard and screen-reader users follow the flow.
    function focusStep() {
      var h = root.querySelector('.dccs-step-q, .dccs-results-h');
      if (h && h.focus) { h.focus(); }
    }

    root.addEventListener('click', function (e) {
      var t = e.target.closest('button, a');
      if (!t || !root.contains(t)) { return; }
      var cl = t.classList;

      // --- wizard answer chip: set value, then auto-advance ---
      if (cl.contains('dccs-chip')) {
        state.quick[t.dataset.group] = coerce(t.dataset.value);
        if (state.mode === 'quick' && state.stage === 'q') {
          if ((state.step | 0) >= WIZARD_QUESTIONS.length - 1) { state.stage = 'review'; }
          else { state.step = (state.step | 0) + 1; }
          persist(config, state); rerender(); focusStep(); return;
        }
        persist(config, state); rerender(); return;
      }
      // --- wizard navigation ---
      if (cl.contains('dccs-back')) {
        state.stage = 'q'; state.step = Math.max(0, (state.step | 0) - 1);
        rerender(); focusStep(); return;
      }
      if (cl.contains('dccs-edit')) {
        state.stage = 'q'; state.step = clamp(Number(t.dataset.step) || 0, 0, WIZARD_QUESTIONS.length - 1);
        rerender(); focusStep(); return;
      }
      if (cl.contains('dccs-see-matches')) {
        state.stage = 'results'; persist(config, state); rerender(); focusStep(); return;
      }
      if (cl.contains('dccs-edit-answers')) {
        state.stage = 'review'; rerender(); focusStep(); return;
      }
      // --- mode switching (More options) ---
      if (cl.contains('dccs-to-mode')) {
        state.mode = t.dataset.mode; persist(config, state); rerender(); return;
      }
      if (cl.contains('dccs-to-finder')) {
        state.mode = 'quick'; persist(config, state); rerender(); return;
      }
      // --- secondary modes ---
      if (cl.contains('dccs-seg')) {
        state.weights[t.dataset.weight] = Number(t.dataset.value); persist(config, state); rerender(); return;
      }
      if (cl.contains('dccs-pick')) {
        toggleCompare(state, t.dataset.cmp); persist(config, state); rerender(); return;
      }
      // --- reset (Start over) ---
      if (cl.contains('dccs-reset')) {
        state = defaultState(config);
        try { window.localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
        persist(config, state); rerender(); focusStep(); return;
      }
    });

    // Compare checkboxes inside result cards.
    root.addEventListener('change', function (e) {
      var cb = e.target;
      if (cb && cb.matches('input[type="checkbox"][data-cmp]')) {
        toggleCompare(state, cb.dataset.cmp); persist(config, state); rerender();
      }
    });

    // Arrow-key navigation for tabs and radio groups (WAI-ARIA roving focus).
    root.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t || !t.classList) { return; }
      var isTab = t.classList.contains('dccs-tab');
      var isRadio = t.getAttribute && t.getAttribute('role') === 'radio';
      if (!isTab && !isRadio) { return; }
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].indexOf(e.key) === -1) { return; }
      e.preventDefault();
      var group;
      if (isTab) {
        group = Array.prototype.slice.call(root.querySelectorAll('.dccs-tab'));
      } else {
        var rg = t.closest('[role="radiogroup"]');
        group = rg ? Array.prototype.slice.call(rg.querySelectorAll('[role="radio"]')) : [t];
      }
      var idx = group.indexOf(t);
      if (idx === -1) { return; }
      var dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
      // Move focus only (don't activate) — activation is Enter/Space/tap. This
      // keeps arrow keys from auto-advancing the wizard.
      group[(idx + dir + group.length) % group.length].focus();
    });

    // Fire a CustomEvent so themes/analytics can observe (no hardcoded provider).
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
    else if (state.compareIds.length < 4) { state.compareIds.push(id); }
  }

  /* ---------- mini-entry + modal ---------- */

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
      openModal(entry, btn);
    });
  }

  function openModal(entry, trigger) {
    var config = entry.modalConfig;
    if (!config) { return; }

    // Open in Quick Pick with soft preferences derived from this cottage and the
    // cottage highlighted, so the guest sees exactly how it ranks vs the others.
    var current = findCottageIn(config.cottages, entry.current);
    config.startMode = 'quick';
    config.remember = false; // a contextual pop-up must not overwrite saved prefs
    config.highlight = String(entry.current);
    if (current) { config.presetQuick = derivePresetQuick(current); }

    var overlay = el('<div class="dccs-modal" role="dialog" aria-modal="true"><div class="dccs-modal-box">' +
      '<button type="button" class="dccs-modal-close" aria-label="Close">&times;</button>' +
      '<div class="dccs-root dccs-root dccs-in-modal"></div></div></div>');

    var inner = overlay.querySelector('.dccs-root');
    inner.dataset.config = JSON.stringify(config);
    initSelector(inner);            // sets data-dccs-ready before insertion
    document.body.appendChild(overlay);

    // Lock background scroll while the modal is open.
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus management: move focus in, trap Tab, restore on close.
    var prevFocus = document.activeElement;
    var closeBtn = overlay.querySelector('.dccs-modal-close');
    if (closeBtn) { closeBtn.focus(); }

    function focusables() {
      return Array.prototype.slice.call(overlay.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    }
    function close() {
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (trigger && trigger.focus) { trigger.focus(); }
      else if (prevFocus && prevFocus.focus) { prevFocus.focus(); }
    }
    function onKey(e) {
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
  }

  function findCottageIn(list, id) {
    for (var i = 0; i < (list || []).length; i++) { if (String(list[i].id) === String(id)) { return list[i]; } }
    return null;
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
  if (window.MutationObserver && document.body) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) { bootAll(document); break; }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  DCCS.bootAll = bootAll;
})(window, document);
