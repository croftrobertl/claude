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
  openWildlife, launch, widgetPage, check, checkSame, checkNear, checkAtLeast,
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
/*
 * ITEM 5 (1.44.2) — THE SEGMENTED SWITCH IS THE AVAILABILITY CALENDAR'S NOW,
 * SO WHAT THIS SECTION PINS IS REVERSED.
 *
 * It pinned Rob's 1.34.0/1.36.0 answer: every segment solid #006BCF, the
 * selected one coral with white text and a gold inset mark. The Director sent
 * the Calendar's own source (`staff.css` on the Calendar's branch) and asked
 * for it copied exactly, so:
 *
 *   - an UNSELECTED segment is TRANSPARENT over the group's white ground,
 *     with #0A50B2 text;
 *   - the SELECTED one is solid #0A50B2 with white text;
 *   - the group carries a 2px #0A50B2 outline and a 999px radius, and a 2px
 *     rule divides the segments;
 *   - coral is HOVER ONLY, inside (hover:hover) and (pointer:fine).
 *
 * Expected values updated, never loosened — and the gold-mark assertions are
 * REPLACED by the divider and outline that do that job now, not dropped.
 */
section('the segmented switch is the Calendar\'s: blue on white, solid when chosen');

const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('.dccwl-tab')).map((b) => {
  const cs = getComputedStyle(b);
  return {
    label: b.textContent.trim(),
    /* THE SECTION TABS REPORT `aria-selected` SINCE 1.44.0 — they are a
     * real tablist now, and `aria-pressed` is a toggle button's state. The
     * water module's two bars are still `role="group"` toggles and keep
     * `aria-pressed`, so this reads WHICHEVER the control actually sets;
     * pinning one would quietly stop measuring the other bar. */
    pressed: b.getAttribute('aria-selected') || b.getAttribute('aria-pressed'),
    bg: cs.backgroundColor,
    fg: cs.color,
    shadow: cs.boxShadow,
    borderColor: cs.borderTopColor,
    borderWidth: cs.borderTopWidth,
    radius: cs.borderTopLeftRadius,
  };
}));
note(tabs.map((t) => `${t.label}[${t.pressed}]`).join(' '));
/* THREE SINCE 1.44.0, PINNED RATHER THAN LOOSENED. The row was Animals ·
 * Plants · Safety · Peak Now; Peak Now moved into the Month menu as "This
 * Month", where it reads as the month question it always was. Pinned at the
 * exact number because the claim is that the row holds the three SECTIONS
 * `Species::sections()` defines — `checkAtLeast` would pass on two. */
checkSame(3, tabs.length, 'there are three section tabs');
const HEADER = 'rgb(10, 80, 178)';          // --staff-header on the Calendar
const CLEAR = 'rgba(0, 0, 0, 0)';
for (const t of tabs) {
  const chosen = 'true' === t.pressed;
  checkSame(chosen ? HEADER : CLEAR, t.bg,
    `${t.label}: ${chosen ? 'solid #0A50B2 while selected' : 'transparent at rest'}`);
  checkSame(chosen ? WHITE : HEADER, t.fg,
    `${t.label}: ${chosen ? 'white text' : '#0A50B2 text'}`);
}
const on = tabs.filter((t) => 'true' === t.pressed);
const off = tabs.filter((t) => 'true' !== t.pressed);
checkSame(1, on.length, 'exactly one tab is selected');
/* THE GOLD MARK IS GONE WITH THE CORAL — the Calendar separates the states
 * by FILL, not by an added mark. What replaces those two assertions is the
 * construction that does that job: the group's own 2px outline, and the 2px
 * rule between segments. Asserted on the GROUP and on the segments rather
 * than dropped. */
