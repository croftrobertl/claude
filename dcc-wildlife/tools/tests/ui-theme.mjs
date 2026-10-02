/**
 * The site theme, measured under the live site kit (1.33.0).
 *
 * Every assertion here is about a decision the owner made on 2026-09-28, and
 * every one of them is a question you cannot answer without the kit loaded —
 * which is why this suite runs with `sitekit: true` and asserts FIRST that the
 * stand-in is still doing its job. A kit that stopped matching would turn this
 * whole suite green while the live page stayed broken, which is exactly the
 * failure the esc_url_raw stub taught in 1.32.1.
 */

import {
  launch, widgetPage, check, checkSame, checkNear, checkAtLeast,
  section, note, done, styleOf, boxOf, boxesOf,
} from './lib.mjs';

const GOLD = 'rgb(244, 218, 98)';    // #F4DA62
const BLUE = 'rgb(0, 107, 207)';     // #006BCF
const CORAL = 'rgb(240, 128, 128)';  // #F08080
const WHITE = 'rgb(255, 255, 255)';
const INK = 'rgb(17, 17, 17)';       // #111

const browser = await launch();

/* ---- 0. the stand-in must still bite -------------------------------- */
section('the site-kit stand-in is doing its job');

/* A TALL viewport on purpose. The hover assertions below move a real mouse
 * to an element's centre, and on an 844px phone viewport Playwright has to
 * scroll first — after which the point it computed can land on whatever
 * scrolled into its place. Measured with elementFromPoint: there is no
 * overlap, the short viewport was the whole story. Nothing here depends on
 * viewport HEIGHT; the widths that matter are asserted at 320/360/390. */
const { page } = await widgetPage(browser, 'month', { width: 390, height: 2400, sitekit: true });

const kitProof = await page.evaluate(() => {
  // A bare input, outside the plugin, inside the kit's scope.
  const probe = document.createElement('input');
  probe.type = 'search';
  document.querySelector('.entry-content').appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = { border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
                radius: cs.borderTopLeftRadius, root: getComputedStyle(document.documentElement).fontSize };
  probe.remove();
  return out;
});
note(`kit on a bare input: ${kitProof.border}, radius ${kitProof.radius}, root ${kitProof.root}`);
checkSame(`2px solid ${GOLD}`, kitProof.border, 'the kit still paints a 2px gold border on an untouched input');
checkSame('30px', kitProof.radius, 'and a 30px radius');
checkSame('20px', kitProof.root, 'and still serves a 20px root');

/* ---- 1. the search box is ONE pill ---------------------------------- */
section('the search box: the gold pill IS the box');

await page.evaluate(() => { const s = document.querySelector('.dccwl-search'); if (s) s.hidden = false; });
await page.waitForTimeout(120);

const field = await styleOf(page, '.dccwl-search-field',
  ['borderTopWidth', 'borderTopColor', 'borderTopLeftRadius', 'backgroundColor']);
checkSame('2px', field.borderTopWidth, 'the wrapper carries the 2px border');
checkSame(GOLD, field.borderTopColor, 'and it is gold, not the old light blue');
checkSame('30px', field.borderTopLeftRadius, 'at the site kit radius');

const input = await styleOf(page, '.dccwl-search-input',
  ['borderTopWidth', 'borderTopLeftRadius', 'backgroundColor']);
checkSame('0px', input.borderTopWidth,
  'THE INPUT HAS NO BORDER — the wrapper pill was removed, not doubled up');
checkSame('0px', input.borderTopLeftRadius, 'and no radius of its own');
check(/rgba\(0, 0, 0, 0\)|transparent/.test(input.backgroundColor),
  'and no background, so the wrapper is the only surface');

// The magnifier and the clear x must be INSIDE the gold pill, not beside it.
const pill = await boxOf(page, '.dccwl-search-field');
const icon = await boxOf(page, '.dccwl-search-icon');
check(icon && pill && icon.x > pill.x && icon.x + icon.w < pill.x + pill.w,
  'the magnifier sits inside the gold pill',
  `pill ${JSON.stringify(pill)} icon ${JSON.stringify(icon)}`);

