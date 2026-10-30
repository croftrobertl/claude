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
 * it stands; they take the breakdown's total less its taxes.
 *
 * `_mphb_booking_price_breakdown` is a **JSON string** on this site — 0.3.3
 * read it as a serialized PHP array, found nothing, and put all 267 direct
 * bookings into "tax unknown". Its shape, counted on live on 2026-10-30:
 *
 *     total                                 the whole booking total
 *     rooms[n].room.total|discount|…
 *     rooms[n].services.total|…
 *     rooms[n].fees.total|…
 *     rooms[n].taxes.room.total             ← room tax
 *     rooms[n].taxes.room.list[m].label|price
 *     rooms[n].taxes.services.total         ← tax on services
 *     rooms[n].taxes.fees.total             ← tax on fees
 *     rooms[n].total|discount|discount_total
 *
 * The reader walks those paths exactly rather than hunting for anything
 * tax-shaped, and PROVES ITSELF two ways before a tax counts as known:
 *
 *  - the breakdown's own total must equal the booking's total; and
 *  - every key under a room's `taxes` must be one this reader knows. A tax
 *    bucket nobody has seen here would otherwise be read as nothing, and a
 *    tax read short overstates room revenue by the difference.
 *
 * Anything else is an unknown tax, named as unknown. A booking whose tax is
 * unknown keeps its money in the money figures and stays out of every rate:
 * an unknown is never a zero, and a rate computed from a total that may
 * hold tax is a wrong figure rather than a missing one.
 */
final class Breakdown
{
    /** The tax buckets this site has, and the only ones accepted. */
    public const TAX_BUCKETS = ['room', 'services', 'fees'];

    /** Where a bucket keeps its money, in the order they are tried. */
    public const AMOUNT_KEYS = ['total', 'amount', 'price', 'value'];

    /** Where the breakdown keeps its own total. */
    public const TOTAL_KEYS = ['total', 'grand_total', 'total_price'];

    public const NO_BREAKDOWN    = 'no breakdown';
    public const UNREADABLE      = 'breakdown unreadable';
    public const NO_TOTAL        = 'breakdown states no total';
    public const TOTAL_DISAGREES = 'breakdown total disagrees with the booking total';
    public const NO_ROOMS        = 'breakdown lists no rooms';
    public const UNKNOWN_BUCKET  = 'breakdown holds a tax bucket this reader does not know';
    public const KNOWN           = 'read from the breakdown';

    /**
     * The tax inside a booking's total.
     *
     * @param mixed $raw         the stored meta value: JSON on this site
     * @param int   $total_cents the booking's own mphb_total_price, in cents
     * @return array{known:bool,tax_cents:int,total_cents:?int,has_tax:bool,reason:string}
     */
    public static function read($raw, int $total_cents): array
    {
        $miss = static fn (string $reason, ?int $total = null, bool $has_tax = false): array => [
            'known'       => false,
            'tax_cents'   => 0,
            'total_cents' => $total,
            'has_tax'     => $has_tax,
            'reason'      => $reason,
        ];

        if ($raw === null || $raw === '' || $raw === false) {
            return $miss(self::NO_BREAKDOWN);
        }

        $data = self::decode($raw);
        if (!is_array($data) || $data === []) {
            return $miss(self::UNREADABLE);
        }

        $total = self::amount($data, self::TOTAL_KEYS);
        if ($total === null) {
            return $miss(self::NO_TOTAL);
        }
        if ($total !== $total_cents) {
            return $miss(self::TOTAL_DISAGREES, $total);
        }

        $rooms = $data['rooms'] ?? null;
        if (!is_array($rooms) || $rooms === []) {
            return $miss(self::NO_ROOMS, $total);
        }

        $tax     = 0;
        $has_tax = false;
        foreach ($rooms as $room) {
            if (!is_array($room)) {
                continue;
            }
            $taxes = $room['taxes'] ?? [];
            if (!is_array($taxes)) {
                return $miss(self::UNKNOWN_BUCKET, $total);
            }

            foreach ($taxes as $bucket => $node) {
                if (!is_string($bucket) || !in_array($bucket, self::TAX_BUCKETS, true)) {
                    // A tax this reader has never seen. Reading it as
                    // nothing would overstate room revenue by its value.
                    return $miss(self::UNKNOWN_BUCKET, $total);
                }

                $cents = self::bucket_cents($node);
                if ($cents === null) {
                    return $miss(self::UNKNOWN_BUCKET, $total);
                }

                $tax += $cents;
                if ($bucket === 'room' && $cents !== 0) {
                    $has_tax = true;
                }
            }
        }

        return [
            'known'       => true,
            'tax_cents'   => $tax,
            'total_cents' => $total,
            'has_tax'     => $has_tax,
            'reason'      => self::KNOWN,
        ];
    }

    /**
     * The stored value as an array.
     *
     * JSON on this site. A serialized PHP array is still read, for a site or
     * a MotoPress version that stores one — with every class forbidden,
     * because this is stored data and a serialized object in it must never
     * become an object here. WordPress's own helper would allow one.
     *
     * @param mixed $raw
     * @return array<mixed>|null
     */
    private static function decode($raw): ?array
    {
        if (is_array($raw)) {
            return $raw;
        }

        $text = trim((string) $raw);
        if ($text === '') {
            return null;
        }

        if ($text[0] === '{' || $text[0] === '[') {
            $json = json_decode($text, true);

            return is_array($json) ? $json : null;
        }

        $data = @unserialize($text, ['allowed_classes' => false]);

        return is_array($data) ? $data : null;
    }

    /**
     * One tax bucket, in cents, or null if it cannot be read.
     *
     * A bucket states its own total. Where it does not but lists its parts,
     * the parts are added — `taxes.room.list[m].price`.
     *
     * @param mixed $node
     */
    private static function bucket_cents($node): ?int
    {
        if (is_numeric($node)) {
            return Money::to_cents($node);
        }
        if (!is_array($node)) {
            return null;
        }

        $total = self::amount($node, self::AMOUNT_KEYS);
        if ($total !== null) {
            return $total;
        }

        $list = $node['list'] ?? null;
        if (!is_array($list)) {
            return null;
        }

        $cents = 0;
        foreach ($list as $line) {
            $amount = is_numeric($line) ? Money::to_cents($line) : self::amount(is_array($line) ? $line : [], ['price', 'amount', 'total', 'value']);
            if ($amount === null) {
                return null;
            }
            $cents += $amount;
        }

        return $cents;
    }

    /**
     * The first of these keys holding a number, at the top of this node.
     *
     * @param array<mixed> $node
     * @param string[]     $keys
     */
    private static function amount(array $node, array $keys): ?int
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $node)) {
                continue;
            }
            $value = $node[$key];
            if (is_array($value) || !is_numeric($value)) {
                continue;
            }

            return Money::to_cents($value);
        }

        return null;
    }
}
