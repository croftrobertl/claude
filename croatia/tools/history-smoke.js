#!/usr/bin/env node
// Smoke test for the History tab (map, story mode, chronicle, family records) and the
// Map tab's "Then" overlay of the old borders.
//
//   cd croatia && python3 -m http.server 8199 &
//   npm i playwright-core            # once, anywhere on NODE_PATH
//   CHROME=/path/to/chrome node tools/history-smoke.js [http://localhost:8199/index.html]
//
// Exits non-zero on any page error, sideways scroll, or a broken feature.
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8199/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const check = (ok, what) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) fails.push(what); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  for (const [w, h] of [[360, 780], [390, 844], [844, 390], [1280, 900]]) {
    console.log(w + '×' + h);
    const errs = [];
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 800 || h < 500, hasTouch: w < 800 || h < 500, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '#v=history&era=1453');
    await p.waitForSelector('.dcc-chron-list li', { timeout: 30000 });
    await sleep(800);
    check(await p.evaluate(() => document.documentElement.scrollWidth <= (window.visualViewport ? visualViewport.width : innerWidth) + 1), 'no sideways scroll');
    check((await p.$eval('.bh-year', x => x.textContent)) === '1453', 'deep link opens 1453');
    await p.click('.bh-transport [data-a=next]'); await sleep(400);
    check((await p.$eval('.bh-year', x => x.textContent)) === '1526', 'step to the next era');
    await p.evaluate(() => document.querySelector('li[data-id="the-great-earthquake"]').scrollIntoView({ block: 'center' }));
    await sleep(1300);
    check((await p.$eval('.bh-year', x => x.textContent)) === '1700', 'story mode turns the map to 1700');
    check(await p.$$eval('.dcc-chron-you', x => x.length) > 0, 'your photos appear in the chronicle');
    await p.click('[data-strand=records]'); await sleep(300);
    await p.fill('.dcc-village-pick input', 'Čilipi'); await sleep(300);
    check(await p.$$eval('.dcc-vt li', x => x.length) > 5, 'village lookup lists eras');
    const era = await p.$eval('.bh-year', x => x.textContent);
    await p.click('[data-jump=street]');
    await p.waitForSelector('.dcc-then-bar', { state: 'visible', timeout: 20000 }); await sleep(1500);
    check((await p.$eval('.dcc-then-yr', x => x.textContent)) === era, 'the street map opens at the same era (' + era + ')');
    check(await p.$$eval('.leaflet-dccThen-pane path', x => x.length) > 8, 'old borders drawn over the street map');
    check((await p.evaluate(() => location.hash)) === '#v=map&then=' + era.toLowerCase().replace(/\s+/g, ''), 'street map era is in the link');
    check(await p.evaluate(() => document.documentElement.scrollWidth <= (window.visualViewport ? visualViewport.width : innerWidth) + 1), 'no sideways scroll on the map');
    check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
  console.log(fails.length ? fails.length + ' failed' : 'all passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
