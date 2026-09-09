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

        // Last line of defence: nothing above may cost the guest their
        // "Number of Guests" dropdown.
        assertGuestChooserSurvived(root);

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
    // The room guest-count dropdowns ("Number of Guests"), by decreasing
    // precision. If the configured name pattern misses — MotoPress renders the
    // chooser from renderGuestsChooser on the mphb_sc_checkout_room_details
    // hook, and the input name is not guaranteed to be room_details[i][adults]
    // — fall back to the chooser's own container class, then to any select
    // whose name mentions adults. A miss here disables the WHOLE guest flow
    // (no gating, no labels, no fee), so it is worth more than one attempt.
    function roomAdultsSelects(root) {
        var notService = function (s) {
            return String(s.name || '').indexOf('[services]') === -1;
        };
        var tries = [
            CFG.guestsSelector || 'select[name^="mphb_room_details"][name*="[adults]"]',
            // Verified against MotoPress's checkout-view.php: these two
            // classes sit ON the <select>, wrapped in <p class="mphb-adults-
            // chooser">. Written as descendant selectors they matched nothing.
            'select.mphb_sc_checkout-guests-chooser',
            'select.mphb_checkout-guests-chooser',
            '.mphb-adults-chooser select',
            'select[name*="[adults]"]',
            'select[name*="adults"]'
        ];
        for (var i = 0; i < tries.length; i++) {
            var found;
            try {
                found = Array.prototype.slice.call(root.querySelectorAll(tries[i]));
            } catch (e) {
                continue; // A bad configured selector must not kill the flow.
            }
            found = found.filter(notService);
            if (found.length) {
                return found;
            }
        }
        return [];
    }

    // MotoPress renders a Checkout Field's input as 'mphb_' . $field->name
    // (mphb-checkout-fields CheckoutView), so the field SLUG must be
    // guest3_first_name, NOT mphb_guest3_first_name. A slug typed with the
    // prefix already on it renders as mphb_mphb_guest3_first_name, no input
    // ever matches, and the section silently never appears. Detect exactly
    // that and say so — in the console always, on the page for admins.
    function reportMisnamedFields(root, names) {
        var wrong = [];
        (names || []).forEach(function (name) {
            if (root.querySelector('[name="mphb_' + esc(name) + '"]')) {
                wrong.push(name);
            }
        });
        if (!wrong.length) {
            return;
        }
        var slugs = wrong.map(function (n) { return n.replace(/^mphb_/, ''); });
        var msg = 'DCC Custom Checkout: Checkout Field slug is double-prefixed. ' +
            'Rename ' + slugs.map(function (s2) { return 'mphb_' + s2; }).join(', ') +
            ' to ' + slugs.join(', ') +
            ' (MotoPress adds the mphb_ prefix when it renders the input).';
        try { window.console && console.warn(msg); } catch (_) {}
        if (!CFG.isAdmin) {
            return;
        }
        var box = root.querySelector('.dcc_checkout-admin-notice');
        if (!box) {
            box = document.createElement('div');
            box.className = 'dcc_checkout-admin-notice';
            box.setAttribute('role', 'status');
            root.insertBefore(box, root.firstChild);
        }
        var line = document.createElement('p');
        line.textContent = (I18N.adminNoticePrefix || 'Visible to administrators only:') + ' ' + msg;
        box.appendChild(line);
    }

    // One conditional details section per guest group (2: name + phone;
    // 3 and 4: name only). Groups come from CFG.guestGroups (a single Config
    // definition shared with the server backstop); the legacy guest2FieldNames
    // shape is honoured as a fallback so an older localized config still works.
    function setupGuestConditional(root) {
        // No bail-out when the chooser can't be found. Returning early here
        // left every guest-2/3/4 field on screen from the start — MotoPress
        // enables them globally — which is exactly what the owner reported:
        // "I do see the Guest2 fields even though I didn't even select a number
        // of guests yet." With no readable count the count is 0, so every
        // conditional group stays hidden, which is both correct and the safe
        // direction: these fields are optional in MotoPress, so hiding them
        // cannot block a booking.
        var selects = roomAdultsSelects(root);

        var groups = Array.isArray(CFG.guestGroups) && CFG.guestGroups.length
            ? CFG.guestGroups
            : [{ min: 2, names: CFG.guest2FieldNames || [], prefix: 'mphb_guest2_',
                 title: (CFG.sectionTitles || {}).guest2 || 'Guest #2 Information',
                 sectionClass: 'dcc_checkout-guest2-section' }];

        function guestCount() {
            var n = 0;
            selects.forEach(function (s) { n = Math.max(n, parseInt(s.value, 10) || 0); });
            return n;
        }

        // Fields are NATIVE Checkout Fields targeted by NAME (verified live):
        // input[name="mphb_guest2_first_name"] etc., each inside a
        // <p class="mphb-customer-* mphb-text-control">.
        var customerDetails = root.querySelector('.mphb-customer-details');
        var lastAnchor = customerDetails;
        var built = [];

        groups.forEach(function (g) {
            var names = g.names || [];
            var inputs = [];
            var rows = [];
            var candidates = Array.prototype.slice.call(
                root.querySelectorAll('input[name^="' + esc(g.prefix || 'mphb_guest2_') + '"]')
            );
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
                // Owner hasn't created this group's fields — no section. If the
                // fields DO exist but are double-prefixed, say why.
                reportMisnamedFields(root, names);
                return;
            }

            // Sections stack after "Your Information" in guest order; each one
            // anchors after the previous so the pet section can follow the last.
            var section = lastAnchor
                ? buildFieldSection('dcc_checkout-guest-section ' + (g.sectionClass || ''), g.title || '', rows)
                : null;
            if (section) {
                insertAfter(section, lastAnchor);
                lastAnchor = section;
            }
            built.push({ min: Number(g.min) || 2, inputs: inputs, targets: section ? [section] : rows });
        });

        if (!built.length) {
            return null;
        }

        function evaluate() {
            var count = guestCount();
            built.forEach(function (b) {
                var show = count >= b.min;
                b.targets.forEach(function (t) { t.classList.toggle('dcc_checkout-section-hidden', !show); });
                b.inputs.forEach(function (inp) {
                    setRequired(inp, show, root);
                    if (!show) { clearInvalid(inp); }
                });
            });
        }

        selects.forEach(function (s) { s.addEventListener('change', evaluate); });
        evaluate();

        // Validator: every visible group's fields must be filled.
        return function () {
            var count = guestCount();
            var bad = [];
            built.forEach(function (b) {
                if (count < b.min) { return; }
                b.inputs.forEach(function (inp) {
                    clearInvalid(inp);
                    if (!String(inp.value || '').trim()) {
                        bad.push(inp);
                    }
                });
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
            if (wrap) { hideServiceRow(wrap); }
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
                clearInvalid(inp);
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
            reportMisnamedFields(root, dogNames);
            return null;
        }

        // Move the dog rows into a "Pet Information" section, placed after the
        // Guest #2 section (or after "Your Information").
        var guestSections = root.querySelectorAll('.dcc_checkout-guest-section');
        var anchor = (guestSections.length ? guestSections[guestSections.length - 1] : null) ||
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
                if (!yes) { clearInvalid(inp); }
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
        var includedCap = Number(CFG.includedGuests) > 0 ? Number(CFG.includedGuests) : 2;
        if (!CFG.guestFeeEnabled) {
            // "Pull-out Couch Guests" is off (or unconfigured): the offering is
            // not for sale, so cap the guest dropdowns at the included count.
            // The server enforces this too; doing it here spares the guest a
            // rejection at submit when MotoPress capacity still offers 3–4.
            // We only DISABLE existing options — never inject any.
            capAdultsSelects(root, includedCap);
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
                if (wrap) { hideServiceRow(wrap); }
            });
            if (!services.length) {
                return;
            }

            // Dates are fixed on the checkout step — resolve the bucket once.
            var target = guestServiceForNights(getNights(root));

            // The guest dropdown is now the ONLY extra-guest control: its row
            // in "Choose Additional Services" is hidden above, so the count
            // charged is always max(0, guests - included) and the two can never
            // disagree. Label each option with what it adds, and explain the
            // couch underneath.
            //
            // Promise a fee ONLY under exactly the condition apply() can
            // actually charge one: the bucket resolved, its row is on the page,
            // and we hold its multiplier. Otherwise apply() attaches nothing,
            // and a "(+$50/night)" label would state a charge that never lands.
            var canCharge = target > 0 && services.some(function (svc) {
                return svc.id === target && !!svc.adultsSel;
            });
            if (canCharge) {
                decorateGuestOptions(sel, included);
                setCouchNote(sel, included);
            }

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

            function reassert() {
                apply();
                // The guest dropdown is exactly the control MotoPress's own
                // checkout JS rebuilds, so re-apply the labels and note too —
                // both are idempotent (the original label is stashed per
                // option, the note is keyed per select).
                if (canCharge) {
                    decorateGuestOptions(sel, included);
                    setCouchNote(sel, included);
                }
            }

            sel.addEventListener('change', apply);
            apply();
            // Re-assert once after MotoPress's own checkout JS initializes, in
            // case it reset the service inputs during its first render.
            setTimeout(reassert, 800);
        });
    }

    // Label the guest-count options with the CUMULATIVE amount each choice
    // adds: "1", "2", "3 (+$50/night)", "4 (+$100/night)". Cumulative on
    // purpose — the owner's ask was that a guest reads the single extra amount
    // for the number they pick, instead of a per-head rate they have to
    // multiply and can be surprised by. Options at or below the included count
    // stay bare.
    //
    // The amounts are pre-formatted server-side from the SAME MotoPress Service
    // that does the billing (CFG.guestFeeSteps), so a label cannot state a
    // number the total won't match; when that amount can't be read the map is
    // empty and no suffix is added at all. Only the visible label changes —
    // option VALUES stay plain integers. Idempotent: the original label is
    // stashed, so a MotoPress re-render can never stack suffixes.
    function decorateGuestOptions(sel, included) {
        var steps  = CFG.guestFeeSteps || {};
        var suffix = I18N.optionFeeSuffix || ' (+%s/night)';
        var any    = false;
        Array.prototype.forEach.call(sel.options, function (opt) {
            // MotoPress renders the counts as <option>1</option> — no value
            // attribute — and an option without one takes its VALUE FROM ITS
            // TEXT. Rewriting the label would therefore have submitted
            // "3 (+$50/night)" as mphb_room_details[N][adults]. Pin the value
            // first so the label is cosmetic, as the spec requires.
            if (!opt.hasAttribute('value')) {
                opt.setAttribute('value', opt.value);
            }
            var base = opt.getAttribute('data-dcc-label');
            if (base === null) {
                base = opt.textContent;
                opt.setAttribute('data-dcc-label', base);
            }
            var extra  = (parseInt(opt.value, 10) || 0) - included;
            var amount = extra > 0 ? steps[extra] : '';
            opt.textContent = amount ? base + suffix.replace('%s', amount) : base;
            if (amount) { any = true; }
        });
        return any;
    }

    // The canonical, owner-approved explanation of the pull-out couch, under
    // the guest dropdown. Numbers are substituted rather than frozen into the
    // sentence: the maximum comes from this cottage's own dropdown and the fee
    // from the configured Service, so it can't state something false. Rendered
    // only where the couch is actually offered — a cottage that tops out at the
    // included count gets no note, because the sentence wouldn't be true there.
    function setCouchNote(sel, included) {
        var single = (CFG.guestFeeSteps || {})[1] || '';
        var beds   = CFG.couchBedsText || '';
        var max    = maxOptionValue(sel);
        if (!single || !beds || !I18N.couchNote || max <= included) {
            return;
        }
        setGuestNote(sel, 'dcc_checkout-fee-note', I18N.couchNote
            .replace('%1$s', String(max))
            .replace('%2$s', beds)
            .replace('%3$s', single));
    }

    // Highest selectable guest count on this room's dropdown (ignores options
    // capAdultsSelects has disabled, so the note matches what's on offer).
    function maxOptionValue(sel) {
        var max = 0;
        Array.prototype.forEach.call(sel.options, function (opt) {
            if (opt.disabled) { return; }
            var v = parseInt(opt.value, 10) || 0;
            if (v > max) { max = v; }
        });
        return max;
    }

    // Hide a native service row. A class rather than an inline style so
    // assertGuestChooserSurvived() can find and undo every row we hid.
    function hideServiceRow(wrap) {
        if (wrap && wrap.nodeType === 1) {
            wrap.classList.add('dcc_checkout-service-hidden');
        }
    }

    // Nothing this plugin hides is worth losing the "Number of Guests"
    // dropdown over: without it a guest cannot choose 3 or 4, and the whole
    // conditional-fields flow stands down. So after every pass, prove the
    // chooser is still there AND still visible; if it is not, undo every row we
    // hid and re-check. Undoing shows a redundant service row at worst —
    // hiding the chooser costs bookings.
    function assertGuestChooserSurvived(root) {
        if (guestChooserVisible(root)) {
            return;
        }
        var hidden = root.querySelectorAll('.dcc_checkout-service-hidden');
        if (hidden.length) {
            Array.prototype.forEach.call(hidden, function (el) {
                el.classList.remove('dcc_checkout-service-hidden');
            });
            try {
                window.console && console.warn('DCC Custom Checkout: restored hidden service rows — ' +
                    'hiding one of them was also hiding the guest-count dropdown.');
            } catch (_) {}
            if (guestChooserVisible(root)) {
                return;
            }
        }
        // Still wrong after undoing our own hiding. Report WHICH of the two
        // cases it is — absent from the markup, or present but hidden by
        // something else — because the remedies are completely different.
        reportChooserProblem(root);
    }

    function guestChooserVisible(root) {
        var selects = roomAdultsSelects(root);
        if (!selects.length) {
            return false;
        }
        return selects.every(function (sel) {
            // offsetParent is null for an element hidden anywhere up the tree.
            return sel.offsetParent !== null || sel.getClientRects().length > 0;
        });
    }

    function reportChooserProblem(root) {
        var selects = roomAdultsSelects(root);
        var msg;
        if (!selects.length) {
            msg = 'DCC Custom Checkout: no "Number of Guests" dropdown found on this checkout. ' +
                'Extra-guest pricing and the conditional guest fields are all driven by it, so they ' +
                'are inactive. Checked: ' + (CFG.guestsSelector || '(default)') +
                ', select.mphb_sc_checkout-guests-chooser, .mphb-adults-chooser select, ' +
                'select[name*="[adults]"].';
        } else {
            // Present but not visible: name the element actually hiding it, so
            // the culprit can be found in one look instead of by bisecting CSS.
            var culprit = null;
            for (var i = 0; i < selects.length && !culprit; i++) {
                culprit = hidingAncestor(selects[i]);
            }
            msg = 'DCC Custom Checkout: the "Number of Guests" dropdown is present (' +
                selects.length + ' found) but not visible' +
                (culprit ? ', hidden by <' + describeEl(culprit) + '>' : '') +
                '. This plugin has already un-hidden everything it hid, so the cause is elsewhere ' +
                '(theme or another plugin).';
        }
        try { window.console && console.warn(msg); } catch (_) {}
        if (!CFG.isAdmin) {
            return;
        }
        var box = root.querySelector('.dcc_checkout-admin-notice');
        if (!box) {
            box = document.createElement('div');
            box.className = 'dcc_checkout-admin-notice';
            box.setAttribute('role', 'status');
            root.insertBefore(box, root.firstChild);
        }
        if (box.querySelector('.dcc_checkout-admin-notice__chooser')) {
            return;
        }
        var line = document.createElement('p');
        line.className = 'dcc_checkout-admin-notice__chooser';
        line.textContent = (I18N.adminNoticePrefix || 'Visible to administrators only:') + ' ' + msg;
        box.appendChild(line);
    }

    // First ancestor (self included) that computed styles say is not rendering.
    function hidingAncestor(el) {
        for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
            var cs;
            try { cs = getComputedStyle(n); } catch (e) { return null; }
            if (!cs) { return null; }
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') {
                return n;
            }
        }
        return null;
    }

    function describeEl(el) {
        var cls = String(el.className || '').trim();
        return el.tagName.toLowerCase() + (cls ? '.' + cls.split(/\s+/).join('.') : '');
    }

    // Disable (never remove, never inject) guest-count options above `cap`, and
    // pull an already-selected over-cap value back down. Used when the pull-out
    // couch offering is switched off while MotoPress capacity still allows 3–4.
    function capAdultsSelects(root, cap) {
        roomAdultsSelects(root).forEach(function (sel) {
            var changed = false;
            var capped = false;
            Array.prototype.forEach.call(sel.options, function (opt) {
                var v = parseInt(opt.value, 10);
                if (v > cap) {
                    // `disabled` is the load-bearing part — it is what actually
                    // stops the option being chosen, and it is honoured
                    // everywhere. The hiding is cosmetic and best-effort:
                    // the bare `hidden` attribute is only a UA-stylesheet rule
                    // (display:none), which ANY author rule outranks, so carry
                    // our own !important class as well. Safari/iOS honour
                    // neither on <option>, which is exactly why selection is
                    // gated on `disabled` and never on visibility.
                    opt.disabled = true;
                    opt.hidden = true;
                    opt.classList.add('dcc_checkout-option-hidden');
                    capped = true;
                }
            });
            if ((parseInt(sel.value, 10) || 0) > cap) {
                sel.value = String(cap);
                changed = true;
            }
            if (changed) {
                fireChange(sel); // let MotoPress recompute for the corrected count
            }
            // Only explain when we actually took a choice away — a cottage that
            // already caps at `cap` needs no note.
            if (capped && I18N.capNote) {
                setGuestNote(sel, 'dcc_checkout-cap-note', I18N.capNote.replace('%s', String(cap)));
            }
        });
    }

    // Insert (or update) a short note directly under a room's guest dropdown.
    // Idempotent per (select, kind) so re-asserts never stack duplicates.
    function setGuestNote(sel, kind, text) {
        var row = sel.closest('.mphb-adults-chooser, p, li, div') || sel.parentNode;
        // The chooser's wrapper is <p class="mphb-adults-chooser">, and a <p>
        // cannot contain a <p>. Append inside anything else; place the note as
        // the wrapper's next sibling when it is itself a paragraph.
        var host = row.tagName === 'P' ? (row.parentNode || row) : row;
        var note = host.querySelector('.' + kind);
        if (!note) {
            note = document.createElement('p');
            note.className = 'dcc_checkout-guest-note ' + kind;
            if (row.tagName === 'P' && row.parentNode) {
                insertAfter(note, row);
            } else {
                row.appendChild(note);
            }
        }
        note.textContent = text;
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
        // A real <fieldset>/<legend> so assistive tech reads the question as
        // the group label for the Yes/No radios (a span + div did not).
        var wrap = document.createElement('fieldset');
        wrap.className = 'dcc_checkout-pet';

        var legend = document.createElement('legend');
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
    // The smallest element that wraps ONE service row.
    //
    // The loose tail of this chain (li / p / label / parentNode) can land on a
    // shared ancestor, and this wrapper gets display:none — so a bad match
    // takes the guest chooser or the whole room block down with it. Every
    // candidate is therefore checked for containment first: anything holding a
    // guest-count select, or more than one service input, is not a row and is
    // rejected. Returning null (hide nothing) is always safer than hiding too
    // much.
    function serviceRowWrapper(input) {
        var candidates = [
            input.closest('.mphb_sc_checkout-service'),
            input.closest('.mphb_sc_checkout-services-list__item'),
            input.closest('.mphb-service'),
            input.closest('li'),
            input.closest('.mphb-checkout-field'),
            input.closest('p'),
            input.closest('label'),
            input.parentNode
        ];
        for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            if (el && el.nodeType === 1 && isServiceRowSized(el, input)) {
                return el;
            }
        }
        return null;
    }

    // Guard for the above: a real service row contains its own input and
    // nothing that belongs to another part of the form.
    function isServiceRowSized(el, input) {
        if (!el.contains(input)) {
            return false;
        }
        // A guest-count dropdown inside means this is a room container, not a
        // service row. (A per-adult service has its own [services]…[adults]
        // select, which roomAdultsSelects deliberately excludes.)
        if (roomAdultsSelects(el).length) {
            return false;
        }
        // More than one service checkbox means this is the services LIST.
        var ids = el.querySelectorAll('input[name*="[services]"][name$="[id]"]');
        return ids.length <= 1;
    }

    function fireChange(el) {
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Mirrors Config::service_id_for_nights() — keep the two in step. Since
    // 0.3.5 the daily bucket has no lower bound (pet fee applies from night
    // one); 0 means "stay length unknown".
    function serviceForNights(nights) {
        if (!(nights > 0)) { return 0; }
        var t   = CFG.thresholds || { min_daily: 2, min_weekly: 7, min_monthly: 30 };
        var svc = CFG.serviceIds || {};
        if (nights >= t.min_monthly) { return Number(svc.monthly); }
        if (nights >= t.min_weekly)  { return Number(svc.weekly); }
        return Number(svc.daily);
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

    // Mark / clear the invalid state together with its assistive-tech signal, so
    // a screen-reader user can find WHICH field the alert banner refers to.
    function markInvalid(el) {
        el.classList.add('dcc_checkout-invalid');
        el.setAttribute('aria-invalid', 'true');
    }
    function clearInvalid(el) {
        el.classList.remove('dcc_checkout-invalid');
        el.removeAttribute('aria-invalid');
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
            // Decorative: aria-required on the input carries the semantics, so
            // don't make screen readers announce "asterisk".
            marker.setAttribute('aria-hidden', 'true');
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
                invalid.forEach(markInvalid);
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
                assertGuestChooserSurvived(root);
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
