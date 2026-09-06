<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Admin booking screen: show the conditional Checkout Fields only where the
 * accommodation can actually use them.
 *
 * WHY THIS EXISTS
 * The dog fields and the guest 3/4 name fields are native MotoPress Checkout
 * Fields, and MotoPress enables Checkout Fields GLOBALLY — there is no
 * per-accommodation setting. On the front end they are gated purely in the
 * browser (checkout.js). That script is deliberately NOT loaded in wp-admin,
 * and the three server-side backstops deliberately exempt wp-admin, so an
 * admin is never fought while overriding something on purpose. The cost of
 * that exemption is what the owner hit: booking Cottage 36 in wp-admin asked
 * for the dog's type, size and hair, and a Cottage 33/34 booking offers guest
 * 3 and 4 name fields for cottages that sleep two.
 *
 * WHAT THIS DOES — and deliberately does not
 * It mirrors the front-end gate on the admin booking screen only, in the
 * browser only, by SHOWING AND HIDING rows. It does not validate, does not
 * block a save, does not remove anything from the DOM, and does not extend any
 * server-side backstop into wp-admin — the exemptions stay exactly as they
 * are. Three rules keep an admin from ever losing data or control:
 *
 *   1. Fail open. If the accommodation cannot be identified, or a room type's
 *      services cannot be read, nothing is hidden.
 *   2. Sticky values. On an EXISTING booking, any field that already holds a
 *      value stays visible whatever the accommodation, so stored data is never
 *      hidden from the person editing it.
 *   3. An escape hatch. A "Show all booking fields" checkbox reveals
 *      everything, for the deliberate-override case the exemptions protect.
 */
final class Admin_Fields
{
    /** MotoPress booking post type (same one the availability plugin reads). */
    private const BOOKING_POST_TYPE = 'mphb_booking';

    /** Guards against localizing the config twice on one request. */
    private bool $enqueued = false;

    public function register(): void
    {
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);

