<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Decisions a person made about a guess the ledger offered.
 *
 * Only one so far: "that is not a move". A probable move copy is the ledger's
 * guess, and a guess a person has rejected must stay rejected — otherwise the
 * cleanup list would ask the same question every time it loads, and the
 * figures would keep flipping back.
 *
 * These live in the reviews table, which already holds a person's marks
 * against computed items, under a `decision:` key so they are never confused
 * with a plain "reviewed" tick.
 */
final class Decisions
{
    /** @var array<string,array<string,mixed>>|null */
    private static ?array $cache = null;

    public static function move_key(int $booking_id, int $stay_id): string
    {
        return 'decision:not_a_move:' . $booking_id . ':' . $stay_id;
    }

    public static function reject_move(int $booking_id, int $stay_id, string $note, ?int $user_id): void
    {
        Repo::mark_reviewed(
            self::move_key($booking_id, $stay_id),
            $note !== '' ? $note : __('Rob says this is not a move.', 'dcc-ledger'),
            $user_id
        );
        self::flush();
        Reports::flush_cache();
    }

    public static function move_rejected(int $booking_id, int $stay_id): bool
    {
        // Read once per request: detection asks this for every booking.
        self::$cache ??= Repo::reviews();
        return isset(self::$cache[self::move_key($booking_id, $stay_id)]);
    }

    /** Called whenever a decision changes, so the next read is fresh. */
    public static function flush(): void
    {
        self::$cache = null;
    }

    /** Only for tests and for the admin undoing a rejection. */
    public static function clear_move_rejection(int $booking_id, int $stay_id): void
    {
        Repo::unmark_reviewed(self::move_key($booking_id, $stay_id));
        self::flush();
        Reports::flush_cache();
    }
}
