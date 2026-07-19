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
