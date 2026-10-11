<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * FEES FOLLOW THE UPDATE BUTTON (v0.33.0, Rob: "Both follow Update").
 *
 * On a DIRECT booking that is not cancelled or abandoned, pressing Update on
 * the booking screen makes the reserved rooms' fee services match what staff
 * set there:
 *  - "Pet fee: Yes / No" (pet-fee cottages, one such room) adds or removes the
 *    pet service for the stay's length — Config::service_id_for_nights(), the
 *    tier the checkout and Add New use;
 *  - a changed guest count adds, adjusts or removes the Extra Guest Fee on a
 *    room whose cottage carries it — Config::guest_service_id_for_nights()
 *    and `count - included_guests()`, the service and multiplier the checkout
 *    and Add New use;
 * then MotoPress reprices the booking its own way. Imports never get a fee.
 *
 * ONLY ON A CHANGE MADE IN THIS UPDATE. A booking whose stored fee already
 * disagrees with its count (an old booking, a fee the owner waived) is left
 * exactly as it is when it is saved for any other reason; it changes only when
 * staff change the pet fee or that room's count.
 *
 * NOTHING ELSE CHANGES: dates, rates, children, guest names, UIDs, other
 * services, payments and status are carried over as they are. No status
 * change, so MotoPress sends no status email. A total that falls below what
 * has been paid is left that way — nothing is refunded.
 *
 * WHEN IT RUNS. MotoPress's own Update (EditCPTPage::saveMetaBoxes, save_post
 * at 10) saves the booking with BookingRepository::save(), which calls
 * wp_update_post() and so fires save_post AGAIN inside itself. A handler on
 * save_post would therefore first run nested inside MotoPress's save, before
 * that save has finished writing. VERIFIED (Director, live 6.3.0):
 * CPTPersistence::update() (~172) calls wp_update_post() FIRST and only then
 * updatePostRelatedData(), which writes the meta including mphb_total_price —
 * so any save_post handler, at any priority, runs before MotoPress writes its
 * reloaded total, and would be overwritten. So save_post only RECORDS that a rebuild is
 * due (after the nonce, capability and post_ID checks), and the rebuild runs on
 * `redirect_post_location` — the filter WordPress's post.php applies once,
 * after edit_post() and every save handler have returned, just before it
 * redirects. An edit that does not end in that redirect changes no fee.
 *
 * THE SEQUENCE is MotoPress's own (BookingControl::setup(), Director's read of
 * live 6.3.0): reload the booking, setRooms(), updateTotal(),
 * BookingRepository::save(), updateReservedRooms(), addLog(). A room is
 * rebuilt with its own id, room, rate, adults, children, guest name, status
 * and uid, so updateReservedRooms() saves it IN PLACE: same post, same uid,
 * same `_mphb_adults_confirmed`. Every check runs before the first write;
 * anything unreadable means nothing is written and staff are told.
 */
final class Fee_Sync
{
    public const NONCE     = 'dcc_fee_sync';
    public const PET_FIELD = 'dcc_pet_fee';

    /**
     * Statuses whose fees are never changed (Rob). MotoPress's booking
     * post_status values. VERIFIED (Director, live 6.3.0,
     * post-types/booking-cpt/statuses.php ~9–15): exactly these two.
     */
    public const FROZEN_STATUSES = ['cancelled', 'abandoned'];

    private const BOOKING_POST_TYPE  = 'mphb_booking';
    private const RESERVED_POST_TYPE = 'mphb_reserved_room';
    private const NOTICE_PREFIX      = 'dcc_fee_sync_notice_';

    /** booking id => [reserved room id => `_mphb_adults` before this request's saves] */
    private static array $before = [];

    /** booking id => pet choice ('yes' | 'no' | '') for a rebuild that is due */
    private static array $pending = [];

    private static bool $running = false;

