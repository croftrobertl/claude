'use strict';
/**
 * Compare the real-theme fixture with the live site: the keep-clear boxes
 * at 390, 768, 1280 and 1440, measured the same way on both.
 *   node tools/check-real-theme.js [--live]   (--live also loads the site)
 */
const { open, playwright } = require('./harness');
const rt = require('./real-theme');
const W = [390, 768, 1280, 1440];
(async () => {
  const fx = {};
  for (const w of W) {
    const ses = await open(rt.page(), { viewport: { width: w, height: w < 768 ? 844 : 900 }, extra: rt.route });
    await ses.page.waitForTimeout(800);
    fx[w] = await rt.keepClear(ses.page);
    fx[w].scroll = await ses.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    fx[w].font = await ses.page.evaluate(() => { const e = document.querySelector('#header-page-title .entry-title'); return e ? getComputedStyle(e).fontFamily.slice(0, 50) : '?'; });
    await ses.close();
  }
  let live = null;
  if (process.argv.includes('--live')) {
    live = {};
    const { chromium } = playwright();
    const o = { args: ['--no-sandbox'], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined };
    let b; try { b = await chromium.launch(o); } catch (e) { b = await chromium.launch({ ...o, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
    for (const w of W) {
      const c = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: w, height: w < 768 ? 844 : 900 } });
      const p = await c.newPage();
      await p.goto('https://doracanalcourt.com/', { waitUntil: 'load', timeout: 90000 }); await p.waitForTimeout(3500);
      live[w] = await rt.keepClear(p); await c.close();
    }
    await b.close();
  }
  for (const w of W) {
    console.log(`\n${w}px  (title font: ${fx[w].font}; sideways scroll ${fx[w].scroll}px)`);
    for (const k of Object.keys(rt.KEEP)) {
      const a = JSON.stringify(fx[w][k]), b = live ? JSON.stringify(live[w][k]) : '';
      console.log(`  ${k.padEnd(10)} fixture ${a}${live ? (a === b ? '   = live' : `\n  ${''.padEnd(10)} live    ${b}`) : ''}`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
