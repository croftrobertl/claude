/**
 * 1.48.0 — THE IRWIN AUDIT FIX RELEASE, OFFLINE.
 *
 * One section per fix the Director listed on 2026-11-04, each written so a
 * mutation of the fix turns it red (the mutations are recorded in
 * CLAUDE.md §49 with the check each one tripped). The live proof — real
 * pages, real theme, this build swapped in — is tools/live/proof.mjs; this
 * suite is what stays in the harness and guards the behaviour from here on.
 *
 *  1. the map box keeps its full drawn height while the map loads, and the
 *     loading line sits inside it;
 *  2. the widget fills an Elementor flexbox column instead of shrinking;
 *  3. the guide page changes view with attributes on the LIST, and its
 *     unclip reads every ancestor before it writes any;
 *  4. Wildlife shows placeholder tiles while the index arrives, the fetch
 *     starts when the view menu is reached for, and nothing below moves
 *     when the real tiles land;
 *  5. opening a species touches two tiles, not all of them, and a keystroke
 *     in the search paints before the list is filtered;
 *  6. (PHP: test-1480.php) the Fishing tab links FWC's limits once;
 *  7. the text rules: balance by default, multi-sentence paragraphs left;
 *  8. the wording: Issued, the depth map in About, past tense past 30 days,
 *     a real space before the arrow;
 *  9. every plugin <img> carries data-no-lazy (the 3x thumbnails: PHP);
 * 10. a one-line tile name reserves one line.
 */
import {
  launch, buildPage, widgetPage, rendered, asset, openWildlife, settleGrids,
  check, checkSame, checkAtLeast, checkAtMost, section, note, done,
} from './lib.mjs';

const browser = await launch();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/* ====================================================================== */
section('1. the map box keeps its drawn height while the map loads');

const MAP = rendered('map');
async function mapPage(width) {
  const fixture = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width, height: 844, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/water.css', 'assets/vendor/leaflet/leaflet.css'],
    head: '<link rel="stylesheet" data-dccwl-leaflet="1" href="data:text/css,">',
    body: fixture.html + `<script>${fixture.config}</script>` +
      '<div id="below" style="height:400px">below the widget</div>',
  });
  await page.route('**/*.png', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.evaluate(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__cls += e.value; } })
      .observe({ type: 'layout-shift', buffered: true });
  });
  await page.addScriptTag({ content: asset('assets/vendor/leaflet/leaflet.js') });
  await page.addScriptTag({ content: asset('assets/js/water-map.js') });
  /* The map payload is HELD until the test releases it, so the waiting
   * state can be measured; the conditions call answers at once. */
  await page.evaluate((data) => {
    let release;
    const held = new Promise((r) => { release = r; });
    window.__release = () => release();
    window.fetch = (url) => (/\/map/.test(String(url))
      ? held.then(() => ({ ok: true, status: 200, json: () => Promise.resolve(data) }))
      : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ enabled: true, facts: [] }) }));
  }, MAP);
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  return page;
}

