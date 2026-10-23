/**
 * DCC Guest Guide — editor-only code (v0.24.5).
 *
 * Everything in here runs ONLY inside the Elementor editor or its preview
 * iframe: the Welcome Pack inserter, server-backed Export / Import, and the
 * toast that surfaces a silent bail-out to the host.
 *
 * It used to live in widget.js, which meant every guest on /guest/ and every
 * prospect on /explore/ downloaded and parsed it, and the delegated click
 * listener for three buttons that are never on the page was registered on
 * every load. Enqueued by Widget::enqueue_for_editor() and
 * Widget::enqueue_for_preview(), and by nothing else.
 *
 * CONTRACT WITH THE CORE BUNDLE: core keeps a `editorPreviewToast()` that does
 * nothing on its own and forwards to `window.__dccggEditorToast` when this file
 * has installed one. Core calls it from openDetail() and showDetailModal(), so
 * the call sites stay where they are and simply go quiet for a visitor.
 *
 * Core also keeps its OWN isElementorEditorPreview(), because
 * shouldUseDetailModal() needs it on the front end: in the editor preview a
 * position:fixed modal portaled to the canvas iframe is invisible, so the
 * guide falls back to an inline reveal (v0.9.7.24). That is why only the
 * toast moved here and not the test it uses.
 */
(function () {
    'use strict';

    // A local copy of the gate. This file is standalone — it must not reach
    // into the core IIFE — and the two copies answer the same question for
    // different reasons: core decides how to reveal a section, this one
    // decides whether a toast is wanted. Keep them in step if either changes.
    function isElementorEditorPreview() {
        try {
            if (document.body && document.body.classList && document.body.classList.contains('elementor-editor-preview')) return true;
            if (window.elementorFrontend && typeof window.elementorFrontend.isEditMode === 'function'
                && window.elementorFrontend.isEditMode()) return true;
            if (window.parent !== window && /elementor=true|action=elementor/.test(String(window.parent.location || ''))) return true;
        } catch (_) { /* cross-origin parent — fall through */ }
        return false;
    }
    function editorPreviewToast(title, detail) {
        if (!isElementorEditorPreview()) return;
        try {
            let host = document.getElementById('dccgg-editor-toast');
            if (!host) {
                host = document.createElement('div');
                host.id = 'dccgg-editor-toast';
                // v0.9.7.18: in Elementor's mobile preview the top ~60-80 px
                // is the device-frame chrome, so the toast was hidden. Pin
                // to the bottom on narrow viewports; cap height so a long
                // stack trace can scroll instead of exploding the iframe.
                const narrow = (window.innerWidth || 9999) < 500;
                const vertical = narrow ? 'bottom:12px;' : 'top:12px;';
                host.style.cssText = 'position:fixed;' + vertical + 'left:50%;transform:translateX(-50%);z-index:2147483647;'
                    + 'max-width:min(640px,90vw);max-height:60vh;overflow:auto;background:#fff3cd;color:#664d03;'
                    + 'border:2px solid #ffc107;border-radius:8px;padding:14px 18px;'
                    + 'font:13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;'
                    + 'box-shadow:0 8px 32px rgba(0,0,0,0.25);cursor:pointer;';
                host.title = 'Click to copy';
                document.body.appendChild(host);
                host.addEventListener('click', () => {
                    try { navigator.clipboard.writeText(host.dataset.copy || host.textContent || ''); } catch (_) {}
                    host.style.background = '#d1e7dd';
                    host.style.borderColor = '#198754';
                });
            }
            const full = '[DCCGG editor] ' + title + '\n\n' + (detail || '');
            host.dataset.copy = full;
            host.innerHTML = '<strong>[DCCGG editor] ' + title.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) + '</strong><br>'
                + '<span style="opacity:0.85">' + String(detail || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) + '</span><br>'
                + '<small style="opacity:0.7">Click to copy. Auto-dismiss in 12 s.</small>';
            clearTimeout(host.__dismiss);
            host.__dismiss = setTimeout(() => { if (host && host.parentNode) host.parentNode.removeChild(host); }, 12000);
        } catch (_) { /* never let toast plumbing crash the caller */ }
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

    // The editor panel renders the Welcome Pack / Export / Import buttons via
    // RAW_HTML, so one delegated listener covers all three. It lives here now
    // rather than in initAll(), where it was being registered on pages that
    // can never contain those buttons.
    wireWelcomePackEditor();

    // Hand core the real toast. Until this runs, core's own copy is a no-op.
    window.__dccggEditorToast = editorPreviewToast;

})();
