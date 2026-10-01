/**
 * The map control bar: one bar, two shapes, chosen by measurement (1.33.0).
 *
 * The owner's decision, and the contract this suite holds him to:
 *  - where the full six-control bar fits on one row, it IS the old bar —
 *    the "Colour by:" label and the three-button segmented control, which
 *    are the pattern from his Croatia template;
 *  - where it does not fit, two menus: "Colour: <choice>" and "Layers",
 *    with Fullscreen inside Layers;
 *  - ONE ROW and NOTHING OFF-SCREEN at every width. The option-C render
 *    sheet showed 3px off-screen at 320px and he asked for it closed, so
 *    this suite fails on a single pixel of overflow;
 *  - the switch is a MEASUREMENT, not a width. The test for that is a
 *    negative one: make the bar narrow WITHOUT changing the viewport and
 *    the bar must still collapse.
 *
 * The Raleway stand-in: the sandbox has no Raleway, and the serif fallback
 * measures about 21% narrower than the real face. Where this suite asks
 * "does it fit", it inflates the bar's font by 21% first, so a bar that
 * only fits in the fallback font fails here rather than on his phone.
 */

import {
  launch, buildPage, rendered, asset,
  check, checkSame, section, note, done, skipSuite,
} from './lib.mjs';

const browser = await launch();
if (!browser) { skipSuite('no chromium'); }

const MAP_DATA = {
  enabled: true,
  waters: [
    { id: '1', name: 'Lake Dora', lat: 28.8003, lon: -81.6706, clarity: { value: 1.1, units: 'm', median: 1.0, ratio: 1.1, date: '2026-08-01', age: 20, station: 'A', url: '' }, level: null, depthMap: null, ageDays: 20 },
    { id: '2', name: 'Lake Harris', lat: 28.7419, lon: -81.8069, clarity: null, level: { value: 62.5, units: 'ft', norm: 62.0, inches: 6, datum: 'NAVD88' }, depthMap: null, ageDays: 40 },
  ],
  stations: [], ramps: [],
  property: { lat: 28.7936, lon: -81.6431, name: 'Dora Canal Court' },
};

const FONT_INFLATE = 1.21;

async function openMap(width, height) {
  const fixture = rendered('water', '--enable');
  const page = await buildPage(browser, {
    width, height,
    css: ['assets/css/app.css', 'assets/css/water.css', 'assets/vendor/leaflet/leaflet.css'],
    head: '<link rel="stylesheet" data-dccwl-leaflet="1" href="data:text/css,">',
    body: fixture.html + `<script>${fixture.config}</script>`,
  });
  await page.route('**/*.png', (route) => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  }));
  await page.addScriptTag({ content: asset('assets/vendor/leaflet/leaflet.js') });
  await page.addScriptTag({ content: asset('assets/js/water-map.js') });
  await page.evaluate((data) => {
    window.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
  }, MAP_DATA);
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/water.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(150);
  /* 1.34.0: the map is its own tab and the panel opens on it, so the open
   * button is reachable without pressing anything first. */
  const btn = await page.$('[data-dccwl-map-open]');
  if (!btn) { return { page, opened: false }; }
  await btn.click();
  await page.waitForTimeout(900);

  // Raleway stand-in, then force a re-measure with the real widths.
  await page.evaluate((mul) => {
    const bar = document.querySelector('.dccwl-map-bar');
    if (!bar) return;
    const base = parseFloat(getComputedStyle(bar).fontSize) || 16;
    bar.style.fontSize = (base * mul) + 'px';
    if (bar.dccwlFit) bar.dccwlFit();
  }, FONT_INFLATE);
  await page.waitForTimeout(250);
  return { page, opened: true };
}

