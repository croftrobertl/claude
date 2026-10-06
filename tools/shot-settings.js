'use strict';
/**
 * DCC Seasons — screenshot the real settings page (tools/render-settings.php).
 *
 *   node tools/shot-settings.js <html> <out.png> [width] [selector]
 *
 * With a selector, only that element is captured — that is how the frozen
 * 1280px schedule table is pixel-diffed across a change to class-settings.php
 * or admin.css (see CLAUDE.md, "The Schedule settings UI has two layouts").
 */
const fs = require('fs');
const path = require('path');
const { playwright } = require('./harness');
const [, , html, out, width = '1280', sel] = process.argv;
(async () => {
  const { chromium } = playwright();
  let b;
  try { b = await chromium.launch({ args: ['--no-sandbox'] }); }
  catch (e) { b = await chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }); }
  const p = await b.newPage({ viewport: { width: +width, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(html), { waitUntil: 'load' });
  await p.waitForTimeout(800);
  if (sel) { await p.locator(sel).first().screenshot({ path: out }); }
  else { await p.screenshot({ path: out, fullPage: true }); }
  if (errs.length) { console.error('page errors:', errs.join(' | ')); process.exitCode = 1; }
  await b.close();
})();