const group = await page.evaluate(() => {
  const g = document.querySelector('.dccwl-tabs');
  if (!g) { return null; }
  const cs = getComputedStyle(g);
  const af = getComputedStyle(g, '::after');
  const segs = Array.from(g.querySelectorAll('.dccwl-tab'));
  return {
    radius: cs.borderTopLeftRadius,
    h: Math.round(g.getBoundingClientRect().height),
    outline: af.borderTopWidth + ' ' + af.borderTopStyle + ' ' + af.borderTopColor,
    firstRadius: segs[0] ? getComputedStyle(segs[0]).borderTopLeftRadius : null,
    lastRadius: segs.length ? getComputedStyle(segs[segs.length - 1]).borderTopRightRadius : null,
    dividers: segs.slice(1).map((b) => getComputedStyle(b).boxShadow),
    size: segs[0] ? getComputedStyle(segs[0]).fontSize : null,
    weight: segs[0] ? getComputedStyle(segs[0]).fontWeight : null,
    line: segs[0] ? getComputedStyle(segs[0]).lineHeight : null,
    segH: segs[0] ? Math.round(segs[0].getBoundingClientRect().height) : null,
  };
});
note(`switch ${JSON.stringify(group)}`);
checkSame('999px', group.radius, 'the group is a 999px pill');
checkSame(44, group.h, 'and 44px tall');
checkSame(`2px solid ${HEADER}`, group.outline,
  "its ::after draws the Calendar's 2px #0A50B2 outline");
checkSame('999px', group.firstRadius, 'the first segment rounds on the left');
checkSame('999px', group.lastRadius, 'the last rounds on the right');
check(group.dividers.every((d) => d.includes('10, 80, 178') && d.includes('inset')),
  'every segment after the first draws the 2px inset rule', group.dividers.join(' | '));
/* 0.7rem of the kit's 20px root IS the Calendar's 14px; the rem keeps a
 * visitor's own text-size setting working, which a literal 14px would not. */
checkSame('14px', group.size, "the segment type is 14px on the kit's root");
checkSame('600', group.weight, 'at weight 600');
checkSame('14px', group.line, 'with line-height 1');
checkSame(44, group.segH, 'and every segment is 44px tall');

/* The month pills and the browse chips use a border rather than a shadow —
 * they have the room — but the colour rule is the same.
 *
 * Grouped BY ROW since 1.33.0. Plants gained a chip row of its own, so the
 * page now carries two independent sets and "exactly one chip is selected"
 * is only true within a row. Counting across the page said 2 and looked like
 * a bug in the toggle; it was the test's assumption that was stale. */
/*
 * THE BROWSE CHIP ROW IS GONE (1.38.0) and is not in this loop any more. The
 * categories are a drop-down list under one pill, so "every unselected chip
 * is solid #006BCF" is not a question about them: a list row is not a chip,
 * and the loop would have to be loosened to include it. The pill and its
 * options are checked on their own terms below instead.
 */
/*
 * THE MONTH PILL LOOP IS GONE TOO (1.44.0), and the loop with it.
 *
 * It iterated one entry — ['.dccwl-month', 'month pill', '.dccwl-timeline'] —
 * checking that every unselected pill in the twelve-month strip was solid
 * #006BCF with white text and that the selected one was coral. The strip is
 * a MENU now: its options are list rows under a chip, not pills on a ground,
 * so the question "is every unselected pill solid blue" is not a question
 * about them any more — exactly as the browse chips stopped being one in
 * 1.38.0, for the same reason, one release earlier.
 *
 * WHAT REPLACED THE CLAIM RATHER THAN DROPPING IT: the chip itself is a
 * control like the category pill and is checked by the pill's own section
 * below (they share one set of rules in widget.css, which is the point of
 * extending the selectors instead of writing a second block); and the
 * CHOSEN option's coral is asserted where the chosen pick-option's is.
 *
 * Nothing is loosened here. A control that no longer exists cannot be
 * measured, and inventing a lenient version of the old check to keep a
 * green tick is this harness's oldest prohibition.
 */

/* ---- 2a2. the category picker speaks the same colour language ------- */
/*
 * ITEM 10 (1.44.1) — THE CHIP IS THE COTTAGE SELECTOR'S NOW, SO WHAT THIS
 * SECTION PINS CHANGED WITH IT.
 *
 * It asserted the blue pill the chips wore from 1.38.0: solid #006BCF with
 * white text. Rob's Director: "Chips don't match the Selector... Bring all of
 * them to the Selector's chip." So the CLOSED pill is the Selector's resting
 * chip — white, 1px #F4DA62, radius 30px, black ink, weight 600 — and the
 * expected values are updated rather than loosened, which is this harness's
 * standing rule when a suite encodes a look that has been superseded.
 *
 * The OPEN list is untouched and still coral-and-white for the chosen row:
 * those are menu options, not chips, and item 10 did not reach them.
 */
section('the category picker: the Selector\'s chip, a coral choice');

