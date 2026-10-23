/**
 * LIVE CONDITIONS (1.38.0). The suite that exists because 1.37.x was green
 * here and wrong on Rob's phone.
 *
 * Three things every assertion in this file runs under, and the reason each
 * one is here:
 *
 *  - THE HOST KIT AND THE HOSTILE ROOT. Bravada's Elementor kit resets
 *    buttons and inputs at (0,3,1) and the site serves html{font-size:20px;
 *    font-weight:700}. A rule that wins on a bare page can lose on the real
 *    one. (sitekit.css is this repo's stand-in for that kit, not a copy of
 *    the live file — it reproduces the resets that have actually bitten us.)
 *  - 390px WITH REAL TOUCH. hasTouch, isMobile, and page.tap(), so a tapped
 *    button KEEPS :hover and :focus the way it does on iOS. Item 8 was dark
 *    only in that state, which no click in a desktop context can produce.
 *  - 1280px WITH A MOUSE. hasTouch off, so the desktop case is the desktop
 *    case and not a phone in a wide window.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openInlineMap,
  launch, widgetPage, buildPage, rendered, asset, openWildlife,
  check, checkSame, checkAtLeast, checkAtMost, section, note, done, skipSuite,
} from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const browser = await launch();
if (!browser) { skipSuite('no chromium'); }

const WHITE = 'rgb(255, 255, 255)';
const CORAL = 'rgb(240, 128, 128)';
/* `--staff-header` on the Availability Calendar's branch: the blue its
 * segmented switch is built from, and ours since item 5 of 1.44.2. */
const HEADER = 'rgb(10, 80, 178)';

/*
 * The first VISIBLE match, not the first match. A hidden ancestor does not
 * put `hidden` on its descendants, so `:not([hidden])` happily returns a
 * control nobody can see — and Playwright then waits 30s to tap it. Asking
 * the page what is visible is the same question the guest's finger asks.
 */
async function visible(page, selector) {
  for (const h of await page.$$(selector)) {
    if (await h.isVisible()) { return h; }
  }
  return null;
}

/* ============================ A8 ============================ */
section('A8 — a selected control is WHITE after a real tap, not just at rest');

for (const [w, touch] of [[390, true], [1280, false]]) {
  const h = await widgetPage(browser, 'canal', { width: w, height: 900, sitekit: true, touch });
  const page = h.page;
  await openWildlife(page);
  await page.waitForTimeout(700);

  /*
   * SCOPED TO THE SPECIES PANEL SINCE 1.44.0. The water panel's Map/Now/
   * Fishing bar uses `.dccwl-tab` too, and with the hub gone Water is FIRST
   * in the DOM — so an unscoped query returned a tab inside the hidden water
   * panel and the tap waited 30s for something that is display:none. The
   * section is about the species tabs; say so in the selector.
   */
  /* `aria-selected` since 1.44.0: the species tabs are a real tablist. The
   * water bar in the same document is still `role="group"` and reports
   * `aria-pressed`, which is why this stayed scoped to the species panel. */
  /*
   * READ THE RESTING SELECTED TAB BEFORE ANYTHING IS TAPPED. After a tap the
   * tapped tab is focused, so :focus-visible may legitimately be in play and
   * the reading would not answer item 10's question. The species panel's
   * first tab is selected by the renderer and nobody has touched it.
   */
  const restingTab = await page.evaluate(() => {
    const out = {};
    [['species', '[data-dccwl-panel="species"] .dccwl-tab[aria-selected="true"]'],
     ['water', '.dccwl-water-tabs .dccwl-tab[aria-pressed="true"]']].forEach((row) => {
      const t = document.querySelector(row[1]);
      if (!t) { return; }
      const cs = getComputedStyle(t);
      out[row[0]] = { bg: cs.backgroundColor, shadow: cs.boxShadow, focused: document.activeElement === t };
    });
    return out;
  });
  note(`${w}px resting selected tabs ${JSON.stringify(restingTab)}`);

  const tab = await page.$('[data-dccwl-panel="species"] .dccwl-tab:not([aria-selected="true"])');
  if (touch) { await tab.tap(); } else { await tab.click(); }
  await page.waitForTimeout(250);

  const after = await page.evaluate(() => {
    const t = document.querySelector('[data-dccwl-panel="species"] .dccwl-tab[aria-selected="true"]');
    const cs = getComputedStyle(t);
    return { label: t.textContent.trim(), bg: cs.backgroundColor, fg: cs.color,
             focused: document.activeElement === t };
  });
  note(`${w}px ${touch ? 'touch' : 'mouse'} ${JSON.stringify(after)}`);
  /* ITEM 5 (1.44.2): the segmented switch is the Availability Calendar's, so
   * a chosen segment is SOLID #0A50B2 with white text. Coral is hover only
   * now, and the item-8 claim this section exists for is unchanged and still
   * the reason for the real tap: a tapped segment must not be repainted by a
   * :hover or :focus rule that outlives the finger. */
  /*
   * AND THE EXPECTED FILL DEPENDS ON THE POINTER, WHICH IS NOT A HEDGE.
   * On the touch page the finger has gone and the resting selected fill is
   * what must show — that is item 8's whole claim. On the mouse page the
   * pointer is genuinely still over the segment after `click()`, so the
   * Calendar's `(hover: hover)` rule applies and coral is CORRECT there.
   * Asserting one value for both would have to be wrong on one of them.
   */
  checkSame(touch ? HEADER : CORAL, after.bg,
    `${w}px: the tapped tab is ${touch ? 'solid #0A50B2' : 'coral under the pointer'}`);
  checkSame(WHITE, after.fg, `${w}px: and its label is WHITE immediately after the tap`);

  /*
   * ITEM 10 (1.44.1) — THE SELECTED SEGMENT IS A RESTING STATE, AND NOTHING
   * ELSE IS LEFT ON IT.
   *
   * The Director asked us to "confirm that the selected segment (Map,
   * Animals: coral fill, gold edge) is exactly the Calendar's selected
   * segment, not a hover state left on". Read on a tab NOBODY has touched,
   * so neither :hover nor :focus-visible can be in play: it must carry the
   * coral fill and the 2px inset gold edge, and NOT the focus ring.
   */
  for (const bar of Object.keys(restingTab)) {
    const r = restingTab[bar];
    checkSame(false, r.focused, `${w}px: the ${bar} bar's selected tab is untouched`);
    checkSame(HEADER, r.bg, `${w}px: and solid #0A50B2 at rest (${bar})`);
    /* The gold inset mark went with the coral (item 5): the Calendar
     * separates the states by FILL. What must still not be on a resting
     * segment is the FOCUS RING, which is the 1.44.1 defect this check was
     * written for and the reason it stays. */
    check(!/rgba\(0, 107, 207/.test(r.shadow || ''),
      `${w}px: and NOT the focus ring — nothing left on it (${bar})`, r.shadow || '');
    check(!/244, 218, 98/.test(r.shadow || ''),
      `${w}px: and no gold mark — the fill is the state now (${bar})`, r.shadow || '');
  }

  /*
   * THE MONTH PILLS AND THE COMPACT SWITCH BOTH LEFT IN 1.44.0, so item 8 is
   * asserted here on the controls that remain and on the one that replaced
   * them. What the item claims is unchanged and is the reason for the tap:
   * ON A PHONE A TAPPED BUTTON KEEPS :hover AND :focus until the guest
   * touches something else, so a focus rule painting the label dark is
   * invisible with a mouse and glaring on the phone Rob was holding.
   *
   * The Month chip's CHOSEN OPTION is the pill-option's own rule (they share
   * one block in widget.css), tapped open below with the category pill.
   */

  /* Back to the first section, whose row carries the category pill. */
  await page.evaluate(() => {
    document.querySelectorAll('[data-dccwl-panel="species"] .dccwl-tab')[0].click();
  });
  await page.waitForTimeout(500);

  /* THE MONTH CHIP, tapped: its chosen option must be coral and white in the
   * state a finger leaves it in — the same question the Compact switch used
   * to answer on this row. */
  const monthChip = await visible(page, '[data-dccwl-monthbtn]');
  if (monthChip) {
    if (touch) { await monthChip.tap(); } else { await monthChip.click(); }
    await page.waitForTimeout(250);
    const ms = await page.evaluate(() => {
      const o = document.querySelector('li[aria-selected="true"] > [data-dccwl-month]');
      const s = getComputedStyle(o);
      return { month: o.getAttribute('data-dccwl-month'), bg: s.backgroundColor, fg: s.color };
    });
    note(`${w}px month chip ${JSON.stringify(ms)}`);
    checkSame('any', ms.month, `${w}px: the chip opens on Any Month, the default`);
    checkSame(CORAL, ms.bg, `${w}px: and the chosen option is coral`);
    checkSame(WHITE, ms.fg, `${w}px: with WHITE text straight after the tap`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }

  /* And the picker's chosen option, read while the list is open from a tap —
   * the state a phone actually leaves a control in. */
  const pill = await visible(page, '[data-dccwl-subnav] [data-dccwl-pick-btn]');
  if (pill) {
    if (touch) { await pill.tap(); } else { await pill.click(); }
    await page.waitForTimeout(200);
    /*
     * A VISIBLE OPTION, NOT A NAMED ONE. This hard-coded
     * `[data-dccwl-browse="birds"]`, which is only in the Animals picker —
     * and the step above deliberately taps the first UNPRESSED tab, so the
     * open tab here is Plants or Safety and the birds row is hidden. The tap
     * then waited 30s for an element that is display:none.
     *
     * The claim is about the CHOSEN option's colours after real taps, not
     * about which category it is, so take whichever row this tab actually
     * offers. ui-deck.mjs is where per-category membership is asserted.
     */
    const opt = await visible(page, '.dccwl-pick-opt[data-dccwl-browse]:not([aria-selected="true"])');
    check(!!opt, `${w}px: the open picker offers a category to choose`);
    if (!opt) { await page.close(); continue; }
    if (touch) { await opt.tap(); } else { await opt.click(); }
    await page.waitForTimeout(400);
    if (touch) { await pill.tap(); } else { await pill.click(); }
    await page.waitForTimeout(250);
    const chosen = await page.evaluate(() => {
      const o = document.querySelector('.dccwl-pick-opt[aria-selected="true"]');
      const s = getComputedStyle(o);
      return { name: o.textContent.trim().replace(/\s+/g, ' '), bg: s.backgroundColor, fg: s.color };
    });
    note(`${w}px chosen ${JSON.stringify(chosen)}`);
    checkSame(CORAL, chosen.bg, `${w}px: the chosen category is coral in the open list`);
    checkSame(WHITE, chosen.fg, `${w}px: with white text, after real taps`);
  }
  await page.close();
}

/* ====================== ITEMS 8 AND 9: THE CHIP ROW ====================== */
/*
 * ITEM 8 — THE WEIGHT IS ASSERTED ON THE LABEL SPAN, NOT ON THE BUTTON.
 *
 * The Director: "`.dccwl-viewselect-trigger` computes 700, but its
 * `.dccwl-viewselect-label` span computes 400... Find the rule that sets the
 * span to 400, beat it with your prefix, and assert the computed weight on
 * the LABEL SPAN, not the button."
 *
 * The rule was `.dccwl-app span` in app.css's type floor (0,1,1), which has
 * set 400 since 1.27.0 — the layer that stopped the whole guide rendering
 * bold on a 700 root. It reaches a chip's inner span directly, and
 * inheritance from the button loses to it. Which is why the Badges chip
 * looked right all along: its label is a bare TEXT NODE with no span to
 * catch.
 *
 * So every label span now declares `font-weight: inherit`, and this section
 * reads the SPAN. A test that read the button passed throughout.
 *
 * ITEM 9 — AND THE ROW HAS TO FIT, IN RALEWAY.
 *
 * "The chip row doesn't fit at 390px with Raleway... Make the three sit
 * together, centred, on one row at 390px, and wrap as a centred group at
 * 360px. Test with the real font metrics (load Raleway in the harness, or
 * assert widths with a wider fallback)."
 *
 * There is no Raleway in this container and no network to fetch one, so this
 * takes the second option, which is the trick the tab-row and map-bar suites
 * already use: INFLATE THE ROW'S FONT BY 25% and require it to fit anyway.
 * Raleway runs about 21% wider than the face this sandbox falls back to, so
 * 25% covers it with a little over. That is a stand-in, not the site — said
 * plainly because the footnote row passed here at 361px and wrapped at 393px
 * on live, and that is the whole reason this method exists.
 */
section('items 8 and 9 — the chip labels declare a weight, and the row fits');

for (const [w, touch] of [[390, true], [360, true], [1280, false]]) {
  const h = await widgetPage(browser, 'canal', { width: w, height: 1000, sitekit: true, touch });
  const page = h.page;
  await openWildlife(page);
  await page.waitForTimeout(800);

  /* ---- item 8: every label span, against its own button --------------- */
  const weights = await page.evaluate(() => {
    const out = [];
    const add = (name, btnSel, spanSel) => {
      const btn = document.querySelector(btnSel);
      if (!btn || !btn.getClientRects().length) { return; }
      const span = spanSel ? btn.querySelector(spanSel) : null;
      out.push({
        name,
        button: getComputedStyle(btn).fontWeight,
        span: span ? getComputedStyle(span).fontWeight : null,
        text: (span || btn).textContent.replace(/\s+/g, ' ').trim(),
      });
    };
    add('month chip', '[data-dccwl-monthbtn]', '.dccwl-chip-label');
    add('show pill', '[data-dccwl-pick-btn]', '.dccwl-pick-label');
    add('show value', '[data-dccwl-pick-btn]', '.dccwl-pick-value');
    add('view dropdown', '[data-dccwl-viewtrigger]', '.dccwl-viewselect-label');
    return out;
  });
  note(`${w}px weights ${JSON.stringify(weights)}`);
  checkAtLeast(3, weights.length, `${w}px: the labelled controls are on the page`);
  for (const row of weights) {
    checkSame(row.button, row.span,
      `${w}px: the ${row.name}'s label span carries the button's own weight`,
      `button ${row.button}, span ${row.span}, "${row.text}"`);
  }

  /*
   * ---- item 2: Badges is a round, icon-only chip ----------------------
   *
   * Rob: "'Badges' becomes a round ⓘ-only chip. It's the same chip (white,
   * 1px #F4DA62), a 44px circle, aria-label="Badges" and the same popover."
   * All four halves are asked: the geometry, the shared chip skin, the
   * accessible NAME (an aria-label replaces a control's text, so a missing
   * one leaves the button announced as nothing — the 1.15.1 lesson), and
   * that the popover it opens is the same one.
   */
  const badge = await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-badges]');
    if (!b) { return { error: 'no badges chip' }; }
    const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      radius: cs.borderTopLeftRadius,
      bg: cs.backgroundColor,
      border: cs.borderTopWidth + ' ' + cs.borderTopColor,
      label: b.getAttribute('aria-label'),
      text: b.textContent.replace(/\s+/g, ' ').trim(),
      controls: b.getAttribute('aria-controls'),
      expanded: b.getAttribute('aria-expanded'),
      glyphHidden: !!b.querySelector('.dccwl-chip-i[aria-hidden="true"]'),
    };
  });
  note(`${w}px badges ${JSON.stringify(badge)}`);
  check(!badge.error, `${w}px: the Badges chip is on the row`, badge.error || '');
  checkSame(44, badge.w, `${w}px: it is 44px wide`);
  checkSame(44, badge.h, `${w}px: and 44px tall`);
  checkSame('50%', badge.radius, `${w}px: a circle, not a pill`);
  checkSame('rgb(255, 255, 255)', badge.bg, `${w}px: still the Selector's white chip`);
  checkSame('1px rgb(244, 218, 98)', badge.border, `${w}px: with its gold edge`);
  checkSame('Badges', badge.label, `${w}px: and its name in aria-label`);
  check(!/Badges/.test(badge.text),
    `${w}px: the word itself is gone from the button`, badge.text);
  checkSame(true, badge.glyphHidden,
    `${w}px: the ⓘ is aria-hidden — it is the picture of the name, not the name`);
  checkSame('dccwl-badgekey', badge.controls, `${w}px: it still owns the badge key`);

  /* The same popover, opened by a real tap. */
  const bEl = await page.$('[data-dccwl-badges]');
  await page.evaluate(() => {
    document.querySelector('[data-dccwl-badges]').scrollIntoView({ block: 'center' });
  });
  if (touch) { await bEl.tap(); } else { await bEl.click(); }
  await page.waitForTimeout(250);
  const opened = await page.evaluate(() => {
    const key = document.getElementById('dccwl-badgekey');
    return {
      shown: !!key && !key.hidden && key.getClientRects().length > 0,
      expanded: document.querySelector('[data-dccwl-badges]').getAttribute('aria-expanded'),
      items: key ? key.querySelectorAll('.dccwl-legend-item').length : 0,
    };
  });
  note(`${w}px badge key ${JSON.stringify(opened)}`);
  checkSame(true, opened.shown, `${w}px: the badge key opens from the round chip`);
  checkSame('true', opened.expanded, `${w}px: and the chip says so`);
  checkAtLeast(4, opened.items, `${w}px: with every flag still explained`);
  if (touch) { await bEl.tap(); } else { await bEl.click(); }
  await page.waitForTimeout(200);

  /* ---- item 9: the row, with the font inflated to stand in for Raleway -- */
  /*
   * AND IN THE LIVE CONTAINER'S WIDTH, NOT THE VIEWPORT'S (item 3, 1.44.2).
   *
   * The Director: "the chip row's container is 334px wide, not 374px (the
   * Elementor column's padding)". So the row's parent is squeezed to what he
   * measured before anything is read — 334px at 390 and 304px at 360.
   *
   * Together with the 25% inflation this is very close to the real thing: his
   * live Raleway widths are Month 118, Show 107, Badges 103, and this fixture
   * at 125% measures 118, 108 and 104. The stand-in is a stand-in, but it is
   * landing within a pixel of the face it stands in for.
   */
  const CONTAINER = { 390: 334, 360: 304, 1280: 760 };
  await page.evaluate((px) => {
    const rowEl = document.querySelector('.dccwl-chiprow');
    if (!rowEl) { return; }
    rowEl.parentElement.style.maxWidth = px + 'px';
    rowEl.parentElement.style.marginLeft = 'auto';
    rowEl.parentElement.style.marginRight = 'auto';
  }, CONTAINER[w]);
  await page.waitForTimeout(250);

  const row = await page.evaluate(() => {
    const rowEl = document.querySelector('.dccwl-chiprow');
    if (!rowEl) { return { error: 'no chip row' }; }
    /* 125% of whatever the row inherits. Set on the ROW so every chip, its
     * label and its caret grow together — a chip sized from a token would
     * otherwise keep its own size and the measurement would prove nothing. */
    const prev = rowEl.style.fontSize;
    rowEl.style.fontSize = '125%';
    /* Read after a layout, and read the CONTROLS rather than the row: the
     * row is a wrapping flex container and its own height says nothing
     * about how many lines its items took. */
    /* VISIBLE ONLY. There is one category pill per SECTION and the two that
     * are not showing are still in the row's subtree at zero width — the
     * first run of this check reported five chips on three lines because of
     * them, which is the same mistake `visible()` exists for at the top of
     * this file. */
    const items = Array.from(rowEl.querySelectorAll(
      '[data-dccwl-monthbtn], [data-dccwl-pick-btn], [data-dccwl-badges]'
    )).filter((el) => el.getClientRects().length > 0);
    const boxes = items.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left),
               right: Math.round(r.right), w: Math.round(r.width),
               h: Math.round(r.height * 100) / 100,
               exact: Math.round(r.top * 100) / 100,
               label: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 14) };
    });
    /* Grouped with a 2px tolerance, so a half-pixel cannot be reported as a
     * second row — the vertical alignment has its own assertion below, and
     * conflating the two produced a failure message about wrapping for what
     * was really a 1.16px offset. */
    const lines = {};
    boxes.forEach((b) => {
      const key = Object.keys(lines).find((k) => Math.abs(Number(k) - b.top) <= 2);
      const k = undefined === key ? String(b.top) : key;
      lines[k] = lines[k] || { left: Infinity, right: -Infinity, n: 0 };
      lines[k].left = Math.min(lines[k].left, b.left);
      lines[k].right = Math.max(lines[k].right, b.right);
      lines[k].n += 1;
    });
    const rr = rowEl.getBoundingClientRect();
    const rowMid = rr.left + rr.width / 2;
    /* THE GAPS BETWEEN NEIGHBOURS, against the row's own column-gap. "Centred
     * as one group" is not the same claim as "the line is centred": an auto
     * margin on a flex item absorbs the whole line's slack and pushes its
     * neighbours to the two edges, and the LINE still measures centred. That
     * is exactly what `margin-inline: auto` on `.dccwl-subnav` was doing, so
     * the check that catches it has to look between the chips. */
    const sorted = boxes.slice().sort((a, b) => a.left - b.left);
    const gaps = [];
    for (let i = 1; i < sorted.length; i += 1) {
      if (Math.abs(sorted[i].top - sorted[i - 1].top) > 2) { continue; }
      gaps.push(Math.round((sorted[i].left - sorted[i - 1].right) * 10) / 10);
    }
    const out = {
      chips: boxes.length,
      widths: boxes.map((b) => `${b.label}=${b.w}x${b.h}@${b.exact}`),
      /* The sub-pixel question, separately: do all three share a top? */
      topSpread: Math.round((Math.max(...boxes.map((b) => b.exact)) -
        Math.min(...boxes.map((b) => b.exact))) * 100) / 100,
      lineCount: Object.keys(lines).length,
      lineOffsets: Object.keys(lines).map((k) => Math.round(
        ((lines[k].left + lines[k].right) / 2) - rowMid)),
      gaps,
      declaredGap: Math.round(parseFloat(getComputedStyle(rowEl).columnGap) * 10) / 10,
      pageW: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      rowW: Math.round(rr.width),
      needed: boxes.reduce((a, b) => a + b.w, 0),
    };
    rowEl.style.fontSize = prev;
    return out;
  });
  note(`${w}px row ${JSON.stringify(row)}`);
  check(!row.error, `${w}px: the chip row is on the page`, row.error || '');
  checkSame(3, row.chips, `${w}px: three chips — Month, Show and Badges`);
  /*
   * ALL THREE ON ONE BASELINE, TO THE HALF PIXEL. Two of them sit inside a
   * wrapper div that carries their menu's `position: relative`, and as
   * BLOCKS those wrappers built a line box around a 44px chip — about
   * 46.3px — so the row centred the wrapper and dropped those two 1.16px
   * below the Badges chip, which has no wrapper. Rob measures this kind of
   * thing (the 1.35.0 baseline was 0.9px), so it has its own check rather
   * than being swallowed by the row-count tolerance.
   */
  checkAtMost(0.5, row.topSpread,
    `${w}px: and all three sit on one line, to the half pixel`,
    `${row.topSpread}px between the highest and the lowest`);
  checkAtMost(row.viewport, row.pageW,
    `${w}px: and no horizontal overflow at 125% of the face`);
  /* Every line of the group is centred on the row, at every width — that is
   * the "centred group" half of the item. */
  check((row.lineOffsets || []).every((o) => Math.abs(o) <= 2),
    `${w}px: each line of the group is centred`, JSON.stringify(row.lineOffsets));
  checkSame(CONTAINER[w], row.rowW,
    `${w}px: measured in the live container's width, not the viewport's`);
  /* ITEM 3: THE THREE SIT TOGETHER. The Director found Month and Show at
   * opposite edges of line one. Every neighbouring pair must be exactly the
   * row's own gap apart — nothing may absorb the slack between them. */
  check((row.gaps || []).length > 0, `${w}px: the chips have neighbours to measure`);
  check((row.gaps || []).every((g) => Math.abs(g - row.declaredGap) <= 1),
    `${w}px: every pair sits the row's own ${row.declaredGap}px apart — they are a group`,
    JSON.stringify(row.gaps));
  if (390 <= w) {
    checkSame(1, row.lineCount,
      `${w}px: all three sit on ONE row in a ${CONTAINER[w]}px container`,
      JSON.stringify(row.widths));
  } else {
    /* 360px: Rob allows the group to wrap here, and it must still centre.
     * It happens to fit on one line with the round ⓘ chip, which is better
     * than asked for — so this asserts what he required (no spill, centred)
     * rather than pinning a line count he left open. */
    checkAtLeast(1, row.lineCount, `${w}px: the row wraps rather than spilling`);
  }

  await page.close();
}

