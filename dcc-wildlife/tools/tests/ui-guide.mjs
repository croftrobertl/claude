/**
 * THE APP-STYLE GUIDE PAGE (1.46.0) — driven, not read.
 *
 * Rob picked this list from three mockups and the Director's DONE MEANS is
 * a list of things to check ON LIVE. Every one of them is checkable here
 * first, and every one is checked by DOING it: pressing the switch, typing
 * in the search, tapping a pill, tapping a row, following a deep link.
 *
 * WHY NONE OF IT READS THE STYLESHEET OR THE MARKUP. The counts, the chips
 * and the two filters are all claims about what a guest SEES, and this
 * repository has been bitten six times by a rule that was present and not
 * in force. A suite that greps for `content-visibility` or counts `<li>`
 * would pass against a page whose switch does nothing.
 *
 * THE ONE THING MEASURED RATHER THAN DRIVEN is the first view's element
 * count, which is a performance target — and it is measured as "elements
 * whose box intersects the first screen", because that is what "first
 * view" means. See the note beside it: asking the browser for a box
 * forces layout inside a content-visibility subtree, so the measurement
 * has to be taken once, at the end.
 */
import {
  launch, widgetPage, asset,
  check, checkSame, checkAtLeast, checkAtMost, section, note, done, skipSuite,
} from './lib.mjs';

const browser = await launch();
if (!browser) { skipSuite('no browser'); }

/** The counts the Director will check on live. */
const HERE = 395;   /* 346 HERE + 49 NEAR, both under "Seen Here" */
const WIDER = 7;
const TOTAL = 402;

async function guide(w, h = 844) {
  const { page } = await widgetPage(browser, 'guide', {
    width: w, height: h, sitekit: true, touch: w < 900,
  });
  await page.waitForTimeout(400);
  return page;
}

const shownCount = (page) => page.evaluate(() =>
  document.querySelectorAll('[data-dccwl-gp-item]:not([hidden])').length);

/* ====================================================================== */
section('the switch: Seen Here 395, Wider Florida 402');

{
  const page = await guide(390);

  checkSame(TOTAL, await page.evaluate(() =>
    document.querySelectorAll('[data-dccwl-gp-item]').length),
  'all 402 species are in the page');

  checkSame(HERE, await shownCount(page), 'and 395 of them are shown on arrival');
  checkSame('395', await page.evaluate(() =>
    document.querySelector('[data-dccwl-gp-count="all"]').textContent),
  'which is what the All pill says');

  /*
   * THE CHIP RULES, counted over the whole list. At most one per row, and
   * each by its own rule — "never infer any other status".
   */
  const chips = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-dccwl-gp-item]')];
    const out = { danger: 0, protected: 0, near: 0, two: 0, protectedKeys: [] };
    rows.forEach((r) => {
      const found = r.querySelectorAll('.dccwl-gp-chip');
      if (found.length > 1) { out.two += 1; }
      found.forEach((c) => {
        if (c.classList.contains('dccwl-gp-chip-danger')) { out.danger += 1; }
        if (c.classList.contains('dccwl-gp-chip-protected')) {
          out.protected += 1;
          out.protectedKeys.push(r.getAttribute('data-key'));
        }
        if (c.classList.contains('dccwl-gp-chip-near')) { out.near += 1; }
      });
    });
    return out;
  });
  note(`chips ${JSON.stringify(chips)}`);
  checkSame(0, chips.two, 'no row carries two chips');
  checkSame(21, chips.danger, '"Keep Away" is on the 21 species in the Safety group');
  checkSame(6, chips.protected, '"Protected" is on exactly six');
  checkSame('eagle,kestrel,littleblue,manatee,tricolored,woodstork',
    chips.protectedKeys.sort().join(','),
    'and they are the six the Director named, by key');

  /* The switch itself. */
  await page.click('[data-dccwl-gp-scope="wider"]');
  await page.waitForTimeout(200);
  checkSame(TOTAL, await shownCount(page), 'Wider Florida shows all 402');
  checkSame('402', await page.evaluate(() =>
    document.querySelector('[data-dccwl-gp-count="all"]').textContent),
  'and the count follows the switch');
  checkSame('Search All 402 Species', await page.evaluate(() =>
    document.querySelector('[data-dccwl-gp-search]').placeholder),
  'as does the search placeholder');

  /*
   * THE SEVEN. A WIDER species must be absent under "Seen Here" and
   * present under "Wider Florida" — both halves, because either alone
   * would pass for a switch that does nothing.
   */
  const wider = await page.evaluate(() => [...document.querySelectorAll('[data-scope="wider"]')]
    .map((r) => r.getAttribute('data-key')));
  checkSame(WIDER, wider.length, 'seven species are classified Wider Florida');
  note(`wider: ${wider.join(', ')}`);
  const widerShownNow = await page.evaluate(() => [...document.querySelectorAll('[data-scope="wider"]')]
    .filter((r) => !r.hidden).length);
  checkSame(WIDER, widerShownNow, 'and all seven are visible under Wider Florida');

  await page.click('[data-dccwl-gp-scope="here"]');
  await page.waitForTimeout(200);
  const widerShownHere = await page.evaluate(() => [...document.querySelectorAll('[data-scope="wider"]')]
    .filter((r) => !r.hidden).length);
  checkSame(0, widerShownHere, 'and none of them under Seen Here');
  checkSame(HERE, await shownCount(page), 'back to 395');

  /* The "Lake County" chip is the NEAR species, and they are under Seen Here. */
  const nearVisible = await page.evaluate(() => [...document.querySelectorAll('.dccwl-gp-chip-near')]
    .filter((c) => !c.closest('[data-dccwl-gp-item]').hidden).length);
  checkAtLeast(40, nearVisible, 'the Lake County species show under Seen Here, chipped');

  await page.close();
}