/* ---- 2. toggle states ------------------------------------------------ */
/* 1.36.0 REVERSES 1.34.0's ink. The selected toggle is coral with WHITE text,
 * matching the hover state exactly — Rob's decision on 2026-10-02, made with
 * the measurement in front of him: white on #F08080 is 2.59:1, below AA at
 * every size, and he ruled that the coral must NOT be deepened to rescue it.
 * It is the same call he made for coral hover in 1.33.0 answer 2: three
 * plugins disagreeing about a pressed button is worse, to him, than the
 * number. The suite pins HIS answer, not the guideline — and if the contrast
 * is ever raised it happens site-wide, not here. The gold ring still stays. */
section('every unselected toggle is blue; the selected one is coral, white and gold');

const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('.dccwl-tab')).map((b) => {
  const cs = getComputedStyle(b);
  return {
    label: b.textContent.trim(),
    pressed: b.getAttribute('aria-pressed'),
    bg: cs.backgroundColor,
    fg: cs.color,
    shadow: cs.boxShadow,
    borderColor: cs.borderTopColor,
    borderWidth: cs.borderTopWidth,
    radius: cs.borderTopLeftRadius,
  };
}));
note(tabs.map((t) => `${t.label}[${t.pressed}]`).join(' '));
checkAtLeast(4, tabs.length, 'there are at least four section tabs');
for (const t of tabs) {
  const chosen = 'true' === t.pressed;
  checkSame(chosen ? CORAL : BLUE, t.bg,
    `${t.label}: ${chosen ? 'coral while selected' : 'solid #006BCF at rest'}`);
  checkSame(WHITE, t.fg,
    `${t.label}: white text, selected or not (1.36.0)`);
  checkSame('30px', t.radius, `${t.label}: the site kit radius`);
}
const on = tabs.filter((t) => 'true' === t.pressed);
const off = tabs.filter((t) => 'true' !== t.pressed);
checkSame(1, on.length, 'exactly one tab is selected');
check(on[0].shadow.includes('244, 218, 98'),
  'the selected tab carries the gold mark', on[0].shadow);
for (const t of off) {
  check(!t.shadow.includes('244, 218, 98'),
    `${t.label}: an unselected tab carries no gold mark`, t.shadow);
}

/* The month pills and the browse chips use a border rather than a shadow —
 * they have the room — but the colour rule is the same.
 *
 * Grouped BY ROW since 1.33.0. Plants gained a chip row of its own, so the
 * page now carries two independent sets and "exactly one chip is selected"
 * is only true within a row. Counting across the page said 2 and looked like
 * a bug in the toggle; it was the test's assumption that was stale. */
for (const [sel, what, rowSel] of [
  ['.dccwl-month', 'month pill', '.dccwl-timeline'],
  ['.dccwl-subchip', 'browse chip', '.dccwl-subchips'],
]) {
  const groups = await page.evaluate(([s, rs]) => {
    const rows = Array.from(document.querySelectorAll(rs));
    return rows.map((row) => ({
      section: row.closest('[data-dccwl-subnav]')?.getAttribute('data-dccwl-subnav') || 'page',
      chips: Array.from(row.querySelectorAll(s)).map((b) => {
        const cs = getComputedStyle(b);
        return {
          label: b.textContent.trim(),
          pressed: b.getAttribute('aria-pressed') === 'true' || b.classList.contains('dccwl-month-on'),
          bg: cs.backgroundColor, fg: cs.color, bc: cs.borderTopColor,
        };
      }),
    })).filter((g) => g.chips.length > 0);
  }, [sel, rowSel]);

  checkAtLeast(1, groups.length, `${what} rows are present`);
  for (const g of groups) {
    const rows = g.chips;
    checkAtLeast(2, rows.length, `${g.section}: ${what}s are present`);
    check(rows.filter((r) => !r.pressed).every((r) => r.bg === BLUE),
      `${g.section}: every unselected ${what} is solid #006BCF`);
    check(rows.filter((r) => !r.pressed).every((r) => r.fg === WHITE),
      `${g.section}: every unselected ${what} has white text`);
    /* 1.36.0: the month pill is coral too. 1.34.0 left it blue because Rob's
     * list did not name it; this time it does, so the exception is gone and
     * every selected control on the page is the same colour. */
    check(rows.filter((r) => r.pressed).every((r) => r.bg === CORAL),
      `${g.section}: the selected ${what} is coral`);
    check(rows.filter((r) => r.pressed).every((r) => r.fg === WHITE),
      `${g.section}: with white text, matching hover`);
    const sel_on = rows.filter((r) => r.pressed);
    checkSame(1, sel_on.length, `${g.section}: exactly one ${what} is selected in this row`);
    checkSame(GOLD, sel_on[0].bc, `${g.section}: the selected ${what} is marked in gold`);
    check(rows.filter((r) => !r.pressed).every((r) => r.bc !== GOLD),
      `${g.section}: no unselected ${what} is marked in gold`);
  }
}

