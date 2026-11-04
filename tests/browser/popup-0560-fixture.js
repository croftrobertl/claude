'use strict';
/**
 * 0.56.0 — the nine sample bookings (tests/render/popup-0560.php: invented
 * guests, no real data), as each version's own server sends them: NEW from
 * this checkout, OLD from 0.55.0 (git 1393cd1). On a board "today"
 * 2026-11-04, every booking a bar in November 2026, so a tap opens it.
 * Each answer carries the plain edit address, as 0.55.0 sends every staff
 * visitor.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const OLD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'popup-0560-'));
execSync(`git -C ${REPO} archive 1393cd1 | tar -x -C ${OLD_DIR}`);
const gen = dir => JSON.parse(execSync(`php ${path.join(REPO, 'tests/render/popup-0560.php')} ${dir}`, { maxBuffer: 64 << 20 }).toString());
const NEW = gen(path.join(REPO, 'mphb-availability-calendar'));
const OLD = gen(path.join(OLD_DIR, 'mphb-availability-calendar'));

const ORIGIN = 'https://staff.test/';
const withLink = d => { const out = {}; for (const [id, v] of Object.entries(d)) out[id] = Object.assign({}, v, { adminUrl: ORIGIN + 'wp-admin/post.php?post=' + id + '&action=edit' }); return out; };

const TODAY = '2026-11-04';
const COTTAGES = [[22, 'The Boathouse'], [23, 'The Lighthouse'], [31, 'Hibiscus Hut'], [33, 'Pineapple Place'], [34, 'Coconut Cottage'],
  [35, 'Blue Heron Hideaway'], [36, 'Sunshine Suite'], [37, 'Great Blue Heron']].map(([n, a]) => ({ id: n, title: 'Cottage ' + n + ': ' + a, abbrev: a, number: String(n) }));
const SRC = { direct: { imported: false, key: 'direct', ota: '' }, booking: { imported: true, key: 'booking', ota: 'Booking.com' },
  airbnb: { imported: true, key: 'airbnb', ota: 'Airbnb' }, vrbo: { imported: true, key: 'vrbo', ota: 'Vrbo' } };
const bar = (id, ci, co, cot, name, src) => ({ id, status: 'confirmed', statusLabel: 'Confirmed', checkin: ci, checkout: co, guestName: name,
  imported: SRC[src].imported, source: SRC[src], sourceKey: src, pets: false, guests: '2',
  cottages: [{ roomTypeId: cot, roomId: cot * 10, title: '', abbrev: '', number: String(cot) }] });
// The bars only open the pop-ups: their own dates are where they sit on the
// November board, not the bookings' (the pop-up's come from the answer).
const BOOKINGS = [
  bar(801, '2026-11-06', '2026-11-09', 33, 'Jordan Sample', 'direct'),
  bar(802, '2026-11-02', '2026-11-04', 35, 'Casey Example', 'booking'),
  bar(803, '2026-11-12', '2026-11-15', 36, 'Riley Demo', 'airbnb'),
  bar(804, '2026-11-20', '2026-11-23', 34, 'Morgan Placeholder', 'direct'),
  bar(805, '2026-11-26', '2026-11-29', 31, 'Avery Testcase', 'vrbo'),
  bar(806, '2026-11-13', '2026-11-16', 22, 'Quinn Mockup', 'direct'),
  bar(807, '2026-11-17', '2026-11-19', 23, 'Taylor Fixture', 'direct'),
  bar(808, '2026-11-24', '2026-11-27', 37, 'Drew Specimen', 'direct'),
  bar(809, '2026-11-28', '2026-11-30', 33, 'Sky Newyear', 'direct'),
];
const CASES = [
  [801, 'direct booking with Total, Paid and Balance Due'],
  [802, 'Booking.com with no guest count'],
  [803, 'Airbnb import with a confirmed guest count'],
  [804, 'three notes including the guest\'s'],
  [805, 'Vrbo with no notes'],
  [806, 'two cottages'],
  [807, 'Dog, Boat and Guest 2 rows'],
  [808, 'a long cottage name'],
  [809, 'a stay crossing New Year'],
];
const cleanup = () => fs.rmSync(OLD_DIR, { recursive: true, force: true });

module.exports = { NEW, OLD, DETAILS_NEW: withLink(NEW.details), DETAILS_OLD: withLink(OLD.details), ORIGIN, TODAY, COTTAGES, BOOKINGS, CASES, OLD_DIR, cleanup };
