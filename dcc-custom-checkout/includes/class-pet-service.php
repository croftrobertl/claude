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

        $code = $this->find_violation();
        if ($code !== null) {
            Checkout_Request::redirect_back_with_error($code);
        }
    }

    /**
     * Shared validator — transport-agnostic (reads via Checkout_Request, which
     * serves $_POST or the parsed REST payload alike). Returns the error code
     * ('pet', or 'dogsize' since v0.34.0) or null when the submission is fine.
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

        // A pet service is attached: it must be exactly the ACTIVE one — the
        // service the current mode charges for this stay (flat: the flat
        // service; tiers: the bucket). Every other RECOGNISED pet service is
        // refused, so a stale page carrying an old tier is caught.
        // If the stay length is unknown we can't say WHICH service, so skip
        // this check rather than reject a booking we cannot evaluate (the
        // required-info rule below still applies).
        $nights      = Checkout_Request::nights();
        $expected_id = Config::service_id_for_nights($nights);
        if ($nights > 0 && $expected_id > 0) {
            if (!Checkout_Request::contains_service_id($expected_id)) {
                return 'pet';
            }
            foreach (Config::recognised_pet_service_ids() as $sid) {
                if ($sid !== $expected_id && Checkout_Request::contains_service_id($sid)) {
                    return 'pet';
                }
            }
        }

        // v0.34.0 — the dog's size must be one the checkout OFFERS. MotoPress
        // does not check a posted select against its options (parse-utils.php
        // parseCustomer runs sanitize_text_field only), so a size switched off
        // in the settings, or none at all, is refused here. Only on a dog
        // booking: with no pet fee, nothing about the size is required.
        $size_code = Dog_Sizes::violation(
            Checkout_Request::customer_field_value(Config::dog_field_names()['size'])
        );
        if ($size_code !== null) {
            return $size_code;
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

    /** RECOGNISED: any pet service, flat or tier, whatever the mode. */
    private function any_pet_service_present(): bool
    {
        foreach (Config::recognised_pet_service_ids() as $sid) {
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
