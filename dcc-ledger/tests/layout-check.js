/**
 * Layout check and screenshots.
 *
 * Asserts that nothing scrolls sideways at 390px — tables may scroll inside
 * their own container, the page may not — then captures each tab at 1280px
 * and 390px.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const screens = path.join(__dirname, 'screens');
const shots = path.join(__dirname, 'screenshots');

(async () => {
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });

  const tabs = fs.readdirSync(screens).filter((f) => f.endsWith('.html')).sort();
  let failed = 0;

  for (const widthSpec of [1280, 390]) {
    const context = await browser.newContext({
      viewport: { width: widthSpec, height: widthSpec === 390 ? 844 : 900 },
      deviceScaleFactor: 1,
    });

    for (const file of tabs) {
      const page = await context.newPage();
      await page.goto('file://' + path.join(screens, file));
      await page.waitForLoadState('networkidle');

      const metrics = await page.evaluate(() => {
        const overflowing = [];
        document.querySelectorAll('*').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.right > document.documentElement.clientWidth + 1 && r.width > 0) {
            overflowing.push(el.tagName + '.' + (el.className || '').toString().split(' ')[0]);
          }
        });
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyScroll: document.body.scrollWidth,
          overflowing: overflowing.slice(0, 5),
        };
      });

      const name = file.replace('.html', '');
      const horizontal = metrics.scrollWidth > metrics.clientWidth + 1;

      if (widthSpec === 390) {
        if (horizontal) {
          failed++;
          console.log(
            `  FAIL  ${name} at 390px scrolls sideways (${metrics.scrollWidth} > ${metrics.clientWidth})` +
              (metrics.overflowing.length ? ` — ${metrics.overflowing.join(', ')}` : '')
          );
        } else {
          console.log(`  PASS  ${name} at 390px does not scroll sideways`);
        }
      }

      await page.screenshot({
        path: path.join(shots, `${name}-${widthSpec}.png`),
        fullPage: true,
      });
      await page.close();
    }

    await context.close();
  }

  await browser.close();
  console.log(failed === 0 ? '\nLayout OK at 390px.' : `\n${failed} screens scroll sideways.`);
  process.exit(failed === 0 ? 0 : 1);
})();
