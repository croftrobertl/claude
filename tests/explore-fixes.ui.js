/**
 * DCC Guest Guide — the two stylesheet fixes from the /explore/ parity audit
 * (v0.27.7).
 *
 *   G1. the public intro wraps balanced, like every other piece of prose;
 *   S1. a tile on the GRID layout has its card back — the plugin's own 1px
 *       border and 16px radius — while the APP SHELL does not move, and a
 *       host-set control still outranks us.
 *
 *   node tests/explore-fixes.ui.js
 *   DCCGG_PLUGIN_DIR=… DCCGG_UI_SOURCE=1 node tests/explore-fixes.ui.js
 *
 * THE KIT BLOCK IS THE WHOLE TEST. S1 is not a design change, it is a
 * specificity fight with the host theme, so a suite whose ground does not
 * include the rule that wins is a suite that would have passed on 0.27.6 —
 * which is exactly how this defect survived from v0.26.1 to now. The button
 * rule below is copied from the real combined stylesheet as measured on
 * 2026-11-04, with the two declarations the older model left out:
 *
 *   .elementor-kit-331 button { border-style: groove;
 *                               border-width: 0 0 0 0;
 *                               border-radius: 30px }      (0,1,1)
 *
 * which beats .dccgg-tile's own border at (0,1,0). Delete the fix and
 * section B fails; delete these declarations from the block and section B
 * passes for the wrong reason.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const { frontEndJs, chunkBootTag, routeChunks } = require('./_bundles');

const TESTS = __dirname;
const PLUGIN = (process.env.DCCGG_PLUGIN_DIR || path.join(TESTS, '../dcc-guest-guide')).replace(/\/$/, '');
const A = PLUGIN + '/assets/';
const SRC = process.env.DCCGG_UI_SOURCE === '1';
const CSS = SRC ? fs.readFileSync(A + 'css/widget.css', 'utf8')
    : fs.readFileSync(A + 'css/widget.min.css', 'utf8') + fs.readFileSync(A + 'css/widget-guest.min.css', 'utf8');
const JS = frontEndJs(A, SRC);
const emit = (c) => execFileSync('php', [path.join(TESTS, '_emit-guide.php'), c],
    { encoding: 'utf8', env: Object.assign({}, process.env, { DCCGG_PLUGIN_DIR: PLUGIN }) });

const MARKUP = { grid: emit('all-on'), app: emit('app-a1'), public: emit('app-public'),
    // the intro only renders when the host has filled public_intro in, so the
    // app-public case (which does not set it) cannot carry section F.
    intro: emit('public-intro'), 'stray-intro': emit('guest') };

const KIT = `
 html{font-weight:700;line-height:1.8}
 body{margin:0;font-family:Raleway,system-ui,sans-serif}
 .elementor-kit-331 h1,.elementor-kit-331 h2,.elementor-kit-331 h3{font-size:20px}
 .elementor-kit-331 button{font-family:Raleway,sans-serif;font-size:18px;font-weight:900;
   line-height:29px;letter-spacing:1.5px;text-transform:capitalize;
   border-style:groove;border-width:0 0 0 0;border-radius:30px 30px 30px 30px}
 .elementor-kit-331 button:hover,.elementor-kit-331 button:focus,
 .elementor-kit-331 button:active{background-color:#F08080;color:#FFF}
`;

/**
 * A host-set Elementor control, exactly as Elementor compiles one for the
 * live widget: (0,5,0), and emitted after the plugin stylesheet. Used by
 * section C to prove the fix does not trample the host.
 */
const HOST_CONTROL = `
 .elementor-element.elementor-element-2afb24b .dccgg-root.dccgg-root .dccgg-tile{padding:10px 10px 10px 10px;}
 .elementor-element.elementor-element-2afb24b .dccgg-root.dccgg-root .dccgg-tile{border-radius:4px;}
`;