for (const w of [390, 768, 1440]) {
  const page = await mapPage(w);
  await page.evaluate(() => document.querySelector('[data-dccwl-map-host]').scrollIntoView({ block: 'start' }));
  await page.waitForFunction(() => /Loading/.test((document.querySelector('[data-dccwl-map-host]') || {}).textContent || ''), null, { timeout: 8000 });
  const waiting = await page.evaluate(() => {
    const host = document.querySelector('[data-dccwl-map-host]');
    const line = host.querySelector('.dccwl-map-intro');
    const hb = host.getBoundingClientRect();
    /* The TEXT's box, not the paragraph's: the paragraph fills the canvas
     * area and centres its words inside it. */
    const rg = document.createRange(); rg.selectNodeContents(line);
    const lb = rg.getBoundingClientRect();
    const mapH = parseFloat(getComputedStyle(host).getPropertyValue('--dccwl-map-h')) || 0;
    return {
      host: Math.round(hb.height), mapH: Math.round(Math.min(innerHeight * 0.6, 520)),
      lineInside: lb.top >= hb.top - 1 && lb.bottom <= hb.bottom + 1 && lb.left >= hb.left - 1 && lb.right <= hb.right + 1,
      lineTop: Math.round(lb.top - hb.top), below: Math.round(document.getElementById('below').getBoundingClientRect().top + scrollY),
      cls: window.__cls, mapHvar: mapH,
    };
  });
  await page.evaluate(() => window.__release());
  await page.waitForSelector('[data-dccwl-map-host] .dccwl-map-canvas', { timeout: 15000 });
  await page.waitForTimeout(900);
  const built = await page.evaluate(() => {
    const host = document.querySelector('[data-dccwl-map-host]');
    const chips = document.querySelector('[data-dccwl-map-chips]');
    return {
      host: Math.round(host.getBoundingClientRect().height),
      chips: chips && !chips.hidden ? Math.round(chips.getBoundingClientRect().bottom - host.getBoundingClientRect().bottom) : 0,
      waitAttr: host.hasAttribute('data-dccwl-map-wait'),
      below: Math.round(document.getElementById('below').getBoundingClientRect().top + scrollY),
      cls: window.__cls,
    };
  });
  note(`${w}: waiting host ${waiting.host}px (canvas alone ${waiting.mapH}px), built host ${built.host}px + chips ${built.chips}px; content below moved ${built.below - waiting.below}px; CLS ${built.cls.toFixed(3)}`);
  checkAtLeast(waiting.mapH + 100, waiting.host, `${w}: while loading, the box holds the canvas AND its bar, legend and chips — not one line of text`);
  check(waiting.lineInside, `${w}: the loading line is inside the box`);
  checkAtLeast(Math.round(waiting.mapH / 4), waiting.lineTop, `${w}: and sits in the canvas area, not pinned to the top edge`);
  checkSame(false, built.waitAttr, `${w}: the reservation is released once the map is drawn`);
  /* This fixture has no Raleway, so the bar and legend wrap a little
   * differently from live; the reservation is measured on live (CLAUDE.md
   * §49). The bound here is that the map's arrival is a nudge at most. */
  checkAtMost(60, Math.abs(built.below - waiting.below), `${w}: content below the map moves 60px at most when the map lands`);
  checkAtMost(0.1, +built.cls.toFixed(3), `${w}: and the page's layout shift stays under 0.1`);
  await page.close();
}

/* ====================================================================== */
section('2. in an Elementor flexbox column the widget takes the full width');

{
  const { page } = await widgetPage(browser, 'canal', { width: 390, height: 844, sitekit: true });
  const r = await page.evaluate(() => {
    const root = document.querySelector('.dccwl-canal');
    const con = document.createElement('div');
    con.className = 'elementor-element e-con-full e-flex';
    con.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:354px;margin:0 auto';
    const wrap = document.createElement('div');
    wrap.className = 'elementor-element elementor-widget elementor-widget-dccwl_canal';
    const inner = document.createElement('div');
    inner.className = 'elementor-widget-container';
    root.parentNode.insertBefore(con, root);
    con.appendChild(wrap); wrap.appendChild(inner); inner.appendChild(root);
    return { con: Math.round(con.getBoundingClientRect().width), root: Math.round(root.getBoundingClientRect().width) };
  });
  note(`flex column ${r.con}px, widget ${r.root}px`);
  checkSame(r.con, r.root, 'the widget is as wide as the column it sits in (it shrank to 178px on /test/)');
  await page.close();
}

/* ====================================================================== */
section('3. the guide page: one write per view change, reads before writes');