/* ============================ C: the picker ============================ */
section('C — one pill, "Show: All ▾", that filters the deck');

for (const [w, touch] of [[390, true], [1280, false]]) {
  const h = await widgetPage(browser, 'canal', { width: w, height: 1000, sitekit: true, touch });
  const page = h.page;
  await openWildlife(page);
  await page.waitForTimeout(800);

  const base = await page.evaluate(() => {
    const nav = document.querySelector('[data-dccwl-subnav]:not([hidden])');
    const btn = nav && nav.querySelector('[data-dccwl-pick-btn]');
    const list = nav && nav.querySelector('[data-dccwl-pick-list]');
    const r = btn && btn.getBoundingClientRect();
    /* C6 WAS "the pill and Compact share one row". The Compact switch is
     * gone (1.44.0) and the row grew: Month ▾ and the ⓘ Badges chip share
     * it now, which is Rob's one-control-row instruction. Measured against
     * the MONTH CHIP, because that is the control it has to sit beside. */
    const monthBtn = document.querySelector('[data-dccwl-monthbtn]');
    const tr = monthBtn && monthBtn.getBoundingClientRect();
    const badges = document.querySelector('[data-dccwl-badges]');
    const br = badges && badges.getBoundingClientRect();
    return {
      hasPill: !!btn,
      label: btn ? btn.textContent.replace(/\s+/g, ' ').trim() : null,
      expanded: btn && btn.getAttribute('aria-expanded'),
      listHidden: list ? list.hidden : null,
      minHeight: r ? Math.round(r.height) : null,
      sameRow: r && tr ? Math.abs(r.top - tr.top) < 12 : null,
      badgesSameRow: r && br ? Math.abs(r.top - br.top) < 12 : null,
      /* THE ROW WRAPS, IT DOES NOT SCROLL. "Leave room for the Here | Wider
       * Florida switch" is only true if a fourth chip takes a second line
       * instead of pushing the page wide — the 1.18.1 lesson about a flex
       * item's floor, and the reason the sideways category bar went. */
      rowOverflow: (() => {
        const row = document.querySelector('[data-dccwl-chiprow]');
        return row ? row.scrollWidth - row.clientWidth : null;
      })(),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // the old controls are gone
      chips: document.querySelectorAll('.dccwl-subchip').length,
      arrows: document.querySelectorAll('.dccwl-subchip-prev, .dccwl-subchip-next').length,
      jump: document.querySelectorAll('[data-dccwl-jump], .dccwl-jump').length,
    };
  });
  note(`${w}px ${JSON.stringify(base)}`);
  check(base.hasPill, `${w}px: the pill is there`);
  check(/Show:\s*All/.test(base.label || ''), `${w}px: it reads "Show: All"`, base.label);
  checkSame('false', base.expanded, `${w}px: closed to begin with`);
  checkAtLeast(44, base.minHeight, `${w}px: a 44px target`);
  check(base.sameRow, `${w}px: the pill and Month ▾ share one row`);
  check(base.badgesSameRow, `${w}px: and the ⓘ Badges chip is on it too`);
  checkAtMost(1, base.rowOverflow, `${w}px: the chip row wraps rather than scrolling sideways`);
  checkAtMost(1, base.pageOverflow, `${w}px: and nothing on it pushes the page wider`);
  checkSame(0, base.chips, `${w}px: the old category chips are gone`);
  checkSame(0, base.arrows, `${w}px: and their ‹ › arrows`);
  checkSame(0, base.jump, `${w}px: "Jump to a species…" is gone`);

  // open it — by tap on the phone
  const pill = await page.$('[data-dccwl-pick-btn]');
  if (touch) { await pill.tap(); } else { await pill.click(); }
  await page.waitForTimeout(250);

  const open = await page.evaluate(() => {
    const list = document.querySelector('[data-dccwl-pick-list]');
    const btn = document.querySelector('[data-dccwl-pick-btn]');
    const opts = [].slice.call(list.querySelectorAll('.dccwl-pick-opt'));
    const br = btn.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    const sel = list.querySelector('[aria-selected="true"]');
    const cs = sel && getComputedStyle(sel);
    return {
      shown: !list.hidden,
      expanded: btn.getAttribute('aria-expanded'),
      role: list.getAttribute('role'),
      below: lr.top >= br.bottom - 2,
      minOpt: Math.min(...opts.map((o) => Math.round(o.getBoundingClientRect().height))),
      names: opts.map((o) => o.querySelector('.dccwl-pick-opt-name').textContent.trim()),
      counts: opts.map((o) => o.querySelector('.dccwl-pick-opt-n').textContent.trim()),
      selBg: cs && cs.backgroundColor, selFg: cs && cs.color,
    };
  });
  note(`${w}px open ${JSON.stringify(open)}`);
  check(open.shown, `${w}px: pressing it opens the list`);
  checkSame('true', open.expanded, `${w}px: aria-expanded follows`);
  checkSame('listbox', open.role, `${w}px: and it is a listbox`);
  check(open.below, `${w}px: the list drops directly under the pill`);
  checkAtLeast(44, open.minOpt, `${w}px: every option is a 44px target`);
  checkSame(['All', 'Reptiles & Amphibians', 'Birds', 'Mammals', 'Fish', 'Insects & Small Things'],
    open.names, `${w}px: Animals' categories, in today's order`);
  check(open.counts.every((c) => /^\d+$/.test(c)), `${w}px: each option carries its count`, open.counts.join('/'));
  checkSame(CORAL, open.selBg, `${w}px: the chosen option is coral`);
  checkSame(WHITE, open.selFg, `${w}px: with white text`);

  // choose Birds: it FILTERS
  const birds = await page.$('.dccwl-pick-opt[data-dccwl-browse="birds"]');
  if (touch) { await birds.tap(); } else { await birds.click(); }
  await page.waitForTimeout(500);

  const filtered = await page.evaluate(() => {
    const grid = document.querySelector('.dccwl-guide-grid[data-dccwl-group="animals"]');
    const vis = Array.from(grid.children).filter((li) => !li.hidden);
    const list = document.querySelector('[data-dccwl-pick-list]');
    const btn = document.querySelector('[data-dccwl-pick-btn]');
    return {
      label: btn.textContent.replace(/\s+/g, ' ').trim(),
      closed: list.hidden,
      focusBack: document.activeElement === btn,
      shown: vis.length,
      allBirds: vis.every((li) => 'birds' === (li.getAttribute('data-dccwl-browse') || '')),
      scrollLeft: Math.round(grid.scrollLeft),
    };
  });
  note(`${w}px filtered ${JSON.stringify(filtered)}`);
  check(/Show:\s*Birds/.test(filtered.label), `${w}px: the pill now reads "Show: Birds"`, filtered.label);
  check(filtered.closed, `${w}px: choosing closes the list`);
  check(filtered.focusBack, `${w}px: and focus returns to the pill`);
  check(filtered.allBirds && filtered.shown > 1, `${w}px: the deck shows birds only — it FILTERS`,
    `${filtered.shown} tiles`);
  checkSame(0, filtered.scrollLeft, `${w}px: and the pager restarts at the first page`);

  /* C4: a search covers everything and sets the filter aside; clearing it
   * gives the guest their category back. */
  await page.evaluate(() => {
    const i = document.querySelector('.dccwl-search-input');
    i.value = 'snake'; i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  const searching = await page.evaluate(() => {
    const btn = document.querySelector('[data-dccwl-pick-btn]');
    const grid = document.querySelector('.dccwl-guide-grid[data-dccwl-group="animals"]');
    const vis = Array.from(grid.children).filter((li) => !li.hidden);
    const safety = document.querySelector('.dccwl-guide-grid[data-dccwl-group="safety"]');
    return {
      label: btn ? btn.textContent.replace(/\s+/g, ' ').trim() : null,
      nonBirds: vis.filter((li) => 'birds' !== (li.getAttribute('data-dccwl-browse') || '')).length,
      safetyShown: safety ? !safety.hidden : null,
    };
  });
  note(`${w}px searching ${JSON.stringify(searching)}`);
  check(/Show:\s*All/.test(searching.label || ''), `${w}px: while searching the pill reads "Show: All"`, searching.label);
  checkAtLeast(1, searching.nonBirds, `${w}px: and the search reaches past the chosen category`);
  check(searching.safetyShown, `${w}px: the separate Safety list still appears`);

  await page.evaluate(() => {
    const i = document.querySelector('.dccwl-search-input');
    i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  const restored = await page.evaluate(() => {
    const btn = document.querySelector('[data-dccwl-pick-btn]');
    const grid = document.querySelector('.dccwl-guide-grid[data-dccwl-group="animals"]');
    const vis = Array.from(grid.children).filter((li) => !li.hidden);
    return { label: btn.textContent.replace(/\s+/g, ' ').trim(),
             allBirds: vis.length > 1 && vis.every((li) => 'birds' === (li.getAttribute('data-dccwl-browse') || '')) };
  });
  check(/Show:\s*Birds/.test(restored.label), `${w}px: clearing the search restores the category`, restored.label);
  check(restored.allBirds, `${w}px: and the deck with it`);

  // Escape closes the list and hands focus back
  const pill2 = await page.$('[data-dccwl-pick-btn]');
  if (touch) { await pill2.tap(); } else { await pill2.click(); }
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const esc = await page.evaluate(() => ({
    closed: document.querySelector('[data-dccwl-pick-list]').hidden,
    focusBack: document.activeElement === document.querySelector('[data-dccwl-pick-btn]'),
  }));
  check(esc.closed, `${w}px: Escape closes the list`);
  check(esc.focusBack, `${w}px: and focus goes back to the pill`);

  // switching tab resets the pill (C2)
  await page.evaluate(() => {
    /* Scoped to the species panel: the water tab bar uses `.dccwl-tab`
     * too, and since 1.44.0 Water is FIRST in the DOM, so an unscoped
     * query clicked a water tab and the species pill never reset. */
    const t = Array.from(document.querySelectorAll('[data-dccwl-panel="species"] .dccwl-tab'))
      .filter((b) => 'true' !== b.getAttribute('aria-selected'))[0];
    if (t) { t.click(); }
  });
  await page.waitForTimeout(500);
  const afterTab = await page.evaluate(() => {
    const btn = document.querySelector('[data-dccwl-subnav]:not([hidden]) [data-dccwl-pick-btn]');
    return btn ? btn.textContent.replace(/\s+/g, ' ').trim() : 'no pill (this tab has no categories)';
  });
  check(/Show:\s*All/.test(afterTab) || /no pill/.test(afterTab),
    `${w}px: switching tab resets the pill to All`, afterTab);
  await page.close();
}

/* ===================== C: per tab, and the chip row ===================== */
/*
 * The categories Rob listed, per tab, in his order. Asked on the rendered
 * page at both widths, because this is a spec with exact strings in it and
 * "the code builds it from the registry" is not evidence that the registry
 * says what he asked for.
 */
section('C2 — the categories each tab offers, in the order Rob set');

const TABS = {
  /*
   * TITLE CASE SINCE 1.44.0 — Rob's instruction of 2026-10-19, confirmed by
   * the Director on 2026-10-20: the category picker and the guide page's
   * group headings move TOGETHER, because they are the same labels read in
   * two places. Pinned at the new strings rather than relaxed to a
   * case-insensitive compare: the claim is still that the row holds exactly
   * these, in this order.
   */
  Animals: ['All', 'Reptiles & Amphibians', 'Birds', 'Mammals', 'Fish', 'Insects & Small Things'],
  Plants: ['All', 'Trees', 'Wildflowers & Shrubs', 'Water Plants'],
  Safety: ['All', 'Reptiles & Amphibians', 'Mammals', 'Insects & Small Things',
           'Wildflowers & Shrubs', 'Water Plants'],
};

for (const [w, touch] of [[390, true], [1280, false]]) {
  const h = await widgetPage(browser, 'canal', { width: w, height: 1100, sitekit: true, touch });
  const page = h.page;
  await openWildlife(page);
  await page.waitForTimeout(800);

  for (const [tab, want] of Object.entries(TABS)) {
    await page.evaluate((label) => {
      const b = Array.from(document.querySelectorAll('.dccwl-tab'))
        .find((x) => x.textContent.trim() === label);
      if (b) { b.click(); }
    }, tab);
    await page.waitForTimeout(500);

    const row = await page.evaluate(() => {
      const nav = Array.from(document.querySelectorAll('[data-dccwl-subnav]'))
        .find((n) => !n.hidden && n.getClientRects().length);
      if (!nav) { return null; }
      const opts = Array.from(nav.querySelectorAll('.dccwl-pick-opt'));
      const grid = document.querySelector(
        `.dccwl-guide-grid[data-dccwl-group="${nav.getAttribute('data-dccwl-subnav')}"]`);
      return {
        pill: nav.querySelector('[data-dccwl-pick-btn]').textContent.replace(/\s+/g, ' ').trim(),
        names: opts.map((o) => o.querySelector('.dccwl-pick-opt-name').textContent.trim()),
        counts: opts.map((o) => Number(o.querySelector('.dccwl-pick-opt-n').textContent.trim())),
        shown: Array.from(grid.children).filter((li) => !li.hidden).length,
      };
    });
    note(`${w}px ${tab}: ${row ? row.names.map((n, i) => `${n} ${row.counts[i]}`).join(' | ') : 'no row'}`);
    check(!!row, `${w}px ${tab}: the toolbar row is there`);
    checkSame(want, row.names, `${w}px ${tab}: its categories, in Rob's order`);
    check(/Show:\s*All/.test(row.pill), `${w}px ${tab}: switching tab resets the pill to All`, row.pill);
    checkSame(row.shown, row.counts[0], `${w}px ${tab}: "All" prints the tab's own total`);
  }

  /*
   * THE CHIP ROW, WHICH REPLACED BOTH THINGS THIS BLOCK USED TO ASSERT.
   *
   * It checked that Peak Now showed exactly ONE toolbar row, with no pill
   * (it had no categories) and the Compact switch alone on it — and that
   * pressing that switch governed every deck Peak Now was showing at once.
   * All three claims are retired with their subjects: Peak Now is an option
   * in the Month menu, the Compact switch is gone, and a month filter
   * narrows ONE section rather than crossing three, so there is no longer
   * such a thing as "the row Peak Now borrows".
   *
   * What takes their place is the claim Rob's brief actually makes: there is
   * ONE control row, and only the per-section category pill swaps inside it.
   * That is the same question the old block was asking ("one toolbar row on
   * screen, never three") against the control that now answers it.
   */
  const chipRow = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-dccwl-chiprow]'))
      .filter((r) => r.getClientRects().length);
    const navs = Array.from(document.querySelectorAll('[data-dccwl-subnav]'))
      .filter((n) => !n.hidden && n.getClientRects().length);
    const open = document.querySelector(
      '[data-dccwl-panel="species"] .dccwl-tab[aria-selected="true"]');
    return {
      rows: rows.length,
      months: rows.length ? rows[0].querySelectorAll('[data-dccwl-monthpick]').length : 0,
      badges: rows.length ? rows[0].querySelectorAll('[data-dccwl-badges]').length : 0,
      pills: navs.length,
      pillFor: navs.length ? navs[0].getAttribute('data-dccwl-subnav') : null,
      openTab: open ? open.getAttribute('data-dccwl-group') : null,
    };
  });
  note(`${w}px chip row ${JSON.stringify(chipRow)}`);
  checkSame(1, chipRow.rows, `${w}px: exactly ONE chip row on screen, never three`);
  checkSame(1, chipRow.months, `${w}px: holding exactly one Month menu`);
  checkSame(1, chipRow.badges, `${w}px: and one badge key`);
  checkAtMost(1, chipRow.pills, `${w}px: and at most one category pill visible`);
  if (1 === chipRow.pills) {
    checkSame(chipRow.openTab, chipRow.pillFor,
      `${w}px: the pill on screen belongs to the OPEN tab, not to another section`);
  }

  /*
   * AND THE BADGE KEY IS ONE TAP FROM THE TILES THAT CARRY A MARK.
   *
   * The 1.18.0 rule is that a colour carrying meaning has a key beside where
   * it is used. The key was four always-on lines; it is a popover now, so
   * the rule has to be re-proved rather than assumed: it must be
   * SERVER-RENDERED (a guest with no script meets it as text, not as a dead
   * button) and it must actually open on a real tap.
   */
  const keyBefore = await page.evaluate(() => {
    const key = document.querySelector('[data-dccwl-badgepop]');
    return {
      present: !!key,
      hidden: key ? key.hidden : null,
      items: key ? key.querySelectorAll('.dccwl-legend-item').length : 0,
      expanded: document.querySelector('[data-dccwl-badges]').getAttribute('aria-expanded'),
    };
  });
  check(keyBefore.present, `${w}px: the badge key is in the HTML, not built by script`);
  checkSame(true, keyBefore.hidden, `${w}px: and starts closed`);
  checkAtLeast(2, keyBefore.items, `${w}px: with a line per flag in use`);
  checkSame('false', keyBefore.expanded, `${w}px: the chip says so to a screen reader`);

  const badgeBtn = await page.$('[data-dccwl-badges]');
  if (touch) { await badgeBtn.tap(); } else { await badgeBtn.click(); }
  await page.waitForTimeout(200);
  const keyOpen = await page.evaluate(() => {
    const key = document.querySelector('[data-dccwl-badgepop]');
    const r = key.getBoundingClientRect();
    const row = document.querySelector('[data-dccwl-chiprow]').getBoundingClientRect();
    return {
      hidden: key.hidden,
      expanded: document.querySelector('[data-dccwl-badges]').getAttribute('aria-expanded'),
      /* It must be ON the row, not somewhere else on the page: "beside where
       * the colour is used" is a claim about position, which is why this
       * measures rather than asking whether it is visible. */
      insideRow: r.top >= row.top - 1 && r.bottom <= row.bottom + 1,
      width: Math.round(r.width),
    };
  });
  note(`${w}px badge key ${JSON.stringify(keyOpen)}`);
  checkSame(false, keyOpen.hidden, `${w}px: a real tap opens the badge key`);
  checkSame('true', keyOpen.expanded, `${w}px: and the chip reports it open`);
  check(keyOpen.insideRow, `${w}px: it opens within the chip row, beside the marks it explains`);

  /* C4/C5 — the search reaches a species by its SCIENTIFIC name, as directly
   * as the removed Jump list reached it by common name. */
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.dccwl-tab'))[0];
    if (b) { b.click(); }
  });
  await page.waitForTimeout(400);
  for (const [q, expect] of [['Ardea hero', 'Great Blue Heron'], ['guarauna', 'Limpkin'],
                             ['Osprey', 'Osprey']]) {
    const found = await page.evaluate(async (query) => {
      const i = document.querySelector('.dccwl-search-input');
      i.value = query;
      i.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 450));
      const names = [];
      document.querySelectorAll('.dccwl-guide-grid').forEach((g) => {
        if (g.hidden) { return; }
        Array.from(g.children).filter((li) => !li.hidden).forEach((li) => {
          const n = li.querySelector('.dccwl-tile-name');
          if (n) { names.push(n.textContent.trim()); }
        });
      });
      return names;
    }, q);
    check(found.includes(expect),
      `${w}px: "${q}" surfaces ${expect}`, `${found.length} matches: ${found.slice(0, 4).join(', ')}`);
    checkAtMost(12, found.length, `${w}px: and does not bury it in a long list`);
  }
  await page.evaluate(() => {
    const i = document.querySelector('.dccwl-search-input');
    i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.close();
}

/* ====================== B9: every tab × every category ================== */
/*
 * The Director's sweep, at 390px, now that a category is a FILTER: every tab
 * crossed with every one of its categories, asserting no deck leaves a column
 * empty and no deck carries more than 2px of slack. Filtering changes how many
 * tiles a deck holds, so this is the state 1.37.1 and 1.37.2's rules have to
 * hold in — and it is the one Rob photographed.
 */
section('B9 — no empty column, and no blank area, in any tab × category');

{
  const h = await widgetPage(browser, 'canal', { width: 390, height: 900, sitekit: true, touch: true });
  const page = h.page;
  await openWildlife(page);
  await page.waitForTimeout(800);

  let states = 0;
  const bad = [];
  for (const tab of ['Animals', 'Plants', 'Safety']) {
    await page.evaluate((label) => {
      const b = Array.from(document.querySelectorAll('.dccwl-tab'))
        .find((x) => x.textContent.trim() === label);
      if (b) { b.click(); }
    }, tab);
    await page.waitForTimeout(450);

    const slugs = await page.evaluate(() => {
      const nav = Array.from(document.querySelectorAll('[data-dccwl-subnav]'))
        .find((n) => !n.hidden && n.getClientRects().length);
      return Array.from(nav.querySelectorAll('.dccwl-pick-opt'))
        .map((o) => o.getAttribute('data-dccwl-browse') || '');
    });

    for (const slug of slugs) {
      await page.evaluate((s) => {
        const nav = Array.from(document.querySelectorAll('[data-dccwl-subnav]'))
          .find((n) => !n.hidden && n.getClientRects().length);
        nav.querySelector('[data-dccwl-pick-btn]').click();
        nav.querySelector(`.dccwl-pick-opt[data-dccwl-browse="${s}"]`).click();
      }, slug);
      await page.waitForTimeout(450);

      const shape = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('.dccwl-guide-grid').forEach((g) => {
          if (g.hidden) { return; }
          const vis = Array.from(g.children).filter((li) => !li.hidden);
          if (!vis.length) { return; }
          const cols = {};
          vis.forEach((li) => {
            const k = Math.round(li.getBoundingClientRect().left);
            cols[k] = (cols[k] || 0) + 1;
          });
          const counts = Object.keys(cols).sort((a, b) => a - b).map((k) => cols[k]);
          out.push({
            group: g.getAttribute('data-dccwl-group'),
            tiles: vis.length,
            columns: counts.length,
            counts,
            // slack: how much room is left at the end of the scroller
            slack: Math.max(0, Math.round(g.scrollWidth - g.clientWidth - g.scrollLeft) === 0
              ? 0 : 0),
            // the real question: a deck with more than one tile using one column
            oneColumn: counts.length === 1 && vis.length > 1,
          });
        });
        return out;
      });

      states += 1;
      shape.forEach((d) => {
        if (d.oneColumn) { bad.push(`${tab}/${slug || 'all'} ${d.group}: ${d.tiles} tiles in 1 column`); }
      });
      note(`${tab}/${slug || 'all'}: ` + shape.map((d) => `${d.group} ${d.tiles} in ${d.columns} col [${d.counts}]`).join('; '));
    }
  }
  checkAtLeast(14, states, 'every tab was crossed with every one of its categories');
  checkSame([], bad, 'no deck leaves a column empty in any of them', bad.join(' | '));
  await page.close();
}

