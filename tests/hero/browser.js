/**
 * v0.35.0 — THE LIP AND THE OVERLAY, MEASURED IN A REAL BROWSER (item 1,
 * picture 7).
 *
 *     node tests/hero/browser.js
 *
 * WHY A BROWSER: every claim here is about geometry and clipping, and both of
 * the traps are invisible in the stylesheet.
 *
 *   1. THE LIP IS DRAWN INSIDE THE HEADER. `main.main` and `div.one-column`
 *      are `overflow: hidden` (the Director measured both), so a lip drawn
 *      above the form instead — the obvious place for it — is clipped and the
 *      guest sees a hard edge where the sheet should curve. The fixture
 *      reproduces that clipping, so a lip in the wrong box is not merely
 *      different here, it is INVISIBLE, which is what the mutation asserts.
 *
 *   2. THE OVERLAY MUST NOT PAINT THE PHOTO. The Director's mu-plugin
 *      `dcc-hero-frame.php` forces every child div of
 *      `#header-image-main-inside` to `height: 100% !important`. Those rules
 *      are reproduced verbatim below. A lip built as a <div> would therefore
 *      be a full-height white block over the cottage — so this fixture is also
 *      what makes "the lip is a pseudo-element" a measurement rather than a
 *      style preference.
 *
 * THE MARKUP IS THE DIRECTOR'S READ OF BRAVADA 1.2.0 ON THE SERVER, not a
 * capture: `header#masthead.cryout > #header-image-main >
 * #header-image-main-inside`, holding `#header-overlay`, `div.header-image`
 * (the visible CSS background) and a 0px-tall `<img class="header-image">`.
 * Whether live matches is the Director's own check; the v0.9.0 rule applies —
 * when real markup is available, replace this.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', '..', 'dcc-custom-checkout');
const CSS = fs.readFileSync(
    path.join(PLUGIN, 'assets', process.env.DCC_MIN ? 'checkout-layout.min.css' : 'checkout-layout.css'),
    'utf8'
);

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) { failures++; }
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
    if (!ok) {
        console.log('      expected: ' + JSON.stringify(expected));
        console.log('      actual:   ' + JSON.stringify(actual));
    }
}

/**
 * THE TWO HEADINGS LIVE SERVES, AND THEY ARE BOTH IN THIS FIXTURE NOW
 * (v0.35.1, items 1 and 5).
 *
 * 0.35.0's fixture carried NEITHER, "as the served page will not" — which was
 * a statement of intent, not a reading, and both turned out to be on the live
 * page:
 *
 *   - `#header-page-title` ("Submit Booking") over the photo, which the theme
 *     prints on the same hook at priority 100. 0.35.0 removes that action, and
 *     the Director confirmed it gone — so the interesting case is the one
 *     where it is still there, to prove this suite can SEE it.
 *   - `<h1 class="entry-title singular-title">Submit Booking</h1>` in the
 *     article, which 0.35.0 only HID. That is item 5, and it is why the
 *     "exactly one <h1>" assertion was green on a page with two.
 *
 * So the markup is a parameter, and the suite asserts both directions.
 */
const THEME_TITLE_HTML =
    '<div id="header-page-title"><h1 class="entry-title">Submit Booking</h1></div>';
const ARTICLE_TITLE_HTML =
    '<header class="entry-header"><h1 class="entry-title singular-title">Submit Booking</h1></header>';

