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
     * Item 2 — the follow-ups sit under the answer that reveals them
     * (picture 1)
     *
     * THE DOG HALF IS ALREADY RIGHT. checkout.js puts "Traveling with a dog?"
     * at the top of the Pet Information section and Dog Type / Size / Hair
     * below it, and folds the lot away on "No" — question above its
     * follow-ups, in one section, which is what Rob asked for. Nothing here
     * touches it.
     *
     * THE GUEST HALF IS NOT. checkout.js builds one section per extra guest
     * and stacks them after `.mphb-customer-details` — the customer block —
     * while the control that reveals them is the guest chooser, further up in
     * the accommodation block. So a guest picks 3 and the panel that appears
     * is somewhere else on the page. The sections are MOVED, whole, to sit
     * directly under the chooser's own row.
     *
     * MOVED, NOT REBUILT, and that is the rule Rob stated: each guest's
     * section element travels intact, never its inputs one by one. The rows
     * inside were themselves moved there by checkout.js from MotoPress's own
     * markup, so the inputs keep their names, their values and their
     * identity, and mphb-checkout-fields' own show/hide still has the same
     * nodes to work on. Nothing is cloned; nothing is created.
     *
     * AND IT MUST NOT FEED ITSELF. v0.32.1's iPhone bug — a select that
     * flashed open and shut — was exactly this shape on the admin side: a
     * mover that re-appended whenever a row was not last, a MutationObserver
     * that saw the move, and a loop that detached the focused control every
     * 200ms. So: nothing is written when the sections are already in place and
     * in order, and nothing is moved while focus is inside one of them.
     * --------------------------------------------------------------------- */

    /**
     * The guest-count chooser(s). The first four of the lookups guest-count.js
     * uses, and deliberately NOT its widest `select[name*="adults"]`: that one
     * also matches a service's own "for N" count and Add New's search step.
     *
     * THE TWO EXCLUSIONS BELOW ARE BELTS, AND SAYING SO IS THE POINT. On
     * today's markup neither can change the answer: the only other `[adults]`
     * select on the checkout belongs to a service, the services section comes
     * AFTER the room details, and the first match is the one used — so a
     * mutation removing them cannot be killed without a fixture that puts the
     * services first, which is not what MotoPress renders. They are kept
     * because the rule they encode (a service's own count is not the guest
     * count) is the one `admin-booking.js` learned the hard way in 0.28.0, and
     * they are NOT claimed to be under test.
     */
    function adultsSelects(root) {
        var out = [];
        var all = root.querySelectorAll('select[name]');
        for (var i = 0; i < all.length; i++) {
            var name = all[i].name || '';
            if (name.indexOf('[services]') !== -1) { continue; }
            if (name.indexOf('dcc_') === 0) { continue; }
            if (!/\[adults\]$/.test(name)) { continue; }
            out.push(all[i]);
        }
        return out;
    }

    /** The row the chooser lives in — what the panels go after. */
    function anchorFor(select) {
        return select.closest('p, li, div.mphb-room-details, div') || select.parentNode;
    }

    /**
     * The per-guest sections, IN GUEST ORDER — 2, then 3, then 4.
     *
     * Not DOM order. checkout.js builds them in guest order, so on today's
     * page the two agree and reading the DOM would look right; but anything
     * that reorders them (a MotoPress re-render, a future change to how they
     * are built) would then put Guest 3's panel above Guest 2's, and the page
     * would still pass a test that asked only "are they under the chooser".
     * The guest number is in the section's own class, which is the one place
     * it is stated. A section with no number keeps its relative DOM order,
     * after the numbered ones, rather than being dropped.
     */
    function guestSections(root) {
        var found = Array.prototype.slice.call(
            root.querySelectorAll('.dcc_checkout-guest-section')
        );
        return found.map(function (el, i) {
            var m = /dcc_checkout-guest(\d+)-section/.exec(el.className || '');
            return { el: el, n: m ? parseInt(m[1], 10) : 1e6, i: i };
        }).sort(function (a, b) {
            return a.n === b.n ? a.i - b.i : a.n - b.n;
        }).map(function (r) { return r.el; });
    }

    /** Is focus inside any of these nodes? Then nothing moves yet. */
    function holdsFocus(nodes) {
        var active = document.activeElement;
        if (!active) { return false; }
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i] === active || nodes[i].contains(active)) { return true; }
        }
        return false;
    }

    /**
     * Are the sections already immediately after the anchor, in order?
     *
     * This is the whole defence against the 0.32.1 loop: asking "is it already
     * right" before writing, rather than "is it last" — which is false as soon
     * as there are two of them and makes every run a move.
     */
    function inPlace(anchor, sections) {
        var at = anchor;
        for (var i = 0; i < sections.length; i++) {
            if (at.nextElementSibling !== sections[i]) { return false; }
            at = sections[i];
        }
        return true;
    }

    function place(root) {
        var selects = adultsSelects(root);
        if (!selects.length) { return; }
        var sections = guestSections(root);
        if (!sections.length) { return; }

        var anchor = anchorFor(selects[0]);
        if (!anchor || !anchor.parentNode || !root.contains(anchor)) { return; }
        /* An anchor inside one of the sections would make this move a node
           into its own descendant. It cannot happen with today's markup, but
           it is the one input that would throw rather than misbehave. */
        for (var i = 0; i < sections.length; i++) {
            if (sections[i].contains(anchor)) { return; }
        }

        if (inPlace(anchor, sections)) { return; }
        if (holdsFocus(sections)) {
            /* Wait for the guest to leave the field. Moving a focused input
               detaches it, and on iOS that closes the keyboard mid-answer. */
            root.addEventListener('focusout', function once() {
                root.removeEventListener('focusout', once);
                place(root);
            });
            return;
        }

        var at = anchor;
        sections.forEach(function (section) {
            at.parentNode.insertBefore(section, at.nextSibling);
            at = section;
        });

        /* MOVING CHANGES DOCUMENT ORDER, AND THE KEY HINTS ARE DOCUMENT ORDER.
           Without this, a move that happened after the hints were written left
           the wrong field saying "done" — which is exactly what a deferred
           move does: the hints run on `change`, the move waits for focusout,
           and the two never meet. Found by the suite, not by reading. */
        hints(root);
    }

    /* --------------------------------------------------------------------- *
     * Item 3 — SEGMENTED BUTTONS (picture 1, the G mockups)
     *
     * Guests, coat and boat become a row of buttons instead of a dropdown.
     * THE DOG QUESTION IS NOT HERE: checkout.js already builds it as a real
     * <fieldset> of Yes/No radios, so it is styled by checkout-layout.css and
     * never rebuilt — rebuilding it would take over the control that applies
     * the pet fee.
     *
     * THE SELECT REMAINS THE SOURCE OF TRUTH, exactly as select-list.js
     * (0.34.1) established for the dropdown list. The buttons set the select's
     * value and fire its real `input` and `change`, so MotoPress's own
     * re-price over admin-ajax happens precisely as it does today, and the
     * submitted data is the select's — not the buttons'.
     *
     * WHY THIS RUNS BEFORE select-list.js, AND WHY THAT IS A DEPENDENCY AND
     * NOT A COINCIDENCE: select-list.js turns EVERY visible select into a
     * button and a drawn list. Two controls for one field would be the result,
     * so each select this segments is marked `data-dcc-segmented`, which
     * select-list.js skips — and the marking has to happen first. Assets
     * declares `dcc-checkout-layout` as a dependency of the dropdown list when
     * the layout is active, so WordPress prints this script first and its
     * DOMContentLoaded handler runs first. The suite asserts the marker, and
     * select-list's own suite asserts it is honoured.
     *
     * A ROW OF BUTTONS IS ONLY WORTH IT FOR A SHORT LIST. Country has ~200
     * options and stays a drawn list; these three have 2-4. The cap is
     * explicit below, so a cottage with a large capacity cannot turn the guest
     * chooser into forty buttons.
     * --------------------------------------------------------------------- */

    /* Above this many choices, a dropdown is the better control and the
       select is left to select-list.js. */
    var SEGMENT_MAX = 6;

    function segmentSpecs() {
        var list = CFG.segmented;
        return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
    }

    /** Does this select match one of the specs? Returns the spec or null. */
    function specFor(select) {
        var name = String(select.name || '');
        var specs = segmentSpecs();
        for (var i = 0; i < specs.length; i++) {
            var spec = specs[i];
            var want = String(spec.name || '');
            if (!want) { continue; }
            if (spec.match === 'suffix') {
                if (name.length > want.length && name.slice(-want.length) === want) { return spec; }
            } else if (name === want) {
                return spec;
            }
        }
        return null;
    }

    /**
     * The options a guest may choose, as the select has them NOW.
     *
     * MIRRORS select-list.js's shownOptions(): checkout.js caps the guest
     * chooser above the offered count with `hidden` + a class + `disabled`
     * (0.25.2), and a capped option must not come back as a button. The two
     * rules have to agree, so the pair is named here and a mutation holds
     * each half.
     */
    function choosable(select) {
        return Array.prototype.filter.call(select.options, function (o) {
            if (o.hidden || o.classList.contains('dcc_checkout-option-hidden')) { return false; }
            /* The leading "— Select —" is not a choice; it is the absence of
               one, and item 10/0.34.0 both depend on an unchosen count staying
               unchosen. A segmented set simply shows nothing selected. */
            return String(o.value) !== '';
        });
    }

    /**
     * Turn one select into a labelled radio group.
     *
     * A real <fieldset>/<legend> with real radios, for the same reason
     * checkout.js's pet toggle is one: a span and a div did not read as a
     * group to assistive tech. Native radios also bring arrow-key movement,
     * roving focus and the focus ring for free.
     */
    function segment(select) {
        if (select.multiple || select.size > 1) { return false; }
        if (select.hasAttribute('data-dcc-segmented')) { return false; }
        var spec = specFor(select);
        if (!spec) { return false; }
        var options = choosable(select);
        if (options.length < 2 || options.length > SEGMENT_MAX) { return false; }

        var group = document.createElement('fieldset');
        group.className = 'dcc_layout-segment';
        group.setAttribute('data-dcc-injected', '1');

        var legend = document.createElement('legend');
        legend.className = 'dcc_layout-segment__legend';
        /* The field's own label if it has one, so a translated site keeps its
           words; the spec's label only when there is nothing on the page. */
        legend.appendChild(document.createTextNode(labelText(select) || spec.label || ''));
        group.appendChild(legend);

        /* THE OPTIONS GET THEIR OWN FLEX BOX, and the fieldset does not become
           one. A <legend> inside a `display: flex` fieldset is not a flex item
           and every engine lays it out specially, which is a class of quirk
           worth not standing on.
           WHAT THIS DID NOT DO, stated because the first version of this
           comment claimed it: it did not fix an overlap of the Submit button.
           Playwright refused to click that button while the fieldset was the
           flex container, and the obvious reading was that the option labels
           were covering it — but measuring the rectangles, before and after,
           shows no overlap in either shape. The refusal was the harness's own
           hit-testing on a very tall emulated page. The structure is kept on
           its own merits; the button's clear space is now asserted directly
           instead of being inferred from a harness error. */
        var options_box = document.createElement('div');
        options_box.className = 'dcc_layout-segment__options';
        group.appendChild(options_box);

        var name = 'dcc_seg_' + (select.name || 'field').replace(/[^A-Za-z0-9_]+/g, '_');
        var radios = [];
        options.forEach(function (option) {
            var label = document.createElement('label');
            label.className = 'dcc_layout-segment__option';
            var radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = name;
            radio.value = option.value;
            radio.className = 'dcc_layout-segment__radio';
            if (option.disabled) { radio.disabled = true; }
            if (select.value === option.value) { radio.checked = true; }
            var text = document.createElement('span');
            text.className = 'dcc_layout-segment__text';
            text.appendChild(document.createTextNode(option.textContent || option.value));
            label.appendChild(radio);
            label.appendChild(text);
            options_box.appendChild(label);
            radios.push(radio);
        });

        /* THE BUTTONS DRIVE THE SELECT, and the select tells MotoPress. */
        group.addEventListener('change', function (e) {
            var hit = e.target;
            if (!hit || hit.type !== 'radio' || !hit.checked) { return; }
            if (select.value === hit.value) { return; }
            select.value = hit.value;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        /* AND THE SELECT DRIVES THEM BACK, because other code sets it: item
           10's restore, checkout.js's own capping, and MotoPress's re-render
           presets. A one-way binding would show the guest a stale answer. */
        select.addEventListener('change', function () {
            radios.forEach(function (radio) {
                var want = radio.value === select.value;
                if (radio.checked !== want) { radio.checked = want; }
            });
        });

        /* The select stays in the form, and stays the thing that submits. It
           is hidden VISUALLY only — never `disabled`, never removed — which is
           the same rule 0.22.0 set for anything that carries money and
           0.34.1 set for the dropdown list. */
        select.setAttribute('data-dcc-segmented', '1');
        addClass(select, 'dcc_layout-segment__native');
        select.setAttribute('tabindex', '-1');
        select.setAttribute('aria-hidden', 'true');

        /* AFTER THE LABEL, NOT AFTER THE SELECT, when the label WRAPS it.
           MotoPress writes `<label>Coat <select>…</select></label>`, so
           inserting beside the select would put a <fieldset> inside a
           <label>, which the HTML spec does not allow, and would make the
           whole group part of the label's own activation area.
           MEASURED, SO THE CLAIM IS NOT OVERSTATED: with the group nested
           that way a tap on an option still set the select correctly. This is
           a validity and containment fix, not a repair of an observed
           breakage — the clipped select has `pointer-events: none`, which is
           what keeps the nested case harmless. */
        var ref = select;
        var wrapping = select.closest('label');
        if (wrapping && wrapping.contains(select) && wrapping !== select) {
            ref = wrapping;
        }
        ref.parentNode.insertBefore(group, ref.nextSibling);
        return true;
    }

    /** The field's visible label text, if the page has one. */
    function labelText(select) {
        var label = null;
        if (select.id) {
            try { label = document.querySelector('label[for="' + cssEscape(select.id) + '"]'); } catch (e) { label = null; }
        }
        if (!label) { label = select.closest('label'); }
        if (!label) { return ''; }
        /* The label may WRAP the control, so its textContent would include the
           options. Only the text nodes outside any control are the label. */
        var out = '';
        Array.prototype.forEach.call(label.childNodes, function (node) {
            if (node.nodeType === 3) { out += node.textContent; }
            else if (node.nodeType === 1 && !/^(SELECT|INPUT|TEXTAREA|BUTTON)$/.test(node.tagName)) {
                out += node.textContent;
            }
        });
        return out.replace(/\s+/g, ' ').trim();
    }

    function addClass(el, name) {
        if (!el.classList.contains(name)) { el.classList.add(name); }
    }

    function segments(root) {
        var all = root.querySelectorAll('select[name]');
        for (var i = 0; i < all.length; i++) { segment(all[i]); }
    }

    /* --------------------------------------------------------------------- *
     * Go
     * --------------------------------------------------------------------- */

    function init() {
        var root = form();
        if (!root) { return; }  /* the formless checkout is item 10's */
        /* BEFORE anything else, and before select-list.js runs: the marker it
           reads has to be on the select by the time it looks. */
        segments(root);
        place(root);
        autofill(root);
        hints(root);
        armEnter(root);
        /* A MotoPress re-render rebuilds the sections, so the placement is
           re-asserted on the same event the hints are. No observer and no
           timer of our own: checkout.js already owns that watch, and a second
           one is how the 0.32.1 loop started. */
        root.addEventListener('change', function () { place(root); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
