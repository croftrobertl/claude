const { chromium } = require('playwright-core');
const S = require('./staff-harness.js');
(async () => {
  const b = await chromium.launch(S.CHROMIUM);
  const shots = {};
  for (const size of ['16px', '40px', '4px']) {
    const p = await b.newPage({ viewport: { width: 600, height: 200 }, deviceScaleFactor: 2 });
    await p.setContent(S.page({ body: S.TOOLS })
      + `<style>.mphbac-staff-prev.mphbac-staff-prev{font-size:${size} !important}</style>`);
    const el = p.locator('.mphbac-staff-prev');
    shots[size] = (await el.screenshot()).toString('base64');
    const m = await p.evaluate(() => {
      const e = document.querySelector('.mphbac-staff-prev');
      const r = e.getBoundingClientRect(), svg = e.querySelector('svg').getBoundingClientRect();
      return { fs: getComputedStyle(e).fontSize, btn: `${+r.width.toFixed(1)}x${+r.height.toFixed(1)}`,
               svg: `${+svg.width.toFixed(1)}x${+svg.height.toFixed(1)}`,
               textNodes: [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).length,
               text: JSON.stringify(e.textContent) };
    });
    console.log(`font-size ${size.padEnd(5)} -> computed ${m.fs.padEnd(5)} button ${m.btn.padEnd(10)} svg ${m.svg.padEnd(10)} text nodes ${m.textNodes} ${m.text}`);
    await p.close();
  }
  console.log('\npixel-identical across all three font sizes:',
    shots['16px'] === shots['40px'] && shots['16px'] === shots['4px']);
  await b.close();
})();
