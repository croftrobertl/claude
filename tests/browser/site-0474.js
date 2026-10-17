'use strict';
/**
 * A LIVE PAGE THAT TALKS TO THE REAL ENDPOINT (0.47.4).
 *
 * The public calendar now follows MotoPress's rules, and the rules come from
 * the server: so the page is rendered by tests/render/render.php and its
 * admin-ajax.php requests are answered by tests/render/ajax.php — the
 * plugin's own Ajax::handle(), over fixture-0474.php's database and
 * MotoPress 6.4.0's rule engine (tests/vendor). Nothing between the
 * calendar and the endpoint is mocked; Playwright routes the request to PHP.
 *
 * Page shape as tests/render/shoot.js builds it (the theme, the Elementor
 * per-post CSS, then the plugin's stylesheet and script). For THIS checkout
 * the stylesheet and script are built from source (H.css(), H.jsShipped()),
 * so a mutation of widget.js / widget.css reaches the page; for another tree
 * (0.47.3, for the pixel proof) its own committed .min files — what it sent.
 *
 *   const site = require('./site-0474.js');
 *   const { ctx, p, r } = await site.open(browser, { mode: 'fixture', cas: '3043:8e23564', width: 360 });
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('./harness.js');

const TESTS = path.resolve(__dirname, '..');
const LIVE = path.join(TESTS, 'render', 'live-state-0.46.6.json');
const HERE = path.resolve(TESTS, '..', 'mphb-availability-calendar');
const ORIGIN = 'https://example.test';
const NOW = new Date();   // the run's day; each page's clock is set as it opens (see open())

function php(script, args, mode) {
  return execFileSync('php', [path.join(TESTS, 'render', script), ...args], {
    encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, MPHBAC_FIXTURE_0474: mode },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}
const renders = {};
function render(dir, cas, mode) {
  const k = [dir, cas, mode].join('|');
  return renders[k] ??= JSON.parse(php('render.php', [dir, LIVE, cas, 'live'], mode));
}

/** The endpoint's answer to one request body — what the page is sent. */
function ajax(dir, body, mode) {
  return php('ajax.php', [dir, body], mode);
}

function html(r, dir) {
  const [post, wid] = r.case.split(':');
  const own = path.resolve(dir) === HERE;
  const css = own ? H.css() : fs.readFileSync(path.join(dir, 'assets/css/widget.min.css'), 'utf8');
  const js = own ? H.jsShipped() : fs.readFileSync(path.join(dir, 'assets/js/widget.min.js'), 'utf8');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:Raleway,Georgia,serif}${H.THEME}
*{caret-color:transparent!important}</style>
<style id="elementor">${r.css}</style>
<style id="plugin">${css}${r.tokens}</style></head>
<body class="elementor-kit-9">
<div class="elementor elementor-${post}"><div class="elementor-element elementor-element-${wid} elementor-widget elementor-widget-${r.type}">
<div class="elementor-widget-container"><div style="padding:24px 18px">${r.html}</div></div></div></div>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body></html>`;
}

/**
 * Open one widget instance. opts: mode (fixture-0474.php's), cas, width,
 * dir (default this checkout), height, touch (default: width < 600).
 * Every endpoint request is recorded in page.__ajax (body + answer).
 */
async function open(browser, opts) {
  const dir = opts.dir || HERE;
  const r = render(dir, opts.cas, opts.mode);
  const touch = opts.touch ?? opts.width < 600;
  const ctx = await browser.newContext({ viewport: { width: opts.width, height: opts.height || 900 },
    deviceScaleFactor: opts.scale || 1, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.__ajax = [];
  p.__sent = [];
  p.__errors = [];
  p.on('pageerror', e => p.__errors.push(e.message));
  // The page's clock is NOW at the moment it opens, after PHP rendered it: a
  // clock pinned earlier makes the embedded data look rendered in the future,
  // and the calendar (rightly) revalidates — three requests 0.47.3 would
  // not have made in the same second, and a race in every comparison.
  await p.clock.setFixedTime(new Date(Math.max(Date.now(), NOW.getTime())));
  const page = html(r, dir);
  await p.route(ORIGIN + '/**', async route => {
    const req = route.request();
    if (req.url().endsWith('/wp-admin/admin-ajax.php') && req.method() === 'POST') {
      const body = req.postData() || '';
      const out = ajax(dir, body, opts.mode);
      p.__ajax.push({ body, json: JSON.parse(out) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: out });
    }
    if (new URL(req.url()).pathname === '/') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: page });
    }
    // Anything else the page sends — Book Now's form POST to MotoPress's
    // checkout above all — is recorded, and answered with an empty page.
    p.__sent.push({ url: req.url(), method: req.method(), body: req.postData() || '' });
    return route.fulfill({ status: req.method() === 'POST' ? 200 : 404, contentType: 'text/html', body: '<!doctype html><title>checkout</title>' });
  });
  await p.goto(ORIGIN + '/');
  await p.waitForSelector('.mphbac-grid, .mphbac-months', { timeout: 15000 });
  await p.waitForTimeout(400);
  return { ctx, p, r };
}

/** Today on the property's clock, and n days from it, as the server writes them. */
function day(n = 0) {
  const t = new Date(NOW.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  t.setHours(12, 0, 0, 0);
  t.setDate(t.getDate() + n);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

module.exports = { open, render, ajax, html, day, NOW, HERE, LIVE };