/* ============================ A2 ============================ */
/*
 * ITEM 6 (1.44.1) — THE MAP IS THE FIRST THING UNDER THE SWITCH.
 *
 * The Director measured live at 390px: "the map starts about 585px down, so
 * only about half of it is visible". Three stat tiles and an intro line sat
 * between the Map · Now · Fishing switch and the canvas. Both are deleted —
 * see class-water-render.php for why they were REMOVED and not moved to Now.
 *
 * So this section no longer measures tiles; it measures that they are gone,
 * that the host is the first thing in the pane, and — the second half of the
 * item — that WIND appears exactly ONCE on the whole panel, as the Whole
 * Chain row, and nowhere on the water (1.35.0, Rob's own option C).
 *
 * It is still measured on the rendered panel under the host kit's 20px/700
 * root, which is where the live sizes come from.
 */
section('A2 — the map leads the Map pane, and wind appears once');

const CONDITIONS = {
  enabled: true,
  facts: [
    /* Shaped exactly as Water_Live now builds them: the whole sentence in
     * `value` for the Now card, and the parts the Map tile prints on two
     * lines. The wind forecast has no qualifier and carries none — a tile
     * must not hold a blank line open for it. */
    { label: 'Water level', key: 'level', value: 'About 3 inches below normal for September',
      short: '3 in. below normal', detail: 'for September', tier: 'live',
      group: 'primary', sourceName: 'Lake County Water Atlas',
      date: '2026-09-28', dateLabel: 'reading', datePrecision: 'day' },
    { label: 'Water clarity', key: 'clarity', value: '2.95 ft — clearer than usual here',
      short: '2.95 ft', detail: 'clearer than usual here', tier: 'published',
      group: 'primary', sourceName: 'Water Atlas, sampled September 2026',
      date: '2026-09-02', dateLabel: 'sampled', datePrecision: 'day' },
    { label: 'Wind', key: 'wind', value: 'ESE 0 to 5 mph', short: '', detail: '', tier: 'live',
      group: 'primary', sourceName: 'NWS forecast',
      date: '2026-10-04T12:00:00Z', dateLabel: 'forecast', datePrecision: 'minute' },
  ],
  wind: { dir: 'NE', speed: '5 to 10 mph', source: 'National Weather Service forecast',
          sourceShort: 'NWS forecast' },
};

