/**
 * DCC Custom Checkout — tap diagnostic, round 2.
 *
 * Loads ONLY for a logged-in administrator, and ONLY when ?dcc_tap_debug=1 is
 * on the URL. A guest can never reach it and it costs a normal page load
 * nothing.
 *
 * ROUND 1 (v0.12.0) SETTLED THIS MUCH, from the owner's own log:
 *   - Nothing is intercepting clicks. No defaultPrevented anywhere, and every
 *     click that did fire reached the document.
 *   - The browser is simply not GENERATING a click. Three stationary taps on
 *     input#mphb_address1 at the same spot produced pointerdown/touchstart/
 *     pointerup/touchend and no click; the fourth clicked.
 *   - Several presses ended in pointercancel with the finger 100-250px from
 *     where it started, i.e. the page was moving under it.
 *
 * WebKit withholds the synthesised click in a small number of situations, and
 * round 1 could not tell them apart. Round 2 measures each one directly, per
 * press, instead of reasoning about it:
 *
 *   Did the page move during the press?     scrollY and the target's own top
 *                                           are read at start and at end.
 *   Did the page ZOOM?                      visualViewport.scale. iOS zooms on
 *                                           focus when a field is under 16px,
 *                                           and that is a page-wide movement.
 *   Was the touched node still there?       isConnected at touchend. A click is
 *                                           not generated if the node the touch
 *                                           began on has been replaced.
 *   Did anything mutate mid-press?          A MutationObserver armed only while
 *                                           a press is live, counting only
 *                                           mutations on the touched node's own
 *                                           ancestor chain.
 *   Is Google Places in the way?            pac-container presence/visibility.
 *   Did the tap even land on a field?       If the touch is on a wrapper, the
 *                                           nearest field's box is reported
 *                                           with the miss distance.
 *   What moves the page after load?         layout-shift entries, named by the
 *                                           element that shifted, and body
 *                                           height changes with timestamps.
 *
 * It only listens. It never preventDefault()s, never stops propagation, and
 * touches nothing on the page besides its own panel. It does read layout
 * (getBoundingClientRect, elementFromPoint) during a press — that is a read,
 * not a write, and round 1 already did it via elementFromPoint.
 */