{
  const fixture = rendered('guide');
  const page = await buildPage(browser, {
    width: 390, height: 844, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/widget.css', 'assets/css/guide.css'],
    body: '<div class="t1" style="overflow:hidden"><div class="t2" style="overflow:hidden"><div class="t3" style="overflow:hidden">' +
      fixture.html + `<script>${fixture.config}</script></div></div></div>`,
  });
  /* At every computed-style read of a hidden ancestor, note how many of
   * them have ALREADY been written. Reads-then-writes means every read
   * sees 0; the 1.47.2 read-write-read-write loop sees 0, then 1, then 2.
   * (A setter hook is not possible: Chromium exposes CSS properties without
   * a prototype accessor to wrap.) */
  await page.evaluate(() => {
    window.__io = [];
    const gcs = window.getComputedStyle;
    window.getComputedStyle = function (e, p) {
      if (e && e.classList && /^t\d$/.test(e.className)) {
        window.__io.push(document.querySelectorAll('.t1[style*="clip"], .t2[style*="clip"], .t3[style*="clip"]').length);
      }
      return gcs.call(this, e, p);
    };
  });
  for (const f of ['assets/js/sheet.js', 'assets/js/guide.js']) { await page.addScriptTag({ content: asset(f) }); }
  await page.waitForTimeout(300);
  const io = await page.evaluate(() => window.__io.join(','));
  note(`writes already made at each read: ${io}`);
  checkSame('0,0,0', io, 'the unclip reads all three hidden ancestors before it writes any');
  checkSame(3, await page.evaluate(() => document.querySelectorAll('[data-dccwl-unclipped]').length), 'and all three end up unclipped');

  const shown = () => page.evaluate(() => [...document.querySelectorAll('[data-dccwl-gp-item]')].filter((r) => r.getClientRects().length).length);
  const n0 = await shown();
  await page.evaluate(() => {
    window.__rowWrites = 0; window.__listWrites = 0;
    const list = document.querySelector('[data-dccwl-gp-list]');
    new MutationObserver((ms) => { for (const m of ms) { if (m.target === list) { window.__listWrites++; } else if (m.target.hasAttribute && m.target.hasAttribute('data-dccwl-gp-item')) { window.__rowWrites++; } } })
      .observe(list, { attributes: true, subtree: true, attributeFilter: ['hidden', 'data-gp-scope', 'data-gp-group'] });
  });
  const birds = await page.evaluate(() => +document.querySelector('[data-dccwl-gp-group="birds"] .dccwl-gp-count').textContent);
  await page.click('[data-dccwl-gp-group="birds"]');
  await page.waitForTimeout(150);
  const w1 = await page.evaluate(() => ({ rows: window.__rowWrites, list: window.__listWrites }));
  checkSame(birds, await shown(), 'tapping Birds shows the number on its pill');
  checkSame(0, w1.rows, 'and writes nothing on any row');
  checkSame(1, w1.list, 'just one attribute on the list');
  await page.click('[data-dccwl-gp-scope="wider"]');
  await page.click('[data-dccwl-gp-group="all"]');
  await page.waitForTimeout(150);
  const w2 = await page.evaluate(() => ({ rows: window.__rowWrites }));
  checkSame(0, w2.rows, 'the scope switch writes nothing on the rows either');
  checkAtLeast(n0 + 1, await shown(), 'and Wider Florida shows more than Seen Here');

  /* The guide's search, like /explore/'s, paints the letter first. */
  const before = await shown();
  const inTask = await page.evaluate(() => {
    const i = document.querySelector('[data-dccwl-gp-search]');
    i.value = 'heron';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return [...document.querySelectorAll('[data-dccwl-gp-item]')].filter((r) => r.getClientRects().length).length;
  });
  checkSame(before, inTask, 'a keystroke in the guide search does not filter 402 rows inside the keystroke');
  await page.waitForTimeout(700);
  const after = await shown();
  check(after > 0 && after < before, `and the rows follow once typing pauses (${before} -> ${after})`);
  await page.close();
}

/* ====================================================================== */
section('4. Wildlife: placeholders while the index arrives, nothing moves');

