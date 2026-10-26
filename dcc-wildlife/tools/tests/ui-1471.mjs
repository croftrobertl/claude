/**
 * 1.47.1 — THE CREDITS LINK LANDS ON THE CREDITS.
 *
 * Measured on live by the Director, clicking /explore/'s real "Credits"
 * link: at 390 the credits opened but the summary ended 2,142px ABOVE the
 * screen (the page jumped past it about 1.5s in); at 1440 it landed at 1px,
 * under the theme's pinned menu, which hid "Photo Credits (401)".
 *
 * THE LIVE CONDITIONS ARE REBUILT HERE, because the plain fixture has none
 * of them and lands fine without the fix (that is how 1.47.0 shipped):
 *
 *   - two real pages on routed URLs, /explore/ and /wildlife-guide/, and a
 *     real click on the real link, so the guide loads WITH the hash and its
 *     script runs during that load — not injected afterwards;
 *   - at 1024 and up, a 55px fixed menu like the theme's
 *     `.site-header-bottom-fixed`;
 *   - layout that arrives late above the credits (a header that grows after
 *     load, as the theme's header photo does) and a late programmatic jump
 *     of the page past the target, which is what the live trace showed;
 *   - the theme's `scroll-behavior: smooth`, which must not turn the
 *     correction into an animation.
 *
 * A pass means a guest SEES the summary: the hit-test at its middle, a few
 * pixels in, returns the summary — not the menu, not the pinned controls.
 */
import {
  launch, rendered, asset,
  check, checkSame, checkAtMost, section, note, done, skipSuite,
} from './lib.mjs';

const browser = await launch();
if (!browser) { skipSuite('no browser'); }

const SITE = 'https://example.test';
const CSS = {
  canal: ['assets/css/app.css', 'assets/css/widget.css', 'assets/css/water.css', 'assets/css/canal.css'],
  guide: ['assets/css/app.css', 'assets/css/widget.css', 'assets/css/guide.css'],
};
const JS = {
  canal: ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/widget.js', 'assets/js/water.js', 'assets/js/canal.js'],
  guide: ['assets/js/sheet.js', 'assets/js/guide.js'],
};
const kit = (await import('node:fs')).readFileSync(new URL('./sitekit.css', import.meta.url), 'utf8');

function doc(which, { menu = false, late = false } = {}) {
  const f = rendered(which);
  const css = CSS[which].map((c) => `<style>${asset(c)}</style>`).join('');
  const js = JS[which].map((j) => `<script>${asset(j)}</script>`).join('');
  /*
   * THE THEME, AS LIVE ACTUALLY BEHAVES (1.47.2, measured with the
   * live-swap check — the 1.47.1 stand-in was a bar fixed from the start,
   * and live's is not):
   *   - the menu bar is STATIC in the header at the top of the page, and
   *     only turns fixed (0-63px) in the theme's own scroll handler, a
   *     beat after the scroll, and then SLIDES into place;
   *   - it does that only from 1024px; on a narrower screen it scrolls away;
   *   - the content sits inside three `overflow: hidden` boxes (main.main,
   *     .one-column, and the div inside it), which stop position: sticky.
   */
  const theme = `<style>html{scroll-behavior:smooth}${kit}
      #theme-header{position:relative;height:150px;background:#ccd}
      .site-header-bottom-fixed{position:absolute;top:10px;left:0;right:0;height:63px;z-index:1000;background:#fff;display:flex;gap:24px;align-items:center;padding:0 24px}
      .header-fixed .site-header-bottom-fixed{position:fixed;top:0;transform:translateY(-63px);transition:transform .35s}
      .header-fixed.shown .site-header-bottom-fixed{transform:none}
    </style>`;
  const header = `<header id="theme-header"><div class="site-header-bottom">${menu
    ? '<div class="site-header-bottom-fixed"><a href="/">Home</a><a href="/cottages/">Cottages</a><a href="/explore/">Explore</a></div>'
    : ''}</div></header>`
    + `<script>(function () {
         var hb = document.querySelector('.site-header-bottom');
         window.addEventListener('scroll', function () {
           setTimeout(function () {
             var on = window.innerWidth >= 1024 && window.scrollY > 150;
             if (on && !hb.classList.contains('header-fixed')) {
               hb.classList.add('header-fixed');
               requestAnimationFrame(function () { requestAnimationFrame(function () { hb.classList.add('shown'); }); });
             } else if (!on) { hb.classList.remove('header-fixed', 'shown'); }
           }, 60);
         }, { passive: true });
       })();</script>`;
  const disturb = 'nudge' === late
    ? `<script>window.addEventListener('load', function () {
         setTimeout(function () { window.scrollBy(0, -300); }, 2200);
       });</script>`
    : late
    ? `<script>window.addEventListener('load', function () {
         setTimeout(function () { document.getElementById('theme-header').style.height = '602px'; }, 600);
         setTimeout(function () { window.scrollBy(0, 2500); }, 1300);
       });</script>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${theme}${css}</head>`
    + `<body>${header}<div class="wrap" style="overflow:hidden"><main class="main" style="overflow:hidden"><div class="one-column" style="overflow:hidden"><div class="site"><div class="entry-content">${f.html}</div></div></div></main></div>`
    + `<script>${f.config}</script>${js}${disturb}</body></html>`;
}

