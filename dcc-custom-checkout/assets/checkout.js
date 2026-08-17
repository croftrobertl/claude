/**
 * DCC Custom Checkout — checkout page behaviour (vanilla JS, no deps).
 *
 * Part A (item 13) — keep "Cottage N:" on line 1, wrap the name below.
 * Part B (items 11/12/14) — tidy the required markers on every label.
 * Part C (item 3) — show/require the second-guest fields only at 2 guests.
 * Part D (item 2) — Cottage 34 "traveling with a dog?" flow that drives the
 *                   native MotoPress pet Service (native pricing, no math here).
 *
 * All configuration arrives via the localized `DCC_CHECKOUT` object.
 */
(function () {
    'use strict';

    var CFG  = window.DCC_CHECKOUT || {};
    var I18N = CFG.i18n || {};
    var UID  = 0;

    function nextId(prefix) {
        UID += 1;
        return 'dcc_checkout_' + prefix + '_' + UID;
    }

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
        cleanRequiredMarkers(root);   // Part B
        applyBreakdownBreaks(root);   // Part A / item 13

        var validators = [];
        var guest = setupGuestConditional(root); // Part C
        if (guest) { validators.push(guest); }
        var pet = setupPetFlow(root);            // Part D
        if (pet) { validators.push(pet); }

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
     * Part C — second guest conditional on guest count
     * ===================================================================== */

    function setupGuestConditional(root) {
        var selectSel = CFG.guestsSelector || 'select[name*="[adults]"]';
        var selects = Array.prototype.slice.call(root.querySelectorAll(selectSel));
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

        function guestCount() {
            var n = 0;
            selects.forEach(function (s) { n = Math.max(n, parseInt(s.value, 10) || 0); });
            return n;
        }

        function evaluate() {
            var show = guestCount() >= 2;
            rows.forEach(function (r) { r.classList.toggle('dcc_checkout-guest2-hidden', !show); });
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

    function setupPetFlow(root) {
        // Master switch (admin setting). When off, nothing renders and no
        // service is applied — the native MotoPress UI is left untouched.
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

        // The dog info fields are NATIVE MotoPress Checkout Fields (created by
        // the owner; names set in settings). We locate them by name and drive
        // them from the toggle — same pattern as guest-2. They may not exist yet
        // (owner hasn't created them) — then the toggle just ticks the service.
        var dogNames = CFG.dogFieldNames || [];
        var dogInputs = [];
        var dogRows = [];
        dogNames.forEach(function (name) {
            var el = root.querySelector('[name="' + esc(name) + '"]');
            if (!el) { return; }
            dogInputs.push(el);
            var row = el.closest('.mphb-text-control') ||
                el.closest('[class*="mphb-customer-"], p, li, tr, div');
            if (row && dogRows.indexOf(row) === -1) { dogRows.push(row); }
        });

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

        function showDogFields(yes) {
            dogRows.forEach(function (r) {
                r.classList.toggle('dcc_checkout-guest2-hidden', !yes);
            });
            dogInputs.forEach(function (inp) {
                setRequired(inp, yes, root);
                if (!yes) { inp.classList.remove('dcc_checkout-invalid'); }
            });
        }

        function onToggle() {
            var yes = block.isYes();
            showDogFields(yes);
            applyService(yes);
        }

        block.radios.forEach(function (r) { r.addEventListener('change', onToggle); });
        onToggle(); // default No → hide dog fields + uncheck all services

        // Re-assert once after MotoPress's own checkout JS has initialized, in
        // case it reset the service checkboxes during its first render.
        setTimeout(function () { if (block.isYes()) { applyService(true); } }, 800);

        // Validator: when "Yes", the present native dog fields are required.
        return function () {
            if (!block.isYes()) {
                return [];
            }
            var bad = [];
            dogInputs.forEach(function (inp) {
                inp.classList.remove('dcc_checkout-invalid');
                if (!String(inp.value || '').trim()) {
                    bad.push(inp);
                }
            });
            return bad;
        };
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
            timer = setTimeout(function () { applyBreakdownBreaks(root); }, 150);
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
