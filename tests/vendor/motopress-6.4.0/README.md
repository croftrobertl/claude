# MotoPress Hotel Booking 6.4.0 — rule classes, for the tests only

Copied unchanged from MotoPress Hotel Booking Lite 6.4.0 (GPLv2 or later),
source commit f2a441b0428c243d5ca6072d04ae77e64c1d35c1 of
github.com/WordPressBugBounty/plugins-motopress-hotel-booking-lite:

| file | MotoPress path |
|---|---|
| abstract-core-api-facade.php | includes/core/abstract-core-api-facade.php |
| rooms-availability-core-api-facade.php | includes/core/rooms-availability-core-api-facade.php |
| booking-rules-data.php | includes/core/data/booking-rules-data.php |
| date-utils.php | includes/utils/date-utils.php |
| season.php | includes/entities/season.php |
| blocks-repository.php | includes/repositories/blocks-repository.php |
| custom-booking-rules-repository.php | includes/repositories/custom-booking-rules-repository.php |

WHY (0.47.4). The public calendar now follows MotoPress's booking rules,
read through `mphb_availability_facade()`. A stub facade could only answer
what this project believes MotoPress does. These are MotoPress's own
classes, so `tests/mphb-rules-harness.php` puts the real rule engine —
season matching, rule priority, check-in/out weekdays, advance windows,
buffer days — behind the facade, and MotoPress's own repositories read the
blocks and per-date rules tables (run on SQLite by tests/sqlite-wpdb.php).
Only the options, seasons and room lists under it are a fixture.

Never shipped: the release zip is built from `mphb-availability-calendar/`
alone. Do not edit these files; replace them from a newer MotoPress when the
site upgrades, and re-run the suite.
