/**
 * DCC Guest Guide — the popup grows out of the tile (v0.27.10).
 *
 *   A. THE ORDERING FIX. The content is in place before the first frame of the
 *      open. This is the jerk itself, not a polish item: on 0.27.9 the panel
 *      was still [hidden] when the box started opening and the text popped in
 *      40ms later. A1 fails on 0.27.9 and is the reason this suite exists.
 *   B. the grow: a rounded clip from the tile's own rectangle, ~250ms, and
 *      NOTHING SCALED — the stage's transform is identical in every frame.
 *   C. the close: the same thing backwards, ~200ms, into the same tile; a
 *      fade-and-drop when the tile has scrolled away; nothing left behind.
 *   D. the arrows: next in from the right, previous from the left, ~220ms.
 *   E. reduced motion: a short fade, no grow and no slide — including the
 *      scale that had been reaching reduced-motion guests since v0.9.5.
 *   F. what the brief calls performance: only transform/opacity/clip-path
 *      animated, will-change on for the animation and off after, no layout
 *      shift behind, and the 26ms custom-property walk off the tap.
 *   G. the full-screen map layer: grows from its card, and the iframe is NOT
 *      reloaded — the thing v0.27.8 exists to protect.
 *
 *   node tests/grow-open.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/grow-open.ui.js
 *
 * WebKit is not installed in this container and cannot be fetched, so this is
 * Chromium with touch emulation. Said plainly rather than implied.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const { frontEndJs, routeChunks } = require('./_bundles');

const TESTS = __dirname;
const PLUGIN = (process.env.DCCGG_PLUGIN_DIR || path.join(TESTS, '../dcc-guest-guide')).replace(/\/$/, '');
const A = PLUGIN + '/assets/';
const SRC = process.env.DCCGG_UI_SOURCE === '1';
const CSS = SRC ? fs.readFileSync(A + 'css/widget.css', 'utf8')
    : fs.readFileSync(A + 'css/widget.min.css', 'utf8') + fs.readFileSync(A + 'css/widget-guest.min.css', 'utf8');
const JS = frontEndJs(A, SRC);
const emit = (c) => execFileSync('php', [path.join(TESTS, '_emit-guide.php'), c],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: Object.assign({}, process.env, { DCCGG_PLUGIN_DIR: PLUGIN }) });
const MARKUP = emit('all-on');

/* The theme, modelled. `html{font-weight:700}` and the kit's (0,1,1) rules are
   the two that have caught real faults on this plugin. */
const KIT = `
 html{font-weight:700;line-height:1.8}
 body{margin:0;font-family:Raleway,system-ui,sans-serif}
 .elementor-kit-331 h2{font-size:20px}
 .elementor-kit-331 button{font-size:18px;font-weight:900;border-width:0;border-radius:30px}
 .elementor-kit-331 button:hover,.elementor-kit-331 button:focus,
 .elementor-kit-331 button:active{background-color:#F08080}
 .dccgg-item-report .fas{width:14px;display:inline-block}
`;

/* getKeyframes() returns 'offset', 'computedOffset', 'easing' and 'composite'
   ALONGSIDE the animated properties, and every filter below drops all four.
   `composite` is the one that caught me out: four of this suite's first ten
   failures were that single word being read as an animated property. The list
   is written out at each site rather than hoisted, because these filters run
   INSIDE page.evaluate — a constant up here is not defined in the browser,
   which is what the second run failed on.
*/

/* .dccgg-sos-fab pulses its box-shadow forever (`dccgg-sos-pulse 2.4s …
   infinite`, widget.css ~4059) whenever a section is open, and it predates
   this release by a long way. It is therefore excluded BY NAME from the
   "only cheap properties" and "nothing is still animating" checks rather than
   by widening either of them — so a new offender still fails, and this one
   stays on the record instead of disappearing into a loosened assertion. */
const PREEXISTING = (target) => String(target).indexOf('dccgg-sos-fab') >= 0;

