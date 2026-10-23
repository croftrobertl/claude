/**
 * DCC Custom Checkout — the guest count while it is still "— Select —".
 *
 * Loaded on the guest checkout (before checkout.js) and on WP-Admin's Add New
 * Booking (v0.34.1). Both screens draw MotoPress's own checkout form with the
 * same guest chooser, mphb_room_details[N][adults], and MotoPress's own script
 * prices both. Kept in ONE file so the two screens cannot drift apart.
 *
 * 1. "Price for 2 meanwhile" (B1, v0.34.0; moved here from checkout.js in
 *    0.34.1, unchanged). MotoPress re-prices over admin-ajax
 *    (mphb_update_checkout_info, GET, formValues = the serialised form) at
 *    load and on guest-chooser / rate / service changes, and its server
 *    refuses a room whose adults is below 1 — "Please select the number of
 *    guests." on this site — leaving the breakdown as it was. So while a
 *    room's count is unchosen, ONLY those two price questions are asked for
 *    the included guests, never more than that room's chooser offers.
 *
 *    DONE IN THE BROWSER, NOT ON THE SERVER, deliberately: rewriting the
 *    request needs only what the page can see — the action name and a
 *    parameter that carries the chooser's own field name. Doing it on the
 *    server would mean relying on how MotoPress's AJAX handler parses
 *    formValues, which has not been read. The booking itself (REST POST
 *    /mphb/v1/checkout or /mphb/v1/checkout/admin, a FormData body) never
 *    matches, so what was chosen — including "nothing yet" — is exactly what
 *    is submitted, and MotoPress still refuses a booking with no count.
 *    Fails safe: a request whose shape this cannot read is sent as it was,
 *    which is MotoPress's own behaviour; administrators get a console note.
 *
 * 2. The browser's own message on the chooser (0.34.1, Director). The chooser
 *    is `required`, so pressing the booking button with no count is stopped
 *    by the browser, with its generic "Please select an item in the list.".
 *    That check stays; only its WORDS change, to the site's "Please select
 *    the number of guests.". The message is set at a submit attempt (a click,
 *    before the browser validates, and the `invalid` event as a belt), and
 *    cleared when a count is chosen — so it can only ever appear after a
 *    submit attempt, and a select that is NOT required is never given one
 *    (that would ADD a check MotoPress does not make).
 *    setCustomValidity() is a property write: no DOM mutation, no timer, so
 *    the checkout's tap rules are untouched.
 *
 * All configuration arrives via the localized `DCC_GUEST_COUNT` object, read
 * when it is needed — never at load.
 */
