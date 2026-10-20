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
 * Four signals, in order of how certain they are:
 *
 *   link   an existing copy link; somebody already decided this
 *   code   the stay's confirmation code appears in one of the booking's notes
 *   dates  same cottage and same dates as the stay
 *   move   same dates, a different cottage, and nothing else claims that stay
 *
 * A cancelled or expired platform stay is never the original of a copy. The
 * money never came through that channel, so a direct booking on those dates is
 * a real, separate stay — Rob's 5584 is exactly that case.
 *
 * This is the single place the question is answered. It used to be answered
 * twice, once against live MotoPress and once against the ledger's copy, and
 * the two drifted.
 */
final class Copies
{
    public const REASON_LINK  = 'link';
    public const REASON_CODE  = 'code';
    public const REASON_DATES = 'dates';
    public const REASON_MOVE  = 'move';

    /**
     * Moves Rob confirmed by hand on 2026-10-18, before the move signal
     * existed. They are recorded as copy links so they never need confirming
     * again.
     */
    public const CONFIRMED_MOVES = [7278, 12443, 12447, 17462];

    /**
     * Detect copies among a set of direct bookings.
     *
     * @param array<int,array{id:int,cottage:string,check_in:?string,check_out:?string,codes:array<int,string>}> $bookings
     * @return array<int,array{reason:string,stay_id:int|null,stay_code:string,confirmed:bool}>
     */
    public static function detect(array $bookings): array
    {
        $stays = self::stays();
        $links = self::copy_links();

        $by_code = [];
        $by_key  = [];
        $by_dates = [];
        foreach ($stays as $stay) {
            // Only a stay that actually happened can be the original of a copy.
            if ((string) $stay['status'] !== 'ok') {
                continue;
            }
            $by_code[strtoupper((string) $stay['code'])] = $stay;
            $by_key[Linker::key((string) $stay['cottage'], $stay['check_in'], $stay['check_out'])] = $stay;
            $by_dates[self::date_key($stay['check_in'], $stay['check_out'])][] = $stay;
        }

        // Which cottage-and-dates slots a direct booking already occupies. A
        // move is only a move when nothing sits in the stay's own cottage.
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
            $id     = (int) $booking['id'];
            $linked = $links[$id] ?? null;

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

            if ($matched === null) {
                $key = Linker::key((string) $booking['cottage'], $booking['check_in'], $booking['check_out']);
                if (isset($by_key[$key])) {
                    $matched = $by_key[$key];
                    $reason  = self::REASON_DATES;
                }
            }

            if ($matched === null) {
                $matched = self::move_candidate($booking, $by_dates, $direct_keys);
                $reason  = self::REASON_MOVE;
            }

            if ($matched === null) {
                // Nothing explains it now, but somebody linked it before.
                // Their decision stands.
                if ($linked !== null) {
                    $out[$id] = [
                        'reason'    => self::REASON_LINK,
                        'stay_id'   => $linked,
                        'stay_code' => '',
                        'confirmed' => true,
                    ];
                }
                continue;
            }

            // A confirmed link outranks a rejection: somebody said yes after
            // somebody said no.
            if ($reason === self::REASON_MOVE
                && $linked === null
                && Decisions::move_rejected($id, (int) $matched['id'])) {
                continue;
            }

            $out[$id] = [
                // The signal that found it, not the link it has since been
                // given — otherwise a copy count can never be reconciled
                // against how each one was recognised.
                'reason'    => $reason,
                'stay_id'   => $linked ?? (int) $matched['id'],
                'stay_code' => (string) $matched['code'],
                // A move is a guess until a person says otherwise; a code or
                // an exact cottage-and-dates match is not.
                'confirmed' => $reason !== self::REASON_MOVE || $linked !== null,
            ];
        }

        return $out;
    }

    /**
     * A platform stay on exactly these dates in another cottage, with nothing
     * of its own in its own cottage.
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
     * @return array<int,array<string,mixed>>
     */
    public static function from_live(): array
    {
        $out = [];
        foreach (Mphb_Reader::bookings() as $booking) {
            if ($booking['is_imported'] || !Cottages::is_cottage((string) $booking['cottage'])) {
                continue;
            }
            $codes = [];
            foreach ($booking['note_codes'] as $entry) {
                $codes[] = (string) $entry['code'];
            }
            $out[] = [
                'id'        => (int) $booking['id'],
                'cottage'   => (string) $booking['cottage'],
                'check_in'  => $booking['check_in'],
                'check_out' => $booking['check_out'],
                'codes'     => $codes,
            ];
        }
        return $out;
    }

    /**
     * Every direct booking as the ledger copied it.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function from_originals(): array
    {
        $out = [];
        foreach (Originals::all(Originals::KIND_BOOKING) as $booking) {
            $codes = [];
            foreach (Repo::decode_meta($booking['codes'] ?? null) as $entry) {
                $codes[] = is_array($entry) ? (string) ($entry['code'] ?? '') : (string) $entry;
            }
            $out[] = [
                'id'        => (int) $booking['mphb_id'],
                'cottage'   => (string) $booking['cottage'],
                'check_in'  => $booking['check_in'],
                'check_out' => $booking['check_out'],
                'codes'     => $codes,
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
            "SELECT id, code, channel, cottage, check_in, check_out, status FROM {$table}",
            ARRAY_A
        ) ?: [];
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
