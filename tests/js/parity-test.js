'use strict';
/**
 * rangeState() and blockedNight() — the booking sheet's decision about whether
 * a chosen range can be sold.
 *
 * THE 0.23.8 RULE: availability is checked ON SELECTION, not at submit. A
 * visitor must not finalise a range and be told at the last step that it was
 * never bookable. blockedNight() walks the NIGHTS, not the days — the
 * checkout day is not a night stayed, so a booking starting the day someone
 * else leaves is legal.
 *
 * Both close over their enclosing scope, so this supplies that scope
 * explicitly rather than pretending the functions are standalone.
 */
const E = require('./extract.js');
const { check, done } = E.reporter();

function sheet({ avail = {}, ci = '', co = '', minNights = 2, strings = {},
                others = null, rooms = null, customLabels = {} } = {}) {
  const availability = { 22: avail };
  if (others) { Object.assign(availability, others); }
  const state = {
    availability,
    // The sheet reads state.rooms to name a suggestion. Default to the one
    // cottage under test, so the existing cases keep their old scope exactly.
    rooms: rooms || [{ id: 22, title: 'Blue Heron', abbrev: 'BH', number: '22' }],
  };
  const context = { roomTypeId: 22 };
  const config = { customLabels, strings: Object.assign({
    bookInvalid: 'Invalid date range.',
    bookMinNights: 'Must be a minimum of {nights} nights. Please select new dates.',
    bookUnavail: 'Unavailable.',
    altCottage: '{cottage} is free for these dates.',
  }, strings) };
  const nightsBetween = (a, b) =>
    Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  // THE ELEMENTS THEMSELVES are handed back, not a copy of their values. The
  // first version of the "offers, never switches" case watched a snapshot
  // object built here, which nothing under test could ever write to — so a
  // mutation that DID clear the check-in field changed nothing the assertion
  // could see, and SURVIVED.
  const checkinEl = { value: ci };
  const checkoutEl = { value: co };
  const built = E.build(['roomLabel', 'blockedNight', 'freeAlternative', 'rangeState'], {
    state, context, config, minNights, nightsBetween, checkinEl, checkoutEl,
  });
  built.els = { checkinEl, checkoutEl };
  return built;
}

const OPEN = { '2026-09-20': 'available', '2026-09-21': 'available', '2026-09-22': 'available',
               '2026-09-23': 'available', '2026-09-24': 'available' };

console.log('-- half-filled is not an error --');
{
  const s = sheet({ avail: OPEN, ci: '2026-09-20', co: '' });
  const r = s.rangeState();
  check('one date chosen: not ok, not complete, NO message',
    r.ok === false && r.complete === false && r.msg === '', r);
  check('neither chosen: the same', (x => x.complete === false && x.msg === '')(sheet({ avail: OPEN }).rangeState()));
}

console.log('\n-- an inverted or empty range --');
check('checkout before checkin is a complete error',
  (r => r.ok === false && r.complete === true && r.msg === 'Invalid date range.')
    (sheet({ avail: OPEN, ci: '2026-09-24', co: '2026-09-20' }).rangeState()));
check('same day in and out is an error too',
  (r => r.ok === false && r.msg === 'Invalid date range.')
    (sheet({ avail: OPEN, ci: '2026-09-20', co: '2026-09-20' }).rangeState()));

console.log('\n-- the minimum stay, with the number interpolated --');
{
  const r = sheet({ avail: OPEN, ci: '2026-09-20', co: '2026-09-21', minNights: 2 }).rangeState();
  check('one night against a two-night minimum is refused', r.ok === false && r.complete === true);
  check('the message names the real minimum rather than leaving {nights}',
    r.msg.includes('2') && !r.msg.includes('{nights}'), r.msg);
  check('exactly the minimum is accepted',
    sheet({ avail: OPEN, ci: '2026-09-20', co: '2026-09-22', minNights: 2 }).rangeState().ok === true);
}