/** Everything the contract is stated in terms of, read off the live bar. */
async function readBar(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('.dccwl-map-bar');
    if (!bar) return null;
    const br = bar.getBoundingClientRect();
    const vis = (el) => el && !el.hidden && el.getBoundingClientRect().width > 0;
    const kids = Array.from(bar.children).filter(vis);
    // One row = every visible child shares the same vertical band.
    const tops = kids.map((k) => Math.round(k.getBoundingClientRect().top));
    const rows = new Set(tops).size;
    // Off-screen: past the bar's own right edge, or past the viewport's.
    let over = 0;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      over = Math.max(over, Math.round(r.right - br.right), Math.round(r.right - window.innerWidth));
    }
    const seg = bar.querySelector('.dccwl-seg');
    const btns = Array.from(bar.querySelectorAll('.dccwl-drop-btn, .dccwl-seg-btn')).filter(vis);
    return {
      compact: bar.classList.contains('dccwl-map-bar--compact'),
      rows,
      height: Math.round(br.height),
      overflow: Math.max(0, over),
      scrollOverflow: Math.max(0, bar.scrollWidth - bar.clientWidth),
      segVisible: vis(seg),
      labelVisible: vis(bar.querySelector('.dccwl-seg-label')),
      buttons: btns.map((b) => b.textContent.trim()),
      minTap: Math.min(...btns.map((b) => Math.round(b.getBoundingClientRect().height))),
      barWidth: Math.round(br.width),
    };
  });
}

const WIDTHS = [320, 390, 768, 1280];
const seen = {};

for (const w of WIDTHS) {
  section(`${w}px`);
  const { page, opened } = await openMap(w, 900);
  if (!opened) { check(false, `the map opens at ${w}px`); await page.close(); continue; }
  const bar = await readBar(page);
  if (!bar) { check(false, `the bar exists at ${w}px`); await page.close(); continue; }
  seen[w] = bar;

  note(`${bar.compact ? 'COMPACT (two menus)' : 'FULL (label + segmented control)'} — ` +
       `${bar.rows} row, ${bar.height}px tall, ${bar.overflow}px off-screen, ` +
       `buttons: ${bar.buttons.join(' | ')}`);

  checkSame(1, bar.rows, `${w}px — the bar is one row`);
  checkSame(0, bar.overflow, `${w}px — nothing sits past the right edge`);
  checkSame(0, bar.scrollOverflow, `${w}px — and the bar itself does not scroll`);
  check(bar.minTap >= 44, `${w}px — every button still clears the 44px tap floor`,
    `shortest is ${bar.minTap}px`);

  if (bar.compact) {
    checkSame(false, bar.segVisible, `${w}px — the segmented control is put away`);
    checkSame(2, bar.buttons.length, `${w}px — exactly two menus`);
    check(/Colour|Color/i.test(bar.buttons[0]),
      `${w}px — the first menu names the colouring`, bar.buttons[0]);
    check(/Clarity/i.test(bar.buttons[0]),
      `${w}px — and shows which one is on`, bar.buttons[0]);
  } else {
    checkSame(true, bar.segVisible, `${w}px — the segmented control is the real one`);
    checkSame(true, bar.labelVisible, `${w}px — and it keeps its "Colour by:" label`);
    check(bar.buttons.length >= 4,
      `${w}px — the full set of controls is on the bar`, bar.buttons.join(' | '));
  }
  await page.close();
}

section('the owner\'s two ends of the range');
check(seen[1280] && !seen[1280].compact, '1280px keeps today\'s bar, exactly as he asked');
check(seen[320] && seen[320].compact, '320px gets the two menus');
check(seen[390] && seen[390].compact, '390px gets the two menus');
note(`768px resolved to: ${seen[768] ? (seen[768].compact ? 'COMPACT' : 'FULL') : '?'} — ` +
     'whichever the measurement gives, which is the point');

/* ---------------------------------------------------------------------- */
section('the switch is a measurement, not a width');

{
  // A WIDE viewport with a NARROW bar. If the decision were keyed to the
  // window, this would stay full and be broken; it must collapse.
  const { page, opened } = await openMap(1280, 900);
  if (opened) {
    const before = await readBar(page);
    checkSame(false, before.compact, 'at 1280px in a full-width sheet the bar is full');

    await page.evaluate(() => {
      const shell = document.querySelector('.dccwl-map-bar').parentElement;
      shell.style.width = '300px';
    });
    await page.waitForTimeout(400);   // ResizeObserver, then a frame
    const after = await readBar(page);
    note(`same 1280px window, bar squeezed to ${after.barWidth}px — ` +
         `${after.compact ? 'COMPACT' : 'FULL'}, ${after.rows} row, ${after.overflow}px off-screen`);
    checkSame(true, after.compact, 'squeezing the sheet alone collapses the bar');
    checkSame(1, after.rows, 'and it is still one row');
    checkSame(0, after.overflow, 'and still nothing off-screen');

    // And back again: the decision is not one-way.
    await page.evaluate(() => {
      document.querySelector('.dccwl-map-bar').parentElement.style.width = '';
    });
    await page.waitForTimeout(400);
    const back = await readBar(page);
    checkSame(false, back.compact, 'and giving the width back restores the full bar');
    await page.close();
  } else {
    check(false, 'the map opens for the measurement test');
  }
}

