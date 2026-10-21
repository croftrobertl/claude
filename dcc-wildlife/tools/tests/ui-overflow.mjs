/**
 * NOTHING A GUEST READS MAY SIT OUTSIDE THE SCREEN.
 *
 * WHY A SCROLLWIDTH CHECK COULD NOT FIND THIS. Every suite here has asked
 * `scrollWidth - clientWidth` since 1.18.1, and it passed throughout the
 * defect this suite was written for: the About panel's content box measured
 * 583px inside a 390px phone and was CLIPPED on both sides, so the document
 * never grew and nothing could scroll to it. "The page does not scroll
 * sideways" and "everything is on the screen" are two different claims, and
 * only the second is the one a guest cares about.
 *
 * SO IT ASKS EACH BOX, NOT THE DOCUMENT. Every rendered element that carries
 * its own text is measured against the viewport: `left < 0` or
 * `right > innerWidth` is a failure, whatever the document's width is. The
 * Director's own instruction, 2026-10-21, and the measurement he sent with
 * it (x = -65 to 455 at 390px) is the shape the probe looks for.
 *
 * WHAT IS SWEPT, AND AT WHICH WIDTHS. 360, 390 and 1280. On /explore/: the
 * Water views (Map, Now with every place chosen in turn, Fishing with every
 * season), the About fold open, the Wildlife views (every section tab, a
 * month filter, a search) and a SAMPLE of species sheets. On
 * /wildlife-guide/: the page and its credits panel.
 *
 * THE SHEET SAMPLE IS BOUNDED, AND SAYING SO IS THE POINT. The Director
 * wrote "each species sheet"; there are 402, and three widths of 402 sheets
 * is not a run anybody will wait for. The sample is the species most likely
 * to overflow — the longest common name, the longest scientific name, the
 * longest field mark, the longest look-alike set — plus a hazard, because a
 * hazard sheet carries the extra "What To Do" panel. A sheet that overflows
 * for a reason none of those capture would be missed here; the suite says
 * which it opened so the gap is visible rather than implied.
 *
 * TWO THINGS THAT KEEP IT FROM PASSING ON NOTHING:
 *   - it fails if a sweep inspects fewer boxes than a floor, so a fixture
 *     that renders an empty panel cannot read as clean;
 *   - it fails if a state it was told to reach did not open.
 * A probe that can only pass is this harness's oldest prohibition.
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launch, buildPage, widgetPage, asset, rendered, openInlineMap, settleGrids,
  check, checkAtLeast, section, note, done, skipSuite,
} from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const browser = await launch();
if (!browser) { skipSuite('no chromium'); }

const WIDTHS = [360, 390, 1280];

/*
 * A box counts when it is rendered, has a size, and holds text of its own —
 * a wrapper whose only content is a child that is itself measured would
 * double-report the same failure and bury the element that causes it.
 *
 * `position: fixed` chrome is excluded: it is positioned against the
 * viewport by design and a sticky bar that starts at x=0 is not a finding.
 * Nothing in this plugin is fixed today, so the exclusion is a guard rather
 * than a licence — it reports what it skipped.
 */
