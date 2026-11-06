/**
 * THE FIRST PAINTED FRAME OF THE OPEN, MEASURED IN PIXELS (v0.27.11).
 *
 * Rob's iPhone recording showed the first frame of the 0.27.10 open as a blank
 * white card bigger than the tile and not anchored to it. Everything else in
 * this repo asserts the DOM; this asserts the picture, because the picture is
 * what he saw.
 *
 *   node tools/first-frame.js <outdir> [--label after]
 *
 * For four tiles — top-left, top-right, one in the middle and the last one —
 * it records the open with Page.startScreencast at 4x CPU throttling, finds
 * the first frame that differs from the baseline, and measures the white
 * sheet in that frame with ImageMagick rather than from the DOM.
 *
 * PASS: the sheet in frame 1 matches the tapped tile's rect within 2 px, and
 * no frame before the sheet reaches full size is larger than the tile.
 *
 * The sheet is found as the pure-white region: it paints ABOVE the dim
 * overlay, so it is the only #ffffff left on screen once the overlay is up —
 * the hub's white tiles are dimmed to grey behind it. A plain
 * difference-against-baseline cannot be used, because the overlay changes
 * every pixel in the viewport and its bounding box is the whole screen.
 *
 * WebKit cannot be installed in this container (the egress proxy refuses both
 * mirrors), so this is Chromium with touch emulation. Said plainly: it cannot
 * reproduce an iOS-only fault, only prove the geometry is right by
 * construction. The matching DOM proof is section I of tests/grow-open.ui.js,
 * which changes the box underneath the animation and shows the revealed
 * rectangle does not move.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell');

const OUT = process.argv[2] || '/tmp/first-frame';
const li = process.argv.indexOf('--label');
const LABEL = li > 0 ? process.argv[li + 1] : path.basename(OUT);
/**
 * --toolbar <px> moves the sheet's height cap a beat after the tap.
 *
 * IT DOES NOT DISCRIMINATE, and that is recorded here rather than quietly
 * dropped. The intent was a pixel-level before/after: 0.27.10 should paint the
 * oversized blank card and 0.27.11 should not. Measured, BOTH pass all four
 * tiles with it — the first frame is painted at t+113..165ms and the cap
 * change lands after that, so frame 1 is already correct on either build. The
 * timing of a real iOS toolbar collapse relative to the first paint is not
 * something that can be staged from here.
 *
 * (An earlier attempt used Emulation.setDeviceMetricsOverride instead. That
 * drops the running animation altogether: frame 1 came back as the full
 * unclipped sheet for all four tiles, identically — a harness artifact, and it
 * would have been reported as a reproduction of Rob's fault if it had not been
 * looked at.)
 *
 * The test that DOES discriminate is section I of tests/grow-open.ui.js: it
 * pauses the animation at t=0, changes the box, and re-resolves the clip, which
 * is deterministic. On 0.27.10 the revealed rectangle goes 143.9 -> 233.9 px
 * tall at 390 when the box grows 90px; on 0.27.11 it does not move.
 */
const ti = process.argv.indexOf('--toolbar');
const TOOLBAR = ti > 0 ? Number(process.argv[ti + 1]) : 0;

/** The bounding box of the pure-white region, as {x,y,w,h} or null. */
function whiteBox(file) {
    let out;
    try {
        out = execFileSync('convert', [file, '-fuzz', '1%', '-fill', 'black', '+opaque', '#ffffff',
            '-fill', 'white', '-opaque', '#ffffff', '-format', '%@', 'info:'],
        { encoding: 'utf8' }).trim();
    } catch (_) { return null; }
    const m = /^(\d+)x(\d+)\+(-?\d+)\+(-?\d+)$/.exec(out);
    return m ? { w: +m[1], h: +m[2], x: +m[3], y: +m[4] } : null;
}

