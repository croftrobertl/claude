<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Booking pace: what was on the books, as at a date.
 *
 * Pace cannot be worked out after the fact. A reservation made in March and
 * cancelled in April is in no record we hold today, so a curve reconstructed
 * from booking dates shows what SURVIVED, not what stood — and understates
 * every month that saw cancellations. The Director's ruling of 2026-10-29 is
 * therefore: do not draw a reconstructed chart. Start recording real pace
 * from now.
 *
 * So once a night the ledger reads MotoPress — read-only, as always — and
 * writes down the room nights on the books for each of the coming months.
 * Those rows are never recomputed and never backfilled.
 *
 * A night that was not recorded is recorded as missing, by its absence:
 * every run writes a row for every month in its horizon, zero included,
 * because "no nights on the books yet" is a fact worth keeping. A date with
 * no rows at all therefore means the run did not happen, and the screens
 * say so rather than drawing a line through the gap.
 */
final class Pace
{
    /** The hook WP-Cron fires once a day. */
    public const HOOK = 'dccl_record_pace';

    /** How many months ahead each run looks. */
    public const HORIZON_MONTHS = 18;

    /** The days out at which months are compared on the screen. */
    public const DAYS_OUT = [180, 150, 120, 90, 60, 30, 0];

    /**
     * Record tonight's position.
     *
     * @return array{recorded_on:string,months:int,room_nights:int,already:bool}
     */
    public static function record(?string $on = null): array
    {
        global $wpdb;

        $on    = $on ?? Dates::today();
        $table = self::table();

        $already = (int) $wpdb->get_var(
            $wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE recorded_on = %s", $on)
        ) > 0;

        if ($already) {
            // Once a night, and never rewritten. A second run on the same
            // day would otherwise quietly replace the morning's position
            // with the evening's.
            return ['recorded_on' => $on, 'months' => 0, 'room_nights' => 0, 'already' => true];
        }

        $counts = self::on_the_books($on);
        $total  = 0;
        $now    = Dates::now();

        foreach ($counts as $month => $figures) {
            $wpdb->insert($table, [
                'recorded_on' => $on,
                'stay_month'  => $month,
                'room_nights' => (int) $figures['room_nights'],
                'stays'       => (int) $figures['stays'],
                'created_at'  => $now,
            ]);
            $total += (int) $figures['room_nights'];
        }

        return [
            'recorded_on' => $on,
            'months'      => count($counts),
            'room_nights' => $total,
            'already'     => false,
        ];
    }

    /**
     * Room nights on the books right now, per coming stay month.
     *
     * Counts what the figures count: a confirmed booking that is not a copy,
     * in one of the eight cottages. A month with nothing yet is included at
     * zero, because that is a measurement rather than a blank.
     *
     * @return array<string,array{room_nights:int,stays:int}>
     */
    public static function on_the_books(string $as_at): array
    {
        $months = [];
        $cursor = (new \DateTimeImmutable($as_at . ' 00:00:00', Dates::timezone()))->modify('first day of this month');
        for ($i = 0; $i < self::HORIZON_MONTHS; $i++) {
            $months[$cursor->format('Y-m')] = ['room_nights' => 0, 'stays' => 0];
            $cursor = $cursor->modify('+1 month');
        }

        $copies = Reports::copy_booking_ids();

        foreach (Mphb_Reader::bookings() as $booking) {
            if (!Linker::is_live($booking)) {
                continue; // A dock block is not on the books.
            }
            if (isset($copies[(int) $booking['id']])) {
                continue; // Counted once, on the platform stay.
            }
            if (!Cottages::is_cottage((string) $booking['cottage'])) {
                continue;
            }
            if ($booking['check_in'] === null || $booking['check_out'] === null) {
                continue;
            }

            foreach ($months as $month => $_) {
                $start = $month . '-01';
                $end   = (new \DateTimeImmutable($start, Dates::timezone()))
                    ->modify('last day of this month')->format('Y-m-d');
                $nights = Dates::nights_in_period(
                    (string) $booking['check_in'],
                    (string) $booking['check_out'],
                    $start,
                    $end
                );
                if ($nights > 0) {
                    $months[$month]['room_nights'] += $nights;
                    $months[$month]['stays']++;
                }
            }
        }

        return $months;
    }

