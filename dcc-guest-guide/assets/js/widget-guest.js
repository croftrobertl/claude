/**
 * DCC Guest Guide — the guest-only bundle (v0.25.0).
 *
 * Four features the PUBLIC guide never renders, because apply_public_mode()
 * switches every one of them off before anything reads the settings:
 *
 *     the Front Desk form   wireReportProblem / sendReport
 *     the review prompt     wireReview
 *     the voice concierge   wireVoiceConcierge / recordOnce / speak
 *     the AI answer         askAi / reportSearchMiss
 *
 * Until v0.25.0 they were in the core bundle, so every prospect on /explore/
 * downloaded all of it and could not use any of it. This mirrors the CSS split
 * v0.22.0 made for the same reason, and the server decides in the same place:
 * Widget::render() asks for the guest assets on the branch that is NOT public
 * mode.
 *
 * THE CONTRACT WITH CORE, and it runs both ways:
 *
 *   core  -> window.DCCGG_CORE   the eight helpers this file needs and must
 *                                not duplicate — the fetch that refreshes a
 *                                stale nonce, the toast, the disposable global
 *                                binder, the escapers, the widget id, the stay
 *                                key and copyText.
 *   this  -> window.DCCGG_GUEST  the five entry points core calls, each behind
 *                                a `window.DCCGG_GUEST &&` guard, so the public
 *                                page simply does less.
 *
 * ORDER DOES NOT MATTER, and it must not: this bundle is registered after core
 * and declares it as a dependency, but SpeedyCache combines and defers scripts
 * on this host. If core has already wired its roots by the time this file
 * runs, the applyGuestToAll() call at the bottom wires them now; if it has
 * not, init() picks the bundle up when it gets there. Both paths go through
 * applyGuest(), which refuses a root it has already done.
 */