/* ---- 2b. "Peak Now" stays on ONE LINE ------------------------------- */
section('"Peak Now" is one line at every phone width, with the same words');

/*
 * The owner's item 4b, and a regression that has now happened twice: once in
 * 1.32.1 (the tab borders ate the row) and once while building 1.33.0, when a
 * desktop `width: fit-content` rule leaked below the phone breakpoint and took
 * the space straight back. Measuring SPILL is not enough — the label wraps
 * long before it spills. This counts line boxes.
 *
 * The font is inflated 21% to stand in for Raleway, which this sandbox does
 * not have and which measures about that much wider. Without the inflation
 * the sandbox says "fine" and live wraps, which is what happened in 1.32.1.
 */
for (const width of [320, 360, 390]) {
  const p2 = await widgetPage(browser, 'month', {
    width, height: 2400, sitekit: true,
    head: '<style>.dccwl-root{--dccwl-fs-xs:0.9438rem}</style>',   // 0.78 x 1.21
  });
  const lines = await p2.page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.dccwl-tab').forEach((b) => {
      const t = [...b.childNodes].find((n) => 3 === n.nodeType && n.textContent.trim());
      let n = 1;
      if (t) {
        const r = document.createRange();
        r.selectNodeContents(t);
        n = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size || 1;
      }
      out.push({ label: b.textContent.trim(), lines: n });
    });
    return out;
  });
  const wrapped = lines.filter((l) => l.lines > 1).map((l) => l.label);
  note(`${width}px (Raleway stand-in): ${lines.map((l) => `${l.label}=${l.lines}`).join(' ')}`);
  checkSame([], wrapped, `${width}px: no tab label wraps, "Peak Now" included`);
  await p2.page.close();
}

/* ---- 3. hover is coral, on a button and on a toggle ------------------ */
section('hover is coral with white text');

for (const sel of ['.dccwl-tab:not([aria-pressed="true"])', '.dccwl-deck-btn:not([disabled])']) {
  const el = await page.$(sel);
  if (!el) { note(`(${sel} absent)`); continue; }
  await el.hover();
  await page.waitForTimeout(200);
  const cs = await styleOf(page, sel, ['backgroundColor', 'color']);
  checkSame(CORAL, cs.backgroundColor, `${sel} goes coral on hover`);
  checkSame(WHITE, cs.color, `${sel} keeps white text on hover`);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(120);
}

/* ---- 4. body text is black ------------------------------------------- */
section('text is #111, not the old grey');

const greys = await page.evaluate(() => {
  const bad = [];
  document.querySelectorAll('.dccwl-root *').forEach((n) => {
    if (!n.textContent || !n.textContent.trim()) { return; }
    const c = getComputedStyle(n).color;
    if (c === 'rgb(84, 109, 133)') { bad.push(n.className || n.tagName); }
  });
  return [...new Set(bad)];
});
checkSame([], greys, 'nothing still renders in #546d85');
const legend = await styleOf(page, '.dccwl-legend, .dccwl-key, .dccwl-deck-status', ['color']);
if (legend) { checkSame(INK, legend.color, 'a muted-role element is now black'); }

await page.close();

/* ---- 5. the footnote row: FOUR labels, one look ---------------------- */
/* 1.34.0: "About" joined the row (item 4) — Rob asked for the water almanac
 * to open from here and to look and behave exactly like the other three. The
 * count is pinned at four rather than made ">= 3": the claim is that the row
 * holds exactly these labels, and a count that cannot fail is not a test. */
section('Field Guide, Credits, By Month and About are one row, one look');

/*
 * AT 320, 390 AND 1280. The first version of this check asked at 390 only,
 * and the owner's Director was right to ask for all three: the row carries
 * media-query rules of its own, and "the same at one width" is not the claim
 * item 8 makes. The properties are the four the brief names — size, weight,
 * colour, underline — plus family, which is what the host kit was winning.
 */