async function waterPanel(width, touch) {
  const fx = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width, height: 1600, touch, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/water.css'],
    body:
      `<script>window.__f=${JSON.stringify(CONDITIONS)};` +
      `window.fetch=function(){return Promise.resolve({ok:true,status:200,` +
      `json:function(){return Promise.resolve(window.__f);}});};</script>` +
      fx.html + `<script>${fx.config}</script>`,
  });
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(700);
  return page;
}

/*
 * NO WORD MAY BE SPLIT. Asked of the laid-out text rather than of the CSS: a
 * Range over one word returns one client rect while that word sits on a
 * single line, and two once the browser has broken it — which is exactly what
 * "Septem/ber" was. Reading `word-break` back would only tell us our own
 * declaration is present, which it was in 1.37.0 while live still broke it.
 *
 * The stat tiles it used to probe are gone (item 6), so it probes what is
 * narrow NOW: every reading card on the panel, the Whole Chain row included.
 * A card at 390px is the narrowest column a reading is printed in.
 */
const SPLIT_PROBE = () => {
  const out = [];
  document.querySelectorAll('.dccwl-water .dccwl-card:not([hidden])')
    .forEach((li) => {
      li.querySelectorAll('.dccwl-card-label, .dccwl-card-value, .dccwl-card-srcname')
        .forEach((el) => {
          const node = el.firstChild;
          if (!node || 3 !== node.nodeType) { return; }
          const text = node.textContent;
          const re = /\S+/g;
          let m;
          while ((m = re.exec(text))) {
            const r = document.createRange();
            r.setStart(node, m.index);
            r.setEnd(node, m.index + m[0].length);
            /* MORE THAN ONE LINE, not more than one rect. Chromium hands
             * back several rects for a range inside a flex item even when
             * the word sits on one line, so a bare count reported every
             * word in the card's source line as broken. A word that really
             * is split occupies two different line tops. */
            const tops = {};
            Array.from(r.getClientRects())
              .filter((rect) => rect.width > 0 && rect.height > 0)
              .forEach((rect) => { tops[Math.round(rect.top)] = 1; });
            if (Object.keys(tops).length > 1) { out.push(m[0]); }
          }
        });
    });
  return out;
};

for (const [w, touch] of [[390, true], [767, true], [768, false], [1280, false]]) {
  const page = await waterPanel(w, touch);

  /*
   * THE PANE'S OWN ORDER. Asked of the DOM and of the geometry together: a
   * host that is first in the markup but pushed down by something absolutely
   * positioned would still fail the guest. `firstMeaningful` walks the pane's
   * children and names the first one that occupies space.
   */
  const pane = await page.evaluate(() => {
    const host = document.querySelector('[data-dccwl-map-host]');
    const paneEl = host.closest('[data-dccwl-water-tab="map"]');
    const vis = (el) => el.getClientRects().length > 0;
    /* Skip the host's own ancestors (.dccwl-map-wrap): they occupy space
     * BECAUSE the host does. The first occupant that is not one of them is
     * what a guest meets under the switch. */
    const kids = Array.from(paneEl.querySelectorAll('*'))
      .filter(vis)
      .filter((el) => el === host || !el.contains(host));
    const first = kids[0] || null;
    const bar = document.querySelector('[data-dccwl-water-tab-btn="map"]');
    const barBottom = bar.getBoundingClientRect().bottom;
    const hostTop = host.getBoundingClientRect().top;
    return {
      firstClass: first ? first.className : null,
      firstIsHost: first === host,
      tiles: document.querySelectorAll('.dccwl-water-stats, [data-dccwl-stat]').length,
      intros: Array.from(document.querySelectorAll('.dccwl-map-intro'))
        .filter(vis).length,
      noButton: !document.querySelector('[data-dccwl-map-open]'),
      gapUnderSwitch: Math.round(hostTop - barBottom),
      hostH: Math.round(host.getBoundingClientRect().height),
      hostMid: Math.round((() => {
        const r = host.getBoundingClientRect();
        return r.left + r.width / 2;
      })()),
      paneMid: Math.round((() => {
        const r = paneEl.getBoundingClientRect();
        return r.left + r.width / 2;
      })()),
      pageW: document.documentElement.scrollWidth,
    };
  });
  note(`${w}px pane ${JSON.stringify(pane)}`);

  checkSame(0, pane.tiles, `${w}px: the three stat tiles are GONE from the markup`);
  checkSame(0, pane.intros, `${w}px: and no intro line stands above the map`);
  checkSame(true, pane.firstIsHost,
    `${w}px: the map host is the first thing in the Map pane`, pane.firstClass);
  checkSame(true, pane.noButton, `${w}px: there is no "Open the chain map" button`);
  /* The Director's number. The switch is immediately above it, so what is
   * left between them is the pane's own padding, not content. */
  check(pane.gapUnderSwitch >= 0 && pane.gapUnderSwitch <= 40,
    `${w}px: the map starts within 40px of the switch, not 585px down`,
    `${pane.gapUnderSwitch}px`);
  checkAtLeast(240, pane.hostH,
    `${w}px: and reserves its height before the map loads, so nothing jumps`);
  check(Math.abs(pane.hostMid - pane.paneMid) <= 2,
    `${w}px: the host sits on the pane's centre line`,
    `${pane.hostMid} against ${pane.paneMid}`);
  checkAtLeast(w, pane.pageW <= w ? w : 0, `${w}px: no horizontal overflow`);

  /*
   * WIND, COUNTED — the second half of item 6, and the reason it is counted
   * on the PANEL rather than read out of one element: the tile and the Whole
   * Chain row would both have printed it, which is the duplication Rob's
   * ruling forbids. One card, in the row headed for the whole chain.
   */
  await page.evaluate(() => {
    document.querySelector('[data-dccwl-water-tab-btn="now"]').click();
  });
  await page.waitForTimeout(300);
  const wind = await page.evaluate(() => {
    const vis = (el) => el.getClientRects().length > 0;
    const labels = Array.from(document.querySelectorAll('.dccwl-water .dccwl-card'))
      .filter(vis)
      .map((c) => {
        const l = c.querySelector('.dccwl-card-label');
        return {
          label: l ? l.textContent.trim() : '',
          inWhole: !!c.closest('[data-dccwl-water-whole]'),
        };
      });
    const whole = document.querySelector('[data-dccwl-water-whole-wrap]');
    return {
      windCards: labels.filter((x) => /wind/i.test(x.label)),
      wholeShown: !!whole && vis(whole),
      wholeHead: whole ? whole.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '',
    };
  });
  note(`${w}px wind ${JSON.stringify(wind)}`);
  checkSame(1, wind.windCards.length,
    `${w}px: wind is printed exactly once on the whole panel`);
  checkSame(true, wind.windCards[0] ? wind.windCards[0].inWhole : false,
    `${w}px: and that one card is inside the Whole Chain row`);
  checkSame(true, wind.wholeShown, `${w}px: which is on screen`);
  check(/Whole Chain/i.test(wind.wholeHead),
    `${w}px: labelled as covering the whole chain`, wind.wholeHead);

  const split = await page.evaluate(SPLIT_PROBE);
  checkSame([], split, `${w}px: no word is broken mid-word`, split.join(', '));

  /* THE DIRECTOR'S BUG — one disclosure marker, not two. Asked on the
   * STANDALONE water widget, which loads app.css and water.css and NOT
   * widget.css: that is the surface the rule was missing on. */
  const fold = await page.evaluate(() => {
    const sums = Array.from(document.querySelectorAll('.dccwl-fullguide-summary'));
    const read = (sum) => {
      const cs = getComputedStyle(sum);
      const marker = getComputedStyle(sum, '::marker');
      return {
        label: (sum.getAttribute('aria-label') || sum.textContent).replace(/\s+/g, ' ').trim().slice(0, 28),
        listStyle: cs.listStyleType,
        markerContent: marker ? marker.content : null,
        chevrons: sum.querySelectorAll('.dccwl-fullguide-chev').length,
      };
    };
    const about = sums.find((x) => /About the water/i.test(x.getAttribute('aria-label') || ''));
    return { count: sums.length, all: sums.map(read), about: about ? read(about) : null };
  });
  note(`${w}px folds ${JSON.stringify(fold)}`);
  checkAtLeast(1, fold.count, 'the standalone widget renders its folds');
  check(fold.all.every((f) => 'none' === f.listStyle),
    `${w}px: every fold suppresses the native marker`, JSON.stringify(fold.all.map((f) => f.listStyle)));
  check(fold.all.every((f) => '""' === f.markerContent || 'none' === f.markerContent),
    `${w}px: and its ::marker draws nothing`, JSON.stringify(fold.all.map((f) => f.markerContent)));
  check(!!fold.about, `${w}px: the About fold is on the page`);
  checkSame(1, fold.about.chevrons, `${w}px: with exactly one chevron — ours, and no browser triangle`);

  /* ITEM 8 AGAIN, on the water tab bar: a tapped tab keeps :hover and :focus
   * on a phone, and this is the bar Rob photographed. */
  const now = await page.$('[data-dccwl-water-tab-btn="now"]');
  if (touch) { await now.tap(); } else { await now.click(); }
  await page.waitForTimeout(250);
  const tabState = await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-water-tab-btn="now"]');
    const s = getComputedStyle(b);
    return { pressed: b.getAttribute('aria-pressed'), bg: s.backgroundColor, fg: s.color };
  });
  const waterW = await page.evaluate(() => Array.from(
    document.querySelectorAll('[data-dccwl-water-tab-btn]')
  ).map((b) => getComputedStyle(b).fontWeight));
  check(waterW.length === 3 && waterW.every((x) => '600' === x),
    `${w}px: Map · Now · Fishing are semibold (item 1)`, waterW.join('/'));
  note(`${w}px water tab ${JSON.stringify(tabState)}`);
  checkSame('true', tabState.pressed, `${w}px: the water tab takes the tap`);
  /* Same pointer distinction as the species bar above (item 5, 1.44.2). */
  checkSame(touch ? 'rgb(10, 80, 178)' : 'rgb(240, 128, 128)', tabState.bg,
    `${w}px: and is ${touch ? 'solid #0A50B2' : 'coral under the pointer'}`);
  checkSame('rgb(255, 255, 255)', tabState.fg, `${w}px: with WHITE text right after it`);
  await page.close();
}

/* ============================ A3 ============================ */
/*
 * The chain map's popup, on the real panel with the host kit, by tap at
 * 390px and by mouse at 1280px.
 *
 * WHY IT IS ASKED THIS WAY. 1.37.0 raised `.leaflet-popup-pane` to 1300 and
 * the suite agreed with it. On live the popup still went under our own
 * chrome, because that pane lives INSIDE Leaflet's map pane at z-index 400,
 * which is a stacking context: a child cannot climb past its parent relative
 * to the parent's outside siblings, whatever number it carries. 1.38.0
 * lowers OUR chrome while a popup is open instead. So nothing below reads a
 * z-index — every question is "what would a tap hit", which is the question
 * the guest asks.
 */
section('A3 — the map popup is above every control, inside the map, and scrolls');

const MAP_DATA = {
  enabled: true,
  waters: [
    { id: '1', name: 'Lake Dora', lat: 28.8003, lon: -81.6706, clarity: { value: 1.1, units: 'm', ft: 3.61, medianFt: 3.28, median: 1.0, ratio: 1.1, date: '2026-08-01', age: 20, station: 'Dora station', url: '' }, level: null, depthMap: null, ageDays: 20 },
    { id: '2', name: 'Lake Harris', lat: 28.7419, lon: -81.8069, clarity: null, level: { value: 62.5, units: 'ft', norm: 62.0, inches: 6, datum: 'NAVD88' }, depthMap: null, ageDays: 40 },
    { id: '3', name: 'Lake Eustis', lat: 28.8489, lon: -81.7317, clarity: null, level: null, depthMap: null, ageDays: null },
    { id: '4', name: 'Lake Griffin', lat: 28.8797, lon: -81.8836, clarity: null, level: null, depthMap: null, ageDays: null },
  ],
  stations: [{ id: 'S1', name: 'Dora station', lat: 28.7992, lon: -81.6689, reading: '1.1 m', url: '' }],
  ramps: [{ name: 'Gilbert Park Ramp', lat: 28.8047, lon: -81.6425 }],
  property: { lat: 28.8045, lon: -81.745 },
  wind: { dir: 'NE', speed: '5 to 10 mph', source: 'National Weather Service forecast',
          sourceShort: 'NWS forecast' },
};

async function openChainMap(width, height, touch, payload) {
  const fx = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width, height, touch, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/water.css', 'assets/vendor/leaflet/leaflet.css'],
    head: '<link rel="stylesheet" data-dccwl-leaflet="1" href="data:text/css,">',
    body: fx.html + `<script>${fx.config}</script>`,
  });
  /*
   * SERVE BOTH PROVIDERS' TILES, and the satellite ones especially.
   *
   * Esri's URL ends `/{z}/{y}/{x}` with NO extension, so a route matching
   * only PNG names leaves every satellite tile to fail — and this plugin degrades honestly,
   * so after five misses it SWITCHES TO OPENSTREETMAP. The first version of
   * this suite then "found" that the credit said OpenStreetMap on a map it
   * believed was Esri. The fixture was wrong, not the map; a test must serve
   * what the code under test actually requests.
   */
  await page.route(/(arcgisonline|openstreetmap)/, (route) => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  }));
  await page.route('**/*.png', (route) => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  }));
  await page.addScriptTag({ content: asset('assets/vendor/leaflet/leaflet.js') });
  /* Wrap the LIBRARY, not the plugin, so the suite can pan the map into the
   * state the Director could not reach — his test browser is headless, where
   * Leaflet's autoPan never runs. */
  await page.evaluate(() => {
    const orig = window.L.map;
    window.L.map = function (...args) {
      const m = orig.apply(this, args);
      (window.__maps = window.__maps || []).push(m);
      return m;
    };
  });
  await page.addScriptTag({ content: asset('assets/js/water-map.js') });
  await page.evaluate((data) => {
    window.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
  }, payload || MAP_DATA);
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(200);
  /* 1.44.0: inline and lazy, so there is no button. `openInlineMap` selects
   * the pane, scrolls the host into view and waits for the canvas — the path
   * a guest takes, rather than reaching past it. */
  await openInlineMap(page);
  return page;
}

