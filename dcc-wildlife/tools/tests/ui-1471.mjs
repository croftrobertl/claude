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
const TOPBAR = `(function (){
var root=document.documentElement, px=0, until=0, ticking=false, bar=null;
function read(){
if(!bar||!bar.isConnected) bar=document.querySelector('.site-header-bottom-fixed');
if(!bar) return 0;
if(getComputedStyle(bar).position!=='fixed') return 0;
var r=bar.getBoundingClientRect();
return r.bottom > 0&&r.top < innerHeight ? Math.max(0, Math.round(r.bottom)):0;
}
function update(){
var v=read();
if(v!==px){
px=v;
root.style.setProperty('--dcc-topbar', v + 'px');
document.dispatchEvent(new CustomEvent('dcc:topbar', { detail: { px: v }}));
}}
function frame(){
update();
if(performance.now() < until) requestAnimationFrame(frame);
else ticking=false;
}
function follow(){
until=performance.now() + 700;
if(!ticking){ ticking=true; requestAnimationFrame(frame); }}
window.DCCTopbar={ get: function (){ return px; }};
addEventListener('scroll', follow, { passive: true });
addEventListener('resize', follow, { passive: true });
document.addEventListener('transitionend', function (e){
if(bar&&(e.target===bar||bar.contains(e.target))) update();
});
follow();
})();`;

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
      .header-fixed .site-header-bottom-fixed{position:fixed;top:0;transform:translateY(-63px)}
    </style>`;
  const header = `<header id="theme-header"><div class="site-header-bottom">${menu
    ? '<div class="site-header-bottom-fixed"><a href="/">Home</a><a href="/cottages/">Cottages</a><a href="/explore/">Explore</a></div>'
    : ''}</div></header>`
    /* 1.47.3: below 1024 the live bar slides in on a scroll UP and is gone
     * (absolute, off screen) on a scroll DOWN; from 1024 it pins once the
     * page is past the header and stays. */
    + `<script>(function () {
         var hb = document.querySelector('.site-header-bottom');
         var lastY = window.scrollY;
         window.addEventListener('scroll', function () {
           var y = window.scrollY, dy = y - lastY; lastY = y;
           setTimeout(function () {
             var wide = window.innerWidth >= 1024;
             var on = y > 150 && (wide ? true : dy < 0 || (dy === 0 && hb.classList.contains('header-fixed')));
             var fb = hb.querySelector('.site-header-bottom-fixed');
             if (on && !hb.classList.contains('header-fixed')) {
               /* The slide, frame by frame over 300ms, as live's bar moves
                * (the helper reported 25, 30, 35 ... 63 on the real page).
                * Driven in script so every frame really is part-way. */
               hb.classList.add('header-fixed');
               var t0 = performance.now();
               (function step(now) {
                 var k = Math.min(1, (now - t0) / 300);
                 if (fb) { fb.style.transform = 'translateY(' + (-63 + 63 * k) + 'px)'; }
                 if (k < 1 && hb.classList.contains('header-fixed')) { requestAnimationFrame(step); }
               })(t0);
             } else if (!on) { hb.classList.remove('header-fixed'); if (fb) { fb.style.transform = ''; } }
           }, 60);
         }, { passive: true });
       })();</script>`
    /* The Director's mu-plugin dcc-topbar.php, VERBATIM as live serves it
     * (read from doracanalcourt.com on 2026-10-26): the one place that
     * measures the theme's bar. */
    + `<script>${TOPBAR}</script>`;
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
    check(got.top >= bars, `nothing covers it — its top is at or below whatever covers the top edge (${bars}px)`, String(got.top));
    if (menu) { check(got.top >= 63, 'below the theme\'s 63px pinned menu', String(got.top)); }
    /* Opt-in stills for the release report; nothing is asserted on them. */
    if (process.env.DCC_SHOTS) { await page.screenshot({ path: `${process.env.DCC_SHOTS}/credits-${w}-${how}.png` }); }
    await page.close();
  }
}

/* ====================================================================== */
/* RIDE WITH THE BAR (1.47.3, Rob's pick). The same checks the live-swap
 * harness makes on the real page. */
const viewOf = (page) => page.evaluate(() => {
  const top = document.querySelector('[data-dccwl-gp-top]');
  const r = top.getBoundingClientRect();
  const sw = top.querySelector('[data-dccwl-gp-scope="here"]').getBoundingClientRect();
  const x = Math.round(sw.left + sw.width / 2);
  const bar = document.querySelector('.site-header-bottom-fixed');
  const br = bar ? bar.getBoundingClientRect() : null;
  const hit = (y) => document.elementFromPoint(x, Math.max(0, Math.min(innerHeight - 1, y)));
  const list = document.querySelector('[data-dccwl-gp-list]');
  return {
    top: Math.round(r.top), bottom: Math.round(r.bottom), ride: top.getAttribute('data-dccwl-ride'),
    barFixed: !!bar && getComputedStyle(bar).position === 'fixed', barTop: br ? Math.round(br.top) : null, barBottom: br ? Math.round(br.bottom) : null,
    at20IsList: !!list && list.contains(hit(20)),
    edge: top.contains(hit(Math.round(r.top) + 2)),
    above: !!bar && bar.contains(hit(Math.round(r.top) - 2)),
  };
});
for (const [w, h] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
  section(`${w}: the pinned controls ride with the bar`);
  const page = await site(w, h, { menu: true });
  await page.goto(`${SITE}/wildlife-guide/`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const DOWN = w < 1024 ? [1200, 1800, 2400] : [600, 900];
  const UP = w < 1024 ? [2200, 2000] : [800];
  for (const y of DOWN) { await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y); await page.waitForTimeout(300); }
  await page.waitForTimeout(1000);
  const down = await viewOf(page);
  note(`down ${JSON.stringify(down)}`);
  if (w < 1024) {
    check(down.bottom <= 0, 'scrolling down, the controls are off screen', String(down.bottom));
    check(down.at20IsList, 'and the hit-test at y 20 is the species list');
  } else {
    check(down.barFixed && down.top === down.barBottom, 'the bar stays pinned and the controls sit just under it', `${down.top} vs ${down.barBottom}`);
    check(down.edge && down.above, '2px inside their top edge is the controls, 2px above is the bar');
  }
  for (const y of UP) { await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y); await page.waitForTimeout(300); }
  await page.waitForTimeout(1000);
  const up = await viewOf(page);
  note(`up ${JSON.stringify(up)}`);
  check(up.barFixed && up.barTop === 0 && up.barBottom === 63, 'scrolling up, the bar is at 0-63', `${up.barTop}-${up.barBottom}`);
  checkSame(up.barBottom, up.top, 'and the controls sit directly under it');
  check(up.edge && up.above, '2px inside their top edge is the controls, 2px above is the bar');
  if (w < 1024) {
    await page.focus('[data-dccwl-gp-search]');
    await page.keyboard.type('a');
    await page.evaluate(() => window.scrollBy({ top: 900, behavior: 'instant' }));
    await page.waitForTimeout(1000);
    const typing = await page.evaluate(() => {
      const f = document.querySelector('[data-dccwl-gp-search]');
      const r = f.getBoundingClientRect();
      const e = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return { focused: document.activeElement === f, top: Math.round(r.top), onTop: e === f || f.contains(e) };
    });
    note(`typing ${JSON.stringify(typing)}`);
    check(typing.focused && typing.top >= 0 && typing.onTop, 'with the search focused, a scroll down leaves the field on screen and on top');
  }
  await page.close();
}

/* ====================================================================== */
for (const rm of [false, true]) {
  section(`390: the ride ${rm ? 'with reduced motion: no slide' : 'slides in step with the bar'}`);
  const page = await site(390, 844, { menu: true, reducedMotion: rm });
  await page.goto(`${SITE}/wildlife-guide/`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  for (const y of [1200, 1800, 2400]) { await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y); await page.waitForTimeout(300); }
  await page.waitForTimeout(800);
  /* Sample EVERY FRAME through a scroll UP and the bar's whole slide
   * (a 30ms timer missed the slide on some runs). */
  const states = await page.evaluate(() => new Promise((resolve) => {
    const out = [];
    const top = document.querySelector('[data-dccwl-gp-top]');
    window.scrollTo({ top: 2200, behavior: 'instant' });
    const t0 = performance.now();
    (function tick() {
      out.push([top.getAttribute('data-dccwl-ride'), Math.round(top.getBoundingClientRect().top), window.DCCTopbar.get()]);
      if (performance.now() - t0 < 1200) { requestAnimationFrame(tick); } else { resolve(out); }
    })();
  }));
  const kinds = [...new Set(states.map((x) => x[0]))];
  note(`states seen ${JSON.stringify(kinds)} over ${states.length} frames: ${states.map((x) => x.join(':')).filter((x, i, a) => i === 0 || x !== a[i - 1]).join(' > ')}`);
  checkSame('shown', states[states.length - 1][0], 'it ends shown, under the bar');
  if (rm) {
    check(!kinds.includes('moving'), 'and never passes through a part-way position — it simply appears', JSON.stringify(kinds));
  } else {
    check(kinds.includes('moving'), 'and on the way it moves part-way, frame by frame with the bar', JSON.stringify(kinds));
    const moving = states.filter((x) => 'moving' === x[0]);
    check(moving.every((x) => x[2] > 0 && x[2] < 63), 'only while the bar itself is part-way in (0 < --dcc-topbar < 63)', JSON.stringify(moving.slice(0, 6)));
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