console.log('\n-- availability, checked ON SELECTION --');
{
  const blocked = Object.assign({}, OPEN, { '2026-09-22': 'booked' });
  const r = sheet({ avail: blocked, ci: '2026-09-20', co: '2026-09-24' }).rangeState();
  check('a booked night inside the range is refused', r.ok === false && r.msg === 'Unavailable.', r);
  check('blockedNight names WHICH night, so the UI can say so',
    sheet({ avail: blocked }).blockedNight('2026-09-20', '2026-09-24') === '2026-09-22');
}
{
  // THE CHECKOUT DAY IS NOT A NIGHT. A guest leaving on the 24th frees that
  // day for an arrival; treating it as occupied would refuse a legal booking.
  const leaving = Object.assign({}, OPEN, { '2026-09-24': 'booked' });
  check('a booking that ENDS on a booked day is still allowed — checkout is not a night',
    sheet({ avail: leaving, ci: '2026-09-20', co: '2026-09-24' }).rangeState().ok === true);
  check('...but one that STAYS through it is not',
    sheet({ avail: leaving, ci: '2026-09-20', co: '2026-09-25' }).rangeState().ok === false);
}
check('an unknown status is treated as unavailable, not as bookable',
  sheet({ avail: { '2026-09-21': 'whatever' }, ci: '2026-09-20', co: '2026-09-23' }).rangeState().ok === false);
check('a day with NO entry at all does not block — absence of data is not a booking',
  sheet({ avail: { '2026-09-20': 'available' }, ci: '2026-09-20', co: '2026-09-23' }).rangeState().ok === true);

console.log('\n-- no availability loaded yet --');
check('blockedNight returns null rather than guessing when nothing is loaded',
  (() => { const s = E.build(['blockedNight'], { state: {}, context: { roomTypeId: 22 } });
    return s.blockedNight('2026-09-20', '2026-09-24') === null; })());

console.log('\n-- the walk is bounded --');
check('an absurd range cannot spin: the loop has a hard guard',
  (() => { const t0 = Date.now();
    sheet({ avail: OPEN }).blockedNight('2026-01-01', '2099-01-01');
    return Date.now() - t0 < 1000; })(),
  'guard in blockedNight');

console.log('\n-- a clean range passes --');
check('an open, long-enough range is ok and complete',
  (r => r.ok === true && r.complete === true && r.msg === '')
    (sheet({ avail: OPEN, ci: '2026-09-20', co: '2026-09-24' }).rangeState()));


