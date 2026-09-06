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

    public function register(): void
    {
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
    }

    public function enqueue(string $hook_suffix = ''): void
    {
        if (!$this->is_booking_screen($hook_suffix)) {
            return;
        }
        // The screen itself is already capability-gated by WordPress; this is a
        // floor so the script is never printed for a user who cannot edit the
        // booking anyway. Filterable for sites with custom MPHB roles.
        $allowed = current_user_can('manage_options') || current_user_can('edit_posts');
        if (!apply_filters('dcc_checkout_admin_fields_enabled', $allowed)) {
            return;
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
    }

    /**
     * Are we on an MPHB booking add/edit screen?
     */
    private function is_booking_screen(string $hook_suffix): bool
    {
        if ($hook_suffix !== '' && !in_array($hook_suffix, ['post.php', 'post-new.php'], true)) {
            return false;
        }
        if (!function_exists('get_current_screen')) {
            return false;
        }
        $screen = get_current_screen();
        return $screen instanceof \WP_Screen
            && $screen->base === 'post'
            && $screen->post_type === self::BOOKING_POST_TYPE;
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
