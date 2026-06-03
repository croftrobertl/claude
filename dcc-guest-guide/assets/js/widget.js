/* DCC Guest Guide — frontend */
(function () {
    'use strict';

    const STORAGE_KEY = 'dccgg:theme';

    // -- View Transitions wrapper -----------------------------------------
    function withViewTransition(fn) {
        if (typeof document.startViewTransition === 'function') {
            try { document.startViewTransition(fn); return; } catch (_) { /* fall through */ }
        }
        fn();
    }

    // -- Boot --------------------------------------------------------------
    function initAll() {
        document.querySelectorAll('.dccgg-root').forEach(init);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll, { once: true });
    } else {
        initAll();
    }

    function init(root) {
        if (root.dataset.dccggInit === '1') return;
        root.dataset.dccggInit = '1';

        let config;
        try { config = JSON.parse(root.dataset.config || '{}'); } catch (_) { config = {}; }

        applyThemePreset(root, config);
        wireDarkMode(root, config);
        wireFab(root, config);
        wireMenu(root, config);
        wireBack(root, config);
        wireReadMore(root, config);
        wireCopy(root, config);
        wireShare(root, config);
        wireQr(root, config);
        wireSearch(root, config);
        wireTilt(root);
        wireClickFeedback(root, config);
        wireEntryAnimation(root);
        wireUrlAnchor(root, config);
    }

    // -- Theme presets ----------------------------------------------------
    function applyThemePreset(root, config) {
        const presets = config.themePresets || {};
        const name = config.themePreset || 'custom';
        const preset = presets[name];
        if (!preset) return;
        Object.keys(preset).forEach(k => root.style.setProperty(k, preset[k]));
    }

    // -- Dark mode --------------------------------------------------------
    function wireDarkMode(root, config) {
        const mode = config.darkMode || 'off';
        if (mode === 'off') return;

        const toggle = root.querySelector('.dccgg-theme-toggle');
        const stored = readStored(root);

        const apply = (isDark) => {
            root.classList.toggle('dccgg-is-dark', isDark);
            root.classList.toggle('dccgg-is-light', !isDark);
            if (toggle) toggle.setAttribute('aria-pressed', String(isDark));
        };

        if (stored === 'dark') apply(true);
        else if (stored === 'light') apply(false);
        else if (mode === 'always') apply(true);
        else if (mode === 'auto') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            apply(mq.matches);
            // Only follow system if no manual override
            if (mq.addEventListener) {
                mq.addEventListener('change', e => { if (!readStored(root)) apply(e.matches); });
            }
        }

        if (toggle) {
            toggle.addEventListener('click', () => {
                const next = !root.classList.contains('dccgg-is-dark');
                apply(next);
                writeStored(root, next ? 'dark' : 'light');
            });
        }
    }
    function readStored(root) {
        try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
    }
    function writeStored(root, v) {
        try { localStorage.setItem(STORAGE_KEY, v); } catch (_) { /* noop */ }
    }

    // -- FAB --------------------------------------------------------------
    function wireFab(root, config) {
        if (!config.enableFab) return;

        const fab     = root.querySelector('.dccgg-fab');
        const closer  = root.querySelector('.dccgg-fab-close');
        const wrapper = root.querySelector('.dccgg-wrapper');
        const overlay = root.querySelector('.dccgg-overlay');
        if (!fab || !wrapper || !overlay) return;

        let lastTrigger = null;

        const trap = (e) => {
            if (e.key === 'Escape') { close(); return; }
            if (e.key !== 'Tab') return;
            const focusable = wrapper.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (!focusable.length) return;
            const first = focusable[0];
            const last  = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };

        const open = () => {
            lastTrigger = document.activeElement;
            overlay.hidden = false;
            // next frame so the transition runs
            requestAnimationFrame(() => {
                overlay.classList.add('is-open');
                wrapper.classList.add('is-open');
            });
            document.addEventListener('keydown', trap);
            // initial focus
            const target = wrapper.querySelector('.dccgg-search-input, .dccgg-tile, .dccgg-fab-close');
            if (target) target.focus();
        };

        const close = () => {
            wrapper.classList.remove('is-open');
            overlay.classList.remove('is-open');
            document.removeEventListener('keydown', trap);
            setTimeout(() => { overlay.hidden = true; }, 320);
            // Reset detail view when closing
            setTimeout(() => root.classList.remove('is-detail'), 320);
            if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
        };

        fab.addEventListener('click', open);
        if (closer) closer.addEventListener('click', close);
        overlay.addEventListener('click', close);
    }

    // -- Menu (tile click → stage/accordion/flip) -------------------------
    function wireMenu(root, config) {
        const mode = config.revealMode || 'stage';
        const tiles = root.querySelectorAll('.dccgg-tile');

        tiles.forEach(tile => {
            tile.addEventListener('click', (e) => {
                const key = tile.dataset.key;
                if (!key) return;

                // Mark for ripple/feedback before opening so the animation runs
                ripple(tile, e);

                if (mode === 'flip') {
                    const card = tile.closest('.dccgg-flip-card');
                    if (card) {
                        card.classList.toggle('is-flipped');
                        // Move focus into the back face for keyboard users
                        const back = card.querySelector('.dccgg-flip-close');
                        if (card.classList.contains('is-flipped') && back) back.focus();
                    }
                    return;
                }
                if (mode === 'accordion') {
                    const expanded = tile.getAttribute('aria-expanded') === 'true';
                    tile.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                    const panel = tile.nextElementSibling;
                    if (panel) panel.hidden = expanded;
                    return;
                }

                // Stage swap
                openDetail(root, key);
            });
        });

        // Flip close
        root.querySelectorAll('.dccgg-flip-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.dccgg-flip-card');
                if (card) {
                    card.classList.remove('is-flipped');
                    const front = card.querySelector('.dccgg-flip-front');
                    if (front) front.focus();
                }
            });
        });
    }

    function openDetail(root, key) {
        const details = root.querySelectorAll('.dccgg-detail');
        withViewTransition(() => {
            details.forEach(d => { d.hidden = (d.dataset.key !== key); });
            root.classList.add('is-detail');
        });
        // Scroll the widget into view so the detail panel is visible
        const top = root.getBoundingClientRect().top + window.scrollY - 20;
        if (window.scrollY > top + 40) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }

    function wireBack(root, config) {
        root.querySelectorAll('.dccgg-back').forEach(btn => {
            btn.addEventListener('click', () => {
                withViewTransition(() => root.classList.remove('is-detail'));
                setTimeout(() => {
                    root.querySelectorAll('.dccgg-detail').forEach(d => { d.hidden = true; });
                }, 400);
            });
        });
    }

    // -- Read More --------------------------------------------------------
    function wireReadMore(root, config) {
        root.querySelectorAll('.dccgg-read-more').forEach(btn => {
            const more = btn.dataset.more || 'Read more';
            const less = btn.dataset.less || 'Read less';
            btn.addEventListener('click', () => {
                const content = btn.previousElementSibling;
                if (!content) return;
                const expanded = content.classList.toggle('is-expanded');
                btn.textContent = expanded ? less : more;
            });
        });
    }

    // -- Copy --------------------------------------------------------------
    function wireCopy(root, config) {
        const handle = (btn, value, e) => {
            if (e) e.stopPropagation();
            if (!navigator.clipboard) return;
            navigator.clipboard.writeText(value).then(() => {
                flashCopied(btn, config.strings && config.strings.copied);
            }).catch(() => {});
        };
        root.querySelectorAll('.dccgg-copy').forEach(btn => {
            btn.addEventListener('click', (e) => handle(btn, btn.dataset.copy || '', e));
        });
        root.querySelectorAll('.dccgg-qa-copy').forEach(btn => {
            btn.addEventListener('click', (e) => handle(btn, btn.dataset.copy || '', e));
        });
    }

    function flashCopied(btn, label) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> ' + (label || 'Copied!');
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
    }

    // -- Share -------------------------------------------------------------
    function wireShare(root, config) {
        root.querySelectorAll('.dccgg-item-share').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tileWrap = btn.closest('.dccgg-tile-wrap');
                const detail   = btn.closest('.dccgg-detail');
                const article  = btn.closest('.dccgg-item');
                const key = (tileWrap && tileWrap.dataset.sectionKey) || (detail && detail.dataset.key) || '';
                const title = (article && article.dataset.itemTitle) || '';
                const url = new URL(window.location.href);
                if (key) url.searchParams.set('guide', key);
                if (title) url.searchParams.set('item', slugify(title));
                else url.searchParams.delete('item');
                url.hash = key ? ('guide-' + key) : '';

                if (navigator.share) {
                    navigator.share({ title: title || document.title, url: url.toString() }).catch(() => {});
                    return;
                }
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(url.toString()).then(() => {
                        flashCopied(btn, (config.strings && config.strings.shareCopied) || 'Link copied!');
                    }).catch(() => {});
                }
            });
        });
    }
    function slugify(s) {
        return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    // -- QR ----------------------------------------------------------------
    function wireQr(root, config) {
        const dialog  = root.querySelector('.dccgg-qr-dialog');
        const overlay = root.querySelector('.dccgg-qr-overlay');
        const title   = root.querySelector('.dccgg-qr-title');
        const canvas  = root.querySelector('.dccgg-qr-canvas');
        const caption = root.querySelector('.dccgg-qr-caption');
        const close   = root.querySelector('.dccgg-qr-close');
        if (!dialog) return;

        const closeDlg = () => {
            dialog.hidden = true;
            overlay.hidden = true;
            document.removeEventListener('keydown', escClose);
        };
        const escClose = (e) => { if (e.key === 'Escape') closeDlg(); };

        root.querySelectorAll('.dccgg-qr').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = btn.dataset.qr || '';
                if (!value) return;
                title.textContent = btn.dataset.qrTitle || '';
                caption.textContent = value;
                canvas.innerHTML = '';
                canvas.appendChild(renderQrSvg(value));
                overlay.hidden = false;
                dialog.hidden = false;
                document.addEventListener('keydown', escClose);
                if (close) close.focus();
            });
        });
        if (close) close.addEventListener('click', closeDlg);
        if (overlay) overlay.addEventListener('click', closeDlg);
    }

    /**
     * Minimal QR encoder. To keep the bundle small we offload to a public
     * QR endpoint as an <img> fallback. The endpoint receives only the
     * value (which is text the guest already sees on screen), so there's
     * no extra privacy exposure beyond what the page already shows.
     */
    function renderQrSvg(value) {
        const img = document.createElement('img');
        img.alt = '';
        img.width = 240;
        img.height = 240;
        img.loading = 'lazy';
        img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(value);
        return img;
    }

    // -- Search ------------------------------------------------------------
    function wireSearch(root, config) {
        if (!config.enableSearch) return;
        const input = root.querySelector('.dccgg-search-input');
        const list  = root.querySelector('.dccgg-search-results');
        const live  = root.querySelector('[data-dccgg-results-count]');
        if (!input || !list) return;

        const index = Array.isArray(config.searchIndex) ? config.searchIndex : [];

        // Cmd-K / Ctrl-K
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                input.focus();
                input.select();
            }
            if (e.key === 'Escape' && document.activeElement === input) {
                input.value = '';
                hide();
                input.blur();
            }
        });

        const escHtml = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
        const escRegex = (s) => String(s).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

        const hide = () => { list.hidden = true; list.innerHTML = ''; if (live) live.textContent = ''; };

        const render = (q) => {
            q = q.trim();
            if (q.length < 2) { hide(); return; }
            const re = new RegExp(escRegex(q), 'gi');
            const hits = [];
            for (const entry of index) {
                const titleHit = re.test(entry.title);
                re.lastIndex = 0;
                const textHit = re.test(entry.text);
                re.lastIndex = 0;
                if (titleHit || textHit) {
                    hits.push(entry);
                    if (hits.length >= 12) break;
                }
            }
            if (!hits.length) {
                list.innerHTML = '<p class="dccgg-search-no-results">' +
                    escHtml((config.strings && config.strings.noResults) || 'No matches.') + '</p>';
                list.hidden = false;
                if (live) live.textContent = '0 results';
                return;
            }
            list.innerHTML = hits.map(h => {
                const titleHtml = escHtml(h.title).replace(re, m => '<mark>' + m + '</mark>');
                const sectionLabel = escHtml(sectionTitleFor(root, h.section));
                return '<button type="button" class="dccgg-search-result" data-section="' + escHtml(h.section) + '" data-item-idx="' + h.item_idx + '">' +
                    '<span class="dccgg-search-result-section">' + sectionLabel + '</span>' +
                    titleHtml +
                '</button>';
            }).join('');
            list.hidden = false;
            if (live) live.textContent = hits.length + ' results';

            list.querySelectorAll('.dccgg-search-result').forEach(b => {
                b.addEventListener('click', () => {
                    const sec = b.dataset.section;
                    openDetail(root, sec);
                    hide();
                    input.value = '';
                });
            });
        };

        let t = null;
        input.addEventListener('input', () => {
            clearTimeout(t);
            t = setTimeout(() => render(input.value), 80);
        });
        input.addEventListener('blur', () => setTimeout(hide, 200));
        input.addEventListener('focus', () => { if (input.value.length >= 2) render(input.value); });
    }

    function sectionTitleFor(root, key) {
        const wrap = root.querySelector('.dccgg-tile-wrap[data-section-key="' + cssEsc(key) + '"]');
        if (!wrap) return key;
        const t = wrap.querySelector('.dccgg-tile-title');
        return t ? t.textContent.trim() : key;
    }
    function cssEsc(s) {
        if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(s);
        return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    // -- Tilt (hover) -----------------------------------------------------
    function wireTilt(root) {
        if (!root.classList.contains('dccgg-hover-tilt')) return;
        root.querySelectorAll('.dccgg-tile').forEach(tile => {
            tile.addEventListener('mousemove', (e) => {
                const r = tile.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width - 0.5;
                const y = (e.clientY - r.top) / r.height - 0.5;
                tile.style.setProperty('--tx', (x * 12).toFixed(2) + 'deg');
                tile.style.setProperty('--ty', (-y * 12).toFixed(2) + 'deg');
            });
            tile.addEventListener('mouseleave', () => {
                tile.style.removeProperty('--tx');
                tile.style.removeProperty('--ty');
            });
        });
    }

    // -- Click feedback (ripple position + particle burst) ----------------
    function wireClickFeedback(root, config) {
        const burst = root.classList.contains('dccgg-click-burst');
        root.addEventListener('click', (e) => {
            const tile = e.target.closest('.dccgg-tile');
            if (!tile) return;
            if (burst) spawnBurst(tile, e);
        }, true);
    }

    function ripple(tile, e) {
        const r = tile.getBoundingClientRect();
        const x = e.clientX ? (e.clientX - r.left) : r.width / 2;
        const y = e.clientY ? (e.clientY - r.top)  : r.height / 2;
        tile.style.setProperty('--ripple-x', x + 'px');
        tile.style.setProperty('--ripple-y', y + 'px');
        tile.classList.remove('is-pressed');
        // force reflow so the animation restarts on each click
        void tile.offsetWidth;
        tile.classList.add('is-pressed');
        setTimeout(() => tile.classList.remove('is-pressed'), 600);
    }

    function spawnBurst(tile, e) {
        const r = tile.getBoundingClientRect();
        const cx = e.clientX || r.left + r.width / 2;
        const cy = e.clientY || r.top  + r.height / 2;
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
        document.body.appendChild(container);
        const colors = ['#f4da62', '#7BDCB5', '#5fa8e8', '#f08080', '#a94c66'];
        for (let i = 0; i < 16; i++) {
            const p = document.createElement('span');
            const angle = (Math.PI * 2 * i) / 16;
            const dist  = 40 + Math.random() * 40;
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist;
            p.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;width:8px;height:8px;border-radius:50%;background:' + colors[i % colors.length] + ';transition:transform 600ms ease, opacity 600ms ease;';
            container.appendChild(p);
            requestAnimationFrame(() => {
                p.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(0)';
                p.style.opacity = '0';
            });
        }
        setTimeout(() => container.remove(), 700);
    }

    // -- Entry animation (stagger via IntersectionObserver) ---------------
    function wireEntryAnimation(root) {
        const isAnim = root.classList.contains('dccgg-entry-fade-up') || root.classList.contains('dccgg-entry-zoom');
        if (!isAnim || !('IntersectionObserver' in window)) return;
        const wraps = root.querySelectorAll('.dccgg-tile-wrap');
        wraps.forEach((w, i) => w.style.setProperty('--i', i));
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (en.isIntersecting) {
                    en.target.classList.add('is-in-view');
                    io.unobserve(en.target);
                }
            });
        }, { threshold: 0.1 });
        wraps.forEach(w => io.observe(w));
    }

    // -- URL anchor → auto-open ------------------------------------------
    function wireUrlAnchor(root, config) {
        try {
            const url = new URL(window.location.href);
            const guide = url.searchParams.get('guide');
            if (guide) {
                if ((config.revealMode || 'stage') === 'stage') {
                    openDetail(root, guide);
                } else if ((config.revealMode || 'stage') === 'accordion') {
                    const tile = root.querySelector('.dccgg-accordion-toggle[data-key="' + cssEsc(guide) + '"]');
                    if (tile) tile.click();
                } else if (config.revealMode === 'flip') {
                    const card = root.querySelector('.dccgg-tile-wrap[data-section-key="' + cssEsc(guide) + '"] .dccgg-flip-card');
                    if (card) card.classList.add('is-flipped');
                }
            }
        } catch (_) { /* noop */ }
    }

})();
