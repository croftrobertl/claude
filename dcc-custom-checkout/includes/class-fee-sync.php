<?php
namespace DCC_Checkout;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * FEES FOLLOW THE UPDATE BUTTON (v0.33.0, Rob: "Both follow Update"; v0.33.1:
 * "only add / remove the fee — never reprice the stay").
 *
 * On a DIRECT booking that is not cancelled or abandoned, pressing Update on
 * the booking screen adds, changes or removes a fee line to match what staff
 * set there:
 *  - "Pet fee: Yes / No" (one room, on a pet-fee cottage) adds or removes the
 *    ACTIVE pet service — Config::service_id_for_nights(): the flat service
 *    for any stay, or the length-of-stay tier (v0.34.0), as the checkout and
 *    Add New use. An existing pet line of ANY recognised service (flat or an
 *    old tier) counts as the pet fee: Yes adds no second line, No removes it;
 *  - a changed guest count adds, adjusts or removes the Extra Guest Fee on a
 *    cottage that carries it — Config::guest_service_id_for_nights() and
 *    `count - included_guests()`, the service and multiplier the checkout and
 *    Add New use (18063 is priced per adult, so adults = guests beyond 2).
 * Imports never get a fee.
 *
 * ONLY ON A CHANGE MADE IN THIS UPDATE (Rob: "Leave it alone"). A booking
 * whose stored fee already disagrees with its count (an old booking, a fee the
 * owner waived) is left exactly as it is when saved for any other reason.
 *
 * THE FEE IS ADDED TO THE BOOKING AS IT WAS PRICED, NEVER REPRICED (v0.33.1).
 * 0.33.0 called MotoPress's updateTotal(), which reprices the WHOLE stay at
 * today's rates (Director, staging: #10212, booked at $555, read $666 after
 * pet on/off). Now nothing of MotoPress's is re-run. Each fee line is priced
 * with MotoPress's own per-service calculation —
 * ReservedService::create($row)->calcPrice($checkIn, $checkOut) — and built
 * exactly as PriceBreakdownHelper::getServicesBreakdown() builds one (title
 * from the service repository, details = toString('price', $nights), total =
 * calcPrice()). Then, consistently and by exactly that amount:
 *  - the room's `_mphb_services` rows;
 *  - in `_mphb_booking_price_breakdown`: that room's services.list,
 *    services.total / discount_total, the room's total / discount_total, and
 *    the booking total;
 *  - `mphb_total_price`.
 * The room price, its nightly list, its taxes and every other line are left
 * untouched. Arithmetic is in whole cents. A changed guest count also sets the
 * breakdown's room.adults, so invoices print the right number.
 *
 * A LINE IS FOUND BY POSITION, NEVER BY TITLE. List items carry no service id,
 * and their titles are the title at booking time. MotoPress builds the list in
 * the order of the room's `_mphb_services` rows, skipping a row whose service
 * no longer exists — so a line is touched only when the list is exactly as
 * long as the rows AND its total equals calcPrice() of that row to the cent.
 *
 * FAILS SAFE. A coupon on the booking, any service discount, service taxes
 * configured (`mphb_service_taxes`), more than one accommodation, a breakdown
 * not in MotoPress's shape or not matching `mphb_total_price`, or anything
 * else unreadable: nothing is written and staff are told to use Edit
 * Accommodations (MotoPress's own flow, which DOES reprice the stay).
 *
 * NOTHING ELSE CHANGES: dates, rates, children, guest names, UIDs, payments
 * and status. No reserved room is rebuilt or saved through MotoPress, so no
 * count is ever written from a cached booking (0.33.0's stale-count defect).
 * A total that falls below what has been paid is left that way.
 *
 * WHEN IT RUNS. MotoPress's own Update (EditCPTPage::saveMetaBoxes, save_post
 * at 10) saves the booking, and CPTPersistence::update() (~172) calls
 * wp_update_post() before it writes the booking meta (Director, live 6.3.0),
 * so any save_post handler runs before MotoPress's own writes. So save_post
 * only RECORDS that work is due (after the nonce, capability and post_ID
 * checks), and the work runs on `redirect_post_location` — the filter
 * post.php applies once, after every save handler has returned.
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
        if (isset(self::$before[$post_id]) || !self::request_is_ours($post_id)) {
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
        if (!$post instanceof \WP_Post || $post->post_type !== self::BOOKING_POST_TYPE) {
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
        // This Update's snapshot is used once: a second Update in the same
        // process must take its own (v0.33.1 — two Updates in one process).
        $before = self::$before[$post_id] ?? [];
        unset(self::$before[$post_id]);
        if (!array_key_exists($post_id, self::$pending)) {
            return $location;
        }
        $pet = self::$pending[$post_id];
        unset(self::$pending[$post_id]);
        $result = self::sync($post_id, $pet, $before);
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
     * ['error' => message] — a fee change was asked for but cannot be made;
     * ['room' => reserved room id, 'ops' => [...], 'notes' => [...],
     *  'adults' => new count | null] — ops on that room's service rows, by
     *  their index in `_mphb_services`: ['add', row], ['remove', i],
     *  ['replace', i, row].
     *
     * @param array<int,string> $before
     * @return array<string,mixed>|null
     */
    public static function plan(int $booking_id, string $pet_choice, array $before): ?array
    {
        $posts = self::room_posts($booking_id);
        if (empty($posts)) {
            return null;
        }
        $rooms = [];
        foreach ($posts as $rr) {
            $id      = (int) $rr->ID;
            $room_id = (int) get_post_meta($id, '_mphb_room_id', true);
            $type_id = $room_id > 0 ? (int) get_post_meta($room_id, 'mphb_room_type_id', true) : 0;
            $adults  = (string) get_post_meta($id, Admin_Guests::META_KEY, true);
            $rooms[$id] = [
                'type'     => $type_id,
                'adults'   => $adults,
                'changed'  => array_key_exists($id, $before) && $before[$id] !== $adults,
                'services' => self::read_services(get_post_meta($id, '_mphb_services', true)),
                'offered'  => $type_id > 0 ? Config::room_type_service_ids($type_id) : null,
            ];
        }

        $nights  = self::nights($booking_id);
        // RECOGNISED (v0.34.0): the flat pet service AND the old tiers. A
        // booking holding an old tier fee already HAS a pet fee — Yes adds
        // no second line, No removes it — whatever the mode is now.
        $pet_ids = Config::recognised_pet_service_ids();
        $fee_ids = array_values(array_filter(array_map('intval', Config::guest_service_id_list())));
        $unreadable = __('Fees were not changed: this booking\'s services could not be read. Use Edit Accommodations.', 'dcc-checkout');
        $ops     = [];   // reserved room id => ops
        $notes   = [];

        /* ---- The pet fee: only when the choice differs from what is stored. */
        if ($pet_choice === 'yes' || $pet_choice === 'no') {
            $pet_rooms = array_keys(array_filter($rooms, static function ($r) {
                return $r['type'] > 0 && Config::pet_fee_enabled() && Config::room_type_has_pet_services($r['type']) === true;
            }));
            if (count($pet_rooms) === 1) {
                $rid  = $pet_rooms[0];
                $rows = $rooms[$rid]['services'];
                if ($rows === null) {
                    return ['error' => $unreadable];
                }
                $has  = self::has_any($rows, $pet_ids);
                $want = $pet_choice === 'yes';
                if ($has !== $want) {
                    if ($want) {
                        $tier = $nights > 0 ? Config::service_id_for_nights($nights) : 0;
                        if ($tier <= 0 || !is_array($rooms[$rid]['offered']) || !in_array($tier, $rooms[$rid]['offered'], true)) {
                            return ['error' => Config::pet_fee_mode() === 'tiers'
                                ? __('The pet fee was not added: the service for this stay\'s length could not be found on this cottage. Use Edit Accommodations.', 'dcc-checkout')
                                : __('The pet fee was not added: its service is not attached to this cottage in MotoPress. Use Edit Accommodations.', 'dcc-checkout')];
                        }
                        $ops[$rid][] = ['add', ['id' => $tier, 'adults' => 1, 'quantity' => 1]];
                        $notes[] = __('Pet fee added', 'dcc-checkout');
                    } else {
                        foreach ($rows as $i => $row) {
                            if (in_array((int) $row['id'], $pet_ids, true)) {
                                $ops[$rid][] = ['remove', $i];
                            }
                        }
                        $notes[] = __('Pet fee removed', 'dcc-checkout');
                    }
                }
            }
        }

        /* ---- The extra-guest fee: per room, only when its count changed. */
        if (Config::guest_fee_active()) {
            $included  = Config::included_guests();
            $fee_types = Config::guest_accommodations();
            foreach ($rooms as $rid => $r) {
                if (!$r['changed']) {
                    continue; // count not changed in this Update
                }
                if ($r['type'] <= 0 || !in_array($r['type'], $fee_types, true)) {
                    continue; // not a cottage with the fee (Cottages 33 / 34)
                }
                $count = (int) $r['adults'];
                if ($count < 1) {
                    continue; // "Not provided": no number to charge for
                }
                if ($r['services'] === null) {
                    return ['error' => $unreadable];
                }
                $at = [];
                foreach ($r['services'] as $i => $row) {
                    if (in_array((int) $row['id'], $fee_ids, true)) {
                        $at[] = $i;
                    }
                }
                if (count($at) > 1) {
                    return ['error' => $unreadable];
                }
                $extra = max(0, $count - $included);
                $have  = $at ? max(0, (int) $r['services'][$at[0]]['adults']) : 0;
                if ($have === $extra) {
                    continue;
                }
                if ($extra > 0) {
                    $svc = $nights > 0 ? Config::guest_service_id_for_nights($nights) : 0;
                    if ($svc <= 0 || !is_array($r['offered']) || !in_array($svc, $r['offered'], true)) {
                        return ['error' => __('The extra guest fee was not changed: its service could not be found on this cottage. Use Edit Accommodations.', 'dcc-checkout')];
                    }
                    $row = ['id' => $svc, 'adults' => $extra, 'quantity' => 1];
                    $ops[$rid][] = $at ? ['replace', $at[0], $row] : ['add', $row];
                    $notes[] = sprintf(
                        /* translators: %d: number of guests beyond those included. */
                        _n('Extra guest fee set to %d guest', 'Extra guest fee set to %d guests', $extra, 'dcc-checkout'),
                        $extra
                    );
                } else {
                    $ops[$rid][] = ['remove', $at[0]];
                    $notes[] = __('Extra guest fee removed', 'dcc-checkout');
                }
            }
        }

        $counts = array_filter($rooms, static function ($r) {
            return $r['changed'] && (int) $r['adults'] > 0;
        });
        if (empty($ops) && empty($counts)) {
            return null;
        }
        // One accommodation only: the breakdown's room for each reserved room
        // is not something this can prove on a multi-room booking.
        if (count($rooms) !== 1) {
            return empty($ops) ? null : ['error' => __('Fees were not changed: this booking has more than one accommodation. Use Edit Accommodations.', 'dcc-checkout')];
        }
        $rid = (int) array_key_first($rooms);
        return [
            'room'   => $rid,
            'ops'    => $ops[$rid] ?? [],
            'notes'  => $notes,
            'adults' => $rooms[$rid]['changed'] && (int) $rooms[$rid]['adults'] > 0 ? (int) $rooms[$rid]['adults'] : null,
        ];
    }

    /**
     * Write the change: the room's service rows, the matching lines and totals
     * in the stored price breakdown, and `mphb_total_price` — all by the same
     * amount, in cents. Every check runs before the first write.
     *
     * @param array{room:int,ops:array,notes:string[],adults:?int} $plan
     */
    private static function apply(int $booking_id, array $plan): string
    {
        $fail = __('Fees were not changed: MotoPress could not price this change here. Use Edit Accommodations.', 'dcc-checkout');
        $rid  = (int) $plan['room'];
        $ops  = (array) $plan['ops'];

        $breakdown = self::read_breakdown($booking_id);
        if (empty($ops)) {
            // Only the count changed: record it where invoices read it, if the
            // breakdown can be read; there is no money to get wrong.
            if ($breakdown !== null && $plan['adults'] !== null
                && (int) $breakdown->rooms[0]->room->adults !== $plan['adults']) {
                $breakdown->rooms[0]->room->adults = $plan['adults'];
                self::write_breakdown($booking_id, $breakdown);
            }
            return '';
        }

        if ($breakdown === null) {
            return __('Fees were not changed: this booking\'s price breakdown is not in the form this can safely change. Use Edit Accommodations.', 'dcc-checkout');
        }
        if (trim((string) get_post_meta($booking_id, 'mphb_coupon_id', true)) !== '') {
            return __('Fees were not changed: this booking has a coupon. Use Edit Accommodations.', 'dcc-checkout');
        }
        $service_taxes = get_option('mphb_service_taxes', []);
        if (!empty($service_taxes)) {
            return __('Fees were not changed: service taxes are configured. Use Edit Accommodations.', 'dcc-checkout');
        }
        $room = $breakdown->rooms[0];
        if (self::cents($room->services->discount) !== 0
            || self::cents(get_post_meta($booking_id, 'mphb_total_price', true)) !== self::cents($breakdown->total)) {
            return __('Fees were not changed: this booking\'s price breakdown is not in the form this can safely change. Use Edit Accommodations.', 'dcc-checkout');
        }

        if (!function_exists('MPHB') || !class_exists('\\MPHB\\Entities\\ReservedService')
            || !method_exists('\\MPHB\\Entities\\ReservedService', 'create')) {
            return $fail;
        }
        try {
            $booking = MPHB()->getBookingRepository()->findById($booking_id);
            if (!$booking || !method_exists($booking, 'getCheckInDate') || !method_exists($booking, 'getCheckOutDate')
                || !method_exists($booking, 'getNightsCount')) {
                return $fail;
            }
            $in     = $booking->getCheckInDate();
            $out    = $booking->getCheckOutDate();
            $nights = (int) $booking->getNightsCount();

            $stored = get_post_meta($rid, '_mphb_services', true);
            $rows   = self::read_services($stored);
            if ($rows === null) {
                return $fail;
            }
            // Rows this does not change are written back exactly as stored.
            $raw = $rows === [] ? [] : array_values((array) maybe_unserialize($stored));
            $list = $room->services->list;
            // The list is built from the rows in order, skipping a service that
            // no longer exists: equal lengths, or positions cannot be trusted.
            if (!is_array($list) || count($list) !== count($rows)) {
                return __('Fees were not changed: this booking\'s services and its price breakdown do not line up. Use Edit Accommodations.', 'dcc-checkout');
            }

            $delta = 0;
            $lines = $list;
            $kept  = $raw;
            $gone  = [];
            $adds  = [];
            foreach ($ops as $op) {
                if ($op[0] === 'remove' || $op[0] === 'replace') {
                    $i = (int) $op[1];
                    if (!isset($rows[$i], $list[$i]) || !is_object($list[$i]) || !isset($list[$i]->total)) {
                        return $fail;
                    }
                    $old = \MPHB\Entities\ReservedService::create($rows[$i]);
                    if (!$old || !method_exists($old, 'calcPrice')) {
                        return $fail;
                    }
                    $old_cents = self::cents($list[$i]->total);
                    if ($old_cents !== self::cents($old->calcPrice($in, $out))) {
                        return __('Fees were not changed: the fee line in this booking\'s price breakdown is not the one this would remove. Use Edit Accommodations.', 'dcc-checkout');
                    }
                    $delta -= $old_cents;
                    if ($op[0] === 'remove') {
                        $gone[] = $i;
                        continue;
                    }
                    $line = self::line($op[2], $in, $out, $nights);
                    if ($line === null) {
                        return $fail;
                    }
                    $kept[$i]  = $op[2];
                    $lines[$i] = $line;
                    $delta    += self::cents($line->total);
                } elseif ($op[0] === 'add') {
                    $line = self::line($op[1], $in, $out, $nights);
                    if ($line === null) {
                        return $fail;
                    }
                    $adds[]  = [$op[1], $line];
                    $delta  += self::cents($line->total);
                } else {
                    return $fail;
                }
            }
            rsort($gone);
            foreach ($gone as $i) {
                array_splice($kept, $i, 1);
                array_splice($lines, $i, 1);
            }
            foreach ($adds as [$row, $line]) {
                $kept[]  = $row;
                $lines[] = $line;
            }
        } catch (\Throwable $e) {
            return $fail;
        }

        $was = self::cents($breakdown->total);
        $room->services->list           = array_values($lines);
        $room->services->total          = self::money(self::cents($room->services->total) + $delta);
        $room->services->discount_total = self::money(self::cents($room->services->discount_total) + $delta);
        $room->total                    = self::money(self::cents($room->total) + $delta);
        $room->discount_total           = self::money(self::cents($room->discount_total) + $delta);
        $breakdown->total               = self::money($was + $delta);
        if ($plan['adults'] !== null) {
            $room->room->adults = $plan['adults'];
        }

        // From here on: writes, all of them already decided.
        update_post_meta($rid, '_mphb_services', array_values($kept));
        self::write_breakdown($booking_id, $breakdown);
        update_post_meta($booking_id, 'mphb_total_price', self::money($was + $delta));

        $message = sprintf(
            /* translators: 1: what changed, e.g. "Pet fee added"; 2: total before; 3: total after. */
            __('%1$s; total %2$s → %3$s', 'dcc-checkout'),
            implode('; ', $plan['notes']),
            Config::format_price($was / 100),
            Config::format_price(($was + $delta) / 100)
        );
        try {
            if (isset($booking) && method_exists($booking, 'addLog')) {
                $who = wp_get_current_user();
                $booking->addLog($message, ($who && $who->exists()) ? $who->display_name : null);
            }
        } catch (\Throwable $e) {
            // The change is written; a log that cannot be written must not undo it.
        }
        return $message;
    }

    /**
     * One services.list line, built exactly as
     * PriceBreakdownHelper::getServicesBreakdown() builds it (live 6.3.0,
     * ~326–380): title from the service repository (via the translation
     * filter), falling back to the service's own; details = toString('price',
     * nights); total = calcPrice(check-in, check-out). null if MotoPress cannot
     * build it.
     *
     * @param array{id:int,adults:int,quantity:int} $row
     */
    private static function line(array $row, $in, $out, int $nights): ?\stdClass
    {
        $svc = \MPHB\Entities\ReservedService::create($row);
        if (!$svc || !method_exists($svc, 'calcPrice') || !method_exists($svc, 'toString')) {
            return null;
        }
        $title = '';
        $repo  = MPHB()->getServiceRepository();
        if ($repo && method_exists($svc, 'getId')) {
            $found = $repo->findById(apply_filters('_mphb_translate_post_id', $svc->getId(), null));
            if ($found && method_exists($found, 'getTitle')) {
                $title = (string) $found->getTitle();
            }
        }
        if ($title === '' && method_exists($svc, 'getTitle')) {
            $title = (string) $svc->getTitle();
        }
        $line          = new \stdClass();
        $line->title   = $title;
        $line->details = (string) $svc->toString('price', $nights);
        $line->total   = $svc->calcPrice($in, $out);
        return $line;
    }

    /**
     * The stored breakdown, decoded to OBJECTS (so an empty `{}` stays an
     * object when written back), checked for the shape MotoPress writes: ONE
     * room, carrying room / services / fees / taxes / total / discount /
     * discount_total, with no service taxes. null for anything else.
     */
    public static function read_breakdown(int $booking_id): ?\stdClass
    {
        $raw = get_post_meta($booking_id, '_mphb_booking_price_breakdown', true);
        if (!is_string($raw) || $raw === '') {
            return null;
        }
        $b = json_decode($raw);
        if (!$b instanceof \stdClass || !isset($b->rooms, $b->total) || !is_array($b->rooms)
            || count($b->rooms) !== 1 || !is_numeric($b->total)) {
            return null;
        }
        $r = $b->rooms[0];
        if (!$r instanceof \stdClass) {
            return null;
        }
        foreach (['room', 'services', 'fees', 'taxes'] as $k) {
            if (!isset($r->$k) || !$r->$k instanceof \stdClass) {
                return null;
            }
        }
        foreach (['total', 'discount', 'discount_total'] as $k) {
            if (!isset($r->$k) || !is_numeric($r->$k) || !isset($r->services->$k) || !is_numeric($r->services->$k)) {
                return null;
            }
        }
        if (!isset($r->services->list) || !is_array($r->services->list) || !isset($r->room->adults)) {
            return null;
        }
        $st = $r->taxes->services ?? null;
        if (!$st instanceof \stdClass || !isset($st->list, $st->total) || !is_array($st->list)
            || $st->list !== [] || self::cents($st->total) !== 0) {
            return null;
        }
        return $b;
    }

    /** As BookingRepository writes it (~328–329): json_encode, default flags, wp_slash. */
    private static function write_breakdown(int $booking_id, \stdClass $breakdown): void
    {
        update_post_meta($booking_id, '_mphb_booking_price_breakdown', wp_slash(json_encode($breakdown)));
    }

    /** Money as whole cents. */
    public static function cents($amount): int
    {
        return (int) round(((float) $amount) * 100);
    }

    /** Cents back to a stored number: an int when whole, as MotoPress's are. */
    public static function money(int $cents)
    {
        return $cents % 100 === 0 ? intdiv($cents, 100) : $cents / 100;
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
