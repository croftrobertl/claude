<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Admin booking screen: state the real guest count.
 *
 * WHY THIS EXISTS
 * When an iCal import supplies no guest count, MotoPress fills `_mphb_adults`
 * with the ROOM TYPE'S CAPACITY rather than leaving it empty — booking #18433
 * shows 4 guests for a Booking.com reservation that was for 2. Nothing in the
 * admin lets anyone correct it, so /staff/ reads a number that was never
 * anybody's answer, and cannot tell a real 4 from a defaulted 4.
 *
 * WHAT THIS DOES
 * One <select> per reserved room on the booking edit screen: "Not provided",
 * then 1 .. the room type's adults capacity. Saving writes `_mphb_adults` on
 * that reserved room; "Not provided" DELETES the meta rather than storing a
 * zero, so "nobody told us" and "two guests" stay different facts — which is
 * the whole point of the control.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It never guesses. If the capacity cannot be read it offers a wider range and
 * says so, rather than capping the owner below the truth. It never writes on a
 * screen it did not render a nonce for, never on autosave, and never for a user
 * who cannot edit the booking.
 *
 * DCC-VERIFY: the reserved-room relationships are the ones this repo's
 * availability calendar already relies on in live SQL — `mphb_reserved_room`
 * posts are children of the `mphb_booking` post (post_parent) and carry
 * `_mphb_room_id`; physical rooms carry `mphb_room_type_id`. The meta key
 * `_mphb_adults` is MotoPress's own and was supplied with booking #18433 as
 * evidence; it has not been read back from a live database here.
 */
final class Admin_Guests
{
    private const BOOKING_POST_TYPE = 'mphb_booking';
    private const RESERVED_POST_TYPE = 'mphb_reserved_room';
    private const META_KEY = '_mphb_adults';
    private const NONCE = 'dcc_admin_guests';

    /** Used only when the room type's capacity cannot be read at all. */
    private const FALLBACK_MAX = 8;

    public function register(): void
    {
        add_action('add_meta_boxes', [$this, 'add_box']);
        add_action('save_post_' . self::BOOKING_POST_TYPE, [$this, 'save'], 10, 2);
    }

    public function add_box(): void
    {
        add_meta_box(
            'dcc-checkout-guests',
            __('Guest count', 'dcc-checkout'),
            [$this, 'render'],
            self::BOOKING_POST_TYPE,
            'side',
            'default'
        );
    }

    /**
     * @param mixed $post WP_Post for the booking being edited.
     */
    public function render($post): void
    {
        if (!$post instanceof \WP_Post) {
            return;
        }
        $rooms = $this->reserved_rooms((int) $post->ID);

        echo '<div class="dcc_admin-guests">';

        if (!$rooms) {
            echo '<p class="description">'
                . esc_html__('No accommodation is attached to this booking yet. Save it once and the guest count can be set here.', 'dcc-checkout')
                . '</p></div>';
            return;
        }

        wp_nonce_field(self::NONCE, self::NONCE . '_nonce');

        echo '<p class="description">'
            . esc_html__('MotoPress fills this with the cottage\'s capacity when an import supplies no count, so a number here is not necessarily what the guest said. Set the real number, or "Not provided" if nobody told us.', 'dcc-checkout')
            . '</p>';

        foreach ($rooms as $room) {
            $field = 'dcc_adults_' . $room['id'];
            echo '<p>';
            echo '<label for="' . esc_attr($field) . '"><strong>'
                . esc_html($room['label']) . '</strong></label><br>';
            echo '<select id="' . esc_attr($field) . '" name="dcc_adults[' . esc_attr((string) $room['id']) . ']" style="width:100%">';
            echo '<option value="">' . esc_html__('Not provided', 'dcc-checkout') . '</option>';
            for ($n = 1; $n <= $room['max']; $n++) {
                printf(
                    '<option value="%1$d"%2$s>%1$d</option>',
                    $n,
                    selected($room['adults'], $n, false)
                );
            }
            echo '</select>';
            if (!$room['capacity_known']) {
                echo '<span class="description">'
                    . esc_html__('This cottage\'s capacity could not be read, so the list is not capped to it.', 'dcc-checkout')
                    . '</span>';
            }
            echo '</p>';
        }

        echo '</div>';
    }

