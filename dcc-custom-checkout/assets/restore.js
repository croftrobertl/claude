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
    /* 0.36.0. Each is sent only for the state that can use it, so on the
       normal form path both are empty and neither path below runs. */
    var AVAIL = CFG.avail || {};
    var COTTAGES = CFG.cottageList || [];

    /* 0.36.0 — WHERE THE CARD'S TOP EDGE SHOULD LAND when it sits on the
       header photo. Rob's requirement is "at or above y=300 at both 390 and
       1440"; this aims 40px higher so a font or image that measures a little
       differently on a real phone cannot push it past the limit. */
    var CARD_TOP_TARGET = 260;

    /* ...and the least photo left showing above it, so the card overlaps the
       picture rather than replacing it. */
    var CARD_PHOTO_MIN = 80;

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
        /* ONE CARD, EVER (v0.35.2). This runs once at init, so a second card
           cannot arise from this plugin's own flow — but the script being
           evaluated twice on one page is not far-fetched here: SpeedyCache
           rewrites and concatenates assets on this site, and it has served a
           stale or doubled bundle before. Two "Those Dates Aren't Available"
           cards would be this plugin's bug however it happened. Found by
           running the whole script twice over a finished page in
           tests/restore/browser.js, which is also what pins the text-node
           wrapping as idempotent. */
        if (document.querySelector('.dcc_checkout-continue')) { return; }

        var held = read(STAY_KEY);
        var card = document.createElement('section');
        card.className = 'dcc_checkout-continue';
        card.setAttribute('data-dcc-injected', '1');
        var state = CFG.offer === 'taken' && complete(STAY)
            ? 'taken'
            : (complete(held) ? 'continue' : 'lost');

        /* THE AVAILABILITY REQUEST STARTS HERE, BEFORE THE CARD IS BUILT
           (0.36.1, the Director's staging measurement). On staging the call
           itself took 1,759ms and only STARTED at 1,088ms, so the chips landed
           at about 2.85s against a 3s cutoff — a feature that worked on live
           at 780ms and would have failed on a slower day. Nothing between
           here and the card's insertion is waited on, so this is the earliest
           point at which the stay is known. */
        if (state === 'taken') { offerOpenDates(STAY); }
        /* THE STATE, ON THE CARD (0.36.0). The two cards Rob asked to sit on
           the header photo are 'taken' and 'lost'; 'continue' keeps its own
           shape, because it is the one card that carries a picture of its own
           and it was not among the two he measured. A WORD in an attribute,
           so the CSS can name a state without the class list growing one flag
           per state. */
        card.setAttribute('data-dcc-state', state);

        /* ON THE PHOTO, FOR THESE TWO STATES ONLY (0.36.0, Rob: more than half
           of the first screen was an empty dark photo). BEFORE the card is
           built, because both of these change what the page's headings are and
           cardHeading() reads that.

           The body class is what the stylesheet keys the overlap and the
           softening on, so a normal checkout — which never reaches this
           function — cannot be moved by either. */
        if (state === 'taken' || state === 'lost') {
            addClass(document.body, 'dcc_checkout-cardover');
            dropHeroOverlay();
            dropThemeTitle();
        }

        /* THREE STATES, AND THE FIRST ONE IS NEW IN v0.35.1 (item 2).
           PHP decides which of them the REQUEST has earned (Restore::offer()),
           because PHP is the half holding the submission; this half knows the
           one thing PHP cannot — whether MotoPress drew a form. Together:
           no form AND a complete, still-bookable stay in this very request
           means the dates are not lost, they are taken.

           Never read as MotoPress's words. See Restore::offer(). */
        if (state === 'taken') {
            card.appendChild(takenCard(STAY));
        } else if (state === 'continue') {
            card.appendChild(continueCard(held));
        } else {
            card.appendChild(restartCard());
        }

        var host = firstOf([
            /* The wrapper MotoPress really renders on this path (Director,
               live 2026-10-22): the dead-end message lives here, and this is
               what gets swept whether or not the card lands beside it. */
            '.mphb_sc_checkout-wrapper',
            '.mphb_sc_checkout',
            '.entry-content',
            'main',
            'body',
        ]);
        if (!host) { return; }

        /* THE CARD GOES IN THE HEADER IN THESE TWO STATES (0.36.1). The
           content area cannot hold it: see cardHome(). */
        var home = (state === 'taken' || state === 'lost') ? cardHome() : null;
        if (home) {
            addClass(card, 'dcc_checkout-continue--inheader');
            home.parent.insertBefore(card, home.before);
        } else {
            host.insertBefore(card, host.firstChild);
        }
        hideDeadEnd(host);

        if (state === 'taken' || state === 'lost') {
            fitCardToHero(card);
        }
    }

    /** A stay is usable only with all three of the fields we would re-post. */
    function complete(stay) {
        return !!(stay && stay.roomTypeId && stay.checkIn && stay.checkOut);
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

    /**
     * THE CARD'S OWN HEADING — an `h1` when the page has no other, an `h2`
     * when it has (0.36.0).
     *
     * Rob asked for the heading to be "the page's one visible h1", and on
     * these pages it is the only heading a guest can see. Whether it can be an
     * `h1` depends on what else is in the HTML, and the two switch states
     * differ:
     *
     *   - SWITCH ON: Hero empties the theme's "Submit Booking" title (0.35.1,
     *     item 5) and dropHeroOverlay() above has taken the hero's own name
     *     away, so there is no other h1 and this one IS the page's h1, visible.
     *   - SWITCH OFF — live today, and these cards are not behind the switch:
     *     the theme's title is still in the HTML, rendered 0x0. So this heading
     *     steps down to an `h2` and that 0x0 title stays the page's only h1,
     *     exactly as it is today.
     *
     * IT IS THE EXISTENCE OF ANOTHER h1 THAT DECIDES, NOT ITS VISIBILITY, and
     * that is deliberate. Keying on visibility would make this an h1 beside
     * the theme's invisible one — two in the HTML — and 0.35.1's item 5 went to
     * real trouble over "ONE h1 IN THE HTML, NOT ONE VISIBLE". The alternative
     * was to delete the theme's heading from the DOM here, which was rejected:
     * a 0x0 heading is still read aloud, "invisible" is not the same as
     * "unwanted", and a visually-hidden heading is a deliberate pattern on
     * other sites. Removing one would be this plugin reaching past its own
     * markup to win a structural argument.
     *
     * The styling is keyed on the CLASS, so the two tags are indistinguishable
     * on screen. Both branches are asserted at all three widths.
     */
    function cardHeading(text) {
        /* dropThemeTitle() has already removed any h1 a guest cannot see, so
           anything still here is a real, visible heading of someone else's
           and this one steps down beside it. */
        var level = document.querySelector('h1') ? 'h2' : 'h1';
        var h = heading(level, text);
        h.className = 'dcc_checkout-continue__title';
        return h;
    }

    /** Idempotent, per 0.18.0: a no-op classList.add still records a mutation. */
    function addClass(el, name) {
        if (!el || !el.classList) { return; }
        if (!el.classList.contains(name)) { el.classList.add(name); }
    }

    /** Idempotent too — and a style write is as observable as a class one. */
    function setStyle(el, prop, value) {
        if (!el || !el.style) { return; }
        if (el.style[prop] !== value) { el.style[prop] = value; }
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

        frag.appendChild(cardHeading(I18N.continueTitle));
        if (stay.name) { frag.appendChild(para(stay.name)); }
        if (stay.dates) {
            var d = para(stay.dates);
            d.className = 'dcc_checkout-continue__dates';
            frag.appendChild(d);
        }
        var lead = para(I18N.continueLead);
        lead.className = 'dcc_checkout-continue__lead';
        frag.appendChild(lead);

        /* A REAL POST OF THE SAME FIVE FIELDS THE COTTAGE PAGE SENDS, with
           the dates EXACTLY as they were stored. Nothing is recomputed from
           today's date, and no availability is asserted — MotoPress re-checks
           it, as it does for the cottage page. */
        var form = stayForm(stay, 'dcc_checkout-continue__form');

        var go = document.createElement('button');
        go.type = 'submit';
        go.className = 'dcc_checkout-continue__button';
        go.appendChild(document.createTextNode(I18N.continueButton || ''));
        form.appendChild(go);
        frag.appendChild(form);

        return frag;
    }

    /**
     * v0.35.1, item 2 — the dates are known, and someone else has them.
     *
     * No form and no POST back: offering to re-submit a stay MotoPress has
     * just refused would walk the guest into the same wall. The one action is
     * forward, to pick again.
     */
    function takenCard(stay) {
        var frag = document.createDocumentFragment();

        frag.appendChild(cardHeading(I18N.takenTitle));

        /* The cottage's name goes IN the sentence when it is known, and the
           nameless wording is a separate string rather than this one with a
           hole in it. */
        var lead = stay.name
            ? fill(I18N.takenLead, stay.name)
            : (I18N.takenLeadPlain || '');
        var p = para(lead);
        /* Two sentences, so left-aligned — Rob's rule. The title above it and
           the dates below stay centred. */
        p.className = 'dcc_checkout-continue__lead';
        frag.appendChild(p);

        if (stay.dates) {
            var d = para(stay.dates);
            d.className = 'dcc_checkout-continue__dates';
            frag.appendChild(d);
        }

        var a = document.createElement('a');
        a.className = 'dcc_checkout-continue__button';
        a.href = CFG.cottages || '/';
        a.appendChild(document.createTextNode(I18N.takenButton || ''));
        frag.appendChild(a);
        return frag;
    }

    /** One `%s` filled in. Text only: this never builds markup. */
    function fill(template, value) {
        var text = template == null ? '' : String(template);
        return text.replace('%s', value == null ? '' : String(value));
    }

    function restartCard() {
        var frag = document.createDocumentFragment();
        frag.appendChild(cardHeading(I18N.restartTitle));
        var lead = para(I18N.restartLead);
        lead.className = 'dcc_checkout-continue__lead';
        frag.appendChild(lead);
        var a = document.createElement('a');
        a.className = 'dcc_checkout-continue__button';
        a.href = CFG.cottages || '/';
        a.appendChild(document.createTextNode(I18N.restartButton || ''));
        frag.appendChild(a);
        /* 0.36.0 — a way forward under the button, not just the button. */
        var strip = cottageStrip();
        if (strip) { frag.appendChild(strip); }
        return frag;
    }

    /**
     * THE MECHANISM, IN ONE PLACE (extracted in 0.36.0).
     *
     * MotoPress's own Book Now submission: a POST of the five fields a cottage
     * page sends — `mphb_room_type_id`, `mphb_check_in_date`,
     * `mphb_check_out_date`, `mphb_rooms_details[<type>]`,
     * `mphb_is_direct_booking` — at the checkout page. It RENDERS THE FORM for
     * those dates and creates nothing: MotoPress re-checks availability and
     * prices the stay itself, and the guest submits. The Continue card has
     * used it since 0.35.0 and the open-date chips use it now, so there is one
     * copy of the field list rather than two that can drift.
     *
     * No nonce field, by MotoPress's own design for this submission — the same
     * note as the hidden form on every cottage page.
     */
    function stayForm(stay, className) {
        var form = document.createElement('form');
        form.className = className;
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
        return form;
    }

    /* --------------------------------------------------------------------- *
     * 0.36.0 — THE CARD SITS ON THE HEADER PHOTO
     * --------------------------------------------------------------------- */

    /**
     * The hero's cottage name and dates pill go, in these two states.
     *
     * REMOVED, NOT HIDDEN, and that is the point: it is an `<h1>`, and this
     * card's own heading has to be the page's heading. Hiding it would leave
     * two h1s in the HTML — one of them invisible — which is exactly what
     * 0.35.1's item 5 went to some trouble to stop.
     *
     * Safe to remove because it is THIS PLUGIN'S OWN element: Hero prints it
     * (class-hero.php) and nothing reads it — layout.js never looks it up.
     * The card carries the cottage name and the dates itself, so nothing is
     * lost; and the card is pulled up over where it used to sit, so leaving it
     * would be a collision as well as a duplicate.
     *
     * With the switch OFF — live today — there is no overlay at all and this
     * does nothing. The theme's own 0x0 "Submit Booking" h1 is left exactly
     * where it was: Hero only takes that away behind the switch (0.35.1), and
     * cardHeading() answers it by stepping down to an h2.
     */
    function dropHeroOverlay() {
        var over = document.querySelector('.dcc_hero-overlay');
        if (over && over.parentNode) { over.parentNode.removeChild(over); }
    }

    /**
     * Pull the card up over the bottom of the header photo.
     *
     * WHY MEASURED RATHER THAN A CONSTANT: the distance to close is the
     * theme's own padding above the content plus however much of the photo the
     * card should cover, and the first of those is Bravada's, not this
     * plugin's. The Director measured the card's top at y=466 at 1440 and
     * y=456 at 390 against a 420px header band — close, but not equal, and a
     * tuned negative margin would be right at the two widths it was tuned at
     * and wrong at the third. Measuring makes "top edge at or above 300"
     * true by construction instead of by arithmetic.
     *
     * ONE STYLE WRITE, AT INIT, IDEMPOTENT. Not on scroll — this is static
     * geometry, and writing layout on scroll is what v0.13.0 and v0.18.0
     * established this checkout must never do. Not on a bare `resize` either:
     * on iOS that fires when the URL bar collapses mid-scroll. A width change
     * is a real relayout, so that one is answered.
     */
    /**
     * WHERE THE CARD GOES — THE HEADER, NOT THE CONTENT (0.36.1).
     *
     * 0.36.0 put the card in MotoPress's wrapper and pulled it up over the
     * photo with a measured negative margin. On the real theme the top half of
     * it was then painted over by the header, at 390, 768 and 1440 and in both
     * switch states: the heading and the lead sentence were invisible and the
     * guest saw only the dates, the button and the chips.
     *
     * IT IS A STACKING PROBLEM, NOT A GEOMETRY ONE, and no z-index on the card
     * could have fixed it. Measured in Chromium on the live page
     * (2026-10-26 — see tests/real-theme/):
     *
     *   header#masthead            position: relative  z-index: 999
     *     #site-header-main        position: absolute  z-index: 251   (the menu)
     *       .site-header-bottom-fixed, once pinned     z-index: 9999
     *     #header-image-main       position: relative  z-index: auto  overflow: HIDDEN
     *       #header-image-main-inside                  z-index: auto  overflow: HIDDEN
     *         #header-page-title   position: absolute  z-index: 11
     *   #content
     *     #container.one-column
     *       main#main              position: relative  z-index: 9     overflow: hidden
     *         article.hentry       matrix3d(...)  → its own stacking context
     *
     * `#masthead` (999) and `main` (9) are siblings in the ROOT stacking
     * context, so EVERYTHING in the header paints above EVERYTHING in the
     * content, and a card in the content can never reach it. The article's
     * matrix3d scopes the card's own z-index inside `main`'s 9, which is why
     * 0.36.0's `z-index: 3` did nothing.
     *
     * So the card moves into `#masthead`, where the same stacking context that
     * was painting over it now carries it. Inside that context it is ordered
     * by z-index against the header's own parts, which is what makes the
     * menu's behaviour a matter of construction rather than of tuning:
     * `--inheader` is `z-index: 12`, so the card sits ABOVE the theme's page
     * title (11) and BELOW the menu (251) and the pinned bar (9999). The
     * Director's baseline — the Browse Cottages dropdown opening on top of the
     * card, all eight links — cannot be broken by this placement.
     *
     * AND IT IS A SIBLING OF THE PHOTO BAND, NOT A CHILD OF IT. The brief
     * preferred `#header-image-main`; that box and `#header-image-main-inside`
     * are BOTH `overflow: hidden` (Bravada style.css, one rule, all three
     * widths), and that clip is what crops the cottage photo to the 420px
     * band. A card inside them is cut off at 420 — the card is taller than the
     * room left below y=260 — and unclipping them to make room would release
     * the photo as well. Immediately AFTER the band, still inside `#masthead`,
     * the stacking is identical and the theme's crop is untouched.
     *
     * Nothing is restyled by the move: the theme has exactly two rules that
     * reach arbitrary descendants of `#masthead`, and both name
     * `.header-image` (checked across all thirty of the page's stylesheets).
     *
     * Returns null when the header is not the shape measured above, and the
     * card then lands where 0.35.x put it — which is wrong on this theme but
     * is a card, not a blank page.
     */
    function cardHome() {
        var masthead = document.getElementById('masthead');
        var band = document.getElementById('header-image-main');
        if (!masthead || !band || !masthead.contains(band)) { return null; }
        /* After the band, so the flow puts the card below the photo and
           fitCardToHero() pulls it up from there. `nextSibling` is null when
           the band is last, which appends — both are correct. */
        return { parent: masthead, before: band.nextSibling };
    }

    function fitCardToHero(card) {
        var hero = firstOf([
            /* The theme's header band, innermost first — the box the photo is
               painted in (Director's capture, 2026-10-22). */
            '#header-image-main-inside',
            '#header-image-main',
            'header#masthead',
        ]);
        if (!hero || !hero.getBoundingClientRect || !card.getBoundingClientRect) { return; }

        var band = hero.getBoundingClientRect();
        /* No band, or one too short to sit on, and the card stays where the
           document put it. Nothing breaks: that is 0.35.x's position. */
        if (band.height <= CARD_PHOTO_MIN + 40) { return; }

        setStyle(card, 'marginTop', '');
        var top = card.getBoundingClientRect().top + window.pageYOffset;
        var wanted = top - CARD_TOP_TARGET;
        /* Leave the photo showing above the card, and never pull the card past
           the top of the document. */
        var ceiling = Math.min(band.height - CARD_PHOTO_MIN, top - 8);
        var pull = Math.max(0, Math.min(wanted, ceiling));
        if (pull > 0) { setStyle(card, 'marginTop', '-' + Math.round(pull) + 'px'); }

        /* ONE LISTENER, EVER. The first version registered a resize handler
           on every call AND called itself from that handler, so each resize
           left another listener behind and the next one ran them all — a
           handler count that doubles while the guest drags a window. Found by
           re-reading this, not by a test; the flag is what the test now pins
           (one listener, whatever the sequence of resizes). */
        if (!watchingWidth) {
            watchingWidth = true;
            var width = window.innerWidth;
            window.addEventListener('resize', function () {
                /* HEIGHT-ONLY RESIZES ARE IGNORED. See matchFileFieldWidth()
                   in checkout.js: the iOS URL bar collapsing during an
                   ordinary scroll fires `resize`, and answering it writes
                   layout under the guest's finger. */
                if (window.innerWidth === width) { return; }
                width = window.innerWidth;
                fitCardToHero(card);
            });
        }
    }

    /**
     * THE THEME'S OWN "Submit Booking" TITLE GOES, IN THESE TWO STATES
     * (0.36.1, the Director's staging read).
     *
     * There are TWO of them and they are different elements, which is why
     * 0.36.0 left one on screen:
     *
     *   - `#header-page-title` is a DIV, absolutely positioned across the
     *     whole 420px header at z-index 11, and it is what a guest actually
     *     SEES — "Submit Booking" drawn large over the cottage photo. It is
     *     not a heading at all, so none of the h1 reasoning reached it.
     *   - the article's `h1.entry-title` is the page's only real h1 and
     *     renders 0x0. Hero empties it, but only behind the layout switch.
     *
     * Both are wrong here: this page is not a booking submission, it is a
     * dead end, and the card's own heading is the page's subject. So in
     * these two states both go and the card's heading becomes the one
     * visible h1 — which is the rule the Director set.
     *
     * HIDDEN, NOT REMOVED, for the theme's own elements: they are Bravada's,
     * not this plugin's, and a display-based hide is what the rest of this
     * checkout does to markup it does not own. (The hero overlay IS this
     * plugin's, so that one is removed — see dropHeroOverlay.)
     */
    function dropThemeTitle() {
        /* The banner is a DIV, not a heading: hiding it is enough, and it is
           the theme's markup, which this checkout hides rather than deletes. */
        var banner = document.getElementById('header-page-title');
        if (banner) { addClass(banner, 'dcc_checkout-hidden'); }

        /* THE 0x0 h1 IS REMOVED, and only because leaving it breaks the other
           rule. Hiding it would leave TWO h1s in the HTML — one invisible —
           which is exactly what 0.35.1's item 5 went to some trouble to stop,
           and the Director's rule here is that the card's heading is the one
           visible h1. Removing is the only reading that satisfies both.
           A VISIBLE h1 is left alone: it would be someone's real heading, and
           cardHeading() steps down to an h2 beside it. Ours is not in the
           document yet, so every h1 found here is another's. */
        var all = document.querySelectorAll('h1');
        for (var i = 0; i < all.length; i++) {
            var h = all[i];
            var shown = h.offsetWidth > 0 && h.offsetHeight > 0;
            if (!shown && h.parentNode) { h.parentNode.removeChild(h); }
        }
    }

    /** Whether fitCardToHero has already taken its one resize listener. */
    var watchingWidth = false;

    /* --------------------------------------------------------------------- *
     * 0.36.0 — OPEN DATES FOR THIS COTTAGE
     * --------------------------------------------------------------------- */

    /**
     * Ask the Availability Calendar what else is open, and offer the first
     * few stays as chips.
     *
     * READ ONLY, AND IT FAILS QUIETLY (Rob). The endpoint writes nothing and
     * carries no guest data; if the request fails, is slow past
     * `avail.timeoutMs`, or finds nothing, the card is left exactly as it was
     * — no spinner, no error line, nothing added. So the worst outcome of this
     * whole feature is 0.35.2's card.
     *
     * NOTHING IS BOOKED OR SUBMITTED HERE. A chip is a form POST of
     * MotoPress's five Book Now fields; see stayForm().
     */
    function offerOpenDates(stay) {
        if (!AVAIL.url || !AVAIL.action || !window.fetch || !window.AbortController) { return; }
        watchTouches();
        var want = nightsBetween(stay.checkIn, stay.checkOut);
        if (want < 1) { return; }

        var to = addDays(stay.checkIn, Math.max(1, AVAIL.windowDays || 94));
        if (!to) { return; }

        var ctrl = new window.AbortController();
        var timer = window.setTimeout(function () { ctrl.abort(); }, AVAIL.timeoutMs || 5000);
        var body = 'action=' + encodeURIComponent(AVAIL.action)
            + '&room_type_ids%5B%5D=' + encodeURIComponent(stay.roomTypeId)
            + '&from=' + encodeURIComponent(stay.checkIn)
            + '&to=' + encodeURIComponent(to);

        window.fetch(AVAIL.url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: body,
            signal: ctrl.signal
        }).then(function (res) {
            return res && res.ok ? res.json() : null;
        }).then(function (json) {
            window.clearTimeout(timer);
            if (!json || !json.success || !json.data) { return; }
            var stays = openStays(json.data, stay, want);
            if (!stays.length) { return; }
            /* NOT WHILE A FINGER IS DOWN (0.18.0). This lands up to three
               seconds after load, which is exactly when a guest may be
               reaching for "Pick New Dates" — and a DOM change around a tap is
               how iOS swallows the click. */
            /* The card is found NOW rather than captured when the request
               went out, because the request now starts before the card
               exists. No card (the state changed, or nothing was drawn) and
               there is simply nothing to add. */
            var card = document.querySelector('.dcc_checkout-continue');
            if (!card) { return; }
            afterTouch(function () { addChips(card, stay, stays); });
        })['catch'](function () {
            window.clearTimeout(timer);
            /* Aborted, offline, blocked, not JSON — all the same answer. */
        });
    }

    /**
     * The stays worth offering, out of the Calendar's answer.
     *
     * THE RESPONSE'S CONTRACT, read from the Availability Calendar's own
     * source (`Booking_Rules::encode`, its 0.47.4) rather than guessed:
     *
     *   availability[<type>][Y-m-d]  'available' | 'booked' | 'past'
     *   rules[<type>].in             one character a DAY, aligned with
     *                                [from, to]: '1' a stay may start, 'w'
     *                                MotoPress allows no arrival, 'a' too
     *                                soon, 'f' too far ahead
     *   rules[<type>].out            '1' a stay may end that day, 'w' not
     *   rules[<type>].min            fewest nights for a stay starting that
     *                                day — ONE number when every day agrees,
     *                                else one per day. ABSENT when MotoPress
     *                                has no minimum-stay rule at all.
     *   rules[<type>].max            most nights, 0 meaning no limit, same
     *                                one-or-many shape.
     *
     * `rules` IS OPTIONAL — the Calendar leaves it out when MotoPress could
     * not be read. Then availability alone decides, which is that plugin's own
     * documented degradation, and the stay a chip offers is still re-checked
     * by MotoPress when the guest opens it.
     *
     * NIGHTS: what the guest asked for, raised to the minimum — MotoPress's
     * own per-day minimum when it is there, else the site floor PHP sent. The
     * one-night case is real: this site has a two-night minimum, so a
     * one-night request is refused with no form, and offering more one-night
     * stays would walk the guest into the same wall.
     */
    function openStays(data, stay, want) {
        var type = String(stay.roomTypeId);
        var avail = data.availability && data.availability[type];
        if (!avail || !data.from || !data.to) { return []; }
        var rules = data.rules && data.rules[type] ? data.rules[type] : null;
        var floor = Math.max(1, AVAIL.minNights || 1);
        var limit = Math.max(1, AVAIL.chips || 3);

        var dates = [];
        for (var d = data.from; d && d <= data.to; d = addDays(d, 1)) {
            dates.push(d);
            if (dates.length > 400) { break; }   /* a malformed `to`, bounded */
        }

        var start = dates.indexOf(stay.checkIn);
        if (start < 0) { start = 0; }

        var out = [];
        for (var i = start; i < dates.length && out.length < limit; i++) {
            var nights = Math.max(want, floor, ruleAt(rules && rules.min, i, 0));
            var most = ruleAt(rules && rules.max, i, 0);
            if (most > 0 && nights > most) { continue; }
            if (i + nights >= dates.length) { break; }
            if (rules && charAt(rules['in'], i) !== '1') { continue; }
            if (rules && charAt(rules.out, i + nights) !== '1') { continue; }
            var free = true;
            for (var n = 0; n < nights; n++) {
                if (avail[dates[i + n]] !== 'available') { free = false; break; }
            }
            if (!free) { continue; }
            /* The stay that was just refused is not an offer. A LONGER one
               from the same day is. */
            if (dates[i] === stay.checkIn && nights === want) { continue; }
            out.push({ checkIn: dates[i], checkOut: dates[i + nights], nights: nights });
            /* Non-overlapping, so three chips are three real choices rather
               than the same week shifted by a day. */
            i += nights - 1;
        }
        return out;
    }

    /** One number, one per day, or absent. See openStays(). */
    function ruleAt(value, i, dflt) {
        if (value == null) { return dflt; }
        if (typeof value === 'number') { return value; }
        if (Object.prototype.toString.call(value) === '[object Array]') {
            return i < value.length ? (parseInt(value[i], 10) || 0) : dflt;
        }
        return dflt;
    }

    /** A day's character out of an `in`/`out` string, or '' past its end. */
    function charAt(str, i) {
        return typeof str === 'string' && i >= 0 && i < str.length ? str.charAt(i) : '';
    }

    /** The chips, each its own POST of MotoPress's five fields. */
    function addChips(card, stay, stays) {
        if (card.querySelector('.dcc_checkout-alts')) { return; }   /* once */
        var box = document.createElement('div');
        box.className = 'dcc_checkout-alts';
        box.setAttribute('data-dcc-injected', '1');
        box.appendChild(heading('h3', I18N.altTitle));

        var list = document.createElement('ul');
        list.className = 'dcc_checkout-alts__list';
        stays.forEach(function (open) {
            var li = document.createElement('li');
            var form = stayForm({
                roomTypeId: stay.roomTypeId,
                checkIn: open.checkIn,
                checkOut: open.checkOut,
                roomsDetails: stay.roomsDetails
            }, 'dcc_checkout-alts__form');
            var btn = document.createElement('button');
            btn.type = 'submit';
            btn.className = 'dcc_checkout-chip';
            btn.appendChild(document.createTextNode(chipText(open)));
            form.appendChild(btn);
            li.appendChild(form);
            list.appendChild(li);
        });
        box.appendChild(list);
        card.appendChild(box);
    }

    /** "Sat, Dec 5 → Tue, Dec 8 · Open". */
    function chipText(open) {
        return fillAll(I18N.chipLabel, [
            dayText(open.checkIn),
            dayText(open.checkOut),
            I18N.chipOpen || ''
        ]);
    }

    /**
     * "Sat, Dec 5" in the visitor's own locale.
     *
     * BUILT FROM THE PARTS, never `new Date('2026-12-05')` — that string is
     * parsed as UTC, so a visitor west of Greenwich would be shown the day
     * before. From parts it is local midnight, and only the three fields asked
     * for are rendered, so no timezone is applied to anything.
     */
    function dayText(ymd) {
        var p = String(ymd || '').split('-');
        if (p.length !== 3) { return String(ymd || ''); }
        var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        if (isNaN(dt.getTime())) { return String(ymd); }
        try {
            return dt.toLocaleDateString(undefined, {
                weekday: 'short', month: 'short', day: 'numeric'
            });
        } catch (e) {
            return String(ymd);
        }
    }

    /* --------------------------------------------------------------------- *
     * 0.36.0 — AND THE COTTAGES, UNDER "PICK YOUR DATES AGAIN"
     * --------------------------------------------------------------------- */

    /**
     * Every cottage, as a picture and a name linking to its own page.
     *
     * PHP resolved these (Restore::cottage_list()) and sends them only in this
     * state, so nothing is asked for and nothing is queried on a working
     * checkout. The pictures are lazy and carry their real pixel size, so the
     * row reserves its boxes instead of reflowing under a button the guest is
     * about to press — and at 390, where the row scrolls sideways, the ones
     * off screen are never fetched at all.
     */
    function cottageStrip() {
        if (!COTTAGES.length) { return null; }
        var box = document.createElement('div');
        box.className = 'dcc_checkout-strip';
        box.appendChild(heading('h3', I18N.stripTitle));

        var list = document.createElement('ul');
        list.className = 'dcc_checkout-strip__list';
        COTTAGES.forEach(function (c) {
            if (!c || !c.url) { return; }
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.className = 'dcc_checkout-strip__link';
            a.href = c.url;
            if (c.photo) {
                var img = document.createElement('img');
                img.className = 'dcc_checkout-strip__photo';
                img.src = c.photo;
                /* The link's own text names the cottage, so the picture is
                   decorative and an alt repeating the name would be read
                   twice. */
                img.alt = '';
                img.loading = 'lazy';
                img.decoding = 'async';
                if (c.w) { img.width = c.w; }
                if (c.h) { img.height = c.h; }
                a.appendChild(img);
            }
            var name = document.createElement('span');
            name.className = 'dcc_checkout-strip__name';
            name.appendChild(document.createTextNode(c.name || ''));
            a.appendChild(name);
            li.appendChild(a);
            list.appendChild(li);
        });
        box.appendChild(list);
        return box;
    }

    /* --------------------------------------------------------------------- *
     * Dates, and the touch gate
     * --------------------------------------------------------------------- */

    /** 'Y-m-d' plus n days, in no timezone at all — UTC arithmetic on a date. */
    function addDays(ymd, n) {
        var p = String(ymd || '').split('-');
        if (p.length !== 3) { return null; }
        var t = Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        if (isNaN(t)) { return null; }
        var d = new Date(t + n * 86400000);
        return d.getUTCFullYear() + '-'
            + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-'
            + ('0' + d.getUTCDate()).slice(-2);
    }

    function nightsBetween(from, to) {
        var a = String(from || '').split('-');
        var b = String(to || '').split('-');
        if (a.length !== 3 || b.length !== 3) { return 0; }
        var ta = Date.UTC(Number(a[0]), Number(a[1]) - 1, Number(a[2]));
        var tb = Date.UTC(Number(b[0]), Number(b[1]) - 1, Number(b[2]));
        if (isNaN(ta) || isNaN(tb)) { return 0; }
        return Math.round((tb - ta) / 86400000);
    }

    /** Each `%1$s`, `%2$s`… filled in. Text only: this never builds markup. */
    function fillAll(template, values) {
        var text = template == null ? '' : String(template);
        for (var i = 0; i < values.length; i++) {
            text = text.split('%' + (i + 1) + '$s').join(String(values[i] == null ? '' : values[i]));
        }
        return text;
    }

    /**
     * Run it now, or once the finger has lifted and the page has settled.
     *
     * The same shape as checkout.js's touch gate, and for the same measured
     * reason (0.18.0): on iOS a DOM change around a tap is read as
     * hover-revealed content and no click is synthesised. The listeners are
     * passive and write nothing; the only timer is installed on touch-up,
     * never during the touch.
     */
    var fingerDown = false;
    var waiting = null;
    function afterTouch(fn) {
        if (!fingerDown) { fn(); return; }
        waiting = fn;
    }
    function watchTouches() {
        if (!document.addEventListener) { return; }
        document.addEventListener('touchstart', function () {
            fingerDown = true;
        }, { passive: true, capture: true });
        var up = function () {
            fingerDown = false;
            if (!waiting) { return; }
            var fn = waiting;
            waiting = null;
            window.setTimeout(fn, 450);
        };
        document.addEventListener('touchend', up, { passive: true, capture: true });
        document.addEventListener('touchcancel', up, { passive: true, capture: true });
    }

    function hidden(form, name, value) {
        var i = document.createElement('input');
        i.type = 'hidden';
        i.name = name;
        i.value = value == null ? '' : String(value);
        form.appendChild(i);
    }

    /**
     * Put MotoPress's own message out of view, once the card is in front of
     * it.
     *
     * WHAT LIVE SERVES, for the record (Director, 2026-10-22). A fresh GET
     * with no POST is served exactly:
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
     * **AND SO IS THE PINNED ONE, SINCE v0.35.3.** Until then this fell back
     * to querying that selector when the host was NOT the wrapper — and the
     * mutation runner showed the fallback had become UNREACHABLE: the host
     * preference list in `withoutForm()` tries `.mphb_sc_checkout-wrapper`
     * FIRST, so if a wrapper exists anywhere it IS the host and the sweep
     * below runs; reaching the fallback meant no wrapper existed, and the
     * query could never match. The only thing it could have covered is a page
     * with TWO wrappers, which is not proven to exist. A pinned selector that
     * cannot match is the same line this comment warns about, so it went.
     *
     * AND IN v0.35.1 IT IS NOT THE ONLY MESSAGE (item 2). The booked page
     * prints "Accommodation is already booked." in that wrapper and 0.35.0
     * left it showing UNDER the card, because it is not that element. Its
     * markup has not been read, so rather than guess a second class this works
     * STRUCTURALLY: when the card's host is MotoPress's own checkout wrapper,
     * every direct child of that wrapper which is not ours goes out of view.
     * The wrapper holds the checkout and nothing else, and this only ever runs
     * on the path where MotoPress drew no form — so there is nothing in there
     * for a guest to act on, whatever it says, and the card has replaced it.
     *
     * AND SOME OF IT IS NOT AN ELEMENT AT ALL (v0.35.2). The Director read the
     * booked page on live (Cottage 36, Jan 11-14 2027): the wrapper's children
     * are
     *
     *     [SECTION.dcc_checkout-continue, TEXT "Accommodation is already booked."]
     *
     * — a BARE TEXT NODE directly inside the wrapper. 0.35.1's sweep walked
     * `host.children`, which is elements only, so there was nothing to put a
     * class on and the sentence stayed under the card. A text node cannot
     * carry a class, so each non-empty one is WRAPPED in a hidden `<span>`.
     * That is the whole reason this does DOM surgery rather than classing: it
     * is the only way to hide a bare text node by stylesheet.
     *
     * THE GENERALISATION IS CONFINED TO THAT WRAPPER AND MUST STAY SO. The
     * host list also contains `.entry-content`, `main` and `body`; hiding
     * every child — let alone wrapping their text — of one of those would
     * blank the page. So the structural sweep is gated on the host being the
     * wrapper, and the pinned selector above is what runs otherwise.
     *
     * Display-based, as everywhere else on this checkout; idempotent; nothing
     * of WordPress's own notices is touched. It runs ONCE, at init, from
     * `withoutForm()` — never from an observer and never in a touch path, so
     * the 0.18.0 rules are untouched.
     */
    function hideDeadEnd(host) {
        if (!host || !host.classList
            || !host.classList.contains('mphb_sc_checkout-wrapper')) {
            return;
        }
        /* A SNAPSHOT, because wrapping replaces nodes as we go and
           `childNodes` is live. */
        var kids = Array.prototype.slice.call(host.childNodes);
        for (var k = 0; k < kids.length; k++) {
            if (kids[k].nodeType === 1) { conceal(kids[k]); }
            else if (kids[k].nodeType === 3) { concealText(host, kids[k]); }
        }
    }

    /**
     * Put one bare text node out of view by giving it something to be hidden.
     *
     * Whitespace between elements is left alone — there is nothing to see and
     * wrapping it would litter the markup. The text itself is MOVED into the
     * span rather than re-typed, so nothing here can alter what MotoPress
     * wrote; and the span carries `data-dcc-injected`, so the next pass sees
     * an element it has already hidden rather than a text node to wrap again.
     */
    function concealText(host, node) {
        if (!node || !node.nodeValue || !node.nodeValue.trim()) { return; }
        var span = document.createElement('span');
        span.className = 'dcc_checkout-hidden';
        span.setAttribute('data-dcc-injected', '1');
        host.replaceChild(span, node);
        span.appendChild(node);
    }

    /** Hide one element, unless it is the card or inside it. */
    function conceal(el) {
        if (!el || !el.classList) { return; }
        if (el.classList.contains('dcc_checkout-continue')) { return; }
        if (el.closest && el.closest('.dcc_checkout-continue')) { return; }
        if (!el.classList.contains('dcc_checkout-hidden')) {
            el.classList.add('dcc_checkout-hidden');
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