async function site(w, h, opts = {}) {
  const page = await browser.newPage({
    viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 900, isMobile: w < 900,
    ...(opts.reducedMotion ? { reducedMotion: 'reduce' } : {}),
  });
  const pages = { '/explore/': doc('canal', opts), '/wildlife-guide/': doc('guide', opts) };
  await page.route((u) => u.host === 'example.test' && pages[u.pathname] !== undefined, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pages[new URL(route.request().url()).pathname] }));
  await page.route('**/wp-content/plugins/dcc-wildlife/assets/**', async (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^.*\/dcc-wildlife\/assets\//, '');
    try {
      const { readFileSync } = await import('node:fs');
      const body = readFileSync(new URL(`../../assets/${rel}`, import.meta.url));
      await route.fulfill({ status: 200, contentType: rel.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream', body });
    } catch { await route.fulfill({ status: 404, body: '' }); }
  });
  /* Anything else on the made-up host (REST, maps) fails fast rather than hanging. */
  await page.route((u) => u.host === 'example.test' && !u.pathname.includes('/assets/') && pages[u.pathname] === undefined,
    (route) => route.fulfill({ status: 404, body: '' }));
  return page;
}

/** What the guest sees at the summary, and where it is. */
const landing = (page) => page.evaluate(() => {
  const d = document.getElementById('credits');
  const s = d.querySelector('summary');
  const r = s.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const at = (y) => { const e = document.elementFromPoint(cx, y); return !!e && s.contains(e); };
  return {
    open: d.open, top: Math.round(r.top), vh: window.innerHeight, y: Math.round(window.scrollY),
    seen: r.top >= 0 && r.bottom <= window.innerHeight && at(Math.round(r.top) + 6) && at(Math.round(r.top + r.height / 2)),
    hit: (document.elementFromPoint(cx, Math.round(r.top) + 6) || {}).outerHTML?.slice(0, 60),
  };
});

/** Where the visible page starts at the summary's x: below every bar. */
const barsBottom = (page) => page.evaluate(() => {
  const s = document.querySelector('#credits summary').getBoundingClientRect();
  const x = Math.round(s.left + s.width / 2);
  let y = 0;
  for (let n = 0; n < 5; n++) {
    let b = 0;
    for (let e = document.elementFromPoint(x, y + 1); e && e !== document.body; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p !== 'fixed' && p !== 'sticky') continue;
      const r = e.getBoundingClientRect();
      if (r.top <= y + 1 && r.bottom > y + 1) b = Math.ceil(r.bottom);
      break;
    }
    if (b <= y) break;
    y = b;
  }
  return y;
});

