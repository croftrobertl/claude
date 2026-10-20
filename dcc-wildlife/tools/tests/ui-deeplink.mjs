/**
 * DEEP LINKS INTO /explore/ (1.44.0).
 *
 * WHY THIS SUITE EXISTS NOW. `#canal-month=` and `?canal-month=` have been a
 * documented feature since 1.23.0 with NO suite behind them, and this release
 * changes what they have to do: the section opens on Water by Rob's pick, so
 * a link naming a month must now override the default view as well as set
 * the filter. The Director's brief states it directly — "A link to a month or
 * a flag opens Wildlife with that filter applied" — and lists "a deep link
 * landing on Water instead of Wildlife" in the mutation run.
 *
 * It needed a change to lib.mjs to be testable at all: every page in this
 * harness is built with `setContent`, which lands on about:blank, where there
 * is no hash to read. `buildPage({ url })` serves the fixture over a routed
 * https URL and navigates to it, so location.hash and location.search are the
 * real thing and the scripts run in the real order.
 *
 * ABOUT THE FLAG ANCHORS, which the brief also lists: `#dccwl-fl-danger`,
 * `-invasive`, `-protected` and `-nuisance` are SVG <symbol> ids in the
 * sprite sheet — the targets of the `<use>` elements that draw a tile's flag
 * mark. They are not page anchors, they have never been deep links, and
 * there is no flag FILTER in the plugin for one to apply. That is reported
 * rather than invented, and asserted here as what they actually are, so the
 * next reader of the brief does not go looking for a feature.
 */

import {
  launch, buildPage, asset, rendered,
  check, checkSame, checkAtLeast, section, note, done,
} from './lib.mjs';

const browser = await launch();

const BASE = 'https://dccwl.test/explore/';

async function explore(suffix) {
  const fx = rendered('canal');
  const page = await buildPage(browser, {
    width: 390, height: 1400, touch: true, sitekit: true,
    url: BASE + suffix,
    css: ['assets/css/app.css', 'assets/css/widget.css', 'assets/css/canal.css', 'assets/css/water.css'],
    body: fx.html + `<script>${fx.config}</script>`,
  });
  for (const f of ['assets/js/sheet.js', 'assets/js/deck.js', 'assets/js/widget.js', 'assets/js/canal.js']) {
    await page.addScriptTag({ content: asset(f) });
  }
  await page.waitForTimeout(900);
  return page;
}

const state = () => {
  const vis = (sel) => {
    const p = document.querySelector(sel);
    return !!p && !p.hidden;
  };
  const chip = document.querySelector('[data-dccwl-monthlabel]');
  const trigger = document.querySelector('[data-dccwl-viewlabel]');
  const animals = document.querySelector('.dccwl-guide-grid[data-dccwl-group="animals"]');
  return {
    species: vis('[data-dccwl-panel="species"]'),
    water: vis('[data-dccwl-panel="water"]'),
    month: chip ? chip.textContent.trim() : null,
    trigger: trigger ? trigger.textContent.trim() : null,
    shown: animals ? Array.from(animals.children).filter((li) => !li.hidden).length : -1,
    total: animals ? animals.children.length : -1,
  };
};

/* ---- 1. no deep link: Water, which is Rob's pick ---------------------- */
section('with no deep link the section opens on Water');
{
  const page = await explore('');
  const s = await page.evaluate(state);
  note(`plain ${JSON.stringify(s)}`);
  checkSame(true, s.water, 'Water is the view a fresh load opens on');
  checkSame(false, s.species, 'and Wildlife is not');
  checkSame('Any Month', s.month, 'with the Month chip on its default, so nothing is filtered');
  await page.close();
}

/* ---- 2. a month in the HASH -------------------------------------------- */
section('#canal-month=4 opens WILDLIFE, on April, filtered');
{
  const page = await explore('#canal-month=4');
  const s = await page.evaluate(state);
  note(`hash ${JSON.stringify(s)}`);
  checkSame(true, s.species, 'the species view is the one on screen');
  checkSame(false, s.water, 'and Water is not — the default is overridden');
  checkSame('April', s.month, 'the Month chip reads the month the link named');
  checkSame('Wildlife', s.trigger, 'and the dropdown says which view you are looking at');
  /* THE FILTER IS APPLIED, not merely labelled. A chip reading "April" over
   * an unfiltered list is the defect this release fixed on the standalone
   * widget; a deep link must not reintroduce it. */
  checkAtLeast(1, s.shown, 'something is shown');
  check(s.shown < s.total, 'and the list is genuinely filtered to that month',
    `${s.shown} of ${s.total}`);
  await page.close();
}