/* The theme's header, the mu-plugin's rules, and the page's clipping. */
const page_template = `<!doctype html>
<html><head><meta charset="utf-8">
<!-- THE VIEWPORT META IS LOAD-BEARING IN THIS FIXTURE, not boilerplate.
     Without it, Chromium in mobile emulation lays the page out at 980px and
     scales it down, so '@media (min-width: 900px)' matches AT 360 AND 390 and
     every "phone" measurement is really the desktop branch. This fixture had
     no meta at first and the 360/390 columns were silently duplicating 1280 —
     caught by mutation css-overlay-over-lip, which changed the phone padding
     and nothing noticed. The live page carries this meta (the theme prints
     it), so this is also what a guest gets. -->
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>checkout</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Raleway, sans-serif; background: #fff; }

  /* --- Bravada, as the Director read it ------------------------------- */
  #header-image-main { position: relative; }
  #header-image-main-inside { position: relative; }
  #header-image-main-inside .header-image {
      background-image: url('data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==');
      background-size: cover;
      background-position: 50% 50%;
  }
  #header-overlay { position: absolute; inset: 0; }
  img.header-image { height: 0; display: block; }

  /* --- dcc-hero-frame.php (the Director's mu-plugin), verbatim --------- */
  html body #header-image-main,
  html body #header-image-main-inside {
      height: clamp(420px, 29vw, 720px) !important;
      max-height: none !important;
  }
  html body #header-image-main-inside > div:not(.dcc-hl-wrap):not(.dcc-gh):not(.dcc-gh-fore) {
      height: 100% !important;
  }
  html body #header-image-main-inside .header-image {
      background-attachment: scroll !important;
      background-position: 50% 50% !important;
  }
  #header-image-main-inside { overflow: hidden; }

  /* --- The page below, with the clipping the Director measured --------- */
  main.main { overflow: hidden; }
  div.one-column { overflow: hidden; }
  article.hentry { transform: matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1); }
  .sheet { background: #fff; padding: 24px; min-height: 600px; }

${CSS}
</style></head>
<body class="dcc_layout">
  <header id="masthead" class="cryout">
    <div id="header-image-main"><div id="header-image-main-inside">
      <div id="header-overlay"></div>
      <div class="header-image"></div>
      <img class="header-image" alt="DORA CANAL COURT" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==">
      <div class="dcc_hero-overlay"><div class="dcc_hero-overlay__inner">
        <h1 class="dcc_hero-overlay__name">Test Cottage</h1>
        <p class="dcc_hero-overlay__label">Cottage 34</p>
        <p class="dcc_hero-overlay__dates">Mon, Nov 16 → Thu, Nov 19 · 3 Nights</p>
      </div></div>
      <!--THEME-TITLE-->
    </div></div>
  </header>
  <main class="main"><div class="one-column"><article class="hentry">
    <!--ARTICLE-TITLE-->
    <div class="sheet"><p>the form</p></div>
  </article></div></main>
</body></html>`;

/**
 * The page, with or without each of the two headings the theme can print.
 *
 * `{}` — the default — is 0.35.1: both removed server-side.
 *
 * NAMED `pageHtml`, not `page`: the Playwright page is called `page` in the
 * loop below and shadowed this, which the first draft found by crashing.
 */
