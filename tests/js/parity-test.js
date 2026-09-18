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

function sheet({ avail = {}, ci = '', co = '', minNights = 2, strings = {} } = {}) {
  const state = { availability: { 22: avail } };
  const context = { roomTypeId: 22 };
  const config = { strings: Object.assign({
    bookInvalid: 'Invalid date range.',
    bookMinNights: 'Must be a minimum of {nights} nights. Please select new dates.',
    bookUnavail: 'Unavailable.',
  }, strings) };
  const nightsBetween = (a, b) =>
    Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  return E.build(['blockedNight', 'rangeState'], {
    state, context, config, minNights, nightsBetween,
    checkinEl: { value: ci }, checkoutEl: { value: co },
  });
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

done();
