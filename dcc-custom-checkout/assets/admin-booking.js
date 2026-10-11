/**
 * DCC Custom Checkout — admin booking screens: field gating, fee controls and
 * the Customer Information layout.
 *
 * MotoPress enables Checkout Fields globally, so the dog fields and the guest
 * 3/4 name fields render on every admin booking. This shows and hides them by
 * the booking's own facts (v0.28.0, owner's picks 2026-10-06/07):
 *
 *   Guest 2 / Guest 3 / Guest 4 — by the guest count (Guest 2 since
 *     v0.29.0): a group shows once the count reaches its `min` (from
 *     guestGroups, never a literal). Add New reads the Number of Guests
 *     dropdown the fee sync reads; the edit screen reads the booking's saved
 *     count (our Guests box, which starts at it).
 *   Dog — by the pet fee, on a pet-fee cottage only (v0.29.0): Add New's "Pet
 *     Fee: Yes / No" dropdown, which ticks the pet service itself; the edit
 *     screen's saved services. Elsewhere Dog stays hidden unless filled.
 *   Either way, a field that already holds something stays visible (with a
 *     short note when there are more guest names than guests), and anything
 *     that cannot be read SHOWS the fields — fail open.
 *
 * Number of Guests is the ONLY control for the Extra Guest Fee, and Pet Fee the
 * only one for the pet fee: their native service rows are never shown in
 * wp-admin, and the dropdowns tick them and set the multiplier. The fee itself
 * is still MotoPress's — it prices the ticked service as it always has.
 *
 * It never removes a field, never clears a value, and never validates or blocks
 * anything; the deliberate wp-admin exemptions in the PHP backstops stay. The
 * Pet Fee dropdown has no `name`, so it never reaches the server.
 *
 * v0.26.0 — it also ORDERS the Customer Information box into the owner's
 * groups (Guest 1, Address, Guest 2, Guest 3, Guest 4, Dog, Note) with a quiet
 * heading over each — since v0.28.0 on the Add New customer step as well. See
 * customerLayout(): existing rows are MOVED, never re-created.
 */
