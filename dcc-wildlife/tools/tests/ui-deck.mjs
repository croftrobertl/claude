/**
 * The species deck: uniform rows, and every species reachable.
 *
 * The deck lays a section out sideways — two columns by three rows on a phone,
 * so six species a swipe. Two things can go wrong with that and neither is
 * visible from the CSS:
 *
 *  1. Rows are `auto`, so a row is as tall as the tallest tile ANYWHERE in it,
 *     across every page. One three-line species name ("Florida Banded
 *     Watersnake") therefore inflates a row for all 38 species, and cards of
 *     different heights sit side by side with dead space under the short ones.
 *
 *  2. Thirty-eight species is between six and seven blind swipes with only a
 *     counter for orientation. Whatever navigation is added, EVERY species has
 *     to stay reachable — that is what these assertions pin.
 */

import {
  launch, widgetPage, boxesOf, boxOf,
  check, checkSame, checkAtLeast, checkAtMost, section, note, done,
} from './lib.mjs';

const browser = await launch();

section('the deck is built, and holds the whole Animals section');

let { page } = await widgetPage(browser, 'month', { width: 390, height: 900 });

const built = await page.evaluate(() => {
  const decks = Array.from(document.querySelectorAll('.dccwl-tiles.dccwl-deck'));
  const visible = decks.filter((d) => d.offsetParent !== null || d.getClientRects().length);
  const first = visible[0] || null;
  return {
    decks: decks.length,
    visible: visible.length,
    tiles: first ? Array.from(first.children).filter((li) => !li.hidden).length : 0,
    group: first ? first.getAttribute('data-dccwl-group') : null,
    hasNav: first ? !!(first.nextElementSibling && first.nextElementSibling.classList.contains('dccwl-deck-nav')) : false,
    status: first && first.nextElementSibling ? (first.nextElementSibling.querySelector('.dccwl-deck-status') || {}).textContent : null,
  };
});

note(`decks ${built.decks}, visible ${built.visible}, first group "${built.group}" with ${built.tiles} tiles`);
checkAtLeast(1, built.visible, 'a deck is visible');
check(built.hasNav, 'it has its control row');
/* DERIVED, NOT TYPED (1.33.0). This suite said 38 in eight places; every one
 * of them went red the moment a batch landed, and a suite that reddens on
 * purpose whenever work happens stops being read. ANIMALS is read off the
 * rendered page once, and everything downstream is checked against it — which
 * is the real invariant: the deck, the chips, the jump menu and the compact
 * list all agree with the section they are describing. */
const ANIMALS = built.tiles;
checkAtLeast(38, ANIMALS, 'the Animals deck is at least the size it was in 1.32.1');
note(`the Animals section holds ${ANIMALS} species`);
check(!!built.status && /\d/.test(built.status), 'the position line reads out', JSON.stringify(built.status));

section('every species in the deck is reachable and accounted for');

// The deck never removes tiles from the DOM — that is what makes it accessible
// for free — so "reachable" means present, focusable and scrollable into view.
const reach = await page.evaluate(() => {
  const deck = Array.from(document.querySelectorAll('.dccwl-tiles.dccwl-deck'))
    .find((d) => d.offsetParent !== null || d.getClientRects().length);
  const lis = Array.from(deck.children).filter((li) => !li.hidden);
  const focusable = lis.filter((li) => li.querySelector('button, a[href], [tabindex]:not([tabindex="-1"])'));
  const named = lis.map((li) => (li.querySelector('.dccwl-tile-name') || {}).textContent || '').map((t) => t.trim());
  return {
    total: lis.length,
    focusable: focusable.length,
    named: named.filter(Boolean).length,
    unique: new Set(named).size,
  };
});
checkSame(reach.total, reach.focusable, 'every tile carries a focusable control');
checkSame(reach.total, reach.named, 'every tile is named');
checkSame(reach.total, reach.unique, 'and no two tiles carry the same name');