for (const [w, h, menu] of [[390, 844, false], [768, 1024, false], [1024, 768, true], [1440, 900, true]]) {
  for (const how of ['click', 'arrive']) {
    section(`${w}: ${how === 'click' ? 'clicking /explore/\'s Credits link' : 'arriving with #credits'}`);
    const page = await site(w, h, { menu, late: true });
    if (how === 'click') {
      await page.goto(`${SITE}/explore/`, { waitUntil: 'load' });
      const href = await page.evaluate(() => document.querySelector('a[href$="#credits"]')?.getAttribute('href'));
      checkSame('/wildlife-guide/#credits', href, 'the real link on /explore/');
      await Promise.all([
        page.waitForURL(`${SITE}/wildlife-guide/#credits`),
        page.evaluate(() => document.querySelector('a[href$="#credits"]').click()),
      ]);
    } else {
      await page.goto(`${SITE}/wildlife-guide/#credits`, { waitUntil: 'commit' });
    }
    await page.waitForLoadState('load');
    await page.waitForTimeout(5500);
    const got = await landing(page);
    const bars = await barsBottom(page);
    note(`landed ${JSON.stringify(got)} bars end at ${bars}`);
    checkSame(true, got.open, 'the credits are open');
    check(got.seen, 'and "Photo Credits (401)" is ON SCREEN and on top — the hit-test at the summary returns the summary', got.hit);
    check(got.top >= bars && got.top <= bars + 3, `its top is right under whatever covers the top edge (${bars}px)`, String(got.top));
    if (menu) { check(got.top >= 63, 'below the theme\'s 63px pinned menu', String(got.top)); }
    /* Opt-in stills for the release report; nothing is asserted on them. */
    if (process.env.DCC_SHOTS) { await page.screenshot({ path: `${process.env.DCC_SHOTS}/credits-${w}-${how}.png` }); }
    await page.close();
  }
}

/* ====================================================================== */
for (const [w, h, menu, dy] of [[390, 844, false, 1200], [768, 1024, false, 1200], [1024, 768, true, 600], [1440, 900, true, 600]]) {
  section(`${w}: the pinned controls after a ${dy}px scroll`);
  const page = await site(w, h, { menu });
  await page.goto(`${SITE}/wildlife-guide/`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), dy);
  await page.waitForTimeout(1200);
  const pin = await page.evaluate(() => {
    const top = document.querySelector('[data-dccwl-gp-top]');
    const r = top.getBoundingClientRect();
    const sw = top.querySelector('[data-dccwl-gp-scope="here"]').getBoundingClientRect();
    const x = Math.round(sw.left + sw.width / 2);
    const bar = document.querySelector('.site-header-bottom-fixed');
    const br = bar ? bar.getBoundingClientRect() : null;
    return {
      top: Math.round(r.top), barBottom: br ? Math.round(br.bottom) : null,
      barFixed: !!bar && getComputedStyle(bar).position === 'fixed',
      edge: top.contains(document.elementFromPoint(x, Math.round(r.top) + 2)),
      above: !!bar && bar.contains(document.elementFromPoint(x, Math.max(0, Math.round(r.top) - 2))),
    };
  });
  note(`pinned ${JSON.stringify(pin)}`);
  if (menu) {
    check(pin.barFixed, 'the theme\'s bar has pinned itself (the condition under test)');
    checkSame(pin.barBottom, pin.top, 'the controls stick just under it');
    check(pin.edge && pin.above, 'the hit-test 2px inside their top edge is the controls, 2px above is the bar');
  } else {
    checkSame(0, pin.top, 'the controls stick at the top — the theme\'s menu has scrolled away');
    check(pin.edge, 'and the hit-test 2px inside their top edge is the controls');
  }
  await page.close();
}

section('the theme asks for smooth scrolling; the guest asks for reduced motion');
{
  const page = await site(1440, 900, { menu: true, late: true, reducedMotion: true });
  await page.goto(`${SITE}/wildlife-guide/#credits`, { waitUntil: 'load' });
  checkSame(true, await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'reduced motion is really on');
  await page.waitForTimeout(5500);
  const got = await landing(page);
  check(got.seen, 'it still lands, with instant jumps that the theme\'s smooth scrolling did not turn into an animation', JSON.stringify(got));
  await page.close();
}

section('a guest who scrolls away is left alone');
{
  /* The guest wheels up at 1s; at 2.2s something that is NOT the guest
   * moves the page again. A watch still running would put the summary
   * back under the bars; one that ended at the wheel leaves it alone. */
  const page = await site(1440, 900, { menu: true, late: 'nudge' });
  await page.goto(`${SITE}/wildlife-guide/#credits`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const placed = await landing(page);
  check(placed.seen, 'it had landed', JSON.stringify(placed));
  await page.mouse.move(720, 600);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(3500);
  const got = await landing(page);
  note(`placed ${placed.top}, after the guest's wheel and a later nudge ${JSON.stringify(got)}`);
  check(Math.abs(got.top - placed.top) > 100, 'the page stays where the guest and the page left it — the watch ended at their first wheel', String(got.top));
  await page.close();
}

await browser.close();
done();