    /** Every date a run was recorded on, oldest first. */
    public static function recorded_dates(): array
    {
        global $wpdb;
        $table = self::table();

        return array_map(
            'strval',
            $wpdb->get_col("SELECT DISTINCT recorded_on FROM {$table} ORDER BY recorded_on") ?: []
        );
    }

    /**
     * Dates between the first recording and yesterday with no run at all.
     *
     * Reported as missing rather than filled in: a gap in the history is a
     * fact about the history, and a line drawn through it would be a guess.
     *
     * @return array<int,string>
     */
    public static function missing_dates(?string $today = null): array
    {
        $dates = self::recorded_dates();
        if ($dates === []) {
            return [];
        }

        $today = $today ?? Dates::today();
        $have  = array_flip($dates);
        $out   = [];

        $cursor = new \DateTimeImmutable($dates[0], Dates::timezone());
        $end    = new \DateTimeImmutable($today, Dates::timezone());
        while ($cursor < $end) {
            $day = $cursor->format('Y-m-d');
            if (!isset($have[$day])) {
                $out[] = $day;
            }
            $cursor = $cursor->modify('+1 day');
        }

        return $out;
    }

    /**
     * The pace curve for one stay month: room nights on the books at each
     * of the days-out marks, or null where nothing was recorded.
     *
     * @return array<int,array{days_out:int,as_at:string,room_nights:int|null}>
     */
    public static function curve(string $stay_month): array
    {
        global $wpdb;
        $table = self::table();

        $month_start = new \DateTimeImmutable($stay_month . '-01', Dates::timezone());

        $out = [];
        foreach (self::DAYS_OUT as $days) {
            $as_at = $month_start->modify('-' . $days . ' days')->format('Y-m-d');
            $value = $wpdb->get_var(
                $wpdb->prepare(
                    "SELECT room_nights FROM {$table} WHERE recorded_on = %s AND stay_month = %s",
                    $as_at,
                    $stay_month
                )
            );
            $out[] = [
                'days_out'    => $days,
                'as_at'       => $as_at,
                'room_nights' => $value === null ? null : (int) $value,
            ];
        }

        return $out;
    }

    /**
     * Stay months the recorded history covers well enough to show.
     *
     * A month is shown only when every mark on its curve was recorded. A
     * curve with holes in it invites a reader to join the dots, and the dots
     * would not be there.
     *
     * @return array<int,string>
     */
    public static function months_covered(): array
    {
        $dates = self::recorded_dates();
        if ($dates === []) {
            return [];
        }

        $have  = array_flip($dates);
        $out   = [];

        foreach (self::candidate_months() as $month) {
            $start   = new \DateTimeImmutable($month . '-01', Dates::timezone());
            $covered = true;
            foreach (self::DAYS_OUT as $days) {
                if (!isset($have[$start->modify('-' . $days . ' days')->format('Y-m-d')])) {
                    $covered = false;
                    break;
                }
            }
            if ($covered) {
                $out[] = $month;
            }
        }

        return $out;
    }

    /**
     * When the first month with a complete curve will be available, as a
     * plain date, or null once one already is.
     *
     * Said out loud on the screen, because a chart that is empty for six
     * months looks broken rather than young.
     */
    public static function first_complete_month(): ?string
    {
        $dates = self::recorded_dates();
        if ($dates === []) {
            return null;
        }
        if (self::months_covered() !== []) {
            return null;
        }

        // The earliest mark is 180 days before a month begins, so the first
        // month that can be complete is the one starting 180 days after
        // recording started.
        $first = new \DateTimeImmutable($dates[0], Dates::timezone());

        return $first->modify('+' . max(self::DAYS_OUT) . ' days')
            ->modify('first day of next month')
            ->format('Y-m');
    }

    /** @return array<int,string> */
    private static function candidate_months(): array
    {
        global $wpdb;
        $table = self::table();

        return array_map(
            'strval',
            $wpdb->get_col("SELECT DISTINCT stay_month FROM {$table} ORDER BY stay_month") ?: []
        );
    }

    private static function table(): string
    {
        return Schema::pace();
    }
}
