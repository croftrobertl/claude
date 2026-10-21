<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Which direct bookings are hand-typed copies of a platform stay.
 *
 * Rob sometimes re-entered an OTA stay as a direct booking — because the iCal
 * import failed, or because he moved the guest to another cottage. The stay
 * then exists twice, and counting both would double its nights and its money.
 *
 * Three signals make a copy, taken in this order, first one wins:
 *
 *   link   an existing copy link; somebody already decided this
 *   code   the stay's confirmation code appears in one of the booking's notes
 *   dates  same cottage and same dates as the stay
 *
 * A fourth, the moved-cottage case, is only ever a SUGGESTION. Rob's rule is
 * that every confirmed booking really happened, so a booking is a real stay
 * until a person says it is a copy. Calling one a copy on a guess would
 * silently drop a real stay's money, which is the worse mistake of the two.
 * probable_moves() returns those suggestions for the cleanup list.
 *
 * A move needs the same guest, not merely the same dates: two parties booking
 * the same Friday to Sunday in different cottages is an ordinary busy weekend.
 * So the surname must match too, compared as salted hashes.
 *
 * A cancelled or expired platform stay is never the original of a copy. The
 * money did not come through that channel, so a direct booking on those
 * nights is a real, separate stay. Rob's 5584 is exactly that — a guest who
 * cancelled a Vrbo booking and rebooked direct — and so are 8415 and 9136.
 *
 * 0.1.6 let a cancelled stay originate a copy when it carried money. That was
 * built on a premise that turned out to be wrong, and on its own merits it is
 * the wrong default: calling a real stay a copy drops its money silently,
 * while counting one twice shows up on the cleanup list. Rob's rule is that a
 * confirmed booking really happened, so the ledger does not reclassify one on
 * a guess. A cancelled stay that DOES carry money and has a hand-typed
 * booking on its nights is a genuine oddity, so it is raised as a question
 * instead — see Issues::cancelled_with_money_and_a_twin().
 *
 * This is the single place the question is answered. It used to be answered in
 * three, and they drifted.
 */
final class Copies
{
    public const REASON_LINK  = 'link';
    public const REASON_CODE  = 'code';
    public const REASON_DATES = 'dates';

    /**
     * The order the signals are tried in, and reported in. First one wins, so
     * each copy is counted exactly once and the parts of a breakdown add up to
     * the total.
     *
     * There is no 'move' here on purpose: a move is a suggestion, not a
     * signal that makes something a copy. See probable_moves().
     */
    public const REASON_ORDER = [self::REASON_LINK, self::REASON_CODE, self::REASON_DATES];

    /**
     * Moves Rob confirmed by hand on 2026-10-18, before the move signal
     * existed. They are recorded as copy links so they never need confirming
     * again.
     *
     * Each one names the platform stay's channel and cottage, because its
     * dates alone are not enough to find it. 7278's original cottage held two
     * platform stays on the same nights — an Airbnb reservation and a Vrbo
     * one, which is the double booking that caused the move in the first
     * place — and a seed that only knew the dates found two candidates, gave
     * up, and linked nothing at all. Rob's ruling names the platform, so the
     * seed does too.
     */
    public const CONFIRMED_MOVES = [
        7278  => ['channel' => 'airbnb',     'cottage' => '32'],
        12443 => ['channel' => 'bookingcom', 'cottage' => '34'],
        12447 => ['channel' => 'bookingcom', 'cottage' => '34'],
        17462 => ['channel' => 'airbnb',     'cottage' => '32'],
    ];

    /**
     * The platform stay a confirmed move belongs to: the one in the channel
     * and cottage Rob named, on the booking's own nights.
     *
     * @param array{channel:string,cottage:string} $spec
     * @return array<string,mixed>|null
     */
    public static function confirmed_move_stay(array $spec, ?string $check_in, ?string $check_out): ?array
    {
        if ($check_in === null || $check_out === null) {
            return null;
        }

        $found = [];
        foreach (self::live_stays() as $stay) {
            if ((string) $stay['channel'] !== $spec['channel']) {
                continue;
            }
            if ((string) $stay['cottage'] !== $spec['cottage']) {
                continue;
            }
            if ((string) $stay['check_in'] !== $check_in || (string) $stay['check_out'] !== $check_out) {
                continue;
            }
            $found[] = $stay;
        }

        // Still ambiguous even within one channel and cottage: that is not
        // something to guess at either.
        return count($found) === 1 ? $found[0] : null;
    }