for (const w of [320, 390, 1280]) {
  const h = await widgetPage(browser, 'canal', { width: w, height: 2400, sitekit: true });
  const rows = await h.page.evaluate(() => {
    const row = document.querySelector('.dccwl-footnotes');
    if (!row) { return null; }
    return Array.from(row.querySelectorAll('.dccwl-fullguide-h')).map((n) => {
      const cs = getComputedStyle(n);
      return { text: n.textContent.trim(), fontSize: cs.fontSize, fontWeight: cs.fontWeight,
               color: cs.color, decoration: cs.textDecorationLine, fontFamily: cs.fontFamily };
    });
  });
  check(!!rows && 4 === rows.length, `${w}px: all four labels are in the row`,
    rows ? rows.map((r) => r.text).join(' | ') : 'row missing');
  if (rows && 4 === rows.length) {
    checkSame(['Field Guide', 'Credits', 'By Month', 'About'], rows.map((r) => r.text),
      `${w}px: the labels are Title Case, in the order Rob listed them (item 17)`);
    note(`${w}px  ` + rows.map((r) => `${r.text}: ${r.fontSize}/${r.fontWeight} ${r.color} ${r.decoration}`).join('   '));
    for (const key of ['fontSize', 'fontWeight', 'color', 'decoration', 'fontFamily']) {
      const values = [...new Set(rows.map((r) => r[key]))];
      checkSame(1, values.length, `${w}px: all four share one ${key}`, JSON.stringify(values));
    }
  }
  await h.page.close();
}

const hub = await widgetPage(browser, 'canal', { width: 390, height: 2400, sitekit: true });
const links = await hub.page.evaluate(() => {
  const row = document.querySelector('.dccwl-footnotes');
  if (!row) { return null; }
  const pick = (n) => {
    const cs = getComputedStyle(n);
    return { text: n.textContent.trim(), fontSize: cs.fontSize, fontWeight: cs.fontWeight,
             fontFamily: cs.fontFamily, color: cs.color, decoration: cs.textDecorationLine,
             bg: cs.backgroundColor, letterSpacing: cs.letterSpacing, transform: cs.textTransform };
  };
  return Array.from(row.querySelectorAll('.dccwl-fullguide-h')).map(pick);
});
check(!!links && 4 === links.length, 'all four labels are in the row',
  links ? links.map((l) => l.text).join(' | ') : 'row missing');
if (links && 4 === links.length) {
  note(links.map((l) => `${l.text}: ${l.fontSize}/${l.fontWeight} ${l.color}`).join('   '));
  const ref = links[0];
  for (const l of links.slice(1)) {
    checkSame(ref.fontSize, l.fontSize, `"${l.text}" matches the size of "${ref.text}"`);
    checkSame(ref.fontWeight, l.fontWeight, `"${l.text}" matches the weight`);
    checkSame(ref.fontFamily, l.fontFamily, `"${l.text}" matches the family`);
    checkSame(ref.color, l.color, `"${l.text}" matches the colour`);
    checkSame(ref.decoration, l.decoration, `"${l.text}" matches the underline`);
    checkSame(ref.letterSpacing, l.letterSpacing, `"${l.text}" matches the letter-spacing`);
    checkSame(ref.transform, l.transform, `"${l.text}" matches the text-transform`);
  }
  // The bug was the kit's blue button ground showing through on the one <button>.
  for (const l of links) {
    check(/rgba\(0, 0, 0, 0\)|transparent/.test(l.bg),
      `"${l.text}" has no button background`, l.bg);
  }
}
await hub.page.close();

/* ---- 6. NO SPECIES EVER SHOWS THE GENERIC FALLBACK ICON --------------- */
section('every species shows its own picture, never the group glyph');

/*
 * The Director found a PAW PRINT beside the Brown Watersnake and the Florida
 * Green Watersnake in "Easily confused with" — next to the one field mark
 * that is supposed to tell them apart. speciesArt() went straight from the
 * species' own drawing to the group glyph and never looked at the
 * photograph, and twenty-seven of fifty-one species have a photograph and no
 * drawing.
 *
 * Two checks, because one would not have caught it: the DATA must give every
 * species something of its own, and the RENDERER must use it.
 */
const art = await widgetPage(browser, 'month', { width: 390, height: 2400, sitekit: true });

