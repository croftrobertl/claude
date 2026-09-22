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
    await routeReveal(page);
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

// v0.19.0: a masked value is fetched, not shipped. Every fixture that reveals
// one routes the endpoint so the round-trip is exercised rather than mocked
// away — including the failure path, which must fail CLOSED.
const SECRET_VALUE = 'DCC32586';
async function routeReveal(page, { fail = false, calls = null } = {}) {
    const handler = async (route) => {
        const body = route.request().postData() || '';
        if (body.indexOf('action=dccgg_reveal_secret') === -1) { return route.continue(); }
        if (calls) { calls.push(body); }
        if (fail) { return route.fulfill({ status: 404, contentType: 'application/json',
            body: JSON.stringify({ success: false }) }); }
        return route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ success: true, data: { value: SECRET_VALUE } }) });
    };
    await page.route('**/admin-ajax.php', handler);
    await page.route('**/ajax', handler);
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


    // ---- Scenario S: the value is fetched, and fails CLOSED (v0.19.0) -----
    {
        console.log('\nS. A masked value is fetched on tap, and a failure shows nothing');
        const errors = [];
        const cfgS = JSON.stringify({ ajaxUrl: 'https://dccgg.test/wp-admin/admin-ajax.php',
            nonce: 'n1', postId: 4645, widgetId: 'abc123', revealMode: 'stage', strings: {} });
        const htmlS = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
            <body><div class="dccgg-root" data-config='${cfgS.replace(/'/g, '&#39;')}'>
            <article class="dccgg-item"><div class="dccgg-item-utils">
            <span class="dccgg-secret"><span class="dccgg-secret-label">Password:</span>
            <span class="dccgg-secret-value" data-secret-ref="id:a1b2c3"></span>
            <button type="button" class="dccgg-btn dccgg-secret-toggle" aria-expanded="false"
                    data-label-show="Show" data-label-hide="Hide">Show</button></span>
            <button type="button" class="dccgg-btn dccgg-copy" data-secret-ref="id:a1b2c3">Copy</button>
            </div></article></div><script>${JS}</script></body></html>`;

        // The request itself: the right action, the nonce, and the reference —
        // never the value, which the page does not have to send because it
        // does not have it.
        {
            const calls = [];
            const { ctx, page } = await newPage(browser, PHONE, htmlS, errors);
            await routeReveal(page, { calls });
            await page.click('.dccgg-secret-toggle');
            await page.waitForTimeout(300);
            check('Show fetches the value from the endpoint',
                calls.length === 1 && calls[0].includes('action=dccgg_reveal_secret')
                && calls[0].includes('nonce=n1') && calls[0].includes('ref=id%3Aa1b2c3')
                && calls[0].includes('post_id=4645'),
                calls[0] || '(no call)');
            check('and the value then appears as real, selectable text',
                await page.$eval('.dccgg-secret-value', (v) => v.textContent) === 'DCC32586');

            // Re-masking drops the cached copy: the next reveal asks again,
            // so a value is never sitting in the page between reveals.
            await page.click('.dccgg-secret-toggle');
            await page.waitForTimeout(200);
            check('re-masking clears the value from the page',
                await page.evaluate(() => !document.documentElement.outerHTML.includes('DCC32586')));
            await page.click('.dccgg-secret-toggle');
            await page.waitForTimeout(300);
            check('and the next reveal fetches again rather than reusing a stored copy',
                calls.length === 2, `${calls.length} calls`);
            await ctx.close();
        }

        // The failure path. A masked row that cannot load its value must stay
        // masked: an empty "revealed" state reads as "the password is blank".
        {
            // This block MAKES the endpoint fail, so the 404 it logs is the
            // point of the test rather than a defect. Collected separately so
            // it cannot mask a real error in the same run.
            const expected = [];
            const { ctx, page } = await newPage(browser, PHONE, htmlS, expected);
            await routeReveal(page, { fail: true });
            await page.click('.dccgg-secret-toggle');
            await page.waitForTimeout(400);
            const after = await page.evaluate(() => {
                const wrap = document.querySelector('.dccgg-secret');
                const btn = document.querySelector('.dccgg-secret-toggle');
                return { revealed: wrap.classList.contains('is-revealed'),
                         text: document.querySelector('.dccgg-secret-value').textContent,
                         label: btn.textContent.trim(), expanded: btn.getAttribute('aria-expanded'),
                         enabled: !btn.disabled,
                         toast: !!document.querySelector('.dccgg-toast') };
            });
            check('a failed fetch leaves the row masked, not blank-revealed',
                !after.revealed && after.text === '' && after.label === 'Show'
                && after.expanded === 'false',
                `revealed=${after.revealed} text="${after.text}" label=${after.label}`);
            check('it says so, and the button is usable again',
                after.toast && after.enabled);
            check('the only thing logged was the failure we caused',
                expected.every((e) => /404|Failed to load resource/.test(e)),
                expected.filter((e) => !/404|Failed to load resource/.test(e))[0] || '');
            await ctx.close();
        }
        check('no JS errors', errors.length === 0, errors[0]);
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
        // v0.14.0: buttons carry the reference button's 0.5px tracking. The
        // point of this assertion is unchanged — the Elementor kit's 1.5px
        // must not reach them — but the expected value is now the spec's,
        // not "normal".
        check('button letter-spacing is the reference 0.5px, not the kit 1.5px',
            r.backSpacing === '0.5px', r.backSpacing);
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
            <body><div class="dccgg-root" data-config='{"ajaxUrl":"https://dccgg.test/wp-admin/admin-ajax.php","nonce":"n1","postId":4645,"widgetId":"abc123","revealMode":"stage","strings":{}}'>
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
            <span class="dccgg-secret-value" data-secret-ref="id:a1b2c3"></span>
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
            <button class="dccgg-btn dccgg-copy" data-secret-ref="id:a1b2c3">Copy</button></div></article></div>
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
        await page.waitForTimeout(260);   // the value is fetched, not in the DOM
        st = await shown();
        check('tapping Show reveals the value as real text',
            (await page.$eval('.dccgg-secret-value', (v) => v.textContent)) === 'DCC32586', st.css);
        check('toggle flips to Hide and is expanded', st.label === 'Hide' && st.expanded === 'true',
            `"${st.label}" aria-expanded=${st.expanded}`);
        await page.click('.dccgg-secret-toggle');
        await page.waitForTimeout(260);   // the value is fetched, not in the DOM
        check('tapping again re-hides it',
            (await page.$eval('.dccgg-secret-value', (v) => v.textContent)) === ''
            && !(await page.evaluate(() => document.body.innerText.includes('DCC32586'))));

        // v0.19.0: Copy carries a REFERENCE, never the value, and still works
        // without revealing anything on screen. Proven by the call it makes and
        // by the confirmation it shows, which only runs after the copy resolves.
        check('the copy button holds no value, only a reference',
            await page.$eval('.dccgg-copy', (b) => !b.dataset.copy && !!b.dataset.secretRef),
            await page.$eval('.dccgg-copy', (b) => b.dataset.secretRef || '(no ref)'));
        const copyCalls = [];
        await routeReveal(page, { calls: copyCalls });
        // The row is masked at this point and stays that way: Copy must work
        // from the masked state, which is the whole point of it.
        await page.click('.dccgg-copy');
        await page.waitForTimeout(320);
        check('Copy fetches the value and confirms, without revealing it',
            copyCalls.length === 1 && copyCalls[0].includes('ref=id%3Aa1b2c3')
            && await page.$eval('.dccgg-copy', (b) => !!b.querySelector('.dccgg-sr-only'))
            && await page.$eval('.dccgg-secret-value', (v) => v.textContent === ''),
            `calls=${copyCalls.length}`);

        // (f) print: the binder copy needs the real password and no toggle.
        await page.emulateMedia({ media: 'print' });
        const printed = await page.evaluate(() => ({
            val: getComputedStyle(document.querySelector('.dccgg-secret-value'), '::before').content,
            toggle: getComputedStyle(document.querySelector('.dccgg-secret-toggle')).display,
            search: getComputedStyle(document.querySelector('.dccgg-search')).display,
        }));
        // v0.19.0: printing can no longer reveal a value the page does not have.
        // It used to print attr(data-secret-value) for the cottage binder, and
        // that attribute is exactly what leaked. A value revealed on screen is
        // real text in the DOM and prints normally; an unrevealed one prints as
        // dots. This is a deliberate loss, recorded rather than quietly dropped.
        check('print no longer conjures the password out of an attribute',
            !printed.val.includes('DCC32586') && /•/.test(printed.val),
            `masked row prints: ${printed.val}`);
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
              <span class="dccgg-secret"><span class="dccgg-secret-value" data-secret-ref="id:a1b2c3"></span>
              <button class="dccgg-btn dccgg-secret-toggle" aria-expanded="false" data-label-show="Show" data-label-hide="Hide">Show</button></span>
              <button class="dccgg-btn dccgg-copy dccgg-copy--inline" data-secret-ref="id:a1b2c3">Copy</button></dd></div></dl>`;
        const html3 = `<!DOCTYPE html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1"><style>${CSS}</style></head>
            <body><div class="dccgg-root" data-config='{"ajaxUrl":"https://dccgg.test/wp-admin/admin-ajax.php","nonce":"n1","postId":4645,"widgetId":"abc123","revealMode":"stage","strings":{}}'>
            <article class="dccgg-item" data-tts-text="Join the cottage network.">${creds}</article>
            </div><script>${JS}</script></body></html>`;
        const { ctx: ctx3, page: page3 } = await newPage(browser, PHONE, html3, errors);
        const vis = await page3.evaluate(() => document.body.innerText);
        check('structured pair: password not in visible text', !vis.includes('DCC32586'), vis.slice(0, 80));
        check('structured pair: network name IS visible', vis.includes('topoftheworld'));
        check('structured pair: read-aloud text excludes the password',
            await page3.$eval('.dccgg-item', (a) => !a.dataset.ttsText.includes('DCC32586')));
        await page3.click('.dccgg-secret-toggle');
        await page3.waitForTimeout(260);   // the value is fetched, not in the DOM
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
        // v0.16.0: was 44px (WCAG 2.5.5, AAA). The host asked for the credential
        // controls to be visibly smaller than Back so the card stops looking
        // busy, and approved ~38px on the live site, so the AAA target is
        // deliberately given up here. 24px is the AA floor (WCAG 2.5.8) and
        // this assertion holds that line — it must not drift lower by accident.
        check('reveal toggle clears the 24px AA target and is labelled',
            tog.h >= 24 && tog.w >= 24 && tog.label.length > 1,
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
        await page3.waitForTimeout(260);   // the value is fetched, not in the DOM
        check('re-hiding takes it back out of the DOM',
            await page3.evaluate(() => document.querySelector('.dccgg-secret-value').textContent === ''
                && !document.body.innerText.includes('DCC32586')));
        await page3.click('.dccgg-secret-toggle');
        await page3.waitForTimeout(260);   // the value is fetched, not in the DOM

        check('structured pair: the SSID still rides in the markup, the password does not',
            await page3.evaluate(() => {
                const vals = [...document.querySelectorAll('.dccgg-copy')].map((x) => x.dataset.copy || '');
                const refs = [...document.querySelectorAll('.dccgg-copy')].map((x) => x.dataset.secretRef || '');
                return vals.includes('topoftheworld') && !vals.some((v) => v.includes('DCC32586'))
                    && refs.some((r) => r.startsWith('id:'));
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
            <span class="dccgg-secret-value" data-secret-ref="id:a1b2c3"></span>
            <button type="button" class="dccgg-btn dccgg-secret-toggle" aria-expanded="false"
                    data-label-show="Show" data-label-hide="Hide">Show</button></span>
            <button type="button" class="dccgg-btn dccgg-copy" data-secret-ref="id:a1b2c3">Copy</button></div>`;
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
        const cfgN = JSON.stringify({ ajaxUrl: 'https://dccgg.test/wp-admin/admin-ajax.php', nonce: 'n1', postId: 4645, widgetId: 'abc123', revealMode: 'stage', copyEffect: 'bubbles',
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
        // v0.16.0 supersedes part of 0.13.0's acceptance: the revealed value is
        // 0.75em, not body size, because "Password: <value> [Show] [Copy]" has
        // to survive on ONE line at 360px. Everything else still has to match a
        // paragraph — the original complaint was that the value read as a third
        // button, and family/weight/colour are what carried that.
        check('a revealed password still reads as body copy, one notch smaller',
            type.val.family === type.par.family && type.val.weight === type.par.weight
            && type.val.color === type.par.color
            && parseFloat(type.val.size) < parseFloat(type.par.size),
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
        check('nothing survives in a data attribute — the page holds no copy of it',
            await page.evaluate(() => {
                const html = document.documentElement.outerHTML;
                return !html.includes('DCC32586')
                    && !!document.querySelector('.dccgg-copy').dataset.secretRef
                    && !document.querySelector('.dccgg-secret-value').dataset.secretValue;
            }));

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


    // ---- Scenario O: every action button matches the reference (v0.14.0) --
    // The site's reference button is the Contact form's "Send Message". The
    // widget's buttons have to beat two stylesheets that load after ours:
    // Bravada's reset (uppercase, (0,3,1)) and the Elementor kit (18px/900/
    // 1.5px/capitalize, (0,1,1)). This scenario reproduces both and measures.
    {
        console.log('\nO. Buttons match the site reference button, in both versions');
        const errors = [];
        const KIT = `
            body{font-family:Raleway,-apple-system,"system-ui","Segoe UI",Arial,sans-serif;
                 font-size:16px;color:#333;margin:0}
            .site .content .entry button{text-transform:uppercase;border-radius:3px;
                 background:#444;color:#fff;padding:12px 20px}
            .elementor-kit-5 button,.elementor-kit-5 a.elementor-button{
                 font-family:Raleway,sans-serif;font-size:18px;font-weight:900;
                 letter-spacing:1.5px;text-transform:capitalize}
            #reference{font-family:Raleway,-apple-system,"system-ui","Segoe UI",Arial,sans-serif;
                 font-size:20px;font-weight:500;line-height:50px;letter-spacing:.5px;
                 text-transform:none;color:#FFFFFF;background:#006BCF;border:none;
                 border-radius:30px;padding:0;box-shadow:none;width:210px}`;
        // Every button the guide can show in a popup, plus the More dropdown,
        // which v0.14.0 must NOT touch (the host is copying its styling).
        const utils = `<div class="dccgg-item-utils">
            <span class="dccgg-secret"><span class="dccgg-secret-label">Password:</span>
            <span class="dccgg-secret-value" data-secret-ref="id:a1b2c3"></span>
            <button type="button" class="dccgg-btn dccgg-secret-toggle" aria-expanded="false"
                    data-label-show="Show" data-label-hide="Hide">Show</button></span>
            <button type="button" class="dccgg-btn dccgg-copy dccgg-copy--inline" data-secret-ref="id:a1b2c3">Copy</button>
            <a class="dccgg-btn dccgg-map" href="#">View in Maps</a>
            <button type="button" class="dccgg-review-yes">Click to Review</button>
            <button type="button" class="dccgg-review-platform">Copy &amp; open Google</button></div>`;
        const mk = (rootClass) => `<div class="${rootClass}" data-config='${
            JSON.stringify({ revealMode: 'stage', enableSectionNav: true, strings: {} }).replace(/'/g, '&#39;')}'>
            <div class="dccgg-wrapper"><div class="dccgg-stage-container">
            <div class="dccgg-menu"><div class="dccgg-tile-wrap" data-section-key="wifi">
            <button class="dccgg-tile" data-key="wifi">Internet</button></div></div>
            <div class="dccgg-stage"><div class="dccgg-detail" data-key="wifi" hidden>
            <span class="dccgg-shrink-sentinel"></span>
            <div class="dccgg-detail-header"><div class="dccgg-detail-header-titlebar">
            <span class="dccgg-detail-titlebar-spacer"></span>
            <h2 class="dccgg-detail-title"><span class="dccgg-detail-title-text">Internet</span></h2>
            <details class="dccgg-more"><summary class="dccgg-more-summary--text">
            <span class="dccgg-more-summary-text">User Manuals</span></summary>
            <div class="dccgg-more-popover"><button type="button" class="dccgg-more-item">Print guide</button></div>
            </details></div>
            <div class="dccgg-detail-header-actions">
            <button type="button" class="dccgg-btn dccgg-back">Back</button>
            <button type="button" class="dccgg-checklist-reset" data-section-key="wifi">Reset</button></div></div>
            <div class="dccgg-detail-layout"><div class="dccgg-detail-items"><article class="dccgg-item">
            <h3 class="dccgg-item-title"><span class="dccgg-item-title-text">Wifi</span></h3>
            <div class="dccgg-item-content-wrap"><div class="dccgg-item-body"><p>Body.</p></div></div>
            ${utils}</article></div></div></div></div></div></div></div>`;
        const htmlO = `<!DOCTYPE html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>${CSS}</style><style>${KIT}</style></head>
            <body class="site elementor-kit-5"><div class="content"><div class="entry">
            <button id="reference">Send Message</button>
            ${mk('dccgg-root')}${mk('dccgg-root dccgg-root--public')}
            </div></div><script>${JS}</script></body></html>`;

        for (const [vpName, vp] of [['desktop', DESKTOP], ['phone', PHONE]]) {
            const { ctx, page } = await newPage(browser, vp, htmlO, errors);
            // Open the popup in BOTH roots — the second stands in for the
            // public mini guide, which renders the same markup.
            for (const idx of [0, 1]) {
                await page.evaluate((i) => document.querySelectorAll('.dccgg-tile')[i].click(), idx);
                await page.waitForTimeout(450);
            }
            const m = await page.evaluate(() => {
                const read = (el) => {
                    const c = getComputedStyle(el), r = el.getBoundingClientRect();
                    return { family: c.fontFamily.split(',')[0].replace(/["']/g, ''),
                             size: c.fontSize, weight: c.fontWeight, lh: c.lineHeight,
                             ls: c.letterSpacing, tt: c.textTransform, color: c.color,
                             bg: c.backgroundColor, bw: c.borderTopWidth, radius: c.borderRadius,
                             shadow: c.boxShadow, w: Math.round(r.width), h: Math.round(r.height),
                             label: el.textContent.trim().slice(0, 18) };
                };
                const ref = read(document.querySelector('#reference'));
                // Only visible controls; a popup is open, so these live on the
                // portaled stage, which has no .dccgg-root ancestor.
                const sel = '.dccgg-btn, .dccgg-checklist-reset, .dccgg-review-yes,'
                          + '.dccgg-review-no, .dccgg-review-platform, .dccgg-btn-send, .dccgg-btn-cancel';
                const btns = [...document.querySelectorAll(sel)]
                    .filter((el) => el.offsetParent !== null).map(read);
                const drop = read(document.querySelector('.dccgg-more > summary'));
                const overflowing = [...document.querySelectorAll('.dccgg-detail-layout')]
                    .filter((el) => el.scrollWidth > el.clientWidth + 1).length;
                return { ref, btns, drop,
                         docScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                         overflowing,
                         wrapped: [...document.querySelectorAll(sel)]
                             .filter((el) => el.offsetParent !== null)
                             .filter((el) => { const rg = document.createRange();
                                 rg.selectNodeContents(el);
                                 return rg.getClientRects().length > 1; })
                             .map((el) => el.textContent.trim().slice(0, 18)) };
            });
            // v0.16.0: Show/Hide, the Copy beside a secret, and the checklist
            // Reset are deliberately smaller than the reference — the host asked
            // for them to be differentiated from Back. They keep every other
            // property of the spec, so size and line-height come out of the
            // comparison for those three only, and are checked below instead.
            const SMALLER = ['Show', 'Hide', 'Copy', 'Reset'];
            const isSmall = (b) => SMALLER.includes(b.label) && b.h < 50;
            const spec = ['family', 'weight', 'ls', 'tt', 'color', 'bg', 'bw', 'radius', 'shadow'];
            const sized = ['size', 'lh'];
            const off = m.btns.filter((b) => spec.some((k) => b[k] !== m.ref[k])
                || (!isSmall(b) && sized.some((k) => b[k] !== m.ref[k])));
            check(`${vpName}: every action button matches the reference (${m.btns.length} measured)`,
                m.btns.length >= 12 && off.length === 0,
                off.map((b) => b.label + ': ' + spec.filter((k) => b[k] !== m.ref[k])
                    .map((k) => `${k}=${b[k]}≠${m.ref[k]}`).join(',')).join(' | '));
            check(`${vpName}: full-size buttons are 50px, width follows content`,
                m.btns.filter((b) => !isSmall(b)).every((b) => b.h === 50)
                && new Set(m.btns.map((b) => b.w)).size > 1,
                m.btns.map((b) => `${b.label}=${b.w}x${b.h}`).join(' '));
            const small = m.btns.filter(isSmall);
            check(`${vpName}: the credential controls are smaller than Back, and equal to each other`,
                small.length >= 2 && small.every((b) => b.h >= 24 && b.h < 50)
                && new Set(small.filter((b) => b.label !== 'Reset').map((b) => b.h)).size === 1,
                small.map((b) => `${b.label}=${b.w}x${b.h}`).join(' '));
            check(`${vpName}: nothing overflows and no label wraps`,
                !m.docScroll && m.overflowing === 0 && m.wrapped.length === 0,
                `docScroll=${m.docScroll} overflowing=${m.overflowing} wrapped=${JSON.stringify(m.wrapped)}`);
            // The host is copying this control's styling into an Elementor
            // widget of their own, so v0.14.0 must leave it exactly as it was.
            check(`${vpName}: the More dropdown is NOT restyled as a button`,
                m.drop.size === '16px' && m.drop.weight === '400'
                && m.drop.radius === '6px' && m.drop.ls === 'normal',
                `${m.drop.size}/${m.drop.weight}/r${m.drop.radius}/ls${m.drop.ls}`);
            await ctx.close();
        }
        check('no JS errors', errors.length === 0, errors[0]);
    }


    // ---- Scenario P: standard hover + the More menu's own type (v0.15.0) --
    {
        console.log('\nP. Buttons hover to the site standard; the More menu reads as one object');
        const errors = [];
        const KIT = `
            body{font-family:Raleway,-apple-system,"system-ui","Segoe UI",Arial,sans-serif;
                 font-size:16px;color:#333;margin:0}
            .site .content .entry button{text-transform:uppercase;background:#444;color:#fff}
            .elementor-kit-5 button{font-family:Raleway,sans-serif;font-size:18px;font-weight:900;
                 letter-spacing:1.5px;text-transform:capitalize}`;
        const htmlP = `<!DOCTYPE html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>${CSS}</style><style>${KIT}</style></head>
            <body class="site elementor-kit-5"><div class="content"><div class="entry">
            <div class="dccgg-root" data-config='${JSON.stringify({ revealMode: 'stage', enableSectionNav: true, strings: {} }).replace(/'/g, '&#39;')}'>
            <div class="dccgg-wrapper"><div class="dccgg-stage-container">
            <div class="dccgg-menu"><div class="dccgg-tile-wrap" data-section-key="amenities">
            <button class="dccgg-tile" data-key="amenities">Amenities</button></div></div>
            <div class="dccgg-stage"><div class="dccgg-detail" data-key="amenities" hidden>
            <span class="dccgg-shrink-sentinel"></span>
            <div class="dccgg-detail-header"><div class="dccgg-detail-header-titlebar">
            <span class="dccgg-detail-titlebar-spacer"></span>
            <h2 class="dccgg-detail-title"><span class="dccgg-detail-title-text">Amenities</span></h2>
            <details class="dccgg-more"><summary class="dccgg-more-summary--text">
            <span class="dccgg-more-summary-text">User Manuals</span></summary>
            <div class="dccgg-more-popover" role="menu">
            <button type="button" class="dccgg-more-item">Print guide</button>
            <button type="button" class="dccgg-more-item">Save as PDF</button>
            <button type="button" class="dccgg-more-item">Report a problem</button>
            </div></details></div>
            <div class="dccgg-detail-header-actions">
            <button type="button" class="dccgg-btn dccgg-back">Back</button>
            <button type="button" class="dccgg-checklist-reset" data-section-key="amenities">Reset</button></div></div>
            <div class="dccgg-detail-layout"><div class="dccgg-detail-items"><article class="dccgg-item">
            <h3 class="dccgg-item-title"><span class="dccgg-item-title-text">Boat lift</span></h3>
            <div class="dccgg-item-content-wrap"><div class="dccgg-item-body"><p>Body.</p></div></div>
            <div class="dccgg-item-utils">
            <button type="button" class="dccgg-btn dccgg-copy" data-copy="x">Copy</button>
            <a class="dccgg-btn dccgg-map" href="#">View in Maps</a>
            <button type="button" class="dccgg-review-yes">Click to Review</button>
            <button type="button" class="dccgg-review-platform">Copy &amp; open Google</button></div>
            </article></div></div></div></div></div>
            <div class="dccgg-detail-overlay" hidden></div></div></div>
            </div></div><script>${JS}</script></body></html>`;

        // -- Hover, driven by a real pointer. A hover that loses to the
        // resting fill is invisible in the CSS, so this is measured, never
        // reasoned about: the resting rule is (0,4,0) and the hover adds a
        // pseudo-class to that same selector to reach (0,5,0).
        {
            const { ctx, page } = await newPage(browser, DESKTOP, htmlP, errors);
            await page.click('.dccgg-tile[data-key="amenities"]');
            await page.waitForTimeout(450);
            const read = (el) => { const c = getComputedStyle(el);
                return { bg: c.backgroundColor, color: c.color, filter: c.filter }; };
            const sels = ['.dccgg-back', '.dccgg-checklist-reset', '.dccgg-copy',
                          '.dccgg-map', '.dccgg-review-yes', '.dccgg-review-platform'];
            const seen = [];
            for (const sel of sels) {
                const el = await page.$(sel);
                if (!el) continue;
                await el.hover();
                await page.waitForTimeout(240);
                seen.push({ sel, ...await page.evaluate((e) => {
                    const c = getComputedStyle(e);
                    return { bg: c.backgroundColor, color: c.color, filter: c.filter };
                }, el) });
                await page.mouse.move(2, 2);
                await page.waitForTimeout(140);
            }
            const off = seen.filter((h) => h.bg !== 'rgb(240, 128, 128)'
                || h.color !== 'rgb(255, 255, 255)' || h.filter !== 'none');
            check(`every spec button hovers to #F08080 on white (${seen.length} measured)`,
                seen.length === sels.length && off.length === 0,
                off.map((h) => `${h.sel}=${h.bg}/${h.color}/${h.filter}`).join(' '));

            // (d) focus must not rely on the fill — the hover fill and the
            // focus fill are the same colour, so a ring is what distinguishes
            // a focused button from a hovered one.
            await page.keyboard.press('Tab');
            const foc = await page.evaluate(() => {
                const el = document.querySelector('.dccgg-back');
                el.focus();
                const c = getComputedStyle(el);
                return { w: c.outlineWidth, style: c.outlineStyle, color: c.outlineColor,
                         offset: c.outlineOffset, isFv: el.matches(':focus-visible') };
            });
            check('focus-visible draws a ring that does not depend on the fill',
                foc.isFv && foc.style !== 'none' && parseFloat(foc.w) >= 2
                && parseFloat(foc.offset) > 0,
                `${foc.w} ${foc.style} ${foc.color} offset ${foc.offset}`);
            await ctx.close();
        }

        // -- The More menu: items take the dropdown's own type, and the
        // dropdown's chrome does not move. The host is mirroring this control
        // in a widget of their own, so the summary and popover box are fixed.
        for (const [vpName, vp] of [['desktop', DESKTOP], ['phone', PHONE]]) {
            const { ctx, page } = await newPage(browser, vp, htmlP, errors);
            await page.click('.dccgg-tile[data-key="amenities"]');
            await page.waitForTimeout(450);
            await page.click('.dccgg-more > summary');
            await page.mouse.move(4, 4);
            await page.waitForTimeout(700);
            const m = await page.evaluate(() => {
                const g = (el) => getComputedStyle(el);
                const sum = document.querySelector('.dccgg-more > summary');
                const pop = document.querySelector('.dccgg-more-popover');
                const cs = g(sum), cp = g(pop);
                return {
                    summary: { size: cs.fontSize, weight: cs.fontWeight, ls: cs.letterSpacing,
                               tt: cs.textTransform, bg: cs.backgroundColor, color: cs.color,
                               radius: cs.borderRadius, padding: cs.padding,
                               border: cs.borderTopWidth + ' ' + cs.borderTopStyle },
                    popover: { bg: cp.backgroundColor, radius: cp.borderRadius, padding: cp.padding,
                               shadow: cp.boxShadow, minWidth: cp.minWidth, gap: cp.rowGap },
                    items: [...document.querySelectorAll('.dccgg-more-item')].map((el) => {
                        const c = g(el), r = el.getBoundingClientRect();
                        return { label: el.textContent.trim(), size: c.fontSize, weight: c.fontWeight,
                                 ls: c.letterSpacing, tt: c.textTransform, color: c.color,
                                 radius: c.borderRadius, padding: c.padding,
                                 family: c.fontFamily, lines: (() => {
                                     const rg = document.createRange();
                                     rg.selectNodeContents(el);
                                     return rg.getClientRects().length || 1;
                                 })(), h: Math.round(r.height) };
                    }),
                };
            });
            check(`${vpName}: menu items take the dropdown's own type`,
                m.items.length === 3 && m.items.every((i) => i.size === '16px' && i.weight === '400'
                    && i.ls === 'normal' && i.tt === 'none'),
                m.items.map((i) => `${i.label}=${i.size}/${i.weight}/${i.ls}/${i.tt}`).join(' '));
            check(`${vpName}: items match the summary that opens them`,
                m.items.every((i) => i.size === m.summary.size && i.weight === m.summary.weight
                    && i.ls === m.summary.ls && i.tt === m.summary.tt));
            check(`${vpName}: no menu item wraps to a second line`,
                m.items.every((i) => i.lines === 1)
                && new Set(m.items.map((i) => i.h)).size === 1,
                m.items.map((i) => `${i.label}=${i.lines} line(s) ${i.h}px`).join(' '));
            check(`${vpName}: item colour, radius and padding are untouched`,
                m.items.every((i) => i.color === 'rgb(17, 17, 17)' && i.radius === '6px'
                    && i.padding === '8px 10px'),
                m.items.map((i) => `${i.color}/${i.radius}/${i.padding}`).join(' '));
            // The summary is NOT on the button spec — it must not have been
            // swept up by the button or hover rules.
            check(`${vpName}: the dropdown summary is unchanged`,
                m.summary.size === '16px' && m.summary.weight === '400'
                && m.summary.ls === 'normal' && m.summary.radius === '6px'
                && m.summary.padding === '6px 12px' && m.summary.border === '1px solid'
                && m.summary.bg === 'rgb(15, 109, 191)' && m.summary.color === 'rgb(255, 255, 255)',
                JSON.stringify(m.summary));
            check(`${vpName}: the popover box is unchanged`,
                m.popover.bg === 'rgb(255, 255, 255)' && m.popover.radius === '10px'
                && m.popover.padding === '6px' && m.popover.minWidth === '180px'
                && m.popover.gap === '2px' && m.popover.shadow !== 'none',
                JSON.stringify(m.popover));
            await ctx.close();
        }
        check('no JS errors', errors.length === 0, errors[0]);
    }


    // ---- Scenario Q: v0.16.0 — the live look becomes the default ---------
    {
        console.log('\nQ. Credential row, theme immunity, menu tracks, copied state');
        const errors = [];
        // The kit that ships on this host. The coral button rule is the one
        // that washed behind the plain icon buttons; it also sets color:#FFF,
        // which is the trap — clearing only the background leaves white icons
        // on a white card.
        const KIT = `
            body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0}
            .elementor-kit-331 button:hover,.elementor-kit-331 button:focus,
            .elementor-kit-331 button:active{background-color:#F08080;color:#FFFFFF;
              border-radius:30px 30px 30px 30px;}
            .elementor-kit-331 button{line-height:50px;}`;
        const creds = `<dl class="dccgg-wifi-creds">
            <div class="dccgg-wifi-row"><dt>Network:</dt><dd>
              <span class="dccgg-wifi-ssid">topoftheworld</span></dd></div>
            <div class="dccgg-wifi-row"><dt>Password:</dt><dd>
              <span class="dccgg-secret">
                <span class="dccgg-secret-value" data-secret-value="DCC32586x9"></span>
                <button type="button" class="dccgg-btn dccgg-secret-toggle" aria-expanded="false"
                        data-label-show="Show" data-label-hide="Hide">Show</button></span>
              <button type="button" class="dccgg-btn dccgg-copy dccgg-copy--inline"
                      data-copy="DCC32586x9">Copy</button></dd></div></dl>`;
        const menu = (n) => `<div class="dccgg-menu">${
            Array.from({ length: n }, (_, i) =>
                `<div class="dccgg-tile-wrap" data-section-key="s${i}">
                 <button class="dccgg-tile" data-key="s${i}">Section ${i}</button></div>`).join('')}</div>`;
        const htmlQ = (bodyExtra = '') => `<!DOCTYPE html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>${CSS}</style><style>${KIT}</style></head>
            <body class="elementor-kit-331">
            <div class="dccgg-root" data-config='{"revealMode":"stage","strings":{"copied":"Copied!"}}'>
            <div class="dccgg-wrapper"><div class="dccgg-stage-container">${menu(4)}
            <div class="dccgg-stage"><div class="dccgg-detail" data-key="s0" hidden>
            <span class="dccgg-shrink-sentinel"></span>
            <div class="dccgg-detail-header"><div class="dccgg-detail-header-actions">
            <button type="button" class="dccgg-btn dccgg-back">Back</button></div></div>
            <div class="dccgg-detail-layout"><div class="dccgg-detail-items">
            <article class="dccgg-item">
            <h3 class="dccgg-item-title">
              <button class="dccgg-item-check" aria-pressed="false"><span class="dccgg-item-check-box"></span></button>
              <span class="dccgg-item-title-text">Cottage Wi-Fi</span>
              <button class="dccgg-item-tts" aria-pressed="false">🔊</button>
              <button class="dccgg-item-report">⚑</button></h3>
            <div class="dccgg-item-content-wrap"><div class="dccgg-item-body"><p>Join the network.</p></div></div>
            ${creds}</article></div></div></div></div>
            <div class="dccgg-detail-overlay" hidden></div></div></div>${bodyExtra}
            <script>${JS}</script></body></html>`;

        // (7) One centred row at 360px — and it must STAY one row when the
        // value is revealed, which is where the old two-column grid gave up.
        {
            const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
            const page = await ctx.newPage();
            page.on('pageerror', (e) => errors.push(String(e)));
            await page.setContent(htmlQ(), { waitUntil: 'load' });
            await page.click('.dccgg-tile[data-key="s0"]');
            await page.waitForTimeout(500);
            const rowTops = () => page.evaluate(() => {
                const row = document.querySelectorAll('.dccgg-wifi-row')[1];
                const kids = [row.querySelector('dt'), row.querySelector('.dccgg-secret-value'),
                              row.querySelector('.dccgg-secret-toggle'), row.querySelector('.dccgg-copy')]
                    .filter((el) => el && el.getBoundingClientRect().width > 0);
                // Centres, not tops: a 19px label and a 35px button sitting on
                // the same centred row have different tops by design.
                const mids = kids.map((el) => { const r = el.getBoundingClientRect();
                    return Math.round((r.top + r.bottom) / 2); });
                const lines = mids.filter((m, i) => mids.findIndex((n) => Math.abs(n - m) <= 6) === i).length;
                const r = row.getBoundingClientRect();
                return { lines, count: kids.length, height: Math.round(r.height),
                         overflow: r.right > document.documentElement.clientWidth + 0.5,
                         labels: kids.map((el) => el.className || el.tagName) };
            });
            const masked = await rowTops();
            check('360px: label, value and both buttons sit on one row',
                masked.lines === 1 && masked.count === 4 && !masked.overflow,
                `${masked.lines} line(s) of ${masked.count} controls ${JSON.stringify(masked.labels)}`);
            await page.click('.dccgg-secret-toggle');
            await page.waitForTimeout(150);
            const revealed = await rowTops();
            check('360px: revealing the password does NOT push it onto a second row',
                revealed.lines === 1 && !revealed.overflow
                && revealed.height <= masked.height + 2,
                `${revealed.lines} line(s), ${masked.height}px -> ${revealed.height}px`);

            // (o) The copied confirmation must not lengthen the row, and the
            // word must still reach a screen reader.
            const restW = await page.$eval('.dccgg-copy', (b) => Math.round(b.getBoundingClientRect().width));
            await page.click('.dccgg-copy');
            await page.waitForTimeout(120);
            const copied = await page.evaluate(() => {
                const b = document.querySelector('.dccgg-copy');
                const sr = b.querySelector('.dccgg-sr-only');
                const row = document.querySelectorAll('.dccgg-wifi-row')[1];
                const kids = [row.querySelector('dt'), ...row.querySelectorAll('dd > *, .dccgg-secret > *')]
                    .filter((el) => el && el.getBoundingClientRect().width > 0);
                const mids = kids.map((el) => { const r = el.getBoundingClientRect();
                    return Math.round((r.top + r.bottom) / 2); });
                return { w: Math.round(b.getBoundingClientRect().width),
                         srText: sr ? sr.textContent : null,
                         srWidth: sr ? Math.round(sr.getBoundingClientRect().width) : -1,
                         hidden: sr ? sr.getAttribute('aria-hidden') : 'missing',
                         geom: kids.map((el) => { const r = el.getBoundingClientRect();
                             return `${(el.className || el.tagName).split(' ').pop()}:${Math.round(r.left)}-${Math.round(r.right)}@${Math.round((r.top + r.bottom) / 2)}`; }).join(' '),
                         lines: mids.filter((m, i) => mids.findIndex((n) => Math.abs(n - m) <= 6) === i).length };
            });
            check('(o) the copied state never widens the button',
                copied.w <= restW, `${restW}px -> ${copied.w}px`);
            check('(o) the row still does not wrap while confirming', copied.lines === 1, copied.geom);
            check('(o) the confirmation text stays in the accessibility tree',
                copied.srText === 'Copied!' && copied.hidden !== 'true' && copied.srWidth <= 1,
                `"${copied.srText}" hidden=${copied.hidden} width=${copied.srWidth}`);
            await ctx.close();
        }

        // (10) The kit must not paint the plain icon buttons — and must not
        // leave them white on white either.
        {
            const ctx = await browser.newContext({ viewport: DESKTOP });
            const page = await ctx.newPage();
            page.on('pageerror', (e) => errors.push(String(e)));
            await page.setContent(htmlQ(), { waitUntil: 'load' });
            await page.click('.dccgg-tile[data-key="s0"]');
            await page.waitForTimeout(500);
            const probe = [];
            for (const sel of ['.dccgg-item-check', '.dccgg-item-tts', '.dccgg-item-report']) {
                const el = await page.$(sel);
                await el.hover();
                await page.waitForTimeout(200);
                probe.push({ sel, ...await page.evaluate((e) => {
                    const c = getComputedStyle(e);
                    return { bg: c.backgroundColor, color: c.color };
                }, el) });
            }
            check('no host-theme coral washes behind the plain buttons on hover',
                probe.every((p) => p.bg !== 'rgb(240, 128, 128)'),
                probe.map((p) => `${p.sel}=${p.bg}`).join(' '));
            check('and none of them is left white on a white card',
                probe.every((p) => p.color !== 'rgb(255, 255, 255)'),
                probe.map((p) => `${p.sel}=${p.color}`).join(' '));
            // A key press first: after a click the interaction modality is
            // "mouse" and a programmatic focus() does not match :focus-visible.
            await page.keyboard.press('Tab');
            const ring = await page.evaluate(() => {
                const el = document.querySelector('.dccgg-item-tts');
                el.focus();
                const c = getComputedStyle(el);
                return { w: c.outlineWidth, style: c.outlineStyle, fv: el.matches(':focus-visible') };
            });
            check('keyboard focus is still visible on them without the coral fill',
                ring.fv && ring.style !== 'none' && parseFloat(ring.w) >= 2,
                `${ring.w} ${ring.style} focus-visible=${ring.fv}`);
            await ctx.close();
        }

        // (n) auto-fit: four tiles in a container wide enough for five tracks.
        {
            const ctx = await browser.newContext({ viewport: DESKTOP });
            const page = await ctx.newPage();
            page.on('pageerror', (e) => errors.push(String(e)));
            await page.setContent(htmlQ(), { waitUntil: 'load' });
            const tracks = await page.evaluate(() => {
                const m = document.querySelector('.dccgg-menu');
                document.querySelector('.dccgg-root').classList.add('dccgg-layout-grid');
                m.style.width = '1200px';   // fits 5 x 200px tracks + 4 x 20px gaps
                // auto-fit does not omit the track it collapses — it reports it
                // as 0px — so "no empty track" means no NON-ZERO spare one.
                const cols = getComputedStyle(m).gridTemplateColumns.split(' ')
                    .map(parseFloat).filter((w) => w > 0);
                const widths = [...document.querySelectorAll('.dccgg-tile-wrap')]
                    .map((t) => Math.round(t.getBoundingClientRect().width));
                return { cols, widths };
            });
            check('(n) 4 tiles in a 5-track container render 4 equal tracks, no empty one',
                tracks.cols.length === 4 && new Set(tracks.widths).size === 1,
                `${tracks.cols.length} tracks, widths ${JSON.stringify(tracks.widths)}`);
            // The real question is not "how many tracks" — that depends on the
            // container and the gap — but "does auto-fit change anything for a
            // menu that fills its row". So compare the two directly.
            const ab = await page.evaluate(() => {
                const wrap = document.querySelector('.dccgg-menu');
                const count = () => getComputedStyle(wrap).gridTemplateColumns.split(' ')
                    .map(parseFloat).filter((w) => w > 0).length;
                const fitFour = count();
                wrap.style.gridTemplateColumns = 'repeat(auto-fill, minmax(var(--dccgg-tile-min), 1fr))';
                const fillFour = count();
                wrap.style.removeProperty('grid-template-columns');
                for (let i = 4; i < 8; i++) {
                    const d = document.createElement('div');
                    d.className = 'dccgg-tile-wrap';
                    d.innerHTML = '<button class="dccgg-tile">x</button>';
                    wrap.appendChild(d);
                }
                const fitEight = count();
                wrap.style.gridTemplateColumns = 'repeat(auto-fill, minmax(var(--dccgg-tile-min), 1fr))';
                const fillEight = count();
                return { fitFour, fillFour, fitEight, fillEight };
            });
            check('(n) auto-fit drops the empty track that auto-fill kept',
                ab.fitFour === 4 && ab.fillFour > ab.fitFour,
                `4 tiles: auto-fit ${ab.fitFour} tracks vs auto-fill ${ab.fillFour}`);
            check('(n) a menu that fills every track is bit-for-bit unaffected',
                ab.fitEight === ab.fillEight,
                `8 tiles: auto-fit ${ab.fitEight} tracks vs auto-fill ${ab.fillEight}`);
            await ctx.close();
        }

        // (l) Escape must still belong to the lightbox and the report dialog.
        // The QR selector came out of those guards; the other two had to stay.
        {
            const ctx = await browser.newContext({ viewport: DESKTOP });
            const page = await ctx.newPage();
            page.on('pageerror', (e) => errors.push(String(e)));
            await page.setContent(htmlQ(
                '<dialog class="dccgg-lightbox"></dialog><dialog class="dccgg-report-dialog"></dialog>'),
                { waitUntil: 'load' });
            const guards = await page.evaluate(() => {
                const lb = document.querySelector('.dccgg-lightbox');
                const rd = document.querySelector('.dccgg-report-dialog');
                lb.showModal();
                const lbSeen = !!document.querySelector('.dccgg-lightbox[open], .dccgg-report-dialog[open]');
                lb.close(); rd.showModal();
                const rdSeen = !!document.querySelector('.dccgg-lightbox[open], .dccgg-report-dialog[open]');
                rd.close();
                const none = !!document.querySelector('.dccgg-lightbox[open], .dccgg-report-dialog[open]');
                return { lbSeen, rdSeen, none };
            });
            check('(l) the Escape guard still sees an open lightbox and report dialog',
                guards.lbSeen && guards.rdSeen && !guards.none);
            const src = JS;
            check('(l) and the guard no longer mentions the removed QR dialog',
                !src.includes('.dccgg-qr-dialog') && (src.match(/dccgg-lightbox\[open\]/g) || []).length >= 2,
                `lightbox guards: ${(src.match(/dccgg-lightbox\[open\]/g) || []).length}`);
            await ctx.close();
        }

        // (m) The public guide must end up with the source guide's values ON
        // THE PAGE. v0.16.0 failed here in production while every unit-level
        // assertion passed: the re-scoping was right and the delivery was not —
        // wp_add_inline_style() on a handle already printed in wp_head is
        // discarded silently. So this asks PHP for the markup the plugin
        // ACTUALLY emits, puts it in a page, and measures the result. A test
        // that only calls the transform cannot see that class of bug.
        {
            const { execFileSync } = require('child_process');
            const os = require('os');
            const cssFile = path.join(os.tmpdir(), 'dccgg-source-' + process.pid + '.css');
            fs.writeFileSync(cssFile, [
                '.elementor-4645 .elementor-element.elementor-element-2afb24b'
                    + ' .dccgg-root.dccgg-root .dccgg-menu{--dccgg-gap:5px;--dccgg-tile-min:120px;}',
                '@media(max-width:767px){.elementor-4645 .elementor-element.elementor-element-2afb24b'
                    + ' .dccgg-root.dccgg-root .dccgg-menu{--dccgg-grid-cols-mobile-tpl:repeat(2,1fr);}}',
                '.elementor-4645{--page-padding:20px;}',
            ].join('\n'));
            const emit = (args = []) => execFileSync('php',
                [path.join(__dirname, '_emit-source-css.php'), cssFile, '4645', '2afb24b', ...args],
                { encoding: 'utf8' });
            const emitted = emit();
            const twice = emit(['--twice']);
            fs.unlinkSync(cssFile);

            check('(m) the plugin emits the scoped CSS as markup, not as a late enqueue',
                emitted.startsWith('<style') && emitted.includes('--dccgg-tile-min:120px'),
                emitted.slice(0, 80) || '(nothing emitted)');
            check('(m) two public guides sharing a source print it once',
                (twice.match(/id="dccgg-source-4645"/g) || []).length === 1,
                `${(twice.match(/id="dccgg-source-4645"/g) || []).length} style blocks`);

            const ctx = await browser.newContext({ viewport: PHONE });
            const page = await ctx.newPage();
            page.on('pageerror', (e) => errors.push(String(e)));
            // The host page's Elementor wrapper is a DIFFERENT post id — that
            // difference is the whole bug.
            const hostPage = (styleTag) => `<!DOCTYPE html><html><head><meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>${CSS}</style></head><body>
                <div class="elementor elementor-18119">
                <div class="elementor-element elementor-element-2afb24b">
                ${styleTag}
                <div class="dccgg-root"><div class="dccgg-wrapper"><div class="dccgg-stage-container">
                ${menu(4)}</div></div></div></div></div></body></html>`;
            const read = () => page.evaluate(() => {
                const m = document.querySelector('.dccgg-menu');
                const cs = getComputedStyle(m);
                return { tile: cs.getPropertyValue('--dccgg-tile-min').trim(),
                         gap: cs.getPropertyValue('--dccgg-gap').trim(),
                         rules: document.querySelectorAll('style').length,
                         names: document.documentElement.outerHTML
                             .split('elementor-element-2afb24b').length - 1 };
            });

            // Control: the source page's own stylesheet, unmodified, is what
            // 0.15.0 shipped — present in the page and unable to match.
            await page.setContent(hostPage(
                '<style>.elementor-4645 .elementor-element.elementor-element-2afb24b'
                + ' .dccgg-root.dccgg-root .dccgg-menu{--dccgg-gap:5px;--dccgg-tile-min:120px;}</style>'),
                { waitUntil: 'load' });
            const before = await read();
            check('(m) control: the source-scoped CSS is present but cannot apply here',
                before.tile !== '120px',
                `--dccgg-tile-min=${before.tile || '(plugin default)'}`);

            // Control: emitting nothing at all — which is what 0.16.0 did on
            // the live site — must fail this assertion, not pass it.
            await page.setContent(hostPage(''), { waitUntil: 'load' });
            const none = await read();
            check('(m) control: with nothing emitted the guide falls back to defaults',
                none.tile !== '120px' && none.names >= 1,
                `--dccgg-tile-min=${none.tile || '(plugin default)'}`);

            await page.setContent(hostPage(emitted), { waitUntil: 'load' });
            const after = await read();
            check('(m) the rendered page carries a rule naming the re-rendered element',
                after.names > 1, `${after.names} mentions of the element id`);
            check('(m) and the public guide computes the source guide\'s values',
                after.tile === '120px' && after.gap === '5px',
                `--dccgg-tile-min=${after.tile} --dccgg-gap=${after.gap}`);

            // The responsive value has to survive too — it is the one that
            // decides whether the mobile menu is one column or two.
            const cols = await page.evaluate(() => {
                const m = document.querySelector('.dccgg-menu');
                document.querySelector('.dccgg-root').classList.add('dccgg-layout-grid');
                return { tpl: getComputedStyle(m).getPropertyValue('--dccgg-grid-cols-mobile-tpl').trim(),
                         tracks: getComputedStyle(m).gridTemplateColumns.split(' ')
                             .map(parseFloat).filter((w) => w > 0).length };
            });
            check('(m) the mobile column count comes across, so the menu is 2 columns',
                cols.tpl === 'repeat(2,1fr)' && cols.tracks === 2,
                `tpl="${cols.tpl}" tracks=${cols.tracks}`);
            await ctx.close();
        }
        check('no JS errors', errors.length === 0, errors[0]);
    }


    // ---- Scenario R: the Request Support close button (v0.16.2) ----------
    {
        console.log('\nR. The report dialog\'s close button is a real 44px target');
        const errors = [];
        // The kit as served on this host. Both halves of the bug are here: the
        // horizontal padding on bare `button`, which landed outside a declared
        // width and doubled the box, and the (0,2,0) type rule that beat the
        // plugin's (0,1,0) font-size so the glyph rendered at 18px/900.
        const KIT = `
            html{font-weight:700}
            body{font-family:Raleway,-apple-system,sans-serif;font-size:16px;color:#333;margin:0}
            .elementor-kit-331 button{padding:0 18px;font-family:Raleway,sans-serif;
              font-size:18px;font-weight:900;letter-spacing:1.5px;line-height:50px;}
            .elementor-kit-331 button:hover{background-color:#F08080;color:#FFFFFF;}
            /* The kit's own field reset, at the specificity it really carries:
               (0,3,1) for inputs, (0,1,1) for textareas. A doubled scope ties
               the first of those and is then settled by source order — which is
               why the plugin uses a third repeat. */
            .elementor-kit-331 input:not([type="button"]):not([type="submit"]){
              border:2px solid #F4DA62;border-radius:30px;background-color:#f7f7f7;
              padding:6px 8px;text-align:left;font-size:13px;color:#555;}
            .elementor-kit-331 textarea{border:2px solid #F4DA62;border-radius:30px;
              background-color:#f7f7f7;padding:6px 8px;text-align:left;font-size:13px;color:#555;}
            .elementor-kit-331 select{background-color:#f7f7f7;font-size:13px;color:#555;}
            /* The site's form-label typography, served inline in the head. The
               underline is deliberate and stays; it is the propagation onto a
               nested field that has to be stopped. */
            .elementor-kit-331 label{color:rgba(2,0,0,.58);font-family:Raleway;
              font-size:19px;text-decoration:underline;}`;
        const cfg = JSON.stringify({ revealMode: 'stage', strings: {},
            report: { enabled: true, categories: ['Something is broken'],
                      strings: { title: 'Request Support', close: 'Close', send: 'Send report',
                                 cancel: 'Cancel', desc: 'Describe the problem' } } });
        const htmlR = `<!DOCTYPE html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>${CSS}</style><style>${KIT}</style></head>
            <body class="elementor-kit-331">
            <div class="dccgg-root" data-config='${cfg.replace(/'/g, '&#39;')}'>
            <div class="dccgg-wrapper"><div class="dccgg-stage-container">
            <article class="dccgg-item">
            <h3 class="dccgg-item-title"><span class="dccgg-item-title-text">Boat lift</span>
            <button type="button" class="dccgg-item-report" data-report-section="Amenities"
                    data-report-item="Boat lift">⚑</button></h3>
            </article></div></div></div><script>${JS}</script></body></html>`;

        const { ctx, page } = await newPage(browser, { width: 393, height: 852 }, htmlR, errors);
        await page.click('.dccgg-item-report');
        await page.waitForTimeout(300);
        const m = await page.evaluate(() => {
            const btn = document.querySelector('.dccgg-report-close');
            if (!btn) return null;
            const svg = btn.querySelector('svg');
            const b = btn.getBoundingClientRect();
            const g = svg ? svg.getBoundingClientRect() : null;
            const c = getComputedStyle(btn);
            return {
                w: Math.round(b.width), h: Math.round(b.height),
                svgW: g ? Math.round(g.width) : -1, svgH: g ? Math.round(g.height) : -1,
                padding: c.padding, boxSizing: c.boxSizing, color: c.color,
                label: btn.getAttribute('aria-label'),
                svgHidden: svg ? svg.getAttribute('aria-hidden') : null,
                // A text × would leave ink the SVG does not: assert the button
                // carries no visible text of its own.
                text: btn.textContent.trim(),
                open: !!document.querySelector('.dccgg-report-dialog[open]'),
            };
        });
        check('the dialog opened and has a close button', m && m.open);
        check('the close button is 44x44 despite the kit\'s horizontal padding',
            m.w === 44 && m.h === 44, `${m.w}x${m.h} padding=${m.padding} box-sizing=${m.boxSizing}`);
        check('the mark is an SVG of 19x19 — 43.2% on BOTH axes',
            m.svgW === 19 && m.svgH === 19
            && Math.abs(m.svgW / m.w - m.svgH / m.h) < 0.01,
            `${m.svgW}x${m.svgH} = ${(m.svgW / m.w * 100).toFixed(1)}% x ${(m.svgH / m.h * 100).toFixed(1)}%`);
        check('no text glyph is left behind to be sized by the theme\'s font',
            m.text === '', `"${m.text}"`);
        check('the button keeps its accessible name and the mark stays decorative',
            m.label === 'Close' && m.svgHidden === 'true', `aria-label="${m.label}" svg aria-hidden=${m.svgHidden}`);

        // v0.17.0: the close button takes the site's standard coral hover. The
        // mark is currentColor, so white ON the coral is what keeps it visible
        // — the pairing matters more than either value alone.
        await page.hover('.dccgg-report-close');
        await page.waitForTimeout(220);
        const hov = await page.evaluate(() => {
            const c = getComputedStyle(document.querySelector('.dccgg-report-close'));
            return { color: c.color, bg: c.backgroundColor };
        });
        check('the close button hovers to the site coral with a white mark',
            hov.bg === 'rgb(240, 128, 128)' && hov.color === 'rgb(255, 255, 255)',
            `${hov.color} on ${hov.bg}`);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(150);

        // (B) The dialog's copy is black and not bold — the site sets
        // html{font-weight:700}, so anything that does not declare a weight
        // inherits bold, which is half of why the old copy read as grey mush.
        const copy = await page.evaluate(() => {
            const g = (sel) => { const el = document.querySelector(sel);
                if (!el) return null;
                const c = getComputedStyle(el);
                return { color: c.color, weight: c.fontWeight, opacity: c.opacity }; };
            return { dialog: g('.dccgg-report-dialog'), body: g('.dccgg-report-body'),
                     label: g('.dccgg-report-body label'), privacy: g('.dccgg-report-privacy'),
                     textarea: g('.dccgg-report-desc') };
        });
        const parts = Object.entries(copy).filter(([, v]) => v);
        check('(B) every line of the dialog is black, not grey',
            parts.every(([, v]) => v.color === 'rgb(0, 0, 0)' && v.opacity === '1'),
            parts.map(([k, v]) => `${k}=${v.color}@${v.opacity}`).join(' '));
        check('(B) body copy is not bold despite html{font-weight:700}',
            copy.body.weight === '400' && copy.privacy.weight === '400'
            && copy.textarea.weight === '400' && copy.label.weight === '600',
            parts.map(([k, v]) => `${k}=${v.weight}`).join(' '));

        // It still has to close the dialog.
        await page.click('.dccgg-report-close');
        await page.waitForTimeout(250);
        check('clicking it still closes the dialog',
            !(await page.evaluate(() => !!document.querySelector('.dccgg-report-dialog[open]'))));

        // (8C) The DCC field standard, measured on the rendered dialog against
        // the kit's real reset. Every value here is the checkout's, not a
        // lookalike — that is the point of copying the file rather than
        // matching by eye.
        //
        // Reopen first: the close-button assertions above shut the dialog, and
        // a closed <dialog> is display:none — every field measures 0px and
        // ::placeholder resolves against an unrendered element, which reads as
        // a styling failure when it is really a measuring one.
        await page.click('.dccgg-item-report');
        await page.waitForTimeout(300);
        const fields = await page.evaluate(() => {
            const read = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const c = getComputedStyle(el);
                const ph = getComputedStyle(el, '::placeholder');
                const r = el.getBoundingClientRect();
                return { bg: c.backgroundColor, border: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor,
                         radius: c.borderTopLeftRadius, minH: c.minHeight, h: Math.round(r.height),
                         padding: c.padding, family: c.fontFamily.split(',')[0].replace(/["']/g, ''),
                         size: c.fontSize, weight: c.fontWeight, lh: c.lineHeight,
                         align: c.textAlign, color: c.color, box: c.boxSizing,
                         phColor: ph.color, phOpacity: ph.opacity,
                         appearance: c.appearance, alignLast: c.textAlignLast,
                         bgImage: c.backgroundImage === 'none' ? 'none' : 'svg' };
            };
            return { text: read('.dccgg-report-name'), email: read('.dccgg-report-contact'),
                     tel: read('.dccgg-report-phone'), area: read('.dccgg-report-desc'),
                     select: read('.dccgg-report-cat') };
        });
        const all = Object.entries(fields).filter(([, v]) => v);
        const bad = (name, ok) => all.filter(([, v]) => !ok(v)).map(([k, v]) => `${k}=${v[name]}`).join(' ');
        check('(8C) every field is the white pill: 2px gold, 30px radius',
            all.every(([, v]) => v.bg === 'rgb(255, 255, 255)'
                && v.border === '2px solid rgb(244, 218, 98)' && v.radius === '30px'),
            all.map(([k, v]) => `${k}=${v.bg}/${v.border}/${v.radius}`).join(' | '));
        check('(8C) 44px floor, Raleway 16px/1.3, border-box',
            all.every(([, v]) => v.h >= 44 && v.family === 'Raleway' && v.size === '16px'
                && v.lh === '20.8px' && v.box === 'border-box'),
            all.map(([k, v]) => `${k}=${v.h}px ${v.family} ${v.size}/${v.lh}`).join(' | '));
        // v0.18.0: the textarea rejoins the rest. The 0.17.2 left-align
        // exception was tried in place and the owner chose consistency across
        // the form over the reading argument for prose.
        check('(8C) every field is centred, the textarea included',
            all.every(([, v]) => v.align === 'center'),
            all.map(([k, v]) => `${k}=${v.align}`).join(' '));
        check('(8C) padding is 10px 20px (the select keeps room for its caret)',
            fields.text.padding === '10px 20px' && fields.area.padding === '10px 20px'
            && fields.select.padding === '10px 40px 10px 20px',
            `text=${fields.text.padding} area=${fields.area.padding} select=${fields.select.padding}`);
        // The two lines the standard flags as most likely to be deleted as
        // redundant. Each gets its own named assertion so a tidy-up fails here.
        check('(8C) FLAGGED LINE 1: the typed-in value colour is declared black',
            all.every(([, v]) => v.color === 'rgb(0, 0, 0)'), bad('color', (v) => v.color === 'rgb(0, 0, 0)'));
        // ::placeholder only resolves on an element that HAS a placeholder —
        // Chromium returns the element's own inherited colour otherwise. None
        // of this dialog's fields sets one today, so the rule has no visible
        // effect yet and is that much more likely to be deleted as dead. It is
        // exercised here by giving a field a placeholder, which is exactly what
        // a future field would do.
        const ph = await page.evaluate(() => {
            const i = document.querySelector('.dccgg-report-name');
            const t = document.querySelector('.dccgg-report-desc');
            i.placeholder = 'Your name';
            t.placeholder = 'What went wrong?';
            const g = (el) => { const c = getComputedStyle(el, '::placeholder');
                return { color: c.color, opacity: c.opacity }; };
            const out = { input: g(i), area: g(t) };
            i.removeAttribute('placeholder');
            t.removeAttribute('placeholder');
            return out;
        });
        check('(8C) FLAGGED LINE 2: ::placeholder is the muted grey at full opacity',
            ph.input.color === 'rgb(107, 114, 128)' && ph.input.opacity === '1'
            && ph.area.color === 'rgb(107, 114, 128)',
            `input=${ph.input.color}@${ph.input.opacity} textarea=${ph.area.color}`);
        check('(8C) not bold, despite html{font-weight:700} and font: inherit on the textarea',
            all.every(([, v]) => v.weight === '400'), bad('weight', (v) => v.weight === '400'));
        check('(8C) the select drops native chrome and draws its own caret',
            fields.select.appearance === 'none' && fields.select.alignLast === 'center'
            && fields.select.bgImage === 'svg',
            `appearance=${fields.select.appearance} align-last=${fields.select.alignLast} caret=${fields.select.bgImage}`);
        check('(8C) a textarea keeps room for five rows',
            fields.area.minH === '100px', fields.area.minH);

        // Focus is an outline and never a fill change — white on #f08080 is
        // 2.59:1, so the fill cannot be what carries focus.
        await page.keyboard.press('Tab');
        const foc = await page.evaluate(() => {
            const el = document.querySelector('.dccgg-report-name');
            el.focus();
            const c = getComputedStyle(el);
            return { w: c.outlineWidth, style: c.outlineStyle, color: c.outlineColor,
                     offset: c.outlineOffset, bg: c.backgroundColor, fv: el.matches(':focus-visible') };
        });
        check('(8C) focus draws a 3px blue ring and leaves the fill alone',
            foc.fv && foc.w === '3px' && foc.style === 'solid'
            && foc.color === 'rgb(0, 107, 207)' && foc.offset === '2px'
            && foc.bg === 'rgb(255, 255, 255)',
            `${foc.w} ${foc.style} ${foc.color} offset ${foc.offset} on ${foc.bg}`);

        // ---- item 2: the placeholder is its own string ----------------------
        const cat = await page.evaluate(() => {
            const sel = document.querySelector('.dccgg-report-cat');
            const lab = sel.closest('label').querySelector('.dccgg-report-label');
            return { placeholder: sel.options[0].textContent, label: lab ? lab.textContent : null,
                     disabled: sel.options[0].disabled, value: sel.options[0].value };
        });
        check('(2) the category placeholder ships as "Select"',
            cat.placeholder === 'Select', `"${cat.placeholder}"`);
        check('(2) it no longer repeats the label verbatim',
            cat.placeholder !== cat.label, `label="${cat.label}" placeholder="${cat.placeholder}"`);
        check('(2) and it is still an unselectable prompt, not a choice',
            cat.disabled === true && cat.value === '');

        // ---- item 3: labels, fields and heading all centred -----------------
        const centred = await page.evaluate(() => {
            const labels = [...document.querySelectorAll('.dccgg-report-body label')];
            const h3 = document.querySelector('.dccgg-report-head h3');
            const dialog = document.querySelector('.dccgg-report-dialog');
            // Where the heading's INK actually sits, not where its box does:
            // centring inside a flex item that hugs its text would measure as
            // "center" and still look wrong.
            const rg = document.createRange();
            rg.selectNodeContents(h3);
            const ink = rg.getBoundingClientRect();
            const d = dialog.getBoundingClientRect();
            return {
                labels: labels.length,
                labelAligns: [...new Set(labels.map((l) => getComputedStyle(l).textAlign))],
                h3Align: getComputedStyle(h3).textAlign,
                inkOffset: Math.abs((ink.left + ink.right) / 2 - (d.left + d.right) / 2),
            };
        });
        check('(3) all six labels are centred',
            centred.labels === 6 && centred.labelAligns.length === 1
            && centred.labelAligns[0] === 'center',
            `${centred.labels} labels, aligns=${JSON.stringify(centred.labelAligns)}`);
        check('(3) the heading is centred in the DIALOG, not in the space the close button left',
            centred.h3Align === 'center' && centred.inkOffset <= 2,
            `text-align=${centred.h3Align}, ink is ${centred.inkOffset.toFixed(1)}px off the dialog's centre`);

        // ---- item 4: the underline, measured where it bites -----------------
        // The kit underlines `label`; decoration propagates from an ancestor
        // box to its in-flow descendants and a descendant CANNOT switch it off.
        // So asserting `text-decoration: none` on the input proves nothing —
        // it computed none while visibly underlined. Walk the ancestors.
        const underline = await page.evaluate(() => {
            const fields = ['.dccgg-report-cat', '.dccgg-report-name', '.dccgg-report-cottage',
                            '.dccgg-report-phone', '.dccgg-report-contact', '.dccgg-report-desc'];
            const offenders = [];
            fields.forEach((sel) => {
                const el = document.querySelector(sel);
                if (!el) { offenders.push(sel + ':missing'); return; }
                for (let n = el; n && n !== document.body; n = n.parentElement) {
                    const line = getComputedStyle(n).textDecorationLine;
                    if (line && line.includes('underline')) {
                        offenders.push(sel + ' under ' + n.tagName.toLowerCase()
                            + '.' + (n.className || '').split(' ')[0]);
                        break;
                    }
                }
            });
            const spans = [...document.querySelectorAll('.dccgg-report-label')];
            return { offenders,
                     spans: spans.length,
                     spanLines: [...new Set(spans.map((x) => getComputedStyle(x).textDecorationLine))],
                     labelLines: [...new Set([...document.querySelectorAll('.dccgg-report-body label')]
                         .map((l) => getComputedStyle(l).textDecorationLine))] };
        });
        check('(4) no field has an underlined ancestor — the typed value is clean',
            underline.offenders.length === 0, underline.offenders.join(', '));
        check('(4) the label BOX no longer carries the decoration',
            underline.labelLines.length === 1 && underline.labelLines[0] === 'none',
            JSON.stringify(underline.labelLines));
        check('(4) the underline is kept, on the label text itself',
            underline.spans === 6 && underline.spanLines.length === 1
            && underline.spanLines[0] === 'underline',
            `${underline.spans} spans, ${JSON.stringify(underline.spanLines)}`);
        // Control: without the span the kit's underline reaches the field, which
        // is the bug — proof the structure is doing the work, not the test.
        const ctrlUnderline = await page.evaluate(() => {
            const lab = document.querySelector('.dccgg-report-name').closest('label');
            lab.style.textDecoration = 'underline';          // as the kit had it
            const inputLine = getComputedStyle(document.querySelector('.dccgg-report-name')).textDecorationLine;
            const labLine = getComputedStyle(lab).textDecorationLine;
            lab.style.removeProperty('text-decoration');
            return { inputLine, labLine };
        });
        check('(4) control: an underlined label still reports "none" on the field it underlines',
            ctrlUnderline.labLine === 'underline' && ctrlUnderline.inputLine === 'none',
            `label=${ctrlUnderline.labLine} input=${ctrlUnderline.inputLine} — why the input's own value proves nothing`);

        // Control: the kit wins at a doubled scope, which is why the rules use
        // a third repeat. Proven by re-running the same declarations one class
        // shorter and watching the kit take them back.
        const control = await page.evaluate(() => {
            const st = document.createElement('style');
            st.textContent = '.dccgg-report-dialog.dccgg-report-dialog input[type="text"]'
                + '{background-color:#ffffff;text-align:center;font-size:16px;}';
            document.head.appendChild(st);   // head: after the kit, before the body <style>
            const c = getComputedStyle(document.querySelector('.dccgg-report-name'));
            const out = { align: c.textAlign, size: c.fontSize };
            st.remove();
            return out;
        });
        check('(8C) control: a doubled scope only ties the kit — the third repeat is load-bearing',
            control.align === 'center' && control.size === '16px',
            `at (0,3,1) the winner is decided by source order: align=${control.align} size=${control.size}`);

        // Scope: ONLY report-close changed. The other three close buttons are
        // left exactly as they were, deliberately — including the fact that
        // they too are &times; entities rather than icons. Asserting that keeps
        // the scope honest: if a later change sweeps them up, this fails and
        // the decision gets made on purpose rather than in passing.
        check('report-close no longer uses a text entity',
            !JS.includes('dccgg-report-close" aria-label="${escAttr(STR.close || \'Close\')}">&times;')
            && /dccgg-report-close[\s\S]{0,200}<svg/.test(JS));
        check('the other close buttons are untouched by this change',
            /class="dccgg-lightbox-close"[\s\S]{0,120}&times;/.test(JS),
            'lightbox-close still renders &times;, as before');
        check('no JS errors', errors.length === 0, errors[0]);
        await ctx.close();
    }


    // ---- Scenario T: hover is a pointer capability, not a state (v0.19.0) --
    {
        console.log('\nT. Hover colours reach a mouse and not a finger');
        const errors = [];
        // A host who has set the hover colours in the panel. These now arrive
        // as tokens on the root — exactly what Elementor will emit — instead of
        // as :hover rules in the per-post stylesheet, where no guard reaches.
        const TOKENS = `.dccgg-root{--dccgg-btn-bg-hover:#123456;--dccgg-btn-txt-hover:#fedcba;
            --dccgg-nav-bg-hover:#222222;--dccgg-qa-bg-hover:#333333;}`;
        const htmlT = `<!DOCTYPE html><html><head><meta charset="utf-8">
            <style>${CSS}</style><style>${TOKENS}</style></head><body>
            <div class="dccgg-root"><div class="dccgg-item-utils">
            <button type="button" class="dccgg-btn dccgg-copy" data-copy="x">Copy</button>
            </div></div></body></html>`;
        const readHover = async (viewport, opts) => {
            const ctx = await browser.newContext({ viewport, ...opts });
            const page = await ctx.newPage();
            page.on('pageerror', (e) => errors.push(String(e)));
            await page.setContent(htmlT, { waitUntil: 'load' });
            const caps = await page.evaluate(() => ({
                hover: matchMedia('(hover: hover)').matches,
                fine: matchMedia('(pointer: fine)').matches,
            }));
            await page.hover('.dccgg-copy');
            await page.waitForTimeout(220);
            const bg = await page.$eval('.dccgg-copy', (b) => getComputedStyle(b).backgroundColor);
            await ctx.close();
            return { caps, bg };
        };
        const mouse = await readHover(DESKTOP, {});
        const touch = await readHover(PHONE, { isMobile: true, hasTouch: true });
        check('a fine pointer gets the configured hover colour',
            mouse.caps.hover && mouse.caps.fine && mouse.bg === 'rgb(18, 52, 86)',
            `hover=${mouse.caps.hover} fine=${mouse.caps.fine} bg=${mouse.bg}`);
        check('a touch context gets NO hover colour, so nothing can stick to a tap',
            !touch.caps.fine && touch.bg !== 'rgb(18, 52, 86)',
            `hover=${touch.caps.hover} fine=${touch.caps.fine} bg=${touch.bg}`);
        check('and the token is what carried it — no :hover rule was needed in per-post CSS',
            CSS.includes('--dccgg-btn-bg-hover'));
        check('no JS errors', errors.length === 0, errors[0]);
    }


    // ---- Scenario U: a video keeps its own shape (v0.20.0) ---------------
    {
        console.log('\nU. Portrait and landscape videos each keep their shape');
        const errors = [];
        // Exactly what render_item() emits for two video items, one portrait
        // and one landscape, including the data-ratio the JS reads.
        const poster = (key, ratio) => `<button type="button" class="dccgg-video-poster"
            data-embed="https://www.youtube.com/embed/${key}" data-ratio="${ratio}"
            aria-label="Play video" style="background-image:url('x.jpg');--dccgg-video-ratio:${ratio};">
            <span class="dccgg-video-play" aria-hidden="true">▶</span></button>`;
        const htmlU = `<!DOCTYPE html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>${CSS}</style></head><body>
            <div class="dccgg-root"><div class="dccgg-detail-items" style="width:360px">
            <article class="dccgg-item" id="tall">${poster('short', '9 / 16')}</article>
            <article class="dccgg-item" id="wide">${poster('normal', '16 / 9')}</article>
            <article class="dccgg-item" id="plain"><button type="button" class="dccgg-video-poster"
                data-embed="https://www.youtube.com/embed/legacy" aria-label="Play video"
                style="background-image:url('x.jpg');">▶</button></article>
            </div></div><script>${JS}</script></body></html>`;
        const { ctx, page } = await newPage(browser, PHONE, htmlU, errors);
        const box = (sel) => page.$eval(sel, (el) => {
            const r = el.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height),
                     ratio: getComputedStyle(el).aspectRatio, tag: el.tagName };
        });
        const tall0 = await box('#tall .dccgg-video-poster');
        const wide0 = await box('#wide .dccgg-video-poster');
        const plain0 = await box('#plain .dccgg-video-poster');
        check('a portrait poster is taller than it is wide',
            tall0.h > tall0.w && Math.abs(tall0.h / tall0.w - 16 / 9) < 0.05,
            `${tall0.w}x${tall0.h} (${tall0.ratio})`);
        check('a landscape poster is unchanged',
            wide0.w > wide0.h && Math.abs(wide0.w / wide0.h - 16 / 9) < 0.05,
            `${wide0.w}x${wide0.h} (${wide0.ratio})`);
        check('a video with no ratio set keeps the old 16:9 exactly',
            Math.abs(plain0.w / plain0.h - 16 / 9) < 0.05,
            `${plain0.w}x${plain0.h} (${plain0.ratio})`);

        // The click swaps the poster for an iframe. If the two disagree the box
        // jumps the moment the guest presses play — which is the same class of
        // bug as the original crop, just triggered later.
        await page.click('#tall .dccgg-video-poster');
        await page.click('#wide .dccgg-video-poster');
        await page.waitForTimeout(150);
        const tall1 = await box('#tall iframe.dccgg-media');
        const wide1 = await box('#wide iframe.dccgg-media');
        check('the portrait poster became an iframe of the SAME box',
            tall1.tag === 'IFRAME' && tall1.w === tall0.w && Math.abs(tall1.h - tall0.h) <= 1,
            `poster ${tall0.w}x${tall0.h} -> iframe ${tall1.w}x${tall1.h}`);
        check('and the landscape one likewise',
            wide1.tag === 'IFRAME' && wide1.w === wide0.w && Math.abs(wide1.h - wide0.h) <= 1,
            `poster ${wide0.w}x${wide0.h} -> iframe ${wide1.w}x${wide1.h}`);
        check('the two videos really do render at different shapes',
            tall1.h > wide1.h * 2, `portrait ${tall1.h}px vs landscape ${wide1.h}px`);

        // Legacy path: no data-ratio at all must still produce a 16:9 iframe.
        await page.click('#plain .dccgg-video-poster');
        await page.waitForTimeout(120);
        const plain1 = await box('#plain iframe.dccgg-media');
        check('a legacy video with no ratio still plays at 16:9',
            Math.abs(plain1.w / plain1.h - 16 / 9) < 0.05,
            `${plain1.w}x${plain1.h}`);
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
