<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Extra-guest fee (guests beyond the second), server side. Mirrors Pet_Service.
 *
 * The browser (checkout.js setupExtraGuestFlow) hides the native "Extra Guest
 * Fee" service rows and drives them from each room's guest dropdown: for
 * extra = adults - included_guests, it checks the bucket service and sets the
 * service's native [adults] select to `extra`, so MotoPress computes
 * fee × nights × extra natively — no price math anywhere in this plugin.
 *
 * This class is the anti-tamper backstop, validated PER ROOM (a checkout can
 * hold two cottages with different guest counts):
 *   (a) guest-fee accommodation with extra > 0 → the bucket service for the
 *       stay must be attached with services[adults] == extra, and no other
 *       bucket service attached;
 *   (b) extra <= 0, or a non-guest-fee accommodation (33/34) → no extra-guest
 *       service may be attached; on a non-guest-fee accommodation, adults must
 *       not exceed included_guests at all.
 *
 * Dormant (like the whole feature) until the admin enters all three service IDs.
 */
final class Extra_Guest_Service
{
    public function register(): void
    {
        // Backstop before MotoPress processes the checkout POST.
        add_action('wp_loaded', [$this, 'validate_submission'], 1);
    }

    public function validate_submission(): void
    {
        if (!Checkout_Request::is_checkout_submission() || !Config::guest_fee_active()) {
            return;
        }
        // Never redirect during AJAX (would clobber the JSON response) and never
        // interfere with wp-admin — admin edits are deliberately exempt.
        if (wp_doing_ajax() || is_admin()) {
            return;
        }

        $guest_acc = Config::guest_accommodations();
        $guest_ids = Config::guest_service_id_list();
        $included  = Config::included_guests();
        $expected  = Config::guest_service_id_for_nights(Checkout_Request::nights());

        foreach (Checkout_Request::rooms() as $room) {
            $is_guest_acc = in_array($room['room_type_id'], $guest_acc, true);
            $extra        = $room['adults'] - $included;

            // Extra-guest services attached to THIS room.
            $attached = [];
            foreach ($room['services'] as $svc) {
                if (in_array($svc['id'], $guest_ids, true)) {
                    $attached[] = $svc;
                }
            }

            if ($is_guest_acc && $extra > 0) {
                // Exactly the bucket service, multiplied by exactly the extra
                // guest count — anything else is tampering (or a JS failure).
                if ($expected <= 0 || empty($attached)) {
                    Checkout_Request::redirect_back_with_error('guests');
                }
                foreach ($attached as $svc) {
                    if ($svc['id'] !== $expected || $svc['adults'] !== $extra) {
                        Checkout_Request::redirect_back_with_error('guests');
                    }
                }
            } else {
                // No billable extra guests here: no extra-guest service allowed.
                if (!empty($attached)) {
                    Checkout_Request::redirect_back_with_error('guests');
                }
                // Non-guest-fee accommodations (33/34) stay capped at the
                // included count; only enforce when the room type is known.
                if (!$is_guest_acc && $room['room_type_id'] > 0 && $room['adults'] > $included) {
                    Checkout_Request::redirect_back_with_error('guests');
                }
            }
        }
    }
}
