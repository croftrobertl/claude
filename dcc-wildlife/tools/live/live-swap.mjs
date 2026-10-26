/**
 * THE LIVE-SWAP CHECK (1.47.2) — the Director's standard for every release.
 *
 * Loads the REAL pages on doracanalcourt.com through the container's proxy,
 * GET ONLY (anything else is aborted before it leaves the browser), and
 * swaps this build in for what live serves:
 *
 *   - every `dcc-wildlife/assets/js/*.js` request is answered from this
 *     checkout (or, for a mutation run, from the file named in DCC_MUT_GUIDE
 *     in place of guide.js);
 *   - SpeedyCache serves one combined, re-minified stylesheet, so CSS cannot
 *     be swapped by URL: this build's guide.css is APPENDED at the end of
 *     <head>, after the combined file, so its rules win.
 *
 * The page HTML, the theme, its scripts and its fonts are live's own. So a
 * pass here is a pass on the page guests get, with only our files changed.
 *
 *   node tools/live/live-swap.mjs            # every check, every width
 *   DCC_MUT_GUIDE=/path/to/guide.js node …   # the same checks on a mutant
 *   DCC_SHOTS=/dir node …                    # also save screenshots
 *   DCC_PATCH_HELPER=1 node …                # with the one-line helper fix
 *
 * DCC_PATCH_HELPER (1.47.3): the Director's mu-plugin dcc-topbar.php follows
 * the theme's bar for 0.7s after a scroll and re-reads on `transitionend`.
 * From 1024 the theme slides the bar in with a ~1s CSS ANIMATION, so after a
 * quick scroll the helper stops at 43px while the bar comes to rest at 63.
 * This flag adds the matching `animationend` re-read to the helper in the
 * served HTML, to show what the proposed fix does. Off by default: a plain
 * run tests the helper exactly as live has it.
 *
 * Needs: playwright-core (tools/tests/node_modules), the container's
 * Chromium (PLAYWRIGHT_CHROMIUM or /opt/pw-browsers/chromium), HTTPS_PROXY.
 * Exit code 0 only if every check passed. NOT part of run-all.sh: it needs
 * the network and the live site, which the offline harness must not.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, '..', '..');
const { chromium } = await import(join(PLUGIN, 'tools/tests/node_modules/playwright-core/index.mjs'));

const SITE = 'https://doracanalcourt.com';
const WIDTHS = [[390, 844], [768, 1024], [1024, 768], [1440, 900]];
const MUT = process.env.DCC_MUT_GUIDE || '';
const SHOTS = process.env.DCC_SHOTS || '';

let pass = 0;
let fail = 0;
const ok = (c, what, detail = '') => {
  if (c) { pass++; console.log(`  ok   ${what}`); } else { fail++; console.log(`  FAIL ${what}${detail ? `\n         ${detail}` : ''}`); }
};

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium',
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
});

async function open(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 900 });
  const page = await ctx.newPage();
  const swapped = { js: 0, css: 0 };
  page.__swapped = swapped;
  await page.route('**/*', async (route) => {
    const req = route.request();
    if ('GET' !== req.method()) { await route.abort(); return; }
    const url = new URL(req.url());
    const m = url.pathname.match(/\/wp-content\/plugins\/dcc-wildlife\/assets\/js\/([a-z0-9-]+\.js)$/);
    if (m) {
      const file = ('guide.js' === m[1] && MUT) ? MUT : join(PLUGIN, 'assets/js', m[1]);
      swapped.js++;
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(file, 'utf8') });
      return;
    }
    if ('document' === req.resourceType() && url.host === 'doracanalcourt.com') {
      const res = await route.fetch();
      let body = await res.text();
      const css = readFileSync(join(PLUGIN, 'assets/css/guide.css'), 'utf8');
      if (process.env.DCC_PATCH_HELPER && body.includes('window.DCCTopbar=')) {
        body = body.replace(/(addEventListener\('scroll', follow, \{ passive: true \}\);)/,
          "$1\ndocument.addEventListener('animationend', function (e){ if(bar&&(e.target===bar||bar.contains(e.target))) update(); });");
        swapped.helperPatched = /animationend/.test(body);
      }
      if (body.includes('</head>')) {
        body = body.replace('</head>', `<style id="dccwl-live-swap">${css}</style></head>`);
        swapped.css++;
      }
      await route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'text/html; charset=utf-8' } });
      return;
    }
    await route.continue();
  });
  return page;
}

