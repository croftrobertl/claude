<?php
namespace MPHBAC;

use DateTimeImmutable;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * MOTOPRESS'S BOOKING RULES, FOR THE PUBLIC CALENDAR (0.47.4, Rob's pick).
 *
 * Until 0.47.4 the calendar knew only which nights were taken, and a guest
 * could pick dates MotoPress's checkout then refused — a Tuesday arrival
 * where arrivals are not allowed, two nights in a three-night season. Now it
 * asks MotoPress, through its public interface, mphb_availability_facade()
 * (MotoPress 6.4.0, RoomsAvailabilityCoreAPIFacade — the interface MotoPress
 * documents for "other plugins and themes"), the same questions its checkout
 * asks, for every day it shows:
 *
 *   in   may a stay START that day?   isCheckInEarlierThanMinAdvanceDate
 *                                     isCheckInLaterThanMaxAdvanceDate
 *                                     isCheckInNotAllowed (weekdays, blocks,
 *                                     per-date rules)
 *   out  may a stay END that day?     isCheckOutNotAllowed
 *   min  fewest nights from that day  getMinStayNightsCount
 *   max  most nights from that day    getMaxStayNightsCount (0 = no limit)
 *
 * MotoPress takes the stay limits from the CHECK-IN day's rule, so the
 * calendar does too. "Ignore booking rules" is false: these are guests.
 *
 * Buffer days are not here: they make nights unavailable, so Data_Provider
 * marks them booked, through buffer_days() below — MotoPress's own
 * RoomAvailabilityHelper::getBookedDays(), read for this release.
 *
 * RULES ONLY REMOVE CHOICES. Nothing here can make a night available; an
 * unreadable rule never reaches a guest as "allowed" — see failed().
 */
final class Booking_Rules
{
    /** Day codes in the response's rules.<type>.in / .out strings. */
    public const OK      = '1';
    public const NOT_DAY = 'w';   // MotoPress does not allow arrivals (or departures) that day
    public const TOO_SOON = 'a';  // inside the minimum-advance window
    public const TOO_FAR  = 'f';  // beyond the maximum-advance window

    /** When the last failure was logged (unix time); see failed(). */
    private const LOG_OPTION = 'mphbac_rules_failed_logged';

    /** @return object MotoPress's facade */
    private static function facade()
    {
        if (!function_exists('mphb_availability_facade')) {
            throw new \RuntimeException('mphb_availability_facade() is not available');
        }
        $f = \mphb_availability_facade();
        if (!is_object($f)) {
            throw new \RuntimeException('mphb_availability_facade() returned no object');
        }
        return $f;
    }

    /**
     * Every rule for every day of [from, to], per cottage.
     *
     * 'min' is null when MotoPress has NO minimum-stay rule at all — then,
     * and only then, the widget's own minimum (its "Minimum nights" control)
     * applies, client-side. When MotoPress has any minimum-stay rule, its
     * answer is used for every day, 1 included: that is what its checkout
     * enforces.
     *
     * @param int[] $type_ids
     * @return array<int, array{in:string, out:string, min:int[]|null, max:int[]}>
     * @throws \Throwable when MotoPress cannot be read — the caller decides
     */
    public static function read(array $type_ids, DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        $f = self::facade();
        $has_min = self::has_min_stay_rules();
        $out = [];
        foreach ($type_ids as $type_id) {
            $type_id = (int) $type_id;
            $in = '';
            $o = '';
            $min = [];
            $max = [];
            for ($d = $from; $d <= $to; $d = $d->modify('+1 day')) {
                // MotoPress's DateTime (mutable). Each call clones it before
                // moving it to the check-in/out time, but a fresh one per call
                // costs nothing and depends on nobody's good manners.
                $at = static fn(): \DateTime => new \DateTime($d->format('Y-m-d'), $d->getTimezone());
                if ($f->isCheckInEarlierThanMinAdvanceDate($type_id, $at(), false)) {
                    $in .= self::TOO_SOON;
                } elseif ($f->isCheckInLaterThanMaxAdvanceDate($type_id, $at(), false)) {
                    $in .= self::TOO_FAR;
                } elseif ($f->isCheckInNotAllowed($type_id, $at(), false)) {
                    $in .= self::NOT_DAY;
                } else {
                    $in .= self::OK;
                }
                $o .= $f->isCheckOutNotAllowed($type_id, $at(), false) ? self::NOT_DAY : self::OK;
                $min[] = max(1, (int) $f->getMinStayNightsCount($type_id, $at(), false));
                $max[] = max(0, (int) $f->getMaxStayNightsCount($type_id, $at(), false));
            }
            $out[$type_id] = ['in' => $in, 'out' => $o, 'min' => $has_min ? $min : null, 'max' => $max];
        }
        return $out;
    }

