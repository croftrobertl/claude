/**
 * v0.35.0 — KEEPING A GUEST'S ANSWERS, AND THE WAY BACK IN (item 10, pictures
 * 5 and 9). Loaded for EVERY guest on /submit-booking/, not only the new
 * layout: today a reloaded checkout is a dead end.
 *
 * sessionStorage ONLY. Never localStorage, never a cookie. It holds a name, a
 * phone number and an address, so it must die with the tab.
 *
 * NEVER STORED: the photo ID (identity documents, and a File cannot be
 * serialised anyway — but the skip is explicit so nobody "fixes" it later),
 * the coupon code, the acceptance tick. See SKIP below.
 *
 * TAP RULES (0.18.0, still in force). Every DOM write here happens ONCE, at
 * init: the welcome note and the Continue card are each inserted a single
 * time, and nothing is scheduled, observed or timed. The save path writes only
 * to sessionStorage and touches no node, so typing and tapping record no
 * mutations at all. If this file ever grows a MutationObserver or a timer it
 * must take the same touch gate checkout.js uses.
 */
(function () {
    'use strict';

    var CFG = window.DCC_RESTORE || {};
    var STAY = CFG.stay || {};
    var I18N = CFG.i18n || {};

    /* The store. One version in the key: a shape change must not be read as
       the old shape, and a stale entry is simply never found. */
    var ANSWER_KEY = 'dcc_checkout_answers_v1';
    var STAY_KEY = 'dcc_checkout_stay_v1';

    /* --------------------------------------------------------------------- *
     * Storage, which may not be there at all
     * --------------------------------------------------------------------- */

    /* sessionStorage throws on access in some private modes and can be
       disabled outright. Everything below treats "no storage" as "nothing
       stored", which is exactly today's behaviour. */
    function store() {
        try {
            var s = window.sessionStorage;
            s.getItem(STAY_KEY);
            return s;
        } catch (e) {
            return null;
        }
    }

    function read(key) {
        var s = store();
        if (!s) { return null; }
        try {
            var raw = s.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function write(key, value) {
        var s = store();
        if (!s) { return; }
        try {
            s.setItem(key, JSON.stringify(value));
        } catch (e) {
            /* A full or refusing store is not an error the guest can act on,
               and losing the backup must never break the form in front of
               them. */
        }
    }

    function clearAll() {
        var s = store();
        if (!s) { return; }
        try {
            s.removeItem(ANSWER_KEY);
            s.removeItem(STAY_KEY);
        } catch (e) { /* nothing to do */ }
    }

    /* --------------------------------------------------------------------- *
     * What is saved, and what is never saved
     * --------------------------------------------------------------------- */

    /** The photo ID, the coupon and the acceptance tick are never stored. */
    function skip(el) {
        var type = (el.type || '').toLowerCase();
        var name = el.name || '';

        /* THE PHOTO ID. A File is not serialisable, so this cannot leak the
           image — but the rule is "never written anywhere but the protected
           store", and an explicit skip is what states it. */
        if (type === 'file') { return true; }

        /* Hidden fields are MotoPress's plumbing — nonces, ids, state. Never
           replay them: a stale nonce is worse than no nonce. */
        if (type === 'hidden' || type === 'password' || type === 'submit' || type === 'button') { return true; }

        /* THE COUPON AND THE TICK ARE DECISIONS, not answers. A decision
           restored without the guest making it again is a decision nobody
           made — and the tick is the one this plugin RECORDS (0.30.0). */
        if (/coupon/i.test(name)) { return true; }
        if (/accept_terms|accept-terms/i.test(name)) { return true; }

        /* MONEY. A service checkbox decides what MotoPress charges; it is
           driven by the guest's own answers and by checkout.js, never by a
           restore. Same rule as setDisabled()'s (0.22.0): nothing that
           carries money is touched here. */
        if (/\[services\]/.test(name)) { return true; }
        if (el.classList && el.classList.contains('mphb_sc_checkout-service')) { return true; }

        return false;
    }

    /** Every control whose answer belongs to the guest. */
    function fields(form) {
        var out = [];
        var all = form.querySelectorAll('input[name], select[name], textarea[name]');
        for (var i = 0; i < all.length; i++) {
            if (!skip(all[i])) { out.push(all[i]); }
        }
        return out;
    }

    function snapshot(form) {
        var data = {};
        fields(form).forEach(function (el) {
            var type = (el.type || '').toLowerCase();
            if (type === 'checkbox') {
                data[el.name] = el.checked ? el.value || 'on' : '';
            } else if (type === 'radio') {
                if (el.checked) { data[el.name] = el.value; }
            } else {
                data[el.name] = el.value;
            }
        });
        return data;
    }

    /* --------------------------------------------------------------------- *
     * Putting the answers back
     * --------------------------------------------------------------------- */

    /**
     * Restore, then tell the page what changed.
     *
     * The events are the point: checkout.js opens the guest and dog sections
     * off `change`, and MotoPress re-prices off the guest chooser's `change`.
     * Setting `.value` alone would leave a filled form that nothing had
     * reacted to — the right answers with the wrong sections and the wrong
     * price. Both events are fired, as the dropdown list does (0.34.1).
     *
     * `.value` and `.checked` are PROPERTIES, so no DOM mutation is recorded
     * and the tap rules are untouched.
     */
    function restore(form, data) {
        var changed = 0;
        fields(form).forEach(function (el) {
            if (!Object.prototype.hasOwnProperty.call(data, el.name)) { return; }
            var want = data[el.name];
            var type = (el.type || '').toLowerCase();
            if (type === 'checkbox') {
                var on = want !== '' && want !== false;
                if (el.checked !== on) { el.checked = on; changed++; fire(el); }
                return;
            }
            if (type === 'radio') {
                var mine = el.value === want;
                if (mine && !el.checked) { el.checked = true; changed++; fire(el); }
                return;
            }
            if (want === '' || el.value === want) { return; }
            /* A select can only hold a value it offers. Writing one it does
               not would silently empty the control — worse than leaving the
               guest's own answer absent, because it also loses the default. */
            if (el.tagName === 'SELECT' && !hasOption(el, want)) { return; }
            el.value = want;
            changed++;
            fire(el);
        });
        return changed;
    }

    function hasOption(select, value) {
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === value) { return true; }
        }
        return false;
    }

    function fire(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /* --------------------------------------------------------------------- *
     * The two paths
     * --------------------------------------------------------------------- */

    function theForm() {
        return document.querySelector('form.mphb_sc_checkout-form');
    }

    /** THE FORM IS THERE: keep the answers, and put back any we hold. */
    function withForm(form) {
        var stay = STAY.key ? STAY : null;

        /* Save as the guest types. Delegated, so a field MotoPress re-renders
           is covered without re-binding, and passive-by-nature: it reads
           values and writes storage, never the DOM. */
        var save = function () {
            if (!stay) { return; }
            write(STAY_KEY, stay);
            write(ANSWER_KEY, { key: stay.key, data: snapshot(form) });
        };
        form.addEventListener('input', save);
        form.addEventListener('change', save);

        /* Clear on submit: the answers are the server's now, and a stored
           copy of a completed booking is only a liability. Both the real
           submit and a submit-control press, because MotoPress submits over
           REST and a submit event is not guaranteed (0.15.0). */
        form.addEventListener('submit', clearAll);
        form.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) { return; }
            if (t.closest('[type="submit"], button:not([type="button"])')) { clearAll(); }
        });

        /* Anything held for THIS stay goes back in. A stored answer set for a
           different stay is dropped, not shown: the dates it was typed
           against are gone. */
        var held = read(ANSWER_KEY);
        if (!stay || !held || held.key !== stay.key || !held.data) {
            if (held && stay && held.key !== stay.key) { clearAll(); }
            return;
        }
        if (restore(form, held.data) > 0) {
            welcome(form);
        }
    }

    /** The note above the form, inserted once. */
    function welcome(form) {
        if (document.querySelector('.dcc_checkout-welcome')) { return; }
        var p = document.createElement('p');
        p.className = 'dcc_checkout-welcome';
        p.setAttribute('data-dcc-injected', '1');
        p.setAttribute('role', 'status');
        p.appendChild(document.createTextNode((I18N.welcome || '') + ' '));

        var over = document.createElement('button');
        over.type = 'button';
        over.className = 'dcc_checkout-startover dcc_checkout-bare-button';
        over.appendChild(document.createTextNode(I18N.startOver || 'Start Over'));
        over.addEventListener('click', function () {
            clearAll();
            /* Back to a clean checkout for the same stay: the stored answers
               are gone, so the reload shows the form as MotoPress drew it. */
            window.location.reload();
        });
        p.appendChild(over);

        form.parentNode.insertBefore(p, form);
    }

    /**
     * NO FORM: the dead end. Offer the way back in.
     *
     * The test is the ABSENCE OF THE FORM, never the error's words. The words
     * are MotoPress's, they are translated on this site, and matching text
     * this plugin can see change is how features here have quietly died
     * before. No form means there is nothing to book on this page, whatever
     * it says.
     */
    function withoutForm() {
        var held = read(STAY_KEY);
        var card = document.createElement('section');
        card.className = 'dcc_checkout-continue';
        card.setAttribute('data-dcc-injected', '1');

        if (held && held.roomTypeId && held.checkIn && held.checkOut) {
            card.appendChild(continueCard(held));
        } else {
            card.appendChild(restartCard());
        }

        var host = firstOf([
            /* The wrapper MotoPress really renders on this path (Director,
               live 2026-10-22): the card goes inside it, above the message, so
               the two are one block. */
            '.mphb_sc_checkout-wrapper',
            '.mphb_sc_checkout',
            '.entry-content',
            'main',
            'body',
        ]);
        if (!host) { return; }
        host.insertBefore(card, host.firstChild);
        hideDeadEnd();
    }

    /**
     * The first of these selectors that matches ANYTHING — tried in order.
     *
     * NOT `querySelector('a, b, c')`. A selector list returns the first match
     * in DOCUMENT ORDER, not in the order the selectors are written, so
     * `<body>` wins any list it is in: it is an ancestor of everything else on
     * the page. The original list here read as a preference order and was not
     * one — the card went into <body> every time, with MotoPress's wrapper and
     * the dead-end message left as a sibling below it. Found by asserting
     * which element the card's parent actually was.
     */
    function firstOf(selectors) {
        for (var i = 0; i < selectors.length; i++) {
            var hit = document.querySelector(selectors[i]);
            if (hit) { return hit; }
        }
        return null;
    }

    function heading(level, text) {
        var h = document.createElement(level);
        h.appendChild(document.createTextNode(text || ''));
        return h;
    }

    function para(text) {
        var p = document.createElement('p');
        p.appendChild(document.createTextNode(text || ''));
        return p;
    }

    function continueCard(stay) {
        var frag = document.createDocumentFragment();

        if (stay.photo) {
            var img = document.createElement('img');
            img.className = 'dcc_checkout-continue__photo';
            img.src = stay.photo;
            /* The cottage's name is the only honest alt text here; it is the
               picture's whole content as far as the guest is concerned. */
            img.alt = stay.name || '';
            img.decoding = 'async';
            img.loading = 'eager';
            frag.appendChild(img);
        }

        frag.appendChild(heading('h2', I18N.continueTitle));
        if (stay.name) { frag.appendChild(para(stay.name)); }
        if (stay.dates) {
            var d = para(stay.dates);
            d.className = 'dcc_checkout-continue__dates';
            frag.appendChild(d);
        }
        frag.appendChild(para(I18N.continueLead));

        /* A REAL POST OF THE SAME FIVE FIELDS THE COTTAGE PAGE SENDS, with
           the dates EXACTLY as they were stored. Nothing is recomputed from
           today's date, and no availability is asserted — MotoPress re-checks
           it, as it does for the cottage page. */
        var form = document.createElement('form');
        form.className = 'dcc_checkout-continue__form';
        form.method = 'post';
        form.action = CFG.checkout || '';
        hidden(form, 'mphb_room_type_id', stay.roomTypeId);
        hidden(form, 'mphb_check_in_date', stay.checkIn);
        hidden(form, 'mphb_check_out_date', stay.checkOut);
        var rooms = stay.roomsDetails && typeof stay.roomsDetails === 'object'
            ? stay.roomsDetails : null;
        if (rooms) {
            Object.keys(rooms).forEach(function (id) {
                hidden(form, 'mphb_rooms_details[' + id + ']', rooms[id]);
            });
        } else {
            hidden(form, 'mphb_rooms_details[' + stay.roomTypeId + ']', '1');
        }
        hidden(form, 'mphb_is_direct_booking', '1');

        var go = document.createElement('button');
        go.type = 'submit';
        go.className = 'dcc_checkout-continue__button';
        go.appendChild(document.createTextNode(I18N.continueButton || ''));
        form.appendChild(go);
        frag.appendChild(form);

        return frag;
    }

    function restartCard() {
        var frag = document.createDocumentFragment();
        frag.appendChild(heading('h2', I18N.restartTitle));
        frag.appendChild(para(I18N.restartLead));
        var a = document.createElement('a');
        a.className = 'dcc_checkout-continue__button';
        a.href = CFG.cottages || '/';
        a.appendChild(document.createTextNode(I18N.restartButton || ''));
        frag.appendChild(a);
        return frag;
    }

    function hidden(form, name, value) {
        var i = document.createElement('input');
        i.type = 'hidden';
        i.name = name;
        i.value = value == null ? '' : String(value);
        form.appendChild(i);
    }

    /**
     * Hide MotoPress's "Check-in date is not valid." dead end, once the card
     * is in front of it.
     *
     * THE SELECTOR IS THE ONE THE DIRECTOR READ OFF THE LIVE SERVER
     * (2026-10-22). A fresh GET with no POST is served exactly:
     *
     *     <div class="mphb_sc_checkout-wrapper">
     *       <p class="mphb-data-incorrect"> <br/>Check-in date is not valid.…
     *
     * so it is `p.mphb-data-incorrect` inside `.mphb_sc_checkout-wrapper`, and
     * there is NO `.mphb-errors-wrapper` on this path at all — which is what
     * the first version of this guessed at, alongside two selectors invented
     * from the shape of that name. All three are gone: a guessed selector that
     * matches nothing is not a fallback, it is a line that looks like one.
     *
     * Pinned to the child of that wrapper, so a `.mphb-data-incorrect`
     * MotoPress might print somewhere else on some other page is not this
     * plugin's business. Display-based, as everywhere else on this checkout,
     * and only ever called once the card is actually in front of it. Nothing
     * of WordPress's own notices is touched.
     */
    function hideDeadEnd() {
        var dead = document.querySelectorAll(
            '.mphb_sc_checkout-wrapper > .mphb-data-incorrect');
        for (var i = 0; i < dead.length; i++) {
            if (dead[i].closest('.dcc_checkout-continue')) { continue; }
            if (!dead[i].classList.contains('dcc_checkout-hidden')) {
                dead[i].classList.add('dcc_checkout-hidden');
            }
        }
    }

    /* --------------------------------------------------------------------- *
     * Go
     * --------------------------------------------------------------------- */

    function init() {
        var form = theForm();
        if (form) {
            withForm(form);
        } else {
            withoutForm();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
