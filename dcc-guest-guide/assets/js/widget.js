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
        wireVideoPosters(root);
        wireChecklists(root);
        wireParallax(root);
        wireConditions(root, config);
        wireGalleryStrip(root);
        wireAiSearch(root, config);
        wireSavePdf(root, config);
        wireReportProblem(root, config);
        wireVoiceConcierge(root, config);
        wireEmergency(root, config);
        wireReview(root, config);
    }

    // -- Save as PDF (v0.8) -----------------------------------------------
    // The button just kicks window.print(); the magazine-quality output is
    // produced by the @media print CSS. A small toast tells first-timers
    // how to pick the "Save as PDF" destination in the browser dialog.
    function wireSavePdf(root, config) {
        const SHOWN_KEY = 'dccgg:savepdf-tip-shown';
        root.addEventListener('click', (e) => {
            const btn = e.target.closest('.dccgg-more-save-pdf');
            if (!btn) return;
            const tip = (config.savePdf && config.savePdf.tip) || '';
            let shown = false;
            try { shown = sessionStorage.getItem(SHOWN_KEY) === '1'; } catch (_) {}
            if (tip && !shown) {
                showPdfTip(tip);
                try { sessionStorage.setItem(SHOWN_KEY, '1'); } catch (_) {}
                // Let the toast paint before opening the print dialog.
                setTimeout(() => window.print(), 600);
            } else {
                window.print();
            }
        });
    }
    function showPdfTip(text) {
        const t = document.createElement('div');
        t.className = 'dccgg-toast';
        t.textContent = text;
        Object.assign(t.style, {
            position: 'fixed', left: '50%', top: '24px', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.86)', color: '#fff', padding: '10px 16px',
            borderRadius: '999px', font: '14px system-ui, sans-serif',
            zIndex: 99999, maxWidth: '90vw', textAlign: 'center',
            boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        });
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 4500);
    }

    // -- Report a problem (v0.8) ------------------------------------------
    function wireReportProblem(root, config) {
        if (!config.report || !config.report.enabled) return;
        const STR = config.report.strings || {};
        const CATS = Array.isArray(config.report.categories) ? config.report.categories : [];

        let dialog = null;
        const ensureDialog = () => {
            if (dialog) return dialog;
            dialog = document.createElement('dialog');
            dialog.className = 'dccgg-report-dialog';
            const catField = CATS.length
                ? `<label>${escHtml(STR.category || 'Category')}<select class="dccgg-report-cat">${CATS.map(c => `<option value="${escAttr(c)}">${escHtml(c)}</option>`).join('')}</select></label>`
                : '';
            dialog.innerHTML = `
                <div class="dccgg-report-head">
                    <h3>${escHtml(STR.title || 'Report a problem')}</h3>
                    <button type="button" class="dccgg-report-close" aria-label="Close">&times;</button>
                </div>
                <div class="dccgg-report-body">
                    ${catField}
                    <label>
                        ${escHtml(STR.name || 'Your name (optional)')}
                        <input type="text" class="dccgg-report-name" maxlength="100" autocomplete="name">
                    </label>
                    <label>
                        ${escHtml(STR.cottage || 'Which cottage are you staying in?')}
                        <input type="text" class="dccgg-report-cottage" maxlength="100" autocomplete="off">
                    </label>
                    <label>
                        ${escHtml(STR.desc || 'Describe the problem')}
                        <textarea class="dccgg-report-desc" required maxlength="1500" rows="5"></textarea>
                    </label>
                    <label>
                        ${escHtml(STR.contact || 'Email to reach you back (optional)')}
                        <input type="email" class="dccgg-report-contact" autocomplete="email">
                    </label>
                    <p class="dccgg-report-privacy">${escHtml(STR.privacy || '')}</p>
                </div>
                <div class="dccgg-report-foot">
                    <button type="button" class="dccgg-btn-cancel">${escHtml(STR.cancel || 'Cancel')}</button>
                    <button type="button" class="dccgg-btn-send">${escHtml(STR.send || 'Send report')}</button>
                </div>
            `;
            document.body.appendChild(dialog);
            dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
            dialog.querySelector('.dccgg-report-close').addEventListener('click', () => dialog.close());
            dialog.querySelector('.dccgg-btn-cancel').addEventListener('click', () => dialog.close());
            dialog.querySelector('.dccgg-btn-send').addEventListener('click', () => sendReport(dialog, root, config));
            return dialog;
        };

        const open = (section, itemTitle) => {
            const d = ensureDialog();
            d.dataset.section = section || '';
            d.dataset.item    = itemTitle || '';
            const desc = d.querySelector('.dccgg-report-desc');
            desc.value = itemTitle ? `[${itemTitle}] ` : '';
            d.querySelector('.dccgg-report-contact').value = '';
            const nameEl = d.querySelector('.dccgg-report-name');
            const cottageEl = d.querySelector('.dccgg-report-cottage');
            if (nameEl) nameEl.value = '';
            if (cottageEl) cottageEl.value = '';
            const sendBtn = d.querySelector('.dccgg-btn-send');
            sendBtn.disabled = false;
            sendBtn.textContent = STR.send || 'Send report';
            if (typeof d.showModal === 'function') d.showModal();
            else d.setAttribute('open', '');
            // Focus name first if it exists — it's the friendliest field
            // to land in. Falls back to desc if name was customized away.
            setTimeout(() => (nameEl || desc).focus(), 50);
        };

        // More-menu "Report a problem" → context is the current section title.
        root.addEventListener('click', (e) => {
            const m = e.target.closest('.dccgg-more-report');
            if (!m) return;
            // Close the parent <details> popover so it doesn't sit open behind the dialog.
            const details = m.closest('details');
            if (details) details.open = false;
            open(m.dataset.reportSection || '', '');
        });

        // Per-item Report button.
        root.addEventListener('click', (e) => {
            const b = e.target.closest('.dccgg-item-report');
            if (!b) return;
            open(b.dataset.reportSection || '', b.dataset.reportItem || '');
        });
    }
    function sendReport(dialog, root, config) {
        const STR  = (config.report && config.report.strings) || {};
        const desc = dialog.querySelector('.dccgg-report-desc').value.trim();
        if (!desc) { dialog.querySelector('.dccgg-report-desc').focus(); return; }
        const catEl    = dialog.querySelector('.dccgg-report-cat');
        const contact  = dialog.querySelector('.dccgg-report-contact').value.trim();
        const nameEl   = dialog.querySelector('.dccgg-report-name');
        const cottEl   = dialog.querySelector('.dccgg-report-cottage');
        const send     = dialog.querySelector('.dccgg-btn-send');
        send.disabled = true;
        send.textContent = '…';
        const reportCfg = config.report || {};
        const body = new URLSearchParams();
        body.set('action',           'dccgg_report_problem');
        body.set('nonce',            config.nonce);
        body.set('category',         catEl ? catEl.value : '');
        body.set('description',      desc);
        body.set('contact',          contact);
        body.set('reporter_name',    nameEl ? nameEl.value.trim() : '');
        body.set('reporter_cottage', cottEl ? cottEl.value.trim() : '');
        body.set('section',          dialog.dataset.section || '');
        body.set('item',             dialog.dataset.item || '');
        body.set('stay',             stayKey());
        body.set('page_url',         window.location.href);
        body.set('recipients',       reportCfg.recipients || '');
        // v0.9.7: pass the host's template + From settings so the AJAX
        // handler can compose a custom email. Server still has a sane
        // default if any of these are blank.
        body.set('subject_tpl',      reportCfg.subjectTpl || '');
        body.set('body_tpl',         reportCfg.bodyTpl || '');
        body.set('from_email',       reportCfg.fromEmail || '');
        body.set('from_name',        reportCfg.fromName || '');
        body.set('include_ua',       reportCfg.includeUA || 'yes');
        fetch(config.ajaxUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        }).then(r => r.json()).then(json => {
            if (json && json.success) {
                dialog.close();
                showPdfTip(STR.thankYou || 'Thanks!');
            } else {
                send.disabled = false;
                send.textContent = STR.send || 'Send report';
                showPdfTip((json && json.data && json.data.message) || STR.error || 'Could not send.');
            }
        }).catch(() => {
            send.disabled = false;
            send.textContent = STR.send || 'Send report';
            showPdfTip(STR.error || 'Could not send.');
        });
    }
    function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    function escAttr(s) { return escHtml(s).replace(/"/g, '&quot;'); }

    // -- Voice-first concierge (v0.8) -------------------------------------
    // Adds a mic button next to the existing "Ask anything" AI button.
    // Tap → speech-recognize → fill question → askAi() → answer is spoken.
    function wireVoiceConcierge(root, config) {
        if (!config.aiSearch || !config.aiSearch.enabled) return;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const synth = window.speechSynthesis;
        if (!SR && !synth) return;

        // Inject the mic + transcript into the AI prompt the moment it appears.
        const results = root.querySelector('.dccgg-search-results');
        if (!results) return;
        const decorate = (wrap) => {
            if (!wrap || wrap.dataset.voiceWired === '1') return;
            wrap.dataset.voiceWired = '1';
            const btn = wrap.querySelector('.dccgg-ai-button');
            if (!btn) return;
            // Wrap the existing button + new mic in a row.
            const row = document.createElement('div');
            row.className = 'dccgg-ai-actions';
            btn.parentNode.insertBefore(row, btn);
            row.appendChild(btn);
            if (SR) {
                const mic = document.createElement('button');
                mic.type = 'button';
                mic.className = 'dccgg-ai-mic';
                mic.setAttribute('aria-label', config.aiSearch.voiceLabel || 'Ask by voice');
                mic.innerHTML = '<i class="fas fa-microphone" aria-hidden="true"></i>';
                row.appendChild(mic);
                const transcript = document.createElement('div');
                transcript.className = 'dccgg-ai-transcript';
                row.parentNode.insertBefore(transcript, row.nextSibling);
                mic.addEventListener('click', () => {
                    recordOnce(SR,
                        (interim) => { transcript.textContent = interim; },
                        (final) => {
                            transcript.textContent = final;
                            mic.classList.remove('is-listening');
                            if (final) askAi(root, config, final, wrap, /*onAnswer*/ (answer) => {
                                if (synth && answer) speak(synth, answer, wrap);
                            });
                        },
                        () => { mic.classList.add('is-listening'); },
                        () => { mic.classList.remove('is-listening'); }
                    );
                });
            }
        };

        const obs = new MutationObserver(() => {
            const wrap = results.querySelector('.dccgg-ai-prompt');
            if (wrap) decorate(wrap);
        });
        obs.observe(results, { childList: true, subtree: true });
    }
    function recordOnce(SR, onInterim, onFinal, onStart, onStop) {
        const r = new SR();
        r.interimResults = true;
        r.continuous = false;
        r.lang = (navigator.language || 'en-US');
        let finalText = '';
        r.onresult = (ev) => {
            let interim = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                const res = ev.results[i];
                if (res.isFinal) { finalText += res[0].transcript; }
                else             { interim   += res[0].transcript; }
            }
            if (interim) onInterim(interim);
        };
        r.onend   = () => { onStop && onStop(); onFinal((finalText || '').trim()); };
        r.onerror = () => { onStop && onStop(); };
        try {
            r.start();
            onStart && onStart();
        } catch (_) { onStop && onStop(); }
        return r;
    }
    function speak(synth, text, wrap) {
        try { synth.cancel(); } catch (_) {}
        const u = new SpeechSynthesisUtterance(text);
        const voices = synth.getVoices ? synth.getVoices() : [];
        if (voices && voices.length) {
            const lang = (navigator.language || 'en-US').split('-')[0];
            const match = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(lang));
            if (match) u.voice = match;
        }
        u.rate = 1.0;
        u.pitch = 1.0;
        // Add a small pause button next to the answer.
        const answer = wrap && wrap.querySelector('.dccgg-ai-answer');
        let pauseBtn = null;
        if (answer) {
            pauseBtn = document.createElement('button');
            pauseBtn.type = 'button';
            pauseBtn.className = 'dccgg-ai-speak';
            pauseBtn.innerHTML = '<i class="fas fa-volume-up" aria-hidden="true"></i>';
            pauseBtn.title = 'Stop reading';
            pauseBtn.addEventListener('click', () => { try { synth.cancel(); } catch (_) {} pauseBtn.remove(); });
            answer.appendChild(pauseBtn);
        }
        u.onend = () => { if (pauseBtn) pauseBtn.remove(); };
        synth.speak(u);
    }

    // -- Emergency mode (v0.9) --------------------------------------------
    // SOS floating button → openDetail(emergencyKey). NOAA banner fetches
    // active alerts for the cottage lat/lng from the proxy endpoint.
    function wireEmergency(root, config) {
        const em = config.emergency || {};
        if (!em.key) return;

        if (em.fab) {
            const sos = root.querySelector('.dccgg-sos-fab');
            if (sos) {
                sos.hidden = false;
                sos.addEventListener('click', () => {
                    hapticPulse(root, 30);
                    openDetail(root, em.key);
                });
            }
        }

        if (em.noaaBanner && config.ajaxUrl) {
            const banner = root.querySelector('.dccgg-noaa-banner');
            if (!banner) return;
            const params = new URLSearchParams({
                action: 'dccgg_noaa_alerts',
                nonce:  config.nonce,
                lat:    String(config.cottageLat || 0),
                lng:    String(config.cottageLng || 0),
            });
            if (/[?&]dccgg-fake-alert=1/.test(window.location.search)) params.set('fake', '1');
            fetch(config.ajaxUrl + '?' + params.toString(), { credentials: 'same-origin' })
                .then(r => r.json())
                .then(json => {
                    if (!json || !json.success) return;
                    const alerts = (json.data && json.data.alerts) || [];
                    if (!alerts.length) return;
                    const top = alerts[0];
                    const prefix = (em.strings && em.strings.bannerPrefix) || '';
                    const text   = banner.querySelector('.dccgg-noaa-text');
                    const link   = banner.querySelector('.dccgg-noaa-link');
                    if (text) text.textContent = (prefix ? prefix + ' ' : '') + (top.headline || top.event || '');
                    if (link && top.url) {
                        link.href = top.url;
                        link.textContent = (em.strings && em.strings.bannerMore) || 'More info';
                        link.hidden = false;
                    }
                    banner.hidden = false;
                })
                .catch(() => {});
        }
    }

    // -- Checkout review prompt (v0.9) ------------------------------------
    function reviewStorageKey(widgetId) { return 'dccgg:review:' + widgetId + ':' + stayKey(); }
    function wireReview(root, config) {
        const rv = config.review || {};
        if (!rv.enabled) return;

        // Optional reset hook for testing.
        if (/[?&]dccgg-reset-review=1/.test(window.location.search)) {
            try { localStorage.removeItem(reviewStorageKey(getWidgetId(root))); } catch (_) {}
        }

        const STR = rv.strings || {};
        const URLS = rv.urls || {};
        const platforms = [
            { key: 'airbnb', url: URLS.airbnb, label: STR.copyAirbnb || 'Copy & open Airbnb' },
            { key: 'vrbo',   url: URLS.vrbo,   label: STR.copyVrbo   || 'Copy & open Vrbo' },
            { key: 'google', url: URLS.google, label: STR.copyGoogle || 'Copy & open Google' },
        ].filter(p => p.url);

        const prompts = root.querySelectorAll('.dccgg-review-prompt');
        prompts.forEach(prompt => {
            const choice = prompt.querySelector('.dccgg-review-choice');
            const panel  = prompt.querySelector('.dccgg-review-panel');
            const thanks = prompt.querySelector('.dccgg-review-thanks');
            if (!choice || !panel || !thanks) return;

            // Collapsed state when the guest has already responded.
            let acted = false;
            try { acted = localStorage.getItem(reviewStorageKey(getWidgetId(root))) === '1'; } catch (_) {}
            if (acted) {
                choice.hidden = true;
                thanks.hidden = false;
                thanks.textContent = STR.thanks || 'Thanks for the feedback!';
                return;
            }

            const markActed = () => {
                try { localStorage.setItem(reviewStorageKey(getWidgetId(root)), '1'); } catch (_) {}
            };

            const yes = prompt.querySelector('.dccgg-review-yes');
            const no  = prompt.querySelector('.dccgg-review-no');

            yes.addEventListener('click', () => {
                choice.hidden = true;
                panel.hidden = false;
                // Build panel content if not already there.
                if (!panel.dataset.built) {
                    panel.dataset.built = '1';
                    const help = document.createElement('p');
                    help.className = 'dccgg-review-help';
                    help.textContent = STR.help || '';
                    if (STR.help) panel.appendChild(help);

                    const ta = document.createElement('textarea');
                    ta.className = 'dccgg-review-textarea';
                    ta.rows = 6;
                    ta.value = interpolateReview(rv.template || '');
                    panel.appendChild(ta);

                    const row = document.createElement('div');
                    row.className = 'dccgg-review-platforms';
                    platforms.forEach(p => {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'dccgg-review-platform dccgg-review-platform--' + p.key;
                        btn.textContent = p.label;
                        btn.addEventListener('click', () => {
                            copyText(ta.value).then(() => {
                                showPdfTip(STR.copied || 'Copied!');
                                window.open(p.url, '_blank', 'noopener');
                                markActed();
                            }).catch(() => {
                                // Still open the URL even if clipboard failed.
                                window.open(p.url, '_blank', 'noopener');
                                markActed();
                            });
                        });
                        row.appendChild(btn);
                    });
                    if (!platforms.length) {
                        const empty = document.createElement('p');
                        empty.className = 'dccgg-review-help';
                        empty.textContent = '(No review platforms configured.)';
                        panel.appendChild(empty);
                    } else {
                        panel.appendChild(row);
                    }
                }
            });

            no.addEventListener('click', () => {
                markActed();
                choice.hidden = true;
                thanks.hidden = false;
                thanks.textContent = STR.thanks || 'Thanks for the feedback!';
                // Route into the report dialog if available; otherwise just collapse.
                const sectionTitle = prompt.dataset.reviewSection || '';
                if (config.report && config.report.enabled) {
                    // Inject a transient button that piggybacks on the
                    // wireReportProblem click delegate — saves us from
                    // exposing its open() function publicly.
                    const tmp = document.createElement('button');
                    tmp.className = 'dccgg-more-report';
                    tmp.style.display = 'none';
                    tmp.dataset.reportSection = '[checkout feedback] ' + sectionTitle;
                    root.appendChild(tmp);
                    tmp.click();
                    setTimeout(() => tmp.remove(), 0);
                }
            });
        });
    }
    function getWidgetId(root) {
        // Each Elementor widget gets a data-id attribute on the enclosing
        // .elementor-widget element; fall back to the root's class hash.
        const wrap = root.closest('[data-id]');
        return (wrap && wrap.dataset.id) || 'w';
    }
    function interpolateReview(template) {
        if (!template) return '';
        let guestName = '';
        const stay = stayKey();
        if (stay && stay !== 'default') {
            // Heuristic: ?stay=jane-2026-06 → "Jane".
            const m = stay.match(/^([a-z]+)/i);
            if (m) guestName = m[1].charAt(0).toUpperCase() + m[1].slice(1);
        }
        return template
            .replace(/\{guest_name\}/g, guestName)
            .replace(/\{stay_key\}/g, stay);
    }

    // -- Checklist (v0.7) -------------------------------------------------
    function stayKey() {
        const p = new URLSearchParams(window.location.search);
        return p.get('stay') || 'default';
    }
    function checkStorageKey(widgetId) { return 'dccgg:check:' + widgetId + ':' + stayKey(); }
    function loadChecks(widgetId) {
        try { return JSON.parse(localStorage.getItem(checkStorageKey(widgetId)) || '{}'); }
        catch (_) { return {}; }
    }
    function saveChecks(widgetId, state) {
        try { localStorage.setItem(checkStorageKey(widgetId), JSON.stringify(state)); } catch (_) {}
    }
    function wireChecklists(root) {
        const widgetId = root.id || (root.closest('[data-id]') && root.closest('[data-id]').dataset.id) || 'global';
        const state = loadChecks(widgetId);

        // Apply persisted state on load.
        root.querySelectorAll('.dccgg-item[data-checkable="1"]').forEach(item => {
            const key = item.dataset.checkKey;
            if (state[key]) {
                item.dataset.checked = '1';
                const btn = item.querySelector('.dccgg-item-check');
                if (btn) btn.setAttribute('aria-pressed', 'true');
            }
        });

        // Click handler.
        root.addEventListener('click', (e) => {
            const btn = e.target.closest('.dccgg-item-check');
            if (!btn) return;
            const item = btn.closest('.dccgg-item');
            if (!item) return;
            const key  = item.dataset.checkKey;
            const next = item.dataset.checked !== '1';
            item.dataset.checked = next ? '1' : '0';
            btn.setAttribute('aria-pressed', next ? 'true' : 'false');
            state[key] = next;
            saveChecks(widgetId, state);
            updateChecklistProgress(root, item.closest('.dccgg-detail'));
        });

        // Reset.
        root.addEventListener('click', (e) => {
            const reset = e.target.closest('.dccgg-checklist-reset');
            if (!reset) return;
            const detail = reset.closest('.dccgg-detail');
            detail.querySelectorAll('.dccgg-item[data-checkable="1"]').forEach(item => {
                item.dataset.checked = '0';
                const btn = item.querySelector('.dccgg-item-check');
                if (btn) btn.setAttribute('aria-pressed', 'false');
                delete state[item.dataset.checkKey];
            });
            saveChecks(widgetId, state);
            updateChecklistProgress(root, detail);
        });

        // Initial progress paint for each detail.
        root.querySelectorAll('.dccgg-detail').forEach(d => updateChecklistProgress(root, d));
    }
    function updateChecklistProgress(root, detail) {
        if (!detail) return;
        const bar = detail.querySelector('.dccgg-checklist-progress');
        if (!bar) return;
        const items = detail.querySelectorAll('.dccgg-item[data-checkable="1"]');
        const done  = detail.querySelectorAll('.dccgg-item[data-checkable="1"][data-checked="1"]').length;
        const total = items.length;
        const pct   = total === 0 ? 0 : Math.round((done / total) * 100);
        const fill  = bar.querySelector('.dccgg-checklist-progress-fill');
        if (fill) fill.style.setProperty('--p', pct + '%');
        const label = bar.querySelector('.dccgg-checklist-progress-label');
        if (label) label.textContent = done + ' / ' + total;
        if (total > 0 && done === total && !bar.dataset.celebrated) {
            bar.dataset.celebrated = '1';
            if (typeof spawnConfetti === 'function') spawnConfetti(bar);
        } else if (done < total) {
            delete bar.dataset.celebrated;
        }
    }

    // -- Parallax background (v0.7) ---------------------------------------
    function wireParallax(root) {
        if (REDUCED_MOTION) return;
        const bgs = root.querySelectorAll('.dccgg-parallax-bg');
        if (!bgs.length) return;
        let raf = 0;
        const update = () => {
            raf = 0;
            bgs.forEach(bg => {
                const detail = bg.closest('.dccgg-detail');
                if (!detail || detail.hidden) return;
                const rect = detail.getBoundingClientRect();
                const offset = Math.max(-200, Math.min(200, rect.top * -0.25));
                bg.style.transform = 'translate3d(0,' + offset.toFixed(1) + 'px,0)';
            });
        };
        const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
        window.addEventListener('scroll', onScroll, { passive: true });
        // Also recompute when a detail opens.
        const obs = new MutationObserver(onScroll);
        root.querySelectorAll('.dccgg-detail--parallax').forEach(d => obs.observe(d, { attributes: true, attributeFilter: ['hidden'] }));
        update();
    }

    // -- Conditions side-card weather (v0.7) ------------------------------
    function wireConditions(root, config) {
        const cards = root.querySelectorAll('.dccgg-conditions');
        if (!cards.length) return;
        const lat = config.cottageLat;
        const lng = config.cottageLng;
        if (!lat || !lng || !config.ajaxUrl) return;
        const url = config.ajaxUrl + '?action=dccgg_weather&nonce=' + encodeURIComponent(config.nonce) + '&lat=' + lat + '&lng=' + lng;
        fetch(url, { credentials: 'same-origin' })
            .then(r => r.json())
            .then(json => {
                if (!json.success) return;
                const d = json.data;
                if (!d || !d.current || !d.daily) return;
                const code = d.current.weather_code;
                const emoji = weatherEmoji(code, d.current.is_day);
                const desc  = weatherText(code);
                const temp  = Math.round(d.current.temperature_2m);
                cards.forEach(card => {
                    const wxRow = card.querySelector('.dccgg-cond-weather');
                    if (wxRow) {
                        wxRow.querySelector('.dccgg-cond-ico').textContent = emoji;
                        wxRow.querySelector('.dccgg-cond-v').textContent  = temp + '°F · ' + desc;
                    }
                    const fcRow = card.querySelector('.dccgg-cond-forecast');
                    if (fcRow && d.daily.temperature_2m_max && d.daily.temperature_2m_max.length > 1) {
                        const hi   = Math.round(d.daily.temperature_2m_max[1]);
                        const lo   = Math.round(d.daily.temperature_2m_min[1]);
                        const pop  = d.daily.precipitation_probability_max ? d.daily.precipitation_probability_max[1] : 0;
                        const fcc  = d.daily.weather_code ? d.daily.weather_code[1] : 0;
                        fcRow.hidden = false;
                        fcRow.querySelector('.dccgg-cond-ico').textContent = weatherEmoji(fcc, 1);
                        fcRow.querySelector('.dccgg-cond-v').textContent  = hi + '° / ' + lo + '° · ' + pop + '% rain';
                    }
                });
            })
            .catch(() => {});
    }
    function weatherEmoji(code, isDay) {
        if (code === 0)            return isDay ? '☀️' : '🌙';
        if (code <= 2)             return isDay ? '⛅' : '☁️';
        if (code === 3)            return '☁️';
        if (code >= 45 && code <= 48) return '🌫️';
        if (code >= 51 && code <= 67) return '🌦️';
        if (code >= 71 && code <= 77) return '❄️';
        if (code >= 80 && code <= 82) return '🌧️';
        if (code >= 95)            return '⛈️';
        return '☁️';
    }
    function weatherText(code) {
        const map = {
            0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Fog',
            51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
            61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
            71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
            80: 'Showers', 81: 'Heavy showers', 82: 'Violent showers',
            95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Severe thunderstorm',
        };
        return map[code] || 'Mixed';
    }

    // -- Gallery strip click → lightbox with hotspots (v0.7) --------------
    function wireGalleryStrip(root) {
        root.addEventListener('click', (e) => {
            const thumb = e.target.closest('.dccgg-gallery-thumb');
            if (!thumb) return;
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
            openGalleryLightbox(images, idx);
        });
    }
    function openGalleryLightbox(images, startIdx) {
        if (!images.length) return;
        let dialog = document.querySelector('.dccgg-gallery-lightbox');
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.className = 'dccgg-lightbox dccgg-gallery-lightbox';
            dialog.innerHTML = `
                <button type="button" class="dccgg-lightbox-close" aria-label="Close">×</button>
                <button type="button" class="dccgg-lightbox-prev" aria-label="Previous">‹</button>
                <button type="button" class="dccgg-lightbox-next" aria-label="Next">›</button>
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

    // -- AI fallback search (v0.7) ----------------------------------------
    function wireAiSearch(root, config) {
        if (!config.aiSearch || !config.aiSearch.enabled) return;
        const searchInput = root.querySelector('.dccgg-search-input');
        const results     = root.querySelector('.dccgg-search-results');
        if (!searchInput || !results) return;

        // Hook into the existing search render: after the empty-state is
        // rendered, append an "Ask anything" prompt.
        const obs = new MutationObserver(() => {
            if (results.querySelector('.dccgg-ai-prompt')) return;
            const empty = results.querySelector('.dccgg-search-no-results');
            if (!empty) return;
            const q = searchInput.value.trim();
            if (q.length < 3) return;
            const wrap = document.createElement('div');
            wrap.className = 'dccgg-ai-prompt';
            wrap.innerHTML = `
                <button type="button" class="dccgg-ai-button">
                    <i class="fas fa-sparkles" aria-hidden="true"></i>
                    <span class="dccgg-ai-label"></span>
                </button>
                <div class="dccgg-ai-privacy"></div>
                <div class="dccgg-ai-answer" hidden></div>
            `;
            wrap.querySelector('.dccgg-ai-label').textContent = config.aiSearch.label;
            wrap.querySelector('.dccgg-ai-privacy').textContent = config.aiSearch.privacy || '';
            wrap.querySelector('.dccgg-ai-button').addEventListener('click', () => askAi(root, config, q, wrap));
            results.appendChild(wrap);
        });
        obs.observe(results, { childList: true, subtree: true });
    }
    function askAi(root, config, question, wrap, onAnswer) {
        const btn    = wrap.querySelector('.dccgg-ai-button');
        const answer = wrap.querySelector('.dccgg-ai-answer');
        btn.disabled = true;
        answer.hidden = false;
        answer.dataset.state = 'loading';
        answer.textContent = config.aiSearch.thinking;
        const context = buildAiContext(root);
        const body = new URLSearchParams();
        body.set('action', 'dccgg_ai_query');
        body.set('nonce', config.nonce);
        body.set('question', question);
        body.set('context', context);
        fetch(config.ajaxUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        }).then(r => r.json()).then(json => {
            delete answer.dataset.state;
            btn.disabled = false;
            if (json && json.success && json.data && json.data.answer) {
                answer.textContent = json.data.answer;
                if (typeof onAnswer === 'function') onAnswer(json.data.answer);
            } else {
                answer.textContent = (json && json.data && json.data.message) || config.aiSearch.error;
            }
        }).catch(() => {
            delete answer.dataset.state;
            btn.disabled = false;
            answer.textContent = config.aiSearch.error;
        });
    }
    function buildAiContext(root) {
        // Stitch together section titles + item titles + item plain text.
        const parts = [];
        root.querySelectorAll('.dccgg-detail').forEach(detail => {
            const title = (detail.querySelector('.dccgg-detail-title span') || {}).textContent || detail.dataset.key || '';
            parts.push('## ' + title.trim());
            detail.querySelectorAll('.dccgg-item').forEach(item => {
                const itTitle = (item.querySelector('.dccgg-item-title span:last-of-type') || {}).textContent || '';
                const body    = (item.querySelector('.dccgg-item-body') || {}).textContent || '';
                parts.push('### ' + itTitle.trim() + '\n' + body.trim());
            });
        });
        return parts.join('\n\n').slice(0, 18000);
    }

    // -- Click-to-play video posters (v0.6) -------------------------------
    function wireVideoPosters(root) {
        root.querySelectorAll('.dccgg-video-poster').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const embed = btn.dataset.embed;
                if (!embed) return;
                const iframe = document.createElement('iframe');
                iframe.className = 'dccgg-media';
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

    // -- Sticky shrinking detail header (v0.5) ----------------------------
    function wireShrinkHeader(root) {
        if (!('IntersectionObserver' in window)) return;
        // v0.9.5: in stage-modal mode the stage itself is the scroll
        // container, so observe relative to it; otherwise observe the
        // viewport as before.
        const stage = root.querySelector('.dccgg-stage');
        const useStageRoot = !!stage && shouldUseDetailModal(root);
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
            }, { threshold: [0], rootMargin: '0px', root: useStageRoot ? stage : null });
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
            // Also tear down any open detail modal (portal, scroll-lock, …)
            // so closing the FAB leaves a clean slate.
            closeDetail(root);
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

    // v0.9.5: in stage-reveal mode (not split-pane), the open detail is a
    // viewport-centered modal portaled to <body>. Split-pane / accordion /
    // flip-card keep the original inline behavior because their tile content
    // is supposed to live in place.
    function shouldUseDetailModal(root) {
        const config = (root.__dccgg && root.__dccgg.config) || {};
        if ((config.revealMode || 'stage') !== 'stage') return false;
        const widgetEl = root.closest('.elementor-widget');
        if (widgetEl && widgetEl.classList.contains('dccgg-layout-split-pane')) return false;
        return true;
    }

    // v0.9.7: openDetail accepts an optional onShown(activeDetail) callback
    // fired after the modal has actually painted in its open state. The
    // search-click handler uses this so the deep-link highlight runs
    // against the portaled stage (the stage is moved off `root` into
    // <body>, so root.querySelector can't find the detail anymore).
    function openDetail(root, key, onShown) {
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
        // clear any stale search highlights from a prior visit. v0.6: also
        // strip .is-shrunk from every detail so a previously-scrolled
        // detail's shrunk header doesn't flash on reopen.
        details.forEach(d => d.classList.remove('is-shrunk'));
        if (activeDetail) {
            const bar = activeDetail.querySelector('.dccgg-progress-bar');
            if (bar) bar.style.width = '0%';
            if (typeof clearHighlights === 'function') clearHighlights(activeDetail);
        }

        if (shouldUseDetailModal(root)) {
            showDetailModal(root);
        } else if (activeDetail && typeof activeDetail.scrollIntoView === 'function') {
            activeDetail.scrollIntoView({ block: 'start', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
        } else {
            const top = root.getBoundingClientRect().top + window.scrollY - 20;
            window.scrollTo({ top: Math.max(0, top), behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
        }

        if (typeof onShown === 'function') {
            // Wait for the modal's open transition (250ms in CSS) to settle
            // so the caller's DOM lookup hits the post-portal layout. For
            // non-modal modes (accordion, split-pane) one rAF is enough.
            const delay = shouldUseDetailModal(root) ? 300 : 0;
            const stage = (root.__dccggModal && root.__dccggModal.stage) || root;
            const fresh = stage.querySelector
                ? stage.querySelector('.dccgg-detail[data-key="' + cssEsc(key) + '"]:not([hidden])')
                : activeDetail;
            setTimeout(() => { try { onShown(fresh || activeDetail); } catch (_) {} }, delay);
        }

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

    function closeDetail(root) {
        if (!root.classList.contains('is-detail')) return;
        const wasModal = !!root.__dccggModal;
        withViewTransition(() => root.classList.remove('is-detail'));
        if (wasModal) hideDetailModal(root);
        setTimeout(() => {
            root.querySelectorAll('.dccgg-detail').forEach(d => {
                d.hidden = true;
                d.classList.remove('is-shrunk');
            });
        }, 400);
    }

    // -- Detail-modal portal + scroll-lock + ESC + backdrop -----------------
    // Ancestors of the widget often have transform/overflow that breaks
    // position:fixed containment. Lifting the stage + overlay to <body>
    // sidesteps that. Markers preserve the original DOM position so the
    // elements snap back on close (so future opens find them inside root).

    // v0.9.7: measure any sticky / fixed theme header pinned to the top of
    // the viewport so the detail modal can sit flush below it instead of
    // overflowing past the bottom edge. Curated candidate list keeps the
    // scan cheap; sanity bounds reject huge / hidden / off-screen elements.
    function detectStickyTopOffset() {
        let max = 0;
        const candidates = document.querySelectorAll(
            'header, nav, [role="banner"], [class*="sticky"], [class*="fixed-top"], ' +
            '.ast-primary-header-bar, .site-header, .elementor-sticky--active'
        );
        for (const el of candidates) {
            if (el.closest && el.closest('.dccgg-root')) continue;
            const cs = getComputedStyle(el);
            if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            const r = el.getBoundingClientRect();
            if (r.top > 5 || r.bottom <= 0) continue;
            if (r.height < 1 || r.height > 200) continue;
            if (r.bottom > max) max = r.bottom;
        }
        return Math.max(0, Math.round(max));
    }

    function showDetailModal(root) {
        const stage = root.querySelector('.dccgg-stage')
            || (root.__dccggModal && root.__dccggModal.stage);
        if (!stage) return;
        let state = root.__dccggModal;
        if (state && state.closeTimer) {
            // Re-opened during the closing fade-out — abort teardown and
            // re-use the already-portaled nodes.
            clearTimeout(state.closeTimer);
            state.closeTimer = null;
        } else if (!state) {
            const overlay = root.querySelector('.dccgg-detail-overlay');
            if (!overlay) return;
            const stageMarker = document.createComment('dccgg-stage-anchor');
            const overlayMarker = document.createComment('dccgg-detail-overlay-anchor');
            stage.parentNode.insertBefore(stageMarker, stage);
            overlay.parentNode.insertBefore(overlayMarker, overlay);
            document.body.appendChild(overlay);
            document.body.appendChild(stage);
            state = root.__dccggModal = {
                stage: stage,
                overlay: overlay,
                stageMarker: stageMarker,
                overlayMarker: overlayMarker,
                lastTrigger: null,
                onKey: null,
                onOverlayClick: null,
                closeTimer: null
            };
        }
        state.lastTrigger = document.activeElement;
        state.overlay.hidden = false;
        // v0.9.7: stamp the sticky-header offset so the modal's top edge
        // sits just below the theme header. Re-measure on resize so a
        // hide-on-scroll header that changes height still aligns.
        const stampOffset = () => {
            const off = detectStickyTopOffset();
            state.stage.style.setProperty('--dccgg-detail-top-offset', off + 'px');
            state.overlay.style.setProperty('--dccgg-detail-top-offset', off + 'px');
        };
        stampOffset();
        if (state.onResize) window.removeEventListener('resize', state.onResize);
        let resizeT = null;
        state.onResize = () => {
            clearTimeout(resizeT);
            resizeT = setTimeout(stampOffset, 80);
        };
        window.addEventListener('resize', state.onResize);
        document.documentElement.classList.add('dccgg-detail-open');
        document.body.classList.add('dccgg-detail-open');
        // Force a layout flush so the closed-state CSS commits before we
        // add .is-modal-open in the next frame — without this, the browser
        // collapses the closed→open paints into a single tick and the
        // transition doesn't animate.
        void state.stage.offsetWidth;
        requestAnimationFrame(() => {
            state.stage.classList.add('is-modal-open');
            const focusTarget = state.stage.querySelector('.dccgg-back')
                || state.stage.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
            if (focusTarget && typeof focusTarget.focus === 'function') {
                try { focusTarget.focus({ preventScroll: true }); } catch (_) { focusTarget.focus(); }
            }
        });
        // Re-bind handlers in case we're reopening during a pending close.
        if (state.onKey) document.removeEventListener('keydown', state.onKey);
        if (state.onOverlayClick && state.overlay) {
            state.overlay.removeEventListener('click', state.onOverlayClick);
        }
        state.onKey = (e) => {
            if (e.key !== 'Escape') return;
            // Don't steal Escape from QR / lightbox / report dialogs that
            // open on top of the detail modal.
            if (document.querySelector('.dccgg-qr-dialog:not([hidden]), .dccgg-lightbox[open], .dccgg-report-dialog[open]')) return;
            e.preventDefault();
            closeDetail(root);
        };
        state.onOverlayClick = () => closeDetail(root);
        document.addEventListener('keydown', state.onKey);
        state.overlay.addEventListener('click', state.onOverlayClick);
    }

    function hideDetailModal(root) {
        const state = root.__dccggModal;
        if (!state) return;
        if (state.onKey) document.removeEventListener('keydown', state.onKey);
        if (state.onOverlayClick && state.overlay) {
            state.overlay.removeEventListener('click', state.onOverlayClick);
        }
        if (state.onResize) {
            window.removeEventListener('resize', state.onResize);
            state.onResize = null;
        }
        state.onKey = null;
        state.onOverlayClick = null;
        // v0.9.7: trigger the close transition (opacity → 0, transform back
        // to scale 0.96 / translateY(100%)) by removing the open class.
        if (state.stage) state.stage.classList.remove('is-modal-open');
        state.closeTimer = setTimeout(() => {
            document.documentElement.classList.remove('dccgg-detail-open');
            document.body.classList.remove('dccgg-detail-open');
            if (state.overlay) state.overlay.hidden = true;
            if (state.stageMarker && state.stageMarker.parentNode) {
                state.stageMarker.parentNode.insertBefore(state.stage, state.stageMarker);
                state.stageMarker.parentNode.removeChild(state.stageMarker);
            }
            if (state.overlayMarker && state.overlayMarker.parentNode) {
                state.overlayMarker.parentNode.insertBefore(state.overlay, state.overlayMarker);
                state.overlayMarker.parentNode.removeChild(state.overlayMarker);
            }
            const lastTrigger = state.lastTrigger;
            root.__dccggModal = null;
            if (lastTrigger && typeof lastTrigger.focus === 'function') {
                try { lastTrigger.focus({ preventScroll: true }); } catch (_) {
                    try { lastTrigger.focus(); } catch (_) {}
                }
            }
        }, 280);
    }

    function wireBack(root, config) {
        root.querySelectorAll('.dccgg-back').forEach(btn => {
            btn.addEventListener('click', () => closeDetail(root));
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
                caption.textContent = btn.dataset.qrCaption || value;
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

    // -- Search normalization (v0.9.6) ------------------------------------
    // Lowercase, NFD-decompose then strip combining marks (accent fold),
    // collapse runs of non-letter/non-digit to a single space. So
    // "Wi-Fi" -> "wi fi", "Café" -> "cafe", "check-in" -> "check in".
    function normalizeForSearch(s) {
        return String(s)
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim();
    }
    function tokenizeForSearch(s) {
        const n = normalizeForSearch(s);
        return n ? n.split(' ') : [];
    }
    // Damerau-free Levenshtein, 2-row DP. Used for typo tolerance.
    function levenshtein(a, b) {
        if (a === b) return 0;
        const m = a.length, n = b.length;
        if (!m) return n;
        if (!n) return m;
        let prev = new Array(n + 1);
        for (let j = 0; j <= n; j++) prev[j] = j;
        for (let i = 1; i <= m; i++) {
            const curr = [i];
            for (let j = 1; j <= n; j++) {
                const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
                curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            }
            prev = curr;
        }
        return prev[n];
    }
    // Returns {toks, kind:'sub'|'concat'|'fuzz'} on match, null otherwise.
    // Three match paths, in priority order:
    //   1. 'sub'    — some haystack token contains q as substring.
    //   2. 'concat' — q appears as substring in the no-space concat of all
    //                 haystack tokens. Handles bidirectional cases like
    //                 query "wifi" → "Wi-Fi" (haystack toks ['wi','fi'],
    //                 concat 'wifi') and query "wi-fi" → "wifi" (q toks
    //                 ['wi','fi'] → caller passes individual 'wi' / 'fi').
    //   3. 'fuzz'   — Levenshtein ≤ tol against any haystack token.
    function searchTokenMatches(q, hayToks, hayConcat, hayPos) {
        for (const h of hayToks) {
            if (h.indexOf(q) !== -1) return { toks: [h], kind: 'sub' };
        }
        if (hayConcat) {
            const idx = hayConcat.indexOf(q);
            if (idx !== -1) {
                const spanned = new Set();
                const end = Math.min(idx + q.length, hayPos.length);
                for (let i = idx; i < end; i++) spanned.add(hayPos[i]);
                return { toks: Array.from(spanned), kind: 'concat' };
            }
        }
        const tol = q.length <= 2 ? 0 : q.length <= 5 ? 1 : 2;
        if (!tol) return null;
        for (const h of hayToks) {
            if (Math.abs(h.length - q.length) > tol) continue;
            if (levenshtein(q, h) <= tol) return { toks: [h], kind: 'fuzz' };
        }
        return null;
    }

    // -- Search (per-widget) ----------------------------------------------
    function wireSearch(root, config) {
        if (!config.enableSearch) return;
        const input = root.querySelector('.dccgg-search-input');
        const list  = root.querySelector('.dccgg-search-results');
        const live  = root.querySelector('[data-dccgg-results-count]');
        if (!input || !list) return;

        const index = Array.isArray(config.searchIndex) ? config.searchIndex : [];
        // v0.9.6: pre-normalize each index entry once so per-keystroke
        // matching is just two token loops + Levenshtein. Also build a
        // no-space concat of all tokens + a position-to-token map, used
        // by the concat-substring match path in searchTokenMatches().
        for (const e of index) {
            e._titleToks = tokenizeForSearch(e.title);
            e._textToks  = tokenizeForSearch(e.text);
            let tc = '', tp = [];
            for (const t of e._titleToks) for (let i = 0; i < t.length; i++) { tc += t[i]; tp.push(t); }
            let xc = '', xp = [];
            for (const t of e._textToks)  for (let i = 0; i < t.length; i++) { xc += t[i]; xp.push(t); }
            e._titleConcat = tc; e._titlePos = tp;
            e._textConcat  = xc; e._textPos  = xp;
        }

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
            // v0.9.6: punctuation/space-insensitive + accent-folded +
            // multi-word AND + typo-tolerant matching.
            const qToks = tokenizeForSearch(q);
            if (!qToks.length || qToks.join('').length < 2) { hide(); return; }

            const hits = [];
            for (const entry of index) {
                let titleMatches = 0, textMatches = 0, subMatches = 0;
                const matched = new Set();
                let allMatched = true;
                for (const qt of qToks) {
                    const hitTitle = searchTokenMatches(qt, entry._titleToks, entry._titleConcat, entry._titlePos);
                    const hitText  = hitTitle ? null : searchTokenMatches(qt, entry._textToks, entry._textConcat, entry._textPos);
                    const hit = hitTitle || hitText;
                    if (!hit) { allMatched = false; break; }
                    if (hitTitle) titleMatches++; else textMatches++;
                    if (hit.kind !== 'fuzz') subMatches++;
                    for (const t of hit.toks) matched.add(t);
                }
                if (!allMatched) continue;
                const score = titleMatches * 10 + textMatches * 3 + subMatches * 5;
                hits.push({ entry, score, matched: Array.from(matched) });
            }
            if (!hits.length) {
                list.innerHTML = '<p class="dccgg-search-no-results">' +
                    escHtml((config.strings && config.strings.noResults) || 'No matches.') + '</p>';
                list.hidden = false;
                if (live) live.textContent = '0 results';
                return;
            }
            hits.sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length);
            const top = hits.slice(0, 12);

            list.innerHTML = top.map(h => {
                const e = h.entry;
                const markRe = h.matched.length
                    ? new RegExp('(' + h.matched.map(escRegex).join('|') + ')', 'gi')
                    : null;
                const titleHtml = markRe
                    ? escHtml(e.title).replace(markRe, m => '<mark>' + m + '</mark>')
                    : escHtml(e.title);
                const sectionLabel = escHtml(sectionTitleFor(root, e.section));
                const matchedAttr = escHtml(JSON.stringify(h.matched));
                return '<button type="button" class="dccgg-search-result" data-section="' + escHtml(e.section) + '" data-item-idx="' + e.item_idx + '" data-matched-toks="' + matchedAttr + '">' +
                    '<span class="dccgg-search-result-section">' + sectionLabel + '</span>' +
                    titleHtml +
                '</button>';
            }).join('');
            list.hidden = false;
            if (live) live.textContent = top.length + ' results';

            list.querySelectorAll('.dccgg-search-result').forEach(b => {
                b.addEventListener('click', () => {
                    const sec = b.dataset.section;
                    const itemIdx = parseInt(b.dataset.itemIdx || '0', 10);
                    let toks = [];
                    try { toks = JSON.parse(b.dataset.matchedToks || '[]'); } catch (_) {}
                    const typed = input.value.trim();
                    hide();
                    input.value = '';
                    // v0.9.7: pass an onShown callback so the highlight
                    // runs against the modal-portaled .dccgg-detail (after
                    // showDetailModal moves the stage off `root` into
                    // <body>). Without this, on desktop the highlight
                    // lookup found null because root no longer contains
                    // the detail — and the modal painted in a stale layout
                    // (the cause of the off-center / cut-off bug).
                    openDetail(root, sec, (detail) => {
                        if (detail) highlightQuery(detail, toks.length ? toks : typed, itemIdx);
                    });
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
        if (!detail || !query) return;

        // v0.9.6: query may be a string (legacy deep-link) or an array
        // of already-matched haystack tokens (from the search results).
        const escapeRe = (s) => String(s).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        let pattern;
        if (Array.isArray(query)) {
            const toks = query.filter(t => t && t.length);
            if (!toks.length) return;
            pattern = toks.map(escapeRe).join('|');
        } else {
            if (query.length < 2) return;
            pattern = escapeRe(query);
        }

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
        // v0.5 fix: separate non-global probe regex for the walker gate.
        // The replacement regex below stays global. v0.4 used the same
        // /.../gi for both, which silently advanced lastIndex between
        // acceptNode calls and rejected nodes whose match was below the
        // currently-set lastIndex.
        const probe = new RegExp(pattern, 'i');
        const re = new RegExp('(' + pattern + ')', 'gi');
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
        // Align with the bottom-sheet breakpoint in widget.css (v0.9.5).
        // The server-rendered .dccgg-detail-overlay handles tap-to-dismiss;
        // this function only owns the swipe-down gesture.
        const isMobileSheet = () => window.matchMedia('(max-width: 600px)').matches;

        let startY = 0;
        let currentY = 0;
        let dragging = false;

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
            if (dismiss) closeDetail(root);
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
            // v0.9.5: in modal mode the stage itself is the scrollable
            // container (overflow-y: auto), so progress tracks stage scroll;
            // outside the modal, fall back to viewport-relative geometry.
            let pct;
            if (stage.scrollHeight > stage.clientHeight + 4) {
                const total = Math.max(1, stage.scrollHeight - stage.clientHeight);
                pct = (stage.scrollTop / total) * 100;
            } else {
                const r = detail.getBoundingClientRect();
                const vh = window.innerHeight;
                const total = Math.max(1, r.height - vh);
                const scrolled = Math.min(total, Math.max(0, -r.top));
                pct = (scrolled / total) * 100;
            }
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
        stage.addEventListener('scroll', onScroll, { passive: true });
        // Update once on entering detail
        const mo = new MutationObserver(update);
        mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    }

    // -- Welcome Pack + Export/Import editor hooks (v0.6) ------------------
    function wireWelcomePackEditor() {
        // Single delegated listener for all editor-panel buttons.
        document.addEventListener('click', (e) => {
            const pack = e.target.closest('[data-dccgg-welcome-pack]');
            if (pack) { e.preventDefault(); insertWelcomePack(pack); return; }
            const exp = e.target.closest('[data-dccgg-export]');
            if (exp)  { e.preventDefault(); exportGuide(exp); return; }
            const imp = e.target.closest('[data-dccgg-import]');
            if (imp)  { e.preventDefault(); importGuide(imp); return; }
        });
    }

    /** v0.9.4: server-backed Export. The editor-panel JS API broke in
     *  Elementor 4.x; we now POST the post ID to admin-ajax which reads
     *  _elementor_data, locates the dccgg_guide widget, and returns the
     *  scrubbed payload. JS turns it into a file download. */
    function editorPostId() {
        try {
            const fromUrl = new URLSearchParams(window.location.search).get('post');
            if (fromUrl) return parseInt(fromUrl, 10);
        } catch (_) {}
        return (window.dccggEditor && window.dccggEditor.postId) ? parseInt(window.dccggEditor.postId, 10) : 0;
    }

    function exportGuide(btn) {
        const cfg = window.dccggEditor || {};
        const postId = editorPostId();
        if (!postId || !cfg.ajaxUrl || !cfg.exportNonce) {
            window.alert('DCCGG: Export requires the Elementor editor (post ID + nonce missing).');
            return;
        }
        const body = new FormData();
        body.append('action',  'dccgg_export_guide');
        body.append('nonce',   cfg.exportNonce);
        body.append('post_id', String(postId));
        const orig = btn.textContent;
        btn.textContent = '…';
        btn.disabled = true;
        fetch(cfg.ajaxUrl, { method: 'POST', credentials: 'same-origin', body })
            .then(r => r.json())
            .then(res => {
                if (!res || !res.success) {
                    const msg = (res && res.data && res.data.message) ? res.data.message : 'Export failed.';
                    window.alert('DCCGG: ' + msg);
                    return;
                }
                const json = JSON.stringify(res.data, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href = url;
                a.download = 'guest-guide-export.json';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
                btn.textContent = '✓ Downloaded';
                setTimeout(() => { btn.textContent = orig; }, 1800);
            })
            .catch(err => {
                console.warn('DCCGG: Export request failed', err);
                window.alert('DCCGG: Export request failed — see browser console.');
            })
            .finally(() => { btn.disabled = false; setTimeout(() => { if (btn.textContent === '…') btn.textContent = orig; }, 100); });
    }

    function importGuide(btn) {
        const cfg = window.dccggEditor || {};
        const postId = editorPostId();
        if (!postId || !cfg.ajaxUrl || !cfg.importNonce) {
            window.alert('DCCGG: Import requires the Elementor editor (post ID + nonce missing).');
            return;
        }
        const json = window.prompt('Paste Guide JSON (exported via the Export button on another widget):', '');
        if (!json) return;
        let parsed;
        try { parsed = JSON.parse(json); } catch (_) {
            window.alert('DCCGG: Invalid JSON — could not parse the paste.');
            return;
        }
        if (!parsed || !Array.isArray(parsed.sections) || !Array.isArray(parsed.items)) {
            window.alert('DCCGG: Unrecognized schema — expected { sections: [...], items: [...] }.');
            return;
        }
        const replaceCheckbox = btn.parentNode && btn.parentNode.querySelector('[data-dccgg-import-replace]');
        const replace = !!(replaceCheckbox && replaceCheckbox.checked);

        const body = new FormData();
        body.append('action',  'dccgg_import_guide');
        body.append('nonce',   cfg.importNonce);
        body.append('post_id', String(postId));
        body.append('payload', JSON.stringify({ sections: parsed.sections, items: parsed.items }));
        if (replace) body.append('replace', '1');
        const orig = btn.textContent;
        btn.textContent = '…';
        btn.disabled = true;
        fetch(cfg.ajaxUrl, { method: 'POST', credentials: 'same-origin', body })
            .then(r => r.json())
            .then(res => {
                if (!res || !res.success) {
                    const msg = (res && res.data && res.data.message) ? res.data.message : 'Import failed.';
                    window.alert('DCCGG: ' + msg);
                    btn.textContent = orig;
                    return;
                }
                const d = res.data || {};
                btn.textContent = '✓ Imported ' + (d.imported_sections || 0) + ' sections, ' + (d.imported_items || 0) + ' items';
                window.alert('DCCGG: Imported ' + (d.imported_sections || 0) + ' sections and ' + (d.imported_items || 0) + ' items. Reload the editor to see the new content.');
                setTimeout(() => { btn.textContent = orig; }, 2500);
            })
            .catch(err => {
                console.warn('DCCGG: Import request failed', err);
                window.alert('DCCGG: Import request failed — see browser console.');
                btn.textContent = orig;
            })
            .finally(() => { btn.disabled = false; });
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
            // and a visible detail inside it. v0.9.5: the stage may be
            // portaled to <body> in modal mode, so fall back to the
            // captured reference on root.__dccggModal.
            const roots = document.querySelectorAll('.dccgg-root.is-detail');
            for (const r of roots) {
                const stage = r.querySelector('.dccgg-stage')
                    || (r.__dccggModal && r.__dccggModal.stage);
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
