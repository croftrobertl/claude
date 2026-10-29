/**
 * tests/real-theme/ — THE REAL PAGE, NOT A REPRODUCTION.
 *
 * Captured 2026-10-26 from https://doracanalcourt.com/submit-booking/ by the
 * live-swap method: a GET of the live page (never a submission), its thirty
 * stylesheets downloaded IN DOCUMENT ORDER, its eighteen inline <style> blocks
 * left exactly where they were, and the fonts localised so text metrics are
 * the site's own. Order matters and is the fixture's whole point: Seasons
 * found that reordering the sheets broke the cascade.
 *
 * WHY THIS EXISTS. 0.36.0's card suite reproduced the theme's CLIPPING and not
 * its STACKING, so its hit-test — added precisely because geometry assertions
 * cannot see a card that is painted over — passed while the top half of the
 * card was invisible on staging at all three widths. A reproduction tests the
 * rules someone thought to reproduce. This fixture tests the rules the theme
 * really has.
 *
 * REFRESH IT AFTER ANY BRAVADA OR ELEMENTOR UPDATE, with
 * `php tests/real-theme/refresh.php` (see that file). The capture's date is
 * asserted below so a stale fixture is visible rather than silent.
 *
 * WHAT IS THE REAL PAGE AND WHAT IS DERIVED:
 *   - the whole document, every stylesheet, the header, the menu and its
 *     eight-link dropdown, and the `lost` state's dead end: REAL.
 *   - the `taken` state's wrapper content: DERIVED. It is the bare text node
 *     the Director read on live for 0.35.2 ("Accommodation is already
 *     booked."), put back into the real wrapper, because reaching that state
 *     for real needs a booked stay and we do not submit anything on live.
 *   - the DCC_RESTORE payload: OUR BUILD'S, which is what the server would
 *     print. The strings are guarded against the shipped PHP in
 *     tests/restore/run.php so this copy cannot drift.
 *   - the `dcc_layout` body class and checkout-layout.css for the switch-on
 *     state: exactly what Assets::enqueue() and Assets::body_class() print
 *     when Layout::active() is true.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const PLUGIN = path.join(HERE, '..', '..', 'dcc-custom-checkout');
const ASSETS = path.join(PLUGIN, 'assets');
const CAPTURED = path.join(HERE, 'page-local-css.html');
const CAPTURE_DATE = '2026-10-26';
const MIN = !!process.env.DCC_MIN;

let pass = 0;
const fails = [];
/* ONE LINE PER ASSERTION, STARTING AT COLUMN 0. The mutation runner reads a
   suite's outcome from lines beginning "PASS" or "FAIL" — a tally alone is
   "no verdict printed", which is what the baseline preflight caught this
   suite doing, exactly as it is meant to. Leading spaces hide the line from
   it just as effectively as printing nothing. */
function check(name, got, want) {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a === b) { pass++; console.log('PASS  ' + name); return; }
    fails.push(`${name}\n      got  ${a}\n      want ${b}`);
    console.log('FAIL  ' + name);
    console.log('      got  ' + a);
    console.log('      want ' + b);
}

/* THE PAYLOAD — ONE COPY, shared with the live-swap verification, and
   compared against the shipped PHP by tests/restore/run.php. */
const { cfg, availBody, COTTAGES } = require('./payload.js');

/* ---------------------------------------------------------------------- *
 * Build one state of the real page.
 * ---------------------------------------------------------------------- */

