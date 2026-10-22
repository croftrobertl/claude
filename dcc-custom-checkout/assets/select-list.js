/**
 * DCC Custom Checkout — the site's own dropdown list on /submit-booking/
 * (v0.34.1, Rob's pick via the Website Director, 2026-10-12).
 *
 * The CLOSED fields were right; the OPENED list was not. A native <select>
 * list is drawn by the operating system — fully left-aligned on Rob's iPhone,
 * off-centre to the right on his desktop — and no CSS can centre it. So on
 * the guest checkout only, every visible dropdown (guest count, Dog Size,
 * Dog Hair, Country, any other) is shown as a button in the field's own
 * style, and opens a list this page draws, right under the field.
 * The look is the shared spec in PROJECT-NOTES.md ("Dropdown list"), which
 * the Availability Calendar builds the same list from.
 *
 * THE REAL <select> STAYS THE SOURCE OF TRUTH. It stays in the form, so
 * what is submitted, MotoPress's change handlers, the price recalculation and
 * the B1/B2 work are untouched. It is hidden VISUALLY (clip + opacity, never
 * display/visibility — checkout.js's assertGuestChooserSurvived() reads those)
 * and taken out of the tab order; the button stands in for it. A choice sets
 * the select's value and fires its real `input` and `change` events. The
 * button and list are re-read from the select whenever its options, value or
 * disabled state change (a MutationObserver per select, its change event, and
 * on every opening), and a select MotoPress replaces is picked up by an
 * observer on the form.
 *
 * VALIDATION, Rob's rule — an error only after the error is made. A visually
 * hidden required select cannot show the browser's bubble, so its `invalid`
 * event (fired only by a submit attempt) is handled: the message goes under
 * the field, the field is marked invalid and the first such field takes focus.
 * The guest select's message is guest-count.js's "Please select the number of
 * guests." (0.34.1), which is set before the browser checks. Nothing at load.
 *
 * TAP RULES (CLAUDE.md, v0.17.0/v0.18.0) kept: nothing here writes the page on
 * touchstart or pointerdown except closing a list that is OPEN; the list opens
 * on `click`; no timer is installed anywhere (type-ahead uses timestamps); and
 * every write compares first. The list lives at the end of <body>, outside
 * the form that checkout.js's observer watches.
 *
 * Fails safe: if this script does not run, every select is the native one.
 */