        // The create-booking wizard's CHECKOUT step is not a post screen and
        // carries NO room-type control in its markup — the accommodation was
        // chosen in an earlier step and lives only in PHP. So on that screen we
        // stop deriving and let PHP state the answer: this hook both loads the
        // script (the wizard is a menu page, so admin_enqueue_scripts above
        // does not match it) and prints the authoritative room-type ids.
        //
        // Enqueuing mid-render is fine: scripts registered during admin body
        // output are still printed by admin_print_footer_scripts.
        add_action('mphb_cb_checkout_form', [$this, 'on_create_booking_checkout'], 5, 2);
    }

    public function enqueue(string $hook_suffix = ''): void
    {
        if (!$this->is_booking_screen($hook_suffix)) {
            return;
        }
        $this->enqueue_assets();
    }

    /**
     * Create-booking wizard, checkout step.
     *
     * @param mixed $booking MPHB booking object being built.
     * @param mixed $details Reserved-room details: array of
     *                       [room_id, room_type_id, rate_id, ...].
     */
    public function on_create_booking_checkout($booking = null, $details = null): void
    {
        if (!$this->enqueue_assets()) {
            return;
        }
        $room_types = $this->room_types_from_context($booking, $details);
        if (empty($room_types)) {
            // Nothing authoritative to say; the script falls back to deriving
            // from the DOM, and hides nothing if that finds no control either.
            return;
        }
        printf(
            '<div class="dcc_admin-room-context" data-dcc-room-types="%s" hidden></div>',
            esc_attr(implode(',', $room_types))
        );
    }

    /**
     * Room-type IDs for the booking being created, read from whichever of the
     * two hook arguments actually carries them.
     *
     * DCC-VERIFY: provisional — confirm against live MotoPress.
     * $details is documented as an array of [room_id, room_type_id, rate_id];
     * the booking object is tried as a second source. Both are best-effort and
     * an empty result simply means "say nothing", never a wrong answer.
     *
     * @return int[]
     */
    private function room_types_from_context($booking, $details): array
    {
        $ids = [];

        foreach ((array) $details as $row) {
            if (is_array($row) && isset($row['room_type_id'])) {
                $ids[] = (int) $row['room_type_id'];
            } elseif (is_object($row) && isset($row->room_type_id)) {
                $ids[] = (int) $row->room_type_id;
            }
        }

        if (empty($ids) && is_object($booking) && method_exists($booking, 'getReservedRooms')) {
            try {
                foreach ((array) $booking->getReservedRooms() as $reserved) {
                    if (is_object($reserved) && method_exists($reserved, 'getRoomTypeId')) {
                        $ids[] = (int) $reserved->getRoomTypeId();
                    }
                }
            } catch (\Throwable $e) {
                // Leave $ids as-is; empty means "say nothing".
            }
        }

        return array_values(array_unique(array_filter($ids)));
    }

    /**
     * Enqueue + localize once per request. Returns false when the current user
     * shouldn't get the script at all.
     */
    private function enqueue_assets(): bool
    {
        if ($this->enqueued) {
            return true;
        }
        // The screen itself is already capability-gated by WordPress; this is a
        // floor so the script is never printed for a user who cannot edit the
        // booking anyway. Filterable for sites with custom MPHB roles.
        $allowed = current_user_can('manage_options') || current_user_can('edit_posts');
        if (!apply_filters('dcc_checkout_admin_fields_enabled', $allowed)) {
            return false;
        }

        wp_enqueue_style(
            'dcc-checkout-admin',
            DCC_CHECKOUT_URL . 'assets/admin-booking.css',
            [],
            DCC_CHECKOUT_VERSION
        );
        wp_enqueue_script(
            'dcc-checkout-admin',
            DCC_CHECKOUT_URL . 'assets/admin-booking.js',
            [],
            DCC_CHECKOUT_VERSION,
            true
        );
        wp_localize_script('dcc-checkout-admin', 'DCC_CHECKOUT_ADMIN', $this->script_config());
        $this->enqueued = true;
        return true;
    }

    /**
     * Screens to load on via admin_enqueue_scripts: the booking add/edit post
     * screen, plus any other MotoPress admin page (the create-booking wizard's
     * earlier steps included). Loading widely is safe — the script no-ops when
     * none of the managed fields are on the page — and it means a step that
     * renders checkout fields without firing mphb_cb_checkout_form is still
     * covered rather than silently unprotected.
     */
    private function is_booking_screen(string $hook_suffix): bool
    {
        if (!function_exists('get_current_screen')) {
            return false;
        }
        $screen = get_current_screen();
        if (!$screen instanceof \WP_Screen) {
            return false;
        }
        if ($screen->base === 'post' && $screen->post_type === self::BOOKING_POST_TYPE) {
            return true;
        }
        return strpos((string) $screen->id, 'mphb') !== false;
    }

    /**
     * Config for the admin script.
     *
     * The room-type capability map is derived, never hard-coded: pet capability
     * comes from the Services actually attached to that accommodation, so
     * making another cottage pet-friendly is a MotoPress data change and needs
     * no code. Unreadable capability is reported as 'unknown', which the script
     * treats as "show".
     */
    private function script_config(): array
    {
        $included = Config::included_guests();

        // Only the groups that need gating: guest 2 fits in every cottage.
        $groups = [];
        foreach (Config::guest_field_groups() as $group) {
            if ((int) $group['min'] > $included) {
                $groups[] = [
                    'min'   => (int) $group['min'],
                    'names' => array_values((array) $group['names']),
                    'title' => (string) $group['title'],
                ];
            }
        }

        return [
            'roomTypes'      => $this->room_type_map(),
            'dogFieldNames'  => Config::dog_field_name_list(),
            'guestGroups'    => $groups,
            'petFeeEnabled'  => Config::pet_fee_enabled() ? '1' : '',
            // Sticky-value protection applies to an existing booking only; on a
            // brand-new booking a field's default value is not stored data.
            'isExisting'     => $this->is_existing_booking() ? '1' : '',
            'i18n'           => [
                'showAll' => __('Show all booking fields', 'dcc-checkout'),
                'hint'    => __('Fields for guests 3–4 and pet details are hidden for accommodations that cannot use them. Tick to show every field.', 'dcc-checkout'),
            ],
        ];
    }

    /**
     * Are we editing a booking that already exists (as opposed to adding one)?
     */
    private function is_existing_booking(): bool
    {
        $post = get_post();
        return $post instanceof \WP_Post
            && $post->post_type === self::BOOKING_POST_TYPE
            && $post->post_status !== 'auto-draft';
    }

    /**
     * Every published accommodation type and what it can actually offer.
     *
     * @return array<string, array{pet:string, couch:string}>
     */
    private function room_type_map(): array
    {
        $ids = get_posts([
            'post_type'        => 'mphb_room_type',
            'post_status'      => 'publish',
            'numberposts'      => -1,
            'fields'           => 'ids',
            'suppress_filters' => false,
        ]);
        if (!is_array($ids)) {
            return [];
        }

        $couch_acc = Config::guest_accommodations();
        $pet_on    = Config::pet_fee_enabled();
        $map       = [];

        foreach ($ids as $id) {
            $id = (int) $id;

            // 'unknown' whenever we can't positively determine it — the script
            // shows the fields in that case rather than hiding data blindly.
            $pet = 'unknown';
            if (!$pet_on) {
                // The whole pet flow is off; the dog fields are for nobody.
                $pet = 'no';
            } else {
                $has = Config::room_type_has_pet_services($id);
                if ($has !== null) {
                    $pet = $has ? 'yes' : 'no';
                }
            }

            // Couch capability is plugin configuration, not a MotoPress read,
            // so it is always knowable. Deliberately NOT gated on the fee being
            // switched on: whether the cottage HAS a couch is a fact about the
            // cottage, and an admin booking a third guest by hand is exactly
            // the override the wp-admin exemption exists to allow.
            $couch = in_array($id, $couch_acc, true) ? 'yes' : 'no';

            $map[(string) $id] = ['pet' => $pet, 'couch' => $couch];
        }

        return $map;
    }
}
