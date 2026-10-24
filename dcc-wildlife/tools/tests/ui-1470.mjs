/**
 * 1.47.0 — "MOST RECORDED HERE" AND THE FOLDED CREDITS, DRIVEN.
 *
 * Rob picked C and Y from the desktop stills. Everything the Director's
 * brief asks of them is a claim about what a guest DOES — wheels, tabs,
 * taps, follows a link — so every one is done here, not read from the
 * stylesheet:
 *
 *   - the four cards open their species IN THE PANE, with nothing moving;
 *   - the list's scroll box passes the WHEEL through at both ends, in both
 *     directions, and the KEYBOARD scrolls inside it and Tabs out of it;
 *   - the box cues that it scrolls, and stops cueing at its end;
 *   - `#credits` OPENS the folded credits, on arrival and on hashchange;
 *   - below 900px none of it exists.
 *
 * The server half (which four, the date, the counts) is test-1470.php.
 */
import {
  launch, widgetPage, asset, styleOf, horizontalOverflow,
  check, checkSame, checkAtLeast, checkAtMost, section, note, done, skipSuite,
} from './lib.mjs';

const browser = await launch();
if (!browser) { skipSuite('no browser'); }

const DESKTOP = [[1440, 900], [1024, 768]];
const FOUR = ['alligator', 'anhinga', 'commongallinule', 'heron'];

async function guide(w, h, extra = {}) {
  const { page } = await widgetPage(browser, 'guide', {
    width: w, height: h, sitekit: true, touch: w < 900, ...extra,
  });
  await page.waitForTimeout(500);
  return page;
}

const state = (page) => page.evaluate(() => {
  const list = document.querySelector('[data-dccwl-gp-list]');
  const pane = document.querySelector('[data-dccwl-gp-pane]');
  const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width)]; };
  return {
    y: Math.round(window.scrollY),
    top: Math.round(list.scrollTop),
    max: Math.round(list.scrollHeight - list.clientHeight),
    list: r(list), pane: r(pane),
    end: list.classList.contains('dccwl-at-end'),
  };
});

/** A point over the VISIBLE part of the list (the pinned block covers its
 *  top once the page has scrolled). */
const overList = (page) => page.evaluate(() => {
  const l = document.querySelector('[data-dccwl-gp-list]').getBoundingClientRect();
  const t = document.querySelector('[data-dccwl-gp-top]').getBoundingClientRect();
  const y0 = Math.max(l.top, t.bottom) + 10;
  const y1 = Math.min(l.bottom, window.innerHeight) - 10;
  return { x: Math.round(l.left + l.width / 2), y: Math.round((y0 + y1) / 2), ok: y1 > y0 };
});

/** One wheel GESTURE: Chrome latches a gesture to the scroller it began
 *  on, so each step waits long enough to end it, as a hand does. */
async function wheel(page, dy) {
  const p = await overList(page);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, dy);
  await page.waitForTimeout(450);
}