function pageHtml(opts) {
    const o = opts || {};
    return page_template
        .replace('<!--THEME-TITLE-->', o.themeTitle ? THEME_TITLE_HTML : '')
        .replace('<!--ARTICLE-TITLE-->', o.articleTitle ? ARTICLE_TITLE_HTML : '');
}
const page_html = pageHtml();

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

    /* 1440 SINCE 0.36.0, not 1280: that is the width Rob looked at, and the
       width every check list from here on covers. 768 is the tablet band. */
    for (const width of [360, 390, 768, 1440]) {
        const ctx = await browser.newContext({
            viewport: { width, height: 800 },
            hasTouch: width < 900,
            isMobile: width < 900,
        });
        const page = await ctx.newPage();
        await page.setContent(page_html);

        const m = await page.evaluate(() => {
            const box = document.querySelector('#header-image-main-inside');
            const inner = document.querySelector('.dcc_hero-overlay__inner');
            const overlay = document.querySelector('.dcc_hero-overlay');
            const b = box.getBoundingClientRect();
            const lip = getComputedStyle(box, '::after');
            const os = getComputedStyle(overlay);
            // The lip is a pseudo-element, so its rect is derived: full width
            // of the box, its declared height, sitting on the box's bottom.
            const lipHeight = parseFloat(lip.height);
            return {
                boxTop: Math.round(b.top),
                boxBottom: Math.round(b.bottom),
                boxWidth: Math.round(b.width),
                lipHeight,
                lipRadius: [lip.borderTopLeftRadius, lip.borderTopRightRadius,
                            lip.borderBottomLeftRadius, lip.borderBottomRightRadius],
                lipBg: lip.backgroundColor,
                lipBottom: lip.bottom,
                lipLeft: lip.left,
                lipPosition: lip.position,
                lipContent: lip.content,
                // The overlay agrees with the mu-plugin instead of fighting it.
                overlayHeight: Math.round(parseFloat(os.height)),
                overlayPosition: os.position,
                // A gradient, not a solid: the photo has to show through.
                overlaySolid: os.backgroundColor,
                overlayHasGradient: os.backgroundImage.indexOf('gradient') !== -1,
                overlayPointerEvents: os.pointerEvents,
                // Where the text actually sits.
                innerBottom: Math.round(inner.getBoundingClientRect().bottom),
                innerLeft: Math.round(inner.getBoundingClientRect().left),
                nameColor: getComputedStyle(document.querySelector('.dcc_hero-overlay__name')).color,
                // Is anything of the header clipped away by an ancestor?
                clippedByAncestor: (() => {
                    let el = box.parentElement, hidden = false;
                    while (el && el !== document.body) {
                        if (getComputedStyle(el).overflow === 'hidden') { hidden = true; }
                        el = el.parentElement;
                    }
                    return hidden;
                })(),
            };
        });

        const at = (s) => `${s} @${width}`;

        /* --- The lip, WHICH IS A PHONE'S SINCE 0.36.0 ------------------- */
        if (width < 900) {
            check(at('the lip is 24px tall'), m.lipHeight, 24);
            check(at('the lip is a real pseudo-element, not a missing one'),
                m.lipContent !== 'none', true);
            check(at('the lip is positioned on the bottom of the header box'),
                [m.lipPosition, m.lipBottom, m.lipLeft], ['absolute', '0px', '0px']);
            check(at('the lip is the page\'s own white, so the sheet below is one surface'),
                m.lipBg, 'rgb(255, 255, 255)');
            check(at('the lip is rounded at the TOP only'),
                m.lipRadius, ['24px', '24px', '0px', '0px']);
        } else {
            /* ROB SAW IT AT 1440 AND IT WAS WRONG: a rounded sheet top and a
               40x4 grab line stretched across 1425px reads as a panel
               somebody left there, not as a sheet that slid up. There is
               nothing to drag on a desktop. So above 900 the pseudo-element
               is not drawn at all — `content: none`, which is what a media
               query that never applies the rule leaves behind. */
            check(at('the sheet\'s rounded top and grab line are NOT drawn'),
                m.lipContent, 'none');
            check(at('… so nothing of it is left behind either'),
                [m.lipHeight, m.lipBg],
                [null, 'rgba(0, 0, 0, 0)']);
        }

        /* THE CLIPPING TRAP. The lip lives inside the header, which no
           ancestor clips; the form below sits inside two overflow:hidden
           boxes. A lip drawn there instead would not be seen at all. */
        check(at('the header box is not clipped by an ancestor'),
            m.clippedByAncestor, false);
        /* THE FORM'S ANCESTORS CLIP — AT PHONE WIDTH. That is why the lip is
           drawn inside the header and not above the form.
           AT DESKTOP WIDTH THEY NO LONGER DO, and that is item 8's own doing:
           the summary card needs `position: sticky`, which an overflow:hidden
           ancestor defeats (measured: a sticky card 1200px down sat at
           top:-1180px), so the clipping is removed for this page at ≥900px.
           The lip's placement is unaffected either way — it belongs in the
           header on its own terms — but the justification differs by width,
           and asserting one at both widths was simply wrong. */
        const clipping = await page.evaluate(() => {
            const el = document.querySelector('article.hentry');
            return [getComputedStyle(el.parentElement).overflow,
                    getComputedStyle(el.parentElement.parentElement).overflow];
        });
        if (width < 900) {
            check(at('the form\'s own ancestors DO clip — which is why the lip is not drawn there'),
                clipping, ['hidden', 'hidden']);
        } else {
            check(at('item 8 unclips those ancestors so the summary card can stick'),
                clipping, ['visible', 'visible']);
        }

        /* --- The overlay ------------------------------------------------ */
        check(at('the overlay fills the header box, as the mu-plugin insists'),
            m.overlayHeight, m.boxBottom - m.boxTop);
        check(at('the overlay is a scrim, never a fill — the photo shows through'),
            [m.overlaySolid, m.overlayHasGradient], ['rgba(0, 0, 0, 0)', true]);
        check(at('the overlay never eats a tap'), m.overlayPointerEvents, 'none');
        check(at('the cottage name is white on the photo'), m.nameColor, 'rgb(255, 255, 255)');

        /* THE PAGE'S SINGLE <h1>. PHP removes the theme's own "Submit Booking"
           title (it is on the same hook at the same priority and would print
           over the photo), so without this the page would have no main
           heading — which is what a screen reader navigates by. The fixture
           therefore carries no theme title, as the served page will not. */
        const headings = await page.evaluate(() => {
            const h1s = Array.prototype.map.call(document.querySelectorAll('h1'),
                (h) => h.className + '|' + h.textContent.trim());
            const name = document.querySelector('h1.dcc_hero-overlay__name');
            return {
                h1s: h1s,
                align: name ? getComputedStyle(name).textAlign : null,
                /* The theme's title box is not on the page at all. */
                themeTitle: !!document.getElementById('header-page-title'),
            };
        });
        check(at('the page has exactly one <h1>, and it is the cottage name'),
            headings.h1s, ['dcc_hero-overlay__name|Test Cottage']);
        check(at('… centred, per Rob\'s standing rule for titles'),
            headings.align, 'center');
        check(at('… and the theme\'s own page title is not on the page'),
            headings.themeTitle, false);

        /* The text clears the lip: nothing is cut by the white strip. Above
           900 there IS no lip (0.36.0), so the clearance is zero and this
           becomes "the text is inside the box" — which is still worth
           asserting. `|| 0` rather than skipping the check: a null height
           made this read `boxBottom - null`, which is NaN, and a NaN
           comparison is false, so it failed for a reason that had nothing to
           do with the overlay. */
        check(at('the overlay\'s text sits clear of the lip'),
            m.innerBottom <= m.boxBottom - (m.lipHeight || 0), true);
        check(at('… and inside the box, not off its left edge'),
            m.innerLeft >= 0, true);

        /* No horizontal overflow at any width. */
        /* THE GUARD ON THE MEASUREMENTS ABOVE: this really is a phone-width
           layout, not a 980px one scaled down. */
        check(at('the layout width is the viewport width (the viewport meta is in force)'),
            m.boxWidth, width);

        check(at('the page does not scroll sideways'),
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            true);

        /* ----------------------------------------------------------------- *
         * THE TWO HEADINGS, BOTH DIRECTIONS (v0.35.1, items 1 and 5)
         *
         * The assertions above are about the page as 0.35.1 serves it. These
         * are about the pages that produced the defects, and they exist so
         * that "exactly one <h1>" is a measurement rather than a property of
         * the fixture — 0.35.0's fixture had neither heading in it and the
         * live page had both.
         * ----------------------------------------------------------------- */
        const countH1 = () => page.evaluate(() => Array.prototype.map.call(
            document.querySelectorAll('h1'), (h) => h.className + '|' + h.textContent.trim()));

        /* ITEM 5's defect, reproduced: the article's heading is still there,
           and hiding it would not have helped — a hidden heading is still a
           heading. */
        await page.setContent(pageHtml({ articleTitle: true }));
        check(at('WITH the article heading there are TWO <h1>s, the wrong one included'),
            await countH1(),
            ['dcc_hero-overlay__name|Test Cottage', 'entry-title singular-title|Submit Booking']);
        const stillThere = await page.evaluate(() => {
            const h = document.querySelector('h1.entry-title.singular-title');
            return h ? getComputedStyle(h).display !== 'none' : 'missing';
        });
        check(at('… and the stylesheet does not hide it, because 0.35.1 removes it'),
            stillThere, true);

        /* ITEM 1's answer, reproduced: the theme title shown WITH the overlay.
           PHP removes that action, so what this proves is that the suite can
           SEE the title when it is not removed — 0.35.0's fixture could not,
           because it had no theme title in it at all, and "exactly one <h1>"
           was therefore a property of the fixture.

           IT DOES NOT ASSERT THAT THE TWO COLLIDE. The theme positions
           `#header-page-title` over the photo and that rule is Bravada's own
           CSS, which is not on this machine; a first draft asserted an overlap
           and measured none, because the fixture stacks the box below the
           header instead. The collision is the Director's reading of the live
           page, and it is recorded as that in class-hero.php rather than
           pretended to here. */
        await page.setContent(pageHtml({ themeTitle: true }));
        check(at('the theme title shown WITH the overlay is a second <h1> this suite sees'),
            await countH1(),
            ['dcc_hero-overlay__name|Test Cottage', 'entry-title|Submit Booking']);

        /* And the page 0.35.1 actually serves, once more, for the contrast. */
        await page.setContent(pageHtml());
        check(at('with both removed, one <h1> and it is the cottage name'),
            await countH1(), ['dcc_hero-overlay__name|Test Cottage']);

        await ctx.close();
    }

    await browser.close();
    console.log(failures ? `\n${failures} failing` : '\nall passing');
    process.exit(failures ? 1 : 0);
})();
