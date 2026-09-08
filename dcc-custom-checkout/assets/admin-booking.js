/**
 * DCC Custom Checkout — admin booking screen field gating.
 *
 * MotoPress enables Checkout Fields globally, so the dog fields and the guest
 * 3/4 name fields render on every admin booking regardless of which
 * accommodation is chosen. This mirrors the front-end gate here: it watches the
 * accommodation selector(s) and shows/hides those rows to match what the chosen
 * cottage can actually offer.
 *
 * It only ever shows and hides. Nothing is removed from the DOM, no value is
 * cleared, and nothing is validated or blocked — the deliberate wp-admin
 * exemptions in the PHP backstops are untouched. Every uncertainty fails open.
 */
(function () {
    'use strict';

    var CFG  = window.DCC_CHECKOUT_ADMIN || {};
    var I18N = CFG.i18n || {};
    var HIDDEN_CLASS = 'dcc_admin-field-hidden';
    var STORAGE_KEY  = 'dccCheckoutShowAllFields';
    /** Capability that no accommodation ever satisfies: escape hatch only. */
    var NEED_SHOW_ALL = '__show_all_only__';
    var GUEST_IDS = (CFG.guestServiceIds || [])
        .map(Number)
        .filter(function (n) { return n > 0; });

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
        var roomTypes = CFG.roomTypes || {};
        var knownIds  = Object.keys(roomTypes).map(Number).filter(function (n) { return n > 0; });
        if (!knownIds.length) {
            return; // Nothing to gate against.
        }

        // The two managed groups. `need` is the capability key in roomTypes.
        var groups = [];
        if ((CFG.dogFieldNames || []).length) {
            groups.push({ need: 'pet', names: CFG.dogFieldNames });
        }
        // Guest 3/4 are NOT gated on the accommodation (nor on any admin guest
        // count) — the owner wants them hidden by default and revealed only by
        // the "Show all booking fields" checkbox, which is what its label
        // already promises. NEED_SHOW_ALL is never "capable", so only that
        // checkbox (or stored data on an existing booking) reveals them.
        (CFG.guestGroups || []).forEach(function (g) {
            groups.push({ need: NEED_SHOW_ALL, names: g.names || [] });
        });

        var managed = collect(groups).concat(collectServiceRows());
        if (!managed.length) {
            return; // None of the fields are on this screen.
        }

        var showAll = readShowAll();
        addEscapeHatch(managed[0], function (on) {
            showAll = on;
            writeShowAll(on);
            evaluate();
        });

        evaluate();
        watch();

        /**
         * Find each managed field, its row, and whether it already holds stored
         * data (existing bookings only — a default value on a NEW booking is
         * not data anyone would lose).
         */
        function collect(defs) {
            var out = [];
            defs.forEach(function (def) {
                (def.names || []).forEach(function (name) {
                    var el = document.querySelector('[name="' + esc(name) + '"]');
                    if (!el) { return; }
                    var row = el.closest('tr, .mphb-field, .mphb-text-control, p, li') || el.parentNode;
                    if (!row) { return; }
                    out.push({
                        need: def.need,
                        row: row,
                        sticky: !!CFG.isExisting && String(el.value || '').trim() !== ''
                    });
                });
            });
            return out;
        }

        /**
         * The Extra Guest Fee service rows on this screen.
         *
         * Hidden behind the same "Show all booking fields" switch as the other
         * conditional fields, so wp-admin matches the public checkout: one
         * control (the guest count) drives the charge, instead of two that can
         * disagree.
         */
        function collectServiceRows() {
            if (!GUEST_IDS.length) { return []; }
            var out = [];
            Array.prototype.forEach.call(
                document.querySelectorAll('input[name*="[services]"]'),
                function (box) {
                    if (!/\[id\]$/.test(String(box.name || ''))) { return; }
                    if (GUEST_IDS.indexOf(parseInt(box.value, 10)) === -1) { return; }
                    var row = serviceRow(box);
                    if (row) {
                        out.push({ need: NEED_SHOW_ALL, row: row, sticky: false });
                    }
                }
            );
            return out;
        }

        /**
         * Smallest element wrapping one service row, with the same containment
         * guard the public checkout uses: never return an ancestor holding a
         * guest-count dropdown or a second service, because this element gets
         * hidden and taking the guest chooser down with it is exactly the
         * regression that cost the public checkout its "Number of Guests".
         */
        function serviceRow(box) {
            var el = box.parentNode;
            var best = null;
            for (var depth = 0; el && el.nodeType === 1 && depth < 6; depth++) {
                if (adultsSelects(el).length) { break; }
                if (el.querySelectorAll('input[name*="[services]"][name$="[id]"]').length > 1) { break; }
                best = el;
                el = el.parentNode;
            }
            return best;
        }

        /**
         * Guest-count dropdowns within `scope` (never a service's own per-adult
         * select). Same widening fallbacks as the public checkout, because the
         * admin markup is not guaranteed to use the same input names.
         */
        function adultsSelects(scope) {
            var tries = [
                CFG.guestsSelector || 'select[name^="mphb_room_details"][name*="[adults]"]',
                '.mphb-adults-chooser select',
                'select[name*="[adults]"]',
                'select[name*="adults"]'
            ];
            for (var i = 0; i < tries.length; i++) {
                var found;
                try {
                    found = Array.prototype.slice.call(scope.querySelectorAll(tries[i]));
                } catch (e) {
                    continue;
                }
                found = found.filter(function (sel) {
                    return String(sel.name || '').indexOf('[services]') === -1;
                });
                if (found.length) { return found; }
            }
            return [];
        }

        /**
         * Keep the Extra Guest Fee slaved to the guest count, and label the
         * count options with what each one adds — the same rules as the public
         * checkout, from the same Config values (never literals).
         *
         * This is presentation and input-slaving only. No server-side
         * validation is extended into wp-admin; those exemptions stay.
         */
        function syncExtraGuestFee(ids) {
            if (!GUEST_IDS.length) { return; }
            var included = Number(CFG.includedGuests) > 0 ? Number(CFG.includedGuests) : 2;
            var steps    = CFG.guestFeeSteps || {};

            // Label only where the fee genuinely applies: at least one selected
            // accommodation must be a known couch cottage. "Unknown" is good
            // enough to SHOW a field, but not to promise a price.
            var couch = !!(ids && ids.length) && ids.some(function (id) {
                var rt = roomTypes[String(id)];
                return rt && rt.couch === 'yes';
            });

            adultsSelects(document).forEach(function (sel) {
                if (couch) { decorateOptions(sel, included, steps); }
                var svc = serviceFor(sel);
                if (!svc) { return; }
                var extra = Math.max(0, (parseInt(sel.value, 10) || 0) - included);
                // Never tick without control of the multiplier — MotoPress
                // presets that select to full capacity, which would bill more
                // guests than were booked.
                var want = couch && extra > 0 && !!svc.adults;
                if (want && String(svc.adults.value) !== String(extra)) {
                    svc.adults.value = String(extra);
                    fire(svc.adults);
                }
                if (!!svc.box.checked !== want) {
                    svc.box.checked = want;
                    fire(svc.box);
                }
            });
        }

        /** Pair a guest-count select with its Extra Guest Fee inputs. */
        function serviceFor(sel) {
            var boxes = [];
            Array.prototype.forEach.call(
                document.querySelectorAll('input[name*="[services]"]'),
                function (box) {
                    if (!/\[id\]$/.test(String(box.name || ''))) { return; }
                    if (GUEST_IDS.indexOf(parseInt(box.value, 10)) === -1) { return; }
                    boxes.push(box);
                }
            );
            if (!boxes.length) { return null; }

            // Prefer the service that shares this select's name prefix, so a
            // multi-room booking can never cross-wire two cottages.
            var m = /^(.*)\[adults\]$/.exec(String(sel.name || ''));
            var box = null;
            if (m) {
                var prefix = m[1];
                box = boxes.filter(function (b) {
                    return String(b.name || '').indexOf(prefix + '[services]') === 0;
                })[0] || null;
            }
            // Only fall back to "the one service" when there is exactly one of
            // each; guessing across rooms could bill the wrong cottage.
            if (!box && boxes.length === 1 && adultsSelects(document).length === 1) {
                box = boxes[0];
            }
            if (!box) { return null; }

            return {
                box: box,
                adults: document.querySelector(
                    '[name="' + esc(String(box.name).replace(/\[id\]$/, '[adults]')) + '"]'
                )
            };
        }

        /**
         * "1", "2", "3 (+$50/night)", "4 (+$100/night)" — cumulative, so the
         * amount shown is what that choice adds in total. Idempotent: the
         * original label is stashed, so re-running can't stack suffixes. Option
         * VALUES are never touched.
         */
        function decorateOptions(sel, included, steps) {
            var suffix = I18N.optionFeeSuffix || ' (+%s/night)';
            Array.prototype.forEach.call(sel.options, function (opt) {
                var base = opt.getAttribute('data-dcc-label');
                if (base === null) {
                    base = opt.textContent;
                    opt.setAttribute('data-dcc-label', base);
                }
                var extra  = (parseInt(opt.value, 10) || 0) - included;
                var amount = extra > 0 ? steps[extra] : '';
                opt.textContent = amount ? base + suffix.replace('%s', amount) : base;
            });
        }

        function fire(el) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        /**
         * Accommodation types currently selected anywhere on the screen, in
         * order of trust.
         *
         * 1. What PHP stated. The create-booking wizard's checkout step carries
         *    NO room-type control in its markup — the accommodation was chosen
         *    in an earlier step and exists only server-side — so there is
         *    nothing to derive from and derivation alone left that screen
         *    ungated. Admin_Fields prints the reserved room-type ids on the
         *    mphb_cb_checkout_form hook; that is authoritative, so it wins.
         *
         * 2. Derived from the DOM, for the edit-booking screen, whose
         *    room-type selects MotoPress creates dynamically (hence the
         *    MutationObserver). Rather than guess a selector: any <select>
         *    offering a known room-type ID as an option value, or any input
         *    whose name mentions room_type and holds a known ID.
         *
         * Returns null when neither is available, and the whole gate stands
         * down — that screen then behaves exactly as it did before this file
         * existed. Hiding nothing is always the safe wrong answer here.
         */
        function selectedRoomTypes() {
            var stated = [];
            Array.prototype.forEach.call(
                document.querySelectorAll('[data-dcc-room-types]'),
                function (ctx) {
                    // Union across markers: should the hook ever fire once per
                    // reserved room, every room still counts.
                    String(ctx.getAttribute('data-dcc-room-types') || '')
                        .split(',')
                        .forEach(function (v) {
                            var n = parseInt(v, 10);
                            if (n > 0 && stated.indexOf(n) === -1) { stated.push(n); }
                        });
                }
            );
            if (stated.length) {
                return stated;
            }

            var found = [];
            var sawControl = false;

            Array.prototype.forEach.call(document.querySelectorAll('select'), function (sel) {
                var offersKnown = Array.prototype.some.call(sel.options, function (opt) {
                    return knownIds.indexOf(parseInt(opt.value, 10)) !== -1;
                });
                if (!offersKnown) { return; }
                sawControl = true;
                var v = parseInt(sel.value, 10);
                if (knownIds.indexOf(v) !== -1) { found.push(v); }
            });

            Array.prototype.forEach.call(
                document.querySelectorAll('input[name*="room_type"]'),
                function (input) {
                    var v = parseInt(input.value, 10);
                    if (knownIds.indexOf(v) === -1) { return; }
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        sawControl = true;
                        if (input.checked) { found.push(v); }
                        return;
                    }
                    sawControl = true;
                    found.push(v);
                }
            );

            return sawControl ? found : null;
        }

        /**
         * Union semantics: a booking can hold more than one accommodation, so a
         * capability any selected cottage has keeps the fields visible.
         * 'unknown' counts as capable — we never hide on a failed read.
         */
        function capable(need, ids) {
            if (need === NEED_SHOW_ALL) {
                return false; // Only the escape hatch (or stored data) shows these.
            }
            if (!ids || !ids.length) {
                return true; // Nothing chosen yet — show everything.
            }
            for (var i = 0; i < ids.length; i++) {
                var rt = roomTypes[String(ids[i])];
                if (!rt) { return true; }
                if (rt[need] !== 'no') { return true; }
            }
            return false;
        }

        function evaluate() {
            var ids = selectedRoomTypes();
            if (ids === null) {
                // Couldn't identify the accommodation control: fail open and
                // leave the screen exactly as MotoPress rendered it.
                managed.forEach(function (f) { f.row.classList.remove(HIDDEN_CLASS); });
                return;
            }
            managed.forEach(function (f) {
                var show = showAll || f.sticky || capable(f.need, ids);
                f.row.classList.toggle(HIDDEN_CLASS, !show);
            });
            syncExtraGuestFee(ids);
        }

        /**
         * The admin picks the accommodation after the form has rendered and can
         * change it, and MotoPress re-renders parts of the screen as they do,
         * so re-evaluate on both change events and DOM mutations.
         */
        function watch() {
            document.addEventListener('change', function (e) {
                if (e.target && (e.target.tagName === 'SELECT' || e.target.name)) {
                    evaluate();
                }
            }, true);

            if (!('MutationObserver' in window)) { return; }
            var timer = null;
            new MutationObserver(function () {
                if (timer) { clearTimeout(timer); }
                timer = setTimeout(function () {
                    // Rows can be replaced wholesale by a re-render; re-find
                    // them before re-evaluating.
                    managed = collect(groups).concat(collectServiceRows());
                    evaluate();
                }, 200);
            }).observe(document.body, { childList: true, subtree: true });
        }
    }

    /**
     * "Show all booking fields" — the deliberate-override escape hatch the
     * wp-admin exemptions exist to protect. Remembered for the session so an
     * admin working through several bookings sets it once.
     */
    function addEscapeHatch(firstField, onChange) {
        if (!firstField || !firstField.row || !firstField.row.parentNode) { return; }
        if (document.querySelector('.dcc_admin-showall')) { return; }

        var wrap = document.createElement('div');
        wrap.className = 'dcc_admin-showall';

        var id = 'dcc_admin_show_all';
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.id = id;
        box.checked = readShowAll();

        var label = document.createElement('label');
        label.setAttribute('for', id);
        label.textContent = I18N.showAll || 'Show all booking fields';

        var hint = document.createElement('p');
        hint.className = 'dcc_admin-showall__hint';
        hint.textContent = I18N.hint || '';

        wrap.appendChild(box);
        wrap.appendChild(label);
        if (hint.textContent) { wrap.appendChild(hint); }

        box.addEventListener('change', function () { onChange(box.checked); });
        firstField.row.parentNode.insertBefore(wrap, firstField.row);
    }

    function readShowAll() {
        try { return window.sessionStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
    }

    function writeShowAll(on) {
        try { window.sessionStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (e) {}
    }
})();
