/**
 * 1.48.1 — CREDITS BEHIND ⓘ, AND GUIDE PILLS UNDER 200 ms.
 *
 * Rob, 2026-11-04:
 *   1. "ALL credit and source lines go behind an ⓘ tooltip … One ⓘ pattern
 *      everywhere." Opens by tap and by keyboard, closes on an outside tap
 *      or Esc, keeps its Title Case and dates. Any credit a licence requires
 *      to be VISIBLE stays visible (the map's tile attribution: ui-live.mjs
 *      pins it to Leaflet's own control; the Photo Credits panel: below).
 *   2. The guide page's Birds and Wider Florida pills: "target under 200 ms
 *      at 390 / 4×".
 *
 * Every section is written so the matching mutation in CLAUDE.md §50 turns
 * it red: a credit left inline, an ⓘ the keyboard cannot reach, a licence
 * credit hidden, and the pills put back on `display: none`.
 */
import {
  widgetPage, openWildlife, launch,
  check, checkSame, checkAtLeast, checkAtMost, section, note, done,
} from './lib.mjs';

const browser = await launch();

/* Text that is a CREDIT or a SOURCE. If any of it is in the rendered text of
 * the page — innerText, which leaves out a closed popover and a closed
 * <details> — a credit has been left inline. "FWC" is deliberately absent:
 * "Current Limits on FWC ↗" is an action, and the "(FWC)" season markers
 * say whose season it is; both stay, by the brief. */
const CREDIT = /iNaturalist|National Weather Service|Water Atlas|\bUSGS\b|Adobe Stock|\bCC[- ]BY\b|\bCC0\b|Wikimedia|Public Domain|\bas of (January|February|March|April|May|June|July|August|September|October|November|December)\b/i;

const openPops = (page) => page.evaluate(() => document.querySelectorAll('.dccwl-info-pop:popover-open').length);
const inlineLeft = (page) => page.evaluate((src) => {
  const re = new RegExp(src, 'i');
  const hits = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || !re.test(n.textContent)) { continue; }
    /* Exempt, each for a stated reason: the panels themselves; the licence
     * surface; the map's own attribution (its provider requires it); and the
     * "Official Information" list, which is a list of PLACES TO GO — the
     * same kind of thing as "Current Limits on FWC ↗", an action. */
    if (el.closest('script, style, .dccwl-info-pop, .dccwl-photo-credits, .leaflet-control-attribution, .dccwl-water-linklist, [hidden]')) { continue; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || 'hidden' === getComputedStyle(el).visibility) { continue; }
    hits.push(n.textContent.replace(/\s+/g, ' ').trim().slice(0, 80));
  }
  return hits;
}, CREDIT.source);

/* Tab forward from wherever focus is until an ⓘ takes it, or give up. */
async function tabToInfo(page, max = 40) {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => !!(document.activeElement && document.activeElement.classList.contains('dccwl-info-btn')))) {
      return true;
    }
  }
  return false;
}

/* ====================================================================== */
section('1. /explore/: the species sheet keeps its photo credit behind an ⓘ');

