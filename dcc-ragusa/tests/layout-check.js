/**
 * Layout check and screenshots.
 *
 * Asserts that nothing scrolls sideways at 1440px, 768px, 390px and 360px,
 * that every button is at least 44px tall, then captures each screen at
 * 1440px, 768px and 390px.
 *
 *     php tests/render-screens.php && node tests/layout-check.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const screens = path.join(__dirname, 'screens');
const shots = path.join(__dirname, 'screenshots');

(async () => {
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const files = fs.readdirSync(screens).filter((f) => f.endsWith('.html')).sort();
  let failed = 0;

  for (const width of [1440, 768, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: width >= 1280 ? 900 : (width >= 768 ? 1024 : 844) }, deviceScaleFactor: 1 });
    for (const file of files) {
      const page = await context.newPage();
      await page.goto('file://' + path.join(screens, file));
      await page.waitForLoadState('networkidle');
      const m = await page.evaluate(() => {
        const small = [];
        document.querySelectorAll('button, a.button').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.height < 44) small.push(el.textContent.trim().slice(0, 30) + ' ' + Math.round(r.height) + 'px');
        });
        return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, small };
      });
      const name = file.replace('.html', '');
      if (m.scrollWidth > m.clientWidth + 1) {
        failed++;
        console.log(`  FAIL  ${name} at ${width}px scrolls sideways (${m.scrollWidth} > ${m.clientWidth})`);
      } else {
        console.log(`  ok    ${name} at ${width}px: no horizontal scroll`);
      }
      if (m.small.length) {
        failed++;
        console.log(`  FAIL  ${name} at ${width}px: buttons under 44px: ${m.small.join(', ')}`);
      }
      if (width !== 360) {
        await page.screenshot({ path: path.join(shots, `${name}-${width}.png`), fullPage: true });
      }
      await page.close();
    }
    await context.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} layout failures` : '\nLayout checks passed');
  process.exit(failed ? 1 : 0);
})();
