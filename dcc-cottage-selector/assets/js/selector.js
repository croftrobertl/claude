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

  function findCottage(config, id) {
    var list = config.cottages || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) { return list[i]; }
    }
    return null;
  }

  /* ---------- state ---------- */

  function defaultState(config) {
    var quick = { desk: 'either', pullout: 'either', layout: 'either', dining: 'either', pet: 'no', ground: 'no', largest: 'no' };
    if (config.presetQuick) { Object.keys(config.presetQuick).forEach(function (k) { quick[k] = config.presetQuick[k]; }); }
    return {
      mode: config.startMode || 'quick',
      quick: quick,
      weights: { workspace: 1, moreroom: 1, fewerstairs: 1, pet: 1, studio: 1, onebed: 1, dining: 1, pullout: 1 },
      compareIds: (config.preCompare || []).slice(0, 4).map(String),
      highlight: config.highlight || ''
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
    if (p.has('pet')) { state.quick.pet = TRUE[p.get('pet')] ? 'yes' : 'no'; }
    if (p.has('ground')) { state.quick.ground = TRUE[p.get('ground')] ? 'yes' : 'no'; }
    if (p.has('largest')) { state.quick.largest = TRUE[p.get('largest')] ? 'yes' : 'no'; }
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
    return TRUE[v] ? 'yes' : (v === 'either' ? 'either' : 'no');
  }

  function persist(config, state) {
    if (config.remember) {
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
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
      if (state.quick.desk !== 'either') { p.set('desk', state.quick.desk); }
      if (state.quick.pullout !== 'either') { p.set('pullout', state.quick.pullout); }
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
      '" data-group="' + esc(group) + '" data-value="' + esc(value) + '">' + esc(text) + '</button>';
  }

  function chipRow(label, group, value, opts) {
    var chips = opts.map(function (o) { return chip(o.t, o.v, group, String(value) === String(o.v)); }).join('');
    return '<div class="dccs-q"><div class="dccs-q-label">' + esc(label) + '</div>' +
      '<div class="dccs-chips" role="radiogroup" aria-label="' + esc(label) + '">' + chips + '</div></div>';
  }

  function renderQuick(S, st) {
    var q = st.quick;
    var yn = [{ t: S.opt_yes, v: 'yes' }, { t: S.opt_no, v: 'no' }];
    var yne = [{ t: S.opt_yes, v: 'yes' }, { t: S.opt_no, v: 'no' }, { t: S.opt_either, v: 'either' }];
    var html = '<div class="dccs-quick">';
    html += chipRow(S.q_desk, 'desk', q.desk, yne);
    html += chipRow(S.q_pullout, 'pullout', q.pullout, yne);
    html += chipRow(S.q_layout, 'layout', q.layout, [{ t: S.opt_studio, v: 'studio' }, { t: S.opt_onebed, v: 'onebed' }, { t: S.opt_either, v: 'either' }]);
    html += chipRow(S.q_dining, 'dining', q.dining, [{ t: S.opt_seats2, v: '2' }, { t: S.opt_seats4, v: '4' }, { t: S.opt_either, v: 'either' }]);
    html += chipRow(S.q_pet, 'pet', q.pet, yn);
    html += chipRow(S.q_ground, 'ground', q.ground, yn);
    html += chipRow(S.q_largest, 'largest', q.largest, yn);
    html += '</div>';
    return html;
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
      var relax = res.excluded.length ? (S['diff_' + ledgerField(res.excluded[res.excluded.length - 1].reasonKey)] || '') : '';
      html += '<div class="dccs-empty"><h3>' + esc(S.empty_heading) + '</h3>' +
        '<p>' + esc(fmt(S.empty_relax, relax)) + '</p></div></div>';
      return html;
    }

    var ranked = res.results;
    var top = DCCS.score.dedupe(ranked.slice(0, 3), config.diffFields);
    html += '<h3 class="dccs-results-h">' + esc(S.results_heading) + '</h3>';

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

    html += '</div>';
    return html;
  }

  function buildCard(c, config, st, crit, rankLabel) {
    var S = config.strings;
    var isHi = st.highlight && String(st.highlight) === String(c.id);
    var html = '<div class="dccs-card' + (isHi ? ' is-highlight' : '') + '">';
    html += '<div class="dccs-card-head"><h4>' + esc(c.name) +
      (rankLabel ? ' <span class="dccs-rank">' + esc(rankLabel) + '</span>' : '') + '</h4></div>';

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
      '<a class="dccs-view" href="' + esc(c.pageUrl) + '">' + esc(S.view_cottage) + '</a>' +
      '<label class="dccs-cmp-toggle"><input type="checkbox" data-cmp="' + esc(c.id) + '"' +
      (st.compareIds.indexOf(String(c.id)) !== -1 ? ' checked' : '') + '> ' + esc(S.add_compare) + '</label>' +
      '</div></div>';
    return html;
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
    var modes = config.enabledModes || ['quick', 'weights', 'compare'];
    var tabs = modes.map(function (m) {
      var label = { quick: S.mode_quick, weights: S.mode_weights, compare: S.mode_compare }[m];
      return '<button type="button" class="dccs-tab' + (state.mode === m ? ' is-active' : '') +
        '" role="tab" aria-selected="' + (state.mode === m ? 'true' : 'false') + '" data-mode="' + m + '">' + esc(label) + '</button>';
    }).join('');

    var head = config.showHeading === false ? '' :
      '<div class="dccs-head"><h2 class="dccs-heading">' + esc(S.heading) + '</h2>' +
      '<p class="dccs-intro">' + esc(S.intro) + '</p></div>';

    var body = state.mode === 'weights' ? renderWeights(S, state)
      : state.mode === 'compare' ? renderCompare(config, state)
      : renderQuick(S, state);

    var results = state.mode === 'compare' ? '' : renderResults(config, state);
    var cta = state.mode === 'compare' ? '' :
      '<div class="dccs-cta-bar"><button type="button" class="dccs-see-results">' + esc(S.see_matches) + '</button></div>';

    root.innerHTML =
      head +
      '<div class="dccs-tabs" role="tablist">' + tabs + '</div>' +
      '<div class="dccs-body">' + body + '</div>' +
      results +
      cta +
      '<div class="dccs-footer"><button type="button" class="dccs-reset">' + esc(S.reset) + '</button></div>';
  }

  function initSelector(root) {
    if (root.dataset.dccsReady) { return; }
    var config;
    try { config = JSON.parse(root.dataset.config || '{}'); } catch (e) { return; }
    if (!config.cottages || !config.cottages.length) { return; }
    root.dataset.dccsReady = '1';

    var state = buildState(config);

    function rerender() { renderSelector(root, config, state); }
    rerender();

    root.addEventListener('click', function (e) {
      var t = e.target.closest('button, a');
      if (!t || !root.contains(t)) { return; }

      if (t.classList.contains('dccs-tab')) {
        state.mode = t.dataset.mode; persist(config, state); rerender(); return;
      }
      if (t.classList.contains('dccs-chip')) {
        state.quick[t.dataset.group] = coerce(t.dataset.value); persist(config, state); rerender(); return;
      }
      if (t.classList.contains('dccs-seg')) {
        state.weights[t.dataset.weight] = Number(t.dataset.value); persist(config, state); rerender(); return;
      }
      if (t.classList.contains('dccs-pick')) {
        toggleCompare(state, t.dataset.cmp); persist(config, state); rerender(); return;
      }
      if (t.classList.contains('dccs-reset')) {
        state = defaultState(config);
        try { window.localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
        persist(config, state); rerender(); return;
      }
      if (t.classList.contains('dccs-see-results')) {
        var res = root.querySelector('.dccs-results');
        if (res && res.scrollIntoView) { res.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        return;
      }
    });

    // Compare checkboxes inside result cards.
    root.addEventListener('change', function (e) {
      var cb = e.target;
      if (cb && cb.matches('input[type="checkbox"][data-cmp]')) {
        toggleCompare(state, cb.dataset.cmp); persist(config, state); rerender();
      }
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
        var q = entry.deeplink || ('highlight=' + encodeURIComponent(entry.current || '') + '&mode=quick');
        var sep = entry.selectorUrl.indexOf('?') === -1 ? '?' : '&';
        window.location.href = entry.selectorUrl + sep + q;
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
    Array.prototype.forEach.call(scope.querySelectorAll('.dccs-root:not([data-dccs-ready])'), initSelector);
    Array.prototype.forEach.call(scope.querySelectorAll('.dccs-entry:not([data-dccs-ready])'), initEntry);
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

  // Catch dynamically inserted widgets.
  if (window.MutationObserver) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) { bootAll(document); break; }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  DCCS.bootAll = bootAll;
})(window, document);
