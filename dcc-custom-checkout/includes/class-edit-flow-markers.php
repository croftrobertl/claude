<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Keeps a staff-confirmed guest count confirmed through MotoPress's own
 * "Edit Accommodations" flow (v0.32.0).
 *
 * That flow's save step (admin/menu-pages/edit-booking/booking-control.php,
 * Director's read of live 6.3.0) builds NEW ReservedRoom objects without ids,
 * so updateReservedRooms() DELETES every reserved-room post and saves new ones
 * — taking `_mphb_adults_confirmed` with them. 0.32.0 sends staff to that flow
 * to change the pet fee, so the marker has to survive it.
 *
 *  - before_delete_post: when a CONFIRMED reserved room is deleted, remember
 *    its booking, physical room (`_mphb_room_id`) and count, for this request.
 *  - mphb_booking_edited ($new, $old): for each new reserved room of that
 *    booking on the SAME physical room with the SAME count, write the marker
 *    back. A changed count is not carried: nobody confirmed the new number.
 *
 * Fails safe: if MotoPress removes the rooms without before_delete_post, or
 * the hook is never fired, nothing is remembered and nothing is written — the
 * count is then unconfirmed, the state the calendar treats as "not provided".
 */
final class Edit_Flow_Markers
{
    /** @var array<int, array<int, int>> booking id => physical room id => confirmed count */
    private static array $seen = [];

    public function register(): void
    {
        add_action('before_delete_post', [self::class, 'remember'], 10, 1);
        add_action('mphb_booking_edited', [self::class, 'restore'], 10, 1);
    }

    /** @param mixed $post_id */
    public static function remember($post_id): void
    {
        $post_id = (int) $post_id;
        $post = get_post($post_id);
        if (!$post || $post->post_type !== 'mphb_reserved_room') {
            return;
        }
        if (!Admin_Guests::is_confirmed(get_post_meta($post_id, Admin_Guests::CONFIRMED_KEY, true))) {
            return;
        }
        $count = get_post_meta($post_id, Admin_Guests::META_KEY, true);
        $room  = (int) get_post_meta($post_id, '_mphb_room_id', true);
        if (!is_numeric($count) || (int) $count < 1 || $room <= 0 || (int) $post->post_parent <= 0) {
            return;
        }
        self::$seen[(int) $post->post_parent][$room] = (int) $count;
    }

    /** @param mixed $booking The edited Booking (mphb_booking_edited's first argument). */
    public static function restore($booking): void
    {
        $id = is_object($booking) && method_exists($booking, 'getId') ? (int) $booking->getId() : 0;
        if ($id <= 0 || empty(self::$seen[$id])) {
            return;
        }
        $rooms = get_posts([
            'post_type'        => 'mphb_reserved_room',
            'post_parent'      => $id,
            'post_status'      => 'any',
            'numberposts'      => 50,
            'fields'           => 'ids',
            'suppress_filters' => true,
        ]);
        foreach ((array) $rooms as $rid) {
            $rid  = (int) $rid;
            $room = (int) get_post_meta($rid, '_mphb_room_id', true);
            if (!isset(self::$seen[$id][$room])) {
                continue;
            }
            $count = get_post_meta($rid, Admin_Guests::META_KEY, true);
            if (is_numeric($count) && (int) $count === self::$seen[$id][$room]
                && !Admin_Guests::is_confirmed(get_post_meta($rid, Admin_Guests::CONFIRMED_KEY, true))) {
                update_post_meta($rid, Admin_Guests::CONFIRMED_KEY, 1);
            }
        }
        unset(self::$seen[$id]);
    }
}
