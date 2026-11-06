/**
 * What actually happens between the tap and the open popup (v0.27.10 survey).
 *
 * Runs the REAL /guest/ page with the working tree's scripts at 390px under
 * 4x CPU throttling, and reports three things that each answer a different
 * question:
 *
 *   frames   — what the guest SEES. requestAnimationFrame timestamps across
 *              the open; the longest gap is the stall, and a gap over ~33ms
 *              is a dropped frame at 60fps.
 *   profile  — WHERE the main thread went. A real CPU profile, aggregated by
 *              function, so a suspect is named rather than guessed at.
 *   shift    — whether anything behind the popup moved (LayoutShift).
 *
 *   node tools/open-trace.js [--cpu 4] [--width 390] [--label before]
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell');

const arg = (n, d) => {
    const i = process.argv.indexOf('--' + n);
    return i > 0 ? process.argv[i + 1] : d;
};

async function main() {
    const cpu = Number(arg('cpu', 4));
    const width = Number(arg('width', 390));
    const label = arg('label', 'run');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    try {
        const { ctx, page, errors } = await openLive(browser, {
            width, height: 844, keepReal: true, scale: 1,
            throttle: { cpu, network: { latency: 0, downloadThroughput: -1, uploadThroughput: -1 } },
        });

        // The hub, with a tile on screen.
        await page.evaluate(() => {
            const t = document.querySelector('.dccgg-root .dccgg-tile');
            if (t) t.scrollIntoView({ block: 'center', behavior: 'instant' });
        });
        await page.waitForTimeout(400);

        const info = await page.evaluate(() => {
            const t = document.querySelector('.dccgg-root .dccgg-tile');
            const r = t.getBoundingClientRect();
            return { key: t.dataset.key, rect: { x: r.x, y: r.y, w: r.width, h: r.height },
                     vt: typeof document.startViewTransition === 'function' };
        });

        // Recorders, installed before the tap.
        await page.evaluate(() => {
            // The tap's OWN timestamp. Everything else in this report is
            // measured from here, not from the harness's dispatch call: the
            // round trip from node into the page is not something a guest's
            // finger pays for, and counting it would flatter nothing and
            // mislead everything.
            window.__evt = null;
            document.addEventListener('click', (e) => {
                if (window.__evt === null) {
                    window.__evt = e.timeStamp;
                    window.__evtSeen = performance.now();
                }
            }, true);
            window.__f = [];
            window.__shift = 0;
            const tick = (ts) => { window.__f.push(ts); requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
            try {
                new PerformanceObserver((l) => {
                    for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__shift += e.value; }
                }).observe({ type: 'layout-shift', buffered: true });
            } catch (_) {}
            // PHASE OBSERVATION. The open path lives inside an IIFE closure,
            // so it cannot be instrumented from here — but every phase leaves a
            // visible mark on the DOM, and a rAF poll records when each one
            // first became true. No guessing about which step cost what.
            window.__phase = {};
            window.__long = [];
            try {
                new PerformanceObserver((l) => {
                    for (const e of l.getEntries()) window.__long.push(+e.duration.toFixed(1));
                }).observe({ type: 'longtask', buffered: true });
            } catch (_) {}
            const mark = (k) => { if (window.__phase[k] === undefined) window.__phase[k] = performance.now(); };
            const poll = () => {
                const root = document.querySelector('.dccgg-root');
                const stage = document.querySelector('.dccgg-stage');
                if (root && root.classList.contains('is-detail')) mark('isDetailClass');
                if (stage && stage.parentElement === document.body) mark('stagePortaled');
                if (document.body.classList.contains('dccgg-detail-open')) mark('bodyPinned');
                if (document.querySelector('.dccgg-detail:not([hidden])')) mark('panelUnhidden');
                if (document.querySelector('.dccgg-stage.is-modal-open')) mark('modalOpenClass');
                requestAnimationFrame(poll);
            };
            requestAnimationFrame(poll);
            // When did the popup first paint in its open state?
            window.__openAt = null;
            const mo = new MutationObserver(() => {
                const s = document.querySelector('.dccgg-stage.is-modal-open');
                if (s && window.__openAt === null) {
                    window.__openAt = performance.now();
                    requestAnimationFrame(() => { window.__openPainted = performance.now(); });
                }
            });
            mo.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class'] });
        });

        // --no-vt deletes the View Transitions API before the tap, which is
        // the only way to attribute its cost rather than infer it.
        if (process.argv.includes('--no-vt')) {
            await page.evaluate(() => { try { delete Document.prototype.startViewTransition; } catch (_) {} });
        }
        // Time the custom-property snapshot loop showDetailModal() runs on the
        // FIRST open, in isolation, on the same throttled thread.
        const snapshotMs = await page.evaluate(() => {
            const root = document.querySelector('.dccgg-root');
            const probe = document.createElement('div');
            document.body.appendChild(probe);
            const t = performance.now();
            const st = getComputedStyle(root);
            let n = 0;
            for (let i = 0; i < st.length; i++) {
                const name = st[i];
                if (name.indexOf('--dccgg-') === 0) {
                    const v = st.getPropertyValue(name);
                    if (v) { probe.style.setProperty(name, v); n++; }
                }
            }
            const ms = performance.now() - t;
            probe.remove();
            return { ms: +ms.toFixed(1), properties: st.length, copied: n };
        });

        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
        await cdp.send('Profiler.start');

        const t0 = await page.evaluate(() => { window.__t0 = performance.now(); return window.__t0; });
        if (width < 700) { await page.tap('.dccgg-root .dccgg-tile'); }
        else { await page.click('.dccgg-root .dccgg-tile'); }
        await page.waitForTimeout(1500);

        const { profile } = await cdp.send('Profiler.stop');

        const out = await page.evaluate(() => ({
            frames: window.__f, t0: window.__t0, shift: window.__shift,
            openAt: window.__openAt, openPainted: window.__openPainted,
            evt: window.__evt, evtSeen: window.__evtSeen,
            phase: window.__phase, long: window.__long,
            marks: performance.getEntriesByType('mark')
                .filter((m) => m.name.indexOf('DCC:') === 0)
                .map((m) => [m.name.slice(4), m.startTime]),
            isOpen: !!document.querySelector('.dccgg-stage.is-modal-open'),
        }));

        // ---- frames --------------------------------------------------
        const fr = out.frames.filter((t) => t >= out.t0 && t <= out.t0 + 900);
        const gaps = [];
        for (let i = 1; i < fr.length; i++) gaps.push(+(fr[i] - fr[i - 1]).toFixed(1));
        const longest = gaps.length ? Math.max(...gaps) : 0;
        const dropped = gaps.filter((g) => g > 33).length;

        // ---- profile -------------------------------------------------
        const byId = new Map();
        for (const n of profile.nodes) byId.set(n.id, n);
        const self = new Map();
        const total = profile.samples ? profile.samples.length : 0;
        const dt = profile.timeDeltas || [];
        profile.samples.forEach((id, i) => {
            const n = byId.get(id);
            if (!n) return;
            const cf = n.callFrame;
            const where = cf.url ? cf.url.split('/').pop().split('?')[0] : '(native)';
            const name = (cf.functionName || '(anonymous)') +
                (cf.lineNumber >= 0 ? ':' + (cf.lineNumber + 1) : '') + '  [' + where + ']';
            self.set(name, (self.get(name) || 0) + (dt[i] || 0) / 1000);
        });
        const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);

        const report = {
            label, cpu, width, tile: info,
            inputLatencyMs: (out.evt !== null && out.evtSeen !== undefined)
                ? +(out.evtSeen - out.evt).toFixed(1) : null,
            fromTapMs: out.evt === null ? null : {
                firstOpenPaint: out.openPainted ? +(out.openPainted - out.evt).toFixed(1) : null,
                marks: (out.marks || []).map(([k, v]) => k + ' ' + (v - out.evt).toFixed(1)),
            },
            viewTransitionsDeleted: process.argv.includes('--no-vt'),
            customPropertySnapshot: snapshotMs,
            viewTransitionsAvailable: info.vt,
            clickToOpenClass: out.openAt ? +(out.openAt - out.t0).toFixed(1) : null,
            clickToFirstOpenPaint: out.openPainted ? +(out.openPainted - out.t0).toFixed(1) : null,
            phasesFromClickMs: Object.fromEntries(Object.entries(out.phase)
                .map(([k, v]) => [k, +(v - out.t0).toFixed(1)])
                .sort((a, b) => a[1] - b[1])),
            marksFromClickMs: (out.marks || []).map(([k, v]) => k + ' ' + (v - out.t0).toFixed(1)),
            longTasksMs: out.long,
            framesIn900ms: fr.length,
            longestFrameGapMs: longest,
            droppedFrames: dropped,
            frameGaps: gaps,
            // WHERE the worst gap sits relative to the tap, so it can be told
            // apart from our own synchronous work rather than assumed to be it.
            // The frames DURING the animation itself — the thing will-change is
            // supposed to buy. Gaps whose frame starts inside the open window.
            animWindow: (() => {
                if (out.evt === null || !out.openPainted) return null;
                const a = out.openPainted, b = a + 260;
                const inW = [];
                for (let i = 1; i < fr.length; i++) {
                    if (fr[i - 1] >= a && fr[i - 1] <= b) inW.push(+(fr[i] - fr[i - 1]).toFixed(1));
                }
                return { frames: inW.length, gaps: inW,
                    worst: inW.length ? Math.max(...inW) : 0,
                    over33: inW.filter((g) => g > 33).length };
            })(),
            worstGapWindow: (() => {
                let bi = 0;
                for (let i = 1; i < gaps.length; i++) if (gaps[i] > gaps[bi]) bi = i;
                if (!gaps.length || out.evt === null) return null;
                return { fromTap: +(fr[bi] - out.evt).toFixed(1),
                         toTap: +(fr[bi + 1] - out.evt).toFixed(1), ms: gaps[bi] };
            })(),
            cumulativeLayoutShift: +out.shift.toFixed(4),
            opened: out.isOpen,
            pageErrors: errors,
            profileTopSelfMs: top.map(([k, v]) => k + '  ' + v.toFixed(1) + 'ms'),
        };
        console.log(JSON.stringify(report, null, 2));
        const dest = '/tmp/claude-0/-home-user-claude/a08a22d3-9a3c-5b89-91e9-1a11ebc6042e/scratchpad/trace/' + label + '-' + width + '.json';
        fs.writeFileSync(dest, JSON.stringify(report, null, 2));
        console.error('written ' + dest);
        await ctx.close();
    } finally {
        await browser.close();
    }
}
main().catch((e) => { console.error(e); process.exit(1); });
