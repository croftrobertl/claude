'use strict';
/**
 * The 0.44.0 board fixture: eight cottages as live has, and bookings chosen
 * to exercise every bar shape the release introduced — all five sources, a
 * pending stay, pets / couch / boat (0.44.1), one- and two-night stays, and
 * two turnovers on the
 * pinned "today", Thursday 2026-10-08.
 */
const TODAY = '2026-10-08';
const COTTAGES = [
  { id: 22, title: 'Cottage 22: Blue Heron', abbrev: 'Blue Heron', number: '22' },
  { id: 23, title: 'Cottage 23: Kingfisher', abbrev: 'Kingfisher', number: '23' },
].concat([24, 25, 26, 27, 28, 29].map(n => ({ id: n, title: 'Cottage ' + n, abbrev: 'C' + n, number: String(n) })));
const SRC = {
  direct: { imported: false, key: 'direct', ota: '' }, airbnb: { imported: true, key: 'airbnb', ota: 'Airbnb' },
  booking: { imported: true, key: 'booking', ota: 'Booking.com' }, vrbo: { imported: true, key: 'vrbo', ota: 'Vrbo' },
  other: { imported: true, key: 'other', ota: 'an external channel' },
};
const bk = (id, ci, co, cottage, name, src, extra = {}) => Object.assign({
  id, status: 'confirmed', statusLabel: 'Confirmed', checkin: ci, checkout: co, guestName: name,
  imported: SRC[src].imported, source: SRC[src], sourceKey: src, pets: false, guests: '2',
  cottages: [{ roomTypeId: cottage, roomId: cottage * 10, title: '', abbrev: '', number: String(cottage) }],
}, extra);
const BOOKINGS = [
  bk(1, '2026-10-06', '2026-10-09', 22, 'Ann Smith', 'direct', { pets: true, couch: true, boat: true, guests: '3 (2 adults, 1 child)' }),
  bk(7, '2026-10-09', '2026-10-10', 22, 'Gus Long', 'direct'),                 // turnover on 22, Oct 9; 1 night
  bk(2, '2026-10-08', '2026-10-12', 23, 'Bob Jones', 'airbnb', { guests: '' }), // arrives today
  bk(3, '2026-10-05', '2026-10-08', 23, 'Cy Lee', 'booking'),                 // leaves today: a turnover with Bob
  bk(4, '2026-10-10', '2026-10-11', 24, 'Dee March', 'vrbo', { pets: true, couch: true, boat: true }), // 1 night, all three facts
  bk(5, '2026-10-02', '2026-10-04', 25, 'Ed Future', 'other'),                // 2 nights
  bk(6, '2026-10-14', '2026-10-20', 26, 'Fay Cross', 'direct', { status: 'mphb-pending', statusLabel: 'Pending', couch: true }),
  bk(8, '2026-10-20', '2026-10-22', 27, 'Hal Price', 'airbnb'),               // 2 nights
  bk(9, '2026-10-01', '2026-10-31', 28, 'Ivy Moss', 'vrbo', { pets: true }),   // the whole month
  // A channel's block echoing Bob's stay on #23: the same cottage-nights,
  // which "Booked" must count once. It takes a second lane on the chart.
  bk(10, '2026-10-10', '2026-10-12', 23, 'Reserved', 'airbnb'),
  bk(11, '2026-11-12', '2026-11-15', 24, 'Nell Vance', 'vrbo'),          // next month, for the search jump
];
const DETAILS = {
  1: { id: 1, imported: false, source: SRC.direct, adminUrl: 'http://staff.test/wp-admin/post.php?post=1&action=edit',
       sections: { booking: [{ label: 'Accommodation Type', value: 'Cottage 22' }],
         customer: [{ label: 'First Name', value: 'Ann' }, { label: 'Phone', value: '+1 (555) 010-4421', tel: '+15550104421' },
                    { label: 'Email', value: 'ann@example.com', email: 'ann@example.com' }], notes: [] } },
  2: { id: 2, imported: true, source: SRC.airbnb,
       sections: { booking: [{ label: 'Accommodation Type', value: 'Cottage 23' }],
         customer: [{ label: 'Phone', value: 'javascript:alert(1)', tel: 'javascript:alert(1)' },
                    { label: 'Email', value: 'x', email: 'x"><img src=x onerror=alert(1)>@y.z' }], notes: [] } },
  3: { id: 3, imported: true, source: SRC.booking, adminUrl: 'https://evil.example/wp-admin/post.php?post=3',
       sections: { booking: [{ label: 'Accommodation Type', value: 'Cottage 23' }], customer: [], notes: [] } },
};
DETAILS[99] = { id: 99, imported: false, source: SRC.direct,
  sections: { booking: [{ label: 'Accommodation Type', value: 'Cottage 25' }], customer: [{ label: 'First Name', value: 'Old' }], notes: [] } };
// What the SERVER would answer per query (its matching is proved in
// staff-search-test.php); here only the board's handling of the rows is under test.
const row = (id, name, ci, co, cot, src, why, extra = {}) => Object.assign({ id, name, checkin: ci, checkout: co,
  cottages: [{ id: cot, number: String(cot), title: 'Cottage ' + cot, abbrev: '' }], status: 'confirmed', statusLabel: 'Confirmed',
  sourceKey: src, sourceName: { direct: 'Direct', airbnb: 'Airbnb', booking: 'Booking.com', vrbo: 'Vrbo' }[src] || 'Direct', why, score: 100 }, extra);
const SEARCH = {
  sm: [row(8, 'Hal Price', '2026-10-20', '2026-10-22', 27, 'airbnb', 'Last Name: Price'),
       row(1, 'Ann Smith', '2026-10-06', '2026-10-09', 22, 'direct', 'Last Name: Smith')],
  smi: [row(1, 'Ann Smith', '2026-10-06', '2026-10-09', 22, 'direct', 'Last Name: Smith')],
  fay: [row(6, 'Fay Cross', '2026-10-14', '2026-10-20', 26, 'direct', 'First Name: Fay', { status: 'mphb-pending', statusLabel: 'Pending' })],
  old: [row(99, 'Old Guest', '2021-07-01', '2021-07-05', 25, 'direct', 'stay includes Jul 2, 2021')],
  nov: [row(11, 'Nell Vance', '2026-11-12', '2026-11-15', 24, 'vrbo', 'First Name: Nell')],
  evil: [row(12, '<img src=x onerror="window.__pwned=1">', '2026-10-06', '2026-10-09', 22, 'direct', '<b>why</b>')],
};
module.exports = { TODAY, COTTAGES, BOOKINGS, DETAILS, SEARCH };