(function () {
    'use strict';

    var CFG  = window.DCC_CHECKOUT_ADMIN || {};
    var I18N = CFG.i18n || {};
    var HIDDEN_CLASS = 'dcc_admin-field-hidden';
    /** A fee's native service row: never shown in wp-admin (v0.28.0). */
    var FEE_ROW_CLASS = 'dcc_admin-fee-row';
    var NOTE_CLASS = 'dcc_admin-group-note';
    var GUEST_IDS = idList(CFG.guestServiceIds);
    var PET_IDS   = idList(CFG.petServiceIds);
    /** Group key -> its "more guest names than guests" note (shared with the layout). */
    var notes = {};

    function idList(a) {
        return (a || []).map(Number).filter(function (n) { return n > 0; });
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

    /* Idempotent writes: nothing below may write what is already there, because
       the MutationObserver re-runs all of this and must find nothing to do. */
    function setHidden(el, hide) {
        if (!el) { return; }
        if (el.classList.contains(HIDDEN_CLASS) !== hide) {
            if (hide) { el.classList.add(HIDDEN_CLASS); } else { el.classList.remove(HIDDEN_CLASS); }
        }
    }
    function addClass(el, name) {
        if (el && !el.classList.contains(name)) { el.classList.add(name); }
    }
    function setText(el, text) {
        if (el && el.textContent !== text) { el.textContent = text; }
    }
    function setShown(el, show) {
        if (el && el.hidden !== !show) { el.hidden = !show; }
    }

    function fire(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /** A field "holds something": typed, chosen or saved. */
    function filled(el) {
        if (!el) { return false; }
        if (el.type === 'checkbox' || el.type === 'radio') { return !!el.checked; }
        return String(el.value || '').trim() !== '';
    }

    /**
     * Guest-count dropdowns within `scope` (never a service's own per-adult
     * select, and never this plugin's own Guests box on the edit screen, whose
     * `dcc_adults[…]` name the last fallback would otherwise match — 0.27.x
     * labelled its options with fees it does not charge). Same widening
     * fallbacks as the public checkout, because admin markup is not guaranteed
     * to use the same names.
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
                var n = String(sel.name || '');
                return n.indexOf('[services]') === -1 && n.indexOf('dcc_') !== 0;
            });
            if (found.length) { return found; }
        }
        return [];
    }

    /** Service checkboxes (`…[services][j][id]`) whose value is one of `ids`. */
    function serviceBoxes(ids) {
        if (!ids.length) { return []; }
        return Array.prototype.filter.call(
            document.querySelectorAll('input[name*="[services]"]'),
            function (box) {
                return /\[id\]$/.test(String(box.name || '')) && ids.indexOf(parseInt(box.value, 10)) !== -1;
            }
        );
    }

    /** "mphb_room_details[0]" from "mphb_room_details[0][services][2][id]". */
    function roomPrefix(name) {
        var m = /^(.*)\[services\]/.exec(String(name || ''));
        return m ? m[1] : '';
    }

    /**
     * Smallest element wrapping one service row, with the same containment
     * guard the public checkout uses: never an ancestor holding a guest-count
     * dropdown or a second service, because this element gets hidden and
     * taking the guest chooser down with it is exactly the regression that cost
     * the public checkout its "Number of Guests".
     */
    function serviceRow(box) {
        var el = box.parentNode;
        var best = null;
        for (var depth = 0; el && el.nodeType === 1 && depth < 6; depth++) {
            if (adultsSelects(el).length) { break; }
            if (el.querySelector('.dcc_admin-petfee')) { break; }
            if (el.querySelectorAll('input[name*="[services]"][name$="[id]"]').length > 1) { break; }
            best = el;
            el = el.parentNode;
        }
        return best;
    }

    /** Where a line under Number of Guests goes: after the chooser's wrapper. */
    function chooserAnchor(sel) {
        return sel.closest('p, .mphb-adults-chooser, li, div') || sel;
    }
    function insertAfter(node, ref) {
        if (ref.parentNode && ref.nextSibling !== node) {
            ref.parentNode.insertBefore(node, ref.nextSibling);
        }
    }

    /**
     * "Extra Details/Options" (v0.32.0, Rob's pick A): the dog questions and
     * "Bringing a boat or trailer?" leave Customer Information.
     *  - Edit screen: into the box PHP draws under "Guest count"
     *    (#dcc_extras_rows), as table rows.
     *  - Add New: into a block right after Number of Guests, which the Pet Fee
     *    dropdown then opens (Rob's pick 6).
     * The rows are MOVED, never re-created: they stay inside the booking form,
     * so MotoPress saves them exactly as before. Runs BEFORE the Customer
     * Information layout, so they are never taken for unknown rows ("Other").
     * Idempotent: a row already in place is not touched. No container found
     * (the search step, no script config) -> nothing moves.
     */
    var extrasBlock = null;
    function extras() {
        var names = CFG.extrasFields || [];
        if (!names.length) { return; }
        var box = document.getElementById('dcc_extras_rows');
        if (!box) {
            var chooser = adultsSelects(document).filter(function (s) {
                return /\[adults\]$/.test(String(s.name || ''));
            })[0];
            if (!chooser) { return; }
            box = document.querySelector('.dcc_admin-extras');
            if (!box) {
                box = document.createElement('div');
                box.className = 'dcc_admin-extras';
                var h = document.createElement('div');
                h.className = 'dcc_admin-group-heading dcc_admin-extras__title';
                h.textContent = I18N.extrasTitle || 'Extra Details/Options';
                box.appendChild(h);
                insertAfter(box, chooserAnchor(chooser));
            }
            extrasBlock = box;
        }
        var table = box.tagName === 'TBODY';
        names.forEach(function (name) {
            var el = document.querySelector('[name="' + esc(name) + '"]');
            if (!el) { return; }
            var row = table ? el.closest('tr') : el.closest('.mphb-field, .mphb-text-control, p, li');
            if (!row || row === box || row.contains(box)) { return; }
            if (row.parentNode !== box || box.lastElementChild !== row) {
                box.appendChild(row);
            }
        });
        editLink();
    }

    /**
     * Direct booking on a pet-fee cottage: the pet fee changes through
     * MotoPress's own "Edit Accommodations" (the brief's fallback for B), so
     * the box carries a copy of MotoPress's own link — found on the screen,
     * never built — and only when it is there (MotoPress shows it for
     * non-imported bookings only).
     */
    function editLink() {
        var spot = document.querySelector('[data-dcc-edit-accommodations]');
        if (!spot || spot.querySelector('a')) { return; }
        var src = Array.prototype.filter.call(
            document.querySelectorAll('a[href*="page=mphb_edit_booking"]'),
            function (a) { return !a.closest('.dcc_extras'); }
        )[0];
        if (!src) { return; }
        var a = document.createElement('a');
        a.className = 'button dcc_extras-edit-link';
        a.href = src.href;
        a.textContent = I18N.editAccommodations || 'Edit Accommodations';
        spot.appendChild(document.createElement('br'));
        spot.appendChild(a);
    }

    ready(function () {
        extras();
        // The layout is independent of the gating: it runs even where there is
        // nothing to gate, and the gating keeps its headings in step.
        var layout = customerLayout();
        gate(layout);
        if (layout) { layout.refresh(); }
        if (CFG.isExisting !== '1') { fillGuestNames(); }
    });

    /**
     * Add New: Full Guest Name (Accommodation Details) follows Guest 1's First
     * and Last Name as they are typed (owner's pick, v0.29.0), in every room's
     * box. Once a box no longer holds what this last wrote there — the admin
     * typed in it — it is theirs and is never written again. It is a value,
     * not markup, so the MutationObserver sees nothing; it reaches the server
     * only if the admin submits the booking.
     *
     * Found by MotoPress's own markup — the `…[guest_name]` input of
     * `mphb_room_details`, or the input inside its `.mphb-guest-name-wrapper`.
     * VERIFIED: the markup in live MotoPress 6.3.0 (checkout-view.php:290–294,
     * read by the Director) and Rob's phone test, where it filled. When
     * neither selector matches, nothing happens.
     */
    function fillGuestNames() {
        var first = document.querySelector('[name="mphb_first_name"]');
        var last  = document.querySelector('[name="mphb_last_name"]');
        if (!first || !last) { return; }
        // One selector list, so an input matching both appears once.
        var boxes = Array.prototype.filter.call(
            document.querySelectorAll('input[name^="mphb_room_details["][name$="[guest_name]"], .mphb-guest-name-wrapper input'),
            function (b) { return b.type === 'text'; }
        );
        if (!boxes.length) { return; }
        function sync() {
            var name = [first.value, last.value].map(function (v) { return String(v || '').trim(); })
                .filter(Boolean).join(' ');
            boxes.forEach(function (b) {
                var mine = b.dccGuestName === undefined ? '' : b.dccGuestName;
                if (b.value !== mine) { return; }   // edited by hand: theirs now
                if (b.value !== name) { b.value = name; }
                b.dccGuestName = name;
            });
        }
        first.addEventListener('input', sync);
        last.addEventListener('input', sync);
        first.addEventListener('change', sync);
        last.addEventListener('change', sync);
        sync();
    }

    function gate(layout) {
        var roomTypes = CFG.roomTypes || {};
        var knownIds  = Object.keys(roomTypes).map(Number).filter(function (n) { return n > 0; });

        var groups = [];
        (CFG.guestGroups || []).forEach(function (g) {
            var min = Number(g.min) || 0;
            groups.push({ kind: 'guest', key: 'guest' + min, min: min, names: g.names || [] });
        });
        if ((CFG.dogFieldNames || []).length) {
            groups.push({ kind: 'dog', key: 'dog', names: CFG.dogFieldNames });
        }

        var pet = petControl();
        var managed = collect(groups);

        evaluate();
        watch();

        /** Each managed field, its control and its row. */
        function collect(defs) {
            var out = [];
            defs.forEach(function (def) {
                (def.names || []).forEach(function (name) {
                    var el = document.querySelector('[name="' + esc(name) + '"]');
                    if (!el) { return; }
                    var row = el.closest('tr, .mphb-field, .mphb-text-control, p, li') || el.parentNode;
                    if (!row) { return; }
                    out.push({ group: def, el: el, row: row });
                });
            });
            return out;
        }

        /**
         * The guest count, or null when it cannot be read (then Guest 3/4 show).
         *  1. Add New: the Number of Guests dropdown(s) — the same ones the fee
         *     sync reads. Several rooms: the largest, so a group shows if ANY
         *     room needs it.
         *  2. Edit screen: our Guests box (`dcc_adults[…]`), which opens at the
         *     booking's saved `_mphb_adults` and follows a change before save.
         *  3. Edit screen without that box: the saved count PHP stated.
         * Any room "not provided" or blank makes the whole answer unreadable —
         * that room could be the one with a third guest.
         */
        function guestCount() {
            var sels = adultsSelects(document);
            if (!sels.length) {
                sels = Array.prototype.slice.call(document.querySelectorAll('select[name^="dcc_adults["]'));
            }
            if (sels.length) {
                var max = 0;
                for (var i = 0; i < sels.length; i++) {
                    // v0.32.0 (E): an untouched unconfirmed count is submitted
                    // as "keep"; for the gating it is the number it stands for.
                    var raw = sels[i].value === 'keep' ? sels[i].getAttribute('data-dcc-stored') : sels[i].value;
                    var v = parseInt(raw, 10);
                    if (!(v > 0)) { return null; }
                    if (v > max) { max = v; }
                }
                return max;
            }
            var stated = parseInt(CFG.statedGuests, 10);
            return stated > 0 ? stated : null;
        }

        function evaluate() {
            pet.apply();      // first: it decides which pet rows are ours to hide
            hideFeeRows();
            var count = guestCount();
            var petOn = pet.state();   // true / false / null (unknown)

            groups.forEach(function (g) {
                var rows = managed.filter(function (f) { return f.group === g; });
                if (!rows.length) { return; }
                var held = rows.some(function (f) { return filled(f.el); });
                var show;
                var over = false;
                if (g.kind === 'guest') {
                    show = count === null || count >= g.min || held;
                    over = held && count !== null && count < g.min;
                } else {
                    show = petOn !== false || held;
                }
                rows.forEach(function (f) { setHidden(f.row, !show); });
                setNote(g.key, over, rows);
            });

            syncExtraGuestFee(selectedRoomTypes());
            // A heading hides when every row under it is hidden; notes are put
            // under their heading. arrange() moves nothing when in order.
            if (layout) { layout.arrange(); layout.refresh(); }
        }

        /**
         * "More guest names than guests." — under the group's heading (the
         * layout places it), or before its first row when there is no layout.
         * Never clears a value: the fields stay, the note says why.
         */
        function setNote(key, on, rows) {
            var n = notes[key];
            if (!on) {
                if (n) { setShown(n, false); }
                return;
            }
            if (!n) {
                var first = rows[0].row;
                if (first.tagName === 'TR') {
                    n = document.createElement('tr');
                    var td = document.createElement('td');
                    var span = 0;
                    Array.prototype.forEach.call(first.cells || [], function (c) { span += c.colSpan || 1; });
                    td.colSpan = Math.max(span, 1);
                    var div = document.createElement('div');
                    div.className = NOTE_CLASS + '__text';
                    td.appendChild(div);
                    n.appendChild(td);
                } else {
                    n = document.createElement('p');
                    var inner = document.createElement('span');
                    inner.className = NOTE_CLASS + '__text';
                    n.appendChild(inner);
                }
                n.className = NOTE_CLASS;
                n.setAttribute('data-dcc-group', key);
                first.parentNode.insertBefore(n, first);
                notes[key] = n;
            }
            setText(n.querySelector('.' + NOTE_CLASS + '__text'), I18N.moreNames || 'More guest names than guests.');
            setShown(n, true);
        }

        /**
         * The Extra Guest Fee's own row is never shown in wp-admin (owner's
         * pick, v0.28.0): Number of Guests is its only control. With every
         * service row on the screen hidden by us, the "Choose Additional
         * Services" heading and any emptied wrapper go too.
         */
        function hideFeeRows() {
            serviceBoxes(GUEST_IDS).forEach(function (box) {
                var row = serviceRow(box);
                if (row) { addClass(row, FEE_ROW_CLASS); }
            });
            var all = Array.prototype.filter.call(
                document.querySelectorAll('input[name*="[services]"]'),
                function (b) { return /\[id\]$/.test(String(b.name || '')); }
            );
            if (!all.length) { return; }
            var rows = all.map(serviceRow);
            var allOurs = rows.every(function (r) { return r && r.classList.contains(FEE_ROW_CLASS); });
            if (!allOurs) { return; }
            hideServicesHeading(rows[0]);
            rows.forEach(hideEmptiedAncestors);
        }

        // The last heading before the first service row, found by position, not
        // wording — unless a guest chooser sits between them (then the heading
        // belongs to that block). The public checkout's rule, unchanged.
        function hideServicesHeading(firstRow) {
            var scope = firstRow.closest('.mphb-checkout-section') || firstRow.parentNode || document;
            var chooser = adultsSelects(scope)[0] || null;
            var heading = null;
            Array.prototype.forEach.call(scope.querySelectorAll('h1, h2, h3, h4, h5, h6'), function (h) {
                if (h.contains(firstRow)) { return; }
                if (!(h.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING)) { return; }
                heading = h;
            });
            if (!heading) { return; }
            if (chooser && (heading.compareDocumentPosition(chooser) & Node.DOCUMENT_POSITION_FOLLOWING) &&
                    (chooser.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                return;
            }
            addClass(heading, FEE_ROW_CLASS);
        }

        function hideEmptiedAncestors(row) {
            var node = row && row.parentNode;
            while (node && node.nodeType === 1 && node !== document.body) {
                if (adultsSelects(node).length || node.querySelector('.dcc_admin-petfee')) { return; }
                var kids = node.children;
                for (var i = 0; i < kids.length; i++) {
                    if (!kids[i].classList.contains(FEE_ROW_CLASS)) { return; }
                }
                addClass(node, FEE_ROW_CLASS);
                node = node.parentNode;
            }
        }

        /**
         * Keep the Extra Guest Fee slaved to the guest count, label the count
         * options with what each adds, and say what is being charged — from
         * the same Config values as the public checkout, never literals.
         *
         * The multiplier is set from the count EVERY time, ticked or not
         * (v0.28.0): MotoPress presets it to capacity, and an unticked fee left
         * at 4 — or at whatever was last chosen — was one more number on the
         * screen that disagreed with Number of Guests.
         */
        function syncExtraGuestFee(ids) {
            // v0.32.0 (C) — an imported booking never gets a fee from here.
            if (!GUEST_IDS.length || CFG.isImported === '1') { return; }
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
                var extra = Math.max(0, (parseInt(sel.value, 10) || 0) - included);
                // Never tick without control of the multiplier — MotoPress
                // presets that select to full capacity, which would bill more
                // guests than were booked.
                var want = !!svc && couch && extra > 0 && !!svc.adults;
                if (svc) {
                    if (svc.adults) {
                        var mult = String(Math.max(1, extra));
                        if (String(svc.adults.value) !== mult && hasOption(svc.adults, mult)) {
                            svc.adults.value = mult;
                            fire(svc.adults);
                        }
                    }
                    if (!!svc.box.checked !== want) {
                        svc.box.checked = want;
                        fire(svc.box);
                    }
                }
                feeLine(sel, want ? extra : 0, steps);
            });
        }

        function hasOption(sel, value) {
            return Array.prototype.some.call(sel.options, function (o) { return o.value === value; });
        }

        /**
         * The read-only line under Number of Guests: "Extra guest fee: 1 guest
         * × $50/night". Shown only while the fee is actually ticked, and never
         * with an amount that cannot be read.
         */
        function feeLine(sel, extra, steps) {
            var line = sel.dccFeeLine;
            var one = steps[1] || '';
            if (!extra || !one) {
                if (line) { setShown(line, false); }
                return;
            }
            if (!line) {
                line = document.createElement('p');
                line.className = 'dcc_admin-feeline description';
                insertAfter(line, chooserAnchor(sel));
                sel.dccFeeLine = line;
            }
            var text = extra === 1
                ? (I18N.feeLineOne || 'Extra guest fee: 1 guest × %s/night').replace('%s', one)
                : (I18N.feeLineMany || 'Extra guest fee: %1$d guests × %2$s/night')
                    .replace('%1$d', String(extra)).replace('%2$s', one);
            setText(line, text);
            setShown(line, true);
        }

        /** Pair a guest-count select with its Extra Guest Fee inputs. */
        function serviceFor(sel) {
            var boxes = serviceBoxes(GUEST_IDS);
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
                setText(opt, amount ? base + suffix.replace('%s', amount) : base);
            });
        }

        /**
         * Is the selected accommodation a pet-fee cottage — one whose services
         * include the pet fee (PHP's roomTypes map)? true if any selected room
         * is; false only when every one was read and none is; null when the
         * cottage is not known.
         */
        function petCottage(ids) {
            if (!ids || !ids.length) { return null; }
            var unknown = false;
            for (var i = 0; i < ids.length; i++) {
                var rt = roomTypes[String(ids[i])];
                var pet = rt ? rt.pet : 'unknown';
                if (pet === 'yes') { return true; }
                if (pet !== 'no') { unknown = true; }
            }
            return unknown ? null : false;
        }

        /**
         * Accommodation types currently selected anywhere on the screen, in
         * order of trust: what PHP stated (the data-dcc-room-types marker on
         * the Add New step), then derived from the DOM. null when neither is
         * available. Used for the couch test only: whether the guest fee can
         * apply at all — so the edit screen, which has no service boxes, needs
         * no cottage stated (0.28.0 retired CFG.statedRoomTypes).
         */
        function selectedRoomTypes() {
            var stated = [];
            Array.prototype.forEach.call(
                document.querySelectorAll('[data-dcc-room-types]'),
                function (ctx) {
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
                    sawControl = true;
                    if ((input.type === 'checkbox' || input.type === 'radio') && !input.checked) { return; }
                    found.push(v);
                }
            );
            return sawControl ? found : null;
        }

        /**
         * The pet fee (v0.28.0, owner's picks 2026-10-07; v0.29.0: a pet-fee
         * cottage only — owner: "Keep 34 as the only pet fee cottage").
         *
         * Edit screen: one word from PHP — 'yes' / 'no' (a pet-fee cottage,
         * fee carried or not), 'none' (not a pet-fee cottage: Dog stays hidden
         * unless dog details are saved), anything else unknown (Dog shows). A
         * WORD because wp_localize_script stringifies booleans: true arrived
         * as "1" and false as "", and 0.28.0 read both as unknown. The
         * read-only "Pet fee: Yes/No" line is printed by the Guests box.
         *
         * Add New: on a pet-fee cottage, a "Pet Fee: Yes / No" dropdown under
         * Number of Guests. It behaves like Number of Guests: Yes ticks the
         * pet service for this stay's length (the bucket PHP stated on the
         * marker, else the room's only pet service) and shows Dog; No unticks
         * it. The native pet rows are then never shown, so the dropdown is the
         * only pet fee control. Where the bucket cannot be told (several pet
         * services, none stated), the native rows stay visible and the
         * dropdown asks for the fee to be chosen there. On any other cottage:
         * no dropdown, no Dog, no message. Cottage unreadable, or a pet-fee
         * cottage with no pet service on screen: no dropdown (nothing it could
         * be sure of charging) and Dog shows (fail open).
         * The dropdown has no `name`: it is never submitted.
         */
        function petControl() {
            var none = { state: function () { return null; }, apply: function () {} };
            var off  = { state: function () { return false; }, apply: function () {} };
            if (CFG.isExisting === '1') {
                // v0.32.0 (C) — an import's dog is the one recorded in
                // "Bringing a dog?" (record only), and Dog follows it live.
                var dogSel = document.getElementById('dcc_dog');
                if (dogSel) {
                    return { state: function () { return dogSel.value === 'yes'; }, apply: function () {} };
                }
                var s = String(CFG.statedPetFee || '');
                var known = s === 'yes' ? true : (s === 'no' || s === 'none' ? false : null);
                return { state: function () { return known; }, apply: function () {} };
            }
            // The checkout form's per-room chooser only (…[adults]). The Add
            // New SEARCH step has an adults select too, and must not get a pet
            // control.
            var chooser = adultsSelects(document).filter(function (s) {
                return /\[adults\]$/.test(String(s.name || ''));
            })[0];
            if (!chooser) { return none; }

            var cottage = petCottage(selectedRoomTypes());
            if (cottage === false) { return off; }
            if (cottage === null || !serviceBoxes(PET_IDS).length) { return none; }

            var wrap = document.createElement('p');
            wrap.className = 'dcc_admin-petfee';
            var label = document.createElement('label');
            label.setAttribute('for', 'dcc_admin_pet_fee');
            label.textContent = I18N.petFee || 'Pet Fee:';
            var sel = document.createElement('select');
            sel.id = 'dcc_admin_pet_fee';
            [['no', I18N.petNo || 'No'], ['yes', I18N.petYes || 'Yes']].forEach(function (o) {
                var opt = document.createElement('option');
                opt.value = o[0];
                opt.textContent = o[1];
                sel.appendChild(opt);
            });
            var note = document.createElement('span');
            note.className = 'dcc_admin-petfee__note description';
            note.hidden = true;
            wrap.appendChild(label);
            wrap.appendChild(document.createTextNode(' '));
            wrap.appendChild(sel);
            wrap.appendChild(note);
            if (extrasBlock && extrasBlock.firstElementChild) {
                insertAfter(wrap, extrasBlock.firstElementChild);   // under the block's heading
            } else {
                insertAfter(wrap, chooserAnchor(chooser));
            }

            // Opens at what the form already says: Yes if a pet fee is ticked.
            sel.value = serviceBoxes(PET_IDS).some(function (b) { return b.checked; }) ? 'yes' : 'no';
            sel.addEventListener('change', function () { apply(); });

            function stated() {
                var ctx = document.querySelector('[data-dcc-pet-service]');
                return ctx ? (parseInt(ctx.getAttribute('data-dcc-pet-service'), 10) || 0) : 0;
            }

            function apply() {
                var yes = sel.value === 'yes';
                var boxes = serviceBoxes(PET_IDS);
                var msg = '';
                if (boxes.length) {
                    var target = stated();
                    var rooms = {};
                    boxes.forEach(function (b) {
                        var p = roomPrefix(b.name);
                        (rooms[p] = rooms[p] || []).push(b);
                    });
                    Object.keys(rooms).forEach(function (p) {
                        var list = rooms[p];
                        var t = list.filter(function (b) { return parseInt(b.value, 10) === target; })[0] ||
                            (list.length === 1 ? list[0] : null);
                        if (!t) {
                            // Cannot tell which bucket: leave this room's pet
                            // rows visible and untouched, and say so.
                            if (yes) { msg = I18N.petManual || 'Choose the pet fee under Additional Services.'; }
                            return;
                        }
                        list.forEach(function (b) {
                            var row = serviceRow(b);
                            if (row) { addClass(row, FEE_ROW_CLASS); }
                            var want = yes && b === t;
                            if (!!b.checked !== want) {
                                b.checked = want;
                                fire(b);   // MotoPress recomputes the total natively
                            }
                        });
                    });
                }
                setText(note, msg);
                setShown(note, msg !== '');
            }

            return {
                state: function () { return sel.value === 'yes'; },
                apply: apply
            };
        }

        /**
         * The admin can change the count or the pet fee, and MotoPress
         * re-renders parts of the screen as they do, so re-evaluate on both
         * change events and DOM mutations. Every write above is idempotent, so
         * a re-run with nothing to do changes nothing and the observer settles.
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
                    extras();   // a re-render brings rows back: move them again first
                    if (layout) { layout.arrange(); }
                    managed = collect(groups);
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
     * TWO SHAPES (v0.28.0):
     *  - TABLE — the edit screen: rows are <tr>s of one table. Verified live.
     *  - FLOW — the Add New customer step, which draws MotoPress's front-end
     *    form: rows are the <p> wrapping each field, sharing one parent. Built
     *    from the owner's recordings, NOT from captured markup, so it is held
     *    to stricter rules: the container must hold no Number of Guests and no
     *    service; elements before the first known row stay first; an element
     *    with no form control right after a known row travels with it (an
     *    upload hint); anything else goes after the known groups, visible.
     *
     * THE RULES, each one a decision rather than a default:
     *  - MOVE, never re-create. appendChild() moves the existing node, so every
     *    input keeps its name, its value and its place in the form.
     *  - At least two known fields in one container, or it stands down and the
     *    screen stays exactly as MotoPress drew it (console names the reason).
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
        var heads = {};          // group key -> heading node
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
                // Admin-only, and it names a reason — never a value.
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

        function rowOf(el) {
            return el.closest('tr') || el.closest('p');
        }

        function find() {
            var hits = [];
            var marked = [];
            spec.forEach(function (g, gi) {
                (g.fields || []).forEach(function (cands, fi) {
                    if (cands && !Array.isArray(cands)) {
                        // A row with no named control (Upload Photo ID on the
                        // edit screen): matched once the box is known.
                        marked.push({ gi: gi, fi: fi, def: cands });
                        return;
                    }
                    var el = controlFor(cands || []);
                    if (!el) { return; }
                    var row = rowOf(el);
                    if (row && row.parentNode) { hits.push({ gi: gi, fi: fi, el: el, row: row }); }
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
         * A row identified by a direct reference to the field: an element in
         * it whose for / id / name is one of def.names (edit screen: the th
         * label's for="mphb-mphb_upload_id", in both of its live states; Add
         * New: the file input's own name). Never by its label text, and never
         * by row class alone (v0.27.1). No match: the row stays under "Other".
         */
        function markedRow(box, def, taken) {
            var used = taken.map(function (h) { return h.row; });
            var free = Array.prototype.filter.call(box.children, function (c) {
                return used.indexOf(c) === -1;
            });
            var names = def.names || [];
            for (var i = 0; i < free.length; i++) {
                for (var j = 0; j < names.length; j++) {
                    var n = esc(names[j]);
                    if (free[i].matches('[name="' + n + '"]') ||
                            free[i].querySelector('[for="' + n + '"], [id="' + n + '"], [name="' + n + '"]')) {
                        return free[i];
                    }
                }
            }
            return null;
        }

        function heading(key, title, cols, table) {
            var node = heads[key];
            if (!node) {
                var div = document.createElement('div');
                div.className = HEAD + '__title';
                div.setAttribute('role', 'heading');
                div.setAttribute('aria-level', '3');
                div.textContent = title;
                if (table) {
                    node = document.createElement('tr');
                    var td = document.createElement('td');
                    td.appendChild(div);
                    node.appendChild(td);
                } else {
                    node = document.createElement('div');
                    node.appendChild(div);
                }
                node.className = HEAD;
                node.setAttribute('data-dcc-group', key);
                heads[key] = node;
            }
            if (table && node.firstChild.colSpan !== cols) { node.firstChild.colSpan = cols; }
            return node;
        }

        function hasControl(el) {
            return !!(el.matches && el.matches('input, select, textarea, button')) ||
                !!el.querySelector('input:not([type="hidden"]), select, textarea, button');
        }

        function arrange() {
            var f = find();
            if (!f) { return standDown('fewer than two of its fields were found in one container'); }
            var box = f.box;
            var table = box.tagName === 'TBODY' || box.tagName === 'TABLE' || box.tagName === 'THEAD';
            if (!table && (adultsSelects(box).length || box.querySelector('input[name*="[services]"]'))) {
                // The Add New form's accommodation block shares this container:
                // ordering it would move Number of Guests. Not the box.
                return standDown('the fields share a container with the guest count or the services');
            }

            var cols = 1;
            var known = [];
            var groups = spec.map(function (g) { return { g: g, rows: [], pairs: [] }; });
            f.hits.forEach(function (h) {
                if (table) {
                    var span = 0;
                    Array.prototype.forEach.call(h.row.cells || [], function (c) { span += c.colSpan || 1; });
                    if (span > cols) { cols = span; }
                }
                groups[h.gi].pairs.push({ el: h.el, row: h.row });
                if (known.indexOf(h.row) === -1) {
                    known.push(h.row);
                    groups[h.gi].rows.push(h.row);
                }
            });

            var isOurs = function (c) {
                return known.indexOf(c) !== -1 || !!(c.classList &&
                    (c.classList.contains(HEAD) || c.classList.contains(NOTE_CLASS)));
            };
            var children = Array.prototype.slice.call(box.children);

            // FLOW only: what stays first, and what travels with a known row.
            var lead = [];
            var attached = {};   // index in `known` -> [nodes following that row]
            var claimed = [];
            if (!table) {
                var seenKnown = false;
                var lastKnown = null;
                children.forEach(function (c) {
                    if (known.indexOf(c) !== -1) {
                        seenKnown = true;
                        lastKnown = c;
                        return;
                    }
                    if (isOurs(c)) { return; }
                    if (!seenKnown && !hasControl(c)) {
                        lead.push(c);
                        claimed.push(c);
                        return;
                    }
                    if (lastKnown && !hasControl(c)) {
                        var k = known.indexOf(lastKnown);
                        (attached[k] = attached[k] || []).push(c);
                        claimed.push(c);
                        return;
                    }
                    lastKnown = null;   // an unknown control breaks the chain
                });
            }

            var desired = lead.slice();
            groups.forEach(function (gr) {
                if (!gr.rows.length) {
                    if (heads[gr.g.key] && heads[gr.g.key].parentNode) {
                        heads[gr.g.key].parentNode.removeChild(heads[gr.g.key]);
                    }
                    return;
                }
                desired.push(heading(gr.g.key, gr.g.title, cols, table));
                var note = notes[gr.g.key];
                if (note && note.parentNode === box) { desired.push(note); }
                gr.rows.forEach(function (row) {
                    desired.push(row);
                    (attached[known.indexOf(row)] || []).forEach(function (a) { desired.push(a); });
                });
            });

            var others = children.filter(function (c) {
                return !isOurs(c) && claimed.indexOf(c) === -1;
            });
            if (others.length) {
                desired.push(heading('other', CFG.customerOtherTitle || 'Other', cols, table));
                desired = desired.concat(others);
            } else if (heads.other && heads.other.parentNode) {
                heads.other.parentNode.removeChild(heads.other);
            }
            // A note whose group has no rows here is left where it is.
            Object.keys(notes).forEach(function (k) {
                var n = notes[k];
                if (n.parentNode === box && desired.indexOf(n) === -1) { desired.push(n); }
            });

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
        // its control and that row has been hidden by the gating.
        function fieldShown(el, row) {
            if (!shown(row)) { return false; }
            for (var n = el; n && n !== row; n = n.parentNode) {
                if (n.nodeType === 1 && !shown(n) && n.type !== 'hidden') { return false; }
            }
            return true;
        }

        function refresh() {
            if (!state) { return; }
            state.groups.forEach(function (gr) {
                if (!gr.rows.length) { return; }
                var any = gr.pairs.some(function (p) { return fieldShown(p.el, p.row); });
                setHidden(heads[gr.g.key], !any);
            });
            if (heads.other) {
                setHidden(heads.other, !state.others.some(shown));
            }
        }

        return arrange() ? { arrange: arrange, refresh: refresh } : null;
    }
})();