{
  const { page } = await widgetPage(browser, 'canal', { width: 390, height: 844, sitekit: true, touch: true });
  await openWildlife(page);
  await page.evaluate(() => document.querySelector('.dccwl-tile').click());
  await page.waitForTimeout(500);
  const sheetOpen = () => page.evaluate(() => { const h = document.querySelector('.dccwl-sheet-host'); return !!h && 'true' === h.getAttribute('data-dccwl-open'); });
  check(await sheetOpen(), 'a species sheet is open');

  const inSheet = await page.evaluate(() => {
    const s = document.querySelector('.dccwl-sheet');
    const info = s.querySelector('.dccwl-medallion .dccwl-info.dccwl-info-onphoto');
    const btn = info && info.querySelector('.dccwl-info-btn');
    const pop = btn && document.getElementById(btn.getAttribute('popovertarget'));
    return {
      on: !!info,
      label: btn && btn.getAttribute('aria-label'),
      text: pop ? pop.textContent.replace(/\s+/g, ' ').trim() : '',
      allCredits: !!(pop && Array.from(pop.querySelectorAll('a')).some((a) => /Photo Credits/.test(a.textContent))),
      oldLine: s.querySelectorAll('.dccwl-photo-credit').length,
    };
  });
  note(JSON.stringify(inSheet));
  check(inSheet.on, 'the ⓘ sits on the photograph');
  checkSame('Photo Credit', inSheet.label, 'named "Photo Credit", in Title Case');
  check(inSheet.text.length > 3, 'its panel carries the credit', inSheet.text);
  check(inSheet.allCredits, 'and the way to the full Photo Credits panel');
  checkSame(0, inSheet.oldLine, 'the old credit line under the photo is gone');
  checkSame([], await inlineLeft(page), 'nothing on screen is a credit left inline');

  /* THE KEYBOARD. A real Tab walk from the sheet's own close button: an ⓘ
   * a guest cannot reach by key is the mutation this exists to catch. */
  await page.focus('.dccwl-sheet .dccwl-sheet-close');
  check(await tabToInfo(page), 'Tab reaches the ⓘ inside the sheet');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  checkSame(1, await openPops(page), 'Enter opens it');

  /* ESC BELONGS TO THE INNERMOST OPEN THING (§8). First press: the ⓘ. */
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  checkSame(0, await openPops(page), 'the first Esc closes the ⓘ');
  check(await sheetOpen(), 'and leaves the sheet open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check(!(await sheetOpen()), 'the second Esc closes the sheet');
  await page.close();
}

/* ====================================================================== */
section('2. /explore/ water: every reading and the Fishing guide keep their sources behind an ⓘ');

{
  const { page } = await widgetPage(browser, 'canal', { width: 390, height: 844, sitekit: true, touch: true }, '--enable');
  const fishing = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll('h3')).find((x) => /Fishing the Harris Chain/.test(x.textContent));
    const btn = h && h.querySelector('.dccwl-info-btn');
    const pop = btn && document.getElementById(btn.getAttribute('popovertarget'));
    const fwc = Array.from(document.querySelectorAll('a')).find((a) => /Current Limits on FWC/.test(a.textContent));
    return {
      heading: !!h, info: !!btn, last: !!btn && h.lastElementChild === btn.parentElement,
      label: btn && btn.getAttribute('aria-label'),
      text: pop ? pop.textContent.replace(/\s+/g, ' ').trim() : '',
      fwcInPop: !!(fwc && fwc.closest('.dccwl-info-pop')),
      fwc: !!fwc,
      oldSrc: document.querySelectorAll('.dccwl-fishing-src').length,
    };
  });
  note(JSON.stringify(fishing));
  if (fishing.heading) {
    check(fishing.info && fishing.last, 'the Fishing heading ends with its ⓘ');
    check(/^Sources for the fishing guide$/i.test(String(fishing.label)), 'named for what it holds', String(fishing.label));
    check(fishing.text.length > 10, 'and its panel holds the sources', fishing.text);
    checkSame(0, fishing.oldSrc, 'the old source line is gone');
    check(fishing.fwc && !fishing.fwcInPop, '"Current Limits on FWC ↗" stays visible — it is an action, not a credit');
  } else {
    note('this fixture has no Fishing tab; ui-water-tabs.mjs and test-1481.php cover it');
  }
  await page.close();
}

/* ====================================================================== */
section('3. /wildlife-guide/: spotlight, photos, records and listings behind an ⓘ');

