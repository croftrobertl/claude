<?php
/**
 * The property's clock.
 *
 * Everything the ledger dates is dated in America/New_York, because the
 * cottages are in Tavares and a figure's month must not depend on where the
 * server is. The two clock changes and New Year's Eve are the three places
 * where getting that wrong shows up as a stay, a payout or a correction
 * landing on the wrong day.
 */

declare(strict_types=1);

use DCCL\Dates;

T::group('Now is read on the property clock, whatever the server thinks');

/** Run a closure with the clock pinned to one instant, in UTC. */
$at = static function (string $utc): \DateTimeImmutable {
    return (new \DateTimeImmutable($utc, new \DateTimeZone('UTC')))
        ->setTimezone(Dates::timezone());
};

T::same('America/New_York', Dates::TZ, 'The clock is the property\'s, not the site\'s');

// 04:30 UTC on 1 February is 23:30 on 31 January in Tavares. A correction
// entered then belongs to January.
T::same('2026-01-31', $at('2026-02-01T04:30:00Z')->format('Y-m-d'), 'Half past eleven at night is still the day it is in Florida');

// 05:10 UTC on 1 February is 00:10 on 1 February in Tavares.
T::same('2026-02-01', $at('2026-02-01T05:10:00Z')->format('Y-m-d'), 'Ten past midnight is the new day');

T::group('New Year\'s Eve');

T::same('2025-12-31', $at('2026-01-01T04:59:00Z')->format('Y-m-d'), 'A minute before midnight is still last year');
T::same('2026-01-01', $at('2026-01-01T05:01:00Z')->format('Y-m-d'), 'A minute after midnight is the new year');
T::same(
    '2025',
    $at('2026-01-01T04:59:00Z')->format('Y'),
    'So a payout at 23:59 on 31 December belongs to 2025, not 2026'
);

T::group('The clock going back: 1 November 2026');

// Eastern Daylight Time ends at 06:00 UTC, when 02:00 becomes 01:00.
T::same('2026-11-01 01:30:00', $at('2026-11-01T05:30:00Z')->format('Y-m-d H:i:s'), 'Half past one, the first time round');
T::same('2026-11-01 01:30:00', $at('2026-11-01T06:30:00Z')->format('Y-m-d H:i:s'), 'And half past one again, an hour later');
T::same('-0400', $at('2026-11-01T05:30:00Z')->format('O'), 'The first is on daylight time');
T::same('-0500', $at('2026-11-01T06:30:00Z')->format('O'), 'The second is on standard time');
T::same('2026-11-01', $at('2026-11-01T06:30:00Z')->format('Y-m-d'), 'Both fall on the same day, which is what the ledger dates by');

T::group('The clock going forward: 14 March 2027');

// Eastern Standard Time ends at 07:00 UTC, when 02:00 becomes 03:00.
T::same('2027-03-14 01:30:00', $at('2027-03-14T06:30:00Z')->format('Y-m-d H:i:s'), 'Half past one exists');
T::same('2027-03-14 03:30:00', $at('2027-03-14T07:30:00Z')->format('Y-m-d H:i:s'), 'Half past two does not — it is half past three');
T::same('2027-03-14', $at('2027-03-14T07:30:00Z')->format('Y-m-d'), 'The day is unaffected');

T::group('Nights are counted in days, not hours');

// The hour the clock loses and the hour it gains must not turn a three-night
// stay into two and a bit or three and a bit.
T::same(3, Dates::nights('2026-10-31', '2026-11-03'), 'A stay across the autumn change is three nights');
T::same(3, Dates::nights('2027-03-13', '2027-03-16'), 'And across the spring change, three as well');
T::same(1, Dates::nights('2026-12-31', '2027-01-01'), 'New Year\'s Eve is one night');
T::same(1, Dates::nights('2028-02-28', '2028-02-29'), 'Leap day is one night');
T::same(2, Dates::nights('2028-02-28', '2028-03-01'), 'And the leap year end of February is two');

T::group('A timestamp the ledger writes');

$now = Dates::now();
T::ok(
    preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $now) === 1,
    'Dates::now() is a MySQL datetime'
);
T::same(
    (new \DateTimeImmutable('now', Dates::timezone()))->format('Y-m-d'),
    substr($now, 0, 10),
    'And its date is today in Tavares'
);
T::same(Dates::today(), substr($now, 0, 10), 'Which is the same day Dates::today() reports');
// Checked by name rather than by comparing times: a server already on UTC
// would agree with the property clock for twenty hours out of every
// twenty-four, and a test that passes most of the time is not a test.
T::same(
    'America/New_York',
    Dates::now_at()->getTimezone()->getName(),
    'The clock it is read from is the property\'s, not the server\'s'
);

T::group('Nothing reaches for the site clock instead');

// current_time() answers in whatever timezone WordPress is set to, which on
// this host is not the property's. One call left behind would date a row by
// the server rather than by Tavares, and nothing downstream would notice.
$source = dccl_plugin_source();
T::ok(!str_contains($source, "current_time("), 'No source file calls current_time()');
T::ok(!str_contains($source, "date_default_timezone_set"), 'And none changes the process timezone under everything else');

// Pin the clock to an instant where the server date and the Tavares date
// differ, and check the ledger writes the Tavares one.
define('DCCL_TEST_NOW', '2026-02-01T04:30:00Z');
T::same('2026-01-31', Dates::today(), 'With the clock pinned to 23:30 in Tavares, today is 31 January');
T::same('2026-01-31 23:30:00', Dates::now(), 'And the timestamp written is that same evening');
