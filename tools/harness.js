'use strict';
/**
 * DCC Seasons — shared browser harness.
 *
 * Serves a fixture page plus the plugin's REAL asset files (never a copy —
 * a stale copy in a fixture directory once photographed a working backdrop
 * as broken) and boots the engine the way the loader does.
 *
 * Playwright lives in the session scratchpad, not in the repo, so the path
 * is resolved rather than required by bare name.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'dcc-seasons', 'assets', 'js');

function playwright() {
  const tries = [
    'playwright',
    path.join(process.env.SCRATCH || '', 'node_modules', 'playwright'),
    '/tmp/claude-0/-home-user-claude/3d01797e-7fb8-52f8-926f-a10d1a703217/scratchpad/node_modules/playwright',
  ];
  for (const t of tries) {
    if (!t) continue;
    try { return require(t); } catch (e) { /* next */ }
  }
  throw new Error('playwright not found — npm install playwright');
}

/** The client config, straight from the PHP classes. */
function config(args = []) {
  const out = execFileSync('php', [path.join(__dirname, 'gen-config.php'), ...args], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out);
}

/**
 * Open a fixture page with the real assets wired in.
 * @returns {{browser, page, close}}
 */
async function open(html, opts = {}) {
  const { chromium } = playwright();
  /* PLAYWRIGHT_BROWSERS_PATH points at the pre-installed browsers, so the
   * default resolution normally works. Fall back to the known-good path
   * only if the pinned version in this repo's playwright disagrees. */
  const launch = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (opts.executablePath) { launch.executablePath = opts.executablePath; }
  let browser;
  try {
    browser = await chromium.launch(launch);
  } catch (e) {
    const fb = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
    if (!fs.existsSync(fb)) { throw e; }
    browser = await chromium.launch({ ...launch, executablePath: fb });
  }
  const page = await browser.newPage({
    viewport: opts.viewport || { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: opts.reducedMotion || 'no-preference',
  });

  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'dcc.test' && url.pathname === '/') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    }
    const name = path.basename(url.pathname);
    const file = path.join(ASSETS, name);
    if (/^[a-z.]+\.js$/.test(name) && fs.existsSync(file)) {
      return route.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: fs.readFileSync(file, 'utf8'),
      });
    }
    return route.fulfill({ status: 404, body: '' });
  });

  const logs = [];
  page.on('console', m => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', e => logs.push(`pageerror: ${e.message}`));

  await page.goto('http://dcc.test/', { waitUntil: 'load' });
  return { browser, page, logs, close: () => browser.close() };
}

/** Wait until the engine has started and settled its mount passes. */
async function settle(page, ms = 1600) {
  /* Wait for the CANVAS, not for _state: _state only exists under the
   * DEBUG build flag (?dcc_debug=1 / --diag), so waiting on it makes every
   * non-diag suite hang for its full timeout and report nothing. */
  await page.waitForFunction(
    () => !!document.querySelector('canvas.dcc-seasons-canvas') ||
          !!(window.DCCSeasonsEngine && window.DCCSeasonsEngine._state),
    null, { timeout: 15000 }
  );
  /* The mount runs a settled second pass at 1200ms; only that one may be
   * believed, so nothing is measured before it. */
  await page.waitForTimeout(ms);
}

module.exports = { playwright, config, open, settle, ROOT, ASSETS };