const data = await art.page.evaluate(() => {
  const cfg = window.DCC_WL_CFG || {};
  const bare = (cfg.species || []).filter(
    (s) => !(s.src && s.src.thumb) && !s.sprite
  ).map((s) => s.id);
  return { total: (cfg.species || []).length, bare };
});
checkAtLeast(1, data.total, 'the config carries species');
// The round-tailed muskrat ships with no photograph and no drawing, by the
// owner's decision (batch 14), so it renders on the GROUP GLYPH -- the third
// tier of the art rule, which until now had never rendered for anybody. This
// assertion therefore stopped being "the glyph is never used" and became "the
// glyph is used by exactly the species that is meant to use it", which also
// makes it the first live proof that the documented fallback chain works.
checkSame(['muskrat'], data.bare,
  'only the species the owner settled without a photograph falls to the group glyph',
  JSON.stringify(data.bare));

// And the renderer uses it: open a sheet whose look-alike list is all
// photograph-only species, and assert not one glyph is drawn.
await art.page.evaluate(() => {
  const t = document.querySelector('.dccwl-tile[data-dccwl-species="cottonmouth"]');
  (t || document.querySelector('.dccwl-tile')).click();
});
await art.page.waitForTimeout(450);
const icons = await art.page.evaluate(() => Array.from(
  document.querySelectorAll('.dccwl-lookalike-icon')
).map((w) => {
  const kid = w.firstElementChild;
  return {
    name: (w.parentElement.querySelector('.dccwl-lookalike-name') || {}).textContent,
    tag: kid ? kid.tagName.toLowerCase() : null,
    cls: kid ? String(kid.getAttribute('class') || '') : '',
  };
}));
checkAtLeast(2, icons.length, 'the cottonmouth sheet lists look-alikes');
note(icons.map((i) => `${i.name}=${i.tag}.${i.cls.split(' ')[0]}`).join('  '));
const glyphs = icons.filter((i) => i.cls.includes('dccwl-glyph')).map((i) => i.name);
checkSame([], glyphs,
  'not one look-alike falls back to the group glyph — no paw prints on snakes',
  JSON.stringify(glyphs));
check(icons.every((i) => 'img' === i.tag || i.cls.includes('dccwl-sprite') || 'svg' === i.tag),
  'each shows a photograph or its own drawing');
await art.page.close();

/* ---- 7. a disabled navigation control is hidden, and keeps its space --- */
section('a control that cannot be used goes, and its space stays');

const dis = await widgetPage(browser, 'month', { width: 390, height: 2400, sitekit: true });
const nav = await dis.page.evaluate(() => {
  const prev = document.querySelector('.dccwl-deck-prev');
  const next = document.querySelector('.dccwl-deck-next');
  const row = document.querySelector('.dccwl-deck-nav');
  if (!prev || !row) { return null; }
  const cs = getComputedStyle(prev);
  const r = prev.getBoundingClientRect();
  return {
    disabled: prev.disabled,
    visibility: cs.visibility,
    opacity: cs.opacity,
    bg: cs.backgroundColor,
    w: Math.round(r.width), h: Math.round(r.height),
    rowH: Math.round(row.getBoundingClientRect().height),
    nextVisible: getComputedStyle(next).visibility,
  };
});
check(!!nav, 'the deck has a nav row with a Previous control');
if (nav) {
  note(JSON.stringify(nav));
  checkSame(true, nav.disabled, 'at the start of a deck, Previous is disabled');
  checkSame('hidden', nav.visibility, 'so it is HIDDEN — no pale or grey disabled look');
  checkAtLeast(44, nav.w, 'and it keeps its width, so the row does not shift');
  checkAtLeast(44, nav.h, 'and its height');
  checkSame('visible', nav.nextVisible, 'while Next, which can be used, is visible');
  // visibility:hidden is the one property that also takes it out of the tab
  // order and the accessibility tree; assert the behaviour, not the property.
  const focusable = await dis.page.evaluate(() => {
    const prev = document.querySelector('.dccwl-deck-prev');
    prev.focus();
    return document.activeElement === prev;
  });
  checkSame(false, focusable, 'a hidden control cannot take focus');
}

/* ---- 8. the surfaces the owner turned white ------------------------- */
section('the light-blue surfaces the owner named are white');

const surfaces = await dis.page.evaluate(() => {
  const g = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).backgroundColor : null;
  };
  return {
    'A .dccwl-tile-media': g('.dccwl-tile-media'),
    'B .dccwl-tabs': g('.dccwl-tabs'),
    'C .dccwl-timeline': g('.dccwl-timeline'),
    'D .dccwl-subchips': g('.dccwl-subchips'),
  };
});
note(JSON.stringify(surfaces));
for (const [name, bg] of Object.entries(surfaces)) {
  if (null === bg) { continue; }
  checkSame('rgb(255, 255, 255)', bg, `${name} is white`);
}
await dis.page.close();