const pickColours = await page.evaluate(async () => {
  const nav = document.querySelector('[data-dccwl-subnav]:not([hidden])');
  if (!nav) { return null; }
  const btn = nav.querySelector('[data-dccwl-pick-btn]');
  const read = (el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, fg: cs.color, weight: cs.fontWeight,
             h: Math.round(el.getBoundingClientRect().height) };
  };
  const closedCs = getComputedStyle(btn);
  const closed = Object.assign(read(btn), {
    border: closedCs.borderTopColor,
    borderW: closedCs.borderTopWidth,
    radius: closedCs.borderTopLeftRadius,
  });
  btn.click();
  await new Promise((r) => setTimeout(r, 150));
  const opts = Array.from(nav.querySelectorAll('.dccwl-pick-opt'));
  return {
    closed,
    chosen: read(opts.find((o) => 'true' === o.getAttribute('aria-selected'))),
    others: opts.filter((o) => 'true' !== o.getAttribute('aria-selected')).map(read),
  };
});

if (pickColours) {
  note(JSON.stringify(pickColours.closed) + ' chosen ' + JSON.stringify(pickColours.chosen));
  checkSame('rgb(255, 255, 255)', pickColours.closed.bg,
    "the pill is the Selector's white chip");
  checkSame('rgb(0, 0, 0)', pickColours.closed.fg, 'with its black ink');
  checkSame('rgb(244, 218, 98)', pickColours.closed.border, 'and its gold edge');
  checkSame('1px', pickColours.closed.borderW, 'one pixel of it');
  checkSame('30px', pickColours.closed.radius, "the Selector's 30px radius");
  checkSame('600', pickColours.closed.weight, 'and its weight 600');
  checkAtLeast(44, pickColours.closed.h, 'and the 44px target this plugin keeps');
  checkSame(CORAL, pickColours.chosen.bg, 'the chosen category is coral');
  checkSame(WHITE, pickColours.chosen.fg, 'with white text, as every selected control is since 1.36.0');
  check(pickColours.others.every((o) => o.bg !== CORAL),
    'and no other row is marked as chosen');
  check(pickColours.others.every((o) => o.fg !== WHITE),
    'the rows a guest has not chosen read as ordinary text, not as buttons');
  check(pickColours.others.every((o) => o.h >= 44), 'every row is a 44px target');
}

/* ---- 2b. NO TAB LABEL WRAPS ----------------------------------------- */
section('no section tab wraps at any phone width, whatever face the theme serves');

/*
 * The owner's item 4b, and a regression that has now happened twice: once in
 * 1.32.1 (the tab borders ate the row) and once while building 1.33.0, when a
 * desktop `width: fit-content` rule leaked below the phone breakpoint and took
 * the space straight back. Measuring SPILL is not enough — the label wraps
 * long before it spills. This counts line boxes.
 *
 * "Peak Now" was the label that forced this, and it left the row in 1.44.0
 * for the Month menu. THE CHECK IS KEPT AND IS NOT RELAXED: it was never
 * about that one string. The labels come from Species::sections(), the row
 * is three tabs today and was four until this release, and the next section
 * name is not bounded by anything this file knows — so the assertion stays
 * "no label wraps", at every width, under the inflated face.
 *
 * The font is inflated 21% to stand in for Raleway, which this sandbox does
 * not have and which measures about that much wider. Without the inflation
 * the sandbox says "fine" and live wraps, which is what happened in 1.32.1.
 */
/*
 * TWO BARS SINCE 1.44.2, AND THE INFLATED TOKEN CHANGED WITH THE RULE.
 *
 * The segmented switch takes the Calendar's size from `--dccwl-fs-seg`
 * (0.7rem = its 14px on the kit's root), so inflating `--dccwl-fs-xs` no
 * longer reaches a tab at all — this check would have gone on passing while
 * measuring nothing, which is this harness's oldest prohibition.
 *
 * And the WATER bar is measured beside the species bar, because "Fishing" is
 * the label the Director asked about by name: if 14px with 12px of padding
 * does not fit at 360px, that has to come back as a measurement rather than
 * as a silently changed value.
 */