    /**
     * The response's optional `rules` field (0.47.4), per cottage, aligned
     * day for day with `availability` from `from` to `to`:
     *
     *   in   one character a day: 1 a stay may start, w MotoPress allows no
     *        arrival that day, a too soon (minimum advance), f too far ahead
     *        (maximum advance)
     *   out  one character a day: 1 a stay may end, w no departure that day
     *   min  fewest nights for a stay starting that day — one number when it
     *        is the same every day, else one per day. ABSENT when MotoPress
     *        has no minimum-stay rule: the widget's own minimum applies.
     *   max  most nights (0 = no limit), one number or one per day.
     *
     * Additive and optional: a client that does not know it — the Cottage
     * Selector — reads `availability` exactly as before.
     *
     * @param array<int, array{in:string, out:string, min:int[]|null, max:int[]}> $rules
     * @return array<string, array<string, mixed>>
     */
    public static function encode(array $rules): array
    {
        $flat = static fn(array $v) => count(array_unique($v)) === 1 ? (int) reset($v) : array_map('intval', $v);
        $out = [];
        foreach ($rules as $type_id => $r) {
            $e = ['in' => (string) $r['in'], 'out' => (string) $r['out']];
            if ($r['min'] !== null && $r['min'] !== []) {
                $e['min'] = $flat($r['min']);
            }
            $e['max'] = $r['max'] === [] ? 0 : $flat($r['max']);
            $out[(string) $type_id] = $e;
        }
        return $out;
    }

    /**
     * Does MotoPress have any minimum-stay rule? The same test its own
     * BookingRulesData makes: a rule in the mphb_min_stay_length setting
     * with a value, cottages and seasons — or a per-date one (6.0.0+).
     */
    private static function has_min_stay_rules(): bool
    {
        $mphb = function_exists('MPHB') ? \MPHB() : null;
        if (!is_object($mphb)) {
            throw new \RuntimeException('MPHB() is not available');
        }
        $rules = $mphb->settings()->bookingRules()->getReservationRules();
        foreach ((array) ($rules['min_stay_length'] ?? []) as $rule) {
            if (is_array($rule) && absint($rule['min_stay_length'] ?? 0) > 0
                && !empty($rule['room_type_ids']) && !empty($rule['season_ids'])) {
                return true;
            }
        }
        if (method_exists($mphb, 'getCustomBookingRulesRepository')) {
            return (bool) $mphb->getCustomBookingRulesRepository()->hasRules('min_stay_length');
        }
        return false;
    }

    /**
     * The longest buffer any booking can carry (0 = no buffer rules), so the
     * reservations read can reach that far past the window.
     *
     * @throws \Throwable
     */
    public static function max_buffer(): int
    {
        // No facade at all (a MotoPress older than this interface) is a
        // PERMANENT state, not a failed read: no buffers, and availability is
        // stored as in 0.47.3. Logged, but not retried request after request.
        if (!function_exists('mphb_availability_facade')) {
            self::failed(new \RuntimeException('mphb_availability_facade() is not available'));
            return 0;
        }
        $f = self::facade();
        if (!$f->hasBufferDaysRules(self::admin_rules_off())) {
            return 0;
        }
        return max(0, (int) $f->getMaxBufferDaysCount(0));
    }

    /**
     * Buffer nights for one booking of one cottage — MotoPress's own reading
     * (RoomAvailabilityHelper::getBookedDays, 6.4.0): the rule of the booked
     * cottage on the booking's CHECK-IN day; none for an iCal-imported
     * booking when "sync with buffers" is on (the other site's dates already
     * hold them). The rules switch is the one getBookedDays passes.
     *
     * @throws \Throwable
     */
    public static function buffer_days(int $type_id, string $check_in, bool $imported): int
    {
        $mphb = \MPHB();
        if ($imported && $mphb->settings()->main()->isSyncWithBuffers()) {
            return 0;
        }
        $date = new \DateTime($check_in, Data_Provider::timezone());
        return max(0, (int) self::facade()->getBufferDaysCount($type_id, $date, self::admin_rules_off()));
    }

    private static function admin_rules_off(): bool
    {
        $main = \MPHB()->settings()->main();
        return method_exists($main, 'isBookingRulesForAdminDisabled') ? (bool) $main->isBookingRulesForAdminDisabled() : false;
    }

    /**
     * MotoPress could not be read. The calendar then behaves exactly as
     * 0.47.3 did — no rules sent, no buffer nights, the widget's own minimum
     * — which is never more permissive than before, and checkout still
     * enforces every rule. Nothing computed that way is stored, so the next
     * request tries again. Logged once an hour at most, not once a visitor.
     */
    public static function failed(\Throwable $e): void
    {
        $last = (int) get_option(self::LOG_OPTION, 0);
        if ($last > time() - HOUR_IN_SECONDS) {
            return;
        }
        error_log('MPHBAC: MotoPress booking rules could not be read; showing availability without them: ' . $e->getMessage());
        update_option(self::LOG_OPTION, time(), false);
    }
}
