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
 * money never came through that channel, so a direct booking on those dates is
 * a real, separate stay — Rob's 5584 is exactly that case.
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
     */
    public const CONFIRMED_MOVES = [7278, 12443, 12447, 17462];

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

    /** @return array<int,array<string,mixed>> */
    public static function stays(): array
    {
        global $wpdb;
        $table = Schema::stays();
        return $wpdb->get_results(
            "SELECT id, code, channel, cottage, check_in, check_out, status, guest_keys FROM {$table}",
            ARRAY_A
        ) ?: [];
    }

    /**
     * Only stays that actually happened. A cancelled or expired reservation
     * never produced money through that channel, so nothing can be a copy of
     * one.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function live_stays(): array
    {
        return array_values(array_filter(
            self::stays(),
            static fn ($stay) => (string) $stay['status'] === 'ok'
        ));
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