/* ====================================================================== */
section('the pills and the search');

{
  const page = await guide(390);

  const pills = await page.evaluate(() => [...document.querySelectorAll('[data-dccwl-gp-group]')]
    .map((b) => ({
      key: b.getAttribute('data-dccwl-gp-group'),
      label: b.textContent.replace(/\s+/g, ' ').trim(),
      n: +b.querySelector('.dccwl-gp-count').textContent,
    })));
  note(`pills: ${pills.map((p) => p.label).join(' | ')}`);
  checkAtLeast(9, pills.length, 'every group has a pill');
  checkSame(HERE, pills.filter((p) => 'all' !== p.key).reduce((a, p) => a + p.n, 0),
    'and the group counts add up to the All count — no species is in two pills or in none');

  /* Pressing one shows only that group. */
  const birds = pills.find((p) => 'birds' === p.key);
  await page.click('[data-dccwl-gp-group="birds"]');
  await page.waitForTimeout(200);
  checkSame(birds.n, await shownCount(page), 'tapping Birds shows exactly the number on the pill');
  const onlyBirds = await page.evaluate(() =>
    [...document.querySelectorAll('[data-dccwl-gp-item]:not([hidden])')]
      .every((r) => 'birds' === r.getAttribute('data-group')));
  check(onlyBirds, 'and nothing else');

  /* The search runs inside the chosen pill. */
  await page.fill('[data-dccwl-gp-search]', 'heron');
  await page.waitForTimeout(250);
  const herons = await page.evaluate(() =>
    [...document.querySelectorAll('[data-dccwl-gp-item]:not([hidden])')]
      .map((r) => r.getAttribute('data-name')));
  note(`search "heron" in Birds: ${herons.join(', ')}`);
  checkAtLeast(3, herons.length, 'searching "heron" finds herons');
  check(herons.every((n) => /heron/i.test(n)), 'and only herons', herons.join(', '));

  /* A scientific name, from a clean search. */
  await page.click('[data-dccwl-gp-group="all"]');
  await page.fill('[data-dccwl-gp-search]', 'Ardea herodias');
  await page.waitForTimeout(250);
  const sci = await page.evaluate(() =>
    [...document.querySelectorAll('[data-dccwl-gp-item]:not([hidden])')]
      .map((r) => r.getAttribute('data-name')));
  checkSame('Great Blue Heron', sci.join(', '), 'a scientific name finds its species');

  /*
   * THE SEARCH DOES NOT REACH PAST THE SWITCH. "Seen Here" is a statement
   * about evidence; a species with no record in Lake County must not
   * appear under it because somebody typed its name.
   */
  await page.fill('[data-dccwl-gp-search]', 'chigger');
  await page.waitForTimeout(250);
  checkSame(0, await shownCount(page), 'a Wider Florida species stays out of a Seen Here search');
  const empty = await page.evaluate(() => {
    const e = document.querySelector('[data-dccwl-gp-empty]');
    return e && !e.hidden ? e.textContent.trim() : null;
  });
  check(!!empty && /chigger/.test(empty), 'and the page says so, quoting what was typed', String(empty));

  await page.click('[data-dccwl-gp-scope="wider"]');
  await page.waitForTimeout(250);
  checkSame(1, await shownCount(page), 'switching to Wider Florida finds it');

  await page.close();
}

