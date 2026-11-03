'use strict';
/**
 * STATS 0.53.0 — the fixture stats-053-test.js, the stills and the
 * byte-identity proof share. Live's eight cottages; invented guests; no
 * channel echoes. "Today" is 2026-11-03: November 2026 is under way.
 *
 * DAYS BOOKED AHEAD, arrivals in November 2026, by hand (made-on → check-in):
 *   Direct       5, 12, 12, 40, 200  → mean 54 (269/5 = 53.8), median 12, mode 12
 *   Airbnb       3, 9, 20            → mean 11 (32/3 = 10.67), median 9, mode —
 *   Booking.com  3, 3, 9, 9, 20      → mean 9 (44/5 = 8.8), median 9, mode 3 (a tie: the smaller)
 *   Vrbo         10, 20, 31, 45      → mean 27 (106/4 = 26.5), median 26 ((20+31)/2 = 25.5), mode —
 *   All 17                           → see LEAD_ALL below
 * One more Direct booking is made AFTER its own check-in — left out, as since
 * 0.46.0 — and one has no made-on date: left out of the lead times and of
 * the pace line, as paceNights() leaves it out with asOf.
 *
 * A dock block (notStay) is on the books from Oct 1 and never counts.
 * Every November 2026 stay is one night long, each in its own cottage-night,
 * so each booking is exactly one cottage-night. Two of them are ECHOES: an
 * Airbnb block of a Direct stay's night (made earlier, ranked later), to
 * prove the pace line keeps own()'s rule: a night counts once.
 */
const COTTAGES = [[22, 'Boathouse'], [23, 'Lighthouse'], [31, 'Hibiscus Hut'], [32, 'Flamingo'], [33, 'Pineapple'],
  [34, 'Coconut'], [35, 'Blue Heron'], [36, 'Sunshine']].map(([n, a]) => ({ id: n, title: 'Cottage ' + n + ': ' + a, abbrev: a, number: String(n) }));
let seq = 500;
const day = (d, k) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
const bk = (ci, co, cottage, src, madeOn) => ({
  id: ++seq, status: 'confirmed', statusLabel: 'Confirmed', checkin: ci, checkout: co, guestName: 'Guest ' + seq,
  imported: src !== 'direct', source: { key: src }, sourceKey: src, pets: false, guests: '2', madeOn,
  cottages: [{ roomTypeId: cottage, roomId: cottage * 10, title: '', abbrev: '', number: String(cottage) }],
});
const TODAY = '2026-11-03';
const LEAD = {
  direct: [5, 12, 12, 40, 200], airbnb: [3, 9, 20], booking: [3, 3, 9, 9, 20], vrbo: [10, 20, 31, 45],
};
// Arrival nights, one cottage-night each, spread over November 2026.
const BOOKINGS = [];
{
  let n = 0;
  const ids = COTTAGES.map(c => c.id);
  for (const src of ['direct', 'airbnb', 'booking', 'vrbo']) {
    LEAD[src].forEach(lead => {
      const ci = day('2026-11-02', 2 * Math.floor(n / ids.length) + (n % 3)), cot = ids[n % ids.length];
      BOOKINGS.push(bk(ci, day(ci, 1), cot, src, day(ci, -lead)));
      n++;
    });
  }
}
// Left out of the lead times: made after its check-in; no made-on date.
BOOKINGS.push(bk('2026-11-01', '2026-11-02', 23, 'direct', '2026-11-02'));
BOOKINGS.push(bk('2026-11-24', '2026-11-26', 23, 'direct', ''));
// An Airbnb echo of the first Direct stay's night, made BEFORE it: it owns
// that night until the Direct booking (ranked first: lower id, same check-in)
// is made — then the night is still one night, not two.
{
  const d0 = BOOKINGS[0];
  const e = bk(d0.checkin, d0.checkout, d0.cottages[0].roomTypeId, 'airbnb', day(d0.madeOn, -30));
  e.id = d0.id + 1000;
  BOOKINGS.push(e);
}
// A Booking.com echo of the second Direct stay's night, made AFTER it (and
// ranked after it): it never owns that night, so never counts.
{
  const d1 = BOOKINGS[1];
  const e = bk(d1.checkin, d1.checkout, d1.cottages[0].roomTypeId, 'booking', day(d1.madeOn, 5));
  e.id = d1.id + 1000;
  BOOKINGS.push(e);
}
// A DOCK BLOCK (notStay) on Nov 10 – 12 in #31, made Oct 1: it owns its
// nights but they are not booked — own() leaves them out, so must the line.
BOOKINGS.push(Object.assign(bk('2026-11-10', '2026-11-12', 31, 'direct', '2026-10-01'), { notStay: true }));
// November 2025: the same dates last year, for the pill and the dashed line.
[['2025-11-02', 3, 22, 'direct', 60], ['2025-11-05', 2, 23, 'airbnb', 20], ['2025-11-10', 2, 31, 'booking', 5],
 ['2025-11-12', 1, 32, 'direct', 90], ['2025-11-20', 3, 33, 'vrbo', 1], ['2025-11-01', 2, 34, 'direct', 45]]
  .forEach(([ci, n, c, src, lead]) => BOOKINGS.push(bk(ci, day(ci, n), c, src, day(ci, -lead))));

const sum = a => a.reduce((t, x) => t + x, 0);
const LEAD_ALL = [].concat(LEAD.direct, LEAD.airbnb, LEAD.booking, LEAD.vrbo);

module.exports = { COTTAGES, BOOKINGS, TODAY, LEAD, LEAD_ALL, day, bk, sum };