for (const w of [390, 1440]) {
  const { page } = await widgetPage(browser, 'guide', { width: w, height: 900, sitekit: true, touch: w < 900 });
  checkSame([], await inlineLeft(page), `${w}: nothing on screen is a credit left inline`);
  const unpaired = await page.evaluate(() => Array.from(document.querySelectorAll('.dccwl-info-btn'))
    .filter((b) => { const p = document.getElementById(b.getAttribute('popovertarget') || ''); return !p || p.parentElement !== b.parentElement || 'auto' !== p.getAttribute('popover'); })
    .length);
  checkSame(0, unpaired, `${w}: every ⓘ names its OWN popover="auto" panel, beside it`);
  const dupIds = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('.dccwl-info-pop')).map((p) => p.id);
    return ids.length - new Set(ids).size;
  });
  checkSame(0, dupIds, `${w}: no two panels share an id`);

  if (1440 === w) {
    /* The spotlight's "as of" line: the PHP ⓘ, reached by key. */
    const spot = await page.evaluate(() => {
      const h = document.querySelector('.dccwl-gp-spot-h');
      const btn = h && h.querySelector('.dccwl-info-btn');
      const pop = btn && document.getElementById(btn.getAttribute('popovertarget'));
      return { info: !!btn, text: pop ? pop.textContent.replace(/\s+/g, ' ').trim() : '' };
    });
    check(spot.info, '1440: "Most Recorded Here" ends with its ⓘ');
    check(/iNaturalist, as of [A-Z][a-z]+ \d{4}/.test(spot.text), '1440: whose panel keeps the source and its date', spot.text);
    /* The pane comes before the list in the source, so Tab from the search
     * reaches the spotlight's ⓘ before the first row. */
    await page.focus('[data-dccwl-gp-search]');
    let reached = false;
    for (let i = 0; i < 30 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('.dccwl-gp-spot-h')));
    }
    const paneName = await page.evaluate(() => {
      const pane = document.querySelector('[data-dccwl-gp-pane]');
      return document.getElementById(pane.getAttribute('aria-labelledby') || '')?.textContent.trim();
    });
    checkSame('Most Recorded Here', paneName, '1440: the pane is named by the title alone, not the ⓘ');
    check(reached, '1440: the keyboard reaches it');
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    checkSame(1, await openPops(page), '1440: Space opens it');
    await page.mouse.click(5, 880);
    await page.waitForTimeout(100);
    checkSame(0, await openPops(page), '1440: a click outside closes it');

    /* The pane: a CLONED entry. Its ⓘ must open ITS panel, not the row's. */
    await page.click('[data-dccwl-gp-item][data-key="eagle"] .dccwl-gp-row');
    await page.waitForTimeout(400);
    checkSame([], await inlineLeft(page), '1440: with an entry in the pane, still no credit inline');
    const pane = await page.evaluate(() => {
      const b = document.querySelector('[data-dccwl-gp-pane] .dccwl-gp-photowrap .dccwl-info-btn');
      return b ? { target: b.getAttribute('popovertarget'), own: !!b.parentElement.querySelector('#' + CSS.escape(b.getAttribute('popovertarget'))) } : null;
    });
    check(!!pane && pane.own, '1440: the pane\'s photo ⓘ points at its own panel', JSON.stringify(pane));
    await page.click('[data-dccwl-gp-pane] .dccwl-gp-photowrap .dccwl-info-btn');
    await page.waitForTimeout(100);
    const which = await page.evaluate(() => { const p = document.querySelector('.dccwl-info-pop:popover-open'); return p ? !!p.closest('[data-dccwl-gp-pane]') : null; });
    checkSame(true, which, '1440: and a click opens that one');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    /* The record's ⓘ IS a clone of the row's — the case where a copied id
     * would open the hidden row's panel instead of the pane's. */
    const rec = page.locator('[data-dccwl-gp-pane] [data-k="local"] .dccwl-info-btn').first();
    check(await rec.count() > 0, '1440: the pane\'s record line carries its ⓘ');
    if (await rec.count() > 0) {
      await rec.click();
      await page.waitForTimeout(100);
      const recOpen = await page.evaluate(() => {
        const p = document.querySelector('.dccwl-info-pop:popover-open');
        if (!p) { return null; }
        const r = p.getBoundingClientRect();
        return { inPane: !!p.closest('[data-dccwl-gp-pane]'), shown: r.width > 0 && r.height > 0 };
      });
      check(!!recOpen && recOpen.inPane && recOpen.shown, '1440: and a click opens the PANE\'s copy, on screen', JSON.stringify(recOpen));
      await page.keyboard.press('Escape');
    }
    const dupAfter = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('.dccwl-info-pop')).map((p) => p.id);
      return ids.length - new Set(ids).size;
    });
    checkSame(0, dupAfter, '1440: and with a clone on the page, still no two panels share an id');
  } else {
    await page.click('[data-dccwl-gp-item][data-key="eagle"] .dccwl-gp-row');
    await page.waitForTimeout(500);
    checkSame([], await inlineLeft(page), '390: with an entry in the sheet, still no credit inline');
    checkSame(0, await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('.dccwl-info-pop')).map((p) => p.id);
      return ids.length - new Set(ids).size;
    }), '390: with an entry in the sheet, no two panels share an id');
    const b = page.locator('.dccwl-sheet:not([hidden]) .dccwl-gp-photowrap .dccwl-info-btn').first();
    check(await b.count() > 0, '390: the sheet\'s photo carries an ⓘ');
    await b.click();
    await page.waitForTimeout(100);
    const which = await page.evaluate(() => {
      const p = document.querySelector('.dccwl-info-pop:popover-open');
      if (!p) { return null; }
      const r = p.getBoundingClientRect();
      return { inSheet: !!p.closest('.dccwl-sheet'), inView: r.left >= 0 && r.right <= innerWidth };
    });
    check(!!which && which.inSheet, '390: a tap opens the sheet\'s own panel', JSON.stringify(which));
    check(!!which && which.inView, '390: drawn inside the screen');
  }
  await page.close();
}

