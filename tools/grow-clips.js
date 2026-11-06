/**
 * Frame-by-frame strips of the open, the close and an arrow switch, on the
 * REAL doracanalcourt.com /guest/ document (v0.27.10).
 *
 * Frames come from CDP Page.startScreencast, not from page.screenshot(): a
 * screenshot costs 40-80ms, which cannot sample a 250ms animation, and the
 * whole question here is what the guest sees at 50ms and at 150ms. The
 * screencast pushes frames with the compositor's own timestamps, so each one
 * is labelled with its real offset from the tap.
 *
 * Run it once per build and keep the output directories apart:
 *   node tools/grow-clips.js <outdir>
 *
 * The 0.27.9 "before" strips are produced by swapping that version's three
 * asset files in, running this, and swapping back — same tool, same page,
 * same throttle, so the two strips are comparable.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const { openLive } = require('./live-shell');

const OUT = process.argv[2] || '/tmp/clips';
const LABEL = path.basename(OUT);

/** Collect screencast frames while `act` runs, each tagged with ms from the tap. */
async function record(ctx, page, act, ms) {
    const cdp = await ctx.newCDPSession(page);
    const frames = [];
    let t0 = null;
    // The ack is fired and NOT awaited: awaiting it puts a CDP round trip in
    // the middle of every frame, which is what made the first attempt return
    // six frames spread over 659ms for a 250ms animation. jpeg, not png, for
    // the same reason.
    cdp.on('Page.screencastFrame', (ev) => {
        frames.push({ at: ev.metadata.timestamp * 1000, data: ev.data });
        cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
    await page.waitForTimeout(300);          // a baseline frame, and a settled page
    t0 = Date.now();
    await act();
    await page.waitForTimeout(ms);
    await cdp.send('Page.stopScreencast');
    return frames.map((f) => ({ t: Math.round(f.at - t0), data: f.data }))
        .sort((a, b) => a.t - b.t);
}

/**
 * Frames at FIXED MOMENTS, not at fixed indices.
 *
 * A before/after pair is only readable if both strips show the same instants,
 * and an index-based pick gives each build whatever cadence it happened to
 * produce. Each column is the frame nearest that moment, and its caption is
 * the frame's REAL offset — so if a build has nothing near 60ms, the caption
 * says so instead of the strip quietly lying.
 */
const MOMENTS = [0, 60, 120, 180, 250, 400];

function strip(frames, dir, name, moments = MOMENTS) {
    fs.mkdirSync(dir, { recursive: true });
    if (!frames.length) { console.log('  ! no frames for ' + name); return; }
    const pick = [];
    for (const m of moments) {
        let best = frames[0];
        for (const f of frames) {
            if (Math.abs(f.t - m) < Math.abs(best.t - m)) best = f;
        }
        pick.push({ want: m, f: best });
    }
    const labelled = [];
    pick.forEach((p, i) => {
        const raw = path.join(dir, `${name}-${String(i).padStart(2, '0')}.jpg`);
        fs.writeFileSync(raw, Buffer.from(p.f.data, 'base64'));
        const out = raw.replace('.jpg', '-lab.png');
        execFileSync('convert', [raw, '-background', '#111', '-fill', 'white', '-pointsize', '26',
            `label:${p.want} ms  (frame ${p.f.t})`, '+swap', '-gravity', 'center', '-append', out]);
        labelled.push(out);
        fs.unlinkSync(raw);
    });
    const sheet = path.join(dir, name + '-strip.png');
    execFileSync('montage', labelled.concat(['-tile', `${labelled.length}x1`, '-geometry', '+6+6',
        '-background', '#111', sheet]));
    const cadence = frames.length > 1
        ? Math.round((frames[frames.length - 1].t - frames[0].t) / (frames.length - 1)) : 0;
    console.log(`  ${name}: ${frames.length} frames, ~${cadence}ms apart, ${frames[0].t}..${frames[frames.length - 1].t}ms -> ${sheet}`);
    labelled.forEach((p) => fs.unlinkSync(p));
}

async function main() {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    try {
        for (const width of [390, 1440]) {
            const dir = path.join(OUT, String(width));
            console.log(`\n${LABEL} @ ${width}`);
            // --- open ---
            {
                const { ctx, page } = await openLive(browser, {
                    width, height: width >= 768 ? 900 : 844, keepReal: true, scale: 1,
                    throttle: { cpu: 4, network: { latency: 0, downloadThroughput: -1, uploadThroughput: -1 } },
                });
                await page.evaluate(() => {
                    const t = document.querySelector('.dccgg-root .dccgg-tile');
                    t.scrollIntoView({ block: 'center', behavior: 'instant' });
                });
                await page.waitForTimeout(400);
                const f = await record(ctx, page, async () => {
                    await page.evaluate(() => document.querySelector('.dccgg-root .dccgg-tile').click());
                }, 700);
                strip(f, dir, 'open');
                // --- close, in the same page so it closes what it opened ---
                const g = await record(ctx, page, async () => {
                    await page.evaluate(() => {
                        const b = document.querySelector('.dccgg-stage .dccgg-detail:not([hidden]) .dccgg-back');
                        if (b) b.click();
                    });
                }, 600);
                strip(g, dir, 'close');
                await ctx.close();
            }
            // --- an arrow switch ---
            {
                const { ctx, page } = await openLive(browser, {
                    width, height: width >= 768 ? 900 : 844, keepReal: true, scale: 1,
                    throttle: { cpu: 4, network: { latency: 0, downloadThroughput: -1, uploadThroughput: -1 } },
                });
                await page.evaluate(() => {
                    const tiles = Array.from(document.querySelectorAll('.dccgg-root .dccgg-tile'));
                    const t = tiles[1] || tiles[0];
                    t.scrollIntoView({ block: 'center', behavior: 'instant' });
                    t.click();
                });
                await page.waitForTimeout(700);
                const has = await page.evaluate(() => {
                    const p = document.querySelector('.dccgg-stage .dccgg-detail:not([hidden])');
                    const b = p && p.querySelector('.dccgg-section-next');
                    return !!(b && !b.hasAttribute('disabled'));
                });
                if (!has) { console.log('  arrow: no enabled next arrow on this guide'); }
                else {
                    const f = await record(ctx, page, async () => {
                        await page.evaluate(() => document.querySelector(
                            '.dccgg-stage .dccgg-detail:not([hidden]) .dccgg-section-next').click());
                    }, 600);
                    strip(f, dir, 'arrow-next');
                    strip(f, dir, 'arrow-next-dense', [0, 30, 60, 90, 120, 160, 200, 260]);
                }
                await ctx.close();
            }
        }
    } finally {
        await browser.close();
    }
}
main().catch((e) => { console.error(e); process.exit(1); });