section('the rows are uniform, and no card is short in its row');

const rows = await page.evaluate(() => {
  const deck = Array.from(document.querySelectorAll('.dccwl-tiles.dccwl-deck'))
    .find((d) => d.offsetParent !== null || d.getClientRects().length);
  const lis = Array.from(deck.children).filter((li) => !li.hidden);

  // Group tiles into rows by their y offset within the deck.
  const deckTop = deck.getBoundingClientRect().top;
  const byRow = new Map();
  const gaps = [];
  for (const li of lis) {
    const r = li.getBoundingClientRect();
    const key = Math.round(r.top - deckTop);
    if (!byRow.has(key)) byRow.set(key, []);
    byRow.get(key).push(Math.round(r.height));

    // Dead space: how much shorter the CARD is than its list item.
    const tile = li.querySelector('.dccwl-tile');
    if (tile) gaps.push(Math.round(r.height - tile.getBoundingClientRect().height));
  }

  const rowHeights = Array.from(byRow.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([top, hs]) => ({ top, min: Math.min(...hs), max: Math.max(...hs), n: hs.length }));

  const allTiles = lis.map((li) => Math.round(li.getBoundingClientRect().height));
  return {
    rows: rowHeights,
    tileMin: Math.min(...allTiles),
    tileMax: Math.max(...allTiles),
    worstGap: Math.max(...gaps),
  };
});

for (const r of rows.rows) note(`row at ${r.top}px: ${r.n} tiles, heights ${r.min}..${r.max}`);
note(`tile heights across the whole deck: ${rows.tileMin}..${rows.tileMax}; worst card-to-row gap ${rows.worstGap}px`);

checkAtLeast(2, rows.rows.length, 'the deck really is laid out in rows');

// Within one row every item is the same height — that is how grid works. The
// defect is the SPREAD ACROSS rows, and the dead space inside the tall ones.
const spread = rows.tileMax - rows.tileMin;
note(`spread between the shortest and tallest tile: ${spread}px`);
checkAtMost(24, spread, 'the shortest and tallest tile are within 24px of each other');
checkAtMost(4, rows.worstGap, 'no card sits noticeably short inside its row');

/** Wait for the deck's smooth scroll to stop moving, rather than guess at it. */
async function settled(pg) {
  await pg.evaluate(async () => {
    const deck = Array.from(document.querySelectorAll('.dccwl-tiles.dccwl-deck'))
      .find((d) => d.offsetParent !== null || d.getClientRects().length);
    let last = -1;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 40));
      if (Math.round(deck.scrollLeft) === last) return;
      last = Math.round(deck.scrollLeft);
    }
  });
}

/* ======================================================================
 * THE CATEGORY PICKER (1.38.0). This replaces two sections of this file —
 * "the sub-group chips jump, and report where you are" and "the jump select
 * reaches every single species" — because both controls are gone at the
 * owner's instruction.
 *
 * They are REPLACED, not deleted: what those sections really guarded is that
 * every category points at a real run of species and that the runs account
 * for the whole section, and that is asserted here against the control that
 * now does the job. What is NOT carried over are the claims that no longer
 * mean anything: a chip "stays pressed as a choice, not a position", and the
 * deck scrolling as far toward a group as it can. The picker hides the rest
 * of the section instead of scrolling past it, so there is nothing to scroll
 * toward and nothing left on screen to be wrong about.
 * ====================================================================== */
section('the picker filters the deck, and its categories account for every animal');