(function () {
    'use strict';

    // Bound by boot(), not at definition time, so this file works whichever
    // order the two bundles execute in. Every function below closes over these
    // names and reads them when CALLED, by which point boot() has run.
    let CORE, bindGlobal, copyText, dccggFetch, escAttr, escHtml,
        getWidgetId, showToast, stayKey;

    // -- Report a problem (v0.8) ------------------------------------------
    function wireReportProblem(root, config) {
        if (!config.report || !config.report.enabled) return;
        const STR = config.report.strings || {};
        const CATS = Array.isArray(config.report.categories) ? config.report.categories : [];

        // v0.9.7.9: document delegation + stage back-pointer so both the popup
        // ⋯ menu's Report item AND per-item Report buttons fire after
        // .dccgg-stage is portaled to <body>.
        const stage = root.querySelector('.dccgg-stage');
        if (stage) stage.__dccggRoot = root;
        const ownsTarget = (el) => {
            if (root.contains(el)) return true;
            const s = el.closest && el.closest('.dccgg-stage');
            return !!(s && s.__dccggRoot === root);
        };

        let dialog = null;
        const ensureDialog = () => {
            if (dialog) return dialog;
            dialog = document.createElement('dialog');
            dialog.className = 'dccgg-report-dialog';
            // v0.24.3: a modal with no name is announced as just "dialog".
            // Point it at its own heading, which already says what this is.
            const headId = 'dccgg-report-title-' + Math.random().toString(36).slice(2, 8);
            dialog.setAttribute('aria-labelledby', headId);
            // v0.24.5: the heading is the dialog's own landing place, the same
            // way a section pop-up lands on its <h2> since v0.24.4. tabindex
            // makes it a focus TARGET without making it a Tab stop.
            const headAttrs = ` id="${headId}" tabindex="-1"`;
            // v0.9.7.1: leading blank option, selected + disabled by default,
            // so the guest must pick a category. Combined with `required`,
            // the form blocks submission until something is chosen.
            // v0.18.0: every label's own text sits in a span. The site's kit
            // underlines `label` at (0,1,1) — deliberately, it is the site's
            // form-label convention — and text decoration propagates from an
            // ancestor box to its in-flow descendants, which a descendant
            // CANNOT switch off. Since this dialog nests each field inside its
            // label, that underline was landing on the guest's typed value in
            // every browser. Moving the underline onto the span keeps the
            // convention and takes the field out from under it.
            // v0.25.0: Rob's alignment rule, the same test the Cottage
            // Selector uses (selector.js, isMulti/para at 0.54.0): a title is
            // centred, and a paragraph is left-aligned only when it holds more
            // than one sentence. Classed from the TEXT, not from which string
            // it happens to be, so a host who rewrites the note gets the right
            // alignment without anyone editing CSS. The live note — "We will
            // respond as soon as possible. However, please allow 24 hours for
            // requests." — is two sentences; the packaged default is as well.
            const isMulti = (text) => /[.!?]["\u201D']?\s+\S/.test(String(text == null ? '' : text));
            const labelText = (text) => `<span class="dccgg-report-label">${escHtml(text)}</span>`;
            // The placeholder is its own string now; it used to repeat the
            // label verbatim, and the caret clipped it.
            const catField = CATS.length
                ? `<label>${labelText(STR.category || 'Category')}<select class="dccgg-report-cat" required><option value="" selected disabled>${escHtml(STR.categoryPlaceholder || 'Select')}</option>${CATS.map(c => `<option value="${escAttr(c)}">${escHtml(c)}</option>`).join('')}</select></label>`
                : '';
            dialog.innerHTML = `
                <div class="dccgg-report-head">
                    <h3${headAttrs}>${escHtml(STR.title || 'Report a problem')}</h3>
                    <button type="button" class="dccgg-report-close" aria-label="${escAttr(STR.close || 'Close')}">
                        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" focusable="false"
                             fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
                            <path d="M6 6L18 18M18 6L6 18"/>
                        </svg>
                    </button>
                </div>
                <div class="dccgg-report-body">
                    ${catField}
                    <label>
                        ${labelText(STR.name || 'Your Name (Optional)')}
                        <input type="text" class="dccgg-report-name" maxlength="100" autocomplete="name">
                    </label>
                    <label>
                        ${labelText(STR.cottage || 'Which Cottage Are You Staying In?')}
                        <input type="text" class="dccgg-report-cottage" maxlength="100" autocomplete="off">
                    </label>
                    <label>
                        ${labelText(STR.phone || 'Phone (Optional)')}
                        <input type="tel" class="dccgg-report-phone" maxlength="40" inputmode="tel" autocomplete="tel">
                    </label>
                    <label>
                        ${labelText(STR.contact || 'Email to Reach You Back (Optional)')}
                        <input type="email" class="dccgg-report-contact" autocomplete="email">
                    </label>
                    <label>
                        ${labelText(STR.desc || 'Describe the Problem')}
                        <textarea class="dccgg-report-desc" required maxlength="1500" rows="5"></textarea>
                    </label>
                    <p class="dccgg-report-privacy${isMulti(STR.privacy) ? ' dccgg-multi' : ''}">${escHtml(STR.privacy || '')}</p>
                    ${'' /* v0.24.3 spam trap: off-screen, not tabbable, not announced.
                           A guest never sees it; a script that fills every input does. */}
                    <div class="dccgg-report-trap" aria-hidden="true">
                        <label>Website<input type="text" class="dccgg-report-hp" name="dccgg_hp"
                               tabindex="-1" autocomplete="off" value=""></label>
                    </div>
                </div>
                <p class="dccgg-report-error" role="alert" aria-live="polite" hidden></p>
                <div class="dccgg-report-foot">
                    <button type="button" class="dccgg-btn-cancel">${escHtml(STR.cancel || 'Cancel')}</button>
                    <button type="button" class="dccgg-btn-send">${escHtml(STR.send || 'Send report')}</button>
                </div>
            `;
            document.body.appendChild(dialog);
            // v0.24.1: focus goes back to the opener, but the RING only comes
            // back if the guest was using the keyboard. A phone guest who taps
            // the close button should not be left looking at a filled, ringed
            // circle they never asked for. A click carries detail > 0 when a
            // pointer made it and 0 when Enter or Space on a focused button
            // did, and Escape fires `cancel` — so each path says which it was.
            const closeBy = (keyboard) => { dialog.__dccggCloseKeyboard = !!keyboard; dialog.close(); };
            const byEvent = (e) => closeBy(!e || e.detail === 0);
            dialog.addEventListener('cancel', () => { dialog.__dccggCloseKeyboard = true; });
            dialog.addEventListener('close', () => {
                const opener = dialog.__dccggOpener;
                const keyboard = dialog.__dccggCloseKeyboard !== false;
                dialog.__dccggOpener = null;
                dialog.__dccggCloseKeyboard = undefined;
                if (opener && typeof opener.focus === 'function' && opener.isConnected) {
                    // Two mechanisms, because one is not enough. focus({focusVisible})
                    // is the standard way to ask for a quiet focus, but Chromium
                    // ignores the option outright AND treats every programmatic
                    // focus() as keyboard focus — so on a phone, putting focus
                    // back after a TAP would light up the ring and the coral
                    // circle. The attribute below is what actually decides: CSS
                    // drops both while it is set, and it is cleared on blur so
                    // the next real keyboard focus rings normally.
                    if (!keyboard) {
                        opener.setAttribute('data-dccgg-quiet-focus', '');
                        opener.addEventListener('blur', function clear() {
                            opener.removeAttribute('data-dccgg-quiet-focus');
                            opener.removeEventListener('blur', clear);
                        });
                    } else {
                        opener.removeAttribute('data-dccgg-quiet-focus');
                    }
                    try { opener.focus({ focusVisible: keyboard }); }
                    catch (_) { try { opener.focus(); } catch (__) {} }
                }
            });
            dialog.addEventListener('click', (e) => { if (e.target === dialog) byEvent(e); });
            dialog.querySelector('.dccgg-report-close').addEventListener('click', byEvent);
            dialog.querySelector('.dccgg-btn-cancel').addEventListener('click', byEvent);
            dialog.querySelector('.dccgg-btn-send').addEventListener('click', (e) => {
                dialog.__dccggCloseKeyboard = e.detail === 0;
                sendReport(dialog, root, config);
            });
            return dialog;
        };

        const open = (section, itemTitle, opener) => {
            const d = ensureDialog();
            // v0.24.0: remember the control that opened the dialog, and put
            // focus back on it when the dialog closes. <dialog> restores focus
            // by itself, but only to whatever held it at showModal() time — and
            // a tap does not focus a button on every platform (Safari), which
            // would drop a keyboard user back at the top of the page. Passing
            // the element in makes it the opener either way.
            d.__dccggOpener = opener || document.activeElement;
            // v0.24.3: when this dialog opened, so the server can refuse a
            // send that arrives faster than anyone could have typed it.
            d.__dccggOpenedAt = Date.now();
            const hp = d.querySelector('.dccgg-report-hp');
            if (hp) hp.value = '';
            d.dataset.section = section || '';
            d.dataset.item    = itemTitle || '';
            const desc = d.querySelector('.dccgg-report-desc');
            desc.value = itemTitle ? `[${itemTitle}] ` : '';
            d.querySelector('.dccgg-report-contact').value = '';
            const nameEl = d.querySelector('.dccgg-report-name');
            const cottageEl = d.querySelector('.dccgg-report-cottage');
            const phoneEl = d.querySelector('.dccgg-report-phone');
            if (nameEl) nameEl.value = '';
            if (cottageEl) cottageEl.value = '';
            if (phoneEl) phoneEl.value = '';
            const sendBtn = d.querySelector('.dccgg-btn-send');
            sendBtn.disabled = false;
            sendBtn.textContent = STR.send || 'Send report';
            const errEl = d.querySelector('.dccgg-report-error');
            if (errEl) { errEl.textContent = ''; errEl.hidden = true; }
            if (typeof d.showModal === 'function') d.showModal();
            else d.setAttribute('open', '');
            // v0.24.5: land on the dialog's own heading, not on a field.
            //
            // It used to focus the Name input, which did two things wrong: it
            // skipped straight past the first question (the category select),
            // and on an iPhone focusing a text input opens the keyboard, which
            // covered the form the guest had just asked to see. A heading takes
            // focus without a keyboard and without a caret, a screen reader
            // reads what the dialog is, and Tab from there goes to the first
            // question in source order.
            const head = d.querySelector('.dccgg-report-head h3');
            setTimeout(() => {
                const target = head || desc;
                try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
            }, 50);
        };

        // v0.9.7.21: expose `open` so the search empty-state's tier-3
        // "Still stuck? Tell us" CTA can pre-fill the dialog from the
        // failed query. Keyed on root so multi-widget pages don't cross.
        root.__dccggOpenReport = open;

        // More-menu "Report a problem" → context is the current section title.
        bindGlobal(root, document, 'click', (e) => {
            const m = e.target.closest('.dccgg-more-report');
            if (!m || !ownsTarget(m)) return;
            // Close the parent <details> popover so it doesn't sit open behind the dialog.
            const details = m.closest('details');
            if (details) details.open = false;
            open(m.dataset.reportSection || '', '', m);
        });

        // Per-item Report button.
        bindGlobal(root, document, 'click', (e) => {
            const b = e.target.closest('.dccgg-item-report');
            if (!b || !ownsTarget(b)) return;
            open(b.dataset.reportSection || '', b.dataset.reportItem || '', b);
        });
    }
    function sendReport(dialog, root, config) {
        const STR  = (config.report && config.report.strings) || {};
        // v0.9.7.10: inline error region inside the <dialog>. Body-level
        // toasts (showPdfTip) paint behind the dialog's top-layer in
        // Chrome, so the user never saw the failure message. Render the
        // error inside the dialog instead so it actually shows up.
        const setError = (msg) => {
            const el = dialog.querySelector('.dccgg-report-error');
            if (!el) return;
            el.textContent = msg || '';
            el.hidden = !msg;
        };
        const catEl    = dialog.querySelector('.dccgg-report-cat');
        // v0.9.7.1: when a category dropdown exists, the guest must pick
        // one before sending. The dropdown is `required` + starts on a
        // blank/disabled placeholder, so reporting `validity.valueMissing`
        // is enough; reportValidity surfaces the browser's native bubble.
        if (catEl && !catEl.value) {
            catEl.focus();
            if (typeof catEl.reportValidity === 'function') catEl.reportValidity();
            return;
        }
        const desc = dialog.querySelector('.dccgg-report-desc').value.trim();
        if (!desc) { dialog.querySelector('.dccgg-report-desc').focus(); return; }
        const contact  = dialog.querySelector('.dccgg-report-contact').value.trim();
        const nameEl   = dialog.querySelector('.dccgg-report-name');
        const cottEl   = dialog.querySelector('.dccgg-report-cottage');
        const phoneEl  = dialog.querySelector('.dccgg-report-phone');
        const send     = dialog.querySelector('.dccgg-btn-send');
        send.disabled = true;
        send.textContent = '…';
        const body = new URLSearchParams();
        body.set('action',           'dccgg_report_problem');
        body.set('category',         catEl ? catEl.value : '');
        body.set('description',      desc);
        body.set('contact',          contact);
        body.set('reporter_name',    nameEl ? nameEl.value.trim() : '');
        body.set('reporter_cottage', cottEl ? cottEl.value.trim() : '');
        body.set('reporter_phone',   phoneEl ? phoneEl.value.trim() : '');
        body.set('section',          dialog.dataset.section || '');
        body.set('item',             dialog.dataset.item || '');
        body.set('stay',             stayKey());
        body.set('page_url',         window.location.href);
        body.set('elapsed_ms',       String(Math.max(0, Date.now() - (dialog.__dccggOpenedAt || 0))));
        const hpEl = dialog.querySelector('.dccgg-report-hp');
        body.set('dccgg_hp',         hpEl ? hpEl.value : '');
        // v0.9.7.14: recipient list, From identity, subject/body templates and
        // include-UA flag now resolved server-side from the widget's saved
        // Elementor settings (keyed by post_id + widget_id). They never leave
        // wp_options / postmeta, so they no longer appear in page source.
        body.set('post_id',          String(config.postId || 0));
        body.set('widget_id',        String(config.widgetId || ''));
        setError('');
        dccggFetch(config, body).then(r => {
            // v0.9.7.10: capture HTTP-error status so it doesn't disappear
            // into the catch as a generic "Could not send." The user sees
            // "HTTP 403" / "HTTP 0" right in the dialog and can DM us the
            // exact failure mode.
            if (!r.ok) {
                return r.text().then(txt => {
                    const e = new Error('HTTP ' + r.status + (r.statusText ? ' ' + r.statusText : ''));
                    e.responseText = txt;
                    e.status = r.status;
                    throw e;
                });
            }
            return r.json();
        }).then(json => {
            if (json && json.success) {
                dialog.close();   // __dccggCloseKeyboard set by the Send click
                showToast(STR.thankYou || 'Thanks!');
            } else {
                send.disabled = false;
                send.textContent = STR.send || 'Send report';
                const serverMsg = json && json.data && json.data.message;
                console.error('[DCCGG report] server returned non-success:', json);
                setError(serverMsg || STR.error || 'Could not send the report. Please try again.');
            }
        }).catch((err) => {
            send.disabled = false;
            send.textContent = STR.send || 'Send report';
            console.error('[DCCGG report] fetch failed:', err, err && err.responseText ? '\n--- response body ---\n' + err.responseText.slice(0, 500) : '');
            const detail = err && err.message ? err.message : 'Network error';
            setError((STR.error || 'Could not send the report.') + ' (' + detail + ')');
        });
    }

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
        root.__dccggDisposers.push(() => obs.disconnect());
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
        const URLS    = rv.urls   || {};
        const EXTRAS  = Array.isArray(rv.extras) ? rv.extras : [];
        const COPY_EX = STR.copyExtra || 'Copy & open';
        const platforms = [
            { key: 'airbnb', url: URLS.airbnb, label: STR.copyAirbnb || 'Copy & open Airbnb' },
            { key: 'vrbo',   url: URLS.vrbo,   label: STR.copyVrbo   || 'Copy & open Vrbo' },
            { key: 'google', url: URLS.google, label: STR.copyGoogle || 'Copy & open Google' },
            ...EXTRAS.map((e, i) => ({
                key:   'extra-' + i,
                url:   e.url,
                label: COPY_EX + ' ' + (e.label || 'review'),
                icon:  e.icon || null,
            })),
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
                        if (p.icon && p.icon.value) {
                            const ic = document.createElement('i');
                            ic.className = p.icon.value + ' dccgg-review-platform-ico';
                            ic.setAttribute('aria-hidden', 'true');
                            btn.appendChild(ic);
                            btn.appendChild(document.createTextNode(' ' + p.label));
                        } else {
                            btn.textContent = p.label;
                        }
                        btn.addEventListener('click', () => {
                            copyText(ta.value).then(() => {
                                showToast(STR.copied || 'Copied!');
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

    function askAi(root, config, question, wrap, onAnswer) {
        const btn    = wrap.querySelector('.dccgg-ai-button');
        const answer = wrap.querySelector('.dccgg-ai-answer');
        btn.disabled = true;
        answer.hidden = false;
        answer.dataset.state = 'loading';
        // v0.12.2: the guide itself works offline; this one feature cannot.
        // Say so immediately instead of firing a request that will hang.
        if (navigator.onLine === false) {
            answer.hidden = false;
            answer.textContent = config.aiSearch.offline
                || 'Ask anything needs a connection. The rest of the guide works offline.';
            btn.disabled = false;
            return;
        }
        answer.textContent = config.aiSearch.thinking;
        // v0.23.5: no guide text leaves the page. The server builds the
        // context from this widget's saved settings; it ignores any sent.
        const body = new URLSearchParams();
        body.set('action', 'dccgg_ai_query');
        body.set('question', question);
        body.set('post_id', String(config.postId || 0));
        body.set('widget_id', String(config.widgetId || ''));
        dccggFetch(config, body).then(r => r.json()).then(json => {
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

    // v0.12.2: tell the host what guests searched for and did not find. Sends
    // the query and nothing else — no identifier, no page, no user agent. Fired
    // at most once per distinct query per page view, and only for queries long
    // enough to mean something, so a half-typed word is not logged on its way
    // to a real one.
    const _missSent = new Set();
    function reportSearchMiss(root, config, q) {
        const query = String(q || '').trim();
        if (query.length < 3 || query.length > 80) return;
        const key = query.toLowerCase();
        if (_missSent.has(key)) return;
        _missSent.add(key);
        if (!config || !config.ajaxUrl || !config.nonce) return;
        if (config.logMisses === false) return;   // v0.23.0: switched off by the host
        try {
            const body = new URLSearchParams();
            body.set('action', 'dccgg_search_miss');
            body.set('q', query);
            dccggFetch(config, body).catch(() => {});
        } catch (_) {}
    }

    function boot(core) {
        CORE = core;
        bindGlobal  = core.bindGlobal;
        copyText    = core.copyText;
        dccggFetch  = core.dccggFetch;
        escAttr     = core.escAttr;
        escHtml     = core.escHtml;
        getWidgetId = core.getWidgetId;
        showToast   = core.showToast;
        stayKey     = core.stayKey;

        window.DCCGG_GUEST = {
            wireReportProblem,
            wireVoiceConcierge,
            wireReview,
            askAi,
            reportSearchMiss,
        };

        // Catch any root core wired before this file arrived. A no-op when
        // there are none, and applyGuest() refuses a root it has done already.
        try { core.applyGuestToAll(); } catch (_) { /* never break a page over it */ }
    }

    // Both orders, because neither can be relied on: this bundle declares core
    // as a dependency, but SpeedyCache combines and defers scripts on this
    // host. If core is already here, start now; if it is not, leave boot()
    // where core will find it the moment it publishes DCCGG_CORE.
    if (window.DCCGG_CORE) { boot(window.DCCGG_CORE); }
    else { window.__dccggGuestBoot = boot; }

})();
