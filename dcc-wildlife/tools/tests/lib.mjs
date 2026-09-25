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

export function checkSame(expected, actual, what) {
  return check(
    Object.is(expected, actual),
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
  } = opts;

  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });

  const styles = css.map((f) => `<style data-src="${f}">\n${asset(f)}\n</style>`).join('\n');
  const hostileCss = hostile
    ? '<style data-src="theme-trap">html{font-size:20px;font-weight:700;font-family:Raleway,sans-serif}</style>'
    : '';
  const globalScript = Object.keys(globals).length
    ? `<script>${Object.entries(globals)
        .map(([k, v]) => `window[${JSON.stringify(k)}] = ${JSON.stringify(v)};`)
        .join('\n')}</script>`
    : '';

  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `${hostileCss}${styles}${head}</head><body>${body}${globalScript}</body></html>`,
    { waitUntil: 'load' }
  );

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
export async function widgetPage(browser, which = 'month', opts = {}) {
  const fixture = rendered(which);
  const page = await buildPage(browser, {
    css: opts.css || ['assets/css/app.css', 'assets/css/widget.css'],
    js: [],
    body: fixture.html + `<script>${fixture.config}</script>`,
    ...opts,
  });
  for (const f of opts.js || ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/widget.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  // The deck measures itself; give layout and its rAF a chance to settle.
  await page.waitForTimeout(250);
  return { page, fixture };
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

export async function styleOf(page, selector, props) {
  return page.evaluate(([sel, list]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of list) out[p] = cs.getPropertyValue(p);
    return out;
  }, [selector, props]);
}

/** Does the page scroll sideways? A mobile regression that is easy to miss. */
export async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
