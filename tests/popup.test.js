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

    await browser.close();

    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed) {
        console.log('Failures:');
        failures.forEach((f) => console.log('  - ' + f));
        process.exit(1);
    }
}

run().catch((e) => { console.error(e); process.exit(1); });
