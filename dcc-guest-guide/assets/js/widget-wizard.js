/**
 * DCC Guest Guide — the step-by-step wizard (v0.25.0).
 *
 * A section rendered as numbered steps with Back / Next and a dot track.
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
    const { REDUCED_MOTION, hapticPulse, spawnConfetti } = CORE;

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

    (window.DCCGG_CHUNK = window.DCCGG_CHUNK || {})['wizard'] = function (root, config) {
        wireWizard(root, config);
    };

})();
