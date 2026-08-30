<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Part D — pet flow, server side (Cottage 34 and any other pet accommodation
 * configured on the settings page).
 *
 * DESIGN (v0.1.5): the dog info fields are NATIVE MotoPress Checkout Fields (the
 * owner creates them; their names are set on the settings page). MotoPress
 * submits them inside `customer_fields` and persists them to booking meta
 * automatically — so this plugin no longer captures or saves the dog values
 * itself (the old bespoke inputs were dropped from MotoPress's normalized
 * payload and never reached the server). What remains here:
 *
 *   1. validate_submission() — anti-tamper backstop. "Has dog" is inferred from
 *      the pet Service attached in room_details (which DOES reach the server);
 *      if present, the bucket must match and the three native dog fields must
 *      not be blank. Reads the real payload keys; skips AJAX so it never clobbers
 *      an AJAX checkout response.
 *   2. Email tag %dcc_dog_details% — registered via mphb_email_booking_tags and
 *      filled from the native booking meta via mphb_email_replace_tag. MotoPress
 *      may already surface the checkout fields in the email booking details, so
 *      the tag is a convenience/fallback.
 */
final class Pet_Service
{
    private const EMAIL_TAG = 'dcc_dog_details';

    public function register(): void
    {
        // Anti-tamper backstop before MotoPress processes the checkout POST.
        add_action('wp_loaded', [$this, 'validate_submission'], 1);

        // Email: register the %dcc_dog_details% tag (properly-shaped array — a
        // string element fatals MotoPress's EmailTemplater::setupTags()) and
        // supply its value from the saved booking meta.
        add_filter('mphb_email_booking_tags', [$this, 'register_email_tag'], 10, 1);
        add_filter('mphb_email_replace_tag', [$this, 'replace_email_tag'], 10, 3);
    }

    /* --------------------------------------------------------------------- *
     * 1. Server-side validation / anti-tamper
     * --------------------------------------------------------------------- */

    public function validate_submission(): void
    {
        if (!Checkout_Request::is_checkout_submission() || !Config::pet_fee_enabled()) {
            return;
        }
        // Never redirect during an AJAX submission — it would break the JSON
        // response MotoPress expects. Client-side validation is the guard there.
        // Never interfere with wp-admin either: admins may deliberately attach
        // a non-bucket pet service (manual override), and MotoPress admin
        // screens may POST a room_details shape.
        if (wp_doing_ajax() || is_admin()) {
            return;
        }
        // On the checkout REST route, Rest_Guard enforces the same rule with a
        // proper JSON error instead of a 302; stand down here.
        if (Checkout_Request::defer_to_rest()) {
            return;
        }

        if ($this->find_violation() !== null) {
            Checkout_Request::redirect_back_with_error('pet');
        }
    }

    /**
     * Shared validator — transport-agnostic (reads via Checkout_Request, which
     * serves $_POST or the parsed REST payload alike). Returns the error code
     * ('pet') or null when the submission is fine.
     */
    public function find_violation(): ?string
    {
        if (!Config::pet_fee_enabled()) {
            return null;
        }

        // Is this submission for a configured pet accommodation? "Has dog" is
        // inferred from the attached pet Service (present in room_details).
        $type_ids = Checkout_Request::room_type_ids();
        $is_pet   = (bool) array_intersect(Config::pet_accommodations(), $type_ids)
            || $this->any_pet_service_present();
        if (!$is_pet) {
            return null;
        }

        if (!$this->any_pet_service_present()) {
            return null; // No pet service attached → no-dog booking → nothing to enforce.
        }

        // A pet service is attached: it must be exactly the bucket service.
        $nights      = Checkout_Request::nights();
        $expected_id = Config::service_id_for_nights($nights);
        if ($expected_id <= 0 || !Checkout_Request::contains_service_id($expected_id)) {
            return 'pet';
        }
        foreach (Config::pet_service_id_list() as $sid) {
            if ($sid !== $expected_id && Checkout_Request::contains_service_id($sid)) {
                return 'pet';
            }
        }

        // Required-when-dog: any native dog field that is present must be filled.
        // Fields the owner hasn't created won't appear in customer_fields, so we
        // never reject on their absence (mirrors the guest-2 backstop).
        foreach (Config::dog_field_name_list() as $name) {
            $value = Checkout_Request::customer_field_value($name);
            if ($value !== null && trim($value) === '') {
                return 'pet';
            }
        }

        return null;
    }

    private function any_pet_service_present(): bool
    {
        foreach (Config::pet_service_id_list() as $sid) {
            if (Checkout_Request::contains_service_id($sid)) {
                return true;
            }
        }
        return false;
    }

    /* --------------------------------------------------------------------- *
     * 2. Notification email — MotoPress tag system
     * --------------------------------------------------------------------- */

    /**
     * Register the %dcc_dog_details% tag so it's available in booking emails.
     *
     * MotoPress's EmailTemplater::setupTags() iterates $tags as a NUMERIC array
     * of tag arrays and calls $tag['name'] / $tag['description'] on each element,
     * so we must append a properly-shaped array (a string element fatals on
     * init). The tag name carries NO `%` — MotoPress adds the delimiters.
     *
     * @param mixed $tags Numeric array of tag arrays provided by MotoPress.
     * @return mixed
     */
    public function register_email_tag($tags)
    {
        if (is_array($tags)) {
            $tags[] = [
                'name'        => self::EMAIL_TAG, // 'dcc_dog_details'
                'description' => __('Dog details (DCC): type, size, hair length.', 'dcc-checkout'),
            ];
        }
        return $tags;
    }

    /**
     * Supply the value for %dcc_dog_details% from the booking's native meta.
     *
     * @param mixed $replacement Current replacement value.
     * @param mixed $tag         Tag name being replaced (with or without %…%).
     * @param mixed $booking     Booking object or ID (MotoPress-supplied).
     * @return mixed
     */
    public function replace_email_tag($replacement, $tag = '', $booking = null)
    {
        $tag_name = trim((string) $tag, '%');
        if ($tag_name !== self::EMAIL_TAG) {
            return $replacement;
        }

        $booking_id = $this->resolve_booking_id($booking);
        if ($booking_id <= 0) {
            return $replacement;
        }

        [$type, $size, $hair] = $this->dog_meta($booking_id);
        if ($type === '' && $size === '' && $hair === '') {
            return $replacement;
        }

        $lines = [
            __('Dog type', 'dcc-checkout') . ': ' . $type,
            __('Size', 'dcc-checkout') . ': ' . $size,
            __('Hair length', 'dcc-checkout') . ': ' . $hair,
        ];
        return implode("\n", $lines);
    }

    /**
     * Read the three dog meta values (native Checkout Field meta) for a booking.
     *
     * @return array{0:string,1:string,2:string} [type, size, hair]
     */
    private function dog_meta(int $booking_id): array
    {
        $keys = Config::dog_meta_keys();
        return [
            (string) get_post_meta($booking_id, $keys['type'], true),
            (string) get_post_meta($booking_id, $keys['size'], true),
            (string) get_post_meta($booking_id, $keys['hair'], true),
        ];
    }

    /**
     * MotoPress bookings are `mphb_booking` posts. Accept either the Booking
     * object (has getId()) or a raw ID.
     *
     * @param mixed $booking
     */
    private function resolve_booking_id($booking): int
    {
        if (is_object($booking) && method_exists($booking, 'getId')) {
            return (int) $booking->getId();
        }
        if (is_numeric($booking)) {
            return (int) $booking;
        }
        return 0;
    }
}