(function () {
    'use strict';

    function cfg() {
        return window.DCC_GUEST_COUNT || {};
    }

    var RECALC_ACTIONS = ['mphb_update_checkout_info', 'mphb_update_rate_prices'];

    // The room guest-count dropdowns, by decreasing precision — the same
    // tries checkout.js makes. Never a service's own "for N" select, and
    // never a control this plugin draws (dcc_…).
    function choosers() {
        var tries = [
            cfg().guestsSelector || 'select[name^="mphb_room_details"][name*="[adults]"]',
            'select.mphb_sc_checkout-guests-chooser',
            'select.mphb_checkout-guests-chooser',
            '.mphb-adults-chooser select'
        ];
        for (var i = 0; i < tries.length; i++) {
            var found;
            try {
                found = Array.prototype.slice.call(document.querySelectorAll(tries[i]));
            } catch (_) {
                continue;
            }
            found = found.filter(function (s) {
                var n = String(s.name || '');
                return s.tagName === 'SELECT' && n.indexOf('[services]') === -1 && n.indexOf('dcc_') !== 0;
            });
            if (found.length) {
                return found;
            }
        }
        return [];
    }

    function isChooser(el) {
        return !!el && choosers().indexOf(el) !== -1;
    }

    /* ---- 1. The price questions ------------------------------------------ */

    function decodePart(str) {
        try { return decodeURIComponent(String(str).replace(/\+/g, ' ')); } catch (_) { return String(str); }
    }

    function nameSegments(name) {
        return String(name).replace(/\]/g, '').split('[');
    }

    // Highest selectable count on this chooser (a disabled option is not on
    // offer — checkout.js disables 3 and 4 when Guests 3 and 4 are off).
    function maxOptionValue(sel) {
        var max = 0;
        Array.prototype.forEach.call(sel.options, function (opt) {
            if (opt.disabled) { return; }
            var v = parseInt(opt.value, 10) || 0;
            if (v > max) { max = v; }
        });
        return max;
    }

    // The provisional count for an unchosen room: the included guests, never
    // above what that room's chooser offers.
    function provisionalAdults(sel) {
        var inc = Number(cfg().includedGuests) > 0 ? Number(cfg().includedGuests) : 2;
        var max = maxOptionValue(sel);
        return max > 0 ? Math.min(inc, max) : inc;
    }

    // Which room's guest chooser does this request parameter carry? Only a
    // parameter whose name ENDS WITH the chooser's own field name
    // (formValues[mphb_room_details][0][adults] for mphb_room_details[0][adults]),
    // or — with a single room on the page — any [adults] parameter outside
    // a services branch. An extra-guest service's "for N" ([services][j][adults])
    // is never a guest count.
    function chooserForParam(param, list) {
        var segs = nameSegments(param);
        if (segs[segs.length - 1] !== 'adults' || segs.indexOf('services') !== -1) {
            return null;
        }
        for (var i = 0; i < list.length; i++) {
            var own = nameSegments(list[i].name);
            if (own.length <= segs.length &&
                segs.slice(segs.length - own.length).join('\u0001') === own.join('\u0001')) {
                return list[i];
            }
        }
        return list.length === 1 ? list[0] : null;
    }

    // A query string (URL part or urlencoded body). Returned unchanged unless
    // it is one of the two price questions AND carries an empty count for a
    // room whose chooser is still unchosen.
    function rewriteRecalcQuery(query) {
        var parts = String(query).split('&');
        var action = '';
        parts.forEach(function (p) {
            var i = p.indexOf('=');
            if (i > 0 && decodePart(p.slice(0, i)) === 'action') { action = decodePart(p.slice(i + 1)); }
        });
        if (RECALC_ACTIONS.indexOf(action) === -1) {
            return query;
        }
        var list = choosers();
        var unchosen = list.filter(function (s) { return String(s.value) === ''; });
        if (!unchosen.length) {
            return query;
        }
        var changed = false;
        var out = parts.map(function (p) {
            var i = p.indexOf('=');
            if (i <= 0 || decodePart(p.slice(i + 1)) !== '') { return p; }
            var sel = chooserForParam(decodePart(p.slice(0, i)), list);
            if (!sel || String(sel.value) !== '') { return p; }
            changed = true;
            return p.slice(0, i + 1) + provisionalAdults(sel);
        });
        if (!changed) {
            adminConsole('A price recalculation (' + action + ') was sent while a guest count ' +
                'is unchosen, but no empty guest count could be found in it, so it went as it was.');
            return query;
        }
        return out.join('&');
    }

    function armRecalcCount() {
        var X = window.XMLHttpRequest;
        if (!X || !X.prototype || X.prototype.dccRecalcArmed) {
            return;
        }
        var open = X.prototype.open;
        var send = X.prototype.send;
        X.prototype.open = function (method, url) {
            var args = Array.prototype.slice.call(arguments);
            try {
                var u = String(url);
                var q = u.indexOf('?');
                if (q !== -1) {
                    var hash = u.indexOf('#', q);
                    var query = hash === -1 ? u.slice(q + 1) : u.slice(q + 1, hash);
                    var next = rewriteRecalcQuery(query);
                    if (next !== query) {
                        args[1] = u.slice(0, q + 1) + next + (hash === -1 ? '' : u.slice(hash));
                    }
                }
            } catch (_) { /* never stand between MotoPress and its request */ }
            return open.apply(this, args);
        };
        X.prototype.send = function (body) {
            var args = Array.prototype.slice.call(arguments);
            if (typeof body === 'string') {
                try { args[0] = rewriteRecalcQuery(body); } catch (_) { args[0] = body; }
            }
            return send.apply(this, args);
        };
        X.prototype.dccRecalcArmed = true;
    }

    /* ---- 2. The browser's message on the chooser -------------------------- */

    // The site's words for a required chooser left on "— Select —"; nothing
    // for one with a count, or one that is not required.
    function refreshMessage(sel) {
        if (!sel || typeof sel.setCustomValidity !== 'function') { return; }
        var msg = (sel.required && String(sel.value) === '')
            ? String((cfg().i18n || {}).guestsRequired || '')
            : '';
        // Compare first: a select that is not in customError already says ''.
        var current = sel.validity && sel.validity.customError ? sel.validationMessage : '';
        if (current !== msg) {
            sel.setCustomValidity(msg);
        }
    }

    function refreshAll() {
        choosers().forEach(refreshMessage);
    }

    function armMessage() {
        if (document.dccGuestMessageArmed) {
            return;
        }
        document.dccGuestMessageArmed = true;
        // A submit attempt: the click on a submit control comes BEFORE the
        // browser validates (Enter in a field clicks the default button too).
        document.addEventListener('click', function (e) {
            var el = e.target && e.target.closest
                ? e.target.closest('input[type="submit"], button')
                : null;
            if (el && el.type === 'submit' && el.form) {
                refreshAll();
            }
        }, true);
        // A submit with no click (requestSubmit): the belt. Fires before the
        // browser shows its message.
        document.addEventListener('invalid', function (e) {
            if (isChooser(e.target)) { refreshMessage(e.target); }
        }, true);
        // A count chosen clears it. Only clears: a change never SETS the
        // message, so picking "— Select —" again says nothing until the next
        // submit attempt.
        document.addEventListener('change', function (e) {
            var sel = e.target;
            if (isChooser(sel) && sel.validity && sel.validity.customError && String(sel.value) !== '') {
                sel.setCustomValidity('');
            }
        }, true);
    }

    // Console only, administrators only: a diagnostic, never a message.
    function adminConsole(msg) {
        if (!cfg().isAdmin) { return; }
        try { window.console && console.info('DCC Custom Checkout: ' + msg); } catch (_) {}
    }

    // Installed NOW, while the page is still loading, so the wrapper is in
    // place before MotoPress's own script asks for its first price.
    armRecalcCount();
    armMessage();
})();