for (const [which, width] of [
  ['month', 320], ['month', 360], ['month', 390], ['month', 1280],
  ['water', 320], ['water', 360], ['water', 390], ['water', 1280],
]) {
  /* 1280 IS IN THIS LIST BECAUSE THAT IS WHERE THE DEFECT WAS VISIBLE (item
   * 1, 1.44.3): the equal-width segments gave "Fishing" 6px of padding where
   * "Map" and "Now" had 15. A phone-only sweep could not have seen it. */
  const p2 = await widgetPage(browser, which, {
    width, height: 2400, sitekit: true,
    // 0.7 x 1.21, the same Raleway stand-in the row has used since 1.32.1.
    head: '<style>.dccwl-app{--dccwl-fs-seg:0.847rem}</style>',
  });
  /* The water bar ships HIDDEN and water.js reveals it (1.34.0, so a guest
   * with no JavaScript reads every season rather than meeting dead buttons).
   * No script is added here, so without this the segments measure 0px wide
   * and every assertion below passes against nothing — which is why the
   * zero-width guard is there as well. */
  await p2.page.evaluate(() => {
    document.querySelectorAll('[data-dccwl-water-tabs], .dccwl-fish-seasons')
      .forEach((el) => { el.hidden = false; });
  });
  await p2.page.waitForTimeout(150);

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
      let wText = 0;
      if (t) {
        const r2 = document.createRange();
        r2.selectNodeContents(t);
        wText = Math.round(r2.getBoundingClientRect().width);
      }
      const br = b.getBoundingClientRect();
      let tl = 0;
      if (t) {
        const r3 = document.createRange();
        r3.selectNodeContents(t);
        tl = r3.getBoundingClientRect().left;
      }
      out.push({ label: b.textContent.trim(), lines: n, w: wText,
                 box: Math.round(br.width),
                 padL: Math.round((tl - br.left) * 10) / 10,
                 padR: Math.round((br.right - (tl + wText)) * 10) / 10 });
    });
    return out;
  });
  /*
   * ITEM 1 (1.44.3) — NO SEGMENT'S TEXT SITS CLOSER TO ITS EDGE THAN THE
   * CALENDAR'S OWN PADDING: 12px at 390px and wider, 8px under 390px.
   *
   * The Director measured 59px fixed segments at 1280px, which left
   * "Fishing" 6px each side where "Map" and "Now" had 15 — the longest label
   * getting the least room, because `flex: 1 1 0` made every segment an
   * equal share of the row. The segments are sized to their own labels now.
   *
   * Measured from the TEXT to the segment's box, not read off
   * `padding-left`: the declaration is not the question, where the glyphs
   * actually land is.
   */
  const PAD = width < 390 ? 8 : 12;
  const tight = lines
    .filter((l) => Math.min(l.padL, l.padR) < PAD - 0.5)
    .map((l) => `${l.label} ${l.padL}/${l.padR}`);
  checkSame([], tight,
    `${which} ${width}px: every segment keeps ${PAD}px between its text and its edges`);
  /* And no more than its padding either: a segment wider than its label is
   * the equal-width layout coming back. One pixel of slack for rounding. */
  const loose = lines
    .filter((l) => Math.max(l.padL, l.padR) > PAD + 1)
    .map((l) => `${l.label} ${l.padL}/${l.padR}`);
  checkSame([], loose,
    `${which} ${width}px: and is no wider than its label needs`, loose.join(' | '));

  const wrapped = lines.filter((l) => l.lines > 1).map((l) => l.label);
  note(`${which} ${width}px (Raleway stand-in): ` +
    lines.map((l) => `${l.label}=${l.lines}line/${l.w}px in ${l.box}px pad ${l.padL}/${l.padR}`).join(' '));
  checkSame([], wrapped, `${which} ${width}px: no tab label wraps`);
  /* SPILL, separately from wrapping: a nowrap label that does not fit simply
   * overflows its segment, which counts one line and looks fine to the check
   * above. The Calendar's segments are nowrap, so this is the question that
   * actually answers "does Fishing fit at 360". */
  const spilled = lines.filter((l) => l.w > l.box + 1).map((l) => `${l.label} ${l.w}>${l.box}`);
  checkSame([], spilled, `${which} ${width}px: no label is wider than its segment`);
  /* A SEGMENT WITH NO WIDTH IS NOT A PASS. */
  checkAtLeast(1, lines.length, `${which} ${width}px: the bar rendered its segments`);
  checkSame([], lines.filter((l) => l.box < 20).map((l) => l.label),
    `${which} ${width}px: and every segment has a real width`);
  await p2.page.close();
}