const sheetW = await widgetPage(browser, 'month', { width: 390, height: 2400, sitekit: true });
/*
 * THE MONTH IS SET FIRST, AND THAT IS NOT A CONVENIENCE.
 *
 * The "Peak season" badge only renders when the species is at peak in the
 * month on screen, and the month on screen is the real one, in canal time.
 * The cottonmouth peaks Apr–Sep and scores 2 in October, so this check passed
 * every day of the 1.33.0 work and began failing on 1 October without a line
 * of code changing — a test whose answer depends on today's date is a test
 * that will mislead somebody eventually. It now asks the dataset which month
 * to stand in and sets it through the widget's own API.
 */
await sheetW.page.evaluate(() => {
  const cfg = window.DCC_WL_CFG || {};
  const peak = (cfg.set && cfg.set.peakScore) || 3;
  const sp = (cfg.species || []).filter((x) => 'cottonmouth' === x.id)[0];
  const m = sp ? (sp.months || []).indexOf(peak) : -1;
  const root = document.querySelector('.dccwl-root');
  if (m >= 0 && root && window.DCCWL_Widget) { window.DCCWL_Widget.setMonth(root, m, true); }
});
await sheetW.page.waitForTimeout(200);
await sheetW.page.evaluate(() => {
  const t = document.querySelector('.dccwl-tile[data-dccwl-species="cottonmouth"]');
  (t || document.querySelector('.dccwl-tile')).click();
});
await sheetW.page.waitForTimeout(450);
const inSheet = await sheetW.page.evaluate(() => {
  const g = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).backgroundColor : null; };
  const danger = document.querySelector('.dccwl-badge-flag-danger');
  const peak = document.querySelector('.dccwl-badge-peak');
  return {
    'E .dccwl-safe': g('.dccwl-safe'),
    'F .dccwl-lookalike-icon': g('.dccwl-lookalike-icon'),
    peakBg: peak ? getComputedStyle(peak).backgroundColor : null,
    peakColor: peak ? getComputedStyle(peak).color : null,
    dangerBg: danger ? getComputedStyle(danger).backgroundColor : null,
    // The BASE badge, with no meaning colour of its own. Every badge the
    // sheet actually renders carries a variant, so the base rule can only be
    // measured on a bare one — and the base rule is what the owner turned
    // white.
    bare: (function () {
      const host = document.querySelector('.dccwl-detail-badges') || document.querySelector('.dccwl-sheet-body');
      const b = document.createElement('span');
      b.className = 'dccwl-badge';
      b.textContent = 'x';
      host.appendChild(b);
      const cs = getComputedStyle(b);
      const out = { bg: cs.backgroundColor, border: cs.borderTopColor, color: cs.color };
      b.remove();
      return out;
    }()),
  };
});
note(JSON.stringify(inSheet));
for (const key of ['E .dccwl-safe', 'F .dccwl-lookalike-icon']) {
  if (null === inSheet[key]) { continue; }
  checkSame('rgb(255, 255, 255)', inSheet[key], `${key} is white`);
}
checkSame('rgb(255, 255, 255)', inSheet.bare.bg, 'G the base badge pill is white');
// A white pill on a white sheet has no shape, so it takes a border in its OWN
// text colour — the owner's instruction, and the reason it is not a hairline.
checkSame(inSheet.bare.color, inSheet.bare.border,
  'and is outlined in its own text colour, so it keeps a shape');

/*
 * THE TWO MEANING COLOURS ARE UNTOUCHED, and the owner said both outright:
 * the solid red Danger badge stays as it is (answer 5G), and the "Peak
 * season" badge keeps its coral text (answer 7) — and with it the coral wash
 * it sits on, which is the same colour family, not the light blue that was
 * being replaced.
 */
check(inSheet.dangerBg && 'rgb(255, 255, 255)' !== inSheet.dangerBg,
  'the Danger badge keeps its solid fill', String(inSheet.dangerBg));
checkSame('rgb(191, 64, 64)', inSheet.peakColor,
  'the "Peak season" badge keeps its coral text');
check(inSheet.peakBg && inSheet.peakBg.includes('240, 128, 128'),
  'and its coral wash, which was never one of the light-blue surfaces',
  String(inSheet.peakBg));
await sheetW.page.close();

await browser.close();
done();