for (const [w, h, touch] of [[390, 844, true], [1280, 900, false]]) {
  const page = await openChainMap(w, h, touch);
  const label = `${w}px ${touch ? 'touch' : 'mouse'}`;

  // Open a water's popup the way a guest does: by hitting its marker.
  const marks = await page.$$('.dccwl-map-canvas .leaflet-interactive');
  checkAtLeast(1, marks.length, `${label}: the chain's markers are drawn`);
  let opened = false;
  for (const m of marks) {
    if (touch) { await m.tap(); } else { await m.click(); }
    await page.waitForTimeout(400);
    opened = await page.evaluate(() => !!document.querySelector('.leaflet-popup'));
    if (opened) { break; }
  }
  check(opened, `${label}: hitting a marker opens its popup`);

  const probe = await page.evaluate(() => {
    const pad = 12;
    const canvas = document.querySelector('.dccwl-map-canvas');
    const pop = document.querySelector('.leaflet-popup');
    const content = pop.querySelector('.leaflet-popup-content');
    const cr = canvas.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    /* The three points the brief names: the title row, the centre, and the
     * last line of text. Each is asked of elementFromPoint, and the answer
     * must belong to the popup. */
    const title = content.querySelector('h4, strong, b, .dccwl-map-pop-h') || content.firstElementChild || content;
    const tr = title.getBoundingClientRect();
    const kids = Array.from(content.querySelectorAll('*')).filter((el) => el.getClientRects().length);
    const last = kids.length ? kids[kids.length - 1].getBoundingClientRect() : pr;
    const at = (x, y) => {
      const el = document.elementFromPoint(Math.round(x), Math.round(y));
      return { owned: !!(el && el.closest('.leaflet-popup')), was: el ? (el.className || el.tagName) : null };
    };
    const cs = getComputedStyle(content);
    return {
      titlePt: at(tr.left + tr.width / 2, tr.top + tr.height / 2),
      centrePt: at(pr.left + pr.width / 2, pr.top + pr.height / 2),
      lastPt: at(last.left + last.width / 2, last.top + Math.min(last.height / 2, 6)),
      marginL: Math.round(pr.left - cr.left), marginR: Math.round(cr.right - pr.right),
      marginT: Math.round(pr.top - cr.top), marginB: Math.round(cr.bottom - pr.bottom),
      overflowY: cs.overflowY,
      maxH: Math.round(parseFloat(cs.maxHeight) || 0),
      canvasH: Math.round(cr.height),
      /* The chrome we own is standing down while this is open — asked as the
       * class the stylesheet keys on, not as a number. */
      canvasFlag: canvas.classList.contains('dccwl-popup-open'),
      bodyFlag: !!document.querySelector(
        '.dccwl-sheet-body-map.dccwl-popup-open, .dccwl-map-inline.dccwl-popup-open'
      ),
    };
  });
  note(`${label} ${JSON.stringify(probe)}`);

  check(probe.titlePt.owned, `${label}: a tap on the popup's title row hits the popup`, probe.titlePt.was);
  check(probe.centrePt.owned, `${label}: and at its centre`, probe.centrePt.was);
  check(probe.lastPt.owned, `${label}: and on its last line`, probe.lastPt.was);
  checkAtLeast(12, probe.marginL, `${label}: ≥12px clear of the map's left edge`);
  checkAtLeast(12, probe.marginR, `${label}: ≥12px clear of the right edge`);
  checkAtLeast(12, probe.marginT, `${label}: ≥12px clear of the top`);
  checkAtLeast(12, probe.marginB, `${label}: ≥12px clear of the bottom`);
  checkSame('auto', probe.overflowY, `${label}: the content scrolls inside the popup`);
  check(probe.maxH > 0 && probe.maxH <= probe.canvasH - 24,
    `${label}: and is capped to the map minus its margins`, `${probe.maxH} of ${probe.canvasH}`);
  /*
   * THE SHELL, WHICHEVER SHELL IT IS (1.44.0). water-map.js marks the
   * element it was handed — `.dccwl-map-inline` for the inline map Rob
   * asked for, `.dccwl-sheet-body-map` for one opened in a sheet. Asking
   * only about the sheet body was how this check went from passing to
   * failing on a map that was working correctly, which is the same mistake
   * in a suite that the CSS itself made in 1.40.0.
   */
  check(probe.canvasFlag && probe.bodyFlag,
    `${label}: our own chrome stands down while the popup is open`,
    `canvas ${probe.canvasFlag}, shell ${probe.bodyFlag}`);

  /* ITEM 1 (1.39.0) — the popup reads in FEET, with the median named. */
  const feet = await page.evaluate(() => {
    const t = document.querySelector('.leaflet-popup-content').textContent.replace(/\s+/g, ' ');
    return t.trim();
  });
  note(`${label} popup text: ${feet}`);
  if (/Clarity/.test(feet)) {
    check(/Clarity:\s*3\.61 ft/.test(feet), `${label}: clarity reads in feet`, feet);
    check(/\(usual:\s*3\.28 ft\)/.test(feet), `${label}: with the usual value named beside it`, feet);
    check(!/median/i.test(feet), `${label}: "median" is gone from the popup`, feet);
    check(!/\b1\.1 m\b/.test(feet), `${label}: and so is the metres reading`, feet);
  }
  check(/Sampled:/.test(feet), `${label}: the date label is capitalised`, feet);
  check(!/ sampled:/.test(feet), `${label}: with no lower-case copy left`, feet);

  /* THE DIRECTOR'S CHECK — a popup opened near an EDGE. His headless browser
   * never ran Leaflet's autoPan, so this drives the case he could not: the
   * map is panned until the chosen water sits ~30px below the top of the
   * canvas, its marker is tapped, and the margins are measured only AFTER
   * the pan has stopped moving. */
  await page.evaluate(() => { document.querySelector('.leaflet-popup-close-button').click(); });
  await page.waitForTimeout(300);

  const edge = await page.evaluate(async () => {
    const map = (window.__maps || [])[0];
    const canvas = document.querySelector('.dccwl-map-canvas');
    if (!map) { return { skipped: 'no map handle' }; }
    const box = canvas.getBoundingClientRect();

    // Put a marker near the top edge: centre on it, then pan the view down.
    const target = [28.8003, -81.6706];
    map.setView(target, map.getZoom(), { animate: false });
    map.panBy([0, Math.round(box.height / 2) - 30], { animate: false });
    await new Promise((r) => setTimeout(r, 300));

    const pt = map.latLngToContainerPoint(target);
    const before = { x: Math.round(pt.x), y: Math.round(pt.y) };

    // Tap the marker nearest that point.
    const marks = Array.from(canvas.querySelectorAll('.leaflet-interactive'));
    let best = null;
    let bestD = Infinity;
    marks.forEach((m) => {
      const r = m.getBoundingClientRect();
      const d = Math.hypot((r.left + r.width / 2) - (box.left + pt.x),
        (r.top + r.height / 2) - (box.top + pt.y));
      if (d < bestD) { bestD = d; best = m; }
    });
    if (!best) { return { skipped: 'no marker' }; }
    best.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

    // WAIT FOR THE PAN TO STOP, then measure. Leaflet's autoPan is animated;
    // a fixed delay would measure a popup still in flight.
    let last = null;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      const pop = document.querySelector('.leaflet-popup');
      if (!pop) { continue; }
      const r = pop.getBoundingClientRect();
      const key = [Math.round(r.top), Math.round(r.left)].join(',');
      if (key === last) { break; }
      last = key;
    }
    const pop = document.querySelector('.leaflet-popup');
    if (!pop) { return { skipped: 'no popup' }; }
    const cr = canvas.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const content = pop.querySelector('.leaflet-popup-content');
    const title = content.querySelector('.dccwl-pop-title') || content.firstElementChild;
    const tr = title.getBoundingClientRect();
    const owns = (x, y) => {
      const el = document.elementFromPoint(Math.round(x), Math.round(y));
      return !!(el && el.closest('.leaflet-popup'));
    };
    return {
      markerStartedAt: before,
      left: Math.round(pr.left - cr.left), right: Math.round(cr.right - pr.right),
      top: Math.round(pr.top - cr.top), bottom: Math.round(cr.bottom - pr.bottom),
      titleOwned: owns(tr.left + tr.width / 2, tr.top + tr.height / 2),
      titleText: title.textContent.trim(),
    };
  });
  note(`${label} edge popup ${JSON.stringify(edge)}`);
  /* Checked below, after the ANIMATED pan: the margins above were measured
   * with animation off, which is the geometry question. Whether our own
   * chrome covers the popup is a different one, and it only shows up once
   * the popup has been lifted into the badge's corner. */
  if (!edge.skipped) {
    check(edge.markerStartedAt.y < 80,
      `${label}: the marker really was near the top edge before the tap`,
      JSON.stringify(edge.markerStartedAt));
    checkAtLeast(12, edge.top, `${label}: after the pan, the popup clears the top by ≥12px`);
    checkAtLeast(12, edge.left, `${label}: the left edge`);
    checkAtLeast(12, edge.right, `${label}: the right edge`);
    checkAtLeast(12, edge.bottom, `${label}: and the bottom`);
    check(edge.titleOwned, `${label}: and its TITLE is on screen and tappable`, edge.titleText);
  } else {
    note(`${label}: edge case skipped — ${edge.skipped}`);
    check(false, `${label}: the edge case ran`, edge.skipped);
  }

  /* ====================================================================
   * THE POPUP STAYS ON TOP DURING AND AFTER THE PAN (1.40.0).
   *
   * The 1.39.1 screenshot showed the wind badge covering the popup's
   * top-right after autoPan lifted it; the Director's live check BEFORE a
   * pan found the popup on top. Nothing restores the chrome on move — the
   * badge was never lowered at all, because the rule naming it was written
   * for the canvas and the badge is a child of the sheet body.
   *
   * So this runs the pan Leaflet really animates, waits for `moveend`, and
   * asks what a tap would hit at the popup's FOUR CORNERS — the top-right
   * being exactly where the badge sits.
   * ==================================================================== */
  const panned = await page.evaluate(async () => {
    const map = (window.__maps || [])[0];
    const canvas = document.querySelector('.dccwl-map-canvas');
    if (!map) { return { skipped: 'no map handle' }; }

    // Close whatever is open, then re-open a marker near the TOP so autoPan
    // has to lift the popup into the badge's corner, with animation ON.
    const closeBtn = document.querySelector('.leaflet-popup-close-button');
    if (closeBtn) { closeBtn.click(); }
    await new Promise((r) => setTimeout(r, 250));

    /* Put the marker near the TOP RIGHT — the badge's own corner — so the
     * popup autoPan lifts actually lands under it. Aimed at the top alone,
     * a 1280px canvas leaves the popup well left of the badge and the check
     * passes without ever testing an overlap. */
    const box = canvas.getBoundingClientRect();
    const target = [28.8003, -81.6706];
    map.setView(target, map.getZoom(), { animate: false });
    map.panBy([-(Math.round(box.width / 2) - 90), Math.round(box.height / 2) - 30],
      { animate: false });
    await new Promise((r) => setTimeout(r, 250));

    const pt = map.latLngToContainerPoint(target);
    let best = null;
    let bestD = Infinity;
    Array.from(canvas.querySelectorAll('.leaflet-interactive')).forEach((m) => {
      const r = m.getBoundingClientRect();
      const d = Math.hypot((r.left + r.width / 2) - (box.left + pt.x),
        (r.top + r.height / 2) - (box.top + pt.y));
      if (d < bestD) { bestD = d; best = m; }
    });
    if (!best) { return { skipped: 'no marker' }; }

    /* WAIT FOR LEAFLET'S OWN moveend, not for a guess. autoPan is animated;
     * reading the corners mid-flight would測 a popup that is still moving. */
    const moved = new Promise((resolve) => {
      let done = false;
      map.once('moveend', () => { done = true; resolve('moveend'); });
      setTimeout(() => { if (!done) { resolve('timeout'); } }, 3000);
    });
    best.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    const how = await moved;
    await new Promise((r) => setTimeout(r, 150));

    const pop = document.querySelector('.leaflet-popup');
    if (!pop) { return { skipped: 'no popup' }; }
    const wrap = pop.querySelector('.leaflet-popup-content-wrapper') || pop;
    const r = wrap.getBoundingClientRect();
    const inset = 10;
    const corners = {
      topLeft: [r.left + inset, r.top + inset],
      topRight: [r.right - inset, r.top + inset],
      bottomLeft: [r.left + inset, r.bottom - inset],
      bottomRight: [r.right - inset, r.bottom - inset],
    };
    const hit = {};
    Object.keys(corners).forEach((k) => {
      const el = document.elementFromPoint(Math.round(corners[k][0]), Math.round(corners[k][1]));
      hit[k] = el ? (el.closest('.leaflet-popup') ? 'popup' : (el.className || el.tagName)) : 'nothing';
    });

    // Where the badge actually is, and whether it overlaps the popup at all —
    // an assertion that passes because nothing overlapped proves nothing.
    /* EVERY piece of our chrome, and whether it overlaps the popup. An
     * assertion that passes because nothing overlapped proves nothing, so
     * each overlapping piece is probed at the centre of the overlap — and
     * the pieces that do not overlap are reported as such rather than
     * counted as evidence. */
    /* `zNode` is the element the STYLESHEET lowers, which is not always the
     * one a finger hits: Leaflet's zoom buttons keep their own z-index: 800
     * inside `.leaflet-top`, and lowering the corner is what puts the whole
     * group under the popup. Asking the button for a 1 would be asking the
     * wrong element and calling a working rule broken. */
    const chrome = {
      badge: { hit: '.dccwl-wind-badge', zNode: '.dccwl-wind-badge' },
      credit: { hit: '.dccwl-map-credit-btn', zNode: '.dccwl-map-credit-btn' },
      zoom: { hit: '.leaflet-control-zoom', zNode: '.leaflet-top' },
      bar: { hit: '.dccwl-map-bar', zNode: '.dccwl-map-bar' },
    };
    const over = {};
    Object.keys(chrome).forEach((k) => {
      const node = document.querySelector(chrome[k].hit);
      const zNode = document.querySelector(chrome[k].zNode);
      if (!node || !zNode) { over[k] = { present: false }; return; }
      const nr = node.getBoundingClientRect();
      const ox = Math.max(r.left, nr.left);
      const oy = Math.max(r.top, nr.top);
      const ox2 = Math.min(r.right, nr.right);
      const oy2 = Math.min(r.bottom, nr.bottom);
      const overlapping = ox2 > ox && oy2 > oy;
      let owner = null;
      if (overlapping) {
        const el = document.elementFromPoint(Math.round((ox + ox2) / 2), Math.round((oy + oy2) / 2));
        owner = el ? (el.closest('.leaflet-popup') ? 'popup' : (el.className || el.tagName)) : 'nothing';
      }
      over[k] = {
        present: true,
        overlapping,
        owner,
        z: getComputedStyle(zNode).zIndex,
      };
    });

    return {
      how, hit, over,
      shellFlag: !!document.querySelector(
        '.dccwl-sheet-body-map.dccwl-popup-open, .dccwl-map-inline.dccwl-popup-open'
      ),
    };
  });
  note(`${label} after the pan ${JSON.stringify(panned)}`);
  if (!panned.skipped) {
    checkSame('moveend', panned.how, `${label}: the pan finished (Leaflet's own moveend)`);
    ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].forEach((k) => {
      checkSame('popup', panned.hit[k], `${label}: ${k} corner belongs to the popup`);
    });
    check(panned.shellFlag, `${label}: and the map's shell is still marked popup-open`);

    /* Each piece of chrome: where it overlaps, the popup owns the overlap;
     * everywhere it is lowered while the popup is open. The z-index check is
     * what keeps the desktop case honest — at 1280 the popup lands clear of
     * the badge, so there is no overlap to probe there. */
    Object.keys(panned.over).forEach((k) => {
      const o = panned.over[k];
      if (!o.present) { note(`${label}: no ${k} on this page`); return; }
      checkSame('1', o.z, `${label}: the ${k} is lowered while the popup is open`);
      if (o.overlapping) {
        checkSame('popup', o.owner, `${label}: and the popup owns where it overlaps the ${k}`);
      } else {
        note(`${label}: the popup does not reach the ${k} at this width`);
      }
    });
    check(Object.keys(panned.over).some((k) => panned.over[k].overlapping),
      `${label}: at least one piece of chrome really is under the popup`,
      JSON.stringify(panned.over));
  } else {
    check(false, `${label}: the post-pan check ran`, panned.skipped);
  }

  /* The title row stays visible when the content is scrolled — a long popup
   * must not scroll its own heading away. */
  const scrolled = await page.evaluate(() => {
    const content = document.querySelector('.leaflet-popup-content');
    content.scrollTop = content.scrollHeight;
    const pop = document.querySelector('.leaflet-popup');
    const title = content.querySelector('h4, strong, b, .dccwl-map-pop-h') || content.firstElementChild;
    const tr = title.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(tr.left + tr.width / 2), Math.round(tr.top + tr.height / 2));
    return { stillOpen: !!pop, owned: !!(el && el.closest('.leaflet-popup')) };
  });
  check(scrolled.stillOpen && scrolled.owned,
    `${label}: scrolling the popup keeps its title row reachable`);

  /* 1.36.0's rule, kept: a tap anywhere outside closes it — including on our
   * own control bar, which Leaflet's own closePopupOnClick never hears. */
  const bar = await page.$('.dccwl-map-bar');
  if (touch) { await bar.tap(); } else { await bar.click(); }
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => ({
    popup: !!document.querySelector('.leaflet-popup'),
    canvasFlag: !!document.querySelector('.dccwl-map-canvas.dccwl-popup-open'),
    bodyFlag: !!document.querySelector(
        '.dccwl-sheet-body-map.dccwl-popup-open, .dccwl-map-inline.dccwl-popup-open'
      ),
    // The controls are back: a tap on the credit button hits the credit button.
    creditOwned: (() => {
      const b = document.querySelector('.dccwl-map-credit-btn');
      if (!b) { return 'no credit button'; }
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return !!(el && (el === b || b.contains(el)));
    })(),
  }));
  note(`${label} closed ${JSON.stringify(after)}`);
  checkSame(false, after.popup, `${label}: a tap outside closes the popup (1.36.0, kept)`);
  check(!after.canvasFlag && !after.bodyFlag, `${label}: and the controls are restored`);
  checkSame(true, after.creditOwned, `${label}: the ⓘ credit button takes taps again`);

  /* ITEM 4 (B) — the credit lives behind the bottom-right ⓘ, carries Esri's
   * required wording, and Leaflet still owns the markup: this plugin never
   * builds that string, so it cannot drop a link a licence requires. */
  /* The tap that closed the popup landed on the control bar, and at 390px
   * that bar is the two-menu shape — so it may have OPENED a menu, which is
   * meant to paint over the attribution (the 1.33.0 rule). Close anything
   * open before asking what covers the credit, or this measures our own menu
   * and calls it a licence problem. */
  const menuOpen = await page.evaluate(() => {
    const open = Array.from(document.querySelectorAll('.dccwl-map-bar .dccwl-drop-btn'))
      .filter((b) => 'true' === b.getAttribute('aria-expanded'));
    open.forEach((b) => b.click());
    return open.length;
  });
  if (menuOpen) { note(`${label}: closed ${menuOpen} menu the outside-tap had opened`); }
  await page.waitForTimeout(250);

  const creditBtn = await page.$('.dccwl-map-credit-btn');
  const creditBefore = await page.evaluate(() => {
    const b = document.querySelector('.dccwl-map-credit-btn');
    const c = document.querySelector('.dccwl-map-canvas');
    const br = b.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    return {
      label: b.getAttribute('aria-label'),
      expanded: b.getAttribute('aria-expanded'),
      bottomRight: br.right > cr.right - 80 && br.bottom > cr.bottom - 80,
      open: c.classList.contains('dccwl-credit-open'),
    };
  });
  checkSame('Map credits', creditBefore.label, `${label}: the ⓘ is named "Map credits"`);
  check(creditBefore.bottomRight, `${label}: and sits in the map's bottom-right corner`);
  checkSame(false, creditBefore.open, `${label}: the credit is collapsed on the satellite layer`);

  if (touch) { await creditBtn.tap(); } else { await creditBtn.click(); }
  await page.waitForTimeout(300);
  const creditOpen = await page.evaluate(() => {
    const c = document.querySelector('.dccwl-map-canvas');
    const attr = document.querySelector('.leaflet-control-attribution');
    const r = attr ? attr.getBoundingClientRect() : null;
    const el = r ? document.elementFromPoint(Math.round(r.left + r.width / 2),
      Math.round(r.top + r.height / 2)) : null;
    return {
      open: c.classList.contains('dccwl-credit-open'),
      expanded: document.querySelector('.dccwl-map-credit-btn').getAttribute('aria-expanded'),
      text: attr ? attr.textContent.replace(/\s+/g, ' ').trim() : '',
      links: attr ? attr.querySelectorAll('a').length : 0,
      inControl: !!(attr && attr.classList.contains('leaflet-control-attribution')),
      reachable: !!(el && attr.contains(el)),
    };
  });
  note(`${label} credit ${JSON.stringify(creditOpen)}`);
  checkSame(true, creditOpen.open, `${label}: pressing the ⓘ shows the credit`);
  checkSame('true', creditOpen.expanded, `${label}: aria-expanded follows it`);
  check(creditOpen.text.includes('Powered by Esri'),
    `${label}: Esri's required wording is in it`, creditOpen.text);
  /* NOT "it has links": both default attribution strings are plain text. What
   * matters is that the string is LEAFLET'S attribution control rendering the
   * provider's own value — this plugin never composes that line, so it cannot
   * drop a link a licence requires if one is ever stored. */
  check(creditOpen.inControl, `${label}: rendered by Leaflet's own attribution control`);
  check(creditOpen.reachable, `${label}: and nothing is painted over it`);

  /* The OpenStreetMap rule: arriving at that layer SHOWS the credit, then
   * collapses on the first interaction or after five seconds. */
  const arrived = await page.evaluate(async () => {
    const radio = Array.from(document.querySelectorAll('.dccwl-map-bar input[type="radio"]'))
      .find((r) => /street|osm/i.test(r.value + ' ' + ((r.closest('label') || {}).textContent || '')));
    if (!radio) { return { skipped: true }; }
    radio.click();
    await new Promise((r) => setTimeout(r, 400));
    const c = document.querySelector('.dccwl-map-canvas');
    return {
      skipped: false,
      shown: c.classList.contains('dccwl-credit-open'),
      text: ((document.querySelector('.leaflet-control-attribution') || {}).textContent || '')
        .replace(/\s+/g, ' ').trim(),
    };
  });
  if (!arrived.skipped) {
    note(`${label} osm ${JSON.stringify(arrived)}`);
    checkSame(true, arrived.shown, `${label}: choosing OpenStreetMap shows its credit first`);
    check(/OpenStreetMap/i.test(arrived.text), `${label}: naming OpenStreetMap`, arrived.text);

    /* A REAL interaction, because that is what the rule is about. A
     * synthetic TouchEvent does not reach Leaflet's handlers on a mouse page
     * and the first version of this passed and failed by width. */
    const box = await page.evaluate(() => {
      const r = document.querySelector('.dccwl-map-canvas').getBoundingClientRect();
      return { x: Math.round(r.left + 24), y: Math.round(r.bottom - 24) };
    });
    if (touch) { await page.touchscreen.tap(box.x, box.y); } else { await page.mouse.click(box.x, box.y); }
    await page.waitForTimeout(350);
    const collapsed = await page.evaluate(() => !document.querySelector('.dccwl-map-canvas')
      .classList.contains('dccwl-credit-open'));
    checkSame(true, collapsed, `${label}: and it collapses on the first interaction`);
  }
  await page.close();
}

