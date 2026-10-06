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
 *
 * v0.26.0 — it also ORDERS the Customer Information box into the owner's
 * groups (Guest 1, Address, Guest 2, Guest 3, Guest 4, Dog, Note) with a quiet
 * heading over each. See customerLayout(): existing rows are MOVED, never
 * re-created, so names, values, saving and validation are untouched.
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

    ready(function () {
        // The layout is independent of the gating: it runs even where there is
        // nothing to gate, and the gating keeps its headings in step.
        var layout = customerLayout();
        init(layout);
        if (layout) { layout.refresh(); }
    });

    function init(layout) {
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
        var hatch = addEscapeHatch(managed[0], function (on) {
            showAll = on;
            writeShowAll(on);
            evaluate();
        });
        // The hatch was put beside the first managed row; the layout moves it
        // above the first group it governs (owner decision, v0.26.0).
        if (layout) { layout.arrange(); }

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
                'select.mphb_sc_checkout-guests-chooser',
                'select.mphb_checkout-guests-chooser',
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
                // MotoPress renders counts as <option>1</option> with no value
                // attribute, and such an option takes its VALUE FROM ITS TEXT.
                // Pin it before relabelling, or the label becomes the value.
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
         * 1. What PHP stated (CFG.statedRoomTypes on the edit screen, the
         *    data-dcc-room-types marker on the wizard). The create-booking wizard's checkout step carries
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
            // v0.27.0 — on an EXISTING booking the edit screen carries no
            // accommodation control at all, so Admin_Fields reads the booking's
            // reserved rooms and states their types here. Empty means it could
            // not read them, and then this falls through to "show everything".
            (CFG.statedRoomTypes || []).forEach(function (v) {
                var n = parseInt(v, 10);
                if (n > 0 && stated.indexOf(n) === -1) { stated.push(n); }
            });
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
                // v0.27.0 — and the checkbox follows the same rule as below:
                // hiding nothing, it steps aside. Until now this path returned
                // before telling it, so it stayed up offering to "show all"
                // beside a box already showing everything (seen on live,
                // booking 19615, 0.26.0), under a hint saying fields are hidden.
                if (hatch) { hatch.update(0, showAll); }
                if (layout) { layout.refresh(); }
                return;
            }
            var hiddenNow = 0;
            managed.forEach(function (f) {
                var show = showAll || f.sticky || capable(f.need, ids);
                f.row.classList.toggle(HIDDEN_CLASS, !show);
                if (!show) { hiddenNow += 1; }
            });
            syncExtraGuestFee(ids);

            // v0.22.0 — the checkbox says what it is doing, or gets out of the
            // way. It was reported as appearing on a screen where every field
            // was already shown, which is exactly what happens on an EXISTING
            // booking: rule 2 keeps any field that holds a value visible
            // whatever the accommodation, so on a filled-in booking there is
            // often nothing left for this to reveal. A control that promises
            // to show more, next to a screen already showing everything, reads
            // as broken. So: it names the count while it is hiding something,
            // and hides itself when it is hiding nothing AND is not the thing
            // currently doing the showing.
            if (hatch) { hatch.update(hiddenNow, showAll); }
            // A heading hides when every row under it is hidden.
            if (layout) { layout.refresh(); }
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
                    // Rows can be replaced wholesale by a re-render; re-order
                    // (a no-op when already in order, so this cannot loop) and
                    // re-find them before re-evaluating.
                    if (layout) { layout.arrange(); }
                    managed = collect(groups).concat(collectServiceRows());
                    evaluate();
                }, 200);
            }).observe(document.body, { childList: true, subtree: true });
        }
    }


    /**
     * Customer Information box: the owner's order and headings (v0.26.0).
     *
     * MotoPress renders its built-in customer fields first, in its own fixed
     * order, then the Checkout Fields add-on's fields in menu_order — which
     * cannot express the owner's order, and changing menu_order would also move
     * the GUEST checkout form, which he does not want. So the box is ordered
     * here, in the browser, in wp-admin only.
     *
     * THE RULES, each one a decision rather than a default:
     *  - MOVE, never re-create. appendChild() moves the existing <tr>, so every
     *    input keeps its name, its value and its place in the form. Nothing
     *    here reads or writes a value.
     *  - "The same box" means: the known fields' rows are <tr>s sharing ONE
     *    parent. Anything else — a different layout on another screen, a
     *    MotoPress update — and this stands down and the screen stays exactly
     *    as MotoPress drew it. That is also what decides the add-booking step:
     *    the same table is ordered, a different form is left alone.
     *  - A missing field is skipped; a group with no rows gets no heading.
     *  - Any row it does not know stays visible, after the known groups, under
     *    an "Other" heading that exists only while there is such a row.
     *  - Idempotent: when the box is already in order nothing is moved, so the
     *    MutationObserver that calls this cannot feed itself.
     */
    function customerLayout() {
        var spec = CFG.customerLayout || [];
        if (!spec.length) { return null; }
        var HEAD = 'dcc_admin-group-heading';
        var heads = {};          // group key -> heading <tr>
        var state = null;        // the last arrangement, for refresh()
        var reported = false;

        function standDown(reason) {
            // Remove only what this added, so a box that stops matching goes
            // back to MotoPress's own markup rather than keeping stale headings.
            Object.keys(heads).forEach(function (k) {
                if (heads[k].parentNode) { heads[k].parentNode.removeChild(heads[k]); }
            });
            heads = {};
            state = null;
            if (!reported && window.console && console.info) {
                // Admin-only, and it names a reason and a count — never a value.
                console.info('DCC Custom Checkout: booking-screen layout left as MotoPress drew it — ' + reason + '.');
                reported = true;
            }
            return null;
        }

        function controlFor(cands) {
            for (var i = 0; i < cands.length; i++) {
                var el = document.querySelector('[name="' + esc(cands[i]) + '"]');
                if (el) { return el; }
            }
            return null;
        }

        function find() {
            var hits = [];
            var marked = [];
            spec.forEach(function (g, gi) {
                (g.fields || []).forEach(function (cands, fi) {
                    if (cands && !Array.isArray(cands)) {
                        // A row with no named control (Upload Photo ID): it is
                        // matched once the box is known — see markedRow().
                        marked.push({ gi: gi, fi: fi, def: cands });
                        return;
                    }
                    var el = controlFor(cands || []);
                    if (!el) { return; }
                    var tr = el.closest('tr');
                    if (tr && tr.parentNode) { hits.push({ gi: gi, fi: fi, el: el, row: tr }); }
                });
            });
            // The parent most known rows share is the box; a stray match
            // elsewhere on the screen is simply not part of it.
            var tally = [];
            hits.forEach(function (h) {
                var t = tally.filter(function (x) { return x.p === h.row.parentNode; })[0];
                if (t) { t.n += 1; } else { tally.push({ p: h.row.parentNode, n: 1 }); }
            });
            tally.sort(function (a, b) { return b.n - a.n; });
            if (!tally.length || tally[0].n < 2) { return null; }
            var box = tally[0].p;
            var inBox = hits.filter(function (h) { return h.row.parentNode === box; });
            marked.forEach(function (m) {
                var row = markedRow(box, m.def, inBox);
                if (row) { inBox.push({ gi: m.gi, fi: m.fi, el: row, row: row }); }
            });
            // Rows join their group in the group's own field order.
            inBox.sort(function (a, b) { return a.gi - b.gi || a.fi - b.fi; });
            return { box: box, hits: inBox };
        }

        /**
         * A row that carries no named control, identified by a direct
         * reference to the field: an element in the row whose for / id / name
         * is one of def.names (on live, the th label's
         * for="mphb-mphb_upload_id", present whether or not a file is
         * uploaded). Never by its label text, and never by row class alone
         * (v0.27.1): the class changes with the row's state, which is how
         * 0.27.0 missed every booking without a photo. No match: the row stays
         * under "Other", visible.
         */
        function markedRow(box, def, taken) {
            var used = taken.map(function (h) { return h.row; });
            var free = Array.prototype.filter.call(box.children, function (c) {
                return c.tagName === 'TR' && used.indexOf(c) === -1;
            });
            var names = def.names || [];
            for (var i = 0; i < free.length; i++) {
                for (var j = 0; j < names.length; j++) {
                    var n = esc(names[j]);
                    if (free[i].querySelector('[for="' + n + '"], [id="' + n + '"], [name="' + n + '"]')) {
                        return free[i];
                    }
                }
            }
            return null;
        }

        function heading(key, title, cols) {
            var tr = heads[key];
            if (!tr) {
                tr = document.createElement('tr');
                tr.className = HEAD;
                tr.setAttribute('data-dcc-group', key);
                var td = document.createElement('td');
                var div = document.createElement('div');
                div.className = HEAD + '__title';
                div.setAttribute('role', 'heading');
                div.setAttribute('aria-level', '3');
                div.textContent = title;
                td.appendChild(div);
                tr.appendChild(td);
                heads[key] = tr;
            }
            var td0 = tr.firstChild;
            if (td0.colSpan !== cols) { td0.colSpan = cols; }
            return tr;
        }

        function arrange() {
            var f = find();
            if (!f) { return standDown('fewer than two of its fields were found as rows of one table'); }
            var box = f.box;
            var cols = 1;
            var known = [];
            var groups = spec.map(function (g) { return { g: g, rows: [], els: [] }; });
            f.hits.forEach(function (h) {
                var span = 0;
                Array.prototype.forEach.call(h.row.cells || [], function (c) { span += c.colSpan || 1; });
                if (span > cols) { cols = span; }
                groups[h.gi].els.push(h.el);
                if (known.indexOf(h.row) === -1) {
                    known.push(h.row);
                    groups[h.gi].rows.push(h.row);
                }
            });

            var hatch = null;
            Array.prototype.forEach.call(box.children, function (c) {
                if (c.classList && (c.classList.contains('dcc_admin-showall') ||
                        c.classList.contains('dcc_admin-showall-row'))) { hatch = c; }
            });

            var desired = [];
            var hatchPlaced = false;
            groups.forEach(function (gr) {
                if (!gr.rows.length) {
                    if (heads[gr.g.key] && heads[gr.g.key].parentNode) {
                        heads[gr.g.key].parentNode.removeChild(heads[gr.g.key]);
                    }
                    return;
                }
                if (hatch && !hatchPlaced && gr.g.governed) {
                    desired.push(hatch);
                    hatchPlaced = true;
                }
                desired.push(heading(gr.g.key, gr.g.title, cols));
                desired = desired.concat(gr.rows);
            });
            if (hatch && !hatchPlaced) { desired.push(hatch); }

            var ours = function (c) {
                return c === hatch || known.indexOf(c) !== -1 ||
                    (c.classList && c.classList.contains(HEAD));
            };
            var others = Array.prototype.filter.call(box.children, function (c) { return !ours(c); });
            if (others.length) {
                desired.push(heading('other', CFG.customerOtherTitle || 'Other', cols));
                desired = desired.concat(others);
            } else if (heads.other && heads.other.parentNode) {
                heads.other.parentNode.removeChild(heads.other);
            }

            var current = Array.prototype.slice.call(box.children);
            var same = current.length === desired.length && current.every(function (c, i) { return c === desired[i]; });
            if (!same) {
                desired.forEach(function (node) { box.appendChild(node); });
            }
            if (box.getAttribute('data-dcc-layout') !== 'arranged') {
                box.setAttribute('data-dcc-layout', 'arranged');
            }
            state = { groups: groups, others: others };
            refresh();
            return state;
        }

        function shown(node) {
            if (!node || node.hidden) { return false; }
            if (node.classList && node.classList.contains(HIDDEN_CLASS)) { return false; }
            var cs = window.getComputedStyle ? window.getComputedStyle(node) : null;
            return !(cs && cs.display === 'none');
        }

        // A field counts as visible when its row is shown AND nothing between
        // its control and that row has been hidden by the gating, which may
        // hide a wrapper inside the cell rather than the <tr> itself.
        function fieldShown(el, row) {
            if (!shown(row)) { return false; }
            for (var n = el; n && n !== row; n = n.parentNode) {
                if (n.nodeType === 1 && !shown(n) && n.type !== 'hidden') { return false; }
            }
            return true;
        }

        function setHidden(tr, hide) {
            if (!tr) { return; }
            if (tr.classList.contains(HIDDEN_CLASS) !== hide) {
                if (hide) { tr.classList.add(HIDDEN_CLASS); } else { tr.classList.remove(HIDDEN_CLASS); }
            }
        }

        function refresh() {
            if (!state) { return; }
            state.groups.forEach(function (gr) {
                if (!gr.rows.length) { return; }
                var any = gr.els.some(function (el) { return fieldShown(el, el.closest('tr')); });
                setHidden(heads[gr.g.key], !any);
            });
            if (heads.other) {
                setHidden(heads.other, !state.others.some(shown));
            }
        }

        return arrange() ? { arrange: arrange, refresh: refresh } : null;
    }

    /**
     * "Show all booking fields" — the deliberate-override escape hatch the
     * wp-admin exemptions exist to protect. Remembered for the session so an
     * admin working through several bookings sets it once.
     */
    function addEscapeHatch(firstField, onChange) {
        if (!firstField || !firstField.row || !firstField.row.parentNode) { return null; }
        if (document.querySelector('.dcc_admin-showall')) { return null; }

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

        // v0.27.0 — among table rows it gets a proper full-width row of its
        // own (a bare <div> in a <tbody> rendered, but as a narrow orphan
        // cell). Anywhere else it stays a plain block, as before.
        var outer = wrap;
        var anchor = firstField.row;
        if (anchor.tagName === 'TR') {
            var span = 0;
            Array.prototype.forEach.call(anchor.cells || [], function (c) { span += c.colSpan || 1; });
            outer = document.createElement('tr');
            outer.className = 'dcc_admin-showall-row';
            var td = document.createElement('td');
            td.colSpan = Math.max(span, 1);
            td.appendChild(wrap);
            outer.appendChild(td);
        }
        anchor.parentNode.insertBefore(outer, anchor);

        var base = label.textContent;
        return {
            update: function (hiddenCount, showAll) {
                // Present while it has something to reveal, or while it is the
                // reason everything is visible. Otherwise it is noise.
                var useful = hiddenCount > 0 || showAll;
                if (outer.hidden !== !useful) { outer.hidden = !useful; }
                label.textContent = hiddenCount > 0
                    ? base + ' (' + hiddenCount + ')'
                    : base;
                if (box.checked !== !!showAll) { box.checked = !!showAll; }
            }
        };
    }

    function readShowAll() {
        try { return window.sessionStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
    }

    function writeShowAll(on) {
        try { window.sessionStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (e) {}
    }
})();
