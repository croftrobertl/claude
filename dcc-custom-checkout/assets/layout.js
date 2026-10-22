/**
 * v0.35.0 — THE NEW /submit-booking/ LAYOUT, in the browser. Loaded only when
 * Layout::active() says this request gets it, so today's checkout is
 * untouched.
 *
 * ITEM 3a — ONE-TAP AUTOFILL (picture 8). The contact fields carry no
 * `autocomplete` token at all today, so a phone offers the guest nothing and
 * they type a name, a phone number, an email and an address by hand at 390px.
 * The tokens come from PHP, which reads the field names from the same place
 * the admin layout and the backstops do.
 *
 * `mphb_address1` NEVER GETS ONE. Google Places is bound to it (it carries
 * `autocomplete="off"` on live for exactly that reason), and an
 * `address-line1` token would stack the browser's own address sheet on top of
 * the Places dropdown — two pickers over one field, and the site's Customizer
 * CSS puts `.pac-container` at `z-index: 99999`, so the Places list is the one
 * that would win and the browser's would be stranded underneath it.
 *
 * ITEM 3b — NEXT, THEN DONE (picture 11).
 *
 *   THE KEY LABEL IS ONLY A LABEL. `enterkeyhint` changes the word on iOS's
 *   return key and nothing else: the BEHAVIOUR has to be implemented, because
 *   by default Enter in a text field inside a form with a submit button
 *   SUBMITS THE FORM. So on a managed field Enter never submits — it moves to
 *   the next visible field, or on the last one closes the keyboard. That is a
 *   real change and it is the point of the item: a guest who taps Done on the
 *   last field must not have their booking sent before they have read the
 *   price. The Submit button stays the only way to submit, which is already
 *   true of MotoPress's own flow (it submits over REST from the button).
 *
 *   NEXT SKIPS WHAT IS FOLDED AWAY. The Guest 3 panel and the dog fields are
 *   hidden until the answers above open them, and focusing a field inside a
 *   `display: none` panel does nothing at all on iOS — the keyboard closes and
 *   the guest is left looking at a page that did not move. So the chain is
 *   recomputed on every press from what is visible AT THAT MOMENT, never
 *   cached at load.
 *
 * TAP RULES (0.18.0). Everything here is attributes written ONCE at init and
 * `focus()`/`blur()` calls, which are not DOM mutations. No timer, no
 * observer, nothing scheduled, nothing on hover or touchstart. The suite pins
 * idle mutations at 0.
 */
