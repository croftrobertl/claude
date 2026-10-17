/**
 * Touch-behaviour and tap-area tests for Features & Amenities.
 *
 *   node tests/browser/touch.test.mjs
 *
 * ENGINE: Chromium with touch emulation. Playwright's WebKit build is NOT
 * installed in this container and cannot be fetched here, so the genuine iOS
 * Safari behaviour is NOT covered by this run — these tests prove the CSS
 * contract (hover gated behind a fine pointer, widget-scoped selectors beating
 * the kit rule, tap geometry) on a touch-emulated engine. Confirm the real
 * sticky-tap behaviour on an iPhone after install.
 *
 * Needs playwright-core and a Chromium binary; both are located at runtime and
 * the run is skipped with a clear message if either is missing.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = 'file://' + resolve(__dirname, 'fixture.html');
const CORAL = 'rgb(240, 128, 128)';

// ---- locate playwright-core + chromium ----------------------------------
function loadPlaywright() {
  const candidates = [
    process.env.PW_CORE,
    '/tmp/claude-0/-home-user-claude/af522fa0-4393-5c6f-b0d7-36298e7363e0/scratchpad/pw/node_modules/playwright-core',
    resolve(__dirname, '../../node_modules/playwright-core'),
    'playwright-core',
  ].filter(Boolean);
  const require = createRequire(import.meta.url);
  for (const c of candidates) {
    try { return require(c); } catch { /* next */ }
  }
  return null;
}

function findChromium() {
  if (process.env.PW_CHROMIUM && existsSync(process.env.PW_CHROMIUM)) return process.env.PW_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = resolve(base, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// ---- harness -------------------------------------------------------------
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  -- ${detail}` : ''}`); }
};

const pw = loadPlaywright();
const exe = findChromium();
if (!pw || !exe) {
  console.log('SKIP: ' + (!pw ? 'playwright-core not found' : 'no Chromium binary found'));
  console.log('      Touch tests did not run. Treat the touch guarantees as UNVERIFIED.');
  process.exit(2);
}

const browser = await pw.chromium.launch({ executablePath: exe });
// iPhone-like: touch primary input, no fine pointer, no hover.
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
await page.goto(FIXTURE);
await page.waitForLoadState('load');

console.log('\nENGINE: Chromium (touch emulation). WebKit unavailable in this container.\n');

// =========================================================================
console.log('[B1] The kit rule cannot stick after a tap');
for (const [label, sel] of [['clear button', '.fal-search-clear'], ['Read More', '.fal-read-more']]) {
  await page.tap(sel);
  const after = await page.$eval(sel, el => getComputedStyle(el).backgroundColor);
  ok(`${label}: no coral background after tap`, after !== CORAL, `got ${after}`);

  // Focus is the other half of the kit rule.
  await page.$eval(sel, el => el.focus());
  const focused = await page.$eval(sel, el => getComputedStyle(el).backgroundColor);
  ok(`${label}: no coral background while focused`, focused !== CORAL, `got ${focused}`);
  await page.$eval(sel, el => el.blur());
}

// =========================================================================
console.log('\n[B2] Clear button has a real 44px tap area');
const clear = await page.$eval('.fal-search-clear', el => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, left: r.left, top: r.top, bottom: r.bottom };
});
ok('width >= 44px', clear.w >= 44, `got ${clear.w}`);
ok('height >= 44px', clear.h >= 44, `got ${clear.h}`);

// Visible size unchanged: the icon, not the button, is what renders.
const icon = await page.$eval('.fal-search-clear-icon', el => {
  const r = el.getBoundingClientRect();
  return { w: r.width, h: r.height };
});
ok('visible icon is still 14px', Math.round(icon.w) === 14 && Math.round(icon.h) === 14,
   `got ${icon.w}x${icon.h}`);
const bg = await page.$eval('.fal-search-clear', el => getComputedStyle(el).backgroundColor);
ok('the enlarged box paints nothing', bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent', `got ${bg}`);

// =========================================================================
console.log('\n[B3] The enlarged area does not overlap the input\'s text zone');
const input = await page.$eval('.fal-search-input', el => {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { right: r.right, left: r.left, top: r.top, bottom: r.bottom, padRight: parseFloat(cs.paddingRight) };
});
ok('input reserves at least the tap width on the right',
   input.padRight >= clear.w, `padding-right ${input.padRight}px vs tap ${clear.w}px`);
ok('the button sits inside the input box horizontally',
   clear.right <= input.right + 0.5 && clear.left >= input.left, 'button spills outside the field');
ok('the button sits inside the input box vertically',
   clear.top >= input.top - 0.5 && clear.bottom <= input.bottom + 0.5,
   `button ${clear.top}-${clear.bottom} vs input ${input.top}-${input.bottom}`);

// =========================================================================
console.log('\n[B4] A tap anywhere in the extension hits its own target');
// Sample a grid across the whole 44x44 box; every point must resolve to the
// button (or its icon), never the input underneath or anything else.
const probe = await page.evaluate(({ x, y, w, h }) => {
  const btn = document.querySelector('.fal-search-clear');
  const out = [];
  for (let i = 1; i <= 4; i++) {
    for (let j = 1; j <= 4; j++) {
      const px = x + (w * i) / 5, py = y + (h * j) / 5;
      const el = document.elementFromPoint(px, py);
      out.push({ px: Math.round(px), py: Math.round(py), hit: !!(el && btn.contains(el)) });
    }
  }
  return out;
}, clear);
const misses = probe.filter(p => !p.hit);
ok(`all ${probe.length} sampled points inside the extension hit the clear button`,
   misses.length === 0,
   misses.length ? `missed at ${misses.map(m => `(${m.px},${m.py})`).join(' ')}` : '');

// Just outside the left edge must fall through to the input, not the button.
const neighbour = await page.evaluate(({ left, top, h }) => {
  const el = document.elementFromPoint(left - 4, top + h / 2);
  return el ? (el.className || el.tagName) : null;
}, clear);
ok('a tap just left of the extension reaches the input, not the button',
   typeof neighbour === 'string' && neighbour.includes('fal-search-input'),
   `hit ${neighbour}`);

// =========================================================================
console.log('\n[B5] No other tappable target is covered');
const overlaps = await page.evaluate(() => {
  const btn = document.querySelector('.fal-search-clear').getBoundingClientRect();
  const hits = [];
  document.querySelectorAll('button, a, input, select, textarea, [tabindex]').forEach(el => {
    if (el.classList.contains('fal-search-clear')) return;
    if (el.classList.contains('fal-search-input')) return; // handled in B3
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const over = !(r.right < btn.left || r.left > btn.right || r.bottom < btn.top || r.top > btn.bottom);
    if (over) hits.push(el.className || el.tagName);
  });
  return hits;
});
ok('the extension overlaps no other tappable element', overlaps.length === 0,
   overlaps.length ? `overlaps ${overlaps.join(', ')}` : '');

// =========================================================================
console.log('\n[B6] Hover styling is gated to fine pointers');
// On this touch context (hover:hover) and (pointer:fine) must not match, so the
// hover rules are inert — which is what stops iOS latching them.
const hoverMatches = await page.evaluate(
  () => matchMedia('(hover: hover) and (pointer: fine)').matches
);
ok('(hover:hover) and (pointer:fine) does not match a touch device', hoverMatches === false);

await browser.close();

console.log('\n' + '-'.repeat(56));
console.log(`${pass} passed, ${fail} failed   [engine: Chromium touch emulation; WebKit unavailable]`);
process.exit(fail > 0 ? 1 : 0);
