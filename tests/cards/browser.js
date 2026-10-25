/**
 * 0.36.0 — THE TWO CARDS, MEASURED AT 390, 768 AND 1440.
 *
 *     node tests/cards/browser.js            # the sources
 *     DCC_MIN=1 node tests/cards/browser.js  # the built bundle a guest gets
 *     DCC_SHOTS=/some/dir node tests/cards/browser.js   # and write screenshots
 *
 * WHY THIS SUITE EXISTS AT ALL. Every check list from 0.35.0 to 0.35.3 was
 * written at 375px, and the desktop was never looked at: at 1440 the card was
 * a `240px 690px` grid with the heading and the button crushed into the narrow
 * column and the lead paragraph floating alone in the wide one. Nothing in
 * tests/restore could see it, because tests/restore has one 390px context and
 * no theme around the page. So the geometry is asserted here, at the three
 * widths Rob's check lists now cover, and every number the Director asked for
 * is printed whether it passes or fails.
 *
 * WHAT IS REPRODUCED, AND WHAT THAT IS WORTH. The page around the card is the
 * same reproduction tests/hero carries — Bravada's header boxes and the
 * Director's `dcc-hero-frame.php` mu-plugin VERBATIM, including
 * `height: clamp(420px, 29vw, 720px) !important` (which is where the 420px
 * header band in his measurements comes from) and the `overflow: hidden` on
 * `main.main` and `div.one-column` that 0.35.0 found. It is NOT a capture of
 * /submit-booking/: that page needs a live reservation. So this proves the
 * rules behave against the theme's real geometry, and the Director's read of
 * live is still what settles the look (v0.9.0).
 *
 * THE VIEWPORT META IS LOAD-BEARING. Without it Chromium lays a mobile
 * context out at 980px and every `min-width` query matches at 390, so the
 * phone column silently measures the desktop branch (0.35.0).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', '..', 'dcc-custom-checkout');
const MIN = !!process.env.DCC_MIN;
const SHOTS = process.env.DCC_SHOTS || '';
const JS = fs.readFileSync(path.join(PLUGIN, 'assets', MIN ? 'restore.min.js' : 'restore.js'), 'utf8');
const CSS = fs.readFileSync(path.join(PLUGIN, 'assets', MIN ? 'checkout.min.css' : 'checkout.css'), 'utf8');

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
function ok(name, cond, detail) {
    check(name, cond ? true : (detail === undefined ? false : detail), true);
}

/* Rob's three widths. 1440 is where he looked; 768 is the tablet band the
   brief names; 390 is the phone every earlier check list used. */
const WIDTHS = [
    { w: 390, h: 844, phone: true },
    { w: 768, h: 1024, phone: true },
    { w: 1440, h: 900, phone: false },
];

const STAY = {
    roomTypeId: '1607',
    checkIn: '2027-01-11',
    checkOut: '2027-01-14',
    roomsDetails: { 1607: '1' },
    name: 'Sunshine Suite',
    photo: 'https://example.test/wp-content/uploads/cottage-36-300x300.webp',
    dates: 'Mon, Jan 11 → Thu, Jan 14 · 3 Nights',
    key: '1607|2027-01-11|2027-01-14',
};

/* The strings PHP really sends. THEY ARE COMPARED AGAINST class-restore.php in
   tests/cards/strings.php, so this copy cannot drift from the shipped one —
   a browser fixture holding its own copy of a localized string cannot see a
   PHP string change, which is apparent coverage (0.35.1). */
const I18N = {
    continueTitle: 'Continue Your Booking',
    continueLead: 'Your dates are still here. Pick up where you left off.',
    continueButton: 'Continue Your Booking',
    restartTitle: 'Pick Your Dates Again',
    restartLead: "We don't have your dates anymore. Pick them again and we'll bring you straight back to checkout.",
    restartButton: 'Pick Your Dates Again',
    takenTitle: "Those Dates Aren't Available",
    takenLead: "%s isn't available for those nights. Choose new dates and we'll bring you straight back.",
    takenLeadPlain: "Those nights aren't available. Choose new dates and we'll bring you straight back.",
    takenButton: 'Pick New Dates',
    welcome: 'Welcome back. We kept your answers. Please add your photo ID again.',
    startOver: 'Start Over',
    altTitle: 'Open Dates for This Cottage',
    chipLabel: '%1$s → %2$s · %3$s',
    chipOpen: 'Open',
    stripTitle: 'Or Browse the Cottages',
};

const COTTAGES = [
    'Coconut Cottage', 'Hibiscus House', 'Mango Cottage', 'Palm Cottage',
    'Papaya Place', 'Pelican Perch', 'Sunshine Suite', 'Willow Walk',
].map((name, i) => ({
    name,
    url: 'https://example.test/accommodation/cottage-' + (i + 1) + '/',
    photo: 'https://example.test/wp-content/uploads/c' + (i + 1) + '-150x150.webp',
    w: 150,
    h: 150,
}));

function cfg(state) {
    const taken = state === 'taken';
    return JSON.stringify({
        stay: state === 'lost' ? {} : STAY,
        offer: taken ? 'taken' : 'lost',
        checkout: 'https://example.test/submit-booking/',
        cottages: 'https://example.test/cottages/',
        avail: taken ? {
            url: 'https://example.test/wp-admin/admin-ajax.php',
            action: 'mphbac_query',
            windowDays: 94,
            timeoutMs: 3000,
            chips: 3,
            minNights: 2,
        } : {},
        cottageList: taken ? [] : COTTAGES,
        i18n: I18N,
    });
}

