<?php
namespace DCCL;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * What a MotoPress booking's price is made of — read, never written.
 *
 * `mphb_total_price` is the price the guest was billed. The Director
 * established on 2026-10-30, by reading live, that on this site it INCLUDES
 * room tax: of 117 confirmed bookings carrying a breakdown, 76 list room
 * taxes, and the breakdown's own total agrees with `mphb_total_price` on 116
 * of the 117. No services appear in any breakdown.
 *
 * Room revenue excludes tax. So the direct figures cannot use the total as
 * it stands; they have to take the breakdown's total less its taxes.
 *
 * The shape of `_mphb_booking_price_breakdown` is MotoPress's, not ours, and
 * it is not the same on every version. So this reader proves itself rather
 * than trusting its own reading:
 *
 *  - it finds the taxes wherever they are nested, by container name;
 *  - it finds the breakdown's own total;
 *  - and it reports a tax as KNOWN only when the parts it read add up —
 *    the breakdown's total equals the booking's total, and where the
 *    breakdown states a pre-tax base, base plus the taxes it found equals
 *    that total.
 *
 * Anything else is an unknown tax, named as unknown. A booking whose tax is
 * unknown keeps its money in the money figures and stays out of every rate:
 * an unknown is never a zero, and a rate computed from a total that may hold
 * tax is the wrong figure, not a missing one.
 */
final class Breakdown
{
    /** Containers whose entries are taxes, wherever they are nested. */
    public const TAX_KEYS = ['taxes', 'tax', 'room_taxes', 'fee_taxes', 'service_taxes'];

    /** Where an entry keeps its money, in the order they are tried. */
    public const AMOUNT_KEYS = ['amount', 'price', 'total', 'value', 'tax'];

    /** Where the breakdown keeps its own total. */
    public const TOTAL_KEYS = ['total', 'grand_total', 'total_price'];

    /** A pre-tax base, where the breakdown states one. */
    public const BASE_KEYS = ['subtotal', 'sub_total', 'total_before_tax', 'net_total'];

    public const NO_BREAKDOWN    = 'no breakdown';
    public const UNREADABLE      = 'breakdown unreadable';
    public const NO_TOTAL        = 'breakdown states no total';
    public const TOTAL_DISAGREES = 'breakdown total disagrees with the booking total';
    public const PARTS_DISAGREE  = 'breakdown parts do not add up to its total';
    public const KNOWN           = 'read from the breakdown';

    /**
     * The tax inside a booking's total.
     *
     * @param mixed $raw         the stored meta value, serialized or not
     * @param int   $total_cents the booking's own mphb_total_price, in cents
     * @return array{known:bool,tax_cents:int,total_cents:?int,has_tax:bool,reason:string}
     */
    public static function read($raw, int $total_cents): array
    {
        $miss = static fn (string $reason): array => [
            'known'       => false,
            'tax_cents'   => 0,
            'total_cents' => null,
            'has_tax'     => false,
            'reason'      => $reason,
        ];

        if ($raw === null || $raw === '' || $raw === false) {
            return $miss(self::NO_BREAKDOWN);
        }

        // Unserialized with every class forbidden: this is stored data,
        // and a serialized object in it must never become an object here.
        // WordPress's own helper would allow one.
        $data = is_array($raw) ? $raw : @unserialize((string) $raw, ['allowed_classes' => false]);
        if (!is_array($data) || $data === []) {
            return $miss(self::UNREADABLE);
        }

        $tax     = self::sum_taxes($data);
        $total   = self::first_amount($data, self::TOTAL_KEYS);
        $base    = self::first_amount($data, self::BASE_KEYS);
        $has_tax = $tax['found'];

        if ($total === null) {
            return ['known' => false, 'tax_cents' => 0, 'total_cents' => null, 'has_tax' => $has_tax, 'reason' => self::NO_TOTAL];
        }

        if ($total !== $total_cents) {
            return ['known' => false, 'tax_cents' => 0, 'total_cents' => $total, 'has_tax' => $has_tax, 'reason' => self::TOTAL_DISAGREES];
        }

        // Where the breakdown states what the price was before tax, the two
        // readings must meet. If they do not, something in this breakdown is
        // not being read — and a tax read wrongly moves every direct rate.
        if ($base !== null && $base + $tax['cents'] !== $total) {
            return ['known' => false, 'tax_cents' => 0, 'total_cents' => $total, 'has_tax' => $has_tax, 'reason' => self::PARTS_DISAGREE];
        }

        return [
            'known'       => true,
            'tax_cents'   => $tax['cents'],
            'total_cents' => $total,
            'has_tax'     => $has_tax,
            'reason'      => self::KNOWN,
        ];
    }

    /**
     * Every tax in the breakdown, however deeply it is nested.
     *
     * @param array<mixed> $data
     * @return array{cents:int,found:bool}
     */
    private static function sum_taxes(array $data): array
    {
        $cents = 0;
        $found = false;

        $walk = static function ($node, bool $inside_tax) use (&$walk, &$cents, &$found): void {
            if (!is_array($node)) {
                return;
            }
            foreach ($node as $key => $value) {
                $is_tax = $inside_tax
                    || (is_string($key) && in_array(strtolower($key), self::TAX_KEYS, true));

                if ($is_tax && !is_array($value) && is_numeric($value)) {
                    $cents += Money::to_cents($value);
                    $found  = true;
                    continue;
                }

                if ($is_tax && is_array($value)) {
                    $amount = self::first_amount($value, self::AMOUNT_KEYS);
                    if ($amount !== null) {
                        $cents += $amount;
                        $found  = true;
                        continue;
                    }
                }

                if (is_array($value)) {
                    $walk($value, $is_tax);
                }
            }
        };

        $walk($data, false);

        return ['cents' => $cents, 'found' => $found];
    }

    /**
     * The first of these keys holding a number, at the top of this node.
     *
     * @param array<mixed> $node
     * @param string[]     $keys
     */
    private static function first_amount(array $node, array $keys): ?int
    {
        foreach ($keys as $key) {
            foreach ($node as $k => $v) {
                if (!is_string($k) || strtolower($k) !== $key) {
                    continue;
                }
                if (is_array($v) || !is_numeric($v)) {
                    continue;
                }

                return Money::to_cents($v);
            }
        }

        return null;
    }
}