(function () {
    'use strict';

    var ROOT_SEL = '.mphb_sc_checkout-form';
    var TYPE_AHEAD_MS = 700;
    var idSeq = 0;
    var open = null;          // { sel, ui, list, active } while a list is open
    var attemptAt = -1e9;     // when a submit control was last pressed
    var roundFirst;           // the first invalid control of that attempt (undefined: none yet)
    var ROUND_MS = 250;

    /* ---- idempotent writes (the checkout's rule) -------------------------- */
    function setAttr(el, name, value) {
        if (el.getAttribute(name) !== value) { el.setAttribute(name, value); }
    }
    function dropAttr(el, name) {
        if (el.hasAttribute(name)) { el.removeAttribute(name); }
    }
    function setClass(el, name, on) {
        if (el.classList.contains(name) !== !!on) {
            if (on) { el.classList.add(name); } else { el.classList.remove(name); }
        }
    }
    function setText(el, text) {
        if (el.textContent !== text) { el.textContent = text; }
    }
    function nextId(prefix) {
        idSeq += 1;
        return 'dcc_' + prefix + '_' + idSeq;
    }

    /* ---- which selects ---------------------------------------------------- */
    // Every dropdown a guest sees. Never a service's own "for N" select (the
    // native services section is never shown, and checkout.js sets those
    // values itself), never a multi-select or a list box.
    function wanted(sel) {
        var n = String(sel.name || '');
        return sel.tagName === 'SELECT' && !sel.multiple && !(sel.size > 1) &&
            n.indexOf('[services]') === -1 && !sel.hasAttribute('data-dcc-native') &&
            /* v0.35.0 — the new layout turns a short dropdown (guests, coat,
               boat) into a row of segmented buttons, which drive this same
               select. Two controls for one field is the failure to avoid, so
               a select layout.js has taken is left alone here. It marks them
               before this runs: Assets makes this script depend on
               dcc-checkout-layout when the layout is active. */
            !sel.hasAttribute('data-dcc-segmented');
    }

    // The options a guest can choose, as the select has them NOW. A hidden
    // option (checkout.js caps 3/4 with `hidden` + a class + `disabled`) is
    // left out; a disabled one is shown greyed.
    function shownOptions(sel) {
        return Array.prototype.filter.call(sel.options, function (o) {
            return !o.hidden && !o.classList.contains('dcc_checkout-option-hidden');
        });
    }

    function labelFor(sel) {
        if (sel.id) {
            try {
                var l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(sel.id) : sel.id) + '"]');
                if (l) { return l; }
            } catch (_) {}
        }
        return sel.closest('label');
    }

    /* ---- the field: a button in the select's place ------------------------- */
    function enhance(sel) {
        if (sel.dccList || !wanted(sel)) { return; }
        var wrap = document.createElement('span');
        wrap.className = 'dcc_checkout-select';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dcc_checkout-select__button dcc_checkout-bare-button';
        btn.id = nextId('selbtn');
        setAttr(btn, 'aria-haspopup', 'listbox');
        setAttr(btn, 'aria-expanded', 'false');
        var text = document.createElement('span');
        text.className = 'dcc_checkout-select__text';
        btn.appendChild(text);
        wrap.appendChild(btn);

        // Named by its label, then by what it says now.
        var label = labelFor(sel);
        if (label && label !== btn) {
            if (!label.id) { label.id = nextId('sellabel'); }
            setAttr(btn, 'aria-labelledby', label.id + ' ' + btn.id);
        }

        // The field's own typography, measured from the select BEFORE it is
        // hidden, so the closed field looks exactly as it did — whatever the
        // theme sets on <button> (Bravada's Pavanam, the Elementor kit's 900
        // weight, capitalisation, letter-spacing) never reaches it.
        var cs = window.getComputedStyle(sel);
        ['fontFamily', 'fontWeight', 'fontStyle', 'letterSpacing', 'textTransform'].forEach(function (p) {
            btn.style[p] = cs[p];
        });

        sel.parentNode.insertBefore(wrap, sel.nextSibling);
        sel.classList.add('dcc_checkout-select-native');
        setAttr(sel, 'tabindex', '-1');
        setAttr(sel, 'aria-hidden', 'true');

        var ui = { wrap: wrap, btn: btn, text: text, label: label, msg: null };
        sel.dccList = ui;

        btn.addEventListener('click', function () {
            if (open && open.sel === sel) { close(true); } else { openList(sel); }
        });
        btn.addEventListener('keydown', function (e) { buttonKey(sel, e); });
        // A tap on the label would focus the hidden select — and on iOS that
        // can raise the native picker. It focuses the field instead.
        if (label) {
            label.addEventListener('click', function (e) {
                if (ui.wrap.contains(e.target)) { return; }
                e.preventDefault();
                btn.focus();
            });
        }
        // Anything that focuses the select itself (a <label for>, checkout.js
        // focusing an invalid dog field) lands on the field instead.
        sel.addEventListener('focus', function () { if (!btn.disabled) { btn.focus(); } });
        sel.addEventListener('change', function () { sync(sel); clearMessageIfValid(sel); });
        sel.addEventListener('invalid', function (e) { onInvalid(sel, e); });
        if ('MutationObserver' in window) {
            new MutationObserver(function () { sync(sel); }).observe(sel, {
                childList: true, subtree: true, characterData: true,
                attributes: true, attributeFilter: ['disabled', 'class', 'aria-invalid', 'hidden', 'selected', 'required']
            });
        }
        sync(sel);
    }

    // The button says what the select says. Re-run on any change; writes only
    // what differs.
    function sync(sel) {
        var ui = sel.dccList;
        if (!ui) { return; }
        if (!sel.isConnected) { retire(sel); return; }
        var opt = sel.options[sel.selectedIndex];
        setText(ui.text, opt ? opt.textContent : '');
        if (ui.btn.disabled !== sel.disabled) { ui.btn.disabled = sel.disabled; }
        // checkout.js's own validators mark the SELECT; mirror it.
        setClass(ui.btn, 'dcc_checkout-invalid',
            sel.classList.contains('dcc_checkout-invalid') || !!ui.msg);
        if (sel.getAttribute('aria-invalid') === 'true' || ui.msg) {
            setAttr(ui.btn, 'aria-invalid', 'true');
        } else {
            dropAttr(ui.btn, 'aria-invalid');
        }
        if (sel.required) { setAttr(ui.btn, 'aria-required', 'true'); } else { dropAttr(ui.btn, 'aria-required'); }
        if (open && open.sel === sel) { renderOptions(); }
    }

    function retire(sel) {
        var ui = sel.dccList;
        if (open && open.sel === sel) { close(false); }
        if (ui && ui.wrap.parentNode) { ui.wrap.parentNode.removeChild(ui.wrap); }
        sel.dccList = null;
    }

    /* ---- validation: only after a submit attempt --------------------------- */
    function onInvalid(sel, e) {
        var ui = sel.dccList;
        if (!ui) { return; }
        // Only after a submit attempt. checkout.js keeps the form in
        // "preflight" from load until the first press of a submit control
        // (armPreflight), so an `invalid` from a script's checkValidity() at
        // load shows nothing — Rob's rule, one definition of "attempt".
        if (sel.form && sel.form.classList.contains('dcc_checkout-preflight')) { return; }
        // The browser cannot show its bubble on a hidden control; say it here.
        e.preventDefault();
        if (!ui.msg) {
            ui.msg = document.createElement('span');
            ui.msg.className = 'dcc_checkout-field-error';
            ui.msg.id = nextId('selmsg');
            setAttr(ui.msg, 'role', 'alert');
            ui.wrap.appendChild(ui.msg);
        }
        setText(ui.msg, sel.validationMessage || '');
        setAttr(ui.btn, 'aria-describedby', ui.msg.id);
        sync(sel);
        // The FIRST invalid control of this attempt takes focus (roundStart()).
        if (roundFirst === sel) {
            try { ui.btn.focus(); } catch (_) {}
        }
    }

    // A choice that satisfies the select clears its message. (guest-count.js
    // clears the guest select's custom message in the capture phase, before
    // this runs.) Back on "— Select —", the message stays.
    // A submit attempt is a press of a submit control (Enter in a field
    // presses the default one too); the browser then fires `invalid` on every
    // invalid control, in document order, straight away. Only those — within
    // ROUND_MS of the press, a timestamp and never a timer — are the attempt's,
    // so a script's checkValidity() at another moment is not. The browser
    // reports only the first control it may: when the first is one of these
    // fields (handled above), a LATER native control's report is held back, or
    // the browser would jump focus past the field and bubble there. That
    // control gets its own bubble on the next attempt, as natively.
    function attemptStart(e) {
        var el = e.target && e.target.closest ? e.target.closest('input[type="submit"], button') : null;
        if (el && el.type === 'submit' && el.form) {
            attemptAt = Date.now();
            roundFirst = undefined;
        }
    }
    function roundStart(e) {
        var t = e.target;
        if (Date.now() - attemptAt > ROUND_MS) { return; }
        if (roundFirst === undefined) {
            roundFirst = t && t.dccList ? t : null;
        } else if (roundFirst && t && !t.dccList) {
            e.preventDefault();
        }
    }

    function clearMessageIfValid(sel) {
        var ui = sel.dccList;
        if (!ui || !ui.msg) { return; }
        if (sel.validity ? !sel.validity.valid : String(sel.value) === '') { return; }
        if (ui.msg.parentNode) { ui.msg.parentNode.removeChild(ui.msg); }
        ui.msg = null;
        dropAttr(ui.btn, 'aria-describedby');
        sync(sel);
    }

    /* ---- the list --------------------------------------------------------- */
    function openList(sel) {
        var ui = sel.dccList;
        if (!ui || ui.btn.disabled) { return; }
        if (open) { close(false); }
        var list = document.createElement('ul');
        list.className = 'dcc_checkout-select-list';
        list.id = nextId('sellist');
        setAttr(list, 'role', 'listbox');
        setAttr(list, 'tabindex', '-1');
        if (ui.label && ui.label.id) { setAttr(list, 'aria-labelledby', ui.label.id); }
        // The field's own typography and size (measured, as for the button).
        var bcs = window.getComputedStyle(ui.btn);
        list.style.fontFamily = bcs.fontFamily;
        list.style.fontSize = bcs.fontSize;
        list.style.fontWeight = bcs.fontWeight;
        list.style.letterSpacing = bcs.letterSpacing;
        list.style.textTransform = bcs.textTransform;
        list.style.borderRadius = bcs.borderTopLeftRadius;

        open = { sel: sel, ui: ui, list: list, active: -1, typed: '', typedAt: 0 };
        renderOptions();
        list.addEventListener('click', onListClick);
        list.addEventListener('keydown', onListKey);
        list.addEventListener('mousemove', onListHover);
        document.body.appendChild(list);
        place();
        setAttr(ui.btn, 'aria-expanded', 'true');
        setAttr(ui.btn, 'aria-controls', list.id);
        setClass(ui.btn, 'dcc_checkout-select__button--open', true);
        try { list.focus({ preventScroll: true }); } catch (_) { list.focus(); }
        scrollToActive(true);
    }

    function renderOptions() {
        var o = open;
        var opts = shownOptions(o.sel);
        var current = o.sel.options[o.sel.selectedIndex] || null;
        var keep = o.active >= 0 && o.items ? o.items[o.active] && o.items[o.active].opt : null;
        while (o.list.firstChild) { o.list.removeChild(o.list.firstChild); }
        o.items = opts.map(function (opt) {
            var li = document.createElement('li');
            li.className = 'dcc_checkout-select-list__option';
            li.id = nextId('selopt');
            setAttr(li, 'role', 'option');
            setAttr(li, 'aria-selected', opt === current ? 'true' : 'false');
            if (opt.disabled) { setAttr(li, 'aria-disabled', 'true'); }
            if (opt === current) { li.classList.add('dcc_checkout-select-list__option--selected'); }
            li.textContent = opt.textContent;
            o.list.appendChild(li);
            return { li: li, opt: opt };
        });
        var idx = -1;
        o.items.forEach(function (it, i) {
            if (it.opt === keep) { idx = i; }
        });
        if (idx < 0) {
            o.items.forEach(function (it, i) { if (it.opt === current) { idx = i; } });
        }
        setActive(idx);
    }

    function setActive(i) {
        var o = open;
        if (!o) { return; }
        o.active = i;
        o.items.forEach(function (it, j) {
            setClass(it.li, 'dcc_checkout-select-list__option--active', j === i);
        });
        if (i >= 0 && o.items[i]) {
            setAttr(o.list, 'aria-activedescendant', o.items[i].li.id);
        } else {
            dropAttr(o.list, 'aria-activedescendant');
        }
    }

    // Right under the field, the field's width; upward when there is not room
    // below and there is more above. Scrolls inside a max height.
    function place() {
        var o = open;
        var r = o.ui.btn.getBoundingClientRect();
        var vh = window.innerHeight || document.documentElement.clientHeight;
        var gap = 4;
        var below = vh - r.bottom - gap - 8;
        var above = r.top - gap - 8;
        o.list.style.width = r.width + 'px';
        o.list.style.left = (r.left + window.pageXOffset) + 'px';
        o.list.style.maxHeight = '';
        var natural = Math.min(o.list.scrollHeight, 320);
        var up = below < natural && above > below;
        var room = Math.max(up ? above : below, 132); // three rows, at the least
        o.list.style.maxHeight = Math.min(320, room) + 'px';
        var h = o.list.offsetHeight;
        o.list.style.top = (up ? r.top + window.pageYOffset - gap - h : r.bottom + window.pageYOffset + gap) + 'px';
        setClass(o.list, 'dcc_checkout-select-list--up', up);
    }

    // Opened scrolled to the current choice (centred where it can be).
    function scrollToActive(centre) {
        var o = open;
        if (!o || o.active < 0) { return; }
        var li = o.items[o.active].li;
        var top = li.offsetTop, bottom = top + li.offsetHeight;
        if (centre) {
            o.list.scrollTop = Math.max(0, top - (o.list.clientHeight - li.offsetHeight) / 2);
        } else if (top < o.list.scrollTop) {
            o.list.scrollTop = top;
        } else if (bottom > o.list.scrollTop + o.list.clientHeight) {
            o.list.scrollTop = bottom - o.list.clientHeight;
        }
    }

    function close(focusField) {
        var o = open;
        if (!o) { return; }
        open = null;
        if (o.list.parentNode) { o.list.parentNode.removeChild(o.list); }
        setAttr(o.ui.btn, 'aria-expanded', 'false');
        dropAttr(o.ui.btn, 'aria-controls');
        setClass(o.ui.btn, 'dcc_checkout-select__button--open', false);
        if (focusField) {
            try { o.ui.btn.focus({ preventScroll: true }); } catch (_) { o.ui.btn.focus(); }
        }
    }

    // A choice: the select takes it and fires its REAL events.
    function choose(i) {
        var o = open;
        if (!o || !o.items[i] || o.items[i].opt.disabled) { return; }
        var sel = o.sel, opt = o.items[i].opt;
        close(true);
        if (sel.value !== opt.value || sel.options[sel.selectedIndex] !== opt) {
            opt.selected = true;
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        sync(sel);
    }

    function onListClick(e) {
        var li = e.target.closest && e.target.closest('[role="option"]');
        if (!li || !open) { return; }
        var i = indexOfLi(li);
        if (i >= 0) { choose(i); }
    }

    function onListHover(e) {
        var li = e.target.closest && e.target.closest('[role="option"]');
        if (!li || !open) { return; }
        var i = indexOfLi(li);
        if (i >= 0 && i !== open.active && !open.items[i].opt.disabled) { setActive(i); }
    }

    function indexOfLi(li) {
        for (var i = 0; i < open.items.length; i++) {
            if (open.items[i].li === li) { return i; }
        }
        return -1;
    }

    function step(from, dir) {
        var n = open.items.length;
        for (var i = from + dir; i >= 0 && i < n; i += dir) {
            if (!open.items[i].opt.disabled) { return i; }
        }
        return from;
    }

    function onListKey(e) {
        var o = open;
        if (!o) { return; }
        var k = e.key;
        if (k === 'ArrowDown') { setActive(step(o.active, 1)); scrollToActive(false); }
        else if (k === 'ArrowUp') { setActive(step(o.active < 0 ? o.items.length : o.active, -1)); scrollToActive(false); }
        else if (k === 'Home') { setActive(step(-1, 1)); scrollToActive(false); }
        else if (k === 'End') { setActive(step(o.items.length, -1)); scrollToActive(false); }
        else if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
            if (k === ' ' && o.typed && Date.now() - o.typedAt < TYPE_AHEAD_MS) { typeAhead(' '); }
            else if (o.active >= 0) { choose(o.active); } else { close(true); }
        }
        else if (k === 'Escape' || k === 'Esc') { close(true); }
        else if (k === 'Tab') { close(true); }
        else if (k && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { typeAhead(k); }
        else { return; }
        e.preventDefault();
    }

    // Type-ahead (it matters for Country): letters typed within 700ms build a
    // prefix; the same letter repeated cycles through the matches. Timestamps,
    // never a timer.
    function typeAhead(ch) {
        var o = open;
        var now = Date.now();
        o.typed = (now - o.typedAt < TYPE_AHEAD_MS ? o.typed : '') + ch.toLowerCase();
        o.typedAt = now;
        var q = o.typed;
        var cycling = q.length > 1 && q.split('').every(function (c) { return c === q[0]; });
        if (cycling) { q = q[0]; }
        var n = o.items.length;
        var start = cycling || q.length === 1 ? o.active + 1 : Math.max(o.active, 0);
        for (var j = 0; j < n; j++) {
            var i = (start + j) % n;
            var it = o.items[i];
            if (!it.opt.disabled && String(it.opt.textContent).trim().toLowerCase().indexOf(q) === 0) {
                setActive(i);
                scrollToActive(false);
                return;
            }
        }
    }

    function buttonKey(sel, e) {
        var k = e.key;
        if (k === 'ArrowDown' || k === 'ArrowUp' || (k === 'Down' || k === 'Up')) {
            e.preventDefault();
            openList(sel);
        } else if (k && k.length === 1 && k !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            openList(sel);
            if (open) { typeAhead(k); }
        }
        // Enter and Space are the button's own click, which opens it.
    }

    /* ---- closing from outside --------------------------------------------- */
    function outside(e) {
        if (!open) { return; }                       // closed: nothing to do, nothing written
        var t = e.target;
        if (open.list.contains(t) || open.ui.btn.contains(t)) { return; }
        close(false);
    }

    function init() {
        var root = document.querySelector(ROOT_SEL);
        if (!root) { return; }
        Array.prototype.forEach.call(root.querySelectorAll('select'), enhance);
        document.addEventListener('click', attemptStart, true);
        document.addEventListener('invalid', roundStart, true);
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('touchstart', outside, { capture: true, passive: true });
        document.addEventListener('focusin', function (e) {
            if (open && !open.list.contains(e.target) && !open.ui.btn.contains(e.target)) { close(false); }
        }, true);
        // A width change reflows the page: the list would be adrift. A
        // HEIGHT-only resize is the iOS URL bar during ordinary scrolling and
        // changes nothing (CLAUDE.md: never act on a bare resize).
        var lastW = window.innerWidth;
        window.addEventListener('resize', function () {
            if (window.innerWidth !== lastW) {
                lastW = window.innerWidth;
                if (open) { close(false); }
            }
        });
        // A select MotoPress adds or replaces later gets its own field; a
        // field whose select has gone is removed.
        if ('MutationObserver' in window) {
            new MutationObserver(function (records) {
                records.forEach(function (r) {
                    Array.prototype.forEach.call(r.addedNodes, function (n) {
                        if (n.nodeType !== 1) { return; }
                        if (n.tagName === 'SELECT') { enhance(n); }
                        else if (n.querySelectorAll) { Array.prototype.forEach.call(n.querySelectorAll('select'), enhance); }
                    });
                    Array.prototype.forEach.call(r.removedNodes, function (n) {
                        if (n.nodeType !== 1) { return; }
                        var gone = n.tagName === 'SELECT' ? [n] : (n.querySelectorAll ? Array.prototype.slice.call(n.querySelectorAll('select')) : []);
                        gone.forEach(function (s) { if (s.dccList && !s.isConnected) { retire(s); } });
                    });
                });
            }).observe(root, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