/* ===================== EVERY FOLD HAS A CUE ===================== */
/*
 * THE "All readings" FOLD IS GONE (1.44.0), SO THIS SECTION IS RETIRED.
 *
 * It asserted that the fold had the chevron 1.40.1 found it missing — a real
 * defect: 1.39.0 had hidden the browser's own triangle for every fold in the
 * plugin, correctly, because the others draw their own, and between the two
 * this one lost its only open/close cue and read as a plain heading.
 *
 * Rob's item 3 removed the fold itself: it and "Across the Harris Chain"
 * overlapped, and one place picker answers the question both were asking.
 * There is no fold here to have a cue.
 *
 * THE CLAIM IS NOT DROPPED, it moved to where its subject moved. The
 * remaining folds — About, and the water module's own — are still asserted
 * by the "every fold shows how to open it" sweep below, and the control that
 * replaced this one is ui-place.mjs, which checks that the two old lists are
 * gone from the markup rather than merely hidden.
 */

section('the bottom row: plain blue links, underlined only on hover (item 5)');

for (const [w, touch] of [[390, true], [1280, false]]) {
  const h = await widgetPage(browser, 'canal', { width: w, height: 1600, sitekit: true, touch });
  const page = h.page;
  await page.waitForTimeout(700);

  const row = await page.evaluate(() => {
    const el = document.querySelector('.dccwl-footnotes');
    const items = Array.from(el.querySelectorAll('.dccwl-fullguide-h'));
    const read = (node) => {
      const after = getComputedStyle(node, '::after');
      const own = getComputedStyle(node);
      const host = node.closest('details') || node.closest('button') || node.closest('a');
      const press = host && 'SUMMARY' === (host.querySelector('summary') || {}).tagName
        ? host.querySelector('summary') : host;
      return {
        label: node.textContent.trim(),
        /* `content` reads "none" when the element has no ::after at all,
         * which is the state item 5 asks for — so "none" is normalised to
         * empty here. Reading it raw is how the first run of this check
         * "found" three marks that do not exist. */
        mark: (() => {
          const c = (after.content || '').replace(/^"|"$/g, '').trim();
          return ('none' === c || 'normal' === c) ? '' : c;
        })(),
        markPx: Math.round(parseFloat(after.fontSize) * 100) / 100,
        labelPx: Math.round(parseFloat(own.fontSize) * 100) / 100,
        markWeight: after.fontWeight,
        labelWeight: own.fontWeight,
        markColor: after.color,
        labelColor: own.color,
        isFold: !!node.closest('details'),
        isLink: !!node.closest('a'),
        tap: press ? Math.round(press.getBoundingClientRect().height) : null,
        aria: press ? press.getAttribute('aria-expanded') : null,
        underline: own.textDecorationLine,
      };
    };
    const tops = new Set(Array.from(el.children)
      .filter((c) => c.getClientRects().length)
      .map((c) => Math.round(c.getBoundingClientRect().top)));
    return {
      items: items.map(read),
      rows: tops.size,
      height: Math.round(el.getBoundingClientRect().height),
      names: items.map((n) => {
        const host = n.closest('summary') || n.closest('button') || n.closest('a');
        return host ? (host.getAttribute('aria-label') || '') : '';
      }),
    };
  });
  row.items.forEach((i) => note(`${w}px ${i.label}${i.mark ? ' ' + i.mark : ''} ` +
    `mark=${i.markPx}px/${i.markWeight} label=${i.labelPx}px/${i.labelWeight} tap=${i.tap}`));

  /* 1 — the label Rob shortened, and the name that still carries the long form. */
  const guide = row.items.find((i) => /^Guide/.test(i.label));
  check(!!guide, `${w}px: the first label reads "Guide"`, row.items.map((i) => i.label).join(' · '));
  const guideName = row.names[row.items.indexOf(guide)];
  /*
   * 1.43.0: the name gained a destination. The prose moved to
   * /wildlife-guide/ and this entry became a LINK, so the name says where it
   * goes — and it still OPENS with "Field Guide", which is the string Rob
   * approved in 1.41.0 and the one the WCAG check below needs.
   */
  checkSame('Field Guide — every species, in words', guideName,
    `${w}px: its accessible name names the destination and still opens "Field Guide"`);
  /* WCAG 2.5.3: the accessible name must CONTAIN the visible label, so a
   * guest who says "tap Guide" is understood. */
  check(guideName.toLowerCase().includes(guide.label.toLowerCase()),
    `${w}px: and contains the visible word (WCAG 2.5.3 label-in-name)`,
    `${guideName} / ${guide.label}`);

  /* 2 — ONE FOLD AND TWO LINKS, AND NO MARK ON ANY OF THEM. */
  /*
   * The prose went to /wildlife-guide/ in 1.43.0 and the credits panel
   * followed it — 108,284 bytes, more than half what was left of the page's
   * markup — so Guide and Credits are LINKS to that page. Only the water
   * module's "About" still expands in place.
   *
   * EVERY LINK IS AN <a>, which is checkable as a rule rather than as an
   * exception now: until 1.44.0 the row held one <button> among them, and
   * that button's different default line box WAS the 0.9px baseline Rob
   * measured in 1.35.0. One element type, one line box.
   */
  const folds = row.items.filter((i) => i.isFold);
  const links = row.items.filter((i) => !i.isFold);
  const guideLink = links.find((i) => i.isLink && /^Guide/.test(i.label));
  checkSame(1, folds.length, `${w}px: one fold in the row — About`,
    folds.map((f) => f.label).join(' · '));
  checkSame(2, links.length, `${w}px: and two that leave the page`,
    links.map((f) => f.label).join(' · '));
  check(links.every((i) => i.isLink),
    `${w}px: every one of them is an <a> — no <button> left to have its own line box`,
    links.map((i) => `${i.label}:${i.isLink}`).join(' '));
  check(!!guideLink, `${w}px: and Guide is one of them`,
    links.map((i) => i.label).join(' · '));
  /* THE MARKS ARE GONE. Asserted as an absence, because "no
   * underline-and-arrow look" is the instruction and a mark creeping back in
   * is exactly the kind of thing a positive-only suite never notices. */
  checkSame([], row.items.filter((i) => i.mark).map((i) => `${i.label}:${i.mark}`),
    `${w}px: no label carries ▾ or › any more (item 5)`);

  /* 3 — site blue, weight 600, no resting underline. */
  const BLUE = 'rgb(0, 107, 207)';
  row.items.forEach((i) => {
    checkSame(BLUE, i.labelColor, `${w}px: ${i.label} is the site blue #006BCF`);
    checkSame('600', i.labelWeight, `${w}px: ${i.label} is weight 600`);
    check(!i.underline.includes('underline'),
      `${w}px: ${i.label} carries NO resting underline`, i.underline);
  });
  /* ...and the row is centred, which is the other half of item 5. Measured
   * against the row's own box rather than asserting a property, because
   * `justify-content` on a wrapped flex row is not the same claim as the
   * labels actually sitting on its centre line. */
  const centred = await page.evaluate(() => {
    const row2 = document.querySelector('.dccwl-footnotes');
    const r = row2.getBoundingClientRect();
    const items = Array.from(row2.children).filter((c) => c.getClientRects().length);
    const first = items[0].getBoundingClientRect();
    const last = items[items.length - 1].getBoundingClientRect();
    return {
      rowMid: Math.round(r.left + r.width / 2),
      itemsMid: Math.round((first.left + last.right) / 2),
      rows: new Set(items.map((c) => Math.round(c.getBoundingClientRect().top))).size,
    };
  });
  note(`${w}px centring ${JSON.stringify(centred)}`);
  if (1 === centred.rows) {
    checkAtMost(2, Math.abs(centred.rowMid - centred.itemsMid),
      `${w}px: the links sit on the row's centre line`, JSON.stringify(centred));
  }

  /* THE UNDERLINE IS THE HOVER STATE. Driven with a real hover, because a
   * `:hover` rule is exactly the kind of thing a computed-style read of an
   * un-hovered element reports as working. */
  const hoverTarget = await page.$('.dccwl-footnotes .dccwl-footnote-link');
  if (hoverTarget && !touch) {
    await hoverTarget.hover();
    await page.waitForTimeout(120);
    const hovered = await page.evaluate(() => {
      const a = document.querySelector('.dccwl-footnotes .dccwl-footnote-link');
      return { dec: getComputedStyle(a).textDecorationLine,
               inner: getComputedStyle(a.querySelector('.dccwl-fullguide-h')).textDecorationLine };
    });
    note(`${w}px hovered ${JSON.stringify(hovered)}`);
    check(hovered.dec.includes('underline') || hovered.inner.includes('underline'),
      `${w}px: hovering underlines it, and nothing else changes`, JSON.stringify(hovered));
  }

  /* 4 — "Tap targets at least 44px tall without changing the look" (item 5). */
  row.items.forEach((i) => checkAtLeast(44, i.tap, `${w}px: ${i.label} keeps a 44px target`));

  /*
   * 5 — THE FOLD STILL REPORTS ITS STATE, now that no mark shows it.
   *
   * The caret flip is gone with the caret, so what is left to assert is the
   * thing that was always the real contract: `<details>`/`<summary>` reports
   * open and closed to a screen reader, and `aria-expanded` is kept in step
   * by sheet.js on `toggle` rather than written into the HTML (1.40.1 — a
   * static `aria-expanded="false"` would CONTRADICT the native state the
   * moment a guest opened it, and with no JavaScript could never be fixed).
   *
   * A guest with a pointer loses nothing by the marks going: the fold still
   * opens in place, under its own label, which is its own cue.
   */
  const folded = await page.evaluate(async () => {
    const d = document.querySelector('.dccwl-footnotes details.dccwl-fullguide');
    d.open = true;
    /* `toggle` fires in a later task, so aria-expanded updates a tick after
     * the property changes. Reading in the same turn measured the state
     * BEFORE the event — a test timing artefact, not a defect. */
    await new Promise((r) => setTimeout(r, 60));
    const h = d.querySelector('.dccwl-fullguide-h');
    return {
      aria: d.querySelector('summary').getAttribute('aria-expanded'),
      mark: (getComputedStyle(h, '::after').content || '').replace(/"/g, '').trim(),
      bodyShown: !!d.querySelector('.dccwl-fullguide-body'),
    };
  });
  note(`${w}px opened ${JSON.stringify(folded)}`);
  checkSame('true', folded.aria, `${w}px: aria-expanded tracks the fold`);
  check('' === folded.mark || 'none' === folded.mark,
    `${w}px: and an OPEN fold grows no mark either`, folded.mark);
  check(folded.bodyShown, `${w}px: the fold still opens its body in place`);

  await page.close();
}

/* The sandbox's own geometry, recorded rather than asserted as the site's:
 * one line at 360 and 390 here, and 320 no worse than the two rows it has
 * had since before this change. */
for (const w of [320, 360, 390]) {
  const h = await widgetPage(browser, 'canal', { width: w, height: 1400, sitekit: true, touch: true });
  await h.page.waitForTimeout(600);
  const m = await h.page.evaluate(() => {
    const el = document.querySelector('.dccwl-footnotes');
    const tops = new Set(Array.from(el.children)
      .filter((c) => c.getClientRects().length)
      .map((c) => Math.round(c.getBoundingClientRect().top)));
    const labels = Array.from(el.querySelectorAll('.dccwl-fullguide-h'));
    const total = labels.reduce((a, n) => a + n.getBoundingClientRect().width, 0);
    return { rows: tops.size, width: Math.round(el.getBoundingClientRect().width),
      labels: Math.round(total), slack: Math.round(el.getBoundingClientRect().width - total) };
  });
  note(`${w}px sandbox row: ${m.rows} row(s), labels ${m.labels}px of ${m.width}px (slack ${m.slack})`);
  if (320 === w) {
    checkAtMost(2, m.rows, `${w}px: no worse than the two rows it already had`);
  } else {
    checkSame(1, m.rows, `${w}px: one line in this sandbox's face`);
  }
  await h.page.close();
}

/* =================== ONE DATE FORMAT, EVERY SURFACE =================== */
/*
 * Rob's ruling: every date a guest sees in the water module reads 07/27/2026.
 * 1.39.1 fixed the popups and REPORTED two places that could still print
 * machine text — the server-rendered fact card and readingTime() in water.js.
 * Both are closed by computing the text once on the server, and both are
 * asserted here on the RENDERED page, with the date shapes that really occur.
 *
 * The facts come from PHP, through Water_Fact's own gate and formatter.
 * Hand-writing them would mean hand-writing the thing under test.
 */
section('the Now tab reads every date as 07/27/2026');

{
  const facts = JSON.parse(execFileSync(process.env.PHP_BIN || 'php',
    [join(HERE, 'render-fixture.php'), 'facts'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const fx = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width: 390, height: 2000, touch: true, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/water.css'],
    body:
      `<script>window.__f=${JSON.stringify(facts)};` +
      `window.fetch=function(){return Promise.resolve({ok:true,status:200,` +
      `json:function(){return Promise.resolve(window.__f);}});};</script>` +
      fx.html + `<script>${fx.config}</script>`,
  });
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(700);
  // The Now tab is where the fact cards live.
  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-water-tab-btn="now"]');
    if (b) { b.click(); }
  });
  await page.waitForTimeout(400);

  const cards = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.dccwl-water-fact').forEach((li) => {
      const label = (li.querySelector('.dccwl-card-label') || {}).textContent || '';
      const date = li.querySelector('.dccwl-water-date');
      out.push({
        label: label.trim(),
        date: date ? date.textContent.replace(/\s+/g, ' ').trim() : null,
        value: (li.querySelector('.dccwl-card-value') || {}).textContent.trim(),
        src: !!li.querySelector('.dccwl-card-srcname'),
      });
    });
    /* VISIBLE text only. document.body.textContent includes the contents of
     * every <script>, and this fixture injects the raw payload in one — so
     * the first version of this check "found" an ISO timestamp that was its
     * own test data. Walk the text nodes and skip script and style. */
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const tag = node.parentElement ? node.parentElement.tagName : '';
        return ('SCRIPT' === tag || 'STYLE' === tag)
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    let visible = '';
    while (walker.nextNode()) { visible += ' ' + walker.currentNode.nodeValue; }
    return { cards: out, page: visible.replace(/\s+/g, ' ') };
  });
  cards.cards.forEach((c) => note(`card ${c.label}: date=${JSON.stringify(c.date)}`));

  /* KEYED BY FIRST APPEARANCE, because the page carries the owner's own
   * almanac cards as well as this fixture's — the seeded "Surface area" row
   * renders server-side with its own date, and keying by label alone let the
   * later card answer for the earlier one. */
  const byLabel = {};
  cards.cards.forEach((c) => { if (!(c.label in byLabel)) { byLabel[c.label] = c; } });

  checkAtLeast(4, cards.cards.length, 'the four facts render as cards');
  check(/07\/27\/2026/.test(byLabel.Wind.date || ''),
    'the live forecast reads its date US-numeric', byLabel.Wind.date);
  check(/\d{1,2}:\d{2} (AM|PM)/.test(byLabel.Wind.date || ''),
    'and keeps the clock time its precision declares', byLabel.Wind.date);
  check(/01\/15\/2026/.test(byLabel['Water level'].date || ''),
    'the winter reading keeps its own day', byLabel['Water level'].date);
  check(/08\/01\/2026/.test(byLabel['Water clarity'].date || ''),
    'a date-only value is not shifted a day', byLabel['Water clarity'].date);

  /* The unparseable one: the card renders, with NO date line — never the
   * string itself. This is guard (a) from 1.39.1, on the page. */
  checkSame(null, byLabel['Surface area'].date,
    'a date that cannot be read prints no date line at all');
  check(byLabel['Surface area'].value.length > 0 && byLabel['Surface area'].src,
    'while the card still shows its value and its source');

  /* EVERY card on the page, the owner's server-rendered almanac rows
   * included: a date line is either a well-formed US date or absent. */
  const malformed = cards.cards
    .filter((c) => null !== c.date)
    .filter((c) => !/\d{2}\/\d{2}\/\d{4}/.test(c.date));
  checkSame([], malformed.map((c) => `${c.label}: ${c.date}`),
    'every date line on the page is a US date — server-rendered cards too');

  /* Nothing anywhere on the page carries a machine timestamp. */
  check(!/\d{4}-\d{2}-\d{2}T/.test(cards.page), 'no ISO timestamp anywhere on the page');
  check(!/0000000Z/.test(cards.page), 'and no seven-digit fraction');
  check(!/Jul 27, 2026|Aug 1, 2026/.test(cards.page),
    'and none of the old locale wording survives');

  /* A SOURCE NAME MAY CARRY A MONTH, AND IT IS NOT A DATE LINE. The stat
   * tiles this used to read are gone (item 6, 1.44.1), so it asks the card
   * that carries the same string: "sampled September 2026" is a MONTH, which
   * Rob pinned explicitly, and the US-date rule above must not rewrite it.
   * The old version of this check read the deleted tile and asserted
   * nothing — a note is not an assertion. */
  const srcNames = await page.evaluate(() => Array.from(
    document.querySelectorAll('.dccwl-water .dccwl-card-srcname')
  ).map((el) => el.textContent.replace(/\s+/g, ' ').trim()));
  note(`card source lines: ${JSON.stringify(srcNames)}`);
  checkAtLeast(1, srcNames.length, 'every reading still names its source on its card');
  check(srcNames.every((x) => !/\d{4}-\d{2}-\d{2}/.test(x)),
    'and no source line carries a machine date', srcNames.join(' | '));

  await page.close();
}