/* ---- 3. hover is coral, on a button and on a toggle ------------------ */
/*
 * ON A MOUSE PAGE SINCE 1.44.2, AND THAT IS THE POINT OF THE SECTION NOW.
 *
 * The segment's coral moved inside `@media (hover: hover) and (pointer:
 * fine)` with the Calendar's own hover rule (item 5), so on this file's
 * default TOUCH page it correctly does not apply — and the check read the
 * resting colour and called the rule broken. The guard is deliberate (1.38.0:
 * a tapped control keeps :hover on a phone until something else is touched),
 * so the honest test is to hover with a real pointer, and ALSO to assert that
 * a touch page does not get it.
 */
section('hover is coral with white text — with a pointer, and not without one');

const hoverPage = (await widgetPage(browser, 'month',
  { width: 1280, height: 2400, sitekit: true, touch: false })).page;
await hoverPage.waitForTimeout(400);

for (const sel of ['.dccwl-tab:not([aria-selected="true"]):not([aria-pressed="true"])', '.dccwl-deck-btn:not([disabled])']) {
  const el = await hoverPage.$(sel);
  if (!el) { note(`(${sel} absent)`); continue; }
  await el.hover();
  await hoverPage.waitForTimeout(200);
  const cs = await styleOf(hoverPage, sel, ['backgroundColor', 'color']);
  checkSame(CORAL, cs.backgroundColor, `${sel} goes coral on hover`);
  checkSame(WHITE, cs.color, `${sel} keeps white text on hover`);
  await hoverPage.mouse.move(0, 0);
  await hoverPage.waitForTimeout(120);
}

/* THE NEGATIVE HALF: a phone must NOT keep the coral on the last segment a
 * finger touched. Asked of the media query itself, because a hover cannot be
 * simulated on a touch page — which is exactly why the guard exists. */
const touchHover = await page.evaluate(() => ({
  fine: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
}));
checkSame(false, touchHover.fine,
  'the touch page does not match (hover: hover) and (pointer: fine)');
await hoverPage.close();

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

/* ---- 5. the footnote row: THREE labels, one look --------------------- */
/* 1.34.0: "About" joined the row (item 4) — Rob asked for the water almanac
 * to open from here and to look and behave exactly like the others. The count
 * is PINNED rather than made ">= 2": the claim is that the row holds exactly
 * these labels, and a count that cannot fail is not a test.
 *
 * IT WENT FROM FOUR TO THREE IN 1.44.0, and that is a consequence rather
 * than a preference. "By Month" was a <button> that opened the month-picker
 * PANEL, and it was the only door to it ("go('month') appears nowhere else",
 * 1.27.0). Rob removed the hub and its panels, so the door led nowhere; the
 * Month menu on the guide's own control row is what replaced the panel. */