    /**
     * @param mixed $post_id
     * @param mixed $post
     */
    public function save($post_id, $post = null): void
    {
        $post_id = (int) $post_id;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }
        // Absent nonce means this save came from somewhere that never rendered
        // the control — a bulk edit, another plugin, a REST write. Leave the
        // stored value exactly as it is.
        if (empty($_POST[self::NONCE . '_nonce'])
            || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST[self::NONCE . '_nonce'])), self::NONCE)) {
            return;
        }
        if (!current_user_can('edit_post', $post_id)) {
            return;
        }
        if (!isset($_POST['dcc_adults']) || !is_array($_POST['dcc_adults'])) {
            return;
        }

        $submitted = wp_unslash($_POST['dcc_adults']);
        $allowed = $this->reserved_rooms($post_id);
        foreach ($allowed as $room) {
            $id = $room['id'];
            if (!array_key_exists($id, $submitted)) {
                continue;
            }
            $raw = trim((string) $submitted[$id]);

            if ($raw === '') {
                // "Not provided" stores NOTHING. A zero would read as a real
                // answer of nobody, and /staff/ could not tell the two apart.
                delete_post_meta($id, self::META_KEY);
                $this->log($post_id, $room['label'], null);
                continue;
            }

            $value = (int) $raw;
            if ($value < 1 || $value > $room['max']) {
                continue; // Out of range: ignore rather than store a wrong count.
            }
            if ((string) get_post_meta($id, self::META_KEY, true) === (string) $value) {
                continue; // Unchanged — no write, no log line.
            }
            update_post_meta($id, self::META_KEY, $value);
            $this->log($post_id, $room['label'], $value);
        }
    }

    /**
     * Every reserved room on this booking, with its capacity and stored count.
     *
     * @return array<int, array{id:int,label:string,adults:int,max:int,capacity_known:bool}>
     */
    private function reserved_rooms(int $booking_id): array
    {
        if ($booking_id <= 0) {
            return [];
        }
        $posts = get_posts([
            'post_type'        => self::RESERVED_POST_TYPE,
            'post_parent'      => $booking_id,
            'post_status'      => 'any',
            'numberposts'      => 50,
            'orderby'          => 'ID',
            'order'            => 'ASC',
            'suppress_filters' => false,
        ]);

        $out = [];
        foreach ((array) $posts as $rr) {
            $room_id = (int) get_post_meta($rr->ID, '_mphb_room_id', true);
            $type_id = $room_id > 0 ? (int) get_post_meta($room_id, 'mphb_room_type_id', true) : 0;
            $capacity = $type_id > 0 ? $this->capacity($type_id) : null;
            $stored = get_post_meta($rr->ID, self::META_KEY, true);

            $label = $type_id > 0 ? get_the_title($type_id) : '';
            if ($label === '') {
                $label = $room_id > 0 ? get_the_title($room_id) : '';
            }
            if ($label === '') {
                /* translators: %d: reserved room post ID. */
                $label = sprintf(__('Accommodation #%d', 'dcc-checkout'), $rr->ID);
            }

            $out[] = [
                'id'             => (int) $rr->ID,
                'label'          => (string) $label,
                'adults'         => (int) $stored,
                'max'            => $capacity !== null ? $capacity : self::FALLBACK_MAX,
                'capacity_known' => $capacity !== null,
            ];
        }
        return $out;
    }

    /**
     * A room type's adults capacity, or null when it cannot be read.
     *
     * Null is a real answer here and must not be collapsed into a number: the
     * caller widens the range and tells the admin why, rather than silently
     * capping the owner below the truth.
     */
    private function capacity(int $room_type_id): ?int
    {
        if (function_exists('MPHB')) {
            try {
                $type = MPHB()->getRoomTypeRepository()->findById($room_type_id);
                if ($type && method_exists($type, 'getAdultsCapacity')) {
                    $n = (int) $type->getAdultsCapacity();
                    if ($n > 0) {
                        return $n;
                    }
                }
            } catch (\Throwable $e) {
                // Fall through to meta.
            }
        }
        $meta = (int) get_post_meta($room_type_id, 'mphb_adults_capacity', true);
        return $meta > 0 ? $meta : null;
    }

    /**
     * Note the change in MotoPress's own booking log, the same place the guest
     * ID deletions go, so /staff/ and the admin share one history.
     */
    private function log(int $booking_id, string $label, ?int $value): void
    {
        if (!function_exists('MPHB')) {
            return;
        }
        $who = wp_get_current_user();
        $author = ($who && $who->exists()) ? $who->display_name : '';
        $message = $value === null
            /* translators: %s: accommodation name. */
            ? sprintf(__('Guest count for %s cleared (not provided).', 'dcc-checkout'), $label)
            /* translators: 1: accommodation name, 2: guest count. */
            : sprintf(__('Guest count for %1$s set to %2$d.', 'dcc-checkout'), $label, $value);

        try {
            $booking = MPHB()->getBookingRepository()->findById($booking_id);
            if ($booking && method_exists($booking, 'addLog')) {
                $booking->addLog($message, $author !== '' ? $author : null);
            }
        } catch (\Throwable $e) {
            // A MotoPress update that moves addLog() must never break a save.
        }
    }
}