/* ====================================================================== */
section('the controls stay pinned while the list scrolls');

{
  /*
   * MEASURED BY SCROLLING, not by reading `position: sticky` off the
   * element. A sticky block inside an ancestor with `overflow: hidden`, or
   * one whose parent is shorter than it, scrolls away exactly as a static
   * one does — the declaration is present and not in force, which is this
   * repository's most repeated defect.
   */
  const page = await guide(390);
  const before = await page.evaluate(() => {
    const t = document.querySelector('[data-dccwl-gp-top]');
    return Math.round(t.getBoundingClientRect().top);
  });
  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const t = document.querySelector('[data-dccwl-gp-top]');
    const r = t.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      scrolled: Math.round(window.scrollY),
      /* And it is still the thing a finger would hit at that point. */
      hits: document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + 8)) ===
        t || t.contains(document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + 8))),
    };
  });
  note(`pinned block: top ${before}px -> ${after.top}px after scrolling ${after.scrolled}px`);
  checkAtLeast(1000, after.scrolled, 'the page really scrolled');
  checkAtMost(8, Math.abs(after.top), 'and the controls are still at the top of the screen');
  check(after.hits, 'with nothing painted over them');
  await page.close();
}

/* ====================================================================== */
section('tapping a row, and the deep link');

{
  const page = await guide(390);

  await page.click('[data-dccwl-gp-item][data-key="alligator"] .dccwl-gp-row');
  await page.waitForTimeout(600);
  const sheet = await page.evaluate(() => {
    const body = document.querySelector('.dccwl-sheet-body');
    const title = document.querySelector('.dccwl-sheet-title');
    const host = document.querySelector('[data-dccwl-sheet-host], .dccwl-sheet-host');
    const fold = document.querySelector('[data-key="alligator"] [data-dccwl-gp-details]');
    return {
      open: !!body && body.textContent.trim().length > 0,
      title: title ? title.textContent.trim() : '',
      hasPhoto: !!(body && body.querySelector('img.dccwl-gp-photo')),
      tiles: body ? body.querySelectorAll('.dccwl-gp-tiles .dccwl-fg-line').length : 0,
      credit: !!(body && body.querySelector('.dccwl-gp-credit')),
      text: body ? body.textContent.replace(/\s+/g, ' ') : '',
      foldOpen: fold ? fold.open : null,
      hostShown: host ? !host.hidden : null,
    };
  });
  note(`sheet ${JSON.stringify({ ...sheet, text: sheet.text.slice(0, 90) })}`);
  check(sheet.open, 'a row opens the shared sheet');
  checkSame('Alligator', sheet.title, 'titled with the species');
  check(sheet.hasPhoto, 'with the photograph at size');
  checkSame(2, sheet.tiles, 'and Where To Look and Best Time as the two tiles');
  check(sheet.credit, 'and the photo credit, which is a licence obligation at this size');
  check(/state reptile|bellow/i.test(sheet.text), 'the entry itself is in it', sheet.text.slice(0, 160));
  checkSame(false, sheet.foldOpen,
    'while the row\'s own <details> stays CLOSED — the content is shown once, in the sheet');

  /* The list keeps its place: nothing above the tapped row moved. */
  const kept = await page.evaluate(() => {
    const r = document.querySelector('[data-key="alligator"]');
    return Math.round(r.getBoundingClientRect().top);
  });
  note(`the tapped row is still at y=${kept}`);
  check(kept > -50 && kept < 900, 'and the list did not jump', String(kept));

  await page.close();
}