/* ======================= DATES IN MAP POPUPS ======================= */
/*
 * THE LIVE DEFECT 1.39.0 SHIPPED, AND WHY NO SUITE SAW IT.
 *
 * The real /map payload carries ISO 8601 with a SEVEN-digit fraction and a Z
 * — "2026-07-27T04:00:00.0000000Z" — and popups printed it verbatim. Every
 * fixture here used plain "2026-08-01" dates, so the shape that breaks was
 * the one shape never tested. A hand-written fixture can only confirm what
 * its author already believed.
 *
 * So this section does NOT hand-write a payload. It asks PHP for one, built
 * by Water_Live from an Atlas response carrying the live timestamps, and then
 * asserts what the popup SAYS at 390px and 1280px.
 */
section('map popups read dates as 07/27/2026, from the real payload');

for (const [w, touch] of [[390, true], [1280, false]]) {
  for (const season of ['summer', 'winter']) {
    const payload = JSON.parse(execFileSync(process.env.PHP_BIN || 'php',
      [join(HERE, 'render-fixture.php'), 'map', ...(season === 'winter' ? ['--winter'] : [])],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

    const label = `${w}px ${season}`;
    const page = await openChainMap(w, touch ? 844 : 900, touch, payload);

    // Open the first marker that has a popup.
    let opened = false;
    for (const m of await page.$$('.dccwl-map-canvas .leaflet-interactive')) {
      if (touch) { await m.tap(); } else { await m.click(); }
      await page.waitForTimeout(350);
      opened = await page.evaluate(() => !!document.querySelector('.leaflet-popup'));
      if (opened) { break; }
    }
    check(opened, `${label}: a popup opens`);

    const text = await page.evaluate(() => document.querySelector('.leaflet-popup-content')
      .textContent.replace(/\s+/g, ' ').trim());
    note(`${label}: ${text}`);

    const want = season === 'winter' ? '01/15/2026' : '07/27/2026';
    check(text.includes(want), `${label}: the sampled date reads ${want}`, text);
    check(!/\d{4}-\d{2}-\d{2}T/.test(text), `${label}: no raw timestamp survives`, text);
    check(!/0000000Z/.test(text), `${label}: and no seven-digit fraction`, text);
    /* The winter timestamp is local midnight written as T05:00Z. Read in UTC
     * it is still the 15th; read an hour wrong it would be the 14th. The
     * assertion names the day because that is the failure that matters. */
    check(!text.includes(season === 'winter' ? '01/14/2026' : '07/26/2026'),
      `${label}: and never the previous day`, text);

    /* Every date the popup shows, not just the one in the title row. */
    const dates = (text.match(/\d{2}\/\d{2}\/\d{4}/g) || []);
    checkAtLeast(1, dates.length, `${label}: at least one date is printed`, text);

    await page.close();
  }
}

/* The guard behind the server formatter: if a raw timestamp ever reaches the
 * client anyway — a route that bypassed the output gate, a cache from an
 * older release — the popup prints NOTHING for that date rather than the raw
 * string. Asserted by feeding the client exactly what 1.39.0 served. */
section('a raw timestamp reaching the client prints nothing, never raw text');

{
  const raw = JSON.parse(execFileSync(process.env.PHP_BIN || 'php',
    [join(HERE, 'render-fixture.php'), 'map'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  // Put the pre-1.39.1 strings back, exactly as the Director found them.
  raw.waters.forEach((x) => {
    if (x.clarity) { x.clarity.date = '2026-07-27T04:00:00.0000000Z'; }
    if (x.level) { x.level.date = '2026-09-22T04:00:00.0000000Z'; }
  });
  (raw.stations || []).forEach((st) => {
    if (st.reading) { st.reading.date = '2026-07-27T04:00:00.0000000Z'; }
  });

  const page = await openChainMap(390, 844, true, raw);
  for (const m of await page.$$('.dccwl-map-canvas .leaflet-interactive')) {
    await m.tap();
    await page.waitForTimeout(350);
    if (await page.evaluate(() => !!document.querySelector('.leaflet-popup'))) { break; }
  }
  const text = await page.evaluate(() => {
    const p = document.querySelector('.leaflet-popup-content');
    return p ? p.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  note(`raw payload: ${text}`);
  check(!/0000000Z/.test(text), 'the raw timestamp is not printed', text);
  check(!/\d{4}-\d{2}-\d{2}T/.test(text), 'nor any part of its ISO shape', text);
  check(text.length > 0, 'and the rest of the popup still renders', text);
  await page.close();
}

/* ============================ B ============================ */
/*
 * The 1.37.x items Rob asked to KEEP, re-asserted on the rendered page under
 * the same three conditions rather than taken on trust from the release that
 * shipped them. Three of that release's items were green here and wrong on
 * his phone, so "it passed last time" is not evidence about this zip.
 */
section('B — what 1.37.x got right, re-measured under live conditions');

for (const [w, touch] of [[390, true], [1280, false]]) {
  const h = await widgetPage(browser, 'canal', { width: w, height: 1000, sitekit: true, touch });
  const page = h.page;
  const label = `${w}px ${touch ? 'touch' : 'mouse'}`;
  await openWildlife(page);
  await page.waitForTimeout(800);

  /* --- the tab labels are semibold (weight only; the size is Rob's "stays
   *     as it is"). The site serves html{font-weight:700}, so an undeclared
   *     weight would read BOLDER here, not lighter — which is why this is
   *     asked on the host kit. */
  const tabW = await page.evaluate(() => Array.from(document.querySelectorAll('.dccwl-tab'))
    .map((b) => getComputedStyle(b).fontWeight));
  check(tabW.length >= 3 && tabW.every((x) => '600' === x),
    `${label}: every section tab is semibold`, tabW.join('/'));

  /* --- the search text centres on the BAR, not inside what is left of it
   *     after the icon and the clear button. Measured as the input's own
   *     content-box centre against the bar's centre. */
  const search = await page.evaluate(() => {
    const bar = document.querySelector('.dccwl-search');
    const input = document.querySelector('.dccwl-search-input');
    const cs = getComputedStyle(input);
    const br = bar.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    const padL = parseFloat(cs.paddingLeft);
    const padR = parseFloat(cs.paddingRight);
    const textCentre = ir.left + padL + (ir.width - padL - padR) / 2;
    return { align: cs.textAlign, padL, padR,
             off: Math.round((textCentre - (br.left + br.width / 2)) * 100) / 100 };
  });
  note(`${label} search ${JSON.stringify(search)}`);
  checkSame('center', search.align, `${label}: the field centres its text`);
  checkSame(search.padL, search.padR, `${label}: with equal room each side`);
  check(Math.abs(search.off) <= 1,
    `${label}: so the text sits on the bar's centre line`, `${search.off}px off`);

  /* --- Enter applies the query AND blurs the field: the only handle on the
   *     browser's suggestion list and the on-screen keyboard. */
  await page.evaluate(() => {
    const i = document.querySelector('.dccwl-search-input');
    i.focus(); i.value = 'heron'; i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const entered = await page.evaluate(() => {
    const i = document.querySelector('.dccwl-search-input');
    const grid = document.querySelector('.dccwl-guide-grid[data-dccwl-group="animals"]');
    const all = Array.from(grid.children);
    const vis = all.filter((li) => !li.hidden);
    return {
      blurred: document.activeElement !== i,
      total: all.length,
      matches: vis.length,
      named: vis.filter((li) => /heron/i.test(li.textContent)).length,
      names: vis.map((li) => li.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)),
    };
  });
  check(entered.blurred, `${label}: Enter leaves the field, so the keyboard closes`);
  /*
   * NOT "every match says heron". Search covers the name, the scientific
   * name AND the field mark (1.21.0), so the Florida Sandhill Crane matches
   * on its own mark — it is the crane-vs-heron problem, and a guest typing
   * "heron" should be shown the bird that is not one. The assertion is that
   * the list NARROWED and that every bird actually named heron survived.
   */
  check(entered.matches > 0 && entered.matches < entered.total,
    `${label}: and the query narrowed the list`, `${entered.matches} of ${entered.total}`);
  checkAtLeast(6, entered.named,
    `${label}: every bird named heron is in it`, entered.names.join(', '));

  /* --- the pager counter reads at body size. */
  const pager = await page.evaluate(() => {
    const st = document.querySelector('.dccwl-deck-status');
    if (!st) { return null; }
    const cs = getComputedStyle(st);
    return { px: Math.round(parseFloat(cs.fontSize) * 100) / 100, w: cs.fontWeight };
  });
  if (pager) {
    /* 17.5px, Rob's own figure for item 11, and one of the items he lists as
     * WORKING on live. A suite asserting 21.25 here would be asserting a
     * paraphrase of his instruction over the instruction. */
    checkSame(17.5, pager.px, `${label}: the pager counter reads 17.5px`);
  }

  /*
   * --- THE MONTH BAR, ITS ARROWS AND ITS EDGE FADES ARE ALL GONE (1.44.0),
   *     SO THIS BLOCK IS RETIRED RATHER THAN RE-POINTED.
   *
   * It asserted two arrows and that a fade appeared only at an end with
   * something behind it — "a fade means there is more this way", item 7 of
   * the 1.37.0 list. A MENU has no edges to cue and no track to scroll, so
   * neither claim has a subject. The twelve months are a listbox now, and
   * what replaced this is the Month-menu section in ui-deck.mjs: the label
   * reads the choice, Any Month filters nothing, a named month filters, and
   * Safety is never month-filtered.
   *
   * ONE THING FROM IT IS WORTH KEEPING IN WORDS, because it is the reason
   * the strip is gone at all: the settle loop below used to wait for the
   * track to stop moving rather than guessing a duration, after a fixed
   * 250ms read caught it mid-glide with BOTH edges correctly faded and
   * called that a bug. Never time a scroll — wait for it to stop.
   */
  await page.evaluate(() => {
    const i = document.querySelector('.dccwl-search-input');
    i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(400);

  /* --- the species sheet: the × and the centred photo credit. */
  const tile = await page.$('.dccwl-guide-grid[data-dccwl-group="animals"] li:not([hidden]) .dccwl-tile');
  if (touch) { await tile.tap(); } else { await tile.click(); }
  await page.waitForTimeout(900);
  const sheet = await page.evaluate(() => {
    const x = document.querySelector('.dccwl-sheet-close');
    const cr = document.querySelector('.dccwl-photo-credit');
    const xs = x && getComputedStyle(x);
    return {
      hasX: !!x,
      xSize: x ? [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)] : null,
      xLabel: x ? (x.getAttribute('aria-label') || '').trim() : null,
      xShadow: xs ? xs.boxShadow : null,
      creditAlign: cr ? getComputedStyle(cr).textAlign : 'no credit on this species',
    };
  });
  note(`${label} sheet ${JSON.stringify(sheet)}`);
  check(sheet.hasX, `${label}: the sheet carries its × close button`);
  checkSame([46, 46], sheet.xSize, `${label}: a 46px circle`);
  checkSame('Close', sheet.xLabel, `${label}: named "Close" — its own job, not the caller's`);
  checkSame('none', sheet.xShadow, `${label}: no shadow, per the Calendar's spec`);
  if ('no credit' !== sheet.creditAlign.slice(0, 9)) {
    checkSame('center', sheet.creditAlign, `${label}: the photo credit centres`);
  }
  await page.close();
}

/* ======================================================================
 * 1.45.0 — THE NOW TAB: LOADING, FRESHNESS, AND WHAT IS ANNOUNCED.
 *
 * Items 1, 2 and 8 of the Director's 2026-10-22 audit. Every one of them is
 * about a STATE rather than a value, which is why none of the existing
 * assertions in this file could see them: the panel mid-fetch, a reading
 * past its age limit, and what a screen reader is told when either changes.
 *
 * The dates below are built RELATIVE TO NOW, on purpose. A fixed date in a
 * fixture ages a day every day, so "Measured 3 Days Ago" would be true the
 * morning it was written and false for ever after — and the alternative,
 * computing the expected words from the same rule the code uses, would be a
 * test that mirrors the implementation instead of checking it.
 * ====================================================================== */
section('1.45.0 — the Now tab: the skeleton, the freshness line, the announcements');

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/* The month name the stale card must print, from the browser's own list —
 * the same twelve names PHP ships, in the same order. */
function monthNameOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'][m - 1];
}

const STALE_LEVEL_DATE = daysAgoISO(40);    // limit 14  -> stale
const FRESH_CLARITY_DATE = daysAgoISO(3);   // limit 120 -> fresh, in days
const FRESH_OXYGEN_DATE = daysAgoISO(0);    // today

const AGED = {
  enabled: true,
  stale: false,
  facts: [
    { label: 'Water Level', key: 'level',
      value: 'About 3 inches below normal for September',
      short: '3 in. below normal', detail: 'for September', tier: 'live',
      group: 'primary', sourceName: 'Lake County Water Atlas',
      date: STALE_LEVEL_DATE, dateLabel: 'reading', datePrecision: 'day' },
    { label: 'Water Clarity', key: 'clarity', value: '2.95 ft', short: '2.95 ft',
      detail: '', tier: 'published', group: 'primary',
      sourceName: 'Lake County Water Atlas',
      date: FRESH_CLARITY_DATE, dateLabel: 'sampled', datePrecision: 'day' },
    { label: 'Dissolved Oxygen', key: 'oxygen', value: '6.4 mg/L', short: '6.4 mg/L',
      detail: '', tier: 'published', group: 'primary',
      sourceName: 'Lake County Water Atlas',
      date: FRESH_OXYGEN_DATE, dateLabel: 'sampled', datePrecision: 'day' },
  ],
  wind: null,
};

/*
 * A page whose /conditions call is HELD OPEN until the test releases it.
 * That is the only way to see the loading state at all: a stubbed promise
 * that resolves immediately has already been replaced by the time any
 * assertion runs, which is how "it renders nothing while loading" stayed
 * invisible for seven releases.
 */
async function heldWaterPanel(width, payload) {
  const fx = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width, height: 1600, touch: width < 800, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/water.css'],
    body:
      /* EVERY held request is released, not just the last one. The first
       * draft kept a single resolver and the map's own fetch overwrote the
       * conditions one, so the panel stayed in its loading state for ever
       * and four assertions failed against working code. */
      `<script>window.__p=${JSON.stringify(payload)};` +
      `window.__held=[];` +
      `window.__release=function(){window.__held.splice(0).forEach(function(r){r();});};` +
      `window.fetch=function(){return new Promise(function(res){` +
      `window.__held.push(function(){res({ok:true,status:200,` +
      `json:function(){return Promise.resolve(window.__p);}});});});};</script>` +
      fx.html + `<script>${fx.config}</script>`,
  });
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(300);
  /*
   * THE PANEL OPENS ON MAP (1.34.0), SO THE NOW PANE IS HIDDEN.
   *
   * Everything below is about the Now pane, and a hidden pane has no
   * layout: the first draft measured a skeleton card at 0px high and read
   * it as a defect in the skeleton. Choosing the tab the way a guest does
   * is also what makes the heights real.
   */
  /* What the live region said while only the fetch had happened, kept
   * before the tab tap overwrites it — the tap is itself announced (item 8),
   * which is correct behaviour and would otherwise erase the evidence. */
  await page.evaluate(() => {
    const sr = document.querySelector('[data-dccwl-water-status]');
    window.__srAtLoad = sr ? sr.textContent.trim() : null;
  });
  for (const b of await page.$$('[data-dccwl-water-tab-btn]')) {
    if ('now' === await b.getAttribute('data-dccwl-water-tab-btn')) {
      await b.click();
      break;
    }
  }
  await page.waitForTimeout(200);
  return page;
}

{
  const page = await heldWaterPanel(390, AGED);

  /* ---- item 1: the skeleton, while the fetch is still in flight ---- */
  const loading = await page.evaluate(() => {
    const list = document.querySelector('[data-dccwl-water-facts]');
    const skel = Array.from(document.querySelectorAll('.dccwl-card-skel'));
    const bar = document.querySelector('.dccwl-skel');
    const sr = document.querySelector('[data-dccwl-water-status]');
    const strip = document.querySelector('[data-dccwl-water-live]');
    return {
      cards: skel.length,
      isCard: skel.every((c) => c.classList.contains('dccwl-card')),
      ariaHidden: list ? list.getAttribute('aria-hidden') : null,
      stripShown: strip ? !strip.hidden : false,
      noText: skel.every((c) => '' === c.textContent.trim()),
      animated: bar ? getComputedStyle(bar).animationName : null,
      sr: window.__srAtLoad,
      srLive: sr ? sr.getAttribute('aria-live') : null,
      srRole: sr ? sr.getAttribute('role') : null,
      /* The shape that matters: the skeleton occupies real height, so the
       * strip does not jump when the readings land. */
      height: skel.length ? Math.round(skel[0].getBoundingClientRect().height) : 0,
    };
  });
  note(`loading state ${JSON.stringify(loading)}`);
  checkAtLeast(1, loading.cards, 'while the fetch is in flight, skeleton cards are on screen');
  check(loading.isCard, 'and each one IS a card — the real shape, not a bar');
  check(loading.stripShown, 'the strip is revealed for them');
  checkSame('true', loading.ariaHidden, 'the list is aria-hidden: a skeleton is not content');
  check(loading.noText, 'and carries no text at all');
  checkSame('dccwl-skel-sweep', loading.animated, 'the shimmer is running');
  checkAtLeast(40, loading.height, 'a skeleton card holds real height, so nothing jumps when the readings land');
  checkSame('Loading the latest readings', loading.sr, 'and a screen reader is told, politely (item 8)');
  checkSame('polite', loading.srLive, 'aria-live=polite');
  checkSame('status', loading.srRole, 'role=status');

  /* ---- item 2: the readings land, and each says how old it is ---- */
  await page.evaluate(() => window.__release());
  await page.waitForTimeout(600);

  const landed = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-dccwl-water-facts] .dccwl-card'));
    const sr = document.querySelector('[data-dccwl-water-status]');
    return {
      skeletons: document.querySelectorAll('.dccwl-card-skel').length,
      sr: sr ? sr.textContent.trim() : null,
      cards: cards.map((c) => {
        const label = c.querySelector('.dccwl-card-label');
        const value = c.querySelector('.dccwl-card-value');
        const fresh = c.querySelector('.dccwl-card-fresh');
        return {
          label: label ? label.textContent.trim() : '',
          value: value ? value.textContent.trim() : '',
          fresh: fresh ? fresh.textContent.trim() : '',
          stale: c.classList.contains('dccwl-card-stale'),
          bg: getComputedStyle(c).backgroundColor,
          borderColor: getComputedStyle(c).borderTopColor,
          valueColor: value ? getComputedStyle(value).color : '',
          freshColor: fresh ? getComputedStyle(fresh).color : '',
          /* The attribution survives on a stale card: it is this module's
           * integrity claim and must never be what gets greyed away. */
          attr: !!c.querySelector('.dccwl-water-attr'),
        };
      }),
    };
  });
  note(`landed ${JSON.stringify(landed)}`);
  checkSame(0, landed.skeletons, 'the skeleton is gone once the readings land');
  checkSame('Readings updated', landed.sr, 'and the announcement says so (item 8)');

  const byLabel = {};
  landed.cards.forEach((c) => { byLabel[c.label] = c; });

  const lvl = byLabel['Water Level'];
  check(!!lvl, 'the level card rendered');
  if (lvl) {
    check(lvl.stale, 'a 40-day-old level is past its 14-day limit, so the card is marked stale');
    /*
     * ROB'S RULING OF 2026-10-22: "NUMBER, GRAYED, PAST TENSE."
     *
     * 1.45.0 shipped with the freshness sentence REPLACING the reading, and
     * this suite asserted that. He asked for the reading back: greyed,
     * stripped of its tier colour, with the past-tense line beneath it. The
     * assertion is inverted rather than deleted, because "the number is
     * kept" and "the number is gone" are both things a future change could
     * do by accident.
     */
    checkSame('About 3 inches below normal for September', lvl.value,
      'and it KEEPS its reading, verbatim — nothing is rewritten or dropped');
    checkSame(`Last Measured In ${monthNameOf(STALE_LEVEL_DATE)}`, lvl.fresh,
      'with the past-tense line underneath, naming the month');
    check(lvl.attr, 'while the source and the measurement date stay on the card');
    check(lvl.bg !== 'rgb(255, 255, 255)' && lvl.bg !== 'rgba(0, 0, 0, 0)',
      'and it is greyed by a ground of its own', lvl.bg);
    check(lvl.valueColor === lvl.freshColor,
      'the reading itself is greyed, not left black on a grey card',
      `${lvl.valueColor} vs ${lvl.freshColor}`);
    check(!/rgb\(7, 135, 50\)|rgb\(0, 107, 207\)/.test(lvl.borderColor),
      'and the card drops its KEYED tier colour — the key says green means measured today',
      lvl.borderColor);
  }

  const clar = byLabel['Water Clarity'];
  check(!!clar, 'the clarity card rendered');
  if (clar) {
    check(!clar.stale, 'a 3-day-old clarity sample is well inside its 120-day limit');
    checkSame('2.95 ft', clar.value, 'so the reading itself is what the card shows');
    checkSame('Measured 3 Days Ago', clar.fresh, 'with its age under it, in words');
  }

  const oxy = byLabel['Dissolved Oxygen'];
  if (oxy) {
    checkSame('Measured Today', oxy.fresh, "today's sample says today, not \"0 days ago\"");
  }

  /* ---- item 8: switching tab is announced ---- */
  const tabs = await page.$$('[data-dccwl-water-tab-btn]');
  if (tabs.length > 1) {
    const name = (await tabs[1].textContent()).trim();
    await tabs[1].tap();
    await page.waitForTimeout(200);
    const said = await page.evaluate(() => {
      const sr = document.querySelector('[data-dccwl-water-status]');
      return sr ? sr.textContent.trim() : null;
    });
    note(`tab announcement: ${said}`);
    checkSame(`${name} shown`, said, 'choosing a tab is announced by its own visible name');
  } else {
    check(false, 'the water panel offered more than one tab to switch between');
  }

  await page.close();
}

/*
 * AND THE NEGATIVE CONTROL FOR THE SKELETON, which matters as much as the
 * positive one: a page that never loads anything must not be left shimmering.
 */
{
  const page = await heldWaterPanel(390, { enabled: true, facts: [], wind: null });
  await page.evaluate(() => window.__release());
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => {
    const strip = document.querySelector('[data-dccwl-water-live]');
    const sr = document.querySelector('[data-dccwl-water-status]');
    return {
      skeletons: document.querySelectorAll('.dccwl-card-skel').length,
      stripHidden: strip ? strip.hidden : 'no strip',
      sr: sr ? sr.textContent.trim() : null,
    };
  });
  note(`empty answer ${JSON.stringify(after)}`);
  checkSame(0, after.skeletons, 'an empty answer clears the skeleton');
  checkSame(true, after.stripHidden, 'and leaves the strip hidden — a guest sees the almanac, never an error');
  checkSame('No readings are available right now', after.sr,
    'while a screen reader, which was told something was loading, is told how it ended');
  await page.close();
}

await browser.close();
done();