(function () {
    'use strict';

    var MAX = 120;
    var lines = [];
    var start = null;

    var panel = document.createElement('div');
    panel.className = 'dcc_tap_debug';
    panel.setAttribute('role', 'log');

    var head = document.createElement('div');
    head.className = 'dcc_tap_debug__head';
    head.textContent = 'DCC tap log — admin only';

    var body = document.createElement('pre');
    body.className = 'dcc_tap_debug__body';

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'dcc_tap_debug__btn';
    copy.textContent = 'Copy';
    copy.addEventListener('click', function (e) {
        e.stopPropagation();
        var text = lines.join('\n');
        try {
            navigator.clipboard.writeText(text);
            copy.textContent = 'Copied';
            setTimeout(function () { copy.textContent = 'Copy'; }, 1200);
        } catch (err) {
            // Clipboard is blocked in plenty of mobile contexts; show it
            // instead so it can still be screenshotted.
            body.textContent = text;
        }
    });

    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'dcc_tap_debug__btn';
    clear.textContent = 'Clear';
    clear.addEventListener('click', function (e) {
        e.stopPropagation();
        lines = [];
        body.textContent = '';
    });

    head.appendChild(copy);
    head.appendChild(clear);
    panel.appendChild(head);
    panel.appendChild(body);

    function describe(el) {
        if (!el || el.nodeType !== 1) { return String(el); }
        var out = el.tagName.toLowerCase();
        if (el.id) { out += '#' + el.id; }
        var cls = String(el.className || '').trim();
        if (cls) { out += '.' + cls.split(/\s+/).slice(0, 3).join('.'); }
        return out;
    }

    function log(text) {
        var at = start === null ? 0 : Math.round(performance.now() - start);
        lines.push(('+' + at + 'ms').padStart(8) + '  ' + text);
        if (lines.length > MAX) { lines.shift(); }
        body.textContent = lines.join('\n');
        body.scrollTop = body.scrollHeight;
    }

    function scale() {
        return window.visualViewport ? window.visualViewport.scale : 1;
    }

    function top(el) {
        if (!el || !el.getBoundingClientRect) { return null; }
        return Math.round(el.getBoundingClientRect().top + (window.scrollY || 0));
    }

    /* ------------------------------------------------------------------ *
     * Did the tap land on something that can be activated at all?
     *
     * Round 1's log showed nearly every press targeting p.mphb-customer-*
     * or the <section> rather than an input. Tapping those does nothing,
     * which costs a tap on its own. This reports, in the owner's own
     * coordinates, where the field actually is.
     * ------------------------------------------------------------------ */
    function fieldMiss(el, x, y) {
        if (!el || el.nodeType !== 1) { return null; }
        if (/^(input|select|textarea|button|a|label)$/i.test(el.tagName)) { return null; }
        var field = el.querySelector('input:not([type="hidden"]), select, textarea');
        if (!field) { return null; }
        var r = field.getBoundingClientRect();
        var dx = x < r.left ? Math.round(r.left - x) : (x > r.right ? Math.round(x - r.right) : 0);
        var dy = y < r.top ? Math.round(r.top - y) : (y > r.bottom ? Math.round(y - r.bottom) : 0);
        if (!dx && !dy) { return null; }
        return 'MISSED ' + describe(field) +
               ' (box x ' + Math.round(r.left) + '-' + Math.round(r.right) +
               ', y ' + Math.round(r.top) + '-' + Math.round(r.bottom) +
               '; off by ' + dx + 'px x, ' + dy + 'px y)';
    }

    function places(el) {
        var pac = document.querySelector('.pac-container');
        var bits = [];
        if (el && el.classList && el.classList.contains('pac-target-input')) {
            bits.push('places-field');
        }
        if (pac) {
            var vis = pac.offsetParent !== null &&
                      getComputedStyle(pac).display !== 'none';
            bits.push('pac-container ' + (vis ? 'VISIBLE' : 'present/hidden'));
        }
        return bits.length ? bits.join(' ') : null;
    }

    /* ------------------------------------------------------------------ *
     * Mid-press mutations, armed only while a press is live.
     *
     * A click is not synthesised if the node the touch began on is gone by
     * touchend. This counts mutations, and separately counts the ones that
     * touched the ancestor chain of the node under the finger — the only
     * ones that can explain a missing click.
     * ------------------------------------------------------------------ */
    var press = null;
    var mo = ('MutationObserver' in window) ? new MutationObserver(function (records) {
        if (!press) { return; }
        press.mutations += records.length;
        for (var i = 0; i < records.length; i++) {
            var t = records[i].target;
            if (t && press.target && (t === press.target || t.contains(press.target) ||
                press.target.contains(t))) {
                press.onPath += 1;
                if (!press.firstPath) { press.firstPath = describe(t); }
            }
        }
    }) : null;

    function beginPress(e, x, y) {
        start = performance.now();
        lines.push('--- new press ---');
        press = {
            target: e.target,
            scrollY: window.scrollY || 0,
            scale: scale(),
            top: top(e.target),
            clicked: false,
            mutations: 0,
            onPath: 0,
            firstPath: null
        };
        if (mo) {
            mo.observe(document.documentElement, {
                childList: true, subtree: true, attributes: true, characterData: true
            });
        }
        var miss = (x !== null) ? fieldMiss(e.target, x, y) : null;
        if (miss) { log('  ' + miss); }
        var pac = places(e.target);
        if (pac) { log('  ' + pac); }
    }

    function endPress() {
        if (!press) { return; }
        var p = press;
        if (mo) { mo.disconnect(); }

        var dScroll = Math.round((window.scrollY || 0) - p.scrollY);
        var dTop = (p.top === null) ? null : (top(p.target) - p.top);
        var bits = [];
        bits.push(dScroll ? 'PAGE SCROLLED ' + dScroll + 'px' : 'page still');
        if (dTop) { bits.push('TARGET MOVED ' + dTop + 'px'); }
        if (scale() !== p.scale) {
            bits.push('PAGE ZOOMED ' + p.scale + ' -> ' + scale());
        }
        if (p.target && p.target.isConnected === false) {
            bits.push('TOUCHED NODE WAS REPLACED');
        }
        if (p.mutations) {
            bits.push('dom changed mid-press: ' + p.mutations + ' mutation(s)' +
                (p.onPath ? ', ' + p.onPath + ' ON THE TOUCHED PATH (' +
                    p.firstPath + ')' : ''));
        }
        log('  ' + bits.join(' | '));

        // The verdict line. If no click arrives shortly after the press ends,
        // say so in the log itself rather than leaving it to be inferred from
        // an absent line.
        setTimeout(function () {
            if (!p.clicked) { log('  >>> NO CLICK FOLLOWED THIS PRESS'); }
        }, 400);
        press = null;
    }

    function record(e) {
        if (panel.contains(e.target)) { return; }   // ignore our own controls
        var pt = e.touches && e.touches[0] ? e.touches[0]
               : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e);
        var x = typeof pt.clientX === 'number' ? Math.round(pt.clientX) : null;
        var y = typeof pt.clientY === 'number' ? Math.round(pt.clientY) : null;

        if (e.type === 'touchstart' || e.type === 'pointerdown' || e.type === 'mousedown') {
            if (!press || e.type !== 'touchstart') { beginPress(e, x, y); }
        }
        if (e.type === 'click' && press) { press.clicked = true; }

        var bits = [e.type, 'on ' + describe(e.target)];
        if (x !== null) {
            var over = document.elementFromPoint(x, y);
            bits.push('at ' + x + ',' + y);
            // The question that finds an invisible overlay: is the thing the
            // browser says is topmost the same thing the event was aimed at?
            if (over !== e.target) {
                bits.push('TOPMOST IS ' + describe(over));
            }
        }
        if (e.defaultPrevented) { bits.push('DEFAULT PREVENTED'); }
        log(bits.join('  '));

        if (e.type === 'touchend' || e.type === 'touchcancel' || e.type === 'pointercancel') {
            endPress();
        }
    }

    [
        'pointerdown', 'pointerup', 'pointercancel',
        'touchstart', 'touchend', 'touchcancel',
        'mousedown', 'mouseup', 'click'
    ].forEach(function (type) {
        // Capture phase, so this sees the event before any page handler can
        // stop it — and the bubble phase separately, so a handler that stops
        // propagation shows up as a missing bubble-phase line.
        document.addEventListener(type, record, true);
    });

    // A second listener on click only, in the BUBBLE phase. If a capture line
    // appears with no matching bubble line, something in between called
    // stopPropagation.
    document.addEventListener('click', function (e) {
        if (panel.contains(e.target)) { return; }
        log('click reached document (bubble)  ' +
            (e.defaultPrevented ? 'DEFAULT PREVENTED' : 'ok'));
    }, false);

    /* ------------------------------------------------------------------ *
     * What moves this page, and when. Answers the question directly rather
     * than leaving it to be guessed from the symptom.
     * ------------------------------------------------------------------ */
    if ('PerformanceObserver' in window) {
        try {
            new PerformanceObserver(function (list) {
                list.getEntries().forEach(function (entry) {
                    if (entry.hadRecentInput || entry.value < 0.0005) { return; }
                    var who = [];
                    (entry.sources || []).forEach(function (s) {
                        if (s.node) { who.push(describe(s.node)); }
                    });
                    log('LAYOUT SHIFT ' + entry.value.toFixed(4) +
                        (who.length ? '  moved: ' + who.slice(0, 3).join(', ') : ''));
                });
            }).observe({ type: 'layout-shift', buffered: true });
        } catch (err) { /* Safari may not support the type; not fatal. */ }
    }

    if ('ResizeObserver' in window) {
        var lastH = 0;
        new ResizeObserver(function (entries) {
            var h = Math.round(entries[0].contentRect.height);
            if (!lastH) { lastH = h; return; }
            if (Math.abs(h - lastH) < 2) { return; }
            log('PAGE HEIGHT ' + lastH + ' -> ' + h + 'px');
            lastH = h;
        }).observe(document.documentElement);
    }

    // iOS fires resize on URL-bar collapse during scroll. Distinguishing a
    // width change from a height-only one matters: only a width change can
    // legitimately require re-layout work (see matchFileFieldWidth).
    var lastW = window.innerWidth;
    window.addEventListener('resize', function () {
        var kind = window.innerWidth === lastW ? 'height only (iOS URL bar)' : 'WIDTH CHANGED';
        lastW = window.innerWidth;
        log('resize — ' + kind + '  ' + window.innerWidth + 'x' + window.innerHeight);
    });

    function ready(fn) {
        if (document.readyState !== 'loading') { fn(); }
        else { document.addEventListener('DOMContentLoaded', fn); }
    }
    ready(function () {
        document.body.appendChild(panel);
        log('listening — tap a field, then the thing that will not respond');
    });
})();
