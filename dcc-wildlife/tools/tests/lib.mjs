/**
 * Browser harness for the UI suites.
 *
 * Why a real browser: the questions worth asking are layout questions. Whether
 * fitBounds was CALLED is not the bug — the bug is what the map's zoom and
 * centre are once the sheet has actually been laid out. Only a browser that
 * performs layout can answer that, so these suites drive Chromium and read
 * computed geometry.
 *
 * When Chromium or playwright-core is absent this SKIPS with exit 77. It must
 * never pass by default: a green tick from a suite that never opened a browser
 * is worse than no suite at all.
 *
 * NOT shipped: tools/ is excluded from the release zip.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const PLUGIN = join(HERE, '..', '..');

/* ---- counters; the exit code is the result ------------------------------ */
let pass = 0;
let fail = 0;
let skip = 0;

export function check(ok, what, detail = '') {
  if (ok) { pass += 1; console.log(`  ok   ${what}`); return true; }
  fail += 1;
  console.log(`  FAIL ${what}${detail ? `\n         ${detail}` : ''}`);
  return false;
}

/**
 * Equality that also works for arrays and plain objects.
 *
 * Object.is alone produced the least helpful failure possible — "expected
 * ["All"], got ["All"]" — because two equal arrays are different objects. Any
 * non-primitive is compared structurally instead.
 */
export function checkSame(expected, actual, what) {
  const structural = (v) => v !== null && typeof v === 'object';
  const same = structural(expected) || structural(actual)
    ? JSON.stringify(expected) === JSON.stringify(actual)
    : Object.is(expected, actual);
  return check(
    same,
    what,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

/** Numeric comparison with an explicit tolerance, so a 0.5px reflow is not a failure. */
export function checkNear(expected, actual, tol, what) {
  const ok = typeof actual === 'number' && Math.abs(actual - expected) <= tol;
  return check(ok, what, `expected ${expected} ±${tol}, got ${JSON.stringify(actual)}`);
}

export function checkAtLeast(min, actual, what) {
  const ok = typeof actual === 'number' && actual >= min;
  return check(ok, what, `expected >= ${min}, got ${JSON.stringify(actual)}`);
}

export function checkAtMost(max, actual, what) {
  const ok = typeof actual === 'number' && actual <= max;
  return check(ok, what, `expected <= ${max}, got ${JSON.stringify(actual)}`);
}

export function section(title) { console.log(`\n-- ${title}`); }
export function note(text) { console.log(`       ${text}`); }

export function skipped(what, why) { skip += 1; console.log(`  skip ${what} — ${why}`); }

export function done() {
  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  if (pass + fail === 0) {
    console.log('FAIL: the suite asserted nothing');
    process.exit(2);
  }
  process.exit(fail > 0 ? 1 : 0);
}

/** Leave the whole suite unrun, loudly. 77 is the runner's "skipped" code. */
export function skipSuite(why) {
  console.log(`  suite skipped: ${why}`);
  process.exit(77);
}

/* ---- finding a browser -------------------------------------------------- */
function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM && existsSync(process.env.PLAYWRIGHT_CHROMIUM)) {
    return process.env.PLAYWRIGHT_CHROMIUM;
  }
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const p = join(root, entry, rel);
        try { if (statSync(p).isFile()) return p; } catch { /* keep looking */ }
      }
    }
  }
  return null;
}

export async function launch() {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    skipSuite('playwright-core is not installed (npm i playwright-core in tools/tests)');
  }
  const exe = findChromium();
  if (!exe) skipSuite('no local Chromium found under PLAYWRIGHT_BROWSERS_PATH');
  return chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}

/* ---- building a page out of the plugin's own assets --------------------- */
export function asset(rel) {
  return readFileSync(join(PLUGIN, rel), 'utf8');
}

/**
 * A page carrying the plugin's REAL stylesheets and scripts.
 *
 * `hostile` reproduces the Bravada trap the plugin has to survive: a 20px root
 * at weight 700. The plugin's own floor is supposed to win, so tests that care
 * about type run under it rather than under a friendly default.
 */
