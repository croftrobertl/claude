'use strict';
/**
 * 0.57.1 — LIVE-SHAPED STATS DATA (invented guests), built to the Website
 * Director's hand check of live 0.56.0 for November 2026, "today" Nov 4:
 *
 *   NOV 2026  66 cottage-nights booked of 240 (8 cottages × 30) → 28%;
 *             11 bookings — one a 30-night stay that checked in Oct 27 (25
 *             of its nights in November) — of which 10 ARRIVE in November.
 *   NOV 2025  on the books on Nov 4, 2025: 43 nights (18%), 9 bookings;
 *             final: 66 nights (28%), 17 bookings — 8 more were booked
 *             after Nov 4, 2025.
 *   So 0.56/0.57.0 read "±0 vs Nov 2025" and Bookings ▼6 (final vs now);
 *   the same-date comparison reads ▲10 and ▲2.
 *
 *   DOCK BLOCKS (notStay): #31 a dock block ends Nov 6 as a guest arrives;
 *   #32 one ends Nov 5 as a guest arrives; #33 a guest leaves Nov 14 as one
 *   starts — none is a turnover. #33 Nov 10, guest → guest: the one real
 *   turnover of the month.
 *   OCT 2026 / OCT 2025: a finished month (final against final).
 */
let seq = 7000;
const day = (d, k) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
const bk = (ci, co, cottage, src, madeOn, name, extra = {}) => Object.assign({
  id: ++seq, status: 'confirmed', statusLabel: 'Confirmed', checkin: ci, checkout: co, guestName: name || ('Guest ' + seq),
  imported: src !== 'direct', source: { key: src }, sourceKey: src, pets: false, guests: '2', madeOn,
  cottages: [{ roomTypeId: cottage, roomId: cottage * 10, title: '', abbrev: '', number: String(cottage) }],
}, extra);
const dock = (ci, co, cottage) => bk(ci, co, cottage, 'direct', '2026-10-01', 'Dock Block', { notStay: true });

const COTTAGES = [[22, 'Boathouse'], [23, 'Lighthouse'], [31, 'Hibiscus Hut'], [32, 'Flamingo'], [33, 'Pineapple'],
  [34, 'Coconut'], [35, 'Blue Heron'], [36, 'Sunshine']].map(([n, a]) => ({ id: n, title: 'Cottage ' + n + ': ' + a, abbrev: a, number: String(n) }));
const TODAY = '2026-11-04';

const BOOKINGS = [
  // ---- November 2026: 66 nights, 11 bookings, 10 arriving ----
  bk('2026-10-27', '2026-11-26', 22, 'direct', '2026-09-15', 'Long Stay'),       // 30 nights, 25 in November
  bk('2026-11-01', '2026-11-06', 23, 'airbnb', '2026-10-10'),                    // 5
  dock('2026-11-02', '2026-11-06', 31),
  bk('2026-11-06', '2026-11-10', 31, 'direct', '2026-10-20', 'After Dock 31'),   // 4 — arrives as the dock block ends
  dock('2026-11-03', '2026-11-05', 32),
  bk('2026-11-05', '2026-11-09', 32, 'booking', '2026-10-22', 'After Dock 32'),  // 4 — the same
  bk('2026-11-06', '2026-11-10', 33, 'direct', '2026-10-05', 'Out Nov 10'),      // 4
  bk('2026-11-10', '2026-11-14', 33, 'vrbo', '2026-10-25', 'In Nov 10'),         // 4 — guest → guest, the turnover
  dock('2026-11-14', '2026-11-16', 33),                                          // a guest leaves as a dock block starts
  bk('2026-11-02', '2026-11-06', 34, 'direct', '2026-10-12'),                    // 4
  bk('2026-11-08', '2026-11-12', 35, 'airbnb', '2026-10-28'),                    // 4
  bk('2026-11-03', '2026-11-07', 36, 'direct', '2026-10-30'),                    // 4
  bk('2026-11-12', '2026-11-16', 23, 'booking', '2026-11-01'),                   // 4
  bk('2026-11-15', '2026-11-19', 34, 'direct', '2026-11-02'),                    // 4 → 25 + 41 = 66
  // ---- October 2026 (finished) ----
  bk('2026-10-02', '2026-10-09', 23, 'direct', '2026-08-01'),
  bk('2026-10-10', '2026-10-14', 31, 'airbnb', '2026-09-01'),
  bk('2026-10-15', '2026-10-25', 35, 'direct', '2026-09-20'),
];
// ---- November 2025: 9 bookings / 43 nights on the books by Nov 4, 2025;
// 8 more (23 nights) booked after → final 17 / 66 ----
{
  const free = {}; COTTAGES.forEach(c => { free[c.id] = '2025-11-01'; });
  const place = (nights, madeOn, earliest) => {
    const c = COTTAGES.map(x => x.id).sort((a, b) => (free[a] < free[b] ? -1 : free[a] > free[b] ? 1 : a - b))[0];
    const ci = free[c] > earliest ? free[c] : earliest;
    BOOKINGS.push(bk(ci, day(ci, nights), c, 'direct', madeOn));
    free[c] = day(ci, nights);
  };
  [5, 5, 5, 5, 5, 5, 5, 4, 4].forEach((n, i) => place(n, day('2025-10-01', i), '2025-11-01'));
  // The last of them has NO made-on date: in the final figures (it is on
  // record now), never in "on the books by Nov 4" (it cannot be placed).
  [3, 3, 3, 3, 3, 3, 3, 2].forEach((n, i) => place(n, i === 7 ? '' : day('2025-11-05', i), '2025-11-12'));
}
// ---- October 2025 (finished; one booked late, after its own arrival week) ----
BOOKINGS.push(bk('2025-10-03', '2025-10-08', 23, 'direct', '2025-08-01'), bk('2025-10-12', '2025-10-16', 31, 'airbnb', '2025-10-01'),
  bk('2025-10-20', '2025-10-22', 35, 'direct', '2025-10-18'));

module.exports = { COTTAGES, BOOKINGS, TODAY, bk, dock, day };
