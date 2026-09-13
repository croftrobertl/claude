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
        // NOTE: deliberately NOT gated on guest_fee_active() — when the
        // offering is off, find_violation() enforces the 2-guest cap instead.
        if (!Checkout_Request::is_checkout_submission()) {
            return;
        }
        // Never redirect during AJAX (would clobber the JSON response) and never
        // interfere with wp-admin — admin edits are deliberately exempt.
        if (wp_doing_ajax() || is_admin()) {
            return;
        }
        // On the checkout REST route, Rest_Guard enforces the same rule with a
        // proper JSON error instead of a 302; stand down here.
        if (Checkout_Request::defer_to_rest()) {
            return;
        }

        if ($this->find_violation() !== null) {
            Checkout_Request::redirect_back_with_error('guests');
        }
    }

    /**
     * Shared validator — transport-agnostic (reads via Checkout_Request, which
     * serves $_POST or the parsed REST payload alike). Returns the error code
     * ('guests') or null when the submission is fine.
     */
    public function find_violation(): ?string
    {
        $included  = Config::included_guests();
        // Non-zero only; a dormant config (service IDs still 0) must not make
        // every service look like an extra-guest service.
        $guest_ids = array_values(array_filter(Config::guest_service_id_list()));

        // "Pull-out Couch Guests" OFF — or ON but not yet configured, which is
        // the same thing from a guest's point of view: the offering cannot be
        // sold. Nobody may exceed the included guest count, and no extra-guest
        // service may ride along. (Previously this path returned early and
        // enforced NOTHING, so with capacity raised to 4 a 3–4 guest booking
        // went through free.)
        if (!Config::guest_fee_active()) {
            foreach (Checkout_Request::rooms() as $room) {
                if ($room['room_type_id'] > 0 && $room['adults'] > $included) {
                    return 'guests';
                }
                foreach ($room['services'] as $svc) {
                    if (in_array($svc['id'], $guest_ids, true)) {
                        return 'guests';
                    }
                }
            }
            return null;
        }

        $guest_acc = Config::guest_accommodations();
        $nights    = Checkout_Request::nights();
        $expected  = Config::guest_service_id_for_nights($nights);

        // Stay length unknown (dates missing/unparseable): we cannot say which
        // service SHOULD be attached, so demanding one would reject a booking
        // we simply can't evaluate. Fall through to the "no extra-guest service
        // may be attached where it isn't due" rules only.
        $can_expect = $nights > 0 && $expected > 0;

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
                if (!$can_expect) {
                    continue; // Can't evaluate this stay — don't block the booking.
                }
                // Exactly the bucket service, multiplied by exactly the extra
                // guest count — anything else is tampering (or a JS failure).
                if (empty($attached)) {
                    return 'guests';
                }
                foreach ($attached as $svc) {
                    if ($svc['id'] !== $expected || $svc['adults'] !== $extra) {
                        return 'guests';
                    }
                }
            } else {
                // No billable extra guests here: no extra-guest service allowed.
                if (!empty($attached)) {
                    return 'guests';
                }
                // Non-guest-fee accommodations (33/34) stay capped at the
                // included count; only enforce when the room type is known.
                if (!$is_guest_acc && $room['room_type_id'] > 0 && $room['adults'] > $included) {
                    return 'guests';
                }
            }
        }

        return null;
    }
}