(function () {
    'use strict';

    var CFG = window.DCC_LAYOUT || {};
    var TOKENS = CFG.autocomplete || {};
    var PLACES = CFG.placesField || 'mphb_address1';

    /* The input types a guest TYPES into. A <select> is deliberately not in
       the Next chain: select-list.js (0.34.1) hides every visible select
       behind a button of the site's own, so focusing the select itself would
       reopen the native picker that release exists to replace — and the
       keyboard is not open on a dropdown anyway, so there is no Next key to
       press. Revisit when item 3's segmented buttons land. A <textarea> is
       excluded too: Enter there is a new line, which is what the guest means. */
    var TYPED = ['text', 'email', 'tel', 'number', 'url', 'search', 'password'];

    function form() {
        return document.querySelector('form.mphb_sc_checkout-form');
    }

    /* --------------------------------------------------------------------- *
     * Item 3a — the tokens
     * --------------------------------------------------------------------- */

    /**
     * Write each field's token, once.
     *
     * `setAttribute` is only called when the value would change, per 0.18.0 —
     * a no-op `setAttribute` still queues a MutationRecord, and that is what
     * cost six diagnostic rounds on the owner's phone.
     */
    function autofill(root) {
        Object.keys(TOKENS).forEach(function (name) {
            if (name === PLACES) { return; }  /* belt; PHP removes it too */
            var token = TOKENS[name];
            if (!token) { return; }
            var fields = root.querySelectorAll('[name="' + cssEscape(name) + '"]');
            for (var i = 0; i < fields.length; i++) {
                if (fields[i].getAttribute('autocomplete') !== token) {
                    fields[i].setAttribute('autocomplete', token);
                }
            }
        });
    }

    /* A name can hold brackets and hyphens; CSS.escape is not in every
       browser this site serves, so the characters a MotoPress field name can
       actually contain are escaped by hand. */
    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(value);
        }
        return String(value).replace(/([\[\]().:#$%&'"*+,\/;<=>?@^`{|}~!])/g, '\\$1');
    }

    /* --------------------------------------------------------------------- *
     * Item 3b — Next, then Done
     * --------------------------------------------------------------------- */

    function managed(root) {
        var out = [];
        var all = root.querySelectorAll('input[name], textarea[name]');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            /* A <textarea> is excluded by the type test alone — its `type` is
               always "textarea", which is not in TYPED. There WAS a separate
               `tagName === 'TEXTAREA'` line here; mutation lf-textarea-managed
               removed it and nothing failed, because it could never be the
               thing doing the work. Dead code that reads as a guard is worse
               than no guard, so it is gone and mutation lf-textarea-typed
               tests the test that really holds the line. */
            if (TYPED.indexOf((el.type || '').toLowerCase()) === -1) { continue; }
            if (el.disabled || el.readOnly) { continue; }
            out.push(el);
        }
        return out;
    }

    /**
     * Is this field on the page as far as the guest is concerned?
     *
     * `offsetParent` is null for anything inside a `display: none` ancestor,
     * which is how every folded panel on this checkout is hidden
     * (`.dcc_checkout-section-hidden` and friends, all `display: none
     * !important`). It is the cheapest test that answers the real question and
     * it needs no layout assumptions.
     *
     * NOT used on a <select>: select-list.js hides those with a 1px clip and
     * `opacity: 0`, which leaves `offsetParent` set — the repo's rule is that
     * anything judging a select's visibility must ask shownFieldFor(). No
     * select is in this chain, which is why that rule is not in play here.
     */
    function onPage(el) {
        return !!el.offsetParent;
    }

    /** The visible managed fields, in document order, computed fresh. */
    function chain(root) {
        return managed(root).filter(onPage);
    }

    /**
     * The key hints.
     *
     * Written at init for the fields that exist then, and again whenever the
     * visible set changes — the last VISIBLE field is the one that says
     * "done", and that moves when a panel opens. Re-running is idempotent:
     * nothing is written unless the attribute would change.
     */
    function hints(root) {
        var open = chain(root);
        var last = open.length ? open[open.length - 1] : null;
        managed(root).forEach(function (el) {
            var want = el === last ? 'done' : 'next';
            if (el.getAttribute('enterkeyhint') !== want) {
                el.setAttribute('enterkeyhint', want);
            }
        });
    }

    /**
     * Enter on a managed field: move on, or close the keyboard. Never submit.
     *
     * Delegated on the form, so a field MotoPress re-renders is covered with
     * no re-binding and nothing to clean up.
     */
    function armEnter(root) {
        root.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.keyCode !== 13) { return; }
            var el = e.target;
            if (!el || managed(root).indexOf(el) === -1) { return; }

            /* ALWAYS, for both Next and Done. Without this the browser's
               implicit submission sends the booking from the return key —
               which is the defect the required mutation reproduces. */
            e.preventDefault();

            var open = chain(root);
            var at = open.indexOf(el);
            if (at === -1) { return; }
            if (at + 1 < open.length) {
                open[at + 1].focus();
                return;
            }
            /* The last visible field: close the keyboard and leave the guest
               looking at the page, with the Submit button the only way on. */
            el.blur();
        });

        /* A panel opening or closing moves which field is last, so the hints
           are refreshed after the answers that fold things in and out. `change`
           is what checkout.js itself reacts to, so this runs after it on the
           same event rather than watching the DOM for its work. */
        root.addEventListener('change', function () { hints(root); });
    }

    /* --------------------------------------------------------------------- *
     * Go
     * --------------------------------------------------------------------- */

    function init() {
        var root = form();
        if (!root) { return; }  /* the formless checkout is item 10's */
        autofill(root);
        hints(root);
        armEnter(root);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
