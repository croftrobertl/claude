'use strict';
/**
 * The real header at 390, 768, 1280 and 1440 with the keep-clear set
 * outlined (title letters red, tagline orange, menu bar blue, dial purple,
 * menu button green) — the map a scene's placement is drawn against.
 *   node tools/shot-keepclear.js [out.png]
 */
const path = require('path');
const { open } = require('./harness');
const rt = require('./real-theme');
const OUT = process.argv[2] || path.resolve(__dirname, '..', 'build', 'Seasons - keep-clear map.png');
const COL = { title: '#ff3030', tagline: '#ff9a00', menu: '#2f7bff', menuFixed: '#2f7bff', dial: '#a040ff', menuButton: '#20c040' };
(async () => {
  const shots = [];
  for (const w of [390, 768, 1280, 1440]) {
    const ses = await open(rt.page(), { viewport: { width: w, height: 460 }, extra: rt.route, dsf: 1 });
    await ses.page.waitForTimeout(800);
    const k = await rt.keepClear(ses.page);
    await ses.page.evaluate(({ k, COL }) => {
      for (const [n, boxes] of Object.entries(k)) {
        for (const b of boxes) {
          const d = document.createElement('div');
          d.style.cssText = `position:fixed;left:${b[0]}px;top:${b[1]}px;width:${b[2] - b[0]}px;height:${b[3] - b[1]}px;outline:2px solid ${COL[n]};z-index:2147483647;pointer-events:none`;
          document.body.appendChild(d);
        }
      }
      const pic = document.getElementById('header-image-main-inside').getBoundingClientRect();
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;left:0;top:${pic.bottom}px;width:100%;height:2px;background:#fff;z-index:2147483647`;
      document.body.appendChild(d);
    }, { k, COL });
    shots.push({ w, png: (await ses.page.screenshot()).toString('base64') });
    await ses.close();
  }
  const ses = await open('<!doctype html><body style="margin:0;background:#222">' + shots.map(s => `<div style="color:#fff;font:14px system-ui;padding:6px">${s.w}px</div><img src="data:image/png;base64,${s.png}">`).join('') + '</body>', { viewport: { width: 1440, height: 800 } });
  await ses.page.setViewportSize({ width: 1440, height: await ses.page.evaluate(() => document.body.scrollHeight) });
  await ses.page.screenshot({ path: OUT }); await ses.close();
  console.log(OUT);
})().catch(e => { console.error(e); process.exit(1); });
