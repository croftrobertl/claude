/**
 * DCC Custom Checkout — checkout page behaviour (vanilla JS, no deps).
 *
 * Part A (item 13) — keep "Cottage N:" on line 1, wrap the name below.
 * Part B (items 11/12/14) — tidy the required markers on every label.
 * Part C (item 3) — show/require the second-guest fields only at 2 guests.
 * Part D (item 2) — the "traveling with a dog?" flow that drives the native
 *                   MotoPress pet Service (native pricing, no math here).
 * Extra-guest fee — per-room, drives the native per-adult Service for guests
 *                   beyond the second (v0.3.0).
 *
 * All configuration arrives via the localized `DCC_CHECKOUT` object.
 */
(function () {
    'use strict';

    var CFG  = window.DCC_CHECKOUT || {};
    var I18N = CFG.i18n || {};

    function esc(sel) {
        return (window.CSS && CSS.escape) ? CSS.escape(sel) : String(sel);
    }

    function ready(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    function insertAfter(node, ref) {
        if (ref && ref.parentNode) {
            ref.parentNode.insertBefore(node, ref.nextSibling);
        }
    }

    // Build a titled section mirroring MotoPress's customer-details section and
    // MOVE the given field rows into it. Reuses `mphb-customer-details-title` on
    // the <h3> so the existing 25px/underlined header styling applies. Returns
    // the section, or null when there are no rows (don't render an empty header).
    function buildFieldSection(sectionClass, titleText, rows) {
        if (!rows.length) {
            return null;
        }
        var section = document.createElement('section');
        section.className = 'mphb-checkout-section dcc_checkout-section ' + sectionClass;
        var h3 = document.createElement('h3');
        h3.className = 'mphb-customer-details-title dcc_checkout-section-title';
        h3.textContent = titleText;
        section.appendChild(h3);
        rows.forEach(function (r) { section.appendChild(r); }); // moves rows in
        return section;
    }

    ready(init);

    function init() {
        // The real MotoPress checkout container is the form itself,
        // `.mphb_sc_checkout-form` (there is NO bare `.mphb-checkout` in this
        // build). Fall back to the wrapper / legacy class defensively.
        var root = document.querySelector('.mphb_sc_checkout-form') ||
                   document.querySelector('.mphb_sc_checkout-wrapper') ||
                   document.querySelector('.mphb-checkout');
        if (!root) {
            return;
        }

        showServerError(root);
        cleanRequiredMarkers(root);       // Part B
        applyBreakdownBreaks(root);       // Part A / item 13
        normalizeReservationDates(root);  // 2026-08-30 polish, item 4

        var validators = [];
        var guest = setupGuestConditional(root); // Part C
        if (guest) { validators.push(guest); }
        // The dog Checkout Fields are enabled globally in MotoPress, so they
        // render on EVERY cottage's checkout. Hide them (not required) on every
        // checkout by default; only the pet-cottage toggle reveals them.
        var dog = setupDogFields(root);
        var pet = setupPetFlow(root, dog);       // Part D
        if (pet) { validators.push(pet); }
        setupExtraGuestFlow(root);               // v0.3.0 — fully automatic,
                                                 // nothing user-fillable, so no
                                                 // submit validator to register

        setupSubmit(root, validators);
        observeReRenders(root);
    }

    /* ===================================================================== *
     * Part B — required markers (items 11, 12, 14)
     * ===================================================================== */

    function cleanRequiredMarkers(root) {
        var labels = root.querySelectorAll('label');
        Array.prototype.forEach.call(labels, cleanLabel);
    }

    function cleanLabel(label) {
        if (label.getAttribute('data-dcc-label')) {
            return;
        }
        label.setAttribute('data-dcc-label', '1');

        var abbr = label.querySelector('abbr');
        if (abbr) {
            abbr.removeAttribute('title');            // item 14: drop the "?" tooltip
            abbr.classList.add('dcc_checkout-req');   // item 14: solid *, no dotted line
        }

        // Labels that wrap a form control (consent checkboxes etc.) — only clean
        // the marker; reordering children would detach the input.
        if (label.querySelector('input, select, textarea')) {
            return;
        }

        var hadUnderline =
            /underline/.test(label.getAttribute('style') || '') ||
            /underline/.test((getComputedStyle(label).textDecorationLine || ''));

        // Move every child except the marker into a span that will carry the
        // underline (item 12: underline the words only, not the space or the *).
        var span = document.createElement('span');
        span.className = 'dcc_checkout-label-text';

        Array.prototype.slice.call(label.childNodes).forEach(function (node) {
            if (node !== abbr) {
                span.appendChild(node);
            }
        });

        // Trim surrounding whitespace so the marker hugs the last letter (item 11).
        trimEdgeWhitespace(span);

        if (!span.textContent.trim()) {
            label.appendChild(span);
            return;
        }

        // Rebuild: [visible-text span][marker]. Drop leftover whitespace nodes.
        Array.prototype.slice.call(label.childNodes).forEach(function (n) {
            if (n !== abbr) {
                label.removeChild(n);
            }
        });
        label.insertBefore(span, label.firstChild);

        if (!hadUnderline) {
            label.classList.add('dcc_checkout-no-underline');
        }

        // Items 2/5: the span now carries the ONLY underline. The label's own
        // decoration (inline style and/or theme rule, at a different offset)
        // would draw a second line through everything including the marker —
        // clear the inline one here and let the scoped
        // label.dcc_checkout-label-fixed CSS rule kill stylesheet-sourced ones.
        if (/underline/.test(label.style.textDecoration || '') ||
            /underline/.test(label.style.textDecorationLine || '')) {
            label.style.textDecoration = 'none';
        }
        label.classList.add('dcc_checkout-label-fixed');
    }

    function trimEdgeWhitespace(span) {
        while (span.firstChild && span.firstChild.nodeType === 3 && !span.firstChild.textContent.trim()) {
            span.removeChild(span.firstChild);
        }
        while (span.lastChild && span.lastChild.nodeType === 3 && !span.lastChild.textContent.trim()) {
            span.removeChild(span.lastChild);
        }
        if (span.firstChild && span.firstChild.nodeType === 3) {
            span.firstChild.textContent = span.firstChild.textContent.replace(/^\s+/, '');
        }
        if (span.lastChild && span.lastChild.nodeType === 3) {
            span.lastChild.textContent = span.lastChild.textContent.replace(/\s+$/, '');
        }
    }

    /* ===================================================================== *
     * Part A / item 13 — break the price-breakdown accommodation title
     * ===================================================================== */

    function applyBreakdownBreaks(root) {
        var cells = root.querySelectorAll(
            'tr.mphb-price-breakdown-booking > td, tr.mphb-price-breakdown-booking > th'
        );
        Array.prototype.forEach.call(cells, function (cell) {
            if (cell.getAttribute('data-dcc-break')) {
                return;
            }
            cell.setAttribute('data-dcc-break', '1');

            var walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null);
            var node;
            while ((node = walker.nextNode())) {
                var idx = node.textContent.indexOf(':');
                if (idx === -1 || node.textContent.slice(0, idx).trim() === '') {
                    continue;
                }
                // Keep "…Cottage N:" in this node; push the name onto a new line.
                var after = node.textContent.slice(idx + 1).replace(/^\s+/, '');
                node.textContent = node.textContent.slice(0, idx + 1);
                var br   = document.createElement('br');
                var rest = document.createTextNode(after);
                var ref  = node.nextSibling;
                node.parentNode.insertBefore(br, ref);
                node.parentNode.insertBefore(rest, br.nextSibling);
                break;
            }
        });
    }

    /* ===================================================================== *
     * Item 4 (2026-08-30 polish) — reservation-details date/time text
     * ===================================================================== */

    // The check-in/check-out template leaves whitespace inside the <time>
    // elements (newlines around <strong> collapse to a space before the comma)
    // and the site time format renders "2:00 pm". Normalize the TEXT NODES of
    // those two <p> blocks only: trim <time>/<strong> edges and collapse
    // " am"/" pm" -> "am"/"pm". The <time datetime> attributes are never
    // touched (machine-readable values stay intact). Idempotent, so it is safe
    // to re-run from the MutationObserver after MotoPress re-renders.
    function normalizeReservationDates(root) {
        var blocks = root.querySelectorAll('.mphb-check-in-date, .mphb-check-out-date');
        Array.prototype.forEach.call(blocks, function (p) {
            var times = p.querySelectorAll('time');
            Array.prototype.forEach.call(times, function (timeEl) {
                normalizeTextIn(timeEl);
            });
        });
    }

    // Collapse internal whitespace runs, strip the space before am/pm, and trim
    // the element's leading/trailing text — text nodes only, attributes intact.
    function normalizeTextIn(el) {
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        var n;
        while ((n = walker.nextNode())) { nodes.push(n); }
        nodes.forEach(function (node) {
            node.textContent = node.textContent
                .replace(/\s+/g, ' ')
                .replace(/\s+([ap]m)\b/gi, '$1');
        });
        // Trim the element's outer edges (first/last text content).
        if (nodes.length) {
            nodes[0].textContent = nodes[0].textContent.replace(/^\s+/, '');
            nodes[nodes.length - 1].textContent =
                nodes[nodes.length - 1].textContent.replace(/\s+$/, '');
        }
        // A lone <strong> child gets its own edges trimmed too.
        var strong = el.querySelector('strong');
        if (strong && strong.firstChild && strong.firstChild.nodeType === 3) {
            strong.firstChild.textContent = strong.firstChild.textContent.trim();
        }
    }

    /* ===================================================================== *
     * Part C — second guest conditional on guest count
     * ===================================================================== */

    // The ROOM guest dropdowns only. A per-adult service renders its own
    // "for N guest(s)" select named …[services][j][adults], which ALSO matches
    // the guests selector pattern — and MotoPress presets it to full capacity,
    // so counting it would force guest-2 on at 1 guest. Exclude the services
    // branch here so both the guest-2 flow and the extra-guest flow see only
    // real room-adults selects.
    function roomAdultsSelects(root) {
        var selectSel = CFG.guestsSelector || 'select[name*="[adults]"]';
        return Array.prototype.slice.call(root.querySelectorAll(selectSel))
            .filter(function (s) {
                return String(s.name || '').indexOf('[services]') === -1;
            });
    }

    function setupGuestConditional(root) {
        var selects = roomAdultsSelects(root);
        if (!selects.length) {
            return null;
        }

        // Guest-2 fields are targeted by NAME (verified live):
        // input[name="mphb_guest2_first_name|last_name|phone"], each inside a
        // <p class="mphb-customer-guest2-* mphb-text-control">. The post ID is
        // not in the markup.
        var names = CFG.guest2FieldNames || [];
        var inputs = [];
        var rows = [];

        var candidates = Array.prototype.slice.call(
            root.querySelectorAll('input[name^="mphb_guest2_"]')
        );
        // Keep only the configured names (defensive), else fall back to all
        // mphb_guest2_* inputs found.
        candidates.forEach(function (el) {
            if (names.length && names.indexOf(el.name) === -1) {
                return;
            }
            inputs.push(el);
            var row = el.closest('.mphb-text-control') ||
                el.closest('[class*="mphb-customer-"], p, li, tr, div');
            if (row && rows.indexOf(row) === -1) {
                rows.push(row);
            }
        });

        if (!inputs.length) {
            return null;
        }

        // Move the guest-2 rows into their own titled section, inserted right
        // after "Your Information". Falls back to toggling the rows in place if
        // the customer-details section isn't found.
        var titles = CFG.sectionTitles || {};
        var customerDetails = root.querySelector('.mphb-customer-details');
        var section = customerDetails
            ? buildFieldSection('dcc_checkout-guest2-section', titles.guest2 || 'Guest #2 Information', rows)
            : null;
        if (section) {
            insertAfter(section, customerDetails);
        }
        var visTargets = section ? [section] : rows;

        function guestCount() {
            var n = 0;
            selects.forEach(function (s) { n = Math.max(n, parseInt(s.value, 10) || 0); });
            return n;
        }

        function evaluate() {
            var show = guestCount() >= 2;
            visTargets.forEach(function (t) { t.classList.toggle('dcc_checkout-section-hidden', !show); });
            inputs.forEach(function (inp) {
                setRequired(inp, show, root);
                if (!show) { inp.classList.remove('dcc_checkout-invalid'); }
            });
        }

        selects.forEach(function (s) { s.addEventListener('change', evaluate); });
        evaluate();

        // Validator: at 2 guests, none of the three fields may be empty.
        return function () {
            if (guestCount() < 2) {
                return [];
            }
            var bad = [];
            inputs.forEach(function (inp) {
                inp.classList.remove('dcc_checkout-invalid');
                if (!String(inp.value || '').trim()) {
                    bad.push(inp);
                }
            });
            return bad;
        };
    }

    /* ===================================================================== *
     * Part D — Cottage 34 pet flow
     * ===================================================================== */

    // `dog` is the handle from setupDogFields (fields already hidden by default);
    // this flow only REVEALS them via the toggle on a pet cottage.
    function setupPetFlow(root, dog) {
        // Master switch (admin setting). When off, the toggle never renders, no
        // service is applied, and the dog fields stay hidden everywhere.
        if (!CFG.petFeeEnabled) {
            return null;
        }

        var ids = (CFG.serviceIdList || []).map(Number);
        if (!ids.length) {
            return null;
        }

        // Honor the configured accommodations list when the room-type id is
        // discoverable in the form; otherwise fall back to native-service
        // presence below (services only exist on pet accommodations anyway).
        var petAcc = (CFG.petAccommodations || []).map(Number);
        if (petAcc.length) {
            var rts = getRoomTypeIds(root);
            if (rts.length && !rts.some(function (id) { return petAcc.indexOf(id) !== -1; })) {
                return null; // not a configured pet accommodation
            }
        }

        // Locate the native service checkboxes for our three pet services.
        var serviceInputs = {};
        var found = false;
        ids.forEach(function (id) {
            var el = findServiceInput(root, id);
            if (el) { serviceInputs[id] = el; found = true; }
        });
        if (!found) {
            return null; // not the Cottage 34 checkout — nothing to do
        }

        // Hide the native pet-service selector rows.
        ids.forEach(function (id) {
            var input = serviceInputs[id];
            if (!input) { return; }
            var wrap = serviceRowWrapper(input);
            if (wrap) { wrap.style.display = 'none'; }
        });

        var block = buildPetBlock();

        // Insert the toggle block where the (now hidden) services were.
        var anchor = serviceRowWrapper(serviceInputs[ids[0]]);
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(block.el, anchor);
        } else {
            root.appendChild(block.el);
        }

        function bucketId() {
            return serviceForNights(getNights(root));
        }

        function applyService(petYes) {
            var target = bucketId();
            ids.forEach(function (id) {
                var input = serviceInputs[id];
                if (!input) { return; }
                var want = petYes && id === target;
                if (!!input.checked !== want) {
                    input.checked = want;
                    fireChange(input); // let MotoPress recompute the total natively
                }
            });
        }

        function onToggle() {
            var yes = block.isYes();
            if (dog) { dog.show(yes); } // reveal/hide the Pet Information section
            applyService(yes);
        }

        block.radios.forEach(function (r) { r.addEventListener('change', onToggle); });
        onToggle(); // default No → hide dog fields + uncheck all services

        // Re-assert once after MotoPress's own checkout JS has initialized, in
        // case it reset the service checkboxes during its first render.
        setTimeout(function () { if (block.isYes()) { applyService(true); } }, 800);

        // Validator: when "Yes", the present native dog fields are required.
        return function () {
            if (!block.isYes() || !dog) {
                return [];
            }
            var bad = [];
            dog.inputs.forEach(function (inp) {
                inp.classList.remove('dcc_checkout-invalid');
                if (!String(inp.value || '').trim()) {
                    bad.push(inp);
                }
            });
            return bad;
        };
    }

    // Collect the native dog Checkout Fields (created by the owner; names set in
    // settings), move them into the "Pet Information" section, and HIDE them —
    // not required — by default. Runs on EVERY checkout: MotoPress renders these
    // globally-enabled fields on every cottage, so without this they'd show on
    // non-pet cottages. Only the pet-cottage toggle (setupPetFlow) reveals them.
    // Returns { inputs, show(yes) } or null when the fields don't exist.
    function setupDogFields(root) {
        var dogNames = CFG.dogFieldNames || [];
        var inputs = [];
        var rows = [];
        dogNames.forEach(function (name) {
            var el = root.querySelector('[name="' + esc(name) + '"]');
            if (!el) { return; }
            inputs.push(el);
            var row = el.closest('.mphb-text-control') ||
                el.closest('[class*="mphb-customer-"], p, li, tr, div');
            if (row && rows.indexOf(row) === -1) { rows.push(row); }
        });
        if (!inputs.length) {
            return null;
        }

        // Move the dog rows into a "Pet Information" section, placed after the
        // Guest #2 section (or after "Your Information").
        var anchor = root.querySelector('.dcc_checkout-guest2-section') ||
            root.querySelector('.mphb-customer-details');
        var section = anchor
            ? buildFieldSection('dcc_checkout-pet-section', (CFG.sectionTitles || {}).pet || 'Pet Information', rows)
            : null;
        if (section) {
            insertAfter(section, anchor);
        }
        var targets = section ? [section] : rows;

        function show(yes) {
            targets.forEach(function (t) {
                t.classList.toggle('dcc_checkout-section-hidden', !yes);
            });
            inputs.forEach(function (inp) {
                setRequired(inp, yes, root);
                if (!yes) { inp.classList.remove('dcc_checkout-invalid'); }
            });
        }

        show(false); // hidden + not required by default, on every cottage

        return { inputs: inputs, show: show };
    }

    /* ===================================================================== *
     * Extra-guest fee — guests beyond the second (v0.3.0)
     * ===================================================================== */

    // Drives the native "Extra Guest Fee" service (per night · per adult) from
    // each room's guest dropdown, PER ROOM — a checkout can hold two cottages
    // with different guest counts. MotoPress renders the service as a checkbox
    // (…[services][j][id]) plus a "for N guest(s)" select (…[services][j][adults]);
    // price = fee × nights × that adults value, computed natively (no math here).
    // We hide the service row, check the bucket service when extra > 0, set its
    // [adults] select to `extra` (adults − includedGuests) — NEVER a [quantity],
    // per_night services have none — and uncheck every other bucket. Invariant:
    // at most ONE bucket checked per room. Dormant unless all service IDs are set.
    function setupExtraGuestFlow(root) {
        if (!CFG.guestFeeEnabled) {
            return;
        }
        var ids = (CFG.guestServiceIdList || []).map(Number).filter(function (id) { return id > 0; });
        if (!ids.length) {
            return;
        }
        var included = Number(CFG.includedGuests) > 0 ? Number(CFG.includedGuests) : 2;
        var guestAcc = (CFG.guestAccommodations || []).map(Number);

        roomAdultsSelects(root).forEach(function (sel) {
            var m = /^(.*)\[adults\]$/.exec(String(sel.name || ''));
            if (!m) {
                return;
            }
            var prefix = m[1]; // e.g. mphb_room_details[0]

            // Belt-and-braces accommodation gate when the room type is
            // discoverable (service assignment already limits rendering to the
            // configured cottages).
            var rtEl = root.querySelector('input[name="' + esc(prefix + '[room_type_id]') + '"]');
            if (rtEl && guestAcc.length && guestAcc.indexOf(parseInt(rtEl.value, 10)) === -1) {
                return;
            }

            // This room's extra-guest service checkbox(es) + their [adults]
            // selects, and hide the native rows.
            var services = [];
            var boxes = root.querySelectorAll('input[name^="' + esc(prefix + '[services]') + '"]');
            Array.prototype.forEach.call(boxes, function (box) {
                if (!/\[id\]$/.test(box.name) || ids.indexOf(parseInt(box.value, 10)) === -1) {
                    return;
                }
                var adultsSel = root.querySelector(
                    'select[name="' + esc(box.name.replace(/\[id\]$/, '[adults]')) + '"]'
                );
                services.push({ id: parseInt(box.value, 10), box: box, adultsSel: adultsSel });
                var wrap = serviceRowWrapper(box);
                if (wrap) { wrap.style.display = 'none'; }
            });
            if (!services.length) {
                return;
            }

            // Dates are fixed on the checkout step — resolve the bucket once.
            var target = guestServiceForNights(getNights(root));

            function apply() {
                var extra = (parseInt(sel.value, 10) || 0) - included;
                services.forEach(function (svc) {
                    // Never attach without control of the multiplier: MotoPress
                    // presets that select to FULL capacity, so ticking the box
                    // with no select in hand would bill 4 extra guests instead
                    // of `extra` — a silent overcharge. Failing closed here
                    // instead lets the server backstop reject with a clear
                    // message, which is the safer wrong answer.
                    var want = extra > 0 && svc.id === target && !!svc.adultsSel;
                    if (want && String(svc.adultsSel.value) !== String(extra)) {
                        svc.adultsSel.value = String(extra);
                        fireChange(svc.adultsSel);
                    }
                    if (!!svc.box.checked !== want) {
                        svc.box.checked = want;
                        fireChange(svc.box); // MotoPress recomputes the total natively
                    }
                });
            }

            sel.addEventListener('change', apply);
            apply();
            // Re-assert once after MotoPress's own checkout JS initializes, in
            // case it reset the service inputs during its first render.
            setTimeout(apply, 800);
        });
    }

    // Mirrors Config::guest_service_id_for_nights() — keep the two in step.
    // The daily bucket has no lower bound (flat fee, applies from night one);
    // min_daily governs the pet fee only. 0 means "stay length unknown".
    function guestServiceForNights(nights) {
        if (!(nights > 0)) { return 0; }
        var t   = CFG.thresholds || { min_daily: 2, min_weekly: 7, min_monthly: 30 };
        var svc = CFG.guestServiceIds || {};
        if (nights >= t.min_monthly) { return Number(svc.monthly); }
        if (nights >= t.min_weekly)  { return Number(svc.weekly); }
        return Number(svc.daily);
    }

    // Toggle-only block ("Traveling with a dog?"). The info fields themselves are
    // native MotoPress Checkout Fields, driven separately (see setupPetFlow).
    function buildPetBlock() {
        var wrap = document.createElement('div');
        wrap.className = 'dcc_checkout-pet';

        var legend = document.createElement('span');
        legend.className = 'dcc_checkout-pet__legend';
        legend.textContent = I18N.petQuestion || 'Traveling with a dog?';
        wrap.appendChild(legend);

        var toggle = document.createElement('div');
        toggle.className = 'dcc_checkout-pet__toggle';
        var no  = makeRadio('dcc_checkout_dog', 'no',  I18N.petNo  || 'No',  true);
        var yes = makeRadio('dcc_checkout_dog', 'yes', I18N.petYes || 'Yes', false);
        toggle.appendChild(no.label);
        toggle.appendChild(yes.label);
        wrap.appendChild(toggle);

        if (I18N.petFeeNote) {
            var note = document.createElement('p');
            note.className = 'dcc_checkout-pet__note';
            note.textContent = I18N.petFeeNote;
            wrap.appendChild(note);
        }

        return {
            el: wrap,
            radios: [no.input, yes.input],
            isYes: function () { return yes.input.checked; }
        };
    }

    function makeRadio(name, value, text, checked) {
        var label = document.createElement('label');
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = value;
        input.checked = !!checked;
        var span = document.createElement('span');
        span.textContent = text;
        label.appendChild(input);
        label.appendChild(span);
        return { label: label, input: input };
    }

    /* ---- native MotoPress service helpers ------------------------------- */

    function findServiceInput(root, id) {
        var list = root.querySelectorAll('input[name*="[services]"]');
        for (var i = 0; i < list.length; i++) {
            if (parseInt(list[i].value, 10) === id) {
                return list[i];
            }
        }
        // Fallback: any input carrying this value.
        return root.querySelector('input[value="' + esc(String(id)) + '"]');
    }

    // Verified live (staging): each service row is `.mphb_sc_checkout-service`
    // inside `.mphb_sc_checkout-services-list`; hide the service item, not the
    // bare input. The remaining fallbacks stay for resilience across versions.
    function serviceRowWrapper(input) {
        return input.closest('.mphb_sc_checkout-service')
            || input.closest('.mphb_sc_checkout-services-list__item')
            || input.closest('.mphb-service')
            || input.closest('li')
            || input.closest('.mphb-checkout-field')
            || input.closest('p')
            || input.closest('label')
            || input.parentNode;
    }

    function fireChange(el) {
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function serviceForNights(nights) {
        var t   = CFG.thresholds || { min_daily: 2, min_weekly: 7, min_monthly: 30 };
        var svc = CFG.serviceIds || {};
        if (nights >= t.min_monthly) { return Number(svc.monthly); }
        if (nights >= t.min_weekly)  { return Number(svc.weekly); }
        if (nights >= t.min_daily)   { return Number(svc.daily); }
        return 0;
    }

    function getNights(root) {
        var inEl  = root.querySelector('input[name*="check_in_date"]')  ||
                    document.querySelector('input[name*="check_in_date"]');
        var outEl = root.querySelector('input[name*="check_out_date"]') ||
                    document.querySelector('input[name*="check_out_date"]');
        var ci = inEl  ? parseYmd(inEl.value)  : null;
        var co = outEl ? parseYmd(outEl.value) : null;
        if (ci === null || co === null) {
            return 0;
        }
        return Math.max(0, Math.round((co - ci) / 86400000));
    }

    function parseYmd(str) {
        var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
        if (!m) { return null; }
        return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    }

    // Accommodation (room type) IDs referenced by hidden inputs in the form.
    function getRoomTypeIds(root) {
        var out = [];
        var els = root.querySelectorAll('input[name*="room_type_id"]');
        Array.prototype.forEach.call(els, function (el) {
            var v = parseInt(el.value, 10);
            if (v) { out.push(v); }
        });
        return out;
    }

    /* ===================================================================== *
     * Shared helpers
     * ===================================================================== */

    function findLabelFor(input, root) {
        if (input.id) {
            var byFor = root.querySelector('label[for="' + esc(input.id) + '"]');
            if (byFor) { return byFor; }
        }
        var wrap = input.closest('.dcc_checkout-pet__field, .mphb-text-control, [class*="mphb-customer-"], .mphb-checkout-field, .mphb-field, p, li, div');
        if (wrap) {
            var inWrap = wrap.querySelector('label');
            if (inWrap) { return inWrap; }
        }
        var prev = input.previousElementSibling;
        while (prev) {
            if (prev.tagName === 'LABEL') { return prev; }
            prev = prev.previousElementSibling;
        }
        return null;
    }

    // Toggle a field's required state + its visible "*" marker together.
    function setRequired(input, on, root) {
        input.required = !!on;
        if (on) {
            input.setAttribute('aria-required', 'true');
        } else {
            input.removeAttribute('aria-required');
        }

        var label = findLabelFor(input, root);
        if (!label) { return; }

        var marker = label.querySelector('.dcc_checkout-req--dyn');
        if (on && !marker) {
            marker = document.createElement('abbr');
            marker.className = 'dcc_checkout-req dcc_checkout-req--dyn';
            marker.textContent = '*';
            label.appendChild(marker);
        } else if (!on && marker) {
            marker.parentNode.removeChild(marker);
        }
    }

    function setupSubmit(root, validators) {
        // `root` is normally the <form> itself (.mphb_sc_checkout-form).
        var form = (root.tagName === 'FORM') ? root :
            (root.closest('form') ||
             document.querySelector('form.mphb_sc_checkout-form') ||
             root.querySelector('form'));
        if (!form) {
            return;
        }

        form.addEventListener('submit', function (e) {
            var invalid = [];
            validators.forEach(function (v) {
                invalid = invalid.concat(v() || []);
            });
            if (invalid.length) {
                e.preventDefault();
                e.stopPropagation();
                invalid.forEach(function (el) { el.classList.add('dcc_checkout-invalid'); });
                showBanner(root, I18N.requiredMsg || 'Please complete the required fields.');
                try { invalid[0].focus(); } catch (_) {}
            }
        }, true); // capture: run before MotoPress's own submit handler
    }

    function observeReRenders(root) {
        if (!('MutationObserver' in window)) {
            return;
        }
        var timer = null;
        var obs = new MutationObserver(function () {
            if (timer) { clearTimeout(timer); }
            timer = setTimeout(function () {
                applyBreakdownBreaks(root);
                // MotoPress re-renders (coupon apply, country change, …) bring
                // back untouched labels/dates; all passes are idempotent (the
                // data-dcc-* guards, and text normalization that is a no-op on
                // already-clean text), so re-running is cheap and loop-safe.
                cleanRequiredMarkers(root);
                normalizeReservationDates(root);
            }, 150);
        });
        obs.observe(root, { childList: true, subtree: true });
    }

    /* ===================================================================== *
     * Error banner (after a server-side rejection redirect)
     * ===================================================================== */

    function showServerError(root) {
        var params;
        try { params = new URLSearchParams(location.search); } catch (e) { return; }
        var code = params.get('dcc_checkout_error');
        if (!code) {
            return;
        }
        var msg;
        if (code === 'guest2') {
            msg = I18N.errGuest2;
        } else if (code === 'pet') {
            msg = I18N.errPet;
        } else if (code === 'guests') {
            msg = I18N.errGuests;
        }
        showBanner(root, msg || I18N.requiredMsg || 'Please review your entries.');
    }

    function showBanner(root, msg) {
        var existing = root.querySelector('.dcc_checkout-error-banner');
        if (existing) {
            existing.textContent = msg;
            return;
        }
        var banner = document.createElement('div');
        banner.className = 'dcc_checkout-error-banner';
        banner.setAttribute('role', 'alert');
        banner.textContent = msg;
        root.insertBefore(banner, root.firstChild);
        try { banner.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    }
})();