    public function register(): void
    {
        // Before Admin_Guests writes the count (save_post_mphb_booking at 10).
        add_action('save_post_' . self::BOOKING_POST_TYPE, [self::class, 'snapshot'], 5, 1);
        add_action('save_post', [self::class, 'mark'], 20, 2);
        add_filter('redirect_post_location', [self::class, 'on_redirect'], 10, 2);
        add_action('admin_notices', [self::class, 'notice']);
    }

    /** The nonce the booking screen carries for this (printed in "Guest count"). */
    public static function nonce_field(): string
    {
        return (string) wp_nonce_field(self::NONCE, self::NONCE . '_nonce', true, false);
    }

    /* --------------------------------------------------------------------- *
     * What the booking screen offers
     * --------------------------------------------------------------------- */

    /**
     * How the pet fee is shown on this booking's screen:
     *  'select'   — a Yes / No control that Update acts on: a direct, active
     *               booking with exactly ONE room on a pet-fee cottage whose
     *               services can be read;
     *  'readonly' — the stored answer only (cancelled / abandoned, two pet
     *               rooms, or services this cannot rebuild);
     *  ''         — no pet part (not a pet-fee cottage, or an import, whose
     *               dog is recorded in "Bringing a dog?").
     */
    public static function pet_control(int $booking_id): string
    {
        if (Policies::is_imported($booking_id) || Admin_Fields::booking_pet_cottage($booking_id) !== true) {
            return '';
        }
        if (!self::eligible($booking_id)) {
            return 'readonly';
        }
        $pet_rooms = 0;
        foreach (self::room_posts($booking_id) as $rr) {
            $room_id = (int) get_post_meta((int) $rr->ID, '_mphb_room_id', true);
            $type_id = $room_id > 0 ? (int) get_post_meta($room_id, 'mphb_room_type_id', true) : 0;
            if ($type_id > 0 && Config::room_type_has_pet_services($type_id) === true) {
                $pet_rooms++;
                if (self::read_services(get_post_meta((int) $rr->ID, '_mphb_services', true)) === null) {
                    return 'readonly';
                }
            }
        }
        return $pet_rooms === 1 ? 'select' : 'readonly';
    }

    /**
     * The extra-guest fee's "for N" stored on a reserved room — what the
     * booking is being charged for, whatever the settings say now (history is
     * shown as it is). 0 when not attached; null when unreadable.
     */
    public static function room_fee_multiplier(int $reserved_room_id): ?int
    {
        $rows = self::read_services(get_post_meta($reserved_room_id, '_mphb_services', true));
        if ($rows === null) {
            return null;
        }
        return self::fee_multiplier($rows, array_values(array_filter(array_map('intval', Config::guest_service_id_list()))));
    }

    /** Is this reserved room on a cottage that carries the extra-guest fee? */
    public static function fee_cottage(int $reserved_room_id): bool
    {
        $room_id = (int) get_post_meta($reserved_room_id, '_mphb_room_id', true);
        $type_id = $room_id > 0 ? (int) get_post_meta($room_id, 'mphb_room_type_id', true) : 0;
        return $type_id > 0 && in_array($type_id, Config::guest_accommodations(), true);
    }

    /* --------------------------------------------------------------------- *
     * During the save
     * --------------------------------------------------------------------- */

    /**
     * Each room's stored count before anything in this request writes it. The
     * FIRST call wins: MotoPress's own save fires this hook again, after
     * Admin_Guests has already written the new count.
     *
     * @param mixed $post_id
     */
    public static function snapshot($post_id): void
    {
        $post_id = (int) $post_id;
        if (self::$running || isset(self::$before[$post_id]) || !self::request_is_ours($post_id)) {
            return;
        }
        $counts = [];
        foreach (self::room_posts($post_id) as $rr) {
            $counts[(int) $rr->ID] = (string) get_post_meta((int) $rr->ID, Admin_Guests::META_KEY, true);
        }
        self::$before[$post_id] = $counts;
    }