/**
 * The checkout page MotoPress drew no form for, inside the theme.
 *
 * `article.hentry > .sheet` with 24px of padding is what puts the card a
 * little below the header band, as live does (the Director measured the card's
 * top at y=466 under a 420px band at 1440 — 46px of theme padding; the
 * reproduction has 24, so the pull this suite measures is if anything smaller
 * than live's).
 */
function page(state, opts) {
    const o = opts || {};
    /* WITH THE LAYOUT SWITCH ON the page is a different shape, and both are
       live-possible: Hero empties the theme's title (0.35.1, item 5) and
       prints its own overlay, whose cottage name is an <h1>. The card states
       have to come out right in BOTH, so both are measured. */
    const themeTitle = o.switchOn
        ? ''
        : '<h1 class="entry-title singular-title" style="font-size:0;line-height:0;height:0;overflow:hidden">Submit Booking</h1>';
    const overlay = o.switchOn
        ? `<div class="dcc_hero-overlay"><div class="dcc_hero-overlay__inner">
             <h1 class="dcc_hero-overlay__name">Sunshine Suite</h1>
             <p class="dcc_hero-overlay__label">Your stay</p>
             <p class="dcc_hero-overlay__dates">Mon, Jan 11 → Thu, Jan 14</p>
           </div></div>`
        : '';
    return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Submit Booking</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Raleway, sans-serif; background: #cecece; }
  /* The site-wide weight the field standard has to fight (v0.20.0). */
  html { font-weight: 700; }
  /* Bravada's button rules, as reproduced in tests/button. */
  button { font-family: Pavanam, sans-serif; text-transform: uppercase; }

  /* --- Bravada's header boxes, as the Director read them --------------
   *
   * THE STACKING IS THE PART 0.36.0's FIXTURE DID NOT HAVE, and it is what
   * hid the card on the real theme (the Director's staging measurement,
   * 2026-10-24). #masthead is a positioned element with z-index: 999, so
   * the WHOLE header is a stacking context painting above the content —
   * nothing inside article.hentry can ever come over it, whatever z-index
   * it asks for, because hentry's own transform scopes it. And
   * #header-page-title is absolutely positioned across the full band at
   * z-index 11, drawing "Submit Booking" over the photo.
   *
   * Values from his read of theme-css-all.css: two #masthead rules, 99 and
   * 999, and #header-page-title at 11. THIS IS STILL A REPRODUCTION — the
   * real stylesheet has not reached this session; see tests/real-theme/. */
  header#masthead { position: relative; z-index: 999; }
  #header-image-main { position: relative; }
  #header-image-main-inside { position: relative; overflow: hidden; }
  #header-page-title {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 11;
      display: flex; align-items: center; justify-content: center;
  }
  #header-page-title-inside { font-size: 40px; color: #fff; }

  /* The menu band and its pinned copy, from the Director's 768 README.
     The sub-menu is drawn over the card on hover/open, as live does. */
  .site-header-bottom { position: relative; z-index: 12; background: #fff; height: 56px; }
  .main-navigation ul.menu { list-style: none; margin: 0; padding: 0; text-align: center; }
  .main-navigation li.menu-item-has-children { display: inline-block; position: relative; }
  /* Centred under its item, so it falls over the centred card at every width.
     The Director measured the dropdown over the card at 768; the real capture
     settles the geometry at 390 and 1440. */
  .main-navigation .sub-menu {
      display: none; position: absolute; top: 56px; left: 50%; margin-left: -130px; width: 260px;
      background: #fff; list-style: none; margin: 0; padding: 8px 0; z-index: 13;
  }
  .main-navigation li.menu-item-has-children.dcc-test-open .sub-menu { display: block; }
  .main-navigation .sub-menu a { display: block; padding: 8px 16px; }
  /* PINNED ONLY AT 1024 AND UP (the Director's measurement). Below that the
     band scrolls away with the page and nothing is fixed. */
  .site-header-bottom-fixed { display: none; }
  @media (min-width: 1024px) {
      .site-header-bottom-fixed {
          display: block; position: fixed; top: -8px; left: 0; right: 0;
          height: 63px; background: #fff; z-index: 14;
      }
  }
  #header-image-main-inside .header-image {
      background-image: url('data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==');
      background-size: cover;
      background-position: 50% 50%;
  }
  #header-overlay { position: absolute; inset: 0; }
  img.header-image { height: 0; display: block; }

  /* --- dcc-hero-frame.php (the Director's mu-plugin), verbatim -------- */
  html body #header-image-main,
  html body #header-image-main-inside {
      height: clamp(420px, 29vw, 720px) !important;
      max-height: none !important;
  }
  html body #header-image-main-inside > div:not(.dcc-hl-wrap):not(.dcc-gh):not(.dcc-gh-fore) {
      height: 100% !important;
  }

  /* --- and the clipping 0.35.0 measured ------------------------------ */
  main.main { overflow: hidden; }
  div.one-column { overflow: hidden; }
  article.hentry { transform: matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1); }
  .sheet { background: #fff; padding: 24px; }

${CSS}
</style></head>
<body>
<header id="masthead" class="cryout">
  <div id="header-image-main"><div id="header-image-main-inside">
    <div class="header-image"></div>
    <div id="header-overlay"></div>
    <img class="header-image" alt="">
    <!-- THE THEME'S PAGE TITLE: a DIV, visible, drawn large over the photo
         (the Director, staging 0.36.0). It is not the page's h1 — the 0x0
         entry-title below is — but it is what a guest SEES. -->
    <div id="header-page-title"><div id="header-page-title-inside">Submit Booking</div></div>
    ${overlay}
  </div></div>
  <!-- THE MENU BAND. Bravada pins a COPY of it (.site-header-bottom-fixed)
       and ONLY at 1024px and up — the Director measured the pinned copy at
       top -8..55 after a 600px scroll at 1440, and at 768 the band scrolls
       away to top -665. Both are reproduced below. The dropdown opens ON TOP
       of the card today and that is the baseline the stacking fix must keep,
       so all eight links are hit-tested. -->
  <div class="site-header-bottom">
    <nav class="main-navigation"><ul class="menu">
      <li class="menu-item-has-children"><a href="#" class="dcc-test-menu">Browse Cottages</a>
        <ul class="sub-menu">${
          ['The Boathouse','The Lighthouse','Hibiscus Hut','Cottage 22',
           'Cottage 31','Cottage 32','Cottage 33','Cottage 34']
            .map((n) => '<li><a href="#">' + n + '</a></li>').join('')
        }</ul>
      </li>
    </ul></nav>
  </div>
  <div class="site-header-bottom-fixed"><span>pinned menu</span></div>
</header>
<main class="main"><div class="one-column"><article class="hentry"><div class="sheet">
  <!-- THE THEME'S OWN TITLE, 0x0 as the Director measured it at 1440. It is
       only removed behind the layout switch (0.35.1), and these cards are not
       behind the switch, so with the switch off it is in the HTML. -->
  ${themeTitle}
  ${o.visibleH1 ? '<h1 class="elementor-heading-title">A Real Heading</h1>' : ''}
  <div class="mphb_sc_checkout-wrapper">${
      state === 'taken'
          ? 'Accommodation is already booked.'
          : '<p class="mphb-data-incorrect"> <br/>Check-in date is not valid.<br/>Check-out date is not valid.</p>'
  }</div>
  <!-- Enough page to scroll. The real capture has the whole checkout below;
       this stands in only so the 600px scroll test has somewhere to go, and
       it sits OUTSIDE MotoPress's wrapper so hideDeadEnd() never touches it. -->
  <div class="dcc-test-filler" style="height:1600px"></div>
</div></article></div></main>
<script>window.DCC_RESTORE = ${cfg(state)};</script>
<!-- COUNT THE RESIZE REGISTRATIONS. fitCardToHero() calls itself from its own
     resize handler, so a listener registered per call would double on every
     resize. Nothing observable in the DOM shows that, so the registration is
     counted at the source. -->
<script>
window.__resizeRegs = 0;
(function () {
    var orig = window.addEventListener;
    window.addEventListener = function (type) {
        if (type === 'resize') { window.__resizeRegs++; }
        return orig.apply(this, arguments);
    };
})();
</script>
<script>${JS}</script>
</body></html>`;
}

/** One character of a day-string replaced, by index. */
function setChar(str, i, ch) {
    return str.slice(0, i) + ch + str.slice(i + 1);
}

/** The Calendar's answer, in the shape its own Booking_Rules::encode makes. */
function availability(from, days, bookedUntil) {
    const avail = {};
    const d = new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10)));
    let inBits = '';
    let outBits = '';
    for (let i = 0; i <= days; i++) {
        const ymd = d.toISOString().slice(0, 10);
        avail[ymd] = i < bookedUntil ? 'booked' : 'available';
        inBits += '1';
        outBits += '1';
        d.setUTCDate(d.getUTCDate() + 1);
    }
    const to = new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10)));
    to.setUTCDate(to.getUTCDate() + days);
    return {
        success: true,
        data: {
            rooms: [],
            availability: { 1607: avail },
            rules: { 1607: { in: inBits, out: outBits, min: 2, max: 0 } },
            from,
            to: to.toISOString().slice(0, 10),
            bookedThrough: null,
        },
    };
}

/** Everything the Director asked each state to report. */
const MEASURE = `(() => {
    const card = document.querySelector('.dcc_checkout-continue');
    if (!card) { return { card: null }; }
    const r = card.getBoundingClientRect();
    const btn = card.querySelector('.dcc_checkout-continue__button');
    const br = btn ? btn.getBoundingClientRect() : null;
    const lines = (() => {
        if (!btn) { return 0; }
        const range = document.createRange();
        range.selectNodeContents(btn);
        return range.getClientRects().length;
    })();
    /* Every piece of text in the card, and whether it is centred. A paragraph
       of more than one sentence must not be; a title must. */
    const texts = [];
    card.querySelectorAll('h1, h2, h3, p, span, button, a').forEach((el) => {
        const t = (el.textContent || '').trim();
        if (!t || el.children.length) { return; }
        texts.push({
            tag: el.tagName.toLowerCase(),
            cls: el.className || '',
            text: t,
            align: getComputedStyle(el).textAlign,
            weight: getComputedStyle(el).fontWeight,
        });
    });
    return {
        card: {
            top: Math.round(r.top + window.pageYOffset),
            width: Math.round(r.width),
            left: Math.round(r.left),
        },
        heading: (() => {
            const h = card.querySelector('.dcc_checkout-continue__title');
            return h ? { tag: h.tagName.toLowerCase(), text: h.textContent.trim() } : null;
        })(),
        h1s: Array.prototype.map.call(document.querySelectorAll('h1'), (h) => ({
            text: h.textContent.trim(),
            visible: h.offsetWidth > 0 && h.offsetHeight > 0,
        })),
        button: br ? { height: Math.round(br.height), width: Math.round(br.width), lines } : null,
        texts,
        chips: Array.prototype.map.call(
            card.querySelectorAll('.dcc_checkout-chip'), (c) => c.textContent.trim()
        ),
        chipPosts: Array.prototype.map.call(
            card.querySelectorAll('.dcc_checkout-alts__form'), (f) => {
                const o = {};
                f.querySelectorAll('input[type=hidden]').forEach((i) => { o[i.name] = i.value; });
                return o;
            }
        ),
        strip: Array.prototype.map.call(
            card.querySelectorAll('.dcc_checkout-strip__link'), (a) => ({
                name: a.querySelector('.dcc_checkout-strip__name').textContent.trim(),
                href: a.getAttribute('href'),
                lazy: a.querySelector('img') ? a.querySelector('img').getAttribute('loading') : null,
                alt: a.querySelector('img') ? a.querySelector('img').getAttribute('alt') : null,
            })
        ),
        page: {
            height: Math.round(document.documentElement.scrollHeight),
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
        },
        deadEndVisible: (() => {
            const w = document.querySelector('.mphb_sc_checkout-wrapper');
            if (!w) { return null; }
            return Array.prototype.some.call(w.childNodes, (n) => {
                if (n.nodeType === 1 && n.classList.contains('dcc_checkout-continue')) { return false; }
                if (n.nodeType === 1) { return getComputedStyle(n).display !== 'none'; }
                return n.nodeType === 3 && !!(n.nodeValue || '').trim();
            });
        })(),
        overlay: !!document.querySelector('.dcc_hero-overlay'),
        /* The theme's own "Submit Booking", drawn large over the photo. It is
           a DIV, not a heading, which is why 0.36.0's h1 reasoning never
           reached it and a guest saw it on staging. */
        themeTitleShown: (() => {
            const t = document.getElementById('header-page-title');
            return t ? getComputedStyle(t).display !== 'none' : null;
        })(),
        bodyClass: document.body.className,
        /* IS THE PULLED-UP PART ACTUALLY ON SCREEN? main.main and
           div.one-column are overflow:hidden on this theme, so a card with a
           negative top margin MOVES and is then CUT OFF at the content's
           edge — and every geometry assertion above passes either way,
           because getBoundingClientRect reports the box, not the paint. An
           overflow-clipped area is not hit-testable, so asking what is at a
           point 10px inside the card's top is the measurement.
           (No backticks in here: MEASURE is a template literal.) */
        topIsHittable: (() => {
            const c = document.querySelector('.dcc_checkout-continue');
            if (!c) { return null; }
            const r = c.getBoundingClientRect();
            /* THREE DEPTHS, as the Director measured on staging: top+12, +80
               and +150 all returned #header-page-title there. One point near
               the edge was not enough — 0.36.0's single probe at +10 sat
               above the theme's title box in the fixture and passed. */
            return [12, 80, 150].map((dy) => {
                const hit = document.elementFromPoint(r.left + r.width / 2, r.top + dy);
                if (!hit) { return 'nothing'; }
                if (hit === c || c.contains(hit)) { return 'card'; }
                return (hit.id || hit.className || hit.tagName).toString().split(' ')[0];
            });
        })(),
        /* THE SOFTENING MUST NOT TAKE A z-index. article.hentry carries a
           matrix3d transform, which makes a stacking context, so the card's
           own z-index is scoped inside it and cannot outrank a root-level
           one: a z-index here painted the wash OVER the card. Found by
           looking at the screenshot, not by any of the numbers. */
        scrimZ: (() => {
            const box = document.querySelector('#header-image-main-inside');
            return box ? getComputedStyle(box, '::before').zIndex : null;
        })(),
    };
})()`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

    for (const size of WIDTHS) {
        for (const state of ['taken', 'lost']) {
            const ctx = await browser.newContext({
                viewport: { width: size.w, height: size.h },
                hasTouch: size.phone,
                isMobile: size.phone,
                deviceScaleFactor: 1,
            });
            const p = await ctx.newPage();
            /* The Calendar's endpoint, answering as its own source says it
               does. Cottage 36's Jan 11-14 is booked, so the first five days
               of the window are taken and the chips must come after them. */
            await p.route('**/admin-ajax.php', (route) => route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(availability('2027-01-11', 94, 5)),
            }));
            await p.route('**/*.webp', (route) => route.fulfill({
                status: 200,
                contentType: 'image/webp',
                body: Buffer.from(
                    'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQ////AA==', 'base64'
                ),
            }));
            /* The page is SERVED, not setContent'd: the session's proxy
               refuses an unroutable host, and a real document URL is also
               what makes the chips' POST resolvable. */
            const html = page(state, {});
            await p.route('https://example.test/submit-booking/', (route) => route.fulfill({
                status: 200, contentType: 'text/html', body: html,
            }));
            await p.goto('https://example.test/submit-booking/');
            /* The chips arrive from a real request. */
            if (state === 'taken') {
                await p.waitForSelector('.dcc_checkout-chip', { timeout: 4000 }).catch(() => {});
            }
            const m = await p.evaluate(MEASURE);
            const tag = state + '@' + size.w;

            console.log('');
            console.log('--- ' + tag + ' ---------------------------------------------');
            console.log('  card top y:      ' + (m.card && m.card.top));
            console.log('  card width:      ' + (m.card && m.card.width));
            console.log('  heading:         ' + JSON.stringify(m.heading));
            console.log('  h1s:             ' + JSON.stringify(m.h1s));
            console.log('  button:          ' + JSON.stringify(m.button));
            console.log('  page height:     ' + m.page.height);
            console.log('  scrollWidth:     ' + m.page.scrollWidth + ' / client ' + m.page.clientWidth);
            console.log('  chips:           ' + JSON.stringify(m.chips));
            console.log('  strip:           ' + m.strip.length + ' cottages');
            console.log('  dead end shown:  ' + m.deadEndVisible);
            m.texts.forEach((t) => {
                console.log('    [' + t.align + ' ' + t.weight + '] ' + t.tag
                    + '.' + t.cls + ' — ' + t.text.slice(0, 54));
            });

            /* ---------------- the asserted checks ------------------------- */
            ok(tag + ': a card was drawn', !!m.card);
            check(tag + ': card is at most 560 wide', m.card.width <= 560, true);
            check(tag + ': card top is at or above 300', m.card.top <= 300, true);
            check(tag + ': card is centred in its column',
                Math.abs((size.w - m.card.width) / 2 - m.card.left) <= 24, true);
            check(tag + ': the button is ONE line', m.button.lines, 1);
            check(tag + ': the button is not a two-line pill', m.button.height < 70, true);
            check(tag + ': no sideways page scroll',
                m.page.scrollWidth, m.page.clientWidth);
            check(tag + ': exactly one h1 in the HTML', m.h1s.length, 1);
            check(tag + ': exactly one VISIBLE heading is the card\'s',
                m.texts.filter((t) => t.cls.indexOf('__title') >= 0).length, 1);
            check(tag + ': MotoPress\'s own message is out of view',
                m.deadEndVisible, false);
            check(tag + ': the body carries the overlap class',
                m.bodyClass.indexOf('dcc_checkout-cardover') >= 0, true);
            check(tag + ': the card is on top at +12, +80 and +150, not under the header',
                m.topIsHittable, ['card', 'card', 'card']);
            check(tag + ': the softening sits BEHIND the card, with no z-index',
                m.scrimZ, 'auto');
            check(tag + ': the theme\'s own "Submit Booking" is not shown',
                m.themeTitleShown, false);
            check(tag + ': … and the card\'s heading is the page\'s one visible h1',
                [m.heading.tag, m.h1s.length, m.h1s[0] && m.h1s[0].visible],
                ['h1', 1, true]);

            /* ALIGNMENT, Rob's standing rule: a title is centred, and only a
               paragraph of more than one sentence is left. */
            const misaligned = m.texts.filter((t) => {
                const sentences = (t.text.match(/[.!?](\s|$)/g) || []).length;
                const multi = sentences > 1;
                return multi ? t.align !== 'left' : t.align !== 'center';
            }).map((t) => t.tag + '.' + t.cls + ' is ' + t.align + ': ' + t.text.slice(0, 40));
            check(tag + ': nothing is aligned the wrong way', misaligned, []);

            /* The lead must not inherit html{font-weight:700}. */
            const lead = m.texts.filter((t) => t.cls.indexOf('__lead') >= 0);
            check(tag + ': the lead paragraph is weight 400',
                lead.map((t) => t.weight), ['400']);

            if (state === 'taken') {
                check(tag + ': three open stays were offered', m.chips.length, 3);
                /* The booked nights are skipped, the stays do not overlap, and
                   each is the three nights the guest asked for. */
                check(tag + ': the chips name real open stays', m.chipPosts.map(
                    (f) => f.mphb_check_in_date + '>' + f.mphb_check_out_date
                ), ['2027-01-16>2027-01-19', '2027-01-19>2027-01-22', '2027-01-22>2027-01-25']);
                /* MOTOPRESS'S OWN FIVE FIELDS, and nothing else: a chip opens
                   the form, it does not book. */
                check(tag + ': a chip posts exactly the Book Now fields',
                    Object.keys(m.chipPosts[0]).sort(), [
                        'mphb_check_in_date', 'mphb_check_out_date',
                        'mphb_is_direct_booking', 'mphb_room_type_id',
                        'mphb_rooms_details[1607]',
                    ].sort());
                check(tag + ': no cottage strip on the taken card', m.strip.length, 0);
            } else {
                check(tag + ': all eight cottages are offered', m.strip.length, 8);
                check(tag + ': every thumbnail is lazy',
                    m.strip.every((c) => c.lazy === 'lazy'), true);
                check(tag + ': the thumbnails are decorative, the link names it',
                    m.strip.every((c) => c.alt === ''), true);
                check(tag + ': no chips on the dead end', m.chips.length, 0);
            }

            if (SHOTS) {
                fs.mkdirSync(SHOTS, { recursive: true });
                await p.screenshot({
                    path: path.join(SHOTS, 'Custom Checkout - ' + state + ' ' + size.w + '.png'),
                    fullPage: false,
                });
            }
            await ctx.close();
        }
    }

    /* ===================================================================== *
     * AND THE SAME TWO CARDS WITH THE LAYOUT SWITCH ON.
     *
     * Then the theme's title is gone and the hero prints its own cottage name
     * as an <h1>. The card supersedes that overlay — it names the cottage and
     * the dates itself, and it is pulled up over where the overlay sat — so
     * dropHeroOverlay() takes it away, and the card's heading becomes the
     * page's one h1. Both halves are asserted, because getting either wrong
     * leaves the page with two h1s or none.
     * ===================================================================== */
    for (const size of [{ w: 390, h: 844, phone: true }, { w: 1440, h: 900, phone: false }]) {
        for (const state of ['taken', 'lost']) {
            const ctx = await browser.newContext({
                viewport: { width: size.w, height: size.h },
                hasTouch: size.phone,
                isMobile: size.phone,
                deviceScaleFactor: 1,
            });
            const p = await ctx.newPage();
            await p.route('**/admin-ajax.php', (route) => route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(availability('2027-01-11', 94, 5)),
            }));
            await p.route('**/*.webp', (route) => route.fulfill({
                status: 200, contentType: 'image/webp',
                body: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQ////AA==', 'base64'),
            }));
            const html = page(state, { switchOn: true });
            await p.route('https://example.test/submit-booking/', (route) => route.fulfill({
                status: 200, contentType: 'text/html', body: html,
            }));
            await p.goto('https://example.test/submit-booking/');
            if (state === 'taken') {
                await p.waitForSelector('.dcc_checkout-chip', { timeout: 4000 }).catch(() => {});
            }
            const m = await p.evaluate(MEASURE);
            const tag = 'switch-on ' + state + '@' + size.w;
            console.log('');
            console.log('--- ' + tag + ' --------------------------------------');
            console.log('  heading:    ' + JSON.stringify(m.heading));
            console.log('  h1s:        ' + JSON.stringify(m.h1s));
            console.log('  overlay:    ' + m.overlay);
            console.log('  card top y: ' + (m.card && m.card.top));

            check(tag + ': the hero overlay is GONE, not hidden', m.overlay, false);
            check(tag + ': the card heading is the page h1',
                m.heading, { tag: 'h1', text: state === 'taken'
                    ? "Those Dates Aren't Available" : 'Pick Your Dates Again' });
            check(tag + ': exactly one h1, and it is visible',
                m.h1s, [{ text: m.heading.text, visible: true }]);
            check(tag + ': still at or above 300', m.card.top <= 300, true);
            check(tag + ': still no sideways page scroll',
                m.page.scrollWidth, m.page.clientWidth);
            await ctx.close();
        }
    }

    /* ===================================================================== *
     * THE CALENDAR'S BOOKING RULES, AND THE THREE WAYS THIS ASKS FOR NOTHING.
     *
     * ONE WIDTH IS RIGHT HERE and it is said rather than assumed: which stays
     * are offered is arithmetic over the response, and no part of it reads
     * the viewport. The three widths above are for the geometry.
     *
     * The permissive fixture used by every case above has `in` and `out` all
     * '1' and a scalar `min`, so NONE of the rules handling was exercised by
     * it — a fixture that agrees with the code is the trap this project keeps
     * finding. These construct the conditions instead.
     * ===================================================================== */
    const ruleCases = [
        {
            name: 'arrival and departure days MotoPress does not allow',
            /* in: no arrival on Jan 16 or 17. out: no departure on Jan 21,
               which rules out the 3-night stay starting Jan 18. */
            edit: (d) => {
                d.rules['1607'].in = setChar(d.rules['1607'].in, 5, 'w');
                d.rules['1607'].in = setChar(d.rules['1607'].in, 6, 'w');
                d.rules['1607'].out = setChar(d.rules['1607'].out, 10, 'w');
            },
            expect: ['2027-01-19>2027-01-22', '2027-01-22>2027-01-25', '2027-01-25>2027-01-28'],
        },
        {
            name: 'a minimum stay given per day, not as one number',
            /* The array branch: five nights are required of a stay starting
               Jan 19, two everywhere else. The guest asked for three. */
            edit: (d, days) => {
                const min = [];
                for (let i = 0; i <= days; i++) { min.push(i === 8 ? 5 : 2); }
                d.rules['1607'].min = min;
            },
            /* The MIDDLE one is the evidence: five nights, from the day the
               array asks for five. The first and last are the three the
               guest asked for. Ignoring the array branch would make all
               three three-night stays, which is a different list. */
            expect: ['2027-01-16>2027-01-19', '2027-01-19>2027-01-24', '2027-01-24>2027-01-27'],
        },
        {
            name: 'a maximum stay shorter than the guest asked for',
            /* Nothing can be offered: every candidate is three nights and
               MotoPress allows two. Offering one anyway would send the guest
               to a form that refuses them. */
            edit: (d) => { d.rules['1607'].max = 2; },
            expect: [],
        },
        {
            name: 'no `rules` at all — the Calendar could not read MotoPress',
            /* Its own documented degradation: availability alone decides, and
               the stay is re-checked by MotoPress when the guest opens it. */
            edit: (d) => { delete d.rules; },
            expect: ['2027-01-16>2027-01-19', '2027-01-19>2027-01-22', '2027-01-22>2027-01-25'],
        },
    ];

    for (const rc of ruleCases) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await ctx.newPage();
        await p.route('**/admin-ajax.php', (route) => {
            const body = availability('2027-01-11', 94, 5);
            rc.edit(body.data, 94);
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await p.route('**/*.webp', (route) => route.fulfill({
            status: 200, contentType: 'image/webp',
            body: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQ////AA==', 'base64'),
        }));
        const html = page('taken', {});
        await p.route('https://example.test/submit-booking/', (route) => route.fulfill({
            status: 200, contentType: 'text/html', body: html,
        }));
        await p.goto('https://example.test/submit-booking/');
        if (rc.expect.length) {
            await p.waitForSelector('.dcc_checkout-chip', { timeout: 4000 }).catch(() => {});
        } else {
            await p.waitForTimeout(600);
        }
        const got = await p.evaluate(() => Array.prototype.map.call(
            document.querySelectorAll('.dcc_checkout-alts__form'), (f) => {
                const o = {};
                f.querySelectorAll('input[type=hidden]').forEach((i) => { o[i.name] = i.value; });
                return o.mphb_check_in_date + '>' + o.mphb_check_out_date;
            }));
        check('rules: ' + rc.name, got, rc.expect);
        if (!rc.expect.length) {
            check('… and no empty heading is left behind either',
                await p.evaluate(() => !!document.querySelector('.dcc_checkout-alts')), false);
        }
        await ctx.close();
    }

    /* ===================================================================== *
     * AND IT FAILS QUIETLY (Rob: "request fails, slow, or finds nothing →
     * the card shows exactly what it shows today. No spinner left behind, no
     * error text.")
     * ===================================================================== */
    const quietCases = [
        { name: 'the request fails', route: (route) => route.fulfill({ status: 500, body: 'no' }) },
        { name: 'the answer is not JSON', route: (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>' }) },
        { name: 'the endpoint is not there at all', route: (route) => route.abort() },
        {
            /* THE WAIT OUTLASTS THE ANSWER, AND THAT IS THE WHOLE POINT.
               The first version waited 3.6s against a reply at 4s, so the
               request was merely still in flight — a 60-second timeout would
               have passed it just as well, and mutation `js-chips-no-timeout`
               survived on exactly that. Waiting past the reply means the
               chips are absent because the request was ABANDONED, which is
               the claim. */
            name: 'it is slower than the three seconds allowed',
            route: async (route) => {
                await new Promise((r) => setTimeout(r, 4000));
                route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify(availability('2027-01-11', 94, 5)) });
            },
            wait: 5200,
        },
    ];

    for (const qc of quietCases) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await ctx.newPage();
        await p.route('**/admin-ajax.php', qc.route);
        await p.route('**/*.webp', (route) => route.fulfill({
            status: 200, contentType: 'image/webp',
            body: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQ////AA==', 'base64'),
        }));
        const html = page('taken', {});
        await p.route('https://example.test/submit-booking/', (route) => route.fulfill({
            status: 200, contentType: 'text/html', body: html,
        }));
        await p.goto('https://example.test/submit-booking/');
        await p.waitForTimeout(qc.wait || 700);
        const m = await p.evaluate(MEASURE);
        /* EXACTLY 0.35.2's CARD: the heading, the lead, the dates and the one
           button — and nothing added, nothing half-drawn, no error line. */
        check('quiet: ' + qc.name + ' — the card is untouched',
            [m.chips.length, !!m.card, m.button.lines,
             m.texts.map((t) => t.cls).filter((c) => c.indexOf('alts') >= 0)],
            [0, true, 1, []]);
        await ctx.close();
    }

    /* ===================================================================== *
     * ONE RESIZE LISTENER, HOWEVER MANY RESIZES.
     *
     * fitCardToHero() answers a width change by running again — and the first
     * version registered its listener inside itself, so every resize left
     * another behind and the next resize ran them all. A doubling handler
     * count is invisible in the DOM, so the registration is counted.
     * ===================================================================== */
    {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await ctx.newPage();
        await p.route('**/admin-ajax.php', (route) => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify(availability('2027-01-11', 94, 5)),
        }));
        await p.route('**/*.webp', (route) => route.fulfill({
            status: 200, contentType: 'image/webp',
            body: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQ////AA==', 'base64'),
        }));
        const html = page('lost', {});
        await p.route('https://example.test/submit-booking/', (route) => route.fulfill({
            status: 200, contentType: 'text/html', body: html,
        }));
        await p.goto('https://example.test/submit-booking/');
        const first = await p.evaluate(() => window.__resizeRegs);
        for (const w of [1200, 900, 700, 1440]) {
            await p.setViewportSize({ width: w, height: 900 });
            await p.waitForTimeout(60);
        }
        const after = await p.evaluate(() => ({
            regs: window.__resizeRegs,
            top: Math.round(document.querySelector('.dcc_checkout-continue')
                .getBoundingClientRect().top + window.pageYOffset),
        }));
        check('one resize listener at load', first, 1);
        check('… and still exactly one after four width changes', after.regs, 1);
        /* The guard: it really did keep answering them. */
        check('… and the card is still on the photo at the last of them',
            after.top <= 300, true);
        await ctx.close();
    }

    /* ===================================================================== *
     * A VISIBLE h1 OF SOMEONE ELSE'S IS LEFT ALONE.
     *
     * dropThemeTitle() removes an h1 a guest cannot see, so the card's
     * heading can be the page's one visible h1. It must NOT remove a real
     * one: an Elementor heading on the page is somebody's content, and the
     * card steps down to an h2 beside it. Without this case the rule is
     * prose — every other fixture here has only the theme's 0x0 title.
     * ===================================================================== */
    {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await ctx.newPage();
        await p.route('**/admin-ajax.php', (route) => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify(availability('2027-01-11', 94, 5)),
        }));
        await p.route('**/*.webp', (route) => route.fulfill({
            status: 200, contentType: 'image/webp',
            body: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQ////AA==', 'base64'),
        }));
        const html = page('lost', { visibleH1: true });
        await p.route('https://example.test/submit-booking/', (route) => route.fulfill({
            status: 200, contentType: 'text/html', body: html,
        }));
        await p.goto('https://example.test/submit-booking/');
        const m = await p.evaluate(MEASURE);
        check('a real, visible h1 of the page\'s own survives the card',
            m.h1s.map((h) => h.text + '|' + h.visible), ['A Real Heading|true']);
        check('… and the card steps down to an h2 beside it',
            m.heading.tag, 'h2');
        check('… while the theme\'s banner is still not shown',
            m.themeTitleShown, false);
        await ctx.close();
    }

    /* ===================================================================== *
     * THE MENU, AND WHAT THE STACKING FIX MUST NOT BREAK.
     *
     * Three proofs the Director asked for, from his 768 README:
     *   - the Browse Cottages dropdown opens ON TOP of the card today, all
     *     eight links hit-tested. That is the BASELINE: it passes now because
     *     the card is behind everything, and it must still pass once the card
     *     is lifted out from under the header.
     *   - the menu is pinned ONLY at 1024 and up. At 1440 the pinned copy sits
     *     at top -8..55 after a 600px scroll, so the bar's centre must still
     *     hit the bar.
     *   - at 390 and 768 it scrolls away (he measured top -665 at 768), and
     *     nothing of OURS may be left stuck over the content.
     * ===================================================================== */
    for (const size of [{ w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1440, h: 900 }]) {
        const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h } });
        const p = await ctx.newPage();
        await p.route('**/admin-ajax.php', (route) => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify(availability('2027-01-11', 94, 5)),
        }));
        await p.route('**/*.webp', (route) => route.fulfill({
            status: 200, contentType: 'image/webp',
            body: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQ////AA==', 'base64'),
        }));
        const html = page('taken', {});
        await p.route('https://example.test/submit-booking/', (route) => route.fulfill({
            status: 200, contentType: 'text/html', body: html,
        }));
        await p.goto('https://example.test/submit-booking/');
        const tag = 'menu@' + size.w;

        /* --- the dropdown, over the card ------------------------------- */
        const drop = await p.evaluate(() => {
            const li = document.querySelector('li.menu-item-has-children');
            li.classList.add('dcc-test-open');
            const links = Array.prototype.slice.call(li.querySelectorAll('.sub-menu a'));
            return {
                count: links.length,
                /* Each link's own centre must return that link — if the card
                   were lifted over the menu, these would return the card. */
                onTop: links.map((a) => {
                    const r = a.getBoundingClientRect();
                    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                    return !!(hit && (hit === a || a.contains(hit) || a.contains(hit.parentNode)));
                }),
                /* And it really is drawn over the card, or the check above
                   proves nothing. */
                overlapsCard: (() => {
                    const c = document.querySelector('.dcc_checkout-continue');
                    const m = li.querySelector('.sub-menu');
                    if (!c || !m) { return null; }
                    const a = c.getBoundingClientRect();
                    const b = m.getBoundingClientRect();
                    return !(b.right < a.left || b.left > a.right || b.bottom < a.top || b.top > a.bottom);
                })(),
            };
        });
        check(tag + ': the dropdown really is drawn over the card (the guard)',
            drop.overlapsCard, true);
        check(tag + ': all eight dropdown links are on top of the card',
            [drop.count, drop.onTop.every(Boolean)], [8, true]);

        /* --- the pinned menu, and what sticks after a 600px scroll ------ */
        const scrolled = await p.evaluate(() => {
            document.querySelector('li.menu-item-has-children').classList.remove('dcc-test-open');
            window.scrollTo(0, 600);
            return new Promise((resolve) => setTimeout(() => {
                const fixed = document.querySelector('.site-header-bottom-fixed');
                const band = document.querySelector('.site-header-bottom');
                const fr = fixed ? fixed.getBoundingClientRect() : null;
                /* ANYTHING OF OURS LEFT STUCK OVER THE CONTENT. The card and
                   the header softening are the two things 0.36.x adds near the
                   top of the page; neither may be fixed or sticky. */
                const ours = Array.prototype.slice.call(
                    document.querySelectorAll('.dcc_checkout-continue, #header-image-main, #header-image-main-inside')
                ).map((el) => el.className || el.id)
                 .filter((_, i, __) => true);
                const stuck = Array.prototype.slice.call(
                    document.querySelectorAll('.dcc_checkout-continue, #header-image-main')
                ).filter((el) => {
                    const pos = getComputedStyle(el).position;
                    return pos === 'fixed' || pos === 'sticky';
                }).map((el) => el.id || el.className);
                return resolve({
                    scrolled: window.scrollY,
                    fixedShown: !!fr && getComputedStyle(fixed).display !== 'none',
                    fixedTop: fr ? Math.round(fr.top) : null,
                    barCentreHitsBar: (() => {
                        if (!fr || getComputedStyle(fixed).display === 'none') { return null; }
                        const hit = document.elementFromPoint(
                            Math.round(fr.left + fr.width / 2),
                            Math.round(fr.top + fr.height / 2)
                        );
                        return !!(hit && (hit === fixed || fixed.contains(hit)));
                    })(),
                    bandTop: band ? Math.round(band.getBoundingClientRect().top) : null,
                    stuck: stuck,
                });
            }, 60));
        });
        check(tag + ': the page really scrolled (the guard)', scrolled.scrolled >= 600, true);
        check(tag + ': nothing of ours is fixed or sticky over the content',
            scrolled.stuck, []);
        if (size.w >= 1024) {
            /* THE FIXED-MENU TEST, at 1440 only — the Director measured the
               pinned copy at top -8..55 there. */
            check(tag + ': the menu is pinned at this width', scrolled.fixedShown, true);
            check(tag + ': … and its centre still hits the bar, not the card',
                scrolled.barCentreHitsBar, true);
        } else {
            /* At 390 and 768 the band scrolls away with the page: he measured
               top -665 at 768. Nothing is pinned. */
            check(tag + ': the menu is NOT pinned at this width', scrolled.fixedShown, false);
            check(tag + ': … and the band has scrolled away with the page',
                scrolled.bandTop !== null && scrolled.bandTop < 0, true);
        }
        await ctx.close();
    }

    await browser.close();
    console.log('');
    console.log(failures ? failures + ' FAILED' : 'ALL PASS');
    process.exit(failures ? 1 : 0);
})();