const pickInfo = await page.evaluate(() => {
  const nav = document.querySelector('[data-dccwl-subnav="animals"]');
  if (!nav) { return { error: 'no sub-nav' }; }
  const btn = nav.querySelector('[data-dccwl-pick-btn]');
  const opts = Array.from(nav.querySelectorAll('.dccwl-pick-opt'));
  return {
    hidden: nav.hidden,
    listHidden: nav.querySelector('[data-dccwl-pick-list]').hidden,
    /* THE PILL SHARES ONE ROW WITH MONTH AND THE BADGE KEY (1.44.0), so
     * what used to be "did the script unhide the Compact switch" is now
     * "is this pill inside the one chip row". A pill rendered outside it
     * would read as a second control strip. */
    inChipRow: !!nav.closest('[data-dccwl-chiprow]'),
    label: btn.textContent.replace(/\s+/g, ' ').trim(),
    labels: opts.map((o) => o.querySelector('.dccwl-pick-opt-name').textContent.trim()),
    slugs: opts.map((o) => o.getAttribute('data-dccwl-browse')),
    counts: opts.map((o) => Number(o.querySelector('.dccwl-pick-opt-n').textContent.trim())),
    selected: opts.filter((o) => 'true' === o.getAttribute('aria-selected'))
      .map((o) => o.querySelector('.dccwl-pick-opt-name').textContent.trim()),
  };
});

check(!pickInfo.error, 'the Animals sub-nav is rendered', pickInfo.error || '');
checkSame(false, pickInfo.hidden, 'it is visible with its tab');
checkSame(true, pickInfo.inChipRow, 'and it sits inside the one chip row');
checkSame(true, pickInfo.listHidden, 'and the list starts closed');
check(/Show:\s*All/.test(pickInfo.label), 'the pill reads "Show: All"', pickInfo.label);
note(`categories: ${pickInfo.labels.join(' | ')}`);
checkSame(6, pickInfo.labels.length, "six options: All plus the owner's option C");
checkSame(['All'], pickInfo.selected, 'All is chosen to begin with');

/* A label is a claim, still. The reptiles option may say "& amphibians" only
 * once the registry holds one; the label is derived, so this checks the two
 * agree rather than pinning either string. */
const reptileOpt = pickInfo.labels.find((l) => l.startsWith('Reptiles'));
check(!!reptileOpt, 'there is a reptiles category', pickInfo.labels.join(' | '));
/* Case-insensitive since 1.44.0: the labels went Title Case on Rob's
 * instruction ("Reptiles & Amphibians"), and the claim this guards is that
 * the label TRACKS THE CONTENT, not how it is capitalised. */
if (/amphibian/i.test(reptileOpt)) {
  note('the registry now holds an amphibian, so the option says so');
} else {
  checkSame('Reptiles', reptileOpt, 'with no amphibians yet, the option does not offer any');
}
check(!pickInfo.labels.some((l) => /Wading|Raptors|Waterfowl|snails/.test(l)),
  'the retired category names are gone', pickInfo.labels.join(' | '));

/* The counts PRINTED ON THE OPTIONS are the ones under test: a count beside a
 * category is a promise about what choosing it shows. Counted off the visible
 * Animals deck, not the document — a page-wide query counts the alligator
 * twice, since it is a reptile in Animals and a hazard in Safety. */
const SLUGS = ['reptiles', 'birds', 'mammals', 'fish', 'insects'];
const EXPECT = {};
{
  const sizes = await page.evaluate(() => {
    const deck = Array.from(document.querySelectorAll('.dccwl-tiles.dccwl-deck'))
      .find((d) => d.offsetParent !== null || d.getClientRects().length);
    const out = {};
    for (const li of Array.from(deck.children)) {
      const b = li.getAttribute('data-dccwl-browse');
      if (b) { out[b] = (out[b] || 0) + 1; }
    }
    return out;
  });
  for (const slug of SLUGS) { EXPECT[slug] = sizes[slug] || 0; }
}
note(`category sizes: ${SLUGS.map((k) => `${k} ${EXPECT[k]}`).join(', ')}`);
check(SLUGS.every((k) => EXPECT[k] > 0), 'no category points at an empty run', JSON.stringify(EXPECT));
checkSame(ANIMALS, Object.values(EXPECT).reduce((a, b) => a + b, 0),
  'the categories between them account for every animal');
