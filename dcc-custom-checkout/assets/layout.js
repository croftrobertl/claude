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

    /**
     * A control's visible label text, if the page has one.
     *
     * Named for the select it was written for, but used for any control (the
     * bar's "Next: Phone" asks the same question of a text field). It reads
     * only the text OUTSIDE any form control, because a label may WRAP its
     * field and its textContent would then include the options.
     */
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
     * Item 4 — "Have A Coupon Code?" (picture G, the price card)
     *
     * The field is MotoPress's own and stays exactly where MotoPress put it;
     * it is folded behind a link until the guest wants it. Everything else in
     * item 4 is already MotoPress's: checkout.js reshapes the breakdown
     * without doing arithmetic, the per-night expander is MotoPress's own
     * control and the "Taxes ✱" footnote is v0.14.0's.
     *
     * IT STAYS OPEN ONCE IT MATTERS. A coupon that has been applied must not
     * disappear behind a link — so the row is open if the field has a value,
     * if anything inside the row is showing a message, or if the guest opened
     * it in this page view. The LAST of those is why the flag is kept on the
     * form rather than in a closure: MotoPress re-renders this area whenever
     * the price changes, and a guest who had opened the row would otherwise
     * watch it fold itself away mid-typing.
     * --------------------------------------------------------------------- */

    function couponField(root) {
        var cfg = CFG.coupon || {};
        var name = cfg.field || 'mphb_coupon_code';
        return root.querySelector('[name="' + cssEscape(name) + '"]');
    }

    function coupon(root) {
        var field = couponField(root);
        if (!field) { return; }
        var row = field.closest('p, li, div') || field.parentNode;
        if (!row || row === root) { return; }
        if (row.querySelector('.dcc_layout-coupon__reveal')) { return; }

        var open = String(field.value || '') !== '' ||
            root.getAttribute('data-dcc-coupon-open') === '1' ||
            hasMessage(row);

        var link = document.createElement('button');
        link.type = 'button';
        /* A real button, not an <a>: 0.17.0 measured an anchor losing 15 of 18
           clean taps on the owner's iPhone where a button lost none. The bare
           class is what keeps the site button spec off it (0.17.0). */
        link.className = 'dcc_layout-coupon__reveal dcc_checkout-bare-button';
        link.setAttribute('data-dcc-injected', '1');
        link.setAttribute('aria-expanded', open ? 'true' : 'false');
        link.appendChild(document.createTextNode((CFG.coupon || {}).reveal || ''));
        link.addEventListener('click', function () {
            var nowOpen = row.classList.contains('dcc_layout-coupon--open');
            setOpen(!nowOpen);
            if (!nowOpen) { field.focus(); }
        });

        function setOpen(want) {
            if (row.classList.contains('dcc_layout-coupon--open') !== want) {
                row.classList.toggle('dcc_layout-coupon--open', want);
            }
            if (link.getAttribute('aria-expanded') !== (want ? 'true' : 'false')) {
                link.setAttribute('aria-expanded', want ? 'true' : 'false');
            }
            /* Remembered on the FORM, so a MotoPress re-render cannot fold an
               open row away under the guest. */
            var mark = want ? '1' : '0';
            if (root.getAttribute('data-dcc-coupon-open') !== mark) {
                root.setAttribute('data-dcc-coupon-open', mark);
            }
        }

        addClass(row, 'dcc_layout-coupon');
        row.parentNode.insertBefore(link, row);
        setOpen(open);
    }

    /** Is anything inside this row showing a message to the guest? */
    function hasMessage(row) {
        var notes = row.querySelectorAll('[class*="error"], [class*="notice"], [class*="message"]');
        for (var i = 0; i < notes.length; i++) {
            if (String(notes[i].textContent || '').trim() !== '' && notes[i].offsetParent) {
                return true;
            }
        }
        return false;
    }

    /* --------------------------------------------------------------------- *
     * Item 5 — THE PHOTO ID, AFTER CHOOSING A FILE (picture 2)
     *
     * NOTHING IS UPLOADED HERE. The preview is drawn from the File the browser
     * already holds; MotoPress's own input is left exactly as rendered, so the
     * upload still happens on submit and the protected store is still the only
     * place the image lands. Item 10 never writes the file to storage either.
     *
     * THE OBJECT URL IS REVOKED ON EVERY CHANGE. Each createObjectURL pins the
     * whole file in memory until it is revoked, and a guest who picks three
     * photos on a phone would otherwise hold three of them — on the device
     * with the least memory to spare, in the middle of paying.
     *
     * A PDF, OR AN IMAGE THE BROWSER CANNOT DRAW (a HEIC outside Safari, which
     * is the common case straight off an iPhone), gets a document icon instead.
     * That is decided by the image failing to load, not by sniffing the name:
     * the only reliable answer to "can this browser draw this" is to try.
     * --------------------------------------------------------------------- */

    var lastObjectUrl = null;

    function uploadField(root) {
        var cfg = CFG.upload || {};
        var name = cfg.field || 'mphb_upload_id';
        var el = root.querySelector('input[type="file"][name="' + cssEscape(name) + '"]');
        return el || root.querySelector('input[type="file"]');
    }

    function upload(root) {
        var input = uploadField(root);
        if (!input) { return; }
        var cfg = CFG.upload || {};

        var box = document.createElement('div');
        box.className = 'dcc_layout-id';
        box.setAttribute('data-dcc-injected', '1');
        box.hidden = true;
        var row = input.closest('p, li, div') || input.parentNode;
        row.parentNode.insertBefore(box, row.nextSibling);

        input.addEventListener('change', function () {
            show(input.files && input.files[0] ? input.files[0] : null);
        });

        function show(file) {
            /* Always let the previous file go, whatever happens next. */
            if (lastObjectUrl) {
                URL.revokeObjectURL(lastObjectUrl);
                lastObjectUrl = null;
            }
            while (box.firstChild) { box.removeChild(box.firstChild); }
            if (!file) {
                if (!box.hidden) { box.hidden = true; }
                return;
            }

            var thumb = document.createElement('div');
            thumb.className = 'dcc_layout-id__thumb';
            box.appendChild(thumb);

            var meta = document.createElement('div');
            meta.className = 'dcc_layout-id__meta';
            var nameLine = document.createElement('p');
            nameLine.className = 'dcc_layout-id__name';
            nameLine.appendChild(document.createTextNode(file.name || ''));
            var sizeLine = document.createElement('p');
            sizeLine.className = 'dcc_layout-id__size';
            sizeLine.appendChild(document.createTextNode(fileSize(file.size)));
            var ready = document.createElement('p');
            ready.className = 'dcc_layout-id__ready';
            ready.appendChild(document.createTextNode('\u2713 ' + (cfg.ready || '')));
            meta.appendChild(nameLine);
            meta.appendChild(sizeLine);
            meta.appendChild(ready);
            box.appendChild(meta);

            var change = document.createElement('button');
            change.type = 'button';
            change.className = 'dcc_layout-id__change';
            change.appendChild(document.createTextNode(cfg.change || ''));
            change.addEventListener('click', function () { input.click(); });
            box.appendChild(change);

            box.hidden = false;

            /* TRY TO DRAW IT. An <img> that fails is the only reliable test of
               whether this browser can render this file. */
            var url = URL.createObjectURL(file);
            lastObjectUrl = url;
            var img = document.createElement('img');
            img.className = 'dcc_layout-id__image';
            /* Decoded off the main thread, at the size it is shown, so a 12MP
               photo does not block the page while the guest is typing. */
            img.decoding = 'async';
            img.loading = 'eager';
            img.alt = '';
            img.width = 64;
            img.height = 64;
            img.addEventListener('load', function () {
                thumb.appendChild(img);
            });
            img.addEventListener('error', function () {
                thumb.appendChild(documentIcon(cfg.document || ''));
            });
            img.src = url;
        }
    }

    /** A document icon for a file the browser cannot draw. */
    function documentIcon(text) {
        var wrap = document.createElement('span');
        wrap.className = 'dcc_layout-id__doc';
        wrap.setAttribute('role', 'img');
        wrap.setAttribute('aria-label', text);
        /* Inline, because the one thing this page must not do for a decoration
           is make another request. */
        wrap.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path fill="currentColor" d="M6 2h7l5 5v15H6V2zm7 1.5V8h4.5L13 3.5z"/></svg>';
        return wrap;
    }

    /** "1.2 MB", in the site's own words. */
    function fileSize(bytes) {
        var units = (CFG.upload || {}).units || ['bytes', 'KB', 'MB'];
        var n = Number(bytes) || 0;
        if (n < 1024) { return n + ' ' + units[0]; }
        if (n < 1024 * 1024) { return Math.round(n / 1024) + ' ' + units[1]; }
        return (Math.round(n / (1024 * 1024) * 10) / 10) + ' ' + units[2];
    }

    /* --------------------------------------------------------------------- *
     * ITEMS 6 and 7 — THE PINNED BAR (pictures 3 and 4)
     *
     * IT IS ATTACHED TO document.body, OUTSIDE article.hentry, AND THAT IS
     * NOT A PREFERENCE. Bravada puts a `matrix3d(…)` transform on
     * article.hentry, and a transformed ancestor becomes the containing block
     * for `position: fixed` — the Director measured a fixed box inside that
     * article drifting 2,156px off-screen. The suite asserts the parent, not
     * the intention.
     *
     * THE TOTAL IS COPIED FROM MOTOPRESS'S OWN CELL, NEVER COMPUTED. Rob's
     * rule, and the same rule checkout.js's breakdown already follows: every
     * figure shown is one MotoPress rendered. The bar reads the last cell of
     * the breakdown's total row as a STRING and puts that string on screen; it
     * does no arithmetic, parses no currency and knows nothing about tax.
     * While MotoPress is re-pricing it says "Updating…" rather than a stale
     * number.
     *
     * IT NEVER SHOWS AN ERROR BEFORE SUBMIT (Rob's standing rule, and 0.15.0's
     * mechanism): the "N Need Attention" state reads the flags the EXISTING
     * preflight sets — `.dcc_checkout-invalid`, which checkout.js's own submit
     * validator applies — and the form carries `.dcc_checkout-preflight` until
     * the first submit attempt. There is no second validator here, and
     * nothing in this file decides whether a field is valid.
     * --------------------------------------------------------------------- */

    var BAR_CLASS = 'dcc_layout-bar';

    function barText() { return CFG.bar || {}; }

    /** MotoPress's own total, as a string, or '' when there is not one yet. */
    function motopressTotal(root) {
        var row = root.querySelector('.dcc_checkout-breakdown-total');
        if (!row) { return ''; }
        var cells = row.querySelectorAll('td, th');
        if (!cells.length) { return ''; }
        /* The LAST cell is the amount; the first is its label. Read as text,
           never parsed — this file must not be able to produce a number. */
        return String(cells[cells.length - 1].textContent || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * The required fields a guest still has to fill, in document order.
     *
     * `required` is MotoPress's own attribute plus whatever checkout.js has
     * set for the sections it reveals (setRequired), so this reads the page's
     * own idea of what is needed and invents none of its own. Hidden fields
     * are skipped: a folded Guest 3 panel is not something to send anyone to.
     */
    function emptyRequired(root) {
        var out = [];
        var all = root.querySelectorAll('[required]');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (el.disabled || !onPage(el) && !shownFor(el)) { continue; }
            if (el.type === 'checkbox' || el.type === 'radio') {
                if (!checkedInGroup(root, el)) { out.push(el); }
                continue;
            }
            if (String(el.value || '').trim() === '') { out.push(el); }
        }
        return out;
    }

    /**
     * Is this control on the page as far as the guest is concerned?
     *
     * A select this file has segmented, or select-list.js has replaced, is
     * clipped to 1px with opacity 0 — `offsetParent` is still set, so onPage()
     * says yes, which is right: the guest can see and use its stand-in. What
     * must NOT happen is sending the guest to a control inside a folded panel,
     * and that is what onPage() answers. This helper exists so the intent is
     * stated rather than implied.
     */
    function shownFor(el) {
        return !!el.offsetParent;
    }

    function checkedInGroup(root, el) {
        if (el.type === 'checkbox') { return el.checked; }
        var mates = root.querySelectorAll('input[type="radio"][name="' + cssEscape(el.name || '') + '"]');
        for (var i = 0; i < mates.length; i++) {
            if (mates[i].checked) { return true; }
        }
        return false;
    }

    /** The flagged fields, from the EXISTING preflight. Never re-validated. */
    function flagged(root) {
        var out = [];
        var all = root.querySelectorAll('.dcc_checkout-invalid, [aria-invalid="true"]');
        for (var i = 0; i < all.length; i++) {
            if (out.indexOf(all[i]) === -1) { out.push(all[i]); }
        }
        return out;
    }

    /** A field's own label text, for "Next: Phone". */
    function fieldName(el) {
        var text = labelText(el);
        if (text !== '') { return text.replace(/\s*\*\s*$/, '').replace(/:$/, ''); }
        return el.getAttribute('placeholder') || el.name || '';
    }

    function buildBar(root) {
        var bar = document.createElement('div');
        bar.className = BAR_CLASS;
        bar.setAttribute('data-dcc-injected', '1');
        /* Announced when it changes, but never stealing focus. */
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-live', 'polite');

        var left = document.createElement('div');
        left.className = 'dcc_layout-bar__total';
        var label = document.createElement('span');
        label.className = 'dcc_layout-bar__label';
        var amount = document.createElement('span');
        amount.className = 'dcc_layout-bar__amount';
        var note = document.createElement('span');
        note.className = 'dcc_layout-bar__note';
        left.appendChild(label);
        left.appendChild(amount);
        left.appendChild(note);

        var action = document.createElement('button');
        action.type = 'button';
        action.className = 'dcc_layout-bar__action';

        bar.appendChild(left);
        bar.appendChild(action);

        /* OUTSIDE article.hentry — see the note above. Appended to <body>, so
           no transformed ancestor can become its containing block. */
        document.body.appendChild(bar);
        return { el: bar, label: label, amount: amount, note: note, action: action };
    }

    function pinnedBar(root) {
        var T = barText();
        var ui = buildBar(root);
        var state = { mode: '', at: 0 };
        var submitting = false;

        function nativeSubmits() {
            return root.querySelectorAll(
                '[type="submit"], button:not([type="button"]):not(.' + BAR_CLASS + '__action)');
        }

        function render() {
            var attempted = !root.classList.contains('dcc_checkout-preflight');
            var bad = attempted ? flagged(root) : [];
            var empty = emptyRequired(root);

            /* The total, copied. */
            setBarText(ui.label, T.total || '');
            setBarText(ui.amount, updating ? (T.updating || '') : motopressTotal(root));
            setClass(ui.el, 'dcc_layout-bar--updating', updating);

            if (bad.length) {
                /* ITEM 7 — only ever after a submit attempt. */
                state.mode = 'attention';
                if (state.at >= bad.length) { state.at = 0; }
                setBarText(ui.note, fmt(T.attention || '', [bad.length]));
                setBarText(ui.action, fmt(T.showMe || '', [state.at + 1, bad.length]));
                setClass(ui.el, 'dcc_layout-bar--attention', true);
                setClass(ui.el, 'dcc_layout-bar--ready', false);
                return;
            }

            setClass(ui.el, 'dcc_layout-bar--attention', false);

            if (empty.length) {
                state.mode = 'next';
                setBarText(ui.note, '');
                setBarText(ui.action, fmt(T.next || '', [fieldName(empty[0])]) + ' \u2193');
                setClass(ui.el, 'dcc_layout-bar--ready', false);
                return;
            }

            state.mode = 'submit';
            setBarText(ui.note, T.allSet || '');
            setBarText(ui.action, '\u2713 ' + (T.submit || ''));
            setClass(ui.el, 'dcc_layout-bar--ready', true);
        }

        function requestRender() { defer(render); }

        ui.action.addEventListener('click', function () {
            if (state.mode === 'attention') {
                var bad = flagged(root);
                if (!bad.length) { render(); return; }
                goTo(bad[state.at % bad.length]);
                state.at = (state.at + 1) % bad.length;
                render();
                return;
            }
            if (state.mode === 'next') {
                var empty = emptyRequired(root);
                if (empty.length) { goTo(empty[0]); }
                return;
            }
            /* THE REAL FORM IS SUBMITTED — the bar is not a second form, and
               it carries no fields of its own. */
            if (submitting) { return; }
            lockSubmits();
            if (typeof root.requestSubmit === 'function') {
                root.requestSubmit();
            } else {
                var native = nativeSubmits();
                if (native.length) { native[0].click(); } else { root.submit(); }
            }
        });

        /**
         * BOTH SUBMIT BUTTONS LOCK AFTER THE FIRST PRESS (Rob). A double
         * submit on a booking form is a double booking, and the guest cannot
         * tell they have pressed twice when the page does not move.
         */
        function lockSubmits() {
            submitting = true;
            setAttr(ui.action, 'disabled', '');
            setClass(ui.el, 'dcc_layout-bar--sent', true);
            var native = nativeSubmits();
            for (var i = 0; i < native.length; i++) {
                setAttr(native[i], 'disabled', '');
            }
        }
        root.addEventListener('submit', lockSubmits);
        root.addEventListener('click', function (e) {
            var hit = e.target;
            if (!hit || !hit.closest || !hit.closest('[type="submit"]')) { return; }
            /* AFTER THE PRESS HAS BEEN LET THROUGH, never during it.
               Disabling a submit button inside its own click event cancels the
               submission the browser was about to make — so locking on the
               spot would stop the FIRST press, which is the one that must
               work. Measured: the suite's "the Submit button still submits"
               went red the moment this ran synchronously. A task deferral is
               enough: the browser has dispatched the submit by then, and a
               second press cannot arrive inside the same task. */
            setTimeout(lockSubmits, 0);
        });

        /* Re-read on anything that can change the answer. The breakdown is
           re-rendered by MotoPress, so checkout.js's own observer is not the
           only source — but no observer is installed here: `input` and
           `change` cover typing and choosing, and the AJAX hooks below cover
           the price. */
        /* THE BAR'S WRITES ARE REAL WRITES, AND THEY ARE GATED ON TOUCH.
           Its words genuinely change as the guest fills the form — that is the
           feature, not a no-op — but v0.18.0 closed the three-tap bug by
           making sure nothing on this checkout changes content around a tap:
           iOS decides click-vs-hover by watching for exactly that. So a change
           asked for while a finger is down is remembered and written once the
           tap has had its time, and every write is still idempotent. */
        root.addEventListener('input', requestRender);
        root.addEventListener('change', requestRender);

        padPage(ui.el);
        render();
        return { render: requestRender, el: ui.el };
    }

    /* --------------------------------------------------------------------- *
     * The touch gate (v0.18.0's rule, applied to this file's own writes)
     * --------------------------------------------------------------------- */

    var fingerDown = false;
    var pending = [];

    function armTouchGate() {
        if (!('ontouchstart' in window) && !window.PointerEvent) { return; }
        document.addEventListener('touchstart', function () {
            fingerDown = true;
        }, { passive: true });
        var up = function () {
            fingerDown = false;
            if (!pending.length) { return; }
            var run = pending;
            pending = [];
            /* 450ms, the same settle v0.18.0 uses: long enough for the tap to
               have resolved into a click before anything on the page moves. */
            setTimeout(function () {
                run.forEach(function (fn) { fn(); });
            }, 450);
        };
        document.addEventListener('touchend', up, { passive: true });
        document.addEventListener('touchcancel', up, { passive: true });
    }

    /** Write now, or once the finger is up. */
    function defer(fn) {
        if (!fingerDown) { fn(); return; }
        if (pending.indexOf(fn) === -1) { pending.push(fn); }
    }

    /**
     * "Updating…" WHILE MOTOPRESS IS RE-PRICING.
     *
     * Watched by wrapping XMLHttpRequest, the same seam guest-count.js uses
     * for the recalc request (0.34.1) and for the same reason: it needs only
     * what the page does, not how MotoPress's server parses anything. A
     * request this does not recognise is ignored.
     */
    var updating = false;
    function watchRecalc(onChange) {
        if (!window.XMLHttpRequest) { return; }
        var Open = XMLHttpRequest.prototype.open;
        var Send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.__dccRecalc = typeof url === 'string' &&
                url.indexOf('mphb_update_checkout_info') !== -1;
            return Open.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            var xhr = this;
            if (xhr.__dccRecalc) {
                updating = true;
                onChange();
                xhr.addEventListener('loadend', function () {
                    updating = false;
                    onChange();
                });
            }
            return Send.apply(this, arguments);
        };
    }

    /** Scroll to a field and focus it, respecting reduced motion. */
    function goTo(el) {
        var reduced = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
            el.scrollIntoView({
                behavior: reduced ? 'auto' : 'smooth',
                block: 'center',
            });
        } catch (e) {
            el.scrollIntoView();
        }
        /* The stand-in for a segmented or listed select is what the guest can
           actually focus; the clipped select would take the focus nowhere. */
        var target = standInFor(el) || el;
        try { target.focus({ preventScroll: true }); } catch (e2) { target.focus(); }
    }

    /** The visible control standing in for a clipped select, if there is one. */
    function standInFor(el) {
        if (el.tagName !== 'SELECT') { return null; }
        if (el.hasAttribute('data-dcc-segmented')) {
            var group = el.parentNode.querySelector('.dcc_layout-segment__radio:checked') ||
                el.parentNode.querySelector('.dcc_layout-segment__radio');
            return group || null;
        }
        /* select-list.js's own button, if it took this select. */
        return (el.dccList && el.dccList.field) || null;
    }

    /**
     * THE PAGE IS PADDED BY THE BAR'S HEIGHT, so the last field and the
     * Submit button are not stuck underneath it. Measured, not assumed: the
     * bar's height depends on the words in it, which are translatable.
     */
    function padPage(bar) {
        var apply = function () {
            if (getComputedStyle(bar).position !== 'fixed') {
                if (document.body.style.getPropertyValue('--dcc-bar-height') !== '') {
                    document.body.style.removeProperty('--dcc-bar-height');
                }
                return;
            }
            var h = Math.ceil(bar.getBoundingClientRect().height);
            var want = h + 'px';
            if (document.body.style.getPropertyValue('--dcc-bar-height') !== want) {
                document.body.style.setProperty('--dcc-bar-height', want);
            }
        };
        apply();
        /* A width change can move the bar between pinned and not, and change
           its height. HEIGHT-ONLY resizes are ignored: on iOS `resize` fires
           when the URL bar collapses during ordinary scrolling, and writing
           layout then is the defect v0.13.0 fixed in matchFileFieldWidth(). */
        var lastWidth = window.innerWidth;
        window.addEventListener('resize', function () {
            if (window.innerWidth === lastWidth) { return; }
            lastWidth = window.innerWidth;
            apply();
        });
    }

    /**
     * HIDE WHILE THE KEYBOARD IS UP, OR WHILE THE ADDRESS LIST IS SHOWING.
     *
     * The keyboard: `visualViewport`'s resize, plus focusin/focusout — NO
     * POLLING (Rob). On iOS the keyboard does not change `window.innerHeight`
     * but does shrink the visual viewport, so the two signals together are
     * what answers it.
     *
     * The address list: Google Places draws `.pac-container` at `z-index:
     * 99999` (the site's own Customizer CSS), so it would be over the bar and
     * the bar would be under the suggestions the guest is trying to tap.
     */
    function armHiding(bar, onChange) {
        var hidden = false;
        function set(want) {
            if (hidden === want) { return; }
            hidden = want;
            setClass(bar, 'dcc_layout-bar--away', want);
            onChange();
        }
        function typing() {
            var el = document.activeElement;
            if (!el) { return false; }
            var tag = el.tagName;
            if (tag === 'TEXTAREA') { return true; }
            if (tag !== 'INPUT') { return false; }
            return TYPED.indexOf((el.type || '').toLowerCase()) !== -1;
        }
        function placesOpen() {
            var list = document.querySelectorAll('.pac-container');
            for (var i = 0; i < list.length; i++) {
                if (list[i].offsetParent && list[i].getBoundingClientRect().height > 0) {
                    return true;
                }
            }
            return false;
        }
        function evaluate() { set(typing() || placesOpen()); }

        document.addEventListener('focusin', evaluate);
        document.addEventListener('focusout', function () {
            /* After the blur has landed, so the next focus is already in. */
            setTimeout(evaluate, 0);
        });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', evaluate);
        }
        return evaluate;
    }

    function setBarText(el, text) {
        var want = String(text == null ? '' : text);
        if (el.textContent !== want) { el.textContent = want; }
    }
    function setClass(el, name, on) {
        if (el.classList.contains(name) !== !!on) { el.classList.toggle(name, !!on); }
    }
    function setAttr(el, name, value) {
        if (el.getAttribute(name) !== value) { el.setAttribute(name, value); }
    }
    /** sprintf for the two placeholders these strings use. */
    function fmt(template, args) {
        var out = String(template);
        out = out.replace(/%1\$s/g, String(args[0])).replace(/%2\$s/g, String(args[1]));
        return out.replace(/%s/g, String(args[0]));
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
        coupon(root);
        upload(root);
        autofill(root);
        hints(root);
        armEnter(root);
        armTouchGate();
        var bar = pinnedBar(root);
        var reEvaluate = armHiding(bar.el, bar.render);
        watchRecalc(bar.render);
        document.addEventListener('click', reEvaluate);
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