console.log('\n-- WHICH COTTAGE *IS* FREE (0.41.0) --');
{
  /* The client already holds every cottage's availability for the loaded
     window, so a dead end can name a cottage that IS free for exactly those
     nights at no cost. These cases fix what "exactly" and "free" mean. */
  const BOOKED = { '2026-09-20': 'booked', '2026-09-21': 'booked', '2026-09-22': 'booked',
                   '2026-09-23': 'booked', '2026-09-24': 'booked' };
  const ROOMS = [
    { id: 22, title: 'Blue Heron', abbrev: 'BH', number: '22' },
    { id: 23, title: 'Kingfisher', abbrev: 'KF', number: '4' },
  ];
  const three = (over) => sheet(Object.assign({
    avail: BOOKED, ci: '2026-09-20', co: '2026-09-23', rooms: ROOMS,
  }, over));

  check('a dead end names a cottage that is free for those very nights',
    (r => r.ok === false && r.msg === 'Unavailable. Kingfisher is free for these dates.')
      (three({ others: { 23: OPEN } }).rangeState()),
    three({ others: { 23: OPEN } }).rangeState().msg);

  check('IT OFFERS, IT DOES NOT SWITCH — the real date fields are untouched',
    (s => { s.rangeState();
            return s.els.checkinEl.value === '2026-09-20'
                && s.els.checkoutEl.value === '2026-09-23'; })(three({ others: { 23: OPEN } })),
    (s => { s.rangeState(); return [s.els.checkinEl.value, s.els.checkoutEl.value]; })
      (three({ others: { 23: OPEN } })));

  check('a cottage booked on ONE of the nights is not offered',
    (r => r.msg === 'Unavailable.')
      (three({ others: { 23: Object.assign({}, OPEN, { '2026-09-21': 'booked' }) } }).rangeState()));

  /* BOUNDED TO THE LOADED WINDOW. A date the window does not cover is
     UNDEFINED, not 'available'. Claiming a cottage is free on a night nobody
     has looked at would be worse than saying nothing. */
  check('a cottage whose map STOPS SHORT of the range is not offered',
    (r => r.msg === 'Unavailable.')
      (three({ others: { 23: { '2026-09-20': 'available', '2026-09-21': 'available' } } }).rangeState()),
    three({ others: { 23: { '2026-09-20': 'available', '2026-09-21': 'available' } } }).rangeState().msg);

  /* NIGHTS, NOT DAYS — the same rule blockedNight() follows. The checkout day
     is not a night stayed, so a cottage that is booked from the checkout day
     onward is still free for this stay. */
  check('a cottage booked FROM the checkout day is still offered',
    (r => r.msg === 'Unavailable. Kingfisher is free for these dates.')
      (three({ others: { 23: Object.assign({}, OPEN, { '2026-09-23': 'booked' }) } }).rangeState()));

  /* ASSERTED ON freeAlternative DIRECTLY, not through rangeState(). Going
     through rangeState() cannot reach this: to get there the SELECTED
     cottage must be blocked, and if it is blocked it can never be its own
     suggestion anyway. The first version of this case made the selected
     cottage free to set the scene, which unblocked the range and tested
     nothing. Called directly, the cottage under test IS free and must still
     be skipped. */
  check('the cottage the visitor is already looking at is never suggested to them',
    sheet({ avail: OPEN, ci: '2026-09-20', co: '2026-09-23',
            rooms: ROOMS, others: { 23: BOOKED } })
      .freeAlternative('2026-09-20', '2026-09-23') === '',
    sheet({ avail: OPEN, ci: '2026-09-20', co: '2026-09-23',
            rooms: ROOMS, others: { 23: BOOKED } }).freeAlternative('2026-09-20', '2026-09-23'));
  check('(instrument check) that same cottage WOULD be named if it were another one',
    sheet({ avail: BOOKED, ci: '2026-09-20', co: '2026-09-23',
            rooms: ROOMS, others: { 23: OPEN } })
      .freeAlternative('2026-09-20', '2026-09-23') === 'Kingfisher');

  check('a single-cottage placement makes no suggestion at all',
    (r => r.msg === 'Unavailable.')
      (sheet({ avail: BOOKED, ci: '2026-09-20', co: '2026-09-23' }).rangeState()));

  check('blanking the string in the panel switches the suggestion off',
    (r => r.msg === 'Unavailable.')
      (three({ others: { 23: OPEN }, strings: { altCottage: '' } }).rangeState()));

  // The name has to be the one the rest of the page uses for that cottage.
  check('an editor\'s per-cottage label wins over the MotoPress title',
    (r => r.msg.includes('The Boathouse'))
      (three({ others: { 23: OPEN }, customLabels: { 23: 'The Boathouse' } }).rangeState()),
    three({ others: { 23: OPEN }, customLabels: { 23: 'The Boathouse' } }).rangeState().msg);
  check('...including when the label map is keyed by a STRING id, as Elementor stores it',
    (r => r.msg.includes('The Boathouse'))
      (three({ others: { 23: OPEN }, customLabels: { '23': 'The Boathouse' } }).rangeState()));
  check('with no title and no label it falls back to the abbreviation and number',
    (r => r.msg === 'Unavailable. KF #4 is free for these dates.')
      (three({ others: { 23: OPEN },
               rooms: [ROOMS[0], { id: 23, title: '', abbrev: 'KF', number: '4' }] }).rangeState()),
    three({ others: { 23: OPEN },
            rooms: [ROOMS[0], { id: 23, title: '', abbrev: 'KF', number: '4' }] }).rangeState().msg);

  check('an availability map keyed by STRING id is found too',
    (r => r.msg.includes('Kingfisher'))
      (three({ others: { '23': OPEN } }).rangeState()));

  // A suggestion must never turn a dead end into a bookable one.
  check('the range is still NOT ok — a suggestion does not unblock the button',
    (r => r.ok === false && r.complete === true)(three({ others: { 23: OPEN } }).rangeState()));
}

done();