section('Guide, Credits and About are one row, one look');

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
  check(!!rows && 3 === rows.length, `${w}px: all three labels are in the row`,
    rows ? rows.map((r) => r.text).join(' | ') : 'row missing');
  if (rows && 3 === rows.length) {
    /* "Guide", not "Field Guide", since 1.41.0: Rob shortened the first
     * label to buy back the width the row's new carets cost. The accessible
     * name is still "Field Guide" — ui-live.mjs asserts that, and that it
     * contains the visible word. Pinned, not loosened: the claim is that the
     * row holds exactly these labels in this order. */
    checkSame(['Guide', 'Credits', 'About'], rows.map((r) => r.text),
      `${w}px: the labels are Title Case, in the order Rob listed them (item 17)`);
    note(`${w}px  ` + rows.map((r) => `${r.text}: ${r.fontSize}/${r.fontWeight} ${r.color} ${r.decoration}`).join('   '));
    /* `decoration` left this list in 1.44.0 with item 5: the resting state
     * is NO underline and the underline is the hover/focus cue, so "all
     * three share one decoration" is now trivially true of `none` and says
     * nothing. ui-live.mjs asserts the absence AND drives a real hover,
     * which is the stronger version of the same claim. */
    for (const key of ['fontSize', 'fontWeight', 'color', 'fontFamily']) {
      const values = [...new Set(rows.map((r) => r[key]))];
      checkSame(1, values.length, `${w}px: all three share one ${key}`, JSON.stringify(values));
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
/* THREE SINCE 1.44.0 — "By Month" left the row with the month-picker panel
 * it was the only door to. Pinned, not loosened. */
check(!!links && 3 === links.length, 'all three labels are in the row',
  links ? links.map((l) => l.text).join(' | ') : 'row missing');
if (links && 3 === links.length) {
  note(links.map((l) => `${l.text}: ${l.fontSize}/${l.fontWeight} ${l.color}`).join('   '));
  const ref = links[0];
  for (const l of links.slice(1)) {
    checkSame(ref.fontSize, l.fontSize, `"${l.text}" matches the size of "${ref.text}"`);
    checkSame(ref.fontWeight, l.fontWeight, `"${l.text}" matches the weight`);
    checkSame(ref.fontFamily, l.fontFamily, `"${l.text}" matches the family`);
    checkSame(ref.color, l.color, `"${l.text}" matches the colour`);
    /* Item 5: NONE of them is underlined at rest, so this asserts they
     * agree on that — and ui-live.mjs drives a real hover to prove the
     * underline arrives with it, which the resting value cannot show. */
    checkSame(ref.decoration, l.decoration, `"${l.text}" matches the resting underline (none)`);
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
    /* 'C .dccwl-timeline' retired in 1.44.0 with the twelve-month strip, and
     * 'D .dccwl-subchips' in 1.38.0 with the sideways category row. Neither
     * has a replacement entry, for the same reason in both cases: a chip
     * that opens a menu is a control ON the page, not a tinted GROUND under
     * a row of pills, so there is no surface left here to have turned
     * white. `.dccwl-tabs` is the last of the three grounds Rob named. */
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

/* ==================================================================
 * THE TILE PHOTO PICKS THE RENDITION IT NEEDS (1.42.0).
 *
 * The markup contract is asserted in test-render.php. What that cannot
 * see is the only thing a guest experiences: WHICH FILE the browser
 * actually fetches. Through 1.41.1 it was always the 320, on every
 * screen, because there was no srcset to choose from — so the hub's
 * tile was drawn from 320 pixels into 380 device pixels at 1280 and
 * 807 at 2560.
 *
 * Measured, not reasoned about: `currentSrc` after layout. The narrow
 * case is asserted too, so a `sizes` that simply always picks the big
 * file cannot pass this as an improvement.
 * ================================================================== */
section('the tile photo picks its rendition by width');

for (const [w, dpr, want, why] of [
  /*
   * THE PHONE STOP IS TUNED, AND THESE THREE ROWS ARE WHY.
   *
   * An honest 45vw made a DPR-2 phone fetch the 600 for a FOUR PIXEL
   * shortfall (324 needed against a 320 file) — 43 KB instead of 18 KB
   * per visible tile, measured, for nothing anyone can see. 40vw keeps
   * that phone on exactly the file and the bytes it got in 1.41.1, and
   * still sends the 600 to the DPR-3 phone that genuinely needs 504
   * device pixels, and to every desktop from 1024 up.
   *
   * So the rule this pins is: NO PHONE PAYS MORE THAN IT DID, and every
   * screen that was being under-served stops being.
   */
  [390, 2, '-320.jpg', 'a DPR-2 phone keeps the light file it already had'],
  [390, 3, '-600.jpg', 'a DPR-3 phone — Rob reviews on one — gets the sharper file'],
  [1680, 2, '-600.jpg', 'and so does a wide desktop'],
]) {
  const t = await widgetPage(browser, 'canal', {
    width: w, height: 1000, sitekit: true, touch: w < 700, dpr,
  });
  await openWildlife(t.page);
  await t.page.waitForTimeout(500);
  const got = await t.page.evaluate(() => {
    const img = Array.from(document.querySelectorAll('.dccwl-tile-photo'))
      .find(i => i.getBoundingClientRect().width > 0 && i.currentSrc);
    if (!img) { return null; }
    const r = img.getBoundingClientRect();
    return {
      file: img.currentSrc.split('/').pop(),
      css: Math.round(r.width),
      need: Math.round(r.width * window.devicePixelRatio),
    };
  });
  check(!!got, `a laid-out tile photo was found at ${w}px, DPR ${dpr}`);
  if (got) {
    note(`${w}px @${dpr}x: tile ${got.css} CSS px, needs ${got.need} device px, fetched ${got.file}`);
    check(got.file.endsWith(want), `${why} (${got.file})`);
  }
  await t.page.close();
}

await browser.close();
done();
