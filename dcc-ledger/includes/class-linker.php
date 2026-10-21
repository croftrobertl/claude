<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Matches ledger stays to MotoPress bookings. Reads MotoPress, writes only to
 * the ledger's own links table.
 *
 * Auto-linking is deliberately timid: a confirmation code, or an exact cottage
 * + check-in + check-out match within the same channel. An overlap, a
 * cross-channel match or a moved cottage is never linked automatically — it
 * goes on the cleanup list with its candidates for Rob to decide.
 */
final class Linker
{
    /**
     * @return array{code:int,exact:int,copy:int,skipped:int}
     */
    public static function run(?int $user_id = null): array
    {
        $counts = ['code' => 0, 'exact' => 0, 'copy' => 0, 'skipped' => 0];

        $bookings = Mphb_Reader::bookings();
        $stays    = self::stays();
        $index    = self::index($bookings);
        $taken    = self::already_linked();

        foreach ($stays as $stay) {
            $stay_id = (int) $stay['id'];
            if (Repo::import_link($stay_id) !== null) {
                continue;
            }

            $booking = self::match_by_code($stay, $index, $taken);
            $method  = 'code';

            if ($booking === null) {
                $booking = self::match_exact($stay, $index, $taken);
                $method  = 'exact';
            }

            if ($booking === null) {
                $counts['skipped']++;
                continue;
            }

            if (Repo::link($stay_id, (int) $booking['id'], $method, $user_id)) {
                $counts[$method]++;
                $taken[(int) $booking['id']] = true;
            }
        }

        // Hand-typed copies. Run after the import links so a direct booking is
        // never mistaken for the imported one.
        $counts['copy'] = self::link_copies($stays, $bookings, $user_id);
        $counts['copy'] += self::link_confirmed_moves($user_id);

        Reports::flush_cache();

        return $counts;
    }

    /**
     * Hand-typed copies of a platform stay, which must never be counted twice.
     *
     * The rules live in Copies, which is also what the snapshot and the
     * reports ask. Only the certain signals are linked automatically — a
     * confirmation code, or the same cottage and dates. A probable move is
     * treated as a copy in the figures but is never linked without a person:
     * linking it would make rejecting it harder than confirming it.
     */
    private static function link_copies(array $stays, array $bookings, ?int $user_id): int
    {
        $linked = 0;

        foreach (Copies::detect(Copies::from_live()) as $booking_id => $match) {
            if ($match['stay_id'] === null) {
                continue;
            }
            if (!in_array($match['reason'], [Copies::REASON_CODE, Copies::REASON_DATES], true)) {
                continue;
            }
            if (self::has_link((int) $match['stay_id'], (int) $booking_id)) {
                continue;
            }
            if (Repo::link((int) $match['stay_id'], (int) $booking_id, 'copy', $user_id)) {
                $linked++;
            }
        }

        return $linked;
    }

    /**
     * The moved-cottage copies Rob confirmed by hand on 2026-10-18, before the
     * ledger could recognise a move on its own. They are recorded as copy
     * links so nobody is asked to confirm them twice.
     *
     * Each is matched on its own dates against a platform stay in a different
     * cottage, so a booking id that means something else on another site can
     * never be linked to the wrong stay.
     *
     * No surname is required here. Rob looked at these four himself, and his
     * decision outranks any signal — including a name that does not match, or
     * a customer record with no name in it at all.
     */
    private static function link_confirmed_moves(?int $user_id): int
    {
        $linked = 0;

        $by_id = [];
        foreach (Mphb_Reader::bookings() as $booking) {
            $by_id[(int) $booking['id']] = $booking;
        }

        $live  = Copies::from_live();
        $moves = Copies::move_candidates($live);

        foreach (Copies::CONFIRMED_MOVES as $booking_id) {
            $booking = $by_id[$booking_id] ?? null;
            if ($booking === null || $booking['is_imported'] || !self::is_live($booking)) {
                continue;
            }
            // move_candidates() gives the stay itself, so the id is 'id'.
            $stay_id = (int) ($moves[$booking_id]['id'] ?? 0);
            if ($stay_id <= 0) {
                // No stay to link it to on this site. Nothing to do, and
                // nothing to guess at.
                continue;
            }
            if (self::has_link($stay_id, $booking_id)) {
                continue;
            }
            if (Repo::link($stay_id, $booking_id, 'copy', $user_id)) {
                $linked++;
                // Recorded as already reviewed: Rob decided this one.
                Repo::mark_reviewed(
                    'move_copy:' . $booking_id . ':' . $stay_id,
                    __('Confirmed by Rob on 2026-10-18.', 'dcc-ledger'),
                    $user_id
                );
            }
        }

        return $linked;
    }

    /**
     * @param array<string,mixed> $stay
     * @param array<string,mixed> $index
     * @param array<int,bool>     $taken
     * @return array<string,mixed>|null
     */
    private static function match_by_code(array $stay, array $index, array $taken): ?array
    {
        $code = strtoupper((string) $stay['code']);
        $hits = $index['by_code'][$code] ?? [];
        $open = [];
        foreach ($hits as $booking) {
            if (!self::is_live($booking) || isset($taken[(int) $booking['id']])) {
                continue;
            }
            $open[] = $booking;
        }
        return count($open) === 1 ? $open[0] : null;
    }