for (const w of [390, 768, 1440]) {
  const { page } = await widgetPage(browser, 'canal', { width: w, height: 900, sitekit: true, touch: w < 900 });
  const reqs = [];
  let open;
  const gate = new Promise((r) => { open = r; });
  await page.route('**/wp-json/dcc-wildlife/v1/species*', async (route) => { reqs.push(Date.now()); await gate; await route.fallback(); });
  const deferred = await page.evaluate(() => !!(window.DCC_WL_CFG && window.DCC_WL_CFG.indexDeferred));
  check(deferred, `${w}: this placement defers the index (so there is a wait to cover)`);
  await page.evaluate(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__cls += e.value; } })
      .observe({ type: 'layout-shift', buffered: true });
    document.querySelector('[data-dccwl-viewtrigger]').dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
  await page.waitForTimeout(150);
  checkSame(1, reqs.length, `${w}: reaching for the view menu starts the one fetch`);
  await page.evaluate(() => {
    document.querySelector('[data-dccwl-viewtrigger]').click();
    document.querySelector('[data-dccwl-view="wildlife"]').click();
  });
  await page.waitForTimeout(250);
  const ph = await page.evaluate(() => {
    const grid = [...document.querySelectorAll('.dccwl-panel-species .dccwl-guide-grid')].find((g) => !g.hidden);
    const foot = document.querySelector('.dccwl-canal .dccwl-footnotes') || document.querySelector('.dccwl-canal .dccwl-fullguide');
    const tile = grid.querySelector('.dccwl-ph .dccwl-tile');
    return {
      n: grid.querySelectorAll('.dccwl-ph').length, hidden: [...grid.querySelectorAll('.dccwl-ph')].every((l) => 'true' === l.getAttribute('aria-hidden')),
      gridTop: Math.round(grid.getBoundingClientRect().top + scrollY), gridH: Math.round(grid.getBoundingClientRect().height),
      foot: foot ? Math.round(foot.getBoundingClientRect().top + scrollY) : null,
      tile: tile ? `${Math.round(tile.getBoundingClientRect().width)}x${Math.round(tile.getBoundingClientRect().height)}` : null,
    };
  });
  checkSame(12, ph.n, `${w}: twelve placeholder tiles hold the grid while the list loads`);
  check(ph.hidden, `${w}: and assistive technology is told they are not content`);
  open();
  await page.waitForFunction(() => !document.querySelector('.dccwl-ph') && document.querySelector('.dccwl-panel-species .dccwl-tile[data-dccwl-species]'), null, { timeout: 20000 });
  await settleGrids(page);
  await page.waitForTimeout(300);
  const real = await page.evaluate(() => {
    const grid = [...document.querySelectorAll('.dccwl-panel-species .dccwl-guide-grid')].find((g) => !g.hidden);
    const foot = document.querySelector('.dccwl-canal .dccwl-footnotes') || document.querySelector('.dccwl-canal .dccwl-fullguide');
    const tile = grid.querySelector('.dccwl-tile');
    return {
      gridTop: Math.round(grid.getBoundingClientRect().top + scrollY), gridH: Math.round(grid.getBoundingClientRect().height),
      foot: foot ? Math.round(foot.getBoundingClientRect().top + scrollY) : null,
      tile: `${Math.round(tile.getBoundingClientRect().width)}x${Math.round(tile.getBoundingClientRect().height)}`,
      cls: window.__cls,
    };
  });
  note(`${w}: placeholder grid ${ph.gridH}px (tile ${ph.tile}) -> real ${real.gridH}px (tile ${real.tile}); footer ${ph.foot} -> ${real.foot}; CLS ${real.cls.toFixed(3)}`);
  checkSame(ph.tile, real.tile, `${w}: a placeholder tile is the size of a real one`);
  checkAtMost(4, Math.abs(real.gridTop - ph.gridTop), `${w}: the grid does not move when the tiles land`);
  checkAtMost(4, Math.abs(real.gridH - ph.gridH), `${w}: nor change height`);
  if (null !== ph.foot) { checkAtMost(6, Math.abs(real.foot - ph.foot), `${w}: and what is below it stays put`); }
  await page.close();
}

