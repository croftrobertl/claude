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
 * In the browser only, on the admin booking screens only, it SHOWS AND HIDES
 * rows, and (v0.28.0) drives the two fees from their own dropdowns: Number of
 * Guests ticks the Extra Guest Fee and sets its multiplier; "Pet Fee: Yes /
 * No" on Add New ticks the pet service for the stay's length. It does not
 * validate, does not block a save, does not remove anything from the DOM, and
 * does not extend any server-side backstop into wp-admin — the exemptions stay
 * exactly as they are. Three rules keep an admin from ever losing data:
 *
 *   1. Fail open. Whatever cannot be read — the guest count, the pet fee —
 *      leaves its fields SHOWN.
 *   2. Filled fields stay. Any field holding a value, typed or saved, stays
 *      visible whatever the count or the pet fee says; Guest 3/4 then carry a
 *      short note that there are more guest names than guests.
 *   3. The facts decide, not a switch. Guest 3/4 follow the guest count, Dog
 *      follows the pet fee (on a cottage with no pet fee, "Yes" shows Dog and
 *      says nothing is charged). The "Show all booking fields" checkbox is
 *      gone (owner's pick, 2026-10-07): a Pet Fee dropdown that says what it
 *      does replaced it.
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
        $pet        = self::wizard_pet_service($booking);
        if (empty($room_types) && $pet <= 0) {
            // Nothing authoritative to say; the script falls back to deriving
            // from the DOM, and hides nothing if that finds no control either.
            return;
        }
        printf(
            '<div class="dcc_admin-room-context" data-dcc-room-types="%s" data-dcc-pet-service="%s" hidden></div>',
            esc_attr(implode(',', $room_types)),
            esc_attr($pet > 0 ? (string) $pet : '')
        );
    }

    /**
     * The pet service for the stay being booked — the same length-of-stay
     * bucket the public checkout charges (Config::service_id_for_nights()), so
     * the "Pet Fee" dropdown ticks exactly what a guest would have paid
     * (v0.28.0). 0 when the dates cannot be read; the script then uses the
     * room's only pet service, or leaves the pet fee to be chosen by hand.
     *
     * DCC-VERIFY: getCheckInDate()/getCheckOutDate() on the booking under
     * construction are reasoned from MotoPress's Booking entity, not observed.
     * Every miss returns 0, which only ever means "say nothing".
     *
     * @param mixed $booking
     */
    private static function wizard_pet_service($booking): int
    {
        if (!is_object($booking)
            || !method_exists($booking, 'getCheckInDate')
            || !method_exists($booking, 'getCheckOutDate')) {
            return 0;
        }
        try {
            $in  = $booking->getCheckInDate();
            $out = $booking->getCheckOutDate();
            if (!$in instanceof \DateTimeInterface || !$out instanceof \DateTimeInterface || $out <= $in) {
                return 0;
            }
            return Config::service_id_for_nights((int) $in->diff($out)->days);
        } catch (\Throwable $e) {
            return 0;
        }
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

        $existing = $this->is_existing_booking();
        $booking  = $existing ? (int) get_post()->ID : 0;

        return [
            'roomTypes'      => $this->room_type_map(),
            'dogFieldNames'  => Config::dog_field_name_list(),
            'guestGroups'    => $groups,
            'petFeeEnabled'  => Config::pet_fee_enabled() ? '1' : '',
            // v0.28.0 — the pet services the "Pet Fee" dropdown drives.
            'petServiceIds'  => array_values(array_filter(Config::pet_service_id_list())),
            // Extra-guest fee: Number of Guests is the ONLY control for it
            // (owner's pick, v0.28.0). Its service row is never shown in
            // wp-admin; it is ticked and its multiplier set from the count.
            // Amounts come from Config, never literals.
            'guestServiceIds' => array_values(array_filter(Config::guest_service_id_list())),
            'guestFeeSteps'   => Config::guest_fee_steps(),
            'includedGuests'  => $included,
            'guestsSelector'  => Config::guests_selector(),
            // Sticky-value protection applies to an existing booking only; on a
            // brand-new booking a field's default value is not stored data.
            'isExisting'     => $this->is_existing_booking() ? '1' : '',
            // v0.28.0 — the booking's own facts, for the edit screen. null =
            // could not be read, and the script then shows the fields.
            'statedGuests'    => $existing ? self::booking_guest_count($booking) : null,
            'statedPetFee'    => $existing ? self::booking_pet_fee($booking) : null,
            // v0.26.0 — the Customer Information box's order and headings.
            'customerLayout'     => self::customer_layout(),
            'customerOtherTitle' => __('Other', 'dcc-checkout'),
            'i18n'           => [
                /* translators: %s: formatted cumulative fee (e.g. $100). Appended to a guest-count option, e.g. "4 (+$100/night)". */
                'optionFeeSuffix' => __(' (+%s/night)', 'dcc-checkout'),
                'petFee'      => __('Pet Fee:', 'dcc-checkout'),
                'petYes'      => __('Yes', 'dcc-checkout'),
                'petNo'       => __('No', 'dcc-checkout'),
                'petNone'     => __('This cottage has no pet fee, so nothing is charged.', 'dcc-checkout'),
                'petManual'   => __('Choose the pet fee under Additional Services.', 'dcc-checkout'),
                'moreNames'   => __('More guest names than guests.', 'dcc-checkout'),
                /* translators: %s: per-night amount for one extra guest (e.g. $50). */
                'feeLineOne'  => __('Extra guest fee: 1 guest × %s/night', 'dcc-checkout'),
                /* translators: 1: number of extra guests, 2: per-night amount for one extra guest (e.g. $50). */
                'feeLineMany' => __('Extra guest fee: %1$d guests × %2$s/night', 'dcc-checkout'),
            ],
        ];
    }

    /**
     * The owner's order for the admin Customer Information box (v0.26.0), on
     * the edit screen and — since v0.28.0 — the Add New Booking customer step:
     * group key, heading, and per field the input name(s) to look for, in order.
     *
     * MotoPress's built-in customer fields are given as `mphb_<name>` and the
     * bare `<name>`, tried in that order. The guest and dog names come from
     * Config — the names the gating uses — so the two cannot disagree. The
     * Add New step draws MotoPress's FRONT-END form, whose apartment field may
     * be spelled with an underscore (the public-checkout fixture carries
     * `mphb_apartment_units`), so both spellings are offered.
     *
     * Headings are translatable and fixed by the owner: "Guest 1", "Address",
     * "Guest 2", "Guest 3", "Guest 4", "Dog", "Note". Field LABELS are not
     * touched (owner decision: MotoPress's wording stays, on both screens).
     *
     * Each field is a list of input names to try, or (for a row with no input,
     * such as Upload Photo ID on the edit screen) an object {names} matched by
     * a reference inside the row — see markedRow().
     *
     * @return array<int, array{key:string,title:string,fields:array<int,mixed>}>
     */
    public static function customer_layout(): array
    {
        $mp = static function (string $name): array {
            return ['mphb_' . $name, $name];
        };
        $one = static function (string $name): array {
            return [$name];
        };

        $g2  = Config::guest2_field_names();
        $g3  = Config::guest3_field_names();
        $g4  = Config::guest4_field_names();
        $dog = Config::dog_field_names();

        return [
            [
                'key' => 'guest1', 'title' => __('Guest 1', 'dcc-checkout'),
                'fields' => [
                    $mp('first_name'), $mp('last_name'), $mp('phone'), $mp('email'),
                    // Upload Photo ID, last in Guest 1 (owner's pick, v0.27.0).
                    // Edit screen: no input, two live shapes; what both carry
                    // is the th label's for="mphb-mphb_upload_id" (v0.27.1).
                    // Add New: a real file input, matched by its name. Never
                    // the label text; unmatched -> stays under "Other".
                    [
                        'names' => ['mphb-' . Id_Files::META_KEY, Id_Files::META_KEY, substr(Id_Files::META_KEY, 5)],
                    ],
                ],
            ],
            [
                'key' => 'address', 'title' => __('Address', 'dcc-checkout'),
                'fields' => [
                    $mp('address1'),
                    ['mphb_apartment-units', 'apartment-units', 'mphb_apartment_units'],
                    $mp('city'), $mp('state'), $mp('zip'), $mp('country'),
                ],
            ],
            [
                'key' => 'guest2', 'title' => __('Guest 2', 'dcc-checkout'),
                'fields' => [$one($g2['first_name']), $one($g2['last_name']), $one($g2['phone'])],
            ],
            [
                'key' => 'guest3', 'title' => __('Guest 3', 'dcc-checkout'),
                'fields' => [$one($g3['first_name']), $one($g3['last_name'])],
            ],
            [
                'key' => 'guest4', 'title' => __('Guest 4', 'dcc-checkout'),
                'fields' => [$one($g4['first_name']), $one($g4['last_name'])],
            ],
            [
                'key' => 'dog', 'title' => __('Dog', 'dcc-checkout'),
                'fields' => [$one($dog['type']), $one($dog['size']), $one($dog['hair'])],
            ],
            [
                'key' => 'note', 'title' => __('Note', 'dcc-checkout'),
                'fields' => [$mp('note')],
            ],
        ];
    }

    /**
     * The reserved-room posts of a booking (post_parent = booking ID).
     *
     * @return array<int, object>
     */
    private static function reserved_rooms(int $booking_id): array
    {
        if ($booking_id <= 0) {
            return [];
        }
        $rooms = get_posts([
            'post_type'        => 'mphb_reserved_room',
            'post_parent'      => $booking_id,
            'post_status'      => 'any',
            'numberposts'      => 50,
            'orderby'          => 'ID',
            'order'            => 'ASC',
            'suppress_filters' => false,
        ]);
        return is_array($rooms) ? $rooms : [];
    }

    /**
     * The booking's saved guest count, as the largest `_mphb_adults` across its
     * reserved rooms (v0.28.0) — "a multi-room booking shows a group if any
     * room needs it". `_mphb_adults` is confirmed on all 417 live reserved
     * rooms (2026-09-17). It is used AS SAVED (owner's pick, 2026-10-07), so an
     * import MotoPress filled with the cottage's capacity reads as that number.
     *
     * null — show the fields — when there is no room, or any room's count is
     * missing or not a positive number: one unreadable room could be the one
     * that needs Guest 3.
     */
    public static function booking_guest_count(int $booking_id): ?int
    {
        $rooms = self::reserved_rooms($booking_id);
        if (empty($rooms)) {
            return null;
        }
        $max = 0;
        foreach ($rooms as $rr) {
            $raw = get_post_meta((int) $rr->ID, '_mphb_adults', true);
            if (!is_numeric($raw) || (int) $raw < 1) {
                return null;
            }
            $max = max($max, (int) $raw);
        }
        return $max;
    }

    /**
     * Does the booking carry the pet fee? (v0.28.0, the edit screen's
     * read-only "Pet fee" line, and what the Dog section follows there.)
     *
     * Reads `_mphb_services` on each reserved room the way the Availability
     * Calendar's has_pet_service() does: MotoPress stores it as a LIST of ids,
     * a MAP of id => quantity, or a list of arrays carrying 'id'. Matched
     * against this plugin's configured pet service IDs, never by title.
     * DCC-VERIFY: the storage shapes are the Calendar's reading, not observed
     * here; the Director's check list carries a booking with the fee.
     *
     * true  — a pet service is attached to some room;
     * false — every room was read and none carries one (an absent or empty
     *         `_mphb_services` is "no services", not "unreadable");
     * null  — something could not be read: show the Dog fields.
     */
    public static function booking_pet_fee(int $booking_id): ?bool
    {
        $pet = array_values(array_filter(array_map('intval', Config::pet_service_id_list())));
        if (empty($pet)) {
            return null;
        }
        $rooms = self::reserved_rooms($booking_id);
        if (empty($rooms)) {
            return null;
        }
        foreach ($rooms as $rr) {
            $raw = get_post_meta((int) $rr->ID, '_mphb_services', true);
            if ($raw === '' || $raw === [] || $raw === null) {
                continue;
            }
            $meta = maybe_unserialize($raw);
            if (!is_array($meta)) {
                return null;
            }
            $is_list = $meta === [] || array_keys($meta) === range(0, count($meta) - 1);
            foreach ($meta as $k => $v) {
                if (is_array($v)) {
                    $sid = (int) ($v['id'] ?? ($is_list ? 0 : $k));
                } else {
                    $sid = (int) ($is_list ? $v : $k);
                }
                if (in_array($sid, $pet, true)) {
                    return true;
                }
            }
        }
        return false;
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
