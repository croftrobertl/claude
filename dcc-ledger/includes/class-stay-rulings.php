<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * "That one really was stayed."
 *
 * A cancelled platform reservation that somebody attached a hand-typed copy
 * to is the one shape whose nights are counted nowhere: the reservation
 * contributes none because the platform says nobody came, and the copy
 * contributes none because it is a copy. With occupancy on the screens that
 * stops being a curiosity and becomes a figure that is wrong — short by
 * those nights, with ADR correspondingly overstated.
 *
 * Nothing here is guessed. A ruling is a person's decision, recorded with
 * what it rests on:
 *
 *   money  the channel paid out for it, and the payout is named in the note
 *   word   Rob says it happened, and says why in the note
 *
 * A ruling is revoked, never deleted, so the record shows both that it was
 * made and that it was taken back.
 */
final class Stay_Rulings
{
    /** The channel paid for it; the note names the payout. */
    public const EVIDENCE_MONEY = 'money';

    /** Rob's own word, with his reason in the note. */
    public const EVIDENCE_WORD = 'word';

    public const EVIDENCE = [self::EVIDENCE_MONEY, self::EVIDENCE_WORD];

    public static function label_for(string $evidence): string
    {
        $labels = [
            self::EVIDENCE_MONEY => __('Money Was Received For It', 'dcc-ledger'),
            self::EVIDENCE_WORD  => __('Rob\'s Own Word', 'dcc-ledger'),
        ];

        return $labels[$evidence] ?? $evidence;
    }

    /**
     * Record that a stay really happened.
     *
     * @return array{ok:bool,message:string}
     */
    public static function rule(int $stay_id, string $evidence, string $note, ?int $user_id = null): array
    {
        global $wpdb;

        if ($stay_id <= 0) {
            return ['ok' => false, 'message' => __('A stay is needed.', 'dcc-ledger')];
        }
        if (!in_array($evidence, self::EVIDENCE, true)) {
            return ['ok' => false, 'message' => __('A ruling has to say what it rests on.', 'dcc-ledger')];
        }

        $note = trim($note);
        if ($note === '') {
            // Both kinds need one. Money needs the payout named; Rob's word
            // needs his reason. A ruling with no reason is a guess with a
            // signature on it.
            return ['ok' => false, 'message' => __('A ruling needs a note: the payout it rests on, or why you know it happened.', 'dcc-ledger')];
        }

        if (Repo::stay_by_id($stay_id) === null) {
            return ['ok' => false, 'message' => __('That stay no longer exists.', 'dcc-ledger')];
        }
        if (self::current($stay_id) !== null) {
            return ['ok' => false, 'message' => __('That stay has already been ruled as stayed.', 'dcc-ledger')];
        }

        $wpdb->insert(Schema::stay_rulings(), [
            'stay_id'    => $stay_id,
            'evidence'   => $evidence,
            'note'       => mb_substr($note, 0, 500),
            'created_at' => Dates::now(),
            'created_by' => $user_id,
        ]);

        Reports::flush_cache();

        return ['ok' => true, 'message' => __('Recorded. Its nights now count once, on the platform stay.', 'dcc-ledger')];
    }

    /**
     * Take a ruling back.
     *
     * Marked revoked rather than removed: the record keeps both halves, the
     * way an assumed payment and its reversal do.
     */
    public static function revoke(int $stay_id, ?int $user_id = null): bool
    {
        global $wpdb;

        $current = self::current($stay_id);
        if ($current === null) {
            return false;
        }

        $wpdb->update(
            Schema::stay_rulings(),
            ['revoked_at' => Dates::now(), 'revoked_by' => $user_id],
            ['id' => (int) $current['id']]
        );

        Reports::flush_cache();

        return true;
    }

    /**
     * The ruling standing against a stay, or null.
     *
     * @return array<string,mixed>|null
     */
    public static function current(int $stay_id): ?array
    {
        global $wpdb;
        $table = Schema::stay_rulings();
        $row   = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE stay_id = %d AND revoked_at IS NULL ORDER BY id DESC LIMIT 1",
                $stay_id
            ),
            ARRAY_A
        );

        return $row ?: null;
    }

    /**
     * Every stay ruled as stayed, as stay id => ruling.
     *
     * Read once and passed down, because the reports ask about every row.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function all_current(): array
    {
        global $wpdb;
        $table = Schema::stay_rulings();

        $out = [];
        foreach ($wpdb->get_results("SELECT * FROM {$table} WHERE revoked_at IS NULL ORDER BY id", ARRAY_A) ?: [] as $row) {
            $out[(int) $row['stay_id']] = $row;
        }

        return $out;
    }

    /** Every ruling ever made, revoked ones included, newest first. */
    public static function history(): array
    {
        global $wpdb;
        $table = Schema::stay_rulings();

        return $wpdb->get_results("SELECT * FROM {$table} ORDER BY id DESC", ARRAY_A) ?: [];
    }
}