/* ====================================================================== */
section('5. taps: two tiles per opened species, and the keystroke paints first');

{
  const { page } = await widgetPage(browser, 'canal', { width: 390, height: 844, sitekit: true });
  await openWildlife(page);
  await page.evaluate(() => {
    window.__exp = 0;
    new MutationObserver((ms) => { window.__exp += ms.length; })
      .observe(document.querySelector('.dccwl-panel-species'), { attributes: true, subtree: true, attributeFilter: ['aria-expanded'] });
    const t = [...document.querySelectorAll('.dccwl-panel-species .dccwl-tile[data-dccwl-species]')].find((x) => x.getBoundingClientRect().width > 0);
    t.click();
  });
  await page.waitForTimeout(400);
  const first = await page.evaluate(() => window.__exp);
  checkAtMost(1, first, 'opening a species writes aria-expanded on one tile (it wrote every tile)');
  /* The sheet answers the tap first and fills on the next frame. */
  const sameTaskBody = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.dccwl-panel-species .dccwl-tile[data-dccwl-species]')].filter((x) => x.getBoundingClientRect().width > 0)[1];
    document.querySelector('.dccwl-sheet [data-dccwl-sheet-close], .dccwl-sheet button');
    t.click();
    const b = document.querySelector('.dccwl-sheet-body');
    return { open: !!document.querySelector('[data-dccwl-open="true"]'), kids: b ? b.children.length : -1 };
  });
  check(sameTaskBody.open && 0 === sameTaskBody.kids, 'a second species opens the sheet at once, its body still empty inside the tap', JSON.stringify(sameTaskBody));
  await page.waitForTimeout(400);
  checkAtLeast(3, await page.evaluate(() => document.querySelector('.dccwl-sheet-body').children.length), 'and filled on the next frame');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const afterClose = await page.evaluate(() => window.__exp);
  checkAtMost(4, afterClose, 'switching to a second species and closing it writes four times: on, off-and-on, off');

  const vis = () => page.evaluate(() => [...document.querySelectorAll('.dccwl-panel-species .dccwl-tile[data-dccwl-species]')].filter((t) => t.getClientRects().length).length);
  const before = await vis();
  await page.focus('.dccwl-panel-species [data-dccwl-search-input]');
  const sameTask = await page.evaluate(() => {
    const i = document.querySelector('.dccwl-panel-species [data-dccwl-search-input]');
    i.value = 'heron';
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return [...document.querySelectorAll('.dccwl-panel-species .dccwl-tile[data-dccwl-species]')].filter((t) => t.getClientRects().length).length;
  });
  checkSame(before, sameTask, 'the input event does not filter the list inside the keystroke');
  await page.waitForTimeout(700);
  const after = await vis();
  note(`tiles shown: ${before} -> ${after} after the pause`);
  check(after > 0 && after < before, 'and the list follows once typing pauses');
  await page.close();
}

/* ====================================================================== */
section('7 + 8. text rules and wording on the water panel');