{
  /*
   * #dccwl-fl-alligator OPENS ITS SPECIES — the Director's own DONE MEANS
   * line, and the reason /explore/'s "See The Full Entry" link changed
   * shape in this release.
   */
  const page = await guide(390);
  await page.evaluate(() => { window.location.hash = '#dccwl-fl-manatee'; });
  await page.waitForTimeout(700);
  const deep = await page.evaluate(() => {
    const body = document.querySelector('.dccwl-sheet-body');
    return {
      title: (document.querySelector('.dccwl-sheet-title') || {}).textContent,
      text: body ? body.textContent.replace(/\s+/g, ' ') : '',
    };
  });
  note(`deep link ${JSON.stringify({ ...deep, text: deep.text.slice(0, 90) })}`);
  checkSame('Manatee', String(deep.title).trim(), 'a #dccwl-fl- link opens that species');
  check(/your hosts/i.test(deep.text),
    'and the manatee entry leads with the owners\' own sighting', deep.text.slice(0, 160));
  check(/Seen Here/i.test(deep.text),
    'credited to them, not to iNaturalist');

  /*
   * A LINK TO A WIDER FLORIDA SPECIES HAS TO WORK TOO, and that means
   * moving the switch: its row is hidden under the view the page opens on.
   */
  await page.evaluate(() => { window.location.hash = '#dccwl-fl-chiggers'; });
  await page.waitForTimeout(700);
  const wide = await page.evaluate(() => ({
    title: (document.querySelector('.dccwl-sheet-title') || {}).textContent,
    scope: document.querySelector('[data-dccwl-gp-scope="wider"]').getAttribute('aria-pressed'),
  }));
  checkSame('Chiggers', String(wide.title).trim(), 'a link to a Wider Florida species opens it');
  checkSame('true', wide.scope, 'by moving the switch, rather than opening nothing');

  await page.close();
}

