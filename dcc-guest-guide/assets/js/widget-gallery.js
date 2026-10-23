/**
 * DCC Guest Guide — the gallery strip and the image lightbox (v0.25.0).
 *
 * Two features that share the lightbox dialog: the horizontal gallery strip
 * and click-to-enlarge on a plain content image.
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
    const { bindGlobal, escAttr, escHtml } = CORE;

    // -- Gallery strip click → lightbox with hotspots (v0.7) --------------
    // v0.9.7.20: delegate from `document` with a stage back-pointer so the
    // handler still fires after `.dccgg-stage` is portaled to <body> by
    // showDetailModal() — same fix pattern v0.9.7.5 applied to wireChecklists
    // and wireSectionNav. Without this the click bubble path bypasses `root`
    // once any detail has been opened and gallery thumbs silently no-op.
    function wireGalleryStrip(root) {
        const stage = root.querySelector('.dccgg-stage');
        if (stage) stage.__dccggRoot = root;
        const ownsTarget = (el) => {
            if (root.contains(el)) return true;
            const s = el.closest && el.closest('.dccgg-stage');
            return !!(s && s.__dccggRoot === root);
        };
        bindGlobal(root, document, 'click', (e) => {
            const thumb = e.target.closest('.dccgg-gallery-thumb');
            if (!thumb || !ownsTarget(thumb)) return;
            e.preventDefault();
            const strip = thumb.parentNode;
            const thumbs = Array.from(strip.querySelectorAll('.dccgg-gallery-thumb'));
            const idx = thumbs.indexOf(thumb);
            const images = thumbs.map(t => {
                const bg = t.style.backgroundImage || '';
                const url = bg.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
                let hotspots = [];
                try { hotspots = JSON.parse(t.dataset.hotspots || '[]'); } catch (_) {}
                return { url, hotspots, alt: t.getAttribute('aria-label') || '' };
            });
            openGalleryLightbox(images, idx, (root.__dccgg && root.__dccgg.config && root.__dccgg.config.strings) || {});
        });
    }
    function openGalleryLightbox(images, startIdx, labels) {
        if (!images.length) return;
        const L = labels || {};
        let dialog = document.querySelector('.dccgg-gallery-lightbox');
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.className = 'dccgg-lightbox dccgg-gallery-lightbox';
            dialog.innerHTML = `
                <button type="button" class="dccgg-lightbox-close" aria-label="${escAttr(L.lightboxClose || 'Close')}">×</button>
                <button type="button" class="dccgg-lightbox-prev" aria-label="${escAttr(L.lightboxPrev || 'Previous')}">‹</button>
                <button type="button" class="dccgg-lightbox-next" aria-label="${escAttr(L.lightboxNext || 'Next')}">›</button>
                <div class="dccgg-lightbox-stage"></div>
                <div class="dccgg-lightbox-counter"></div>
            `;
            document.body.appendChild(dialog);
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) dialog.close();
            });
            dialog.querySelector('.dccgg-lightbox-close').addEventListener('click', () => dialog.close());
        }
        let i = startIdx;
        const stage   = dialog.querySelector('.dccgg-lightbox-stage');
        const counter = dialog.querySelector('.dccgg-lightbox-counter');
        const render = () => {
            const img = images[i];
            stage.innerHTML = `<img src="${img.url.replace(/"/g, '&quot;')}" alt="${(img.alt || '').replace(/"/g, '&quot;')}">`;
            const stageImg = stage.querySelector('img');
            // Wait for image dims so pin placement is correct.
            const placePins = () => {
                (img.hotspots || []).forEach((h, hi) => {
                    const pin = document.createElement('button');
                    pin.type = 'button';
                    pin.className = 'dccgg-hotspot-pin';
                    pin.textContent = String(hi + 1);
                    pin.style.left = h.x + '%';
                    pin.style.top  = h.y + '%';
                    pin.addEventListener('click', (e) => {
                        e.stopPropagation();
                        stage.querySelectorAll('.dccgg-hotspot-tip').forEach(t => t.remove());
                        const tip = document.createElement('div');
                        tip.className = 'dccgg-hotspot-tip';
                        tip.style.left = h.x + '%';
                        tip.style.top  = h.y + '%';
                        tip.innerHTML = '<span class="dccgg-hotspot-tip-label"></span><span class="dccgg-hotspot-tip-desc"></span>';
                        tip.querySelector('.dccgg-hotspot-tip-label').textContent = h.label || '';
                        tip.querySelector('.dccgg-hotspot-tip-desc').textContent  = h.desc  || '';
                        stage.appendChild(tip);
                        setTimeout(() => {
                            const onAway = (ev) => { if (!tip.contains(ev.target)) { tip.remove(); document.removeEventListener('click', onAway); } };
                            document.addEventListener('click', onAway);
                        }, 0);
                    });
                    stage.appendChild(pin);
                });
            };
            if (stageImg.complete) placePins();
            else stageImg.addEventListener('load', placePins, { once: true });
            counter.textContent = (i + 1) + ' / ' + images.length;
        };
        const goPrev = () => { i = (i - 1 + images.length) % images.length; render(); };
        const goNext = () => { i = (i + 1) % images.length; render(); };
        dialog.querySelector('.dccgg-lightbox-prev').onclick = goPrev;
        dialog.querySelector('.dccgg-lightbox-next').onclick = goNext;
        const onKey = (e) => {
            if (e.key === 'ArrowLeft')  goPrev();
            if (e.key === 'ArrowRight') goNext();
        };
        dialog.addEventListener('close', () => document.removeEventListener('keydown', onKey), { once: true });
        document.addEventListener('keydown', onKey);
        render();
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
    }

    function ensureLightbox(closeLabel) {
        // v0.5: only set the aria-label on first creation. v0.4 reset it on
        // every wireLightbox call, which was harmless but pointless.
        if (_lightbox) return _lightbox;
        _lightbox = document.createElement('dialog');
        _lightbox.className = 'dccgg-lightbox';
        const label = closeLabel || 'Close';
        _lightbox.innerHTML = '<div class="dccgg-lightbox-content"><img alt=""></div>' +
                              '<button type="button" class="dccgg-lightbox-close" aria-label="' +
                              label.replace(/"/g, '&quot;') +
                              '">&times;</button>';
        document.body.appendChild(_lightbox);
        _lightbox.querySelector('.dccgg-lightbox-close').addEventListener('click', () => _lightbox.close());
        _lightbox.addEventListener('click', (e) => {
            if (e.target === _lightbox) _lightbox.close();
        });
        return _lightbox;
    }
    function wireLightbox(root) {
        const imgs = root.querySelectorAll('img.dccgg-media');
        if (!imgs.length) return;
        const closeLabel = (root.__dccgg && root.__dccgg.config && root.__dccgg.config.strings && root.__dccgg.config.strings.lightboxClose) || 'Close';
        imgs.forEach(img => {
            img.setAttribute('data-lightbox-clickable', '1');
            img.addEventListener('click', () => {
                const d = ensureLightbox(closeLabel);
                if (typeof d.showModal !== 'function') return;
                d.querySelector('img').src = img.currentSrc || img.src;
                d.showModal();
            });
        });
    }

    (window.DCCGG_CHUNK = window.DCCGG_CHUNK || {})['gallery'] = function (root, config) {
        wireGalleryStrip(root, config); wireLightbox(root, config);
    };

})();