function build(state, layoutOn) {
    let h = fs.readFileSync(CAPTURED, 'utf8');

    /* Our build, in place of the 0.35.3 the live page served.
       SOURCE BY DEFAULT, built under DCC_MIN. That split is the point: a suite
       that only ever reads the built bundle cannot see a mutation of the
       source, and the runner does not rebuild between mutations — so listing
       such a suite on a mutation is apparent coverage (0.35.1). Live serves
       the built files, so the DCC_MIN pass is the one that matches live and
       both are registered. */
    const sfx = MIN ? '.min' : '';
    h = h.replace(/href="css\/\d+-checkout\.min\.css"/,
        'href="file://' + path.join(ASSETS, 'checkout' + sfx + '.css') + '"');
    ['guest-count', 'checkout', 'select-list', 'restore'].forEach((n) => {
        h = h.replace(
            new RegExp('https://doracanalcourt\\.com/wp-content/plugins/dcc-custom-checkout/assets/'
                + n + '\\.min\\.js\\?ver=[0-9.]+', 'g'),
            'file://' + path.join(ASSETS, n + sfx + '.js'));
    });

    /* The payload this request would carry. */
    h = h.replace(/var DCC_RESTORE = \{[\s\S]*?\};/,
        'var DCC_RESTORE = ' + cfg(state) + ';');

    if (layoutOn) {
        /* Exactly what Assets::enqueue() adds when Layout::active(): the
           layout stylesheet AFTER checkout.css, and the body class. */
        h = h.replace(/(<link rel="stylesheet" href="file:\/\/[^"]*checkout\.min\.css">)/,
            '$1<link rel="stylesheet" href="file://'
            + path.join(ASSETS, 'checkout-layout' + sfx + '.css') + '">');
        h = h.replace(/(<body[^>]*class=")/, '$1dcc_layout ');
    }

    if (state === 'taken') {
        /* DERIVED — see the header. MotoPress's sentence is a bare text node
           directly inside its own wrapper (the Director's live read for
           0.35.2), and the wrapper is otherwise the real one. */
        h = h.replace(/(<div class="mphb_sc_checkout-wrapper[^"]*">)[\s\S]*?(<\/div>)/,
            '$1Accommodation is already booked.$2');
    }

    if (state === 'form') {
        /* THE FORM PAGE, WHICH 0.36.2 MUST NOT TOUCH. A cookieless GET of live
           IS the dead end, so the form state cannot be captured — the first
           version of this check measured a dead-end page and reported
           "form=false, cardover=true", which proved nothing at all. A form in
           MotoPress's own wrapper is enough: restore.js branches on whether a
           form exists, so this is the real fork, and the theme's CSS around it
           is the live page's. */
        h = h.replace(/(<div class="mphb_sc_checkout-wrapper[^"]*">)[\s\S]*?(<\/div>)/,
            '$1<form class="mphb_sc_checkout-form" method="post" action="/submit-booking/">'
            + '<p class="mphb-text-control"><label>First Name'
            + '<input type="text" name="mphb_first_name"></label></p>'
            + '<p><button type="submit" class="button">Submit Booking</button></p>'
            + '</form>$2');
    }

    /* Relative hrefs in the captured page point at css/ and font/ here. */
    h = h.replace(/<head([^>]*)>/,
        '<head$1><base href="file://' + HERE + '/">');

    const out = path.join(HERE, '.state-' + state + '-' + (layoutOn ? 'on' : 'off')
        + (MIN ? '-min' : '') + '.html');
    fs.writeFileSync(out, h);
    return out;
}

/* ---------------------------------------------------------------------- *
 * What is measured in the page.
 * ---------------------------------------------------------------------- */

function measure() {
    const card = document.querySelector('.dcc_checkout-continue');
    const cs = (el, p) => (el ? getComputedStyle(el).getPropertyValue(p) : null);
    const box = (el) => {
        if (!el) { return null; }
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const shown = (el) => !!(el && el.offsetWidth > 0 && el.offsetHeight > 0);
    const name = (el) => (el ? (el.id ? '#' + el.id : el.tagName.toLowerCase()
        + (el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : '')) : 'nothing');

    const out = {
        hasCard: !!card,
        cards: document.querySelectorAll('.dcc_checkout-continue').length,
        cardBox: box(card),
        cardZ: cs(card, 'z-index'),
        cardPos: cs(card, 'position'),
        inHeader: !!(card && card.classList.contains('dcc_checkout-continue--inheader')),
        parent: card && card.parentNode ? name(card.parentNode) : null,
        prevSibling: card && card.previousElementSibling ? name(card.previousElementSibling) : null,
        /* 0.36.2 — "BLUE ALL THE WAY": what paints below the card. */
        blue: (() => {
            const main = document.getElementById('main');
            const art = document.querySelector('article.hentry');
            const foot = document.getElementById('colophon');
            if (!card || !main || !art || !foot) { return null; }
            const cb = card.getBoundingClientRect().bottom + window.pageYOffset;
            const ft = foot.getBoundingClientRect().top + window.pageYOffset;
            /* Every element painting a background between the two, the footer
               and its own contents aside. Before 0.36.2 this held `main` and
               the article in white; after it, only the body's blue. */
            const painters = [];
            document.querySelectorAll('*').forEach((el) => {
                const r = el.getBoundingClientRect();
                if (r.top + window.pageYOffset + r.height < cb - 1) { return; }
                if (el === foot || foot.contains(el)) { return; }
                const bg = getComputedStyle(el).backgroundColor;
                if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') { return; }
                painters.push(((el.id ? '#' + el.id : el.tagName.toLowerCase())) + ' ' + bg);
            });
            return {
                bodyBg: cs(document.body, 'background-color'),
                mainBg: cs(main, 'background-color'),
                mainPadTop: cs(main, 'padding-top'),
                mainPadBottom: cs(main, 'padding-bottom'),
                mainMarginBottom: cs(main, 'margin-bottom'),
                mainHeight: Math.round(main.getBoundingClientRect().height),
                artBg: cs(art, 'background-color'),
                artMargin: cs(art, 'margin-bottom'),
                gap: Math.round(ft - cb),
                painters: painters.sort(),
                /* NOTHING MAY BE HIDDEN OR REMOVED (the Director's
                   instruction): the schema metas stay in the page.
                   SCOPED TO `main`, AND PINNED, because the first version of
                   this was `document.querySelectorAll(...).length > 0` — and
                   TWO of those nodes (`#site-title`, `#site-description`) are
                   in the HEADER. So it would have read 2 > 0 and passed with
                   every schema node inside `main` stripped, which is the one
                   thing the claim is about. Three counts that all reconcile,
                   recorded so nobody re-derives them: 13 for this selector
                   document-wide, 11 for it inside `main` (the Director's
                   number, and what is asserted), 10 for
                   `[itemprop], [itemscope]` inside `main` (his earlier note).
                   Same markup, counted three ways. */
                schemaNodes: main.querySelectorAll('.schema-image, [itemprop]').length,
                /* AND THE COUNT ALONE CANNOT CATCH THE FORBIDDEN APPROACH.
                   0.36.2 is CSS-only and CSS cannot remove a node, so a count
                   can never go red from a mutation of this stylesheet —
                   `querySelectorAll` finds display:none elements too. What the
                   Director's instruction rules out is HIDING `main` or its
                   children, and that is exactly what a stylesheet CAN do, so
                   it is asserted directly. (Several of the eleven — the
                   `<meta>`s and the theme's hidden featured `<picture>` — are
                   legitimately unrendered already, which is why this asks
                   about `main` and the article rather than about each node.) */
                mainDisplay: cs(main, 'display'),
                mainVisibility: cs(main, 'visibility'),
                artDisplay: cs(art, 'display'),
                artVisibility: cs(art, 'visibility'),
            };
        })(),

        /* THE THEME'S CROP MUST BE UNTOUCHED — the whole reason the card is a
           sibling of the photo band and not a child of it. */
        bandOverflow: cs(document.getElementById('header-image-main'), 'overflow'),
        bandInsideOverflow: cs(document.getElementById('header-image-main-inside'), 'overflow'),
        bandBox: box(document.getElementById('header-image-main')),
        themeTitleShown: shown(document.getElementById('header-page-title')),
        menuZ: cs(document.getElementById('site-header-main'), 'z-index'),
        mastheadZ: cs(document.getElementById('masthead'), 'z-index'),
        sideScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        pageHeight: Math.round(document.documentElement.scrollHeight),
        h1s: [...document.querySelectorAll('h1')].map((h) => ({
            text: (h.textContent || '').trim().slice(0, 40),
            shown: shown(h),
            isCardTitle: h.classList.contains('dcc_checkout-continue__title'),
        })),
        deadEndVisible: [...document.querySelectorAll('.mphb_sc_checkout-wrapper')]
            .map((w) => (w.innerText || '').trim()).join('|'),
        chips: [...document.querySelectorAll('.dcc_checkout-chip')].length,
        strip: [...document.querySelectorAll('.dcc_checkout-strip__link')].length,
    };

    /* THE HIT-TEST, at three depths into the card's top. The card's own
       geometry cannot show that something is painted over it, which is how
       0.36.0 shipped green while the heading and the lead were invisible. */
    out.topIsHittable = card ? [12, 80, 150].map((dy) => {
        const r = card.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + dy);
        if (!hit) { return 'nothing'; }
        if (hit === card || card.contains(hit)) { return 'card'; }
        return name(hit);
    }) : null;

    /* AND THE BOTTOM, WHICH IS A DIFFERENT FAILURE. The card is a sibling of
       the photo band, not a child of it, because the band and its inner box
       are both `overflow: hidden` and crop at 420px. Put the card INSIDE
       either of them and its top three depths are all still hittable — 260,
       340 and 410 are all inside the band — while everything below 420 is
       cut off: the button, and on the taken card the chips. Three top probes
       cannot see that, so the bottom and the primary control are probed too.
       getBoundingClientRect() reports the full box of a clipped element, so
       geometry alone cannot see it either. */
    const btn = card ? card.querySelector('.dcc_checkout-continue__go, button, a[href]') : null;
    out.bottomIsHittable = card ? (() => {
        const r = card.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.bottom - 12);
        if (!hit) { return 'nothing'; }
        if (hit === card || card.contains(hit)) { return 'card'; }
        return name(hit);
    })() : null;
    out.buttonIsHittable = btn ? (() => {
        const r = btn.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!(hit && (hit === btn || btn.contains(hit)));
    })() : null;

    return out;
}

/* Nothing of OURS may be left pinned to the window. */
function stuck() {
    return [...document.querySelectorAll('[class*="dcc_"]')]
        .filter((el) => {
            const p = getComputedStyle(el).position;
            return p === 'fixed' || p === 'sticky';
        })
        .map((el) => String(el.className).trim().split(/\s+/)[0]);
}

/* ---------------------------------------------------------------------- *
 * Run
 * ---------------------------------------------------------------------- */

const WIDTHS = [390, 768, 1440];

(async () => {
    /* The fixture's own guards first: a suite that silently reads a missing
       or stale capture proves nothing. */
    check('the capture is on disk (the guard on every check below)',
        fs.existsSync(CAPTURED), true);
    const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
    check('all thirty of the live page\'s stylesheets were captured',
        manifest.length, 30);
    check('every captured stylesheet has bytes (no silent 404 in the cascade)',
        manifest.filter((m) => !m.bytes).length, 0);
    check('the sheets are numbered in document order, 1..30',
        manifest.map((m) => m.order), manifest.map((_, i) => i + 1));
    const readme = fs.readFileSync(path.join(HERE, 'README.md'), 'utf8');
    check('the capture states its date, so a stale fixture is visible',
        readme.includes(CAPTURE_DATE), true);

    const browser = await chromium.launch();
    const report = {};

    for (const state of ['taken', 'lost']) {
        for (const layoutOn of [false, true]) {
            const file = build(state, layoutOn);
            const label = `${state}/switch-${layoutOn ? 'on' : 'off'}`;

            for (const w of WIDTHS) {
                const ctx = await browser.newContext({
                    viewport: { width: w, height: w < 500 ? 844 : 900 },
                    deviceScaleFactor: 1,
                    isMobile: w < 500,
                    hasTouch: w < 500,
                });
                const page = await ctx.newPage();

                /* Offline and deterministic: the only network this page is
                   allowed is the availability endpoint, stubbed.

                   THE CATCH-ALL IS REGISTERED FIRST ON PURPOSE. Playwright
                   matches the most recently added route, so registering the
                   catch-all last aborts the stubbed endpoint with it — which
                   is what the first run of this suite did, and the chips then
                   read 0 while the fix itself was fine. */
                await page.route('**/*', (route) => {
                    const u = route.request().url();
                    if (u.startsWith('file://')) { return route.continue(); }
                    return route.abort();
                });
                await page.route('**/admin-ajax.php*', (route) => route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: availBody(),
                }));

                await page.goto('file://' + file, { waitUntil: 'load' });
                await page.waitForTimeout(state === 'taken' ? 1800 : 600);

                const m = await page.evaluate(measure);
                report[`${label}@${w}`] = m;

                /* ---- THE DEFECT 0.36.1 EXISTS TO FIX ---- */
                check(`${label}@${w}: the card's top is not painted over (top+12/+80/+150)`,
                    m.topIsHittable, ['card', 'card', 'card']);
                check(`${label}@${w}: and its bottom is not clipped away either`,
                    [m.bottomIsHittable, m.buttonIsHittable], ['card', true]);

                /* ---- and the placement that achieves it ---- */
                check(`${label}@${w}: the card is in the header, after the photo band`,
                    [m.hasCard, m.cards, m.inHeader, m.parent, m.prevSibling],
                    [true, 1, true, '#masthead', '#header-image-main']);
                check(`${label}@${w}: the card is ordered above the theme's title and below the menu`,
                    [m.cardPos, m.cardZ, m.menuZ, m.mastheadZ],
                    ['relative', '12', '251', '999']);

                /* ---- the theme's crop is untouched: the reason for a sibling ---- */
                check(`${label}@${w}: the photo band still crops the photo`,
                    [m.bandOverflow, m.bandInsideOverflow, m.bandBox.h],
                    ['hidden', 'hidden', 420]);

                /* ---- the rest of the card's contract on the real page ---- */
                check(`${label}@${w}: the card sits on the photo, at or above y=300`,
                    m.cardBox.y <= 300 && m.cardBox.y > 0, true);
                check(`${label}@${w}: one centred column, gutter on a phone and capped above it`,
                    m.cardBox.w, w === 390 ? 354 : 560);
                check(`${label}@${w}: no sideways scrolling`, m.sideScroll, false);

                /* ---- 0.36.2: the white band is gone and the blue is the body's ---- */
                check(`${label}@${w}: main and the article paint nothing, and main collapses`,
                    [m.blue.mainBg, m.blue.mainPadTop, m.blue.mainPadBottom,
                     m.blue.mainMarginBottom, m.blue.mainHeight,
                     m.blue.artBg, m.blue.artMargin],
                    ['rgba(0, 0, 0, 0)', '0px', '0px', '0px', 0,
                     'rgba(0, 0, 0, 0)', '0px']);
                check(`${label}@${w}: the only things painting below the card are the blue body and the card`,
                    m.blue.painters, ['body rgb(10, 80, 178)', 'section rgb(255, 255, 255)']);
                check(`${label}@${w}: 38px of blue between the card and the footer, at every width`,
                    m.blue.gap, 38);
                check(`${label}@${w}: nothing was removed — all 11 schema nodes inside main are still there`,
                    m.blue.schemaNodes, 11);
                check(`${label}@${w}: and nothing was HIDDEN — main and the article still render`,
                    [m.blue.mainDisplay, m.blue.mainVisibility,
                     m.blue.artDisplay, m.blue.artVisibility],
                    ['block', 'visible', 'block', 'visible']);
                check(`${label}@${w}: the theme's "Submit Booking" banner is not shown`,
                    m.themeTitleShown, false);
                check(`${label}@${w}: the card's heading is the page's one visible h1`,
                    m.h1s.filter((h) => h.shown).map((h) => h.isCardTitle), [true]);
                check(`${label}@${w}: MotoPress's dead end is out of view`,
                    m.deadEndVisible, '');
                if (state === 'taken') {
                    check(`${label}@${w}: three open-date chips`, m.chips, 3);
                } else {
                    check(`${label}@${w}: all eight real cottages`, m.strip, 8);
                }

                /* ---- THE MENU BASELINE, which the fix must keep ---- */
                const menuSel = '#top-nav > li.menu-item-has-children > a[href$="/cottages/"]';
                const hasMenu = await page.evaluate((s) => {
                    const a = document.querySelector(s);
                    return !!(a && a.offsetWidth > 0);
                }, menuSel);
                check(`menu@${w} (${label}): the Browse Cottages menu is ${w < 500 ? 'behind the burger' : 'on screen'}`,
                    hasMenu, w >= 500);

                if (hasMenu) {
                    await page.hover(menuSel);
                    await page.waitForTimeout(350);
                    const drop = await page.evaluate((s) => {
                        const a = document.querySelector(s);
                        const ul = a.parentNode.querySelector('ul.sub-menu');
                        if (!ul) { return { links: 0 }; }
                        const links = [...ul.querySelectorAll('a')];
                        const card = document.querySelector('.dcc_checkout-continue');
                        const cr = card.getBoundingClientRect();
                        const ur = ul.getBoundingClientRect();
                        const overlaps = !(ur.bottom < cr.top || ur.top > cr.bottom
                            || ur.right < cr.left || ur.left > cr.right);
                        const onTop = links.map((l) => {
                            const r = l.getBoundingClientRect();
                            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                            return !!(hit && (hit === l || l.contains(hit) || l.contains(hit) || hit.closest('ul.sub-menu')));
                        });
                        return { links: links.length, overlaps, onTop: onTop.filter(Boolean).length };
                    }, menuSel);
                    check(`menu@${w} (${label}): the dropdown really reaches over the card (the guard)`,
                        drop.overlaps, true);
                    check(`menu@${w} (${label}): all eight dropdown links are on top of the card`,
                        [drop.links, drop.onTop], [8, 8]);
                }

                /* The scroll half: at >=1024 Bravada pins a separate copy of
                   the menu bar; below that the band scrolls away. Either way
                   nothing of OURS may be left stuck to the window.

                   A SPACER IS ADDED, AND IT IS THE ONLY THING ADDED TO THE
                   REAL PAGE. In these two states the page is 844-1049px tall
                   and cannot scroll 600 at all, so without it the pinning
                   never triggers and the test says nothing — which is how the
                   first run of this suite reported the bar unpinned at 1440.
                   It goes INSIDE #content, below everything measured, so no
                   geometry above it moves; the theme's pinning is driven by
                   scroll position, so arriving there by a spacer is the same
                   arrival. Everything above it is the real page. */
                await page.evaluate(() => {
                    const spacer = document.createElement('div');
                    spacer.setAttribute('data-test-spacer', '1');
                    spacer.style.height = '1600px';
                    (document.getElementById('content') || document.body).appendChild(spacer);
                });
                await page.evaluate(() => window.scrollTo(0, 600));
                await page.waitForTimeout(700);
                /* AND THEN UP, WHICH IS WHAT REVEALS IT. Bravada's pinned bar
                   is a reveal-on-scroll-up: a single jump to 600 catches it
                   mid-transition at top: -45px (measured), which is neither
                   of the two states and would make any assertion about it a
                   race. Down then up is the real gesture and it settles. */
                await page.evaluate(() => window.scrollTo(0, 380));
                await page.waitForTimeout(900);
                const sc = await page.evaluate(() => {
                    const fx = document.querySelector('.site-header-bottom-fixed');
                    const cs = getComputedStyle(fx);
                    const r = fx.getBoundingClientRect();
                    const cy = r.top + r.height / 2;
                    const el = cy >= 0
                        ? document.elementFromPoint(r.left + r.width / 2, cy)
                        : null;
                    return {
                        scrolledTo: Math.round(window.pageYOffset),
                        maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight),
                        pos: cs.position,
                        top: Math.round(parseFloat(cs.top)),
                        z: cs.zIndex,
                        onScreen: r.top >= 0,
                        centreInsideBar: !!(el && fx.contains(el)),
                    };
                });

                check(`menu@${w} (${label}): the page really scrolled (the guard)`,
                    sc.maxScroll >= 600 && sc.scrolledTo === 380, true);
                check(`menu@${w} (${label}): nothing of ours is left stuck to the window`,
                    await page.evaluate(stuck), []);
                /* THE ONE NUMBER THE CARD IS MEASURED AGAINST. The bar is
                   9999 inside #masthead's context and the card is 12 in the
                   same context, so the bar outranks it at every width whether
                   it is pinned or not. */
                check(`menu@${w} (${label}): the pinned bar still outranks the card`,
                    [sc.z, Number(sc.z) > 12], ['9999', true]);
                if (w >= 1024) {
                    /* The Director's fact: pinned only at >=1024. */
                    check(`menu@${w} (${label}): the bar is pinned to the window, on screen, and its centre hits the bar`,
                        [sc.pos, sc.top, sc.onScreen, sc.centreInsideBar],
                        ['fixed', 0, true, true]);
                } else {
                    /* And below it the band simply scrolls away with the page
                       — absolute at top: -75px, which is the theme's own way
                       of keeping it out of the way on a phone. */
                    check(`menu@${w} (${label}): the bar is not pinned and has scrolled away`,
                        [sc.pos, sc.top, sc.onScreen], ['absolute', -75, false]);
                }

                await ctx.close();
            }
        }
    }

    /* ===================================================================== *
     * 0.36.2 — THE PIXELS, AND THE FORM PAGE.
     *
     * The computed-style checks above cannot see a pseudo-element, a gradient
     * or an image, and the white band this release removes could come back as
     * any of them. So the column between the card's bottom and the footer is
     * read out of a real screenshot, decoded by Chromium itself so there is no
     * image library to trust.
     *
     * THE DIRECTOR'S CHECK WAS "the pixel 20px under the card is the blue",
     * and it does NOT read the flat blue — it reads rgb(9, 76, 170). That is
     * the card's OWN box-shadow (0 10px 30px rgba(0,0,0,.18), from 0.36.0):
     * the column rises smoothly from rgb(8, 69, 155) at the card's edge to
     * rgb(9, 79, 177) by 37px, which is the blue within one unit. A control
     * page painting #0A50B2 screenshots as exactly rgb(10, 80, 178), so the
     * pipeline is faithful and the tint is ours. Asserting the flat blue at
     * 20px would therefore have been asserting a bug.
     *
     * What is asserted instead is what the release actually promises: no pixel
     * in that column is white or near-white, every pixel is a blue, and the
     * far end of the gap is the body's blue. Before 0.36.2 that column was
     * 108-175px of #FFFFFF.
     * ===================================================================== */
    {
        const decoder = await browser.newContext();
        const dpage = await decoder.newPage();
        const readColumn = async (png) => dpage.evaluate(async (b64) => {
            const img = new Image();
            img.src = 'data:image/png;base64,' + b64;
            await img.decode();
            const cv = document.createElement('canvas');
            cv.width = img.width; cv.height = img.height;
            const g = cv.getContext('2d');
            g.drawImage(img, 0, 0);
            const out = [];
            for (let y = 0; y < img.height; y++) {
                const d = g.getImageData(0, y, 1, 1).data;
                out.push([d[0], d[1], d[2]]);
            }
            return out;
        }, png.toString('base64'));

        for (const w of WIDTHS) {
            const file = build('lost', false);
            const ctx = await browser.newContext({
                viewport: { width: w, height: w < 500 ? 844 : 900 },
                deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500,
            });
            const page = await ctx.newPage();
            await page.route('**/*', (route) => (route.request().url().startsWith('file://')
                ? route.continue() : route.abort()));
            await page.goto('file://' + file, { waitUntil: 'load' });
            await page.waitForTimeout(600);
            const at = await page.evaluate(() => {
                const c = document.querySelector('.dcc_checkout-continue').getBoundingClientRect();
                const f = document.getElementById('colophon').getBoundingClientRect();
                return {
                    x: Math.round(c.left + c.width / 2),
                    y: Math.round(c.bottom),
                    h: Math.max(1, Math.round(f.top - c.bottom)),
                };
            });
            const col = await readColumn(await page.screenshot({
                clip: { x: at.x, y: at.y, width: 1, height: at.h },
            }));
            await ctx.close();

            const nearWhite = col.filter((c) => c[0] > 200 && c[1] > 200 && c[2] > 200);
            const allBlue = col.every((c) => c[2] > c[1] && c[1] > c[0] && c[2] >= 140 && c[0] <= 30);
            const last = col[col.length - 1];

            check(`blue@${w}: the column under the card is ${at.h}px tall, the full gap`,
                at.h, 38);
            check(`blue@${w}: NOT ONE near-white pixel under the card (the band is gone)`,
                nearWhite.length, 0);
            check(`blue@${w}: every pixel in the gap is a blue`, allBlue, true);
            check(`blue@${w}: and the far end of the gap is the body's own #0A50B2`,
                [Math.abs(last[0] - 10) <= 2, Math.abs(last[1] - 80) <= 2,
                 Math.abs(last[2] - 178) <= 2], [true, true, true]);
        }
        await decoder.close();
    }

    /* ===================================================================== *
     * AND THE FORM PAGE IS UNTOUCHED (0.36.2).
     *
     * `body.dcc_checkout-cardover` is added only in the two no-form states, so
     * nothing in this release can reach a working checkout — but that is a
     * claim about a branch, and the branch has to be taken for it to mean
     * anything. With a form in MotoPress's wrapper, restore.js takes
     * withForm(): no class, no card, and the theme's white content area and
     * its padding exactly as the live page draws them.
     * ===================================================================== */
    for (const w of WIDTHS) {
        const file = build('form', false);
        const ctx = await browser.newContext({
            viewport: { width: w, height: w < 500 ? 844 : 900 },
            deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500,
        });
        const page = await ctx.newPage();
        await page.route('**/*', (route) => (route.request().url().startsWith('file://')
            ? route.continue() : route.abort()));
        await page.goto('file://' + file, { waitUntil: 'load' });
        await page.waitForTimeout(600);
        const m = await page.evaluate(() => {
            const main = document.getElementById('main');
            const art = document.querySelector('article.hentry');
            const cs = (el, p) => getComputedStyle(el).getPropertyValue(p);
            return {
                hasForm: !!document.querySelector('form.mphb_sc_checkout-form'),
                cards: document.querySelectorAll('.dcc_checkout-continue').length,
                cardover: document.body.className.indexOf('dcc_checkout-cardover') >= 0,
                mainBg: cs(main, 'background-color'),
                mainPadTop: cs(main, 'padding-top'),
                artBg: cs(art, 'background-color'),
            };
        });
        await ctx.close();
        check(`form@${w}: the fork is really taken — a form, and no card`,
            [m.hasForm, m.cards], [true, 0]);
        check(`form@${w}: the body never carries the overlap class`, m.cardover, false);
        check(`form@${w}: the content area keeps the theme's white and its padding`,
            [m.mainBg, m.mainPadTop !== '0px', m.artBg],
            ['rgb(255, 255, 255)', true, 'rgb(255, 255, 255)']);
    }

    await browser.close();
    fs.writeFileSync(path.join(HERE, 'measured.json'), JSON.stringify(report, null, 1));

    if (fails.length) {
        console.log(`\n${pass} passing, ${fails.length} FAILING`);
        process.exit(1);
    }
    console.log(`\n${pass} passing`);
})();