/* ---- 3. a month NAME in the QUERY -------------------------------------- */
section('?canal-month=april works too, and so does an abbreviation');
{
  const page = await explore('?canal-month=april');
  const s = await page.evaluate(state);
  note(`query ${JSON.stringify(s)}`);
  checkSame(true, s.species, 'the query form opens Wildlife as well');
  checkSame('April', s.month, 'and resolves the month NAME');
  await page.close();
}
{
  const page = await explore('#canal-month=dec');
  const s = await page.evaluate(state);
  note(`abbrev ${JSON.stringify(s)}`);
  checkSame('December', s.month, 'a three-letter abbreviation resolves too');
  await page.close();
}

/* ---- 4. nonsense is ignored, not guessed at ---------------------------- */
section('an unusable month is ignored and the default stands');
for (const bad of ['#canal-month=0', '#canal-month=13', '#canal-month=banana', '#canal-month=']) {
  const page = await explore(bad);
  const s = await page.evaluate(state);
  note(`${bad} -> ${JSON.stringify({ water: s.water, month: s.month })}`);
  checkSame(true, s.water, `${bad}: leaves the default view alone`);
  checkSame('Any Month', s.month, `${bad}: and names no month`);
  await page.close();
}

/* ---- 5. the URL is READ, never written -------------------------------- */
/*
 * The 1.23.0 rule: "#canal-month= is READ on init and never written. The
 * level navigation already owns history; a second writer fights the Back
 * button." The navigation owns no history at all since 1.44.0, which makes
 * the rule easier to keep and no less important — a write here would put an
 * entry between the page and wherever the guest came from.
 */
section('the URL is read, never written');
{
  const page = await explore('#canal-month=4');
  const before = page.url();
  await page.evaluate(() => {
    const t = document.querySelector('[data-dccwl-viewtrigger]');
    if (t) { t.click(); }
    const w = document.querySelector('[data-dccwl-view="water"]');
    if (w) { w.click(); }
  });
  await page.waitForTimeout(300);
  const after = page.url();
  const hist = await page.evaluate(() => history.length);
  note(`url before ${before} after ${after}, history length ${hist}`);
  checkSame(before, after, 'switching view does not rewrite the URL');
  const s = await page.evaluate(state);
  checkSame(true, s.water, 'the dropdown still switches away from a deep-linked view');
  checkSame('April', s.month, 'and the month it named is still the chip\'s answer');
  await page.close();
}

/* ---- 6. the flag "anchors" are sprite symbols, not links -------------- */
section('the flag ids are SVG symbols, not deep links');
{
  const page = await explore('#dccwl-fl-danger');
  const s = await page.evaluate(state);
  const what = await page.evaluate(() => {
    const out = {};
    ['danger', 'invasive', 'protected', 'nuisance'].forEach(function (f) {
      const n = document.getElementById('dccwl-fl-' + f);
      out[f] = n ? n.tagName.toLowerCase() : null;
    });
    out.uses = document.querySelectorAll('use[href="#dccwl-fl-danger"]').length;
    return out;
  });
  note(`flag ids ${JSON.stringify(what)}`);
  /*
   * Each id belongs to a <symbol> inside the hidden sprite sheet. A <symbol>
   * is never rendered and has no layout, so a browser given this fragment
   * scrolls nowhere — which is what the page does today and did before. The
   * brief reads them as filter links; they are not, and there is no filter.
   */
  checkSame('symbol', what.danger, '#dccwl-fl-danger is a <symbol> in the sprite sheet');
  checkSame(['symbol', 'symbol', 'symbol'],
    [what.invasive, what.protected, what.nuisance],
    'and so are the other three');
  checkSame(true, s.water,
    'so the fragment changes nothing: the section still opens on its default view');
  checkSame('Any Month', s.month, 'and no filter is applied, because there is none to apply');
  await page.close();
}

await browser.close();
done();