/** Everything a guest sees at the credits summary. */
const credits = (page) => page.evaluate(() => {
  const d = document.getElementById('credits');
  if (!d) return { missing: true };
  const s = d.querySelector('summary');
  const r = s.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const inside = (dy) => { const e = document.elementFromPoint(cx, Math.round(r.top) + dy); return !!e && s.contains(e); };
  const at = (dy) => { const e = document.elementFromPoint(cx, Math.round(r.top) + dy); return e ? `${e.tagName}.${[...e.classList].slice(0, 2).join('.')}` : 'none'; };
  return {
    open: d.open, top: Math.round(r.top), y: Math.round(scrollY),
    seen: r.top >= 0 && r.bottom <= innerHeight && inside(10) && inside(20) && inside(Math.min(40, Math.round(r.height) - 4)),
    at10: at(10),
  };
});

async function settleAndCheck(page, label) {
  /* Sampled, as the Director did: every 500ms from 2s to 6s after load. */
  const samples = [];
  await page.waitForTimeout(2000);
  for (let t = 0; t < 9; t++) { samples.push(await credits(page)); await page.waitForTimeout(500); }
  const last = samples[samples.length - 1];
  console.log(`       ${label}: ${JSON.stringify(last)}`);
  ok(!!last.open, `${label}: the credits are open`);
  ok(samples.slice(-4).every((x) => x.seen), `${label}: "Photo Credits (401)" is on screen and on top for the last 2s — the hit-test 10, 20 and 40px in returns the summary`,
    samples.map((x) => `${x.top}:${x.seen ? 'seen' : x.at10}`).join(' '));
}

