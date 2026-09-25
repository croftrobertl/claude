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
checkSame(38, built.tiles, 'the visible Animals deck holds all 38 species');
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

section('the sub-group chips jump, and report where you are');

const chipInfo = await page.evaluate(() => {
  const nav = document.querySelector('[data-dccwl-subnav="animals"]');
  if (!nav) return { error: 'no sub-nav' };
  const chips = Array.from(nav.querySelectorAll('.dccwl-subchip'));
  return {
    hidden: nav.hidden,
    chipsHidden: nav.querySelector('[data-dccwl-subchips]').hidden,
    toolsHidden: nav.querySelector('[data-dccwl-subtools]').hidden,
    labels: chips.map((c) => c.textContent.trim()),
    slugs: chips.map((c) => c.getAttribute('data-dccwl-browse')),
    pressed: chips.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.textContent.trim()),
  };
});

check(!chipInfo.error, 'the Animals sub-nav is rendered', chipInfo.error || '');
checkSame(false, chipInfo.hidden, 'it is visible with its tab');
checkSame(false, chipInfo.chipsHidden, 'the chip row was unhidden by the script');
checkSame(false, chipInfo.toolsHidden, 'so were the jump select and the view toggle');
note(`chips: ${chipInfo.labels.join(' | ')}`);
checkSame(7, chipInfo.labels.length, 'seven chips: All plus six sub-groups');
checkSame(['All'], chipInfo.pressed, 'All is pressed to begin with');

// Labels must not promise what the registry does not hold.
check(!chipInfo.labels.includes('Reptiles & amphibians'), 'no chip claims amphibians, which the registry has none of');
check(chipInfo.labels.includes('Reptiles'), 'the reptiles chip is named for what is actually there');

// Every chip must land on its own sub-group and say so.
const EXPECT = {
  reptiles: 5, mammals: 2, fishsnails: 2, waders: 15, waterfowl: 10, raptors: 4,
};
let covered = 0;
for (const [slug, count] of Object.entries(EXPECT)) {
  await page.click(`[data-dccwl-subnav="animals"] .dccwl-subchip[data-dccwl-browse="${slug}"]`);
  await settled(page);

  const landed = await page.evaluate((sub) => {
    const deck = Array.from(document.querySelectorAll('.dccwl-tiles.dccwl-deck'))
      .find((d) => d.offsetParent !== null || d.getClientRects().length);
    const box = deck.getBoundingClientRect();
    const lis = Array.from(deck.children).filter((li) => !li.hidden);
    const mine = lis.filter((li) => li.getAttribute('data-dccwl-browse') === sub);
    const onScreen = lis.filter((li) => {
      const r = li.getBoundingClientRect();
      return r.right > box.left + 1 && r.left < box.right - 1;
    });
    const status = (deck.nextElementSibling.querySelector('.dccwl-deck-status') || {}).textContent || '';
    const chip = document.querySelector(`.dccwl-subchip[data-dccwl-browse="${sub}"]`);
    const maxScroll = deck.scrollWidth - deck.clientWidth;
    const firstRect = mine.length ? mine[0].getBoundingClientRect() : null;
    return {
      count: mine.length,
      firstOfGroupOnScreen: mine.length ? onScreen.includes(mine[0]) : false,
      // How far the group's first tile is from the left edge. A jump aligns the
      // COLUMN holding it, so a column's width of slack is expected.
      offsetFromEdge: firstRect ? Math.round(firstRect.left - box.left) : null,
      atMaxScroll: Math.round(deck.scrollLeft) >= maxScroll - 2,
      status,
      pressed: chip.getAttribute('aria-pressed'),
      label: chip.textContent.trim(),
    };
  }, slug);

  note(`${slug}: ${landed.count} species, ${landed.offsetFromEdge}px from the edge${landed.atMaxScroll ? ' (deck at maximum)' : ''}, status "${landed.status}"`);
  checkSame(count, landed.count, `the ${slug} chip's group holds ${count} species`);
  check(landed.firstOfGroupOnScreen, `pressing it brings the first ${slug} species on screen`);
  // The jump aligns the column holding the target, so the tile lands within one
  // column of the edge — unless the deck has simply run out of scroll, which is
  // what happens for the LAST group and is not a failure.
  check(
    landed.atMaxScroll || landed.offsetFromEdge <= 200,
    `the deck scrolls as far toward ${slug} as it can`,
    `${landed.offsetFromEdge}px from the edge, atMaxScroll=${landed.atMaxScroll}`
  );
  checkSame('true', landed.pressed, `the ${slug} chip stays pressed — a chip records a choice, not a position`);
  check(
    landed.status.startsWith(landed.label) && /\d+\/\d+$/.test(landed.status),
    `the position line names the group and its page, not the whole section`,
    landed.status
  );
  covered += landed.count;
}
checkSame(38, covered, 'the six chips between them account for every one of the 38 animals');