    /**
     * An exact cottage + check-in + check-out match among the same channel's
     * imported bookings. Anything less than exact, or from another channel, is
     * left for a person.
     *
     * @param array<string,mixed> $stay
     * @param array<string,mixed> $index
     * @param array<int,bool>     $taken
     * @return array<string,mixed>|null
     */
    private static function match_exact(array $stay, array $index, array $taken): ?array
    {
        $key  = self::key((string) $stay['cottage'], (string) $stay['check_in'], (string) $stay['check_out']);
        $hits = $index['by_dates'][$key] ?? [];

        $open = [];
        foreach ($hits as $booking) {
            if (!$booking['is_imported'] || !self::is_live($booking) || isset($taken[(int) $booking['id']])) {
                continue;
            }
            // Never a cross-channel match. 'unknown' (the two "ddaysoftware"
            // feeds) is not treated as a match for any channel.
            if ($booking['channel'] !== $stay['channel']) {
                continue;
            }
            $open[] = $booking;
        }

        return count($open) === 1 ? $open[0] : null;
    }

    /**
     * Candidate bookings for a stay a person must link by hand: an overlap, a
     * cross-channel match, or a moved cottage (same dates, other cottage).
     *
     * @param array<string,mixed>            $stay
     * @param array<int,array<string,mixed>> $bookings
     * Each candidate carries the method a person would most likely want: a
     * move is a copy of the same stay, anything else is a plain manual link.
     *
     * @return array<int,array{booking:array<string,mixed>,reason:string,method:string}>
     */
    public static function candidates(array $stay, array $bookings): array
    {
        $out = [];
        foreach ($bookings as $booking) {
            if (!self::is_live($booking) || $booking['check_in'] === null || $booking['check_out'] === null) {
                continue;
            }
            $same_dates   = $booking['check_in'] === $stay['check_in'] && $booking['check_out'] === $stay['check_out'];
            $same_cottage = (string) $booking['cottage'] === (string) $stay['cottage'];

            if ($same_dates && !$same_cottage) {
                $out[] = [
                    'booking' => $booking,
                    'reason'  => __('Same dates, a different cottage — the guest may have been moved.', 'dcc-ledger'),
                    'method'  => $booking['is_imported'] ? 'manual' : 'copy',
                ];
                continue;
            }
            if ($same_dates && $same_cottage && $booking['channel'] !== $stay['channel']) {
                $out[] = [
                    'booking' => $booking,
                    'reason'  => __('Same cottage and dates, but MotoPress has it on another channel.', 'dcc-ledger'),
                    'method'  => 'manual',
                ];
                continue;
            }
            if ($same_cottage && self::overlaps($stay, $booking) && !$same_dates) {
                $out[] = [
                    'booking' => $booking,
                    'reason'  => __('Overlapping dates in the same cottage.', 'dcc-ledger'),
                    'method'  => 'manual',
                ];
            }
        }
        return $out;
    }

    /**
     * @param array<string,mixed> $stay
     * @param array<string,mixed> $booking
     */
    public static function overlaps(array $stay, array $booking): bool
    {
        if ($stay['check_in'] === null || $stay['check_out'] === null) {
            return false;
        }
        if ($booking['check_in'] === null || $booking['check_out'] === null) {
            return false;
        }
        return $stay['check_in'] < $booking['check_out'] && $booking['check_in'] < $stay['check_out'];
    }

    public static function is_live(array $booking): bool
    {
        // A cancelled booking is a dock block or a scrapped reservation. It is
        // never a stay, and never auto-links.
        return in_array((string) $booking['status'], Mphb_Reader::LIVE_STATUSES, true);
    }

    /**
     * @param array<int,array<string,mixed>> $bookings
     * @return array{by_code:array<string,array>,by_dates:array<string,array>}
     */
    public static function index(array $bookings): array
    {
        $by_code  = [];
        $by_dates = [];
        foreach ($bookings as $booking) {
            foreach ($booking['codes'] as $entry) {
                $by_code[strtoupper((string) $entry['code'])][] = $booking;
            }
            $by_dates[self::key(
                (string) $booking['cottage'],
                (string) $booking['check_in'],
                (string) $booking['check_out']
            )][] = $booking;
        }
        return ['by_code' => $by_code, 'by_dates' => $by_dates];
    }

    public static function key(string $cottage, ?string $check_in, ?string $check_out): string
    {
        return $cottage . '|' . (string) $check_in . '|' . (string) $check_out;
    }

    /** @return array<int,array<string,mixed>> */
    public static function stays(): array
    {
        global $wpdb;
        $table = Schema::stays();
        return $wpdb->get_results("SELECT * FROM {$table} ORDER BY check_in, id", ARRAY_A) ?: [];
    }

    /** @return array<int,bool> booking id => already carries an import link */
    private static function already_linked(): array
    {
        $out = [];
        foreach (Repo::all_links() as $link) {
            if ((string) $link['method'] !== 'copy') {
                $out[(int) $link['mphb_booking_id']] = true;
            }
        }
        return $out;
    }

    private static function has_link(int $stay_id, int $booking_id): bool
    {
        foreach (Repo::links_for_stay($stay_id) as $link) {
            if ((int) $link['mphb_booking_id'] === $booking_id) {
                return true;
            }
        }
        return false;
    }
}
