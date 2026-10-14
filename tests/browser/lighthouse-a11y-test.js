'use strict';
/**
 * THE FOUR LIGHTHOUSE FINDINGS ON LIVE, 2026-10-13 (0.46.4), AND THE ONE
 * 0.46.4 DID NOT FIX (0.46.5): see section 2.
 *
 * The Website Director ran Lighthouse (Chrome DevTools, mobile) on 0.46.3:
 *
 *   1. The overview grid: every cottage row held its info button directly,
 *      and every bookable day was a role="button". A row may hold only
 *      cells, so screen readers could not read the grid.
 *   2. The per-cottage month grid: 61 day cells named "2026-10-01 — …",
 *      which does not contain the "1" the cell shows as a word.
 *   3. The info popup's hidden "View Cottage Page" <a> had no href, which
 *      Lighthouse SEO reports as "links are not crawlable".
 *   4. The month title, #7A7A7A on white: 4.29:1, under AA's 4.5.
 *
 * Judged by axe-core, the engine Lighthouse runs, PINNED to 4.14.0: that is
 * the version Lighthouse 13 resolves today, and the first whose label-in-name
 * check compares WORDS. Under 4.13 "2026-10-01" still "contained" the 1, so
 * the old cells passed here while failing on live. Each axe run is checked
 * for the nodes it judged, so a rule that matched nothing cannot pass.
 *
 * "Keep everything else looking exactly the same": the rowheader cell is
 * proved free by screenshot — the grid with it, then with it unwrapped in
 * place, must be the same pixels.
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const H = require('./harness.js');
const { check, done } = H.reporter();
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const AXE_VERSION = require('axe-core/package.json').version;

const dayList = (from, n) => {
  const out = [], d = new Date(from + 'T00:00:00');
  for (let i = 0; i < n; i++) {
    out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    d.setDate(d.getDate() + 1);
  }
  return out;
};
const ROOMS = [[22, 'BB'], [23, 'SS'], [33, 'PP']].map(([id, abbrev]) => ({ id, number: id, abbrev, title: 'Cottage ' + id }));
const AVAIL = {};
for (const r of ROOMS) { AVAIL[r.id] = {}; dayList('2026-09-01', 150).forEach((d, i) => { AVAIL[r.id][d] = i % 3 ? 'available' : 'booked'; }); }

// What an editor might type into the three status labels: punctuation,
// numbers, a price, a parenthesis. The tip shows exactly this text.
const CUSTOM_LABELS = { available: 'Available from $250/night', booked: 'Booked – call 555-0100', past: 'Check-out day (past)' };

const config = (month, labels = null) => ({
  today: '2026-10-13', daysDesktop: 14, daysTablet: 14, daysMobile: 7,
  monthsDesktop: 2, monthsTablet: 2, monthsMobile: 2,
  monthMode: month, singleMode: month,
  popupEnabled: true, minNights: 2,
  // Shows yesterday too, so the overview has a past cell to judge.
  showPast: true,
  statusLabels: labels || { available: 'Available', booked: 'Booked', past: 'Past' },
  strings: { property: 'Cottage' },
  roomTitles: { 22: 'Cottage 22', 23: 'Cottage 23' },
  // 22 has a cottage page, 23 does not.
  infoTitleUrls: { 22: 'https://example.test/cottage-22/' },
  initial: { rooms: month ? [ROOMS[0]] : ROOMS, availability: AVAIL, from: '2026-09-01', to: '2027-01-28',
    renderedAt: Date.now() / 1000, ttl: 900, dataAge: 0 },
});

/** The info popup exactly as class-widget.php serves it. */
const infoSheet = (legacy) => {
  let html = H.dephp(H.extractBlock(H.php(), '<div class="mphbac-info-sheet<?php'))
    .replace('<a class="mphbac-info-view-link" target="_blank" rel="noopener noreferrer">',
      '<a class="mphbac-info-view-link" target="_blank" rel="noopener noreferrer"><span class="mphbac-view-label">View Cottage Page</span>');
  // The markup a page cached before 0.46.4 still carries: the bare <a>,
  // hidden, no href, no <template>.
  if (legacy) html = html.replace(/<template class="mphbac-info-view-tpl">([\s\S]*?)<\/template>/, (_, a) => a.replace('<a ', '<a hidden '));
  return html + '<div class="mphbac-info-overlay" hidden></div>';
};