/* ====================================================================== */
for (const [w, h] of DESKTOP) {
  section(`${w}: the pane before anything is opened`);
  const page = await guide(w, h);

  const spot = await page.evaluate(() => {
    const pane = document.querySelector('[data-dccwl-gp-pane]');
    const h2 = pane.querySelector('h2');
    const cs = h2 ? getComputedStyle(h2) : null;
    const b = pane.getBoundingClientRect();
    return {
      shown: !pane.hidden && b.width > 0 && b.height > 0,
      title: h2 ? h2.textContent.trim() : '',
      align: cs ? cs.textAlign : '',
      sub: (pane.querySelector('[data-dccwl-gp-spot-asof]') || {}).textContent?.replace(/\s+/g, ' ').trim(),
      keys: [...pane.querySelectorAll('[data-dccwl-gp-spot-key]')].map((a) => a.getAttribute('data-dccwl-gp-spot-key')),
      names: [...pane.querySelectorAll('[data-dccwl-gp-spot-key]')].map((a) => a.textContent.replace(/\s+/g, ' ').trim()),
      sticky: getComputedStyle(pane).position,
      label: pane.getAttribute('aria-labelledby'),
    };
  });
  note(`spotlight ${JSON.stringify(spot)}`);
  check(spot.shown, 'the pane is shown on arrival — no blank column');
  checkSame('Most Recorded Here', spot.title, 'titled "Most Recorded Here"');
  checkSame('center', spot.align, 'and the title is centred');
  checkSame('The four species recorded most on this canal on iNaturalist, as of October 2026', spot.sub, 'the subtitle names the source and the pull\'s month');
  checkSame(FOUR, spot.keys, 'four cards, the top four by records');
  checkSame('Alligator · Keep Away', spot.names[0].replace(', Keep Away', ''), 'the alligator card reads "Alligator · Keep Away"');
  checkSame('sticky', spot.sticky, 'the pane keeps its sticky position');

  /* Every card's photo box is sized before the photo — the ratio decides. */
  const imgs = await page.evaluate(() => [...document.querySelectorAll('.dccwl-gp-spot-img')]
    .map((i) => Math.round(i.getBoundingClientRect().height)));
  check(imgs.every((x) => x > 100), 'every card\'s photo has its height before and after loading', JSON.stringify(imgs));
  const look = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.dccwl-gp-spot-card')].map((x) => Math.round(x.getBoundingClientRect().height));
    const sp = document.querySelector('.dccwl-gp-spot-name span[aria-hidden]');
    return { pairs: [c[0] === c[1], c[2] === c[3]], weights: [getComputedStyle(sp.parentNode).fontWeight, getComputedStyle(sp).fontWeight] };
  });
  checkSame([true, true], look.pairs, 'each pair of cards ends level, even where a name wraps');
  checkSame(look.weights[0], look.weights[1], '"· Keep Away" is at the name\'s own weight, as in the still');

  section(`${w}: the list box`);
  const box = await page.evaluate(() => {
    const l = document.querySelector('[data-dccwl-gp-list]');
    const cs = getComputedStyle(l);
    const b = l.getBoundingClientRect();
    return {
      h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom), vh: window.innerHeight,
      overflow: cs.overflowY, overscroll: cs.overscrollBehaviorY,
      mask: cs.maskImage || cs.webkitMaskImage || '',
    };
  });
  note(`list box ${JSON.stringify(box)}`);
  checkSame('auto', box.overflow, 'the list scrolls inside its own box from the first paint');
  checkSame('auto', box.overscroll, 'and sets no overscroll-behavior, so it can never trap the wheel');
  check(/linear-gradient/.test(box.mask), 'its bottom edge fades — the cue that it scrolls', box.mask);
  checkAtMost(Math.round(0.7 * h) + 1, box.h, 'and it is the 70vh box');

  /* ---- the wheel, DOWN: list first, then the page ---- */
  section(`${w}: the wheel passes through the box, downwards`);
  await page.evaluate(() => window.scrollTo(0, 0));
  let s0 = await state(page);
  await wheel(page, 300);
  let s1 = await state(page);
  check(s1.top > s0.top, 'a wheel over the list scrolls the list', `${s0.top} -> ${s1.top}`);
  checkSame(s0.y, s1.y, 'and not the page while the list has further to go');
  await page.evaluate(() => { const l = document.querySelector('[data-dccwl-gp-list]'); l.scrollTop = l.scrollHeight - l.clientHeight - 120; });
  await page.waitForTimeout(150);
  for (let i = 0; i < 4; i++) { await wheel(page, 300); }
  const s2 = await state(page);
  note(`at the end ${JSON.stringify(s2)}`);
  check(s2.top >= s2.max - 2, 'the wheel carries the list to its end');
  check(s2.end, 'where the fade is dropped — nothing more to cue');
  check(s2.y > s0.y, 'AND THEN THE PAGE SCROLLS ON: no wheel trap at the bottom', `page y ${s0.y} -> ${s2.y}`);

  /* ---- the wheel, UP: list first, then the page ---- */
  section(`${w}: the wheel passes through the box, upwards`);
  await page.evaluate(() => { document.querySelector('[data-dccwl-gp-list]').scrollTop = 200; });
  await page.waitForTimeout(150);
  const u0 = await state(page);
  check(u0.y > 0, 'starting with the page scrolled down', String(u0.y));
  await wheel(page, -120);
  const u1 = await state(page);
  check(u1.top < u0.top, 'a wheel up over the list scrolls the list up', `${u0.top} -> ${u1.top}`);
  checkSame(u0.y, u1.y, 'and leaves the page alone while the list has further to go');
  for (let i = 0; i < 4; i++) { await wheel(page, -300); }
  const u2 = await state(page);
  checkSame(0, u2.top, 'the list reaches its top');
  check(u2.y < u0.y, 'AND THEN THE PAGE SCROLLS UP: no wheel trap at the top', `page y ${u0.y} -> ${u2.y}`);

  /* ---- the keyboard inside the box ---- */
  section(`${w}: the keyboard inside the box, and out of it`);
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('[data-dccwl-gp-list]').scrollTop = 0; });
  await page.evaluate(() => document.querySelector('[data-dccwl-gp-item]:not([hidden]) .dccwl-gp-row').focus());
  const k0 = await state(page);
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(400);
  const k1 = await state(page);
  check(k1.top > k0.top, 'Page Down scrolls the list it is in', `${k0.top} -> ${k1.top}`);
  checkSame(k0.y, k1.y, 'not the page');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(300);
  const k2 = await state(page);
  check(k2.top > k1.top, 'and so does the down arrow', `${k1.top} -> ${k2.top}`);

  await page.evaluate(() => {
    const rows = document.querySelectorAll('[data-dccwl-gp-item]:not([hidden]) .dccwl-gp-row');
    rows[rows.length - 1].focus();
  });
  await page.keyboard.press('Tab');
  const t1 = await page.evaluate(() => ({ cls: document.activeElement.className, text: document.activeElement.textContent.replace(/\s+/g, ' ').trim() }));
  await page.keyboard.press('Tab');
  const t2 = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) }));
  note(`tab from the last row: ${JSON.stringify(t1)} then ${JSON.stringify(t2)}`);
  checkSame('Back To Explore', t1.text, 'Tab from the LAST row leaves the box for "Back To Explore"');
  check(/^SUMMARY$/.test(t2.tag) && /^Photo Credits \(\d+\)/.test(t2.text), 'and the next Tab is the credits summary', JSON.stringify(t2));

  /* ---- the cards by keyboard: reached early, ringed, and they open ---- */
  section(`${w}: the cards, by keyboard and by mouse`);
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('[data-dccwl-gp-group="all"]').focus(); });
  let steps = 0;
  let onCard = false;
  for (; steps < 20; steps++) {
    await page.keyboard.press('Tab');
    const a = await page.evaluate(() => ({
      card: !!document.activeElement.closest('[data-dccwl-gp-spot-key]'),
      row: !!document.activeElement.closest('[data-dccwl-gp-item]'),
    }));
    if (a.row) { break; }
    if (a.card) { onCard = true; break; }
  }
  check(onCard, 'Tab reaches the first card after the pills and BEFORE any list row', `${steps + 1} presses`);
  const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { style: cs.outlineStyle, width: cs.outlineWidth }; });
  checkSame({ style: 'solid', width: '3px' }, ring, 'with a visible 3px focus ring');

  const before = await state(page);
  const cls = await page.evaluate(() => new Promise((resolve) => {
    let sum = 0;
    let any = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { any += e.value; if (!e.hadRecentInput) { sum += e.value; } } })
      .observe({ type: 'layout-shift', buffered: false });
    window.__shift = () => ({ sum, any });
    resolve(true);
  }));
  check(cls, 'a layout-shift observer is listening');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const after = await state(page);
  const opened = await page.evaluate(() => ({
    name: (document.querySelector('[data-dccwl-gp-pane] .dccwl-fg-name') || {}).childNodes[0]?.textContent?.trim(),
    focus: document.activeElement === document.querySelector('[data-dccwl-gp-pane]'),
    hash: window.location.hash,
    shift: window.__shift(),
  }));
  note(`after Enter on the first card: ${JSON.stringify({ before, after, opened })}`);
  checkSame('Alligator', opened.name, 'Enter on the alligator card opens the alligator IN THE PANE');
  checkSame(before.list, after.list, 'the list does not move');
  checkSame(before.pane, after.pane, 'the pane keeps its place and width (it only grows downward)');
  checkSame(before.y, after.y, 'the page does not scroll');
  checkSame('', opened.hash, 'no hash jump');
  check(opened.focus, 'focus moves to the pane, since the card it was on is gone');
  /* CLS proper counts only shifts NOT within 500 ms of input. The raw
   * figure (the opened species' photo arriving and pushing its text down,
   * inside the pane) is reported alongside, because on a slow connection a
   * photo later than half a second would count. */
  checkSame(0, Math.round(opened.shift.sum * 1000) / 1000, 'CLS on the first open is 0');
  note(`raw shift inside the input window: ${Math.round(opened.shift.any * 1000) / 1000}`);

  /* A tap on a row replaces whatever is in the pane, and the label follows. */
  await page.evaluate(() => document.querySelector('[data-key="anhinga"] .dccwl-gp-row').click());
  await page.waitForTimeout(500);
  const row = await page.evaluate(() => ({
    name: (document.querySelector('[data-dccwl-gp-pane] .dccwl-fg-name') || {}).childNodes[0]?.textContent?.trim(),
    label: document.querySelector('[data-dccwl-gp-pane]').getAttribute('aria-label'),
    spot: !!document.querySelector('[data-dccwl-gp-pane] [data-dccwl-gp-spot]'),
  }));
  checkSame({ name: 'Anhinga', label: 'The species you chose', spot: false }, row,
    'a row replaces the spotlight, and the pane is "the species you chose" again');
  await page.close();
}