for (const [w, h] of WIDTHS) {
  console.log(`\n-- ${w}x${h}${MUT ? ' (MUTANT guide.js)' : ''}`);

  /* 1. Arriving with #credits. */
  let page = await open(w, h);
  await page.goto(`${SITE}/wildlife-guide/#credits`, { waitUntil: 'load', timeout: 120000 });
  ok(page.__swapped.js >= 2 && page.__swapped.css === 1, `${w}: this build's scripts and stylesheet were swapped in`, JSON.stringify(page.__swapped));
  await settleAndCheck(page, `${w} arriving with #credits`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/live-${w}-arrive.png` });
  await page.context().close();

  /* 2. Clicking the real Credits link on /explore/. */
  page = await open(w, h);
  await page.goto(`${SITE}/explore/`, { waitUntil: 'load', timeout: 120000 });
  const href = await page.evaluate(() => document.querySelector('a[href*="#credits"]')?.getAttribute('href') || '');
  ok(/wildlife-guide\/#credits$/.test(href), `${w}: /explore/ carries the real Credits link`, href);
  await Promise.all([
    page.waitForURL(/\/wildlife-guide\/#credits$/, { timeout: 120000 }),
    page.evaluate(() => document.querySelector('a[href*="#credits"]').click()),
  ]);
  await page.waitForLoadState('load');
  await settleAndCheck(page, `${w} clicking /explore/'s Credits link`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/live-${w}-click.png` });
  await page.context().close();

  /* 3. Credits, landing on a jump UPWARDS: the guest has scrolled far down
   *    the open credits and follows a #credits link again. */
  page = await open(w, h);
  await page.goto(`${SITE}/wildlife-guide/#credits`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(5000);
  await page.mouse.wheel(0, 10);
  await page.evaluate(() => window.scrollBy({ top: 5000, behavior: 'instant' }));
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.location.hash = '#top-of-nothing'; window.location.hash = '#credits'; });
  await page.waitForLoadState('load');
  await settleAndCheck(page, `${w} jumping UP to #credits`);
  await page.context().close();

  /* 4. Ride With the Bar. A guest scrolling: down in steps, then up. */
  page = await open(w, h);
  await page.goto(`${SITE}/wildlife-guide/`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(1500);
  const helper = await page.evaluate(() => !!window.DCCTopbar);
  ok(helper, `${w}: the shared dcc-topbar helper is on the page`);
  const view = () => page.evaluate(() => {
    const top = document.querySelector('[data-dccwl-gp-top]');
    const r = top.getBoundingClientRect();
    const sw = top.querySelector('[data-dccwl-gp-scope="here"]').getBoundingClientRect();
    const x = Math.round(sw.left + sw.width / 2);
    const bar = document.querySelector('.site-header-bottom-fixed');
    const br = bar ? bar.getBoundingClientRect() : null;
    const hit = (y) => document.elementFromPoint(x, Math.max(0, Math.min(innerHeight - 1, y)));
    const list = document.querySelector('[data-dccwl-gp-list]');
    return {
      y: Math.round(scrollY), helper: window.DCCTopbar ? window.DCCTopbar.get() : null,
      top: Math.round(r.top), bottom: Math.round(r.bottom), ride: top.getAttribute('data-dccwl-ride'),
      barFixed: !!bar && getComputedStyle(bar).position === 'fixed', barTop: br ? Math.round(br.top) : null, barBottom: br ? Math.round(br.bottom) : null,
      at20IsList: !!list && list.contains(hit(20)),
      edgeIsControls: top.contains(hit(Math.round(r.top) + 2)),
      aboveIsBar: !!bar && bar.contains(hit(Math.round(r.top) - 2)),
    };
  });
  /* Inside the guide: at 1024 and up the page is short (the list scrolls
   * in its own box), so the steps stay well within the guide's own box. */
  const DOWN = w < 1024 ? [1200, 1800, 2400] : [600, 900];
  const UP = w < 1024 ? [2200, 2000] : [800];
  for (const y of DOWN) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200);
  const down = await view();
  console.log(`       ${w} after scrolling DOWN: ${JSON.stringify(down)}`);
  if (w < 1024) {
    ok(down.bottom <= 0, `${w}: scrolling down, the controls are off screen`, `bottom ${down.bottom}`);
    ok(down.at20IsList, `${w}: and the hit-test at y 20 is the species list`);
  } else {
    ok(down.barFixed && Math.abs(down.top - down.barBottom) <= 1, `${w}: scrolling down, the bar stays pinned and the controls sit just under it`, `controls ${down.top}, bar bottom ${down.barBottom}, helper ${down.helper}`);
    ok(down.edgeIsControls && down.aboveIsBar, `${w}: 2px inside their top edge is the controls, 2px above is the bar`);
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/live-${w}-down.png` });
  for (const y of UP) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  const up = await view();
  console.log(`       ${w} after scrolling UP: ${JSON.stringify(up)}`);
  ok(up.barFixed && up.barTop === 0 && up.barBottom === 63, `${w}: scrolling up, the theme's bar is at 0-63`, `${up.barTop}-${up.barBottom}`);
  ok(Math.abs(up.top - up.barBottom) <= 1, `${w}: and the controls sit directly under it`, `controls ${up.top}, helper ${up.helper}`);
  ok(up.edgeIsControls && up.aboveIsBar, `${w}: 2px inside their top edge is the controls, 2px above is the bar`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/live-${w}-up.png` });

  /* 5. A guest typing: the search keeps its place on a scroll down. */
  if (w < 1024) {
    await page.focus('[data-dccwl-gp-search]');
    /* A search that still leaves a long list. With only a handful of rows
     * the guide ends a screen later, and no sticky box can follow past the
     * end of its own container (reported in CLAUDE.md, section 48). */
    await page.keyboard.type('a');
    await page.evaluate(() => window.scrollBy({ top: 900, behavior: 'instant' }));
    await page.waitForTimeout(1200);
    const typing = await page.evaluate(() => {
      const f = document.querySelector('[data-dccwl-gp-search]');
      const r = f.getBoundingClientRect();
      const e = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return { focused: document.activeElement === f, top: Math.round(r.top), bottom: Math.round(r.bottom), onTop: e === f || f.contains(e), y: Math.round(scrollY) };
    });
    console.log(`       ${w} typing, then scrolling DOWN: ${JSON.stringify(typing)}`);
    ok(typing.focused && typing.top >= 0 && typing.bottom <= h && typing.onTop, `${w}: with the search focused, a scroll down leaves the field on screen and on top`);
  }
  await page.context().close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : (pass ? 0 : 2));
