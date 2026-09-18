'use strict';
/**
 * buildAvailabilityHint() — the "all booked through X" line above the grid.
 *
 * THE 0.20.1 BUG IT CARRIES: the hint used to judge from days[0]. Past days
 * can never be "available", so any window merely STARTING in the past fired
 * the hint — including entirely past months, which showed "all booked
 * through X" over a month that was not booked at all. The anchor is the first
 * NON-PAST day, and that is the assertion this file exists for.
 */
const E = require('./extract.js');
const { document } = require('./minidom.js');
const { check, done } = E.reporter();

const ROOMS = [{ id: 22, title: 'Cottage 22: The Boathouse', abbrev: 'Boathouse', number: '22' },
               { id: 31, title: 'Cottage 31: Hibiscus Hut', abbrev: 'Hibiscus', number: '31' }];
const STR = { allBooked: 'All booked through {through}.', nextOpening: 'Next opening {date} at {cottage}.' };
const H = E.build(['buildAvailabilityHint'], { document });

/** avail: { roomId: { day: status } } */
const hint = (avail, days, opts = {}) => H.buildAvailabilityHint(
  opts.config || {}, opts.rooms || ROOMS, avail, days,
  opts.strings === undefined ? STR : opts.strings,
  opts.customLabels || null, opts.bookedThrough || null);

const DAYS = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'];
const all = (status, days = DAYS) => {
  const o = { 22: {}, 31: {} };
  days.forEach(d => { o[22][d] = status; o[31][d] = status; });
  return o;
};

console.log('-- the normal case: nothing to say --');
check('an open window produces no hint', hint(all('available'), DAYS) === null);
check('a window whose FIRST non-past day is open produces no hint',
  (() => { const a = all('booked'); a[22][DAYS[0]] = 'available'; return hint(a, DAYS) === null; })());

console.log('\n-- THE 0.20.1 BUG: a past window must not fire --');
check('an entirely PAST window produces no hint at all',
  hint(all('past'), DAYS) === null);
{
  // Past days first, then genuinely open days. Judging from days[0] would
  // call this "all booked"; anchoring on the first non-past day does not.
  const a = all('past', DAYS.slice(0, 2));
  a[22][DAYS[2]] = 'available'; a[31][DAYS[2]] = 'available';
  a[22][DAYS[3]] = 'available'; a[31][DAYS[3]] = 'available';
  check('a window that merely STARTS in the past, then opens, produces no hint',
    hint(a, DAYS) === null);
}

console.log('\n-- a genuinely booked window --');
{
  const el = hint(all('booked'), DAYS);
  check('a fully booked window produces a hint', el !== null);
  check('it is a status region, so a screen reader announces it',
    el.className.includes('mphbac-availability-hint'));
  check('with no opening in view it says "through" the LAST visible day',
    el.textContent === 'All booked through 2026-09-23.', el.textContent);
}
{
  const el = hint(all('booked'), DAYS, { bookedThrough: '2026-10-15' });
  check('the server\'s forward scan wins over the last visible day',
    el.textContent === 'All booked through 2026-10-15.', el.textContent);
}
{
  const a = all('booked');
  a[31][DAYS[2]] = 'available';
  const el = hint(a, DAYS, { bookedThrough: '2026-10-15' });
  check('AN IN-WINDOW OPENING BEATS BOTH — we know exactly when it lands',
    el.textContent.startsWith('All booked through 2026-09-21.'), el.textContent);
  check('...and it names the day and the cottage',
    el.textContent.includes('Next opening 2026-09-22') && el.textContent.includes('Hibiscus'),
    el.textContent);
}

console.log('\n-- the cottage label --');
{
  const a = all('booked'); a[31][DAYS[2]] = 'available';
  const custom = hint(a, DAYS, { customLabels: { 31: 'The Hut' } });
  check('a custom label replaces the generated one', custom.textContent.includes('The Hut'), custom.textContent);
  const numKey = hint(a, DAYS, { customLabels: { '31': 'String Key Hut' } });
  check('...whether the map is keyed by number or string',
    numKey.textContent.includes('String Key Hut'), numKey.textContent);
  const noTitle = hint(a, DAYS, { rooms: [{ id: 22 }, { id: 31, abbrev: 'Hibiscus', number: '31' }] });
  check('with no title it falls back to abbrev + number', noTitle.textContent.includes('Hibiscus #31'), noTitle.textContent);
}

console.log('\n-- the switches that silence it --');
check('availabilityHint === false silences it — the single-cottage case',
  hint(all('booked'), DAYS, { config: { availabilityHint: false } }) === null);
check('...and ONLY strict false does, so a page cached before 0.20.1 keeps its behaviour',
  hint(all('booked'), DAYS, { config: { availabilityHint: undefined } }) !== null);
check('no strings means no hint rather than a broken sentence',
  hint(all('booked'), DAYS, { strings: null }) === null);
check('no rooms, no hint', hint(all('booked'), DAYS, { rooms: [] }) === null);
check('no days, no hint', hint(all('booked'), []) === null);
{
  const a = all('booked'); a[31][DAYS[2]] = 'available';
  const el = hint(a, DAYS, { strings: { allBooked: STR.allBooked } });
  check('without a nextOpening string the "through" half still renders alone',
    el.textContent === 'All booked through 2026-09-21.', el.textContent);
}

done();