let pass = 0, fail = 0; const failures = [];
function check(name, cond, detail = '') {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function openGuide(browser, which, width, { hostControl = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 },
        isMobile: width < 700, hasTouch: width < 700, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await routeChunks(page, A, SRC);
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width">
        <style>${KIT}</style><style>${CSS}</style>${hostControl ? `<style>${HOST_CONTROL}</style>` : ''}
        </head><body class="elementor-kit-331">
        <div class="elementor-element elementor-element-2afb24b">${MARKUP[which]}</div>
        </body></html>`, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ content: 'window.dccggChunks={base:"https://dccgg.test/a/",ver:"dev",min:false};' });
    await page.addScriptTag({ content: JS });
    await page.waitForTimeout(500);
    return { ctx, page };
}

const TILE = () => {
    const r = document.querySelector('.dccgg-root');
    const t = r.querySelector('.dccgg-tile');
    if (!t) return null;
    const cs = getComputedStyle(t);
    return { appShell: /dccgg-app-shell/.test(r.className),
        borderWidth: cs.borderWidth, borderStyle: cs.borderStyle,
        borderTopWidth: cs.borderTopWidth, borderRadius: cs.borderTopLeftRadius,
        padding: cs.paddingTop };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

    console.log('\nA. The kit block really does strip the border (the suite\'s own ground)');
    {
        const { ctx, page } = await openGuide(browser, 'grid', 390);
        const stripped = await page.evaluate(() => {
            // a bare button under the kit, with no plugin rule on it at all
            const b = document.createElement('button');
            document.body.appendChild(b);
            const cs = getComputedStyle(b);
            const out = { w: cs.borderTopWidth, r: cs.borderTopLeftRadius };
            b.remove(); return out;
        });
        check('the kit zeroes a plain button\'s border', stripped.w === '0px', JSON.stringify(stripped));
        check('and rounds it to 30px', stripped.r === '30px', JSON.stringify(stripped));
        await ctx.close();
    }

    console.log('\nB. S1 — the grid tile has its card back');
    for (const width of [320, 390, 1440]) {
        const { ctx, page } = await openGuide(browser, 'grid', width);
        const t = await page.evaluate(TILE);
        check(`@${width} the tile is on the grid layout, not the shell`, t && !t.appShell);
        check(`@${width} the border is 1px, not the kit's 0`, t && t.borderTopWidth === '1px', JSON.stringify(t));
        check(`@${width} the style is solid, not the kit's groove`, t && t.borderStyle === 'solid', t && t.borderStyle);
        check(`@${width} the radius is the guide's 16px, not the kit's 30px`,
            t && t.borderRadius === '16px', t && t.borderRadius);
        await ctx.close();
    }

    console.log('\nC. A host-set control still outranks the fix');
    {
        const { ctx, page } = await openGuide(browser, 'grid', 390, { hostControl: true });
        const t = await page.evaluate(TILE);
        check('the host\'s padding wins', t && t.padding === '10px', t && t.padding);
        check('the host\'s radius wins over the plugin\'s 16px',
            t && t.borderRadius === '4px', t && t.borderRadius);
        check('and the border the host did NOT set is still the plugin\'s',
            t && t.borderTopWidth === '1px', t && t.borderTopWidth);
        await ctx.close();
    }

    console.log('\nD. The app shell does not move');
    for (const which of ['app', 'public']) {
        const { ctx, page } = await openGuide(browser, which, 390);
        const t = await page.evaluate(TILE);
        if (!t) { check(`${which}: a tile is present`, false); await ctx.close(); continue; }
        check(`${which}: this really is the app shell`, t.appShell, JSON.stringify(t));
        // The shell sets its own border at (0,4,0) and its own radius from
        // --dccgg-app-radius. Neither may become the grid's 16px.
        check(`${which}: the shell keeps its own radius, not the grid's 16px`,
            t.borderRadius !== '16px', t.borderRadius);
        check(`${which}: the shell still has a border`, t.borderTopWidth === '1px', t.borderTopWidth);
        await ctx.close();
    }

    console.log('\nE. The hover border still answers on the grid');
    {
        // DRIVEN WITH A REAL POINTER, not read off the selector text. Raising
        // the stateless border to (0,5,0) could silently outrank the (0,3,0)
        // hover rule and leave the tile dead to a pointer — the same failure
        // v0.26.1 recorded when the tab bar was raised over the rule that
        // hides it. A test that only compared selector strings would pass on
        // a rule that never fires, so this moves the mouse and reads the
        // painted colour.
        const { ctx, page } = await openGuide(browser, 'grid', 1440);
        await page.evaluate(() => {
            document.querySelector('.dccgg-tile')
                .style.setProperty('--dccgg-accent-tile-border-hover', 'rgb(1, 2, 3)');
        });
        const resting = await page.evaluate(() =>
            getComputedStyle(document.querySelector('.dccgg-tile')).borderTopColor);
        check('resting, the tile does NOT wear the hover token',
            resting !== 'rgb(1, 2, 3)', resting);
        check('resting, it wears the ordinary tile-border token',
            resting === 'rgba(0, 107, 207, 0.15)', resting);
        await page.hover('.dccgg-tile');
        await page.waitForTimeout(120);
        const hovered = await page.evaluate(() =>
            getComputedStyle(document.querySelector('.dccgg-tile')).borderTopColor);
        check('hovered, the hover rule still wins over the restored border',
            hovered === 'rgb(1, 2, 3)', `resting ${resting} -> hovered ${hovered}`);
        await ctx.close();
    }

    console.log('\nF. G1 — the public intro wraps balanced');
    for (const width of [320, 390, 1440]) {
        const { ctx, page } = await openGuide(browser, 'intro', width);
        const intro = await page.evaluate(() => {
            const p = document.querySelector('.dccgg-public-intro');
            if (!p) return null;
            const cs = getComputedStyle(p);
            return { wrap: cs.textWrap, align: cs.textAlign, chars: p.textContent.trim().length };
        });
        if (!intro) { check(`@${width} the public intro renders`, false, 'no .dccgg-public-intro in the fixture'); await ctx.close(); continue; }
        check(`@${width} the intro renders with real text`, intro.chars > 20, String(intro.chars));
        check(`@${width} the intro is centred`, intro.align === 'center', intro.align);
        check(`@${width} the intro wraps balanced`, intro.wrap === 'balance', intro.wrap);
        await ctx.close();
    }
    {
        // The fixture's guest case carries a stray public_intro. Styling it is
        // pointless if it ever became visible to a guest, so pin that too.
        const { ctx, page } = await openGuide(browser, 'stray-intro', 390);
        const n = await page.evaluate(() => document.querySelectorAll('.dccgg-public-intro').length);
        check('a stray public intro still does not render in the full guide', n === 0, String(n));
        await ctx.close();
    }

    // ===================================================================
    // The v0.27.7 add-on: the even column and the line-length cap.
    // ===================================================================
    const BODIES = () => {
        const vis = (e) => e.getClientRects().length > 0;
        return Array.from(document.querySelectorAll('.dccgg-item')).filter(vis).map((it) => {
            const body = it.querySelector('.dccgg-item-body');
            if (!body || !vis(body)) return null;
            const ir = it.getBoundingClientRect(), br = body.getBoundingClientRect();
            const p = body.querySelector('p');
            const table = body.querySelector('table');
            const frame = body.querySelector('iframe');
            const wide = (el) => el ? Math.round(el.getBoundingClientRect().width) : null;
            return {
                title: (it.getAttribute('data-item-title') || '').slice(0, 30),
                checkable: it.hasAttribute('data-checkable'),
                inL: Math.round(br.left - ir.left), inR: Math.round(ir.right - br.right),
                col: Math.round(br.width),
                pW: wide(p),
                pMaxWidth: p ? getComputedStyle(p).maxWidth : null,
                pMarginLeft: p ? getComputedStyle(p).marginLeft : null,
                tableW: wide(table), tableMax: table ? getComputedStyle(table).maxWidth : null,
                frameW: wide(frame), frameMax: frame ? getComputedStyle(frame).maxWidth : null,
                emptyParas: Array.from(body.querySelectorAll('p')).filter((x) => {
                    const t = x.textContent.replace(/ /g, ' ').trim();
                    return t === '' || (x.children.length === 1 && x.children[0].tagName === 'BR' && t === '');
                }).length,
            };
        }).filter(Boolean);
    };

    async function openSection(page, label) {
        const tiles = await page.$$('.dccgg-tile');
        for (const t of tiles) {
            const txt = (await t.textContent()).replace(/\s+/g, ' ').trim();
            if (txt.toLowerCase().startsWith(label.toLowerCase())) {
                await t.click(); await page.waitForTimeout(650); return true;
            }
        }
        return false;
    }

    console.log('\nG. The even column — checkable items only');
    for (const width of [390, 1440]) {
        const { ctx, page } = await openGuide(browser, 'grid', width);
        await openSection(page, 'Checkout');
        const rows = await page.evaluate(BODIES);
        const chk = rows.filter((r) => r.checkable);
        check(`@${width} the fixture really has checkable items`, chk.length > 0, String(chk.length));
        check(`@${width} every checkable body is inset 24px on the LEFT`,
            chk.every((r) => r.inL === 24), JSON.stringify(chk.map((r) => r.inL)));
        check(`@${width} ...and 24px on the RIGHT — the insets are EQUAL`,
            chk.every((r) => r.inR === 24), JSON.stringify(chk.map((r) => r.inR)));
        check(`@${width} so the column is centred under the title`,
            chk.every((r) => r.inL === r.inR), 'uneven insets would read as a ragged column');
        await ctx.close();
    }
    {
        // ...and NOT on an item without a checkbox: the inset exists to line
        // the text up with the checkbox, so an item that has none must keep
        // the full width it has today.
        const { ctx, page } = await openGuide(browser, 'grid', 390);
        await openSection(page, 'Rules');
        const rows = await page.evaluate(BODIES);
        const plain = rows.filter((r) => !r.checkable);
        check('the fixture really has non-checkable items', plain.length > 0, String(plain.length));
        check('a non-checkable body is NOT inset',
            plain.every((r) => r.inL === 0 && r.inR === 0),
            JSON.stringify(plain.map((r) => [r.title, r.inL, r.inR])));
        await ctx.close();
    }

    console.log('\nH. The line-length cap');
    for (const width of [390, 1440]) {
        const { ctx, page } = await openGuide(browser, 'grid', width);
        await openSection(page, 'Amenities');
        const rows = await page.evaluate(BODIES);
        const withP = rows.filter((r) => r.pW !== null);
        check(`@${width} bodies with a paragraph are present`, withP.length > 0);
        check(`@${width} the cap is declared on the paragraph`,
            withP.every((r) => r.pMaxWidth === '520px'), JSON.stringify(withP.map((r) => r.pMaxWidth)));
        if (width === 1440) {
            // the column is wider than the cap here, so the cap must BITE and
            // the paragraph must be centred in what is left.
            const wide = withP.filter((r) => r.col > 560);
            check('@1440 the column really is wider than the cap',
                wide.length > 0, JSON.stringify(withP.map((r) => r.col)));
            check('@1440 no paragraph is wider than the cap',
                wide.every((r) => r.pW <= 521), JSON.stringify(wide.map((r) => r.pW)));
            check('@1440 and it is centred, not left-aligned in the column',
                wide.every((r) => r.pMarginLeft !== '0px'), JSON.stringify(wide.map((r) => r.pMarginLeft)));
        } else {
            // phones are narrower than the cap and must be untouched by it
            check('@390 the column is narrower than the cap, so nothing is clipped',
                withP.every((r) => r.col <= 520 && r.pW <= r.col), JSON.stringify(withP.map((r) => [r.col, r.pW])));
        }
        await ctx.close();
    }

    console.log('\nI. The cap does not reach content it was never meant to');
    {
        const { ctx, page } = await openGuide(browser, 'grid', 1440);
        await openSection(page, 'Amenities');
        const rows = await page.evaluate(BODIES);
        const t = rows.find((r) => r.tableW !== null);
        const f = rows.find((r) => r.frameW !== null);
        check('the fixture holds a table inside a body', !!t, JSON.stringify(rows.map((r) => r.title)));
        check('the fixture holds an embed inside a body', !!f);
        if (t) {
            check('the table carries no cap', t.tableMax === 'none', String(t.tableMax));
            check('and is free to be wider than 520px', t.tableW > 520, String(t.tableW));
        }
        if (f) {
            check('the embed carries no cap', f.frameMax === 'none', String(f.frameMax));
            check('and is free to be wider than 520px', f.frameW > 520, String(f.frameW));
        }
        await ctx.close();
    }

    console.log('\nJ. The empty-paragraph guard, in the rendered DOM');
    {
        const { ctx, page } = await openGuide(browser, 'grid', 390);
        await openSection(page, 'Amenities');
        const rows = await page.evaluate(BODIES);
        const stray = rows.find((r) => /Stray empty lines/.test(r.title));
        check('the fixture item with stray blank lines is present', !!stray,
            JSON.stringify(rows.map((r) => r.title)));
        check('no empty paragraph survives into the DOM',
            rows.every((r) => r.emptyParas === 0),
            JSON.stringify(rows.filter((r) => r.emptyParas).map((r) => [r.title, r.emptyParas])));
        const kept = await page.evaluate(() => {
            const a = Array.from(document.querySelectorAll('.dccgg-item'))
                .find((x) => /Stray empty lines/.test(x.getAttribute('data-item-title') || ''));
            const b = a && a.querySelector('.dccgg-item-body');
            return b ? { n: b.querySelectorAll('p').length, text: b.textContent.replace(/\s+/g, ' ').trim() } : null;
        });
        check('the two real paragraphs are kept', kept && kept.n === 2, JSON.stringify(kept));
        check('and their words are still there, in order',
            kept && /Before the gap\.\s*After the gap\./.test(kept.text), JSON.stringify(kept && kept.text));
        await ctx.close();
    }

    await browser.close();
    console.log('');
    if (fail) { console.log(`FAILED (${fail}):`); failures.forEach((f) => console.log(`  - ${f}`)); }
    console.log(`${fail ? '✗' : '✓'} explore-fixes: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