    /**
     * The copies: bookings whose money came through a platform, so counting
     * them again would double it.
     *
     * A probable move is NOT here. It is a suggestion, not a finding.
     *
     * @param array<int,array{id:int,cottage:string,check_in:?string,check_out:?string,codes:array<int,string>,guest_keys:array<int,string>}> $bookings
     * @return array<int,array{reason:string,stay_id:int|null,stay_code:string,confirmed:bool}>
     */
    public static function detect(array $bookings): array
    {
        $stays = self::live_stays();
        $links = self::copy_links();

        $by_code = [];
        $by_key  = [];
        foreach ($stays as $stay) {
            $by_code[strtoupper((string) $stay['code'])] = $stay;
            $by_key[Linker::key((string) $stay['cottage'], $stay['check_in'], $stay['check_out'])] = $stay;
        }

        $out = [];

        foreach ($bookings as $booking) {
            $id = (int) $booking['id'];

            // 1. An existing link. Somebody already decided this one, and
            //    their decision outranks every guess below it.
            if (isset($links[$id])) {
                $out[$id] = [
                    'reason'    => self::REASON_LINK,
                    'stay_id'   => $links[$id],
                    'stay_code' => '',
                    'confirmed' => true,
                ];
                continue;
            }

            // 2. A confirmation code written into one of the booking's notes.
            $matched = null;
            $reason  = '';
            foreach ($booking['codes'] as $code) {
                $code = strtoupper((string) $code);
                if ($code !== '' && isset($by_code[$code])) {
                    $matched = $by_code[$code];
                    $reason  = self::REASON_CODE;
                    break;
                }
            }

            // 3. The same cottage on the same dates. Nothing else can be
            //    standing there, so it is the same stay.
            if ($matched === null) {
                $key = Linker::key((string) $booking['cottage'], $booking['check_in'], $booking['check_out']);
                if (isset($by_key[$key])) {
                    $matched = $by_key[$key];
                    $reason  = self::REASON_DATES;
                }
            }

            if ($matched === null) {
                continue;
            }

            $out[$id] = [
                'reason'    => $reason,
                'stay_id'   => (int) $matched['id'],
                'stay_code' => (string) $matched['code'],
                'confirmed' => true,
            ];
        }

        return $out;
    }

    /**
     * Bookings that look like the same guest moved to another cottage.
     *
     * Same dates, a different cottage, nothing standing in the platform
     * stay's own cottage, and the same surname. Each one is a question for
     * the cleanup list, never an answer: until it is confirmed the booking
     * counts as the real stay it probably is.
     *
     * @param array<int,array<string,mixed>> $bookings
     * @return array<int,array{stay_id:int,stay_code:string,named:bool}>
     */
    public static function probable_moves(array $bookings): array
    {
        $copies = self::detect($bookings);
        $out    = [];

        foreach (self::move_candidates($bookings) as $id => $stay) {
            if (isset($copies[$id])) {
                continue; // Already settled by a surer signal.
            }
            if (Decisions::move_rejected($id, (int) $stay['id'])) {
                continue;
            }

            $booking = null;
            foreach ($bookings as $candidate) {
                if ((int) $candidate['id'] === $id) {
                    $booking = $candidate;
                    break;
                }
            }
            if ($booking === null) {
                continue;
            }

            $booking_keys = $booking['guest_keys'] ?? [];
            $stay_keys    = Names::decode($stay['guest_keys'] ?? null);

            if ($booking_keys === [] || $stay_keys === []) {
                // Nothing to compare. Reported as such; never guessed at.
                $out[$id] = [
                    'stay_id'   => (int) $stay['id'],
                    'stay_code' => (string) $stay['code'],
                    'named'     => false,
                ];
                continue;
            }

            if (!Names::match($booking_keys, $stay_keys)) {
                // A different party, on the same busy weekend.
                continue;
            }

            $out[$id] = [
                'stay_id'   => (int) $stay['id'],
                'stay_code' => (string) $stay['code'],
                'named'     => true,
            ];
        }

        return $out;
    }

