/**
 * DCC Custom Checkout — tap diagnostic.
 *
 * Loads ONLY for a logged-in administrator, and ONLY when ?dcc_tap_debug=1 is
 * on the URL. A guest can never reach it and it costs a normal page load
 * nothing.
 *
 * WHY THIS EXISTS
 * The owner needs 3-4 taps to operate anything on /submit-booking/ on his
 * phone; desktop is fine. Gating the hover rules in 0.11.0 fixed desktop and
 * did not fix mobile, so sticky hover is not the whole cause. Nobody has yet
 * seen what actually happens between the first tap and the one that works —
 * every attempt so far has been a hypothesis tested on a machine with a mouse.
 *
 * This records the truth on the device where the bug lives. It answers, in
 * order, the questions that separate the remaining explanations:
 *
 *   Does touchstart fire at all?          If not: something above is eating it.
 *   Does click follow it?                 If not: the tap is being cancelled.
 *   Was the event defaultPrevented?       If so: a handler is swallowing it.
 *   What is actually at those coordinates? If not the control: an overlay.
 *   How far did the finger travel?        A few px of drift reads as a scroll.
 *
 * It only listens. It never preventDefault()s, never stops propagation, and
 * touches nothing on the page besides its own panel.
 */
(function () {
    'use strict';

    var MAX = 40;
    var lines = [];
    var start = null;

    var panel = document.createElement('div');
    panel.className = 'dcc_tap_debug';
    panel.setAttribute('role', 'log');

    var head = document.createElement('div');
    head.className = 'dcc_tap_debug__head';
    head.textContent = 'DCC tap log — admin only';

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

    var body = document.createElement('pre');
    body.className = 'dcc_tap_debug__body';

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

    function record(e) {
        if (panel.contains(e.target)) { return; }   // ignore our own controls
        if (e.type === 'touchstart' || e.type === 'pointerdown' || e.type === 'mousedown') {
            start = performance.now();
            lines.push('--- new press ---');
        }
        var pt = e.touches && e.touches[0] ? e.touches[0]
               : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e);
        var x = typeof pt.clientX === 'number' ? Math.round(pt.clientX) : null;
        var y = typeof pt.clientY === 'number' ? Math.round(pt.clientY) : null;

        var bits = [e.type, 'on ' + describe(e.target)];
        if (x !== null) {
            var top = document.elementFromPoint(x, y);
            bits.push('at ' + x + ',' + y);
            // The question that finds an invisible overlay: is the thing the
            // browser says is topmost the same thing the event was aimed at?
            if (top !== e.target) {
                bits.push('TOPMOST IS ' + describe(top));
            }
        }
        if (e.defaultPrevented) { bits.push('DEFAULT PREVENTED'); }
        log(bits.join('  '));
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

    function ready(fn) {
        if (document.readyState !== 'loading') { fn(); }
        else { document.addEventListener('DOMContentLoaded', fn); }
    }
    ready(function () {
        document.body.appendChild(panel);
        log('listening — tap a field, then the thing that will not respond');
    });
})();
