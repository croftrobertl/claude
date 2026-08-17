<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Part D — pet flow, server side (Cottage 34 and any other pet accommodation
 * configured on the settings page).
 *
 * The browser (assets/checkout.js) renders the "Traveling with a dog?" toggle,
 * hides the native pet-service selectors, and checks the correct native MotoPress
 * Service so pricing stays 100% native. This class:
 *
 *   1. validate_submission() — recompute nights server-side and reject the POST
 *      if the attached pet service doesn't match the bucket, the required dog
 *      info is missing, or a pet service is attached when the toggle said "No".
 *      (Reads $_POST directly — depends on no MotoPress internal hook.)
 *   2. capture_pending() + persist_booking_meta() — stash the dog values from
 *      $_POST on wp_loaded, then persist them to booking meta on the real
 *      MotoPress creation hook `mphb_booking_create_before_set_status`.
 *   3. render_meta_box() — show the dog info on the admin booking screen.
 *   4. Email tag `%dcc_dog_details%` — registered via `mphb_email_booking_tags`
 *      and filled via `mphb_email_replace_tag`, pulling from the saved meta.
 *
 * Meta-save + email hook names were confirmed against the installed MotoPress on
 * staging (the earlier best-guess hooks did not exist). Signatures are exercised
 * by the staging re-test.
 */
final class Pet_Service
{
    private const POST_TOGGLE = 'dcc_checkout_dog';       // 'yes' | 'no'
    private const POST_TYPE   = 'dcc_checkout_dog_type';  // free text
    private const POST_SIZE   = 'dcc_checkout_dog_size';  // one of the size options
    private const POST_HAIR   = 'dcc_checkout_dog_hair';  // one of the hair options

    private const EMAIL_TAG   = 'dcc_dog_details';

    /** Dog values stashed on wp_loaded, persisted on the booking-creation hook. */
    private ?array $pending = null;