    /**
     * Every booking that sits where a moved guest would sit: the same dates,
     * another cottage, and nothing standing in the platform stay's own
     * cottage. Geometry only — no surname is considered here.
     *
     * @param array<int,array<string,mixed>> $bookings
     * @return array<int,array<string,mixed>> booking id => stay
     */
    public static function move_candidates(array $bookings): array
    {
        $by_dates = [];
        foreach (self::live_stays() as $stay) {
            $by_dates[self::date_key($stay['check_in'], $stay['check_out'])][] = $stay;
        }

        $direct_keys = [];
        foreach ($bookings as $booking) {
            $direct_keys[Linker::key(
                (string) $booking['cottage'],
                $booking['check_in'],
                $booking['check_out']
            )] = true;
        }

        $out = [];
        foreach ($bookings as $booking) {
            $stay = self::move_candidate($booking, $by_dates, $direct_keys);
            if ($stay !== null) {
                $out[(int) $booking['id']] = $stay;
            }
        }

        return $out;
    }

    /**
     * A platform stay that happened, on exactly these dates, in another
     * cottage, with nothing standing in its own cottage.
     *
     * @param array<string,mixed>                     $booking
     * @param array<string,array<int,array>>          $by_dates
     * @param array<string,bool>                      $direct_keys
     * @return array<string,mixed>|null
     */
    private static function move_candidate(array $booking, array $by_dates, array $direct_keys): ?array
    {
        if ($booking['check_in'] === null || $booking['check_out'] === null) {
            return null;
        }

        $candidates = [];
        foreach ($by_dates[self::date_key($booking['check_in'], $booking['check_out'])] ?? [] as $stay) {
            if ((string) $stay['cottage'] === (string) $booking['cottage']) {
                continue;
            }
            // Something is already standing in that stay's own cottage on
            // those dates, so this booking is not where the guest went.
            if (isset($direct_keys[Linker::key((string) $stay['cottage'], $stay['check_in'], $stay['check_out'])])) {
                continue;
            }
            $candidates[] = $stay;
        }

        // Two stays on the same dates in different cottages is not something
        // to guess at; the cleanup list will ask instead.
        return count($candidates) === 1 ? $candidates[0] : null;
    }

    /**
     * Every direct booking as MotoPress holds it now.
     *
     * Confirmed ones only. A cancelled booking is a dock block or a scrapped
     * reservation — never a stay, so never a copy, a move, or a question to
     * put in front of Rob.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function from_live(): array
    {
        $out = [];
        foreach (Mphb_Reader::bookings() as $booking) {
            if ($booking['is_imported'] || !Cottages::is_cottage((string) $booking['cottage'])) {
                continue;
            }
            if ((string) $booking['status'] !== Snapshot::CONFIRMED) {
                continue;
            }
            $codes = [];
            foreach ($booking['note_codes'] as $entry) {
                $codes[] = (string) $entry['code'];
            }
            $out[] = [
                'id'         => (int) $booking['id'],
                'cottage'    => (string) $booking['cottage'],
                'check_in'   => $booking['check_in'],
                'check_out'  => $booking['check_out'],
                'codes'      => $codes,
                'guest_keys' => $booking['guest_keys'] ?? [],
            ];
        }
        return $out;
    }

    /**
     * Every direct booking as the ledger copied it. Confirmed ones only, for
     * the same reason as from_live().
     *
     * @return array<int,array<string,mixed>>
     */
    public static function from_originals(): array
    {
        $out = [];
        foreach (Originals::all(Originals::KIND_BOOKING) as $booking) {
            if ((string) $booking['booking_status'] !== Snapshot::CONFIRMED) {
                continue;
            }
            $codes = [];
            foreach (Repo::decode_meta($booking['codes'] ?? null) as $entry) {
                $codes[] = is_array($entry) ? (string) ($entry['code'] ?? '') : (string) $entry;
            }
            $out[] = [
                'id'         => (int) $booking['mphb_id'],
                'cottage'    => (string) $booking['cottage'],
                'check_in'   => $booking['check_in'],
                'check_out'  => $booking['check_out'],
                'codes'      => $codes,
                'guest_keys' => Names::decode($booking['guest_keys'] ?? null),
            ];
        }
        return $out;
    }

    /**
     * Just the ids, for the places that only need to exclude them.
     *
     * @param array<int,array<string,mixed>> $detected
     * @return array<int,bool>
     */
    public static function ids(array $detected): array
    {
        $out = [];
        foreach (array_keys($detected) as $id) {
            $out[(int) $id] = true;
        }
        return $out;
    }