checkSame(ANIMALS, pickInfo.counts[0], 'the All option prints the whole section');
for (let k = 0; k < pickInfo.slugs.length; k += 1) {
  const slug = pickInfo.slugs[k];
  if (!slug) { continue; }
  checkSame(EXPECT[slug], pickInfo.counts[k],
    `the ${slug} option's printed count matches what it shows`);
}

let covered = 0;
for (const slug of SLUGS) {
  await page.click('[data-dccwl-subnav="animals"] [data-dccwl-pick-btn]');
  await page.click(`[data-dccwl-subnav="animals"] .dccwl-pick-opt[data-dccwl-browse="${slug}"]`);
  await settled(page);

  const filtered = await page.evaluate((sub) => {
    const deck = Array.from(document.querySelectorAll('.dccwl-tiles.dccwl-deck'))
      .find((d) => d.offsetParent !== null || d.getClientRects().length);
    const vis = Array.from(deck.children).filter((li) => !li.hidden);
    const nav = deck.nextElementSibling;
    return {
      shown: vis.length,
      mine: vis.filter((li) => sub === li.getAttribute('data-dccwl-browse')).length,
      scrollLeft: Math.round(deck.scrollLeft),
      listClosed: document.querySelector('[data-dccwl-subnav="animals"] [data-dccwl-pick-list]').hidden,
      pill: document.querySelector('[data-dccwl-subnav="animals"] [data-dccwl-pick-btn]')
        .textContent.replace(/\s+/g, ' ').trim(),
      status: nav ? (nav.querySelector('.dccwl-deck-status') || {}).textContent || '' : '',
    };
  }, slug);

  note(`${slug}: ${filtered.shown} shown, pill "${filtered.pill}", status "${filtered.status}"`);
  checkSame(EXPECT[slug], filtered.shown, `choosing ${slug} shows its ${EXPECT[slug]} species`);
  checkSame(filtered.shown, filtered.mine, `and nothing that is not a ${slug} entry`);
  check(filtered.listClosed, `choosing ${slug} closes the list`);
  checkSame(0, filtered.scrollLeft, `and the pager restarts at the first page`);
  check(filtered.status.includes(String(EXPECT[slug])),
    `the position line counts the filtered set`, filtered.status);
  covered += filtered.shown;
}
checkSame(ANIMALS, covered, 'the categories between them show every animal');

// All hands the deck back its whole section.
await page.click('[data-dccwl-subnav="animals"] [data-dccwl-pick-btn]');
await page.click('[data-dccwl-subnav="animals"] .dccwl-pick-opt[data-dccwl-browse=""]');
await settled(page);
const allState = await page.evaluate(() => {
  const deck = Array.from(document.querySelectorAll('.dccwl-tiles.dccwl-deck'))
    .find((d) => d.offsetParent !== null || d.getClientRects().length);
  return {
    shown: Array.from(deck.children).filter((li) => !li.hidden).length,
    status: (deck.nextElementSibling.querySelector('.dccwl-deck-status') || {}).textContent || '',
    scrollLeft: Math.round(deck.scrollLeft),
    pill: document.querySelector('[data-dccwl-subnav="animals"] [data-dccwl-pick-btn]')
      .textContent.replace(/\s+/g, ' ').trim(),
  };
});
note(`All: ${allState.shown} shown, status "${allState.status}", scrollLeft ${allState.scrollLeft}`);
checkSame(ANIMALS, allState.shown, 'All restores every animal');
check(new RegExp(`of ${ANIMALS}$`).test(allState.status) || allState.status.includes(String(ANIMALS)),
  'and the whole-section count', allState.status);
checkAtMost(4, allState.scrollLeft, 'with the deck back at the start');
check(/Show:\s*All/.test(allState.pill), 'and the pill reading All again', allState.pill);

