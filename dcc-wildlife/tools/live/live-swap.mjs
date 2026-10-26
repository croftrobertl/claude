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

  /* 3. The pinned controls after a scroll: 600px at >=1024, as the Director
   *    asked. On a phone the header above them is taller, so 600px leaves
   *    them still travelling (10px from the top at 390): there the scroll
   *    is 1,200px, far enough that they must have reached the top. */
  page = await open(w, h);
  await page.goto(`${SITE}/wildlife-guide/`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), w >= 1024 ? 600 : 1200);
  await page.waitForTimeout(1200);
  const pin = await page.evaluate(() => {
    const top = document.querySelector('[data-dccwl-gp-top]');
    const r = top.getBoundingClientRect();
    const sw = top.querySelector('[data-dccwl-gp-scope="here"]').getBoundingClientRect();
    const x = Math.round(sw.left + sw.width / 2);
    const bar = document.querySelector('.site-header-bottom-fixed');
    const br = bar ? bar.getBoundingClientRect() : null;
    const barFixed = bar ? getComputedStyle(bar).position === 'fixed' && br.bottom > 0 : false;
    const hit = (y) => document.elementFromPoint(x, y);
    return {
      top: Math.round(r.top), barFixed, barBottom: br ? Math.round(br.bottom) : null,
      edgeIsControls: top.contains(hit(Math.round(r.top) + 2)),
      aboveIsBar: bar ? bar.contains(hit(Math.max(0, Math.round(r.top) - 2))) : false,
      offset: getComputedStyle(document.querySelector('[data-dccwl-gp]')).getPropertyValue('--dccwl-sticky-offset').trim(),
    };
  });
  console.log(`       ${w} after the scroll: ${JSON.stringify(pin)}`);
  if (w >= 1024) {
    ok(pin.barFixed, `${w}: the theme's menu bar is pinned after 600px (the condition being tested)`);
    ok(Math.abs(pin.top - pin.barBottom) <= 1, `${w}: the pinned controls sit just under it (${pin.barBottom}px)`, `controls top ${pin.top}`);
    ok(pin.edgeIsControls && pin.aboveIsBar, `${w}: the hit-test 2px inside their top edge is the controls, and 2px above is the menu bar`);
  } else {
    ok(pin.top === 0, `${w}: the controls stick at 0 — the theme's menu has scrolled away here`, `controls top ${pin.top}`);
    ok(pin.edgeIsControls, `${w}: and the hit-test 2px inside their top edge is the controls`);
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/live-${w}-scrolled.png` });
  await page.context().close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : (pass ? 0 : 2));