/* ---------------------------------------------------------------------- */
section('both menus work by keyboard, and say what they are to a reader');

{
  const { page, opened } = await openMap(390, 900);
  if (opened) {
    const a11y = await page.evaluate(() => {
      const bar = document.querySelector('.dccwl-map-bar');
      const btns = Array.from(bar.querySelectorAll('.dccwl-drop-btn[aria-haspopup="true"]'))
        .filter((b) => !b.hidden && b.getBoundingClientRect().width > 0);
      return btns.map((b) => ({
        text: b.textContent.trim(),
        expanded: b.getAttribute('aria-expanded'),
        haspopup: b.getAttribute('aria-haspopup'),
        label: b.getAttribute('aria-label'),
        focusable: b.tabIndex >= 0,
      }));
    });
    checkSame(2, a11y.length, 'two menu buttons in the compact bar');
    for (const b of a11y) {
      checkSame('false', b.expanded, `"${b.text}" starts collapsed and says so`);
      checkSame('true', b.haspopup, `"${b.text}" announces that it opens a menu`);
      checkSame(true, b.focusable, `"${b.text}" is reachable by keyboard`);
    }

    // Open the Colour menu from the keyboard alone.
    const opened2 = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.dccwl-map-bar .dccwl-drop-btn[aria-haspopup="true"]'))
        .filter((b) => !b.hidden)[0];
      btn.focus();
      btn.click();   // what Enter/Space dispatch on a <button>
      const panel = btn.nextElementSibling;
      return {
        expanded: btn.getAttribute('aria-expanded'),
        panelShown: !panel.hidden,
        radios: panel.querySelectorAll('input[type="radio"]').length,
        checked: panel.querySelector('input[type="radio"]:checked') !== null,
        headed: !!panel.querySelector('.dccwl-drop-head'),
      };
    });
    checkSame('true', opened2.expanded, 'the Colour menu opens from the keyboard');
    checkSame(true, opened2.panelShown, 'and its panel is shown');
    checkSame(3, opened2.radios, 'with the three colourings as radio rows');
    checkSame(true, opened2.checked, 'and the current one already selected');
    checkSame(true, opened2.headed, 'under a heading naming what the choice is');

    /* Escape, for real: through the browser, so sheet.js's document-capture
     * handler runs exactly as it does on the phone. Dispatching a synthetic
     * keydown on the button proved nothing — that listener stops propagation,
     * so the synthetic event never reached the bar, and the first version of
     * this suite was testing a path no guest can take. */
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const escaped = await page.evaluate(() => {
      const bar = document.querySelector('.dccwl-map-bar');
      const btn = Array.from(bar.querySelectorAll('.dccwl-drop-btn[aria-haspopup="true"]'))
        .filter((b) => !b.hidden)[0];
      return {
        expanded: btn.getAttribute('aria-expanded'),
        focused: document.activeElement === btn,
        sheetStillOpen: !!document.querySelector('.dccwl-map-bar'),
      };
    });
    checkSame('false', escaped.expanded, 'Escape closes the menu');
    checkSame(true, escaped.focused, 'and focus lands back on the button that opened it');
    checkSame(true, escaped.sheetStillOpen,
      'and it does NOT tear down the whole map sheet behind it');

    // A second Escape, with nothing open to claim it, closes the sheet.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    checkSame(false, await page.evaluate(() => !!document.querySelector('.dccwl-map-bar')),
      'a second Escape, with no menu open, closes the sheet as it always did');

    await page.close();
  } else {
    check(false, 'the map opens for the keyboard test');
  }
}