export async function buildPage(browser, opts = {}) {
  const {
    width = 390,
    height = 844,
    css = [],
    js = [],
    body = '',
    head = '',
    globals = {},
    hostile = false,
    sitekit = false,
    /*
     * TOUCH OR MOUSE (1.38.0). Every page here was built with hasTouch and
     * isMobile on, at every width — so a suite could not tell a phone from a
     * desktop, and a state that only exists after a real tap (a button that
     * keeps :hover and :focus) was never reachable. That is how item 8 passed
     * here and failed on Rob's phone. Suites now say which they mean; the
     * default stays touch so nothing already written changes behaviour.
     */
    touch = true,
    /*
     * REDUCED MOTION (1.42.0). This was NOT forwarded, and the gap was
     * found the hard way: a self-audit passed `reducedMotion` to
     * widgetPage, measured a page where the setting had never been
     * applied, and reported a clean result. Any suite asking the question
     * has to be able to turn it on here, and should assert
     * matchMedia(...).matches before trusting what it measures.
     */
    reducedMotion = null,
    /*
     * DEVICE PIXEL RATIO (1.42.0). Fixed at 2 since this harness was
     * written, which hid the case that justifies the tile srcset: Rob
     * reviews on an iPhone at DPR 3, where a 168 CSS px tile needs 504
     * device pixels and the 320 file is a 1.58x upscale. A claim about a
     * DPR-3 screen has to be measured on one.
     */
    dpr = 2,
    /*
     * A REAL URL, WITH A REAL HASH OR QUERY (1.44.0).
     *
     * Every page here is built with `setContent`, which lands on
     * about:blank — where there is no hash to read and `history.replaceState`
     * is not reliably allowed. So a deep link could not be tested at all,
     * and #canal-month= has been a documented feature since 1.23.0 with no
     * suite behind it. 1.44.0 makes it decide which VIEW opens, which is far
     * too much to leave untested.
     *
     * When `url` is given the page is SERVED over a routed https URL and
     * navigated to, so location.hash and location.search are the real
     * thing and the scripts run in the real DOMContentLoaded order. Opt-in:
     * without it the setContent path is byte-for-byte what it always was,
     * because changing how thirty suites load their page to serve one is
     * the kind of trade this harness does not make.
     */
    url = '',
  } = opts;

  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    hasTouch: touch,
    isMobile: touch,
    ...(reducedMotion ? { reducedMotion } : {}),
  });

  /*
   * SERVE THE PHOTOGRAPHS.
   *
   * dcc_boot_plugin() gives the plugin a made-up site URL, so every photo the
   * dataset carries points at https://example.test/… and would 404. Until
   * 1.33.0 that did not show, because the harness defined the wrong constant
   * and no photo resolved at all; now that they do, a fixture rendered
   * without this shows broken images where live shows the animal.
   *
   * Fulfilled from assets/photos on disk, which is the same directory
   * Photo_Library falls back to on a real site before the media import has
   * run. Anything else under that host is aborted rather than left to hang.
   */
  /*
   * The species-detail route. The page's inline config points the client at
   * a REST URL on a site that does not exist, so without this every browser
   * suite would exercise only the DEGRADED sheet — the one a guest gets when
   * the fetch fails. That path is worth testing; it is not worth testing
   * instead of the real one.
   *
   * Served from the same PHP the route serves, so a fixture and a guest see
   * the same sheet.
   */
  await page.route('**/wp-json/dcc-wildlife/v1/species*', async (route) => {
    try {
      const body = execFileSync(process.env.PHP_BIN || 'php',
        [join(HERE, 'render-fixture.php'), 'detail'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      await route.fulfill({ status: 200, contentType: 'application/json', body });
    } catch {
      await route.fulfill({ status: 500, body: '{}' });
    }
  });

  await page.route('**/wp-content/plugins/dcc-wildlife/assets/**', async (route) => {
    const url = new URL(route.request().url());
    const rel = url.pathname.replace(/^.*\/dcc-wildlife\/assets\//, '');
    const file = join(PLUGIN, 'assets', rel);
    try {
      const body = readFileSync(file);
      const ext = rel.split('.').pop().toLowerCase();
      const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        svg: 'image/svg+xml', css: 'text/css', js: 'text/javascript' }[ext] || 'application/octet-stream';
      await route.fulfill({ status: 200, contentType: type, body });
    } catch {
      await route.fulfill({ status: 404, body: '' });
    }
  });

  const styles = css.map((f) => `<style data-src="${f}">\n${asset(f)}\n</style>`).join('\n');
  const hostileCss = hostile
    ? '<style data-src="theme-trap">html{font-size:20px;font-weight:700;font-family:Raleway,sans-serif}</style>'
    : '';
  /* The full site kit, not just its root font. `hostile` answers "does the
   * plugin's type survive a 20px/700 root"; `sitekit` answers the harder
   * question — "does the plugin's rule WIN against the kit's (0,3,1) reset".
   * A suite that asks the second must also wrap its body (see wrap below),
   * or none of the kit's selectors match and it proves nothing. */
  const sitekitCss = sitekit
    ? `<style data-src="sitekit">\n${readFileSync(join(HERE, 'sitekit.css'), 'utf8')}\n</style>`
    : '';
  const globalScript = Object.keys(globals).length
    ? `<script>${Object.entries(globals)
        .map(([k, v]) => `window[${JSON.stringify(k)}] = ${JSON.stringify(v)};`)
        .join('\n')}</script>`
    : '';

  const html =
    `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `${hostileCss}${sitekitCss}${styles}${head}</head><body>` +
      (sitekit ? `<div class="site"><div class="entry-content">${body}</div></div>` : body) +
      `${globalScript}</body></html>`;

  if (url) {
    /*
     * MATCHED BY PREDICATE, NOT BY GLOB. A glob is compared against the
     * WHOLE url, so a pattern built from the path alone missed every
     * variant carrying a query — `?canal-month=april` went unrouted and the
     * navigation failed on DNS. Comparing the path is the question actually
     * being asked: serve this document whatever hash or query is on it.
     */
    const bare = url.split('#')[0].split('?')[0];
    await page.route(
      (u) => u.href.split('#')[0].split('?')[0] === bare,
      async (route) => {
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      }
    );
    await page.goto(url, { waitUntil: 'load' });
  } else {
    await page.setContent(html, { waitUntil: 'load' });
  }

  // Scripts go in after the globals so an IIFE reading window.DCC_WL_* sees them.
  for (const f of js) {
    await page.addScriptTag({ content: asset(f) });
  }
  return page;
}

/**
 * The plugin's real server output, generated fresh by PHP on every call.
 * Never a checked-in snapshot: a UI suite must not be able to pass against
 * markup the plugin stopped producing.
 */
export function rendered(which = 'month', ...flags) {
  const out = execFileSync(process.env.PHP_BIN || 'php', [join(HERE, 'render-fixture.php'), which, ...flags], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

/**
 * A page holding a real widget, its real stylesheets and its real scripts,
 * with the inline config emitted before them exactly as WordPress does.
 */
/*
 * The assets WordPress would actually serve for each widget, mirroring
 * Plugin::register_assets()'s dependency chains.
 *
 * This used to be one hard-coded pair — app.css + widget.css — for every
 * `which`, so `widgetPage(browser, 'canal')` rendered the hub with NO
 * canal.css. Nothing failed; the measurements were simply of a different
 * page than the one live serves, and a hub tile came back 77px tall with a
 * computed min-height of 0 where the stylesheet asks for 168. A harness that
 * quietly measures the wrong thing is worse than one that refuses to.
 */
const ASSETS = {
  month: {
    css: ['assets/css/app.css', 'assets/css/widget.css'],
    js: ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/widget.js'],
  },
  canal: {
    css: ['assets/css/app.css', 'assets/css/widget.css', 'assets/css/water.css', 'assets/css/canal.css'],
    js: ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/widget.js', 'assets/js/water.js', 'assets/js/canal.js'],
  },
  water: {
    css: ['assets/css/app.css', 'assets/css/water.css'],
    js: ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js'],
  },
  /*
   * /wildlife-guide/ (1.43.0) — styles only, and the EMPTY js list is the
   * assertion. The page enqueues no script on the front end, so a harness
   * that loaded one here would be testing a page the site does not serve.
   */
  guide: {
    css: ['assets/css/app.css', 'assets/css/widget.css'],
    js: [],
  },
};

export async function widgetPage(browser, which = 'month', opts = {}, ...fixtureFlags) {
  const fixture = rendered(which, ...fixtureFlags);
  const bundle = ASSETS[which] || ASSETS.month;
  const page = await buildPage(browser, {
    css: opts.css || bundle.css,
    js: [],
    body: fixture.html + `<script>${fixture.config}</script>`,
    ...opts,
  });
  for (const f of opts.js || bundle.js) {
    await page.addScriptTag({ content: asset(f) });
  }
  // The deck measures itself; give layout and its rAF a chance to settle.
  await page.waitForTimeout(250);

  /*
   * AND WAIT FOR THE GUIDE GRIDS TO FILL (1.43.0).
   *
   * PHP ships the grids empty and widget.js builds the 402 tiles in idle
   * time, so every suite that COUNTS tiles is now measuring a DOM that
   * converges a few frames after load. Without this, twenty assertions in
   * ui-deck.mjs failed against grids that were simply not finished yet —
   * which is a test timing artefact, not a defect.
   *
   * It is a bounded wait, not a sleep, and the bound is the point: if the
   * grids do NOT converge the wait expires and every tile count fails, which
   * is exactly what should happen. A suite that waited forever would turn a
   * real stall into a hang, and one that slept a fixed 2s would be slow and
   * still racy.
   */
  await settleGrids(page);

  return { page, fixture };
}

/**
 * Wait until no guide grid is still marked lazy.
 *
 * Returns true if they converged, false if the wait expired — callers that
 * care can assert on it; the default page build simply moves on, and the
 * tile counts then fail on their own, which is the honest outcome.
 */
export async function settleGrids(page, timeout = 8000) {
  try {
    await page.waitForFunction(
      () => {
        const lazy = document.querySelector('.dccwl-guide-grid[data-dccwl-lazy]');
        if (!lazy) { return true; }
        /*
         * A HIDDEN GUIDE IS A SETTLED GUIDE. Since 1.43.0 the tiles are
         * built only once the guide is actually visible — that is what keeps
         * /explore/, which opens on Water, near its DOM budget at load. So
         * on every page where the guide is still behind a panel there is
         * nothing to wait for, and waiting the full timeout on each of the
         * harness's many page builds took the suite run past ten minutes.
         */
        const section = document.querySelector('.dccwl-guide');
        return !section || !section.offsetParent;
      },
      { timeout }
    );
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Switch the canal app to its Wildlife view.
 *
 * ONE HELPER BECAUSE THE WAY IN CHANGED (1.44.0). Every suite used to click
 * `.dccwl-hub-tile` — the hub's Wildlife door. Rob removed the hub, so the
 * door is now a row in the view dropdown, and ten call sites across four
 * suites would otherwise each have learned the new markup separately.
 *
 * It opens the menu and presses the Wildlife row, which is exactly what a
 * guest does — not a direct call into canal.js. A test that reached past the
 * control would stop proving the control works, which is the whole point of
 * the 1.38.0 rule about testing a state with a real tap.
 *
 * Returns true if it switched, false if there was nothing to switch (a
 * placement with no water module opens on Wildlife already).
 */
export async function openWildlife(page) {
  const did = await page.evaluate(() => {
    const sel = document.querySelector('[data-dccwl-viewselect]');
    if (!sel) { return false; }
    const trigger = sel.querySelector('[data-dccwl-viewtrigger]');
    if (trigger) { trigger.click(); }
    const row = sel.querySelector('[data-dccwl-view="wildlife"]');
    if (!row) { return false; }
    row.click();
    return true;
  });
  await page.waitForTimeout(350);
  await settleGrids(page);
  return did;
}

/** Computed box for one selector, or null when the node is absent. */
export async function boxOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
}

/** Every box for a selector, in document order. */
export async function boxesOf(page, selector) {
  return page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }), selector);
}

/**
 * Computed style for one selector.
 *
 * `getPropertyValue` takes KEBAB-CASE and returns an empty string for anything
 * else — including every camelCase name — so `getPropertyValue('backgroundColor')`
 * silently yielded ''. An assertion comparing a colour against '' is not a
 * failing test, it is a test that cannot pass, and it had been quietly
 * unfalsifiable. Names are normalised now, the CSSOM property is read directly
 * as a second route, and a name neither route knows THROWS rather than
 * returning a blank that would compare equal to another blank.
 */
export async function styleOf(page, selector, props) {
  return page.evaluate(([sel, list]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of list) {
      const kebab = p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
      let v = cs.getPropertyValue(kebab);
      if ('' === v && p in cs) { v = cs[p]; }
      if ('' === v && kebab in cs) { v = cs[kebab]; }
      if (undefined === v || null === v) { v = ''; }
      if ('' === v && !(p in cs) && !(kebab in cs)) {
        throw new Error(`styleOf: no such CSS property "${p}"`);
      }
      out[p] = String(v);
    }
    return out;
  }, [selector, props]);
}

/** Does the page scroll sideways? A mobile regression that is easy to miss. */
export async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}


/**
 * WAIT FOR THE INLINE CHAIN MAP (1.44.0).
 *
 * Until this release every map suite began `await page.click(
 * '[data-dccwl-map-open]')` and then waited for a sheet. Rob removed the
 * button: the map is in the Map pane and loads when the host comes into
 * view. So the suites need a different first line, and it must drive the
 * REAL path rather than reaching past it — the 1.33.1 rule that a suite
 * must exercise the path production takes.
 *
 * What this does, in order: select the Map pane if a tab bar is present
 * (the pane is `hidden` otherwise, and a hidden host never intersects —
 * the 1.43.0 trap), scroll the host into view so the observer fires, and
 * then WAIT FOR THE CANVAS, bounded. It never clicks anything the plugin
 * does not give a guest.
 *
 * Returns the canvas handle, or throws with what it found instead — a
 * timeout that says "no canvas" and nothing else is the kind of failure
 * that costs an hour.
 */
export async function openInlineMap(page, timeout = 15000) {
  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-water-tab-btn="map"]');
    if (b) { b.click(); }
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const h = document.querySelector('[data-dccwl-map-host]');
    if (h) { h.scrollIntoView({ block: 'center' }); }
  });
  try {
    await page.waitForSelector('[data-dccwl-map-host] .dccwl-map-canvas', {
      state: 'attached', timeout,
    });
  } catch (err) {
    const why = await page.evaluate(() => {
      const h = document.querySelector('[data-dccwl-map-host]');
      return {
        host: !!h,
        text: h ? h.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : null,
        paneHidden: h ? !!h.closest('[data-dccwl-water-tab][hidden]') : null,
        leaflet: !!window.L,
        api: !!window.DCCWL_Map,
      };
    });
    throw new Error('inline map never built: ' + JSON.stringify(why));
  }
  /* Leaflet fits the view once the canvas has a size (1.31.0's fitWhenLaid),
   * so give that a frame before anything measures the map. */
  await page.waitForTimeout(400);
  return page.$('[data-dccwl-map-host] .dccwl-map-canvas');
}