{
  /*
   * AND THE SAME LINK FOLLOWED FROM ANOTHER PAGE — THE HASH ALREADY IN THE
   * URL WHEN THE SCRIPT STARTS.
   *
   * This is the path a guest actually takes from /explore/'s "See The Full
   * Entry", and it is a DIFFERENT code path from the one above: that one
   * fires `hashchange`, this one runs once on arrival. A mutation that
   * deleted the on-arrival call left every assertion above green, which is
   * exactly the hole this closes — two paths, two tests, because one of
   * them passing says nothing about the other.
   *
   * The hash has to be set BEFORE guide.js is injected, so the page is
   * built with no scripts and they are added by hand in the plugin's own
   * dependency order.
   */
  const { page } = await widgetPage(browser, 'guide', {
    width: 390, height: 844, sitekit: true, touch: true, js: [],
  });
  await page.evaluate(() => { window.location.hash = '#dccwl-fl-alligator'; });
  for (const f of ['assets/js/sheet.js', 'assets/js/guide.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(700);
  const arrived = await page.evaluate(() => ({
    title: (document.querySelector('.dccwl-sheet-title') || {}).textContent,
    body: (document.querySelector('.dccwl-sheet-body') || {}).textContent?.replace(/\s+/g, ' ').slice(0, 60),
  }));
  note(`on arrival ${JSON.stringify(arrived)}`);
  checkSame('Alligator', String(arrived.title || '').trim(),
    'arriving WITH the hash already in the URL opens that species too');
  await page.close();
}

/* ====================================================================== */
section('desktop: the list on the left, the species on the right');

{
  const page = await guide(1280, 900);
  await page.click('[data-dccwl-gp-item][data-key="eagle"] .dccwl-gp-row');
  await page.waitForTimeout(500);
  const split = await page.evaluate(() => {
    const pane = document.querySelector('[data-dccwl-gp-pane]');
    const list = document.querySelector('[data-dccwl-gp-list]');
    const sheetOpen = !!document.querySelector('[data-dccwl-open="true"]');
    const pr = pane.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    return {
      paneShown: !pane.hidden,
      sheetOpen,
      paneLeft: Math.round(pr.left),
      listRight: Math.round(lr.right),
      text: pane.textContent.replace(/\s+/g, ' ').slice(0, 60),
      onRow: !!document.querySelector('[data-key="eagle"].dccwl-gp-item-on'),
    };
  });
  note(`desktop ${JSON.stringify(split)}`);
  check(split.paneShown, 'the pane fills instead of a sheet opening');
  checkSame(false, split.sheetOpen, 'and no sheet opens over the list');
  check(split.paneLeft >= split.listRight - 2,
    'the pane is to the RIGHT of the list', `${split.listRight} -> ${split.paneLeft}`);
  check(/Bald Eagle/i.test(split.text), 'showing the species that was clicked', split.text);
  check(split.onRow, 'and the row says it is the chosen one');
  await page.close();
}

/* ====================================================================== */
section("Rob's alignment rule, measured on the rendered page");

{
  /*
   * "Every title, heading and card or sheet title is centered. Only
   * multi-sentence paragraphs are left-aligned." The Director restated it
   * for this release and said his own mockups break it, so the mockups are
   * not the reference — this is.
   *
   * Measured as COMPUTED text-align, on the elements as they render, with
   * the sheet open so the sheet's own titles are included.
   */
  const page = await guide(390);
  await page.click('[data-dccwl-gp-item][data-key="eagle"] .dccwl-gp-row');
  await page.waitForTimeout(500);

  const align = await page.evaluate(() => {
    const read = (sel) => {
      const n = document.querySelector(sel);
      return n ? getComputedStyle(n).textAlign : null;
    };
    return {
      title: read('.dccwl-gp-title'),
      sub: read('.dccwl-gp-sub'),
      sheetTitle: read('.dccwl-sheet-title'),
      speciesName: read('.dccwl-sheet-body .dccwl-fg-name'),
      tile: read('.dccwl-sheet-body .dccwl-gp-tiles .dccwl-fg-line'),
      credit: read('.dccwl-sheet-body .dccwl-gp-credit'),
      /* The one that must NOT be centred: the multi-sentence paragraph. */
      fact: read('.dccwl-sheet-body .dccwl-fg-fact'),
      /* A list row is a row — the exception Rob named himself. */
      rowText: read('.dccwl-gp-text'),
    };
  });
  note(`alignment ${JSON.stringify(align)}`);
  checkSame('center', align.title, 'the page title is centred');
  checkSame('center', align.sub, 'and its subtitle');
  checkSame('center', align.sheetTitle, 'the sheet title is centred');
  checkSame('center', align.speciesName, 'so is the species name inside it');
  checkSame('center', align.tile, 'and the two tiles');
  checkSame('center', align.credit, 'and the photo credit');
  check('center' !== align.fact,
    'while the multi-sentence fact stays left-aligned, as the rule says', String(align.fact));
  check('center' !== align.rowText,
    'and a list row reads from the start — the exception he named', String(align.rowText));
  await page.close();
}

/* ====================================================================== */
section('the first view, and what it costs');

{
  const page = await guide(390, 844);
  /*
   * TAKEN LAST, AND ONCE. Reading a box inside a `content-visibility: auto`
   * subtree forces the browser to lay that subtree out, so this
   * measurement changes what it measures if anything else has already
   * asked. It is the only rect query in this suite's performance section.
   */
  const first = await page.evaluate(() => {
    const vh = window.innerHeight, vw = window.innerWidth;
    let n = 0;
    for (const el of document.querySelectorAll('.dccwl-gp *')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw) { n += 1; }
    }
    return n;
  });
  note(`elements in the first view at 390x844: ${first}`);
  checkAtMost(1000, first, 'the first view is under 1,000 elements (the Director\'s target)');
  checkAtLeast(20, first, 'and it is not empty — something really is drawn');
  await page.close();
}

await browser.close();
done();