section('an open menu is not painted over by the map\'s own controls');

{
  /* Leaflet's attribution runs along the bottom of the canvas, which is where
   * a menu opening upwards from the bar lands. At the bar's old z-index the
   * attribution won, so the last row of an open menu was both covered and
   * unclickable — true of the Layers menu since it shipped. elementFromPoint
   * is the honest test: not "is it visible" but "what would the tap hit". */
  const { page, opened } = await openMap(320, 820);
  if (opened) {
    const hits = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.dccwl-map-bar .dccwl-drop-btn[aria-haspopup="true"]'))
        .filter((b) => !b.hidden);
      const out = [];
      for (const b of btn) {
        b.click();
        const panel = b.nextElementSibling;
        const r = panel.getBoundingClientRect();
        const probes = [
          [r.left + 20, r.top + 18],
          [r.left + r.width / 2, r.top + r.height / 2],
          [r.left + r.width / 2, r.bottom - 8],
        ];
        out.push({
          menu: b.textContent.trim(),
          owned: probes.every((pt) => panel.contains(document.elementFromPoint(pt[0], pt[1]))),
          intruder: probes.map((pt) => {
            const el = document.elementFromPoint(pt[0], pt[1]);
            return panel.contains(el) ? null : (el ? (el.className || el.tagName) + '' : 'nothing');
          }).filter(Boolean)[0] || null,
        });
        b.click();
      }
      return out;
    });
    for (const h of hits) {
      checkSame(true, h.owned,
        `the whole of the ${h.menu} panel takes its own taps`,
        h.intruder ? `something else is on top: ${h.intruder}` : '');
    }
    await page.close();
  } else {
    check(false, 'the map opens for the stacking test');
  }
}

section('Fullscreen moves into the Layers menu when the bar is compact');

{
  const { page, opened } = await openMap(390, 900);
  if (opened) {
    const fs = await page.evaluate(() => {
      const bar = document.querySelector('.dccwl-map-bar');
      const inPanel = bar.querySelector('.dccwl-drop-panel .dccwl-drop-action');
      const onBar = Array.from(bar.children).find(
        (c) => c.classList.contains('dccwl-bar-action') && !c.hidden);
      return {
        supported: typeof bar.parentElement.requestFullscreen === 'function',
        inPanel: !!inPanel && !inPanel.hidden,
        onBar: !!onBar,
      };
    });
    if (fs.supported) {
      checkSame(true, fs.inPanel, 'Fullscreen has moved inside the Layers menu');
      checkSame(false, fs.onBar, 'and is no longer a button on the bar');
    } else {
      note('fullscreen is not offered in this engine, so there is nothing to move');
    }
    await page.close();
  } else {
    check(false, 'the map opens for the keyboard test');
  }
}

/* ---------------------------------------------------------------------- */
section('one piece of state, whichever shape is showing');

{
  const { page, opened } = await openMap(1280, 900);
  if (opened) {
    // Choose "Level" on the full bar, then squeeze it and check the menu agrees.
    const agreed = await page.evaluate(async () => {
      const bar = document.querySelector('.dccwl-map-bar');
      const btns = Array.from(bar.querySelectorAll('.dccwl-seg-btn'));
      btns[1].click();                                  // Level
      const pressed = btns[1].getAttribute('aria-pressed');
      bar.parentElement.style.width = '300px';
      await new Promise((r) => setTimeout(r, 400));
      const menuBtn = Array.from(bar.querySelectorAll('.dccwl-drop-btn[aria-haspopup="true"]')).filter((b) => !b.hidden)[0];
      const checked = bar.querySelector('input[name="dccwl-colour"]:checked');
      return {
        pressed,
        label: menuBtn.textContent.trim(),
        checkedIndex: Array.from(bar.querySelectorAll('input[name="dccwl-colour"]')).indexOf(checked),
      };
    });
    checkSame('true', agreed.pressed, 'choosing Level on the full bar takes');
    check(/Level/i.test(agreed.label),
      'and the menu button carries that choice across the switch', agreed.label);
    checkSame(1, agreed.checkedIndex, 'and the radio row agrees with it');
    await page.close();
  } else {
    check(false, 'the map opens for the state test');
  }
}

await browser.close();
done();
