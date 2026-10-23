/**
 * DCC Guest Guide — click-to-play video posters (v0.25.0).
 *
 * Swaps a poster image for the real embed on click, so no third-party
 * iframe loads until the guest asks for one.
 *
 * Loaded by core at init, and ONLY when the page actually contains the element
 * this covers — see CHUNKS in widget.js. Never loaded on a tap or a touch:
 * fetching a script at the moment a finger lands is how v0.9.7 produced the
 * three-tap bug, where the first taps did nothing because the handler had not
 * arrived yet. Everything here is wired before the guest can reach it.
 *
 * Core injects this file, so window.DCCGG_CORE is always present by the time
 * it runs — no boot dance, unlike widget-guest.js, which the page itself may
 * load in either order.
 */
(function () {
    'use strict';

    const CORE = window.DCCGG_CORE;
    if (!CORE) { return; }

    // -- Click-to-play video posters (v0.6) -------------------------------
    function wireVideoPosters(root) {
        root.querySelectorAll('.dccgg-video-poster').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const embed = btn.dataset.embed;
                if (!embed) return;
                const iframe = document.createElement('iframe');
                iframe.className = 'dccgg-media';
                // v0.20.0: the poster carries the item's shape; the iframe that
                // replaces it has to carry the same one, or the box resizes the
                // instant the guest presses play.
                const ratio = btn.dataset.ratio
                    || btn.style.getPropertyValue('--dccgg-video-ratio').trim();
                if (ratio) { iframe.style.setProperty('--dccgg-video-ratio', ratio); }
                iframe.src = embed + (embed.indexOf('?') > -1 ? '&' : '?') + 'autoplay=1';
                iframe.loading = 'lazy';
                iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
                iframe.setAttribute('allowfullscreen', '');
                iframe.setAttribute('frameborder', '0');
                iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                btn.replaceWith(iframe);
            });
        });
    }

    (window.DCCGG_CHUNK = window.DCCGG_CHUNK || {})['video'] = function (root, config) {
        wireVideoPosters(root, config);
    };

})();
