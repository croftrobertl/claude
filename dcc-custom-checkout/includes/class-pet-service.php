<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Part D — Cottage 34 pet flow, server side.
 *
 * The browser (assets/checkout.js) renders the "Traveling with a dog?" toggle,
 * hides the native pet-service selectors, and checks/unchecks the correct native
 * MotoPress Service so pricing stays 100% native. This class is the backstop
 * and the persistence layer:
 *
 *   1. validate_submission() — recompute nights server-side and reject the POST
 *      if the attached pet service doesn't match the bucket, or the required dog
 *      info is missing, or a pet service is attached when the toggle said "No".
 *   2. save_booking_meta()   — persist Dog type / Size / Hair to booking meta.
 *   3. render_meta_box()     — show that info on the admin booking screen.
 *   4. append_to_email()     — include it in the notification email.
 *
 * >>> STAGING NOTE <<<
 * The exact MotoPress hook names for reading reserved services, saving booking
 * meta, and injecting email content differ between MotoPress versions and are
 * to be confirmed on staging. The candidates below are registered defensively:
 * a hook that doesn't exist simply never fires, so wiring extra candidates is
 * safe. The reject-on-mismatch validation in validate_submission() does NOT
 * depend on any MotoPress internal hook — it reads $_POST directly — so the
 * safety property (client tampering can't apply a wrong/free pet fee) holds
 * regardless.
 */
final class Pet_Service
{
    private const POST_TOGGLE = 'dcc_checkout_dog';       // 'yes' | 'no'
    private const POST_TYPE   = 'dcc_checkout_dog_type';  // free text
    private const POST_SIZE   = 'dcc_checkout_dog_size';  // one of the size options
    private const POST_HAIR   = 'dcc_checkout_dog_hair';  // one of the hair options

    public function register(): void
    {
        // Backstop validation, before MotoPress processes the checkout POST.
        add_action('wp_loaded', [$this, 'validate_submission'], 1);

        // DCC-VERIFY: provisional — confirm against live MotoPress.
        // Persist the captured dog info to the booking. `mphb_booking_placed` is
        // the primary hook; extra candidates are harmless if they don't exist.
        // Confirm which hook fires (and that it passes the Booking object) on a
        // staging test booking, then trim this list to the real one.
        foreach (['mphb_booking_placed', 'mphb_booking_created', 'mphb_after_create_booking'] as $hook) {
            add_action($hook, [$this, 'save_booking_meta'], 10, 1);
        }

        // Admin: surface the dog info on the booking edit screen.
        add_action('add_meta_boxes', [$this, 'add_meta_box']);

        // DCC-VERIFY: provisional — confirm against live MotoPress.
        // Email: append the dog info to the booking notification. Candidate
        // filters — whichever MotoPress/Notifier exposes will fire. Confirm the
        // real filter name + signature on staging, then trim to the real one.
        foreach (['mphb_email_message', 'mphb_booking_details_email', 'mphb_email_footer_text'] as $filter) {
            add_filter($filter, [$this, 'append_to_email'], 20, 2);
        }
    }

    /* --------------------------------------------------------------------- *
     * 1. Server-side validation / anti-tamper
     * --------------------------------------------------------------------- */

    public function validate_submission(): void
    {
        if (!Checkout_Request::is_checkout_submission()) {
            return;
        }

        // Determine whether this submission is for Cottage 34. Pet services only
        // exist on Cottage 34, and the dog toggle only renders there, so any of
        // these signals means "this is the pet cottage".
        $type_ids     = Checkout_Request::room_type_ids();
        $is_cottage34 = in_array(Config::cottage_type_id(), $type_ids, true)
            || $this->any_pet_service_present()
            || isset($_POST[self::POST_TOGGLE]);

        if (!$is_cottage34) {
            return;
        }

        $toggle       = $this->posted_toggle();
        $nights       = Checkout_Request::nights();
        $expected_id  = Config::service_id_for_nights($nights);
        $service_ids  = Config::pet_service_id_list();

        if ($toggle === 'yes') {
            // Required info fields must be present.
            if (
                $this->posted_text(self::POST_TYPE) === ''
                || $this->posted_text(self::POST_SIZE) === ''
                || $this->posted_text(self::POST_HAIR) === ''
            ) {
                Checkout_Request::redirect_back_with_error('pet');
            }

            // Exactly the bucket service must be attached, and only it.
            if ($expected_id <= 0 || !Checkout_Request::contains_service_id($expected_id)) {
                Checkout_Request::redirect_back_with_error('pet');
            }
            foreach ($service_ids as $sid) {
                if ($sid !== $expected_id && Checkout_Request::contains_service_id($sid)) {
                    Checkout_Request::redirect_back_with_error('pet');
                }
            }
        } else {
            // Toggle "No": no pet service may be attached.
            if ($this->any_pet_service_present()) {
                Checkout_Request::redirect_back_with_error('pet');
            }
        }
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
     * 2. Persist dog info to booking meta
     * --------------------------------------------------------------------- */

    /**
     * DCC-VERIFY: provisional — confirm against live MotoPress.
     * Reads the dog fields from the just-submitted $_POST and stores them on the
     * booking. Verify the hook delivers a Booking with getId() (or a raw ID) on
     * staging; resolve_booking_id() already tolerates both.
     *
     * @param mixed $booking A MotoPress Booking object (getId()) or a booking ID.
     */
    public function save_booking_meta($booking): void
    {
        $booking_id = $this->resolve_booking_id($booking);
        if ($booking_id <= 0) {
            return;
        }

        // Guard against double-processing if several candidate hooks fire.
        static $saved = [];
        if (isset($saved[$booking_id])) {
            return;
        }
        $saved[$booking_id] = true;

        $keys = Config::pet_meta_keys();

        if ($this->posted_toggle() !== 'yes') {
            // No dog on this booking — make sure nothing stale is stored.
            foreach ($keys as $key) {
                delete_post_meta($booking_id, $key);
            }
            return;
        }

        update_post_meta($booking_id, $keys['type'], $this->posted_text(self::POST_TYPE));
        update_post_meta($booking_id, $keys['size'], $this->posted_text(self::POST_SIZE));
        update_post_meta($booking_id, $keys['hair'], $this->posted_text(self::POST_HAIR));

        $applied = Config::service_id_for_nights(Checkout_Request::nights());
        if ($applied > 0) {
            update_post_meta($booking_id, $keys['applied'], $applied);
        }
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

    /* --------------------------------------------------------------------- *
     * 3. Admin booking screen meta box
     * --------------------------------------------------------------------- */

    public function add_meta_box(): void
    {
        add_meta_box(
            'dcc_checkout_pet_info',
            __('Pet Details (DCC)', 'dcc-checkout'),
            [$this, 'render_meta_box'],
            'mphb_booking',
            'side',
            'default'
        );
    }

    public function render_meta_box(\WP_Post $post): void
    {
        $keys = Config::pet_meta_keys();
        $type = get_post_meta($post->ID, $keys['type'], true);
        $size = get_post_meta($post->ID, $keys['size'], true);
        $hair = get_post_meta($post->ID, $keys['hair'], true);

        if ($type === '' && $size === '' && $hair === '') {
            echo '<p>' . esc_html__('No dog on this booking.', 'dcc-checkout') . '</p>';
            return;
        }

        echo '<table class="widefat striped"><tbody>';
        $this->meta_row(__('Dog type', 'dcc-checkout'), (string) $type);
        $this->meta_row(__('Size', 'dcc-checkout'), (string) $size);
        $this->meta_row(__('Hair length', 'dcc-checkout'), (string) $hair);
        echo '</tbody></table>';
    }

    private function meta_row(string $label, string $value): void
    {
        printf(
            '<tr><th style="text-align:left">%s</th><td>%s</td></tr>',
            esc_html($label),
            esc_html($value !== '' ? $value : '—')
        );
    }

    /* --------------------------------------------------------------------- *
     * 4. Notification email
     * --------------------------------------------------------------------- */

    /**
     * DCC-VERIFY: provisional — confirm against live MotoPress.
     * Append the dog info to the notification email body. Registered against
     * several candidate MotoPress/Notifier filters; only the one that exists
     * fires. Reads the values from the just-submitted POST.
     *
     * @param string $message Email body (HTML or text) provided by MotoPress.
     * @param mixed  $context Unused second arg some filters pass.
     * @return string
     */
    public function append_to_email($message, $context = null)
    {
        if (!is_string($message) || $this->posted_toggle() !== 'yes') {
            return $message;
        }

        $type = $this->posted_text(self::POST_TYPE);
        $size = $this->posted_text(self::POST_SIZE);
        $hair = $this->posted_text(self::POST_HAIR);

        if ($type === '' && $size === '' && $hair === '') {
            return $message;
        }

        $block  = "\n<h3>" . esc_html__('Pet Details', 'dcc-checkout') . "</h3>\n<ul>";
        $block .= '<li>' . esc_html__('Dog type', 'dcc-checkout') . ': ' . esc_html($type) . '</li>';
        $block .= '<li>' . esc_html__('Size', 'dcc-checkout') . ': ' . esc_html($size) . '</li>';
        $block .= '<li>' . esc_html__('Hair length', 'dcc-checkout') . ': ' . esc_html($hair) . '</li>';
        $block .= "</ul>\n";

        return $message . $block;
    }

    /* --------------------------------------------------------------------- *
     * POST readers
     * --------------------------------------------------------------------- */

    private function posted_toggle(): string
    {
        if (!isset($_POST[self::POST_TOGGLE])) {
            return 'no';
        }
        $val = sanitize_text_field(wp_unslash($_POST[self::POST_TOGGLE]));
        return strtolower($val) === 'yes' ? 'yes' : 'no';
    }

    private function posted_text(string $key): string
    {
        if (!isset($_POST[$key])) {
            return '';
        }
        return trim(sanitize_text_field(wp_unslash($_POST[$key])));
    }
}