/* ====================================================================== */
section('4. the licence surface stays whole: the Photo Credits panel');

{
  const { page } = await widgetPage(browser, 'guide', { width: 390, height: 900, sitekit: true });
  const credits = await page.evaluate(() => {
    const d = document.querySelector('details.dccwl-photo-credits');
    if (!d) { return null; }
    const s = d.querySelector('summary');
    const r = s.getBoundingClientRect();
    d.open = true;
    const items = Array.from(d.querySelectorAll('.dccwl-photo-credits-list li'));
    const vis = items.filter((li) => li.getBoundingClientRect().height > 0 && 'hidden' !== getComputedStyle(li).visibility);
    const note = d.querySelector('.dccwl-photo-credits-note');
    return {
      summaryShown: r.height > 0 && 'none' !== getComputedStyle(d).display && 'hidden' !== getComputedStyle(d).visibility,
      items: items.length, visible: vis.length,
      modNote: !!note && note.getBoundingClientRect().height > 0,
      inPopover: !!d.closest('.dccwl-info-pop'),
    };
  });
  note(JSON.stringify(credits));
  check(!!credits && credits.summaryShown, 'the "Photo Credits (N)" panel is on the page, not behind an ⓘ');
  check(!!credits && !credits.inPopover, 'and it is not inside any popover');
  check(!!credits && credits.items > 300 && credits.visible === credits.items, 'opened, every credit in it is visible');
  check(!!credits && credits.modNote, 'with the modification notice CC BY requires');
  await page.close();
}

/* ====================================================================== */
section('5. the guide pills, at 390 and 4× CPU: under 200 ms each');

{
  const { page } = await widgetPage(browser, 'guide', { width: 390, height: 844, sitekit: true, touch: true });
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    window.__ev = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__ev.push([e.name, Math.round(e.duration)]); } })
      .observe({ type: 'event', durationThreshold: 16, buffered: false });
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const times = {};
  const STEPS = [
    ['Birds', '[data-dccwl-gp-group="birds"]'],
    ['Wider Florida', '[data-dccwl-gp-scope="wider"]'],
    ['All', '[data-dccwl-gp-group="all"]'],
    ['Seen Here', '[data-dccwl-gp-scope="here"]'],
  ];
  for (let round = 0; round < 3; round += 1) {
    for (const [name, sel] of STEPS) {
      await page.evaluate(() => { window.__ev = []; });
      await page.tap(sel);
      await page.waitForTimeout(700);
      const t = await page.evaluate(() => Math.max(0, ...window.__ev.filter((e) => /click|pointer|touch/.test(e[0])).map((e) => e[1])));
      times[name] = Math.max(times[name] || 0, t);
    }
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  note(`worst of three, input to next paint: ${JSON.stringify(times)}`);
  for (const [name] of STEPS) {
    checkAtMost(199, times[name], `${name}: under 200 ms`);
  }
  const rows = await page.evaluate(() => document.querySelectorAll('[data-dccwl-gp-item]').length);
  checkAtLeast(400, rows, `measured over the full list (${rows} rows)`);
  await page.close();
}

await browser.close();
done();
