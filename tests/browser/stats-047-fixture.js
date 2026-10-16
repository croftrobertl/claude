'use strict';
/**
 * STATS 0.47.0 — the fixture staff-stats-047-test.js and the before/after
 * screenshots share. Live's eight cottages by their short names (the WD's
 * longest: "#23 Lighthouse", "#35 Blue Heron"); invented guests; no channel
 * echoes and no dock blocks, so every figure is plain arithmetic:
 * a cottage's nights in a window are the nights of its stays inside it.
 *
 * "Today" is 2026-10-16. October 2026 against October 2025, and the
 * Dec 27, 2026 – Jan 2, 2027 week against Dec 27, 2025 – Jan 2, 2026 (a
 * comparison spanning two years: "vs 2025–26"). Records complete from the
 * shipped 2025-10-01, so October 2025 itself has nothing to compare with.
 * One Vrbo night in October 2026 is a slice too thin for its 15px label.
 */
const COTTAGES = [[22, 'Boathouse'], [23, 'Lighthouse'], [31, 'Hibiscus Hut'], [32, 'Flamingo'], [33, 'Pineapple'],
  [34, 'Coconut'], [35, 'Blue Heron'], [36, 'Sunshine']].map(([n, a]) => ({ id: n, title: 'Cottage ' + n + ': ' + a, abbrev: a, number: String(n) }));
let seq = 100;
const bk = (ci, co, cottage, src, madeOn = '2025-06-01') => ({
  id: ++seq, status: 'confirmed', statusLabel: 'Confirmed', checkin: ci, checkout: co, guestName: 'Guest ' + seq,
  imported: src !== 'direct', source: { key: src }, sourceKey: src, pets: false, guests: '2', madeOn,
  cottages: [{ roomTypeId: cottage, roomId: cottage * 10, title: '', abbrev: '', number: String(cottage) }],
});
const TODAY = '2026-10-16';
const BOOKINGS = [
  // October 2026 (31 nights)
  bk('2026-10-01', '2026-10-19', 23, 'direct', '2026-08-01'),    // 18
  bk('2026-10-20', '2026-10-31', 23, 'airbnb', '2026-09-01'),    // 11  → #23 29 nights, 94%
  bk('2026-10-03', '2026-10-15', 35, 'booking', '2026-07-01'),   // 12  → #35 39%
  bk('2026-10-05', '2026-10-12', 22, 'direct', '2026-09-10'),    // 7   → #22 23%
  bk('2026-10-10', '2026-10-20', 31, 'direct', '2026-09-20'),    // 10  → #31 32%
  bk('2026-10-22', '2026-10-23', 32, 'vrbo', '2026-10-01'),      // 1   → #32 3%  (the thin slice: 1 of 63)
  bk('2026-10-01', '2026-10-15', 36, 'airbnb', '2026-08-15'),    // 14  → #36 45%
  // October 2025 (the same dates last year)
  bk('2025-10-01', '2025-10-11', 23, 'direct', '2025-08-01'),    // 10  → #23 32%
  bk('2025-10-05', '2025-10-25', 22, 'booking', '2025-08-01'),   // 20  → #22 65%
  bk('2025-10-12', '2025-10-15', 32, 'airbnb', '2025-09-01'),    // 3   → #32 10%
  bk('2025-10-01', '2025-10-15', 36, 'direct', '2025-09-01'),    // 14  → #36 45%
  // Dec 27, 2026 – Jan 2, 2027 (7 nights) and a year earlier
  bk('2026-12-26', '2027-01-02', 22, 'direct', '2026-10-01'),    // Dec 27 – Jan 1: 6 → 86%
  bk('2026-12-30', '2027-01-05', 35, 'airbnb', '2026-10-02'),    // Dec 30 – Jan 2: 4 → 57%
  bk('2025-12-27', '2026-01-03', 22, 'direct', '2025-10-05'),    // 7 → 100%
  bk('2025-12-29', '2025-12-31', 33, 'vrbo', '2025-10-06'),      // 2 → 29%
];
/* Elementor's own table rules (frontend.min.css), at their own weights, so a
   test sees the table hold its look against them: borders, 15px padding,
   0.9em type, striped rows. */
const ELEMENTOR_TABLE = `<style>table{background-color:transparent;border-collapse:collapse;border-spacing:0;font-size:.9em;margin-block-end:15px;width:100%}
table td,table th{border:1px solid hsla(0,0%,50%,.502);line-height:1.5;padding:15px;vertical-align:top}
table th{font-weight:700}table tfoot th,table thead th{font-size:1em}
table tbody>tr:nth-child(odd)>td,table tbody>tr:nth-child(odd)>th{background-color:hsla(0,0%,50%,.071)}
table tbody tr:hover>td,table tbody tr:hover>th{background-color:hsla(0,0%,50%,.102)}
</style>`;

/** A cottage's booked nights in [from, to] (inclusive nights), by hand. */
function nightsIn(cottage, from, to) {
  let n = 0;
  for (const b of BOOKINGS) {
    if (b.cottages[0].roomTypeId !== cottage) continue;
    for (let d = new Date(b.checkin + 'T00:00:00'); d < new Date(b.checkout + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
      const s = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      if (s >= from && s <= to) n++;
    }
  }
  return n;
}

module.exports = { COTTAGES, BOOKINGS, TODAY, ELEMENTOR_TABLE, nightsIn, bk };