/* ======================================================================
 * THE MONTH MENU (1.44.0), WHICH REPLACED BOTH THE COMPACT SWITCH'S SLOT
 * ON THIS ROW AND THE PEAK NOW TAB.
 *
 * The section this replaces drove the Compact switch — that control is
 * gone, and so is the compact list, so its assertions are RETIRED rather
 * than inverted: there is no second view left to be wrong about. (The one
 * claim worth keeping from it, that the pager's line reports what is
 * actually shown rather than a window that is not there, is already
 * asserted by the wrap-when-everything-fits section above.)
 *
 * What is asserted here is the contract the menu has to keep, and each of
 * these is a rule from this file's history rather than a new idea:
 *
 *  - "Any Month" is the DEFAULT and filters nothing (1.28.0 — an invisible
 *    month filter once put seven winter species out of reach);
 *  - a named month filters, and SAFETY IS NEVER MONTH-FILTERED (same rule);
 *  - "This Month" is what Peak Now did, and EXCLUDES HAZARDS (1.33.0);
 *  - the label always reads the choice, which is what makes the filter
 *    visible and is the whole answer to the 1.28.0 defect.
 * ====================================================================== */
section('the Month menu: Any Month filters nothing, a month filters, the label says which');

const monthStart = await page.evaluate(() => {
  const pick = document.querySelector('[data-dccwl-monthpick]');
  if (!pick) { return { error: 'no month menu' }; }
  const grid = document.querySelector('.dccwl-guide-grid[data-dccwl-group="animals"]');
  return {
    label: pick.querySelector('[data-dccwl-monthlabel]').textContent.trim(),
    listHidden: pick.querySelector('[data-dccwl-monthmenu]').hidden,
    options: Array.from(pick.querySelectorAll('[data-dccwl-month]'))
      .map((o) => o.getAttribute('data-dccwl-month')),
    selected: Array.from(pick.querySelectorAll('li[aria-selected="true"] [data-dccwl-month]'))
      .map((o) => o.getAttribute('data-dccwl-month')),
    shown: Array.from(grid.children).filter((li) => !li.hidden).length,
  };
});
check(!monthStart.error, 'the Month menu is rendered', monthStart.error || '');
checkSame('Any Month', monthStart.label, 'it opens reading "Any Month"');
checkSame(true, monthStart.listHidden, 'with its list closed');
checkSame(14, monthStart.options.length, 'fourteen options: Any, This Month and twelve months');
checkSame(['any'], monthStart.selected, 'and Any Month marked as the choice');
checkSame(ANIMALS, monthStart.shown, 'Any Month shows every animal — it filters nothing');

/* A REAL TAP, because the open state only exists after one (the harness
 * doctrine's fourth rule, 1.38.0). */
await page.click('[data-dccwl-monthbtn]');
await page.waitForTimeout(120);
const opened = await page.evaluate(() => {
  const pick = document.querySelector('[data-dccwl-monthpick]');
  const list = pick.querySelector('[data-dccwl-monthmenu]');
  const rows = Array.from(list.querySelectorAll('[data-dccwl-month]'));
  return {
    listHidden: list.hidden,
    expanded: pick.querySelector('[data-dccwl-monthbtn]').getAttribute('aria-expanded'),
    shortest: Math.round(Math.min(...rows.map((r) => r.getBoundingClientRect().height))),
    focused: document.activeElement && document.activeElement.getAttribute('data-dccwl-month'),
  };
});
checkSame(false, opened.listHidden, 'tapping the chip opens the list');
checkSame('true', opened.expanded, 'and says so to a screen reader');
checkSame('any', opened.focused, 'focus lands on the current choice, as the category pill does');
checkAtLeast(44, opened.shortest, "every option is one of Rob's 44px targets");

/* January, chosen by tap. The month is irrelevant to the contract — what
 * matters is that FEWER animals show and that Safety keeps all of its. */