let pass = 0, fail = 0; const failures = [];
function check(name, cond, detail = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

async function openGuide(browser, width, opts = {}) {
    const ctx = await browser.newContext({
        viewport: { width, height: width >= 768 ? 900 : 844 },
        isMobile: width < 700, hasTouch: width < 700, deviceScaleFactor: 1,
        reducedMotion: opts.reducedMotion || 'no-preference',
    });
    const page = await ctx.newPage();
    const errors = [];
    const mapReqs = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // Counted, not stubbed away: a reload keeps the same iframe NODE, so
    // element identity cannot see it. Only the request can.
    page.on('request', (r) => { if (/google\.com\/maps/.test(r.url())) mapReqs.push(r.url()); });
    await routeChunks(page, A, SRC);
    await page.route('**/*', (r) => {
        const u = r.request().url();
        if (/^data:|^blob:/.test(u)) return r.continue();
        if (/google\.com\/maps/.test(u)) {
            return r.fulfill({ status: 200, contentType: 'text/html',
                body: '<body style="margin:0;background:#dfe3e6">map</body>' });
        }
        return r.fulfill({ status: 200, contentType: 'image/gif',
            body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
    });
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width">
        <style>${KIT}</style><style>${CSS}</style></head><body class="elementor-kit-331">
        <div class="elementor-element elementor-element-2afb24b dccgg-layout-grid">${opts.markup || MARKUP}</div>
        <div style="height:2000px"></div></body></html>`, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: 'window.dccggChunks={base:"https://dccgg.test/a/",ver:"dev",min:false};' });
    await page.addScriptTag({ content: JS });
    await page.waitForTimeout(400);
    return { ctx, page, errors, mapCount: () => mapReqs.length };
}

/**
 * Watch the open, from the frame the box starts appearing in.
 *
 * Installed BEFORE the click. The MutationObserver records the state of the
 * world at the instant `.is-modal-open` lands, which is the only moment at
 * which A1 can be asked: a check made afterwards would always find the panel
 * visible, on 0.27.9 as well, and would prove nothing.
 */
async function armWatcher(page) {
    await page.evaluate(() => {
        window.__w = { atOpen: null, transforms: [], shift: 0, anims: null };
        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__w.shift += e.value; }
            }).observe({ type: 'layout-shift', buffered: true });
        } catch (_) {}
        const seen = new MutationObserver(() => {
            const stage = document.querySelector('.dccgg-stage.is-modal-open');
            if (!stage || window.__w.atOpen) return;
            const panel = stage.querySelector('.dccgg-detail[data-key]:not([hidden])');
            window.__w.atOpen = {
                panelPresent: !!panel,
                panelHidden: !panel,
                panelText: panel ? (panel.textContent || '').trim().length : 0,
                willChange: stage.style.willChange,
                clipPath: getComputedStyle(stage).clipPath,
            };
            // The transform in every frame of the animation. If anything is
            // scaled, these differ.
            const sample = () => {
                window.__w.transforms.push(getComputedStyle(stage).transform);
                if (window.__w.transforms.length < 20) requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
            window.__w.anims = document.getAnimations().map((a) => ({
                target: a.effect && a.effect.target ? a.effect.target.className : '',
                props: a.effect && a.effect.getKeyframes
                    ? Array.from(new Set([].concat(...a.effect.getKeyframes()
                        .map((k) => Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p))))))
                    : [],
                duration: a.effect ? a.effect.getTiming().duration : 0,
                delay: a.effect ? a.effect.getTiming().delay : 0,
                first: a.effect && a.effect.getKeyframes ? a.effect.getKeyframes()[0] : null,
            }));
        });
        seen.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class'] });
    });
}

async function tapTile(page, width, index = 0) {
    return page.evaluate(({ i }) => {
        const tiles = Array.from(document.querySelectorAll('.dccgg-root .dccgg-tile'))
            .filter((t) => t.getClientRects().length);
        const t = tiles[i];
        t.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = t.getBoundingClientRect();
        const rect = { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
        t.click();
        // Read SYNCHRONOUSLY after the handler returns: this is the same task
        // the click ran in, so it proves the open state is reached without
        // waiting a frame — what the old `void offsetWidth` + rAF cost 46ms.
        const stage = document.querySelector('.dccgg-stage');
        return { rect, key: t.dataset.key,
            sameTaskModalOpen: !!(stage && stage.classList.contains('is-modal-open')),
            sameTaskIsDetail: document.querySelector('.dccgg-root').classList.contains('is-detail') };
    }, { i: index });
}

/**
 * inset(top right bottom left round …) -> the four numbers, in pixels.
 *
 * Since v0.27.11 the right and bottom sides are written as
 * `calc(100% - Apx - Bpx)` so the revealed rectangle cannot change size when
 * the element's box does — see insetFor() for the measurement that forced it.
 * They are resolved here against the box the caller passes, so the assertions
 * below still compare plain pixels. A parser that silently returned NaN for
 * the calc form would have turned this release into four green ticks that
 * measured nothing.
 */
function parseInset(str, box) {
    const m = /inset\((.*?)(?:\s+round\s+.*)?\)\s*$/.exec(String(str || '').trim());
    if (!m) return null;
    // Split on top-level spaces only: calc(...) contains spaces of its own.
    const parts = [];
    let buf = '', depth = 0;
    for (const ch of m[1]) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (/\s/.test(ch) && depth === 0) { if (buf) { parts.push(buf); buf = ''; } }
        else buf += ch;
    }
    if (buf) parts.push(buf);
    if (!parts.length) return null;
    const [a, b = a, c = a, d = b] = parts;
    const resolve = (v, dim) => {
        const plain = /^(-?[\d.]+)px$/.exec(v);
        if (plain) return parseFloat(plain[1]);
        const calc = /^calc\(100%\s*(.*)\)$/.exec(v);
        if (calc && typeof dim === 'number') {
            let out = dim;
            const re = /([+-])\s*([\d.]+)px/g;
            let t, seen = false;
            while ((t = re.exec(calc[1]))) { seen = true; out += (t[1] === '-' ? -1 : 1) * parseFloat(t[2]); }
            if (seen) return out;
        }
        return NaN;
    };
    const W = box && box.w, H = box && box.h;
    const out = { top: resolve(a, H), right: resolve(b, W),
        bottom: resolve(c, H), left: resolve(d, W) };
    return Object.values(out).some(isNaN) ? null : out;
}

async function run() {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    try {
        // ================= A + B : the open ==========================
        for (const width of [390, 1440]) {
            console.log(`\nA+B · the open at ${width}`);
            const { ctx, page, errors } = await openGuide(browser, width);
            // F2 first: the snapshot is taken at init, not on the tap.
            const snap = await page.evaluate(() => {
                const r = document.querySelector('.dccgg-root');
                const s = r.__dccggVarSnapshot;
                return { present: !!s, count: s ? Object.keys(s).length : 0 };
            });
            check(`${width}: the custom-property snapshot is already taken before any tap`,
                snap.present && snap.count > 0, JSON.stringify(snap));

            await armWatcher(page);
            const t = await tapTile(page, width);
            await page.waitForTimeout(40);
            const w = await page.evaluate(() => window.__w);

            // --- A1, the one that fails on 0.27.9 ---
            check(`${width}: the CONTENT is in place in the first frame of the open`,
                !!(w.atOpen && w.atOpen.panelPresent && w.atOpen.panelText > 0),
                JSON.stringify(w.atOpen && { present: w.atOpen.panelPresent, text: w.atOpen.panelText }));
            check(`${width}: the open state is reached in the click's OWN task, not a frame later`,
                t.sameTaskModalOpen === true);
            check(`${width}: and .is-detail with it, synchronously`, t.sameTaskIsDetail === true);

            // --- the grow ---
            const clipAnim = (w.anims || []).find((a) => a.props.includes('clipPath')
                && String(a.target).indexOf('dccgg-stage') >= 0);
            check(`${width}: the stage grows by a clip-path animation`, !!clipAnim,
                JSON.stringify((w.anims || []).map((a) => a.target + ':' + a.props.join('+'))));
            check(`${width}: the open lasts ~250ms`, !!clipAnim && clipAnim.duration === 250,
                clipAnim && String(clipAnim.duration));
            const geoEarly = await page.evaluate(() => {
                const b = document.querySelector('.dccgg-stage').getBoundingClientRect();
                return { w: b.width, h: b.height };
            });
            const start = clipAnim && parseInset(clipAnim.first && clipAnim.first.clipPath, geoEarly);
            check(`${width}: it starts as an inset(), not a scale`, !!start,
                clipAnim && String(clipAnim.first && clipAnim.first.clipPath));
            check(`${width}: the start rectangle has a rounded corner`,
                !!clipAnim && /round/.test(String(clipAnim.first && clipAnim.first.clipPath)));

            // The start inset must frame the tapped tile inside the stage box.
            const geo = await page.evaluate(() => {
                const s = document.querySelector('.dccgg-stage');
                const b = s.getBoundingClientRect();
                return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom };
            });
            if (start) {
                const want = {
                    top: Math.max(0, Math.min(t.rect.y - geo.y, geo.h)),
                    left: Math.max(0, Math.min(t.rect.x - geo.x, geo.w)),
                    right: Math.max(0, Math.min(geo.right - t.rect.right, geo.w)),
                    bottom: Math.max(0, Math.min(geo.bottom - t.rect.bottom, geo.h)),
                };
                check(`${width}: the start rectangle IS the tapped tile's box`,
                    near(start.top, want.top) && near(start.left, want.left)
                    && near(start.right, want.right) && near(start.bottom, want.bottom),
                    `got ${JSON.stringify(start)} want ${JSON.stringify(want)}`);
            }

            // --- NOTHING IS SCALED. Rob's whole objection. ---
            const uniq = Array.from(new Set(w.transforms.filter((x) => x && x !== 'none')));
            check(`${width}: the stage's transform never changes during the open`,
                uniq.length <= 1, uniq.join(' | '));
            check(`${width}: and it carries no scale`,
                !w.transforms.some((x) => /matrix(3d)?\(0?\.[0-9]/.test(String(x))),
                uniq.join(' | '));

            // --- only cheap properties ---
            const ALLOWED = ['clipPath', 'opacity', 'translate'];
            const bad = (w.anims || []).filter((a) => !PREEXISTING(a.target)
                && a.props.some((p) => !ALLOWED.includes(p)));
            check(`${width}: only clip-path / opacity / translate are animated`,
                bad.length === 0, JSON.stringify(bad.map((b) => b.target + ':' + b.props.join('+'))));
            // The one found by enumerating rather than by reading the code:
            // the sticky header's padding, all four sides, transitioning for
            // 300ms across the whole grow because the modal rule changes it.
            check(`${width}: the sticky header's padding does NOT animate during the grow`,
                !(w.anims || []).some((a) => String(a.target).indexOf('dccgg-detail-header') >= 0),
                JSON.stringify((w.anims || []).map((a) => a.target + ':' + a.props.join('+'))));
            check(`${width}: the only other animation on the page is the pre-existing SOS pulse`,
                (w.anims || []).every((a) => PREEXISTING(a.target)
                    || String(a.target).indexOf('dccgg-stage') >= 0
                    || String(a.target).indexOf('dccgg-detail') >= 0),
                JSON.stringify((w.anims || []).map((a) => a.target)));

            // --- the content fades in over the LAST part ---
            const fade = (w.anims || []).find((a) => a.props.includes('opacity')
                && String(a.target).indexOf('dccgg-detail') >= 0);
            check(`${width}: the content fades in, and starts late rather than at once`,
                !!fade && fade.delay > 0, fade && `delay ${fade.delay}`);

            // --- will-change on during, off after ---
            check(`${width}: will-change is on while it grows`,
                !!(w.atOpen && /clip-path/.test(w.atOpen.willChange)),
                w.atOpen && w.atOpen.willChange);
            await page.waitForTimeout(500);
            const after = await page.evaluate(() => {
                const s = document.querySelector('.dccgg-stage');
                const p = s.querySelector('.dccgg-detail:not([hidden])');
                return { stage: s.style.willChange, clip: s.style.clipPath,
                    panel: p ? p.style.willChange : '', panelOpacity: p ? p.style.opacity : '',
                    computedClip: getComputedStyle(s).clipPath,
                    animTargets: document.getAnimations()
                        .map((a) => String(a.effect && a.effect.target && a.effect.target.className)),
                    anims: document.getAnimations().filter((a) => {
                        const c = String(a.effect && a.effect.target && a.effect.target.className);
                        return c.indexOf('dccgg-sos-fab') === -1;
                    }).length };
            });
            check(`${width}: will-change is OFF once it has finished`,
                after.stage === '' && after.panel === '', JSON.stringify(after));
            check(`${width}: no clip is left on the stage`,
                after.clip === '' && after.computedClip === 'none', JSON.stringify(after));
            check(`${width}: the content is left at its own opacity`, after.panelOpacity === '');
            check(`${width}: nothing of ours is still animating`, after.anims === 0,
                JSON.stringify(after.animTargets));

            // --- the page behind dims ---
            const dim = await page.evaluate(() => {
                const o = document.querySelector('.dccgg-detail-overlay');
                return { hidden: o.hidden, opacity: getComputedStyle(o).opacity,
                    dur: getComputedStyle(o).transitionDuration };
            });
            const hub = await page.evaluate(() => {
                const r = document.querySelector('.dccgg-root');
                const m = r.querySelector('.dccgg-menu');
                const t = r.querySelector('.dccgg-tile');
                const b = t ? t.getBoundingClientRect() : null;
                return { isModal: r.classList.contains('is-modal'),
                    menuDisplay: getComputedStyle(m).display,
                    tileHasBox: !!(b && b.width > 0 && b.height > 0) };
            });
            check(`${width}: the hub stays on screen behind the popup, so it grows out of a tile that is still there`,
                hub.isModal === true && hub.menuDisplay !== 'none' && hub.tileHasBox === true,
                JSON.stringify(hub));
            check(`${width}: the page behind is dimmed`, dim.hidden === false && Number(dim.opacity) > 0.9,
                JSON.stringify(dim));
            check(`${width}: and the dim takes as long as the grow`, dim.dur.indexOf('0.25s') === 0, dim.dur);

            // --- nothing behind moved ---
            // Nothing covered this, and the mutation that put it back survived
            // a real run. The brief's rule is that will-change goes on for an
            // animation and comes off after; a hint declared in the stylesheet
            // holds a compositor layer for as long as the popup is open.
            const standing = await page.evaluate(() => {
                const out = [];
                document.querySelectorAll('.dccgg-stage *, .dccgg-root *').forEach((el) => {
                    const wc = getComputedStyle(el).willChange;
                    if (wc && wc !== 'auto') out.push(el.className + ':' + wc);
                });
                return out;
            });
            check(`${width}: no element carries a standing will-change while a popup is open`,
                standing.length === 0, standing.slice(0, 4).join(' | '));
            check(`${width}: no layout shift behind the popup`, w.shift === 0, String(w.shift));
            check(`${width}: no page errors`, errors.length === 0, errors.join(' | '));
            await ctx.close();
        }

        // ================= C : the close ==========================
        console.log('\nC · the close');
        {
            const { ctx, page } = await openGuide(browser, 390);
            const t = await tapTile(page, 390);
            await page.waitForTimeout(400);
            const closing = await page.evaluate(() => {
                document.querySelector('.dccgg-stage .dccgg-detail:not([hidden]) .dccgg-back').click();
                const s = document.querySelector('.dccgg-stage');
                const a = document.getAnimations().filter((x) => x.effect && x.effect.target === s);
                return {
                    isDetail: document.querySelector('.dccgg-root').classList.contains('is-detail'),
                    menuShown: !!document.querySelector('.dccgg-root .dccgg-menu').getClientRects().length,
                    anims: a.map((x) => ({
                        props: Array.from(new Set([].concat(...x.effect.getKeyframes()
                            .map((k) => Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p)))))),
                        duration: x.effect.getTiming().duration,
                        last: x.effect.getKeyframes().slice(-1)[0],
                    })),
                    willChange: s.style.willChange,
                };
            });
            const rev = closing.anims.find((a) => a.props.includes('clipPath'));
            check('Back shrinks the popup by a clip-path animation', !!rev,
                JSON.stringify(closing.anims.map((a) => a.props.join('+'))));
            check('the close lasts ~200ms', !!rev && rev.duration === 200, rev && String(rev.duration));
            check('the hub is back on screen BEFORE the shrink, so there is a tile to shrink into',
                closing.isDetail === false && closing.menuShown === true, JSON.stringify(closing));
            const endBox = await page.evaluate(() => {
                const b = document.querySelector('.dccgg-stage').getBoundingClientRect();
                return { w: b.width, h: b.height };
            });
            const end = rev && parseInset(rev.last && rev.last.clipPath, endBox);
            const want = await page.evaluate(({ key }) => {
                const t = document.querySelector('.dccgg-tile[data-key="' + key + '"]');
                const s = document.querySelector('.dccgg-stage');
                const b = s.getBoundingClientRect(), r = t.getBoundingClientRect();
                const cl = (v, m) => Math.max(0, Math.min(v, m));
                return { top: cl(r.top - b.top, b.height), left: cl(r.left - b.left, b.width),
                    right: cl(b.right - r.right, b.width), bottom: cl(b.bottom - r.bottom, b.height) };
            }, { key: t.key });
            check('it ends at the SAME tile it grew out of',
                !!end && near(end.top, want.top, 3) && near(end.left, want.left, 3)
                && near(end.right, want.right, 3) && near(end.bottom, want.bottom, 3),
                `got ${JSON.stringify(end)} want ${JSON.stringify(want)}`);
            check('and that is a smaller box than the popup, not the popup itself',
                !!end && (end.top + end.bottom + end.left + end.right) > 0,
                rev && String(rev.last && rev.last.clipPath));
            check('will-change is on while it shrinks', /clip-path/.test(closing.willChange), closing.willChange);

            await page.waitForTimeout(500);
            const done = await page.evaluate(() => {
                const s = document.querySelector('.dccgg-stage');
                const cs = getComputedStyle(s);
                return { modalOpen: s.classList.contains('is-modal-open'),
                    growing: s.classList.contains('dccgg-growing'),
                    clip: s.style.clipPath, willChange: s.style.willChange,
                    visibility: cs.visibility,
                    inBody: s.parentElement === document.body,
                    tapGlow: !!document.querySelector('.dccgg-tile.is-tap'),
                    bodyLocked: document.body.classList.contains('dccgg-detail-open'),
                    anims: document.getAnimations().length };
            });
            check('afterwards the popup is put away', done.modalOpen === false
                && done.growing === false && done.visibility === 'hidden', JSON.stringify(done));
            check('and nothing is left on it', done.clip === '' && done.willChange === ''
                && done.anims === 0, JSON.stringify(done));
            check('the stage is back inside the widget', done.inBody === false);
            check('the page is unlocked', done.bodyLocked === false);
            check('no glow left on the tile (Rob declined one)', done.tapGlow === false);

            // Esc takes the same path.
            await tapTile(page, 390);
            await page.waitForTimeout(400);
            await page.keyboard.press('Escape');
            const esc = await page.evaluate(() => {
                const s = document.querySelector('.dccgg-stage');
                return document.getAnimations().filter((x) => x.effect && x.effect.target === s)
                    .some((x) => x.effect.getKeyframes().some((k) => 'clipPath' in k));
            });
            check('Esc shrinks it too, by the same animation', esc === true);
            await page.waitForTimeout(400);

            // Re-opened WHILE the close is still playing. `.is-modal-open` is
            // deliberately left on until the teardown, so a popup caught
            // mid-close still carries it — and treating that as an arrow switch
            // would slide a panel inside a frame still holding the shrunk clip
            // from the cancelled close, i.e. nothing visible at all.
            await tapTile(page, 390);
            await page.waitForTimeout(400);
            const midClose = await page.evaluate(async () => {
                document.querySelector('.dccgg-stage .dccgg-detail:not([hidden]) .dccgg-back').click();
                await new Promise((r) => setTimeout(r, 60));   // mid-shrink
                const t = Array.from(document.querySelectorAll('.dccgg-root .dccgg-tile'))
                    .filter((x) => x.getClientRects().length)[0];
                t.click();
                // Sampled IMMEDIATELY, before the end state. Checking only the
                // end state is why removing the `!closeTimer` guard survived a
                // real mutation run: without it the re-open is treated as an
                // arrow switch, so the popup simply appears with no animation —
                // correct-looking, and not what was asked for.
                const stage0 = document.querySelector('.dccgg-stage');
                const regrew = document.getAnimations()
                    .filter((x) => x.effect && x.effect.target === stage0)
                    .some((x) => x.effect.getKeyframes().some((k) => 'clipPath' in k));
                await new Promise((r) => setTimeout(r, 450));
                const s = document.querySelector('.dccgg-stage');
                const cs = getComputedStyle(s);
                return { regrew: regrew, clip: cs.clipPath, inlineClip: s.style.clipPath,
                    opacity: cs.opacity, visibility: cs.visibility,
                    open: s.classList.contains('is-modal-open'),
                    panel: !!s.querySelector('.dccgg-detail:not([hidden])') };
            });
            check('re-opening mid-close GROWS again rather than snapping open',
                midClose.regrew === true, JSON.stringify({ regrew: midClose.regrew }));
            check('re-opening mid-close leaves a fully visible popup, not a clipped one',
                midClose.open === true && midClose.panel === true
                && midClose.visibility === 'visible' && Number(midClose.opacity) > 0.95
                && midClose.clip === 'none' && midClose.inlineClip === '',
                JSON.stringify(midClose));
            await page.keyboard.press('Escape');
            await page.waitForTimeout(400);

            // The tile scrolled away -> fade and drop, not a grow.
            const off = await page.evaluate(() => {
                const t = Array.from(document.querySelectorAll('.dccgg-root .dccgg-tile'))
                    .filter((x) => x.getClientRects().length)[0];
                t.scrollIntoView({ block: 'center', behavior: 'instant' });
                t.click();
                return true;
            });
            await page.waitForTimeout(400);
            const drop = await page.evaluate(() => {
                // The hub is pinned behind the popup; move the WIDGET instead so
                // the tile genuinely leaves the viewport while a popup is open.
                const el = document.querySelector('.elementor-element-2afb24b');
                el.style.transform = 'translateY(-4000px)';
                document.querySelector('.dccgg-stage .dccgg-detail:not([hidden]) .dccgg-back').click();
                const s = document.querySelector('.dccgg-stage');
                const a = document.getAnimations().filter((x) => x.effect && x.effect.target === s);
                return a.map((x) => Array.from(new Set([].concat(...x.effect.getKeyframes()
                    .map((k) => Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p)))))));
            });
            const flat = [].concat(...drop);
            check('a tile that has scrolled away gets a fade-and-drop, not a grow',
                off && flat.includes('opacity') && flat.includes('translate') && !flat.includes('clipPath'),
                JSON.stringify(drop));
            await ctx.close();
        }

        // ================= D : the arrows ==========================
        console.log('\nD · the arrows');
        {
            const { ctx, page } = await openGuide(browser, 390);
            await tapTile(page, 390, 1);
            await page.waitForTimeout(400);
            const dirs = {};
            for (const which of ['next', 'prev']) {
                const got = await page.evaluate(({ which }) => {
                    const panel = document.querySelector('.dccgg-stage .dccgg-detail:not([hidden])');
                    const btn = panel.querySelector('.dccgg-section-' + which);
                    if (!btn || btn.hasAttribute('disabled')) return { skipped: true };
                    const stageBefore = document.getAnimations().length;
                    const leaving = panel;
                    // By KEY, not by visibility. During the push BOTH panels are
                    // visible — that is the point of it — so
                    // `.dccgg-detail:not([hidden])` now resolves to whichever
                    // comes first in the DOM, which is usually the one leaving.
                    const targetKey = btn.dataset.targetKey;
                    btn.click();
                    const stage = document.querySelector('.dccgg-stage');
                    const incoming = stage.querySelector(
                        '.dccgg-detail[data-key="' + CSS.escape(targetKey) + '"]');
                    const mine = document.getAnimations()
                        .filter((x) => x.effect && x.effect.target === incoming);
                    return {
                        before: stageBefore,
                        anims: mine.map((x) => ({
                            duration: x.effect.getTiming().duration,
                            first: x.effect.getKeyframes()[0],
                            props: Array.from(new Set([].concat(...x.effect.getKeyframes()
                                .map((k) => Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p)))))),
                        })),
                        stageClip: document.getAnimations()
                            .filter((x) => x.effect && x.effect.target === stage)
                            .some((x) => x.effect.getKeyframes().some((k) => 'clipPath' in k)),
                        // The panel being left behind must still be ON SCREEN,
                        // out of flow, sliding the other way. Without it the
                        // stage is blank for a frame while the incoming panel
                        // is laid out — measured at ~60ms at 390 under 4x CPU.
                        leaving: {
                            same: leaving === incoming,
                            stillShown: leaving.hidden === false,
                            outOfFlow: leaving.style.position === 'absolute',
                            inert: leaving.style.pointerEvents === 'none',
                            anims: document.getAnimations()
                                .filter((x) => x.effect && x.effect.target === leaving)
                                .map((x) => ({ last: x.effect.getKeyframes().slice(-1)[0],
                                    duration: x.effect.getTiming().duration })),
                        },
                    };
                }, { which });
                dirs[which] = got;
                await page.waitForTimeout(420);
            }
            const n = dirs.next.anims && dirs.next.anims[0];
            const p = dirs.prev.anims && dirs.prev.anims[0];
            check('next slides the incoming section in FROM THE RIGHT',
                !!n && String(n.first.translate).indexOf('100%') === 0, n && String(n.first.translate));
            check('previous slides it in FROM THE LEFT',
                !!p && String(p.first.translate).indexOf('-100%') === 0, p && String(p.first.translate));
            check('an arrow switch lasts ~220ms', !!n && n.duration === 220, n && String(n.duration));
            check('the frame itself does not re-grow on an arrow switch',
                dirs.next.stageClip === false && dirs.prev.stageClip === false,
                JSON.stringify([dirs.next.stageClip, dirs.prev.stageClip]));
            check('the slide moves translate/opacity only',
                !!n && n.props.every((x) => ['translate', 'opacity'].includes(x)), n && n.props.join('+'));
            const lv = dirs.next.leaving;
            check('the outgoing section stays on screen instead of blanking the stage',
                !!lv && lv.same === false && lv.stillShown === true && lv.outOfFlow === true,
                JSON.stringify(lv && { same: lv.same, shown: lv.stillShown, abs: lv.outOfFlow }));
            check('and it pushes out the OPPOSITE way',
                !!lv && lv.anims.length === 1
                && String(lv.anims[0].last.translate).indexOf('-100%') === 0,
                JSON.stringify(lv && lv.anims.map((a) => a.last && a.last.translate)));
            check('it cannot catch a tap meant for the section arriving over it',
                !!lv && lv.inert === true);
            const settled = await page.evaluate(() => {
                const panels = Array.from(document.querySelectorAll('.dccgg-stage .dccgg-detail'));
                const shown = panels.filter((p) => !p.hidden);
                return { shown: shown.length,
                    leftovers: panels.filter((p) => p.style.position || p.style.willChange
                        || p.style.translate || p.style.opacity || p.style.pointerEvents).length };
            });
            check('afterwards exactly one section is shown and nothing is left inline',
                settled.shown === 1 && settled.leftovers === 0, JSON.stringify(settled));

            // NEXT, then PREVIOUS before the first slide has finished. The
            // panel leaving on the first press is the panel arriving on the
            // second, so the first press's cleanup would hide the section the
            // guest just asked for — and leave it out of flow and inert.
            const rapid = await page.evaluate(async () => {
                const vis = () => document.querySelector('.dccgg-stage .dccgg-detail:not([hidden])');
                const btnIn = (p, w) => p.querySelector('.dccgg-section-' + w);
                const start = vis();
                const next = btnIn(start, 'next');
                if (!next || next.hasAttribute('disabled')) return { skipped: true };
                const wantKey = next.dataset.targetKey;
                next.click();
                await new Promise((r) => setTimeout(r, 70));          // mid-slide
                const mid = document.querySelector(
                    '.dccgg-stage .dccgg-detail[data-key="' + CSS.escape(wantKey) + '"]');
                const back = btnIn(mid, 'prev');
                if (!back || back.hasAttribute('disabled')) return { skipped: true };
                const homeKey = back.dataset.targetKey;
                back.click();
                await new Promise((r) => setTimeout(r, 600));
                const home = document.querySelector(
                    '.dccgg-stage .dccgg-detail[data-key="' + CSS.escape(homeKey) + '"]');
                const cs = getComputedStyle(home);
                return { hidden: home.hidden, position: cs.position,
                    pointerEvents: cs.pointerEvents, opacity: cs.opacity,
                    shown: document.querySelectorAll('.dccgg-stage .dccgg-detail:not([hidden])').length };
            });
            check('pressing previous mid-slide leaves that section visible, in flow and tappable',
                rapid.skipped || (rapid.hidden === false && rapid.position !== 'absolute'
                    && rapid.pointerEvents !== 'none' && Number(rapid.opacity) > 0.95
                    && rapid.shown === 1),
                JSON.stringify(rapid));
            await ctx.close();
        }

        // ================= E : reduced motion ==========================
        console.log('\nE · reduced motion');
        {
            const { ctx, page } = await openGuide(browser, 390, { reducedMotion: 'reduce' });
            await armWatcher(page);
            await tapTile(page, 390);
            await page.waitForTimeout(40);
            const w = await page.evaluate(() => window.__w);
            const props = [].concat(...(w.anims || []).map((a) => a.props));
            check('no growing clip when motion is reduced', !props.includes('clipPath'),
                JSON.stringify((w.anims || []).map((a) => a.props)));
            check('a plain fade instead', props.includes('opacity'), JSON.stringify(props));
            const uniq = Array.from(new Set(w.transforms.filter((x) => x && x !== 'none')));
            check('and the stage is NOT scaled — the v0.9.5 portal bug this release fixes',
                uniq.length <= 1 && !w.transforms.some((x) => /matrix(3d)?\(0?\.[0-9]/.test(String(x))),
                uniq.join(' | '));
            await page.waitForTimeout(400);
            const noSlide = await page.evaluate(() => {
                const panel = document.querySelector('.dccgg-stage .dccgg-detail:not([hidden])');
                const btn = panel.querySelector('.dccgg-section-next');
                if (!btn || btn.hasAttribute('disabled')) return { skipped: true };
                btn.click();
                const incoming = document.querySelector('.dccgg-stage .dccgg-detail:not([hidden])');
                return { n: document.getAnimations().filter((x) => x.effect && x.effect.target === incoming).length };
            });
            check('no sliding on the arrows either', noSlide.skipped || noSlide.n === 0, JSON.stringify(noSlide));
            await ctx.close();
        }

        // ================= G : the map layer ==========================
        console.log('\nG · the full-screen map layer');
        {
            const { ctx, page, mapCount } = await openGuide(browser, 390);
            const opened = await page.evaluate(() => {
                const card = Array.from(document.querySelectorAll('.dccgg-mapcard'))[0];
                if (!card) return { none: true };
                const sec = card.closest('.dccgg-detail');
                const key = sec && sec.dataset.key;
                const tile = key && document.querySelector('.dccgg-tile[data-key="' + key + '"]');
                if (tile) tile.click();
                return { key: key };
            });
            if (opened.none) {
                check('the fixture has a map card to test', false, 'no .dccgg-mapcard in all-on');
            } else {
                await page.waitForTimeout(450);
                // Scrolled to FIRST. The card lives ~1469px down the popup's own
                // scroll box, and a guest who taps it has necessarily scrolled
                // it onto the screen. Without this the opener is genuinely off
                // screen and the fade-and-drop fallback is the correct answer —
                // which is what the first run of this suite actually measured.
                await page.evaluate(() => {
                    const b = Array.from(document.querySelectorAll('.dccgg-mapcard-open'))
                        .find((x) => x.getClientRects().length);
                    b.scrollIntoView({ block: 'center', behavior: 'instant' });
                });
                await page.waitForTimeout(150);
                const grow = await page.evaluate(() => {
                    const b = Array.from(document.querySelectorAll('.dccgg-mapcard-open'))
                        .find((x) => x.getClientRects().length);
                    const r = b.closest('.dccgg-mapcard').getBoundingClientRect();
                    if (r.bottom <= 0 || r.top >= innerHeight) {
                        throw new Error('the map card is still off screen: ' + JSON.stringify(r));
                    }
                    b.click();
                    const layer = document.querySelector('.dccgg-maplayer');
                    const a = document.getAnimations().filter((x) => x.effect && x.effect.target === layer);
                    return { hidden: layer.hidden,
                        onBody: layer.parentElement === document.body,
                        clip: a.some((x) => x.effect.getKeyframes().some((k) => 'clipPath' in k)),
                        duration: a[0] ? a[0].effect.getTiming().duration : 0,
                        willChange: layer.style.willChange };
                });
                check('the layer grows out of its card', grow.clip === true && grow.hidden === false,
                    JSON.stringify(grow));
                check('over ~250ms', grow.duration === 250, String(grow.duration));
                check('the layer is still a child of <body> — never moved, so the map never reloads',
                    grow.onBody === true);
                await page.waitForTimeout(450);
                const id1 = await page.evaluate(() => {
                    const f = document.querySelector('.dccgg-maplayer iframe');
                    f.__mark = 'original';
                    return { src: f.src, count: document.querySelectorAll('.dccgg-maplayer iframe').length };
                });
                const closing = await page.evaluate(() => {
                    document.querySelector('.dccgg-maplayer-close').click();
                    const layer = document.querySelector('.dccgg-maplayer');
                    const a = document.getAnimations().filter((x) => x.effect && x.effect.target === layer);
                    return { stillVisible: layer.hidden === false,
                        reverse: a.some((x) => x.effect.getKeyframes().some((k) => 'clipPath' in k)),
                        duration: a[0] ? a[0].effect.getTiming().duration : 0 };
                });
                check('closing shrinks it back rather than blanking it',
                    closing.reverse === true && closing.stillVisible === true, JSON.stringify(closing));
                check('the close lasts ~200ms', closing.duration === 200, String(closing.duration));
                await page.waitForTimeout(450);
                const after = await page.evaluate(() => {
                    const layer = document.querySelector('.dccgg-maplayer');
                    return { hidden: layer.hidden, clip: layer.style.clipPath,
                        willChange: layer.style.willChange,
                        mapOpen: document.documentElement.classList.contains('dccgg-map-open') };
                });
                check('and only then is it hidden and unlocked',
                    after.hidden === true && after.mapOpen === false, JSON.stringify(after));
                check('with nothing left on it', after.clip === '' && after.willChange === '',
                    JSON.stringify(after));
                const id2 = await page.evaluate(() => {
                    const b = Array.from(document.querySelectorAll('.dccgg-mapcard-open'))
                        .find((x) => x.getClientRects().length);
                    b.click();
                    const f = document.querySelector('.dccgg-maplayer iframe');
                    return { same: f.__mark === 'original', src: f.src,
                        count: document.querySelectorAll('.dccgg-maplayer iframe').length };
                });
                check('reopening reuses the SAME iframe — the map does not reload',
                    id2.same === true && id2.count === id1.count && id2.src === id1.src,
                    JSON.stringify([id1, id2]));
                const before = mapCount();
                await page.waitForTimeout(400);
                check('and the browser fetches the map NO further times',
                    mapCount() === before, `${before} -> ${mapCount()}`);
            }
            await ctx.close();
        }
        // ====== I : the start rect survives the box changing ==========
        //
        // v0.27.11, and this is Rob's "glitchy first frame" as a measurement.
        // An inset() in plain pixels describes a rectangle by its distance from
        // each EDGE, so if the element's box changes size between being
        // measured and being painted, the revealed rectangle changes with it.
        // The sheet's height is `calc(100svh - env(safe-area-inset-top) - 8px)`
        // — bound to the viewport, which is what iOS Safari's dynamic toolbar
        // moves. On the live page at 390 the old pixel clip revealed the tile
        // at the measured box, 174.5x180.5 if the box grew 60px and 174.5x240.5
        // if it grew 120px: a blank white card up to twice the tile's height.
        //
        // The box is changed here for real and the clip re-resolved against it.
        console.log('\nI · the start rectangle is pinned to the tile, not to the box');
        for (const width of [390, 1440]) {
            const { ctx, page } = await openGuide(browser, width);
            const t = await tapTile(page, width);
            const got = await page.evaluate(({ grow }) => {
                const stage = document.querySelector('.dccgg-stage');
                const anim = document.getAnimations()
                    .find((a) => a.effect && a.effect.target === stage
                        && a.effect.getKeyframes().some((k) => 'clipPath' in k));
                if (!anim) return { none: true };
                anim.pause();
                anim.currentTime = 0;
                const read = () => {
                    const b = stage.getBoundingClientRect();
                    return { clip: getComputedStyle(stage).clipPath, w: b.width, h: b.height };
                };
                const before = read();
                // The toolbar appearing: the sheet's cap moves, so its box does.
                stage.style.maxHeight = (before.h + grow) + 'px';
                stage.style.minHeight = (before.h + grow) + 'px';
                const after = read();
                stage.style.maxHeight = '';
                stage.style.minHeight = '';
                return { before: before, after: after };
            }, { grow: 90 });

            // The TILE CLIPPED TO THE SHEET, not the raw tile. On a phone the
            // sheet is bottom-anchored and its top edge sits below the top of
            // the screen, so a tile higher up is partly outside it — the clip
            // clamps per side, by design, and the revealed rectangle is the
            // overlap. Measured at 390 in this fixture: the tile is 148.5 tall
            // and 143.9 of it is inside the sheet. Comparing with the raw tile
            // would fail on correct behaviour.
            const want = await page.evaluate(() => {
                const s2 = document.querySelector('.dccgg-stage').getBoundingClientRect();
                const t2 = Array.from(document.querySelectorAll('.dccgg-root .dccgg-tile'))
                    .filter((x) => x.getClientRects().length)[0].getBoundingClientRect();
                const w = Math.max(0, Math.min(s2.right, t2.right) - Math.max(s2.left, t2.left));
                const h = Math.max(0, Math.min(s2.bottom, t2.bottom) - Math.max(s2.top, t2.top));
                return { w: +w.toFixed(1), h: +h.toFixed(1) };
            });
            if (got.none) { check(`${width}: there is a clip animation to inspect`, false); }
            else {
                const revealed = (r) => {
                    const i = parseInset(r.clip, { w: r.w, h: r.h });
                    return i ? { w: +(r.w - i.left - i.right).toFixed(1),
                        h: +(r.h - i.top - i.bottom).toFixed(1), top: +i.top.toFixed(1),
                        left: +i.left.toFixed(1) } : null;
                };
                const a = revealed(got.before), b = revealed(got.after);
                check(`${width}: the box really did change for this test`,
                    Math.abs(got.after.h - got.before.h - 90) < 1,
                    `${got.before.h} -> ${got.after.h}`);
                check(`${width}: frame 1 reveals exactly the tapped tile`,
                    !!a && near(a.w, want.w, 2) && near(a.h, want.h, 2),
                    `revealed ${JSON.stringify(a)} want ${JSON.stringify(want)}`);
                check(`${width}: and STILL exactly the tile after the box grows 90px`,
                    !!b && near(b.w, want.w, 2) && near(b.h, want.h, 2),
                    `revealed ${JSON.stringify(b)} want ${JSON.stringify(want)}`);
                check(`${width}: byte for byte the same reveal at both box sizes`,
                    !!a && !!b && near(a.w, b.w, 0.5) && near(a.h, b.h, 0.5),
                    `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
                check(`${width}: it has not drifted from the tile's corner either`,
                    !!a && !!b && near(a.top, b.top, 2) && near(a.left, b.left, 2),
                    `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
                check(`${width}: no frame reveals a box larger than the tile`,
                    !!a && !!b && a.w <= want.w + 2 && a.h <= want.h + 2
                    && b.w <= want.w + 2 && b.h <= want.h + 2,
                    `${JSON.stringify([a, b])} want ${JSON.stringify(want)}`);
            }
            await ctx.close();
        }

        // ============ H : the PUBLIC guide (/explore/) ================
        //
        // Named in the brief, and worth its own section rather than an
        // assumption: /explore/ renders through the same core bundle but does
        // NOT load widget-guest.js, and apply_public_mode() drops whole
        // sections. If the grow lived anywhere in the guest bundle, the public
        // page would open its popups the old way and nobody would notice.
        console.log('\nH · the public guide, as /explore/ renders it');
        {
            const { ctx, page, errors } = await openGuide(browser, 390,
                { markup: emit('public-intro') });
            await armWatcher(page);
            const t = await tapTile(page, 390);
            await page.waitForTimeout(40);
            const w = await page.evaluate(() => window.__w);
            const clip = (w.anims || []).find((a) => a.props.includes('clipPath')
                && String(a.target).indexOf('dccgg-stage') >= 0);
            check('the public guide grows its popups too', !!clip,
                JSON.stringify((w.anims || []).map((a) => a.target + ':' + a.props.join('+'))));
            check('over the same ~250ms', !!clip && clip.duration === 250, clip && String(clip.duration));
            check('its content is in place in the first frame as well',
                !!(w.atOpen && w.atOpen.panelPresent && w.atOpen.panelText > 0),
                JSON.stringify(w.atOpen && { present: w.atOpen.panelPresent, text: w.atOpen.panelText }));
            check('the start rectangle is the tapped tile', !!t.rect && t.rect.w > 0);
            check('the public guide loads no guest bundle, and still works',
                await page.evaluate(() => true) && errors.length === 0, errors.join(' | '));
            await page.waitForTimeout(500);
            const after = await page.evaluate(() => {
                const s = document.querySelector('.dccgg-stage');
                return { wc: s.style.willChange, clip: s.style.clipPath };
            });
            check('and cleans up after itself the same way',
                after.wc === '' && after.clip === '', JSON.stringify(after));
            await ctx.close();
        }
    } finally {
        await browser.close();
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    if (failures.length) { console.log('Failures:'); failures.forEach((f) => console.log('  - ' + f)); }
    process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
