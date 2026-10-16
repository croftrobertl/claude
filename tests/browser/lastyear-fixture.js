'use strict';
/**
 * LAST YEAR ON THE CALENDAR (0.47.0) — the fixture staff-lastyear-test.js,
 * the 0.46.7 pixel proof and the screenshots share.
 *
 * "Today" is Friday 2026-11-06, so Monthly opens on the WD's own example,
 * Nov 5 – 10, 2026, where last year's bookings overlap this year's. The
 * cottages carry live's short names; every guest is invented.
 *
 * THIS YEAR (Nov 2026)              LAST YEAR (Nov 2025), shown a year on
 *  1 #22 Amy Archer   Direct  3–8  pets  11 #22 Zed Zane       Airbnb  2–9
 *  2 #22 Ben Brook    Airbnb  8–12        (covers Amy, and the 8th's turnover)
 *    → a turnover on #22, Nov 8          12 #23 Yan Yu         Booking 5–6  (1 night: the year alone)
 *  3 #23 Cal Crane    Booking 4–9 couch  13 #31 Maximilian Wolfeschlegelstein  Vrbo 6–8 (a tag that clips)
 *  4 #31 Dot Drake    Vrbo    1–20 boat  14 #32 Wes West       Direct  1–12
 *  5 #32 Eve Eaton    Direct  6–7        15 #33 Val Vance      Direct  7–14
 *  6 #36 Fay Fenn     Direct  2–5        (no last-year stay on #36: a bar
 *                                         nothing covers, for "untappable")
 * NEW YEAR: 21 #22 Una Upton Direct 2025-12-28 – 12-31 and 22 #23 Ola Orr
 * Airbnb 2026-01-01 – 01-03 — in the week of Dec 27, 2026 two years at once.
 */
const COTTAGES = [[22, 'Boathouse'], [23, 'Lighthouse'], [31, 'Hibiscus Hut'], [32, 'Flamingo'], [33, 'Pineapple'],
  [34, 'Coconut'], [35, 'Blue Heron'], [36, 'Sunshine']].map(([n, a]) => ({ id: n, title: 'Cottage ' + n + ': ' + a, abbrev: a, number: String(n) }));

const bk = (id, ci, co, cottage, src, name, extra = {}) => Object.assign({
  id, status: 'confirmed', statusLabel: 'Confirmed', checkin: ci, checkout: co, guestName: name,
  imported: src !== 'direct', source: { key: src }, sourceKey: src, pets: false, couch: false, boat: false, guests: '2', madeOn: '2025-06-01',
  cottages: [{ roomTypeId: cottage, roomId: cottage * 10, title: '', abbrev: '', number: String(cottage) }],
}, extra);

const TODAY = '2026-11-06';
const BOOKINGS = [
  bk(1, '2026-11-03', '2026-11-08', 22, 'direct', 'Amy Archer', { pets: true }),
  bk(2, '2026-11-08', '2026-11-12', 22, 'airbnb', 'Ben Brook'),
  bk(3, '2026-11-04', '2026-11-09', 23, 'booking', 'Cal Crane', { couch: true }),
  bk(4, '2026-11-01', '2026-11-20', 31, 'vrbo', 'Dot Drake', { boat: true }),
  bk(5, '2026-11-06', '2026-11-07', 32, 'direct', 'Eve Eaton'),
  bk(6, '2026-11-02', '2026-11-05', 36, 'direct', 'Fay Fenn'),
  bk(11, '2025-11-02', '2025-11-09', 22, 'airbnb', 'Zed Zane'),
  bk(12, '2025-11-05', '2025-11-06', 23, 'booking', 'Yan Yu'),
  bk(13, '2025-11-06', '2025-11-08', 31, 'vrbo', 'Maximilian Wolfeschlegelstein'),
  bk(14, '2025-11-01', '2025-11-12', 32, 'direct', 'Wes West'),
  bk(15, '2025-11-07', '2025-11-14', 33, 'direct', 'Val Vance'),
  bk(21, '2025-12-28', '2025-12-31', 22, 'direct', 'Una Upton'),
  bk(22, '2026-01-01', '2026-01-03', 23, 'airbnb', 'Ola Orr'),
];
// The sheet's full details, as the gated booking endpoint answers them.
const DETAILS = Object.fromEntries(BOOKINGS.map(b => [String(b.id), {
  id: b.id, imported: b.imported, source: { ota: b.imported ? b.sourceKey : '' },
  sections: {
    booking: [{ label: 'Check-In', value: b.checkin }, { label: 'Check-Out', value: b.checkout }, { label: 'Status', value: 'Confirmed' }],
    customer: [{ label: 'Name', value: b.guestName }, { label: 'Phone', value: '+1 555 0100', tel: '+15550100' }],
    notes: [],
  },
}]));
// A search answer, so "every other way to a current booking" can be driven.
const SEARCH = { amy: [{ id: 1, name: 'Amy Archer', checkin: '2026-11-03', checkout: '2026-11-08', sourceKey: 'direct', sourceName: 'Direct', why: 'Name',
  cottages: [{ number: '22', abbrev: 'Boathouse', title: 'Cottage 22: Boathouse' }] }] };

/* Bravada's own <button> type, as the brief names it (Pavanam, padding,
   capitals, letter-spacing) — so a test can see that none of it reaches the
   segments or the boxes. Below the kit's (0,2,1) hover/focus, which the
   harness THEME already carries. */
const BRAVADA_BUTTON = `<style>button { font-family: Pavanam, monospace; padding: 10px 30px; text-transform: uppercase; letter-spacing: 2px; font-size: 18px; }
 .elementor-kit-9 button { background-color: #dddddd; border-radius: 30px; }</style>`;

module.exports = { COTTAGES, BOOKINGS, DETAILS, SEARCH, TODAY, BRAVADA_BUTTON, bk };
