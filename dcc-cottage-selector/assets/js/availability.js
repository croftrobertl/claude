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