    /**
     * Every stay, with the money that belongs to the stay itself.
     *
     * A cancellation fee is not money for a stay — nobody stayed — so it is
     * not counted here.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function stays(): array
    {
        global $wpdb;
        $stays = Schema::stays();
        $lines = Schema::lines();

        return $wpdb->get_results(
            "SELECT s.id, s.code, s.channel, s.cottage, s.check_in, s.check_out,
                    s.status, s.guest_keys,
                    COALESCE(SUM(CASE WHEN l.type = 'guest_total' THEN l.amount ELSE 0 END), 0) AS guest_total,
                    COALESCE(SUM(CASE WHEN l.type = 'room_sales' THEN l.amount ELSE 0 END), 0) AS room_sales,
                    COALESCE(SUM(CASE WHEN l.type = 'payout' THEN l.amount ELSE 0 END), 0) AS payout,
                    COALESCE(SUM(CASE WHEN l.type = 'refund' THEN l.amount ELSE 0 END), 0) AS refund,
                    COALESCE(SUM(CASE WHEN l.type = 'adjustment' THEN l.amount ELSE 0 END), 0) AS adjustment,
                    COALESCE(SUM(CASE WHEN l.type = 'resolution' THEN l.amount ELSE 0 END), 0) AS resolution,
                    COALESCE(SUM(CASE WHEN l.type = 'payout' THEN 1 ELSE 0 END), 0) AS payout_rows
               FROM {$stays} s
               LEFT JOIN {$lines} l ON l.stay_id = s.id
              GROUP BY s.id, s.code, s.channel, s.cottage, s.check_in, s.check_out,
                       s.status, s.guest_keys",
            ARRAY_A
        ) ?: [];
    }

    /**
     * Can this stay be the original of a copy? Only if it happened.
     *
     * @param array<string,mixed> $stay
     */
    public static function can_originate_copy(array $stay): bool
    {
        return (string) $stay['status'] === 'ok';
    }

    /**
     * Money types that say what actually moved for a stay.
     *
     * A cancellation fee is not among them: nobody stayed, so it is not
     * money for a stay.
     */
    public const STAY_CASH_TYPES = ['payout', 'refund', 'adjustment', 'resolution'];

    /** What the guest was billed, for a stay with no payout row to go on. */
    public const STAY_BILLED_TYPES = ['guest_total', 'room_sales'];

    /**
     * Money that belongs to the stay itself.
     *
     * Summing every money type double-counts: for Booking.com the payout and
     * the guest total are the same money seen twice. So where a payout row
     * exists it is the measure, with refunds, adjustments and resolutions
     * netted off it; where none exists — the stay is in an export but the
     * money has not come through yet — what the guest was billed stands in.
     *
     * Netting matters: Booking.com 6486225525 is a cancelled stay with a
     * $292.16 payout and a $292.16 refund against it, which is nothing at
     * all, and was raised as a cancelled stay still holding money until the
     * refund was netted.
     *
     * The one definition lives here because it was written twice once and
     * the two drifted.
     *
     * @param array<string,mixed> $stay A row from Copies::stays() or
     *                                  Issues::stays_with_money().
     */
    public static function stay_money(array $stay): float
    {
        $cash = 0.0;
        foreach (self::STAY_CASH_TYPES as $type) {
            $cash = round($cash + (float) ($stay[$type] ?? 0), 2);
        }
        if ((int) ($stay['payout_rows'] ?? 0) > 0) {
            return $cash;
        }
        $billed = 0.0;
        foreach (self::STAY_BILLED_TYPES as $type) {
            $billed = round($billed + (float) ($stay[$type] ?? 0), 2);
        }
        return round($billed + $cash, 2);
    }

    /**
     * The stays a copy can be a copy OF.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function live_stays(): array
    {
        return array_values(array_filter(self::stays(), [self::class, 'can_originate_copy']));
    }

    /** @return array<int,int> booking id => stay id */
    private static function copy_links(): array
    {
        $out = [];
        foreach (Repo::all_links() as $link) {
            if ((string) $link['method'] === 'copy') {
                $out[(int) $link['mphb_booking_id']] = (int) $link['stay_id'];
            }
        }
        return $out;
    }

    private static function date_key(?string $check_in, ?string $check_out): string
    {
        return (string) $check_in . '|' . (string) $check_out;
    }
}