    /**
     * save_post: note that this booking's fees are to be brought into line once
     * every save handler has finished. Writes nothing.
     *
     * @param mixed $post_id
     * @param mixed $post
     */
    public static function mark($post_id, $post = null): void
    {
        $post_id = (int) $post_id;
        if (self::$running || !$post instanceof \WP_Post || $post->post_type !== self::BOOKING_POST_TYPE) {
            return;
        }
        if (!self::request_is_ours($post_id)) {
            return;
        }
        $pet = isset($_POST[self::PET_FIELD]) ? sanitize_key(wp_unslash($_POST[self::PET_FIELD])) : '';
        self::$pending[$post_id] = ($pet === 'yes' || $pet === 'no') ? $pet : '';
    }

    /**
     * The booking screen's own Update, by this user, for this post: our nonce,
     * `edit_post`, the form's post_ID, and not an autosave or a revision.
     */
    private static function request_is_ours(int $post_id): bool
    {
        if ($post_id <= 0 || (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE)) {
            return false;
        }
        if (function_exists('wp_is_post_revision') && wp_is_post_revision($post_id)) {
            return false;
        }
        if (empty($_POST[self::NONCE . '_nonce'])
            || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST[self::NONCE . '_nonce'])), self::NONCE)) {
            return false;
        }
        if (!isset($_POST['post_ID']) || (int) $_POST['post_ID'] !== $post_id) {
            return false;
        }
        return current_user_can('edit_post', $post_id);
    }

    /* --------------------------------------------------------------------- *
     * After the save
     * --------------------------------------------------------------------- */

    /**
     * redirect_post_location: everything has been saved; bring the fees into
     * line. Returns the location untouched.
     *
     * @param mixed $location
     * @param mixed $post_id
     * @return mixed
     */
    public static function on_redirect($location, $post_id = 0)
    {
        $post_id = (int) $post_id;
        if (self::$running || !array_key_exists($post_id, self::$pending)) {
            return $location;
        }
        $pet = self::$pending[$post_id];
        unset(self::$pending[$post_id]);
        $result = self::sync($post_id, $pet, self::$before[$post_id] ?? []);
        if ($result !== '') {
            self::queue_notice($result);
        }
        return $location;
    }

    /**
     * Work out and apply the change. Returns what to tell staff ('' = nothing
     * to say: not eligible, or nothing changed).
     *
     * @param array<int,string> $before
     */
    public static function sync(int $booking_id, string $pet_choice, array $before): string
    {
        if (!self::eligible($booking_id)) {
            return '';
        }
        $plan = self::plan($booking_id, $pet_choice, $before);
        if ($plan === null) {
            return '';
        }
        if (isset($plan['error'])) {
            return $plan['error'];
        }
        return self::apply($booking_id, $plan);
    }

    /** A direct booking (not an import) that is not cancelled or abandoned. */
    public static function eligible(int $booking_id): bool
    {
        if ($booking_id <= 0 || Policies::is_imported($booking_id)) {
            return false;
        }
        $status = (string) get_post_status($booking_id);
        return $status !== '' && !in_array($status, self::FROZEN_STATUSES, true);
    }

    /**
     * What should change. Pure apart from reads: tested directly.
     *
     * null — nothing to change;
     * ['error' => message] — a change was asked for but cannot be made safely;
     * ['rooms' => [reserved room id => service rows], 'notes' => [...]].
     *
     * @param array<int,string> $before
     * @return array<string,mixed>|null
     */
    public static function plan(int $booking_id, string $pet_choice, array $before): ?array
    {
        $rooms = [];
        foreach (self::room_posts($booking_id) as $rr) {
            $id      = (int) $rr->ID;
            $room_id = (int) get_post_meta($id, '_mphb_room_id', true);
            $type_id = $room_id > 0 ? (int) get_post_meta($room_id, 'mphb_room_type_id', true) : 0;
            $rooms[$id] = [
                'type'     => $type_id,
                'adults'   => (string) get_post_meta($id, Admin_Guests::META_KEY, true),
                'services' => self::read_services(get_post_meta($id, '_mphb_services', true)),
                'offered'  => $type_id > 0 ? Config::room_type_service_ids($type_id) : null,
            ];
        }
        if (empty($rooms)) {
            return null;
        }

        $nights   = self::nights($booking_id);
        $pet_ids  = array_values(array_filter(array_map('intval', Config::pet_service_id_list())));
        $fee_ids  = array_values(array_filter(array_map('intval', Config::guest_service_id_list())));
        $desired  = [];
        $notes    = [];

        /* ---- The pet fee: only when the choice differs from what is stored. */
        if ($pet_choice === 'yes' || $pet_choice === 'no') {
            $pet_rooms = array_keys(array_filter($rooms, static function ($r) {
                return $r['type'] > 0 && Config::pet_fee_enabled() && Config::room_type_has_pet_services($r['type']) === true;
            }));
            if (count($pet_rooms) === 1) {
                $rid = $pet_rooms[0];
                if ($rooms[$rid]['services'] === null) {
                    return ['error' => __('Fees were not changed: this booking\'s services could not be read. Use Edit Accommodations.', 'dcc-checkout')];
                }
                $has = self::has_any($rooms[$rid]['services'], $pet_ids);
                $want = $pet_choice === 'yes';
                if ($has !== $want) {
                    $rows = self::without($rooms[$rid]['services'], $pet_ids);
                    if ($want) {
                        $tier = $nights > 0 ? Config::service_id_for_nights($nights) : 0;
                        if ($tier <= 0 || !is_array($rooms[$rid]['offered']) || !in_array($tier, $rooms[$rid]['offered'], true)) {
                            return ['error' => __('The pet fee was not added: the service for this stay\'s length could not be found on this cottage. Use Edit Accommodations.', 'dcc-checkout')];
                        }
                        $rows[] = ['id' => $tier, 'adults' => 1, 'quantity' => 1];
                        $notes[] = __('Pet fee added', 'dcc-checkout');
                    } else {
                        $notes[] = __('Pet fee removed', 'dcc-checkout');
                    }
                    $desired[$rid] = $rows;
                }
            }
        }

        /* ---- The extra-guest fee: per room, only when its count changed. */
        if (Config::guest_fee_active()) {
            $included = Config::included_guests();
            $fee_types = Config::guest_accommodations();
            foreach ($rooms as $rid => $r) {
                if (!array_key_exists($rid, $before) || $before[$rid] === $r['adults']) {
                    continue; // count not changed in this Update
                }
                if ($r['type'] <= 0 || !in_array($r['type'], $fee_types, true)) {
                    continue; // not a cottage with the fee (Cottages 33 / 34)
                }
                $count = (int) $r['adults'];
                if ($count < 1) {
                    continue; // "Not provided": no number to charge for
                }
                $current = $desired[$rid] ?? $r['services'];
                if ($current === null) {
                    return ['error' => __('Fees were not changed: this booking\'s services could not be read. Use Edit Accommodations.', 'dcc-checkout')];
                }
                $extra = max(0, $count - $included);
                $have  = self::fee_multiplier($current, $fee_ids);
                if ($have === $extra) {
                    continue;
                }
                $rows = self::without($current, $fee_ids);
                if ($extra > 0) {
                    $svc = $nights > 0 ? Config::guest_service_id_for_nights($nights) : 0;
                    if ($svc <= 0 || !is_array($r['offered']) || !in_array($svc, $r['offered'], true)) {
                        return ['error' => __('The extra guest fee was not changed: its service could not be found on this cottage. Use Edit Accommodations.', 'dcc-checkout')];
                    }
                    $rows[] = ['id' => $svc, 'adults' => $extra, 'quantity' => 1];
                    $notes[] = sprintf(
                        /* translators: %d: number of guests beyond those included. */
                        _n('Extra guest fee set to %d guest', 'Extra guest fee set to %d guests', $extra, 'dcc-checkout'),
                        $extra
                    );
                } else {
                    $notes[] = __('Extra guest fee removed', 'dcc-checkout');
                }
                $desired[$rid] = $rows;
            }
        }

        if (empty($desired)) {
            return null;
        }
        return ['rooms' => $desired, 'notes' => $notes];
    }

    /**
     * MotoPress's own sequence. Every MotoPress call is checked before the
     * first write; a failure before then writes nothing.
     *
     * @param array{rooms:array<int,array<int,array{id:int,adults:int,quantity:int}>>,notes:string[]} $plan
     */
    private static function apply(int $booking_id, array $plan): string
    {
        $fail = __('Fees were not changed: MotoPress could not reprice this booking here. Use Edit Accommodations.', 'dcc-checkout');
        if (!function_exists('MPHB')
            || !class_exists('\\MPHB\\Entities\\ReservedRoom')
            || !class_exists('\\MPHB\\Entities\\ReservedService')
            || !method_exists('\\MPHB\\Entities\\ReservedService', 'create')) {
            return $fail;
        }
        self::$running = true;
        try {
            $repo = MPHB()->getBookingRepository();
            if (!$repo || !method_exists($repo, 'findById') || !method_exists($repo, 'save') || !method_exists($repo, 'updateReservedRooms')) {
                return $fail;
            }
            $booking = $repo->findById($booking_id, true);
            if (!$booking || !method_exists($booking, 'getReservedRooms') || !method_exists($booking, 'setRooms')
                || !method_exists($booking, 'updateTotal')) {
                return $fail;
            }

            $rooms = [];
            $seen  = [];
            foreach ((array) $booking->getReservedRooms() as $room) {
                if (!is_object($room) || !method_exists($room, 'getId')) {
                    return $fail;
                }
                $rid = (int) $room->getId();
                if (!isset($plan['rooms'][$rid])) {
                    $rooms[] = $room;        // untouched, as MotoPress loaded it
                    continue;
                }
                foreach (['getRoomId', 'getRateId', 'getAdults', 'getChildren', 'getGuestName', 'getStatus', 'getUid'] as $m) {
                    if (!method_exists($room, $m)) {
                        return $fail;
                    }
                }
                $services = [];
                foreach ($plan['rooms'][$rid] as $row) {
                    $svc = \MPHB\Entities\ReservedService::create($row);
                    if (!$svc) {
                        return $fail;    // an id MotoPress does not know
                    }
                    $services[] = $svc;
                }
                $rooms[] = new \MPHB\Entities\ReservedRoom([
                    'id'                => $rid,
                    'room_id'           => $room->getRoomId(),
                    'booking_id'        => $booking_id,
                    'rate_id'           => $room->getRateId(),
                    'adults'            => $room->getAdults(),
                    'children'          => $room->getChildren(),
                    'reserved_services' => $services,
                    'guest_name'        => $room->getGuestName(),
                    'status'            => $room->getStatus(),
                    // Always the room's own uid: omitted, MotoPress makes a NEW
                    // one, and the room's tie to the iCal feeds breaks.
                    'uid'               => $room->getUid(),
                ]);
                $seen[] = $rid;
            }
            if (count($seen) !== count($plan['rooms'])) {
                return $fail;    // a room in the plan is not on the booking
            }

            $was = (float) get_post_meta($booking_id, 'mphb_total_price', true);
            // From here on MotoPress writes.
            $booking->setRooms($rooms);
            $booking->updateTotal();
            $repo->save($booking);
            $repo->updateReservedRooms($booking_id);
            if (function_exists('wp_cache_delete')) {
                wp_cache_delete($booking_id, 'post_meta');
            }
            $now = (float) get_post_meta($booking_id, 'mphb_total_price', true);

            $message = sprintf(
                /* translators: 1: what changed, e.g. "Pet fee added"; 2: total before; 3: total after. */
                __('%1$s; total %2$s → %3$s', 'dcc-checkout'),
                implode('; ', $plan['notes']),
                Config::format_price($was),
                Config::format_price($now)
            );
            if (method_exists($booking, 'addLog')) {
                $who = wp_get_current_user();
                $booking->addLog($message, ($who && $who->exists()) ? $who->display_name : null);
            }
            return $message;
        } catch (\Throwable $e) {
            return $fail;
        } finally {
            self::$running = false;
        }
    }

    /* --------------------------------------------------------------------- *
     * Reading
     * --------------------------------------------------------------------- */

    /**
     * `_mphb_services` as MotoPress writes it — a list of
     * ['id' => …, 'adults' => …, 'quantity' => …] (live, Director) — or [] when
     * absent. null for any other shape: it is rebuilt from these rows, so a
     * shape this cannot read must never be rewritten.
     *
     * @param mixed $raw
     * @return array<int,array{id:int,adults:int,quantity:int}>|null
     */
    public static function read_services($raw): ?array
    {
        if ($raw === '' || $raw === null || $raw === []) {
            return [];
        }
        $meta = maybe_unserialize($raw);
        if (!is_array($meta) || ($meta !== [] && array_keys($meta) !== range(0, count($meta) - 1))) {
            return null;
        }
        $rows = [];
        foreach ($meta as $row) {
            if (!is_array($row) || !isset($row['id'], $row['adults']) || !is_numeric($row['id']) || !is_numeric($row['adults'])) {
                return null;
            }
            $rows[] = [
                'id'       => (int) $row['id'],
                'adults'   => (int) $row['adults'],
                'quantity' => isset($row['quantity']) && is_numeric($row['quantity']) ? (int) $row['quantity'] : 1,
            ];
        }
        return $rows;
    }

    /** Stay length from the booking's own dates; 0 when unreadable. */
    public static function nights(int $booking_id): int
    {
        $in  = (string) get_post_meta($booking_id, 'mphb_check_in_date', true);
        $out = (string) get_post_meta($booking_id, 'mphb_check_out_date', true);
        $a = \DateTime::createFromFormat('!Y-m-d', $in);
        $b = \DateTime::createFromFormat('!Y-m-d', $out);
        if (!$a || !$b || $b <= $a) {
            return 0;
        }
        return (int) $a->diff($b)->days;
    }

    /** @param array<int,array{id:int}> $rows @param int[] $ids */
    private static function has_any(array $rows, array $ids): bool
    {
        foreach ($rows as $row) {
            if (in_array((int) $row['id'], $ids, true)) {
                return true;
            }
        }
        return false;
    }

    /** @param array<int,array{id:int}> $rows @param int[] $ids */
    private static function without(array $rows, array $ids): array
    {
        return array_values(array_filter($rows, static function ($row) use ($ids) {
            return !in_array((int) $row['id'], $ids, true);
        }));
    }

    /** The extra-guest fee's "for N" on these rows; 0 when it is not attached. */
    private static function fee_multiplier(array $rows, array $ids): int
    {
        $n = 0;
        foreach ($rows as $row) {
            if (in_array((int) $row['id'], $ids, true)) {
                $n += max(0, (int) $row['adults']);
            }
        }
        return $n;
    }

    /** @return array<int,object> */
    private static function room_posts(int $booking_id): array
    {
        if ($booking_id <= 0) {
            return [];
        }
        $rooms = get_posts([
            'post_type'        => self::RESERVED_POST_TYPE,
            'post_parent'      => $booking_id,
            'post_status'      => 'any',
            'numberposts'      => 50,
            'orderby'          => 'ID',
            'order'            => 'ASC',
            'suppress_filters' => false,
        ]);
        return is_array($rooms) ? $rooms : [];
    }

    /* --------------------------------------------------------------------- *
     * Telling staff
     * --------------------------------------------------------------------- */

    private static function queue_notice(string $message): void
    {
        $user = (int) get_current_user_id();
        if ($user > 0) {
            set_transient(self::NOTICE_PREFIX . $user, $message, 120);
        }
    }

    /** Shown once, on the screen the Update returns to. Text only. */
    public static function notice(): void
    {
        $user = (int) get_current_user_id();
        if ($user <= 0) {
            return;
        }
        $message = get_transient(self::NOTICE_PREFIX . $user);
        if (!is_string($message) || $message === '') {
            return;
        }
        delete_transient(self::NOTICE_PREFIX . $user);
        echo '<div class="notice notice-info is-dismissible"><p>' . esc_html($message) . '</p></div>';
    }
}