    public function register(): void
    {
        // Backstop validation (priority 1), then stash the dog values (priority 5)
        // — both before MotoPress processes the checkout POST on template_redirect.
        add_action('wp_loaded', [$this, 'validate_submission'], 1);
        add_action('wp_loaded', [$this, 'capture_pending'], 5);

        // Persist the stashed dog info when MotoPress creates the booking.
        // `mphb_booking_create_before_set_status` is the real creation action
        // (bookings are created pending, so we can't rely on _confirmed).
        // `mphb_create_booking_by_user` is registered as a resilient fallback.
        add_action('mphb_booking_create_before_set_status', [$this, 'persist_booking_meta'], 10, 1);
        add_action('mphb_create_booking_by_user', [$this, 'persist_booking_meta'], 10, 1);

        // Admin: surface the dog info on the booking edit screen.
        add_action('add_meta_boxes', [$this, 'add_meta_box']);

        // Email: register the %dcc_dog_details% tag and supply its value from the
        // saved booking meta. `mphb_email_booking_tags` expects a numeric array of
        // tag ARRAYS (name/description); MotoPress's EmailTemplater::setupTags()
        // does $tag['name'] on each element, so a string element fatals. Register
        // on this one filter only (the *_details_tags group's format is not
        // verified identical).
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

        // Is this submission for one of the configured pet accommodations? Pet
        // services and the dog toggle only exist there, so any of these signals
        // qualifies.
        $type_ids = Checkout_Request::room_type_ids();
        $is_pet   = (bool) array_intersect(Config::pet_accommodations(), $type_ids)
            || $this->any_pet_service_present()
            || isset($_POST[self::POST_TOGGLE]);

        if (!$is_pet) {
            return;
        }

        $toggle      = $this->posted_toggle();
        $nights      = Checkout_Request::nights();
        $expected_id = Config::service_id_for_nights($nights);
        $service_ids = Config::pet_service_id_list();

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
     * 2. Capture dog info -> persist to booking meta on creation
     * --------------------------------------------------------------------- */

    /**
     * Stash the submitted dog values while $_POST is guaranteed present, so the
     * creation hook (which fires later in the same request) can persist them
     * without re-reading $_POST.
     */
    public function capture_pending(): void
    {
        if (!Checkout_Request::is_checkout_submission() || !Config::pet_fee_enabled()) {
            return;
        }
        if ($this->posted_toggle() !== 'yes') {
            return;
        }

        $this->pending = [
            'type'    => $this->posted_text(self::POST_TYPE),
            'size'    => $this->posted_text(self::POST_SIZE),
            'hair'    => $this->posted_text(self::POST_HAIR),
            'applied' => Config::service_id_for_nights(Checkout_Request::nights()),
        ];
    }

    /**
     * @param mixed $booking A MotoPress Booking object (getId()) or a booking ID.
     */
    public function persist_booking_meta($booking): void
    {
        $booking_id = $this->resolve_booking_id($booking);
        if ($booking_id <= 0) {
            return;
        }

        // Guard against the two creation hooks both firing for one booking.
        static $saved = [];
        if (isset($saved[$booking_id])) {
            return;
        }

        $data = $this->pending;
        if ($data === null) {
            // Fallback: read straight from $_POST (same request).
            if ($this->posted_toggle() !== 'yes') {
                return; // No dog on this booking — nothing to store.
            }
            $data = [
                'type'    => $this->posted_text(self::POST_TYPE),
                'size'    => $this->posted_text(self::POST_SIZE),
                'hair'    => $this->posted_text(self::POST_HAIR),
                'applied' => Config::service_id_for_nights(Checkout_Request::nights()),
            ];
        }

        if ($data['type'] === '' && $data['size'] === '' && $data['hair'] === '') {
            return;
        }

        $saved[$booking_id] = true;
        $keys = Config::pet_meta_keys();

        update_post_meta($booking_id, $keys['type'], $data['type']);
        update_post_meta($booking_id, $keys['size'], $data['size']);
        update_post_meta($booking_id, $keys['hair'], $data['hair']);
        if ((int) $data['applied'] > 0) {
            update_post_meta($booking_id, $keys['applied'], (int) $data['applied']);
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
        [$type, $size, $hair] = $this->dog_meta($post->ID);

        if ($type === '' && $size === '' && $hair === '') {
            echo '<p>' . esc_html__('No dog on this booking.', 'dcc-checkout') . '</p>';
            return;
        }

        echo '<table class="widefat striped"><tbody>';
        $this->meta_row(__('Dog type', 'dcc-checkout'), $type);
        $this->meta_row(__('Size', 'dcc-checkout'), $size);
        $this->meta_row(__('Hair length', 'dcc-checkout'), $hair);
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
     * 4. Notification email — MotoPress tag system
     * --------------------------------------------------------------------- */

    /**
     * Register the %dcc_dog_details% tag so it's available in booking emails.
     *
     * MotoPress's EmailTemplater::setupTags() iterates $tags as a NUMERIC array
     * of tag arrays and calls $tag['name'] / $tag['description'] on each element.
     * We must append a properly-shaped array — a string element causes a fatal
     * TypeError on `init` (site-down). The tag name carries NO `%` (MotoPress
     * adds the delimiters itself).
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
     * Supply the value for %dcc_dog_details% from the booking's saved meta.
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

        // Plain-text lines; MotoPress wraps email output as needed.
        $lines = [
            __('Dog type', 'dcc-checkout') . ': ' . $type,
            __('Size', 'dcc-checkout') . ': ' . $size,
            __('Hair length', 'dcc-checkout') . ': ' . $hair,
        ];
        return implode("\n", $lines);
    }

    /**
     * Read the three dog meta values for a booking.
     *
     * @return array{0:string,1:string,2:string} [type, size, hair]
     */
    private function dog_meta(int $booking_id): array
    {
        $keys = Config::pet_meta_keys();
        return [
            (string) get_post_meta($booking_id, $keys['type'], true),
            (string) get_post_meta($booking_id, $keys['size'], true),
            (string) get_post_meta($booking_id, $keys['hair'], true),
        ];
    }

    /* --------------------------------------------------------------------- *
     * POST readers
     * --------------------------------------------------------------------- */

    private function posted_toggle(): string
    {
        if (!isset($_POST[self::POST_TOGGLE])) {
            return 'no';
        }
        $val = sanitize_text_field(wp_unslash($_POST[self::POST_TOGGLE])); // phpcs:ignore WordPress.Security.NonceVerification.Missing
        return strtolower($val) === 'yes' ? 'yes' : 'no';
    }

    private function posted_text(string $key): string
    {
        if (!isset($_POST[$key])) {
            return '';
        }
        return trim(sanitize_text_field(wp_unslash($_POST[$key]))); // phpcs:ignore WordPress.Security.NonceVerification.Missing
    }
}