/* ====================================================================== */
section('a mouse click on a card');
{
  const page = await guide(1440, 900);
  /* Playwright scrolls a target into view before clicking, so the card is
   * brought into view FIRST and the "before" is taken after that. */
  await page.evaluate(() => document.querySelector('[data-dccwl-gp-spot-key="heron"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const before = await state(page);
  await page.click('[data-dccwl-gp-spot-key="heron"]');
  await page.waitForTimeout(700);
  const after = await state(page);
  const name = await page.evaluate(() => document.querySelector('[data-dccwl-gp-pane] .dccwl-fg-name')?.childNodes[0]?.textContent?.trim());
  checkSame('Great Blue Heron', name, 'clicking the heron card opens the heron in the pane');
  checkSame([before.y, before.list, before.pane], [after.y, after.list, after.pane], 'and nothing moves');
  await page.close();
}

/* ====================================================================== */
section('scrolled to the very bottom, opening a card moves nothing');
{
  /* The page is short now, and the opened species' photo has no height
   * until it loads: without the pane holding its height, the page lost
   * height under a guest at the bottom and was clamped up 23px. */
  const page = await guide(1440, 900);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const before = await state(page);
  await page.evaluate(() => document.querySelector('[data-dccwl-gp-spot-key="heron"]').click());
  await page.waitForTimeout(900);
  const after = await state(page);
  note(`bottom ${JSON.stringify({ before, after })}`);
  check(before.y > 0, 'the page was scrolled to its bottom', String(before.y));
  checkSame([before.y, before.list, before.pane], [after.y, after.list, after.pane], 'and opening the heron moved neither the page nor the two columns');
  await page.close();
}

/* ====================================================================== */
section('the fade goes when the list is short enough to fit');
{
  const page = await guide(1440, 900);
  checkSame(false, (await state(page)).end, 'with 395 rows the bottom edge fades');
  await page.fill('[data-dccwl-gp-search]', 'alligator');
  await page.waitForTimeout(400);
  checkSame(true, (await state(page)).end, 'searching down to one row drops the fade');
  await page.close();
}

/* ====================================================================== */
section('a wider window with nothing open gets the spotlight back');
{
  const page = await guide(820, 900, { touch: false });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(500);
  const keys = await page.evaluate(() => [...document.querySelectorAll('[data-dccwl-gp-pane] [data-dccwl-gp-spot-key]')]
    .filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.getAttribute('data-dccwl-gp-spot-key')));
  checkSame(FOUR, keys, 'narrow to wide shows "Most Recorded Here"');
  await page.close();
}

/* ====================================================================== */
section('#credits opens the folded credits');
{
  const page = await guide(1440, 900);
  const closed = await page.evaluate(() => {
    const d = document.getElementById('credits');
    const h = d.querySelector('.dccwl-fullguide-h').getBoundingClientRect();
    const b = d.getBoundingClientRect();
    return { open: d.open, label: d.querySelector('summary').textContent.replace(/\s+/g, ' ').trim(), off: Math.round((h.left + h.width / 2) - (b.left + b.width / 2)) };
  });
  note(`closed ${JSON.stringify(closed)}`);
  checkSame(false, closed.open, 'with no hash the credits arrive folded');
  checkSame('Photo Credits (401) Who took each photograph, and where it came from', closed.label, 'under "Photo Credits (401)" and its line');
  checkAtMost(40, Math.abs(closed.off), 'centred (the label sits at the middle, the chevron beside it)');

  await page.evaluate(() => { window.location.hash = '#credits'; });
  await page.waitForTimeout(500);
  checkSame(true, await page.evaluate(() => document.getElementById('credits').open), 'a hashchange to #credits opens them');
  await page.close();
}
{
  /* Arriving with the hash — the explore widget's Photo Credits link — is
   * a different code path: the hash is in the URL before guide.js runs. */
  for (const w of [390, 1440]) {
    const { page } = await widgetPage(browser, 'guide', { width: w, height: 844, sitekit: true, touch: w < 900, js: [] });
    await page.evaluate(() => { window.location.hash = '#credits'; document.getElementById('credits').scrollIntoView(); });
    for (const f of ['assets/js/sheet.js', 'assets/js/guide.js']) { await page.addScriptTag({ content: asset(f) }); }
    await page.waitForTimeout(700);
    const got = await page.evaluate(() => {
      const d = document.getElementById('credits');
      const r = d.getBoundingClientRect();
      return { open: d.open, inView: r.top < window.innerHeight && r.bottom > 0, items: d.querySelectorAll('li').length };
    });
    note(`arrival at ${w} ${JSON.stringify(got)}`);
    checkSame(true, got.open, `arriving at ${w} with #credits opens them`);
    check(got.inView, 'and they are on screen');
    checkSame(401, got.items, 'every credit is there');
    await page.close();
  }
}

/* ====================================================================== */
section('below 900px nothing of this exists');
for (const [w, h] of [[390, 844], [768, 1024]]) {
  const page = await guide(w, h);
  const s = await page.evaluate(() => {
    const pane = document.querySelector('[data-dccwl-gp-pane]');
    const l = document.querySelector('[data-dccwl-gp-list]');
    return { pane: getComputedStyle(pane).display, maxH: getComputedStyle(l).maxHeight, overflow: getComputedStyle(l).overflowY, mask: getComputedStyle(l).maskImage || 'none' };
  });
  checkSame({ pane: 'none', maxH: 'none', overflow: 'visible', mask: 'none' }, s, `at ${w}: no pane, and the list is the page — no box, no fade`);
  await page.evaluate(() => document.querySelector('[data-key="anhinga"] .dccwl-gp-row').click());
  await page.waitForTimeout(700);
  checkSame('Anhinga', await page.evaluate(() => document.querySelector('.dccwl-sheet-title')?.textContent?.trim()), `and a row still opens the sheet at ${w}`);
  await page.close();
}

/* ====================================================================== */
section('every width: one visible h1, no sideways scroll');
for (const [w, h] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
  const page = await guide(w, h);
  const h1 = await page.evaluate(() => [...document.querySelectorAll('h1')].filter((e) => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && 'hidden' !== cs.visibility;
  }).length);
  checkSame(1, h1, `exactly one visible h1 at ${w}`);
  checkAtMost(0, await horizontalOverflow(page), `no sideways scroll at ${w}`);
  await page.close();
}

await browser.close();
done();
