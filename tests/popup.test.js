#!/usr/bin/env node
/**
 * DCC Guest Guide — popup regression tests.
 *
 * Why this exists: the detail-popup viewport bugs (v0.9.7.17 → .25) could
 * only be verified by installing a zip on a phone. Every scenario below is
 * one of the failure modes that actually shipped during that stretch. Run
 * this BEFORE building a release zip:
 *
 *     node tests/popup.test.js
 *
 * Uses playwright-core + the container's preinstalled Chromium
 * (PLAYWRIGHT_BROWSERS_PATH/chromium). Fixtures are generated in-memory
 * from the REAL assets/js/widget.js + assets/css/widget.css, with markup
 * mirroring Widget::render()'s structure. If render() ever changes class
 * names/nesting, update buildFixture() to match.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'dcc-guest-guide/assets/css/widget.css'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'dcc-guest-guide/assets/js/widget.js'), 'utf8');

const PHONE = { width: 390, height: 844 };   // iPhone 14-ish
const DESKTOP = { width: 1280, height: 800 };

// ---------------------------------------------------------------- fixtures

function detailMarkup(key, title, paragraphs) {
    let items = '';
    for (let i = 1; i <= paragraphs; i++) {
        items += `<div class="dccgg-detail-item-anchor" data-item-idx="${i}">
            <p>Item ${i}: enough copy to force the popup to overflow and scroll internally on a phone viewport. Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
        </div>`;
    }
    return `<div class="dccgg-detail" data-key="${key}" data-wizard="0" data-checklist="0" hidden>
        <span class="dccgg-shrink-sentinel" aria-hidden="true"></span>
        <div class="dccgg-detail-header">
            <div class="dccgg-detail-header-actions">
                <button type="button" class="dccgg-btn dccgg-back">Back</button>
                <span class="dccgg-section-nav-spacer" aria-hidden="true"></span>
            </div>
            <div class="dccgg-detail-header-titlebar">
                <span class="dccgg-detail-titlebar-spacer" aria-hidden="true"></span>
                <h2 class="dccgg-detail-title"><span class="dccgg-detail-title-icon"></span><span class="dccgg-detail-title-text">${title}</span></h2>
                <span class="dccgg-detail-titlebar-spacer" aria-hidden="true"></span>
            </div>
        </div>
        <div class="dccgg-detail-layout">
            <div class="dccgg-detail-items">${items}</div>
        </div>
    </div>`;
}

function guideInner(fab) {
    const cfg = JSON.stringify({ revealMode: 'stage', enableFab: !!fab, strings: {} }).replace(/'/g, '&#39;');
    const menu = `<div class="dccgg-menu">
        <div class="dccgg-tile-wrap" data-section-key="wifi"><button type="button" class="dccgg-tile" data-key="wifi">Wi-Fi</button></div>
        <div class="dccgg-tile-wrap" data-section-key="hottub"><button type="button" class="dccgg-tile" data-key="hottub">Hot tub</button></div>
    </div>`;
    const stage = `<div class="dccgg-stage" aria-live="polite">
        ${detailMarkup('wifi', 'Wi-Fi', 40)}
        ${detailMarkup('hottub', 'Hot tub', 3)}
    </div>`;
    const wrapperTag = fab ? 'dialog' : 'div';
    return `<div class="dccgg-root" data-config='${cfg}'>
        ${fab ? '<button type="button" class="dccgg-fab" aria-label="Open guide">?</button><div class="dccgg-overlay" hidden></div>' : ''}
        <${wrapperTag} class="dccgg-wrapper">
            ${fab ? '<button type="button" class="dccgg-fab-close" aria-label="Close">&times;</button>' : ''}
            <div class="dccgg-stage-container">${menu}${stage}</div>
            <div class="dccgg-detail-overlay" hidden></div>
        </${wrapperTag}>
    </div>`;
}

/**
 * transformedAncestor mimics an Elementor section with a motion effect —
 * the containing-block hijack that caused the original top-overflow bug.
 */