const body = (legacy = false) => '<div class="mphbac-grid-wrap"></div>'
  + '<div class="mphbac-info-content" data-room-type-id="22" hidden><p>About 22</p></div>'
  + '<div class="mphbac-info-content" data-room-type-id="23" hidden><p>About 23</p></div>'
  + infoSheet(legacy)
  + H.sheetHtml().replace('<div class="mphbac-sheet"', '<div class="mphbac-sheet" hidden') + '<div class="mphbac-sheet-overlay" hidden></div>';

// Live's look: the inherit-theme default and the Bravada kit's #7A7A7A text
// colour, which is where the month title's grey came from.
const LIVE_THEME = '<style>:root{--e-global-color-text:#7A7A7A;--e-global-color-bg:#ffffff}</style>';

(async () => {
  const browser = await chromium.launch(H.CHROMIUM);
  const open = async ({ month = false, legacy = false, inherit = true, w = 1280, labels = null } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); process.exitCode = 1; });
    let html = H.page({ body: body(legacy) }).replace('</head>', LIVE_THEME + '</head>');
    if (inherit) html = html.replace('class="mphbac-root"', 'class="mphbac-root mphbac-inherit-theme"');
    await p.setContent(html);
    await p.evaluate(c => { document.querySelector('.mphbac-root').dataset.config = JSON.stringify(c); }, config(month, labels));
    await p.addScriptTag({ content: H.jsShipped() });
    await p.waitForSelector('.mphbac-grid');
    await p.waitForTimeout(150);
    await p.addScriptTag({ content: AXE });
    return { ctx, p };
  };
  const axe = (p, rules, context = 'document') => p.evaluate(async ({ rules, context }) => {
    const r = await window.axe.run(context === 'document' ? document : document.querySelector(context),
      { runOnly: { type: 'rule', values: rules }, rules: Object.fromEntries(rules.map(id => [id, { enabled: true }])) });
    const count = (list, id) => (list.find(v => v.id === id) || { nodes: [] }).nodes.length;
    return Object.fromEntries(rules.map(id => [id, {
      violations: count(r.violations, id), passes: count(r.passes, id), incomplete: count(r.incomplete, id),
      first: ((r.violations.find(v => v.id === id) || { nodes: [{}] }).nodes[0].failureSummary || '').slice(0, 200),
    }]));
  }, { rules, context });

  check('axe-core is the pinned 4.14.0 — the word-by-word label-in-name check Lighthouse runs now', AXE_VERSION === '4.14.0', AXE_VERSION);

  console.log('-- 1. the overview grid: a row holds only cells --');
  {
    const { ctx, p } = await open();
    const a = await axe(p, ['aria-required-children', 'aria-required-parent']);
    check('aria-required-children: no row holds a non-cell (the Lighthouse finding)',
      a['aria-required-children'].violations === 0, a['aria-required-children']);
    check('...and axe really judged the grid and its rows (instrument check: 1 grid + 4 rows)',
      a['aria-required-children'].passes >= 5, a['aria-required-children'].passes);
    check('aria-required-parent: every cell sits in a row', a['aria-required-parent'].violations === 0
      && a['aria-required-parent'].passes > 0, a['aria-required-parent']);

    const m = await p.evaluate(() => {
      const grid = document.querySelector('.mphbac-grid');
      const rows = [...grid.querySelectorAll('.mphbac-row:not(.mphbac-row-header)')];
      return {
        grid: grid.getAttribute('role'),
        rows: rows.map(r => ({
          kids: [...r.children].map(c => c.getAttribute('role')),
          head: (() => { const h = r.querySelector(':scope > [role="rowheader"]'); const b = h && h.querySelector(':scope > button.mphbac-row-toggle');
            return h ? { cls: h.className, button: !!b, text: b && b.textContent, display: getComputedStyle(h).display } : null; })(),
        })),
        clickable: [...grid.querySelectorAll('.mphbac-cell-status.is-clickable')].map(c => [c.getAttribute('role'), c.tabIndex]),
      };
    });
    check('the overview is a role="grid" — focusable cells belong in a grid, as the month layout has them',
      m.grid === 'grid', m.grid);
    check('every cottage row starts with ONE rowheader cell, then only gridcells',
      m.rows.length === 3 && m.rows.every(r => r.kids[0] === 'rowheader' && r.kids.slice(1).every(k => k === 'gridcell')
        && r.kids.filter(k => k === 'rowheader').length === 1), m.rows.map(r => r.kids.slice(0, 3)));
    check('...holding the cottage button, with its "#22 BB" name',
      m.rows.every(r => r.head && r.head.button) && m.rows[0].head.text === '#22BB', m.rows.map(r => r.head));
    check('...as display: contents, so the button is still the grid item', m.rows.every(r => r.head.display === 'contents'));
    check('bookable days are gridcells, still focusable (they were role="button")',
      m.clickable.length > 0 && m.clickable.every(([r, t]) => r === 'gridcell' && t === 0), m.clickable.slice(0, 2));

    // What a screen reader is handed: Chromium's own accessibility tree, so
    // a display: contents cell that dropped out of it would show here.
    const tree = await p.locator('.mphbac-grid').ariaSnapshot();
    // Each node with its parent's role, from the snapshot's indentation.
    const nodes = [], stack = [];
    for (const line of tree.split('\n')) {
      const m = line.match(/^(\s*)- (\w+)(?: "([^"]*)")?/);
      if (!m) continue;
      const depth = m[1].length;
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      const node = { role: m[2], name: m[3] || '', depth, parent: stack.length ? stack[stack.length - 1].role : null };
      nodes.push(node); stack.push(node);
    }
    const buttons = nodes.filter(n => n.role === 'button');
    check('Chromium\'s accessibility tree has a rowheader "#22 BB" per cottage, the button inside it',
      nodes.filter(n => n.role === 'rowheader' && n.parent === 'row').length === 3
      && nodes.some(n => n.role === 'rowheader' && n.name === '#22 BB')
      && buttons.length === 3 && buttons.every(b => b.parent === 'rowheader'), nodes.filter(n => /row|button/.test(n.role)).slice(0, 6));
    check('...and every child of every row is a cell', nodes.filter(n => n.parent === 'row')
      .every(n => ['rowheader', 'columnheader', 'gridcell'].includes(n.role)), [...new Set(nodes.filter(n => n.parent === 'row').map(n => n.role))]);

    // THE LOOK. Screenshot the grid, unwrap every rowheader in place (the
    // button back to a direct child of its row, as in 0.46.3), screenshot
    // again: the same pixels, or the cell is not free.
    const gridShot = () => p.locator('.mphbac-grid').screenshot();
    const before = await gridShot();
    await p.evaluate(() => document.querySelectorAll('.mphbac-rowheader').forEach(h => { h.replaceWith(...h.childNodes); }));
    const unwrapped = await gridShot();
    check('the grid looks EXACTLY as before: same pixels with the rowheader as without it',
      before.equals(unwrapped), [before.length, unwrapped.length]);
    await ctx.close();
  }
  {
    // Still works: the row is found from the button through the new cell.
    const { ctx, p } = await open();
    await p.click('.mphbac-row[data-room-type-id="22"] .mphbac-row-toggle');
    await p.waitForTimeout(350);
    const s = await p.evaluate(() => ({ open: document.querySelector('.mphbac-info-sheet').classList.contains('is-open'),
      title: document.querySelector('.mphbac-info-sheet .mphbac-sheet-title').textContent }));
    check('tapping a cottage name still opens its info popup', s.open && /Cottage 22/.test(s.title), s);
    await p.keyboard.press('Escape'); await p.waitForTimeout(350);
    await p.click('.mphbac-row[data-room-type-id="23"] .mphbac-cell-status.is-clickable');
    await p.waitForTimeout(300);
    check('tapping a free day still opens the booking popup',
      await p.evaluate(() => !document.querySelector('.mphbac-sheet').hidden));
    await ctx.close();
  }

  console.log('\n-- 2. every day cell\'s name contains what it shows, tip hidden AND shown --');
  // 0.46.4 FAILED THIS ON LIVE. The day number and the tip were two touching
  // spans, so with the tip counted as shown the visible text was "1Past" —
  // one word, not in "1 — Past". This suite's old "tip showing" check set
  // opacity: 1 but the tip has a 0.15s opacity transition, so axe read it
  // mid-fade, still invisible, and the check proved nothing. The tip is now
  // shown with the transition OFF, and every tip's computed opacity is
  // checked before axe runs.
  const SHOW_TIPS = '.mphbac-cell-tip{transition:none!important;opacity:1!important}';
  for (const w of [390, 1280]) {
    for (const labels of [null, CUSTOM_LABELS]) {
      const which = (labels ? 'custom labels' : 'default labels') + ', ' + w + 'px';
      for (const month of [true, false]) {
        const grid = month ? 'month grid' : 'overview';
        const { ctx, p } = await open({ month, w, labels });
        const want = month ? 61 : 3 * (w < 768 ? 7 : 14);
        const statuses = await p.evaluate(() => [...new Set([...document.querySelectorAll('.mphbac-cell-status')].map(c => c.dataset.status))].sort());
        check(`${grid} (${which}): the cells cover every status a cell can show (instrument check)`,
          JSON.stringify(statuses) === '["available","booked","past"]', statuses);
        for (const shown of [false, true]) {
          if (shown) await p.addStyleTag({ content: SHOW_TIPS });
          const op = await p.evaluate(() => [...new Set([...document.querySelectorAll('.mphbac-cell-tip')].map(t => getComputedStyle(t).opacity))]);
          check(`${grid} (${which}), tip ${shown ? 'SHOWN' : 'hidden'}: every tip really is ${shown ? 'at opacity 1' : 'at opacity 0'} (instrument check)`,
            JSON.stringify(op) === (shown ? '["1"]' : '["0"]'), op);
          const a = await axe(p, ['label-content-name-mismatch']);
          check(`${grid} (${which}), tip ${shown ? 'SHOWN' : 'hidden'}: label-content-name-mismatch on no cell`,
            a['label-content-name-mismatch'].violations === 0, a['label-content-name-mismatch']);
          // Month cells always show their number; overview cells show text
          // only through the tip, so with it hidden axe has nothing to judge.
          const judged = month || shown ? want : 0;
          check(`...and axe judged all ${judged} cells`, a['label-content-name-mismatch'].passes === judged,
            a['label-content-name-mismatch'].passes);
        }
        await ctx.close();
      }
    }
  }
  {
    const { ctx, p } = await open({ month: true });
    const a = await axe(p, ['aria-required-children', 'aria-required-parent']);
    check('the month grid\'s rows are still all cells',
      a['aria-required-children'].violations === 0 && a['aria-required-parent'].violations === 0, a);
    const cells = await p.evaluate(() => [...document.querySelectorAll('.mphbac-monthgrid .mphbac-cell-status')].map(c => {
      const desc = document.getElementById(c.getAttribute('aria-describedby') || '');
      return { label: c.getAttribute('aria-label'), num: c.querySelector('.mphbac-day-num').textContent,
        tip: c.querySelector('.mphbac-cell-tip').textContent, text: c.textContent,
        between: [...c.childNodes].map(n => n.nodeType === 3 ? JSON.stringify(n.nodeValue) : n.className).join(' | '),
        desc: desc ? desc.textContent : null,
        isTitle: !!desc && desc.classList.contains('mphbac-month-title') && desc.closest('.mphbac-monthbox') === c.closest('.mphbac-monthbox') };
    }));
    check('every name STARTS with the day number shown, then the status the tip shows: "1 — Past"',
      cells.length === 61 && cells.every(c => c.label === c.num + ' — ' + c.tip), cells.slice(0, 2));
    check('the cell\'s text is the number, ONE space, then the tip: "1 Past", not "1Past"',
      cells.every(c => c.text === c.num + ' ' + c.tip), cells.slice(0, 2).map(c => [c.text, c.between]));
    check('the month and year are the description, read from that month\'s own title bar',
      cells.every(c => c.isTitle) && cells[0].desc === 'October 2026' && cells[60].desc === 'November 2026',
      [cells[0].desc, cells[60].desc]);
    await ctx.close();
  }
  // ZERO VISUAL CHANGE: the month grids with the space and with it removed
  // are the same pixels — tips hidden, and tips shown — at both widths.
  for (const w of [390, 1280]) {
    const { ctx, p } = await open({ month: true, w });
    const shot = () => p.locator('.mphbac-months').screenshot();
    const strip = () => p.evaluate(() => document.querySelectorAll('.mphbac-monthgrid .mphbac-day-num').forEach(n => {
      const t = n.nextSibling; if (t && t.nodeType === 3) t.remove(); }));
    const withSpace = await shot();
    await p.addStyleTag({ content: SHOW_TIPS });
    const withSpaceShown = await shot();
    await strip();
    const noSpaceShown = await shot();
    await p.evaluate(() => document.querySelectorAll('style').forEach(st => { if (st.textContent.includes('transition:none!important')) st.remove(); }));
    await p.waitForTimeout(400); // the tips' own 0.15s fade back
    const noSpace = await shot();
    check(`${w}px: the month grids look EXACTLY the same with the space as without it, tips hidden`,
      withSpace.equals(noSpace), [withSpace.length, noSpace.length]);
    check(`${w}px: ...and with every tip showing`, withSpaceShown.equals(noSpaceShown) && !withSpaceShown.equals(withSpace),
      [withSpaceShown.length, noSpaceShown.length]);
    await ctx.close();
  }

  console.log('\n-- 3. no link without an href --');
  {
    const src = H.php();
    const markup = src.slice(src.indexOf('<div class="mphbac-sheet-header mphbac-sheet-header--info">'), src.indexOf('<div class="mphbac-info-body">'));
    const outside = markup.replace(/<\?php[\s\S]*?\?>/g, '').replace(/<template class="mphbac-info-view-tpl">[\s\S]*?<\/template>/g, '');
    check('the served markup has the View link only inside a <template>, never as a bare <a>',
      /<template class="mphbac-info-view-tpl"><a class="mphbac-info-view-link"/.test(markup) && !/<a\b/.test(outside), outside.match(/<a\b[^>]*>/));

    for (const legacy of [false, true]) {
      const tag = legacy ? ' (a page cached with the 0.46.3 markup)' : '';
      const { ctx, p } = await open({ legacy });
      const state = () => p.evaluate(() => {
        const links = [...document.querySelectorAll('a')];
        const v = document.querySelector('.mphbac-info-view-link');
        const r = v && v.getBoundingClientRect();
        return { bare: links.filter(a => !a.hasAttribute('href')).map(a => a.className), count: document.querySelectorAll('.mphbac-info-view-link').length,
          href: v && v.getAttribute('href'), shown: !!v && getComputedStyle(v).display !== 'none' && r.width > 0,
          afterTitle: !!v && v.previousElementSibling && v.previousElementSibling.classList.contains('mphbac-sheet-title'),
          look: v && (() => { const c = getComputedStyle(v); return [c.backgroundColor, c.color, c.borderRadius, c.paddingLeft, c.display, Math.round(r.height)]; })() };
      });
      const s0 = await state();
      check('on load: no <a> without an href anywhere on the page' + tag, s0.bare.length === 0, s0.bare);
      check('...the View link is not on the page at all until a popup opens' + tag, s0.count === 0, s0.count);

      await p.click('.mphbac-row[data-room-type-id="22"] .mphbac-row-toggle'); await p.waitForTimeout(350);
      const s1 = await state();
      check('a cottage with a page: the link is there, with that href, shown under the title' + tag,
        s1.count === 1 && s1.href === 'https://example.test/cottage-22/' && s1.shown && s1.afterTitle, s1);
      check('...and the same blue pill as before' + tag,
        JSON.stringify(s1.look.slice(0, 5)) === JSON.stringify(['rgb(10, 80, 178)', 'rgb(255, 255, 255)', '999px', s1.look[3], 'flex']), s1.look);
      if (legacy) check('the look matches the new markup\'s exactly', JSON.stringify(s1.look) === JSON.stringify(globalThis.__look), [s1.look, globalThis.__look]);
      else globalThis.__look = s1.look;
      await p.keyboard.press('Escape'); await p.waitForTimeout(350);

      await p.click('.mphbac-row[data-room-type-id="23"] .mphbac-row-toggle'); await p.waitForTimeout(350);
      const s2 = await state();
      check('a cottage WITHOUT a page: no link at all, not a hidden one' + tag, s2.count === 0 && s2.bare.length === 0, s2);
      await p.keyboard.press('Escape'); await p.waitForTimeout(350);

      await p.click('.mphbac-row[data-room-type-id="22"] .mphbac-row-toggle'); await p.waitForTimeout(350);
      const s3 = await state();
      check('...and back to one with a page: the link returns, once' + tag, s3.count === 1 && s3.shown && s3.href === 'https://example.test/cottage-22/', s3);
      await ctx.close();
    }
  }

  console.log('\n-- 4. the month title clears 4.5:1 --');
  {
    for (const inherit of [true, false]) {
      const tag = inherit ? ' (inherit theme colours: live\'s setting, kit text #7A7A7A)' : ' (theme colours off)';
      const { ctx, p } = await open({ month: true, inherit });
      const a = await axe(p, ['color-contrast'], '.mphbac-months');
      const t = await p.evaluate(() => [...document.querySelectorAll('.mphbac-month-title')].map(e => getComputedStyle(e).color));
      check('the month titles are #666666' + tag, t.length === 2 && t.every(c => c === 'rgb(102, 102, 102)'), t);
      check('axe color-contrast: nothing in the month grids fails' + tag, a['color-contrast'].violations === 0, a['color-contrast']);
      check('...and axe measured the titles (instrument check)', a['color-contrast'].passes >= 2, a['color-contrast'].passes);
      await ctx.close();
    }
    const lum = h => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => +((Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)).toFixed(2);
    check('#666666 on white is 5.74:1 (the old #7A7A7A was 4.29)', ratio('#666666', '#ffffff') === 5.74 && ratio('#7a7a7a', '#ffffff') === 4.29,
      [ratio('#666666', '#ffffff'), ratio('#7a7a7a', '#ffffff')]);
    check('...and 5.6:1 on the plugin\'s own #fdfdfd ground', ratio('#666666', '#fdfdfd') >= 4.5, ratio('#666666', '#fdfdfd'));
    for (const [name, text] of [['widget.css', H.cssCode()], ['widget.min.css (what ships)', H.minCss()]]) {
      check('a plugin DEFAULT in ' + name + ': its own token, applied at (0,2,0)',
        /--mphbac-color-month-title:\s*#666666/.test(text)
        && /\.mphbac-month-title\.mphbac-month-title\s*\{[^}]*color:\s*var\(--mphbac-color-month-title,\s*#666666\)/.test(text));
    }
    check('...not an Elementor per-widget control', !/month_title|month-title/.test(H.php()));
  }

  await browser.close();
  done();
})();
