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

const { page } = await widgetPage(browser, 'month', { width: 390, sitekit: true });

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
section('every toggle is blue; the selected one is marked in gold');

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
  checkSame(BLUE, t.bg, `${t.label}: solid #006BCF at rest`);
  checkSame(WHITE, t.fg, `${t.label}: white text`);
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

// The month pills and the browse chips use a border rather than a shadow —
// they have the room — but the colour rule is the same.
for (const [sel, what] of [['.dccwl-month', 'month pill'], ['.dccwl-subchip', 'browse chip']]) {
  const rows = await page.evaluate((s) => Array.from(document.querySelectorAll(s)).map((b) => {
    const cs = getComputedStyle(b);
    return { pressed: b.getAttribute('aria-pressed') === 'true' || b.classList.contains('dccwl-month-on'),
             bg: cs.backgroundColor, fg: cs.color, bc: cs.borderTopColor };
  }), sel);
  checkAtLeast(2, rows.length, `${what}s are present`);
  check(rows.every((r) => r.bg === BLUE), `every ${what} is solid #006BCF`);
  check(rows.every((r) => r.fg === WHITE), `every ${what} has white text`);
  const sel_on = rows.filter((r) => r.pressed);
  checkSame(1, sel_on.length, `exactly one ${what} is selected`);
  checkSame(GOLD, sel_on[0].bc, `the selected ${what} is marked in gold`);
  check(rows.filter((r) => !r.pressed).every((r) => r.bc !== GOLD),
    `no unselected ${what} is marked in gold`);
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

/* ---- 5. the footnote row: three labels, one look --------------------- */
section('By month matches Field guide and Credits');

const hub = await widgetPage(browser, 'canal', { width: 390, sitekit: true },);
const links = await hub.page.evaluate(() => {
  const row = document.querySelector('.dccwl-footnotes');
  if (!row) { return null; }
  const pick = (n) => {
    const cs = getComputedStyle(n);
    return { text: n.textContent.trim(), fontSize: cs.fontSize, fontWeight: cs.fontWeight,
             fontFamily: cs.fontFamily, color: cs.color, decoration: cs.textDecorationLine,
             bg: cs.backgroundColor, letterSpacing: cs.letterSpacing, transform: cs.textTransform };
  };
  return Array.from(row.querySelectorAll('.dccwl-fullguide-h, .dccwl-footnote-link')).map(pick);
});
check(!!links && links.length >= 3, 'all three labels are in the row',
  links ? links.map((l) => l.text).join(' | ') : 'row missing');
if (links && links.length >= 3) {
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

await browser.close();
done();