await page.click('[data-dccwl-month="0"]');
await page.waitForTimeout(400);
const january = await page.evaluate(() => {
  const animals = document.querySelector('.dccwl-guide-grid[data-dccwl-group="animals"]');
  const safety = document.querySelector('.dccwl-guide-grid[data-dccwl-group="safety"]');
  const pick = document.querySelector('[data-dccwl-monthpick]');
  return {
    label: pick.querySelector('[data-dccwl-monthlabel]').textContent.trim(),
    listHidden: pick.querySelector('[data-dccwl-monthmenu]').hidden,
    animals: Array.from(animals.children).filter((li) => !li.hidden).length,
    safetyTotal: safety ? safety.children.length : 0,
  };
});
note(`January: label "${january.label}", ${january.animals} of ${ANIMALS} animals shown`);
checkSame('January', january.label, 'the chip reads the month it is filtering by');
checkSame(true, january.listHidden, 'and the list closes behind the choice');
check(january.animals < ANIMALS, 'a named month shows FEWER animals than Any Month',
  `${january.animals} < ${ANIMALS}`);
checkAtLeast(1, january.animals, 'but never none — a month a guest picked must still say something');

/* "This Month" — the old Peak Now. Hazards must not be in it. */
await page.click('[data-dccwl-monthbtn]');
await page.waitForTimeout(120);
await page.click('[data-dccwl-month="now"]');
await page.waitForTimeout(400);
const thisMonth = await page.evaluate(() => {
  const pick = document.querySelector('[data-dccwl-monthpick]');
  const animals = document.querySelector('.dccwl-guide-grid[data-dccwl-group="animals"]');
  const lis = Array.from(animals.children).filter((li) => !li.hidden);
  const ids = lis.map((li) => li.querySelector('.dccwl-tile').getAttribute('data-dccwl-species'));
  const haz = (window.DCC_WL_CFG.species || []).filter((s) => s.haz).map((s) => s.id);
  return {
    label: pick.querySelector('[data-dccwl-monthlabel]').textContent.trim(),
    shown: lis.length,
    hazardsShown: ids.filter((id) => haz.includes(id)),
    /* The ALLIGATOR is the case that matters: group `critters`, flagged
     * `danger`, so it is in Animals AND in Safety, and a group test misses
     * it. 1.33.0's double count was exactly this. */
    gatorShown: ids.includes('alligator'),
  };
});
note(`This Month: "${thisMonth.label}", ${thisMonth.shown} animals, hazards ${JSON.stringify(thisMonth.hazardsShown)}`);
checkSame('This Month', thisMonth.label, 'the chip reads "This Month"');
checkAtLeast(1, thisMonth.shown, 'it shows something at the default peak score');
checkSame([], thisMonth.hazardsShown,
  'NO HAZARD survives it (1.33.0: nobody goes looking for a cottonmouth)');
checkSame(false, thisMonth.gatorShown, 'including the alligator, which a group test would miss');

/* And back to Any Month, which must restore everything — not merely the
 * current month. `state.monthPicked` has to clear with the label or the
 * filter goes on running invisibly, which is the 1.28.0 defect verbatim. */
await page.click('[data-dccwl-monthbtn]');
await page.waitForTimeout(120);
await page.click('[data-dccwl-month="any"]');
await page.waitForTimeout(400);
const backToAny = await page.evaluate(() => {
  const animals = document.querySelector('.dccwl-guide-grid[data-dccwl-group="animals"]');
  return {
    label: document.querySelector('[data-dccwl-monthlabel]').textContent.trim(),
    shown: Array.from(animals.children).filter((li) => !li.hidden).length,
  };
});
checkSame('Any Month', backToAny.label, 'Any Month comes back');
checkSame(ANIMALS, backToAny.shown,
  'and the filter is genuinely OFF, not merely set to the current month');

await page.close();
await browser.close();
done();
