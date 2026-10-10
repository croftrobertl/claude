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
module.exports = { TODAY, COTTAGES, BOOKINGS, DETAILS };
