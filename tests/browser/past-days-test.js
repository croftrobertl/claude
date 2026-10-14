'use strict';
/**
 * PART A IN THE BROWSER (0.46.6, Rob's item 3): the overview calendar's past
 * days are the "Past" grey, not blank white, and its key lists them.
 *
 * Rendered the real way — tests/render/render.php puts the /cottages/ and
 * home-page instances through the plugin's PHP from live's exported
 * settings, and the page runs the SHIPPED widget.min.js and widget.min.css —
 * then paged back one step, as Rob does with the ‹ arrow:
 *
 *   - it OPENS on today (no past day on the first view);
 *   - after ‹, every past day is drawn, in the Past colour, the same grey
 *     the key's swatch shows — never visibility: hidden;
 *   - the key reads Available, Booked, Past, in that order;
 *   - a past day is not bookable: not focusable, and tapping it opens nothing;
 *   - a screen reader hears it as past ("2026-10-10 — Past"), and its name
 *     still contains, word for word, what it shows — the 0.46.5 fix — with
 *     the tooltip both hidden and SHOWN (transition off, opacity asserted).
 *
 * Both as live stores it and as a blind install, at a phone and a desktop.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const S = require('../render/shoot.js');
const { check, done } = H.reporter();
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const PLUGIN = path.resolve(__dirname, '../../mphb-availability-calendar');
const SHOW_TIPS = '.mphbac-cell-tip{transition:none!important;opacity:1!important}';

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  for (const [cas, mode] of [['1005:5f8802c', 'live'], ['620:b7318c3', 'live'], ['1005:5f8802c', 'blind']]) {
    const html = S.pageFor(S.render(PLUGIN, cas, mode), PLUGIN);
    for (const w of [390, 1280]) {
      const who = `${cas} ${mode} ${w}px`;
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.clock.setFixedTime(S.CLOCK);
      p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
      await p.setContent(html);
      await p.waitForSelector('.mphbac-grid');
      await p.waitForTimeout(300);

      const open = await p.evaluate(() => ({
        first: document.querySelector('.mphbac-grid .mphbac-cell-status').dataset.date,
        past: document.querySelectorAll('.mphbac-grid .mphbac-cell-status.is-past').length,
        legend: [...document.querySelectorAll('.mphbac-legend-item')].map(i => [i.textContent.trim(), getComputedStyle(i.querySelector('.mphbac-swatch')).backgroundColor]),
        root: document.querySelector('.mphbac-root').className,
      }));
      check(`${who}: it OPENS on today — the first column is ${S.TODAY}, no past day showing`, open.first === S.TODAY && open.past === 0, open);
      check(`${who}: the key reads Available, Booked, Past — in that order`,
        JSON.stringify(open.legend.map(l => l[0])) === '["Available","Booked","Past"]', open.legend.map(l => l[0]));
      check(`${who}: ...and nothing on the root blanks past days`, !/\bmphbac-hide-past\b/.test(open.root), open.root);

      await p.click('.mphbac-nav-prev');
      await p.waitForTimeout(500);
      const back = await p.evaluate(() => {
        const cells = [...document.querySelectorAll('.mphbac-grid .mphbac-cell-status.is-past')];
        return { n: cells.length,
          looks: [...new Set(cells.map(c => { const s = getComputedStyle(c); return s.visibility + '|' + s.backgroundColor + '|' + s.opacity; }))],
          roles: [...new Set(cells.map(c => c.getAttribute('role') + '|' + c.tabIndex + '|' + c.classList.contains('is-clickable')))],
          names: cells.slice(0, 2).map(c => c.getAttribute('aria-label')),
          tips: [...new Set(cells.map(c => c.querySelector('.mphbac-cell-tip').textContent))] };
      });
      const pastSwatch = open.legend[2] && open.legend[2][1];
      check(`${who}: after ‹, the past days are DRAWN, in the key's Past grey (not blank white)`,
        back.n > 0 && back.looks.length === 1 && back.looks[0] === `visible|${pastSwatch}|1` && pastSwatch === 'rgb(189, 195, 199)', { n: back.n, looks: back.looks, swatch: pastSwatch });
      check(`${who}: ...not bookable — a plain gridcell, not focusable, not clickable`,
        JSON.stringify(back.roles) === '["gridcell|-1|false"]', back.roles);
      check(`${who}: ...and a screen reader hears them as past: "<date> — Past", tooltip "Past"`,
        back.names.every(n => /^\d{4}-\d{2}-\d{2} — Past$/.test(n)) && JSON.stringify(back.tips) === '["Past"]', back.names);
      await p.click('.mphbac-grid .mphbac-cell-status.is-past');
      await p.waitForTimeout(300);
      check(`${who}: tapping a past day opens no booking popup`, await p.evaluate(() => document.querySelector('.mphbac-sheet').hidden));

      // The pointer is still over the past day just tapped, whose tooltip
      // :hover shows — move it off and let the 0.15s fade finish.
      await p.mouse.move(0, 0);
      await p.waitForTimeout(400);
      await p.addScriptTag({ content: AXE });
      for (const shown of [false, true]) {
        if (shown) await p.addStyleTag({ content: SHOW_TIPS });
        const op = await p.evaluate(() => [...new Set([...document.querySelectorAll('.mphbac-grid .is-past .mphbac-cell-tip')].map(t => getComputedStyle(t).opacity))]);
        const a = await p.evaluate(async () => {
          const r = await axe.run(document.querySelector('.mphbac-grid'), { runOnly: { type: 'rule', values: ['label-content-name-mismatch'] },
            rules: { 'label-content-name-mismatch': { enabled: true } } });
          const n = l => (l.find(v => v.id === 'label-content-name-mismatch') || { nodes: [] }).nodes.length;
          return { violations: n(r.violations), passes: n(r.passes) };
        });
        check(`${who}: tooltips ${shown ? 'SHOWN' : 'hidden'} (opacity ${op.join()}): every cell's name contains what it shows, word for word`,
          JSON.stringify(op) === (shown ? '["1"]' : '["0"]') && a.violations === 0 && (shown ? a.passes > 0 : true), a);
      }
      await ctx.close();
    }
  }
  await browser.close();
  done();
})();
