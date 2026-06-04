/* DCC Guest Guide — frontend (v0.2.0)
 *
 * Key v0.2 changes:
 *   - Removed JS theme-preset injection (presets now in static CSS)
 *   - Print button bound via JS (no inline onclick — CSP-friendly)
 *   - Cmd-K bound once at document level, routed to the closest visible widget
 *   - URL anchor validates the key exists in THIS widget before opening
 *   - Tilt mousemove rAF-throttled (one DOM write per frame max)
 *   - Clipboard fallback via document.execCommand for non-HTTPS / Safari < 13.4
 *   - Read aloud (Speech Synthesis) per-item play/pause
 *   - Speech-to-search mic in the search bar (Web Speech Recognition)
 *   - Image lightbox using native <dialog> with pinch-zoom on touch
 *   - Long-press peek tooltip on tile hold (touch + right-click)
 *   - Mobile bottom-sheet for detail with drag-to-dismiss
 *   - Welcome Pack admin injector hooked to the editor's panel button
 *   - Sticky in-section TOC highlight via IntersectionObserver
 *   - Reading-progress bar at top of detail
 *   - Confetti on successful Copy interactions
 *   - Respects prefers-reduced-motion (animations short-circuit)
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'dccgg:theme';
    const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // -- View Transitions wrapper -----------------------------------------
    function withViewTransition(fn) {
        if (REDUCED_MOTION) { fn(); return; }
        if (typeof document.startViewTransition === 'function') {
            try { document.startViewTransition(fn); return; } catch (_) { /* fall through */ }
        }
        fn();
    }

    // -- Boot --------------------------------------------------------------
    function initAll() {
        document.querySelectorAll('.dccgg-root').forEach(init);
        wireGlobalCmdK();
        wireGlobalArrowKeys();
        wireWelcomePackEditor();
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

        // Build a fast lookup of section keys this widget owns (used by
        // URL-anchor validation so multi-widget pages don't cross-fire).
        const ownedKeys = new Set();
        root.querySelectorAll('.dccgg-tile-wrap[data-section-key]').forEach(w => {
            const k = w.dataset.sectionKey;
            if (k) ownedKeys.add(k);
        });
        root.__dccgg = { config, ownedKeys };

        wireDarkMode(root, config);
        wirePrint(root);
        wireFab(root, config);
        wireMenu(root, config);
        wireBack(root, config);
        wireReadMore(root, config);
        wireCopy(root, config);
        wireShare(root, config);
        wireQr(root, config);
        wireSearch(root, config);
        wireSearchMic(root, config);
        wireTts(root, config);
        wireTilt(root);
        wireClickFeedback(root, config);
        wireEntryAnimation(root);
        wireUrlAnchor(root, config);
        wireLightbox(root);
        wirePeek(root);
        wireSheetDrag(root);
        wireToc(root);
        wireProgressBar(root);
        wireSectionNav(root, config);
        wireWizard(root);
        wireShrinkHeader(root);
        wireMoreMenu(root, config);
    }

    // -- Sticky shrinking detail header (v0.5) ----------------------------
    function wireShrinkHeader(root) {
        if (!('IntersectionObserver' in window)) return;
        const details = root.querySelectorAll('.dccgg-detail');
        details.forEach(detail => {
            const sentinel = detail.querySelector('.dccgg-shrink-sentinel');
            if (!sentinel) return;
            const io = new IntersectionObserver((entries) => {
                entries.forEach(en => {
                    // Sentinel is the 1-px element ABOVE the header. When
                    // it leaves the viewport (scrolls above the top), the
                    // header is now stuck → shrink. When it re-enters,
                    // unshrink.
                    detail.classList.toggle('is-shrunk', !en.isIntersecting && en.boundingClientRect.top < 0);
                });
            }, { threshold: [0], rootMargin: '0px' });
            io.observe(sentinel);
        });
    }

    // -- More-menu actions (v0.5; opt-in via enable_detail_more_menu) -----
    function wireMoreMenu(root, config) {
        if (!config.enableDetailMoreMenu) return;
        root.querySelectorAll('.dccgg-more').forEach(menu => {
            // Click outside closes the <details>.
            const onDocClick = (e) => {
                if (!menu.contains(e.target) && menu.open) menu.open = false;
            };
            document.addEventListener('click', onDocClick);

            const print = menu.querySelector('.dccgg-more-print');
            const theme = menu.querySelector('.dccgg-more-theme');
            const share = menu.querySelector('.dccgg-more-share');

            if (print) {
                print.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.open = false;
                    window.print();
                });
            }
            if (theme) {
                theme.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.open = false;
                    const toggle = root.querySelector('.dccgg-theme-toggle');
                    if (toggle) {
                        toggle.click();
                    } else {
                        // Fallback: flip dark class directly + persist.
                        const next = !root.classList.contains('dccgg-is-dark');
                        root.classList.toggle('dccgg-is-dark', next);
                        root.classList.toggle('dccgg-is-light', !next);
                        try { localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light'); } catch (_) {}
                    }
                });
            }
            if (share) {
                share.addEventListener('click', (e) => {
                    e.stopPropagation();
                    menu.open = false;
                    const key = share.dataset.shareSection || '';
                    const url = new URL(window.location.href);
                    if (key) url.searchParams.set('guide', key);
                    if (navigator.share) {
                        navigator.share({ title: document.title, url: url.toString() }).catch((err) => {
                            if (err && err.name === 'AbortError') return;
                            copyText(url.toString()).then(() => flashCopied(share, (config.strings && config.strings.shareCopied) || 'Link copied!')).catch(() => {});
                        });
                    } else {
                        copyText(url.toString()).then(() => flashCopied(share, (config.strings && config.strings.shareCopied) || 'Link copied!')).catch(() => {});
                    }
                });
            }
        });
    }

    // -- Haptic feedback (v0.3) -------------------------------------------
    function hapticPulse(root, ms) {
        if (!root.__dccgg || !root.__dccgg.config || !root.__dccgg.config.enableHaptic) return;
        if (!('vibrate' in navigator)) return;
        try { navigator.vibrate(ms || 30); } catch (_) {}
    }

    // -- Dark mode --------------------------------------------------------
    function wireDarkMode(root, config) {
        const mode = config.darkMode || 'off';
        if (mode === 'off') return;

        const toggle = root.querySelector('.dccgg-theme-toggle');
        const stored = readStored();

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
            if (mq.addEventListener) {
                mq.addEventListener('change', e => { if (!readStored()) apply(e.matches); });
            }
        }

        if (toggle) {
            toggle.addEventListener('click', () => {
                const next = !root.classList.contains('dccgg-is-dark');
                apply(next);
                writeStored(next ? 'dark' : 'light');
            });
        }
    }
    function readStored()    { try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; } }
    function writeStored(v)  { try { localStorage.setItem(STORAGE_KEY, v); } catch (_) {} }

    // -- Print (CSP-safe binding, replaces v0.1 inline onclick) -----------
    function wirePrint(root) {
        const btn = root.querySelector('.dccgg-print');
        if (!btn) return;
        btn.addEventListener('click', () => window.print());
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
            requestAnimationFrame(() => {
                overlay.classList.add('is-open');
                wrapper.classList.add('is-open');
            });
            document.addEventListener('keydown', trap);
            const target = wrapper.querySelector('.dccgg-search-input, .dccgg-tile, .dccgg-fab-close');
            if (target) target.focus();
        };

        const close = () => {
            wrapper.classList.remove('is-open');
            overlay.classList.remove('is-open');
            document.removeEventListener('keydown', trap);
            setTimeout(() => { overlay.hidden = true; }, 320);
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
                ripple(tile, e);
                hapticPulse(root, 30);

                if (mode === 'flip') {
                    const card = tile.closest('.dccgg-flip-card');
                    if (card) {
                        const next = !card.classList.contains('is-flipped');
                        card.classList.toggle('is-flipped', next);
                        tile.setAttribute('aria-expanded', String(next));
                        const back = card.querySelector('.dccgg-flip-close');
                        if (next && back) back.focus();
                    }
                    return;
                }
                if (mode === 'accordion') {
                    const expanded = tile.getAttribute('aria-expanded') === 'true';
                    tile.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                    const panelId = tile.getAttribute('aria-controls');
                    const panel = panelId ? document.getElementById(panelId) : tile.nextElementSibling;
                    if (panel) panel.hidden = expanded;
                    return;
                }

                openDetail(root, key);
            });
        });

        root.querySelectorAll('.dccgg-flip-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.dccgg-flip-card');
                if (card) {
                    card.classList.remove('is-flipped');
                    const front = card.querySelector('.dccgg-flip-front');
                    if (front) { front.setAttribute('aria-expanded', 'false'); front.focus(); }
                }
            });
        });
    }

    function openDetail(root, key) {
        const details = root.querySelectorAll('.dccgg-detail');
        let found = false;
        let activeDetail = null;
        withViewTransition(() => {
            details.forEach(d => {
                const match = (d.dataset.key === key);
                d.hidden = !match;
                if (match) { found = true; activeDetail = d; }
            });
            if (found) root.classList.add('is-detail');
        });
        if (!found) return;
        // v0.4 fix: zero the progress bar of the newly visible detail and
        // clear any stale search highlights from a prior visit. Without
        // these the bar would show the last scroll percentage and old
        // <mark>s would render with no current query.
        if (activeDetail) {
            const bar = activeDetail.querySelector('.dccgg-progress-bar');
            if (bar) bar.style.width = '0%';
            if (typeof clearHighlights === 'function') clearHighlights(activeDetail);
        }
        const top = root.getBoundingClientRect().top + window.scrollY - 20;
        if (window.scrollY > top + 40) window.scrollTo({ top: Math.max(0, top), behavior: REDUCED_MOTION ? 'auto' : 'smooth' });

        // v0.5: public custom event for other Elementor widgets / external
        // JS to react to a section opening. Bubbles so listeners on
        // document / body work too.
        try {
            const titleEl = activeDetail && activeDetail.querySelector('.dccgg-detail-title span');
            const sectionTitle = titleEl ? titleEl.textContent.trim() : key;
            root.dispatchEvent(new CustomEvent('dccgg:section-opened', {
                bubbles: true,
                detail: { key: key, widget: root, sectionTitle: sectionTitle }
            }));
        } catch (_) {}
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

    // -- Copy (with execCommand fallback + confetti) ----------------------
    function copyText(value) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(value);
        }
        return new Promise((resolve, reject) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = value;
                ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                ok ? resolve() : reject(new Error('execCommand copy failed'));
            } catch (e) { reject(e); }
        });
    }

    function wireCopy(root, config) {
        const handle = (btn, value, e) => {
            if (e) e.stopPropagation();
            copyText(value).then(() => {
                flashCopied(btn, config.strings && config.strings.copied);
                spawnConfetti(btn);
                hapticPulse(root, [20, 40, 60]);
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

    function spawnConfetti(anchor) {
        if (REDUCED_MOTION) return;
        const r = anchor.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const colors = ['#f4da62', '#7BDCB5', '#5fa8e8', '#f08080', '#a94c66', '#0f6dbf', '#c19a4b'];
        const N = 32;
        for (let i = 0; i < N; i++) {
            const p = document.createElement('span');
            p.className = 'dccgg-confetti-piece';
            const angle = (Math.random() - 0.5) * Math.PI; // mostly upward spread
            const speed = 120 + Math.random() * 120;
            const vx = Math.cos(angle - Math.PI / 2) * speed;
            const vy = Math.sin(angle - Math.PI / 2) * speed;
            const rot = Math.random() * 720 - 360;
            const color = colors[i % colors.length];
            p.style.cssText = 'left:' + cx + 'px;top:' + cy + 'px;background:' + color + ';transform:rotate(' + rot + 'deg);';
            document.body.appendChild(p);
            const start = performance.now();
            const dur = 800 + Math.random() * 400;
            const tick = (now) => {
                const t = (now - start) / dur;
                if (t >= 1) { p.remove(); return; }
                const x = vx * t;
                const y = vy * t + 0.5 * 600 * t * t; // gravity
                p.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + (rot + t * 540).toFixed(0) + 'deg)';
                p.style.opacity = String(1 - t);
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }
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
                    navigator.share({ title: title || document.title, url: url.toString() }).catch((err) => {
                        // v0.4 fix: distinguish user-dismissal from a real
                        // failure. Only fall back to clipboard for the latter.
                        if (err && err.name === 'AbortError') return;
                        copyText(url.toString()).then(() => {
                            flashCopied(btn, (config.strings && config.strings.shareCopied) || 'Link copied!');
                        }).catch(() => {});
                    });
                    return;
                }
                copyText(url.toString()).then(() => {
                    flashCopied(btn, (config.strings && config.strings.shareCopied) || 'Link copied!');
                }).catch(() => {});
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
    function renderQrSvg(value) {
        const img = document.createElement('img');
        img.alt = '';
        img.width = 240;
        img.height = 240;
        img.loading = 'lazy';
        img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(value);
        return img;
    }

    // -- Search (per-widget) ----------------------------------------------
    function wireSearch(root, config) {
        if (!config.enableSearch) return;
        const input = root.querySelector('.dccgg-search-input');
        const list  = root.querySelector('.dccgg-search-results');
        const live  = root.querySelector('[data-dccgg-results-count]');
        if (!input || !list) return;

        const index = Array.isArray(config.searchIndex) ? config.searchIndex : [];

        // Platform-aware kbd label (Mac vs everyone else).
        const kbd = root.querySelector('.dccgg-search-kbd');
        if (kbd && !/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')) {
            kbd.textContent = 'Ctrl K';
        }

        // Per-widget Escape: clear and blur.
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
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
                    const itemIdx = parseInt(b.dataset.itemIdx || '0', 10);
                    const queryText = input.value.trim();
                    openDetail(root, sec);
                    // v0.4: deep-highlight the matched term inside the target
                    // item, scroll it into view, pulse the surrounding card.
                    requestAnimationFrame(() => {
                        const detail = root.querySelector('.dccgg-detail[data-key="' + cssEsc(sec) + '"]:not([hidden])');
                        if (detail) highlightQuery(detail, queryText, itemIdx);
                    });
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

    // -- Deep-highlight a matched query inside a detail (v0.4, v0.5 fixes) -
    // v0.5 fix: per-detail auto-clear timers in a WeakMap so multi-widget
    // pages don't have one widget's highlightQuery cancel another's
    // pending clear (v0.4 used module-level globals).
    const _hitClearTimers = new WeakMap();
    function clearHighlights(detail) {
        if (!detail) return;
        detail.querySelectorAll('mark.dccgg-hit').forEach(m => {
            const parent = m.parentNode;
            if (!parent) return;
            parent.replaceChild(document.createTextNode(m.textContent || ''), m);
            parent.normalize();
        });
        detail.querySelectorAll('.dccgg-hit-pulse').forEach(el => el.classList.remove('dccgg-hit-pulse'));
    }
    function highlightQuery(detail, query, itemIdx) {
        if (!detail || !query || query.length < 2) return;

        // If a wizard section, advance to the matching step first so the
        // content we're going to highlight is visible.
        if (detail.dataset.wizard === '1') {
            const wiz = detail.querySelector('.dccgg-wizard');
            if (wiz) {
                const dot = wiz.querySelector('.dccgg-wizard-dot[data-wizard-goto="' + (itemIdx | 0) + '"]');
                if (dot) dot.click();
            }
        }

        // Clear stale highlights in this detail before painting fresh ones.
        clearHighlights(detail);

        // Find the target item container.
        let target = detail.querySelector('.dccgg-detail-item-anchor[data-item-idx="' + (itemIdx | 0) + '"]');
        if (!target) {
            // Wizard / procedure: pick the active step or Nth <li>.
            const step = detail.querySelector('.dccgg-wizard-step[data-wizard-step="' + (itemIdx | 0) + '"]');
            if (step) target = step;
            else {
                const lis = detail.querySelectorAll('.dccgg-procedure > li');
                if (lis[itemIdx | 0]) target = lis[itemIdx | 0];
            }
        }
        if (!target) target = detail.querySelector('.dccgg-item');
        if (!target) return;

        // Walk text nodes inside the target item only (avoid touching
        // template content with JS handlers attached).
        const escapeRe = (s) => String(s).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        // v0.5 fix: separate non-global probe regex for the walker gate.
        // The replacement regex below stays global. v0.4 used the same
        // /.../gi for both, which silently advanced lastIndex between
        // acceptNode calls and rejected nodes whose match was below the
        // currently-set lastIndex.
        const probe = new RegExp(escapeRe(query), 'i');
        const re = new RegExp('(' + escapeRe(query) + ')', 'gi');
        const skipTags = { SCRIPT: 1, STYLE: 1, MARK: 1, BUTTON: 1, A: 1 };
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
            acceptNode(n) {
                if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                let p = n.parentNode;
                while (p && p !== target) {
                    if (p.nodeType === 1 && skipTags[p.tagName]) return NodeFilter.FILTER_REJECT;
                    p = p.parentNode;
                }
                return probe.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        const matches = [];
        let n;
        while ((n = walker.nextNode())) matches.push(n);
        matches.forEach(textNode => {
            re.lastIndex = 0;
            const frag = document.createDocumentFragment();
            const txt = textNode.nodeValue;
            let last = 0, m;
            while ((m = re.exec(txt)) !== null) {
                if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
                const mark = document.createElement('mark');
                mark.className = 'dccgg-hit';
                mark.textContent = m[0];
                frag.appendChild(mark);
                last = m.index + m[0].length;
                if (m[0].length === 0) re.lastIndex++;
            }
            if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
            textNode.parentNode.replaceChild(frag, textNode);
        });

        // Scroll first hit into view + pulse the card.
        const firstHit = target.querySelector('mark.dccgg-hit');
        if (firstHit) firstHit.scrollIntoView({ block: 'center', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
        target.classList.remove('dccgg-hit-pulse');
        void target.offsetWidth;
        target.classList.add('dccgg-hit-pulse');

        // Auto-clear after 8 s — per-detail timer in the WeakMap so
        // simultaneous activity on multiple widgets doesn't lose any.
        const prev = _hitClearTimers.get(detail);
        if (prev) clearTimeout(prev);
        const t = setTimeout(() => {
            clearHighlights(detail);
            _hitClearTimers.delete(detail);
        }, 8000);
        _hitClearTimers.set(detail, t);
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

    // -- Multi-widget-aware Cmd-K / Ctrl-K (single document binding) ------
    function wireGlobalCmdK() {
        // v0.3 fix: document.dataset doesn't exist (only HTMLElement.dataset
        // does), so the v0.2 guard never actually short-circuited.
        const root = document.documentElement;
        if (root && root.dataset && root.dataset.dccggCmdK) return;
        document.addEventListener('keydown', (e) => {
            if (!((e.metaKey || e.ctrlKey) && e.key && e.key.toLowerCase() === 'k')) return;
            const target = findClosestVisibleWidgetSearchInput();
            if (!target) return;
            e.preventDefault();
            target.focus();
            target.select();
        });
        if (root) root.dataset.dccggCmdK = '1';
    }
    function findClosestVisibleWidgetSearchInput() {
        const inputs = document.querySelectorAll('.dccgg-root .dccgg-search-input');
        if (!inputs.length) return null;
        // Prefer one inside an open FAB modal.
        for (const inp of inputs) {
            const wrap = inp.closest('.dccgg-wrapper');
            if (wrap && wrap.classList.contains('is-open')) return inp;
        }
        // Otherwise the one whose root has the largest visible area in the viewport.
        const vw = window.innerWidth, vh = window.innerHeight;
        let best = null, bestArea = -1;
        inputs.forEach(inp => {
            const root = inp.closest('.dccgg-root');
            if (!root) return;
            const r = root.getBoundingClientRect();
            const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
            const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
            const area = w * h;
            if (area > bestArea) { bestArea = area; best = inp; }
        });
        return best;
    }

    // -- Search mic (Web Speech Recognition) ------------------------------
    function wireSearchMic(root, config) {
        if (!config.enableSearch) return;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return;
        const search = root.querySelector('.dccgg-search');
        const input  = root.querySelector('.dccgg-search-input');
        if (!search || !input) return;

        const mic = document.createElement('button');
        mic.type = 'button';
        mic.className = 'dccgg-search-mic';
        mic.setAttribute('aria-label', 'Voice search');
        mic.innerHTML = '<i class="fas fa-microphone" aria-hidden="true"></i>';
        // Insert before the kbd hint so layout flows: input | mic | kbd
        const kbd = search.querySelector('.dccgg-search-kbd');
        if (kbd) search.insertBefore(mic, kbd); else search.appendChild(mic);

        let rec = null;
        const stop = () => { if (rec) { try { rec.stop(); } catch (_) {} } mic.classList.remove('is-listening'); };

        mic.addEventListener('click', () => {
            if (mic.classList.contains('is-listening')) { stop(); return; }
            try {
                rec = new SR();
                rec.continuous = false;
                rec.interimResults = true;
                rec.lang = document.documentElement.lang || 'en-US';
                rec.onresult = (e) => {
                    let txt = '';
                    for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript;
                    input.value = txt;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                };
                rec.onend = stop;
                rec.onerror = stop;
                rec.start();
                mic.classList.add('is-listening');
                input.focus();
            } catch (_) { stop(); }
        });
    }

    // -- TTS (Web Speech Synthesis) ---------------------------------------
    function wireTts(root, config) {
        if (!('speechSynthesis' in window)) return;
        let currentBtn = null;
        const buttons = root.querySelectorAll('.dccgg-item-tts');
        buttons.forEach(btn => {
            btn.hidden = false;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const article = btn.closest('.dccgg-item');
                if (!article) return;
                const text = (article.dataset.ttsText || '').trim();
                if (!text) return;

                // Toggle off if already speaking this one
                if (currentBtn === btn && speechSynthesis.speaking) {
                    speechSynthesis.cancel();
                    btn.classList.remove('is-speaking');
                    currentBtn = null;
                    return;
                }
                speechSynthesis.cancel();
                if (currentBtn) currentBtn.classList.remove('is-speaking');

                const u = new SpeechSynthesisUtterance(text);
                const lang = document.documentElement.lang || 'en-US';
                u.lang = lang;
                // Prefer a same-language voice if voices list is loaded.
                const voices = speechSynthesis.getVoices();
                const langPrefix = lang.split('-')[0];
                const match = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix.toLowerCase()));
                if (match) u.voice = match;
                u.onend = () => { btn.classList.remove('is-speaking'); if (currentBtn === btn) currentBtn = null; };
                u.onerror = u.onend;
                speechSynthesis.speak(u);
                btn.classList.add('is-speaking');
                currentBtn = btn;
            });
        });
    }

    // -- Tilt (rAF-throttled) ---------------------------------------------
    function wireTilt(root) {
        if (!root.classList.contains('dccgg-hover-tilt')) return;
        root.querySelectorAll('.dccgg-tile').forEach(tile => {
            let pending = false;
            let nextX = 0, nextY = 0;
            tile.addEventListener('mousemove', (e) => {
                const r = tile.getBoundingClientRect();
                nextX = (e.clientX - r.left) / r.width - 0.5;
                nextY = (e.clientY - r.top) / r.height - 0.5;
                if (pending) return;
                pending = true;
                requestAnimationFrame(() => {
                    tile.style.setProperty('--tx', (nextX * 12).toFixed(2) + 'deg');
                    tile.style.setProperty('--ty', (-nextY * 12).toFixed(2) + 'deg');
                    pending = false;
                });
            });
            tile.addEventListener('mouseleave', () => {
                tile.style.removeProperty('--tx');
                tile.style.removeProperty('--ty');
            });
        });
    }

    // -- Click feedback ---------------------------------------------------
    function wireClickFeedback(root, config) {
        const burst = root.classList.contains('dccgg-click-burst');
        if (!burst) return;
        root.addEventListener('click', (e) => {
            const tile = e.target.closest('.dccgg-tile');
            if (!tile) return;
            spawnBurst(tile, e);
        }, true);
    }
    function ripple(tile, e) {
        if (REDUCED_MOTION) return;
        const r = tile.getBoundingClientRect();
        const x = e.clientX ? (e.clientX - r.left) : r.width / 2;
        const y = e.clientY ? (e.clientY - r.top)  : r.height / 2;
        tile.style.setProperty('--ripple-x', x + 'px');
        tile.style.setProperty('--ripple-y', y + 'px');
        tile.classList.remove('is-pressed');
        void tile.offsetWidth;
        tile.classList.add('is-pressed');
        setTimeout(() => tile.classList.remove('is-pressed'), 600);
    }
    function spawnBurst(tile, e) {
        if (REDUCED_MOTION) return;
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

    // -- Entry animation --------------------------------------------------
    function wireEntryAnimation(root) {
        const isAnim = root.classList.contains('dccgg-entry-fade-up') || root.classList.contains('dccgg-entry-zoom');
        if (!isAnim || REDUCED_MOTION || !('IntersectionObserver' in window)) return;
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

    // -- URL anchor (per-widget validation) -------------------------------
    function wireUrlAnchor(root, config) {
        try {
            const url = new URL(window.location.href);
            const guide = url.searchParams.get('guide');
            if (!guide) return;
            if (!root.__dccgg || !root.__dccgg.ownedKeys || !root.__dccgg.ownedKeys.has(guide)) return;

            // v0.5: ?q=PHRASE auto-runs highlightQuery on the matched
            // detail. Empty or 1-char queries are silently ignored.
            const phrase = (url.searchParams.get('q') || '').trim();
            const item   = (url.searchParams.get('item') || '').trim();

            const mode = config.revealMode || 'stage';
            if (mode === 'stage') {
                openDetail(root, guide);
                if (phrase.length >= 2) {
                    // Wait a frame so the detail is rendered before walking.
                    requestAnimationFrame(() => {
                        const detail = root.querySelector('.dccgg-detail[data-key="' + cssEsc(guide) + '"]:not([hidden])');
                        if (detail) {
                            // Resolve item index: prefer ?item= slug match,
                            // else default to 0.
                            let idx = 0;
                            if (item) {
                                const anchors = detail.querySelectorAll('.dccgg-detail-item-anchor');
                                anchors.forEach((a, i) => {
                                    const art = a.querySelector('.dccgg-item');
                                    if (art && slugify(art.dataset.itemTitle || '') === item) idx = i;
                                });
                            }
                            highlightQuery(detail, phrase, idx);
                        }
                    });
                }
            } else if (mode === 'accordion') {
                const tile = root.querySelector('.dccgg-accordion-toggle[data-key="' + cssEsc(guide) + '"]');
                if (tile) tile.click();
            } else if (mode === 'flip') {
                const card = root.querySelector('.dccgg-tile-wrap[data-section-key="' + cssEsc(guide) + '"] .dccgg-flip-card');
                if (card) card.classList.add('is-flipped');
            }
        } catch (_) {}
    }

    // -- Image lightbox (single global <dialog>, shared across widgets) ---
    let _lightbox = null;
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

    // -- Long-press peek tooltip -----------------------------------------
    function wirePeek(root) {
        let peekEl = null;
        let timer = null;
        let activeTile = null;
        let startX = 0, startY = 0;

        const closePeek = () => {
            clearTimeout(timer); timer = null;
            if (peekEl) { peekEl.remove(); peekEl = null; }
            activeTile = null;
        };

        const openPeekFor = (tile, x, y) => {
            const key = tile.dataset.key;
            if (!key) return;
            const detail = root.querySelector('.dccgg-detail[data-key="' + cssEsc(key) + '"]');
            const firstItem = detail && detail.querySelector('.dccgg-item');
            const titleEl = tile.querySelector('.dccgg-tile-title');
            const descEl  = tile.querySelector('.dccgg-tile-desc');
            const bodyText = (() => {
                if (firstItem) {
                    const body = firstItem.querySelector('.dccgg-item-body');
                    if (body) return body.textContent.trim().slice(0, 160);
                }
                return (descEl && descEl.textContent.trim().slice(0, 160)) || '';
            })();
            if (!bodyText) return;
            peekEl = document.createElement('div');
            peekEl.className = 'dccgg-peek';
            peekEl.innerHTML = '<strong></strong><div></div>';
            peekEl.querySelector('strong').textContent = titleEl ? titleEl.textContent.trim() : '';
            peekEl.querySelector('div').textContent = bodyText + (bodyText.length >= 160 ? '…' : '');
            document.body.appendChild(peekEl);
            const pw = Math.min(300, window.innerWidth - 32);
            peekEl.style.maxWidth = pw + 'px';
            peekEl.style.left = Math.max(16, Math.min(window.innerWidth - pw - 16, x + 12)) + 'px';
            peekEl.style.top = Math.max(16, y + 16) + 'px';
            requestAnimationFrame(() => peekEl.classList.add('is-open'));
        };

        root.querySelectorAll('.dccgg-tile').forEach(tile => {
            tile.addEventListener('pointerdown', (e) => {
                // v0.3 fix: pointerdown handles touch ONLY. Right-click is
                // handled exclusively by the contextmenu listener so we
                // don't double-fire the peek on desktop.
                if (e.pointerType !== 'touch') return;
                startX = e.clientX; startY = e.clientY;
                activeTile = tile;
                timer = setTimeout(() => openPeekFor(tile, startX, startY), 500);
            });
            tile.addEventListener('pointermove', (e) => {
                if (!activeTile) return;
                if (Math.hypot(e.clientX - startX, e.clientY - startY) > 10) closePeek();
            });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
                tile.addEventListener(ev, closePeek));
            tile.addEventListener('contextmenu', (e) => {
                if (e.pointerType === 'touch') return;
                e.preventDefault();
                openPeekFor(tile, e.clientX, e.clientY);
                setTimeout(closePeek, 3000);
            });
        });
    }

    // -- Mobile bottom-sheet drag-to-dismiss ------------------------------
    function wireSheetDrag(root) {
        const stage = root.querySelector('.dccgg-stage');
        if (!stage) return;
        const isMobileSheet = () => window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches;

        let startY = 0;
        let currentY = 0;
        let dragging = false;
        let backdrop = null;

        const ensureBackdrop = () => {
            if (backdrop) return backdrop;
            backdrop = document.createElement('div');
            backdrop.className = 'dccgg-sheet-backdrop';
            root.querySelector('.dccgg-wrapper').appendChild(backdrop);
            backdrop.addEventListener('click', () => root.classList.remove('is-detail'));
            return backdrop;
        };
        ensureBackdrop();

        stage.addEventListener('pointerdown', (e) => {
            if (!isMobileSheet() || !root.classList.contains('is-detail')) return;
            // v0.3 fix: don't hijack interactive controls (back button,
            // section nav arrows, wizard buttons) that happen to live in
            // the drag-handle zone at the top of the sheet.
            if (e.target.closest('button, a, input, select, textarea')) return;
            const r = stage.getBoundingClientRect();
            if (e.clientY - r.top > 60) return;
            dragging = true;
            startY = e.clientY;
            currentY = e.clientY;
            root.classList.add('is-sheet-dragging');
        });
        document.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            currentY = e.clientY;
            const dy = Math.max(0, currentY - startY);
            stage.style.transform = 'translateY(' + dy + 'px)';
        });
        document.addEventListener('pointerup', () => {
            if (!dragging) return;
            dragging = false;
            root.classList.remove('is-sheet-dragging');
            const dy = Math.max(0, currentY - startY);
            const dismiss = dy > (stage.offsetHeight * 0.3);
            stage.style.transform = '';
            if (dismiss) {
                root.classList.remove('is-detail');
                setTimeout(() => {
                    root.querySelectorAll('.dccgg-detail').forEach(d => { d.hidden = true; });
                }, 320);
            }
        });
    }

    // -- Sticky TOC current-item highlight --------------------------------
    function wireToc(root) {
        if (!('IntersectionObserver' in window)) return;
        root.querySelectorAll('.dccgg-detail--has-toc').forEach(detail => {
            const tocLinks = detail.querySelectorAll('.dccgg-toc a[data-toc-item]');
            const anchors  = detail.querySelectorAll('.dccgg-detail-item-anchor');
            if (!tocLinks.length || !anchors.length) return;

            tocLinks.forEach(a => {
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    const idx = parseInt(a.dataset.tocItem || '0', 10);
                    const target = detail.querySelector('.dccgg-detail-item-anchor[data-item-idx="' + idx + '"]');
                    if (target) target.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' });
                });
            });

            const io = new IntersectionObserver((entries) => {
                entries.forEach(en => {
                    if (en.isIntersecting) {
                        const idx = en.target.dataset.itemIdx;
                        tocLinks.forEach(a => a.classList.toggle('is-current', a.dataset.tocItem === idx));
                    }
                });
            }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
            anchors.forEach(a => io.observe(a));
        });
    }

    // -- Reading progress bar --------------------------------------------
    function wireProgressBar(root) {
        const stage = root.querySelector('.dccgg-stage');
        if (!stage) return;
        const update = () => {
            const detail = stage.querySelector('.dccgg-detail:not([hidden])');
            if (!detail) return;
            const bar = detail.querySelector('.dccgg-progress-bar');
            if (!bar) return;
            // Compute progress through the detail card vs the viewport.
            const r = detail.getBoundingClientRect();
            const vh = window.innerHeight;
            const total = Math.max(1, r.height - vh);
            const scrolled = Math.min(total, Math.max(0, -r.top));
            const pct = (scrolled / total) * 100;
            bar.style.width = pct.toFixed(1) + '%';
        };
        let pending = false;
        const onScroll = () => {
            if (pending) return;
            pending = true;
            requestAnimationFrame(() => { update(); pending = false; });
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        // Update once on entering detail
        const mo = new MutationObserver(update);
        mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    }

    // -- Welcome Pack editor hook -----------------------------------------
    function wireWelcomePackEditor() {
        // Single delegated listener; only fires in the Elementor editor panel.
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-dccgg-welcome-pack]');
            if (!btn) return;
            e.preventDefault();
            insertWelcomePack(btn);
        });
    }
    function insertWelcomePack(btn) {
        const pack = welcomePackPayload();
        // Try Elementor editor model API; falls back to a console warning.
        try {
            if (!window.elementor || !window.elementor.getPanelView) {
                console.warn('DCCGG: Welcome Pack requires the Elementor editor; nothing inserted.');
                return;
            }
            const panel = window.elementor.getPanelView();
            const view  = panel && panel.getCurrentPageView && panel.getCurrentPageView();
            const model = view && view.model && view.model.get && view.model.get('editedElementView') && view.model.get('editedElementView').getEditModel();
            const elementModel = model || (window.elementor.selection && window.elementor.selection.getElements && window.elementor.selection.getElements()[0]);
            if (!elementModel || !elementModel.get) {
                console.warn('DCCGG: could not resolve the active widget model.');
                return;
            }
            const settings = elementModel.get('settings');
            if (!settings) { console.warn('DCCGG: no settings model.'); return; }
            const existingSections = (settings.get('guide_sections') || []).toJSON ? settings.get('guide_sections').toJSON() : [];
            const existingItems    = (settings.get('guide_items')    || []).toJSON ? settings.get('guide_items').toJSON()    : [];
            // v0.3 fix: Elementor's repeater model identifies rows by _id;
            // injecting plain objects without it can confuse the panel
            // renderer (drag handles, delete buttons get stuck on the
            // first row).
            const rid = () => Math.random().toString(36).slice(2, 9);
            const withId = (rows) => rows.map(r => Object.assign({ _id: rid() }, r));
            settings.set('guide_sections', existingSections.concat(withId(pack.sections)));
            settings.set('guide_items',    existingItems.concat(withId(pack.items)));
            if (window.elementor.saver && window.elementor.saver.update) {
                window.elementor.saver.update();
            }
            btn.textContent = '✓ Inserted — save the page to keep.';
            btn.disabled = true;
        } catch (err) {
            console.error('DCCGG: Welcome Pack injection failed:', err);
        }
    }
    // -- Section prev/next nav (v0.3, single-listener in v0.4, swipe in v0.5)
    function wireSectionNav(root, config) {
        if (!config.enableSectionNav) return;
        const stage = root.querySelector('.dccgg-stage');
        if (!stage) return;

        // Click handlers on the rendered buttons (per-root; cheap).
        stage.querySelectorAll('.dccgg-section-prev, .dccgg-section-next').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.hasAttribute('disabled')) return;
                const key = btn.dataset.targetKey || '';
                if (!key) return;
                openDetail(root, key);
                hapticPulse(root, 20);
            });
        });

        // v0.5: horizontal swipe inside the active detail on touch devices.
        // Wizard-mode sections route to wizard Back/Next; other sections to
        // the prev/next arrows. Vertical drift > 30 px aborts so vertical
        // scroll isn't hijacked.
        if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;
        let startX = 0, startY = 0, startT = 0, tracking = false;
        stage.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'touch') return;
            // Don't fight interactive controls inside the detail.
            if (e.target.closest('button, a, input, select, textarea')) return;
            tracking = true; startX = e.clientX; startY = e.clientY; startT = e.timeStamp || Date.now();
        });
        stage.addEventListener('pointerup', (e) => {
            if (!tracking) return;
            tracking = false;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const dt = (e.timeStamp || Date.now()) - startT;
            if (Math.abs(dx) < 50) return;
            if (Math.abs(dy) > 30) return;
            if (dt > 800) return; // too slow → probably a drag/scroll
            const active = stage.querySelector('.dccgg-detail:not([hidden])');
            if (!active) return;
            // Wizard owns left/right swipe inside its section.
            if (active.dataset.wizard === '1') {
                const wiz = active.querySelector('.dccgg-wizard');
                if (wiz) {
                    const btn = dx > 0 ? wiz.querySelector('.dccgg-wizard-back') : wiz.querySelector('.dccgg-wizard-next');
                    if (btn && !btn.disabled) btn.click();
                }
                return;
            }
            const btn = dx > 0 ? active.querySelector('.dccgg-section-prev') : active.querySelector('.dccgg-section-next');
            if (btn && !btn.hasAttribute('disabled')) btn.click();
        });
        stage.addEventListener('pointercancel', () => { tracking = false; });
    }

    /**
     * One document-level keyboard router that handles ←/→ for every widget
     * on the page. Routes to wizard-step navigation when the visible detail
     * is in wizard mode; otherwise to section-nav. Replaces v0.3's
     * per-widget document listener.
     */
    function wireGlobalArrowKeys() {
        const root = document.documentElement;
        if (root && root.dataset && root.dataset.dccggArrows) return;
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
            const tag = (document.activeElement && document.activeElement.tagName) || '';
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;

            // Find an active widget by looking for a root with .is-detail
            // and a visible detail inside it.
            const roots = document.querySelectorAll('.dccgg-root.is-detail');
            for (const r of roots) {
                const stage = r.querySelector('.dccgg-stage');
                if (!stage) continue;
                const active = stage.querySelector('.dccgg-detail:not([hidden])');
                if (!active) continue;

                // Wizard mode owns arrow keys when the active detail is one.
                if (active.dataset.wizard === '1') {
                    const wiz = active.querySelector('.dccgg-wizard');
                    if (wiz) {
                        const btn = e.key === 'ArrowLeft'
                            ? wiz.querySelector('.dccgg-wizard-back')
                            : wiz.querySelector('.dccgg-wizard-next');
                        if (btn && !btn.disabled) {
                            e.preventDefault();
                            btn.click();
                        }
                    }
                    return;
                }

                // Otherwise drive the section nav, if it has one.
                const btn = e.key === 'ArrowLeft'
                    ? active.querySelector('.dccgg-section-prev')
                    : active.querySelector('.dccgg-section-next');
                if (btn && !btn.hasAttribute('disabled')) {
                    e.preventDefault();
                    btn.click();
                }
                return;
            }
        });
        if (root) root.dataset.dccggArrows = '1';
    }

    // -- Wizard mode (v0.3) ------------------------------------------------
    function wireWizard(root) {
        root.querySelectorAll('.dccgg-wizard').forEach(wiz => {
            const steps   = wiz.querySelectorAll('.dccgg-wizard-step');
            const dots    = wiz.querySelectorAll('.dccgg-wizard-dot');
            const back    = wiz.querySelector('.dccgg-wizard-back');
            const next    = wiz.querySelector('.dccgg-wizard-next');
            const total   = steps.length;
            if (!total) return;

            const labelNext = next ? (next.dataset.labelNext || 'Next') : 'Next';
            const labelDone = next ? (next.dataset.labelDone || 'Done') : 'Done';

            const setStep = (idx) => {
                idx = Math.max(0, Math.min(total - 1, idx));
                wiz.dataset.step = String(idx);
                steps.forEach((s, i) => {
                    s.hidden = (i !== idx);
                    s.classList.toggle('is-active', i === idx);
                });
                dots.forEach((d, i) => {
                    d.classList.toggle('is-active', i === idx);
                    d.classList.toggle('is-visited', i < idx);
                    d.setAttribute('aria-selected', String(i === idx));
                });
                if (back) back.disabled = (idx === 0);
                if (next) {
                    // On the last step, the Next button becomes Done and
                    // collapses the wizard back to step 0 (treat it as a
                    // "reset" — easy to retry).
                    const isLast = idx === total - 1;
                    const label  = isLast ? labelDone : labelNext;
                    next.innerHTML = label + ' <i class="fas fa-' + (isLast ? 'check' : 'arrow-right') + '" aria-hidden="true"></i>';
                }
                hapticPulse(root, 15);
            };

            if (back) back.addEventListener('click', (e) => {
                e.stopPropagation();
                setStep((parseInt(wiz.dataset.step || '0', 10)) - 1);
            });
            if (next) next.addEventListener('click', (e) => {
                e.stopPropagation();
                const cur = parseInt(wiz.dataset.step || '0', 10);
                if (cur === total - 1) {
                    // Done → confetti, reset to 0
                    spawnConfetti(next);
                    setStep(0);
                } else {
                    setStep(cur + 1);
                }
            });
            dots.forEach((d) => {
                d.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const t = parseInt(d.dataset.wizardGoto || '0', 10);
                    setStep(t);
                });
            });
        });
    }

    function welcomePackPayload() {
        const sections = [
            { section_key: 'wifi',      section_title: 'Wi-Fi',           section_desc: 'Network name & password.',             section_icon: { value: 'fas fa-wifi',             library: 'solid' } },
            { section_key: 'hot-tub',   section_title: 'Hot Tub',         section_desc: 'How to use it & house rules.',         section_icon: { value: 'fas fa-hot-tub',          library: 'solid' } },
            { section_key: 'trash',     section_title: 'Trash & Recycling', section_desc: 'Pickup days & sorting.',             section_icon: { value: 'fas fa-trash',            library: 'solid' } },
            { section_key: 'checkout',  section_title: 'Checkout',        section_desc: 'Departure checklist & timing.',        section_icon: { value: 'fas fa-door-open',        library: 'solid' } },
            { section_key: 'local',     section_title: 'Local Eats',      section_desc: 'Our favorite nearby spots.',           section_icon: { value: 'fas fa-utensils',         library: 'solid' } },
            { section_key: 'emergency', section_title: 'Emergency',       section_desc: 'Numbers & nearest hospital.',          section_icon: { value: 'fas fa-phone-alt',        library: 'solid' } },
        ];
        const items = [
            { item_section: 'wifi',     item_title: 'Network name',        item_icon: { value: 'fas fa-wifi', library: 'solid' }, content_source: 'wysiwyg', item_content: 'The Wi-Fi network is named below. Replace this with your SSID.', item_copy: 'yes', item_copy_value: 'CHANGE-ME-SSID' },
            { item_section: 'wifi',     item_title: 'Password',            item_icon: { value: 'fas fa-key',  library: 'solid' }, content_source: 'wysiwyg', item_content: 'Tap Copy and paste it into your device.', item_copy: 'yes', item_copy_value: 'change-me-password' },
            { item_section: 'hot-tub',  item_title: 'Before you get in',   item_icon: { value: 'fas fa-thermometer-half', library: 'solid' }, content_source: 'wysiwyg', item_content: 'Check the temperature reads about 100–102°F before stepping in.' },
            { item_section: 'hot-tub',  item_title: 'House rules',         item_icon: { value: 'fas fa-list',              library: 'solid' }, content_source: 'wysiwyg', item_content: 'No glass containers in the tub. Children under 12 must be supervised.' },
            { item_section: 'trash',    item_title: 'Pickup days',         item_icon: { value: 'fas fa-calendar-day',      library: 'solid' }, content_source: 'wysiwyg', item_content: 'Tuesdays at 7am. Bins live in the side yard.' },
            { item_section: 'checkout', item_title: 'Checkout time',       item_icon: { value: 'fas fa-clock',             library: 'solid' }, content_source: 'wysiwyg', item_content: 'Please be checked out by 11:00 AM so the cleaners can get in.' },
            { item_section: 'checkout', item_title: 'Departure checklist', item_icon: { value: 'fas fa-clipboard-check',   library: 'solid' }, content_source: 'wysiwyg', item_content: 'Strip the beds, run the dishwasher, turn the AC up to 78°F, lock the doors.' },
            { item_section: 'local',    item_title: 'Best breakfast',      item_icon: { value: 'fas fa-coffee',            library: 'solid' }, content_source: 'wysiwyg', item_content: 'The place down the street opens at 7am — try the pancakes.' },
            { item_section: 'local',    item_title: 'Best seafood',        item_icon: { value: 'fas fa-fish',              library: 'solid' }, content_source: 'wysiwyg', item_content: 'Quick drive away — reservations recommended on weekends.' },
            { item_section: 'emergency',item_title: 'Owner contact',       item_icon: { value: 'fas fa-user',              library: 'solid' }, content_source: 'wysiwyg', item_content: 'Call 555-123-4567 for any urgent issue.', item_copy: 'yes', item_copy_value: '555-123-4567' },
            { item_section: 'emergency',item_title: 'Nearest hospital',    item_icon: { value: 'fas fa-hospital',          library: 'solid' }, content_source: 'wysiwyg', item_content: 'A short drive away. See map below.', enable_map: 'yes', map_url: { url: 'https://maps.google.com/?q=hospital+near+me', is_external: 'on' } },
            { item_section: 'emergency',item_title: '911',                 item_icon: { value: 'fas fa-phone-alt',         library: 'solid' }, content_source: 'wysiwyg', item_content: 'For any life-threatening emergency, call 911.', item_copy: 'yes', item_copy_value: '911' },
        ];
        return { sections, items };
    }

})();