function buildFixture({ fab = false, transformedAncestor = false } = {}) {
    const widget = `<div class="elementor-widget${fab ? ' dccgg-fab--yes' : ''}">${guideInner(fab)}</div>`;
    const wrapped = transformedAncestor
        ? `<div style="transform: translateZ(0); will-change: transform;">${widget}</div>`
        : widget;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${CSS}</style></head>
        <body>
        <div style="height: 600px; background: #eee;">page content above the widget</div>
        ${wrapped}
        <div style="height: 1200px; background: #ddd;">page content below the widget</div>
        <script>${JS}</script>
        </body></html>`;
}

// ------------------------------------------------------------------ runner

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
    if (cond) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function newPage(browser, viewport, html, errors) {
    const ctx = await browser.newContext({ viewport, hasTouch: viewport === PHONE, isMobile: viewport === PHONE });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setContent(html, { waitUntil: 'load' });
    return { ctx, page };
}

const rect = (page, sel) => page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width };
});

async function openDetail(page) {
    await page.click('.dccgg-tile[data-key="wifi"]');
    await page.waitForTimeout(450); // open transition is 250ms
}

async function run() {
    const executablePath = path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium');
    const browser = await chromium.launch(
        fs.existsSync(executablePath) ? { executablePath } : {}
    );

    // ---- Scenario A: phone, inline embed, plain ancestors ----------------
    {
        console.log('\nA. Phone / inline embed');
        const errors = [];
        const { ctx, page } = await newPage(browser, PHONE, buildFixture(), errors);
        await openDetail(page);

        const s = await rect(page, '.dccgg-stage');
        check('popup top edge on-screen', s.top >= 0, `top=${s.top.toFixed(1)}`);
        check('popup bottom within viewport', s.bottom <= PHONE.height + 1, `bottom=${s.bottom.toFixed(1)}`);
        check('popup near top of viewport (item 1, ≤80px gap)', s.top <= 80, `top=${s.top.toFixed(1)}`);
        check('popup fills width', s.width >= PHONE.width - 2, `width=${s.width.toFixed(1)}`);

        // Internal scroll works and the frame doesn't move (the 0.9.7.25 bug
        // class: first scroll used to jump the popup off the top).
        const before = await rect(page, '.dccgg-stage');
        await page.$eval('.dccgg-stage', (el) => { el.scrollTop = 300; });
        await page.waitForTimeout(150);
        const scrolled = await page.$eval('.dccgg-stage', (el) => el.scrollTop);
        const after = await rect(page, '.dccgg-stage');
        check('internal scroll works', scrolled > 200, `scrollTop=${scrolled}`);
        check('frame does not move when scrolled', Math.abs(after.top - before.top) < 1, `Δtop=${(after.top - before.top).toFixed(1)}`);

        // Opaque, flush header (items 2+3): topmost element at the popup's
        // top strip must be the header (or inside it), not scrolled content.
        const h = await rect(page, '.dccgg-detail-header');
        check('header flush with popup top (≤6px)', h.top - after.top <= 6, `gap=${(h.top - after.top).toFixed(1)}`);
        const covered = await page.evaluate(() => {
            const header = document.querySelector('.dccgg-detail-header');
            const r = header.getBoundingClientRect();
            for (const frac of [0.15, 0.5, 0.85]) {
                const el = document.elementFromPoint(r.left + r.width * frac, r.top + 4);
                if (!el || !(header.contains(el) || el === header)) return false;
            }
            const bg = getComputedStyle(header).backgroundColor;
            if (bg === 'transparent' || bg.startsWith('rgba(0, 0, 0, 0)')) return false;
            return true;
        });
        check('header opaque + covers content behind it', covered);

        // Always-visible scrollbar (item 4) with the progress bar gone (5).
        const railOk = await page.evaluate(() => {
            const rail = document.querySelector('.dccgg-scrollrail');
            if (!rail || rail.hidden) return 'rail missing/hidden';
            const t = rail.querySelector('.dccgg-scrollrail-thumb').getBoundingClientRect();
            if (t.height < 20 || t.width < 3) return 'thumb not visible';
            if (document.querySelector('.dccgg-progress-bar')) return 'progress bar still present';
            return true;
        });
        check('custom scrollrail visible, progress bar removed', railOk === true, String(railOk));

        // Tap the dimmed area above the sheet → closes (the 0.9.7.25 report:
        // "can't tap outside of the popup to try again").
        if (s.top > 12) {
            await page.mouse.click(PHONE.width / 2, Math.max(2, s.top / 2));
            await page.waitForTimeout(400);
            const open = await page.evaluate(() => document.body.classList.contains('dccgg-detail-open'));
            check('tap outside closes popup', !open);
        }

        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }

    // ---- Scenario B: phone, inline embed, TRANSFORMED ancestor -----------
    {
        console.log('\nB. Phone / transformed Elementor ancestor (containing-block hijack)');
        const errors = [];
        const { ctx, page } = await newPage(browser, PHONE, buildFixture({ transformedAncestor: true }), errors);
        await page.evaluate(() => window.scrollTo(0, 500)); // widget partly scrolled — worst case for the old bug
        await openDetail(page);
        const s = await rect(page, '.dccgg-stage');
        check('popup top edge on-screen', s.top >= 0, `top=${s.top.toFixed(1)}`);
        check('popup bottom within viewport', s.bottom <= PHONE.height + 1, `bottom=${s.bottom.toFixed(1)}`);
        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }

    // ---- Scenario C: phone, FAB dialog mode inside transformed ancestor --
    {
        console.log('\nC. Phone / FAB hub (top-layer dialog) in transformed ancestor');
        const errors = [];
        const { ctx, page } = await newPage(browser, PHONE, buildFixture({ fab: true, transformedAncestor: true }), errors);
        await page.click('.dccgg-fab');
        await page.waitForTimeout(450);
        const w = await rect(page, '.dccgg-wrapper');
        check('hub top edge on-screen', w.top >= 0, `top=${w.top.toFixed(1)}`);
        check('hub bottom within viewport', w.bottom <= PHONE.height + 1, `bottom=${w.bottom.toFixed(1)}`);

        // Open a detail from inside the hub: must be visible ABOVE the hub
        // (the top-layer paints-behind class of bug).
        await openDetail(page);
        await page.waitForTimeout(250);   // let both open transitions settle
        const visible = await page.evaluate(() => {
            const stage = document.querySelector('.dccgg-stage');
            const r = stage.getBoundingClientRect();
            if (r.top < 0 || r.height < 100) return 'stage off-screen';
            const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return (stage.contains(el) || el === stage) ? true : 'stage hidden behind hub';
        });
        check('detail opened from hub paints on top', visible === true, String(visible));
        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }

    // ---- Scenario D: desktop, inline embed -------------------------------
    {
        console.log('\nD. Desktop / centered card');
        const errors = [];
        const { ctx, page } = await newPage(browser, DESKTOP, buildFixture(), errors);
        await openDetail(page);
        const s = await rect(page, '.dccgg-stage');
        check('card top on-screen', s.top >= 0, `top=${s.top.toFixed(1)}`);
        check('card bottom within viewport', s.bottom <= DESKTOP.height + 1, `bottom=${s.bottom.toFixed(1)}`);
        const centerOffset = Math.abs((s.left + s.right) / 2 - DESKTOP.width / 2);
        check('card horizontally centered', centerOffset < 4, `offset=${centerOffset.toFixed(1)}`);
        // v0.9.7.34: desktop card must be a comfortable portrait size — at
        // least 740px wide and 600px tall (host: it was too short/narrow).
        check('card wide enough on desktop (≥740px)', s.width >= 740, `width=${s.width.toFixed(0)}`);
        check('card tall enough on desktop (≥600px)', s.height >= 600, `height=${s.height.toFixed(0)}`);
        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }

    // ---- Scenario E: item-title centering + more-button single row -------
    // v0.9.7.28 requests. Renders one open detail with the real item-title
    // markup (leading emoji + centered text + a trailing control) and a
    // popup ⋯ menu whose "more button text" is two emoji.
    {
        console.log('\nE. Desktop / item-title centering + horizontal more-button');
        const errors = [];
        const item = `<article class="dccgg-item">
            <h3 class="dccgg-item-title">
                <span class="dccgg-item-title-lead"><span class="dccgg-emoji-icon">☕</span></span>
                <span class="dccgg-item-title-text">Coffee</span>
                <span class="dccgg-item-title-tail"><button class="dccgg-item-report" type="button" aria-label="Report">!</button></span>
            </h3>
            <div class="dccgg-item-content-wrap"><div class="dccgg-item-body"><p>Use our coffee maker.</p></div></div>
        </article>`;
        const detail = `<div class="dccgg-detail is-shrunk" data-key="clubhouse">
            <span class="dccgg-shrink-sentinel"></span>
            <div class="dccgg-detail-header">
                <div class="dccgg-detail-header-actions"><button class="dccgg-btn dccgg-back">Back</button></div>
                <div class="dccgg-detail-header-titlebar">
                    <span class="dccgg-detail-titlebar-spacer" aria-hidden="true"></span>
                    <h2 class="dccgg-detail-title"><span class="dccgg-detail-title-icon">🏦</span><span class="dccgg-detail-title-text">Clubhouse</span></h2>
                    <details class="dccgg-more dccgg-more--popup"><summary class="dccgg-more-summary--text"><span class="dccgg-more-summary-text">🧭🛎️</span></summary><div class="dccgg-more-popover"></div></details>
                </div>
            </div>
            <div class="dccgg-detail-layout"><div class="dccgg-detail-items">${item.repeat(6)}</div></div>
        </div>`;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
            <body class="dccgg-detail-open"><div class="dccgg-root is-detail">
            <div class="dccgg-stage is-modal-open" style="visibility:visible;opacity:1">${detail}</div>
            </div></body></html>`;
        const ctx = await browser.newContext({ viewport: DESKTOP });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.setContent(html, { waitUntil: 'load' });

        // (Req 1) Title text centered in the item row regardless of the emoji.
        const t = await page.evaluate(() => {
            const row = document.querySelector('.dccgg-item-title').getBoundingClientRect();
            const text = document.querySelector('.dccgg-item-title-text').getBoundingClientRect();
            const emoji = document.querySelector('.dccgg-emoji-icon').getBoundingClientRect();
            return {
                rowCenter: (row.left + row.right) / 2,
                textCenter: (text.left + text.right) / 2,
                emojiRight: emoji.right,
                textLeft: text.left,
                rowLeft: row.left,
                emojiLeft: emoji.left,
            };
        });
        check('item title text absolutely centered', Math.abs(t.textCenter - t.rowCenter) <= 8, `Δ=${(t.textCenter - t.rowCenter).toFixed(1)}px`);
        check('emoji left-aligned (left of title)', t.emojiRight <= t.textLeft && (t.emojiLeft - t.rowLeft) < 24, `emojiLeft-rowLeft=${(t.emojiLeft - t.rowLeft).toFixed(1)}`);

        // (Req 2) The two-emoji ⋯ button stays one row (not the 44×44 circle
        // that wrapped it vertically) and is wider than it is tall.
        const m = await page.evaluate(() => {
            const s = document.querySelector('.dccgg-more-summary--text').getBoundingClientRect();
            const line = parseFloat(getComputedStyle(document.querySelector('.dccgg-more-summary--text')).lineHeight) || 20;
            return { w: s.width, h: s.height, line };
        });
        check('more-button on a single row (not stacked)', m.h < m.line * 1.8, `h=${m.h.toFixed(1)} line=${m.line.toFixed(1)}`);
        check('more-button expanded horizontally (w>h)', m.w > m.h, `w=${m.w.toFixed(1)} h=${m.h.toFixed(1)}`);
        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }

    // ---- Scenario F: header/button polish under a HOSTILE theme ----------
    // v0.9.7.30 requests. The surrounding theme here deliberately shouts on
    // buttons and sizes h2/h3 independently — the exact conditions that
    // produced ALL-CAPS buttons and a too-small section title on the live
    // site. The detail is rendered in .is-shrunk (scrolled) state, which is
    // when the section title used to shrink further.
    {
        console.log('\nF. Header + button polish vs. an overriding theme');
        const errors = [];
        const THEME = `h2 { font-size: 1.1rem; } h3 { font-size: 1.6rem; }
            button, .dccgg-btn { text-transform: uppercase; letter-spacing: .12em; }`;
        const item = `<article class="dccgg-item"><h3 class="dccgg-item-title">
            <span class="dccgg-item-title-lead"><span class="dccgg-emoji-icon">🌐</span></span>
            <span class="dccgg-item-title-text">Wifi Name: "topoftheworld"</span>
            <span class="dccgg-item-title-tail"></span></h3>
            <button type="button" class="dccgg-btn dccgg-copy">Copy password</button></article>`;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${THEME}${CSS}
            .elementor-widget{font-size:20px;}</style></head>
            <body class="dccgg-detail-open"><div class="elementor-widget"><div class="dccgg-root is-detail">
            <div class="dccgg-stage is-modal-open" style="visibility:visible;opacity:1">
            <div class="dccgg-detail is-shrunk"><div class="dccgg-detail-header">
              <div class="dccgg-detail-header-titlebar"><span class="dccgg-detail-titlebar-spacer"></span>
                <h2 class="dccgg-detail-title"><span class="dccgg-detail-title-icon">📶</span><span class="dccgg-detail-title-text">Internet</span></h2>
                <details class="dccgg-more"><summary class="dccgg-more-summary--text">🧭🛎️</summary></details></div>
              <div class="dccgg-detail-header-actions"><button class="dccgg-btn dccgg-back">Back</button>
                <div class="dccgg-section-nav"><button class="dccgg-section-prev">‹</button><button class="dccgg-section-next">›</button></div></div>
            </div><div class="dccgg-detail-layout"><div class="dccgg-detail-items">${item}
              <article class="dccgg-item dccgg-item--compact"><h3 class="dccgg-item-title">
              <span class="dccgg-item-title-text">Compact</span></h3></article>
            </div></div></div>
            </div></div></div>
            <dialog class="dccgg-report-dialog" open style="width:340px">
              <div class="dccgg-report-head"><h3>Ask for assistance or report issues</h3>
              <button class="dccgg-report-close">&times;</button></div>
              <div class="dccgg-report-body"></div></dialog></body></html>`;
        const ctx = await browser.newContext({ viewport: DESKTOP });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.setContent(html, { waitUntil: 'load' });

        const r = await page.evaluate(() => {
            const cs = (e) => getComputedStyle(e);
            const head = document.querySelector('.dccgg-report-head').getBoundingClientRect();
            const x = document.querySelector('.dccgg-report-close').getBoundingClientRect();
            return {
                detailTitlePx: parseFloat(cs(document.querySelector('.dccgg-detail-title')).fontSize),
                itemTitlePx: parseFloat(cs(document.querySelector('.dccgg-item-title')).fontSize),
                compactTitlePx: parseFloat(cs(document.querySelector('.dccgg-item--compact .dccgg-item-title')).fontSize),
                backTransform: cs(document.querySelector('.dccgg-back')).textTransform,
                copyTransform: cs(document.querySelector('.dccgg-copy')).textTransform,
                backSpacing: cs(document.querySelector('.dccgg-back')).letterSpacing,
                titleRowTop: document.querySelector('.dccgg-detail-header-titlebar').getBoundingClientRect().top,
                actionsRowTop: document.querySelector('.dccgg-detail-header-actions').getBoundingClientRect().top,
                xFromTop: x.top - head.top,
                xFromRight: head.right - x.right,
            };
        });
        // (1) Buttons render as authored, not ALL CAPS, despite the theme.
        check('Back button not uppercased by theme', r.backTransform === 'none', r.backTransform);
        check('Copy button not uppercased by theme', r.copyTransform === 'none', r.copyTransform);
        check('button letter-spacing reset', r.backSpacing === 'normal', r.backSpacing);
        // (2) Section title matches item title even while shrunk.
        check('section title == item title size', Math.abs(r.detailTitlePx - r.itemTitlePx) < 0.5,
            `${r.detailTitlePx}px vs ${r.itemTitlePx}px`);
        // v0.9.7.33: both titles must SCALE with the surrounding content font.
        // v0.9.7.30 sized them in rem, which matched them to each other but
        // pinned them to the 16px root — on a widget inheriting a larger font
        // that shrank the whole popup by ~20%. The fixture's wrapper sets
        // 20px, so 1.15em = 23px; anything near 18.4px means rem crept back.
        check('titles scale with content font (em, not rem)', r.itemTitlePx > 21,
            `${r.itemTitlePx}px — expected ~23px at a 20px content font`);
        check('compact item title stays smaller', r.compactTitlePx < r.itemTitlePx,
            `compact=${r.compactTitlePx}px item=${r.itemTitlePx}px`);
        // (3) Title row sits above the Back / prev-next row.
        check('title row above Back/arrows row', r.titleRowTop < r.actionsRowTop,
            `title=${r.titleRowTop.toFixed(0)} actions=${r.actionsRowTop.toFixed(0)}`);
        // (4) Report dialog × sits in the corner, not nudged in/down.
        check('report × near top-right corner', r.xFromTop <= 12 && r.xFromRight <= 12,
            `top=${r.xFromTop.toFixed(1)} right=${r.xFromRight.toFixed(1)}`);
        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }

    // ---- Scenario H: mobile menu grid column behaviour (v0.9.9) ---------
    // The v0.9.7 mobile-portrait rule fell back to repeat(1, …) whenever the
    // column-count var was unset — the normal state for an untouched widget,
    // since an Elementor SELECT at its default emits no CSS — so phones
    // silently collapsed to one column. Auto must now follow tile width;
    // an explicit choice must still pin.
    {
        console.log('\nH. Mobile menu grid: Auto flows by width, explicit count pins');
        const errors = [];
        const grid = (tileMin, pin) => `<!DOCTYPE html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}
            .dccgg-menu{--dccgg-tile-min:${tileMin};${pin !== null ? `--dccgg-grid-cols-mobile-tpl:repeat(${pin}, minmax(0,1fr));` : ''}}
            </style></head><body><div class="dccgg-root dccgg-layout-grid"><div class="dccgg-menu">
            ${Array.from({ length: 8 }, (_, i) => `<div class="dccgg-tile-wrap"><button class="dccgg-tile">S${i}</button></div>`).join('')}
            </div></div></body></html>`;
        const colsAt = async (vp, tileMin, pin) => {
            const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width <= 600, hasTouch: vp.width <= 600 });
            const page = await ctx.newPage();
            page.on('pageerror', (e) => errors.push(String(e)));
            await page.setContent(grid(tileMin, pin), { waitUntil: 'load' });
            const n = await page.evaluate(() => getComputedStyle(document.querySelector('.dccgg-menu'))
                .gridTemplateColumns.split(' ').filter(Boolean).length);
            await ctx.close();
            return n;
        };
        const PHONE_P = { width: 375, height: 812 };
        // Auto default must give 2 columns at the tile widths actually in use.
        for (const tm of ['120px', '140px']) {
            check(`Auto: 375px phone at tile-min ${tm} gives 2 columns`,
                (await colsAt(PHONE_P, tm, null)) === 2, `got ${await colsAt(PHONE_P, tm, null)}`);
        }
        // Explicit choice still pins exactly.
        let pinned = [];
        for (const n of [1, 2, 3, 4]) {
            if ((await colsAt(PHONE_P, '120px', n)) !== n) pinned.push(n);
        }
        check('explicit 1/2/3/4 pins exactly that count', pinned.length === 0, `wrong for: ${pinned.join(',')}`);
        // The mobile pin must not leak past the breakpoint.
        const dAuto = await colsAt({ width: 1280, height: 800 }, '200px', null);
        const dPinned = await colsAt({ width: 1280, height: 800 }, '200px', 2);
        check('mobile pin does not affect desktop', dAuto === dPinned, `auto=${dAuto} pinned=${dPinned}`);
        check('no JS errors', errors.length === 0, errors[0]);
    }

    // ---- Scenario I: Elementor editor re-render + teardown (v0.12.0) ------
    // The editor renders widgets via AJAX after DOMContentLoaded and swaps the
    // DOM on every setting change. Before v0.12.0 nothing re-ran init() for
    // those roots, so their tiles were dead. This emulates Elementor's hook
    // surface and checks (1) both widget types register, (2) a freshly
    // inserted root becomes interactive once the hook fires, (3) a root the
    // editor discarded has its document/window listeners released.
    {
        console.log('\nI. Editor re-render: element_ready initialises new roots, stale roots are torn down');
        const errors = [];
        const shim = `<script>window.elementorFrontend={hooks:{_a:{},addAction(n,f){this._a[n]=f;}},isEditMode(){return false;}};</script>`;
        const html = buildFixture().replace('<style>', shim + '<style>');
        const { ctx, page } = await newPage(browser, DESKTOP, html, errors);
        const registered = await page.evaluate(() => Object.keys(window.elementorFrontend.hooks._a));
        check('element_ready hook registered for both widgets',
            registered.includes('frontend/element_ready/dccgg_guide.default') &&
            registered.includes('frontend/element_ready/dccgg_guide_public.default'), registered.join(','));

        const r = await page.evaluate(() => {
            const first = document.querySelector('.dccgg-root');
            const before = (first.__dccggDisposers || []).length;
            // Emulate the editor: clone the widget as a NEW root (no init flag).
            const wrap = document.createElement('div');
            wrap.innerHTML = first.outerHTML.replace(/ data-dccgg-init="1"/g, '').replace(/is-detail/g, '');
            const fresh = wrap.querySelector('.dccgg-root');
            fresh.querySelectorAll('[data-dccgg-init]').forEach(e => e.removeAttribute('data-dccgg-init'));
            document.body.appendChild(wrap);
            wrap.id = 'fresh-wrap';
            fresh.querySelector('.dccgg-tile[data-key="wifi"]').click();
            return { before };
        });
        // Class changes ride a view transition, so give them a frame or two.
        await page.waitForTimeout(450);
        r.deadBefore = await page.evaluate(() => !document.querySelector('#fresh-wrap .dccgg-root').classList.contains('is-detail'));
        await page.evaluate(() => {
            // Editor discards the old root, then fires element_ready for the new one.
            const first = document.querySelector('.dccgg-root:not(#fresh-wrap .dccgg-root)');
            window.__oldRoot = first; first.remove();
            window.elementorFrontend.hooks._a['frontend/element_ready/dccgg_guide.default']([document.getElementById('fresh-wrap')]);
            document.querySelector('#fresh-wrap .dccgg-tile[data-key="wifi"]').click();
        });
        await page.waitForTimeout(450);
        Object.assign(r, await page.evaluate(() => ({
            aliveAfter: document.querySelector('#fresh-wrap .dccgg-root').classList.contains('is-detail'),
            oldDisposed: (window.__oldRoot.__dccggDisposers || []).length === 0,
        })));
        check('old root had global listeners to release', r.before > 0, `disposers=${r.before}`);
        check('new root is inert until element_ready fires', r.deadBefore);
        check('new root becomes interactive after element_ready', r.aliveAfter);
        check('discarded root had its listeners released', r.oldDisposed);
        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }

    // ---- Scenario J: modal dialog semantics, Tab containment, print date --
    {
        console.log('\nJ. Popup is a real dialog: role, Tab stays inside, focus returns; print date stamped');
        const errors = [];
        const html = buildFixture().replace('<div class="dccgg-menu">',
            '<p class="dccgg-print-cover-date">Printed on <span data-dccgg-print-date></span></p><div class="dccgg-menu">');
        const { ctx, page } = await newPage(browser, DESKTOP, html, errors);
        const stamped = await page.$eval('[data-dccgg-print-date]', el => el.textContent.trim().length > 0);
        check('print date stamped client-side at init', stamped);
        await page.evaluate(() => { document.querySelector('[data-dccgg-print-date]').textContent = ''; window.dispatchEvent(new Event('beforeprint')); });
        check('print date re-stamped on beforeprint', await page.$eval('[data-dccgg-print-date]', el => el.textContent.trim().length > 0));
        const tts = await page.evaluate(() => !('speechSynthesis' in window) || typeof document.querySelector('.dccgg-root').__dccggStopSpeech === 'function');
        check('TTS stop hook exposed on the root', tts);

        await openDetail(page);
        const a = await page.$eval('.dccgg-stage', s => ({ role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), label: s.getAttribute('aria-label') }));
        check('open popup announces as a modal dialog', a.role === 'dialog' && a.modal === 'true', JSON.stringify(a));
        check('dialog is named after the open section', a.label === 'Wi-Fi', a.label);
        let escaped = 0;
        for (let i = 0; i < 25; i++) {
            await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
            if (!(await page.evaluate(() => document.querySelector('.dccgg-stage').contains(document.activeElement)))) escaped++;
        }
        check('Tab and Shift+Tab never leave the popup', escaped === 0, `escaped ${escaped} times`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => ({ role: document.querySelector('.dccgg-stage').getAttribute('role'),
            focusOnTile: !!(document.activeElement && document.activeElement.classList.contains('dccgg-tile')) }));
        check('dialog role removed on close', after.role === null);
        check('focus returns to the tile that opened it', after.focusOnTile);
        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }

    // ---- Scenario K: read-aloud stop under the iOS failure mode ----------
    // The bug: the stop path was gated on speechSynthesis.speaking, which on
    // iOS Safari can read false while audio is playing. The stop branch was
    // skipped and control fell through to speak() — "tapping it again just
    // restarts it". The stub below reproduces exactly that condition:
    // `speaking` ALWAYS reports false. Desktop Chrome passes the old code, so
    // only this stub is a real regression guard.
    {
        console.log('\nK. Read-aloud: stoppable on iOS (speechSynthesis.speaking always false)');
        const errors = [];
        // window.speechSynthesis is a read-only accessor on Window.prototype:
        // a plain assignment silently does nothing and the REAL engine stays,
        // which quietly makes the whole scenario meaningless. Shadow it with
        // an own property instead, and keep the genuine
        // SpeechSynthesisUtterance so nothing rejects our objects.
        const stub = `<script>
            window.__tts = { speak: 0, cancel: 0, pause: 0, resume: 0 };
            const fake = {
                get speaking() { return false; },        // the iOS lie
                speak(u) { window.__tts.speak++; if (u.onstart) setTimeout(() => u.onstart(), 0); },
                cancel() { window.__tts.cancel++; },
                pause()  { window.__tts.pause++; },
                resume() { window.__tts.resume++; },
                getVoices() { return []; }
            };
            Object.defineProperty(window, 'speechSynthesis', { configurable: true, get() { return fake; } });
        </script>`;
        const item = `<article class="dccgg-item" data-tts-text="Boat slips are available to guests.">
            <h3 class="dccgg-item-title"><span class="dccgg-item-title-text">Boat Slips</span>
            <button type="button" class="dccgg-item-tts" aria-pressed="false"
                    aria-label="Read this item aloud" data-label-play="Read this item aloud"
                    data-label-stop="Stop reading" hidden><i class="fas fa-volume-up dccgg-tts-icon"></i></button></h3></article>`;
        const item2 = item.replace('Boat Slips', 'Fish Cleaning').replace('data-tts-text="[^"]*"', 'x')
            .replace('Boat slips are available to guests.', 'The fish cleaning station is by the dock.');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${stub}<style>${CSS}</style></head>
            <body><div class="dccgg-root" data-config='{"revealMode":"stage","strings":{}}'>
            <div class="dccgg-menu"><div class="dccgg-tile-wrap" data-section-key="boating">
            <button class="dccgg-tile" data-key="boating">Boating</button></div></div>
            <div class="dccgg-detail-items">${item}${item2}</div>
            </div><script>${JS}</script></body></html>`;
        const { ctx, page } = await newPage(browser, PHONE, html, errors);
        const btns = '.dccgg-item-tts';
        const state = () => page.evaluate((sel) => {
            const b = document.querySelectorAll(sel);
            return {
                speak: window.__tts.speak, cancel: window.__tts.cancel, resume: window.__tts.resume,
                lit: [...b].map(x => x.classList.contains('is-speaking')),
                pressed: [...b].map(x => x.getAttribute('aria-pressed')),
                label: b[0].getAttribute('aria-label'),
                icon: b[0].querySelector('i').className,
            };
        }, btns);

        check('stub speech engine is actually installed',
            await page.evaluate(() => { window.speechSynthesis.pause(); const n = window.__tts.pause;
                window.__tts.pause = 0; return n === 1; }),
            'window.speechSynthesis was not shadowed — scenario would be vacuous');

        await page.click(`${btns} >> nth=0`); await page.waitForTimeout(60);
        let st = await state();
        check('first tap speaks once and lights the button', st.speak === 1 && st.lit[0] === true, JSON.stringify(st));
        check('lit button announces itself as Stop', st.label === 'Stop reading' && st.pressed[0] === 'true', st.label);
        check('icon switches to a stop glyph', /fa-stop/.test(st.icon) && !/fa-volume-up/.test(st.icon), st.icon);

        // THE regression assertion: second tap must stop, and must NOT speak again.
        await page.click(`${btns} >> nth=0`); await page.waitForTimeout(60);
        st = await state();
        check('SECOND TAP STOPS — does not call speak() again', st.speak === 1, `speak=${st.speak}`);
        check('second tap cancels the utterance', st.cancel >= 1, `cancel=${st.cancel}`);
        check('stop uses the iOS unstick (pause/cancel/resume)', st.resume >= 1, `resume=${st.resume}`);
        check('button reverts to unlit / Read aloud', st.lit[0] === false && st.label === 'Read this item aloud');

        // Repeat 5x: never restarts, never overlaps.
        for (let i = 0; i < 5; i++) { await page.click(`${btns} >> nth=0`); await page.waitForTimeout(40); }
        st = await state();
        check('5 further taps alternate cleanly (odd count = playing)', st.speak === 4 && st.lit[0] === true, `speak=${st.speak} lit=${st.lit[0]}`);

        // Tap elsewhere in the open panel -> stops.
        await page.click('.dccgg-menu'); await page.waitForTimeout(60);
        st = await state();
        check('tapping outside stops playback', st.lit[0] === false);

        // Switching items: only the new one is lit and heard.
        await page.click(`${btns} >> nth=0`); await page.waitForTimeout(40);
        await page.click(`${btns} >> nth=1`); await page.waitForTimeout(60);
        st = await state();
        check('tapping another item leaves only that one lit', st.lit[0] === false && st.lit[1] === true, JSON.stringify(st.lit));

        // Escape and backgrounding both stop.
        await page.keyboard.press('Escape'); await page.waitForTimeout(60);
        check('Escape stops playback', (await state()).lit[1] === false);
        await page.click(`${btns} >> nth=0`); await page.waitForTimeout(40);
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange')); });
        await page.waitForTimeout(60);
        check('backgrounding the tab stops playback', (await state()).lit[0] === false);

        // An utterance that never starts must not leave the button stuck lit.
        await page.evaluate(() => { window.speechSynthesis.speak = (u) => { window.__tts.speak++; }; });
        await page.click(`${btns} >> nth=0`); await page.waitForTimeout(100);
        check('button is lit while awaiting start', (await state()).lit[0] === true);
        await page.waitForTimeout(4200);
        check('watchdog releases a button whose audio never started', (await state()).lit[0] === false);

        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }

    // ---- Scenario L: masked values, search misses, print (v0.12.2) -------
    {
        console.log('\nL. Tap-to-reveal values, failed-search reporting, print output');
        const errors = [];
        const secret = `<span class="dccgg-secret">
            <span class="dccgg-secret-label">Password:</span>
            <span class="dccgg-secret-value" data-secret-value="DCC32586"></span>
            <button type="button" class="dccgg-btn dccgg-secret-toggle" aria-expanded="false"
                    data-label-show="Show" data-label-hide="Hide">Show</button></span>`;
        const cfg = JSON.stringify({ revealMode: 'stage', strings: {}, enableSearch: true,
            ajaxUrl: 'https://dccgg.test/ajax', nonce: 'n1',
            searchIndex: [{ section: 'wifi', item_idx: 0, title: 'Wifi Name', text: 'network' }] });
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}</style></head>
            <body><div class="dccgg-root" data-config='${cfg.replace(/'/g, '&#39;')}'>
            <div class="dccgg-search"><input type="search" class="dccgg-search-input">
            <div class="dccgg-search-results" role="group" hidden></div></div>
            <div class="dccgg-detail-items"><article class="dccgg-item" data-tts-text="Join the network.">
            <div class="dccgg-item-utils">${secret}
            <button class="dccgg-btn dccgg-copy" data-copy="DCC32586">Copy</button></div></article></div>
            </div><script>${JS}</script></body></html>`;
        const { ctx, page } = await newPage(browser, PHONE, html, errors);

        // (e) masked by default — the password must not be in the rendered text.
        const shown = () => page.evaluate(() => {
            const v = document.querySelector('.dccgg-secret-value');
            return { css: getComputedStyle(v, '::before').content,
                     text: document.body.innerText,
                     expanded: document.querySelector('.dccgg-secret-toggle').getAttribute('aria-expanded'),
                     label: document.querySelector('.dccgg-secret-toggle').textContent.trim() };
        });
        let st = await shown();
        check('password is not visible before revealing', !st.text.includes('DCC32586'), st.text.slice(0, 60));
        check('dots are shown instead', /•/.test(st.css), st.css);
        check('toggle reads Show and is collapsed', st.label === 'Show' && st.expanded === 'false',
            `"${st.label}" aria-expanded=${st.expanded}`);

        await page.click('.dccgg-secret-toggle');
        st = await shown();
        check('tapping Show reveals the value as real text',
            (await page.$eval('.dccgg-secret-value', (v) => v.textContent)) === 'DCC32586', st.css);
        check('toggle flips to Hide and is expanded', st.label === 'Hide' && st.expanded === 'true',
            `"${st.label}" aria-expanded=${st.expanded}`);
        await page.click('.dccgg-secret-toggle');
        check('tapping again re-hides it',
            (await page.$eval('.dccgg-secret-value', (v) => v.textContent)) === ''
            && !(await page.evaluate(() => document.body.innerText.includes('DCC32586'))));

        // Copy still works without revealing.
        check('copy button carries the real value',
            await page.$eval('.dccgg-copy', (b) => b.dataset.copy === 'DCC32586'));

        // (f) print: the binder copy needs the real password and no toggle.
        await page.emulateMedia({ media: 'print' });
        const printed = await page.evaluate(() => ({
            val: getComputedStyle(document.querySelector('.dccgg-secret-value'), '::before').content,
            toggle: getComputedStyle(document.querySelector('.dccgg-secret-toggle')).display,
            search: getComputedStyle(document.querySelector('.dccgg-search')).display,
        }));
        check('print shows the real password', printed.val.includes('DCC32586'), printed.val);
        check('print hides the reveal toggle', printed.toggle === 'none');
        check('print hides the search box', printed.search === 'none');
        await page.emulateMedia({ media: 'screen' });

        // (d) a search with no matches is reported once, with only the query.
        // Served from a real origin: with setContent the page sits on
        // about:blank, where a relative /ajax URL cannot resolve at all.
        const posts = [];
        const ctx2 = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
        const page2 = await ctx2.newPage();
        page2.on('pageerror', (e) => errors.push(String(e)));
        await ctx2.route('https://dccgg.test/**', async (route) => {
            const u = new URL(route.request().url());
            if (u.pathname === '/ajax') {
                posts.push(route.request().postData() || '');
                return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"data":{}}' });
            }
            return route.fulfill({ status: 200, contentType: 'text/html', body: html });
        });
        await page2.goto('https://dccgg.test/guest/', { waitUntil: 'load' });
        await page2.fill('.dccgg-search-input', 'hot tub');
        await page2.waitForTimeout(400);
        check('a zero-result search is reported', posts.some(b => b.includes('dccgg_search_miss')), posts.join('|').slice(0, 80));
        const body = posts.find(b => b.includes('dccgg_search_miss')) || '';
        check('the query is sent', /q=hot(\+|%20)tub/.test(body), body);
        check('no identifying data is sent', !/user_agent|ip=|referer|post_id/i.test(body), body);
        const before = posts.length;
        await page2.fill('.dccgg-search-input', '');
        await page2.fill('.dccgg-search-input', 'hot tub');
        await page2.waitForTimeout(400);
        check('the same query is not reported twice', posts.length === before, `${before} -> ${posts.length}`);

        // The structured Wi-Fi pair: one Show toggle, two copy buttons, and no
        // password anywhere in the visible text before revealing.
        const creds = `<dl class="dccgg-wifi-creds">
            <div class="dccgg-wifi-row"><dt>Network:</dt><dd>
              <span class="dccgg-wifi-ssid">topoftheworld</span>
              <button class="dccgg-btn dccgg-copy dccgg-copy--inline" data-copy="topoftheworld">Copy</button></dd></div>
            <div class="dccgg-wifi-row"><dt>Password:</dt><dd>
              <span class="dccgg-secret"><span class="dccgg-secret-value" data-secret-value="DCC32586"></span>
              <button class="dccgg-btn dccgg-secret-toggle" aria-expanded="false" data-label-show="Show" data-label-hide="Hide">Show</button></span>
              <button class="dccgg-btn dccgg-copy dccgg-copy--inline" data-copy="DCC32586">Copy</button></dd></div></dl>`;
        const html3 = `<!DOCTYPE html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}</style></head>
            <body><div class="dccgg-root" data-config='{"revealMode":"stage","strings":{}}'>
            <article class="dccgg-item" data-tts-text="Join the cottage network.">${creds}</article>
            </div><script>${JS}</script></body></html>`;
        const { ctx: ctx3, page: page3 } = await newPage(browser, PHONE, html3, errors);
        const vis = await page3.evaluate(() => document.body.innerText);
        check('structured pair: password not in visible text', !vis.includes('DCC32586'), vis.slice(0, 80));
        check('structured pair: network name IS visible', vis.includes('topoftheworld'));
        check('structured pair: read-aloud text excludes the password',
            await page3.$eval('.dccgg-item', (a) => !a.dataset.ttsText.includes('DCC32586')));
        await page3.click('.dccgg-secret-toggle');
        check('structured pair: Show reveals it as selectable text',
            (await page3.$eval('.dccgg-secret-value', (v) => v.textContent)) === 'DCC32586');
        // v0.12.4 regressions, both from Rob's usability condition:
        // the value must be REAL selectable text when revealed (it was CSS
        // generated content — readable but impossible to select, long-press or
        // find-on-page), and the toggle must be a 44px touch target (was 32px).
        const tog = await page3.$eval('.dccgg-secret-toggle', (b) => {
            const r = b.getBoundingClientRect();
            return { h: r.height, w: r.width, label: b.textContent.trim() };
        });
        check('reveal toggle is a 44px labelled target', tog.h >= 44 && tog.w >= 44 && tog.label.length > 1,
            `${tog.w.toFixed(0)}x${tog.h.toFixed(0)} "${tog.label}"`);
        const selectable = await page3.evaluate(() => {
            const v = document.querySelector('.dccgg-secret-value');
            const sel = window.getSelection(); sel.removeAllRanges();
            const rg = document.createRange(); rg.selectNodeContents(v); sel.addRange(rg);
            return { text: v.textContent, selected: sel.toString(),
                     occurrences: (document.body.innerText.match(/DCC32586/g) || []).length };
        });
        check('revealed value is selectable text, present exactly once',
            selectable.selected === 'DCC32586' && selectable.occurrences === 1,
            `selection="${selectable.selected}" occurrences=${selectable.occurrences}`);
        await page3.click('.dccgg-secret-toggle');
        check('re-hiding takes it back out of the DOM',
            await page3.evaluate(() => document.querySelector('.dccgg-secret-value').textContent === ''
                && !document.body.innerText.includes('DCC32586')));
        await page3.click('.dccgg-secret-toggle');

        check('structured pair: both copy buttons carry real values',
            await page3.evaluate(() => {
                const b = [...document.querySelectorAll('.dccgg-copy')].map(x => x.dataset.copy);
                return b.includes('topoftheworld') && b.includes('DCC32586');
            }));
        await ctx3.close();

        check('no JS errors', errors.length === 0, errors[0]);
        await ctx2.close();
        await ctx.close();
    }

    // ---- Scenario M: swipe-down-to-close the mobile sheet (v0.12.5) ------
    // From a screen recording: swiping the sheet down moved the sheet AND
    // scrolled the page behind it, the sheet sometimes stuck mid-drag, and the
    // swipe usually snapped back instead of closing. Causes: overflow:hidden
    // does not lock scrolling on iOS; nothing claimed the gesture from the
    // browser; pointercancel (which iOS fires when it takes a gesture over)
    // was unhandled; and the dismiss threshold was 30% of sheet height.
    {
        console.log('\nM. Mobile sheet: swipe down to close');
        const errors = [];
        const html = buildFixture()
            .replace('<body>', '<body><div style="height:1200px">tall page above</div>');
        const { ctx, page } = await newPage(browser, PHONE, html, errors);

        await page.evaluate(() => window.scrollTo(0, 900));
        await openDetail(page);
        // Read the locked position from the lock itself rather than from a
        // snapshot taken before the click: Playwright scrolls a target into
        // view before clicking it, so the page can move between the two.
        const beforeY = await page.evaluate(() => -parseInt(document.body.style.top || '0', 10));

        check('body is pinned while the sheet is open',
            (await page.evaluate(() => getComputedStyle(document.body).position)) === 'fixed');
        check('the lock captured a real scrolled position', beforeY > 0, `locked at ${beforeY}`);

        // THE reported bug: the page behind must not move.
        await page.evaluate(() => window.scrollBy(0, 400));
        await page.waitForTimeout(120);
        check('page behind cannot scroll while the sheet is open',
            (await page.evaluate(() => window.scrollY)) === 0);

        const box = await page.locator('.dccgg-stage').boundingBox();
        await page.mouse.move(195, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(195, box.y + 90, { steps: 6 });
        await page.waitForTimeout(60);
        const mid = await page.evaluate(() => ({
            tf: document.querySelector('.dccgg-stage').style.transform,
            trans: getComputedStyle(document.querySelector('.dccgg-stage')).transitionDuration,
            marked: document.querySelector('.dccgg-stage').classList.contains('is-sheet-dragging'),
        }));
        check('sheet tracks the finger', /translateY\(\d+px\)/.test(mid.tf), mid.tf);
        // The class must be on the STAGE: it is portaled to <body> when open,
        // so a `.dccgg-root ...` descendant rule never reaches it.
        check('drag disables the transition (class is on the portaled stage)',
            mid.marked && mid.trans.split(',')[0].trim() === '0s', `${mid.trans.slice(0, 18)} marked=${mid.marked}`);

        await page.mouse.up();
        await page.waitForTimeout(500);
        check('a short drag snaps back and stays open',
            await page.evaluate(() => document.body.classList.contains('dccgg-detail-open')));

        await page.mouse.move(195, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(195, box.y + 200, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(800);
        check('a deliberate drag closes the sheet',
            !(await page.evaluate(() => document.body.classList.contains('dccgg-detail-open'))));
        check('scroll position is restored exactly on close',
            (await page.evaluate(() => window.scrollY)) === beforeY,
            `${beforeY} -> ${await page.evaluate(() => window.scrollY)}`);
        check('body is unpinned after close',
            (await page.evaluate(() => getComputedStyle(document.body).position)) !== 'fixed');

        // iOS fires pointercancel when it takes a gesture over; that used to
        // leave the sheet stranded mid-transform with dragging still true.
        await openDetail(page);
        const box2 = await page.locator('.dccgg-stage').boundingBox();
        await page.mouse.move(195, box2.y + 20);
        await page.mouse.down();
        await page.mouse.move(195, box2.y + 80, { steps: 4 });
        await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => ({
            tf: document.querySelector('.dccgg-stage').style.transform,
            dragging: document.querySelector('.dccgg-stage').classList.contains('is-sheet-dragging'),
        }));
        await page.mouse.up();
        check('a cancelled gesture resets instead of stranding the sheet',
            after.tf === '' && !after.dragging, `transform="${after.tf}" dragging=${after.dragging}`);
        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }


    // ---- Scenario N: Wi-Fi password row parity + auto-hide (v0.13.0) -----
    // The host's complaint: the masked value and the Show toggle both read as
    // black-on-white so the value looked like a third button, the two controls
    // acting on the same password looked nothing alike, and a revealed password
    // survived closing the popup and switching sections.
    {
        console.log('\nN. Password row reads as a labelled value, and re-masks itself');
        const errors = [];
        // The site kit as of 2026-09: Raleway everywhere, buttons 900/18px.
        // Measuring under it is the point — the fix relies on inheritance.
        const KIT = `body{font-family:Raleway,sans-serif;font-size:16px;font-weight:400;color:#333}
            button{font-family:Raleway,sans-serif;font-weight:900;font-size:18px;
                   text-transform:capitalize;letter-spacing:1.5px}`;
        const row = `<div class="dccgg-item-utils">
            <span class="dccgg-secret"><span class="dccgg-secret-label">Password:</span>
            <span class="dccgg-secret-value" data-secret-value="DCC32586"></span>
            <button type="button" class="dccgg-btn dccgg-secret-toggle" aria-expanded="false"
                    data-label-show="Show" data-label-hide="Hide">Show</button></span>
            <button type="button" class="dccgg-btn dccgg-copy" data-copy="DCC32586">Copy</button></div>`;
        const detail = (key, title, body, prev, next) => `
            <div class="dccgg-detail" data-key="${key}" hidden><span class="dccgg-shrink-sentinel"></span>
            <div class="dccgg-detail-header"><div class="dccgg-detail-header-titlebar">
            <span class="dccgg-detail-titlebar-spacer"></span>
            <h2 class="dccgg-detail-title"><span class="dccgg-detail-title-text">${title}</span></h2></div>
            <div class="dccgg-detail-header-actions">
            <button type="button" class="dccgg-btn dccgg-back">Back</button>
            <button type="button" class="dccgg-section-prev" ${prev ? `data-target-key="${prev}"` : 'disabled'}>Prev</button>
            <button type="button" class="dccgg-section-next" ${next ? `data-target-key="${next}"` : 'disabled'}>Next</button>
            </div></div>
            <div class="dccgg-detail-layout"><div class="dccgg-detail-items"><article class="dccgg-item">
            <h3 class="dccgg-item-title"><span class="dccgg-item-title-text">Wifi #1</span></h3>
            <div class="dccgg-item-content-wrap"><div class="dccgg-item-body">${body}</div></div>
            ${key === 'wifi' ? row : ''}</article></div></div></div>`;
        const cfgN = JSON.stringify({ revealMode: 'stage', copyEffect: 'bubbles',
            enableSectionNav: true, strings: {} });
        const htmlN = `<!DOCTYPE html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>${KIT}${CSS}</style></head><body>
            <div class="dccgg-root" data-config='${cfgN.replace(/'/g, '&#39;')}'>
            <div class="dccgg-wrapper"><div class="dccgg-stage-container">
            <div class="dccgg-menu">
              <div class="dccgg-tile-wrap" data-section-key="wifi"><button class="dccgg-tile" data-key="wifi">Internet</button></div>
              <div class="dccgg-tile-wrap" data-section-key="other"><button class="dccgg-tile" data-key="other">Amenities</button></div>
            </div><div class="dccgg-stage">
            ${detail('wifi', 'Internet',
                '<p class="ref">Plain line.</p><p><strong>Editor bold</strong></p>'
                + '<p style="font-weight:700">Pasted inline bold</p>', '', 'other')}
            ${detail('other', 'Amenities', '<p>Other section.</p>', 'wifi', '')}
            </div></div><div class="dccgg-detail-overlay" hidden></div></div></div>
            <script>${JS}</script></body></html>`;
        const { ctx, page } = await newPage(browser, PHONE, htmlN, errors);
        const leaked = () => page.evaluate(() => document.body.innerText.includes('DCC32586'));
        const state = () => page.evaluate(() => {
            const t = document.querySelector('.dccgg-secret-toggle');
            return { revealed: document.querySelector('.dccgg-secret').classList.contains('is-revealed'),
                     text: document.querySelector('.dccgg-secret-value').textContent,
                     label: t.textContent.trim(), expanded: t.getAttribute('aria-expanded') };
        });

        await page.click('.dccgg-tile[data-key="wifi"]');
        await page.waitForTimeout(500);

        // (a) the row reads Password: •••••••• [Show] [Copy], as peers.
        const look = await page.evaluate(() => {
            const g = (el) => { const c = getComputedStyle(el), r = el.getBoundingClientRect();
                return { w: Math.round(r.width), bg: c.backgroundColor, color: c.color,
                         size: c.fontSize, family: c.fontFamily.split(',')[0], radius: c.borderRadius }; };
            return { label: document.querySelector('.dccgg-secret-label').textContent,
                     dots: getComputedStyle(document.querySelector('.dccgg-secret-value'), '::before').content,
                     copyText: document.querySelector('.dccgg-copy').textContent.trim(),
                     toggle: g(document.querySelector('.dccgg-secret-toggle')),
                     copy: g(document.querySelector('.dccgg-copy')) };
        });
        check('the value is labelled "Password:"', look.label === 'Password:', look.label);
        check('it is masked with dots', /•/.test(look.dots), look.dots);
        check('the copy button says just "Copy"', look.copyText === 'Copy', look.copyText);
        check('Show and Copy share one visual treatment',
            look.toggle.bg === look.copy.bg && look.toggle.color === look.copy.color
            && look.toggle.size === look.copy.size && look.toggle.family === look.copy.family
            && look.toggle.radius === look.copy.radius,
            `${look.toggle.bg}/${look.toggle.size}/${look.toggle.family} vs ${look.copy.bg}/${look.copy.size}/${look.copy.family}`);
        check('their widths are comparable, not 76 vs 144',
            Math.abs(look.copy.w - look.toggle.w) <= 40, `${look.toggle.w} vs ${look.copy.w}`);
        check('nothing has leaked before the guest reveals anything', !(await leaked()));

        // (b) revealed, the password IS body copy — not a third control.
        await page.click('.dccgg-secret-toggle');
        await page.waitForTimeout(150);
        const type = await page.evaluate(() => {
            const g = (el) => { const c = getComputedStyle(el);
                return { family: c.fontFamily.split(',')[0], size: c.fontSize,
                         weight: c.fontWeight, color: c.color }; };
            return { par: g(document.querySelector('.dccgg-item-body p.ref')),
                     val: g(document.querySelector('.dccgg-secret-value')) };
        });
        check('a revealed password matches a paragraph exactly',
            JSON.stringify(type.par) === JSON.stringify(type.val),
            `${JSON.stringify(type.val)} vs ${JSON.stringify(type.par)}`);
        let st = await state();
        check('revealing shows the value and flips the label',
            st.text === 'DCC32586' && st.label === 'Hide' && st.expanded === 'true');

        // (c) auto-hide on a section switch. The popup is NOT torn down here,
        // which is exactly why the reveal used to survive.
        await page.click('.dccgg-detail[data-key="wifi"] .dccgg-section-next');
        await page.waitForTimeout(700);
        check('the section actually changed',
            await page.evaluate(() => document.querySelector('.dccgg-detail[data-key="other"]').hidden === false));
        st = await state();
        check('switching sections re-masks the password',
            !st.revealed && st.text === '', `revealed=${st.revealed} text="${st.text}"`);
        check('and resets the label and aria-expanded',
            st.label === 'Show' && st.expanded === 'false', `${st.label}/${st.expanded}`);
        check('nothing is left in the text layer after that auto-hide', !(await leaked()));

        // (c) auto-hide on close, the other lifecycle point.
        await page.click('.dccgg-detail[data-key="other"] .dccgg-section-prev');
        await page.waitForTimeout(600);
        await page.click('.dccgg-secret-toggle');
        await page.waitForTimeout(150);
        await page.click('.dccgg-detail[data-key="wifi"] .dccgg-back');
        await page.waitForTimeout(800);
        st = await state();
        check('closing the popup re-masks the password',
            !st.revealed && st.text === '', `revealed=${st.revealed} text="${st.text}"`);
        check('and resets the label and aria-expanded there too',
            st.label === 'Show' && st.expanded === 'false', `${st.label}/${st.expanded}`);
        check('nothing is left in the text layer after that auto-hide', !(await leaked()));
        check('the value survives in data attributes, so Copy still works',
            await page.evaluate(() => document.querySelector('.dccgg-copy').dataset.copy === 'DCC32586'
                && document.querySelector('.dccgg-secret-value').dataset.secretValue === 'DCC32586'));

        // (e) no bold body text. Both an editor <strong> and a pasted inline
        // font-weight must come back to the paragraph weight; the guide and the
        // public mini guide render the same markup from the same method, so one
        // unqualified rule covers both versions.
        const weights = await page.evaluate(() =>
            [...document.querySelectorAll('.dccgg-item-body p, .dccgg-item-body strong')]
                .map((el) => ({ t: el.textContent.slice(0, 20), w: getComputedStyle(el).fontWeight })));
        check('no detail-popup body text is bold',
            weights.every((x) => parseInt(x.w, 10) < 600), JSON.stringify(weights));
        check('the rule is not scoped to one version',
            !/dccgg-item-body[^{]*\{[^}]*font-weight: inherit/.test(CSS.replace(/\s+/g, ' '))
            || /\.dccgg-root \.dccgg-item-body,/.test(CSS));
        check('item titles keep their own weight',
            await page.evaluate(() => parseInt(getComputedStyle(
                document.querySelector('.dccgg-item-title')).fontWeight, 10) >= 600));

        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }

    await browser.close();

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) {
        console.log('Failures:');
        failures.forEach((f) => console.log('  - ' + f));
        process.exit(1);
    }
}

run().catch((e) => { console.error(e); process.exit(1); });
