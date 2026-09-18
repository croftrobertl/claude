'use strict';
/**
 * The month-window date maths — pure functions, no browser.
 *
 * Month arithmetic is where off-by-one bugs live: month ends vary, a
 * multi-month window has to end on the LAST day of the last month, and
 * "today" in the property's timezone is not the visitor's today.
 */
const E = require('./extract.js');
const { check, done } = E.reporter();

const M = E.build(['monthStart', 'monthEnd', 'shiftMonthStr', 'monthWindowEnd', 'addDays']);

console.log('-- month boundaries --');
check('monthStart snaps to the 1st', M.monthStart('2026-09-17') === '2026-09-01', M.monthStart('2026-09-17'));
check('...and is idempotent on the 1st', M.monthStart('2026-09-01') === '2026-09-01');
check('monthEnd on a 30-day month', M.monthEnd('2026-09-17') === '2026-09-30', M.monthEnd('2026-09-17'));
check('monthEnd on a 31-day month', M.monthEnd('2026-08-05') === '2026-08-31', M.monthEnd('2026-08-05'));
check('February in a non-leap year', M.monthEnd('2026-02-10') === '2026-02-28', M.monthEnd('2026-02-10'));
check('February in a LEAP year', M.monthEnd('2028-02-10') === '2028-02-29', M.monthEnd('2028-02-10'));

console.log('\n-- shifting across year boundaries --');
check('December + 1 rolls the year', M.shiftMonthStr('2026-12-01', 1) === '2027-01-01', M.shiftMonthStr('2026-12-01', 1));
check('January - 1 rolls back', M.shiftMonthStr('2026-01-01', -1) === '2025-12-01', M.shiftMonthStr('2026-01-01', -1));
check('a shift from the 31st does not overflow into the next month',
  M.shiftMonthStr('2026-01-31', 1) === '2026-02-01', M.shiftMonthStr('2026-01-31', 1));
check('...which is the classic Date bug: Jan 31 + 1 month is Mar 3 if you are careless',
  M.shiftMonthStr('2026-01-31', 1).startsWith('2026-02'));

console.log('\n-- the multi-month window ends on the LAST day of the LAST month --');
check('1 month from September ends 2026-09-30', M.monthWindowEnd('2026-09-01', 1) === '2026-09-30');
check('2 months ends 2026-10-31', M.monthWindowEnd('2026-09-01', 2) === '2026-10-31', M.monthWindowEnd('2026-09-01', 2));
check('4 months ends 2026-12-31', M.monthWindowEnd('2026-09-01', 4) === '2026-12-31', M.monthWindowEnd('2026-09-01', 4));
check('a 4-month window crossing the year ends correctly',
  M.monthWindowEnd('2026-11-01', 4) === '2027-02-28', M.monthWindowEnd('2026-11-01', 4));
check('...and in a leap year', M.monthWindowEnd('2027-11-01', 4) === '2028-02-29', M.monthWindowEnd('2027-11-01', 4));
check('a window of 0 or fewer does not run backwards',
  M.monthWindowEnd('2026-09-01', 0) >= '2026-09-01' || M.monthWindowEnd('2026-09-01', 0) === M.monthEnd('2026-09-01'),
  M.monthWindowEnd('2026-09-01', 0));

console.log('\n-- addDays --');
check('across a month end', M.addDays('2026-09-30', 1) === '2026-10-01', M.addDays('2026-09-30', 1));
check('across a year end', M.addDays('2026-12-31', 1) === '2027-01-01', M.addDays('2026-12-31', 1));
check('backwards', M.addDays('2026-01-01', -1) === '2025-12-31', M.addDays('2026-01-01', -1));
check('zero is identity', M.addDays('2026-09-17', 0) === '2026-09-17');
check('a leap day is reachable', M.addDays('2028-02-28', 1) === '2028-02-29', M.addDays('2028-02-28', 1));

console.log('\n-- NO TIMEZONE DRIFT --');
{
  // Every one of these parses "YYYY-MM-DDT00:00:00" as LOCAL time. If any of
  // them used Date.parse of the bare date — which is UTC — a visitor west of
  // Greenwich would see the previous day. The property runs on US/Eastern, so
  // this is the failure that would show up as an off-by-one highlight.
  const wrong = [];
  for (const tz of ['UTC', 'America/New_York', 'Pacific/Auckland', 'America/Los_Angeles']) {
    process.env.TZ = tz;
    const fresh = E.build(['monthStart', 'monthEnd', 'shiftMonthStr', 'monthWindowEnd', 'addDays']);
    if (fresh.monthStart('2026-09-17') !== '2026-09-01'
      || fresh.addDays('2026-09-30', 1) !== '2026-10-01'
      || fresh.monthEnd('2026-09-17') !== '2026-09-30') wrong.push(tz);
  }
  process.env.TZ = 'UTC';
  check('the answers are identical in UTC, New York, Auckland and Los Angeles', wrong.length === 0, wrong);
}

done();