const DAY = 864e5;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
const FACTS = {
  enabled: true,
  facts: [
    { label: 'Water Clarity (Secchi Depth)', key: 'clarity', value: '1.2 m — clearer than usual here', valuePast: '1.2 m — was clearer than usual here',
      short: '1.2 m', detail: 'clearer than usual here', sourceName: 'Lake County Water Atlas', date: iso(90), dateText: '', dateLabel: 'sampled', datePrecision: 'day', tier: 'published', group: 'primary', note: '' },
    { label: 'Dissolved Oxygen', key: 'oxygen', value: '7.1 mg/L', valuePast: '', sourceName: 'Lake County Water Atlas', date: iso(10), dateLabel: 'sampled', datePrecision: 'day', tier: 'published', group: 'primary', note: '' },
    { label: 'Forecast', key: 'forecast', value: 'Sunny, high 84', sourceName: 'National Weather Service Forecast', date: new Date().toISOString(), dateLabel: 'issued', datePrecision: 'minute', tier: 'live', group: 'primary', note: '' },
    { label: 'Depth Map', key: 'depth', value: 'Bathymetric survey, 2013', sourceName: 'Lake County Water Authority — Open the Depth Map (PDF)', date: '2013-05-01', dateLabel: 'surveyed', datePrecision: 'day', tier: 'published', group: 'primary', note: '' },
  ],
};
{
  const fixture = rendered('canal', '--enable');
  const page = await buildPage(browser, {
    width: 390, height: 2400, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/widget.css', 'assets/css/water.css', 'assets/css/canal.css'],
    body: `<script>window.__f=${JSON.stringify(FACTS)};window.fetch=function(u){return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve(/conditions/.test(String(u))?window.__f:{enabled:false});}});};</script>` +
      fixture.html + `<script>${fixture.config}</script>`,
  });
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/widget.js', 'assets/js/water.js', 'assets/js/canal.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(800);
  const cards = await page.evaluate(() => [...document.querySelectorAll('.dccwl-water-fact')].map((c) => ({
    label: (c.querySelector('.dccwl-card-label') || {}).textContent,
    value: (c.querySelector('.dccwl-card-value') || {}).textContent,
    fresh: (c.querySelector('.dccwl-card-fresh') || {}).textContent || '',
    about: !!c.closest('[data-dccwl-about-live]'),
  })));
  note(JSON.stringify(cards));
  const by = (l) => cards.find((c) => c.label === l) || {};
  checkSame('Issued Today', by('Forecast').fresh, 'a forecast is "Issued", not "Measured"');
  checkSame('1.2 m — was clearer than usual here', by('Water Clarity (Secchi Depth)').value, 'a 90-day-old sample reads in the past tense');
  checkSame('7.1 mg/L', by('Dissolved Oxygen').value, 'a 10-day-old one is printed as it came');
  checkSame(true, by('Depth Map').about, 'the depth map is in About');
  checkSame(1, cards.filter((c) => 'Depth Map' === c.label).length, 'and only there, not in Now');
  checkSame(false, await page.evaluate(() => document.querySelector('[data-dccwl-about-block]').hidden), 'its About block is shown because the card arrived');

  /* Fishing: multi-sentence left, a short line centred and balanced. */
  await page.evaluate(() => { const b = document.querySelector('[data-dccwl-water-tab-btn="fishing"]'); if (b) { b.click(); } });
  await page.waitForTimeout(300);
  const fish = await page.evaluate(() => {
    const st = (s) => { const e = document.querySelector(s); if (!e) { return null; } const cs = getComputedStyle(e); return { align: cs.textAlign, wrap: cs.textWrapStyle || cs.textWrap }; };
    return { intro: st('.dccwl-fishing-intro'), season: st('.dccwl-fishing-season-name'), limits: st('.dccwl-fishing-limits') };
  });
  note(JSON.stringify(fish));
  checkSame('left', fish.intro && fish.intro.align, 'the two-sentence fishing intro is left-aligned');
  check(/^(wrap|auto)$/.test(fish.intro && fish.intro.wrap), 'and wraps as ordinary text, not balanced', JSON.stringify(fish.intro));
  checkSame('center', fish.season && fish.season.align, 'a one-line season name stays centred');
  checkSame('balance', fish.season && fish.season.wrap, 'and is balanced');

  /* The audit's own rule, everywhere the water panel shows text. */
  const audit = await page.evaluate(() => {
    const bad = []; const noBal = [];
    for (const e of document.querySelectorAll('.dccwl-canal p, .dccwl-canal li, .dccwl-canal h2, .dccwl-canal h3, .dccwl-canal h4')) {
      if (!e.getClientRects().length) { continue; }
      /* The paragraph's OWN words: a trailing link ("FWC Licenses") is not
       * a second sentence. */
      const c = e.cloneNode(true); c.querySelectorAll('a').forEach((a) => a.remove());
      const t = (c.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) { continue; }
      const cs = getComputedStyle(e);
      const multi = 'P' === e.tagName && /[.!?][”’"')\]]?\s+\S/.test(t);
      if (multi && 'center' === cs.textAlign) { bad.push(t.slice(0, 50)); }
      if (!multi && 'center' === cs.textAlign && 'balance' !== (cs.textWrapStyle || cs.textWrap)) { noBal.push(t.slice(0, 50)); }
    }
    return { bad, noBal };
  });
  if (audit.bad.length) { note('centred prose: ' + audit.bad.join(' | ')); }
  if (audit.noBal.length) { note('unbalanced: ' + audit.noBal.join(' | ')); }
  checkSame(0, audit.bad.length, 'no multi-sentence paragraph is centred');
  checkSame(0, audit.noBal.length, 'every centred line is balanced');
  await page.close();
}

/* ====================================================================== */
section('5, 7, 8, 9, 10. the species sheet and the tiles');

{
  const { page } = await widgetPage(browser, 'canal', { width: 390, height: 844, sitekit: true });
  await openWildlife(page);
  const tileName = await page.evaluate(() => {
    const n = document.querySelector('.dccwl-panel-species .dccwl-tiles.dccwl-deck .dccwl-tile[data-dccwl-species] .dccwl-tile-name');
    return getComputedStyle(n).minHeight;
  });
  check('0px' === tileName || 'auto' === tileName, 'a tile name reserves no second line', tileName);
  checkSame('Search 402 Species', await page.evaluate(() => document.querySelector('.dccwl-panel-species [data-dccwl-search-input]').placeholder), 'the search box reads "Search 402 Species"');
  /* A species whose fact is two sentences or more. */
  await page.evaluate(() => {
    const cfg = window.DCC_WL_CFG;
    const multi = cfg.species.find((s) => /[.!?]\s+\S/.test(s.fact || '')) || cfg.species[0];
    const t = document.querySelector(`.dccwl-panel-species .dccwl-tile[data-dccwl-species="${multi.id}"]`);
    t.scrollIntoView(); t.click();
  });
  await page.waitForTimeout(700);
  const sheet = await page.evaluate(() => {
    const s = document.querySelector('.dccwl-sheet');
    const fact = s.querySelector('.dccwl-fact');
    const more = s.querySelector('.dccwl-detail-more-link');
    const imgs = [...s.querySelectorAll('img')];
    const safe = s.querySelector('.dccwl-safe .dccwl-detail-p');
    return {
      fact: fact ? getComputedStyle(fact).textAlign : null,
      more: more ? more.textContent : null,
      imgs: imgs.length, noLazy: imgs.filter((i) => '1' === i.getAttribute('data-no-lazy')).length,
      title: getComputedStyle(s.querySelector('.dccwl-sheet-title')).textWrapStyle,
      safe: safe ? { align: getComputedStyle(safe).textAlign, multi: /[.!?]\s+\S/.test(safe.textContent) } : null,
    };
  });
  note(JSON.stringify(sheet));
  checkSame('left', sheet.fact, "the sheet's multi-sentence main fact is left-aligned");
  if (sheet.safe && sheet.safe.multi) { checkSame('left', sheet.safe.align, '"What To Do", when it is two sentences, is left-aligned'); }
  checkSame('balance', sheet.title, 'the sheet title is balanced');
  checkSame('See The Full Entry →', sheet.more, '"See The Full Entry" has a space before its arrow');
  checkAtLeast(1, sheet.imgs, 'the sheet shows a photograph');
  checkSame(sheet.imgs, sheet.noLazy, 'and every image the plugin made carries data-no-lazy');
  const tilesNoLazy = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.dccwl-canal img, .dccwl-sheet img')];
    return { all: all.length, tagged: all.filter((i) => '1' === i.getAttribute('data-no-lazy')).length };
  });
  checkSame(tilesNoLazy.all, tilesNoLazy.tagged, `all ${tilesNoLazy.all} plugin images on the page carry data-no-lazy`);
  await page.close();
}

await browser.close();
done();
