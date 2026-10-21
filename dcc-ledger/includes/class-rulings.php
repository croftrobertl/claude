<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Decisions Rob has made about particular bookings, which no signal in the
 * data could reach on its own.
 *
 * Each is a list of booking ids, applied once and recorded as ordinary
 * adjustments so it can be seen, reversed and undone. They are kept here
 * rather than in the code that uses them so that there is one place to read
 * what has been decided by hand, and when.
 */
final class Rulings
{
    /**
     * Rob's ruling of 2026-10-21: these fifteen stays, all before the
     * platform exports begin, were paid in full.
     *
     * The exports start on 2025-01-01, so nothing before that can be checked
     * against a platform stay, and copy detection cannot run there at all. If
     * one of these turns out to be a hand-typed copy of a platform booking,
     * Reverse This Assumption is how it is taken back.
     *
     * The window rule is not widened for this. Only these fifteen.
     */
    public const ASSUMED_BEFORE_EXPORTS = [
        1152, 1599, 1601, 1615, 1725, 1727, 1810, 1812,
        1846, 1849, 1851, 1853, 2090, 2856, 4393,
    ];

    /**
     * Rob's ruling of 2026-10-21: these three bookings were refunded, and the
     * refund never reached MotoPress.
     *
     * The amount is not stored. It is worked out as the overpayment at the
     * time it is applied, so the adjustment always brings the booking to
     * exactly its total rather than to a figure typed in once and left.
     */
    public const UNRECORDED_REFUNDS = [7983, 7989, 10465];

    public static function is_assumed_before_exports(int $booking_id): bool
    {
        return in_array($booking_id, self::ASSUMED_BEFORE_EXPORTS, true);
    }

    public static function has_unrecorded_refund(int $booking_id): bool
    {
        return in_array($booking_id, self::UNRECORDED_REFUNDS, true);
    }
}
