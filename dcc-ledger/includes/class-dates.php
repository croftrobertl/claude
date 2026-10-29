<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Date parsing for the platform export formats, plus the small amount of date
 * maths the reports need. Everything is treated as a plain calendar date in the
 * property's own terms — no timezone conversion is applied to export dates,
 * because the platforms already state them in local terms.
 */
final class Dates
{
    /** US/Eastern: the cottages are in Florida and "today" must match their clock. */
    public const TZ = 'America/New_York';

    public static function timezone(): \DateTimeZone
    {
        return new \DateTimeZone(self::TZ);
    }

    public static function today(): string
    {
        return self::now_at()->format('Y-m-d');
    }

    /**
     * Now, on the property's clock, as a MySQL datetime.
     *
     * Used in place of WordPress's own current-time helper, which answers in
     * whatever timezone the site is set to. The cottages are in Tavares, and
     * a correction entered at 00:10 on 1 February belongs to February — not
     * to 31 January because a server is on UTC. Every stored timestamp in
     * this plugin comes from here, so they are all on one clock.
     */
    public static function now(): string
    {
        return self::now_at()->format('Y-m-d H:i:s');
    }

    /** Now, on the property's clock. */
    public static function now_at(): \DateTimeImmutable
    {
        // A fixed instant can be pinned for the tests, so a clock change can
        // be stood on deliberately rather than waited for.
        $fixed = defined('DCCL_TEST_NOW') ? (string) constant('DCCL_TEST_NOW') : '';

        return $fixed !== ''
            ? (new \DateTimeImmutable($fixed, new \DateTimeZone('UTC')))->setTimezone(self::timezone())
            : new \DateTimeImmutable('now', self::timezone());
    }

    /** MM/DD/YYYY or M/D/YYYY (Airbnb, Booking.com payouts, Vrbo reservations). */
    public static function us(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})$#', $value, $m) !== 1) {
            return null;
        }
        return self::build((int) $m[3], (int) $m[1], (int) $m[2]);
    }

    /** "May 23, 2026" (Vrbo payouts). */
    public static function long_month(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        if (preg_match('/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})$/', $value, $m) !== 1) {
            return null;
        }
        static $months = [
            'jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'may' => 5, 'jun' => 6,
            'jul' => 7, 'aug' => 8, 'sep' => 9, 'oct' => 10, 'nov' => 11, 'dec' => 12,
        ];
        $key = strtolower(substr($m[1], 0, 3));
        if (!isset($months[$key])) {
            return null;
        }
        return self::build((int) $m[3], $months[$key], (int) $m[2]);
    }

    /** ISO date, with or without a time, with or without seconds. */
    public static function iso(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $value, $m) !== 1) {
            return null;
        }
        return self::build((int) $m[1], (int) $m[2], (int) $m[3]);
    }

    /**
     * ISO datetime → 'Y-m-d H:i:s'. Booking.com writes "2025-11-28T19:01"
     * (no seconds) about as often as the full form.
     */
    public static function iso_datetime(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/', $value, $m) !== 1) {
            return null;
        }
        $date = self::build((int) $m[1], (int) $m[2], (int) $m[3]);
        if ($date === null) {
            return null;
        }
        return sprintf(
            '%s %02d:%02d:%02d',
            $date,
            (int) ($m[4] ?? 0),
            (int) ($m[5] ?? 0),
            (int) ($m[6] ?? 0)
        );
    }

    private static function build(int $y, int $m, int $d): ?string
    {
        if (!checkdate($m, $d, $y)) {
            return null;
        }
        return sprintf('%04d-%02d-%02d', $y, $m, $d);
    }

    /** Nights between two dates, or null when either is missing or reversed. */
    public static function nights(?string $check_in, ?string $check_out): ?int
    {
        if ($check_in === null || $check_out === null) {
            return null;
        }
        $in  = \DateTimeImmutable::createFromFormat('!Y-m-d', $check_in, self::timezone());
        $out = \DateTimeImmutable::createFromFormat('!Y-m-d', $check_out, self::timezone());
        if ($in === false || $out === false) {
            return null;
        }
        $days = (int) $in->diff($out)->format('%r%a');
        return $days >= 0 ? $days : null;
    }

    /**
     * Nights of a stay that fall inside [$from, $to] — the "by stay dates"
     * split used when a stay straddles a period boundary. A night is counted
     * on the date it starts, so the check-out date itself is not a night.
     */
    public static function nights_in_period(?string $check_in, ?string $check_out, string $from, string $to): int
    {
        if ($check_in === null || $check_out === null) {
            return 0;
        }
        $start = max($check_in, $from);
        // The last night starts the day before check-out, and the period ends on $to.
        $end = min($check_out, self::add_days($to, 1));
        $n   = self::nights($start, $end);
        return $n === null ? 0 : max(0, $n);
    }

    public static function add_days(string $date, int $days): string
    {
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $date, self::timezone());
        if ($d === false) {
            return $date;
        }
        return $d->modify(sprintf('%+d days', $days))->format('Y-m-d');
    }

    /** Inclusive day count between two dates. */
    public static function days_inclusive(string $from, string $to): int
    {
        $n = self::nights($from, $to);
        return $n === null ? 0 : $n + 1;
    }

    public static function is_valid(string $date): bool
    {
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1 && self::iso($date) === $date;
    }
}