const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = { vw, seen: 0, inDeck: 0, skippedFixed: 0, bad: [] };
  const own = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim() !== '') { return true; }
    }
    return false;
  };
  /*
   * A HORIZONTAL SCROLLER IS ALLOWED TO HOLD CONTENT OFF SCREEN. That is
   * what it is for: the tile deck, the Now tab's card deck and the
   * spotlight strip all put their later pages past the right edge, and a
   * guest reaches them by swiping or by the pager. The first version of
   * this probe measured everything against the viewport and reported 88
   * such tiles as defects — a probe that fires on correct behaviour
   * teaches a reader to ignore it, which is the whole reason the spelling
   * suite's word list is explicit too.
   *
   * So for anything inside one, the question changes from "is it on the
   * screen" to "can the scroller reach it": the box must lie inside its
   * scroller's own SCROLLABLE extent. Content stranded outside that extent
   * is unreachable by any gesture and still fails.
   */
  const scrollerOf = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll')
        && p.scrollWidth > p.clientWidth + 1) { return p; }
    }
    return null;
  };
  const label = (el) => (el.className && el.className.baseVal !== undefined
    ? el.className.baseVal : el.className) || el.tagName;
  const fail = (el, r, why, lo, hi) => out.bad.push({
    cls: label(el),
    left: Math.round(r.left * 10) / 10,
    right: Math.round(r.right * 10) / 10,
    why: why + ' ' + Math.round(lo) + '…' + Math.round(hi),
    text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
  });
  for (const el of document.querySelectorAll('body *')) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') { continue; }
    if (!own(el)) { continue; }
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) { continue; }
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') { continue; }
    /* Positioned against the viewport by design; nothing here is fixed
     * today, so this is a guard rather than a licence and it reports. */
    if (cs.position === 'fixed') { out.skippedFixed += 1; continue; }
    out.seen += 1;
    const sc = scrollerOf(el);
    if (sc) {
      out.inDeck += 1;
      const sr = sc.getBoundingClientRect();
      const bl = parseFloat(getComputedStyle(sc).borderLeftWidth) || 0;
      const left = r.left - sr.left - bl + sc.scrollLeft;
      const right = r.right - sr.left - bl + sc.scrollLeft;
      /* Half a pixel of tolerance, as below: a fractional layout can land
       * a box at -0.004 and no guest can see that. */
      if (left < -0.5 || right > sc.scrollWidth + 0.5) {
        fail(el, r, 'unreachable in its scroller, content x', left, right);
      }
      continue;
    }
    if (r.left < -0.5 || r.right > vw + 0.5) {
      fail(el, r, 'outside the viewport', r.left, r.right);
    }
  }
  /*
   * And the scrollers themselves. A deck may hold content past its own
   * right edge; it may not itself hang off the screen, and it carries no
   * text of its own so the loop above never looks at it.
   */
  for (const sc of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(sc);
    if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') { continue; }
    if (cs.display === 'none' || cs.visibility === 'hidden') { continue; }
    const r = sc.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) { continue; }
    if (r.left < -0.5 || r.right > vw + 0.5) {
      fail(sc, r, 'a scroller itself is outside the viewport', r.left, r.right);
    }
  }
  return out;
})()`;

/** Sweep the page as it stands and assert on it. `floor` is the minimum
 *  number of text boxes this state must have had for the answer to mean
 *  anything. */
async function sweep(page, label, floor) {
  const r = await page.evaluate(PROBE);
  checkAtLeast(floor, r.seen, `${label}: the sweep had something to measure`);
  const detail = r.bad.slice(0, 6)
    .map((b) => `${b.cls} [${b.left} … ${b.right}] of ${r.vw} — ${b.why} — "${b.text}"`)
    .join('\n    ');
  check(r.bad.length === 0, `${label}: every text box is inside the screen`,
    `${r.bad.length} outside\n    ${detail}`);
  return r;
}

/* ------------------------------------------------------------------ */

async function explore(w) {
  const fx = rendered('canal', '--enable');
  const MAP = rendered('map');
  const FACTS = rendered('facts');
  const page = await buildPage(browser, {
    width: w, height: 900, touch: w < 1024, sitekit: true,
    css: ['assets/css/app.css', 'assets/css/widget.css', 'assets/css/canal.css', 'assets/css/water.css'],
    body:
      `<script>window.__m=${JSON.stringify(MAP)};window.__f=${JSON.stringify(FACTS)};` +
      `window.fetch=function(u){return Promise.resolve({ok:true,status:200,` +
      `json:function(){return Promise.resolve(String(u).indexOf('/map')>=0?window.__m:window.__f);}});};` +
      `</script>` + fx.html + `<script>${fx.config}</script>`,
  });
  await page.route('**/*.png', (r) => r.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  }));
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/widget.js',
    'assets/js/water.js', 'assets/js/canal.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(800);
  return page;
}

for (const w of WIDTHS) {
  section(`/explore/ at ${w}px`);
  const page = await explore(w);

  /* ---- the About fold, which is the defect this suite exists for ---- */
  const opened = await page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('details.dccwl-fullguide'))
      .find((x) => /About/i.test(x.textContent));
    if (!d) { return false; }
    d.open = true;
    return true;
  });
  check(opened, `${w}: the About fold is on the page and opens`);
  await page.waitForTimeout(200);
  const about = await sweep(page, `${w} About open`, 12);
  note(`${w}: About open — ${about.seen} text boxes measured (${about.inDeck} inside a scroller), ${about.skippedFixed} fixed skipped`);

  /*
   * And the panel's own content box, named, because the Director measured
   * THAT. A sweep that merely found nothing outside the screen would not
   * say whether the panel still fits its container or merely clips quietly.
   */
  const body = await page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('details.dccwl-fullguide'))
      .find((x) => /About/i.test(x.textContent));
    const b = d && d.querySelector('.dccwl-fullguide-body');
    if (!b) { return null; }
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width * 10) / 10, vw: document.documentElement.clientWidth };
  });
  check(body && body.w <= body.vw + 0.5,
    `${w}: the About panel's content box fits the screen`,
    body ? `${body.w}px in ${body.vw}px` : 'no body');

  /* ---- the footer row says the same three things open or closed ---- */
  const row = await page.evaluate(() => {
    const f = document.querySelector('.dccwl-footnotes');
    if (!f) { return null; }
    const read = () => Array.from(f.querySelectorAll('.dccwl-fullguide-h'))
      .map((x) => x.textContent.trim());
    const d = f.querySelector('details.dccwl-fullguide');
    const shut = (d.open = false, read());
    const open = (d.open = true, read());
    const metas = Array.from(f.querySelectorAll('.dccwl-fullguide-meta'))
      .filter((m) => m.getClientRects().length).length;
    d.open = true;
    return { shut, open, metas };
  });
  check(row && row.shut.join(' · ') === 'Guide · Credits · About',
    `${w}: the footer row reads Guide · Credits · About when shut`, row && row.shut.join(' · '));
  check(row && row.open.join(' · ') === 'Guide · Credits · About',
    `${w}: and exactly the same when open — no second line`, row && row.open.join(' · '));
  check(row && 0 === row.metas, `${w}: no meta line is revealed in that row`, row && String(row.metas));

  /*
   * AND THE THREE LABELS SHARE A LINE WHILE THE PANEL IS OPEN. "Keep the
   * footer row as Guide · Credits · About in every state" is a claim about
   * LAYOUT as well as wording: until 1.44.5 the open <details> took the
   * whole row (`flex: 1 0 100%`) and "About" dropped beneath its two
   * neighbours. Reading the labels back proves the wording; only their tops
   * prove the row.
   */
  const line = await page.evaluate(() => {
    const f = document.querySelector('.dccwl-footnotes');
    const d = f.querySelector('details.dccwl-fullguide');
    d.open = true;
    const tops = Array.from(f.querySelectorAll('.dccwl-fullguide-h'))
      .filter((e) => e.getClientRects().length)
      .map((e) => Math.round(e.getBoundingClientRect().top));
    const body = d.querySelector('.dccwl-fullguide-body').getBoundingClientRect();
    return {
      tops,
      spread: tops.length ? Math.max(...tops) - Math.min(...tops) : -1,
      aria: d.querySelector('summary').getAttribute('aria-expanded'),
      bodyW: Math.round(body.width),
      vw: document.documentElement.clientWidth,
    };
  });
  check(line.tops.length === 3 && line.spread === 0,
    `${w}: all three labels sit on one line with the panel open`,
    JSON.stringify(line.tops));
  check(line.bodyW > line.vw * 0.5,
    `${w}: and the open panel still takes the full width beneath them`,
    `${line.bodyW}px in ${line.vw}px`);
  /* sheet.js sets this explicitly (1.40.1) precisely so the disclosure state
   * never has to be inferred from a box a stylesheet can remove — which is
   * what `display: contents` on the open fold now does. */
  check('true' === line.aria,
    `${w}: the open summary still reports aria-expanded="true"`, String(line.aria));

  /*
   * AND THE THREE READ AS ONE KIND OF THING. Rob's item 5 of 1.44.0 — "no
   * underline-and-arrow look; underline only on hover/focus" — reached the
   * two anchors when 1.43.0 made them links and stopped at the <summary>,
   * which kept a permanent underline and, while open, a 1px bottom border
   * from the rule that draws a PANEL's title bar. Asserted in both states,
   * because the border only appeared in one of them.
   */
  for (const openState of [false, true]) {
    const look = await page.evaluate((o) => {
      const f = document.querySelector('.dccwl-footnotes');
      const d = f.querySelector('details.dccwl-fullguide');
      d.open = o;
      const items = [
        f.querySelector('a.dccwl-footnote-guide'),
        f.querySelectorAll('a.dccwl-footnote-link')[1],
        d.querySelector('summary'),
      ].filter(Boolean);
      return items.map((el) => {
        const cs = getComputedStyle(el);
        return { deco: cs.textDecorationLine, bb: cs.borderBottomWidth };
      });
    }, openState);
    const state = openState ? 'open' : 'shut';
    check(look.length === 3 && look.every((x) => x.deco === 'none'),
      `${w}: no footer entry is permanently underlined (${state})`, JSON.stringify(look));
    check(look.every((x) => x.bb === '0px'),
      `${w}: and none of them draws a rule beneath it (${state})`, JSON.stringify(look));
  }
  await page.evaluate(() => {
    document.querySelector('.dccwl-footnotes details.dccwl-fullguide').open = true;
  });

  /* ---- Water: Map, then Now with every place, then Fishing ---- */
  await openInlineMap(page).catch((e) => note(`${w}: map — ${e.message}`));
  await sweep(page, `${w} Water › Map`, 10);

  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-water-tab-btn="now"]');
    if (b) { b.click(); }
  });
  await page.waitForTimeout(300);
  await sweep(page, `${w} Water › Now`, 10);

  const places = await page.evaluate(() => {
    const btn = document.querySelector('[data-dccwl-placebtn]');
    if (!btn) { return 0; }
    btn.click();
    const n = document.querySelectorAll('.dccwl-pick-opt, .dccwl-chipmenu-opt').length;
    btn.click();
    return n;
  });
  checkAtLeast(2, places, `${w}: the place picker offers places to choose`);
  for (let i = 0; i < places; i += 1) {
    const name = await page.evaluate((idx) => {
      const btn = document.querySelector('[data-dccwl-placebtn]');
      btn.click();
      const rows = document.querySelectorAll('.dccwl-pick-opt, .dccwl-chipmenu-opt');
      const r = rows[idx];
      if (!r) { return null; }
      const t = r.textContent.replace(/\s+/g, ' ').trim();
      r.click();
      return t;
    }, i);
    if (!name) { continue; }
    await page.waitForTimeout(150);
    await sweep(page, `${w} Now › ${name}`, 6);
  }

  await page.evaluate(() => {
    const b = document.querySelector('[data-dccwl-water-tab-btn="fishing"]');
    if (b) { b.click(); }
  });
  await page.waitForTimeout(300);
  const seasons = await page.evaluate(() =>
    document.querySelectorAll('.dccwl-fish-seasons .dccwl-tab').length);
  checkAtLeast(2, seasons, `${w}: the season picker has seasons`);
  for (let i = 0; i < seasons; i += 1) {
    const name = await page.evaluate((idx) => {
      const b = document.querySelectorAll('.dccwl-fish-seasons .dccwl-tab')[idx];
      if (!b) { return null; }
      b.click();
      return b.textContent.replace(/\s+/g, ' ').trim();
    }, i);
    if (!name) { continue; }
    await page.waitForTimeout(150);
    await sweep(page, `${w} Fishing › ${name}`, 8);
  }

  /* ---- Wildlife: every section, a month filter, a search ---- */
  await page.evaluate(() => {
    document.querySelector('[data-dccwl-viewtrigger]').click();
    document.querySelector('[data-dccwl-view="wildlife"]').click();
  });
  await settleGrids(page).catch(() => {});
  await page.waitForTimeout(400);

  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-dccwl-panel="species"] .dccwl-tab'))
      .map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
  checkAtLeast(3, tabs.length, `${w}: the section tabs are there`, tabs.join(' · '));
  for (let i = 0; i < tabs.length; i += 1) {
    await page.evaluate((idx) => {
      const b = document.querySelectorAll('[data-dccwl-panel="species"] .dccwl-tab')[idx];
      if (b) { b.click(); }
    }, i);
    await settleGrids(page).catch(() => {});
    await page.waitForTimeout(250);
    await sweep(page, `${w} Wildlife › ${tabs[i]}`, 10);
  }

  await page.evaluate(() => {
    const i = Array.from(document.querySelectorAll('[data-dccwl-search-input]'))
      .find((x) => x.getClientRects().length);
    if (i) { i.value = 'watersnake'; i.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.waitForTimeout(500);
  await sweep(page, `${w} Wildlife › search "watersnake"`, 8);
  await page.evaluate(() => {
    const i = Array.from(document.querySelectorAll('[data-dccwl-search-input]'))
      .find((x) => x.getClientRects().length);
    if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.waitForTimeout(300);

  /*
   * ---- species sheets, the bounded sample ----
   * Chosen FROM THE REAL DATASET rather than named here: the longest common
   * name, the longest scientific name and the longest field mark are
   * whatever the registry says they are today, so a batch that adds a longer
   * one changes what this sweep opens without anybody editing this file. A
   * hazard is added by hand because its sheet carries the extra "What To Do"
   * panel, which nothing about length would select for.
   */
  const picks = await page.evaluate(() => {
    const rows = (window.DCC_WL_CFG && window.DCC_WL_CFG.species) || [];
    if (!rows.length) { return []; }
    const longestBy = (f) => rows.slice().sort(
      (a, b) => String(f(b) || '').length - String(f(a) || '').length
    )[0];
    const ids = [
      longestBy((r) => r.name),
      longestBy((r) => r.sci),
      longestBy((r) => r.mark),
      (rows.find((r) => r.haz) || rows[0]),
    ].filter(Boolean).map((r) => r.id);
    return Array.from(new Set(ids));
  });
  checkAtLeast(3, picks.length, `${w}: the sheet sample was chosen from the dataset`, picks.join(', '));
  note(`${w}: sheets opened — ${picks.join(', ')}`);

  for (const id of picks) {
    const ok = await page.evaluate((sid) => {
      const t = document.querySelector(`.dccwl-tile[data-dccwl-species="${sid}"]`);
      if (!t) { return false; }
      t.click();
      return true;
    }, id);
    if (!ok) {
      check(false, `${w}: the tile for ${id} is reachable to open its sheet`);
      continue;
    }
    await page.waitForTimeout(500);
    const open = await page.evaluate(() => !!document.querySelector('.dccwl-sheet[aria-hidden="false"], .dccwl-sheet.is-open, .dccwl-sheet:not([hidden])'));
    check(open, `${w}: the sheet for ${id} opened`);
    await sweep(page, `${w} sheet › ${id}`, 8);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
  }

  await page.close();
}

/* ------------------------------------------------------------------ */

/*
 * /wildlife-guide/ — the page the prose and the credits moved to in 1.43.0.
 * It is the other surface a guest reads at length, it loads no JavaScript at
 * all, and its credits panel is a LICENCE surface: a credit clipped off the
 * side of a phone is an attribution nobody can read.
 */
for (const w of WIDTHS) {
  section(`/wildlife-guide/ at ${w}px`);
  const g = await widgetPage(browser, 'guide', { width: w, height: 1200, touch: w < 1024, sitekit: true });
  await g.page.waitForTimeout(300);
  await sweep(g.page, `${w} guide page`, 50);

  const creditsOpen = await g.page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('details'))
      .find((x) => /credit/i.test(x.textContent));
    if (!d) { return false; }
    d.open = true;
    return true;
  });
  check(creditsOpen, `${w}: the photo-credits panel is on the guide page`);
  await g.page.waitForTimeout(250);
  await sweep(g.page, `${w} guide page › credits open`, 60);
  await g.page.close();
}

done();
