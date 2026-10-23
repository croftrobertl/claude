<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * New iCal imports start at 2 guests, NOT confirmed (v0.32.0, Rob's pick D,
 * 2026-10-10: "the OTAs generally allow two guests").
 *
 * MotoPress 6.3.0's importer (includes/i-cal/importer.php createBooking(),
 * ~195; Director's read of live source) sets each reserved room's adults to
 * the room type's ADULTS CAPACITY — 4 on the six 4-sleeper cottages since the
 * September capacity change. It has no filter on that value, and
 * BookingRepository::save() saves the reserved rooms DURING creation, so by
 * the time do_action('mphb_create_booking_via_ical', $booking) fires the
 * reserved-room posts exist. This corrects the count after the save:
 *
 *  - `_mphb_adults` becomes min(2, what the importer wrote) — never raised;
 *  - the confirmed marker is NEVER written (a default is not anyone's answer),
 *    and a room that already carries it is never touched;
 *  - children are NOT written: their meta key has not been read from source
 *    here, and every live cottage's children capacity is 0, so the importer
 *    already writes 0.
 *
 * updateBooking() (~250–284, Director's read) never deletes or recreates
 * reserved rooms and never writes adults or children, so the 2 survives every
 * later sync. Existing imports are NOT migrated (the Director changes the four
 * live rooms at 4 by hand, after the calendar fix).
 */
final class Ical_Defaults
{
    public const DEFAULT_ADULTS = 2;

    public function register(): void
    {
        add_action('mphb_create_booking_via_ical', [self::class, 'on_import'], 10, 1);
    }

    /** @param mixed $booking The new MotoPress Booking (the only argument). */
    public static function on_import($booking): void
    {
        $id = is_object($booking) && method_exists($booking, 'getId') ? (int) $booking->getId()
            : (is_numeric($booking) ? (int) $booking : 0);
        if ($id <= 0) {
            return;
        }
        // Read fresh by booking id, as the Director advised.
        $rooms = get_posts([
            'post_type'        => 'mphb_reserved_room',
            'post_parent'      => $id,
            'post_status'      => 'any',
            'numberposts'      => 50,
            'fields'           => 'ids',
            'suppress_filters' => true,
        ]);
        foreach ((array) $rooms as $rid) {
            $rid = (int) $rid;
            if (Admin_Guests::is_confirmed(get_post_meta($rid, Admin_Guests::CONFIRMED_KEY, true))) {
                continue; // staff-confirmed: never touched
            }
            $raw = get_post_meta($rid, Admin_Guests::META_KEY, true);
            if (!is_numeric($raw) || (int) $raw <= self::DEFAULT_ADULTS) {
                continue; // nothing above the default to bring down
            }
            update_post_meta($rid, Admin_Guests::META_KEY, self::DEFAULT_ADULTS);
        }
    }
}