// All hands the line back to the deck's own global count.
await page.click('[data-dccwl-subnav="animals"] .dccwl-subchip[data-dccwl-browse=""]');
await settled(page);
const allState = await page.evaluate(() => {
  const deck = Array.from(document.querySelectorAll('.dccwl-tiles.dccwl-deck'))
    .find((d) => d.offsetParent !== null || d.getClientRects().length);
  return {
    status: (deck.nextElementSibling.querySelector('.dccwl-deck-status') || {}).textContent || '',
    scrollLeft: Math.round(deck.scrollLeft),
  };
});
note(`All: status "${allState.status}", scrollLeft ${allState.scrollLeft}`);
check(/of 38$/.test(allState.status), 'All restores the whole-section count', allState.status);
checkAtMost(4, allState.scrollLeft, 'and returns the deck to the start');

section('the jump select reaches every single species');

const jump = await page.evaluate(async () => {
  const nav = document.querySelector('[data-dccwl-subnav="animals"]');
  const sel = nav.querySelector('[data-dccwl-jump]');
  const deck = Array.from(document.querySelectorAll('.dccwl-tiles.dccwl-deck'))
    .find((d) => d.offsetParent !== null || d.getClientRects().length);
  const ids = Array.from(sel.querySelectorAll('option')).map((o) => o.value).filter(Boolean);

  const missed = [];
  for (const id of ids) {
    sel.value = id;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    // A smooth scroll: wait for it to STOP, rather than guess a duration. A
    // fixed delay made one of the 38 look unreachable when it was merely slow.
    let last = -1;
    for (let k = 0; k < 40; k += 1) {
      await new Promise((r) => setTimeout(r, 40));
      if (Math.round(deck.scrollLeft) === last) break;
      last = Math.round(deck.scrollLeft);
    }
    const li = deck.querySelector(`[data-dccwl-species="${id}"]`).closest('li');
    const box = deck.getBoundingClientRect();
    const r = li.getBoundingClientRect();
    const onScreen = r.right > box.left + 1 && r.left < box.right - 1;
    if (!onScreen) missed.push(id);
  }
  return { total: ids.length, missed };
});

note(`jump select: ${jump.total} species offered, ${jump.missed.length} unreachable`);
checkSame(38, jump.total, 'the select lists all 38 animals');
checkSame(0, jump.missed.length, 'choosing any of them scrolls it into view', jump.missed.join(', '));

section('compact rows hold the same species, at the same reach');

await page.click('[data-dccwl-subnav="animals"] [data-dccwl-view]');
await page.waitForTimeout(250);

const compact = await page.evaluate(() => {
  const grid = Array.from(document.querySelectorAll('.dccwl-guide-grid'))
    .find((d) => d.offsetParent !== null || d.getClientRects().length);
  const lis = Array.from(grid.children).filter((li) => !li.hidden);
  const boxes = lis.map((li) => li.getBoundingClientRect());
  const tiles = lis.map((li) => li.querySelector('.dccwl-tile').getBoundingClientRect());
  const nav = grid.nextElementSibling;
  const toggle = document.querySelector('[data-dccwl-view]');
  return {
    isCompact: grid.classList.contains('dccwl-compact-list'),
    count: lis.length,
    focusable: lis.filter((li) => li.querySelector('button')).length,
    deckNavHidden: nav && nav.classList.contains('dccwl-deck-nav') ? nav.hidden : null,
    minTileHeight: Math.round(Math.min(...tiles.map((b) => b.height))),
    columns: new Set(boxes.map((b) => Math.round(b.left))).size,
    overflowX: grid.scrollWidth - grid.clientWidth,
    toggleLabel: toggle.textContent.trim(),
    togglePressed: toggle.getAttribute('aria-pressed'),
  };
});

note(`compact: ${compact.count} rows in ${compact.columns} column(s), shortest card ${compact.minTileHeight}px, toggle now "${compact.toggleLabel}"`);
check(compact.isCompact, 'the grid switches to the compact list');
checkSame(38, compact.count, 'all 38 species are still there');
checkSame(38, compact.focusable, 'and every one is still a button');
checkSame(1, compact.columns, 'they are laid out in a single column');
checkSame(true, compact.deckNavHidden, 'the deck controls are withdrawn, since there is no deck to page');
checkAtLeast(44, compact.minTileHeight, 'every row is at least 44px tall');
checkAtMost(1, compact.overflowX, 'the list does not scroll sideways');
checkSame('Photos', compact.toggleLabel, 'the toggle now offers the way back');
checkSame('true', compact.togglePressed, 'and reads as pressed');

// And back again.
await page.click('[data-dccwl-subnav="animals"] [data-dccwl-view]');
await page.waitForTimeout(350);
const restored = await page.evaluate(() => {
  const grid = Array.from(document.querySelectorAll('.dccwl-guide-grid'))
    .find((d) => d.offsetParent !== null || d.getClientRects().length);
  const nav = grid.nextElementSibling;
  return {
    isCompact: grid.classList.contains('dccwl-compact-list'),
    navHidden: nav.hidden,
    label: document.querySelector('[data-dccwl-view]').textContent.trim(),
  };
});
checkSame(false, restored.isCompact, 'toggling again restores the deck');
checkSame(false, restored.navHidden, 'with its controls back');
checkSame('Compact', restored.label, 'and the toggle offering compact again');

await page.close();
await browser.close();
done();