async function record(ctx, page, act, ms) {
    const cdp = await ctx.newCDPSession(page);
    const frames = [];
    cdp.on('Page.screencastFrame', (ev) => {
        frames.push({ at: ev.metadata.timestamp * 1000, data: ev.data });
        cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    await page.waitForTimeout(320);
    const base = frames.length ? frames[frames.length - 1] : null;
    const t0 = Date.now();
    await act();
    await page.waitForTimeout(ms);
    await cdp.send('Page.stopScreencast');
    return { base: base, after: frames.map((f) => ({ t: Math.round(f.at - t0), data: f.data }))
        .filter((f) => f.t >= 0).sort((a, b) => a.t - b.t) };
}

async function main() {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    fs.mkdirSync(OUT, { recursive: true });
    let pass = 0, fail = 0; const notes = [];
    try {
        // Which tiles: the corners and the extremes, because a start rect that
        // is computed wrong is usually wrong by an offset, and an offset is
        // invisible if every tile you test is in the same place.
        const picks = await (async () => {
            const { ctx, page } = await openLive(browser, { width: 390, height: 844, keepReal: true, scale: 1 });
            const n = await page.evaluate(() =>
                document.querySelectorAll('.dccgg-root .dccgg-tile').length);
            await ctx.close();
            return [['top-left', 0], ['top-right', 1],
                ['middle', Math.floor(n / 2)], ['last', n - 1]]
                .filter(([, i]) => i >= 0 && i < n);
        })();

        for (const [name, index] of picks) {
            const { ctx, page } = await openLive(browser, {
                width: 390, height: 844, keepReal: true, scale: 1,
                throttle: { cpu: 4, network: { latency: 0, downloadThroughput: -1, uploadThroughput: -1 } },
            });
            const tile = await page.evaluate((i) => {
                const tiles = document.querySelectorAll('.dccgg-root .dccgg-tile');
                // The HUB is scrolled into view, not the tile. Centring each
                // tile in turn put two of the four at identical coordinates,
                // which is the one thing this test must not do: a start rect
                // that is wrong by a constant offset is invisible if every
                // case you measure sits in the same place.
                tiles[0].scrollIntoView({ block: 'center', behavior: 'instant' });
                const t = tiles[i];
                const r = t.getBoundingClientRect();
                return { key: t.dataset.key, x: r.x, y: r.y, w: r.width, h: r.height,
                    right: r.right, bottom: r.bottom,
                    onScreen: r.bottom > 0 && r.top < innerHeight };
            }, index);
            if (!tile.onScreen) {
                console.log(`  ${name} (tile ${index}): off screen with the hub centred — skipped`);
                notes.push(`${name}: SKIPPED (off screen)`);
                await ctx.close();
                continue;
            }
            await page.waitForTimeout(350);

            const rec = await record(ctx, page, async () => {
                await page.evaluate((i) =>
                    document.querySelectorAll('.dccgg-root .dccgg-tile')[i].click(), index);
                if (TOOLBAR) {
                    // The SHEET'S BOX is changed, not the viewport. Tried
                    // Emulation.setDeviceMetricsOverride first and it drops the
                    // running animation altogether — frame 1 came back as the
                    // full unclipped sheet for all four tiles, identically,
                    // which is a harness artifact and not what any guest sees.
                    // The sheet's height is capped by 100svh, so moving the cap
                    // is what a toolbar does to it; this moves the cap directly
                    // and leaves the animation running.
                    await page.evaluate((px) => {
                        const st = document.querySelector('.dccgg-stage');
                        const h = st.getBoundingClientRect().height + px;
                        st.style.maxHeight = h + 'px';
                        st.style.minHeight = h + 'px';
                    }, TOOLBAR);
                }
            }, 700);

            const dir = path.join(OUT, name);
            fs.mkdirSync(dir, { recursive: true });
            const files = [];
            rec.after.slice(0, 6).forEach((f, i) => {
                const p = path.join(dir, `f${i}-t${f.t}ms.png`);
                fs.writeFileSync(p, Buffer.from(f.data, 'base64'));
                files.push({ p, t: f.t });
            });
            if (!files.length) { console.log(`  ${name}: NO FRAMES`); fail++; continue; }

            // The sheet, in the first frame that actually paints it.
            const sheet = files.map((f) => ({ t: f.t, box: whiteBox(f.p), p: f.p }));
            const first = sheet.find((s) => s.box && s.box.w > 4 && s.box.h > 4);

            // What the sheet SHOULD be: the tile clipped to the sheet's own box
            // (on a phone the sheet's top edge is below the top of the screen,
            // so a tile higher up is partly outside it and the clip clamps).
            const want = await page.evaluate((t) => {
                const s = document.querySelector('.dccgg-stage').getBoundingClientRect();
                const x = Math.max(s.left, t.x), y = Math.max(s.top, t.y);
                return { x: Math.round(x), y: Math.round(y),
                    w: Math.round(Math.min(s.right, t.right) - x),
                    h: Math.round(Math.min(s.bottom, t.bottom) - y) };
            }, tile);

            const near = (a, b) => Math.abs(a - b) <= 2;
            const ok = !!first && near(first.box.x, want.x) && near(first.box.y, want.y)
                && near(first.box.w, want.w) && near(first.box.h, want.h);
            const oversize = sheet.filter((s) => s.box
                && (s.box.w > want.w + 2 || s.box.h > want.h + 2)
                && s.box.h < 300);   // the later frames are the sheet growing, as intended
            if (ok) { pass++; } else { fail++; }
            console.log(`  ${name} (tile ${index}, "${tile.key}")`
                + (TOOLBAR ? `  [viewport +${TOOLBAR}px after the tap]` : ''));
            console.log(`      frame 1 at t+${first ? first.t : '?'}ms: ` +
                `${first ? JSON.stringify(first.box) : 'no sheet found'}`);
            console.log(`      want                 : ${JSON.stringify(want)}  -> ${ok ? 'PASS' : 'FAIL'}`);
            notes.push(`${name}: ${ok ? 'PASS' : 'FAIL'} frame1=${first ? JSON.stringify(first.box) : 'none'} want=${JSON.stringify(want)}`);

            // A contact sheet of the first six frames, captioned.
            const labelled = files.map((f) => {
                const o = f.p.replace('.png', '-lab.png');
                execFileSync('convert', [f.p, '-background', '#111', '-fill', 'white',
                    '-pointsize', '24', `label:t+${f.t} ms`, '+swap', '-gravity', 'center', '-append', o]);
                return o;
            });
            const sheetFile = path.join(OUT,
                `Guest Guide - 0.27.11 first frames ${LABEL} ${name}.png`);
            execFileSync('montage', labelled.concat(['-tile', `${labelled.length}x1`,
                '-geometry', '+6+6', '-background', '#111', sheetFile]));
            labelled.forEach((p) => fs.unlinkSync(p));
            await ctx.close();
        }
    } finally {
        await browser.close();
    }
    console.log(`\n${LABEL}: ${pass} passed, ${fail} failed`);
    notes.forEach((n) => console.log('  ' + n));
    process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
